import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoEntryControls, entryRoute } from '../src/autoEntryControls.js';
import {
  COIN_HORIZON_LOWER_ROUTE,
  COIN_HORIZON_SWEEP_ROUTES,
  COIN_HORIZON_UPPER_ROUTE,
  CoinHorizonSweepBinanceRunner,
  buildCoinHorizonSweepOrder,
} from '../src/coinHorizonSweepBinance.js';
import { collectCoinHorizonSweepState } from '../src/coinHorizonSweepTransitionDiscord.js';

let now = Date.now() + 2_000;
function analysis(symbol, direction, { target = true, generatedAt = now } = {}) {
  const state1h = direction === 'UPPER' ? 'UP' : direction === 'LOWER' ? 'DOWN' : 'UP';
  const state4h = direction === 'UPPER' ? 'UP' : direction === 'LOWER' ? 'DOWN' : 'DOWN';
  return {
    symbol,
    generatedAt: new Date(generatedAt).toISOString(),
    market: { markPrice: 100 },
    freshness: { stale: false, binance: 'FRESH' },
    trend: { frames: [
      { interval: '1h', state: state1h, atr14: 2, closeTime: generatedAt - 1 },
      { interval: '4h', state: state4h, atr14: 6, closeTime: generatedAt - 1 },
    ] },
    zones: { supports: [], resistances: [] },
    coinglass: {
      available: true,
      frames: [{
        range: '24h', scrapedAt: new Date(generatedAt).toISOString(),
        above: target ? [{ bandLow: 106, bandHigh: 106, price: 106,
          lifecycle: 'FRESH', effectiveAttractionScore: 10 }] : [],
        below: target ? [{ bandLow: 94, bandHigh: 94, price: 94,
          lifecycle: 'APPROACHING', effectiveAttractionScore: 9 }] : [],
      }],
    },
  };
}

const upper = collectCoinHorizonSweepState(analysis('UPTESTUSDT', 'UPPER'), now);
const upperPlan = buildCoinHorizonSweepOrder(upper, {
  previousState: 'NEUTRAL', previousObservedAt: now - 30_000,
  now, enabledAt: now - 60_000, markPrice: 100,
});
assert.equal(upperPlan.side, 'BUY');
assert.equal(upperPlan.marginUsdt, 5);
assert.equal(upperPlan.leverage, 5);
assert.equal(upperPlan.notionalUsdt, 25);
assert.equal(upperPlan.takeProfitPrice, 106);
assert.equal(upperPlan.stopLossPrice, 95);
assert.ok(Math.abs(upperPlan.takeProfitRoePct - 30) < 1e-9);
assert.equal(upperPlan.stopLossRoePct, 25);
assert.ok(Math.abs(upperPlan.rewardRisk - 1.2) < 1e-9);

const configuredUpperPlan = buildCoinHorizonSweepOrder(upper, {
  previousState: 'NEUTRAL', previousObservedAt: now - 30_000,
  now, enabledAt: now - 60_000, markPrice: 100,
  routeState: { marginUsdt: 7.5, leverage: 10 },
});
assert.equal(configuredUpperPlan.marginUsdt, 7.5);
assert.equal(configuredUpperPlan.leverage, 10);
assert.equal(configuredUpperPlan.notionalUsdt, 75);
assert.equal(configuredUpperPlan.stopLossPrice, 97.5);
assert.ok(Math.abs(configuredUpperPlan.takeProfitRoePct - 60) < 1e-9);
assert.ok(Math.abs(configuredUpperPlan.rewardRisk - 2.4) < 1e-9);

const lower = collectCoinHorizonSweepState(analysis('DOWNTESTUSDT', 'LOWER'), now);
const lowerPlan = buildCoinHorizonSweepOrder(lower, {
  previousState: 'UPPER', previousObservedAt: now - 30_000,
  now, enabledAt: now - 60_000, markPrice: 100,
});
assert.equal(lowerPlan.side, 'SELL');
assert.equal(lowerPlan.takeProfitPrice, 94);
assert.equal(lowerPlan.stopLossPrice, 105);
assert.ok(Math.abs(lowerPlan.takeProfitRoePct - 30) < 1e-9);
assert.ok(Math.abs(lowerPlan.rewardRisk - 1.2) < 1e-9);

