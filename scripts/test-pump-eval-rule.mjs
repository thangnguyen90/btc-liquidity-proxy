import assert from 'node:assert/strict';
import {
  capPumpStructureStopLoss,
  getPumpEvalGate,
  getPumpEvalRule,
  getPumpStage2Rule,
  pumpHardStopLossPrice,
} from '../src/pumpEvalRule.js';
import {
  decoratePumpEvalTier,
  mergePumpEvalTierStats,
  pumpEvalTierSnapshot,
  pumpEvalTierStats,
} from '../src/pumpEvalTier.js';

function decide(input) {
  return getPumpEvalRule({
    interval: '15m',
    chasePct: 0.1,
    marketOk: true,
    btcTrendDir: 'up',
    btcTrendScore: 55,
    btcCorr: 0.2,
    hour: 10,
    ...input,
  });
}

assert.equal(decide({ side: 'LONG', type: 'EMA_PULLBACK', score: 85, volRatio: 3 }).tier, 'B');
assert.equal(decide({ side: 'LONG', type: 'EMA_PULLBACK', score: 92, volRatio: 6 }).tier, 'B');
assert.equal(decide({ side: 'LONG', type: 'PUMP_BREAKOUT', score: 82, volRatio: 3 }).tier, 'B');
assert.equal(decide({ side: 'LONG', type: 'PUMP_BREAKOUT', score: 82, volRatio: 6 }).tier, 'BLOCK');
assert.equal(decide({ side: 'LONG', type: 'EMA_PULLBACK', score: 85, volRatio: 3, btcTrendDir: 'down', btcTrendScore: 70 }).tier, 'BLOCK');
assert.equal(decide({ side: 'SHORT', type: 'DUMP', score: 92, volRatio: 3, hour: 21 }).tier, 'B');
assert.equal(decide({ side: 'SHORT', type: 'EARLY_DUMP', score: 77, volRatio: 3 }).tier, 'B');
assert.equal(decide({ side: 'SHORT', type: 'EARLY_DUMP', score: 81, volRatio: 3 }).tier, 'BLOCK');
assert.equal(decide({ side: 'SHORT', type: 'CLIMAX_TOP', score: 95, volRatio: 3 }).tier, 'BLOCK');
assert.equal(decide({ side: 'LONG', type: 'MA60_VOLUME_CLUSTER_5M', score: 85, volRatio: 6, interval: '5m' }).tier, 'BLOCK');
assert.equal(decide({ side: 'SHORT', type: 'DUMP', score: 85, volRatio: 3, btcTrendDir: 'up', btcTrendScore: 30, btcCorr: 0.4 }).label, 'PUMP_EVAL_DUMP_BAD_CONTEXT_BLOCK');
assert.equal(decide({ side: 'LONG', type: 'EMA_PULLBACK', score: 85, volRatio: 3, chasePct: 0.3 }).tier, 'BLOCK');
assert.equal(decide({ side: 'LONG', type: 'EMA_PULLBACK', score: 85, volRatio: 3, marketOk: false }).tier, 'BLOCK');

const gate = getPumpEvalGate({ side: 'LONG', type: 'EMA_PULLBACK', interval: '15m', score: 85, volRatio: 3, chasePct: 0.1 });
assert.equal(gate.marginUsdt, 1);
assert.equal(gate.version, 'PUMP_EVAL_V1_2026_07_20');

assert.equal(pumpHardStopLossPrice({ side: 'LONG', entryPrice: 100, leverage: 10, maxLossRoe: 15 }), 98.5);
assert.equal(pumpHardStopLossPrice({ side: 'SHORT', entryPrice: 100, leverage: 10, maxLossRoe: 15 }), 101.49999999999999);
assert.equal(capPumpStructureStopLoss({ side: 'LONG', entryPrice: 100, leverage: 10, structureSl: 90, maxLossRoe: 15 }), 98.5);
assert.equal(capPumpStructureStopLoss({ side: 'LONG', entryPrice: 100, leverage: 10, structureSl: 99, maxLossRoe: 15 }), 99);
assert.equal(capPumpStructureStopLoss({ side: 'SHORT', entryPrice: 100, leverage: 10, structureSl: 120, maxLossRoe: 15 }), 101.49999999999999);
assert.equal(capPumpStructureStopLoss({ side: 'SHORT', entryPrice: 100, leverage: 10, structureSl: 101, maxLossRoe: 15 }), 101);

