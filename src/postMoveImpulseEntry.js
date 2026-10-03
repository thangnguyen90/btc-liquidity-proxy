import { IMPULSE_ENTRY_VERSION } from '../public/impulse-entry-model.js';

export const ENTRY_POLICY = Object.freeze({
  maxAgeMs: 60 * 60_000,
  freshPassMs: 90_000,
  freshQuoteMs: 15_000,
  maxDriftAtr: 0.35,
  minNetRR: 1.5,
  costPct: 0.12,
});
const BAR_MS = 300_000;
const num = (v) => v == null || v === '' ? NaN : Number(v);

// Work only with fully closed, ordered, valid candles. No REST calls here.
export function entryClosedRows(rows, now) {
  const normalized = (Array.isArray(rows) ? rows : []).map(r => ({
    open: num(r?.open ?? r?.[1]), high: num(r?.high ?? r?.[2]),
    low: num(r?.low ?? r?.[3]), close: num(r?.close ?? r?.[4]),
    closeTime: num(r?.closeTime ?? r?.[6]),
  })).filter(r => Object.values(r).every(Number.isFinite)
    && r.closeTime < now && r.low > 0 && r.high >= Math.max(r.open, r.close)
    && r.low <= Math.min(r.open, r.close));
  return [...new Map(normalized.map(r => [r.closeTime, r])).values()]
    .sort((a, b) => a.closeTime - b.closeTime);
}

export function captureImpulseEntry(watch, rows, now) {
  if (!watch?.symbol || watch.watchOnly !== true || watch.binanceEligible !== false
    || !((watch.side === 'LONG' && watch.stage === 'BUY_IMPULSE')
      || (watch.side === 'SHORT' && watch.stage === 'SELL_IMPULSE'))) return null;
  const bars = entryClosedRows(rows, now).filter(r => r.closeTime <= Number(watch.impulseAt));
  const impulse = bars.at(-1);
  if (!impulse || impulse.closeTime !== Number(watch.impulseAt) || bars.length < 16) return null;
  const prior = bars.slice(0, -1);
  if (impulse.closeTime - prior.at(-1).closeTime !== BAR_MS) return null;
  const sample = prior.slice(-15);
  if (sample.some((r, i) => i && r.closeTime - sample[i - 1].closeTime !== BAR_MS)) return null;
  const atr = sample.slice(1).reduce((sum, r, i) => sum + Math.max(
    r.high - r.low, Math.abs(r.high - sample[i].close), Math.abs(r.low - sample[i].close),
  ), 0) / 14;
  const side = watch.side;
  const d = side === 'LONG' ? 1 : -1;
  const base = Number(side === 'LONG' ? watch.accumulationBaseHigh : watch.distributionBaseLow);
  const invalidation = Number(watch.invalidationPrice);
  const zone = { low: Number(watch.retestZone?.low), high: Number(watch.retestZone?.high) };
  if (![atr, base, invalidation, zone.low, zone.high].every(v => Number.isFinite(v) && v > 0)
    || zone.low > zone.high || d * (impulse.close - invalidation) <= 0
    || d * (impulse.close - impulse.open) <= 0) return null;
  // Confirmed pivots use both neighbouring candles, all before the impulse.
  const pivots = [];
  for (let i = 2; i < prior.length - 2; i += 1) {
    const neighbours = prior.slice(i - 2, i + 3);
    const level = side === 'LONG' ? prior[i].high : prior[i].low;
    if (neighbours.every(r => side === 'LONG' ? r.high <= level : r.low >= level)) pivots.push(level);
  }
  return {
    version: IMPULSE_ENTRY_VERSION,
    id: `${watch.symbol}:${side}:${impulse.closeTime}`,
    symbol: watch.symbol, side, sourceStage: watch.stage, sourceScore: watch.score,
    impulseAt: impulse.closeTime, capturedAt: now, impulse, atr, base, invalidation, zone,
    targets: [...new Set(pivots)],
    expiresAt: impulse.closeTime + ENTRY_POLICY.maxAgeMs,
  };
}

function makePlan(setup, method, trigger, stop, signal, targetRows) {
  const d = setup.side === 'LONG' ? 1 : -1;
  const entry = signal.close;
  const risk = d * (entry - stop);
  if (!(risk > 0) || !(stop > 0)) return null;
  // Use the nearest known obstacle, never skip a nearby level to manufacture RR.
  const targets = [...setup.targets, ...targetRows]
    .filter(t => d * (t - entry) > 0).sort((a, b) => d * (a - b));
  const target = targets[0];
  if (!Number.isFinite(target)) return null;
  const fee = entry * ENTRY_POLICY.costPct / 100;
  const rr = (d * (target - entry) - fee) / (risk + fee);
  if (rr < ENTRY_POLICY.minNetRR) return null;
  return { method, entry, trigger, stop, target, rr, passedAt: signal.closeTime,
    costPct: ENTRY_POLICY.costPct, watchOnly: true, binanceEligible: false };
}

