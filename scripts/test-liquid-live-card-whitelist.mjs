import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LIQUID_LIVE_CARD_WHITELIST_VERSION,
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

assert.equal(
  LIQUID_LIVE_CARD_WHITELIST_VERSION,
  'LIVE_CARD_WHITELIST_V16_FADING_WAVE_LIVE_PUMP_20260818',
);

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
  liquidShortUpthrustMatched: true,
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
assert(keys.includes('spring-reversal:SHORT_UPTHRUST'));
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
assert.equal(
  normalizeLiquidLiveCardKey('spring-reversal:LONG_SPRING'),
  'spring-reversal:LONG_SPRING',
);
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
assert.equal(
  normalizeLiquidLiveCardKey('heatmap-v2:UP_SWEEP_SHORT_READY'),
  'heatmap-v2:UP_SWEEP_SHORT_READY',
);
assert.equal(
  normalizeLiquidLiveCardKey('heatmap-v2:HTF_BEAR_15M_EMA99_PUMP_REJECT'),
  'heatmap-v2:HTF_BEAR_15M_EMA99_PUMP_REJECT',
);
assert.equal(
  normalizeLiquidLiveCardKey('heatmap-v2:HTF_BULL_15M_EMA99_DUMP_RECLAIM'),
  'heatmap-v2:HTF_BULL_15M_EMA99_DUMP_RECLAIM',
);
assert.equal(
  normalizeLiquidLiveCardKey('heatmap-v2:PUMP_DISTRIBUTION_WATCH'),
  'heatmap-v2:PUMP_DISTRIBUTION_WATCH',
);
assert.equal(
  normalizeLiquidLiveCardKey('heatmap-v2:PUMP_DISTRIBUTION_SHORT_READY'),
  'heatmap-v2:PUMP_DISTRIBUTION_SHORT_READY',
);
for (const key of [
  'heatmap-v2:UP_SWEEP_SHORT_WATCH',
  'heatmap-v2:DOWN_SWEEP_LONG_WATCH',
  'heatmap-v2:POST_PUMP_BASE_ABSORPTION_WATCH',
  'heatmap-v2:POST_PUMP_SHORT_SQUEEZE_LONG_READY',
  'heatmap-v2:POST_PUMP_SHORT_SQUEEZE_PRIME',
  'heatmap-v2:POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY',
  'heatmap-v2:FADING_WAVE_LIVE_PUMP_SHORT_READY',
  'heatmap-v2:PUMP_FLUSH_RECLAIM_LONG_READY',
]) {
  assert.equal(normalizeLiquidLiveCardKey(key), key);
  assert.equal(matchLiveCardWhitelistKeys([key], []).allowed, false);
  assert.equal(matchLiveCardWhitelistKeys([key], [key]).allowed, true);
}
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

const liquidKzTestKey = 'cycle-stable:LIQUID_KILL_ZONE | SHORT | 15m | BTC_CORR_YEU | BTC_UP_MID | THEO_YEU | GATE_TEST_LIQUID_SHORT_BTC_COUNTER || CYCLE DAY_FLAT | RSI4_RESET';
const liquidKzTestTrade = {
  side: 'SHORT',
  marginUsdt: 10,
  liquidCombo: 'LIQUID_KILL_ZONE | SHORT | 15m | BTC_CORR_YEU | BTC_UP_MID | THEO_YEU | GATE_TEST_LIQUID_SHORT_BTC_COUNTER',
  btcHealth: { pct24h: 0, rsi4h: 45 },
};
assert(liquidLiveCardKeysOfTrade(liquidKzTestTrade).includes(liquidKzTestKey));
const [whitelistState, realEnabledState] = await Promise.all([
  readFile(new URL('../data/liquid-live-card-whitelist.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../data/live-card-real-enabled.json', import.meta.url), 'utf8').then(JSON.parse),
]);
assert(whitelistState.enabledKeys.includes(liquidKzTestKey));
assert(realEnabledState.enabledKeys.includes(liquidKzTestKey));

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
