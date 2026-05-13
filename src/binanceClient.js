import crypto from 'node:crypto';

const FUTURES_BASE_URL = 'https://fapi.binance.com';

export class BinanceRateLimitError extends Error {
  constructor(message, { status, retryAfterMs }) {
    super(message);
    this.name = 'BinanceRateLimitError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export class BinanceClient {
  constructor({ baseUrl = FUTURES_BASE_URL, timeoutMs = 10000 } = {}) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  async getPremiumIndex(symbol) {
    return this.get('/fapi/v1/premiumIndex', symbol ? { symbol } : {});
  }

  async getOpenInterest(symbol) {
    return this.get('/fapi/v1/openInterest', { symbol });
  }

  async getKlines(symbol, interval, limit) {
    const rows = await this.get('/fapi/v1/klines', { symbol, interval, limit });

    return rows.map((row) => ({
      openTime: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      closeTime: Number(row[6]),
      quoteVolume: Number(row[7]),
      trades: Number(row[8]),
      takerBuyBaseVolume: Number(row[9]),
      takerBuyQuoteVolume: Number(row[10]),
    }));
  }

  async getDepth(symbol, limit = 1000) {
    const depth = await this.get('/fapi/v1/depth', { symbol, limit });

    return {
      lastUpdateId: depth.lastUpdateId,
      bids: depth.bids.map(([price, quantity]) => [Number(price), Number(quantity)]),
      asks: depth.asks.map(([price, quantity]) => [Number(price), Number(quantity)]),
    };
  }

  async getGlobalLongShortRatio(symbol, period = '15m', limit = 1) {
    return this.get('/futures/data/globalLongShortAccountRatio', { symbol, period, limit });
  }

  async getExchangeInfo() {
    return this.get('/fapi/v1/exchangeInfo');
  }

  async getTicker24hr() {
    return this.get('/fapi/v1/ticker/24hr');
  }

  async setLeverage({ symbol, leverage, apiKey, apiSecret, recvWindow = 5000 }) {
    return this.signedRequest('POST', '/fapi/v1/leverage', {
      symbol,
      leverage,
      recvWindow,
    }, { apiKey, apiSecret });
  }

  async placeFuturesOrder({ params, apiKey, apiSecret }) {
    return this.signedRequest('POST', '/fapi/v1/order', params, { apiKey, apiSecret });
  }

  async signedRequest(method, path, params, { apiKey, apiSecret }) {
    const payload = {
      ...params,
      timestamp: Date.now(),
    };
    const query = new URLSearchParams();

    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value));
      }
    });

    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(query.toString())
      .digest('hex');

    query.set('signature', signature);

    const url = new URL(path, this.baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'btc-liquidity-proxy/0.1.0',
          'X-MBX-APIKEY': apiKey,
        },
        body: query.toString(),
        signal: controller.signal,
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(body?.msg ?? `Binance ${response.status} ${response.statusText}`);
      }

      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  async get(path, params = {}) {
    const url = new URL(path, this.baseUrl);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'btc-liquidity-proxy/0.1.0',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        const retryAfter = response.headers.get('retry-after');
        const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : 60000;

        if (response.status === 429 || response.status === 418) {
          throw new BinanceRateLimitError(`Binance ${response.status} ${response.statusText}: ${body}`, {
            status: response.status,
            retryAfterMs,
          });
        }

        throw new Error(`Binance ${response.status} ${response.statusText}: ${body}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
