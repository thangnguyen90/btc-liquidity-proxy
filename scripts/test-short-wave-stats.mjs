import assert from 'node:assert/strict';
import { buildShortWaveStats } from '../src/shortWaveStats.js';

const wave = (state, longState = 'LONG_NEUTRAL', label = state.replaceAll('_', ' ')) => ({
  shortWaveState: state,
  shortWaveLabel: label,
  shortWaveDescription: 'observe only',
  longWaveState: longState,
  longWaveLabel: longState.replaceAll('_', ' '),
  longWaveDescription: 'observe only',
});
const trade = (id, side, status, pnl, roe, state, source = 'pump-90-test', longState = 'LONG_NEUTRAL') => ({
  id,
  side,
  status,
  pnl,
  roe,
  source,
  createdAt: `2026-07-${id < 3 ? '28' : '29'}T12:00:00.000Z`,
  marketDirectionAtSignal: { scoreDynamics: wave(state, longState) },
});
const result = buildShortWaveStats([
  trade(1, 'SHORT', 'CLOSED', 2, 5, 'SHORT_IMPULSE'),
  trade(2, 'SHORT', 'CLOSED', -1, -3, 'SHORT_IMPULSE'),
  trade(3, 'LONG', 'CLOSED', 3, 7, 'BTC_CRASH_RECLAIM', 'liquid-scan-auto-80', 'BTC_RALLY_REJECT'),
  trade(4, 'LONG', 'OPEN', 0.5, 1, 'BTC_CRASH_RECLAIM', 'emasq-15m-breakout', 'BTC_RALLY_REJECT'),
  { id: 5, side: 'SHORT', status: 'CLOSED', pnl: 10 },
]);
assert.equal(result.snapshotCount, 4);
assert.equal(result.observationCount, 8);
assert.equal(result.noSnapshotCount, 1);
const impulse = result.rows.find((row) => row.key === 'SHORT_SCORE|SHORT_IMPULSE|SHORT');
assert.equal(impulse.closed, 2);
assert.equal(impulse.wins, 1);
assert.equal(impulse.losses, 1);
assert.equal(impulse.closedPnl, 1);
assert.equal(impulse.profitFactor, 2);
const reclaim = result.rows.find((row) => row.key === 'SHORT_SCORE|BTC_CRASH_RECLAIM|LONG');
assert.equal(reclaim.closed, 1);
assert.equal(reclaim.open, 1);
assert.equal(reclaim.activePnl, 0.5);
const longReject = result.rows.find((row) => row.key === 'LONG_SCORE|BTC_RALLY_REJECT|LONG');
assert.equal(longReject.closed, 1);
assert.equal(longReject.open, 1);
assert.equal(result.affectsOrders, false);
console.log('short wave stats: OK');
