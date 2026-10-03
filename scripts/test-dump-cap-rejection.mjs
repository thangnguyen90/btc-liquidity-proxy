import assert from 'node:assert/strict';
import { analyzeDumpCap, DumpCapScanner } from '../src/dumpCapRejection.js';
import { buildDumpResistance } from '../src/dumpCapResistance.js';
import {
  DUMP_CAP_FRAMES,
  DUMP_CAP_STAGES,
  DUMP_CAP_VERSION,
  dumpCapCardKey,
} from '../public/dump-cap-rejection-model.js';
import {
  DUMP_RESISTANCE_VERSION,
  RESISTANCE_LABELS,
  dumpResistanceKey,
  liveDumpResistance,
  resistanceNetRR,
} from '../public/dump-resistance-model.js';
import {
  liquidLiveCardKeysOfTrade,
  matchLiveCardWhitelistKeys,
  normalizeLiquidLiveCardKey,
} from '../src/liquidLiveCardWhitelist.js';
import { isBinanceCardAvgRoeEligible } from '../public/binance-card-visibility.js';

for (const [interval, duration] of Object.entries(DUMP_CAP_FRAMES)) {
  const start = Date.UTC(2026, 0, 1);
  const candle = (index, open, high, low, close, volume) => ({
    openTime: start + index * duration,
    closeTime: start + (index + 1) * duration - 1,
    open, high, low, close, volume,
  });
  const rows = Array.from({ length: 20 }, (_, index) => candle(index, 100, 100.2, 99.8, 99.9, 100));
  rows.push(
    candle(20, 100, 100.1, 97, 99, 500),
    candle(21, 99, 100.2, 98.9, 100, 90),
    candle(22, 100, 100.1, 99.8, 99.9, 100),
    candle(23, 99.9, 100, 98, 99.2, 200),
    candle(24, 99.2, 100.02, 99.1, 100, 60),
    candle(25, 99.9, 100.1, 99.85, 99.92, 70),
    candle(26, 99.92, 99.95, 99.6, 99.7, 140),
  );
  const now = rows.at(-1).closeTime + 10;
  const options = { dumpIndex: 20, retestIndex: 21, atr: 0.4, duration };
  const plan = buildDumpResistance(rows, options);
  assert.equal(plan.type, 'CAP');
  assert.equal(plan.status, 'WAIT_LIVE');
  assert.equal(plan.entry, 99.7);
  assert.equal(plan.target, 98);
  assert(plan.rr >= 1.5 && plan.entryLow <= plan.entryHigh);
  const tick = { markPrice: plan.entry, eventAt: now };
  const liveOptions = { now, snapshotAt: now };
  assert.equal(liveDumpResistance(plan, tick, liveOptions).status, 'READY');
  assert.equal(liveDumpResistance(plan, null, liveOptions).status, 'WAIT_LIVE');
  assert.equal(liveDumpResistance(plan, { ...tick, eventAt: now - 16000 }, liveOptions).status, 'WAIT_LIVE');
  assert.equal(liveDumpResistance(plan, { ...tick, eventAt: now + 3000 }, liveOptions).status, 'WAIT_LIVE');
  assert.equal(liveDumpResistance(plan, tick, { ...liveOptions, snapshotAt: now - 91000 }).status, 'STALE');
  assert.equal(liveDumpResistance(plan, tick, { now: plan.expiresAt + 1, snapshotAt: plan.expiresAt }).status, 'STALE');
  assert.equal(liveDumpResistance(plan, tick, { ...liveOptions, invalidated: true }).status, 'BROKEN');
  assert.equal(liveDumpResistance(plan, { ...tick, markPrice: plan.stop }, liveOptions).status, 'BROKEN');
  assert.equal(liveDumpResistance(plan, { ...tick, markPrice: plan.entryLow - 0.01 }, liveOptions).status, 'WAIT_RETEST');
  assert.equal(liveDumpResistance(plan, { ...tick, markPrice: plan.entryHigh + 0.01 }, liveOptions).status, 'WAIT_RETEST');
  assert.equal(liveDumpResistance({ version: 'old' }, tick, liveOptions).status, 'NO_RESISTANCE');

  const analysis = analyzeDumpCap('TESTUSDT', rows, interval, now);
  assert.equal(analysis.reason, null);
  const record = analysis.cases.find(item => item.dumpAt === rows[20].closeTime);
  assert(record);
  assert.equal(record.stage, 'VOLUME_REJECTION');
  assert.equal(record.sweptAbove, true);
  assert.equal(record.resistance.version, DUMP_RESISTANCE_VERSION);

  const highRetestVolume = structuredClone(rows);
  highRetestVolume[25].volume = 250;
  assert(!buildDumpResistance(highRetestVolume, options).confirmedAt);
  const noBreak = structuredClone(rows);
  noBreak[26].close = 99.88;
  assert(!buildDumpResistance(noBreak, options).confirmedAt);
  const noUpperWick = structuredClone(rows);
  noUpperWick[25].high = 99.94;
  assert(!buildDumpResistance(noUpperWick, options).confirmedAt);
  const nearTarget = structuredClone(rows);
  nearTarget[21].low = 99.5;
  nearTarget[22].low = 99.6;
  nearTarget[23].low = 99.45;
  nearTarget[24].low = 99.5;
  assert.equal(buildDumpResistance(nearTarget, options).status, 'NO_ROOM');
  const broken = [...rows, candle(27, 99.7, 100.3, 99.6, 99.8, 120)];
  assert.equal(buildDumpResistance(broken, options).status, 'BROKEN');
  const later = [...rows, candle(27, 99.7, 99.75, 97.5, 99.6, 100)];
  assert.equal(buildDumpResistance(later, options).target, plan.target, 'later pivot cannot alter causal target');

  for (const stage of Object.keys(DUMP_CAP_STAGES)) {
    const key = dumpCapCardKey(interval, stage);
    assert.equal(normalizeLiquidLiveCardKey(key), key);
    const trade = { side: 'SHORT', dumpCapObservation: { version: DUMP_CAP_VERSION, interval, stage } };
    const keys = liquidLiveCardKeysOfTrade(trade);
    assert(keys.includes(key));
    assert(!matchLiveCardWhitelistKeys(keys, []).allowed);
    assert(matchLiveCardWhitelistKeys(keys, [key]).allowed);
    assert(!liquidLiveCardKeysOfTrade({ ...trade, side: 'LONG' }).includes(key));
  }
  for (const status of Object.keys(RESISTANCE_LABELS)) {
    const key = dumpResistanceKey(interval, status);
    assert.equal(normalizeLiquidLiveCardKey(key), key);
    const trade = { side: 'SHORT', dumpResistanceObservation: { version: DUMP_RESISTANCE_VERSION, interval, status } };
    const keys = liquidLiveCardKeysOfTrade(trade);
    assert(keys.includes(key));
    assert(!matchLiveCardWhitelistKeys(keys, []).allowed);
    assert(matchLiveCardWhitelistKeys(keys, [key]).allowed);
    assert(!liquidLiveCardKeysOfTrade({ ...trade, side: 'LONG' }).includes(key));
  }

  const scanner = new DumpCapScanner({
    getSymbols: () => ['TESTUSDT'],
    getRows: (symbol, frame) => frame === interval ? rows : [],
    now: () => now,
  });
  const snapshot = await scanner.snapshot(interval);
  assert.equal(snapshot.version, DUMP_CAP_VERSION);
  assert.equal(snapshot.totalSymbols, 1);
  assert(snapshot.records.length >= 1);
}

assert(!isBinanceCardAvgRoeEligible(null));
assert(!isBinanceCardAvgRoeEligible(4));
assert(isBinanceCardAvgRoeEligible(4.1));
assert.equal(resistanceNetRR(100, 99, 90), null);
assert.equal(dumpCapCardKey('1m', 'AT_CAP'), null);
assert.equal(dumpResistanceKey('1d', 'FAKE'), null);
assert.equal(normalizeLiquidLiveCardKey('dump-cap:1m:AT_CAP'), null);
console.log('Dump cap SHORT: five frames, causal rejection, live R:R, invalidation and whitelist passed');
