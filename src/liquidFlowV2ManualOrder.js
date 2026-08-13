import { buildFillAnchoredProtectionSpec } from './liveCardSignalProtection.js';

export const LIQUID_FLOW_V2_MANUAL_ORDER_VERSION = 'LIQUID_FLOW_V2_MANUAL_BINANCE_UI_V4_SAME_SIDE_DCA_20260810';

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
  const leverage = requestedLeverage == null || requestedLeverage === ''
    ? Number(settings.baseBinanceLeverage ?? 5)
    : Number(requestedLeverage);
  if (!(marginUsdt > 0) || marginUsdt > 10_000) throw new Error('Margin phải lớn hơn 0 và không quá 10,000 USDT.');
  if (!Number.isInteger(leverage) || leverage < 1 || leverage > 125) throw new Error('Leverage phải là số nguyên từ 1 đến 125.');
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
