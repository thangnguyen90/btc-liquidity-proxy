#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  PAPER_HOT_STORE_VERSION,
  applyPaperHotStorePartition,
  partitionPaperHotRows,
} from '../src/paperHotStore.js';

const rows = [
  { id: 'closed-new-1', status: 'CLOSED' },
  { id: 'open-new', status: 'OPEN' },
  { id: 'closed-new-2', status: 'CLOSED' },
  { id: 'pending-old', status: 'PENDING' },
  { id: 'unknown-old', status: 'READY' },
  { id: 'closed-old-1', status: 'CLOSED' },
  { id: 'closed-old-2', status: 'CLOSED' },
];

const partition = partitionPaperHotRows(rows, 5);
assert.equal(partition.version, PAPER_HOT_STORE_VERSION);
assert.equal(partition.protectedRows, 3);
assert.deepEqual(partition.hotRows.map((row) => row.id), [
  'closed-new-1',
  'open-new',
  'closed-new-2',
  'pending-old',
  'unknown-old',
]);
assert.deepEqual(partition.archiveRows.map((row) => row.id), ['closed-old-1', 'closed-old-2']);

const activeOverflow = partitionPaperHotRows([
  { id: 'a', status: 'OPEN' },
  { id: 'b', status: 'PENDING' },
  { id: 'c', status: 'READY' },
  { id: 'd', status: 'CLOSED' },
], 2);
assert.deepEqual(activeOverflow.hotRows.map((row) => row.id), ['a', 'b', 'c']);
assert.deepEqual(activeOverflow.archiveRows.map((row) => row.id), ['d']);

const store = { hotStore: { archivedRows: 8 }, trades: rows };
applyPaperHotStorePartition(store, partition, {
  compactedAt: '2026-09-03T00:00:00.000Z',
  archiveFile: 'archive/test.ndjson',
});
assert.equal(store.trades.length, 5);
assert.equal(store.hotStore.archivedRows, 10);
assert.equal(store.hotStore.archiveFile, 'archive/test.ndjson');

console.log('paper hot-store tests passed');
