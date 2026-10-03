export const COIN_LEVEL_ANALYSIS_VERSION = 'COIN_LEVEL_ANALYSIS_V11_ORDER_BOOK_SIDE_TOTALS_20261002';
export const BINANCE_ORDER_BOOK_RANGE_PROFILE_VERSION =
  'BINANCE_ORDER_BOOK_RANGE_PROFILE_V2_SIDE_TOTALS_20261002';
export const COIN_LEVEL_DATA_FRESHNESS_VERSION = 'COIN_LEVEL_DATA_FRESHNESS_V1_20260901';
export const COIN_LEVEL_COINGLASS_VERSION = 'COIN_LEVEL_COINGLASS_V3_REJECTED_REVERSE_PRESSURE_20260901';
export const COIN_LEVEL_SECOND_REJECTION_VERSION = 'COIN_LEVEL_SECOND_REJECTION_V2_TWO_SIDED_15M_COINGLASS_20260901';

export const COIN_LEVEL_COINGLASS_LIFECYCLE_WEIGHTS = Object.freeze({
  FRESH: 1,
  APPROACHING: 1,
  ACCEPTED: 0.7,
  SWEPT: 0.25,
  REJECTED: 0,
  UNTRACKED: 1,
});
const COIN_LEVEL_COINGLASS_REJECTED_REVERSE_WEIGHT = 0.7;

const FRAME_WEIGHTS = Object.freeze({
  '5m': 1,
  '15m': 1.45,
  '1h': 2,
  '4h': 2.55,
});

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 8) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function percentDistance(price, anchor) {
  return Number.isFinite(price) && Number.isFinite(anchor) && anchor > 0
    ? ((price / anchor) - 1) * 100
    : null;
}

function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const alpha = 2 / (period + 1);
  let value = values[0];
  for (let index = 1; index < values.length; index += 1) {
    value = (values[index] * alpha) + (value * (1 - alpha));
  }
  return value;
}

function atr(rows, period = 14) {
  if (!Array.isArray(rows) || rows.length < period + 1) return null;
  const trueRanges = rows.map((row, index) => {
    if (index === 0) return row.high - row.low;
    const previousClose = rows[index - 1].close;
    return Math.max(
      row.high - row.low,
      Math.abs(row.high - previousClose),
      Math.abs(row.low - previousClose),
    );
  });
  return trueRanges.slice(-period).reduce((sum, value) => sum + value, 0) / period;
}

function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizeKline(row) {
  return {
    openTime: finite(row?.openTime ?? row?.[0]),
    open: finite(row?.open ?? row?.[1]),
    high: finite(row?.high ?? row?.[2]),
    low: finite(row?.low ?? row?.[3]),
    close: finite(row?.close ?? row?.[4]),
    volume: finite(row?.volume ?? row?.[5], 0),
    closeTime: finite(row?.closeTime ?? row?.[6]),
    quoteVolume: finite(row?.quoteVolume ?? row?.[7], 0),
    takerBuyQuoteVolume: finite(row?.takerBuyQuoteVolume ?? row?.[10], 0),
  };
}

function validKline(row) {
  return [row.open, row.high, row.low, row.close].every((value) => Number.isFinite(value) && value > 0);
}

export function detectSecondRejectionShort15m(rows, now = Date.now()) {
  const normalized = (Array.isArray(rows) ? rows : []).map(normalizeKline).filter(validKline);
  const closed = normalized.filter((row) => !(row.closeTime > now));
  const source = closed.length >= 30 ? closed : normalized.slice(0, -1);
  const empty = {
    version: COIN_LEVEL_SECOND_REJECTION_VERSION,
    detected: false,
    confirmed: false,
    state: 'NONE',
    reason: 'NO_RECENT_SECOND_REJECTION',
  };
  if (source.length < 30) return { ...empty, reason: 'INSUFFICIENT_15M_CANDLES' };
  const atr15 = atr(source, 14);
  const ema13 = ema(source.map((row) => row.close), 13);
  if (!(atr15 > 0) || !(ema13 > 0)) return { ...empty, reason: 'ATR_OR_EMA_UNAVAILABLE' };

  const candleMetrics = (index, requireFuturePeak = false) => {
    const candle = source[index];
    const range = candle.high - candle.low;
    if (!(range > 0)) return null;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const upperWickRangeRatio = upperWick / range;
    const closeLocationRatio = (candle.close - candle.low) / range;
    const previousHighs = source.slice(Math.max(0, index - 2), index).map((row) => row.high);
    const nextHighs = source.slice(index + 1, index + 3).map((row) => row.high);
    const localPeak = previousHighs.length > 0
      && candle.high >= Math.max(...previousHighs)
      && (!requireFuturePeak || !nextHighs.length || candle.high >= Math.max(...nextHighs));
    const priorVolume = median(source.slice(Math.max(0, index - 20), index)
      .map((row) => row.quoteVolume)
      .filter((value) => value > 0));
    const volumeRatio = priorVolume > 0 && candle.quoteVolume > 0 ? candle.quoteVolume / priorVolume : null;
    const takerBuyPct = candle.quoteVolume > 0
      ? (candle.takerBuyQuoteVolume / candle.quoteVolume) * 100
      : null;
    const rejectShape = localPeak
      && range >= atr15 * 0.55
      && upperWickRangeRatio >= 0.18
      && closeLocationRatio <= 0.72;
    return {
      index,
      candle,
      rejectShape,
      upperWickRangeRatio,
      closeLocationRatio,
      volumeRatio,
      takerBuyPct,
    };
  };

  const secondCandidates = [];
  for (let index = Math.max(2, source.length - 3); index < source.length; index += 1) {
    const metrics = candleMetrics(index, false);
    if (metrics?.rejectShape) secondCandidates.push(metrics);
  }
  for (const second of secondCandidates.reverse()) {
    const firstStart = Math.max(2, second.index - 24);
    for (let index = second.index - 3; index >= firstStart; index -= 1) {
      const first = candleMetrics(index, true);
      if (!first?.rejectShape) continue;
      const highDistancePct = Math.abs(second.candle.high / first.candle.high - 1) * 100;
      const highTolerancePct = Math.max(
        0.6,
        Math.min(1.8, (atr15 / second.candle.high) * 100 * 0.9),
      );
      if (highDistancePct > highTolerancePct) continue;
      const between = source.slice(first.index + 1, second.index);
      const pullbackLow = Math.min(...between.map((row) => row.low));
      const pullbackAtr = (Math.min(first.candle.high, second.candle.high) - pullbackLow) / atr15;
      if (!(pullbackAtr >= 0.6)) continue;
      const confirmationCandidates = [];
      for (let confirmationIndex = second.index;
        confirmationIndex < Math.min(source.length, second.index + 3);
        confirmationIndex += 1) {
        const metrics = candleMetrics(confirmationIndex, false);
        if (metrics) confirmationCandidates.push(metrics);
      }
      const confirmation = confirmationCandidates.find((metrics) => (
        metrics.candle.close < metrics.candle.open
        && metrics.candle.close < source[Math.max(0, metrics.index - 1)].close
        && metrics.candle.close < ema13
        && (metrics.takerBuyPct == null || metrics.takerBuyPct <= 50.5)
        && (metrics.volumeRatio == null || metrics.volumeRatio >= 0.8)
      )) ?? confirmationCandidates.at(-1) ?? second;
      const bearishClose = confirmation.candle.close < confirmation.candle.open
        && confirmation.candle.close < source[Math.max(0, confirmation.index - 1)].close;
      const closeBelowEma13 = confirmation.candle.close < ema13;
      const takerSellConfirmed = confirmation.takerBuyPct == null || confirmation.takerBuyPct <= 50.5;
      const volumeConfirmed = confirmation.volumeRatio == null || confirmation.volumeRatio >= 0.8;
      const confirmed = bearishClose && closeBelowEma13 && takerSellConfirmed && volumeConfirmed;
      const resistanceHigh = Math.max(first.candle.high, second.candle.high);
      return {
        version: COIN_LEVEL_SECOND_REJECTION_VERSION,
        detected: true,
        confirmed,
        state: confirmed ? 'WAIT_COINGLASS_ALIGNMENT' : 'WATCH',
        reason: confirmed ? 'SECOND_15M_REJECTION_CONFIRMED' : 'SECOND_REJECTION_LACKS_SELL_CONFIRMATION',
        firstReject: {
          openTime: first.candle.openTime,
          high: round(first.candle.high),
          close: round(first.candle.close),
          upperWickRangeRatio: round(first.upperWickRangeRatio, 3),
        },
        secondReject: {
          openTime: second.candle.openTime,
          high: round(second.candle.high),
          close: round(second.candle.close),
          upperWickRangeRatio: round(second.upperWickRangeRatio, 3),
          volumeRatio: round(second.volumeRatio, 2),
          takerBuyPct: round(second.takerBuyPct, 1),
        },
        confirmationCandle: {
          openTime: confirmation.candle.openTime,
          close: round(confirmation.candle.close),
          barsAfterSecondReject: confirmation.index - second.index,
          volumeRatio: round(confirmation.volumeRatio, 2),
          takerBuyPct: round(confirmation.takerBuyPct, 1),
        },
        separationBars: second.index - first.index,
        highDistancePct: round(highDistancePct, 2),
        highTolerancePct: round(highTolerancePct, 2),
        pullbackAtr: round(pullbackAtr, 2),
        ema13: round(ema13),
        atr15: round(atr15),
        resistanceHigh: round(resistanceHigh),
        invalidationPrice: round(resistanceHigh + atr15 * 0.25),
        confirmations: {
          bearishClose,
          closeBelowEma13,
          takerSellConfirmed,
          volumeConfirmed,
        },
      };
    }
  }
  return empty;
}

