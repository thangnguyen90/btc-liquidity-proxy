import assert from 'node:assert/strict';
import {
  LIQUID_HEATMAP_FLOW_V2_LABELS,
  LIQUID_HEATMAP_FLOW_V2_VERSION,
  buildLiquidHeatmapFlowV2Features,
  buildPumpDistributionSnapshot,
  classifyLiquidHeatmapFlowV2,
  liquidHeatmapFlowV2ExtendedPrefilter,
  liquidHeatmapFlowV2Stats,
  selectLiquidHeatmapFlowV2Candidates,
  selectLiquidHeatmapFlowV2ExtendedCandidates,
} from '../src/liquidHeatmapFlowV2.js';
import { LiquidationFlowCollector } from '../src/liquidationFlowCollector.js';
import { normalizeLiquidLiveCardKey } from '../src/liquidLiveCardWhitelist.js';

const base = {
  candleCount: 80,
  change24hPct: 0,
  change1hPct: 0,
  volumeX: 1,
  takerDeltaPct: 0,
  upperZone: { price: 1.2, distancePct: 0.2 },
  lowerZone: { price: 0.8, distancePct: -0.2 },
  upperZoneTouched: false,
  lowerZoneTouched: false,
  upperRejection: false,
  lowerReclaim: false,
  openInterestDeltaPct: 0,
  openInterestSamples: 3,
  shortLiquidationUsd: 0,
  longLiquidationUsd: 0,
  shortLiquidationBurst: null,
  longLiquidationBurst: null,
  liquidationEvents: 0,
  liquidationSocketState: 'OPEN',
};

assert.equal(LIQUID_HEATMAP_FLOW_V2_VERSION, 'LIQUID_HEATMAP_FLOW_V2_PRIMARY_PANIC_RECLAIM_V10_20260812');

const upActive = classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: 31,
  change1hPct: 6,
  volumeX: 2.4,
  takerDeltaPct: 14,
  openInterestDeltaPct: 1.1,
});
assert.equal(upActive.labelKey, 'UP_SQUEEZE_ACTIVE');
assert.equal(upActive.side, 'SHORT');
assert.equal(upActive.phase, 'WAIT');
assert.equal(upActive.affectsOrders, false);
assert.equal(upActive.version, LIQUID_HEATMAP_FLOW_V2_VERSION);

const shortReady = classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: 81,
  change1hPct: 9,
  volumeX: 3.5,
  takerDeltaPct: -12,
  upperZoneTouched: true,
  upperRejection: true,
  openInterestDeltaPct: -1.7,
  shortLiquidationUsd: 450_000,
  shortLiquidationBurst: 2.2,
  liquidationEvents: 4,
});
assert.equal(shortReady.labelKey, 'UP_SWEEP_SHORT_READY');
assert.equal(shortReady.side, 'SHORT');
assert.equal(shortReady.phase, 'READY');
assert(shortReady.confidence >= 70);

const downActive = classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: -25,
  change1hPct: -5,
  volumeX: 2,
  takerDeltaPct: -11,
  openInterestDeltaPct: 0.8,
});
assert.equal(downActive.labelKey, 'DOWN_SQUEEZE_ACTIVE');
assert.equal(downActive.side, 'LONG');

const longReady = classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: -36,
  change1hPct: -7,
  volumeX: 3,
  takerDeltaPct: 10,
  lowerZoneTouched: true,
  lowerReclaim: true,
  openInterestDeltaPct: -1.2,
  longLiquidationUsd: 380_000,
  longLiquidationBurst: 1.8,
  liquidationEvents: 5,
});
assert.equal(longReady.labelKey, 'DOWN_SWEEP_LONG_READY');
assert.equal(longReady.side, 'LONG');
assert.equal(longReady.phase, 'READY');

const upBaseLongReady = classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: 53,
  change1hPct: 8,
  volumeX: 2.8,
  takerDeltaPct: 12,
  trendAboveEma: true,
  upperRejection: false,
  baseSweepLong: {
    detected: true,
    holdConfirmed: true,
    breakoutConfirmed: true,
    ready: true,
    sweepExtreme: 0.98,
    barsSinceSweep: 4,
    breakoutPct: 1.2,
  },
});
assert.equal(upBaseLongReady.labelKey, 'UP_BASE_SWEEP_LONG_READY');
assert.equal(upBaseLongReady.side, 'LONG');
assert.equal(upBaseLongReady.phase, 'READY');
assert.equal(upBaseLongReady.warmingUp, false);

const downBaseShortReady = classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: -32,
  change1hPct: -6,
  volumeX: 2.2,
  takerDeltaPct: -11,
  trendBelowEma: true,
  lowerReclaim: false,
  baseSweepShort: {
    detected: true,
    holdConfirmed: true,
    breakoutConfirmed: true,
    ready: true,
    sweepExtreme: 1.04,
    barsSinceSweep: 5,
    breakoutPct: 0.9,
  },
});
assert.equal(downBaseShortReady.labelKey, 'DOWN_BASE_SWEEP_SHORT_READY');
assert.equal(downBaseShortReady.side, 'SHORT');
assert.equal(downBaseShortReady.phase, 'READY');

const htfPumpRejectShort = classifyLiquidHeatmapFlowV2({
  ...base,
  candleCount: 180,
  htfBearCount: 1,
  htfBearTier: 'B_ONE',
  trend1h: { ready: true, bearish: true },
  trend4h: { ready: true, bearish: false },
  ema99Retest15m: {
    ready: true,
    shortReady: true,
    shortTouchDistancePct: 0.4,
    pumpPct: 6.2,
    givebackRatio: 0.48,
    volumeX: 2.1,
    takerDeltaPct: -4,
  },
});
assert.equal(htfPumpRejectShort.labelKey, 'HTF_BEAR_15M_EMA99_PUMP_REJECT');
assert.equal(htfPumpRejectShort.side, 'SHORT');
assert.equal(htfPumpRejectShort.phase, 'READY');
assert.equal(htfPumpRejectShort.warmingUp, false);

