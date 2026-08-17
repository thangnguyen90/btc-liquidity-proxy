import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BINANCE_MANUAL_SOCKET_SOURCE,
  NON_LIQUID_FLOW_V2_LONG_TP_ROE,
  NON_LIQUID_FLOW_V2_LONG_TP_VERSION,
  NON_LIQUID_FLOW_V2_SHORT_TP_ROE,
  ORDERS_MANUAL_TP_ROE,
  ORDERS_MANUAL_TP_VERSION,
  isUserOrLiquidFlowV2ManagedSource,
  resolveManualSocketProtection,
  resolveNonLiquidFlowV2TakeProfit,
  resolveNonLiquidFlowV2ShortTakeProfit,
  resolveOrdersManualTakeProfit,
} from '../src/shortTakeProfitPolicy.js';

const short10x = resolveNonLiquidFlowV2ShortTakeProfit({
  side: 'SHORT', source: 'live-card-whitelist-edge', entryPrice: 100, leverage: 10, requestedTakeProfitPrice: 90,
});
assert.equal(short10x.applied, true);
assert.equal(short10x.roePct, NON_LIQUID_FLOW_V2_SHORT_TP_ROE);
assert.equal(short10x.takeProfitPrice, 99.4);

const short5x = resolveNonLiquidFlowV2ShortTakeProfit({
  side: 'SELL', source: 'auto-trader', entryPrice: 100, leverage: 5,
});
assert.equal(short5x.applied, true);
assert.equal(short5x.takeProfitPrice, 98.8);

const v2 = resolveNonLiquidFlowV2ShortTakeProfit({
  side: 'SHORT', source: 'liquid-flow-v2-base', entryPrice: 100, leverage: 5, requestedTakeProfitPrice: 98,
});
assert.equal(v2.applied, false);
assert.equal(v2.takeProfitPrice, 98);

const long = resolveNonLiquidFlowV2ShortTakeProfit({
  side: 'LONG', source: 'live-card-whitelist-edge', entryPrice: 100, leverage: 10, requestedTakeProfitPrice: 102,
});
assert.equal(long.applied, false);
assert.equal(long.takeProfitPrice, 102);

const long10x = resolveNonLiquidFlowV2TakeProfit({
  side: 'LONG', source: 'live-card-whitelist-edge', entryPrice: 100, leverage: 10, requestedTakeProfitPrice: 105,
});
assert.equal(long10x.applied, true);
assert.equal(long10x.direction, 'LONG');
assert.equal(long10x.roePct, NON_LIQUID_FLOW_V2_LONG_TP_ROE);
assert.equal(long10x.takeProfitPrice, 101);
assert.equal(long10x.version, NON_LIQUID_FLOW_V2_LONG_TP_VERSION);

const long5x = resolveNonLiquidFlowV2TakeProfit({
  side: 'BUY', source: 'auto-liq', entryPrice: 100, leverage: 5,
});
assert.equal(long5x.applied, true);
assert.equal(long5x.takeProfitPrice, 102);

const longV2 = resolveNonLiquidFlowV2TakeProfit({
  side: 'LONG', source: 'liquid-flow-v2-manual', entryPrice: 100, leverage: 5, requestedTakeProfitPrice: 104,
});
assert.equal(longV2.applied, false);
assert.equal(longV2.takeProfitPrice, 104);
assert.equal(isUserOrLiquidFlowV2ManagedSource('liquid-flow-v2-manual'), true);
assert.equal(isUserOrLiquidFlowV2ManagedSource('orders-manual'), true);
assert.equal(isUserOrLiquidFlowV2ManagedSource(null, ''), true);
assert.equal(isUserOrLiquidFlowV2ManagedSource('REST_SYNC'), true);
assert.equal(isUserOrLiquidFlowV2ManagedSource('live-card-whitelist-edge'), false);
assert.equal(isUserOrLiquidFlowV2ManagedSource(null, 'pump-order'), false);

for (const source of [null, '', 'signal', 'manual', 'orders-manual', 'set-tp-sl', 'binance-position-fallback', 'REST_SYNC', 'REST_FILL_RECOVERY']) {
  const manualOrUnknown = resolveNonLiquidFlowV2ShortTakeProfit({
    side: 'SHORT', source, entryPrice: 100, leverage: 10, requestedTakeProfitPrice: 97,
  });
  assert.equal(manualOrUnknown.applied, false, `manual/unknown source must be excluded: ${source}`);
  assert.equal(manualOrUnknown.takeProfitPrice, 97);

  const manualLong = resolveNonLiquidFlowV2TakeProfit({
    side: 'LONG', source, entryPrice: 100, leverage: 10, requestedTakeProfitPrice: 103,
  });
  assert.equal(manualLong.applied, false, `manual/unknown LONG must be treated as Liquid Flow V2: ${source}`);
  assert.equal(manualLong.takeProfitPrice, 103);
}

