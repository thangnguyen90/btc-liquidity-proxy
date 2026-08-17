import assert from 'node:assert/strict';
import {
  LIQUID_FLOW_V2_BINANCE_STATS_VERSION,
  buildLiquidFlowV2BinanceStats,
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
assert.equal(result.rows.find((row) => row.tradeId === 'loss').reason, 'STOP_LOSS');
assert.equal(result.rows.find((row) => row.tradeId === 'loss').diagnosis, 'STOP_LOSS_WITH_ADVERSE_ENTRY');
assert.ok(result.rows.find((row) => row.tradeId === 'loss').adverseSlippagePct > 0);

const missing = buildLiquidFlowV2BinanceStats({ trades: [trades[0]], reconciled: [] });
assert.equal(missing.summary.pnlKnown, 0);
assert.equal(missing.summary.netPnl, 0, 'không được lấy paper PnL thay cho Binance PnL bị thiếu');

console.log('Liquid Flow V2 Binance stats tests passed.');
