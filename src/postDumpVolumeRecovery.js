export const POST_DUMP_VOLUME_RECOVERY_VERSION = 'POST_DUMP_VOLUME_RECOVERY_MTF_PRIORITY_LABELS_V5_20260925';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

export const POST_DUMP_TIMEFRAME_CONFIGS = Object.freeze([
  Object.freeze({
    interval: '15m', label: '15 PHÚT', durationMs: FIFTEEN_MINUTES_MS,
    lookbackBars: 128, baselineBars: 20, minBars: 30,
    minDumpBodyPct: 3.5, minDumpLowPct: 6, minDumpVolumeRatio: 1.8,
    minDumpQuoteVolume: 100_000, minRecoveryPct: 15,
    confirmedRecoveryPct: 35, minScore: 45, maxLiftAgeBars: 12,
  }),
  Object.freeze({
    interval: '1h', label: '1 GIỜ', durationMs: 60 * 60 * 1000,
    lookbackBars: 96, baselineBars: 20, minBars: 30,
    minDumpBodyPct: 5, minDumpLowPct: 8, minDumpVolumeRatio: 1.7,
    minDumpQuoteVolume: 250_000, minRecoveryPct: 15,
    confirmedRecoveryPct: 35, minScore: 45, maxLiftAgeBars: 8,
  }),
  Object.freeze({
    interval: '4h', label: '4 GIỜ', durationMs: 4 * 60 * 60 * 1000,
    lookbackBars: 20, baselineBars: 10, minBars: 14,
    minDumpBodyPct: 8, minDumpLowPct: 12, minDumpVolumeRatio: 1.6,
    minDumpQuoteVolume: 500_000, minRecoveryPct: 12,
    confirmedRecoveryPct: 30, minScore: 42, maxLiftAgeBars: 4,
  }),
]);

const DEFAULTS = POST_DUMP_TIMEFRAME_CONFIGS[0];

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
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizeCandle(raw) {
  if (!raw) return null;
  const candle = {
    openTime: number(raw.openTime),
    closeTime: number(raw.closeTime),
    open: number(raw.open),
    high: number(raw.high),
    low: number(raw.low),
    close: number(raw.close),
    volume: number(raw.volume, 0),
    quoteVolume: number(raw.quoteVolume, 0),
    takerBuyQuoteVolume: number(raw.takerBuyQuoteVolume, 0),
  };
  if (
    !Number.isFinite(candle.openTime)
    || !Number.isFinite(candle.closeTime)
    || !Number.isFinite(candle.open)
    || !Number.isFinite(candle.high)
    || !Number.isFinite(candle.low)
    || !Number.isFinite(candle.close)
    || candle.open <= 0
  ) return null;
  return candle;
}

export function aggregateKlinesFrom15m(rawKlines, interval, options = {}) {
  if (interval === '15m') return Array.isArray(rawKlines) ? rawKlines : [];
  const definition = POST_DUMP_TIMEFRAME_CONFIGS.find((item) => item.interval === interval);
  if (!definition) throw new Error(`Unsupported recovery timeframe: ${interval}`);
  const now = number(options.now, Date.now());
  const expectedSources = Math.round(definition.durationMs / FIFTEEN_MINUTES_MS);
  const buckets = new Map();
  const normalized = (Array.isArray(rawKlines) ? rawKlines : [])
    .map(normalizeCandle)
    .filter(Boolean)
    .sort((a, b) => a.openTime - b.openTime);

  for (const candle of normalized) {
    const bucketOpen = Math.floor(candle.openTime / definition.durationMs) * definition.durationMs;
    const existing = buckets.get(bucketOpen);
    if (!existing) {
      buckets.set(bucketOpen, {
        openTime: bucketOpen,
        closeTime: bucketOpen + definition.durationMs - 1,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        quoteVolume: candle.quoteVolume,
        takerBuyQuoteVolume: candle.takerBuyQuoteVolume,
        sourceCount: 1,
      });
      continue;
    }
    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += candle.volume;
    existing.quoteVolume += candle.quoteVolume;
    existing.takerBuyQuoteVolume += candle.takerBuyQuoteVolume;
    existing.sourceCount += 1;
  }

  return [...buckets.values()]
    .filter((candle) => candle.closeTime > now || candle.sourceCount === expectedSources)
    .sort((a, b) => a.openTime - b.openTime);
}

