import { computeHeatmapData } from './liquidityProxy.js';
import { buildLiqScanSnapshot } from './liqScanSnapshot.js';
import { LIQ_SCAN_HIGH_SCORE_DISCORD_THRESHOLD } from './liqScanHighScoreDiscord.js';

export const LIQ_SCAN_HIGH_SCORE_BACKGROUND_VERSION =
  'LIQSCAN_MAIN_KILL_SWEEP_BACKGROUND_TOP400_V2_20260918';

const FIFTEEN_MINUTES_MS = 15 * 60_000;
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const valueOf = (row, key, index) => finite(row?.[key], finite(row?.[index]));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function validContinuousRows(rows, now, minBars) {
  if (!Array.isArray(rows) || rows.length < minBars) return null;
  const selected = rows.slice(-Math.max(minBars, Math.min(500, rows.length)));
  for (let index = 0; index < selected.length; index += 1) {
    const row = selected[index];
    const openTime = valueOf(row, 'openTime', 0);
    const closeTime = valueOf(row, 'closeTime', 6);
    const open = valueOf(row, 'open', 1);
    const high = valueOf(row, 'high', 2);
    const low = valueOf(row, 'low', 3);
    const close = valueOf(row, 'close', 4);
    const quoteVolume = valueOf(row, 'quoteVolume', 7);
    if (![openTime, closeTime, open, high, low, close, quoteVolume].every(Number.isFinite)
      || closeTime - openTime !== FIFTEEN_MINUTES_MS - 1
      || low <= 0 || high < Math.max(open, close) || low > Math.min(open, close)
      || quoteVolume < 0
      || (index > 0 && openTime - valueOf(selected[index - 1], 'openTime', 0) !== FIFTEEN_MINUTES_MS)) {
      return null;
    }
  }
  const lastCloseTime = valueOf(selected.at(-1), 'closeTime', 6);
  return lastCloseTime >= now ? selected : null;
}

export function buildBackgroundLiqScanAnalysis({
  row,
  klines,
  now = Date.now(),
  minBars = 60,
  heatmapBuilder = computeHeatmapData,
  snapshotBuilder = buildLiqScanSnapshot,
} = {}) {
  const symbol = String(row?.symbol ?? '').trim().toUpperCase();
  const markPrice = finite(row?.markPrice);
  const continuous = validContinuousRows(klines, now, minBars);
  if (!symbol || !(markPrice > 0) || !continuous) return null;
  const heatmap = heatmapBuilder({
    klines: continuous,
    currentPrice: markPrice,
    momentumPct: finite(row?.change24hPct ?? row?.priceChangePercent),
  });
  const liqScan = snapshotBuilder({
    symbol,
    markPrice,
    heatmap,
    evaluatedAt: now,
    biasThreshold: 0.4,
  });
  return {
    backgroundVersion: LIQ_SCAN_HIGH_SCORE_BACKGROUND_VERSION,
    symbol,
    generatedAt: new Date(now).toISOString(),
    freshness: { stale: false, binance: 'BACKGROUND_CACHE_LIVE' },
    market: {
      markPrice,
      change24hPct: finite(row?.change24hPct ?? row?.priceChangePercent, 0),
      quoteVolume: finite(row?.quoteVolume, 0),
    },
    backgroundCandle: {
      openTime: valueOf(continuous.at(-1), 'openTime', 0),
      closeTime: valueOf(continuous.at(-1), 'closeTime', 6),
      high: valueOf(continuous.at(-1), 'high', 2),
      low: valueOf(continuous.at(-1), 'low', 3),
      close: valueOf(continuous.at(-1), 'close', 4),
    },
    liqScan,
    coinglass: { available: false },
  };
}

export async function scanLiqScanHighScoreBackground({
  snapshot,
  snapshotAt,
  cache,
  notify,
  now = Date.now(),
  maxSymbols = 400,
  minBars = 60,
  maxSnapshotAgeMs = 90_000,
  maxTickAgeMs = 90_000,
  alertDelayMs = 450,
  heatmapBuilder = computeHeatmapData,
  snapshotBuilder = buildLiqScanSnapshot,
} = {}) {
  const snapshotAgeMs = now - finite(snapshotAt, NaN);
  if (!Array.isArray(snapshot) || !cache || typeof notify !== 'function'
    || !Number.isFinite(snapshotAgeMs) || snapshotAgeMs < 0 || snapshotAgeMs > maxSnapshotAgeMs) {
    return {
      version: LIQ_SCAN_HIGH_SCORE_BACKGROUND_VERSION,
      selected: 0, processed: 0, active: 0, sent: 0, failed: 0,
      skipped: 'SNAPSHOT_STALE_OR_INVALID',
    };
  }
  const selected = [...new Map(snapshot
    .filter((row) => String(row?.symbol ?? '').toUpperCase().endsWith('USDT'))
    .filter((row) => finite(row?.markPrice, 0) > 0)
    .sort((left, right) => finite(right?.quoteVolume, 0) - finite(left?.quoteVolume, 0))
    .map((row) => [String(row.symbol).toUpperCase(), row])).values()]
    .slice(0, Math.max(1, Math.min(400, finite(maxSymbols, 400))));
  let processed = 0;
  let active = 0;
  let sent = 0;
  let swept = 0;
  let failed = 0;
  let missingCache = 0;
  let staleCache = 0;
  let invalidCache = 0;
  for (const row of selected) {
    const symbol = String(row.symbol).toUpperCase();
    const klines = cache.getIfCached?.(symbol, '15m', 500);
    if (!klines || klines.length < minBars) {
      missingCache += 1;
      continue;
    }
    const coverage = cache.liveCoverage?.([symbol], '15m', now);
    if (coverage && (coverage.live < 1 || coverage.ticked < 1
      || !Number.isFinite(coverage.newestTickAgeMs)
      || coverage.newestTickAgeMs > maxTickAgeMs)) {
      staleCache += 1;
      continue;
    }
    let analysis;
    try {
      analysis = buildBackgroundLiqScanAnalysis({
        row, klines, now, minBars, heatmapBuilder, snapshotBuilder,
      });
    } catch {
      analysis = null;
    }
    if (!analysis) {
      invalidCache += 1;
      continue;
    }
    processed += 1;
    if (finite(analysis.liqScan?.imbalanceScore, 0) >= LIQ_SCAN_HIGH_SCORE_DISCORD_THRESHOLD) {
      active += 1;
    }
    try {
      const outcome = await notify(analysis);
      swept += outcome?.detected === true ? 1 : 0;
      const delivered = finite(outcome?.sent, 0);
      sent += delivered;
      if (delivered > 0 && alertDelayMs > 0) await wait(alertDelayMs);
    } catch {
      failed += 1;
    }
  }
  return {
    version: LIQ_SCAN_HIGH_SCORE_BACKGROUND_VERSION,
    selected: selected.length,
    processed,
    active,
    swept,
    sent,
    failed,
    missingCache,
    staleCache,
    invalidCache,
  };
}
