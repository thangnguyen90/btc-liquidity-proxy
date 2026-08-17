import { buildFillAnchoredProtectionSpec } from './liveCardSignalProtection.js';
import { LIQUID_FLOW_V2_BINANCE_LEVERAGE } from './autoBinancePolicy.js';

export const LIQUID_FLOW_V2_MANUAL_ORDER_VERSION = 'LIQUID_FLOW_V2_MANUAL_BINANCE_UI_V7_EMA_FAN_RETEST_CONFIRM_20260816';
export const BINANCE_DCA_KEEP_PROTECTION_VERSION = 'BINANCE_DCA_KEEP_EXISTING_TP_SL_V1_20260814';

export function inspectLiquidFlowV2DcaPositions({ positions = [], symbol, side } = {}) {
  const normalizedSymbol = String(symbol ?? '').trim().toUpperCase();
  const normalizedSide = String(side ?? '').trim().toUpperCase();
  const existing = (Array.isArray(positions) ? positions : []).filter((row) => (
    String(row?.symbol ?? '').trim().toUpperCase() === normalizedSymbol
      && Number(row?.positionAmt) !== 0
  ));
  const directionOf = (row) => {
    const positionSide = String(row?.positionSide ?? 'BOTH').toUpperCase();
    if (positionSide === 'LONG' || positionSide === 'SHORT') return positionSide;
    return Number(row?.positionAmt) > 0 ? 'LONG' : 'SHORT';
  };
  const sameSideCount = existing.filter((row) => directionOf(row) === normalizedSide).length;
  const oppositeCount = existing.length - sameSideCount;
  return {
    canAdd: ['LONG', 'SHORT'].includes(normalizedSide) && oppositeCount === 0,
    hasExistingSameSide: sameSideCount > 0,
    existingCount: existing.length,
    sameSideCount,
    oppositeCount,
  };
}

export function isBinanceSameSideDcaFill({
  side,
  positionSide = 'BOTH',
  filledQty,
  cumulativeFilledQty,
  positionAmount,
} = {}) {
  const normalizedSide = String(side ?? '').trim().toUpperCase();
  const normalizedPositionSide = String(positionSide ?? 'BOTH').trim().toUpperCase();
  const orderQty = Math.abs(Number(cumulativeFilledQty) || Number(filledQty) || 0);
  const resultingAmount = Number(positionAmount);
  if (!['BUY', 'SELL'].includes(normalizedSide) || !(orderQty > 0) || !Number.isFinite(resultingAmount)) return false;
  const opensSameDirection = normalizedPositionSide === 'LONG'
    ? normalizedSide === 'BUY' && resultingAmount > 0
    : normalizedPositionSide === 'SHORT'
      ? normalizedSide === 'SELL' && resultingAmount < 0
      : (normalizedSide === 'BUY' && resultingAmount > 0)
        || (normalizedSide === 'SELL' && resultingAmount < 0);
  if (!opensSameDirection) return false;
  const tolerance = Math.max(orderQty * 1e-8, 1e-12);
  return Math.abs(resultingAmount) > orderQty + tolerance;
}

export function buildLiquidFlowV2ManualOrderPayload({
  trade,
  orderType,
  entryPrice,
  settings = {},
  marginUsdt: requestedMarginUsdt = null,
  leverage: requestedLeverage = null,
  clientOrderId,
} = {}) {
  if (!trade || !['OPEN', 'PENDING_ENTRY'].includes(String(trade.status))) {
    throw new Error('Trade không còn OPEN/PENDING để đặt Binance.');
  }
  if (trade.labelKey === 'EMA_FAN_LONG_READY' && trade.status !== 'OPEN') {
    throw new Error('EMA FAN LONG thường phải chờ nến 5m đóng xác nhận trước khi đặt Binance.');
  }
  const normalizedType = String(orderType ?? '').toUpperCase();
  if (!['LIMIT', 'MARKET'].includes(normalizedType)) throw new Error('orderType phải là LIMIT hoặc MARKET.');
  const side = String(trade.side ?? '').toUpperCase();
  if (!['LONG', 'SHORT'].includes(side)) throw new Error('Trade thiếu side LONG/SHORT hợp lệ.');
  const limitPrice = Number(entryPrice);
  if (normalizedType === 'LIMIT' && !(limitPrice > 0)) throw new Error('Entry LIMIT phải lớn hơn 0.');

  const defaultMarginUsdt = trade.labelKey === 'UP_BASE_SWEEP_LONG_READY'
    ? Number(settings.baseLongBinanceMarginUsdt ?? 2)
    : Number(settings.baseBinanceMarginUsdt ?? 2);
  const marginUsdt = requestedMarginUsdt == null || requestedMarginUsdt === ''
    ? defaultMarginUsdt
    : Number(requestedMarginUsdt);
  // Server-side hard lock: clients and legacy stored settings cannot raise V2 leverage.
  void requestedLeverage;
  const leverage = LIQUID_FLOW_V2_BINANCE_LEVERAGE;
  if (!(marginUsdt > 0) || marginUsdt > 10_000) throw new Error('Margin phải lớn hơn 0 và không quá 10,000 USDT.');
  const protection = buildFillAnchoredProtectionSpec({
    side,
    signalEntryPrice: Number(trade.entryPrice),
    takeProfitPrice: Number(trade.takeProfit),
    stopLossPrice: Number(trade.stopLoss),
  });
  return {
    symbol: trade.symbol,
    side: side === 'LONG' ? 'BUY' : 'SELL',
    orderType: normalizedType,
    limitPrice: normalizedType === 'LIMIT' ? limitPrice : undefined,
    notionalUsdt: marginUsdt * leverage,
    leverage,
    takeProfitPrice: Number(trade.takeProfit) || undefined,
    stopLossPrice: Number(trade.stopLoss) || undefined,
    protectionOnFill: true,
    preserveSignalProtection: true,
    protectionSignalEntryPrice: protection.signalEntryPrice,
    protectionSignalTakeProfitPrice: protection.signalTakeProfitPrice,
    protectionSignalStopLossPrice: protection.signalStopLossPrice,
    fillAnchorEnabled: protection.fillAnchorEnabled,
    fillAnchorVersion: protection.fillAnchorVersion,
    takeProfitDistanceFraction: protection.takeProfitDistanceFraction,
    stopLossDistanceFraction: protection.stopLossDistanceFraction,
    clientOrderId,
    dryRun: false,
    source: 'liquid-flow-v2-manual',
    marginUsdt,
    policyVersion: LIQUID_FLOW_V2_MANUAL_ORDER_VERSION,
  };
}
