import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { COIN_LEVEL_ENTRY_WATCH_VERSION } from './coinLevelEntryWatch.js';
import { resolveOtherEntrySettings } from './otherEntryCatalog.js';

export const COIN_LEVEL_ENTRY_WATCH_BINANCE_VERSION =
  'COIN_LEVEL_ENTRY_WATCH_LIMIT_3USDT_V4_MARKET_REGIME_20260922';
export const COIN_LEVEL_ENTRY_WATCH_MAX_AGE_MS = 90_000;
export const COIN_LEVEL_ENTRY_WATCH_MAX_MARK_DRIFT = 0.005;
export const COIN_LEVEL_ENTRY_WATCH_LIMIT_MARGIN_USDT = 3;
export const COIN_LEVEL_ENTRY_WATCH_LIMIT_MIN_GAP = 0.0015;
export const COIN_LEVEL_ENTRY_WATCH_LIMIT_MAX_GAP = 0.05;
export const COIN_LEVEL_ENTRY_WATCH_LIMIT_MAX_AGE_MS = 45 * 60_000;
export const COIN_LEVEL_ENTRY_WATCH_SYMBOL_COOLDOWN_MS = 4 * 60 * 60_000;
export const COIN_LEVEL_ENTRY_WATCH_STOP_LOSS_ROE_PCT = 30;
export const COIN_LEVEL_ENTRY_WATCH_ROUTES = Object.freeze([
  Object.freeze({
    source: 'coin-level-entry-watch',
    streamId: 'closed-mtf-retest',
    signalLabel: 'RETEST_LONG_READY',
    side: 'LONG',
  }),
  Object.freeze({
    source: 'coin-level-entry-watch',
    streamId: 'closed-mtf-retest',
    signalLabel: 'RETEST_SHORT_READY',
    side: 'SHORT',
  }),
]);

