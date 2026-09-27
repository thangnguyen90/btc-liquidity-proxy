import assert from 'node:assert/strict';
import {
  nextObserveSort,
  sortCoinLevelObserveWatches,
} from '../public/coin-level-observe-sort.js';

const watches = [
  { symbol: 'BETAUSDT', earlyScore: 81, volumeRatio: 2.4, observedAt: 100, livePrice: 0.8 },
  { symbol: 'ALPHAUSDT', earlyScore: 92, volumeRatio: 1.2, observedAt: 300, livePrice: 0.3 },
  { symbol: 'GAMMAUSDT', earlyScore: 81, volumeRatio: null, observedAt: 200, livePrice: 1.1 },
];
assert.deepEqual(sortCoinLevelObserveWatches([
  { symbol: 'LOW', quoteVolumeUsdt: 50_000 },
  { symbol: 'HIGH', quoteVolumeUsdt: 2_000_000 },
  { symbol: 'LEGACY' },
], 'LONG', { key: 'volumeUsdt', direction: 'desc' }).map((item) => item.symbol),
['HIGH', 'LOW', 'LEGACY']);
assert.deepEqual(sortCoinLevelObserveWatches(watches, 'LONG', {}).map((item) => item.symbol),
  ['BETAUSDT', 'ALPHAUSDT', 'GAMMAUSDT']);
assert.deepEqual(sortCoinLevelObserveWatches(watches, 'LONG', { key: 'score', direction: 'desc' })
  .map((item) => item.symbol), ['ALPHAUSDT', 'BETAUSDT', 'GAMMAUSDT']);
assert.deepEqual(sortCoinLevelObserveWatches(watches, 'LONG', { key: 'volume', direction: 'asc' })
  .map((item) => item.symbol), ['ALPHAUSDT', 'BETAUSDT', 'GAMMAUSDT']);
assert.deepEqual(sortCoinLevelObserveWatches(watches, 'LONG', { key: 'time', direction: 'desc' })
  .map((item) => item.symbol), ['ALPHAUSDT', 'GAMMAUSDT', 'BETAUSDT']);
assert.deepEqual(sortCoinLevelObserveWatches(watches, 'LONG', { key: 'coin', direction: 'asc' })
  .map((item) => item.symbol), ['ALPHAUSDT', 'BETAUSDT', 'GAMMAUSDT']);
assert.deepEqual(watches.map((item) => item.symbol), ['BETAUSDT', 'ALPHAUSDT', 'GAMMAUSDT']);

const short = [
  { symbol: 'FIRSTUSDT', takerSellPct: 52, breakdownGapPct: 0.6, setupMode: 'BREAKDOWN_PRESSURE' },
  { symbol: 'SECONDUSDT', takerSellPct: 71, pullbackPct: 1.4, setupMode: 'POST_PUMP' },
];
assert.deepEqual(sortCoinLevelObserveWatches(short, 'SHORT', { key: 'taker', direction: 'desc' })
  .map((item) => item.symbol), ['SECONDUSDT', 'FIRSTUSDT']);
assert.deepEqual(sortCoinLevelObserveWatches(short, 'SHORT', { key: 'distance', direction: 'asc' })
  .map((item) => item.symbol), ['FIRSTUSDT', 'SECONDUSDT']);
assert.deepEqual(sortCoinLevelObserveWatches([
  { symbol: 'FAR', breakoutGapPct: -2.1 },
  { symbol: 'NEAR', breakoutGapPct: 0.2 },
], 'LONG', { key: 'distance', direction: 'asc' }).map((item) => item.symbol), ['NEAR', 'FAR']);
assert.deepEqual(nextObserveSort({}, 'score'), { key: 'score', direction: 'desc' });
assert.deepEqual(nextObserveSort({ key: 'score', direction: 'desc' }, 'score'), { key: 'score', direction: 'asc' });
assert.deepEqual(nextObserveSort({}, 'coin'), { key: 'coin', direction: 'asc' });

console.log('coin-level observe sort: ok');
