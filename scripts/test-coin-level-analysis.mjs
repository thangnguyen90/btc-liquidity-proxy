import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import {
  buildCoinLevelEntryPreview,
  buildCoinLevelEntryDisplay,
  COIN_LEVEL_ENTRY_PREVIEW_VERSION,
  COIN_LEVEL_ENTRY_DISPLAY_VERSION,
} from '../public/coin-level-entry-preview.js';
import {
  attachCoinGlassLiquidationAnalysis,
  evaluateCoinGlass24hTrial,
  COIN_LEVEL_ANALYSIS_VERSION,
  COIN_LEVEL_COINGLASS_VERSION,
  COIN_LEVEL_SECOND_REJECTION_VERSION,
  buildCoinLevelAnalysis,
  detectSecondRejectionLong15m,
  detectSecondRejectionShort15m,
  markCoinLevelAnalysisStale,
} from '../src/coinLevelAnalysis.js';
import {
  LIQ_SCAN_SNAPSHOT_VERSION,
  buildLiqScanSnapshot,
  assessSweepDirection,
} from '../src/liqScanSnapshot.js';

const now = Date.UTC(2026, 8, 1, 5, 0, 0);

function makeKlines({ intervalMs, count = 240, start = 1.2, drift = -0.0007 } = {}) {
  const rows = [];
  let previousClose = start;
  for (let index = 0; index < count; index += 1) {
    const wave = Math.sin(index / 5) * 0.006;
    const open = previousClose;
    const close = Math.max(0.2, open * (1 + drift + wave));
    const spread = open * (0.006 + (Math.abs(Math.cos(index / 4)) * 0.004));
    rows.push({
      openTime: now - ((count - index) * intervalMs),
      closeTime: index === count - 1 ? now + intervalMs : now - ((count - index - 1) * intervalMs) - 1,
      open,
      high: Math.max(open, close) + spread,
      low: Math.min(open, close) - spread,
      close,
      volume: 1_000 + (index * 3),
      quoteVolume: 5_000 + (index * 20),
      takerBuyQuoteVolume: 2_350 + (index * 8),
    });
    previousClose = close;
  }
  return rows;
}

const klinesByInterval = {
  '5m': makeKlines({ intervalMs: 5 * 60_000, start: 1.15 }),
  '15m': makeKlines({ intervalMs: 15 * 60_000, start: 1.3 }),
  '1h': makeKlines({ intervalMs: 60 * 60_000, start: 1.5 }),
  '4h': makeKlines({ intervalMs: 4 * 60 * 60_000, start: 1.7 }),
};

function makeSecondRejection15m() {
  const rows = [];
  for (let index = 0; index < 52; index += 1) {
    const close = 103 + Math.sin(index / 3) * 0.35;
    rows.push({
      openTime: now - ((52 - index) * 15 * 60_000),
      closeTime: index === 51 ? now + 15 * 60_000 : now - ((51 - index) * 15 * 60_000) - 1,
      open: close + 0.15,
      high: close + 0.65,
      low: close - 0.65,
      close,
      volume: 1_000,
      quoteVolume: 10_000,
      takerBuyQuoteVolume: 4_800,
    });
  }
  rows[34] = {
    ...rows[34], open: 106, high: 110, low: 103, close: 104,
    quoteVolume: 16_000, takerBuyQuoteVolume: 7_200,
  };
  for (let index = 35; index <= 47; index += 1) {
    rows[index] = {
      ...rows[index], open: 102.8, high: 103.8, low: index === 41 ? 99.5 : 101.8, close: 102.6,
    };
  }
  rows[49] = { ...rows[49], open: 104.6, high: 105.1, low: 103.6, close: 104.7 };
  rows[50] = {
    ...rows[50], open: 105.2, high: 109.7, low: 101.2, close: 102,
    quoteVolume: 18_000, takerBuyQuoteVolume: 7_200,
  };
  return rows;
}

const secondRejectionFixture = detectSecondRejectionShort15m(makeSecondRejection15m(), now);
assert.equal(secondRejectionFixture.version, COIN_LEVEL_SECOND_REJECTION_VERSION);
assert.equal(secondRejectionFixture.detected, true);
assert.equal(secondRejectionFixture.confirmed, true);
assert.equal(secondRejectionFixture.separationBars, 16);
assert.ok(secondRejectionFixture.invalidationPrice > secondRejectionFixture.secondReject.high);

