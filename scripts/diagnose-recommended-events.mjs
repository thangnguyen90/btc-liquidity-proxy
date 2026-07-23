import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRecommendedSignals, processRecommendedSourceOpenEvent } from '../src/recommendedSignals.js';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const since = Date.parse(process.argv[2] || '2026-07-21T05:02:25.326Z');
const tempPaper = join(root, 'data', `.recommended-diagnose-${process.pid}.json`);
const sources = [
  ['pump', 'data/pump-paper-trades.json'],
  ['edge', 'data/edge-paper-trades.json'],
  ['liquid', 'data/liquid-paper-trades.json'],
];

function sourceTime(row) {
  return Date.parse(row.openedAt ?? row.createdAt ?? '');
}

function pageFor(sourcePage, row) {
  if (sourcePage !== 'pump') return sourcePage;
  const source = String(row.source ?? '');
  return source.startsWith('emasq-') || source.includes('ema-squeeze') || row.emaStageGateLabel
    ? 'ema'
    : 'pump';
}

const catalog = await getRecommendedSignals();
const rows = [];
for (const [sourcePage, relative] of sources) {
  const store = JSON.parse(await readFile(join(root, relative), 'utf8'));
  for (const row of store.trades ?? store ?? []) {
    if (!(sourceTime(row) > since)) continue;
    rows.push({ page: pageFor(sourcePage, row), row });
  }
}

const counts = new Map();
const examples = new Map();
try {
  for (const { page, row } of rows) {
    const now = Date.now();
    const entry = Number(row.fillPrice ?? row.entryPrice ?? row.entry);
    const synthetic = { ...row, status: 'OPEN', createdAt: new Date(now).toISOString(), openedAt: new Date(now).toISOString() };
    const result = await processRecommendedSourceOpenEvent({
      page,
      trade: synthetic,
      marketEntry: { price: entry, at: now, source: 'diagnostic' },
      catalogOverride: catalog,
      paperFileOverride: tempPaper,
    });
    const key = `${page}|${result.reason ?? 'NO_REASON'}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!examples.has(key)) examples.set(key, `${row.symbol ?? '-'} ${row.side ?? '-'} ${row.source ?? '-'}`);
  }
} finally {
  await rm(tempPaper, { force: true });
}

console.log(`Catalog day=${catalog.selectedDay} recommendations=${catalog.recommendations?.length ?? 0}`);
console.log(`Source rows after ${new Date(since).toISOString()}: ${rows.length}`);
console.table([...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => ({
  key,
  count,
  example: examples.get(key),
})));
