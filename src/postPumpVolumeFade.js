import { aggregateKlinesFrom15m } from './postDumpVolumeRecovery.js';

export const POST_PUMP_VOLUME_FADE_VERSION = 'POST_PUMP_VOLUME_FADE_MTF_PRIORITY_LABELS_V3_20260925';

export const POST_PUMP_TIMEFRAME_CONFIGS = Object.freeze([
  Object.freeze({
    interval: '15m', label: '15 PHÚT',
    lookbackBars: 128, baselineBars: 20, minBars: 30,
    minPumpBodyPct: 3.5, minPumpHighPct: 6, minPumpVolumeRatio: 1.8,
    minPumpQuoteVolume: 100_000, minFadePct: 15,
    confirmedFadePct: 35, minScore: 45, maxSellAgeBars: 12,
  }),
  Object.freeze({
    interval: '1h', label: '1 GIỜ',
    lookbackBars: 96, baselineBars: 20, minBars: 30,
    minPumpBodyPct: 5, minPumpHighPct: 8, minPumpVolumeRatio: 1.7,
    minPumpQuoteVolume: 250_000, minFadePct: 15,
    confirmedFadePct: 35, minScore: 45, maxSellAgeBars: 8,
  }),
  Object.freeze({
    interval: '4h', label: '4 GIỜ',
    lookbackBars: 20, baselineBars: 10, minBars: 14,
    minPumpBodyPct: 8, minPumpHighPct: 12, minPumpVolumeRatio: 1.6,
    minPumpQuoteVolume: 500_000, minFadePct: 12,
    confirmedFadePct: 30, minScore: 42, maxSellAgeBars: 4,
  }),
]);

