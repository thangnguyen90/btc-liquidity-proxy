import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { btcRegimeGate, decisionEntryTiming, decisionSignalFingerprint, IntradayDecisionPaper } from '../src/intradayDecisionPaper.js';

const directory = await mkdtemp(path.join(os.tmpdir(), 'decision-paper-test-'));

const downLongRisk = btcRegimeGate({
  side: 'LONG',
  trend: { direction: 'DOWN', strength: 'MID', macro4h: { direction: 'DOWN', strength: 'MID' } },
  btcCandlePattern: { name: 'BEARISH_CANDLE' },
  signalScore: 90,
});
assert.equal(downLongRisk.tier, 'RISK');
assert.equal(downLongRisk.regime, 'SW_DOWN');
assert.equal(downLongRisk.marginCapUsdt, 1);

const downShortGood = btcRegimeGate({
  side: 'SHORT',
  trend: { direction: 'DOWN', strength: 'MID' },
  btcCandlePattern: { name: 'BEARISH_MARUBOZU' },
  signalScore: 80,
});
assert.equal(downShortGood.tier, 'GOOD');
assert.equal(downShortGood.marginCapUsdt, null);

const downLongReversal = btcRegimeGate({
  side: 'LONG',
  trend: { direction: 'DOWN', strength: 'MID' },
  btcCandlePattern: { name: 'BULLISH_ENGULFING' },
  signalScore: 79,
});
assert.equal(downLongReversal.tier, 'WATCH');
assert.equal(downLongReversal.minSignalScore, 80);
const manager = new IntradayDecisionPaper({
  file: path.join(directory, 'state.json'),
  evaluationFile: path.join(directory, 'intraday-decision-paper-trades.json'),
});

manager.store.trades = [{
  id: 'long-sl-test',
  status: 'OPEN',
  symbol: 'TESTUSDT',
  side: 'LONG',
  entryPrice: 100,
  tp: 101.5,
  sl: 98.5,
  leverage: 10,
  marginUsdt: 10,
  openedAt: new Date().toISOString(),
}];
manager.handlePriceTick({ symbol: 'TESTUSDT', markPrice: 98.5, eventTime: Date.now() });
await manager.writeChain;

const rows = JSON.parse(await readFile(manager.evaluationFile, 'utf8'));
assert.equal(rows.length, 1);
assert.equal(rows[0].status, 'CLOSED');
assert.equal(rows[0].outcome, 'SL');
assert.equal(rows[0].roe, -15);
assert.equal(rows[0].pnl, -1.5);

const runFile = promisify(execFile);
const { stdout } = await runFile('python3', [
  path.resolve('scripts/intraday_combo_predictor.py'),
  '--data-dir', directory,
  '--days', '365',
  '--min-closed', '1',
  '--limit', '3',
]);
const analysis = JSON.parse(stdout);
assert.equal(analysis.summary.sources, 0);
assert.equal(analysis.coverage.length, 0);

const { stdout: derivedStdout } = await runFile('python3', [
  path.resolve('scripts/intraday_combo_predictor.py'),
  '--data-dir', directory,
  '--days', '365',
  '--min-closed', '1',
  '--limit', '3',
  '--include-derived',
]);
const derivedAnalysis = JSON.parse(derivedStdout);
assert.equal(derivedAnalysis.summary.sources, 1);
assert.equal(derivedAnalysis.coverage[0].file, 'intraday-decision-paper-trades.json');
assert.equal(derivedAnalysis.coverage[0].closed, 1);

const migrationFile = path.join(directory, 'migration-state.json');
const migrationLog = path.join(directory, 'migration-paper-trades.json');
const oldManager = new IntradayDecisionPaper({ file: migrationFile, evaluationFile: migrationLog });
oldManager.store.settings.stopLossRoe = 10;
oldManager.store.trades = [{
  id: 'wide-sl-test', status: 'OPEN', symbol: 'WIDEUSDT', side: 'LONG',
  entryPrice: 100, tp: 101.5, sl: 95, leverage: 10, marginUsdt: 10,
  openedAt: new Date().toISOString(),
}, {
  id: 'tight-sl-test', status: 'OPEN', symbol: 'TIGHTUSDT', side: 'LONG',
  entryPrice: 100, tp: 101.5, sl: 99.2, leverage: 10, marginUsdt: 10,
  openedAt: new Date().toISOString(),
}];
await oldManager.persist();
const migratedManager = new IntradayDecisionPaper({ file: migrationFile, evaluationFile: migrationLog });
await migratedManager.init();
assert.equal(migratedManager.store.settings.stopLossRoe, 15);
assert.equal(migratedManager.store.trades[0].sl, 98.5);
assert.equal(migratedManager.store.trades[0].originalSl, 95);
assert.equal(migratedManager.store.trades[0].tp, null);
assert.equal(migratedManager.store.trades[0].originalTp, 101.5);
assert.equal(migratedManager.store.trades[1].sl, 98.5);
assert.equal(migratedManager.store.trades[1].originalSl, 99.2);

