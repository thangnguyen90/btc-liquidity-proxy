export const LIVE_CARD_HISTORY_STREAM_VERSION = 'LIVE_CARD_HISTORY_TOTAL_PNL_V2_20260811';

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

function positionTickOf(positionTicks, symbol) {
  const normalized = String(symbol ?? '').toUpperCase();
  if (!normalized) return null;
  if (positionTicks instanceof Map) return positionTicks.get(normalized) ?? null;
  if (Array.isArray(positionTicks)) {
    return positionTicks.find((tick) => String(tick?.symbol ?? '').toUpperCase() === normalized) ?? null;
  }
  return positionTicks?.[normalized] ?? null;
}

export function calculateLiveCardHistoryPnlTotals(executions = [], positionTicks = new Map()) {
  const totals = {
    closedNet: 0,
    closedKnown: 0,
    closedMissing: 0,
    openUnrealized: 0,
    openKnown: 0,
    openMissing: 0,
    totalPnl: 0,
  };
  for (const row of Array.isArray(executions) ? executions : []) {
    if (!row?.entryFilledAt) continue;
    const status = String(row.status ?? '').toUpperCase();
    if (status === 'POSITION_CLOSED') {
      const net = Number(row.closedPnlNet);
      if (row.closedPnlKnown === true && Number.isFinite(net)) {
        totals.closedNet += net;
        totals.closedKnown += 1;
      } else {
        totals.closedMissing += 1;
      }
      continue;
    }
    if (!isLiveCardExecutionOpen(row)) continue;
    const tick = positionTickOf(positionTicks, row.symbol);
    const positionAmt = Number(tick?.positionAmt);
    const side = String(row.side ?? '').toUpperCase();
    const sideMatches = (side === 'LONG' && positionAmt > 0) || (side === 'SHORT' && positionAmt < 0);
    const live = sideMatches ? calculateLiveCardOpenPnl({
      side,
      entryPrice: row.fillPrice,
      markPrice: tick?.markPrice,
      quantity: Math.abs(Number(row.filledQty ?? row.submittedQty ?? 0)),
      marginUsdt: row.marginUsdt,
      leverage: row.leverage,
    }) : null;
    if (live) {
      totals.openUnrealized += live.pnl;
      totals.openKnown += 1;
    } else {
      totals.openMissing += 1;
    }
  }
  totals.totalPnl = totals.closedNet + totals.openUnrealized;
  return totals;
}
