import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { processRecommendedSourceOpenEvent } from '../src/recommendedSignals.js';

const execFileAsync = promisify(execFile);
const root = new URL('..', import.meta.url).pathname;
const temp = await mkdtemp(join(tmpdir(), 'recommended-ml-'));
const paperFile = join(temp, 'paper.json');

function trade({ id, hour, combo, side, roe, pnl, mode = 'INDEPENDENT_SOCKET_V2' }) {
  const opened = new Date(Date.UTC(2026, 6, 20, hour, id % 50));
  const closed = new Date(opened.getTime() + 10 * 60_000);
  return {
    id: `recommended-${id}`,
    sourceTradeId: `source-${id}`,
    paperMode: mode,
    sourcePage: 'ema',
    recommendationCombo: combo,
    recommendationBtcPhase: combo.includes('DOWN') ? 'BTC_DOWN_MID' : 'BTC_UP_MID',
    side,
    scoreBucket: 'SCORE_80_89',
    status: 'CLOSED',
    roe,
    pnl,
    outcome: roe < 0 ? 'RECOMMENDED_SL_16' : 'TP',
    openedAt: opened.toISOString(),
    closedAt: closed.toISOString(),
  };
}

const goodCombo = 'SQUEEZE_SHORT | SHORT | 15M | BTC_CORR_THEO | BTC_DOWN_MID | THEO_YEU';
const riskCombo = 'RUNNER | LONG | 15M | BTC_CORR_THEO | BTC_UP_MID | THEO_YEU';
const trades = [];
for (let i = 0; i < 10; i += 1) trades.push(trade({ id: i + 1, hour: i, combo: goodCombo, side: 'SHORT', roe: 8, pnl: 0.8 }));
for (let i = 0; i < 10; i += 1) trades.push(trade({ id: i + 101, hour: i, combo: riskCombo, side: 'LONG', roe: -16, pnl: -1.6 }));
trades.push(trade({ id: 999, hour: 1, combo: goodCombo, side: 'SHORT', roe: 100, pnl: 100, mode: 'LEGACY_CLONE' }));
await writeFile(paperFile, JSON.stringify({ version: 2, trades }, null, 2));
const before = await readFile(paperFile, 'utf8');
const signals = [
  { id: 'good', page: 'ema', combo: goodCombo, signalType: 'SQUEEZE_SHORT', side: 'SHORT', timeframe: '15M', btcPhase: 'BTC_DOWN_MID', relation: 'THEO_YEU', scoreBucket: 'SCORE_80_89' },
  { id: 'risk', page: 'ema', combo: riskCombo, signalType: 'RUNNER', side: 'LONG', timeframe: '15M', btcPhase: 'BTC_UP_MID', relation: 'THEO_YEU', scoreBucket: 'SCORE_80_89' },
  { id: 'sparse', page: 'pump', combo: 'PUMP | LONG | 5M', signalType: 'PUMP', side: 'LONG', timeframe: '5M', btcPhase: 'BTC_UP_WEAK' },
  { id: 'broad', page: 'ema', combo: 'UNSEEN | LONG | 1H', signalType: 'UNSEEN', side: 'LONG', timeframe: '1H', btcPhase: 'BTC_FLAT' },
];

