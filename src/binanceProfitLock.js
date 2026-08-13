export const BINANCE_PROFIT_LOCK_VERSION = 'BINANCE_PROFIT_LOCK_V12_LIFECYCLE_FAST_FAILSAFE_20260812';
export const LEGACY_TRAILING_STOP_DISABLED_VERSION = 'LEGACY_TSL_DISABLED_V1_20260809';
export const MANUAL_BINANCE_PROFIT_LOCK_TRIGGER_ROE = 10;
export const MANUAL_BINANCE_PROFIT_LOCK_FIRST_LOCK_ROE = 1;
export const ORDERS_EXCLUDED_PROFIT_LOCK_TRIGGER_ROE = 10;
export const ORDERS_EXCLUDED_PROFIT_LOCK_ROE = 1;

const finite = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function isLiquidFlowV2ProfitLockSource(...sources) {
  return sources.some((source) => String(source ?? '').trim().toLowerCase().includes('liquid-flow-v2'));
}

export function isManualBinanceProfitLockSource(...sources) {
  const normalized = sources
    .map((source) => String(source ?? '').trim().toLowerCase())
    .filter(Boolean);
  if (normalized.some((source) => source.includes('manual'))) return true;
  return normalized.length === 0;
}

export function matchesLiquidFlowV2ProfitLockTrade({
  symbol,
  side,
  entryPrice,
  openedAt,
  trades = [],
} = {}) {
  const normalizedSymbol = String(symbol ?? '').trim().toUpperCase();
  const normalizedSide = String(side ?? '').trim().toUpperCase();
  const entry = finite(entryPrice);
  const opened = finite(openedAt);
  if (!normalizedSymbol || !['LONG', 'SHORT'].includes(normalizedSide) || !(entry > 0) || !(opened > 0)) return false;
  return trades.some((trade) => {
    if (String(trade?.symbol ?? '').trim().toUpperCase() !== normalizedSymbol) return false;
    if (String(trade?.side ?? '').trim().toUpperCase() !== normalizedSide) return false;
    if (!['FILLED', 'MANUAL_LIMIT_SUBMITTED'].includes(String(trade?.binanceEntryState ?? ''))) return false;
    const filledAt = finite(trade?.binanceEntryFilledAt ?? trade?.binanceEntryRequestedAt);
    if (!(filledAt > 0) || Math.abs(opened - filledAt) > 5 * 60_000) return false;
    const v2Entry = finite(trade?.binanceEntryPrice ?? trade?.entryPrice);
    return v2Entry > 0 && Math.abs(entry - v2Entry) / v2Entry <= 0.05;
  });
}

export function matchesManualLiquidFlowV2ProfitLockTrade(context = {}) {
  const manualTrades = (context.trades ?? []).filter((trade) => (
    String(trade?.binanceEntryMode ?? '').toUpperCase().startsWith('MANUAL_')
  ));
  return matchesLiquidFlowV2ProfitLockTrade({ ...context, trades: manualTrades });
}

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

export function resolveManualBinanceProfitLockRoe(roe) {
  return resolveBinanceProfitLockRoe(roe, {
    triggerRoe: MANUAL_BINANCE_PROFIT_LOCK_TRIGGER_ROE,
    firstLockRoe: MANUAL_BINANCE_PROFIT_LOCK_FIRST_LOCK_ROE,
  });
}

export function resolveOrdersExcludedBinanceProfitLockRoe(roe) {
  const currentRoe = finite(roe);
  return currentRoe != null && currentRoe >= ORDERS_EXCLUDED_PROFIT_LOCK_TRIGGER_ROE
    ? ORDERS_EXCLUDED_PROFIT_LOCK_ROE
    : null;
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

export function binanceProfitLockLifecycleKey({
  symbol,
  side,
  entryPrice,
  openedAt = null,
} = {}) {
  const normalizedSymbol = String(symbol ?? '').trim().toUpperCase();
  const normalizedSide = String(side ?? '').trim().toUpperCase();
  const entry = finite(entryPrice);
  const opened = finite(openedAt);
  if (!normalizedSymbol || !['LONG', 'SHORT'].includes(normalizedSide) || !(entry > 0)) return null;
  // Entry is part of the key so a newly opened position cannot inherit the
  // in-memory lock of an older position on the same symbol. openedAt is kept
  // when available to also distinguish an exact-price reopen.
  return [
    normalizedSymbol,
    normalizedSide,
    entry.toPrecision(12),
    opened > 0 ? Math.trunc(opened) : '-',
  ].join('|');
}

export function isBinanceProfitLockImmediateTriggerError(error) {
  const code = Number(error?.code ?? error?.response?.data?.code);
  const message = String(
    error?.message
    ?? error?.msg
    ?? error?.response?.data?.msg
    ?? '',
  );
  return code === -2021 || /order would immediately trigger/i.test(message);
}

export function isBinanceProfitLockTargetBreached({
  side,
  markPrice,
  stopPrice,
} = {}) {
  const normalizedSide = String(side ?? '').trim().toUpperCase();
  const mark = finite(markPrice);
  const stop = finite(stopPrice);
  if (!['LONG', 'SHORT'].includes(normalizedSide) || !(mark > 0) || !(stop > 0)) return false;
  return normalizedSide === 'LONG' ? mark <= stop : mark >= stop;
}
