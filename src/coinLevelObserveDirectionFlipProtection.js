export const COIN_LEVEL_OBSERVE_DIRECTION_FLIP_PROTECTION_VERSION =
  'COIN_LEVEL_OBSERVE_DIRECTION_FLIP_PROTECTION_V1_20260922';

export const COIN_LEVEL_OBSERVE_DIRECTION_CARRY_MS = 30 * 60_000;

const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeDirection = (value) => {
  const direction = String(value ?? '').toUpperCase();
  return direction === 'LONG' || direction === 'SHORT' ? direction : null;
};

function activeDirections(snapshot = {}) {
  const bySymbol = new Map();
  for (const [direction, rows] of [
    ['LONG', snapshot.earlyLongWatches],
    ['SHORT', snapshot.earlyShortWatches],
  ]) {
    for (const row of Array.isArray(rows) ? rows : []) {
      const symbol = String(row?.symbol ?? '').toUpperCase();
      if (!symbol || row?.watchOnly !== true) continue;
      const current = bySymbol.get(symbol);
      if (current && current.direction !== direction) {
        bySymbol.set(symbol, { symbol, direction: 'AMBIGUOUS', observedAt: null });
        continue;
      }
      bySymbol.set(symbol, {
        symbol,
        direction,
        observedAt: finite(row?.observedAt),
        watch: row,
      });
    }
  }
  return bySymbol;
}

export class CoinLevelObserveDirectionFlipTracker {
  constructor({ carryMs = COIN_LEVEL_OBSERVE_DIRECTION_CARRY_MS } = {}) {
    this.carryMs = Math.max(5 * 60_000, finite(carryMs, COIN_LEVEL_OBSERVE_DIRECTION_CARRY_MS));
    this.state = new Map();
  }

  observe(snapshot = {}, at = Date.now()) {
    const now = finite(at, Date.now());
    const current = activeDirections(snapshot);
    const flips = [];

    for (const [symbol, row] of current) {
      if (!normalizeDirection(row.direction)) continue;
      const previous = this.state.get(symbol);
      if (previous
        && previous.direction !== row.direction
        && now - previous.lastSeenAt <= this.carryMs) {
        const observedAt = finite(row.observedAt, now);
        flips.push({
          version: COIN_LEVEL_OBSERVE_DIRECTION_FLIP_PROTECTION_VERSION,
          id: `${symbol}:${previous.direction}:${row.direction}:${observedAt}`,
          symbol,
          fromDirection: previous.direction,
          toDirection: row.direction,
          previousObservedAt: previous.observedAt,
          observedAt,
          detectedAt: now,
          watch: row.watch,
        });
      }
      this.state.set(symbol, {
        direction: row.direction,
        observedAt: finite(row.observedAt, now),
        lastSeenAt: now,
      });
    }

    for (const [symbol, row] of this.state) {
      if (now - row.lastSeenAt > this.carryMs) this.state.delete(symbol);
    }
    return flips;
  }
}

export function positionDirection(position = {}) {
  const amount = finite(position.positionAmt ?? position.amt, 0);
  if (amount > 0) return 'LONG';
  if (amount < 0) return 'SHORT';
  return null;
}

export function unrealizedPositionPnl(position = {}) {
  const direct = finite(position.unRealizedProfit ?? position.unrealizedProfit);
  if (direct != null) return direct;
  const amount = finite(position.positionAmt ?? position.amt, 0);
  const entry = finite(position.entryPrice ?? position.entry);
  const mark = finite(position.markPrice ?? position.mark);
  if (!amount || !(entry > 0) || !(mark > 0)) return null;
  return (mark - entry) * amount;
}

export function evaluateCoinLevelObserveFlipPosition({ flip, position } = {}) {
  const fromDirection = normalizeDirection(flip?.fromDirection);
  const toDirection = normalizeDirection(flip?.toDirection);
  const direction = positionDirection(position);
  if (!fromDirection || !toDirection || fromDirection === toDirection || direction !== fromDirection) {
    return { action: 'IGNORE', direction, pnlUsdt: unrealizedPositionPnl(position) };
  }
  const pnlUsdt = unrealizedPositionPnl(position);
  if (pnlUsdt == null) return { action: 'WAIT_PNL', direction, pnlUsdt: null };
  return {
    action: pnlUsdt > 0 ? 'CLOSE_MARKET' : 'MOVE_TP_TO_ENTRY',
    direction,
    pnlUsdt,
  };
}

export function isEntryOrderAgainstCoinLevelFlip(order = {}, flip = {}) {
  const fromDirection = normalizeDirection(flip?.fromDirection);
  const symbol = String(order?.symbol ?? '').toUpperCase();
  if (!fromDirection || symbol !== String(flip?.symbol ?? '').toUpperCase()) return false;
  if (order?.reduceOnly === true || order?.reduceOnly === 'true'
    || order?.closePosition === true || order?.closePosition === 'true') return false;
  const type = String(order?.origType ?? order?.type ?? '').toUpperCase();
  if (type.includes('STOP') || type.includes('TAKE_PROFIT')) return false;
  const side = String(order?.side ?? '').toUpperCase();
  return side === (fromDirection === 'LONG' ? 'BUY' : 'SELL');
}
