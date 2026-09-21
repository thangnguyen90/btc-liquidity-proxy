import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveOtherEntrySettings } from './otherEntryCatalog.js';
import {
  LIQ_SCAN_HIGH_SCORE_DISCORD_VERSION,
  LIQ_SCAN_HIGH_SCORE_BINANCE_THRESHOLD,
} from './liqScanHighScoreDiscord.js';

export const LIQ_SCAN_HIGH_SCORE_BINANCE_VERSION =
  'LIQ_SCAN_HIGH_SCORE_MARKET_EDITABLE_ENTRY_V1_20260916';
export const LIQ_SCAN_HIGH_SCORE_MAX_AGE_MS = 90_000;
export const LIQ_SCAN_HIGH_SCORE_MAX_MARK_DRIFT = 0.005;
export const LIQ_SCAN_HIGH_SCORE_SYMBOL_COOLDOWN_MS = 4 * 60 * 60_000;
export const LIQ_SCAN_HIGH_SCORE_LONG_STOP_LOSS_ROE_PCT = 20;
export const LIQ_SCAN_HIGH_SCORE_SHORT_STOP_LOSS_ROE_PCT = 30;
export const LIQ_SCAN_HIGH_SCORE_ROUTES = Object.freeze([
  Object.freeze({
    source: 'liqscan-high-score',
    streamId: 'coin-level-analysis',
    signalLabel: 'LIQSCAN_HIGH_SCORE_ABOVE_LONG',
    side: 'LONG',
  }),
  Object.freeze({
    source: 'liqscan-high-score',
    streamId: 'coin-level-analysis',
    signalLabel: 'LIQSCAN_HIGH_SCORE_BELOW_SHORT',
    side: 'SHORT',
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

export function liqScanHighScoreRoute(event = {}) {
  if (event.version !== LIQ_SCAN_HIGH_SCORE_DISCORD_VERSION
    || event.active !== true
    || finite(event.score, -Infinity) <= LIQ_SCAN_HIGH_SCORE_BINANCE_THRESHOLD
    || !['ABOVE', 'BELOW'].includes(event.dominantSide)) return null;
  const expectedSide = event.dominantSide === 'ABOVE' ? 'LONG' : 'SHORT';
  if (event.side !== expectedSide) return null;
  return LIQ_SCAN_HIGH_SCORE_ROUTES.find((route) => route.side === expectedSide) ?? null;
}

export function buildLiqScanHighScoreOrder(event = {}, {
  now = Date.now(),
  enabledAt,
  markPrice,
  routeState,
} = {}) {
  const route = liqScanHighScoreRoute(event);
  if (!route) return null;
  const entrySettings = resolveOtherEntrySettings(route, routeState);
  if (!entrySettings) return null;
  const evaluatedAt = epoch(event.evaluatedAt);
  const observedAt = epoch(event.observedAt);
  const enabledAtMs = epoch(enabledAt);
  const entry = finite(event.markPrice);
  const mark = finite(markPrice);
  if (![evaluatedAt, observedAt, enabledAtMs, entry, mark].every(Number.isFinite)
    || evaluatedAt < enabledAtMs
    || evaluatedAt > now
    || observedAt > now
    || now - evaluatedAt > LIQ_SCAN_HIGH_SCORE_MAX_AGE_MS
    || now - observedAt > LIQ_SCAN_HIGH_SCORE_MAX_AGE_MS
    || entry <= 0
    || mark <= 0
    || Math.abs(mark / entry - 1) > LIQ_SCAN_HIGH_SCORE_MAX_MARK_DRIFT) return null;

  const isLong = route.side === 'LONG';
  const leverage = entrySettings.leverage;
  const marginUsdt = entrySettings.marginUsdt;
  const takeProfitRoePct = entrySettings.takeProfitRoePct;
  const stopLossRoePct = isLong
    ? LIQ_SCAN_HIGH_SCORE_LONG_STOP_LOSS_ROE_PCT
    : LIQ_SCAN_HIGH_SCORE_SHORT_STOP_LOSS_ROE_PCT;
  const takeProfitDistanceFraction = (takeProfitRoePct / 100) / leverage;
  const stopLossDistanceFraction = (stopLossRoePct / 100) / leverage;
  const takeProfitPrice = entry * (isLong
    ? 1 + takeProfitDistanceFraction
    : 1 - takeProfitDistanceFraction);
  const stopLossPrice = entry * (isLong
    ? 1 - stopLossDistanceFraction
    : 1 + stopLossDistanceFraction);
  const key = `${event.symbol}|${event.dominantSide}|${evaluatedAt}|${event.score}`;
  return {
    source: route.source,
    streamId: route.streamId,
    signalLabel: route.signalLabel,
    signalType: route.signalLabel,
    signalInterval: '15m',
    executionPage: 'coin-level-analysis',
    side: isLong ? 'BUY' : 'SELL',
    symbol: event.symbol,
    orderType: 'MARKET',
    marginUsdt,
    notionalUsdt: marginUsdt * leverage,
    leverage,
    signalEntryPrice: entry,
    entryExpiresAt: evaluatedAt + LIQ_SCAN_HIGH_SCORE_MAX_AGE_MS,
    takeProfitPrice,
    stopLossPrice,
    takeProfitRoePct,
    stopLossRoePct,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: LIQ_SCAN_HIGH_SCORE_BINANCE_VERSION,
    takeProfitDistanceFraction,
    stopLossDistanceFraction,
    protectionSignalEntryPrice: entry,
    protectionSignalTakeProfitPrice: takeProfitPrice,
    protectionSignalStopLossPrice: stopLossPrice,
    allowMinNotionalCeil: false,
    dryRun: false,
    maxOpenPositions: 30,
    clientOrderId: `lsh_${createHash('sha256').update(key).digest('hex').slice(0, 26)}`,
    signalCombo: `15m|${route.signalLabel}`,
    signalReason: [
      LIQ_SCAN_HIGH_SCORE_BINANCE_VERSION,
      `score=${event.score}`,
      `dominant=${event.dominantSide}`,
      `evaluatedAt=${new Date(evaluatedAt).toISOString()}`,
      `entry=${entry}`,
      `liquidityAbove=${finite(event.current?.liquidityAbove, 0)}`,
      `liquidityBelow=${finite(event.current?.liquidityBelow, 0)}`,
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
    return { version: LIQ_SCAN_HIGH_SCORE_BINANCE_VERSION, attempts: {}, symbols: {} };
  }
}

function saveState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify({
    ...state,
    version: LIQ_SCAN_HIGH_SCORE_BINANCE_VERSION,
    updatedAt: new Date().toISOString(),
  }, null, 2));
  renameSync(`${file}.tmp`, file);
}

export class LiqScanHighScoreBinanceRunner {
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
    const routeSpec = liqScanHighScoreRoute(event);
    if (!routeSpec) return { status: 'ineligible' };
    const registered = this.controls.register(routeSpec);
    const controls = this.controls.read();
    const routeState = controls.routes[registered.key];
    if (!controls.enabled || routeState?.enabled !== true) return { status: 'off' };
    let plan = buildLiqScanHighScoreOrder(event, {
      now: this.now(), enabledAt: routeState.enabledAt, markPrice: event.markPrice, routeState,
    });
    if (!plan) return { status: 'ineligible' };

    const state = readState(this.file);
    if (!state) return { status: 'state-error' };
    const previousSymbolAt = finite(state.symbols[plan.symbol]);
    if (state.attempts[plan.clientOrderId]
      || (previousSymbolAt != null
        && this.now() - previousSymbolAt < LIQ_SCAN_HIGH_SCORE_SYMBOL_COOLDOWN_MS)) {
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
    plan = buildLiqScanHighScoreOrder(event, {
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
