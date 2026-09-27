#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoEntryControls, entryRoute } from '../src/autoEntryControls.js';
import { COIN_LEVEL_ENTRY_WATCH_VERSION } from '../src/coinLevelEntryWatch.js';
import {
  COIN_LEVEL_ENTRY_WATCH_BINANCE_VERSION,
  COIN_LEVEL_ENTRY_WATCH_ROUTES,
  COIN_LEVEL_ENTRY_WATCH_LIMIT_MARGIN_USDT,
  CoinLevelEntryWatchBinanceRunner,
  buildCoinLevelEntryWatchLimitOrder,
  buildCoinLevelEntryWatchOrder,
  coinLevelEntryWatchRoute,
} from '../src/coinLevelEntryWatchBinance.js';

assert.match(COIN_LEVEL_ENTRY_WATCH_BINANCE_VERSION, /LIMIT_3USDT_V4_MARKET_REGIME_20260922$/);
assert.equal(COIN_LEVEL_ENTRY_WATCH_LIMIT_MARGIN_USDT, 3);
assert.equal(COIN_LEVEL_ENTRY_WATCH_ROUTES.length, 2);

const now = Date.now();
const candidate = ({ side = 'LONG', symbol = 'TESTUSDT', retestAt = now - 10_000 } = {}) => ({
  version: COIN_LEVEL_ENTRY_WATCH_VERSION,
  symbol,
  side,
  score: side === 'LONG' ? 18 : -18,
  referenceLevel: side === 'LONG' ? 100 : 101,
  signalClose: side === 'LONG' ? 101 : 100,
  confirmationAt: retestAt - 5 * 60_000,
  retestAt,
  entryPrice: side === 'LONG' ? 100.075 : 100.92425,
  entryZone: side === 'LONG'
    ? { low: 100, high: 100.15 }
    : { low: 100.8485, high: 101 },
  entryBasis: 'RETEST_LEVEL_0_15_PCT',
  lastClosed5m: side === 'LONG' ? 100.2 : 100.8,
  lastClosed5mAt: retestAt,
  observeOnly: true,
});

assert.equal(coinLevelEntryWatchRoute(candidate()).side, 'LONG');
assert.equal(coinLevelEntryWatchRoute(candidate({ side: 'SHORT' })).side, 'SHORT');
assert.equal(coinLevelEntryWatchRoute({ ...candidate(), entryScore: 0, entryTier: 'WEAK' }).side, 'LONG',
  'Entry Score is display/audit metadata and must not silently become a Binance gate.');
assert.equal(coinLevelEntryWatchRoute({ ...candidate(), retestAt: null }), null,
  'Waiting rows cannot place Binance orders.');

const settings = { marginUsdt: 1, leverage: 5, takeProfitRoePct: 10 };
const long = candidate();
const longPlan = buildCoinLevelEntryWatchOrder(long, {
  now, enabledAt: long.retestAt - 1, markPrice: long.entryPrice, routeState: settings,
});
assert.equal(longPlan.side, 'BUY');
assert.equal(longPlan.marginUsdt, 1);
assert.equal(longPlan.leverage, 5);
assert.equal(longPlan.notionalUsdt, 5);
assert.equal(longPlan.takeProfitRoePct, 10);
assert.equal(longPlan.stopLossRoePct, 30);
assert.equal(longPlan.takeProfitPrice, long.entryPrice * 1.02);
assert.equal(longPlan.stopLossPrice, long.entryPrice * 0.94);
assert.equal(longPlan.allowMinNotionalCeil, true);

const short = candidate({ side: 'SHORT' });
const shortPlan = buildCoinLevelEntryWatchOrder(short, {
  now, enabledAt: short.retestAt - 1, markPrice: short.entryPrice, routeState: settings,
});
assert.equal(shortPlan.side, 'SELL');
assert.equal(shortPlan.takeProfitPrice, short.entryPrice * 0.98);
assert.equal(shortPlan.stopLossPrice, short.entryPrice * 1.06);
assert.equal(buildCoinLevelEntryWatchOrder(long, {
  now, enabledAt: long.retestAt + 1, markPrice: long.entryPrice, routeState: settings,
}), null, 'Retests from before route enabledAt cannot replay.');
assert.equal(buildCoinLevelEntryWatchOrder(long, {
  now: long.retestAt + 91_000, enabledAt: long.retestAt - 1,
  markPrice: long.entryPrice, routeState: settings,
}), null, 'Retest older than 90 seconds is stale.');
assert.equal(buildCoinLevelEntryWatchOrder(long, {
  now, enabledAt: long.retestAt - 1, markPrice: long.entryPrice * 1.006,
  routeState: settings,
}), null, 'Mark drift above 0.5% is blocked.');

