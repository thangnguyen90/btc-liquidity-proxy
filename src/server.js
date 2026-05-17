#!/usr/bin/env node

import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BinanceClient, BinanceRateLimitError } from './binanceClient.js';
import { loadEnv } from './env.js';
import { fetchAnalysis, normalizeSymbol } from './marketAnalysis.js';
import { startDiscordScanner, startLiqImbalanceScanner, isDiscordCoolingDown, tryNotifySignal, sendSignalDetected, sendOrderPlaced, sendOrderBlocked } from './discordNotifier.js';
import { startTrailingStopScanner } from './trailingStop.js';
import { startBtcReversalGuard } from './btcReversalGuard.js';
import { startPositionMonitor } from './positionMonitor.js';

loadEnv();

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const publicDir = join(rootDir, 'public');
const client = new BinanceClient({
  baseUrl: process.env.BINANCE_FUTURES_BASE_URL || undefined,
});
const symbolCache = { data: null, expiresAt: 0 };
const snapshotCache = { data: null, expiresAt: 0 };
const autoTradeState = {
  startedAt: null,
  lastScanAt: null,
  lastOrders: [],
  lastErrors: [],
  firstSeenPrices: new Map(),
  symbolCooldowns: new Map(),
  signalStreak: new Map(),   // symbol → { direction, count }
};
const port = Number(process.env.PORT ?? 19082);
const ordersTokens = new Set();
const runtimeSettings = {
  orderEnabled: process.env.BINANCE_ORDER_ENABLED === 'true',
  autoTradeEnabled: process.env.AUTO_TRADE_ENABLED === 'true',
  dryRun: process.env.AUTO_TRADE_DRY_RUN !== 'false',
  btcReversalGuard: false,
  btcReversalGuardRoe: 1,
};
const sessionCredentials = new Map(); // token → { apiKey, apiSecret }
let tslScanner = null;
let posMonitor = null;
const longShortCache = new Map();    // symbol → { longShortRatio, longAccount }
const hedgeModeCache = new Map();    // apiKey → bool
const topPositionCache = new Map(); // symbol → { longShortRatio, longPosition, shortPosition }

const BLACKLIST_FILE = join(rootDir, 'data', 'dynamic-blacklist.json');
const dynamicBlacklist = new Map(); // symbol → { expiresAt, addedAt, reason }
const aiCache = new Map(); // symbol → { at, data }

const SL_TRACKING_FILE = join(rootDir, 'data', 'sl-tracking.json');
// { createdAt, positions: { [symbol]: { openedAt, entry, slPlaced, slPrice? } } }
let slTracking = { createdAt: Date.now(), positions: {} };

async function loadSlTracking() {
  try {
    const text = await readFile(SL_TRACKING_FILE, 'utf8');
    slTracking = JSON.parse(text);
    const count = Object.keys(slTracking.positions).length;
    console.log(`[SlTracking] Loaded — createdAt ${new Date(slTracking.createdAt).toISOString()}, ${count} position(s)`);
  } catch {
    await saveSlTracking();
    console.log(`[SlTracking] Created new — ${new Date(slTracking.createdAt).toISOString()}`);
  }
}

async function saveSlTracking() {
  try {
    await mkdir(join(rootDir, 'data'), { recursive: true });
    await writeFile(SL_TRACKING_FILE, JSON.stringify(slTracking, null, 2));
  } catch (err) {
    console.warn('[SlTracking] Save failed:', err.message);
  }
}

async function loadDynamicBlacklist() {
  try {
    const text = await readFile(BLACKLIST_FILE, 'utf8');
    const entries = JSON.parse(text);
    const now = Date.now();
    let loaded = 0;
    for (const [symbol, entry] of Object.entries(entries)) {
      if (entry.expiresAt > now) { dynamicBlacklist.set(symbol, entry); loaded++; }
    }
    if (loaded > 0) console.log(`[Blacklist] Loaded ${loaded} active entries from file`);
  } catch { /* file not found yet — ok */ }
}

async function saveDynamicBlacklist() {
  try {
    await mkdir(join(rootDir, 'data'), { recursive: true });
    await writeFile(BLACKLIST_FILE, JSON.stringify(Object.fromEntries(dynamicBlacklist), null, 2));
  } catch (err) {
    console.warn('[Blacklist] Save failed:', err.message);
  }
}

function isDynamicBlacklisted(symbol) {
  const entry = dynamicBlacklist.get(symbol);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { dynamicBlacklist.delete(symbol); return false; }
  return true;
}

