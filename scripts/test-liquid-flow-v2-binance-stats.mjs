import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LIQUID_FLOW_V2_BINANCE_STATS_VERSION,
  buildLiquidFlowV2BinanceStats,
  coinglassQualifiedBinanceAudits,
  coinglassQualifiedBinanceTrades,
  liquidFlowV2RealTrades,
  liquidFlowV2SyntheticExecutions,
  normalizeLiquidFlowV2BinanceRange,
} from '../src/liquidFlowV2BinanceStats.js';

const bangkokNoon = (day) => Date.parse(`${day}T05:00:00.000Z`);
const trades = [
  {
    id: 'win', symbol: 'AAAUSDT', side: 'LONG', labelKey: 'EMA_FAN_LONG_READY', label: 'EMA FAN LONG',
    status: 'CLOSED', outcome: 'TP', entryPrice: 100, exitPrice: 102, exitAt: bangkokNoon('2026-08-14') + 60_000,
    binanceEntryState: 'FILLED', binanceEntryFilledAt: bangkokNoon('2026-08-14'), binanceEntryPrice: 100.2,
    binanceMarginUsdt: 5, binanceLeverage: 5, netPnl: 1,
  },
  {
    id: 'loss', symbol: 'BBBUSDT', side: 'SHORT', labelKey: 'HTF_BEAR_15M_EMA99_PUMP_REJECT', label: 'HTF BEAR',
    status: 'CLOSED', outcome: 'SL', entryPrice: 50, exitPrice: 51, exitAt: bangkokNoon('2026-08-13') + 60_000,
    binanceEntryState: 'FILLED', binanceEntryFilledAt: bangkokNoon('2026-08-13'), binanceEntryPrice: 49.5,
    binanceMarginUsdt: 5, binanceLeverage: 5, netPnl: -2,
  },
  {
    id: 'open', symbol: 'CCCUSDT', side: 'LONG', labelKey: 'EMA_FAN_LONG_READY', label: 'EMA FAN LONG',
    status: 'OPEN', entryPrice: 10, binanceEntryState: 'FILLED', binanceEntryFilledAt: bangkokNoon('2026-08-14'),
    binanceEntryPrice: 10, binanceMarginUsdt: 5, binanceLeverage: 5,
  },
  { id: 'not-filled', symbol: 'DDDUSDT', labelKey: 'EMA_FAN_LONG_READY', binanceEntryState: 'ERROR' },
];

assert.deepEqual(normalizeLiquidFlowV2BinanceRange('2026-08-14', '2026-08-13'), {
  fromDay: '2026-08-13', toDay: '2026-08-14',
});
assert.equal(liquidFlowV2RealTrades(trades, { fromDay: '2026-08-14', toDay: '2026-08-14' }).length, 2);
assert.equal(liquidFlowV2RealTrades(trades, { labelKey: 'EMA_FAN_LONG_READY' }).length, 2);
assert.equal(liquidFlowV2SyntheticExecutions(trades.slice(0, 2))[0].status, 'POSITION_CLOSED');

const result = buildLiquidFlowV2BinanceStats({
  trades,
  reconciled: [
    { lifecycleId: 'liquid-flow-v2:win', net: 0.92, realized: 1, commission: -0.08, funding: 0, realizedIncomeCount: 1 },
    { lifecycleId: 'liquid-flow-v2:loss', net: -1.08, realized: -1, commission: -0.08, funding: 0, realizedIncomeCount: 1 },
  ],
  positions: [{ symbol: 'CCCUSDT', positionAmt: '2', markPrice: '10.2', unRealizedProfit: '0.4' }],
});

assert.equal(result.version, LIQUID_FLOW_V2_BINANCE_STATS_VERSION);
assert.equal(result.summary.total, 3);
assert.equal(result.summary.wins, 1);
assert.equal(result.summary.losses, 1);
assert.equal(result.summary.open, 1);
assert.equal(result.summary.pnlKnown, 3);
assert.equal(Number(result.summary.netPnl.toFixed(2)), 0.24);
assert.equal(result.rows.find((row) => row.tradeId === 'win').pnlSource, 'BINANCE_INCOME');
assert.equal(result.rows.find((row) => row.tradeId === 'open').pnlSource, 'BINANCE_POSITION');
assert.equal(result.rows.find((row) => row.tradeId === 'open').diagnosis, 'OPEN_PROFIT_REALTIME');
assert.equal(result.rows.find((row) => row.tradeId === 'loss').reason, 'STOP_LOSS');
assert.equal(result.rows.find((row) => row.tradeId === 'loss').diagnosis, 'STOP_LOSS_WITH_ADVERSE_ENTRY');
assert.ok(result.rows.find((row) => row.tradeId === 'loss').adverseSlippagePct > 0);
assert.match(result.realtimePolicy, /BINANCE_USER_DATA_PLUS_MARK_PRICE_SOCKET/);

