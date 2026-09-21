import { buildCoinLevelAnalysis } from './coinLevelAnalysis.js';

export const COIN_LEVEL_ENTRY_WATCH_VERSION = 'COIN_LEVEL_ENTRY_WATCH_V3_ENTRY_SCORE_TARGETS_20260920';
export const COIN_LEVEL_ENTRY_SCORE_VERSION = 'COIN_LEVEL_ENTRY_SCORE_V1_CAUSAL_TARGETS_20260920';

const INTERVAL_MS = Object.freeze({ '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000 });
const MIN_CLOSED_BARS = 100;
const MIN_DIRECTIONAL_SCORE = 12;
const MAX_ABS_TREND_SCORE = 29.75;
const DISPLAY_LEVERAGE = 5;
const DISPLAY_TAKE_PROFIT_ROE_PCT = 10;
const roundPrice = (value) => Number(Number(value).toFixed(8));
const round = (value, digits = 2) => Number(Number(value).toFixed(digits));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function candleValue(row, name, index) {
  return finite(row?.[name] ?? row?.[index]);
}

function atrAt(rows, asOf, period = 14) {
  const closed = (Array.isArray(rows) ? rows : [])
    .filter((row) => finite(row?.closeTime ?? row?.[6], Infinity) <= asOf)
    .slice(-(period + 1));
  if (closed.length < period + 1) return null;
  const ranges = closed.slice(1).map((row, index) => {
    const previousClose = candleValue(closed[index], 'close', 4);
    const high = candleValue(row, 'high', 2);
    const low = candleValue(row, 'low', 3);
    if (![previousClose, high, low].every(Number.isFinite)) return null;
    return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
  }).filter(Number.isFinite);
  return ranges.length === period ? ranges.reduce((sum, value) => sum + value, 0) / period : null;
}

function takerBuyPct(row) {
  const quoteVolume = candleValue(row, 'quoteVolume', 7);
  const takerBuyQuoteVolume = candleValue(row, 'takerBuyQuoteVolume', 10);
  return quoteVolume > 0 && takerBuyQuoteVolume != null
    ? (takerBuyQuoteVolume / quoteVolume) * 100
    : null;
}

function favorableMovePct(side, entry, target) {
  if (!(entry > 0) || !(target > 0)) return null;
  const raw = ((target / entry) - 1) * 100;
  return side === 'LONG' ? raw : -raw;
}

function causalStructureTargets(klinesByInterval, side, entry, asOf) {
  const output = [];
  const add = (price, basis) => {
    const movePct = favorableMovePct(side, entry, price);
    if (Number.isFinite(movePct) && movePct > 0.05) output.push({ price, basis, structural: true });
  };
  for (const interval of ['15m', '1h', '4h']) {
    const limit = interval === '15m' ? 80 : 60;
    const rows = (klinesByInterval?.[interval] ?? [])
      .filter((row) => finite(row?.closeTime ?? row?.[6], Infinity) <= asOf)
      .slice(-limit);
    if (rows.length < 5) continue;
    const values = rows.map((row) => side === 'LONG'
      ? candleValue(row, 'high', 2) : candleValue(row, 'low', 3));
    add(side === 'LONG' ? Math.max(...values) : Math.min(...values), `${interval.toUpperCase()}_RANGE`);
    for (let index = 2; index < rows.length - 2; index += 1) {
      const value = values[index];
      const isSwing = side === 'LONG'
        ? value > values[index - 1] && value > values[index - 2]
          && value >= values[index + 1] && value >= values[index + 2]
        : value < values[index - 1] && value < values[index - 2]
          && value <= values[index + 1] && value <= values[index + 2];
      if (isSwing) add(value, `${interval.toUpperCase()}_SWING`);
    }
  }
  return output;
}

function buildTargetPlan({ side, entry, asOf, klinesByInterval }) {
  const direction = side === 'LONG' ? 1 : -1;
  const routeMoveFraction = (DISPLAY_TAKE_PROFIT_ROE_PCT / 100) / DISPLAY_LEVERAGE;
  const routeTpPrice = entry * (1 + direction * routeMoveFraction);
  const atr15m = atrAt(klinesByInterval?.['15m'], asOf);
  const atr1h = atrAt(klinesByInterval?.['1h'], asOf);
  const atr4h = atrAt(klinesByInterval?.['4h'], asOf);
  const candidates = causalStructureTargets(klinesByInterval, side, entry, asOf);
  candidates.push({ price: routeTpPrice, basis: 'TP_10_ROE_5X', structural: false });
  if (atr15m > 0) candidates.push({ price: entry + direction * atr15m, basis: 'ATR15_1X', structural: false });
  if (atr1h > 0 || atr4h > 0) {
    const width4h = Math.max((atr1h || 0) * 2, atr4h || 0);
    const width8h = Math.max((atr1h || 0) * Math.sqrt(8), (atr4h || 0) * Math.sqrt(2));
    if (width4h > 0) candidates.push({ price: entry + direction * width4h, basis: 'ATR_4H_SCENARIO', structural: false });
    if (width8h > 0) candidates.push({ price: entry + direction * width8h, basis: 'ATR_8H_SCENARIO', structural: false });
  }
  const ranked = candidates
    .map((item) => ({ ...item, movePct: favorableMovePct(side, entry, item.price) }))
    .filter((item) => item.price > 0 && Number.isFinite(item.movePct) && item.movePct > 0.05)
    .sort((left, right) => left.movePct - right.movePct);
  const unique = [];
  for (const item of ranked) {
    const duplicate = unique.find((current) => Math.abs(current.movePct - item.movePct) <= 0.12);
    if (duplicate) {
      if (!duplicate.basis.includes(item.basis)) duplicate.basis.push(item.basis);
      duplicate.structural ||= item.structural;
      continue;
    }
    unique.push({ ...item, basis: [item.basis] });
  }
  const targets = unique.slice(0, 3).map((item, index) => ({
    label: `T${index + 1}`,
    price: roundPrice(item.price),
    movePct: round(item.movePct, 2),
    grossRoePctAt5x: round(item.movePct * DISPLAY_LEVERAGE, 1),
    basis: item.basis,
    structural: item.structural,
  }));
  const nearestStructure = ranked.find((item) => item.structural);
  return {
    model: 'STRUCTURE_PLUS_ATR_NO_PROBABILITY',
    asOf,
    leverage: DISPLAY_LEVERAGE,
    takeProfitRoePct: DISPLAY_TAKE_PROFIT_ROE_PCT,
    routeTpPrice: roundPrice(routeTpPrice),
    structuralRoomPct: round(nearestStructure?.movePct ?? routeMoveFraction * 100, 2),
    probabilityCalibrated: false,
    targets,
  };
}

function tierForEntryScore(score) {
  if (score >= 80) return { key: 'VERY_STRONG', label: 'RẤT MẠNH' };
  if (score >= 70) return { key: 'GOOD', label: 'ĐỦ TỐT' };
  if (score >= 60) return { key: 'WATCH', label: 'THEO DÕI' };
  return { key: 'WEAK', label: 'YẾU' };
}

function buildEntryScore({ side, trendScore, event, retest, rows15m, targetPlan }) {
  const trend = clamp((Math.abs(trendScore) / MAX_ABS_TREND_SCORE) * 25, 0, 25);
  const atr15m = atrAt(rows15m, event.at) || Math.abs(event.close - event.level) || event.level * 0.01;
  const breakoutBodyAligned = side === 'LONG'
    ? candleValue(event.candle, 'close', 4) > candleValue(event.candle, 'open', 1)
    : candleValue(event.candle, 'close', 4) < candleValue(event.candle, 'open', 1);
  const breakoutAtr = Math.abs(event.close - event.level) / Math.max(Number.EPSILON, atr15m);
  const breakout = 8 + (breakoutBodyAligned ? 4 : 0) + clamp((breakoutAtr / 0.75) * 8, 0, 8);

  const baselineVolume = median(event.prior.slice(-20).map((row) => candleValue(row, 'quoteVolume', 7)));
  const breakoutVolume = candleValue(event.candle, 'quoteVolume', 7);
  const breakoutVolumeRatio = baselineVolume > 0 && breakoutVolume >= 0 ? breakoutVolume / baselineVolume : null;
  const breakoutTakerBuyPct = takerBuyPct(event.candle);
  const volumePoints = breakoutVolumeRatio == null ? 4 : clamp((breakoutVolumeRatio / 2.5) * 8, 0, 8);
  const directionalTaker = breakoutTakerBuyPct == null ? 0.5
    : side === 'LONG'
      ? clamp((breakoutTakerBuyPct - 42) / 16, 0, 1)
      : clamp((58 - breakoutTakerBuyPct) / 16, 0, 1);
  const flow = volumePoints + directionalTaker * 7;

  let retestScore = 0;
  let retestDistancePct = null;
  let retestTakerPct = null;
  if (retest) {
    const extreme = side === 'LONG'
      ? candleValue(retest, 'low', 3) : candleValue(retest, 'high', 2);
    retestDistancePct = Math.abs((extreme / event.level) - 1) * 100;
    const closeCorrect = side === 'LONG'
      ? candleValue(retest, 'close', 4) >= event.level : candleValue(retest, 'close', 4) <= event.level;
    const bodyAligned = side === 'LONG'
      ? candleValue(retest, 'close', 4) >= candleValue(retest, 'open', 1)
      : candleValue(retest, 'close', 4) <= candleValue(retest, 'open', 1);
    retestTakerPct = takerBuyPct(retest);
    const retestFlowAligned = retestTakerPct == null ? 0.5
      : side === 'LONG' ? clamp((retestTakerPct - 44) / 12, 0, 1) : clamp((56 - retestTakerPct) / 12, 0, 1);
    retestScore = (closeCorrect ? 12 : 0)
      + (1 - clamp(retestDistancePct / 0.5, 0, 1)) * 5
      + (bodyAligned ? 4 : 0)
      + retestFlowAligned * 4;
  }
  const target = clamp((finite(targetPlan?.structuralRoomPct, 0) / 2) * 15, 0, 15);
  const components = {
    trend: round(trend, 1),
    breakout: round(breakout, 1),
    retest: round(retestScore, 1),
    flow: round(flow, 1),
    targetRoom: round(target, 1),
  };
  const entryScore = round(Object.values(components).reduce((sum, value) => sum + value, 0), 1);
  const tier = tierForEntryScore(entryScore);
  return {
    entryScore,
    entryTier: tier.key,
    entryTierLabel: tier.label,
    entryScoreComponents: components,
    entryScoreMetrics: {
      breakoutAtr: round(breakoutAtr, 2),
      breakoutVolumeRatio: breakoutVolumeRatio == null ? null : round(breakoutVolumeRatio, 2),
      breakoutTakerBuyPct: breakoutTakerBuyPct == null ? null : round(breakoutTakerBuyPct, 1),
      retestDistancePct: retestDistancePct == null ? null : round(retestDistancePct, 3),
      retestTakerBuyPct: retestTakerPct == null ? null : round(retestTakerPct, 1),
      structuralRoomPct: targetPlan?.structuralRoomPct ?? null,
    },
  };
}

function closedFreshRows(rows, interval, now) {
  const duration = INTERVAL_MS[interval];
  const closed = (Array.isArray(rows) ? rows : [])
    .filter((row) => Number(row?.closeTime) > 0 && Number(row.closeTime) <= now)
    .slice(-140);
  if (closed.length < MIN_CLOSED_BARS || now - Number(closed.at(-1).closeTime) > duration + 300_000) return null;
  const tail = closed.slice(-MIN_CLOSED_BARS);
  if (tail.some((row, index) => index > 0 && Number(row.openTime) - Number(tail[index - 1].openTime) !== duration)) return null;
  return closed;
}

function recentBreak(rows15m, side, now) {
  for (let index = rows15m.length - 1; index >= Math.max(12, rows15m.length - 3); index -= 1) {
    const candle = rows15m[index];
    if (now - Number(candle.closeTime) > 45 * 60_000) continue;
    const prior = rows15m.slice(index - 12, index);
    const level = side === 'LONG'
      ? Math.max(...prior.map((row) => Number(row.high)))
      : Math.min(...prior.map((row) => Number(row.low)));
    const close = Number(candle.close);
    const previousClose = Number(rows15m[index - 1].close);
    if (!(level > 0) || !(close > 0)) continue;
    const confirmed = side === 'LONG'
      ? close > level && previousClose <= level
      : close < level && previousClose >= level;
    if (confirmed) return { level, at: Number(candle.closeTime), close, candle, prior, index };
  }
  return null;
}

export function scanCoinLevelEntryWatch({ symbols, getKlines, now = Date.now(), analyze = buildCoinLevelAnalysis } = {}) {
  const candidates = [];
  let covered = 0;
  for (const item of Array.isArray(symbols) ? symbols : []) {
    const symbol = typeof item === 'string' ? item : item?.symbol;
    if (!/^[A-Z0-9]{2,40}USDT$/.test(String(symbol ?? ''))) continue;
    const klinesByInterval = {};
    for (const interval of Object.keys(INTERVAL_MS)) {
      const rows = closedFreshRows(getKlines(symbol, interval, 142), interval, now);
      if (!rows) break;
      klinesByInterval[interval] = rows;
    }
    if (Object.keys(klinesByInterval).length !== 4) continue;
    covered += 1;
    const last5m = klinesByInterval['5m'].at(-1);
    const lastPrice = Number(last5m.close);
    if (!(lastPrice > 0)) continue;
    let analysis;
    try {
      analysis = analyze({ symbol, klinesByInterval, now, premiumIndex: { markPrice: lastPrice }, ticker24h: { lastPrice } });
    } catch { continue; }
    const score = Number(analysis?.recommendation?.trendScore);
    const side = score >= MIN_DIRECTIONAL_SCORE ? 'LONG' : score <= -MIN_DIRECTIONAL_SCORE ? 'SHORT' : null;
    if (!side) continue;
    const frameStates = Object.fromEntries((analysis?.trend?.frames ?? []).map((frame) => [frame.interval, frame.state]));
    const requiredState = side === 'LONG' ? 'UP' : 'DOWN';
    if (frameStates['15m'] !== requiredState || frameStates['1h'] !== requiredState) continue;
    const event = recentBreak(klinesByInterval['15m'], side, now);
    if (!event) continue;
    if (Number(last5m.closeTime) < event.at) continue;
    const afterEvent5m = klinesByInterval['5m'].filter((row) => Number(row.closeTime) > event.at);
    if (afterEvent5m.some((row) => side === 'LONG'
      ? Number(row.close) < event.level : Number(row.close) > event.level)) continue;
    const post5m = afterEvent5m.filter((row) => Number(row.closeTime) <= event.at + 30 * 60_000);
    const retest = post5m.find((row) => side === 'LONG'
      ? Number(row.low) <= event.level * 1.0015 && Number(row.close) >= event.level
      : Number(row.high) >= event.level * 0.9985 && Number(row.close) <= event.level);
    const stillOnSide = side === 'LONG' ? lastPrice >= event.level : lastPrice <= event.level;
    if (!stillOnSide) continue;
    const entryLow = roundPrice(side === 'LONG' ? event.level : event.level * 0.9985);
    const entryHigh = roundPrice(side === 'LONG' ? event.level * 1.0015 : event.level);
    const entryPrice = roundPrice((entryLow + entryHigh) / 2);
    const scoreAsOf = retest ? Number(retest.closeTime) : event.at;
    const targetPlan = buildTargetPlan({ side, entry: entryPrice, asOf: scoreAsOf, klinesByInterval });
    const entryQuality = buildEntryScore({
      side, trendScore: score, event, retest, rows15m: klinesByInterval['15m'], targetPlan,
    });
    candidates.push({
      version: COIN_LEVEL_ENTRY_WATCH_VERSION,
      entryScoreVersion: COIN_LEVEL_ENTRY_SCORE_VERSION,
      symbol, side, score, referenceLevel: event.level, signalClose: event.close,
      confirmationAt: event.at, retestAt: retest ? Number(retest.closeTime) : null,
      entryPrice,
      entryZone: { low: entryLow, high: entryHigh },
      entryBasis: 'RETEST_LEVEL_0_15_PCT',
      ...entryQuality,
      targetPlan,
      lastClosed5m: lastPrice, lastClosed5mAt: Number(last5m.closeTime),
      observeOnly: !retest,
      binanceEligible: Boolean(retest),
      executionEligible: Boolean(retest),
    });
  }
  candidates.sort((a, b) => Number(Boolean(b.retestAt)) - Number(Boolean(a.retestAt))
    || b.confirmationAt - a.confirmationAt || Math.abs(b.score) - Math.abs(a.score));
  return {
    version: COIN_LEVEL_ENTRY_WATCH_VERSION,
    entryScoreVersion: COIN_LEVEL_ENTRY_SCORE_VERSION,
    generatedAt: now, observeOnly: true,
    minDirectionalScore: MIN_DIRECTIONAL_SCORE, universe: Array.isArray(symbols) ? symbols.length : 0,
    covered, candidates: candidates.slice(0, 30), totalCandidates: candidates.length,
  };
}
