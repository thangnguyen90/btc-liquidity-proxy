import assert from 'node:assert/strict';
import {
  POST_DUMP_TIMEFRAME_CONFIGS,
  POST_DUMP_VOLUME_RECOVERY_VERSION,
  aggregateKlinesFrom15m,
  buildPostDumpVolumeRecoverySnapshot,
  classifyPostDumpRecoveryStage,
  evaluatePostDumpVolumeRecovery,
} from '../src/postDumpVolumeRecovery.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const START = Date.UTC(2026, 8, 23, 0, 0, 0);

function candle(index, { open = 100, high, low, close = 100, quoteVolume = 1_000_000 } = {}) {
  const openTime = START + (index * FIFTEEN_MINUTES);
  return {
    openTime,
    closeTime: openTime + FIFTEEN_MINUTES - 1,
    open,
    high: high ?? Math.max(open, close) * 1.002,
    low: low ?? Math.min(open, close) * 0.998,
    close,
    volume: quoteVolume / Math.max(close, 1),
    quoteVolume,
    takerBuyQuoteVolume: quoteVolume * 0.55,
  };
}

{
  const rows = Array.from({ length: 16 }, (_, index) => candle(index, {
    open: 100 + index,
    close: 101 + index,
    high: 102 + index,
    low: 99 + index,
    quoteVolume: 1_000_000 + (index * 10_000),
  }));
  const now = rows.at(-1).closeTime + 1;
  const hourly = aggregateKlinesFrom15m(rows, '1h', { now });
  const fourHourly = aggregateKlinesFrom15m(rows, '4h', { now });
  assert.equal(hourly.length, 4);
  assert.equal(hourly[0].sourceCount, 4);
  assert.equal(hourly[0].open, rows[0].open);
  assert.equal(hourly[0].close, rows[3].close);
  assert.equal(hourly[0].quoteVolume, rows.slice(0, 4).reduce((sum, row) => sum + row.quoteVolume, 0));
  assert.equal(fourHourly.length, 1);
  assert.equal(fourHourly[0].sourceCount, 16);
  assert.equal(fourHourly[0].high, Math.max(...rows.map((row) => row.high)));
  assert.equal(fourHourly[0].low, Math.min(...rows.map((row) => row.low)));
}

{
  function higherTimeframeSeries(config) {
    const duration = config.durationMs;
    const rows = Array.from({ length: config.minBars + 5 }, (_, index) => {
      const openTime = START + (index * duration);
      return {
        openTime,
        closeTime: openTime + duration - 1,
        open: 100,
        high: 100.4,
        low: 99.6,
        close: 100,
        volume: 10_000,
        quoteVolume: 1_000_000,
        takerBuyQuoteVolume: 520_000,
      };
    });
    const dumpIndex = rows.length - 4;
    rows[dumpIndex] = {
      ...rows[dumpIndex],
      open: 102,
      high: 102.2,
      low: config.interval === '4h' ? 85 : 91,
      close: config.interval === '4h' ? 88 : 94,
      quoteVolume: 2_400_000,
    };
    rows[dumpIndex + 1] = { ...rows[dumpIndex + 1], open: rows[dumpIndex].close, close: 95, high: 95.3, low: 93.5, quoteVolume: 900_000 };
    rows[dumpIndex + 2] = { ...rows[dumpIndex + 2], open: 95, close: 99, high: 99.3, low: 94.8, quoteVolume: 1_300_000 };
    rows[dumpIndex + 3] = { ...rows[dumpIndex + 3], open: 99, close: 101, high: 101.2, low: 98.8, quoteVolume: 1_500_000 };
    return rows;
  }
  for (const interval of ['1h', '4h']) {
    const config = POST_DUMP_TIMEFRAME_CONFIGS.find((item) => item.interval === interval);
    const rows = higherTimeframeSeries(config);
    const result = evaluatePostDumpVolumeRecovery(`${interval.toUpperCase()}USDT`, rows, {
      ...config,
      now: rows.at(-1).closeTime + 1,
    });
    assert.equal(result.reason, 'MATCH', `${interval} should detect a concrete recovery case`);
    assert.equal(result.candidate.interval, interval);
    assert.equal(result.candidate.status, 'CONFIRMED');
  }
}

function confirmedSeries() {
  const rows = Array.from({ length: 32 }, (_, index) => candle(index, {
    open: 100 + (index * 0.05),
    close: 100 + (index * 0.05),
  }));
  rows.push(candle(32, { open: 102, high: 102.2, low: 90, close: 94, quoteVolume: 3_200_000 }));
  rows.push(candle(33, { open: 94, close: 94.5, quoteVolume: 900_000 }));
  rows.push(candle(34, { open: 94.5, close: 96, quoteVolume: 1_250_000 }));
  rows.push(candle(35, { open: 96, close: 98, quoteVolume: 1_500_000 }));
  rows.push(candle(36, { open: 98, close: 100, quoteVolume: 1_800_000 }));
  return rows;
}

