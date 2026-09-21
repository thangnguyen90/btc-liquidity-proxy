import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoEntryControls } from '../src/autoEntryControls.js';
import {
  authorizeHtfDeepBaseRetestOrder,
  evaluateAutoBinanceEntryPolicy,
} from '../src/autoBinancePolicy.js';
import {
  HTF_DEEP_DUMP_BASE_RECLAIM_VERSION,
  HTF_DEEP_DUMP_RETEST_LONG_READY,
  HTF_DEEP_PUMP_RETEST_SHORT_READY,
} from '../src/htfDeepDumpBaseReclaim.js';
import {
  HTF_DEEP_BASE_RETEST_BINANCE_VERSION,
  HTF_DEEP_BASE_RETEST_ROUTES,
  HtfDeepBaseRetestBinanceRunner,
  buildHtfDeepBaseRetestOrder,
} from '../src/htfDeepDumpBaseBinance.js';

const now = Date.UTC(2026, 8, 12, 12, 0, 0);
const enabledAt = new Date(now - 60_000).toISOString();
const event = (side = 'LONG') => ({
  version: HTF_DEEP_DUMP_BASE_RECLAIM_VERSION,
  symbol: side === 'LONG' ? 'ALLOUSDT' : 'BULLAUSDT',
  interval: '15m',
  htfInterval: '4h',
  side,
  stage: side === 'LONG'
    ? HTF_DEEP_DUMP_RETEST_LONG_READY
    : HTF_DEEP_PUMP_RETEST_SHORT_READY,
  shockTier: 'EXTREME',
  closed: true,
  observeOnly: false,
  binanceEligible: true,
  executionEligible: true,
  candleCloseAt: now - 20_000,
  generatedAt: new Date(now - 19_000).toISOString(),
  episodeBucketAt: now - 4 * 60 * 60_000,
  price: 100,
  shockPct: 18,
  pumpPct: 18,
  trueRangeRatio: 9,
  quoteVolumeRatio: 12,
  ...(side === 'SHORT' ? {
    shortReboundPct: 4.2,
    shortReboundAtrMultiple: 1.9,
    shortFadePct: 1.7,
    shortFadeAtrMultiple: 1.1,
  } : {}),
});

assert.equal(
  HTF_DEEP_BASE_RETEST_BINANCE_VERSION,
  'HTF_DEEP_BASE_RETEST_EDITABLE_ENTRY_SETTINGS_V4_20260914',
);

const longPlan = buildHtfDeepBaseRetestOrder(event(), { now, enabledAt, markPrice: 100.2 });
assert.equal(longPlan.side, 'BUY');
assert.equal(longPlan.marginUsdt, 5);
assert.equal(longPlan.leverage, 5);
assert.equal(longPlan.notionalUsdt, 25);
assert.equal(longPlan.takeProfitPrice, 103);
assert.equal(longPlan.stopLossPrice, 94);
assert.equal(longPlan.takeProfitRoePct, 15);
assert.equal(longPlan.stopLossRoePct, 30);
assert.equal(longPlan.allowMinNotionalCeil, false);

const configuredLongPlan = buildHtfDeepBaseRetestOrder(event(), {
  now, enabledAt, markPrice: 100.2,
  routeState: { marginUsdt: 7.25, leverage: 8, takeProfitRoePct: 20 },
});
assert.equal(configuredLongPlan.marginUsdt, 7.25);
assert.equal(configuredLongPlan.leverage, 8);
assert.equal(configuredLongPlan.notionalUsdt, 58);
assert.equal(configuredLongPlan.takeProfitRoePct, 20);
assert.ok(Math.abs(configuredLongPlan.takeProfitPrice - 102.5) < 1e-12);
assert.ok(Math.abs(configuredLongPlan.stopLossPrice - 96.25) < 1e-12);

const fastPlan = buildHtfDeepBaseRetestOrder({
  ...event(),
  htfInterval: '1h',
  confirmationInterval: '5m',
  fastConfirmation: true,
  retestBars5mAfterEarly: 2,
}, { now, enabledAt, markPrice: 100.2 });
assert.equal(fastPlan.signalInterval, '5m');
assert.match(fastPlan.signalCombo, /^1h\|5m\|RETEST_LONG_READY\|/);
assert.match(fastPlan.signalReason, /confirmation=5m/);

