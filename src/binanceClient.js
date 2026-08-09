import crypto from 'node:crypto';
import { binanceRateGate } from './binanceRateGate.js';

const FUTURES_BASE_URL = 'https://fapi.binance.com';

function apiKeyFingerprint(apiKey) {
  return crypto.createHash('sha256').update(String(apiKey ?? '')).digest('hex').slice(0, 12);
}

function credentialFingerprint(apiKey, apiSecret) {
  return crypto.createHash('sha256')
    .update(`${String(apiKey ?? '')}\0${String(apiSecret ?? '')}`)
    .digest('hex')
    .slice(0, 12);
}

function stableParamsKey(params = {}) {
  return Object.entries(params)
    .filter(([key, value]) => key !== 'timestamp' && key !== 'signature' && value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export class BinanceRateLimitError extends Error {
  constructor(message, { status, retryAfterMs, blockedUntil }) {
    super(message);
    this.name = 'BinanceRateLimitError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.blockedUntil = blockedUntil;
  }
}

export class BinanceApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'BinanceApiError';
    this.status = status;
    this.code = code;
  }
}

function parseRateLimitMeta(response, bodyText = '') {
  const retryAfter = response.headers.get('retry-after');
  let retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : 60_000;
  let blockedUntil = 0;
  const m = String(bodyText).match(/banned until\s+(\d+)/i);
  if (m) {
    blockedUntil = Number(m[1]);
    retryAfterMs = Math.max(retryAfterMs, blockedUntil - Date.now());
  }
  if (response.status === 418 && !blockedUntil) retryAfterMs = Math.max(retryAfterMs, 2 * 60_000);
  return { retryAfterMs, blockedUntil };
}

async function throwIfRateLimited(response, label) {
  if (response.ok) return;
  const text = await response.text().catch(() => '');
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { msg: text }; }
  if (response.status === 429 || response.status === 418) {
    throw new BinanceRateLimitError(`${label} ${response.status}: ${body?.msg ?? text}`, {
      status: response.status,
      ...parseRateLimitMeta(response, text),
    });
  }
  throw new BinanceApiError(`${label} ${response.status}: ${body?.msg ?? text}`, {
    status: response.status,
    code: Number(body?.code),
  });
}

function endpointWeight(method, path, params = {}) {
  const p = String(path);
  if (p.includes('/fapi/v1/ticker/24hr')) return params?.symbol ? 1 : 40;
  if (p.includes('/fapi/v1/premiumIndex')) return params?.symbol ? 1 : 10;
  if (p.includes('/fapi/v1/klines')) {
    // Binance Futures weight: ceil(limit/100), min 1 — https://binance-docs.github.io/apidocs/futures/en/
    const limit = Number(params?.limit ?? 100);
    if (limit > 500) return 10;
    if (limit > 100) return 5;
    return 2;
  }
  if (p.includes('/fapi/v1/depth')) {
    const limit = Number(params?.limit ?? 100);
    if (limit >= 1000) return 20;
    if (limit >= 500) return 10;
    return 5;
  }
  if (p.includes('/fapi/v2/positionRisk')) return 5;
  if (p.includes('/fapi/v1/openOrders')) return params?.symbol ? 1 : 40;
  if (p.includes('/fapi/v1/openAlgoOrders')) return params?.symbol ? 1 : 40;
  if (p.includes('/fapi/v1/income')) return 30;
  if (p.includes('/futures/data/')) return 1;
  if (method === 'POST' || method === 'DELETE') return 1;
  return 1;
}

