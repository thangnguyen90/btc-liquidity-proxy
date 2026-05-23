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
import { startDiscordScanner, startLiqImbalanceScanner, startVolumeDumpScanner, getVolDumpFlags, getHighVolData, isDiscordCoolingDown, tryNotifySignal, sendSignalDetected, sendOrderPlaced, sendOrderBlocked, summarizeTopTraderTrend, formatTopTraderTrend } from './discordNotifier.js';
import { KlineCache } from './klineCache.js';
import { runPumpScan } from './pumpDetector.js';
import { runCapScan }  from './capDetector.js';
import { runKillShortScan } from './killShortDetector.js';
import { startTrailingStopScanner } from './trailingStop.js';
import { startBtcReversalGuard } from './btcReversalGuard.js';
import { startPositionMonitor } from './positionMonitor.js';
import { createMarkPriceTicker } from './markPriceTicker.js';
import WebSocket from 'ws';

loadEnv();

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const publicDir = join(rootDir, 'public');
const client = new BinanceClient({
  baseUrl: process.env.BINANCE_FUTURES_BASE_URL || undefined,
});
const klineCache = new KlineCache({ client, maxKlines: 500 });
const pumpScanCache = { data: null, expiresAt: 0 };
const capScanCache       = { data: null, expiresAt: 0 };
const killShortScanCache = { data: null, expiresAt: 0 };

// ── SSE helpers ───────────────────────────────────────────────────────────────
const pumpSseClients = new Set();
const capSseClients       = new Set();
const killShortSseClients = new Set();

