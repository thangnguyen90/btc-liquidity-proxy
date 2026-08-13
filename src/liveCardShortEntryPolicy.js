import {
  LIVE_CARD_SHORT_FIT_DEFAULT_MARGIN_USDT,
  LIVE_CARD_SHORT_FIT_ENTRY_POLICY_VERSION,
  LIVE_CARD_SHORT_FIT_KEY,
} from './liveCardShortFitEntryPolicy.js';

export const LIVE_CARD_SHORT_ENTRY_POLICY_VERSION = 'LIVE_CARD_SHORT_ENTRY_GUARD_V1_20260812';
export const LIVE_CARD_DAY_BEAR_CONTINUE_KEY = 'edge:best-risk-phase:DAY_BEAR_CONTINUE';
export const LIVE_CARD_SHORT_DEFAULT_MAX_ADVERSE_SLIPPAGE_PCT = 1;
export const LIVE_CARD_SHORT_EARLY_DOWN_MID_MAX_ADVERSE_SLIPPAGE_PCT = 0.6;
export const LIVE_CARD_SHORT_EARLY_DOWN_WEAK_MAX_ADVERSE_SLIPPAGE_PCT = 1;
export const LIVE_CARD_SHORT_DUMP_UP_WEAK_MAX_ADVERSE_SLIPPAGE_PCT = 1;

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

function comboOf(trade = {}) {
  return upper(
    trade.pumpCombo
      ?? trade.signalCombo
      ?? trade.recommendationCombo
      ?? trade.liquidCombo
      ?? trade.combo,
  );
}

function nonNegative(value, fallback) {
  const parsed = finite(value);
  return parsed != null && parsed >= 0 ? parsed : fallback;
}

function positive(value, fallback) {
  const parsed = finite(value);
  return parsed != null && parsed > 0 ? parsed : fallback;
}

function shortRule({ trade, matchedKeys, thresholds }) {
  const setup = setupOf(trade);
  const combo = comboOf(trade);
  if (matchedKeys.includes(LIVE_CARD_SHORT_FIT_KEY) && setup === 'BC_UTAD') {
    return {
      code: 'SHORT_FIT_BC_UTAD',
      maxAdverseSlippagePct: thresholds.shortFit,
      shortFitApplies: true,
    };
  }
  if (setup === 'EARLY_DUMP' && combo.includes('BTC_DOWN_MID')) {
    return {
      code: 'EARLY_DUMP_BTC_DOWN_MID',
      maxAdverseSlippagePct: thresholds.earlyDownMid,
      shortFitApplies: false,
    };
  }
  if (setup === 'EARLY_DUMP' && combo.includes('BTC_DOWN_WEAK')) {
    return {
      code: 'EARLY_DUMP_BTC_DOWN_WEAK',
      maxAdverseSlippagePct: thresholds.earlyDownWeak,
      shortFitApplies: false,
    };
  }
  if (setup === 'DUMP' && combo.includes('BTC_UP_WEAK')) {
    return {
      code: 'DUMP_BTC_UP_WEAK',
      maxAdverseSlippagePct: thresholds.dumpUpWeak,
      shortFitApplies: false,
    };
  }
  return {
    code: 'SHORT_OTHER_HARD_CAP',
    maxAdverseSlippagePct: thresholds.other,
    shortFitApplies: false,
  };
}

/**
 * Applies the real-entry guard after whitelist matching and before Binance
 * MARKET submission. DAY_BEAR and invalid SHORT_FIT grants are removed first;
 * another independently matched real card may still authorize the trade.
 */
