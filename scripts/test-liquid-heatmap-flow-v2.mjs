import assert from 'node:assert/strict';
import {
  LIQUID_HEATMAP_FLOW_V2_LABELS,
  LIQUID_HEATMAP_FLOW_V2_VERSION,
  buildEmaFanLongSnapshot,
  buildEmaFanShortSnapshot,
  buildLiquidHeatmapFlowV2Features,
  buildPostPumpShortSqueezeSnapshot,
  buildPumpDistributionSnapshot,
  classifyLiquidHeatmapFlowV2,
  liquidHeatmapFlowV2ExtendedPrefilter,
  liquidHeatmapFlowV2Stats,
  selectLiquidHeatmapFlowV2Candidates,
  selectLiquidHeatmapFlowV2EmaFanShortCandidates,
  selectLiquidHeatmapFlowV2ExtendedCandidates,
  selectLiquidHeatmapFlowV2PostPumpCandidates,
} from '../src/liquidHeatmapFlowV2.js';
import { LiquidationFlowCollector } from '../src/liquidationFlowCollector.js';
import {
  LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_VERSION,
  buildFlagpoleShortKillSnapshot,
} from '../src/liquidFlowV2FlagpoleShortKill.js';
import {
  LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_VERSION,
  buildFadingWaveLivePumpSnapshot,
} from '../src/liquidFlowV2FadingWaveLivePump.js';
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
  openInterestPriorDeltaPct: 0,
  openInterestDelta5mPct: 0,
  openInterestStabilizing: false,
  openInterestSamples: 3,
  shortLiquidationUsd: 0,
  longLiquidationUsd: 0,
  shortLiquidationBurst: null,
  longLiquidationBurst: null,
  prior5mLongLiquidationUsd: 0,
  prior5mShortLiquidationUsd: 0,
  older5mLongLiquidationUsd: 0,
  older5mShortLiquidationUsd: 0,
  shortLiquidationDecayRatio: null,
  shortLiquidationDecaying: false,
  shortLiquidationPeakUsd: 0,
  longLiquidationDecayRatio: null,
  longLiquidationDecaying: false,
  longLiquidationPeakUsd: 0,
  liquidationEvents: 0,
  liquidationSocketState: 'OPEN',
};

assert.equal(LIQUID_HEATMAP_FLOW_V2_VERSION, 'LIQUID_HEATMAP_FLOW_V2_FADING_WAVE_LIVE_RECOVERY_V24_20260819');
assert.equal(LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_VERSION,
  'LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_V1_20260818');
assert.equal(LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_VERSION,
  'LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_V1_20260818');

const flagpoleBars = Array.from({ length: 80 }, (_, index) => {
  let open = 100 + Math.sin(index * 0.4) * 0.08;
  let close = 100 + Math.sin((index + 1) * 0.4) * 0.08;
  let high = Math.max(open, close) + 0.18;
  let low = Math.min(open, close) - 0.18;
  let quoteVolume = 1_000;
  let takerBuyQuoteVolume = 520;
  if (index === 45) {
    open = 108;
    close = 111;
    high = 112;
    low = 107.5;
    quoteVolume = 4_000;
    takerBuyQuoteVolume = 3_000;
  } else if (index > 45 && index < 78) {
    const drift = Math.min(index - 46, 8) * 0.15;
    open = 110 - drift;
    close = 109.8 - drift;
    high = Math.max(open, close) + 0.2;
    low = index === 54 ? 104 : Math.min(open, close) - 0.2;
  } else if (index === 78) {
    open = 107;
    high = 116;
    low = 106;
    close = 115.5;
    quoteVolume = 5_000;
    takerBuyQuoteVolume = 4_000;
  } else if (index === 79) {
    open = 115.5;
    high = 117;
    low = 113;
    close = 116.5;
    quoteVolume = 2_000;
    takerBuyQuoteVolume = 1_300;
  }
  return {
    open,
    high,
    low,
    close,
    quoteVolume,
    takerBuyQuoteVolume,
    openTime: index * 300_000,
    closeTime: (index + 1) * 300_000 - 1,
  };
});
const flagpoleSnapshot = buildFlagpoleShortKillSnapshot(flagpoleBars, 80 * 300_000);
assert.equal(flagpoleSnapshot.longReady, true);
assert.equal(flagpoleSnapshot.stage, 'LONG_READY');
assert(flagpoleSnapshot.priorPumpPct >= 8);
assert(flagpoleSnapshot.pullbackPct >= 2.5);
assert(flagpoleSnapshot.barsAfterPriorPeak >= 4);
assert(flagpoleSnapshot.flagpoleVolumeX >= 2.5);
assert(flagpoleSnapshot.confirmationLowerWickShare >= 0.2);

const firstPumpBars = flagpoleBars.map((bar, index) => index < 78 ? {
  ...bar,
  open: 100,
  high: 100.2,
  low: 99.8,
  close: 100,
  quoteVolume: 1_000,
  takerBuyQuoteVolume: 520,
} : bar);
assert.equal(buildFlagpoleShortKillSnapshot(firstPumpBars, 80 * 300_000).longReady, false);

const flagpoleShortKillReady = classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: 12,
  quoteVolume: 50_000_000,
  liquidityRank: 12,
  postPumpUniverse: true,
  flagpoleShortKill5m: flagpoleSnapshot,
  shortLiquidationUsd: 50_000,
  prior5mShortLiquidationUsd: 18_000,
  shortLiquidationBurst: 2,
  liquidationEvents: 3,
});
assert.equal(flagpoleShortKillReady.labelKey, 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY');
assert.equal(flagpoleShortKillReady.side, 'LONG');
assert.equal(flagpoleShortKillReady.phase, 'READY');
assert.equal(flagpoleShortKillReady.affectsOrders, true);
assert.equal(flagpoleShortKillReady.affectsBinance, false);
assert.equal(flagpoleShortKillReady.signalCandleClosedAt, flagpoleSnapshot.readyAt);
assert.notEqual(classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: 12,
  quoteVolume: 50_000_000,
  liquidityRank: 12,
  postPumpUniverse: true,
  flagpoleShortKill5m: flagpoleSnapshot,
  shortLiquidationUsd: 0,
  shortLiquidationBurst: 0,
}).labelKey, 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY');

