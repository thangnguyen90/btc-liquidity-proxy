import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LiveCardBinanceLifecycleStore,
  aggregateLiveCardBinanceStats,
  aggregateLiveCardHistoryOverview,
  aggregateLiveCardWhitelistStats,
  attachLiveCardPaperOriginals,
  classifyLiveCardSignalSource,
  entryFillMatchesLifecycle,
  reconcileLiveCardClosedPnl,
  safeBotClosePlan,
} from '../src/liveCardBinanceLifecycle.js';

const source = classifyLiveCardSignalSource('recommended', {
  sourcePage: 'edge',
  source: 'edge-short-auto',
});
assert.deepEqual(source, {
  executionPage: 'recommended',
  sourceType: 'recommended',
  originSourceType: 'short-edge',
  signalSource: 'edge-short-auto',
});

const lifecycle = {
  lifecycleId: 'life-1',
  symbol: 'BTCUSDT',
  side: 'SHORT',
  entryOrderId: 123,
  entryClientOrderId: 'lc_test',
  filledQty: 0.25,
};
assert.equal(entryFillMatchesLifecycle(lifecycle, { symbol: 'BTCUSDT', orderId: 123 }), true);
assert.equal(entryFillMatchesLifecycle(lifecycle, { symbol: 'BTCUSDT', clientOrderId: 'lc_test' }), true);
assert.equal(entryFillMatchesLifecycle(lifecycle, { symbol: 'ETHUSDT', orderId: 123 }), false);

assert.deepEqual(
  safeBotClosePlan(lifecycle, [{ symbol: 'BTCUSDT', positionAmt: '-0.4', positionSide: 'BOTH' }]),
  {
    allowed: true,
    reason: 'BOT_POSITION_MATCHED',
    symbol: 'BTCUSDT',
    quantity: 0.25,
    positionAmt: -0.4,
    positionSide: 'BOTH',
    closeSide: 'BUY',
  },
);
assert.equal(
  safeBotClosePlan(lifecycle, [{ symbol: 'BTCUSDT', positionAmt: '0.4', positionSide: 'BOTH' }]).reason,
  'POSITION_ALREADY_CLOSED',
);

const closedRows = [{
  lifecycleId: 'closed-1',
  status: 'POSITION_CLOSED',
  symbol: 'BTCUSDT',
  side: 'SHORT',
  matchedKeys: ['edge:combo:EARLY_DUMP', 'edge:live-health:OK'],
  entrySubmittedAt: '2026-08-04T01:00:00.000Z',
  entryFilledAt: '2026-08-04T01:00:01.000Z',
  positionClosedAt: '2026-08-04T01:10:00.000Z',
}];
const reconciled = reconcileLiveCardClosedPnl(closedRows, [
  { symbol: 'BTCUSDT', incomeType: 'COMMISSION', income: '-0.01', asset: 'USDT', time: Date.parse('2026-08-04T01:00:01.000Z') },
  { symbol: 'BTCUSDT', incomeType: 'REALIZED_PNL', income: '0.50', asset: 'USDT', time: Date.parse('2026-08-04T01:09:59.000Z') },
  { symbol: 'BTCUSDT', incomeType: 'COMMISSION', income: '-0.01', asset: 'USDT', time: Date.parse('2026-08-04T01:09:59.000Z') },
]);
assert.equal(reconciled[0].realizedIncomeCount, 1);
assert.equal(reconciled[0].net, 0.48);
const closedWin = {
  ...closedRows[0],
  paperTradeId: 'paper-win',
  sourceType: 'liquid',
  originSourceType: 'liquid',
  marginUsdt: 3,
  closedPnlKnown: true,
  closedPnlRealized: reconciled[0].realized,
  closedPnlCommission: reconciled[0].commission,
  closedPnlFunding: reconciled[0].funding,
  closedPnlNet: reconciled[0].net,
};
const closedLoss = {
  ...closedWin,
  lifecycleId: 'closed-2',
  paperTradeId: 'paper-loss',
  closedPnlRealized: -0.2,
  closedPnlCommission: -0.02,
  closedPnlFunding: 0,
  closedPnlNet: -0.22,
};
const paperMappedRows = attachLiveCardPaperOriginals([closedWin, closedLoss], {
  liquid: [
    { id: 'paper-win', symbol: 'BTCUSDT', side: 'SHORT', status: 'CLOSED', outcome: 'TP', pnl: 1.2, roe: 12 },
    { id: 'paper-loss', symbol: 'BTCUSDT', side: 'SHORT', status: 'CLOSED', outcome: 'SL', pnl: -0.4, roe: -4 },
  ],
});
assert.equal(paperMappedRows[0].paperOriginal.mappingStatus, 'MAPPED');
assert.equal(paperMappedRows[0].paperOriginal.outcome, 'TP');
const mismatchRows = attachLiveCardPaperOriginals([closedWin], {
  liquid: [{ id: 'paper-win', symbol: 'ETHUSDT', side: 'SHORT', status: 'CLOSED' }],
});
assert.equal(mismatchRows[0].paperOriginal.mappingStatus, 'IDENTITY_MISMATCH');

