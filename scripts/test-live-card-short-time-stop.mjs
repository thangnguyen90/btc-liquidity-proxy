import assert from 'node:assert/strict';
import {
  LIVE_CARD_SHORT_TIME_STOP_DEFAULT_MS,
  LIVE_CARD_SHORT_TIME_STOP_VERSION,
  selectExpiredLiveCardShortExecutions,
} from '../src/liveCardShortTimeStop.js';

assert.equal(LIVE_CARD_SHORT_TIME_STOP_VERSION, 'LIVE_CARD_SHORT_TIME_STOP_V1_20260809');
assert.equal(LIVE_CARD_SHORT_TIME_STOP_DEFAULT_MS, 24 * 60 * 60 * 1000);

const nowMs = Date.parse('2026-08-09T12:00:00.000Z');
const executions = [
  { lifecycleId: 'short-expired', side: 'SHORT', status: 'PROTECTED', entryFilledAt: '2026-08-08T11:59:59.000Z' },
  { lifecycleId: 'short-fresh', side: 'SHORT', status: 'ENTRY_FILLED', entryFilledAt: '2026-08-09T11:00:00.000Z' },
  { lifecycleId: 'long-expired', side: 'LONG', status: 'PROTECTED', entryFilledAt: '2026-08-07T12:00:00.000Z' },
  { lifecycleId: 'short-closed', side: 'SHORT', status: 'POSITION_CLOSED', entryFilledAt: '2026-08-07T12:00:00.000Z' },
  { lifecycleId: 'short-failed-close', side: 'SHORT', status: 'BOT_CLOSE_FAILED', entryFilledAt: '2026-08-08T00:00:00.000Z' },
];

const expired = selectExpiredLiveCardShortExecutions(executions, { nowMs });
assert.deepEqual(expired.map((row) => row.lifecycleId), ['short-failed-close', 'short-expired']);
assert.equal(expired[0].shortTimeStopVersion, LIVE_CARD_SHORT_TIME_STOP_VERSION);
assert.equal(expired[0].shortTimeStopMaxHoldMs, LIVE_CARD_SHORT_TIME_STOP_DEFAULT_MS);
assert.equal(selectExpiredLiveCardShortExecutions(executions, { nowMs, maxHoldMs: 0 }).length, 0);

console.log('live-card SHORT time-stop tests passed');
