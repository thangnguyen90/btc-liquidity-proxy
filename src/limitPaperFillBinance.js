import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import {
  LIMIT_PAPER_FILL_LABELS,
  LIMIT_PAPER_FILL_SOURCE,
  LIMIT_PAPER_FILL_STREAM,
  resolveOtherEntrySettings,
} from './otherEntryCatalog.js';

export const LIMIT_PAPER_FILL_BINANCE_VERSION =
  'LIMIT_PAPER_FILL_MARKET_V1_TOP3_LONG_SHALLOW_1USDT_20260923';
export const LIMIT_PAPER_FILL_MAX_AGE_MS = 90_000;
export const LIMIT_PAPER_FILL_MAX_MARK_DRIFT = 0.01;
export const LIMIT_PAPER_FILL_SYMBOL_COOLDOWN_MS = 4 * 60 * 60_000;
export const LIMIT_PAPER_FILL_STOP_LOSS_ROE_PCT = 20;

export const LIMIT_PAPER_FILL_ROUTES = Object.freeze(LIMIT_PAPER_FILL_LABELS.map((signalLabel) => Object.freeze({
  source: LIMIT_PAPER_FILL_SOURCE,
  streamId: LIMIT_PAPER_FILL_STREAM,
  signalLabel,
  side: 'LONG',
})));

const finite = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const epoch = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const validSymbol = (value) => {
  const symbol = String(value ?? '').trim().toUpperCase().replace(/[-/_\s]/gu, '');
  return symbol !== 'USDT' && symbol.length <= 50 && /^[\p{L}\p{N}]+USDT$/u.test(symbol)
    ? symbol : null;
};

export function limitPaperFillRoute(record = {}) {
  if (record.source !== 'ema99-observe-only'
    || record.streamId !== 'ema99-retest'
    || record.side !== 'LONG'
    || record.interval !== '15m'
    || !LIMIT_PAPER_FILL_LABELS.includes(record.label)) return null;
  return LIMIT_PAPER_FILL_ROUTES.find((route) => route.signalLabel === record.label) ?? null;
}

export function buildLimitPaperFillOrder(fillEvent = {}, {
  now = Date.now(), enabledAt, markPrice, routeState,
} = {}) {
  const record = fillEvent.record ?? {};
  const candidate = fillEvent.candidate ?? {};
  const route = limitPaperFillRoute(record);
  const settings = route ? resolveOtherEntrySettings(route, routeState) : null;
  const symbol = validSymbol(record.symbol);
  const createdAt = epoch(record.createdAt);
  const filledAt = epoch(candidate.filledAt);
  const activationAt = epoch(enabledAt);
  const fillPrice = finite(candidate.fillPrice);
  const mark = finite(markPrice ?? fillEvent.markPrice);
  if (!route || !settings || !symbol
    || candidate.key !== 'SHALLOW' || candidate.status !== 'OPEN'
    || ![createdAt, filledAt, activationAt, fillPrice, mark].every(Number.isFinite)
    || createdAt < activationAt || filledAt < activationAt || filledAt > now
    || now - filledAt > LIMIT_PAPER_FILL_MAX_AGE_MS
    || fillPrice <= 0 || mark <= 0
    || Math.abs(mark / fillPrice - 1) > LIMIT_PAPER_FILL_MAX_MARK_DRIFT) return null;

  const { marginUsdt, leverage, takeProfitRoePct } = settings;
  const takeProfitDistanceFraction = (takeProfitRoePct / 100) / leverage;
  const stopLossDistanceFraction = (LIMIT_PAPER_FILL_STOP_LOSS_ROE_PCT / 100) / leverage;
  const key = `${record.id}|${candidate.key}|${filledAt}`;
  return {
    ...route,
    signalType: route.signalLabel,
    signalInterval: '15m',
    executionPage: 'limit-paper-lab',
    side: 'BUY',
    symbol,
    orderType: 'MARKET',
    marginUsdt,
    notionalUsdt: marginUsdt * leverage,
    leverage,
    signalEntryPrice: mark,
    entryExpiresAt: filledAt + LIMIT_PAPER_FILL_MAX_AGE_MS,
    takeProfitPrice: mark * (1 + takeProfitDistanceFraction),
    stopLossPrice: mark * (1 - stopLossDistanceFraction),
    takeProfitRoePct,
    stopLossRoePct: LIMIT_PAPER_FILL_STOP_LOSS_ROE_PCT,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: LIMIT_PAPER_FILL_BINANCE_VERSION,
    takeProfitDistanceFraction,
    stopLossDistanceFraction,
    protectionSignalEntryPrice: mark,
    protectionSignalTakeProfitPrice: mark * (1 + takeProfitDistanceFraction),
    protectionSignalStopLossPrice: mark * (1 - stopLossDistanceFraction),
    allowMinNotionalCeil: true,
    dryRun: false,
    maxOpenPositions: 30,
    clientOrderId: `lpf_${createHash('sha256').update(key).digest('hex').slice(0, 24)}`,
    signalCombo: `LIMIT_PAPER_SHALLOW_FILL|15m|${record.label}`,
    signalReason: [
      LIMIT_PAPER_FILL_BINANCE_VERSION,
      'paper LIMIT SHALLOW touched; submit MARKET only now',
      `paperRecord=${record.id}`,
      `paperLimit=${fillPrice}`,
      `paperFilledAt=${new Date(filledAt).toISOString()}`,
      `markAtSubmit=${mark}`,
    ].join(' | '),
  };
}

