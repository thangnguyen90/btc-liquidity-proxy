import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolveOtherEntrySettings } from './otherEntryCatalog.js';
import { POST_DUMP_NO_SELL_STAGE, POST_DUMP_NO_SELL_WATCH_VERSION } from './postDumpNoSellWatch.js';
import { POST_PUMP_NO_BUY_STAGE, POST_PUMP_NO_BUY_WATCH_VERSION } from './postPumpNoBuyWatch.js';
import { impulseSizing } from './postMoveImpulseSizing.js';

export const POST_MOVE_IMPULSE_BINANCE_VERSION =
  'POST_MOVE_IMPULSE_DYNAMIC_MARGIN5_OR1_V7_20261001';
export const POST_MOVE_IMPULSE_MAX_SIGNAL_AGE_MS = 90_000;
export const POST_MOVE_IMPULSE_MAX_MARK_DRIFT = 0.005;
export const POST_MOVE_IMPULSE_MAX_OPEN_POSITIONS = 50;
export const POST_MOVE_IMPULSE_LONG_STOP_LOSS_ROE_PCT = 20;
export const POST_MOVE_IMPULSE_SHORT_STOP_LOSS_ROE_PCT = 30;

export const POST_MOVE_IMPULSE_LONG_ROUTE = Object.freeze({
  source: 'post-move-impulse',
  streamId: 'post-dump-no-sell-5m',
  signalLabel: 'POST_DUMP_NO_SELL_BUY_IMPULSE_LONG',
  side: 'LONG',
});

export const POST_MOVE_IMPULSE_SHORT_ROUTE = Object.freeze({
  source: 'post-move-impulse',
  streamId: 'post-pump-no-buy-5m',
  signalLabel: 'POST_PUMP_NO_BUY_SELL_IMPULSE_SHORT',
  side: 'SHORT',
});

export const POST_MOVE_IMPULSE_ROUTES = Object.freeze([
  POST_MOVE_IMPULSE_LONG_ROUTE,
  POST_MOVE_IMPULSE_SHORT_ROUTE,
]);

