import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoEntryControls, entryRoute } from '../src/autoEntryControls.js';
import {
  BTC_RELATIVE_STRENGTH_BINANCE_VERSION,
  BTC_RELATIVE_STRENGTH_ROUTES,
  BtcRelativeStrengthBinanceRunner,
  buildBtcRelativeStrengthMarketOrder,
} from '../src/btcRelativeStrengthBinance.js';

const now = Date.UTC(2026, 8, 28, 15, 0, 30);
const row = (overrides = {}) => ({
  symbol:'ONDOUSDT', side:'LONG', active:true,
  confirmationAt:now - 60 * 60_000,
  lastClosed5mAt:now - 30_000,
  evaluatedAt:now - 5_000,
  poolExpiresAt:now + 23 * 60 * 60_000,
  currentTrendScore:24,
  currentFrames:{ '5m':'UP', '15m':'UP', '1h':'UP', '4h':'UP' },
  recentMovePct15m:.55, recentMovePct1h:1.1,
  livePrice:.567, entryZone:{ low:.5648, high:.5682, mid:.5665 },
  coinTrigger:true, relativeScore:82,
  relative:{ key:'RELATIVE_ENTRY_READY', contextActive:true, nearEntry:true, inZone:true },
  ...overrides,
});
const routeState = { marginUsdt:2, leverage:5, takeProfitRoePct:10 };
const btcDown = {
  key:'DOWN_STRONG', relativeReturnClosedAt:now - 30_000,
  relativeReturn15mPct:-.3, relativeReturn1hPct:-.8,
};
const plan = buildBtcRelativeStrengthMarketOrder(row(), {
  now, enabledAt:now - 60_000, startedAt:now - 60_000,
  markPrice:.5671, routeState, btc:btcDown,
});
assert.equal(plan.marginUsdt, 2);
assert.equal(plan.leverage, 5);
assert.equal(plan.notionalUsdt, 10);
assert.equal(plan.takeProfitRoePct, 10);
assert.equal(plan.stopLossRoePct, null);
assert.equal(plan.stopLossPrice, null);
assert.equal(plan.stopLossDistanceFraction, null);
assert.equal(plan.protectionSignalStopLossPrice, null);
assert.ok(plan.takeProfitPrice > plan.signalEntryPrice, 'LONG keeps its full-fill-anchored TP');
assert.equal(plan.maxOpenPositions, 50);
assert.equal(plan.signalLabel, 'RELATIVE_ENTRY_READY');
assert.equal(plan.orderType, 'MARKET');
assert.match(plan.clientOrderId, /^brs_l_[0-9a-f]{22}$/);
assert.equal(buildBtcRelativeStrengthMarketOrder(row({
  relative:{ key:'WAIT_5M_CONFIRM', contextActive:true, nearEntry:true },
}), { now, enabledAt:now - 60_000, startedAt:now - 60_000,
  markPrice:.5671, routeState }), null, 'near-zone Discord stage never enters Binance');
assert.equal(buildBtcRelativeStrengthMarketOrder(row({
  livePrice:.571,
  relative:{ key:'RELATIVE_ENTRY_READY', contextActive:true, nearEntry:true, inZone:false },
}), {
  now, enabledAt:now - 60_000, startedAt:now - 60_000,
  markPrice:.571, routeState, btc:btcDown,
}), null, 'READY must fail closed outside the actual entry zone');
assert.equal(buildBtcRelativeStrengthMarketOrder(row({ lastClosed5mAt:now - 91_000 }), {
  now, enabledAt:now - 120_000, startedAt:now - 120_000,
  markPrice:.5671, routeState,
}), null, 'stale 5m confirmation cannot replay');
assert.equal(buildBtcRelativeStrengthMarketOrder(row(), {
  now, enabledAt:now - 60_000, startedAt:now - 60_000,
  markPrice:.58, routeState,
}), null, 'mark drift or distance from zone blocks submit');
assert.equal(buildBtcRelativeStrengthMarketOrder(row(), {
  now, enabledAt:now - 60_000, startedAt:now - 60_000,
  markPrice:.569, routeState, btc:btcDown,
}), null, 'latest MARK must still be inside the actual entry zone');

const pullbackShortRow = row({
  symbol:'PULLBACKUSDT', side:'SHORT', currentTrendScore:-24,
  currentFrames:{ '5m':'DOWN', '15m':'DOWN', '1h':'DOWN', '4h':'DOWN' },
  last5mMovePct:-.32, currentVolumeRatio5m:1.3, currentVolumeRatio15m:.9,
  lastTakerBuyPct:38,
  relative:{ key:'RELATIVE_ENTRY_READY', contextActive:true, nearEntry:true, inZone:true,
    contextMode:'BTC_DOWNTREND_PULLBACK_SHORT' },
});
const pullbackBtc = {
  key:'DOWN_STRONG', pullback5m:{ active:true, closedAt:now - 30_000, movePct:.18, priorMovePct:-.4 },
};
const pullbackShortPlan = buildBtcRelativeStrengthMarketOrder(pullbackShortRow, {
  now, enabledAt:now - 60_000, startedAt:now - 60_000,
  markPrice:.5671, routeState, btc:pullbackBtc,
});
assert.equal(pullbackShortPlan.side, 'SELL');
assert.match(pullbackShortPlan.signalReason, /btcContextMode=BTC_DOWNTREND_PULLBACK_SHORT/);
assert.ok(pullbackShortPlan.takeProfitPrice < pullbackShortPlan.signalEntryPrice);
assert.equal(buildBtcRelativeStrengthMarketOrder({
  ...pullbackShortRow, currentVolumeRatio5m:.8,
}, {
  now, enabledAt:now - 60_000, startedAt:now - 60_000,
  markPrice:.5671, routeState, btc:pullbackBtc,
}), null, 'BTC downtrend pullback SHORT requires strong current sell volume');

