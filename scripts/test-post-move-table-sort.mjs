import assert from 'node:assert/strict';
import {
  nextPostMoveSort,
  POST_MOVE_TABLE_SORT_VERSION,
  sortPostMoveRows,
} from '../public/post-move-table-sort.js';

assert.match(POST_MOVE_TABLE_SORT_VERSION, /^POST_MOVE_TABLE_SORT_V1_/);
assert.deepEqual(nextPostMoveSort(null, 'symbol', 'asc'), { key: 'symbol', direction: 'asc' });
assert.deepEqual(nextPostMoveSort({ key: 'symbol', direction: 'asc' }, 'symbol'), { key: 'symbol', direction: 'desc' });
assert.deepEqual(nextPostMoveSort({ key: 'score', direction: 'desc' }, 'price'), { key: 'price', direction: 'desc' });

const rows = [
  { symbol: 'BETAUSDT', score: 75 },
  { symbol: 'ALPHAUSDT', score: null },
  { symbol: 'GAMMAUSDT', score: 90 },
  { symbol: 'DELTAUSDT', score: 75 },
];
assert.deepEqual(
  sortPostMoveRows(rows, { key: 'symbol', direction: 'asc' }, (row, key) => row[key]).map((row) => row.symbol),
  ['ALPHAUSDT', 'BETAUSDT', 'DELTAUSDT', 'GAMMAUSDT'],
);
assert.deepEqual(
  sortPostMoveRows(rows, { key: 'score', direction: 'desc' }, (row, key) => row[key]).map((row) => row.symbol),
  ['GAMMAUSDT', 'BETAUSDT', 'DELTAUSDT', 'ALPHAUSDT'],
  'missing values stay last and equal values keep their original order',
);

console.log('post-move table-sort tests passed');