function pushSse(clients, data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

// ── Debounced scans triggered by 15m candle close ────────────────────────────
let _pumpScanDebounce = null;
async function schedulePumpScan() {
  clearTimeout(_pumpScanDebounce);
  _pumpScanDebounce = setTimeout(async () => {
    try {
      const snapshot    = await getMarketSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols  = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runPumpScan(topSymbols, klineCache, snapshotMap);
      const cacheStats = klineCache.stats('15m');
      const result = { signals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      pumpScanCache.data = result;
      pumpScanCache.expiresAt = Date.now() + 30_000;
      pushSse(pumpSseClients, result);
      // Auto-order: đặt LIMIT $1 cho signal score≥90 + marketOk
      // Dùng cached open orders — chỉ gọi API 1 lần, tái sử dụng cho toàn bộ signals
      if (runtimeSettings.pumpAutoOrderEnabled && signals.length > 0 && !isVnBlockHour()) {
        try {
          const { apiKey, apiSecret } = getApiCredentials(null);
          const openOrders = await getCachedOpenOrders(apiKey, apiSecret);
          for (const sig of signals) {
            handlePumpAutoOrder(sig, openOrders).catch((e) => console.error('[PumpAuto] unhandled:', e.message));
          }
        } catch (e) {
          console.error('[PumpAuto] getOpenOrders failed:', e.message);
        }
      }

      // Auto-tạo paper trade — chỉ những signal đủ điều kiện real auto-order
      // để paper stats phản ánh đúng hiệu quả thực của hệ thống
      for (const sig of signals) {
        if (sig.score < 75) continue;                              // paper: 75+ (real auto-order cần 80+)
        if ((sig.factors?.chasePct ?? 0) > 0.30) continue;        // chase quá cao
        if (sig.marketOk === false) continue;                      // too far from EMA
        if ((sig.factors?.emaRibbon ?? 1) === 0) continue;        // EMA không bullish
        const key = `${sig.symbol}|${sig.type}`;
        const last = pumpPaperAutoFired.get(key) ?? 0;
        if (Date.now() - last < 4 * 3600 * 1000) continue;
        pumpPaperAutoFired.set(key, Date.now());
        createPumpPaperTrade({
          symbol: sig.symbol,
          side: sig.action,
          marginUsdt: 1,
          leverage: 10,
          entryPrice: sig.entry,
          tp: sig.tp ?? null,
          sl: sig.sl ?? null,
          source: `pump-${sig.score}`,
          note: sig.note ?? '',
        }).catch(() => {});
        if (pumpPaperTicker) syncPumpPaperTicker().catch(() => {});
      }
    } catch (e) {
      console.error('[PumpScan] error:', e.message);
    }
  }, 2_000);
}

const capPaperAutoFired = new Map(); // `${symbol}|${type}` → firedAt timestamp
const pumpPaperAutoFired = new Map(); // `${symbol}|${type}` → firedAt timestamp

let _capScanDebounce = null;
async function scheduleCapScan() {
  clearTimeout(_capScanDebounce);
  _capScanDebounce = setTimeout(async () => {
    try {
      const snapshot    = await getMarketSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols  = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runCapScan(topSymbols, klineCache, snapshotMap);
      const cacheStats = klineCache.stats('15m');
      const result = { signals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      capScanCache.data = result;
      capScanCache.expiresAt = Date.now() + 30_000;
      pushSse(capSseClients, result);
      if (signals.length > 0)
        console.log(`[CapScan] ${signals.length} signal(s): ${signals.map(s => `${s.symbol}(${s.type} ${s.score})`).join(', ')}`);

      // Auto-tạo paper trade cho mỗi signal mới (dedup 4h theo symbol+type)
      for (const sig of signals) {
        const key = `${sig.symbol}|${sig.type}`;
        const last = capPaperAutoFired.get(key) ?? 0;
        if (Date.now() - last < 4 * 3600 * 1000) { console.log(`[CapPaper] skip ${key} — cooldown ${Math.round((Date.now()-last)/60000)}m ago`); continue; }
        capPaperAutoFired.set(key, Date.now());
        createCapPaperTrade({
          symbol: sig.symbol,
          side: sig.action,
          marginUsdt: 1,
          leverage: 10,
          entryPrice: sig.entry,
          tp: sig.tp ?? null,
          sl: sig.sl ?? null,
          source: `cap-${sig.score}`,
          note: sig.note ?? '',
        }).then(() => syncCapPaperTicker()).catch((e) => console.warn(`[CapPaper] auto create ${sig.symbol}:`, e.message));
      }
    } catch (e) {
      console.error('[CapScan] error:', e.message);
    }
  }, 2_000);
}

let _killShortScanDebounce = null;
async function scheduleKillShortScan() {
  clearTimeout(_killShortScanDebounce);
  _killShortScanDebounce = setTimeout(async () => {
    try {
      const snapshot    = await getMarketSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols  = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runKillShortScan(topSymbols, klineCache, snapshotMap);
      const cacheStats = klineCache.stats('15m');
      const result = { signals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      killShortScanCache.data = result;
      killShortScanCache.expiresAt = Date.now() + 30_000;
      pushSse(killShortSseClients, result);
    } catch (e) {
      console.error('[KillShortScan] error:', e.message);
    }
  }, 2_000);
}

klineCache.on('candleClose', ({ interval }) => {
  if (interval !== '15m') return;
  schedulePumpScan();
  scheduleCapScan();
  scheduleKillShortScan();
});

// Scan theo tick (mỗi khi có cập nhật nến) với debounce 60s — bắt signal sớm hơn trong nến
let _tickScanDebounce = null;
klineCache.on('candleTick', ({ interval }) => {
  if (interval !== '15m') return;
  clearTimeout(_tickScanDebounce);
  _tickScanDebounce = setTimeout(() => {
    schedulePumpScan();
    scheduleCapScan();
    scheduleKillShortScan();
  }, 60_000);
});

// Chạy scan ngay sau 30s để có data ban đầu dù WebSocket chưa kết nối
setTimeout(() => { schedulePumpScan(); scheduleCapScan(); scheduleKillShortScan(); }, 30_000);

// Fallback: scan mỗi 2 phút kể cả khi WebSocket không có tick
let _staleReseedLock = false;
setInterval(async () => {
  schedulePumpScan();
  scheduleCapScan();
  scheduleKillShortScan();
  // Re-seed nếu WebSocket stale (không có tick trong 3 phút)
  const stats = klineCache.stats('15m');
  if (stats.isStale && !_staleReseedLock) {
    _staleReseedLock = true;
    try {
      const snapshot = await getMarketSnapshot();
      const topSymbols = snapshot.sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 400).map((r) => r.symbol);
      await klineCache.seed(topSymbols, '15m', 500);
      console.log('[KlineCache] Re-seed triggered (WebSocket stale)');
      schedulePumpScan();
      scheduleCapScan();
      scheduleKillShortScan();
    } catch {} finally {
      _staleReseedLock = false;
    }
  }
}, 2 * 60 * 1000);
const symbolCache = { data: null, expiresAt: 0 };
const snapshotCache = { data: null, expiresAt: 0, inflight: null };
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
  autoProbeEnabled: process.env.AUTO_LIQ_PROBE_BEFORE_CONFIRMATION === 'true',
  autoProbeMargin: Number(process.env.AUTO_LIQ_PROBE_MARGIN ?? 1),
  pumpAutoOrderEnabled: process.env.PUMP_AUTO_ORDER_ENABLED === 'true',
  pumpMaxLimitOrders: Number(process.env.AUTO_LIQ_MAX_LIMIT_ORDERS ?? 30),
  pumpMaxPositions: Number(process.env.AUTO_TRADE_MAX_POSITIONS ?? 0),
};
const sessionCredentials = new Map(); // token → { apiKey, apiSecret }

// Block auto orders 17:00–19:00 Vietnam time (UTC+7) every day
const VN_BLOCK_HOURS = new Set(
  (process.env.VN_BLOCK_HOURS ?? '17,18')
    .split(',').map((h) => parseInt(h.trim(), 10)).filter((h) => !isNaN(h)),
);
function isVnBlockHour() {
  const vnHour = new Date(Date.now() + 7 * 3600 * 1000).getUTCHours();
  return VN_BLOCK_HOURS.has(vnHour);
}
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
const PAPER_TRADES_FILE = join(rootDir, 'data', 'paper-trades.json');
const FILLS_DIR = join(rootDir, 'data', 'fills');
const PUMP_ORDERS_FILE = join(rootDir, 'data', 'pump-orders.json');
const PUMP_HISTORY_FILE = join(rootDir, 'data', 'pump-order-history.json');
const PUMP_DAILY_FILE   = join(rootDir, 'data', 'pump-daily-stats.json');
const CAP_PAPER_FILE    = join(rootDir, 'data', 'cap-paper-trades.json');
const PUMP_PAPER_FILE   = join(rootDir, 'data', 'pump-paper-trades.json');
const paperMarkCache = new Map(); // symbol → { markPrice, at }
let paperTicker = null;
const paperFillLocks = new Set();
const capMarkCache = new Map();  // symbol → markPrice  (for cap paper trades)
let capPaperTicker = null;
const capPaperFillLocks = new Set();
const pumpMarkCache = new Map(); // symbol → markPrice (for pump paper trades)
let pumpPaperTicker = null;
const pumpPaperFillLocks = new Set();

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

function detectFillSource(symbol) {
  if (pumpScanCache.data?.signals?.find((s) => s.symbol === symbol)) return 'pump';
  if (capScanCache.data?.signals?.find((s) => s.symbol === symbol)) return 'cap';
  if (killShortScanCache.data?.signals?.find((s) => s.symbol === symbol)) return 'killshort';
  return 'liq';
}

async function appendFillLog(record) {
  try {
    const source = record.source ?? detectFillSource(record.symbol);
    const dir = join(FILLS_DIR, source);
    await mkdir(dir, { recursive: true });
    const day = new Date(record.fillTime).toISOString().slice(0, 10);
    const file = join(dir, `${day}.json`);
    let arr = [];
    try { arr = JSON.parse(await readFile(file, 'utf8')); } catch {}
    arr.push({ ...record, source, loggedAt: new Date().toISOString() });
    await writeFile(file, JSON.stringify(arr, null, 2));
  } catch {}
}

// ── Pump pending orders — lưu LIMIT orders chờ khớp ─────────────────────────
let pumpPendingOrders = []; // [{ orderId, symbol, side, entry, qty, margin, score, placedAt }]
let pumpWatchingOrders = []; // filled orders awaiting position close → outcome tracking

async function loadPumpOrders() {
  try { pumpPendingOrders = JSON.parse(await readFile(PUMP_ORDERS_FILE, 'utf8')); } catch {}
}

async function savePumpOrders() {
  try {
    await mkdir(join(rootDir, 'data'), { recursive: true });
    await writeFile(PUMP_ORDERS_FILE, JSON.stringify(pumpPendingOrders, null, 2));
  } catch {}
}

async function addPumpPendingOrder(record) {
  pumpPendingOrders.push(record);
  await savePumpOrders();
}

// ── Pump order history — ghi kết quả thắng/thua ──────────────────────────────
async function upsertPumpHistory(record) {
  try {
    await mkdir(join(rootDir, 'data'), { recursive: true });
    let history = [];
    try { history = JSON.parse(await readFile(PUMP_HISTORY_FILE, 'utf8')); } catch {}
    const idx = history.findIndex((h) => h.orderId === record.orderId);
    if (idx >= 0) history[idx] = { ...history[idx], ...record };
    else history.push(record);
    await writeFile(PUMP_HISTORY_FILE, JSON.stringify(history, null, 2));
    if (record.status === 'CLOSED') await updatePumpDailyStats(record);
  } catch (e) {
    console.warn('[PumpHistory] upsert failed:', e.message);
  }
}

async function updatePumpDailyStats(record) {
  try {
    await mkdir(join(rootDir, 'data'), { recursive: true });
    let stats = {};
    try { stats = JSON.parse(await readFile(PUMP_DAILY_FILE, 'utf8')); } catch {}

    const date = new Date(record.closedAt ?? Date.now()).toISOString().slice(0, 10);
    const day = stats[date] ?? {
      date,
      orders: 0, wins: 0, losses: 0, manualClose: 0, canceled: 0,
      totalPnl: 0, totalRoe: 0, winRate: 0, avgPnl: 0,
      byType: {},
    };

    day.orders += 1;
    if (record.outcome === 'WIN')    day.wins       += 1;
    if (record.outcome === 'LOSS')   day.losses     += 1;
    if (record.outcome === 'MANUAL') day.manualClose += 1;
    if (record.outcome === 'CANCELED') day.canceled += 1;

    const pnl = Number(record.pnlUsdt ?? 0);
    const roe = Number(record.roe ?? 0);
    day.totalPnl = +(day.totalPnl + pnl).toFixed(4);
    day.totalRoe = +(day.totalRoe + roe).toFixed(2);

    const settled = day.wins + day.losses + day.manualClose;
    day.winRate = settled > 0 ? +((day.wins / settled) * 100).toFixed(1) : 0;
    day.avgPnl  = settled > 0 ? +(day.totalPnl / settled).toFixed(4) : 0;

    // Breakdown theo type (pump_breakout, early_dump, ...)
    const type = record.type ?? 'unknown';
    const t = day.byType[type] ?? { orders: 0, wins: 0, losses: 0, totalPnl: 0 };
    t.orders += 1;
    if (record.outcome === 'WIN')  t.wins   += 1;
    if (record.outcome === 'LOSS') t.losses += 1;
    t.totalPnl = +(t.totalPnl + pnl).toFixed(4);
    day.byType[type] = t;

    stats[date] = day;
    await writeFile(PUMP_DAILY_FILE, JSON.stringify(stats, null, 2));
    console.log(`[PumpDaily] ${date} ${record.symbol} ${record.outcome} pnl=${pnl >= 0 ? '+' : ''}${pnl}`);
  } catch (e) {
    console.warn('[PumpDaily] update failed:', e.message);
  }
}

async function loadPumpWatching() {
  try {
    const history = JSON.parse(await readFile(PUMP_HISTORY_FILE, 'utf8'));
    pumpWatchingOrders = history.filter((h) => h.status === 'FILLED');
    if (pumpWatchingOrders.length) console.log(`[PumpHistory] Loaded ${pumpWatchingOrders.length} watching order(s)`);
  } catch {}
}

async function pollPumpWatching() {
  if (!pumpWatchingOrders.length) return;
  let creds;
  try { creds = getApiCredentials(null); } catch { return; }
  const { apiKey, apiSecret } = creds;
  const stillWatching = [];
  for (const o of pumpWatchingOrders) {
    try {
      const positions = await client.getPositions({ apiKey, apiSecret, symbol: o.symbol }).catch(() => []);
      const pos = positions.find((p) => p.symbol === o.symbol);
      const posAmt = Math.abs(Number(pos?.positionAmt ?? 0));
      if (posAmt > 0) {
        stillWatching.push(o); // position still open
        continue;
      }
      // Position closed — determine outcome from recent trades
      const trades = await client.getUserTrades({ symbol: o.symbol, limit: 10, apiKey, apiSecret }).catch(() => []);
      const closingTrades = trades.filter((t) => Number(t.time ?? 0) >= (o.filledAt ?? 0) && t.realizedPnl !== undefined && Number(t.realizedPnl) !== 0);
      let pnlUsdt = 0;
      for (const t of closingTrades) pnlUsdt += Number(t.realizedPnl ?? 0);
      const outcome = pnlUsdt > 0 ? 'WIN' : pnlUsdt < 0 ? 'LOSS' : 'MANUAL';
      const roe = o.margin > 0 ? +((pnlUsdt / o.margin) * 100).toFixed(2) : 0;
      const closedAt = closingTrades.length ? Math.max(...closingTrades.map((t) => Number(t.time))) : Date.now();
      console.log(`[PumpHistory] ${outcome} ${o.symbol} pnl=${pnlUsdt.toFixed(4)} roe=${roe}%`);
      await upsertPumpHistory({ ...o, status: 'CLOSED', outcome, pnlUsdt: +pnlUsdt.toFixed(6), roe, closedAt });
    } catch (e) {
      console.warn(`[PumpHistory] watch ${o.symbol}:`, e.message);
      stillWatching.push(o);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  pumpWatchingOrders = stillWatching;
}

async function pollPumpOrders() {
  if (!pumpPendingOrders.length) return;
  let creds;
  try { creds = getApiCredentials(null); } catch { return; }
  const { apiKey, apiSecret } = creds;
  const remaining = [];
  for (const o of pumpPendingOrders) {
    try {
      const order = await client.getOrder({ symbol: o.symbol, orderId: o.orderId, apiKey, apiSecret });
      const status = String(order.status ?? '').toUpperCase();
      if (status === 'FILLED') {
        const avgPrice = Number(order.avgPrice ?? o.entry);
        console.log(`[PumpOrders] ✅ FILLED ${o.symbol} orderId=${o.orderId} @ ${avgPrice}`);
        invalidateOpenOrdersCache();
        const histRecord = { ...o, fillPrice: avgPrice, filledAt: Number(order.updateTime ?? Date.now()), status: 'FILLED' };
        await upsertPumpHistory(histRecord);
        pumpWatchingOrders.push(histRecord);
        // Đặt TP_MARKET ngay sau khi fill
        if (o.tp && o.qty && creds) {
          const { apiKey, apiSecret } = creds;
          const symbols = await getSymbols().catch(() => []);
          const info = symbols.find((s) => s.symbol === o.symbol);
          const tickSize = Number(info?.filters?.find((f) => f.filterType === 'PRICE_FILTER')?.tickSize ?? 0);
          const stepSize = Number(info?.filters?.find((f) => f.filterType === 'LOT_SIZE')?.stepSize ?? 0);
          const tpPriceStr = tickSize > 0
            ? o.tp.toFixed(Math.max(0, -Math.floor(Math.log10(tickSize))))
            : o.tp.toFixed(8);
          const qtyStr = stepSize > 0
            ? o.qty.toFixed(Math.max(0, -Math.floor(Math.log10(stepSize))))
            : o.qty.toFixed(6);
          const tpSide = o.side === 'BUY' ? 'SELL' : 'BUY';
          const tpParams = {
            symbol: o.symbol,
            side: tpSide,
            type: 'TAKE_PROFIT_MARKET',
            stopPrice: tpPriceStr,
            quantity: qtyStr,
            workingType: 'MARK_PRICE',
            reduceOnly: 'true',
            recvWindow: Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000),
            newClientOrderId: `lp_ptp_${o.orderId}`.slice(0, 36),
          };
          try {
            await client.placeFuturesOrder({ params: tpParams, apiKey, apiSecret })
              .catch(async (e) => {
                // Fallback to algo order if TAKE_PROFIT_MARKET not supported
                if (e.message?.includes('not supported') || e.message?.includes('Algo')) {
                  const algoParams = { ...tpParams, algoType: 'CONDITIONAL', triggerPrice: tpPriceStr };
                  delete algoParams.stopPrice;
                  await client.placeAlgoOrder({ params: algoParams, apiKey, apiSecret });
                } else throw e;
              });
            console.log(`[PumpOrders] 🎯 TP placed ${o.symbol} @${tpPriceStr}`);
          } catch (tpErr) {
            console.warn(`[PumpOrders] ⚠ TP failed ${o.symbol}:`, tpErr.message);
          }
        }
      } else if (status === 'CANCELED' || status === 'EXPIRED' || status === 'REJECTED') {
        console.log(`[PumpOrders] 🗑 ${status} ${o.symbol} orderId=${o.orderId}`);
        await upsertPumpHistory({ ...o, status: 'CANCELED', outcome: 'CANCELED', canceledAt: Date.now() });
      } else {
        remaining.push(o); // PARTIALLY_FILLED hoặc NEW → giữ lại
      }
    } catch (e) {
      console.warn(`[PumpOrders] check ${o.symbol} ${o.orderId}:`, e.message);
      remaining.push(o);
    }
    await new Promise((r) => setTimeout(r, 250)); // tránh burst
  }
  if (remaining.length !== pumpPendingOrders.length) {
    pumpPendingOrders = remaining;
    await savePumpOrders();
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

async function adoptExistingSlPositions() {
  // Adopt active positions that already have a STOP_MARKET order into slTracking
  // so the SL trail can manage them even if opened before the JSON was created
  try {
    const { apiKey, apiSecret } = getApiCredentials(null);
    const [positions, algoResult] = await Promise.all([
      client.getPositions({ apiKey, apiSecret }),
      client.getOpenAlgoOrders({ apiKey, apiSecret }),
    ]);
    const allAlgo = Array.isArray(algoResult?.orders) ? algoResult.orders : Array.isArray(algoResult) ? algoResult : [];
    const active = positions.filter((p) => Number(p.positionAmt) !== 0);
    let adopted = 0;
    for (const p of active) {
      const symbol = p.symbol;
      if (slTracking.positions[symbol]) continue; // already tracked
      const hasSl = allAlgo.some((o) => {
        if (o.symbol !== symbol) return false;
        const t = String(o.type ?? '').toUpperCase();
        return t === 'STOP_MARKET' || t === 'STOP';
      });
      if (!hasSl) continue;
      slTracking.positions[symbol] = {
        openedAt: Date.now(),
        openedAtStr: new Date().toISOString(),
        slPlaced: true,
        adopted: true,
      };
      adopted++;
    }
    if (adopted > 0) {
      await saveSlTracking();
      console.log(`[SlTracking] Adopted ${adopted} existing position(s) with SL`);
    }
  } catch (err) {
    if (err.message?.includes('Missing Binance API')) return;
    throw err;
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

    if (requestUrl.pathname === '/api/logout' && request.method === 'POST') {
      const token = request.headers['x-orders-token'] ?? '';
      ordersTokens.delete(token);
      sessionCredentials.delete(token);
      await sendJson(response, { ok: true });
      return;
    }

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

    if (requestUrl.pathname === '/api/account-uid' && request.method === 'GET') {
      const token = request.headers['x-orders-token'] ?? '';
      if (!ordersTokens.has(token)) { await sendJson(response, { error: 'Unauthorized.' }, 401); return; }
      const { apiKey, apiSecret } = getApiCredentials(token);
      const data = await client.getAccountUid({ apiKey, apiSecret });
      await sendJson(response, data);
      return;
    }

    const ordersRoutes = ['/api/balance', '/api/positions', '/api/open-orders', '/api/open-algo-orders', '/api/trades', '/api/cancel-order', '/api/cancel-all-orders', '/api/close-position', '/api/order', '/api/set-tp-sl', '/api/settings', '/api/daily-pnl'];
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

    if (requestUrl.pathname === '/api/vol-dump-flags') {
      await sendJson(response, getVolDumpFlags());
      return;
    }

    if (requestUrl.pathname === '/api/high-volume') {
      return sendJson(response, getHighVolData());
    }

    if (requestUrl.pathname === '/api/pump-stream') {
      response.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.write(': connected\n\n');
      // Chỉ push cache nếu có signals hoặc đã processed xong
      if (pumpScanCache.data && (pumpScanCache.data.signals?.length > 0 || pumpScanCache.data.processed > 0)) {
        response.write(`data: ${JSON.stringify(pumpScanCache.data)}\n\n`);
      }
      pumpSseClients.add(response);
      request.on('close', () => pumpSseClients.delete(response));
      // Nếu cache stale, trigger scan ngay để client nhận data mới qua SSE
      if (!pumpScanCache.data || Date.now() > pumpScanCache.expiresAt) {
        schedulePumpScan();
      }
      return; // keep response open
    }

    if (requestUrl.pathname === '/api/pump-signals') {
      if (pumpScanCache.data && Date.now() < pumpScanCache.expiresAt) {
        return sendJson(response, pumpScanCache.data);
      }
      const snapshot    = await getMarketSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols  = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runPumpScan(topSymbols, klineCache, snapshotMap);
      // Cache trống → seed ngay, scan lại sau 15s
      if (processed === 0) {
        klineCache.seed(topSymbols, '15m', 500).then(() => schedulePumpScan()).catch(() => {});
      }
      const cacheStats = klineCache.stats('15m');
      const result = { signals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      pumpScanCache.data = result;
      pumpScanCache.expiresAt = Date.now() + 30_000;
      return sendJson(response, result);
    }

    if (requestUrl.pathname === '/api/cap-stream') {
      response.writeHead(200, {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.write(': connected\n\n');
      if (capScanCache.data && (capScanCache.data.signals?.length > 0 || capScanCache.data.processed > 0)) {
        response.write(`data: ${JSON.stringify(capScanCache.data)}\n\n`);
      }
      capSseClients.add(response);
      request.on('close', () => capSseClients.delete(response));
      if (!capScanCache.data || Date.now() > capScanCache.expiresAt) {
        scheduleCapScan();
      }
      return;
    }

    if (requestUrl.pathname === '/api/cap-signals') {
      if (capScanCache.data && Date.now() < capScanCache.expiresAt) {
        return sendJson(response, capScanCache.data);
      }
      const snapshot = await getMarketSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runCapScan(topSymbols, klineCache, snapshotMap);
      if (processed === 0) {
        klineCache.seed(topSymbols, '15m', 500).then(() => scheduleCapScan()).catch(() => {});
      }
      const cacheStats = klineCache.stats('15m');
      const result = { signals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      capScanCache.data = result;
      capScanCache.expiresAt = Date.now() + 30_000;
      return sendJson(response, result);
    }

    if (requestUrl.pathname === '/api/killshort-stream') {
      response.writeHead(200, {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.write(': connected\n\n');
      if (killShortScanCache.data && (killShortScanCache.data.signals?.length > 0 || killShortScanCache.data.processed > 0)) {
        response.write(`data: ${JSON.stringify(killShortScanCache.data)}\n\n`);
      }
      killShortSseClients.add(response);
      request.on('close', () => killShortSseClients.delete(response));
      if (!killShortScanCache.data || Date.now() > killShortScanCache.expiresAt) {
        scheduleKillShortScan();
      }
      return;
    }

    if (requestUrl.pathname === '/api/killshort-signals') {
      if (killShortScanCache.data && Date.now() < killShortScanCache.expiresAt) {
        return sendJson(response, killShortScanCache.data);
      }
      const snapshot = await getMarketSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runKillShortScan(topSymbols, klineCache, snapshotMap);
      if (processed === 0) {
        klineCache.seed(topSymbols, '15m', 500).then(() => scheduleKillShortScan()).catch(() => {});
      }
      const cacheStats = klineCache.stats('15m');
      const result = { signals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      killShortScanCache.data = result;
      killShortScanCache.expiresAt = Date.now() + 30_000;
      return sendJson(response, result);
    }

    if (requestUrl.pathname === '/api/btc-health') {
      await sendJson(response, await getBtcHealth());
      return;
    }

    if (requestUrl.pathname === '/api/ls-ratio-scan') {
      const period = requestUrl.searchParams.get('period') ?? '15m';
      const cache = lsRatioCache[period] ?? lsRatioCache['15m'];
      if (!cache.scanning && Date.now() - cache.updatedAt > 90_000) {
        runLsRatioScan(period).catch(() => {});
      }
      return sendJson(response, { data: cache.data, updatedAt: cache.updatedAt, scanning: cache.scanning, period });
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

    if (requestUrl.pathname === '/api/check-missing-tp') {
      try {
        const { apiKey, apiSecret } = getApiCredentials(requestUrl.searchParams.get('token'));
        const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);
        const [positions, openOrders, algoRes] = await Promise.all([
          client.getPositions({ apiKey, apiSecret }),
          client.getOpenOrders({ apiKey, apiSecret }),
          client.getOpenAlgoOrders({ apiKey, apiSecret }).catch(() => ({ orders: [] })),
        ]);
        const active = positions.filter(p => Number(p.positionAmt) !== 0);
        const algoOrders = algoRes?.orders ?? [];
        const tpTypes = new Set(['TAKE_PROFIT_MARKET', 'TAKE_PROFIT']);
        const result = active.map(p => {
          const sym = p.symbol;
          const amt = Number(p.positionAmt);
          const isLong = amt > 0;
          const closeSide = isLong ? 'SELL' : 'BUY';
          const hasRegularTp = openOrders.some(o => {
            const t = String(o.origType ?? o.type ?? '').toUpperCase();
            return o.symbol === sym && o.side === closeSide && tpTypes.has(t);
          });
          const hasAlgoTp = algoOrders.some(o => {
            const t = String(o.type ?? '').toUpperCase();
            return o.symbol === sym && tpTypes.has(t);
          });
          const margin = Number(p.isolatedMargin) || Number(p.initialMargin) || 1;
          const roe = (Number(p.unRealizedProfit) / margin) * 100;
          return {
            symbol: sym,
            side: isLong ? 'LONG' : 'SHORT',
            entry: Number(p.entryPrice),
            markPrice: Number(p.markPrice),
            roe: +roe.toFixed(2),
            hasTP: hasRegularTp || hasAlgoTp,
          };
        });
        result.sort((a, b) => (a.hasTP ? 1 : -1) - (b.hasTP ? 1 : -1));
        await sendJson(response, { total: active.length, missingTp: result.filter(r => !r.hasTP).length, positions: result });
      } catch (e) {
        await sendJson(response, { error: e.message }, 400);
      }
      return;
    }

    if (requestUrl.pathname === '/api/paper-trades') {
      if (request.method === 'GET') {
        await sendJson(response, await getPaperTrades());
        return;
      }
      if (request.method === 'POST') {
        await sendJson(response, await createPaperTrade(await readJsonBody(request)));
        return;
      }
    }

    if (requestUrl.pathname === '/api/paper-trades/close' && request.method === 'POST') {
      await sendJson(response, await closePaperTrade(await readJsonBody(request)));
      return;
    }

    if (requestUrl.pathname === '/api/paper-trades/place-binance' && request.method === 'POST') {
      const token = request.headers['x-orders-token'] ?? null;
      if (!token || !ordersTokens.has(token)) {
        await sendJson(response, { error: 'Chưa đăng nhập. Vào /orders và nhập API key trước.' }, 401);
        return;
      }
      await sendJson(response, await placeBinanceMarketFromPaperTrade(await readJsonBody(request), token));
      return;
    }

    if (requestUrl.pathname === '/api/paper-trades/delete' && request.method === 'POST') {
      await sendJson(response, await deletePaperTrade(await readJsonBody(request)));
      return;
    }

    if (requestUrl.pathname === '/api/cap-paper-trades') {
      if (request.method === 'GET') {
        await sendJson(response, await getCapPaperTrades());
        return;
      }
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        const trade = await createCapPaperTrade({ ...body, status: 'PENDING' });
        syncCapPaperTicker().catch(() => {});
        await sendJson(response, trade);
        return;
      }
    }
    if (requestUrl.pathname === '/api/cap-paper-trades/close' && request.method === 'POST') {
      await sendJson(response, await closeCapPaperTrade(await readJsonBody(request)));
      return;
    }
    if (requestUrl.pathname === '/api/cap-paper-trades/delete' && request.method === 'POST') {
      await sendJson(response, await deleteCapPaperTrade(await readJsonBody(request)));
      return;
    }

    if (requestUrl.pathname === '/api/pump-paper-trades') {
      if (request.method === 'GET') {
        await sendJson(response, await getPumpPaperTrades());
        return;
      }
      if (request.method === 'POST') {
        const payload = await readJsonBody(request);
        await sendJson(response, await createPumpPaperTrade(payload));
        return;
      }
    }
    if (requestUrl.pathname === '/api/pump-paper-trades/close' && request.method === 'POST') {
      await sendJson(response, await closePumpPaperTrade(await readJsonBody(request)));
      return;
    }
    if (requestUrl.pathname === '/api/pump-paper-trades/delete' && request.method === 'POST') {
      await sendJson(response, await deletePumpPaperTrade(await readJsonBody(request)));
      return;
    }

    if (requestUrl.pathname === '/api/pump-auto-order-enabled') {
      if (request.method === 'GET') {
        await sendJson(response, { enabled: runtimeSettings.pumpAutoOrderEnabled });
        return;
      }
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        if (typeof body.enabled === 'boolean') runtimeSettings.pumpAutoOrderEnabled = body.enabled;
        console.log(`[PumpAuto] ${runtimeSettings.pumpAutoOrderEnabled ? '✅ Bật' : '⏸ Tắt'} pump auto order`);
        await sendJson(response, { enabled: runtimeSettings.pumpAutoOrderEnabled });
        return;
      }
    }

    if (requestUrl.pathname === '/api/pump-max-orders') {
      if (request.method === 'GET') {
        await sendJson(response, { maxLimitOrders: runtimeSettings.pumpMaxLimitOrders, maxPositions: runtimeSettings.pumpMaxPositions });
        return;
      }
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        if (typeof body.maxLimitOrders === 'number' && body.maxLimitOrders >= 1) runtimeSettings.pumpMaxLimitOrders = body.maxLimitOrders;
        if (typeof body.maxPositions === 'number' && body.maxPositions >= 0) runtimeSettings.pumpMaxPositions = body.maxPositions;
        console.log(`[PumpAuto] Cập nhật: maxLimitOrders=${runtimeSettings.pumpMaxLimitOrders} maxPositions=${runtimeSettings.pumpMaxPositions}`);
        await sendJson(response, { maxLimitOrders: runtimeSettings.pumpMaxLimitOrders, maxPositions: runtimeSettings.pumpMaxPositions });
        return;
      }
    }

    if (requestUrl.pathname === '/api/pump-auto-order-test' && request.method === 'POST') {
      const token = request.headers['x-orders-token'] ?? null;
      if (!token || !ordersTokens.has(token)) { await sendJson(response, { error: 'Unauthorized' }, 401); return; }
      const body = await readJsonBody(request);
      const { symbol = 'BTCUSDT' } = body;
      // Lấy signal hiện tại hoặc tạo fake signal để test
      const cached = pumpScanCache.data?.signals?.find((s) => s.symbol === symbol);
      const testSignal = cached ?? {
        symbol, action: 'LONG', score: 90, marketOk: true,
        entry: body.entry ?? 1, sl: body.sl ?? 0.9,
        factors: { rsi14val: 55, volRatio: 2.5 },
      };
      // Bypass dedup để test
      pumpAutoOrderFired.delete(symbol);
      try {
        const { apiKey, apiSecret } = getApiCredentials(token);
        const margin = Number(process.env.PUMP_AUTO_ORDER_MARGIN ?? 1);
        const leverage = Number(process.env.PUMP_AUTO_ORDER_LEVERAGE ?? 10);
        const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);
        const symbols = await getSymbols();
        const info = symbols.find((s) => s.symbol === symbol);
        const tickSize = Number(info?.filters?.find((f) => f.filterType === 'PRICE_FILTER')?.tickSize ?? 0);
        const stepSize = Number(info?.filters?.find((f) => f.filterType === 'LOT_SIZE')?.stepSize ?? 0);
        await client.setLeverage({ symbol, leverage, apiKey, apiSecret, recvWindow });
        const premiumIndex = await client.getPremiumIndex(symbol);
        const markPrice = Number(premiumIndex.markPrice);
        const entry = testSignal.entry;
        const notional = margin * leverage;
        const qtyRaw = notional / entry;
        const qty = stepSize > 0 ? Math.floor(qtyRaw / stepSize) * stepSize : qtyRaw;
        const qtyStr = stepSize > 0 ? qty.toFixed(Math.max(0, -Math.floor(Math.log10(stepSize)))) : qty.toFixed(6);
        const side = testSignal.action === 'LONG' ? 'BUY' : 'SELL';
        const entryStr = tickSize > 0 ? entry.toFixed(Math.max(0, -Math.floor(Math.log10(tickSize)))) : entry.toFixed(8);
        const order = await client.placeFuturesOrder({
          params: { symbol, side, type: 'LIMIT', price: entryStr, quantity: qtyStr, timeInForce: 'GTC', recvWindow },
          apiKey, apiSecret,
        });
        console.log(`[PumpAuto TEST] ✅ ${symbol} ${side} LIMIT @${entryStr} qty=${qtyStr} orderId=${order.orderId}`);
        await sendJson(response, { ok: true, symbol, side, entry: entryStr, qty: qtyStr, markPrice, orderId: order.orderId });
      } catch (err) {
        console.error('[PumpAuto TEST] ❌', err.message);
        await sendJson(response, { ok: false, error: err.message }, 400);
      }
      return;
    }

    if (requestUrl.pathname === '/api/pump-history' && request.method === 'GET') {
      try {
        const history = JSON.parse(await readFile(PUMP_HISTORY_FILE, 'utf8'));
        await sendJson(response, history);
      } catch { await sendJson(response, []); }
      return;
    }

    if (requestUrl.pathname === '/api/pump-daily-stats' && request.method === 'GET') {
      try {
        const stats = JSON.parse(await readFile(PUMP_DAILY_FILE, 'utf8'));
        // Trả về mảng sắp xếp theo ngày mới nhất trước
        await sendJson(response, Object.values(stats).sort((a, b) => b.date.localeCompare(a.date)));
      } catch { await sendJson(response, []); }
      return;
    }

    if (requestUrl.pathname === '/api/pump-manual-order' && request.method === 'POST') {
      const token = request.headers['x-orders-token'] ?? null;
      if (!token || !ordersTokens.has(token)) {
        await sendJson(response, { error: 'Chưa đăng nhập. Vào /orders và nhập API key trước.' }, 401);
        return;
      }
      const body = await readJsonBody(request);
      const { symbol, action, entry, sl, tp, score, margin: bodyMargin, type: bodyType } = body;
      if (!symbol || !action || !entry) { await sendJson(response, { error: 'Thiếu symbol/action/entry' }, 400); return; }
      try {
        const { apiKey, apiSecret } = getApiCredentials(token);
        const margin = Number(bodyMargin ?? 5);
        const leverage = Number(process.env.PUMP_AUTO_ORDER_LEVERAGE ?? 10);
        const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);
        const symbols = await getSymbols();
        const info = symbols.find((s) => s.symbol === symbol);
        const tickSize = Number(info?.filters?.find((f) => f.filterType === 'PRICE_FILTER')?.tickSize ?? 0);
        const stepSize = Number(info?.filters?.find((f) => f.filterType === 'LOT_SIZE')?.stepSize ?? 0);
        const minNotional = Number(info?.filters?.find((f) => f.filterType === 'MIN_NOTIONAL')?.notional ?? 0);
        await client.setLeverage({ symbol, leverage, apiKey, apiSecret, recvWindow });
        const premiumIndex = await client.getPremiumIndex(symbol);
        const markPrice = Number(premiumIndex.markPrice);

        const entryNum = Number(entry);
        const side = action === 'LONG' ? 'BUY' : 'SELL';

        // Nếu entry quá gần/vượt mark price → dùng MARKET thay LIMIT
        const gap = markPrice > 0 ? (entryNum - markPrice) / markPrice : -1;
        const useMarket = markPrice > 0 && (
          (side === 'BUY'  && gap >= -0.001) ||
          (side === 'SELL' && gap <=  0.001)
        );

        const notional = Math.max(margin * leverage, minNotional > 0 ? minNotional : 0);
        const qtyRaw = notional / (useMarket ? markPrice : entryNum);
        const qty = stepSize > 0 ? Math.floor(qtyRaw / stepSize) * stepSize : qtyRaw;
        const qtyStr = stepSize > 0 ? qty.toFixed(Math.max(0, -Math.floor(Math.log10(stepSize)))) : qty.toFixed(6);
        const entryStr = tickSize > 0
          ? entryNum.toFixed(Math.max(0, -Math.floor(Math.log10(tickSize))))
          : entryNum.toFixed(8);

        const orderParams = useMarket
          ? { symbol, side, type: 'MARKET', quantity: qtyStr, recvWindow, newClientOrderId: `lp_manual_${Date.now()}`.slice(0, 36) }
          : { symbol, side, type: 'LIMIT', price: entryStr, quantity: qtyStr, timeInForce: 'GTC', recvWindow, newClientOrderId: `lp_manual_${Date.now()}`.slice(0, 36) };

        const order = await client.placeFuturesOrder({ params: orderParams, apiKey, apiSecret });
        invalidateOpenOrdersCache();
        console.log(`[PumpManual] ✅ ${symbol} ${side} ${useMarket ? 'MARKET' : `LIMIT @${entryStr}`} qty=${qtyStr} margin=$${margin} score=${score}`);
        // Đặt SL nếu có
        let slPlaced = false;
        let slPriceStr = null;
        if (sl && info) {
          slPriceStr = tickSize > 0
            ? Number(sl).toFixed(Math.max(0, -Math.floor(Math.log10(tickSize))))
            : Number(sl).toFixed(8);
          const slParams = {
            symbol, side: side === 'BUY' ? 'SELL' : 'BUY',
            type: 'STOP_MARKET', stopPrice: slPriceStr, quantity: qtyStr,
            workingType: 'MARK_PRICE', reduceOnly: 'true', recvWindow,
            newClientOrderId: `lp_psl_${order.orderId}`.slice(0, 36),
          };
          try {
            await client.placeFuturesOrder({ params: slParams, apiKey, apiSecret })
              .catch((e) => {
                if (e.message?.includes('not supported') || e.message?.includes('Algo Order')) {
                  const ap = { ...slParams, algoType: 'CONDITIONAL', triggerPrice: slPriceStr };
                  delete ap.stopPrice;
                  return client.placeAlgoOrder({ params: ap, apiKey, apiSecret });
                }
                throw e;
              });
            slPlaced = true;
            console.log(`[PumpManual] 🛡 ${symbol} SL @${slPriceStr}`);
          } catch (e) {
            console.warn(`[PumpManual] ⚠ SL failed ${symbol}:`, e.message);
          }
        }
        addPumpPendingOrder({
          orderId: order.orderId, symbol, side, entry: Number(entryStr), qty: Number(qtyStr),
          margin, score: score ?? 0, type: bodyType ?? null, slPlaced,
          slPrice: slPriceStr ? Number(slPriceStr) : null, tp: tp ?? null, placedAt: Date.now(),
        }).catch(() => {});
        await sendJson(response, { ok: true, orderId: order.orderId, symbol, side, entry: entryStr, qty: qtyStr, markPrice, slPlaced, slPrice: slPriceStr, marketFilled: useMarket });
      } catch (err) {
        console.error('[PumpManual] ❌', err.message);
        await sendJson(response, { ok: false, error: err.message }, 400);
      }
      return;
    }

    if (requestUrl.pathname === '/api/auto-probe-enabled') {
      if (request.method === 'GET') {
        await sendJson(response, { enabled: runtimeSettings.autoProbeEnabled, margin: runtimeSettings.autoProbeMargin });
        return;
      }
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        if (typeof body.enabled === 'boolean') runtimeSettings.autoProbeEnabled = body.enabled;
        if (typeof body.margin === 'number' && body.margin > 0) runtimeSettings.autoProbeMargin = body.margin;
        console.log(`[AutoProbe] ${runtimeSettings.autoProbeEnabled ? '✅ Bật' : '⏸ Tắt'} auto vô $${runtimeSettings.autoProbeMargin} khi READY`);
        await sendJson(response, { enabled: runtimeSettings.autoProbeEnabled, margin: runtimeSettings.autoProbeMargin });
        return;
      }
    }

    if (requestUrl.pathname === '/api/top-trader-trend' && request.method === 'GET') {
      const symbolsParam = requestUrl.searchParams.get('symbols') ?? '';
      const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      const limit = Number(process.env.LIQ_TOP_TRADER_RATIO_LIMIT ?? 50);
      const result = {};
      await Promise.allSettled(symbols.map(async (sym) => {
        try {
          const rows = await client.getTopLongShortPositionRatio(sym, '5m', limit);
          const trend = summarizeTopTraderTrend(rows);
          result[sym] = trend ? { ...trend, label: formatTopTraderTrend(trend) } : null;
        } catch { result[sym] = null; }
      }));
      await sendJson(response, result);
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

    if (requestUrl.pathname === '/api/set-tp-sl' && request.method === 'POST') {
      const token = request.headers['x-orders-token'] ?? '';
      await sendJson(response, await setTpSl(await readJsonBody(request), token));
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
        triggerRoe: Number(process.env.TRAILING_STOP_TRIGGER_ROE ?? 10),
        updateRoe: Number(process.env.TRAILING_STOP_UPDATE_ROE ?? 5),
        protected: protected_,
      });
      return;
    }

    if (requestUrl.pathname === '/api/position-monitor/status') {
      const token = request.headers['x-orders-token'] ?? '';
      if (!ordersTokens.has(token)) {
        await sendJson(response, { error: 'Unauthorized.' }, 401);
        return;
      }
      await sendJson(response, {
        enabled: Boolean(posMonitor),
        status: posMonitor?.getStatus ? posMonitor.getStatus() : null,
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
  loadSlTracking().then(() =>
    adoptExistingSlPositions().catch((err) => console.warn('[SlTracking] Adopt failed:', err.message)),
  );
  loadPumpOrders().then(() => {
    setInterval(() => pollPumpOrders().catch(() => {}), 60_000);
  });
  loadPumpWatching().then(() => {
    setInterval(() => pollPumpWatching().catch(() => {}), 3 * 60_000);
  });
  const tslIntervalMs = Math.max(Number(process.env.TRAILING_STOP_INTERVAL_MS ?? 30000), 15000);
  // Stagger service startup to avoid burst at t=0
  startAutoTrader();
  setTimeout(() => startLongShortRefresh(), 3000);
  setTimeout(() => {
    tslScanner = startTrailingStopScanner({ client, getSymbols, intervalMs: tslIntervalMs, webhookUrl: process.env.TSL_WEBHOOK_URL });
  }, 7000);
  setTimeout(() => {
    startBtcReversalGuard({ client, getSymbols, getRuntimeSettings: () => runtimeSettings, intervalMs: tslIntervalMs });
  }, 12000);
  setTimeout(async () => {
    // Seed kline cache sớm để pump/cap scan có data ngay khi browser mở trang.
    // getMarketSnapshot() is cheap (cached for 15s) and gives us the top coins by volume.
    try {
      const snapshot = await getMarketSnapshot();
      const liqScanMax = Number(process.env.LIQ_SCAN_MAX_COINS ?? 200);
      const seedMax = Math.max(liqScanMax, 400); // 400 covers pump/cap/killshort scans
      const topSymbols = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, seedMax)
        .map((r) => r.symbol);
      // Fire-and-forget: seeding runs in background while scanners start
      // LiqScan needs 500 candles; VolDump only needs 42 but 500 covers both
      klineCache.seed(topSymbols, '15m', 500).catch(() => {});
      // Seed BTC klines — Wilder's RSI cần nhiều nến để warm-up và khớp Binance
      klineCache.seed(['BTCUSDT'], '1h', 250).catch(() => {});  // 250 nến 1h ~10 ngày
      klineCache.seed(['BTCUSDT'], '4h', 150).catch(() => {});  // 150 nến 4h ~25 ngày
      klineCache.seed(['BTCUSDT'], '1d', 60).catch(() => {});   // 60 nến 1d ~2 tháng
    } catch (err) {
      console.warn('[KlineCache] Seed failed:', err.message);
    }

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
      klineCache,
      webhookUrl: process.env.LIQ_SCAN_WEBHOOK_URL || '',
      highProbWebhookUrl: process.env.LIQ_HIGH_PROB_WEBHOOK_URL || '',
      getSnapshot: getMarketSnapshot,
      biasThreshold: Number(process.env.LIQ_SCAN_BIAS_THRESHOLD ?? 0.4),
      intervalMs: Number(process.env.LIQ_SCAN_INTERVAL_MS ?? 5 * 60 * 1000),
      cooldownMs: Number(process.env.LIQ_SCAN_COOLDOWN_MS ?? 2 * 60 * 60 * 1000),
      minVolumeUsdt: Number(process.env.LIQ_SCAN_MIN_VOLUME ?? 5_000_000),
      maxCoins: Number(process.env.LIQ_SCAN_MAX_COINS ?? 200),
      onHighProbAlert: getLiqHighProbHandler(),
      highProbThreshold: getLiqHighProbThreshold(),
    });
    // startVolumeDumpScanner disabled — tắt để giảm tải API (150 REST calls/phút)
  }, 5000);
  setTimeout(() => {
    runStaleOrderCleaner(); // seed initial position set, no cancellations on first run
    setInterval(runStaleOrderCleaner, 30000);
  }, 22000);
  setTimeout(() => {
    runBtcHealthMonitor(); // initial read — seed _prevBtcBias, no cancellations
    setInterval(runBtcHealthMonitor, 2 * 60_000); // check every 2 minutes
  }, 40000);
  setTimeout(() => {
    startNegTpScanner();
  }, 28000);
  setTimeout(() => {
    startPaperTradeTicker();
    startCapPaperTicker();
    startPumpPaperTicker();
  }, 29000);
  setTimeout(() => {
    startMissingTpScanner();
  }, 31000);
  setTimeout(() => {
    startSlTrailSafetyScanner();
  }, 34000);
  setTimeout(() => {
    posMonitor = startPositionMonitor({
      client,
      getCredentials: () => getApiCredentials(null),
      onPositionClose: (symbol) => {
        // Triggered ngay khi ACCOUNT_UPDATE báo pa=0 — không cần đợi StaleOrder poll 30s
        console.log(`[PosMonitor] 🔴 ${symbol} closed → cancelling open orders immediately`);
        let creds;
        try { creds = getApiCredentials(null); } catch { return; }
        const { apiKey, apiSecret } = creds;
        cancelAllOrdersForSymbol(symbol, apiKey, apiSecret)
          .then(() => invalidateOpenOrdersCache())
          .catch((err) => console.warn(`[PosMonitor] Cancel orders ${symbol}:`, err.message));
      },
      onOrderFill: (symbol, { side, filledQty, avgPrice, positionSide, fillTime }) => {
        console.log(`[SlGuard] onOrderFill ${symbol} fillTime=${fillTime} createdAt=${slTracking.createdAt}`);
        // Only track fills that happened after sl-tracking.json was created
        if (fillTime < slTracking.createdAt) {
          console.log(`[SlGuard] Skip ${symbol} — filled before JSON created`);
          return;
        }
        if (!slTracking.positions[symbol]) {
          slTracking.positions[symbol] = { openedAt: fillTime, openedAtStr: new Date(fillTime).toISOString(), slPlaced: false };
          saveSlTracking();
        }
        console.log(`[SlGuard] Registered ${symbol}, triggering SL guard in 1s`);
        setTimeout(() => triggerSlGuardForSymbol(symbol), 1000);
        appendFillLog({ symbol, side, filledQty, avgPrice, positionSide, fillTime }).catch(() => {});
        invalidateOpenOrdersCache();
        tpConfirmedClear(symbol);
        negTpLastRun.delete(symbol);
      },
      onRoeUpdate: (symbol, pos, markPrice, roe) => {
        // Đặt TP pending từ AutoLiq nếu position đã mở
        if (pendingLiqTp.has(symbol)) {
          placePendingLiqTp(symbol, pos).catch(() => {});
        }
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
        // SL trail: move SL up as profit grows (all positions with existing SL)
        handleSlTrailByProfit(symbol, pos, roe, markPrice).catch(() => {});
        // Time-based: âm liên tiếp quá NEG_TP_TIMEOUT_MS → đặt TP về entry
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
  // BTC mark price WebSocket — funding rate + mark price liên tục, không tốn REST
  startBtcMarkPriceWs();
});

// ── BTC Health ────────────────────────────────────────────────────────────────
let btcHealthCache = { data: null, expiresAt: 0 };
// L/S ratio: không có WS → REST cache 30 phút (thay đổi rất chậm)
let btcLsRatioCache = { data: null, expiresAt: 0 };
// Funding rate + mark price: từ WebSocket markPrice stream (field r + p)
// → 0 REST calls, Binance push mỗi 3 giây
let btcMarkPriceWsData = { markPrice: null, fundingRate: null, nextFundingTime: null };

function startBtcMarkPriceWs() {
  const WS_URL = 'wss://fstream.binancefuture.com/ws/btcusdt@markPrice';
  function connect() {
    const ws = new WebSocket(WS_URL);
    ws.on('open',    () => console.log('[BtcWS] markPrice stream connected'));
    ws.on('message', (raw) => {
      try {
        const d = JSON.parse(raw);
        if (d.e === 'markPriceUpdate') {
          btcMarkPriceWsData = {
            markPrice:       Number(d.p),
            fundingRate:     Number(d.r) * 100, // % per 8h (như getPremiumIndex)
            nextFundingTime: Number(d.T),
          };
        }
      } catch {}
    });
    ws.on('close', () => { console.warn('[BtcWS] markPrice disconnected — reconnecting 5s'); setTimeout(connect, 5_000); });
    ws.on('error', () => {});
  }
  connect();
}

// Wilder's Smoothed RSI — khớp với Binance (dùng RMA/SMMA, không phải SMA)
// Cần ít nhất period*10 nến để warm-up đủ; 150+ nến cho kết quả chính xác
function calcRsiSimple(closes, period = 14) {
  if (closes.length < period + 1) return null;
  // Seed: SMA của period nến đầu tiên
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  // Wilder's smoothing cho phần còn lại
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

async function getBtcHealth() {
  if (btcHealthCache.data && Date.now() < btcHealthCache.expiresAt) return btcHealthCache.data;

  try {
    // Funding rate: từ WebSocket markPrice stream — 0 REST calls
    const fundingRate = btcMarkPriceWsData.fundingRate ?? 0;
    const markPrice   = btcMarkPriceWsData.markPrice;

    // L/S ratio: không có WS → REST cache 30 phút (thay đổi rất chậm, không cần real-time)
    if (!btcLsRatioCache.data || Date.now() >= btcLsRatioCache.expiresAt) {
      btcLsRatioCache = { data: await client.getGlobalLongShortRatio('BTCUSDT', '5m', 1).catch(() => null), expiresAt: Date.now() + 30 * 60_000 };
    }
    const [klines4h, klines1d, klines1h] = await Promise.all([
      klineCache.getKlines('BTCUSDT', '4h', 100), // từ WS cache — không tốn REST
      klineCache.getKlines('BTCUSDT', '1d', 50),
      klineCache.getKlines('BTCUSDT', '1h', 200), // từ WS cache — không tốn REST
    ]);
    const lsRaw = btcLsRatioCache.data;

    // L/S ratio
    const lsData = Array.isArray(lsRaw) ? lsRaw[0] : lsRaw;
    const lsRatio = lsData ? Number(lsData.longShortRatio) : null;
    const longPct = lsRatio ? (lsRatio / (1 + lsRatio)) * 100 : null;

    // RSI 4h — current and 3 candles ago (divergence check)
    const closes4h = klines4h.map((k) => Number(k[4] ?? k.close));
    const highs4h  = klines4h.map((k) => Number(k[2] ?? k.high));
    const rsi4h    = calcRsiSimple(closes4h, 14);

    // Bearish divergence: price higher high but RSI lower high vs 10 candles ago
    const rsiPrev  = calcRsiSimple(closes4h.slice(0, -10), 14);
    const pricePeak  = Math.max(...closes4h.slice(-5));
    const pricePrev  = Math.max(...closes4h.slice(-15, -10));
    const bearishDiv = rsi4h != null && rsiPrev != null && pricePeak > pricePrev && rsi4h < rsiPrev - 3;

    // RSI 1D
    const closes1d = klines1d.map((k) => Number(k[4] ?? k.close));
    const rsi1d    = calcRsiSimple(closes1d, 14);

    // RSI 1h + EMA20 1h + momentum 6h — detect active downtrend
    const closes1h  = klines1h.map((k) => Number(k[4] ?? k.close));
    const rsi1h     = calcRsiSimple(closes1h, 14);
    const ema20_1h  = closes1h.length >= 20
      ? closes1h.slice(-20).reduce((s, v) => s + v, 0) / 20
      : null;
    const lastClose1h = closes1h[closes1h.length - 1];
    const emaTrend1h  = ema20_1h != null
      ? (lastClose1h < ema20_1h ? 'below' : 'above')
      : null;
    // % thay đổi trong 6 nến 1h gần nhất
    const pct6h = closes1h.length >= 7
      ? ((closes1h[closes1h.length - 1] - closes1h[closes1h.length - 7]) / closes1h[closes1h.length - 7]) * 100
      : null;

    // OBV trend 4h (last 20 candles) — rising/falling/flat
    const vols4h   = klines4h.map((k) => Number(k[5] ?? k.volume));
    let obv = 0;
    const obvArr = [];
    for (let i = 1; i < closes4h.length; i++) {
      obv += closes4h[i] > closes4h[i - 1] ? vols4h[i] : closes4h[i] < closes4h[i - 1] ? -vols4h[i] : 0;
      obvArr.push(obv);
    }
    const obvRecent = obvArr.slice(-20);
    const obvTrend  = obvRecent[obvRecent.length - 1] > obvRecent[0] * 1.02 ? 'rising'
                    : obvRecent[obvRecent.length - 1] < obvRecent[0] * 0.98 ? 'falling' : 'flat';

    // Overall bias
    let bearPoints = 0;
    // --- Tín hiệu đỉnh quá nóng (pre-drop) ---
    if (fundingRate > 0.05) bearPoints++;
    if (bearishDiv) bearPoints++;
    if (longPct != null && longPct > 62) bearPoints++;
    if (rsi4h != null && rsi4h > 70) bearPoints++;
    if (obvTrend === 'falling') bearPoints++;
    // --- Tín hiệu đang trong downtrend (active dump) ---
    if (rsi4h != null && rsi4h < 35) bearPoints++;           // BTC dump mạnh trên 4h
    if (rsi1h != null && rsi1h < 40) bearPoints++;           // Momentum âm trên 1h
    if (emaTrend1h === 'below') bearPoints++;                // Price dưới EMA20 1h

    const bias = bearPoints >= 3 ? 'bearish' : bearPoints >= 2 ? 'caution' : 'neutral';

    // --- Bull points — đối xứng, dùng để block SHORT ---
    let bullPoints = 0;
    if (rsi1h != null && rsi1h > 60) bullPoints++;          // Momentum dương trên 1h
    if (emaTrend1h === 'above') bullPoints++;               // Price trên EMA20 1h
    if (pct6h != null && pct6h > 1.5) bullPoints++;        // BTC tăng >1.5% trong 6h
    if (obvTrend === 'rising') bullPoints++;                // OBV đang tăng
    if (rsi4h != null && rsi4h > 55 && rsi4h < 70) bullPoints++; // 4h bullish nhưng chưa overbought
    if (longPct != null && longPct < 42) bullPoints++;     // Short nhiều → short squeeze risk
    const bullBias = bullPoints >= 3 ? 'bullish' : bullPoints >= 2 ? 'caution' : 'neutral';

    const data = {
      price: markPrice,
      fundingRate: +fundingRate.toFixed(4),
      lsRatio,
      longPct: longPct != null ? +longPct.toFixed(1) : null,
      rsi4h: rsi4h != null ? +rsi4h.toFixed(1) : null,
      rsi1d: rsi1d != null ? +rsi1d.toFixed(1) : null,
      rsi1h: rsi1h != null ? +rsi1h.toFixed(1) : null,
      emaTrend1h,
      pct6h: pct6h != null ? +pct6h.toFixed(2) : null,
      bearishDiv,
      obvTrend,
      bias,
      bearPoints,
      bullBias,
      bullPoints,
      updatedAt: Date.now(),
    };

    btcHealthCache = { data, expiresAt: Date.now() + 30_000 }; // 30s — klines từ WS, RSI đủ fresh
    return data;
  } catch (e) {
    console.warn('[BtcHealth] error:', e.message);
    return btcHealthCache.data ?? { error: e.message };
  }
}

// ── RSI update khi nến mới đóng (1h/4h/1d) — không dùng candleTick để tránh ban IP ──────
// klineCache._applyTick() liên tục cập nhật close của nến hiện tại từ WS,
// nên khi getBtcHealth() chạy (mỗi 30s) RSI đã dùng giá live rồi — không cần invalidate liên tục.
klineCache.on('candleClose', ({ symbol, interval }) => {
  if (symbol !== 'BTCUSDT') return;
  if (interval !== '1h' && interval !== '4h' && interval !== '1d') return;
  btcHealthCache.expiresAt = 0; // force refresh ngay khi nến mới đóng
  getBtcHealth().catch(() => {}); // pre-warm cache
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

  trackSubmittedOrderPosition({
    symbol,
    side,
    quantity,
    leverage,
    markPrice,
    orderResult,
    isHedge,
    positionSide,
    orderType,
  });

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

function trackSubmittedOrderPosition({ symbol, side, quantity, leverage, markPrice, orderResult, isHedge, positionSide, orderType }) {
  if (!posMonitor) return;
  const executedQty = Number(orderResult?.executedQty ?? 0);
  if (executedQty <= 0) return;

  const avgPrice = Number(orderResult?.avgPrice ?? orderResult?.price ?? 0) || markPrice;
  const amt = (side === 'BUY' ? 1 : -1) * executedQty;
  posMonitor.trackPosition(symbol, {
    amt,
    entry: avgPrice,
    leverage,
    positionSide: isHedge ? positionSide : 'BOTH',
  });
  console.log(`[PosMonitor] Seeded ${symbol} from submitted ${orderType} order qty=${executedQty} entry=${avgPrice}`);
}

async function setTpSl(payload, token = null) {
  const symbol = normalizeSymbol(payload.symbol ?? '');
  if (!symbol) throw new Error('symbol is required.');
  const tpPrice = payload.tpPrice !== '' && payload.tpPrice != null ? Number(payload.tpPrice) : null;
  const slPrice = payload.slPrice !== '' && payload.slPrice != null ? Number(payload.slPrice) : null;
  if (!tpPrice && !slPrice) throw new Error('Nhập ít nhất một trong hai: TP price hoặc SL price.');

  const { apiKey, apiSecret } = getApiCredentials(token);
  const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);

  const [symbols, openOrders, algoResult, positions] = await Promise.all([
    getSymbols(),
    client.getOpenOrders({ apiKey, apiSecret }),
    client.getOpenAlgoOrders({ apiKey, apiSecret }),
    client.getPositions({ apiKey, apiSecret }),
  ]);

  const symbolInfo = symbols.find((s) => s.symbol === symbol);
  if (!symbolInfo) throw new Error(`Symbol ${symbol} không tìm thấy.`);

  const pos = positions.find((p) => p.symbol === symbol && Number(p.positionAmt) !== 0);
  if (!pos) throw new Error(`Không có vị thế mở cho ${symbol}.`);

  const isHedge = String(pos.positionSide ?? 'BOTH') !== 'BOTH';
  const positionSide = pos.positionSide ?? 'BOTH';
  const isLong = Number(pos.positionAmt) > 0;
  const closeSide = isLong ? 'SELL' : 'BUY';
  const allAlgo = Array.isArray(algoResult?.orders) ? algoResult.orders : Array.isArray(algoResult) ? algoResult : [];

  const markPrice = Number((await client.getPremiumIndex(symbol)).markPrice);
  const isTpTypeRegular = (t) => { const u = String(t ?? '').toUpperCase(); return u === 'TAKE_PROFIT_MARKET' || u === 'TAKE_PROFIT'; };
  const isSlTypeRegular = (t) => { const u = String(t ?? '').toUpperCase(); return u === 'STOP_MARKET' || u === 'STOP'; };
  // TP: trigger chưa chạm (còn xa hơn mark theo hướng lãi). SL/TSL: trigger đã qua mark hoặc phía lỗ.
  const isAlgoTp = (o) => { const t = Number(o.triggerPrice ?? 0); return t > 0 && (isLong ? t > markPrice : t < markPrice); };
  const isAlgoSl = (o) => { const t = Number(o.triggerPrice ?? 0); return t > 0 && (isLong ? t < markPrice : t > markPrice); };

  const cancelled = { tp: [], sl: [] };
  const placed = { tp: null, sl: null };

  // Cancel existing TP/SL — regular orders
  for (const o of openOrders.filter((o) => o.symbol === symbol && o.reduceOnly)) {
    if (tpPrice && isTpTypeRegular(o.type)) {
      await client.cancelOrder({ symbol, orderId: o.orderId, apiKey, apiSecret, recvWindow }).catch(() => {});
      cancelled.tp.push(o.orderId);
    }
    if (slPrice && isSlTypeRegular(o.type)) {
      await client.cancelOrder({ symbol, orderId: o.orderId, apiKey, apiSecret, recvWindow }).catch(() => {});
      cancelled.sl.push(o.orderId);
    }
  }
  // Cancel existing TP/SL — algo orders (type=CONDITIONAL, dùng triggerPrice vs mark để phân loại)
  for (const o of allAlgo.filter((o) => o.symbol === symbol)) {
    if (tpPrice && isAlgoTp(o)) {
      await client.cancelAlgoOrder({ algoId: o.algoId, apiKey, apiSecret, recvWindow }).catch(() => {});
      cancelled.tp.push(o.algoId);
    } else if (slPrice && isAlgoSl(o)) {
      await client.cancelAlgoOrder({ algoId: o.algoId, apiKey, apiSecret, recvWindow }).catch(() => {});
      cancelled.sl.push(o.algoId);
    }
  }

  const qty = String(Math.abs(Number(pos.positionAmt)));
  const tpSlBase = (type, triggerPrice, clientId) => {
    const p = { algoType: 'CONDITIONAL', symbol, side: closeSide, type, triggerPrice: String(priceFromTick(symbolInfo, triggerPrice)), quantity: qty, workingType: 'MARK_PRICE', recvWindow, newClientOrderId: clientId };
    if (isHedge) p.positionSide = positionSide; else p.reduceOnly = 'true';
    return p;
  };

  if (tpPrice) {
    const params = tpSlBase('TAKE_PROFIT_MARKET', tpPrice, `lp_tp_${Date.now()}`.slice(0, 36));
    placed.tp = await client.placeAlgoOrder({ params, apiKey, apiSecret });
  }
  if (slPrice) {
    const params = tpSlBase('STOP_MARKET', slPrice, `lp_sl_${Date.now()}`.slice(0, 36));
    placed.sl = await client.placeAlgoOrder({ params, apiKey, apiSecret });
  }

  console.log(`[SetTpSl] ${symbol} tp=${tpPrice ?? '-'} sl=${slPrice ?? '-'} cancelled=${JSON.stringify(cancelled)}`);
  return { symbol, cancelled, placed };
}

async function getMarketSnapshot() {
  if (snapshotCache.data && Date.now() < snapshotCache.expiresAt) return snapshotCache.data;
  // Deduplicate concurrent calls — all callers await the same in-flight promise
  if (snapshotCache.inflight) return snapshotCache.inflight;
  snapshotCache.inflight = (async () => {
    try {
      return await _fetchMarketSnapshot();
    } finally {
      snapshotCache.inflight = null;
    }
  })();
  return snapshotCache.inflight;
}

async function _fetchMarketSnapshot() {
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

async function readPaperStore() {
  try {
    const text = await readFile(PAPER_TRADES_FILE, 'utf8');
    const parsed = JSON.parse(text);
    return {
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      updatedAt: parsed.updatedAt ?? null,
      trades: Array.isArray(parsed.trades) ? parsed.trades : [],
    };
  } catch {
    const fresh = { createdAt: new Date().toISOString(), updatedAt: null, trades: [] };
    await writePaperStore(fresh);
    return fresh;
  }
}

async function writePaperStore(store) {
  await mkdir(join(rootDir, 'data'), { recursive: true });
  const payload = { ...store, updatedAt: new Date().toISOString() };
  await writeFile(PAPER_TRADES_FILE, JSON.stringify(payload, null, 2));
  return payload;
}

async function getPaperMark(symbol) {
  const cached = paperMarkCache.get(symbol);
  if (cached && Date.now() - cached.at < 30_000) return cached.markPrice;
  const price = await client.getPremiumIndex(symbol);
  return Number(price.markPrice);
}

function enrichPaperTrade(trade, markPrice = null) {
  const currentPrice = trade.status === 'CLOSED'
    ? Number(trade.exitPrice)
    : Number(markPrice ?? trade.markPrice ?? trade.entryPrice);
  const sideMult = trade.side === 'LONG' ? 1 : -1;
  const qty = Number(trade.quantity);
  const entry = Number(trade.entryPrice);
  const margin = Number(trade.marginUsdt);
  const isLivePaper = trade.status === 'OPEN' || trade.status === 'CLOSED';
  const pnl = isLivePaper ? (currentPrice - entry) * qty * sideMult : 0;
  const roe = isLivePaper && margin > 0 ? (pnl / margin) * 100 : 0;
  return {
    ...trade,
    markPrice: currentPrice,
    pnl,
    roe,
    notionalUsdt: margin * Number(trade.leverage),
  };
}

function paperSummary(trades) {
  const enriched = trades.map((t) => enrichPaperTrade(t, t.markPrice));
  const closed = enriched.filter((t) => t.status === 'CLOSED');
  const open = enriched.filter((t) => t.status === 'OPEN');
  const pending = enriched.filter((t) => t.status === 'PENDING');
  const entryReady = enriched.filter((t) => t.status === 'ENTRY_READY');
  const realizedPnl = closed.reduce((sum_, t) => sum_ + Number(t.pnl ?? 0), 0);
  const unrealizedPnl = open.reduce((sum_, t) => sum_ + Number(t.pnl ?? 0), 0);
  const wins = closed.filter((t) => Number(t.pnl) > 0).length;
  return {
    total: enriched.length,
    open: open.length,
    pending: pending.length,
    entryReady: entryReady.length,
    closed: closed.length,
    realizedPnl,
    unrealizedPnl,
    totalPnl: realizedPnl + unrealizedPnl,
    winRate: closed.length ? (wins / closed.length) * 100 : 0,
  };
}

async function getPaperTrades() {
  const store = await readPaperStore();
  const activeSymbols = [...new Set(store.trades.filter((t) => ['OPEN', 'PENDING', 'ENTRY_READY'].includes(t.status)).map((t) => t.symbol))];
  const marks = new Map();
  await Promise.all(activeSymbols.map(async (symbol) => {
    try { marks.set(symbol, await getPaperMark(symbol)); }
    catch { /* keep stored price */ }
  }));
  const trades = store.trades
    .map((t) => enrichPaperTrade(t, marks.get(t.symbol)))
    .sort((a, b) => new Date(b.openedAt ?? b.entryReadyAt ?? b.createdAt ?? 0) - new Date(a.openedAt ?? a.entryReadyAt ?? a.createdAt ?? 0));
  return { ...store, trades, summary: paperSummary(trades) };
}

async function createPaperTrade(payload) {
  const symbol = normalizeSymbol(payload.symbol ?? '');
  const side = String(payload.side ?? '').toUpperCase();
  const marginUsdt = Number(payload.marginUsdt);
  const leverage = Math.max(1, Math.min(125, Number(payload.leverage ?? 1)));
  const note = String(payload.note ?? '').slice(0, 500);

  if (!symbol) throw new Error('symbol is required.');
  if (!['LONG', 'SHORT'].includes(side)) throw new Error('side must be LONG or SHORT.');
  if (!Number.isFinite(marginUsdt) || marginUsdt <= 0) throw new Error('marginUsdt must be greater than 0.');
  const entryPrice = payload.entryPrice ? Number(payload.entryPrice) : await getPaperMark(symbol);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error('entryPrice must be greater than 0.');

  const trade = {
    id: crypto.randomUUID(),
    symbol,
    side,
    status: ['PENDING', 'ENTRY_READY'].includes(payload.status) ? payload.status : 'OPEN',
    marginUsdt,
    leverage,
    quantity: (marginUsdt * leverage) / entryPrice,
    entryPrice,
    createdAt: new Date().toISOString(),
    openedAt: ['PENDING', 'ENTRY_READY'].includes(payload.status) ? null : new Date().toISOString(),
    source: String(payload.source ?? 'manual').slice(0, 80),
    note,
  };

  const store = await readPaperStore();
  store.trades.unshift(trade);
  await writePaperStore(store);
  return { trade: enrichPaperTrade(trade, entryPrice) };
}

async function closePaperTrade(payload) {
  const id = String(payload.id ?? '');
  if (!id) throw new Error('id is required.');
  const store = await readPaperStore();
  const idx = store.trades.findIndex((t) => t.id === id);
  if (idx < 0) throw new Error('Paper trade not found.');
  const trade = store.trades[idx];
  if (trade.status === 'CLOSED') return { trade: enrichPaperTrade(trade, trade.exitPrice) };
  const exitPrice = payload.exitPrice ? Number(payload.exitPrice) : await getPaperMark(trade.symbol);
  if (!Number.isFinite(exitPrice) || exitPrice <= 0) throw new Error('exitPrice must be greater than 0.');
  store.trades[idx] = {
    ...trade,
    status: 'CLOSED',
    exitPrice,
    closedAt: new Date().toISOString(),
    closeNote: String(payload.closeNote ?? '').slice(0, 500),
  };
  await writePaperStore(store);
  return { trade: enrichPaperTrade(store.trades[idx], exitPrice) };
}

async function deletePaperTrade(payload) {
  const id = String(payload.id ?? '');
  if (!id) throw new Error('id is required.');
  const store = await readPaperStore();
  const before = store.trades.length;
  store.trades = store.trades.filter((t) => t.id !== id);
  await writePaperStore(store);
  return { deleted: before - store.trades.length, id };
}

async function placeBinanceMarketFromPaperTrade(payload, token = null) {
  const id = String(payload.id ?? '');
  if (!id) throw new Error('id is required.');

  const store = await readPaperStore();
  const idx = store.trades.findIndex((t) => t.id === id);
  if (idx < 0) throw new Error('Paper trade not found.');
  const trade = store.trades[idx];
  if (!['ENTRY_READY', 'OPEN'].includes(trade.status)) {
    throw new Error(`Paper trade must be ENTRY_READY or OPEN. Current status: ${trade.status}`);
  }

  const { apiKey, apiSecret } = getApiCredentials(token);
  const symbol = normalizeSymbol(trade.symbol);
  const side = trade.side === 'LONG' ? 'BUY' : 'SELL';
  const marginUsdt = Number(payload.marginUsdt ?? process.env.PAPER_BINANCE_MARKET_MARGIN ?? process.env.AUTO_LIQ_ORDER_MARGIN ?? 2);
  const leverage = Math.max(1, Math.min(125, Number(payload.leverage ?? trade.leverage ?? process.env.AUTO_LIQ_ORDER_LEVERAGE ?? 10)));
  const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);

  const [symbols, premiumIndex] = await Promise.all([
    getSymbols(),
    client.getPremiumIndex(symbol),
  ]);
  const symbolInfo = symbols.find((s) => s.symbol === symbol);
  if (!symbolInfo) throw new Error(`Symbol ${symbol} is not tradable.`);

  const markPrice = Number(premiumIndex.markPrice);
  const quantity = quantityFromNotional(symbolInfo, marginUsdt * leverage, markPrice, false);
  await client.setLeverage({ symbol, leverage, apiKey, apiSecret, recvWindow }).catch(() => {});

  const isHedge = await getHedgeMode(null);
  const positionSide = isHedge ? (side === 'BUY' ? 'LONG' : 'SHORT') : undefined;
  const params = {
    symbol,
    side,
    type: 'MARKET',
    quantity,
    recvWindow,
    newClientOrderId: `paper_mkt_${Date.now()}`.slice(0, 36),
  };
  if (isHedge) params.positionSide = positionSide;
  else params.reduceOnly = 'false';

  const orderResult = await client.placeFuturesOrder({ params, apiKey, apiSecret });
  const executedQty = Number(orderResult.executedQty ?? quantity);
  const avgPrice = Number(orderResult.avgPrice ?? 0) || markPrice;

  store.trades[idx] = {
    ...trade,
    status: 'OPEN',
    marginUsdt,
    leverage,
    quantity: executedQty || Number(trade.quantity),
    entryPrice: avgPrice,
    openedAt: new Date().toISOString(),
    binancePlacedAt: new Date().toISOString(),
    binanceOrderId: orderResult.orderId,
    binanceClientOrderId: orderResult.clientOrderId,
    binanceStatus: orderResult.status,
    note: appendPaperNote(trade.note, `binanceMarket=placed margin=${marginUsdt} mark=${markPrice}`),
  };
  await writePaperStore(store);

  trackSubmittedOrderPosition({
    symbol,
    side,
    quantity: executedQty || quantity,
    leverage,
    markPrice: avgPrice,
    orderResult,
    isHedge,
    positionSide,
    orderType: 'MARKET',
  });

  return { trade: enrichPaperTrade(store.trades[idx], avgPrice), order: orderResult };
}

function appendPaperNote(note, part) {
  return [String(note ?? '').trim(), part].filter(Boolean).join(' | ');
}

async function autoPlaceBinanceOnEntryReady(trade, reason, markPrice) {
  if (!runtimeSettings.autoProbeEnabled) return;
  if (isVnBlockHour()) { console.log('[AutoProbe] ⏰ Block 17-19h VN'); return; }
  try {
    const { apiKey, apiSecret } = getApiCredentials(null);
    const marginUsdt = runtimeSettings.autoProbeMargin;
    const leverage = Math.max(1, Math.min(125, Number(trade.leverage ?? process.env.AUTO_LIQ_ORDER_LEVERAGE ?? 10)));
    const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);
    const symbol = normalizeSymbol(trade.symbol);
    const side = trade.side === 'LONG' ? 'BUY' : 'SELL';

    const [symbols, premiumIndex] = await Promise.all([getSymbols(), client.getPremiumIndex(symbol)]);
    const symbolInfo = symbols.find((s) => s.symbol === symbol);
    if (!symbolInfo) { console.warn(`[AutoProbe] ${symbol} not in symbols`); return; }

    const currentMark = Number(premiumIndex.markPrice) || markPrice;
    const quantity = quantityFromNotional(symbolInfo, marginUsdt * leverage, currentMark, false);
    await client.setLeverage({ symbol, leverage, apiKey, apiSecret, recvWindow }).catch(() => {});

    const isHedge = await getHedgeMode(null);
    const positionSide = isHedge ? (side === 'BUY' ? 'LONG' : 'SHORT') : undefined;
    const params = { symbol, side, type: 'MARKET', quantity, recvWindow, newClientOrderId: `paper_probe_${Date.now()}`.slice(0, 36) };
    if (isHedge) params.positionSide = positionSide; else params.reduceOnly = 'false';

    const orderResult = await client.placeFuturesOrder({ params, apiKey, apiSecret });
    const executedQty = Number(orderResult.executedQty ?? quantity);
    const avgPrice = Number(orderResult.avgPrice ?? 0) || currentMark;

    // Update paper trade → OPEN
    const store = await readPaperStore();
    const idx = store.trades.findIndex((t) => t.id === trade.id);
    if (idx >= 0) {
      store.trades[idx] = {
        ...store.trades[idx],
        status: 'OPEN',
        marginUsdt,
        leverage,
        quantity: executedQty,
        entryPrice: avgPrice,
        openedAt: new Date().toISOString(),
        binancePlacedAt: new Date().toISOString(),
        binanceOrderId: orderResult.orderId,
        binanceClientOrderId: orderResult.clientOrderId,
        binanceStatus: orderResult.status,
        note: appendPaperNote(store.trades[idx].note, `autoProbe=placed margin=${marginUsdt} mark=${avgPrice}`),
      };
      await writePaperStore(store);
    }

    console.log(`[AutoProbe] ✅ ${symbol} ${trade.side} MARKET @${avgPrice} margin=${marginUsdt} qty=${executedQty}`);

    // Discord notification
    const webhookUrl = process.env.LIQ_SCAN_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      const dirIcon = trade.side === 'LONG' ? '🟢' : '🔴';
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: `${dirIcon} **[AutoProbe] ${symbol} ${trade.side}** MARKET @${avgPrice}\n💰 Margin: $${marginUsdt} × ${leverage}x\n📋 Lý do: ${reason ?? trade.note ?? '-'}`,
        }),
      }).catch(() => {});
    }
  } catch (err) {
    console.error(`[AutoProbe] ❌ ${trade.symbol}:`, err.message);
  }
}

async function createLiqPaperTrade({ symbol, markPrice, direction, sweepTargetPrice, sweepProb, confirmation = null }) {
  if (process.env.PAPER_LIQ_ENABLED === 'false') return null;
  const minProb = Number(process.env.PAPER_LIQ_MIN_PROB ?? 80);
  if (sweepProb < minProb) return null;

  const side = direction === 'short' ? 'SHORT' : 'LONG';
  const store = await readPaperStore();
  const existingIdx = store.trades.findIndex((t) =>
    ['OPEN', 'PENDING', 'ENTRY_READY'].includes(t.status) &&
    t.symbol === symbol &&
    t.side === side &&
    String(t.source ?? '').startsWith('liq-sweep')
  );
  if (existingIdx >= 0) {
    const existing = store.trades[existingIdx];
    if (existing.status === 'PENDING' && confirmation?.confirmed === true) {
      store.trades[existingIdx] = {
        ...existing,
        status: 'ENTRY_READY',
        entryReadyAt: new Date().toISOString(),
        markPriceAtReady: markPrice,
        note: updatePaperConfirmationNote(existing.note, confirmation.reason, markPrice),
      };
      await writePaperStore(store);
      console.log(`[PaperLiq] 🎯 ENTRY_READY ${symbol} ${side} mark=${markPrice} reason=${confirmation.reason}`);
      autoPlaceBinanceOnEntryReady(store.trades[existingIdx], confirmation.reason, markPrice).catch(() => {});
      return { trade: enrichPaperTrade(store.trades[existingIdx], markPrice) };
    }
    console.log(`[PaperLiq] ⏭ ${symbol} ${side} skip — paper trade đang chờ/sẵn sàng/mở`);
    return null;
  }

  const marginUsdt = Number(process.env.PAPER_LIQ_MARGIN ?? process.env.AUTO_LIQ_PROBE_MARGIN ?? 1);
  const leverage = Number(process.env.PAPER_LIQ_LEVERAGE ?? process.env.AUTO_LIQ_ORDER_LEVERAGE ?? 10);
  const note = [
    `sweepProb=${sweepProb}%`,
    `target=${sweepTargetPrice}`,
    confirmation?.reason ? `confirmation=${confirmation.reason}` : null,
  ].filter(Boolean).join(' | ');
  const status = confirmation?.confirmed === true ? 'ENTRY_READY' : 'PENDING';

  const result = await createPaperTrade({
    symbol,
    side,
    marginUsdt,
    leverage,
    entryPrice: sweepTargetPrice || markPrice,
    status,
    source: `liq-sweep-${sweepProb}`,
    note,
  });
  console.log(`[PaperLiq] ${status === 'ENTRY_READY' ? '🎯' : '🕓'} ${symbol} ${side} ${status} entry=${sweepTargetPrice || markPrice} mark=${markPrice} margin=${marginUsdt} lev=${leverage}x sweepProb=${sweepProb}%`);
  if (status === 'ENTRY_READY' && result?.trade) {
    autoPlaceBinanceOnEntryReady(result.trade, confirmation?.reason ?? note, markPrice).catch(() => {});
  }
  return result;
}

function paperEntryTouched(trade, markPrice) {
  const entry = Number(trade.entryPrice);
  if (!entry || !markPrice) return false;
  return trade.side === 'LONG' ? markPrice <= entry : markPrice >= entry;
}

function updatePaperFillNote(note, markPrice) {
  const filledText = `confirmation=entry touched by mark price (${markPrice})`;
  const base = String(note ?? '');
  if (base.includes('confirmation=')) {
    return base.replace(/confirmation=[^|]+/, filledText);
  }
  return [base, filledText].filter(Boolean).join(' | ');
}

function updatePaperConfirmationNote(note, reason, markPrice) {
  const readyText = `confirmation=${reason ?? 'entry ready'} @ mark ${markPrice}`;
  const base = String(note ?? '');
  if (base.includes('confirmation=')) {
    return base.replace(/confirmation=[^|]+/, readyText);
  }
  return [base, readyText].filter(Boolean).join(' | ');
}

async function fillPendingPaperTrade(trade, markPrice) {
  const store = await readPaperStore();
  const idx = store.trades.findIndex((t) => t.id === trade.id && t.status === 'PENDING');
  if (idx < 0) return null;
  const current = store.trades[idx];
  if (!paperEntryTouched(current, markPrice)) return null;

  store.trades[idx] = {
    ...current,
    status: 'OPEN',
    openedAt: new Date().toISOString(),
    filledAt: new Date().toISOString(),
    fillPrice: Number(current.entryPrice),
    fillMarkPrice: markPrice,
    note: updatePaperFillNote(current.note, markPrice),
  };
  await writePaperStore(store);
  console.log(`[PaperLiq] ✅ FILLED ${current.symbol} ${current.side} entry=${current.entryPrice} mark=${markPrice}`);
  return store.trades[idx];
}

async function processPaperPendingFillsForSymbol(symbol, markPrice) {
  if (paperFillLocks.has(symbol)) return;
  paperFillLocks.add(symbol);
  try {
    const store = await readPaperStore();
    const pending = store.trades.filter((t) => t.status === 'PENDING' && t.symbol === symbol);
    for (const trade of pending) {
      if (paperEntryTouched(trade, markPrice)) await fillPendingPaperTrade(trade, markPrice);
    }
  } finally {
    paperFillLocks.delete(symbol);
  }
}

async function processAllPaperPendingFills() {
  const store = await readPaperStore();
  const pending = store.trades.filter((t) => t.status === 'PENDING');
  for (const trade of pending) {
    const markPrice = await getPaperMark(trade.symbol).catch(() => null);
    if (markPrice) await processPaperPendingFillsForSymbol(trade.symbol, markPrice);
  }
}

async function syncPaperTickerSymbols() {
  if (!paperTicker) return;
  const store = await readPaperStore();
  const symbols = [...new Set(store.trades
    .filter((t) => ['OPEN', 'PENDING', 'ENTRY_READY'].includes(t.status))
    .map((t) => t.symbol)
    .filter(Boolean))];
  paperTicker.setSymbols(symbols);
}

// ── Cap paper trade system (separate from liquidation paper trades) ──────────

async function readCapPaperStore() {
  try {
    const raw = await readFile(CAP_PAPER_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.trades)) throw new Error('invalid structure');
    return parsed;
  } catch (e) {
    console.warn('[CapPaper] Store read error, starting fresh:', e.message);
    return { trades: [] };
  }
}

let _capPaperWriteLock = Promise.resolve();
async function writeCapPaperStore(store) {
  // Serialize writes để tránh race condition ghi file đồng thời
  _capPaperWriteLock = _capPaperWriteLock.then(() =>
    writeFile(CAP_PAPER_FILE, JSON.stringify(store, null, 2))
  );
  return _capPaperWriteLock;
}

function enrichCapPaperTrade(t, markPrice) {
  const mark = Number(markPrice ?? t.markPrice ?? t.exitPrice ?? t.entryPrice);
  const entry = Number(t.entryPrice);
  const qty = Number(t.quantity);
  const margin = Number(t.marginUsdt);
  const sideMult = t.side === 'LONG' ? 1 : -1;
  const isActive = t.status === 'OPEN';
  const pnl = isActive ? (mark - entry) * qty * sideMult : (t.pnl ?? null);
  const roe = isActive && margin > 0 ? (pnl / margin) * 100 : (t.roe ?? null);
  return { ...t, markPrice: mark, pnl, roe };
}

async function getCapPaperTrades() {
  const store = await readCapPaperStore();
  const trades = store.trades.map((t) => enrichCapPaperTrade(t, capMarkCache.get(t.symbol)));
  const open = trades.filter((t) => t.status !== 'CLOSED');
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const wins   = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const tpHits = closed.filter((t) => t.outcome === 'TP').length;
  const slHits = closed.filter((t) => t.outcome === 'SL').length;
  const avgRoe = closed.length > 0
    ? closed.reduce((s, t) => s + (t.roe ?? 0), 0) / closed.length
    : null;
  const summary = { total: trades.length, open: open.length, closed: closed.length, wins, losses: closed.length - wins, tpHits, slHits, avgRoe: avgRoe != null ? +avgRoe.toFixed(1) : null };
  return { trades, summary };
}

async function createCapPaperTrade(payload) {
  const symbol = String(payload.symbol ?? '').toUpperCase().trim();
  const side = String(payload.side ?? '').toUpperCase();
  const marginUsdt = Number(payload.marginUsdt ?? 1);
  const leverage = Math.max(1, Math.min(125, Number(payload.leverage ?? 10)));
  const entryPrice = Number(payload.entryPrice);

  if (!symbol) throw new Error('symbol required');
  if (!['LONG', 'SHORT'].includes(side)) throw new Error('side must be LONG or SHORT');
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error('entryPrice required');

  const store = await readCapPaperStore();
  // Dedup: skip if same symbol+side+entry already PENDING or OPEN
  const dup = store.trades.find((t) =>
    t.symbol === symbol && t.side === side && Math.abs(t.entryPrice - entryPrice) / entryPrice < 0.005 &&
    ['PENDING', 'OPEN'].includes(t.status),
  );
  if (dup) return { trade: enrichCapPaperTrade(dup, capMarkCache.get(symbol)) };

  const status = payload.status === 'OPEN' ? 'OPEN' : 'PENDING';
  const trade = {
    id: crypto.randomUUID(),
    symbol, side, status,
    marginUsdt, leverage,
    quantity: (marginUsdt * leverage) / entryPrice,
    entryPrice,
    tp: payload.tp != null ? Number(payload.tp) : null,
    sl: payload.sl != null ? Number(payload.sl) : null,
    fillPrice: status === 'OPEN' ? entryPrice : null,
    exitPrice: null,
    pnl: null,
    roe: null,
    outcome: null, // 'TP' | 'SL' | 'MANUAL'
    createdAt: new Date().toISOString(),
    openedAt: status === 'OPEN' ? new Date().toISOString() : null,
    closedAt: null,
    source: String(payload.source ?? 'manual').slice(0, 80),
    note: String(payload.note ?? '').slice(0, 500),
  };
  store.trades.unshift(trade);
  await writeCapPaperStore(store);
  console.log(`[CapPaper] ${status === 'PENDING' ? '⏳' : '✅'} ${side} ${symbol} entry=${entryPrice} src=${trade.source}`);
  return { trade: enrichCapPaperTrade(trade, entryPrice) };
}

async function closeCapPaperTrade(payload) {
  const store = await readCapPaperStore();
  const idx = store.trades.findIndex((t) => t.id === payload.id);
  if (idx < 0) throw new Error('Cap paper trade not found');
  const trade = store.trades[idx];
  if (trade.status === 'CLOSED') return { trade: enrichCapPaperTrade(trade, trade.exitPrice) };
  const exitPrice = payload.exitPrice ? Number(payload.exitPrice) : (capMarkCache.get(trade.symbol) ?? trade.entryPrice);
  const sideMult = trade.side === 'LONG' ? 1 : -1;
  const pnl = (exitPrice - trade.entryPrice) * trade.quantity * sideMult;
  const roe = trade.marginUsdt > 0 ? (pnl / trade.marginUsdt) * 100 : 0;
  const outcome = payload.outcome ?? 'MANUAL';
  store.trades[idx] = { ...trade, status: 'CLOSED', exitPrice, pnl, roe, outcome, closedAt: new Date().toISOString() };
  await writeCapPaperStore(store);
  return { trade: enrichCapPaperTrade(store.trades[idx], exitPrice) };
}

async function deleteCapPaperTrade(payload) {
  const store = await readCapPaperStore();
  store.trades = store.trades.filter((t) => t.id !== payload.id);
  await writeCapPaperStore(store);
  return { ok: true };
}

async function fillCapPendingTrade(trade, markPrice) {
  if (capPaperFillLocks.has(trade.id)) return;
  capPaperFillLocks.add(trade.id);
  try {
    const store = await readCapPaperStore();
    const idx = store.trades.findIndex((t) => t.id === trade.id && t.status === 'PENDING');
    if (idx < 0) return;
    const entry = Number(store.trades[idx].entryPrice);
    const touched = store.trades[idx].side === 'LONG' ? markPrice <= entry : markPrice >= entry;
    if (!touched) return;
    store.trades[idx] = { ...store.trades[idx], status: 'OPEN', fillPrice: entry, openedAt: new Date().toISOString() };
    await writeCapPaperStore(store);
    console.log(`[CapPaper] ✅ FILLED ${store.trades[idx].side} ${store.trades[idx].symbol} entry=${entry} mark=${markPrice}`);
  } finally {
    capPaperFillLocks.delete(trade.id);
  }
}

async function processCapPaperFills(symbol, markPrice) {
  const store = await readCapPaperStore();
  const pending = store.trades.filter((t) => t.status === 'PENDING' && t.symbol === symbol);
  for (const t of pending) await fillCapPendingTrade(t, markPrice);
  // Auto-close OPEN trades that hit TP or SL
  const open = store.trades.filter((t) => t.status === 'OPEN' && t.symbol === symbol);
  for (const t of open) await checkCapPaperTpSl(t, markPrice);
}

const capPaperTpSlLocks = new Set();
async function checkCapPaperTpSl(trade, markPrice) {
  if (!trade.tp && !trade.sl) return;
  if (capPaperTpSlLocks.has(trade.id)) return;
  const isLong = trade.side === 'LONG';
  const tpHit = trade.tp != null && (isLong ? markPrice >= trade.tp : markPrice <= trade.tp);
  const slHit = trade.sl != null && (isLong ? markPrice <= trade.sl : markPrice >= trade.sl);
  if (!tpHit && !slHit) return;
  capPaperTpSlLocks.add(trade.id);
  try {
    const outcome = tpHit ? 'TP' : 'SL';
    const exitPrice = tpHit ? trade.tp : trade.sl;
    await closeCapPaperTrade({ id: trade.id, exitPrice, outcome });
    console.log(`[CapPaper] 🎯 ${outcome} hit ${trade.side} ${trade.symbol} exit=${exitPrice}`);
  } finally {
    capPaperTpSlLocks.delete(trade.id);
  }
}

async function syncCapPaperTicker() {
  if (!capPaperTicker) return;
  const store = await readCapPaperStore();
  const symbols = [...new Set(store.trades.filter((t) => ['PENDING', 'OPEN'].includes(t.status)).map((t) => t.symbol))];
  capPaperTicker.setSymbols(symbols);
}

function startCapPaperTicker() {
  if (capPaperTicker) return;
  capPaperTicker = createMarkPriceTicker({
    onPrice: ({ symbol, markPrice }) => {
      capMarkCache.set(symbol, markPrice);
      processCapPaperFills(symbol, markPrice).catch(() => {});
    },
  });
  console.log('[CapPaper] Mark ticker started.');
  syncCapPaperTicker().catch(() => {});
  setInterval(() => syncCapPaperTicker().catch(() => {}), 30_000);
}

// ── End cap paper trade system ───────────────────────────────────────────────

// ── Pump paper trade system ───────────────────────────────────────────────────

async function readPumpPaperStore() {
  try {
    const raw = await readFile(PUMP_PAPER_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.trades)) throw new Error('invalid structure');
    return parsed;
  } catch (e) {
    console.warn('[PumpPaper] Store read error, starting fresh:', e.message);
    return { trades: [] };
  }
}

let _pumpPaperWriteLock = Promise.resolve();
async function writePumpPaperStore(store) {
  _pumpPaperWriteLock = _pumpPaperWriteLock.then(() =>
    writeFile(PUMP_PAPER_FILE, JSON.stringify(store, null, 2))
  );
  return _pumpPaperWriteLock;
}

function enrichPumpPaperTrade(t, markPrice) {
  const mark = Number(markPrice ?? t.markPrice ?? t.exitPrice ?? t.entryPrice);
  const entry = Number(t.entryPrice);
  const qty = Number(t.quantity);
  const margin = Number(t.marginUsdt);
  const sideMult = t.side === 'LONG' ? 1 : -1;
  const isActive = t.status === 'OPEN';
  const pnl = isActive ? (mark - entry) * qty * sideMult : (t.pnl ?? null);
  const roe = isActive && margin > 0 ? (pnl / margin) * 100 : (t.roe ?? null);
  return { ...t, markPrice: mark, pnl, roe };
}

async function getPumpPaperTrades() {
  const store = await readPumpPaperStore();
  const trades = store.trades.map((t) => enrichPumpPaperTrade(t, pumpMarkCache.get(t.symbol)));
  const open = trades.filter((t) => t.status !== 'CLOSED');
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const wins   = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const tpHits = closed.filter((t) => t.outcome === 'TP').length;
  const slHits = closed.filter((t) => t.outcome === 'SL').length;
  const avgRoe = closed.length > 0
    ? closed.reduce((s, t) => s + (t.roe ?? 0), 0) / closed.length
    : null;
  const summary = { total: trades.length, open: open.length, closed: closed.length, wins, losses: closed.length - wins, tpHits, slHits, avgRoe: avgRoe != null ? +avgRoe.toFixed(1) : null };
  return { trades, summary };
}

async function createPumpPaperTrade(payload) {
  const symbol = String(payload.symbol ?? '').toUpperCase().trim();
  const side = String(payload.side ?? '').toUpperCase();
  const marginUsdt = Number(payload.marginUsdt ?? 1);
  const leverage = Math.max(1, Math.min(125, Number(payload.leverage ?? 10)));
  const entryPrice = Number(payload.entryPrice);

  if (!symbol) throw new Error('symbol required');
  if (!['LONG', 'SHORT'].includes(side)) throw new Error('side must be LONG or SHORT');
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error('entryPrice required');

  const store = await readPumpPaperStore();
  const dup = store.trades.find((t) =>
    t.symbol === symbol && t.side === side && Math.abs(t.entryPrice - entryPrice) / entryPrice < 0.005 &&
    ['PENDING', 'OPEN'].includes(t.status),
  );
  if (dup) return { trade: enrichPumpPaperTrade(dup, pumpMarkCache.get(symbol)) };

  const status = payload.status === 'OPEN' ? 'OPEN' : 'PENDING';
  const trade = {
    id: crypto.randomUUID(),
    symbol, side, status,
    marginUsdt, leverage,
    quantity: (marginUsdt * leverage) / entryPrice,
    entryPrice,
    tp: payload.tp != null ? Number(payload.tp) : null,
    sl: payload.sl != null ? Number(payload.sl) : null,
    fillPrice: status === 'OPEN' ? entryPrice : null,
    exitPrice: null,
    pnl: null,
    roe: null,
    outcome: null,
    createdAt: new Date().toISOString(),
    openedAt: status === 'OPEN' ? new Date().toISOString() : null,
    closedAt: null,
    source: String(payload.source ?? 'manual').slice(0, 80),
    note: String(payload.note ?? '').slice(0, 500),
  };
  store.trades.unshift(trade);
  await writePumpPaperStore(store);
  console.log(`[PumpPaper] ${status === 'PENDING' ? '⏳' : '✅'} ${side} ${symbol} entry=${entryPrice} src=${trade.source}`);
  return { trade: enrichPumpPaperTrade(trade, entryPrice) };
}

async function closePumpPaperTrade(payload) {
  const store = await readPumpPaperStore();
  const idx = store.trades.findIndex((t) => t.id === payload.id);
  if (idx < 0) throw new Error('Pump paper trade not found');
  const trade = store.trades[idx];
  if (trade.status === 'CLOSED') return { trade: enrichPumpPaperTrade(trade, trade.exitPrice) };
  const exitPrice = payload.exitPrice ? Number(payload.exitPrice) : (pumpMarkCache.get(trade.symbol) ?? trade.entryPrice);
  const sideMult = trade.side === 'LONG' ? 1 : -1;
  const pnl = (exitPrice - trade.entryPrice) * trade.quantity * sideMult;
  const roe = trade.marginUsdt > 0 ? (pnl / trade.marginUsdt) * 100 : 0;
  const outcome = payload.outcome ?? 'MANUAL';
  store.trades[idx] = { ...trade, status: 'CLOSED', exitPrice, pnl, roe, outcome, closedAt: new Date().toISOString() };
  await writePumpPaperStore(store);
  return { trade: enrichPumpPaperTrade(store.trades[idx], exitPrice) };
}

async function deletePumpPaperTrade(payload) {
  const store = await readPumpPaperStore();
  store.trades = store.trades.filter((t) => t.id !== payload.id);
  await writePumpPaperStore(store);
  return { ok: true };
}

async function fillPumpPendingTrade(trade, markPrice) {
  if (pumpPaperFillLocks.has(trade.id)) return;
  pumpPaperFillLocks.add(trade.id);
  try {
    const store = await readPumpPaperStore();
    const idx = store.trades.findIndex((t) => t.id === trade.id && t.status === 'PENDING');
    if (idx < 0) return;
    const entry = Number(store.trades[idx].entryPrice);
    const touched = store.trades[idx].side === 'LONG' ? markPrice <= entry : markPrice >= entry;
    if (!touched) return;
    store.trades[idx] = { ...store.trades[idx], status: 'OPEN', fillPrice: entry, openedAt: new Date().toISOString() };
    await writePumpPaperStore(store);
    console.log(`[PumpPaper] ✅ FILLED ${store.trades[idx].side} ${store.trades[idx].symbol} entry=${entry} mark=${markPrice}`);
  } finally {
    pumpPaperFillLocks.delete(trade.id);
  }
}

async function processPumpPaperFills(symbol, markPrice) {
  const store = await readPumpPaperStore();
  const pending = store.trades.filter((t) => t.status === 'PENDING' && t.symbol === symbol);
  for (const t of pending) await fillPumpPendingTrade(t, markPrice);
  const open = store.trades.filter((t) => t.status === 'OPEN' && t.symbol === symbol);
  for (const t of open) await checkPumpPaperTpSl(t, markPrice);
}

const pumpPaperTpSlLocks = new Set();
async function checkPumpPaperTpSl(trade, markPrice) {
  if (!trade.tp && !trade.sl) return;
  if (pumpPaperTpSlLocks.has(trade.id)) return;
  const isLong = trade.side === 'LONG';
  const tpHit = trade.tp != null && (isLong ? markPrice >= trade.tp : markPrice <= trade.tp);
  const slHit = trade.sl != null && (isLong ? markPrice <= trade.sl : markPrice >= trade.sl);
  if (!tpHit && !slHit) return;
  pumpPaperTpSlLocks.add(trade.id);
  try {
    const outcome = tpHit ? 'TP' : 'SL';
    const exitPrice = tpHit ? trade.tp : trade.sl;
    await closePumpPaperTrade({ id: trade.id, exitPrice, outcome });
    console.log(`[PumpPaper] 🎯 ${outcome} hit ${trade.side} ${trade.symbol} exit=${exitPrice}`);
  } finally {
    pumpPaperTpSlLocks.delete(trade.id);
  }
}

async function syncPumpPaperTicker() {
  if (!pumpPaperTicker) return;
  const store = await readPumpPaperStore();
  const symbols = [...new Set(store.trades.filter((t) => ['PENDING', 'OPEN'].includes(t.status)).map((t) => t.symbol))];
  pumpPaperTicker.setSymbols(symbols);
}

function startPumpPaperTicker() {
  if (pumpPaperTicker) return;
  pumpPaperTicker = createMarkPriceTicker({
    onPrice: ({ symbol, markPrice }) => {
      pumpMarkCache.set(symbol, markPrice);
      processPumpPaperFills(symbol, markPrice).catch(() => {});
    },
  });
  console.log('[PumpPaper] Mark ticker started.');
  syncPumpPaperTicker().catch(() => {});
  setInterval(() => syncPumpPaperTicker().catch(() => {}), 30_000);
}

// ── End pump paper trade system ───────────────────────────────────────────────

function startPaperTradeTicker() {
  if (process.env.PAPER_TRADE_TICKER_ENABLED === 'false') return;
  if (paperTicker) return;
  paperTicker = createMarkPriceTicker({
    onPrice: ({ symbol, markPrice }) => {
      paperMarkCache.set(symbol, { markPrice, at: Date.now() });
      processPaperPendingFillsForSymbol(symbol, markPrice).catch(() => {});
    },
  });
  console.log('[PaperLiq] Mark ticker started for paper trades.');
  syncPaperTickerSymbols().catch(() => {});
  setInterval(() => syncPaperTickerSymbols().catch(() => {}), 10_000);
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
  if (isVnBlockHour()) { console.log('[AutoTrade] ⏰ Block 17-19h VN'); return; }
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

  if (!skipMinCheck) {
    const notionalFilter = symbolInfo.filters?.find((f) => f.filterType === 'MIN_NOTIONAL');
    const minNotionalFilter = Number(notionalFilter?.notional ?? notionalFilter?.minNotional ?? 0);
    if (minNotionalFilter > 0 && steppedQuantity * markPrice < minNotionalFilter) {
      throw new Error(`Order notional too small for ${symbolInfo.symbol}. Min ${minNotionalFilter} USDT required, got ${(steppedQuantity * markPrice).toFixed(2)} USDT.`);
    }
  }

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
  // Token cụ thể → dùng session của token đó
  if (token) {
    const creds = sessionCredentials.get(token);
    const apiKey = creds?.apiKey || process.env.BINANCE_API_KEY;
    const apiSecret = creds?.apiSecret || process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) throw new Error('Missing Binance API credentials. Enter API key on login or set BINANCE_API_KEY in .env.');
    return { apiKey, apiSecret };
  }
  // Background (token=null): chỉ dùng session đã đăng nhập, không lấy từ env
  if (sessionCredentials.size > 0) {
    const first = sessionCredentials.values().next().value;
    if (first?.apiKey && first?.apiSecret) return { apiKey: first.apiKey, apiSecret: first.apiSecret };
  }
  throw new Error('Chưa đăng nhập. Vào /orders và nhập API key để sử dụng.');
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

// ── Open orders cache — tránh gọi REST liên tục ───────────────────────────────
// Invalidate bằng invalidateOpenOrdersCache() sau mỗi lần đặt/hủy lệnh hoặc fill
let _openOrdersCache = null;      // cached array (all symbols, no-token)
let _openOrdersCacheAt = 0;
const OPEN_ORDERS_TTL = 30_000;   // 30s TTL fallback nếu không invalidate

function invalidateOpenOrdersCache() {
  _openOrdersCache = null;
  _openOrdersCacheAt = 0;
}

async function getCachedOpenOrders(apiKey, apiSecret) {
  if (_openOrdersCache && Date.now() - _openOrdersCacheAt < OPEN_ORDERS_TTL) {
    return _openOrdersCache;
  }
  _openOrdersCache = await client.getOpenOrders({ apiKey, apiSecret });
  _openOrdersCacheAt = Date.now();
  return _openOrdersCache;
}

async function getOpenOrders(symbol, token = null) {
  const { apiKey, apiSecret } = getApiCredentials(token);
  return client.getOpenOrders({ symbol, apiKey, apiSecret });
}

async function getOpenAlgoOrdersList(token = null) {
  const { apiKey, apiSecret } = getApiCredentials(token);
  const positions = await client.getPositions({ apiKey, apiSecret });
  const activeSymbols = [...new Set(positions.filter((p) => Number(p.positionAmt) !== 0).map((p) => p.symbol))];
  const collected = [];
  for (const symbol of activeSymbols) {
    try {
      const result = await client.getOpenAlgoOrders({ symbol, apiKey, apiSecret });
      const rows = Array.isArray(result?.orders) ? result.orders : Array.isArray(result) ? result : [];
      collected.push(...rows);
    } catch (err) {
      console.warn(`[OpenAlgo] ${symbol}: ${err.message}`);
    }
  }
  const byId = new Map();
  for (const row of collected) byId.set(row.algoId ?? row.clientAlgoId ?? `${row.symbol}:${row.triggerPrice}:${row.side}`, row);
  return [...byId.values()];
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

// ── BTC Trend Monitor — cancel contra-trend LIMIT orders on bias shift ──────────

let _prevBtcBias = { bear: 'neutral', bull: 'neutral' };

async function cancelContraTrendLimitOrders(direction, health, webhookUrl) {
  try {
    const { apiKey, apiSecret } = getApiCredentials(null);
    const allOrders = await client.getOpenOrders({ apiKey, apiSecret });
    const isReduceOnly = (o) => o.reduceOnly === true || o.reduceOnly === 'true';
    const isLimit = (o) => ['LIMIT', 'LIMIT_MAKER'].includes(String(o.type ?? o.origType ?? '').toUpperCase());
    const side = direction === 'LONG' ? 'BUY' : 'SELL';
    const targets = allOrders.filter((o) => isLimit(o) && !isReduceOnly(o) && o.side === side);
    if (!targets.length) return;

    const cancelled = [];
    for (const o of targets) {
      try {
        await client.cancelOrder({ symbol: o.symbol, orderId: o.orderId, apiKey, apiSecret });
        cancelled.push(o.symbol);
        console.log(`[BtcTrend] 🗑 Cancelled ${o.symbol} ${direction} LIMIT #${o.orderId}`);
      } catch (e) {
        console.warn(`[BtcTrend] ⚠ Cancel ${o.symbol} #${o.orderId}: ${e.message}`);
      }
    }

    if (cancelled.length && webhookUrl) {
      const btcSide = direction === 'LONG' ? `bearish (${health.bearPoints}/8)` : `bullish (${health.bullPoints}/6)`;
      const msg = `🗑 **Contra-trend LIMIT xoá** | BTC ${btcSide}\n` +
        `Đã cancel **${cancelled.length}** lệnh ${direction} LIMIT: ${cancelled.join(', ')}\n` +
        `RSI 1h: ${health.rsi1h} · RSI 4h: ${health.rsi4h} · EMA20 1h: ${health.emaTrend1h} · 6h: ${health.pct6h != null ? (health.pct6h > 0 ? '+' : '') + health.pct6h + '%' : '–'}`;
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: msg }),
      }).catch(() => {});
    }
  } catch (e) {
    if (e.message?.includes('Missing Binance API')) return;
    console.error('[BtcTrend] cancel error:', e.message);
  }
}

async function runBtcHealthMonitor() {
  try {
    // Force refresh để luôn đọc data mới nhất
    btcHealthCache.expiresAt = 0;
    const health = await getBtcHealth();
    if (!health || health.error) return;

    const webhookUrl = process.env.LIQ_SCAN_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
    const prevBear = _prevBtcBias.bear;
    const currBear = health.bias;
    const prevBull = _prevBtcBias.bull;
    const currBull = health.bullBias;

    // Chuyển sang xấu → cancel LONG LIMIT
    if (prevBear === 'neutral' && (currBear === 'caution' || currBear === 'bearish')) {
      console.log(`[BtcTrend] 🔴 Bear shift: ${prevBear} → ${currBear} — cancelling LONG LIMITs`);
      await cancelContraTrendLimitOrders('LONG', health, webhookUrl);
    }

    // Chuyển sang tốt → cancel SHORT LIMIT
    if (prevBull === 'neutral' && (currBull === 'caution' || currBull === 'bullish')) {
      console.log(`[BtcTrend] 🟢 Bull shift: ${prevBull} → ${currBull} — cancelling SHORT LIMITs`);
      await cancelContraTrendLimitOrders('SHORT', health, webhookUrl);
    }

    _prevBtcBias = { bear: currBear, bull: currBull };
  } catch (e) {
    if (e.message?.includes('Missing Binance API')) return;
    console.warn('[BtcTrend] monitor error:', e.message);
  }
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
        tpConfirmedClear(sym);
        negTpLastRun.delete(sym);
        negativeSince.delete(sym);
        slTrailLockRoe.delete(sym);
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
      const isReduceOnly = (o) => o.reduceOnly === true || o.reduceOnly === 'true';
      const isLimitType  = (o) => {
        const t = String(o.type ?? o.origType ?? '').toUpperCase();
        return t === 'LIMIT' || t === 'LIMIT_MAKER';
      };
      const stale = allOrders.filter(
        (o) => isLimitType(o) && !isReduceOnly(o) && (now - Number(o.time)) > staleMs,
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
  // 10→1, 15→5, 20→10, 25→15, 30→20, ...
  if (roe >= 15) {
    const steps = Math.floor((roe - 15) / 5);
    return (15 + steps * 5) - 10;
  }
  if (roe >= 10) return 1;
  return null;
}

const slTrailRunning = new Set();
const slTrailLockRoe = new Map(); // symbol → current lock ROE level (in-memory dedup)
const slTrailLastRun = new Map(); // symbol → timestamp of last API call
const SL_TRAIL_COOLDOWN_MS = 60_000; // tối thiểu 60s giữa 2 lần gọi API cho cùng symbol

async function handleSlTrailByProfit(symbol, pos, roe, markPrice = null) {
  if (process.env.AUTO_SL_ENABLED === 'false') return;
  if (slTrailRunning.has(symbol)) return;
  const lastRun = slTrailLastRun.get(symbol) ?? 0;
  if (Date.now() - lastRun < SL_TRAIL_COOLDOWN_MS) return;

  const targetLockRoe = getTargetLockRoe(roe);
  if (targetLockRoe === null) return;

  const currentLockRoe = slTrailLockRoe.get(symbol) ?? -Infinity;
  if (targetLockRoe <= currentLockRoe) return;

  slTrailRunning.add(symbol);
  slTrailLastRun.set(symbol, Date.now());
  try {
    const { apiKey, apiSecret } = getApiCredentials(null);
    const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);

    const [algoResult, openOrdersResult, symbolList] = await Promise.all([
      client.getOpenAlgoOrders({ symbol, apiKey, apiSecret }),
      client.getOpenOrders({ symbol, apiKey, apiSecret }),
      getSymbols(),
    ]);
    const allAlgo = Array.isArray(algoResult?.orders) ? algoResult.orders : Array.isArray(algoResult) ? algoResult : [];
    const allOpen = Array.isArray(openOrdersResult) ? openOrdersResult : [];

    const isLong = pos.amt > 0;
    const entry = Number(pos.entry);
    if (!isFinite(entry) || entry <= 0) return;

    // Algo SL: type=CONDITIONAL, closing side, triggerPrice on loss side of entry
    const algoSl = allAlgo.find((o) => {
      if (o.symbol !== symbol) return false;
      const side = String(o.side ?? '').toUpperCase();
      const closingSide = (isLong && side === 'SELL') || (!isLong && side === 'BUY');
      const triggerP = Number(o.triggerPrice ?? o.stopPrice ?? 0);
      const isSLSide = triggerP > 0 && (isLong ? triggerP < entry : triggerP > entry);
      return closingSide && isSLSide;
    });
    // Regular SL: STOP_MARKET or STOP type
    const regularSl = allOpen.find((o) => {
      if (o.symbol !== symbol) return false;
      const t = String(o.type ?? '').toUpperCase();
      return t === 'STOP_MARKET' || t === 'STOP';
    });
    const slOrder = algoSl || regularSl;

    const symbolInfo = symbolList.find((s) => s.symbol === symbol);
    if (!symbolInfo) return;

    const leverage = pos.leverage || 10;

    const rawSlPrice = isLong
      ? entry * (1 + (targetLockRoe / 100) / leverage)
      : entry * (1 - (targetLockRoe / 100) / leverage);
    if (!isFinite(rawSlPrice) || rawSlPrice <= 0) return;
    const newSlPrice = priceFromTick(symbolInfo, rawSlPrice);
    if (!newSlPrice || newSlPrice === 'NaN' || Number(newSlPrice) <= 0) return;

    const mark = Number(markPrice ?? 0);
    if (mark > 0) {
      if (isLong && Number(newSlPrice) >= mark) {
        console.warn(`[SlTrail] ${symbol} SKIP: SL ${newSlPrice} >= mark ${mark} — would trigger immediately`);
        return;
      }
      if (!isLong && Number(newSlPrice) <= mark) {
        console.warn(`[SlTrail] ${symbol} SKIP: SL ${newSlPrice} <= mark ${mark} — would trigger immediately`);
        return;
      }
    }

    // Current SL already at or better than target → just record it
    if (slOrder) {
      const curSl = Number(slOrder.triggerPrice ?? slOrder.stopPrice ?? 0);
      if ((isLong && curSl >= newSlPrice) || (!isLong && curSl <= newSlPrice)) {
        slTrailLockRoe.set(symbol, targetLockRoe);
        return;
      }
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

    // Place new SL FIRST — cancel old one only after placement succeeds.
    // If cancel-first and placement fails (e.g. "max stop order limit"),
    // the position ends up with NO SL at all.
    await client.placeAlgoOrder({ params: slParams, apiKey, apiSecret });

    // New SL confirmed placed → safe to remove old one now
    if (algoSl) {
      await client.cancelAlgoOrder({ algoId: algoSl.algoId, apiKey, apiSecret, recvWindow })
        .catch((e) => console.warn(`[SlTrail] ⚠ ${symbol} cancel old algo SL (non-critical):`, e.message));
    } else if (regularSl) {
      await client.cancelOrder({ symbol, orderId: regularSl.orderId, apiKey, apiSecret, recvWindow })
        .catch((e) => console.warn(`[SlTrail] ⚠ ${symbol} cancel old regular SL (non-critical):`, e.message));
    }

    slTrailLockRoe.set(symbol, targetLockRoe);
    console.log(`[SlTrail] ✅ ${symbol} ROE=${roe.toFixed(1)}% → ${slOrder ? 'SL dời lên' : 'SL mới'} +${targetLockRoe}% ROE @ ${newSlPrice}`);
  } catch (err) {
    console.error(`[SlTrail] ❌ ${symbol}:`, err.message);
  } finally {
    slTrailRunning.delete(symbol);
  }
}

async function triggerSlGuardForSymbol(symbol) {
  console.log(`[SlGuard] triggerSlGuardForSymbol called: ${symbol}`);
  try {
    const { apiKey, apiSecret } = getApiCredentials(null);
    const positions = await client.getPositions({ apiKey, apiSecret });
    const pos = positions.find((p) => p.symbol === symbol && Number(p.positionAmt) !== 0);
    if (!pos) { console.log(`[SlGuard] ${symbol} no active position found`); return; }
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

const liqAutoOrderFired = new Map(); // `${symbol}:${price}` → timestamp
const pendingLiqTp = new Map(); // symbol → { tpPrice, tpRoePct, direction, at }

function getLiqHighProbThreshold() {
  const thresholds = [];
  if (process.env.PAPER_LIQ_ENABLED !== 'false') thresholds.push(Number(process.env.PAPER_LIQ_MIN_PROB ?? 80));
  if (process.env.AUTO_LIQ_ORDER_ENABLED === 'true') thresholds.push(Number(process.env.AUTO_LIQ_ORDER_MIN_PROB ?? 90));
  return thresholds.length ? Math.min(...thresholds) : 80;
}

function getLiqHighProbHandler() {
  const paperEnabled = process.env.PAPER_LIQ_ENABLED !== 'false';
  const realEnabled = process.env.AUTO_LIQ_ORDER_ENABLED === 'true';
  if (!paperEnabled && !realEnabled) return null;

  return async (payload) => {
    if (paperEnabled) {
      await createLiqPaperTrade(payload).catch((err) => {
        console.error(`[PaperLiq] ❌ ${payload.symbol}:`, err.message);
      });
    }

    const autoMarketOnConfirmation = process.env.AUTO_LIQ_AUTO_MARKET_ON_CONFIRMATION === 'true';
    const realMinProb = Number(process.env.AUTO_LIQ_ORDER_MIN_PROB ?? 90);
    if (autoMarketOnConfirmation && realEnabled && payload.sweepProb >= realMinProb) {
      await handleLiqAutoOrder(payload);
    }
  };
}

const pumpAutoOrderFired = new Map(); // symbol → timestamp

async function handlePumpAutoOrder(signal, openOrders = null) {
  if (!runtimeSettings.pumpAutoOrderEnabled) return;
  if (isVnBlockHour()) { console.log(`[PumpAuto] ⏰ Block 17-19h VN — ${signal.symbol}`); return; }
  const { symbol, action, score, marketOk, entry, sl, factors } = signal;
  if (score < 80) return;
  if (marketOk === false) return;
  if (factors?.emaRibbon === 0) return; // EMA ribbon không bullish → không đặt lệnh
  // Chase guard — bỏ qua nếu giá đã chạy > 30% vào TP range
  const chasePct = factors?.chasePct ?? 0;
  if (chasePct > 0.30) {
    console.log(`[PumpAuto] ⏭ ${symbol} chase=${(chasePct * 100).toFixed(0)}% > 30% — skip`);
    return;
  }
  // Adjusted score guard (score đã trừ chase penalty từ detector)
  if (score < 70) {
    console.log(`[PumpAuto] ⏭ ${symbol} adj.score=${score} < 70 — skip`);
    return;
  }
  if (!entry || !sl) return;

  // ── Danger zone — block TẤT CẢ auto order khi RSI cực đoan ──────────────────
  // RSI 1h < 20 hoặc RSI 4h < 25: oversold cực đoan → bounce bất ngờ, short nguy hiểm
  // RSI 1h > 80 hoặc RSI 4h > 75: overbought cực đoan → dump bất ngờ, long nguy hiểm
  {
    const health = btcHealthCache.data;
    const r1h = health?.rsi1h;
    const r4h = health?.rsi4h;
    const isDangerLow  = (r1h != null && r1h < 25) || (r4h != null && r4h < 32); // oversold — short đáy nguy hiểm
    const isDangerHigh = (r1h != null && r1h > 80) || (r4h != null && r4h > 72); // overbought — long đỉnh nguy hiểm
    if (isDangerLow || isDangerHigh) {
      const zone = isDangerLow ? `oversold cực đoan` : `overbought cực đoan`;
      console.log(`[PumpAuto] 🚫 ${symbol} block ALL — danger zone: ${zone} (RSI1h=${r1h} RSI4h=${r4h})`);
      const webhookUrl = process.env.LIQ_SCAN_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        const dirEmoji = action === 'LONG' ? '🟢 LONG' : '🔴 SHORT';
        const msg = `🚫 **Pump Auto BLOCKED** | **${symbol}** ${dirEmoji}\n` +
          `Score: **${score}** | Entry: \`${entry}\`\n` +
          `BTC Danger Zone: **${zone}**\n` +
          `RSI 1h: **${r1h ?? '–'}** · RSI 4h: **${r4h ?? '–'}** · ${isDangerLow ? 'Bounce risk cao' : 'Dump risk cao'}`;
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: msg }),
        }).catch(() => {});
      }
      return;
    }
  }

  // Block khi BTC health = bearish hoặc caution (chỉ block LONG — SHORT vẫn cho qua)
  if (action === 'LONG' || action == null) {
    const health = btcHealthCache.data;
    if (health?.bias === 'bearish' || health?.bias === 'caution') {
      console.log(`[PumpAuto] ⛔ ${symbol} block — BTC bias=${health.bias} (RSI1h=${health.rsi1h} RSI4h=${health.rsi4h} EMA1h=${health.emaTrend1h})`);
      const webhookUrl = process.env.LIQ_SCAN_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        const reasons = [
          health.fundingRate > 0.05 ? `Funding **${health.fundingRate}%** (cao)` : null,
          health.bearishDiv ? `RSI Div ⚠` : null,
          health.longPct > 62 ? `L/S **${health.longPct}%** long` : null,
          health.rsi4h > 70 ? `RSI 4h **${health.rsi4h}** (overbought)` : null,
          health.rsi4h != null && health.rsi4h < 35 ? `RSI 4h **${health.rsi4h}** (dump)` : null,
          health.rsi1h != null && health.rsi1h < 40 ? `RSI 1h **${health.rsi1h}** (bearish)` : null,
          health.emaTrend1h === 'below' ? `Price dưới EMA20 1h` : null,
          health.obvTrend === 'falling' ? `OBV 4h ↓` : null,
        ].filter(Boolean);
        const biasEmoji = health.bias === 'bearish' ? '⛔' : '⚡';
        const msg = `${biasEmoji} **Pump Auto BLOCKED** | **${symbol}** 🟢 LONG\n` +
          `Score: **${score}** | Entry: \`${entry}\`\n` +
          `BTC Health: **${health.bias}** (${health.bearPoints}/8)\n` +
          `Lý do: ${reasons.join(' · ') || 'tổng hợp nhiều yếu tố'}`;
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: msg }),
        }).catch(() => {});
      }
      return;
    }
  }

  // Block SHORT khi BTC đang bullish — đối xứng với block LONG khi bearish
  if (action === 'SHORT') {
    const health = btcHealthCache.data;
    if (health?.bullBias === 'bullish' || health?.bullBias === 'caution') {
      console.log(`[PumpAuto] ⛔ ${symbol} block SHORT — BTC bullBias=${health.bullBias} (RSI1h=${health.rsi1h} EMA1h=${health.emaTrend1h} pct6h=${health.pct6h}%)`);
      const webhookUrl = process.env.LIQ_SCAN_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        const reasons = [
          health.rsi1h != null && health.rsi1h > 60 ? `RSI 1h **${health.rsi1h}** (bullish)` : null,
          health.emaTrend1h === 'above' ? `Price trên EMA20 1h` : null,
          health.pct6h != null && health.pct6h > 1.5 ? `BTC +${health.pct6h}% trong 6h` : null,
          health.obvTrend === 'rising' ? `OBV 4h ↑` : null,
          health.rsi4h != null && health.rsi4h > 55 ? `RSI 4h **${health.rsi4h}** (bullish)` : null,
          health.longPct != null && health.longPct < 42 ? `L/S **${health.longPct}%** long (short squeeze risk)` : null,
        ].filter(Boolean);
        const biasEmoji = health.bullBias === 'bullish' ? '⛔' : '⚡';
        const msg = `${biasEmoji} **Pump Auto BLOCKED** | **${symbol}** 🔴 SHORT\n` +
          `Score: **${score}** | Entry: \`${entry}\`\n` +
          `BTC Bull Trend: **${health.bullBias}** (${health.bullPoints}/6)\n` +
          `Lý do: ${reasons.join(' · ') || 'BTC đang trong uptrend'}`;
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: msg }),
        }).catch(() => {});
      }
      return;
    }
  }

  const last = pumpAutoOrderFired.get(symbol) ?? 0;
  if (Date.now() - last < 2 * 3600 * 1000) {
    console.log(`[PumpAuto] ⏭ ${symbol} skip — 2h dedup`);
    return;
  }

  try {
    const { apiKey, apiSecret } = getApiCredentials(null);
    const margin = Number(process.env.PUMP_AUTO_ORDER_MARGIN ?? 1);
    const leverage = Number(process.env.PUMP_AUTO_ORDER_LEVERAGE ?? 10);
    const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);
    const maxLimitOrders = runtimeSettings.pumpMaxLimitOrders;

    if (!openOrders) openOrders = await client.getOpenOrders({ apiKey, apiSecret });
    const openLimitEntries = openOrders.filter((o) => o.type === 'LIMIT' && !o.reduceOnly);
    if (openLimitEntries.some((o) => o.symbol === symbol)) {
      console.log(`[PumpAuto] ⏭ ${symbol} skip — already has LIMIT order`);
      return;
    }
    if (openLimitEntries.length >= maxLimitOrders) {
      console.log(`[PumpAuto] ⚠ ${symbol} skip — max ${maxLimitOrders} limit orders reached`);
      return;
    }

    // Max positions check: positions đang mở + LIMIT pending không vượt ngưỡng
    const maxPositions = runtimeSettings.pumpMaxPositions;
    if (maxPositions > 0) {
      const positions = await client.getPositions({ apiKey, apiSecret });
      const openCount = positions.filter((p) => Number(p.positionAmt) !== 0).length;
      const pendingCount = openLimitEntries.length;
      if (openCount + pendingCount >= maxPositions) {
        console.log(`[PumpAuto] ⚠ ${symbol} skip — max positions ${maxPositions} reached (open=${openCount} pending=${pendingCount})`);
        return;
      }
    }

    const symbols = await getSymbols();
    const info = symbols.find((s) => s.symbol === symbol);
    const tickSize = Number(info?.filters?.find((f) => f.filterType === 'PRICE_FILTER')?.tickSize ?? 0);
    const stepSize = Number(info?.filters?.find((f) => f.filterType === 'LOT_SIZE')?.stepSize ?? 0);

    await client.setLeverage({ symbol, leverage, apiKey, apiSecret, recvWindow });

    const premiumIndex = await client.getPremiumIndex(symbol);
    const markPrice = Number(premiumIndex.markPrice);
    const minNotionalFilter = Number(info?.filters?.find((f) => f.filterType === 'MIN_NOTIONAL')?.notional ?? 0);
    const notional = Math.max(margin * leverage, minNotionalFilter > 0 ? minNotionalFilter : 0);
    const qtyRaw = notional / entry;
    const qty = stepSize > 0 ? Math.floor(qtyRaw / stepSize) * stepSize : qtyRaw;
    const qtyStr = stepSize > 0 ? qty.toFixed(Math.max(0, -Math.floor(Math.log10(stepSize)))) : qty.toFixed(6);
    const side = action === 'LONG' ? 'BUY' : 'SELL';
    const entryStr = tickSize > 0 ? entry.toFixed(Math.max(0, -Math.floor(Math.log10(tickSize)))) : entry.toFixed(8);

    const order = await client.placeFuturesOrder({
      params: { symbol, side, type: 'LIMIT', price: entryStr, quantity: qtyStr, timeInForce: 'GTC', recvWindow, newClientOrderId: `lp_auto_${Date.now()}`.slice(0, 36) },
      apiKey, apiSecret,
    });

    pumpAutoOrderFired.set(symbol, Date.now());
    invalidateOpenOrdersCache();
    console.log(`[PumpAuto] ✅ ${symbol} ${side} LIMIT @${entryStr} qty=${qtyStr} margin=$${margin} score=${score}`);

    // Đặt SL ngay sau entry order — STOP_MARKET reduceOnly
    const slRoePct = Number(process.env.PUMP_AUTO_ORDER_SL_ROE ?? 30);
    const slPriceRaw = side === 'BUY'
      ? Number(entryStr) * (1 - slRoePct / 100 / leverage)
      : Number(entryStr) * (1 + slRoePct / 100 / leverage);
    let slPlaced = false;
    let slPriceStr = null;
    if (isFinite(slPriceRaw) && slPriceRaw > 0 && info) {
      slPriceStr = tickSize > 0
        ? slPriceRaw.toFixed(Math.max(0, -Math.floor(Math.log10(tickSize))))
        : slPriceRaw.toFixed(8);
      const slParams = {
        symbol,
        side: side === 'BUY' ? 'SELL' : 'BUY',
        type: 'STOP_MARKET',
        stopPrice: slPriceStr,
        quantity: qtyStr,
        workingType: 'MARK_PRICE',
        reduceOnly: 'true',
        recvWindow,
        newClientOrderId: `lp_psl_${order.orderId}`.slice(0, 36),
      };
      try {
        await client.placeFuturesOrder({ params: slParams, apiKey, apiSecret })
          .catch((e) => {
            if (e.message?.includes('not supported') || e.message?.includes('Algo Order')) {
              const algoParams = { ...slParams, algoType: 'CONDITIONAL', triggerPrice: slPriceStr };
              delete algoParams.stopPrice;
              return client.placeAlgoOrder({ params: algoParams, apiKey, apiSecret });
            }
            throw e;
          });
        slPlaced = true;
        console.log(`[PumpAuto] 🛡 ${symbol} SL @${slPriceStr} (${slRoePct}% ROE)`);
      } catch (e) {
        console.warn(`[PumpAuto] ⚠ SL failed ${symbol}:`, e.message);
      }
    }

    // Lưu tp từ signal để pollPumpOrders đặt TP_MARKET khi order filled
    const tpFromSignal = signal.tp ?? null;
    addPumpPendingOrder({ orderId: order.orderId, symbol, side, entry: Number(entryStr), qty: Number(qtyStr), margin, score, type: signal.type ?? null, slPlaced, slPrice: slPriceStr ? Number(slPriceStr) : null, tp: tpFromSignal, placedAt: Date.now() }).catch(() => {});

    const webhookUrl = process.env.LIQ_SCAN_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      const slStatus = slPlaced ? `🛡 SL: \`${slPriceStr}\` (−${slRoePct}% ROE)` : `⚠ **SL không đặt được**`;
      const entryQuality = chasePct > 0.45 || score < 55
        ? '🚫 Đã trễ — chờ pullback'
        : chasePct > 0.30 || score < 70
          ? '⚠ Cân nhắc — chase cao'
          : '✅ Có thể vào';
      const chaseStr = chasePct > 0.01 ? ` · Chase ${(chasePct * 100).toFixed(0)}%TP` : '';
      const tpStr = tpFromSignal ? ` · TP: \`${tpFromSignal}\`` : '';
      const msg = `🎯 **Pump Auto LIMIT** | **${symbol}** ${action === 'LONG' ? '🟢 LONG' : '🔴 SHORT'}\n` +
        `Score: **${score}** | ${entryQuality}${chaseStr}\n` +
        `Entry: \`${entryStr}\`${tpStr} | ${slStatus}\n` +
        `Margin: $${margin} × ${leverage}x | RSI: ${factors?.rsi14val ?? '-'} | Vol: ${factors?.volRatio ?? '-'}×\n` +
        `Type: ${signal.type ?? '-'} | OrderId: ${order.orderId}`;
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: msg }),
      }).catch(() => {});
    }
  } catch (err) {
    console.error(`[PumpAuto] ❌ ${symbol} error:`, err.message);
  }
}

