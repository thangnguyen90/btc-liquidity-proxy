import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

export const LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_BINANCE_VERSION =
  'LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_BINANCE_V3_UPPER_LONG_LOWER_SHORT_MARKET_4USDT_20261003';
export const LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_SOURCE =
  'local-ai-liquidity-breakout-opposite-depth';
export const LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_STREAM =
  'closed-main-kill-opposite-depth';
export const LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_STAGE =
  'CLOSED_BREAKOUT_OPPOSITE_DEPTH';
export const LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_LONG_LABEL =
  'LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_LONG';
export const LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_SHORT_LABEL =
  'LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_SHORT';
export const LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_MARGIN_USDT = 4;
export const LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_LEVERAGE = 5;
export const LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_TP_ROE_PCT = 10;
export const LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_SL_ROE_PCT = 20;
export const LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_MAX_OPEN_POSITIONS = 50;
export const LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_MAX_AGE_MS = 2 * 60_000;

export const LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_ROUTES = Object.freeze([
  Object.freeze({
    source: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_SOURCE,
    streamId: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_STREAM,
    signalLabel: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_LONG_LABEL,
    side: 'LONG',
  }),
  Object.freeze({
    source: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_SOURCE,
    streamId: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_STREAM,
    signalLabel: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_SHORT_LABEL,
    side: 'SHORT',
  }),
]);