{
  const rows = confirmedSeries();
  const now = rows.at(-1).closeTime + 1;
  const result = evaluatePostDumpVolumeRecovery('GIGGLEUSDT', rows, { now });
  assert.equal(result.reason, 'MATCH');
  assert.equal(result.candidate.status, 'CONFIRMED');
  assert.ok(result.candidate.score >= 45);
  assert.equal(result.candidate.dumpBodyPct < -7, true);
  assert.equal(result.candidate.dumpVolumeRatio > 3, true);
  assert.equal(result.candidate.observeOnly, true);
  assert.equal(result.candidate.lift.ageBars, 0);
  assert.equal(result.candidate.moveStage.key, 'LONG_FIRST_STRONG_CANDLE');
  assert.equal(result.candidate.idealEntry.basis, 'RETEST_HALF_LIFT_CANDLE');
  assert.ok(result.candidate.idealEntry.zoneLow <= result.candidate.idealEntry.midpoint);
  assert.ok(result.candidate.idealEntry.midpoint <= result.candidate.idealEntry.zoneHigh);
  assert.ok(['IN_ZONE', 'WAIT_PULLBACK', 'WAIT_RECLAIM'].includes(result.candidate.idealEntry.state));
}

{
  const fresh = classifyPostDumpRecoveryStage({
    status: 'BUILDING', dumpAgeBars: 1, lift: null, live: { pricePct: 1.2 },
    recoveryPct: 28, idealEntry: { state: 'WAIT_RECLAIM' },
  });
  assert.equal(fresh.key, 'LONG_FRESH_REVERSAL');
  const extended = classifyPostDumpRecoveryStage({
    status: 'CONFIRMED', dumpAgeBars: 4, lift: { ageBars: 2, pricePct: 0.4, volumeRatio: 1.1 },
    recoveryPct: 75, idealEntry: { state: 'WAIT_PULLBACK' },
  });
  assert.equal(extended.key, 'LONG_EXTENDED');
}

{
  const rows = Array.from({ length: 40 }, (_, index) => candle(index, {
    open: 100 + (index * 0.02),
    close: 100 + (index * 0.02),
    quoteVolume: 1_000_000,
  }));
  const result = evaluatePostDumpVolumeRecovery('NORMALUSDT', rows, { now: rows.at(-1).closeTime + 1 });
  assert.equal(result.candidate, null);
  assert.equal(result.reason, 'NO_ACTIVE_RECOVERY');
}

{
  const rows = confirmedSeries().slice(0, 33);
  rows.push(candle(33, { open: 96, close: 95.5, quoteVolume: 900_000 }));
  rows.push(candle(34, { open: 97, close: 96.5, quoteVolume: 920_000 }));
  rows.push(candle(35, { open: 98, close: 97.5, quoteVolume: 930_000 }));
  const live = candle(36, { open: 97.5, close: 100, quoteVolume: 2_500_000 });
  const now = live.openTime + (5 * 60 * 1000);
  live.closeTime = live.openTime + FIFTEEN_MINUTES - 1;
  rows.push(live);
  const result = evaluatePostDumpVolumeRecovery('LIVEONLYUSDT', rows, { now });
  assert.equal(result.candidate.status, 'BUILDING', 'live candle must not confirm the setup');
  assert.equal(result.candidate.lift, null);
  assert.ok(result.candidate.live.projectedVolumeRatio > 1);
  assert.equal(result.candidate.idealEntry.basis, 'DUMP_RANGE_382_500');
}

{
  const good = confirmedSeries();
  const normal = Array.from({ length: 40 }, (_, index) => candle(index));
  const now = good.at(-1).closeTime + 1;
  const snapshot = buildPostDumpVolumeRecoverySnapshot({
    now,
    symbols: ['GIGGLEUSDT', 'NORMALUSDT', 'SHORTCACHEUSDT'],
    getKlines(symbol) {
      if (symbol === 'GIGGLEUSDT') return good;
      if (symbol === 'NORMALUSDT') return normal;
      return normal.slice(0, 10);
    },
  });
  assert.equal(snapshot.version, POST_DUMP_VOLUME_RECOVERY_VERSION);
  assert.equal(snapshot.stats.scanned, 3);
  assert.equal(snapshot.stats.matched, 1);
  assert.equal(snapshot.stats.confirmed, 1);
  assert.equal(snapshot.stats.excluded.insufficientBars, 1);
  assert.deepEqual(snapshot.timeframes.map((frame) => frame.interval), ['15m', '1h', '4h']);
  assert.equal(snapshot.summary.totalCases, 1);
  assert.equal(snapshot.summary.uniqueSymbols, 1);
  assert.equal(snapshot.summary.byTimeframe['15m'], 1);
  assert.equal(snapshot.summary.byTimeframe['1h'], 0);
  assert.equal(snapshot.summary.byTimeframe['4h'], 0);
  assert.deepEqual(snapshot.execution, {
    binanceEnabled: false,
    affectsEntry: false,
    affectsSize: false,
    affectsStopLoss: false,
    affectsTakeProfit: false,
  });
}

console.log('post-dump-volume-recovery tests: ok');
