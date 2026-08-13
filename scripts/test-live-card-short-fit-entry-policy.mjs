import assert from 'node:assert/strict';
import {
  LIVE_CARD_SHORT_FIT_DEFAULT_MARGIN_USDT,
  LIVE_CARD_SHORT_FIT_ENTRY_POLICY_VERSION,
  LIVE_CARD_SHORT_FIT_KEY,
  evaluateLiveCardShortFitEntry,
  removeBlockedShortFitMatch,
} from '../src/liveCardShortFitEntryPolicy.js';

assert.equal(LIVE_CARD_SHORT_FIT_ENTRY_POLICY_VERSION, 'LIVE_CARD_SHORT_FIT_BC_UTAD_IOC_V1_20260811');
assert.equal(LIVE_CARD_SHORT_FIT_DEFAULT_MARGIN_USDT, 3);

const baseTrade = {
  symbol: 'TESTUSDT',
  side: 'SHORT',
  entryPrice: 100,
  pumpSignalType: 'bc_utad',
};

const allowed = evaluateLiveCardShortFitEntry({
  trade: baseTrade,
  matchedKeys: [LIVE_CARD_SHORT_FIT_KEY],
  currentPrice: 99.9,
});
assert.equal(allowed.allowed, true);
assert.equal(allowed.marginUsdt, 3);
assert.equal(allowed.orderType, 'MARKET');
assert.equal(allowed.retestEnabled, false);
assert(Math.abs(allowed.adverseSlippagePct - 0.1) < 1e-9);

const favorable = evaluateLiveCardShortFitEntry({
  trade: baseTrade,
  matchedKeys: [LIVE_CARD_SHORT_FIT_KEY],
  currentPrice: 100.5,
});
assert.equal(favorable.allowed, true);
assert.equal(favorable.adverseSlippagePct, 0);

const slipped = evaluateLiveCardShortFitEntry({
  trade: baseTrade,
  matchedKeys: [LIVE_CARD_SHORT_FIT_KEY],
  currentPrice: 99.89,
});
assert.equal(slipped.allowed, false);
assert.equal(slipped.decision, 'BLOCKED_SHORT_FIT_ENTRY_SLIPPAGE');
assert.deepEqual(removeBlockedShortFitMatch([LIVE_CARD_SHORT_FIT_KEY], slipped), []);

const wrongSetup = evaluateLiveCardShortFitEntry({
  trade: { ...baseTrade, pumpSignalType: 'early_dump' },
  matchedKeys: [LIVE_CARD_SHORT_FIT_KEY, 'edge:tier:SE_TIER_A'],
  currentPrice: 100,
});
assert.equal(wrongSetup.allowed, false);
assert.equal(wrongSetup.decision, 'BLOCKED_SHORT_FIT_SETUP');
assert.deepEqual(
  removeBlockedShortFitMatch([LIVE_CARD_SHORT_FIT_KEY, 'edge:tier:SE_TIER_A'], wrongSetup),
  ['edge:tier:SE_TIER_A'],
);

const staticPass = evaluateLiveCardShortFitEntry({
  trade: baseTrade,
  matchedKeys: [LIVE_CARD_SHORT_FIT_KEY],
  requireCurrentPrice: false,
});
assert.equal(staticPass.allowed, true);
assert.equal(staticPass.pendingPrice, true);

const unrelated = evaluateLiveCardShortFitEntry({
  trade: { ...baseTrade, pumpSignalType: 'early_dump' },
  matchedKeys: ['edge:tier:SE_TIER_A'],
  currentPrice: 90,
});
assert.equal(unrelated.applies, false);
assert.equal(unrelated.allowed, true);

console.log('live card SHORT_FIT entry policy tests passed');
