import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import {
  HTF_DEEP_DUMP_BASE_RECLAIM_RULE,
  HTF_DEEP_DUMP_BASE_RECLAIM_VERSION,
  HTF_DEEP_DUMP_RETEST_LONG_READY,
  HTF_DEEP_PUMP_RETEST_SHORT_READY,
} from './htfDeepDumpBaseReclaim.js';
import { resolveOtherEntrySettings } from './otherEntryCatalog.js';

export const HTF_DEEP_BASE_RETEST_BINANCE_VERSION =
  'HTF_DEEP_BASE_RETEST_EDITABLE_ENTRY_SETTINGS_V4_20260914';

export const HTF_DEEP_BASE_RETEST_LONG_ROUTE = Object.freeze({
  source: 'htf-deep-base-ready',
  streamId: 'htf-deep-base-15m',
  signalLabel: HTF_DEEP_DUMP_RETEST_LONG_READY,
  side: 'LONG',
});

export const HTF_DEEP_BASE_RETEST_SHORT_ROUTE = Object.freeze({
  source: 'htf-deep-base-ready',
  streamId: 'htf-deep-base-15m',
  signalLabel: HTF_DEEP_PUMP_RETEST_SHORT_READY,
  side: 'SHORT',
});

export const HTF_DEEP_BASE_RETEST_ROUTES = Object.freeze([
  HTF_DEEP_BASE_RETEST_LONG_ROUTE,
  HTF_DEEP_BASE_RETEST_SHORT_ROUTE,
]);

export const HTF_DEEP_BASE_RETEST_MARGIN_USDT = 5;
export const HTF_DEEP_BASE_RETEST_LEVERAGE = 5;
export const HTF_DEEP_BASE_RETEST_TP_ROE = 0.15;
export const HTF_DEEP_BASE_RETEST_SL_ROE = 0.30;
export const HTF_DEEP_BASE_RETEST_MAX_AGE_MS = 90_000;
export const HTF_DEEP_BASE_RETEST_MAX_MARK_DRIFT = 0.005;
export const HTF_DEEP_BASE_RETEST_SYMBOL_COOLDOWN_MS = 4 * 60 * 60_000;

const finite = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function htfDeepBaseRetestRoute(event = {}) {
  if (![event.version, event.detectorVersion].includes(HTF_DEEP_DUMP_BASE_RECLAIM_VERSION)
    || event.interval !== '15m'
    || event.closed !== true
    || event.binanceEligible !== true
    || event.executionEligible !== true
    || event.observeOnly !== false) return null;
  if (event.side === 'LONG' && event.stage === HTF_DEEP_DUMP_RETEST_LONG_READY) {
    return HTF_DEEP_BASE_RETEST_LONG_ROUTE;
  }
  if (event.side === 'SHORT' && event.stage === HTF_DEEP_PUMP_RETEST_SHORT_READY) {
    const reboundPct = finite(event.shortReboundPct);
    const reboundAtr = finite(event.shortReboundAtrMultiple);
    const fadePct = finite(event.shortFadePct);
    const fadeAtr = finite(event.shortFadeAtrMultiple);
    if (reboundPct == null
      || reboundAtr == null
      || fadePct == null
      || fadeAtr == null
      || reboundPct < HTF_DEEP_DUMP_BASE_RECLAIM_RULE.shortMinReboundPct
      || reboundAtr < HTF_DEEP_DUMP_BASE_RECLAIM_RULE.shortMinReboundAtr
      || fadePct < HTF_DEEP_DUMP_BASE_RECLAIM_RULE.shortMinFadePct
      || fadeAtr < HTF_DEEP_DUMP_BASE_RECLAIM_RULE.shortMinFadeAtr) return null;
    return HTF_DEEP_BASE_RETEST_SHORT_ROUTE;
  }
  return null;
}