try {
  const { stdout } = await execFileAsync('python3', [
    join(root, 'scripts', 'recommended_signal_learning.py'),
    '--paper-file', paperFile,
    '--signals-json', JSON.stringify(signals),
    '--lookback-days', '5000',
    '--min-samples', '8',
    '--valid-from', '2026-07-20T00:00:00Z',
  ]);
  const result = JSON.parse(stdout);
  const flags = new Map(result.signalFlags.map((flag) => [flag.id, flag]));
  assert.equal(result.mode, 'ANALYSIS_ONLY');
  assert.equal(result.training.closedSamples, 20);
  assert.equal(result.training.excluded.paperMode, 1);
  assert.equal(flags.get('good').label, 'PY GOOD');
  assert.equal(flags.get('risk').label, 'PY RISK');
  assert.equal(flags.get('sparse').label, 'PY PRIOR WATCH');
  assert.equal(flags.get('broad').label, 'PY WATCH');
  assert.equal(flags.get('broad').groupLevel, 'PAGE_SIDE');
  assert.ok(flags.get('broad').confidence <= 55);
  assert.equal(result.tradeFlags['recommended-1'].label, 'PY PRIOR WATCH');
  assert.equal(result.tradeFlags['recommended-10'].label, 'PY GOOD');
  assert.equal(await readFile(paperFile, 'utf8'), before, 'model must not write paper data');

  const directPaperFile = join(temp, 'direct-event-paper.json');
  await writeFile(directPaperFile, JSON.stringify({ version: 3, trades: [] }));
  const now = new Date();
  const activeDay = now.toISOString().slice(0, 10);
  const sourceTrade = {
    id: 'source-event-1', source: 'pump-native', symbol: 'LIVEUSDT', side: 'LONG',
    status: 'OPEN', marginUsdt: 10, leverage: 10, entryPrice: 100,
    combo: 'PUMP | LONG | 15M | BTC_UP_MID', signalType: 'PUMP',
    btcHealth: { btcTrendDir: 'up', btcTrendScore: 55 },
    createdAt: now.toISOString(), openedAt: now.toISOString(),
  };
  const directCatalog = {
    selectedDay: activeDay,
    basedOnDateUtc: '2026-07-20',
    recommendations: [{
      id: 'rec-live', page: 'pump', btcPhase: 'BTC_UP_MID',
      combo: sourceTrade.combo, signalType: 'PUMP', side: 'LONG', timeframe: '15M',
      strength: 'STRONG', matchedWindows: [7, 30],
      bestSample: { closed: 20, win: 18, loss: 2, wr: 90, avgRoe: 5, pnl: 10 },
    }],
  };
  const direct = await processRecommendedSourceOpenEvent({
    page: 'pump', trade: sourceTrade,
    marketEntry: { price: 100.1, at: Date.now(), source: 'pump-source-open-event' },
    catalogOverride: directCatalog, paperFileOverride: directPaperFile,
  });
  assert.equal(direct.created, true);
  assert.equal(direct.trade.entryPrice, 100.1);
  assert.equal(direct.trade.sourceEntryPrice, 100);
  assert.equal(direct.trade.recommendedEntryMode, 'SOURCE_OPEN_EVENT_V3');
  assert.ok(direct.trade.sourceEventLatencyMs < 2_000);
  assert.equal(direct.trade.marketEntrySource, 'pump-source-open-event');
  assert.ok(Math.abs(direct.trade.entryVsSourcePct - 0.1) < 0.00001);
  const duplicate = await processRecommendedSourceOpenEvent({
    page: 'pump', trade: sourceTrade,
    marketEntry: { price: 100.1, at: Date.now(), source: 'pump-source-open-event' },
    catalogOverride: directCatalog, paperFileOverride: directPaperFile,
  });
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.reason, 'ALREADY_CLONED');
  const directStore = JSON.parse(await readFile(directPaperFile, 'utf8'));
  assert.equal(directStore.trades.length, 1);

  const pendingFilledAt = new Date();
  const filledTrade = {
    ...sourceTrade,
    id: 'source-event-filled',
    symbol: 'FILLEDUSDT',
    createdAt: new Date(pendingFilledAt.getTime() - 60 * 60_000).toISOString(),
    openedAt: pendingFilledAt.toISOString(),
  };
  const filled = await processRecommendedSourceOpenEvent({
    page: 'pump', trade: filledTrade,
    marketEntry: { price: 100.1, at: Date.now(), source: 'pump-fill-socket-event' },
    catalogOverride: directCatalog, paperFileOverride: directPaperFile,
  });
  assert.equal(filled.created, true, 'pending age must start at socket fill/openedAt, not old createdAt');
  assert.ok(filled.trade.sourceEventLatencyMs < 2_000);

  const delayedMetadataTrade = {
    ...sourceTrade,
    id: 'source-event-delayed-metadata',
    symbol: 'DELAYEDUSDT',
    createdAt: new Date(Date.now() - 90_000).toISOString(),
    openedAt: new Date(Date.now() - 90_000).toISOString(),
  };
  const delayedReceivedAt = Date.now();
  const delayedDirect = await processRecommendedSourceOpenEvent({
    page: 'pump', trade: delayedMetadataTrade,
    marketEntry: {
      price: 100.1,
      at: delayedReceivedAt,
      receivedAt: delayedReceivedAt,
      source: 'pump-socket',
    },
    catalogOverride: directCatalog, paperFileOverride: directPaperFile,
  });
  assert.equal(delayedDirect.created, true, 'direct receipt time must win over delayed source metadata');
  assert.ok(delayedDirect.trade.sourceEventLatencyMs < 2_000);

  const staleWithoutReceipt = await processRecommendedSourceOpenEvent({
    page: 'pump',
    trade: { ...delayedMetadataTrade, id: 'source-event-truly-stale', symbol: 'STALEUSDT' },
    marketEntry: { price: 100.1, at: Date.now(), source: 'legacy-call' },
    catalogOverride: directCatalog, paperFileOverride: directPaperFile,
  });
  assert.equal(staleWithoutReceipt.created, false);
  assert.equal(staleWithoutReceipt.reason, 'SOURCE_EVENT_STALE');

  const oldBreakout = await processRecommendedSourceOpenEvent({
    page: 'pump',
    trade: { ...sourceTrade, id: 'source-event-old', source: 'emasq-15m-breakout', breakoutAge: 4 },
    marketEntry: { price: 100.1, at: Date.now(), source: 'ema-source-open-event' },
    catalogOverride: directCatalog, paperFileOverride: directPaperFile,
  });
  assert.equal(oldBreakout.created, false);
  assert.equal(oldBreakout.reason, 'BREAKOUT_TOO_OLD');
  assert.equal((JSON.parse(await readFile(directPaperFile, 'utf8'))).trades.length, 3);
  console.log('recommended signal learning tests: OK');
} finally {
  await rm(temp, { recursive: true, force: true });
}
