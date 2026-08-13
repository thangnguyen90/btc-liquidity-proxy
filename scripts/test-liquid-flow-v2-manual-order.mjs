import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LIQUID_FLOW_V2_MANUAL_ORDER_VERSION,
  buildLiquidFlowV2ManualOrderPayload,
  inspectLiquidFlowV2DcaPositions,
} from '../src/liquidFlowV2ManualOrder.js';

const trade = {
  id: 'trade-1',
  status: 'OPEN',
  symbol: 'BICOUSDT',
  side: 'LONG',
  entryPrice: 0.0469186,
  takeProfit: 0.047857,
  stopLoss: 0.0450419,
};
const settings = { baseBinanceMarginUsdt: 2, baseBinanceLeverage: 5 };
const limit = buildLiquidFlowV2ManualOrderPayload({
  trade, orderType: 'LIMIT', entryPrice: 0.0465, settings, clientOrderId: 'lfv2ui_test',
});
assert.equal(limit.orderType, 'LIMIT');
assert.equal(limit.limitPrice, 0.0465);
assert.equal(limit.side, 'BUY');
assert.equal(limit.notionalUsdt, 10);
assert.equal(limit.leverage, 5);
assert.equal(limit.source, 'liquid-flow-v2-manual');
assert.equal(limit.protectionOnFill, true);
assert.equal(limit.policyVersion, LIQUID_FLOW_V2_MANUAL_ORDER_VERSION);

const market = buildLiquidFlowV2ManualOrderPayload({
  trade: { ...trade, side: 'SHORT', status: 'PENDING_ENTRY' },
  orderType: 'MARKET',
  entryPrice: 999,
  settings,
  clientOrderId: 'lfv2ui_market',
});
assert.equal(market.orderType, 'MARKET');
assert.equal(market.limitPrice, undefined);
assert.equal(market.side, 'SELL');
assert.equal(market.notionalUsdt, 10);

const customSize = buildLiquidFlowV2ManualOrderPayload({
  trade, orderType: 'MARKET', settings, marginUsdt: 7, leverage: 8,
  clientOrderId: 'lfv2ui_custom_size',
});
assert.equal(customSize.marginUsdt, 7);
assert.equal(customSize.leverage, 8);
assert.equal(customSize.notionalUsdt, 56);

const baseLongDefault = buildLiquidFlowV2ManualOrderPayload({
  trade: { ...trade, labelKey: 'UP_BASE_SWEEP_LONG_READY' },
  orderType: 'MARKET',
  settings: { ...settings, baseLongBinanceMarginUsdt: 2 },
  clientOrderId: 'lfv2ui_base_long_default',
});
assert.equal(baseLongDefault.marginUsdt, 2);
assert.equal(baseLongDefault.notionalUsdt, 10);

const flatDcaState = inspectLiquidFlowV2DcaPositions({ positions: [], symbol: 'BICOUSDT', side: 'LONG' });
assert.equal(flatDcaState.canAdd, true);
assert.equal(flatDcaState.hasExistingSameSide, false);
const sameSideDcaState = inspectLiquidFlowV2DcaPositions({
  positions: [{ symbol: 'BICOUSDT', positionAmt: '12', positionSide: 'BOTH' }],
  symbol: 'BICOUSDT',
  side: 'LONG',
});
assert.equal(sameSideDcaState.canAdd, true);
assert.equal(sameSideDcaState.hasExistingSameSide, true);
assert.equal(sameSideDcaState.sameSideCount, 1);
const oppositeDcaState = inspectLiquidFlowV2DcaPositions({
  positions: [{ symbol: 'BICOUSDT', positionAmt: '-12', positionSide: 'BOTH' }],
  symbol: 'BICOUSDT',
  side: 'LONG',
});
assert.equal(oppositeDcaState.canAdd, false);
assert.equal(oppositeDcaState.oppositeCount, 1);
const hedgeOppositeDcaState = inspectLiquidFlowV2DcaPositions({
  positions: [{ symbol: 'BICOUSDT', positionAmt: '-12', positionSide: 'SHORT' }],
  symbol: 'BICOUSDT',
  side: 'LONG',
});
assert.equal(hedgeOppositeDcaState.canAdd, false);

assert.throws(() => buildLiquidFlowV2ManualOrderPayload({
  trade: { ...trade, status: 'CLOSED' }, orderType: 'MARKET', settings,
}), /OPEN\/PENDING/);
assert.throws(() => buildLiquidFlowV2ManualOrderPayload({
  trade, orderType: 'LIMIT', entryPrice: 0, settings,
}), /Entry LIMIT/);
assert.throws(() => buildLiquidFlowV2ManualOrderPayload({
  trade, orderType: 'MARKET', settings, marginUsdt: 0,
}), /Margin/);
assert.throws(() => buildLiquidFlowV2ManualOrderPayload({
  trade, orderType: 'MARKET', settings, leverage: 5.5,
}), /Leverage/);
assert.throws(() => buildLiquidFlowV2ManualOrderPayload({
  trade, orderType: 'MARKET', settings, leverage: 126,
}), /Leverage/);

const [serverSource, uiSource] = await Promise.all([
  readFile(new URL('../src/server.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/liquid-flow-v2.js', import.meta.url), 'utf8'),
]);
assert.equal(LIQUID_FLOW_V2_MANUAL_ORDER_VERSION, 'LIQUID_FLOW_V2_MANUAL_BINANCE_UI_V4_SAME_SIDE_DCA_20260810');
assert.match(serverSource, /\/api\/liquid-flow-v2-binance-order/);
assert.match(serverSource, /ordersTokens\.has\(token\)/);
assert.match(serverSource, /inspectLiquidFlowV2DcaPositions/);
assert.match(serverSource, /dcaPositionState\.canAdd/);
assert.match(serverSource, /position ngược chiều/);
assert.doesNotMatch(serverSource, /đã có position Binance/);
assert.match(uiSource, /data-flow-order-type="LIMIT"/);
assert.match(uiSource, /data-flow-order-type="MARKET"/);
assert.match(uiSource, /data-flow-margin/);
assert.match(uiSource, /data-flow-leverage/);
assert.match(uiSource, /marginUsdt, leverage/);
assert.match(uiSource, /x-orders-token/);
assert.match(uiSource, /recoverOrdersToken/);
assert.match(uiSource, /orders_creds/);
assert.match(uiSource, /error\.status !== 401/);
assert.match(uiSource, /location\.host/);
assert.match(uiSource, /const lockedByServer = serverOrderState === 'SUBMITTING'/);
assert.doesNotMatch(uiSource, /uiState\?\.success === true/);
assert.match(uiSource, /ĐÃ VÀO LỆNH GIÁ/);
assert.match(uiSource, /ĐÃ ĐẶT LIMIT GIÁ/);

console.log('Liquid Flow V2 manual Binance order tests passed');
