export const POST_MOVE_DUAL_DIRECTION_PROFIT_CLOSE_VERSION =
  'POST_MOVE_DUAL_DIRECTION_POSITIVE_PNL_CLOSE_V1_20260924';

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function activeKeys(snapshot = {}) {
  const keys = new Set();
  for (const frame of Array.isArray(snapshot?.timeframes) ? snapshot.timeframes : []) {
    const interval = String(frame?.interval ?? '').trim();
    if (!interval) continue;
    for (const item of Array.isArray(frame?.items) ? frame.items : []) {
      const symbol = String(item?.symbol ?? '').trim().toUpperCase();
      if (!symbol || item?.status === 'WEAKENED') continue;
      keys.add(`${interval}|${symbol}`);
    }
  }
  return keys;
}

export function collectPostMoveDualDirections(longSnapshot, shortSnapshot) {
  const longKeys = activeKeys(longSnapshot);
  const shortKeys = activeKeys(shortSnapshot);
  const rows = new Map();
  for (const key of longKeys) {
    if (!shortKeys.has(key)) continue;
    const separator = key.indexOf('|');
    const interval = key.slice(0, separator);
    const symbol = key.slice(separator + 1);
    const current = rows.get(symbol) ?? { symbol, intervals: [] };
    current.intervals.push(interval);
    rows.set(symbol, current);
  }
  for (const row of rows.values()) row.intervals.sort();
  return rows;
}

export function postMovePositionPnl(position = {}, markPrice = null) {
  const amount = finite(position?.positionAmt ?? position?.amt, 0);
  const entry = finite(position?.entryPrice ?? position?.entry);
  const mark = finite(markPrice, finite(position?.markPrice ?? position?.mark));
  if (amount && entry > 0 && mark > 0) return (mark - entry) * amount;
  return finite(position?.unRealizedProfit ?? position?.unrealizedProfit);
}

export function evaluatePostMoveDualDirectionPosition({ dualDirections, position, markPrice = null } = {}) {
  const symbol = String(position?.symbol ?? '').trim().toUpperCase();
  const amount = finite(position?.positionAmt ?? position?.amt, 0);
  const match = dualDirections instanceof Map ? dualDirections.get(symbol) : null;
  const pnlUsdt = postMovePositionPnl(position, markPrice);
  if (!match || !amount) return { action: 'IGNORE', symbol, pnlUsdt, intervals: [] };
  if (pnlUsdt == null) return { action: 'WAIT_PNL', symbol, pnlUsdt: null, intervals: match.intervals };
  return {
    action: pnlUsdt > 0 ? 'CLOSE_MARKET' : 'HOLD_NON_POSITIVE',
    symbol,
    pnlUsdt,
    intervals: match.intervals,
    positionDirection: amount > 0 ? 'LONG' : 'SHORT',
  };
}