const htfDumpReclaimLong = classifyLiquidHeatmapFlowV2({
  ...base,
  candleCount: 180,
  htfBullCount: 2,
  htfBullTier: 'A_BOTH',
  trend1h: { ready: true, bullish: true },
  trend4h: { ready: true, bullish: true },
  ema99Retest15m: {
    ready: true,
    longReady: true,
    longTouchDistancePct: -0.35,
    dumpPct: 5.4,
    recoveryRatio: 0.52,
    volumeX: 1.9,
    takerDeltaPct: 3,
  },
});
assert.equal(htfDumpReclaimLong.labelKey, 'HTF_BULL_15M_EMA99_DUMP_RECLAIM');

const htfDeep5mDumpReclaimLong = classifyLiquidHeatmapFlowV2({
  ...base,
  candleCount: 180,
  htfBullCount: 1,
  htfBullTier: 'B_ONE',
  trend1h: { ready: true, bullish: true },
  trend4h: { ready: true, bullish: false },
  ema99Retest5m: {
    ready: true,
    timeframe: '5m',
    candleClosedAt: 12_000_000,
    longReady: true,
    longTouchDistancePct: -12.7,
    dumpPct: 18.4,
    recoveryRatio: 0.62,
    volumeX: 2.8,
    takerDeltaPct: 4,
  },
  ema99Retest15m: {
    ready: true,
    timeframe: '15m',
    candleClosedAt: 9_000_000,
    longReady: false,
  },
});
assert.equal(htfDeep5mDumpReclaimLong.labelKey, 'HTF_BULL_15M_EMA99_DUMP_RECLAIM');
assert.equal(htfDeep5mDumpReclaimLong.ema99RetestTimeframe, '5m');
assert.equal(htfDeep5mDumpReclaimLong.ema99RetestCandleClosedAt, 12_000_000);
assert.match(htfDeep5mDumpReclaimLong.reason, /dump 5m quet EMA99/);

const distributionWatch = classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: 45,
  pumpDistribution15m: {
    watchReady: true,
    shortReady: false,
    pumpPct: 24,
    baseRangePct: 7,
    lowerHighSteps: 4,
    upperWickCount: 3,
    volumeFadeRatio: 0.62,
    baseTakerDeltaPct: -1,
  },
});
assert.equal(distributionWatch.labelKey, 'PUMP_DISTRIBUTION_WATCH');
assert.equal(distributionWatch.phase, 'WATCH');
assert.equal(distributionWatch.side, 'SHORT');
assert.equal(distributionWatch.warmingUp, false);

const distributionShortReady = classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: 45,
  pumpDistribution15m: {
    watchReady: false,
    shortReady: true,
    breakdownConfirmed: true,
    retestFailed: true,
    pumpPct: 24,
    support: 110,
    baseRangePct: 7,
    lowerHighSteps: 4,
    upperWickCount: 3,
    volumeFadeRatio: 0.62,
    baseTakerDeltaPct: -1,
    breakdownVolumeX: 1.4,
    breakdownTakerDeltaPct: -18,
  },
});
assert.equal(distributionShortReady.labelKey, 'PUMP_DISTRIBUTION_SHORT_READY');
assert.equal(distributionShortReady.phase, 'READY');
assert.equal(distributionShortReady.side, 'SHORT');
assert(distributionShortReady.confidence >= distributionWatch.confidence);

const distributionNotMaskedByPrimary = classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: 45,
  change1hPct: 8,
  volumeX: 2.8,
  takerDeltaPct: 12,
  trendAboveEma: true,
  baseSweepLong: {
    detected: true,
    holdConfirmed: true,
    breakoutConfirmed: true,
    ready: true,
    sweepExtreme: 0.98,
    barsSinceSweep: 4,
    breakoutPct: 1.2,
  },
  pumpDistribution15m: {
    shortReady: true,
    breakdownConfirmed: true,
    continuationConfirmed: true,
    pumpPct: 48,
    pump72hPct: 48,
    support: 1.05,
    baseRangePct: 11,
    adaptiveBaseRangeMaxPct: 16.8,
    lowerHighSteps: 4,
    upperWickCount: 3,
    volumeFadeRatio: 0.72,
    baseTakerDeltaPct: -3,
    breakdownVolumeX: 1.5,
    breakdownTakerDeltaPct: -8,
  },
});
assert.equal(distributionNotMaskedByPrimary.labelKey, 'UP_BASE_SWEEP_LONG_READY');
assert.equal(distributionNotMaskedByPrimary.secondaryLabels.length, 1);
assert.equal(distributionNotMaskedByPrimary.secondaryLabels[0].labelKey, 'PUMP_DISTRIBUTION_SHORT_READY');

