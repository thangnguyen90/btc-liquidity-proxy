import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  COIN_LEVEL_EARLY_LONG_HISTORY_VERSION,
  CoinLevelEarlyLongHistory,
} from '../src/coinLevelEarlyLongHistory.js';
import { COIN_LEVEL_EARLY_LONG_WATCH_VERSION } from '../src/coinLevelEarlyLongWatch.js';

const directory = await mkdtemp(join(tmpdir(), 'coin-level-early-long-history-'));
try {
  const file = join(directory, 'history.json');
  const morning = Date.UTC(2026, 8, 22, 2, 0);
  const first = {
    version: COIN_LEVEL_EARLY_LONG_WATCH_VERSION,
    symbol: 'FIRSTUSDT', side: 'LONG', observedAt: morning,
    watchOnly: true, binanceEligible: false, earlyScore: 72,
  };
  const history = new CoinLevelEarlyLongHistory({ file, now: () => morning });
  let rows = await history.record([first], morning);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].symbol, 'FIRSTUSDT');
  rows = await history.record([first], morning + 30_000);
  assert.equal(rows.length, 1, 'same symbol/candle must be deduped');
  await history.record([{ ...first, symbol: 'IGNOREUSDT', watchOnly: false }], morning + 60_000);
  assert.equal(history.list(morning).length, 1, 'non-observe records must not enter history');

  const reloaded = new CoinLevelEarlyLongHistory({ file, now: () => morning + 120_000 });
  await reloaded.load();
  assert.equal(reloaded.list(morning + 120_000).length, 1, 'history must survive process reload');
  const state = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(state.version, COIN_LEVEL_EARLY_LONG_HISTORY_VERSION);

  const nextVnDay = Date.UTC(2026, 8, 22, 17, 1);
  rows = await reloaded.record([{ ...first, symbol: 'NEXTUSDT', observedAt: nextVnDay }], nextVnDay);
  assert.equal(rows.length, 1, 'new Vietnam day must reset the visible daily history');
  assert.equal(rows[0].symbol, 'NEXTUSDT');
} finally {
  await rm(directory, { recursive: true, force: true });
}

const [server, ui] = await Promise.all([
  readFile(new URL('../src/server.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.js', import.meta.url), 'utf8'),
]);
assert.match(server, /coinLevelEarlyLongHistory\.record/);
assert.match(server, /earlyLongHistory:/);
assert.match(server, /totalEarlyLongHistory:/);
assert.match(ui, /data\.earlyLongHistory/);
assert.match(ui, /Lịch sử hôm nay/);
assert.match(ui, /historyWatches\.filter\(\(item\) => item\.liveNow !== false\)/,
  'default LONG table must only show currently active history rows');
assert.match(ui, /showEarlyLongHistory \? historyWatches : currentWatches/);
assert.match(ui, /early-long-history-toggle/);
console.log('Coin Level early LONG daily history: durable dedupe and Vietnam-day rollover: OK');
