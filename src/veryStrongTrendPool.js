import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const VERY_STRONG_TREND_POOL_VERSION =
  'VERY_STRONG_TREND_POOL_V1_BTC_WAVE_OBSERVE_20260928';
export const VERY_STRONG_TREND_POOL_MAX_AGE_MS = 24 * 60 * 60_000;
export const VERY_STRONG_TREND_MIN_ABS_SCORE = 24;
export const VERY_STRONG_TREND_MIN_ORIGIN_VOLUME_RATIO = 1;

const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value, digits = 4) => Number(Number(value).toFixed(digits));

function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values = []) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function candleValue(row, name, index) {
  return finite(row?.[name] ?? row?.[index]);
}

function closedRows(getKlines, symbol, interval, now, limit = 100) {
  let rows;
  try { rows = getKlines(symbol, interval, Math.max(limit, 110)); }
  catch { return []; }
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => finite(row?.closeTime ?? row?.[6], Infinity) <= now)
    .slice(-limit);
}

function quoteVolume(row) {
  return candleValue(row, 'quoteVolume', 7);
}

function takerBuyPct(row) {
  const quote = quoteVolume(row);
  const taker = candleValue(row, 'takerBuyQuoteVolume', 10);
  return quote > 0 && taker != null ? (taker / quote) * 100 : null;
}

function rollingVolumeRatio(rows, recentCount = 3, baselineCount = 20) {
  if (!Array.isArray(rows) || rows.length < recentCount + baselineCount) return null;
  const recent = mean(rows.slice(-recentCount).map(quoteVolume));
  const baseline = median(rows.slice(-(recentCount + baselineCount), -recentCount).map(quoteVolume));
  return recent != null && baseline > 0 ? recent / baseline : null;
}

function closedReturnPct(rows, candleCount) {
  if (!Array.isArray(rows) || rows.length <= candleCount) return null;
  const current = candleValue(rows.at(-1), 'close', 4);
  const previous = candleValue(rows.at(-(candleCount + 1)), 'close', 4);
  return current > 0 && previous > 0 ? (current / previous - 1) * 100 : null;
}

function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let current = mean(values.slice(0, period));
  for (const value of values.slice(period)) current = value * multiplier + current * (1 - multiplier);
  return current;
}

function frameSummary(rows) {
  const closes = rows.map((row) => candleValue(row, 'close', 4)).filter(Number.isFinite);
  const close = closes.at(-1);
  const ema13 = ema(closes, 13);
  const ema25 = ema(closes, 25);
  const ranges = rows.slice(-15).map((row, index, tail) => {
    if (!index) return null;
    const high = candleValue(row, 'high', 2);
    const low = candleValue(row, 'low', 3);
    const previousClose = candleValue(tail[index - 1], 'close', 4);
    return [high, low, previousClose].every(Number.isFinite)
      ? Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose)) : null;
  }).filter(Number.isFinite);
  const atr14 = mean(ranges);
  const state = close > ema13 && ema13 > ema25 ? 'UP'
    : close < ema13 && ema13 < ema25 ? 'DOWN' : 'MIXED';
  return { close, ema13, ema25, atr14, state };
}

export function qualifiesVeryStrongTrendSource(candidate = {}) {
  const score = Math.abs(finite(candidate.score, 0));
  const volumeRatio = finite(candidate?.entryScoreMetrics?.breakoutVolumeRatio, 0);
  return ['LONG', 'SHORT'].includes(candidate.side)
    && finite(candidate.confirmationAt, 0) > 0
    && (candidate.entryTier === 'VERY_STRONG'
      || (score >= VERY_STRONG_TREND_MIN_ABS_SCORE
        && volumeRatio >= VERY_STRONG_TREND_MIN_ORIGIN_VOLUME_RATIO));
}

function nearestDynamicLevel({ side, livePrice, referenceLevel, frames, rows15m }) {
  const frame1h = frames['1h'] ?? {};
  const frame4h = frames['4h'] ?? {};
  const recent15m = rows15m.slice(-16);
  const swing = side === 'LONG'
    ? Math.min(...recent15m.map((row) => candleValue(row, 'low', 3)).filter(Number.isFinite))
    : Math.max(...recent15m.map((row) => candleValue(row, 'high', 2)).filter(Number.isFinite));
  const candidates = [
    { value: finite(referenceLevel), basis: 'MỐC BREAKOUT GỐC' },
    { value: finite(frame1h.ema13), basis: 'EMA13 1H' },
    { value: finite(frame1h.ema25), basis: 'EMA25 1H' },
    { value: finite(frame4h.ema13), basis: 'EMA13 4H' },
    { value: Number.isFinite(swing) ? swing : null, basis: 'BIÊN 15M GẦN' },
  ].filter((item) => item.value > 0 && item.value >= livePrice * 0.90 && item.value <= livePrice * 1.10);
  if (!candidates.length) return null;
  const preferred = candidates.filter((item) => side === 'LONG'
    ? item.value <= livePrice * 1.012 : item.value >= livePrice * 0.988);
  return (preferred.length ? preferred : candidates)
    .sort((left, right) => Math.abs(left.value / livePrice - 1) - Math.abs(right.value / livePrice - 1))[0];
}