async function addToDynamicBlacklist(symbol, durationMs = 2 * 60 * 60 * 1000, reason = 'SL hit') {
  const expiresAt = Date.now() + durationMs;
  dynamicBlacklist.set(symbol, { expiresAt, addedAt: new Date().toISOString(), reason });
  console.log(`[Blacklist] +${symbol} for ${durationMs / 60000}min — ${reason}`);
  await saveDynamicBlacklist();
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host}`);

    if (requestUrl.pathname === '/api/auth' && request.method === 'POST') {
      const body = await readJsonBody(request);
      if (!body.apiKey || !body.apiSecret) {
        await sendJson(response, { error: 'API Key và API Secret là bắt buộc.' }, 400);
        return;
      }
      const token = crypto.randomUUID();
      ordersTokens.add(token);
      sessionCredentials.set(token, { apiKey: String(body.apiKey), apiSecret: String(body.apiSecret) });
      await sendJson(response, { token });
      return;
    }

    const ordersRoutes = ['/api/balance', '/api/positions', '/api/open-orders', '/api/open-algo-orders', '/api/trades', '/api/cancel-order', '/api/cancel-all-orders', '/api/close-position', '/api/order', '/api/settings', '/api/daily-pnl'];
    if (ordersRoutes.some((r) => requestUrl.pathname === r)) {
      const token = request.headers['x-orders-token'] ?? '';
      if (!ordersTokens.has(token)) {
        await sendJson(response, { error: 'Unauthorized.' }, 401);
        return;
      }
    }

    if (requestUrl.pathname === '/api/symbols') {
      await sendJson(response, await getSymbols());
      return;
    }

    if (requestUrl.pathname === '/api/market-snapshot') {
      await sendJson(response, await getMarketSnapshot());
      return;
    }

    if (requestUrl.pathname === '/api/price') {
      const symbol = normalizeSymbol(requestUrl.searchParams.get('symbol') ?? 'BTCUSDT');
      const data = await client.getPremiumIndex(symbol);
      await sendJson(response, { mark: Number(data.markPrice), index: Number(data.indexPrice) });
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

    if (requestUrl.pathname === '/api/ls-ratio') {
      const symbol = normalizeSymbol(requestUrl.searchParams.get('symbol') ?? 'BTCUSDT');
      const period = ['5m', '15m', '30m', '1h'].includes(requestUrl.searchParams.get('period')) ? requestUrl.searchParams.get('period') : '5m';
      const limit = Math.min(Number(requestUrl.searchParams.get('limit') ?? 50), 500);
      const rows = await client.getTopLongShortAccountRatio(symbol, period, limit);
      await sendJson(response, rows);
      return;
    }

    if (requestUrl.pathname === '/api/ai-analysis' && request.method === 'POST') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        await sendJson(response, { error: 'OPENAI_API_KEY chưa được cấu hình trong .env' }, 503);
        return;
      }
      const body = await readJsonBody(request);
      const symbol = normalizeSymbol(body.symbol ?? 'BTCUSDT');
      const interval = body.interval ?? '15m';
      const cached = aiCache.get(symbol);
      if (cached && Date.now() - cached.at < 60_000) {
        await sendJson(response, cached.data);
        return;
      }
      const t0 = Date.now();
      const analysis = await fetchAnalysis({ client, symbol, interval, limit: 200 });
      const messages = buildAiPrompt(symbol, analysis);
      const result = await callOpenAI(messages);
      aiCache.set(symbol, { at: Date.now(), data: result });
      console.log(`[AI] ${symbol} analyzed in ${Date.now() - t0}ms`);
      await sendJson(response, result);
      return;
    }

    if (requestUrl.pathname === '/api/order' && request.method === 'POST') {
      const token = request.headers['x-orders-token'] ?? '';
      await sendJson(response, await placeOrder(await readJsonBody(request), token));
      return;
    }

    if (requestUrl.pathname === '/api/daily-pnl') {
      const token = request.headers['x-orders-token'] ?? '';
      await sendJson(response, await getDailyPnl(token));
      return;
    }

    if (requestUrl.pathname === '/api/balance') {
      const token = request.headers['x-orders-token'] ?? '';
      await sendJson(response, await getAccountBalance(token));
      return;
    }

    if (requestUrl.pathname === '/api/positions') {
      const token = request.headers['x-orders-token'] ?? '';
      await sendJson(response, await getPositions(token));
      return;
    }

    if (requestUrl.pathname === '/api/open-orders') {
      const token = request.headers['x-orders-token'] ?? '';
      const symbol = requestUrl.searchParams.get('symbol') ?? undefined;
      await sendJson(response, await getOpenOrders(symbol, token));
      return;
    }

    if (requestUrl.pathname === '/api/open-algo-orders') {
      const token = request.headers['x-orders-token'] ?? '';
      await sendJson(response, await getOpenAlgoOrdersList(token));
      return;
    }

    if (requestUrl.pathname === '/api/trades') {
      const token = request.headers['x-orders-token'] ?? '';
      const symbol = normalizeSymbol(requestUrl.searchParams.get('symbol') ?? 'BTCUSDT');
      const limit = Number(requestUrl.searchParams.get('limit') ?? 50);
      await sendJson(response, await getRecentTrades(symbol, limit, token));
      return;
    }

    if (requestUrl.pathname === '/api/cancel-order' && request.method === 'POST') {
      const token = request.headers['x-orders-token'] ?? '';
      await sendJson(response, await cancelOrder(await readJsonBody(request), token));
      return;
    }

    if (requestUrl.pathname === '/api/blacklist') {
      if (request.method === 'GET') {
        const now = Date.now();
        const active = [...dynamicBlacklist.entries()]
          .filter(([, e]) => e.expiresAt > now)
          .map(([symbol, e]) => ({ symbol, ...e, remainingMs: e.expiresAt - now }));
        await sendJson(response, active);
        return;
      }
      if (request.method === 'DELETE') {
        const body = await readJsonBody(request);
        const symbol = normalizeSymbol(body.symbol ?? '');
        if (!symbol) { await sendJson(response, { error: 'symbol is required.' }, 400); return; }
        const removed = dynamicBlacklist.delete(symbol);
        await saveDynamicBlacklist();
        await sendJson(response, { removed, symbol });
        return;
      }
    }

    if (requestUrl.pathname === '/api/cancel-all-orders' && request.method === 'POST') {
      const token = request.headers['x-orders-token'] ?? '';
      const body = await readJsonBody(request);
      const symbol = normalizeSymbol(body.symbol ?? '');
      if (!symbol) { await sendJson(response, { error: 'symbol is required.' }, 400); return; }
      const { apiKey, apiSecret } = getApiCredentials(token);
      await sendJson(response, await cancelAllOrdersForSymbol(symbol, apiKey, apiSecret));
      return;
    }

    if (requestUrl.pathname === '/api/close-position' && request.method === 'POST') {
      const token = request.headers['x-orders-token'] ?? '';
      await sendJson(response, await closePosition(await readJsonBody(request), token));
      return;
    }

    if (requestUrl.pathname === '/api/auto-trade/status') {
      await sendJson(response, getAutoTradeStatus());
      return;
    }

    if (requestUrl.pathname === '/api/settings') {
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        if (typeof body.orderEnabled === 'boolean') runtimeSettings.orderEnabled = body.orderEnabled;
        if (typeof body.autoTradeEnabled === 'boolean') runtimeSettings.autoTradeEnabled = body.autoTradeEnabled;
        if (typeof body.dryRun === 'boolean') runtimeSettings.dryRun = body.dryRun;
        if (typeof body.btcReversalGuard === 'boolean') runtimeSettings.btcReversalGuard = body.btcReversalGuard;
        if (typeof body.btcReversalGuardRoe === 'number') runtimeSettings.btcReversalGuardRoe = body.btcReversalGuardRoe;
      }
      await sendJson(response, { ...runtimeSettings });
      return;
    }

    if (requestUrl.pathname === '/api/trailing-stop/status') {
      const token = request.headers['x-orders-token'] ?? '';
      if (!ordersTokens.has(token)) {
        await sendJson(response, { error: 'Unauthorized.' }, 401);
        return;
      }
      const protected_ = tslScanner
        ? Object.fromEntries(tslScanner.protectedPositions)
        : {};
      await sendJson(response, {
        enabled: process.env.TRAILING_STOP_ENABLED === 'true',
        triggerRoe: Number(process.env.TRAILING_STOP_TRIGGER_ROE ?? 15),
        lockMarginPct: Number(process.env.TRAILING_STOP_LOCK_MARGIN_PCT ?? 1),
        protected: protected_,
      });
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
  loadDynamicBlacklist();
  loadSlTracking();
  const tslIntervalMs = Math.max(Number(process.env.TRAILING_STOP_INTERVAL_MS ?? 30000), 15000);
  // Stagger service startup to avoid burst at t=0
  startAutoTrader();
  setTimeout(() => startLongShortRefresh(), 3000);
  setTimeout(() => {
    tslScanner = startTrailingStopScanner({ client, getSymbols, intervalMs: tslIntervalMs });
  }, 7000);
  setTimeout(() => {
    startBtcReversalGuard({ client, getSymbols, getRuntimeSettings: () => runtimeSettings, intervalMs: tslIntervalMs });
  }, 12000);
  setTimeout(() => {
    startDiscordScanner({
      client,
      webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
      threshold: Number(process.env.DISCORD_SIGNAL_THRESHOLD ?? 0.7),
      intervalMs: Math.max(Number(process.env.DISCORD_INTERVAL_MS ?? 30000), 15000),
      cooldownMs: Number(process.env.DISCORD_COOLDOWN_MS ?? 3600000),
      getSnapshot: getMarketSnapshot,
    });
    startLiqImbalanceScanner({
      client,
      webhookUrl: process.env.LIQ_SCAN_WEBHOOK_URL || '',
      getSnapshot: getMarketSnapshot,
      biasThreshold: Number(process.env.LIQ_SCAN_BIAS_THRESHOLD ?? 0.4),
      intervalMs: Number(process.env.LIQ_SCAN_INTERVAL_MS ?? 5 * 60 * 1000),
      cooldownMs: Number(process.env.LIQ_SCAN_COOLDOWN_MS ?? 2 * 60 * 60 * 1000),
      minVolumeUsdt: Number(process.env.LIQ_SCAN_MIN_VOLUME ?? 5_000_000),
      maxCoins: Number(process.env.LIQ_SCAN_MAX_COINS ?? 200),
    });
  }, 17000);
  setTimeout(() => {
    runStaleOrderCleaner(); // seed initial position set, no cancellations on first run
    setInterval(runStaleOrderCleaner, 30000);
  }, 22000);
  setTimeout(() => {
    posMonitor = startPositionMonitor({
      client,
      onOrderFill: (symbol, { fillTime }) => {
        // Only track fills that happened after sl-tracking.json was created
        if (fillTime < slTracking.createdAt) return;
        if (!slTracking.positions[symbol]) {
          slTracking.positions[symbol] = { openedAt: fillTime, openedAtStr: new Date(fillTime).toISOString(), slPlaced: false };
          saveSlTracking();
        }
        setTimeout(() => triggerSlGuardForSymbol(symbol), 1000);
      },
      onRoeUpdate: (symbol, pos, markPrice, roe) => {
        // TP entry guard: move TP to entry when ROE ≤ threshold
        const tpGuardRoe = Number(process.env.TP_ENTRY_GUARD_ROE ?? -50);
        if (roe <= tpGuardRoe) {
          handleTpEntryGuard(symbol, pos, markPrice, roe).catch(() => {});
        }
        // Avg-down: place DCA order when ROE ≤ threshold
        const avgDownRoe = Number(process.env.AVG_DOWN_ROE ?? -60);
        if (roe <= avgDownRoe) {
          handleAvgDown(symbol, pos, roe).catch(() => {});
        }
        // SL trail: move SL up as profit grows in steps
        if (slTracking.positions[symbol]?.slPlaced) {
          handleSlTrailByProfit(symbol, pos, roe).catch(() => {});
        }
        // Track continuous negative duration → set TP at entry after timeout
        if (roe < 0) {
          if (!negativeSince.has(symbol)) negativeSince.set(symbol, Date.now());
          const negMs = Date.now() - negativeSince.get(symbol);
          const timeoutMs = Number(process.env.NEG_TP_TIMEOUT_MS ?? 4 * 3600 * 1000);
          if (negMs >= timeoutMs) {
            handleNegativeTimeoutTp(symbol, pos).catch(() => {});
          }
        } else {
          negativeSince.delete(symbol);
        }
      },
    });
  }, 25000);
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
      orderTypes: item.orderTypes ?? [],
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  symbolCache.data = symbols;
  symbolCache.expiresAt = Date.now() + 60 * 60 * 1000;

  return symbols;
}

async function placeOrder(payload, token = null) {
  const symbol = normalizeSymbol(payload.symbol ?? '');
  const side = String(payload.side ?? '').toUpperCase();
  const orderType = String(payload.orderType ?? payload.type ?? 'MARKET').toUpperCase();
  const notionalUsdt = Number(payload.notionalUsdt);
  const leverage = Math.max(1, Math.min(125, Number(payload.leverage ?? 1)));
  const dryRun = payload.dryRun !== false;
  const limitPrice = payload.limitPrice === undefined || payload.limitPrice === null || payload.limitPrice === ''
    ? null
    : Number(payload.limitPrice);
  const takeProfitPrice = payload.takeProfitPrice === undefined || payload.takeProfitPrice === null || payload.takeProfitPrice === ''
    ? null
    : Number(payload.takeProfitPrice);
  const stopLossPrice = payload.stopLossPrice === undefined || payload.stopLossPrice === null || payload.stopLossPrice === ''
    ? null
    : Number(payload.stopLossPrice);
  const maxOpenPositions = Number(payload.maxOpenPositions ?? 0);
  const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);

  if (!['BUY', 'SELL'].includes(side)) {
    throw new Error('Invalid order side.');
  }

  const isLimitIOC = orderType === 'LIMIT_IOC';
  if (!['MARKET', 'LIMIT', 'LIMIT_IOC'].includes(orderType)) {
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
  const quantity = quantityFromNotional(symbolInfo, notionalUsdt, executionPrice, dryRun);
  const roundedTakeProfitPrice = takeProfitPrice
    ? priceFromTick(symbolInfo, takeProfitPrice)
    : null;
  const roundedStopLossPrice = stopLossPrice
    ? priceFromTick(symbolInfo, stopLossPrice)
    : null;
  const plannedOrder = {
    enabled: runtimeSettings.orderEnabled,
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
    stopLossPrice: roundedStopLossPrice,
  };

  if (dryRun || !runtimeSettings.orderEnabled) {
    return {
      status: 'planned',
      message: dryRun
        ? 'Dry run only. No order was sent to Binance.'
        : 'Order execution is disabled. Enable it in Settings.',
      order: plannedOrder,
    };
  }

  const { apiKey, apiSecret } = getApiCredentials(token);

  if (maxOpenPositions > 0) {
    const positions = await client.getPositions({ apiKey, apiSecret });
    const openCount = positions.filter((p) => Number(p.positionAmt) !== 0).length;
    if (openCount >= maxOpenPositions) {
      throw new Error(`Max open positions (${maxOpenPositions}) reached. Currently ${openCount} open.`);
    }
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
  if (isLimitIOC) {
    orderParams.type = 'LIMIT';
    orderParams.price = roundedLimitPrice;
    orderParams.timeInForce = 'IOC';
  }
  const isHedge = await getHedgeMode(token);
  const closeSide = side === 'BUY' ? 'SELL' : 'BUY';
  const positionSide = isHedge ? (side === 'BUY' ? 'LONG' : 'SHORT') : undefined;

  const tpSlBase = (type, triggerPrice, clientId) => {
    const p = { algoType: 'CONDITIONAL', symbol, side: closeSide, type, triggerPrice, quantity, workingType: 'MARK_PRICE', recvWindow, newClientOrderId: clientId };
    if (isHedge) p.positionSide = positionSide;
    else p.reduceOnly = 'true';
    return p;
  };

  if (isHedge) orderParams.positionSide = positionSide;

  const supportsStopMarket = !symbolInfo.orderTypes?.length || symbolInfo.orderTypes.includes('STOP_MARKET');
  const supportsTpMarket = !symbolInfo.orderTypes?.length || symbolInfo.orderTypes.includes('TAKE_PROFIT_MARKET');

  const takeProfitParams = roundedTakeProfitPrice && supportsTpMarket
    ? tpSlBase('TAKE_PROFIT_MARKET', roundedTakeProfitPrice, `lp_tp_${Date.now()}`)
    : null;
  const stopLossParams = roundedStopLossPrice && supportsStopMarket
    ? tpSlBase('STOP_MARKET', roundedStopLossPrice, `lp_sl_${Date.now()}`)
    : null;
  const leverageResult = await client.setLeverage({
    symbol,
    leverage,
    apiKey,
    apiSecret,
    recvWindow,
  });
  let orderResult = await client.placeFuturesOrder({ params: orderParams, apiKey, apiSecret });

  // LIMIT IOC: if not filled, fall back to MARKET immediately
  if (isLimitIOC && Number(orderResult.executedQty ?? 0) === 0) {
    console.log(`[Order] ${symbol} IOC not filled → MARKET fallback`);
    const marketParams = { ...orderParams, type: 'MARKET', timeInForce: undefined };
    delete marketParams.price;
    delete marketParams.timeInForce;
    orderResult = await client.placeFuturesOrder({ params: marketParams, apiKey, apiSecret });
  }
  const takeProfitResult = takeProfitParams
    ? await client.placeAlgoOrder({ params: takeProfitParams, apiKey, apiSecret })
    : null;
  const stopLossResult = stopLossParams
    ? await client.placeAlgoOrder({ params: stopLossParams, apiKey, apiSecret })
    : null;

  return {
    status: 'submitted',
    message: 'Order submitted to Binance.',
    order: plannedOrder,
    leverageResult,
    orderResult,
    takeProfitResult,
    stopLossResult,
  };
}

async function getMarketSnapshot() {
  if (snapshotCache.data && Date.now() < snapshotCache.expiresAt) return snapshotCache.data;
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

  const result = tickers
    .filter((item) => allowedSymbols.has(item.symbol))
    .map((item) => {
      const premium = premiumBySymbol.get(item.symbol);
      const lsr = longShortCache.get(item.symbol);
      const tp = topPositionCache.get(item.symbol);
      return {
        symbol: item.symbol,
        markPrice: Number(premium?.markPrice ?? item.lastPrice),
        indexPrice: Number(premium?.indexPrice ?? item.weightedAvgPrice),
        fundingRate: Number(premium?.lastFundingRate ?? 0),
        change24hPct: Number(item.priceChangePercent),
        quoteVolume: Number(item.quoteVolume),
        longShortRatio: lsr?.longShortRatio ?? null,
        longAccount: lsr?.longAccount ?? null,
        topLongPosition: tp?.longPosition ?? null,
        topShortPosition: tp?.shortPosition ?? null,
      };
    });
  snapshotCache.data = result;
  snapshotCache.expiresAt = Date.now() + 15000;
  return result;
}

async function callOpenAI(messages) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

function fp(v, d = 4) { return v == null ? '-' : Number(v).toFixed(d); }

function buildAiPrompt(symbol, a) {
  const d = a;
  const liq = d.liquidationProxy;
  const sig = d.signal;
  const setup = d.tradeSetup;
  const m = d.market;
  const ob = d.orderBook;

  const zonesAbove = (liq.strongestAbove ?? []).slice(0, 5)
    .map((z) => `  • ${fp(z.price, 4)} (+${fp(z.distancePct, 2)}%) score=${fp(z.score, 2)}`).join('\n');
  const zonesBelow = (liq.strongestBelow ?? []).slice(0, 5)
    .map((z) => `  • ${fp(z.price, 4)} (${fp(z.distancePct, 2)}%) score=${fp(z.score, 2)}`).join('\n');

  const lrLine = m.longShortRatio
    ? `Long/Short ratio: ${fp(m.longShortRatio.longShortRatio, 3)} (long accounts: ${(m.longShortRatio.longAccount * 100).toFixed(1)}%)`
    : 'Long/Short ratio: N/A';

  const setupLine = setup.direction !== 'wait'
    ? `Direction: ${setup.direction.toUpperCase()} | Confidence: ${setup.confidence}