function scoreCandidate(candidate, config) {
  const dumpDepth = Math.max(-candidate.dumpBodyPct, -candidate.dumpLowPct);
  const severityBase = Math.min(config.minDumpBodyPct, config.minDumpLowPct);
  const severityPoints = clamp((dumpDepth - severityBase) * 4, 0, 25);
  const dumpVolumePoints = clamp((candidate.dumpVolumeRatio - (config.minDumpVolumeRatio - 0.3)) * 10, 0, 20);
  const recoveryPoints = clamp((candidate.recoveryPct - 15) * 0.4, 0, 25);
  const liftPoints = candidate.lift
    ? 15 + clamp((candidate.lift.volumeRatio - 1) * 5, 0, 5)
    : 0;
  const freshnessPoints = candidate.lift
    ? clamp(10 - candidate.lift.ageBars, 0, 10)
    : 0;
  return round(severityPoints + dumpVolumePoints + recoveryPoints + liftPoints + freshnessPoints, 1);
}

function buildIdealEntry({ dump, lift, price, status }) {
  if (status === 'WEAKENED') {
    return {
      state: 'AVOID_WEAKENED',
      basis: 'Tín hiệu đã yếu lại; không đề xuất entry.',
      zoneLow: null,
      zoneHigh: null,
      midpoint: null,
      distanceFromLivePct: null,
    };
  }
  const range = dump.open - dump.low;
  let zoneLow;
  let zoneHigh;
  let basis;
  if (lift) {
    const structureFloor = dump.low + (range * 0.5);
    zoneLow = Math.max(dump.close, structureFloor, lift.low);
    zoneHigh = Math.max(zoneLow, lift.open + ((lift.close - lift.open) * 0.5));
    basis = 'RETEST_HALF_LIFT_CANDLE';
  } else {
    zoneLow = Math.max(dump.close, dump.low + (range * 0.382));
    zoneHigh = Math.max(zoneLow, dump.low + (range * 0.5));
    basis = 'DUMP_RANGE_382_500';
  }
  const midpoint = (zoneLow + zoneHigh) / 2;
  const state = price > zoneHigh * 1.005
    ? 'WAIT_PULLBACK'
    : price < zoneLow * 0.995
      ? 'WAIT_RECLAIM'
      : 'IN_ZONE';
  return {
    state,
    basis,
    zoneLow: round(zoneLow, 10),
    zoneHigh: round(zoneHigh, 10),
    midpoint: round(midpoint, 10),
    distanceFromLivePct: round(pctChange(midpoint, price)),
  };
}

export function classifyPostDumpRecoveryStage(candidate = {}) {
  if (candidate.status === 'WEAKENED' || candidate.idealEntry?.state === 'AVOID_WEAKENED') {
    return { key: 'LONG_WEAKENED', label: 'YẾU LẠI', tone: 'weak', rank: 1,
      entryHint: 'Không đuổi LONG; nhịp hồi đang trả giá.' };
  }
  const liftAge = number(candidate.lift?.ageBars);
  const liftPricePct = Math.abs(number(candidate.lift?.pricePct, 0));
  const liftVolumeRatio = number(candidate.lift?.volumeRatio, 0);
  if (liftAge === 0 && (liftPricePct >= 1 || liftVolumeRatio >= 1.5)) {
    return { key: 'LONG_FIRST_STRONG_CANDLE', label: 'NẾN HỒI ĐẦU TIÊN', tone: 'impulse', rank: 4,
      entryHint: 'Nến hồi mạnh đầu tiên đã đóng; tránh mua đuổi, ưu tiên retest.' };
  }
  const dumpAge = number(candidate.dumpAgeBars, 999);
  const liveUp = number(candidate.live?.pricePct, number(candidate.latestClosedPricePct, 0)) > 0;
  if (!candidate.lift && dumpAge <= 2 && liveUp) {
    return { key: 'LONG_FRESH_REVERSAL', label: 'VỪA SẬP · ĐANG RÚT CHÂN', tone: 'fresh', rank: 5,
      entryHint: 'Nhịp bật còn mới; chưa có nến dòng tiền đóng xác nhận.' };
  }
  if (candidate.idealEntry?.state === 'WAIT_PULLBACK'
    || number(candidate.recoveryPct, 0) >= 65
    || (liftAge != null && liftAge >= 1)) {
    return { key: 'LONG_EXTENDED', label: 'ĐÃ CHẠY XA · CHỜ HỒI', tone: 'extended', rank: 2,
      entryHint: 'Giá đã rời vùng đẹp; chỉ theo dõi pullback, không đuổi.' };
  }
  return { key: 'LONG_RECOVERING', label: 'ĐANG HỒI · CHỜ XÁC NHẬN', tone: 'watch', rank: 3,
    entryHint: 'Đã rời đáy nhưng chưa thuộc nhịp bật mới hoặc nến mạnh đã đóng.' };
}

