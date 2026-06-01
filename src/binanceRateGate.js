import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_LIMIT_PER_MIN = 1200; // ~50% of Binance Futures 2400 weight/min IP cap.
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_BLOCK_BUFFER_MS = 5000;
const DEFAULT_MIN_429_BLOCK_MS = 5 * 60_000;
const DEFAULT_MAX_QUEUE = 2500;
const DEFAULT_HIGH_WATERMARK = 700;

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function compactPath(path) {
  return String(path || 'unknown').replace(/^https?:\/\/[^/]+/i, '');
}

function inferSource() {
  const stack = new Error().stack || '';
  const lines = stack.split('\n').slice(2);
  for (const line of lines) {
    if (line.includes('binanceRateGate.js') || line.includes('binanceClient.js')) continue;
    const m = line.match(/at\s+([^\s(]+)/);
    if (m?.[1]) return m[1].replace(/^async\s+/, '');
  }
  return 'unknown';
}

export class BinanceRestBlockedError extends Error {
  constructor(blockedUntil, reason = 'Binance REST blocked') {
    const remainingSec = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
    super(`${reason}; skip REST for ${remainingSec}s until ${new Date(blockedUntil).toISOString()}`);
    this.name = 'BinanceRestBlockedError';
    this.status = 418;
    this.blockedUntil = blockedUntil;
    this.retryAfterMs = Math.max(0, blockedUntil - Date.now());
  }
}

export class BinanceRestQueueOverflowError extends Error {
  constructor(queueLength, reason = 'Binance REST queue overloaded') {
    super(`${reason}; queue=${queueLength}`);
    this.name = 'BinanceRestQueueOverflowError';
    this.status = 503;
    this.queueLength = queueLength;
  }
}

export class BinanceRateGate {
  constructor({
    limitPerMin = toNumber(process.env.BINANCE_REST_WEIGHT_PER_MIN, DEFAULT_LIMIT_PER_MIN),
    concurrency = toNumber(process.env.BINANCE_REST_CONCURRENCY, DEFAULT_CONCURRENCY),
    blockBufferMs = toNumber(process.env.BINANCE_REST_BLOCK_BUFFER_MS, DEFAULT_BLOCK_BUFFER_MS),
    maxQueue = toNumber(process.env.BINANCE_REST_MAX_QUEUE, DEFAULT_MAX_QUEUE),
    highWatermark = toNumber(process.env.BINANCE_REST_HIGH_WATERMARK, DEFAULT_HIGH_WATERMARK),
  } = {}) {
    this.limitPerMin = Math.max(60, limitPerMin);
    this.concurrency = Math.max(1, Math.floor(concurrency));
    this.blockBufferMs = blockBufferMs;
    this.maxQueue = Math.max(50, Math.floor(maxQueue));
    this.highWatermark = Math.min(this.maxQueue, Math.max(20, Math.floor(highWatermark)));
    this.tokens = this.limitPerMin;
    this.lastRefillAt = Date.now();
    this.queue = [];
    this.active = 0;
    this.pumpTimer = null;
    this.blockedUntil = 0;
    this.blockReason = '';
    this.minuteStats = new Map();
    this.statsTimer = setInterval(() => this.flushStats(), 60_000);
    this.statsTimer.unref?.();
  }

  isBlocked() {
    return Date.now() < this.blockedUntil;
  }

  getBlockedUntil() {
    return this.isBlocked() ? this.blockedUntil : 0;
  }

  snapshot() {
    const queuedBySource = new Map();
    for (const item of this.queue) {
      const key = `${item.meta.source}|${item.meta.method} ${item.meta.path}`;
      const row = queuedBySource.get(key) || { count: 0, weight: 0, priority: item.meta.priority };
      row.count += 1;
      row.weight += item.meta.weight;
      queuedBySource.set(key, row);
    }
    const queueTop = [...queuedBySource.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8);
    return {
      limitPerMin: this.limitPerMin,
      concurrency: this.concurrency,
      maxQueue: this.maxQueue,
      highWatermark: this.highWatermark,
      queue: this.queue.length,
      queueTop,
      active: this.active,
      tokens: Math.floor(this.tokens),
      blockedUntil: this.getBlockedUntil(),
      blockReason: this.isBlocked() ? this.blockReason : '',
      congested: this.isCongested(),
    };
  }

  isCongested() {
    return this.queue.length >= this.highWatermark;
  }

  async schedule(meta, fn) {
    const weight = Math.max(1, Number(meta?.weight ?? 1));
    const priority = Number.isFinite(Number(meta?.priority)) ? Number(meta.priority) : 5;
    const item = {
      meta: {
        method: meta?.method || 'GET',
        path: compactPath(meta?.path),
        weight,
        priority,
        source: meta?.source || inferSource(),
      },
      fn,
    };
    return new Promise((resolve, reject) => {
      const queueLength = this.queue.length;
      if (queueLength >= this.maxQueue) {
        reject(new BinanceRestQueueOverflowError(queueLength, 'Binance REST queue full'));
        return;
      }
      if (meta?.dropOnCongestion && this.isCongested()) {
        reject(new BinanceRestQueueOverflowError(queueLength, 'Binance REST queue congested'));
        return;
      }
      if (this.isCongested()) this.pruneLowPriorityQueue();
      const queued = { ...item, resolve, reject };
      const insertAt = this.queue.findIndex((row) => row.meta.priority > priority);
      if (insertAt >= 0) this.queue.splice(insertAt, 0, queued);
      else this.queue.push(queued);
      this.pump();
    });
  }

  pruneLowPriorityQueue({ minPriority = 7, keepNewest = 40 } = {}) {
    if (this.queue.length < this.highWatermark) return 0;
    const low = [];
    const keep = [];
    for (const item of this.queue) {
      if ((item.meta.priority ?? 5) >= minPriority) low.push(item);
      else keep.push(item);
    }
    const survivors = low.slice(-keepNewest);
    const dropped = low.slice(0, Math.max(0, low.length - survivors.length));
    if (!dropped.length) return 0;
    this.queue = keep.concat(survivors).sort((a, b) => (a.meta.priority ?? 5) - (b.meta.priority ?? 5));
    const err = new BinanceRestQueueOverflowError(this.queue.length, 'Binance REST low-priority queue pruned');
    for (const item of dropped) item.reject(err);
    console.warn(`[BinanceGate] Pruned ${dropped.length} low-priority REST request(s); queue=${this.queue.length}`);
    return dropped.length;
  }

  setBlockedUntil(blockedUntil, reason = 'Binance rate limit') {
    const until = Number(blockedUntil) + this.blockBufferMs;
    if (!Number.isFinite(until) || until <= Date.now()) return;
    const wasLower = until > this.blockedUntil;
    this.blockedUntil = Math.max(this.blockedUntil, until);
    this.blockReason = reason;
    if (wasLower) {
      const sec = Math.ceil((this.blockedUntil - Date.now()) / 1000);
      console.warn(`[BinanceGate] Blocked REST for ${sec}s until ${new Date(this.blockedUntil).toISOString()} (${reason})`);
    }
    this.pump();
  }

  reportRateLimit(error) {
    const now = Date.now();
    const retryAfterMs = Number(error?.retryAfterMs);
    const blockedUntil = Number(error?.blockedUntil);
    const min429BlockMs = toNumber(process.env.BINANCE_REST_MIN_429_BLOCK_MS, DEFAULT_MIN_429_BLOCK_MS);
    const until = Number.isFinite(blockedUntil) && blockedUntil > now
      ? blockedUntil
      : now + (Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 60_000);
    const guardedUntil = (error?.status === 429 || error?.status === 418)
      ? Math.max(until, now + min429BlockMs)
      : until;
    this.setBlockedUntil(guardedUntil, `Binance ${error?.status ?? 'rate-limit'}`);
  }

  resetBlock() {
    if (!this.blockedUntil) return;
    const wasSec = Math.ceil((this.blockedUntil - Date.now()) / 1000);
    this.blockedUntil = 0;
    this.blockReason = '';
    console.warn(`[BinanceGate] Block reset manually (had ${wasSec}s remaining)`);
    this.pump();
  }

  refill() {
    const now = Date.now();
    const elapsed = Math.max(0, now - this.lastRefillAt);
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.limitPerMin, this.tokens + elapsed * (this.limitPerMin / 60_000));
    this.lastRefillAt = now;
  }

  record(meta) {
    const key = `${meta.source}|${meta.method} ${meta.path}`;
    const row = this.minuteStats.get(key) || { count: 0, weight: 0 };
    row.count += 1;
    row.weight += meta.weight;
    this.minuteStats.set(key, row);
  }

  flushStats() {
    if (this.minuteStats.size === 0) return;
    const rows = [...this.minuteStats.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 12);
    const totalWeight = [...this.minuteStats.values()].reduce((sum, row) => sum + row.weight, 0);
    const totalCount = [...this.minuteStats.values()].reduce((sum, row) => sum + row.count, 0);
    console.log(`[BinanceGate] REST last 60s: ${totalCount} req / weight ${totalWeight}/${this.limitPerMin}; top: ${rows.map((r) => `${r.key} x${r.count} w${r.weight}`).join(' | ')}`);
    this.minuteStats.clear();
  }

  pump() {
    if (this.pumpTimer) return;
    this.pumpTimer = setTimeout(() => {
      this.pumpTimer = null;
      this._pumpNow().catch((err) => console.warn('[BinanceGate] pump error:', err.message));
    }, 0);
    this.pumpTimer.unref?.();
  }

  async _pumpNow() {
    this.refill();
    const now = Date.now();
    if (now < this.blockedUntil) {
      const err = new BinanceRestBlockedError(this.blockedUntil, this.blockReason);
      while (this.queue.length) this.queue.shift().reject(err);
      return;
    }

    while (this.queue.length && this.active < this.concurrency) {
      this.refill();
      const next = this.queue[0];
      if (this.tokens < next.meta.weight) {
        const waitMs = Math.max(50, Math.ceil((next.meta.weight - this.tokens) / (this.limitPerMin / 60_000)));
        await delay(waitMs);
        this.pump();
        return;
      }
      this.queue.shift();
      this.tokens -= next.meta.weight;
      this.active += 1;
      this.record(next.meta);
      next.fn()
        .then(next.resolve)
        .catch((err) => {
          if (err?.name === 'BinanceRateLimitError' || err?.status === 429 || err?.status === 418) {
            this.reportRateLimit(err);
          }
          next.reject(err);
        })
        .finally(() => {
          this.active -= 1;
          this.pump();
        });
    }
  }
}

export const binanceRateGate = new BinanceRateGate();
