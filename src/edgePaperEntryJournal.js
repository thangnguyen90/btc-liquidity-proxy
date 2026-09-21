import { createReadStream } from 'node:fs';
import { copyFile, mkdir, open, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

export const EDGE_PAPER_ENTRY_JOURNAL_VERSION = 'EDGE_PAPER_ENTRY_JOURNAL_V1_2026_08_05';
export const EDGE_PAPER_ENTRY_JOURNAL_READER_VERSION =
  'EDGE_PAPER_ENTRY_JOURNAL_STREAM_READER_V1_20260831';
export const EDGE_PAPER_ENTRY_JOURNAL_RECOVERY_VERSION =
  'EDGE_PAPER_ENTRY_JOURNAL_RECOVERY_V3_RECENT_PREPARED_ONLY_20260903';
export const EDGE_PAPER_ENTRY_JOURNAL_DEFAULT_RECOVERY_AGE_MS = 30 * 60_000;
export const EDGE_PAPER_ENTRY_JOURNAL_COMPACTION_VERSION =
  'EDGE_PAPER_ENTRY_JOURNAL_COMPACTION_V1_TERMINAL_ARCHIVE_20260903';

function safeIso(value = Date.now()) {
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return new Date(Number.isFinite(parsed) ? parsed : Date.now()).toISOString();
}

export async function appendEdgePaperEntryJournal(filePath, event, tradeOrId, extra = {}) {
  const trade = tradeOrId && typeof tradeOrId === 'object' ? tradeOrId : null;
  const paperTradeId = String(trade?.id ?? tradeOrId ?? '').trim();
  if (!paperTradeId) throw new Error('edge paper journal requires paperTradeId');
  const row = {
    version: EDGE_PAPER_ENTRY_JOURNAL_VERSION,
    event: String(event ?? '').toUpperCase(),
    at: safeIso(),
    paperTradeId,
    trade: trade ? structuredClone(trade) : null,
    ...extra,
  };
  const handle = await open(filePath, 'a');
  try {
    await handle.writeFile(`${JSON.stringify(row)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return row;
}

export async function readLatestEdgePaperJournalRecords(filePath) {
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const latest = new Map();
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const paperTradeId = String(row?.paperTradeId ?? row?.trade?.id ?? '').trim();
        if (!paperTradeId || row?.version !== EDGE_PAPER_ENTRY_JOURNAL_VERSION) continue;
        latest.set(paperTradeId, row);
      } catch {
        // A partial final line after a hard crash must not invalidate older durable rows.
      }
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return new Map();
    throw error;
  } finally {
    lines.close();
    input.destroy();
  }
  return latest;
}

export function recoverEdgePaperTradesFromJournal(store, latestRecords, {
  now = Date.now(),
  maxPreparedAgeMs = EDGE_PAPER_ENTRY_JOURNAL_DEFAULT_RECOVERY_AGE_MS,
} = {}) {
  const trades = Array.isArray(store?.trades) ? [...store.trades] : [];
  const existingIds = new Set(trades.map((trade) => String(trade?.id ?? '')));
  const recoveredIds = [];
  for (const [paperTradeId, row] of latestRecords ?? []) {
    // COMMITTED means the row was already persisted successfully. If it is no
    // longer in the hot store, it may have been CLOSED and moved to archive;
    // resurrecting it would turn historical trades back into OPEN positions.
    // Only PREPARED represents the crash window before the durable store write.
    if (row?.event !== 'PREPARED' || !row?.trade || row.trade.id !== paperTradeId) continue;
    const preparedAt = Date.parse(row?.at ?? '');
    if (!Number.isFinite(preparedAt)
        || now - preparedAt < 0
        || now - preparedAt > Math.max(1_000, Number(maxPreparedAgeMs) || 0)) continue;
    if (existingIds.has(paperTradeId)) continue;
    trades.unshift(row.trade);
    recoveredIds.push(paperTradeId);
    existingIds.add(paperTradeId);
  }
  return {
    store: { ...(store && typeof store === 'object' ? store : {}), trades },
    recoveredIds,
  };
}

export async function compactEdgePaperEntryJournal(filePath, latestRecords, {
  archiveDir = join(dirname(filePath), 'archive'),
  maxBytes = 64 * 1024 * 1024,
  now = Date.now(),
  maxPreparedAgeMs = EDGE_PAPER_ENTRY_JOURNAL_DEFAULT_RECOVERY_AGE_MS,
} = {}) {
  const info = await stat(filePath).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (!info || info.size <= Math.max(1, Number(maxBytes) || 0)) {
    return { changed: false, sourceBytes: info?.size ?? 0, retainedRows: 0, archiveFile: null };
  }
  const retained = [];
  for (const row of latestRecords?.values?.() ?? []) {
    if (row?.event !== 'PREPARED') continue;
    const preparedAt = Date.parse(row?.at ?? '');
    if (!Number.isFinite(preparedAt) || now - preparedAt < 0
        || now - preparedAt > Math.max(1_000, Number(maxPreparedAgeMs) || 0)) continue;
    retained.push(row);
  }
  await mkdir(archiveDir, { recursive: true });
  const stamp = new Date(now).toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const archiveFile = join(archiveDir, `edge-paper-entry-journal-${stamp}.ndjson`);
  const temporaryFile = `${filePath}.${process.pid}.compact.tmp`;
  await copyFile(filePath, archiveFile);
  await writeFile(
    temporaryFile,
    retained.length ? `${retained.map((row) => JSON.stringify(row)).join('\n')}\n` : '',
    'utf8',
  );
  await rename(temporaryFile, filePath);
  return {
    version: EDGE_PAPER_ENTRY_JOURNAL_COMPACTION_VERSION,
    changed: true,
    sourceBytes: info.size,
    retainedRows: retained.length,
    archiveFile,
  };
}
