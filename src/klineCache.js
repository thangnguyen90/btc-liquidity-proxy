import WebSocket from 'ws';
import { EventEmitter } from 'node:events';

export const KLINE_CACHE_MANAGED_LIVE_GROUP_VERSION =
  'KLINE_CACHE_MANAGED_LIVE_GROUP_V1_20260819';

const FSTREAM_WS = process.env.BINANCE_FSTREAM_MARKET_WS_BASE
  ?? 'wss://fstream.binance.com/market';
const MAX_STREAMS_PER_CONN = 200;
const STALE_MS   = 3 * 60 * 1000;  // force reconnect if no tick for 3 min
const PING_MS    = 2 * 60 * 1000;  // send ping every 2 min to keep alive

// Exponential backoff config
const BACKOFF_BASE_MS  = 5_000;
const BACKOFF_MAX_MS   = 5 * 60_000; // max 5 min between retries
const BACKOFF_MULT     = 2;
// Ban-like HTTP status codes → wait long before retry
const BAN_WAIT_MS      = 3 * 60_000;

export class KlineCache extends EventEmitter {
  constructor({ client, maxKlines = 500, now = () => Date.now(), WebSocketImpl = WebSocket } = {}) {
    super();
    this.client    = client;
    this.maxKlines = maxKlines;
    this.now       = now;
    this.WebSocketImpl = WebSocketImpl;
    this._cache    = new Map();   // `${SYMBOL}|${interval}` → Kline[]
    this._seeding  = new Set();   // keys currently being seeded via REST
    this._conns    = new Map();   // streamUrl → { ws, lastTickAt, pingTimer, staleTimer, backoffMs }
    this._subscribed = new Set(); // `${SYMBOL}|${interval}` streams already opened
    this._managedGroups = new Map(); // group key -> dedicated combined-stream connections
    this.lastTickAt = 0;          // timestamp of most recent tick across all streams
    this._lastTickByInterval = new Map();
    this._lastTickByKey = new Map();
  }

  _key(symbol, interval) {
    return `${symbol.toUpperCase()}|${interval}`;
  }