const directory = await mkdtemp(join(tmpdir(), 'btc-relative-binance-'));
try {
  const controls = new AutoEntryControls(join(directory, 'controls.json'));
  controls.seed(BTC_RELATIVE_STRENGTH_ROUTES);
  controls.update({ action:'master', enabled:true });
  const longRoute = BTC_RELATIVE_STRENGTH_ROUTES.find((route) => route.side === 'LONG');
  const longKey = entryRoute(longRoute).key;
  controls.update({ action:'route', key:longKey, enabled:true });
  const enabledAt = Date.parse(controls.read().routes[longKey].enabledAt);
  const tickNow = enabledAt + 40_000;
  const freshRow = row({
    confirmationAt:enabledAt + 1_000,
    lastClosed5mAt:enabledAt + 10_000,
    evaluatedAt:tickNow - 1_000,
    poolExpiresAt:tickNow + 60 * 60_000,
  });
  const submissions = [];
  const runner = new BtcRelativeStrengthBinanceRunner({
    file:join(directory, 'runner.json'), controls, startedAt:enabledAt,
    now:() => tickNow,
    getContext:async () => ({ enabled:true, positions:[], openOrders:[], markPrice:.5671 }),
    submit:async (order) => {
      submissions.push(order);
      return { status:'submitted', orderResult:{ orderId:123 } };
    },
  });
  const runnerBtc = {
    key:'DOWN_STRONG', relativeReturnClosedAt:freshRow.lastClosed5mAt,
    relativeReturn15mPct:-.3, relativeReturn1hPct:-.8,
  };
  const first = await runner.process({ rows:[freshRow], btc:runnerBtc });
  assert.equal(first.submitted, 1);
  assert.equal(submissions.length, 1);
  const duplicate = await runner.process({ rows:[freshRow], btc:runnerBtc });
  assert.equal(duplicate.submitted, 0);
  assert.equal(duplicate.results[0].status, 'deduped');
  assert.equal(submissions.length, 1, 'same closed 5m pass submits at most once');
  const retriggerRow = { ...freshRow, lastClosed5mAt:enabledAt + 15_000 };
  const retrigger = await runner.process({ rows:[retriggerRow], btc:{
    ...runnerBtc, relativeReturnClosedAt:retriggerRow.lastClosed5mAt,
  } });
  assert.equal(retrigger.results[0].status, 'setup-consumed');
  assert.equal(submissions.length, 1, 'a source confirmation can submit at most one entry');

  const oldRow = row({
    symbol:'OLDUSDT', confirmationAt:enabledAt - 120_000,
    lastClosed5mAt:enabledAt - 30_000,
    evaluatedAt:tickNow - 1_000,
    poolExpiresAt:tickNow + 60 * 60_000,
  });
  const replay = await runner.process({ rows:[oldRow], btc:{ key:'DOWN_STRONG' } });
  assert.equal(replay.results[0].status, 'age-price-or-route-blocked');
  assert.equal(submissions.length, 1, 'signals from before route enable are baseline only');

  const legacyConfirmationAt = enabledAt + 2_000;
  const legacyFile = join(directory, 'legacy-runner.json');
  await writeFile(legacyFile, JSON.stringify({
    version:'BTC_RELATIVE_STRENGTH_READY_BTC_PULLBACK_SHORT_TP_ONLY_V3_20260928',
    attempts:{
      [`LEGACYUSDT|LONG|${legacyConfirmationAt}|${enabledAt + 10_000}`]:{
        at:enabledAt + 10_000, status:'SUBMITTED', orderId:456,
      },
    },
    symbols:{ LEGACYUSDT:enabledAt + 10_000 },
  }));
  const legacyRunner = new BtcRelativeStrengthBinanceRunner({
    file:legacyFile, controls, startedAt:enabledAt, now:() => tickNow,
    getContext:async () => { throw new Error('consumed legacy setup must not reach Binance'); },
    submit:async () => { throw new Error('consumed legacy setup must not submit'); },
  });
  const legacyRow = row({
    symbol:'LEGACYUSDT', confirmationAt:legacyConfirmationAt,
    lastClosed5mAt:enabledAt + 20_000, evaluatedAt:tickNow - 1_000,
    poolExpiresAt:tickNow + 60 * 60_000,
  });
  const legacyResult = await legacyRunner.process({ rows:[legacyRow], btc:{
    ...runnerBtc, relativeReturnClosedAt:legacyRow.lastClosed5mAt,
  } });
  assert.equal(legacyResult.results[0].status, 'setup-consumed',
    'legacy submitted attempts migrate to one-setup consumption without replay');
} finally {
  await rm(directory, { recursive:true, force:true });
}

assert.equal(BTC_RELATIVE_STRENGTH_BINANCE_VERSION,
  'BTC_RELATIVE_STRENGTH_READY_CAUSAL_ALPHA_ONE_SETUP_V4_20260929');
console.log('btc relative strength Binance tests: OK');