const stage2Base = {
  side: 'LONG',
  type: 'EMA_PULLBACK',
  interval: '15m',
  score: 85,
  volRatio: 3,
  chasePct: 0.1,
  btcTrendDir: 'up',
  btcTrendScore: 55,
  btcCorr: 0.2,
};
assert.equal(getPumpStage2Rule(stage2Base).tier, 'RISK');
assert.equal(getPumpStage2Rule({
  ...stage2Base,
  candlePattern: { name: 'Bearish Candle' },
  btcCandlePattern: { name: 'Bearish Marubozu' },
}).tier, 'WATCH_PLUS');
assert.equal(getPumpStage2Rule({
  ...stage2Base,
  candlePattern: { name: 'Bearish Engulfing' },
  btcCandlePattern: { name: 'Bearish Candle' },
}).tier, 'RISK');
assert.equal(getPumpStage2Rule({
  side: 'SHORT',
  type: 'EARLY_DUMP',
  interval: '15m',
  score: 77,
  volRatio: 3,
  chasePct: 0.1,
}).tier, 'RISK');
assert.equal(getPumpStage2Rule({
  side: 'SHORT',
  type: 'DUMP',
  interval: '15m',
  score: 92,
  volRatio: 3,
  chasePct: 0.1,
}).tier, 'WATCH');
assert.equal(getPumpStage2Rule({
  side: 'LONG',
  type: 'PUMP_BREAKOUT',
  interval: '15m',
  score: 82,
  volRatio: 3,
  chasePct: 0.1,
}).tier, 'WATCH');
assert.equal(getPumpStage2Rule(stage2Base).observationOnly, true);

const storedEval = decoratePumpEvalTier({
  source: 'pump-92',
  status: 'CLOSED',
  pumpEvalTier: 'B',
  pumpEvalLabel: 'PUMP_EVAL_SHORT_DUMP_VOL2_TEST',
  pumpEvalVersion: 'PUMP_EVAL_V1_2026_07_20',
});
assert.equal(storedEval.pumpEvalTier, 'B');
assert.equal(storedEval.pumpEvalDerived, false);

const legacyEval = pumpEvalTierSnapshot({
  source: 'pump-92',
  side: 'SHORT',
  status: 'CLOSED',
  pumpSignalType: 'DUMP',
  pumpSignalTimeframe: '15m',
  pumpSignalMarketOk: true,
  pumpSignalFactors: { volRatio: 3, chasePct: 0.1 },
  btcTrendDir: 'down',
  btcTrendScore: 55,
  btcCorr: 0.2,
  createdAt: '2026-07-25T06:00:00.000Z',
});
assert.equal(legacyEval.pumpEvalTier, 'B');
assert.equal(legacyEval.pumpEvalDerived, true);

const evalStats = pumpEvalTierStats([
  {
    ...legacyEval,
    source: 'pump-92',
    status: 'CLOSED',
    pnl: 2,
    roe: 20,
  },
  {
    source: 'pump-85',
    side: 'SHORT',
    status: 'OPEN',
    pumpSignalType: 'CLIMAX_TOP',
    pumpSignalTimeframe: '15m',
    pumpSignalMarketOk: true,
    pumpSignalFactors: { volRatio: 3, chasePct: 0.1 },
    pnl: -0.5,
  },
  {
    source: 'emasq-15m-breakout-90',
    status: 'CLOSED',
    pnl: 99,
    roe: 99,
  },
]);
assert.equal(evalStats.find((row) => row.tier === 'B').closed, 1);
assert.equal(evalStats.find((row) => row.tier === 'BLOCK').active, 1);
assert.equal(evalStats.find((row) => row.tier === 'BLOCK').unrealizedPnl, -0.5);
const mergedEvalStats = mergePumpEvalTierStats(
  pumpEvalTierStats([{
    ...legacyEval,
    source: 'pump-92',
    status: 'CLOSED',
    pnl: 2,
    roe: 20,
  }]),
  pumpEvalTierStats([{
    source: 'pump-85',
    side: 'SHORT',
    status: 'OPEN',
    pumpSignalType: 'CLIMAX_TOP',
    pumpSignalTimeframe: '15m',
    pumpSignalMarketOk: true,
    pumpSignalFactors: { volRatio: 3, chasePct: 0.1 },
    pnl: -0.5,
  }]),
);
assert.equal(mergedEvalStats.find((row) => row.tier === 'B').closed, 1);
assert.equal(mergedEvalStats.find((row) => row.tier === 'BLOCK').active, 1);

console.log('Pump eval, Stage 2 observation labels, and hard SL cap: OK');
