#!/usr/bin/env node

import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BinanceClient, BinanceRateLimitError } from './binanceClient.js';
import { BinanceRateGate, binanceRateGate } from './binanceRateGate.js';
import { loadEnv } from './env.js';
import { fetchAnalysis, normalizeSymbol } from './marketAnalysis.js';
import { computeHeatmapData } from './liquidityProxy.js';
import { startDiscordScanner, startLiqImbalanceScanner, startVolumeDumpScanner, getVolDumpFlags, getHighVolData, isDiscordCoolingDown, tryNotifySignal, sendSignalDetected, sendOrderPlaced, sendOrderBlocked, summarizeTopTraderTrend, formatTopTraderTrend } from './discordNotifier.js';
import { KlineCache } from './klineCache.js';
import { runPumpScan } from './pumpDetector.js';
import { runCapScan }  from './capDetector.js';
import { runKillShortScan } from './killShortDetector.js';
import { runDumpIgnitionScan } from './dumpIgnitionDetector.js';
import { runSpikeReversalScan } from './spikeReversalDetector.js';
import { detectPostDumpKillLong, detectPostPumpKillShort, runPostPumpKillShortScan } from './postPumpKillShortDetector.js';
import { runPumpIgnitionScan } from './pumpIgnitionDetector.js';
import { runEmaSqueezeScan } from './emaSqueezeDetector.js';
import { runEma99KillReclaimScan } from './ema99KillReclaimDetector.js';
import { runShakeoutReclaimScan } from './shakeoutReclaimDetector.js';
import { startTrailingStopScanner } from './trailingStop.js';
import { startBtcReversalGuard } from './btcReversalGuard.js';
import { startPositionMonitor } from './positionMonitor.js';
import { sharedMarkTicker } from './sharedMarkTicker.js';
import { createAggTradeTicker } from './aggTradeTicker.js';
import { getEtfProxy } from './etfProxy.js';
import { fetchMarketNews, loadMarketNews, marketNewsConfig, saveMarketNews } from './marketNews.js';
import { coinFlowConfig, fetchCoinFlowBoard, loadCoinFlow, saveCoinFlow } from './coinFlow.js';
import { fetchTokenUnlocksBoard, getUnlockSummaryForSymbol, loadTokenUnlocks, saveTokenUnlocks, tokenUnlocksConfig } from './tokenUnlocks.js';
import WebSocket from 'ws';

loadEnv();

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const publicDir = join(rootDir, 'public');
const client = new BinanceClient({
  baseUrl: process.env.BINANCE_FUTURES_BASE_URL || undefined,
  timeoutMs: 20_000,
});
// Rate gate + client riêng cho /api/analyze — không tranh queue với background scans
const analyzeRateGate = new BinanceRateGate({ limitPerMin: 600, concurrency: 4 });
const analyzeClient = new BinanceClient({
  baseUrl: process.env.BINANCE_FUTURES_BASE_URL || undefined,
  timeoutMs: 20_000,
  rateGate: analyzeRateGate,
});
const klineCache = new KlineCache({ client, maxKlines: 500 });
const pumpScanCache = { data: null, expiresAt: 0 };
const capScanCache       = { data: null, expiresAt: 0 };
const killShortScanCache    = { data: null, expiresAt: 0 };
const dumpIgnitionScanCache = { data: null, expiresAt: 0 };
const spikeReversalScanCache  = { data: null, expiresAt: 0 };
const postPumpKillShortScanCache = { data: null, expiresAt: 0 };
const pumpIgnitionScanCache   = { data: null, expiresAt: 0 };
const emaSqueezesScanCache    = { data: null, expiresAt: 0 };
const ema99KillReclaimScanCache = { data: null, expiresAt: 0 };
const shakeoutReclaimScanCache = { data: null, expiresAt: 0 };
const liquidScanCache = { data: null, expiresAt: 0, key: '' };
const analyzeCache = new Map(); // key: `${symbol}|${interval}|${rangePct}|${binSizePct}` → { data, expiresAt }
const ANALYZE_CACHE_TTL_MS = 10_000; // 10s — nến 15m đổi mỗi 15 phút, giá live qua WS

// ── Shared market snapshot cache — tất cả scan dùng chung, tránh spam REST ───
let _snapshotCache = null;
let _snapshotCacheAt = 0;
let _snapshotInflight = null;
const SNAPSHOT_TTL_MS = 60_000; // 60s — giảm getTicker24hr(w=40)+getPremiumIndex(w=10) frequency
const STALE_BOARD_CACHE_MS = Number(process.env.STALE_BOARD_CACHE_MS ?? 15 * 60_000);

function isBinanceRestCongested() {
  return typeof binanceRateGate.isCongested === 'function'
    ? binanceRateGate.isCongested()
    : (binanceRateGate.snapshot?.().queue ?? 0) > 700;
}

let _lastRestCongestionLogAt = 0;
function logRestCongestion(label, reason) {
  const now = Date.now();
  if (now - _lastRestCongestionLogAt < 30_000) return;
  _lastRestCongestionLogAt = now;
  const snap = binanceRateGate.snapshot?.();
  console.warn(`[${label}] Skip ${reason}: Binance REST queue congested (${snap?.queue ?? '?'}).`);
}

function staleScanPayload(cache, reason = 'binance-rest-congested') {
  if (!cache?.data) return null;
  const ageMs = Date.now() - Number(cache.data.scannedAt ?? 0);
  if (!Number.isFinite(ageMs) || ageMs > STALE_BOARD_CACHE_MS) return null;
  return {
    ...cache.data,
    stale: true,
    staleReason: reason,
    gate: binanceRateGate.snapshot?.() ?? null,
  };
}

let _lastRestBlockAlertKey = '';
let _lastRestCongestedAlertAt = 0;

function binanceRestAlertWebhook() {
  return process.env.BINANCE_REST_ALERT_WEBHOOK_URL
    || process.env.DISCORD_WEBHOOK_URL
    || process.env.LIQ_SCAN_WEBHOOK_URL
    || process.env.POST_PUMP_DUMP_RISK_WEBHOOK_URL
    || '';
}

function topQueueText(snap) {
  const rows = Array.isArray(snap?.queueTop) ? snap.queueTop.slice(0, 5) : [];
  if (!rows.length) return '-';
  return rows.map((r) => `${r.key} x${r.count} w${r.weight}`).join('\n');
}

function sendBinanceRestDiscordAlert(kind, snap, extra = {}) {
  const webhookUrl = binanceRestAlertWebhook();
  if (!webhookUrl) return;
  const now = Date.now();
  const blockedUntil = Number(snap?.blockedUntil ?? 0);
  const remainingSec = blockedUntil > now ? Math.ceil((blockedUntil - now) / 1000) : 0;
  const title = kind === 'blocked'
    ? `Binance REST blocked (${snap?.blockReason || 'rate-limit'})`
    : 'Binance REST queue congested';
  const color = kind === 'blocked' ? 0xef4444 : 0xf59e0b;
  const fields = [
    { name: 'Queue', value: String(snap?.queue ?? 0), inline: true },
    { name: 'Active', value: String(snap?.active ?? 0), inline: true },
    { name: 'Tokens', value: String(snap?.tokens ?? '-'), inline: true },
    kind === 'blocked'
      ? { name: 'Resume ETA', value: remainingSec > 0 ? `${remainingSec}s | ${new Date(blockedUntil).toISOString()}` : '-', inline: false }
      : { name: 'High watermark', value: String(snap?.highWatermark ?? '-'), inline: true },
    { name: 'Top queue', value: `\`\`\`\n${topQueueText(snap).slice(0, 950)}\n\`\`\``, inline: false },
  ].filter(Boolean);

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title,
        description: extra.message ?? 'Backend will prefer cache/WS and limit REST until the gate is stable.',
        color,
        fields,
        timestamp: new Date(now).toISOString(),
      }],
    }),
  })
    .then((res) => {
      if (!res.ok) console.warn(`[BinanceGate] Discord alert failed: ${res.status}`);
      else console.warn(`[BinanceGate] Discord alert sent: ${kind}`);
    })
    .catch((err) => console.warn('[BinanceGate] Discord alert failed:', err.message));
}

function startBinanceRestAlertMonitor() {
  const intervalMs = Math.max(Number(process.env.BINANCE_REST_ALERT_INTERVAL_MS ?? 5000), 2000);
  const congestedCooldownMs = Number(process.env.BINANCE_REST_CONGESTED_ALERT_COOLDOWN_MS ?? 15 * 60_000);
  const tick = () => {
    const snap = binanceRateGate.snapshot?.();
    if (!snap) return;
    if (snap.blockedUntil > Date.now()) {
      const key = `${snap.blockedUntil}|${snap.blockReason}`;
      if (key !== _lastRestBlockAlertKey) {
        _lastRestBlockAlertKey = key;
        sendBinanceRestDiscordAlert('blocked', snap);
      }
      return;
    }
    if (_lastRestBlockAlertKey && snap.blockedUntil === 0) _lastRestBlockAlertKey = '';
    if (snap.congested && Date.now() - _lastRestCongestedAlertAt >= congestedCooldownMs) {
      _lastRestCongestedAlertAt = Date.now();
      sendBinanceRestDiscordAlert('congested', snap);
    }
  };
  setInterval(tick, intervalMs).unref?.();
  setTimeout(tick, 3000).unref?.();
}

async function getSharedSnapshot() {
  const now = Date.now();
  if (_snapshotCache && now - _snapshotCacheAt < SNAPSHOT_TTL_MS) return _snapshotCache;
  if (_snapshotCache && isBinanceRestCongested()) {
    console.warn(`[MarketSnapshot] REST congested (queue=${binanceRateGate.snapshot?.().queue ?? '?'}); using stale snapshot.`);
    return _snapshotCache;
  }
  if (_snapshotInflight) return _snapshotInflight; // dedupe concurrent calls
  _snapshotInflight = getMarketSnapshot().then((snap) => {
    _snapshotCache   = snap;
    _snapshotCacheAt = Date.now();
    _snapshotInflight = null;
    return snap;
  }).catch((e) => {
    _snapshotInflight = null;
    if (_snapshotCache) {
      console.warn(`[MarketSnapshot] Refresh failed (${e.message}); using stale snapshot.`);
      return _snapshotCache;
    }
    throw e;
  });
  return _snapshotInflight;
}

// ── SSE helpers ───────────────────────────────────────────────────────────────
const pumpSseClients = new Set();
const capSseClients          = new Set();
const killShortSseClients    = new Set();
const dumpIgnitionSseClients = new Set();
const spikeReversalSseClients  = new Set();
const postPumpKillShortSseClients = new Set();
const pumpIgnitionSseClients   = new Set();
const emaSqueezeSseClients     = new Set();
const ema99KillReclaimSseClients = new Set();
const shakeoutReclaimSseClients = new Set();
const shakeoutPaperSseClients = new Set();
const emaSqueezePaperSseClients = new Set();
const liquidPaperSseClients    = new Set();

function pushSse(clients, data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

let liquidPaperBroadcastTimer = null;
function scheduleLiquidPaperBroadcast(delayMs = 700) {
  if (liquidPaperSseClients.size === 0 || liquidPaperBroadcastTimer) return;
  liquidPaperBroadcastTimer = setTimeout(async () => {
    liquidPaperBroadcastTimer = null;
    if (liquidPaperSseClients.size === 0) return;
    try {
      pushSse(liquidPaperSseClients, await getLiquidPaperTrades());
    } catch (err) {
      pushSse(liquidPaperSseClients, { error: err.message, updatedAt: new Date().toISOString() });
    }
  }, delayMs);
}

let shakeoutPaperBroadcastTimer = null;
function scheduleShakeoutPaperBroadcast(delayMs = 700) {
  if (shakeoutPaperSseClients.size === 0 || shakeoutPaperBroadcastTimer) return;
  shakeoutPaperBroadcastTimer = setTimeout(async () => {
    shakeoutPaperBroadcastTimer = null;
    if (shakeoutPaperSseClients.size === 0) return;
    try {
      pushSse(shakeoutPaperSseClients, await getShakeoutPaperTrades());
    } catch (err) {
      pushSse(shakeoutPaperSseClients, { error: err.message, updatedAt: new Date().toISOString() });
    }
  }, delayMs);
}

let emaSqueezePaperBroadcastTimer = null;
let emaSqueezePaperBroadcastRunning = false;
function scheduleEmaSqueezePaperBroadcast(delayMs = 700) {
  if (emaSqueezePaperSseClients.size === 0 || emaSqueezePaperBroadcastTimer || emaSqueezePaperBroadcastRunning) return;
  emaSqueezePaperBroadcastTimer = setTimeout(async () => {
    emaSqueezePaperBroadcastTimer = null;
    if (emaSqueezePaperSseClients.size === 0 || emaSqueezePaperBroadcastRunning) return;
    emaSqueezePaperBroadcastRunning = true;
    try {
      const data = await getPumpPaperTrades();
      pushSse(emaSqueezePaperSseClients, {
        trades: data.trades.filter((t) => String(t.source ?? '').startsWith('emasq-')),
        summary: data.summary,
        updatedAt: Date.now(),
      });
    } catch (err) {
      pushSse(emaSqueezePaperSseClients, { error: err.message, updatedAt: Date.now() });
    } finally {
      emaSqueezePaperBroadcastRunning = false;
    }
  }, delayMs);
}

// ── Debounced scans triggered by 15m candle close ────────────────────────────
let _pumpScanDebounce = null;
async function schedulePumpScan() {
  clearTimeout(_pumpScanDebounce);
  _pumpScanDebounce = setTimeout(async () => {
    if (!strategyScansReady('PumpScan')) return;
    if (isBinanceRestCongested()) {
      const stale = staleScanPayload(pumpScanCache);
      if (stale) pushSse(pumpSseClients, stale);
      binanceRateGate.pruneLowPriorityQueue?.();
      logRestCongestion('PumpScan', 'scan');
      return;
    }
    try {
      const snapshot    = await getSharedSnapshot();
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

      // Edge paper auto-fire: chỉ những pump signal có action SHORT (xuất hiện trên edge-short board)
      for (const sig of signals) {
        const action = String(sig.action ?? '').toUpperCase();
        if (action !== 'SHORT' && action !== 'SELL') continue;  // chỉ short signal trên edge
        const quality = evaluateShortEdgeAutoQuality(sig, 'pump-short', btcHealthCache.data ?? {});
        if (!quality.ok) {
          console.log(`[EdgePaper] ⏭ ${sig.symbol} skip pump-short auto — ${quality.reason}`);
          continue;
        }
        const key = `pump|${sig.symbol}|${sig.type}`;
        const last = edgePaperAutoFired.get(key) ?? 0;
        if (Date.now() - last < 4 * 3600 * 1000) continue;
        edgePaperAutoFired.set(key, Date.now());
        createEdgePaperTrade({
          symbol: sig.symbol,
          side: 'SHORT',
          status: 'OPEN',
          marginUsdt: 1,
          leverage: 10,
          entryPrice: sig.entry,
          tp: sig.tp ?? null,
          sl: sig.sl ?? null,
          source: `pump-short-${sig.score}`,
          note: sig.note ?? '',
        }).catch((e) => console.warn(`[EdgePaper] pump-short ${sig.symbol}:`, e.message));
      }
    } catch (e) {
      console.error('[PumpScan] error:', e.message);
    }
  }, 2_000);
}

const capPaperAutoFired  = new Map(); // `${symbol}|${type}` → firedAt timestamp
const pumpPaperAutoFired = new Map(); // `${symbol}|${type}` → firedAt timestamp
// Edge paper auto-fire: key = `${source}|${symbol}|${type}` để phân biệt cross-scanner
const diPaperAutoFired   = new Map(); // `${symbol}|${type}` -> firedAt timestamp
const piPaperAutoFired   = new Map(); // `${symbol}|${type}` -> firedAt timestamp
const edgePaperAutoFired = new Map();

function scoreFromSignal(sig) {
  const direct = Number(sig?.score);
  if (Number.isFinite(direct)) return direct;
  const txt = `${sig?.source ?? ''} ${sig?.note ?? ''}`;
  const m = txt.match(/(?:score=|[-])(\d{2,3})(?:\b|\()/i);
  return m ? Number(m[1]) : null;
}

function chasePctFromSignal(sig) {
  const factorChase = Number(sig?.factors?.chasePct);
  if (Number.isFinite(factorChase)) return factorChase;
  const m = String(sig?.note ?? '').match(/chase=([0-9.]+)%TP/i);
  return m ? Number(m[1]) / 100 : 0;
}

function isPumpEarlyDumpSignal(sig) {
  return String(sig?.note ?? '').startsWith('EARLY_DUMP');
}

function isPumpDumpSignal(sig) {
  return String(sig?.note ?? '').startsWith('DUMP');
}

function isCapBcSignal(sig) {
  return String(sig?.note ?? '').startsWith('BC ');
}

function evaluateShortEdgeAutoQuality(sig, sourceKind, health = {}) {
  const score = scoreFromSignal(sig) ?? 0;
  const chasePct = chasePctFromSignal(sig);

  if (health?.bullBias === 'bullish') {
    return { ok: false, reason: `BTC bull trend ${health.bullBias}` };
  }

  if (sourceKind === 'dump-ignition') {
    return { ok: false, reason: 'dump ignition blocked from Edge Short' };
  }

  if (sourceKind === 'pump-short') {
    if (isPumpEarlyDumpSignal(sig)) {
      const minEarlyDumpScore = Number(process.env.EDGE_SHORT_EARLY_DUMP_MIN_SCORE ?? 65);
      if (score < minEarlyDumpScore) return { ok: false, reason: `EARLY_DUMP score ${score} < ${minEarlyDumpScore}` };
      return { ok: true, reason: 'EARLY_DUMP edge kept' };
    }

    const minDumpScore = Number(process.env.EDGE_SHORT_DUMP_MIN_SCORE ?? 80);
    if (!isPumpDumpSignal(sig)) return { ok: false, reason: 'unknown pump short type' };
    if (score < minDumpScore && chasePct < 0.25) {
      return { ok: false, reason: `DUMP score ${score} < ${minDumpScore} and chase ${(chasePct * 100).toFixed(0)}%TP < 25%` };
    }
    return { ok: true, reason: 'DUMP edge passed' };
  }

  if (sourceKind === 'cap') {
    if (isCapBcSignal(sig)) {
      const minCapBcScore = Number(process.env.EDGE_SHORT_CAP_BC_MIN_SCORE ?? 90);
      if (score < minCapBcScore) return { ok: false, reason: `cap BC score ${score} < ${minCapBcScore}` };
      return { ok: true, reason: 'cap BC high-score only' };
    }

    const minCapScore = Number(process.env.EDGE_SHORT_CAP_MIN_SCORE ?? 85);
    if (score < minCapScore) return { ok: false, reason: `cap score ${score} < ${minCapScore}` };
    return { ok: true, reason: 'cap edge passed' };
  }

  const minGenericScore = Number(process.env.EDGE_SHORT_MIN_SCORE ?? 80);
  if (score < minGenericScore) return { ok: false, reason: `score ${score} < ${minGenericScore}` };
  return { ok: true, reason: 'generic edge passed' };
}

let _capScanDebounce = null;
async function scheduleCapScan() {
  clearTimeout(_capScanDebounce);
  _capScanDebounce = setTimeout(async () => {
    if (!strategyScansReady('CapScan')) return;
    try {
      const snapshot    = await getSharedSnapshot();
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

      // Edge paper auto-fire: cap signals cũng xuất hiện trên edge-short board
      for (const sig of signals) {
        const action = String(sig.action ?? 'LONG').toUpperCase();
        if (action !== 'SHORT' && sig.score < 60) continue;
        if (action === 'SHORT') {
          const quality = evaluateShortEdgeAutoQuality(sig, 'cap', btcHealthCache.data ?? {});
          if (!quality.ok) {
            console.log(`[EdgePaper] ⏭ ${sig.symbol} skip cap short auto — ${quality.reason}`);
            continue;
          }
        }
        const key = `cap|${sig.symbol}|${sig.type}`;
        const last = edgePaperAutoFired.get(key) ?? 0;
        if (Date.now() - last < 4 * 3600 * 1000) continue;
        edgePaperAutoFired.set(key, Date.now());
        createEdgePaperTrade({
          symbol: sig.symbol,
          side: action,
          status: 'OPEN',
          marginUsdt: 1,
          leverage: 10,
          entryPrice: sig.entry,
          tp: sig.tp ?? null,
          sl: sig.sl ?? null,
          source: `cap-${sig.score}`,
          note: sig.note ?? '',
        }).catch((e) => console.warn(`[EdgePaper] cap ${sig.symbol}:`, e.message));
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
    if (!strategyScansReady('KillShortScan')) return;
    try {
      const snapshot    = await getSharedSnapshot();
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
      if (signals.length > 0)
        console.log(`[KillShortScan] ${signals.length} signal(s): ${signals.map(s => `${s.symbol}(${s.type} ${s.score})`).join(', ')}`);

      // Edge paper auto-fire: killshort signals chỉ xuất hiện trên edge-short
      for (const sig of signals) {
        if (sig.score < 60) continue;
        const key = `killshort|${sig.symbol}|${sig.type}`;
        const last = edgePaperAutoFired.get(key) ?? 0;
        if (Date.now() - last < 4 * 3600 * 1000) continue;
        edgePaperAutoFired.set(key, Date.now());
        createEdgePaperTrade({
          symbol: sig.symbol,
          side: String(sig.action ?? 'LONG').toUpperCase(),
          status: 'OPEN',
          marginUsdt: 1,
          leverage: 10,
          entryPrice: sig.entry,
          tp: sig.tp ?? null,
          sl: sig.sl ?? null,
          source: `killshort-${sig.score}`,
          note: sig.note ?? '',
        }).catch((e) => console.warn(`[EdgePaper] killshort ${sig.symbol}:`, e.message));
      }
    } catch (e) {
      console.error('[KillShortScan] error:', e.message);
    }
  }, 2_000);
}

let _dumpIgnitionScanDebounce = null;

function parseIgnitionNote(note) {
  const kv = {};
  for (const part of String(note ?? '').split('|')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    kv[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return kv;
}

function numberFromNoteValue(value) {
  if (value == null) return null;
  const m = String(value).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function evaluateDumpIgnitionAutoQuality(sig, health = {}) {
  if (sig.type === 'post_pump_dump_risk') return { ok: false, reason: 'post-pump risk is watch-only' };
  if (sig.type === 'post_dump_bounce_risk') return { ok: false, reason: 'post-dump bounce is handled by real-order module' };
  const minScore = Number(process.env.DUMP_IGNITION_AUTO_MIN_SCORE ?? 90);
  if (sig.score < minScore) return { ok: false, reason: `score ${sig.score} < ${minScore}` };

  if (health?.bullBias === 'bullish') {
    return { ok: false, reason: `BTC bull trend ${health.bullBias}` };
  }
  if (health?.bias !== 'bearish') {
    return { ok: false, reason: `BTC bias ${health?.bias ?? 'unknown'} is not bearish` };
  }

  const noteKV = parseIgnitionNote(sig.note);
  const isEarly = sig.type === 'dump_ignition_early';
  const liveEMA = noteKV.liveEMA;
  const bias = noteKV.bias;
  const volX = numberFromNoteValue(noteKV.volX);
  const ema50Slope = numberFromNoteValue(noteKV.ema50Slope);

  if (isEarly) {
    if (liveEMA !== 'Y') return { ok: false, reason: 'EARLY liveEMA=N' };
    if (bias !== 'full') return { ok: false, reason: `EARLY bias=${bias || 'unknown'}` };
  } else if (ema50Slope != null && ema50Slope > -0.05) {
    return { ok: false, reason: `ema50Slope ${ema50Slope.toFixed(3)}%/bar not bearish enough` };
  }

  if (volX != null && volX >= 1.5 && volX < 10) {
    return { ok: false, reason: `volX ${volX.toFixed(2)} in weak 1.5-10x zone` };
  }

  return { ok: true, reason: 'quality gate passed' };
}

function applyPostPumpDumpRiskTslExcludes(signals) {
  for (const sig of signals ?? []) {
    if (sig?.type !== 'post_pump_dump_risk' || !sig.symbol) continue;
    const symbol = String(sig.symbol).toUpperCase();
    if (tslExcludedSymbols.has(symbol)) continue;
    tslExcludedSymbols.add(symbol);
    console.log(`[TSL-Exclude] ⛔ ${symbol} excluded by Post-pump Dump Risk signal`);
  }
}

function applyPostDumpBounceRiskTslExcludes(signals) {
  for (const sig of signals ?? []) {
    if (sig?.type !== 'post_dump_bounce_risk' || !sig.symbol) continue;
    const symbol = String(sig.symbol).toUpperCase();
    if (tslExcludedSymbols.has(symbol)) continue;
    tslExcludedSymbols.add(symbol);
    console.log(`[TSL-Exclude] ⛔ ${symbol} excluded by Post-dump Bounce Risk signal`);
  }
}

function calcAutoLeverage(entry, sl, defaultLev = 10) {
  const e = Number(entry);
  const s = Number(sl);
  if (!e || !s || !Number.isFinite(e) || !Number.isFinite(s)) return defaultLev;
  const slDistPct = Math.abs(e - s) / e;
  return slDistPct * 10 * 100 > 20 ? 5 : 10;
}

async function handlePostPumpDumpRiskRealOrder(sig) {
  if (sig?.type !== 'post_pump_dump_risk') return;
  if (process.env.POST_PUMP_DUMP_RISK_AUTO_ORDER_ENABLED !== 'true') return;
  if (sig.action !== 'SHORT') return;

  applyPostPumpDumpRiskTslExcludes([sig]);

  const minScore = Number(process.env.POST_PUMP_DUMP_RISK_AUTO_MIN_SCORE ?? 62);
  if (sig.score < minScore) return;
  if (!sig.entry || !sig.sl) return;

  const cooldownMs = Number(process.env.POST_PUMP_DUMP_RISK_AUTO_COOLDOWN_MS ?? 4 * 3600 * 1000);
  const dedupKey = `${sig.symbol}|${sig.type}`;
  const last = postPumpDumpRiskOrderFired.get(dedupKey) ?? 0;
  if (Date.now() - last < cooldownMs) {
    console.log(`[PostPumpDumpRiskOrder] skip ${sig.symbol} - cooldown`);
    return;
  }

  if (!runtimeSettings.orderEnabled || runtimeSettings.dryRun) {
    console.log(`[PostPumpDumpRiskOrder] skip ${sig.symbol} - real Binance order disabled/dry-run`);
    return;
  }

  let apiKey;
  let apiSecret;
  try {
    ({ apiKey, apiSecret } = getApiCredentials(null));
  } catch (err) {
    apiKey = process.env.BINANCE_API_KEY;
    apiSecret = process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) throw err;
  }

  const [positions, openOrders] = await Promise.all([
    client.getPositions({ apiKey, apiSecret }),
    getCachedOpenOrders(apiKey, apiSecret),
  ]);
  const hasPosition = positions.some((p) => p.symbol === sig.symbol && Math.abs(Number(p.positionAmt ?? 0)) > 0);
  if (hasPosition) {
    console.log(`[PostPumpDumpRiskOrder] skip ${sig.symbol} - already has position`);
    return;
  }
  const hasEntryOrder = openOrders.some((o) => {
    if (o.symbol !== sig.symbol) return false;
    if (String(o.reduceOnly ?? '').toLowerCase() === 'true') return false;
    const type = String(o.type ?? o.origType ?? '').toUpperCase();
    return ['MARKET', 'LIMIT', 'LIMIT_MAKER'].includes(type);
  });
  if (hasEntryOrder) {
    console.log(`[PostPumpDumpRiskOrder] skip ${sig.symbol} - already has entry order`);
    return;
  }

  const marginUsdt = Number(process.env.POST_PUMP_DUMP_RISK_AUTO_MARGIN_USDT ?? 1);
  const defaultLeverage = Number(process.env.POST_PUMP_DUMP_RISK_AUTO_LEVERAGE ?? 10);
  const leverage = calcAutoLeverage(sig.entry, sig.sl, defaultLeverage);
  const notionalUsdt = marginUsdt * leverage;
  const orderType = String(process.env.POST_PUMP_DUMP_RISK_AUTO_ORDER_TYPE ?? 'MARKET').toUpperCase();
  const maxOpenPositions = Number(process.env.POST_PUMP_DUMP_RISK_AUTO_MAX_POSITIONS ?? process.env.AUTO_TRADE_MAX_POSITIONS ?? 0);
  const result = await placeOrder({
    symbol: sig.symbol,
    side: 'SELL',
    orderType,
    notionalUsdt,
    leverage,
    limitPrice: orderType === 'MARKET' ? undefined : sig.entry,
    takeProfitPrice: sig.tp ?? undefined,
    stopLossPrice: sig.sl ?? undefined,
    maxOpenPositions,
    dryRun: false,
  }, null, { apiKey, apiSecret });

  postPumpDumpRiskOrderFired.set(dedupKey, Date.now());
  invalidateOpenOrdersCache();

  const orderId = result?.orderResult?.orderId ?? '-';
  const avgPrice = result?.orderResult?.avgPrice ?? result?.order?.markPrice ?? sig.entry;
  console.log(`[PostPumpDumpRiskOrder] REAL ${sig.symbol} SHORT ${orderType} orderId=${orderId} score=${sig.score}`);

  const webhookUrl = process.env.DUMP_IGNITION_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '';
  if (webhookUrl) {
    const fmt = (v) => v == null || !Number.isFinite(Number(v)) ? '-' : Number(v).toPrecision(8).replace(/\.?0+$/, '');
    const msg = [
      `**[REAL ORDER] Post-pump Dump Risk ${sig.symbol} SHORT - ${orderType} - Score ${sig.score} (${sig.grade ?? '-'})**`,
      `OrderId: \`${orderId}\` | Avg/Mark: \`${fmt(avgPrice)}\``,
      `Margin: $${marginUsdt} x ${leverage}x | Notional: $${notionalUsdt}`,
      `Entry signal: \`${fmt(sig.entry)}\` | SL: \`${fmt(sig.sl)}\` | TP: \`${fmt(sig.tp)}\``,
      `Skip TSL: true`,
    ].join('\n');
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: msg }),
    }).catch(() => {});
  }
}

function sendPostPumpDumpRiskDiscord(sig) {
  if (sig?.type !== 'post_pump_dump_risk') return;
  const webhookUrl = process.env.POST_PUMP_DUMP_RISK_WEBHOOK_URL || '';
  if (!webhookUrl) return;

  const minScore = Number(process.env.POST_PUMP_DUMP_RISK_MIN_DISCORD_SCORE ?? 0);
  if (sig.score < minScore) return;

  const dedupMs = Number(process.env.POST_PUMP_DUMP_RISK_DISCORD_COOLDOWN_MS ?? 4 * 3600 * 1000);
  const dedupKey = `${sig.symbol}|post_pump_dump_risk`;
  const lastFired = dumpIgnDiscordFired.get(dedupKey) ?? 0;
  if (Date.now() - lastFired < dedupMs) return;
  dumpIgnDiscordFired.set(dedupKey, Date.now());

  const fmt = (v) => {
    if (v == null || !Number.isFinite(Number(v))) return '-';
    const n = Number(v);
    if (Math.abs(n) >= 1000) return n.toLocaleString('en', { maximumFractionDigits: 2 });
    if (Math.abs(n) >= 1) return n.toFixed(4);
    return n.toFixed(6);
  };
  const noteKV = Object.fromEntries((sig.note ?? '')
    .split('|')
    .map((s) => s.trim().split('='))
    .filter((a) => a.length === 2)
    .map(([k, v]) => [k.trim(), v.trim()]));
  const fields = [
    { name: 'Entry / SL / TP', value: `\`${fmt(sig.entry)}\` / \`${fmt(sig.sl)}\` / \`${fmt(sig.tp)}\``, inline: false },
    { name: 'Runup', value: noteKV.runup ? `${noteKV.runup}%` : '-', inline: true },
    { name: 'Red volume', value: noteKV.redVolShare ? `${noteKV.redVolShare}%` : '-', inline: true },
    { name: 'Vol recent', value: noteKV.volRecent ? `${noteKV.volRecent}x` : '-', inline: true },
    { name: 'RSI fade', value: noteKV.rsiFade ?? '-', inline: true },
    { name: 'Support break', value: noteKV.supportBreak ? `${noteKV.supportBreak}%` : '-', inline: true },
    { name: 'Mark', value: fmt(sig.markPrice), inline: true },
  ];

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: `🔴 **[POST_PUMP_DUMP_RISK] ${sig.symbol} SHORT** · Score ${sig.score} (${sig.grade ?? '-'})`,
      embeds: [{
        title: `[POST_PUMP_DUMP_RISK] ${sig.symbol} · SHORT`,
        description: sig.reason ?? 'Post-pump distribution risk',
        color: 0xEF4444,
        fields,
        footer: { text: 'Dump Ignition Board' },
        timestamp: new Date().toISOString(),
      }],
    }),
  }).catch((err) => console.warn(`[PostPumpDumpRisk] Discord ${sig.symbol}:`, err.message));

  console.log(`[PostPumpDumpRisk] 📨 Discord: ${sig.symbol} score=${sig.score}`);
}

function sendPostDumpBounceRiskDiscord(sig) {
  if (sig?.type !== 'post_dump_bounce_risk') return;
  const webhookUrl = process.env.POST_DUMP_BOUNCE_RISK_WEBHOOK_URL
    || process.env.POST_PUMP_DUMP_RISK_WEBHOOK_URL
    || process.env.DUMP_IGNITION_WEBHOOK_URL
    || '';
  if (!webhookUrl) return;

  const minScore = Number(process.env.POST_DUMP_BOUNCE_RISK_MIN_DISCORD_SCORE ?? 0);
  if (sig.score < minScore) return;

  const dedupMs = Number(process.env.POST_DUMP_BOUNCE_RISK_DISCORD_COOLDOWN_MS ?? 4 * 3600 * 1000);
  const dedupKey = `${sig.symbol}|post_dump_bounce_risk`;
  const lastFired = dumpIgnDiscordFired.get(dedupKey) ?? 0;
  if (Date.now() - lastFired < dedupMs) return;
  dumpIgnDiscordFired.set(dedupKey, Date.now());

  const fmt = (v) => {
    if (v == null || !Number.isFinite(Number(v))) return '-';
    const n = Number(v);
    if (Math.abs(n) >= 1000) return n.toLocaleString('en', { maximumFractionDigits: 2 });
    if (Math.abs(n) >= 1) return n.toFixed(4);
    return n.toFixed(6);
  };
  const noteKV = Object.fromEntries((sig.note ?? '')
    .split('|')
    .map((s) => s.trim().split('='))
    .filter((a) => a.length === 2)
    .map(([k, v]) => [k.trim(), v.trim()]));
  const fields = [
    { name: 'Entry / SL / TP', value: `\`${fmt(sig.entry)}\` / \`${fmt(sig.sl)}\` / \`${fmt(sig.tp)}\``, inline: false },
    { name: 'Dump', value: noteKV.dump ? `${noteKV.dump}%` : '-', inline: true },
    { name: 'Bounce', value: noteKV.bounce ? `${noteKV.bounce}%` : '-', inline: true },
    { name: 'Green volume', value: noteKV.greenVolShare ? `${noteKV.greenVolShare}%` : '-', inline: true },
    { name: 'Vol recent', value: noteKV.volRecent ? `${noteKV.volRecent}x` : '-', inline: true },
    { name: 'RSI recover', value: noteKV.rsiRecover ?? '-', inline: true },
    { name: 'Resistance break', value: noteKV.resistanceBreak ? `${noteKV.resistanceBreak}%` : '-', inline: true },
    { name: 'Higher lows', value: noteKV.higherLows ?? '-', inline: true },
    { name: 'Mark', value: fmt(sig.markPrice), inline: true },
  ];

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: `🟢 **[POST_DUMP_BOUNCE_RISK] ${sig.symbol} LONG** · Score ${sig.score} (${sig.grade ?? '-'})`,
      embeds: [{
        title: `[POST_DUMP_BOUNCE_RISK] ${sig.symbol} · LONG`,
        description: sig.reason ?? 'Post-dump bounce risk: sell pressure fading, green volume recovery, reclaim resistance/EMA',
        color: 0x22C55E,
        fields,
        footer: { text: 'Dump Ignition Board' },
        timestamp: new Date().toISOString(),
      }],
    }),
  }).catch((err) => console.warn(`[PostDumpBounceRisk] Discord ${sig.symbol}:`, err.message));

  console.log(`[PostDumpBounceRisk] Discord: ${sig.symbol} score=${sig.score}`);
}

async function handlePostDumpBounceRiskRealOrder(sig) {
  if (sig?.type !== 'post_dump_bounce_risk') return;
  if (process.env.POST_DUMP_BOUNCE_RISK_AUTO_ORDER_ENABLED !== 'true') return;
  if (sig.action !== 'LONG') return;

  applyPostDumpBounceRiskTslExcludes([sig]);

  const minScore = Number(process.env.POST_DUMP_BOUNCE_RISK_AUTO_MIN_SCORE ?? 66);
  if (sig.score < minScore) return;
  if (!sig.entry || !sig.sl) return;

  const cooldownMs = Number(process.env.POST_DUMP_BOUNCE_RISK_AUTO_COOLDOWN_MS ?? 4 * 3600 * 1000);
  const dedupKey = `${sig.symbol}|${sig.type}`;
  const last = postDumpBounceRiskOrderFired.get(dedupKey) ?? 0;
  if (Date.now() - last < cooldownMs) {
    console.log(`[PostDumpBounceRiskOrder] skip ${sig.symbol} - cooldown`);
    return;
  }

  if (!runtimeSettings.orderEnabled || runtimeSettings.dryRun) {
    console.log(`[PostDumpBounceRiskOrder] skip ${sig.symbol} - real Binance order disabled/dry-run`);
    return;
  }

  let apiKey;
  let apiSecret;
  try {
    ({ apiKey, apiSecret } = getApiCredentials(null));
  } catch (err) {
    apiKey = process.env.BINANCE_API_KEY;
    apiSecret = process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) throw err;
  }

  const [positions, openOrders] = await Promise.all([
    client.getPositions({ apiKey, apiSecret }),
    getCachedOpenOrders(apiKey, apiSecret),
  ]);
  const hasPosition = positions.some((p) => p.symbol === sig.symbol && Math.abs(Number(p.positionAmt ?? 0)) > 0);
  if (hasPosition) {
    console.log(`[PostDumpBounceRiskOrder] skip ${sig.symbol} - already has position`);
    return;
  }
  const hasEntryOrder = openOrders.some((o) => {
    if (o.symbol !== sig.symbol) return false;
    if (String(o.reduceOnly ?? '').toLowerCase() === 'true') return false;
    const type = String(o.type ?? o.origType ?? '').toUpperCase();
    return ['MARKET', 'LIMIT', 'LIMIT_MAKER'].includes(type);
  });
  if (hasEntryOrder) {
    console.log(`[PostDumpBounceRiskOrder] skip ${sig.symbol} - already has entry order`);
    return;
  }

  const marginUsdt = Number(process.env.POST_DUMP_BOUNCE_RISK_AUTO_MARGIN_USDT ?? 1);
  const defaultLeverage = Number(process.env.POST_DUMP_BOUNCE_RISK_AUTO_LEVERAGE ?? 10);
  const leverage = calcAutoLeverage(sig.entry, sig.sl, defaultLeverage);
  const notionalUsdt = marginUsdt * leverage;
  const orderType = String(process.env.POST_DUMP_BOUNCE_RISK_AUTO_ORDER_TYPE ?? 'MARKET').toUpperCase();
  const maxOpenPositions = Number(process.env.POST_DUMP_BOUNCE_RISK_AUTO_MAX_POSITIONS ?? process.env.AUTO_TRADE_MAX_POSITIONS ?? 0);
  const result = await placeOrder({
    symbol: sig.symbol,
    side: 'BUY',
    orderType,
    notionalUsdt,
    leverage,
    limitPrice: orderType === 'MARKET' ? undefined : sig.entry,
    takeProfitPrice: sig.tp ?? undefined,
    stopLossPrice: sig.sl ?? undefined,
    maxOpenPositions,
    dryRun: false,
  }, null, { apiKey, apiSecret });

  postDumpBounceRiskOrderFired.set(dedupKey, Date.now());
  invalidateOpenOrdersCache();

  const orderId = result?.orderResult?.orderId ?? '-';
  const avgPrice = result?.orderResult?.avgPrice ?? result?.order?.markPrice ?? sig.entry;
  console.log(`[PostDumpBounceRiskOrder] REAL ${sig.symbol} LONG ${orderType} orderId=${orderId} score=${sig.score}`);

  const webhookUrl = process.env.DUMP_IGNITION_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '';
  if (webhookUrl) {
    const fmt = (v) => v == null || !Number.isFinite(Number(v)) ? '-' : Number(v).toPrecision(8).replace(/\.?0+$/, '');
    const msg = [
      `**[REAL ORDER] Post-dump Bounce Risk ${sig.symbol} LONG - ${orderType} - Score ${sig.score} (${sig.grade ?? '-'})**`,
      `OrderId: \`${orderId}\` | Avg/Mark: \`${fmt(avgPrice)}\``,
      `Margin: $${marginUsdt} x ${leverage}x | Notional: $${notionalUsdt}`,
      `Entry signal: \`${fmt(sig.entry)}\` | SL: \`${fmt(sig.sl)}\` | TP: \`${fmt(sig.tp)}\``,
      `Skip TSL: true`,
    ].join('\n');
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: msg }),
    }).catch(() => {});
  }
}

async function autoCreateDiPaperTrades(signals) {
  const health = btcHealthCache.data ?? {};
  for (const sig of signals) {
    const quality = evaluateDumpIgnitionAutoQuality(sig, health);
    if (!quality.ok) {
      console.log(`[DiPaper] ⏭ ${sig.symbol} skip auto ${sig.type} — ${quality.reason}`);
      continue;
    }
    const key = `${sig.symbol}|${sig.type}`;
    const last = diPaperAutoFired.get(key) ?? 0;
    if (Date.now() - last < 4 * 3600 * 1000) continue;
    try {
      await createDiPaperTrade({
        symbol: sig.symbol,
        side: 'SHORT',
        marginUsdt: 1,
        leverage: 10,
        entryPrice: sig.entry,
        tp: sig.tp ?? null,
        sl: sig.sl ?? null,
        source: `di-${sig.score}`,
        note: sig.note ?? '',
      });
      diPaperAutoFired.set(key, Date.now());
    } catch (e) {
      console.warn(`[DiPaper] auto create ${sig.symbol}:`, e.message);
    }
  }
  await syncDiPaperTicker();
}

async function scheduleDumpIgnitionScan() {
  clearTimeout(_dumpIgnitionScanDebounce);
  _dumpIgnitionScanDebounce = setTimeout(async () => {
    if (!strategyScansReady('DumpIgnitionScan')) return;
    try {
      const snapshot    = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols  = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runDumpIgnitionScan(topSymbols, klineCache, snapshotMap);
      const cacheStats = klineCache.stats('15m');
      const result = { signals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      dumpIgnitionScanCache.data = result;
      dumpIgnitionScanCache.expiresAt = Date.now() + 30_000;
      pushSse(dumpIgnitionSseClients, result);
      if (signals.length) console.log(`[DumpIgnition] ${signals.length} signal(s): ${signals.map((s) => `${s.symbol}(${s.type} ${s.score})`).join(', ')}`);
      applyPostPumpDumpRiskTslExcludes(signals);
      applyPostDumpBounceRiskTslExcludes(signals);
      for (const sig of signals) {
        sendPostPumpDumpRiskDiscord(sig);
        sendPostDumpBounceRiskDiscord(sig);
        handlePostPumpDumpRiskRealOrder(sig).catch((e) => {
          console.warn(`[PostPumpDumpRiskOrder] ${sig.symbol}:`, e.message);
        });
        handlePostDumpBounceRiskRealOrder(sig).catch((e) => {
          console.warn(`[PostDumpBounceRiskOrder] ${sig.symbol}:`, e.message);
        });
      }
      await autoCreateDiPaperTrades(signals);

      // Edge paper auto-fire: dump_ignition signals chỉ xuất hiện trên edge-short
      for (const sig of signals) {
        console.log(`[EdgePaper] ⏭ ${sig.symbol} skip dump ignition auto — blocked from Edge Short`);
      }

      // Discord notifications — dump ignition signals
      const diWebhook = process.env.DUMP_IGNITION_WEBHOOK_URL || '';
      const diMinScore = Number(process.env.DUMP_IGNITION_MIN_DISCORD_SCORE ?? 60);
      if (diWebhook) {
        const DEDUP_MS = 4 * 3600 * 1000;
        for (const sig of signals) {
          if (sig.score < diMinScore) continue;
          const lastFired = dumpIgnDiscordFired.get(sig.symbol) ?? 0;
          if (Date.now() - lastFired < DEDUP_MS) continue;
          dumpIgnDiscordFired.set(sig.symbol, Date.now());

          const isIgnition = sig.type === 'dump_ignition';
          const isRisk = sig.type === 'post_pump_dump_risk';
          const stageBadge = isIgnition ? '🔥 IGNITION' : isRisk ? '🟠 POST-PUMP RISK' : '⚠️ EARLY';
          const sym = sig.symbol.replace(/USDT$/, '');
          const gradeEmoji = sig.grade === 'A' ? '🔥' : sig.grade === 'B' ? '⚡' : '📌';
          const fmtP = (v) => v == null ? '—' : Number(v) >= 1000 ? Number(v).toLocaleString('en', { maximumFractionDigits: 2 }) : Number(v) >= 1 ? Number(v).toFixed(4) : Number(v).toFixed(6);
          // Parse note: "volX=2.31 | ema50Slope=-0.012%/bar" hoặc "liveEMA=Y | bias=full | volX=1.95 | ..."
          const noteKV = Object.fromEntries((sig.note ?? '').split('|').map((s) => s.trim().split('=')).filter((a) => a.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
          const volX = noteKV['volX'] ?? '—';
          const slope = noteKV['ema50Slope'] ?? noteKV['liveEMA'] ? `liveEMA=${noteKV['liveEMA']} bias=${noteKV['bias']}` : '';
          const msg = [
            `${gradeEmoji} **[Dump Ignition · ${stageBadge}] ${sym}USDT** · Score **${sig.score}** (${sig.grade})`,
            `📉 ${sig.reason ?? 'BB lower break + vol spike + EMA bearish'}`,
            `🎯 Entry: \`${fmtP(sig.entry)}\` | SL: \`${fmtP(sig.sl)}\` | TP: \`${fmtP(sig.tp)}\``,
            `📊 Vol: **${volX}×**${slope ? ` | ${slope}` : ''}`,
            sig.markPrice ? `💰 Mark: \`${fmtP(sig.markPrice)}\`` : '',
          ].filter(Boolean).join('\n');

          fetch(diWebhook, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ content: msg }),
          }).catch(() => {});

          console.log(`[DumpIgnition] 📨 Discord: ${sig.symbol} ${sig.type} score=${sig.score}`);
        }
      }
    } catch (e) {
      console.error('[DumpIgnitionScan] error:', e.message);
    }
  }, 3_000);
}

let _spikeRevDebounce = null;
async function scheduleSpikeReversalScan() {
  clearTimeout(_spikeRevDebounce);
  _spikeRevDebounce = setTimeout(async () => {
    if (!strategyScansReady('SpikeReversalScan')) return;
    try {
      const snapshot    = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols  = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runSpikeReversalScan(topSymbols, klineCache, snapshotMap);
      applySpikeReversalTslExcludes(signals);
      const cacheStats = klineCache.stats('15m');
      const result = { signals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      spikeReversalScanCache.data = result;
      spikeReversalScanCache.expiresAt = Date.now() + 30_000;
      pushSse(spikeReversalSseClients, result);
      if (signals.length) console.log(`[SpikeReversal] ${signals.length} signal(s): ${signals.map((s) => `${s.symbol}(${s.score})`).join(', ')}`);

      // Edge paper auto-fire: spike_reversal SHORT signals
      for (const sig of signals) {
        if (sig.score < 60) continue;
        const key = `spikerev|${sig.symbol}|${sig.type}`;
        const last = edgePaperAutoFired.get(key) ?? 0;
        if (Date.now() - last < 4 * 3600 * 1000) continue;
        edgePaperAutoFired.set(key, Date.now());
        createEdgePaperTrade({
          symbol:      sig.symbol,
          side:        'SHORT',
          status:      'OPEN',
          marginUsdt:  1,
          leverage:    10,
          entryPrice:  sig.entry,
          tp:          sig.tp ?? null,
          sl:          sig.sl ?? null,
          source:      `spikerev-${sig.score}`,
          note:        sig.note ?? '',
        }).catch((e) => console.warn(`[EdgePaper] spikerev ${sig.symbol}:`, e.message));
      }

      // Discord notifications — spike reversal signals
      const srWebhook = process.env.SPIKE_REVERSAL_WEBHOOK_URL || '';
      const srMinScore = Number(process.env.SPIKE_REVERSAL_MIN_DISCORD_SCORE ?? 60);
      if (srWebhook) {
        const DEDUP_MS = 4 * 3600 * 1000; // 4h per symbol
        for (const sig of signals) {
          if (sig.score < srMinScore) continue;
          const lastFired = spikeRevDiscordFired.get(sig.symbol) ?? 0;
          if (Date.now() - lastFired < DEDUP_MS) continue;
          spikeRevDiscordFired.set(sig.symbol, Date.now());

          const f = sig.factors ?? {};
          const sym = sig.symbol.replace(/USDT$/, '');
          const gradeEmoji = sig.grade === 'A' ? '🔥' : sig.grade === 'B' ? '⚡' : '📌';
          const fmtP = (v) => v == null ? '—' : Number(v) >= 1000 ? Number(v).toLocaleString('en', { maximumFractionDigits: 2 }) : Number(v) >= 1 ? Number(v).toFixed(4) : Number(v).toFixed(6);
          const msg = [
            `${gradeEmoji} **[Spike Reversal] ${sym}USDT** · Score **${sig.score}** (${sig.grade})`,
            `📈 Spike +${Math.max(f.spikeBodyPct ?? 0, f.spikeMovePct ?? 0).toFixed(1)}% vol **${(f.spikeVolRatio ?? 0).toFixed(1)}×** → reversal ${f.barsSinceSpike ?? '?'}bar`,
            `🎯 Entry: \`${fmtP(sig.entry)}\` | SL: \`${fmtP(sig.sl)}\` | TP: \`${fmtP(sig.tp)}\``,
            `📊 RSI14: ${f.rsi14 != null ? f.rsi14.toFixed(0) : '—'} | Overext: ${(f.overextPct ?? 0).toFixed(1)}% | Reject: ${((f.rejectFrac ?? 0) * 100).toFixed(0)}%`,
            sig.markPrice ? `💰 Mark: \`${fmtP(sig.markPrice)}\`` : '',
          ].filter(Boolean).join('\n');

          fetch(srWebhook, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ content: msg }),
          }).catch(() => {});

          console.log(`[SpikeReversal] 📨 Discord: ${sig.symbol} score=${sig.score}`);
        }
      }
    } catch (e) {
      console.error('[SpikeReversalScan] error:', e.message);
    }
  }, 2_500);
}

let _postPumpKillShortDebounce = null;
async function schedulePostPumpKillShortScan() {
  clearTimeout(_postPumpKillShortDebounce);
  _postPumpKillShortDebounce = setTimeout(async () => {
    if (!strategyScansReady('PostPumpKillShortScan')) return;
    try {
      const snapshot = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runPostPumpKillShortScan(topSymbols, klineCache, snapshotMap);
      const cacheStats = klineCache.stats('15m');
      const result = { signals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      postPumpKillShortScanCache.data = result;
      postPumpKillShortScanCache.expiresAt = Date.now() + 30_000;
      pushSse(postPumpKillShortSseClients, result);
      if (signals.length) console.log(`[PostPumpKillShort] ${signals.length} signal(s): ${signals.map((s) => `${s.symbol}(${s.stage} ${s.score})`).join(', ')}`);

      // Edge paper (shared /edge-short board) — only confirmed_short
      for (const sig of signals) {
        if (sig.stage !== 'confirmed_short' || sig.score < 60) continue;
        const key = `ppks|${sig.symbol}|${sig.type}`;
        const last = edgePaperAutoFired.get(key) ?? 0;
        if (Date.now() - last < 4 * 3600 * 1000) continue;
        edgePaperAutoFired.set(key, Date.now());
        createEdgePaperTrade({
          symbol: sig.symbol,
          side: 'SHORT',
          status: 'OPEN',
          marginUsdt: 1,
          leverage: 10,
          entryPrice: sig.entry,
          tp: sig.tp ?? null,
          sl: sig.sl ?? null,
          source: `ppks-${sig.score}`,
          note: sig.note ?? '',
        }).catch((e) => console.warn(`[EdgePaper] ppks ${sig.symbol}:`, e.message));
      }

      // PPKS paper auto-fire — cả confirmed_short lẫn confirmed_long vào /post-pump-kill-short page
      for (const sig of signals) {
        const isConfirmedShort = sig.stage === 'confirmed_short';
        const isConfirmedLong  = sig.stage === 'confirmed_long';
        if (!isConfirmedShort && !isConfirmedLong) continue;
        if (sig.score < 60) continue;
        const side = isConfirmedLong ? 'LONG' : 'SHORT';
        const ppksKey = `ppks-paper|${sig.symbol}|${sig.type}`;
        const ppksLast = ppksPaperAutoFired.get(ppksKey) ?? 0;
        if (Date.now() - ppksLast < 4 * 3600 * 1000) continue;
        ppksPaperAutoFired.set(ppksKey, Date.now());
        createPpksPaperTrade({
          symbol: sig.symbol,
          side,
          status: 'OPEN',
          marginUsdt: 1,
          leverage: 10,
          entryPrice: sig.entry,
          tp: sig.tp ?? null,
          sl: sig.sl ?? null,
          source: `ppks-auto-${sig.score}`,
          note: sig.note ?? '',
        }).catch((e) => console.warn(`[PpksPaper] auto-fire ${sig.symbol}:`, e.message));
      }

      for (const sig of signals) {
        handlePostPumpKillShortRealOrder(sig).catch((e) => {
          console.warn(`[PostPumpKillShortOrder] ${sig.symbol}:`, e.message);
        });
      }

      const ppksWebhook = process.env.POST_PUMP_KILL_SHORT_WEBHOOK_URL || '';
      const ppksMinScore = Number(process.env.POST_PUMP_KILL_SHORT_MIN_DISCORD_SCORE ?? 60);
      const ppksSendWatch = process.env.POST_PUMP_KILL_SHORT_SEND_WATCH === 'true';
      if (ppksWebhook) {
        const DEDUP_MS = 4 * 3600 * 1000;
        const fmtP = (v) => {
          if (v == null || !Number.isFinite(Number(v))) return '-';
          const n = Number(v);
          if (Math.abs(n) >= 1000) return n.toLocaleString('en', { maximumFractionDigits: 2 });
          if (Math.abs(n) >= 1) return n.toFixed(4);
          return n.toFixed(6);
        };
        const fmtPct = (v, d = 1) => v == null || !Number.isFinite(Number(v)) ? '-' : `${Number(v).toFixed(d)}%`;
        const fmtX = (v, d = 1) => v == null || !Number.isFinite(Number(v)) ? '-' : `${Number(v).toFixed(d)}x`;

        for (const sig of signals) {
          const isConfirmed = sig.stage === 'confirmed_short' || sig.stage === 'confirmed_long';
          if (!isConfirmed && !ppksSendWatch) continue;
          if (sig.score < ppksMinScore) continue;
          const dedupKey = `${sig.symbol}|${sig.stage}|${sig.type}`;
          const lastFired = postPumpKillShortDiscordFired.get(dedupKey) ?? 0;
          if (Date.now() - lastFired < DEDUP_MS) continue;
          postPumpKillShortDiscordFired.set(dedupKey, Date.now());

          const isLong = sig.stage === 'confirmed_long' || sig.type === 'post_dump_kill_long';
          const sym = sig.symbol.replace(/USDT$/, '');
          const f = sig.factors ?? {};
          const title = isLong ? 'Post Dump Kill Long' : 'Post Pump Kill Short';
          const side = isLong ? 'LONG' : 'SHORT';
          const pattern = isLong
            ? `Dump ${fmtPct(f.dumpPct)} -> bounce ${fmtPct(f.postDumpBouncePct)} -> lower sweep ${fmtPct(f.sweepMovePct)}`
            : `Pump ${fmtPct(f.pumpPct)} -> drop ${fmtPct(f.postPumpDropPct)} -> upper spike ${fmtPct(f.spikeMovePct)}`;
          const wickLine = isLong
            ? `Lower wick ${fmtPct((f.lowerWickFrac ?? 0) * 100, 0)} | closePos ${fmtPct((f.closePos ?? 0) * 100, 0)} | RSI6 ${f.rsi6 != null ? Number(f.rsi6).toFixed(0) : '-'}`
            : `Upper wick ${fmtPct((f.upperWickFrac ?? 0) * 100, 0)} | closePos ${fmtPct((f.closePos ?? 0) * 100, 0)} | RSI6 ${f.rsi6 != null ? Number(f.rsi6).toFixed(0) : '-'}`;
          const volLine = isLong
            ? `Sweep vol ${fmtX(f.sweepVolRatio)} | move ${fmtX(f.sweepAtrMove)} ATR`
            : `Spike vol ${fmtX(f.spikeVolRatio)} | move ${fmtX(f.spikeAtrMove)} ATR`;
          const msg = [
            `**[${title}] ${sym}USDT - ${side} - Score ${sig.score} (${sig.grade ?? '-'})**`,
            sig.reason ? `Reason: ${sig.reason}` : '',
            `Entry: \`${fmtP(sig.entry)}\` | SL: \`${fmtP(sig.sl)}\` | TP: \`${fmtP(sig.tp)}\``,
            `Pattern: ${pattern}`,
            `Reject: ${wickLine}`,
            `Volume: ${volLine}`,
            sig.markPrice ? `Mark: \`${fmtP(sig.markPrice)}\`` : '',
            sig.change24hPct != null ? `24h: ${fmtPct(sig.change24hPct, 2)}` : '',
          ].filter(Boolean).join('\n');

          fetch(ppksWebhook, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ content: msg }),
          }).catch((err) => console.warn(`[PostPumpKillShort] Discord ${sig.symbol}:`, err.message));

          console.log(`[PostPumpKillShort] Discord: ${sig.symbol} ${sig.stage} score=${sig.score}`);
        }
      }
    } catch (e) {
      console.error('[PostPumpKillShortScan] error:', e.message);
    }
  }, 2_800);
}

async function handlePostPumpKillShortRealOrder(sig) {
  if (process.env.POST_PUMP_KILL_SHORT_AUTO_ORDER_ENABLED !== 'true') return;
  const isShort = sig.stage === 'confirmed_short' || sig.stage === 'watch_spike';
  const isLong = sig.stage === 'confirmed_long' || sig.stage === 'watch_long_sweep';
  if (!isShort && !isLong) return;

  const minScore = Number(process.env.POST_PUMP_KILL_SHORT_AUTO_MIN_SCORE ?? 0);
  if (sig.score < minScore) return;
  if (!sig.entry || !sig.sl) return;

  const cooldownMs = Number(process.env.POST_PUMP_KILL_SHORT_AUTO_COOLDOWN_MS ?? 4 * 3600 * 1000);
  const dedupKey = `${sig.symbol}|${sig.stage}|${sig.type}`;
  const last = postPumpKillShortOrderFired.get(dedupKey) ?? 0;
  if (Date.now() - last < cooldownMs) {
    console.log(`[PostPumpKillShortOrder] skip ${sig.symbol} - cooldown`);
    return;
  }

  if (!runtimeSettings.orderEnabled || runtimeSettings.dryRun) {
    console.log(`[PostPumpKillShortOrder] skip ${sig.symbol} - real Binance order disabled/dry-run`);
    return;
  }

  let apiKey;
  let apiSecret;
  try {
    ({ apiKey, apiSecret } = getApiCredentials(null));
  } catch (err) {
    apiKey = process.env.BINANCE_API_KEY;
    apiSecret = process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) throw err;
  }
  const [positions, openOrders] = await Promise.all([
    client.getPositions({ apiKey, apiSecret }),
    getCachedOpenOrders(apiKey, apiSecret),
  ]);

  const hasPosition = positions.some((p) => p.symbol === sig.symbol && Math.abs(Number(p.positionAmt ?? 0)) > 0);
  if (hasPosition) {
    console.log(`[PostPumpKillShortOrder] skip ${sig.symbol} - already has position`);
    return;
  }

  const hasEntryOrder = openOrders.some((o) => {
    if (o.symbol !== sig.symbol) return false;
    if (String(o.reduceOnly ?? '').toLowerCase() === 'true') return false;
    const type = String(o.type ?? o.origType ?? '').toUpperCase();
    return ['MARKET', 'LIMIT', 'LIMIT_MAKER'].includes(type);
  });
  if (hasEntryOrder) {
    console.log(`[PostPumpKillShortOrder] skip ${sig.symbol} - already has entry order`);
    return;
  }

  const marginUsdt = Number(process.env.POST_PUMP_KILL_SHORT_AUTO_MARGIN_USDT ?? 1);
  const defaultLeverage = Number(process.env.POST_PUMP_KILL_SHORT_AUTO_LEVERAGE ?? 10);
  const leverage = calcAutoLeverage(sig.entry, sig.sl, defaultLeverage);
  const notionalUsdt = marginUsdt * leverage;
  const orderType = String(process.env.POST_PUMP_KILL_SHORT_AUTO_ORDER_TYPE ?? 'MARKET').toUpperCase();
  const maxOpenPositions = Number(process.env.POST_PUMP_KILL_SHORT_AUTO_MAX_POSITIONS ?? process.env.AUTO_TRADE_MAX_POSITIONS ?? 0);
  const side = isLong ? 'BUY' : 'SELL';
  const result = await placeOrder({
    symbol: sig.symbol,
    side,
    orderType,
    notionalUsdt,
    leverage,
    limitPrice: orderType === 'MARKET' ? undefined : sig.entry,
    takeProfitPrice: sig.tp ?? undefined,
    stopLossPrice: sig.sl ?? undefined,
    maxOpenPositions,
    dryRun: false,
  }, null, { apiKey, apiSecret });

  postPumpKillShortOrderFired.set(dedupKey, Date.now());
  invalidateOpenOrdersCache();

  const orderId = result?.orderResult?.orderId ?? '-';
  const avgPrice = result?.orderResult?.avgPrice ?? result?.order?.markPrice ?? sig.entry;
  console.log(`[PostPumpKillShortOrder] REAL ${sig.symbol} ${side} ${orderType} orderId=${orderId} score=${sig.score}`);

  const webhookUrl = process.env.POST_PUMP_KILL_SHORT_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '';
  if (webhookUrl) {
    const fmt = (v) => v == null || !Number.isFinite(Number(v)) ? '-' : Number(v).toPrecision(8).replace(/\.?0+$/, '');
    const msg = [
      `**[REAL ORDER] ${sig.symbol} ${isLong ? 'LONG' : 'SHORT'} - ${orderType} - Score ${sig.score} (${sig.grade ?? '-'})**`,
      `OrderId: \`${orderId}\` | Avg/Mark: \`${fmt(avgPrice)}\``,
      `Margin: $${marginUsdt} x ${leverage}x | Notional: $${notionalUsdt}`,
      `Entry signal: \`${fmt(sig.entry)}\` | SL: \`${fmt(sig.sl)}\` | TP: \`${fmt(sig.tp)}\``,
      `Type: ${sig.type ?? '-'} | Stage: ${sig.stage}`,
    ].join('\n');
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: msg }),
    }).catch(() => {});
  }
}

let _pumpIgnitionDebounce = null;

function parsePumpIgnitionNote(note) {
  const kv = {};
  for (const part of String(note ?? '').split('|')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    kv[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return kv;
}

function numFromNoteValue(value) {
  if (value == null) return null;
  const m = String(value).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function evaluatePumpIgnitionAutoQuality(sig, health = {}) {
  const minScore = Number(process.env.PUMP_IGNITION_AUTO_MIN_SCORE ?? 85);
  if (sig.score < minScore) return { ok: false, reason: `score ${sig.score} < ${minScore}` };

  if (health?.bias === 'bearish' || health?.bias === 'caution') {
    return { ok: false, reason: `BTC health ${health.bias}` };
  }
  if (health?.btcSpikeAlert) return { ok: false, reason: 'BTC spike correction risk' };
  if (Number.isFinite(Number(health?.btcCandle1hPct)) && Number(health.btcCandle1hPct) < -0.5) {
    return { ok: false, reason: `BTC 1h candle ${Number(health.btcCandle1hPct).toFixed(2)}%` };
  }

  const noteKV = parsePumpIgnitionNote(sig.note);
  const isEarly = sig.type === 'pump_ignition_early';
  const liveEMA = noteKV.liveEMA;
  const bias = noteKV.bias;
  const volX = numFromNoteValue(noteKV.volX);

  if (isEarly) {
    if (liveEMA !== 'Y') return { ok: false, reason: 'EARLY liveEMA=N' };
    if (bias !== 'full') return { ok: false, reason: `EARLY bias=${bias || 'unknown'}` };
  }

  if (volX != null && volX >= 1.5 && volX < 10) {
    return { ok: false, reason: `volX ${volX.toFixed(2)} in weak 1.5-10x zone` };
  }

  return { ok: true, reason: 'quality gate passed' };
}

async function autoCreatePiPaperTrades(signals) {
  const health = btcHealthCache.data ?? {};
  for (const sig of signals) {
    const quality = evaluatePumpIgnitionAutoQuality(sig, health);
    if (!quality.ok) {
      console.log(`[PiPaper] ⏭ ${sig.symbol} skip auto ${sig.type} — ${quality.reason}`);
      continue;
    }
    const key = `${sig.symbol}|${sig.type}`;
    const last = piPaperAutoFired.get(key) ?? 0;
    if (Date.now() - last < 4 * 3600 * 1000) continue;
    try {
      await createPiPaperTrade({
        symbol: sig.symbol,
        side: 'LONG',
        marginUsdt: 1,
        leverage: 10,
        entryPrice: sig.entry,
        tp: sig.tp ?? null,
        sl: sig.sl ?? null,
        source: `pi-${sig.score}`,
        note: sig.note ?? '',
      });
      piPaperAutoFired.set(key, Date.now());
    } catch (e) {
      console.warn(`[PiPaper] auto create ${sig.symbol}:`, e.message);
    }
  }
  await syncPiPaperTicker();
}

async function schedulePumpIgnitionScan() {
  clearTimeout(_pumpIgnitionDebounce);
  _pumpIgnitionDebounce = setTimeout(async () => {
    if (!strategyScansReady('PumpIgnitionScan')) return;
    try {
      const snapshot    = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols  = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const btcBias = btcHealthCache.data?.bias ?? 'neutral';
      const { signals, processed } = await runPumpIgnitionScan(topSymbols, klineCache, snapshotMap, { btcBias });
      const cacheStats = klineCache.stats('15m');
      const result = { signals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      pumpIgnitionScanCache.data = result;
      pumpIgnitionScanCache.expiresAt = Date.now() + 30_000;
      pushSse(pumpIgnitionSseClients, result);
      if (signals.length) console.log(`[PumpIgnition] ${signals.length} signal(s): ${signals.map((s) => `${s.symbol}(${s.type} ${s.score})`).join(', ')}`);
      await autoCreatePiPaperTrades(signals);

      // Edge paper auto-fire: pump_ignition LONG signals
      for (const sig of signals) {
        const quality = evaluatePumpIgnitionAutoQuality(sig, btcHealthCache.data ?? {});
        if (!quality.ok) {
          console.log(`[EdgePaper] ⏭ ${sig.symbol} skip pumpign auto — ${quality.reason}`);
          continue;
        }
        const key = `pumpign|${sig.symbol}|${sig.type}`;
        const last = edgePaperAutoFired.get(key) ?? 0;
        if (Date.now() - last < 4 * 3600 * 1000) continue;
        edgePaperAutoFired.set(key, Date.now());
        createEdgePaperTrade({
          symbol:     sig.symbol,
          side:       'LONG',
          status:     'OPEN',
          marginUsdt: 1,
          leverage:   10,
          entryPrice: sig.entry,
          tp:         sig.tp ?? null,
          sl:         sig.sl ?? null,
          source:     `pumpign-${sig.score}`,
          note:       sig.note ?? '',
        }).catch((e) => console.warn(`[EdgePaper] pumpign ${sig.symbol}:`, e.message));
      }

      // Discord notifications — pump ignition signals
      const piWebhook = process.env.PUMP_IGNITION_WEBHOOK_URL || '';
      const piMinScore = Number(process.env.PUMP_IGNITION_MIN_DISCORD_SCORE ?? 60);
      if (piWebhook) {
        const DEDUP_MS = 4 * 3600 * 1000;
        for (const sig of signals) {
          if (sig.score < piMinScore) continue;
          const lastFired = pumpIgnDiscordFired.get(sig.symbol) ?? 0;
          if (Date.now() - lastFired < DEDUP_MS) continue;
          pumpIgnDiscordFired.set(sig.symbol, Date.now());

          const isIgnition = sig.type === 'pump_ignition';
          const stageBadge = isIgnition ? '🔥 IGNITION' : '⚠️ EARLY';
          const sym = sig.symbol.replace(/USDT$/, '');
          const gradeEmoji = sig.grade === 'A' ? '🔥' : sig.grade === 'B' ? '⚡' : '📌';
          const fmtP = (v) => v == null ? '—' : Number(v) >= 1000 ? Number(v).toLocaleString('en', { maximumFractionDigits: 2 }) : Number(v) >= 1 ? Number(v).toFixed(4) : Number(v).toFixed(6);
          const noteKV = Object.fromEntries((sig.note ?? '').split('|').map((s) => s.trim().split('=')).filter((a) => a.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
          const volX = noteKV['volX'] ?? '—';
          const slope = noteKV['ema50Slope'] ?? noteKV['liveEMA'] ? `liveEMA=${noteKV['liveEMA']} bias=${noteKV['bias']}` : '';
          const msg = [
            `${gradeEmoji} **[Pump Ignition · ${stageBadge}] ${sym}USDT** · Score **${sig.score}** (${sig.grade})`,
            `📈 ${sig.reason ?? 'BB upper break + vol spike + EMA bullish'}`,
            `🎯 Entry: \`${fmtP(sig.entry)}\` | SL: \`${fmtP(sig.sl)}\` | TP: \`${fmtP(sig.tp)}\``,
            `📊 Vol: **${volX}×**${slope ? ` | ${slope}` : ''}`,
            sig.markPrice ? `💰 Mark: \`${fmtP(sig.markPrice)}\`` : '',
          ].filter(Boolean).join('\n');

          fetch(piWebhook, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ content: msg }),
          }).catch(() => {});

          console.log(`[PumpIgnition] 📨 Discord: ${sig.symbol} ${sig.type} score=${sig.score}`);
        }
      }
    } catch (e) {
      console.error('[PumpIgnitionScan] error:', e.message);
    }
  }, 3_500);
}

let _emaSqueezDebounce = null;
async function scheduleEmaSqueezeScan() {
  clearTimeout(_emaSqueezDebounce);
  _emaSqueezDebounce = setTimeout(async () => {
    try {
      if (binanceRateGate.isBlocked?.() && !_snapshotCache) {
        console.warn('[EmaSqueezeScan] Skip: Binance REST blocked and no snapshot cache yet.');
        return;
      }
      const snapshot    = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols  = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runEmaSqueezeScan(topSymbols, klineCache, snapshotMap, { intervals: EMA_SQUEEZE_INTERVALS.join(',') });
      const cacheStats = Object.fromEntries(EMA_SQUEEZE_INTERVALS.map((interval) => [interval, klineCache.stats(interval)]));
      await Promise.all([getBtcHealth(), getGoldHealth()]).catch(() => {});
      const enrichedSignals = annotateEmaSqueezeRealOrderStatus(await enrichEmaSqueezeSignalsWithLiquidityEntries(signals));
      const result = { signals: enrichedSignals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      emaSqueezesScanCache.data = result;
      emaSqueezesScanCache.expiresAt = Date.now() + 30_000;
      pushSse(emaSqueezeSseClients, result);
      if (signals.length) {
        const breakouts = signals.filter((s) => s.stage === 'BREAKOUT');
        const breakdowns = signals.filter((s) => s.stage === 'BREAKDOWN');
        const squeezes  = signals.filter((s) => s.stage === 'SQUEEZE');
        const squeezeShorts = signals.filter((s) => s.stage === 'SQUEEZE_SHORT');
        const byTf = EMA_SQUEEZE_INTERVALS.map((tf) => `${tf}:${signals.filter((s) => s.interval === tf).length}`).join(' ');
        console.log(`[EmaSqueeze] ${signals.length} signal(s) — BREAKOUT: ${breakouts.length}, BREAKDOWN: ${breakdowns.length}, SQUEEZE: ${squeezes.length}, SHORT: ${squeezeShorts.length} | ${byTf}`);
      }
      await sendEmaSqueezeDiscord(signals);
      await createEmaSqueezePaperTrades(signals);
      await handleEmaSqueezeRealLongOrders(signals);

      // Edge paper auto-fire: BREAKOUT score >= 70, dedup 4h
      for (const sig of signals) {
        if (sig.stage !== 'BREAKOUT' || sig.action !== 'LONG' || sig.score < 70) continue;
        const key  = `emasq|${sig.symbol}|${sig.interval ?? '15m'}`;
        const last = edgePaperAutoFired.get(key) ?? 0;
        if (Date.now() - last < 4 * 3600 * 1000) continue;
        edgePaperAutoFired.set(key, Date.now());
        createEdgePaperTrade({
          symbol:     sig.symbol,
          side:       'LONG',
          status:     'OPEN',
          marginUsdt: 1,
          leverage:   10,
          entryPrice: sig.entry,
          tp:         sig.tp ?? null,
          sl:         sig.sl ?? null,
          source:     `emasq-${sig.interval ?? '15m'}-${sig.score}`,
          note:       sig.note ?? '',
        }).catch((e) => console.warn(`[EdgePaper] emasq ${sig.symbol}:`, e.message));
      }
    } catch (e) {
      console.error('[EmaSqueezeScan] error:', e.message);
    }
  }, 3_500);
}

let _ema99KillReclaimDebounce = null;
async function scheduleEma99KillReclaimScan() {
  clearTimeout(_ema99KillReclaimDebounce);
  _ema99KillReclaimDebounce = setTimeout(async () => {
    try {
      if (binanceRateGate.isBlocked?.() && !_snapshotCache) {
        console.warn('[Ema99KillReclaimScan] Skip: Binance REST blocked and no snapshot cache yet.');
        return;
      }
      const snapshot = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols = snapshot
        .sort((a, b) => Number(b.quoteVolume ?? 0) - Number(a.quoteVolume ?? 0))
        .slice(0, Number(process.env.EMA99_KILL_RECLAIM_MAX_SYMBOLS ?? 400))
        .map((r) => r.symbol);
      const { signals, processed } = await runEma99KillReclaimScan(topSymbols, klineCache, snapshotMap, {
        interval: process.env.EMA99_KILL_RECLAIM_INTERVAL || '5m',
      });
      const result = {
        signals,
        scannedAt: Date.now(),
        total: topSymbols.length,
        processed,
        cacheStats: klineCache.stats(process.env.EMA99_KILL_RECLAIM_INTERVAL || '5m'),
      };
      ema99KillReclaimScanCache.data = result;
      ema99KillReclaimScanCache.expiresAt = Date.now() + 30_000;
      pushSse(ema99KillReclaimSseClients, result);
      if (signals.length) {
        const longCount = signals.filter((s) => s.action === 'LONG').length;
        const shortCount = signals.filter((s) => s.action === 'SHORT').length;
        console.log(`[Ema99KillReclaim] ${signals.length} signal(s) — LONG: ${longCount}, SHORT: ${shortCount}, processed=${processed}`);
      }
      await sendEma99KillReclaimDiscord(signals);
      await handleEma99KillReclaimRealLongOrders(signals);
    } catch (e) {
      console.error('[Ema99KillReclaimScan] error:', e.message);
    }
  }, 3_500);
}

let _shakeoutReclaimDebounce = null;
let _shakeoutReclaimWarmupStartedAt = 0;
function ensureShakeoutReclaimWarmup(topSymbols = []) {
  const warmupMax = Number(process.env.SHAKEOUT_RECLAIM_WARMUP_SYMBOLS ?? 9999);
  if (warmupMax <= 0 || !topSymbols.length) return;
  if (Date.now() - _shakeoutReclaimWarmupStartedAt < 10 * 60_000) return;
  _shakeoutReclaimWarmupStartedAt = Date.now();
  const symbols = topSymbols.slice(0, warmupMax);
  const batchSize = Number(process.env.SHAKEOUT_RECLAIM_WARMUP_BATCH_SIZE ?? 1);
  const batchDelayMs = Number(process.env.SHAKEOUT_RECLAIM_WARMUP_DELAY_MS ?? 2500);
  console.log(`[ShakeoutReclaim] Warmup ${symbols.length} symbols @5m/@15m.`);
  Promise.all([
    klineCache.seed(symbols, '5m', 180, { batchSize, batchDelayMs }),
    klineCache.seed(symbols, '15m', 180, { batchSize, batchDelayMs }),
  ]).catch((e) => console.warn('[ShakeoutReclaim] warmup failed:', e.message));
}

async function scheduleShakeoutReclaimScan() {
  clearTimeout(_shakeoutReclaimDebounce);
  _shakeoutReclaimDebounce = setTimeout(async () => {
    try {
      if (binanceRateGate.isBlocked?.() && !_snapshotCache) {
        console.warn('[ShakeoutReclaimScan] Skip: Binance REST blocked and no snapshot cache yet.');
        return;
      }
      const snapshot = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols = snapshot
        .sort((a, b) => Number(b.quoteVolume ?? 0) - Number(a.quoteVolume ?? 0))
        .slice(0, Number(process.env.SHAKEOUT_RECLAIM_MAX_SYMBOLS ?? 9999))
        .map((r) => r.symbol);
      const { signals, processed, diagnostics } = await runShakeoutReclaimScan(topSymbols, klineCache, snapshotMap);
      if (processed < Number(process.env.SHAKEOUT_RECLAIM_MIN_READY ?? 9999)) ensureShakeoutReclaimWarmup(topSymbols);
      const result = {
        signals,
        scannedAt: Date.now(),
        total: topSymbols.length,
        processed,
        diagnostics,
        cacheStats: {
          m5: klineCache.stats('5m'),
          m15: klineCache.stats('15m'),
        },
      };
      shakeoutReclaimScanCache.data = result;
      shakeoutReclaimScanCache.expiresAt = Date.now() + 30_000;
      pushSse(shakeoutReclaimSseClients, result);
      if (signals.length) {
        const confirmed = signals.filter((s) => s.stage === 'RECLAIM_CONFIRMED').length;
        console.log(`[ShakeoutReclaim] ${signals.length} signal(s) confirmed=${confirmed}, processed=${processed}`);
      }
      await sendShakeoutReclaimDiscord(signals);
      await createShakeoutPaperTrades(signals);
      await handleShakeoutReclaimRealOrders(signals);
    } catch (e) {
      console.error('[ShakeoutReclaimScan] error:', e.message);
    }
  }, 3_500);
}

async function sendEmaSqueezeDiscord(signals = []) {
  const webhookUrl = process.env.EMA_SQUEEZE_WEBHOOK_URL || '';
  if (!webhookUrl) return;
  const minScore = Number(process.env.EMA_SQUEEZE_MIN_DISCORD_SCORE ?? 65);
  const cooldownMs = Number(process.env.EMA_SQUEEZE_DISCORD_COOLDOWN_MS ?? 4 * 3600 * 1000);
  const now = Date.now();
  const fmt = (v) => v == null || !Number.isFinite(Number(v))
    ? '-'
    : Number(v) >= 1000
      ? Number(v).toLocaleString('en', { maximumFractionDigits: 2 })
      : Number(v) >= 1
        ? Number(v).toFixed(5).replace(/\.?0+$/, '')
        : Number(v).toPrecision(6).replace(/\.?0+$/, '');
  const pct = (v, d = 1) => v == null || !Number.isFinite(Number(v)) ? '-' : `${Number(v).toFixed(d)}%`;
  const cleanText = (value) => String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const sig of signals) {
    if (sig?.stage !== 'SQUEEZE' && sig?.stage !== 'SQUEEZE_SHORT') continue;
    if (Number(sig.score ?? 0) < minScore) continue;
    const key = `${sig.symbol}|${sig.interval ?? '15m'}|${sig.stage}|${sig.action ?? ''}`;
    const lastFired = emaSqueezeDiscordFired.get(key) ?? 0;
    if (now - lastFired < cooldownMs) continue;
    emaSqueezeDiscordFired.set(key, now);

    const isShort = sig.action === 'SHORT' || sig.stage === 'SQUEEZE_SHORT';
    const embed = {
      title: `[EMA Squeeze ${isShort ? 'SHORT' : 'LONG'} ${sig.interval ?? '15m'}] ${sig.symbol} - Score ${sig.score} (${sig.grade ?? '-'})`,
      description: cleanText(sig.reason ?? `Flat-base EMA squeeze setup ${isShort ? 'short' : 'long'}`),
      color: isShort ? 0xef4444 : 0xf59e0b,
      fields: [
        { name: 'Entry / SL / TP', value: `\`${fmt(sig.entry)}\` / \`${fmt(sig.sl)}\` / \`${fmt(sig.tp)}\``, inline: false },
        { name: 'Side', value: isShort ? 'SHORT' : 'LONG', inline: true },
        { name: 'Timeframe', value: String(sig.interval ?? '15m'), inline: true },
        { name: 'Base', value: pct(Number(sig.baseRangePct ?? 0) * 100), inline: true },
        { name: 'Volume', value: `${fmt(sig.volRatio)}x`, inline: true },
        { name: 'RSI', value: fmt(sig.rsi), inline: true },
        { name: 'EMA Spread', value: pct(Number(sig.spreadPct ?? 0) * 100), inline: true },
        { name: '24h', value: pct(sig.change24h, 2), inline: true },
        { name: 'Mark', value: fmt(sig.markPrice), inline: true },
      ],
      footer: { text: cleanText(sig.note ?? '') },
      timestamp: new Date(now).toISOString(),
    };

    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    })
      .then((res) => {
        if (!res.ok) console.warn(`[EmaSqueeze] Discord ${sig.symbol} failed: ${res.status}`);
        else console.log(`[EmaSqueeze] Discord sent: ${sig.symbol} score=${sig.score}`);
      })
      .catch((err) => console.warn(`[EmaSqueeze] Discord ${sig.symbol}:`, err.message));
  }
}

async function sendEma99KillReclaimDiscord(signals = []) {
  const webhookUrl = process.env.EMA99_KILL_RECLAIM_WEBHOOK_URL
    || 'https://discord.com/api/webhooks/1511764116631457802/tubWKfs3UMzQ3GhfzE6YAqAnM0TtS76egL23QLsHDsUBTo1z7S2Ag7XVD1zU_aMAQtn6';
  if (!webhookUrl) return;
  const minScore = Number(process.env.EMA99_KILL_RECLAIM_MIN_DISCORD_SCORE ?? 55);
  const cooldownMs = Number(process.env.EMA99_KILL_RECLAIM_DISCORD_COOLDOWN_MS ?? 4 * 3600 * 1000);
  const now = Date.now();
  const fmt = (v) => v == null || !Number.isFinite(Number(v))
    ? '-'
    : Number(v) >= 1000
      ? Number(v).toLocaleString('en', { maximumFractionDigits: 2 })
      : Number(v) >= 1
        ? Number(v).toFixed(5).replace(/\.?0+$/, '')
        : Number(v).toPrecision(6).replace(/\.?0+$/, '');
  const pct = (v, d = 1) => v == null || !Number.isFinite(Number(v)) ? '-' : `${Number(v).toFixed(d)}%`;
  const cleanText = (value) => String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const sig of signals) {
    if (Number(sig?.score ?? 0) < minScore) continue;
    const side = String(sig.action ?? '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
    const key = `${sig.symbol}|${sig.interval ?? '5m'}|${side}|${sig.stage ?? ''}`;
    const lastFired = ema99KillReclaimDiscordFired.get(key) ?? 0;
    if (now - lastFired < cooldownMs) continue;
    ema99KillReclaimDiscordFired.set(key, now);

    const f = sig.factors ?? {};
    const embed = {
      title: `[EMA99 Kill Reclaim ${side} ${sig.interval ?? '5m'}] ${sig.symbol} - Score ${sig.score} (${sig.grade ?? '-'})`,
      description: cleanText(sig.reason ?? (side === 'SHORT'
        ? 'Dump xong wick len EMA99 roi reject'
        : 'Pump xong kill ve EMA99 roi reclaim')),
      color: side === 'SHORT' ? 0xef4444 : 0x22c55e,
      fields: [
        { name: 'Entry / SL / TP', value: `\`${fmt(sig.entry)}\` / \`${fmt(sig.sl)}\` / \`${fmt(sig.tp)}\``, inline: false },
        { name: 'Side', value: side, inline: true },
        { name: 'Timeframe', value: String(sig.interval ?? '5m'), inline: true },
        { name: 'Mark', value: fmt(sig.markPrice), inline: true },
        { name: 'Context move', value: pct(f.contextMovePct, 1), inline: true },
        { name: 'Kill age', value: `${f.killAgeBars ?? '-'} bars`, inline: true },
        { name: 'EMA99 dist', value: pct(f.ema99DistPct, 2), inline: true },
        { name: 'Wick reject', value: pct(f.wickRejectPct, 0), inline: true },
        { name: 'Reclaim', value: pct(f.reclaimPct, 1), inline: true },
        { name: 'Volume', value: `${fmt(f.volRatio)}x`, inline: true },
        { name: 'RSI14', value: fmt(f.rsi14 ?? sig.rsi14), inline: true },
        { name: '24h', value: pct(sig.change24h, 2), inline: true },
      ],
      footer: { text: cleanText(sig.note ?? '') },
      timestamp: new Date(now).toISOString(),
    };

    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    })
      .then((res) => {
        if (!res.ok) console.warn(`[Ema99KillReclaim] Discord ${sig.symbol} failed: ${res.status}`);
        else console.log(`[Ema99KillReclaim] Discord sent: ${sig.symbol} ${side} score=${sig.score}`);
      })
      .catch((err) => console.warn(`[Ema99KillReclaim] Discord ${sig.symbol}:`, err.message));
  }
}

async function sendShakeoutReclaimDiscord(signals = []) {
  const webhookUrl = process.env.SHAKEOUT_RECLAIM_WEBHOOK_URL
    || 'https://discord.com/api/webhooks/1516025118508318820/_LsN5gFld07h5H6UcEqHkd9bjV53gVAKgeq7EMOCtXdMuhLOiuuuzmjFRhPQq4jgFoKn';
  if (!webhookUrl) return;
  const minScore = Number(process.env.SHAKEOUT_RECLAIM_MIN_DISCORD_SCORE ?? process.env.SHAKEOUT_RECLAIM_MIN_SCORE ?? 55);
  const cooldownMs = Number(process.env.SHAKEOUT_RECLAIM_DISCORD_COOLDOWN_MS ?? 4 * 3600 * 1000);
  const now = Date.now();
  const fmt = (v) => v == null || !Number.isFinite(Number(v))
    ? '-'
    : Number(v) >= 1000
      ? Number(v).toLocaleString('en', { maximumFractionDigits: 2 })
      : Number(v) >= 1
        ? Number(v).toFixed(5).replace(/\.?0+$/, '')
        : Number(v).toPrecision(6).replace(/\.?0+$/, '');
  const pct = (v, d = 1) => v == null || !Number.isFinite(Number(v)) ? '-' : `${Number(v).toFixed(d)}%`;
  const cleanText = (value) => String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const sig of signals) {
    if (Number(sig?.score ?? 0) < minScore) continue;
    const stage = String(sig.stage ?? 'SHAKEOUT_WATCH');
    const side = String(sig.action ?? 'LONG').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
    const isShort = side === 'SHORT';
    const key = `${sig.symbol}|${side}|${stage}`;
    const lastFired = shakeoutReclaimDiscordFired.get(key) ?? 0;
    if (now - lastFired < cooldownMs) continue;
    shakeoutReclaimDiscordFired.set(key, now);

    const confirmed = stage === 'RECLAIM_CONFIRMED';
    const f = sig.factors ?? {};
    const embed = {
      title: `[Shakeout ${side} ${confirmed ? 'CONFIRMED' : 'WATCH'}] ${sig.symbol} - Score ${sig.score} (${sig.grade ?? '-'})`,
      description: cleanText(sig.reason ?? (isShort
        ? 'Dump expansion 5m/15m, pullback kills weak shorts near EMA zone, watching reject'
        : 'Volume expansion 5m/15m, pullback shakeout near EMA zone, watching reclaim')),
      color: isShort ? 0xef4444 : (confirmed ? 0x22c55e : 0xf59e0b),
      fields: [
        { name: 'Entry / SL / TP', value: `\`${fmt(sig.entry)}\` / \`${fmt(sig.sl)}\` / \`${fmt(sig.tp)}\``, inline: false },
        { name: 'Side / Stage', value: `${side} / ${confirmed ? 'CONFIRMED' : 'WATCH'}`, inline: true },
        { name: 'Mark', value: fmt(sig.markPrice), inline: true },
        { name: '24h', value: pct(sig.change24h, 2), inline: true },
        { name: `${isShort ? 'Dump' : 'Pump'} 5m / 15m`, value: `${pct(f.move5mPct, 1)} / ${pct(f.move15mPct, 1)}`, inline: true },
        { name: 'Vol 5m / 15m', value: `${fmt(f.vol5mX)}x / ${fmt(f.vol15mX)}x`, inline: true },
        { name: isShort ? 'Short-kill bounce' : 'Shakeout drop', value: pct(f.drop5mPct, 1), inline: true },
        { name: 'EMA zone dist', value: pct(f.emaZoneDistPct, 2), inline: true },
        { name: isShort ? 'Reject' : 'Reclaim', value: pct(f.reclaimPct, 1), inline: true },
        { name: 'Pullback age', value: `${f.pullbackAge5m ?? '-'} bars`, inline: true },
        { name: 'RSI 5m / 15m', value: `${fmt(f.rsi5m)} / ${fmt(f.rsi15m)}`, inline: true },
        { name: isShort ? 'TP1 low' : 'TP1 high', value: fmt(sig.tp1), inline: true },
      ],
      footer: { text: cleanText(sig.note ?? '') },
      timestamp: new Date(now).toISOString(),
    };

    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    })
      .then((res) => {
        if (!res.ok) console.warn(`[ShakeoutReclaim] Discord ${sig.symbol} failed: ${res.status}`);
        else console.log(`[ShakeoutReclaim] Discord sent: ${sig.symbol} ${stage} score=${sig.score}`);
      })
      .catch((err) => console.warn(`[ShakeoutReclaim] Discord ${sig.symbol}:`, err.message));
  }
}

function getCachedEmaSqueezeLiquidityPlan(sig) {
  const symbol = String(sig?.symbol ?? '').toUpperCase();
  const interval = String(sig?.interval ?? '15m');
  if (!symbol) return null;

  const ttlMs = Math.max(10_000, Number(process.env.EMA_SQUEEZE_LIQUIDITY_ENTRY_CACHE_MS ?? 60_000));
  const key = `${symbol}|${interval}`;
  const cached = emaSqueezeLiquidityEntryCache.get(key);
  if (cached && Date.now() - cached.at < ttlMs) return cached.data;

  const limit = Math.max(80, Math.min(500, Number(process.env.EMA_SQUEEZE_LIQUIDITY_KLINE_LIMIT ?? 240)));
  const klines = klineCache.getIfCached(symbol, interval, limit);
  if (!klines || klines.length < 60) return null;

  const markPrice = Number(sig.markPrice ?? sig.currentPrice ?? klines.at(-1)?.close ?? sig.entry);
  if (!Number.isFinite(markPrice) || markPrice <= 0) return null;
  const side = String(sig?.action ?? '').toUpperCase();

  const heatmap = computeHeatmapData({
    klines,
    currentPrice: markPrice,
    momentumPct: sig.change24h ?? sig.change24hPct ?? null,
    preferredDirection: side === 'SHORT' ? 'short' : 'long',
  });
  const above = Number(heatmap.liquidityAbove ?? 0);
  const below = Number(heatmap.liquidityBelow ?? 0);
  const bias = Number(heatmap.bias ?? 0);
  const heavySide = bias >= 0 ? 'above' : 'below';
  const target = heatmap.sweepTarget ?? (
    heavySide === 'above'
      ? (heatmap.heatmapAbove?.[0] ?? null)
      : (heatmap.heatmapBelow?.[0] ?? null)
  );
  const sweepProb = liquidSweepProb(heatmap, target);
  const entryPlan = buildLiquidEntryPlan({
    heavySide,
    markPrice,
    target,
    heatmap,
    killZoneCluster: heatmap.killZoneCluster ?? null,
  });

  const data = {
    markPrice,
    heatmap,
    above,
    below,
    total: above + below,
    bias,
    heavySide,
    target,
    sweepProb,
    entryPlan,
  };
  emaSqueezeLiquidityEntryCache.set(key, { at: Date.now(), data });
  return data;
}

async function refineEmaSqueezePaperSignal(sig, { allowFallback = false } = {}) {
  const stage = String(sig?.stage ?? '').toUpperCase();
  const side = String(sig?.action ?? '').toUpperCase();
  if (!['BREAKOUT', 'BREAKDOWN', 'SQUEEZE', 'SQUEEZE_SHORT'].includes(stage)) return sig;
  if (!['LONG', 'SHORT'].includes(side)) return sig;
  if (process.env.EMA_SQUEEZE_LIQUIDITY_ENTRY_ENABLED === 'false') return sig;

  const isSetupStage = stage === 'SQUEEZE' || stage === 'SQUEEZE_SHORT';
  const requireLiquidity = !allowFallback && (isSetupStage
    ? process.env.EMA_SQUEEZE_SQUEEZE_REQUIRES_LIQUIDITY !== 'false'
    : process.env.EMA_SQUEEZE_CONFIRMED_REQUIRES_LIQUIDITY === 'true');
  const planData = getCachedEmaSqueezeLiquidityPlan(sig);
  if (!planData) return requireLiquidity ? null : sig;

  const minBias = Number(process.env.EMA_SQUEEZE_LIQUIDITY_MIN_BIAS ?? 0.05);
  const minSweepProb = Number(process.env.EMA_SQUEEZE_LIQUIDITY_MIN_SWEEP_PROB ?? 35);
  const plan = planData.entryPlan ?? {};
  const entry = Number(plan.entryPrice);
  const tp = Number(plan.takeProfitPrice);
  const sl = Number(plan.stopLossPrice);
  const originalEntry = Number(sig.entry);
  const originalTp = Number(sig.tp);
  const originalSl = Number(sig.sl);
  const expectedHeavySide = side === 'LONG' ? 'above' : 'below';
  const sideBiasOk = side === 'LONG'
    ? planData.bias >= minBias
    : planData.bias <= -minBias;
  const hasDirectionalLiquidity = planData.heavySide === expectedHeavySide
    && plan.side === side
    && sideBiasOk
    && planData.sweepProb >= minSweepProb;

  if (!hasDirectionalLiquidity) return requireLiquidity ? null : sig;
  if (![entry, tp, sl].every((v) => Number.isFinite(v) && v > 0)) return requireLiquidity ? null : sig;
  if (side === 'LONG' ? (sl >= entry || tp <= entry) : (sl <= entry || tp >= entry)) return requireLiquidity ? null : sig;

  const maxPullbackPct = Math.max(0.1, Number(process.env.EMA_SQUEEZE_LIQUIDITY_MAX_PULLBACK_PCT ?? 1.2));
  const pullbackPct = originalEntry > 0 ? Math.abs((entry - originalEntry) / originalEntry) * 100 : 0;
  if (pullbackPct > maxPullbackPct) return requireLiquidity ? null : sig;

  const refinedEntry = side === 'LONG'
    ? Math.min(originalEntry, entry)
    : Math.max(originalEntry, entry);
  const refinedTp = side === 'LONG'
    ? (Number.isFinite(tp) && tp > refinedEntry
        ? tp
        : (Number.isFinite(originalTp) && originalTp > refinedEntry ? originalTp : null))
    : (Number.isFinite(tp) && tp < refinedEntry
        ? tp
        : (Number.isFinite(originalTp) && originalTp < refinedEntry ? originalTp : null));
  const refinedSl = side === 'LONG'
    ? (Number.isFinite(sl) && sl < refinedEntry
        ? sl
        : (Number.isFinite(originalSl) && originalSl < refinedEntry ? originalSl : null))
    : (Number.isFinite(sl) && sl > refinedEntry
        ? sl
        : (Number.isFinite(originalSl) && originalSl > refinedEntry ? originalSl : null));
  if (!refinedTp || !refinedSl || (side === 'LONG' ? (refinedSl >= refinedEntry || refinedTp <= refinedEntry) : (refinedSl <= refinedEntry || refinedTp >= refinedEntry))) {
    return requireLiquidity ? null : sig;
  }

  const target = planData.target;
  const liqNote = [
    'liqEntry=Y',
    `bias=${planData.bias.toFixed(2)}`,
    `sweep=${planData.sweepProb}`,
    `entryPullback=${pullbackPct.toFixed(2)}%`,
    target?.price ? `liqTarget=${Number(target.price).toFixed(6)}` : '',
    plan.killZoneTakeProfitPrice ? `killZoneTP=${Number(plan.killZoneTakeProfitPrice).toFixed(6)}` : '',
  ].filter(Boolean).join(' | ');

  return {
    ...sig,
    entry: refinedEntry,
    tp: refinedTp,
    sl: refinedSl,
    liquidPlanEntry: entry,
    liquidPlanTp: tp,
    liquidPlanSl: sl,
    paperStatus: 'PENDING',
    note: [sig.note ?? sig.reason ?? '', liqNote, plan.note ?? ''].filter(Boolean).join(' | '),
    entryPlan: {
      ...plan,
      markPrice: planData.markPrice,
      signalMarkPrice: Number(sig.markPrice ?? planData.markPrice),
      liquidityBias: planData.bias,
      sweepProb: planData.sweepProb,
    },
    heavySide: planData.heavySide,
    sweepTargetPrice: target?.price ?? null,
    sweepDistancePct: target?.distancePct ?? null,
    rewardPct: plan.rewardPct ?? null,
    riskPct: plan.riskPct ?? null,
    rr: plan.rr ?? null,
    feasibleLeverage: plan.feasibleLeverage ?? null,
    feasibilityScore: plan.feasibilityScore ?? null,
    liquidityEntry: {
      bias: planData.bias,
      sweepProb: planData.sweepProb,
      originalEntry,
      planEntry: entry,
      planTp: tp,
      planSl: sl,
      entry: refinedEntry,
      tp: refinedTp,
      sl: refinedSl,
      targetPrice: target?.price ?? null,
      targetDistancePct: target?.distancePct ?? null,
    },
  };
}

function signalFromEmaSqueezePaperPayload(payload = {}) {
  const source = String(payload.source ?? '');
  if (!source.startsWith('emasq-')) return null;
  const match = source.match(/^emasq-(?:(5m|15m|1h)-)?([a-z_]+)-(\d+)$/i)
    ?? source.match(/^emasq-(?:(5m|15m|1h)-)?(\d+)$/i);
  if (!match) return null;

  const interval = match.length === 4 ? (match[1] || '15m') : (match[1] || '15m');
  const rawStage = match.length === 4 ? match[2] : 'squeeze';
  const score = Number(match.length === 4 ? match[3] : match[2]);
  const stage = String(rawStage ?? 'squeeze').toUpperCase();
  const side = String(payload.side ?? (
    stage.includes('SHORT') || stage === 'BREAKDOWN' ? 'SHORT' : 'LONG'
  )).toUpperCase();
  return {
    symbol: normalizeSymbol(payload.symbol),
    action: side,
    stage,
    interval,
    score,
    entry: Number(payload.entryPrice ?? payload.entry),
    tp: payload.tp ?? payload.takeProfitPrice ?? null,
    sl: payload.sl ?? payload.stopLossPrice ?? null,
    note: payload.note ?? '',
    markPrice: payload.signalMarkPrice ?? payload.markPrice ?? null,
  };
}

async function refineEmaSqueezePaperPayload(payload = {}) {
  const sig = signalFromEmaSqueezePaperPayload(payload);
  if (!sig) return payload;
  const refined = await refineEmaSqueezePaperSignal(sig, { allowFallback: true }).catch((err) => {
    console.warn(`[EmaSqueezePaper] manual liquidity refine ${sig.symbol}:`, err.message);
    return null;
  });
  const runnerMeta = buildEmaSqueezeRunnerPaperMeta({ ...payload, ...refined });
  if (!refined || refined === sig || !refined.liquidityEntry) {
    return runnerMeta.isRunner ? {
      ...payload,
      ...runnerMeta.payload,
      source: String(payload.source ?? '').includes('runner') || !payload.source
        ? payload.source
        : String(payload.source).replace(/-(\d+)$/, `${runnerMeta.sourceSuffix}-$1`),
      note: [payload.note ?? '', runnerMeta.noteSuffix].filter(Boolean).join(' | '),
    } : payload;
  }
  return {
    ...payload,
    ...runnerMeta.payload,
    status: refined.paperStatus ?? payload.status,
    entryPrice: refined.entry,
    tp: refined.tp ?? payload.tp,
    sl: refined.sl ?? payload.sl,
    note: [refined.note ?? payload.note, runnerMeta.noteSuffix].filter(Boolean).join(' | '),
    signalMarkPrice: refined.markPrice ?? refined.entryPlan?.signalMarkPrice ?? payload.signalMarkPrice,
    sweepTargetPrice: refined.sweepTargetPrice ?? payload.sweepTargetPrice,
    sweepDistancePct: refined.sweepDistancePct ?? payload.sweepDistancePct,
    feasibleLeverage: refined.feasibleLeverage ?? payload.feasibleLeverage,
    feasibilityScore: refined.feasibilityScore ?? payload.feasibilityScore,
    rewardPct: refined.rewardPct ?? payload.rewardPct,
    riskPct: refined.riskPct ?? payload.riskPct,
    rr: refined.rr ?? payload.rr,
    heavySide: refined.heavySide ?? payload.heavySide,
    entryPlan: refined.entryPlan ?? payload.entryPlan,
  };
}

function buildEmaSqueezeRunnerPaperMeta(sig = {}) {
  const isRunner = Boolean(sig.runnerCandidate);
  if (!isRunner) return { isRunner: false, sourceSuffix: '', noteSuffix: '', payload: {} };
  const runnerSide = String(sig.action ?? sig.side ?? '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
  const runnerScore = Number(sig.runnerScore ?? 0);
  const runnerTp = Number(sig.runnerTp ?? 0);
  const projected = Number(sig.runnerProjectedMovePct ?? 0);
  const noteParts = [
    'runner=Y',
    `runnerSide=${runnerSide}`,
    Number.isFinite(runnerScore) && runnerScore > 0 ? `runnerScore=${runnerScore.toFixed(0)}` : '',
    Number.isFinite(runnerTp) && runnerTp > 0 ? `runnerTP=${runnerTp.toFixed(6)}` : '',
    Number.isFinite(projected) && projected > 0 ? `runnerProjected=${runnerSide === 'SHORT' ? '-' : '+'}${projected.toFixed(1)}%` : '',
    sig.runnerReason ? `runnerReason=${sig.runnerReason}` : '',
  ].filter(Boolean);
  return {
    isRunner: true,
    sourceSuffix: '-runner',
    noteSuffix: noteParts.join(' | '),
    payload: {
      runnerCandidate: true,
      runnerSide,
      runnerScore: Number.isFinite(runnerScore) ? runnerScore : null,
      runnerTp: Number.isFinite(runnerTp) && runnerTp > 0 ? runnerTp : null,
      runnerProjectedMovePct: Number.isFinite(projected) ? projected : null,
      runnerReason: sig.runnerReason ?? null,
    },
  };
}

async function enrichEmaSqueezeSignalsWithLiquidityEntries(signals = []) {
  const out = [];
  for (const sig of signals ?? []) {
    const refined = await refineEmaSqueezePaperSignal(sig, { allowFallback: true }).catch(() => null);
    if (!refined?.liquidityEntry) {
      out.push({
        ...sig,
        emaEntry: sig.entry,
        emaTp: sig.tp ?? null,
        emaSl: sig.sl ?? null,
      });
      continue;
    }
    out.push({
      ...sig,
      emaEntry: sig.entry,
      emaTp: sig.tp ?? null,
      emaSl: sig.sl ?? null,
      liquidEntry: refined.liquidPlanEntry ?? refined.entry,
      liquidTp: refined.liquidPlanTp ?? refined.tp ?? null,
      liquidSl: refined.liquidPlanSl ?? refined.sl ?? null,
      paperEntry: refined.entry,
      paperTp: refined.tp ?? null,
      paperSl: refined.sl ?? null,
      liquidEntryOk: true,
      liquidityEntry: refined.liquidityEntry,
      liquidityEntryPlan: refined.entryPlan ?? null,
      liquidityEntryNote: refined.note ?? '',
    });
  }
  return out;
}

// Phân loại regime BTC cho gate pre-stage:
//   WEAK   – BTC yếu/giảm → ưu tiên SHORT, hạn chế LONG
//   STRONG – BTC mạnh/tăng → ưu tiên LONG, hạn chế SHORT
//   FLAT   – đi ngang/không rõ → coi như hạn chế LONG (theo backtest pre_breakout FLAT âm nặng)
function emaSqueezeBtcRegime(health = btcHealthCache.data) {
  if (!health || health.error) return 'FLAT';
  const bearishBias = health.bias === 'bearish' || health.bias === 'caution';
  const bearSignals = health.emaTrend1h === 'below'
    || (health.rsi1h != null && health.rsi1h < 45)
    || (health.pct6h != null && health.pct6h < -0.5);
  const bullSignals = health.emaTrend1h === 'above'
    && (health.rsi1h == null || health.rsi1h >= 52)
    && (health.pct6h == null || health.pct6h > 0.3);
  if (bearishBias || bearSignals) return 'WEAK';
  if (bullSignals && health.bias === 'neutral') return 'STRONG';
  return 'FLAT';
}

// Gate pre-stage theo xu hướng BTC (backtest: pre-long thua khi BTC WEAK/FLAT, pre-short thắng khi WEAK/FLAT)
//   LONG  chỉ fire khi BTC STRONG
//   SHORT chỉ fire khi BTC KHÔNG STRONG (WEAK/FLAT)
function emaSqueezePreStageBtcGate(side, health = btcHealthCache.data) {
  const regime = emaSqueezeBtcRegime(health);
  if (side === 'LONG') {
    return regime === 'STRONG'
      ? { ok: true, regime }
      : { ok: false, regime, reason: `pre-long chặn: BTC ${regime} (chỉ long khi BTC STRONG)` };
  }
  // SHORT: chặn khi BTC STRONG, HOẶC đang BOUNCE/chop (bias yếu nhưng giá đang bật) — short whipsaw.
  // Vd 19/06: bias caution nhưng EMA1h above + 6h dương → breakdown short bị bật, net sụt mạnh.
  if (regime === 'STRONG') {
    return { ok: false, regime, reason: 'pre-short chặn: BTC STRONG (chỉ short khi BTC WEAK/FLAT)' };
  }
  if (process.env.EMA_SQUEEZE_PAPER_SHORT_BLOCK_BOUNCE !== 'false' && health && !health.error) {
    const bounceMomentum = Number(process.env.EMA_SQUEEZE_PAPER_SHORT_BOUNCE_PCT6H ?? 0.3);
    const bouncing = health.emaTrend1h === 'above'
      && ((health.pct6h != null && health.pct6h > bounceMomentum)
        || (health.rsi1h != null && health.rsi1h >= 52));
    if (bouncing) {
      return { ok: false, regime, reason: `pre-short chặn: BTC đang bounce (EMA1h above, 6h=${health.pct6h ?? '-'}%, RSI1h=${health.rsi1h ?? '-'}) — chop dễ whipsaw short` };
    }
  }
  return { ok: true, regime };
}

// Snapshot BTC health lúc vào lệnh — lưu per-trade để backtest regime/gate sau này
function buildBtcHealthSnapshot(health = btcHealthCache.data) {
  if (!health || health.error) return null;
  return {
    regime: emaSqueezeBtcRegime(health),
    bias: health.bias ?? null,
    bearPoints: health.bearPoints ?? null,
    rsi1h: health.rsi1h ?? null,
    rsi4h: health.rsi4h ?? null,
    rsi1d: health.rsi1d ?? null,
    pct6h: health.pct6h ?? null,
    emaTrend1h: health.emaTrend1h ?? null,
    obvTrend: health.obvTrend ?? null,
    fundingRate: health.fundingRate ?? null,
    longPct: health.longPct ?? null,
    at: new Date().toISOString(),
  };
}

async function createEmaSqueezePaperTrades(signals = []) {
  if (process.env.EMA_SQUEEZE_PAPER_ENABLED === 'false') return;
  const minScore = Number(process.env.EMA_SQUEEZE_PAPER_MIN_SCORE ?? 80);
  const maxScore = Number(process.env.EMA_SQUEEZE_PAPER_MAX_SCORE ?? 89);
  const cooldownMs = Number(process.env.EMA_SQUEEZE_PAPER_COOLDOWN_MS ?? 4 * 3600 * 1000);
  const marginUsdt = Number(process.env.EMA_SQUEEZE_PAPER_MARGIN_USDT ?? 1);
  const leverage = Number(process.env.EMA_SQUEEZE_PAPER_LEVERAGE ?? 10);
  const btcSnap = buildBtcHealthSnapshot(); // lưu cùng mỗi lệnh để backtest gate sau này
  const allowedStages = new Set(String(process.env.EMA_SQUEEZE_PAPER_STAGES ?? 'BREAKOUT')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean));
  const allowedSides = new Set(String(process.env.EMA_SQUEEZE_PAPER_SIDES ?? 'LONG')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean));
  const allowedIntervals = new Set(String(process.env.EMA_SQUEEZE_PAPER_INTERVALS ?? '5m,15m,1h')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean));
  const confirmedStages = new Set(['BREAKOUT', 'BREAKDOWN']);
  const stageRank = { BREAKOUT: 0, PRE_BREAKOUT: 1, SQUEEZE: 2, BREAKDOWN: 3, PRE_BREAKDOWN: 4, SQUEEZE_SHORT: 5 };

  const orderedSignals = [...signals].sort((a, b) => {
    const ar = stageRank[String(a?.stage ?? '').toUpperCase()] ?? 9;
    const br = stageRank[String(b?.stage ?? '').toUpperCase()] ?? 9;
    return ar - br || Number(b?.score ?? 0) - Number(a?.score ?? 0);
  });

  for (const sig of orderedSignals) {
    const stage = String(sig?.stage ?? '').toUpperCase();
    const side = String(sig?.action ?? '').toUpperCase();
    const interval = String(sig?.interval ?? '15m');
    const score = Number(sig.score ?? 0);
    if (!allowedStages.has(stage)) continue;
    if (!allowedSides.has(side)) continue;
    if (allowedIntervals.size && !allowedIntervals.has(interval)) continue;
    if (score < minScore || score > maxScore) continue;
    if (!Number.isFinite(Number(sig.entry)) || Number(sig.entry) <= 0) continue;

    // Trần score cho 5m PRE_BREAKDOWN: score quá cao = dump over-extended/kiệt sức → dễ V-bounce → thua.
    // Backtest: score 80-83 exp +6..+9%, nhưng 86-89 exp -1.8% (net -211%). Bỏ ≥86.
    const pbd5mMaxScore = Number(process.env.EMA_SQUEEZE_PAPER_5M_PRE_BREAKDOWN_MAX_SCORE ?? 85);
    if (stage === 'PRE_BREAKDOWN' && interval === '5m' && score > pbd5mMaxScore) {
      console.log(`[EmaSqueezePaper] skip ${sig.symbol} PRE_BREAKDOWN 5m - score ${score} > ${pbd5mMaxScore} (over-extended, dễ V-bounce)`);
      continue;
    }

    // Gate pre-stage theo xu hướng BTC: BTC yếu → cấm pre-long; BTC mạnh → cấm pre-short
    const btcGateStages = new Set(String(process.env.EMA_SQUEEZE_PAPER_BTC_GATE_STAGES ?? 'PRE_BREAKOUT,PRE_BREAKDOWN')
      .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
    if (process.env.EMA_SQUEEZE_PAPER_BTC_GATE !== 'false' && btcGateStages.has(stage)) {
      const gate = emaSqueezePreStageBtcGate(side);
      if (!gate.ok) {
        console.log(`[EmaSqueezePaper] skip ${sig.symbol} ${stage} ${side} - ${gate.reason}`);
        continue;
      }
    }

    const requiresLiquidEntry = stage === 'SQUEEZE' || stage === 'SQUEEZE_SHORT';
    const paperSignal = await refineEmaSqueezePaperSignal(sig, { allowFallback: !requiresLiquidEntry }).catch((err) => {
      console.warn(`[EmaSqueezePaper] liquidity refine ${sig?.symbol ?? '?'}:`, err.message);
      return null;
    });
    if (!paperSignal) continue;
    if (requiresLiquidEntry && !paperSignal.liquidityEntry) continue;
    const runnerMeta = buildEmaSqueezeRunnerPaperMeta(paperSignal);

    if (stage === 'BREAKOUT') {
      const minRr = Number(process.env.EMA_SQUEEZE_PAPER_BREAKOUT_MIN_RR ?? 2);
      const minEmaPos = Number(process.env.EMA_SQUEEZE_PAPER_BREAKOUT_MIN_EMA_POS ?? 0.9);
      const emaPos = Number(sig.emaBandPos);
      const breakoutEntry = Number(sig.entry);
      const breakoutTp = Number(paperSignal.tp);
      const effectiveSl = emaSqueezePaperStopLossFromRoe({
        source: 'emasq-breakout-filter',
        side,
        entryPrice: breakoutEntry,
        leverage,
      });
      const risk = Math.abs(breakoutEntry - Number(effectiveSl));
      const reward = Math.abs(breakoutTp - breakoutEntry);
      const rr = risk > 0 && Number.isFinite(reward) ? reward / risk : null;

      if (!Number.isFinite(emaPos) || emaPos < minEmaPos) {
        console.log(`[EmaSqueezePaper] skip ${sig.symbol} BREAKOUT - emaPos=${Number.isFinite(emaPos) ? emaPos.toFixed(2) : '?'} < ${minEmaPos}`);
        continue;
      }
      if (!Number.isFinite(rr) || rr < minRr) {
        console.log(`[EmaSqueezePaper] skip ${sig.symbol} BREAKOUT - RR=${Number.isFinite(rr) ? rr.toFixed(2) : '?'} < ${minRr} entry=${breakoutEntry} sl=${effectiveSl} tp=${breakoutTp}`);
        continue;
      }
    }

    const key = `${paperSignal.symbol}|${paperSignal.interval ?? '15m'}|${stage}|${side}`;
    const last = emaSqueezePaperAutoFired.get(key) ?? 0;
    if (Date.now() - last < cooldownMs) continue;
    emaSqueezePaperAutoFired.set(key, Date.now());

    const basePayload = {
      symbol: paperSignal.symbol,
      side,
      marginUsdt,
      leverage,
      tp: paperSignal.tp ?? null,
      sl: paperSignal.sl ?? null,
      note: [paperSignal.note ?? paperSignal.reason ?? '', runnerMeta.noteSuffix].filter(Boolean).join(' | '),
      signalMarkPrice: paperSignal.markPrice ?? paperSignal.entryPlan?.signalMarkPrice ?? null,
      ...runnerMeta.payload,
      sweepTargetPrice: paperSignal.sweepTargetPrice ?? null,
      sweepDistancePct: paperSignal.sweepDistancePct ?? null,
      feasibleLeverage: paperSignal.feasibleLeverage ?? null,
      feasibilityScore: paperSignal.feasibilityScore ?? null,
      rewardPct: paperSignal.rewardPct ?? null,
      riskPct: paperSignal.riskPct ?? null,
      rr: paperSignal.rr ?? null,
      heavySide: paperSignal.heavySide ?? null,
      entryPlan: paperSignal.entryPlan ?? null,
      btcHealth: btcSnap,
    };
    const srcBase = `emasq-${paperSignal.interval ?? '15m'}-${stage.toLowerCase()}${runnerMeta.sourceSuffix}-${paperSignal.score}`;
    const fire = (extra) => createPumpPaperTrade({ ...basePayload, ...extra })
      .then(() => {
        if (pumpPaperTicker) syncPumpPaperTicker().catch(() => {});
        console.log(`[EmaSqueezePaper] ${side} ${paperSignal.symbol} ${stage}${extra.variant ? '/' + extra.variant : ''} score=${paperSignal.score}`);
      })
      .catch((e) => console.warn(`[EmaSqueezePaper] ${paperSignal.symbol}:`, e.message));

    if (stage === 'BREAKOUT') {
      // 2 lệnh cùng signalId để so sánh: MARKET (vào breakout ngay) vs PENDING (chờ retest về mép cụm EMA)
      const signalId = crypto.randomUUID();
      const marketEntry = Number(sig.entry);
      const emas = [Number(sig.ema13), Number(sig.ema25), Number(sig.ema99)].filter((v) => Number.isFinite(v) && v > 0);
      let pendingEntry;
      if (paperSignal.paperStatus === 'PENDING' && Number.isFinite(Number(paperSignal.entry))
          && (side === 'LONG' ? Number(paperSignal.entry) < marketEntry : Number(paperSignal.entry) > marketEntry)) {
        pendingEntry = Number(paperSignal.entry); // dùng entry liquidity nếu có (đã thấp/cao hơn breakout)
      } else if (emas.length) {
        const edge = side === 'LONG' ? Math.max(...emas) : Math.min(...emas); // mép cụm EMA = vùng retest
        pendingEntry = (side === 'LONG' ? edge < marketEntry : edge > marketEntry)
          ? edge : marketEntry * (side === 'LONG' ? 0.997 : 1.003);
      } else {
        pendingEntry = marketEntry * (side === 'LONG' ? 0.997 : 1.003);
      }
      await fire({ status: 'OPEN', variant: 'MARKET', signalId, entryPrice: marketEntry, source: `${srcBase}-mkt` });
      await fire({ status: 'PENDING', variant: 'PENDING', signalId, entryPrice: pendingEntry, source: `${srcBase}-pend` });
    } else {
      await fire({
        status: paperSignal.paperStatus ?? (confirmedStages.has(stage) ? 'OPEN' : 'PENDING'),
        entryPrice: paperSignal.entry,
        source: srcBase,
      });
    }
  }
}

function emaSqueezeBtcChartAllowsOrder(sig) {
  if (process.env.EMA_SQUEEZE_REAL_BTC_CHART_FILTER === 'false') return { ok: true, reason: 'disabled' };
  const rel = sig?.btcChartRelation;
  if (!rel || rel.relation !== 'aligned') return { ok: true, reason: 'coin independent/opposed to BTC' };

  const side = String(sig?.action ?? '').toUpperCase();
  const btcMovePct = Number(rel.btcMovePct);
  const minMovePct = Math.max(0, Number(process.env.EMA_SQUEEZE_REAL_BTC_CHART_MIN_MOVE_PCT ?? 0.15));
  if (!Number.isFinite(btcMovePct) || Math.abs(btcMovePct) < minMovePct) {
    return { ok: true, reason: 'BTC flat while chart aligned' };
  }

  const btcDirection = btcMovePct > 0 ? 'LONG' : 'SHORT';
  if (side === btcDirection) return { ok: true, reason: `aligned with BTC ${btcDirection}` };
  return {
    ok: false,
    reason: `chart follows BTC but signal ${side} conflicts with BTC ${btcDirection}`,
    btcDirection,
    btcMovePct,
    relation: rel.relation,
    corr: rel.corr,
  };
}

function emaSqueezeBtcHealthAllowsOrder(health = btcHealthCache.data) {
  if (process.env.EMA_SQUEEZE_REAL_BTC_HEALTH_FILTER === 'false') return { ok: true, reason: 'disabled' };
  if (!health || health.error) {
    return { ok: false, code: 'BTC_HEALTH_UNKNOWN', label: 'BLOCK BTC', reason: 'BTC health unavailable' };
  }
  const isDangerLow = (health.rsi1h != null && health.rsi1h < 25) || (health.rsi4h != null && health.rsi4h < 32);
  const isDangerHigh = (health.rsi1h != null && health.rsi1h > 80) || (health.rsi4h != null && health.rsi4h > 72);
  const btcWeak = (health.bias === 'bearish' && (
    health.emaTrend1h === 'below'
    || (health.rsi1h != null && health.rsi1h < 45)
    || (health.pct6h != null && health.pct6h < 0)
  ))
    || (health.emaTrend1h === 'below' && health.rsi1h != null && health.rsi1h < 45)
    || (health.pct6h != null && health.pct6h <= -1)
    || (health.btcCandle1hPct != null && health.btcCandle1hPct <= -0.5);

  if (isDangerLow || isDangerHigh) {
    return {
      ok: false,
      code: 'BTC_DANGER',
      label: 'BLOCK BTC',
      reason: `BTC danger RSI (RSI1h=${health.rsi1h ?? '-'} RSI4h=${health.rsi4h ?? '-'})`,
      health,
    };
  }
  if (btcWeak) {
    return {
      ok: false,
      code: 'BTC_WEAK',
      label: 'BLOCK BTC',
      reason: `BTC weak / limit long (bearPoints=${health.bearPoints ?? '-'} RSI1h=${health.rsi1h ?? '-'} pct6h=${health.pct6h ?? '-'})`,
      health,
    };
  }
  if (health.bias === 'bearish' || health.bias === 'caution') {
    return {
      ok: false,
      code: 'BTC_HEALTH',
      label: 'BLOCK BTC',
      reason: `BTC ${health.bias} (bearPoints=${health.bearPoints ?? '-'})`,
      health,
    };
  }
  if (health.bearishDiv || health.btcSpikeAlert) {
    return {
      ok: false,
      code: health.btcSpikeAlert ? 'BTC_SPIKE' : 'BTC_BEAR_DIV',
      label: 'BLOCK BTC',
      reason: health.btcSpikeAlert ? 'BTC spike alert' : 'BTC bearish RSI divergence',
      health,
    };
  }
  return { ok: true, reason: `BTC ${health.bias ?? 'neutral'}`, health };
}

function emaSqueezeGoldAllowsOrder(gold = goldHealthCache.data) {
  if (process.env.EMA_SQUEEZE_REAL_GOLD_FILTER === 'false') return { ok: true, reason: 'disabled' };
  if (gold?.disabled) return { ok: true, reason: 'Gold filter disabled', gold };
  if (!gold || gold.error) {
    return { ok: false, code: 'GOLD_UNKNOWN', label: 'BLOCK GOLD', reason: 'Gold health unavailable' };
  }
  if (gold.red) {
    return {
      ok: false,
      code: 'GOLD_RED',
      label: 'BLOCK GOLD',
      reason: `${gold.symbol} ${gold.interval} ${gold.mode} candle red (${gold.changePct}%)`,
      gold,
    };
  }
  return { ok: true, reason: `${gold.symbol} not red (${gold.changePct}%)`, gold };
}

function emaSqueezeMarketAllowsRealOrder({ btcHealth = btcHealthCache.data, goldHealth = goldHealthCache.data } = {}) {
  const btcGuard = emaSqueezeBtcHealthAllowsOrder(btcHealth);
  if (!btcGuard.ok) return btcGuard;
  const goldGuard = emaSqueezeGoldAllowsOrder(goldHealth);
  if (!goldGuard.ok) return goldGuard;
  return { ok: true, reason: `${btcGuard.reason}; ${goldGuard.reason}`, btcHealth, goldHealth };
}

function getEmaSqueezeRealOrderRules() {
  return {
    envEnabled: process.env.EMA_SQUEEZE_REAL_ORDER_ENABLED === 'true',
    runtimeEnabled: runtimeSettings.emaSqueezeRealOrderEnabled,
    orderEnabled: runtimeSettings.orderEnabled,
    dryRun: runtimeSettings.dryRun,
    vnBlockHour: isVnBlockHour(),
    minScore: Number(process.env.EMA_SQUEEZE_REAL_MIN_SCORE ?? 65),
    maxScore: Number(process.env.EMA_SQUEEZE_REAL_MAX_SCORE ?? 100),
    allowedIntervals: new Set(String(process.env.EMA_SQUEEZE_REAL_INTERVALS ?? '5m,15m,1h')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)),
    allowedStages: new Set(String(process.env.EMA_SQUEEZE_REAL_STAGES ?? 'BREAKOUT,SQUEEZE')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)),
    executableStages: new Set(['BREAKOUT', 'SQUEEZE', 'PRE_BREAKOUT']),
    squeezeRunnerMinScore: Number(process.env.EMA_SQUEEZE_REAL_RUNNER_MIN_SCORE ?? 70),
    requireRunnerForBreakout: process.env.EMA_SQUEEZE_REAL_REQUIRE_RUNNER_FOR_BREAKOUT === 'true',
  };
}

function getEmaSqueezeRealOrderStatus(sig, rules = getEmaSqueezeRealOrderRules()) {
  if (!rules.envEnabled) return { status: 'DISABLED', code: 'ENV_OFF', label: 'REAL OFF ENV', reason: 'EMA_SQUEEZE_REAL_ORDER_ENABLED=false' };
  if (!rules.runtimeEnabled) return { status: 'DISABLED', code: 'BOARD_OFF', label: 'REAL OFF', reason: 'Auto Binance is disabled on EMA Squeeze board' };
  if (!rules.orderEnabled) return { status: 'DISABLED', code: 'ORDER_OFF', label: 'ORDER OFF', reason: 'Binance order execution is disabled' };
  if (rules.dryRun) return { status: 'DISABLED', code: 'DRY_RUN', label: 'DRY RUN', reason: 'Dry run is enabled' };
  if (rules.vnBlockHour) return { status: 'DISABLED', code: 'VN_BLOCK', label: 'TIME BLOCK', reason: 'VN block hour' };

  const stage = String(sig?.stage ?? '').toUpperCase();
  const side = String(sig?.action ?? '').toUpperCase();
  const interval = String(sig?.interval ?? '15m');
  const score = Number(sig?.score ?? 0);

  if (!rules.executableStages.has(stage)) return { status: 'BLOCKED', code: 'STAGE_NOT_REAL', label: 'REAL BLOCK', reason: `${stage || 'UNKNOWN'} not executable for real order` };
  if (!rules.allowedStages.has(stage)) return { status: 'BLOCKED', code: 'STAGE_FILTER', label: 'REAL BLOCK', reason: `${stage} is not in EMA_SQUEEZE_REAL_STAGES` };
  if (side !== 'LONG') return { status: 'BLOCKED', code: 'SHORT_REAL_OFF', label: 'REAL BLOCK', reason: 'EMA Squeeze real order currently only allows LONG' };
  if (rules.allowedIntervals.size && !rules.allowedIntervals.has(interval)) return { status: 'BLOCKED', code: 'TF_FILTER', label: 'REAL BLOCK', reason: `${interval} is not in EMA_SQUEEZE_REAL_INTERVALS` };
  if (score < rules.minScore) return { status: 'BLOCKED', code: 'SCORE_LOW', label: 'REAL BLOCK', reason: `score ${score} < ${rules.minScore}` };
  if (score > rules.maxScore) return { status: 'BLOCKED', code: 'SCORE_HIGH', label: 'REAL BLOCK', reason: `score ${score} > ${rules.maxScore}` };

  const runnerScore = Number(sig?.runnerScore ?? 0);
  const isRunner = Boolean(sig?.runnerCandidate) && runnerScore >= rules.squeezeRunnerMinScore;
  if (stage === 'SQUEEZE' && !isRunner) return { status: 'BLOCKED', code: 'RUNNER_REQUIRED', label: 'REAL BLOCK', reason: `SQUEEZE needs runner >= ${rules.squeezeRunnerMinScore}` };
  if (stage === 'BREAKOUT' && rules.requireRunnerForBreakout && !isRunner) return { status: 'BLOCKED', code: 'RUNNER_REQUIRED', label: 'REAL BLOCK', reason: `BREAKOUT needs runner >= ${rules.squeezeRunnerMinScore}` };
  if (stage === 'PRE_BREAKOUT' && !isRunner) return { status: 'BLOCKED', code: 'RUNNER_REQUIRED', label: 'REAL BLOCK', reason: `PRE_BREAKOUT needs runner >= ${rules.squeezeRunnerMinScore}` };

  const btcChartGuard = emaSqueezeBtcChartAllowsOrder(sig);
  if (!btcChartGuard.ok) return {
    status: 'BLOCKED',
    code: 'BTC_CHART',
    label: 'BLOCK BTC',
    reason: btcChartGuard.reason,
  };
  const marketGuard = emaSqueezeMarketAllowsRealOrder();
  if (!marketGuard.ok) return {
    status: 'BLOCKED',
    code: marketGuard.code ?? 'MARKET_GUARD',
    label: marketGuard.label ?? 'REAL BLOCK',
    reason: marketGuard.reason,
  };
  if (!Number.isFinite(Number(sig?.entry)) || Number(sig.entry) <= 0) return { status: 'BLOCKED', code: 'ENTRY_INVALID', label: 'REAL BLOCK', reason: 'invalid entry' };

  return { status: 'CANDIDATE', code: 'REAL_OK', label: 'REAL OK', reason: 'passes real-order filters before position/liquidity checks' };
}

function annotateEmaSqueezeRealOrderStatus(signals = []) {
  const rules = getEmaSqueezeRealOrderRules();
  return signals.map((sig) => ({
    ...sig,
    realOrderStatus: getEmaSqueezeRealOrderStatus(sig, rules),
  }));
}

async function handleEmaSqueezeRealLongOrders(signals = []) {
  if (process.env.EMA_SQUEEZE_REAL_ORDER_ENABLED !== 'true') return;
  if (!runtimeSettings.emaSqueezeRealOrderEnabled) {
    console.log('[EmaSqueezeReal] skip - EMA Squeeze auto Binance disabled on board');
    return;
  }
  if (!runtimeSettings.orderEnabled || runtimeSettings.dryRun) {
    console.log('[EmaSqueezeReal] skip - real Binance order disabled/dry-run');
    return;
  }
  if (isVnBlockHour()) {
    console.log('[EmaSqueezeReal] skip - VN block hour');
    return;
  }

  const minScore = Number(process.env.EMA_SQUEEZE_REAL_MIN_SCORE ?? 65);
  const maxScore = Number(process.env.EMA_SQUEEZE_REAL_MAX_SCORE ?? 100);
  const allowedIntervals = new Set(String(process.env.EMA_SQUEEZE_REAL_INTERVALS ?? '5m,15m,1h')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean));
  const allowedStages = new Set(String(process.env.EMA_SQUEEZE_REAL_STAGES ?? 'BREAKOUT,SQUEEZE')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean));
  const executableStages = new Set(['BREAKOUT', 'SQUEEZE', 'PRE_BREAKOUT']);
  const squeezeRunnerMinScore = Number(process.env.EMA_SQUEEZE_REAL_RUNNER_MIN_SCORE ?? 70);
  const requireRunnerForBreakout = process.env.EMA_SQUEEZE_REAL_REQUIRE_RUNNER_FOR_BREAKOUT === 'true';
  const marginUsdt = Number(process.env.EMA_SQUEEZE_REAL_MARGIN_USDT ?? 1);
  const leverage = Math.max(1, Math.min(125, Number(process.env.EMA_SQUEEZE_REAL_LEVERAGE ?? 10)));
  const orderType = String(process.env.EMA_SQUEEZE_REAL_ORDER_TYPE ?? 'MARKET').toUpperCase();
  const stopLossRoe = Number(process.env.EMA_SQUEEZE_REAL_STOP_LOSS_ROE ?? 30);
  const cooldownMs = Number(process.env.EMA_SQUEEZE_REAL_COOLDOWN_MS ?? 4 * 3600 * 1000);
  const maxPerScan = Math.max(1, Number(process.env.EMA_SQUEEZE_REAL_MAX_ORDERS_PER_SCAN ?? 1));
  const maxOpenPositions = Number(process.env.EMA_SQUEEZE_REAL_MAX_POSITIONS ?? process.env.AUTO_TRADE_MAX_POSITIONS ?? 0);
  if (!['MARKET', 'LIMIT', 'LIMIT_IOC'].includes(orderType)) {
    console.warn(`[EmaSqueezeReal] invalid order type: ${orderType}`);
    return;
  }

  const [btcHealth, goldHealth] = await Promise.all([getBtcHealth(), getGoldHealth()]);
  const marketGuard = emaSqueezeMarketAllowsRealOrder({ btcHealth, goldHealth });
  if (!marketGuard.ok) {
    console.log(`[EmaSqueezeReal] skip all - ${marketGuard.reason}`);
    return;
  }

  let apiKey;
  let apiSecret;
  try {
    ({ apiKey, apiSecret } = getApiCredentials(null));
  } catch (err) {
    apiKey = process.env.BINANCE_API_KEY;
    apiSecret = process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) throw err;
  }

  const [positions, openOrders] = await Promise.all([
    client.getPositions({ apiKey, apiSecret }),
    getCachedOpenOrders(apiKey, apiSecret),
  ]);

  let submitted = 0;
  const stageRank = { PRE_BREAKOUT: 0, BREAKOUT: 1, SQUEEZE: 2, BREAKDOWN: 3, SQUEEZE_SHORT: 4 };
  const orderedSignals = [...signals].sort((a, b) => {
    const ar = stageRank[String(a?.stage ?? '').toUpperCase()] ?? 9;
    const br = stageRank[String(b?.stage ?? '').toUpperCase()] ?? 9;
    return ar - br || Number(b?.score ?? 0) - Number(a?.score ?? 0);
  });

  for (const sig of orderedSignals) {
    if (submitted >= maxPerScan) break;
    const stage = String(sig?.stage ?? '').toUpperCase();
    const side = String(sig?.action ?? '').toUpperCase();
    const interval = String(sig?.interval ?? '15m');
    if (!executableStages.has(stage)) continue;
    if (!allowedStages.has(stage) || side !== 'LONG') continue;
    if (allowedIntervals.size && !allowedIntervals.has(interval)) continue;
    const score = Number(sig.score ?? 0);
    if (score < minScore || score > maxScore) continue;
    const runnerScore = Number(sig.runnerScore ?? 0);
    const isRunner = Boolean(sig.runnerCandidate) && runnerScore >= squeezeRunnerMinScore;
    if (stage === 'SQUEEZE' && !isRunner) {
      console.log(`[EmaSqueezeReal] skip ${sig.symbol} SQUEEZE - not runner type (runner=${runnerScore || 0}, min=${squeezeRunnerMinScore})`);
      continue;
    }
    if (stage === 'BREAKOUT' && requireRunnerForBreakout && !isRunner) {
      console.log(`[EmaSqueezeReal] skip ${sig.symbol} BREAKOUT - runner required`);
      continue;
    }
    if (stage === 'PRE_BREAKOUT' && !isRunner) {
      console.log(`[EmaSqueezeReal] skip ${sig.symbol} PRE_BREAKOUT - runner required`);
      continue;
    }
    const btcChartGuard = emaSqueezeBtcChartAllowsOrder(sig);
    if (!btcChartGuard.ok) {
      console.log(`[EmaSqueezeReal] skip ${sig.symbol} - ${btcChartGuard.reason} (btc=${btcChartGuard.btcMovePct?.toFixed?.(2)}%, corr=${btcChartGuard.corr ?? '-'})`);
      continue;
    }
    if (!Number.isFinite(Number(sig.entry)) || Number(sig.entry) <= 0) continue;

    const symbol = normalizeSymbol(sig.symbol);
    const liqBlock = liqAutoBlockReason(symbol, 'LONG');
    if (liqBlock) {
      console.log(`[EmaSqueezeReal] skip ${symbol} - ${liqBlock}`);
      continue;
    }
    const dedupKey = `${symbol}|${sig.interval ?? '15m'}|${stage}|LONG`;
    const last = emaSqueezeRealOrderFired.get(dedupKey) ?? 0;
    if (Date.now() - last < cooldownMs) continue;

    const hasPosition = positions.some((p) => p.symbol === symbol && Math.abs(Number(p.positionAmt ?? 0)) > 0);
    if (hasPosition) {
      console.log(`[EmaSqueezeReal] skip ${symbol} - already has position`);
      continue;
    }
    const hasEntryOrder = openOrders.some((o) => {
      if (o.symbol !== symbol) return false;
      if (String(o.reduceOnly ?? '').toLowerCase() === 'true') return false;
      const type = String(o.type ?? o.origType ?? '').toUpperCase();
      return ['MARKET', 'LIMIT', 'LIMIT_MAKER'].includes(type);
    });
    if (hasEntryOrder) {
      console.log(`[EmaSqueezeReal] skip ${symbol} - already has entry order`);
      continue;
    }

    try {
      const requiresLiquidEntry = stage === 'SQUEEZE';
      const orderSignal = await refineEmaSqueezePaperSignal(sig, { allowFallback: !requiresLiquidEntry }) || null;
      if (!orderSignal || (requiresLiquidEntry && !orderSignal.liquidityEntry)) {
        console.log(`[EmaSqueezeReal] skip ${symbol} ${stage} - no good liquid entry`);
        continue;
      }
      const orderEntry = Number(orderSignal.entry);
      const orderTp = Number(orderSignal.tp);
      const defaultEntry = Number(sig.entry);
      if (!Number.isFinite(orderEntry) || orderEntry <= 0) {
        console.warn(`[EmaSqueezeReal] skip ${symbol} - invalid refined entry`);
        continue;
      }
      const orderSl = Number.isFinite(stopLossRoe) && stopLossRoe > 0
        ? orderEntry * (1 - (stopLossRoe / 100 / leverage))
        : Number(orderSignal.sl);
      const usesBetterLiquidEntry = Boolean(orderSignal.liquidityEntry)
        && Number.isFinite(defaultEntry)
        && (side === 'LONG' ? orderEntry < defaultEntry : orderEntry > defaultEntry);
      const effectiveOrderType = orderType === 'MARKET' && usesBetterLiquidEntry ? 'LIMIT' : orderType;
      const result = await placeOrder({
        symbol,
        side: 'BUY',
        orderType: effectiveOrderType,
        notionalUsdt: marginUsdt * leverage,
        leverage,
        limitPrice: effectiveOrderType === 'MARKET' ? undefined : orderEntry,
        takeProfitPrice: Number.isFinite(orderTp) && orderTp > 0 ? orderTp : undefined,
        stopLossPrice: Number.isFinite(orderSl) && orderSl > 0 ? orderSl : undefined,
        maxOpenPositions,
        dryRun: false,
      }, null, { apiKey, apiSecret });

      submitted++;
      emaSqueezeRealOrderFired.set(dedupKey, Date.now());
      invalidateOpenOrdersCache();
      const orderId = result?.orderResult?.orderId ?? '-';
      const entrySource = orderSignal.liquidityEntry ? ` entry=${orderEntry} liquidPlan=${orderSignal.liquidPlanEntry ?? '-'}` : ` entry=${orderEntry}`;
      const modeText = effectiveOrderType === orderType ? effectiveOrderType : `${effectiveOrderType}(from ${orderType})`;
      console.log(`[EmaSqueezeReal] REAL ${symbol} LONG ${stage} ${interval} ${modeText}${entrySource} orderId=${orderId} margin=$${marginUsdt} score=${sig.score}`);
    } catch (e) {
      console.warn(`[EmaSqueezeReal] ${symbol}: ${e.message}`);
    }
  }
}

async function handleEma99KillReclaimRealLongOrders(signals = []) {
  if (process.env.EMA99_KILL_RECLAIM_REAL_ORDER_ENABLED !== 'true') return;
  if (!runtimeSettings.orderEnabled || runtimeSettings.dryRun) {
    console.log('[Ema99KillReclaimReal] skip - real Binance order disabled/dry-run');
    return;
  }

  const minScore = Number(process.env.EMA99_KILL_RECLAIM_REAL_MIN_SCORE ?? 55);
  const maxScore = Number(process.env.EMA99_KILL_RECLAIM_REAL_MAX_SCORE ?? 100);
  const intervalAllow = String(process.env.EMA99_KILL_RECLAIM_REAL_INTERVAL ?? '5m');
  const marginUsdt = Number(process.env.EMA99_KILL_RECLAIM_REAL_MARGIN_USDT ?? 1);
  const leverage = Math.max(1, Math.min(125, Number(process.env.EMA99_KILL_RECLAIM_REAL_LEVERAGE ?? 10)));
  const orderType = String(process.env.EMA99_KILL_RECLAIM_REAL_ORDER_TYPE ?? 'MARKET').toUpperCase();
  const cooldownMs = Number(process.env.EMA99_KILL_RECLAIM_REAL_COOLDOWN_MS ?? 4 * 3600 * 1000);
  const maxPerScan = Math.max(1, Number(process.env.EMA99_KILL_RECLAIM_REAL_MAX_ORDERS_PER_SCAN ?? 1));
  const maxOpenPositions = Number(process.env.EMA99_KILL_RECLAIM_REAL_MAX_POSITIONS ?? process.env.AUTO_TRADE_MAX_POSITIONS ?? 0);
  if (!['MARKET', 'LIMIT', 'LIMIT_IOC'].includes(orderType)) {
    console.warn(`[Ema99KillReclaimReal] invalid order type: ${orderType}`);
    return;
  }

  let apiKey;
  let apiSecret;
  try {
    ({ apiKey, apiSecret } = getApiCredentials(null));
  } catch (err) {
    apiKey = process.env.BINANCE_API_KEY;
    apiSecret = process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) throw err;
  }

  const [positions, openOrders] = await Promise.all([
    client.getPositions({ apiKey, apiSecret }),
    getCachedOpenOrders(apiKey, apiSecret),
  ]);

  const orderedSignals = [...signals]
    .filter((sig) => String(sig?.action ?? '').toUpperCase() === 'LONG')
    .filter((sig) => String(sig?.interval ?? '5m') === intervalAllow)
    .sort((a, b) => Number(b?.score ?? 0) - Number(a?.score ?? 0));

  let submitted = 0;
  for (const sig of orderedSignals) {
    if (submitted >= maxPerScan) break;
    const score = Number(sig.score ?? 0);
    if (score < minScore || score > maxScore) continue;
    const entry = Number(sig.entry);
    const tp = Number(sig.tp);
    const sl = Number(sig.sl);
    if (![entry, tp, sl].every((v) => Number.isFinite(v) && v > 0)) continue;
    if (sl >= entry || tp <= entry) {
      console.warn(`[Ema99KillReclaimReal] skip ${sig.symbol} - invalid LONG TP/SL`);
      continue;
    }

    const symbol = normalizeSymbol(sig.symbol);
    const liqBlock = liqAutoBlockReason(symbol, 'LONG');
    if (liqBlock) {
      console.log(`[Ema99KillReclaimReal] skip ${symbol} - ${liqBlock}`);
      continue;
    }
    const dedupKey = `${symbol}|${sig.interval ?? '5m'}|EMA99_RECLAIM_LONG`;
    const last = ema99KillReclaimRealOrderFired.get(dedupKey) ?? 0;
    if (Date.now() - last < cooldownMs) continue;

    const hasPosition = positions.some((p) => p.symbol === symbol && Math.abs(Number(p.positionAmt ?? 0)) > 0);
    if (hasPosition) {
      console.log(`[Ema99KillReclaimReal] skip ${symbol} - already has position`);
      continue;
    }
    const hasEntryOrder = openOrders.some((o) => {
      if (o.symbol !== symbol) return false;
      if (String(o.reduceOnly ?? '').toLowerCase() === 'true') return false;
      const type = String(o.type ?? o.origType ?? '').toUpperCase();
      return ['MARKET', 'LIMIT', 'LIMIT_MAKER'].includes(type);
    });
    if (hasEntryOrder) {
      console.log(`[Ema99KillReclaimReal] skip ${symbol} - already has entry order`);
      continue;
    }

    try {
      const result = await placeOrder({
        symbol,
        side: 'BUY',
        orderType,
        notionalUsdt: marginUsdt * leverage,
        leverage,
        limitPrice: orderType === 'MARKET' ? undefined : entry,
        takeProfitPrice: tp,
        stopLossPrice: sl,
        maxOpenPositions,
        dryRun: false,
      }, null, { apiKey, apiSecret });

      submitted++;
      ema99KillReclaimRealOrderFired.set(dedupKey, Date.now());
      invalidateOpenOrdersCache();
      const orderId = result?.orderResult?.orderId ?? '-';
      console.log(`[Ema99KillReclaimReal] REAL ${symbol} LONG ${sig.interval ?? '5m'} ${orderType} entry=${entry} tp=${tp} sl=${sl} orderId=${orderId} margin=$${marginUsdt} score=${score}`);
    } catch (e) {
      console.warn(`[Ema99KillReclaimReal] ${sig.symbol}: ${e.message}`);
    }
  }
}

klineCache.on('candleClose', ({ interval }) => {
  if (interval === '15m') {
    scheduleStrategyScans('candleClose');
    return;
  }
  if (EMA_SQUEEZE_INTERVALS.includes(interval)) {
    scheduleEmaSqueezeScan();
  }
  if (interval === (process.env.EMA99_KILL_RECLAIM_INTERVAL || '5m')) {
    scheduleEma99KillReclaimScan();
  }
  if (interval === '5m' || interval === '15m') {
    scheduleShakeoutReclaimScan();
  }
});

// Scan theo tick (mỗi khi có cập nhật nến) với debounce 60s — bắt signal sớm hơn trong nến
let _tickScanDebounce = null;
klineCache.on('candleTick', ({ interval }) => {
  if (!EMA_SQUEEZE_INTERVALS.includes(interval)) return;
  clearTimeout(_tickScanDebounce);
  _tickScanDebounce = setTimeout(() => {
    if (interval === '15m') scheduleStrategyScans('candleTick');
    else scheduleEmaSqueezeScan();
    if (interval === (process.env.EMA99_KILL_RECLAIM_INTERVAL || '5m')) scheduleEma99KillReclaimScan();
    if (interval === '5m' || interval === '15m') scheduleShakeoutReclaimScan();
  }, 60_000);
});

// Chạy scan ngay sau 30s để có data ban đầu dù WebSocket chưa kết nối
setTimeout(() => scheduleStrategyScans('initial'), 30_000);

// Fallback: scan mỗi 2 phút kể cả khi WebSocket không có tick
let _staleReseedLock = false;
let _tieredWarmupPromise = null;
let _klineWarmupSymbols = [];
let _allowLogicBeforeKlineReady = false;
let _emaQuickWarmupDone = false;
const _warmupMaxSymbols = Number(process.env.KLINE_WARMUP_MAX_SYMBOLS) || 120; // keep REST warmup bounded
const _socketMaxSymbols = Math.max(_warmupMaxSymbols, Number(process.env.KLINE_SOCKET_MAX_SYMBOLS) || 400);
const EMA_SQUEEZE_EXCLUDE_SYMBOLS = new Set(String(process.env.EMA_SQUEEZE_EXCLUDE_SYMBOLS ?? 'BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,TONUSDT,TRXUSDT,LINKUSDT,BCHUSDT,LTCUSDT,AVAXUSDT')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean));
const EMA_SQUEEZE_MIN_QUOTE_VOLUME = Number(process.env.EMA_SQUEEZE_MIN_QUOTE_VOLUME ?? 3_000_000);
const EMA_SQUEEZE_MAX_QUOTE_VOLUME = Number(process.env.EMA_SQUEEZE_MAX_QUOTE_VOLUME ?? 150_000_000);
const EMA_SQUEEZE_WARMUP_MAX_SYMBOLS = Number(process.env.EMA_SQUEEZE_WARMUP_MAX_SYMBOLS ?? 80);
const EMA_SQUEEZE_INTERVALS = String(process.env.EMA_SQUEEZE_INTERVALS ?? '5m,15m,1h')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const KLINE_WARMUP_TIERS = [
  { max: Math.min(50,  _warmupMaxSymbols), batchSize: 1, batchDelayMs: Number(process.env.KLINE_WARMUP_BATCH_DELAY_MS ?? 8000), afterMs: 0 },
  { max: Math.min(120, _warmupMaxSymbols), batchSize: 1, batchDelayMs: Number(process.env.KLINE_WARMUP_BATCH_DELAY_MS_2 ?? 12000), afterMs: 0 },
].filter((t, i, arr) => i === 0 || t.max > arr[i - 1].max); // bỏ tiers trùng khi KLINE_WARMUP_MAX_SYMBOLS nhỏ

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function selectEmaSqueezeWarmupSymbols(snapshot) {
  if (EMA_SQUEEZE_WARMUP_MAX_SYMBOLS <= 0) return [];
  const eligible = [...snapshot]
    .filter((r) => !EMA_SQUEEZE_EXCLUDE_SYMBOLS.has(r.symbol))
    .filter((r) => Number(r.quoteVolume ?? 0) >= EMA_SQUEEZE_MIN_QUOTE_VOLUME)
    .filter((r) => Number(r.quoteVolume ?? 0) <= EMA_SQUEEZE_MAX_QUOTE_VOLUME);
  const byVolume = [...eligible]
    .sort((a, b) => Number(b.quoteVolume ?? 0) - Number(a.quoteVolume ?? 0))
    .slice(0, Math.ceil(EMA_SQUEEZE_WARMUP_MAX_SYMBOLS * 0.55));
  const byGainer = [...eligible]
    .filter((r) => Number(r.change24hPct ?? r.priceChangePercent ?? 0) > 6)
    .sort((a, b) => Number(b.change24hPct ?? b.priceChangePercent ?? 0) - Number(a.change24hPct ?? a.priceChangePercent ?? 0))
    .slice(0, EMA_SQUEEZE_WARMUP_MAX_SYMBOLS);
  const byActivity = [...eligible]
    .sort((a, b) => (
      Math.abs(Number(b.change24hPct ?? b.priceChangePercent ?? 0)) * Math.log10(Number(b.quoteVolume ?? 0) + 10)
    ) - (
      Math.abs(Number(a.change24hPct ?? a.priceChangePercent ?? 0)) * Math.log10(Number(a.quoteVolume ?? 0) + 10)
    ))
    .slice(0, Math.ceil(EMA_SQUEEZE_WARMUP_MAX_SYMBOLS * 0.45));
  return [...new Set([...byGainer, ...byActivity, ...byVolume].map((r) => r.symbol))]
    .slice(0, EMA_SQUEEZE_WARMUP_MAX_SYMBOLS);
}

function klineWarmupReady() {
  if (_allowLogicBeforeKlineReady) return true;
  if (!_emaQuickWarmupDone) return false;
  if (_klineWarmupSymbols.length === 0) return false;
  const minReady = Number(process.env.KLINE_START_LOGIC_MIN_READY ?? Math.min(_warmupMaxSymbols, _klineWarmupSymbols.length));
  const minBars = Number(process.env.KLINE_START_LOGIC_MIN_READY_BARS ?? 40);
  return klineCache.countReady(_klineWarmupSymbols, '15m', minBars) >= Math.min(minReady, _klineWarmupSymbols.length);
}

function emaSqueezeWarmupReadiness(symbols, minBars = 40) {
  const list = Array.isArray(symbols) ? symbols : [];
  const counts = Object.fromEntries(EMA_SQUEEZE_INTERVALS.map((interval) => [
    interval,
    list.length ? klineCache.countReady(list, interval, minBars) : 0,
  ]));
  const min = EMA_SQUEEZE_INTERVALS.length
    ? Math.min(...EMA_SQUEEZE_INTERVALS.map((interval) => counts[interval] ?? 0))
    : 0;
  return { counts, min };
}

function scheduleStrategyScans(reason = 'manual') {
  if (isBinanceRestCongested()) {
    binanceRateGate.pruneLowPriorityQueue?.();
    logRestCongestion('StrategyScans', reason);
    return;
  }
  if (!klineWarmupReady()) {
    const minBars = Number(process.env.KLINE_START_LOGIC_MIN_READY_BARS ?? 40);
    const ready = _klineWarmupSymbols.length ? klineCache.countReady(_klineWarmupSymbols, '15m', minBars) : 0;
    console.log(`[StrategyScans] Waiting for kline warm-up (${ready}/${_klineWarmupSymbols.length}) before ${reason}.`);
    return;
  }
  schedulePumpScan();
  scheduleCapScan();
  scheduleKillShortScan();
  scheduleDumpIgnitionScan();
  scheduleSpikeReversalScan();
  schedulePostPumpKillShortScan();
  schedulePumpIgnitionScan();
  scheduleEmaSqueezeScan();
  scheduleEma99KillReclaimScan();
  scheduleShakeoutReclaimScan();
}

function strategyScansReady(label) {
  if (klineWarmupReady()) return true;
  const minBars = Number(process.env.KLINE_START_LOGIC_MIN_READY_BARS ?? 40);
  const ready = _klineWarmupSymbols.length ? klineCache.countReady(_klineWarmupSymbols, '15m', minBars) : 0;
  console.log(`[${label}] Skip until kline warm-up ready (${ready}/${_klineWarmupSymbols.length}).`);
  return false;
}

function shouldDeferAlgoRest() {
  return _klineWarmupSymbols.length > 0 && !klineWarmupReady();
}

function runAfterKlineWarmup(label, fn, { checkMs = 15_000, timeoutMs = Number(process.env.KLINE_START_LOGIC_TIMEOUT_MS ?? 20 * 60_000) } = {}) {
  const startedAt = Date.now();
  const tick = () => {
    if (klineWarmupReady()) {
      console.log(`[Startup] ${label}: kline warm-up ready, starting.`);
      fn();
      return;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      const minBars = Number(process.env.KLINE_START_LOGIC_MIN_READY_BARS ?? 40);
      const ready = _klineWarmupSymbols.length ? klineCache.countReady(_klineWarmupSymbols, '15m', minBars) : 0;
      console.warn(`[Startup] ${label}: kline warm-up timeout (${ready}/${_klineWarmupSymbols.length}); starting anyway.`);
      _allowLogicBeforeKlineReady = true;
      fn();
      return;
    }
    setTimeout(tick, checkMs);
  };
  tick();
}

async function startTieredKlineWarmup(snapshot, reason = 'startup') {
  if (_tieredWarmupPromise) return _tieredWarmupPromise;
  _tieredWarmupPromise = (async () => {
    const sorted = [...snapshot].sort((a, b) => b.quoteVolume - a.quoteVolume);
    const maxSocketSymbols = _socketMaxSymbols;
    const socketSymbols15m = sorted.slice(0, maxSocketSymbols).map((r) => r.symbol);
    let emaWarmupSymbols = [];
    _klineWarmupSymbols = socketSymbols15m;
    _emaQuickWarmupDone = false;
    console.log(`[KlineWarmup] Tiered warm-up started (${reason}).`);
    try {
      let ma60Seeded5m = false;
      klineCache.subscribe(socketSymbols15m, '15m');
      const ma60Max5mInitial = Number(process.env.MA60_5M_WARMUP_MAX_SYMBOLS ?? 20);
      if (ma60Max5mInitial > 0) {
        klineCache.subscribe(sorted.slice(0, ma60Max5mInitial).map((r) => r.symbol), '5m');
      }
      console.log(`[KlineWarmup] WS subscribed ${socketSymbols15m.length} symbols @15m before REST seed.`);
      emaWarmupSymbols = selectEmaSqueezeWarmupSymbols(sorted);
      const emaQuickSymbols = emaWarmupSymbols.slice(0, Number(process.env.EMA_SQUEEZE_QUICK_WARMUP_SYMBOLS ?? 20));
      let emaQuickComplete = emaQuickSymbols.length === 0;
      if (emaQuickSymbols.length && !binanceRateGate.isBlocked?.() && !isBinanceRestCongested()) {
        emaQuickComplete = true;
        for (const interval of EMA_SQUEEZE_INTERVALS) {
          console.log(`[KlineWarmup] Quick seeding ${emaQuickSymbols.length} EMA-squeeze symbols @${interval}.`);
          klineCache.subscribe(emaQuickSymbols, interval);
          await klineCache.seed(emaQuickSymbols, interval, 250, {
            batchSize: 1,
            batchDelayMs: Number(process.env.EMA_SQUEEZE_QUICK_WARMUP_DELAY_MS ?? 1800),
          });
          scheduleEmaSqueezeScan();
          if (binanceRateGate.isBlocked?.() || isBinanceRestCongested()) {
            emaQuickComplete = false;
            break;
          }
        }
      }
      _emaQuickWarmupDone = emaQuickComplete;
      for (const tier of KLINE_WARMUP_TIERS) {
        if (binanceRateGate.isBlocked?.()) {
          console.warn(`[KlineWarmup] Skip tier top ${tier.max}: Binance REST blocked.`);
          break;
        }
        if (tier.afterMs > 0) await sleep(tier.afterMs);
        const symbols = sorted.slice(0, tier.max).map((r) => r.symbol);
        console.log(`[KlineWarmup] Seeding top ${tier.max} symbols @15m (${tier.batchSize} req/batch, ${tier.batchDelayMs}ms delay).`);
        await klineCache.seed(symbols, '15m', 500, {
          batchSize: tier.batchSize,
          batchDelayMs: tier.batchDelayMs,
        });
        const ma60Max5m = Number(process.env.MA60_5M_WARMUP_MAX_SYMBOLS ?? 20);
        if (!ma60Seeded5m && ma60Max5m > 0 && tier.max >= ma60Max5m && !binanceRateGate.isBlocked?.()) {
          const symbols5m = sorted.slice(0, ma60Max5m).map((r) => r.symbol);
          ma60Seeded5m = true;
          console.log(`[KlineWarmup] Seeding top ${symbols5m.length} symbols @5m for MA60 cluster.`);
          await klineCache.seed(symbols5m, '5m', 220, {
            batchSize: tier.batchSize,
            batchDelayMs: Math.max(tier.batchDelayMs, 3000),
          });
        }
      }
      const emaSymbols = emaWarmupSymbols.length ? emaWarmupSymbols : selectEmaSqueezeWarmupSymbols(sorted);
      if (emaSymbols.length && !binanceRateGate.isBlocked?.() && !isBinanceRestCongested()) {
        for (const interval of EMA_SQUEEZE_INTERVALS) {
          console.log(`[KlineWarmup] Seeding ${emaSymbols.length} EMA-squeeze small/mid symbols @${interval}.`);
          klineCache.subscribe(emaSymbols, interval);
          await klineCache.seed(emaSymbols, interval, 250, {
            batchSize: 1,
            batchDelayMs: Number(process.env.EMA_SQUEEZE_WARMUP_DELAY_MS ?? 5500),
          });
          scheduleEmaSqueezeScan();
          if (binanceRateGate.isBlocked?.() || isBinanceRestCongested()) break;
        }
      }
    } finally {
      _tieredWarmupPromise = null;
      _staleReseedLock = false;
      const minCached = Number(process.env.KLINE_WARMUP_RETRY_MIN_CACHED ?? 20);
      const minReadyBars = Number(process.env.KLINE_WARMUP_RETRY_MIN_READY_BARS ?? 40);
      const minLogicReady = Number(process.env.KLINE_START_LOGIC_MIN_READY ?? Math.min(_warmupMaxSymbols, socketSymbols15m.length));
      const retryMs = Number(process.env.KLINE_WARMUP_RETRY_MS ?? 90_000);
      const readyForScan = klineCache.countReady(socketSymbols15m, '15m', minReadyBars);
      const scanReadyTarget = Math.min(minLogicReady, socketSymbols15m.length);
      const emaReady = emaSqueezeWarmupReadiness(emaWarmupSymbols, minReadyBars);
      const emaReadyTarget = emaWarmupSymbols.length
        ? Math.min(
            Number(process.env.EMA_SQUEEZE_WARMUP_RETRY_MIN_READY ?? Math.ceil(emaWarmupSymbols.length * 0.85)),
            emaWarmupSymbols.length,
          )
        : 0;
      const emaReadyText = EMA_SQUEEZE_INTERVALS
        .map((interval) => `${interval}:${emaReady.counts[interval] ?? 0}/${emaWarmupSymbols.length}`)
        .join(' ');
      if (
        klineCache.stats('15m').cached < minCached
        || readyForScan < scanReadyTarget
        || (emaWarmupSymbols.length && emaReady.min < emaReadyTarget)
      ) {
        console.warn(`[KlineWarmup] Ready 15m ${readyForScan}/${scanReadyTarget}; EMA ${emaReadyText} (target ${emaReadyTarget}); retrying seed in ${Math.round(retryMs / 1000)}s.`);
        setTimeout(async () => {
          if (_tieredWarmupPromise) return;
          if (isBinanceRestCongested()) {
            console.warn(`[KlineWarmup] Retry postponed: REST queue congested (${binanceRateGate.snapshot?.().queue ?? '?'}).`);
            return;
          }
          startTieredKlineWarmup(snapshot, 'retry').catch((err) => {
            console.warn('[KlineWarmup] Retry failed:', err.message);
          });
        }, retryMs);
      }
    }
  })();
  return _tieredWarmupPromise;
}

function noteApiNoLargeReseed(board, processed) {
  if (processed !== 0) return;
  console.warn(`[KlineWarmup] ${board} processed=0; API will not trigger 400-symbol REST reseed. Waiting for tiered warm-up/WS cache.`);
}
setInterval(async () => {
  if (isBinanceRestCongested()) {
      binanceRateGate.pruneLowPriorityQueue?.();
      logRestCongestion('KlineCache', 'fallback scans/reseed');
      return;
  }
  schedulePumpScan();
  scheduleCapScan();
  scheduleKillShortScan();
  // Re-seed nếu WebSocket stale (không có tick trong 3 phút)
  if (process.env.KLINE_AUTO_RESEED_ENABLED !== 'true') return;
  const stats = klineCache.stats('15m');
  if (stats.isStale && !_staleReseedLock) {
    _staleReseedLock = true;
    try {
      const snapshot = await getSharedSnapshot();
      const topSymbols = [...snapshot].sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 50).map((r) => r.symbol);
      await klineCache.seed(topSymbols, '15m', 500, { batchSize: 1, batchDelayMs: 2000 });
      const ma60Max5m = Number(process.env.MA60_5M_WARMUP_MAX_SYMBOLS ?? 20);
      if (ma60Max5m > 0 && !binanceRateGate.isBlocked?.()) {
        await klineCache.seed(topSymbols.slice(0, ma60Max5m), '5m', 220, { batchSize: 1, batchDelayMs: 3000 });
      }
      console.log('[KlineCache] Small re-seed triggered (WebSocket stale, top 50 only)');
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
  emaSqueezeRealOrderEnabled: process.env.EMA_SQUEEZE_REAL_ORDER_ENABLED === 'true',
  pumpMaxLimitOrders: Number(process.env.AUTO_LIQ_MAX_LIMIT_ORDERS ?? 30),
  pumpMaxPositions: Number(process.env.AUTO_TRADE_MAX_POSITIONS ?? 0),
  pumpPaperTimeoutH: Number(process.env.PUMP_PAPER_TIMEOUT_H ?? 3), // giờ — tự cắt nếu quá thời gian và pnl ≤ 1%
  // Real Binance position timeout — đóng lệnh thật sau X giờ nếu pnl > minRoe% và chưa đạt TP
  positionTimeoutEnabled: process.env.POSITION_TIMEOUT_ENABLED === 'true',
  positionTimeoutH: Number(process.env.POSITION_TIMEOUT_H ?? 3),
  positionTimeoutMinRoe: Number(process.env.POSITION_TIMEOUT_MIN_ROE ?? 1),
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
// Symbols bị loại khỏi mọi auto position management (trailing stop, timeout, neg-TP, SL trail, avg-down)
const tslExcludedSymbols = new Set();

function sendOrderFillDiscord({ symbol, side, filledQty, avgPrice, positionSide, fillTime, source }) {
  const webhookUrl = process.env.ORDER_FILL_WEBHOOK_URL || '';
  if (!webhookUrl || source !== 'ORDER_TRADE_UPDATE') return;

  const price = Number(avgPrice);
  const qty = Number(filledQty);
  const isBuy = String(side).toUpperCase() === 'BUY';
  const embed = {
    title: `[BINANCE FILL] ${symbol} ${isBuy ? 'LONG/BUY' : 'SHORT/SELL'}`,
    color: isBuy ? 0x22c55e : 0xef4444,
    fields: [
      { name: 'Side', value: String(side ?? '-'), inline: true },
      { name: 'Qty', value: Number.isFinite(qty) ? String(qty) : String(filledQty ?? '-'), inline: true },
      { name: 'Avg Fill', value: Number.isFinite(price) ? String(price) : String(avgPrice ?? '-'), inline: true },
      { name: 'Position Side', value: String(positionSide ?? 'BOTH'), inline: true },
      { name: 'Source', value: String(source), inline: true },
      { name: 'Time', value: fillTime ? new Date(Number(fillTime)).toISOString() : new Date().toISOString(), inline: false },
    ],
    timestamp: new Date().toISOString(),
  };

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  })
    .then((res) => {
      if (!res.ok) console.warn(`[OrderFillDiscord] ${symbol} failed: ${res.status}`);
      else console.log(`[OrderFillDiscord] sent ${symbol} ${side} qty=${filledQty}`);
    })
    .catch((err) => console.warn(`[OrderFillDiscord] ${symbol}:`, err.message));
}

function startPositionSocketMonitor() {
  if (posMonitor) return posMonitor;
  posMonitor = startPositionMonitor({
    client,
    getCredentials: () => getApiCredentials(null),
    onPositionClose: (symbol) => {
      // Triggered ngay khi ACCOUNT_UPDATE báo pa=0 — không cần đợi StaleOrder poll 30s
      console.log(`[PosMonitor] 🔴 ${symbol} closed → cancelling open orders immediately`);
      signalProtectionPlans.delete(symbol);
      let creds;
      try { creds = getApiCredentials(null); } catch { return; }
      const { apiKey, apiSecret } = creds;
      cancelAllOrdersForSymbol(symbol, apiKey, apiSecret)
        .then(() => invalidateOpenOrdersCache())
        .catch((err) => console.warn(`[PosMonitor] Cancel orders ${symbol}:`, err.message));
    },
    onOrderFill: (symbol, { side, filledQty, avgPrice, positionSide, fillTime, orderStatus = null, orderId = null, source = 'UNKNOWN' }) => {
      console.log(`[SlGuard] onOrderFill ${symbol} source=${source} fillTime=${fillTime} createdAt=${slTracking.createdAt}`);
      const protectionPlan = source === 'ORDER_TRADE_UPDATE' ? signalProtectionPlans.get(symbol) : null;
      if (source !== 'REST_SYNC' || !slTracking.positions[symbol]) {
        slTracking.positions[symbol] = {
          openedAt: fillTime,
          openedAtStr: new Date(fillTime).toISOString(),
          entry: Number(avgPrice) || null,
          slPlaced: false,
          signalTp: protectionPlan?.tpPrice ?? null,
          signalSl: protectionPlan?.slPrice ?? null,
          signalSource: protectionPlan?.source ?? null,
        };
        saveSlTracking();
      }
      if (protectionPlan) {
        if (orderStatus === 'FILLED') {
          console.log(`[SignalProtection] ${symbol} full fill orderId=${orderId ?? protectionPlan.orderId ?? '-'}; applying signal TP/SL`);
          setTimeout(() => applySignalProtectionOnFill(symbol), 800);
        } else {
          console.log(`[SignalProtection] ${symbol} ${orderStatus ?? 'PARTIAL'} fill; waiting for full fill before TP/SL`);
        }
      } else {
        console.log(`[SlGuard] Registered ${symbol}, triggering fallback SL/TP guard in 1s`);
        setTimeout(() => triggerSlGuardForSymbol(symbol), 1000);
      }
      sendOrderFillDiscord({ symbol, side, filledQty, avgPrice, positionSide, fillTime, source });
      appendFillLog({ symbol, side, filledQty, avgPrice, positionSide, fillTime }).catch(() => {});
      invalidateOpenOrdersCache();
      tpConfirmedClear(symbol);
      negTpLastRun.delete(symbol);
      if (!protectionPlan && process.env.AUTO_TP_ON_FILL_ENABLED !== 'false') {
        const delayMs = Math.max(500, Number(process.env.AUTO_TP_ON_FILL_DELAY_MS ?? 2500));
        setTimeout(() => refreshTakeProfitForSymbol(symbol).catch((err) =>
          console.warn(`[AutoTP] fill refresh ${symbol}: ${err.message}`),
        ), delayMs);
      }
      // Notify TSL scanner về position mới — không phải đợi REST poll 30s
      if (tslScanner?.scheduleRun) {
        invalidatePosStore();
        tslScanner.scheduleRun(3_000);
      }
    },
    onRoeUpdate: (symbol, pos, markPrice, roe) => {
      if (!positionFirstSeenAt.has(symbol)) positionFirstSeenAt.set(symbol, Date.now());
      const skipTsl = tslExcludedSymbols.has(symbol);
      if (pendingLiqTp.has(symbol)) {
        placePendingLiqTp(symbol, pos).catch(() => {});
      }
      const tpGuardRoe = Number(process.env.TP_ENTRY_GUARD_ROE ?? -50);
      if (roe <= tpGuardRoe) {
        handleTpEntryGuard(symbol, pos, markPrice, roe).catch(() => {});
      }
      const avgDownRoe = Number(process.env.AVG_DOWN_ROE ?? -60);
      if (roe <= avgDownRoe) {
        handleAvgDown(symbol, pos, roe).catch(() => {});
      }
      if (!skipTsl) handleSlTrailByProfit(symbol, pos, roe, markPrice).catch(() => {});
      handlePositionTimeout(symbol, pos, markPrice, roe).catch(() => {});
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
  return posMonitor;
}

function isConfirmedSpikeReversalSignal(sig) {
  const status = String(sig?.stage ?? sig?.status ?? '').toLowerCase();
  return sig?.confirmed === true
    || status.includes('confirmed')
    || sig?.type === 'spike_reversal';
}

function applySpikeReversalTslExcludes(signals) {
  for (const sig of signals ?? []) {
    if (!sig?.symbol || !isConfirmedSpikeReversalSignal(sig)) continue;
    const symbol = String(sig.symbol).toUpperCase();
    if (tslExcludedSymbols.has(symbol)) continue;
    tslExcludedSymbols.add(symbol);
    console.log(`[TSL-Exclude] ⛔ ${symbol} excluded by confirmed Spike Reversal signal`);
  }
}

// Discord dedup: symbol → lastFiredAt (ms) — tránh spam cùng 1 signal
const spikeRevDiscordFired  = new Map();
const dumpIgnDiscordFired   = new Map();
const pumpIgnDiscordFired   = new Map();
const emaSqueezeDiscordFired = new Map();
const ema99KillReclaimDiscordFired = new Map();
const shakeoutReclaimDiscordFired = new Map();
const emaSqueezePaperAutoFired = new Map();
const emaSqueezeLiquidityEntryCache = new Map();
const emaSqueezeRealOrderFired = new Map();
const ema99KillReclaimRealOrderFired = new Map();
const shakeoutReclaimRealOrderFired = new Map();
const postPumpKillShortDiscordFired = new Map();
const postPumpKillShortOrderFired = new Map();
const ppksPaperAutoFired = new Map(); // dedup cho PPKS paper trade auto-fire
const postPumpDumpRiskOrderFired = new Map();
const postDumpBounceRiskOrderFired = new Map();
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
const LIQUID_PAPER_FILE = join(rootDir, 'data', 'liquid-paper-trades.json');
const FILLS_DIR = join(rootDir, 'data', 'fills');
const PUMP_ORDERS_FILE = join(rootDir, 'data', 'pump-orders.json');
const PUMP_HISTORY_FILE = join(rootDir, 'data', 'pump-order-history.json');
const PUMP_DAILY_FILE   = join(rootDir, 'data', 'pump-daily-stats.json');
const CAP_PAPER_FILE    = join(rootDir, 'data', 'cap-paper-trades.json');
const DI_PAPER_FILE     = join(rootDir, 'data', 'di-paper-trades.json');
const PI_PAPER_FILE     = join(rootDir, 'data', 'pi-paper-trades.json');
const PUMP_PAPER_FILE   = join(rootDir, 'data', 'pump-paper-trades.json');
const EDGE_PAPER_FILE   = join(rootDir, 'data', 'edge-paper-trades.json');
const SR_PAPER_FILE     = join(rootDir, 'data', 'sr-paper-trades.json');
const PPKS_PAPER_FILE   = join(rootDir, 'data', 'ppks-paper-trades.json');
const SHAKEOUT_PAPER_FILE = join(rootDir, 'data', 'shakeout-paper-trades.json');
const MARKET_NEWS_FILE  = join(rootDir, 'data', 'market-news.json');
const COIN_FLOW_FILE    = join(rootDir, 'data', 'coin-flow.json');
const TOKEN_UNLOCKS_FILE = join(rootDir, 'data', 'token-unlocks.json');

let marketNewsCache = { items: [], updatedAt: null, sources: [], error: null };
let marketNewsRefreshInflight = null;
let coinFlowCache = { rows: [], updatedAt: null, sources: [], error: null, configured: false };
let coinFlowRefreshInflight = null;
let tokenUnlocksCache = { rows: [], updatedAt: null, sources: [], error: null, configured: false, stats: {} };
let tokenUnlocksRefreshInflight = null;

async function refreshMarketNews(reason = 'manual') {
  if (marketNewsRefreshInflight) return marketNewsRefreshInflight;
  marketNewsRefreshInflight = (async () => {
    const cfg = marketNewsConfig();
    console.log(`[MarketNews] Refresh started (${reason}) feeds=${cfg.feeds.length}`);
    try {
      const payload = await fetchMarketNews(cfg);
      marketNewsCache = { ...payload, refreshReason: reason };
      await saveMarketNews(MARKET_NEWS_FILE, marketNewsCache);
      console.log(`[MarketNews] Refresh OK items=${payload.items.length}`);
      return marketNewsCache;
    } catch (err) {
      marketNewsCache = { ...marketNewsCache, error: err.message, failedAt: new Date().toISOString() };
      console.warn('[MarketNews] Refresh failed:', err.message);
      return marketNewsCache;
    } finally {
      marketNewsRefreshInflight = null;
    }
  })();
  return marketNewsRefreshInflight;
}

async function initMarketNewsBatch() {
  marketNewsCache = await loadMarketNews(MARKET_NEWS_FILE);
  const cfg = marketNewsConfig();
  const ageMs = marketNewsCache.updatedAt ? Date.now() - Date.parse(marketNewsCache.updatedAt) : Infinity;
  if (!marketNewsCache.items?.length || ageMs > cfg.refreshMs) {
    refreshMarketNews('startup').catch(() => {});
  }
  setInterval(() => refreshMarketNews('daily-batch').catch(() => {}), cfg.refreshMs).unref?.();
}

async function refreshCoinFlow(reason = 'manual') {
  if (coinFlowRefreshInflight) return coinFlowRefreshInflight;
  coinFlowRefreshInflight = (async () => {
    const cfg = coinFlowConfig();
    console.log(`[CoinFlow] Refresh started (${reason}) configured=${Boolean(cfg.apiKey)}`);
    try {
      const snapshot = await getSharedSnapshot().catch(() => []);
      const snapshotMap = new Map((Array.isArray(snapshot) ? snapshot : []).map((r) => [r.symbol, r]));
      const payload = await fetchCoinFlowBoard({ cfg, snapshotMap });
      coinFlowCache = { ...payload, refreshReason: reason };
      await saveCoinFlow(COIN_FLOW_FILE, coinFlowCache);
      console.log(`[CoinFlow] Refresh OK rows=${payload.rows.length} configured=${payload.configured}`);
      return coinFlowCache;
    } catch (err) {
      coinFlowCache = { ...coinFlowCache, error: err.message, failedAt: new Date().toISOString() };
      console.warn('[CoinFlow] Refresh failed:', err.message);
      return coinFlowCache;
    } finally {
      coinFlowRefreshInflight = null;
    }
  })();
  return coinFlowRefreshInflight;
}

async function initCoinFlowBatch() {
  coinFlowCache = await loadCoinFlow(COIN_FLOW_FILE);
  const cfg = coinFlowConfig();
  const ageMs = coinFlowCache.updatedAt ? Date.now() - Date.parse(coinFlowCache.updatedAt) : Infinity;
  if (!coinFlowCache.rows?.length || ageMs > cfg.refreshMs) {
    refreshCoinFlow('startup').catch(() => {});
  }
  setInterval(() => refreshCoinFlow('batch').catch(() => {}), cfg.refreshMs).unref?.();
}
const paperMarkCache = new Map(); // symbol → { markPrice, at }
async function refreshTokenUnlocks(reason = 'manual') {
  if (tokenUnlocksRefreshInflight) return tokenUnlocksRefreshInflight;
  tokenUnlocksRefreshInflight = (async () => {
    const cfg = tokenUnlocksConfig();
    console.log(`[TokenUnlocks] Refresh started (${reason}) configured=${Boolean(cfg.apiUrl)}`);
    try {
      const filePayload = await loadTokenUnlocks(TOKEN_UNLOCKS_FILE);
      const payload = await fetchTokenUnlocksBoard({ cfg, filePayload });
      tokenUnlocksCache = { ...payload, refreshReason: reason };
      await saveTokenUnlocks(TOKEN_UNLOCKS_FILE, tokenUnlocksCache);
      console.log(`[TokenUnlocks] Refresh OK rows=${payload.rows.length} configured=${payload.configured}`);
      return tokenUnlocksCache;
    } catch (err) {
      tokenUnlocksCache = { ...tokenUnlocksCache, error: err.message, failedAt: new Date().toISOString() };
      console.warn('[TokenUnlocks] Refresh failed:', err.message);
      return tokenUnlocksCache;
    } finally {
      tokenUnlocksRefreshInflight = null;
    }
  })();
  return tokenUnlocksRefreshInflight;
}

async function initTokenUnlocksBatch() {
  tokenUnlocksCache = await loadTokenUnlocks(TOKEN_UNLOCKS_FILE);
  const cfg = tokenUnlocksConfig();
  const ageMs = tokenUnlocksCache.updatedAt ? Date.now() - Date.parse(tokenUnlocksCache.updatedAt) : Infinity;
  if (!tokenUnlocksCache.rows?.length || ageMs > cfg.refreshMs) {
    refreshTokenUnlocks('startup').catch(() => {});
  }
  setInterval(() => refreshTokenUnlocks('daily-batch').catch(() => {}), cfg.refreshMs).unref?.();
}

let paperTicker = null;
let liquidPaperRestPoller = null;
const paperFillLocks = new Set();
const liquidPaperFillLocks = new Set();
const capMarkCache = new Map();  // symbol → markPrice  (for cap paper trades)
let capPaperTicker = null;
let capPaperBatchRunning = false;
const capPaperFillLocks = new Set();
const diMarkCache = new Map();   // symbol → markPrice  (for di paper trades)
let diPaperTicker = null;
const diPaperFillLocks = new Set();
const piMarkCache = new Map();   // symbol → markPrice  (for pi paper trades)
let piPaperTicker = null;
const piPaperFillLocks = new Set();
const pumpMarkCache = new Map(); // symbol → markPrice (for pump paper trades)
const emaSqueezeSocketMarks = new Map();
const emaSqueezeSocketMarkAt = new Map();
const emaSqueezePendingProcess = new Map();
let emaSqueezePaperTicker = null;
let emaSqueezeProcessTimer = null;
let emaSqueezeProcessRunning = false;
let pumpPaperTicker = null;
let pumpPaperBatchRunning = false;
const pumpPaperFillLocks = new Set();
const pumpPaperPeakRoe = new Map(); // tradeId -> peak ROE
const emaSqueezePaperPeakRoe = new Map(); // tradeId -> peak ROE
const shakeoutPaperPeakRoe = new Map(); // tradeId -> peak ROE
const edgeMarkCache = new Map(); // symbol -> markPrice (for edge paper trades)
let edgePaperTicker = null;
let edgePaperBatchRunning = false;
const edgePaperFillLocks = new Set();
const srMarkCache = new Map();  // symbol → markPrice  (for spike reversal paper trades)
let srPaperTicker = null;
const srPaperFillLocks = new Set();
const ppksMarkCache = new Map(); // symbol → markPrice  (for ppks paper trades)
let ppksPaperTicker = null;
const ppksPaperFillLocks = new Set();
const shakeoutSocketMarks = new Map(); // symbol -> latest mark received directly from WS
const shakeoutSocketMarkAt = new Map(); // symbol -> WS receive timestamp
const shakeoutPaperPendingProcess = new Map(); // symbol -> latest socket price awaiting paper evaluation
let shakeoutPaperProcessTimer = null;
let shakeoutPaperProcessRunning = false;
let shakeoutPaperTicker = null;
const shakeoutPaperFillLocks = new Set();
const shakeoutPaperAutoFired = new Map();

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
    await atomicWriteJson(SL_TRACKING_FILE, slTracking);
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

    if (requestUrl.pathname === '/api/market-news') {
      const cfg = marketNewsConfig();
      await sendJson(response, {
        ...marketNewsCache,
        refreshing: Boolean(marketNewsRefreshInflight),
        config: { refreshMs: cfg.refreshMs, limit: cfg.limit },
      });
      return;
    }

    if (requestUrl.pathname === '/api/market-news/refresh' && request.method === 'POST') {
      await sendJson(response, await refreshMarketNews('manual'));
      return;
    }

    if (requestUrl.pathname === '/api/coin-flow') {
      const cfg = coinFlowConfig();
      await sendJson(response, {
        ...coinFlowCache,
        refreshing: Boolean(coinFlowRefreshInflight),
        config: {
          refreshMs: cfg.refreshMs,
          perPage: cfg.perPage,
          configured: Boolean(cfg.apiKey),
        },
      });
      return;
    }

    if (requestUrl.pathname === '/api/coin-flow/refresh' && request.method === 'POST') {
      await sendJson(response, await refreshCoinFlow('manual'));
      return;
    }

    if (requestUrl.pathname === '/api/token-unlocks') {
      const cfg = tokenUnlocksConfig();
      await sendJson(response, {
        ...tokenUnlocksCache,
        refreshing: Boolean(tokenUnlocksRefreshInflight),
        config: {
          refreshMs: cfg.refreshMs,
          horizonDays: cfg.horizonDays,
          configured: Boolean(cfg.apiUrl),
        },
      });
      return;
    }

    if (requestUrl.pathname === '/api/token-unlocks/refresh' && request.method === 'POST') {
      await sendJson(response, await refreshTokenUnlocks('manual'));
      return;
    }

    if (requestUrl.pathname === '/api/liquid-scan') {
      const interval = ['5m', '15m', '30m', '1h', '4h'].includes(requestUrl.searchParams.get('interval'))
        ? requestUrl.searchParams.get('interval')
        : '15m';
      const limit = Math.max(10, Math.min(200, Number(requestUrl.searchParams.get('limit') ?? 200)));
      const minVolumeUsdt = Math.max(0, Number(requestUrl.searchParams.get('minVolumeUsdt') ?? 0));
      const key = `${interval}|${limit}|${minVolumeUsdt}`;
      if (liquidScanCache.data && liquidScanCache.key === key && Date.now() < liquidScanCache.expiresAt) {
        await sendJson(response, liquidScanCache.data);
        return;
      }

      const result = await runLiquidScan({ interval, limit, minVolumeUsdt });
      liquidScanCache.data = result;
      liquidScanCache.key = key;
      liquidScanCache.expiresAt = Date.now() + 30_000;
      await sendJson(response, result);
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
      const stale = isBinanceRestCongested() ? staleScanPayload(pumpScanCache) : null;
      if (stale) return sendJson(response, stale);
      const snapshot    = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols  = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runPumpScan(topSymbols, klineCache, snapshotMap);
      // Cache trống → seed ngay, scan lại sau 15s
      if (processed === 0) noteApiNoLargeReseed('pump', processed);
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
      const snapshot = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runCapScan(topSymbols, klineCache, snapshotMap);
      if (processed === 0) noteApiNoLargeReseed('cap', processed);
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
      const snapshot = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runKillShortScan(topSymbols, klineCache, snapshotMap);
      if (processed === 0) noteApiNoLargeReseed('killshort', processed);
      const cacheStats = klineCache.stats('15m');
      const result = { signals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      killShortScanCache.data = result;
      killShortScanCache.expiresAt = Date.now() + 30_000;
      return sendJson(response, result);
    }

    if (requestUrl.pathname === '/api/dump-ignition-stream') {
      response.writeHead(200, {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.write(': connected\n\n');
      if (dumpIgnitionScanCache.data && (dumpIgnitionScanCache.data.signals?.length > 0 || dumpIgnitionScanCache.data.processed > 0)) {
        response.write(`data: ${JSON.stringify(dumpIgnitionScanCache.data)}\n\n`);
      }
      dumpIgnitionSseClients.add(response);
      request.on('close', () => dumpIgnitionSseClients.delete(response));
      if (!dumpIgnitionScanCache.data || Date.now() > dumpIgnitionScanCache.expiresAt) {
        scheduleDumpIgnitionScan();
      }
      return;
    }

    if (requestUrl.pathname === '/api/dump-ignition-signals') {
      if (dumpIgnitionScanCache.data && Date.now() < dumpIgnitionScanCache.expiresAt) {
        applyPostPumpDumpRiskTslExcludes(dumpIgnitionScanCache.data.signals ?? []);
        applyPostDumpBounceRiskTslExcludes(dumpIgnitionScanCache.data.signals ?? []);
        for (const sig of dumpIgnitionScanCache.data.signals ?? []) {
          sendPostPumpDumpRiskDiscord(sig);
          sendPostDumpBounceRiskDiscord(sig);
          handlePostPumpDumpRiskRealOrder(sig).catch((e) => {
            console.warn(`[PostPumpDumpRiskOrder] ${sig.symbol}:`, e.message);
          });
          handlePostDumpBounceRiskRealOrder(sig).catch((e) => {
            console.warn(`[PostDumpBounceRiskOrder] ${sig.symbol}:`, e.message);
          });
        }
        await autoCreateDiPaperTrades(dumpIgnitionScanCache.data.signals ?? []);
        return sendJson(response, dumpIgnitionScanCache.data);
      }
      const snapshot = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runDumpIgnitionScan(topSymbols, klineCache, snapshotMap);
      if (processed === 0) noteApiNoLargeReseed('dump-ignition', processed);
      const cacheStats = klineCache.stats('15m');
      const result = { signals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      dumpIgnitionScanCache.data = result;
      dumpIgnitionScanCache.expiresAt = Date.now() + 30_000;
      applyPostPumpDumpRiskTslExcludes(signals);
      applyPostDumpBounceRiskTslExcludes(signals);
      for (const sig of signals) {
        sendPostPumpDumpRiskDiscord(sig);
        sendPostDumpBounceRiskDiscord(sig);
        handlePostPumpDumpRiskRealOrder(sig).catch((e) => {
          console.warn(`[PostPumpDumpRiskOrder] ${sig.symbol}:`, e.message);
        });
        handlePostDumpBounceRiskRealOrder(sig).catch((e) => {
          console.warn(`[PostDumpBounceRiskOrder] ${sig.symbol}:`, e.message);
        });
      }
      await autoCreateDiPaperTrades(signals);
      return sendJson(response, result);
    }

    if (requestUrl.pathname === '/api/etf-proxy') {
      const result = await getEtfProxy({ client });
      return sendJson(response, result);
    }

    if (requestUrl.pathname === '/api/spike-reversal-stream') {
      response.writeHead(200, {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.write(': connected\n\n');
      if (spikeReversalScanCache.data && (spikeReversalScanCache.data.signals?.length > 0 || spikeReversalScanCache.data.processed > 0)) {
        response.write(`data: ${JSON.stringify(spikeReversalScanCache.data)}\n\n`);
      }
      spikeReversalSseClients.add(response);
      request.on('close', () => spikeReversalSseClients.delete(response));
      if (!spikeReversalScanCache.data || Date.now() > spikeReversalScanCache.expiresAt) {
        scheduleSpikeReversalScan();
      }
      return;
    }

    if (requestUrl.pathname === '/api/spike-reversal-signals') {
      if (spikeReversalScanCache.data && Date.now() < spikeReversalScanCache.expiresAt) {
        return sendJson(response, spikeReversalScanCache.data);
      }
      const snapshot = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runSpikeReversalScan(topSymbols, klineCache, snapshotMap);
      applySpikeReversalTslExcludes(signals);
      if (processed === 0) noteApiNoLargeReseed('spike-reversal', processed);
      const cacheStats = klineCache.stats('15m');
      const result = { signals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      spikeReversalScanCache.data = result;
      spikeReversalScanCache.expiresAt = Date.now() + 30_000;
      return sendJson(response, result);
    }

    if (requestUrl.pathname === '/api/post-pump-kill-short-stream') {
      response.writeHead(200, {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.write(': connected\n\n');
      if (postPumpKillShortScanCache.data && (postPumpKillShortScanCache.data.signals?.length > 0 || postPumpKillShortScanCache.data.processed > 0)) {
        response.write(`data: ${JSON.stringify(postPumpKillShortScanCache.data)}\n\n`);
      }
      postPumpKillShortSseClients.add(response);
      request.on('close', () => postPumpKillShortSseClients.delete(response));
      if (!postPumpKillShortScanCache.data || Date.now() > postPumpKillShortScanCache.expiresAt) {
        schedulePostPumpKillShortScan();
      }
      return;
    }

    if (requestUrl.pathname === '/api/post-pump-kill-short-signals') {
      const testSymbol = requestUrl.searchParams.get('symbol');
      if (testSymbol) {
        const symbol = normalizeSymbol(testSymbol);
        const klines = await client.getKlines(symbol, '15m', 220);
        const detections = [
          detectPostPumpKillShort(klines),
          detectPostDumpKillLong(klines),
        ].filter((det) => det.pass);
        const snapshot = await getSharedSnapshot().catch(() => []);
        const snap = snapshot.find((r) => r.symbol === symbol);
        const signals = detections.map((det) => ({
          symbol,
          action: det.action,
          type: det.type,
          stage: det.stage,
          score: det.score,
          grade: det.grade,
          entry: det.entry,
          altEntry: det.altEntry,
          sl: det.sl,
          tp: det.tp,
          reason: det.reason,
          note: det.note,
          factors: det.factors,
          blockLong: det.stage === 'confirmed_short',
          blockShort: det.stage === 'confirmed_long',
          markPrice: snap?.markPrice,
          change24h: snap?.change24hPct,
          volume: snap?.quoteVolume,
          scannedAt: Date.now(),
        }));
        return sendJson(response, {
          signals,
          scannedAt: Date.now(),
          total: 1,
          processed: 1,
          testSymbol: symbol,
          noSignalReason: signals.length ? null : 'no post-pump short or post-dump long pattern',
          cacheStats: klineCache.stats('15m'),
        });
      }
      if (postPumpKillShortScanCache.data && Date.now() < postPumpKillShortScanCache.expiresAt) {
        return sendJson(response, postPumpKillShortScanCache.data);
      }
      const snapshot = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runPostPumpKillShortScan(topSymbols, klineCache, snapshotMap);
      if (processed === 0) noteApiNoLargeReseed('post-pump-kill-short', processed);
      const cacheStats = klineCache.stats('15m');
      const result = { signals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      postPumpKillShortScanCache.data = result;
      postPumpKillShortScanCache.expiresAt = Date.now() + 30_000;
      return sendJson(response, result);
    }

    if (requestUrl.pathname === '/api/pump-ignition-stream') {
      response.writeHead(200, {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.write(': connected\n\n');
      if (pumpIgnitionScanCache.data && (pumpIgnitionScanCache.data.signals?.length > 0 || pumpIgnitionScanCache.data.processed > 0)) {
        response.write(`data: ${JSON.stringify(pumpIgnitionScanCache.data)}\n\n`);
      }
      pumpIgnitionSseClients.add(response);
      request.on('close', () => pumpIgnitionSseClients.delete(response));
      if (!pumpIgnitionScanCache.data || Date.now() > pumpIgnitionScanCache.expiresAt) {
        schedulePumpIgnitionScan();
      }
      return;
    }

    if (requestUrl.pathname === '/api/pump-ignition-signals') {
      if (pumpIgnitionScanCache.data && Date.now() < pumpIgnitionScanCache.expiresAt) {
        await autoCreatePiPaperTrades(pumpIgnitionScanCache.data.signals ?? []);
        return sendJson(response, pumpIgnitionScanCache.data);
      }
      const snapshot = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const btcBias = btcHealthCache.data?.bias ?? 'neutral';
      const { signals, processed } = await runPumpIgnitionScan(topSymbols, klineCache, snapshotMap, { btcBias });
      if (processed === 0) noteApiNoLargeReseed('pump-ignition', processed);
      const cacheStats = klineCache.stats('15m');
      const result = { signals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      pumpIgnitionScanCache.data = result;
      pumpIgnitionScanCache.expiresAt = Date.now() + 30_000;
      await autoCreatePiPaperTrades(signals);
      return sendJson(response, result);
    }

    if (requestUrl.pathname === '/api/ema-squeeze-stream') {
      response.writeHead(200, {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.write(': connected\n\n');
      if (emaSqueezesScanCache.data && (emaSqueezesScanCache.data.signals?.length > 0 || emaSqueezesScanCache.data.processed > 0)) {
        response.write(`data: ${JSON.stringify(emaSqueezesScanCache.data)}\n\n`);
      }
      emaSqueezeSseClients.add(response);
      request.on('close', () => emaSqueezeSseClients.delete(response));
      if (!emaSqueezesScanCache.data || Date.now() > emaSqueezesScanCache.expiresAt) {
        scheduleEmaSqueezeScan();
      }
      return;
    }

    if (requestUrl.pathname === '/api/ema-squeeze-signals') {
      if (emaSqueezesScanCache.data && Date.now() < emaSqueezesScanCache.expiresAt) {
        return sendJson(response, emaSqueezesScanCache.data);
      }
      const stale = isBinanceRestCongested() ? staleScanPayload(emaSqueezesScanCache) : null;
      if (stale) return sendJson(response, stale);
      if (binanceRateGate.isBlocked?.() && !_snapshotCache) {
        return sendJson(response, {
          signals: [],
          scannedAt: Date.now(),
          total: 0,
          processed: 0,
          blocked: true,
          staleReason: 'binance-rest-blocked-no-snapshot',
          gate: binanceRateGate.snapshot?.() ?? null,
          cacheStats: Object.fromEntries(EMA_SQUEEZE_INTERVALS.map((interval) => [interval, klineCache.stats(interval)])),
        });
      }
      const snapshot    = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols  = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 400)
        .map((r) => r.symbol);
      const { signals, processed } = await runEmaSqueezeScan(topSymbols, klineCache, snapshotMap, { intervals: EMA_SQUEEZE_INTERVALS.join(',') });
      if (processed === 0) noteApiNoLargeReseed('ema-squeeze', processed);
      const cacheStats = Object.fromEntries(EMA_SQUEEZE_INTERVALS.map((interval) => [interval, klineCache.stats(interval)]));
      await Promise.all([getBtcHealth(), getGoldHealth()]).catch(() => {});
      const enrichedSignals = annotateEmaSqueezeRealOrderStatus(await enrichEmaSqueezeSignalsWithLiquidityEntries(signals));
      const result = { signals: enrichedSignals, scannedAt: Date.now(), total: topSymbols.length, processed, cacheStats };
      emaSqueezesScanCache.data = result;
      emaSqueezesScanCache.expiresAt = Date.now() + 30_000;
      await sendEmaSqueezeDiscord(signals);
      await createEmaSqueezePaperTrades(signals);
      await handleEmaSqueezeRealLongOrders(signals);
      return sendJson(response, result);
    }

    if (requestUrl.pathname === '/api/ema99-kill-reclaim-stream') {
      response.writeHead(200, {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.write(': connected\n\n');
      if (ema99KillReclaimScanCache.data && (ema99KillReclaimScanCache.data.signals?.length > 0 || ema99KillReclaimScanCache.data.processed > 0)) {
        response.write(`data: ${JSON.stringify(ema99KillReclaimScanCache.data)}\n\n`);
      }
      ema99KillReclaimSseClients.add(response);
      request.on('close', () => ema99KillReclaimSseClients.delete(response));
      if (!ema99KillReclaimScanCache.data || Date.now() > ema99KillReclaimScanCache.expiresAt) {
        scheduleEma99KillReclaimScan();
      }
      return;
    }

    if (requestUrl.pathname === '/api/ema99-kill-reclaim-signals') {
      if (ema99KillReclaimScanCache.data && Date.now() < ema99KillReclaimScanCache.expiresAt) {
        return sendJson(response, ema99KillReclaimScanCache.data);
      }
      const stale = isBinanceRestCongested() ? staleScanPayload(ema99KillReclaimScanCache) : null;
      if (stale) return sendJson(response, stale);
      if (binanceRateGate.isBlocked?.() && !_snapshotCache) {
        return sendJson(response, {
          signals: [],
          scannedAt: Date.now(),
          total: 0,
          processed: 0,
          blocked: true,
          staleReason: 'binance-rest-blocked-no-snapshot',
          gate: binanceRateGate.snapshot?.() ?? null,
          cacheStats: klineCache.stats(process.env.EMA99_KILL_RECLAIM_INTERVAL || '5m'),
        });
      }
      const snapshot = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols = snapshot
        .sort((a, b) => Number(b.quoteVolume ?? 0) - Number(a.quoteVolume ?? 0))
        .slice(0, Number(process.env.EMA99_KILL_RECLAIM_MAX_SYMBOLS ?? 400))
        .map((r) => r.symbol);
      const { signals, processed } = await runEma99KillReclaimScan(topSymbols, klineCache, snapshotMap, {
        interval: process.env.EMA99_KILL_RECLAIM_INTERVAL || '5m',
      });
      if (processed === 0) noteApiNoLargeReseed('ema99-kill-reclaim', processed);
      const result = {
        signals,
        scannedAt: Date.now(),
        total: topSymbols.length,
        processed,
        cacheStats: klineCache.stats(process.env.EMA99_KILL_RECLAIM_INTERVAL || '5m'),
      };
      ema99KillReclaimScanCache.data = result;
      ema99KillReclaimScanCache.expiresAt = Date.now() + 30_000;
      await sendEma99KillReclaimDiscord(signals);
      await handleEma99KillReclaimRealLongOrders(signals);
      return sendJson(response, result);
    }

    if (requestUrl.pathname === '/api/shakeout-reclaim-stream') {
      response.writeHead(200, {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.write(': connected\n\n');
      if (shakeoutReclaimScanCache.data && (shakeoutReclaimScanCache.data.signals?.length > 0 || shakeoutReclaimScanCache.data.processed > 0)) {
        response.write(`data: ${JSON.stringify(shakeoutReclaimScanCache.data)}\n\n`);
      }
      shakeoutReclaimSseClients.add(response);
      request.on('close', () => shakeoutReclaimSseClients.delete(response));
      if (!shakeoutReclaimScanCache.data || Date.now() > shakeoutReclaimScanCache.expiresAt) {
        scheduleShakeoutReclaimScan();
      }
      return;
    }

    if (requestUrl.pathname === '/api/shakeout-reclaim-signals') {
      if (shakeoutReclaimScanCache.data && Date.now() < shakeoutReclaimScanCache.expiresAt) {
        return sendJson(response, shakeoutReclaimScanCache.data);
      }
      const stale = isBinanceRestCongested() ? staleScanPayload(shakeoutReclaimScanCache) : null;
      if (stale) return sendJson(response, stale);
      if (binanceRateGate.isBlocked?.() && !_snapshotCache) {
        return sendJson(response, {
          signals: [],
          scannedAt: Date.now(),
          total: 0,
          processed: 0,
          blocked: true,
          staleReason: 'binance-rest-blocked-no-snapshot',
          gate: binanceRateGate.snapshot?.() ?? null,
          cacheStats: { m5: klineCache.stats('5m'), m15: klineCache.stats('15m') },
        });
      }
      const snapshot = await getSharedSnapshot();
      const snapshotMap = new Map(snapshot.map((r) => [r.symbol, r]));
      const topSymbols = snapshot
        .sort((a, b) => Number(b.quoteVolume ?? 0) - Number(a.quoteVolume ?? 0))
        .slice(0, Number(process.env.SHAKEOUT_RECLAIM_MAX_SYMBOLS ?? 9999))
        .map((r) => r.symbol);
      const { signals, processed, diagnostics } = await runShakeoutReclaimScan(topSymbols, klineCache, snapshotMap);
      if (processed < Number(process.env.SHAKEOUT_RECLAIM_MIN_READY ?? 9999)) ensureShakeoutReclaimWarmup(topSymbols);
      if (processed === 0) noteApiNoLargeReseed('shakeout-reclaim', processed);
      const result = {
        signals,
        scannedAt: Date.now(),
        total: topSymbols.length,
        processed,
        diagnostics,
        cacheStats: { m5: klineCache.stats('5m'), m15: klineCache.stats('15m') },
      };
      shakeoutReclaimScanCache.data = result;
      shakeoutReclaimScanCache.expiresAt = Date.now() + 30_000;
      await sendShakeoutReclaimDiscord(signals);
      await createShakeoutPaperTrades(signals);
      await handleShakeoutReclaimRealOrders(signals);
      return sendJson(response, result);
    }

    if (requestUrl.pathname === '/api/btc-health') {
      await sendJson(response, await getBtcHealth());
      return;
    }

    if (requestUrl.pathname === '/api/binance-rate-gate') {
      await sendJson(response, {
        gate: binanceRateGate.snapshot(),
        analyzeGate: analyzeRateGate.snapshot(),
        kline5m: klineCache.stats('5m'),
        kline15m: klineCache.stats('15m'),
        kline1h: klineCache.stats('1h'),
        scannedAt: Date.now(),
      });
      return;
    }

    if (requestUrl.pathname === '/api/rate-gate/reset' && request.method === 'POST') {
      binanceRateGate.resetBlock();
      analyzeRateGate.resetBlock();
      console.warn('[Server] Rate gate blocks reset by admin request');
      await sendJson(response, { ok: true, gate: binanceRateGate.snapshot(), analyzeGate: analyzeRateGate.snapshot() });
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
      const symbol    = normalizeSymbol(requestUrl.searchParams.get('symbol') ?? 'BTCUSDT');
      const interval  = requestUrl.searchParams.get('interval') ?? '15m';
      const rangePct  = Number(requestUrl.searchParams.get('rangePct')  ?? 0.04);
      const binSizePct = Number(requestUrl.searchParams.get('binSizePct') ?? 0.001);
      const liquidationLimit = Number(requestUrl.searchParams.get('liquidationLimit') ?? process.env.LIQ_HEATMAP_LOOKBACK_LIMIT ?? 720);
      const cacheKey  = `${symbol}|${interval}|${rangePct}|${binSizePct}|liq${liquidationLimit}`;
      const cached    = analyzeCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        await sendJson(response, cached.data);
        return;
      }
      const analysis = await fetchAnalysis({
        client: analyzeClient, // rate gate riêng, không bị block bởi background scans
        symbol,
        interval,
        limit:      Number(requestUrl.searchParams.get('limit') ?? 192),
        liquidationLimit,
        rangePct,
        binSizePct,
        depthLimit: Number(requestUrl.searchParams.get('depthLimit') ?? 100),
      });
      analysis.tokenUnlock = getUnlockSummaryForSymbol(tokenUnlocksCache, symbol);
      analyzeCache.set(cacheKey, { data: analysis, expiresAt: Date.now() + ANALYZE_CACHE_TTL_MS });
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
        const body = await readJsonBody(request);
        await sendJson(response, await createPaperTrade(await refineEmaSqueezePaperPayload(body)));
        return;
      }
    }

    if (requestUrl.pathname === '/api/liquid-paper-trades') {
      if (request.method === 'GET') {
        await sendJson(response, await getLiquidPaperTrades());
        return;
      }
      if (request.method === 'POST') {
        await sendJson(response, await createLiquidPaperTrade(await readJsonBody(request)));
        return;
      }
    }

    if (requestUrl.pathname === '/api/liquid-paper-trades-stream') {
      response.writeHead(200, {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.write(': connected\n\n');
      liquidPaperSseClients.add(response);
      request.on('close', () => liquidPaperSseClients.delete(response));
      getLiquidPaperTrades()
        .then((data) => {
          if (!response.destroyed) response.write(`data: ${JSON.stringify(data)}\n\n`);
        })
        .catch((err) => {
          if (!response.destroyed) response.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        });
      return;
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

    if (requestUrl.pathname === '/api/di-paper-trades') {
      if (request.method === 'GET') {
        await sendJson(response, await getDiPaperTrades());
        return;
      }
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        const trade = await createDiPaperTrade({ ...body, status: 'PENDING' });
        syncDiPaperTicker().catch(() => {});
        await sendJson(response, trade);
        return;
      }
    }
    if (requestUrl.pathname === '/api/di-paper-trades/close' && request.method === 'POST') {
      await sendJson(response, await closeDiPaperTrade(await readJsonBody(request)));
      return;
    }
    if (requestUrl.pathname === '/api/di-paper-trades/delete' && request.method === 'POST') {
      await sendJson(response, await deleteDiPaperTrade(await readJsonBody(request)));
      return;
    }

    if (requestUrl.pathname === '/api/sr-paper-trades') {
      if (request.method === 'GET') {
        await sendJson(response, await getSrPaperTrades());
        return;
      }
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        const trade = await createSrPaperTrade({ ...body, status: 'PENDING' });
        syncSrPaperTicker().catch(() => {});
        await sendJson(response, trade);
        return;
      }
    }
    if (requestUrl.pathname === '/api/sr-paper-trades/close' && request.method === 'POST') {
      await sendJson(response, await closeSrPaperTrade(await readJsonBody(request)));
      return;
    }
    if (requestUrl.pathname === '/api/sr-paper-trades/delete' && request.method === 'POST') {
      await sendJson(response, await deleteSrPaperTrade(await readJsonBody(request)));
      return;
    }

    if (requestUrl.pathname === '/api/ppks-paper-trades') {
      if (request.method === 'GET') {
        await sendJson(response, await getPpksPaperTrades());
        return;
      }
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        const trade = await createPpksPaperTrade({ ...body, status: 'PENDING' });
        syncPpksPaperTicker().catch(() => {});
        await sendJson(response, trade);
        return;
      }
    }
    if (requestUrl.pathname === '/api/ppks-paper-trades/close' && request.method === 'POST') {
      await sendJson(response, await closePpksPaperTrade(await readJsonBody(request)));
      return;
    }
    if (requestUrl.pathname === '/api/ppks-paper-trades/delete' && request.method === 'POST') {
      await sendJson(response, await deletePpksPaperTrade(await readJsonBody(request)));
      return;
    }

    if (requestUrl.pathname === '/api/shakeout-paper-trades-stream') {
      response.writeHead(200, {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.write(': connected\n\n');
      shakeoutPaperSseClients.add(response);
      request.on('close', () => shakeoutPaperSseClients.delete(response));
      getShakeoutPaperTrades()
        .then((data) => {
          if (!response.destroyed) response.write(`data: ${JSON.stringify(data)}\n\n`);
        })
        .catch((err) => {
          if (!response.destroyed) response.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        });
      return;
    }

    if (requestUrl.pathname === '/api/shakeout-paper-trades') {
      if (request.method === 'GET') {
        await sendJson(response, await getShakeoutPaperTrades());
        return;
      }
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        const trade = await createShakeoutPaperTrade({ ...body, status: body.status ?? 'OPEN' });
        await sendJson(response, trade);
        return;
      }
    }
    if (requestUrl.pathname === '/api/shakeout-paper-trades/close' && request.method === 'POST') {
      await sendJson(response, await closeShakeoutPaperTrade(await readJsonBody(request)));
      return;
    }
    if (requestUrl.pathname === '/api/shakeout-paper-trades/delete' && request.method === 'POST') {
      await sendJson(response, await deleteShakeoutPaperTrade(await readJsonBody(request)));
      return;
    }

    if (requestUrl.pathname === '/api/pi-paper-trades') {
      if (request.method === 'GET') {
        await sendJson(response, await getPiPaperTrades());
        return;
      }
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        const trade = await createPiPaperTrade({ ...body, status: 'PENDING' });
        syncPiPaperTicker().catch(() => {});
        await sendJson(response, trade);
        return;
      }
    }
    if (requestUrl.pathname === '/api/pi-paper-trades/close' && request.method === 'POST') {
      await sendJson(response, await closePiPaperTrade(await readJsonBody(request)));
      return;
    }
    if (requestUrl.pathname === '/api/pi-paper-trades/delete' && request.method === 'POST') {
      await sendJson(response, await deletePiPaperTrade(await readJsonBody(request)));
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
    if (requestUrl.pathname === '/api/ema-squeeze-paper-trades-stream') {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      response.write(': connected\n\n');
      emaSqueezePaperSseClients.add(response);
      request.on('close', () => emaSqueezePaperSseClients.delete(response));
      scheduleEmaSqueezePaperBroadcast(50);
      return;
    }
    if (requestUrl.pathname === '/api/pump-paper-trades/close' && request.method === 'POST') {
      await sendJson(response, await closePumpPaperTrade(await readJsonBody(request)));
      return;
    }
    if (requestUrl.pathname === '/api/pump-paper-trades/delete' && request.method === 'POST') {
      await sendJson(response, await deletePumpPaperTrade(await readJsonBody(request)));
      return;
    }

    if (requestUrl.pathname === '/api/edge-paper-trades') {
      if (request.method === 'GET') {
        await sendJson(response, await getEdgePaperTrades());
        return;
      }
      if (request.method === 'POST') {
        const payload = await readJsonBody(request);
        await sendJson(response, await createEdgePaperTrade(payload));
        return;
      }
    }
    if (requestUrl.pathname === '/api/edge-paper-trades/close' && request.method === 'POST') {
      await sendJson(response, await closeEdgePaperTrade(await readJsonBody(request)));
      return;
    }
    if (requestUrl.pathname === '/api/edge-paper-trades/delete' && request.method === 'POST') {
      await sendJson(response, await deleteEdgePaperTrade(await readJsonBody(request)));
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

    if (requestUrl.pathname === '/api/ema-squeeze-auto-order-enabled') {
      if (request.method === 'GET') {
        await sendJson(response, {
          enabled: runtimeSettings.emaSqueezeRealOrderEnabled && process.env.EMA_SQUEEZE_REAL_ORDER_ENABLED === 'true',
          envEnabled: process.env.EMA_SQUEEZE_REAL_ORDER_ENABLED === 'true',
          runtimeEnabled: runtimeSettings.emaSqueezeRealOrderEnabled,
        });
        return;
      }
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        if (typeof body.enabled === 'boolean') runtimeSettings.emaSqueezeRealOrderEnabled = body.enabled;
        console.log(`[EmaSqueezeReal] ${runtimeSettings.emaSqueezeRealOrderEnabled ? 'Bật' : 'Tắt'} auto Binance từ board`);
        await sendJson(response, {
          enabled: runtimeSettings.emaSqueezeRealOrderEnabled && process.env.EMA_SQUEEZE_REAL_ORDER_ENABLED === 'true',
          envEnabled: process.env.EMA_SQUEEZE_REAL_ORDER_ENABLED === 'true',
          runtimeEnabled: runtimeSettings.emaSqueezeRealOrderEnabled,
        });
        return;
      }
    }

    if (requestUrl.pathname === '/api/pump-paper-timeout') {
      if (request.method === 'GET') {
        await sendJson(response, { timeoutH: runtimeSettings.pumpPaperTimeoutH });
        return;
      }
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        const h = Number(body.timeoutH);
        if (Number.isFinite(h) && h >= 0.5) runtimeSettings.pumpPaperTimeoutH = h;
        console.log(`[PumpPaper] Timeout cập nhật: ${runtimeSettings.pumpPaperTimeoutH}h`);
        await sendJson(response, { timeoutH: runtimeSettings.pumpPaperTimeoutH });
        return;
      }
    }

    if (requestUrl.pathname === '/api/position-timeout') {
      if (request.method === 'GET') {
        await sendJson(response, {
          enabled: runtimeSettings.positionTimeoutEnabled,
          timeoutH: runtimeSettings.positionTimeoutH,
          minRoe: runtimeSettings.positionTimeoutMinRoe,
        });
        return;
      }
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        if (typeof body.enabled === 'boolean') runtimeSettings.positionTimeoutEnabled = body.enabled;
        if (Number.isFinite(Number(body.timeoutH)) && Number(body.timeoutH) >= 0.5) runtimeSettings.positionTimeoutH = Number(body.timeoutH);
        if (Number.isFinite(Number(body.minRoe)) && Number(body.minRoe) >= 0) runtimeSettings.positionTimeoutMinRoe = Number(body.minRoe);
        console.log(`[PosTimeout] ${runtimeSettings.positionTimeoutEnabled ? '✅ Bật' : '⏸ Tắt'} timeout=${runtimeSettings.positionTimeoutH}h minRoe=${runtimeSettings.positionTimeoutMinRoe}%`);
        await sendJson(response, {
          enabled: runtimeSettings.positionTimeoutEnabled,
          timeoutH: runtimeSettings.positionTimeoutH,
          minRoe: runtimeSettings.positionTimeoutMinRoe,
        });
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
      const { symbol, action, entry, sl, tp, score, margin: bodyMargin, type: bodyType, forceMarket } = body;
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

        // forceMarket=true → luôn dùng MARKET (test signal direction)
        // Nếu entry quá gần/vượt mark price → cũng dùng MARKET thay LIMIT
        const gap = markPrice > 0 ? (entryNum - markPrice) / markPrice : -1;
        const useMarket = forceMarket || (markPrice > 0 && (
          (side === 'BUY'  && gap >= -0.001) ||
          (side === 'SELL' && gap <=  0.001)
        ));

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
          const t = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5_000));
          const rows = await Promise.race([client.getTopLongShortPositionRatio(sym, '5m', limit), t]);
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

    if (requestUrl.pathname === '/api/tsl-exclude') {
      const token = request.headers['x-orders-token'] ?? '';
      if (!ordersTokens.has(token)) {
        await sendJson(response, { error: 'Unauthorized.' }, 401);
        return;
      }
      if (request.method === 'GET') {
        await sendJson(response, { excluded: [...tslExcludedSymbols] });
        return;
      }
      if (request.method === 'POST') {
        const body = await readJsonBody(request);
        const sym = String(body.symbol ?? '').toUpperCase().trim();
        if (!sym) { await sendJson(response, { error: 'symbol required' }, 400); return; }
        if (body.excluded) {
          tslExcludedSymbols.add(sym);
          console.log(`[TSL-Exclude] ⛔ ${sym} excluded from position management`);
        } else {
          tslExcludedSymbols.delete(sym);
          console.log(`[TSL-Exclude] ✅ ${sym} re-enabled`);
        }
        await sendJson(response, { excluded: [...tslExcludedSymbols] });
        return;
      }
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
  loadSlTracking();
  loadPumpOrders();
  loadPumpWatching();
  startBinanceRestAlertMonitor();
  initMarketNewsBatch().catch((err) => console.warn('[MarketNews] Init failed:', err.message));
  initCoinFlowBatch().catch((err) => console.warn('[CoinFlow] Init failed:', err.message));
  // BTC mark price WebSocket — funding rate + mark price liên tục, không tốn REST
  initTokenUnlocksBatch().catch((err) => console.warn('[TokenUnlocks] Init failed:', err.message));
  startBtcMarkPriceWs();

  // Pha 1: ưu tiên kline cache trước. Các logic dùng REST/account sẽ được bật sau
  // khi top symbols đã có đủ nến tối thiểu, tránh chen request làm Binance 429.
  (async () => {
    try {
      const snapshot = await getSharedSnapshot();
      if (!_staleReseedLock) {
        _staleReseedLock = true;
        startTieredKlineWarmup(snapshot, 'startup').catch((err) => {
          _staleReseedLock = false;
          console.warn('[KlineWarmup] Tiered warm-up failed:', err.message);
        });
      }
      setTimeout(() => {
        for (const interval of EMA_SQUEEZE_INTERVALS) {
          klineCache.subscribe(['BTCUSDT'], interval);
          klineCache.seed(['BTCUSDT'], interval, 250, { batchSize: 1, batchDelayMs: 2000 }).catch(() => {});
        }
      }, 5_000);
      setTimeout(() => klineCache.seed(['BTCUSDT'], '1h', 250, { batchSize: 1, batchDelayMs: 2000 }).catch(() => {}), 15_000);
      setTimeout(() => klineCache.seed(['BTCUSDT'], '4h', 150, { batchSize: 1, batchDelayMs: 2000 }).catch(() => {}), 25_000);
      setTimeout(() => klineCache.seed(['BTCUSDT'], '1d', 60, { batchSize: 1, batchDelayMs: 2000 }).catch(() => {}), 35_000);
    } catch (err) {
      console.warn('[KlineCache] Seed failed:', err.message);
      const retryMs = Number(process.env.KLINE_WARMUP_RETRY_MS ?? 90_000);
      const retryStartupWarmup = async () => {
        if (_tieredWarmupPromise || _staleReseedLock || binanceRateGate.isBlocked?.()) {
          setTimeout(retryStartupWarmup, retryMs).unref?.();
          return;
        }
        try {
          const snapshot = await getSharedSnapshot();
          _staleReseedLock = true;
          startTieredKlineWarmup(snapshot, 'startup-retry').catch((retryErr) => {
            _staleReseedLock = false;
            console.warn('[KlineWarmup] Startup retry failed:', retryErr.message);
          });
        } catch (retryErr) {
          console.warn('[KlineWarmup] Startup retry snapshot failed:', retryErr.message);
          setTimeout(retryStartupWarmup, retryMs).unref?.();
        }
      };
      setTimeout(retryStartupWarmup, retryMs).unref?.();
    }
  })();

  const tslIntervalMs = Math.max(Number(process.env.TRAILING_STOP_INTERVAL_MS ?? 30000), 15000);
  const brgIntervalMs = Math.max(Number(process.env.BTC_REVERSAL_GUARD_INTERVAL_MS ?? 41000), 15000);

  // Paper PnL only needs the shared bookTicker WS, so start it before kline warm-up.
  // Otherwise paper rows can show mark=entry/PNL=0 while scanners are still warming cache.
  startPaperTradeTicker();
  startCapPaperTicker();
  startDiPaperTicker();
  startPiPaperTicker();
  startPumpPaperTicker();
  startEdgePaperTicker();
  startSrPaperTicker();
  startPpksPaperTicker();
  startShakeoutPaperTicker();
  startPositionSocketMonitor();

  runAfterKlineWarmup('algo APIs', () => {
    loadSlTracking().then(() =>
      adoptExistingSlPositions().catch((err) => console.warn('[SlTracking] Adopt failed:', err.message)),
    );
    loadPumpOrders().then(() => {
      pollPumpOrders().catch(() => {});
      setInterval(() => pollPumpOrders().catch(() => {}), 60_000);
    });
    loadPumpWatching().then(() => {
      setInterval(() => pollPumpWatching().catch(() => {}), 3 * 60_000);
    });
    startAutoTrader();
    if (process.env.LONG_SHORT_REFRESH_ENABLED !== 'false') {
      startLongShortRefresh();
    }
    tslScanner = startTrailingStopScanner({ client, getSymbols, intervalMs: tslIntervalMs, webhookUrl: process.env.TSL_WEBHOOK_URL, isExcluded: (sym) => tslExcludedSymbols.has(sym), getPositionData: getSharedPositionData });
    startBtcReversalGuard({ client, getSymbols, getRuntimeSettings: () => runtimeSettings, intervalMs: brgIntervalMs, getPositionData: getSharedPositionData });
    // Proactive position store refresh — chủ động làm mới trước khi scanner cần.
    setInterval(async () => {
      if (_posStoreInflight) return;
      _posStore.fetchedAt = 0; // invalidate để force fresh fetch
      getSharedPositionData().catch(() => {});
    }, POS_STORE_TTL_MS);

    startDiscordScanner({
      client: analyzeClient,
      webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
      threshold: Number(process.env.DISCORD_SIGNAL_THRESHOLD ?? 0.7),
      intervalMs: Math.max(Number(process.env.DISCORD_INTERVAL_MS ?? 30000), 15000),
      cooldownMs: Number(process.env.DISCORD_COOLDOWN_MS ?? 3600000),
      getSnapshot: getSharedSnapshot,
    });
    startLiqImbalanceScanner({
      client: analyzeClient,
      klineCache,
      webhookUrl: process.env.LIQ_SCAN_WEBHOOK_URL || '',
      highProbWebhookUrl: process.env.LIQ_HIGH_PROB_WEBHOOK_URL || '',
      getSnapshot: getSharedSnapshot,
      biasThreshold: Number(process.env.LIQ_SCAN_BIAS_THRESHOLD ?? 0.4),
      intervalMs: Number(process.env.LIQ_SCAN_INTERVAL_MS ?? 5 * 60 * 1000),
      cooldownMs: Number(process.env.LIQ_SCAN_COOLDOWN_MS ?? 2 * 60 * 60 * 1000),
      minVolumeUsdt: Number(process.env.LIQ_SCAN_MIN_VOLUME ?? 5_000_000),
      maxCoins: Number(process.env.LIQ_SCAN_MAX_COINS ?? 200),
      onHighProbAlert: getLiqHighProbHandler(),
      highProbThreshold: getLiqHighProbThreshold(),
      topTraderCache: topPositionCache, // tái dùng cache từ startLongShortRefresh, tránh 51 REST calls
      topTraderRestFallback: process.env.LIQ_SCAN_TOP_TRADER_REST_FALLBACK === 'true',
    });
    startVolumeDumpScanner({
      client: analyzeClient,
      klineCache,
      webhookUrl: process.env.VOL_DUMP_WEBHOOK_URL || process.env.LIQ_SCAN_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '',
      bigCandleWebhookUrl: process.env.BIG_CANDLE_WEBHOOK_URL || '',
      getSnapshot: getSharedSnapshot,
      intervalMs: Number(process.env.VOL_DUMP_INTERVAL_MS ?? 60000),
      cooldownMs: Number(process.env.VOL_DUMP_COOLDOWN_MS ?? 7200000),
      minVolumeUsdt: Number(process.env.VOL_DUMP_MIN_VOLUME ?? 5000000),
      maxCoins: Number(process.env.VOL_DUMP_MAX_COINS ?? 150),
      volMult: Number(process.env.VOL_DUMP_VOL_MULT ?? 1.8),
      sustainedCandles: Number(process.env.VOL_DUMP_SUSTAINED ?? 3),
      dumpPct: Number(process.env.VOL_DUMP_DROP_PCT ?? 1.5),
      move4cPct: Number(process.env.VOL_DUMP_MOVE4C_PCT ?? 2.5),
      bigCandlePct: Number(process.env.BIG_CANDLE_PCT ?? 8),
      bigCandleCooldownMs: Number(process.env.BIG_CANDLE_COOLDOWN_MS ?? 3600000),
    });
    runStaleOrderCleaner(); // seed initial position set, no cancellations on first run
    setInterval(runStaleOrderCleaner, 35_000); // 35s — lệch nhịp TSL(30s) tránh cùng lúc
    runBtcHealthMonitor(); // initial read — seed _prevBtcBias, no cancellations
    setInterval(runBtcHealthMonitor, 2 * 60_000); // check every 2 minutes
    startNegTpScanner();
    startPaperTradeTicker();
    startCapPaperTicker();
    startDiPaperTicker();
    startPiPaperTicker();
    startPumpPaperTicker();
    startEdgePaperTicker();
    startSrPaperTicker();
    startPpksPaperTicker();
    startShakeoutPaperTicker();
    startMissingTpScanner();
    startSlTrailSafetyScanner();
    startPositionSocketMonitor();
  });
});

// ── BTC Health ────────────────────────────────────────────────────────────────
let btcHealthCache = { data: null, expiresAt: 0 };
let _btcHealthInflight = null; // dedup concurrent calls — only one REST fetch at a time
let goldHealthCache = { data: null, expiresAt: 0 };
let _goldHealthInflight = null;
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

async function _fetchBtcHealth() {

  try {
    // Funding rate: từ WebSocket markPrice stream — 0 REST calls
    const fundingRate = btcMarkPriceWsData.fundingRate ?? 0;
    const markPrice   = btcMarkPriceWsData.markPrice;

    // L/S ratio: không có WS → REST cache 30 phút (thay đổi rất chậm, không cần real-time)
    if (!btcLsRatioCache.data || Date.now() >= btcLsRatioCache.expiresAt) {
      const lsTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('L/S timeout')), 5_000));
      const lsData = await Promise.race([
        client.getGlobalLongShortRatio('BTCUSDT', '5m', 1),
        lsTimeout,
      ]).catch(() => null);
      btcLsRatioCache = { data: lsData, expiresAt: Date.now() + 30 * 60_000 };
    }
    // getIfCached = chỉ đọc WS cache, KHÔNG fallback REST → không bao giờ treo
    const klines4h = klineCache.getIfCached('BTCUSDT', '4h', 100);
    const klines1d = klineCache.getIfCached('BTCUSDT', '1d', 50);
    const klines1h = klineCache.getIfCached('BTCUSDT', '1h', 200);
    if (!klines4h || !klines1h) {
      // Klines chưa seed xong — trả stale nếu có, không treo request
      if (btcHealthCache.data) return btcHealthCache.data;
      return { bias: 'neutral', bearPoints: 0, bullPoints: 0, bullBias: 'neutral', updatedAt: Date.now(), seeding: true };
    }
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

    // Last CLOSED 1h candle direction — dùng để detect BTC correction phase
    // index -1 = nến đang chạy (bỏ qua), index -2 = nến vừa đóng
    const k1hLast = klines1h[klines1h.length - 2];
    const btcCandle1hPct = k1hLast
      ? ((Number(k1hLast[4]) - Number(k1hLast[1])) / Number(k1hLast[1])) * 100
      : null;

    // BTC spike candle detection — vol > 2.5x avg + move > 1% trên 1h
    // Sau nến spike, correction thường xảy ra → EMA_PB LONG trên alt bị block 2 nến tiếp
    let btcSpikeAlert = false;
    if (klines1h && klines1h.length >= 15) {
      const vols1h = klines1h.map((k) => Number(k[5] ?? k.volume));
      // Baseline: dùng candles 5-25 periods ago (tránh đưa spike vào avg của chính nó)
      const baselineVols = vols1h.slice(Math.max(0, vols1h.length - 25), vols1h.length - 5);
      const avgVol1h = baselineVols.length > 0
        ? baselineVols.reduce((s, v) => s + v, 0) / baselineVols.length : 0;
      // Kiểm tra 3 nến closed gần nhất (bỏ nến đang chạy = index cuối)
      for (let i = 2; i <= 4; i++) {
        const k = klines1h[klines1h.length - i];
        if (!k) continue;
        const vol     = Number(k[5] ?? k.volume);
        const open    = Number(k[1] ?? k.open);
        const close   = Number(k[4] ?? k.close);
        const movePct = Math.abs((close - open) / open) * 100;
        if (avgVol1h > 0 && vol > avgVol1h * 2.5 && movePct > 1.0) {
          btcSpikeAlert = true;
          break;
        }
      }
    }

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
    if (rsi4h != null && rsi4h < 30) bearPoints++;           // BTC dump mạnh trên 4h (< 30 thay vì 35 để unblock LONG sớm hơn khi hồi phục)
    if (rsi1h != null && rsi1h < 40) bearPoints++;           // Momentum âm trên 1h
    if (emaTrend1h === 'below') bearPoints++;                // Price dưới EMA20 1h

    const bias = bearPoints >= 3 ? 'bearish' : bearPoints >= 2 ? 'caution' : 'neutral';

    // --- Bull points — đối xứng, dùng để block SHORT ---
    let bullPoints = 0;
    if (rsi1h != null && rsi1h > 60) bullPoints++;          // Momentum dương trên 1h
    if (emaTrend1h === 'above') bullPoints++;               // Price trên EMA20 1h
    if (pct6h != null && pct6h > 1.5) bullPoints++;        // BTC tăng >1.5% trong 6h
    if (obvTrend === 'rising' && pct6h != null && pct6h > 0.5) bullPoints++; // OBV rising chỉ tính khi momentum 6h xác nhận (> 0.5%) — tránh lagging sau pump
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
      btcSpikeAlert,
      btcCandle1hPct: btcCandle1hPct != null ? +btcCandle1hPct.toFixed(3) : null,
      updatedAt: Date.now(),
    };

    btcHealthCache = { data, expiresAt: Date.now() + 30_000 }; // 30s — klines từ WS, RSI đủ fresh
    return data;
  } catch (e) {
    console.warn('[BtcHealth] error:', e.message);
    return btcHealthCache.data ?? { error: e.message };
  }
}

// Wrapper: cache check + in-flight dedup → chỉ 1 REST fetch tại một thời điểm
function getBtcHealth() {
  if (btcHealthCache.data && Date.now() < btcHealthCache.expiresAt) {
    return Promise.resolve(btcHealthCache.data);
  }
  if (_btcHealthInflight) return _btcHealthInflight;
  _btcHealthInflight = _fetchBtcHealth().finally(() => { _btcHealthInflight = null; });
  return _btcHealthInflight;
}

async function _fetchGoldHealth() {
  const symbol = String(process.env.EMA_SQUEEZE_REAL_GOLD_SYMBOL ?? 'PAXGUSDT').toUpperCase().trim();
  const interval = String(process.env.EMA_SQUEEZE_REAL_GOLD_INTERVAL ?? '1h').trim() || '1h';
  const useLiveCandle = process.env.EMA_SQUEEZE_REAL_GOLD_USE_LIVE_CANDLE !== 'false';
  const redThresholdPct = Number(process.env.EMA_SQUEEZE_REAL_GOLD_RED_THRESHOLD_PCT ?? 0);
  try {
    const rows = await client.getKlines(symbol, interval, 3, {
      priority: 4,
      dropOnCongestion: true,
      source: 'emaSqueezeGoldHealth',
    });
    const idx = useLiveCandle ? rows.length - 1 : rows.length - 2;
    const k = rows[idx];
    if (!k) throw new Error(`not enough ${symbol} ${interval} candles`);
    const open = Number(k.open ?? k[1]);
    const close = Number(k.close ?? k[4]);
    if (!Number.isFinite(open) || open <= 0 || !Number.isFinite(close) || close <= 0) {
      throw new Error(`invalid ${symbol} ${interval} candle`);
    }
    const changePct = ((close - open) / open) * 100;
    const data = {
      symbol,
      interval,
      mode: useLiveCandle ? 'live' : 'closed',
      open,
      close,
      changePct: +changePct.toFixed(3),
      red: changePct < redThresholdPct,
      redThresholdPct,
      updatedAt: Date.now(),
    };
    goldHealthCache = { data, expiresAt: Date.now() + 60_000 };
    return data;
  } catch (e) {
    console.warn('[GoldHealth] error:', e.message);
    const data = { symbol, interval, error: e.message, updatedAt: Date.now() };
    goldHealthCache = { data, expiresAt: Date.now() + 60_000 };
    return data;
  }
}

function getGoldHealth() {
  if (process.env.EMA_SQUEEZE_REAL_GOLD_FILTER === 'false') {
    return Promise.resolve({ disabled: true, red: false });
  }
  if (goldHealthCache.data && Date.now() < goldHealthCache.expiresAt) {
    return Promise.resolve(goldHealthCache.data);
  }
  if (_goldHealthInflight) return _goldHealthInflight;
  _goldHealthInflight = _fetchGoldHealth().finally(() => { _goldHealthInflight = null; });
  return _goldHealthInflight;
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

  const exchangeInfo = await client.getExchangeInfo({ priority: 1, source: 'getSymbols' });
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

const signalProtectionPlans = new Map(); // symbol -> intended TP/SL to apply after full fill
const signalProtectionRunning = new Set();

function rememberSignalProtectionPlan({ symbol, side, takeProfitPrice, stopLossPrice, source, orderId = null }) {
  const tpPrice = Number(takeProfitPrice);
  const slPrice = Number(stopLossPrice);
  if ((!Number.isFinite(tpPrice) || tpPrice <= 0) && (!Number.isFinite(slPrice) || slPrice <= 0)) return;
  signalProtectionPlans.set(symbol, {
    symbol,
    side,
    tpPrice: Number.isFinite(tpPrice) && tpPrice > 0 ? tpPrice : null,
    slPrice: Number.isFinite(slPrice) && slPrice > 0 ? slPrice : null,
    source: String(source ?? 'signal'),
    orderId,
    createdAt: Date.now(),
  });
}

async function applySignalProtectionOnFill(symbol, attempt = 1) {
  const plan = signalProtectionPlans.get(symbol);
  if (!plan || signalProtectionRunning.has(symbol)) return;
  if (Date.now() - plan.createdAt > 24 * 3600_000) {
    signalProtectionPlans.delete(symbol);
    return;
  }

  signalProtectionRunning.add(symbol);
  try {
    await setTpSl({ symbol, tpPrice: plan.tpPrice, slPrice: plan.slPrice });
    if (plan.slPrice && slTracking.positions[symbol]) {
      slTracking.positions[symbol].slPlaced = true;
      slTracking.positions[symbol].slPrice = plan.slPrice;
      slTracking.positions[symbol].slPlacedAt = new Date().toISOString();
      saveSlTracking();
    }
    plan.appliedAt = Date.now();
    console.log(`[SignalProtection] ${symbol} applied source=${plan.source} TP=${plan.tpPrice ?? '-'} SL=${plan.slPrice ?? '-'}`);
  } catch (err) {
    console.warn(`[SignalProtection] ${symbol} attempt=${attempt} failed: ${err.message}`);
    if (attempt < 4) {
      setTimeout(() => applySignalProtectionOnFill(symbol, attempt + 1), attempt * 1500);
    }
  } finally {
    signalProtectionRunning.delete(symbol);
  }
}

async function placeOrder(payload, token = null, credentialsOverride = null) {
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
  const protectionOnFill = payload.protectionOnFill === true;
  const protectionSource = String(payload.source ?? 'signal');
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

  const { apiKey, apiSecret } = credentialsOverride ?? getApiCredentials(token);

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
  const isHedge = await getHedgeMode(token, credentialsOverride);
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
  if (protectionOnFill) {
    rememberSignalProtectionPlan({
      symbol,
      side,
      takeProfitPrice: roundedTakeProfitPrice,
      stopLossPrice: roundedStopLossPrice,
      source: protectionSource,
    });
  }

  let orderResult;
  try {
    orderResult = await client.placeFuturesOrder({ params: orderParams, apiKey, apiSecret });
  } catch (err) {
    if (protectionOnFill) signalProtectionPlans.delete(symbol);
    throw err;
  }

  // LIMIT IOC: if not filled, fall back to MARKET immediately
  if (isLimitIOC && Number(orderResult.executedQty ?? 0) === 0) {
    console.log(`[Order] ${symbol} IOC not filled → MARKET fallback`);
    const marketParams = { ...orderParams, type: 'MARKET', timeInForce: undefined };
    delete marketParams.price;
    delete marketParams.timeInForce;
    orderResult = await client.placeFuturesOrder({ params: marketParams, apiKey, apiSecret });
  }
  const takeProfitResult = !protectionOnFill && takeProfitParams
    ? await client.placeAlgoOrder({ params: takeProfitParams, apiKey, apiSecret })
    : null;
  const stopLossResult = !protectionOnFill && stopLossParams
    ? await client.placeAlgoOrder({ params: stopLossParams, apiKey, apiSecret })
    : null;

  if (protectionOnFill) {
    const plan = signalProtectionPlans.get(symbol);
    if (plan) plan.orderId = orderResult?.orderId ?? null;
  }

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

function liquidSweepProb(heatmap, target = null) {
  const above = Number(heatmap?.liquidityAbove ?? 0);
  const below = Number(heatmap?.liquidityBelow ?? 0);
  const total = above + below;
  if (total <= 0) return 0;
  const bias = Number(heatmap?.bias ?? 0);
  const dominant = bias >= 0 ? above : below;
  const dominantPct = dominant / total;
  const imbalanceScore = clamp(Math.abs(bias), 0, 1);
  const dominanceScore = clamp((dominantPct - 0.5) / 0.5, 0, 1);
  const distanceAbs = Math.abs(Number(target?.distancePct ?? 8));
  const distanceScore = clamp((6 - distanceAbs) / 6, 0, 1);
  const targetShare = target?.score && dominant > 0 ? clamp(Number(target.score) / dominant, 0, 1) : 0;

  const probability = (
    imbalanceScore * 0.45
    + dominanceScore * 0.20
    + distanceScore * 0.25
    + targetShare * 0.10
  ) * 100;

  return Math.min(99, Math.max(0, Math.round(probability)));
}

function liquidSweepLabel(prob) {
  if (prob >= 80) return 'CAO';
  if (prob >= 55) return 'TRUNG BINH';
  return 'THAP';
}

function buildLiquidEntryPlan({ heavySide, markPrice, target, heatmap, killZoneCluster = null }) {
  const side = heavySide === 'above' ? 'LONG' : 'SHORT';
  const sweepDirection = heavySide === 'above' ? 'UP' : 'DOWN';
  const targetPrice = Number(target?.price ?? markPrice);
  const distancePct = Number(target?.distancePct ?? 0);
  const killZoneTarget = Number(killZoneCluster?.mainKillZone?.mid ?? 0);
  const hasKillZoneTarget = killZoneTarget > 0
    && ((side === 'LONG' && killZoneTarget > targetPrice) || (side === 'SHORT' && killZoneTarget < targetPrice));
  const planTargetPrice = hasKillZoneTarget ? killZoneTarget : targetPrice;
  const planTargetDistancePct = markPrice > 0 ? ((planTargetPrice - markPrice) / markPrice) * 100 : distancePct;
  const nearestOpposite = side === 'LONG'
    ? (heatmap.heatmapBelow?.[0] ?? null)
    : (heatmap.heatmapAbove?.[0] ?? null);
  const tp = planTargetPrice;
  const entryOffsetPct = Math.max(0.12, Math.min(0.55, Math.abs(planTargetDistancePct) * 0.28));
  const entryPrice = side === 'LONG'
    ? markPrice * (1 - entryOffsetPct / 100)
    : markPrice * (1 + entryOffsetPct / 100);
  const stopPct = Math.max(0.8, Math.min(2.5, Math.abs(planTargetDistancePct) * 0.75));
  const fallbackSl = side === 'LONG'
    ? entryPrice * (1 - stopPct / 100)
    : entryPrice * (1 + stopPct / 100);
  // Never tighter than fallbackSl — if nearestOpposite is too close it causes instant SL hit
  const rawSl = nearestOpposite?.price ?? fallbackSl;
  const sl = side === 'LONG' ? Math.min(rawSl, fallbackSl) : Math.max(rawSl, fallbackSl);
  const rewardPct = Math.abs((tp - entryPrice) / entryPrice * 100);
  const riskPct = Math.abs((entryPrice - sl) / entryPrice * 100);
  const rr = riskPct > 0 ? rewardPct / riskPct : null;
  const feasibleLeverage = Math.max(1, Math.min(10, Math.floor(10 / Math.max(stopPct, 0.5))));
  const feasibilityScore = Math.round(clamp(
    (rewardPct / 3) * 45
    + (Math.min(rr ?? 0, 3) / 3) * 35
    + (Math.min(Math.abs(planTargetDistancePct), 6) / 6) * 20,
    0,
    100,
  ));

  return {
    side,
    sweepDirection,
    entryPrice,
    entryDistancePct: side === 'LONG' ? -entryOffsetPct : entryOffsetPct,
    entryType: 'LIMIT_PULLBACK',
    takeProfitPrice: tp,
    stopLossPrice: sl,
    targetPrice,
    targetDistancePct: planTargetDistancePct,
    sweepTargetPrice: targetPrice,
    sweepTargetDistancePct: distancePct,
    killZoneCluster,
    killZoneTakeProfitPrice: hasKillZoneTarget ? tp : null,
    rewardPct,
    riskPct,
    rr,
    feasibleLeverage,
    feasibilityScore,
    status: 'ENTER_NOW',
    note: heavySide === 'above'
      ? (hasKillZoneTarget ? 'Thanh khoản trên một chiều: LONG theo lực hút, TP ưu tiên main kill zone.' : 'Thanh khoản trên dày: vào LONG theo hướng hút lên target.')
      : (hasKillZoneTarget ? 'Thanh khoản dưới một chiều: SHORT theo lực kéo, TP ưu tiên main kill zone.' : 'Thanh khoản dưới dày: vào SHORT theo hướng kéo xuống target.'),
  };
}

function calcLiquidRsi(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcLiquidEma(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let i = period; i < values.length; i += 1) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function detectLiquidationHuntPattern({ row, klines, heatmap, target, heavySide, interval }) {
  const closed = klines.slice(0, -1);
  if (closed.length < 80 || !target) return null;

  const recent = closed.slice(-8);
  const prior = closed.slice(-48, -8);
  const last = closed.at(-1);
  const closes = closed.map((k) => k.close);
  const volumes = closed.map((k) => k.quoteVolume);
  const avgVol = prior.length ? prior.reduce((sum, k) => sum + k.quoteVolume, 0) / prior.length : 0;
  const recentVol = recent.reduce((sum, k) => sum + k.quoteVolume, 0);
  const avgRecentVol = avgVol * Math.max(recent.length, 1);
  const volX = avgRecentVol > 0 ? recentVol / avgRecentVol : 0;
  const greenCount = recent.filter((k) => k.close > k.open).length;
  const redCount = recent.filter((k) => k.close < k.open).length;
  const rsi = calcLiquidRsi(closes, 14);
  const ema13 = calcLiquidEma(closes, 13);
  const ema25 = calcLiquidEma(closes, 25);
  const ema99 = calcLiquidEma(closes, 99);
  const runupBase = closed[Math.max(0, closed.length - 17)]?.close ?? closed[0]?.close;
  const runupPct = runupBase > 0 ? ((last.close - runupBase) / runupBase) * 100 : 0;
  const drawdownBase = closed[Math.max(0, closed.length - 17)]?.close ?? closed[0]?.close;
  const drawdownPct = drawdownBase > 0 ? ((drawdownBase - last.close) / drawdownBase) * 100 : 0;
  const distancePct = Number(target.distancePct ?? 999);
  const absDistance = Math.abs(distancePct);
  const isNearTarget = absDistance <= Number(process.env.LIQ_HUNT_MAX_TARGET_DISTANCE_PCT ?? 1.2);
  const targetIntensity = Number(target.intensity ?? 0);
  const targetStrong = targetIntensity >= 0.45 || Number(target.score ?? 0) >= Math.max(Number(heatmap.liquidityAbove ?? 0), Number(heatmap.liquidityBelow ?? 0)) * 0.08;
  const rsiHot = rsi != null && rsi >= Number(process.env.LIQ_HUNT_RSI_HOT ?? 78);
  const rsiCold = rsi != null && rsi <= Number(process.env.LIQ_HUNT_RSI_COLD ?? 22);
  const emaBull = ema13 != null && ema25 != null && ema99 != null && last.close > ema13 && ema13 > ema25 && ema25 > ema99;
  const emaBear = ema13 != null && ema25 != null && ema99 != null && last.close < ema13 && ema13 < ema25 && ema25 < ema99;
  const strongUp = runupPct >= Number(process.env.LIQ_HUNT_RUNUP_PCT ?? 4.0) || Number(row.change24hPct ?? 0) >= 10;
  const strongDown = drawdownPct >= Number(process.env.LIQ_HUNT_DRAWDOWN_PCT ?? 4.0) || Number(row.change24hPct ?? 0) <= -10;
  const volHot = volX >= Number(process.env.LIQ_HUNT_VOL_X ?? 1.8);

  const isUpsideHunt = heavySide === 'above'
    && distancePct > 0
    && isNearTarget
    && targetStrong
    && strongUp
    && greenCount >= 5
    && volHot
    && (rsiHot || emaBull);

  const isDownsideHunt = heavySide === 'below'
    && distancePct < 0
    && isNearTarget
    && targetStrong
    && strongDown
    && redCount >= 5
    && volHot
    && (rsiCold || emaBear);

  if (!isUpsideHunt && !isDownsideHunt) return null;

  const score = Math.round(clamp(
    (isUpsideHunt ? Math.min(runupPct / 14, 1) : Math.min(drawdownPct / 14, 1)) * 28
    + Math.min(volX / 4, 1) * 22
    + Math.min(absDistance <= 0.15 ? 1 : (1.2 - absDistance) / 1.05, 1) * 20
    + Math.min(targetIntensity || 0.6, 1) * 16
    + (isUpsideHunt ? Math.min((rsi ?? 50) / 100, 1) : Math.min((100 - (rsi ?? 50)) / 100, 1)) * 14,
    0,
    100,
  ));

  return {
    type: isUpsideHunt ? 'LIQUIDITY_RUNUP_HUNT' : 'LIQUIDITY_DUMP_HUNT',
    side: isUpsideHunt ? 'UP' : 'DOWN',
    score,
    interval,
    targetPrice: target.price,
    targetDistancePct: distancePct,
    targetIntensity,
    runupPct,
    drawdownPct,
    volX,
    greenCount,
    redCount,
    rsi,
    emaStack: isUpsideHunt ? (emaBull ? 'bull' : 'hot') : (emaBear ? 'bear' : 'cold'),
    note: isUpsideHunt
      ? 'Pump manh, volume xanh bung no, RSI nong va gia dang hut len cum thanh ly tren.'
      : 'Dump manh, volume do bung no, RSI lanh va gia dang hut xuong cum thanh ly duoi.',
  };
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function runLiquidScan({ interval = '15m', limit = 200, minVolumeUsdt = 0 } = {}) {
  const snapshot = await getSharedSnapshot();
  const candidates = snapshot
    .filter((row) => row.quoteVolume >= minVolumeUsdt)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, limit);

  const rows = await mapConcurrent(candidates, 8, async (row) => {
    try {
      const klines = await klineCache.getKlines(row.symbol, interval, 500);
      if (!klines || klines.length < 60) return null;
      const heatmap = computeHeatmapData({ klines, currentPrice: row.markPrice, momentumPct: row.change24hPct });
      const above = Number(heatmap.liquidityAbove ?? 0);
      const below = Number(heatmap.liquidityBelow ?? 0);
      const total = above + below;
      const bias = Number(heatmap.bias ?? 0);
      const heavySide = bias >= 0 ? 'above' : 'below';
      const heavyLiquidity = heavySide === 'above' ? above : below;
      const heavyPct = total > 0 ? heavyLiquidity / total * 100 : 0;
      const target = heatmap.sweepTarget ?? (
        heavySide === 'above'
          ? (heatmap.heatmapAbove?.[0] ?? null)
          : (heatmap.heatmapBelow?.[0] ?? null)
      );
      const targetDistancePct = target?.distancePct ?? null;
      const sweepProb = liquidSweepProb(heatmap, target);
      const isNearTarget = targetDistancePct != null && Math.abs(targetDistancePct) <= 0.35;
      const killZoneCluster = heatmap.killZoneCluster ?? null;
      const entryPlan = buildLiquidEntryPlan({ heavySide, markPrice: row.markPrice, target, heatmap, killZoneCluster });
      const huntSignal = detectLiquidationHuntPattern({ row, klines, heatmap, target, heavySide, interval });

      return {
        symbol: row.symbol,
        markPrice: row.markPrice,
        quoteVolume: row.quoteVolume,
        change24hPct: row.change24hPct,
        fundingRate: row.fundingRate,
        interval,
        liquidityAbove: above,
        liquidityBelow: below,
        totalLiquidity: total,
        bias,
        heavySide,
        heavyPct,
        sweepProb,
        sweepLabel: liquidSweepLabel(sweepProb),
        huntSignal,
        killZoneCluster,
        sweepTarget: target ? {
          direction: target.direction ?? heavySide,
          price: target.price,
          distancePct: target.distancePct,
          score: target.score,
        } : null,
        entryPlan,
        isNearTarget,
        strongestAbove: (heatmap.strongestAbove ?? heatmap.heatmapAbove ?? []).slice(0, 3),
        strongestBelow: (heatmap.strongestBelow ?? heatmap.heatmapBelow ?? []).slice(0, 3),
      };
    } catch (err) {
      return {
        symbol: row.symbol,
        markPrice: row.markPrice,
        quoteVolume: row.quoteVolume,
        change24hPct: row.change24hPct,
        interval,
        error: err.message,
      };
    }
  });

  const successful = rows.filter((row) => row && !row.error);
  successful.sort((a, b) => b.sweepProb - a.sweepProb || Math.abs(b.bias) - Math.abs(a.bias) || b.quoteVolume - a.quoteVolume);

  return {
    scannedAt: Date.now(),
    interval,
    requested: limit,
    processed: successful.length,
    failed: rows.length - successful.length,
    rows: successful,
    errors: rows.filter((row) => row?.error).slice(0, 10),
    cacheStats: klineCache.stats(interval),
  };
}

async function _fetchMarketSnapshot() {
  const [symbols, tickers, premiumRows] = await Promise.all([
    getSymbols(),
    client.getTicker24hr({ priority: 1, source: 'marketSnapshot:ticker24hr' }),
    client.getPremiumIndex(undefined, { priority: 1, source: 'marketSnapshot:premiumIndex' }),
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
  snapshotCache.expiresAt = Date.now() + 60_000; // 60s — align với getSharedSnapshot TTL tránh duplicate w=50 call
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
  } catch (e) {
    if (e.code === 'ENOENT') {
      const fresh = { createdAt: new Date().toISOString(), updatedAt: null, trades: [] };
      await writePaperStore(fresh);
      return fresh;
    }
    console.error('[Paper] ⚠️ Store parse error, serving empty to avoid overwrite:', e.message);
    return { createdAt: new Date().toISOString(), updatedAt: null, trades: [] };
  }
}

let _paperWriteLock = Promise.resolve();
async function writePaperStore(store) {
  const payload = { ...store, updatedAt: new Date().toISOString() };
  _paperWriteLock = _paperWriteLock.then(async () => {
    await mkdir(join(rootDir, 'data'), { recursive: true });
    const tmp = PAPER_TRADES_FILE + '.tmp';
    await writeFile(tmp, JSON.stringify(payload, null, 2));
    await rename(tmp, PAPER_TRADES_FILE);
  });
  await _paperWriteLock;
  return payload;
}

async function readLiquidPaperStore() {
  try {
    const text = await readFile(LIQUID_PAPER_FILE, 'utf8');
    const parsed = JSON.parse(text);
    return {
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      updatedAt: parsed.updatedAt ?? null,
      trades: Array.isArray(parsed.trades) ? parsed.trades : [],
    };
  } catch (e) {
    if (e.code === 'ENOENT') {
      // File chưa tồn tại — tạo mới
      const fresh = { createdAt: new Date().toISOString(), updatedAt: null, trades: [] };
      await writeLiquidPaperStore(fresh);
      return fresh;
    }
    // File bị corrupt (JSON parse lỗi) — KHÔNG ghi đè, trả về rỗng tạm để tránh mất data
    console.error('[LiquidPaper] ⚠️ Store parse error, serving empty to avoid overwrite:', e.message);
    return { createdAt: new Date().toISOString(), updatedAt: null, trades: [] };
  }
}

let _liquidPaperWriteLock = Promise.resolve();
async function writeLiquidPaperStore(store) {
  const payload = { ...store, updatedAt: new Date().toISOString() };
  // Serialize writes + atomic tmp→rename để tránh race condition và corrupt khi crash
  _liquidPaperWriteLock = _liquidPaperWriteLock.then(async () => {
    await mkdir(join(rootDir, 'data'), { recursive: true });
    const tmp = LIQUID_PAPER_FILE + '.tmp';
    await writeFile(tmp, JSON.stringify(payload, null, 2));
    await rename(tmp, LIQUID_PAPER_FILE);
  });
  await _liquidPaperWriteLock;
  return payload;
}

async function getPaperMark(symbol) {
  // WS ticker lien tuc cap nhat paperMarkCache. Mac dinh khong fallback REST
  // vi cac vong lap paper-trade co the tao hang tram /premiumIndex request/phut.
  const cached = paperMarkCache.get(symbol);
  if (cached) return cached.markPrice;
  if (process.env.PAPER_MARK_REST_FALLBACK_ENABLED !== 'true') {
    throw new Error('mark unavailable: waiting for WS mark cache');
  }
  if (isBinanceRestCongested()) throw new Error('mark unavailable: Binance REST congested');
  // Cold start fallback chi dung khi bat PAPER_MARK_REST_FALLBACK_ENABLED=true.
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('mark timeout')), 5_000));
  const price = await Promise.race([
    client.getPremiumIndex(symbol, { priority: 7, dropOnCongestion: true, source: 'getPaperMark' }),
    timeout,
  ]);
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
  const signalMark = Number(trade.signalMarkPrice ?? trade.openedSnapshot?.signalMarkPrice ?? 0);
  const signalQty = signalMark > 0 ? (margin * Number(trade.leverage)) / signalMark : 0;
  const signalPnl = signalMark > 0 ? (currentPrice - signalMark) * signalQty * sideMult : null;
  const signalRoe = signalPnl != null && margin > 0 ? (signalPnl / margin) * 100 : null;
  return {
    ...trade,
    markPrice: currentPrice,
    markSource: markPrice != null ? (paperMarkCache.get(trade.symbol)?.source ?? 'cache') : null,
    markUpdatedAt: paperMarkCache.get(trade.symbol)?.at ?? null,
    pnl,
    roe,
    signalPnl,
    signalRoe,
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
  const entryPlan = payload.entryPlan && typeof payload.entryPlan === 'object' ? payload.entryPlan : null;
  const markAtSignal = payload.signalMarkPrice != null
    ? Number(payload.signalMarkPrice)
    : Number(entryPlan?.signalMarkPrice ?? entryPlan?.markPrice ?? entryPrice);
  const sweepDistancePct = payload.sweepDistancePct != null
    ? Number(payload.sweepDistancePct)
    : (entryPlan?.targetDistancePct != null ? Number(entryPlan.targetDistancePct) : null);
  const feasibleLeverage = payload.feasibleLeverage != null
    ? Number(payload.feasibleLeverage)
    : (entryPlan?.feasibleLeverage != null ? Number(entryPlan.feasibleLeverage) : null);
  const feasibilityScore = payload.feasibilityScore != null
    ? Number(payload.feasibilityScore)
    : (entryPlan?.feasibilityScore != null ? Number(entryPlan.feasibilityScore) : null);
  const rewardPct = payload.rewardPct != null
    ? Number(payload.rewardPct)
    : (entryPlan?.rewardPct != null ? Number(entryPlan.rewardPct) : null);
  const riskPct = payload.riskPct != null
    ? Number(payload.riskPct)
    : (entryPlan?.riskPct != null ? Number(entryPlan.riskPct) : null);
  const rr = payload.rr != null
    ? Number(payload.rr)
    : (entryPlan?.rr != null ? Number(entryPlan.rr) : null);
  const huntSignal = payload.huntSignal && typeof payload.huntSignal === 'object'
    ? {
        type: String(payload.huntSignal.type ?? '').slice(0, 80),
        side: String(payload.huntSignal.side ?? '').slice(0, 16),
        score: Number(payload.huntSignal.score ?? 0),
        interval: String(payload.huntSignal.interval ?? '').slice(0, 16),
        targetPrice: payload.huntSignal.targetPrice != null ? Number(payload.huntSignal.targetPrice) : null,
        targetDistancePct: payload.huntSignal.targetDistancePct != null ? Number(payload.huntSignal.targetDistancePct) : null,
        targetIntensity: payload.huntSignal.targetIntensity != null ? Number(payload.huntSignal.targetIntensity) : null,
        runupPct: payload.huntSignal.runupPct != null ? Number(payload.huntSignal.runupPct) : null,
        drawdownPct: payload.huntSignal.drawdownPct != null ? Number(payload.huntSignal.drawdownPct) : null,
        volX: payload.huntSignal.volX != null ? Number(payload.huntSignal.volX) : null,
        greenCount: payload.huntSignal.greenCount != null ? Number(payload.huntSignal.greenCount) : null,
        redCount: payload.huntSignal.redCount != null ? Number(payload.huntSignal.redCount) : null,
        rsi: payload.huntSignal.rsi != null ? Number(payload.huntSignal.rsi) : null,
        emaStack: String(payload.huntSignal.emaStack ?? '').slice(0, 20),
        note: String(payload.huntSignal.note ?? '').slice(0, 180),
      }
    : null;

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
    takeProfitPrice: payload.takeProfitPrice ?? payload.tp ?? null,
    stopLossPrice: payload.stopLossPrice ?? payload.sl ?? null,
    signalType: payload.signalType ? String(payload.signalType).slice(0, 80) : null,
    signalPoint: payload.signalPoint != null ? Number(payload.signalPoint) : null,
    signalMarkPrice: Number.isFinite(markAtSignal) ? markAtSignal : entryPrice,
    sweepTargetPrice: payload.sweepTargetPrice != null ? Number(payload.sweepTargetPrice) : null,
    sweepDistancePct: Number.isFinite(sweepDistancePct) ? sweepDistancePct : null,
    feasibleLeverage: Number.isFinite(feasibleLeverage) ? feasibleLeverage : null,
    feasibilityScore: Number.isFinite(feasibilityScore) ? feasibilityScore : null,
    rewardPct: Number.isFinite(rewardPct) ? rewardPct : null,
    riskPct: Number.isFinite(riskPct) ? riskPct : null,
    rr: Number.isFinite(rr) ? rr : null,
    heavySide: payload.heavySide ? String(payload.heavySide).slice(0, 20) : null,
    huntSignal,
    huntType: huntSignal?.type || null,
    huntScore: huntSignal ? Number(huntSignal.score) : null,
    entryPlan,
  };

  const store = await readPaperStore();
  store.trades.unshift(trade);
  await writePaperStore(store);
  syncPaperTickerSymbols().catch(() => {});
  const markPrice = await getPaperMark(symbol).catch(() => null);
  if (markPrice && paperEntryTouched(trade, markPrice)) {
    const filled = await fillPendingPaperTrade(trade, markPrice);
    if (filled) return { trade: enrichPaperTrade(filled, markPrice) };
  }
  return { trade: enrichPaperTrade(trade, entryPrice) };
}

async function getLiquidPaperTrades() {
  const store = await readLiquidPaperStore();
  const activeSymbols = [...new Set(store.trades.filter((t) => ['OPEN', 'PENDING', 'ENTRY_READY'].includes(t.status)).map((t) => t.symbol))];
  const marks = new Map();
  await Promise.all(activeSymbols.map(async (symbol) => {
    try { marks.set(symbol, await getPaperMark(symbol)); }
    catch { /* keep stored price */ }
  }));
  const trades = store.trades
    .map((t) => enrichPaperTrade(t, marks.get(t.symbol)))
    .sort((a, b) => new Date(b.openedAt ?? b.entryReadyAt ?? b.createdAt ?? 0) - new Date(a.openedAt ?? a.entryReadyAt ?? a.createdAt ?? 0));
  return { ...store, trades, summary: paperSummary(trades), file: 'data/liquid-paper-trades.json' };
}

async function createLiquidPaperTrade(payload) {
  const symbol = normalizeSymbol(payload.symbol ?? '');
  const side = String(payload.side ?? '').toUpperCase();
  const marginUsdt = Number(payload.marginUsdt);
  const leverage = Math.max(1, Math.min(125, Number(payload.leverage ?? 1)));
  const note = String(payload.note ?? '').slice(0, 700);

  if (!symbol) throw new Error('symbol is required.');
  if (!['LONG', 'SHORT'].includes(side)) throw new Error('side must be LONG or SHORT.');
  if (!Number.isFinite(marginUsdt) || marginUsdt <= 0) throw new Error('marginUsdt must be greater than 0.');
  const entryPrice = payload.entryPrice ? Number(payload.entryPrice) : await getPaperMark(symbol);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error('entryPrice must be greater than 0.');
  const entryPlan = payload.entryPlan && typeof payload.entryPlan === 'object' ? payload.entryPlan : null;
  const markAtSignal = payload.signalMarkPrice != null
    ? Number(payload.signalMarkPrice)
    : Number(entryPlan?.signalMarkPrice ?? entryPlan?.markPrice ?? entryPrice);
  const sweepDistancePct = payload.sweepDistancePct != null
    ? Number(payload.sweepDistancePct)
    : (entryPlan?.targetDistancePct != null ? Number(entryPlan.targetDistancePct) : null);
  const feasibleLeverage = payload.feasibleLeverage != null
    ? Number(payload.feasibleLeverage)
    : (entryPlan?.feasibleLeverage != null ? Number(entryPlan.feasibleLeverage) : null);
  const feasibilityScore = payload.feasibilityScore != null
    ? Number(payload.feasibilityScore)
    : (entryPlan?.feasibilityScore != null ? Number(entryPlan.feasibilityScore) : null);
  const rewardPct = payload.rewardPct != null
    ? Number(payload.rewardPct)
    : (entryPlan?.rewardPct != null ? Number(entryPlan.rewardPct) : null);
  const riskPct = payload.riskPct != null
    ? Number(payload.riskPct)
    : (entryPlan?.riskPct != null ? Number(entryPlan.riskPct) : null);
  const rr = payload.rr != null
    ? Number(payload.rr)
    : (entryPlan?.rr != null ? Number(entryPlan.rr) : null);

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
    source: String(payload.source ?? 'liquid-scan').slice(0, 80),
    note,
    takeProfitPrice: payload.takeProfitPrice ?? payload.tp ?? null,
    stopLossPrice: payload.stopLossPrice ?? payload.sl ?? null,
    signalType: payload.signalType ? String(payload.signalType).slice(0, 80) : 'LIQUID_SCAN',
    signalPoint: payload.signalPoint != null ? Number(payload.signalPoint) : null,
    signalMarkPrice: Number.isFinite(markAtSignal) ? markAtSignal : entryPrice,
    sweepTargetPrice: payload.sweepTargetPrice != null ? Number(payload.sweepTargetPrice) : null,
    sweepDistancePct: Number.isFinite(sweepDistancePct) ? sweepDistancePct : null,
    feasibleLeverage: Number.isFinite(feasibleLeverage) ? feasibleLeverage : null,
    feasibilityScore: Number.isFinite(feasibilityScore) ? feasibilityScore : null,
    rewardPct: Number.isFinite(rewardPct) ? rewardPct : null,
    riskPct: Number.isFinite(riskPct) ? riskPct : null,
    rr: Number.isFinite(rr) ? rr : null,
    heavySide: payload.heavySide ? String(payload.heavySide).slice(0, 20) : null,
    entryPlan,
  };

  const store = await readLiquidPaperStore();
  store.trades.unshift(trade);
  await writeLiquidPaperStore(store);
  syncPaperTickerSymbols().catch(() => {});
  scheduleLiquidPaperBroadcast(100);
  const markPrice = await getPaperMark(symbol).catch(() => null);
  if (markPrice && paperEntryTouched(trade, markPrice)) {
    const filled = await fillPendingLiquidPaperTrade(trade, markPrice);
    if (filled) return { trade: enrichPaperTrade(filled, markPrice), file: 'data/liquid-paper-trades.json' };
  }
  return { trade: enrichPaperTrade(trade, entryPrice), file: 'data/liquid-paper-trades.json' };
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
    openedSnapshot: {
      markPrice,
      entryPrice: Number(current.entryPrice),
      signalPoint: current.signalPoint ?? null,
      signalType: current.signalType ?? null,
      signalMarkPrice: current.signalMarkPrice ?? null,
      sweepTargetPrice: current.sweepTargetPrice ?? null,
      heavySide: current.heavySide ?? null,
    },
    note: updatePaperFillNote(current.note, markPrice),
  };
  await writePaperStore(store);
  console.log(`[PaperLiq] ✅ FILLED ${current.symbol} ${current.side} entry=${current.entryPrice} mark=${markPrice}`);
  return store.trades[idx];
}

async function fillPendingLiquidPaperTrade(trade, markPrice) {
  const store = await readLiquidPaperStore();
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
    openedSnapshot: {
      markPrice,
      entryPrice: Number(current.entryPrice),
      signalPoint: current.signalPoint ?? null,
      signalType: current.signalType ?? null,
      signalMarkPrice: current.signalMarkPrice ?? null,
      sweepTargetPrice: current.sweepTargetPrice ?? null,
      sweepDistancePct: current.sweepDistancePct ?? null,
      feasibleLeverage: current.feasibleLeverage ?? null,
      feasibilityScore: current.feasibilityScore ?? null,
      rewardPct: current.rewardPct ?? null,
      riskPct: current.riskPct ?? null,
      rr: current.rr ?? null,
      heavySide: current.heavySide ?? null,
    },
    note: updatePaperFillNote(current.note, markPrice),
  };
  await writeLiquidPaperStore(store);
  scheduleLiquidPaperBroadcast(100);
  console.log(`[LiquidPaper] ✅ FILLED ${current.symbol} ${current.side} entry=${current.entryPrice} mark=${markPrice}`);
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

async function processLiquidPaperPendingFillsForSymbol(symbol, markPrice) {
  if (liquidPaperFillLocks.has(symbol)) return;
  liquidPaperFillLocks.add(symbol);
  try {
    const store = await readLiquidPaperStore();
    let dirty = false;
    for (let i = 0; i < store.trades.length; i++) {
      const t = store.trades[i];
      if (t.symbol !== symbol) continue;
      if (t.status === 'PENDING' && paperEntryTouched(t, markPrice)) {
        await fillPendingLiquidPaperTrade(t, markPrice);
        continue;
      }
      if (t.status !== 'OPEN') continue;
      const isLong = t.side === 'LONG';
      const tp = Number(t.takeProfitPrice ?? 0);
      const sl = Number(t.stopLossPrice ?? 0);
      const tpHit = tp > 0 && (isLong ? markPrice >= tp : markPrice <= tp);
      const slHit = sl > 0 && (isLong ? markPrice <= sl : markPrice >= sl);
      if (!tpHit && !slHit) continue;
      const outcome = tpHit ? 'TP' : 'SL';
      const exitPrice = outcome === 'TP' ? tp : sl;
      const sideMult = isLong ? 1 : -1;
      const pnl = (exitPrice - Number(t.entryPrice)) * Number(t.quantity) * sideMult;
      const roe = Number(t.marginUsdt) > 0 ? (pnl / Number(t.marginUsdt)) * 100 : 0;
      store.trades[i] = {
        ...t,
        status: 'CLOSED',
        exitPrice,
        pnl,
        roe,
        closedAt: new Date().toISOString(),
        outcome,
        closeNote: `Auto-closed: ${outcome} hit @ ${markPrice}`,
      };
      dirty = true;
      console.log(`[LiquidPaper] 🎯 ${outcome} hit ${symbol} ${t.side} exit=${markPrice} (${outcome === 'TP' ? 'tp' : 'sl'}=${outcome === 'TP' ? tp : sl})`);
    }
    if (dirty) {
      await writeLiquidPaperStore(store);
      scheduleLiquidPaperBroadcast(100);
    }
  } finally {
    liquidPaperFillLocks.delete(symbol);
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
  const [store, liquidStore] = await Promise.all([
    readPaperStore(),
    readLiquidPaperStore(),
  ]);
  const symbols = [...new Set([...store.trades, ...liquidStore.trades]
    .filter((t) => ['OPEN', 'PENDING', 'ENTRY_READY'].includes(t.status))
    .map((t) => t.symbol)
    .filter(Boolean))];
  sharedMarkTicker.setSymbols('paperTrade', symbols);
}

async function pollLiquidPaperMarksOnce() {
  const store = await readLiquidPaperStore();
  const symbols = [...new Set(store.trades
    .filter((t) => ['OPEN', 'PENDING', 'ENTRY_READY'].includes(t.status))
    .map((t) => t.symbol)
    .filter(Boolean))];
  if (symbols.length === 0) return;

  const rows = await client.getPremiumIndex();
  const bySymbol = new Map(rows.map((row) => [row.symbol, Number(row.markPrice)]));
  for (const symbol of symbols) {
    const markPrice = bySymbol.get(symbol);
    if (!Number.isFinite(markPrice) || markPrice <= 0) continue;
    paperMarkCache.set(symbol, { markPrice, at: Date.now(), source: 'rest' });
    await processLiquidPaperPendingFillsForSymbol(symbol, markPrice).catch(() => {});
  }
  scheduleLiquidPaperBroadcast(50);
}

let _liquidPaperRestBannedUntil = 0;

function stopLiquidPaperRestPoller() {
  if (liquidPaperRestPoller) { clearInterval(liquidPaperRestPoller); liquidPaperRestPoller = null; }
}

function startLiquidPaperRestPoller() {
  if (liquidPaperRestPoller || process.env.LIQUID_PAPER_REST_POLL_ENABLED === 'false') return;
  const intervalMs = Math.max(5000, Number(process.env.LIQUID_PAPER_REST_POLL_MS ?? 10000));
  liquidPaperRestPoller = setInterval(() => {
    if (Date.now() < _liquidPaperRestBannedUntil) return;
    pollLiquidPaperMarksOnce().catch((err) => {
      const msg = err.message ?? '';
      const m = msg.match(/banned until (\d+)/);
      if (m) {
        const bannedUntil = Number(m[1]);
        _liquidPaperRestBannedUntil = bannedUntil;
        const waitSec = Math.ceil((bannedUntil - Date.now()) / 1000);
        console.warn(`[LiquidPaper] ⛔ IP banned. REST poll suspended for ${Math.ceil(waitSec/60)}min (until ${new Date(bannedUntil).toISOString()}).`);
        stopLiquidPaperRestPoller();
        setTimeout(() => {
          _liquidPaperRestBannedUntil = 0;
          console.log('[LiquidPaper] 🔄 IP ban expired, resuming REST poll.');
          startLiquidPaperRestPoller();
        }, Math.max(waitSec * 1000, 60_000));
      } else {
        console.warn('[LiquidPaper] REST poll failed:', msg);
      }
    });
  }, intervalMs);
  console.log(`[LiquidPaper] REST mark fallback started (${intervalMs}ms).`);
}

// ── Atomic JSON write helper ──────────────────────────────────────────────────
// Ghi ra .tmp trước, rename sau → nếu crash giữa chừng file gốc không bị corrupt
async function atomicWriteJson(filePath, data) {
  const tmp = filePath + '.tmp';
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, filePath);
}

// ── Cap paper trade system (separate from liquidation paper trades) ──────────

async function readCapPaperStore() {
  try {
    const raw = await readFile(CAP_PAPER_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.trades)) throw new Error('invalid structure');
    return parsed;
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[CapPaper] Store read error, starting fresh:', e.message);
    return { trades: [] };
  }
}

let _capPaperWriteLock = Promise.resolve();
async function writeCapPaperStore(store) {
  // Serialize writes + atomic (tmp → rename) để tránh corrupt khi crash giữa chừng
  _capPaperWriteLock = _capPaperWriteLock.then(() => atomicWriteJson(CAP_PAPER_FILE, store));
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

async function processCapPaperCachedMarks() {
  if (capPaperBatchRunning) return;
  capPaperBatchRunning = true;
  try {
    const store = await readCapPaperStore();
    const active = store.trades.filter((t) => ['PENDING', 'OPEN'].includes(t.status));
    for (const trade of active) {
      const markPrice = Number(capMarkCache.get(trade.symbol) ?? sharedMarkTicker.getPrice?.(trade.symbol));
      if (!Number.isFinite(markPrice) || markPrice <= 0) continue;
      if (trade.status === 'PENDING') await fillCapPendingTrade(trade, markPrice);
      else await checkCapPaperTpSl(trade, markPrice);
    }
  } finally {
    capPaperBatchRunning = false;
  }
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
  sharedMarkTicker.setSymbols('capPaper', symbols);
}

function startCapPaperTicker() {
  if (capPaperTicker) return;
  capPaperTicker = true; // guard flag — actual WS is sharedMarkTicker
  sharedMarkTicker.register('capPaper', ({ symbol, markPrice }) => {
    capMarkCache.set(symbol, markPrice);
  });
  console.log('[CapPaper] Mark ticker started (shared, 1s batched processing).');
  syncCapPaperTicker().catch(() => {});
  setInterval(() => syncCapPaperTicker().catch(() => {}), 30_000);
  setInterval(() => processCapPaperCachedMarks().catch((err) => {
    console.warn('[CapPaper] Batch mark processing failed:', err.message);
  }), 1_000);
}

// ── End cap paper trade system ───────────────────────────────────────────────

// ── DI paper trade system (dump ignition, always SHORT) ──────────────────────

async function readDiPaperStore() {
  try {
    const raw = await readFile(DI_PAPER_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.trades)) throw new Error('invalid structure');
    return parsed;
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[DiPaper] Store read error, starting fresh:', e.message);
    return { trades: [] };
  }
}

let _diPaperWriteLock = Promise.resolve();
async function writeDiPaperStore(store) {
  _diPaperWriteLock = _diPaperWriteLock.then(() => atomicWriteJson(DI_PAPER_FILE, store));
  return _diPaperWriteLock;
}

function enrichDiPaperTrade(t, markPrice) {
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

async function getDiPaperTrades() {
  const store = await readDiPaperStore();
  const trades = store.trades.map((t) => enrichDiPaperTrade(t, diMarkCache.get(t.symbol)));
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

async function createDiPaperTrade(payload) {
  const symbol = String(payload.symbol ?? '').toUpperCase().trim();
  const side = String(payload.side ?? 'SHORT').toUpperCase();
  const marginUsdt = Number(payload.marginUsdt ?? 1);
  const leverage = Math.max(1, Math.min(125, Number(payload.leverage ?? 10)));
  const entryPrice = Number(payload.entryPrice);

  if (!symbol) throw new Error('symbol required');
  if (!['LONG', 'SHORT'].includes(side)) throw new Error('side must be LONG or SHORT');
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error('entryPrice required');

  const store = await readDiPaperStore();
  // Dedup: skip if same symbol+side+entry already PENDING or OPEN
  const dup = store.trades.find((t) =>
    t.symbol === symbol && t.side === side && Math.abs(t.entryPrice - entryPrice) / entryPrice < 0.005 &&
    ['PENDING', 'OPEN'].includes(t.status),
  );
  if (dup) return { trade: enrichDiPaperTrade(dup, diMarkCache.get(symbol)) };

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
  await writeDiPaperStore(store);
  console.log(`[DiPaper] ${status === 'PENDING' ? '⏳' : '✅'} ${side} ${symbol} entry=${entryPrice} src=${trade.source}`);
  return { trade: enrichDiPaperTrade(trade, entryPrice) };
}

async function closeDiPaperTrade(payload) {
  const store = await readDiPaperStore();
  const idx = store.trades.findIndex((t) => t.id === payload.id);
  if (idx < 0) throw new Error('DI paper trade not found');
  const trade = store.trades[idx];
  if (trade.status === 'CLOSED') return { trade: enrichDiPaperTrade(trade, trade.exitPrice) };
  const exitPrice = payload.exitPrice ? Number(payload.exitPrice) : (diMarkCache.get(trade.symbol) ?? trade.entryPrice);
  const sideMult = trade.side === 'LONG' ? 1 : -1;
  const pnl = (exitPrice - trade.entryPrice) * trade.quantity * sideMult;
  const roe = trade.marginUsdt > 0 ? (pnl / trade.marginUsdt) * 100 : 0;
  const outcome = payload.outcome ?? 'MANUAL';
  store.trades[idx] = { ...trade, status: 'CLOSED', exitPrice, pnl, roe, outcome, closedAt: new Date().toISOString() };
  await writeDiPaperStore(store);
  return { trade: enrichDiPaperTrade(store.trades[idx], exitPrice) };
}

async function deleteDiPaperTrade(payload) {
  const store = await readDiPaperStore();
  store.trades = store.trades.filter((t) => t.id !== payload.id);
  await writeDiPaperStore(store);
  return { ok: true };
}

async function fillDiPendingTrade(trade, markPrice) {
  if (diPaperFillLocks.has(trade.id)) return;
  diPaperFillLocks.add(trade.id);
  try {
    const store = await readDiPaperStore();
    const idx = store.trades.findIndex((t) => t.id === trade.id && t.status === 'PENDING');
    if (idx < 0) return;
    const entry = Number(store.trades[idx].entryPrice);
    const touched = store.trades[idx].side === 'LONG' ? markPrice <= entry : markPrice >= entry;
    if (!touched) return;
    store.trades[idx] = { ...store.trades[idx], status: 'OPEN', fillPrice: entry, openedAt: new Date().toISOString() };
    await writeDiPaperStore(store);
    console.log(`[DiPaper] ✅ FILLED ${store.trades[idx].side} ${store.trades[idx].symbol} entry=${entry} mark=${markPrice}`);
  } finally {
    diPaperFillLocks.delete(trade.id);
  }
}

async function processDiPaperFills(symbol, markPrice) {
  const store = await readDiPaperStore();
  const pending = store.trades.filter((t) => t.status === 'PENDING' && t.symbol === symbol);
  for (const t of pending) await fillDiPendingTrade(t, markPrice);
  // Auto-close OPEN trades that hit TP or SL
  const open = store.trades.filter((t) => t.status === 'OPEN' && t.symbol === symbol);
  for (const t of open) await checkDiPaperTpSl(t, markPrice);
}

const diPaperTpSlLocks = new Set();
async function checkDiPaperTpSl(trade, markPrice) {
  if (!trade.tp && !trade.sl) return;
  if (diPaperTpSlLocks.has(trade.id)) return;
  const isLong = trade.side === 'LONG';
  const tpHit = trade.tp != null && (isLong ? markPrice >= trade.tp : markPrice <= trade.tp);
  const slHit = trade.sl != null && (isLong ? markPrice <= trade.sl : markPrice >= trade.sl);
  if (!tpHit && !slHit) return;
  diPaperTpSlLocks.add(trade.id);
  try {
    const outcome = tpHit ? 'TP' : 'SL';
    const exitPrice = tpHit ? trade.tp : trade.sl;
    await closeDiPaperTrade({ id: trade.id, exitPrice, outcome });
    console.log(`[DiPaper] 🎯 ${outcome} hit ${trade.side} ${trade.symbol} exit=${exitPrice}`);
  } finally {
    diPaperTpSlLocks.delete(trade.id);
  }
}

async function syncDiPaperTicker() {
  if (!diPaperTicker) return;
  const store = await readDiPaperStore();
  const symbols = [...new Set(store.trades.filter((t) => ['PENDING', 'OPEN'].includes(t.status)).map((t) => t.symbol))];
  sharedMarkTicker.setSymbols('diPaper', symbols);
}

function startDiPaperTicker() {
  if (diPaperTicker) return;
  diPaperTicker = true; // guard flag — actual WS is sharedMarkTicker
  sharedMarkTicker.register('diPaper', ({ symbol, markPrice }) => {
    diMarkCache.set(symbol, markPrice);
    processDiPaperFills(symbol, markPrice).catch(() => {});
  });
  console.log('[DiPaper] Mark ticker started (shared).');
  syncDiPaperTicker().catch(() => {});
  setInterval(() => syncDiPaperTicker().catch(() => {}), 30_000);
}

// ── End DI paper trade system ─────────────────────────────────────────────────

// ── PI paper trade system (pump ignition, always LONG) ───────────────────────

async function readPiPaperStore() {
  try {
    const raw = await readFile(PI_PAPER_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.trades)) throw new Error('invalid structure');
    return parsed;
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[PiPaper] Store read error, starting fresh:', e.message);
    return { trades: [] };
  }
}

let _piPaperWriteLock = Promise.resolve();
async function writePiPaperStore(store) {
  _piPaperWriteLock = _piPaperWriteLock.then(() => atomicWriteJson(PI_PAPER_FILE, store));
  return _piPaperWriteLock;
}

function enrichPiPaperTrade(t, markPrice) {
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

async function getPiPaperTrades() {
  const store = await readPiPaperStore();
  const trades = store.trades.map((t) => enrichPiPaperTrade(t, piMarkCache.get(t.symbol)));
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

async function createPiPaperTrade(payload) {
  const symbol = String(payload.symbol ?? '').toUpperCase().trim();
  const side = String(payload.side ?? 'LONG').toUpperCase();
  const marginUsdt = Number(payload.marginUsdt ?? 1);
  const leverage = Math.max(1, Math.min(125, Number(payload.leverage ?? 10)));
  const entryPrice = Number(payload.entryPrice);

  if (!symbol) throw new Error('symbol required');
  if (!['LONG', 'SHORT'].includes(side)) throw new Error('side must be LONG or SHORT');
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error('entryPrice required');

  const store = await readPiPaperStore();
  // Dedup: skip if same symbol+side+entry already PENDING or OPEN
  const dup = store.trades.find((t) =>
    t.symbol === symbol && t.side === side && Math.abs(t.entryPrice - entryPrice) / entryPrice < 0.005 &&
    ['PENDING', 'OPEN'].includes(t.status),
  );
  if (dup) return { trade: enrichPiPaperTrade(dup, piMarkCache.get(symbol)) };

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
  await writePiPaperStore(store);
  console.log(`[PiPaper] ${status === 'PENDING' ? '⏳' : '✅'} ${side} ${symbol} entry=${entryPrice} src=${trade.source}`);
  return { trade: enrichPiPaperTrade(trade, entryPrice) };
}

async function closePiPaperTrade(payload) {
  const store = await readPiPaperStore();
  const idx = store.trades.findIndex((t) => t.id === payload.id);
  if (idx < 0) throw new Error('PI paper trade not found');
  const trade = store.trades[idx];
  if (trade.status === 'CLOSED') return { trade: enrichPiPaperTrade(trade, trade.exitPrice) };
  const exitPrice = payload.exitPrice ? Number(payload.exitPrice) : (piMarkCache.get(trade.symbol) ?? trade.entryPrice);
  const sideMult = trade.side === 'LONG' ? 1 : -1;
  const pnl = (exitPrice - trade.entryPrice) * trade.quantity * sideMult;
  const roe = trade.marginUsdt > 0 ? (pnl / trade.marginUsdt) * 100 : 0;
  const outcome = payload.outcome ?? 'MANUAL';
  store.trades[idx] = { ...trade, status: 'CLOSED', exitPrice, pnl, roe, outcome, closedAt: new Date().toISOString() };
  await writePiPaperStore(store);
  return { trade: enrichPiPaperTrade(store.trades[idx], exitPrice) };
}

async function deletePiPaperTrade(payload) {
  const store = await readPiPaperStore();
  store.trades = store.trades.filter((t) => t.id !== payload.id);
  await writePiPaperStore(store);
  return { ok: true };
}

async function fillPiPendingTrade(trade, markPrice) {
  if (piPaperFillLocks.has(trade.id)) return;
  piPaperFillLocks.add(trade.id);
  try {
    const store = await readPiPaperStore();
    const idx = store.trades.findIndex((t) => t.id === trade.id && t.status === 'PENDING');
    if (idx < 0) return;
    const entry = Number(store.trades[idx].entryPrice);
    // LONG fill: price dips to entry (markPrice <= entry)
    const touched = markPrice <= entry;
    if (!touched) return;
    store.trades[idx] = { ...store.trades[idx], status: 'OPEN', fillPrice: entry, openedAt: new Date().toISOString() };
    await writePiPaperStore(store);
    console.log(`[PiPaper] ✅ FILLED ${store.trades[idx].side} ${store.trades[idx].symbol} entry=${entry} mark=${markPrice}`);
  } finally {
    piPaperFillLocks.delete(trade.id);
  }
}

async function processPiPaperFills(symbol, markPrice) {
  const store = await readPiPaperStore();
  const pending = store.trades.filter((t) => t.status === 'PENDING' && t.symbol === symbol);
  for (const t of pending) await fillPiPendingTrade(t, markPrice);
  // Auto-close OPEN trades that hit TP or SL
  const open = store.trades.filter((t) => t.status === 'OPEN' && t.symbol === symbol);
  for (const t of open) await checkPiPaperTpSl(t, markPrice);
}

const piPaperTpSlLocks = new Set();
async function checkPiPaperTpSl(trade, markPrice) {
  if (!trade.tp && !trade.sl) return;
  if (piPaperTpSlLocks.has(trade.id)) return;
  // LONG TP: markPrice >= tp, LONG SL: markPrice <= sl
  const tpHit = trade.tp != null && markPrice >= trade.tp;
  const slHit = trade.sl != null && markPrice <= trade.sl;
  if (!tpHit && !slHit) return;
  piPaperTpSlLocks.add(trade.id);
  try {
    const outcome = tpHit ? 'TP' : 'SL';
    const exitPrice = tpHit ? trade.tp : trade.sl;
    await closePiPaperTrade({ id: trade.id, exitPrice, outcome });
    console.log(`[PiPaper] 🎯 ${outcome} hit ${trade.side} ${trade.symbol} exit=${exitPrice}`);
  } finally {
    piPaperTpSlLocks.delete(trade.id);
  }
}

async function syncPiPaperTicker() {
  if (!piPaperTicker) return;
  const store = await readPiPaperStore();
  const symbols = [...new Set(store.trades.filter((t) => ['PENDING', 'OPEN'].includes(t.status)).map((t) => t.symbol))];
  sharedMarkTicker.setSymbols('piPaper', symbols);
}

function startPiPaperTicker() {
  if (piPaperTicker) return;
  piPaperTicker = true; // guard flag — actual WS is sharedMarkTicker
  sharedMarkTicker.register('piPaper', ({ symbol, markPrice }) => {
    piMarkCache.set(symbol, markPrice);
    processPiPaperFills(symbol, markPrice).catch(() => {});
  });
  console.log('[PiPaper] Mark ticker started (shared).');
  syncPiPaperTicker().catch(() => {});
  setInterval(() => syncPiPaperTicker().catch(() => {}), 30_000);
}

// ── End PI paper trade system ─────────────────────────────────────────────────

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
  _pumpPaperWriteLock = _pumpPaperWriteLock.then(() => atomicWriteJson(PUMP_PAPER_FILE, store));
  return _pumpPaperWriteLock;
}

function enrichPumpPaperTrade(t, markPrice) {
  const liveMark = Number(markPrice);
  const hasLiveMark = Number.isFinite(liveMark) && liveMark > 0;
  const isEmaSqueeze = String(t.source ?? '').startsWith('emasq-');
  const needsLiveMark = ['OPEN', 'PENDING'].includes(t.status);
  const mark = isEmaSqueeze && needsLiveMark
    ? (hasLiveMark ? liveMark : null)
    : Number(markPrice ?? t.markPrice ?? t.exitPrice ?? t.entryPrice);
  const entry = Number(t.entryPrice);
  const qty = Number(t.quantity);
  const margin = Number(t.marginUsdt);
  const sideMult = t.side === 'LONG' ? 1 : -1;
  const isActive = t.status === 'OPEN';
  const pnl = isActive
    ? (Number.isFinite(mark) && mark > 0 ? (mark - entry) * qty * sideMult : null)
    : (t.pnl ?? null);
  const roe = isActive && margin > 0
    ? (pnl == null ? null : (pnl / margin) * 100)
    : (t.roe ?? null);
  return {
    ...t,
    markPrice: mark,
    markUpdatedAt: isEmaSqueeze
      ? (emaSqueezeSocketMarkAt.get(String(t.symbol ?? '').toUpperCase()) ?? null)
      : null,
    pnl,
    roe,
  };
}

function emaSqueezePaperStopLossFromRoe({ source, side, entryPrice, leverage }) {
  if (!String(source ?? '').startsWith('emasq-')) return null;
  const stopLossRoe = Number(process.env.EMA_SQUEEZE_PAPER_STOP_LOSS_ROE ?? 30);
  const entry = Number(entryPrice);
  const lev = Math.max(1, Number(leverage) || 1);
  if (!Number.isFinite(stopLossRoe) || stopLossRoe <= 0 || !Number.isFinite(entry) || entry <= 0) return null;
  const priceMovePct = stopLossRoe / 100 / lev;
  return side === 'LONG'
    ? entry * (1 - priceMovePct)
    : entry * (1 + priceMovePct);
}

async function getPumpPaperTrades() {
  const store = await readPumpPaperStore();
  const snapshotMarks = new Map((_snapshotCache ?? [])
    .map((r) => [r.symbol, Number(r.markPrice ?? r.lastPrice ?? r.price)])
    .filter(([, price]) => Number.isFinite(price) && price > 0));
  const trades = store.trades.map((t) => enrichPumpPaperTrade(
    t,
    String(t.source ?? '').startsWith('emasq-')
      ? emaSqueezeSocketMarks.get(t.symbol)
      : (pumpMarkCache.get(t.symbol) ?? sharedMarkTicker.getPrice?.(t.symbol) ?? snapshotMarks.get(t.symbol)),
  ));
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

  const variant = payload.variant ? String(payload.variant).toUpperCase().slice(0, 16) : null;
  const signalId = payload.signalId ? String(payload.signalId).slice(0, 64) : null;

  const store = await readPumpPaperStore();
  const dup = store.trades.find((t) =>
    t.symbol === symbol && t.side === side && (t.variant ?? null) === variant &&
    Math.abs(t.entryPrice - entryPrice) / entryPrice < 0.005 &&
    ['PENDING', 'OPEN'].includes(t.status),
  );
  if (dup) {
    const dupMark = String(dup.source ?? '').startsWith('emasq-')
      ? emaSqueezeSocketMarks.get(symbol)
      : pumpMarkCache.get(symbol);
    return { trade: enrichPumpPaperTrade(dup, dupMark) };
  }

  const status = payload.status === 'OPEN' ? 'OPEN' : 'PENDING';
  const source = String(payload.source ?? 'manual').slice(0, 80);
  const emaSqueezeSl = emaSqueezePaperStopLossFromRoe({ source, side, entryPrice, leverage });
  const trade = {
    id: crypto.randomUUID(),
    signalId, variant,
    symbol, side, status,
    marginUsdt, leverage,
    quantity: (marginUsdt * leverage) / entryPrice,
    entryPrice,
    tp: payload.tp != null ? Number(payload.tp) : null,
    sl: emaSqueezeSl ?? (payload.sl != null ? Number(payload.sl) : null),
    fillPrice: status === 'OPEN' ? entryPrice : null,
    exitPrice: null,
    pnl: null,
    roe: null,
    outcome: null,
    createdAt: new Date().toISOString(),
    openedAt: status === 'OPEN' ? new Date().toISOString() : null,
    closedAt: null,
    source,
    note: String(payload.note ?? '').slice(0, 500),
    btcHealth: payload.btcHealth ?? null, // snapshot BTC health lúc vào — để backtest gate
  };
  store.trades.unshift(trade);
  await writePumpPaperStore(store);
  if (source.startsWith('emasq-')) syncEmaSqueezePaperTicker().catch(() => {});
  else syncPumpPaperTicker().catch(() => {});
  console.log(`[PumpPaper] ${status === 'PENDING' ? '⏳' : '✅'} ${side} ${symbol} entry=${entryPrice} src=${trade.source}`);
  return {
    trade: enrichPumpPaperTrade(
      trade,
      source.startsWith('emasq-') ? emaSqueezeSocketMarks.get(symbol) : entryPrice,
    ),
  };
}

async function closePumpPaperTrade(payload) {
  const store = await readPumpPaperStore();
  const idx = store.trades.findIndex((t) => t.id === payload.id);
  if (idx < 0) throw new Error('Pump paper trade not found');
  const trade = store.trades[idx];
  if (trade.status === 'CLOSED') return { trade: enrichPumpPaperTrade(trade, trade.exitPrice) };
  const isEmaSqueeze = String(trade.source ?? '').startsWith('emasq-');
  const exitPrice = payload.exitPrice
    ? Number(payload.exitPrice)
    : isEmaSqueeze
      ? Number(emaSqueezeSocketMarks.get(trade.symbol))
      : (pumpMarkCache.get(trade.symbol) ?? trade.entryPrice);
  if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
    throw new Error(`Chưa có tick socket mới cho ${trade.symbol}; không thể đóng bằng giá cache/entry`);
  }
  const sideMult = trade.side === 'LONG' ? 1 : -1;
  const pnl = (exitPrice - trade.entryPrice) * trade.quantity * sideMult;
  const roe = trade.marginUsdt > 0 ? (pnl / trade.marginUsdt) * 100 : 0;
  const outcome = payload.outcome ?? 'MANUAL';
  store.trades[idx] = { ...trade, status: 'CLOSED', exitPrice, pnl, roe, outcome, closedAt: new Date().toISOString() };
  await writePumpPaperStore(store);
  if (String(trade.source ?? '').startsWith('emasq-')) syncEmaSqueezePaperTicker().catch(() => {});
  else syncPumpPaperTicker().catch(() => {});
  return { trade: enrichPumpPaperTrade(store.trades[idx], exitPrice) };
}

async function deletePumpPaperTrade(payload) {
  const store = await readPumpPaperStore();
  const deleted = store.trades.find((t) => t.id === payload.id);
  store.trades = store.trades.filter((t) => t.id !== payload.id);
  await writePumpPaperStore(store);
  if (String(deleted?.source ?? '').startsWith('emasq-')) syncEmaSqueezePaperTicker().catch(() => {});
  else syncPumpPaperTicker().catch(() => {});
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
  for (const t of open) {
    await checkPumpPaperTpSl(t, markPrice);
    await checkPumpPaperDynamicRisk(t, markPrice);
    await checkEmaSqueezePaperProfit(t, markPrice);
    await checkPumpPaperTimeout(t, markPrice);
  }
}

async function processPumpPaperCachedMarks() {
  if (pumpPaperBatchRunning) return;
  pumpPaperBatchRunning = true;
  try {
  const store = await readPumpPaperStore();
  const snapshotMarks = new Map((_snapshotCache ?? [])
    .map((r) => [r.symbol, Number(r.markPrice ?? r.lastPrice ?? r.price)])
    .filter(([, price]) => Number.isFinite(price) && price > 0));
  const active = store.trades.filter((t) => ['PENDING', 'OPEN'].includes(t.status));
  for (const trade of active) {
    if (String(trade.source ?? '').startsWith('emasq-')) continue;
    const markPrice = pumpMarkCache.get(trade.symbol) ?? sharedMarkTicker.getPrice?.(trade.symbol) ?? snapshotMarks.get(trade.symbol);
    if (!Number.isFinite(Number(markPrice)) || Number(markPrice) <= 0) continue;
    if (trade.status === 'PENDING') await fillPumpPendingTrade(trade, Number(markPrice));
    else {
      await checkPumpPaperTpSl(trade, Number(markPrice));
      await checkPumpPaperDynamicRisk(trade, Number(markPrice));
      await checkEmaSqueezePaperProfit(trade, Number(markPrice));
      await checkPumpPaperTimeout(trade, Number(markPrice));
    }
  }
  scheduleEmaSqueezePaperBroadcast();
  } finally {
    pumpPaperBatchRunning = false;
  }
}

function isPumpBoardPaperSource(source) {
  const s = String(source ?? '');
  return s.startsWith('pump-') && !s.startsWith('pump-short-') && !s.startsWith('emasq-');
}

const pumpPaperDynamicRiskLocks = new Set();
async function checkPumpPaperDynamicRisk(trade, markPrice) {
  if (process.env.PUMP_PAPER_DYNAMIC_MANAGEMENT_ENABLED === 'false') return;
  if (!isPumpBoardPaperSource(trade.source)) return;
  if (pumpPaperDynamicRiskLocks.has(trade.id)) return;

  const sideMult = trade.side === 'LONG' ? 1 : -1;
  const entry = Number(trade.entryPrice);
  const qty = Number(trade.quantity);
  const margin = Number(trade.marginUsdt);
  const mark = Number(markPrice);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(qty) || qty <= 0) return;
  if (!Number.isFinite(margin) || margin <= 0 || !Number.isFinite(mark) || mark <= 0) return;

  const pnl = (mark - entry) * qty * sideMult;
  const roe = (pnl / margin) * 100;
  const prevPeak = pumpPaperPeakRoe.get(trade.id) ?? Number(trade.peakRoe ?? 0) ?? 0;
  const peakRoe = Math.max(prevPeak, roe);
  pumpPaperPeakRoe.set(trade.id, peakRoe);

  const isLong = trade.side === 'LONG';
  const updates = {};
  const notes = [];

  if (process.env.PUMP_PAPER_SL_TRAIL_ENABLED !== 'false') {
    const trailStartRoe = Number(process.env.PUMP_PAPER_TRAIL_START_ROE ?? 10);
    if (roe >= trailStartRoe) {
      const targetLockRoe = getTargetLockRoe(roe);
      if (targetLockRoe != null) {
        const leverage = Math.max(1, Number(trade.leverage) || 1);
        const lockMove = targetLockRoe / 100 / leverage;
        const newSl = isLong ? entry * (1 + lockMove) : entry * (1 - lockMove);
        const curSl = Number(trade.sl ?? 0);
        const improves = !Number.isFinite(curSl) || curSl <= 0
          || (isLong ? newSl > curSl : newSl < curSl);
        const validSide = isLong ? newSl < mark : newSl > mark;
        if (Number.isFinite(newSl) && newSl > 0 && validSide && improves) {
          updates.sl = newSl;
          updates.slTrailLockRoe = targetLockRoe;
          notes.push(`pumpPaperSlTrail=${targetLockRoe}%@${newSl}`);
        }
      }
    }
  }

  if (process.env.PUMP_PAPER_NEG_TP_ENABLED !== 'false') {
    const negTpRoe = Number(process.env.PUMP_PAPER_NEG_TP_ROE ?? -30);
    const alreadyMoved = trade.paperTpMovedToEntry === true || String(trade.note ?? '').includes('pumpPaperTpEntryGuard=');
    if (!alreadyMoved && roe <= negTpRoe) {
      const curTp = Number(trade.tp ?? 0);
      const improvesExit = !Number.isFinite(curTp) || curTp <= 0
        || (isLong ? curTp > entry : curTp < entry);
      const validSide = isLong ? entry > mark : entry < mark;
      if (improvesExit && validSide) {
        updates.tp = entry;
        updates.paperTpMovedToEntry = true;
        updates.paperTpMovedToEntryRoe = +roe.toFixed(2);
        notes.push(`pumpPaperTpEntryGuard=${negTpRoe}%@${entry}`);
      }
    }
  }

  if (!Object.keys(updates).length) return;

  pumpPaperDynamicRiskLocks.add(trade.id);
  try {
    const store = await readPumpPaperStore();
    const idx = store.trades.findIndex((t) => t.id === trade.id && t.status === 'OPEN');
    if (idx < 0) return;
    const row = store.trades[idx];
    const note = [String(row.note ?? ''), ...notes].filter(Boolean).join(' | ').slice(0, 500);
    store.trades[idx] = {
      ...row,
      ...updates,
      peakRoe,
      dynamicRiskUpdatedAt: new Date().toISOString(),
      note,
    };
    await writePumpPaperStore(store);
    console.log(`[PumpPaper] DYNAMIC ${row.side} ${row.symbol} roe=${roe.toFixed(1)}% peak=${peakRoe.toFixed(1)}% sl=${store.trades[idx].sl ?? '-'} tp=${store.trades[idx].tp ?? '-'}`);
  } finally {
    pumpPaperDynamicRiskLocks.delete(trade.id);
  }
}

const emaSqueezeProfitLocks = new Set();
async function checkEmaSqueezePaperProfit(trade, markPrice) {
  if (!String(trade.source ?? '').startsWith('emasq-')) return;
  if (emaSqueezeProfitLocks.has(trade.id)) return;
  if (process.env.EMA_SQUEEZE_PAPER_SL_TRAIL_ENABLED === 'false') return;

  const sideMult = trade.side === 'LONG' ? 1 : -1;
  const entry = Number(trade.entryPrice);
  const qty = Number(trade.quantity);
  const margin = Number(trade.marginUsdt);
  if (!Number.isFinite(entry) || !Number.isFinite(qty) || !Number.isFinite(margin) || margin <= 0) return;

  const pnl = (Number(markPrice) - entry) * qty * sideMult;
  const roe = (pnl / margin) * 100;
  const prevPeak = emaSqueezePaperPeakRoe.get(trade.id) ?? Number(trade.peakRoe ?? 0) ?? 0;
  const peakRoe = Math.max(prevPeak, roe);
  emaSqueezePaperPeakRoe.set(trade.id, peakRoe);

  const trailStartRoe = Number(process.env.EMA_SQUEEZE_PAPER_TRAIL_START_ROE ?? 10);
  if (roe < trailStartRoe) return;
  const targetLockRoe = getTargetLockRoe(roe);
  if (targetLockRoe == null) return;

  emaSqueezeProfitLocks.add(trade.id);
  try {
    const store = await readPumpPaperStore();
    const idx = store.trades.findIndex((t) => t.id === trade.id && t.status === 'OPEN');
    if (idx < 0) return;
    const row = store.trades[idx];
    const leverage = Math.max(1, Number(row.leverage ?? trade.leverage) || 1);
    const isLong = row.side === 'LONG';
    const lockMove = targetLockRoe / 100 / leverage;
    const newSl = isLong ? entry * (1 + lockMove) : entry * (1 - lockMove);
    const mark = Number(markPrice);
    if (!Number.isFinite(newSl) || newSl <= 0 || !Number.isFinite(mark) || mark <= 0) return;
    if ((isLong && newSl >= mark) || (!isLong && newSl <= mark)) return;

    const curSl = Number(row.sl ?? 0);
    const improves = !Number.isFinite(curSl) || curSl <= 0
      || (isLong ? newSl > curSl : newSl < curSl);
    if (!improves) return;

    const notePart = `paperSlTrail=${targetLockRoe}%@${newSl}`;
    store.trades[idx] = {
      ...row,
      sl: newSl,
      peakRoe,
      slTrailLockRoe: targetLockRoe,
      note: [String(row.note ?? ''), notePart].filter(Boolean).join(' | ').slice(0, 500),
    };
    await writePumpPaperStore(store);
    console.log(`[EmaSqueezePaper] SL_TRAIL ${row.side} ${row.symbol} roe=${roe.toFixed(1)}% peak=${peakRoe.toFixed(1)}% lock=${targetLockRoe}% sl=${newSl}`);
  } finally {
    emaSqueezeProfitLocks.delete(trade.id);
  }
}

const pumpPaperTimeoutLocks = new Set();
async function checkPumpPaperTimeout(trade, markPrice) {
  if (!trade.openedAt) return;
  if (String(trade.source ?? '').startsWith('emasq-')) return;
  const timeoutMs = runtimeSettings.pumpPaperTimeoutH * 3600_000;
  const openedMs  = Date.parse(trade.openedAt);
  if (Date.now() - openedMs < timeoutMs) return;

  // Tính ROE theo mark price hiện tại
  const sideMult = trade.side === 'LONG' ? 1 : -1;
  const pnl = (markPrice - Number(trade.entryPrice)) * Number(trade.quantity) * sideMult;
  const roe = Number(trade.marginUsdt) > 0 ? (pnl / Number(trade.marginUsdt)) * 100 : 0;

  // Chỉ chốt khi đang lời > 1% — âm/flat thì để SL tự xử lý
  if (roe <= 1) return;

  if (pumpPaperTimeoutLocks.has(trade.id)) return;
  pumpPaperTimeoutLocks.add(trade.id);
  try {
    await closePumpPaperTrade({ id: trade.id, exitPrice: markPrice, outcome: 'TIMEOUT' });
    console.log(`[PumpPaper] ⏱ TIMEOUT ${trade.side} ${trade.symbol} roe=${roe.toFixed(1)}% after ${runtimeSettings.pumpPaperTimeoutH}h`);
  } finally {
    pumpPaperTimeoutLocks.delete(trade.id);
  }
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
  const symbols = [...new Set(store.trades
    .filter((t) => ['PENDING', 'OPEN'].includes(t.status) && !String(t.source ?? '').startsWith('emasq-'))
    .map((t) => t.symbol))];
  sharedMarkTicker.setSymbols('pumpPaper', symbols);
}

async function processEmaSqueezePaperSymbol(symbol, markPrice) {
  const store = await readPumpPaperStore();
  const trades = store.trades.filter((t) =>
    t.symbol === symbol
    && ['PENDING', 'OPEN'].includes(t.status)
    && String(t.source ?? '').startsWith('emasq-'));
  for (const trade of trades) {
    if (trade.status === 'PENDING') {
      await fillPumpPendingTrade(trade, markPrice);
      continue;
    }
    await checkPumpPaperTpSl(trade, markPrice);
    await checkEmaSqueezePaperProfit(trade, markPrice);
  }
}

function queueEmaSqueezePaperProcessing(symbol, markPrice) {
  emaSqueezePendingProcess.set(symbol, markPrice);
  if (emaSqueezeProcessTimer || emaSqueezeProcessRunning) return;
  emaSqueezeProcessTimer = setTimeout(drainEmaSqueezePaperProcessing, 250);
}

async function drainEmaSqueezePaperProcessing() {
  emaSqueezeProcessTimer = null;
  if (emaSqueezeProcessRunning) return;
  const next = emaSqueezePendingProcess.entries().next();
  if (next.done) return;
  const [symbol, markPrice] = next.value;
  emaSqueezePendingProcess.delete(symbol);
  emaSqueezeProcessRunning = true;
  try {
    if (Number.isFinite(Number(markPrice)) && Number(markPrice) > 0) {
      await processEmaSqueezePaperSymbol(symbol, Number(markPrice));
    }
  } catch (err) {
    console.warn(`[EmaSqueezePaper] socket processing ${symbol}:`, err.message);
  } finally {
    emaSqueezeProcessRunning = false;
    if (emaSqueezePendingProcess.size > 0 && !emaSqueezeProcessTimer) {
      emaSqueezeProcessTimer = setTimeout(drainEmaSqueezePaperProcessing, 250);
    }
  }
}

async function syncEmaSqueezePaperTicker() {
  if (!emaSqueezePaperTicker) return;
  const store = await readPumpPaperStore();
  const symbols = [...new Set(store.trades
    .filter((t) =>
      ['PENDING', 'OPEN'].includes(t.status)
      && String(t.source ?? '').startsWith('emasq-'))
    .map((t) => t.symbol))];
  emaSqueezePaperTicker.setSymbols(symbols);
}

function startEmaSqueezePaperTicker() {
  if (emaSqueezePaperTicker) return;
  emaSqueezePaperTicker = createAggTradeTicker({
    logLabel: 'EmaSqueezeTick',
    onPrice: ({ symbol, markPrice, eventTime }) => {
      emaSqueezeSocketMarks.set(symbol, markPrice);
      emaSqueezeSocketMarkAt.set(symbol, eventTime);
      scheduleEmaSqueezePaperBroadcast();
      queueEmaSqueezePaperProcessing(symbol, markPrice);
    },
  });
  console.log('[EmaSqueezePaper] Dedicated socket-only last-price ticker started.');
  syncEmaSqueezePaperTicker().catch(() => {});
  setInterval(() => syncEmaSqueezePaperTicker().catch(() => {}), 30_000);
}

function startPumpPaperTicker() {
  if (pumpPaperTicker) return;
  pumpPaperTicker = true; // guard flag — actual WS is sharedMarkTicker
  sharedMarkTicker.register('pumpPaper', ({ symbol, markPrice }) => {
    pumpMarkCache.set(symbol, markPrice);
    scheduleEmaSqueezePaperBroadcast();
  });
  console.log('[PumpPaper] Mark ticker started (shared, 1s batched processing).');
  syncPumpPaperTicker().catch(() => {});
  setInterval(() => syncPumpPaperTicker().catch(() => {}), 30_000);
  setInterval(() => processPumpPaperCachedMarks().catch((err) => {
    console.warn('[PumpPaper] Batch mark processing failed:', err.message);
  }), 1_000);
  setInterval(() => expireOldEmaSqueezePending().catch(() => {}), 60_000);
  startEmaSqueezePaperTicker();
}

// Xóa lệnh EMA Squeeze paper PENDING quá TTL (4h) chưa khớp (chỉ source emasq-, không đụng pump strategy)
async function expireOldEmaSqueezePending() {
  const ttlMs = Number(process.env.EMA_SQUEEZE_PAPER_PENDING_TTL_MS ?? 4 * 3600 * 1000);
  const store = await readPumpPaperStore();
  const now = Date.now();
  const keep = [];
  let removed = 0;
  for (const t of store.trades) {
    if (t.status === 'PENDING' && String(t.source ?? '').startsWith('emasq-')
        && (now - (Date.parse(t.createdAt ?? 0) || now)) > ttlMs) {
      console.log(`[EmaSqueezePaper] EXPIRE pending ${t.side} ${t.symbol} - >${(ttlMs / 3600000).toFixed(0)}h chưa khớp, xóa lệnh`);
      removed++;
      continue;
    }
    keep.push(t);
  }
  if (removed) {
    store.trades = keep;
    await writePumpPaperStore(store);
    syncEmaSqueezePaperTicker().catch(() => {});
  }
}

// ── End pump paper trade system ───────────────────────────────────────────────

// Edge paper trade system (private to /edge-short)
async function readEdgePaperStore() {
  try {
    const raw = await readFile(EDGE_PAPER_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.trades)) throw new Error('invalid structure');
    return parsed;
  } catch (e) {
    console.warn('[EdgePaper] Store read error, starting fresh:', e.message);
    return { trades: [] };
  }
}

let _edgePaperWriteLock = Promise.resolve();
async function writeEdgePaperStore(store) {
  _edgePaperWriteLock = _edgePaperWriteLock.then(() => atomicWriteJson(EDGE_PAPER_FILE, store));
  return _edgePaperWriteLock;
}

function enrichEdgePaperTrade(t, markPrice) {
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

async function getEdgePaperTrades() {
  const store = await readEdgePaperStore();
  const trades = store.trades.map((t) => enrichEdgePaperTrade(t, edgeMarkCache.get(t.symbol)));
  const open = trades.filter((t) => t.status !== 'CLOSED');
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const tpHits = closed.filter((t) => t.outcome === 'TP').length;
  const slHits = closed.filter((t) => t.outcome === 'SL').length;
  const avgRoe = closed.length > 0 ? closed.reduce((s, t) => s + (t.roe ?? 0), 0) / closed.length : null;
  const summary = {
    total: trades.length,
    open: open.length,
    closed: closed.length,
    wins,
    losses: closed.length - wins,
    tpHits,
    slHits,
    avgRoe: avgRoe != null ? +avgRoe.toFixed(1) : null,
  };
  return { trades, summary };
}

async function createEdgePaperTrade(payload) {
  const symbol = String(payload.symbol ?? '').toUpperCase().trim();
  const side = String(payload.side ?? '').toUpperCase();
  const marginUsdt = Number(payload.marginUsdt ?? 1);
  const leverage = Math.max(1, Math.min(125, Number(payload.leverage ?? 10)));
  const entryPrice = Number(payload.entryPrice);

  if (!symbol) throw new Error('symbol required');
  if (!['LONG', 'SHORT'].includes(side)) throw new Error('side must be LONG or SHORT');
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error('entryPrice required');

  const store = await readEdgePaperStore();
  const dup = store.trades.find((t) =>
    t.symbol === symbol && t.side === side && Math.abs(t.entryPrice - entryPrice) / entryPrice < 0.005 &&
    ['PENDING', 'OPEN'].includes(t.status),
  );
  if (dup) return { trade: enrichEdgePaperTrade(dup, edgeMarkCache.get(symbol)) };

  const status = payload.status === 'OPEN' ? 'OPEN' : 'PENDING';
  const maxShortSlRoe = Number(process.env.EDGE_SHORT_MAX_SL_ROE ?? 25);
  const rawTp = payload.tp != null ? Number(payload.tp) : null;
  let rawSl = payload.sl != null ? Number(payload.sl) : null;
  let riskNote = '';
  if (side === 'SHORT' && Number.isFinite(rawSl) && rawSl > entryPrice && maxShortSlRoe > 0) {
    const slRoe = ((rawSl - entryPrice) / entryPrice) * leverage * 100;
    if (slRoe > maxShortSlRoe) {
      const cappedSl = entryPrice * (1 + (maxShortSlRoe / 100) / leverage);
      rawSl = +cappedSl.toFixed(10);
      riskNote = ` | slClamp=${maxShortSlRoe}%ROE`;
      console.log(`[EdgePaper] clamp SHORT SL ${symbol}: ${slRoe.toFixed(1)}%ROE → ${maxShortSlRoe}%ROE`);
    }
  }
  const trade = {
    id: crypto.randomUUID(),
    symbol,
    side,
    status,
    marginUsdt,
    leverage,
    quantity: (marginUsdt * leverage) / entryPrice,
    entryPrice,
    tp: Number.isFinite(rawTp) ? rawTp : null,
    sl: Number.isFinite(rawSl) ? rawSl : null,
    fillPrice: status === 'OPEN' ? entryPrice : null,
    exitPrice: null,
    pnl: null,
    roe: null,
    outcome: null,
    createdAt: new Date().toISOString(),
    openedAt: status === 'OPEN' ? new Date().toISOString() : null,
    closedAt: null,
    source: String(payload.source ?? 'edge').slice(0, 80),
    note: `${String(payload.note ?? '').slice(0, 460)}${riskNote}`,
  };
  store.trades.unshift(trade);
  await writeEdgePaperStore(store);
  await syncEdgePaperTicker();
  console.log(`[EdgePaper] ${status} ${side} ${symbol} entry=${entryPrice} src=${trade.source}`);
  return { trade: enrichEdgePaperTrade(trade, entryPrice) };
}

async function closeEdgePaperTrade(payload) {
  const store = await readEdgePaperStore();
  const idx = store.trades.findIndex((t) => t.id === payload.id);
  if (idx < 0) throw new Error('Edge paper trade not found');
  const trade = store.trades[idx];
  if (trade.status === 'CLOSED') return { trade: enrichEdgePaperTrade(trade, trade.exitPrice) };
  const exitPrice = payload.exitPrice ? Number(payload.exitPrice) : (edgeMarkCache.get(trade.symbol) ?? trade.entryPrice);
  const sideMult = trade.side === 'LONG' ? 1 : -1;
  const pnl = (exitPrice - trade.entryPrice) * trade.quantity * sideMult;
  const roe = trade.marginUsdt > 0 ? (pnl / trade.marginUsdt) * 100 : 0;
  const outcome = payload.outcome ?? 'MANUAL';
  store.trades[idx] = { ...trade, status: 'CLOSED', exitPrice, pnl, roe, outcome, closedAt: new Date().toISOString() };
  await writeEdgePaperStore(store);
  await syncEdgePaperTicker();
  return { trade: enrichEdgePaperTrade(store.trades[idx], exitPrice) };
}

async function deleteEdgePaperTrade(payload) {
  const store = await readEdgePaperStore();
  store.trades = store.trades.filter((t) => t.id !== payload.id);
  await writeEdgePaperStore(store);
  await syncEdgePaperTicker();
  return { ok: true };
}

async function fillEdgePendingTrade(trade, markPrice) {
  if (edgePaperFillLocks.has(trade.id)) return;
  edgePaperFillLocks.add(trade.id);
  try {
    const store = await readEdgePaperStore();
    const idx = store.trades.findIndex((t) => t.id === trade.id && t.status === 'PENDING');
    if (idx < 0) return;
    const entry = Number(store.trades[idx].entryPrice);
    const touched = store.trades[idx].side === 'LONG' ? markPrice <= entry : markPrice >= entry;
    if (!touched) return;
    store.trades[idx] = { ...store.trades[idx], status: 'OPEN', fillPrice: entry, openedAt: new Date().toISOString() };
    await writeEdgePaperStore(store);
    console.log(`[EdgePaper] FILLED ${store.trades[idx].side} ${store.trades[idx].symbol} entry=${entry} mark=${markPrice}`);
  } finally {
    edgePaperFillLocks.delete(trade.id);
  }
}

async function processEdgePaperFills(symbol, markPrice) {
  const store = await readEdgePaperStore();
  const pending = store.trades.filter((t) => t.status === 'PENDING' && t.symbol === symbol);
  for (const t of pending) await fillEdgePendingTrade(t, markPrice);
  const open = store.trades.filter((t) => t.status === 'OPEN' && t.symbol === symbol);
  for (const t of open) {
    await checkEdgePaperTpSl(t, markPrice);
    await checkEdgePaperTimeout(t, markPrice);
  }
}

async function processEdgePaperCachedMarks() {
  if (edgePaperBatchRunning) return;
  edgePaperBatchRunning = true;
  try {
    const store = await readEdgePaperStore();
    const active = store.trades.filter((t) => ['PENDING', 'OPEN'].includes(t.status));
    for (const trade of active) {
      const markPrice = Number(edgeMarkCache.get(trade.symbol) ?? sharedMarkTicker.getPrice?.(trade.symbol));
      if (!Number.isFinite(markPrice) || markPrice <= 0) continue;
      if (trade.status === 'PENDING') await fillEdgePendingTrade(trade, markPrice);
      else {
        await checkEdgePaperTpSl(trade, markPrice);
        await checkEdgePaperTimeout(trade, markPrice);
      }
    }
  } finally {
    edgePaperBatchRunning = false;
  }
}

const edgePaperTimeoutLocks = new Set();
async function checkEdgePaperTimeout(trade, markPrice) {
  if (!trade.openedAt) return;
  const timeoutH = Number(process.env.EDGE_PAPER_TIMEOUT_H ?? runtimeSettings.pumpPaperTimeoutH ?? 3);
  const timeoutMs = timeoutH * 3600_000;
  const openedMs = Date.parse(trade.openedAt);
  if (Date.now() - openedMs < timeoutMs) return;

  const sideMult = trade.side === 'LONG' ? 1 : -1;
  const pnl = (markPrice - Number(trade.entryPrice)) * Number(trade.quantity) * sideMult;
  const roe = Number(trade.marginUsdt) > 0 ? (pnl / Number(trade.marginUsdt)) * 100 : 0;
  if (roe <= 1) return;

  if (edgePaperTimeoutLocks.has(trade.id)) return;
  edgePaperTimeoutLocks.add(trade.id);
  try {
    await closeEdgePaperTrade({ id: trade.id, exitPrice: markPrice, outcome: 'TIMEOUT' });
    console.log(`[EdgePaper] TIMEOUT ${trade.side} ${trade.symbol} roe=${roe.toFixed(1)}% after ${timeoutH}h`);
  } finally {
    edgePaperTimeoutLocks.delete(trade.id);
  }
}

const edgePaperTpSlLocks = new Set();
async function checkEdgePaperTpSl(trade, markPrice) {
  if (!trade.tp && !trade.sl) return;
  if (edgePaperTpSlLocks.has(trade.id)) return;
  const isLong = trade.side === 'LONG';
  const tpHit = trade.tp != null && (isLong ? markPrice >= trade.tp : markPrice <= trade.tp);
  const slHit = trade.sl != null && (isLong ? markPrice <= trade.sl : markPrice >= trade.sl);
  if (!tpHit && !slHit) return;
  edgePaperTpSlLocks.add(trade.id);
  try {
    const outcome = tpHit ? 'TP' : 'SL';
    const exitPrice = tpHit ? trade.tp : trade.sl;
    await closeEdgePaperTrade({ id: trade.id, exitPrice, outcome });
    console.log(`[EdgePaper] ${outcome} hit ${trade.side} ${trade.symbol} exit=${exitPrice}`);
  } finally {
    edgePaperTpSlLocks.delete(trade.id);
  }
}

async function syncEdgePaperTicker() {
  if (!edgePaperTicker) return;
  const store = await readEdgePaperStore();
  const symbols = [...new Set(store.trades.filter((t) => ['PENDING', 'OPEN'].includes(t.status)).map((t) => t.symbol))];
  sharedMarkTicker.setSymbols('edgePaper', symbols);
}

function startEdgePaperTicker() {
  if (edgePaperTicker) return;
  edgePaperTicker = true; // guard flag — actual WS is sharedMarkTicker
  sharedMarkTicker.register('edgePaper', ({ symbol, markPrice }) => {
    edgeMarkCache.set(symbol, markPrice);
  });
  console.log('[EdgePaper] Mark ticker started (shared, 1s batched processing).');
  syncEdgePaperTicker().catch(() => {});
  setInterval(() => syncEdgePaperTicker().catch(() => {}), 30_000);
  setInterval(() => processEdgePaperCachedMarks().catch((err) => {
    console.warn('[EdgePaper] Batch mark processing failed:', err.message);
  }), 1_000);
}

// ── SR Paper Trades (Spike Reversal) ─────────────────────────────────────────

async function readSrPaperStore() {
  try {
    const raw = await readFile(SR_PAPER_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.trades)) throw new Error('invalid structure');
    return parsed;
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[SrPaper] Store read error, starting fresh:', e.message);
    return { trades: [] };
  }
}

let _srPaperWriteLock = Promise.resolve();
async function writeSrPaperStore(store) {
  _srPaperWriteLock = _srPaperWriteLock.then(() => atomicWriteJson(SR_PAPER_FILE, store));
  return _srPaperWriteLock;
}

function enrichSrPaperTrade(t, markPrice) {
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

async function getSrPaperTrades() {
  const store = await readSrPaperStore();
  const trades = store.trades.map((t) => enrichSrPaperTrade(t, srMarkCache.get(t.symbol)));
  const open   = trades.filter((t) => t.status !== 'CLOSED');
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const wins   = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const tpHits = closed.filter((t) => t.outcome === 'TP').length;
  const slHits = closed.filter((t) => t.outcome === 'SL').length;
  const avgRoe = closed.length > 0
    ? closed.reduce((s, t) => s + (t.roe ?? 0), 0) / closed.length : null;
  const summary = {
    total: trades.length, open: open.length, closed: closed.length,
    wins, losses: closed.length - wins, tpHits, slHits,
    avgRoe: avgRoe != null ? +avgRoe.toFixed(1) : null,
  };
  return { trades, summary };
}

async function createSrPaperTrade(payload) {
  const symbol = String(payload.symbol ?? '').toUpperCase().trim();
  const side = String(payload.side ?? 'SHORT').toUpperCase();
  const marginUsdt = Number(payload.marginUsdt ?? 1);
  const leverage = Math.max(1, Math.min(125, Number(payload.leverage ?? 10)));
  const entryPrice = Number(payload.entryPrice);

  if (!symbol) throw new Error('symbol required');
  if (!['LONG', 'SHORT'].includes(side)) throw new Error('side must be LONG or SHORT');
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error('entryPrice required');

  const store = await readSrPaperStore();
  const dup = store.trades.find((t) =>
    t.symbol === symbol && t.side === side &&
    Math.abs(t.entryPrice - entryPrice) / entryPrice < 0.005 &&
    ['PENDING', 'OPEN'].includes(t.status),
  );
  if (dup) return { trade: enrichSrPaperTrade(dup, srMarkCache.get(symbol)) };

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
  await writeSrPaperStore(store);
  console.log(`[SrPaper] ${status === 'PENDING' ? '⏳' : '✅'} ${side} ${symbol} entry=${entryPrice} src=${trade.source}`);
  return { trade: enrichSrPaperTrade(trade, entryPrice) };
}

async function closeSrPaperTrade(payload) {
  const store = await readSrPaperStore();
  const idx = store.trades.findIndex((t) => t.id === payload.id);
  if (idx < 0) throw new Error('SR paper trade not found');
  const trade = store.trades[idx];
  if (trade.status === 'CLOSED') return { trade: enrichSrPaperTrade(trade, trade.exitPrice) };
  const exitPrice = payload.exitPrice ? Number(payload.exitPrice) : (srMarkCache.get(trade.symbol) ?? trade.entryPrice);
  const sideMult = trade.side === 'LONG' ? 1 : -1;
  const pnl = (exitPrice - trade.entryPrice) * trade.quantity * sideMult;
  const roe = trade.marginUsdt > 0 ? (pnl / trade.marginUsdt) * 100 : 0;
  const outcome = payload.outcome ?? 'MANUAL';
  store.trades[idx] = { ...trade, status: 'CLOSED', exitPrice, pnl, roe, outcome, closedAt: new Date().toISOString() };
  await writeSrPaperStore(store);
  return { trade: enrichSrPaperTrade(store.trades[idx], exitPrice) };
}

async function deleteSrPaperTrade(payload) {
  const store = await readSrPaperStore();
  store.trades = store.trades.filter((t) => t.id !== payload.id);
  await writeSrPaperStore(store);
  return { ok: true };
}

async function fillSrPendingTrade(trade, markPrice) {
  if (srPaperFillLocks.has(trade.id)) return;
  srPaperFillLocks.add(trade.id);
  try {
    const store = await readSrPaperStore();
    const idx = store.trades.findIndex((t) => t.id === trade.id && t.status === 'PENDING');
    if (idx < 0) return;
    const entry = Number(store.trades[idx].entryPrice);
    const touched = store.trades[idx].side === 'LONG' ? markPrice <= entry : markPrice >= entry;
    if (!touched) return;
    store.trades[idx] = { ...store.trades[idx], status: 'OPEN', fillPrice: entry, openedAt: new Date().toISOString() };
    await writeSrPaperStore(store);
    console.log(`[SrPaper] ✅ FILLED ${store.trades[idx].side} ${store.trades[idx].symbol} entry=${entry} mark=${markPrice}`);
  } finally {
    srPaperFillLocks.delete(trade.id);
  }
}

async function processSrPaperFills(symbol, markPrice) {
  const store = await readSrPaperStore();
  const pending = store.trades.filter((t) => t.status === 'PENDING' && t.symbol === symbol);
  for (const t of pending) await fillSrPendingTrade(t, markPrice);
  const open = store.trades.filter((t) => t.status === 'OPEN' && t.symbol === symbol);
  for (const t of open) await checkSrPaperTpSl(t, markPrice);
}

const srPaperTpSlLocks = new Set();
async function checkSrPaperTpSl(trade, markPrice) {
  if (!trade.tp && !trade.sl) return;
  if (srPaperTpSlLocks.has(trade.id)) return;
  const isLong = trade.side === 'LONG';
  const tpHit = trade.tp != null && (isLong ? markPrice >= trade.tp : markPrice <= trade.tp);
  const slHit = trade.sl != null && (isLong ? markPrice <= trade.sl : markPrice >= trade.sl);
  if (!tpHit && !slHit) return;
  srPaperTpSlLocks.add(trade.id);
  try {
    const outcome = tpHit ? 'TP' : 'SL';
    const exitPrice = tpHit ? trade.tp : trade.sl;
    await closeSrPaperTrade({ id: trade.id, exitPrice, outcome });
    console.log(`[SrPaper] 🎯 ${outcome} hit ${trade.side} ${trade.symbol} exit=${exitPrice}`);
  } finally {
    srPaperTpSlLocks.delete(trade.id);
  }
}

async function syncSrPaperTicker() {
  if (!srPaperTicker) return;
  const store = await readSrPaperStore();
  const symbols = [...new Set(store.trades.filter((t) => ['PENDING', 'OPEN'].includes(t.status)).map((t) => t.symbol))];
  sharedMarkTicker.setSymbols('srPaper', symbols);
}

function startSrPaperTicker() {
  if (srPaperTicker) return;
  srPaperTicker = true; // guard flag — actual WS is sharedMarkTicker
  sharedMarkTicker.register('srPaper', ({ symbol, markPrice }) => {
    srMarkCache.set(symbol, markPrice);
    processSrPaperFills(symbol, markPrice).catch(() => {});
  });
  console.log('[SrPaper] Mark ticker started (shared).');
  syncSrPaperTicker().catch(() => {});
  setInterval(() => syncSrPaperTicker().catch(() => {}), 30_000);
}

// ── PPKS Paper Trades (Post Pump Kill Short / Post Dump Kill Long) ─────────────

async function readPpksPaperStore() {
  try {
    const raw = await readFile(PPKS_PAPER_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.trades)) throw new Error('invalid structure');
    return parsed;
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[PpksPaper] Store read error, starting fresh:', e.message);
    return { trades: [] };
  }
}

let _ppksPaperWriteLock = Promise.resolve();
async function writePpksPaperStore(store) {
  _ppksPaperWriteLock = _ppksPaperWriteLock.then(() => atomicWriteJson(PPKS_PAPER_FILE, store));
  return _ppksPaperWriteLock;
}

function enrichPpksPaperTrade(t, markPrice) {
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

async function getPpksPaperTrades() {
  const store = await readPpksPaperStore();
  const trades = store.trades.map((t) => enrichPpksPaperTrade(t, ppksMarkCache.get(t.symbol)));
  const open   = trades.filter((t) => t.status !== 'CLOSED');
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const wins   = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const tpHits = closed.filter((t) => t.outcome === 'TP').length;
  const slHits = closed.filter((t) => t.outcome === 'SL').length;
  const avgRoe = closed.length > 0
    ? closed.reduce((s, t) => s + (t.roe ?? 0), 0) / closed.length : null;
  const summary = {
    total: trades.length, open: open.length, closed: closed.length,
    wins, losses: closed.length - wins, tpHits, slHits,
    avgRoe: avgRoe != null ? +avgRoe.toFixed(1) : null,
  };
  return { trades, summary };
}

async function createPpksPaperTrade(payload) {
  const symbol = String(payload.symbol ?? '').toUpperCase().trim();
  const side = String(payload.side ?? 'SHORT').toUpperCase();
  const marginUsdt = Number(payload.marginUsdt ?? 1);
  const leverage = Math.max(1, Math.min(125, Number(payload.leverage ?? 10)));
  const entryPrice = Number(payload.entryPrice);

  if (!symbol) throw new Error('symbol required');
  if (!['LONG', 'SHORT'].includes(side)) throw new Error('side must be LONG or SHORT');
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error('entryPrice required');

  const store = await readPpksPaperStore();
  const dup = store.trades.find((t) =>
    t.symbol === symbol && t.side === side &&
    Math.abs(t.entryPrice - entryPrice) / entryPrice < 0.005 &&
    ['PENDING', 'OPEN'].includes(t.status),
  );
  if (dup) return { trade: enrichPpksPaperTrade(dup, ppksMarkCache.get(symbol)) };

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
  await writePpksPaperStore(store);
  console.log(`[PpksPaper] ${status === 'PENDING' ? '⏳' : '✅'} ${side} ${symbol} entry=${entryPrice} src=${trade.source}`);
  return { trade: enrichPpksPaperTrade(trade, entryPrice) };
}

async function closePpksPaperTrade(payload) {
  const store = await readPpksPaperStore();
  const idx = store.trades.findIndex((t) => t.id === payload.id);
  if (idx < 0) throw new Error('PPKS paper trade not found');
  const trade = store.trades[idx];
  if (trade.status === 'CLOSED') return { trade: enrichPpksPaperTrade(trade, trade.exitPrice) };
  const exitPrice = payload.exitPrice ? Number(payload.exitPrice) : (ppksMarkCache.get(trade.symbol) ?? trade.entryPrice);
  const sideMult = trade.side === 'LONG' ? 1 : -1;
  const pnl = (exitPrice - trade.entryPrice) * trade.quantity * sideMult;
  const roe = trade.marginUsdt > 0 ? (pnl / trade.marginUsdt) * 100 : 0;
  const outcome = payload.outcome ?? 'MANUAL';
  store.trades[idx] = { ...trade, status: 'CLOSED', exitPrice, pnl, roe, outcome, closedAt: new Date().toISOString() };
  await writePpksPaperStore(store);
  return { trade: enrichPpksPaperTrade(store.trades[idx], exitPrice) };
}

async function deletePpksPaperTrade(payload) {
  const store = await readPpksPaperStore();
  store.trades = store.trades.filter((t) => t.id !== payload.id);
  await writePpksPaperStore(store);
  return { ok: true };
}

async function fillPpksPendingTrade(trade, markPrice) {
  if (ppksPaperFillLocks.has(trade.id)) return;
  ppksPaperFillLocks.add(trade.id);
  try {
    const store = await readPpksPaperStore();
    const idx = store.trades.findIndex((t) => t.id === trade.id && t.status === 'PENDING');
    if (idx < 0) return;
    const entry = Number(store.trades[idx].entryPrice);
    const touched = store.trades[idx].side === 'LONG' ? markPrice <= entry : markPrice >= entry;
    if (!touched) return;
    store.trades[idx] = { ...store.trades[idx], status: 'OPEN', fillPrice: entry, openedAt: new Date().toISOString() };
    await writePpksPaperStore(store);
    console.log(`[PpksPaper] ✅ FILLED ${store.trades[idx].side} ${store.trades[idx].symbol} entry=${entry} mark=${markPrice}`);
  } finally {
    ppksPaperFillLocks.delete(trade.id);
  }
}

async function processPpksPaperFills(symbol, markPrice) {
  const store = await readPpksPaperStore();
  const pending = store.trades.filter((t) => t.status === 'PENDING' && t.symbol === symbol);
  for (const t of pending) await fillPpksPendingTrade(t, markPrice);
  const open = store.trades.filter((t) => t.status === 'OPEN' && t.symbol === symbol);
  for (const t of open) await checkPpksPaperTpSl(t, markPrice);
}

const ppksPaperTpSlLocks = new Set();
async function checkPpksPaperTpSl(trade, markPrice) {
  if (!trade.tp && !trade.sl) return;
  if (ppksPaperTpSlLocks.has(trade.id)) return;
  const isLong = trade.side === 'LONG';
  const tpHit = trade.tp != null && (isLong ? markPrice >= trade.tp : markPrice <= trade.tp);
  const slHit = trade.sl != null && (isLong ? markPrice <= trade.sl : markPrice >= trade.sl);
  if (!tpHit && !slHit) return;
  ppksPaperTpSlLocks.add(trade.id);
  try {
    const outcome = tpHit ? 'TP' : 'SL';
    const exitPrice = tpHit ? trade.tp : trade.sl;
    await closePpksPaperTrade({ id: trade.id, exitPrice, outcome });
    console.log(`[PpksPaper] 🎯 ${outcome} hit ${trade.side} ${trade.symbol} exit=${exitPrice}`);
  } finally {
    ppksPaperTpSlLocks.delete(trade.id);
  }
}

async function syncPpksPaperTicker() {
  if (!ppksPaperTicker) return;
  const store = await readPpksPaperStore();
  const symbols = [...new Set(store.trades.filter((t) => ['PENDING', 'OPEN'].includes(t.status)).map((t) => t.symbol))];
  sharedMarkTicker.setSymbols('ppksPaper', symbols);
}

function startPpksPaperTicker() {
  if (ppksPaperTicker) return;
  ppksPaperTicker = true; // guard flag — actual WS is sharedMarkTicker
  sharedMarkTicker.register('ppksPaper', ({ symbol, markPrice }) => {
    ppksMarkCache.set(symbol, markPrice);
    processPpksPaperFills(symbol, markPrice).catch(() => {});
  });
  console.log('[PpksPaper] Mark ticker started (shared).');
  syncPpksPaperTicker().catch(() => {});
  setInterval(() => syncPpksPaperTicker().catch(() => {}), 30_000);
}

// Shakeout Reclaim Paper Trades

async function readShakeoutPaperStore() {
  try {
    const raw = await readFile(SHAKEOUT_PAPER_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.trades)) throw new Error('invalid structure');
    return parsed;
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[ShakeoutPaper] Store read error, starting fresh:', e.message);
    return { trades: [] };
  }
}

let _shakeoutPaperWriteLock = Promise.resolve();
async function writeShakeoutPaperStore(store) {
  _shakeoutPaperWriteLock = _shakeoutPaperWriteLock.then(() => atomicWriteJson(SHAKEOUT_PAPER_FILE, store));
  return _shakeoutPaperWriteLock;
}

function enrichShakeoutPaperTrade(t, markPrice) {
  const liveMark = Number(markPrice);
  const hasLiveMark = Number.isFinite(liveMark) && liveMark > 0;
  const needsLiveMark = t.status === 'OPEN' || t.status === 'PENDING';
  const mark = needsLiveMark
    ? (hasLiveMark ? liveMark : null)
    : Number(t.exitPrice ?? t.entryPrice);
  const entry = Number(t.entryPrice);
  const qty = Number(t.quantity);
  const margin = Number(t.marginUsdt);
  const sideMult = t.side === 'LONG' ? 1 : -1;
  const isActive = t.status === 'OPEN';
  const pnl = isActive
    ? (hasLiveMark ? (liveMark - entry) * qty * sideMult : null)
    : (t.pnl ?? null);
  const roe = isActive && margin > 0
    ? (pnl == null ? null : (pnl / margin) * 100)
    : (t.roe ?? null);
  return {
    ...t,
    markPrice: mark,
    markUpdatedAt: shakeoutSocketMarkAt.get(String(t.symbol ?? '').toUpperCase()) ?? null,
    pnl,
    roe,
  };
}

function getShakeoutPaperMark(symbol) {
  const key = String(symbol ?? '').toUpperCase();
  const wsMark = Number(shakeoutSocketMarks.get(key));
  if (Number.isFinite(wsMark) && wsMark > 0) return wsMark;
  return null;
}

async function getShakeoutPaperTrades() {
  const store = await readShakeoutPaperStore();
  const trades = store.trades.map((t) => enrichShakeoutPaperTrade(
    t,
    getShakeoutPaperMark(t.symbol),
  ));
  const open = trades.filter((t) => t.status !== 'CLOSED');
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const invalid = closed.filter((t) => t.outcome === 'INVALID').length;
  const validClosed = closed.filter((t) => t.outcome !== 'INVALID');
  const wins = validClosed.filter((t) => (t.pnl ?? 0) > 0).length;
  const tpHits = validClosed.filter((t) => t.outcome === 'TP').length;
  const slHits = validClosed.filter((t) => t.outcome === 'SL').length;
  const avgRoe = validClosed.length > 0 ? validClosed.reduce((s, t) => s + (t.roe ?? 0), 0) / validClosed.length : null;

  // Thống kê theo ngày (group theo closedAt, bỏ INVALID)
  const dailyMap = new Map();
  for (const t of validClosed) {
    const date = String(t.closedAt ?? t.createdAt ?? '').slice(0, 10);
    if (!date) continue;
    const d = dailyMap.get(date) ?? {
      date, orders: 0, wins: 0, losses: 0, tpHits: 0, slHits: 0,
      totalPnl: 0, totalRoe: 0, winRate: 0, avgPnl: 0,
    };
    const pnl = Number(t.pnl ?? 0);
    d.orders += 1;
    if (pnl > 0) d.wins += 1; else d.losses += 1;
    if (t.outcome === 'TP') d.tpHits += 1;
    if (t.outcome === 'SL') d.slHits += 1;
    d.totalPnl = +(d.totalPnl + pnl).toFixed(4);
    d.totalRoe = +(d.totalRoe + Number(t.roe ?? 0)).toFixed(2);
    dailyMap.set(date, d);
  }
  const daily = [...dailyMap.values()]
    .map((d) => ({
      ...d,
      winRate: d.orders > 0 ? +((d.wins / d.orders) * 100).toFixed(1) : 0,
      avgPnl: d.orders > 0 ? +(d.totalPnl / d.orders).toFixed(4) : 0,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  // So sánh điểm vào MARKET vs PENDING (2 lệnh cùng signalId)
  const buildVariant = (name) => {
    const all = trades.filter((t) => t.variant === name);
    const vClosed = all.filter((t) => t.status === 'CLOSED' && t.outcome !== 'INVALID');
    const w = vClosed.filter((t) => (t.pnl ?? 0) > 0).length;
    const totalPnl = vClosed.reduce((s, t) => s + Number(t.pnl ?? 0), 0);
    const totalRoe = vClosed.reduce((s, t) => s + Number(t.roe ?? 0), 0);
    return {
      variant: name,
      total: all.length,
      open: all.filter((t) => t.status === 'OPEN').length,
      pending: all.filter((t) => t.status === 'PENDING').length,   // PENDING chưa fill (chưa chạm entry)
      closed: vClosed.length,
      wins: w,
      losses: vClosed.length - w,
      winRate: vClosed.length > 0 ? +((w / vClosed.length) * 100).toFixed(1) : 0,
      totalPnl: +totalPnl.toFixed(4),
      totalRoe: +totalRoe.toFixed(2),
      avgRoe: vClosed.length > 0 ? +(totalRoe / vClosed.length).toFixed(1) : null,
    };
  };
  const variantCompare = [buildVariant('MARKET'), buildVariant('PENDING')];

  return {
    trades,
    summary: {
      total: trades.length,
      open: open.length,
      closed: closed.length,
      invalid,
      wins,
      losses: validClosed.length - wins,
      tpHits,
      slHits,
      avgRoe: avgRoe != null ? +avgRoe.toFixed(1) : null,
    },
    daily,
    variantCompare,
  };
}

async function createShakeoutPaperTrade(payload) {
  const symbol = String(payload.symbol ?? '').toUpperCase().trim();
  const side = String(payload.side ?? payload.action ?? 'LONG').toUpperCase();
  const marginUsdt = Number(payload.marginUsdt ?? process.env.SHAKEOUT_RECLAIM_PAPER_MARGIN_USDT ?? 10);
  const leverage = Math.max(1, Math.min(125, Number(payload.leverage ?? 10)));
  const entryPrice = Number(payload.entryPrice ?? payload.entry);

  if (!symbol) throw new Error('symbol required');
  if (!['LONG', 'SHORT'].includes(side)) throw new Error('side must be LONG or SHORT');
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error('entryPrice required');
  const sl = payload.sl != null ? Number(payload.sl) : null;
  const tp = payload.tp != null ? Number(payload.tp) : null;
  if (Number.isFinite(sl) && Number.isFinite(tp)) {
    const validGeometry = side === 'LONG'
      ? (sl < entryPrice && entryPrice < tp)
      : (tp < entryPrice && entryPrice < sl);
    if (!validGeometry) throw new Error(`invalid ${side} geometry entry=${entryPrice} sl=${sl} tp=${tp}`);
  }

  // variant: 'MARKET' (vào ngay theo giá market) hoặc 'PENDING' (chờ giá chạm entry dự kiến)
  const variant = payload.variant ? String(payload.variant).toUpperCase().slice(0, 16) : null;
  const signalId = payload.signalId ? String(payload.signalId).slice(0, 64) : null;

  const store = await readShakeoutPaperStore();
  const dup = store.trades.find((t) =>
    t.symbol === symbol &&
    t.side === side &&
    (t.variant ?? null) === variant &&
    String(t.source ?? '').startsWith('shakeout-auto') &&
    ['PENDING', 'OPEN'].includes(t.status),
  );
  if (dup) return { trade: enrichShakeoutPaperTrade(dup, getShakeoutPaperMark(symbol)) };

  const status = payload.status === 'PENDING' ? 'PENDING' : 'OPEN';
  const trade = {
    id: crypto.randomUUID(),
    signalId,
    variant,
    symbol,
    side,
    status,
    marginUsdt,
    leverage,
    quantity: (marginUsdt * leverage) / entryPrice,
    entryPrice,
    tp,
    sl,
    fillPrice: status === 'OPEN' ? entryPrice : null,
    exitPrice: null,
    pnl: null,
    roe: null,
    outcome: null,
    score: payload.score != null ? Number(payload.score) : null,
    signalType: String(payload.signalType ?? payload.type ?? '').slice(0, 80),
    stage: String(payload.stage ?? '').slice(0, 80),
    createdAt: new Date().toISOString(),
    openedAt: status === 'OPEN' ? new Date().toISOString() : null,
    closedAt: null,
    source: String(payload.source ?? 'manual').slice(0, 80),
    note: String(payload.note ?? '').slice(0, 500),
    trapRisk: payload.trapRisk ? String(payload.trapRisk).toUpperCase().slice(0, 12) : null,
    warning: Array.isArray(payload.trapReasons) ? payload.trapReasons.join('; ').slice(0, 300) : null,
  };
  store.trades.unshift(trade);
  await writeShakeoutPaperStore(store);
  console.log(`[ShakeoutPaper] ${status} ${side} ${symbol} entry=${entryPrice} score=${trade.score ?? '-'} trap=${trade.trapRisk ?? 'LOW'} src=${trade.source}`);
  syncShakeoutPaperTicker().catch(() => {});
  scheduleShakeoutPaperBroadcast(50);
  return { trade: enrichShakeoutPaperTrade(trade, getShakeoutPaperMark(symbol)) };
}

async function closeShakeoutPaperTrade(payload) {
  const store = await readShakeoutPaperStore();
  const idx = store.trades.findIndex((t) => t.id === payload.id);
  if (idx < 0) throw new Error('Shakeout paper trade not found');
  const trade = store.trades[idx];
  if (trade.status === 'CLOSED') return { trade: enrichShakeoutPaperTrade(trade, trade.exitPrice) };
  const exitPrice = payload.exitPrice
    ? Number(payload.exitPrice)
    : getShakeoutPaperMark(trade.symbol);
  if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
    throw new Error(`Chưa có tick socket mới cho ${trade.symbol}; không thể đóng bằng giá cache/entry`);
  }
  const sideMult = trade.side === 'LONG' ? 1 : -1;
  const pnl = (exitPrice - trade.entryPrice) * trade.quantity * sideMult;
  const roe = trade.marginUsdt > 0 ? (pnl / trade.marginUsdt) * 100 : 0;
  const outcome = payload.outcome ?? 'MANUAL';
  store.trades[idx] = { ...trade, status: 'CLOSED', exitPrice, pnl, roe, outcome, closedAt: new Date().toISOString() };
  await writeShakeoutPaperStore(store);
  syncShakeoutPaperTicker().catch(() => {});
  scheduleShakeoutPaperBroadcast(50);
  return { trade: enrichShakeoutPaperTrade(store.trades[idx], exitPrice) };
}

async function deleteShakeoutPaperTrade(payload) {
  const store = await readShakeoutPaperStore();
  store.trades = store.trades.filter((t) => t.id !== payload.id);
  await writeShakeoutPaperStore(store);
  syncShakeoutPaperTicker().catch(() => {});
  scheduleShakeoutPaperBroadcast(50);
  return { ok: true };
}

async function fillShakeoutPendingTrade(trade, markPrice) {
  if (shakeoutPaperFillLocks.has(trade.id)) return;
  shakeoutPaperFillLocks.add(trade.id);
  try {
    const store = await readShakeoutPaperStore();
    const idx = store.trades.findIndex((t) => t.id === trade.id && t.status === 'PENDING');
    if (idx < 0) return;
    const row = store.trades[idx];
    const limit = Number(row.entryPrice);
    const side = row.side;
    const touched = side === 'LONG' ? markPrice <= limit : markPrice >= limit;
    if (!touched) return;
    // Giá khớp thực tế: limit đã marketable (giá vượt qua) thì khớp ở giá market, không bao giờ tệ hơn market
    const fill = side === 'LONG' ? Math.min(limit, markPrice) : Math.max(limit, markPrice);
    const margin = Number(row.marginUsdt);
    const lev = Number(row.leverage);
    const qty = fill > 0 ? (margin * lev) / fill : row.quantity;
    store.trades[idx] = {
      ...row,
      status: 'OPEN',
      entryPrice: fill,
      fillPrice: fill,
      quantity: qty,
      openedAt: new Date().toISOString(),
    };
    await writeShakeoutPaperStore(store);
    scheduleShakeoutPaperBroadcast(50);
    console.log(`[ShakeoutPaper] FILLED ${side} ${row.symbol} limit=${limit} fill=${fill} mark=${markPrice}`);
  } finally {
    shakeoutPaperFillLocks.delete(trade.id);
  }
}

const shakeoutPaperTpSlLocks = new Set();
async function checkShakeoutPaperTpSl(trade, markPrice) {
  if (!trade.tp && !trade.sl) return;
  if (shakeoutPaperTpSlLocks.has(trade.id)) return;
  const isLong = trade.side === 'LONG';
  const tpHit = trade.tp != null && (isLong ? markPrice >= trade.tp : markPrice <= trade.tp);
  const slHit = trade.sl != null && (isLong ? markPrice <= trade.sl : markPrice >= trade.sl);
  if (!tpHit && !slHit) return;
  shakeoutPaperTpSlLocks.add(trade.id);
  try {
    const outcome = tpHit ? 'TP' : 'SL';
    const exitPrice = tpHit ? trade.tp : trade.sl;
    await closeShakeoutPaperTrade({ id: trade.id, exitPrice, outcome });
    console.log(`[ShakeoutPaper] ${outcome} hit ${trade.side} ${trade.symbol} exit=${exitPrice}`);
  } finally {
    shakeoutPaperTpSlLocks.delete(trade.id);
  }
}

const shakeoutPaperSlTrailLocks = new Set();
async function checkShakeoutPaperSlTrail(trade, markPrice) {
  if (process.env.SHAKEOUT_RECLAIM_PAPER_SL_TRAIL_ENABLED === 'false') return;
  if (trade.status !== 'OPEN' || trade.outcome === 'INVALID') return;
  if (shakeoutPaperSlTrailLocks.has(trade.id)) return;

  const sideMult = trade.side === 'LONG' ? 1 : -1;
  const entry = Number(trade.entryPrice);
  const qty = Number(trade.quantity);
  const margin = Number(trade.marginUsdt);
  const mark = Number(markPrice);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(qty) || qty <= 0) return;
  if (!Number.isFinite(margin) || margin <= 0 || !Number.isFinite(mark) || mark <= 0) return;

  const pnl = (mark - entry) * qty * sideMult;
  const roe = (pnl / margin) * 100;
  const prevPeak = shakeoutPaperPeakRoe.get(trade.id) ?? Number(trade.peakRoe ?? 0) ?? 0;
  const peakRoe = Math.max(prevPeak, roe);
  shakeoutPaperPeakRoe.set(trade.id, peakRoe);

  const trailStartRoe = Number(process.env.SHAKEOUT_RECLAIM_PAPER_TRAIL_START_ROE ?? 10);
  const targetLockRoe = peakRoe >= trailStartRoe ? getTargetLockRoe(peakRoe) : null;

  const leverage = Math.max(1, Number(trade.leverage) || 1);
  const isLong = trade.side === 'LONG';
  let newSl = null;
  let improves = false;
  let crossedLock = false;
  if (targetLockRoe != null) {
    const lockMove = targetLockRoe / 100 / leverage;
    newSl = isLong ? entry * (1 + lockMove) : entry * (1 - lockMove);
    if (Number.isFinite(newSl) && newSl > 0) {
      const curSl = Number(trade.sl ?? 0);
      improves = !Number.isFinite(curSl) || curSl <= 0
        || (isLong ? newSl > curSl : newSl < curSl);
      crossedLock = improves && (isLong ? newSl >= mark : newSl <= mark);
    }
  }

  const shouldPersistPeak = peakRoe > Number(trade.peakRoe ?? 0) + 0.05;
  if (!shouldPersistPeak && (!improves || !Number.isFinite(newSl) || newSl <= 0)) return;

  shakeoutPaperSlTrailLocks.add(trade.id);
  try {
    const store = await readShakeoutPaperStore();
    const idx = store.trades.findIndex((t) => t.id === trade.id && t.status === 'OPEN');
    if (idx < 0) return;
    const row = store.trades[idx];
    const notes = [];
    if (targetLockRoe != null && improves && Number.isFinite(newSl) && newSl > 0) {
      notes.push(`shakeoutPaperSlTrail=${targetLockRoe}%@${newSl}`);
    }
    if (shouldPersistPeak && (targetLockRoe == null || !improves)) {
      notes.push(`shakeoutPaperPeak=${peakRoe.toFixed(1)}%`);
    }
    store.trades[idx] = {
      ...row,
      ...(targetLockRoe != null && improves && !crossedLock ? { sl: newSl } : {}),
      peakRoe,
      ...(targetLockRoe != null ? { slTrailLockRoe: targetLockRoe } : {}),
      dynamicRiskUpdatedAt: new Date().toISOString(),
      note: [String(row.note ?? ''), ...notes].filter(Boolean).join(' | ').slice(0, 500),
    };
    await writeShakeoutPaperStore(store);
    scheduleShakeoutPaperBroadcast(50);
    if (crossedLock) {
      await closeShakeoutPaperTrade({ id: trade.id, exitPrice: newSl, outcome: 'SL' });
      console.log(`[ShakeoutPaper] SL_LOCK_HIT ${row.side} ${row.symbol} roe=${roe.toFixed(1)}% peak=${peakRoe.toFixed(1)}% lock=${targetLockRoe}% exit=${newSl}`);
    } else if (targetLockRoe != null && improves && Number.isFinite(newSl) && newSl > 0) {
      console.log(`[ShakeoutPaper] SL_TRAIL ${row.side} ${row.symbol} roe=${roe.toFixed(1)}% peak=${peakRoe.toFixed(1)}% lock=${targetLockRoe}% sl=${newSl}`);
    }
  } finally {
    shakeoutPaperSlTrailLocks.delete(trade.id);
  }
}

async function processShakeoutPaperFills(symbol, markPrice) {
  const store = await readShakeoutPaperStore();
  const pending = store.trades.filter((t) => t.status === 'PENDING' && t.symbol === symbol);
  for (const t of pending) await fillShakeoutPendingTrade(t, markPrice);
  const open = store.trades.filter((t) => t.status === 'OPEN' && t.symbol === symbol);
  for (const t of open) {
    await checkShakeoutPaperSlTrail(t, markPrice);
    await checkShakeoutPaperTpSl(t, markPrice);
  }
  scheduleShakeoutPaperBroadcast();
}

function queueShakeoutPaperProcessing(symbol, markPrice) {
  shakeoutPaperPendingProcess.set(symbol, markPrice);
  if (shakeoutPaperProcessTimer || shakeoutPaperProcessRunning) return;
  shakeoutPaperProcessTimer = setTimeout(drainShakeoutPaperProcessing, 250);
}

async function drainShakeoutPaperProcessing() {
  shakeoutPaperProcessTimer = null;
  if (shakeoutPaperProcessRunning) return;
  const next = shakeoutPaperPendingProcess.entries().next();
  if (next.done) return;
  const [symbol, markPrice] = next.value;
  shakeoutPaperPendingProcess.delete(symbol);
  shakeoutPaperProcessRunning = true;
  try {
    if (Number.isFinite(Number(markPrice)) && Number(markPrice) > 0) {
      await processShakeoutPaperFills(symbol, Number(markPrice));
    }
  } catch {} finally {
    shakeoutPaperProcessRunning = false;
    if (shakeoutPaperPendingProcess.size > 0 && !shakeoutPaperProcessTimer) {
      shakeoutPaperProcessTimer = setTimeout(drainShakeoutPaperProcessing, 250);
    }
  }
}

async function syncShakeoutPaperTicker() {
  if (!shakeoutPaperTicker) return;
  const store = await readShakeoutPaperStore();
  const symbols = [...new Set(store.trades.filter((t) => ['PENDING', 'OPEN'].includes(t.status)).map((t) => t.symbol))];
  shakeoutPaperTicker.setSymbols(symbols);
}

// Xóa lệnh PENDING quá TTL (mặc định 4h) chưa khớp
async function expireOldShakeoutPending() {
  const ttlMs = Number(process.env.SHAKEOUT_RECLAIM_PAPER_PENDING_TTL_MS ?? 4 * 3600 * 1000);
  const store = await readShakeoutPaperStore();
  const now = Date.now();
  const keep = [];
  let removed = 0;
  for (const t of store.trades) {
    if (t.status === 'PENDING' && (now - (Date.parse(t.createdAt ?? 0) || now)) > ttlMs) {
      console.log(`[ShakeoutPaper] EXPIRE pending ${t.side} ${t.symbol} ${t.variant ?? ''} - >${(ttlMs / 3600000).toFixed(0)}h chưa khớp, xóa lệnh`);
      removed++;
      continue;
    }
    keep.push(t);
  }
  if (removed) {
    store.trades = keep;
    await writeShakeoutPaperStore(store);
    scheduleShakeoutPaperBroadcast(50);
    syncShakeoutPaperTicker().catch(() => {});
  }
}

function startShakeoutPaperTicker() {
  if (shakeoutPaperTicker) return;
  shakeoutPaperTicker = createAggTradeTicker({
    logLabel: 'ShakeoutTick',
    onPrice: ({ symbol, markPrice, eventTime }) => {
      shakeoutSocketMarks.set(symbol, markPrice);
      shakeoutSocketMarkAt.set(symbol, eventTime);
      scheduleShakeoutPaperBroadcast();
      queueShakeoutPaperProcessing(symbol, markPrice);
    },
  });
  console.log('[ShakeoutPaper] Dedicated socket-only aggTrade ticker started.');
  syncShakeoutPaperTicker().catch(() => {});
  setInterval(() => syncShakeoutPaperTicker().catch(() => {}), 30_000);
  setInterval(() => expireOldShakeoutPending().catch(() => {}), 60_000);
}

async function createShakeoutPaperTrades(signals = []) {
  if (process.env.SHAKEOUT_RECLAIM_PAPER_ENABLED === 'false') return;
  const minScore = Number(process.env.SHAKEOUT_RECLAIM_PAPER_MIN_SCORE ?? 55);
  const marketMinScore = Number(process.env.SHAKEOUT_RECLAIM_PAPER_MARKET_MIN_SCORE ?? 60);
  const shortMarketMinScore = Number(process.env.SHAKEOUT_RECLAIM_PAPER_SHORT_MARKET_MIN_SCORE ?? 60);
  const cooldownMs = Number(process.env.SHAKEOUT_RECLAIM_PAPER_COOLDOWN_MS ?? 4 * 3600 * 1000);
  const noHedge = process.env.SHAKEOUT_RECLAIM_PAPER_NO_HEDGE !== 'false';
  const now = Date.now();

  // Chặn hedge: nếu coin đang có lệnh chiều ngược active (OPEN/PENDING) thì không vào chiều mới
  const activeSide = new Map(); // symbol -> Set sides đang active
  if (noHedge) {
    const store = await readShakeoutPaperStore();
    for (const t of store.trades) {
      if (['OPEN', 'PENDING'].includes(t.status)) {
        if (!activeSide.has(t.symbol)) activeSide.set(t.symbol, new Set());
        activeSide.get(t.symbol).add(t.side);
      }
    }
  }

  for (const sig of signals) {
    if (Number(sig?.score ?? 0) < minScore) continue;
    if (String(sig?.stage ?? '') !== 'RECLAIM_CONFIRMED') continue;
    const side = String(sig.action ?? '').toUpperCase();
    if (!['LONG', 'SHORT'].includes(side)) continue;
    if (noHedge) {
      const opposite = side === 'LONG' ? 'SHORT' : 'LONG';
      if (activeSide.get(sig.symbol)?.has(opposite)) {
        console.log(`[ShakeoutPaper] skip ${sig.symbol} ${side} - đã có lệnh ${opposite} active (chặn hedge)`);
        continue;
      }
    }
    const key = `${sig.symbol}|${side}|${sig.stage ?? ''}`;
    const last = shakeoutPaperAutoFired.get(key) ?? 0;
    if (now - last < cooldownMs) continue;
    shakeoutPaperAutoFired.set(key, now);

    // Tạo 2 lệnh cùng 1 signalId để so sánh điểm vào:
    //   MARKET  (cách A): entry = giá market lúc signal, vào OPEN ngay
    //   PENDING (cách B): entry = giá dự kiến (EMA99 cho score thấp), chờ giá chạm mới fill
    // Binary 5x/10x theo SL distance của từng entry (giống real-order handlers).
    const signalId = crypto.randomUUID();
    const marketEntry = Number(sig.entryReference ?? sig.markPrice ?? sig.entry);
    const pendingEntry = Number(sig.entry ?? sig.markPrice);
    const marginUsdt = Number(process.env.SHAKEOUT_RECLAIM_PAPER_MARGIN_USDT ?? 10);
    const sc = sig.score;
    const sideL = side.toLowerCase();
    const marketThreshold = side === 'SHORT' ? shortMarketMinScore : marketMinScore;
    const referenceEntry = Number(sig.entryReference ?? sig.markPrice ?? sig.entry);
    const signalSl = Number(sig.sl);
    const signalTp = Number(sig.tp);
    const riskPct = Number.isFinite(referenceEntry) && referenceEntry > 0 && Number.isFinite(signalSl)
      ? Math.min(0.35, Math.max(0.003, Math.abs(referenceEntry - signalSl) / referenceEntry))
      : 0.03;
    const rewardPct = Number.isFinite(referenceEntry) && referenceEntry > 0 && Number.isFinite(signalTp)
      ? Math.max(riskPct * 1.1, Math.abs(signalTp - referenceEntry) / referenceEntry)
      : riskPct * 2.2;

    const variants = [
      ...(sc >= marketThreshold
        ? [{ variant: 'MARKET', status: 'OPEN', entryPrice: marketEntry, tag: 'mkt' }]
        : []),
      { variant: 'PENDING', status: 'PENDING', entryPrice: pendingEntry, tag: 'pend' },
    ];
    for (const v of variants) {
      if (!Number.isFinite(v.entryPrice) || v.entryPrice <= 0) continue;
      const geometryOk = side === 'LONG'
        ? signalSl < v.entryPrice && v.entryPrice < signalTp
        : signalTp < v.entryPrice && v.entryPrice < signalSl;
      const variantSl = geometryOk
        ? signalSl
        : side === 'LONG'
          ? v.entryPrice * (1 - riskPct)
          : v.entryPrice * (1 + riskPct);
      const variantTp = geometryOk
        ? signalTp
        : side === 'LONG'
          ? v.entryPrice * (1 + rewardPct)
          : v.entryPrice * (1 - rewardPct);
      const lev = calcAutoLeverage(v.entryPrice, variantSl);
      await createShakeoutPaperTrade({
        symbol: sig.symbol,
        side,
        status: v.status,
        variant: v.variant,
        signalId,
        marginUsdt,
        leverage: lev,
        entryPrice: v.entryPrice,
        sl: variantSl,
        tp: variantTp,
        score: sc,
        stage: sig.stage,
        signalType: sig.type,
        source: `shakeout-auto-${sideL}-${sc}-${v.tag}-${lev}x`,
        note: [
          sig.note ?? sig.reason ?? '',
          geometryOk ? '' : `variantGeometryAdjusted=${v.variant} sl=${variantSl} tp=${variantTp}`,
        ].filter(Boolean).join(' | '),
        trapRisk: sig.riskFlags?.trapRisk ?? null,
        trapReasons: sig.riskFlags?.trapReasons ?? null,
      }).catch((e) => console.warn(`[ShakeoutPaper] auto-fire ${v.variant} ${sig.symbol}:`, e.message));
    }
    // đánh dấu side active để chặn chiều ngược trong cùng batch scan
    if (noHedge) {
      if (!activeSide.has(sig.symbol)) activeSide.set(sig.symbol, new Set());
      activeSide.get(sig.symbol).add(side);
    }
  }
}

async function handleShakeoutReclaimRealOrders(signals = []) {
  if (process.env.SHAKEOUT_RECLAIM_REAL_ORDER_ENABLED !== 'true') return;
  if (!runtimeSettings.orderEnabled || runtimeSettings.dryRun) {
    console.log('[ShakeoutReclaimOrder] skip - real Binance order disabled/dry-run');
    return;
  }

  const minScore = Number(process.env.SHAKEOUT_RECLAIM_REAL_MIN_SCORE ?? 60);
  const cooldownMs = Number(process.env.SHAKEOUT_RECLAIM_REAL_COOLDOWN_MS ?? 4 * 3600 * 1000);
  const maxOrders = Math.max(1, Number(process.env.SHAKEOUT_RECLAIM_REAL_MAX_ORDERS_PER_SCAN ?? 1));
  const marginUsdt = Number(process.env.SHAKEOUT_RECLAIM_REAL_MARGIN_USDT ?? 1);
  const defaultLeverage = Number(process.env.SHAKEOUT_RECLAIM_REAL_LEVERAGE ?? 10);
  const minNotionalUsdt = Number(process.env.SHAKEOUT_RECLAIM_REAL_MIN_NOTIONAL_USDT ?? 5.5);
  const orderType = String(process.env.SHAKEOUT_RECLAIM_REAL_ORDER_TYPE ?? 'MARKET').toUpperCase();
  const maxOpenPositions = Number(process.env.SHAKEOUT_RECLAIM_REAL_MAX_POSITIONS ?? process.env.AUTO_TRADE_MAX_POSITIONS ?? 0);
  if (!['MARKET', 'LIMIT', 'LIMIT_IOC'].includes(orderType)) {
    console.warn(`[ShakeoutReclaimOrder] invalid order type: ${orderType}`);
    return;
  }

  const ordered = [...signals]
    .filter((sig) => Number(sig?.score ?? 0) >= minScore)
    .filter((sig) => ['LONG', 'SHORT'].includes(String(sig?.action ?? '').toUpperCase()))
    .filter((sig) => Number.isFinite(Number(sig?.entry)) && Number(sig.entry) > 0)
    .filter((sig) => Number.isFinite(Number(sig?.sl)) && Number(sig.sl) > 0)
    .filter((sig) => !['MEDIUM', 'HIGH'].includes(String(sig?.riskFlags?.trapRisk ?? 'LOW').toUpperCase()))
    .sort((a, b) => Number(b?.score ?? 0) - Number(a?.score ?? 0));
  if (!ordered.length) return;

  let apiKey;
  let apiSecret;
  try {
    ({ apiKey, apiSecret } = getApiCredentials(null));
  } catch (err) {
    apiKey = process.env.BINANCE_API_KEY;
    apiSecret = process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) throw err;
  }

  const [positions, openOrders] = await Promise.all([
    client.getPositions({ apiKey, apiSecret }),
    getCachedOpenOrders(apiKey, apiSecret),
  ]);

  let submitted = 0;

  for (const sig of ordered) {
    if (submitted >= maxOrders) break;
    const symbol = normalizeSymbol(sig?.symbol ?? '');
    const action = String(sig?.action ?? '').toUpperCase();
    const isLong = action === 'LONG';
    const isShort = action === 'SHORT';
    if (!symbol || (!isLong && !isShort)) continue;
    if (!Number.isFinite(Number(sig.entry)) || Number(sig.entry) <= 0) continue;
    if (!Number.isFinite(Number(sig.sl)) || Number(sig.sl) <= 0) continue;
    const trapRisk = String(sig?.riskFlags?.trapRisk ?? 'LOW').toUpperCase();
    if (trapRisk === 'MEDIUM' || trapRisk === 'HIGH') {
      console.log(`[ShakeoutReclaimOrder] skip ${symbol} ${action} - trapRisk=${trapRisk}`);
      continue;
    }
    const liqBlock = liqAutoBlockReason(symbol, action);
    if (liqBlock) {
      console.log(`[ShakeoutReclaimOrder] skip ${symbol} ${action} - ${liqBlock}`);
      continue;
    }

    const dedupKey = `${symbol}|${sig.stage ?? '-'}|${action}`;
    const last = shakeoutReclaimRealOrderFired.get(dedupKey) ?? 0;
    if (Date.now() - last < cooldownMs) {
      console.log(`[ShakeoutReclaimOrder] skip ${symbol} - cooldown`);
      continue;
    }

    const hasPosition = positions.some((p) => p.symbol === symbol && Math.abs(Number(p.positionAmt ?? 0)) > 0);
    if (hasPosition) {
      console.log(`[ShakeoutReclaimOrder] skip ${symbol} - already has position`);
      continue;
    }

    const hasEntryOrder = openOrders.some((o) => {
      if (o.symbol !== symbol) return false;
      if (String(o.reduceOnly ?? '').toLowerCase() === 'true') return false;
      const type = String(o.type ?? o.origType ?? '').toUpperCase();
      return ['MARKET', 'LIMIT', 'LIMIT_MAKER'].includes(type);
    });
    if (hasEntryOrder) {
      console.log(`[ShakeoutReclaimOrder] skip ${symbol} - already has entry order`);
      continue;
    }

    const leverage = calcAutoLeverage(sig.entry, sig.sl, defaultLeverage);
    const notionalUsdt = Math.max(marginUsdt * leverage, minNotionalUsdt);
    const side = isLong ? 'BUY' : 'SELL';

    try {
      const result = await placeOrder({
        symbol,
        side,
        orderType,
        notionalUsdt,
        leverage,
        limitPrice: orderType === 'MARKET' ? undefined : sig.entry,
        takeProfitPrice: sig.tp ?? undefined,
        stopLossPrice: sig.sl ?? undefined,
        protectionOnFill: true,
        maxOpenPositions,
        dryRun: false,
        source: 'shakeout-reclaim',
      }, null, { apiKey, apiSecret });

      submitted++;
      shakeoutReclaimRealOrderFired.set(dedupKey, Date.now());
      invalidateOpenOrdersCache();
      const orderId = result?.orderResult?.orderId ?? '-';
      console.log(`[ShakeoutReclaimOrder] REAL ${symbol} ${action} ${orderType} orderId=${orderId} margin=$${marginUsdt} score=${sig.score}`);

      const webhookUrl = process.env.SHAKEOUT_RECLAIM_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '';
      if (webhookUrl) {
        const fmt = (v) => v == null || !Number.isFinite(Number(v)) ? '-' : Number(v).toPrecision(8).replace(/\.?0+$/, '');
        const msg = [
          `**[REAL ORDER] Shakeout Reclaim ${symbol} ${action} - ${orderType} - Score ${sig.score} (${sig.grade ?? '-'})**`,
          `OrderId: \`${orderId}\` | Margin: $${marginUsdt} x ${leverage}x | Notional: $${notionalUsdt}`,
          `Entry: \`${fmt(sig.entry)}\` | SL: \`${fmt(sig.sl)}\` | TP: \`${fmt(sig.tp)}\``,
          `Stage: ${sig.stage ?? '-'} | Type: ${sig.type ?? '-'}`,
        ].join('\n');
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: msg }),
        }).catch(() => {});
      }
    } catch (e) {
      console.warn(`[ShakeoutReclaimOrder] ${symbol}:`, e.message);
    }
  }
}

function startPaperTradeTicker() {
  if (process.env.PAPER_TRADE_TICKER_ENABLED === 'false') return;
  if (paperTicker) return;
  paperTicker = true; // guard flag — actual WS is sharedMarkTicker
  sharedMarkTicker.register('paperTrade', ({ symbol, markPrice }) => {
    paperMarkCache.set(symbol, { markPrice, at: Date.now(), source: 'ws' });
    processPaperPendingFillsForSymbol(symbol, markPrice).catch(() => {});
    processLiquidPaperPendingFillsForSymbol(symbol, markPrice).catch(() => {});
    scheduleLiquidPaperBroadcast();
  });
  console.log('[PaperLiq] Mark ticker started for paper trades (shared).');
  syncPaperTickerSymbols().catch(() => {});
  setInterval(() => syncPaperTickerSymbols().catch(() => {}), 10_000);
  // REST poller disabled — sharedMarkTicker WS handles mark price updates
  // startLiquidPaperRestPoller();
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
    const klines = klineCache.getIfCached(symbol, '15m', 110);
    if (!klines || klines.length < 100) return null;
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
      // Dùng getSharedSnapshot() thay vì gọi getTicker24hr() riêng (tránh tốn w=40)
      const snapshot = await getSharedSnapshot();
      const maxSymbols = Number(process.env.LONG_SHORT_REFRESH_MAX_SYMBOLS ?? 15);
      if (maxSymbols <= 0) return;
      const top = snapshot
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, maxSymbols)
        .map((t) => t.symbol);

      // Stagger calls: 5 per batch, 300ms between batches → ~2.4s total instead of burst
      const [globalResults, topResults] = await Promise.all([
        batchedAllSettled(top, (sym) => client.getGlobalLongShortRatio(sym, '15m', 1).then((rows) => ({ sym, row: rows[0] })), 1, 1200),
        batchedAllSettled(top, (sym) => client.getTopLongShortPositionRatio(sym, '15m', 1).then((rows) => ({ sym, row: rows[0] })), 1, 1200),
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
  setInterval(run, Number(process.env.LONG_SHORT_REFRESH_INTERVAL_MS ?? 15 * 60 * 1000));
}

async function getHedgeMode(token = null, credentialsOverride = null) {
  const { apiKey, apiSecret } = credentialsOverride ?? getApiCredentials(token);
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
  // Background (token=null): ưu tiên session, fallback env để socket/manual order guards vẫn chạy sau restart.
  if (sessionCredentials.size > 0) {
    const first = sessionCredentials.values().next().value;
    if (first?.apiKey && first?.apiSecret) return { apiKey: first.apiKey, apiSecret: first.apiSecret };
  }
  if (process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET) {
    return { apiKey: process.env.BINANCE_API_KEY, apiSecret: process.env.BINANCE_API_SECRET };
  }
  throw new Error('Chưa đăng nhập. Vào /orders và nhập API key để sử dụng.');
}

let _balanceCache = null;
let _balanceCacheAt = 0;
const BALANCE_TTL_MS = 60_000; // 1 phút — balance không cần real-time

async function getAccountBalance(token = null) {
  if (_balanceCache && Date.now() - _balanceCacheAt < BALANCE_TTL_MS) return _balanceCache;
  if (shouldDeferAlgoRest()) return _balanceCache ?? [];
  const { apiKey, apiSecret } = getApiCredentials(token);
  const rows = await client.getBalance({ apiKey, apiSecret });
  _balanceCache = rows.filter((b) => Number(b.balance) > 0 || Number(b.crossUnPnl) !== 0);
  _balanceCacheAt = Date.now();
  return _balanceCache;
}

let _dailyPnlCache = null;
let _dailyPnlCacheAt = 0;
const DAILY_PNL_TTL_MS = 300_000; // 5 phút — income API weight=30, không cần real-time

async function getDailyPnl(token = null) {
  if (_dailyPnlCache && Date.now() - _dailyPnlCacheAt < DAILY_PNL_TTL_MS) return _dailyPnlCache;
  if (shouldDeferAlgoRest()) return _dailyPnlCache ?? { realized: 0, commission: 0, funding: 0, net: 0, since: new Date().toISOString() };
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
  _dailyPnlCache = { realized, commission, funding, net: realized + commission + funding, since: startOfDay.toISOString() };
  _dailyPnlCacheAt = Date.now();
  return _dailyPnlCache;
}

async function getPositions(token = null) {
  const { positions } = await getSharedPositionData();
  return positions;
}

// ── Shared position data store ─────────────────────────────────────────────
// Gom positions + openOrders + algoOrders vào 1 cache TTL 30s.
// Tất cả scanners dùng chung — tối đa 1 REST burst per TTL window.
let _posStore = { positions: [], openOrders: [], algoOrders: [], fetchedAt: 0 };
let _posStoreInflight = null;
const POS_STORE_TTL_MS = 60_000; // 60s — positions/openOrders không cần <30s; giảm getOpenOrders(w=40) frequency

async function getSharedPositionData() {
  if (Date.now() - _posStore.fetchedAt < POS_STORE_TTL_MS) return _posStore;
  if (_posStoreInflight) return _posStoreInflight;
  if (shouldDeferAlgoRest()) return _posStore;
  let creds;
  try { creds = getApiCredentials(null); } catch { return _posStore; }
  const { apiKey, apiSecret } = creds;
  _posStoreInflight = (async () => {
    try {
      const [positions, openOrders, algoResult] = await Promise.all([
        client.getPositions({ apiKey, apiSecret }),
        client.getOpenOrders({ apiKey, apiSecret }),
        client.getOpenAlgoOrders({ apiKey, apiSecret }).catch(() => ({ orders: [] })),
      ]);
      const algoOrders = Array.isArray(algoResult?.orders) ? algoResult.orders
        : Array.isArray(algoResult) ? algoResult : [];
      _posStore = {
        positions: positions.filter((p) => Number(p.positionAmt) !== 0),
        openOrders: Array.isArray(openOrders) ? openOrders : [],
        algoOrders,
        fetchedAt: Date.now(),
      };
      _openOrdersCache = _posStore.openOrders;
      _openOrdersCacheAt = _posStore.fetchedAt;
    } catch (err) {
      if (!err.message?.includes('Missing Binance API')) console.error('[PosStore] fetch error:', err.message);
    }
    return _posStore;
  })();
  try { return await _posStoreInflight; } finally { _posStoreInflight = null; }
}

function invalidatePosStore() { _posStore = { ..._posStore, fetchedAt: 0 }; }

// ── Open orders cache — tránh gọi REST liên tục ───────────────────────────────
// Invalidate bằng invalidateOpenOrdersCache() sau mỗi lần đặt/hủy lệnh hoặc fill
let _openOrdersCache = null;      // cached array (all symbols, no-token)
let _openOrdersCacheAt = 0;
const OPEN_ORDERS_TTL = 30_000;   // 30s TTL fallback nếu không invalidate

function invalidateOpenOrdersCache() {
  _openOrdersCache = null;
  _openOrdersCacheAt = 0;
  invalidatePosStore();
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
  const { openOrders } = await getSharedPositionData();
  return symbol ? openOrders.filter((o) => o.symbol === symbol) : openOrders;
}

async function getOpenAlgoOrdersList(token = null) {
  const { algoOrders } = await getSharedPositionData();
  const byId = new Map();
  for (const row of algoOrders) byId.set(row.algoId ?? row.clientAlgoId ?? `${row.symbol}:${row.triggerPrice}:${row.side}`, row);
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
    const { positions } = await getSharedPositionData();
    const activeMap = new Map(
      positions
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
        positionFirstSeenAt.delete(sym);
        positionTimeoutFired.delete(sym);
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
const recentLiqAutoBlock = new Map(); // symbol -> { direction, bias, sweepProb, at }

function rememberLiqAutoBlock(payload) {
  if (!payload?.symbol) return;
  const sweepProb = Number(payload.sweepProb ?? 0);
  const minProb = Number(process.env.LIQ_AUTO_BLOCK_MIN_PROB ?? 80);
  if (sweepProb < minProb) return;
  recentLiqAutoBlock.set(String(payload.symbol).toUpperCase(), {
    direction: String(payload.direction ?? '').toLowerCase(),
    bias: Number(payload.bias ?? 0),
    sweepProb,
    at: Date.now(),
  });
}

function liqAutoBlockReason(symbol, side) {
  const rec = recentLiqAutoBlock.get(String(symbol ?? '').toUpperCase());
  if (!rec) return '';
  const ttlMs = Number(process.env.LIQ_AUTO_BLOCK_TTL_MS ?? 2 * 60 * 60 * 1000);
  if (Date.now() - rec.at > ttlMs) {
    recentLiqAutoBlock.delete(String(symbol ?? '').toUpperCase());
    return '';
  }
  const minProb = Number(process.env.LIQ_AUTO_BLOCK_MIN_PROB ?? 80);
  if (rec.sweepProb < minProb) return '';
  const orderSide = String(side ?? '').toUpperCase();
  const longBlocked = orderSide === 'LONG' || orderSide === 'BUY';
  const shortBlocked = orderSide === 'SHORT' || orderSide === 'SELL';
  if (longBlocked && (rec.direction === 'long' || rec.bias <= -Number(process.env.LIQ_AUTO_BLOCK_MIN_ABS_BIAS ?? 0.5))) {
    return `liq-scan bearish sweepProb=${rec.sweepProb}% bias=${Number(rec.bias).toFixed(3)}`;
  }
  if (shortBlocked && (rec.direction === 'short' || rec.bias >= Number(process.env.LIQ_AUTO_BLOCK_MIN_ABS_BIAS ?? 0.5))) {
    return `liq-scan bullish sweepProb=${rec.sweepProb}% bias=${Number(rec.bias).toFixed(3)}`;
  }
  return '';
}

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
    rememberLiqAutoBlock(payload);

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

// Signal flood guard — khi quá nhiều LONG bắn cùng lúc (dấu hiệu BTC spike)
const recentLongOrderTimes = [];          // rolling timestamps của LONG orders vừa đặt
let signalFloodBlockedUntil = 0;          // timestamp hết hạn block
const SIGNAL_FLOOD_WINDOW_MS = 5 * 60 * 1000;  // window 5 phút
const SIGNAL_FLOOD_THRESHOLD = 8;               // ≥ 8 lệnh/5 phút → flood
const SIGNAL_FLOOD_PAUSE_MS  = 30 * 60 * 1000; // dừng 30 phút sau khi detect

function isPumpShortEdgeAutoRecord(order) {
  const side = String(order?.side ?? order?.action ?? '').toUpperCase();
  const score = Number(order?.score);
  return (side === 'SELL' || side === 'SHORT') && score >= 40 && score <= 79;
}

function countPumpShortEdgeAutoExposure() {
  const ids = new Set();
  for (const order of [...pumpPendingOrders, ...pumpWatchingOrders]) {
    if (!isPumpShortEdgeAutoRecord(order)) continue;
    ids.add(order.orderId ?? `${order.symbol}:${order.side}:${order.placedAt ?? order.filledAt ?? ''}`);
  }
  return ids.size;
}

async function handlePumpAutoOrder(signal, openOrders = null) {
  if (!runtimeSettings.pumpAutoOrderEnabled) return;
  if (isVnBlockHour()) { console.log(`[PumpAuto] ⏰ Block 17-19h VN — ${signal.symbol}`); return; }
  const { symbol, action, score, marketOk, entry, sl, factors, type: signalType } = signal;
  if (String(signalType ?? '').startsWith('ma60_volume_cluster')) return;
  const liqBlock = liqAutoBlockReason(symbol, action);
  if (liqBlock) {
    console.log(`[PumpAuto] skip ${symbol} ${action} - ${liqBlock}`);
    return;
  }
  const onlyPumpShortEdge = process.env.PUMP_AUTO_ONLY_PUMP_SHORT_EDGE === 'true';
  const pumpAutoMinScore = Number(process.env.PUMP_AUTO_MIN_SCORE ?? 80);
  const pumpAutoMaxScore = Number(process.env.PUMP_AUTO_MAX_SCORE ?? 999);
  if (onlyPumpShortEdge && action !== 'SHORT') return;
  if (score < pumpAutoMinScore) return;
  if (score > pumpAutoMaxScore) return;
  if (!onlyPumpShortEdge && marketOk === false) return;
  if (!onlyPumpShortEdge && factors?.emaRibbon === 0) return; // EMA ribbon không bullish → không đặt lệnh
  // Chase guard — bỏ qua nếu giá đã chạy > 30% vào TP range
  const chasePct = factors?.chasePct ?? 0;
  if (chasePct > 0.30) {
    console.log(`[PumpAuto] ⏭ ${symbol} chase=${(chasePct * 100).toFixed(0)}% > 30% — skip`);
    return;
  }
  // Adjusted score guard (score đã trừ chase penalty từ detector)
  if (!onlyPumpShortEdge && score < 70) {
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

  // EMA_PB vol filter: vol < 1.8x → skip (không đủ buying pressure để confirm pullback)
  if (signalType === 'ema_pullback' && action === 'LONG') {
    const volRatio = factors?.volRatio ?? 0;
    if (volRatio < 1.8) {
      console.log(`[PumpAuto] ⏭ ${symbol} skip EMA_PB — vol=${volRatio}x < 1.8x`);
      return;
    }
  }

  // Case 1: Signal Flood — ≥8 LONG đặt trong 5 phút → BTC spike pattern → dừng 30 phút
  if (action === 'LONG') {
    const now = Date.now();
    // Prune entries cũ ngoài window
    while (recentLongOrderTimes.length > 0 && recentLongOrderTimes[0] < now - SIGNAL_FLOOD_WINDOW_MS) {
      recentLongOrderTimes.shift();
    }
    if (now < signalFloodBlockedUntil) {
      const remainMin = Math.ceil((signalFloodBlockedUntil - now) / 60_000);
      console.log(`[PumpAuto] 🌊 ${symbol} block — signal flood pause (còn ${remainMin} phút)`);
      return;
    }
    if (recentLongOrderTimes.length >= SIGNAL_FLOOD_THRESHOLD) {
      signalFloodBlockedUntil = now + SIGNAL_FLOOD_PAUSE_MS;
      console.log(`[PumpAuto] 🌊 FLOOD DETECTED — ${recentLongOrderTimes.length} LONG/${SIGNAL_FLOOD_WINDOW_MS / 60_000} phút → dừng 30 phút`);
      const webhookUrl = process.env.LIQ_SCAN_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: `🌊 **Signal Flood DETECTED** — **${recentLongOrderTimes.length}** LONG trong 5 phút\nDừng tất cả LONG auto order **30 phút**. Nghi ngờ BTC spike candle.` }),
        }).catch(() => {});
      }
      return;
    }
  }

  // Case 2: BTC 1h candle đỏ > 0.5% → block EMA_PB LONG (đang trong correction phase)
  if (action === 'LONG' && signalType === 'ema_pullback') {
    const health = btcHealthCache.data;
    const c1h = health?.btcCandle1hPct ?? 0;
    if (c1h < -0.5) {
      console.log(`[PumpAuto] 📉 ${symbol} block EMA_PB LONG — BTC 1h candle ${c1h.toFixed(2)}% (correction phase)`);
      const webhookUrl = process.env.LIQ_SCAN_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: `📉 **Pump Auto BLOCKED** | **${symbol}** 🟢 LONG [EMA_PB]\nScore: **${score}** | Entry: \`${entry}\`\nBTC 1h candle: **${c1h.toFixed(2)}%** — correction phase, EMA_PB blocked.` }),
        }).catch(() => {});
      }
      return;
    }
  }

  // Block EMA_PB LONG sau BTC spike candle (vol > 2.5x avg + move > 1% trên 1h)
  // Lý do: sau spike BTC thường correction ngay → alt EMA_PB vào đúng lúc BTC kéo xuống
  if (action === 'LONG' && signalType === 'ema_pullback' && btcHealthCache.data?.btcSpikeAlert) {
    const health = btcHealthCache.data;
    console.log(`[PumpAuto] ⚡ ${symbol} block EMA_PB LONG — BTC spike candle detected (RSI1h=${health.rsi1h} pct6h=${health.pct6h}%)`);
    const webhookUrl = process.env.LIQ_SCAN_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: `⚡ **Pump Auto BLOCKED** | **${symbol}** 🟢 LONG [EMA_PB]\nScore: **${score}** | Entry: \`${entry}\`\nBTC spike candle detected — correction risk cao. Block EMA_PB 2 nến.` }),
      }).catch(() => {});
    }
    return;
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
  if (action === 'SHORT' && !onlyPumpShortEdge) {
    const health = btcHealthCache.data;
    if (health?.bullBias === 'bullish') { // caution = cảnh báo thôi, không hard-block SHORT
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
    const defaultLeverage = Number(process.env.PUMP_AUTO_ORDER_LEVERAGE ?? 10);
    const leverage = calcAutoLeverage(signal.entry, signal.sl, defaultLeverage);
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

    if (onlyPumpShortEdge) {
      const maxShortEdge = Number(process.env.PUMP_AUTO_SHORT_EDGE_MAX_POSITIONS ?? 10);
      const currentShortEdge = countPumpShortEdgeAutoExposure();
      if (maxShortEdge > 0 && currentShortEdge >= maxShortEdge) {
        console.log(`[PumpAuto] ⚠ ${symbol} skip — PUMP_SHORT EDGE max ${maxShortEdge} reached (current=${currentShortEdge})`);
        return;
      }
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
    if (side === 'BUY') recentLongOrderTimes.push(Date.now()); // track cho signal flood guard
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

  // Filter sweep distance quá nhỏ — signal gần target dễ bị SL ngay
  const minSweepDistPct = Number(process.env.LIQ_MIN_SWEEP_DIST_PCT ?? 2.0);
  if (minSweepDistPct > 0 && sweepTargetPrice > 0 && markPrice > 0) {
    const distPct = Math.abs((sweepTargetPrice - markPrice) / markPrice * 100);
    if (distPct < minSweepDistPct) {
      console.log(`[AutoLiq] ⏭ ${symbol} skip — sweepDist ${distPct.toFixed(2)}% < min ${minSweepDistPct}%`);
      return;
    }
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
// Position timeout — real Binance positions
const positionFirstSeenAt = new Map(); // symbol → timestamp (from onRoeUpdate first call or slTracking)
const positionTimeoutFired = new Set(); // symbol — prevent double-fire per position lifecycle

const tpMovedToEntry = new Map(); // symbol → entryPrice when TP was moved to entry

async function handleTpEntryGuard(symbol, pos, markPrice, roe) {
  return handleNegativeTimeoutTp(symbol, pos);
}

// ── Real Binance Position Timeout ─────────────────────────────────────────────
// Đóng lệnh thật sau X giờ nếu ROE > minRoe% (đang lời nhẹ) và chưa đạt TP
async function handlePositionTimeout(symbol, pos, markPrice, roe) {
  if (!runtimeSettings.positionTimeoutEnabled) return;
  if (roe < 0) return;                                      // Tuyệt đối không cắt lệnh âm
  if (roe <= runtimeSettings.positionTimeoutMinRoe) return; // Chỉ cắt khi ROE > minRoe%
  if (positionTimeoutFired.has(symbol)) return;

  // Xác định openedAt: ưu tiên slTracking (chính xác từ fill), fallback positionFirstSeenAt
  const tracked = slTracking.positions[symbol];
  const openedAt = tracked?.openedAt ?? positionFirstSeenAt.get(symbol);
  if (!openedAt) return; // chưa biết thời gian mở

  const timeoutMs = runtimeSettings.positionTimeoutH * 3_600_000;
  const elapsed = Date.now() - openedAt;
  if (elapsed < timeoutMs) return; // chưa đủ thời gian

  positionTimeoutFired.add(symbol);

  let apiKey, apiSecret;
  try {
    ({ apiKey, apiSecret } = getApiCredentials(null));
  } catch {
    positionTimeoutFired.delete(symbol);
    return;
  }

  const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);
  const amt = Number(pos.amt ?? pos.positionAmt ?? 0);
  if (amt === 0) { positionTimeoutFired.delete(symbol); return; }

  const isLong = amt > 0;
  const closeSide = isLong ? 'SELL' : 'BUY';
  const positionSide = pos.positionSide ?? 'BOTH';
  const isHedge = positionSide !== 'BOTH';

  // Tính quantity theo step size
  const symbols = await getSymbols().catch(() => []);
  const symbolInfo = symbols.find((s) => s.symbol === symbol);
  let quantity;
  if (symbolInfo) {
    const lotSize = symbolInfo.filters?.find((f) => f.filterType === 'LOT_SIZE');
    const stepSize = Number(lotSize?.stepSize ?? 10 ** -Number(symbolInfo.quantityPrecision ?? 3));
    const steppedQty = Math.floor(Math.abs(amt) / stepSize) * stepSize;
    quantity = steppedQty.toFixed(decimalsFromStep(stepSize)).replace(/\.?0+$/, '');
  } else {
    quantity = String(Math.abs(amt));
  }

  const orderParams = {
    symbol,
    side: closeSide,
    type: 'MARKET',
    quantity,
    recvWindow,
    newClientOrderId: `lp_ptout_${Date.now()}`.slice(0, 36),
  };
  if (isHedge) { orderParams.positionSide = positionSide; } else { orderParams.reduceOnly = 'true'; }

  const elapsedH = (elapsed / 3_600_000).toFixed(1);
  console.log(`[PosTimeout] ⏱ ${symbol} ${isLong ? 'LONG' : 'SHORT'} ROE=${roe.toFixed(2)}% elapsed=${elapsedH}h → market close`);

  try {
    const result = await client.placeFuturesOrder({ params: orderParams, apiKey, apiSecret });
    console.log(`[PosTimeout] ✅ ${symbol} market close OK orderId=${result?.orderId ?? '?'}`);
  } catch (err) {
    console.error(`[PosTimeout] ❌ ${symbol}: ${err.message}`);
    positionTimeoutFired.delete(symbol); // retry nếu lỗi
  }
}

function startNegTpScanner() {
  const intervalMs = Number(process.env.NEG_TP_SCAN_INTERVAL_MS ?? 30000);
  const negTpRoe = Number(process.env.NEG_TP_ROE ?? -30);
  const tpGuardRoe = Number(process.env.TP_ENTRY_GUARD_ROE ?? -50);
  const timeoutMs = Number(process.env.NEG_TP_TIMEOUT_MS ?? 4 * 3600 * 1000);
  console.log(`[NegTp] Scanner started. ROE threshold=${negTpRoe}% timeout=${timeoutMs / 3_600_000}h interval=${intervalMs / 1000}s`);

  const run = async () => {
    try {
      const { positions: active } = await getSharedPositionData();
      if (!active.length) return;
      const activeSymbols = new Set(active.map((p) => p.symbol));
      for (const sym of negativeSince.keys()) {
        if (!activeSymbols.has(sym)) negativeSince.delete(sym);
      }
      for (const p of active) {
        const symbol = p.symbol;
        const amt = Number(p.positionAmt);
        const entry = Number(p.entryPrice);
        const lev = Number(p.leverage) || 1;
        const mark = Number(p.markPrice);
        // unRealizedProfit = 0 khi chưa có WS tick → tính lại từ mark price
        const rawUpnl = Number(p.unRealizedProfit);
        const upnl = rawUpnl !== 0 ? rawUpnl : (mark > 0 ? (mark - entry) * amt : null);
        if (upnl === null) continue; // chưa có mark price, bỏ qua
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

async function refreshTakeProfitForSymbol(symbol) {
  const { apiKey, apiSecret } = getApiCredentials(null);
  invalidateOpenOrdersCache();

  const { positions } = await getSharedPositionData();
  let pos = positions.find((p) => p.symbol === symbol);
  if (!pos && posMonitor?.getActivePositions) {
    pos = posMonitor.getActivePositions().find((p) => p.symbol === symbol);
  }
  if (!pos || Number(pos.positionAmt) === 0) {
    console.warn(`[AutoTP] ${symbol} fill refresh skipped: active position not found`);
    return;
  }

  const symbols = await getSymbols();
  await ensureTakeProfitForPosition(pos, symbols, apiKey, apiSecret, null, null, { force: true });
}

async function getPositionRoeForTpGuard(pos, { fetchMark = false } = {}) {
  const symbol = pos.symbol;
  const amt = Number(pos.positionAmt ?? pos.amt);
  const entry = Number(pos.entryPrice ?? pos.entry);
  const leverage = Number(pos.leverage) || 1;
  if (!symbol || !amt || !entry) return { ready: false, amt, entry, leverage };

  const isolatedMargin = Number(pos.isolatedMargin);
  const initialMargin = Number(pos.initialMargin);
  const margin = isolatedMargin > 0
    ? isolatedMargin
    : initialMargin > 0
      ? initialMargin
      : Math.abs(amt) * entry / leverage;
  if (margin <= 0) return { ready: false, amt, entry, leverage };

  let mark = Number(pos.markPrice);
  let rawUpnl = Number(pos.unRealizedProfit ?? pos.unrealizedProfit);
  const needsMark = fetchMark || !Number.isFinite(mark) || mark <= 0 || !Number.isFinite(rawUpnl) || rawUpnl === 0;
  if (needsMark) {
    const premium = await client.getPremiumIndex(symbol).catch(() => null);
    const fetchedMark = Number(premium?.markPrice);
    if (Number.isFinite(fetchedMark) && fetchedMark > 0) mark = fetchedMark;
  }

  const upnl = fetchMark && Number.isFinite(mark) && mark > 0
    ? (mark - entry) * amt
    : Number.isFinite(rawUpnl) && rawUpnl !== 0
      ? rawUpnl
      : Number.isFinite(mark) && mark > 0
        ? (mark - entry) * amt
        : NaN;
  if (!Number.isFinite(upnl)) return { ready: false, amt, entry, leverage, margin, mark };

  return {
    ready: true,
    amt,
    entry,
    leverage,
    margin,
    mark,
    upnl,
    roe: (upnl / margin) * 100,
  };
}

async function runSlTrailSafetyScan() {
  if (process.env.AUTO_SL_ENABLED === 'false') return;
  const { positions: active } = await getSharedPositionData();
  if (!active.length) return;

  for (const p of active) {
    if (tslExcludedSymbols.has(p.symbol)) continue;
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
  const { positions: active, openOrders: sharedOpenOrders, algoOrders: sharedAlgoOrders } = await getSharedPositionData();
  if (!active.length) return;

  const symbols = await getSymbols();
  for (const pos of active) {
    await ensureTakeProfitForPosition(pos, symbols, apiKey, apiSecret, sharedOpenOrders, sharedAlgoOrders);
    await new Promise((r) => setTimeout(r, 80));
  }
}

async function ensureTakeProfitForPosition(pos, symbols, apiKey, apiSecret, sharedOpenOrders = null, sharedAlgoOrders = null, options = {}) {
  const symbol = pos.symbol;
  const amt = Number(pos.positionAmt);
  const entry = Number(pos.entryPrice);
  const leverage = Number(pos.leverage) || 1;
  if (!symbol || !amt || !entry) return;

  const tpKey = `${symbol}|${entry.toFixed(8)}`;
  const isLong = amt > 0;
  const closeSide = isLong ? 'SELL' : 'BUY';
  const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);
  const roeInfo = await getPositionRoeForTpGuard(pos, { fetchMark: options.force });
  const negTpRoe = Number(process.env.NEG_TP_ROE ?? -30);
  const tpGuardRoe = Number(process.env.TP_ENTRY_GUARD_ROE ?? -50);
  if (roeInfo.ready && (roeInfo.roe <= negTpRoe || roeInfo.roe <= tpGuardRoe)) {
    console.log(`[AutoTP] ${symbol} ROE=${roeInfo.roe.toFixed(2)}% <= guard (${Math.max(negTpRoe, tpGuardRoe)}%) -> move TP to entry`);
    await handleNegativeTimeoutTp(symbol, {
      amt,
      entry,
      leverage,
      positionSide: pos.positionSide ?? 'BOTH',
    });
    return;
  }
  if (options.force && !roeInfo.ready) {
    console.warn(`[AutoTP] ${symbol} skip normal TP: cannot compute fresh ROE after fill`);
    return;
  }
  // Skip API calls only after the negative guard had a chance to move TP to entry.
  if (!options.force && tpConfirmedSet.has(tpKey)) return;

  let openOrders, algoRows;
  if (sharedOpenOrders && sharedAlgoOrders) {
    openOrders = sharedOpenOrders.filter((o) => o.symbol === symbol);
    algoRows = sharedAlgoOrders.filter((o) => o.symbol === symbol);
  } else {
    const [openOrdersRes, algoResult] = await Promise.all([
      client.getOpenOrders({ symbol, apiKey, apiSecret, recvWindow }).catch(() => []),
      client.getOpenAlgoOrders({ symbol, apiKey, apiSecret, recvWindow }).catch(() => ({ orders: [] })),
    ]);
    openOrders = openOrdersRes;
    algoRows = Array.isArray(algoResult?.orders) ? algoResult.orders : Array.isArray(algoResult) ? algoResult : [];
  }

  const symbolInfo = symbols.find((s) => s.symbol === symbol);
  if (!symbolInfo) return;

  // Ưu tiên TP gốc của signal đã lưu khi socket fill.
  const trackedSignalTp = Number(slTracking.positions[symbol]?.signalTp ?? 0);
  const pumpRecord = [...pumpPendingOrders, ...pumpWatchingOrders].find(
    (r) => r.symbol === symbol && r.tp && Math.abs((Number(r.fillPrice ?? r.entry) - entry) / entry) < 0.01,
  );
  let rawTpPrice;
  if (Number.isFinite(trackedSignalTp) && trackedSignalTp > 0) {
    rawTpPrice = trackedSignalTp;
    console.log(`[AutoTP] 📌 ${symbol} giữ signal TP=${rawTpPrice} source=${slTracking.positions[symbol]?.signalSource ?? '-'}`);
  } else if (pumpRecord?.tp) {
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

  const expectedPrice = Number(triggerPrice);
  const expectedQty = Number(quantity);
  const priceTol = Math.max(0.001, Number(process.env.AUTO_TP_REFRESH_PRICE_TOL_PCT ?? 0.15) / 100);
  const qtyTol = Math.max(0.000001, Number(process.env.AUTO_TP_REFRESH_QTY_TOL_PCT ?? 0.5) / 100);
  const isTpType = (t) => {
    const u = String(t ?? '').toUpperCase();
    return u === 'TAKE_PROFIT_MARKET' || u === 'TAKE_PROFIT';
  };
  const orderPrice = (o) => Number(o.triggerPrice ?? o.stopPrice ?? o.price);
  const orderQty = (o) => Number(o.origQty ?? o.quantity ?? o.executedQty ?? 0);
  const priceMatches = (p) => Number.isFinite(p) && Math.abs(p - expectedPrice) / expectedPrice <= priceTol;
  const qtyCovers = (q) => !Number.isFinite(q) || q <= 0 || q >= expectedQty * (1 - qtyTol);

  const existingAlgoTp = algoRows.find((o) =>
    o.symbol === symbol &&
    String(o.side ?? '').toUpperCase() === closeSide &&
    isTpType(o.orderType ?? o.type) &&
    priceMatches(orderPrice(o)) &&
    qtyCovers(orderQty(o)),
  );
  const existingRegularTp = openOrders.find((o) =>
    o.symbol === symbol &&
    o.side === closeSide &&
    isTpType(o.origType ?? o.type) &&
    priceMatches(orderPrice(o)) &&
    qtyCovers(orderQty(o)),
  );
  if (existingAlgoTp || existingRegularTp) {
    tpConfirmedSet.add(tpKey);
    return;
  }

  const staleRegularTp = openOrders.filter((o) =>
    o.symbol === symbol &&
    o.side === closeSide &&
    isTpType(o.origType ?? o.type) &&
    (!priceMatches(orderPrice(o)) || !qtyCovers(orderQty(o))),
  );
  const staleAlgoTp = algoRows.filter((o) =>
    o.symbol === symbol &&
    String(o.side ?? '').toUpperCase() === closeSide &&
    isTpType(o.orderType ?? o.type) &&
    (!priceMatches(orderPrice(o)) || !qtyCovers(orderQty(o))),
  );
  for (const o of staleRegularTp) {
    if (!o.orderId) continue;
    await client.cancelOrder({ symbol, orderId: o.orderId, apiKey, apiSecret, recvWindow }).catch((e) =>
      console.warn(`[AutoTP] ${symbol} cancel stale TP order ${o.orderId}: ${e.message}`),
    );
    await new Promise((r) => setTimeout(r, 80));
  }
  for (const o of staleAlgoTp) {
    if (!o.algoId) continue;
    await client.cancelAlgoOrder({ algoId: o.algoId, apiKey, apiSecret, recvWindow }).catch((e) =>
      console.warn(`[AutoTP] ${symbol} cancel stale TP algo ${o.algoId}: ${e.message}`),
    );
    await new Promise((r) => setTimeout(r, 80));
  }
  if (staleRegularTp.length || staleAlgoTp.length) {
    invalidateOpenOrdersCache();
    console.log(`[AutoTP] ${symbol} stale TP refresh: regular=${staleRegularTp.length}, algo=${staleAlgoTp.length}, newQty=${quantity}, newTP=${triggerPrice}`);
  }

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

    const entryTol = 0.005;
    const isNearEntry = (price) => {
      const p = Number(price);
      return Number.isFinite(p) && Math.abs(p - Number(newTpPrice)) / Number(newTpPrice) <= entryTol;
    };

    // Check if a close order already exists near entry. A normal TP far above/below
    // entry is not enough here because this guard intentionally moves TP to breakeven.
    const allOpen = Array.isArray(openOrders) ? openOrders : [];
    const existingClose = allOpen.find((o) => {
      const t = String(o.origType ?? o.type ?? '').toUpperCase();
      const sideOk = isLong ? o.side === 'SELL' : o.side === 'BUY';
      if (!sideOk) return false;
      if (t === 'TAKE_PROFIT_MARKET' || t === 'TAKE_PROFIT') {
        return isNearEntry(o.stopPrice ?? o.triggerPrice);
      }
      if (t === 'LIMIT') {
        return isNearEntry(o.price);
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
      const t = String(o.orderType ?? o.type ?? '').toUpperCase();
      if (t !== 'TAKE_PROFIT_MARKET' && t !== 'TAKE_PROFIT') return false;
      return isNearEntry(o.triggerPrice ?? o.stopPrice);
    });
    if (existingAlgo) {
      tpMovedToEntry.set(symbol, entry);
      console.log(`[NegTp] ${symbol} already has algo close near entry, skip`);
      return;
    }

    const closeSide = isLong ? 'SELL' : 'BUY';
    const staleTpOpen = allOpen.filter((o) => {
      const t = String(o.origType ?? o.type ?? '').toUpperCase();
      if (o.side !== closeSide) return false;
      if (t !== 'LIMIT' && t !== 'TAKE_PROFIT' && t !== 'TAKE_PROFIT_MARKET') return false;
      const p = t === 'LIMIT' ? o.price : (o.stopPrice ?? o.triggerPrice);
      return !isNearEntry(p);
    });
    for (const o of staleTpOpen) {
      if (!o.orderId) continue;
      await client.cancelOrder({ symbol, orderId: o.orderId, apiKey, apiSecret, recvWindow }).catch((e) =>
        console.warn(`[NegTp] ${symbol} cancel stale TP order ${o.orderId}: ${e.message}`),
      );
      await new Promise((r) => setTimeout(r, 80));
    }

    const staleTpAlgo = allAlgo.filter((o) => {
      if (o.symbol !== symbol) return false;
      const t = String(o.orderType ?? o.type ?? '').toUpperCase();
      if (t !== 'TAKE_PROFIT' && t !== 'TAKE_PROFIT_MARKET') return false;
      if (String(o.side ?? '').toUpperCase() !== closeSide) return false;
      return !isNearEntry(o.triggerPrice ?? o.stopPrice);
    });
    for (const o of staleTpAlgo) {
      if (!o.algoId) continue;
      await client.cancelAlgoOrder({ algoId: o.algoId, apiKey, apiSecret, recvWindow }).catch((e) =>
        console.warn(`[NegTp] ${symbol} cancel stale TP algo ${o.algoId}: ${e.message}`),
      );
      await new Promise((r) => setTimeout(r, 80));
    }
    if (staleTpOpen.length || staleTpAlgo.length) {
      invalidateOpenOrdersCache();
      console.log(`[NegTp] ${symbol} canceled stale TP(s): regular=${staleTpOpen.length}, algo=${staleTpAlgo.length}`);
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
        : pathname === '/spike-reversal'
          ? '/spike-reversal.html'
        : pathname === '/post-pump-kill-short'
          ? '/post-pump-kill-short.html'
        : pathname === '/dump-ignition'
          ? '/dump-ignition.html'
        : pathname === '/etf-proxy'
          ? '/etf-proxy.html'
        : pathname === '/market-news'
          ? '/market-news.html'
        : pathname === '/coin-flow'
          ? '/coin-flow.html'
        : pathname === '/token-unlocks'
          ? '/token-unlocks.html'
        : pathname === '/pump-ignition'
          ? '/pump-ignition.html'
        : pathname === '/ema-squeeze'
          ? '/ema-squeeze.html'
        : pathname === '/ema99-kill-reclaim'
          ? '/ema99-kill-reclaim.html'
        : pathname === '/shakeout-reclaim'
          ? '/shakeout-reclaim.html'
        : pathname === '/edge-short'
          ? '/edge-short.html'
        : pathname === '/orders'
          ? '/orders.html'
          : pathname === '/highvol'
            ? '/highvol.html'
            : pathname === '/lsratio'
              ? '/lsratio.html'
              : pathname === '/paper'
                ? '/paper.html'
                : pathname === '/liquid-scan'
                  ? '/liquid-scan.html'
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
