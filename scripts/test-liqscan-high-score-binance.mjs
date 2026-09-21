#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoEntryControls, entryRoute } from '../src/autoEntryControls.js';
import {
  LIQ_SCAN_HIGH_SCORE_BINANCE_VERSION,
  LIQ_SCAN_HIGH_SCORE_ROUTES,
  LiqScanHighScoreBinanceRunner,
  buildLiqScanHighScoreOrder,
  liqScanHighScoreRoute,
} from '../src/liqScanHighScoreBinance.js';
import { LIQ_SCAN_HIGH_SCORE_DISCORD_VERSION } from '../src/liqScanHighScoreDiscord.js';

const baseNow = Date.now() + 2_000;
const event = (dominantSide = 'ABOVE', patch = {}) => ({
  version: LIQ_SCAN_HIGH_SCORE_DISCORD_VERSION,
  symbol: 'TESTUSDT',
  active: true,
  score: 99,
  dominantSide,
  side: dominantSide === 'ABOVE' ? 'LONG' : 'SHORT',
  markPrice: 100,
  evaluatedAt: baseNow,
  observedAt: baseNow,
  current: { liquidityAbove: dominantSide === 'ABOVE' ? 100_000_000 : 0,
    liquidityBelow: dominantSide === 'BELOW' ? 100_000_000 : 0 },
  ...patch,
});

assert.equal(LIQ_SCAN_HIGH_SCORE_BINANCE_VERSION,
  'LIQ_SCAN_HIGH_SCORE_MARKET_EDITABLE_ENTRY_V1_20260916');
assert.equal(LIQ_SCAN_HIGH_SCORE_ROUTES.length, 2);
assert.equal(liqScanHighScoreRoute(event('ABOVE')).signalLabel, 'LIQSCAN_HIGH_SCORE_ABOVE_LONG');
assert.equal(liqScanHighScoreRoute(event('BELOW')).signalLabel, 'LIQSCAN_HIGH_SCORE_BELOW_SHORT');
assert.equal(liqScanHighScoreRoute(event('ABOVE', { score: 65 })), null,
  'lower Discord threshold must not authorize Binance');
assert.equal(liqScanHighScoreRoute(event('ABOVE', { score: 80 })), null);
assert.ok(liqScanHighScoreRoute(event('ABOVE', { score: 80.01 })), 'Binance remains strict >80');
assert.equal(liqScanHighScoreRoute(event('ABOVE', { side: 'SHORT' })), null);

const long = buildLiqScanHighScoreOrder(event('ABOVE'), {
  now: baseNow + 10,
  enabledAt: baseNow - 1_000,
  markPrice: 100,
  routeState: { marginUsdt: 5, leverage: 5, takeProfitRoePct: 15 },
});
assert.deepEqual(
  [long.side, long.marginUsdt, long.leverage, long.notionalUsdt,
    long.takeProfitRoePct, long.stopLossRoePct, long.takeProfitPrice, long.stopLossPrice],
  ['BUY', 5, 5, 25, 15, 20, 103, 96],
);
const short = buildLiqScanHighScoreOrder(event('BELOW'), {
  now: baseNow + 10,
  enabledAt: baseNow - 1_000,
  markPrice: 100,
  routeState: { marginUsdt: 5, leverage: 5, takeProfitRoePct: 15 },
});
assert.deepEqual(
  [short.side, short.takeProfitPrice, short.stopLossPrice, short.stopLossRoePct],
  ['SELL', 97, 106, 30],
);
assert.equal(buildLiqScanHighScoreOrder(event('ABOVE'), {
  now: baseNow + 90_001, enabledAt: baseNow - 1_000, markPrice: 100,
  routeState: { marginUsdt: 5, leverage: 5, takeProfitRoePct: 15 },
}), null, 'stale snapshot is blocked');
assert.equal(buildLiqScanHighScoreOrder(event('ABOVE'), {
  now: baseNow + 10, enabledAt: baseNow - 1_000, markPrice: 100.51,
  routeState: { marginUsdt: 5, leverage: 5, takeProfitRoePct: 15 },
}), null, 'mark drift above 0.5% is blocked');

const directory = await mkdtemp(join(tmpdir(), 'liqscan-high-score-binance-'));
try {
  const controls = new AutoEntryControls(join(directory, 'controls.json'));
  controls.seed(LIQ_SCAN_HIGH_SCORE_ROUTES);
  controls.update({ action: 'master', enabled: true });
  const longKey = entryRoute(LIQ_SCAN_HIGH_SCORE_ROUTES[0]).key;
  controls.update({ action: 'route', key: longKey, enabled: true });
  const enabledAt = Date.parse(controls.read().routes[longKey].enabledAt);
  const liveNow = enabledAt + 1_000;
  const liveEvent = event('ABOVE', { evaluatedAt: liveNow, observedAt: liveNow });
  const submitted = [];
  const runner = new LiqScanHighScoreBinanceRunner({
    file: join(directory, 'runner.json'),
    controls,
    now: () => liveNow + 10,
    getContext: async () => ({ enabled: true, positions: [], openOrders: [], markPrice: 100 }),
    submit: async (plan) => {
      submitted.push(plan);
      return { status: 'submitted', orderResult: { orderId: 123 } };
    },
  });
  const result = await runner.handle(liveEvent);
  assert.equal(result.status, 'submitted');
  assert.equal(result.marginUsdt, 5);
  assert.equal(submitted.length, 1);
  assert.equal((await runner.handle(liveEvent)).status, 'deduped');
  assert.equal(submitted.length, 1, 'same episode never submits twice');
  assert.equal((await runner.handle(event('BELOW', {
    symbol: 'OTHERUSDT', evaluatedAt: liveNow, observedAt: liveNow,
  }))).status, 'off', 'the opposite route is independently OFF');
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('LiqScan >80 Binance PASS: ABOVE/LONG, BELOW/SHORT, $5×5, TP/SL, freshness, drift, OFF and durable dedupe.');
