#!/usr/bin/env node

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BinanceClient, BinanceRateLimitError } from './binanceClient.js';
import { loadEnv } from './env.js';
import { fetchAnalysis, normalizeSymbol } from './marketAnalysis.js';

loadEnv();

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const publicDir = join(rootDir, 'public');
const client = new BinanceClient({
  baseUrl: process.env.BINANCE_FUTURES_BASE_URL || undefined,
});
const symbolCache = {
  data: null,
  expiresAt: 0,
};
const autoTradeState = {
  startedAt: null,
  lastScanAt: null,
  lastOrders: [],
  lastErrors: [],
  firstSeenPrices: new Map(),
  symbolCooldowns: new Map(),
};
const port = Number(process.env.PORT ?? 19082);

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host}`);

    if (requestUrl.pathname === '/api/symbols') {
      await sendJson(response, await getSymbols());
      return;
    }

    if (requestUrl.pathname === '/api/market-snapshot') {
      await sendJson(response, await getMarketSnapshot());
      return;
    }

    if (requestUrl.pathname === '/api/analyze') {
      const symbol = normalizeSymbol(requestUrl.searchParams.get('symbol') ?? 'BTCUSDT');
      const interval = requestUrl.searchParams.get('interval') ?? '15m';
      const analysis = await fetchAnalysis({
        client,
        symbol,
        interval,
        limit: Number(requestUrl.searchParams.get('limit') ?? 192),
        rangePct: Number(requestUrl.searchParams.get('rangePct') ?? 0.04),
        binSizePct: Number(requestUrl.searchParams.get('binSizePct') ?? 0.001),
        depthLimit: Number(requestUrl.searchParams.get('depthLimit') ?? 500),
      });

      await sendJson(response, analysis);
      return;
    }

    if (requestUrl.pathname === '/api/order' && request.method === 'POST') {
      await sendJson(response, await placeOrder(await readJsonBody(request)));
      return;
    }

    if (requestUrl.pathname === '/api/auto-trade/status') {
      await sendJson(response, getAutoTradeStatus());
      return;
    }

    await sendStatic(requestUrl.pathname, response);
  } catch (error) {
    const status = error instanceof BinanceRateLimitError ? error.status : 500;
    const retryAfterSeconds = error instanceof BinanceRateLimitError ? Math.ceil(error.retryAfterMs / 1000) : null;

    if (retryAfterSeconds) {
      response.setHeader('Retry-After', String(retryAfterSeconds));
    }

    await sendJson(response, {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, status);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`BTC liquidity proxy web app: http://127.0.0.1:${port}`);
  startAutoTrader();
});