const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const epoch = (value) => {
  const numeric = finite(value);
  if (numeric != null) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function coinLevelEntryWatchRoute(candidate = {}) {
  if (candidate.version !== COIN_LEVEL_ENTRY_WATCH_VERSION
    || candidate.entryBasis !== 'RETEST_LEVEL_0_15_PCT'
    || !['LONG', 'SHORT'].includes(candidate.side)
    || !(finite(candidate.retestAt, 0) > 0)
    || (candidate.side === 'LONG' && finite(candidate.score, -Infinity) < 12)
    || (candidate.side === 'SHORT' && finite(candidate.score, Infinity) > -12)) return null;
  return COIN_LEVEL_ENTRY_WATCH_ROUTES.find((route) => route.side === candidate.side) ?? null;
}

function coinLevelSignalRoute(candidate = {}) {
  if (candidate.version !== COIN_LEVEL_ENTRY_WATCH_VERSION
    || candidate.entryBasis !== 'RETEST_LEVEL_0_15_PCT'
    || !['LONG', 'SHORT'].includes(candidate.side)
    || (candidate.side === 'LONG' && finite(candidate.score, -Infinity) < 12)
    || (candidate.side === 'SHORT' && finite(candidate.score, Infinity) > -12)) return null;
  return COIN_LEVEL_ENTRY_WATCH_ROUTES.find((route) => route.side === candidate.side) ?? null;
}

export function buildCoinLevelEntryWatchLimitOrder(candidate = {}, {
  now = Date.now(), enabledAt, startedAt, markPrice, routeState,
} = {}) {
  if (epoch(candidate.retestAt) > 0) return null;
  const route = coinLevelSignalRoute(candidate);
  if (!route) return null;
  const settings = resolveOtherEntrySettings(route, routeState);
  if (!settings) return null;
  const confirmationAt = epoch(candidate.confirmationAt);
  const enabledAtMs = epoch(enabledAt);
  const startedAtMs = epoch(startedAt);
  const lastClosed5mAt = epoch(candidate.lastClosed5mAt);
  const lastClosed5m = finite(candidate.lastClosed5m);
  const entry = finite(candidate.entryPrice);
  const mark = finite(markPrice);
  const reference = finite(candidate.referenceLevel);
  const zoneLow = finite(candidate.entryZone?.low);
  const zoneHigh = finite(candidate.entryZone?.high);
  if (![confirmationAt, enabledAtMs, startedAtMs, lastClosed5mAt, lastClosed5m,
    entry, mark, reference, zoneLow, zoneHigh].every(Number.isFinite)
    || confirmationAt < enabledAtMs
    || confirmationAt < startedAtMs
    || confirmationAt > now
    || now - confirmationAt > COIN_LEVEL_ENTRY_WATCH_MAX_AGE_MS
    || lastClosed5mAt < confirmationAt
    || entry <= 0 || mark <= 0 || reference <= 0
    || zoneLow <= 0 || zoneHigh < zoneLow || entry < zoneLow || entry > zoneHigh) return null;
  const isLong = route.side === 'LONG';
  const gap = isLong ? mark / entry - 1 : 1 - mark / entry;
  const closedGap = isLong ? lastClosed5m / entry - 1 : 1 - lastClosed5m / entry;
  if (gap < COIN_LEVEL_ENTRY_WATCH_LIMIT_MIN_GAP
    || gap > COIN_LEVEL_ENTRY_WATCH_LIMIT_MAX_GAP
    || closedGap < COIN_LEVEL_ENTRY_WATCH_LIMIT_MIN_GAP
    || (isLong ? lastClosed5m < reference : lastClosed5m > reference)) return null;
  const { leverage, takeProfitRoePct } = settings;
  const marginUsdt = COIN_LEVEL_ENTRY_WATCH_LIMIT_MARGIN_USDT;
  const stopLossRoePct = COIN_LEVEL_ENTRY_WATCH_STOP_LOSS_ROE_PCT;
  const takeProfitDistanceFraction = (takeProfitRoePct / 100) / leverage;
  const stopLossDistanceFraction = (stopLossRoePct / 100) / leverage;
  const takeProfitPrice = entry * (isLong ? 1 + takeProfitDistanceFraction : 1 - takeProfitDistanceFraction);
  const stopLossPrice = entry * (isLong ? 1 - stopLossDistanceFraction : 1 + stopLossDistanceFraction);
  const key = `${candidate.symbol}|${route.side}|${confirmationAt}|PRE_RETEST_LIMIT`;
  return {
    source: route.source, streamId: route.streamId, signalLabel: route.signalLabel,
    signalType: route.signalLabel, signalInterval: '5m', executionPage: 'binance-auto-controls',
    side: isLong ? 'BUY' : 'SELL', symbol: candidate.symbol, orderType: 'LIMIT',
    limitPrice: entry, marginUsdt, notionalUsdt: marginUsdt * leverage, leverage,
    signalEntryPrice: entry, entryExpiresAt: confirmationAt + COIN_LEVEL_ENTRY_WATCH_MAX_AGE_MS,
    takeProfitPrice, stopLossPrice, takeProfitRoePct, stopLossRoePct,
    protectionOnFill: true, preserveSignalProtection: true, fillAnchorEnabled: true,
    fillAnchorVersion: COIN_LEVEL_ENTRY_WATCH_BINANCE_VERSION,
    takeProfitDistanceFraction, stopLossDistanceFraction,
    protectionSignalEntryPrice: entry, protectionSignalTakeProfitPrice: takeProfitPrice,
    protectionSignalStopLossPrice: stopLossPrice,
    allowMinNotionalCeil: true, dryRun: false, maxOpenPositions: 30,
    clientOrderId: `clel_${createHash('sha256').update(key).digest('hex').slice(0, 24)}`,
    signalCombo: `5m+15m+1h+4h|${route.signalLabel}`,
    signalReason: [COIN_LEVEL_ENTRY_WATCH_BINANCE_VERSION, 'PRE_RETEST_LIMIT',
      `score=${finite(candidate.score)}`, `confirmationAt=${new Date(confirmationAt).toISOString()}`,
      `referenceLevel=${reference}`, `expectedEntry=${entry}`, `markAtSubmit=${mark}`].join(' | '),
  };
}

export function buildCoinLevelEntryWatchOrder(candidate = {}, {
  now = Date.now(), enabledAt, markPrice, routeState,
} = {}) {
  const route = coinLevelEntryWatchRoute(candidate);
  if (!route) return null;
  const settings = resolveOtherEntrySettings(route, routeState);
  if (!settings) return null;
  const confirmationAt = epoch(candidate.confirmationAt);
  const retestAt = epoch(candidate.retestAt);
  const lastClosed5mAt = epoch(candidate.lastClosed5mAt);
  const enabledAtMs = epoch(enabledAt);
  const entry = finite(candidate.entryPrice);
  const mark = finite(markPrice);
  const zoneLow = finite(candidate.entryZone?.low);
  const zoneHigh = finite(candidate.entryZone?.high);
  const lastClosed5m = finite(candidate.lastClosed5m);
  const correctSide = candidate.side === 'LONG'
    ? lastClosed5m >= finite(candidate.referenceLevel, Infinity)
    : lastClosed5m <= finite(candidate.referenceLevel, -Infinity);
  if (![confirmationAt, retestAt, lastClosed5mAt, enabledAtMs, entry, mark,
    zoneLow, zoneHigh, lastClosed5m].every(Number.isFinite)
    || confirmationAt > retestAt
    || retestAt < enabledAtMs
    || lastClosed5mAt < retestAt
    || retestAt > now
    || now - retestAt > COIN_LEVEL_ENTRY_WATCH_MAX_AGE_MS
    || entry <= 0
    || mark <= 0
    || zoneLow <= 0
    || zoneHigh < zoneLow
    || entry < zoneLow
    || entry > zoneHigh
    || !correctSide
    || Math.abs(mark / entry - 1) > COIN_LEVEL_ENTRY_WATCH_MAX_MARK_DRIFT) return null;

  const isLong = route.side === 'LONG';
  const { marginUsdt, leverage, takeProfitRoePct } = settings;
  const stopLossRoePct = COIN_LEVEL_ENTRY_WATCH_STOP_LOSS_ROE_PCT;
  const takeProfitDistanceFraction = (takeProfitRoePct / 100) / leverage;
  const stopLossDistanceFraction = (stopLossRoePct / 100) / leverage;
  const takeProfitPrice = mark * (isLong
    ? 1 + takeProfitDistanceFraction
    : 1 - takeProfitDistanceFraction);
  const stopLossPrice = mark * (isLong
    ? 1 - stopLossDistanceFraction
    : 1 + stopLossDistanceFraction);
  const key = `${candidate.symbol}|${route.side}|${confirmationAt}|${retestAt}`;
  return {
    source: route.source,
    streamId: route.streamId,
    signalLabel: route.signalLabel,
    signalType: route.signalLabel,
    signalInterval: '5m',
    executionPage: 'binance-auto-controls',
    side: isLong ? 'BUY' : 'SELL',
    symbol: candidate.symbol,
    orderType: 'MARKET',
    marginUsdt,
    notionalUsdt: marginUsdt * leverage,
    leverage,
    signalEntryPrice: mark,
    entryExpiresAt: retestAt + COIN_LEVEL_ENTRY_WATCH_MAX_AGE_MS,
    takeProfitPrice,
    stopLossPrice,
    takeProfitRoePct,
    stopLossRoePct,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: COIN_LEVEL_ENTRY_WATCH_BINANCE_VERSION,
    takeProfitDistanceFraction,
    stopLossDistanceFraction,
    protectionSignalEntryPrice: mark,
    protectionSignalTakeProfitPrice: takeProfitPrice,
    protectionSignalStopLossPrice: stopLossPrice,
    allowMinNotionalCeil: true,
    dryRun: false,
    maxOpenPositions: 30,
    clientOrderId: `clew_${createHash('sha256').update(key).digest('hex').slice(0, 24)}`,
    signalCombo: `5m+15m+1h+4h|${route.signalLabel}`,
    signalReason: [
      COIN_LEVEL_ENTRY_WATCH_BINANCE_VERSION,
      `score=${finite(candidate.score)}`,
      `confirmationAt=${new Date(confirmationAt).toISOString()}`,
      `retestAt=${new Date(retestAt).toISOString()}`,
      `referenceLevel=${finite(candidate.referenceLevel)}`,
      `entryZone=${zoneLow}-${zoneHigh}`,
      `expectedEntry=${entry}`,
      `marketReference=${mark}`,
    ].join(' | '),
  };
}

function readState(file) {
  try {
    const state = JSON.parse(readFileSync(file, 'utf8'));
    if (!state?.attempts || !state?.symbols) throw new Error('invalid');
    return state;
  } catch (error) {
    if (error.code !== 'ENOENT') return null;
    return { version: COIN_LEVEL_ENTRY_WATCH_BINANCE_VERSION, attempts: {}, symbols: {} };
  }
}

function saveState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify({
    ...state,
    version: COIN_LEVEL_ENTRY_WATCH_BINANCE_VERSION,
    updatedAt: new Date().toISOString(),
  }, null, 2));
  renameSync(`${file}.tmp`, file);
}

