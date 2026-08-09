import assert from 'node:assert/strict';
import { buildPumpComboCycleStats } from '../src/pumpComboCycleStats.js';

const trades = [];
for (let day = 21; day <= 23; day += 1) {
  for (let index = 0; index < 4; index += 1) {
    trades.push({
      id: `pump-${day}-${index}`,
      source: 'pump-90-test',
      combo: 'PUMP_BREAKOUT | LONG | B | SCORE_90_PLUS',
      createdAt: `2026-07-${day}T0${index}:05:00.000Z`,
      status: 'CLOSED',
      pnl: index === 3 ? -0.1 : 0.3,
      roe: index === 3 ? -1 : 3,
      btcHealth: { pct24h: 1.2, rsi4h: 54 },
    });
  }
  trades.push({
    id: `ema-${day}`,
    source: 'emasq-15m-breakout',
    combo: 'PUMP_BREAKOUT | LONG | B | SCORE_90_PLUS',
    createdAt: `2026-07-${day}T08:00:00.000Z`,
    status: 'CLOSED',
    pnl: -99,
    roe: -30,
    btcHealth: { pct24h: 1.2, rsi4h: 54 },
  });
}

const result = buildPumpComboCycleStats(trades);
assert.equal(result.sourceScope, 'PUMP_NATIVE_ONLY');
assert.equal(result.observationOnly, true);
assert.equal(result.affectsEntry, false);
assert.equal(result.stableGood.length, 1);
assert.equal(result.stableGood[0].history.closed, 12);
assert.equal(result.stableGood[0].history.days, 3);
assert.equal(result.stableGood[0].history.positiveDays, 3);
assert.equal(result.stableGood[0].cycleKey, 'DAY_POS | RSI4_BALANCED');
assert.ok(result.stableGood[0].history.pnl > 0);

console.log('pump combo cycle stats: ok');