export function detectSecondRejectionLong15m(rows, now = Date.now()) {
  const normalized = (Array.isArray(rows) ? rows : []).map(normalizeKline).filter(validKline);
  const closed = normalized.filter((row) => !(row.closeTime > now));
  const source = closed.length >= 30 ? closed : normalized.slice(0, -1);
  const empty = {
    version: COIN_LEVEL_SECOND_REJECTION_VERSION,
    detected: false,
    confirmed: false,
    state: 'NONE',
    reason: 'NO_RECENT_SECOND_SUPPORT_REJECTION',
  };
  if (source.length < 30) return { ...empty, reason: 'INSUFFICIENT_15M_CANDLES' };
  const atr15 = atr(source, 14);
  const ema13 = ema(source.map((row) => row.close), 13);
  if (!(atr15 > 0) || !(ema13 > 0)) return { ...empty, reason: 'ATR_OR_EMA_UNAVAILABLE' };

  const candleMetrics = (index, requireFutureTrough = false) => {
    const candle = source[index];
    const range = candle.high - candle.low;
    if (!(range > 0)) return null;
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const lowerWickRangeRatio = lowerWick / range;
    const closeLocationRatio = (candle.close - candle.low) / range;
    const previousLows = source.slice(Math.max(0, index - 2), index).map((row) => row.low);
    const nextLows = source.slice(index + 1, index + 3).map((row) => row.low);
    const localTrough = previousLows.length > 0
      && candle.low <= Math.min(...previousLows)
      && (!requireFutureTrough || !nextLows.length || candle.low <= Math.min(...nextLows));
    const priorVolume = median(source.slice(Math.max(0, index - 20), index)
      .map((row) => row.quoteVolume)
      .filter((value) => value > 0));
    const volumeRatio = priorVolume > 0 && candle.quoteVolume > 0 ? candle.quoteVolume / priorVolume : null;
    const takerBuyPct = candle.quoteVolume > 0
      ? (candle.takerBuyQuoteVolume / candle.quoteVolume) * 100
      : null;
    const rejectShape = localTrough
      && range >= atr15 * 0.55
      && lowerWickRangeRatio >= 0.18
      && closeLocationRatio >= 0.28;
    return {
      index,
      candle,
      rejectShape,
      lowerWickRangeRatio,
      closeLocationRatio,
      volumeRatio,
      takerBuyPct,
    };
  };

  const secondCandidates = [];
  for (let index = Math.max(2, source.length - 3); index < source.length; index += 1) {
    const metrics = candleMetrics(index, false);
    if (metrics?.rejectShape) secondCandidates.push(metrics);
  }
  for (const second of secondCandidates.reverse()) {
    const firstStart = Math.max(2, second.index - 24);
    for (let index = second.index - 3; index >= firstStart; index -= 1) {
      const first = candleMetrics(index, true);
      if (!first?.rejectShape) continue;
      const lowDistancePct = Math.abs(second.candle.low / first.candle.low - 1) * 100;
      const lowTolerancePct = Math.max(
        0.6,
        Math.min(1.8, (atr15 / second.candle.low) * 100 * 0.9),
      );
      if (lowDistancePct > lowTolerancePct) continue;
      const between = source.slice(first.index + 1, second.index);
      const bounceHigh = Math.max(...between.map((row) => row.high));
      const bounceAtr = (bounceHigh - Math.max(first.candle.low, second.candle.low)) / atr15;
      if (!(bounceAtr >= 0.6)) continue;
      const confirmationCandidates = [];
      for (let confirmationIndex = second.index;
        confirmationIndex < Math.min(source.length, second.index + 3);
        confirmationIndex += 1) {
        const metrics = candleMetrics(confirmationIndex, false);
        if (metrics) confirmationCandidates.push(metrics);
      }
      const confirmation = confirmationCandidates.find((metrics) => (
        metrics.candle.close > metrics.candle.open
        && metrics.candle.close > source[Math.max(0, metrics.index - 1)].close
        && metrics.candle.close > ema13
        && (metrics.takerBuyPct == null || metrics.takerBuyPct >= 49.5)
        && (metrics.volumeRatio == null || metrics.volumeRatio >= 0.8)
      )) ?? confirmationCandidates.at(-1) ?? second;
      const bullishClose = confirmation.candle.close > confirmation.candle.open
        && confirmation.candle.close > source[Math.max(0, confirmation.index - 1)].close;
      const closeAboveEma13 = confirmation.candle.close > ema13;
      const takerBuyConfirmed = confirmation.takerBuyPct == null || confirmation.takerBuyPct >= 49.5;
      const volumeConfirmed = confirmation.volumeRatio == null || confirmation.volumeRatio >= 0.8;
      const confirmed = bullishClose && closeAboveEma13 && takerBuyConfirmed && volumeConfirmed;
      const supportLow = Math.min(first.candle.low, second.candle.low);
      return {
        version: COIN_LEVEL_SECOND_REJECTION_VERSION,
        detected: true,
        confirmed,
        state: confirmed ? 'WAIT_COINGLASS_ALIGNMENT' : 'WATCH',
        reason: confirmed ? 'SECOND_15M_SUPPORT_REJECTION_CONFIRMED' : 'SECOND_SUPPORT_REJECTION_LACKS_BUY_CONFIRMATION',
        firstReject: {
          openTime: first.candle.openTime,
          low: round(first.candle.low),
          close: round(first.candle.close),
          lowerWickRangeRatio: round(first.lowerWickRangeRatio, 3),
        },
        secondReject: {
          openTime: second.candle.openTime,
          low: round(second.candle.low),
          close: round(second.candle.close),
          lowerWickRangeRatio: round(second.lowerWickRangeRatio, 3),
          volumeRatio: round(second.volumeRatio, 2),
          takerBuyPct: round(second.takerBuyPct, 1),
        },
        confirmationCandle: {
          openTime: confirmation.candle.openTime,
          close: round(confirmation.candle.close),
          barsAfterSecondReject: confirmation.index - second.index,
          volumeRatio: round(confirmation.volumeRatio, 2),
          takerBuyPct: round(confirmation.takerBuyPct, 1),
        },
        separationBars: second.index - first.index,
        lowDistancePct: round(lowDistancePct, 2),
        lowTolerancePct: round(lowTolerancePct, 2),
        bounceAtr: round(bounceAtr, 2),
        ema13: round(ema13),
        atr15: round(atr15),
        supportLow: round(supportLow),
        invalidationPrice: round(supportLow - atr15 * 0.25),
        confirmations: {
          bullishClose,
          closeAboveEma13,
          takerBuyConfirmed,
          volumeConfirmed,
        },
      };
    }
  }
  return empty;
}

