import WebSocket from 'ws';
import { EventEmitter } from 'node:events';

const FSTREAM_WS = 'wss://fstream.binance.com';
const MAX_STREAMS_PER_CONN = 200;
const STALE_MS   = 3 * 60 * 1000;  // force reconnect if no tick for 3 min
const PING_MS    = 2 * 60 * 1000;  // send ping every 2 min to keep alive

export class KlineCache extends EventEmitter {
  constructor({ client, maxKlines = 500 }) {
    super();
    this.client    = client;
    this.maxKlines = maxKlines;
    this._cache    = new Map();   // `${SYMBOL}|${interval}` → Kline[]
    this._seeding  = new Set();   // keys currently being seeded via REST
    this._conns    = new Map();   // streamUrl → { ws, lastTickAt, pingTimer, staleTimer }
    this.lastTickAt = 0;          // timestamp of most recent tick across all streams
  }

  _key(symbol, interval) {
    return `${symbol.toUpperCase()}|${interval}`;
  }

  async seed(symbols, interval, limit, { batchSize = 5, batchDelayMs = 600 } = {}) {
    const toSeed = symbols.filter((s) => {
      const k = this._key(s, interval);
      return !this._cache.has(k) && !this._seeding.has(k);
    });

    this._subscribe(symbols, interval);

    for (let i = 0; i < toSeed.length; i += batchSize) {
      const batch = toSeed.slice(i, i + batchSize);
      await Promise.all(batch.map(async (symbol) => {
        const k = this._key(symbol, interval);
        this._seeding.add(k);
        try {
          const klines = await this.client.getKlines(symbol, interval, limit);
          const existing = this._cache.get(k);
          if (!existing || existing.length < klines.length) {
            this._cache.set(k, klines.slice(-this.maxKlines));
          }
        } catch {
          // leave unseeded — getKlines() will fall back to REST on access
        } finally {
          this._seeding.delete(k);
        }
      }));
      if (i + batchSize < toSeed.length) {
        await new Promise((r) => setTimeout(r, batchDelayMs));
      }
    }

    const seeded = symbols.filter((s) => this._cache.has(this._key(s, interval))).length;
    console.log(`[KlineCache] Seeded ${seeded}/${symbols.length} symbols @ ${interval}`);
  }

  _subscribe(symbols, interval) {
    const streams = symbols.map((s) => `${s.toLowerCase()}@kline_${interval}`);
    for (let i = 0; i < streams.length; i += MAX_STREAMS_PER_CONN) {
      const chunk = streams.slice(i, i + MAX_STREAMS_PER_CONN);
      const url   = `${FSTREAM_WS}/stream?streams=${chunk.join('/')}`;
      if (!this._conns.has(url)) this._connect(url);
    }
  }

  _connect(url) {
    const ws = new WebSocket(url);
    const entry = { ws, lastTickAt: Date.now(), pingTimer: null, staleTimer: null };
    this._conns.set(url, entry);

    ws.on('open', () => {
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
        this._resetStaleTimer(url, entry);
        const closed = k.x === true;
        this._applyTick(k.s, k.i, k);
        if (closed) this.emit('candleClose', { symbol: k.s, interval: k.i });
        else this.emit('candleTick', { symbol: k.s, interval: k.i });
      } catch {}
    });

    ws.on('error', () => {});
    ws.on('close', () => {
      this._clearTimers(entry);
      this._conns.delete(url);
      setTimeout(() => this._connect(url), 5_000);
    });
  }

  _resetStaleTimer(url, entry) {
    clearTimeout(entry.staleTimer);
    entry.staleTimer = setTimeout(() => {
      console.warn(`[KlineCache] Stale WS detected (no tick for ${STALE_MS / 1000}s), reconnecting: ${url.slice(0, 80)}...`);
      entry.ws.terminate(); // triggers 'close' → reconnect
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

  async getKlines(symbol, interval, limit) {
    const key = this._key(symbol, interval);
    const arr = this._cache.get(key);
    if (arr && arr.length > 0) return arr.slice(-limit);
    return this.client.getKlines(symbol, interval, limit);
  }

  getIfCached(symbol, interval, limit) {
    const arr = this._cache.get(this._key(symbol, interval));
    if (!arr || arr.length === 0) return null;
    return arr.slice(-limit);
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
