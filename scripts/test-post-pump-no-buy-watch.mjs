import assert from 'node:assert/strict';
import {
  POST_PUMP_NO_BUY_STAGE,
  evaluatePostPumpNoBuyWatch,
} from '../src/postPumpNoBuyWatch.js';

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

function rows15m({ withPump = true } = {}) {
  const duration = 15 * 60_000;
  const rows = [];
  for (let index = 0; index < 100; index += 1) {
    let open = index < 75 ? 100 : 106;
    let close = open + (index % 2 ? 0.1 : -0.1);
    let high = Math.max(open, close) + 0.25;
    let low = Math.min(open, close) - 0.25;
    let quoteVolume = 1_000_000;
    if (withPump && index === 75) {
      open = 101;
      high = 112;
      low = 100.5;
      close = 106;
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
      takerBuyPct: 55,
    }));
  }
  return rows;
}

function base5m() {
  const duration = 5 * 60_000;
  const start = baseAt + 76 * 15 * 60_000;
  return Array.from({ length: 45 }, (_, index) => {
    const close = index % 2 ? 106.2 : 105.7;
    const open = index % 2 ? 105.7 : 106.2;
    return candle({
      openTime: start + index * duration,
      duration,
      open,
      high: 106.35,
      low: 105.55,
      close,
      quoteVolume: 1_000_000,
      takerBuyPct: 52,
    });
  });
}

function sellImpulse(openTime, close = 104.5) {
  return candle({
    openTime,
    duration: 5 * 60_000,
    open: 106,
    high: 106.1,
    low: close - 0.2,
    close,
    quoteVolume: 4_000_000,
    takerBuyPct: 30,
  });
}

function weakFollow(openTime, index) {
  return candle({
    openTime,
    duration: 5 * 60_000,
    open: index ? 104.4 : 104.5,
    high: index ? 104.6 : 104.8,
    low: index ? 104.0 : 104.2,
    close: index ? 104.1 : 104.4,
    quoteVolume: index ? 1_200_000 : 1_500_000,
    takerBuyPct: index ? 38 : 40,
  });
}

const fiveMinute = base5m();
const impulseAt = fiveMinute.at(-1).closeTime + 1;
fiveMinute.push(sellImpulse(impulseAt));

const stageOne = evaluatePostPumpNoBuyWatch({
  symbol: 'TESTUSDT',
  rows5m: fiveMinute,
  rows15m: rows15m(),
});
assert.equal(stageOne.reason, 'ACCEPTED');
assert.equal(stageOne.watch.stage, POST_PUMP_NO_BUY_STAGE.SELL_IMPULSE);
assert.equal(stageOne.watch.watchOnly, true);
assert.equal(stageOne.watch.binanceEligible, false);
assert.equal(stageOne.watch.executionCandidate, false);

const confirmedRows = [...fiveMinute];
confirmedRows.push(weakFollow(confirmedRows.at(-1).closeTime + 1, 0));
confirmedRows.push(weakFollow(confirmedRows.at(-1).closeTime + 1, 1));
const stageTwo = evaluatePostPumpNoBuyWatch({
  symbol: 'TESTUSDT',
  rows5m: confirmedRows,
  rows15m: rows15m(),
});
assert.equal(stageTwo.reason, 'ACCEPTED');
assert.equal(stageTwo.watch.stage, POST_PUMP_NO_BUY_STAGE.NO_BUY_CONFIRMATION);
assert.equal(stageTwo.watch.executionCandidate, true);
assert.equal(stageTwo.watch.followBars, 2);
assert.ok(stageTwo.watch.followVolumeRatio <= 0.6);
assert.ok(stageTwo.watch.followTakerBuyPct <= 45);

const reboundRows = [...fiveMinute];
reboundRows.push(candle({
  openTime: reboundRows.at(-1).closeTime + 1,
  duration: 5 * 60_000,
  open: 104.5,
  high: 106.2,
  low: 104.4,
  close: 105.9,
  quoteVolume: 3_500_000,
  takerBuyPct: 70,
}));
reboundRows.push(candle({
  openTime: reboundRows.at(-1).closeTime + 1,
  duration: 5 * 60_000,
  open: 105.9,
  high: 106.3,
  low: 105.7,
  close: 106.1,
  quoteVolume: 3_000_000,
  takerBuyPct: 68,
}));
const rebound = evaluatePostPumpNoBuyWatch({
  symbol: 'TESTUSDT',
  rows5m: reboundRows,
  rows15m: rows15m(),
});
assert.equal(rebound.watch, null);
assert.ok(['BUY_FORCE_NOT_WEAK', 'BASE_RECLAIMED'].includes(rebound.reason));

const noPump = evaluatePostPumpNoBuyWatch({
  symbol: 'TESTUSDT',
  rows5m: fiveMinute,
  rows15m: rows15m({ withPump: false }),
});
assert.equal(noPump.watch, null);
assert.equal(noPump.reason, 'NO_RECENT_PUMP');

const overextendedRows = base5m();
overextendedRows.push(sellImpulse(overextendedRows.at(-1).closeTime + 1, 99.9));
const overextended = evaluatePostPumpNoBuyWatch({
  symbol: 'TESTUSDT',
  rows5m: overextendedRows,
  rows15m: rows15m(),
});
assert.equal(overextended.reason, 'ACCEPTED');
assert.equal(overextended.watch.stage, POST_PUMP_NO_BUY_STAGE.LATE_NO_CHASE);
assert.equal(overextended.watch.binanceEligible, false);
assert.equal(overextended.watch.executionCandidate, false);

console.log('post-pump no-buy watch tests passed');
