import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveOtherEntrySettings } from './otherEntryCatalog.js';
import {
  LIQ_SCAN_MAIN_KILL_SHORT_MAX_SWEEP_DEPTH_PCT,
  LIQ_SCAN_MAIN_KILL_SWEEP_VERSION,
} from './liqScanMainKillSweep.js';

export const LIQ_SCAN_MAIN_KILL_SWEEP_BINANCE_VERSION =
  'LIQSCAN_MAIN_KILL_SWEEP_SHORT_REJECTION_FILTER_V2_20260927';
export const LIQ_SCAN_MAIN_KILL_SWEEP_MIN_ZONE_LIQUIDITY_USDT = 50_000_000;
export const LIQ_SCAN_MAIN_KILL_SWEEP_MAX_AGE_MS = 90_000;
export const LIQ_SCAN_MAIN_KILL_SWEEP_MAX_MARK_DRIFT = 0.005;
export const LIQ_SCAN_MAIN_KILL_SWEEP_SYMBOL_COOLDOWN_MS = 4 * 60 * 60_000;
export const LIQ_SCAN_MAIN_KILL_SWEEP_DIRECTION_WINDOW_MS = 3 * 24 * 60 * 60_000;
export const LIQ_SCAN_MAIN_KILL_SWEEP_STOP_LOSS_ROE_PCT = 30;
export const LIQ_SCAN_MAIN_KILL_SWEEP_ROUTES = Object.freeze([
  Object.freeze({
    source: 'liqscan-main-kill-sweep',
    streamId: 'background-top400',
    signalLabel: 'LIQSCAN_MAIN_KILL_UPPER_SWEEP_SHORT',
    side: 'SHORT',
  }),
  Object.freeze({
    source: 'liqscan-main-kill-sweep',
    streamId: 'background-top400',
    signalLabel: 'LIQSCAN_MAIN_KILL_LOWER_SWEEP_LONG',
    side: 'LONG',
  }),
]);