const fadingWaveNow = 130 * 300_000 + 120_000;
const fadingWaveBars = Array.from({ length: 130 }, (_, index) => {
  const close = 130 - index * 0.2;
  const open = close + 0.08;
  return {
    open,
    high: open + 0.15,
    low: close - 0.15,
    close,
    quoteVolume: 1_000,
    takerBuyQuoteVolume: 520,
    openTime: index * 300_000,
    closeTime: (index + 1) * 300_000 - 1,
  };
});
fadingWaveBars.push({
  open: 104,
  high: 117,
  low: 103.8,
  close: 115,
  quoteVolume: 5_000,
  takerBuyQuoteVolume: 3_500,
  openTime: 130 * 300_000,
  closeTime: 131 * 300_000 - 1,
});
const fadingWaveSnapshot = buildFadingWaveLivePumpSnapshot(fadingWaveBars, fadingWaveNow);
assert.equal(fadingWaveSnapshot.shortReady, true);
assert.equal(fadingWaveSnapshot.stage, 'LIVE_PUMP_SHORT_READY');
assert.equal(fadingWaveSnapshot.readyAt, 130 * 300_000);
assert(fadingWaveSnapshot.ema13 < fadingWaveSnapshot.ema25);
assert(fadingWaveSnapshot.ema25 < fadingWaveSnapshot.ema99);
assert(fadingWaveSnapshot.ema99Slope12Pct <= -0.15);
assert(fadingWaveSnapshot.downReturn12Pct <= -1.5);
assert(fadingWaveSnapshot.waveDrawdownPct >= 3);
assert(fadingWaveSnapshot.livePumpHighPct >= 4);
assert(fadingWaveSnapshot.liveGivebackPct >= 0.6);
assert(fadingWaveSnapshot.liveVolumeX >= 1.8);
assert(fadingWaveSnapshot.liveTakerDeltaPct >= 8);
const builtFadingWave = buildLiquidHeatmapFlowV2Features({
  market: {
    markPrice: 115,
    change24hPct: -1.3,
    quoteVolume: 6_000_000,
    liquidityRank: 100,
    fadingWaveUniverse: true,
  },
  klines: fadingWaveBars,
  now: fadingWaveNow,
});
assert.equal(builtFadingWave.fadingWaveUniverse, true);
assert.equal(builtFadingWave.fadingWaveLivePump5m.shortReady, true);
assert.equal(classifyLiquidHeatmapFlowV2(builtFadingWave).labelKey,
  'FADING_WAVE_LIVE_PUMP_SHORT_READY');

const noLiveGivebackBars = fadingWaveBars.map((bar, index) => index === fadingWaveBars.length - 1
  ? { ...bar, close: bar.high }
  : bar);
assert.equal(buildFadingWaveLivePumpSnapshot(noLiveGivebackBars, fadingWaveNow).shortReady, false);
const nonDowntrendBars = fadingWaveBars.map((bar, index) => index < 130 ? {
  ...bar,
  open: 100 + index * 0.1,
  high: 100.2 + index * 0.1,
  low: 99.9 + index * 0.1,
  close: 100.1 + index * 0.1,
} : {
  ...bar,
  open: 113,
  high: 120,
  low: 112.8,
  close: 118,
});
assert.equal(buildFadingWaveLivePumpSnapshot(nonDowntrendBars, fadingWaveNow).shortReady, false);

const fadingWaveLivePumpReady = classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: -1.3,
  quoteVolume: 6_000_000,
  liquidityRank: 100,
  fadingWaveUniverse: true,
  fadingWaveLivePump5m: fadingWaveSnapshot,
});
assert.equal(fadingWaveLivePumpReady.labelKey, 'FADING_WAVE_LIVE_PUMP_SHORT_READY');
assert.equal(fadingWaveLivePumpReady.side, 'SHORT');
assert.equal(fadingWaveLivePumpReady.phase, 'READY');
assert.equal(fadingWaveLivePumpReady.observationOnly, false);
assert.equal(fadingWaveLivePumpReady.affectsOrders, true);
assert.equal(fadingWaveLivePumpReady.affectsBinance, true);
assert.equal(fadingWaveLivePumpReady.signalCandleClosedAt, fadingWaveSnapshot.liveCandleOpenAt);
assert.notEqual(classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: -1.3,
  quoteVolume: 6_000_000,
  liquidityRank: 151,
  fadingWaveUniverse: true,
  fadingWaveLivePump5m: fadingWaveSnapshot,
}).labelKey, 'FADING_WAVE_LIVE_PUMP_SHORT_READY');

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

const shortSweepWatch = classifyLiquidHeatmapFlowV2({
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
assert.equal(shortSweepWatch.labelKey, 'UP_SWEEP_SHORT_WATCH');
assert.equal(shortSweepWatch.phase, 'WAIT');
assert.equal(shortSweepWatch.observationOnly, true);
assert.equal(shortSweepWatch.affectsOrders, false);
assert.equal(shortSweepWatch.affectsBinance, false);

const shortReady = classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: 31,
  change1hPct: 6,
  openInterestDeltaPct: -1.7,
  shortLiquidationUsd: 0,
  sweepConfirmation5m: {
    shortWatch: true,
    shortReady: true,
    confirmedAt: 10_000,
    lastClosedTakerDeltaPct: -4,
  },
  candleClosedAt: 10_000,
});
assert.equal(shortReady.labelKey, 'UP_SWEEP_SHORT_READY');
assert.equal(shortReady.side, 'SHORT');
assert.equal(shortReady.phase, 'READY');
assert(shortReady.confidence >= 70);
assert.equal(classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: 31,
  change1hPct: 6,
  openInterestDeltaPct: -1.7,
  shortLiquidationUsd: 0,
  liquidationSocketState: 'CONNECTING',
  sweepConfirmation5m: { shortWatch: true, shortReady: true, lastClosedTakerDeltaPct: -4 },
}).labelKey, 'UP_SWEEP_SHORT_WATCH');

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