function distributionBar(index, values) {
  return {
    openTime: index * 900_000,
    closeTime: (index + 1) * 900_000 - 1,
    quoteVolume: 600,
    takerBuyQuoteVolume: 300,
    ...values,
  };
}
const distributionBars = [
  distributionBar(0, { open: 101, high: 102, low: 100, close: 101 }),
  distributionBar(1, { open: 101, high: 104, low: 100.8, close: 103 }),
  distributionBar(2, { open: 103, high: 107, low: 102, close: 106 }),
  distributionBar(3, { open: 106, high: 111, low: 105, close: 110 }),
  distributionBar(4, { open: 110, high: 116, low: 109, close: 115 }),
  distributionBar(5, { open: 115, high: 120, low: 113, close: 116, quoteVolume: 1_000, takerBuyQuoteVolume: 700 }),
  distributionBar(6, { open: 113, high: 117, low: 110, close: 111 }),
  distributionBar(7, { open: 112, high: 116, low: 110.5, close: 111 }),
  distributionBar(8, { open: 112, high: 115, low: 110.2, close: 111 }),
  distributionBar(9, { open: 112, high: 114.5, low: 110.3, close: 111 }),
  distributionBar(10, { open: 111.8, high: 114, low: 110.1, close: 111 }),
  distributionBar(11, { open: 111.7, high: 113.5, low: 110.4, close: 111 }),
  distributionBar(12, { open: 111.5, high: 113, low: 110.2, close: 110.9 }),
  distributionBar(13, { open: 111.3, high: 112.5, low: 110, close: 110.8 }),
  distributionBar(14, { open: 111, high: 111.2, low: 108, close: 109.5, quoteVolume: 800, takerBuyQuoteVolume: 300 }),
  distributionBar(15, { open: 109.5, high: 110.2, low: 108.8, close: 109.1, quoteVolume: 650, takerBuyQuoteVolume: 260 }),
];
const builtDistribution = buildPumpDistributionSnapshot(distributionBars, 45, 20_000_000);
assert.equal(builtDistribution.ready, true);
assert.equal(builtDistribution.breakdownConfirmed, true);
assert.equal(builtDistribution.retestFailed, true);
assert.equal(builtDistribution.shortReady, true);

const longLivedDistributionBars = distributionBars.slice(0, 6);
for (let index = 6; index <= 30; index += 1) {
  longLivedDistributionBars.push(distributionBar(index, {
    open: 111.2,
    high: 117 - (index - 6) * 0.12,
    low: 110.5,
    close: 111,
    quoteVolume: 600,
    takerBuyQuoteVolume: 285,
  }));
}
const hourlyCycleBars = Array.from({ length: 80 }, (_, index) => ({
  openTime: index * 3_600_000,
  closeTime: (index + 1) * 3_600_000 - 1,
  open: index < 45 ? 100 : index < 51 ? 100 + (index - 44) * 10 : 118,
  high: index === 50 ? 160 : index < 51 ? 102 + Math.max(0, index - 44) * 10 : 120,
  low: index < 45 ? 100 : 105,
  close: index < 45 ? 101 : index < 51 ? 100 + (index - 44) * 9 : 111,
  quoteVolume: 5_000,
  takerBuyQuoteVolume: 2_500,
}));
const longLivedDistribution = buildPumpDistributionSnapshot(
  longLivedDistributionBars,
  3,
  400_000_000,
  { klines1h: hourlyCycleBars },
);
assert(longLivedDistribution.barsSincePeak > 16);
assert(longLivedDistribution.pump72hPct >= 30);
assert.equal(longLivedDistribution.watchReady, true);
assert.equal(longLivedDistribution.shortReady, false);
assert.equal(longLivedDistribution.stage, 'LATE_UNWIND_NO_CHASE');
assert.equal(htfDumpReclaimLong.side, 'LONG');
assert(htfDumpReclaimLong.confidence > htfPumpRejectShort.confidence);

const preUpBaseLong = classifyLiquidHeatmapFlowV2({
  ...base,
  candleCount: 180,
  change24hPct: 21,
  change1hPct: -1.2,
  volumeX: 1.15,
  takerDeltaPct: -4,
  ema13: 101.2,
  ema25: 100.7,
  ema99: 100,
  ema99DistancePct: 0.55,
  ema99LongTouchDistancePct: 0.2,
  reboundFromApproachLowPct: 0.7,
  ema99SlopePct: 0.03,
  pullbackFromRecentHighPct: 3.4,
  baseSweepLong: { ready: false },
});
assert.equal(preUpBaseLong.labelKey, 'PRE_UP_BASE_LONG');
assert.equal(preUpBaseLong.side, 'LONG');
assert.equal(preUpBaseLong.phase, 'READY');
assert.equal(preUpBaseLong.affectsBinance, false);

const preDownBaseShort = classifyLiquidHeatmapFlowV2({
  ...base,
  candleCount: 180,
  change24hPct: -18,
  change1hPct: 1.4,
  volumeX: 1.05,
  takerDeltaPct: 5,
  ema13: 98.8,
  ema25: 99.3,
  ema99: 100,
  ema99DistancePct: -0.6,
  ema99ShortTouchDistancePct: -0.2,
  rejectFromApproachHighPct: 0.7,
  ema99SlopePct: -0.04,
  bounceFromRecentLowPct: 2.8,
  baseSweepShort: { ready: false },
});
assert.equal(preDownBaseShort.labelKey, 'PRE_DOWN_BASE_SHORT');
assert.equal(preDownBaseShort.side, 'SHORT');
assert.equal(preDownBaseShort.phase, 'READY');

const preLongBlockedBySellFlow = classifyLiquidHeatmapFlowV2({
  ...base,
  candleCount: 180,
  change24hPct: 21,
  change1hPct: -1.2,
  volumeX: 1.15,
  takerDeltaPct: -20,
  ema13: 101.2,
  ema25: 100.7,
  ema99: 100,
  ema99DistancePct: 0.55,
  ema99LongTouchDistancePct: 0.2,
  reboundFromApproachLowPct: 0.7,
  ema99SlopePct: 0.03,
  pullbackFromRecentHighPct: 3.4,
  baseSweepLong: { ready: false },
});
assert.notEqual(preLongBlockedBySellFlow.labelKey, 'PRE_UP_BASE_LONG');

