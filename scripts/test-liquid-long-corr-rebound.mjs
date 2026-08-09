import assert from 'node:assert/strict';
import {
  LIQUID_SCAN_STAGE_3_VERSION,
  evaluateLiquidScanStage3,
  liquidScanStage3MarginCap,
} from '../src/liquidScanEvalRule.js';
import {
  LIQUID_LONG_CORR_REBOUND_CYCLE_KEY,
  LIQUID_LONG_CORR_REBOUND_VERSION,
  evaluateLiquidLongCorrRebound,
  liquidLongCorrReboundPaperSizing,
} from '../src/liquidLongCorrRebound.js';

function trade(overrides = {}) {
  return {
    side: 'LONG',
    source: 'liquid-scan-auto-80',
    signalType: 'LIQUID_KILL_ZONE',
    signalTimeframe: '15m',
    btcCorr: 0.7,
    liquidGateLabel: 'GATE_TEST_LIQUID_LONG_BTC_COUNTER',
    sweepTargetPrice: 98.8,
    sweepDistancePct: -1.2,
    feasibilityScore: 55,
    rr: 1.2,
    btcHealth: {
      btcTrendDir: 'down',
      btcTrendScore: 35,
      pct24h: 0.05,
      pct6h: 0.1,
      rsi4h: 47,
    },
    entryPlan: {
      targetPrice: 98.8,
      targetDistancePct: -1.2,
      feasibilityScore: 55,
      rr: 1.2,
      killZoneCluster: {
        oneSidedPct: 65,
      },
    },
    ...overrides,
  };
}

const candidate = trade();
assert.equal(evaluateLiquidScanStage3(candidate).tier, 'WATCH');
const label = evaluateLiquidLongCorrRebound(candidate);
assert.equal(label.liquidLongCorrReboundMatched, true);
assert.equal(label.liquidLongCorrReboundTier, 'GOOD');
assert.equal(label.liquidLongCorrReboundCode, 'LONG_CORR_REBOUND');
assert.equal(label.liquidLongCorrReboundCycleKey, LIQUID_LONG_CORR_REBOUND_CYCLE_KEY);
assert.equal(label.liquidLongCorrReboundVersion, LIQUID_LONG_CORR_REBOUND_VERSION);
assert.equal(label.liquidLongCorrReboundObservationOnly, true);
assert.equal(label.liquidLongCorrReboundPaperTestEligible, true);
assert.equal(label.liquidLongCorrReboundPaperSizeApplied, false);
assert.equal(label.liquidLongCorrReboundPaperTestMarginUsdt, 10);
assert.equal(label.liquidLongCorrReboundAffectsEntry, false);
assert.equal(label.liquidLongCorrReboundAffectsMargin, false);
assert.equal(label.liquidLongCorrReboundAffectsPaperMargin, false);
assert.equal(label.liquidLongCorrReboundAffectsSl, false);
assert.equal(label.liquidLongCorrReboundAffectsTp, false);
assert.equal(label.liquidLongCorrReboundAffectsBinance, false);
assert.equal(liquidScanStage3MarginCap(evaluateLiquidScanStage3(candidate), {
  goodPlusMarginUsdt: 10,
  fallbackMarginUsdt: 1,
}), 1);

const paperTestLabel = evaluateLiquidLongCorrRebound(candidate, {
  applyPaperTest: true,
  paperTestMarginUsdt: 10,
});
assert.equal(paperTestLabel.liquidLongCorrReboundMatched, true);
assert.equal(paperTestLabel.liquidLongCorrReboundObservationOnly, false);
assert.equal(paperTestLabel.liquidLongCorrReboundPaperTestOnly, true);
assert.equal(paperTestLabel.liquidLongCorrReboundPaperSizeApplied, true);
assert.equal(paperTestLabel.liquidLongCorrReboundAffectsPaperMargin, true);
assert.equal(paperTestLabel.liquidLongCorrReboundAffectsBinance, false);
const paperSizing = liquidLongCorrReboundPaperSizing({
  ...candidate,
  marginUsdt: 1,
  leverage: 10,
  entryPrice: 100,
  quantity: 0.1,
  ...paperTestLabel,
});
assert.equal(paperSizing.applied, true);
assert.equal(paperSizing.marginUsdt, 10);
assert.equal(paperSizing.quantity, 1);
assert.equal(paperSizing.appliedMarginUsdt, 10);

const historicalSizing = liquidLongCorrReboundPaperSizing({
  ...candidate,
  marginUsdt: 1,
  leverage: 10,
  entryPrice: 100,
  quantity: 0.1,
  ...label,
});
assert.equal(historicalSizing.applied, false);
assert.equal(historicalSizing.marginUsdt, 1);
assert.equal(historicalSizing.quantity, 0.1);

const differentOutcome = evaluateLiquidLongCorrRebound({
  ...candidate,
  status: 'CLOSED',
  outcome: 'SL',
  netPnl: -999,
  netRoe: -999,
});
assert.equal(differentOutcome.liquidLongCorrReboundMatched, true);
assert.equal(differentOutcome.liquidLongCorrReboundCode, label.liquidLongCorrReboundCode);

const wrongCycle = evaluateLiquidLongCorrRebound(trade({
  btcHealth: {
    ...candidate.btcHealth,
    pct24h: -0.5,
  },
}));
assert.equal(wrongCycle.liquidLongCorrReboundMatched, false);

const stage3Risk = evaluateLiquidLongCorrRebound(trade({
  liquidStage3Version: LIQUID_SCAN_STAGE_3_VERSION,
  liquidStage3Tier: 'RISK',
}));
assert.equal(stage3Risk.liquidLongCorrReboundEligible, true);
assert.equal(stage3Risk.liquidLongCorrReboundMatched, false);
assert.match(stage3Risk.liquidLongCorrReboundReason, /never overrides RISK/);

const short = evaluateLiquidLongCorrRebound(trade({ side: 'SHORT' }));
assert.equal(short.liquidLongCorrReboundMatched, false);

console.log('liquid LONG corr-rebound tests passed');