Entry zone: ${setup.entry ? `${fp(setup.entry.low, 6)} – ${fp(setup.entry.high, 6)}` : 'N/A'}
Stop loss: ${fp(setup.stopLoss, 6)}
Targets: ${(setup.targets ?? []).map((t) => fp(t, 6)).join(' → ')}
Reasons: ${(setup.reason ?? []).join('; ')}`
    : `Direction: WAIT
Breakout long above: ${fp(setup.breakoutLevels?.longAbove, 6)}
Breakout short below: ${fp(setup.breakoutLevels?.shortBelow, 6)}`;

  const userContent = `## ${symbol} Futures Analysis

**Price:** Mark ${fp(d.price.mark, 6)}  |  Index ${fp(d.price.index, 6)}

**Momentum:** 24h ${fp(m.momentumPct * 100, 2)}%  |  48h ${fp(m.momentumPct48h * 100, 2)}%  |  Trend aligned: ${m.trendAligned}
**ATR:** ${m.atrPct}% of price
**Funding rate:** ${m.fundingRatePct}% (positive = longs pay shorts → bearish pressure)
**Open Interest:** ${m.openInterest}

**Taker buy ratio:** ${(m.takerBuyRatio * 100).toFixed(1)}% (>50% = buy pressure)
${lrLine}

**Order Book (${(ob.rangePct * 100).toFixed(1)}% range):**
Bid: ${ob.bidNotional?.toFixed(0)} USDT  |  Ask: ${ob.askNotional?.toFixed(0)} USDT  |  Imbalance: ${fp(ob.imbalance, 3)} (positive = buy wall)

**Estimated Liquidation Zones (from leveraged position history):**
Above current price (short liquidations → bullish magnet):
${zonesAbove || '  (none)'}
Below current price (long liquidations → bearish magnet):
${zonesBelow || '  (none)'}
Liquidity bias: ${fp(liq.bias, 3)} (>0 = more liquidity above = short squeeze potential)

