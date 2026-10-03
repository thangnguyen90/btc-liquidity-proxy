import { impulseRegimeTradeKey, sessionTradeKey } from '../public/btc-session-model.js';
import { impulseEntryTradeKey } from '../public/impulse-entry-model.js';
import { pumpBaseTradeKey } from '../public/pump-base-recovery-model.js';
import { pumpSupportTradeKey } from '../public/pump-support-model.js';
import { dumpCapTradeKey } from '../public/dump-cap-rejection-model.js';
import { dumpResistanceTradeKey } from '../public/dump-resistance-model.js';
import { toxicTwoSideTradeKey } from '../public/toxic-two-side-model.js';
import { btcHourlyEntryForecastTradeKey } from '../public/btc-hourly-entry-forecast-model.js';
export const LIQUID_LIVE_CARD_WHITELIST_VERSION = 'LIVE_CARD_WHITELIST_V21_BTC_HOURLY_FORECAST_OBSERVE_20261001';
export const LIVE_CARD_COMBO_ENTRY_MATCH_VERSION = 'LIVE_CARD_COMBO_ENTRY_MATCH_V1_20260804';

const ALLOWED_PREFIXES = [
  'overview:',
  'stage2:',
  'stage3:',
  'long-corr-rebound:',
  'stable-mechanism:',
  'long-btc-expansion:',
  'combo-btc-breadth:',
  'stage4:',
  'edge-point:',
  'btc-wave:',
  'wave-continuation:',
  'long-session:',
  'long-market:',
  'long-mechanism:',
  'spring-reversal:',
  'long-point:',
  'runner30:',
  'runner-direction:',
  'market-wave:',
  'combo:',
  'cycle-stable:',
  'cycle-forming:',
  'cycle-today:',
  'ema:',
  'edge:',
  'recommended:',
  'heatmap-v2:',
];

function upper(value) {
  return String(value ?? '').trim().toUpperCase();
}

function addTierKey(keys, prefix, ...parts) {
  const normalized = parts.map(upper);
  if (normalized.some((part) => !part || part === 'UNRATED')) return;
  keys.add(`${prefix}:${normalized.join(':')}`);
}

export function normalizeLiquidLiveCardKey(value) {
  const key = String(value ?? '').trim();
  if (!key || key.length > 1000 || /[\u0000-\u001f\u007f]/.test(key)) return null;
  if (/^btc-session:(LONG|SHORT):(NIGHT|MORNING|OTHER)$/.test(key)) return key;
  if (/^btc-session:IMPULSE:(SW_UP|SW_DOWN|NEUTRAL|SHOCK|STALE)$/.test(key)) return key;
  if (/^btc-session:ENTRY:(LONG|SHORT):(RETEST|BASE_BREAK)$/.test(key)) return key;
  if (/^pump-base:(5m|15m|1h|4h|1d):(AT_BASE|RECOVERING|VOLUME_RECOVERY|WEAKENED)$/.test(key)) return key;
  if (/^pump-support:(5m|15m|1h|4h|1d):(READY|WAIT_RETEST|WAIT_CONFIRM|BROKEN|NO_ROOM|WAIT_LIVE|STALE|NO_SUPPORT)$/.test(key)) return key;
  if (/^dump-cap:(5m|15m|1h|4h|1d):(AT_CAP|REJECTING|VOLUME_REJECTION|INVALIDATED)$/.test(key)) return key;
  if (/^dump-resistance:(5m|15m|1h|4h|1d):(READY|WAIT_RETEST|WAIT_CONFIRM|BROKEN|NO_ROOM|WAIT_LIVE|STALE|NO_RESISTANCE)$/.test(key)) return key;
  if (/^toxic-two-side:(EXTREME|HIGH|WATCH|NORMAL)$/.test(key)) return key;
  if (/^btc-hourly-forecast:(LONG|SHORT|NEUTRAL)$/.test(key)) return key;
  return ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix)) ? key : null;
}

export function normalizeLiquidLiveCardKeys(values, { maxKeys = 2000 } = {}) {
  const normalized = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const key = normalizeLiquidLiveCardKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
    if (normalized.length >= maxKeys) break;
  }
  return normalized.sort();
}

