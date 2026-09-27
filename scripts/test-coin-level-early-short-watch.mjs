import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COIN_LEVEL_EARLY_SHORT_MIN_SCORE,
  detectCoinLevelEarlyShortWatch,
  evaluateCoinLevelEarlyShortWatch,
} from '../src/coinLevelEarlyShortWatch.js';
import { scanCoinLevelEntryWatch } from '../src/coinLevelEntryWatch.js';

const now = Date.UTC(2026, 8, 21, 3, 2);
const durations = { '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000 };
function bars(interval) {
  const duration = durations[interval];
  return Array.from({ length: 110 }, (_, index) => {
    const openTime = now - 2 * 60_000 - (110 - index) * duration + 1;
    return {
      openTime, closeTime: openTime + duration - 1,
      open: interval === '5m' ? 107 : 100,
      high: interval === '5m' ? 108 : 102,
      low: interval === '5m' ? 106 : 99,
      close: interval === '5m' ? 107 : 100,
      quoteVolume: 100_000, takerBuyQuoteVolume: 50_000,
    };
  });
}
const klinesByInterval = Object.fromEntries(Object.keys(durations).map((interval) => [interval, bars(interval)]));
const prior = klinesByInterval['5m'].at(-2);
Object.assign(prior, { open: 107, high: 110, low: 107, close: 109 });
const latest = klinesByInterval['5m'].at(-1);
Object.assign(latest, {
  open: 108, high: 108.5, low: 103.5, close: 104,
  quoteVolume: 200_000, takerBuyQuoteVolume: 70_000,
});
const last15m = klinesByInterval['15m'].at(-1);
Object.assign(last15m, { open: 106, high: 110, low: 105, close: 109 });

const input = { symbol: 'PUMPUSDT', klinesByInterval, trendScore: 18, now };
const watch = detectCoinLevelEarlyShortWatch(input);
assert.ok(watch, 'first bearish EMA13 cross near a recent pump peak should create an early watch');
assert.equal(watch.side, 'SHORT');
assert.equal(watch.watchOnly, true);
assert.equal(watch.binanceEligible, false);
assert.equal(watch.observedAt, latest.closeTime);
assert.equal(watch.setupMode, 'POST_PUMP_FADE');
assert.equal(watch.quoteVolumeUsdt, 200_000, 'displayed USDT amount is the closed 5m candle quote volume');
assert.ok(watch.earlyScore >= COIN_LEVEL_EARLY_SHORT_MIN_SCORE);
assert.ok(watch.pumpPct >= 8 && watch.pullbackPct <= 6);
assert.ok(watch.entryZone.low > watch.priceAtWatch);
assert.ok(watch.invalidationPrice > watch.peakPrice);

const withLatest = (change) => {
  const rows = { ...klinesByInterval, '5m': klinesByInterval['5m'].map((row) => ({ ...row })) };
  change(rows['5m'].at(-1), rows);
  return detectCoinLevelEarlyShortWatch({ ...input, klinesByInterval: rows });
};
assert.equal(withLatest((row) => { row.quoteVolume = 105_000; }), null, 'weak volume is not enough');
assert.equal(withLatest((row) => { row.takerBuyQuoteVolume = 120_000; }), null, 'buy-dominated taker flow is not sell pressure');
assert.ok(withLatest((row) => { delete row.takerBuyQuoteVolume; }),
  'missing taker can pass when quote volume and volume ratio supply enough scored flow');
assert.equal(withLatest((row) => { row.close = 101; }), null, 'a deep dump is too late for this near-peak watch');
assert.equal(withLatest((row) => { row.closeTime = now + 1; }), null, 'running candles must not trigger');
assert.equal(detectCoinLevelEarlyShortWatch({ ...input, now: now + 10 * 60_000 }), null, 'stale 5m data must not trigger');

const breakdownRows = {};
breakdownRows['5m'] = bars('5m').map((row, index) => {
  const close = 111 - index * 0.02;
  return { ...row, open: close + 0.03, high: close + 0.22, low: close - 0.22, close };
});
breakdownRows['15m'] = bars('15m').map((row, index) => {
  const close = 120 - index * 0.1;
  return { ...row, open: close + 0.05, high: close + 0.5, low: close - 0.5, close };
});
breakdownRows['1h'] = bars('1h').map((row, index) => {
  const close = 140 - index * 0.2;
  return { ...row, open: close + 0.1, high: close + 1, low: close - 1, close };
});
Object.assign(breakdownRows['5m'].at(-1), {
  open: 108.9, high: 108.95, low: 108.55, close: 108.65,
  quoteVolume: 200_000, takerBuyQuoteVolume: 60_000,
});
const breakdownEvaluation = evaluateCoinLevelEarlyShortWatch({
  symbol: 'BREAKUSDT', klinesByInterval: breakdownRows, now,
});
assert.equal(breakdownEvaluation.accepted, true,
  'bearish 15m/1h pressure near the prior 15m floor must not require an 8% pump');
assert.equal(breakdownEvaluation.watch.setupMode, 'BREAKDOWN_PRESSURE');
assert.ok(breakdownEvaluation.watch.pumpPct < 5);

const analyze = ({ symbol }) => ({
  symbol,
  recommendation: { trendScore: 18 },
  trend: { frames: ['5m', '15m', '1h', '4h'].map((interval) => ({ interval, state: 'UP' })) },
});
const scan = scanCoinLevelEntryWatch({
  symbols: ['PUMPUSDT'], now, analyze,
  getKlines: (_, interval) => interval === '4h' ? undefined : klinesByInterval[interval],
});
assert.equal(scan.totalEarlyShortWatches, 1);
assert.equal(scan.earlyShortWatches[0].binanceEligible, false);
assert.equal(scan.covered, 0, 'confirmed scanner may still wait for 4h');
assert.equal(scan.earlyShortDiagnostics.covered3tf, 1,
  'early SHORT must scan as soon as 5m/15m/1h are ready');
assert.equal(scan.candidates.some((candidate) => candidate.side === 'SHORT'), false,
  'early watch must not relax the confirmed SHORT entry gate');
const missing1hScan = scanCoinLevelEntryWatch({
  symbols: ['PUMPUSDT'], now, analyze,
  getKlines: (_, interval) => interval === '1h' ? undefined : klinesByInterval[interval],
});
assert.equal(missing1hScan.earlyShortDiagnostics.covered3tf, 0);
assert.equal(missing1hScan.earlyShortDiagnostics.excludedByReason.MISSING_1H_DATA, 1);

const [server, html, ui, css] = await Promise.all([
  readFile(new URL('../src/server.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.css', import.meta.url), 'utf8'),
]);
assert.match(server, /for \(const candidate of snapshot\.candidates\)/,
  'Binance executor must still consume confirmed candidates only');
assert.match(html, /SHORT sớm · quan sát/);
assert.match(html, /KHÔNG TỰ ĐẶT · CÓ NÚT THỦ CÔNG/);
assert.match(html, /<th>Mẫu chính<\/th><th>Mẫu chi tiết<\/th>/);
assert.match(html, /<th>Volume ×<\/th><th>KL 5m \(USDT\)<\/th>/);
assert.match(ui, /earlyObserveQuoteVolumeCell\(item\)/);
for (const label of ['SÁT MỐC PHÁ ĐÁY', 'DÒNG TIỀN BÁN MẠNH', 'ĐỒNG THUẬN MTF GIẢM', 'ĐỈNH THẤP DẦN', 'ÁP LỰC GIẢM']) {
  assert.ok(html.includes(label), `SHORT detail legend must include ${label}`);
}
assert.match(ui, /data\.earlyShortWatches/);
assert.match(ui, /function recentBidirectionalObserveSignals/);
assert.match(ui, /observe-recent-bidirectional/);
assert.match(ui, /data\.earlyShortHistory/);
assert.match(ui, /earlyShortDiagnostics/);
assert.match(ui, /function earlyShortDisplayPattern/);
assert.match(ui, /Math\.abs\(breakdownGapPct\) <= 0\.35/);
assert.match(ui, /takerSellPct >= 60/);
assert.match(ui, /frame15m === 'DOWN' && frame1h === 'DOWN'/);
assert.match(ui, /LOWER_HIGH_MISSING/);
assert.match(css, /\.early-short-pattern-badge\.lower-high/);
assert.match(ui, /không coi đây là kết quả quét rỗng/,
  'old running API must not look like a real zero-watch scan');
console.log('Coin Level early SHORT V2: scored post-pump/breakdown 3TF watch, history diagnostics, no Binance route.');
