import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendEdgePaperEntryJournal,
  readLatestEdgePaperJournalRecords,
  recoverEdgePaperTradesFromJournal,
} from '../src/edgePaperEntryJournal.js';

const dir = await mkdtemp(join(tmpdir(), 'edge-paper-journal-'));
const file = join(dir, 'journal.ndjson');
try {
  const prepared = { id: 'paper-1', symbol: 'BTCUSDT', side: 'SHORT', status: 'OPEN', createdAt: '2026-08-05T00:00:00.000Z' };
  const committed = { ...prepared, liveCardDecision: 'SUBMITTED', liveCardOrderId: 123 };
  await appendEdgePaperEntryJournal(file, 'PREPARED', prepared, { source: 'test' });
  await appendEdgePaperEntryJournal(file, 'COMMITTED', committed, { source: 'test' });
  const latest = await readLatestEdgePaperJournalRecords(file);
  assert.equal(latest.size, 1);
  assert.equal(latest.get('paper-1').trade.liveCardOrderId, 123);

  const recovered = recoverEdgePaperTradesFromJournal({ trades: [] }, latest);
  assert.deepEqual(recovered.recoveredIds, ['paper-1']);
  assert.equal(recovered.store.trades[0].liveCardOrderId, 123);

  await appendEdgePaperEntryJournal(file, 'PREPARED', { ...prepared, id: 'paper-2', symbol: 'ETHUSDT' });
  const twoLatest = await readLatestEdgePaperJournalRecords(file);
  const twoRecovered = recoverEdgePaperTradesFromJournal({ trades: [] }, twoLatest);
  assert.equal(twoRecovered.store.trades.length, 2);
  assert.deepEqual(new Set(twoRecovered.recoveredIds), new Set(['paper-1', 'paper-2']));

  await appendEdgePaperEntryJournal(file, 'DELETED', 'paper-1', { source: 'test' });
  const deletedLatest = await readLatestEdgePaperJournalRecords(file);
  const deletedRecovery = recoverEdgePaperTradesFromJournal({ trades: [{ ...prepared, id: 'paper-2', symbol: 'ETHUSDT' }] }, deletedLatest);
  assert.deepEqual(deletedRecovery.recoveredIds, []);
  assert.equal(deletedRecovery.store.trades.some((trade) => trade.id === 'paper-1'), false);

  const raw = await readFile(file, 'utf8');
  assert.ok(raw.includes('EDGE_PAPER_ENTRY_JOURNAL_V1_2026_08_05'));
  console.log('edge paper entry journal tests passed');
} finally {
  await rm(dir, { recursive: true, force: true });
}