export function liveCardKey(page, group, value) {
  const normalizedPage = String(page ?? '').trim().toLowerCase();
  const normalizedGroup = String(group ?? '').trim().toLowerCase();
  const normalizedValue = String(value ?? '').trim();
  if (!['ema', 'edge', 'recommended'].includes(normalizedPage)) return null;
  if (!normalizedGroup || !normalizedValue) return null;
  return `${normalizedPage}:${normalizedGroup}:${encodeURIComponent(normalizedValue)}`;
}

// Build the combo key from the entry snapshot itself. This must not depend on
// closed-trade statistics: a Binance decision is evaluated while the new paper
// trade is still OPEN, before the combo can have any closed rows.
export function liveCardComboKeyAtEntry(page, combo) {
  const normalizedCombo = String(combo ?? '').trim();
  if (!normalizedCombo || normalizedCombo === '-' || upper(normalizedCombo).includes('NO_DATA')) {
    return null;
  }
  return liveCardKey(page, 'combo', normalizedCombo);
}

export function liveCardKeysFromRows(page, group, rows = [], keyOf = (row) => row?.key) {
  const keys = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (Number(row?.total ?? 0) <= 0) continue;
    const key = liveCardKey(page, group, keyOf(row));
    if (key) keys.push(key);
  }
  return keys;
}

export function matchLiveCardWhitelistKeys(tradeKeys = [], enabledKeys = []) {
  const allowed = new Set(normalizeLiquidLiveCardKeys(enabledKeys));
  const normalizedTradeKeys = normalizeLiquidLiveCardKeys(tradeKeys, { maxKeys: 2000 });
  const matchedKeys = normalizedTradeKeys.filter((key) => allowed.has(key));
  return {
    allowed: matchedKeys.length > 0,
    matchedKeys,
    tradeKeys: normalizedTradeKeys,
    version: LIQUID_LIVE_CARD_WHITELIST_VERSION,
  };
}

export function liquidLiveComboCycleKey(trade = {}) {
  const combo = String(trade.liquidCombo ?? '').trim();
  if (!combo || combo === '-') return null;
  const health = trade.btcHealth && typeof trade.btcHealth === 'object' ? trade.btcHealth : {};
  const pct24h = Number(health.pct24h ?? trade.btcPct24h);
  const rsi4h = Number(health.rsi4h ?? trade.btcRsi4h);
  if (!Number.isFinite(pct24h) || !Number.isFinite(rsi4h)) return null;
  const dayMove = pct24h >= 0.2 ? 'DAY_POS' : pct24h <= -0.2 ? 'DAY_NEG' : 'DAY_FLAT';
  const rsi = rsi4h < 50 ? 'RSI4_RESET' : rsi4h < 58 ? 'RSI4_BALANCED' : 'RSI4_HOT';
  return `${combo} || CYCLE ${dayMove} | ${rsi}`;
}

