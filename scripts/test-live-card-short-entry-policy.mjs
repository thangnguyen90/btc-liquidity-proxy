import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LIVE_CARD_DAY_BEAR_CONTINUE_KEY,
  LIVE_CARD_LIQUID_KZ_TEST_MARGIN_USDT,
  LIVE_CARD_LIQUID_KZ_TEST_MAX_MARKET_SLIPPAGE_PCT,
  LIVE_CARD_LIQUID_KZ_TEST_PROFILE_VERSION,
  LIVE_CARD_LIQUID_KZ_TEST_RETEST_TIMEOUT_MS,
  LIVE_CARD_LIQUID_KZ_TEST_TAKE_PROFIT_ROE_PCT,
  LIVE_CARD_LIQUID_KZ_YEU_UPMID_FLAT_RESET_KEY,
  LIVE_CARD_SHORT_ENTRY_POLICY_VERSION,
  LIVE_CARD_SHORT_FIT_KEY,
  evaluateLiveCardShortEntry,
  liveCardShortEntryMatchedKeys,
} from '../src/liveCardShortEntryPolicy.js';
import { resolveNonLiquidFlowV2TakeProfit } from '../src/shortTakeProfitPolicy.js';

assert.equal(LIVE_CARD_SHORT_ENTRY_POLICY_VERSION, 'LIVE_CARD_SHORT_ENTRY_GUARD_V2_LIQUID_KZ_LIMIT_RETEST_20260816');

const comboKey = 'edge:combo:TEST';
const base = {
  symbol: 'TESTUSDT',
  side: 'SHORT',
  entryPrice: 100,
};

function evaluate(trade, currentPrice, matchedKeys = [comboKey], options = {}) {
  return evaluateLiveCardShortEntry({
    trade: { ...base, ...trade },
    matchedKeys,
    currentPrice,
    ...options,
  });
}

const shortFitPass = evaluate(
  { pumpSignalType: 'bc_utad' },
  99.9,
  [LIVE_CARD_SHORT_FIT_KEY],
);
assert.equal(shortFitPass.allowed, true);
assert.equal(shortFitPass.rule, 'SHORT_FIT_BC_UTAD');
assert.equal(shortFitPass.maxAdverseSlippagePct, 0.1);
assert.equal(shortFitPass.marginUsdt, 3);
assert.deepEqual(liveCardShortEntryMatchedKeys(shortFitPass), [LIVE_CARD_SHORT_FIT_KEY]);

const shortFitBlocked = evaluate(
  { pumpSignalType: 'bc_utad' },
  99.899,
  [LIVE_CARD_SHORT_FIT_KEY, comboKey],
);
assert.equal(shortFitBlocked.allowed, false);
assert.equal(shortFitBlocked.decision, 'BLOCKED_SHORT_ENTRY_SLIPPAGE');
assert.deepEqual(liveCardShortEntryMatchedKeys(shortFitBlocked), []);

const earlyMidPass = evaluate({
  pumpSignalType: 'early_dump',
  pumpCombo: 'EARLY_DUMP | SHORT | 15M | BTC_CORR_YEU | BTC_DOWN_MID | THEO_YEU | GATE_-',
}, 99.4);
assert.equal(earlyMidPass.rule, 'EARLY_DUMP_BTC_DOWN_MID');
assert.equal(earlyMidPass.maxAdverseSlippagePct, 0.6);
assert.equal(earlyMidPass.allowed, true);

const earlyMidBlocked = evaluate({
  pumpSignalType: 'early_dump',
  pumpCombo: 'EARLY_DUMP | SHORT | 15M | BTC_CORR_YEU | BTC_DOWN_MID | THEO_YEU | GATE_-',
}, 99.399);
assert.equal(earlyMidBlocked.allowed, false);

const earlyWeakPass = evaluate({
  pumpSignalType: 'early_dump',
  pumpCombo: 'EARLY_DUMP | SHORT | 15M | BTC_CORR_YEU | BTC_DOWN_WEAK | THEO_YEU | GATE_-',
}, 99);
assert.equal(earlyWeakPass.rule, 'EARLY_DUMP_BTC_DOWN_WEAK');
assert.equal(earlyWeakPass.maxAdverseSlippagePct, 1);
assert.equal(earlyWeakPass.allowed, true);

const dumpWeakPass = evaluate({
  pumpSignalType: 'dump',
  pumpCombo: 'DUMP | SHORT | 15M | BTC_CORR_YEU | BTC_UP_WEAK | THEO_YEU | GATE_-',
}, 99);
assert.equal(dumpWeakPass.rule, 'DUMP_BTC_UP_WEAK');
assert.equal(dumpWeakPass.maxAdverseSlippagePct, 1);
assert.equal(dumpWeakPass.allowed, true);

const otherBlocked = evaluate({
  pumpSignalType: 'early_dump',
  pumpCombo: 'EARLY_DUMP | SHORT | 15M | BTC_CORR_RAC | BTC_UP_STRONG | DOC_LAP | GATE_-',
}, 98.999);
assert.equal(otherBlocked.rule, 'SHORT_OTHER_HARD_CAP');
assert.equal(otherBlocked.maxAdverseSlippagePct, 1);
assert.equal(otherBlocked.allowed, false);

const favorable = evaluate({ pumpSignalType: 'dump' }, 101);
assert.equal(favorable.allowed, true);
assert.equal(favorable.adverseSlippagePct, 0);

