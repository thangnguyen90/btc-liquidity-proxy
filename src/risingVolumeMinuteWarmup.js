import { wickClosedRows } from './btcWickRecovery.js';

export const RISING_VOLUME_MINUTE_WARMUP_VERSION = 'RISING_VOLUME_1M_WARMUP_V2_INDEPENDENT_20261010';
export const RISING_VOLUME_MINUTE_WARMUP_POLICY = Object.freeze({
  intervalMs: 10_000, maxPerCycle: 6, prioritySlots: 2, limit: 90,
  requiredClosedBars: 81, retryMs: 30_000, maxAgeMs: 75_000,
});
const validSymbol = symbol => /^[\p{L}\p{N}]{1,32}USDT$/u.test(symbol);
const symbolsOf = values => [...new Set((Array.isArray(values) ? values : [])
  .map(value => String(value ?? '').trim().toUpperCase()).filter(validSymbol))];

// Same closed/fresh/continuous validation as the detectors, including the whole
// 90-row tail they read. Cache length alone cannot detect an interrupted socket.
export function minuteHistoryReadiness(rows = [], now = Date.now()) {
  const closed = (Array.isArray(rows) ? rows : [])
    .filter(row => Number(row?.closeTime) < now && row?.isClosed !== false).slice(-90);
  const lastClosedAt = Number(closed.at(-1)?.closeTime) || null;
  const common = { bars: closed.length, lastClosedAt };
  if (closed.length < RISING_VOLUME_MINUTE_WARMUP_POLICY.requiredClosedBars) return { ...common, status: 'INSUFFICIENT' };
  if (now - lastClosedAt > RISING_VOLUME_MINUTE_WARMUP_POLICY.maxAgeMs) return { ...common, status: 'STALE' };
  if (wickClosedRows(closed, now, 90).length !== closed.length) return { ...common, status: 'INVALID_OR_GAP' };
  return { ...common, status: 'READY' };
}

export class RisingVolumeMinuteWarmup {
  constructor({ getSymbols = () => [], getPrioritySymbols = () => [], getRows = () => [],
    seed, blocked = () => false, now = () => Date.now() } = {}) {
    Object.assign(this, { getSymbols, getPrioritySymbols, getRows, seed, blocked, now });
    this.cursor = 0; this.busy = false; this.lastCycleAt = null; this.lastCompletedAt = null;
    this.lastAttempts = new Map(); this.readiness = new Map();
    this.attempted = 0; this.refreshed = 0; this.failed = 0; this.lastBatch = [];
    this.deferredReason = null; this.error = null;
  }

  updateReadiness(symbols) {
    const at = this.now();
    this.readiness = new Map(symbols.map(symbol => [symbol, minuteHistoryReadiness(this.getRows(symbol), at)]));
  }

  async run() {
    if (this.busy) return;
    const at = this.now(), policy = RISING_VOLUME_MINUTE_WARMUP_POLICY;
    if (this.lastCycleAt != null && at - this.lastCycleAt < policy.intervalMs) return;
    this.busy = true;
    try {
      const symbols = symbolsOf(this.getSymbols());
      this.updateReadiness(symbols);
      if (!symbols.length) { this.deferredReason = 'WAIT_UNIVERSE'; return; }
      // Never wait for core 5m/15m tiers, but ALWAYS respect the shared REST gate.
      if (this.blocked()) { this.deferredReason = 'REST_BLOCKED_OR_CONGESTED'; return; }
      this.lastCycleAt = at; this.lastBatch = []; this.deferredReason = null;
      const wanted = symbol => this.readiness.get(symbol)?.status !== 'READY'
        && (!this.lastAttempts.has(symbol) || at - this.lastAttempts.get(symbol) >= policy.retryMs);
      const universe = new Set(symbols), selected = new Set(), jobs = [];
      for (const symbol of symbolsOf(this.getPrioritySymbols())) {
        if (jobs.length >= policy.prioritySlots) break;
        if (universe.has(symbol) && wanted(symbol)) { jobs.push(symbol); selected.add(symbol); }
      }
      // Reserve at least four slots for a rotating full-universe cursor. Hot
      // coins cannot starve quieter symbols, and ready coins generate zero REST.
      for (let checked = 0; checked < symbols.length && jobs.length < policy.maxPerCycle; checked++) {
        const symbol = symbols[this.cursor++ % symbols.length];
        if (!selected.has(symbol) && wanted(symbol)) { jobs.push(symbol); selected.add(symbol); }
      }
      for (const symbol of jobs) {
        if (this.blocked()) { this.deferredReason = 'REST_BLOCKED_OR_CONGESTED'; break; }
        this.lastAttempts.set(symbol, this.now()); this.attempted++; this.lastBatch.push(symbol);
        try {
          await this.seed(symbol, '1m', policy.limit, {
            subscribe: false, batchSize: 1, batchDelayMs: 0, force: true, maxAgeMs: policy.maxAgeMs,
          });
          const result = minuteHistoryReadiness(this.getRows(symbol), this.now());
          if (result.status === 'READY') this.refreshed++;
          else this.failed++;
        } catch { this.failed++; }
      }
      this.updateReadiness(symbols); this.lastCompletedAt = this.now(); this.error = null;
    } catch { this.error = 'MINUTE_WARMUP_FAILED'; }
    finally { this.busy = false; }
  }

  start() {
    if (this.timer) return;
    void this.run();
    this.timer = setInterval(() => void this.run(), RISING_VOLUME_MINUTE_WARMUP_POLICY.intervalMs);
    this.timer.unref?.();
  }
  stop() { clearInterval(this.timer); this.timer = null; }

  snapshot(symbol = null) {
    const counts = { READY: 0, INSUFFICIENT: 0, STALE: 0, INVALID_OR_GAP: 0 };
    for (const row of this.readiness.values()) counts[row.status]++;
    const selected = String(symbol ?? '').trim().toUpperCase();
    return {
      version: RISING_VOLUME_MINUTE_WARMUP_VERSION, independentOfCoreWarmup: true,
      policy: RISING_VOLUME_MINUTE_WARMUP_POLICY, busy: this.busy,
      updatedAt: this.lastCompletedAt, lastCycleAt: this.lastCycleAt,
      total: this.readiness.size, ready: counts.READY, pending: this.readiness.size - counts.READY, counts,
      attempted: this.attempted, refreshed: this.refreshed, failed: this.failed,
      lastBatch: [...this.lastBatch], deferredReason: this.deferredReason, error: this.error,
      selected: this.readiness.has(selected) ? { symbol: selected, ...this.readiness.get(selected) } : null,
    };
  }
}
