#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoEntryControls, entryRoute } from '../src/autoEntryControls.js';
import { LIQ_SCAN_MAIN_KILL_SWEEP_VERSION } from '../src/liqScanMainKillSweep.js';
import {
  LIQ_SCAN_MAIN_KILL_SWEEP_BINANCE_VERSION,
  LIQ_SCAN_MAIN_KILL_SWEEP_MIN_ZONE_LIQUIDITY_USDT,
  LIQ_SCAN_MAIN_KILL_SWEEP_ROUTES,
  LiqScanMainKillSweepBinanceRunner,
  buildLiqScanMainKillSweepOrder,
  liqScanMainKillSweepRoute,
} from '../src/liqScanMainKillSweepBinance.js';

assert.equal(LIQ_SCAN_MAIN_KILL_SWEEP_MIN_ZONE_LIQUIDITY_USDT, 50_000_000);
assert.match(LIQ_SCAN_MAIN_KILL_SWEEP_BINANCE_VERSION, /EXTREME_REVERSAL_MARKET_V1_20260918$/);
assert.equal(LIQ_SCAN_MAIN_KILL_SWEEP_ROUTES.length, 2);

const event = ({
  symbol = 'NEARUSDT', side = 'UPPER', detectedAt = Date.now(), liquidity = 541_370_000,
  markNow = 3.638, crossingExtreme = side === 'UPPER' ? 3.6401 : 3.62,
} = {}) => ({
  version: LIQ_SCAN_MAIN_KILL_SWEEP_VERSION,
  symbol,
  side,
  dedupeKey: `${symbol}|${side}|zone`,
  detectedAt: new Date(detectedAt).toISOString(),
  armedAt: new Date(detectedAt - 30_000).toISOString(),
  markNow,
  crossingExtreme,
  zone: side === 'UPPER'
    ? { low: 3.63042, high: 3.63762, liquidity }
    : { low: 3.62, high: 3.63, liquidity },
  volumeTier: { key: 'EXTREME', rank: 5, amount: liquidity },
});

const upper = event();
const lower = event({ symbol: 'LOWERUSDT', side: 'LOWER', markNow: 3.619, crossingExtreme: 3.619 });
assert.equal(liqScanMainKillSweepRoute(upper).side, 'SHORT');
assert.equal(liqScanMainKillSweepRoute(lower).side, 'LONG');
assert.equal(liqScanMainKillSweepRoute({ ...upper, zone: { ...upper.zone, liquidity: 49_999_999 },
  volumeTier: { key: 'VERY_LARGE', rank: 4 } }), null, 'Only the red >=50M tier can trade.');

const shortPlan = buildLiqScanMainKillSweepOrder(upper, {
  now: Date.parse(upper.detectedAt) + 1_000,
  enabledAt: Date.parse(upper.detectedAt) - 1,
  markPrice: upper.markNow,
  routeState: { marginUsdt: 1, leverage: 5, takeProfitRoePct: 10 },
});
assert.equal(shortPlan.side, 'SELL');
assert.equal(shortPlan.marginUsdt, 1);
assert.equal(shortPlan.leverage, 5);
assert.equal(shortPlan.notionalUsdt, 5);
assert.equal(shortPlan.takeProfitRoePct, 10);
assert.equal(shortPlan.stopLossRoePct, 30);
assert.equal(shortPlan.allowMinNotionalCeil, true, '$5 notional may ceil <=1% to avoid Binance -4164 after step rounding.');
assert.equal(shortPlan.takeProfitPrice, upper.markNow * 0.98);
assert.equal(shortPlan.stopLossPrice, upper.markNow * 1.06);

const longPlan = buildLiqScanMainKillSweepOrder(lower, {
  now: Date.parse(lower.detectedAt) + 1_000,
  enabledAt: Date.parse(lower.detectedAt) - 1,
  markPrice: lower.markNow,
  routeState: { marginUsdt: 1, leverage: 5, takeProfitRoePct: 10 },
});
assert.equal(longPlan.side, 'BUY');
assert.equal(longPlan.takeProfitPrice, lower.markNow * 1.02);
assert.equal(longPlan.stopLossPrice, lower.markNow * 0.94);
assert.equal(buildLiqScanMainKillSweepOrder(upper, {
  now: Date.parse(upper.detectedAt) + 1_000,
  enabledAt: Date.parse(upper.detectedAt) + 1,
  markPrice: upper.markNow,
  routeState: { marginUsdt: 1, leverage: 5, takeProfitRoePct: 10 },
}), null, 'Signals from before enabledAt cannot replay.');
assert.equal(buildLiqScanMainKillSweepOrder(upper, {
  now: Date.parse(upper.detectedAt) + 91_000,
  enabledAt: Date.parse(upper.detectedAt) - 1,
  markPrice: upper.markNow,
  routeState: { marginUsdt: 1, leverage: 5, takeProfitRoePct: 10 },
}), null, 'Stale signals are blocked.');
assert.equal(buildLiqScanMainKillSweepOrder(upper, {
  now: Date.parse(upper.detectedAt) + 1_000,
  enabledAt: Date.parse(upper.detectedAt) - 1,
  markPrice: upper.markNow * 1.006,
  routeState: { marginUsdt: 1, leverage: 5, takeProfitRoePct: 10 },
}), null, 'More than 0.5% mark drift is blocked.');

const directory = await mkdtemp(join(tmpdir(), 'liqscan-main-kill-binance-'));
try {
  const controls = new AutoEntryControls(join(directory, 'controls.json'));
  controls.seed(LIQ_SCAN_MAIN_KILL_SWEEP_ROUTES);
  controls.update({ action: 'master', enabled: true });
  const shortRoute = LIQ_SCAN_MAIN_KILL_SWEEP_ROUTES.find((route) => route.side === 'SHORT');
  controls.update({ action: 'route', key: entryRoute(shortRoute).key, enabled: true });
  let now = Date.now() + 10;
  const liveEvent = event({ detectedAt: now, markNow: 3.638, crossingExtreme: 3.64 });
  let submissions = 0;
  const runner = new LiqScanMainKillSweepBinanceRunner({
    file: join(directory, 'attempts.json'), controls, now: () => now,
    getContext: async () => ({ enabled: true, positions: [], openOrders: [], markPrice: liveEvent.markNow }),
    submit: async (plan) => {
      submissions += 1;
      assert.equal(plan.side, 'SELL');
      return { status: 'SUBMITTED', orderResult: { orderId: 991 } };
    },
  });
  const submitted = await runner.handle(liveEvent);
  assert.equal(submitted.status, 'SUBMITTED');
  assert.equal(submitted.marginUsdt, 1);
  assert.equal(submissions, 1);
  assert.equal((await runner.handle(liveEvent)).status, 'deduped');
  assert.equal(submissions, 1, 'A handled sweep is never submitted twice.');

  const occupiedRunner = new LiqScanMainKillSweepBinanceRunner({
    file: join(directory, 'occupied.json'), controls, now: () => now,
    getContext: async () => ({ enabled: true,
      positions: [{ symbol: 'BUSYUSDT', positionAmt: '-2' }], openOrders: [], markPrice: 3.638 }),
    submit: async () => { throw new Error('must not submit'); },
  });
  const busy = event({ symbol: 'BUSYUSDT', detectedAt: now, markNow: 3.638, crossingExtreme: 3.64 });
  assert.equal((await occupiedRunner.handle(busy)).status, 'existing-position');
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('LiqScan MAIN KILL Binance PASS: red >=50M only, inverse direction, $1x5, TP10/SL30, freshness, drift, no replay/DCA and durable dedupe.');
