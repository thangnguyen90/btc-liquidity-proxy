import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveOtherEntrySettings } from './otherEntryCatalog.js';

export const BIG_CANDLE_PUMP_15M_SIGNAL_VERSION =
  'BIG_CANDLE_PUMP_15M_CLOSED_SIGNAL_V1_20260914';
export const BIG_CANDLE_PUMP_15M_BINANCE_VERSION =
  'BIG_CANDLE_PUMP_15M_MARKET_EDITABLE_ENTRY_V1_20260914';
export const BIG_CANDLE_PUMP_15M_LABEL = 'BIG_CANDLE_PUMP_LONG';
export const BIG_CANDLE_PUMP_15M_MIN_BODY_PCT = 8;
export const BIG_CANDLE_PUMP_15M_MAX_AGE_MS = 90_000;
export const BIG_CANDLE_PUMP_15M_MAX_MARK_DRIFT = 0.005;
export const BIG_CANDLE_PUMP_15M_SYMBOL_COOLDOWN_MS = 4 * 60 * 60_000;
export const BIG_CANDLE_PUMP_15M_STOP_LOSS_ROE_PCT = 20;
export const BIG_CANDLE_PUMP_15M_ROUTE = Object.freeze({
  source: 'big-candle-pump-15m',
  streamId: 'volume-dump-scanner',
  signalLabel: BIG_CANDLE_PUMP_15M_LABEL,
  side: 'LONG',
});

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function epoch(value) {
  const numeric = finite(value);
  if (numeric != null) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildBigCandlePump15mSignal({
  row = {},
  candle = {},
  candlePct,
  volumeRatio,
  now = Date.now(),
} = {}) {
  const symbol = String(row.symbol ?? '').trim().toUpperCase();
  const candleOpenAt = finite(candle.openTime, finite(candle?.[0]));
  const candleCloseAt = finite(candle.closeTime, finite(candle?.[6]));
  const markPrice = finite(row.markPrice);
  const bodyPct = finite(candlePct);
  const eligible = Boolean(symbol)
    && markPrice > 0
    && candleOpenAt > 0
    && candleCloseAt > candleOpenAt
    && candleCloseAt < now
    && bodyPct >= BIG_CANDLE_PUMP_15M_MIN_BODY_PCT;
  return {
    version: BIG_CANDLE_PUMP_15M_SIGNAL_VERSION,
    generatedAt: new Date(now).toISOString(),
    observedAt: now,
    symbol,
    interval: '15m',
    kind: 'BIG_CANDLE_PUMP',
    stage: BIG_CANDLE_PUMP_15M_LABEL,
    label: BIG_CANDLE_PUMP_15M_LABEL,
    side: 'LONG',
    closed: true,
    observeOnly: !eligible,
    binanceEligible: eligible,
    executionEligible: eligible,
    candleOpenAt,
    candleCloseAt,
    candleOpen: finite(candle.open, finite(candle?.[1])),
    candleClose: finite(candle.close, finite(candle?.[4])),
    candlePct: bodyPct,
    volumeRatio: finite(volumeRatio, 0),
    markPrice,
    price: markPrice,
  };
}

export function bigCandlePump15mRoute(signal = {}) {
  if (signal.version !== BIG_CANDLE_PUMP_15M_SIGNAL_VERSION
    || signal.interval !== '15m'
    || signal.kind !== 'BIG_CANDLE_PUMP'
    || signal.label !== BIG_CANDLE_PUMP_15M_LABEL
    || signal.side !== 'LONG'
    || signal.closed !== true
    || signal.observeOnly !== false
    || signal.binanceEligible !== true
    || signal.executionEligible !== true
    || finite(signal.candlePct, -Infinity) < BIG_CANDLE_PUMP_15M_MIN_BODY_PCT) return null;
  return BIG_CANDLE_PUMP_15M_ROUTE;
}

export function buildBigCandlePump15mOrder(signal = {}, {
  now = Date.now(),
  enabledAt,
  markPrice,
  routeState,
} = {}) {
  const route = bigCandlePump15mRoute(signal);
  if (!route) return null;
  const entrySettings = resolveOtherEntrySettings(route, routeState);
  if (!entrySettings) return null;
  const candleOpenAt = epoch(signal.candleOpenAt);
  const candleCloseAt = epoch(signal.candleCloseAt);
  const observedAt = epoch(signal.observedAt);
  const generatedAt = epoch(signal.generatedAt);
  const enabledAtMs = epoch(enabledAt);
  const entry = finite(signal.markPrice, finite(signal.price));
  const mark = finite(markPrice);
  if (![candleOpenAt, candleCloseAt, observedAt, generatedAt, enabledAtMs, entry, mark]
    .every(Number.isFinite)
    || candleCloseAt <= candleOpenAt
    || candleCloseAt < enabledAtMs
    || candleCloseAt >= now
    || now - candleCloseAt > BIG_CANDLE_PUMP_15M_MAX_AGE_MS
    || observedAt > now
    || generatedAt > now
    || now - observedAt > 60_000
    || now - generatedAt > 60_000
    || entry <= 0
    || mark <= 0
    || Math.abs(mark / entry - 1) > BIG_CANDLE_PUMP_15M_MAX_MARK_DRIFT) return null;

  const leverage = entrySettings.leverage;
  const marginUsdt = entrySettings.marginUsdt;
  const takeProfitRoePct = entrySettings.takeProfitRoePct;
  const takeProfitDistanceFraction = (takeProfitRoePct / 100) / leverage;
  const stopLossDistanceFraction = (BIG_CANDLE_PUMP_15M_STOP_LOSS_ROE_PCT / 100) / leverage;
  const takeProfitPrice = entry * (1 + takeProfitDistanceFraction);
  const stopLossPrice = entry * (1 - stopLossDistanceFraction);
  const key = `${signal.symbol}|${candleOpenAt}|${BIG_CANDLE_PUMP_15M_LABEL}`;
  return {
    source: route.source,
    streamId: route.streamId,
    signalLabel: route.signalLabel,
    signalType: route.signalLabel,
    signalInterval: '15m',
    executionPage: 'binance-auto-controls',
    side: 'BUY',
    symbol: signal.symbol,
    orderType: 'MARKET',
    marginUsdt,
    notionalUsdt: marginUsdt * leverage,
    leverage,
    signalEntryPrice: entry,
    entryExpiresAt: candleCloseAt + BIG_CANDLE_PUMP_15M_MAX_AGE_MS,
    takeProfitPrice,
    stopLossPrice,
    takeProfitRoePct,
    stopLossRoePct: BIG_CANDLE_PUMP_15M_STOP_LOSS_ROE_PCT,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: BIG_CANDLE_PUMP_15M_BINANCE_VERSION,
    takeProfitDistanceFraction,
    stopLossDistanceFraction,
    protectionSignalEntryPrice: entry,
    protectionSignalTakeProfitPrice: takeProfitPrice,
    protectionSignalStopLossPrice: stopLossPrice,
    allowMinNotionalCeil: false,
    dryRun: false,
    maxOpenPositions: 30,
    clientOrderId: `bcp_${createHash('sha256').update(key).digest('hex').slice(0, 26)}`,
    signalCombo: `15m|${BIG_CANDLE_PUMP_15M_LABEL}`,
    signalReason: [
      BIG_CANDLE_PUMP_15M_BINANCE_VERSION,
      `closedAt=${new Date(candleCloseAt).toISOString()}`,
      `body=${finite(signal.candlePct)}%`,
      `volume=${finite(signal.volumeRatio, 0)}x`,
      `entry=${entry}`,
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
    return { version: BIG_CANDLE_PUMP_15M_BINANCE_VERSION, attempts: {}, symbols: {} };
  }
}

function saveState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify({
    ...state,
    version: BIG_CANDLE_PUMP_15M_BINANCE_VERSION,
    updatedAt: new Date().toISOString(),
  }, null, 2));
  renameSync(`${file}.tmp`, file);
}