async function handleLiqAutoOrder({ symbol, markPrice, direction, sweepTargetPrice, sweepProb, confirmation = null }) {
  // Dedup theo symbol (không theo price) — tránh đặt nhiều lệnh khi price thay đổi nhẹ giữa các scan
  const last = liqAutoOrderFired.get(symbol) ?? 0;
  if (Date.now() - last < 2 * 3600 * 1000) {
    console.log(`[AutoLiq] ⏭ ${symbol} skip — 2h dedup (đã đặt lệnh trong 2h qua)`);
    return;
  }

  try {
    const { apiKey, apiSecret } = getApiCredentials(null);
    const requireConfirmation = process.env.AUTO_LIQ_REQUIRE_REVERSAL_CONFIRMATION !== 'false';
    const allowProbe = process.env.AUTO_LIQ_PROBE_BEFORE_CONFIRMATION !== 'false';
    const isConfirmed = confirmation?.confirmed === true;
    if (requireConfirmation && !isConfirmed && !allowProbe) {
      console.log(`[AutoLiq] ⏳ ${symbol} skip — ${confirmation?.reason ?? 'waiting for reversal confirmation'}`);
      return;
    }

    const baseMargin = Number(process.env.AUTO_LIQ_ORDER_MARGIN ?? 5);
    const probeMargin = Number(process.env.AUTO_LIQ_PROBE_MARGIN ?? 1);
    const isProbe = requireConfirmation && !isConfirmed;
    const margin = isProbe ? probeMargin : baseMargin;
    const leverage = Number(process.env.AUTO_LIQ_ORDER_LEVERAGE ?? 10);
    const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);
    const maxLimitOrders = Number(process.env.AUTO_LIQ_MAX_LIMIT_ORDERS ?? 30);

    // Count existing open LIMIT entry orders (non-reduceOnly) and check per-symbol dedup
    const openOrders = await client.getOpenOrders({ apiKey, apiSecret });
    const openLimitEntries = openOrders.filter((o) => o.type === 'LIMIT' && !o.reduceOnly);
    const symbolAlreadyHasLimit = openLimitEntries.some((o) => o.symbol === symbol);
    if (symbolAlreadyHasLimit) {
      console.log(`[AutoLiq] ⏭ ${symbol} skip — đã có lệnh LIMIT đang chờ cho symbol này`);
      return;
    }
    const openLimitCount = openLimitEntries.length;
    if (openLimitCount >= maxLimitOrders) {
      console.log(`[AutoLiq] ⏭ ${symbol} skip — đã có ${openLimitCount} lệnh LIMIT chờ (max ${maxLimitOrders})`);
      const liqWh = process.env.LIQ_SCAN_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
      if (liqWh) {
        fetch(liqWh, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: `⚠️ **[AutoLiq]** Bỏ qua **${symbol}** — đã có **${openLimitCount}** lệnh LIMIT đang chờ (max ${maxLimitOrders}). Huỷ bớt lệnh cũ để tiếp tục đặt.` }),
        }).catch(() => {});
      }
      return;
    }

    const [symbols] = await Promise.all([getSymbols()]);
    const symbolInfo = symbols.find((s) => s.symbol === symbol);
    if (!symbolInfo) { console.warn(`[AutoLiq] ${symbol} not in symbols`); return; }

    const confirmedOrderType = String(process.env.AUTO_LIQ_CONFIRMED_ORDER_TYPE ?? 'MARKET').toUpperCase();
    const useMarket = isConfirmed && confirmedOrderType === 'MARKET';
    const price = useMarket
      ? priceFromTick(symbolInfo, markPrice || sweepTargetPrice)
      : priceFromTick(symbolInfo, sweepTargetPrice);
    const notional = margin * leverage;
    const rawQty = notional / price;
    const lotSize = symbolInfo.filters?.find((f) => f.filterType === 'LOT_SIZE');
    const stepSize = Number(lotSize?.stepSize ?? 10 ** -Number(symbolInfo.quantityPrecision ?? 3));
    const steppedQty = Math.floor(rawQty / stepSize) * stepSize;
    const quantity = steppedQty.toFixed(decimalsFromStep(stepSize)).replace(/\.?0+$/, '');

    if (Number(quantity) <= 0) { console.warn(`[AutoLiq] ${symbol} qty=0, skip`); return; }

    await client.setLeverage({ symbol, leverage, apiKey, apiSecret }).catch(() => {});

    const isHedge = await getHedgeMode(null);
    const positionSide = isHedge ? (direction === 'short' ? 'SHORT' : 'LONG') : undefined;

    const side = direction === 'short' ? 'SELL' : 'BUY';
    const entryParams = {
      symbol,
      side,
      type: useMarket ? 'MARKET' : 'LIMIT',
      quantity,
      recvWindow,
      newClientOrderId: `${isProbe ? 'liq_probe' : useMarket ? 'liq_mkt' : 'liq_conf'}_${Date.now()}`.slice(0, 36),
    };
    if (!useMarket) {
      entryParams.price = String(price);
      entryParams.timeInForce = 'GTC';
    }
    if (isHedge) { entryParams.positionSide = positionSide; } else { entryParams.reduceOnly = 'false'; }
    await client.placeFuturesOrder({ params: entryParams, apiKey, apiSecret });

    // TP động theo sweepProb: 90%→30% ROE, 99%→50% ROE
    const tpRoePct = 30 + ((sweepProb - 90) / 9) * 20;
    const tpRoe = tpRoePct / 100;
    const rawTpPrice = direction === 'short'
      ? price * (1 - tpRoe / leverage)
      : price * (1 + tpRoe / leverage);
    const tpPrice = priceFromTick(symbolInfo, rawTpPrice);

    // Lưu pending TP — sẽ đặt sau khi position monitor xác nhận position đã mở
    // (không đặt ngay vì entry là LIMIT chưa fill, one-way mode reject reduceOnly trước khi có position)
    pendingLiqTp.set(symbol, { tpPrice, tpRoePct, direction, isHedge, positionSide, leverage, at: Date.now() });

    liqAutoOrderFired.set(symbol, Date.now());
    console.log(`[AutoLiq] ✅ ${isProbe ? '[PROBE]' : '[CONFIRMED]'} ${symbol} ${direction.toUpperCase()} ${entryParams.type}${useMarket ? '' : ` @${price}`} — pending TP @${tpPrice} (${tpRoePct.toFixed(1)}% ROE) margin=${margin} qty=${quantity} sweepProb=${sweepProb}%${confirmation?.reason ? ` reason=${confirmation.reason}` : ''}`);
  } catch (err) {
    console.error(`[AutoLiq] ❌ ${symbol}:`, err.message);
  }
}

