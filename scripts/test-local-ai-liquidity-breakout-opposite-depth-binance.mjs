import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoEntryControls, entryRoute } from '../src/autoEntryControls.js';
import {
  LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_BINANCE_VERSION,
  LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_ROUTES,
  LocalAiLiquidityBreakoutOppositeDepthBinanceRunner,
  buildLocalAiLiquidityBreakoutOppositeDepthMarketOrder,
} from '../src/localAiLiquidityBreakoutOppositeDepthBinance.js';
import {
  authorizeLocalAiLiquidityBreakoutOppositeDepthOrder,
  evaluateAutoBinanceEntryPolicy,
} from '../src/autoBinancePolicy.js';

const dir = await mkdtemp(join(tmpdir(), 'local-ai-liq-depth-binance-'));
try {
  const controls = new AutoEntryControls(join(dir, 'controls.json'));
  controls.seed(LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_ROUTES);
  let state = controls.read();
  assert.equal(state.enabled, false);
  for (const route of LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_ROUTES) {
    const row = state.routes[entryRoute(route).key];
    assert.equal(row.enabled, false, 'new live route must default OFF');
    assert.equal(row.marginUsdt, 4);
    assert.equal(row.leverage, 5);
    assert.equal(row.takeProfitRoePct, 10);
  }
  controls.update({ action: 'master', enabled: true });
  for (const route of LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_ROUTES) {
    controls.update({ action: 'route', key: entryRoute(route).key, enabled: true });
  }
  state = controls.read();
  const enabledAt = Date.parse(state.routes[entryRoute(LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_ROUTES[0]).key].enabledAt);
  let now = enabledAt + 10_000;
  const event = {
    eventId: 'TESTUSDT|ABOVE|BREAKOUT_OPPOSITE_DEPTH|1|2',
    symbol: 'TESTUSDT', side: 'LONG', direction: 'ABOVE', interval: '5m',
    latestClosedAt: now - 1_000, breachClose: 1.01, latestClose: 1.02,
    zone: { low: 0.98, high: 1 },
    depth: { oppositeRatio: 1.5, bidNotional: 1_500_000, askNotional: 1_000_000 },
  };
  const longRouteState = state.routes[entryRoute(LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_ROUTES[0]).key];
  const order = buildLocalAiLiquidityBreakoutOppositeDepthMarketOrder(event, {
    now, startedAt: enabledAt - 1_000,
    enabledAt: Date.parse(longRouteState.enabledAt), markPrice: 1.02, routeState: longRouteState,
  });
  assert(order);
  assert.equal(order.side, 'BUY');
  assert.equal(order.marginUsdt, 4);
  assert.equal(order.leverage, 5);
  assert.equal(order.notionalUsdt, 20);
  assert.equal(order.takeProfitRoePct, 10);
  assert.equal(order.stopLossRoePct, 20);
  assert.equal(order.takeProfitPrice, 1.02 * 1.02);
  assert.equal(order.stopLossPrice, 1.02 * 0.96);
  assert.equal(order.fillAnchorVersion, LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_BINANCE_VERSION);
  const policyContext = { orderEnabled: true, env: { AUTO_BINANCE_LIVE_CARD_ONLY: 'true' } };
  assert.equal(evaluateAutoBinanceEntryPolicy({ ...policyContext,
    payload: authorizeLocalAiLiquidityBreakoutOppositeDepthOrder(order) }).allowed, true);
  assert.equal(evaluateAutoBinanceEntryPolicy({ ...policyContext,
    payload: authorizeLocalAiLiquidityBreakoutOppositeDepthOrder({
      ...order, marginUsdt: 5, notionalUsdt: 25,
    }) }).allowed, false, 'policy rejects a changed size');

  const submissions = [];
  const runner = new LocalAiLiquidityBreakoutOppositeDepthBinanceRunner({
    file: join(dir, 'runner.json'), controls, now: () => now, startedAt: enabledAt - 1_000,
    getContext: async () => ({ enabled: true, credentials: {}, positions: [], openOrders: [], markPrice: 1.02 }),
    submit: async (plan) => {
      submissions.push(plan);
      return { status: 'submitted', orderResult: { orderId: 456 } };
    },
  });
  const result = await runner.process(event);
  assert.equal(result.status, 'submitted');
  assert.equal(result.orderId, 456);
  assert.equal(submissions.length, 1);
  assert.equal((await runner.process(event)).status, 'deduped');
  assert.equal(submissions.length, 1);
  const management = await runner.managementSnapshot();
  assert.equal(management.masterEnabled, true);
  assert.equal(management.routes.length, 2);
  assert(management.routes.every((route) => route.enabled === true));
  assert.equal(management.attempts.length, 1);
  assert.equal(management.submittedAttempts, 1);
  assert.equal(management.errorAttempts, 0);
  assert.equal(management.attempts[0].orderId, 456);

  const shortRouteState = state.routes[entryRoute(LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_ROUTES[1]).key];
  const shortEvent = { ...event, eventId: 'TEST2USDT|BELOW|15m|BREAKOUT_OPPOSITE_DEPTH|1|2',
    symbol: 'TEST2USDT', side: 'SHORT', direction: 'BELOW', interval: '15m' };
  const shortOrder = buildLocalAiLiquidityBreakoutOppositeDepthMarketOrder(shortEvent, {
    now, startedAt: enabledAt - 1_000,
    enabledAt: Date.parse(shortRouteState.enabledAt), markPrice: 1.02, routeState: shortRouteState,
  });
  assert(shortOrder);
  assert.equal(shortOrder.side, 'SELL');
  assert(shortOrder.takeProfitPrice < shortOrder.signalEntryPrice);
  assert(shortOrder.stopLossPrice > shortOrder.signalEntryPrice);
  assert.equal(buildLocalAiLiquidityBreakoutOppositeDepthMarketOrder({
    ...event, side: 'SHORT', direction: 'ABOVE',
  }, {
    now, startedAt: enabledAt - 1_000,
    enabledAt: Date.parse(shortRouteState.enabledAt), markPrice: 1.02, routeState: shortRouteState,
  }), null, 'upper breakout must never be routed to SHORT');

  now += 3 * 60_000;
  assert.equal(buildLocalAiLiquidityBreakoutOppositeDepthMarketOrder(event, {
    now, startedAt: enabledAt - 1_000,
    enabledAt: Date.parse(longRouteState.enabledAt), markPrice: 1.02, routeState: longRouteState,
  }), null, 'stale closed-candle event must not enter');
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log('local AI liquidity breakout + opposite depth Binance tests: OK');