assert.equal(buildCoinHorizonSweepOrder(upper, {
  previousState: 'UPPER', previousObservedAt: now - 30_000,
  now, enabledAt: now - 60_000, markPrice: 100,
}), null, 'same direction is not a transition');
assert.equal(buildCoinHorizonSweepOrder(
  collectCoinHorizonSweepState(analysis('NOTARGETUSDT', 'UPPER', { target: false }), now),
  { previousState: 'NEUTRAL', previousObservedAt: now - 30_000,
    now, enabledAt: now - 60_000, markPrice: 100 },
), null, 'missing liquidity target must fail closed');
assert.equal(buildCoinHorizonSweepOrder(upper, {
  previousState: 'NEUTRAL', previousObservedAt: now - 30_000,
  now, enabledAt: now - 60_000, markPrice: 101,
}), null, 'mark drift above 0.5% must fail closed');

const dir = await mkdtemp(join(tmpdir(), 'coin-horizon-binance-'));
try {
  const controls = new AutoEntryControls(join(dir, 'controls.json'));
  controls.seed(COIN_HORIZON_SWEEP_ROUTES);
  const initial = controls.read();
  assert.equal(initial.enabled, false);
  assert.ok(COIN_HORIZON_SWEEP_ROUTES.every((spec) => (
    initial.routes[entryRoute(spec).key]?.enabled === false
  )), 'both real Binance switches default OFF');

  controls.update({ action: 'master', enabled: true });
  const upperKey = entryRoute(COIN_HORIZON_UPPER_ROUTE).key;
  const lowerKey = entryRoute(COIN_HORIZON_LOWER_ROUTE).key;
  controls.update({ action: 'route', key: upperKey, enabled: true });
  let submissions = [];
  const stateFile = join(dir, 'runner.json');
  const runner = new CoinHorizonSweepBinanceRunner({
    file: stateFile, controls, now: () => now,
    getContext: async () => ({ enabled: true, positions: [], openOrders: [], markPrice: 100 }),
    submit: async (plan) => {
      submissions.push(plan);
      return { status: 'submitted', orderResult: { orderId: submissions.length } };
    },
  });

  assert.equal((await runner.handle(analysis('ALPHAUSDT', 'NEUTRAL'))).status, 'baseline-recorded');
  now += 30_000;
  const result = await runner.handle(analysis('ALPHAUSDT', 'UPPER'));
  assert.equal(result.status, 'submitted');
  assert.equal(result.side, 'LONG');
  assert.equal(submissions.length, 1);
  await Promise.all([
    runner.handle(analysis('ALPHAUSDT', 'UPPER')),
    runner.handle(analysis('ALPHAUSDT', 'UPPER')),
  ]);
  assert.equal(submissions.length, 1, 'concurrent duplicate cannot submit twice');

  const restarted = new CoinHorizonSweepBinanceRunner({
    file: stateFile, controls, now: () => now,
    getContext: async () => { throw new Error('must not read account for replay'); },
    submit: async () => { throw new Error('must not submit replay'); },
  });
  assert.equal((await restarted.handle(analysis('ALPHAUSDT', 'UPPER'))).status, 'unchanged-snapshot');

  controls.update({ action: 'route', key: lowerKey, enabled: true });
  assert.equal((await runner.handle(analysis('BETAUSDT', 'NEUTRAL'))).status, 'baseline-recorded');
  now += 30_000;
  const shortResult = await runner.handle(analysis('BETAUSDT', 'LOWER'));
  assert.equal(shortResult.status, 'submitted');
  assert.equal(shortResult.side, 'SHORT');
  assert.equal(submissions.length, 2);

  controls.update({ action: 'route', key: upperKey, enabled: false });
  assert.equal(controls.read().routes[lowerKey].enabled, true, 'UPPER/LOWER switches are independent');

  const corruptFile = join(dir, 'corrupt.json');
  await writeFile(corruptFile, '{broken', 'utf8');
  const corrupt = new CoinHorizonSweepBinanceRunner({
    file: corruptFile, controls, now: () => now,
    getContext: async () => { throw new Error('corrupt state must fail before account access'); },
    submit: async () => { throw new Error('corrupt state must never submit'); },
  });
  assert.equal((await corrupt.handle(analysis('BADUSDT', 'LOWER'))).status, 'state-error');
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log('Coin Horizon Binance PASS: LONG/SHORT symmetry, dynamic TP, SL25, default OFF, no replay and dedupe.');
