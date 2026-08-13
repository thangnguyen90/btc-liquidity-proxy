export const LIQUID_SPRING_REVERSAL_VERSION =
  'LIQUID_SPRING_REVERSAL_V1_CLOSED_SWEEP_RECLAIM_20260811';
export const LIQUID_SPRING_REVERSAL_WHITELIST_VERSION =
  'LIQUID_SPRING_REVERSAL_WHITELIST_V1_20260811';
export const LIQUID_SPRING_LOOKBACK = 6;
export const LIQUID_SPRING_MIN_SWEEP_PCT = 0.15;
export const LIQUID_SPRING_MIN_RECLAIM_PCT = 0.05;
export const LIQUID_SPRING_POINT_GAP = 15;

export const LIQUID_SPRING_ROWS = [
  {
    key: 'LONG_SPRING',
    side: 'LONG',
    label: 'LIQ LONG SPRING REVERSAL',
    field: 'liquidLongSpringMatched',
  },
  {
    key: 'SHORT_UPTHRUST',
    side: 'SHORT',
    label: 'LIQ SHORT UPTHRUST REVERSAL',
    field: 'liquidShortUpthrustMatched',
  },
];

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalize(value, fallback = 'NO_DATA') {
  const text = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return text || fallback;
}

function intervalMs(timeframe) {
  const match = String(timeframe ?? '').toLowerCase().match(/^(\d+)(m|h)$/);
  if (!match) return 15 * 60_000;
  const unit = match[2] === 'h' ? 60 * 60_000 : 60_000;
  return Number(match[1]) * unit;
}

function candleValue(candle, key, arrayIndex) {
  return finite(Array.isArray(candle) ? candle[arrayIndex] : candle?.[key]);
}

function candleOf(raw) {
  const openTime = candleValue(raw, 'openTime', 0);
  const open = candleValue(raw, 'open', 1);
  const high = candleValue(raw, 'high', 2);
  const low = candleValue(raw, 'low', 3);
  const close = candleValue(raw, 'close', 4);
  const volume = candleValue(raw, 'volume', 5);
  const closeTime = candleValue(raw, 'closeTime', 6);
  if (![openTime, open, high, low, close].every(Number.isFinite)) return null;
  if (!(open > 0 && high > 0 && low > 0 && close > 0)) return null;
  return { openTime, closeTime, open, high, low, close, volume };
}

function candleDirection(value) {
  const explicit = normalize(value?.direction, '');
  if (explicit) return explicit;
  const name = normalize(value?.name, '');
  if (/^(BULLISH|HAMMER)/.test(name)) return 'BULLISH';
  if (/^(BEARISH|SHOOTING_STAR)/.test(name)) return 'BEARISH';
  return 'NO_DATA';
}

function marketScores(trade = {}) {
  const market = trade.marketDirectionAtSignal ?? {};
  const dynamics = market.scoreDynamics ?? {};
  const longScore = finite(market.scores?.long ?? dynamics.longScore);
  const shortScore = finite(market.scores?.short ?? dynamics.shortScore);
  return {
    longScore,
    shortScore,
    longPressureGap: longScore != null && shortScore != null ? longScore - shortScore : null,
    shortPressureGap: longScore != null && shortScore != null ? shortScore - longScore : null,
  };
}

