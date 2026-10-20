import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RisingVolumeMinuteWarmup, minuteHistoryReadiness, RISING_VOLUME_MINUTE_WARMUP_POLICY as POLICY } from '../src/risingVolumeMinuteWarmup.js';
import { KlineCache } from '../src/klineCache.js';
import { CoinPumpWickEarlyMonitor } from '../src/coinPumpWickEarly.js';
const MIN = 60_000;
let now = Date.UTC(2026, 9, 10, 12, 0, 10);
const rows = (length = 90, at = now) => Array.from({ length }, (_, i) => {
  const openTime = Math.floor(at / MIN) * MIN - (length - i) * MIN;
  return { openTime, closeTime: openTime + MIN - 1, open: 1, high: 1.01, low: .99, close: 1,
    quoteVolume: 100, takerBuyQuoteVolume: 50, volume: 100, isClosed: true };
});
assert.equal(minuteHistoryReadiness([], now).status, 'INSUFFICIENT');
assert.equal(minuteHistoryReadiness(rows(), now).status, 'READY');
assert.equal(minuteHistoryReadiness(rows(80), now).status, 'INSUFFICIENT');
assert.equal(minuteHistoryReadiness(rows(90, now - 120_000), now).status, 'STALE');
assert.equal(minuteHistoryReadiness(rows().filter((_, i) => i !== 12), now).status, 'INVALID_OR_GAP');
assert.equal(minuteHistoryReadiness(rows().map((r, i) => i === 4 ? { ...r, quoteVolume: NaN } : r), now).status, 'INVALID_OR_GAP');
assert.equal(minuteHistoryReadiness(rows(81).map((r, i) => i === 80 ? { ...r, isClosed: false } : r), now).status, 'INSUFFICIENT');

// Bootstrap during a still-busy core warm-up; all REST uses the existing cache
// implementation (priority 8/dropOnCongestion), never a separate unguarded fetch.
const universe = Array.from({ length: 18 }, (_, i) => `COIN${i}USDT`), calls = [], ready = new Set();
const warmup = new RisingVolumeMinuteWarmup({ now: () => now,
  getSymbols: () => [...universe, universe[0], 'bad'],
  getPrioritySymbols: () => [universe[16], universe[17], universe[15], 'NOTINUNIVERSEUSDT'],
  getRows: symbol => ready.has(symbol) ? rows() : [],
  seed: async (symbol, interval, limit, options) => {
    calls.push({ symbol, interval, limit, options }); ready.add(symbol);
  },
});
await warmup.run();
assert.equal(calls.length, 6);
assert.deepEqual(calls.slice(0, 2).map(r => r.symbol), universe.slice(16));
assert.deepEqual(calls.slice(2).map(r => r.symbol), universe.slice(0, 4));
assert(calls.every(r => r.interval === '1m' && r.limit === 90 && r.options.force && r.options.subscribe === false));
await warmup.run(); assert.equal(calls.length, 6, 'same cycle cannot exceed six REST requests');
now += POLICY.intervalMs; await warmup.run();
now += POLICY.intervalMs; await warmup.run();
assert.equal(ready.size, universe.length, 'fair cursor reaches every coin, including quiet ones');
now += POLICY.intervalMs; await warmup.run();
assert.equal(calls.length, universe.length, 'fresh continuous full histories never reseed');
assert.equal(warmup.snapshot(universe[17]).selected.status, 'READY');
assert.equal(warmup.snapshot().independentOfCoreWarmup, true);
assert.equal(warmup.snapshot().pending, 0);

let blocked = true, blockedCalls = 0;
const paused = new RisingVolumeMinuteWarmup({ now: () => now, getSymbols: () => universe,
  blocked: () => blocked, seed: async () => { blockedCalls++; blocked = true; },
});
await paused.run(); assert.equal(blockedCalls, 0);
assert.equal(paused.snapshot().deferredReason, 'REST_BLOCKED_OR_CONGESTED');
blocked = false; await paused.run();
assert.equal(blockedCalls, 1, 'a ban/congestion arising mid-batch stops remaining requests');

let failures = 0;
const retry = new RisingVolumeMinuteWarmup({ now: () => now, getSymbols: () => ['FAILUSDT'],
  seed: async () => { failures++; throw Error('mock'); },
});
await retry.run(); now += 10_000; await retry.run(); now += 10_000; await retry.run();
assert.equal(failures, 1, 'no tight retry loop for failure');
now += 10_000; await retry.run(); assert.equal(failures, 2);
assert.equal(retry.snapshot().failed, 2); assert.equal(retry.snapshot().error, null, 'one REST failure does not stop the scheduler');

