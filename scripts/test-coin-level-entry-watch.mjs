import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  scanCoinLevelEntryWatch,
  COIN_LEVEL_ENTRY_SCORE_VERSION,
  COIN_LEVEL_ENTRY_WATCH_VERSION,
  advanceCoinLevelLimitInvalidation,
  evaluateCoinLevelPendingLimit,
} from '../src/coinLevelEntryWatch.js';
import {
  entryWatchTierDisplayLabel,
  sortCoinLevelEntryWatchForDisplay,
} from '../public/coin-level-entry-watch-sort.js';

const now = Date.UTC(2026, 8, 20, 12, 27);
const durations = { '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000 };
const lastEnds = {
  '5m': Date.UTC(2026, 8, 20, 12, 25),
  '15m': Date.UTC(2026, 8, 20, 12, 15),
  '1h': Date.UTC(2026, 8, 20, 12),
  '4h': Date.UTC(2026, 8, 20, 12),
};
function bars(interval, side = 'LONG') {
  const duration = durations[interval];
  return Array.from({ length: 110 }, (_, index) => {
    const openTime = lastEnds[interval] - (110 - index) * duration;
    const base = side === 'LONG' ? 100 : 110;
    return { openTime, closeTime: openTime + duration - 1,
      open: base, high: base + 2, low: base - 2, close: base, quoteVolume: 1_000 };
  });
}
function fixture(side = 'LONG') {
  const byInterval = Object.fromEntries(Object.keys(durations).map((interval) => [interval, bars(interval, side)]));
  const last15m = byInterval['15m'].at(-1);
  if (side === 'LONG') { last15m.close = 104; last15m.high = 105; }
  else { last15m.close = 106; last15m.low = 105; }
  const post5m = byInterval['5m'].at(-2);
  const last5m = byInterval['5m'].at(-1);
  if (side === 'LONG') {
    post5m.low = 102; post5m.close = 103;
    last5m.low = 103; last5m.close = 104;
  } else {
    post5m.high = 108; post5m.close = 107;
    last5m.high = 107; last5m.close = 106;
  }
  return byInterval;
}
const analyze = ({ symbol, klinesByInterval }) => ({
  symbol, recommendation: { trendScore: symbol === 'LONGUSDT' ? 18 : -18 },
  trend: { frames: ['5m', '15m', '1h', '4h'].map((interval) => ({
    interval, state: symbol === 'LONGUSDT' ? 'UP' : 'DOWN',
    close: klinesByInterval[interval].at(-1).close,
  })) },
});
const cache = { LONGUSDT: fixture('LONG'), SHORTUSDT: fixture('SHORT') };
const scan = (overrides = {}) => scanCoinLevelEntryWatch({
  symbols: ['LONGUSDT', 'SHORTUSDT'], now, analyze,
  getKlines: (symbol, interval) => cache[symbol]?.[interval], ...overrides,
});
const result = scan();
assert.equal(result.version, COIN_LEVEL_ENTRY_WATCH_VERSION);
assert.equal(result.entryScoreVersion, COIN_LEVEL_ENTRY_SCORE_VERSION);
assert.equal(result.covered, 2);
assert.equal(result.totalCandidates, 2);
assert.deepEqual(result.candidates.map((row) => row.side), ['LONG', 'SHORT']);
assert.ok(result.candidates.every((row) => row.retestAt > 0 && !row.observeOnly
  && row.binanceEligible && row.executionEligible));
assert.equal(result.candidates[0].referenceLevel, 102);
assert.equal(result.candidates[1].referenceLevel, 108);
assert.equal(result.candidates[0].entryZone.low, 102);
assert.equal(result.candidates[0].entryZone.high, 102.153);
assert.equal(result.candidates[0].entryPrice, 102.0765);
assert.equal(result.candidates[1].entryZone.low, 107.838);
assert.equal(result.candidates[1].entryZone.high, 108);
assert.equal(result.candidates[1].entryPrice, 107.919);
assert.ok(result.candidates.every((row) => row.entryBasis === 'RETEST_LEVEL_0_15_PCT'));
assert.ok(result.candidates.every((row) => row.entryScoreVersion === COIN_LEVEL_ENTRY_SCORE_VERSION
  && row.entryScore >= 0 && row.entryScore <= 100));
assert.ok(result.candidates.every((row) => Object.keys(row.entryScoreComponents).join(',')
  === 'trend,breakout,retest,flow,targetRoom'));
assert.ok(result.candidates.every((row) => row.targetPlan.probabilityCalibrated === false
  && row.targetPlan.targets.length === 3));
assert.ok(result.candidates[0].targetPlan.targets.every((target) => target.price > result.candidates[0].entryPrice));
assert.ok(result.candidates[1].targetPlan.targets.every((target) => target.price < result.candidates[1].entryPrice));
assert.ok(result.candidates.every((row) => row.targetPlan.targets.every((target) => (
  target.movePct > 0 && Math.abs(target.grossRoePctAt5x - target.movePct * 5) <= 0.11
))));
const realAnalysis = scanCoinLevelEntryWatch({
  symbols: ['LONGUSDT'], now,
  getKlines: (_, interval) => cache.LONGUSDT[interval],
});
assert.ok(realAnalysis.candidates[0]?.retestAt > 0);

const noRetest = fixture('LONG');
noRetest['5m'].at(-2).low = 103;
const waiting = scan({ symbols: ['LONGUSDT'], getKlines: (_, interval) => noRetest[interval] });
assert.equal(waiting.candidates[0].retestAt, null);
assert.equal(waiting.candidates[0].observeOnly, true);
assert.equal(waiting.candidates[0].binanceEligible, false);
assert.ok(waiting.candidates[0].entryScore < result.candidates[0].entryScore,
  'closed retest quality must add score without becoming a new Binance gate');
const invalidated = fixture('LONG');
invalidated['5m'].at(-2).close = 101;
assert.equal(scan({ symbols: ['LONGUSDT'], getKlines: (_, interval) => invalidated[interval] }).totalCandidates, 0);

assert.equal(scan({ symbols: ['LONGUSDT'], now: now + 11 * 60_000 }).covered, 0);
const future = fixture('LONG');
future['15m'].at(-1).closeTime = now + 1;
assert.equal(scan({ symbols: ['LONGUSDT'], getKlines: (_, interval) => future[interval] }).totalCandidates, 0);
assert.equal(scan({ analyze: () => ({ recommendation: { trendScore: 4 }, trend: { frames: [] } }) }).totalCandidates, 0);

const tierSorted = sortCoinLevelEntryWatchForDisplay([
  { symbol: 'WATCHUSDT', entryTier: 'WATCH', entryScore: 69, retestAt: 9, confirmationAt: 9 },
  { symbol: 'GOODLOWUSDT', entryTier: 'GOOD', entryScore: 72, retestAt: null, confirmationAt: 5 },
  { symbol: 'VERYUSDT', entryTier: 'VERY_STRONG', entryScore: 81, retestAt: null, confirmationAt: 4 },
  { symbol: 'GOODHIGHUSDT', entryTier: 'GOOD', entryScore: 79, retestAt: null, confirmationAt: 3 },
  { symbol: 'WEAKUSDT', entryTier: 'WEAK', entryScore: 59, retestAt: 10, confirmationAt: 10 },
]);
assert.deepEqual(tierSorted.map((row) => row.symbol), [
  'VERYUSDT', 'GOODHIGHUSDT', 'GOODLOWUSDT', 'WATCHUSDT', 'WEAKUSDT',
], 'display must sort tier first, then Entry Score; retest does not move a weaker tier above a stronger tier');
assert.equal(entryWatchTierDisplayLabel({ entryTier: 'GOOD', entryTierLabel: 'ĐỦ TỐT' }), 'MẠNH');
assert.equal(entryWatchTierDisplayLabel({ entryTier: 'VERY_STRONG' }), 'RẤT MẠNH');

const pendingInput = {
  symbol: 'LONGUSDT', side: 'LONG',
  confirmationAt: cache.LONGUSDT['15m'].at(-1).closeTime,
  referenceLevel: 102,
  submittedAt: cache.LONGUSDT['5m'].at(-2).closeTime + 1,
  now, analyze,
  getKlines: (symbol, interval) => cache[symbol]?.[interval],
};
const validPending = evaluateCoinLevelPendingLimit(pendingInput);
assert.equal(validPending.status, 'VALID');
assert.equal(evaluateCoinLevelPendingLimit({
  ...pendingInput, symbol: 'SHORTUSDT', side: 'SHORT', referenceLevel: 108,
}).status, 'VALID');
assert.equal(evaluateCoinLevelPendingLimit({
  ...pendingInput, submittedAt: now,
}).status, 'UNKNOWN', 'do not cancel before a post-submit 5m candle closes');
assert.equal(evaluateCoinLevelPendingLimit({
  ...pendingInput, getKlines: () => null,
}).status, 'UNKNOWN', 'missing cache must not invalidate a live order');
assert.equal(evaluateCoinLevelPendingLimit({
  ...pendingInput, analyze: () => { throw new Error('temporary analysis failure'); },
}).status, 'UNKNOWN');
const invalidClosed5m = fixture('LONG');
invalidClosed5m['5m'].at(-1).close = 101;
const invalidAssessment = evaluateCoinLevelPendingLimit({
  ...pendingInput, getKlines: (_, interval) => invalidClosed5m[interval],
});
assert.equal(invalidAssessment.reason, 'CLOSED_5M_INVALIDATED_LEVEL');
const firstInvalid = advanceCoinLevelLimitInvalidation(null, invalidAssessment);
assert.equal(firstInvalid.cancel, false);
assert.equal(advanceCoinLevelLimitInvalidation(firstInvalid, invalidAssessment).cancel, true);
assert.equal(advanceCoinLevelLimitInvalidation(firstInvalid, validPending), null);
assert.equal(evaluateCoinLevelPendingLimit({
  ...pendingInput, analyze: ({ symbol, klinesByInterval }) => ({
    ...analyze({ symbol, klinesByInterval }), recommendation: { trendScore: 4 },
  }),
}).reason, 'TREND_SCORE_LOST');
assert.equal(evaluateCoinLevelPendingLimit({
  ...pendingInput, analyze: () => ({ recommendation: { trendScore: 4 }, trend: { frames: [] } }),
}).status, 'UNKNOWN', 'incomplete analysis must not cancel');
assert.equal(evaluateCoinLevelPendingLimit({
  ...pendingInput, referenceLevel: 103,
}).reason, 'BREAKOUT_EXPIRED_OR_REPLACED');

const [server, html, client, css] = await Promise.all([
  readFile(new URL('../src/server.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.css', import.meta.url), 'utf8'),
]);
assert.match(server, /\/api\/coin-level-entry-watch/);
assert.match(server, /evaluateCoinLevelPendingLimit\(/);
assert.match(server, /coinLevelEntryWatchBinanceRunner\.pendingLimitSignal\(order\)/);
assert.match(html, /id="entry-watch-rows"/);
assert.match(html, /class="entry-watch-price-heading">ENTRY DỰ KIẾN</);
assert.match(html, /Entry Score/);
assert.match(html, /T1 \/ T2 \/ T3 dự kiến/);
assert.match(client, /refreshEntryWatch\(\)/);
assert.match(client, /item\.entryPrice/);
assert.match(client, /item\.entryScore/);
assert.match(client, /sortCoinLevelEntryWatchForDisplay\(data\.candidates\)/);
assert.match(client, /entryWatchTierDisplayLabel\(item\)/);
assert.match(client, /item\.targetPlan\?\.targets/);
assert.match(client, /item\.retestAt \? 'entry-watch-retested'/,
  'only a confirmed closed 5m retest should color a signal row');
assert.match(css, /\.entry-watch-retested\.entry-watch-long \{ background:/);
assert.match(css, /\.entry-watch-retested\.entry-watch-short \{ background:/);
assert.match(html, /Màu hàng không xác nhận đã đặt hoặc khớp lệnh Binance/);
console.log('coin-level entry watch: OK');
