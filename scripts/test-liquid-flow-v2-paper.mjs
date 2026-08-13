import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LIQUID_FLOW_V2_PAPER_VERSION,
  LiquidFlowV2PaperManager,
  buildLiquidFlowV2PaperPlan,
  evaluateLiquidFlowV2PaperExit,
  liquidFlowV2PaperMetrics,
  liquidFlowV2AutoBinanceProfile,
  summarizeLiquidFlowV2Paper,
} from '../src/liquidFlowV2Paper.js';

const settings = {
  marginUsdt: 10,
  leverage: 5,
  hardStopRoe: 20,
  minTakeProfitRoe: 10,
  baseBinanceEnabled: true,
  baseBinanceMarginUsdt: 2,
  baseLongBinanceMarginUsdt: 2,
  baseBinanceLeverage: 5,
  preBinanceMarginUsdt: 5,
  preBinanceLeverage: 5,
  maxHoldMs: 4 * 60 * 60_000,
  roundTripFeeRate: 0.0008,
};

assert.equal(LIQUID_FLOW_V2_PAPER_VERSION, 'LIQUID_FLOW_V2_PAPER_V18_HTF_BINANCE_5USDT_20260813');
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
assert.equal(
  liquidFlowV2AutoBinanceProfile({ labelKey: 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY' }).eligible,
  false,
);
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
  assert.equal(manager.snapshot().labelsObservationOnly, true);
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
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

const legacyRoot = await mkdtemp(join(tmpdir(), 'liquid-flow-v2-paper-legacy-'));
try {
  const legacyFile = join(legacyRoot, 'paper.json');
  await writeFile(legacyFile, JSON.stringify({
    version: 'LIQUID_FLOW_V2_PAPER_V3_BASE_RETEST_20260809',
    settings: { autoEnabled: true, marginUsdt: 10, leverage: 10, baseSweepLeverage: 5, baseSweepMaxRiskRoe: 25 },
    trades: [],
  }));
  const migrated = new LiquidFlowV2PaperManager({ file: legacyFile, settings });
  await migrated.init();
  assert.equal(migrated.snapshot().settings.leverage, 5);
  assert.equal(migrated.snapshot().settings.hardStopRoe, 20);
  assert.equal(migrated.snapshot().settings.minTakeProfitRoe, 10);
} finally {
  await rm(legacyRoot, { recursive: true, force: true });
}

console.log('Liquid Flow V2 automatic paper tests passed.');
