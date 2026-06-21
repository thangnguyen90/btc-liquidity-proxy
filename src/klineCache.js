import WebSocket from 'ws';
import { EventEmitter } from 'node:events';

const FSTREAM_WS = 'wss://fstream.binancefuture.com';
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
  constructor({ client, maxKlines = 500 }) {
    super();
    this.client    = client;
    this.maxKlines = maxKlines;
    this._cache    = new Map();   // `${SYMBOL}|${interval}` → Kline[]
    this._seeding  = new Set();   // keys currently being seeded via REST
    this._conns    = new Map();   // streamUrl → { ws, lastTickAt, pingTimer, staleTimer, backoffMs }
    this._subscribed = new Set(); // `${SYMBOL}|${interval}` streams already opened
    this.lastTickAt = 0;          // timestamp of most recent tick across all streams
  }

  _key(symbol, interval) {
    return `${symbol.toUpperCase()}|${interval}`;
  }

  async seed(symbols, interval, limit, { batchSize = 5, batchDelayMs = 600 } = {}) {
    const toSeed = symbols.filter((s) => {
      const k = this._key(s, interval);
      const existing = this._cache.get(k);
      const targetLength = Math.min(limit, this.maxKlines);
      return (!existing || existing.length < targetLength) && !this._seeding.has(k);
    });

    this._subscribe(symbols, interval);

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
          if (!existing || existing.length < klines.length) {
            this._cache.set(k, klines.slice(-this.maxKlines));
          }
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

  _connect(url) {
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.warn(`[KlineCache] WS create failed: ${e.message}. Retrying in ${BACKOFF_BASE_MS / 1000}s`);
      setTimeout(() => this._connect(url), BACKOFF_BASE_MS);
      return;
    }

    const entry = { ws, lastTickAt: Date.now(), pingTimer: null, staleTimer: null, backoffMs: BACKOFF_BASE_MS };
    this._conns.set(url, entry);

    ws.on('open', () => {
      entry.backoffMs = BACKOFF_BASE_MS; // reset backoff on successful connect
      // Ping every 2 min so Binance doesn't treat connection as idle
      entry.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.ping();
      }, PING_MS);

      // Stale guard: if no tick arrives for STALE_MS, force reconnect
      this._resetStaleTimer(url, entry);
    });

    ws.on('pong', () => {
      // Connection confirmed alive — reset stale timer
      entry.lastTickAt = Date.now();
      this._resetStaleTimer(url, entry);
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        const k   = msg.data?.k ?? msg.k;
        if (!k) return;
        entry.lastTickAt = Date.now();
        this.lastTickAt  = entry.lastTickAt;
        entry.backoffMs  = BACKOFF_BASE_MS; // data received → reset backoff
        this._resetStaleTimer(url, entry);
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
      this._conns.delete(url);
      const delay = entry.backoffMs ?? BACKOFF_BASE_MS;
      // Increase backoff for next attempt (exponential, capped)
      entry.backoffMs = Math.min((entry.backoffMs ?? BACKOFF_BASE_MS) * BACKOFF_MULT, BACKOFF_MAX_MS);
      if (delay > BACKOFF_BASE_MS) {
        console.log(`[KlineCache] Reconnecting in ${Math.round(delay / 1000)}s (backoff)…`);
      }
      setTimeout(() => this._connect(url), delay);
    });
  }

  _resetStaleTimer(url, entry) {
    clearTimeout(entry.staleTimer);
    entry.staleTimer = setTimeout(() => {
      const staleSec = Math.round(STALE_MS / 1000);
      console.warn(`[KlineCache] Stale WS detected (no tick for ${staleSec}s), reconnecting: ${url.slice(0, 80)}...`);
      entry.ws.terminate(); // triggers 'close' → reconnect with backoff
    }, STALE_MS);
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

  stats(interval) {
    let count = 0;
    for (const k of this._cache.keys()) {
      if (k.endsWith(`|${interval}`)) count++;
    }
    const staleSec = this.lastTickAt > 0
      ? Math.floor((Date.now() - this.lastTickAt) / 1000)
      : null;
    return {
      interval,
      cached:      count,
      connections: this._conns.size,
      lastTickAt:  this.lastTickAt || null,
      staleSec,
      isStale:     staleSec == null || staleSec > STALE_MS / 1000,
    };
  }
}