function mirrorSecondRejectionForLong(rows) {
  return rows.map((row) => ({
    ...row,
    open: 200 - row.open,
    high: 200 - row.low,
    low: 200 - row.high,
    close: 200 - row.close,
    takerBuyQuoteVolume: row.quoteVolume - row.takerBuyQuoteVolume,
  }));
}

const secondRejectionLongFixture = detectSecondRejectionLong15m(
  mirrorSecondRejectionForLong(makeSecondRejection15m()),
  now,
);
assert.equal(secondRejectionLongFixture.version, COIN_LEVEL_SECOND_REJECTION_VERSION);
assert.equal(secondRejectionLongFixture.detected, true);
assert.equal(secondRejectionLongFixture.confirmed, true);
assert.equal(secondRejectionLongFixture.separationBars, 16);
assert.ok(secondRejectionLongFixture.invalidationPrice < secondRejectionLongFixture.secondReject.low);

const followThroughRows = makeSecondRejection15m();
followThroughRows[50] = {
  ...followThroughRows[50], open: 104.4, high: 109.7, low: 102.8, close: 104.8,
  quoteVolume: 17_000, takerBuyQuoteVolume: 8_200,
};
followThroughRows[51] = {
  ...followThroughRows[51],
  openTime: now - 15 * 60_000,
  closeTime: now - 1,
  open: 104.7,
  high: 105,
  low: 101.4,
  close: 102,
  quoteVolume: 18_500,
  takerBuyQuoteVolume: 7_500,
};
followThroughRows.push({
  ...followThroughRows[51],
  openTime: now,
  closeTime: now + 15 * 60_000,
  open: 102,
  high: 102.2,
  low: 101.8,
  close: 102.1,
});
const followThroughRejection = detectSecondRejectionShort15m(followThroughRows, now);
assert.equal(followThroughRejection.detected, true);
assert.equal(followThroughRejection.confirmed, true);
assert.equal(followThroughRejection.confirmationCandle.barsAfterSecondReject, 1);
const markPrice = klinesByInterval['5m'].at(-1).close;
const depth = {
  bids: Array.from({ length: 80 }, (_, index) => [markPrice * (1 - ((index + 1) * 0.001)), 800 + (index % 11) * 250]),
  asks: Array.from({ length: 80 }, (_, index) => [markPrice * (1 + ((index + 1) * 0.001)), 750 + (index % 13) * 220]),
};

const result = buildCoinLevelAnalysis({
  symbol: 'TESTUSDT',
  premiumIndex: { markPrice, indexPrice: markPrice * 1.0002, lastFundingRate: -0.0001 },
  ticker24h: {
    lastPrice: markPrice,
    priceChangePercent: -12.4,
    highPrice: markPrice * 1.18,
    lowPrice: markPrice * 0.96,
    quoteVolume: 12_500_000,
  },
  openInterest: { openInterest: 4_200_000 },
  depth,
  klinesByInterval,
  now,
});