const placingLiqTp = new Set();
async function placePendingLiqTp(symbol, pos) {
  const pending = pendingLiqTp.get(symbol);
  if (!pending) return;
  if (placingLiqTp.has(symbol)) return;
  // Bỏ qua nếu pending đã quá 2h (entry chưa fill sau 2h, bỏ)
  if (Date.now() - pending.at > 2 * 3600 * 1000) { pendingLiqTp.delete(symbol); return; }

  placingLiqTp.add(symbol);
  try {
    const { apiKey, apiSecret } = getApiCredentials(null);
    const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);

    // Kiểm tra đã có TP chưa (tránh đặt trùng)
    const algoResult = await client.getOpenAlgoOrders({ apiKey, apiSecret });
    const allAlgo = Array.isArray(algoResult?.orders) ? algoResult.orders : Array.isArray(algoResult) ? algoResult : [];
    const hasTp = allAlgo.some((o) => o.symbol === symbol &&
      String(o.type ?? '').toUpperCase() === 'TAKE_PROFIT_MARKET');
    if (hasTp) { pendingLiqTp.delete(symbol); return; }

    const symbolList = await getSymbols();
    const symbolInfo = symbolList.find((s) => s.symbol === symbol);
    if (!symbolInfo) return;

    const tpSide = pending.direction === 'short' ? 'BUY' : 'SELL';
    const positionSide = pos?.positionSide ?? pending.positionSide ?? 'BOTH';
    const isHedge = positionSide !== 'BOTH';
    const tpParams = {
      algoType: 'CONDITIONAL',
      symbol,
      side: tpSide,
      type: 'TAKE_PROFIT_MARKET',
      triggerPrice: String(pending.tpPrice),
      workingType: 'MARK_PRICE',
      closePosition: 'true',
      priceProtect: 'true',
      clientAlgoId: `liqtp_${symbol}_${Date.now()}`.slice(0, 36),
      recvWindow,
    };
    if (isHedge) tpParams.positionSide = positionSide;

    await client.placeAlgoOrder({ params: tpParams, apiKey, apiSecret });
    pendingLiqTp.delete(symbol);
    console.log(`[AutoLiq] ✅ TP placed ${symbol} @${pending.tpPrice} (${pending.tpRoePct.toFixed(1)}% ROE)`);
  } catch (e) {
    console.warn(`[AutoLiq] TP place failed ${symbol}: ${e.message}`);
  } finally {
    placingLiqTp.delete(symbol);
  }
}

