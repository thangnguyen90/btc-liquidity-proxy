import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { collectCoinHorizonSweepState } from './coinHorizonSweepTransitionDiscord.js';
import { resolveOtherEntrySettings } from './otherEntryCatalog.js';

export const COIN_HORIZON_SWEEP_BINANCE_VERSION =
  'COIN_HORIZON_SWEEP_EDITABLE_MARGIN_LEVERAGE_V2_20260914';
export const COIN_HORIZON_SWEEP_SOURCE = 'coin-horizon-sweep-transition';
export const COIN_HORIZON_SWEEP_STREAM = 'coin-horizon-4h8h12h';
export const COIN_HORIZON_UPPER_LABEL = 'UPPER';
export const COIN_HORIZON_LOWER_LABEL = 'LOWER';
export const COIN_HORIZON_SWEEP_MARGIN_USDT = 5;
export const COIN_HORIZON_SWEEP_LEVERAGE = 5;
export const COIN_HORIZON_SWEEP_SL_ROE = 0.25;
export const COIN_HORIZON_SWEEP_MIN_REWARD_RISK = 1;
export const COIN_HORIZON_SWEEP_MAX_AGE_MS = 90_000;
export const COIN_HORIZON_SWEEP_MAX_MARK_DRIFT = 0.005;
export const COIN_HORIZON_SWEEP_MAX_BASELINE_GAP_MS = 20 * 60_000;
export const COIN_HORIZON_SWEEP_SYMBOL_COOLDOWN_MS = 4 * 60 * 60_000;

export const COIN_HORIZON_UPPER_ROUTE = Object.freeze({
  source: COIN_HORIZON_SWEEP_SOURCE, streamId: COIN_HORIZON_SWEEP_STREAM,
  signalLabel: COIN_HORIZON_UPPER_LABEL, side: 'LONG',
});
export const COIN_HORIZON_LOWER_ROUTE = Object.freeze({
  source: COIN_HORIZON_SWEEP_SOURCE, streamId: COIN_HORIZON_SWEEP_STREAM,
  signalLabel: COIN_HORIZON_LOWER_LABEL, side: 'SHORT',
});
export const COIN_HORIZON_SWEEP_ROUTES = Object.freeze([
  COIN_HORIZON_UPPER_ROUTE, COIN_HORIZON_LOWER_ROUTE,
]);

const finite = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const epoch = (value) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};
const activeLifecycle = (value) => ['FRESH', 'APPROACHING', 'UNTRACKED'].includes(value);
const routeForState = (state) => state === 'UPPER'
  ? COIN_HORIZON_UPPER_ROUTE : state === 'LOWER' ? COIN_HORIZON_LOWER_ROUTE : null;

function targetFor(current, markPrice) {
  const isLong = current.state === 'UPPER';
  return (current.horizon?.scenarios ?? []).map((scenario) => ({
    hours: scenario.hours,
    range: scenario.liquidityRange,
    zone: scenario[isLong ? 'upperLiquidity' : 'lowerLiquidity'],
  })).filter(({ range, zone }) => ['24h', '12h', '48h'].includes(range)
    && activeLifecycle(zone?.lifecycle)
    && finite(zone?.effectiveAttractionScore) > 0
    && finite(zone?.bandLow) > 0 && finite(zone?.bandHigh) >= finite(zone?.bandLow)
    && (isLong ? finite(zone.bandLow) > markPrice : finite(zone.bandHigh) < markPrice))
    .map((item) => ({
      ...item,
      price: finite(item.zone[isLong ? 'bandLow' : 'bandHigh']),
    }))
    .sort((a, b) => Math.abs(a.price - markPrice) - Math.abs(b.price - markPrice)
      || a.hours - b.hours)[0] ?? null;
}