const longSweepWatch = classifyLiquidHeatmapFlowV2({
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
assert.equal(longSweepWatch.labelKey, 'DOWN_SWEEP_LONG_WATCH');
assert.equal(longSweepWatch.phase, 'WAIT');
assert.equal(longSweepWatch.observationOnly, true);
assert.equal(longSweepWatch.affectsOrders, false);
assert.equal(longSweepWatch.affectsBinance, false);

const longReady = classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: 5,
  change1hPct: -4,
  sweepConfirmation5m: {
    longWatch: true,
    longReady: true,
    confirmedAt: 20_000,
    lastClosedTakerDeltaPct: 6,
  },
  candleClosedAt: 20_000,
});
assert.equal(longReady.labelKey, 'DOWN_SWEEP_LONG_READY');
assert.equal(longReady.side, 'LONG');
assert.equal(longReady.phase, 'READY');

const killLongExhaustionReady = classifyLiquidHeatmapFlowV2({
  ...base,
  change24hPct: 20,
  change1hPct: -6,
  pullbackFromRecentHighPct: 12,
  reboundFromApproachLowPct: 1.1,
  volumeX: 2.8,
  takerDeltaPct: 7,
  lastBullish: true,
  lastBodyPct: 1.2,
  lastClosePosition: 0.82,
  lastClosedCandle: { low: 0.52, close: 0.58 },
  markPrice: 0.58,
  ema13: 0.565,
  ema25: 0.57,
  fastEmaReclaimed: true,
  higherLowConfirmed: true,
  openInterestDeltaPct: -0.05,
  openInterestPriorDeltaPct: -1.2,
  openInterestDelta5mPct: -4.5,
  openInterestStabilizing: true,
  longLiquidationUsd: 80_000,
  prior5mLongLiquidationUsd: 300_000,
  longLiquidationDecayRatio: 0.267,
  longLiquidationDecaying: true,
  longLiquidationPeakUsd: 300_000,
  liquidationEvents: 2,
  candleClosedAt: 15_000_000,
});
assert.equal(killLongExhaustionReady.labelKey, 'KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY');
assert.equal(killLongExhaustionReady.side, 'LONG');
assert.equal(killLongExhaustionReady.phase, 'READY');
assert.equal(killLongExhaustionReady.affectsOrders, true);
assert.equal(killLongExhaustionReady.affectsBinance, false);
assert.equal(killLongExhaustionReady.signalCandleClosedAt, 15_000_000);

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
  ema99DistancePct: 0.45,
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
  ema99DistancePct: -0.45,
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
  ema99DistancePct: 0.45,
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

const shortSweepBars = Array.from({ length: 20 }, (_, index) => ({
  open: 100.2,
  high: index === 17 ? 101.5 : 100.7,
  low: 99.8,
  close: 100.2,
  quoteVolume: 100,
  takerBuyQuoteVolume: 50,
  closeTime: (index + 1) * 300_000,
}));
shortSweepBars[18] = {
  open: 101, high: 102.3, low: 100.8, close: 101, quoteVolume: 180, takerBuyQuoteVolume: 80, closeTime: 19 * 300_000,
};
shortSweepBars[19] = {
  open: 100.9, high: 101.1, low: 99.8, close: 100, quoteVolume: 180, takerBuyQuoteVolume: 70, closeTime: 20 * 300_000,
};
const builtShortSweepConfirmation = buildLiquidHeatmapFlowV2Features({
  market: { markPrice: 100, change24hPct: 20, quoteVolume: 8_000_000 },
  klines: shortSweepBars,
  heatmap: { strongestAbove: [{ price: 102, score: 10 }], strongestBelow: [{ price: 98, score: 8 }] },
  openInterest: { value: 1000, deltaPct: -0.5, samples: 3 },
  liquidation: { socketState: 'OPEN', events: 1, shortUsd: 0 },
  now: 21 * 300_000,
});
assert.equal(builtShortSweepConfirmation.sweepConfirmation5m.shortWatch, true);
assert.equal(builtShortSweepConfirmation.sweepConfirmation5m.shortReady, true);

const longSweepBars = Array.from({ length: 20 }, (_, index) => ({
  open: 100,
  high: 100.5,
  low: index === 17 ? 98.8 : 99.5,
  close: 100,
  quoteVolume: 100,
  takerBuyQuoteVolume: 50,
  closeTime: (index + 1) * 300_000,
}));
longSweepBars[18] = {
  open: 99, high: 99.3, low: 97.8, close: 99, quoteVolume: 180, takerBuyQuoteVolume: 95, closeTime: 19 * 300_000,
};
longSweepBars[19] = {
  open: 99, high: 101.2, low: 98, close: 101, quoteVolume: 180, takerBuyQuoteVolume: 120, closeTime: 20 * 300_000,
};
const builtLongSweepConfirmation = buildLiquidHeatmapFlowV2Features({
  market: { markPrice: 101, change24hPct: 5, quoteVolume: 8_000_000 },
  klines: longSweepBars,
  heatmap: { strongestAbove: [{ price: 103, score: 8 }], strongestBelow: [{ price: 98, score: 10 }] },
  openInterest: { value: 1000, deltaPct: -0.5, samples: 3 },
  liquidation: { socketState: 'OPEN', events: 1 },
  now: 21 * 300_000,
});
assert.equal(builtLongSweepConfirmation.sweepConfirmation5m.longWatch, true);
assert.equal(builtLongSweepConfirmation.sweepConfirmation5m.longReady, true);

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
    close: 100.45,
    quoteVolume: 70,
    takerBuyQuoteVolume: 39,
    closeTime: liveWickNow + 300_000,
  },
];
const liveLongWick = buildLiquidHeatmapFlowV2Features({
  market: { markPrice: 100.45, change24hPct: 15, quoteVolume: 8_000_000 },
  klines: liveLongWickBars,
  openInterest: { value: 1000, deltaPct: null, samples: 1 },
  liquidation: { socketState: 'CONNECTING', events: 0 },
  now: liveWickNow,
});
assert.equal(liveLongWick.approachCandleSource, 'LIVE_5M');
assert.equal(Number(liveLongWick.ema99LongTouchDistancePct.toFixed(2)), -0.15);
  assert.equal(Number(liveLongWick.reboundFromApproachLowPct.toFixed(2)), 0.6);
assert.equal(classifyLiquidHeatmapFlowV2(liveLongWick).labelKey, 'PRE_UP_BASE_LONG');

