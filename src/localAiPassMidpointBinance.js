import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import {
  LOCAL_AI_PASS_MIDPOINT_ENTRY_VERSION,
  LOCAL_AI_PASS_MIDPOINT_FALLBACK_STOP_LOSS_ROE_PCT,
  LOCAL_AI_PASS_MIDPOINT_LEVERAGE,
  LOCAL_AI_PASS_MIDPOINT_MARGIN_USDT,
  LOCAL_AI_PASS_MIDPOINT_MAX_OPEN_POSITIONS,
  LOCAL_AI_PASS_MIDPOINT_MAX_SIGNAL_AGE_MS,
  LOCAL_AI_PASS_MIDPOINT_MAX_STRUCTURAL_SL_ROE_PCT,
  LOCAL_AI_PASS_MIDPOINT_SIGNAL_LABEL,
  LOCAL_AI_PASS_MIDPOINT_SIGNAL_STAGE,
  LOCAL_AI_PASS_MIDPOINT_SOURCE,
  LOCAL_AI_PASS_MIDPOINT_STREAM,
  LOCAL_AI_PASS_MIDPOINT_TAKE_PROFIT_ROE_PCT,
  LOCAL_AI_PASS_MIDPOINT_TOUCH_TOLERANCE_PCT,
  LOCAL_AI_PASS_MIDPOINT_ROUTES,
  localAiPassMidpointRoute,
} from './localAiPassMidpointContract.js';
import { resolveOtherEntrySettings } from './otherEntryCatalog.js';

export { LOCAL_AI_PASS_MIDPOINT_ENTRY_VERSION, LOCAL_AI_PASS_MIDPOINT_ROUTES };

