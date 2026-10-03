import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BINANCE_SIGNAL_ORDER_MANAGER_VERSION,
  buildBinanceSignalOrderManagerSnapshot,
} from '../src/binanceSignalOrderManager.js';

const record = (overrides = {}) => ({
  auditVersion: 'TEST',
  filledAt: '2026-10-03T01:00:00.000Z',
  orderId: String(overrides.orderId ?? 1),
  clientOrderId: `test_${overrides.orderId ?? 1}`,
  symbol: 'QNTUSDT',
  direction: 'LONG',
  orderSide: 'BUY',
  positionSide: 'BOTH',
  orderType: 'MARKET',
  orderStatus: 'FILLED',
  signalSource: 'local-ai-trend-evaluation',
  signalType: 'LOCAL_AI_PRIORITY_ENGINE_ZONE_TOUCH',
  signalLabel: 'AI PRIORITY',
  entryReason: 'priority signal reached engine zone',
  marginUsdt: 5,
  leverage: 5,
  filledQty: 0.1,
  avgFillPrice: 100,
  filledNotionalUsdt: 10,
  isDca: false,
  metadataQuality: 'RICH',
  positionStatus: 'OPEN',
  ...overrides,
});

const auditState = {
  fills: {
    first: { record: record({ orderId: 1, filledNotionalUsdt: 10 }) },
    second: { record: record({ orderId: 2, filledNotionalUsdt: 30, isDca: true }) },
    closedA: { record: record({
      orderId: 3,
      symbol: 'BTCUSDT',
      direction: 'SHORT',
      signalType: 'BREAKDOWN_SHORT',
      signalLabel: 'BREAKDOWN SHORT',
      filledAt: '2026-10-02T01:00:00.000Z',
      positionStatus: 'CLOSED',
      closeGroupId: 'BTCUSDT:SHORT:99',
      closedAt: '2026-10-02T02:00:00.000Z',
      netRealizedPnlUsdt: 1.2,
      realizedRoePct: 12,
      outcome: 'WIN',
    }) },
    closedB: { record: record({
      orderId: 4,
      symbol: 'BTCUSDT',
      direction: 'SHORT',
      signalType: 'BREAKDOWN_SHORT',
      signalLabel: 'BREAKDOWN SHORT DCA',
      filledAt: '2026-10-02T01:05:00.000Z',
      positionStatus: 'CLOSED',
      closeGroupId: 'BTCUSDT:SHORT:99',
      netRealizedPnlUsdt: 0.8,
      realizedRoePct: 8,
      outcome: 'WIN',
      isDca: true,
    }) },
    stale: { record: record({ orderId: 5, symbol: 'STALEUSDT' }) },
  },
};
const positions = [{
  symbol: 'QNTUSDT', positionAmt: '0.4', entryPrice: '100', markPrice: '110',
  unRealizedProfit: '4', positionInitialMargin: '8', leverage: '5', pnlSource: 'TEST_SOCKET',
}];

const snapshot = buildBinanceSignalOrderManagerSnapshot({ auditState, positions, query: { pageSize: 100 } });
assert.equal(snapshot.version, BINANCE_SIGNAL_ORDER_MANAGER_VERSION);
assert.equal(snapshot.summary.records, 5);
assert.equal(snapshot.summary.activeRecords, 2);
assert.equal(snapshot.summary.activeSymbols, 1);
assert.equal(snapshot.summary.closedRecords, 2);
assert.equal(snapshot.summary.closedLifecycles, 1, 'DCA fills in one close group count as one lifecycle');
assert.equal(snapshot.summary.realizedNetPnlUsdt, 2);
assert.equal(snapshot.summary.allocatedUnrealizedPnlUsdt, 4);
assert.equal(snapshot.summary.unconfirmedRecords, 1);
const qntRows = snapshot.rows.filter(row => row.symbol === 'QNTUSDT');
assert.deepEqual(qntRows.map(row => row.pnlUsdt).sort((a, b) => a - b), [1, 3]);
assert(qntRows.every(row => row.pnlKind === 'UNREALIZED_ALLOCATED'));
assert.equal(snapshot.rows.find(row => row.symbol === 'STALEUSDT').displayStatus, 'OPEN_UNCONFIRMED');
assert.equal(snapshot.rows.find(row => row.symbol === 'STALEUSDT').pnlUsdt, null,
  'missing Binance position must not render as zero PnL');

const search = buildBinanceSignalOrderManagerSnapshot({
  auditState,
  positions,
  query: { search: 'breakdown', status: 'CLOSED', direction: 'SHORT', pageSize: 10 },
});
assert.equal(search.pagination.totalRows, 2);
assert.equal(search.summary.closedLifecycles, 1);
assert(search.rows.every(row => row.signalType === 'BREAKDOWN_SHORT'));

const pnlHigh = buildBinanceSignalOrderManagerSnapshot({
  auditState,
  positions,
  query: { sort: 'pnl_high', pageSize: 10 },
});
assert.equal(pnlHigh.rows[0].pnlUsdt, 3);

const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
const navigation = await readFile(new URL('../src/localAiNavigation.js', import.meta.url), 'utf8');
assert.match(server, /\/api\/binance-signal-orders/);
assert.match(server, /buildBinanceSignalOrderManagerSnapshot/);
assert.match(server, /pathname === '\/binance-signal-orders'/);
assert.match(navigation, /BINANCE_SIGNAL_ORDERS_HREF = '\/binance-signal-orders'/);

console.log('Binance signal order manager tests: OK');
