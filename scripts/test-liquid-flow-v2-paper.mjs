import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EMA_FAN_LONG_ENTRY_CONFIRMATION_VERSION,
  LIQUID_FLOW_V2_PAPER_LABEL_DATE_STATS_VERSION,
  LIQUID_FLOW_V2_PAPER_VERSION,
  LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_BINANCE_VERSION,
  LIQUID_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_VERSION,
  LIQUID_FLOW_V2_SWEEP_ENTRY_POLICY_VERSION,
  LiquidFlowV2PaperManager,
  buildLiquidFlowV2PaperPlan,
  buildLiquidFlowV2PaperLabelDateStats,
  evaluateLiquidFlowV2PaperExit,
  liquidFlowV2PaperMetrics,
  liquidFlowV2AutoBinanceProfile,
  summarizeLiquidFlowV2Paper,
} from '../src/liquidFlowV2Paper.js';

const settings = {
  marginUsdt: 10,
  leverage: 11,
  baseSweepLeverage: 9,
  hardStopRoe: 20,
  minTakeProfitRoe: 10,
  baseBinanceEnabled: true,
  baseBinanceMarginUsdt: 2,
  baseLongBinanceMarginUsdt: 2,
  baseBinanceLeverage: 13,
  preBinanceMarginUsdt: 5,
  preBinanceLeverage: 17,
  htfBinanceLeverage: 19,
  emaFanPaperMarginUsdt: 10,
  emaFanBinanceEnabled: true,
  emaFanBinanceMarginUsdt: 1,
  emaFanImpulseBinanceMarginUsdt: 5,
  emaFanBinanceLeverage: 23,
  emaFanRegularLimitBufferPct: 1,
  emaFanRegularEntryTimeoutMs: 15 * 60_000,
  emaFanHardStopRoe: 25,
  emaFanTakeProfitRoe: 10,
  emaFanMaxHoldMs: 12 * 60 * 60_000,
  primaryPanicBinanceEnabled: true,
  primaryPanicBinanceMarginUsdt: 2,
  postPumpReadyBinanceEnabled: true,
  postPumpReadyBinanceMarginUsdt: 2,
  fadingWaveLivePumpBinanceEnabled: true,
  fadingWaveLivePumpBinanceMarginUsdt: 1,
  maxHoldMs: 4 * 60 * 60_000,
  roundTripFeeRate: 0.0008,
};

assert.equal(LIQUID_FLOW_V2_PAPER_VERSION, 'LIQUID_FLOW_V2_PAPER_V31_FADING_WAVE_LIVE_PUMP_BINANCE_20260818');
assert.equal(LIQUID_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_VERSION, 'LIQUID_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_V1_2USDT_20260816');
assert.equal(LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_BINANCE_VERSION,
  'LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_BINANCE_V1_1USDT_20260818');
assert.equal(EMA_FAN_LONG_ENTRY_CONFIRMATION_VERSION, 'EMA_FAN_LONG_RETEST_CONFIRM_V1_20260816');
assert.equal(LIQUID_FLOW_V2_PAPER_LABEL_DATE_STATS_VERSION, 'LIQUID_FLOW_V2_PAPER_LABEL_DATE_STATS_V1_20260816');
assert.equal(LIQUID_FLOW_V2_SWEEP_ENTRY_POLICY_VERSION, 'LIQUID_FLOW_V2_SWEEP_ENTRY_GUARD_V1_20260816');

const bangkokTimestamp = (value) => Date.parse(`${value}+07:00`);
const labelDateStatsTrades = [
  {
    id: 'a-win', labelKey: 'LABEL_A', label: 'LABEL A', status: 'CLOSED', side: 'LONG',
    entryAt: bangkokTimestamp('2026-08-15T23:59:59'), closedAt: bangkokTimestamp('2026-08-16T01:00:00'),
    entryPrice: 100, exitPrice: 102, leverage: 5, marginUsdt: 10, roundTripFeeRate: 0,
  },
  {
    id: 'a-loss', labelKey: 'LABEL_A', label: 'LABEL A', status: 'CLOSED', side: 'LONG',
    entryAt: bangkokTimestamp('2026-08-16T00:00:00'), closedAt: bangkokTimestamp('2026-08-16T02:00:00'),
    entryPrice: 100, exitPrice: 99, leverage: 5, marginUsdt: 10, roundTripFeeRate: 0,
  },
  {
    id: 'b-open', labelKey: 'LABEL_B', label: 'LABEL B', status: 'OPEN', side: 'SHORT',
    entryAt: bangkokTimestamp('2026-08-16T23:59:59'), entryPrice: 100, leverage: 5, marginUsdt: 10,
  },
  {
    id: 'legacy-cancelled', label: 'LEGACY LABEL', status: 'CANCELLED', side: 'LONG',
    pendingSince: bangkokTimestamp('2026-08-16T12:00:00'), cancelledAt: bangkokTimestamp('2026-08-16T12:05:00'),
    entryPrice: 100, leverage: 5, marginUsdt: 10,
  },
];
const dayStats = buildLiquidFlowV2PaperLabelDateStats({
  trades: labelDateStatsTrades,
  marks: new Map([['LABELBUSDT', 100]]),
  now: bangkokTimestamp('2026-08-17T00:00:00'),
  fromDay: '2026-08-16',
  toDay: '2026-08-16',
  page: 1,
  pageSize: 1,
});
assert.equal(dayStats.dateBasis, 'PAPER_ENTRY_AT');
assert.equal(dayStats.timeZone, 'Asia/Bangkok');
assert.equal(dayStats.total, 3);
assert.equal(dayStats.closed, 1);
assert.equal(dayStats.losses, 1);
assert.equal(dayStats.open, 1);
assert.equal(dayStats.cancelled, 1);
assert.equal(dayStats.pagination.totalRecords, 2);
assert.equal(dayStats.closedTrades.length, 1);
assert.equal(dayStats.labelStats.length, 3);
assert.ok(dayStats.labels.some((item) => item.key === 'LEGACY LABEL'));
assert.equal(dayStats.labelStats.find((item) => item.key === 'LEGACY LABEL').closed, 0);
const selectedLabelStats = buildLiquidFlowV2PaperLabelDateStats({
  trades: labelDateStatsTrades,
  now: bangkokTimestamp('2026-08-17T00:00:00'),
  fromDay: '2026-08-16',
  toDay: '2026-08-16',
  labelKey: 'LABEL_A',
});
assert.equal(selectedLabelStats.total, 1);
assert.equal(selectedLabelStats.closed, 1);
assert.equal(selectedLabelStats.labelStats.length, 1);
assert.throws(() => buildLiquidFlowV2PaperLabelDateStats({ fromDay: '2026-08-17', toDay: '2026-08-16' }));
assert.throws(() => buildLiquidFlowV2PaperLabelDateStats({ fromDay: '2026-02-31' }));
assert.equal(
  liquidFlowV2AutoBinanceProfile({ labelKey: 'PRE_UP_BASE_LONG' }).marginUsdt,
  5,
);

const shortRow = {
  symbol: 'PUMPUSDT',
  classification: { phase: 'READY', labelKey: 'UP_SWEEP_SHORT_READY' },
  features: {
    markPrice: 1,
    lastClosedCandle: { open: 1.04, high: 1.08, low: 0.98, close: 1 },
    upperZone: { price: 1.06 },
    lowerZone: { price: 0.985 },
  },
};
const shortPlan = buildLiquidFlowV2PaperPlan(shortRow, settings);
assert.equal(shortPlan.side, 'SHORT');
assert.equal(shortPlan.entryPrice, 1);
assert.equal(shortPlan.entryBasis, 'LIVE_MARK_AT_READY_SCAN');
assert(shortPlan.stopLoss > shortPlan.entryPrice);
assert(shortPlan.takeProfit < shortPlan.entryPrice);
assert.equal(shortPlan.leverage, 5);
assert.equal(shortPlan.riskPct, 4);
assert.equal(shortPlan.estimatedRiskRoe, 20);
assert.equal(shortPlan.invalidationBasis, 'FIXED_20_ROE_AT_5X');
assert.equal(shortPlan.stopLoss, 1.04);
assert.equal(shortPlan.rewardPct, 2);
assert.equal(shortPlan.estimatedRewardRoe, 10);
assert.equal(shortPlan.takeProfit, 0.98);
assert.equal(shortPlan.targetBasis, 'OPPOSITE_V1_ZONE_WITH_10_ROE_FLOOR');

