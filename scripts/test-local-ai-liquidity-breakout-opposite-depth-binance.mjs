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
    symbol: 'TESTUSDT', side: 'SHORT', direction: 'ABOVE', interval: '5m',
    latestClosedAt: now - 1_000, breachClose: 1.01, latestClose: 1.02,
    zone: { low: 0.98, high: 1 },
    depth: { oppositeRatio: 1.5, bidNotional: 1_500_000, askNotional: 1_000_000 },
  };
  const shortRouteState = state.routes[entryRoute(LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_ROUTES[1]).key];
  const order = buildLocalAiLiquidityBreakoutOppositeDepthMarketOrder(event, {
    now, startedAt: enabledAt - 1_000,
    enabledAt: Date.parse(shortRouteState.enabledAt), markPrice: 1.02, routeState: shortRouteState,
  });
  assert(order);
  assert.equal(order.side, 'SELL');
  assert.equal(order.marginUsdt, 4);
  assert.equal(order.leverage, 5);
  assert.equal(order.notionalUsdt, 20);
  assert.equal(order.takeProfitRoePct, 10);
  assert.equal(order.stopLossRoePct, 20);
  assert.equal(order.takeProfitPrice, 1.02 * 0.98);
  assert.equal(order.stopLossPrice, 1.02 * 1.04);
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

  const longRouteState = state.routes[entryRoute(LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_ROUTES[0]).key];
  const longEvent = { ...event, eventId: 'TEST2USDT|BELOW|15m|BREAKOUT_OPPOSITE_DEPTH|1|2',
    symbol: 'TEST2USDT', side: 'LONG', direction: 'BELOW', interval: '15m' };
  const longOrder = buildLocalAiLiquidityBreakoutOppositeDepthMarketOrder(longEvent, {
    now, startedAt: enabledAt - 1_000,
    enabledAt: Date.parse(longRouteState.enabledAt), markPrice: 1.02, routeState: longRouteState,
  });
  assert(longOrder);
  assert.equal(longOrder.side, 'BUY');
  assert(longOrder.takeProfitPrice > longOrder.signalEntryPrice);
  assert(longOrder.stopLossPrice < longOrder.signalEntryPrice);

  now += 3 * 60_000;
  assert.equal(buildLocalAiLiquidityBreakoutOppositeDepthMarketOrder(event, {
    now, startedAt: enabledAt - 1_000,
    enabledAt: Date.parse(shortRouteState.enabledAt), markPrice: 1.02, routeState: shortRouteState,
  }), null, 'stale closed-candle event must not enter');
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log('local AI liquidity breakout + opposite depth Binance tests: OK');