export function buildCoinHorizonSweepOrder(current, {
  previousState,
  previousObservedAt,
  now = Date.now(),
  enabledAt,
  markPrice = current?.horizon?.anchor,
  routeState,
} = {}) {
  const route = routeForState(current?.state);
  const entrySettings = resolveOtherEntrySettings(route ?? {}, routeState);
  const eventAt = epoch(current?.horizon?.generatedAt);
  const enabledAtMs = epoch(enabledAt);
  const previousAt = epoch(previousObservedAt);
  const anchor = finite(current?.horizon?.anchor);
  const mark = finite(markPrice);
  const scenarios = current?.horizon?.scenarios;
  if (!route || !entrySettings || current?.side !== route.side || current?.observeOnly !== true
    || !current?.horizon?.available || current?.horizon?.stale
    || !['NEUTRAL', current.state === 'UPPER' ? 'LOWER' : 'UPPER'].includes(previousState)
    || ![eventAt, enabledAtMs, previousAt, anchor, mark].every(Number.isFinite)
    || previousAt < enabledAtMs || eventAt <= previousAt || eventAt < enabledAtMs
    || eventAt > now || now - eventAt > COIN_HORIZON_SWEEP_MAX_AGE_MS
    || eventAt - previousAt > COIN_HORIZON_SWEEP_MAX_BASELINE_GAP_MS
    || !(anchor > 0) || !(mark > 0) || Math.abs(mark / anchor - 1) > COIN_HORIZON_SWEEP_MAX_MARK_DRIFT
    || !Array.isArray(scenarios) || scenarios.length !== 3
    || new Set(scenarios.map((scenario) => scenario.hours)).size !== 3
    || !scenarios.every((scenario) => [4, 8, 12].includes(scenario.hours)
      && scenario.direction === current.state)) return null;

  const target = targetFor(current, mark);
  if (!target) return null;
  const isLong = route.side === 'LONG';
  const takeProfitDistanceFraction = isLong
    ? target.price / mark - 1 : 1 - target.price / mark;
  const stopLossDistanceFraction = COIN_HORIZON_SWEEP_SL_ROE / entrySettings.leverage;
  const takeProfitRoePct = takeProfitDistanceFraction * entrySettings.leverage * 100;
  const rewardRisk = takeProfitRoePct / (COIN_HORIZON_SWEEP_SL_ROE * 100);
  if (!(takeProfitDistanceFraction > 0) || rewardRisk < COIN_HORIZON_SWEEP_MIN_REWARD_RISK) return null;
  const stopLossPrice = mark * (isLong
    ? 1 - stopLossDistanceFraction : 1 + stopLossDistanceFraction);
  const key = [current.symbol, current.state, previousAt, eventAt, target.price].join('|');

  return {
    version: COIN_HORIZON_SWEEP_BINANCE_VERSION,
    source: route.source,
    streamId: route.streamId,
    signalLabel: route.signalLabel,
    signalType: `COIN_HORIZON_${route.signalLabel}_TRANSITION`,
    signalInterval: '4h/8h/12h',
    executionPage: 'binance-auto-controls',
    side: isLong ? 'BUY' : 'SELL',
    symbol: current.symbol,
    orderType: 'MARKET',
    marginUsdt: entrySettings.marginUsdt,
    notionalUsdt: entrySettings.marginUsdt * entrySettings.leverage,
    leverage: entrySettings.leverage,
    signalEntryPrice: mark,
    entryExpiresAt: eventAt + COIN_HORIZON_SWEEP_MAX_AGE_MS,
    takeProfitPrice: target.price,
    stopLossPrice,
    takeProfitRoePct,
    stopLossRoePct: COIN_HORIZON_SWEEP_SL_ROE * 100,
    rewardRisk,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: COIN_HORIZON_SWEEP_BINANCE_VERSION,
    takeProfitDistanceFraction,
    stopLossDistanceFraction,
    protectionSignalEntryPrice: mark,
    protectionSignalTakeProfitPrice: target.price,
    protectionSignalStopLossPrice: stopLossPrice,
    takeProfitWorkingType: 'CONTRACT_PRICE',
    stopLossWorkingType: 'MARK_PRICE',
    allowMinNotionalCeil: false,
    dryRun: false,
    maxOpenPositions: 30,
    clientOrderId: `chs_${createHash('sha256').update(key).digest('hex').slice(0, 26)}`,
    lifecycleId: key,
    signalCombo: `4h/8h/12h|${previousState}->${current.state}|${target.range}|${target.zone.lifecycle}`,
    signalReason: [
      COIN_HORIZON_SWEEP_BINANCE_VERSION,
      `transition=${previousState}->${current.state}`,
      `entry=${mark}`,
      `target=${target.price}`,
      `targetBand=${target.zone.bandLow}-${target.zone.bandHigh}`,
      `targetLifecycle=${target.zone.lifecycle}`,
      `targetRange=${target.range}`,
      `targetHorizon=${target.hours}h`,
      `TP_ROE=${takeProfitRoePct.toFixed(4)}%`,
      `SL_ROE=${COIN_HORIZON_SWEEP_SL_ROE * 100}%`,
      `RR=${rewardRisk.toFixed(4)}`,
    ].join(' | '),
  };
}

