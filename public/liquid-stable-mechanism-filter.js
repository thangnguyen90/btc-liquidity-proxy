export const LIQUID_STABLE_MECHANISM_FILTER_ALL = 'all';

export function normalizeLiquidStableMechanismFilter(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized && normalized !== 'ALL'
    ? normalized
    : LIQUID_STABLE_MECHANISM_FILTER_ALL;
}

export function matchesLiquidStableMechanismFilter(trade = {}, filter = LIQUID_STABLE_MECHANISM_FILTER_ALL) {
  const normalized = normalizeLiquidStableMechanismFilter(filter);
  if (normalized === LIQUID_STABLE_MECHANISM_FILTER_ALL) return true;
  if (trade?.liquidStableMechanismMatched !== true) return false;
  return String(trade?.liquidStableMechanismCode ?? '').trim().toUpperCase() === normalized;
}