const whitelistStats = aggregateLiveCardWhitelistStats(paperMappedRows);
assert.equal(whitelistStats.length, 2);
assert.equal(whitelistStats[0].closed, 2);
assert.equal(whitelistStats[0].closedPnlNet, 0.26);
assert.equal(whitelistStats[0].wins, 1);
assert.equal(whitelistStats[0].losses, 1);
assert.equal(whitelistStats[0].winRate, 50);
assert.equal(Number(whitelistStats[0].profitFactor.toFixed(4)), 2.1818);
assert.equal(whitelistStats[0].avgClosedPnlNet, 0.13);
assert.equal(whitelistStats[0].paperCohort, 2);
assert.equal(whitelistStats[0].paperMapped, 2);
assert.equal(whitelistStats[0].paperClosed, 2);
assert.equal(whitelistStats[0].paperWinRate, 50);
assert.equal(Number(whitelistStats[0].paperProfitFactor.toFixed(4)), 3);
assert.equal(whitelistStats[0].paperAvgRoe, 4);
assert.equal(whitelistStats[0].sideStats.SHORT.closed, 2);
assert.equal(whitelistStats[0].sideStats.LONG, null);

const mixedSideStats = aggregateLiveCardWhitelistStats([
  ...paperMappedRows,
  {
    ...closedWin,
    lifecycleId: 'closed-long',
    side: 'LONG',
    matchedKeys: ['edge:live-health:OK'],
    closedPnlNet: 0.12,
    paperTradeId: 'paper-long-missing',
    paperOriginal: { mappingStatus: 'NOT_FOUND' },
  },
]);
const liveHealthMixed = mixedSideStats.find((row) => row.key === 'edge:live-health:OK');
assert.equal(liveHealthMixed.closed, 3);
assert.equal(liveHealthMixed.sideStats.SHORT.closed, 2);
assert.equal(liveHealthMixed.sideStats.LONG.closed, 1);
assert.equal(liveHealthMixed.sideStats.LONG.closedPnlNet, 0.12);

const historyOverview = aggregateLiveCardHistoryOverview([
  paperMappedRows[0],
  paperMappedRows[1],
  { lifecycleId: 'open-1', entryFilledAt: '2026-08-04T02:00:00.000Z', status: 'PROTECTED' },
  { lifecycleId: 'not-filled', status: 'ENTRY_PREPARING' },
]);
assert.equal(historyOverview.total, 4);
assert.equal(historyOverview.filled, 3);
assert.equal(historyOverview.active, 1);
assert.equal(historyOverview.closed, 2);
assert.equal(historyOverview.wins, 1);
assert.equal(historyOverview.losses, 1);
assert.equal(historyOverview.winRate, 50);
assert.equal(historyOverview.closedPnlNet, 0.26);
assert.equal(historyOverview.paperMapped, 2);
assert.equal(historyOverview.paperMissing, 1);
assert.equal(historyOverview.paperClosed, 2);

