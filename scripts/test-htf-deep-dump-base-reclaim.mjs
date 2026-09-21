import assert from 'node:assert/strict';
import {
  HTF_DEEP_DUMP_BASE_RECLAIM_RULE,
  HTF_DEEP_DUMP_BASE_RECLAIM_VERSION,
  HTF_DEEP_DUMP_EARLY_WATCH,
  HTF_DEEP_DUMP_RETEST_LONG_READY,
  HTF_DEEP_PUMP_EARLY_SHORT_WATCH,
  HTF_DEEP_PUMP_RETEST_SHORT_READY,
  detectHtfDeepDumpBaseReclaim,
  detectHtfDeepPumpBaseReject,
} from '../src/htfDeepDumpBaseReclaim.js';

const FIFTEEN_MINUTES = 15 * 60_000;
const FIVE_MINUTES = 5 * 60_000;
const durationOf = (interval) => interval === '1h' ? 60 * 60_000 : 4 * 60 * 60_000;

function candle(openTime, duration, patch = {}) {
  return {
    openTime,
    closeTime: openTime + duration - 1,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 10,
    quoteVolume: 1_000,
    trades: 100,
    ...patch,
  };
}

function fixture(htfInterval, { extreme = false, postBarsBeforeEarly = 3 } = {}) {
  const htfDuration = durationOf(htfInterval);
  const htfStart = Date.UTC(2026, 8, 1);
  const shockIndex = 56;
  const baseCount = htfInterval === '1h' ? 4 : 2;
  const htf = Array.from({ length: shockIndex }, (_, index) => (
    candle(htfStart + index * htfDuration, htfDuration)
  ));
  const shock = candle(htfStart + shockIndex * htfDuration, htfDuration, extreme
    ? {
      open: 100,
      high: 100.5,
      low: 84,
      close: 94,
      volume: 120,
      quoteVolume: 12_000,
      trades: 900,
    }
    : {
      open: 100,
      high: 100.5,
      low: 90,
      close: 96,
      volume: 40,
      quoteVolume: 4_000,
      trades: 400,
    });
  htf.push(shock);

  const baseTemplate = extreme
    ? [
      { open: 89, high: 90.5, low: 86, close: 89.5, quoteVolume: 6_000 },
      { open: 89.5, high: 91, low: 87, close: 90, quoteVolume: 6_000 },
    ]
    : [
      { open: 93, high: 94.4, low: 91.2, close: 93.4, quoteVolume: 2_000 },
      { open: 93.4, high: 94.8, low: 92, close: 94, quoteVolume: 2_000 },
      { open: 94, high: 95, low: 92.3, close: 94.2, quoteVolume: 2_000 },
      { open: 94.2, high: 94.7, low: 92.5, close: 94, quoteVolume: 2_000 },
    ];
  for (let index = 0; index < baseCount; index += 1) {
    htf.push(candle(
      htfStart + (shockIndex + 1 + index) * htfDuration,
      htfDuration,
      baseTemplate[index],
    ));
  }

  const baseEnd = htf.at(-1).closeTime;
  const baselinePrice = extreme ? 89.5 : 94;
  const neckline = extreme ? 91 : 95;
  const rows15m = Array.from({ length: 30 }, (_, index) => candle(
    baseEnd + 1 - (30 - index) * FIFTEEN_MINUTES,
    FIFTEEN_MINUTES,
    {
      open: baselinePrice,
      high: baselinePrice + 0.4,
      low: baselinePrice - 0.5,
      close: baselinePrice,
      volume: 1,
      quoteVolume: 100,
      trades: 10,
    },
  ));
  for (let index = 0; index < postBarsBeforeEarly; index += 1) {
    rows15m.push(candle(baseEnd + 1 + index * FIFTEEN_MINUTES, FIFTEEN_MINUTES, {
      open: baselinePrice,
      high: neckline - 0.2,
      low: baselinePrice - 0.6,
      close: baselinePrice + index * 0.05,
      volume: 1,
      quoteVolume: 100,
      trades: 10,
    }));
  }
  const earlyOpenTime = baseEnd + 1 + postBarsBeforeEarly * FIFTEEN_MINUTES;
  const early = candle(earlyOpenTime, FIFTEEN_MINUTES, {
    open: neckline - 0.8,
    high: neckline + 1,
    low: neckline - 1.2,
    close: neckline + (extreme ? 1 : 0.6),
    volume: 2,
    quoteVolume: 160,
    trades: 16,
  });
  rows15m.push(early);
  const now = early.closeTime + 1;

  // On 1h, the fourth 15m candle closes together with its containing 1h bar.
  // That bar must not leak into the already completed sideway-base neckline.
  if (htfInterval === '1h' && postBarsBeforeEarly === 3) {
    htf.push(candle(baseEnd + 1, htfDuration, {
      open: baselinePrice,
      high: early.high,
      low: baselinePrice - 0.6,
      close: early.close,
      quoteVolume: 500,
      trades: 40,
    }));
  }
  return {
    htfInterval,
    htf,
    rows15m,
    now,
    shockIndex,
    baseCount,
    baseEnd,
    early,
    neckline,
  };
}