const longRow = {
  symbol: 'DUMPUSDT',
  classification: { phase: 'READY', labelKey: 'DOWN_SWEEP_LONG_READY' },
  features: {
    markPrice: 2,
    lastClosedCandle: { open: 1.96, high: 2.02, low: 1.9, close: 2 },
    upperZone: { price: 2.04 },
    lowerZone: { price: 1.92 },
  },
};
const longPlan = buildLiquidFlowV2PaperPlan(longRow, settings);
assert.equal(longPlan.side, 'LONG');
assert.equal(longPlan.entryPrice, 2);
assert(longPlan.stopLoss < longPlan.entryPrice);
assert(longPlan.takeProfit > longPlan.entryPrice);

const continuationLongPlan = buildLiquidFlowV2PaperPlan({
  symbol: 'BASEUSDT',
  classification: { phase: 'READY', labelKey: 'UP_BASE_SWEEP_LONG_READY' },
  features: {
    markPrice: 1.03,
    lastClosedCandle: { open: 1, high: 1.04, low: 0.995, close: 1.02 },
    lowerZone: { price: 0.99 },
    upperZone: { price: 1.08 },
    baseSweepLong: { sweepExtreme: 0.985, breakoutLevel: 1 },
  },
}, settings);
assert.equal(continuationLongPlan.side, 'LONG');
assert.equal(continuationLongPlan.entryPrice, 1.006);
assert.equal(continuationLongPlan.entryBasis, 'BASE_BREAKOUT_RETEST_LIMIT');
assert.equal(continuationLongPlan.entryMode, 'PULLBACK_LIMIT');
assert.equal(continuationLongPlan.leverage, 5);
assert.equal(continuationLongPlan.invalidationBasis, 'FIXED_20_ROE_AT_5X');
assert.equal(continuationLongPlan.riskPct, 4);
assert(continuationLongPlan.stopLoss < continuationLongPlan.entryPrice);

const continuationShortPlan = buildLiquidFlowV2PaperPlan({
  symbol: 'BASESHORTUSDT',
  classification: { phase: 'READY', labelKey: 'DOWN_BASE_SWEEP_SHORT_READY' },
  features: {
    markPrice: 0.97,
    lastClosedCandle: { open: 1, high: 1.01, low: 0.96, close: 0.98 },
    lowerZone: { price: 0.92 },
    upperZone: { price: 1.02 },
    baseSweepShort: { sweepExtreme: 1.025, breakoutLevel: 1 },
  },
}, settings);
assert.equal(continuationShortPlan.side, 'SHORT');
assert.equal(continuationShortPlan.entryPrice, 0.994);
assert.equal(continuationShortPlan.leverage, 5);
assert(continuationShortPlan.stopLoss > continuationShortPlan.entryPrice);

const preLongPlan = buildLiquidFlowV2PaperPlan({
  symbol: 'PRELONGUSDT',
  classification: { phase: 'READY', labelKey: 'PRE_UP_BASE_LONG' },
  features: {
    markPrice: 1.005,
    lastClosedCandle: { close: 1.006 },
    ema99: 1,
    upperZone: { price: 1.04 },
  },
}, settings);
assert.equal(preLongPlan.side, 'LONG');
assert.equal(preLongPlan.entryPrice, 1.005);
assert.equal(preLongPlan.entryMode, 'IMMEDIATE_MARK');

const preShortPlan = buildLiquidFlowV2PaperPlan({
  symbol: 'PRESHORTUSDT',
  classification: { phase: 'READY', labelKey: 'PRE_DOWN_BASE_SHORT' },
  features: {
    markPrice: 0.995,
    lastClosedCandle: { close: 0.994 },
    ema99: 1,
    lowerZone: { price: 0.96 },
  },
}, settings);
assert.equal(preShortPlan.side, 'SHORT');
assert.equal(preShortPlan.entryPrice, 0.995);
assert.equal(preShortPlan.entryMode, 'IMMEDIATE_MARK');

