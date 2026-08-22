import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';

export const PUMP_PAPER_WAL_STREAM_VERSION = 'PUMP_PAPER_WAL_COMPACT_STREAM_V3_20260822';

export function compactPumpPaperTradeForStorage(trade) {
  if (!trade || typeof trade !== 'object' || Array.isArray(trade)) return trade;
  return Object.fromEntries(
    Object.entries(trade).filter(([, value]) => value !== null && value !== undefined),
  );
}

export async function replayPumpPaperWalFile(store, filePath, { maxRows = Number.POSITIVE_INFINITY } = {}) {
  let walBytes = 0;
  try {
    walBytes = Number((await stat(filePath)).size ?? 0);
  } catch (error) {
    if (error?.code === 'ENOENT') return { applied: 0, skipped: 0, walBytes: 0, evicted: 0 };
    throw error;
  }
  if (walBytes === 0) return { applied: 0, skipped: 0, walBytes: 0, evicted: 0 };

  // Keep the existing array and update it in place. The previous implementation
  // loaded the whole WAL into one UTF-8 string and copied the base array, which
  // could require several GB of transient heap for a large production journal.
  const baseRows = Array.isArray(store?.trades) ? store.trades : [];
  const firstIndexById = new Map();
  for (let index = 0; index < baseRows.length; index += 1) {
    const id = String(baseRows[index]?.id ?? '');
    if (id && !firstIndexById.has(id)) firstIndexById.set(id, index);
  }

  const deletedBaseIds = new Set();
  const newById = new Map();
  const newOrder = [];
  const newOrderSet = new Set();
  const boundedRows = Number.isFinite(Number(maxRows))
    ? Math.max(1, Math.floor(Number(maxRows)))
    : Number.POSITIVE_INFINITY;
  let newOrderStart = 0;
  let evicted = 0;
  let applied = 0;
  let skipped = 0;
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });

  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        const id = String(event?.id ?? event?.trade?.id ?? '');
        if (!id) {
          skipped += 1;
          continue;
        }
        if (event.op === 'DELETE') {
          deletedBaseIds.add(id);
          newById.delete(id);
          applied += 1;
          continue;
        }
        if (event.op !== 'UPSERT' || !event.trade || typeof event.trade !== 'object') {
          skipped += 1;
          continue;
        }
        const baseIndex = firstIndexById.get(id);
        if (baseIndex != null && !deletedBaseIds.has(id)) {
          baseRows[baseIndex] = event.trade;
        } else {
          if (!newOrderSet.has(id)) {
            newOrder.push(id);
            newOrderSet.add(id);
            newById.set(id, event.trade);
            while (newOrder.length - newOrderStart > boundedRows) {
              const evictedId = newOrder[newOrderStart];
              newOrderStart += 1;
              newOrderSet.delete(evictedId);
              if (newById.delete(evictedId)) evicted += 1;
            }
            if (
              Number.isFinite(boundedRows)
              && newOrderStart >= boundedRows
              && newOrderStart * 2 >= newOrder.length
            ) {
              newOrder.splice(0, newOrderStart);
              newOrderStart = 0;
            }
          } else if (newById.has(id)) {
            newById.set(id, event.trade);
          }
        }
        applied += 1;
      } catch {
        // A crash may truncate only the final append. Older valid lines remain
        // usable and the skipped line will be removed by the next checkpoint.
        skipped += 1;
      }
    }
  } finally {
    lines.close();
    input.destroy();
  }

  const addedRows = newOrder
    .slice(newOrderStart)
    .reverse()
    .filter((id) => newById.has(id))
    .map((id) => newById.get(id));
  const merged = deletedBaseIds.size === 0 && addedRows.length === 0
    ? baseRows
    : [
      ...addedRows,
      ...baseRows.filter((trade) => !deletedBaseIds.has(String(trade?.id ?? ''))),
    ];
  store.trades = Number.isFinite(boundedRows) ? merged.slice(0, boundedRows) : merged;
  return { applied, skipped, walBytes, evicted };
}
