import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BreadthAlertStability, breadthDeliveryDecision, breadthPhase, lastBreadthAlert,
  BREADTH_ALERT_STABILITY_VERSION } from '../src/breadthAlertStability.js';
import { collectMarketBreadthShockMetrics, marketBreadthShockPayload,
  MARKET_BREADTH_SHOCK_VERSION, MarketBreadthShockDiscordNotifier } from '../src/marketBreadthShock.js';
import { collectEma99MarketBreadth15m } from '../src/ema99MarketBreadth15m.js';

const start = Date.UTC(2026, 8, 13, 9, 0);
const pump = { direction: 'PUMP', severity: 'WATCH', score: 70 };
const dump = { direction: 'DUMP', severity: 'DANGER', score: 81 };
const stable = new BreadthAlertStability();
let t = start;
assert.equal(stable.observe(pump, t, t), null);
assert.equal(stable.observe(pump, t, t + 20_000), null, 'duplicate snapshot is not a second scan');
for (let i = 1; i <= 3; i++) assert.equal(stable.observe(pump, start + i * 15_000, start + i * 15_000), null);
t = start + 60_000;
const confirmed = stable.observe(pump, t, t);
assert.equal(confirmed.persistence.directionMs, 60_000);
// A brief dump after a confirmed pump must not reverse the alert, even if DANGER.
t += 15_000;
assert.equal(stable.observe(dump, t, t), null);
const flipStart = t;
for (let i = 1; i <= 11; i++) {
  t = flipStart + i * 15_000;
  assert.equal(stable.observe(dump, t, t), null, 'opposite side needs 180s');
}
t += 15_000;
const flipped = stable.observe(dump, t, t);
assert.equal(flipped.direction, 'DUMP');
assert.equal(flipped.persistence.directionMs, 180_000);
// Persistence resets on a gap, no candidate, stale/future data; clocks cannot fabricate samples.
for (const reset of ['gap', 'null', 'stale', 'future']) {
  const gate = new BreadthAlertStability();
  gate.observe(pump, start, start);
  gate.observe(pump, start + 30_000, start + 30_000);
  if (reset === 'gap') assert.equal(gate.observe(pump, start + 100_000, start + 100_000), null);
  if (reset === 'null') { gate.observe(null, start + 45_000, start + 45_000); assert.equal(gate.observe(pump, start + 60_000, start + 60_000), null); }
  if (reset === 'stale') { gate.observe(pump, start + 35_000, start + 90_000); assert.equal(gate.observe(pump, start + 90_000, start + 90_000), null); }
  if (reset === 'future') { gate.observe(pump, start + 91_000, start + 90_000); assert.equal(gate.observe(pump, start + 90_000, start + 90_000), null); }
}
const dangerGate = new BreadthAlertStability();
dangerGate.observe(pump, start, start);
dangerGate.observe(pump, start + 30_000, start + 30_000);
assert.equal(dangerGate.observe({ ...pump, severity: 'DANGER' }, start + 60_000, start + 60_000), null, 'escalation has its own confirmation');

const critical = { ...dump, score: 97, strongSharePct: 24, dominancePct: 90,
  directionalTakerRatio: 0.68, volumeSharePct: 12 };
const emergencyGate = new BreadthAlertStability();
emergencyGate.observe(critical, start, start);
assert.equal(emergencyGate.observe(critical, start + 15_000, start + 15_000), null);
const emergency = emergencyGate.observe(critical, start + 30_000, start + 30_000);
assert.equal(emergency.persistence.criticalConfirmed, true, 'extreme pressure still needs 30s, not instant score bypass');
const spikeGate = new BreadthAlertStability();
spikeGate.observe({ ...critical, score: 94 }, start, start);
spikeGate.observe(critical, start + 15_000, start + 15_000);
assert.equal(spikeGate.observe(critical, start + 30_000, start + 30_000), null, 'only time spent extreme counts');