assert.equal(result.version, COIN_LEVEL_ANALYSIS_VERSION);
assert.equal(result.observeOnly, true);
assert.equal(result.freshness.binance, 'LIVE');
assert.equal(result.freshness.stale, false);
assert.equal(result.execution.binanceEnabled, false);
assert.equal(result.execution.affectsEntry, false);
assert.equal(result.trend.frames.length, 4);
assert.equal(result.currentCandles.length, 2);
assert.ok(result.zones.supports.length > 0);
assert.ok(result.zones.resistances.length > 0);
assert.ok(result.zones.supports.every((zone) => zone.mid < result.market.markPrice));
assert.ok(result.zones.resistances.every((zone) => zone.mid > result.market.markPrice));
assert.equal(result.recommendation.confirmation.requiredInterval, '15m');
assert.equal(result.recommendation.confirmation.retestInterval, '5m');
assert.match(result.recommendation.longPlan.trigger, /Nến 15m.*retest 5m/);
assert.match(result.recommendation.shortPlan.trigger, /Nến 15m.*retest 5m/);
assert.ok(['CONFIRMED_15M', 'EARLY_5M_ONLY', 'WAITING'].includes(result.recommendation.confirmation.breakout));
assert.ok(['CONFIRMED_15M', 'EARLY_5M_ONLY', 'WAITING'].includes(result.recommendation.confirmation.breakdown));
assert.ok(result.recommendation.warnings.some((warning) => /Order book/.test(warning)));
assert.ok(result.recommendation.warnings.some((warning) => /nến 15m đã đóng/.test(warning)));
for (const side of ['LONG', 'SHORT']) {
  const preview = buildCoinLevelEntryPreview(result, side);
  const zone = result.recommendation[side === 'LONG' ? 'longPlan' : 'shortPlan'].entryZone;
  assert.equal(preview.version, COIN_LEVEL_ENTRY_PREVIEW_VERSION);
  assert.equal(preview.observeOnly, true);
  assert.equal(preview.status, 'WAIT_CONFIRMATION');
  assert.equal(preview.available, true);
  assert.deepEqual(preview.zone, { low: zone.low, high: zone.high });
  assert.equal(preview.referencePrice, (zone.low + zone.high) / 2);
}
assert.equal(buildCoinLevelEntryPreview(result, 'INVALID').available, false);
assert.equal(buildCoinLevelEntryPreview({ ...result, freshness: { stale: true } }, 'LONG').referencePrice, null);
assert.equal(buildCoinLevelEntryPreview({ ...result, freshness: { binance: 'STALE_LAST_GOOD' } }, 'SHORT').status, 'STALE');
for (const invalidZone of [null, { low: 0, high: 1 }, { low: 2, high: 1 }, { low: NaN, high: 3 }]) {
  const invalid = structuredClone(result);
  invalid.recommendation.longPlan.entryZone = invalidZone;
  assert.equal(buildCoinLevelEntryPreview(invalid, 'LONG').available, false);
  assert.equal(buildCoinLevelEntryPreview(invalid, 'LONG').referencePrice, null);
}

const sharedSupport = structuredClone(result);
sharedSupport.recommendation.context = 'AT_SUPPORT';
sharedSupport.recommendation.stance = 'WAIT_SUPPORT_CONFIRMATION';
sharedSupport.recommendation.bias = 'BULLISH';
sharedSupport.recommendation.longPlan.entryZone = { low: 0.013436, high: 0.013542 };
sharedSupport.recommendation.shortPlan.entryZone = { low: 0.013436, high: 0.013542 };
const waitingDisplay = buildCoinLevelEntryDisplay(sharedSupport);
assert.equal(waitingDisplay.version, COIN_LEVEL_ENTRY_DISPLAY_VERSION);
assert.equal(waitingDisplay.observeOnly, true);
assert.equal(waitingDisplay.sharedSupport, true);
assert.equal(waitingDisplay.confirmedSide, null);
assert.match(waitingDisplay.trendLabel, /NGHIÊNG LONG/);
assert.match(waitingDisplay.actionLabel, /CHƯA CHỌN HƯỚNG/);
assert.equal(waitingDisplay.cards.LONG.displayPrice, 0.013542);
assert.equal(waitingDisplay.cards.SHORT.displayPrice, 0.013436);
assert.match(waitingDisplay.cards.LONG.condition, /ĐÓNG TRÊN/);
assert.match(waitingDisplay.cards.SHORT.condition, /ĐÓNG DƯỚI/);
assert.equal(waitingDisplay.cards.LONG.visible, true);
assert.equal(waitingDisplay.cards.SHORT.visible, true);

const breakdownDisplay = buildCoinLevelEntryDisplay({ ...sharedSupport,
  recommendation: { ...sharedSupport.recommendation, stance: 'BEARISH_BREAKDOWN_15M_CONFIRMED' } });
assert.equal(breakdownDisplay.confirmedSide, 'SHORT');
assert.match(breakdownDisplay.actionLabel, /ƯU TIÊN SHORT SAU RETEST 5M/);
assert.equal(breakdownDisplay.cards.LONG.visible, false);
assert.equal(breakdownDisplay.cards.LONG.displayPrice, null);
assert.equal(breakdownDisplay.cards.SHORT.displayPrice, 0.013436);
assert.match(breakdownDisplay.cards.SHORT.state, /CHỜ RETEST 5M/);

