#!/usr/bin/env node

import { appendFile, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const sourceFile = join(rootDir, 'data', 'pump-paper-trades.json');
const archiveFile = join(rootDir, 'data', 'archive', 'pump-paper-trades.ndjson');
const maxRows = Math.max(5_000, Number(process.argv[2] ?? 25_000));
const raw = await readFile(sourceFile, 'utf8');
const store = JSON.parse(raw);
const trades = Array.isArray(store?.trades) ? store.trades : [];
if (trades.length <= maxRows) {
  console.log(JSON.stringify({ changed: false, rows: trades.length, maxRows }));
  process.exit(0);
}

const active = trades.slice(0, maxRows);
const archived = trades.slice(maxRows);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = `${sourceFile}.before-archive-${stamp}.bak`;
const tmpFile = `${sourceFile}.${process.pid}.compact.tmp`;
await mkdir(dirname(archiveFile), { recursive: true });
await copyFile(sourceFile, backupFile);
await appendFile(archiveFile, `${archived.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
await writeFile(tmpFile, JSON.stringify({ ...store, trades: active }), 'utf8');
await rename(tmpFile, sourceFile);
console.log(JSON.stringify({
  changed: true,
  originalRows: trades.length,
  activeRows: active.length,
  archivedRows: archived.length,
  backupFile,
  archiveFile,
}));