const liquidKzMarket = evaluate({}, 99.96, [LIVE_CARD_LIQUID_KZ_YEU_UPMID_FLAT_RESET_KEY]);
assert.equal(liquidKzMarket.allowed, true);
assert.equal(liquidKzMarket.rule, 'LIQUID_KZ_SHORT_YEU_UPMID_FLAT_RESET_TEST');
assert.equal(liquidKzMarket.testProfileApplies, true);
assert.equal(liquidKzMarket.testProfileVersion, LIVE_CARD_LIQUID_KZ_TEST_PROFILE_VERSION);
assert.equal(liquidKzMarket.marginUsdt, LIVE_CARD_LIQUID_KZ_TEST_MARGIN_USDT);
assert.equal(liquidKzMarket.takeProfitRoePct, LIVE_CARD_LIQUID_KZ_TEST_TAKE_PROFIT_ROE_PCT);
assert.equal(liquidKzMarket.maxAdverseSlippagePct, LIVE_CARD_LIQUID_KZ_TEST_MAX_MARKET_SLIPPAGE_PCT);
assert.equal(liquidKzMarket.orderType, 'MARKET');

const liquidKzRetest = evaluate({}, 99.94, [LIVE_CARD_LIQUID_KZ_YEU_UPMID_FLAT_RESET_KEY]);
assert.equal(liquidKzRetest.allowed, true);
assert.equal(liquidKzRetest.decision, 'SHORT_ENTRY_LIMIT_RETEST');
assert.equal(liquidKzRetest.orderType, 'LIMIT');
assert.equal(liquidKzRetest.limitPrice, 100);
assert.equal(liquidKzRetest.retestTimeoutMs, LIVE_CARD_LIQUID_KZ_TEST_RETEST_TIMEOUT_MS);
assert.deepEqual(
  liveCardShortEntryMatchedKeys(liquidKzRetest),
  [LIVE_CARD_LIQUID_KZ_YEU_UPMID_FLAT_RESET_KEY],
);
const liquidKzTp = resolveNonLiquidFlowV2TakeProfit({
  side: 'SELL',
  source: 'live-card-whitelist-liquid',
  entryPrice: 100,
  leverage: 10,
  requestedTakeProfitPrice: 99.4,
  shortRoePct: LIVE_CARD_LIQUID_KZ_TEST_TAKE_PROFIT_ROE_PCT,
});
assert.equal(liquidKzTp.applied, true);
assert.equal(liquidKzTp.roePct, 5);
assert.equal(liquidKzTp.takeProfitPrice, 99.5);

const dayBearOnly = evaluate(
  { pumpSignalType: 'dump' },
  null,
  [LIVE_CARD_DAY_BEAR_CONTINUE_KEY],
  { requireCurrentPrice: false },
);
assert.equal(dayBearOnly.allowed, false);
assert.equal(dayBearOnly.decision, 'BLOCKED_DAY_BEAR_OBSERVE_ONLY');
assert.deepEqual(liveCardShortEntryMatchedKeys(dayBearOnly), []);

const dayBearWithCombo = evaluate(
  { pumpSignalType: 'dump' },
  null,
  [LIVE_CARD_DAY_BEAR_CONTINUE_KEY, comboKey],
  { requireCurrentPrice: false },
);
assert.equal(dayBearWithCombo.allowed, true);
assert.equal(dayBearWithCombo.pendingPrice, true);
assert.deepEqual(liveCardShortEntryMatchedKeys(dayBearWithCombo), [comboKey]);

const invalidShortFitWithCombo = evaluate(
  { pumpSignalType: 'early_dump' },
  null,
  [LIVE_CARD_SHORT_FIT_KEY, comboKey],
  { requireCurrentPrice: false },
);
assert.equal(invalidShortFitWithCombo.allowed, true);
assert.deepEqual(liveCardShortEntryMatchedKeys(invalidShortFitWithCombo), [comboKey]);

const noPrice = evaluate({ pumpSignalType: 'dump' }, null);
assert.equal(noPrice.allowed, false);
assert.equal(noPrice.decision, 'BLOCKED_SHORT_MARK_UNAVAILABLE');

const longUnaffected = evaluateLiveCardShortEntry({
  trade: { ...base, side: 'LONG' },
  matchedKeys: [comboKey],
  requireCurrentPrice: true,
});
assert.equal(longUnaffected.allowed, true);
assert.equal(longUnaffected.applies, false);
assert.deepEqual(liveCardShortEntryMatchedKeys(longUnaffected), [comboKey]);

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(serverSource, /shortEntryPolicy\.testProfileApplies && shortEntryPolicy\.allowed/);
assert.match(serverSource, /testTakeProfitRoePct \/ 100 \/ leverage/);
assert.match(serverSource, /orderType: entryOrderType/);
assert.match(serverSource, /limitPrice: entryLimitPrice/);
assert.match(serverSource, /async function expireLiveCardLimitRetestEntries\(\)/);
assert.match(serverSource, /entryRetestExpiryState: 'CANCELLED_NO_FILL'/);
assert.match(serverSource, /outcome: 'ENTRY_RETEST_PARTIAL_ABORT'/);
assert.match(serverSource, /liquidKillZoneTestProfile: \{/);
assert.match(serverSource, /marketFallback: false/);

console.log('live card generalized SHORT entry policy tests passed');
