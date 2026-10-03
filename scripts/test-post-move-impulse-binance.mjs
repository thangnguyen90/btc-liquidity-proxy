import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  POST_MOVE_IMPULSE_LONG_ROUTE,
  POST_MOVE_IMPULSE_SHORT_ROUTE,
  PostMoveImpulseBinanceRunner,
  buildPostMoveImpulseMarketOrder,
} from '../src/postMoveImpulseBinance.js';
import {
  POST_DUMP_NO_SELL_STAGE,
  POST_DUMP_NO_SELL_WATCH_VERSION,
} from '../src/postDumpNoSellWatch.js';
import {
  POST_PUMP_NO_BUY_STAGE,
  POST_PUMP_NO_BUY_WATCH_VERSION,
} from '../src/postPumpNoBuyWatch.js';

const now = Date.parse('2026-10-01T20:00:00Z'); // 03:00 VN: good-hour OR for both sides
const common = {
  symbol: 'TESTUSDT',
  watchOnly: true,
  binanceEligible: false,
  executionCandidate: true,
  observedAt: now - 10_000,
  impulseAt: now - 30_000,
  priceAtWatch: 100,
  score: 80,
};
const longWatch = {
  ...common,
  observedAt: now - 10_000,
  impulseAt: now - 10_000,
  version: POST_DUMP_NO_SELL_WATCH_VERSION,
  side: 'LONG',
  stage: POST_DUMP_NO_SELL_STAGE.BUY_IMPULSE,
};
const shortWatch = {
  ...common,
  symbol: 'SHORTUSDT',
  version: POST_PUMP_NO_BUY_WATCH_VERSION,
  side: 'SHORT',
  stage: POST_PUMP_NO_BUY_STAGE.NO_BUY_CONFIRMATION,
};
const buildOptions = {
  now,
  enabledAt: now - 40_000,
  startedAt: now - 40_000,
  markPrice: 100.2,
};

const longPlan = buildPostMoveImpulseMarketOrder(longWatch, buildOptions);
assert.equal(longPlan.source, POST_MOVE_IMPULSE_LONG_ROUTE.source);
assert.equal(longPlan.side, 'BUY');
assert.equal(longPlan.orderType, 'MARKET');
assert.equal(longPlan.marginUsdt, 5);
assert.equal(longPlan.leverage, 5);
assert.equal(longPlan.notionalUsdt, 25);
assert.equal(longPlan.takeProfitRoePct, 10);
assert.equal(longPlan.stopLossRoePct, 20);
assert.equal(longPlan.maxOpenPositions, 50);
assert.ok(longPlan.takeProfitPrice > longPlan.signalEntryPrice);
assert.ok(longPlan.stopLossPrice < longPlan.signalEntryPrice);

const shortPlan = buildPostMoveImpulseMarketOrder(shortWatch, buildOptions);
assert.equal(shortPlan.source, POST_MOVE_IMPULSE_SHORT_ROUTE.source);
assert.equal(shortPlan.side, 'SELL');
assert.equal(shortPlan.marginUsdt, 5);
assert.equal(shortPlan.stopLossRoePct, 30);
assert.ok(shortPlan.takeProfitPrice < shortPlan.signalEntryPrice);
assert.ok(shortPlan.stopLossPrice > shortPlan.signalEntryPrice);

assert.equal(buildPostMoveImpulseMarketOrder({
  ...longWatch,
  stage: POST_DUMP_NO_SELL_STAGE.NO_SELL_CONFIRMATION,
  executionCandidate: false,
}, buildOptions), null, 'LONG confirmation must not submit a second order');
assert.equal(buildPostMoveImpulseMarketOrder({
  ...shortWatch,
  stage: POST_PUMP_NO_BUY_STAGE.SELL_IMPULSE,
  executionCandidate: false,
}, buildOptions), null, 'SHORT early warning must never submit');
assert.equal(buildPostMoveImpulseMarketOrder({
  ...shortWatch,
  stage: POST_PUMP_NO_BUY_STAGE.LATE_NO_CHASE,
}, buildOptions), null, 'late/no-chase must never submit');
assert.equal(buildPostMoveImpulseMarketOrder({
  ...longWatch,
  executionCandidate: false,
}, buildOptions), null);
assert.equal(buildPostMoveImpulseMarketOrder(longWatch, {
  ...buildOptions,
  markPrice: 101,
}), null, 'MARK drift above 0.5% must block');
assert.equal(buildPostMoveImpulseMarketOrder(longWatch, {
  ...buildOptions,
  enabledAt: now - 5_000,
}), null, 'an impulse created before enable must not replay after confirmation');

const directory = await mkdtemp(join(tmpdir(), 'post-move-impulse-binance-'));
try {
  let enabled = true;
  let existingPosition = false;
  const routeKey = (route) => JSON.stringify([
    route.source, route.streamId, route.signalLabel, route.side,
  ]);
  const routes = Object.fromEntries([
    POST_MOVE_IMPULSE_LONG_ROUTE,
    POST_MOVE_IMPULSE_SHORT_ROUTE,
  ].map((route) => [routeKey(route), {
    key: routeKey(route),
    source: route.source,
    stream: route.streamId,
    label: route.signalLabel,
    side: route.side,
    enabled: true,
    enabledAt: new Date(now - 40_000).toISOString(),
    marginUsdt: 5,
    leverage: 5,
    takeProfitRoePct: 10,
  }]));
  const controls = {
    register(route) { return { ...route, key: routeKey(route) }; },
    read() { return { enabled, routes }; },
    assertEntry() {},
  };
  const submitted = [];
  const runner = new PostMoveImpulseBinanceRunner({
    file: join(directory, 'state.json'),
    controls,
    now: () => now,
    startedAt: now - 40_000,
    getContext: async (symbol) => ({
      enabled: true,
      markPrice: 100.2,
      credentials: {},
      positions: existingPosition ? [{ symbol, positionAmt: '1' }] : [],
      openOrders: [],
    }),
    submit: async (plan) => {
      submitted.push(plan);
      return { status: 'submitted', orderResult: { orderId: submitted.length } };
    },
  });

  const first = await runner.processWatches([longWatch]);
  assert.equal(first.submitted, 1);
  assert.equal(submitted.length, 1);
  const duplicate = await runner.processWatches([longWatch]);
  assert.equal(duplicate.submitted, 0);
  assert.equal(duplicate.results[0].status, 'deduped:SUBMITTED');

  existingPosition = true;
  const blocked = await runner.processWatches([{ ...shortWatch, symbol: 'POSITIONUSDT' }]);
  assert.equal(blocked.results[0].status, 'existing-position');
  assert.equal(submitted.length, 1);

  existingPosition = false;
  enabled = false;
  const off = await runner.processWatches([{ ...shortWatch, symbol: 'OFFUSDT' }]);
  assert.equal(off.results[0].status, 'off');
  assert.equal(submitted.length, 1);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('post-move impulse Binance tests passed');
