#!/usr/bin/env node

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { finished } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/env.js';
import {
  PAPER_HOT_STORE_VERSION,
  applyPaperHotStorePartition,
  partitionPaperHotRows,
} from '../src/paperHotStore.js';

loadEnv();
const rootDir = fileURLToPath(new URL('..', import.meta.url));
const dryRun = process.argv.includes('--dry-run');
const requested = new Set(process.argv.slice(2).filter((arg) => !arg.startsWith('--')));
const targets = [
  {
    name: 'liquid',
    sourceFile: join(rootDir, 'data', 'liquid-paper-trades.json'),
    archiveFile: join(rootDir, 'data', 'archive', 'liquid-paper-trades.ndjson'),
    maxRows: Math.max(1_000, Number(process.env.LIQUID_PAPER_MAX_HOT_ROWS ?? 1_000)),
  },
  {
    name: 'edge',
    sourceFile: join(rootDir, 'data', 'edge-paper-trades.json'),
    archiveFile: join(rootDir, 'data', 'archive', 'edge-paper-trades.ndjson'),
    maxRows: Math.max(1_000, Number(process.env.EDGE_PAPER_MAX_HOT_ROWS ?? 1_000)),
    reconcileArchiveIds: true,
  },
  {
    name: 'pump',
    sourceFile: join(rootDir, 'data', 'pump-paper-trades.json'),
    archiveFile: join(rootDir, 'data', 'archive', 'pump-paper-trades.ndjson'),
    maxRows: Math.max(1_000, Number(process.env.PUMP_PAPER_MAX_ACTIVE_ROWS ?? 1_000)),
  },
].filter((target) => requested.size === 0 || requested.has(target.name));

async function writeRows(filePath, rows, { append = false } = {}) {
  await mkdir(dirname(filePath), { recursive: true });
  const output = createWriteStream(filePath, { encoding: 'utf8', flags: append ? 'a' : 'w' });
  try {
    for (let index = 0; index < rows.length; index += 100) {
      const chunk = `${rows.slice(index, index + 100).map((row) => JSON.stringify(row)).join('\n')}\n`;
      if (!output.write(chunk)) await new Promise((resolve, reject) => {
        const cleanup = () => {
          output.off('drain', onDrain);
          output.off('error', onError);
        };
        const onDrain = () => {
          cleanup();
          resolve();
        };
        const onError = (error) => {
          cleanup();
          reject(error);
        };
        output.once('drain', onDrain);
        output.once('error', onError);
      });
    }
    output.end();
    await finished(output);
  } catch (error) {
    output.destroy(error);
    throw error;
  }
}

async function readArchiveTradeIds(filePath) {
  const ids = new Set();
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const id = String(row?.id ?? '').trim();
        if (id) ids.add(id);
      } catch {
        // Ignore a partial final line; prior archive rows remain valid.
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  } finally {
    lines.close();
    input.destroy();
  }
  return ids;
}

async function writeStore(filePath, store) {
  const output = createWriteStream(filePath, { encoding: 'utf8', flags: 'w' });
  try {
    const metadata = Object.entries(store).filter(([key]) => key !== 'trades');
    output.write('{');
    for (const [key, value] of metadata) {
      output.write(`${JSON.stringify(key)}:${JSON.stringify(value)},`);
    }
    output.write('"trades":[');
    for (let index = 0; index < store.trades.length; index += 100) {
      const chunk = store.trades.slice(index, index + 100).map((row) => JSON.stringify(row)).join(',');
      if (!output.write(`${index > 0 ? ',' : ''}${chunk}`)) {
        await new Promise((resolve, reject) => {
          const cleanup = () => {
            output.off('drain', onDrain);
            output.off('error', onError);
          };
          const onDrain = () => {
            cleanup();
            resolve();
          };
          const onError = (error) => {
            cleanup();
            reject(error);
          };
          output.once('drain', onDrain);
          output.once('error', onError);
        });
      }
    }
    output.end(']}');
    await finished(output);
  } catch (error) {
    output.destroy(error);
    throw error;
  }
}

for (const target of targets) {
  const sourceStat = await stat(target.sourceFile);
  let raw = await readFile(target.sourceFile, 'utf8');
  const store = JSON.parse(raw);
  raw = null;
  if (!Array.isArray(store?.trades)) throw new Error(`${target.name}: invalid trades store`);
  const originalRows = store.trades.length;
  let reconciledArchiveRows = 0;
  if (target.reconcileArchiveIds) {
    const archivedIds = await readArchiveTradeIds(target.archiveFile);
    if (archivedIds.size) {
      store.trades = store.trades.filter((trade) => {
        const archived = archivedIds.has(String(trade?.id ?? ''));
        if (archived) reconciledArchiveRows += 1;
        return !archived;
      });
    }
  }
  const partition = partitionPaperHotRows(store.trades, target.maxRows);
  const summary = {
    version: PAPER_HOT_STORE_VERSION,
    target: target.name,
    dryRun,
    sourceMiB: Number((sourceStat.size / 1024 / 1024).toFixed(1)),
    originalRows,
    hotRows: partition.hotRows.length,
    protectedRows: partition.protectedRows,
    archivedRows: partition.archiveRows.length,
    reconciledArchiveRows,
    maxRows: target.maxRows,
  };
  const changed = partition.archiveRows.length > 0 || reconciledArchiveRows > 0;
  if (dryRun || !changed) {
    console.log(JSON.stringify({ ...summary, changed: false, wouldChange: dryRun ? changed : undefined }));
    global.gc?.();
    continue;
  }

  const compactedAt = new Date().toISOString();
  if (partition.archiveRows.length) {
    await writeRows(target.archiveFile, partition.archiveRows, { append: true });
  }
  applyPaperHotStorePartition(store, partition, {
    compactedAt,
    archiveFile: relative(rootDir, target.archiveFile).replaceAll('\\', '/'),
  });
  const temporaryFile = `${target.sourceFile}.${process.pid}.hot-store.tmp`;
  await writeStore(temporaryFile, store);
  const verification = JSON.parse(await readFile(temporaryFile, 'utf8'));
  if (!Array.isArray(verification?.trades) || verification.trades.length !== partition.hotRows.length) {
    throw new Error(`${target.name}: compacted file verification failed`);
  }
  await rename(temporaryFile, target.sourceFile);
  await writeFile(`${target.sourceFile}.hot-store.last.json`, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...summary, changed: true, archiveFile: target.archiveFile }));
  global.gc?.();
}
