import { open, readFile } from 'node:fs/promises';

export const EDGE_PAPER_ENTRY_JOURNAL_VERSION = 'EDGE_PAPER_ENTRY_JOURNAL_V1_2026_08_05';

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
  let raw = '';
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return new Map();
    throw error;
  }
  const latest = new Map();
  for (const line of raw.split(/\r?\n/)) {
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
  return latest;
}

export function recoverEdgePaperTradesFromJournal(store, latestRecords) {
  const trades = Array.isArray(store?.trades) ? [...store.trades] : [];
  const indexById = new Map(trades.map((trade, index) => [String(trade?.id ?? ''), index]));
  const recoveredIds = [];
  for (const [paperTradeId, row] of latestRecords ?? []) {
    if (row?.event === 'DELETED' || !row?.trade || row.trade.id !== paperTradeId) continue;
    const existingIndex = indexById.get(paperTradeId);
    if (existingIndex == null) {
      trades.unshift(row.trade);
      recoveredIds.push(paperTradeId);
      indexById.clear();
      trades.forEach((trade, index) => indexById.set(String(trade?.id ?? ''), index));
      continue;
    }
    const existing = trades[existingIndex];
    if (String(existing?.status ?? '').toUpperCase() === 'CLOSED') continue;
    const existingAt = Date.parse(existing?.liveCardAttemptedAt ?? existing?.openedAt ?? existing?.createdAt ?? '') || 0;
    const journalAt = Date.parse(row?.trade?.liveCardAttemptedAt ?? row?.trade?.openedAt ?? row?.trade?.createdAt ?? '') || 0;
    if (journalAt >= existingAt && JSON.stringify(existing) !== JSON.stringify(row.trade)) {
      trades[existingIndex] = row.trade;
      recoveredIds.push(paperTradeId);
    }
  }
  return {
    store: { ...(store && typeof store === 'object' ? store : {}), trades },
    recoveredIds,
  };
}
