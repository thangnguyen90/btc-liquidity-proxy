import assert from 'node:assert/strict';
import {
  capShakeoutPendingShadowMargin,
  evaluateShakeoutStage2,
  shakeoutRollingDriftStats,
} from '../src/shakeoutStage2Rule.js';

assert.equal(capShakeoutPendingShadowMargin({
  variant: 'PENDING', marginUsdt: 10, capUsdt: 1,
}), 1);
assert.equal(capShakeoutPendingShadowMargin({
  variant: 'MARKET', marginUsdt: 10, capUsdt: 1,
}), 10);

const stale = evaluateShakeoutStage2({
  layer1Tier: 'GOOD',
  setup: 'STRONG_REJECT',
  variant: 'PENDING',
  side: 'LONG',
  signalAt: '2026-07-23T00:00:00.000Z',
  fillAt: '2026-07-23T01:00:00.000Z',
  signalBtcMarketRegime: 'SIDEWAY_UP',
  entryBtcMarketRegime: 'SIDEWAY_DOWN',
  signalBtcCandle: { name: 'Bullish Candle' },
  entryBtcCandle: { name: 'Bearish Candle' },
  duplicateActiveCount: 1,
  duplicateActiveMarginUsdt: 10,
});
assert.equal(stale.tier, 'WATCH');
assert.deepEqual(stale.flags, [
  'DUPLICATE_ACTIVE',
  'BTC_CANDLE_CONFLICT',
  'STALE_FILL',
]);
assert.equal(stale.auditOnlyFlags, true);
assert.equal(stale.fillQuality, 'PENDING_LATE');

const auditedButNotDowngraded = evaluateShakeoutStage2({
  layer1Tier: 'GOOD',
  setup: 'STRONG_REJECT',
  variant: 'MARKET',
  side: 'LONG',
  signalAt: '2026-07-23T00:00:00.000Z',
  fillAt: '2026-07-23T00:00:00.000Z',
  signalBtcMarketRegime: 'SIDEWAY_DOWN',
  entryBtcMarketRegime: 'SIDEWAY_DOWN',
  signalBtcCandle: { name: 'Bearish Candle' },
  entryBtcCandle: { name: 'Bearish Candle' },
  duplicateActiveCount: 2,
});
assert.equal(auditedButNotDowngraded.tier, 'WATCH');
assert.deepEqual(auditedButNotDowngraded.flags, [
  'DUPLICATE_ACTIVE',
  'BTC_CANDLE_CONFLICT',
]);

const upgraded = evaluateShakeoutStage2({
  layer1Tier: 'GOOD',
  setup: 'WEAK_REJECT',
  variant: 'PENDING',
  side: 'SHORT',
  signalAt: '2026-07-23T00:00:00.000Z',
  fillAt: '2026-07-23T00:10:00.000Z',
});
assert.equal(upgraded.tier, 'WATCH_PLUS');
assert.equal(upgraded.modifier, 'UPGRADE');
assert.equal(upgraded.fillQuality, 'PENDING_FAST');

const badSetup = evaluateShakeoutStage2({
  layer1Tier: 'GOOD',
  setup: 'FALSE_RECLAIM',
  variant: 'PENDING',
  side: 'SHORT',
  signalAt: '2026-07-23T00:00:00.000Z',
  fillAt: '2026-07-23T00:10:00.000Z',
});
assert.equal(badSetup.tier, 'RISK');
assert.equal(badSetup.modifier, 'DOWNGRADE');

const watchPending = evaluateShakeoutStage2({
  layer1Tier: 'WATCH',
  setup: 'FALSE_RECLAIM',
  variant: 'PENDING',
  side: 'LONG',
  signalAt: '2026-07-23T00:00:00.000Z',
  fillAt: '2026-07-23T00:10:00.000Z',
});
assert.equal(watchPending.tier, 'RISK');

const watchPendingWaiting = evaluateShakeoutStage2({
  layer1Tier: 'WATCH',
  setup: 'CLEAN_RECLAIM',
  variant: 'PENDING',
  side: 'LONG',
  signalAt: '2026-07-23T00:00:00.000Z',
});
assert.equal(watchPendingWaiting.tier, 'WATCH');
assert.equal(watchPendingWaiting.fillQuality, 'PENDING_WAIT');

const environmentRisk = evaluateShakeoutStage2({
  layer1Tier: 'RISK',
  setup: 'WEAK_REJECT',
  variant: 'MARKET',
  side: 'LONG',
});
assert.equal(environmentRisk.tier, 'RISK');
assert.equal(environmentRisk.code, 'S2_ENV_RISK');

const losingRows = Array.from({ length: 30 }, (_, index) => ({
  status: 'CLOSED',
  outcome: 'SL',
  variant: 'PENDING',
  side: 'LONG',
  pnl: -1,
  roe: -15,
  closedAt: new Date(Date.parse('2026-07-23T00:00:00.000Z') - (index + 1) * 60_000).toISOString(),
}));
const drift = shakeoutRollingDriftStats(losingRows, {
  variant: 'PENDING',
  side: 'LONG',
  createdAt: '2026-07-23T00:00:00.000Z',
});
assert.equal(drift.active, true);
assert.equal(drift.recent.count, 15);
assert.equal(drift.previous.count, 15);

console.log('shakeout stage 2 rule tests passed');