const rejectedContinuation = classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: 53,
  change1hPct: 8,
  volumeX: 2.8,
  takerDeltaPct: 12,
  trendAboveEma: true,
  upperRejection: true,
  baseSweepLong: { detected: true, holdConfirmed: true, breakoutConfirmed: true, ready: true },
});
assert.notEqual(rejectedContinuation.labelKey, 'UP_BASE_SWEEP_LONG_READY');

const bullishBars = Array.from({ length: 10 }, (_, index) => ({
  open: 100 + index * 0.04,
  high: 101.2 + index * 0.04,
  low: 100,
  close: 100.5 + index * 0.04,
  quoteVolume: 100,
  takerBuyQuoteVolume: 55,
  closeTime: (index + 1) * 300_000,
}));
bullishBars.push(
  { open: 100.5, high: 100.8, low: 99, close: 100.4, quoteVolume: 120, takerBuyQuoteVolume: 70, closeTime: 11 * 300_000 },
  { open: 100.4, high: 101.2, low: 100.2, close: 100.8, quoteVolume: 260, takerBuyQuoteVolume: 180, closeTime: 12 * 300_000 },
  { open: 100.8, high: 101.4, low: 100.6, close: 101.1, quoteVolume: 280, takerBuyQuoteVolume: 190, closeTime: 13 * 300_000 },
  { open: 101.2, high: 102.3, low: 101.1, close: 102, quoteVolume: 500, takerBuyQuoteVolume: 390, closeTime: 14 * 300_000 },
);
const builtContinuation = buildLiquidHeatmapFlowV2Features({
  market: { markPrice: 102, change24hPct: 30, quoteVolume: 8_000_000 },
  klines: bullishBars,
  openInterest: { value: 1000, deltaPct: 0.1, samples: 3 },
  liquidation: { socketState: 'OPEN', events: 1 },
  now: 15 * 300_000,
});
assert.equal(builtContinuation.baseSweepLong.ready, true);
assert(builtContinuation.baseSweepLong.breakoutVolumeX > 1.6);
assert.equal(builtContinuation.trendAboveEma, true);

const ema99ApproachBars = Array.from({ length: 180 }, (_, index) => ({
  open: index === 179 ? 99.9 : 100,
  high: index === 175 ? 102 : index === 179 ? 100.1 : 100.2,
  low: 99.8,
  close: 100,
  quoteVolume: 100,
  takerBuyQuoteVolume: 55,
  closeTime: (index + 1) * 300_000,
}));
const builtEma99Approach = buildLiquidHeatmapFlowV2Features({
  market: { markPrice: 100.5, change24hPct: 15, quoteVolume: 8_000_000 },
  klines: ema99ApproachBars,
  openInterest: { value: 1000, deltaPct: null, samples: 1 },
  liquidation: { socketState: 'CONNECTING', events: 0 },
  now: 181 * 300_000,
});
assert.equal(builtEma99Approach.ema99, 100);
assert.equal(builtEma99Approach.ema99DistancePct, 0.5);
assert.equal(builtEma99Approach.approachCandleSource, 'LAST_CLOSED_5M');
assert.equal(Number(builtEma99Approach.ema99LongTouchDistancePct.toFixed(2)), -0.2);
assert.equal(Number(builtEma99Approach.pullbackFromRecentHighPct.toFixed(2)), 1.47);
assert.equal(classifyLiquidHeatmapFlowV2(builtEma99Approach).labelKey, 'PRE_UP_BASE_LONG');
assert.equal(classifyLiquidHeatmapFlowV2(builtEma99Approach).warmingUp, false);

const liveWickNow = 181 * 300_000;
const liveLongWickBars = [
  ...ema99ApproachBars,
  {
    open: 100.8,
    high: 101,
    low: 99.85,
    close: 100.55,
    quoteVolume: 70,
    takerBuyQuoteVolume: 39,
    closeTime: liveWickNow + 300_000,
  },
];
const liveLongWick = buildLiquidHeatmapFlowV2Features({
  market: { markPrice: 100.55, change24hPct: 15, quoteVolume: 8_000_000 },
  klines: liveLongWickBars,
  openInterest: { value: 1000, deltaPct: null, samples: 1 },
  liquidation: { socketState: 'CONNECTING', events: 0 },
  now: liveWickNow,
});
assert.equal(liveLongWick.approachCandleSource, 'LIVE_5M');
assert.equal(Number(liveLongWick.ema99LongTouchDistancePct.toFixed(2)), -0.15);
assert.equal(Number(liveLongWick.reboundFromApproachLowPct.toFixed(2)), 0.7);
assert.equal(classifyLiquidHeatmapFlowV2(liveLongWick).labelKey, 'PRE_UP_BASE_LONG');

const liveLongChased = classifyLiquidHeatmapFlowV2({
  ...liveLongWick,
  markPrice: 102.5,
  ema99DistancePct: 2.5,
  reboundFromApproachLowPct: 2.65,
});
assert.notEqual(liveLongChased.labelKey, 'PRE_UP_BASE_LONG');

const liveShortWick = classifyLiquidHeatmapFlowV2({
  ...base,
  candleCount: 180,
  change24hPct: -18,
  change1hPct: 1.4,
  volumeX: 1.05,
  takerDeltaPct: 5,
  ema13: 98.8,
  ema25: 99.3,
  ema99: 100,
  ema99DistancePct: -0.55,
  ema99ShortTouchDistancePct: 0.15,
  rejectFromApproachHighPct: 0.7,
  ema99SlopePct: -0.04,
  bounceFromRecentLowPct: 2.8,
  baseSweepShort: { ready: false },
});
assert.equal(liveShortWick.labelKey, 'PRE_DOWN_BASE_SHORT');