export class CoinLevelEntryWatchBinanceRunner {
  constructor({ file, controls, now = () => Date.now(), getContext, getMarketRegime = null,
    submit, limitStartedAt = now() }) {
    Object.assign(this, { file, controls, now, getContext, getMarketRegime, submit });
    this.limitStartedAt = limitStartedAt;
    this.queue = Promise.resolve();
  }

  handle(candidate) {
    const task = this.queue.then(() => this.handleOne(candidate));
    this.queue = task.catch(() => {});
    return task;
  }

  pendingLimitSignal(order) {
    const clientOrderId = String(order?.clientOrderId ?? '');
    if (!/^clel_[0-9a-f]{24}$/.test(clientOrderId)) return null;
    const attempt = readState(this.file)?.attempts?.[clientOrderId];
    if (!attempt || attempt.orderType !== 'LIMIT'
      || attempt.symbol !== order?.symbol
      || !['LONG', 'SHORT'].includes(attempt.direction)
      || (attempt.direction === 'LONG' ? order?.side !== 'BUY' : order?.side !== 'SELL')
      || (attempt.orderId != null && order?.orderId != null
        && String(attempt.orderId) !== String(order.orderId))
      || !(finite(attempt.confirmationAt) > 0)
      || !(finite(attempt.referenceLevel) > 0)
      || !(finite(attempt.at) > 0)) return null;
    return {
      symbol: attempt.symbol, side: attempt.direction,
      confirmationAt: attempt.confirmationAt,
      referenceLevel: attempt.referenceLevel,
      submittedAt: attempt.at,
    };
  }

