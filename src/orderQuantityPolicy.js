export const MIN_NOTIONAL_CEIL_POLICY_VERSION = 'MIN_NOTIONAL_CEIL_PRE_EMA99_V1_20260810';

export function ceilQuantityAtMinimumNotional({
  steppedQuantity,
  stepSize,
  markPrice,
  requestedNotional,
  minimumNotional,
  enabled = false,
  maxOvershootPct = 1,
} = {}) {
  const currentQuantity = Number(steppedQuantity);
  const step = Number(stepSize);
  const price = Number(markPrice);
  const requested = Number(requestedNotional);
  const minimum = Number(minimumNotional);
  if (![currentQuantity, step, price, requested, minimum].every(Number.isFinite)
      || step <= 0 || price <= 0 || requested <= 0 || minimum <= 0) return null;
  if (currentQuantity * price >= minimum) return currentQuantity;
  if (!enabled || requested < minimum) return null;
  const ceilingQuantity = Math.ceil((minimum / price) / step) * step;
  const ceilingNotional = ceilingQuantity * price;
  return ceilingNotional <= requested * (1 + Number(maxOvershootPct) / 100)
    ? ceilingQuantity
    : null;
}
