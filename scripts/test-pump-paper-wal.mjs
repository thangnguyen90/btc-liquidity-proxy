#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  PUMP_PAPER_WAL_STREAM_VERSION,
  compactPumpPaperTradeForStorage,
  replayPumpPaperWalFile,
} from '../src/pumpPaperWal.js';

const dir = await mkdtemp(join(tmpdir(), 'pump-paper-wal-'));
try {
  const wal = join(dir, 'pump-paper-trades.wal.ndjson');
  const store = {
    trades: [
      { id: 'old-a', status: 'OPEN', value: 1 },
      { id: 'old-b', status: 'OPEN', value: 2 },
      { id: 'duplicate', status: 'CLOSED', value: 3 },
      { id: 'duplicate', status: 'CLOSED', value: 4 },
    ],
  };
  await writeFile(wal, [
    JSON.stringify({ op: 'UPSERT', id: 'old-a', trade: { id: 'old-a', status: 'CLOSED', value: 10 } }),
    JSON.stringify({ op: 'UPSERT', id: 'new-a', trade: { id: 'new-a', status: 'OPEN', value: 20 } }),
    JSON.stringify({ op: 'UPSERT', id: 'new-b', trade: { id: 'new-b', status: 'OPEN', value: 30 } }),
    JSON.stringify({ op: 'DELETE', id: 'old-b' }),
    JSON.stringify({ op: 'UPSERT', id: 'new-a', trade: { id: 'new-a', status: 'CLOSED', value: 21 } }),
    '{truncated',
    '',
  ].join('\n'), 'utf8');

  const result = await replayPumpPaperWalFile(store, wal);
  assert.equal(PUMP_PAPER_WAL_STREAM_VERSION, 'PUMP_PAPER_WAL_COMPACT_STREAM_V3_20260822');
  assert.deepEqual(
    compactPumpPaperTradeForStorage({ id: 'compact', missing: null, absent: undefined, zero: 0, off: false }),
    { id: 'compact', zero: 0, off: false },
  );
  assert.equal(result.applied, 5);
  assert.equal(result.skipped, 1);
  assert.ok(result.walBytes > 0);
  assert.deepEqual(store.trades.map((row) => row.id), [
    'new-b',
    'new-a',
    'old-a',
    'duplicate',
    'duplicate',
  ]);
  assert.equal(store.trades.find((row) => row.id === 'new-a').value, 21);
  assert.equal(store.trades.find((row) => row.id === 'old-a').value, 10);
  assert.equal(store.trades.filter((row) => row.id === 'duplicate').length, 2);

  const boundedStore = { trades: [] };
  const bounded = await replayPumpPaperWalFile(boundedStore, wal, { maxRows: 2 });
  assert.deepEqual(boundedStore.trades.map((row) => row.id), ['new-b', 'new-a']);
  assert.equal(bounded.evicted, 1);

  const missing = await replayPumpPaperWalFile({ trades: [] }, join(dir, 'missing.ndjson'));
  assert.deepEqual(missing, { applied: 0, skipped: 0, walBytes: 0, evicted: 0 });
  console.log('pump paper WAL streaming tests passed');
} finally {
  await rm(dir, { recursive: true, force: true });
}