const trackedBot = resolveNonLiquidFlowV2ShortTakeProfit({
  side: 'SHORT', source: 'pump-order', entryPrice: 100, leverage: 10,
});
assert.equal(trackedBot.applied, true);
assert.equal(trackedBot.takeProfitPrice, 99.4);

const manualLong10x = resolveOrdersManualTakeProfit({
  side: 'BUY', source: 'orders-manual', entryPrice: 100, leverage: 10,
});
assert.equal(manualLong10x.applied, true);
assert.equal(manualLong10x.direction, 'LONG');
assert.equal(manualLong10x.roePct, ORDERS_MANUAL_TP_ROE);
assert.equal(manualLong10x.takeProfitPrice, 103);
assert.equal(manualLong10x.version, ORDERS_MANUAL_TP_VERSION);

const manualShort5x = resolveOrdersManualTakeProfit({
  side: 'SHORT', source: 'orders-manual', entryPrice: 100, leverage: 5,
});
assert.equal(manualShort5x.applied, true);
assert.equal(manualShort5x.direction, 'SHORT');
assert.equal(manualShort5x.takeProfitPrice, 94);

const binanceManualDcaLong5x = resolveOrdersManualTakeProfit({
  side: 'BUY', source: BINANCE_MANUAL_SOCKET_SOURCE, entryPrice: 80, leverage: 5,
});
assert.equal(binanceManualDcaLong5x.applied, true);
assert.ok(Math.abs(binanceManualDcaLong5x.takeProfitPrice - 84.8) < 1e-10);
assert.equal(binanceManualDcaLong5x.version, ORDERS_MANUAL_TP_VERSION);
assert.equal(isUserOrLiquidFlowV2ManagedSource(BINANCE_MANUAL_SOCKET_SOURCE), true);

const binanceManualDcaShort10x = resolveOrdersManualTakeProfit({
  side: 'SELL', source: BINANCE_MANUAL_SOCKET_SOURCE, entryPrice: 80, leverage: 10,
});
assert.equal(binanceManualDcaShort10x.applied, true);
assert.equal(binanceManualDcaShort10x.takeProfitPrice, 77.6);

const socketLongProtection = resolveManualSocketProtection({
  side: 'BUY', entryPrice: 80, leverage: 5, stopLossRoePct: 25,
});
assert.ok(Math.abs(socketLongProtection.takeProfitPrice - 84.8) < 1e-10);
assert.equal(socketLongProtection.stopLossPrice, 76);
assert.equal(socketLongProtection.source, BINANCE_MANUAL_SOCKET_SOURCE);

const socketShortProtection = resolveManualSocketProtection({
  side: 'SELL', entryPrice: 80, leverage: 10, stopLossRoePct: 25,
});
assert.equal(socketShortProtection.takeProfitPrice, 77.6);
assert.equal(socketShortProtection.stopLossPrice, 82);

const socketTpOnly = resolveManualSocketProtection({
  side: 'BUY', entryPrice: 80, leverage: 5, stopLossEnabled: false,
});
assert.equal(socketTpOnly.stopLossPrice, null);

const explicitManualTp = resolveOrdersManualTakeProfit({
  side: 'LONG', source: 'orders-manual', entryPrice: 100, leverage: 10, requestedTakeProfitPrice: 105,
});
assert.equal(explicitManualTp.applied, false);
assert.equal(explicitManualTp.takeProfitPrice, 105);
assert.equal(explicitManualTp.version, null);

assert.equal(resolveOrdersManualTakeProfit({
  side: 'LONG', source: 'liquid-flow-v2-manual', entryPrice: 100, leverage: 5,
}), null);

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
const positionMonitorSource = await readFile(new URL('../src/positionMonitor.js', import.meta.url), 'utf8');
assert.match(serverSource, /placeOrder\(\{ \.\.\.body, source: 'orders-manual' \}, token\)/);
assert.match(serverSource, /resolveNonLiquidFlowV2TakeProfit/);
assert.match(serverSource, /resolveOrdersManualTakeProfit/);
assert.match(serverSource, /source: BINANCE_MANUAL_SOCKET_SOURCE/);
assert.match(positionMonitorSource, /positionEntryPrice: Number\(current\.entry\)/);
assert.doesNotMatch(serverSource, /!fixedShortTpPolicy\.applied/);
assert.doesNotMatch(serverSource, /if \(!takeProfitUserOrV2Managed && roeInfo\.ready/);
assert.doesNotMatch(serverSource, /\[NegTp\].*user\/Liquid Flow V2 keeps its own TP plan/);
assert.match(serverSource, /shouldMoveNegativeTpToEntry/);
assert.match(serverSource, /BINANCE_NEGATIVE_TP_TO_ENTRY_VERSION/);

console.log('short take-profit policy tests passed');
