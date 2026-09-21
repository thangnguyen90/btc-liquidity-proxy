export const OTHER_ENTRY_SETTINGS_VERSION =
  'OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V5_COIN_LEVEL_RETEST_20260920';

const profile = ({ source, streamId, signalLabel, side, marginUsdt, leverage,
  takeProfitRoePct = null, takeProfitMode = 'FIXED_ROE' }) => Object.freeze({
  source, streamId, signalLabel, side, marginUsdt, leverage,
  takeProfitRoePct, takeProfitMode,
});

export const OTHER_ENTRY_CATALOG = Object.freeze([
  profile({ source: 'liqscan-main-kill-sweep', streamId: 'background-top400',
    signalLabel: 'LIQSCAN_MAIN_KILL_UPPER_SWEEP_SHORT', side: 'SHORT', marginUsdt: 1, leverage: 5,
    takeProfitRoePct: 10 }),
  profile({ source: 'liqscan-main-kill-sweep', streamId: 'background-top400',
    signalLabel: 'LIQSCAN_MAIN_KILL_LOWER_SWEEP_LONG', side: 'LONG', marginUsdt: 1, leverage: 5,
    takeProfitRoePct: 10 }),
  profile({ source: 'coin-level-entry-watch', streamId: 'closed-mtf-retest',
    signalLabel: 'RETEST_LONG_READY', side: 'LONG', marginUsdt: 1, leverage: 5,
    takeProfitRoePct: 10 }),
  profile({ source: 'coin-level-entry-watch', streamId: 'closed-mtf-retest',
    signalLabel: 'RETEST_SHORT_READY', side: 'SHORT', marginUsdt: 1, leverage: 5,
    takeProfitRoePct: 10 }),
  profile({ source: 'liqscan-high-score', streamId: 'coin-level-analysis',
    signalLabel: 'LIQSCAN_HIGH_SCORE_ABOVE_LONG', side: 'LONG', marginUsdt: 5, leverage: 5,
    takeProfitRoePct: 15 }),
  profile({ source: 'liqscan-high-score', streamId: 'coin-level-analysis',
    signalLabel: 'LIQSCAN_HIGH_SCORE_BELOW_SHORT', side: 'SHORT', marginUsdt: 5, leverage: 5,
    takeProfitRoePct: 15 }),
  profile({ source: 'big-candle-pump-15m', streamId: 'volume-dump-scanner',
    signalLabel: 'BIG_CANDLE_PUMP_LONG', side: 'LONG', marginUsdt: 10, leverage: 5,
    takeProfitRoePct: 15 }),
  profile({ source: 'extreme-short-squeeze', streamId: 'extreme-short-squeeze',
    signalLabel: 'EXTREME_PUMP_CLOSED', side: 'SHORT', marginUsdt: 1, leverage: 5,
    takeProfitRoePct: 15 }),
  profile({ source: 'extreme-short-squeeze', streamId: 'extreme-short-squeeze',
    signalLabel: 'FOLLOW_REJECTION_LIVE', side: 'SHORT', marginUsdt: 1, leverage: 5,
    takeProfitRoePct: 15 }),
  profile({ source: 'extreme-short-squeeze', streamId: 'extreme-short-squeeze',
    signalLabel: 'PEAK_ZONE_SHORT_WATCH', side: 'SHORT', marginUsdt: 2, leverage: 5,
    takeProfitRoePct: 15 }),
  profile({ source: 'htf-deep-base-ready', streamId: 'htf-deep-base-15m',
    signalLabel: 'RETEST_LONG_READY', side: 'LONG', marginUsdt: 5, leverage: 5,
    takeProfitRoePct: 15 }),
  profile({ source: 'htf-deep-base-ready', streamId: 'htf-deep-base-15m',
    signalLabel: 'RETEST_SHORT_READY', side: 'SHORT', marginUsdt: 5, leverage: 5,
    takeProfitRoePct: 15 }),
  ...['primary', 'secondary'].flatMap((streamId) => [
    profile({ source: 'coinglass-hybrid-liquidity', streamId,
      signalLabel: 'HYBRID_UPPER_FIRST_SHORT_SQUEEZE_READY', side: 'LONG',
      marginUsdt: 1, leverage: 5, takeProfitRoePct: 10 }),
    profile({ source: 'coinglass-hybrid-liquidity', streamId,
      signalLabel: 'HYBRID_LOWER_FIRST_LONG_FLUSH_READY', side: 'SHORT',
      marginUsdt: 1, leverage: 5, takeProfitRoePct: 10 }),
  ]),
  profile({ source: 'coin-horizon-sweep-transition', streamId: 'coin-horizon-4h8h12h',
    signalLabel: 'UPPER', side: 'LONG', marginUsdt: 5, leverage: 5,
    takeProfitMode: 'DYNAMIC_LIQUIDITY_TARGET' }),
  profile({ source: 'coin-horizon-sweep-transition', streamId: 'coin-horizon-4h8h12h',
    signalLabel: 'LOWER', side: 'SHORT', marginUsdt: 5, leverage: 5,
    takeProfitMode: 'DYNAMIC_LIQUIDITY_TARGET' }),
]);

const normalizedSide = (side) => ['BUY', 'LONG'].includes(side)
  ? 'LONG' : ['SELL', 'SHORT'].includes(side) ? 'SHORT' : String(side ?? '');

export function otherRouteMeta(route = {}) {
  const source = route.source;
  const streamId = route.streamId ?? route.stream;
  const signalLabel = route.signalLabel ?? route.label;
  const side = normalizedSide(route.side);
  return OTHER_ENTRY_CATALOG.find((item) => item.source === source
    && item.streamId === streamId && item.signalLabel === signalLabel && item.side === side) ?? null;
}

export function validOtherMargin(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 100
    && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
}

export function validOtherLeverage(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 125;
}

export function validOtherTakeProfitRoe(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 100
    && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
}

export function resolveOtherEntrySettings(route = {}, saved = {}) {
  const meta = otherRouteMeta(route);
  if (!meta) return null;
  const marginUsdt = saved.marginUsdt === undefined ? meta.marginUsdt : saved.marginUsdt;
  const leverage = saved.leverage === undefined ? meta.leverage : saved.leverage;
  const takeProfitRoePct = meta.takeProfitMode === 'FIXED_ROE'
    ? (saved.takeProfitRoePct === undefined ? meta.takeProfitRoePct : saved.takeProfitRoePct)
    : null;
  if (!validOtherMargin(marginUsdt) || !validOtherLeverage(leverage)
    || (meta.takeProfitMode === 'FIXED_ROE' && !validOtherTakeProfitRoe(takeProfitRoePct))) return null;
  return {
    marginUsdt, leverage, takeProfitRoePct,
    takeProfitMode: meta.takeProfitMode,
    takeProfitEditable: meta.takeProfitMode === 'FIXED_ROE',
  };
}

export function validOtherOrderSize(payload = {}) {
  if (!otherRouteMeta(payload) || !validOtherMargin(payload.marginUsdt)
    || !validOtherLeverage(payload.leverage) || !Number.isFinite(Number(payload.notionalUsdt))) return false;
  return Math.abs(Number(payload.notionalUsdt) - payload.marginUsdt * payload.leverage) < 1e-8;
}
