export const BINANCE_PROFIT_LOCK_VERSION = 'BINANCE_PROFIT_LOCK_V1_20260809';

const finite = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function resolveBinanceProfitLockRoe(
  roe,
  {
    triggerRoe = 5,
    firstLockRoe = 1,
  } = {},
) {
  const currentRoe = finite(roe);
  const trigger = finite(triggerRoe);
  const firstLock = finite(firstLockRoe);
  if (
    currentRoe == null
    || trigger == null
    || firstLock == null
    || !(trigger > 0)
    || firstLock < 0
    || currentRoe < trigger
  ) return null;
  if (currentRoe >= 15) {
    const steps = Math.floor((currentRoe - 15) / 5);
    return Math.max(firstLock, (15 + steps * 5) - 10);
  }
  return firstLock;
}

export function binanceProfitLockStopPrice({
  side,
  entryPrice,
  leverage,
  lockRoe,
} = {}) {
  const normalizedSide = String(side ?? '').toUpperCase();
  const entry = finite(entryPrice);
  const lev = finite(leverage);
  const lock = finite(lockRoe);
  if (!['LONG', 'SHORT'].includes(normalizedSide) || !(entry > 0) || !(lev > 0) || lock == null || lock < 0) return null;
  const distance = (lock / 100) / lev;
  const price = normalizedSide === 'LONG' ? entry * (1 + distance) : entry * (1 - distance);
  return Number.isFinite(price) && price > 0 ? price : null;
}
