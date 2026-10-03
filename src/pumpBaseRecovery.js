import { PUMP_BASE_VERSION, PUMP_BASE_FRAMES, PUMP_BASE_STAGES, pumpBaseCardKey } from '../public/pump-base-recovery-model.js';
import { buildPumpSupport } from './pumpBaseSupport.js';

export const PUMP_BASE_RULE = Object.freeze({ baseline: 20, lookback: 128, maxAfter: 96, minRangeAtr: 2.5, minRiseAtr: 1.8, minVolume: 2, footToleranceAtr: 0.15, minReboundAtr: 0.5 });
const median = xs => { const a = [...xs].sort((x, y) => x - y); return (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2; };
export function closedPumpRows(raw, interval, now = Date.now()) {
  const duration = PUMP_BASE_FRAMES[interval];
  if (!duration) return [];
  const byTime = new Map();
  for (const r of raw ?? []) {
    if (!r) continue;
    const a = Array.isArray(r);
    const c = Object.fromEntries(['openTime', 'open', 'high', 'low', 'close', 'volume', 'closeTime'].map((k, i) => [k, Number(a ? r[i] : r[k])]));
    if (!Object.values(c).every(Number.isFinite) || c.openTime < 0 || c.openTime % duration !== 0
      || c.closeTime !== c.openTime + duration - 1 || c.closeTime >= now || c.volume < 0
      || Math.min(c.open, c.low, c.close) <= 0 || c.low > Math.min(c.open, c.close)
      || c.high < Math.max(c.open, c.close) || c.high < c.low) continue;
    byTime.set(c.openTime, c);
  }
  return [...byTime.values()].sort((a, b) => a.openTime - b.openTime);
}
export function aggregatePumpRows(raw, from, to, now = Date.now()) {
  const sourceMs = PUMP_BASE_FRAMES[from], targetMs = PUMP_BASE_FRAMES[to];
  if (!sourceMs || !targetMs || targetMs <= sourceMs || targetMs % sourceMs) return [];
  const buckets = new Map();
  for (const c of closedPumpRows(raw, from, now)) {
    const t = Math.floor(c.openTime / targetMs) * targetMs;
    if (!buckets.has(t)) buckets.set(t, []);
    buckets.get(t).push(c);
  }
  const out = [];
  for (const [openTime, rows] of buckets) {
    if (rows.length !== targetMs / sourceMs || rows.some((r, i) => r.openTime !== openTime + i * sourceMs) || openTime + targetMs > now) continue;
    out.push({ openTime, closeTime: openTime + targetMs - 1, open: rows[0].open, close: rows.at(-1).close,
      high: Math.max(...rows.map(r => r.high)), low: Math.min(...rows.map(r => r.low)), volume: rows.reduce((s, r) => s + r.volume, 0) });
  }
  return out;
}
export function analyzePumpBase(symbol, raw, interval, now = Date.now()) {
  const duration = PUMP_BASE_FRAMES[interval];
  let rows = closedPumpRows(raw, interval, now).slice(-PUMP_BASE_RULE.lookback);
  if (rows.length < 24) return { reason: 'INSUFFICIENT_DATA', cases: [] };
  let lastGap = -1;
  for (let i = 1; i < rows.length; i++) if (rows[i].openTime - rows[i - 1].openTime !== duration) lastGap = i;
  if (lastGap > 0) rows = rows.slice(lastGap);
  if (rows.length < 24) return { reason: 'DATA_GAP', cases: [] };
  const last = rows.at(-1);
  if (now - last.closeTime > duration + 90000) return { reason: 'STALE_DATA', cases: [] };
  const cases = [];
  for (let i = Math.max(20, rows.length - PUMP_BASE_RULE.maxAfter - 1); i < rows.length - 1; i++) {
    const p = rows[i], prior = rows.slice(i - 20, i), after = rows.slice(i + 1);
    const span = rows.slice(i - 20);
    if (span.some((r, j) => j && r.openTime - span[j - 1].openTime !== duration)) continue;
    const atr = prior.slice(1).reduce((s, r, j) => s + Math.max(r.high - r.low, Math.abs(r.high - prior[j].close), Math.abs(r.low - prior[j].close)), 0) / 19;
    const baseVolume = median(prior.map(r => r.volume));
    if (!(atr > 0 && baseVolume > 0) || p.close < p.open || (p.high - p.low) / atr < 2.5
      || (p.high - p.open) / atr < 1.8 || p.volume / baseVolume < 2) continue;
    // A later candle must revisit the pump's open. An intrabar wick in the pump itself is NOT a later retest.
    const retestIndex = after.findIndex(r => r.low <= p.open + 0.15 * atr);
    if (retestIndex < 0) continue;
    const retest = after[retestIndex], following = after.slice(retestIndex + 1);
    const troughRows = after.slice(retestIndex);
    const trough = troughRows.reduce((a, r) => r.low < a.low ? r : a, retest);
    const latest3 = rows.slice(-3);
    const volIncreasing = latest3.every((r, j) => !j || r.volume > latest3[j - 1].volume);
    const pricesIncreasing = latest3.every((r, j) => !j || r.close > latest3[j - 1].close);
    const threeAfterRetest = latest3[0].openTime > retest.openTime;
    const reboundAtr = (last.close - trough.low) / atr;
    const reclaimed = last.close > p.open;
    const recovery = following.length > 0 && reboundAtr >= 0.5 && last.close > rows.at(-2).close;
    const volRatio = last.volume / baseVolume;
    const confirmed = recovery && reclaimed && threeAfterRetest && volIncreasing && pricesIncreasing && volRatio >= 1.2;
    const lostBase = following.length > 0 && last.close < retest.low - 0.15 * atr;
    const rolledOver = following.length > 1 && last.close < rows.at(-2).close && rows.at(-2).close < rows.at(-3).close;
    const stage = lostBase || rolledOver ? 'WEAKENED' : confirmed ? 'VOLUME_RECOVERY' : recovery ? 'RECOVERING' : 'AT_BASE';
    cases.push({ id: `${symbol}:${interval}:${p.openTime}`, symbol, interval, stage, version: PUMP_BASE_VERSION,
      pumpAt: p.closeTime, retestAt: retest.closeTime, updatedAt: last.closeTime, ageBars: after.length,
      pumpOpen: p.open, pumpHigh: p.high, pumpLow: p.low, pumpRangeAtr: (p.high - p.low) / atr,
      pumpRisePct: (p.high / p.open - 1) * 100, pumpVolumeRatio: p.volume / baseVolume,
      retestLow: retest.low, troughLow: trough.low, sweptBelow: trough.low < p.open - 0.15 * atr,
      close: last.close, reboundPct: (last.close / trough.low - 1) * 100,
      retracePct: (p.high - trough.low) / (p.high - p.open) * 100,
      volumeRatio: volRatio, volumeSequence: latest3.map(r => r.volume), volIncreasing, pricesIncreasing,
      atr, reason: lostBase ? 'Mất đáy nến trả chân' : rolledOver ? 'Hai nến đóng giảm liên tiếp' : confirmed ? '3 nến hồi đóng tăng giá và tăng volume; lấy lại chân nến' : !following.length ? 'Chờ nến hồi sau lần trả chân' : !reclaimed ? 'Chưa lấy lại chân nến bơm' : !threeAfterRetest ? 'Chưa có 3 nến sau trả chân' : !volIncreasing ? 'Volume chưa tăng đều 3 nến' : !pricesIncreasing ? 'Giá đóng chưa tăng đều 3 nến' : volRatio < 1.2 ? 'Volume cuối chưa đạt 1,2× nền trước bơm' : 'Chưa hồi đủ 0,5 ATR',
      support: buildPumpSupport(rows, { pumpIndex:i, retestIndex:i+1+retestIndex, atr, duration, now }),
      watchOnly: true, binanceEligible: false });
  }
  return { reason: cases.length ? null : 'NO_PATTERN', cases };
}

// One snapshot per timeframe, shared by all browser tabs; yielding keeps order/web handlers responsive.
export class PumpBaseScanner {
  constructor({ getSymbols, getRows, now = Date.now }) { Object.assign(this, { getSymbols, getRows, now }); this.cache = new Map(); this.pending = new Map(); }
  async snapshot(interval) {
    if (!Object.hasOwn(PUMP_BASE_FRAMES, interval)) throw new Error('Unsupported timeframe');
    const saved = this.cache.get(interval);
    if (saved && this.now() - saved.generatedAt < 30000) return saved;
    if (this.pending.has(interval)) return this.pending.get(interval);
    const task = this.scan(interval).finally(() => this.pending.delete(interval));
    this.pending.set(interval, task);
    return task;
  }
  rows(symbol, interval, now) {
    const direct = this.getRows(symbol, interval, 500) ?? [];
    const smaller = { '15m': '5m', '1h': '15m', '4h': '1h', '1d': '4h' }[interval];
    const derived = smaller ? aggregatePumpRows(this.getRows(symbol, smaller, 500), smaller, interval, now) : [];
    return closedPumpRows([...derived, ...direct], interval, now);
  }
  async scan(interval) {
    const generatedAt = this.now(), symbols = [...new Set(this.getSymbols())];
    const excluded = { INSUFFICIENT_DATA: 0, DATA_GAP: 0, STALE_DATA: 0, NO_PATTERN: 0 }, records = [];
    let covered = 0;
    for (let i = 0; i < symbols.length; i++) {
      const result = analyzePumpBase(symbols[i], this.rows(symbols[i], interval, generatedAt), interval, generatedAt);
      if (result.reason) excluded[result.reason]++;
      if (!['INSUFFICIENT_DATA', 'DATA_GAP', 'STALE_DATA'].includes(result.reason)) covered++;
      records.push(...result.cases);
      if (i % 8 === 7) await new Promise(resolve => setImmediate(resolve));
    }
    records.sort((a, b) => b.updatedAt - a.updatedAt || b.pumpAt - a.pumpAt || a.symbol.localeCompare(b.symbol));
    const counts = Object.fromEntries(Object.keys(PUMP_BASE_STAGES).map(stage => [stage, records.filter(r => r.stage === stage).length]));
    const snapshot = { version: PUMP_BASE_VERSION, generatedAt, interval, totalSymbols: symbols.length, covered, excluded,
      totalCases: records.length, uniqueCoins: new Set(records.map(r => r.symbol)).size, counts, records,
      groups: Object.keys(PUMP_BASE_STAGES).map(stage => ({ stage, key: pumpBaseCardKey(interval, stage), closedCount: 0, avgRoe: null })),
      watchOnly: true, binanceEligible: false };
    this.cache.set(interval, snapshot);
    return snapshot;
  }
}

// Optional cache warmup: one shared request per 15s, only for recently viewed tabs.
// This is not a scanner REST fan-out; requests use the existing low-priority rate gate.
export class PumpBaseWarmup {
  constructor({ scanner, seed, blocked, now = Date.now }) {
    Object.assign(this, { scanner, seed, blocked, now });
    this.interests = new Map(); this.attempts = new Map(); this.busy = false; this.lastAt = -Infinity; this.status = 'IDLE'; this.frameCursor = 0;
  }
  touch(interval) { if (Object.hasOwn(PUMP_BASE_FRAMES, interval)) this.interests.set(interval, this.now()); }
  async tick() {
    const now = this.now();
    if (this.busy || now - this.lastAt < 15000) return;
    const frames = [...this.interests].filter(([, t]) => now - t < 90000).sort((a, b) => a[1] - b[1]);
    if (!frames.length) { this.status = 'IDLE'; return; }
    if (this.blocked()) { this.status = 'PAUSED_RATE_GATE'; return; }
    for (let offset = 0; offset < frames.length; offset++) {
      const frameIndex = (this.frameCursor + offset) % frames.length;
      const [interval] = frames[frameIndex];
      for (const symbol of this.scanner.getSymbols()) {
      const key = `${symbol}:${interval}`;
      if (now - (this.attempts.get(key) ?? -Infinity) < 600000) continue;
      const rows = this.scanner.rows(symbol, interval, now);
      const expected = Math.floor(now / PUMP_BASE_FRAMES[interval]) * PUMP_BASE_FRAMES[interval] - 1;
      if (rows.length >= 64 && rows.at(-1)?.closeTime >= expected) continue;
      this.attempts.set(key, now); this.lastAt = now; this.busy = true; this.status = 'WARMING'; this.frameCursor = (frameIndex + 1) % frames.length;
      try { await this.seed(symbol, interval); } catch { this.status = 'RETRY_LATER'; }
      finally { this.busy = false; }
      return;
      }
    }
    this.status = 'CACHE_READY';
  }
}
