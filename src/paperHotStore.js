export const PAPER_HOT_STORE_VERSION = 'PAPER_HOT_STORE_V1_ACTIVE_PLUS_RECENT_CLOSED_20260903';

export function isClosedPaperTrade(trade) {
  return String(trade?.status ?? '').toUpperCase() === 'CLOSED';
}

export function isTerminalPaperTrade(trade) {
  return ['CLOSED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(
    String(trade?.status ?? '').toUpperCase(),
  );
}

export function partitionPaperHotRows(trades = [], maxRows = 1_000) {
  const rows = Array.isArray(trades) ? trades : [];
  const limit = Math.max(1, Math.floor(Number(maxRows) || 1_000));
  const protectedRows = rows.reduce((count, trade) => count + (isTerminalPaperTrade(trade) ? 0 : 1), 0);
  const closedBudget = Math.max(0, limit - protectedRows);
  let keptClosed = 0;
  const hotRows = [];
  const archiveRows = [];

  for (const trade of rows) {
    if (!isTerminalPaperTrade(trade)) {
      hotRows.push(trade);
      continue;
    }
    if (keptClosed < closedBudget) {
      hotRows.push(trade);
      keptClosed += 1;
    } else {
      archiveRows.push(trade);
    }
  }

  return {
    version: PAPER_HOT_STORE_VERSION,
    maxRows: limit,
    protectedRows,
    keptClosedRows: keptClosed,
    hotRows,
    archiveRows,
  };
}

export function applyPaperHotStorePartition(store = {}, partition, {
  compactedAt = new Date().toISOString(),
  archiveFile = null,
} = {}) {
  const previousArchived = Math.max(0, Number(store?.hotStore?.archivedRows ?? 0) || 0);
  store.trades = partition.hotRows;
  store.hotStore = {
    version: PAPER_HOT_STORE_VERSION,
    compactedAt,
    maxRows: partition.maxRows,
    hotRows: partition.hotRows.length,
    protectedRows: partition.protectedRows,
    archivedRows: previousArchived + partition.archiveRows.length,
    archiveFile,
  };
  return store;
}