const flat5mBars = Array.from({ length: 180 }, (_, index) => ({
  open: 100,
  high: 100.2,
  low: 99.8,
  close: 100,
  quoteVolume: 100,
  takerBuyQuoteVolume: 50,
  closeTime: (index + 1) * 300_000,
}));
const deepLongRetest5mBars = Array.from({ length: 180 }, (_, index) => ({
  open: index >= 170 ? 100.9 : 100,
  high: index >= 170 ? 101.5 : 100.2,
  low: index >= 170 ? 100.5 : 99.8,
  close: index >= 170 ? 101 : 100,
  quoteVolume: 100,
  takerBuyQuoteVolume: 52,
  closeTime: (index + 1) * 300_000,
}));
deepLongRetest5mBars[178] = {
  open: 101,
  high: 101.2,
  low: 87.5,
  close: 99.6,
  quoteVolume: 300,
  takerBuyQuoteVolume: 140,
  closeTime: 179 * 300_000,
};
deepLongRetest5mBars[179] = {
  open: 99.8,
  high: 101.5,
  low: 99.5,
  close: 101,
  quoteVolume: 250,
  takerBuyQuoteVolume: 150,
  closeTime: 180 * 300_000,
};
const bearish1hBars = Array.from({ length: 120 }, (_, index) => {
  const close = 130 - index * 0.2;
  return {
    open: close + 0.08,
    high: close + 0.25,
    low: close - 0.25,
    close,
    quoteVolume: 100,
    takerBuyQuoteVolume: 45,
    closeTime: (index + 1) * 3_600_000,
  };
});
const shortRetest15mBars = Array.from({ length: 120 }, (_, index) => ({
  open: index >= 110 ? 99.1 : 100,
  high: index >= 110 ? 99.5 : 100.2,
  low: index >= 110 ? 98.5 : 99.8,
  close: index >= 110 ? 99 : 100,
  quoteVolume: 100,
  takerBuyQuoteVolume: 48,
  closeTime: (index + 1) * 900_000,
}));
shortRetest15mBars[118] = {
  open: 99,
  high: 100.8,
  low: 98.8,
  close: 100.4,
  quoteVolume: 300,
  takerBuyQuoteVolume: 160,
  closeTime: 119 * 900_000,
};
shortRetest15mBars[119] = {
  open: 100.2,
  high: 100.5,
  low: 98.5,
  close: 99,
  quoteVolume: 250,
  takerBuyQuoteVolume: 100,
  closeTime: 120 * 900_000,
};
const builtHtfShort = buildLiquidHeatmapFlowV2Features({
  market: { markPrice: 99, change24hPct: -8, quoteVolume: 8_000_000 },
  klines: flat5mBars,
  klines15m: shortRetest15mBars,
  klines1h: bearish1hBars,
  klines4h: [],
  now: 121 * 3_600_000,
});
assert.equal(builtHtfShort.trend1h.bearish, true);
assert.equal(builtHtfShort.htfBearTier, 'B_ONE');
assert.equal(builtHtfShort.ema99Retest15m.shortReady, true);
assert.equal(classifyLiquidHeatmapFlowV2(builtHtfShort).labelKey, 'HTF_BEAR_15M_EMA99_PUMP_REJECT');

const bullish4hBars = Array.from({ length: 120 }, (_, index) => {
  const close = 70 + index * 0.2;
  return {
    open: close - 0.08,
    high: close + 0.25,
    low: close - 0.25,
    close,
    quoteVolume: 100,
    takerBuyQuoteVolume: 55,
    closeTime: (index + 1) * 14_400_000,
  };
});
const longRetest15mBars = Array.from({ length: 120 }, (_, index) => ({
  open: index >= 110 ? 100.9 : 100,
  high: index >= 110 ? 101.5 : 100.2,
  low: index >= 110 ? 100.5 : 99.8,
  close: index >= 110 ? 101 : 100,
  quoteVolume: 100,
  takerBuyQuoteVolume: 52,
  closeTime: (index + 1) * 900_000,
}));
longRetest15mBars[118] = {
  open: 101,
  high: 101.2,
  low: 99.2,
  close: 99.6,
  quoteVolume: 300,
  takerBuyQuoteVolume: 140,
  closeTime: 119 * 900_000,
};
longRetest15mBars[119] = {
  open: 99.8,
  high: 101.5,
  low: 99.5,
  close: 101,
  quoteVolume: 250,
  takerBuyQuoteVolume: 150,
  closeTime: 120 * 900_000,
};
const builtHtfLong = buildLiquidHeatmapFlowV2Features({
  market: { markPrice: 101, change24hPct: 8, quoteVolume: 8_000_000 },
  klines: flat5mBars,
  klines15m: longRetest15mBars,
  klines1h: [],
  klines4h: bullish4hBars,
  now: 121 * 14_400_000,
});
assert.equal(builtHtfLong.trend4h.bullish, true);
assert.equal(builtHtfLong.htfBullTier, 'B_ONE');
assert.equal(builtHtfLong.ema99Retest15m.longReady, true);
assert.equal(classifyLiquidHeatmapFlowV2(builtHtfLong).labelKey, 'HTF_BULL_15M_EMA99_DUMP_RECLAIM');