const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const epoch = (value) => {
  const numeric = finite(value);
  if (numeric != null) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function liqScanMainKillSweepBaseRoute(event = {}) {
  const zoneLiquidity = finite(event.zone?.liquidity, 0);
  if (event.version !== LIQ_SCAN_MAIN_KILL_SWEEP_VERSION
    || event.volumeTier?.key !== 'EXTREME'
    || event.volumeTier?.rank !== 5
    || zoneLiquidity < LIQ_SCAN_MAIN_KILL_SWEEP_MIN_ZONE_LIQUIDITY_USDT
    || !['UPPER', 'LOWER'].includes(event.side)) return null;
  const expectedSide = event.side === 'UPPER' ? 'SHORT' : 'LONG';
  return LIQ_SCAN_MAIN_KILL_SWEEP_ROUTES.find((route) => route.side === expectedSide) ?? null;
}

export function liqScanMainKillSweepRoute(event = {}) {
  const route = liqScanMainKillSweepBaseRoute(event);
  if (!route) return null;
  if (event.side === 'UPPER') {
    const sweepDepthPct = finite(event.sweepDepthPct);
    if (event.rejection?.confirmed !== true
      || !(sweepDepthPct >= 0)
      || sweepDepthPct > LIQ_SCAN_MAIN_KILL_SHORT_MAX_SWEEP_DEPTH_PCT) return null;
  }
  return route;
}

export function buildLiqScanMainKillSweepOrder(event = {}, {
  now = Date.now(),
  enabledAt,
  markPrice,
  routeState,
  recentBidirectional3d,
} = {}) {
  const route = liqScanMainKillSweepRoute(event);
  if (!route || recentBidirectional3d !== false) return null;
  const entrySettings = resolveOtherEntrySettings(route, routeState);
  if (!entrySettings) return null;
  const detectedAt = epoch(event.detectedAt);
  const armedAt = epoch(event.armedAt);
  const enabledAtMs = epoch(enabledAt);
  const entry = finite(event.markNow);
  const mark = finite(markPrice);
  const zoneLow = finite(event.zone?.low);
  const zoneHigh = finite(event.zone?.high);
  const crossingExtreme = finite(event.crossingExtreme);
  const crossedEntireZone = event.side === 'UPPER'
    ? crossingExtreme >= zoneHigh
    : crossingExtreme <= zoneLow;
  if (![detectedAt, armedAt, enabledAtMs, entry, mark, zoneLow, zoneHigh, crossingExtreme]
    .every(Number.isFinite)
    || detectedAt < enabledAtMs
    || armedAt > detectedAt
    || detectedAt > now
    || now - detectedAt > LIQ_SCAN_MAIN_KILL_SWEEP_MAX_AGE_MS
    || entry <= 0
    || mark <= 0
    || zoneLow <= 0
    || zoneHigh < zoneLow
    || !crossedEntireZone
    || Math.abs(mark / entry - 1) > LIQ_SCAN_MAIN_KILL_SWEEP_MAX_MARK_DRIFT) return null;

  const isLong = route.side === 'LONG';
  const leverage = entrySettings.leverage;
  const marginUsdt = entrySettings.marginUsdt;
  const takeProfitRoePct = entrySettings.takeProfitRoePct;
  const stopLossRoePct = LIQ_SCAN_MAIN_KILL_SWEEP_STOP_LOSS_ROE_PCT;
  const takeProfitDistanceFraction = (takeProfitRoePct / 100) / leverage;
  const stopLossDistanceFraction = (stopLossRoePct / 100) / leverage;
  const takeProfitPrice = entry * (isLong
    ? 1 + takeProfitDistanceFraction
    : 1 - takeProfitDistanceFraction);
  const stopLossPrice = entry * (isLong
    ? 1 - stopLossDistanceFraction
    : 1 + stopLossDistanceFraction);
  const key = `${event.symbol}|${event.side}|${event.dedupeKey}|${detectedAt}`;
  return {
    source: route.source,
    streamId: route.streamId,
    signalLabel: route.signalLabel,
    signalType: route.signalLabel,
    signalInterval: '15m',
    executionPage: 'binance-auto-controls',
    side: isLong ? 'BUY' : 'SELL',
    symbol: event.symbol,
    orderType: 'MARKET',
    marginUsdt,
    notionalUsdt: marginUsdt * leverage,
    leverage,
    signalEntryPrice: entry,
    entryExpiresAt: detectedAt + LIQ_SCAN_MAIN_KILL_SWEEP_MAX_AGE_MS,
    takeProfitPrice,
    stopLossPrice,
    takeProfitRoePct,
    stopLossRoePct,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: LIQ_SCAN_MAIN_KILL_SWEEP_BINANCE_VERSION,
    entryFilterVersion: LIQ_SCAN_MAIN_KILL_SWEEP_BINANCE_VERSION,
    sweepDepthPct: finite(event.sweepDepthPct, 0),
    zoneReturnConfirmed: event.side === 'UPPER' ? event.rejection?.confirmed === true : true,
    recentBidirectional3d: false,
    takeProfitDistanceFraction,
    stopLossDistanceFraction,
    protectionSignalEntryPrice: entry,
    protectionSignalTakeProfitPrice: takeProfitPrice,
    protectionSignalStopLossPrice: stopLossPrice,
    allowMinNotionalCeil: true,
    dryRun: false,
    maxOpenPositions: 30,
    clientOrderId: `lmks_${createHash('sha256').update(key).digest('hex').slice(0, 24)}`,
    signalCombo: `15m|${route.signalLabel}`,
    signalReason: [
      LIQ_SCAN_MAIN_KILL_SWEEP_BINANCE_VERSION,
      `tier=${event.volumeTier.key}`,
      `zoneLiquidity=${finite(event.zone?.liquidity, 0)}`,
      `zone=${zoneLow}-${zoneHigh}`,
      `crossingExtreme=${crossingExtreme}`,
      `sweepDepthPct=${finite(event.sweepDepthPct, 0)}`,
      `zoneReturnConfirmed=${event.side === 'UPPER' ? event.rejection?.confirmed === true : true}`,
      'recentBidirectional3d=false',
      `detectedAt=${new Date(detectedAt).toISOString()}`,
      `entry=${entry}`,
    ].join(' | '),
  };
}

function readState(file) {
  try {
    const state = JSON.parse(readFileSync(file, 'utf8'));
    if (!state?.attempts || !state?.symbols) throw new Error('invalid');
    if (!Array.isArray(state.directionHistory)) {
      state.directionHistory = Object.values(state.attempts).map((attempt) => ({
        id: `migrated|${attempt?.symbol}|${attempt?.side}|${attempt?.at}`,
        symbol: attempt?.symbol,
        direction: attempt?.side === 'SELL' ? 'SHORT' : attempt?.side === 'BUY' ? 'LONG' : null,
        at: finite(attempt?.at),
      })).filter((item) => item.symbol && item.direction && Number.isFinite(item.at));
    }
    if (!Array.isArray(state.filterDecisions)) state.filterDecisions = [];
    return state;
  } catch (error) {
    if (error.code !== 'ENOENT') return null;
    return {
      version: LIQ_SCAN_MAIN_KILL_SWEEP_BINANCE_VERSION,
      attempts: {},
      symbols: {},
      directionHistory: [],
      filterDecisions: [],
    };
  }
}

function eventIdentity(event = {}) {
  return createHash('sha256').update([
    event.symbol, event.side, event.dedupeKey, event.detectedAt,
  ].join('|')).digest('hex').slice(0, 24);
}

function pruneForwardState(state, now) {
  state.directionHistory = (state.directionHistory ?? []).filter((item) => (
    item?.symbol && ['LONG', 'SHORT'].includes(item?.direction)
    && Number.isFinite(finite(item?.at))
    && now - finite(item.at) <= LIQ_SCAN_MAIN_KILL_SWEEP_DIRECTION_WINDOW_MS
  ));
  state.filterDecisions = (state.filterDecisions ?? []).filter((item) => (
    Number.isFinite(finite(item?.at)) && now - finite(item.at) <= 30 * 24 * 60 * 60_000
  )).slice(-5_000);
}

function recentOppositeDirection(state, event, now) {
  const direction = event.side === 'UPPER' ? 'SHORT' : 'LONG';
  const opposite = direction === 'SHORT' ? 'LONG' : 'SHORT';
  return state.directionHistory.some((item) => (
    item.symbol === event.symbol && item.direction === opposite
    && now - finite(item.at, 0) <= LIQ_SCAN_MAIN_KILL_SWEEP_DIRECTION_WINDOW_MS
  ));
}

function recordDirection(state, event, now) {
  const id = eventIdentity(event);
  if (state.directionHistory.some((item) => item.id === id)) return;
  state.directionHistory.push({
    id,
    symbol: event.symbol,
    direction: event.side === 'UPPER' ? 'SHORT' : 'LONG',
    at: epoch(event.detectedAt) ?? now,
  });
}

function recordFilterDecision(state, event, now, status, recentBidirectional3d) {
  const id = eventIdentity(event);
  const record = {
    id,
    symbol: event.symbol,
    direction: event.side === 'UPPER' ? 'SHORT' : 'LONG',
    at: epoch(event.detectedAt) ?? now,
    status,
    sweepDepthPct: finite(event.sweepDepthPct),
    zoneReturnConfirmed: event.side === 'UPPER' ? event.rejection?.confirmed === true : true,
    recentBidirectional3d,
  };
  const index = state.filterDecisions.findIndex((item) => item.id === id);
  if (index >= 0) state.filterDecisions[index] = record;
  else state.filterDecisions.push(record);
}

function saveState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify({
    ...state,
    version: LIQ_SCAN_MAIN_KILL_SWEEP_BINANCE_VERSION,
    updatedAt: new Date().toISOString(),
  }, null, 2));
  renameSync(`${file}.tmp`, file);
}