let release, overlapping = 0;
const busy = new RisingVolumeMinuteWarmup({ now: () => now, getSymbols: () => ['BUSYUSDT'],
  seed: async () => { overlapping++; await new Promise(resolve => { release = resolve; }); },
});
const first = busy.run(); await busy.run(); assert.equal(overlapping, 1); release(); await first;
busy.start(); const timer = busy.timer; busy.start(); assert.equal(busy.timer, timer); busy.stop();

// Real cache: a full-length history with a hole must be force-repaired. Live
// subscription is not duplicated, and high-priority account work stays ahead.
const restMeta = [], cache = new KlineCache({ now: () => now, client: {
  getKlines: async (symbol, interval, limit, meta) => { restMeta.push(meta); return rows(limit); },
} });
cache._cache.set('GAPUSDT|1m', rows(95).filter((_, i) => i !== 82));
const repair = new RisingVolumeMinuteWarmup({ now: () => now, getSymbols: () => ['GAPUSDT'],
  getRows: symbol => cache.getIfCached(symbol, '1m', 90),
  seed: (symbol, interval, limit, options) => cache.seed([symbol], interval, limit, options),
});
assert.equal(repair.snapshot().ready, 0); await repair.run();
assert.equal(repair.snapshot().ready, 1);
assert.equal(restMeta[0].priority, 8); assert.equal(restMeta[0].dropOnCongestion, true);
assert.equal(cache._conns.size, 0);
now += 10_000; await repair.run(); assert.equal(restMeta.length, 1);
cache._cache.set('GAPUSDT|1m', rows(90, now - 120_000));
now += 30_000; await repair.run(); assert.equal(restMeta.length, 2, 'stale full-length tail also repairs');

// A late seed can enable a NEW/fresh post-start alert, but never replay an old
// wick from before process start. Only mock Push/Discord is used here.
const fixture = JSON.parse(await readFile('scripts/fixtures/era-pump-wick-20261010.json', 'utf8'));
const era = fixture.rows.map(row => Object.fromEntries(fixture.columns.map((key, i) => [key, row[i]])));
const head = era[0], before = Array.from({ length: 30 }, (_, i) => ({ ...head,
  openTime: head.openTime - (30 - i) * MIN, closeTime: head.closeTime - (30 - i) * MIN }));
const history = [...before, ...era], at = era.at(-1).closeTime + 1_000;
let loaded = false, push = 0, discord = 0;
const monitor = new CoinPumpWickEarlyMonitor({ file: null, now: () => era.at(-1).openTime,
  getSymbols: () => ['ERAUSDT'], getRows: () => loaded ? history : [],
  pushSender: async () => { push++; return { sent: 1 }; },
  discordSender: async () => { discord++; return { sent: 1 }; },
});
monitor.now = () => at; await monitor.scan(); assert.equal(monitor.history.length, 0);
const backfill = new RisingVolumeMinuteWarmup({ now: () => at, getSymbols: () => ['ERAUSDT'],
  getRows: () => loaded ? history : [], seed: async () => { loaded = true; },
});
await backfill.run(); assert.equal(backfill.snapshot().ready, 1);
await monitor.scan(); assert.equal(push, 1); assert.equal(discord, 1);
await monitor.scan(); assert.equal(push, 1, 'seed/repeat scan does not duplicate');
const restarted = new CoinPumpWickEarlyMonitor({ file: null, now: () => at,
  getSymbols: () => ['ERAUSDT'], getRows: () => history,
  pushSender: async () => { throw Error('must not replay'); },
  discordSender: async () => { throw Error('must not replay'); },
});
await restarted.scan(); assert.equal(restarted.history.length, 0);

const server = await readFile('src/server.js', 'utf8');
const config = server.slice(server.indexOf('const risingVolumeMinuteWarmup ='), server.indexOf('const pumpBaseScanner ='));
assert.doesNotMatch(config, /klineWarmupReady|_tieredWarmupPromise/);
assert.match(config, /binanceRateGate\.isBlocked/); assert.match(config, /isBinanceRestCongested/);
assert.match(server, /function startRisingVolumeMonitor\(\)\s*\{\s*risingVolumeMinuteWarmup\.start\(\)/);
assert.match(server, /void risingVolumeMinuteWarmup\.run\(\);\s*await risingVolumeMonitor\.scan/);
assert.match(server, /filter\(interval => interval !== '1m'\)/);
console.log('PASS independent 1m warm-up: cold start, hot/fair queue, budget/retry/congestion/busy, gaps/stale repair, priority8, fresh alert and no history replay.');