const primaryPanicPlan = buildLiquidFlowV2PaperPlan({
  symbol: 'HOLOUSDT',
  classification: { phase: 'READY', labelKey: 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY' },
  features: {
    markPrice: 0.091,
    lastClosedCandle: { close: 0.0908 },
    ema99: 0.0896,
    upperZone: { price: 0.095 },
  },
}, settings);
assert.equal(primaryPanicPlan.side, 'LONG');
assert.equal(primaryPanicPlan.entryMode, 'IMMEDIATE_MARK');
assert.deepEqual(
  liquidFlowV2AutoBinanceProfile({ labelKey: 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY' }, settings),
  {
    eligible: true,
    cohort: 'PRIMARY_EMA99_PANIC_RECLAIM',
    marginUsdt: 2,
    leverage: 5,
    source: 'liquid-flow-v2-primary-ema99-panic-reclaim',
  },
);
assert.equal(liquidFlowV2AutoBinanceProfile(
  { labelKey: 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY' },
  { ...settings, primaryPanicBinanceEnabled: false },
).eligible, false);
const emaFanPlan = buildLiquidFlowV2PaperPlan({
  symbol: 'AKEUSDT',
  classification: { phase: 'READY', labelKey: 'EMA_FAN_LONG_READY' },
  features: {
    markPrice: 1,
    lastClosedCandle: { close: 1 },
    upperZone: { price: 1.2 },
    emaFanLong5m: { ready: true, readyAt: 8_000_000, ema13: 0.99 },
  },
}, settings);
assert.equal(emaFanPlan.side, 'LONG');
assert.equal(emaFanPlan.entryMode, 'PULLBACK_LIMIT');
assert.equal(emaFanPlan.entryPrice, 0.9999);
assert.equal(emaFanPlan.entryTimeoutMs, 15 * 60_000);
assert.equal(emaFanPlan.takeProfit, 1.019898);
assert.equal(emaFanPlan.stopLoss, 0.949905);
assert.equal(emaFanPlan.estimatedRewardRoe, 10);
assert.equal(emaFanPlan.estimatedRiskRoe, 25);
assert.equal(emaFanPlan.targetBasis, 'EMA_FAN_FIXED_10_ROE');
assert.equal(emaFanPlan.invalidationBasis, 'FIXED_25_ROE_AT_5X');
assert.deepEqual(
  liquidFlowV2AutoBinanceProfile({ labelKey: 'EMA_FAN_LONG_READY' }, settings),
  { eligible: true, cohort: 'EMA_FAN_RETEST_CONFIRM', marginUsdt: 1, leverage: 5, source: 'liquid-flow-v2-ema-fan-retest-confirm' },
);
const emaFanImpulsePlan = buildLiquidFlowV2PaperPlan({
  symbol: 'AKEIMPULSEUSDT',
  classification: { phase: 'READY', labelKey: 'EMA_FAN_LONG_IMPULSE_RUNNER' },
  features: {
    markPrice: 1,
    lastClosedCandle: { close: 1 },
    upperZone: { price: 1.2 },
    emaFanLong5m: { ready: true, readyAt: 8_100_000, ema13: 0.98, volumeX: 8, bodyPct: 1.5 },
  },
}, settings);
assert.equal(emaFanImpulsePlan.entryMode, 'IMMEDIATE_MARK');
assert.equal(emaFanImpulsePlan.entryPrice, 1);
assert.deepEqual(
  liquidFlowV2AutoBinanceProfile({ labelKey: 'EMA_FAN_LONG_IMPULSE_RUNNER' }, settings),
  { eligible: true, cohort: 'EMA_FAN_IMPULSE', marginUsdt: 5, leverage: 5, source: 'liquid-flow-v2-ema-fan-impulse' },
);
const emaFanShortPlan = buildLiquidFlowV2PaperPlan({
  symbol: 'FANDOWNUSDT',
  classification: { phase: 'READY', labelKey: 'EMA_FAN_SHORT_READY' },
  features: {
    markPrice: 1,
    lastClosedCandle: { close: 1 },
    lowerZone: { price: 0.8 },
    emaFanShort5m: { ready: true, readyAt: 8_500_000 },
  },
}, settings);
assert.equal(emaFanShortPlan.side, 'SHORT');
assert.equal(emaFanShortPlan.entryMode, 'IMMEDIATE_MARK');
assert.equal(emaFanShortPlan.entryPrice, 1);
assert.equal(emaFanShortPlan.takeProfit, 0.98);
assert.equal(emaFanShortPlan.stopLoss, 1.05);
assert.equal(emaFanShortPlan.estimatedRewardRoe, 10);
assert.equal(emaFanShortPlan.estimatedRiskRoe, 25);
assert.equal(emaFanShortPlan.targetBasis, 'EMA_FAN_FIXED_10_ROE');
assert.equal(liquidFlowV2AutoBinanceProfile({ labelKey: 'EMA_FAN_SHORT_READY' }, settings).eligible, false);
const htfShortPlan = buildLiquidFlowV2PaperPlan({
  symbol: 'HTFSHORTUSDT',
  classification: { phase: 'READY', labelKey: 'HTF_BEAR_15M_EMA99_PUMP_REJECT' },
  features: { markPrice: 1, lowerZone: { price: 0.97 } },
}, settings);
assert.equal(htfShortPlan.side, 'SHORT');
assert.equal(htfShortPlan.entryMode, 'IMMEDIATE_MARK');
assert.deepEqual(
  liquidFlowV2AutoBinanceProfile({ labelKey: 'HTF_BEAR_15M_EMA99_PUMP_REJECT' }, settings),
  { eligible: true, cohort: 'HTF_EMA99', marginUsdt: 5, leverage: 5, source: 'liquid-flow-v2-htf' },
);
const distributionPlan = buildLiquidFlowV2PaperPlan({
  symbol: 'DISTUSDT',
  classification: { phase: 'READY', labelKey: 'PUMP_DISTRIBUTION_SHORT_READY' },
  features: { markPrice: 1, lowerZone: { price: 0.96 } },
}, settings);
assert.equal(distributionPlan.side, 'SHORT');
assert.equal(distributionPlan.entryMode, 'IMMEDIATE_MARK');
assert.equal(liquidFlowV2AutoBinanceProfile({ labelKey: 'PUMP_DISTRIBUTION_SHORT_READY' }, settings).eligible, false);
for (const labelKey of ['POST_PUMP_SHORT_SQUEEZE_LONG_READY', 'POST_PUMP_SHORT_SQUEEZE_PRIME']) {
  const postPumpPlan = buildLiquidFlowV2PaperPlan({
    symbol: 'POSTPUMPUSDT',
    classification: { phase: 'READY', labelKey },
    features: {
      markPrice: 1,
      upperZone: { price: 1.2 },
      postPumpShortSqueeze5m: { ready: true, readyAt: 11_500_000 },
    },
  }, settings);
  assert.equal(postPumpPlan.side, 'LONG');
  assert.equal(postPumpPlan.entryMode, 'IMMEDIATE_MARK');
  assert.equal(postPumpPlan.entryBasis, 'POST_PUMP_5M_CLOSED_BREAKOUT_MARK');
  assert.equal(postPumpPlan.takeProfit, 1.02);
  assert.equal(postPumpPlan.stopLoss, 0.96);
  assert.equal(postPumpPlan.targetBasis, 'POST_PUMP_FIXED_10_ROE');
  assert.equal(postPumpPlan.invalidationBasis, 'FIXED_20_ROE_AT_5X');
  const profile = liquidFlowV2AutoBinanceProfile({ labelKey }, settings);
  if (labelKey === 'POST_PUMP_SHORT_SQUEEZE_LONG_READY') {
    assert.deepEqual(profile, {
      eligible: true,
      cohort: 'POST_PUMP_SQUEEZE_READY',
      marginUsdt: 2,
      leverage: 5,
      source: 'liquid-flow-v2-post-pump-squeeze-ready',
    });
  } else {
    assert.deepEqual(profile, {
      eligible: false,
      cohort: 'POST_PUMP_SQUEEZE_PRIME_PAPER',
      marginUsdt: null,
      leverage: null,
      source: null,
    });
  }
}
assert.equal(liquidFlowV2AutoBinanceProfile(
  { labelKey: 'POST_PUMP_SHORT_SQUEEZE_LONG_READY' },
  { ...settings, postPumpReadyBinanceEnabled: false },
).eligible, false);
const killLongExhaustionPlan = buildLiquidFlowV2PaperPlan({
  symbol: 'HEMIUSDT',
  classification: { phase: 'READY', labelKey: 'KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY' },
  features: {
    markPrice: 0.0058,
    lastClosedCandle: { close: 0.0058 },
    upperZone: { price: 0.0065 },
  },
}, settings);
assert.equal(killLongExhaustionPlan.side, 'LONG');
assert.equal(killLongExhaustionPlan.entryMode, 'IMMEDIATE_MARK');
assert.equal(killLongExhaustionPlan.entryBasis, 'KILL_LONG_EXHAUSTION_5M_CLOSED_RECLAIM_MARK');
assert.equal(killLongExhaustionPlan.takeProfit, 0.005916);
assert.equal(killLongExhaustionPlan.stopLoss, 0.005568);
assert.equal(killLongExhaustionPlan.targetBasis, 'KILL_LONG_EXHAUSTION_FIXED_10_ROE');
assert.deepEqual(
  liquidFlowV2AutoBinanceProfile({ labelKey: 'KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY' }, settings),
  { eligible: false, cohort: 'KILL_LONG_EXHAUSTION_PAPER', marginUsdt: null, leverage: null, source: null },
);
const flagpoleShortKillPlan = buildLiquidFlowV2PaperPlan({
  symbol: 'FLAGUSDT',
  classification: { phase: 'READY', labelKey: 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY' },
  features: {
    markPrice: 1,
    lastClosedCandle: { close: 1 },
    upperZone: { price: 1.2 },
    flagpoleShortKill5m: { longReady: true, readyAt: 12_000_000 },
  },
}, settings);
assert.equal(flagpoleShortKillPlan.side, 'LONG');
assert.equal(flagpoleShortKillPlan.entryMode, 'IMMEDIATE_MARK');
assert.equal(flagpoleShortKillPlan.entryPrice, 1);
assert.equal(flagpoleShortKillPlan.entryBasis, 'FLAGPOLE_SHORT_KILL_5M_CLOSED_RECLAIM_MARK');
assert.equal(flagpoleShortKillPlan.takeProfit, 1.02);
assert.equal(flagpoleShortKillPlan.stopLoss, 0.96);
assert.equal(flagpoleShortKillPlan.estimatedRewardRoe, 10);
assert.equal(flagpoleShortKillPlan.estimatedRiskRoe, 20);
assert.equal(flagpoleShortKillPlan.targetBasis, 'FLAGPOLE_SHORT_KILL_FIXED_10_ROE');
assert.equal(flagpoleShortKillPlan.invalidationBasis, 'FIXED_20_ROE_AT_5X');
assert.deepEqual(
  liquidFlowV2AutoBinanceProfile({ labelKey: 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY' }, settings),
  { eligible: false, cohort: 'FLAGPOLE_SHORT_KILL_PAPER', marginUsdt: null, leverage: null, source: null },
);
const fadingWaveLivePumpPlan = buildLiquidFlowV2PaperPlan({
  symbol: 'DOLOUSDT',
  classification: { phase: 'READY', labelKey: 'FADING_WAVE_LIVE_PUMP_SHORT_READY' },
  features: {
    markPrice: 1,
    lastClosedCandle: { close: 0.96 },
    lowerZone: { price: 0.85 },
    fadingWaveLivePump5m: { shortReady: true, liveCandleOpenAt: 30_000_000 },
  },
}, settings);
assert.equal(fadingWaveLivePumpPlan.side, 'SHORT');
assert.equal(fadingWaveLivePumpPlan.entryMode, 'IMMEDIATE_MARK');
assert.equal(fadingWaveLivePumpPlan.entryPrice, 1);
assert.equal(fadingWaveLivePumpPlan.entryBasis, 'FADING_WAVE_LIVE_5M_PUMP_MARKET_MARK');
assert.equal(fadingWaveLivePumpPlan.takeProfit, 0.98);
assert.equal(fadingWaveLivePumpPlan.stopLoss, 1.04);
assert.equal(fadingWaveLivePumpPlan.estimatedRewardRoe, 10);
assert.equal(fadingWaveLivePumpPlan.estimatedRiskRoe, 20);
assert.equal(fadingWaveLivePumpPlan.targetBasis, 'FADING_WAVE_LIVE_PUMP_FIXED_10_ROE');
assert.deepEqual(
  liquidFlowV2AutoBinanceProfile({ labelKey: 'FADING_WAVE_LIVE_PUMP_SHORT_READY' }, settings),
  {
    eligible: true,
    cohort: 'FADING_WAVE_LIVE_PUMP_SHORT',
    marginUsdt: 1,
    leverage: 5,
    source: 'liquid-flow-v2-fading-wave-live-pump-short',
  },
);
assert.equal(liquidFlowV2AutoBinanceProfile(
  { labelKey: 'FADING_WAVE_LIVE_PUMP_SHORT_READY' },
  { ...settings, fadingWaveLivePumpBinanceEnabled: false },
).eligible, false);
const htfLongPlan = buildLiquidFlowV2PaperPlan({
  symbol: 'HTFLONGUSDT',
  classification: { phase: 'READY', labelKey: 'HTF_BULL_15M_EMA99_DUMP_RECLAIM' },
  features: { markPrice: 1, upperZone: { price: 1.03 } },
}, settings);
assert.equal(htfLongPlan.side, 'LONG');
assert.deepEqual(
  liquidFlowV2AutoBinanceProfile({ labelKey: 'HTF_BULL_15M_EMA99_DUMP_RECLAIM' }, settings),
  { eligible: true, cohort: 'HTF_EMA99', marginUsdt: 5, leverage: 5, source: 'liquid-flow-v2-htf' },
);
const extendedPanicPlan = buildLiquidFlowV2PaperPlan({
  symbol: 'GENIUSUSDT',
  classification: { phase: 'READY', labelKey: 'EXTENDED_EMA99_PANIC_RECLAIM_LONG' },
  features: { markPrice: 0.369, upperZone: { price: 0.38 } },
}, settings);
assert.equal(extendedPanicPlan.side, 'LONG');
assert.equal(extendedPanicPlan.entryMode, 'IMMEDIATE_MARK');
assert.equal(liquidFlowV2AutoBinanceProfile({ labelKey: 'EXTENDED_EMA99_PANIC_RECLAIM_LONG' }, settings).eligible, false);
assert.deepEqual(
  liquidFlowV2AutoBinanceProfile({ labelKey: 'PRE_UP_BASE_LONG' }, settings),
  { eligible: true, cohort: 'PRE_EMA99', marginUsdt: 5, leverage: 5, source: 'liquid-flow-v2-pre-ema99' },
);
assert.deepEqual(
  liquidFlowV2AutoBinanceProfile({ labelKey: 'UP_BASE_SWEEP_LONG_READY' }, settings),
  { eligible: true, cohort: 'BASE', marginUsdt: 2, leverage: 5, source: 'liquid-flow-v2-base' },
);
assert.equal(
  liquidFlowV2AutoBinanceProfile({ labelKey: 'DOWN_BASE_SWEEP_SHORT_READY' }, settings).marginUsdt,
  2,
);
assert.equal(liquidFlowV2AutoBinanceProfile({ labelKey: 'UP_SWEEP_SHORT_READY' }, settings).eligible, false);
assert.equal(liquidFlowV2AutoBinanceProfile({ labelKey: 'DOWN_SWEEP_LONG_READY' }, settings).eligible, false);
assert.equal(liquidFlowV2AutoBinanceProfile({ labelKey: 'UP_SWEEP_SHORT_WATCH' }, settings).eligible, false);
assert.equal(liquidFlowV2AutoBinanceProfile({ labelKey: 'DOWN_SWEEP_LONG_WATCH' }, settings).eligible, false);

assert.equal(buildLiquidFlowV2PaperPlan({
  ...shortRow,
  classification: { phase: 'WAIT', labelKey: 'UP_SQUEEZE_ACTIVE' },
}, settings), null);

const shortTrade = {
  id: 'short-1',
  version: LIQUID_FLOW_V2_PAPER_VERSION,
  status: 'OPEN',
  entryAt: 1_000,
  marginUsdt: 10,
  leverage: 5,
  maxHoldMs: settings.maxHoldMs,
  roundTripFeeRate: settings.roundTripFeeRate,
  ...shortPlan,
};
assert.equal(evaluateLiquidFlowV2PaperExit(shortTrade, shortPlan.takeProfit - 0.001, 2_000).outcome, 'TP');
assert.equal(evaluateLiquidFlowV2PaperExit(shortTrade, shortPlan.stopLoss + 0.001, 2_000).outcome, 'SL');
assert.equal(evaluateLiquidFlowV2PaperExit(shortTrade, 1, 1_000 + settings.maxHoldMs).outcome, 'TIMEOUT');
assert.equal(evaluateLiquidFlowV2PaperExit(shortTrade, 1, 2_000), null);

const tpMetrics = liquidFlowV2PaperMetrics(shortTrade, shortPlan.takeProfit, 2_000);
assert(tpMetrics.grossRoe > 0);
assert(tpMetrics.netPnl < tpMetrics.grossPnl);
assert.equal(tpMetrics.estimatedFee, 0.04);

const summary = summarizeLiquidFlowV2Paper([
  {
    ...shortTrade,
    status: 'CLOSED',
    outcome: 'TP',
    exitPrice: shortPlan.takeProfit,
    exitAt: 2_000,
  },
  {
    ...shortTrade,
    id: 'short-2',
    symbol: 'OPENUSDT',
    status: 'OPEN',
  },
], new Map([['OPENUSDT', 0.99]]), 3_000);
assert.equal(summary.total, 2);
assert.equal(summary.open, 1);
assert.equal(summary.closed, 1);
assert.equal(summary.wins, 1);
assert.equal(summary.losses, 0);
assert.equal(summary.winRate, 100);

const skyaiRow = {
  symbol: 'SKYAIUSDT',
  classification: {
    phase: 'READY',
    labelKey: 'UP_BASE_SWEEP_LONG_READY',
    label: 'UP BASE SWEEP · LONG READY',
    confidence: 89,
    evidence: [],
  },
  features: {
    markPrice: 0.13037,
    candleClosedAt: 1_500_000,
    lastClosedCandle: { open: 0.12436, high: 0.1322, low: 0.1243, close: 0.13029 },
    lowerZone: { price: 0.129327 },
    upperZone: { price: 0.131543 },
    baseSweepLong: { sweepExtreme: 0.11853, breakoutLevel: 0.12552 },
  },
};
const tempRoot = await mkdtemp(join(tmpdir(), 'liquid-flow-v2-paper-'));
try {
  const manager = new LiquidFlowV2PaperManager({
    file: join(tempRoot, 'paper.json'),
    settings,
    now: () => 2_000_000,
  });
  const flagpoleManager = new LiquidFlowV2PaperManager({
    file: join(tempRoot, 'flagpole-paper.json'),
    settings,
    now: () => 24_500_000,
  });
  const createdFlagpole = await flagpoleManager.createFromReadyTransitions([{
    symbol: 'FLAGUSDT',
    classification: {
      phase: 'READY',
      labelKey: 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY',
      label: 'POST PUMP FLAGPOLE · SHORT KILL LONG READY',
      confidence: 92,
      signalCandleClosedAt: 24_000_000,
      flagpoleShortKillReadyAt: 24_000_000,
      evidence: [],
    },
    features: {
      markPrice: 1,
      candleClosedAt: 24_000_000,
      lastClosedCandle: { close: 1 },
      upperZone: { price: 1.2 },
      flagpoleShortKill5m: { longReady: true, readyAt: 24_000_000 },
      shortLiquidationUsd: 50_000,
      prior5mShortLiquidationUsd: 18_000,
      shortLiquidationBurst: 2.8,
    },
  }], new Set(['FLAGUSDT']), 24_500_000);
  assert.equal(createdFlagpole.length, 1);
  assert.equal(createdFlagpole[0].status, 'OPEN');
  assert.equal(createdFlagpole[0].marginUsdt, 10);
  assert.equal(createdFlagpole[0].leverage, 5);
  assert.equal(createdFlagpole[0].maxHoldMs, 4 * 60 * 60_000);
  assert.equal(createdFlagpole[0].signalCandleClosedAt, 24_000_000);
  assert.equal(createdFlagpole[0].snapshot.flagpoleShortKill5m.readyAt, 24_000_000);
  const fadingWaveManager = new LiquidFlowV2PaperManager({
    file: join(tempRoot, 'fading-wave-paper.json'),
    settings,
    now: () => 30_120_000,
  });
  const createdFadingWave = await fadingWaveManager.createFromReadyTransitions([{
    symbol: 'DOLOUSDT',
    classification: {
      phase: 'READY',
      side: 'SHORT',
      labelKey: 'FADING_WAVE_LIVE_PUMP_SHORT_READY',
      label: 'FADING WAVE · LIVE PUMP SHORT READY',
      confidence: 91,
      signalCandleClosedAt: 30_000_000,
      signalLiveCandleOpenAt: 30_000_000,
      signalObservedAt: 30_120_000,
      evidence: [],
    },
    features: {
      markPrice: 1,
      candleClosedAt: 29_999_999,
      lastClosedCandle: { close: 0.96 },
      lowerZone: { price: 0.85 },
      fadingWaveLivePump5m: {
        shortReady: true,
        liveCandleOpenAt: 30_000_000,
        detectedAt: 30_120_000,
      },
    },
  }], new Set(['DOLOUSDT']), 30_120_000);
  assert.equal(createdFadingWave.length, 1);
  assert.equal(createdFadingWave[0].status, 'OPEN');
  assert.equal(createdFadingWave[0].side, 'SHORT');
  assert.equal(createdFadingWave[0].marginUsdt, 10);
  assert.equal(createdFadingWave[0].leverage, 5);
  assert.equal(createdFadingWave[0].maxHoldMs, 4 * 60 * 60_000);
  assert.equal(createdFadingWave[0].signalCandleClosedAt, 30_000_000);
  assert.equal(createdFadingWave[0].snapshot.fadingWaveLivePump5m.liveCandleOpenAt, 30_000_000);
  const fadingWaveClaim = await fadingWaveManager.claimBinanceEntry(createdFadingWave[0].id, 30_121_000);
  assert.equal(fadingWaveClaim.binanceEntryState, 'SUBMITTING');
  assert.equal(fadingWaveClaim.binanceEntryCohort, 'FADING_WAVE_LIVE_PUMP_SHORT');
  assert.equal(fadingWaveClaim.binanceEntryPolicyVersion,
    LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_BINANCE_VERSION);
  const sweepManager = new LiquidFlowV2PaperManager({
    file: join(tempRoot, 'sweep-paper.json'),
    settings,
    now: () => bangkokTimestamp('2026-08-16T01:00:00'),
  });
  const sweepRow = (candleClosedAt) => ({
    symbol: 'SWEEPUSDT',
    classification: {
      phase: 'READY',
      labelKey: 'UP_SWEEP_SHORT_READY',
      label: 'UP SWEEP · SHORT READY',
      confidence: 90,
      evidence: [],
    },
    features: {
      markPrice: 1,
      candleClosedAt,
      lowerZone: { price: 0.98 },
      sweepConfirmation5m: { shortReady: true, confirmedAt: candleClosedAt },
    },
  });
  const firstSweepAt = bangkokTimestamp('2026-08-16T01:00:00');
  const firstSweep = await sweepManager.createFromReadyTransitions(
    [sweepRow(firstSweepAt)], new Set(['SWEEPUSDT']), firstSweepAt,
  );
  assert.equal(firstSweep.length, 1);
  assert.equal(firstSweep[0].sweepEntryPolicyVersion, LIQUID_FLOW_V2_SWEEP_ENTRY_POLICY_VERSION);
  assert.equal(firstSweep[0].sweepEntryDayBangkok, '2026-08-16');
  assert.equal(firstSweep[0].snapshot.sweepConfirmation5m.shortReady, true);
  assert.equal((await sweepManager.createFromReadyTransitions(
    [sweepRow(firstSweepAt + 60 * 60_000)], new Set(['SWEEPUSDT']), firstSweepAt + 60 * 60_000,
  )).length, 0, 'Only the first sweep paper per symbol/Bangkok day may open.');
  Object.assign(sweepManager.state.trades[0], {
    status: 'CLOSED', outcome: 'SL', exitAt: bangkokTimestamp('2026-08-16T23:30:00'), exitPrice: 1.04,
  });
  const shortlyAfterMidnight = bangkokTimestamp('2026-08-17T00:10:00');
  assert.equal((await sweepManager.createFromReadyTransitions(
    [sweepRow(shortlyAfterMidnight)], new Set(['SWEEPUSDT']), shortlyAfterMidnight,
  )).length, 0, 'A prior-day SL must still enforce the four-hour cooldown after midnight.');
  const afterSweepCooldown = bangkokTimestamp('2026-08-17T03:31:00');
  assert.equal((await sweepManager.createFromReadyTransitions(
    [sweepRow(afterSweepCooldown)], new Set(['SWEEPUSDT']), afterSweepCooldown,
  )).length, 1);
  const created = await manager.createFromReadyTransitions([skyaiRow], new Set(['SKYAIUSDT']), 2_000_000);
  assert.equal(created.length, 1);
  assert.equal(created[0].status, 'PENDING_ENTRY');
  assert.equal(created[0].leverage, 5);
  assert.equal(created[0].entryPrice, 0.12627312);
  assert.equal(created[0].stopLoss, 0.1212222);
  assert.equal(manager.snapshot().pending, 1);
  await manager.handlePrice({ symbol: 'SKYAIUSDT', markPrice: 0.129, eventTime: 2_010_000 });
  assert.equal(manager.snapshot().pending, 1);
  await manager.handlePrice({ symbol: 'SKYAIUSDT', markPrice: 0.12621, eventTime: 2_020_000 });
  assert.equal(manager.snapshot().open, 1);
  const claimed = await manager.claimBinanceEntry(created[0].id, 2_025_000);
  assert.equal(claimed.binanceEntryState, 'SUBMITTING');
  assert.equal(await manager.claimBinanceEntry(created[0].id, 2_026_000), null);
  manager.state.trades.push({ id: 'reversal-open', status: 'OPEN', labelKey: 'UP_SWEEP_SHORT_READY' });
  assert.equal(await manager.claimBinanceEntry('reversal-open', 2_026_000), null);
  manager.state.trades.push({ id: 'pre-open', status: 'OPEN', labelKey: 'PRE_UP_BASE_LONG' });
  assert.equal((await manager.claimBinanceEntry('pre-open', 2_026_000)).binanceEntryState, 'SUBMITTING');
  await manager.recordBinanceEntryResult(created[0].id, {
    binanceEntryState: 'FILLED',
    binanceOrderId: 123,
    binanceMarginUsdt: 2,
    binanceLeverage: 5,
  });
  assert.equal(manager.snapshot().trades[0].binanceEntryState, 'FILLED');
  assert.equal(manager.snapshot().affectsBinance, true);
  assert.equal(manager.snapshot().labelsObservationOnly, false);
  await manager.handlePrice({ symbol: 'SKYAIUSDT', markPrice: 0.1314, eventTime: 2_030_000 });
  const replay = manager.snapshot();
  assert.equal(replay.closed, 1);
  assert.equal(replay.trades[0].outcome, 'TP');
  assert(replay.trades[0].netPnl > 0);
  const htfCreated = await manager.createFromReadyTransitions([{
    symbol: 'HTFEVALUSDT',
    classification: {
      phase: 'READY',
      labelKey: 'HTF_BEAR_15M_EMA99_PUMP_REJECT',
      label: 'HTF BEAR · 5M/15M EMA99 PUMP REJECT',
      confidence: 82,
      evidence: [],
    },
    features: {
      markPrice: 1,
      candleClosedAt: 3_000_000,
      ema99Retest15m: { candleClosedAt: 9_000_000 },
      lowerZone: { price: 0.97 },
    },
  }], new Set(['HTFEVALUSDT']), 10_000_000);
  assert.equal(htfCreated.length, 1);
  assert.equal(htfCreated[0].signalCandleClosedAt, 9_000_000);
  assert.match(htfCreated[0].signalKey, /HTF_BEAR_15M_EMA99_PUMP_REJECT\|9000000$/);
  const htfShortClaim = await manager.claimBinanceEntry(htfCreated[0].id, 10_010_000);
  assert.equal(htfShortClaim.binanceEntryState, 'SUBMITTING');
  assert.equal(await manager.claimBinanceEntry(htfCreated[0].id, 10_010_001), null);
  const htf5mCreated = await manager.createFromReadyTransitions([{
    symbol: 'HTF5MEVALUSDT',
    classification: {
      phase: 'READY',
      labelKey: 'HTF_BULL_15M_EMA99_DUMP_RECLAIM',
      label: 'HTF BULL · 5M/15M EMA99 DUMP RECLAIM',
      confidence: 84,
      evidence: [],
      ema99RetestTimeframe: '5m',
      ema99RetestCandleClosedAt: 10_500_000,
    },
    features: {
      markPrice: 1,
      candleClosedAt: 3_500_000,
      ema99Retest5m: { candleClosedAt: 10_500_000 },
      ema99Retest15m: { candleClosedAt: 9_500_000 },
      upperZone: { price: 1.03 },
    },
  }], new Set(['HTF5MEVALUSDT']), 11_000_000);
  assert.equal(htf5mCreated.length, 1);
  assert.equal(htf5mCreated[0].signalCandleClosedAt, 10_500_000);
  assert.equal(htf5mCreated[0].snapshot.ema99RetestTimeframe, '5m');
  assert.deepEqual(htf5mCreated[0].snapshot.ema99Retest5m, { candleClosedAt: 10_500_000 });
  const htfLongClaim = await manager.claimBinanceEntry(htf5mCreated[0].id, 11_010_000);
  assert.equal(htfLongClaim.binanceEntryState, 'SUBMITTING');
  assert.equal(await manager.claimBinanceEntry(htf5mCreated[0].id, 11_010_001), null);
  const distributionCreated = await manager.createFromReadyTransitions([{
    symbol: 'DISTUSDT',
    classification: {
      phase: 'READY',
      labelKey: 'PUMP_DISTRIBUTION_SHORT_READY',
      label: 'PUMP DISTRIBUTION · SHORT READY',
      confidence: 84,
      evidence: [],
    },
    features: {
      markPrice: 1,
      candleClosedAt: 4_000_000,
      pumpDistribution15m: { candleClosedAt: 11_000_000, support: 1.01 },
      lowerZone: { price: 0.96 },
    },
  }], new Set(['DISTUSDT']), 12_000_000);
  assert.equal(distributionCreated.length, 1);
  assert.equal(distributionCreated[0].side, 'SHORT');
  assert.equal(distributionCreated[0].signalCandleClosedAt, 11_000_000);
  assert.match(distributionCreated[0].signalKey, /PUMP_DISTRIBUTION_SHORT_READY\|11000000$/);
  assert.equal(await manager.claimBinanceEntry(distributionCreated[0].id, 12_010_000), null);
  const secondaryDistributionCreated = await manager.createFromReadyTransitions([{
    symbol: 'MASKEDDISTUSDT',
    classification: {
      phase: 'WAIT',
      labelKey: 'UP_SQUEEZE_ACTIVE',
      label: 'UP SQUEEZE ACTIVE',
      confidence: 78,
      secondaryLabels: [{
        phase: 'READY',
        side: 'SHORT',
        labelKey: 'PUMP_DISTRIBUTION_SHORT_READY',
        label: 'PUMP DISTRIBUTION · SHORT READY',
        confidence: 86,
        evidence: [],
      }],
    },
    features: {
      markPrice: 2,
      candleClosedAt: 13_000_000,
      pumpDistribution15m: { readyAt: 12_500_000, candleClosedAt: 13_000_000 },
      lowerZone: { price: 1.92 },
    },
  }], new Set(), 14_000_000, new Set(['MASKEDDISTUSDT|PUMP_DISTRIBUTION_SHORT_READY']));
  assert.equal(secondaryDistributionCreated.length, 1);
  assert.equal(secondaryDistributionCreated[0].labelKey, 'PUMP_DISTRIBUTION_SHORT_READY');
  assert.equal(secondaryDistributionCreated[0].signalCandleClosedAt, 12_500_000);
  assert.equal(await manager.claimBinanceEntry(secondaryDistributionCreated[0].id, 14_010_000), null);
  const postPumpCreated = await manager.createFromReadyTransitions([{
    symbol: 'POSTPUMPUSDT',
    classification: {
      phase: 'WAIT',
      labelKey: 'POST_PUMP_BASE_ABSORPTION_WATCH',
      label: 'POST PUMP BASE ABSORPTION · WATCH',
      confidence: 80,
      secondaryLabels: [{
        phase: 'READY',
        side: 'LONG',
        labelKey: 'POST_PUMP_SHORT_SQUEEZE_PRIME',
        label: 'POST PUMP SHORT SQUEEZE · PRIME',
        confidence: 94,
        postPumpReadyAt: 14_250_000,
        signalCandleClosedAt: 14_250_000,
        evidence: [],
      }],
    },
    features: {
      markPrice: 1,
      candleClosedAt: 14_500_000,
      postPumpShortSqueeze5m: { ready: true, primeReady: true, readyAt: 14_250_000 },
      upperZone: { price: 1.2 },
    },
  }], new Set(), 14_500_000, new Set(['POSTPUMPUSDT|POST_PUMP_SHORT_SQUEEZE_PRIME']));
  assert.equal(postPumpCreated.length, 1);
  assert.equal(postPumpCreated[0].labelKey, 'POST_PUMP_SHORT_SQUEEZE_PRIME');
  assert.equal(postPumpCreated[0].side, 'LONG');
  assert.equal(postPumpCreated[0].marginUsdt, 10);
  assert.equal(postPumpCreated[0].leverage, 5);
  assert.equal(postPumpCreated[0].signalCandleClosedAt, 14_250_000);
  assert.equal(postPumpCreated[0].snapshot.postPumpShortSqueeze5m.primeReady, true);
  assert.equal(await manager.claimBinanceEntry(postPumpCreated[0].id, 14_510_000), null);
  const postPumpReadyCreated = await manager.createFromReadyTransitions([{
    symbol: 'POSTPUMPREADYUSDT',
    classification: {
      phase: 'READY',
      side: 'LONG',
      labelKey: 'POST_PUMP_SHORT_SQUEEZE_LONG_READY',
      label: 'POST PUMP SHORT SQUEEZE · LONG READY',
      confidence: 88,
      postPumpReadyAt: 14_600_000,
      signalCandleClosedAt: 14_600_000,
      evidence: [],
    },
    features: {
      markPrice: 1,
      candleClosedAt: 14_600_000,
      postPumpShortSqueeze5m: { ready: true, primeReady: false, readyAt: 14_600_000 },
      upperZone: { price: 1.2 },
    },
  }], new Set(['POSTPUMPREADYUSDT']), 14_600_000);
  assert.equal(postPumpReadyCreated.length, 1);
  assert.equal(postPumpReadyCreated[0].status, 'OPEN');
  const postPumpReadyClaim = await manager.claimBinanceEntry(postPumpReadyCreated[0].id, 14_610_000);
  assert.equal(postPumpReadyClaim.binanceEntryState, 'SUBMITTING');
  assert.equal(postPumpReadyClaim.binanceEntryCohort, 'POST_PUMP_SQUEEZE_READY');
  assert.equal(postPumpReadyClaim.binanceEntryPolicyVersion, LIQUID_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_VERSION);
  assert.equal(liquidFlowV2AutoBinanceProfile(
    { labelKey: postPumpReadyClaim.labelKey }, settings,
  ).marginUsdt, 2);

  const primaryPanicCreated = await manager.createFromReadyTransitions([{
    symbol: 'PRIMARYPANICUSDT',
    classification: {
      phase: 'READY',
      side: 'LONG',
      labelKey: 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY',
      label: 'PRIMARY EMA99 PANIC RECLAIM · LONG READY',
      confidence: 86,
      signalCandleClosedAt: 14_700_000,
      evidence: [],
    },
    features: {
      markPrice: 1,
      candleClosedAt: 14_700_000,
      upperZone: { price: 1.08 },
    },
  }], new Set(['PRIMARYPANICUSDT']), 14_700_000);
  assert.equal(primaryPanicCreated.length, 1);
  assert.equal(primaryPanicCreated[0].status, 'OPEN');
  const primaryPanicClaim = await manager.claimBinanceEntry(primaryPanicCreated[0].id, 14_710_000);
  assert.equal(primaryPanicClaim.binanceEntryState, 'SUBMITTING');
  assert.equal(primaryPanicClaim.binanceEntryCohort, 'PRIMARY_EMA99_PANIC_RECLAIM');
  assert.equal(primaryPanicClaim.binanceEntryPolicyVersion, LIQUID_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_VERSION);
  assert.equal(liquidFlowV2AutoBinanceProfile(
    { labelKey: primaryPanicClaim.labelKey }, settings,
  ).marginUsdt, 2);
  const emaFanCreated = await manager.createFromReadyTransitions([{
    symbol: 'AKEUSDT',
    classification: {
      phase: 'WAIT',
      labelKey: 'UP_SQUEEZE_ACTIVE',
      label: 'UP SQUEEZE ACTIVE',
      confidence: 80,
      secondaryLabels: [{
        phase: 'READY',
        side: 'LONG',
        labelKey: 'EMA_FAN_LONG_READY',
        label: 'EMA FAN · LONG READY',
        confidence: 86,
        emaFanReadyAt: 14_500_000,
        signalCandleClosedAt: 14_500_000,
        evidence: [],
      }],
    },
    features: {
      markPrice: 1,
      candleClosedAt: 15_000_000,
      emaFanLong5m: { ready: true, readyAt: 14_500_000, ema13: 0.99 },
      upperZone: { price: 1.2 },
    },
  }], new Set(), 15_000_000, new Set(['AKEUSDT|EMA_FAN_LONG_READY']));
  assert.equal(emaFanCreated.length, 1);
  assert.equal(emaFanCreated[0].labelKey, 'EMA_FAN_LONG_READY');
  assert.equal(emaFanCreated[0].side, 'LONG');
  assert.equal(emaFanCreated[0].marginUsdt, 10);
  assert.equal(emaFanCreated[0].leverage, 5);
  assert.equal(emaFanCreated[0].maxHoldMs, 12 * 60 * 60_000);
  assert.equal(emaFanCreated[0].status, 'PENDING_ENTRY');
  assert.equal(emaFanCreated[0].entryMode, 'PULLBACK_LIMIT');
  assert.equal(emaFanCreated[0].entryPrice, 0.9999);
  assert.equal(emaFanCreated[0].plannedEntryPrice, 0.9999);
  assert.equal(emaFanCreated[0].entryConfirmationState, 'WAIT_RETEST_TOUCH');
  assert.equal(emaFanCreated[0].signalCandleClosedAt, 14_500_000);
  assert.equal(emaFanCreated[0].snapshot.emaFanLong5m.ready, true);
  assert.equal(await manager.claimBinanceEntry(emaFanCreated[0].id, 15_005_000), null);
  const emaFanFillEvents = await manager.handlePrice({
    symbol: 'AKEUSDT',
    markPrice: 0.9998,
    eventTime: 15_006_000,
  });
  assert.equal(emaFanFillEvents.length, 1);
  assert.equal(emaFanFillEvents[0].status, 'PENDING_ENTRY');
  assert.equal(emaFanFillEvents[0].entryConfirmationState, 'WAIT_CLOSED_CONFIRMATION');
  assert.equal(emaFanFillEvents[0].retestTouchedAt, 15_006_000);
  assert(manager.pendingConfirmationSymbols().includes('AKEUSDT'));
  assert.equal(await manager.claimBinanceEntry(emaFanCreated[0].id, 15_007_000), null);
  const emaFanConfirmationEvents = await manager.evaluatePendingEntryConfirmations([{
    symbol: 'AKEUSDT',
    features: {
      markPrice: 1.001,
      candleClosedAt: 15_300_000,
      lastClosedCandle: {
        open: 0.999,
        high: 1.002,
        low: 0.9985,
        close: 1.0015,
        closeTime: 15_300_000,
        quoteVolume: 1_000,
        takerBuyQuoteVolume: 560,
        takerDeltaPct: 12,
      },
      lastBullish: true,
      higherLowConfirmed: true,
      emaFanLong5m: {
        ema13: 1,
        ema25: 0.995,
        ema99: 0.98,
        gap1325Pct: 0.5025,
        gap1325PrevPct: 0.49,
        gap2599Pct: 1.5306,
        gap2599PrevPct: 1.5,
        gap1325Widening: true,
        gap2599Widening: true,
      },
    },
  }], 15_301_000);
  assert.equal(emaFanConfirmationEvents.length, 1);
  assert.equal(emaFanConfirmationEvents[0].status, 'OPEN');
  assert.equal(emaFanConfirmationEvents[0].entryMode, 'RETEST_CONFIRMATION_MARKET');
  assert.equal(emaFanConfirmationEvents[0].entryPrice, 1.001);
  assert.equal(emaFanConfirmationEvents[0].stopLoss, 0.95095);
  assert.equal(emaFanConfirmationEvents[0].takeProfit, 1.02102);
  assert.equal(emaFanConfirmationEvents[0].entryFilledAt, 15_301_000);
  assert.equal(manager.pendingConfirmationSymbols().includes('AKEUSDT'), false);
  const emaFanClaim = await manager.claimBinanceEntry(emaFanCreated[0].id, 15_302_000);
  assert.equal(emaFanClaim.binanceEntryState, 'SUBMITTING');
  assert.equal(liquidFlowV2AutoBinanceProfile({ labelKey: emaFanClaim.labelKey }, settings).marginUsdt, 1);
  assert.equal(
    liquidFlowV2AutoBinanceProfile({ labelKey: emaFanClaim.labelKey }, settings).cohort,
    'EMA_FAN_RETEST_CONFIRM',
  );
  const invalidatedEmaFan = await manager.createFromReadyTransitions([{
    symbol: 'BADFANUSDT',
    classification: {
      phase: 'READY',
      side: 'LONG',
      labelKey: 'EMA_FAN_LONG_READY',
      label: 'EMA FAN · LONG READY',
      confidence: 84,
      emaFanReadyAt: 15_350_000,
      signalCandleClosedAt: 15_350_000,
      evidence: [],
    },
    features: {
      markPrice: 1,
      candleClosedAt: 15_350_000,
      emaFanLong5m: { ready: true, readyAt: 15_350_000, ema13: 0.99 },
      upperZone: { price: 1.2 },
    },
  }], new Set(['BADFANUSDT']), 15_350_000);
  assert.equal(invalidatedEmaFan.length, 1);
  await manager.handlePrice({ symbol: 'BADFANUSDT', markPrice: 0.9998, eventTime: 15_360_000 });
  const invalidationEvents = await manager.evaluatePendingEntryConfirmations([{
    symbol: 'BADFANUSDT',
    features: {
      markPrice: 0.997,
      candleClosedAt: 15_600_000,
      lastClosedCandle: {
        open: 0.999,
        high: 1,
        low: 0.996,
        close: 0.997,
        closeTime: 15_600_000,
        takerDeltaPct: -4,
      },
      lastBullish: false,
      higherLowConfirmed: false,
      emaFanLong5m: {
        ema13: 1,
        ema25: 0.995,
        ema99: 0.98,
        gap1325Widening: false,
        gap2599Widening: false,
      },
    },
  }], 15_601_000);
  assert.equal(invalidationEvents.length, 1);
  assert.equal(invalidationEvents[0].status, 'CANCELLED');
  assert.equal(invalidationEvents[0].outcome, 'ENTRY_CONFIRMATION_INVALIDATED');
  assert.equal(invalidationEvents[0].entryConfirmationReason, 'both-ema-fan-gaps-contracting');
  assert.equal(await manager.claimBinanceEntry(invalidatedEmaFan[0].id, 15_602_000), null);
  const emaFanImpulseCreated = await manager.createFromReadyTransitions([{
    symbol: 'AKEIMPULSEUSDT',
    classification: {
      phase: 'WAIT',
      labelKey: 'UP_SQUEEZE_ACTIVE',
      label: 'UP SQUEEZE ACTIVE',
      confidence: 91,
      secondaryLabels: [{
        phase: 'READY',
        side: 'LONG',
        labelKey: 'EMA_FAN_LONG_IMPULSE_RUNNER',
        label: 'EMA FAN · LONG IMPULSE RUNNER',
        confidence: 91,
        emaFanReadyAt: 15_100_000,
        signalCandleClosedAt: 15_100_000,
        evidence: [],
      }],
    },
    features: {
      markPrice: 1.05,
      candleClosedAt: 15_100_000,
      emaFanLong5m: {
        ready: true,
        readyAt: 15_100_000,
        ema13: 1.02,
        volumeX: 8,
        bodyPct: 1.5,
        distanceFromEma13Pct: 2.94,
      },
      upperZone: { price: 1.2 },
    },
  }], new Set(), 15_100_000, new Set(['AKEIMPULSEUSDT|EMA_FAN_LONG_IMPULSE_RUNNER']));
  assert.equal(emaFanImpulseCreated.length, 1);
  assert.equal(emaFanImpulseCreated[0].status, 'OPEN');
  assert.equal(emaFanImpulseCreated[0].entryMode, 'IMMEDIATE_MARK');
  assert.equal(emaFanImpulseCreated[0].entryPrice, 1.05);
  const emaFanImpulseClaim = await manager.claimBinanceEntry(emaFanImpulseCreated[0].id, 15_101_000);
  assert.equal(emaFanImpulseClaim.binanceEntryState, 'SUBMITTING');
  assert.equal(
    liquidFlowV2AutoBinanceProfile({ labelKey: emaFanImpulseClaim.labelKey }, settings).marginUsdt,
    5,
  );
  const emaFanShortCreated = await manager.createFromReadyTransitions([{
    symbol: 'FANDOWNUSDT',
    classification: {
      phase: 'WAIT',
      labelKey: 'DOWN_SQUEEZE_ACTIVE',
      label: 'DOWN SQUEEZE ACTIVE',
      confidence: 80,
      secondaryLabels: [{
        phase: 'READY',
        side: 'SHORT',
        labelKey: 'EMA_FAN_SHORT_READY',
        label: 'EMA FAN · SHORT READY',
        confidence: 88,
        emaFanReadyAt: 15_500_000,
        signalCandleClosedAt: 15_500_000,
        evidence: [],
      }],
    },
    features: {
      markPrice: 1,
      candleClosedAt: 16_000_000,
      emaFanShort5m: { ready: true, readyAt: 15_500_000 },
      lowerZone: { price: 0.8 },
    },
  }], new Set(), 16_000_000, new Set(['FANDOWNUSDT|EMA_FAN_SHORT_READY']));
  assert.equal(emaFanShortCreated.length, 1);
  assert.equal(emaFanShortCreated[0].labelKey, 'EMA_FAN_SHORT_READY');
  assert.equal(emaFanShortCreated[0].side, 'SHORT');
  assert.equal(emaFanShortCreated[0].marginUsdt, 10);
  assert.equal(emaFanShortCreated[0].leverage, 5);
  assert.equal(emaFanShortCreated[0].maxHoldMs, 12 * 60 * 60_000);
  assert.equal(emaFanShortCreated[0].signalCandleClosedAt, 15_500_000);
  assert.equal(emaFanShortCreated[0].snapshot.emaFanShort5m.ready, true);
  assert.equal(await manager.claimBinanceEntry(emaFanShortCreated[0].id, 16_010_000), null);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

const legacyRoot = await mkdtemp(join(tmpdir(), 'liquid-flow-v2-paper-legacy-'));
try {
  const legacyFile = join(legacyRoot, 'paper.json');
  await writeFile(legacyFile, JSON.stringify({
    version: 'LIQUID_FLOW_V2_PAPER_V3_BASE_RETEST_20260809',
    settings: { autoEnabled: true, marginUsdt: 10, leverage: 10, baseSweepLeverage: 5, baseSweepMaxRiskRoe: 25 },
    trades: [{
      id: 'legacy-ema-fan-pending',
      version: 'LIQUID_FLOW_V2_PAPER_V18_EMA_FAN_LONG_READY_20260814',
      symbol: 'LEGACYFANUSDT',
      labelKey: 'EMA_FAN_LONG_READY',
      status: 'PENDING_ENTRY',
      side: 'LONG',
      entryPrice: 1,
      stopLoss: 0.95,
      takeProfit: 1.02,
      pendingSince: 17_000_000,
      entryExpiresAt: 17_900_000,
      leverage: 5,
      marginUsdt: 10,
    }],
  }));
  const migrated = new LiquidFlowV2PaperManager({ file: legacyFile, settings, now: () => 17_000_000 });
  await migrated.init();
  assert.equal(migrated.snapshot().settings.leverage, 5);
  assert.equal(migrated.snapshot().settings.hardStopRoe, 20);
  assert.equal(migrated.snapshot().settings.minTakeProfitRoe, 10);
  assert.equal(migrated.snapshot().settings.primaryPanicBinanceEnabled, true);
  assert.equal(migrated.snapshot().settings.primaryPanicBinanceMarginUsdt, 2);
  assert.equal(migrated.snapshot().settings.postPumpReadyBinanceEnabled, true);
  assert.equal(migrated.snapshot().settings.postPumpReadyBinanceMarginUsdt, 2);
  assert.equal(migrated.snapshot().settings.fadingWaveLivePumpBinanceEnabled, true);
  assert.equal(migrated.snapshot().settings.fadingWaveLivePumpBinanceMarginUsdt, 1);
  const legacyTouch = await migrated.handlePrice({
    symbol: 'LEGACYFANUSDT',
    markPrice: 0.999,
    eventTime: 17_010_000,
  });
  assert.equal(legacyTouch.length, 1);
  assert.equal(legacyTouch[0].status, 'PENDING_ENTRY');
  assert.equal(legacyTouch[0].entryConfirmationState, 'WAIT_CLOSED_CONFIRMATION');
  assert.equal(legacyTouch[0].entryConfirmationVersion, EMA_FAN_LONG_ENTRY_CONFIRMATION_VERSION);
  assert.equal(await migrated.claimBinanceEntry('legacy-ema-fan-pending', 17_011_000), null);
} finally {
  await rm(legacyRoot, { recursive: true, force: true });
}

console.log('Liquid Flow V2 automatic paper tests passed.');
