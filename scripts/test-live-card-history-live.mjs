import assert from 'node:assert/strict';
import {
  LIVE_CARD_HISTORY_STREAM_VERSION,
  calculateLiveCardHistoryPnlTotals,
  calculateLiveCardOpenPnl,
  isLiveCardExecutionOpen,
} from '../public/live-card-history-live.js';

assert.equal(LIVE_CARD_HISTORY_STREAM_VERSION, 'LIVE_CARD_HISTORY_TOTAL_PNL_V2_20260811');
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

const totals = calculateLiveCardHistoryPnlTotals([
  { entryFilledAt: '2026-08-09T00:00:00Z', status: 'POSITION_CLOSED', closedPnlKnown: true, closedPnlNet: 1.25 },
  { entryFilledAt: '2026-08-09T00:01:00Z', status: 'POSITION_CLOSED', closedPnlKnown: false },
  { entryFilledAt: '2026-08-09T00:02:00Z', status: 'PROTECTED', symbol: 'LONGUSDT', side: 'LONG', fillPrice: 100, filledQty: 0.5, marginUsdt: 5, leverage: 10 },
  { entryFilledAt: '2026-08-09T00:03:00Z', status: 'PROTECTED', symbol: 'SHORTUSDT', side: 'SHORT', fillPrice: 100, filledQty: 0.25, marginUsdt: 5, leverage: 5 },
  { entryFilledAt: '2026-08-09T00:04:00Z', status: 'PROTECTED', symbol: 'WAITUSDT', side: 'LONG', fillPrice: 100, filledQty: 0.1, marginUsdt: 2, leverage: 5 },
], new Map([
  ['LONGUSDT', { symbol: 'LONGUSDT', positionAmt: '0.5', markPrice: '102' }],
  ['SHORTUSDT', { symbol: 'SHORTUSDT', positionAmt: '-0.25', markPrice: '96' }],
]));
assert.deepEqual(totals, {
  closedNet: 1.25,
  closedKnown: 1,
  closedMissing: 1,
  openUnrealized: 2,
  openKnown: 2,
  openMissing: 1,
  totalPnl: 3.25,
});

console.log('live-card history stream tests passed');
