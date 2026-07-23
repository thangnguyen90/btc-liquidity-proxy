import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { detectClosedCandlePattern } from '../src/shakeoutReclaimDetector.js';

const execFileAsync = promisify(execFile);

assert.equal(detectClosedCandlePattern([
  { open: 10, high: 10.2, low: 8.8, close: 9 },
  { open: 8.9, high: 10.4, low: 8.7, close: 10.2 },
  { open: 10.2, high: 10.3, low: 10.1, close: 10.2 },
]).name, 'BULLISH_ENGULFING');
assert.equal(detectClosedCandlePattern([
  { open: 10, high: 10.2, low: 9.8, close: 10.1 },
  { open: 10, high: 10.5, low: 9.5, close: 10.04 },
  { open: 10.04, high: 10.1, low: 10, close: 10.02 },
]).name, 'DOJI');
const dir = await mkdtemp(join(tmpdir(), 'shakeout-ml-test-'));
const paperFile = join(dir, 'paper.json');
const script = resolve('scripts/shakeout_self_learning.py');

const makeTrade = (id, klass, side, pnl, roe) => ({
  id,
  status: 'CLOSED',
  outcome: pnl > 0 ? 'TP' : 'SL',
  closedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  shakeoutClass: klass,
  shakeoutQuality: 'GOOD',
  variant: 'MARKET',
  trapRisk: 'LOW',
  side,
  signalTimeframe: '5m',
  score: 75,
  candlePattern5m: { name: side === 'LONG' ? 'BULLISH_ENGULFING' : 'BEARISH_ENGULFING' },
  candlePattern15m: { name: side === 'LONG' ? 'HAMMER' : 'SHOOTING_STAR' },
  btcCandlePattern5m: { name: 'DOJI' },
  btcPhase: 'BTC_FLAT',
  btcRelationLabel: 'DOC_LAP',
  netPnl: pnl,
  netRoe: roe,
});

const trades = [
  ...Array.from({ length: 12 }, (_, i) => makeTrade(`good-${i}`, 'TEST_GOOD', 'LONG', 1, 5)),
  ...Array.from({ length: 12 }, (_, i) => makeTrade(`risk-${i}`, 'TEST_RISK', 'SHORT', -1, -5)),
  ...Array.from({ length: 40 }, (_, i) => ({
    ...makeTrade(`old-good-${i}`, 'IGNORED_OLD_CLASS', 'LONG', 1, 5),
    signalType: 'shakeout_reclaim_long', variant: 'MARKET', candlePattern5m: undefined,
    candlePattern15m: undefined, btcCandlePattern5m: undefined,
    createdAt: new Date(Date.now() - (100 - i * 2) * 60_000).toISOString(),
    openedAt: new Date(Date.now() - (100 - i * 2) * 60_000).toISOString(),
    closedAt: new Date(Date.now() - (99 - i * 2) * 60_000).toISOString(),
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    ...makeTrade(`old-risk-${i}`, 'IGNORED_OLD_CLASS', 'SHORT', -1, -5),
    signalType: 'shakeout_reject_short', variant: 'MARKET', candlePattern5m: undefined,
    candlePattern15m: undefined, btcCandlePattern5m: undefined,
    createdAt: new Date(Date.now() - (100 - i * 2) * 60_000).toISOString(),
    openedAt: new Date(Date.now() - (100 - i * 2) * 60_000).toISOString(),
    closedAt: new Date(Date.now() - (99 - i * 2) * 60_000).toISOString(),
  })),
];
await writeFile(paperFile, JSON.stringify({ trades }), 'utf8');
const before = await readFile(paperFile, 'utf8');