const breakoutDisplay = buildCoinLevelEntryDisplay({ ...sharedSupport,
  recommendation: { ...sharedSupport.recommendation, stance: 'BULLISH_BREAKOUT_15M_CONFIRMED' } });
assert.equal(breakoutDisplay.confirmedSide, 'LONG');
assert.equal(breakoutDisplay.cards.LONG.displayPrice, 0.013542);
assert.equal(breakoutDisplay.cards.SHORT.displayPrice, null);

const staleDisplay = buildCoinLevelEntryDisplay({ ...sharedSupport, freshness: { stale: true } });
assert.equal(staleDisplay.cards.LONG.visible, false);
assert.equal(staleDisplay.cards.SHORT.visible, false);
assert.match(staleDisplay.actionLabel, /CHỜ DỮ LIỆU MỚI/);
const entryHtml = await readFile(new URL('../public/coin-level-analysis.html', import.meta.url), 'utf8');
assert(entryHtml.includes('id="entry-direction-summary"'));
assert(entryHtml.includes('id="long-entry-condition"'));
assert(entryHtml.includes('id="short-entry-condition"'));
assert(!entryHtml.includes('GIÁ LONG DỰ KIẾN'));

const liqScanSnapshot = buildLiqScanSnapshot({
  symbol: 'BULLAUSDT',
  markPrice: 0.08075,
  evaluatedAt: now,
  heatmap: {
    liquidityAbove: 798_880_000,
    liquidityBelow: 0,
    bias: 1,
    sweepTarget: { direction: 'above', price: 0.08854, distancePct: 9.65, score: 55_568 },
    killZoneCluster: {
      side: 'UP',
      isOneSided: true,
      farKillZone: { low: 0.08687, high: 0.0902, mid: 0.08854, distancePctLow: 7.58, distancePctHigh: 11.7, score: 23 },
    },
  },
});
assert.equal(liqScanSnapshot.version, LIQ_SCAN_SNAPSHOT_VERSION);
assert.equal(liqScanSnapshot.isAlert, true);
assert.equal(liqScanSnapshot.dominantSide, 'ABOVE');
assert.equal(liqScanSnapshot.sweepProbabilityPct, 99);
assert.equal(liqScanSnapshot.liquidityAbove, 798_880_000);
assert.equal(liqScanSnapshot.liquidityBelow, 0);
assert.equal(liqScanSnapshot.sweepTarget.price, 0.08854);
assert.equal(liqScanSnapshot.observeOnly, true);
assert.equal(liqScanSnapshot.execution.binanceEnabled, false);

const staleFallback = markCoinLevelAnalysisStale(result, new DOMException('This operation was aborted', 'AbortError'), now + 60_000);
assert.equal(staleFallback.generatedAt, result.generatedAt);
assert.equal(staleFallback.freshness.binance, 'STALE_LAST_GOOD');
assert.equal(staleFallback.freshness.stale, true);
assert.match(staleFallback.freshness.fallbackReason, /timeout\/aborted/);
assert.equal(staleFallback.recommendation.warnings.filter((warning) => /Binance live tạm lỗi/.test(warning)).length, 1);