// ── L/S Ratio Reversal Scanner ──────────────────────────────────────────────

const lsRatioCache = {
  '5m':  { data: [], updatedAt: 0, scanning: false },
  '15m': { data: [], updatedAt: 0, scanning: false },
};

function detectLsReversal(data) {
  const values = data.map((d) => Number(d.longAccount));
  const n = values.length;
  if (n < 6) return null;

  // Exclude current bar when finding window extreme
  const prev = values.slice(0, -1);
  const windowMax = Math.max(...prev);
  const windowMin = Math.min(...prev);
  const windowRange = windowMax - windowMin;
  if (windowRange < 0.004) return null; // filter flat coins (<0.4pp variation)

  const current = values[n - 1];

  // Use last occurrence so we pick the most recent peak/bottom
  const maxIdx = prev.lastIndexOf(windowMax);
  const minIdx = prev.lastIndexOf(windowMin);
  const barsFromPeak   = (n - 2) - maxIdx;
  const barsFromBottom = (n - 2) - minIdx;

  // Peak reversal → SHORT signal
  if (barsFromPeak >= 2 && barsFromPeak <= 8) {
    const drop = windowMax - current;
    if (drop / windowRange >= 0.35 && drop >= 0.002) {
      const after = values.slice(maxIdx + 1);
      if (after[after.length - 1] < after[0]) { // net decline since peak
        return {
          direction: 'short',
          extreme: +(windowMax * 100).toFixed(1),
          current: +(current * 100).toFixed(1),
          barsAgo: barsFromPeak,
          strength: +(drop * 100).toFixed(2),
          range: +(windowRange * 100).toFixed(2),
          extremeTs: data[maxIdx].timestamp,
        };
      }
    }
  }

  // Bottom reversal → LONG signal
  if (barsFromBottom >= 2 && barsFromBottom <= 8) {
    const rise = current - windowMin;
    if (rise / windowRange >= 0.35 && rise >= 0.002) {
      const after = values.slice(minIdx + 1);
      if (after[after.length - 1] > after[0]) { // net rise since bottom
        return {
          direction: 'long',
          extreme: +(windowMin * 100).toFixed(1),
          current: +(current * 100).toFixed(1),
          barsAgo: barsFromBottom,
          strength: +(rise * 100).toFixed(2),
          range: +(windowRange * 100).toFixed(2),
          extremeTs: data[minIdx].timestamp,
        };
      }
    }
  }

  return null;
}