async function getSymbols() {
  if (symbolCache.data && Date.now() < symbolCache.expiresAt) {
    return symbolCache.data;
  }

  const exchangeInfo = await client.getExchangeInfo();
  const symbols = exchangeInfo.symbols
    .filter((item) => item.contractType === 'PERPETUAL' && item.quoteAsset === 'USDT' && item.status === 'TRADING')
    .map((item) => ({
      symbol: item.symbol,
      baseAsset: item.baseAsset,
      quoteAsset: item.quoteAsset,
      quantityPrecision: item.quantityPrecision,
      filters: item.filters,
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  symbolCache.data = symbols;
  symbolCache.expiresAt = Date.now() + 60 * 60 * 1000;

  return symbols;
}

async function placeOrder(payload) {
  const symbol = normalizeSymbol(payload.symbol ?? '');
  const side = String(payload.side ?? '').toUpperCase();
  const orderType = String(payload.orderType ?? payload.type ?? 'MARKET').toUpperCase();
  const notionalUsdt = Number(payload.notionalUsdt);
  const leverage = Math.max(1, Math.min(125, Number(payload.leverage ?? 1)));
  const dryRun = payload.dryRun !== false;
  const limitPrice = payload.limitPrice === undefined || payload.limitPrice === null || payload.limitPrice === ''
    ? null
    : Number(payload.limitPrice);
  const takeProfitPrice = payload.takeProfitPrice === undefined || payload.takeProfitPrice === null
    ? null
    : Number(payload.takeProfitPrice);
  const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);

  if (!['BUY', 'SELL'].includes(side)) {
    throw new Error('Invalid order side.');
  }

  if (!['MARKET', 'LIMIT'].includes(orderType)) {
    throw new Error('Invalid order type.');
  }

  if (!Number.isFinite(notionalUsdt) || notionalUsdt <= 0) {
    throw new Error('Order notional must be greater than 0.');
  }

  if (orderType === 'LIMIT' && (!Number.isFinite(limitPrice) || limitPrice <= 0)) {
    throw new Error('Limit price must be greater than 0.');
  }

  const [symbols, premiumIndex] = await Promise.all([
    getSymbols(),
    client.getPremiumIndex(symbol),
  ]);
  const symbolInfo = symbols.find((item) => item.symbol === symbol);

  if (!symbolInfo) {
    throw new Error(`Symbol ${symbol} is not a trading USDT perpetual futures symbol.`);
  }

  const markPrice = Number(premiumIndex.markPrice);
  const roundedLimitPrice = limitPrice
    ? priceFromTick(symbolInfo, limitPrice)
    : null;
  const executionPrice = roundedLimitPrice ? Number(roundedLimitPrice) : markPrice;
  const quantity = quantityFromNotional(symbolInfo, notionalUsdt, executionPrice);
  const roundedTakeProfitPrice = takeProfitPrice
    ? priceFromTick(symbolInfo, takeProfitPrice)
    : null;
  const plannedOrder = {
    enabled: process.env.BINANCE_ORDER_ENABLED === 'true',
    dryRun,
    baseUrl: process.env.BINANCE_FUTURES_BASE_URL ?? 'https://fapi.binance.com',
    symbol,
    side,
    type: orderType,
    notionalUsdt,
    markPrice,
    limitPrice: roundedLimitPrice,
    quantity,
    leverage,
    takeProfitPrice: roundedTakeProfitPrice,
  };

  if (dryRun || process.env.BINANCE_ORDER_ENABLED !== 'true') {
    return {
      status: 'planned',
      message: dryRun
        ? 'Dry run only. No order was sent to Binance.'
        : 'BINANCE_ORDER_ENABLED is not true. No order was sent to Binance.',
      order: plannedOrder,
    };
  }

  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('Missing BINANCE_API_KEY or BINANCE_API_SECRET in .env.');
  }

  const orderParams = {
    symbol,
    side,
    type: orderType,
    quantity,
    recvWindow,
    newClientOrderId: `lp_${Date.now()}`,
  };

  if (orderType === 'LIMIT') {
    orderParams.price = roundedLimitPrice;
    orderParams.timeInForce = 'GTC';
  }
  const takeProfitParams = roundedTakeProfitPrice ? {
    symbol,
    side: side === 'BUY' ? 'SELL' : 'BUY',
    type: 'TAKE_PROFIT_MARKET',
    stopPrice: roundedTakeProfitPrice,
    quantity,
    reduceOnly: 'true',
    workingType: 'MARK_PRICE',
    recvWindow,
    newClientOrderId: `lp_tp_${Date.now()}`,
  } : null;
  const leverageResult = await client.setLeverage({
    symbol,
    leverage,
    apiKey,
    apiSecret,
    recvWindow,
  });
  const orderResult = await client.placeFuturesOrder({
    params: orderParams,
    apiKey,
    apiSecret,
  });
  const takeProfitResult = takeProfitParams
    ? await client.placeFuturesOrder({
      params: takeProfitParams,
      apiKey,
      apiSecret,
    })
    : null;

  return {
    status: 'submitted',
    message: 'Order submitted to Binance.',
    order: plannedOrder,
    leverageResult,
    orderResult,
    takeProfitResult,
  };
}

async function getMarketSnapshot() {
  const [symbols, tickers, premiumRows] = await Promise.all([
    getSymbols(),
    client.getTicker24hr(),
    client.getPremiumIndex(),
  ]);
  const allowedSymbols = new Set(symbols.map((item) => item.symbol));
  const premiumBySymbol = new Map(
    premiumRows
      .filter((item) => allowedSymbols.has(item.symbol))
      .map((item) => [item.symbol, item]),
  );

  return tickers
    .filter((item) => allowedSymbols.has(item.symbol))
    .map((item) => {
      const premium = premiumBySymbol.get(item.symbol);

      return {
        symbol: item.symbol,
        markPrice: Number(premium?.markPrice ?? item.lastPrice),
        indexPrice: Number(premium?.indexPrice ?? item.weightedAvgPrice),
        fundingRate: Number(premium?.lastFundingRate ?? 0),
        change24hPct: Number(item.priceChangePercent),
        quoteVolume: Number(item.quoteVolume),
      };
    });
}

function startAutoTrader() {
  if (process.env.AUTO_TRADE_ENABLED !== 'true') {
    console.log('Auto trader disabled. Set AUTO_TRADE_ENABLED=true to enable.');
    return;
  }

  autoTradeState.startedAt = new Date().toISOString();
  const intervalMs = Math.max(Number(process.env.AUTO_TRADE_INTERVAL_MS ?? 15000), 5000);

  console.log(`Auto trader enabled. Scan interval ${intervalMs}ms.`);
  runAutoTradeScan();
  setInterval(runAutoTradeScan, intervalMs);
}

async function runAutoTradeScan() {
  try {
    const snapshot = await getMarketSnapshot();
    const threshold = Number(process.env.AUTO_TRADE_THRESHOLD ?? 0.7);
    const maxOrders = Math.max(1, Number(process.env.AUTO_TRADE_MAX_ORDERS_PER_SCAN ?? 1));
    const candidates = snapshot
      .map((row) => ({
        row,
        setup: buildAutoTradeSignal(row),
      }))
      .filter(({ setup }) => setup.direction !== 'wait' && Math.abs(setup.score) >= threshold)
      .sort((a, b) => Math.abs(b.setup.score) - Math.abs(a.setup.score));
    let placed = 0;

    autoTradeState.lastScanAt = new Date().toISOString();

    for (const candidate of candidates) {
      if (placed >= maxOrders) {
        break;
      }

      if (isAutoTradeCoolingDown(candidate.row.symbol)) {
        continue;
      }

      const result = await placeAutoTrade(candidate.row, candidate.setup);

      autoTradeState.lastOrders.unshift({
        at: new Date().toISOString(),
        symbol: candidate.row.symbol,
        direction: candidate.setup.direction,
        score: candidate.setup.score,
        result,
      });
      autoTradeState.lastOrders = autoTradeState.lastOrders.slice(0, 20);
      autoTradeState.symbolCooldowns.set(candidate.row.symbol, Date.now());
      placed += 1;
    }
  } catch (error) {
    autoTradeState.lastErrors.unshift({
      at: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    });
    autoTradeState.lastErrors = autoTradeState.lastErrors.slice(0, 20);
    console.error('Auto trader scan failed:', error instanceof Error ? error.message : error);
  }
}

async function placeAutoTrade(row, setup) {
  const marginUsdt = Number(process.env.AUTO_TRADE_MARGIN_USDT ?? 2);
  const leverage = Math.max(1, Math.min(125, Number(process.env.AUTO_TRADE_LEVERAGE ?? 10)));
  const notionalUsdt = marginUsdt * leverage;
  const dryRun = process.env.AUTO_TRADE_DRY_RUN !== 'false';
  const side = setup.direction === 'long' ? 'BUY' : 'SELL';

  return placeOrder({
    symbol: row.symbol,
    side,
    notionalUsdt,
    leverage,
    dryRun,
    source: 'auto-trader',
  });
}

function buildAutoTradeSignal(row) {
  const price = row.markPrice;
  const change24h = row.change24hPct ?? 0;
  const fundingPct = (row.fundingRate ?? 0) * 100;
  const firstSeenPrice = autoTradeState.firstSeenPrices.get(row.symbol) ?? price;

  if (!autoTradeState.firstSeenPrices.has(row.symbol)) {
    autoTradeState.firstSeenPrices.set(row.symbol, price);
  }

  const liveMomentum = ((price - firstSeenPrice) / firstSeenPrice) * 100;
  const score = (
    clamp(change24h / 12, -1, 1) * 0.45
    + clamp(liveMomentum / 1.2, -1, 1) * 0.4
    + clamp(-fundingPct / 0.05, -0.4, 0.4) * 0.15
  );

  if (score >= 0.7) {
    return {
      direction: 'long',
      score,
      reason: 'Auto score >= 0.7: 24h trend/live momentum/funding aligned upward.',
    };
  }

  if (score <= -0.7) {
    return {
      direction: 'short',
      score,
      reason: 'Auto score <= -0.7: 24h trend/live momentum/funding aligned downward.',
    };
  }

  return {
    direction: 'wait',
    score,
    reason: 'Auto score below threshold.',
  };
}

function isAutoTradeCoolingDown(symbol) {
  const lastOrderAt = autoTradeState.symbolCooldowns.get(symbol);

  if (!lastOrderAt) {
    return false;
  }

  return Date.now() - lastOrderAt < Number(process.env.AUTO_TRADE_COOLDOWN_MS ?? 900000);
}

function getAutoTradeStatus() {
  return {
    enabled: process.env.AUTO_TRADE_ENABLED === 'true',
    dryRun: process.env.AUTO_TRADE_DRY_RUN !== 'false',
    threshold: Number(process.env.AUTO_TRADE_THRESHOLD ?? 0.7),
    marginUsdt: Number(process.env.AUTO_TRADE_MARGIN_USDT ?? 2),
    leverage: Number(process.env.AUTO_TRADE_LEVERAGE ?? 10),
    notionalUsdt: Number(process.env.AUTO_TRADE_MARGIN_USDT ?? 2) * Number(process.env.AUTO_TRADE_LEVERAGE ?? 10),
    intervalMs: Number(process.env.AUTO_TRADE_INTERVAL_MS ?? 15000),
    cooldownMs: Number(process.env.AUTO_TRADE_COOLDOWN_MS ?? 900000),
    maxOrdersPerScan: Number(process.env.AUTO_TRADE_MAX_ORDERS_PER_SCAN ?? 1),
    startedAt: autoTradeState.startedAt,
    lastScanAt: autoTradeState.lastScanAt,
    lastOrders: autoTradeState.lastOrders,
    lastErrors: autoTradeState.lastErrors,
  };
}

function quantityFromNotional(symbolInfo, notionalUsdt, markPrice) {
  const lotSize = symbolInfo.filters?.find((filter) => filter.filterType === 'LOT_SIZE');
  const stepSize = Number(lotSize?.stepSize ?? 10 ** -Number(symbolInfo.quantityPrecision ?? 3));
  const minQty = Number(lotSize?.minQty ?? stepSize);
  const rawQuantity = notionalUsdt / markPrice;
  const minNotional = minQty * markPrice;

  if (rawQuantity < minQty) {
    throw new Error(`Order size too small for ${symbolInfo.symbol}. Minimum is about ${minNotional.toFixed(2)} USDT.`);
  }

  const steppedQuantity = Math.floor(rawQuantity / stepSize) * stepSize;
  const precision = decimalsFromStep(stepSize);

  return steppedQuantity.toFixed(precision).replace(/\.?0+$/, '');
}

function priceFromTick(symbolInfo, price) {
  const priceFilter = symbolInfo.filters?.find((filter) => filter.filterType === 'PRICE_FILTER');
  const tickSize = Number(priceFilter?.tickSize ?? 0.00000001);
  const precision = decimalsFromStep(tickSize);

  return (Math.round(price / tickSize) * tickSize).toFixed(precision).replace(/\.?0+$/, '');
}

function decimalsFromStep(stepSize) {
  const text = String(stepSize);

  if (!text.includes('.')) {
    return 0;
  }

  return text.replace(/0+$/, '').split('.')[1]?.length ?? 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');

  return raw ? JSON.parse(raw) : {};
}

async function sendStatic(pathname, response) {
  const staticPath = pathname === '/'
    ? '/index.html'
    : pathname === '/signals'
      ? '/signals.html'
      : pathname;
  const safePath = normalize(staticPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    await sendJson(response, { error: 'Not found' }, 404);
    return;
  }

  try {
    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      await sendJson(response, { error: 'Not found' }, 404);
      return;
    }

    response.writeHead(200, {
      'content-type': contentTypeFor(filePath),
      'cache-control': 'no-store',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    await sendJson(response, { error: 'Not found' }, 404);
  }
}

async function sendJson(response, payload, status = 200) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function contentTypeFor(filePath) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
  };

  return types[extname(filePath)] ?? 'application/octet-stream';
}