function detect(input, patch = {}) {
  return detectHtfDeepDumpBaseReclaim(input.htf, input.rows15m, {
    symbol: 'ALLOUSDT',
    htfInterval: input.htfInterval,
    now: input.now,
    ...patch,
  });
}

function reflectFixture(input, anchor = 200) {
  const reflectBar = (bar) => ({
    ...bar,
    open: anchor - bar.open,
    high: anchor - bar.low,
    low: anchor - bar.high,
    close: anchor - bar.close,
  });
  return {
    ...structuredClone(input),
    htf: input.htf.map(reflectBar),
    rows15m: input.rows15m.map(reflectBar),
  };
}

assert.equal(
  HTF_DEEP_DUMP_BASE_RECLAIM_VERSION,
  'HTF_DEEP_DUMP_BASE_RECLAIM_LONG_SHORT_V4_SHORT_LARGE_REBOUND_20260914',
);
assert.deepEqual(
  { min: HTF_DEEP_DUMP_BASE_RECLAIM_RULE.minShockPct,
    atrX: HTF_DEEP_DUMP_BASE_RECLAIM_RULE.shockAtrMultiple,
    trX: HTF_DEEP_DUMP_BASE_RECLAIM_RULE.minTrueRangeRatio,
    volumeX: HTF_DEEP_DUMP_BASE_RECLAIM_RULE.minQuoteVolumeRatio },
  { min: 5, atrX: 2.5, trX: 3, volumeX: 3 },
);
assert.deepEqual({
  reboundPct: HTF_DEEP_DUMP_BASE_RECLAIM_RULE.shortMinReboundPct,
  reboundAtr: HTF_DEEP_DUMP_BASE_RECLAIM_RULE.shortMinReboundAtr,
  fadePct: HTF_DEEP_DUMP_BASE_RECLAIM_RULE.shortMinFadePct,
  fadeAtr: HTF_DEEP_DUMP_BASE_RECLAIM_RULE.shortMinFadeAtr,
}, { reboundPct: 1.5, reboundAtr: 1.25, fadePct: 1, fadeAtr: 0.75 });