const dir = await mkdtemp(join(tmpdir(), 'live-card-life-'));
try {
  const stateFile = join(dir, 'state.json');
  const eventFile = join(dir, 'events.ndjson');
  const store = new LiveCardBinanceLifecycleStore({ stateFile, eventFile });
  await store.upsert({
    ...lifecycle,
    status: 'ENTRY_PREPARING',
    sourceType: 'recommended',
    originSourceType: 'short-edge',
    submittedQty: 0.25,
  }, 'ENTRY_REQUESTED');
  await store.markSubmitted({
    ...lifecycle,
    status: 'ENTRY_SUBMITTED',
    sourceType: 'recommended',
    originSourceType: 'short-edge',
    entrySubmittedAt: new Date().toISOString(),
    submittedQty: 0.25,
  });
  await store.recordFill({
    symbol: 'BTCUSDT',
    orderId: 123,
    clientOrderId: 'lc_test',
    cumulativeFilledQty: 0.25,
    filledQty: 0.25,
    avgPrice: 60000,
    fillTime: Date.now(),
    orderStatus: 'FILLED',
  });
  await store.markProtection('life-1', { placed: { tp: { algoId: 1 }, sl: { algoId: 2 } } });
  const claimed = await store.claimBotClose('life-1', { outcome: 'SL', reason: 'paper cut' });
  assert.equal(claimed.status, 'BOT_CLOSE_REQUESTED');
  await store.markBotClose('life-1', { orderId: 456, clientOrderId: 'close', quantity: 0.25 });
  assert.equal(await store.claimBotClose('life-1', { outcome: 'SL' }), null);
  const status = await store.status();
  assert.equal(status.executions[0].status, 'BOT_CLOSE_SUBMITTED');
  assert.equal(status.stats[0].filled, 1);
  assert.equal(status.stats[0].protected, 1);
  assert.equal(status.stats[0].botClosed, 1);
  const events = (await readFile(eventFile, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map((row) => row.eventType), [
    'ENTRY_REQUESTED',
    'ENTRY_SUBMITTED',
    'ENTRY_FILLED',
    'PROTECTION_APPLIED',
    'BOT_CLOSE_REQUESTED',
    'BOT_CLOSE_SUBMITTED',
  ]);

  await store.upsert({
    lifecycleId: 'life-race',
    symbol: 'ETHUSDT',
    side: 'LONG',
    status: 'ENTRY_PREPARING',
    entryClientOrderId: 'lc_race',
    sourceType: 'liquid',
    originSourceType: 'liquid',
  }, 'ENTRY_REQUESTED');
  await store.recordFill({
    symbol: 'ETHUSDT',
    clientOrderId: 'lc_race',
    cumulativeFilledQty: 1,
    filledQty: 1,
    avgPrice: 3000,
    fillTime: Date.now(),
    orderStatus: 'FILLED',
  });
  await store.markSubmitted({
    lifecycleId: 'life-race',
    symbol: 'ETHUSDT',
    side: 'LONG',
    status: 'ENTRY_SUBMITTED',
    entryOrderId: 999,
    entryClientOrderId: 'lc_race',
    entrySubmittedAt: new Date().toISOString(),
    sourceType: 'liquid',
    originSourceType: 'liquid',
  });
  assert.equal((await store.get('life-race')).status, 'ENTRY_FILLED');
} finally {
  await rm(dir, { recursive: true, force: true });
}

const stats = aggregateLiveCardBinanceStats([
  { sourceType: 'liquid', originSourceType: 'liquid', entrySubmittedAt: 'x', entryFilledAt: 'x' },
]);
assert.equal(stats[0].submitted, 1);
assert.equal(stats[0].filled, 1);

console.log('live-card Binance lifecycle tests passed');
