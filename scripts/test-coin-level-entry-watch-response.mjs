import assert from 'node:assert/strict';
import { buildCoinLevelEntryWatchHttpResponse } from '../src/coinLevelEntryWatchResponse.js';

const generatedAt = 2_000_000;
const snapshot = {
  generatedAt,
  candidates: [{ symbol: 'LIVEUSDT' }],
  earlyLongWatches: [{ symbol: 'AUSDT', side: 'LONG', observedAt: generatedAt - 1_000 }],
  earlyShortWatches: [{ symbol: 'BUSDT', side: 'SHORT', observedAt: generatedAt - 1_000 }],
  earlyLongHistory: [
    { symbol: 'AUSDT', side: 'LONG', observedAt: generatedAt - 2_000, large: 'x'.repeat(2_000) },
    { symbol: 'OLDUSDT', side: 'LONG', observedAt: generatedAt - 31 * 60_000 },
  ],
  earlyShortHistory: [
    { symbol: 'AUSDT', side: 'SHORT', observedAt: generatedAt - 3_000, large: 'x'.repeat(2_000) },
  ],
  totalEarlyLongHistory: 500,
  totalEarlyShortHistory: 500,
};

const live = buildCoinLevelEntryWatchHttpResponse(snapshot);
assert.equal(live.historyIncluded, false);
assert.equal('earlyLongHistory' in live, false);
assert.equal('earlyShortHistory' in live, false);
assert.deepEqual(live.recentObserveHistory, [
  { symbol: 'AUSDT', side: 'LONG', observedAt: generatedAt - 2_000 },
  { symbol: 'AUSDT', side: 'SHORT', observedAt: generatedAt - 3_000 },
]);
assert.equal(live.totalEarlyLongHistory, 500);
assert.equal(live.candidates.length, 1);

const history = buildCoinLevelEntryWatchHttpResponse(snapshot, { includeHistory: true });
assert.equal(history.historyIncluded, true);
assert.equal(history.earlyLongHistory.length, 2);
assert.equal(history.earlyShortHistory.length, 1);

console.log('coin-level entry-watch response tests passed');
