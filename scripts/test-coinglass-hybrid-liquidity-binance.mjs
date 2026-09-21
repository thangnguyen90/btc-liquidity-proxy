import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoEntryControls } from '../src/autoEntryControls.js';
import {
  authorizeCoinglassHybridLiquidityOrder,
  evaluateAutoBinanceEntryPolicy,
} from '../src/autoBinancePolicy.js';
import { COINGLASS_HYBRID_LIQUIDITY_HUNTER_VERSION } from '../src/coinglassHybridLiquidityHunter.js';
import {
  COINGLASS_HYBRID_LIQUIDITY_BINANCE_VERSION,
  COINGLASS_HYBRID_LIQUIDITY_ROUTES,
  COINGLASS_HYBRID_LOWER_SHORT_LABEL,
  COINGLASS_HYBRID_UPPER_LONG_LABEL,
  CoinglassHybridLiquidityBinanceRunner,
  buildCoinglassHybridLiquidityOrder,
  coinglassHybridLiquidityRoute,
} from '../src/coinglassHybridLiquidityBinance.js';

const now = Date.UTC(2026, 8, 13, 8, 0, 0);
const enabledAt = new Date(now - 60_000).toISOString();
const signal = (side = 'LONG', streamId = 'primary') => ({
  version: COINGLASS_HYBRID_LIQUIDITY_HUNTER_VERSION,
  generatedAt: now - 10_000,
  confirmedAt: now - 20_000,
  candleCloseAt: now - 20_000,
  streamId,
  symbol: side === 'LONG' ? 'UPPERUSDT' : 'LOWERUSDT',
  ready: true,
  observeOnly: false,
  binanceEligible: true,
  executionEligible: true,
  side,
  label: side === 'LONG'
    ? COINGLASS_HYBRID_UPPER_LONG_LABEL
    : COINGLASS_HYBRID_LOWER_SHORT_LABEL,
  bias: side === 'LONG' ? 'UPPER_FIRST' : 'LOWER_FIRST',
  target: { targetPrice: side === 'LONG' ? 110 : 90 },
  binance: {
    lastPrice: 100,
    confirmedAt: now - 20_000,
    impulse: { bodyPct: side === 'LONG' ? 3.2 : -3.2, atrRatio: 2.1, volumeX: 2.4 },
  },
});

assert.equal(
  COINGLASS_HYBRID_LIQUIDITY_BINANCE_VERSION,
  'COINGLASS_HYBRID_LIQUIDITY_EDITABLE_ENTRY_SETTINGS_V2_20260914',
);
assert.equal(COINGLASS_HYBRID_LIQUIDITY_ROUTES.length, 4);

const longPlan = buildCoinglassHybridLiquidityOrder(signal(), {
  now, enabledAt, markPrice: 100.2,
});
assert.equal(longPlan.side, 'BUY');
assert.equal(longPlan.marginUsdt, 1);
assert.equal(longPlan.leverage, 5);
assert.equal(longPlan.notionalUsdt, 5);
assert.equal(longPlan.takeProfitPrice, 102);
assert.equal(longPlan.takeProfitRoePct, 10);
assert.equal(longPlan.stopLossPrice, undefined);
assert.equal(longPlan.protectionOnFill, true);
assert.equal(longPlan.allowMinNotionalCeil, true);

const shortPlan = buildCoinglassHybridLiquidityOrder(signal('SHORT', 'secondary'), {
  now, enabledAt, markPrice: 99.8,
});
assert.equal(shortPlan.side, 'SELL');
assert.equal(shortPlan.takeProfitPrice, 98);
assert.notEqual(shortPlan.clientOrderId, longPlan.clientOrderId);

assert.equal(coinglassHybridLiquidityRoute({
  ...signal(), label: 'HYBRID_TWO_SIDED_WHIPSAW_RISK_READY', side: null, observeOnly: true,
}), null, 'whipsaw remains observe-only');
assert.equal(buildCoinglassHybridLiquidityOrder(signal(), {
  now, enabledAt: new Date(now - 10_000).toISOString(), markPrice: 100,
}), null, 'pre-enable signals cannot replay');
assert.equal(buildCoinglassHybridLiquidityOrder(signal(), {
  now: now + 7 * 60_000 + 1, enabledAt, markPrice: 100,
}), null, 'stale signals cannot enter');
assert.equal(buildCoinglassHybridLiquidityOrder(signal(), {
  now, enabledAt, markPrice: 100.51,
}), null, 'mark drift over 0.5% blocks');