async function runLsRatioScan(period = '15m') {
  const cache = lsRatioCache[period];
  if (!cache || cache.scanning) return;
  cache.scanning = true;
  console.log(`[LSRatio] Starting scan period=${period}…`);
  try {
    const snapshot = await getMarketSnapshot();
    const coins = snapshot
      .filter((r) => r.quoteVolume >= 5_000_000)
      .sort((a, b) => b.quoteVolume - a.quoteVolume)
      .slice(0, 150);

    const results = [];
    for (const coin of coins) {
      try {
        const data = await client.getTopLongShortPositionRatio(coin.symbol, period, 20);
        if (!data || data.length < 4) continue;
        const signal = detectLsReversal(data);
        if (signal) results.push({ symbol: coin.symbol, volume: coin.quoteVolume, markPrice: coin.markPrice, ...signal });
      } catch { /* skip unsupported symbols */ }
      await new Promise((r) => setTimeout(r, 80));
    }

    results.sort((a, b) => b.strength - a.strength);
    cache.data = results;
    cache.updatedAt = Date.now();
    console.log(`[LSRatio] Scan done period=${period} — ${results.length} signals`);
  } finally {
    cache.scanning = false;
  }
}

// ── End L/S Ratio Scanner ────────────────────────────────────────────────────

const negativeSince = new Map(); // symbol → timestamp when position first went negative