  _lastClosedAt(symbol, interval, now = this.now()) {
    const rows = this._cache.get(this._key(symbol, interval)) ?? [];
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const closeTime = Number(rows[index]?.closeTime);
      if (Number.isFinite(closeTime) && closeTime > 0 && closeTime <= now) return closeTime;
    }
    return null;
  }

  needsRefresh(symbols, interval, minBars, maxAgeMs, now = this.now()) {
    const requiredBars = Math.max(0, Number(minBars) || 0);
    const allowedAgeMs = Number(maxAgeMs);
    return [...new Set(Array.isArray(symbols) ? symbols : [])].filter((symbol) => {
      const rows = this._cache.get(this._key(symbol, interval)) ?? [];
      if (rows.length < requiredBars) return true;
      if (!Number.isFinite(allowedAgeMs) || allowedAgeMs <= 0) return false;
      const lastClosedAt = this._lastClosedAt(symbol, interval, now);
      return lastClosedAt == null || now - lastClosedAt > allowedAgeMs;
    });
  }

  async seed(symbols, interval, limit, {
    batchSize = 5,
    batchDelayMs = 600,
    maxAgeMs = null,
    force = false,
    subscribe = true,
  } = {}) {
    const now = this.now();
    const allowedAgeMs = Number(maxAgeMs);
    const toSeed = symbols.filter((s) => {
      const k = this._key(s, interval);
      const existing = this._cache.get(k);
      const targetLength = Math.min(limit, this.maxKlines);
      const lastClosedAt = Number.isFinite(allowedAgeMs) && allowedAgeMs > 0
        ? this._lastClosedAt(s, interval, now)
        : null;
      const stale = Number.isFinite(allowedAgeMs) && allowedAgeMs > 0
        && (lastClosedAt == null || now - lastClosedAt > allowedAgeMs);
      return (force || !existing || existing.length < targetLength || stale) && !this._seeding.has(k);
    });

    if (subscribe) this._subscribe(symbols, interval);

    for (let i = 0; i < toSeed.length; i += batchSize) {
      const batch = toSeed.slice(i, i + batchSize);
      await Promise.all(batch.map(async (symbol) => {
        const k = this._key(symbol, interval);
        this._seeding.add(k);
        try {
          const klines = await this.client.getKlines(symbol, interval, limit, {
            priority: 8,
            dropOnCongestion: true,
            source: `KlineCache.seed:${interval}`,
          });
          const existing = this._cache.get(k);
          const merged = new Map();
          for (const row of [...(existing ?? []), ...(Array.isArray(klines) ? klines : [])]) {
            const openTime = Number(row?.openTime);
            if (!Number.isFinite(openTime)) continue;
            merged.set(openTime, row);
          }
          const next = [...merged.values()]
            .sort((a, b) => Number(a.openTime) - Number(b.openTime))
            .slice(-this.maxKlines);
          if (next.length) this._cache.set(k, next);
        } catch {
          // leave unseeded — readers stay cache-only to avoid periodic REST storms
        } finally {
          this._seeding.delete(k);
        }
      }));
      if (i + batchSize < toSeed.length) {
        await new Promise((r) => setTimeout(r, batchDelayMs));
      }
    }

    const targetLength = Math.min(limit, this.maxKlines);
    const seeded = symbols.filter((s) => (this._cache.get(this._key(s, interval))?.length ?? 0) >= targetLength).length;
    console.log(`[KlineCache] Seeded ${seeded}/${symbols.length} symbols @ ${interval} (${targetLength} bars)`);
  }

  subscribe(symbols, interval) {
    this._subscribe(symbols, interval);
  }

  subscribeGroup(groupInput, symbolsInput, interval) {
    const group = String(groupInput ?? '').trim();
    if (!group) throw new Error('managed kline group is required');
    const symbols = [...new Set((Array.isArray(symbolsInput) ? symbolsInput : [])
      .map((symbol) => String(symbol ?? '').trim().toUpperCase())
      .filter(Boolean))].sort();
    const groupKey = `${group}|${interval}`;
    const signature = symbols.join('/');
    const previous = this._managedGroups.get(groupKey);
    if (previous?.signature === signature) {
      return {
        version: KLINE_CACHE_MANAGED_LIVE_GROUP_VERSION,
        group,
        interval,
        symbols: symbols.length,
        connections: previous.connectionKeys.length,
        changed: false,
      };
    }

    for (const connectionKey of previous?.connectionKeys ?? []) this._disconnect(connectionKey);
    const streams = symbols.map((symbol) => `${symbol.toLowerCase()}@kline_${interval}`);
    const connectionKeys = [];
    for (let index = 0; index < streams.length; index += MAX_STREAMS_PER_CONN) {
      const chunk = streams.slice(index, index + MAX_STREAMS_PER_CONN);
      const connectionKey = `managed:${groupKey}:${Math.floor(index / MAX_STREAMS_PER_CONN)}`;
      connectionKeys.push(connectionKey);
      this._connect(`${FSTREAM_WS}/stream?streams=${chunk.join('/')}`, { connectionKey });
    }
    this._managedGroups.set(groupKey, { signature, symbols, connectionKeys });
    return {
      version: KLINE_CACHE_MANAGED_LIVE_GROUP_VERSION,
      group,
      interval,
      symbols: symbols.length,
      connections: connectionKeys.length,
      changed: true,
    };
  }

  liveCoverage(symbolsInput, interval, now = this.now()) {
    const symbols = [...new Set((Array.isArray(symbolsInput) ? symbolsInput : [])
      .map((symbol) => String(symbol ?? '').trim().toUpperCase())
      .filter(Boolean))];
    const missingSymbols = [];
    let live = 0;
    let ticked = 0;
    let newestTickAt = 0;
    for (const symbol of symbols) {
      const key = this._key(symbol, interval);
      const rows = this._cache.get(key) ?? [];
      const closeTime = Number(rows.at(-1)?.closeTime);
      if (Number.isFinite(closeTime) && closeTime > now) live += 1;
      else missingSymbols.push(symbol);
      const tickAt = Number(this._lastTickByKey.get(key) ?? 0);
      if (tickAt > 0) {
        ticked += 1;
        newestTickAt = Math.max(newestTickAt, tickAt);
      }
    }
    return {
      version: KLINE_CACHE_MANAGED_LIVE_GROUP_VERSION,
      interval,
      evaluatedAt: now,
      total: symbols.length,
      live,
      missing: missingSymbols.length,
      coveragePct: symbols.length ? Number((live / symbols.length * 100).toFixed(1)) : 100,
      ticked,
      newestTickAt: newestTickAt || null,
      newestTickAgeMs: newestTickAt > 0 ? Math.max(0, now - newestTickAt) : null,
      missingSymbols: missingSymbols.slice(0, 20),
    };
  }

  _subscribe(symbols, interval) {
    const streams = [];
    for (const symbol of symbols) {
      const key = this._key(symbol, interval);
      if (this._subscribed.has(key)) continue;
      this._subscribed.add(key);
      streams.push(`${symbol.toLowerCase()}@kline_${interval}`);
    }
    if (streams.length === 0) return;
    for (let i = 0; i < streams.length; i += MAX_STREAMS_PER_CONN) {
      const chunk = streams.slice(i, i + MAX_STREAMS_PER_CONN);
      const url   = `${FSTREAM_WS}/stream?streams=${chunk.join('/')}`;
      if (!this._conns.has(url)) this._connect(url);
    }
  }

  _connect(url, { connectionKey = url } = {}) {
    if (this._conns.has(connectionKey)) return;
    let ws;
    try {
      ws = new this.WebSocketImpl(url);
    } catch (e) {
      console.warn(`[KlineCache] WS create failed: ${e.message}. Retrying in ${BACKOFF_BASE_MS / 1000}s`);
      setTimeout(() => this._connect(url, { connectionKey }), BACKOFF_BASE_MS);
      return;
    }

    const entry = {
      ws,
      url,
      connectionKey,
      disabled: false,
      lastTickAt: 0,
      pingTimer: null,
      staleTimer: null,
      backoffMs: BACKOFF_BASE_MS,
    };
    this._conns.set(connectionKey, entry);

    ws.on('open', () => {
      entry.backoffMs = BACKOFF_BASE_MS; // reset backoff on successful connect
      // Ping every 2 min so Binance doesn't treat connection as idle
      entry.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.ping();
      }, PING_MS);

      // Stale guard: if no tick arrives for STALE_MS, force reconnect
      this._resetStaleTimer(connectionKey, entry);
    });

    ws.on('pong', () => {
      // Transport pong is intentionally ignored for data-freshness purposes.
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        const k   = msg.data?.k ?? msg.k;
        if (!k) return;
        entry.lastTickAt = this.now();
        this.lastTickAt  = entry.lastTickAt;
        this._lastTickByInterval.set(k.i, entry.lastTickAt);
        this._lastTickByKey.set(this._key(k.s, k.i), entry.lastTickAt);
        entry.backoffMs  = BACKOFF_BASE_MS; // data received → reset backoff
        this._resetStaleTimer(connectionKey, entry);
        const closed = k.x === true;
        this._applyTick(k.s, k.i, k);
        if (closed) this.emit('candleClose', { symbol: k.s, interval: k.i });
        else this.emit('candleTick', { symbol: k.s, interval: k.i });
      } catch {}
    });

    ws.on('error', (err) => {
      // Detect IP ban / rate limit via HTTP status in error message
      const msg = err?.message ?? '';
      const isBan = /Unexpected server response: (418|429|403)/.test(msg)
                 || msg.includes('ECONNREFUSED')
                 || msg.includes('ECONNRESET');
      if (isBan) {
        entry.backoffMs = BAN_WAIT_MS;
        console.warn(`[KlineCache] ⛔ Ban/rate-limit detected (${msg.slice(0, 60)}). Waiting ${BAN_WAIT_MS / 60000}min before retry.`);
      }
    });

    ws.on('close', () => {
      this._clearTimers(entry);
      if (this._conns.get(connectionKey) === entry) this._conns.delete(connectionKey);
      if (entry.disabled) return;
      const delay = entry.backoffMs ?? BACKOFF_BASE_MS;
      // Increase backoff for next attempt (exponential, capped)
      entry.backoffMs = Math.min((entry.backoffMs ?? BACKOFF_BASE_MS) * BACKOFF_MULT, BACKOFF_MAX_MS);
      if (delay > BACKOFF_BASE_MS) {
        console.log(`[KlineCache] Reconnecting in ${Math.round(delay / 1000)}s (backoff)…`);
      }
      setTimeout(() => this._connect(url, { connectionKey }), delay);
    });
  }

  _resetStaleTimer(connectionKey, entry) {
    clearTimeout(entry.staleTimer);
    entry.staleTimer = setTimeout(() => {
      const staleSec = Math.round(STALE_MS / 1000);
      console.warn(`[KlineCache] Stale WS detected (no tick for ${staleSec}s), reconnecting: ${entry.url.slice(0, 80)}...`);
      entry.ws.terminate(); // triggers 'close' → reconnect with backoff
    }, STALE_MS);
  }

  _disconnect(connectionKey) {
    const entry = this._conns.get(connectionKey);
    if (!entry) return;
    entry.disabled = true;
    this._clearTimers(entry);
    if (this._conns.get(connectionKey) === entry) this._conns.delete(connectionKey);
    try {
      entry.ws.terminate();
    } catch {}
  }

  _clearTimers(entry) {
    clearInterval(entry.pingTimer);
    clearTimeout(entry.staleTimer);
  }

  _applyTick(symbol, interval, k) {
    const key    = this._key(symbol, interval);
    const candle = {
      openTime:             Number(k.t),
      open:                 Number(k.o),
      high:                 Number(k.h),
      low:                  Number(k.l),
      close:                Number(k.c),
      volume:               Number(k.v),
      closeTime:            Number(k.T),
      quoteVolume:          Number(k.q),
      trades:               Number(k.n),
      takerBuyBaseVolume:   Number(k.V),
      takerBuyQuoteVolume:  Number(k.Q),
    };

    const arr = this._cache.get(key);
    if (!arr) {
      this._cache.set(key, [candle]);
      return;
    }

    const last = arr[arr.length - 1];
    if (!last || candle.openTime > last.openTime) {
      arr.push(candle);
      if (arr.length > this.maxKlines) arr.shift();
    } else if (candle.openTime === last.openTime) {
      arr[arr.length - 1] = candle;
    }
  }

  async getKlines(symbol, interval, limit, { fallbackRest = false } = {}) {
    const key = this._key(symbol, interval);
    const arr = this._cache.get(key);
    if (arr && arr.length > 0) return arr.slice(-limit);
    if (fallbackRest) {
      return this.client.getKlines(symbol, interval, limit, {
        priority: 8,
        dropOnCongestion: true,
        source: `KlineCache.fallback:${interval}`,
      });
    }
    return null;
  }

  getIfCached(symbol, interval, limit) {
    const arr = this._cache.get(this._key(symbol, interval));
    if (!arr || arr.length === 0) return null;
    return arr.slice(-limit);
  }

  countReady(symbols, interval, minBars) {
    return symbols.filter((symbol) => (this._cache.get(this._key(symbol, interval))?.length ?? 0) >= minBars).length;
  }

  missingReady(symbols, interval, minBars) {
    return this.needsRefresh(symbols, interval, minBars, null);
  }

  stats(interval) {
    let count = 0;
    for (const k of this._cache.keys()) {
      if (k.endsWith(`|${interval}`)) count++;
    }
    const intervalLastTickAt = Number(this._lastTickByInterval.get(interval) ?? 0);
    const staleSec = intervalLastTickAt > 0
      ? Math.floor((this.now() - intervalLastTickAt) / 1000)
      : null;
    return {
      interval,
      cached:      count,
      connections: this._conns.size,
      lastTickAt:  intervalLastTickAt || null,
      staleSec,
      isStale:     staleSec == null || staleSec > STALE_MS / 1000,
    };
  }
}