const oldState = { version: 'V1', alerts: { 'PUMP|DANGER': start } };
const persistedAt = start + 120_000;
assert.equal(lastBreadthAlert(oldState, persistedAt).direction, 'PUMP');
assert.equal(breadthDeliveryDecision(oldState, confirmed, persistedAt, 1_800_000).reason, 'downgrade_suppressed');
assert.equal(breadthDeliveryDecision(oldState, { ...confirmed, direction: 'DUMP' }, persistedAt, 1_800_000).reason, 'opposite_pending', 'V1 cooldown survives restart');
assert.equal(breadthDeliveryDecision(oldState, flipped, persistedAt, 1_800_000).reason, null);
assert.equal(breadthDeliveryDecision(oldState, emergency, persistedAt, 1_800_000).reason, null);
assert.equal(breadthDeliveryDecision(oldState, pump, persistedAt, 1_800_000).reason, 'unconfirmed');
const cycleState = { alerts: { 'PUMP|WATCH': start, 'DUMP|DANGER': start + 60_000 } };
assert.equal(breadthDeliveryDecision(cycleState, { ...flipped, direction: 'PUMP', severity: 'WATCH' }, start + 300_000, 1_800_000).reason, null, 'confirmed reversal back must not be hidden by old direction cooldown');

// Causal 5m history: latest red candle, but 15/30m still up (a pullback, not proven downtrend).
const rows = Array.from({ length: 12 }, (_, i) => {
  const close = i === 11 ? 108 : 100 + i;
  const open = i === 11 ? 110 : close - 0.2;
  return { openTime: start - (11 - i) * 300_000, closeTime: start - (10 - i) * 300_000 - 1,
    open, close, high: Math.max(open, close) + 0.1, low: Math.min(open, close) - 0.1,
    quoteVolume: 100_000, takerBuyQuoteVolume: 35_000 };
});
const marketRows = Array.from({ length: 100 }, (_, i) => ({ symbol: `T${i}USDT`, quoteVolume: 5_000_000, markPrice: 1 }));
const cache = { getIfCached: () => rows, stats: () => ({ staleSec: 0 }), liveCoverage: () => ({ newestTickAgeMs: 0 }) };
const metrics = collectMarketBreadthShockMetrics({ marketRows, klineCache: cache, now: start + 15_000 });
assert.equal(metrics.downCount, 100);
assert.equal(metrics.context['15m'].direction, 'UP');
assert.equal(metrics.context['30m'].direction, 'UP');
assert.match(breadthPhase({ ...dump, context: metrics.context }), /GIẢM NGẮN TRONG NHỊP TĂNG/);
assert.match(breadthPhase({ ...pump, context: { '15m': { direction: 'DOWN' }, '30m': { direction: 'DOWN' } } }), /HỒI LÊN TRONG NHỊP GIẢM/);
const staleMetrics = collectMarketBreadthShockMetrics({ marketRows, klineCache: { ...cache, liveCoverage: () => ({ newestTickAgeMs: 46_000 }) }, now: start + 15_000 });
assert.equal(staleMetrics.processed, 0, 'another coin fresh socket cannot revive old prices');
const missing = collectMarketBreadthShockMetrics({ marketRows, klineCache: { ...cache, getIfCached: () => rows.slice(-2) }, now: start + 15_000 });
assert.equal(missing.context['30m'].direction, 'UNKNOWN');
const gap = collectMarketBreadthShockMetrics({ marketRows, klineCache: { ...cache, getIfCached: () => rows.filter((_, i) => i !== 9) }, now: start + 15_000 });
assert.equal(gap.context['15m'].direction, 'UNKNOWN', 'gaps cannot fake context');

// EMA uses same live price, not stale REST markPrice=1; invalid/stale history not counted in coverage.
const closed15m = Array.from({ length: 110 }, (_, i) => ({
  openTime: start - (110 - i) * 900_000, closeTime: start - (109 - i) * 900_000 - 1,
  open: 100, high: 100.2, low: i === 109 ? 97.8 : 99.8, close: i === 109 ? 98 : 100,
}));
const emaCache = { ...cache, getIfCached: (_, interval) => interval === '15m' ? closed15m
  : [{ openTime: start, closeTime: start + 299_999, open: 99, high: 100, low: 98, close: 99.6 }] };