const shortPlan = buildHtfDeepBaseRetestOrder(event('SHORT'), {
  now, enabledAt, markPrice: 99.8,
});
assert.equal(shortPlan.side, 'SELL');
assert.equal(shortPlan.takeProfitPrice, 97);
assert.equal(shortPlan.stopLossPrice, 106);
assert.notEqual(shortPlan.clientOrderId, longPlan.clientOrderId);
assert.equal(buildHtfDeepBaseRetestOrder({
  ...event('SHORT'),
  shortReboundPct: 0.8,
}, { now, enabledAt, markPrice: 99.8 }), null,
'SHORT READY without the required large rebound must fail closed');

const measuredShortPlan = buildHtfDeepBaseRetestOrder({
  ...event('SHORT'),
  shortReboundPct: 4.2,
  shortReboundAtrMultiple: 1.9,
  shortFadePct: 1.7,
  shortFadeAtrMultiple: 1.1,
}, { now, enabledAt, markPrice: 99.8 });
assert.match(measuredShortPlan.signalReason, /rebound=4.2%\/1.9ATR/);
assert.match(measuredShortPlan.signalReason, /fade=1.7%\/1.1ATR/);

assert.equal(buildHtfDeepBaseRetestOrder({ ...event(), closed: false }, {
  now, enabledAt, markPrice: 100,
}), null);
assert.equal(buildHtfDeepBaseRetestOrder(event(), {
  now, enabledAt: new Date(now - 10_000).toISOString(), markPrice: 100,
}), null, 'signals closed before route activation cannot replay');
assert.equal(buildHtfDeepBaseRetestOrder(event(), {
  now: now + 91_000, enabledAt, markPrice: 100,
}), null, 'stale READY cannot enter');
assert.equal(buildHtfDeepBaseRetestOrder(event(), {
  now, enabledAt, markPrice: 100.51,
}), null, 'mark drift over 0.5% blocks');

const authorized = evaluateAutoBinanceEntryPolicy({
  payload: authorizeHtfDeepBaseRetestOrder(longPlan),
  orderEnabled: true,
});
assert.equal(authorized.allowed, true);
assert.equal(authorized.reason, 'HTF_DEEP_BASE_RETEST_READY_CONFIGURED_ENTRY');
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: longPlan, orderEnabled: true,
}).allowed, false, 'the exact non-enumerable authorization marker is required');

const controlsDir = await mkdtemp(join(tmpdir(), 'htf-base-controls-'));
const realControls = new AutoEntryControls(join(controlsDir, 'controls.json'));
realControls.seed(HTF_DEEP_BASE_RETEST_ROUTES);
const seeded = realControls.read();
assert.equal(seeded.enabled, false);
for (const route of HTF_DEEP_BASE_RETEST_ROUTES) {
  const saved = realControls.register(route);
  assert.equal(seeded.routes[saved.key].enabled, false, `${route.signalLabel} defaults OFF`);
}

const runnerDir = await mkdtemp(join(tmpdir(), 'htf-base-runner-'));
const stateFile = join(runnerDir, 'state.json');
let submissions = 0;
let asserted = 0;
const controls = {
  register: () => ({ key: 'route' }),
  read: () => ({ enabled: true, routes: { route: { enabled: true, enabledAt } } }),
  assertEntry: (plan) => { asserted += 1; assert.equal(plan.marginUsdt, 5); },
};
const runner = new HtfDeepBaseRetestBinanceRunner({
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
    return { status: 'FILLED', orderResult: { orderId: 987 }, plan };
  },
});
const first = await runner.handle(event());
assert.equal(first.status, 'FILLED');
assert.equal(first.orderId, 987);
assert.equal(submissions, 1);
assert.equal(asserted, 1);
assert.equal((await runner.handle(event())).status, 'deduped');
assert.equal(submissions, 1);
const persisted = JSON.parse(await readFile(stateFile, 'utf8'));
assert.equal(Object.values(persisted.attempts)[0].status, 'FILLED');

const positionRunner = new HtfDeepBaseRetestBinanceRunner({
  file: join(runnerDir, 'position.json'), controls, now: () => now,
  getContext: async (symbol) => ({
    enabled: true,
    positions: [{ symbol, positionAmt: '1' }],
    openOrders: [],
    markPrice: 100,
  }),
  submit: async () => { throw new Error('must not submit'); },
});
assert.equal((await positionRunner.handle(event('SHORT'))).status, 'existing-position');

console.log('HTF deep-base Binance: exact LONG/SHORT READY, $5×5, fill TP/SL, policy, controls, freshness and dedupe passed.');