const builtHtfLongFrom5m = buildLiquidHeatmapFlowV2Features({
  market: { markPrice: 101, change24hPct: 45, quoteVolume: 8_000_000 },
  klines: deepLongRetest5mBars,
  klines15m: [],
  klines1h: [],
  klines4h: bullish4hBars,
  now: 121 * 14_400_000,
});
assert.equal(builtHtfLongFrom5m.ema99Retest5m.timeframe, '5m');
assert.equal(builtHtfLongFrom5m.ema99Retest5m.longReady, true);
const builtHtfLongFrom5mClassification = classifyLiquidHeatmapFlowV2(builtHtfLongFrom5m);
assert.equal(builtHtfLongFrom5mClassification.labelKey, 'HTF_BULL_15M_EMA99_DUMP_RECLAIM');
assert.equal(builtHtfLongFrom5mClassification.ema99RetestTimeframe, '5m');

// BMTUSDT causal 5m fixture ending at the first closed breakout shown in the 2026-08-09 example.
const bmtFixture = [
  [0.01459, 0.01465, 0.01441, 0.01444, 73897.30407, 31539.87167],
  [0.01445, 0.01450, 0.01436, 0.01448, 29580.32180, 12896.78260],
  [0.01449, 0.01468, 0.01441, 0.01462, 92446.01077, 65998.24080],
  [0.01462, 0.01528, 0.01462, 0.01524, 160960.46779, 88751.51766],
  [0.01524, 0.01716, 0.01518, 0.01676, 1020089.67354, 537878.94318],
  [0.01677, 0.01718, 0.01520, 0.01584, 1061991.63720, 531269.38441],
  [0.01583, 0.01591, 0.01433, 0.01486, 660467.30504, 285472.85823],
  [0.01482, 0.01497, 0.01440, 0.01466, 269226.19894, 143059.44210],
  [0.01465, 0.01485, 0.01447, 0.01483, 163233.05478, 98684.41972],
  [0.01483, 0.01492, 0.01439, 0.01450, 227886.96061, 97236.14828],
  [0.01451, 0.01479, 0.01445, 0.01478, 88696.28887, 54180.49688],
  [0.01477, 0.01507, 0.01462, 0.01469, 231988.86665, 113623.80170],
  [0.01469, 0.01490, 0.01449, 0.01480, 115910.17802, 51242.68864],
  [0.01480, 0.01501, 0.01478, 0.01491, 66744.02039, 35107.14071],
  [0.01492, 0.01567, 0.01492, 0.01531, 247214.16244, 150181.14592],
  [0.01531, 0.01586, 0.01527, 0.01567, 167950.61568, 79103.02495],
  [0.01567, 0.01568, 0.01524, 0.01540, 98000.10593, 34684.59674],
  [0.01540, 0.01553, 0.01513, 0.01515, 65807.27661, 19789.68594],
  [0.01515, 0.01518, 0.01459, 0.01479, 136776.78113, 47781.55347],
  [0.01480, 0.01493, 0.01475, 0.01488, 43867.62502, 30470.13830],
  [0.01489, 0.01509, 0.01488, 0.01496, 35469.28449, 19150.17990],
  [0.01497, 0.01542, 0.01497, 0.01537, 56979.52937, 39347.77283],
  [0.01537, 0.01574, 0.01521, 0.01566, 98723.98935, 54064.54118],
  [0.01567, 0.01707, 0.01560, 0.01703, 700576.45654, 364424.09852],
].map(([open, high, low, close, quoteVolume, takerBuyQuoteVolume], index) => ({
  open,
  high,
  low,
  close,
  quoteVolume,
  takerBuyQuoteVolume,
  closeTime: (index + 1) * 300_000,
}));
const bmtPreEntry = buildLiquidHeatmapFlowV2Features({
  market: { markPrice: 0.01703, change24hPct: 53, quoteVolume: 11_000_000 },
  klines: bmtFixture,
  openInterest: { value: 1000, deltaPct: 0, samples: 3 },
  liquidation: { socketState: 'OPEN', events: 0 },
  now: 25 * 300_000,
});
const bmtContinuation = classifyLiquidHeatmapFlowV2(bmtPreEntry);
assert.equal(bmtPreEntry.baseSweepLong.ready, true);
assert.equal(Number(bmtPreEntry.baseSweepLong.breakoutVolumeX.toFixed(1)), 5.3);
assert.equal(bmtContinuation.labelKey, 'UP_BASE_SWEEP_LONG_READY');
assert.equal(bmtContinuation.phase, 'READY');

const noCatch = classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: -30,
  change1hPct: -8,
  volumeX: 2.5,
  takerDeltaPct: -15,
  lowerZoneTouched: true,
  lowerReclaim: false,
});
assert.equal(noCatch.labelKey, 'DOWN_SQUEEZE_ACTIVE');
assert.equal(noCatch.phase, 'WAIT');

const warmup = classifyLiquidHeatmapFlowV2({
  ...base,
  candleCount: 4,
  change24hPct: 18,
  volumeX: 2,
  liquidationSocketState: 'CONNECTING',
  openInterestSamples: 1,
});
assert.equal(warmup.warmingUp, true);
assert(warmup.missing.includes('closed-candles'));
assert(warmup.missing.includes('oi-delta'));
assert(warmup.missing.includes('force-order-socket'));