const trailStartManager = new IntradayDecisionPaper({
  file: path.join(directory, 'trail-start.json'),
  evaluationFile: path.join(directory, 'trail-start-log.json'),
});
trailStartManager.store.trades = [{
  id: 'trail-start-test', status: 'OPEN', symbol: 'TRAILUSDT', side: 'LONG',
  entryPrice: 100, tp: null, sl: 98.5, leverage: 10, marginUsdt: 10,
  peakRoe: 0, lockedStopRoe: null, openedAt: new Date().toISOString(),
}];
trailStartManager.handlePriceTick({ symbol: 'TRAILUSDT', markPrice: 100.7, eventTime: Date.now() });
assert.equal(trailStartManager.store.trades[0].status, 'OPEN');
assert.equal(trailStartManager.store.trades[0].lockedStopRoe, 0);
assert.equal(trailStartManager.store.trades[0].sl, 100);
trailStartManager.handlePriceTick({ symbol: 'TRAILUSDT', markPrice: 101.5, eventTime: Date.now() });
assert.equal(trailStartManager.store.trades[0].status, 'OPEN');
assert.equal(trailStartManager.store.trades[0].lockedStopRoe, 5);
assert.equal(+trailStartManager.store.trades[0].sl.toFixed(6), 100.5);
trailStartManager.handlePriceTick({ symbol: 'TRAILUSDT', markPrice: 100.49, eventTime: Date.now() });
await trailStartManager.writeChain;
assert.equal(trailStartManager.store.trades[0].status, 'CLOSED');
assert.equal(trailStartManager.store.trades[0].outcome, 'TRAILING_SL');
assert.equal(trailStartManager.store.trades[0].roe, 5);
assert.equal(trailStartManager.store.trades[0].pnl, 0.5);

const progressiveManager = new IntradayDecisionPaper({
  file: path.join(directory, 'progressive-trail.json'),
  evaluationFile: path.join(directory, 'progressive-trail-log.json'),
});
progressiveManager.store.trades = [{
  id: 'progressive-test', status: 'OPEN', symbol: 'STEPUSDT', side: 'LONG',
  entryPrice: 100, tp: null, sl: 98.5, leverage: 10, marginUsdt: 10,
  peakRoe: 0, lockedStopRoe: null, openedAt: new Date().toISOString(),
}];
progressiveManager.handlePriceTick({ symbol: 'STEPUSDT', markPrice: 102, eventTime: Date.now() });
assert.equal(progressiveManager.store.trades[0].status, 'OPEN');
assert.equal(progressiveManager.store.trades[0].lockedStopRoe, 10);
assert.equal(+progressiveManager.store.trades[0].sl.toFixed(6), 101);
progressiveManager.handlePriceTick({ symbol: 'STEPUSDT', markPrice: 100.9, eventTime: Date.now() });
await progressiveManager.writeChain;
assert.equal(progressiveManager.store.trades[0].status, 'CLOSED');
assert.equal(progressiveManager.store.trades[0].outcome, 'TRAILING_SL');
assert.equal(progressiveManager.store.trades[0].roe, 10);
assert.equal(progressiveManager.store.trades[0].pnl, 1);

const unlimitedManager = new IntradayDecisionPaper({
  file: path.join(directory, 'unlimited-state.json'),
  evaluationFile: path.join(directory, 'unlimited-log.json'),
  getTrend: async () => ({ direction: 'UP', strength: 'WEAK', score: 55, macro4h: null }),
  getCatalog: async () => ({ recommendations: [{
    source: 'test-source', side: 'LONG', timeframe: '15m', signalType: 'test-signal',
    combo: 'TEST | LONG | 15m', grade: 'A', predictionScore: 99,
    adjustedWr: 90, avgRoe: 5, medianRoe: 4, profitFactor: 2, tailLossRatio: 1,
  }] }),
  getCandidates: async () => Array.from({ length: 55 }, (_, index) => ({
    source: 'test-source', symbol: `TEST${index}USDT`, side: 'LONG', timeframe: '15m',
    signalType: 'test-signal', combo: 'TEST | LONG | 15m', score: 90, entry: 100, observedAt: Date.now(),
  })),
  getMarkInfo: () => ({ markPrice: 100.25, at: Date.now() }),
});
unlimitedManager.store.settings.maxAdverseEntryDriftPct = 0.3;
await unlimitedManager.runNow({ timeframe: '1h' });
assert.equal(unlimitedManager.store.settings.maxOpenPositions, null);
assert.equal(unlimitedManager.store.settings.maxEntriesPerRun, null);
assert.equal(unlimitedManager.store.trades.filter((trade) => trade.status === 'OPEN').length, 5);
assert.equal(unlimitedManager.store.decisions.filter((decision) => decision.decision === 'ENTER').length, 5);
assert.equal(unlimitedManager.store.decisions.filter((decision) => decision.reason.includes('entry trong chu kỳ')).length, 50);
assert.equal(unlimitedManager.store.trades[0].entryPrice, 100.25);
assert.equal(unlimitedManager.store.trades[0].signalEntry, 100);
assert.equal(unlimitedManager.store.trades[0].marketEntrySource, 'BINANCE_LAST_SOCKET');