const zone = (side, multiplier, strength, lastX = 100) => ({
  price: markPrice * multiplier,
  side,
  strength,
  persistenceBars: 80,
  totalIntensity: strength * 1_000,
  lastX,
  bandLow: markPrice * multiplier * 0.995,
  bandHigh: markPrice * multiplier * 1.005,
});
const coinglassContext = {
  streamId: 'primary',
  snapshotUpdatedAt: new Date(now - 60_000).toISOString(),
  refresh: { status: 'RUNNING', symbol: 'TESTUSDT' },
  row: {
    symbol: 'TESTUSDT',
    status: 'OK',
    range: '48h',
    scrapedAt: new Date(now - 60_000).toISOString(),
    globalRank: 12,
    heatmap: {
      currentPrice: markPrice,
      lastHeatmapX: 100,
      liquidationCellCount: 2_400,
      edgeZones: [
        zone('ABOVE', 1.05, 90),
        zone('ABOVE', 1.09, 70),
        zone('BELOW', 0.96, 35),
        zone('BELOW', 0.82, 99, 94),
      ],
    },
    qualifiedTimeframes: {
      '12h': {
        scrapedAt: new Date(now - 50_000).toISOString(),
        heatmap: {
          currentPrice: markPrice,
          lastHeatmapX: 200,
          liquidationCellCount: 1_800,
          edgeZones: [zone('ABOVE', 1.04, 88, 200), zone('BELOW', 0.95, 30, 200)],
        },
      },
      '24h': {
        scrapedAt: new Date(now - 55_000).toISOString(),
        heatmap: {
          currentPrice: markPrice,
          lastHeatmapX: 160,
          liquidationCellCount: 2_000,
          edgeZones: [zone('ABOVE', 1.06, 82, 160), zone('BELOW', 0.94, 28, 160)],
        },
      },
    },
  },
  lifecycle: {
    tracks: {
      'TESTUSDT:ABOVE': {
        state: 'FRESH',
        previousState: 'FRESH',
        swept: false,
        lastSeenAt: now,
        zone: { price: markPrice * 1.05, midpoint: markPrice * 1.05 },
      },
    },
  },
};
const combined = attachCoinGlassLiquidationAnalysis(result, coinglassContext, now);
const directionCurrent = { evaluatedAt: new Date(now).toISOString(), totalLiquidity: 100, bias: 0.6, dominantSide: 'ABOVE', isAlert: true };
const directionAnalysis = structuredClone(combined);
directionAnalysis.trend.bias = 'BULLISH';
directionAnalysis.recommendation.confirmation.breakout = 'CONFIRMED_15M';
const alignedDirection = assessSweepDirection(directionAnalysis, directionCurrent, now);
assert.equal(alignedDirection.state, 'DIRECTIONAL_WATCH');
assert.equal(alignedDirection.direction, 'ABOVE');
assert.equal(alignedDirection.sourceRange, '24h');
assert.ok(alignedDirection.target.bandLow > markPrice);
assert.equal(alignedDirection.observeOnly, true);
const conflictDirection = assessSweepDirection(directionAnalysis, { ...directionCurrent, bias: -0.6, dominantSide: 'BELOW' }, now);
assert.equal(conflictDirection.state, 'CONFLICT');
assert.equal(conflictDirection.target, null);
assert.equal(assessSweepDirection(directionAnalysis, { ...directionCurrent, isAlert: false }, now).direction, null);
assert.equal(assessSweepDirection(directionAnalysis, { ...directionCurrent, evaluatedAt: new Date(now - 100_000).toISOString() }, now).state, 'MISSING_DATA');
const watchAnalysis = structuredClone(directionAnalysis);
watchAnalysis.recommendation.confirmation.breakout = 'WAITING';
assert.equal(assessSweepDirection(watchAnalysis, directionCurrent, now).target, null);
const rejectedDirectionAnalysis = structuredClone(directionAnalysis);
for (const frame of rejectedDirectionAnalysis.coinglass.frames) {
  for (const zone of frame.above) zone.lifecycle = 'REJECTED';
}
assert.equal(assessSweepDirection(rejectedDirectionAnalysis, directionCurrent, now).above, null);
assert.equal(assessSweepDirection(rejectedDirectionAnalysis, directionCurrent, now).target, null);
assert.equal(combined.version, COIN_LEVEL_ANALYSIS_VERSION);
assert.equal(combined.coinglass.version, COIN_LEVEL_COINGLASS_VERSION);
assert.equal(combined.coinglass.available, true);
assert.equal(combined.coinglass.refresh.status, 'RUNNING');
assert.equal(combined.coinglass.frames.length, 3);
assert.equal(combined.coinglass.frames[0].above[0].lifecycle, 'FRESH');
assert.equal(combined.coinglass.combined.liquidityBias, 'UPPER_FIRST');
assert.ok(combined.coinglass.combined.nearestAbove.price > markPrice);
assert.ok(combined.recommendation.coinglassConfluence.available);
assert.equal(combined.execution.binanceEnabled, false);