for (const htfInterval of ['1h', '4h']) {
  const input = fixture(htfInterval, { extreme: htfInterval === '4h' });
  const event = detect(input).at(0);
  assert.ok(event, `${htfInterval} fixture should emit`);
  assert.equal(event.stage, HTF_DEEP_DUMP_EARLY_WATCH);
  assert.equal(event.tier, 'EARLY_WATCH');
  assert.equal(event.side, 'LONG');
  assert.equal(event.action, 'WATCH');
  assert.equal(event.interval, '15m');
  assert.equal(event.htfInterval, htfInterval);
  assert.equal(event.observeOnly, true);
  assert.equal(event.executionEnabled, false);
  assert.equal(event.closed, true);
  assert.equal(event.watchReady, true);
  assert.equal(event.longReady, false);
  assert.equal(event.baseBars, htfInterval === '1h' ? 4 : 2);
  assert.equal(event.baseEndAt, input.baseEnd);
  assert.equal(event.baseNeckline, input.neckline);
  assert.equal(event.earlyPostBaseBars, 4);
  assert.equal(event.breakoutQuoteVolumeRatio, 1.6);
  assert.equal(event.shockConfirmationCount, 3);
  assert.match(event.dedupeKey, /HTF_DEEP_DUMP_BASE_RECLAIM\|ALLOUSDT\|\d+\|EARLY_WATCH$/);
  assert.ok(event.price > event.baseNeckline && event.price > event.ema13);
  assert.equal(event.shockTier, htfInterval === '4h' ? 'EXTREME' : 'DEEP');
  if (htfInterval === '1h') {
    assert.equal(event.shockPct, 10);
    assert.equal(event.trueRangeRatio, 5.25);
    assert.equal(event.quoteVolumeRatio, 4);
    assert.equal(event.breakPriorLowPct, 9.090909);
    assert.equal(event.extremeConditionCount, 0);
  } else {
    assert.equal(event.shockPct, 16);
    assert.equal(event.trueRangeRatio, 8.25);
    assert.equal(event.quoteVolumeRatio, 12);
    assert.ok(event.breakPriorLowPct >= 15);
    assert.equal(event.extremeConditionCount, 4);
  }

  const readyInput = structuredClone(input);
  const readyOpenTime = readyInput.rows15m.at(-1).closeTime + 1;
  readyInput.rows15m.push(candle(readyOpenTime, FIFTEEN_MINUTES, {
    open: input.neckline - 0.05,
    high: input.neckline + 0.8,
    low: input.neckline - 0.1,
    close: input.neckline + 0.55,
    volume: 1,
    quoteVolume: 100,
    trades: 10,
  }));
  readyInput.now = readyInput.rows15m.at(-1).closeTime + 1;
  const ready = detect(readyInput, { symbol: 'MYXUSDT' }).at(0);
  assert.ok(ready, `${htfInterval} retest should emit without caller state`);
  assert.equal(ready.stage, HTF_DEEP_DUMP_RETEST_LONG_READY);
  assert.equal(ready.action, 'LONG');
  assert.equal(ready.observeOnly, false);
  assert.equal(ready.executionEligible, true);
  assert.equal(ready.binanceEligible, true);
  assert.equal(ready.watchReady, false);
  assert.equal(ready.longReady, true);
  assert.equal(ready.earlyAt, input.early.closeTime);
  assert.equal(ready.readyAt, readyInput.rows15m.at(-1).closeTime);
  assert.equal(ready.retestBarsAfterEarly, 1);
  assert.ok(ready.retestSupportLow <= ready.retestSupportHigh);
  assert.match(ready.dedupeKey, /\|RETEST_LONG_READY$/);

  const fastOpenTime = input.early.closeTime + 1;
  const fastRows5m = [candle(fastOpenTime, FIVE_MINUTES, {
    open: input.neckline + 0.2,
    high: input.neckline + 0.8,
    low: input.neckline - 0.05,
    close: input.neckline + 0.5,
    volume: 1,
    quoteVolume: 40,
    trades: 4,
  })];
  const fastReady = detect(input, {
    symbol: 'FASTLONGUSDT',
    rows5m: fastRows5m,
    now: fastRows5m.at(-1).closeTime + 1,
  }).at(0);
  assert.ok(fastReady, `${htfInterval} source should support fast 5m LONG confirmation`);
  assert.equal(fastReady.stage, HTF_DEEP_DUMP_RETEST_LONG_READY);
  assert.equal(fastReady.htfInterval, htfInterval);
  assert.equal(fastReady.confirmationInterval, '5m');
  assert.equal(fastReady.fastConfirmation, true);
  assert.equal(fastReady.retestBars5mAfterEarly, 1);
  assert.equal(fastReady.retestBarsAfterEarly, null);
  assert.equal(fastReady.candleCloseAt, fastRows5m.at(-1).closeTime);
  assert.equal(fastReady.executionEligible, true);

  const formingFast = structuredClone(fastRows5m);
  formingFast[0].closeTime += FIVE_MINUTES;
  assert.equal(detect(input, {
    rows5m: formingFast,
    now: fastRows5m.at(-1).closeTime + 1,
  }).at(0)?.stage, HTF_DEEP_DUMP_EARLY_WATCH, 'forming 5m candles cannot confirm READY');

  const bearishRetest = structuredClone(readyInput);
  Object.assign(bearishRetest.rows15m.at(-1), {
    open: input.neckline + 0.6,
    close: input.neckline + 0.1,
  });
  assert.equal(detect(bearishRetest).length, 0, 'READY requires a bullish close');

  const newLow = structuredClone(readyInput);
  newLow.rows15m.at(-1).low = event.baseLow - 0.01;
  assert.equal(detect(newLow).length, 0, 'READY rejects a new post-base low');
}

