import assert from 'node:assert/strict';
import {
  POST_DUMP_NO_SELL_STAGE,
  evaluatePostDumpNoSellWatch,
} from '../src/postDumpNoSellWatch.js';

const baseAt = Date.UTC(2026, 8, 26, 0, 0, 0);

function candle({ openTime, duration, open, high, low, close, quoteVolume, takerBuyPct }) {
  return {
    openTime,
    closeTime: openTime + duration - 1,
    open,
    high,
    low,
    close,
    quoteVolume,
    takerBuyQuoteVolume: quoteVolume * takerBuyPct / 100,
  };
}

function rows15m({ withDump = true } = {}) {
  const duration = 15 * 60_000;
  const rows = [];
  for (let index = 0; index < 100; index += 1) {
    let open = index < 75 ? 100 : 94;
    let close = open + (index % 2 ? 0.1 : -0.1);
    let high = Math.max(open, close) + 0.25;
    let low = Math.min(open, close) - 0.25;
    let quoteVolume = 1_000_000;
    if (withDump && index === 75) {
      open = 99;
      high = 99.5;
      low = 88;
      close = 94;
      quoteVolume = 4_000_000;
    }
    rows.push(candle({
      openTime: baseAt + index * duration,
      duration,
      open,
      high,
      low,
      close,
      quoteVolume,
      takerBuyPct: 45,
    }));
  }
  return rows;
}

function base5m() {
  const duration = 5 * 60_000;
  const start = baseAt + 76 * 15 * 60_000;
  return Array.from({ length: 45 }, (_, index) => {
    const close = index % 2 ? 94.5 : 94.0;
    const open = index % 2 ? 94.0 : 94.5;
    return candle({
      openTime: start + index * duration,
      duration,
      open,
      high: 94.65,
      low: 93.85,
      close,
      quoteVolume: 1_000_000,
      takerBuyPct: 48,
    });
  });
}

function buyImpulse(openTime, close = 95.7) {
  return candle({
    openTime,
    duration: 5 * 60_000,
    open: 94.2,
    high: close + 0.2,
    low: 94.1,
    close,
    quoteVolume: 4_000_000,
    takerBuyPct: 70,
  });
}

function weakFollow(openTime, index) {
  return candle({
    openTime,
    duration: 5 * 60_000,
    open: index ? 95.8 : 95.7,
    high: index ? 96.1 : 96.0,
    low: index ? 95.5 : 95.4,
    close: index ? 95.9 : 95.8,
    quoteVolume: index ? 1_200_000 : 1_500_000,
    takerBuyPct: index ? 62 : 60,
  });
}

const fiveMinute = base5m();
fiveMinute.push(buyImpulse(fiveMinute.at(-1).closeTime + 1));
const stageOne = evaluatePostDumpNoSellWatch({
  symbol: 'TESTUSDT', rows5m: fiveMinute, rows15m: rows15m(),
});
assert.equal(stageOne.reason, 'ACCEPTED');
assert.equal(stageOne.watch.stage, POST_DUMP_NO_SELL_STAGE.BUY_IMPULSE);
assert.equal(stageOne.watch.watchOnly, true);
assert.equal(stageOne.watch.binanceEligible, false);
assert.equal(stageOne.watch.executionCandidate, true);

const confirmedRows = [...fiveMinute];
confirmedRows.push(weakFollow(confirmedRows.at(-1).closeTime + 1, 0));
confirmedRows.push(weakFollow(confirmedRows.at(-1).closeTime + 1, 1));
const stageTwo = evaluatePostDumpNoSellWatch({
  symbol: 'TESTUSDT', rows5m: confirmedRows, rows15m: rows15m(),
});
assert.equal(stageTwo.reason, 'ACCEPTED');
assert.equal(stageTwo.watch.stage, POST_DUMP_NO_SELL_STAGE.NO_SELL_CONFIRMATION);
assert.equal(stageTwo.watch.executionCandidate, false);
assert.ok(stageTwo.watch.followVolumeRatio <= 0.6);
assert.ok(stageTwo.watch.followTakerSellPct <= 45);

const sellReturnRows = [...fiveMinute];
sellReturnRows.push(candle({
  openTime: sellReturnRows.at(-1).closeTime + 1,
  duration: 5 * 60_000,
  open: 95.7,
  high: 95.8,
  low: 94.0,
  close: 94.2,
  quoteVolume: 3_500_000,
  takerBuyPct: 30,
}));
sellReturnRows.push(candle({
  openTime: sellReturnRows.at(-1).closeTime + 1,
  duration: 5 * 60_000,
  open: 94.2,
  high: 94.4,
  low: 93.8,
  close: 94.0,
  quoteVolume: 3_000_000,
  takerBuyPct: 32,
}));
const sellReturn = evaluatePostDumpNoSellWatch({
  symbol: 'TESTUSDT', rows5m: sellReturnRows, rows15m: rows15m(),
});
assert.equal(sellReturn.watch, null);
assert.ok(['SELL_FORCE_NOT_WEAK', 'BASE_LOST'].includes(sellReturn.reason));

const noDump = evaluatePostDumpNoSellWatch({
  symbol: 'TESTUSDT', rows5m: fiveMinute, rows15m: rows15m({ withDump: false }),
});
assert.equal(noDump.watch, null);
assert.equal(noDump.reason, 'NO_RECENT_DUMP');

const overextendedRows = base5m();
overextendedRows.push(buyImpulse(overextendedRows.at(-1).closeTime + 1, 100));
const overextended = evaluatePostDumpNoSellWatch({
  symbol: 'TESTUSDT', rows5m: overextendedRows, rows15m: rows15m(),
});
assert.equal(overextended.reason, 'ACCEPTED');
assert.equal(overextended.watch.stage, POST_DUMP_NO_SELL_STAGE.LATE_NO_CHASE);
assert.equal(overextended.watch.binanceEligible, false);
assert.equal(overextended.watch.executionCandidate, false);

console.log('post-dump no-sell watch tests passed');