export function evaluateImpulseEntry(setup, rows, now) {
  const d = setup.side === 'LONG' ? 1 : -1;
  const after = entryClosedRows(rows, now).filter(r => r.closeTime > setup.impulseAt
    && r.closeTime <= setup.expiresAt);
  const holdsBase = r => d * (r.close - setup.base) > 0;
  const favourable = r => d * (r.close - r.open) > 0;
  const edge = r => setup.side === 'LONG' ? r.high : r.low;
  const stopEdge = r => setup.side === 'LONG' ? r.low : r.high;
  let waitingReason = 'WAIT_RETEST_OR_BASE';
  for (let i = 0; i < after.length; i += 1) {
    const r = after[i];
    if (r.closeTime !== setup.impulseAt + (i + 1) * BAR_MS) {
      return { status: now > setup.expiresAt ? 'EXPIRED' : 'WAITING', reason: 'DATA_GAP' };
    }
    if (d * (stopEdge(r) - setup.invalidation) <= 0) {
      return { status: 'INVALIDATED', reason: 'IMPULSE_INVALIDATED', at: r.closeTime };
    }
    if (i < 1 || !holdsBase(r) || !favourable(r)) continue;
    const previous = after[i - 1];
    // Retest/bounce must close first; only a later candle can confirm continuation.
    const touched = previous.low <= setup.zone.high && previous.high >= setup.zone.low;
    const candidates = [];
    if (touched && holdsBase(previous) && favourable(previous)
      && d * (r.close - edge(previous)) > 0) {
      const stop = (setup.side === 'LONG' ? Math.min(previous.low, r.low)
        : Math.max(previous.high, r.high)) - d * 0.1 * setup.atr;
      candidates.push(['RETEST', edge(previous), stop]);
    }
    // Two to four completed base candles followed by a distinct breakout candle.
    for (let n = Math.min(4, i); n >= 2; n -= 1) {
      const baseRows = after.slice(i - n, i);
      const high = Math.max(...baseRows.map(b => b.high));
      const low = Math.min(...baseRows.map(b => b.low));
      const retrace = setup.side === 'LONG' ? setup.impulse.close - low : high - setup.impulse.close;
      if (!baseRows.every(holdsBase) || high - low > 1.2 * setup.atr
        || retrace > Math.abs(setup.impulse.close - setup.impulse.open) * 0.6) continue;
      const trigger = setup.side === 'LONG' ? high : low;
      if (d * (r.close - trigger) > 0) {
        candidates.push(['BASE_BREAK', trigger, (setup.side === 'LONG' ? Math.min(low, r.low)
          : Math.max(high, r.high)) - d * 0.1 * setup.atr]);
        break;
      }
    }
    // Impulse extreme can remain the nearest barrier for a retest entry below it.
    for (const [method, trigger, stop] of candidates) {
      const plan = makePlan(setup, method, trigger, stop, r, [edge(setup.impulse)]);
      if (!plan) { waitingReason = 'INSUFFICIENT_TARGET_ROOM'; continue; }
      return { status: 'READY', reason: 'CLOSED_5M_CONTINUATION', plan };
    }
  }
  if (now > setup.expiresAt) return { status: 'EXPIRED', reason: 'TIMEOUT_60M' };
  return { status: 'WAITING', reason: waitingReason };
}

export function validateImpulseEntryLive(setup, plan, quote, now) {
  const d = setup.side === 'LONG' ? 1 : -1;
  if (now < plan.passedAt || now - plan.passedAt > ENTRY_POLICY.freshPassMs) return 'PASS_EXPIRED';
  const price = num(quote?.price);
  const at = num(quote?.at);
  if (!(price > 0) || !Number.isFinite(at) || at > now || now - at > ENTRY_POLICY.freshQuoteMs) return 'WAIT_LIVE';
  if (d * (price - plan.stop) <= 0) return 'STOP_BROKEN';
  if (d * (price - plan.trigger) <= 0) return 'TRIGGER_LOST';
  if (d * (price - plan.entry) > setup.atr * ENTRY_POLICY.maxDriftAtr) return 'PRICE_TOO_FAR';
  const fee = price * ENTRY_POLICY.costPct / 100;
  const rr = (d * (plan.target - price) - fee) / (d * (price - plan.stop) + fee);
  return rr >= ENTRY_POLICY.minNetRR ? 'PASS' : 'LIVE_RR_TOO_LOW';
}

export function impulseEntryBtcContext(rows, now, side) {
  const bars = entryClosedRows(rows, now).slice(-13);
  if (bars.length < 13 || now - bars.at(-1).closeTime > BAR_MS + 30_000
    || bars.some((r, i) => i && r.closeTime - bars[i - 1].closeTime !== BAR_MS)) {
    return { direction: 'UNKNOWN', alignment: 'UNKNOWN', move15m: null, move1h: null };
  }
  const close = bars.at(-1).close;
  const move15m = (close / bars.at(-4).close - 1) * 100;
  const move1h = (close / bars[0].close - 1) * 100;
  const direction = move15m > 0.05 && move1h > 0.1 ? 'UP'
    : move15m < -0.05 && move1h < -0.1 ? 'DOWN' : 'MIXED';
  const alignment = direction === 'MIXED' ? 'MIXED'
    : ((side === 'LONG') === (direction === 'UP')) ? 'ALIGNED' : 'OPPOSED';
  return { direction, alignment, move15m, move1h, at: bars.at(-1).closeTime };
}