export class LiqScanMainKillSweepBinanceRunner {
  constructor({ file, controls, now = () => Date.now(), getContext, submit }) {
    Object.assign(this, { file, controls, now, getContext, submit });
    this.queue = Promise.resolve();
  }

  handle(event) {
    const task = this.queue.then(() => this.handleOne(event));
    this.queue = task.catch(() => {});
    return task;
  }

  async handleOne(event) {
    const routeSpec = liqScanMainKillSweepBaseRoute(event);
    if (!routeSpec) return { status: 'ineligible-extreme-only' };
    const now = this.now();
    const state = readState(this.file);
    if (!state) return { status: 'state-error' };
    pruneForwardState(state, now);
    const recentBidirectional3d = recentOppositeDirection(state, event, now);
    recordDirection(state, event, now);
    let filterStatus = 'eligible';
    if (event.side === 'UPPER' && event.rejection?.confirmed !== true) {
      filterStatus = 'observe-only-zone-not-rejected';
    } else if (event.side === 'UPPER'
      && (!(finite(event.sweepDepthPct) >= 0)
        || finite(event.sweepDepthPct) > LIQ_SCAN_MAIN_KILL_SHORT_MAX_SWEEP_DEPTH_PCT)) {
      filterStatus = 'observe-only-deep-sweep';
    } else if (recentBidirectional3d) {
      filterStatus = 'observe-only-bidirectional-3d';
    }
    recordFilterDecision(state, event, now, filterStatus, recentBidirectional3d);
    saveState(this.file, state);
    if (filterStatus !== 'eligible') return {
      status: filterStatus,
      sweepDepthPct: finite(event.sweepDepthPct),
      zoneReturnConfirmed: event.side === 'UPPER' ? event.rejection?.confirmed === true : true,
      recentBidirectional3d,
    };
    const registered = this.controls.register(routeSpec);
    const controls = this.controls.read();
    const routeState = controls.routes[registered.key];
    if (!controls.enabled || routeState?.enabled !== true) return { status: 'off' };
    let plan = buildLiqScanMainKillSweepOrder(event, {
      now, enabledAt: routeState.enabledAt, markPrice: event.markNow, routeState,
      recentBidirectional3d,
    });
    if (!plan) return { status: 'ineligible' };
    const previousSymbolAt = finite(state.symbols[plan.symbol]);
    if (state.attempts[plan.clientOrderId]
      || (previousSymbolAt != null
        && this.now() - previousSymbolAt < LIQ_SCAN_MAIN_KILL_SWEEP_SYMBOL_COOLDOWN_MS)) {
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
    plan = buildLiqScanMainKillSweepOrder(event, {
      now: this.now(), enabledAt: latestRoute.enabledAt, markPrice: context.markPrice,
      routeState: latestRoute, recentBidirectional3d,
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
