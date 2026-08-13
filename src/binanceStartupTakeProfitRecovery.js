import { hasOpenProtectionOrder } from './protectionOrderGuard.js';
import {
  BINANCE_MANUAL_SOCKET_SOURCE,
  resolveNonLiquidFlowV2TakeProfit,
  resolveOrdersManualTakeProfit,
} from './shortTakeProfitPolicy.js';

export const BINANCE_STARTUP_TP_ONLY_RECOVERY_VERSION = 'BINANCE_TP_ONLY_GUARD_V2_20260812';

const finitePositive = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export function startupPositionNeedsTakeProfit(position, regularOrders = [], algoOrders = []) {
  const symbol = String(position?.symbol ?? '').trim().toUpperCase();
  const amount = Number(position?.positionAmt ?? position?.amt);
  if (!symbol || !Number.isFinite(amount) || amount === 0) return false;
  const closeSide = amount > 0 ? 'SELL' : 'BUY';
  return !hasOpenProtectionOrder(regularOrders, algoOrders, {
    symbol,
    closeSide,
    positionSide: position?.positionSide ?? 'BOTH',
    kind: 'TP',
  });
}

export function buildStartupTakeProfitOrderParams({
  symbol,
  closeSide,
  positionSide = 'BOTH',
  triggerPrice,
  workingType = 'MARK_PRICE',
  recvWindow = 5000,
  now = Date.now(),
} = {}) {
  const normalizedPositionSide = String(positionSide ?? 'BOTH').toUpperCase();
  const params = {
    algoType: 'CONDITIONAL',
    symbol: String(symbol ?? '').toUpperCase(),
    side: String(closeSide ?? '').toUpperCase(),
    type: 'TAKE_PROFIT_MARKET',
    triggerPrice: String(triggerPrice),
    closePosition: 'true',
    workingType: String(workingType ?? 'MARK_PRICE').toUpperCase(),
    priceProtect: 'true',
    recvWindow,
    clientAlgoId: `startup_tp_${Number(now).toString(36)}`.slice(0, 36),
  };
  if (normalizedPositionSide !== 'BOTH') params.positionSide = normalizedPositionSide;
  return params;
}

export function resolveStartupTakeProfitTarget({
  side,
  entryPrice,
  leverage,
  trackedTakeProfitPrice = null,
  liquidFlowV2TakeProfitPrice = null,
  pumpTakeProfitPrice = null,
  isLiquidFlowV2 = false,
  isManual = false,
  source = null,
  defaultLongRoePct = 10,
  defaultShortRoePct = 6,
} = {}) {
  const direction = String(side ?? '').trim().toUpperCase();
  const explicitCandidates = [
    ['TRACKED_SIGNAL', trackedTakeProfitPrice],
    ['LIQUID_FLOW_V2_PAPER', liquidFlowV2TakeProfitPrice],
    ['PUMP_SIGNAL', pumpTakeProfitPrice],
  ];
  for (const [targetSource, value] of explicitCandidates) {
    const price = finitePositive(value);
    const entry = finitePositive(entryPrice);
    const correctSide = direction === 'LONG' ? price > entry : direction === 'SHORT' ? price < entry : false;
    if (price && entry && correctSide) return { takeProfitPrice: price, source: targetSource, policyVersion: null };
  }

  // Liquid Flow V2 must keep its signal/paper target. Never invent a fixed ROE
  // target when the V2 snapshot cannot be recovered.
  if (isLiquidFlowV2) return null;

  if (isManual) {
    const manual = resolveOrdersManualTakeProfit({
      side: direction,
      source: BINANCE_MANUAL_SOCKET_SOURCE,
      entryPrice,
      leverage,
    });
    return manual?.applied
      ? {
          takeProfitPrice: manual.takeProfitPrice,
          source: BINANCE_MANUAL_SOCKET_SOURCE,
          policyVersion: manual.version,
        }
      : null;
  }

  const bot = resolveNonLiquidFlowV2TakeProfit({
    side: direction,
    source,
    entryPrice,
    leverage,
    requestedTakeProfitPrice: null,
    longRoePct: defaultLongRoePct,
    shortRoePct: defaultShortRoePct,
  });
  if (bot?.applied) {
    return {
      takeProfitPrice: bot.takeProfitPrice,
      source: String(source ?? 'BOT'),
      policyVersion: bot.version,
    };
  }

  return null;
}
