import assert from 'node:assert/strict';
import {
  buildLiquidScanAutoPaperPayload,
  selectLiquidScanAutoPaperRows,
} from '../src/liquidScanAutoPaper.js';
import { evaluateLiquidScanShadow, evaluateLiquidScanStage2, evaluateLiquidScanStage3, liquidPaperFinancialMetrics, liquidScanTrailLockRoe } from '../src/liquidScanEvalRule.js';

const now = Date.parse('2026-07-21T08:00:00.000Z');
const row = {
  symbol: 'TESTUSDT',
  markPrice: 100,
  sweepProb: 84,
  heavySide: 'below',
  sweepTarget: { price: 99.5, distancePct: -0.5 },
  killZoneCluster: {
    isOneSided: true,
    mainKillZone: { low: 97, high: 98, distancePctLow: -3, distancePctHigh: -2 },
  },
  entryPlan: {
    side: 'SHORT',
    entryPrice: 100.3,
    targetDistancePct: -0.5,
    takeProfitPrice: 98,
    stopLossPrice: 105,
    feasibleLeverage: 10,
    feasibilityScore: 50,
    rewardPct: 2,
    riskPct: 5,
    rr: 0.4,
  },
};

assert.equal(selectLiquidScanAutoPaperRows([row], [], { now }).length, 1, 'kill-zone row should be selected');
assert.equal(selectLiquidScanAutoPaperRows([row], [{
  symbol: 'TESTUSDT', side: 'SHORT', source: 'liquid-scan-auto-84', status: 'OPEN', openedAt: new Date(now - 60_000).toISOString(),
}], { now }).length, 0, 'recent open paper must be deduplicated');
assert.equal(selectLiquidScanAutoPaperRows([row], [{
  symbol: 'TESTUSDT', side: 'SHORT', source: 'liquid-scan-auto-84', status: 'CLOSED', openedAt: new Date(now - 60_000).toISOString(),
}], { now }).length, 0, 'recent closed paper must also block rapid re-entry');
assert.equal(selectLiquidScanAutoPaperRows([row], [{
  symbol: 'TESTUSDT', side: 'SHORT', source: 'liquid-scan-auto-84', status: 'CLOSED', openedAt: new Date(now - 5 * 60 * 60_000).toISOString(),
}], { now }).length, 1, 'closed paper older than four hours should not block');

const payload = buildLiquidScanAutoPaperPayload(row, { marginUsdt: 10, leverage: 10, minPoint: 75, signalTimeframe: '15m' });
assert.equal(payload.entryPrice, 100, 'server paper must use live market price');
assert.equal(payload.signalType, 'LIQUID_KILL_ZONE');
assert.equal(payload.marginUsdt, 1, 'new Liquid Scan paper must be capped to shadow $1');
assert.equal(payload.requestedMarginUsdt, 10, 'payload must preserve requested size for the server-side cohort cap');
assert.match(payload.source, /^liquid-scan-auto-/);
assert.match(payload.note, /serverAuto=1/);

