import assert from 'node:assert/strict';
import {
  LIVE_CARD_COMBO_ENTRY_MATCH_VERSION,
  liveCardComboKeyAtEntry,
  liveCardKey,
  liveCardKeysFromRows,
  liquidLiveCardKeysOfTrade,
  matchLiveCardWhitelistKeys,
  matchLiquidLiveCardWhitelist,
  normalizeLiquidLiveCardKey,
  normalizeLiquidLiveCardKeys,
} from '../src/liquidLiveCardWhitelist.js';

const trade = {
  side: 'SHORT',
  marginUsdt: 10,
  liquidStage2Tier: 'A_PLUS',
  liquidStage3Tier: 'GOOD_PLUS',
  liquidLongCorrReboundMatched: true,
  liquidStableMechanismMatched: true,
  liquidStableMechanismCode: 'SHORT_FAILED_BOUNCE',
  liquidStage4Tier: 'ACTIVE',
  liquidEdgeActivePointTier: 'GOOD',
  liquidBtcWaveTier: 'CONTINUATION',
  liquidWaveContinuationTier: 'SHORT_CONTINUATION_EDGE_INTACT',
  liquidLongPointPhaseTier: 'BALANCED',
  liquidRunner30Matched: true,
  liquidRunnerDirectionTier: 'PRIME',
  liquidLiveShortWaveState: 'SHORT_IMPULSE',
  liquidLongBtcExpansionMatched: true,
  liquidLongBtcExpansionSelected: true,
  liquidLongBtcExpansionPrimeTest: true,
  liquidComboBtcBreadthMatched: true,
  liquidComboBtcBreadthSide: 'SHORT',
  liquidComboBtcBreadthTier: 'PRIME_TEST',
  liquidCombo: 'LIQUID_KILL_ZONE | SHORT | 15m | BTC_CORR_THEO',
  btcHealth: { pct24h: -1.2, rsi4h: 46 },
};

const keys = liquidLiveCardKeysOfTrade(trade);
assert(keys.includes('overview:all'));
assert(keys.includes('overview:margin:test10'));
assert(keys.includes('stage3:SHORT:GOOD_PLUS'));
assert(keys.includes('long-corr-rebound:GOOD'));
assert(keys.includes('stable-mechanism:SHORT_FAILED_BOUNCE'));
assert(keys.includes('long-btc-expansion:CANDIDATE'));
assert(keys.includes('long-btc-expansion:SELECTED'));
assert(keys.includes('long-btc-expansion:PRIME_TEST'));
assert(keys.includes('combo-btc-breadth:SHORT:PRIME_TEST'));
assert(keys.includes('stage4:SHORT:GOOD_PLUS:ACTIVE'));
assert(keys.includes('edge-point:GOOD'));
assert(keys.includes('long-point:BALANCED'));
assert(keys.includes('runner30:CANDIDATE'));
assert(keys.includes('market-wave:SHORT_SCORE:SHORT_IMPULSE:SHORT'));
assert(keys.some((key) => key.startsWith('cycle-stable:')));

assert.equal(matchLiquidLiveCardWhitelist(trade, []).allowed, false);
assert.equal(matchLiquidLiveCardWhitelist(trade, ['stage4:SHORT:GOOD_PLUS:ACTIVE']).allowed, true);
assert.equal(matchLiquidLiveCardWhitelist(trade, ['long-corr-rebound:GOOD']).allowed, true);
assert.equal(matchLiquidLiveCardWhitelist(trade, ['stage4:LONG:GOOD_PLUS:ACTIVE']).allowed, false);
assert.deepEqual(normalizeLiquidLiveCardKeys(['stage2:A', 'stage2:A', 'bad:key']), ['stage2:A']);
assert.equal(normalizeLiquidLiveCardKey('bad:key'), null);
assert.equal(normalizeLiquidLiveCardKey('stage2:A\nB'), null);

const emaKey = liveCardKey('ema', 'combo', 'SQUEEZE | LONG | 15m');
const edgeKey = liveCardKey('edge', 'tier', 'SE_TIER_A');
const recommendedKey = liveCardKey('recommended', 'backtest-confidence', 'BT_PRIME');
assert.equal(emaKey, 'ema:combo:SQUEEZE%20%7C%20LONG%20%7C%2015m');
assert.equal(edgeKey, 'edge:tier:SE_TIER_A');
assert.equal(recommendedKey, 'recommended:backtest-confidence:BT_PRIME');
assert.equal(normalizeLiquidLiveCardKey(emaKey), emaKey);
assert.equal(normalizeLiquidLiveCardKey(edgeKey), edgeKey);
assert.equal(normalizeLiquidLiveCardKey(recommendedKey), recommendedKey);
assert.deepEqual(
  liveCardKeysFromRows('ema', 'combo', [
    { key: 'GOOD', total: 2 },
    { key: 'EMPTY', total: 0 },
  ]),
  ['ema:combo:GOOD'],
);
assert.equal(
  matchLiveCardWhitelistKeys([emaKey, edgeKey], [recommendedKey, edgeKey]).allowed,
  true,
);
assert.deepEqual(
  matchLiveCardWhitelistKeys([emaKey, edgeKey], [recommendedKey, edgeKey]).matchedKeys,
  [edgeKey],
);
assert.equal(matchLiveCardWhitelistKeys([emaKey], [recommendedKey]).allowed, false);

const openEdgeCombo = 'DUMP | SHORT | 15M | BTC_CORR_YEU | BTC_UP_WEAK | THEO_YEU | GATE_-';
const openEdgeComboKey = liveCardComboKeyAtEntry('edge', openEdgeCombo);
assert.equal(LIVE_CARD_COMBO_ENTRY_MATCH_VERSION, 'LIVE_CARD_COMBO_ENTRY_MATCH_V1_20260804');
assert.equal(
  openEdgeComboKey,
  'edge:combo:DUMP%20%7C%20SHORT%20%7C%2015M%20%7C%20BTC_CORR_YEU%20%7C%20BTC_UP_WEAK%20%7C%20THEO_YEU%20%7C%20GATE_-',
);
assert.equal(matchLiveCardWhitelistKeys([openEdgeComboKey], [openEdgeComboKey]).allowed, true);
assert.equal(liveCardComboKeyAtEntry('edge', '-'), null);
assert.equal(liveCardComboKeyAtEntry('edge', 'NO_DATA'), null);

console.log('liquid live card whitelist tests passed');
