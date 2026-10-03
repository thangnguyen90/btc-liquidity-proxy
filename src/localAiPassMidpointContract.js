export const LOCAL_AI_PASS_MIDPOINT_ENTRY_VERSION =
  'LOCAL_AI_PRIORITY_ENGINE_ZONE_ENTRY_V2_MARKET_1USDT_20261003';

export const LOCAL_AI_PASS_MIDPOINT_SOURCE = 'local-ai-trend-evaluation';
export const LOCAL_AI_PASS_MIDPOINT_STREAM = 'priority-engine-zone';
export const LOCAL_AI_PASS_MIDPOINT_SIGNAL_LABEL = 'LOCAL_AI_PRIORITY_ENGINE_ZONE_TOUCH';
export const LOCAL_AI_PASS_MIDPOINT_SIGNAL_STAGE = 'AI_PRIORITY_ENGINE_ZONE_TOUCH';

export const LOCAL_AI_PASS_MIDPOINT_MARGIN_USDT = 1;
export const LOCAL_AI_PASS_MIDPOINT_LEVERAGE = 5;
export const LOCAL_AI_PASS_MIDPOINT_TAKE_PROFIT_ROE_PCT = 10;
export const LOCAL_AI_PASS_MIDPOINT_MAX_OPEN_POSITIONS = 50;
export const LOCAL_AI_PASS_MIDPOINT_MAX_SIGNAL_AGE_MS = 15 * 60_000;
export const LOCAL_AI_PASS_MIDPOINT_TOUCH_TOLERANCE_PCT = 0.02;
export const LOCAL_AI_PASS_MIDPOINT_FALLBACK_STOP_LOSS_ROE_PCT = 20;
export const LOCAL_AI_PASS_MIDPOINT_MAX_STRUCTURAL_SL_ROE_PCT = 50;

export const LOCAL_AI_PASS_MIDPOINT_ROUTES = Object.freeze([
  Object.freeze({
    source: LOCAL_AI_PASS_MIDPOINT_SOURCE,
    streamId: LOCAL_AI_PASS_MIDPOINT_STREAM,
    signalLabel: LOCAL_AI_PASS_MIDPOINT_SIGNAL_LABEL,
    side: 'LONG',
  }),
  Object.freeze({
    source: LOCAL_AI_PASS_MIDPOINT_SOURCE,
    streamId: LOCAL_AI_PASS_MIDPOINT_STREAM,
    signalLabel: LOCAL_AI_PASS_MIDPOINT_SIGNAL_LABEL,
    side: 'SHORT',
  }),
]);

export function localAiPassMidpointRoute(side) {
  const normalized = ['BUY', 'LONG'].includes(side)
    ? 'LONG' : ['SELL', 'SHORT'].includes(side) ? 'SHORT' : '';
  return LOCAL_AI_PASS_MIDPOINT_ROUTES.find((route) => route.side === normalized) ?? null;
}