export class BinanceClient {
  constructor({ baseUrl = FUTURES_BASE_URL, timeoutMs = 10000, rateGate = null } = {}) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.rateGate = rateGate ?? binanceRateGate; // fallback sang shared singleton
  }

  async getPremiumIndex(symbol, options = {}) {
    return this.get('/fapi/v1/premiumIndex', symbol ? { symbol } : {}, options);
  }

  async getOpenInterest(symbol, options = {}) {
    return this.get('/fapi/v1/openInterest', { symbol }, options);
  }

  async getKlines(symbol, interval, limit, options = {}) {
    const rows = await this.get('/fapi/v1/klines', { symbol, interval, limit }, options);

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

  async getDepth(symbol, limit = 1000, options = {}) {
    const depth = await this.get('/fapi/v1/depth', { symbol, limit }, options);

    return {
      lastUpdateId: depth.lastUpdateId,
      bids: depth.bids.map(([price, quantity]) => [Number(price), Number(quantity)]),
      asks: depth.asks.map(([price, quantity]) => [Number(price), Number(quantity)]),
    };
  }

  async getGlobalLongShortRatio(symbol, period = '15m', limit = 1, options = {}) {
    return this.get('/futures/data/globalLongShortAccountRatio', { symbol, period, limit }, options);
  }

  async getTopLongShortPositionRatio(symbol, period = '15m', limit = 1, options = {}) {
    return this.get('/futures/data/topLongShortPositionRatio', { symbol, period, limit }, options);
  }

  async getTopLongShortAccountRatio(symbol, period = '5m', limit = 50, options = {}) {
    return this.get('/futures/data/topLongShortAccountRatio', { symbol, period, limit }, options);
  }

  async getPositionMode({ apiKey, apiSecret, ...options }) {
    const res = await this.signedRequest('GET', '/fapi/v1/positionSide/dual', {}, { apiKey, apiSecret, ...options });
    return res.dualSidePosition; // true = hedge mode
  }

  async getExchangeInfo(options = {}) {
    return this.get('/fapi/v1/exchangeInfo', {}, options);
  }

  async getTicker24hr(options = {}) {
    return this.get('/fapi/v1/ticker/24hr', {}, options);
  }

  async getTicker24hrSymbol(symbol, options = {}) {
    return this.get('/fapi/v1/ticker/24hr', { symbol }, options);
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

  async getPositions({ apiKey, apiSecret, recvWindow = 5000, ...options }) {
    return this.signedRequest('GET', '/fapi/v2/positionRisk', { recvWindow }, { apiKey, apiSecret, ...options });
  }

  async getOpenOrders({ symbol, apiKey, apiSecret, recvWindow = 5000, ...options }) {
    const params = { recvWindow };
    if (symbol) params.symbol = symbol;
    return this.signedRequest('GET', '/fapi/v1/openOrders', params, { apiKey, apiSecret, ...options });
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
    return this.rateGate.schedule({
      method: 'POST',
      path: '/fapi/v1/listenKey',
      weight: endpointWeight('POST', '/fapi/v1/listenKey'),
      priority: 0,
      requiresAuth: true,
      authScope: `listen:${apiKeyFingerprint(apiKey)}`,
    }, async () => {
      const res = await fetchWithTimeout(`${this.baseUrl}/fapi/v1/listenKey`, {
        method: 'POST',
        headers: { 'X-MBX-APIKEY': apiKey, 'user-agent': 'btc-liquidity-proxy/0.1.0' },
      }, this.timeoutMs);
      await throwIfRateLimited(res, 'createListenKey');
      return res.json();
    });
  }

  async keepAliveListenKey({ listenKey, apiKey }) {
    await this.rateGate.schedule({
      method: 'PUT',
      path: '/fapi/v1/listenKey',
      weight: endpointWeight('PUT', '/fapi/v1/listenKey'),
      priority: 0,
      requiresAuth: true,
      authScope: `listen:${apiKeyFingerprint(apiKey)}`,
    }, async () => {
      const res = await fetchWithTimeout(`${this.baseUrl}/fapi/v1/listenKey`, {
        method: 'PUT',
        headers: { 'X-MBX-APIKEY': apiKey, 'user-agent': 'btc-liquidity-proxy/0.1.0' },
      }, this.timeoutMs);
      await throwIfRateLimited(res, 'keepAliveListenKey');
      return null;
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
    const params = { recvWindow };
    const authScope = `signed:${credentialFingerprint(apiKey, apiSecret)}`;
    return this.rateGate.schedule({
      method: 'GET',
      path: '/sapi/v1/account/uid',
      weight: 1,
      priority: 5,
      dropOnCongestion: true,
      dedupeKey: `${authScope}:/sapi/v1/account/uid?${stableParamsKey(params)}`,
      requiresAuth: true,
      authScope,
    }, async () => {
      const query = new URLSearchParams({ ...params, timestamp: String(Date.now()) });
      const sig = crypto.createHmac('sha256', apiSecret).update(query.toString()).digest('hex');
      query.set('signature', sig);
      const res = await fetchWithTimeout(`https://api.binance.com/sapi/v1/account/uid?${query}`, {
        headers: { 'X-MBX-APIKEY': apiKey },
      }, this.timeoutMs);
      await throwIfRateLimited(res, 'getAccountUid');
      return res.json();
    });
  }

  async signedRequest(method, path, params, {
    apiKey,
    apiSecret,
    priority,
    dropOnCongestion,
    dedupe = true,
    dedupeKey,
    source,
  }) {
    const useQueryString = method === 'GET' || method === 'DELETE';
    const isRead = method === 'GET';
    const authScope = `signed:${credentialFingerprint(apiKey, apiSecret)}`;

    const doFetch = async () => {
      // Timestamp/signature must be created when the task actually leaves the
      // queue; signing before a long wait can exceed recvWindow.
      const payload = { ...params, timestamp: Date.now() };
      const query = new URLSearchParams();
      Object.entries(payload).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
      });
      const signature = crypto.createHmac('sha256', apiSecret).update(query.toString()).digest('hex');
      query.set('signature', signature);
      const url = new URL(path, this.baseUrl);
      if (useQueryString) query.forEach((value, key) => url.searchParams.set(key, value));

      const response = await fetchWithTimeout(url, {
        method,
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'btc-liquidity-proxy/0.1.0',
          'X-MBX-APIKEY': apiKey,
        },
        body: useQueryString ? undefined : query.toString(),
      }, this.timeoutMs);
      const text = await response.text();
      let body = {};
      try { body = text ? JSON.parse(text) : {}; } catch { body = { msg: text }; }

      if (!response.ok) {
        if (response.status === 429 || response.status === 418) {
          throw new BinanceRateLimitError(body?.msg ?? `Binance ${response.status} ${response.statusText}: ${text}`, {
            status: response.status,
            ...parseRateLimitMeta(response, text),
          });
        }
        throw new BinanceApiError(body?.msg ?? `Binance ${response.status} ${response.statusText}`, {
          status: response.status,
          code: Number(body?.code),
        });
      }

      return body;
    };

    return this.rateGate.schedule({
      method,
      path,
      weight: endpointWeight(method, path, params),
      priority: Number.isFinite(Number(priority)) ? Number(priority) : isRead ? 5 : 0,
      dropOnCongestion: dropOnCongestion ?? isRead,
      source,
      dedupeKey: isRead && dedupe !== false
        ? `${authScope}:${dedupeKey ? `custom:${dedupeKey}` : `${path}?${stableParamsKey(params)}`}`
        : '',
      requiresAuth: true,
      authScope,
    }, doFetch);
  }

  async get(path, params = {}, options = {}) {
    const url = new URL(path, this.baseUrl);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });

    const doFetch = async () => {
      const response = await fetchWithTimeout(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'btc-liquidity-proxy/0.1.0',
        },
      }, this.timeoutMs);

      if (!response.ok) {
        const body = await response.text();

        if (response.status === 429 || response.status === 418) {
          throw new BinanceRateLimitError(`Binance ${response.status} ${response.statusText}: ${body}`, {
            status: response.status,
            ...parseRateLimitMeta(response, body),
          });
        }

        throw new Error(`Binance ${response.status} ${response.statusText}: ${body}`);
      }

      return response.json();
    };

    return this.rateGate.schedule({
      method: 'GET',
      path,
      weight: endpointWeight('GET', path, params),
      priority: options.priority,
      dropOnCongestion: options.dropOnCongestion ?? true,
      source: options.source,
      dedupeKey: options.dedupe === false
        ? ''
        : `public:${options.dedupeKey ? `custom:${options.dedupeKey}` : `${path}?${stableParamsKey(params)}`}`,
    }, doFetch);
  }
}
