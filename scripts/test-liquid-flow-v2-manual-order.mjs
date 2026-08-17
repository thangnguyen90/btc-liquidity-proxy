import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BINANCE_DCA_KEEP_PROTECTION_VERSION,
  LIQUID_FLOW_V2_MANUAL_ORDER_VERSION,
  buildLiquidFlowV2ManualOrderPayload,
  inspectLiquidFlowV2DcaPositions,
  isBinanceSameSideDcaFill,
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
const settings = { baseBinanceMarginUsdt: 2, baseBinanceLeverage: 20 };
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
assert.throws(() => buildLiquidFlowV2ManualOrderPayload({
  trade: { ...trade, labelKey: 'EMA_FAN_LONG_READY', status: 'PENDING_ENTRY' },
  orderType: 'MARKET',
  settings,
  clientOrderId: 'lfv2ui_ema_fan_too_early',
}), /chờ nến 5m đóng xác nhận/);

const customSize = buildLiquidFlowV2ManualOrderPayload({
  trade, orderType: 'MARKET', settings, marginUsdt: 7, leverage: 8,
  clientOrderId: 'lfv2ui_custom_size',
});
assert.equal(customSize.marginUsdt, 7);
assert.equal(customSize.leverage, 5);
assert.equal(customSize.notionalUsdt, 35);

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
assert.equal(isBinanceSameSideDcaFill({
  side: 'BUY',
  positionSide: 'BOTH',
  cumulativeFilledQty: 2,
  positionAmount: 7,
}), true);
assert.equal(isBinanceSameSideDcaFill({
  side: 'SELL',
  positionSide: 'SHORT',
  cumulativeFilledQty: 2,
  positionAmount: -7,
}), true);
assert.equal(isBinanceSameSideDcaFill({
  side: 'BUY',
  positionSide: 'BOTH',
  cumulativeFilledQty: 2,
  positionAmount: 2,
}), false, 'A brand-new position must still receive its first TP/SL protection.');
assert.equal(isBinanceSameSideDcaFill({
  side: 'SELL',
  positionSide: 'SHORT',
  cumulativeFilledQty: 2,
  positionAmount: 7,
}), false, 'An order not opening the resulting direction is not a same-side DCA.');

assert.throws(() => buildLiquidFlowV2ManualOrderPayload({
  trade: { ...trade, status: 'CLOSED' }, orderType: 'MARKET', settings,
}), /OPEN\/PENDING/);
assert.throws(() => buildLiquidFlowV2ManualOrderPayload({
  trade, orderType: 'LIMIT', entryPrice: 0, settings,
}), /Entry LIMIT/);
assert.throws(() => buildLiquidFlowV2ManualOrderPayload({
  trade, orderType: 'MARKET', settings, marginUsdt: 0,
}), /Margin/);
const fractionalLeverageIgnored = buildLiquidFlowV2ManualOrderPayload({
  trade, orderType: 'MARKET', settings, leverage: 5.5,
});
assert.equal(fractionalLeverageIgnored.leverage, 5);
const excessiveLeverageIgnored = buildLiquidFlowV2ManualOrderPayload({
  trade, orderType: 'MARKET', settings, leverage: 126,
});
assert.equal(excessiveLeverageIgnored.leverage, 5);

const [serverSource, uiSource] = await Promise.all([
  readFile(new URL('../src/server.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/liquid-flow-v2.js', import.meta.url), 'utf8'),
]);
assert.equal(LIQUID_FLOW_V2_MANUAL_ORDER_VERSION, 'LIQUID_FLOW_V2_MANUAL_BINANCE_UI_V7_EMA_FAN_RETEST_CONFIRM_20260816');
assert.equal(BINANCE_DCA_KEEP_PROTECTION_VERSION, 'BINANCE_DCA_KEEP_EXISTING_TP_SL_V1_20260814');
assert.match(serverSource, /\/api\/liquid-flow-v2-binance-order/);
assert.match(serverSource, /ordersTokens\.has\(token\)/);
assert.match(serverSource, /inspectLiquidFlowV2DcaPositions/);
assert.match(serverSource, /dcaPositionState\.canAdd/);
assert.match(serverSource, /dcaPositionState\.hasExistingSameSide/);
assert.match(serverSource, /protectionSuppressedForDca/);
assert.match(serverSource, /isBinanceSameSideDcaFill/);
assert.match(serverSource, /sameSideDcaFill/);
assert.match(serverSource, /DCA_KEEP_EXISTING_PROTECTION/);
assert.match(serverSource, /position ngược chiều/);
assert.doesNotMatch(serverSource, /đã có position Binance/);
assert.match(uiSource, /data-flow-order-type="LIMIT"/);
assert.match(uiSource, /data-flow-order-type="MARKET"/);
assert.match(uiSource, /data-flow-margin/);
assert.match(uiSource, /data-flow-leverage/);
assert.match(uiSource, /data-flow-leverage[^>]+min="5" max="5"[^>]+readonly/);
assert.match(uiSource, /const leverage = 5;/);
assert.match(uiSource, /marginUsdt, leverage/);
assert.match(uiSource, /x-orders-token/);
assert.match(uiSource, /recoverOrdersToken/);
assert.match(uiSource, /orders_creds/);
assert.match(uiSource, /error\.status !== 401/);
assert.match(uiSource, /location\.host/);
assert.match(uiSource, /const lockedByServer = serverOrderState === 'SUBMITTING'/);
assert.match(uiSource, /CHỜ NẾN 5M XÁC NHẬN/);
assert.doesNotMatch(uiSource, /uiState\?\.success === true/);
assert.match(uiSource, /ĐÃ VÀO LỆNH GIÁ/);
assert.match(uiSource, /ĐÃ ĐẶT LIMIT GIÁ/);
assert.match(uiSource, /DCA GIỮ TP\/SL CŨ/);

console.log('Liquid Flow V2 manual Binance order tests passed');