export function liquidSpringStructureSnapshot(candles = [], signalAt, {
  timeframe = '15m',
  lookback = LIQUID_SPRING_LOOKBACK,
} = {}) {
  const signalMs = Number.isFinite(Number(signalAt)) ? Number(signalAt) : Date.parse(signalAt ?? '');
  if (!Number.isFinite(signalMs)) return null;
  const frameMs = intervalMs(timeframe);
  const closed = (Array.isArray(candles) ? candles : [])
    .map(candleOf)
    .filter(Boolean)
    .filter((candle) => {
      const closeAt = Number.isFinite(candle.closeTime)
        ? candle.closeTime
        : candle.openTime + frameMs - 1;
      return closeAt <= signalMs;
    })
    .sort((a, b) => a.openTime - b.openTime);
  if (closed.length < lookback + 1) return null;
  const trigger = closed.at(-1);
  const prior = closed.slice(-(lookback + 1), -1);
  const priorLow = Math.min(...prior.map((candle) => candle.low));
  const priorHigh = Math.max(...prior.map((candle) => candle.high));
  const priorVolumes = prior.map((candle) => candle.volume).filter(Number.isFinite);
  const avgPriorVolume = priorVolumes.length
    ? priorVolumes.reduce((sum, value) => sum + value, 0) / priorVolumes.length
    : null;
  const longSweepPct = priorLow > 0 ? ((priorLow - trigger.low) / priorLow) * 100 : null;
  const longReclaimPct = priorLow > 0 ? ((trigger.close - priorLow) / priorLow) * 100 : null;
  const shortSweepPct = priorHigh > 0 ? ((trigger.high - priorHigh) / priorHigh) * 100 : null;
  const shortRejectPct = priorHigh > 0 ? ((priorHigh - trigger.close) / priorHigh) * 100 : null;
  return {
    timeframe,
    lookback,
    triggerOpenTime: trigger.openTime,
    triggerCloseTime: Number.isFinite(trigger.closeTime)
      ? trigger.closeTime
      : trigger.openTime + frameMs - 1,
    triggerOpen: trigger.open,
    triggerHigh: trigger.high,
    triggerLow: trigger.low,
    triggerClose: trigger.close,
    triggerDirection: trigger.close > trigger.open ? 'BULLISH' : trigger.close < trigger.open ? 'BEARISH' : 'NEUTRAL',
    priorLow,
    priorHigh,
    longSweepPct: finite(longSweepPct),
    longReclaimPct: finite(longReclaimPct),
    shortSweepPct: finite(shortSweepPct),
    shortRejectPct: finite(shortRejectPct),
    volumeRatio: avgPriorVolume > 0 && Number.isFinite(trigger.volume)
      ? trigger.volume / avgPriorVolume
      : null,
    basis: 'CLOSED_KLINES_AT_ENTRY',
  };
}

export function evaluateLiquidSpringReversal(trade = {}, {
  structure = trade.liquidSpringStructureAtEntry ?? null,
  derived = false,
} = {}) {
  const side = normalize(trade.side, 'NO_SIDE');
  const altDirection = candleDirection(trade.candlePatternAtEntry);
  const btcDirection = candleDirection(trade.btcCandlePatternAtEntry);
  const scores = marketScores(trade);
  const hasStructure = Boolean(structure && typeof structure === 'object');
  const longStructure = hasStructure
    && finite(structure.longSweepPct, -Infinity) >= LIQUID_SPRING_MIN_SWEEP_PCT
    && finite(structure.longReclaimPct, -Infinity) >= LIQUID_SPRING_MIN_RECLAIM_PCT
    && normalize(structure.triggerDirection) === 'BULLISH';
  const shortStructure = hasStructure
    && finite(structure.shortSweepPct, -Infinity) >= LIQUID_SPRING_MIN_SWEEP_PCT
    && finite(structure.shortRejectPct, -Infinity) >= LIQUID_SPRING_MIN_RECLAIM_PCT
    && normalize(structure.triggerDirection) === 'BEARISH';
  const longMatched = side === 'LONG'
    && longStructure
    && altDirection === 'BULLISH'
    && btcDirection === 'BULLISH'
    && scores.shortPressureGap != null
    && scores.shortPressureGap >= LIQUID_SPRING_POINT_GAP;
  const shortMatched = side === 'SHORT'
    && shortStructure
    && altDirection === 'BEARISH'
    && btcDirection === 'BEARISH'
    && scores.longPressureGap != null
    && scores.longPressureGap >= LIQUID_SPRING_POINT_GAP;
  const matched = longMatched || shortMatched;
  const key = longMatched ? 'LONG_SPRING' : shortMatched ? 'SHORT_UPTHRUST' : 'N_A';
  const row = LIQUID_SPRING_ROWS.find((candidate) => candidate.key === key);
  const label = row?.label ?? 'LIQ SPRING REVERSAL N/A';
  const sideGap = side === 'LONG' ? scores.shortPressureGap : scores.longPressureGap;
  const sweep = side === 'LONG' ? structure?.longSweepPct : structure?.shortSweepPct;
  const reclaim = side === 'LONG' ? structure?.longReclaimPct : structure?.shortRejectPct;
  return {
    liquidSpringReversalEligible: ['LONG', 'SHORT'].includes(side) && hasStructure,
    liquidSpringReversalMatched: matched,
    liquidLongSpringMatched: longMatched,
    liquidShortUpthrustMatched: shortMatched,
    liquidSpringReversalKey: key,
    liquidSpringReversalLabel: label,
    liquidSpringReversalSide: side,
    liquidSpringReversalAltDirection: altDirection,
    liquidSpringReversalBtcDirection: btcDirection,
    liquidSpringReversalLongScore: scores.longScore,
    liquidSpringReversalShortScore: scores.shortScore,
    liquidSpringReversalOppositePointGap: sideGap,
    liquidSpringReversalSweepPct: finite(sweep),
    liquidSpringReversalReclaimPct: finite(reclaim),
    liquidSpringReversalVolumeRatio: finite(structure?.volumeRatio),
    liquidSpringStructureAtEntry: hasStructure ? structure : null,
    liquidSpringReversalReason: hasStructure
      ? `${side} | sweep ${finite(sweep, 0).toFixed(2)}% | reclaim/reject ${finite(reclaim, 0).toFixed(2)}%`
        + ` | ALT ${altDirection} | BTC ${btcDirection} | opposite gap ${sideGap == null ? 'NO DATA' : sideGap.toFixed(0)}`
        + ` -> ${label} | OBSERVE ONLY`
      : `${side} | thiếu closed-kline sweep snapshot tại entry -> NO DATA | OBSERVE ONLY`,
    liquidSpringReversalBasis: derived ? 'DERIVED_CLOSED_KLINES_AT_ENTRY' : 'ENTRY_CLOSED_KLINES_SNAPSHOT',
    liquidSpringReversalVersion: LIQUID_SPRING_REVERSAL_VERSION,
    liquidSpringReversalObservationOnly: true,
    liquidSpringReversalAffectsEntry: false,
    liquidSpringReversalAffectsMargin: false,
    liquidSpringReversalAffectsSl: false,
    liquidSpringReversalAffectsTp: false,
    liquidSpringReversalAffectsBinance: false,
  };
}