  markLimitInvalidated(clientOrderId, reason) {
    const state = readState(this.file);
    const attempt = state?.attempts?.[clientOrderId];
    if (!attempt || attempt.orderType !== 'LIMIT') return false;
    attempt.status = 'CANCELLED_SIGNAL_INVALID';
    attempt.cancelReason = String(reason ?? '').slice(0, 100);
    attempt.cancelledAt = this.now();
    saveState(this.file, state);
    return true;
  }

  async handleOne(candidate) {
    const isLimit = !(epoch(candidate.retestAt) > 0);
    const routeSpec = isLimit ? coinLevelSignalRoute(candidate) : coinLevelEntryWatchRoute(candidate);
    if (!routeSpec) return { status: 'waiting-closed-5m-retest' };
    const registered = this.controls.register(routeSpec);
    const controls = this.controls.read();
    const routeState = controls.routes[registered.key];
    if (!controls.enabled || routeState?.enabled !== true) return { status: 'off' };
    let marketRegime = routeSpec.side === 'LONG' && typeof this.getMarketRegime === 'function'
      ? this.getMarketRegime()
      : null;
    if (routeSpec.side === 'LONG' && marketRegime && marketRegime.allowLongEntry !== true) {
      return {
        status: 'market-regime-blocked',
        marketRegime: marketRegime.state ?? 'WAIT_DATA',
        reason: marketRegime.reasons?.[0] ?? 'Coin Level LONG market-regime guard is not RISK_ON.',
      };
    }
    const buildPlan = isLimit ? buildCoinLevelEntryWatchLimitOrder : buildCoinLevelEntryWatchOrder;
    let plan = buildPlan(candidate, {
      now: this.now(), enabledAt: routeState.enabledAt,
      startedAt: this.limitStartedAt, markPrice: candidate.lastClosed5m, routeState,
    });
    if (!plan) return { status: 'ineligible' };

    const state = readState(this.file);
    if (!state) return { status: 'state-error' };
    const previousSymbolAt = finite(state.symbols[plan.symbol]);
    if (state.attempts[plan.clientOrderId]
      || (previousSymbolAt != null
        && this.now() - previousSymbolAt < COIN_LEVEL_ENTRY_WATCH_SYMBOL_COOLDOWN_MS)) {
      return { status: 'deduped' };
    }

    const context = await this.getContext(plan.symbol);
    if (!context?.enabled) return { status: 'runtime-off' };
    if ((context.positions ?? []).some((position) => (
      position.symbol === plan.symbol && Math.abs(Number(position.positionAmt)) > 0
    ))) return { status: 'existing-position' };
    if ((context.openOrders ?? []).some((order) => (
      order.symbol === plan.symbol
      && order.reduceOnly !== true && order.reduceOnly !== 'true'
      && order.closePosition !== true && order.closePosition !== 'true'
    ))) return { status: 'existing-order' };

    const latest = this.controls.read();
    const latestRoute = latest.routes[registered.key];
    if (!latest.enabled || latestRoute?.enabled !== true) return { status: 'control-changed' };
    marketRegime = routeSpec.side === 'LONG' && typeof this.getMarketRegime === 'function'
      ? this.getMarketRegime()
      : marketRegime;
    if (routeSpec.side === 'LONG' && marketRegime && marketRegime.allowLongEntry !== true) {
      return {
        status: 'market-regime-blocked',
        marketRegime: marketRegime.state ?? 'WAIT_DATA',
        reason: marketRegime.reasons?.[0] ?? 'Coin Level LONG market-regime guard changed before submit.',
      };
    }
    plan = buildPlan(candidate, {
      now: this.now(), enabledAt: latestRoute.enabledAt,
      startedAt: this.limitStartedAt, markPrice: context.markPrice, routeState: latestRoute,
    });
    if (!plan) return { status: 'price-or-age-blocked' };
    if (routeSpec.side === 'LONG' && marketRegime?.state) {
      plan.signalReason = `${plan.signalReason} | marketRegime=${marketRegime.state}`;
    }
    this.controls.assertEntry(plan);

    state.attempts[plan.clientOrderId] = {
      symbol: plan.symbol, side: plan.side, direction: routeSpec.side,
      at: this.now(), status: 'SUBMITTING',
      orderType: plan.orderType,
      ...(isLimit ? {
        confirmationAt: epoch(candidate.confirmationAt),
        referenceLevel: finite(candidate.referenceLevel),
      } : {}),
      ...(routeSpec.side === 'LONG' && marketRegime ? {
        marketRegimeVersion: marketRegime.version ?? null,
        marketRegimeState: marketRegime.state ?? null,
        marketRegimeEvaluatedAt: finite(marketRegime.evaluatedAt),
      } : {}),
    };
    state.symbols[plan.symbol] = this.now();
    saveState(this.file, state);
    try {
      const result = await this.submit(plan, context);
      state.attempts[plan.clientOrderId].status = result?.status ?? 'UNKNOWN';
      state.attempts[plan.clientOrderId].orderId = result?.orderResult?.orderId ?? null;
      saveState(this.file, state);
      return {
        status: result?.status ?? 'UNKNOWN',
        orderId: result?.orderResult?.orderId ?? null,
        side: routeSpec.side,
        marginUsdt: plan.marginUsdt,
        leverage: plan.leverage,
        takeProfitRoePct: plan.takeProfitRoePct,
        stopLossRoePct: plan.stopLossRoePct,
      };
    } catch (error) {
      state.attempts[plan.clientOrderId].status = 'ERROR_OR_UNKNOWN';
      state.attempts[plan.clientOrderId].errorCode = error.code ?? null;
      saveState(this.file, state);
      throw error;
    }
  }
}
