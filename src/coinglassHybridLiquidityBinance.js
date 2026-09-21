import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { COINGLASS_HYBRID_LIQUIDITY_HUNTER_VERSION } from './coinglassHybridLiquidityHunter.js';
import { resolveOtherEntrySettings } from './otherEntryCatalog.js';

export const COINGLASS_HYBRID_LIQUIDITY_BINANCE_VERSION =
  'COINGLASS_HYBRID_LIQUIDITY_EDITABLE_ENTRY_SETTINGS_V2_20260914';

export const COINGLASS_HYBRID_UPPER_LONG_LABEL =
  'HYBRID_UPPER_FIRST_SHORT_SQUEEZE_READY';
export const COINGLASS_HYBRID_LOWER_SHORT_LABEL =
  'HYBRID_LOWER_FIRST_LONG_FLUSH_READY';

export const COINGLASS_HYBRID_LIQUIDITY_MARGIN_USDT = 1;
export const COINGLASS_HYBRID_LIQUIDITY_LEVERAGE = 5;
export const COINGLASS_HYBRID_LIQUIDITY_TP_ROE = 0.10;
export const COINGLASS_HYBRID_LIQUIDITY_MAX_AGE_MS = 7 * 60_000;
export const COINGLASS_HYBRID_LIQUIDITY_MAX_MARK_DRIFT = 0.005;
export const COINGLASS_HYBRID_LIQUIDITY_SYMBOL_COOLDOWN_MS = 4 * 60 * 60_000;

const route = (streamId, signalLabel, side) => Object.freeze({
  source: 'coinglass-hybrid-liquidity',
  streamId,
  signalLabel,
  side,
});

export const COINGLASS_HYBRID_LIQUIDITY_ROUTES = Object.freeze([
  route('primary', COINGLASS_HYBRID_UPPER_LONG_LABEL, 'LONG'),
  route('primary', COINGLASS_HYBRID_LOWER_SHORT_LABEL, 'SHORT'),
  route('secondary', COINGLASS_HYBRID_UPPER_LONG_LABEL, 'LONG'),
  route('secondary', COINGLASS_HYBRID_LOWER_SHORT_LABEL, 'SHORT'),
]);

