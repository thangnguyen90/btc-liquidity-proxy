import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EMA99_KILL_RECLAIM_VERSION,
  PUMP_DUMP_ABSORPTION_VARIANT,
  detectPumpDumpAbsorptionReclaim,
} from '../src/ema99KillReclaimDetector.js';
import {
  authorizePumpDumpAbsorptionAutoOrder,
  evaluateAutoBinanceEntryPolicy,
} from '../src/autoBinancePolicy.js';

assert.equal(EMA99_KILL_RECLAIM_VERSION, 'EMA99_KILL_RECLAIM_V2_PUMP_DUMP_ABSORPTION_20260831');
assert.equal(PUMP_DUMP_ABSORPTION_VARIANT, 'PUMP_DUMP_ABSORPTION');
assert.deepEqual(evaluateAutoBinanceEntryPolicy({
  payload: authorizePumpDumpAbsorptionAutoOrder({ dryRun: false }),
  orderEnabled: true,
  env: { LIVE_CARD_WHITELIST_ONLY_AUTO_BINANCE: 'true' },
}), {
  allowed: true,
  exclusive: true,
  reason: 'PUMP_DUMP_ABSORPTION_READY',
});
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: { dryRun: false },
  orderEnabled: true,
  env: { LIVE_CARD_WHITELIST_ONLY_AUTO_BINANCE: 'true' },
}).allowed, false);

let nextOpenTime = Date.parse('2026-08-30T20:00:00Z');
function candle(open, high, low, close, volume) {
  const openTime = nextOpenTime;
  nextOpenTime += 5 * 60_000;
  return { openTime, closeTime: openTime + 5 * 60_000 - 1, open, high, low, close, volume };
}

const candles = [];
for (let i = 0; i < 130; i++) {
  const close = 0.024 + (i % 7) * 0.000002;
  candles.push(candle(close, close + 0.00005, close - 0.00005, close, 700_000 + (i % 5) * 20_000));
}

// Quiet pre-spike structure based on QUSDT 5m, 2026-08-31.
[
  [0.025133, 0.025231, 0.025086, 0.025187, 1_264_762],
  [0.02518, 0.025199, 0.024989, 0.025014, 554_039],
  [0.025005, 0.025038, 0.024642, 0.025007, 2_528_384],
  [0.025005, 0.025139, 0.025005, 0.02501, 680_357],
  [0.025034, 0.025144, 0.025008, 0.025022, 374_946],
  [0.02504, 0.025065, 0.024866, 0.024879, 779_308],
  [0.024877, 0.024909, 0.024842, 0.024857, 364_904],
  [0.024863, 0.024948, 0.024804, 0.024919, 530_023],
  [0.024919, 0.025022, 0.024823, 0.024843, 1_198_702],
  [0.024845, 0.024865, 0.024731, 0.024793, 402_781],
  [0.024782, 0.024923, 0.024774, 0.024824, 495_741],
  [0.0248, 0.025004, 0.024792, 0.024892, 891_268],
  [0.024892, 0.02492, 0.024859, 0.024875, 251_237],
  [0.024866, 0.025074, 0.024847, 0.025018, 549_444],
  [0.025015, 0.02515, 0.025015, 0.0251, 685_859],
  [0.025091, 0.025184, 0.025063, 0.025184, 323_133],
  [0.025183, 0.025351, 0.0251, 0.025161, 947_599],
  [0.025168, 0.025267, 0.025101, 0.025238, 468_740],
  [0.025235, 0.02524, 0.025093, 0.025144, 263_808],
].forEach((row) => candles.push(candle(...row)));

// Spike -> two-bar flush -> four-bar absorption -> closed EMA99 reclaim -> live/open candle.
[
  [0.025137, 0.025958, 0.025062, 0.025141, 6_584_769],
  [0.025142, 0.025163, 0.024105, 0.024142, 5_393_001],
  [0.024137, 0.024296, 0.023617, 0.02382, 3_582_175],
  [0.023802, 0.023915, 0.023716, 0.02382, 1_106_036],
  [0.023817, 0.024208, 0.02381, 0.024121, 930_967],
  [0.024109, 0.024291, 0.024071, 0.024141, 990_198],
  [0.02414, 0.024292, 0.024113, 0.024292, 294_325],
  [0.024259, 0.024651, 0.024245, 0.024519, 1_961_852],
  [0.024531, 0.024581, 0.024346, 0.024469, 824_269],
].forEach((row) => candles.push(candle(...row)));