const tpMovedToEntry = new Map(); // symbol → entryPrice when TP was moved to entry

async function handleTpEntryGuard(symbol, pos, markPrice, roe) {
  return handleNegativeTimeoutTp(symbol, pos);
}

function startNegTpScanner() {
  const intervalMs = Number(process.env.NEG_TP_SCAN_INTERVAL_MS ?? 30000);
  const negTpRoe = Number(process.env.NEG_TP_ROE ?? -30);
  const tpGuardRoe = Number(process.env.TP_ENTRY_GUARD_ROE ?? -50);
  const timeoutMs = Number(process.env.NEG_TP_TIMEOUT_MS ?? 4 * 3600 * 1000);
  console.log(`[NegTp] Scanner started. ROE threshold=${negTpRoe}% timeout=${timeoutMs / 3_600_000}h interval=${intervalMs / 1000}s`);

  const run = async () => {
    let apiKey, apiSecret;
    try { ({ apiKey, apiSecret } = getApiCredentials(null)); } catch { return; }
    try {
      const positions = await client.getPositions({ apiKey, apiSecret });
      const active = positions.filter((p) => Number(p.positionAmt) !== 0);
      const activeSymbols = new Set(active.map((p) => p.symbol));
      for (const sym of negativeSince.keys()) {
        if (!activeSymbols.has(sym)) negativeSince.delete(sym);
      }
      for (const p of active) {
        const symbol = p.symbol;
        const amt = Number(p.positionAmt);
        const entry = Number(p.entryPrice);
        const lev = Number(p.leverage) || 1;
        const upnl = Number(p.unRealizedProfit);
        const isolated = Number(p.isolatedMargin);
        const initial = Number(p.initialMargin);
        const margin = isolated > 0 ? isolated : initial > 0 ? initial : Math.abs(amt) * entry / lev;
        if (margin <= 0) continue;
        const roe = (upnl / margin) * 100;
        const pos = { amt, entry, leverage: lev, positionSide: p.positionSide ?? 'BOTH' };
        if (roe <= negTpRoe || roe <= tpGuardRoe) {
          handleNegativeTimeoutTp(symbol, pos).catch(() => {});
        }
        if (roe < 0) {
          if (!negativeSince.has(symbol)) negativeSince.set(symbol, Date.now());
          const negMs = Date.now() - negativeSince.get(symbol);
          if (negMs >= timeoutMs) handleNegativeTimeoutTp(symbol, pos).catch(() => {});
        } else {
          negativeSince.delete(symbol);
          tpMovedToEntry.delete(symbol);
        }
      }
    } catch (err) {
      console.error('[NegTp] Scanner error:', err.message);
    }
  };

  setInterval(run, intervalMs);
  run();
}

