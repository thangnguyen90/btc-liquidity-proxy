import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COIN_LEVEL_EARLY_LONG_MIN_SCORE,
  detectCoinLevelEarlyLongWatch,
  evaluateCoinLevelEarlyLongWatch,
} from '../src/coinLevelEarlyLongWatch.js';
import { scanCoinLevelEntryWatch } from '../src/coinLevelEntryWatch.js';

const now = Date.UTC(2026, 8, 21, 7, 2);
const durations = { '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000 };
function bars(interval) {
  const duration = durations[interval];
  return Array.from({ length: 110 }, (_, index) => {
    const openTime = now - 2 * 60_000 - (110 - index) * duration + 1;
    return {
      openTime, closeTime: openTime + duration - 1,
      open: 100, high: interval === '15m' ? 102 : 101, low: 99, close: 100,
      quoteVolume: 100_000, takerBuyQuoteVolume: 50_000,
    };
  });
}
const klinesByInterval = Object.fromEntries(Object.keys(durations).map((interval) => [interval, bars(interval)]));
Object.assign(klinesByInterval['5m'].at(-3), { open: 100, high: 100.8, low: 99.5, close: 100.4 });
Object.assign(klinesByInterval['5m'].at(-2), { open: 100.4, high: 101.3, low: 100.1, close: 101 });
const latest = klinesByInterval['5m'].at(-1);
Object.assign(latest, {
  open: 101, high: 101.8, low: 100.7, close: 101.6,
  quoteVolume: 200_000, takerBuyQuoteVolume: 120_000,
});

const frameStates = { '5m': 'UP', '15m': 'UP', '1h': 'UP', '4h': 'MIXED' };
const input = { symbol: 'PRESSUSDT', klinesByInterval, trendScore: 9, now };
const watch = detectCoinLevelEarlyLongWatch(input);
assert.ok(watch, 'closed 5m buy pressure immediately below the 15m high should create an early LONG watch');
assert.equal(watch.side, 'LONG');
assert.equal(watch.watchOnly, true);
assert.equal(watch.binanceEligible, false);
assert.equal(watch.breakoutLevel, 102);
assert.ok(watch.breakoutGapPct >= 0 && watch.breakoutGapPct <= 0.8);
assert.ok(watch.volumeRatio >= 1.3 && watch.takerBuyPct >= 55);
assert.equal(watch.quoteVolumeUsdt, 200_000, 'displayed USDT amount is the closed 5m candle quote volume');
assert.ok(watch.earlyScore >= COIN_LEVEL_EARLY_LONG_MIN_SCORE);
assert.equal(watch.scoreComponents.trend, 25);
assert.ok(watch.entryZone.low === watch.breakoutLevel && watch.entryZone.high > watch.breakoutLevel);
assert.ok(watch.invalidationPrice < watch.priceAtWatch);

const withLatest = (change) => {
  const rows = { ...klinesByInterval, '5m': klinesByInterval['5m'].map((row) => ({ ...row })) };
  change(rows['5m'].at(-1), rows);
  return evaluateCoinLevelEarlyLongWatch({ ...input, klinesByInterval: rows });
};
const softerVolume = withLatest((row) => { row.quoteVolume = 110_000; row.takerBuyQuoteVolume = 57_000; });
assert.equal(softerVolume.accepted, true, 'one softer flow input should reduce score instead of hard-rejecting');
assert.ok(softerVolume.watch.earlyScore < watch.earlyScore);
const missingTaker = withLatest((row) => { delete row.takerBuyQuoteVolume; });
assert.equal(missingTaker.accepted, true, 'missing one auxiliary taker input is scored as zero, not an automatic rejection');
const noFlow = withLatest((row) => { row.quoteVolume = 10_000; delete row.takerBuyQuoteVolume; });
assert.equal(noFlow.accepted, false);
assert.ok(noFlow.reasons.includes('FLOW_WEAK'));
const hostileTaker = withLatest((row) => { row.takerBuyQuoteVolume = row.quoteVolume * 0.35; });
assert.equal(hostileTaker.accepted, false, 'known aggressive sell flow must remain a hard risk block');
assert.ok(hostileTaker.reasons.includes('FLOW_WEAK'));
const extended = withLatest((row) => { row.high = 106; row.low = 98; });
assert.equal(extended.accepted, false, 'a severely extended 5m candle must not be chased');
assert.ok(extended.reasons.includes('OVEREXTENDED'));
const down1h = {
  ...klinesByInterval,
  '1h': klinesByInterval['1h'].map((row, index) => ({
    ...row, open: 120 - index * 0.1, high: 121 - index * 0.1,
    low: 118 - index * 0.1, close: 119 - index * 0.1,
  })),
};
const downEvaluation = evaluateCoinLevelEarlyLongWatch({ ...input, klinesByInterval: down1h });
assert.equal(downEvaluation.accepted, false);
assert.ok(downEvaluation.reasons.includes('TREND_1H_DOWN'));
assert.equal(withLatest((row) => { row.closeTime = now + 1; }).accepted, false, 'running candles must not trigger');
assert.equal(detectCoinLevelEarlyLongWatch({ ...input, now: now + 10 * 60_000 }), null, 'stale 5m data must not trigger');

const analyze = ({ symbol }) => ({
  symbol,
  recommendation: { trendScore: 9 },
  trend: { frames: ['5m', '15m', '1h', '4h'].map((interval) => ({ interval, state: frameStates[interval] })) },
});
const scan = scanCoinLevelEntryWatch({
  symbols: ['PRESSUSDT'], now, analyze,
  getKlines: (_, interval) => interval === '4h' ? null : klinesByInterval[interval],
});
assert.equal(scan.totalEarlyLongWatches, 1);
assert.equal(scan.earlyLongDiagnostics.covered3tf, 1);
assert.equal(scan.covered, 0, 'confirmed scanner may still wait for 4h without blocking early LONG');
assert.equal(scan.earlyLongWatches[0].binanceEligible, false);
assert.equal(scan.candidates.some((candidate) => candidate.side === 'LONG'), false,
  'early watch must not relax the confirmed LONG entry gate');
const missing1hScan = scanCoinLevelEntryWatch({
  symbols: ['PRESSUSDT'], now, analyze,
  getKlines: (_, interval) => interval === '1h' ? null : klinesByInterval[interval],
});
assert.equal(missing1hScan.earlyLongDiagnostics.covered3tf, 0);
assert.equal(missing1hScan.earlyLongDiagnostics.excludedByReason.MISSING_1H_DATA, 1);

const [server, html, ui] = await Promise.all([
  readFile(new URL('../src/server.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.js', import.meta.url), 'utf8'),
]);
assert.match(server, /for \(const candidate of snapshot\.candidates\)/,
  'Binance executor must still consume confirmed candidates only');
assert.match(html, /LONG sớm · quan sát/);
assert.match(html, /<th>Mẫu<\/th>/);
assert.match(html, /SÁT MỐC PHÁ/);
assert.match(html, /Detector không tự đặt Binance/);
assert.match(html, /<th>Coin · lệnh Binance<\/th>/);
assert.match(html, /<th>Volume ×<\/th><th>KL 5m \(USDT\)<\/th>/);
assert.match(ui, /earlyObserveQuoteVolumeCell\(item\)/);
assert.match(ui, /data\.earlyLongWatches/);
assert.match(ui, /data\.earlyLongHistory/);
assert.match(ui, /earlyLongDiagnostics/);
assert.match(ui, /function earlyLongDisplayPattern/);
assert.match(ui, /function recentBidirectionalObserveSignals/);
assert.match(ui, /RECENT_BIDIRECTIONAL_WINDOW_MS = 30 \* 60_000/);
assert.match(ui, /observe-recent-bidirectional/);
assert.match(ui, /DÒNG TIỀN MẠNH/);
assert.match(ui, /ĐỒNG THUẬN MTF/);
assert.match(ui, /early-long-pattern-\$\{pattern\.key\}/);
assert.match(ui, /không coi đây là kết quả quét rỗng/,
  'old running API must not look like a real zero-watch scan');
console.log('Coin Level early LONG V3: 3TF coverage, scored auxiliaries, diagnostics, no Binance route.');
