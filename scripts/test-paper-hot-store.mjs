#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  PAPER_HOT_STORE_VERSION,
  applyPaperHotStorePartition,
  isTerminalPaperTrade,
  partitionPaperHotRows,
} from '../src/paperHotStore.js';
import { readFile } from 'node:fs/promises';

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

assert.equal(isTerminalPaperTrade({ status: 'CANCELLED' }), true);
assert.equal(isTerminalPaperTrade({ status: 'EXPIRED' }), true);
assert.equal(isTerminalPaperTrade({ status: 'REJECTED' }), true);
const terminalRows = partitionPaperHotRows([
  { id: 'open', status: 'OPEN' },
  { id: 'cancelled', status: 'CANCELLED' },
  { id: 'expired', status: 'EXPIRED' },
  { id: 'rejected', status: 'REJECTED' },
], 2);
assert.deepEqual(terminalRows.hotRows.map((row) => row.id), ['open', 'cancelled']);
assert.deepEqual(terminalRows.archiveRows.map((row) => row.id), ['expired', 'rejected']);

const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert(server.includes('CAP_PAPER_MAX_HOT_ROWS'));
assert(server.includes('SHAKEOUT_PAPER_MAX_HOT_ROWS'));
const recommended = await readFile(new URL('../src/recommendedSignals.js', import.meta.url), 'utf8');
assert(recommended.includes('RECOMMENDED_PAPER_MAX_HOT_ROWS'));

console.log('paper hot-store tests passed');