const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const epoch = (value, fallback = null) => {
  const numeric = finite(value);
  if (numeric != null) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function localAiLiquidityBreakoutOppositeDepthRoute(side) {
  const normalized = ['BUY', 'LONG'].includes(side)
    ? 'LONG' : ['SELL', 'SHORT'].includes(side) ? 'SHORT' : '';
  return LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_ROUTES
    .find((route) => route.side === normalized) ?? null;
}

export function buildLocalAiLiquidityBreakoutOppositeDepthMarketOrder(event = {}, {
  now = Date.now(), startedAt, enabledAt, markPrice, routeState,
} = {}) {
  const route = localAiLiquidityBreakoutOppositeDepthRoute(event.side);
  const signalAt = epoch(event.latestClosedAt);
  const startMs = epoch(startedAt);
  const enabledMs = epoch(enabledAt);
  const mark = finite(markPrice);
  const expectedDirection = route?.side === 'LONG' ? 'ABOVE' : 'BELOW';
  const marginUsdt = finite(routeState?.marginUsdt, LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_MARGIN_USDT);
  const leverage = finite(routeState?.leverage, LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_LEVERAGE);
  const takeProfitRoePct = finite(routeState?.takeProfitRoePct, LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_TP_ROE_PCT);
  if (!route || !/^[\p{L}\p{N}]{2,40}USDT$/u.test(String(event.symbol ?? ''))
    || !['5m', '15m'].includes(event.interval)
    || event.direction !== expectedDirection
    || ![signalAt, startMs, enabledMs, mark].every(Number.isFinite)
    || signalAt < startMs || signalAt < enabledMs || signalAt > now + 5_000
    || now - signalAt > LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_MAX_AGE_MS
    || mark <= 0
    || marginUsdt !== LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_MARGIN_USDT
    || leverage !== LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_LEVERAGE
    || takeProfitRoePct !== LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_TP_ROE_PCT) return null;
  const direction = route.side === 'LONG' ? 1 : -1;
  const takeProfitDistanceFraction = (takeProfitRoePct / 100) / leverage;
  const stopLossRoePct = LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_SL_ROE_PCT;
  const stopLossDistanceFraction = (stopLossRoePct / 100) / leverage;
  const takeProfitPrice = mark * (1 + direction * takeProfitDistanceFraction);
  const stopLossPrice = mark * (1 - direction * stopLossDistanceFraction);
  const eventId = String(event.eventId ?? '').trim();
  if (!eventId) return null;
  return {
    ...route,
    signalType: route.signalLabel,
    signalStageKey: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_STAGE,
    signalInterval: event.interval,
    signalCombo: `${LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_STAGE}|${route.side}|${event.interval}`,
    executionPage: 'local-ai-trend-evaluation',
    symbol: event.symbol,
    side: route.side === 'LONG' ? 'BUY' : 'SELL',
    orderType: 'MARKET',
    marginUsdt,
    leverage,
    notionalUsdt: marginUsdt * leverage,
    signalEntryPrice: mark,
    takeProfitPrice,
    stopLossPrice,
    takeProfitRoePct,
    stopLossRoePct,
    takeProfitDistanceFraction,
    stopLossDistanceFraction,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_BINANCE_VERSION,
    protectionSignalEntryPrice: mark,
    protectionSignalTakeProfitPrice: takeProfitPrice,
    protectionSignalStopLossPrice: stopLossPrice,
    maxOpenPositions: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_MAX_OPEN_POSITIONS,
    allowMinNotionalCeil: false,
    dryRun: false,
    clientOrderId: `aiod_${route.side === 'LONG' ? 'l' : 's'}_${createHash('sha256').update(eventId).digest('hex').slice(0, 20)}`,
    signalReason: [
      LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_BINANCE_VERSION,
      `eventId=${eventId}`,
      `closedAt=${new Date(signalAt).toISOString()}`,
      `zone=${finite(event.zone?.low)}-${finite(event.zone?.high)}`,
      `breachClose=${finite(event.breachClose)}`,
      `latestClose=${finite(event.latestClose)}`,
      `depthRatio=${finite(event.depth?.oppositeRatio)}`,
      `bid=${finite(event.depth?.bidNotional)}`,
      `ask=${finite(event.depth?.askNotional)}`,
    ].join(' | '),
  };
}

function freshState(now) {
  return { version: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_BINANCE_VERSION,
    initializedAt: now, updatedAt: now, attempts: {} };
}

export class LocalAiLiquidityBreakoutOppositeDepthBinanceRunner {
  constructor({ file, controls, getContext, submit, now = () => Date.now(), startedAt = now() } = {}) {
    Object.assign(this, { file, controls, getContext, submit, now, startedAt });
    this.state = null;
    this.queue = Promise.resolve();
  }
  async load() {
    if (this.state) return this.state;
    const now = this.now();
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      this.state = { ...freshState(now), ...parsed,
        version: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_BINANCE_VERSION,
        attempts: parsed?.attempts && typeof parsed.attempts === 'object' ? parsed.attempts : {} };
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[LocalAiLiqBreakoutDepthBinance] state reset: ${error.message}`);
      this.state = freshState(now);
    }
    return this.state;
  }
  async save() {
    const cutoff = this.now() - 7 * 24 * 60 * 60_000;
    this.state.attempts = Object.fromEntries(Object.entries(this.state.attempts)
      .filter(([, item]) => epoch(item?.at, 0) >= cutoff));
    this.state.updatedAt = this.now();
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(this.state, null, 2), 'utf8');
    await rename(`${this.file}.tmp`, this.file);
  }
  snapshot() {
    return { version: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_BINANCE_VERSION,
      marginUsdt: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_MARGIN_USDT,
      leverage: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_LEVERAGE,
      takeProfitRoePct: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_TP_ROE_PCT,
      longStopLossRoePct: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_SL_ROE_PCT,
      shortProtectionMode: 'BOT_SHORT_TP_ONLY',
      attempts: Object.keys(this.state?.attempts ?? {}).length,
      updatedAt: this.state?.updatedAt ?? null };
  }
  async managementSnapshot({ attemptLimit = 200 } = {}) {
    await this.load();
    const controls = this.controls.read();
    const routes = LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_ROUTES.map((route) => {
      const key = JSON.stringify([route.source, route.streamId, route.signalLabel, route.side]);
      const state = controls.routes?.[key] ?? null;
      return {
        key,
        side: route.side,
        signalLabel: route.signalLabel,
        enabled: controls.enabled === true && state?.enabled === true,
        routeEnabled: state?.enabled === true,
        enabledAt: state?.enabledAt ?? null,
        marginUsdt: finite(state?.marginUsdt, LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_MARGIN_USDT),
        leverage: finite(state?.leverage, LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_LEVERAGE),
        takeProfitRoePct: finite(state?.takeProfitRoePct, LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_TP_ROE_PCT),
      };
    });
    const attempts = Object.values(this.state.attempts ?? {})
      .sort((left, right) => epoch(right?.at, 0) - epoch(left?.at, 0))
      .slice(0, Math.max(1, Math.min(500, Math.trunc(finite(attemptLimit, 200)))))
      .map((attempt) => ({ ...attempt }));
    const submittedStatuses = new Set(['SUBMITTED', 'FILLED', 'NEW']);
    return {
      ...this.snapshot(),
      generatedAt: this.now(),
      masterEnabled: controls.enabled === true,
      failClosed: controls.failClosed === true,
      routes,
      attempts,
      submittedAttempts: attempts.filter((attempt) => submittedStatuses.has(String(attempt.status).toUpperCase())).length,
      errorAttempts: attempts.filter((attempt) => String(attempt.status).toUpperCase().includes('ERROR')).length,
    };
  }
  process(event = {}) {
    const task = this.queue.catch(() => {}).then(() => this.#process(event));
    this.queue = task.catch(() => {});
    return task;
  }
  async #process(event) {
    await this.load();
    const eventId = String(event.eventId ?? '').trim();
    const route = localAiLiquidityBreakoutOppositeDepthRoute(event.side);
    if (!eventId || !route) return { status: 'invalid-event' };
    if (this.state.attempts[eventId]) return { status: 'deduped', symbol: event.symbol, side: route.side };
    const registered = this.controls.register(route);
    const controls = this.controls.read();
    const routeState = controls.routes?.[registered.key];
    if (!controls.enabled || routeState?.enabled !== true) {
      return { status: 'off', symbol: event.symbol, side: route.side };
    }
    const enabledAt = epoch(routeState.enabledAt);
    if (!(enabledAt > 0) || epoch(event.latestClosedAt, 0) < enabledAt
      || epoch(event.latestClosedAt, 0) < this.startedAt) {
      return { status: 'pre-enable-signal', symbol: event.symbol, side: route.side };
    }
    try {
      const context = await this.getContext(event.symbol);
      if (!context?.enabled) return { status: 'runtime-off', symbol: event.symbol, side: route.side };
      if ((context.positions ?? []).some((position) => position.symbol === event.symbol
        && Math.abs(Number(position.positionAmt)) > 0)) {
        return { status: 'existing-position', symbol: event.symbol, side: route.side };
      }
      if ((context.openOrders ?? []).some((order) => order.symbol === event.symbol
        && order.reduceOnly !== true && order.reduceOnly !== 'true'
        && order.closePosition !== true && order.closePosition !== 'true')) {
        return { status: 'existing-order', symbol: event.symbol, side: route.side };
      }
      const latest = this.controls.read();
      const latestRoute = latest.routes?.[registered.key];
      if (!latest.enabled || latestRoute?.enabled !== true
        || String(latestRoute.enabledAt ?? '') !== String(routeState.enabledAt ?? '')) {
        return { status: 'control-changed', symbol: event.symbol, side: route.side };
      }
      const plan = buildLocalAiLiquidityBreakoutOppositeDepthMarketOrder(event, {
        now: this.now(), startedAt: this.startedAt, enabledAt: latestRoute.enabledAt,
        markPrice: context.markPrice, routeState: latestRoute,
      });
      if (!plan) return { status: 'age-or-risk-blocked', symbol: event.symbol, side: route.side };
      this.controls.assertEntry(plan);
      const attempt = { eventId, symbol: event.symbol, side: route.side, interval: event.interval,
        at: this.now(), status: 'SUBMITTING', clientOrderId: plan.clientOrderId };
      this.state.attempts[eventId] = attempt;
      await this.save();
      const result = await this.submit(plan, context);
      attempt.status = String(result?.status ?? 'UNKNOWN').toUpperCase();
      attempt.orderId = result?.orderResult?.orderId ?? null;
      attempt.marginUsdt = plan.marginUsdt;
      attempt.leverage = plan.leverage;
      attempt.takeProfitPrice = result?.protectionSuppressedBySymbol === true
        ? null : plan.takeProfitPrice;
      attempt.stopLossPrice = result?.protectionSuppressedBySymbol === true
        || result?.stopLossSuppressed === true ? null : plan.stopLossPrice;
      attempt.stopLossSuppressed = result?.stopLossSuppressed === true;
      attempt.protectionSuppressedBySymbol = result?.protectionSuppressedBySymbol === true;
      await this.save();
      return { status: result?.status ?? 'unknown', symbol: event.symbol, side: route.side,
        orderId: attempt.orderId, marginUsdt: plan.marginUsdt, leverage: plan.leverage,
        takeProfitPrice: attempt.takeProfitPrice, stopLossPrice: attempt.stopLossPrice,
        stopLossSuppressed: attempt.stopLossSuppressed,
        protectionSuppressedBySymbol: attempt.protectionSuppressedBySymbol };
    } catch (error) {
      const attempt = this.state.attempts[eventId] ?? { eventId, symbol: event.symbol,
        side: route.side, interval: event.interval, at: this.now() };
      attempt.status = 'ERROR_OR_UNKNOWN';
      attempt.errorCode = error?.code ?? null;
      attempt.error = String(error?.message ?? error).slice(0, 300);
      this.state.attempts[eventId] = attempt;
      await this.save();
      return { status: 'error', symbol: event.symbol, side: route.side,
        error: attempt.error, errorCode: attempt.errorCode };
    }
  }
}