**Internal Signal:**
Label: ${sig.label}  |  Score: ${sig.score} (range -1 to +1)
Components → momentum:${sig.components.momentum} funding:${sig.components.funding} takerFlow:${sig.components.takerFlow} orderBook:${sig.components.orderBook} liquidityMagnet:${sig.components.liquidityMagnet} crowding:${sig.components.crowding}

**Heuristic Trade Setup:**
${setupLine}

Based on ALL the above data, provide your trading recommendation. Focus especially on:
1. Where liquidation clusters sit relative to price (they act as magnets)
2. Whether funding rate and taker flow confirm or contradict momentum
3. Realistic entry price within the next 1-4 hours

Respond ONLY with JSON in this exact format:
{
  "recommendation": "LONG or SHORT or WAIT",
  "entry": { "low": number, "high": number },
  "stopLoss": number,
  "target": number,
  "riskLevel": "LOW or MEDIUM or HIGH",
  "confidence": number (0-100),
  "reasoning": ["bullet 1", "bullet 2", "bullet 3"],
  "summary": "one sentence in Vietnamese"
}`;

  return [
    {
      role: 'system',
      content: 'You are an expert crypto futures trader. Analyze Binance USD-M Futures market data and return a precise JSON trading recommendation. Be specific with price levels. Do not add commentary outside the JSON.',
    },
    { role: 'user', content: userContent },
  ];
}

function startAutoTrader() {
  autoTradeState.startedAt = new Date().toISOString();
  const intervalMs = Math.max(Number(process.env.AUTO_TRADE_INTERVAL_MS ?? 15000), 5000);
  console.log(`Auto trader ready. Scan interval ${intervalMs}ms. Currently ${runtimeSettings.autoTradeEnabled ? 'enabled' : 'disabled'}.`);
  runAutoTradeScan();
  setInterval(runAutoTradeScan, intervalMs);
}

async function runAutoTradeScan() {
  if (!runtimeSettings.autoTradeEnabled) return;
  try {
    const snapshot = await getMarketSnapshot();
    const threshold = Number(process.env.AUTO_TRADE_THRESHOLD ?? 0.7);
    const maxOrders = Math.max(1, Number(process.env.AUTO_TRADE_MAX_ORDERS_PER_SCAN ?? 1));
    const minVolume = Number(process.env.AUTO_TRADE_MIN_VOLUME_USDT ?? 5_000_000);
    const maxChangePct = Number(process.env.AUTO_TRADE_MAX_CHANGE_PCT ?? 30);
    const blacklist = new Set(
      (process.env.AUTO_TRADE_BLACKLIST ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
    );
    const candidates = snapshot
      .filter((row) => {
        if (blacklist.has(row.symbol)) return false;
        if (isDynamicBlacklisted(row.symbol)) return false;
        if (row.quoteVolume < minVolume) return false;
        if (Math.abs(row.change24hPct) > maxChangePct) return false;
        return true;
      })
      .map((row) => ({
        row,
        setup: buildAutoTradeSignal(row),
      }))
      .filter(({ setup }) => setup.direction !== 'wait' && Math.abs(setup.score) >= threshold)
      .sort((a, b) => Math.abs(b.setup.score) - Math.abs(a.setup.score));
    let placed = 0;

    autoTradeState.lastScanAt = new Date().toISOString();

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL || '';
    const minStreak = Math.max(1, Number(process.env.AUTO_TRADE_MIN_STREAK ?? 2));

    // Decay streaks for symbols no longer qualifying
    const qualifyingSymbols = new Set(candidates.map(({ row }) => row.symbol));
    for (const sym of autoTradeState.signalStreak.keys()) {
      if (!qualifyingSymbols.has(sym)) autoTradeState.signalStreak.delete(sym);
    }

    for (const candidate of candidates) {
      const { row, setup } = candidate;
      if (placed >= maxOrders) break;
      if (isAutoTradeCoolingDown(row.symbol)) continue;

      // ── Streak confirmation ──────────────────────────────────
      const streak = autoTradeState.signalStreak.get(row.symbol) ?? { direction: null, count: 0 };
      if (streak.direction !== setup.direction) {
        autoTradeState.signalStreak.set(row.symbol, { direction: setup.direction, count: 1 });
        console.log(`[AutoTrade] ${row.symbol} new signal ${setup.direction} score=${setup.score.toFixed(3)} — streak 1/${minStreak}`);
        // Discord #1: signal detected (lightweight, no analysis)
        if (webhookUrl) {
          sendSignalDetected(row.symbol, setup.score, webhookUrl)
            .catch((err) => console.error(`[Discord] signal alert ${row.symbol}:`, err.message));
        }
        continue;
      }
      if (streak.count < minStreak) {
        autoTradeState.signalStreak.set(row.symbol, { ...streak, count: streak.count + 1 });
        console.log(`[AutoTrade] ${row.symbol} streak ${streak.count + 1}/${minStreak}`);
        continue;
      }

      // ── Bounce/dip entry filter ──────────────────────────────
      // SHORT: track lowest seen → wait for price to bounce ≥ bouncePct above that low
      // LONG:  anchor to signal price → wait for price to dip ≥ bouncePct below signal price
      //        (can't track "highest" for LONG because rising price keeps updating extreme → move always 0)
      // ── Calculate entry level (EMA99 / ATR-based) → LIMIT IOC ─
      const [symbols] = await Promise.all([getSymbols()]);
      const symbolInfo = symbols.find((s) => s.symbol === row.symbol);
      const limitPrice = symbolInfo
        ? await calculateEntryLevel(row.symbol, setup.direction, row.markPrice, symbolInfo, setup.score)
        : null;

      // ── Place order ──────────────────────────────────────────
      console.log(`[AutoTrade] ${row.symbol} ${setup.direction.toUpperCase()} ENTRY — streak OK → ${limitPrice ? `LIMIT IOC @ ${limitPrice}` : 'MARKET'}`);
      let result;
      try {
        result = await placeAutoTrade(row, setup, limitPrice, setup.score);
      } catch (placeErr) {
        const reason = placeErr instanceof Error ? placeErr.message : String(placeErr);
        console.warn(`[AutoTrade] ${row.symbol} blocked: ${reason}`);
        autoTradeState.lastErrors.unshift({ at: new Date().toISOString(), message: reason });
        autoTradeState.lastErrors = autoTradeState.lastErrors.slice(0, 20);
        if (webhookUrl) {
          sendOrderBlocked(row.symbol, setup.score, setup.direction, reason, webhookUrl)
            .catch((err) => console.error(`[Discord] blocked alert ${row.symbol}:`, err.message));
        }
        continue;
      }
      // Track position immediately so positionMonitor picks it up before next REST sync
      if (posMonitor && result?.status === 'submitted') {
        const isLong = setup.direction === 'long';
        const lev = Math.max(1, Math.min(125, Number(process.env.AUTO_TRADE_LEVERAGE ?? 10)));
        const margin = Number(process.env.AUTO_TRADE_MARGIN_USDT ?? 1);
        const qty = (margin * lev) / row.markPrice;
        posMonitor.trackPosition(row.symbol, {
          amt: isLong ? qty : -qty,
          entry: row.markPrice,
          leverage: lev,
        });
      }
      // Discord #2: order placed (full analysis embed)
      if (webhookUrl) {
        fetchAnalysis({ client, symbol: row.symbol, interval: '15m', limit: 192 })
          .then((analysis) => sendOrderPlaced(row.symbol, setup.score, analysis, webhookUrl))
          .catch((err) => console.error(`[Discord] order alert ${row.symbol}:`, err.message));
      }
      autoTradeState.lastOrders.unshift({
        at: new Date().toISOString(),
        symbol: row.symbol,
        direction: setup.direction,
        score: setup.score,
        result,
      });
      autoTradeState.lastOrders = autoTradeState.lastOrders.slice(0, 20);
      autoTradeState.symbolCooldowns.set(row.symbol, Date.now());
      autoTradeState.signalStreak.delete(row.symbol);
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

async function placeAutoTrade(row, setup, limitPrice = null, score = 0) {
  const marginUsdt = Number(process.env.AUTO_TRADE_MARGIN_USDT ?? 2);
  const leverage = Math.max(1, Math.min(125, Number(process.env.AUTO_TRADE_LEVERAGE ?? 10)));
  const notionalUsdt = marginUsdt * leverage;
  const dryRun = runtimeSettings.dryRun;
  const isLong = setup.direction === 'long';
  const side = isLong ? 'BUY' : 'SELL';
  const mark = row.markPrice;

  // ── TP: direction-specific, with strong-signal boost ─────────────────────
  const defaultTpRoe = Number(process.env.AUTO_TRADE_TP_ROE ?? 20);
  const tpRoeBase = isLong
    ? Number(process.env.AUTO_TRADE_LONG_TP_ROE ?? defaultTpRoe)
    : Number(process.env.AUTO_TRADE_SHORT_TP_ROE ?? defaultTpRoe);

  const strongThreshold = Number(process.env.AUTO_TRADE_STRONG_SCORE ?? 0.85);
  const strongMult = Number(process.env.AUTO_TRADE_STRONG_TP_MULT ?? 1.5);
  const isStrong = Math.abs(score) >= strongThreshold;
  const tpRoePct = (isStrong ? tpRoeBase * strongMult : tpRoeBase) / 100;

  if (isStrong) {
    console.log(`[AutoTrade] ${row.symbol} strong score ${score.toFixed(3)} → TP boosted ${tpRoeBase}% → ${(tpRoePct * 100).toFixed(1)}%`);
  }

  const takeProfitPrice = tpRoePct > 0 && mark > 0
    ? (isLong ? mark * (1 + tpRoePct / leverage) : mark * (1 - tpRoePct / leverage))
    : undefined;

  // ── SL: direction-specific, optional ─────────────────────────────────────
  const slRoeEnv = isLong
    ? process.env.AUTO_TRADE_LONG_SL_ROE
    : process.env.AUTO_TRADE_SHORT_SL_ROE;
  const slRoePct = slRoeEnv ? Math.abs(Number(slRoeEnv)) / 100 : null;
  const stopLossPrice = slRoePct && mark > 0
    ? (isLong ? mark * (1 - slRoePct / leverage) : mark * (1 + slRoePct / leverage))
    : undefined;

  const maxPositions = Number(process.env.AUTO_TRADE_MAX_POSITIONS ?? 0);

  return placeOrder({
    symbol: row.symbol,
    side,
    orderType: limitPrice && !dryRun ? 'LIMIT_IOC' : 'MARKET',
    notionalUsdt,
    leverage,
    dryRun,
    limitPrice: limitPrice ?? undefined,
    takeProfitPrice,
    stopLossPrice,
    maxOpenPositions: maxPositions,
    source: 'auto-trader',
  });
}

// symbol → entry price at the time avg-down was placed (reset when position closes)
const avgDownTriggered = new Map();

async function runAvgDownScan() {
  if (process.env.AVG_DOWN_ENABLED !== 'true') return;
  const triggerRoe = Number(process.env.AVG_DOWN_TRIGGER_ROE ?? -60);
  const marginUsdt = Number(process.env.AVG_DOWN_MARGIN_USDT ?? 2);

  try {
    const { apiKey, apiSecret } = getApiCredentials(null);
    const positions = await client.getPositions({ apiKey, apiSecret });
    const active = positions.filter((p) => Number(p.positionAmt) !== 0);

    // Clear triggered map for closed positions
    const activeSymbols = new Set(active.map((p) => p.symbol));
    for (const sym of avgDownTriggered.keys()) {
      if (!activeSymbols.has(sym)) avgDownTriggered.delete(sym);
    }

    for (const pos of active) {
      const amt = Number(pos.positionAmt);
      const entry = Number(pos.entryPrice);
      const upnl = Number(pos.unRealizedProfit);
      const lev = Number(pos.leverage) || 1;
      const isolatedMargin = Number(pos.isolatedMargin);
      const initialMargin = Number(pos.initialMargin);
      const margin = isolatedMargin > 0 ? isolatedMargin
        : initialMargin > 0 ? initialMargin
          : Math.abs(amt) * entry / lev;
      const roe = margin > 0 ? (upnl / margin) * 100 : 0;

      if (roe > triggerRoe) continue;

      // Already averaged for this position entry price (within 1% means same position, not re-opened)
      const prevEntry = avgDownTriggered.get(pos.symbol);
      if (prevEntry !== undefined && Math.abs(prevEntry - entry) / entry < 0.01) continue;

      const side = amt > 0 ? 'BUY' : 'SELL';
      const notionalUsdt = marginUsdt * lev;

      if (runtimeSettings.dryRun) {
        console.log(`[AvgDown] [DRY RUN] ${pos.symbol} ROE=${roe.toFixed(1)}% → would avg down $${marginUsdt} ${side}`);
        avgDownTriggered.set(pos.symbol, entry);
        continue;
      }

      try {
        await placeOrder({ symbol: pos.symbol, side, notionalUsdt, leverage: lev, dryRun: false, source: 'avg-down' });
        avgDownTriggered.set(pos.symbol, entry);
        console.log(`[AvgDown] ✅ ${pos.symbol} ROE=${roe.toFixed(1)}% → avg down $${marginUsdt} ${side}`);
      } catch (err) {
        console.error(`[AvgDown] ❌ ${pos.symbol}:`, err.message);
      }
    }
  } catch (err) {
    if (err.message?.includes('Missing Binance API')) return; // no credentials yet
    console.error('[AvgDown] Scan error:', err.message);
  }
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
  if (!lastOrderAt) return false;
  return Date.now() - lastOrderAt < Number(process.env.AUTO_TRADE_COOLDOWN_MS ?? 900000);
}

function computeEMA(closes, period) {
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function computeATR(klines, period = 14) {
  const trs = [];
  for (let i = 1; i < klines.length; i++) {
    const { high, low } = klines[i];
    const prevClose = klines[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

async function calculateEntryLevel(symbol, direction, markPrice, symbolInfo, score = 0) {
  try {
    const klines = await client.getKlines(symbol, '15m', 110);
    if (klines.length < 100) return null;
    const closes = klines.map((k) => k.close);
    const ema99 = computeEMA(closes, 99);
    const atr = computeATR(klines, 14);

    const strongThreshold = Number(process.env.AUTO_TRADE_STRONG_SCORE ?? 0.85);
    const isStrong = Math.abs(score) >= strongThreshold;

    let rawLimit;
    if (direction === 'short') {
      // Normal: 0.5×ATR bounce offset. Strong: 1×ATR — bigger bounce expected after sharp drop.
      const atrMult = isStrong ? 1.0 : 0.5;
      rawLimit = markPrice + atr * atrMult;
      rawLimit = Math.min(rawLimit, markPrice * (isStrong ? 1.02 : 1.01));
    } else {
      // Normal: EMA99 or max 2×ATR below. Strong: allow up to 3×ATR below for deeper dip entry.
      const atrFloor = isStrong ? 3.0 : 2.0;
      const floorPrice = markPrice - atr * atrFloor;
      rawLimit = Math.max(ema99, floorPrice);
      rawLimit = Math.min(rawLimit, markPrice * 0.9995);
    }

    const limitPrice = Number(priceFromTick(symbolInfo, rawLimit));
    console.log(`[AutoTrade] ${symbol} entry: ${direction}${isStrong ? ' [STRONG]' : ''} → LIMIT ${limitPrice} (EMA99=${ema99.toFixed(4)} ATR=${atr.toFixed(4)})`);
    return limitPrice;
  } catch (err) {
    console.warn(`[AutoTrade] ${symbol} calculateEntryLevel failed: ${err.message}`);
    return null;
  }
}

function getAutoTradeStatus() {
  return {
    enabled: runtimeSettings.autoTradeEnabled,
    dryRun: runtimeSettings.dryRun,
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

function quantityFromNotional(symbolInfo, notionalUsdt, markPrice, skipMinCheck = false) {
  const lotSize = symbolInfo.filters?.find((filter) => filter.filterType === 'LOT_SIZE');
  const stepSize = Number(lotSize?.stepSize ?? 10 ** -Number(symbolInfo.quantityPrecision ?? 3));
  const minQty = Number(lotSize?.minQty ?? stepSize);
  const rawQuantity = notionalUsdt / markPrice;
  const minNotional = minQty * markPrice;

  if (!skipMinCheck && rawQuantity < minQty) {
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

async function batchedAllSettled(items, fn, batchSize = 5, delayMs = 300) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...await Promise.allSettled(batch.map(fn)));
    if (i + batchSize < items.length) await new Promise((r) => setTimeout(r, delayMs));
  }
  return results;
}

function startLongShortRefresh() {
  const run = async () => {
    try {
      const [symbols, tickers] = await Promise.all([getSymbols(), client.getTicker24hr()]);
      const allowed = new Set(symbols.map((s) => s.symbol));
      const top = tickers
        .filter((t) => allowed.has(t.symbol))
        .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
        .slice(0, 40)
        .map((t) => t.symbol);

      // Stagger calls: 5 per batch, 300ms between batches → ~2.4s total instead of burst
      const [globalResults, topResults] = await Promise.all([
        batchedAllSettled(top, (sym) => client.getGlobalLongShortRatio(sym, '15m', 1).then((rows) => ({ sym, row: rows[0] }))),
        batchedAllSettled(top, (sym) => client.getTopLongShortPositionRatio(sym, '15m', 1).then((rows) => ({ sym, row: rows[0] }))),
      ]);

      for (const r of globalResults) {
        if (r.status === 'fulfilled' && r.value.row) {
          longShortCache.set(r.value.sym, {
            longShortRatio: Number(r.value.row.longShortRatio),
            longAccount: Number(r.value.row.longAccount),
          });
        }
      }
      for (const r of topResults) {
        if (r.status === 'fulfilled' && r.value.row) {
          const d = r.value.row;
          topPositionCache.set(r.value.sym, {
            longShortRatio: Number(d.longShortRatio),
            longPosition: Number(d.longAccount),   // API field is named longAccount but represents position %
            shortPosition: Number(d.shortAccount),
          });
        }
      }
    } catch (err) {
      console.error('[LongShort] Refresh error:', err.message);
    }
  };
  setTimeout(run, 8000);
  setInterval(run, 5 * 60 * 1000);
}

async function getHedgeMode(token = null) {
  const { apiKey, apiSecret } = getApiCredentials(token);
  if (hedgeModeCache.has(apiKey)) return hedgeModeCache.get(apiKey);
  try {
    const mode = await client.getPositionMode({ apiKey, apiSecret });
    hedgeModeCache.set(apiKey, mode);
    console.log(`[PositionMode] Account is in ${mode ? 'Hedge' : 'One-way'} mode.`);
    return mode;
  } catch {
    hedgeModeCache.set(apiKey, false);
    return false;
  }
}

function getApiCredentials(token = null) {
  const creds = token ? sessionCredentials.get(token) : null;
  let apiKey = creds?.apiKey || process.env.BINANCE_API_KEY;
  let apiSecret = creds?.apiSecret || process.env.BINANCE_API_SECRET;
  // Background services (auto-trader, TSL) run with token=null — fall back to any logged-in session
  if ((!apiKey || !apiSecret) && sessionCredentials.size > 0) {
    const first = sessionCredentials.values().next().value;
    apiKey = apiKey || first?.apiKey;
    apiSecret = apiSecret || first?.apiSecret;
  }
  if (!apiKey || !apiSecret) throw new Error('Missing Binance API credentials. Enter API key on login or set BINANCE_API_KEY in .env.');
  return { apiKey, apiSecret };
}

async function getAccountBalance(token = null) {
  const { apiKey, apiSecret } = getApiCredentials(token);
  const rows = await client.getBalance({ apiKey, apiSecret });
  return rows.filter((b) => Number(b.balance) > 0 || Number(b.crossUnPnl) !== 0);
}

async function getDailyPnl(token = null) {
  const { apiKey, apiSecret } = getApiCredentials(token);
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const rows = await client.getIncome({ startTime: startOfDay.getTime(), limit: 1000, apiKey, apiSecret });
  let realized = 0; let commission = 0; let funding = 0;
  for (const r of rows) {
    const v = Number(r.income);
    if (r.incomeType === 'REALIZED_PNL') realized += v;
    else if (r.incomeType === 'COMMISSION') commission += v;
    else if (r.incomeType === 'FUNDING_FEE') funding += v;
  }
  return { realized, commission, funding, net: realized + commission + funding, since: startOfDay.toISOString() };
}

async function getPositions(token = null) {
  const { apiKey, apiSecret } = getApiCredentials(token);
  const rows = await client.getPositions({ apiKey, apiSecret });
  return rows.filter((p) => Number(p.positionAmt) !== 0);
}

async function getOpenOrders(symbol, token = null) {
  const { apiKey, apiSecret } = getApiCredentials(token);
  return client.getOpenOrders({ symbol, apiKey, apiSecret });
}

async function getOpenAlgoOrdersList(token = null) {
  const { apiKey, apiSecret } = getApiCredentials(token);
  const result = await client.getOpenAlgoOrders({ apiKey, apiSecret });
  return Array.isArray(result?.orders) ? result.orders : Array.isArray(result) ? result : [];
}

async function getRecentTrades(symbol, limit, token = null) {
  const { apiKey, apiSecret } = getApiCredentials(token);
  return client.getUserTrades({ symbol, limit, apiKey, apiSecret });
}

async function cancelOrder(payload, token = null) {
  const symbol = normalizeSymbol(payload.symbol ?? '');
  const orderId = Number(payload.orderId);
  if (!symbol || !orderId) throw new Error('symbol and orderId are required.');
  const { apiKey, apiSecret } = getApiCredentials(token);
  return client.cancelOrder({ symbol, orderId, apiKey, apiSecret });
}

async function cancelAllOrdersForSymbol(symbol, apiKey, apiSecret) {
  const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);
  let regularCount = 0;
  let algoCount = 0;

  try {
    await client.cancelAllOpenOrders({ symbol, apiKey, apiSecret, recvWindow });
    regularCount = 1; // API doesn't return count, just success
    console.log(`[CancelAll] ${symbol} regular orders cancelled`);
  } catch (err) {
    // -2011 = no open orders, not a real error
    if (!err.message?.includes('-2011')) {
      console.warn(`[CancelAll] ${symbol} regular: ${err.message}`);
    }
  }

  try {
    const algoResult = await client.getOpenAlgoOrders({ apiKey, apiSecret, recvWindow });
    const allAlgo = Array.isArray(algoResult?.orders) ? algoResult.orders : Array.isArray(algoResult) ? algoResult : [];
    // Filter client-side: only cancel orders belonging to this symbol
    const algoOrders = allAlgo.filter((o) => o.symbol === symbol);
    for (const o of algoOrders) {
      try {
        await client.cancelAlgoOrder({ algoId: o.algoId, apiKey, apiSecret, recvWindow });
        algoCount += 1;
      } catch (err) {
        console.warn(`[CancelAll] ${symbol} algoId=${o.algoId}: ${err.message}`);
      }
    }
    if (algoCount > 0) console.log(`[CancelAll] ${symbol} ${algoCount} algo order(s) cancelled`);
  } catch (err) {
    console.warn(`[CancelAll] ${symbol} algo fetch: ${err.message}`);
  }

  return { symbol, regularCount, algoCount };
}

const lastKnownPositions = new Map(); // symbol → { unRealizedProfit, positionAmt }

async function runStaleOrderCleaner() {
  try {
    const { apiKey, apiSecret } = getApiCredentials(null);
    const positions = await client.getPositions({ apiKey, apiSecret });
    const activeMap = new Map(
      positions
        .filter((p) => Number(p.positionAmt) !== 0)
        .map((p) => [p.symbol, { unRealizedProfit: Number(p.unRealizedProfit), positionAmt: Number(p.positionAmt) }]),
    );

    if (lastKnownPositions.size > 0) {
      for (const [sym, prev] of lastKnownPositions) {
        if (activeMap.has(sym)) continue;

        avgDownFired.delete(sym);
        tpMovedToEntry.delete(sym);
        negativeSince.delete(sym);
        if (slTracking.positions[sym]) {
          delete slTracking.positions[sym];
          saveSlTracking();
        }
        console.log(`[StaleOrders] ${sym} closed → cancelling open orders`);
        cancelAllOrdersForSymbol(sym, apiKey, apiSecret).catch((err) =>
          console.warn(`[StaleOrders] ${sym}: ${err.message}`),
        );

        // Detect SL: fetch last few trades, if closing trade has negative realizedPnl → blacklist 2h
        try {
          const trades = await client.getUserTrades({ symbol: sym, limit: 5, apiKey, apiSecret });
          if (trades.length > 0) {
            const last = trades[trades.length - 1];
            const pnl = Number(last.realizedPnl);
            if (pnl < 0) {
              await addToDynamicBlacklist(sym, 2 * 60 * 60 * 1000, `SL hit pnl=${pnl.toFixed(4)}`);
            }
          }
        } catch (err) {
          console.warn(`[StaleOrders] ${sym} trade check: ${err.message}`);
        }
      }
    }

    lastKnownPositions.clear();
    for (const [sym, data] of activeMap) lastKnownPositions.set(sym, data);

    // Cancel LIMIT orders older than STALE_ORDER_TIMEOUT_MS (default 30 min)
    const staleMs = Number(process.env.STALE_ORDER_TIMEOUT_MS ?? 30 * 60 * 1000);
    if (staleMs > 0) {
      const allOrders = await client.getOpenOrders({ apiKey, apiSecret });
      const now = Date.now();
      const stale = allOrders.filter(
        (o) => o.type === 'LIMIT' && !o.reduceOnly && (now - Number(o.time)) > staleMs,
      );
      for (const o of stale) {
        const ageMin = Math.round((now - Number(o.time)) / 60000);
        try {
          await client.cancelOrder({ symbol: o.symbol, orderId: o.orderId, apiKey, apiSecret });
          console.log(`[StaleOrders] Cancelled ${o.symbol} #${o.orderId} LIMIT ${o.side} — ${ageMin}min old`);
        } catch (err) {
          console.warn(`[StaleOrders] Cancel ${o.symbol} #${o.orderId}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    if (err.message?.includes('Missing Binance API')) return;
    console.error('[StaleOrders] Scan error:', err.message);
  }
}

function getTargetLockRoe(roe) {
  if (roe < 15) return null;
  // Every 5% above 15% raises the floor by 5% (lock = trigger - 10)
  // 15→5, 20→10, 25→15, 30→20, ...
  const steps = Math.floor((roe - 15) / 5);
  return (15 + steps * 5) - 10;
}

const slTrailRunning = new Set();

async function handleSlTrailByProfit(symbol, pos, roe) {
  if (process.env.AUTO_SL_ENABLED === 'false') return;
  if (slTrailRunning.has(symbol)) return;

  const tracked = slTracking.positions[symbol];
  if (!tracked?.slPlaced) return;

  const targetLockRoe = getTargetLockRoe(roe);
  if (targetLockRoe === null) return;

  const currentLockRoe = tracked.slLockRoe ?? -Infinity;
  if (targetLockRoe <= currentLockRoe) return;

  slTrailRunning.add(symbol);
  try {
    const { apiKey, apiSecret } = getApiCredentials(null);
    const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);

    const [algoResult, symbolList] = await Promise.all([
      client.getOpenAlgoOrders({ apiKey, apiSecret }),
      getSymbols(),
    ]);
    const allAlgo = Array.isArray(algoResult?.orders) ? algoResult.orders : Array.isArray(algoResult) ? algoResult : [];

    const symbolInfo = symbolList.find((s) => s.symbol === symbol);
    if (!symbolInfo) return;

    const isLong = pos.amt > 0;
    const entry = pos.entry;
    const leverage = pos.leverage || 10;

    const newSlPrice = priceFromTick(
      symbolInfo,
      isLong
        ? entry * (1 + (targetLockRoe / 100) / leverage)
        : entry * (1 - (targetLockRoe / 100) / leverage),
    );

    const slOrder = allAlgo.find((o) => {
      if (o.symbol !== symbol) return false;
      const t = String(o.type ?? '').toUpperCase();
      return t === 'STOP_MARKET' || t === 'STOP';
    });

    if (slOrder) {
      const curSl = Number(slOrder.triggerPrice);
      if ((isLong && curSl >= newSlPrice) || (!isLong && curSl <= newSlPrice)) {
        tracked.slLockRoe = targetLockRoe;
        saveSlTracking();
        return;
      }
      await client.cancelAlgoOrder({ algoId: slOrder.algoId, apiKey, apiSecret, recvWindow });
    }

    const lotSize = symbolInfo.filters?.find((f) => f.filterType === 'LOT_SIZE');
    const stepSize = Number(lotSize?.stepSize ?? 10 ** -Number(symbolInfo.quantityPrecision ?? 3));
    const steppedQty = Math.floor(Math.abs(pos.amt) / stepSize) * stepSize;
    const quantity = steppedQty.toFixed(decimalsFromStep(stepSize)).replace(/\.?0+$/, '');

    const positionSide = pos.positionSide ?? 'BOTH';
    const isHedge = positionSide !== 'BOTH';

    const slParams = {
      algoType: 'CONDITIONAL',
      symbol,
      side: isLong ? 'SELL' : 'BUY',
      type: 'STOP_MARKET',
      triggerPrice: String(newSlPrice),
      quantity,
      workingType: 'MARK_PRICE',
      recvWindow,
      newClientOrderId: `lp_slt_${Date.now()}`.slice(0, 36),
    };
    if (isHedge) { slParams.positionSide = positionSide; } else { slParams.reduceOnly = 'true'; }

    await client.placeAlgoOrder({ params: slParams, apiKey, apiSecret });
    tracked.slLockRoe = targetLockRoe;
    tracked.slPrice = newSlPrice;
    tracked.slUpdatedAt = new Date().toISOString();
    saveSlTracking();
    console.log(`[SlTrail] ✅ ${symbol} ROE=${roe.toFixed(1)}% → SL dời lên +${targetLockRoe}% ROE @ ${newSlPrice}`);
  } catch (err) {
    console.error(`[SlTrail] ❌ ${symbol}:`, err.message);
  } finally {
    slTrailRunning.delete(symbol);
  }
}

async function triggerSlGuardForSymbol(symbol) {
  try {
    const { apiKey, apiSecret } = getApiCredentials(null);
    const positions = await client.getPositions({ apiKey, apiSecret });
    const pos = positions.find((p) => p.symbol === symbol && Number(p.positionAmt) !== 0);
    if (!pos) return;
    const allOrders = await client.getOpenOrders({ apiKey, apiSecret });
    await handleMissingSl([pos], allOrders, apiKey, apiSecret);
  } catch (err) {
    if (err.message?.includes('Missing Binance API')) return;
    console.error(`[SlGuard] triggerSlGuard ${symbol}:`, err.message);
  }
}

async function handleMissingSl(rawPositions, allOrders, apiKey, apiSecret) {
  if (process.env.AUTO_SL_ENABLED === 'false') return;
  const slRoe = Number(process.env.AUTO_SL_ROE ?? 25);
  if (slRoe <= 0) return;

  const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);

  let algoOrders = null;
  const getAlgoOrders = async () => {
    if (algoOrders !== null) return algoOrders;
    const result = await client.getOpenAlgoOrders({ apiKey, apiSecret });
    algoOrders = Array.isArray(result?.orders) ? result.orders : Array.isArray(result) ? result : [];
    return algoOrders;
  };

  const symbols = await getSymbols();

  for (const p of rawPositions) {
    const symbol = p.symbol;

    // Only process positions registered in sl-tracking.json (opened after json was created)
    const tracked = slTracking.positions[symbol];
    if (!tracked) continue;
    if (tracked.slPlaced) continue;

    const entry = Number(p.entryPrice);
    const amt = Number(p.positionAmt);
    const leverage = Number(p.leverage) || 10;
    if (!entry || !amt) continue;

    // Skip positions already in loss
    const markPrice = Number(p.markPrice ?? 0);
    if (markPrice > 0) {
      const currentRoe = ((markPrice - entry) / entry) * leverage * (amt > 0 ? 1 : -1) * 100;
      if (currentRoe < 0) continue;
    }

    // Check regular STOP_MARKET orders
    const hasRegularSl = allOrders.some((o) => o.symbol === symbol && (o.type === 'STOP_MARKET' || o.type === 'STOP'));
    if (hasRegularSl) {
      slTracking.positions[symbol].slPlaced = true;
      saveSlTracking();
      continue;
    }

    // Check algo STOP_MARKET orders (lazy-loaded once per cycle)
    const algo = await getAlgoOrders();
    const hasAlgoSl = algo.some((o) => {
      if (o.symbol !== symbol) return false;
      const t = String(o.type ?? '').toUpperCase();
      return t === 'STOP_MARKET' || t === 'STOP';
    });
    if (hasAlgoSl) {
      slTracking.positions[symbol].slPlaced = true;
      saveSlTracking();
      continue;
    }

    const isLong = amt > 0;
    const rawSlPrice = isLong
      ? entry * (1 - (slRoe / 100) / leverage)
      : entry * (1 + (slRoe / 100) / leverage);

    const symbolInfo = symbols.find((s) => s.symbol === symbol);
    if (!symbolInfo) continue;
    const slPrice = priceFromTick(symbolInfo, rawSlPrice);

    const lotSize = symbolInfo.filters?.find((f) => f.filterType === 'LOT_SIZE');
    const stepSize = Number(lotSize?.stepSize ?? 10 ** -Number(symbolInfo.quantityPrecision ?? 3));
    const steppedQty = Math.floor(Math.abs(amt) / stepSize) * stepSize;
    const quantity = steppedQty.toFixed(decimalsFromStep(stepSize)).replace(/\.?0+$/, '');

    const positionSide = p.positionSide ?? 'BOTH';
    const isHedge = positionSide !== 'BOTH';

    const slParams = {
      algoType: 'CONDITIONAL',
      symbol,
      side: isLong ? 'SELL' : 'BUY',
      type: 'STOP_MARKET',
      triggerPrice: String(slPrice),
      quantity,
      workingType: 'MARK_PRICE',
      recvWindow,
      newClientOrderId: `lp_slg_${Date.now()}`.slice(0, 36),
    };
    if (isHedge) { slParams.positionSide = positionSide; } else { slParams.reduceOnly = 'true'; }

    try {
      await client.placeAlgoOrder({ params: slParams, apiKey, apiSecret });
      slTracking.positions[symbol].slPlaced = true;
      slTracking.positions[symbol].slPrice = slPrice;
      slTracking.positions[symbol].slPlacedAt = new Date().toISOString();
      saveSlTracking();
      console.log(`[SlGuard] ✅ ${symbol} ${isLong ? 'LONG' : 'SHORT'} entry=${entry} lev=${leverage}x → SL @ ${slPrice} (-${slRoe}% ROE)`);
    } catch (err) {
      console.error(`[SlGuard] ❌ ${symbol}: ${err.message}`);
    }
  }
}

const negativeSince = new Map(); // symbol → timestamp when position first went negative

const tpMovedToEntry = new Map(); // symbol → entryPrice when TP was moved to entry

async function handleTpEntryGuard(symbol, pos, markPrice, roe) {
  const entry = pos.entry;

  // Already moved for this entry price
  const prevEntry = tpMovedToEntry.get(symbol);
  if (prevEntry !== undefined && Math.abs(prevEntry - entry) / entry < 0.005) return;

  try {
    const { apiKey, apiSecret } = getApiCredentials(null);
    const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);

    const [algoResult, symbols] = await Promise.all([
      client.getOpenAlgoOrders({ apiKey, apiSecret }),
      getSymbols(),
    ]);

    const allAlgo = Array.isArray(algoResult?.orders) ? algoResult.orders : Array.isArray(algoResult) ? algoResult : [];
    const tpOrder = allAlgo.find((o) => {
      if (o.symbol !== symbol) return false;
      const t = String(o.type ?? '').toUpperCase();
      return t === 'TAKE_PROFIT_MARKET' || t === 'TAKE_PROFIT';
    });
    if (!tpOrder) return;

    const isLong = pos.amt > 0;
    const currentTpPrice = Number(tpOrder.triggerPrice);
    if (isLong && currentTpPrice <= entry) return;
    if (!isLong && currentTpPrice >= entry) return;

    const symbolInfo = symbols.find((s) => s.symbol === symbol);
    if (!symbolInfo) return;

    const newTpPrice = priceFromTick(symbolInfo, entry);
    const lotSize = symbolInfo.filters?.find((f) => f.filterType === 'LOT_SIZE');
    const stepSize = Number(lotSize?.stepSize ?? 10 ** -Number(symbolInfo.quantityPrecision ?? 3));
    const steppedQty = Math.floor(Math.abs(pos.amt) / stepSize) * stepSize;
    const quantity = steppedQty.toFixed(decimalsFromStep(stepSize)).replace(/\.?0+$/, '');

    const positionSide = pos.positionSide ?? 'BOTH';
    const isHedge = positionSide !== 'BOTH';

    await client.cancelAlgoOrder({ algoId: tpOrder.algoId, apiKey, apiSecret, recvWindow });
    const tpParams = {
      algoType: 'CONDITIONAL',
      symbol,
      side: isLong ? 'SELL' : 'BUY',
      type: 'TAKE_PROFIT_MARKET',
      triggerPrice: String(newTpPrice),
      quantity,
      workingType: 'MARK_PRICE',
      recvWindow,
      newClientOrderId: `lp_tpe_${Date.now()}`.slice(0, 36),
    };
    if (isHedge) { tpParams.positionSide = positionSide; } else { tpParams.reduceOnly = 'true'; }

    await client.placeAlgoOrder({ params: tpParams, apiKey, apiSecret });
    tpMovedToEntry.set(symbol, entry);
    console.log(`[TpGuard] ${symbol} ROE=${roe.toFixed(1)}% → TP moved to entry ${newTpPrice}`);
  } catch (err) {
    console.error(`[TpGuard] ${symbol} failed:`, err.message);
  }
}

async function handleNegativeTimeoutTp(symbol, pos) {
  const entry = pos.entry;

  // Dedup: already set TP to entry for this position
  const prevEntry = tpMovedToEntry.get(symbol);
  if (prevEntry !== undefined && Math.abs(prevEntry - entry) / entry < 0.005) return;

  try {
    const { apiKey, apiSecret } = getApiCredentials(null);
    const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);

    const [algoResult, symbols] = await Promise.all([
      client.getOpenAlgoOrders({ apiKey, apiSecret }),
      getSymbols(),
    ]);
    const allAlgo = Array.isArray(algoResult?.orders) ? algoResult.orders : Array.isArray(algoResult) ? algoResult : [];

    const symbolInfo = symbols.find((s) => s.symbol === symbol);
    if (!symbolInfo) return;

    const isLong = pos.amt > 0;
    const newTpPrice = priceFromTick(symbolInfo, entry);

    // Cancel existing TP if price not yet at entry
    const tpOrder = allAlgo.find((o) => {
      if (o.symbol !== symbol) return false;
      const t = String(o.type ?? '').toUpperCase();
      return t === 'TAKE_PROFIT_MARKET' || t === 'TAKE_PROFIT';
    });
    if (tpOrder) {
      const cur = Number(tpOrder.triggerPrice);
      if ((isLong && cur <= entry) || (!isLong && cur >= entry)) {
        tpMovedToEntry.set(symbol, entry);
        return;
      }
      await client.cancelAlgoOrder({ algoId: tpOrder.algoId, apiKey, apiSecret, recvWindow });
    }

    const lotSize = symbolInfo.filters?.find((f) => f.filterType === 'LOT_SIZE');
    const stepSize = Number(lotSize?.stepSize ?? 10 ** -Number(symbolInfo.quantityPrecision ?? 3));
    const steppedQty = Math.floor(Math.abs(pos.amt) / stepSize) * stepSize;
    const quantity = steppedQty.toFixed(decimalsFromStep(stepSize)).replace(/\.?0+$/, '');

    const positionSide = pos.positionSide ?? 'BOTH';
    const isHedge = positionSide !== 'BOTH';

    const tpParams = {
      algoType: 'CONDITIONAL',
      symbol,
      side: isLong ? 'SELL' : 'BUY',
      type: 'TAKE_PROFIT_MARKET',
      triggerPrice: String(newTpPrice),
      quantity,
      workingType: 'MARK_PRICE',
      recvWindow,
      newClientOrderId: `lp_neg_tp_${Date.now()}`.slice(0, 36),
    };
    if (isHedge) { tpParams.positionSide = positionSide; } else { tpParams.reduceOnly = 'true'; }

    await client.placeAlgoOrder({ params: tpParams, apiKey, apiSecret });
    tpMovedToEntry.set(symbol, entry);

    const hours = ((Date.now() - (negativeSince.get(symbol) ?? Date.now())) / 3_600_000).toFixed(1);
    console.log(`[NegTp] ✅ ${symbol} âm ${hours}h liên tiếp → TP đặt về entry ${newTpPrice}`);
  } catch (err) {
    console.error(`[NegTp] ❌ ${symbol}:`, err.message);
  }
}

const avgDownFired = new Map(); // symbol → entryPrice when avg-down was placed

async function handleAvgDown(symbol, pos, roe) {
  if (process.env.AVG_DOWN_ENABLED !== 'true') return;

  const entry = pos.entry;
  // Dedup: already placed for this entry (within 0.5% = same position, not re-opened)
  const prevEntry = avgDownFired.get(symbol);
  if (prevEntry !== undefined && Math.abs(prevEntry - entry) / entry < 0.005) return;

  try {
    const { apiKey, apiSecret } = getApiCredentials(null);
    const marginUsdt = Number(process.env.AVG_DOWN_MARGIN_USDT ?? 2);
    const leverage = pos.leverage || Number(process.env.AUTO_TRADE_LEVERAGE ?? 10);
    const notionalUsdt = marginUsdt * leverage;
    const side = pos.amt > 0 ? 'BUY' : 'SELL';

    avgDownFired.set(symbol, entry); // mark before placing to prevent re-entry on concurrent ticks

    if (runtimeSettings.dryRun) {
      console.log(`[AvgDown] [DRY] ${symbol} ROE=${roe.toFixed(1)}% → would avg-down $${marginUsdt} ${side}`);
      return;
    }

    await placeOrder({ symbol, side, notionalUsdt, leverage, dryRun: false, source: 'avg-down' });
    console.log(`[AvgDown] ✅ ${symbol} ROE=${roe.toFixed(1)}% → avg-down $${marginUsdt} ${side}`);
  } catch (err) {
    avgDownFired.delete(symbol); // allow retry on failure
    console.error(`[AvgDown] ❌ ${symbol}:`, err.message);
  }
}

async function closePosition(payload, token = null) {
  const symbol = normalizeSymbol(payload.symbol ?? '');
  const positionAmt = Number(payload.positionAmt);
  if (!symbol || !positionAmt) throw new Error('symbol and positionAmt are required.');
  const side = positionAmt > 0 ? 'SELL' : 'BUY';
  const quantity = Math.abs(positionAmt);
  const { apiKey, apiSecret } = getApiCredentials(token);
  const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);

  const [symbols, premiumIndex] = await Promise.all([
    getSymbols(),
    client.getPremiumIndex(symbol),
  ]);
  const symbolInfo = symbols.find((s) => s.symbol === symbol);
  if (!symbolInfo) throw new Error(`Symbol ${symbol} not found.`);

  const markPrice = Number(premiumIndex.markPrice);
  const steppedQty = quantityFromNotional(symbolInfo, quantity * markPrice, markPrice);

  const isHedge = await getHedgeMode(token);
  const closeParams = {
    symbol,
    side,
    type: 'MARKET',
    quantity: steppedQty,
    recvWindow,
    newClientOrderId: `lp_close_${Date.now()}`,
  };
  if (isHedge) {
    closeParams.positionSide = positionAmt > 0 ? 'LONG' : 'SHORT';
  } else {
    closeParams.reduceOnly = 'true';
  }

  const result = await client.placeFuturesOrder({ params: closeParams, apiKey, apiSecret });
  // Cancel all dangling TP/SL/algo orders for this symbol (non-blocking)
  cancelAllOrdersForSymbol(symbol, apiKey, apiSecret).catch((err) =>
    console.warn(`[CancelAll] post-close ${symbol}: ${err.message}`),
  );
  return result;
}

async function sendStatic(pathname, response) {
  const staticPath = pathname === '/'
    ? '/index.html'
    : pathname === '/signals'
      ? '/signals.html'
      : pathname === '/orders'
        ? '/orders.html'
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