function frameAnalysis(rows, interval, now) {
  const normalized = (Array.isArray(rows) ? rows : []).map(normalizeKline).filter(validKline);
  const closed = normalized.filter((row) => !(row.closeTime > now));
  const source = closed.length >= 100 ? closed : normalized.slice(0, -1);
  if (source.length < 30) throw new Error(`Khong du nen ${interval} de phan tich.`);

  const closes = source.map((row) => row.close);
  const lastClosed = source.at(-1);
  const previousClosed = source.at(-2) ?? lastClosed;
  const live = normalized.at(-1) ?? lastClosed;
  const ema13 = ema(closes, 13);
  const ema25 = ema(closes, 25);
  const ema99 = ema(closes, 99);
  const atr14 = atr(source, 14);
  let trendScore = 0;
  if (Number.isFinite(ema13)) trendScore += lastClosed.close >= ema13 ? 1 : -1;
  if (Number.isFinite(ema25)) trendScore += lastClosed.close >= ema25 ? 1 : -1;
  if (Number.isFinite(ema99)) trendScore += lastClosed.close >= ema99 ? 1 : -1;
  if (Number.isFinite(ema13) && Number.isFinite(ema25)) trendScore += ema13 >= ema25 ? 0.75 : -0.75;
  if (lastClosed.close !== previousClosed.close) trendScore += lastClosed.close > previousClosed.close ? 0.5 : -0.5;

  const recent = source.slice(-Math.min(source.length, interval === '5m' ? 96 : interval === '15m' ? 80 : 60));
  return {
    interval,
    source,
    recent,
    live,
    lastClosed,
    previousClosed,
    ema13,
    ema25,
    ema99,
    atr14,
    trendScore,
    rangeHigh: Math.max(...recent.map((row) => row.high)),
    rangeLow: Math.min(...recent.map((row) => row.low)),
  };
}

function swingCandidates(frame) {
  const candidates = [];
  const rows = frame.recent;
  const weight = FRAME_WEIGHTS[frame.interval] ?? 1;
  for (let index = 2; index < rows.length - 2; index += 1) {
    const row = rows[index];
    const isSwingHigh = row.high > rows[index - 1].high
      && row.high > rows[index - 2].high
      && row.high >= rows[index + 1].high
      && row.high >= rows[index + 2].high;
    const isSwingLow = row.low < rows[index - 1].low
      && row.low < rows[index - 2].low
      && row.low <= rows[index + 1].low
      && row.low <= rows[index + 2].low;
    const recency = 0.65 + (0.35 * (index / Math.max(1, rows.length - 1)));
    if (isSwingHigh) candidates.push({ price: row.high, weight: weight * recency, source: `${frame.interval} SWING HIGH` });
    if (isSwingLow) candidates.push({ price: row.low, weight: weight * recency, source: `${frame.interval} SWING LOW` });
  }
  for (const [name, price, emaWeight] of [
    ['EMA13', frame.ema13, 0.65],
    ['EMA25', frame.ema25, 0.8],
    ['EMA99', frame.ema99, 1.15],
  ]) {
    if (Number.isFinite(price)) candidates.push({ price, weight: weight * emaWeight, source: `${frame.interval} ${name}` });
  }
  candidates.push({ price: frame.rangeHigh, weight: weight * 1.15, source: `${frame.interval} RANGE HIGH` });
  candidates.push({ price: frame.rangeLow, weight: weight * 1.15, source: `${frame.interval} RANGE LOW` });
  return candidates;
}

function depthCandidates(depth, markPrice) {
  const output = [];
  for (const [side, rows] of [['BID', depth?.bids], ['ASK', depth?.asks]]) {
    const bins = new Map();
    for (const raw of Array.isArray(rows) ? rows : []) {
      const price = finite(raw?.[0]);
      const quantity = finite(raw?.[1]);
      if (!(price > 0) || !(quantity > 0)) continue;
      const distancePct = percentDistance(price, markPrice);
      if (!Number.isFinite(distancePct) || Math.abs(distancePct) > 12) continue;
      if ((side === 'BID' && distancePct >= 0) || (side === 'ASK' && distancePct <= 0)) continue;
      const bucket = Math.floor(Math.abs(distancePct) / 0.5) * 0.5;
      const current = bins.get(bucket) ?? { notional: 0, weightedPrice: 0 };
      const notional = price * quantity;
      current.notional += notional;
      current.weightedPrice += price * notional;
      bins.set(bucket, current);
    }
    const ranked = [...bins.values()].sort((left, right) => right.notional - left.notional).slice(0, 4);
    const maximum = ranked[0]?.notional || 1;
    for (const bin of ranked) {
      output.push({
        price: bin.weightedPrice / bin.notional,
        weight: 0.65 + (0.85 * (bin.notional / maximum)),
        source: `ORDERBOOK ${side}`,
        notional: bin.notional,
      });
    }
  }
  return output;
}

function orderBookSideRows(rows, side, markPrice) {
  return (Array.isArray(rows) ? rows : []).flatMap((raw) => {
    const price = finite(raw?.[0]);
    const quantity = finite(raw?.[1]);
    if (!(price > 0) || !(quantity > 0)) return [];
    const signedDistancePct = percentDistance(price, markPrice);
    if (!Number.isFinite(signedDistancePct)) return [];
    if ((side === 'BID' && signedDistancePct >= 0) || (side === 'ASK' && signedDistancePct <= 0)) return [];
    return [{ price, quantity, notional: price * quantity, distancePct: Math.abs(signedDistancePct) }];
  });
}

function inOrderBookBand(row, minDistancePct, maxDistancePct) {
  return minDistancePct === 0
    ? row.distancePct >= 0 && row.distancePct <= maxDistancePct
    : row.distancePct > minDistancePct && row.distancePct <= maxDistancePct;
}

function orderBookBandTotals(rows, minDistancePct, maxDistancePct) {
  const selected = rows.filter((row) => inOrderBookBand(row, minDistancePct, maxDistancePct));
  return {
    notional: round(selected.reduce((sum, row) => sum + row.notional, 0), 2),
    levelCount: selected.length,
  };
}

function orderBookBandZones(rows, side, { layer, minDistancePct, maxDistancePct, bucketPct, limit }) {
  const buckets = new Map();
  for (const row of rows) {
    if (!inOrderBookBand(row, minDistancePct, maxDistancePct)) continue;
    const bucket = Math.floor(Math.max(0, row.distancePct - minDistancePct - Number.EPSILON) / bucketPct);
    const current = buckets.get(bucket) ?? {
      notional: 0, weightedPrice: 0, minPrice: Infinity, maxPrice: -Infinity,
      minDistancePct: Infinity, maxDistancePct: -Infinity, levelCount: 0,
    };
    current.notional += row.notional;
    current.weightedPrice += row.price * row.notional;
    current.minPrice = Math.min(current.minPrice, row.price);
    current.maxPrice = Math.max(current.maxPrice, row.price);
    current.minDistancePct = Math.min(current.minDistancePct, row.distancePct);
    current.maxDistancePct = Math.max(current.maxDistancePct, row.distancePct);
    current.levelCount += 1;
    buckets.set(bucket, current);
  }
  return [...buckets.values()]
    .sort((left, right) => right.notional - left.notional)
    .slice(0, limit)
    .map((bucket) => ({
      layer,
      side,
      low: round(bucket.minPrice),
      high: round(bucket.maxPrice),
      mid: round(bucket.weightedPrice / bucket.notional),
      distancePct: round(((bucket.minDistancePct + bucket.maxDistancePct) / 2) * (side === 'BID' ? -1 : 1), 3),
      distancePctLow: round(bucket.minDistancePct, 3),
      distancePctHigh: round(bucket.maxDistancePct, 3),
      orderBookNotional: round(bucket.notional, 2),
      levelCount: bucket.levelCount,
      source: 'BINANCE_FUTURES_DEPTH',
    }));
}

export function buildOrderBookRangeProfile(depth, markPrice, { requestedLimit = 1000 } = {}) {
  const bidRows = orderBookSideRows(depth?.bids, 'BID', markPrice);
  const askRows = orderBookSideRows(depth?.asks, 'ASK', markPrice);
  const coverage = (rows) => ({
    levelCount: rows.length,
    farthestDistancePct: round(Math.max(0, ...rows.map((row) => row.distancePct)), 3),
    reachesNearEdge: rows.some((row) => row.distancePct >= 3),
    reachesWideEdge: rows.some((row) => row.distancePct >= 20),
  });
  const band = (layer, minDistancePct, maxDistancePct, bucketPct, limit) => {
    const bidTotals = orderBookBandTotals(bidRows, minDistancePct, maxDistancePct);
    const askTotals = orderBookBandTotals(askRows, minDistancePct, maxDistancePct);
    return {
      minDistancePct,
      maxDistancePct,
      bucketPct,
      totals: {
        bidNotional: bidTotals.notional,
        askNotional: askTotals.notional,
        bidLevelCount: bidTotals.levelCount,
        askLevelCount: askTotals.levelCount,
      },
      bidZones: orderBookBandZones(bidRows, 'BID', { layer, minDistancePct, maxDistancePct, bucketPct, limit }),
      askZones: orderBookBandZones(askRows, 'ASK', { layer, minDistancePct, maxDistancePct, bucketPct, limit }),
    };
  };
  const near = band('NEAR', 0, 3, 0.25, 4);
  const wide = band('WIDE', 3, 20, 1, 6);
  return {
    version: BINANCE_ORDER_BOOK_RANGE_PROFILE_VERSION,
    source: 'BINANCE_FUTURES_DEPTH',
    requestedLimit,
    coverage: { bid: coverage(bidRows), ask: coverage(askRows) },
    totals: {
      bidNotional: round(near.totals.bidNotional + wide.totals.bidNotional, 2),
      askNotional: round(near.totals.askNotional + wide.totals.askNotional, 2),
      bidLevelCount: near.totals.bidLevelCount + wide.totals.bidLevelCount,
      askLevelCount: near.totals.askLevelCount + wide.totals.askLevelCount,
    },
    near,
    wide,
    caveat: '500/1000 level có thể không chạm biên 20%; vùng WIDE rỗng khi depth Binance chưa phủ tới đó.',
  };
}