function initialState() {
  return { version: COIN_HORIZON_SWEEP_BINANCE_VERSION, epochs: {}, baselines: {}, attempts: {}, symbols: {} };
}
function readState(file) {
  try {
    const state = JSON.parse(readFileSync(file, 'utf8'));
    if (!state?.epochs || !state?.baselines || !state?.attempts || !state?.symbols) throw new Error('invalid');
    return state;
  } catch (error) {
    return error.code === 'ENOENT' ? initialState() : null;
  }
}
function saveState(file, state, now) {
  mkdirSync(dirname(file), { recursive: true });
  const next = { ...state, version: COIN_HORIZON_SWEEP_BINANCE_VERSION, updatedAt: new Date(now).toISOString() };
  writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2));
  renameSync(`${file}.tmp`, file);
}

export class CoinHorizonSweepBinanceRunner {
  constructor({ file, controls, now = () => Date.now(), getContext, submit }) {
    Object.assign(this, { file, controls, now, getContext, submit });
    this.queue = Promise.resolve();
  }
  handle(analysis) {
    const task = this.queue.catch(() => {}).then(() => this.handleOne(analysis));
    this.queue = task;
    return task;
  }
  async handleOne(analysis) {
    const now = this.now();
    const current = collectCoinHorizonSweepState(analysis, now);
    if (!current || analysis?.freshness?.binance === 'STALE_LAST_GOOD') return { status: 'stale-or-unavailable' };
    const eventAt = epoch(current.horizon?.generatedAt);
    if (!Number.isFinite(eventAt) || eventAt > now || now - eventAt > COIN_HORIZON_SWEEP_MAX_AGE_MS) {
      return { status: 'stale-or-unavailable' };
    }
    const state = readState(this.file);
    if (!state) return { status: 'state-error' };
    const controls = this.controls.read();
    const outcomes = [];
    let dirty = false;
    for (const routeSpec of COIN_HORIZON_SWEEP_ROUTES) {
      const route = this.controls.register(routeSpec);
      const routeState = controls.routes[route.key];
      if (routeState?.enabled !== true || !Number.isFinite(epoch(routeState.enabledAt))) continue;
      const enabledAt = new Date(epoch(routeState.enabledAt)).toISOString();
      if (state.epochs[route.key] !== enabledAt) {
        state.epochs[route.key] = enabledAt;
        state.baselines[route.key] = {};
        dirty = true;
      }
      const baselines = state.baselines[route.key] ??= {};
      const previous = baselines[current.symbol] ?? null;
      if (previous && eventAt <= finite(previous.observedAt)) {
        outcomes.push({ label: route.label, status: 'unchanged-snapshot' });
        continue;
      }
      baselines[current.symbol] = { state: current.state, observedAt: eventAt };
      dirty = true;
      if (!previous || eventAt - finite(previous.observedAt) > COIN_HORIZON_SWEEP_MAX_BASELINE_GAP_MS) {
        outcomes.push({ label: route.label, status: 'baseline-recorded' });
        continue;
      }
      if (current.state !== route.label || previous.state === current.state) {
        outcomes.push({ label: route.label, status: 'no-matching-transition' });
        continue;
      }
      if (!controls.enabled) {
        outcomes.push({ label: route.label, status: 'master-off' });
        continue;
      }
      let plan = buildCoinHorizonSweepOrder(current, {
        previousState: previous.state, previousObservedAt: previous.observedAt,
        now, enabledAt, markPrice: current.horizon.anchor, routeState,
      });
      if (!plan) {
        outcomes.push({ label: route.label, status: 'target-or-risk-blocked' });
        continue;
      }
      if (state.attempts[plan.clientOrderId]
        || now - finite(state.symbols[plan.symbol]) < COIN_HORIZON_SWEEP_SYMBOL_COOLDOWN_MS) {
        outcomes.push({ label: route.label, status: 'deduped' });
        continue;
      }
      const context = await this.getContext(plan.symbol);
      if (!context?.enabled) { outcomes.push({ label: route.label, status: 'runtime-off' }); continue; }
      if ((context.positions ?? []).some((position) => position.symbol === plan.symbol
        && Math.abs(Number(position.positionAmt)) > 0)) {
        outcomes.push({ label: route.label, status: 'existing-position' }); continue;
      }
      if ((context.openOrders ?? []).some((order) => order.symbol === plan.symbol
        && order.reduceOnly !== true && order.reduceOnly !== 'true'
        && order.closePosition !== true && order.closePosition !== 'true')) {
        outcomes.push({ label: route.label, status: 'existing-order' }); continue;
      }
      const latest = this.controls.read();
      const latestRoute = latest.routes[route.key];
      if (!latest.enabled || latestRoute?.enabled !== true || latestRoute.enabledAt !== enabledAt) {
        outcomes.push({ label: route.label, status: 'control-changed' }); continue;
      }
      plan = buildCoinHorizonSweepOrder(current, {
        previousState: previous.state, previousObservedAt: previous.observedAt,
        now: this.now(), enabledAt, markPrice: context.markPrice, routeState: latestRoute,
      });
      if (!plan) { outcomes.push({ label: route.label, status: 'price-or-age-blocked' }); continue; }
      this.controls.assertEntry(plan);
      state.attempts[plan.clientOrderId] = { symbol: plan.symbol, side: plan.side, at: this.now(), status: 'SUBMITTING' };
      state.symbols[plan.symbol] = this.now();
      saveState(this.file, state, this.now());
      dirty = false;
      try {
        const result = await this.submit(plan, context);
        state.attempts[plan.clientOrderId].status = result?.status ?? 'UNKNOWN';
        state.attempts[plan.clientOrderId].orderId = result?.orderResult?.orderId ?? null;
        saveState(this.file, state, this.now());
        dirty = false;
        outcomes.push({ label: route.label, status: result?.status ?? 'UNKNOWN',
          orderId: result?.orderResult?.orderId ?? null, side: route.side,
          marginUsdt: plan.marginUsdt, leverage: plan.leverage,
          takeProfitPrice: plan.takeProfitPrice, stopLossPrice: plan.stopLossPrice,
          takeProfitRoePct: plan.takeProfitRoePct, stopLossRoePct: plan.stopLossRoePct,
          rewardRisk: plan.rewardRisk });
      } catch (error) {
        state.attempts[plan.clientOrderId].status = 'ERROR_OR_UNKNOWN';
        state.attempts[plan.clientOrderId].errorCode = error.code ?? null;
        saveState(this.file, state, this.now());
        throw error;
      }
    }
    if (dirty) saveState(this.file, state, now);
    return outcomes.find((row) => row.status === 'submitted')
      ?? outcomes.find((row) => row.label === current.state)
      ?? outcomes.find((row) => row.status === 'baseline-recorded')
      ?? { status: 'all-routes-off' };
  }
}