export function buildHtfDeepBaseRetestOrder(event, {
  now = Date.now(),
  enabledAt,
  markPrice,
  routeState,
} = {}) {
  const route = htfDeepBaseRetestRoute(event);
  if (!route) return null;
  const entrySettings = resolveOtherEntrySettings(route, routeState);
  if (!entrySettings) return null;
  const eventAt = finite(event.candleCloseAt);
  const generatedAt = Date.parse(event.generatedAt);
  const enabledAtMs = Date.parse(enabledAt);
  const entry = finite(event.price);
  const mark = finite(markPrice);
  if (![eventAt, generatedAt, enabledAtMs, entry, mark].every(Number.isFinite)
    || eventAt < enabledAtMs
    || eventAt > now
    || generatedAt > now
    || now - eventAt > HTF_DEEP_BASE_RETEST_MAX_AGE_MS
    || now - generatedAt > HTF_DEEP_BASE_RETEST_MAX_AGE_MS
    || entry <= 0
    || mark <= 0
    || Math.abs(mark / entry - 1) > HTF_DEEP_BASE_RETEST_MAX_MARK_DRIFT) return null;

  const isLong = route.side === 'LONG';
  const takeProfitDistanceFraction = (entrySettings.takeProfitRoePct / 100)
    / entrySettings.leverage;
  const stopLossDistanceFraction = HTF_DEEP_BASE_RETEST_SL_ROE
    / entrySettings.leverage;
  const takeProfitPrice = entry * (isLong
    ? 1 + takeProfitDistanceFraction
    : 1 - takeProfitDistanceFraction);
  const stopLossPrice = entry * (isLong
    ? 1 - stopLossDistanceFraction
    : 1 + stopLossDistanceFraction);
  const key = [event.symbol, event.htfInterval, event.episodeBucketAt, event.stage].join('|');

  return {
    source: route.source,
    streamId: route.streamId,
    signalLabel: route.signalLabel,
    signalType: route.signalLabel,
    signalInterval: event.confirmationInterval === '5m' ? '5m' : '15m',
    executionPage: 'binance-auto-controls',
    side: isLong ? 'BUY' : 'SELL',
    symbol: event.symbol,
    orderType: 'MARKET',
    marginUsdt: entrySettings.marginUsdt,
    notionalUsdt: entrySettings.marginUsdt * entrySettings.leverage,
    leverage: entrySettings.leverage,
    signalEntryPrice: entry,
    entryExpiresAt: eventAt + HTF_DEEP_BASE_RETEST_MAX_AGE_MS,
    takeProfitPrice,
    stopLossPrice,
    takeProfitRoePct: entrySettings.takeProfitRoePct,
    stopLossRoePct: HTF_DEEP_BASE_RETEST_SL_ROE * 100,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: HTF_DEEP_BASE_RETEST_BINANCE_VERSION,
    takeProfitDistanceFraction,
    stopLossDistanceFraction,
    protectionSignalEntryPrice: entry,
    protectionSignalTakeProfitPrice: takeProfitPrice,
    protectionSignalStopLossPrice: stopLossPrice,
    allowMinNotionalCeil: false,
    dryRun: false,
    maxOpenPositions: 30,
    clientOrderId: `hdb_${createHash('sha256').update(key).digest('hex').slice(0, 26)}`,
    signalCombo: `${event.htfInterval}|${event.confirmationInterval ?? '15m'}|${event.stage}|${event.shockTier}`,
    signalReason: [
      HTF_DEEP_BASE_RETEST_BINANCE_VERSION,
      `stage=${event.stage}`,
      `side=${event.side}`,
      `htf=${event.htfInterval}`,
      `confirmation=${event.confirmationInterval ?? '15m'}`,
      `closedAt=${new Date(eventAt).toISOString()}`,
      `entry=${entry}`,
      `impulse=${event.side === 'LONG' ? event.shockPct : event.pumpPct}%`,
      `ATR=${event.trueRangeRatio}x`,
      `volume=${event.quoteVolumeRatio}x`,
      ...(event.side === 'SHORT' ? [
        `rebound=${event.shortReboundPct}%/${event.shortReboundAtrMultiple}ATR`,
        `fade=${event.shortFadePct}%/${event.shortFadeAtrMultiple}ATR`,
      ] : []),
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
    return { version: HTF_DEEP_BASE_RETEST_BINANCE_VERSION, attempts: {}, symbols: {} };
  }
}

function saveState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  const next = {
    ...state,
    version: HTF_DEEP_BASE_RETEST_BINANCE_VERSION,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2));
  renameSync(`${file}.tmp`, file);
}

export class HtfDeepBaseRetestBinanceRunner {
  constructor({ file, controls, now = () => Date.now(), getContext, submit }) {
    Object.assign(this, { file, controls, now, getContext, submit });
    this.running = false;
  }

  async handle(event) {
    if (this.running) return { status: 'busy' };
    this.running = true;
    try {
      const routeSpec = htfDeepBaseRetestRoute(event);
      if (!routeSpec) return { status: 'ineligible' };
      const route = this.controls.register(routeSpec);
      const settings = this.controls.read();
      const routeState = settings.routes[route.key];
      if (!settings.enabled || routeState?.enabled !== true) return { status: 'off' };
      let plan = buildHtfDeepBaseRetestOrder(event, {
        now: this.now(), enabledAt: routeState.enabledAt, markPrice: event.price, routeState,
      });
      if (!plan) return { status: 'ineligible' };

      const state = readState(this.file);
      if (!state) return { status: 'state-error' };
      if (state.attempts[plan.clientOrderId]
        || this.now() - finite(state.symbols[plan.symbol]) < HTF_DEEP_BASE_RETEST_SYMBOL_COOLDOWN_MS) {
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
      const latestRoute = latest.routes[route.key];
      if (!latest.enabled || latestRoute?.enabled !== true) return { status: 'control-changed' };
      plan = buildHtfDeepBaseRetestOrder(event, {
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
          side: event.side,
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
    } finally {
      this.running = false;
    }
  }
}
