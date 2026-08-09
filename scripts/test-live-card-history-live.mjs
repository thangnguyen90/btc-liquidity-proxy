import assert from 'node:assert/strict';
import {
  LIVE_CARD_HISTORY_STREAM_VERSION,
  calculateLiveCardOpenPnl,
  isLiveCardExecutionOpen,
} from '../public/live-card-history-live.js';

assert.equal(LIVE_CARD_HISTORY_STREAM_VERSION, 'LIVE_CARD_HISTORY_STREAM_V1_20260809');
assert.equal(isLiveCardExecutionOpen({ entryFilledAt: '2026-08-09T00:00:00Z', status: 'PROTECTED' }), true);
assert.equal(isLiveCardExecutionOpen({ entryFilledAt: '2026-08-09T00:00:00Z', status: 'BOT_CLOSE_SUBMITTED' }), true);
assert.equal(isLiveCardExecutionOpen({ entryFilledAt: '2026-08-09T00:00:00Z', status: 'POSITION_CLOSED' }), false);
assert.equal(isLiveCardExecutionOpen({ status: 'ENTRY_SUBMITTED' }), false);

assert.deepEqual(calculateLiveCardOpenPnl({
  side: 'LONG', entryPrice: 100, markPrice: 102, quantity: 0.5, marginUsdt: 5, leverage: 10,
}), { pnl: 1, roe: 20, margin: 5 });
assert.deepEqual(calculateLiveCardOpenPnl({
  side: 'SHORT', entryPrice: 100, markPrice: 98, quantity: 0.5, marginUsdt: 5, leverage: 10,
}), { pnl: 1, roe: 20, margin: 5 });
assert.equal(calculateLiveCardOpenPnl({ side: 'SHORT', entryPrice: 100, markPrice: 98, quantity: 0 }), null);

console.log('live-card history stream tests passed');