const RETAIN_MS = 7 * 24 * 60 * 60_000;

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function epoch(value, fallback = null) {
  const numeric = finite(value);
  if (numeric != null) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedZone(zone = {}) {
  const left = finite(zone.low);
  const right = finite(zone.high);
  if (!(left > 0) || !(right > 0)) return null;
  const low = Math.min(left, right);
  const high = Math.max(left, right);
  return { low, high, mid: (low + high) / 2 };
}

function setupSourceAt(evaluation = {}, candidate = {}) {
  return epoch(candidate?.deterministic?.closedAt,
    epoch(evaluation.inputGeneratedAt, epoch(evaluation.evaluatedAt)));
}

function setupIdOf(evaluation = {}, candidate = {}) {
  const sourceAt = setupSourceAt(evaluation, candidate);
  const symbol = String(candidate.symbol ?? '').toUpperCase();
  const side = String(candidate.side ?? '').toUpperCase();
  return sourceAt && symbol && side ? `${symbol}|${side}|${sourceAt}` : null;
}

export function isLocalAiPassMidpointCandidate(candidate = {}) {
  const symbol = String(candidate.symbol ?? '').toUpperCase();
  const side = String(candidate.side ?? '').toUpperCase();
  const zone = normalizedZone(candidate?.deterministic?.entryZone);
  return /^[A-Z0-9]{2,40}USDT$/.test(symbol)
    && ['LONG', 'SHORT'].includes(side)
    && candidate.verdict === 'PRIORITY'
    && zone !== null;
}

export function isLocalAiPassMidpointEvaluationEligible(evaluation = {}) {
  return evaluation?.deterministicFallback !== true
    && evaluation?.fallback?.active !== true
    && evaluation?.modelApplied !== false;
}

export function localAiPassMidpointTouched(previousMark, currentMark, entryZone, {
  tolerancePct = LOCAL_AI_PASS_MIDPOINT_TOUCH_TOLERANCE_PCT,
} = {}) {
  const previous = finite(previousMark);
  const current = finite(currentMark);
  const zone = normalizedZone(entryZone);
  if (!(current > 0) || !zone) return false;
  const toleranceFraction = Math.max(0, finite(tolerancePct, 0)) / 100;
  const low = zone.low * (1 - toleranceFraction);
  const high = zone.high * (1 + toleranceFraction);
  if (current >= low && current <= high) return true;
  if (!(previous > 0)) return false;
  return (previous < low && current > high) || (previous > high && current < low);
}

export function localAiPassMidpointSetup(evaluation = {}, candidate = {}, now = Date.now()) {
  if (!isLocalAiPassMidpointCandidate(candidate)) return null;
  const evaluationAt = epoch(evaluation.evaluatedAt);
  const sourceAt = setupSourceAt(evaluation, candidate);
  const id = setupIdOf(evaluation, candidate);
  const zone = normalizedZone(candidate.deterministic.entryZone);
  if (!id || !(evaluationAt > 0) || !(sourceAt > 0) || evaluationAt > now + 5_000
    || now - evaluationAt > LOCAL_AI_PASS_MIDPOINT_MAX_SIGNAL_AGE_MS) return null;
  return {
    id,
    version: LOCAL_AI_PASS_MIDPOINT_ENTRY_VERSION,
    symbol: String(candidate.symbol).toUpperCase(),
    direction: String(candidate.side).toUpperCase(),
    sourceAt,
    evaluationAt,
    expiresAt: evaluationAt + LOCAL_AI_PASS_MIDPOINT_MAX_SIGNAL_AGE_MS,
    horizon: candidate.horizon ?? null,
    path: candidate.path ?? null,
    verdict: candidate.verdict,
    strength: finite(candidate.strength),
    qualificationVersion: candidate.qualification?.version ?? null,
    qualificationPassedCount: finite(candidate.qualification?.passedCount),
    entryZone: zone,
    invalidationPrice: finite(candidate.deterministic.invalidationPrice),
    livePriceAtEvaluation: finite(candidate.deterministic.livePrice),
    livePriceSource: candidate.deterministic.livePriceSource ?? null,
  };
}

export function buildLocalAiPassMidpointMarketOrder(setup = {}, {
  now = Date.now(), enabledAt, startedAt, markPrice, routeState,
} = {}) {
  const route = localAiPassMidpointRoute(setup.direction);
  const settings = route ? resolveOtherEntrySettings(route, routeState) : null;
  const mark = finite(markPrice);
  const evaluationAt = epoch(setup.evaluationAt);
  const expiresAt = epoch(setup.expiresAt);
  const enabledAtMs = epoch(enabledAt);
  const startedAtMs = epoch(startedAt);
  const zone = normalizedZone(setup.entryZone);
  const rawInvalidationPrice = finite(setup.invalidationPrice);
  if (!route || !settings || setup.version !== LOCAL_AI_PASS_MIDPOINT_ENTRY_VERSION
    || !/^[A-Z0-9]{2,40}USDT$/.test(String(setup.symbol ?? ''))
    || ![mark, evaluationAt, expiresAt, enabledAtMs, startedAtMs]
      .every(Number.isFinite)
    || mark <= 0 || !zone || evaluationAt < enabledAtMs || evaluationAt < startedAtMs
    || evaluationAt > now + 5_000 || expiresAt <= now
    || mark < zone.low || mark > zone.high) return null;

  const isLong = route.side === 'LONG';
  const { marginUsdt, leverage, takeProfitRoePct } = settings;
  const direction = isLong ? 1 : -1;
  const takeProfitDistanceFraction = (takeProfitRoePct / 100) / leverage;
  const structuralStopValid = rawInvalidationPrice > 0
    && (isLong ? rawInvalidationPrice < mark : rawInvalidationPrice > mark);
  const fallbackStopLossDistanceFraction = (LOCAL_AI_PASS_MIDPOINT_FALLBACK_STOP_LOSS_ROE_PCT / 100)
    / leverage;
  const invalidationPrice = structuralStopValid
    ? rawInvalidationPrice
    : mark * (1 - direction * fallbackStopLossDistanceFraction);
  const stopLossMode = structuralStopValid ? 'ENGINE_INVALIDATION' : 'FIXED_ROE_FALLBACK';
  const stopLossDistanceFraction = Math.abs(invalidationPrice / mark - 1);
  const stopLossRoePct = stopLossDistanceFraction * leverage * 100;
  if (!(stopLossRoePct > 0) || stopLossRoePct > LOCAL_AI_PASS_MIDPOINT_MAX_STRUCTURAL_SL_ROE_PCT) {
    return null;
  }
  const takeProfitPrice = mark * (1 + direction * takeProfitDistanceFraction);
  const key = `${setup.id}|${zone.mid}`;
  return {
    ...route,
    signalType: LOCAL_AI_PASS_MIDPOINT_SIGNAL_LABEL,
    signalInterval: setup.horizon ?? '1h',
    signalStageKey: LOCAL_AI_PASS_MIDPOINT_SIGNAL_STAGE,
    signalCombo: `AI_PRIORITY|${route.side}|${setup.horizon ?? 'UNKNOWN'}|ENGINE_ZONE_TOUCH`,
    executionPage: 'local-ai-trend-evaluation',
    side: isLong ? 'BUY' : 'SELL',
    symbol: setup.symbol,
    orderType: 'MARKET',
    marginUsdt,
    notionalUsdt: marginUsdt * leverage,
    leverage,
    signalEntryPrice: mark,
    entryExpiresAt: expiresAt,
    takeProfitPrice,
    stopLossPrice: invalidationPrice,
    takeProfitRoePct,
    stopLossRoePct,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: LOCAL_AI_PASS_MIDPOINT_ENTRY_VERSION,
    takeProfitDistanceFraction,
    stopLossDistanceFraction,
    protectionSignalEntryPrice: mark,
    protectionSignalTakeProfitPrice: takeProfitPrice,
    protectionSignalStopLossPrice: invalidationPrice,
    allowMinNotionalCeil: false,
    dryRun: false,
    maxOpenPositions: LOCAL_AI_PASS_MIDPOINT_MAX_OPEN_POSITIONS,
    clientOrderId: `aim_${isLong ? 'l' : 's'}_${createHash('sha256').update(key).digest('hex').slice(0, 22)}`,
    signalReason: [
      LOCAL_AI_PASS_MIDPOINT_ENTRY_VERSION,
      `evaluationAt=${new Date(evaluationAt).toISOString()}`,
      `sourceAt=${new Date(setup.sourceAt).toISOString()}`,
      `qualification=${setup.qualificationPassedCount ?? '-'}/6`,
      `strength=${setup.strength ?? '-'}`,
      `path=${setup.path ?? '-'}`,
      `entryZone=${zone.low}-${zone.high}`,
      `engineZone=${zone.low}-${zone.high}`,
      `mark=${mark}`,
      `invalidation=${invalidationPrice}`,
      `stopLossMode=${stopLossMode}`,
    ].join(' | '),
  };
}

function freshState(now) {
  return {
    version: LOCAL_AI_PASS_MIDPOINT_ENTRY_VERSION,
    initializedAt: now,
    updatedAt: now,
    active: {},
    attempts: {},
    consumed: {},
  };
}

export class LocalAiPassMidpointBinanceRunner {
  constructor({
    file, controls, getContext, submit, now = () => Date.now(), startedAt = now(), onSymbolsChanged,
  } = {}) {
    Object.assign(this, { file, controls, getContext, submit, now, startedAt, onSymbolsChanged });
    this.state = null;
    this.queue = Promise.resolve();
    this.lastMarkBySymbol = new Map();
  }

  async load() {
    if (this.state) return this.state;
    const now = this.now();
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      this.state = {
        ...freshState(now),
        ...(parsed && typeof parsed === 'object' ? parsed : {}),
        version: LOCAL_AI_PASS_MIDPOINT_ENTRY_VERSION,
        active: parsed?.active && typeof parsed.active === 'object' ? parsed.active : {},
        attempts: parsed?.attempts && typeof parsed.attempts === 'object' ? parsed.attempts : {},
        consumed: parsed?.consumed && typeof parsed.consumed === 'object' ? parsed.consumed : {},
      };
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[LocalAiPassMidpoint] state load failed: ${error.message}`);
      this.state = freshState(now);
    }
    this.#prune();
    return this.state;
  }

  #prune() {
    if (!this.state) return;
    const now = this.now();
    const cutoff = now - RETAIN_MS;
    this.state.active = Object.fromEntries(Object.entries(this.state.active)
      .filter(([, setup]) => epoch(setup?.expiresAt, 0) > now));
    this.state.attempts = Object.fromEntries(Object.entries(this.state.attempts)
      .filter(([, attempt]) => epoch(attempt?.at, 0) >= cutoff));
    this.state.consumed = Object.fromEntries(Object.entries(this.state.consumed)
      .filter(([, at]) => epoch(at, 0) >= cutoff));
  }

  async save() {
    if (!this.file || !this.state) return;
    this.#prune();
    this.state.updatedAt = this.now();
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(this.state, null, 2), 'utf8');
    await rename(`${this.file}.tmp`, this.file);
  }

  symbols() {
    this.#prune();
    return [...new Set(Object.values(this.state?.active ?? {})
      .filter((setup) => !this.state.consumed[setup.id])
      .map((setup) => setup.symbol))];
  }

  snapshot() {
    const active = Object.values(this.state?.active ?? {});
    return {
      version: LOCAL_AI_PASS_MIDPOINT_ENTRY_VERSION,
      runtimeSignalKey: LOCAL_AI_PASS_MIDPOINT_SIGNAL_LABEL,
      marginUsdt: LOCAL_AI_PASS_MIDPOINT_MARGIN_USDT,
      leverage: LOCAL_AI_PASS_MIDPOINT_LEVERAGE,
      takeProfitRoePct: LOCAL_AI_PASS_MIDPOINT_TAKE_PROFIT_ROE_PCT,
      active: active.length,
      symbols: this.symbols(),
      setups: active.map((setup) => ({
        id: setup.id, symbol: setup.symbol, side: setup.direction,
        entryZone: setup.entryZone, expiresAt: setup.expiresAt,
        consumed: Boolean(this.state?.consumed?.[setup.id]),
      })),
      updatedAt: this.state?.updatedAt ?? null,
    };
  }

  syncEvaluation(evaluation = {}) {
    const task = this.queue.catch(() => {}).then(async () => {
      await this.load();
      const active = {};
      const candidates = isLocalAiPassMidpointEvaluationEligible(evaluation)
        ? (Array.isArray(evaluation?.candidates) ? evaluation.candidates : []) : [];
      for (const candidate of candidates) {
        const setup = localAiPassMidpointSetup(evaluation, candidate, this.now());
        if (setup && !this.state.consumed[setup.id]) active[setup.id] = setup;
      }
      this.state.active = active;
      await this.save();
      this.onSymbolsChanged?.(this.symbols());
      return this.snapshot();
    });
    this.queue = task.catch(() => {});
    return task;
  }

  onMark({ symbol, markPrice, at } = {}) {
    const normalizedSymbol = String(symbol ?? '').toUpperCase();
    const mark = finite(markPrice);
    const eventAt = epoch(at, this.now());
    if (!normalizedSymbol || !(mark > 0)) return Promise.resolve({ status: 'ignored' });
    const previous = this.lastMarkBySymbol.get(normalizedSymbol);
    this.lastMarkBySymbol.set(normalizedSymbol, mark);
    const task = this.queue.catch(() => {}).then(async () => {
      await this.load();
      const setups = Object.values(this.state.active)
        .filter((setup) => setup.symbol === normalizedSymbol && !this.state.consumed[setup.id]);
      const results = [];
      for (const setup of setups) {
        if (eventAt > setup.expiresAt) continue;
        if (!localAiPassMidpointTouched(previous, mark, setup.entryZone)) continue;
        results.push(await this.#execute(setup, mark, eventAt));
      }
      return { status: results.length ? 'processed' : 'waiting-engine-zone', results };
    });
    this.queue = task.catch(() => {});
    return task;
  }

  async #execute(setup, tickMark, eventAt) {
    const route = localAiPassMidpointRoute(setup.direction);
    const registered = this.controls.register(route);
    const controlSnapshot = this.controls.read();
    const routeState = controlSnapshot.routes?.[registered.key];
    if (!controlSnapshot.enabled || routeState?.enabled !== true) {
      return { status: 'off', symbol: setup.symbol, side: setup.direction };
    }
    const enabledAt = epoch(routeState.enabledAt);
    if (!(enabledAt > 0) || setup.evaluationAt < enabledAt || setup.evaluationAt < this.startedAt) {
      return { status: 'pre-enable-signal', symbol: setup.symbol, side: setup.direction };
    }
    const attemptId = `${setup.id}|${setup.entryZone.mid}`;
    if (this.state.attempts[attemptId] || this.state.consumed[setup.id]) {
      return { status: 'deduped', symbol: setup.symbol, side: setup.direction };
    }
    try {
      const context = await this.getContext(setup.symbol);
      if (!context?.enabled) return { status: 'runtime-off', symbol: setup.symbol, side: setup.direction };
      if ((context.positions ?? []).some((position) => (
        position.symbol === setup.symbol && Math.abs(Number(position.positionAmt)) > 0
      ))) return { status: 'existing-position', symbol: setup.symbol, side: setup.direction };
      if ((context.openOrders ?? []).some((order) => (
        order.symbol === setup.symbol
        && order.reduceOnly !== true && order.reduceOnly !== 'true'
        && order.closePosition !== true && order.closePosition !== 'true'
      ))) return { status: 'existing-order', symbol: setup.symbol, side: setup.direction };

      const latest = this.controls.read();
      const latestRoute = latest.routes?.[registered.key];
      if (!latest.enabled || latestRoute?.enabled !== true
        || String(latestRoute.enabledAt ?? '') !== String(routeState.enabledAt ?? '')) {
        return { status: 'control-changed', symbol: setup.symbol, side: setup.direction };
      }
      const plan = buildLocalAiPassMidpointMarketOrder(setup, {
        now: this.now(), enabledAt: latestRoute.enabledAt, startedAt: this.startedAt,
        markPrice: context.markPrice, routeState: latestRoute,
      });
      if (!plan) return { status: 'price-age-or-risk-blocked', symbol: setup.symbol, side: setup.direction };
      this.controls.assertEntry(plan);
      const attempt = {
        id: attemptId,
        setupId: setup.id,
        symbol: setup.symbol,
        direction: setup.direction,
        eventAt,
        tickMark,
        submitMark: context.markPrice,
        at: this.now(),
        status: 'SUBMITTING',
        clientOrderId: plan.clientOrderId,
      };
      this.state.attempts[attemptId] = attempt;
      this.state.consumed[setup.id] = this.now();
      await this.save();
      this.onSymbolsChanged?.(this.symbols());
      const result = await this.submit(plan, context);
      attempt.status = String(result?.status ?? 'UNKNOWN').toUpperCase();
      attempt.orderId = result?.orderResult?.orderId ?? null;
      attempt.marginUsdt = plan.marginUsdt;
      attempt.leverage = plan.leverage;
      await this.save();
      return {
        status: result?.status ?? 'unknown', symbol: setup.symbol, side: setup.direction,
        orderId: attempt.orderId, marginUsdt: plan.marginUsdt, leverage: plan.leverage,
      };
    } catch (error) {
      const attempt = this.state.attempts[attemptId] ?? {
        id: attemptId, setupId: setup.id, symbol: setup.symbol,
        direction: setup.direction, at: this.now(),
      };
      attempt.status = 'ERROR_OR_UNKNOWN';
      attempt.errorCode = error?.code ?? null;
      attempt.error = String(error?.message ?? error).slice(0, 300);
      this.state.attempts[attemptId] = attempt;
      this.state.consumed[setup.id] = this.now();
      await this.save();
      this.onSymbolsChanged?.(this.symbols());
      return {
        status: 'error', symbol: setup.symbol, side: setup.direction,
        error: attempt.error, errorCode: attempt.errorCode,
      };
    }
  }
}