export function evaluateVeryStrongTrendRecord(record = {}, {
  getKlines, now = Date.now(),
} = {}) {
  const symbol = String(record.symbol ?? '').toUpperCase();
  const side = record.side;
  const base = {
    ...record,
    poolVersion: VERY_STRONG_TREND_POOL_VERSION,
    evaluatedAt: now,
    originVolumeRatio: round(finite(record?.entryScoreMetrics?.breakoutVolumeRatio, 0), 2),
    poolExpiresAt: finite(record.confirmationAt, now) + VERY_STRONG_TREND_POOL_MAX_AGE_MS,
  };
  const rowsByInterval = Object.fromEntries(['5m', '15m', '1h', '4h']
    .map((interval) => [interval, closedRows(getKlines, symbol, interval, now)]));
  if (Object.values(rowsByInterval).some((rows) => rows.length < 30)) {
    return { ...base, active: false, trendState: 'DATA_STALE', trendReason: 'Thiếu nến đóng 5m/15m/1h/4h.' };
  }
  const last5m = rowsByInterval['5m'].at(-1);
  const livePrice = candleValue(last5m, 'close', 4);
  const frames = Object.fromEntries(Object.entries(rowsByInterval)
    .map(([interval, rows]) => [interval, frameSummary(rows)]));
  const frame1h = frames['1h'] ?? {};
  const frame4h = frames['4h'] ?? {};
  const originVolumeRatio = finite(record?.entryScoreMetrics?.breakoutVolumeRatio, 0);
  const currentVolumeRatio15m = rollingVolumeRatio(rowsByInterval['15m']);
  const currentVolumeRatio5m = rollingVolumeRatio(rowsByInterval['5m']);
  const volumeGood = originVolumeRatio >= VERY_STRONG_TREND_MIN_ORIGIN_VOLUME_RATIO
    && finite(currentVolumeRatio15m, 0) >= 0.55;
  const longStructure = frame4h.state === 'UP'
    && frame1h.state !== 'DOWN'
    && livePrice >= finite(frame1h.ema25, livePrice) * 0.995;
  const shortStructure = frame4h.state === 'DOWN'
    && frame1h.state !== 'UP'
    && livePrice <= finite(frame1h.ema25, livePrice) * 1.005;
  const trendHeld = side === 'LONG' ? longStructure : shortStructure;
  const level = nearestDynamicLevel({
    side, livePrice, referenceLevel: record.referenceLevel, frames, rows15m: rowsByInterval['15m'],
  });
  const atr15m = finite(frames['15m']?.atr14, livePrice * 0.01);
  const width = Math.max(livePrice * 0.0015, atr15m * 0.15);
  const entryZone = level ? {
    low: round(level.value - width, 8), high: round(level.value + width, 8),
    mid: round(level.value, 8), basis: level.basis,
  } : null;
  const invalidationPrice = side === 'LONG'
    ? round(Math.min(
      finite(record.referenceLevel, livePrice) * 0.985,
      finite(frame4h.ema25, livePrice) * 0.99,
    ), 8)
    : round(Math.max(
      finite(record.referenceLevel, livePrice) * 1.015,
      finite(frame4h.ema25, livePrice) * 1.01,
    ), 8);
  const lastOpen = candleValue(last5m, 'open', 1);
  const last5mMovePct = lastOpen > 0 ? (livePrice / lastOpen - 1) * 100 : null;
  const recentMovePct15m = closedReturnPct(rowsByInterval['5m'], 3);
  const recentMovePct1h = closedReturnPct(rowsByInterval['5m'], 12);
  const lastTakerBuyPct = takerBuyPct(last5m);
  const coinTrigger = side === 'LONG'
    ? livePrice > lastOpen && finite(lastTakerBuyPct, 50) >= 50 && finite(currentVolumeRatio5m, 0) >= 0.65
    : livePrice < lastOpen && finite(lastTakerBuyPct, 50) <= 50 && finite(currentVolumeRatio5m, 0) >= 0.65;
  const active = trendHeld && volumeGood && entryZone != null;
  const trendState = !trendHeld ? 'TREND_LOST' : !volumeGood ? 'VOLUME_WEAK' : 'TREND_HELD';
  const trendReason = !trendHeld
    ? `${side} mất cấu trúc 1h/4h.`
    : !volumeGood
      ? `Volume 15m ${round(finite(currentVolumeRatio15m, 0), 2)}x chưa giữ mức tối thiểu 0.55x.`
      : `${side} còn cấu trúc; volume gốc ${round(originVolumeRatio, 2)}x, volume 15m ${round(currentVolumeRatio15m, 2)}x.`;
  return {
    ...base,
    active,
    trendState,
    trendReason,
    livePrice: round(livePrice, 8),
    lastClosed5mAt: finite(last5m?.closeTime ?? last5m?.[6], now),
    livePriceAt: finite(last5m?.closeTime ?? last5m?.[6], now),
    currentTrendScore: ['5m', '15m', '1h', '4h'].reduce((score, interval, index) => {
      const weight = [2, 4, 8, 12][index];
      return score + (frames[interval]?.state === 'UP' ? weight : frames[interval]?.state === 'DOWN' ? -weight : 0);
    }, 0),
    currentFrames: Object.fromEntries(['5m', '15m', '1h', '4h']
      .map((interval) => [interval, frames[interval]?.state ?? 'UNKNOWN'])),
    originVolumeRatio: round(originVolumeRatio, 2),
    currentVolumeRatio15m: round(finite(currentVolumeRatio15m, 0), 2),
    currentVolumeRatio5m: round(finite(currentVolumeRatio5m, 0), 2),
    last5mMovePct: round(finite(last5mMovePct, 0), 3),
    recentMovePct15m: round(recentMovePct15m, 3),
    recentMovePct1h: round(recentMovePct1h, 3),
    volumeGood,
    coinTrigger,
    lastTakerBuyPct: round(finite(lastTakerBuyPct, 0), 1),
    entryZone,
    invalidationPrice,
  };
}

