import WebSocket from 'ws';

const FSTREAM_WS = 'wss://fstream.binance.com';
const MAX_STREAMS_PER_CONN = 200; // well under Binance's 1024 limit

export class KlineCache {
  constructor({ client, maxKlines = 500 }) {
    this.client = client;
    this.maxKlines = maxKlines;
    this._cache = new Map();    // `${SYMBOL}|${interval}` → Kline[]
    this._seeding = new Set();  // keys currently being seeded via REST
    this._conns = new Map();    // streamUrl → WebSocket
  }

  _key(symbol, interval) {
    return `${symbol.toUpperCase()}|${interval}`;
  }

  // Seed REST data + subscribe WebSocket for a list of symbols/interval.
  // Fire-and-forget: callers don't need to await.
  async seed(symbols, interval, limit, { batchSize = 5, batchDelayMs = 600 } = {}) {
    const toSeed = symbols.filter((s) => {
      const k = this._key(s, interval);
      return !this._cache.has(k) && !this._seeding.has(k);
    });

    // Subscribe WS immediately so live ticks start arriving during seeding
    this._subscribe(symbols, interval);

    for (let i = 0; i < toSeed.length; i += batchSize) {
      const batch = toSeed.slice(i, i + batchSize);
      await Promise.all(batch.map(async (symbol) => {
        const k = this._key(symbol, interval);
        this._seeding.add(k);
        try {
          const klines = await this.client.getKlines(symbol, interval, limit);
          // Only write to cache if WS hasn't already populated it with more data
          const existing = this._cache.get(k);
          if (!existing || existing.length < klines.length) {
            this._cache.set(k, klines.slice(-this.maxKlines));
          }
        } catch {
          // Leave unseeded — getKlines() will fall back to REST on access
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
      const url = `${FSTREAM_WS}/stream?streams=${chunk.join('/')}`;
      if (!this._conns.has(url)) this._connect(url);
    }
  }

  _connect(url) {
    const ws = new WebSocket(url);
    this._conns.set(url, ws);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        // Combined stream wraps payload in { stream, data }
        const k = msg.data?.k ?? msg.k;
        if (!k) return;
        this._applyTick(k.s, k.i, k);
      } catch {}
    });

    ws.on('error', () => {});
    ws.on('close', () => {
      this._conns.delete(url);
      setTimeout(() => this._connect(url), 5000);
    });
  }

  _applyTick(symbol, interval, k) {
    const key = this._key(symbol, interval);
    const candle = {
      openTime: Number(k.t),
      open: Number(k.o),
      high: Number(k.h),
      low: Number(k.l),
      close: Number(k.c),
      volume: Number(k.v),
      closeTime: Number(k.T),
      quoteVolume: Number(k.q),
      trades: Number(k.n),
      takerBuyBaseVolume: Number(k.V),
      takerBuyQuoteVolume: Number(k.Q),
    };

    const arr = this._cache.get(key);
    if (!arr) {
      // WS arrived before REST seed
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

  // Drop-in replacement for client.getKlines().
  // Returns cached data instantly; falls back to REST only on cache miss.
  async getKlines(symbol, interval, limit) {
    const key = this._key(symbol, interval);
    const arr = this._cache.get(key);
    if (arr && arr.length > 0) {
      return arr.slice(-limit);
    }
    return this.client.getKlines(symbol, interval, limit);
  }

  // How many symbols are cached for a given interval
  stats(interval) {
    let count = 0;
    for (const k of this._cache.keys()) {
      if (k.endsWith(`|${interval}`)) count++;
    }
    return { interval, cached: count, connections: this._conns.size };
  }
}