// symbol|entry keys confirmed to have a TP — skip API check until position changes or fill
const tpConfirmedSet = new Set();
function tpConfirmedClear(symbol) {
  for (const k of tpConfirmedSet) { if (k.startsWith(`${symbol}|`)) tpConfirmedSet.delete(k); }
}

function startMissingTpScanner() {
  if (process.env.AUTO_TP_SCAN_ENABLED === 'false') return;
  const intervalMs = Math.max(Number(process.env.AUTO_TP_SCAN_INTERVAL_MS ?? 60_000), 30_000);
  console.log(`[AutoTP] Scanner started. interval=${intervalMs / 1000}s`);
  const run = () => runMissingTpScan().catch((err) => {
    if (err.message?.includes('Missing Binance API') || err.message?.includes('Chưa đăng nhập')) return;
    console.error('[AutoTP] Scan error:', err.message);
  });
  run();
  setInterval(run, intervalMs);
}

function startSlTrailSafetyScanner() {
  if (process.env.SL_TRAIL_SAFETY_SCAN_ENABLED === 'false') return;
  const intervalMs = Math.max(Number(process.env.SL_TRAIL_SAFETY_SCAN_INTERVAL_MS ?? 30_000), 10_000);
  console.log(`[SlTrailScan] Safety scanner started. interval=${intervalMs / 1000}s`);
  const run = () => runSlTrailSafetyScan().catch((err) => {
    if (err.message?.includes('Missing Binance API')) return;
    console.error('[SlTrailScan] Scan error:', err.message);
  });
  run();
  setInterval(run, intervalMs);
}

async function runSlTrailSafetyScan() {
  if (process.env.AUTO_SL_ENABLED === 'false') return;
  const { apiKey, apiSecret } = getApiCredentials(null);
  const positions = await client.getPositions({ apiKey, apiSecret });
  const active = positions.filter((p) => Number(p.positionAmt) !== 0);
  if (!active.length) return;

  for (const p of active) {
    const amt = Number(p.positionAmt);
    const entry = Number(p.entryPrice);
    const mark = Number(p.markPrice);
    const leverage = Number(p.leverage) || 1;
    if (!p.symbol || !amt || !entry) continue;

    const isolatedMargin = Number(p.isolatedMargin);
    const initialMargin = Number(p.initialMargin);
    const margin = isolatedMargin > 0
      ? isolatedMargin
      : initialMargin > 0
        ? initialMargin
        : Math.abs(amt) * entry / leverage;
    if (margin <= 0) continue;

    const upnl = Number(p.unRealizedProfit ?? p.unrealizedProfit ?? 0);
    const roe = upnl
      ? (upnl / margin) * 100
      : mark > 0
        ? ((mark - entry) / entry) * leverage * (amt > 0 ? 1 : -1) * 100
        : 0;

    await handleSlTrailByProfit(p.symbol, {
      amt,
      entry,
      leverage,
      isolatedMargin,
      initialMargin,
      positionSide: p.positionSide ?? 'BOTH',
    }, roe, mark || null);
  }
}

async function runMissingTpScan() {
  const { apiKey, apiSecret } = getApiCredentials(null);
  const positions = await client.getPositions({ apiKey, apiSecret });
  const active = positions.filter((p) => Number(p.positionAmt) !== 0);
  if (!active.length) return;

  const symbols = await getSymbols();
  for (const pos of active) {
    await ensureTakeProfitForPosition(pos, symbols, apiKey, apiSecret);
    await new Promise((r) => setTimeout(r, 80));
  }
}

async function ensureTakeProfitForPosition(pos, symbols, apiKey, apiSecret) {
  const symbol = pos.symbol;
  const amt = Number(pos.positionAmt);
  const entry = Number(pos.entryPrice);
  const leverage = Number(pos.leverage) || 1;
  if (!symbol || !amt || !entry) return;

  // Skip API calls if we already confirmed a TP exists for this symbol+entry combo
  const tpKey = `${symbol}|${entry.toFixed(8)}`;
  if (tpConfirmedSet.has(tpKey)) return;

  const isLong = amt > 0;
  const closeSide = isLong ? 'SELL' : 'BUY';
  const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);

  const [openOrders, algoResult] = await Promise.all([
    client.getOpenOrders({ symbol, apiKey, apiSecret, recvWindow }).catch(() => []),
    client.getOpenAlgoOrders({ symbol, apiKey, apiSecret, recvWindow }).catch(() => ({ orders: [] })),
  ]);

  const algoRows = Array.isArray(algoResult?.orders) ? algoResult.orders : Array.isArray(algoResult) ? algoResult : [];
  const hasAlgoTp = algoRows.some((o) => {
    const t = String(o.orderType ?? o.type ?? '').toUpperCase();
    return o.symbol === symbol && (t === 'TAKE_PROFIT_MARKET' || t === 'TAKE_PROFIT');
  });
  const hasRegularTp = openOrders.some((o) => {
    const t = String(o.origType ?? o.type ?? '').toUpperCase();
    return o.symbol === symbol && o.side === closeSide && (t === 'TAKE_PROFIT_MARKET' || t === 'TAKE_PROFIT');
  });
  if (hasAlgoTp || hasRegularTp) {
    tpConfirmedSet.add(tpKey);
    return;
  }

  const symbolInfo = symbols.find((s) => s.symbol === symbol);
  if (!symbolInfo) return;

  // Ưu tiên TP từ signal pump (manual hoặc auto) nếu có
  const pumpRecord = [...pumpPendingOrders, ...pumpWatchingOrders].find(
    (r) => r.symbol === symbol && r.tp && Math.abs((Number(r.fillPrice ?? r.entry) - entry) / entry) < 0.01,
  );
  let rawTpPrice;
  if (pumpRecord?.tp) {
    rawTpPrice = Number(pumpRecord.tp);
    console.log(`[AutoTP] 📌 ${symbol} dùng signal TP=${rawTpPrice} thay vì ROE cố định`);
  } else {
    const defaultTp = Number(process.env.AUTO_TRADE_TP_ROE ?? 20);
    const tpRoe = (isLong
      ? Number(process.env.AUTO_TRADE_LONG_TP_ROE ?? defaultTp)
      : Number(process.env.AUTO_TRADE_SHORT_TP_ROE ?? defaultTp)) / 100;
    if (!Number.isFinite(tpRoe) || tpRoe <= 0) return;
    rawTpPrice = isLong
      ? entry * (1 + tpRoe / leverage)
      : entry * (1 - tpRoe / leverage);
  }
  if (!isFinite(rawTpPrice) || rawTpPrice <= 0) return;
  const triggerPrice = priceFromTick(symbolInfo, rawTpPrice);
  if (!triggerPrice || triggerPrice === 'NaN' || Number(triggerPrice) <= 0) return;

  const lotSize = symbolInfo.filters?.find((f) => f.filterType === 'LOT_SIZE');
  const stepSize = Number(lotSize?.stepSize ?? 10 ** -Number(symbolInfo.quantityPrecision ?? 3));
  const steppedQty = Math.floor(Math.abs(amt) / stepSize) * stepSize;
  const quantity = steppedQty.toFixed(decimalsFromStep(stepSize)).replace(/\.?0+$/, '');
  if (Number(quantity) <= 0) return;

  const positionSide = pos.positionSide ?? 'BOTH';
  const isHedge = positionSide !== 'BOTH';
  const tpParams = {
    algoType: 'CONDITIONAL',
    symbol,
    side: closeSide,
    type: 'TAKE_PROFIT_MARKET',
    triggerPrice: String(triggerPrice),
    quantity,
    workingType: 'MARK_PRICE',
    recvWindow,
    newClientOrderId: `tp_scan_${Date.now()}`.slice(0, 36),
  };
  if (isHedge) tpParams.positionSide = positionSide;
  else tpParams.reduceOnly = 'true';

  try {
    const result = await client.placeAlgoOrder({ params: tpParams, apiKey, apiSecret });
    tpConfirmedSet.add(tpKey);
    console.log(`[AutoTP] ✅ ${symbol} ${isLong ? 'LONG' : 'SHORT'} entry=${entry} lev=${leverage}x → TP @ ${triggerPrice} qty=${quantity} algoId=${result.algoId}`);
  } catch (err) {
    const isMaxStop = err.message?.toLowerCase().includes('max stop') || err.message?.toLowerCase().includes('too many stop');
    if (!isMaxStop) { console.error(`[AutoTP] ❌ ${symbol}:`, err.message); return; }

    // Xóa hết lệnh stop cũ cho symbol này rồi đặt lại TP + SL
    console.warn(`[AutoTP] ⚠ ${symbol} max stop orders — xóa hết và đặt lại...`);
    await clearSymbolOrders(symbol, apiKey, apiSecret, recvWindow);

    // Retry TP
    try {
      tpParams.newClientOrderId = `tp_retry_${Date.now()}`.slice(0, 36);
      const result = await client.placeAlgoOrder({ params: tpParams, apiKey, apiSecret });
      tpConfirmedSet.add(tpKey);
      console.log(`[AutoTP] ✅ ${symbol} (retry) → TP @ ${triggerPrice} algoId=${result.algoId}`);
    } catch (retryErr) {
      console.error(`[AutoTP] ❌ ${symbol} retry TP:`, retryErr.message);
      return;
    }

    // Đặt lại SL
    const slRoeEnv = isLong ? process.env.AUTO_TRADE_LONG_SL_ROE : process.env.AUTO_TRADE_SHORT_SL_ROE;
    const slRoePct = slRoeEnv ? Math.abs(Number(slRoeEnv)) : Number(process.env.AUTO_SL_ROE ?? 25);
    if (slRoePct > 0) {
      const rawSl = isLong
        ? entry * (1 - slRoePct / 100 / leverage)
        : entry * (1 + slRoePct / 100 / leverage);
      const slPrice = priceFromTick(symbolInfo, rawSl);
      if (slPrice && Number(slPrice) > 0) {
        const slParams = {
          symbol, side: closeSide === 'SELL' ? 'BUY' : 'SELL',
          type: 'STOP_MARKET', stopPrice: String(slPrice), quantity,
          workingType: 'MARK_PRICE', reduceOnly: 'true', recvWindow,
          newClientOrderId: `sl_retry_${Date.now()}`.slice(0, 36),
        };
        if (isHedge) { delete slParams.reduceOnly; slParams.positionSide = positionSide; }
        try {
          await client.placeFuturesOrder({ params: slParams, apiKey, apiSecret })
            .catch((e) => {
              if (e.message?.includes('not supported') || e.message?.includes('Algo Order')) {
                const ap = { ...slParams, algoType: 'CONDITIONAL', triggerPrice: String(slPrice) };
                delete ap.stopPrice;
                return client.placeAlgoOrder({ params: ap, apiKey, apiSecret });
              }
              throw e;
            });
          console.log(`[AutoTP] 🛡 ${symbol} SL @${slPrice} (${slRoePct}% ROE)`);
        } catch (slErr) {
          console.warn(`[AutoTP] ⚠ ${symbol} SL retry failed:`, slErr.message);
        }
      }
    }
  }
}

// Xóa toàn bộ open orders (regular + algo) cho một symbol
async function clearSymbolOrders(symbol, apiKey, apiSecret, recvWindow = 5000) {
  // Chỉ cancel reduce-only orders (SL/TP), không cancel LIMIT entry
  try {
    const openOrders = await client.getOpenOrders({ symbol, apiKey, apiSecret, recvWindow }).catch(() => []);
    const stopTypes = new Set(['STOP_MARKET', 'TAKE_PROFIT_MARKET', 'STOP', 'TAKE_PROFIT']);
    const toCancel = openOrders.filter((o) =>
      o.reduceOnly || stopTypes.has(String(o.origType ?? o.type ?? '').toUpperCase()),
    );
    for (const o of toCancel) {
      await client.cancelOrder({ symbol, orderId: o.orderId, apiKey, apiSecret, recvWindow }).catch(() => {});
      await new Promise((r) => setTimeout(r, 100));
    }
    if (toCancel.length) console.log(`[AutoTP] 🗑 ${symbol} đã hủy ${toCancel.length} reduce-only order(s)`);
  } catch (e) {
    console.warn(`[AutoTP] clearSymbolOrders ${symbol}:`, e.message);
  }
  // Algo orders đều là TP/SL — cancel hết
  try {
    const algoResult = await client.getOpenAlgoOrders({ symbol, apiKey, apiSecret, recvWindow }).catch(() => ({ orders: [] }));
    const algoRows = Array.isArray(algoResult?.orders) ? algoResult.orders : Array.isArray(algoResult) ? algoResult : [];
    for (const o of algoRows) {
      if (!o.algoId) continue;
      await client.cancelAlgoOrder({ algoId: o.algoId, apiKey, apiSecret, recvWindow }).catch(() => {});
      await new Promise((r) => setTimeout(r, 100));
    }
    if (algoRows.length) console.log(`[AutoTP] 🗑 ${symbol} đã hủy ${algoRows.length} algo order(s)`);
  } catch (e) {
    console.warn(`[AutoTP] clearAlgoOrders ${symbol}:`, e.message);
  }
  invalidateOpenOrdersCache();
}

async function handleNegativeTimeoutTp(symbol, pos) {
  const entry = pos.entry;

  // Dedup: already set TP to entry for this position
  const prevEntry = tpMovedToEntry.get(symbol);
  if (prevEntry !== undefined && Math.abs(prevEntry - entry) / entry < 0.005) return;

  // Cooldown: don't spam API if check was recent
  const lastRun = negTpLastRun.get(symbol) ?? 0;
  if (Date.now() - lastRun < NEG_TP_COOLDOWN_MS) return;
  negTpLastRun.set(symbol, Date.now());

  console.log(`[NegTp] ${symbol} checking — entry=${entry} amt=${pos.amt}`);

  try {
    const { apiKey, apiSecret } = getApiCredentials(null);
    const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);

    const [openOrders, algoResult, symbols] = await Promise.all([
      client.getOpenOrders({ symbol, apiKey, apiSecret, recvWindow }),
      client.getOpenAlgoOrders({ symbol, apiKey, apiSecret }).catch(() => ({ orders: [] })),
      getSymbols(),
    ]);

    const symbolInfo = symbols.find((s) => s.symbol === symbol);
    if (!symbolInfo) { console.warn(`[NegTp] ${symbol} not found in symbols`); return; }

    const isLong = pos.amt > 0;
    if (!isFinite(entry) || entry <= 0) { console.warn(`[NegTp] ${symbol} invalid entry ${entry}`); return; }
    const newTpPrice = priceFromTick(symbolInfo, entry);
    if (!newTpPrice || newTpPrice === 'NaN' || Number(newTpPrice) <= 0) { console.warn(`[NegTp] ${symbol} priceFromTick returned invalid: ${newTpPrice}`); return; }

    // Check if a suitable close order already exists at/better than entry
    const allOpen = Array.isArray(openOrders) ? openOrders : [];
    const existingClose = allOpen.find((o) => {
      const t = String(o.type ?? '').toUpperCase();
      const sideOk = isLong ? o.side === 'SELL' : o.side === 'BUY';
      if (!sideOk) return false;
      if (t === 'TAKE_PROFIT_MARKET' || t === 'TAKE_PROFIT') {
        const p = Number(o.stopPrice);
        return isLong ? p >= newTpPrice * 0.995 : p <= newTpPrice * 1.005;
      }
      if (t === 'LIMIT') {
        const p = Number(o.price);
        return isLong ? p >= newTpPrice * 0.995 : p <= newTpPrice * 1.005;
      }
      return false;
    });
    if (existingClose) {
      tpMovedToEntry.set(symbol, entry);
      console.log(`[NegTp] ${symbol} đã có lệnh close ở entry, skip`);
      return;
    }

    // Check algo orders
    const allAlgo = Array.isArray(algoResult?.orders) ? algoResult.orders : Array.isArray(algoResult) ? algoResult : [];
    const existingAlgo = allAlgo.find((o) => {
      if (o.symbol !== symbol) return false;
      const t = String(o.type ?? '').toUpperCase();
      if (t !== 'TAKE_PROFIT_MARKET' && t !== 'TAKE_PROFIT') return false;
      const p = Number(o.triggerPrice);
      return isLong ? p >= newTpPrice * 0.995 : p <= newTpPrice * 1.005;
    });
    if (existingAlgo) {
      tpMovedToEntry.set(symbol, entry);
      return;
    }

    const lotSize = symbolInfo.filters?.find((f) => f.filterType === 'LOT_SIZE');
    const stepSize = Number(lotSize?.stepSize ?? 10 ** -Number(symbolInfo.quantityPrecision ?? 3));
    const steppedQty = Math.floor(Math.abs(pos.amt) / stepSize) * stepSize;
    if (steppedQty <= 0) { console.warn(`[NegTp] ${symbol} qty rounds to 0, skip`); return; }
    const quantity = steppedQty.toFixed(decimalsFromStep(stepSize)).replace(/\.?0+$/, '');

    const positionSide = pos.positionSide ?? 'BOTH';
    const isHedge = positionSide !== 'BOTH';

    // LIMIT order at entry — works on all symbols without algo permission
    const tpParams = {
      symbol,
      side: isLong ? 'SELL' : 'BUY',
      type: 'LIMIT',
      price: String(newTpPrice),
      quantity,
      timeInForce: 'GTC',
      recvWindow,
    };
    if (isHedge) { tpParams.positionSide = positionSide; } else { tpParams.reduceOnly = 'true'; }

    await client.placeFuturesOrder({ params: tpParams, apiKey, apiSecret });
    tpMovedToEntry.set(symbol, entry);

    const negMs = Date.now() - (negativeSince.get(symbol) ?? Date.now());
    const hours = (negMs / 3_600_000).toFixed(1);
    console.log(`[NegTp] ✅ ${symbol} âm ${hours}h → LIMIT close đặt tại entry ${newTpPrice}`);
  } catch (err) {
    console.error(`[NegTp] ❌ ${symbol}:`, err.message);
  }
}

const negTpLastRun = new Map(); // symbol → timestamp of last API call
const NEG_TP_COOLDOWN_MS = 120_000; // 2 min minimum between API calls per symbol

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
    const msg = err.message ?? '';
    // Non-retriable: margin insufficient or notional too small → keep fired so we don't spam
    if (msg.includes('Margin is insufficient') || msg.includes('notional')) {
      console.warn(`[AvgDown] ⚠ ${symbol}: ${msg} — skip retry`);
    } else {
      avgDownFired.delete(symbol); // allow retry on transient failures
      console.error(`[AvgDown] ❌ ${symbol}:`, msg);
    }
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
      : pathname === '/pump'
        ? '/pump.html'
        : pathname === '/cap'
          ? '/cap.html'
        : pathname === '/killshort'
          ? '/killshort.html'
        : pathname === '/orders'
          ? '/orders.html'
          : pathname === '/highvol'
            ? '/highvol.html'
            : pathname === '/lsratio'
              ? '/lsratio.html'
              : pathname === '/paper'
                ? '/paper.html'
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