const liveLongChased = classifyLiquidHeatmapFlowV2({
  ...liveLongWick,
  markPrice: 102.5,
  ema99DistancePct: 2.5,
  reboundFromApproachLowPct: 2.65,
});
assert.notEqual(liveLongChased.labelKey, 'PRE_UP_BASE_LONG');

const liveLongOutsideEntryCap = classifyLiquidHeatmapFlowV2({
  ...liveLongWick,
  markPrice: 100.51,
  ema99DistancePct: 0.51,
  reboundFromApproachLowPct: 0.7,
});
assert.notEqual(liveLongOutsideEntryCap.labelKey, 'PRE_UP_BASE_LONG');

const liveLongWeakRebound = classifyLiquidHeatmapFlowV2({
  ...liveLongWick,
  reboundFromApproachLowPct: 0.59,
});
assert.notEqual(liveLongWeakRebound.labelKey, 'PRE_UP_BASE_LONG');

const liveShortWickFeatures = {
  ...base,
  candleCount: 180,
  change24hPct: -18,
  change1hPct: 1.4,
  volumeX: 1.05,
  takerDeltaPct: 5,
  ema13: 98.8,
  ema25: 99.3,
  ema99: 100,
  ema99DistancePct: -0.45,
  ema99ShortTouchDistancePct: 0.15,
  rejectFromApproachHighPct: 0.7,
  ema99SlopePct: -0.04,
  bounceFromRecentLowPct: 2.8,
  baseSweepShort: { ready: false },
};
const liveShortWick = classifyLiquidHeatmapFlowV2(liveShortWickFeatures);
assert.equal(liveShortWick.labelKey, 'PRE_DOWN_BASE_SHORT');

const liveShortOutsideEntryCap = classifyLiquidHeatmapFlowV2({
  ...liveShortWickFeatures,
  ema99DistancePct: -0.51,
});
assert.notEqual(liveShortOutsideEntryCap.labelKey, 'PRE_DOWN_BASE_SHORT');

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

function postPumpBars({ breakout = true, absorbed = true } = {}) {
  const bars = Array.from({ length: 340 }, (_, index) => {
    const time = (index + 1) * 300_000;
    const descending = index > 40 && index < 327;
    const close = descending ? 1.45 - (index - 41) / 286 * 0.45 : 1;
    return {
      open: close,
      high: close * 1.004,
      low: close * 0.996,
      close,
      quoteVolume: descending ? 500 : 200,
      takerBuyQuoteVolume: descending ? 250 : 100,
      closeTime: time,
    };
  });
  bars[39] = { ...bars[39], open: 1, high: 1.01, low: 1, close: 1, quoteVolume: 250, takerBuyQuoteVolume: 125 };
  bars[40] = { ...bars[40], open: 1.1, high: 1.5, low: 1.08, close: 1.42, quoteVolume: 1_000, takerBuyQuoteVolume: 650 };
  for (let index = 327; index <= 338; index += 1) {
    const close = 1 + ((index % 3) - 1) * 0.002;
    bars[index] = {
      ...bars[index],
      open: close,
      high: 1.02,
      low: index < 333 ? 0.99 : 0.995,
      close,
      quoteVolume: 100,
      takerBuyQuoteVolume: absorbed ? 42 : 55,
    };
  }
  bars[339] = {
    ...bars[339],
    open: 1.01,
    high: breakout ? 1.05 : 1.018,
    low: 1.005,
    close: breakout ? 1.04 : 1.012,
    quoteVolume: breakout ? 500 : 100,
    takerBuyQuoteVolume: breakout ? 350 : 50,
  };
  return bars;
}

const postPumpPrimeSnapshot = buildPostPumpShortSqueezeSnapshot(postPumpBars(), 200_000_000);
assert.equal(postPumpPrimeSnapshot.longReady, true);
assert.equal(postPumpPrimeSnapshot.primeReady, true);
assert.equal(postPumpPrimeSnapshot.stage, 'PRIME');
assert(postPumpPrimeSnapshot.pumpPct >= 30);
assert(postPumpPrimeSnapshot.drawdownFromPeakPct >= 25);
assert(postPumpPrimeSnapshot.baseRangePct <= 6);
assert(postPumpPrimeSnapshot.volumeFadeRatio <= 0.65);

const postPumpWatchSnapshot = buildPostPumpShortSqueezeSnapshot(
  postPumpBars({ breakout: false }),
  200_000_000,
);
assert.equal(postPumpWatchSnapshot.watchReady, true);
assert.equal(postPumpWatchSnapshot.longReady, false);
assert.equal(postPumpWatchSnapshot.stage, 'BASE_ABSORPTION_WATCH');

const postPumpRegularFeatures = buildLiquidHeatmapFlowV2Features({
  market: {
    markPrice: 1.04,
    change24hPct: 8,
    quoteVolume: 20_000_000,
    liquidityRank: 12,
    postPumpUniverse: true,
    universeTier: 'POST_PUMP_TOP_150_LIQUIDITY',
  },
  klines: postPumpBars({ absorbed: false }),
  now: 200_000_000,
});
const postPumpRegular = classifyLiquidHeatmapFlowV2(postPumpRegularFeatures);
assert.equal(postPumpRegular.labelKey, 'POST_PUMP_SHORT_SQUEEZE_LONG_READY');
assert.equal(postPumpRegular.side, 'LONG');
assert.equal(postPumpRegular.phase, 'READY');
assert.equal(postPumpRegular.affectsOrders, true);
assert.equal(postPumpRegular.affectsBinance, true);

const postPumpPrimeFeatures = buildLiquidHeatmapFlowV2Features({
  market: {
    markPrice: 1.04,
    change24hPct: 8,
    quoteVolume: 20_000_000,
    liquidityRank: 12,
    postPumpUniverse: true,
    universeTier: 'POST_PUMP_TOP_150_LIQUIDITY',
  },
  klines: postPumpBars(),
  now: 200_000_000,
});
const postPumpPrime = classifyLiquidHeatmapFlowV2(postPumpPrimeFeatures);
assert.equal(postPumpPrime.labelKey, 'POST_PUMP_SHORT_SQUEEZE_PRIME');
assert.equal(postPumpPrime.observationOnly, false);
assert.equal(postPumpPrime.affectsOrders, true);
assert.equal(postPumpPrime.affectsBinance, false);

