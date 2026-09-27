import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoEntryControls, entryRoute } from '../src/autoEntryControls.js';
import {
  POST_MOVE_IDEAL_LONG_1H_BINANCE_VERSION,
  POST_MOVE_IDEAL_LONG_1H_ROUTE,
  POST_MOVE_IDEAL_LONG_4H_BINANCE_VERSION,
  POST_MOVE_IDEAL_LONG_4H_ROUTE,
  POST_MOVE_IDEAL_SHORT_1H_BINANCE_VERSION,
  POST_MOVE_IDEAL_SHORT_1H_ROUTE,
  POST_MOVE_IDEAL_SHORT_4H_BINANCE_VERSION,
  POST_MOVE_IDEAL_SHORT_4H_ROUTE,
  POST_MOVE_PRIORITY_15M_BINANCE_VERSION,
  POST_MOVE_PRIORITY_15M_MAX_OPEN_POSITIONS,
  POST_MOVE_PRIORITY_LONG_15M_ROUTE,
  POST_MOVE_PRIORITY_SHORT_15M_ROUTE,
  PostMoveIdealLong1hBinanceRunner,
  PostMoveIdealLong4hBinanceRunner,
  PostMoveIdealShort1hBinanceRunner,
  PostMoveIdealShort4hBinanceRunner,
  PostMovePriorityLong15mBinanceRunner,
  PostMovePriorityShort15mBinanceRunner,
  buildPostMoveIdealLong1hOrder,
  buildPostMoveIdealLong4hOrder,
  buildPostMoveIdealShort1hOrder,
  buildPostMoveIdealShort4hOrder,
  buildPostMovePriorityLong15mOrder,
  buildPostMovePriorityShort15mOrder,
  collectPostMoveIdealLong1hCandidates,
  collectPostMoveIdealLong4hCandidates,
  collectPostMoveIdealShort1hCandidates,
  collectPostMoveIdealShort4hCandidates,
  collectPostMovePriorityLong15mCandidates,
  collectPostMovePriorityShort15mCandidates,
} from '../src/postMoveIdealEntryBinance.js';

const frame = (price, status = 'BUILDING', stageKey = 'SHORT_NEAR_TOP') => ({
  timeframes: [
    { interval: '15m', items: [{ symbol: 'NOPEUSDT', currentPrice: price, pumpAt: 1,
      status, idealEntry: { zoneLow: 100, zoneHigh: 102 } }] },
    { interval: '1h', items: [{ symbol: 'TESTUSDT', currentPrice: price, pumpAt: 1_790_000_000_000,
      status, score: 75, moveStage: { key: stageKey, label: stageKey, entryHint: 'test' },
      idealEntry: { zoneLow: 100, zoneHigh: 102, midpoint: 101 } }] },
    { interval: '4h', items: [] },
  ],
});

const longFrame = (price, status = 'BUILDING', stageKey = 'LONG_FRESH_REVERSAL') => ({
  timeframes: [
    { interval: '15m', items: [] },
    { interval: '1h', items: [{ symbol: 'LONGUSDT', currentPrice: price, dumpAt: 1_790_000_200_000,
      status, score: 82, moveStage: { key: stageKey, label: stageKey, entryHint: 'test' },
      idealEntry: { zoneLow: 100, zoneHigh: 102, midpoint: 101 } }] },
    { interval: '4h', items: [] },
  ],
});

const long4hFrame = (price, status = 'BUILDING', stageKey = 'LONG_FIRST_STRONG_CANDLE') => ({
  timeframes: [
    { interval: '15m', items: [] },
    { interval: '1h', items: [] },
    { interval: '4h', items: [{ symbol: 'NEARUSDT', currentPrice: price, dumpAt: 1_790_000_400_000,
      status, score: 88, moveStage: { key: stageKey, label: stageKey, entryHint: 'test' },
      idealEntry: { zoneLow: 100, zoneHigh: 102, midpoint: 101 } }] },
  ],
});

