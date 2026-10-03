import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import {
  BTC_RELATIVE_MIN_TREND_SCORE,
  BTC_RELATIVE_NEAR_ENTRY_PCT,
  evaluateBtcRelativeContext,
} from '../public/btc-relative-strength-model.js';
import { resolveOtherEntrySettings } from './otherEntryCatalog.js';

export const BTC_RELATIVE_STRENGTH_BINANCE_VERSION =
  'BTC_RELATIVE_STRENGTH_READY_CAUSAL_ALPHA_ONE_SETUP_V4_20260929';
export const BTC_RELATIVE_STRENGTH_MAX_SIGNAL_AGE_MS = 90_000;
export const BTC_RELATIVE_STRENGTH_MAX_MARK_DRIFT = 0.005;
export const BTC_RELATIVE_STRENGTH_SYMBOL_COOLDOWN_MS = 4 * 60 * 60_000;
export const BTC_RELATIVE_STRENGTH_MAX_OPEN_POSITIONS = 50;

export const BTC_RELATIVE_STRENGTH_ROUTES = Object.freeze([
  Object.freeze({
    source: 'btc-relative-strength-watch',
    streamId: 'opposite-btc-5m',
    signalLabel: 'RELATIVE_ENTRY_READY',
    side: 'LONG',
  }),
  Object.freeze({
    source: 'btc-relative-strength-watch',
    streamId: 'opposite-btc-5m',
    signalLabel: 'RELATIVE_ENTRY_READY',
    side: 'SHORT',
  }),
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

export function btcRelativeStrengthRoute(row = {}) {
  if (row?.relative?.key !== 'RELATIVE_ENTRY_READY'
    || row?.relative?.contextActive !== true
    || row?.relative?.nearEntry !== true
    || row?.relative?.inZone !== true
    || row?.active !== true
    || row?.coinTrigger !== true
    || !['LONG', 'SHORT'].includes(row?.side)) return null;
  return BTC_RELATIVE_STRENGTH_ROUTES.find((route) => route.side === row.side) ?? null;
}

export function buildBtcRelativeStrengthMarketOrder(row = {}, {
  now = Date.now(), enabledAt, startedAt, markPrice, routeState, btc = {},
} = {}) {
  const route = btcRelativeStrengthRoute(row);
  const settings = route ? resolveOtherEntrySettings(route, routeState) : null;
  const triggerAt = epoch(row.lastClosed5mAt);
  const confirmationAt = epoch(row.confirmationAt);
  const evaluatedAt = epoch(row.evaluatedAt);
  const enabledAtMs = epoch(enabledAt);
  const startedAtMs = epoch(startedAt);
  const poolExpiresAt = epoch(row.poolExpiresAt);
  const signalPrice = finite(row.livePrice);
  const mark = finite(markPrice);
  const zoneLow = finite(row.entryZone?.low);
  const zoneHigh = finite(row.entryZone?.high);
  const zoneMid = finite(row.entryZone?.mid);
  const frames = row.currentFrames ?? {};
  const trendScore = finite(row.currentTrendScore, 0);
  const relativeContext = evaluateBtcRelativeContext(row, route?.side, btc);
  const correctTrend = route?.side === 'LONG'
    ? frames['1h'] === 'UP' && frames['4h'] === 'UP' && trendScore >= BTC_RELATIVE_MIN_TREND_SCORE
    : frames['1h'] === 'DOWN' && frames['4h'] === 'DOWN' && trendScore <= -BTC_RELATIVE_MIN_TREND_SCORE;
  if (!route || !settings || !/^[A-Z0-9]{2,40}USDT$/.test(String(row.symbol ?? ''))
    || ![triggerAt, confirmationAt, evaluatedAt, enabledAtMs, startedAtMs, poolExpiresAt,
      signalPrice, mark, zoneLow, zoneHigh, zoneMid].every(Number.isFinite)
    || triggerAt < confirmationAt
    || triggerAt < enabledAtMs || triggerAt < startedAtMs
    || triggerAt > now || now - triggerAt > BTC_RELATIVE_STRENGTH_MAX_SIGNAL_AGE_MS
    || evaluatedAt > now + 5_000 || now - evaluatedAt > 60_000
    || poolExpiresAt <= now
    || signalPrice <= 0 || mark <= 0 || zoneLow <= 0 || zoneHigh < zoneLow
    || zoneMid < zoneLow || zoneMid > zoneHigh
    || Math.abs(mark / signalPrice - 1) > BTC_RELATIVE_STRENGTH_MAX_MARK_DRIFT
    || mark < zoneLow || mark > zoneHigh
    || Math.abs(mark / zoneMid - 1) * 100 > BTC_RELATIVE_NEAR_ENTRY_PCT
    || !correctTrend
    || relativeContext.active !== true) return null;

  const isLong = route.side === 'LONG';
  const { marginUsdt, leverage, takeProfitRoePct } = settings;
  const direction = isLong ? 1 : -1;
  const takeProfitDistanceFraction = (takeProfitRoePct / 100) / leverage;
  const takeProfitPrice = mark * (1 + direction * takeProfitDistanceFraction);
  const key = `${row.symbol}|${route.side}|${confirmationAt}|${triggerAt}`;
  return {
    ...route,
    signalType: route.signalLabel,
    signalInterval: '5m',
    signalStageKey: 'RELATIVE_ENTRY_READY',
    signalCombo: `5m+15m+1h+4h|${route.signalLabel}|${route.side}|${relativeContext.mode ?? 'UNKNOWN'}`,
    executionPage: 'btc-relative-strength-watch',
    side: isLong ? 'BUY' : 'SELL',
    symbol: row.symbol,
    orderType: 'MARKET',
    marginUsdt,
    notionalUsdt: marginUsdt * leverage,
    leverage,
    signalEntryPrice: mark,
    entryExpiresAt: triggerAt + BTC_RELATIVE_STRENGTH_MAX_SIGNAL_AGE_MS,
    takeProfitPrice,
    stopLossPrice: null,
    takeProfitRoePct,
    stopLossRoePct: null,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: BTC_RELATIVE_STRENGTH_BINANCE_VERSION,
    takeProfitDistanceFraction,
    stopLossDistanceFraction: null,
    protectionSignalEntryPrice: mark,
    protectionSignalTakeProfitPrice: takeProfitPrice,
    protectionSignalStopLossPrice: null,
    allowMinNotionalCeil: true,
    dryRun: false,
    maxOpenPositions: BTC_RELATIVE_STRENGTH_MAX_OPEN_POSITIONS,
    clientOrderId: `brs_${isLong ? 'l' : 's'}_${createHash('sha256').update(key).digest('hex').slice(0, 22)}`,
    signalReason: [
      BTC_RELATIVE_STRENGTH_BINANCE_VERSION,
      `trigger5m=${new Date(triggerAt).toISOString()}`,
      `sourceConfirmation=${new Date(confirmationAt).toISOString()}`,
      `relativeScore=${finite(row.relativeScore) ?? '-'}`,
      `trendScore=${trendScore}`,
      `btc=${btc.key ?? '-'}`,
      `btcContextMode=${relativeContext.mode ?? '-'}`,
      `coin5m=${finite(row.last5mMovePct) ?? '-'}`,
      `btc5m=${finite(btc?.pullback5m?.movePct) ?? '-'}`,
      `underperformance=${finite(relativeContext.relativeMovePct) ?? '-'}`,
      `alpha15m=${finite(relativeContext.alpha15mPct) ?? '-'}`,
      `alpha1h=${finite(relativeContext.alpha1hPct) ?? '-'}`,
      `entryZone=${zoneLow}-${zoneHigh}`,
      `mark=${mark}`,
    ].join(' | '),
  };
}

function freshState(now) {
  return {
    version: BTC_RELATIVE_STRENGTH_BINANCE_VERSION,
    initializedAt: now,
    updatedAt: now,
    attempts: {},
    symbols: {},
    setups: {},
  };
}

export class BtcRelativeStrengthBinanceRunner {
  constructor({ file, controls, getContext, submit, now = () => Date.now(), startedAt = now() } = {}) {
    Object.assign(this, { file, controls, getContext, submit, now, startedAt });
    this.state = null;
    this.queue = Promise.resolve();
  }

  async load() {
    if (this.state) return;
    const now = this.now();
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      this.state = {
        ...freshState(now),
        ...(parsed && typeof parsed === 'object' ? parsed : {}),
        version: BTC_RELATIVE_STRENGTH_BINANCE_VERSION,
        attempts: parsed?.attempts && typeof parsed.attempts === 'object' ? parsed.attempts : {},
        symbols: parsed?.symbols && typeof parsed.symbols === 'object' ? parsed.symbols : {},
        setups: parsed?.setups && typeof parsed.setups === 'object' ? parsed.setups : {},
      };
      for (const [id, attempt] of Object.entries(this.state.attempts)) {
        const setupId = String(attempt?.setupId ?? id.split('|').slice(0, 3).join('|'));
        if (setupId.split('|').length !== 3) continue;
        if (attempt?.orderId != null
          || ['SUBMITTING', 'SUBMITTED', 'FILLED', 'SUCCESS', 'NEW', 'ERROR_OR_UNKNOWN']
            .includes(String(attempt?.status ?? '').toUpperCase())) {
          this.state.setups[setupId] = finite(attempt?.at, now);
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[BtcRelativeStrengthBinance] state load failed: ${error.message}`);
      this.state = freshState(now);
    }
  }

  async save() {
    if (!this.file || !this.state) return;
    const cutoff = this.now() - RETAIN_MS;
    this.state.attempts = Object.fromEntries(Object.entries(this.state.attempts)
      .filter(([, attempt]) => finite(attempt?.at, 0) >= cutoff));
    this.state.symbols = Object.fromEntries(Object.entries(this.state.symbols)
      .filter(([, at]) => finite(at, 0) >= cutoff));
    this.state.setups = Object.fromEntries(Object.entries(this.state.setups)
      .filter(([, at]) => finite(at, 0) >= cutoff));
    this.state.updatedAt = this.now();
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(this.state, null, 2), 'utf8');
    await rename(`${this.file}.tmp`, this.file);
  }

  process({ rows = [], btc = {} } = {}) {
    const task = this.queue.catch(() => {}).then(() => this.#process(rows, btc));
    this.queue = task.catch(() => {});
    return task;
  }

  async #process(rows, btc) {
    await this.load();
    const results = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!btcRelativeStrengthRoute(row)) continue;
      results.push(await this.#handle(row, btc));
    }
    return {
      status: 'scanned',
      candidates: results.length,
      submitted: results.filter((result) => result.status === 'submitted').length,
      results,
    };
  }

  async #handle(row, btc) {
    const route = btcRelativeStrengthRoute(row);
    const registered = this.controls.register(route);
    const controlSnapshot = this.controls.read();
    const routeState = controlSnapshot.routes?.[registered.key];
    if (!controlSnapshot.enabled || routeState?.enabled !== true) {
      return { status: 'off', symbol: row.symbol, side: row.side };
    }
    const triggerAt = epoch(row.lastClosed5mAt);
    const confirmationAt = epoch(row.confirmationAt);
    const setupId = `${row.symbol}|${route.side}|${confirmationAt}`;
    const attemptId = `${setupId}|${triggerAt}`;
    if (this.state.attempts[attemptId]) return { status: 'deduped', symbol: row.symbol, side: row.side };
    if (this.state.setups[setupId]) {
      return { status: 'setup-consumed', symbol: row.symbol, side: row.side };
    }
    const preview = buildBtcRelativeStrengthMarketOrder(row, {
      now: this.now(), enabledAt: routeState.enabledAt, startedAt: this.startedAt,
      markPrice: row.livePrice, routeState, btc,
    });
    if (!preview) return { status: 'age-price-or-route-blocked', symbol: row.symbol, side: row.side };
    const previousSymbolAt = finite(this.state.symbols[row.symbol]);
    if (previousSymbolAt != null
      && this.now() - previousSymbolAt < BTC_RELATIVE_STRENGTH_SYMBOL_COOLDOWN_MS) {
      this.state.attempts[attemptId] = {
        id: attemptId, symbol: row.symbol, direction: route.side,
        triggerAt, at: this.now(), status: 'SYMBOL_COOLDOWN',
      };
      await this.save();
      return { status: 'symbol-cooldown', symbol: row.symbol, side: row.side };
    }
    const attempt = {
      id: attemptId, symbol: row.symbol, direction: route.side,
      setupId, confirmationAt, triggerAt, at: this.now(), status: 'CHECKING',
    };
    this.state.attempts[attemptId] = attempt;
    await this.save();
    try {
      const context = await this.getContext(row.symbol);
      if (!context?.enabled) return await this.#finish(attemptId, 'RUNTIME_OFF');
      if ((context.positions ?? []).some((position) => (
        position.symbol === row.symbol && Math.abs(Number(position.positionAmt)) > 0
      ))) return await this.#finish(attemptId, 'EXISTING_POSITION');
      if ((context.openOrders ?? []).some((order) => (
        order.symbol === row.symbol
        && order.reduceOnly !== true && order.reduceOnly !== 'true'
        && order.closePosition !== true && order.closePosition !== 'true'
      ))) return await this.#finish(attemptId, 'EXISTING_ORDER');

      const latest = this.controls.read();
      const latestRoute = latest.routes?.[registered.key];
      if (!latest.enabled || latestRoute?.enabled !== true
        || String(latestRoute.enabledAt ?? '') !== String(routeState.enabledAt ?? '')) {
        return await this.#finish(attemptId, 'CONTROL_CHANGED');
      }
      const plan = buildBtcRelativeStrengthMarketOrder(row, {
        now: this.now(), enabledAt: latestRoute.enabledAt, startedAt: this.startedAt,
        markPrice: context.markPrice, routeState: latestRoute, btc,
      });
      if (!plan) return await this.#finish(attemptId, 'PRICE_OR_AGE_BLOCKED');
      this.controls.assertEntry(plan);
      attempt.status = 'SUBMITTING';
      attempt.clientOrderId = plan.clientOrderId;
      this.state.setups[setupId] = this.now();
      await this.save();
      const result = await this.submit(plan, context);
      attempt.status = String(result?.status ?? 'UNKNOWN').toUpperCase();
      attempt.orderId = result?.orderResult?.orderId ?? null;
      attempt.marginUsdt = plan.marginUsdt;
      attempt.leverage = plan.leverage;
      this.state.symbols[row.symbol] = this.now();
      await this.save();
      return {
        status: result?.status ?? 'unknown', symbol: row.symbol, side: route.side,
        orderId: attempt.orderId, marginUsdt: plan.marginUsdt, leverage: plan.leverage,
      };
    } catch (error) {
      attempt.status = 'ERROR_OR_UNKNOWN';
      attempt.errorCode = error?.code ?? null;
      attempt.error = String(error?.message ?? error).slice(0, 300);
      await this.save();
      return {
        status: 'error', symbol: row.symbol, side: route.side,
        error: attempt.error, errorCode: attempt.errorCode,
      };
    }
  }

  async #finish(id, status) {
    const attempt = this.state.attempts[id];
    attempt.status = status;
    await this.save();
    return {
      status: status.toLowerCase().replaceAll('_', '-'),
      symbol: attempt.symbol,
      side: attempt.direction,
    };
  }
}