const postPumpWatchFeatures = buildLiquidHeatmapFlowV2Features({
  market: {
    markPrice: 1.012,
    change24hPct: 8,
    quoteVolume: 20_000_000,
    liquidityRank: 12,
    postPumpUniverse: true,
    universeTier: 'POST_PUMP_TOP_150_LIQUIDITY',
  },
  klines: postPumpBars({ breakout: false }),
  now: 200_000_000,
});
const postPumpWatch = classifyLiquidHeatmapFlowV2(postPumpWatchFeatures);
assert.equal(postPumpWatch.labelKey, 'POST_PUMP_BASE_ABSORPTION_WATCH');
assert.equal(postPumpWatch.phase, 'WATCH');
assert.equal(postPumpWatch.affectsOrders, false);

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
const emaFanDeepCandidates = selectLiquidHeatmapFlowV2ExtendedCandidates(Array.from({ length: 105 }, (_, index) => ({
  symbol: `FANEXT${index + 1}USDT`,
  markPrice: 1,
  change24hPct: 110 - index,
  quoteVolume: 4_000_000,
})), { fromRank: 61, toRank: 100, maxSymbols: 40, minQuoteVolume: 2_000_000, minChange24hPct: 0 });
assert.equal(emaFanDeepCandidates.length, 40);
assert.equal(emaFanDeepCandidates[0].moverRank, 61);
assert.equal(emaFanDeepCandidates.at(-1).moverRank, 100);
assert.equal(emaFanDeepCandidates[0].universeTier, 'EMA_FAN_LONG_EXTENDED_61_100');

const shortLiquiditySnapshot = Array.from({ length: 155 }, (_, index) => ({
  symbol: `SHORTLIQ${index + 1}USDT`,
  markPrice: 1,
  change24hPct: index === 150 ? -30 : index % 3 === 0 ? -6 : -2,
  quoteVolume: 200_000_000 - index * 1_000_000,
}));
const emaFanShortCandidates = selectLiquidHeatmapFlowV2EmaFanShortCandidates(shortLiquiditySnapshot, {
  topLiquidity: 150,
  minQuoteVolume: 2_000_000,
  maxChange24hPct: -5,
});
assert.equal(emaFanShortCandidates.length, 50);
assert.equal(emaFanShortCandidates[0].symbol, 'SHORTLIQ1USDT');
assert.equal(emaFanShortCandidates[0].liquidityRank, 1);
assert.equal(emaFanShortCandidates[0].emaFanShortUniverse, true);
assert.equal(emaFanShortCandidates[0].universeTier, 'EMA_FAN_SHORT_TOP_150');
assert.equal(emaFanShortCandidates.some((row) => row.symbol === 'SHORTLIQ151USDT'), false,
  'A deep loser outside the top-150 liquidity universe must not be admitted.');

const postPumpCandidates = selectLiquidHeatmapFlowV2PostPumpCandidates(shortLiquiditySnapshot, {
  topLiquidity: 150,
  minQuoteVolume: 2_000_000,
});
assert.equal(postPumpCandidates.length, 150);
assert.equal(postPumpCandidates[0].symbol, 'SHORTLIQ1USDT');
assert.equal(postPumpCandidates[0].liquidityRank, 1);
assert.equal(postPumpCandidates[0].postPumpUniverse, true);
assert.equal(postPumpCandidates[0].fadingWaveUniverse, true);
assert.equal(postPumpCandidates[0].universeTier, 'POST_PUMP_TOP_150_LIQUIDITY');
assert.equal(postPumpCandidates.some((row) => row.symbol === 'SHORTLIQ151USDT'), false);

