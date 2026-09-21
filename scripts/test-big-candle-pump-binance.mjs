import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoEntryControls, entryRoute } from '../src/autoEntryControls.js';
import {
  authorizeBigCandlePump15mOrder,
  evaluateAutoBinanceEntryPolicy,
} from '../src/autoBinancePolicy.js';
import {
  BIG_CANDLE_PUMP_15M_BINANCE_VERSION,
  BIG_CANDLE_PUMP_15M_LABEL,
  BIG_CANDLE_PUMP_15M_ROUTE,
  BIG_CANDLE_PUMP_15M_SIGNAL_VERSION,
  BigCandlePump15mBinanceRunner,
  buildBigCandlePump15mOrder,
  buildBigCandlePump15mSignal,
} from '../src/bigCandlePumpBinance.js';

const now = Date.UTC(2026, 8, 14, 14, 0, 37);
const candleOpenAt = Date.UTC(2026, 8, 14, 13, 45, 0);
const candleCloseAt = Date.UTC(2026, 8, 14, 13, 59, 59, 999);
const signal = buildBigCandlePump15mSignal({
  row: { symbol: 'POWERUSDT', markPrice: 0.130819 },
  candle: {
    openTime: candleOpenAt,
    closeTime: candleCloseAt,
    open: 0.1189,
    close: 0.13083,
  },
  candlePct: 10.03,
  volumeRatio: 2.5,
  now,
});

assert.equal(BIG_CANDLE_PUMP_15M_SIGNAL_VERSION, 'BIG_CANDLE_PUMP_15M_CLOSED_SIGNAL_V1_20260914');
assert.equal(BIG_CANDLE_PUMP_15M_BINANCE_VERSION, 'BIG_CANDLE_PUMP_15M_MARKET_EDITABLE_ENTRY_V1_20260914');
assert.equal(signal.label, BIG_CANDLE_PUMP_15M_LABEL);
assert.equal(signal.binanceEligible, true);
assert.equal(signal.observeOnly, false);

const enabledAt = new Date(candleCloseAt - 60_000).toISOString();
const plan = buildBigCandlePump15mOrder(signal, {
  now,
  enabledAt,
  markPrice: 0.1309,
});
assert.equal(plan.side, 'BUY');
assert.equal(plan.marginUsdt, 10);
assert.equal(plan.leverage, 5);
assert.equal(plan.notionalUsdt, 50);
assert.equal(plan.takeProfitRoePct, 15);
assert.equal(plan.stopLossRoePct, 20);
assert.ok(Math.abs(plan.takeProfitPrice - 0.130819 * 1.03) < 1e-12);
assert.ok(Math.abs(plan.stopLossPrice - 0.130819 * 0.96) < 1e-12);
assert.equal(plan.protectionOnFill, true);

assert.equal(buildBigCandlePump15mOrder({ ...signal, candlePct: 7.99 }, {
  now, enabledAt, markPrice: signal.markPrice,
}), null, 'body below 8% is not this signal');
assert.equal(buildBigCandlePump15mOrder(signal, {
  now, enabledAt: new Date(candleCloseAt + 1).toISOString(), markPrice: signal.markPrice,
}), null, 'pre-enable closed candles cannot replay');
assert.equal(buildBigCandlePump15mOrder(signal, {
  now: candleCloseAt + 90_001, enabledAt, markPrice: signal.markPrice,
}), null, 'candle older than 90 seconds is blocked');
assert.equal(buildBigCandlePump15mOrder(signal, {
  now, enabledAt, markPrice: signal.markPrice * 1.0051,
}), null, 'mark drift beyond 0.5% is blocked');

const authorization = evaluateAutoBinanceEntryPolicy({
  payload: authorizeBigCandlePump15mOrder(plan),
  orderEnabled: true,
});
assert.equal(authorization.allowed, true);
assert.equal(authorization.reason, 'BIG_CANDLE_PUMP_15M_LONG_CONFIGURED_ENTRY');
assert.equal(evaluateAutoBinanceEntryPolicy({ payload: plan, orderEnabled: true }).allowed, false);
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: authorizeBigCandlePump15mOrder({ ...plan, side: 'SELL' }), orderEnabled: true,
}).allowed, false, 'XẢ MẠNH / SHORT is not authorized');

const dir = await mkdtemp(join(tmpdir(), 'big-candle-binance-'));
try {
  const controls = new AutoEntryControls(join(dir, 'controls.json'));
  controls.seed([BIG_CANDLE_PUMP_15M_ROUTE]);
  let state = controls.read();
  const route = entryRoute(BIG_CANDLE_PUMP_15M_ROUTE);
  assert.equal(state.routes[route.key].enabled, false, 'new route is fail-closed until explicitly enabled');
  assert.deepEqual(
    [state.routes[route.key].marginUsdt, state.routes[route.key].leverage,
      state.routes[route.key].takeProfitRoePct],
    [10, 5, 15],
  );
  controls.update({ action: 'master', enabled: true });
  controls.update({ action: 'route', key: route.key, enabled: true });
  state = controls.read();
  state.routes[route.key].enabledAt = enabledAt;
  controls.save(state);

  let submissions = 0;
  const runner = new BigCandlePump15mBinanceRunner({
    file: join(dir, 'runner.json'),
    controls,
    now: () => now,
    getContext: async () => ({
      enabled: true, positions: [], openOrders: [], markPrice: 0.1309,
    }),
    submit: async (order) => {
      submissions += 1;
      return { status: 'submitted', orderResult: { orderId: 789 }, order };
    },
  });
  const first = await runner.handle(signal);
  assert.equal(first.status, 'submitted');
  assert.equal(first.orderId, 789);
  assert.equal(first.marginUsdt, 10);
  assert.equal(first.stopLossRoePct, 20);
  assert.equal(submissions, 1);
  assert.equal((await runner.handle(signal)).status, 'deduped');
  assert.equal(submissions, 1);
  const persisted = JSON.parse(await readFile(join(dir, 'runner.json'), 'utf8'));
  assert.equal(Object.values(persisted.attempts)[0].status, 'submitted');
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log('Big Candle Pump 15m Binance PASS: closed +8% LONG, $10×5, TP15, SL20, freshness, policy, controls and dedupe.');