const ready = detectPumpDumpAbsorptionReclaim(candles);
assert.equal(ready.pass, true);
assert.equal(ready.action, 'LONG');
assert.equal(ready.stage, 'PUMP_DUMP_RECLAIM_LONG_READY');
assert.equal(ready.setupVariant, PUMP_DUMP_ABSORPTION_VARIANT);
assert.ok(ready.score >= 70);
assert.equal(ready.entry, 0.024519);
assert.equal(ready.factors.flushLow, 0.023617);
assert.ok(ready.sl < ready.factors.flushLow);
assert.equal(ready.tp, 0.025137);
assert.equal(ready.factors.absorptionBars, 4);
assert.ok(ready.factors.triggerVolumeRatio >= 1.5);

const watchCandles = candles.slice(0, -2);
const watchCurrent = { ...watchCandles.at(-1) };
watchCurrent.openTime += 5 * 60_000;
watchCurrent.closeTime += 5 * 60_000;
watchCandles.push(watchCurrent);
const watch = detectPumpDumpAbsorptionReclaim(watchCandles);
assert.equal(watch.pass, true);
assert.equal(watch.action, 'WATCH');
assert.match(watch.stage, /^PUMP_DUMP_(?:FLUSH|ABSORPTION)_WATCH$/);
assert.equal(watch.entry, null);
assert.equal(watch.sl, null);
assert.equal(watch.tp, null);

const distribution = structuredClone(candles);
const flushLowIndex = distribution.findIndex((row) => Number(row.low) === 0.023617);
distribution[flushLowIndex + 1] = {
  ...distribution[flushLowIndex + 1],
  low: 0.0232,
  close: 0.02325,
  volume: 5_900_000,
};
const rejected = detectPumpDumpAbsorptionReclaim(distribution);
assert.notEqual(rejected.action, 'LONG');

const liveCandleIgnored = structuredClone(candles);
liveCandleIgnored[liveCandleIgnored.length - 1] = {
  ...liveCandleIgnored.at(-1),
  open: 0.0245,
  high: 0.04,
  low: 0.02,
  close: 0.039,
  volume: 99_000_000,
};
const closedOnly = detectPumpDumpAbsorptionReclaim(liveCandleIgnored);
assert.equal(closedOnly.action, 'LONG');
assert.equal(closedOnly.entry, ready.entry);

const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const handlerStart = server.indexOf('async function handleEma99KillReclaimRealLongOrders');
const handlerEnd = server.indexOf("klineCache.on('candleClose'", handlerStart);
const handler = server.slice(handlerStart, handlerEnd);
assert.match(handler, /PUMP_DUMP_ABSORPTION_REAL_ORDER_ENABLED/);
assert.match(handler, /pumpDumpMarginUsdt/);
assert.match(handler, /pumpDumpMaxAgeMs/);
assert.match(handler, /pumpDumpMaxChasePct/);
assert.match(handler, /emaSqueezeBtcHealthAllowsOrder/);
assert.match(handler, /sig\?\.setupVariant === PUMP_DUMP_ABSORPTION_VARIANT/);
assert.match(handler, /source: isPumpDumpAbsorption/);
assert.match(handler, /authorizePumpDumpAbsorptionAutoOrder\(orderPayload\)/);
assert.match(handler, /ema99-kill-reclaim-pump-dump-absorption/);
assert.doesNotMatch(handler, /if \(liveCardOnlyAutoBinanceEnabled\(\)\) return/);

const runtimeEnv = readFileSync(new URL('../.env', import.meta.url), 'utf8');
assert.match(runtimeEnv, /^PUMP_DUMP_ABSORPTION_REAL_ORDER_ENABLED=true$/m);
assert.match(runtimeEnv, /^PUMP_DUMP_ABSORPTION_REAL_MARGIN_USDT=1$/m);
const exampleEnv = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
assert.match(exampleEnv, /^PUMP_DUMP_ABSORPTION_REAL_ORDER_ENABLED=false$/m);

const pageJs = readFileSync(new URL('../public/ema99-kill-reclaim.js', import.meta.url), 'utf8');
const pageHtml = readFileSync(new URL('../public/ema99-kill-reclaim.html', import.meta.url), 'utf8');
assert.match(pageJs, /PUMP→FLUSH→ABSORB/);
assert.match(pageJs, /No Binance order/);
assert.match(pageHtml, /<option value="WATCH">WATCH only<\/option>/);

console.log('EMA99 pump-dump absorption tests passed');