function clusteredZones(candidates, markPrice, atr5m) {
  const tolerance = Math.max(markPrice * 0.004, (atr5m || 0) * 0.28);
  const halfBand = Math.max(markPrice * 0.0022, (atr5m || 0) * 0.12);
  const filtered = candidates
    .filter((item) => Number.isFinite(item.price) && item.price > markPrice * 0.55 && item.price < markPrice * 1.6)
    .sort((left, right) => left.price - right.price);
  const clusters = [];
  for (const candidate of filtered) {
    const previous = clusters.at(-1);
    if (!previous || candidate.price - previous.maxPrice > tolerance) {
      clusters.push({ items: [candidate], minPrice: candidate.price, maxPrice: candidate.price });
    } else {
      previous.items.push(candidate);
      previous.minPrice = Math.min(previous.minPrice, candidate.price);
      previous.maxPrice = Math.max(previous.maxPrice, candidate.price);
    }
  }
  return clusters.map((cluster) => {
    const totalWeight = cluster.items.reduce((sum, item) => sum + item.weight, 0);
    const mid = cluster.items.reduce((sum, item) => sum + (item.price * item.weight), 0) / totalWeight;
    const sources = [...new Set(cluster.items.map((item) => item.source))];
    const score = totalWeight + Math.min(2.5, sources.length * 0.35);
    return {
      low: round(Math.min(cluster.minPrice, mid - halfBand)),
      high: round(Math.max(cluster.maxPrice, mid + halfBand)),
      mid: round(mid),
      score: round(score, 2),
      confidence: score >= 7 ? 'HIGH' : score >= 4 ? 'MEDIUM' : 'LOW',
      sources,
      orderBookNotional: round(cluster.items.reduce((sum, item) => sum + (item.notional || 0), 0), 2),
      distancePct: round(percentDistance(mid, markPrice), 2),
    };
  });
}

function candleSummary(frame) {
  const candle = frame.live;
  const range = Math.max(candle.high - candle.low, Number.EPSILON);
  const body = candle.close - candle.open;
  const buyShare = candle.quoteVolume > 0 ? (candle.takerBuyQuoteVolume / candle.quoteVolume) * 100 : null;
  return {
    interval: frame.interval,
    open: round(candle.open),
    high: round(candle.high),
    low: round(candle.low),
    close: round(candle.close),
    changePct: round(percentDistance(candle.close, candle.open), 2),
    bodyPctOfRange: round((Math.abs(body) / range) * 100, 1),
    upperWickPctOfRange: round(((candle.high - Math.max(candle.open, candle.close)) / range) * 100, 1),
    lowerWickPctOfRange: round(((Math.min(candle.open, candle.close) - candle.low) / range) * 100, 1),
    takerBuyPct: round(buyShare, 1),
    direction: body > 0 ? 'GREEN' : body < 0 ? 'RED' : 'DOJI',
  };
}

function buildRecommendation({ markPrice, supports, resistances, frames, market }) {
  const support = supports[0] ?? null;
  const resistance = resistances[0] ?? null;
  const atr5m = frames['5m'].atr14 || markPrice * 0.01;
  const atrPct = (atr5m / markPrice) * 100;
  const score = Object.values(frames).reduce(
    (sum, frame) => sum + (frame.trendScore * (FRAME_WEIGHTS[frame.interval] ?? 1)),
    0,
  );
  const bias = score >= 6 ? 'BULLISH' : score <= -6 ? 'BEARISH' : 'NEUTRAL';
  const supportGap = support ? Math.max(0, markPrice - support.high) : Infinity;
  const resistanceGap = resistance ? Math.max(0, resistance.low - markPrice) : Infinity;
  const proximity = Math.max(markPrice * 0.008, atr5m * 0.7);
  const nearSupport = supportGap <= proximity;
  const nearResistance = resistanceGap <= proximity;
  const last5m = frames['5m'].lastClosed;
  const previous5m = frames['5m'].previousClosed;
  const last15m = frames['15m'].lastClosed;
  const breakdownEarly5m = Boolean(support && last5m.close < support.low && previous5m.close >= support.low);
  const breakoutEarly5m = Boolean(resistance && last5m.close > resistance.high && previous5m.close <= resistance.high);
  const breakdownConfirmed15m = Boolean(support && last15m.close < support.low);
  const breakoutConfirmed15m = Boolean(resistance && last15m.close > resistance.high);

  let stance = 'WAIT_MIDDLE';
  let headline = 'Đang ở giữa hai vùng — chưa có lợi thế rõ.';
  if (nearSupport) {
    stance = breakdownConfirmed15m
      ? 'BEARISH_BREAKDOWN_15M_CONFIRMED'
      : breakdownEarly5m ? 'EARLY_5M_BREAKDOWN_WAIT_15M' : 'WAIT_SUPPORT_CONFIRMATION';
    headline = breakdownConfirmed15m
      ? '15m đã đóng dưới hỗ trợ — chờ retest 5m thất bại trước khi ưu tiên SHORT.'
      : breakdownEarly5m
        ? '5m vừa phá hỗ trợ nhưng 15m chưa xác nhận — chưa đuổi SHORT.'
      : 'Đang sát hỗ trợ — không đuổi SHORT, chờ giữ vùng hoặc phá vùng.';
  } else if (nearResistance) {
    stance = breakoutConfirmed15m
      ? 'BULLISH_BREAKOUT_15M_CONFIRMED'
      : breakoutEarly5m ? 'EARLY_5M_BREAKOUT_WAIT_15M' : 'WAIT_RESISTANCE_CONFIRMATION';
    headline = breakoutConfirmed15m
      ? '15m đã đóng trên kháng cự — chờ retest 5m giữ được trước khi ưu tiên LONG.'
      : breakoutEarly5m
        ? '5m vừa phá kháng cự nhưng 15m chưa xác nhận — chưa đuổi LONG.'
      : 'Đang sát kháng cự — chờ reject để SHORT hoặc breakout để LONG.';
  } else if (bias === 'BEARISH') {
    stance = 'BEARISH_WAIT_RETEST';
    headline = 'Xu hướng giảm, nhưng chỉ ưu tiên SHORT sau nhịp hồi/retest.';
  } else if (bias === 'BULLISH') {
    stance = 'BULLISH_WAIT_RETEST';
    headline = 'Xu hướng tăng, nhưng chỉ ưu tiên LONG sau nhịp retest giữ được.';
  }

  const supportBelow = supports[1] ?? null;
  const resistanceAbove = resistances[1] ?? null;
  const longAnchor = support ?? { low: markPrice - atr5m, high: markPrice, mid: markPrice - (atr5m / 2) };
  const shortAnchor = resistance ?? { low: markPrice, high: markPrice + atr5m, mid: markPrice + (atr5m / 2) };
  const invalidationBuffer = Math.max(atr5m * 0.35, (frames['15m'].atr14 || atr5m) * 0.18);
  const longTargets = [resistance, resistanceAbove].filter(Boolean).map((zone) => zone.mid);
  const shortTargets = [support, supportBelow].filter(Boolean).map((zone) => zone.mid);
  const warnings = [
    'Xác nhận hướng bằng nến 15m đã đóng; nến 5m chỉ dùng để theo dõi sớm và retest.',
    'Order book chỉ là dữ liệu tham khảo vì lệnh chờ có thể bị rút.',
  ];
  if (atrPct >= 2.5 || finite(market.range24hPct, 0) >= 25) {
    warnings.unshift('Biến động rất cao: phải đợi nến đóng xác nhận, không dùng râu nến làm breakout.');
  }

  return {
    observeOnly: true,
    bias,
    trendScore: round(score, 2),
    stance,
    headline,
    context: nearSupport ? 'AT_SUPPORT' : nearResistance ? 'AT_RESISTANCE' : 'BETWEEN_ZONES',
    confirmation: {
      requiredInterval: '15m',
      retestInterval: '5m',
      breakout: breakoutConfirmed15m ? 'CONFIRMED_15M' : breakoutEarly5m ? 'EARLY_5M_ONLY' : 'WAITING',
      breakdown: breakdownConfirmed15m ? 'CONFIRMED_15M' : breakdownEarly5m ? 'EARLY_5M_ONLY' : 'WAITING',
      lastClosed15m: round(last15m.close),
    },
    longPlan: {
      status: bias === 'BEARISH' && !nearSupport ? 'LOW_PRIORITY' : 'CONDITIONAL',
      trigger: `Nến 15m đóng trên ${round(longAnchor.high)}, sau đó retest 5m không thủng vùng hỗ trợ.`,
      entryZone: { low: longAnchor.low, high: longAnchor.high },
      invalidation: round(longAnchor.low - invalidationBuffer),
      targets: longTargets.map((value) => round(value)),
    },
    shortPlan: {
      status: bias === 'BULLISH' && !nearResistance ? 'LOW_PRIORITY' : 'CONDITIONAL',
      trigger: nearSupport
        ? `Nến 15m đóng dưới ${round(longAnchor.low)}, sau đó retest 5m không lấy lại vùng.`
        : `Nến 15m đóng đỏ reject vùng ${round(shortAnchor.low)}–${round(shortAnchor.high)}, rồi retest 5m thất bại.`,
      entryZone: nearSupport
        ? { low: longAnchor.low, high: longAnchor.high }
        : { low: shortAnchor.low, high: shortAnchor.high },
      invalidation: nearSupport
        ? round(longAnchor.high + invalidationBuffer)
        : round(shortAnchor.high + invalidationBuffer),
      targets: shortTargets.map((value) => round(value)),
    },
    warnings,
  };
}