function buildCandidate({ symbol, closed, live, dumpIndex, config, now }) {
  const dump = closed[dumpIndex];
  const baseline = closed.slice(Math.max(0, dumpIndex - config.baselineBars), dumpIndex);
  const baselineQuoteVolume = median(baseline.map((candle) => candle.quoteVolume));
  if (!Number.isFinite(baselineQuoteVolume) || baselineQuoteVolume <= 0) return null;

  const dumpBodyPct = pctChange(dump.close, dump.open);
  const dumpLowPct = pctChange(dump.low, dump.open);
  const dumpVolumeRatio = dump.quoteVolume / baselineQuoteVolume;
  const strongDump = (
    dumpBodyPct <= -config.minDumpBodyPct
    || dumpLowPct <= -config.minDumpLowPct
  ) && dumpVolumeRatio >= config.minDumpVolumeRatio
    && dump.quoteVolume >= config.minDumpQuoteVolume;
  if (!strongDump) return null;

  const price = number(live?.close, closed.at(-1)?.close);
  const anchorRange = dump.open - dump.low;
  if (!Number.isFinite(price) || anchorRange <= 0) return null;
  const recoveryPct = ((price - dump.low) / anchorRange) * 100;
  if (recoveryPct < config.minRecoveryPct || price <= dump.low * 1.01) return null;

  const after = closed.slice(dumpIndex + 1);
  let lift = null;
  for (let offset = 0; offset < after.length; offset += 1) {
    const candle = after[offset];
    const absoluteIndex = dumpIndex + 1 + offset;
    const previous = closed[absoluteIndex - 1];
    const volumeRatio = candle.quoteVolume / baselineQuoteVolume;
    const priceUp = candle.close > candle.open && candle.close > previous.close;
    const volumeUp = candle.quoteVolume >= previous.quoteVolume * 1.05 && volumeRatio >= 1.1;
    if (priceUp && volumeUp) {
      lift = {
        openTime: candle.openTime,
        closeTime: candle.closeTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        price: candle.close,
        pricePct: round(pctChange(candle.close, previous.close)),
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
  const postDump = [...after, ...(live ? [live] : [])];
  const postDumpHigh = Math.max(dump.close, ...postDump.map((candle) => candle.high));
  const pullbackFromRecoveryHighPct = round(pctChange(price, postDumpHigh));
  const confirmed = Boolean(
    lift
    && lift.ageBars <= config.maxLiftAgeBars
    && recoveryPct >= config.confirmedRecoveryPct
    && price >= dump.close * 1.005
    && recentTrendPct >= -1.5
  );
  const weakened = recoveryPct >= config.confirmedRecoveryPct
    && pullbackFromRecoveryHighPct <= -3
    && recentTrendPct < 0;
  const status = weakened ? 'WEAKENED' : confirmed ? 'CONFIRMED' : 'BUILDING';
  const idealEntry = buildIdealEntry({ dump, lift, price, status });

  let liveProjectedVolumeRatio = null;
  let liveProgressPct = null;
  if (live) {
    const duration = Math.max(1, live.closeTime - live.openTime + 1);
    const progress = clamp((now - live.openTime) / duration, 0.08, 1);
    liveProjectedVolumeRatio = (live.quoteVolume / progress) / baselineQuoteVolume;
    liveProgressPct = progress * 100;
  }

  const candidate = {
    symbol,
    interval: config.interval,
    status,
    dumpAt: dump.openTime,
    dumpCloseAt: dump.closeTime,
    dumpAgeBars: closed.length - 1 - dumpIndex,
    dumpOpen: round(dump.open, 10),
    dumpHigh: round(dump.high, 10),
    dumpLow: round(dump.low, 10),
    dumpClose: round(dump.close, 10),
    dumpBodyPct: round(dumpBodyPct),
    dumpLowPct: round(dumpLowPct),
    dumpQuoteVolume: round(dump.quoteVolume),
    dumpVolumeRatio: round(dumpVolumeRatio),
    currentPrice: round(price, 10),
    recoveryPct: round(recoveryPct, 1),
    fromDumpClosePct: round(pctChange(price, dump.close)),
    latestClosedPricePct: latestPricePct,
    recentTrendPct,
    pullbackFromRecoveryHighPct,
    lift,
    idealEntry,
    live: live ? {
      openTime: live.openTime,
      pricePct: round(pctChange(live.close, live.open)),
      projectedVolumeRatio: round(liveProjectedVolumeRatio),
      progressPct: round(liveProgressPct, 1),
    } : null,
    confirmationPrice: round(dump.open, 10),
    invalidationPrice: round(dump.low, 10),
    observeOnly: true,
  };
  candidate.moveStage = classifyPostDumpRecoveryStage(candidate);
  candidate.score = scoreCandidate(candidate, config);
  return candidate.score >= config.minScore ? candidate : null;
}

export function evaluatePostDumpVolumeRecovery(symbol, rawKlines, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const now = number(options.now, Date.now());
  const normalized = (Array.isArray(rawKlines) ? rawKlines : [])
    .map(normalizeCandle)
    .filter(Boolean)
    .sort((a, b) => a.openTime - b.openTime);
  const closed = normalized.filter((candle) => candle.closeTime <= now);
  const live = normalized.findLast((candle) => candle.closeTime > now) ?? null;
  if (closed.length < config.minBars) {
    return { candidate: null, reason: 'INSUFFICIENT_BARS', closedBars: closed.length };
  }

  const firstIndex = Math.max(config.baselineBars, closed.length - config.lookbackBars);
  const candidates = [];
  for (let index = firstIndex; index <= closed.length - 2; index += 1) {
    const candidate = buildCandidate({ symbol, closed, live, dumpIndex: index, config, now });
    if (candidate) candidates.push(candidate);
  }
  candidates.sort((a, b) => (
    b.score - a.score
    || b.dumpAt - a.dumpAt
  ));
  return {
    candidate: candidates[0] ?? null,
    reason: candidates.length ? 'MATCH' : 'NO_ACTIVE_RECOVERY',
    closedBars: closed.length,
  };
}

export function buildPostDumpVolumeRecoverySnapshot(options = {}) {
  const startedAt = Date.now();
  const symbols = Array.isArray(options.symbols) ? options.symbols : [];
  const getKlines = typeof options.getKlines === 'function' ? options.getKlines : () => [];
  const now = number(options.now, Date.now());
  const frames = POST_DUMP_TIMEFRAME_CONFIGS.map((config) => ({
    config,
    items: [],
    excluded: { insufficientBars: 0, noActiveRecovery: 0 },
  }));

  for (const symbol of symbols) {
    const source15m = getKlines(symbol);
    for (const frame of frames) {
      const klines = aggregateKlinesFrom15m(source15m, frame.config.interval, { now });
      const result = evaluatePostDumpVolumeRecovery(symbol, klines, { ...frame.config, now });
      if (result.candidate) frame.items.push(result.candidate);
      else if (result.reason === 'INSUFFICIENT_BARS') frame.excluded.insufficientBars += 1;
      else frame.excluded.noActiveRecovery += 1;
    }
  }

  const statusRank = { CONFIRMED: 0, BUILDING: 1, WEAKENED: 2 };
  const timeframes = frames.map((frame) => {
    frame.items.sort((a, b) => (
      (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9)
      || b.score - a.score
      || b.dumpAt - a.dumpAt
    ));
    const stats = {
      scanned: symbols.length,
      matched: frame.items.length,
      confirmed: frame.items.filter((item) => item.status === 'CONFIRMED').length,
      building: frame.items.filter((item) => item.status === 'BUILDING').length,
      weakened: frame.items.filter((item) => item.status === 'WEAKENED').length,
      excluded: frame.excluded,
    };
    return {
      interval: frame.config.interval,
      label: frame.config.label,
      source: frame.config.interval === '15m' ? 'KLINE_CACHE_15M' : 'AGGREGATED_FROM_CLOSED_15M',
      config: {
        lookbackBars: frame.config.lookbackBars,
        baselineBars: frame.config.baselineBars,
        minDumpBodyPct: frame.config.minDumpBodyPct,
        minDumpLowPct: frame.config.minDumpLowPct,
        minDumpVolumeRatio: frame.config.minDumpVolumeRatio,
        minRecoveryPct: frame.config.minRecoveryPct,
        confirmedRecoveryPct: frame.config.confirmedRecoveryPct,
        minScore: frame.config.minScore,
      },
      stats,
      items: frame.items,
    };
  });
  const firstFrame = timeframes[0];
  const allItems = timeframes.flatMap((frame) => frame.items);
  const uniqueSymbols = new Set(allItems.map((item) => item.symbol)).size;

  return {
    version: POST_DUMP_VOLUME_RECOVERY_VERSION,
    generatedAt: now,
    interval: DEFAULTS.interval,
    observeOnly: true,
    execution: {
      binanceEnabled: false,
      affectsEntry: false,
      affectsSize: false,
      affectsStopLoss: false,
      affectsTakeProfit: false,
    },
    config: firstFrame.config,
    stats: {
      ...firstFrame.stats,
      elapsedMs: Date.now() - startedAt,
    },
    items: firstFrame.items,
    summary: {
      totalCases: allItems.length,
      uniqueSymbols,
      confirmed: allItems.filter((item) => item.status === 'CONFIRMED').length,
      building: allItems.filter((item) => item.status === 'BUILDING').length,
      weakened: allItems.filter((item) => item.status === 'WEAKENED').length,
      byTimeframe: Object.fromEntries(timeframes.map((frame) => [frame.interval, frame.stats.matched])),
    },
    timeframes,
  };
}
