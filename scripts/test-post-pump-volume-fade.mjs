import assert from 'node:assert/strict';
import {
  POST_PUMP_TIMEFRAME_CONFIGS,
  POST_PUMP_VOLUME_FADE_VERSION,
  buildPostPumpVolumeFadeSnapshot,
  classifyPostPumpFadeStage,
  evaluatePostPumpVolumeFade,
} from '../src/postPumpVolumeFade.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const START = Date.UTC(2026, 8, 23, 0, 0, 0);

function candle(index, { open = 100, high, low, close = 100, quoteVolume = 1_000_000 } = {}) {
  const openTime = START + (index * FIFTEEN_MINUTES);
  return {
    openTime, closeTime: openTime + FIFTEEN_MINUTES - 1,
    open, high: high ?? Math.max(open, close) * 1.002,
    low: low ?? Math.min(open, close) * 0.998, close,
    volume: quoteVolume / Math.max(close, 1), quoteVolume,
    takerBuyQuoteVolume: quoteVolume * 0.55,
  };
}

function confirmedSeries() {
  const rows = Array.from({ length: 32 }, (_, index) => candle(index, {
    open: 100 + (index * 0.02), close: 100 + (index * 0.02),
  }));
  rows.push(candle(32, { open: 100, high: 112, low: 99.8, close: 108, quoteVolume: 3_200_000 }));
  rows.push(candle(33, { open: 108, high: 108.2, low: 106.8, close: 107, quoteVolume: 900_000 }));
  rows.push(candle(34, { open: 107, high: 107.1, low: 104.8, close: 105, quoteVolume: 1_250_000 }));
  rows.push(candle(35, { open: 105, high: 105.1, low: 101.8, close: 102, quoteVolume: 1_500_000 }));
  rows.push(candle(36, { open: 102, high: 102.1, low: 99.8, close: 100, quoteVolume: 1_800_000 }));
  return rows;
}

{
  const rows = confirmedSeries();
  const result = evaluatePostPumpVolumeFade('PUMPUSDT', rows, { now: rows.at(-1).closeTime + 1 });
  assert.equal(result.reason, 'MATCH');
  assert.equal(result.candidate.status, 'CONFIRMED');
  assert.ok(result.candidate.pumpBodyPct >= 8);
  assert.ok(result.candidate.pumpHighPct >= 12);
  assert.ok(result.candidate.pumpVolumeRatio > 3);
  assert.equal(result.candidate.sell.ageBars, 0);
  assert.equal(result.candidate.moveStage.key, 'SHORT_FIRST_STRONG_CANDLE');
  assert.equal(result.candidate.idealEntry.basis, 'RETEST_UPPER_HALF_SELL_CANDLE');
  assert.ok(result.candidate.idealEntry.zoneLow <= result.candidate.idealEntry.midpoint);
  assert.ok(result.candidate.idealEntry.midpoint <= result.candidate.idealEntry.zoneHigh);
  assert.equal(result.candidate.observeOnly, true);
}

{
  const nearTop = classifyPostPumpFadeStage({
    status: 'BUILDING', sell: null, fadePct: 25, idealEntry: { state: 'WAIT_REJECT' },
  });
  assert.equal(nearTop.key, 'SHORT_NEAR_TOP');
  const extended = classifyPostPumpFadeStage({
    status: 'CONFIRMED', sell: { ageBars: 2, pricePct: -0.5, volumeRatio: 1.1 },
    fadePct: 70, idealEntry: { state: 'WAIT_BOUNCE' },
  });
  assert.equal(extended.key, 'SHORT_EXTENDED');
}

{
  const rows = Array.from({ length: 40 }, (_, index) => candle(index, {
    open: 100 + (index * 0.02), close: 100 + (index * 0.02), quoteVolume: 1_000_000,
  }));
  const result = evaluatePostPumpVolumeFade('NORMALUSDT', rows, { now: rows.at(-1).closeTime + 1 });
  assert.equal(result.candidate, null);
  assert.equal(result.reason, 'NO_ACTIVE_FADE');
}

