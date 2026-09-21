import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EMA99_PARTIAL_CACHE_MIN_BARS,
  EMA99_PARTIAL_CACHE_SCAN_VERSION,
  ema99PartialCacheCoverage,
} from '../src/ema99PartialCacheScan.js';

const calls = [];
const cache = {
  countReady(symbols, interval, minBars) {
    calls.push({ symbols, interval, minBars });
    return interval === '5m' ? 3 : 0;
  },
};

const partial = ema99PartialCacheCoverage(cache, ['aaaUSDT', 'AAAUSDT', ' bbbUSDT ']);
assert.equal(partial.version, EMA99_PARTIAL_CACHE_SCAN_VERSION);
assert.equal(partial.mode, 'PARTIAL_CACHE_READY_PAIRS');
assert.equal(partial.totalSymbols, 2);
assert.equal(partial.minBars, EMA99_PARTIAL_CACHE_MIN_BARS);
assert.equal(partial.ready5m, 3);
assert.equal(partial.ready15m, 0);
assert.equal(partial.readyPairs, 3);
assert.equal(partial.ready, true, 'one ready timeframe must allow a partial EMA99 scan');
assert.deepEqual(calls.map((row) => row.interval), ['5m', '15m']);
assert.ok(calls.every((row) => row.minBars === 165));
assert.deepEqual(calls[0].symbols, ['AAAUSDT', 'BBBUSDT']);

const empty = ema99PartialCacheCoverage({ countReady: () => 0 }, []);
assert.equal(empty.ready, false);
assert.equal(empty.readyPairs, 0);

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
const schedulerStart = serverSource.indexOf('async function schedulePostPumpEma99RetestScan()');
const schedulerEnd = serverSource.indexOf('async function scheduleExtremeShortSqueezeScan()', schedulerStart);
assert.ok(schedulerStart >= 0 && schedulerEnd > schedulerStart);
const schedulerSource = serverSource.slice(schedulerStart, schedulerEnd);
assert.doesNotMatch(
  schedulerSource,
  /!klineWarmupReady\(\)/,
  'EMA99 scanner must not wait for global 400-symbol warm-up',
);
assert.match(schedulerSource, /ema99PartialCacheCoverage\(klineCache,symbols\)/);
assert.match(schedulerSource, /if\(!coverage\.ready\)/);

console.log('EMA99 partial cache scan tests passed');
