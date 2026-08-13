export const LIVE_CARD_SHORT_FIT_ENTRY_POLICY_VERSION = 'LIVE_CARD_SHORT_FIT_BC_UTAD_IOC_V1_20260811';
export const LIVE_CARD_SHORT_FIT_KEY = 'edge:best-profile:SHORT_FIT';
export const LIVE_CARD_SHORT_FIT_DEFAULT_MARGIN_USDT = 3;
export const LIVE_CARD_SHORT_FIT_DEFAULT_MAX_ADVERSE_SLIPPAGE_PCT = 0.1;

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function upper(value) {
  return String(value ?? '').trim().toUpperCase();
}

function setupOf(trade = {}) {
  const labelSetup = String(trade.edgeShortLabelKey ?? '').split('|')[0];
  return upper(
    trade.edgeShortBestProfileSetup
      ?? trade.pumpSignalType
      ?? trade.signalType
      ?? trade.setup
      ?? labelSetup,
  );
}

function signalEntryOf(trade = {}) {
  return finite(
    trade.entryPrice
      ?? trade.entry
      ?? trade.setupEntry
      ?? trade.entryPlan?.entryPrice
      ?? trade.signalMarkPrice,
  );
}

export function evaluateLiveCardShortFitEntry({
  trade = {},
  matchedKeys = [],
  currentPrice = null,
  requireCurrentPrice = true,
  maxAdverseSlippagePct = LIVE_CARD_SHORT_FIT_DEFAULT_MAX_ADVERSE_SLIPPAGE_PCT,
  marginUsdt = LIVE_CARD_SHORT_FIT_DEFAULT_MARGIN_USDT,
} = {}) {
  const applies = Array.isArray(matchedKeys) && matchedKeys.includes(LIVE_CARD_SHORT_FIT_KEY);
  const side = upper(trade.side);
  const setup = setupOf(trade);
  const signalEntryPrice = signalEntryOf(trade);
  const markPrice = finite(currentPrice);
  const maxAdverse = finite(maxAdverseSlippagePct);
  const margin = finite(marginUsdt);
  const base = {
    applies,
    allowed: true,
    version: LIVE_CARD_SHORT_FIT_ENTRY_POLICY_VERSION,
    key: LIVE_CARD_SHORT_FIT_KEY,
    side,
    setup,
    signalEntryPrice,
    currentPrice: markPrice,
    adverseSlippagePct: null,
    maxAdverseSlippagePct: maxAdverse,
    marginUsdt: margin > 0 ? margin : LIVE_CARD_SHORT_FIT_DEFAULT_MARGIN_USDT,
    orderType: 'MARKET',
    retestEnabled: false,
    reason: 'SHORT_FIT key not matched; policy does not apply',
  };
  if (!applies) return base;
  if (side !== 'SHORT') {
    return { ...base, allowed: false, decision: 'BLOCKED_SHORT_FIT_SIDE', reason: `SHORT_FIT requires SHORT, got ${side || 'NO_SIDE'}` };
  }
  if (setup !== 'BC_UTAD') {
    return { ...base, allowed: false, decision: 'BLOCKED_SHORT_FIT_SETUP', reason: `SHORT_FIT real entry requires BC_UTAD, got ${setup || 'NO_SETUP'}` };
  }
  if (!(signalEntryPrice > 0)) {
    return { ...base, allowed: false, decision: 'BLOCKED_SHORT_FIT_SIGNAL_ENTRY', reason: 'SHORT_FIT signal entry is unavailable' };
  }
  if (!requireCurrentPrice && !(markPrice > 0)) {
    return { ...base, pendingPrice: true, reason: 'SHORT_FIT static classification passed; waiting for Binance last price' };
  }
  if (!(markPrice > 0)) {
    return { ...base, allowed: false, decision: 'BLOCKED_SHORT_FIT_MARK_UNAVAILABLE', reason: 'SHORT_FIT Binance last price is unavailable' };
  }
  if (!(maxAdverse >= 0)) {
    return { ...base, allowed: false, decision: 'BLOCKED_SHORT_FIT_CONFIG', reason: 'SHORT_FIT max adverse slippage is invalid' };
  }

  // For SHORT, a current price below the signal entry is adverse because the
  // bot sells lower. A higher current price is favorable and is not capped.
  const adverseSlippagePct = Math.max(0, ((signalEntryPrice - markPrice) / signalEntryPrice) * 100);
  if (adverseSlippagePct > maxAdverse + 1e-12) {
    return {
      ...base,
      allowed: false,
      decision: 'BLOCKED_SHORT_FIT_ENTRY_SLIPPAGE',
      currentPrice: markPrice,
      adverseSlippagePct,
      reason: `SHORT_FIT adverse entry slippage ${adverseSlippagePct.toFixed(4)}% > ${maxAdverse.toFixed(4)}%; skip without retest`,
    };
  }
  return {
    ...base,
    allowed: true,
    decision: 'SHORT_FIT_ENTRY_ALLOWED',
    currentPrice: markPrice,
    adverseSlippagePct,
    reason: `SHORT_FIT BC_UTAD adverse entry slippage ${adverseSlippagePct.toFixed(4)}% <= ${maxAdverse.toFixed(4)}%; MARKET now`,
  };
}

export function removeBlockedShortFitMatch(matchedKeys = [], policy = {}) {
  if (policy.applies !== true || policy.allowed !== false) return [...matchedKeys];
  return matchedKeys.filter((key) => key !== LIVE_CARD_SHORT_FIT_KEY);
}