export function buildCoinLevelAnalysis({
  symbol,
  premiumIndex,
  ticker24h,
  openInterest,
  depth,
  depthLimit = 1000,
  klinesByInterval,
  now = Date.now(),
} = {}) {
  const normalizedSymbol = String(symbol ?? '').trim().toUpperCase();
  const markPrice = finite(premiumIndex?.markPrice ?? ticker24h?.lastPrice);
  if (!normalizedSymbol || !(markPrice > 0)) throw new Error('Symbol hoac mark price khong hop le.');

  const frames = Object.fromEntries(['5m', '15m', '1h', '4h'].map((interval) => [
    interval,
    frameAnalysis(klinesByInterval?.[interval], interval, now),
  ]));
  const orderBookProfile = buildOrderBookRangeProfile(depth, markPrice, { requestedLimit: depthLimit });
  const candidates = Object.values(frames).flatMap(swingCandidates);
  candidates.push(...depthCandidates(depth, markPrice));
  const zones = clusteredZones(candidates, markPrice, frames['5m'].atr14);
  const supports = zones.filter((zone) => zone.mid < markPrice).sort((left, right) => right.mid - left.mid).slice(0, 4);
  const resistances = zones.filter((zone) => zone.mid > markPrice).sort((left, right) => left.mid - right.mid).slice(0, 4);
  const high24h = finite(ticker24h?.highPrice);
  const low24h = finite(ticker24h?.lowPrice);
  const market = {
    markPrice: round(markPrice),
    lastPrice: round(finite(ticker24h?.lastPrice, markPrice)),
    indexPrice: round(finite(premiumIndex?.indexPrice)),
    change24hPct: round(finite(ticker24h?.priceChangePercent), 2),
    high24h: round(high24h),
    low24h: round(low24h),
    range24hPct: round(high24h > 0 && low24h > 0 ? ((high24h / low24h) - 1) * 100 : null, 2),
    quoteVolume24h: round(finite(ticker24h?.quoteVolume), 2),
    fundingRatePct: round(finite(premiumIndex?.lastFundingRate, 0) * 100, 4),
    openInterest: round(finite(openInterest?.openInterest), 2),
  };
  const baseRecommendation = buildRecommendation({ markPrice, supports, resistances, frames, market });
  const secondRejectionShort = detectSecondRejectionShort15m(klinesByInterval?.['15m'], now);
  const secondRejectionLong = detectSecondRejectionLong15m(klinesByInterval?.['15m'], now);
  const recommendation = {
    ...baseRecommendation,
    secondRejectionShort: {
      ...secondRejectionShort,
      observeOnly: true,
      ready: false,
      affectsBinance: false,
    },
    secondRejectionLong: {
      ...secondRejectionLong,
      observeOnly: true,
      ready: false,
      affectsBinance: false,
    },
  };

  const generatedAt = new Date(now).toISOString();
  return {
    version: COIN_LEVEL_ANALYSIS_VERSION,
    generatedAt,
    freshness: {
      version: COIN_LEVEL_DATA_FRESHNESS_VERSION,
      binance: 'LIVE',
      stale: false,
      partial: false,
      sourceGeneratedAt: generatedAt,
      checkedAt: generatedAt,
      fallbackReason: null,
    },
    observeOnly: true,
    symbol: normalizedSymbol,
    market,
    trend: {
      bias: recommendation.bias,
      score: recommendation.trendScore,
      frames: Object.values(frames).map((frame) => ({
        interval: frame.interval,
        close: round(frame.lastClosed.close),
        closeTime: frame.lastClosed.closeTime,
        ema13: round(frame.ema13),
        ema25: round(frame.ema25),
        ema99: round(frame.ema99),
        atr14: round(frame.atr14),
        atrPct: round((frame.atr14 / markPrice) * 100, 2),
        score: round(frame.trendScore, 2),
        state: frame.trendScore >= 2 ? 'UP' : frame.trendScore <= -2 ? 'DOWN' : 'MIXED',
      })),
    },
    currentCandles: [candleSummary(frames['5m']), candleSummary(frames['15m'])],
    liqScanCandleContext: {
      '5m': frames['5m'].source.filter(b=>b.closeTime<now).slice(-96),
      '15m': frames['15m'].source.filter(b=>b.closeTime<now).slice(-32),
    },
    zones: { supports, resistances },
    orderBookProfile,
    recommendation,
    execution: {
      binanceEnabled: false,
      affectsEntry: false,
      affectsSize: false,
      affectsStopLoss: false,
      affectsTakeProfit: false,
    },
  };
}

export function markCoinLevelAnalysisStale(analysis, error, now = Date.now()) {
  if (!analysis) return null;
  const rawReason = String(error?.message ?? error ?? 'upstream unavailable').trim();
  const fallbackReason = /abort/i.test(rawReason)
    ? 'Binance REST timeout/aborted'
    : rawReason.slice(0, 240);
  const warning = `Binance live tạm lỗi (${fallbackReason}); đang giữ snapshot gần nhất từ ${analysis.generatedAt ?? 'lần cập nhật trước'}.`;
  const previousWarnings = (analysis.recommendation?.warnings ?? [])
    .filter((item) => !String(item).startsWith('Binance live tạm lỗi ('));
  return {
    ...analysis,
    freshness: {
      ...(analysis.freshness ?? {}),
      version: COIN_LEVEL_DATA_FRESHNESS_VERSION,
      binance: 'STALE_LAST_GOOD',
      stale: true,
      sourceGeneratedAt: analysis.freshness?.sourceGeneratedAt ?? analysis.generatedAt ?? null,
      checkedAt: new Date(now).toISOString(),
      fallbackReason,
    },
    recommendation: {
      ...(analysis.recommendation ?? {}),
      warnings: [...previousWarnings, warning],
    },
  };
}

function coinglassZoneScore(zone) {
  const strength = Math.max(0, finite(zone?.strength, 0));
  const persistence = Math.max(1, finite(zone?.persistenceBars, 1));
  const distance = Math.max(0.5, Math.abs(finite(zone?.distancePct, 99)));
  return (strength * (1 + Math.min(1.5, Math.log10(persistence) / 2))) / Math.sqrt(distance);
}

function coinglassLifecycleWeight(lifecycle) {
  return COIN_LEVEL_COINGLASS_LIFECYCLE_WEIGHTS[String(lifecycle ?? 'UNTRACKED').toUpperCase()] ?? 1;
}