const extendedPanicFeatures = {
  ...base,
  candleCount: 200,
  moverSide: 'UP',
  moverRank: 47,
  universeTier: 'EXTENDED_21_60',
  change24hPct: 4.44,
  quoteVolume: 4_000_000,
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
assert.equal(primaryPanicReady.affectsOrders, true);
assert.equal(primaryPanicReady.affectsBinance, true);

const emaFanBars = Array.from({ length: 119 }, (_, index) => {
  const close = 100 + Math.sin(index * 1.7) * 0.18 + Math.sin(index * 0.31) * 0.08;
  const open = 100 + Math.sin((index - 1) * 1.7) * 0.18 + Math.sin((index - 1) * 0.31) * 0.08;
  return {
    open,
    high: Math.max(open, close) + 0.08,
    low: Math.min(open, close) - 0.08,
    close,
    quoteVolume: 100,
    closeTime: (index + 1) * 300_000,
  };
});
emaFanBars.push({
  open: 99.95,
  high: 100.7,
  low: 99.9,
  close: 100.6,
  quoteVolume: 300,
  closeTime: 120 * 300_000,
});
const emaFanSnapshot = buildEmaFanLongSnapshot(emaFanBars, 121 * 300_000);
assert.equal(emaFanSnapshot.watchActive, true);
assert.equal(emaFanSnapshot.ready, true);
assert.equal(emaFanSnapshot.readyAt, 120 * 300_000);
assert(emaFanSnapshot.volumeX >= 2.5);
assert(emaFanSnapshot.watchDistanceFromEma13Pct <= 3);
assert(emaFanSnapshot.distanceFromEma13Pct <= 4);
assert.equal(typeof emaFanSnapshot.gap1325Widening, 'boolean');
assert.equal(typeof emaFanSnapshot.gap2599Widening, 'boolean');
const emaFanPersistentSnapshot = buildEmaFanLongSnapshot([
  ...emaFanBars,
  {
    open: 100.6,
    high: 100.75,
    low: 100.5,
    close: 100.7,
    quoteVolume: 100,
    closeTime: 121 * 300_000,
  },
], 122 * 300_000);
assert.equal(emaFanPersistentSnapshot.ready, true);
assert.equal(emaFanPersistentSnapshot.readyAt, 120 * 300_000);
const emaFanShortBars = emaFanBars.map((bar) => ({
  ...bar,
  open: 200 - bar.open,
  high: 200 - bar.low,
  low: 200 - bar.high,
  close: 200 - bar.close,
}));
const emaFanShortSnapshot = buildEmaFanShortSnapshot(emaFanShortBars, 121 * 300_000);
assert.equal(emaFanShortSnapshot.watchActive, true);
assert.equal(emaFanShortSnapshot.ready, true);
assert.equal(emaFanShortSnapshot.readyAt, 120 * 300_000);
assert(emaFanShortSnapshot.volumeX >= 2.5);
assert(emaFanShortSnapshot.watchDistanceFromEma13Pct <= 2.5);
assert(emaFanShortSnapshot.distanceFromEma13Pct <= 4);
const emaFanFeatures = buildLiquidHeatmapFlowV2Features({
  market: {
    markPrice: 100.6,
    change24hPct: 19.9,
    quoteVolume: 38_000_000,
    moverSide: 'UP',
    moverRank: 17,
    universeTier: 'PRIMARY_1_20',
  },
  klines: emaFanBars,
  now: 121 * 300_000,
});
const emaFanBoardClassification = classifyLiquidHeatmapFlowV2(emaFanFeatures);
assert(Object.hasOwn(emaFanFeatures.lastClosedCandle, 'takerDeltaPct'));
const emaFanClassification = emaFanBoardClassification.secondaryLabels
  .find((row) => row.labelKey === 'EMA_FAN_LONG_READY');
assert(emaFanClassification);
assert.equal(emaFanClassification.side, 'LONG');
assert.equal(emaFanClassification.phase, 'READY');
assert.equal(emaFanClassification.observationOnly, false);
assert.equal(emaFanClassification.affectsOrders, true);
assert.equal(emaFanClassification.affectsBinance, true);
assert.equal(emaFanClassification.signalCandleClosedAt, 120 * 300_000);
const emaFanImpulseClassification = classifyLiquidHeatmapFlowV2({
  ...emaFanFeatures,
  moverRank: 81,
  universeTier: 'EMA_FAN_LONG_EXTENDED_61_100',
  emaFanLong5m: {
    ...emaFanFeatures.emaFanLong5m,
    ready: true,
    volumeX: 6,
    bodyPct: 1.2,
    distanceFromEma13Pct: 2.5,
  },
}).secondaryLabels.find((row) => row.labelKey === 'EMA_FAN_LONG_IMPULSE_RUNNER');
assert(emaFanImpulseClassification);
assert.equal(emaFanImpulseClassification.side, 'LONG');
assert.equal(emaFanImpulseClassification.affectsOrders, true);
assert.equal(emaFanImpulseClassification.affectsBinance, true);
const emaFanShortFeatures = buildLiquidHeatmapFlowV2Features({
  market: {
    markPrice: 99.4,
    change24hPct: -8.2,
    quoteVolume: 38_000_000,
    moverSide: 'DOWN',
    liquidityRank: 17,
    emaFanShortUniverse: true,
    universeTier: 'EMA_FAN_SHORT_TOP_150',
  },
  klines: emaFanShortBars,
  now: 121 * 300_000,
});
const emaFanShortBoardClassification = classifyLiquidHeatmapFlowV2(emaFanShortFeatures);
const emaFanShortClassification = emaFanShortBoardClassification.secondaryLabels
  .find((row) => row.labelKey === 'EMA_FAN_SHORT_READY');
assert(emaFanShortClassification);
assert.equal(emaFanShortClassification.side, 'SHORT');
assert.equal(emaFanShortClassification.phase, 'READY');
assert.equal(emaFanShortClassification.observationOnly, true);
assert.equal(emaFanShortClassification.affectsOrders, false);
assert.equal(emaFanShortClassification.affectsBinance, false);
assert.equal(emaFanShortClassification.signalCandleClosedAt, 120 * 300_000);
assert.equal(classifyLiquidHeatmapFlowV2({
  ...emaFanShortFeatures,
  change24hPct: -4.99,
}).secondaryLabels.some((row) => row.labelKey === 'EMA_FAN_SHORT_READY'), false);
assert.equal(liquidHeatmapFlowV2ExtendedPrefilter({
  universeTier: 'EXTENDED_21_60',
  moverSide: 'UP',
  moverRank: 45,
  candleCount: 120,
  change24hPct: 1.2,
  emaFanLong5m: { watchActive: true },
}), true);
assert.equal(liquidHeatmapFlowV2ExtendedPrefilter({
  universeTier: 'EXTENDED_21_60',
  moverSide: 'UP',
  moverRank: 51,
  candleCount: 180,
  change24hPct: 1.2,
  emaFanLong5m: { watchActive: true },
}), true);
assert.equal(liquidHeatmapFlowV2ExtendedPrefilter({
  universeTier: 'EMA_FAN_LONG_EXTENDED_61_100',
  moverSide: 'UP',
  moverRank: 81,
  candleCount: 180,
  change24hPct: 1.2,
  emaFanLong5m: { watchActive: true },
}), true);
assert.equal(liquidHeatmapFlowV2ExtendedPrefilter({
  universeTier: 'EMA_FAN_LONG_EXTENDED_61_100',
  moverSide: 'UP',
  moverRank: 101,
  candleCount: 180,
  change24hPct: 1.2,
  emaFanLong5m: { watchActive: true },
}), false);

const stats = liquidHeatmapFlowV2Stats([
  { symbol: 'AAAUSDT', classification: shortReady },
  { symbol: 'BBBUSDT', classification: longReady },
  { symbol: 'UPWATCHUSDT', classification: shortSweepWatch },
  { symbol: 'DOWNWATCHUSDT', classification: longSweepWatch },
  { symbol: 'KILLLONGUSDT', classification: killLongExhaustionReady },
  { symbol: 'FLAGPOLEUSDT', classification: flagpoleShortKillReady },
  { symbol: 'FADINGWAVEUSDT', classification: fadingWaveLivePumpReady },
  { symbol: 'MASKEDUSDT', classification: distributionNotMaskedByPrimary },
  { symbol: 'EXTENDEDUSDT', classification: extendedPanic },
  {
    symbol: 'EMAFANUSDT',
    classification: { labelKey: 'WAIT', secondaryLabels: [emaFanClassification] },
  },
  {
    symbol: 'EMAFANSHORTUSDT',
    classification: { labelKey: 'WAIT', secondaryLabels: [emaFanShortClassification] },
  },
  {
    symbol: 'EMAFANIMPULSEUSDT',
    classification: { labelKey: 'WAIT', secondaryLabels: [emaFanImpulseClassification] },
  },
  { symbol: 'POSTPUMPPRIMEUSDT', classification: postPumpPrime },
  { symbol: 'POSTPUMPWATCHUSDT', classification: postPumpWatch },
], [
  { status: 'CLOSED', labelKey: 'PRE_UP_BASE_LONG', netRoe: 6 },
  { status: 'CLOSED', labelKey: 'PRE_UP_BASE_LONG', netRoe: 4.5 },
  { status: 'OPEN', labelKey: 'PRE_UP_BASE_LONG', netRoe: -99 },
  { status: 'CLOSED', labelKey: 'HTF_BEAR_15M_EMA99_PUMP_REJECT', netRoe: 5.5 },
  { status: 'CLOSED', labelKey: 'HTF_BULL_15M_EMA99_DUMP_RECLAIM', netRoe: 3.5 },
  { status: 'CLOSED', labelKey: 'PUMP_DISTRIBUTION_SHORT_READY', netRoe: 5.2 },
  { status: 'CLOSED', labelKey: 'EXTENDED_EMA99_PANIC_RECLAIM_LONG', netRoe: 5.1 },
  { status: 'CLOSED', labelKey: 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY', netRoe: 5.4 },
  { status: 'CLOSED', labelKey: 'EMA_FAN_LONG_READY', netRoe: 5.8 },
  { status: 'CLOSED', labelKey: 'EMA_FAN_SHORT_READY', netRoe: 6.1 },
  { status: 'CLOSED', labelKey: 'EMA_FAN_LONG_IMPULSE_RUNNER', netRoe: 8.4 },
  { status: 'CLOSED', labelKey: 'POST_PUMP_SHORT_SQUEEZE_LONG_READY', netRoe: 5.2 },
  { status: 'CLOSED', labelKey: 'POST_PUMP_SHORT_SQUEEZE_PRIME', netRoe: 9.6 },
  { status: 'CLOSED', labelKey: 'KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY', netRoe: 6.5 },
  { status: 'CLOSED', labelKey: 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY', netRoe: 5.6 },
  { status: 'CLOSED', labelKey: 'FADING_WAVE_LIVE_PUMP_SHORT_READY', netRoe: 5.7 },
]);
assert.equal(stats.length, Object.keys(LIQUID_HEATMAP_FLOW_V2_LABELS).length);
assert.equal(stats.find((row) => row.key === 'UP_SWEEP_SHORT_READY').active, 1);
assert.equal(stats.find((row) => row.key === 'UP_SWEEP_SHORT_WATCH').active, 1);
assert.equal(stats.find((row) => row.key === 'UP_SWEEP_SHORT_WATCH').whitelistKey,
  'heatmap-v2:UP_SWEEP_SHORT_WATCH');
assert.equal(stats.find((row) => row.key === 'UP_SWEEP_SHORT_WATCH').whitelistEligible, false);
assert.equal(stats.find((row) => row.key === 'DOWN_SWEEP_LONG_WATCH').active, 1);
assert.equal(stats.find((row) => row.key === 'DOWN_SWEEP_LONG_WATCH').whitelistKey,
  'heatmap-v2:DOWN_SWEEP_LONG_WATCH');
assert.equal(stats.find((row) => row.key === 'DOWN_SWEEP_LONG_WATCH').whitelistEligible, false);
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
assert.equal(stats.find((row) => row.key === 'POST_PUMP_BASE_ABSORPTION_WATCH').active, 1);
assert.equal(stats.find((row) => row.key === 'POST_PUMP_BASE_ABSORPTION_WATCH').whitelistEligible, false);
assert.equal(stats.find((row) => row.key === 'POST_PUMP_SHORT_SQUEEZE_LONG_READY').whitelistKey,
  'heatmap-v2:POST_PUMP_SHORT_SQUEEZE_LONG_READY');
assert.equal(stats.find((row) => row.key === 'POST_PUMP_SHORT_SQUEEZE_LONG_READY').paperAvgRoe, 5.2);
assert.equal(stats.find((row) => row.key === 'POST_PUMP_SHORT_SQUEEZE_LONG_READY').whitelistEligible, true);
assert.equal(stats.find((row) => row.key === 'POST_PUMP_SHORT_SQUEEZE_PRIME').active, 1);
assert.equal(stats.find((row) => row.key === 'POST_PUMP_SHORT_SQUEEZE_PRIME').paperAvgRoe, 9.6);
assert.equal(stats.find((row) => row.key === 'POST_PUMP_SHORT_SQUEEZE_PRIME').whitelistEligible, true);
assert.equal(stats.find((row) => row.key === 'KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY').active, 1);
assert.equal(stats.find((row) => row.key === 'KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY').whitelistKey,
  'heatmap-v2:KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY');
assert.equal(stats.find((row) => row.key === 'KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY').paperAvgRoe, 6.5);
assert.equal(stats.find((row) => row.key === 'KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY').whitelistEligible, true);
assert.equal(stats.find((row) => row.key === 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY').active, 1);
assert.equal(stats.find((row) => row.key === 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY').whitelistKey,
  'heatmap-v2:POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY');
assert.equal(stats.find((row) => row.key === 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY').paperAvgRoe, 5.6);
assert.equal(stats.find((row) => row.key === 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY').whitelistEligible, true);
assert.equal(liquidHeatmapFlowV2Stats([], [])
  .find((row) => row.key === 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY').whitelistEligible, false);
assert.equal(stats.find((row) => row.key === 'FADING_WAVE_LIVE_PUMP_SHORT_READY').active, 1);
assert.equal(stats.find((row) => row.key === 'FADING_WAVE_LIVE_PUMP_SHORT_READY').whitelistKey,
  'heatmap-v2:FADING_WAVE_LIVE_PUMP_SHORT_READY');
assert.equal(stats.find((row) => row.key === 'FADING_WAVE_LIVE_PUMP_SHORT_READY').paperAvgRoe, 5.7);
assert.equal(stats.find((row) => row.key === 'FADING_WAVE_LIVE_PUMP_SHORT_READY').whitelistEligible, true);
assert.equal(liquidHeatmapFlowV2Stats([], [])
  .find((row) => row.key === 'FADING_WAVE_LIVE_PUMP_SHORT_READY').whitelistEligible, false);
assert.equal(stats.find((row) => row.key === 'EXTENDED_EMA99_PANIC_RECLAIM_LONG').whitelistKey, 'heatmap-v2:EXTENDED_EMA99_PANIC_RECLAIM_LONG');
assert.equal(stats.find((row) => row.key === 'EXTENDED_EMA99_PANIC_RECLAIM_LONG').active, 1);
assert.equal(stats.find((row) => row.key === 'EXTENDED_EMA99_PANIC_RECLAIM_LONG').whitelistEligible, true);
assert.equal(stats.find((row) => row.key === 'PRIMARY_EMA99_PANIC_FLUSH_ACTIVE').whitelistKey, 'heatmap-v2:PRIMARY_EMA99_PANIC_FLUSH_ACTIVE');
assert.equal(stats.find((row) => row.key === 'PRIMARY_EMA99_PANIC_FLUSH_ACTIVE').whitelistEligible, false);
assert.equal(stats.find((row) => row.key === 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY').whitelistKey, 'heatmap-v2:PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY');
assert.equal(stats.find((row) => row.key === 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY').paperAvgRoe, 5.4);
assert.equal(stats.find((row) => row.key === 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY').whitelistEligible, true);
assert.equal(stats.find((row) => row.key === 'EMA_FAN_LONG_READY').whitelistKey, 'heatmap-v2:EMA_FAN_LONG_READY');
assert.equal(stats.find((row) => row.key === 'EMA_FAN_LONG_READY').active, 1);
assert.equal(stats.find((row) => row.key === 'EMA_FAN_LONG_READY').paperAvgRoe, 5.8);
assert.equal(stats.find((row) => row.key === 'EMA_FAN_LONG_READY').whitelistEligible, true);
assert.equal(stats.find((row) => row.key === 'EMA_FAN_SHORT_READY').whitelistKey, 'heatmap-v2:EMA_FAN_SHORT_READY');
assert.equal(stats.find((row) => row.key === 'EMA_FAN_SHORT_READY').active, 1);
assert.equal(stats.find((row) => row.key === 'EMA_FAN_SHORT_READY').paperAvgRoe, 6.1);
assert.equal(stats.find((row) => row.key === 'EMA_FAN_SHORT_READY').whitelistEligible, true);
assert.equal(stats.find((row) => row.key === 'EMA_FAN_LONG_IMPULSE_RUNNER').whitelistKey, 'heatmap-v2:EMA_FAN_LONG_IMPULSE_RUNNER');
assert.equal(stats.find((row) => row.key === 'EMA_FAN_LONG_IMPULSE_RUNNER').active, 1);
assert.equal(stats.find((row) => row.key === 'EMA_FAN_LONG_IMPULSE_RUNNER').paperAvgRoe, 8.4);
assert.equal(stats.find((row) => row.key === 'EMA_FAN_LONG_IMPULSE_RUNNER').whitelistEligible, true);
for (const stat of stats) {
  assert.equal(normalizeLiquidLiveCardKey(stat.whitelistKey), stat.whitelistKey);
  if (stat.key === 'EMA_FAN_LONG_READY'
    || stat.key === 'EMA_FAN_LONG_IMPULSE_RUNNER'
    || stat.key === 'PUMP_FLUSH_RECLAIM_LONG_READY'
    || stat.key === 'FADING_WAVE_LIVE_PUMP_SHORT_READY'
    || stat.key === 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY'
    || stat.key === 'POST_PUMP_SHORT_SQUEEZE_LONG_READY') {
    assert.equal(stat.observationOnly, false);
    assert.equal(stat.affectsOrders, true);
    assert.equal(stat.affectsBinance, true);
  } else if (stat.key === 'EMA_FAN_SHORT_READY') {
    assert.equal(stat.observationOnly, true);
    assert.equal(stat.affectsOrders, false);
    assert.equal(stat.affectsBinance, false);
  } else if (stat.key === 'POST_PUMP_SHORT_SQUEEZE_PRIME'
    || stat.key === 'KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY'
    || stat.key === 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY') {
    assert.equal(stat.observationOnly, false);
    assert.equal(stat.affectsOrders, true);
    assert.equal(stat.affectsBinance, false);
  } else {
    assert.equal(stat.observationOnly, true);
    assert.equal(stat.affectsOrders, false);
  }
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

clock = 2_000_000;
const exhaustionCollector = new LiquidationFlowCollector({ now: () => clock });
exhaustionCollector.socketState = 'OPEN';
exhaustionCollector.ingestForceOrder({
  E: clock - 6 * 60_000,
  o: { s: 'HEMIUSDT', S: 'SELL', ap: '1', z: '1000', T: clock - 6 * 60_000 },
});
exhaustionCollector.ingestForceOrder({
  E: clock - 60_000,
  o: { s: 'HEMIUSDT', S: 'SELL', ap: '1', z: '400', T: clock - 60_000 },
});
const exhaustionFlow = exhaustionCollector.summary('HEMIUSDT', clock);
assert.equal(exhaustionFlow.prior5mLongLiquidationUsd, 1000);
assert.equal(exhaustionFlow.longLiquidationUsd, 400);
assert.equal(exhaustionFlow.longLiquidationDecayRatio, 0.4);
assert.equal(exhaustionFlow.longLiquidationDecaying, true);
exhaustionCollector.recordOpenInterest('HEMIUSDT', 1100, clock - 6 * 60_000);
exhaustionCollector.recordOpenInterest('HEMIUSDT', 1030, clock - 2 * 60_000);
exhaustionCollector.recordOpenInterest('HEMIUSDT', 1000, clock - 60_000);
const exhaustionOi = exhaustionCollector.recordOpenInterest('HEMIUSDT', 995, clock);
assert(exhaustionOi.delta5mPct < -9);
assert(exhaustionOi.priorDeltaPct < -2);
assert.equal(exhaustionOi.stabilizing, true);

console.log('Liquid heatmap flow V2 label and execution-policy tests passed.');