const finite = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function epoch(value) {
  const numeric = finite(value);
  if (numeric != null) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function coinglassHybridLiquidityRoute(signal = {}) {
  if (signal.version !== COINGLASS_HYBRID_LIQUIDITY_HUNTER_VERSION
    || signal.ready !== true
    || signal.binanceEligible !== true
    || signal.executionEligible !== true
    || signal.observeOnly !== false) return null;
  const streamId = signal.streamId === 'secondary' ? 'secondary' : 'primary';
  if (signal.label === COINGLASS_HYBRID_UPPER_LONG_LABEL
    && signal.bias === 'UPPER_FIRST'
    && signal.side === 'LONG') {
    return COINGLASS_HYBRID_LIQUIDITY_ROUTES.find((item) => (
      item.streamId === streamId && item.signalLabel === signal.label && item.side === 'LONG'
    )) ?? null;
  }
  if (signal.label === COINGLASS_HYBRID_LOWER_SHORT_LABEL
    && signal.bias === 'LOWER_FIRST'
    && signal.side === 'SHORT') {
    return COINGLASS_HYBRID_LIQUIDITY_ROUTES.find((item) => (
      item.streamId === streamId && item.signalLabel === signal.label && item.side === 'SHORT'
    )) ?? null;
  }
  return null;
}

export function buildCoinglassHybridLiquidityOrder(signal = {}, {
  now = Date.now(),
  enabledAt,
  markPrice,
  routeState,
} = {}) {
  const routeSpec = coinglassHybridLiquidityRoute(signal);
  if (!routeSpec) return null;
  const entrySettings = resolveOtherEntrySettings(routeSpec, routeState);
  if (!entrySettings) return null;
  const confirmedAt = epoch(signal.confirmedAt ?? signal.candleCloseAt ?? signal.binance?.confirmedAt);
  const generatedAt = epoch(signal.generatedAt);
  const enabledAtMs = epoch(enabledAt);
  const entry = finite(signal.binance?.lastPrice);
  const mark = finite(markPrice);
  if (![confirmedAt, generatedAt, enabledAtMs, entry, mark].every(Number.isFinite)
    || confirmedAt < enabledAtMs
    || confirmedAt > now
    || generatedAt > now
    || now - confirmedAt > COINGLASS_HYBRID_LIQUIDITY_MAX_AGE_MS
    || now - generatedAt > COINGLASS_HYBRID_LIQUIDITY_MAX_AGE_MS
    || entry <= 0
    || mark <= 0
    || Math.abs(mark / entry - 1) > COINGLASS_HYBRID_LIQUIDITY_MAX_MARK_DRIFT) return null;

  const isLong = routeSpec.side === 'LONG';
  const takeProfitDistanceFraction = (entrySettings.takeProfitRoePct / 100)
    / entrySettings.leverage;
  const takeProfitPrice = entry * (isLong
    ? 1 + takeProfitDistanceFraction
    : 1 - takeProfitDistanceFraction);
  const key = [
    routeSpec.streamId,
    signal.symbol,
    confirmedAt,
    signal.label,
  ].join('|');

  return {
    source: routeSpec.source,
    streamId: routeSpec.streamId,
    signalLabel: routeSpec.signalLabel,
    signalType: routeSpec.signalLabel,
    signalInterval: '5m',
    executionPage: 'binance-auto-controls',
    side: isLong ? 'BUY' : 'SELL',
    symbol: signal.symbol,
    orderType: 'MARKET',
    marginUsdt: entrySettings.marginUsdt,
    notionalUsdt: entrySettings.marginUsdt * entrySettings.leverage,
    leverage: entrySettings.leverage,
    signalEntryPrice: entry,
    entryExpiresAt: confirmedAt + COINGLASS_HYBRID_LIQUIDITY_MAX_AGE_MS,
    takeProfitPrice,
    takeProfitRoePct: entrySettings.takeProfitRoePct,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: COINGLASS_HYBRID_LIQUIDITY_BINANCE_VERSION,
    takeProfitDistanceFraction,
    protectionSignalEntryPrice: entry,
    protectionSignalTakeProfitPrice: takeProfitPrice,
    allowMinNotionalCeil: true,
    dryRun: false,
    maxOpenPositions: 30,
    clientOrderId: `chl_${createHash('sha256').update(key).digest('hex').slice(0, 26)}`,
    signalCombo: `${routeSpec.streamId}|5m|${signal.label}|${signal.bias}`,
    signalReason: [
      COINGLASS_HYBRID_LIQUIDITY_BINANCE_VERSION,
      `label=${signal.label}`,
      `bias=${signal.bias}`,
      `side=${routeSpec.side}`,
      `closedAt=${new Date(confirmedAt).toISOString()}`,
      `entry=${entry}`,
      `target=${finite(signal.target?.targetPrice) ?? 'NONE'}`,
      `impulse=${finite(signal.binance?.impulse?.bodyPct) ?? 'NONE'}%`,
      `ATR=${finite(signal.binance?.impulse?.atrRatio) ?? 'NONE'}x`,
      `volume=${finite(signal.binance?.impulse?.volumeX) ?? 'NONE'}x`,
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
    return { version: COINGLASS_HYBRID_LIQUIDITY_BINANCE_VERSION, attempts: {}, symbols: {} };
  }
}

function saveState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  const next = {
    ...state,
    version: COINGLASS_HYBRID_LIQUIDITY_BINANCE_VERSION,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2));
  renameSync(`${file}.tmp`, file);
}

export class CoinglassHybridLiquidityBinanceRunner {
  constructor({ file, controls, now = () => Date.now(), getContext, submit }) {
    Object.assign(this, { file, controls, now, getContext, submit });
    this.queue = Promise.resolve();
  }

  handle(signal) {
    const task = this.queue.then(() => this.handleOne(signal));
    this.queue = task.catch(() => {});
    return task;
  }

  async handleOne(signal) {
      const routeSpec = coinglassHybridLiquidityRoute(signal);
      if (!routeSpec) return { status: 'ineligible' };
      const registered = this.controls.register(routeSpec);
      const settings = this.controls.read();
      const routeState = settings.routes[registered.key];
      if (!settings.enabled || routeState?.enabled !== true) return { status: 'off' };
      let plan = buildCoinglassHybridLiquidityOrder(signal, {
        now: this.now(), enabledAt: routeState.enabledAt, markPrice: signal.binance?.lastPrice,
        routeState,
      });
      if (!plan) return { status: 'ineligible' };

      const state = readState(this.file);
      if (!state) return { status: 'state-error' };
      const previousSymbolAt = finite(state.symbols[plan.symbol]);
      if (state.attempts[plan.clientOrderId]
        || (previousSymbolAt != null
          && this.now() - previousSymbolAt < COINGLASS_HYBRID_LIQUIDITY_SYMBOL_COOLDOWN_MS)) {
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
      plan = buildCoinglassHybridLiquidityOrder(signal, {
        now: this.now(),
        enabledAt: latestRoute.enabledAt,
        markPrice: context.markPrice,
        routeState: latestRoute,
      });
      if (!plan) return { status: 'price-or-age-blocked' };
      this.controls.assertEntry(plan);

      state.attempts[plan.clientOrderId] = {
        symbol: plan.symbol,
        side: plan.side,
        at: this.now(),
        status: 'SUBMITTING',
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
        };
      } catch (error) {
        state.attempts[plan.clientOrderId].status = 'ERROR_OR_UNKNOWN';
        state.attempts[plan.clientOrderId].errorCode = error.code ?? null;
        saveState(this.file, state);
        throw error;
      }
  }
}