function readState(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed?.attempts && parsed?.symbols ? parsed : null;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: LIMIT_PAPER_FILL_BINANCE_VERSION, attempts: {}, symbols: {} };
    return null;
  }
}

function saveState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify({
    ...state,
    version: LIMIT_PAPER_FILL_BINANCE_VERSION,
    updatedAt: new Date().toISOString(),
  }, null, 2));
  renameSync(`${file}.tmp`, file);
}

const hasPosition = (positions, symbol) => (positions ?? []).some((position) => (
  position.symbol === symbol && Math.abs(Number(position.positionAmt)) > 0
));
const hasEntryOrder = (orders, symbol) => (orders ?? []).some((order) => (
  order.symbol === symbol
  && order.reduceOnly !== true && order.reduceOnly !== 'true'
  && order.closePosition !== true && order.closePosition !== 'true'
));

export class LimitPaperFillBinanceRunner {
  constructor({ file, controls, now = () => Date.now(), getContext, getMarketRegime, submit }) {
    Object.assign(this, { file, controls, now, getContext, getMarketRegime, submit });
    this.queue = Promise.resolve();
  }

  handle(fillEvent) {
    const task = this.queue.then(() => this.handleOne(fillEvent));
    this.queue = task.catch(() => {});
    return task;
  }

  async handleOne(fillEvent) {
    const routeSpec = limitPaperFillRoute(fillEvent?.record);
    if (!routeSpec) return { status: 'not-selected' };
    const registered = this.controls.register(routeSpec);
    let controls = this.controls.read();
    let routeState = controls.routes[registered.key];
    if (!controls.enabled || routeState?.enabled !== true) return { status: 'off' };
    let marketRegime = this.getMarketRegime?.();
    if (marketRegime?.state !== 'RISK_ON' || marketRegime.allowLongEntry !== true) {
      return { status: 'market-regime-blocked', marketRegime: marketRegime?.state ?? 'WAIT_DATA' };
    }
    let plan = buildLimitPaperFillOrder(fillEvent, {
      now: this.now(), enabledAt: routeState.enabledAt,
      markPrice: fillEvent.markPrice, routeState,
    });
    if (!plan) return { status: 'ineligible' };

    const state = readState(this.file);
    if (!state) return { status: 'state-error' };
    const lastSymbolAt = finite(state.symbols[plan.symbol]);
    if (state.attempts[plan.clientOrderId]
      || (lastSymbolAt != null && this.now() - lastSymbolAt < LIMIT_PAPER_FILL_SYMBOL_COOLDOWN_MS)) {
      return { status: 'deduped' };
    }

    const context = await this.getContext(plan.symbol);
    if (!context?.enabled) return { status: 'runtime-off' };
    if (hasPosition(context.positions, plan.symbol)) return { status: 'existing-position' };
    if (hasEntryOrder(context.openOrders, plan.symbol)) return { status: 'existing-order' };

    controls = this.controls.read();
    routeState = controls.routes[registered.key];
    if (!controls.enabled || routeState?.enabled !== true) return { status: 'control-changed' };
    marketRegime = this.getMarketRegime?.();
    if (marketRegime?.state !== 'RISK_ON' || marketRegime.allowLongEntry !== true) {
      return { status: 'market-regime-blocked', marketRegime: marketRegime?.state ?? 'WAIT_DATA' };
    }
    plan = buildLimitPaperFillOrder(fillEvent, {
      now: this.now(), enabledAt: routeState.enabledAt,
      markPrice: context.markPrice, routeState,
    });
    if (!plan) return { status: 'price-or-age-blocked' };
    plan.signalReason += ` | marketRegime=${marketRegime.state}`;
    this.controls.assertEntry(plan);

    state.attempts[plan.clientOrderId] = {
      symbol: plan.symbol,
      signalLabel: plan.signalLabel,
      paperRecordId: fillEvent.record.id,
      paperCandidate: fillEvent.candidate.key,
      at: this.now(),
      status: 'SUBMITTING',
      marketRegimeVersion: marketRegime.version ?? null,
      marketRegimeState: marketRegime.state,
    };
    state.symbols[plan.symbol] = this.now();
    saveState(this.file, state);
    try {
      const result = await this.submit(plan, context);
      const attempt = state.attempts[plan.clientOrderId];
      attempt.status = result?.status ?? 'UNKNOWN';
      attempt.orderId = result?.orderResult?.orderId ?? null;
      saveState(this.file, state);
      return {
        status: attempt.status,
        orderId: attempt.orderId,
        signalLabel: plan.signalLabel,
        marginUsdt: plan.marginUsdt,
        leverage: plan.leverage,
        takeProfitRoePct: plan.takeProfitRoePct,
        stopLossRoePct: plan.stopLossRoePct,
      };
    } catch (error) {
      const attempt = state.attempts[plan.clientOrderId];
      attempt.status = 'ERROR_OR_UNKNOWN';
      attempt.errorCode = error.code ?? null;
      saveState(this.file, state);
      throw error;
    }
  }
}
