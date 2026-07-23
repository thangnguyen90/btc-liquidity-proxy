import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const dir = await mkdtemp(join(tmpdir(), 'paper-page-ml-'));
const file = join(dir, 'paper.json');
const base = Date.now() - 2 * 3600_000;
const trades = Array.from({ length: 12 }, (_, index) => ({
  id: `trade-${index}`,
  signalId: `signal-${index}`,
  symbol: `TEST${index}USDT`,
  side: 'LONG',
  status: 'CLOSED',
  outcome: 'TP',
  signalType: 'TEST_RECLAIM',
  variant: 'MARKET',
  timeframe: '5m',
  openedAt: new Date(base + index * 5 * 60_000).toISOString(),
  closedAt: new Date(base + index * 5 * 60_000 + 60_000).toISOString(),
  entryPrice: 1 + index / 100,
  pnl: 1,
  roe: 5,
  candlePatternAtEntry: { name: 'BULLISH_ENGULFING' },
  btcCandlePatternAtEntry: { name: 'DOJI' },
  btcPhase: 'BTC_UP_MID',
}));
await writeFile(file, JSON.stringify({ trades }), 'utf8');
const before = await readFile(file, 'utf8');
try {
  const { stdout } = await run('python3', [
    resolve('scripts/paper_page_self_learning.py'),
    '--paper-file', file,
    '--page', 'test-page',
    '--min-samples', '8',
    '--max-flags', '100',
  ]);
  const result = JSON.parse(stdout);
  assert.equal(result.guardrail.canAffectTrading, false);
  assert.equal(result.guardrail.writesPaperStore, false);
  assert.equal(result.tradeFlags['trade-0'].label, 'PY NO OOS');
  assert.equal(result.tradeFlags['trade-8'].label, 'PY GOOD');
  assert.equal(result.tradeFlags['trade-8'].learned, true);
  assert.equal(result.training.learnedOutcomes, 12);
  assert.equal(await readFile(file, 'utf8'), before);
  console.log('Generic paper page self-learning test passed: causal, isolated, read-only.');
} finally {
  await rm(dir, { recursive: true, force: true });
}