export class BigCandlePump15mBinanceRunner {
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
    const routeSpec = bigCandlePump15mRoute(signal);
    if (!routeSpec) return { status: 'ineligible' };
    const registered = this.controls.register(routeSpec);
    const controls = this.controls.read();
    const routeState = controls.routes[registered.key];
    if (!controls.enabled || routeState?.enabled !== true) return { status: 'off' };
    let plan = buildBigCandlePump15mOrder(signal, {
      now: this.now(), enabledAt: routeState.enabledAt, markPrice: signal.markPrice, routeState,
    });
    if (!plan) return { status: 'ineligible' };

    const state = readState(this.file);
    if (!state) return { status: 'state-error' };
    const previousSymbolAt = finite(state.symbols[plan.symbol]);
    if (state.attempts[plan.clientOrderId]
      || (previousSymbolAt != null
        && this.now() - previousSymbolAt < BIG_CANDLE_PUMP_15M_SYMBOL_COOLDOWN_MS)) {
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
    plan = buildBigCandlePump15mOrder(signal, {
      now: this.now(), enabledAt: latestRoute.enabledAt, markPrice: context.markPrice,
      routeState: latestRoute,
    });
    if (!plan) return { status: 'price-or-age-blocked' };
    this.controls.assertEntry(plan);

    state.attempts[plan.clientOrderId] = {
      symbol: plan.symbol, side: plan.side, at: this.now(), status: 'SUBMITTING',
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
        side: 'LONG',
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