try {
  const signals = [
    { symbol: 'GOODUSDT', action: 'LONG', signalType: 'shakeout_reclaim_long', variant: 'MARKET', trapRisk: 'LOW', stage: 'RECLAIM_CONFIRMED', interval: '5m', candlePattern5m: { name: 'BULLISH_ENGULFING' }, candlePattern15m: { name: 'HAMMER' }, btcCandlePattern5m: { name: 'DOJI' }, btcPhase: 'BTC_FLAT', btcRelationLabel: 'DOC_LAP' },
    { symbol: 'RISKUSDT', action: 'SHORT', signalType: 'shakeout_reject_short', variant: 'MARKET', trapRisk: 'LOW', stage: 'RECLAIM_CONFIRMED', interval: '5m', candlePattern5m: { name: 'BEARISH_ENGULFING' }, candlePattern15m: { name: 'SHOOTING_STAR' }, btcCandlePattern5m: { name: 'DOJI' }, btcPhase: 'BTC_FLAT', btcRelationLabel: 'DOC_LAP' },
    { symbol: 'CHASEUSDT', action: 'LONG', signalType: 'shakeout_reclaim_long', variant: 'CHASE', trapRisk: 'LOW', stage: 'RECLAIM_CONFIRMED', interval: '5m', candlePattern5m: { name: 'BULLISH_ENGULFING' }, candlePattern15m: { name: 'HAMMER' }, btcCandlePattern5m: { name: 'DOJI' }, btcPhase: 'BTC_FLAT', btcRelationLabel: 'DOC_LAP' },
  ];
  const { stdout } = await execFileAsync('python3', [
    script,
    '--paper-file', paperFile,
    '--signals-json', JSON.stringify(signals),
    '--min-samples', '8',
  ]);
  const result = JSON.parse(stdout);
  assert.equal(result.mode, 'ANALYSIS_ONLY');
  assert.equal(result.guardrail.canAffectTrading, false);
  assert.equal(result.guardrail.writesPaperStore, false);
  assert.equal(result.signalFlags.find((row) => row.symbol === 'GOODUSDT')?.flag, 'PYTHON_GOOD');
  assert.equal(result.signalFlags.find((row) => row.symbol === 'GOODUSDT')?.learned, true);
  assert.equal(result.signalFlags.find((row) => row.symbol === 'RISKUSDT')?.flag, 'PYTHON_RISK');
  assert.equal(result.signalFlags.find((row) => row.symbol === 'CHASEUSDT')?.label, 'PY CHASE PRIOR');
  assert.equal(result.signalFlags.find((row) => row.symbol === 'CHASEUSDT')?.priorType, 'CHASE');
  assert.equal(result.summary.signalChasePrior, 1);
  assert.equal(result.signalFlags.find((row) => row.symbol === 'CHASEUSDT')?.learned, false);
  assert.equal(result.tradeFlags['good-0']?.label, 'PY PRIOR WATCH', 'historical candle row must not learn from its own outcome');
  assert.equal(result.tradeFlags['good-0']?.scoredCausally, true);
  assert.equal(result.schemaVersion, 5);
  assert.equal(result.training.candle.closedSamples, 24);
  assert.equal(result.training.legacy.closedSamples, 80);
  assert.equal(result.training.legacy.method, 'CAUSAL_WALK_FORWARD');
  assert.equal(result.training.candle.method, 'CAUSAL_WALK_FORWARD');
  assert.equal(result.legacySignalFlags.find((row) => row.symbol === 'GOODUSDT')?.flag, 'PYTHON_VERIFIED_GOOD');
  assert.equal(result.legacySignalFlags.find((row) => row.symbol === 'RISKUSDT')?.flag, 'PYTHON_RISK');
  assert.equal(result.legacySignalFlags.find((row) => row.symbol === 'GOODUSDT')?.verified, true);
  assert.ok(result.legacySignalFlags.find((row) => row.symbol === 'GOODUSDT')?.wilsonLower >= 52);
  assert.equal(result.legacyTradeFlags['old-good-0']?.flag, 'PYTHON_NO_DATA', 'first row cannot see future outcomes');
  assert.equal(result.legacyTradeFlags['old-good-39']?.flag, 'PYTHON_VERIFIED_GOOD', 'later row can use prior OOS history');
  assert.equal(await readFile(paperFile, 'utf8'), before, 'Python sidecar must not modify paper data');
  console.log('Shakeout self-learning test passed: isolated legacy/candle models and read-only guardrail are correct.');
} finally {
  await rm(dir, { recursive: true, force: true });
}
