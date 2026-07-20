import assert from 'node:assert/strict';
import { applyRecommendedDefaultSlLiveClose } from '../src/recommendedSignals.js';

const base = {
  id: 'paper-v2-test',
  paperMode: 'INDEPENDENT_SOCKET_V2',
  status: 'OPEN',
  symbol: 'TESTUSDT',
  side: 'LONG',
  entryPrice: 100,
  marginUsdt: 10,
  leverage: 10,
  quantity: 1,
  sl: 98.4,
  tp: 101.5,
};

const takeProfit = applyRecommendedDefaultSlLiveClose({ ...base, markPrice: 101.5 });
assert.equal(takeProfit.status, 'CLOSED');
assert.equal(takeProfit.outcome, 'TP');
assert.equal(takeProfit.roe, 15);
assert.equal(takeProfit.pnl, 1.5);

const stopLoss = applyRecommendedDefaultSlLiveClose({ ...base, markPrice: 98.4 });
assert.equal(stopLoss.status, 'CLOSED');
assert.equal(stopLoss.outcome, 'RECOMMENDED_SL_16');
assert.equal(stopLoss.roe, -16);
assert.equal(stopLoss.pnl, -1.6);

const live = applyRecommendedDefaultSlLiveClose({ ...base, markPrice: 100.5 });
assert.equal(live.status, 'OPEN');
assert.equal(live.outcome, undefined);

console.log('Recommended Signals V2 test passed: independent socket TP/SL accounting is correct.');