const staleMarketManager = new IntradayDecisionPaper({
  file: path.join(directory, 'stale-market-state.json'),
  evaluationFile: path.join(directory, 'stale-market-log.json'),
  getMarkInfo: () => ({ markPrice: 123, at: Date.now() - 5_001 }),
});
assert.equal(staleMarketManager.freshMarketEntry('STALEUSDT'), null);

const exactStageManager = new IntradayDecisionPaper({
  file: path.join(directory, 'exact-stage-state.json'),
  evaluationFile: path.join(directory, 'exact-stage-log.json'),
  getTrend: async () => ({ direction: 'UP', strength: 'MID', score: 55, macro4h: null }),
  getCatalog: async () => ({ recommendations: [{
    source: 'pump', side: 'LONG', timeframe: '15m', signalType: 'Breakout',
    combo: 'Breakout | LONG | 15m | BTC_CORR_RAC | BTC_UP_MID | DOC_LAP | GATE_X',
    grade: 'A', predictionScore: 100,
  }, {
    source: 'pump', side: 'LONG', timeframe: '15m', signalType: 'Pre Breakout',
    combo: 'Pre Breakout | LONG | 15m | BTC_CORR_RAC | BTC_UP_MID | DOC_LAP | GATE_Y',
    grade: 'A', predictionScore: 85,
  }] }),
  getCandidates: async () => [{
    source: 'ema-squeeze', modelSource: 'pump', symbol: 'EXACTUSDT', side: 'LONG', timeframe: '15m',
    signalType: 'ema_squeeze_15m_pre_breakout', decisionStage: 'PRE_BREAKOUT',
    combo: 'PRE_BREAKOUT | LONG | 15m | BTC_CORR_RAC | BTC_UP_MID | DOC_LAP | GATE_CURRENT',
    decisionRule: { allow: true, tier: 'B', marginUsdt: 1, label: 'PRE_BREAKOUT_B' },
    score: 90, entry: 100, observedAt: Date.now(),
  }],
  getMarkInfo: () => ({ markPrice: 100.1, at: Date.now() }),
});
await exactStageManager.runNow({ timeframe: '1h' });
assert.equal(exactStageManager.store.trades.length, 1);
assert.match(exactStageManager.store.trades[0].combo, /^Pre Breakout \|/);
assert.equal(exactStageManager.store.trades[0].predictionScore, 85);
assert.equal(exactStageManager.store.trades[0].marginUsdt, 1);

const regimeSizeManager = new IntradayDecisionPaper({
  file: path.join(directory, 'regime-size-state.json'),
  evaluationFile: path.join(directory, 'regime-size-log.json'),
  getTrend: async () => ({ direction: 'DOWN', strength: 'MID', score: 55, macro4h: { direction: 'DOWN', strength: 'MID' } }),
  getCatalog: async () => ({ recommendations: [{
    source: 'test-source', side: 'LONG', timeframe: '15m', signalType: 'test-signal',
    combo: 'TEST | LONG | 15m | BTC_CORR_RAC', grade: 'A', predictionScore: 99,
  }] }),
  getCandidates: async () => [{
    source: 'test-source', symbol: 'REGIMEUSDT', side: 'LONG', timeframe: '15m',
    signalType: 'test-signal', combo: 'TEST | LONG | 15m | BTC_CORR_RAC', score: 90,
    entry: 100, observedAt: Date.now(), btcCandlePattern5m: { name: 'BEARISH_CANDLE' },
  }],
  getMarkInfo: () => ({ markPrice: 100.1, at: Date.now() }),
});
await regimeSizeManager.runNow({ timeframe: '1h' });
assert.equal(regimeSizeManager.store.trades.length, 1);
assert.equal(regimeSizeManager.store.trades[0].marginUsdt, 1);
assert.equal(regimeSizeManager.store.trades[0].btcRegimeGate.tier, 'RISK');
assert.equal(regimeSizeManager.store.trades[0].btcRegimeAtEntry, 'SW_DOWN');