{
  const rows = confirmedSeries().slice(0, 33);
  rows.push(candle(33, { open: 106, close: 106.5, quoteVolume: 900_000 }));
  rows.push(candle(34, { open: 104, close: 104.5, quoteVolume: 920_000 }));
  rows.push(candle(35, { open: 102, close: 102.5, quoteVolume: 930_000 }));
  const live = candle(36, { open: 102.5, high: 102.6, low: 99.8, close: 100, quoteVolume: 2_500_000 });
  const now = live.openTime + (5 * 60 * 1000);
  rows.push(live);
  const result = evaluatePostPumpVolumeFade('LIVESELLUSDT', rows, { now });
  assert.equal(result.candidate.status, 'BUILDING', 'live sell candle must not confirm SHORT');
  assert.equal(result.candidate.sell, null);
  assert.equal(result.candidate.idealEntry.basis, 'PUMP_RANGE_382_500');
}

{
  function higherTimeframeSeries(config) {
    const duration = config.interval === '1h' ? 60 * 60 * 1000 : 4 * 60 * 60 * 1000;
    const rows = Array.from({ length: config.minBars + 5 }, (_, index) => ({
      openTime: START + (index * duration), closeTime: START + ((index + 1) * duration) - 1,
      open: 100, high: 100.4, low: 99.6, close: 100,
      volume: 10_000, quoteVolume: 1_000_000, takerBuyQuoteVolume: 520_000,
    }));
    const pumpIndex = rows.length - 4;
    rows[pumpIndex] = {
      ...rows[pumpIndex], open: 100,
      high: config.interval === '4h' ? 118 : 112,
      low: 99.8, close: config.interval === '4h' ? 110 : 106,
      quoteVolume: 2_400_000,
    };
    rows[pumpIndex + 1] = { ...rows[pumpIndex + 1], open: rows[pumpIndex].close, close: 105, high: rows[pumpIndex].close + 0.2, low: 104.8, quoteVolume: 900_000 };
    rows[pumpIndex + 2] = { ...rows[pumpIndex + 2], open: 105, close: 101, high: 105.1, low: 100.8, quoteVolume: 1_300_000 };
    rows[pumpIndex + 3] = { ...rows[pumpIndex + 3], open: 101, close: 99, high: 101.1, low: 98.8, quoteVolume: 1_500_000 };
    return rows;
  }
  for (const interval of ['1h', '4h']) {
    const config = POST_PUMP_TIMEFRAME_CONFIGS.find((item) => item.interval === interval);
    const rows = higherTimeframeSeries(config);
    const result = evaluatePostPumpVolumeFade(`${interval.toUpperCase()}USDT`, rows, {
      ...config, now: rows.at(-1).closeTime + 1,
    });
    assert.equal(result.reason, 'MATCH', `${interval} should detect a concrete SHORT fade`);
    assert.equal(result.candidate.interval, interval);
    assert.equal(result.candidate.status, 'CONFIRMED');
  }
}

{
  const good = confirmedSeries();
  const normal = Array.from({ length: 40 }, (_, index) => candle(index));
  const snapshot = buildPostPumpVolumeFadeSnapshot({
    now: good.at(-1).closeTime + 1,
    symbols: ['PUMPUSDT', 'NORMALUSDT', 'SHORTCACHEUSDT'],
    getKlines(symbol) {
      if (symbol === 'PUMPUSDT') return good;
      if (symbol === 'NORMALUSDT') return normal;
      return normal.slice(0, 10);
    },
  });
  assert.equal(snapshot.version, POST_PUMP_VOLUME_FADE_VERSION);
  assert.deepEqual(snapshot.timeframes.map((frame) => frame.interval), ['15m', '1h', '4h']);
  assert.equal(snapshot.stats.scanned, 3);
  assert.equal(snapshot.stats.matched, 1);
  assert.equal(snapshot.stats.confirmed, 1);
  assert.equal(snapshot.stats.excluded.insufficientBars, 1);
  assert.equal(snapshot.summary.totalCases, 1);
  assert.equal(snapshot.summary.uniqueSymbols, 1);
  assert.equal(snapshot.execution.binanceEnabled, false);
  assert.equal(snapshot.execution.affectsEntry, false);
}

console.log('post-pump-volume-fade tests: ok');