const short4hFrame = (price, status = 'BUILDING', stageKey = 'SHORT_FIRST_STRONG_CANDLE') => ({
  timeframes: [
    { interval: '15m', items: [] },
    { interval: '1h', items: [] },
    { interval: '4h', items: [{ symbol: 'SHORT4HUSDT', currentPrice: price, pumpAt: 1_790_000_500_000,
      status, score: 86, moveStage: { key: stageKey, label: stageKey, entryHint: 'test' },
      idealEntry: { zoneLow: 100, zoneHigh: 102, midpoint: 101 } }] },
  ],
});

const priorityFrame = (side, stageKey, { symbol, price = 100, anchorAt = 1_790_000_600_000 } = {}) => ({
  timeframes: [{
    interval: '15m',
    items: [{
      symbol: symbol ?? (side === 'LONG' ? 'PRIORITYLONGUSDT' : 'PRIORITYSHORTUSDT'),
      currentPrice: price,
      status: 'BUILDING',
      score: 90,
      ...(side === 'LONG'
        ? {
          dumpAt: anchorAt, dumpAgeBars: 1,
          lift: stageKey === 'LONG_FIRST_STRONG_CANDLE' ? { ageBars: 0 } : null,
        }
        : {
          pumpAt: anchorAt, pumpAgeBars: 1,
          sell: stageKey === 'SHORT_FIRST_STRONG_CANDLE' ? { ageBars: 0 } : null,
        }),
      moveStage: { key: stageKey, label: stageKey, entryHint: 'test' },
      idealEntry: { state: side === 'LONG' ? 'WAIT_RECLAIM' : 'WAIT_REJECT' },
    }],
  }],
});

const emptyPriorityFrame = { timeframes: [{ interval: '15m', items: [] }] };

assert.equal(POST_MOVE_IDEAL_SHORT_1H_BINANCE_VERSION,
  'POST_MOVE_IDEAL_SHORT_1H_PRIORITY_TOUCH_MARKET_10USDT_V2_20260925');
assert.equal(collectPostMoveIdealShort1hCandidates(frame(103)).length, 1);
assert.equal(collectPostMoveIdealShort1hCandidates(frame(103, 'BUILDING', 'SHORT_FADING')).length, 0);
assert.equal(collectPostMoveIdealShort1hCandidates(frame(101, 'WEAKENED')).length, 0);
assert.equal(POST_MOVE_IDEAL_LONG_1H_BINANCE_VERSION,
  'POST_MOVE_IDEAL_LONG_1H_PRIORITY_TOUCH_MARKET_5USDT_V2_20260925');
assert.equal(collectPostMoveIdealLong1hCandidates(longFrame(103)).length, 1);
assert.equal(collectPostMoveIdealLong1hCandidates(longFrame(103, 'BUILDING', 'LONG_RECOVERING')).length, 0);
assert.equal(collectPostMoveIdealLong1hCandidates(longFrame(101, 'WEAKENED')).length, 0);
assert.equal(POST_MOVE_IDEAL_LONG_4H_BINANCE_VERSION,
  'POST_MOVE_IDEAL_LONG_4H_PRIORITY_TOUCH_MARKET_10USDT_V2_20260925');
assert.equal(collectPostMoveIdealLong4hCandidates(long4hFrame(103)).length, 1);
assert.equal(collectPostMoveIdealLong4hCandidates(long4hFrame(103, 'BUILDING', 'LONG_EXTENDED')).length, 0);
assert.equal(collectPostMoveIdealLong4hCandidates(long4hFrame(101, 'WEAKENED')).length, 0);
assert.equal(POST_MOVE_IDEAL_SHORT_4H_BINANCE_VERSION,
  'POST_MOVE_IDEAL_SHORT_4H_PRIORITY_TOUCH_MARKET_10USDT_V1_20260925');