const trialFrames = [
  { range: '24h', upperScore: 100, lowerScore: 0, above: [], below: [], scrapedAt: new Date(now).toISOString() },
  { range: '12h', upperScore: 0, lowerScore: 100, above: [], below: [], scrapedAt: new Date(now).toISOString() },
];
const trial = evaluateCoinGlass24hTrial(trialFrames, now);
assert.equal(trial.weighted.liquidityBias, 'UPPER_FIRST');
assert.equal(trial.equalWeight.liquidityBias, 'BALANCED');
assert.equal(trial.weighted.upperScore, 140);
assert.equal(trial.weighted.lowerScore, 75);
assert.equal(trial.observeOnly, true);
const staleTrial = evaluateCoinGlass24hTrial([{ ...trialFrames[0], scrapedAt: new Date(now - 21 * 60_000).toISOString() }, trialFrames[1]], now);
assert.equal(staleTrial.hasFresh24h, false);
assert.equal(staleTrial.weighted.liquidityBias, 'LOWER_FIRST');
assert.deepEqual(staleTrial.excludedRanges, ['24h']);
assert.equal(evaluateCoinGlass24hTrial([], now).weighted.liquidityBias, 'NO_DATA');
assert.equal(evaluateCoinGlass24hTrial([trialFrames[0], trialFrames[0]], now).weighted.upperScore, 140);
assert.equal(combined.coinglass.timeframeTrial.hasFresh24h, true);

const unavailable = attachCoinGlassLiquidationAnalysis(result, { row: null, snapshotUpdatedAt: new Date(now).toISOString() }, now);
assert.equal(unavailable.coinglass.available, false);
assert.equal(unavailable.coinglass.reason, 'NOT_IN_ACTIVE_TOP80_SCAN');

const rejectedUpper = attachCoinGlassLiquidationAnalysis(result, {
  streamId: 'on-demand',
  snapshotUpdatedAt: new Date(now - 30_000).toISOString(),
  row: {
    symbol: 'TESTUSDT',
    status: 'OK',
    range: '48h',
    scrapedAt: new Date(now - 30_000).toISOString(),
    heatmap: {
      currentPrice: markPrice,
      lastHeatmapX: 300,
      liquidationCellCount: 1_200,
      edgeZones: [zone('ABOVE', 1.05, 90, 300), zone('BELOW', 0.97, 45, 300)],
    },
  },
  lifecycle: {
    tracks: {
      'TESTUSDT:ABOVE': {
        state: 'REJECTED',
        previousState: 'SWEPT',
        swept: true,
        zone: { price: markPrice * 1.05, midpoint: markPrice * 1.05 },
      },
      'TESTUSDT:BELOW': {
        state: 'APPROACHING',
        previousState: 'FRESH',
        swept: false,
        zone: { price: markPrice * 0.97, midpoint: markPrice * 0.97 },
      },
    },
  },
}, now);
assert.equal(rejectedUpper.coinglass.frames[0].above[0].effectiveAttractionScore, 0);
assert.ok(rejectedUpper.coinglass.frames[0].lowerRejectionPressure > 0);
assert.equal(rejectedUpper.coinglass.combined.lifecycleSignal, 'UPPER_REJECTED_TO_LOWER');
assert.equal(rejectedUpper.coinglass.combined.liquidityBias, 'LOWER_FIRST');
assert.equal(rejectedUpper.coinglass.combined.nearestAbove, null);
assert.ok(rejectedUpper.coinglass.combined.rawNearestAbove);
assert.ok(rejectedUpper.coinglass.combined.nearestBelow);
assert.match(rejectedUpper.coinglass.combined.headline, /REJECTED.*phía dưới/);
assert.equal(rejectedUpper.coinglass.timeframeTrial.weighted.lifecycleSignal, 'UPPER_REJECTED_TO_LOWER');
assert.equal(rejectedUpper.coinglass.timeframeTrial.weighted.liquidityBias, 'LOWER_FIRST');