function normalizeCoinglassZones(heatmap, range, markPrice, lifecycleTracks = {}) {
  const lastX = finite(heatmap?.lastHeatmapX, 0);
  const zones = Array.isArray(heatmap?.edgeZones) ? heatmap.edgeZones : [];
  return zones
    .filter((zone) => {
      const price = finite(zone?.price);
      const edgeGap = lastX - finite(zone?.lastX, lastX);
      return price > 0 && edgeGap >= 0 && edgeGap <= 2;
    })
    .map((zone) => {
      const price = finite(zone.price);
      const side = String(zone.side ?? (price >= markPrice ? 'ABOVE' : 'BELOW')).toUpperCase();
      const track = lifecycleTracks?.[side] ?? null;
      const trackMid = finite(track?.zone?.midpoint ?? track?.zone?.price);
      const bandWidth = Math.max(
        Math.abs(finite(zone.bandHigh, price) - finite(zone.bandLow, price)),
        markPrice * 0.005,
      );
      const lifecycleMatches = Number.isFinite(trackMid) && Math.abs(trackMid - price) <= bandWidth;
      const distancePct = percentDistance(price, markPrice);
      const lifecycle = lifecycleMatches ? String(track?.state ?? 'UNTRACKED') : 'UNTRACKED';
      const attractionScore = round(coinglassZoneScore({ ...zone, distancePct }), 2);
      const lifecycleMultiplier = coinglassLifecycleWeight(lifecycle);
      return {
        range,
        side,
        price: round(price),
        bandLow: round(finite(zone.bandLow, price)),
        bandHigh: round(finite(zone.bandHigh, price)),
        distancePct: round(distancePct, 2),
        strength: round(finite(zone.strength, 0), 1),
        persistenceBars: finite(zone.persistenceBars, 0),
        intensity: round(finite(zone.totalIntensity, 0), 2),
        attractionScore,
        lifecycleMultiplier,
        effectiveAttractionScore: round(attractionScore * lifecycleMultiplier, 2),
        rejectionPressureScore: lifecycle === 'REJECTED'
          ? round(attractionScore * COIN_LEVEL_COINGLASS_REJECTED_REVERSE_WEIGHT, 2)
          : 0,
        lifecycle,
        swept: lifecycleMatches ? Boolean(track?.swept) : false,
        timeframeAgreement: lifecycleMatches && Array.isArray(track?.timeframeAgreement)
          ? track.timeframeAgreement
          : [],
      };
    })
    .filter((zone) => Number.isFinite(zone.distancePct) && Math.abs(zone.distancePct) <= 35)
    .sort((left, right) => Math.abs(left.distancePct) - Math.abs(right.distancePct));
}

function summarizeCoinglassFrame({ range, heatmap, scrapedAt, markPrice, lifecycleTracks }) {
  if (!heatmap) return null;
  const zones = normalizeCoinglassZones(heatmap, range, markPrice, lifecycleTracks);
  const above = zones.filter((zone) => zone.side === 'ABOVE').slice(0, 4);
  const below = zones.filter((zone) => zone.side === 'BELOW').slice(0, 4);
  const selectedAbove = above.slice(0, 3);
  const selectedBelow = below.slice(0, 3);
  const upperAttractionScore = selectedAbove.reduce((sum, zone) => sum + zone.effectiveAttractionScore, 0);
  const lowerAttractionScore = selectedBelow.reduce((sum, zone) => sum + zone.effectiveAttractionScore, 0);
  const upperRejectionPressure = selectedBelow.reduce((sum, zone) => sum + zone.rejectionPressureScore, 0);
  const lowerRejectionPressure = selectedAbove.reduce((sum, zone) => sum + zone.rejectionPressureScore, 0);
  return {
    range,
    scrapedAt: scrapedAt ?? null,
    heatmapPrice: round(finite(heatmap.currentPrice)),
    cellCount: finite(heatmap.liquidationCellCount, 0),
    above,
    below,
    upperAttractionScore: round(upperAttractionScore, 2),
    lowerAttractionScore: round(lowerAttractionScore, 2),
    upperRejectionPressure: round(upperRejectionPressure, 2),
    lowerRejectionPressure: round(lowerRejectionPressure, 2),
    upperScore: round(upperAttractionScore + upperRejectionPressure, 2),
    lowerScore: round(lowerAttractionScore + lowerRejectionPressure, 2),
  };
}

export function evaluateCoinGlass24hTrial(frames, now = Date.now()) {
  const weights = { '24h': 1.4, '48h': 1.1, '12h': 0.75 };
  const evaluated = [...new Map(frames.map((frame) => [frame.range, frame])).values()].map((frame) => {
    const timestamp = Date.parse(frame.scrapedAt);
    const eligible = Number.isFinite(timestamp) && now - timestamp >= 0 && now - timestamp <= 20 * 60_000;
    return { ...frame, weight: weights[frame.range] ?? 1, eligible };
  });
  const active = evaluated.filter((frame) => frame.eligible);
  const score = (key, weighted) => active.reduce((sum, frame) => sum + frame[key] * (weighted ? frame.weight : 1), 0);
  const assess = (weighted) => {
    const upperScore = score('upperScore', weighted);
    const lowerScore = score('lowerScore', weighted);
    const total = upperScore + lowerScore;
    const dominancePct = total > 0 ? Math.abs(upperScore - lowerScore) / total * 100 : 0;
    let liquidityBias = !active.length ? 'NO_DATA' : dominancePct < 15 ? 'BALANCED' : upperScore > lowerScore ? 'UPPER_FIRST' : 'LOWER_FIRST';
    const zones = active.flatMap((frame) => [...frame.above, ...frame.below].map((zone) => ({ ...zone, weightedRaw: zone.attractionScore * (weighted ? frame.weight : 1) })));
    const rejectedDominant = (side) => {
      const sideZones = zones.filter((zone) => zone.side === side);
      const raw = sideZones.reduce((sum, zone) => sum + zone.weightedRaw, 0);
      return raw > 0 && sideZones.filter((zone) => zone.lifecycle === 'REJECTED').reduce((sum, zone) => sum + zone.weightedRaw, 0) / raw >= 0.5;
    };
    const hasTarget = (side) => zones.some((zone) => zone.side === side && ['FRESH', 'APPROACHING', 'UNTRACKED'].includes(zone.lifecycle) && zone.effectiveAttractionScore > 0);
    let lifecycleSignal = 'NONE';
    if (rejectedDominant('ABOVE') && hasTarget('BELOW')) {
      liquidityBias = 'LOWER_FIRST'; lifecycleSignal = 'UPPER_REJECTED_TO_LOWER';
    } else if (rejectedDominant('BELOW') && hasTarget('ABOVE')) {
      liquidityBias = 'UPPER_FIRST'; lifecycleSignal = 'LOWER_REJECTED_TO_UPPER';
    }
    return { upperScore: round(upperScore, 2), lowerScore: round(lowerScore, 2), dominancePct: round(dominancePct, 1), liquidityBias, lifecycleSignal };
  };
  return {
    version: 'COIN_LEVEL_24H_WEIGHT_TRIAL_V1_20260906', observeOnly: true,
    weights, hasFresh24h: active.some((frame) => frame.range === '24h'),
    excludedRanges: evaluated.filter((frame) => !frame.eligible).map((frame) => frame.range),
    missingRanges: Object.keys(weights).filter((range) => !evaluated.some((frame) => frame.range === range)),
    weighted: assess(true), equalWeight: assess(false),
  };
}

