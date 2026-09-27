import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AutoEntryControls, entryRoute } from '../src/autoEntryControls.js';
import {
  LIMIT_PAPER_FILL_ROUTES,
  LimitPaperFillBinanceRunner,
  buildLimitPaperFillOrder,
} from '../src/limitPaperFillBinance.js';

const directory = await mkdtemp(join(tmpdir(), 'limit-paper-fill-binance-'));
try {
  const controls = new AutoEntryControls(join(directory, 'controls.json'));
  controls.seed(LIMIT_PAPER_FILL_ROUTES);
  controls.update({ action: 'master', enabled: true });
  const route = LIMIT_PAPER_FILL_ROUTES[0];
  const key = entryRoute(route).key;
  controls.update({ action: 'route', key, enabled: true });
  const routeState = controls.read().routes[key];
  const activatedAt = Date.parse(routeState.enabledAt);
  let now = activatedAt + 2_000;
  const event = {
    record: {
      id: 'paper-1', createdAt: activatedAt + 500,
      source: 'ema99-observe-only', streamId: 'ema99-retest',
      label: route.signalLabel, symbol: 'TESTUSDT', side: 'LONG', interval: '15m',
    },
    candidate: {
      key: 'SHALLOW', status: 'OPEN', filledAt: activatedAt + 1_000, fillPrice: 99.65,
    },
    markPrice: 99.7,
  };
  const plan = buildLimitPaperFillOrder(event, {
    now, enabledAt: routeState.enabledAt, markPrice: event.markPrice, routeState,
  });
  assert.ok(plan);
  assert.deepEqual(
    [plan.orderType, plan.marginUsdt, plan.notionalUsdt, plan.leverage,
      plan.takeProfitRoePct, plan.stopLossRoePct],
    ['MARKET', 1, 5, 5, 10, 20],
  );
  assert.equal(buildLimitPaperFillOrder({ ...event,
    candidate: { ...event.candidate, key: 'BALANCED' } }, {
    now, enabledAt: routeState.enabledAt, markPrice: event.markPrice, routeState,
  }), null);
  assert.equal(buildLimitPaperFillOrder({ ...event,
    record: { ...event.record, createdAt: activatedAt - 1 } }, {
    now, enabledAt: routeState.enabledAt, markPrice: event.markPrice, routeState,
  }), null, 'old paper signals never replay');
  assert.equal(buildLimitPaperFillOrder({ ...event,
    record: { ...event.record, symbol: 'USDT' } }, {
    now, enabledAt: routeState.enabledAt, markPrice: event.markPrice, routeState,
  }), null, 'bare USDT is rejected');

  let regime = { state: 'RISK_ON', allowLongEntry: true, version: 'TEST' };
  const submitted = [];
  const runner = new LimitPaperFillBinanceRunner({
    file: join(directory, 'runner.json'), controls, now: () => now,
    getMarketRegime: () => regime,
    getContext: async () => ({ enabled: true, positions: [], openOrders: [], markPrice: 99.7 }),
    submit: async (order) => {
      submitted.push(order);
      return { status: 'submitted', orderResult: { orderId: 42 } };
    },
  });
  const result = await runner.handle(event);
  assert.equal(result.status, 'submitted');
  assert.equal(result.orderId, 42);
  assert.equal(submitted.length, 1);
  assert.equal((await runner.handle(event)).status, 'deduped');
  assert.equal(submitted.length, 1);

  regime = { state: 'RISK_OFF', allowLongEntry: false };
  const blockedEvent = {
    ...event,
    record: { ...event.record, id: 'paper-2', symbol: 'OTHERUSDT', createdAt: now },
    candidate: { ...event.candidate, filledAt: now },
  };
  assert.equal((await runner.handle(blockedEvent)).status, 'market-regime-blocked');
  assert.equal(submitted.length, 1);
  console.log('test-limit-paper-fill-binance: ok');
} finally {
  await rm(directory, { recursive: true, force: true });
}