const secondRejectionAnalysis = structuredClone(result);
secondRejectionAnalysis.trend.bias = 'BEARISH';
secondRejectionAnalysis.recommendation.secondRejectionShort = {
  ...secondRejectionFixture,
  firstReject: { ...secondRejectionFixture.firstReject, high: markPrice * 1.025, close: markPrice * 1.005 },
  secondReject: { ...secondRejectionFixture.secondReject, high: markPrice * 1.024, close: markPrice * 0.998 },
  resistanceHigh: markPrice * 1.025,
  invalidationPrice: markPrice * 1.03,
};
const lowerTargetContext = structuredClone(coinglassContext);
lowerTargetContext.lifecycle = { tracks: {} };
for (const [range, holder] of [
  ['48h', lowerTargetContext.row],
  ['12h', lowerTargetContext.row.qualifiedTimeframes['12h']],
  ['24h', lowerTargetContext.row.qualifiedTimeframes['24h']],
]) {
  const lastHeatmapX = range === '48h' ? 100 : range === '12h' ? 200 : 160;
  holder.heatmap.edgeZones = [
    zone('ABOVE', 1.04, 18, lastHeatmapX),
    zone('BELOW', 0.96, 98, lastHeatmapX),
    zone('BELOW', 0.92, 72, lastHeatmapX),
  ];
  holder.heatmap.lastHeatmapX = lastHeatmapX;
}
const secondRejectionReady = attachCoinGlassLiquidationAnalysis(secondRejectionAnalysis, lowerTargetContext, now);
assert.equal(secondRejectionReady.coinglass.combined.agreement, 'ALIGNED_SHORT');
assert.equal(secondRejectionReady.recommendation.secondRejectionShort.ready, true);
assert.equal(secondRejectionReady.recommendation.secondRejectionShort.state, 'READY');
assert.ok(secondRejectionReady.recommendation.secondRejectionShort.takeProfitPrice < markPrice);
assert.ok(secondRejectionReady.recommendation.warnings.some((warning) => /SHORT READY: reject lần 2/.test(warning)));

const secondRejectionLongAnalysis = structuredClone(result);
secondRejectionLongAnalysis.trend.bias = 'BULLISH';
secondRejectionLongAnalysis.recommendation.secondRejectionLong = {
  ...secondRejectionLongFixture,
  firstReject: { ...secondRejectionLongFixture.firstReject, low: markPrice * 0.975, close: markPrice * 0.995 },
  secondReject: { ...secondRejectionLongFixture.secondReject, low: markPrice * 0.976, close: markPrice * 1.002 },
  supportLow: markPrice * 0.975,
  invalidationPrice: markPrice * 0.97,
};
const upperTargetContext = structuredClone(coinglassContext);
upperTargetContext.lifecycle = { tracks: {} };
for (const [range, holder] of [
  ['48h', upperTargetContext.row],
  ['12h', upperTargetContext.row.qualifiedTimeframes['12h']],
  ['24h', upperTargetContext.row.qualifiedTimeframes['24h']],
]) {
  const lastHeatmapX = range === '48h' ? 100 : range === '12h' ? 200 : 160;
  holder.heatmap.edgeZones = [
    zone('ABOVE', 1.04, 98, lastHeatmapX),
    zone('ABOVE', 1.08, 72, lastHeatmapX),
    zone('BELOW', 0.96, 18, lastHeatmapX),
  ];
  holder.heatmap.lastHeatmapX = lastHeatmapX;
}
const secondRejectionLongReady = attachCoinGlassLiquidationAnalysis(secondRejectionLongAnalysis, upperTargetContext, now);
assert.equal(secondRejectionLongReady.coinglass.combined.agreement, 'ALIGNED_LONG');
assert.equal(secondRejectionLongReady.recommendation.secondRejectionLong.ready, true);
assert.equal(secondRejectionLongReady.recommendation.secondRejectionLong.state, 'READY');
assert.ok(secondRejectionLongReady.recommendation.secondRejectionLong.takeProfitPrice > markPrice);
assert.ok(secondRejectionLongReady.recommendation.warnings.some((warning) => /LONG READY: reject đáy lần 2/.test(warning)));

