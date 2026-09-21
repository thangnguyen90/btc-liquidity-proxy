import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendEdgePaperEntryJournal,
  compactEdgePaperEntryJournal,
  readLatestEdgePaperJournalRecords,
  recoverEdgePaperTradesFromJournal,
} from '../src/edgePaperEntryJournal.js';

const dir = await mkdtemp(join(tmpdir(), 'edge-paper-journal-'));
const file = join(dir, 'journal.ndjson');
try {
  const missing = await readLatestEdgePaperJournalRecords(join(dir, 'missing.ndjson'));
  assert.equal(missing.size, 0);

  const prepared = { id: 'paper-1', symbol: 'BTCUSDT', side: 'SHORT', status: 'OPEN', createdAt: '2026-08-05T00:00:00.000Z' };
  const committed = { ...prepared, liveCardDecision: 'SUBMITTED', liveCardOrderId: 123 };
  await appendEdgePaperEntryJournal(file, 'PREPARED', prepared, { source: 'test' });
  await appendEdgePaperEntryJournal(file, 'COMMITTED', committed, { source: 'test' });
  const latest = await readLatestEdgePaperJournalRecords(file);
  assert.equal(latest.size, 1);
  assert.equal(latest.get('paper-1').trade.liveCardOrderId, 123);

  const recovered = recoverEdgePaperTradesFromJournal({ trades: [] }, latest, {
    now: Date.now(),
    maxPreparedAgeMs: 60_000,
  });
  assert.deepEqual(recovered.recoveredIds, []);
  assert.equal(recovered.store.trades.length, 0);

  await appendEdgePaperEntryJournal(file, 'PREPARED', { ...prepared, id: 'paper-2', symbol: 'ETHUSDT' });
  const twoLatest = await readLatestEdgePaperJournalRecords(file);
  const twoRecovered = recoverEdgePaperTradesFromJournal({ trades: [] }, twoLatest, {
    now: Date.now(),
    maxPreparedAgeMs: 60_000,
  });
  assert.equal(twoRecovered.store.trades.length, 1);
  assert.deepEqual(twoRecovered.recoveredIds, ['paper-2']);

  await appendEdgePaperEntryJournal(file, 'CLOSED', { ...prepared, status: 'CLOSED' }, { source: 'test' });
  const closedLatest = await readLatestEdgePaperJournalRecords(file);
  const closedRecovery = recoverEdgePaperTradesFromJournal({ trades: [] }, closedLatest, {
    now: Date.now(),
    maxPreparedAgeMs: 60_000,
  });
  assert.deepEqual(closedRecovery.recoveredIds, ['paper-2']);
  assert.equal(closedRecovery.store.trades.some((trade) => trade.id === 'paper-1'), false);

  await appendEdgePaperEntryJournal(file, 'DELETED', 'paper-1', { source: 'test' });
  const deletedLatest = await readLatestEdgePaperJournalRecords(file);
  const deletedRecovery = recoverEdgePaperTradesFromJournal({ trades: [{ ...prepared, id: 'paper-2', symbol: 'ETHUSDT' }] }, deletedLatest);
  assert.deepEqual(deletedRecovery.recoveredIds, []);
  assert.equal(deletedRecovery.store.trades.some((trade) => trade.id === 'paper-1'), false);

  const compacted = await compactEdgePaperEntryJournal(file, deletedLatest, {
    archiveDir: join(dir, 'archive'),
    maxBytes: 1,
    maxPreparedAgeMs: 60_000,
  });
  assert.equal(compacted.changed, true);
  assert.equal(compacted.retainedRows, 1);
  assert.equal((await readdir(join(dir, 'archive'))).length, 1);
  const compactedRaw = await readFile(file, 'utf8');
  assert.equal(compactedRaw.includes('paper-1'), false);
  assert.equal(compactedRaw.includes('paper-2'), true);

  const raw = await readFile(file, 'utf8');
  assert.ok(raw.includes('EDGE_PAPER_ENTRY_JOURNAL_V1_2026_08_05'));
  console.log('edge paper entry journal tests passed');
} finally {
  await rm(dir, { recursive: true, force: true });
}