function compactCandidate(candidate) {
  return {
    version: candidate.version,
    entryScoreVersion: candidate.entryScoreVersion,
    symbol: String(candidate.symbol ?? '').toUpperCase(),
    side: candidate.side,
    score: finite(candidate.score),
    referenceLevel: finite(candidate.referenceLevel),
    signalClose: finite(candidate.signalClose),
    confirmationAt: finite(candidate.confirmationAt),
    retestAt: finite(candidate.retestAt),
    entryPrice: finite(candidate.entryPrice),
    entryZone: candidate.entryZone ?? null,
    entryScore: finite(candidate.entryScore),
    entryTier: candidate.entryTier,
    entryTierLabel: candidate.entryTierLabel,
    entryScoreMetrics: candidate.entryScoreMetrics ?? {},
    targetPlan: candidate.targetPlan ?? null,
  };
}

export class VeryStrongTrendPool {
  constructor({ file, seedFile, now = () => Date.now(), maxRecords = 200 } = {}) {
    Object.assign(this, { file, seedFile, now, maxRecords });
    this.state = null;
  }

  async load() {
    if (this.state) return;
    let state;
    try { state = JSON.parse(await readFile(this.file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Very strong trend pool unreadable');
      state = { version: VERY_STRONG_TREND_POOL_VERSION, records: [] };
    }
    if (!Array.isArray(state.records)) state.records = [];
    if (!state.records.length && this.seedFile) {
      try {
        const seed = JSON.parse(await readFile(this.seedFile, 'utf8'));
        state.records = (Array.isArray(seed.events) ? seed.events : [])
          .filter(qualifiesVeryStrongTrendSource)
          .map(compactCandidate);
      } catch { /* Seed history is optional. */ }
    }
    this.state = state;
  }

  async save() {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(this.state, null, 2));
    await rename(`${this.file}.tmp`, this.file);
  }

  async update(candidates = [], { getKlines, at = this.now() } = {}) {
    await this.load();
    const floor = at - VERY_STRONG_TREND_POOL_MAX_AGE_MS;
    const records = new Map(this.state.records
      .filter((record) => finite(record.confirmationAt, 0) >= floor)
      .map((record) => [`${record.symbol}:${record.side}`, record]));
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      if (!qualifiesVeryStrongTrendSource(candidate)) continue;
      const key = `${candidate.symbol}:${candidate.side}`;
      const previous = records.get(key);
      if (!previous || finite(candidate.confirmationAt, 0) >= finite(previous.confirmationAt, 0)) {
        records.set(key, compactCandidate(candidate));
      }
    }
    this.state = {
      version: VERY_STRONG_TREND_POOL_VERSION,
      updatedAt: at,
      records: [...records.values()]
        .sort((left, right) => finite(right.confirmationAt, 0) - finite(left.confirmationAt, 0))
        .slice(0, this.maxRecords),
    };
    await this.save();
    const evaluated = this.state.records.map((record) => evaluateVeryStrongTrendRecord(record, {
      getKlines, now: at,
    }));
    return {
      version: VERY_STRONG_TREND_POOL_VERSION,
      generatedAt: at,
      maxAgeMs: VERY_STRONG_TREND_POOL_MAX_AGE_MS,
      observeOnly: true,
      binanceEligible: false,
      records: evaluated,
      activeRecords: evaluated.filter((record) => record.active),
      totalRecords: evaluated.length,
      totalActive: evaluated.filter((record) => record.active).length,
    };
  }
}