function dayOf(trade = {}) {
  const at = Date.parse(trade.openedAt ?? trade.createdAt ?? '');
  return Number.isFinite(at)
    ? new Date(at + (7 * 60 * 60 * 1000)).toISOString().slice(0, 10)
    : 'NO_DAY';
}

export function liquidSpringReversalStats(trades = []) {
  return LIQUID_SPRING_ROWS.map((config) => {
    const rows = trades.filter((trade) => trade?.[config.field] === true);
    const closed = rows.filter((trade) => String(trade.status).toUpperCase() === 'CLOSED');
    const active = rows.filter((trade) => String(trade.status).toUpperCase() === 'OPEN');
    const pnl = (trade) => finite(trade.netPnl ?? trade.pnl, 0);
    const roe = (trade) => finite(trade.netRoe ?? trade.roe, 0);
    const wins = closed.filter((trade) => pnl(trade) > 0);
    const losses = closed.filter((trade) => pnl(trade) < 0);
    const grossWin = wins.reduce((sum, trade) => sum + pnl(trade), 0);
    const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + pnl(trade), 0));
    const byDay = new Map();
    for (const trade of closed) byDay.set(dayOf(trade), (byDay.get(dayOf(trade)) ?? 0) + pnl(trade));
    return {
      ...config,
      total: rows.length,
      active: active.length,
      pending: rows.length - closed.length - active.length,
      closed: closed.length,
      wins: wins.length,
      losses: losses.length,
      wr: closed.length ? (wins.length / closed.length) * 100 : null,
      avgRoe: closed.length ? closed.reduce((sum, trade) => sum + roe(trade), 0) / closed.length : null,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 9.99 : 0,
      realizedPnl: closed.reduce((sum, trade) => sum + pnl(trade), 0),
      unrealizedPnl: active.reduce((sum, trade) => sum + pnl(trade), 0),
      positiveDays: [...byDay.values()].filter((value) => value > 0).length,
      observedDays: byDay.size,
      snapshot: rows.filter((trade) => trade.liquidSpringReversalBasis === 'ENTRY_CLOSED_KLINES_SNAPSHOT').length,
      backfill: rows.filter((trade) => String(trade.liquidSpringReversalBasis ?? '').startsWith('DERIVED')).length,
    };
  });
}