export function attachCoinGlassLiquidationAnalysis(analysis, context = {}, now = Date.now()) {
  const row = context?.row ?? null;
  const markPrice = finite(analysis?.market?.markPrice);
  const scrapedAt = row?.scrapedAt ?? context?.snapshotUpdatedAt ?? null;
  const ageMs = scrapedAt ? Math.max(0, now - Date.parse(scrapedAt)) : null;
  const unavailableReason = !row
    ? 'NOT_IN_ACTIVE_TOP80_SCAN'
    : row.status !== 'OK' ? String(row.lastError || row.status || 'COINGLASS_NOT_READY')
      : !row.heatmap ? 'COINGLASS_HEATMAP_MISSING' : null;
  if (unavailableReason || !(markPrice > 0)) {
    return {
      ...analysis,
      coinglass: {
        version: COIN_LEVEL_COINGLASS_VERSION,
        available: false,
        reason: unavailableReason ?? 'MARK_PRICE_INVALID',
        streamId: context?.streamId ?? null,
        snapshotUpdatedAt: context?.snapshotUpdatedAt ?? null,
        authRequired: /LOGIN|AUTH|PERMISSION/i.test(unavailableReason ?? ''),
        refresh: context?.refresh ?? null,
        frames: [],
        missingRanges: ['48h', '12h', '24h'],
      },
    };
  }

  const tracks = context?.lifecycle?.tracks ?? {};
  const lifecycleTracks = {
    ABOVE: tracks[`${analysis.symbol}:ABOVE`] ?? null,
    BELOW: tracks[`${analysis.symbol}:BELOW`] ?? null,
  };
  const frames = [
    summarizeCoinglassFrame({ range: row.range ?? '48h', heatmap: row.heatmap, scrapedAt, markPrice, lifecycleTracks }),
    ...['12h', '24h'].map((range) => summarizeCoinglassFrame({
      range,
      heatmap: row?.qualifiedTimeframes?.[range]?.heatmap,
      scrapedAt: row?.qualifiedTimeframes?.[range]?.scrapedAt,
      markPrice,
      lifecycleTracks,
    })),
  ].filter(Boolean);
  const upperScore = frames.reduce((sum, frame) => sum + frame.upperScore, 0);
  const lowerScore = frames.reduce((sum, frame) => sum + frame.lowerScore, 0);
  const totalScore = upperScore + lowerScore;
  const dominancePct = totalScore > 0 ? (Math.abs(upperScore - lowerScore) / totalScore) * 100 : 0;
  let liquidityBias = dominancePct < 15
    ? 'BALANCED'
    : upperScore > lowerScore ? 'UPPER_FIRST' : 'LOWER_FIRST';
  const allZones = frames.flatMap((frame) => [...frame.above, ...frame.below]);
  const rawAboveScore = allZones
    .filter((zone) => zone.side === 'ABOVE')
    .reduce((sum, zone) => sum + zone.attractionScore, 0);
  const rawBelowScore = allZones
    .filter((zone) => zone.side === 'BELOW')
    .reduce((sum, zone) => sum + zone.attractionScore, 0);
  const rejectedAboveScore = allZones
    .filter((zone) => zone.side === 'ABOVE' && zone.lifecycle === 'REJECTED')
    .reduce((sum, zone) => sum + zone.attractionScore, 0);
  const rejectedBelowScore = allZones
    .filter((zone) => zone.side === 'BELOW' && zone.lifecycle === 'REJECTED')
    .reduce((sum, zone) => sum + zone.attractionScore, 0);
  const hasLowerTarget = allZones.some((zone) => zone.side === 'BELOW'
    && ['FRESH', 'APPROACHING', 'UNTRACKED'].includes(zone.lifecycle)
    && zone.effectiveAttractionScore > 0);
  const hasUpperTarget = allZones.some((zone) => zone.side === 'ABOVE'
    && ['FRESH', 'APPROACHING', 'UNTRACKED'].includes(zone.lifecycle)
    && zone.effectiveAttractionScore > 0);
  const upperRejectedDominant = rawAboveScore > 0 && rejectedAboveScore / rawAboveScore >= 0.5;
  const lowerRejectedDominant = rawBelowScore > 0 && rejectedBelowScore / rawBelowScore >= 0.5;
  let lifecycleSignal = 'NONE';
  if (upperRejectedDominant && hasLowerTarget) {
    lifecycleSignal = 'UPPER_REJECTED_TO_LOWER';
    liquidityBias = 'LOWER_FIRST';
  } else if (lowerRejectedDominant && hasUpperTarget) {
    lifecycleSignal = 'LOWER_REJECTED_TO_UPPER';
    liquidityBias = 'UPPER_FIRST';
  }
  const binanceBias = String(analysis?.trend?.bias ?? 'NEUTRAL');
  let agreement = 'NEUTRAL';
  let headline = 'Hai phía thanh lý đang cân bằng; tiếp tục dùng xác nhận nến 15m.';
  if (lifecycleSignal === 'UPPER_REJECTED_TO_LOWER') {
    agreement = binanceBias === 'BEARISH' ? 'ALIGNED_SHORT' : binanceBias === 'BULLISH' ? 'CONFLICT_LOWER_PULL' : 'LOWER_PULL';
    headline = 'Vùng thanh lý phía trên đã bị quét và REJECTED; áp lực chuyển xuống các cụm phía dưới — chỉ SHORT khi nến 15m xác nhận.';
  } else if (lifecycleSignal === 'LOWER_REJECTED_TO_UPPER') {
    agreement = binanceBias === 'BULLISH' ? 'ALIGNED_LONG' : binanceBias === 'BEARISH' ? 'CONFLICT_UPPER_PULL' : 'UPPER_PULL';
    headline = 'Vùng thanh lý phía dưới đã bị quét và REJECTED; áp lực chuyển lên các cụm phía trên — chỉ LONG khi nến 15m xác nhận.';
  } else if (liquidityBias === 'UPPER_FIRST') {
    agreement = binanceBias === 'BULLISH' ? 'ALIGNED_LONG' : binanceBias === 'BEARISH' ? 'CONFLICT_UPPER_PULL' : 'UPPER_PULL';
    headline = binanceBias === 'BEARISH'
      ? 'Xu hướng Binance đang giảm nhưng lực hút thanh lý CoinGlass nằm phía trên — có rủi ro short squeeze.'
      : 'Lực hút thanh lý CoinGlass nghiêng phía trên; chỉ LONG khi nến 15m xác nhận và retest 5m giữ được.';
  } else if (liquidityBias === 'LOWER_FIRST') {
    agreement = binanceBias === 'BEARISH' ? 'ALIGNED_SHORT' : binanceBias === 'BULLISH' ? 'CONFLICT_LOWER_PULL' : 'LOWER_PULL';
    headline = binanceBias === 'BULLISH'
      ? 'Xu hướng Binance đang tăng nhưng lực hút thanh lý CoinGlass nằm phía dưới — có rủi ro quét LONG.'
      : 'Lực hút thanh lý CoinGlass nghiêng phía dưới; chỉ SHORT khi nến 15m xác nhận và retest 5m thất bại.';
  }
  const rawNearestAbove = allZones.filter((zone) => zone.side === 'ABOVE').sort((a, b) => a.distancePct - b.distancePct)[0] ?? null;
  const rawNearestBelow = allZones.filter((zone) => zone.side === 'BELOW').sort((a, b) => b.distancePct - a.distancePct)[0] ?? null;
  const nearestAbove = allZones
    .filter((zone) => zone.side === 'ABOVE' && zone.effectiveAttractionScore > 0)
    .sort((a, b) => a.distancePct - b.distancePct)[0] ?? null;
  const nearestBelow = allZones
    .filter((zone) => zone.side === 'BELOW' && zone.effectiveAttractionScore > 0)
    .sort((a, b) => b.distancePct - a.distancePct)[0] ?? null;
  const stale = Number.isFinite(ageMs) && ageMs > 20 * 60_000;
  const confluenceWarning = stale
    ? 'CoinGlass đã quá 20 phút; không dùng để xác nhận cho đến lượt quét mới.'
    : headline;
  const secondRejectionBase = analysis?.recommendation?.secondRejectionShort ?? null;
  const lowerTargets = allZones
    .filter((zone) => zone.side === 'BELOW'
      && zone.effectiveAttractionScore > 0
      && zone.lifecycle !== 'REJECTED'
      && finite(zone.bandHigh) > 0
      && zone.bandHigh < markPrice)
    .sort((left, right) => Math.abs(left.distancePct) - Math.abs(right.distancePct));
  const primaryTarget = lowerTargets[0] ?? null;
  const secondaryTarget = lowerTargets.find((zone) => (
    primaryTarget && Math.abs(finite(zone.bandHigh) / finite(primaryTarget.bandHigh) - 1) > 0.005
  )) ?? null;
  const entryPrice = markPrice;
  const takeProfitPrice = finite(primaryTarget?.bandHigh);
  const takeProfit2Price = finite(secondaryTarget?.bandHigh);
  const invalidationPrice = finite(secondRejectionBase?.invalidationPrice);
  const rewardPct = takeProfitPrice > 0 && takeProfitPrice < entryPrice
    ? (1 - takeProfitPrice / entryPrice) * 100
    : null;
  const riskPct = invalidationPrice > entryPrice
    ? (invalidationPrice / entryPrice - 1) * 100
    : null;
  const rewardRiskRatio = rewardPct > 0 && riskPct > 0 ? rewardPct / riskPct : null;
  const alignedShort = agreement === 'ALIGNED_SHORT' && liquidityBias === 'LOWER_FIRST';
  const secondRejectionReady = Boolean(
    secondRejectionBase?.detected
    && secondRejectionBase?.confirmed
    && !stale
    && alignedShort
    && rewardPct >= 1
    && riskPct > 0
    && riskPct <= 10
    && rewardRiskRatio >= 0.65,
  );
  const secondRejectionShort = secondRejectionBase ? {
    ...secondRejectionBase,
    state: secondRejectionReady
      ? 'READY'
      : secondRejectionBase.detected ? 'WATCH' : 'NONE',
    ready: secondRejectionReady,
    eventType: 'COIN_LEVEL_SECOND_REJECTION_ALIGNED_SHORT',
    entryPrice: round(entryPrice),
    takeProfitPrice: round(takeProfitPrice),
    takeProfit2Price: round(takeProfit2Price),
    invalidationPrice: round(invalidationPrice),
    rewardPct: round(rewardPct, 2),
    riskPct: round(riskPct, 2),
    rewardRiskRatio: round(rewardRiskRatio, 2),
    targetZone: primaryTarget,
    secondaryTargetZone: secondaryTarget,
    alignment: agreement,
    liquidityBias,
    coinGlassFresh: !stale,
    conditions: {
      secondReject15m: Boolean(secondRejectionBase.detected),
      sellConfirmed15m: Boolean(secondRejectionBase.confirmed),
      alignedShort,
      lowerTarget: Boolean(primaryTarget),
      rewardAtLeast1Pct: rewardPct >= 1,
      rewardRiskAtLeast065: rewardRiskRatio >= 0.65,
    },
    message: secondRejectionReady
      ? 'Reject lần 2 đã xác nhận trên nến 15m và CoinGlass ALIGNED_SHORT; có thể cân nhắc SHORT theo entry/TP/invalidation tham khảo.'
      : secondRejectionBase.detected
        ? 'Đã thấy cấu trúc reject lần 2 nhưng chưa đủ xác nhận CoinGlass/15m/R:R để vào SHORT.'
        : 'Chưa có hai lần reject cùng vùng trên trong cửa sổ 15m gần nhất.',
  } : null;
  const secondRejectionWarning = secondRejectionReady
    ? `SHORT READY: reject lần 2 trên 15m; entry tham khảo ${round(entryPrice)}, TP ${round(takeProfitPrice)}, vô hiệu ${round(invalidationPrice)}.`
    : null;
  const secondRejectionLongBase = analysis?.recommendation?.secondRejectionLong ?? null;
  const upperTargets = allZones
    .filter((zone) => zone.side === 'ABOVE'
      && zone.effectiveAttractionScore > 0
      && zone.lifecycle !== 'REJECTED'
      && finite(zone.bandLow) > markPrice)
    .sort((left, right) => Math.abs(left.distancePct) - Math.abs(right.distancePct));
  const longPrimaryTarget = upperTargets[0] ?? null;
  const longSecondaryTarget = upperTargets.find((zone) => (
    longPrimaryTarget && Math.abs(finite(zone.bandLow) / finite(longPrimaryTarget.bandLow) - 1) > 0.005
  )) ?? null;
  const longTakeProfitPrice = finite(longPrimaryTarget?.bandLow);
  const longTakeProfit2Price = finite(longSecondaryTarget?.bandLow);
  const longInvalidationPrice = finite(secondRejectionLongBase?.invalidationPrice);
  const longRewardPct = longTakeProfitPrice > entryPrice
    ? (longTakeProfitPrice / entryPrice - 1) * 100
    : null;
  const longRiskPct = longInvalidationPrice > 0 && longInvalidationPrice < entryPrice
    ? (1 - longInvalidationPrice / entryPrice) * 100
    : null;
  const longRewardRiskRatio = longRewardPct > 0 && longRiskPct > 0
    ? longRewardPct / longRiskPct
    : null;
  const alignedLong = agreement === 'ALIGNED_LONG' && liquidityBias === 'UPPER_FIRST';
  const secondRejectionLongReady = Boolean(
    secondRejectionLongBase?.detected
    && secondRejectionLongBase?.confirmed
    && !stale
    && alignedLong
    && longRewardPct >= 1
    && longRiskPct > 0
    && longRiskPct <= 10
    && longRewardRiskRatio >= 0.65,
  );
  const secondRejectionLong = secondRejectionLongBase ? {
    ...secondRejectionLongBase,
    state: secondRejectionLongReady
      ? 'READY'
      : secondRejectionLongBase.detected ? 'WATCH' : 'NONE',
    ready: secondRejectionLongReady,
    eventType: 'COIN_LEVEL_SECOND_REJECTION_ALIGNED_LONG',
    entryPrice: round(entryPrice),
    takeProfitPrice: round(longTakeProfitPrice),
    takeProfit2Price: round(longTakeProfit2Price),
    invalidationPrice: round(longInvalidationPrice),
    rewardPct: round(longRewardPct, 2),
    riskPct: round(longRiskPct, 2),
    rewardRiskRatio: round(longRewardRiskRatio, 2),
    targetZone: longPrimaryTarget,
    secondaryTargetZone: longSecondaryTarget,
    alignment: agreement,
    liquidityBias,
    coinGlassFresh: !stale,
    conditions: {
      secondReject15m: Boolean(secondRejectionLongBase.detected),
      buyConfirmed15m: Boolean(secondRejectionLongBase.confirmed),
      alignedLong,
      upperTarget: Boolean(longPrimaryTarget),
      rewardAtLeast1Pct: longRewardPct >= 1,
      rewardRiskAtLeast065: longRewardRiskRatio >= 0.65,
    },
    message: secondRejectionLongReady
      ? 'Reject đáy lần 2 đã xác nhận trên nến 15m và CoinGlass ALIGNED_LONG; có thể cân nhắc LONG theo entry/TP/invalidation tham khảo.'
      : secondRejectionLongBase.detected
        ? 'Đã thấy cấu trúc reject đáy lần 2 nhưng chưa đủ xác nhận CoinGlass/15m/R:R để vào LONG.'
        : 'Chưa có hai lần reject cùng vùng dưới trong cửa sổ 15m gần nhất.',
  } : null;
  const secondRejectionLongWarning = secondRejectionLongReady
    ? `LONG READY: reject đáy lần 2 trên 15m; entry tham khảo ${round(entryPrice)}, TP ${round(longTakeProfitPrice)}, vô hiệu ${round(longInvalidationPrice)}.`
    : null;

  return {
    ...analysis,
    coinglass: {
      version: COIN_LEVEL_COINGLASS_VERSION,
      available: true,
      stale,
      ageMs,
      streamId: context?.streamId ?? null,
      globalRank: Number.isFinite(Number(row.globalRank ?? row.rank)) && Number(row.globalRank ?? row.rank) > 0
        ? Number(row.globalRank ?? row.rank)
        : null,
      snapshotUpdatedAt: context?.snapshotUpdatedAt ?? null,
      scrapedAt,
      refresh: context?.refresh ?? null,
      sourceRange: row.range ?? '48h',
      timeframeTrial: evaluateCoinGlass24hTrial(frames, now),
      frames,
      missingRanges: ['48h', '12h', '24h'].filter((range) => !frames.some((frame) => frame.range === range)),
      lifecycle: {
        above: lifecycleTracks.ABOVE ? {
          state: lifecycleTracks.ABOVE.state,
          previousState: lifecycleTracks.ABOVE.previousState,
          swept: Boolean(lifecycleTracks.ABOVE.swept),
          lastSeenAt: lifecycleTracks.ABOVE.lastSeenAt,
        } : null,
        below: lifecycleTracks.BELOW ? {
          state: lifecycleTracks.BELOW.state,
          previousState: lifecycleTracks.BELOW.previousState,
          swept: Boolean(lifecycleTracks.BELOW.swept),
          lastSeenAt: lifecycleTracks.BELOW.lastSeenAt,
        } : null,
      },
      combined: {
        liquidityBias,
        lifecycleSignal,
        binanceBias,
        agreement,
        dominancePct: round(dominancePct, 1),
        upperScore: round(upperScore, 2),
        lowerScore: round(lowerScore, 2),
        headline,
        nearestAbove,
        nearestBelow,
        rawNearestAbove,
        rawNearestBelow,
        secondRejectionShort,
        secondRejectionLong,
      },
      link: `https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3?coin=${encodeURIComponent(analysis.symbol.replace(/USDT$/, ''))}`,
    },
    recommendation: {
      ...analysis.recommendation,
      coinglassConfluence: {
        available: !stale,
        liquidityBias,
        lifecycleSignal,
        agreement,
        dominancePct: round(dominancePct, 1),
        nearestAbove,
        nearestBelow,
      },
      secondRejectionShort,
      secondRejectionLong,
      warnings: [
        ...(analysis.recommendation?.warnings ?? []),
        confluenceWarning,
        secondRejectionWarning,
        secondRejectionLongWarning,
      ].filter(Boolean),
    },
  };
}