const [uiSource, htmlSource, cssSource, serverSource, collectorSource, managerSource] = await Promise.all([
  readFile(new URL('../public/coin-level-analysis.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/server.js', import.meta.url), 'utf8'),
  readFile(new URL('./crawl-coinglass-web-top20.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../src/coinglassWebTop20.js', import.meta.url), 'utf8'),
]);
assert.match(uiSource, /coin-level-analysis\/coinglass-refresh/);
assert.match(uiSource, /triggerCoinGlass: true/);
assert.match(uiSource, /kết quả gần nhất vẫn được giữ/);
assert.match(uiSource, /validUsdtSymbol/);
assert.match(uiSource, /buildCoinLevelEntryDisplay\(data\)/);
assert.match(uiSource, /renderEntryPreview\(data\)/);
assert.match(uiSource, /Hai ngưỡng là hai mép của cùng vùng hỗ trợ/);
assert.match(htmlSource, /id="long-entry-price"/);
assert.match(htmlSource, /id="short-entry-price"/);
assert.match(htmlSource, /id="entry-preview-disclaimer"/);
assert.match(htmlSource, /không phải giá vào lệnh/);
assert.match(cssSource, /\.long-entry-preview.*border-color:/);
assert.match(cssSource, /\.short-entry-preview.*border-color:/);
assert.match(cssSource, /\.entry-preview-price/);
assert.match(uiSource, /\\p\{L\}/);
assert.match(uiSource, /LiqScan báo lúc/);
assert.match(uiSource, /const snapshot = current \?\? lastAlert/);
assert.match(uiSource, /const encodedSymbol = encodeURIComponent\(data\.symbol\)/);
assert.match(uiSource, /LiquidationHeatMapModel3\?coin=\$\{encodedCoin\}/);
assert.match(uiSource, /\$\('#coinglass-model3-link'\)\.href = coinglassModel3Url/);
assert.match(uiSource, /\$\('#coinglass-link'\)\.href = coinglassModel3Url/);
const renderNodes = Object.fromEntries(['#liq-scan-panel', '#liq-scan-badge', '#liq-scan-content'].map((key) => [key, {}]));
const renderContext = {
  $: (key) => renderNodes[key],
  price: String, pct: String, compact: String, escapeHtml: String,
  sample: { current: { ...directionCurrent, evaluatedAt: new Date().toISOString(), liquidityAbove: 123, liquidityBelow: 45, imbalanceScore: 46 }, lastAlert: { ...directionCurrent, evaluatedAt: new Date(now).toISOString(), liquidityAbove: 999, liquidityBelow: 1, sweepProbabilityPct: 99 }, directionAssessment: conflictDirection },
};
runInNewContext(uiSource.slice(uiSource.indexOf('function renderLiqScan('), uiSource.indexOf('function renderCoinGlass(')) + '\nrenderLiqScan(sample);', renderContext);
assert.match(renderNodes['#liq-scan-content'].innerHTML, /hiện tại.*trên 123, dưới 45, điểm lệch thanh khoản 46\/100/);
assert.match(renderNodes['#liq-scan-content'].innerHTML, /<details.*Cảnh báo lịch sử/);
assert.equal(renderNodes['#liq-scan-badge'].textContent, 'HAI NGUỒN MÂU THUẪN');
assert.match(uiSource, /snapshot\.liquidityAbove/);
assert.match(htmlSource, /id="liq-scan-panel"/);
assert.match(htmlSource, /id="coinglass-model3-link"/);
assert.match(htmlSource, /https:\/\/www\.coinglass\.com\/pro\/futures\/LiquidationHeatMapModel3/);
assert.match(cssSource, /\.liq-scan-panel/);
assert.match(cssSource, /\.market-actions/);
assert.match(serverSource, /coinGlassWebTop20\.startOnDemand\(symbol\)/);
assert.match(serverSource, /attachLatestLiqScanAlert\(analysis\)/);
assert.match(serverSource, /onAlert: retainLatestLiqScanAlert/);
assert.match(serverSource, /safeCoinglassSymbol\(normalizeSymbol\(rawSymbol\)\)/);
assert.match(serverSource, /coinGlassOnly: requestUrl\.searchParams\.has\('coinglassPoll'\)/);
assert.match(serverSource, /writeCoinLevelAnalysisSnapshot/);
assert.match(collectorSource, /--on-demand-symbol/);
assert.match(collectorSource, /qualifiedTimeframes/);
assert.match(managerSource, /async startOnDemand\(symbol\)/);
assert.match(managerSource, /fresh_cache/);

console.log('coin level analysis tests passed');
