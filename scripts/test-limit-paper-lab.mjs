import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LIMIT_PAPER_LAB_VERSION, LimitPaperLab } from '../src/limitPaperLab.js';

const directory = await mkdtemp(join(tmpdir(), 'limit-paper-lab-'));
let now = 1_000_000;
const prices = new Map();
let subscribed = [];
const lab = new LimitPaperLab({
  file: join(directory, 'lab.json'),
  now: () => now,
  getPrice: (symbol) => prices.get(symbol) ?? null,
  onSymbolsChanged: (symbols) => { subscribed = symbols; },
});

try {
  const observed = await lab.observe({
    source: 'ema99-observe-only',
    streamId: 'ema99-retest',
    label: 'NEAR_RECLAIM_LONG_WATCH',
    symbol: 'TESTUSDT',
    side: 'LONG',
    interval: '5m',
    signalPrice: 100,
    signalAt: now,
    atrPct: 2,
    referencePrice: 98.5,
    binanceSkipStatus: 'OFF',
    dedupeKey: 'TEST|5m|1',
  });
  assert.equal(observed.status, 'recorded');
  assert.equal(observed.candidates, 4);
  assert.deepEqual(subscribed, ['TESTUSDT']);
  assert.equal((await lab.observe({
    source: 'ema99-observe-only', streamId: 'ema99-retest', label: 'NEAR_RECLAIM_LONG_WATCH',
    symbol: 'TESTUSDT', side: 'LONG', interval: '5m', signalPrice: 100,
    signalAt: now, atrPct: 2, dedupeKey: 'TEST|5m|1',
  })).status, 'deduped');

  now += 1_000;
  prices.set('TESTUSDT', 99.2);
  assert.equal((await lab.handlePriceTick({ symbol: 'TESTUSDT', markPrice: 99.2, eventTime: now })).changed, 1);
  let snapshot = await lab.snapshot();
  assert.equal(snapshot.version, LIMIT_PAPER_LAB_VERSION);
  assert.equal(snapshot.summary.openPaper, 1);
  assert.equal(snapshot.groups[0].candidates.find((row) => row.key === 'SHALLOW').filled, 1);

  now += 1_000;
  prices.set('TESTUSDT', 102);
  assert.equal((await lab.handlePriceTick({ symbol: 'TESTUSDT', markPrice: 102, eventTime: now })).changed, 1);
  snapshot = await lab.snapshot();
  assert.equal(snapshot.summary.closedPaper, 1);
  const shallow = snapshot.groups[0].candidates.find((row) => row.key === 'SHALLOW');
  assert.equal(shallow.wins, 1);
  assert.equal(shallow.netRoePct, 10);

  now += 60 * 60_000;
  prices.set('TESTUSDT', 101);
  await lab.handlePriceTick({ symbol: 'TESTUSDT', markPrice: 101, eventTime: now });
  snapshot = await lab.snapshot();
  assert.equal(snapshot.summary.pendingLimits, 0);
  assert.equal(snapshot.summary.missedLimits, 3);
  assert.equal(snapshot.groups[0].recommendation.confidence, 'COLLECTING');

  const restored = new LimitPaperLab({ file: join(directory, 'lab.json') });
  assert.equal((await restored.snapshot()).summary.signals, 1);
  console.log('test-limit-paper-lab: ok');
} finally {
  await rm(directory, { recursive: true, force: true });
}