for (const htfInterval of ['1h', '4h']) {
  const longInput = fixture(htfInterval, { extreme: htfInterval === '4h' });
  const input = reflectFixture(longInput);
  const watch = detectHtfDeepPumpBaseReject(input.htf, input.rows15m, {
    symbol: 'BULLAUSDT', htfInterval, now: input.now,
  }).at(0);
  assert.ok(watch, `${htfInterval} inverse pump fixture should emit`);
  assert.equal(watch.stage, HTF_DEEP_PUMP_EARLY_SHORT_WATCH);
  assert.equal(watch.side, 'SHORT');
  assert.equal(watch.action, 'WATCH');
  assert.equal(watch.observeOnly, true);
  assert.equal(watch.executionEligible, false);
  assert.ok(watch.price < watch.baseNeckline && watch.price < watch.ema13);
  assert.match(watch.dedupeKey, /HTF_DEEP_PUMP_BASE_REJECT\|BULLAUSDT\|\d+\|EARLY_SHORT_WATCH$/);

  const directInput = structuredClone(input);
  const reboundOpenTime = longInput.rows15m.at(-1).closeTime + 1;
  directInput.rows15m.push(candle(reboundOpenTime, FIFTEEN_MINUTES, {
    open: watch.baseNeckline * 1.003,
    high: watch.baseNeckline * 1.005,
    low: watch.baseNeckline * 0.992,
    close: watch.baseNeckline * 0.996,
    volume: 1,
    quoteVolume: 100,
    trades: 10,
  }));
  directInput.now = directInput.rows15m.at(-1).closeTime + 1;
  assert.notEqual(detectHtfDeepPumpBaseReject(directInput.htf, directInput.rows15m, {
    symbol: 'DIRECTDUMPUSDT', htfInterval, now: directInput.now,
  }).at(0)?.stage, HTF_DEEP_PUMP_RETEST_SHORT_READY,
  'a second straight dump candle is not a SHORT retest');

  const readyInput = structuredClone(input);
  readyInput.rows15m.push(candle(reboundOpenTime, FIFTEEN_MINUTES, {
    open: watch.price * 0.998,
    high: watch.baseNeckline * 1.012,
    low: watch.price * 0.995,
    close: watch.baseNeckline * 1.001,
    volume: 1,
    quoteVolume: 100,
    trades: 10,
  }));
  readyInput.rows15m.push(candle(reboundOpenTime + FIFTEEN_MINUTES, FIFTEEN_MINUTES, {
    open: watch.baseNeckline * 1.003,
    high: watch.baseNeckline * 1.005,
    low: watch.baseNeckline * 0.992,
    close: watch.baseNeckline * 0.996,
    volume: 1,
    quoteVolume: 100,
    trades: 10,
  }));
  readyInput.now = readyInput.rows15m.at(-1).closeTime + 1;
  const ready = detectHtfDeepPumpBaseReject(readyInput.htf, readyInput.rows15m, {
    symbol: 'BULLAUSDT', htfInterval, now: readyInput.now,
  }).at(0);
  assert.ok(ready, `${htfInterval} inverse bearish retest should emit`);
  assert.equal(ready.stage, HTF_DEEP_PUMP_RETEST_SHORT_READY);
  assert.equal(ready.action, 'SHORT');
  assert.equal(ready.observeOnly, false);
  assert.equal(ready.executionEligible, true);
  assert.equal(ready.shortReady, true);
  assert.equal(ready.longReady, false);
  assert.ok(ready.retestSupportLow <= ready.retestSupportHigh);
  assert.ok(ready.shortReboundPct >= 1.5);
  assert.ok(ready.shortReboundAtrMultiple >= 1.25);
  assert.ok(ready.shortFadePct >= 1);
  assert.ok(ready.shortFadeAtrMultiple >= 0.75);
  assert.match(ready.dedupeKey, /\|RETEST_SHORT_READY$/);

  const fastOpenTime = longInput.early.closeTime + 1;
  const shortFast = [
    candle(fastOpenTime, FIVE_MINUTES, {
      open: watch.price * 0.998,
      high: watch.baseNeckline * 1.012,
      low: watch.price * 0.995,
      close: watch.baseNeckline * 1.001,
      volume: 1,
      quoteVolume: 40,
      trades: 4,
    }),
    candle(fastOpenTime + FIVE_MINUTES, FIVE_MINUTES, {
      open: watch.baseNeckline * 1.003,
      high: watch.baseNeckline * 1.005,
      low: watch.baseNeckline * 0.992,
      close: watch.baseNeckline * 0.996,
      volume: 1,
      quoteVolume: 40,
      trades: 4,
    }),
  ];
  const fastReady = detectHtfDeepPumpBaseReject(input.htf, input.rows15m, {
    symbol: 'FASTSHORTUSDT',
    htfInterval,
    now: shortFast.at(-1).closeTime + 1,
    rows5m: shortFast,
  }).at(0);
  assert.ok(fastReady, `${htfInterval} source should support fast 5m SHORT confirmation`);
  assert.equal(fastReady.stage, HTF_DEEP_PUMP_RETEST_SHORT_READY);
  assert.equal(fastReady.htfInterval, htfInterval);
  assert.equal(fastReady.confirmationInterval, '5m');
  assert.equal(fastReady.fastConfirmation, true);
  assert.equal(fastReady.retestBars5mAfterEarly, 2);
  assert.ok(fastReady.shortReboundPct >= 1.5);
}