const directory = await mkdtemp(join(tmpdir(), 'coin-level-entry-binance-'));
try {
  const controls = new AutoEntryControls(join(directory, 'controls.json'));
  controls.seed(COIN_LEVEL_ENTRY_WATCH_ROUTES);
  controls.update({ action: 'master', enabled: true });
  const longRoute = COIN_LEVEL_ENTRY_WATCH_ROUTES.find((route) => route.side === 'LONG');
  const shortRoute = COIN_LEVEL_ENTRY_WATCH_ROUTES.find((route) => route.side === 'SHORT');
  controls.update({ action: 'route', key: entryRoute(longRoute).key, enabled: true });
  controls.update({ action: 'route', key: entryRoute(shortRoute).key, enabled: true });
  const routeEnabledAt = Date.parse(controls.read().routes[entryRoute(longRoute).key].enabledAt);
  let clock = routeEnabledAt + 20_000;
  const live = candidate({ retestAt: routeEnabledAt + 10_000 });
  let submissions = 0;
  const runner = new CoinLevelEntryWatchBinanceRunner({
    file: join(directory, 'attempts.json'), controls, now: () => clock,
    getContext: async () => ({ enabled: true, positions: [], openOrders: [], markPrice: live.entryPrice }),
    submit: async (plan) => {
      submissions += 1;
      assert.equal(plan.side, 'BUY');
      return { status: 'SUBMITTED', orderResult: { orderId: 771 } };
    },
  });
  assert.equal((await runner.handle(live)).status, 'SUBMITTED');
  assert.equal(submissions, 1);
  assert.equal((await runner.handle(live)).status, 'deduped');
  assert.equal(submissions, 1);

  const waiting = candidate({ symbol: 'WAITUSDT', retestAt: 0 });
  assert.equal((await runner.handle(waiting)).status, 'ineligible', 'old pre-retest alerts do not replay');
  const limitCandidate = {
    ...candidate({ symbol: 'LIMITUSDT', retestAt: null }),
    confirmationAt: routeEnabledAt + 10_000,
    lastClosed5mAt: routeEnabledAt + 15_000,
    lastClosed5m: 100.6,
  };
  const limitPlan = buildCoinLevelEntryWatchLimitOrder(limitCandidate, {
    now: clock, enabledAt: routeEnabledAt, startedAt: routeEnabledAt + 5_000,
    markPrice: 100.6, routeState: settings,
  });
  assert.equal(limitPlan.orderType, 'LIMIT');
  assert.equal(limitPlan.limitPrice, limitCandidate.entryPrice);
  assert.equal(limitPlan.marginUsdt, 3);
  assert.equal(limitPlan.notionalUsdt, 15);
  assert.equal(limitPlan.takeProfitPrice, limitCandidate.entryPrice * 1.02);
  assert.equal(limitPlan.stopLossPrice, limitCandidate.entryPrice * 0.94);
  assert.match(limitPlan.clientOrderId, /^clel_/);
  assert.equal(buildCoinLevelEntryWatchLimitOrder(limitCandidate, {
    now: clock, enabledAt: routeEnabledAt, startedAt: routeEnabledAt + 11_000,
    markPrice: 100.6, routeState: settings,
  }), null, 'pre-start signal cannot replay');
  assert.equal(buildCoinLevelEntryWatchLimitOrder(limitCandidate, {
    now: clock, enabledAt: routeEnabledAt, startedAt: routeEnabledAt + 5_000,
    markPrice: 100.01, routeState: settings,
  }), null, 'marketable LONG is blocked');
  assert.equal(buildCoinLevelEntryWatchLimitOrder(limitCandidate, {
    now: clock, enabledAt: routeEnabledAt, startedAt: routeEnabledAt + 5_000,
    markPrice: 106, routeState: settings,
  }), null, 'price more than 5% away is blocked');
  const limitRunner = new CoinLevelEntryWatchBinanceRunner({
    file: join(directory, 'limit-attempts.json'), controls, now: () => clock,
    limitStartedAt: routeEnabledAt + 5_000,
    getContext: async () => ({ enabled: true, positions: [], openOrders: [], markPrice: 100.6 }),
    submit: async (plan) => {
      assert.equal(plan.orderType, 'LIMIT');
      assert.equal(plan.marginUsdt, 3);
      return { status: 'SUBMITTED', orderResult: { orderId: 772 } };
    },
  });
  assert.equal((await limitRunner.handle(limitCandidate)).status, 'SUBMITTED');
  assert.equal((await limitRunner.handle(limitCandidate)).status, 'deduped');
  const pendingOrder = {
    symbol: limitCandidate.symbol, side: 'BUY', type: 'LIMIT',
    orderId: 772, clientOrderId: limitPlan.clientOrderId,
  };
  assert.deepEqual(limitRunner.pendingLimitSignal(pendingOrder), {
    symbol: 'LIMITUSDT', side: 'LONG',
    confirmationAt: limitCandidate.confirmationAt,
    referenceLevel: limitCandidate.referenceLevel,
    submittedAt: clock,
  });
  assert.equal(limitRunner.pendingLimitSignal({ ...pendingOrder, orderId: 773 }), null);
  assert.equal(limitRunner.pendingLimitSignal({ ...pendingOrder, clientOrderId: 'clel_legacy' }), null);
  assert.equal(limitRunner.markLimitInvalidated(pendingOrder.clientOrderId, 'CLOSED_5M_INVALIDATED_LEVEL'), true);
  const cancelledState = JSON.parse(await readFile(join(directory, 'limit-attempts.json'), 'utf8'));
  assert.equal(cancelledState.attempts[pendingOrder.clientOrderId].status, 'CANCELLED_SIGNAL_INVALID');
  assert.equal(cancelledState.attempts[pendingOrder.clientOrderId].cancelReason, 'CLOSED_5M_INVALIDATED_LEVEL');
  const shortLimit = {
    ...candidate({ side: 'SHORT', symbol: 'SHORTLIMITUSDT', retestAt: null }),
    confirmationAt: routeEnabledAt + 10_000,
    lastClosed5mAt: routeEnabledAt + 15_000,
    lastClosed5m: 100.5,
  };
  const shortLimitPlan = buildCoinLevelEntryWatchLimitOrder(shortLimit, {
    now: clock, enabledAt: routeEnabledAt, startedAt: routeEnabledAt + 5_000,
    markPrice: 100.5, routeState: settings,
  });
  assert.equal(shortLimitPlan.side, 'SELL');
  assert.equal(shortLimitPlan.limitPrice, shortLimit.entryPrice);
  assert.equal(shortLimitPlan.takeProfitPrice, shortLimit.entryPrice * 0.98);
  assert.equal(shortLimitPlan.stopLossPrice, shortLimit.entryPrice * 1.06);
  const occupied = new CoinLevelEntryWatchBinanceRunner({
    file: join(directory, 'occupied.json'), controls, now: () => clock,
    getContext: async () => ({ enabled: true,
      positions: [{ symbol: 'BUSYUSDT', positionAmt: '2' }], openOrders: [], markPrice: live.entryPrice }),
    submit: async () => { throw new Error('must not submit'); },
  });
  assert.equal((await occupied.handle({ ...live, symbol: 'BUSYUSDT' })).status, 'existing-position');

  let blockedContextCalls = 0;
  const riskOffRunner = new CoinLevelEntryWatchBinanceRunner({
    file: join(directory, 'risk-off.json'), controls, now: () => clock,
    getMarketRegime: () => ({
      version: 'TEST_REGIME', state: 'RISK_OFF', allowLongEntry: false,
      evaluatedAt: clock, reasons: ['test dump'],
    }),
    getContext: async () => { blockedContextCalls += 1; return { enabled: true }; },
    submit: async () => { throw new Error('must not submit'); },
  });
  const blockedLong = await riskOffRunner.handle({ ...live, symbol: 'BLOCKEDLONGUSDT' });
  assert.equal(blockedLong.status, 'market-regime-blocked');
  assert.equal(blockedLong.marketRegime, 'RISK_OFF');
  assert.equal(blockedContextCalls, 0, 'RISK-OFF LONG must stop before signed Binance context');

  let shortSubmitted = 0;
  const shortDuringRiskOff = new CoinLevelEntryWatchBinanceRunner({
    file: join(directory, 'short-risk-off.json'), controls, now: () => clock,
    getMarketRegime: () => ({ state: 'RISK_OFF', allowLongEntry: false }),
    getContext: async () => ({ enabled: true, positions: [], openOrders: [], markPrice: short.entryPrice }),
    submit: async () => {
      shortSubmitted += 1;
      return { status: 'SUBMITTED', orderResult: { orderId: 990 } };
    },
  });
  const shortResult = await shortDuringRiskOff.handle({
    ...short,
    symbol: 'SHORTUNCHANGEDUSDT',
    confirmationAt: routeEnabledAt + 5_000,
    retestAt: routeEnabledAt + 10_000,
    lastClosed5mAt: routeEnabledAt + 10_000,
  });
  assert.equal(shortResult.status, 'SUBMITTED');
  assert.equal(shortSubmitted, 1, 'SHORT route remains unchanged by LONG-only market guard');
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('Coin Level entry Binance PASS: fresh pre-retest LIMIT $3 and closed-retest MARKET $1, TP10/SL30, controls, gap, no replay/DCA, durable dedupe.');