const goodNear = evaluateLiquidScanShadow({ side: 'SHORT', signalPoint: 88, sweepDistancePct: 0.7, btcCorr: 0.62, btcHealth: { btcTrendDir: 'down', btcTrendScore: 42 } });
assert.equal(goodNear.tier, 'GOOD');
assert.equal(goodNear.cohort, 'SHORT_CORR_THEO_DIST_LT_1');
assert.equal(goodNear.testMarginUsdt, 5);
const goodGeneral = evaluateLiquidScanShadow({ side: 'SHORT', signalPoint: 88, sweepDistancePct: 1.4, btcCorr: 0.62, btcHealth: { btcTrendDir: 'up', btcTrendScore: 72 } });
assert.equal(goodGeneral.cohort, 'SHORT_CORR_THEO');
assert.equal(goodGeneral.testMarginUsdt, 5);
const stage2Base = {
  side: 'SHORT', btcCorr: 0.62, sweepTargetPrice: 99.5,
  entryPlan: { killZoneCluster: { mainKillZone: { low: 97, high: 98 } } },
};
assert.equal(evaluateLiquidScanStage2({ ...stage2Base, sweepDistancePct: 0.7 }).tier, 'A_PLUS');
assert.equal(evaluateLiquidScanStage2({ ...stage2Base, sweepDistancePct: 1.5 }).tier, 'A_PLUS');
assert.equal(evaluateLiquidScanStage2({ ...stage2Base, sweepDistancePct: 2.2 }).tier, 'RISK');
assert.equal(evaluateLiquidScanStage2({ ...stage2Base, sweepDistancePct: 1.5, sweepTargetPrice: 97.5 }).tier, 'WATCH');
assert.equal(evaluateLiquidScanStage2({ ...stage2Base, side: 'LONG', sweepDistancePct: 0.7 }).tier, 'WATCH');
const stage3GoodPlus = evaluateLiquidScanStage3({
  ...stage2Base,
  sweepDistancePct: 1.4,
  feasibilityScore: 40,
  rr: 0.3,
  btcHealth: { btcTrendDir: 'up', btcTrendScore: 55 },
  entryPlan: {
    ...stage2Base.entryPlan,
    killZoneCluster: {
      ...stage2Base.entryPlan.killZoneCluster,
      oneSidedPct: 72,
    },
  },
  candlePatternAtEntry: { name: 'DOJI' },
  btcCandlePatternAtEntry: { name: 'BULLISH_CANDLE' },
});
assert.equal(stage3GoodPlus.tier, 'GOOD_PLUS');
assert.match(stage3GoodPlus.comboKey, /DIST_1_2/);
assert.equal(evaluateLiquidScanStage3({
  ...stage2Base,
  sweepDistancePct: 1.4,
  feasibilityScore: 40,
  rr: 0.3,
  entryPlan: {
    ...stage2Base.entryPlan,
    killZoneCluster: {
      ...stage2Base.entryPlan.killZoneCluster,
      oneSidedPct: 72,
    },
  },
  candlePatternAtEntry: { name: 'BEARISH_MARUBOZU' },
}).tier, 'RISK');
assert.equal(evaluateLiquidScanStage3({
  ...stage2Base,
  sweepDistancePct: 0.7,
  feasibilityScore: 60,
  rr: 0.7,
  entryPlan: {
    ...stage2Base.entryPlan,
    killZoneCluster: {
      ...stage2Base.entryPlan.killZoneCluster,
      oneSidedPct: 95,
    },
  },
}).tier, 'WATCH');
assert.equal(evaluateLiquidScanStage3({
  side: 'LONG',
  btcCorr: 0.2,
  sweepDistancePct: 2.5,
  btcHealth: { btcTrendDir: 'down', btcTrendScore: 55 },
}).tier, 'RISK');
assert.equal(evaluateLiquidScanShadow({ side: 'LONG', signalPoint: 84, btcCorr: 0.62, btcHealth: { btcTrendDir: 'down', btcTrendScore: 42 } }).tier, 'RISK');
assert.equal(evaluateLiquidScanShadow({ side: 'SHORT', signalPoint: 88, btcCorr: 0.2, btcHealth: { btcTrendDir: 'down', btcTrendScore: 42 } }).tier, 'RISK');
const metrics = liquidPaperFinancialMetrics({ status: 'CLOSED', side: 'LONG', entryPrice: 100, exitPrice: 101, quantity: 1, marginUsdt: 10 }, null, 0.0004);
assert.equal(metrics.grossPnl, 1);
assert.equal(+metrics.estimatedFeeUsdt.toFixed(4), 0.0804);
assert.equal(+metrics.netPnl.toFixed(4), 0.9196);
assert.equal(liquidScanTrailLockRoe(9.99), null);
assert.equal(liquidScanTrailLockRoe(10), 1);
assert.equal(liquidScanTrailLockRoe(14.99), 1);
assert.equal(liquidScanTrailLockRoe(15), 5);
assert.equal(liquidScanTrailLockRoe(20), 10);
assert.equal(liquidScanTrailLockRoe(27), 15);

console.log('Liquid Scan auto-paper tests passed.');