const candidates = selectLiquidHeatmapFlowV2Candidates([
  { symbol: 'AAAUSDT', markPrice: 1, change24hPct: 50, quoteVolume: 9_000_000 },
  { symbol: 'BBBUSDT', markPrice: 1, change24hPct: -30, quoteVolume: 8_000_000 },
  { symbol: 'CCCUSDT', markPrice: 1, change24hPct: 2, quoteVolume: 7_000_000 },
  { symbol: 'USDCUSDT', markPrice: 1, change24hPct: 1, quoteVolume: 99_000_000 },
  { symbol: 'LOWUSDT', markPrice: 1, change24hPct: 90, quoteVolume: 100_000 },
], { topPerSide: 2, maxSymbols: 4, minQuoteVolume: 2_000_000 });
assert.deepEqual(candidates.map((row) => row.symbol), ['AAAUSDT', 'CCCUSDT', 'BBBUSDT']);

const extendedSnapshot = Array.from({ length: 65 }, (_, index) => ({
  symbol: `EXT${index + 1}USDT`,
  markPrice: 1,
  change24hPct: 70 - index,
  quoteVolume: 4_000_000,
}));
const extendedCandidates = selectLiquidHeatmapFlowV2ExtendedCandidates(extendedSnapshot, {
  fromRank: 21, toRank: 60, maxSymbols: 40, minQuoteVolume: 3_000_000, minChange24hPct: 3,
});
assert.equal(extendedCandidates.length, 40);
assert.equal(extendedCandidates[0].symbol, 'EXT21USDT');
assert.equal(extendedCandidates[0].moverRank, 21);
assert.equal(extendedCandidates.at(-1).moverRank, 60);
assert.equal(extendedCandidates[0].universeTier, 'EXTENDED_21_60');

const extendedPanicFeatures = {
  ...base,
  candleCount: 200,
  moverSide: 'UP',
  moverRank: 47,
  universeTier: 'EXTENDED_21_60',
  change24hPct: 4.44,
  change1hPct: -1.2,
  ema13: 1.015,
  ema25: 1.01,
  ema99: 1,
  ema99LongTouchDistancePct: -0.4,
  ema99DistancePct: 0.4,
  reboundFromApproachLowPct: 0.8,
  ema99SlopePct: 0.01,
  pullbackFromRecentHighPct: 5.4,
  volumeX: 1.8,
  takerDeltaPct: -8,
  baseSweepLong: { ready: false },
  baseSweepShort: { ready: false },
  htfBullCount: 1,
  htfBullTier: 'B_ONE',
};
assert.equal(liquidHeatmapFlowV2ExtendedPrefilter(extendedPanicFeatures), true);
const extendedPanic = classifyLiquidHeatmapFlowV2(extendedPanicFeatures);
assert.equal(extendedPanic.labelKey, 'EXTENDED_EMA99_PANIC_RECLAIM_LONG');
assert.equal(extendedPanic.phase, 'READY');
assert.equal(extendedPanic.affectsBinance, false);
assert.equal(classifyLiquidHeatmapFlowV2({
  ...extendedPanicFeatures,
  universeTier: 'PRIMARY_1_20',
}).labelKey, 'WAIT');

const primaryPanicBase = {
  ...base,
  candleCount: 200,
  moverSide: 'UP',
  moverRank: 4,
  universeTier: 'PRIMARY_1_20',
  change24hPct: 30.2,
  change1hPct: -7.2,
  ema13: 1.02,
  ema25: 1.01,
  ema99: 1,
  ema99LongTouchDistancePct: 1.1,
  ema99DistancePct: 1.2,
  ema99SlopePct: 0.01,
  pullbackFromRecentHighPct: 10.8,
  volumeX: 1.66,
  baseSweepLong: { ready: false },
  baseSweepShort: { ready: false },
  htfBullCount: 2,
  htfBullTier: 'A_BOTH',
  lowerReclaim: true,
  lowerWickPct: 1.5,
  ema99Retest5m: { takerDeltaPct: 4.1 },
};
const primaryPanicActive = classifyLiquidHeatmapFlowV2({
  ...primaryPanicBase,
  reboundFromApproachLowPct: 0.11,
  takerDeltaPct: -53.4,
});
assert.equal(primaryPanicActive.labelKey, 'PRIMARY_EMA99_PANIC_FLUSH_ACTIVE');
assert.equal(primaryPanicActive.phase, 'WAIT');
assert.equal(primaryPanicActive.affectsBinance, false);
assert.equal(classifyLiquidHeatmapFlowV2({
  ...primaryPanicBase,
  reboundFromApproachLowPct: 0.65,
  takerDeltaPct: -53.4,
}).labelKey, 'PRIMARY_EMA99_PANIC_FLUSH_ACTIVE');
assert.equal(classifyLiquidHeatmapFlowV2({
  ...primaryPanicBase,
  ema99LongTouchDistancePct: 2.6,
  ema99DistancePct: -2.6,
  reboundFromApproachLowPct: -5.1,
  lowerReclaim: false,
  pullbackFromRecentHighPct: 14,
  volumeX: 3.5,
  takerDeltaPct: 38.9,
}).labelKey, 'PRIMARY_EMA99_PANIC_FLUSH_ACTIVE');

