#!/usr/bin/env node

import { copyFile, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const targetFile = join(rootDir, 'data', 'pump-paper-trades.json');
const historyFile = process.argv[2];
if (!historyFile) throw new Error('Usage: restore-pump-paper-history.mjs <full-history-backup>');

const [currentRaw, historyRaw] = await Promise.all([
  readFile(targetFile, 'utf8'),
  readFile(historyFile, 'utf8'),
]);
const current = JSON.parse(currentRaw);
const history = JSON.parse(historyRaw);
const merged = new Map();
for (const trade of [...(current.trades ?? []), ...(history.trades ?? [])]) {
  const key = String(trade?.id ?? trade?.signalId ?? '').trim();
  if (!key || merged.has(key)) continue;
  merged.set(key, trade);
}
const trades = [...merged.values()].sort((left, right) =>
  Date.parse(right.createdAt ?? right.openedAt ?? 0)
  - Date.parse(left.createdAt ?? left.openedAt ?? 0));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const currentBackup = `${targetFile}.before-full-restore-${stamp}.bak`;
const tmpFile = `${targetFile}.${process.pid}.restore.tmp`;
await copyFile(targetFile, currentBackup);
await writeFile(tmpFile, JSON.stringify({ ...history, ...current, trades }), 'utf8');
await rename(tmpFile, targetFile);
console.log(JSON.stringify({
  currentRows: current.trades?.length ?? 0,
  historyRows: history.trades?.length ?? 0,
  restoredRows: trades.length,
  currentBackup,
}));
