import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LIQUID_SPRING_REVERSAL_VERSION,
  evaluateLiquidSpringReversal,
  liquidSpringReversalStats,
  liquidSpringStructureSnapshot,
} from '../src/liquidSpringReversalLabels.js';
import { liquidLiveCardKeysOfTrade } from '../src/liquidLiveCardWhitelist.js';

const frame = 15 * 60_000;
const start = Date.parse('2026-08-11T00:00:00.000Z');
function candle(index, { open = 100, high = 101, low = 99, close = 100.2, volume = 100 } = {}) {
  const openTime = start + index * frame;
  return { openTime, closeTime: openTime + frame - 1, open, high, low, close, volume };
}

const longCandles = [
  ...Array.from({ length: 6 }, (_, index) => candle(index)),
  candle(6, { open: 98.7, high: 100.1, low: 98.5, close: 99.2, volume: 160 }),
  candle(7, { open: 99.2, high: 105, low: 98, close: 104 }),
];
const signalAt = start + 7 * frame + 1_000;
const longStructure = liquidSpringStructureSnapshot(longCandles, signalAt, { timeframe: '15m' });
assert(longStructure.longSweepPct >= 0.49);
assert(longStructure.longReclaimPct >= 0.2);
assert.equal(longStructure.triggerOpenTime, start + 6 * frame);

const longTrade = {
  id: 'long-spring',
  side: 'LONG',
  status: 'CLOSED',
  pnl: 1,
  roe: 8,
  openedAt: '2026-08-11T02:00:00.000Z',
  candlePatternAtEntry: { direction: 'BULLISH' },
  btcCandlePatternAtEntry: { direction: 'BULLISH' },
  marketDirectionAtSignal: { scores: { long: 30, short: 50 } },
};
const long = evaluateLiquidSpringReversal(longTrade, { structure: longStructure });
assert.equal(long.liquidLongSpringMatched, true);
assert.equal(long.liquidShortUpthrustMatched, false);
assert.equal(long.liquidSpringReversalKey, 'LONG_SPRING');
assert.equal(long.liquidSpringReversalVersion, LIQUID_SPRING_REVERSAL_VERSION);
assert.equal(long.liquidSpringReversalObservationOnly, true);
assert.equal(long.liquidSpringReversalAffectsBinance, false);
assert(liquidLiveCardKeysOfTrade(long).includes('spring-reversal:LONG_SPRING'));

const shortCandles = [
  ...Array.from({ length: 6 }, (_, index) => candle(index)),
  candle(6, { open: 101.3, high: 101.7, low: 99.8, close: 100.7, volume: 150 }),
];
const shortStructure = liquidSpringStructureSnapshot(shortCandles, signalAt, { timeframe: '15m' });
const short = evaluateLiquidSpringReversal({
  ...longTrade,
  id: 'short-upthrust',
  side: 'SHORT',
  candlePatternAtEntry: { direction: 'BEARISH' },
  btcCandlePatternAtEntry: { direction: 'BEARISH' },
  marketDirectionAtSignal: { scores: { long: 52, short: 30 } },
}, { structure: shortStructure });
assert.equal(short.liquidLongSpringMatched, false);
assert.equal(short.liquidShortUpthrustMatched, true);
assert.equal(short.liquidSpringReversalKey, 'SHORT_UPTHRUST');
assert(liquidLiveCardKeysOfTrade(short).includes('spring-reversal:SHORT_UPTHRUST'));

const insufficientGap = evaluateLiquidSpringReversal({
  ...longTrade,
  marketDirectionAtSignal: { scores: { long: 40, short: 50 } },
}, { structure: longStructure });
assert.equal(insufficientGap.liquidSpringReversalMatched, false);

const missingStructure = evaluateLiquidSpringReversal(longTrade);
assert.equal(missingStructure.liquidSpringReversalMatched, false);
assert.equal(missingStructure.liquidSpringReversalEligible, false);

const stats = liquidSpringReversalStats([
  { ...longTrade, ...long },
  { ...longTrade, side: 'SHORT', pnl: -0.5, roe: -4, ...short },
]);
assert.equal(stats.find((row) => row.key === 'LONG_SPRING').closed, 1);
assert.equal(stats.find((row) => row.key === 'LONG_SPRING').avgRoe, 8);
assert.equal(stats.find((row) => row.key === 'SHORT_UPTHRUST').closed, 1);

const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const uiSource = fs.readFileSync(new URL('../public/liquid-scan.js', import.meta.url), 'utf8');
const htmlSource = fs.readFileSync(new URL('../public/liquid-scan.html', import.meta.url), 'utf8');
assert.match(serverSource, /evaluateLiquidSpringReversal\(trade/);
assert.match(serverSource, /liquidSpringStructureAtEntry\(trade\)/);
assert.match(uiSource, /spring-reversal:\$\{row\.key\}/);
assert.match(uiSource, /liquidLiveCardAttr\(`spring-reversal:/);
assert.match(uiSource, /isBinanceCardAvgRoeEligible\(Number\(avgRoe\)\)/);
assert.match(htmlSource, /id="liquidSpringReversalStats"/);

console.log('Liquid spring/upthrust reversal label tests passed');