export function evaluateLiveCardShortEntry({
  trade = {},
  matchedKeys = [],
  currentPrice = null,
  requireCurrentPrice = true,
  shortFitMaxAdverseSlippagePct = 0.1,
  earlyDownMidMaxAdverseSlippagePct = LIVE_CARD_SHORT_EARLY_DOWN_MID_MAX_ADVERSE_SLIPPAGE_PCT,
  earlyDownWeakMaxAdverseSlippagePct = LIVE_CARD_SHORT_EARLY_DOWN_WEAK_MAX_ADVERSE_SLIPPAGE_PCT,
  dumpUpWeakMaxAdverseSlippagePct = LIVE_CARD_SHORT_DUMP_UP_WEAK_MAX_ADVERSE_SLIPPAGE_PCT,
  otherMaxAdverseSlippagePct = LIVE_CARD_SHORT_DEFAULT_MAX_ADVERSE_SLIPPAGE_PCT,
  shortFitMarginUsdt = LIVE_CARD_SHORT_FIT_DEFAULT_MARGIN_USDT,
} = {}) {
  const originalMatchedKeys = Array.isArray(matchedKeys) ? [...matchedKeys] : [];
  const side = upper(trade.side);
  const setup = setupOf(trade);
  const removedObserveOnlyKeys = originalMatchedKeys.filter((key) => key === LIVE_CARD_DAY_BEAR_CONTINUE_KEY);
  const removedInvalidShortFitKeys = originalMatchedKeys.filter((key) => (
    key === LIVE_CARD_SHORT_FIT_KEY && (side !== 'SHORT' || setup !== 'BC_UTAD')
  ));
  const filteredMatchedKeys = originalMatchedKeys.filter((key) => (
    key !== LIVE_CARD_DAY_BEAR_CONTINUE_KEY
    && !(key === LIVE_CARD_SHORT_FIT_KEY && (side !== 'SHORT' || setup !== 'BC_UTAD'))
  ));
  const base = {
    version: LIVE_CARD_SHORT_ENTRY_POLICY_VERSION,
    legacyShortFitVersion: LIVE_CARD_SHORT_FIT_ENTRY_POLICY_VERSION,
    applies: side === 'SHORT',
    allowed: true,
    side,
    setup,
    rule: side === 'SHORT' ? 'SHORT_OTHER_HARD_CAP' : 'NOT_SHORT',
    originalMatchedKeys,
    filteredMatchedKeys,
    removedObserveOnlyKeys,
    removedInvalidShortFitKeys,
    signalEntryPrice: signalEntryOf(trade),
    currentPrice: finite(currentPrice),
    adverseSlippagePct: null,
    maxAdverseSlippagePct: null,
    shortFitApplies: false,
    marginUsdt: positive(shortFitMarginUsdt, LIVE_CARD_SHORT_FIT_DEFAULT_MARGIN_USDT),
    orderType: 'MARKET',
    retestEnabled: false,
    decision: side === 'SHORT' ? 'SHORT_ENTRY_PENDING_PRICE' : 'NOT_SHORT',
    reason: side === 'SHORT' ? 'SHORT entry is waiting for Binance last price' : 'LONG is outside the SHORT entry guard',
  };

  if (!filteredMatchedKeys.length) {
    const decision = removedObserveOnlyKeys.length
      ? 'BLOCKED_DAY_BEAR_OBSERVE_ONLY'
      : 'BLOCKED_SHORT_FIT_SETUP';
    return {
      ...base,
      allowed: false,
      decision,
      reason: removedObserveOnlyKeys.length
        ? 'DAY_BEAR_CONTINUE is observe-only and cannot independently authorize a Binance order'
        : `SHORT_FIT real entry requires SHORT + BC_UTAD, got ${side || 'NO_SIDE'} + ${setup || 'NO_SETUP'}`,
    };
  }
  if (side !== 'SHORT') {
    return { ...base, decision: 'NOT_SHORT', reason: 'LONG is outside the SHORT entry guard' };
  }

  const thresholds = {
    shortFit: nonNegative(shortFitMaxAdverseSlippagePct, 0.1),
    earlyDownMid: nonNegative(
      earlyDownMidMaxAdverseSlippagePct,
      LIVE_CARD_SHORT_EARLY_DOWN_MID_MAX_ADVERSE_SLIPPAGE_PCT,
    ),
    earlyDownWeak: nonNegative(
      earlyDownWeakMaxAdverseSlippagePct,
      LIVE_CARD_SHORT_EARLY_DOWN_WEAK_MAX_ADVERSE_SLIPPAGE_PCT,
    ),
    dumpUpWeak: nonNegative(
      dumpUpWeakMaxAdverseSlippagePct,
      LIVE_CARD_SHORT_DUMP_UP_WEAK_MAX_ADVERSE_SLIPPAGE_PCT,
    ),
    other: nonNegative(otherMaxAdverseSlippagePct, LIVE_CARD_SHORT_DEFAULT_MAX_ADVERSE_SLIPPAGE_PCT),
  };
  const rule = shortRule({ trade, matchedKeys: filteredMatchedKeys, thresholds });
  const ruleBase = {
    ...base,
    rule: rule.code,
    shortFitApplies: rule.shortFitApplies,
    maxAdverseSlippagePct: rule.maxAdverseSlippagePct,
  };
  if (!(ruleBase.signalEntryPrice > 0)) {
    return {
      ...ruleBase,
      allowed: false,
      decision: 'BLOCKED_SHORT_SIGNAL_ENTRY',
      reason: `${rule.code} signal entry is unavailable`,
    };
  }
  if (!requireCurrentPrice && !(ruleBase.currentPrice > 0)) {
    return {
      ...ruleBase,
      pendingPrice: true,
      decision: 'SHORT_ENTRY_PENDING_PRICE',
      reason: `${rule.code} static classification passed; waiting for Binance last price`,
    };
  }
  if (!(ruleBase.currentPrice > 0)) {
    return {
      ...ruleBase,
      allowed: false,
      decision: 'BLOCKED_SHORT_MARK_UNAVAILABLE',
      reason: `${rule.code} Binance last price is unavailable`,
    };
  }

  const adverseSlippagePct = Math.max(
    0,
    ((ruleBase.signalEntryPrice - ruleBase.currentPrice) / ruleBase.signalEntryPrice) * 100,
  );
  if (adverseSlippagePct > rule.maxAdverseSlippagePct + 1e-12) {
    return {
      ...ruleBase,
      allowed: false,
      adverseSlippagePct,
      decision: 'BLOCKED_SHORT_ENTRY_SLIPPAGE',
      reason: `${rule.code} adverse SHORT entry slippage ${adverseSlippagePct.toFixed(4)}% > ${rule.maxAdverseSlippagePct.toFixed(4)}%; skip without retest`,
    };
  }
  return {
    ...ruleBase,
    allowed: true,
    adverseSlippagePct,
    decision: 'SHORT_ENTRY_ALLOWED',
    reason: `${rule.code} adverse SHORT entry slippage ${adverseSlippagePct.toFixed(4)}% <= ${rule.maxAdverseSlippagePct.toFixed(4)}%; MARKET now`,
  };
}

export function liveCardShortEntryMatchedKeys(policy = {}) {
  if (!Array.isArray(policy.filteredMatchedKeys)) return [];
  if (policy.applies === true && policy.allowed === false) return [];
  return [...policy.filteredMatchedKeys];
}

export {
  LIVE_CARD_SHORT_FIT_ENTRY_POLICY_VERSION,
  LIVE_CARD_SHORT_FIT_KEY,
};