const emaMetrics = collectEma99MarketBreadth15m({ marketRows, klineCache: emaCache, now: start + 15_000, context: metrics.context });
assert.equal(emaMetrics.fromBelowCount, 100);
assert.equal(emaMetrics.fromBelow[0].markPrice, 99.6);
assert.deepEqual(emaMetrics.context, metrics.context);
assert.equal(collectEma99MarketBreadth15m({ marketRows, klineCache: { ...emaCache, liveCoverage: () => ({ newestTickAgeMs: null }) }, now: start }).processed, 0);
assert.equal(collectEma99MarketBreadth15m({ marketRows, klineCache: { ...emaCache,
  getIfCached: (_, interval) => interval === '15m' ? closed15m.map((r, i) => i === 55 ? { ...r, openTime: r.openTime + 900_000 } : r) : emaCache.getIfCached(_, interval),
}, now: start }).processed, 0);

const event = { ...metrics, ...flipped, version: MARKET_BREADTH_SHOCK_VERSION, observeOnly: true,
  upPct: 0, downPct: 100, dominancePct: 100, accelerationRatio: 1, volumeCount: 0,
  observedAt: t, generatedAt: new Date(t).toISOString() };
const payload = marketBreadthShockPayload({ ...event, previousAlert: { direction: 'PUMP', severity: 'WATCH', sentAt: start } });
assert.match(payload.embeds[0].description, /GIẢM NGẮN TRONG NHỊP TĂNG/);
assert.ok(payload.embeds[0].fields.some((r) => /Đổi nhịp so với PUMP/.test(r.value)));
assert.ok(payload.embeds[0].fields.every((r) => r.value.length <= 1024));
assert.ok(payload.embeds[0].description.length + payload.embeds[0].fields.reduce((sum, r) => sum + r.value.length + r.name.length, 0) < 5900);

const dir = await mkdtemp(join(tmpdir(), 'breadth-v2-'));
try {
  const stateFile = join(dir, 'state.json');
  await writeFile(stateFile, JSON.stringify(oldState));
  let clock = t;
  let sends = 0;
  let failure = true;
  const notifier = new MarketBreadthShockDiscordNotifier({ stateFile, now: () => clock, webhookUrl: 'https://discord.invalid/test',
    fetchImpl: async () => { sends++; return failure ? { ok: false, status: 429, json: async () => ({ retry_after: 1 }) } : { ok: true }; } });
  assert.equal((await notifier.notify({ ...event, observedAt: clock + 1 })).reason, 'invalid_or_stale');
  await assert.rejects(notifier.notify(event), /HTTP 429/);
  assert.deepEqual(JSON.parse(await readFile(stateFile, 'utf8')), oldState, 'failure never records delivery');
  assert.equal((await notifier.notify(event)).reason, 'backoff');
  clock += 61_000;
  failure = false;
  assert.equal((await notifier.notify({ ...event, observedAt: clock })).sent, 1);
  assert.equal(sends, 2);
  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  assert.equal(state.alerts['PUMP|DANGER'], start);
  assert.equal(state.recentAlerts.length, 1);
  assert.equal(state.lastAlert.persistence.version, BREADTH_ALERT_STABILITY_VERSION);
  const restarted = new MarketBreadthShockDiscordNotifier({ stateFile, now: () => clock, webhookUrl: 'https://discord.invalid/test', fetchImpl: async () => { throw new Error('must not send'); } });
  assert.equal((await restarted.notify({ ...event, observedAt: clock })).reason, 'deduped');
  assert.equal((await restarted.notify({ ...event, severity: 'WATCH', observedAt: clock })).reason, 'downgrade_suppressed');
} finally { await rm(dir, { recursive: true, force: true }); }
console.log('Breadth V2 anti-noise: elapsed/fresh confirmation, flip/restart/downgrade, critical30s, causal15/30m, synchronized prices, mock Discord audit PASS');
