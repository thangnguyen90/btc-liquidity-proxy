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

  async getTopLongShortPositionRatio(symbol, period = '15m', limit = 1) {
    return this.get('/futures/data/topLongShortPositionRatio', { symbol, period, limit });
  }

  async getTopLongShortAccountRatio(symbol, period = '5m', limit = 50) {
    return this.get('/futures/data/topLongShortAccountRatio', { symbol, period, limit });
  }

  async getPositionMode({ apiKey, apiSecret }) {
    const res = await this.signedRequest('GET', '/fapi/v1/positionSide/dual', {}, { apiKey, apiSecret });
    return res.dualSidePosition; // true = hedge mode
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

  async placeAlgoOrder({ params, apiKey, apiSecret }) {
    return this.signedRequest('POST', '/fapi/v1/algoOrder', params, { apiKey, apiSecret });
  }

  async getBalance({ apiKey, apiSecret, recvWindow = 5000 }) {
    return this.signedRequest('GET', '/fapi/v2/balance', { recvWindow }, { apiKey, apiSecret });
  }

  async getPositions({ apiKey, apiSecret, recvWindow = 5000 }) {
    return this.signedRequest('GET', '/fapi/v2/positionRisk', { recvWindow }, { apiKey, apiSecret });
  }

  async getOpenOrders({ symbol, apiKey, apiSecret, recvWindow = 5000 }) {
    const params = { recvWindow };
    if (symbol) params.symbol = symbol;
    return this.signedRequest('GET', '/fapi/v1/openOrders', params, { apiKey, apiSecret });
  }

  async getUserTrades({ symbol, limit = 50, apiKey, apiSecret, recvWindow = 5000 }) {
    return this.signedRequest('GET', '/fapi/v1/userTrades', { symbol, limit, recvWindow }, { apiKey, apiSecret });
  }

  async getOrder({ symbol, orderId, apiKey, apiSecret, recvWindow = 5000 }) {
    return this.signedRequest('GET', '/fapi/v1/order', { symbol, orderId, recvWindow }, { apiKey, apiSecret });
  }

  async cancelOrder({ symbol, orderId, apiKey, apiSecret, recvWindow = 5000 }) {
    return this.signedRequest('DELETE', '/fapi/v1/order', { symbol, orderId, recvWindow }, { apiKey, apiSecret });
  }

  async getIncome({ startTime, endTime, incomeType, limit = 1000, apiKey, apiSecret, recvWindow = 5000 }) {
    const params = { limit, recvWindow };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;
    if (incomeType) params.incomeType = incomeType;
    return this.signedRequest('GET', '/fapi/v1/income', params, { apiKey, apiSecret });
  }

  async createListenKey({ apiKey }) {
    const res = await fetch(`${this.baseUrl}/fapi/v1/listenKey`, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': apiKey, 'user-agent': 'btc-liquidity-proxy/0.1.0' },
    });
    if (!res.ok) throw new Error(`createListenKey ${res.status}`);
    return res.json();
  }

  async keepAliveListenKey({ listenKey, apiKey }) {
    await fetch(`${this.baseUrl}/fapi/v1/listenKey`, {
      method: 'PUT',
      headers: { 'X-MBX-APIKEY': apiKey, 'Content-Type': 'application/json', 'user-agent': 'btc-liquidity-proxy/0.1.0' },
      body: JSON.stringify({ listenKey }),
    });
  }

  async cancelAllOpenOrders({ symbol, apiKey, apiSecret, recvWindow = 5000 }) {
    return this.signedRequest('DELETE', '/fapi/v1/allOpenOrders', { symbol, recvWindow }, { apiKey, apiSecret });
  }

  async cancelAlgoOrder({ algoId, apiKey, apiSecret, recvWindow = 5000 }) {
    return this.signedRequest('DELETE', '/fapi/v1/algoOrder', { algoId, recvWindow }, { apiKey, apiSecret });
  }

  async getOpenAlgoOrders({ symbol, apiKey, apiSecret, recvWindow = 5000 }) {
    const params = { recvWindow };
    if (symbol) params.symbol = symbol;
    return this.signedRequest('GET', '/fapi/v1/openAlgoOrders', params, { apiKey, apiSecret });
  }

  async getAccountUid({ apiKey, apiSecret, recvWindow = 5000 }) {
    // Spot API endpoint trả về UID
    const params = { recvWindow };
    const payload = { ...params, timestamp: Date.now() };
    const query = new URLSearchParams();
    Object.entries(payload).forEach(([k, v]) => { if (v !== undefined) query.set(k, String(v)); });
    const sig = (await import('node:crypto')).createHmac('sha256', apiSecret).update(query.toString()).digest('hex');
    query.set('signature', sig);
    const res = await fetch(`https://api.binance.com/sapi/v1/account/uid?${query}`, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });
    return res.json();
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
    const useQueryString = method === 'GET' || method === 'DELETE';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    if (useQueryString) {
      query.forEach((value, key) => url.searchParams.set(key, value));
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'btc-liquidity-proxy/0.1.0',
          'X-MBX-APIKEY': apiKey,
        },
        body: useQueryString ? undefined : query.toString(),
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
