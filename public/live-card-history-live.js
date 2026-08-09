export const LIVE_CARD_HISTORY_STREAM_VERSION = 'LIVE_CARD_HISTORY_STREAM_V1_20260809';

const CLOSED_STATUSES = new Set([
  'POSITION_CLOSED',
  'ENTRY_FAILED',
  'ENTRY_NOT_SUBMITTED',
]);

export function isLiveCardExecutionOpen(row = {}) {
  return Boolean(row?.entryFilledAt) && !CLOSED_STATUSES.has(String(row?.status ?? '').toUpperCase());
}

export function calculateLiveCardOpenPnl({
  side,
  entryPrice,
  markPrice,
  quantity,
  marginUsdt,
  leverage,
} = {}) {
  const normalizedSide = String(side ?? '').toUpperCase();
  const entry = Number(entryPrice);
  const mark = Number(markPrice);
  const qty = Math.abs(Number(quantity));
  if (!['LONG', 'SHORT'].includes(normalizedSide) || !(entry > 0) || !(mark > 0) || !(qty > 0)) return null;
  const pnl = normalizedSide === 'LONG' ? (mark - entry) * qty : (entry - mark) * qty;
  const configuredMargin = Number(marginUsdt);
  const lev = Math.max(1, Number(leverage) || 1);
  const margin = configuredMargin > 0 ? configuredMargin : qty * entry / lev;
  return {
    pnl,
    roe: margin > 0 ? pnl / margin * 100 : null,
    margin,
  };
}