const missing = buildLiquidFlowV2BinanceStats({ trades: [trades[0]], reconciled: [] });
assert.equal(missing.summary.pnlKnown, 0);
assert.equal(missing.summary.netPnl, 0, 'không được lấy paper PnL thay cho Binance PnL bị thiếu');

const coinglassExecutionState = {
  submitted: {
    long: {
      decision: 'SUBMITTED', symbol: 'CGOPENUSDT', action: 'WAIT_LONG_CONFIRMATION', orderId: 101,
      proposedEntry: 20, currentPrice: 20.1, submittedAt: bangkokNoon('2026-08-14'), marginUsdt: 5, leverage: 5,
    },
    short: {
      decision: 'SUBMITTED', symbol: 'CGCLOSEDUSDT', action: 'WAIT_SHORT_CONFIRMATION', orderId: 102,
      proposedEntry: 50, currentPrice: 50.1, submittedAt: bangkokNoon('2026-08-14') + 120_000,
      marginUsdt: 5, leverage: 5,
    },
    blocked: {
      decision: 'WAIT_PRICE_ABOVE_PROPOSED_ENTRY', symbol: 'BLOCKEDUSDT', action: 'WAIT_LONG_CONFIRMATION',
      orderId: null, submittedAt: bangkokNoon('2026-08-14'),
    },
  },
};
const coinglassAudits = coinglassQualifiedBinanceAudits(coinglassExecutionState, {
  fromDay: '2026-08-14', toDay: '2026-08-14',
});
assert.equal(coinglassAudits.length, 2);
assert.equal(coinglassQualifiedBinanceAudits(coinglassExecutionState, {
  labelKey: 'COINGLASS_QUALIFIED_LONG',
}).length, 1);
const coinglassTrades = coinglassQualifiedBinanceTrades({
  audits: coinglassAudits,
  orderSnapshots: [
    { symbol: 'CGOPENUSDT', orderId: 101, status: 'FILLED', executedQty: '2', avgPrice: '20.2', updateTime: bangkokNoon('2026-08-14') + 1_000 },
    { symbol: 'CGCLOSEDUSDT', orderId: 102, status: 'FILLED', executedQty: '1', avgPrice: '50.2', updateTime: bangkokNoon('2026-08-14') + 121_000 },
  ],
  positions: [{ symbol: 'CGOPENUSDT', positionAmt: '2', markPrice: '20.4', unRealizedProfit: '0.4' }],
  now: bangkokNoon('2026-08-14') + 3_600_000,
});
assert.equal(coinglassTrades.length, 2);
assert.equal(coinglassTrades.find((trade) => trade.id.endsWith('101')).status, 'OPEN');
assert.equal(coinglassTrades.find((trade) => trade.id.endsWith('102')).status, 'CLOSED');
const withCoinglass = buildLiquidFlowV2BinanceStats({
  trades: coinglassTrades,
  reconciled: [{
    lifecycleId: 'coinglass-qualified:102', net: 0.47, realized: 0.5, commission: -0.03,
    funding: 0, realizedIncomeCount: 1,
  }],
  positions: [{ symbol: 'CGOPENUSDT', positionAmt: '2', markPrice: '20.4', unRealizedProfit: '0.4' }],
});
assert.equal(withCoinglass.summary.total, 2);
assert.equal(withCoinglass.summary.open, 1);
assert.equal(withCoinglass.summary.closed, 1);
assert.equal(withCoinglass.groups.some((group) => group.key === 'COINGLASS_QUALIFIED_LONG'), true);
assert.equal(withCoinglass.groups.some((group) => group.key === 'COINGLASS_QUALIFIED_SHORT'), true);
assert.equal(withCoinglass.rows.find((row) => row.tradeId.endsWith('102')).pnlSource, 'BINANCE_INCOME');
assert.equal(coinglassQualifiedBinanceTrades({
  audits: coinglassAudits,
  orderSnapshots: [{ symbol: 'CGOPENUSDT', orderId: 101, status: 'NEW', executedQty: '0' }],
}).length, 0, 'CoinGlass SUBMITTED chưa xác nhận fill không được tính vào stats');

const uiSource = await readFile(new URL('../public/liquid-flow-v2-binance-stats.js', import.meta.url), 'utf8');
const htmlSource = await readFile(new URL('../public/liquid-flow-v2-binance-stats.html', import.meta.url), 'utf8');
assert.match(uiSource, /\/api\/positions\/stream/);
assert.match(uiSource, /BINANCE_POSITION_SOCKET/);
assert.match(uiSource, /position-closed/);
assert.match(uiSource, /DISCONNECTED_REFRESH_MS = 30_000/);
assert.match(htmlSource, /Chi tiết nguyên nhân thắng\/thua[\s\S]*REALTIME/);

console.log('Liquid Flow V2 Binance stats tests passed.');