const blockedRuleManager = new IntradayDecisionPaper({
  file: path.join(directory, 'blocked-rule-state.json'),
  evaluationFile: path.join(directory, 'blocked-rule-log.json'),
  getTrend: exactStageManager.getTrend,
  getCatalog: exactStageManager.getCatalog,
  getCandidates: async () => [{
    source: 'ema-squeeze', modelSource: 'pump', symbol: 'BLOCKEDUSDT', side: 'LONG', timeframe: '15m',
    signalType: 'ema_squeeze_15m_pre_breakout', decisionStage: 'PRE_BREAKOUT',
    combo: 'PRE_BREAKOUT | LONG | 15m | BTC_CORR_RAC | BTC_UP_MID | DOC_LAP | GATE_CURRENT',
    decisionRule: { allow: false, tier: 'BLOCK', marginUsdt: 0, label: 'PRE_BREAKOUT_BLOCK' },
    score: 90, entry: 100, observedAt: Date.now(),
  }],
  getMarkInfo: () => ({ markPrice: 100.1, at: Date.now() }),
});
await blockedRuleManager.runNow({ timeframe: '1h' });
assert.equal(blockedRuleManager.store.trades.length, 0);
assert.equal(blockedRuleManager.store.decisions[0].decision, 'REJECT');
assert.match(blockedRuleManager.store.decisions[0].reason, /PRE_BREAKOUT_BLOCK/);

const timingNow = Date.now();
const freshTiming = decisionEntryTiming({
  source: 'ema-squeeze', symbol: 'FRESHUSDT', side: 'LONG', timeframe: '15m',
  decisionStage: 'BREAKOUT', breakoutAge: 1, entry: 100, observedAt: timingNow - 10_000,
}, 100.1, { maxSignalAgeSeconds: 90, maxAdverseEntryDriftPct: 0.15, maxBreakoutAgeBars: 2 }, timingNow);
assert.equal(freshTiming.blockReason, null);

const chasedTiming = decisionEntryTiming({
  source: 'ema-squeeze', symbol: 'CHASEUSDT', side: 'LONG', timeframe: '15m',
  decisionStage: 'BREAKOUT', breakoutAge: 1, entry: 100, observedAt: timingNow - 10_000,
}, 100.25, { maxSignalAgeSeconds: 90, maxAdverseEntryDriftPct: 0.15, maxBreakoutAgeBars: 2 }, timingNow);
assert.match(chasedTiming.blockReason, /chase/);

const staleTiming = decisionEntryTiming({
  source: 'ema-squeeze', symbol: 'STALESIGNALUSDT', side: 'SHORT', timeframe: '15m',
  decisionStage: 'BREAKDOWN', breakoutAge: 1, entry: 100, observedAt: timingNow - 91_000,
}, 99.9, { maxSignalAgeSeconds: 90, maxAdverseEntryDriftPct: 0.15, maxBreakoutAgeBars: 2 }, timingNow);
assert.match(staleTiming.blockReason, /đã cũ/);

const fingerprintBase = {
  source: 'ema-squeeze', symbol: 'EVENTUSDT', side: 'LONG', timeframe: '15m',
  decisionStage: 'BREAKOUT', breakoutAge: 1, observedAt: Date.UTC(2026, 6, 21, 4, 30),
};
assert.equal(
  decisionSignalFingerprint(fingerprintBase),
  decisionSignalFingerprint({ ...fingerprintBase, breakoutAge: 2, observedAt: Date.UTC(2026, 6, 21, 4, 45) }),
  'same breakout candle must keep one fingerprint as breakoutAge advances',
);

let liveVersion = 'batch-1';
let queuedTrigger = null;
const versionManager = new IntradayDecisionPaper({
  file: path.join(directory, 'version-state.json'),
  getSignalVersion: () => liveVersion,
});
versionManager.signalVersion = liveVersion;
versionManager.queueRun = (request) => { queuedTrigger = request.trigger; };
versionManager.checkSignalVersion();
assert.equal(queuedTrigger, null);
liveVersion = 'batch-2';
versionManager.checkSignalVersion();
assert.equal(queuedTrigger, 'signal-live');

console.log('Decision paper socket test passed: live entry freshness/chase gates, event dedup, fixed SL and progressive trail.');
