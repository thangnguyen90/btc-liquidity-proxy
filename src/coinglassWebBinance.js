export const COINGLASS_WEB_BINANCE_VERSION =
  'COINGLASS_WEB_BINANCE_MARKET_V4_RUNTIME_CONTROL_20260821';

export const COINGLASS_WEB_BINANCE_MARGIN_USDT = 2;
export const COINGLASS_WEB_BINANCE_LEVERAGE = 5;
export const COINGLASS_WEB_BINANCE_STOP_LOSS_ROE_PCT = 20;

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function coinglassWebProposalSide(row = {}) {
  if (row?.proposal?.action === 'WAIT_LONG_CONFIRMATION') return 'LONG';
  if (row?.proposal?.action === 'WAIT_SHORT_CONFIRMATION') return 'SHORT';
  return null;
}

export function binancePositionSide(position = {}) {
  const explicit = String(position?.positionSide ?? '').toUpperCase();
  if (explicit === 'LONG' || explicit === 'SHORT') return explicit;
  const amount = finite(position?.positionAmt ?? position?.amt);
  if (amount == null || amount === 0) return null;
  return amount > 0 ? 'LONG' : 'SHORT';
}

export function coinglassWebBinanceDedupeKey(row = {}) {
  const symbol = String(row?.symbol ?? '').trim().toUpperCase();
  const side = coinglassWebProposalSide(row);
  return symbol && side ? `COINGLASS_QUALIFIED:${symbol}:${side}` : '';
}

export function coinglassWebDefaultStopLossPrice({
  side,
  entryPrice,
  leverage = COINGLASS_WEB_BINANCE_LEVERAGE,
  stopLossRoePct = COINGLASS_WEB_BINANCE_STOP_LOSS_ROE_PCT,
} = {}) {
  const entry = finite(entryPrice);
  const lev = finite(leverage);
  const roePct = finite(stopLossRoePct);
  if (!(entry > 0) || !(lev > 0) || !(roePct > 0) || !['LONG', 'SHORT'].includes(side)) return null;
  const distanceFraction = roePct / 100 / lev;
  if (!(distanceFraction > 0 && distanceFraction < 1)) return null;
  return side === 'LONG'
    ? entry * (1 - distanceFraction)
    : entry * (1 + distanceFraction);
}

export function evaluateCoinglassWebBinanceEntry({
  row = {},
  currentPrice,
  positions = [],
  leverage = COINGLASS_WEB_BINANCE_LEVERAGE,
  stopLossRoePct = COINGLASS_WEB_BINANCE_STOP_LOSS_ROE_PCT,
} = {}) {
  const symbol = String(row?.symbol ?? '').trim().toUpperCase();
  const side = coinglassWebProposalSide(row);
  const plan = row?.proposal?.tradePlan ?? {};
  const proposedEntry = finite(plan?.entry?.price);
  const takeProfit = finite(plan?.takeProfit?.price);
  const proposalStopLoss = finite(plan?.stopLoss?.price);
  const stopLoss = coinglassWebDefaultStopLossPrice({
    side,
    entryPrice: proposedEntry,
    leverage,
    stopLossRoePct,
  });
  const mark = finite(currentPrice);
  const base = {
    version: COINGLASS_WEB_BINANCE_VERSION,
    symbol,
    side,
    proposedEntry,
    currentPrice: mark,
    takeProfit,
    stopLoss,
    proposalStopLoss,
    stopLossRoePct: finite(stopLossRoePct),
    leverage: finite(leverage),
  };

  if (row?.qualified !== true) return { ...base, allowed: false, decision: 'BLOCKED_NOT_QUALIFIED' };
  if (row?.status !== 'OK' || row?.stale === true) {
    return { ...base, allowed: false, decision: 'BLOCKED_STALE_SETUP' };
  }
  if (!side || plan?.complete !== true || !(proposedEntry > 0) || !(takeProfit > 0)
    || !(proposalStopLoss > 0) || !(stopLoss > 0)) {
    return { ...base, allowed: false, decision: 'BLOCKED_INVALID_PLAN' };
  }
  if (!(mark > 0)) return { ...base, allowed: false, decision: 'BLOCKED_NO_BINANCE_PRICE' };
  if (!(mark > proposedEntry)) {
    return { ...base, allowed: false, decision: 'WAIT_PRICE_ABOVE_PROPOSED_ENTRY' };
  }

  const protectionStillValid = side === 'LONG'
    ? stopLoss < mark && mark < takeProfit
    : takeProfit < mark && mark < stopLoss;
  if (!protectionStillValid) {
    return { ...base, allowed: false, decision: 'BLOCKED_PRICE_OUTSIDE_TP_SL' };
  }

  const active = (Array.isArray(positions) ? positions : []).filter((position) => {
    const amount = finite(position?.positionAmt ?? position?.amt);
    return String(position?.symbol ?? '').toUpperCase() === symbol && amount != null && amount !== 0;
  });
  const sameSide = active.filter((position) => binancePositionSide(position) === side);
  if (sameSide.length) {
    return { ...base, allowed: false, decision: 'BLOCKED_SAME_SIDE_POSITION', sameSide };
  }
  const opposite = active.filter((position) => binancePositionSide(position) !== side);
  const nonProfitableOpposite = opposite.filter((position) => !(
    finite(position?.unRealizedProfit ?? position?.unrealizedProfit) > 0
  ));
  if (nonProfitableOpposite.length) {
    return {
      ...base,
      allowed: false,
      decision: 'BLOCKED_OPPOSITE_PNL_NOT_POSITIVE',
      opposite,
    };
  }
  return {
    ...base,
    allowed: true,
    decision: opposite.length ? 'CLOSE_PROFITABLE_OPPOSITE_THEN_ENTER' : 'ENTER_MARKET',
    opposite,
  };
}
