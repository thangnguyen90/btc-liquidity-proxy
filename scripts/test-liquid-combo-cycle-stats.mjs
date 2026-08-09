import assert from 'node:assert/strict';
import {
  LIQUID_COMBO_CYCLE_STATS_VERSION,
  buildLiquidComboCycleStats,
  buildLiquidComboCycleTodayStats,
  liquidComboCycleContext,
} from '../src/liquidComboCycleStats.js';

const STABLE_COMBO = [
  'LIQUID_KILL_ZONE',
  'LONG',
  '15m',
  'BTC_CORR_THEO',
  'BTC_UP_MID',
  'THUAN_BTC',
  'GATE_OK_LIQUID_LONG_BTC_ALIGNED',
].join(' | ');

function trade({
  id,
  day,
  hour,
  combo = STABLE_COMBO,
  status = 'CLOSED',
  netRoe = 4,
  pct24h = 0.5,
  rsi4h = 45,
}) {
  const openedAt = `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`;
  return {
    id,
    source: 'liquid-scan-auto',
    side: 'LONG',
    status,
    outcome: status === 'CLOSED' ? netRoe > 0 ? 'TP' : 'SL' : null,
    openedAt,
    createdAt: openedAt,
    closedAt: status === 'CLOSED'
      ? `${day}T${String(hour).padStart(2, '0')}:30:00.000Z`
      : null,
    marginUsdt: 1,
    netRoe,
    netPnl: netRoe / 100,
    liquidCombo: combo,
    btcHealth: {
      pct24h,
      pct6h: 0.3,
      rsi4h,
    },
  };
}

const stableTrades = [];
for (const [dayIndex, day] of ['2026-07-21', '2026-07-22', '2026-07-23'].entries()) {
  for (let index = 0; index < 4; index += 1) {
    stableTrades.push(trade({
      id: `stable-${dayIndex}-${index}`,
      day,
      hour: 2 + index * 2,
      netRoe: index === 0 ? 2 : 5,
    }));
  }
}
stableTrades.push(trade({
  id: 'stable-active',
  day: '2026-07-24',
  hour: 12,
  status: 'OPEN',
  netRoe: 1.5,
}));

const stableResult = buildLiquidComboCycleStats(stableTrades);
assert.equal(stableResult.version, LIQUID_COMBO_CYCLE_STATS_VERSION);
assert.equal(stableResult.mode, 'OBSERVATION_ONLY');
assert.equal(stableResult.observationOnly, true);
assert.equal(stableResult.affectsEntry, false);
assert.equal(stableResult.affectsMargin, false);
assert.equal(stableResult.affectsSl, false);
assert.equal(stableResult.affectsTp, false);
assert.equal(stableResult.stableGood.length, 1);
assert.equal(stableResult.stableGood[0].tier, 'STABLE_GOOD');
assert.equal(stableResult.stableGood[0].history.days, 3);
assert.equal(stableResult.stableGood[0].history.episodes, 12);
assert.equal(stableResult.stableGood[0].active, 1);
assert.equal('tradePlan' in stableResult.stableGood[0], false);

const formingCombo = STABLE_COMBO.replace('BTC_UP_MID', 'BTC_UP_WEAK');
const formingTrades = [];
for (const [dayIndex, day] of ['2026-07-25', '2026-07-26'].entries()) {
  for (let index = 0; index < 4; index += 1) {
    formingTrades.push(trade({
      id: `forming-${dayIndex}-${index}`,
      day,
      hour: 1 + index * 2,
      combo: formingCombo,
      netRoe: 3,
    }));
  }
}
const formingResult = buildLiquidComboCycleStats(formingTrades);
assert.equal(formingResult.stableGood.length, 0);
assert.equal(formingResult.formingGood.length, 1);
assert.equal(formingResult.formingGood[0].tier, 'FORMING_GOOD');

const sameBurst = Array.from({ length: 20 }, (_, index) => trade({
  id: `burst-${index}`,
  day: '2026-07-26',
  hour: 10,
  netRoe: 8,
}));
const burstResult = buildLiquidComboCycleStats(sameBurst);
assert.equal(burstResult.stableGood.length, 0);
assert.equal(burstResult.formingGood.length, 0);
assert.equal(burstResult.counts.NEW, 1);

const todayGood = buildLiquidComboCycleTodayStats([
  trade({ id: 'today-good-1', day: '2026-07-27', hour: 18, netRoe: 4 }),
  trade({ id: 'today-good-2', day: '2026-07-27', hour: 19, netRoe: 6 }),
], { day: '2026-07-28' });
assert.equal(todayGood.day, '2026-07-28');
assert.equal(todayGood.timeZone, 'Asia/Bangkok');
assert.equal(todayGood.mode, 'OBSERVATION_ONLY');
assert.equal(todayGood.affectsEntry, false);
assert.equal(todayGood.stableToday.length, 1);
assert.equal(todayGood.stableToday[0].tier, 'TODAY_STABLE');
assert.equal(todayGood.stableToday[0].today.closed, 2);
assert.equal(todayGood.stableToday[0].today.episodes, 2);

const todayBurst = buildLiquidComboCycleTodayStats([
  trade({ id: 'today-burst-1', day: '2026-07-27', hour: 18, netRoe: 5 }),
  trade({ id: 'today-burst-2', day: '2026-07-27', hour: 18, netRoe: 5 }),
], { day: '2026-07-28' });
assert.equal(todayBurst.stableToday.length, 1);
assert.equal(todayBurst.stableToday[0].today.episodes, 1);

const todayOutsideStable = buildLiquidComboCycleTodayStats([
  trade({ id: 'today-outside-stable', day: '2026-07-27', hour: 18, netRoe: -5 }),
], {
  day: '2026-07-28',
  allowedKeys: [],
});
assert.equal(todayOutsideStable.stableToday.length, 0);

assert.equal(
  liquidComboCycleContext(trade({
    id: 'context',
    day: '2026-07-26',
    hour: 12,
    pct24h: 0.69,
    rsi4h: 46.2,
  })).key,
  'DAY_POS | RSI4_RESET',
);

console.log('liquid combo cycle stats tests passed');