const standard = fixture('1h');
const liveIgnored = structuredClone(standard);
const liveOpenTime = liveIgnored.rows15m.at(-1).closeTime + 1;
liveIgnored.rows15m.push(candle(liveOpenTime, FIFTEEN_MINUTES, {
  open: NaN,
  high: 10_000,
  low: 1,
  close: 9_000,
  quoteVolume: 1_000_000,
}));
liveIgnored.htf.push(candle(standard.htf.at(-1).closeTime + 1, durationOf('1h'), {
  open: NaN,
  high: 10_000,
  low: 1,
  close: 9_000,
}));
assert.deepEqual(detect(liveIgnored), detect(standard), 'forming HTF/15m rows are ignored completely');

const onlyOneConfirmation = structuredClone(standard);
const shock = onlyOneConfirmation.htf[onlyOneConfirmation.shockIndex];
Object.assign(shock, {
  close: 90.2,
  quoteVolume: 1_000,
});
assert.equal(
  detect(onlyOneConfirmation).length,
  0,
  'true-range alone is insufficient when quote volume and lower wick fail',
);

const twoConfirmations = structuredClone(standard);
twoConfirmations.htf[twoConfirmations.shockIndex].quoteVolume = 1_000;
for (let index = twoConfirmations.shockIndex + 1;
  index <= twoConfirmations.shockIndex + twoConfirmations.baseCount; index += 1) {
  twoConfirmations.htf[index].quoteVolume = 500;
}
const twoConfirmationEvent = detect(twoConfirmations).at(0);
assert.ok(twoConfirmationEvent, 'true-range plus lower wick satisfies the 2-of-3 shock gate');
assert.equal(twoConfirmationEvent.shockConfirmationCount, 2);
assert.equal(twoConfirmationEvent.shockConfirmations.quoteVolume, false);

const loudBase = structuredClone(standard);
for (let index = loudBase.shockIndex + 1;
  index <= loudBase.shockIndex + loudBase.baseCount; index += 1) {
  loudBase.htf[index].quoteVolume = 3_000;
}
assert.equal(detect(loudBase).length, 0, 'base median volume must be at most 70% of shock volume');

const wideBase = structuredClone(standard);
wideBase.htf[wideBase.shockIndex + 2].high = 96;
assert.equal(detect(wideBase).length, 0, 'base range must be at most 45% of the shock leg');

const weakBreakoutVolume = structuredClone(standard);
weakBreakoutVolume.rows15m.at(-1).quoteVolume = 149;
assert.equal(detect(weakBreakoutVolume).length, 0, 'EARLY requires 1.5x median prior-20 quote volume');

const firstClosedBreakout = fixture('1h', { postBarsBeforeEarly: 0 });
assert.equal(
  detect(firstClosedBreakout).at(0)?.stage,
  HTF_DEEP_DUMP_EARLY_WATCH,
  'the completed HTF base supplies the wait; its first closed 15m breakout can raise WATCH',
);

const belowNeckline = structuredClone(standard);
belowNeckline.rows15m.at(-1).close = standard.neckline;
assert.equal(detect(belowNeckline).length, 0, 'EARLY close must be strictly above the base neckline');

const gapped = structuredClone(standard);
gapped.htf.splice(10, 1);
assert.equal(detect(gapped).length, 0, 'gapped HTF history is rejected');

const arrayInput = structuredClone(standard);
const toArray = (bar) => [
  bar.openTime, bar.open, bar.high, bar.low, bar.close, bar.volume,
  bar.closeTime, bar.quoteVolume, bar.trades,
];
arrayInput.htf = arrayInput.htf.map(toArray);
arrayInput.rows15m = arrayInput.rows15m.map(toArray);
assert.equal(detect(arrayInput).at(0)?.stage, HTF_DEEP_DUMP_EARLY_WATCH);

assert.equal(detectHtfDeepDumpBaseReclaim(standard.htf, standard.rows15m, {
  symbol: 'ALLOUSDT',
  htfInterval: '15m',
  now: standard.now,
}).length, 0, 'only 1h and 4h source intervals are accepted');
assert.equal(detectHtfDeepDumpBaseReclaim(standard.htf, standard.rows15m, {
  htfInterval: '1h',
  now: standard.now,
}).length, 0, 'symbol is required for a stable dedupe key');

console.log('HTF deep-base: 1h/4h, FAST/fallback and mandatory SHORT large-rebound sequence passed.');