assert.equal(collectPostMoveIdealShort4hCandidates(short4hFrame(103)).length, 1);
assert.equal(collectPostMoveIdealShort4hCandidates(short4hFrame(103, 'BUILDING', 'SHORT_EXTENDED')).length, 0);
assert.equal(POST_MOVE_PRIORITY_15M_BINANCE_VERSION,
  'POST_MOVE_PRIORITY_STAGE_15M_MARKET_2USDT_MAX15_V1_20260925');
assert.equal(collectPostMovePriorityLong15mCandidates(
  priorityFrame('LONG', 'LONG_FRESH_REVERSAL'),
).length, 1);
assert.equal(collectPostMovePriorityLong15mCandidates(
  priorityFrame('LONG', 'LONG_EXTENDED'),
).length, 0);
assert.equal(collectPostMovePriorityShort15mCandidates(
  priorityFrame('SHORT', 'SHORT_NEAR_TOP'),
).length, 1);
assert.equal(collectPostMovePriorityShort15mCandidates(
  priorityFrame('SHORT', 'SHORT_EXTENDED'),
).length, 0);

const dir = await mkdtemp(join(tmpdir(), 'post-move-short-1h-'));
try {
  const controls = new AutoEntryControls(join(dir, 'controls.json'));
  controls.seed([POST_MOVE_IDEAL_SHORT_1H_ROUTE]);
  controls.update({ action: 'master', enabled: true });
  const key = entryRoute(POST_MOVE_IDEAL_SHORT_1H_ROUTE).key;
  controls.update({ action: 'route', key, enabled: true });
  const route = controls.read().routes[key];
  const now = Date.parse(route.enabledAt) + 2_000;
  const event = { ...collectPostMoveIdealShort1hCandidates(frame(101))[0], touchAt: now };
  const plan = buildPostMoveIdealShort1hOrder(event, {
    now, enabledAt: route.enabledAt, markPrice: 101, routeState: route,
  });
  assert.equal(plan.side, 'SELL');
  assert.equal(plan.orderType, 'MARKET');
  assert.equal(plan.marginUsdt, 10);
  assert.equal(plan.leverage, 5);
  assert.equal(plan.notionalUsdt, 50);
  assert.equal(plan.takeProfitRoePct, 6);
  assert.equal(plan.stopLossRoePct, 30);
  assert.ok(plan.takeProfitPrice < 101 && plan.stopLossPrice > 101);
  assert.equal(buildPostMoveIdealShort1hOrder(event, {
    now, enabledAt: route.enabledAt, markPrice: 103, routeState: route,
  }), null, 'fresh mark outside the ideal zone must block entry');

  let submitted = 0;
  const runner = new PostMoveIdealShort1hBinanceRunner({
    file: join(dir, 'state.json'), controls, now: () => now,
    getContext: async () => ({ enabled: true, markPrice: 101, positions: [], openOrders: [], credentials: {} }),
    submit: async (order) => {
      submitted += 1;
      assert.equal(order.marginUsdt, 10);
      return { status: 'submitted', orderResult: { orderId: 123 } };
    },
  });
  assert.equal((await runner.processSnapshot(frame(103))).status, 'baseline');
  const warmingSnapshot = frame(103);
  warmingSnapshot.timeframes[1].items.push({
    symbol: 'WARMUSDT', currentPrice: 101, pumpAt: 1_790_000_100_000,
    status: 'BUILDING', score: 80, idealEntry: { zoneLow: 100, zoneHigh: 102, midpoint: 101 },
  });
  await runner.processSnapshot(warmingSnapshot);
  assert.equal(submitted, 0, 'candidate first discovered inside the zone is baseline-only');
  const touched = await runner.processSnapshot(frame(101));
  assert.equal(touched.submitted, 1);
  assert.equal(submitted, 1);
  await runner.processSnapshot(frame(101));
  assert.equal(submitted, 1, 'same setup must be durable-deduped');

  controls.seed([POST_MOVE_IDEAL_LONG_1H_ROUTE]);
  const longKey = entryRoute(POST_MOVE_IDEAL_LONG_1H_ROUTE).key;
  controls.update({ action: 'route', key: longKey, enabled: true });
  const longRoute = controls.read().routes[longKey];
  const longNow = Date.parse(longRoute.enabledAt) + 2_000;
  const longEvent = { ...collectPostMoveIdealLong1hCandidates(longFrame(101))[0], touchAt: longNow };
  const longPlan = buildPostMoveIdealLong1hOrder(longEvent, {
    now: longNow, enabledAt: longRoute.enabledAt, markPrice: 101, routeState: longRoute,
  });
  assert.equal(longPlan.side, 'BUY');
  assert.equal(longPlan.orderType, 'MARKET');
  assert.equal(longPlan.marginUsdt, 5);
  assert.equal(longPlan.leverage, 5);
  assert.equal(longPlan.notionalUsdt, 25);
  assert.equal(longPlan.takeProfitRoePct, 10);
  assert.equal(longPlan.stopLossRoePct, 20);
  assert.ok(longPlan.stopLossPrice < 101 && longPlan.takeProfitPrice > 101);
  assert.equal(buildPostMoveIdealLong1hOrder(longEvent, {
    now: longNow, enabledAt: longRoute.enabledAt, markPrice: 103, routeState: longRoute,
  }), null, 'fresh LONG mark outside the ideal zone must block entry');

  let longSubmitted = 0;
  const longRunner = new PostMoveIdealLong1hBinanceRunner({
    file: join(dir, 'long-state.json'), controls, now: () => longNow,
    getContext: async () => ({ enabled: true, markPrice: 101, positions: [], openOrders: [], credentials: {} }),
    submit: async (order) => {
      longSubmitted += 1;
      assert.equal(order.marginUsdt, 5);
      return { status: 'submitted', orderResult: { orderId: 456 } };
    },
  });
  assert.equal((await longRunner.processSnapshot(longFrame(103))).status, 'baseline');
  const longWarmingSnapshot = longFrame(103);
  longWarmingSnapshot.timeframes[1].items.push({
    symbol: 'LONGWARMUSDT', currentPrice: 101, dumpAt: 1_790_000_300_000,
    status: 'BUILDING', score: 80, idealEntry: { zoneLow: 100, zoneHigh: 102, midpoint: 101 },
  });
  await longRunner.processSnapshot(longWarmingSnapshot);
  assert.equal(longSubmitted, 0, 'LONG candidate first discovered inside the zone is baseline-only');
  const longTouched = await longRunner.processSnapshot(longFrame(101));
  assert.equal(longTouched.submitted, 1);
  assert.equal(longSubmitted, 1);
  await longRunner.processSnapshot(longFrame(101));
  assert.equal(longSubmitted, 1, 'same LONG setup must be durable-deduped');

  controls.seed([POST_MOVE_IDEAL_LONG_4H_ROUTE]);
  const long4hKey = entryRoute(POST_MOVE_IDEAL_LONG_4H_ROUTE).key;
  controls.update({ action: 'route', key: long4hKey, enabled: true });
  const long4hRoute = controls.read().routes[long4hKey];
  const long4hNow = Date.parse(long4hRoute.enabledAt) + 2_000;
  const long4hEvent = { ...collectPostMoveIdealLong4hCandidates(long4hFrame(101))[0], touchAt: long4hNow };
  const long4hPlan = buildPostMoveIdealLong4hOrder(long4hEvent, {
    now: long4hNow, enabledAt: long4hRoute.enabledAt, markPrice: 101, routeState: long4hRoute,
  });
  assert.equal(long4hPlan.side, 'BUY');
  assert.equal(long4hPlan.signalInterval, '4h');
  assert.equal(long4hPlan.orderType, 'MARKET');
  assert.equal(long4hPlan.marginUsdt, 10);
  assert.equal(long4hPlan.leverage, 5);
  assert.equal(long4hPlan.notionalUsdt, 50);
  assert.equal(long4hPlan.takeProfitRoePct, 10);
  assert.equal(long4hPlan.stopLossRoePct, 20);
  assert.ok(long4hPlan.stopLossPrice < 101 && long4hPlan.takeProfitPrice > 101);

  let long4hSubmitted = 0;
  const long4hRunner = new PostMoveIdealLong4hBinanceRunner({
    file: join(dir, 'long-4h-state.json'), controls, now: () => long4hNow,
    getContext: async () => ({ enabled: true, markPrice: 101, positions: [], openOrders: [], credentials: {} }),
    submit: async (order) => {
      long4hSubmitted += 1;
      assert.equal(order.marginUsdt, 10);
      assert.equal(order.signalInterval, '4h');
      return { status: 'submitted', orderResult: { orderId: 789 } };
    },
  });
  assert.equal((await long4hRunner.processSnapshot(long4hFrame(103))).status, 'baseline');
  const long4hTouched = await long4hRunner.processSnapshot(long4hFrame(101));
  assert.equal(long4hTouched.submitted, 1);
  assert.equal(long4hSubmitted, 1);
  await long4hRunner.processSnapshot(long4hFrame(101));
  assert.equal(long4hSubmitted, 1, 'same LONG 4h setup must be durable-deduped');

  controls.seed([POST_MOVE_IDEAL_SHORT_4H_ROUTE]);
  const short4hKey = entryRoute(POST_MOVE_IDEAL_SHORT_4H_ROUTE).key;
  controls.update({ action: 'route', key: short4hKey, enabled: true });
  const short4hRoute = controls.read().routes[short4hKey];
  const short4hNow = Date.parse(short4hRoute.enabledAt) + 2_000;
  const short4hEvent = { ...collectPostMoveIdealShort4hCandidates(short4hFrame(101))[0], touchAt: short4hNow };
  const short4hPlan = buildPostMoveIdealShort4hOrder(short4hEvent, {
    now: short4hNow, enabledAt: short4hRoute.enabledAt, markPrice: 101, routeState: short4hRoute,
  });
  assert.equal(short4hPlan.side, 'SELL');
  assert.equal(short4hPlan.signalInterval, '4h');
  assert.equal(short4hPlan.signalStageKey, 'SHORT_FIRST_STRONG_CANDLE');
  assert.equal(short4hPlan.marginUsdt, 10);
  assert.equal(short4hPlan.leverage, 5);
  assert.equal(short4hPlan.notionalUsdt, 50);
  assert.equal(short4hPlan.takeProfitRoePct, 6);
  assert.equal(short4hPlan.stopLossRoePct, 30);
  assert.ok(short4hPlan.takeProfitPrice < 101 && short4hPlan.stopLossPrice > 101);

  let short4hSubmitted = 0;
  const short4hRunner = new PostMoveIdealShort4hBinanceRunner({
    file: join(dir, 'short-4h-state.json'), controls, now: () => short4hNow,
    getContext: async () => ({ enabled: true, markPrice: 101, positions: [], openOrders: [], credentials: {} }),
    submit: async (order) => {
      short4hSubmitted += 1;
      assert.equal(order.marginUsdt, 10);
      assert.equal(order.signalInterval, '4h');
      return { status: 'submitted', orderResult: { orderId: 790 } };
    },
  });
  assert.equal((await short4hRunner.processSnapshot(short4hFrame(103))).status, 'baseline');
  const short4hTouched = await short4hRunner.processSnapshot(short4hFrame(101));
  assert.equal(short4hTouched.submitted, 1);
  assert.equal(short4hSubmitted, 1);
  await short4hRunner.processSnapshot(short4hFrame(101));
  assert.equal(short4hSubmitted, 1, 'same SHORT 4h setup must be durable-deduped');

  for (const config of [
    {
      side: 'LONG', route: POST_MOVE_PRIORITY_LONG_15M_ROUTE,
      stageKey: 'LONG_FRESH_REVERSAL', build: buildPostMovePriorityLong15mOrder,
      collect: collectPostMovePriorityLong15mCandidates,
      Runner: PostMovePriorityLong15mBinanceRunner, expectedSide: 'BUY', expectedTp: 10, expectedSl: 20,
    },
    {
      side: 'SHORT', route: POST_MOVE_PRIORITY_SHORT_15M_ROUTE,
      stageKey: 'SHORT_NEAR_TOP', build: buildPostMovePriorityShort15mOrder,
      collect: collectPostMovePriorityShort15mCandidates,
      Runner: PostMovePriorityShort15mBinanceRunner, expectedSide: 'SELL', expectedTp: 6, expectedSl: 30,
    },
  ]) {
    controls.seed([config.route]);
    const routeKey = entryRoute(config.route).key;
    controls.update({ action: 'route', key: routeKey, enabled: true });
    const routeState = controls.read().routes[routeKey];
    const priorityNow = Date.parse(routeState.enabledAt) + 2_000;
    const snapshot = priorityFrame(config.side, config.stageKey);
    const event = { ...config.collect(snapshot)[0], signalAt: priorityNow };
    const plan = config.build(event, {
      now: priorityNow, enabledAt: routeState.enabledAt, markPrice: 100, routeState,
    });
    assert.equal(plan.side, config.expectedSide);
    assert.equal(plan.orderType, 'MARKET');
    assert.equal(plan.marginUsdt, 2);
    assert.equal(plan.leverage, 5);
    assert.equal(plan.notionalUsdt, 10);
    assert.equal(plan.takeProfitRoePct, config.expectedTp);
    assert.equal(plan.stopLossRoePct, config.expectedSl);
    assert.equal(plan.maxOpenPositions, POST_MOVE_PRIORITY_15M_MAX_OPEN_POSITIONS);
    assert.equal(config.build(event, {
      now: priorityNow, enabledAt: routeState.enabledAt, markPrice: 101, routeState,
    }), null, 'mark drift over 0.5% must block priority-stage entry');

    let submittedPriority = 0;
    let capped = false;
    const runner = new config.Runner({
      file: join(dir, `${config.side.toLowerCase()}-priority-state.json`),
      controls,
      now: () => priorityNow,
      getContext: async () => ({
        enabled: true, markPrice: 100, openOrders: [], credentials: {},
        positions: capped
          ? Array.from({ length: 15 }, (_, index) => ({ symbol: `OPEN${index}USDT`, positionAmt: 1 }))
          : [],
      }),
      submit: async (order) => {
        submittedPriority += 1;
        assert.equal(order.marginUsdt, 2);
        assert.equal(order.maxOpenPositions, 15);
        return { status: 'submitted', orderResult: { orderId: 900 + submittedPriority } };
      },
    });
    assert.equal((await runner.processSnapshot(emptyPriorityFrame)).status, 'baseline');
    const first = await runner.processSnapshot(snapshot);
    assert.equal(first.submitted, 1);
    assert.equal(submittedPriority, 1);
    await runner.processSnapshot(snapshot);
    assert.equal(submittedPriority, 1, 'same priority setup must be durable-deduped');

    capped = true;
    await runner.processSnapshot(emptyPriorityFrame);
    const cappedSnapshot = priorityFrame(config.side, config.stageKey, {
      symbol: config.side === 'LONG' ? 'CAPPEDLONGUSDT' : 'CAPPEDSHORTUSDT',
      anchorAt: 1_790_000_900_000,
    });
    const cappedResult = await runner.processSnapshot(cappedSnapshot);
    assert.equal(cappedResult.results[0].status, 'max-open-positions');
    assert.equal(submittedPriority, 1, '15 open positions must block the MARKET submit');
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log('post-move ideal/priority 15m Binance tests passed');