export function liquidLiveCardKeysOfTrade(trade = {}) {
  const keys = new Set(['overview:all']);
  const sessionKey = sessionTradeKey(trade);
  if (sessionKey) keys.add(sessionKey);
  const impulseRegimeKey = impulseRegimeTradeKey(trade);
  if (impulseRegimeKey) keys.add(impulseRegimeKey);
  const impulseEntryKey = impulseEntryTradeKey(trade);
  if (impulseEntryKey) keys.add(impulseEntryKey);
  const pumpBaseKey = pumpBaseTradeKey(trade);
  if (pumpBaseKey) keys.add(pumpBaseKey);
  const pumpSupportKey = pumpSupportTradeKey(trade);
  if (pumpSupportKey) keys.add(pumpSupportKey);
  const dumpCapKey = dumpCapTradeKey(trade);
  if (dumpCapKey) keys.add(dumpCapKey);
  const dumpResistanceKey = dumpResistanceTradeKey(trade);
  if (dumpResistanceKey) keys.add(dumpResistanceKey);
  const toxicKey = toxicTwoSideTradeKey(trade);
  if (toxicKey) keys.add(toxicKey);
  const hourlyForecastKey = btcHourlyEntryForecastTradeKey(trade);
  if (hourlyForecastKey) keys.add(hourlyForecastKey);
  const margin = Number(trade.marginUsdt);
  keys.add(margin >= 9.5 && margin <= 10.5
    ? 'overview:margin:test10'
    : margin <= 1.01
      ? 'overview:margin:test1'
      : 'overview:margin:other');

  const side = upper(trade.side);
  const stage3 = upper(trade.liquidStage3Tier);
  addTierKey(keys, 'stage2', trade.liquidStage2Tier);
  addTierKey(keys, 'stage3', side, stage3);
  if (trade.liquidLongCorrReboundMatched === true) {
    keys.add('long-corr-rebound:GOOD');
  }
  if (trade.liquidStableMechanismMatched === true) {
    addTierKey(keys, 'stable-mechanism', trade.liquidStableMechanismCode);
  }
  if (trade.liquidLongBtcExpansionMatched === true) {
    keys.add('long-btc-expansion:CANDIDATE');
  }
  if (trade.liquidLongBtcExpansionSelected === true) {
    keys.add('long-btc-expansion:SELECTED');
  }
  if (trade.liquidLongBtcExpansionPrimeTest === true) {
    keys.add('long-btc-expansion:PRIME_TEST');
  }
  if (trade.liquidLongBtcExpansionOneSidedConfirmed === true) {
    keys.add('long-btc-expansion:ONE_SIDED_90');
  }
  if (trade.liquidLongBtcExpansionBtcCandleConfirmed === true) {
    keys.add('long-btc-expansion:BTC_CANDLE_CONFIRMED');
  }
  if (trade.liquidLongBtcExpansionPointAligned === true) {
    keys.add('long-btc-expansion:POINT_ALIGNED');
  }
  if (trade.liquidLongBtcExpansionFarRunner === true) {
    keys.add('long-btc-expansion:FAR_RUNNER');
  }
  if (trade.liquidComboBtcBreadthMatched === true) {
    addTierKey(
      keys,
      'combo-btc-breadth',
      trade.liquidComboBtcBreadthSide ?? side,
      trade.liquidComboBtcBreadthTier,
    );
  }
  addTierKey(keys, 'stage4', side, stage3, trade.liquidStage4Tier);
  addTierKey(keys, 'edge-point', trade.liquidEdgeActivePointTier);
  addTierKey(keys, 'btc-wave', side, stage3, trade.liquidBtcWaveTier);
  addTierKey(keys, 'wave-continuation', trade.liquidWaveContinuationTier);
  addTierKey(keys, 'long-session', trade.liquidLongSessionTier);
  addTierKey(keys, 'long-market', trade.liquidLongMarketTier);
  addTierKey(keys, 'long-point', trade.liquidLongPointPhaseTier);
  addTierKey(keys, 'runner-direction', side, trade.liquidRunnerDirectionTier);
  addTierKey(keys, 'market-wave', 'SHORT_SCORE', trade.liquidLiveShortWaveState, side);
  addTierKey(keys, 'market-wave', 'LONG_SCORE', trade.liquidLiveLongWaveState, side);

  if (trade.liquidLongCapitulationMatched === true) keys.add('long-mechanism:CAPITULATION');
  if (trade.liquidLongControlledSellMatched === true) keys.add('long-mechanism:CONTROLLED_SELL');
  if (trade.liquidLongDecoupledReboundMatched === true) keys.add('long-mechanism:DECOUPLED_REBOUND');
  if (trade.liquidLongBtcAbsorptionMatched === true) keys.add('long-mechanism:BTC_ABSORPTION');
  if (trade.liquidLongSpringMatched === true) keys.add('spring-reversal:LONG_SPRING');
  if (trade.liquidShortUpthrustMatched === true) keys.add('spring-reversal:SHORT_UPTHRUST');
  if (trade.liquidRunner30Matched === true) keys.add('runner30:CANDIDATE');

  const combo = String(trade.liquidCombo ?? '').trim();
  if (combo && combo !== '-') keys.add(`combo:${combo}`);
  const cycleKey = liquidLiveComboCycleKey(trade);
  if (cycleKey) {
    keys.add(`cycle-stable:${cycleKey}`);
    keys.add(`cycle-forming:${cycleKey}`);
    keys.add(`cycle-today:${cycleKey}`);
  }
  return [...keys];
}

export function matchLiquidLiveCardWhitelist(trade = {}, enabledKeys = []) {
  const allowed = new Set(normalizeLiquidLiveCardKeys(enabledKeys));
  const tradeKeys = liquidLiveCardKeysOfTrade(trade);
  const matchedKeys = tradeKeys.filter((key) => allowed.has(key));
  return {
    allowed: matchedKeys.length > 0,
    matchedKeys,
    tradeKeys,
    version: LIQUID_LIVE_CARD_WHITELIST_VERSION,
  };
}