const authorized = evaluateAutoBinanceEntryPolicy({
  payload: authorizeCoinglassHybridLiquidityOrder(longPlan),
  orderEnabled: true,
});
assert.equal(authorized.allowed, true);
assert.equal(authorized.reason, 'COINGLASS_HYBRID_DIRECTIONAL_CONFIGURED_ENTRY');
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: longPlan, orderEnabled: true,
}).allowed, false, 'the exact authorization marker is required');
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: authorizeCoinglassHybridLiquidityOrder({ ...longPlan, marginUsdt: 2, notionalUsdt: 5 }),
  orderEnabled: true,
}).allowed, false, 'size mutation fails closed');
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: authorizeCoinglassHybridLiquidityOrder({ ...longPlan, marginUsdt: 2, notionalUsdt: 10 }),
  orderEnabled: true,
}).allowed, true, 'private executor may submit a self-consistent configured size');

const configuredLongPlan = buildCoinglassHybridLiquidityOrder(signal(), {
  now, enabledAt, markPrice: 100.2,
  routeState: { marginUsdt: 3.5, leverage: 7, takeProfitRoePct: 22 },
});
assert.equal(configuredLongPlan.marginUsdt, 3.5);
assert.equal(configuredLongPlan.leverage, 7);
assert.equal(configuredLongPlan.notionalUsdt, 24.5);
assert.equal(configuredLongPlan.takeProfitRoePct, 22);
assert.ok(Math.abs(configuredLongPlan.takeProfitPrice - (100 * (1 + .22 / 7))) < 1e-12);

const controlsDir = await mkdtemp(join(tmpdir(), 'hybrid-controls-'));
const realControls = new AutoEntryControls(join(controlsDir, 'controls.json'));
realControls.seed(COINGLASS_HYBRID_LIQUIDITY_ROUTES);
const seeded = realControls.read();
assert.equal(seeded.enabled, false);
for (const routeSpec of COINGLASS_HYBRID_LIQUIDITY_ROUTES) {
  const registered = realControls.register(routeSpec);
  assert.equal(seeded.routes[registered.key].enabled, false, `${routeSpec.signalLabel} defaults OFF`);
}

const runnerDir = await mkdtemp(join(tmpdir(), 'hybrid-runner-'));
const stateFile = join(runnerDir, 'state.json');
let submissions = 0;
let asserted = 0;
const controls = {
  register: () => ({ key: 'route' }),
  read: () => ({ enabled: true, routes: { route: { enabled: true, enabledAt,
    marginUsdt: 3.5, leverage: 7, takeProfitRoePct: 22 } } }),
  assertEntry: (plan) => {
    asserted += 1;
    assert.equal(plan.marginUsdt, 3.5);
    assert.equal(plan.leverage, 7);
    assert.equal(plan.takeProfitRoePct, 22);
  },
};
const runner = new CoinglassHybridLiquidityBinanceRunner({
  file: stateFile,
  controls,
  now: () => now,
  getContext: async () => ({
    enabled: true,
    positions: [],
    openOrders: [],
    markPrice: 100.1,
  }),
  submit: async (plan) => {
    submissions += 1;
    return { status: 'submitted', orderResult: { orderId: 654 }, plan };
  },
});
const first = await runner.handle(signal());
assert.equal(first.status, 'submitted');
assert.equal(first.orderId, 654);
assert.equal(first.side, 'LONG');
assert.equal(first.marginUsdt, 3.5);
assert.equal(first.leverage, 7);
assert.equal(first.takeProfitRoePct, 22);
assert.equal(submissions, 1);
assert.equal(asserted, 1);
assert.equal((await runner.handle(signal())).status, 'deduped');
assert.equal(submissions, 1);
const persisted = JSON.parse(await readFile(stateFile, 'utf8'));
assert.equal(Object.values(persisted.attempts)[0].status, 'submitted');

const positionRunner = new CoinglassHybridLiquidityBinanceRunner({
  file: join(runnerDir, 'position.json'), controls, now: () => now,
  getContext: async (symbol) => ({
    enabled: true,
    positions: [{ symbol, positionAmt: '-1' }],
    openOrders: [],
    markPrice: 100,
  }),
  submit: async () => { throw new Error('must not submit'); },
});
assert.equal((await positionRunner.handle(signal('SHORT'))).status, 'existing-position');

console.log('CoinGlass Hybrid Liquidity Binance: exact LONG/SHORT routes, $1×5, TP10, policy, freshness, controls and dedupe passed.');