const RETAIN_MS = 7 * 24 * 60 * 60_000;

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function epoch(value) {
  const numeric = finite(value);
  if (numeric != null) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function postMoveImpulseRoute(watch = {}) {
  if (watch?.side === 'LONG'
    && watch?.version === POST_DUMP_NO_SELL_WATCH_VERSION
    && watch?.stage === POST_DUMP_NO_SELL_STAGE.BUY_IMPULSE) return POST_MOVE_IMPULSE_LONG_ROUTE;
  if (watch?.side === 'SHORT'
    && watch?.version === POST_PUMP_NO_BUY_WATCH_VERSION
    && watch?.stage === POST_PUMP_NO_BUY_STAGE.NO_BUY_CONFIRMATION) return POST_MOVE_IMPULSE_SHORT_ROUTE;
  return null;
}

export function buildPostMoveImpulseMarketOrder(watch = {}, {
  now = Date.now(), enabledAt, startedAt, markPrice, routeState, market,
} = {}) {
  const route = postMoveImpulseRoute(watch);
  if (!route || watch.watchOnly !== true || watch.binanceEligible !== false
    || watch.executionCandidate !== true) return null;
  const settings = resolveOtherEntrySettings(route, routeState);
  const observedAt = epoch(watch.observedAt);
  const impulseAt = epoch(watch.impulseAt);
  const enabledAtMs = epoch(enabledAt);
  const startedAtMs = epoch(startedAt);
  const signalPrice = finite(watch.priceAtWatch);
  const mark = finite(markPrice);
  if (!settings || !/^[A-Z0-9]{2,40}USDT$/.test(String(watch.symbol ?? ''))
    || ![observedAt, impulseAt, enabledAtMs, startedAtMs, signalPrice, mark].every(Number.isFinite)
    || observedAt < impulseAt
    || impulseAt < enabledAtMs || impulseAt < startedAtMs
    || observedAt < enabledAtMs || observedAt < startedAtMs
    || observedAt > now || now - observedAt > POST_MOVE_IMPULSE_MAX_SIGNAL_AGE_MS
    || signalPrice <= 0 || mark <= 0
    || Math.abs(mark / signalPrice - 1) > POST_MOVE_IMPULSE_MAX_MARK_DRIFT) return null;

  const isLong = route.side === 'LONG';
  const { leverage, takeProfitRoePct } = settings;
  const sizing = impulseSizing({ side: route.side, now, market });
  const { marginUsdt } = sizing;
  const stopLossRoePct = isLong
    ? POST_MOVE_IMPULSE_LONG_STOP_LOSS_ROE_PCT
    : POST_MOVE_IMPULSE_SHORT_STOP_LOSS_ROE_PCT;
  const direction = isLong ? 1 : -1;
  const takeProfitDistanceFraction = (takeProfitRoePct / 100) / leverage;
  const stopLossDistanceFraction = (stopLossRoePct / 100) / leverage;
  const takeProfitPrice = mark * (1 + (direction * takeProfitDistanceFraction));
  const stopLossPrice = mark * (1 - (direction * stopLossDistanceFraction));
  const key = `${watch.symbol}|${route.side}|${impulseAt}|${route.signalLabel}`;
  const prefix = isLong ? 'pm5l' : 'pm5s';
  return {
    ...route,
    signalType: route.signalLabel,
    signalInterval: '5m',
    executionPage: 'btc-session-watch',
    side: isLong ? 'BUY' : 'SELL',
    symbol: watch.symbol,
    orderType: 'MARKET',
    marginUsdt,
    impulseSizing: sizing,
    notionalUsdt: marginUsdt * leverage,
    leverage,
    signalEntryPrice: mark,
    entryExpiresAt: observedAt + POST_MOVE_IMPULSE_MAX_SIGNAL_AGE_MS,
    takeProfitPrice,
    stopLossPrice,
    takeProfitRoePct,
    stopLossRoePct,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: POST_MOVE_IMPULSE_BINANCE_VERSION,
    takeProfitDistanceFraction,
    stopLossDistanceFraction,
    protectionSignalEntryPrice: mark,
    protectionSignalTakeProfitPrice: takeProfitPrice,
    protectionSignalStopLossPrice: stopLossPrice,
    allowMinNotionalCeil: true,
    dryRun: false,
    maxOpenPositions: POST_MOVE_IMPULSE_MAX_OPEN_POSITIONS,
    clientOrderId: `${prefix}_${createHash('sha256').update(key).digest('hex').slice(0, 24)}`,
    signalStageKey: watch.stage,
    signalCombo: `5m|${route.signalLabel}|${watch.stage}`,
    signalReason: [
      POST_MOVE_IMPULSE_BINANCE_VERSION,
      `observedAt=${new Date(observedAt).toISOString()}`,
      `stage=${watch.stage}`,
      `score=${watch.score ?? '-'}`,
      `signalPrice=${signalPrice}`,
      `mark=${mark}`,
      `sizing=${sizing.version}`,
      `margin=${marginUsdt}`,
      `sizeReason=${sizing.reason}`,
      `hourVN=${sizing.hourVn}`,
      `btc=${sizing.btcContext.btc.trend}`,
      `btcAt=${sizing.btcContext.evaluatedAt ?? '-'}`,
      `btc1h=${sizing.btcContext.btc.ret1h ?? '-'}`,
      `btc15m=${sizing.btcContext.btc.ret15m ?? '-'}`,
      `btcFresh=${sizing.btcFresh}`,
    ].join(' | '),
  };
}

function freshState(now) {
  return { version: POST_MOVE_IMPULSE_BINANCE_VERSION, initializedAt: now, updatedAt: now, attempts: {} };
}

export class PostMoveImpulseBinanceRunner {
  constructor({ file, controls, getContext, getSizingMarket = () => null, submit, now = () => Date.now(), startedAt = now() } = {}) {
    Object.assign(this, { file, controls, getContext, getSizingMarket, submit, now, startedAt });
    this.state = null;
    this.queue = Promise.resolve();
  }

  async load() {
    if (this.state) return this.state;
    const now = this.now();
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      this.state = {
        ...freshState(now),
        ...(parsed && typeof parsed === 'object' ? parsed : {}),
        version: POST_MOVE_IMPULSE_BINANCE_VERSION,
        attempts: parsed?.attempts && typeof parsed.attempts === 'object' ? parsed.attempts : {},
      };
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[PostMoveImpulseBinance] state load failed: ${error.message}`);
      this.state = freshState(now);
    }
    return this.state;
  }

  async save() {
    if (!this.file || !this.state) return;
    const cutoff = this.now() - RETAIN_MS;
    this.state.attempts = Object.fromEntries(Object.entries(this.state.attempts)
      .filter(([, attempt]) => finite(attempt?.at, 0) >= cutoff));
    this.state.updatedAt = this.now();
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(this.state, null, 2), 'utf8');
    await rename(`${this.file}.tmp`, this.file);
  }

  processWatches(watches) {
    const task = this.queue.catch(() => {}).then(() => this.#process(watches));
    this.queue = task.catch(() => {});
    return task;
  }

  async #process(watches) {
    await this.load();
    const results = [];
    for (const watch of Array.isArray(watches) ? watches : []) {
      const route = postMoveImpulseRoute(watch);
      if (!route) continue;
      const result = await this.#handle(watch, route);
      watch.impulseExecutionStatus = result.status;
      results.push(result);
    }
    return {
      status: 'scanned',
      candidates: results.length,
      submitted: results.filter((result) => result.status === 'submitted').length,
      results,
    };
  }

  async #handle(watch, route) {
    watch.impulseSizing = impulseSizing({ side: route.side, now: this.now(), market: this.getSizingMarket() });
    const registered = this.controls.register(route);
    const controlSnapshot = this.controls.read();
    const routeState = controlSnapshot.routes?.[registered.key];
    if (!controlSnapshot.enabled || routeState?.enabled !== true) return { status: 'off', symbol: watch.symbol };

    const attemptId = `${watch.symbol}|${route.side}|${watch.impulseAt}|${route.signalLabel}`;
    if (this.state.attempts[attemptId]) {
      watch.impulseSizing = this.state.attempts[attemptId].impulseSizing ?? null;
      return { status: `deduped:${this.state.attempts[attemptId].status}`, symbol: watch.symbol };
    }
    const attempt = {
      id: attemptId,
      symbol: watch.symbol,
      direction: route.side,
      impulseAt: watch.impulseAt,
      at: this.now(),
      status: 'CHECKING',
    };
    this.state.attempts[attemptId] = attempt;
    await this.save();

    try {
      const context = await this.getContext(watch.symbol);
      if (!context?.enabled) return await this.#finish(attemptId, 'RUNTIME_OFF');
      if ((context.positions ?? []).some((position) => (
        position.symbol === watch.symbol && Math.abs(Number(position.positionAmt)) > 0
      ))) return await this.#finish(attemptId, 'EXISTING_POSITION');
      if ((context.openOrders ?? []).some((order) => (
        order.symbol === watch.symbol
        && order.reduceOnly !== true && order.reduceOnly !== 'true'
        && order.closePosition !== true && order.closePosition !== 'true'
      ))) return await this.#finish(attemptId, 'EXISTING_ORDER');

      const latest = this.controls.read();
      const latestRoute = latest.routes?.[registered.key];
      if (!latest.enabled || latestRoute?.enabled !== true
        || String(latestRoute.enabledAt ?? '') !== String(routeState.enabledAt ?? '')) {
        return await this.#finish(attemptId, 'CONTROL_CHANGED');
      }
      const plan = buildPostMoveImpulseMarketOrder(watch, {
        now: this.now(), enabledAt: latestRoute.enabledAt, startedAt: this.startedAt,
        markPrice: context.markPrice, routeState: latestRoute, market: this.getSizingMarket(),
      });
      if (!plan) return await this.#finish(attemptId, 'PRICE_OR_AGE_BLOCKED');
      watch.impulseSizing = plan.impulseSizing;
      attempt.impulseSizing = plan.impulseSizing;
      attempt.marginUsdt = plan.marginUsdt;
      attempt.leverage = plan.leverage;
      this.controls.assertEntry(plan);
      attempt.status = 'SUBMITTING';
      attempt.clientOrderId = plan.clientOrderId;
      await this.save();
      const result = await this.submit(plan, context);
      attempt.status = String(result?.status ?? 'UNKNOWN').toUpperCase();
      attempt.orderId = result?.orderResult?.orderId ?? null;
      attempt.marginUsdt = plan.marginUsdt;
      attempt.leverage = plan.leverage;
      await this.save();
      return {
        status: result?.status ?? 'unknown', symbol: watch.symbol,
        side: route.side, orderId: attempt.orderId,
      };
    } catch (error) {
      attempt.status = 'ERROR_OR_UNKNOWN';
      attempt.errorCode = error?.code ?? null;
      attempt.error = String(error?.message ?? error).slice(0, 300);
      await this.save();
      return { status: 'error', symbol: watch.symbol, error: attempt.error, errorCode: attempt.errorCode };
    }
  }

  async #finish(id, status) {
    const attempt = this.state.attempts[id];
    attempt.status = status;
    await this.save();
    return { status: status.toLowerCase().replaceAll('_', '-'), symbol: attempt.symbol };
  }
}