const primaryPanicReady = classifyLiquidHeatmapFlowV2({
  ...primaryPanicBase,
  reboundFromApproachLowPct: 0.65,
  takerDeltaPct: -8,
});
assert.equal(primaryPanicReady.labelKey, 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY');
assert.equal(primaryPanicReady.phase, 'READY');
assert.equal(primaryPanicReady.side, 'LONG');
assert.equal(primaryPanicReady.affectsBinance, false);

const stats = liquidHeatmapFlowV2Stats([
  { symbol: 'AAAUSDT', classification: shortReady },
  { symbol: 'BBBUSDT', classification: longReady },
  { symbol: 'MASKEDUSDT', classification: distributionNotMaskedByPrimary },
  { symbol: 'EXTENDEDUSDT', classification: extendedPanic },
], [
  { status: 'CLOSED', labelKey: 'PRE_UP_BASE_LONG', netRoe: 6 },
  { status: 'CLOSED', labelKey: 'PRE_UP_BASE_LONG', netRoe: 4.5 },
  { status: 'OPEN', labelKey: 'PRE_UP_BASE_LONG', netRoe: -99 },
  { status: 'CLOSED', labelKey: 'HTF_BEAR_15M_EMA99_PUMP_REJECT', netRoe: 5.5 },
  { status: 'CLOSED', labelKey: 'HTF_BULL_15M_EMA99_DUMP_RECLAIM', netRoe: 3.5 },
  { status: 'CLOSED', labelKey: 'PUMP_DISTRIBUTION_SHORT_READY', netRoe: 5.2 },
  { status: 'CLOSED', labelKey: 'EXTENDED_EMA99_PANIC_RECLAIM_LONG', netRoe: 5.1 },
  { status: 'CLOSED', labelKey: 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY', netRoe: 5.4 },
]);
assert.equal(stats.length, Object.keys(LIQUID_HEATMAP_FLOW_V2_LABELS).length);
assert.equal(stats.find((row) => row.key === 'UP_SWEEP_SHORT_READY').active, 1);
assert.equal(stats.find((row) => row.key === 'PRE_UP_BASE_LONG').whitelistKey, 'heatmap-v2:PRE_UP_BASE_LONG');
assert.equal(stats.find((row) => row.key === 'PRE_UP_BASE_LONG').paperClosed, 2);
assert.equal(stats.find((row) => row.key === 'PRE_UP_BASE_LONG').paperAvgRoe, 5.25);
assert.equal(stats.find((row) => row.key === 'PRE_UP_BASE_LONG').whitelistEligible, true);
assert.equal(stats.find((row) => row.key === 'PRE_DOWN_BASE_SHORT').whitelistEligible, false);
assert.equal(stats.find((row) => row.key === 'HTF_BEAR_15M_EMA99_PUMP_REJECT').whitelistKey, 'heatmap-v2:HTF_BEAR_15M_EMA99_PUMP_REJECT');
assert.equal(stats.find((row) => row.key === 'HTF_BEAR_15M_EMA99_PUMP_REJECT').whitelistEligible, true);
assert.equal(stats.find((row) => row.key === 'HTF_BULL_15M_EMA99_DUMP_RECLAIM').whitelistEligible, false);
assert.equal(stats.find((row) => row.key === 'PUMP_DISTRIBUTION_WATCH').whitelistEligible, false);
assert.equal(stats.find((row) => row.key === 'PUMP_DISTRIBUTION_SHORT_READY').whitelistKey, 'heatmap-v2:PUMP_DISTRIBUTION_SHORT_READY');
assert.equal(stats.find((row) => row.key === 'PUMP_DISTRIBUTION_SHORT_READY').active, 1);
assert.equal(stats.find((row) => row.key === 'PUMP_DISTRIBUTION_SHORT_READY').whitelistEligible, true);
assert.equal(stats.find((row) => row.key === 'EXTENDED_EMA99_PANIC_RECLAIM_LONG').whitelistKey, 'heatmap-v2:EXTENDED_EMA99_PANIC_RECLAIM_LONG');
assert.equal(stats.find((row) => row.key === 'EXTENDED_EMA99_PANIC_RECLAIM_LONG').active, 1);
assert.equal(stats.find((row) => row.key === 'EXTENDED_EMA99_PANIC_RECLAIM_LONG').whitelistEligible, true);
assert.equal(stats.find((row) => row.key === 'PRIMARY_EMA99_PANIC_FLUSH_ACTIVE').whitelistKey, 'heatmap-v2:PRIMARY_EMA99_PANIC_FLUSH_ACTIVE');
assert.equal(stats.find((row) => row.key === 'PRIMARY_EMA99_PANIC_FLUSH_ACTIVE').whitelistEligible, false);
assert.equal(stats.find((row) => row.key === 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY').whitelistKey, 'heatmap-v2:PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY');
assert.equal(stats.find((row) => row.key === 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY').paperAvgRoe, 5.4);
assert.equal(stats.find((row) => row.key === 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY').whitelistEligible, true);
for (const stat of stats) {
  assert.equal(normalizeLiquidLiveCardKey(stat.whitelistKey), stat.whitelistKey);
  assert.equal(stat.observationOnly, true);
  assert.equal(stat.affectsOrders, false);
}

let clock = 1_000_000;
const collector = new LiquidationFlowCollector({ now: () => clock });
collector.socketState = 'OPEN';
assert.equal(collector.ingestForceOrder({
  E: clock,
  o: { s: 'AAAUSDT', S: 'BUY', ap: '2', z: '100', T: clock },
}), true);
assert.equal(collector.ingestForceOrder({
  E: clock,
  o: { s: 'AAAUSDT', S: 'SELL', ap: '2', z: '50', T: clock },
}), true);
const liquidation = collector.summary('AAAUSDT', clock);
assert.equal(liquidation.shortLiquidationUsd, 200);
assert.equal(liquidation.longLiquidationUsd, 100);
assert.equal(liquidation.events, 2);
collector.recordOpenInterest('AAAUSDT', 1000, clock);
clock += 60_000;
const oi = collector.recordOpenInterest('AAAUSDT', 980, clock);
assert.equal(Number(oi.deltaPct.toFixed(2)), -2);
assert.equal(oi.samples, 2);

console.log('Liquid heatmap flow V2 observe-only tests passed.');