const DEFAULTS = POST_PUMP_TIMEFRAME_CONFIGS[0];

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pctChange(value, base) {
  if (!Number.isFinite(value) || !Number.isFinite(base) || base <= 0) return null;
  return ((value / base) - 1) * 100;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizeCandle(raw) {
  if (!raw) return null;
  const candle = {
    openTime: number(raw.openTime), closeTime: number(raw.closeTime),
    open: number(raw.open), high: number(raw.high), low: number(raw.low), close: number(raw.close),
    volume: number(raw.volume, 0), quoteVolume: number(raw.quoteVolume, 0),
    takerBuyQuoteVolume: number(raw.takerBuyQuoteVolume, 0),
  };
  if (
    !Number.isFinite(candle.openTime) || !Number.isFinite(candle.closeTime)
    || !Number.isFinite(candle.open) || !Number.isFinite(candle.high)
    || !Number.isFinite(candle.low) || !Number.isFinite(candle.close) || candle.open <= 0
  ) return null;
  return candle;
}

function buildIdealShortEntry({ pump, sell, price, status }) {
  if (status === 'WEAKENED') {
    return {
      state: 'AVOID_WEAKENED', basis: 'Nhịp SHORT đang yếu; không đề xuất entry.',
      zoneLow: null, zoneHigh: null, midpoint: null, distanceFromLivePct: null,
    };
  }
  const range = pump.high - pump.open;
  let zoneLow;
  let zoneHigh;
  let basis;
  if (sell) {
    const structureCeiling = pump.high - (range * 0.5);
    const bodyMidpoint = sell.close + ((sell.open - sell.close) * 0.5);
    zoneLow = Math.min(pump.close, Math.max(structureCeiling, bodyMidpoint));
    zoneHigh = Math.max(zoneLow, Math.min(pump.high, sell.high));
    basis = 'RETEST_UPPER_HALF_SELL_CANDLE';
  } else {
    zoneLow = pump.high - (range * 0.5);
    zoneHigh = Math.min(pump.close, pump.high - (range * 0.382));
    zoneHigh = Math.max(zoneLow, zoneHigh);
    basis = 'PUMP_RANGE_382_500';
  }
  const midpoint = (zoneLow + zoneHigh) / 2;
  const state = price < zoneLow * 0.995
    ? 'WAIT_BOUNCE'
    : price > zoneHigh * 1.005
      ? 'WAIT_REJECT'
      : 'IN_ZONE';
  return {
    state, basis,
    zoneLow: round(zoneLow, 10), zoneHigh: round(zoneHigh, 10), midpoint: round(midpoint, 10),
    distanceFromLivePct: round(pctChange(midpoint, price)),
  };
}

export function classifyPostPumpFadeStage(candidate = {}) {
  if (candidate.status === 'WEAKENED' || candidate.idealEntry?.state === 'AVOID_WEAKENED') {
    return { key: 'SHORT_WEAKENED', label: 'BẬT LẠI · SHORT YẾU', tone: 'weak', rank: 1,
      entryHint: 'Giá đang bật khỏi đáy fade; không đuổi SHORT.' };
  }
  const sellAge = number(candidate.sell?.ageBars);
  const sellPricePct = Math.abs(number(candidate.sell?.pricePct, 0));
  const sellVolumeRatio = number(candidate.sell?.volumeRatio, 0);
  if (sellAge === 0 && (sellPricePct >= 1 || sellVolumeRatio >= 1.5)) {
    return { key: 'SHORT_FIRST_STRONG_CANDLE', label: 'NẾN GIẢM ĐẦU TIÊN', tone: 'impulse', rank: 4,
      entryHint: 'Nến bán mạnh đầu tiên đã đóng; tránh SHORT đuổi, ưu tiên retest.' };
  }
  if (candidate.idealEntry?.state === 'WAIT_BOUNCE'
    || number(candidate.fadePct, 0) >= 60
    || (sellAge != null && sellAge >= 1)) {
    return { key: 'SHORT_EXTENDED', label: 'ĐÃ TUỘT XA · CHỜ HỒI', tone: 'extended', rank: 2,
      entryHint: 'Giá đã rời vùng SHORT đẹp; chờ hồi lên thay vì đuổi xuống.' };
  }
  if (number(candidate.fadePct, 999) <= 35
    || ['IN_ZONE', 'WAIT_REJECT'].includes(candidate.idealEntry?.state)) {
    return { key: 'SHORT_NEAR_TOP', label: 'SÁT ĐỈNH', tone: 'fresh', rank: 5,
      entryHint: 'Giá còn gần đỉnh/vùng SHORT đẹp; chưa tuột xa.' };
  }
  return { key: 'SHORT_FADING', label: 'ĐANG GIẢM · CHỜ XÁC NHẬN', tone: 'watch', rank: 3,
    entryHint: 'Đã rời đỉnh nhưng chưa thuộc nến bán mạnh hoặc nhịp giảm xa.' };
}

function scoreCandidate(candidate, config) {
  const pumpDepth = Math.max(candidate.pumpBodyPct, candidate.pumpHighPct);
  const severityBase = Math.min(config.minPumpBodyPct, config.minPumpHighPct);
  const severityPoints = clamp((pumpDepth - severityBase) * 4, 0, 25);
  const pumpVolumePoints = clamp((candidate.pumpVolumeRatio - (config.minPumpVolumeRatio - 0.3)) * 10, 0, 20);
  const fadePoints = clamp((candidate.fadePct - 15) * 0.4, 0, 25);
  const sellPoints = candidate.sell
    ? 15 + clamp((candidate.sell.volumeRatio - 1) * 5, 0, 5)
    : 0;
  const freshnessPoints = candidate.sell ? clamp(10 - candidate.sell.ageBars, 0, 10) : 0;
  return round(severityPoints + pumpVolumePoints + fadePoints + sellPoints + freshnessPoints, 1);
}

function buildCandidate({ symbol, closed, live, pumpIndex, config, now }) {
  const pump = closed[pumpIndex];
  const baseline = closed.slice(Math.max(0, pumpIndex - config.baselineBars), pumpIndex);
  const baselineQuoteVolume = median(baseline.map((candle) => candle.quoteVolume));
  if (!Number.isFinite(baselineQuoteVolume) || baselineQuoteVolume <= 0) return null;

  const pumpBodyPct = pctChange(pump.close, pump.open);
  const pumpHighPct = pctChange(pump.high, pump.open);
  const pumpVolumeRatio = pump.quoteVolume / baselineQuoteVolume;
  const strongPump = (
    pumpBodyPct >= config.minPumpBodyPct || pumpHighPct >= config.minPumpHighPct
  ) && pumpVolumeRatio >= config.minPumpVolumeRatio
    && pump.quoteVolume >= config.minPumpQuoteVolume;
  if (!strongPump) return null;

  const price = number(live?.close, closed.at(-1)?.close);
  const anchorRange = pump.high - pump.open;
  if (!Number.isFinite(price) || anchorRange <= 0) return null;
  const fadePct = ((pump.high - price) / anchorRange) * 100;
  if (fadePct < config.minFadePct || price >= pump.high * 0.99) return null;

  const after = closed.slice(pumpIndex + 1);
  let sell = null;
  for (let offset = 0; offset < after.length; offset += 1) {
    const candle = after[offset];
    const absoluteIndex = pumpIndex + 1 + offset;
    const previous = closed[absoluteIndex - 1];
    const volumeRatio = candle.quoteVolume / baselineQuoteVolume;
    const priceDown = candle.close < candle.open && candle.close < previous.close;
    const volumeUp = candle.quoteVolume >= previous.quoteVolume * 1.05 && volumeRatio >= 1.1;
    if (priceDown && volumeUp) {
      sell = {
        openTime: candle.openTime, closeTime: candle.closeTime,
        open: candle.open, high: candle.high, low: candle.low, close: candle.close,
        price: candle.close, pricePct: round(pctChange(candle.close, previous.close)),
        volumeRatio: round(volumeRatio),
        volumeVsPrevious: round(candle.quoteVolume / Math.max(previous.quoteVolume, 1)),
        ageBars: closed.length - 1 - absoluteIndex,
      };
    }
  }

  const latest = closed.at(-1);
  const previous = closed.at(-2);
  const trendBase = closed.at(-4) ?? previous;
  const latestPricePct = round(pctChange(latest.close, previous.close));
  const recentTrendPct = round(pctChange(latest.close, trendBase.close));
  const postPump = [...after, ...(live ? [live] : [])];
  const postPumpLow = Math.min(pump.close, ...postPump.map((candle) => candle.low));
  const reboundFromFadeLowPct = round(pctChange(price, postPumpLow));
  const confirmed = Boolean(
    sell && sell.ageBars <= config.maxSellAgeBars
    && fadePct >= config.confirmedFadePct
    && price <= pump.close * 0.995
    && recentTrendPct <= 1.5
  );
  const weakened = fadePct >= config.confirmedFadePct
    && reboundFromFadeLowPct >= 3
    && recentTrendPct > 0;
  const status = weakened ? 'WEAKENED' : confirmed ? 'CONFIRMED' : 'BUILDING';
  const idealEntry = buildIdealShortEntry({ pump, sell, price, status });

  let liveProjectedVolumeRatio = null;
  let liveProgressPct = null;
  if (live) {
    const duration = Math.max(1, live.closeTime - live.openTime + 1);
    const progress = clamp((now - live.openTime) / duration, 0.08, 1);
    liveProjectedVolumeRatio = (live.quoteVolume / progress) / baselineQuoteVolume;
    liveProgressPct = progress * 100;
  }

  const candidate = {
    symbol, interval: config.interval, status,
    pumpAt: pump.openTime, pumpCloseAt: pump.closeTime,
    pumpAgeBars: closed.length - 1 - pumpIndex,
    pumpOpen: round(pump.open, 10), pumpHigh: round(pump.high, 10),
    pumpLow: round(pump.low, 10), pumpClose: round(pump.close, 10),
    pumpBodyPct: round(pumpBodyPct), pumpHighPct: round(pumpHighPct),
    pumpQuoteVolume: round(pump.quoteVolume), pumpVolumeRatio: round(pumpVolumeRatio),
    currentPrice: round(price, 10), fadePct: round(fadePct, 1),
    fromPumpClosePct: round(pctChange(price, pump.close)),
    latestClosedPricePct: latestPricePct, recentTrendPct, reboundFromFadeLowPct,
    sell, idealEntry,
    live: live ? {
      openTime: live.openTime, pricePct: round(pctChange(live.close, live.open)),
      projectedVolumeRatio: round(liveProjectedVolumeRatio), progressPct: round(liveProgressPct, 1),
    } : null,
    confirmationPrice: round(pump.open, 10),
    invalidationPrice: round(pump.high, 10),
    observeOnly: true,
  };
  candidate.moveStage = classifyPostPumpFadeStage(candidate);
  candidate.score = scoreCandidate(candidate, config);
  return candidate.score >= config.minScore ? candidate : null;
}

export function evaluatePostPumpVolumeFade(symbol, rawKlines, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const now = number(options.now, Date.now());
  const normalized = (Array.isArray(rawKlines) ? rawKlines : [])
    .map(normalizeCandle).filter(Boolean).sort((a, b) => a.openTime - b.openTime);
  const closed = normalized.filter((candle) => candle.closeTime <= now);
  const live = normalized.findLast((candle) => candle.closeTime > now) ?? null;
  if (closed.length < config.minBars) {
    return { candidate: null, reason: 'INSUFFICIENT_BARS', closedBars: closed.length };
  }
  const firstIndex = Math.max(config.baselineBars, closed.length - config.lookbackBars);
  const candidates = [];
  for (let index = firstIndex; index <= closed.length - 2; index += 1) {
    const candidate = buildCandidate({ symbol, closed, live, pumpIndex: index, config, now });
    if (candidate) candidates.push(candidate);
  }
  candidates.sort((a, b) => b.score - a.score || b.pumpAt - a.pumpAt);
  return {
    candidate: candidates[0] ?? null,
    reason: candidates.length ? 'MATCH' : 'NO_ACTIVE_FADE',
    closedBars: closed.length,
  };
}

export function buildPostPumpVolumeFadeSnapshot(options = {}) {
  const startedAt = Date.now();
  const symbols = Array.isArray(options.symbols) ? options.symbols : [];
  const getKlines = typeof options.getKlines === 'function' ? options.getKlines : () => [];
  const now = number(options.now, Date.now());
  const frames = POST_PUMP_TIMEFRAME_CONFIGS.map((config) => ({
    config, items: [], excluded: { insufficientBars: 0, noActiveFade: 0 },
  }));
  for (const symbol of symbols) {
    const source15m = getKlines(symbol);
    for (const frame of frames) {
      const klines = aggregateKlinesFrom15m(source15m, frame.config.interval, { now });
      const result = evaluatePostPumpVolumeFade(symbol, klines, { ...frame.config, now });
      if (result.candidate) frame.items.push(result.candidate);
      else if (result.reason === 'INSUFFICIENT_BARS') frame.excluded.insufficientBars += 1;
      else frame.excluded.noActiveFade += 1;
    }
  }
  const statusRank = { CONFIRMED: 0, BUILDING: 1, WEAKENED: 2 };
  const timeframes = frames.map((frame) => {
    frame.items.sort((a, b) => (
      (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9)
      || b.score - a.score || b.pumpAt - a.pumpAt
    ));
    return {
      interval: frame.config.interval, label: frame.config.label,
      source: frame.config.interval === '15m' ? 'KLINE_CACHE_15M' : 'AGGREGATED_FROM_CLOSED_15M',
      config: {
        lookbackBars: frame.config.lookbackBars, baselineBars: frame.config.baselineBars,
        minPumpBodyPct: frame.config.minPumpBodyPct, minPumpHighPct: frame.config.minPumpHighPct,
        minPumpVolumeRatio: frame.config.minPumpVolumeRatio, minFadePct: frame.config.minFadePct,
        confirmedFadePct: frame.config.confirmedFadePct, minScore: frame.config.minScore,
      },
      stats: {
        scanned: symbols.length, matched: frame.items.length,
        confirmed: frame.items.filter((item) => item.status === 'CONFIRMED').length,
        building: frame.items.filter((item) => item.status === 'BUILDING').length,
        weakened: frame.items.filter((item) => item.status === 'WEAKENED').length,
        excluded: frame.excluded,
      },
      items: frame.items,
    };
  });
  const firstFrame = timeframes[0];
  const allItems = timeframes.flatMap((frame) => frame.items);
  return {
    version: POST_PUMP_VOLUME_FADE_VERSION, generatedAt: now, interval: DEFAULTS.interval,
    observeOnly: true,
    execution: {
      binanceEnabled: false, affectsEntry: false, affectsSize: false,
      affectsStopLoss: false, affectsTakeProfit: false,
    },
    config: firstFrame.config,
    stats: { ...firstFrame.stats, elapsedMs: Date.now() - startedAt },
    items: firstFrame.items,
    summary: {
      totalCases: allItems.length,
      uniqueSymbols: new Set(allItems.map((item) => item.symbol)).size,
      confirmed: allItems.filter((item) => item.status === 'CONFIRMED').length,
      building: allItems.filter((item) => item.status === 'BUILDING').length,
      weakened: allItems.filter((item) => item.status === 'WEAKENED').length,
      byTimeframe: Object.fromEntries(timeframes.map((frame) => [frame.interval, frame.stats.matched])),
    },
    timeframes,
  };
}
