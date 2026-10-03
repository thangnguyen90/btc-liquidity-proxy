import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import {
  VERY_STRONG_ENTRY_WATCH_UI_VERSION,
  buildVeryStrongEntryRows,
  deriveVeryStrongBtcContext,
} from '../public/very-strong-entry-watch-model.js';
import {
  VERY_STRONG_TREND_POOL_VERSION,
  evaluateVeryStrongTrendRecord,
  qualifiesVeryStrongTrendSource,
} from '../src/veryStrongTrendPool.js';

const now = Date.UTC(2026, 8, 28, 7, 0, 0);
const candidate = (overrides = {}) => ({
  symbol:'TESTUSDT', side:'SHORT', entryTier:'VERY_STRONG', entryScore:88,
  confirmationAt:now - 60_000, retestAt:now - 20_000, entryPrice:100,
  lastClosed5m:99.5, ...overrides,
});
const health = {
  price:83_000, updatedAt:now - 10_000, btcTrendDir:'down', btcTrendDir4h:'down',
  emaTrend1h:'below', pct6h:-1.2, pct24h:-2,
  btcRelativeReturnClosedAt:now - 300_000,
  btcRelativeReturn15mPct:-.4, btcRelativeReturn1hPct:-.9,
};
const snapshot = {
  marketRegime:{ dataReady:true, allowShortEntry:true, allowLongEntry:false, state:'RISK_OFF', reasons:['breadth down'] },
  veryStrongCandidates:[
    candidate(),
    candidate({ symbol:'LONGUSDT', side:'LONG', confirmationAt:now - 80_000, retestAt:null }),
    candidate({ symbol:'OLDRETESTUSDT', confirmationAt:now - 10 * 60_000, retestAt:now - 5 * 60_000 }),
    candidate({ symbol:'WEAKUSDT', entryTier:'GOOD' }),
    candidate({ symbol:'EXPIREDUSDT', confirmationAt:now - 46 * 60_000 }),
  ],
};

const btc = deriveVeryStrongBtcContext(health, snapshot.marketRegime, now);
assert.equal(btc.key, 'DOWN_STRONG');
assert.equal(btc.allowShortEntry, true);
assert.equal(btc.relativeReturn15mPct, -.4);
assert.equal(btc.relativeReturn1hPct, -.9);
const all = buildVeryStrongEntryRows(snapshot, health, { now });
assert.deepEqual(all.rows.map((row) => row.symbol), ['TESTUSDT','LONGUSDT','OLDRETESTUSDT']);
assert.equal(all.rows[0].context.key, 'CONTEXT_RETEST');
assert.equal(all.rows[1].context.key, 'WAIT_BTC');
assert.equal(all.rows[2].context.key, 'RETEST_EXPIRED');
assert.deepEqual(buildVeryStrongEntryRows(snapshot, health, { now, side:'SHORT', status:'CONTEXT' }).rows.map((row) => row.symbol), ['TESTUSDT']);
const trendPoolSnapshot = {
  ...snapshot,
  veryStrongTrendPool: {
    records: [{
      symbol:'TRENDUSDT', side:'LONG', active:true, score:29.75, entryScore:61,
      confirmationAt:now - 4 * 60 * 60_000, poolExpiresAt:now + 20 * 60 * 60_000,
      livePrice:10, entryDistancePct:0.1, entryZone:{ low:9.95, high:10.05, mid:10, basis:'EMA25 1H' },
      currentFrames:{ '1h':'UP', '4h':'UP' }, originVolumeRatio:2.2,
      currentVolumeRatio15m:1.1, currentVolumeRatio5m:0.8, lastTakerBuyPct:61,
      volumeGood:true, coinTrigger:true, trendReason:'LONG còn cấu trúc.', invalidationPrice:9.5,
    }],
  },
};
const bullishHealth = { ...health, btcTrendDir:'up', btcTrendDir4h:'up', emaTrend1h:'above' };
const bullishSnapshot = {
  ...trendPoolSnapshot,
  marketRegime:{ dataReady:true, allowLongEntry:true, allowShortEntry:false, state:'RECOVERY' },
};
const trendRows = buildVeryStrongEntryRows(bullishSnapshot, bullishHealth, { now });
assert.equal(trendRows.source, 'TREND_POOL');
assert.equal(trendRows.rows[0].context.key, 'READY_BTC_WAVE');
assert.equal(buildVeryStrongEntryRows(trendPoolSnapshot, health, { now }).rows[0].context.key, 'WAIT_BTC_TURN');
assert.equal(VERY_STRONG_ENTRY_WATCH_UI_VERSION, 'VERY_STRONG_ENTRY_WATCH_UI_V2_TREND_POOL_BTC_WAVE_20260928');

assert.equal(qualifiesVeryStrongTrendSource({
  side:'LONG', confirmationAt:now, score:29.75,
  entryTier:'WATCH', entryScoreMetrics:{ breakoutVolumeRatio:1.49 },
}), true, 'trend cực mạnh + volume tốt vẫn được giữ dù Entry Score chưa đạt 80');
assert.equal(qualifiesVeryStrongTrendSource({
  side:'LONG', confirmationAt:now, score:20,
  entryTier:'WATCH', entryScoreMetrics:{ breakoutVolumeRatio:2 },
}), false);

const makeRows = (interval, count, price, volume = 100) => {
  const duration = { '5m':300_000, '15m':900_000, '1h':3_600_000, '4h':14_400_000 }[interval];
  return Array.from({ length:count }, (_, index) => {
    const closeTime = now - (count - index) * duration;
    const close = price * (.9 + index * .001);
    return { open:close * .999, high:close * 1.002, low:close * .998, close,
      quoteVolume:volume, takerBuyQuoteVolume:volume * .6, closeTime };
  });
};
const evaluated = evaluateVeryStrongTrendRecord({
  symbol:'TRENDUSDT', side:'LONG', confirmationAt:now - 60_000, referenceLevel:9.9,
  score:29.75, entryTier:'WATCH', entryScoreMetrics:{ breakoutVolumeRatio:2 },
}, {
  now,
  getKlines: (_symbol, interval) => makeRows(interval, 100, 10),
});
assert.equal(evaluated.active, true);
assert.equal(evaluated.poolVersion, VERY_STRONG_TREND_POOL_VERSION);
assert.ok(evaluated.entryZone?.mid > 0);
assert.ok(Number.isFinite(evaluated.recentMovePct15m));
assert.ok(Number.isFinite(evaluated.recentMovePct1h));

const html = await readFile(new URL('../public/very-strong-entry-watch.html', import.meta.url), 'utf8');
const browser = await readFile(new URL('../public/very-strong-entry-watch.js', import.meta.url), 'utf8');
const scanner = await readFile(new URL('../src/coinLevelEntryWatch.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(html, /Entry rất mạnh theo BTC/);
assert.match(html, /KHÔNG TỰ ĐẶT BINANCE/);
assert.match(browser, /api\/coin-level-entry-watch/);
assert.match(browser, /api\/btc-health/);
assert.match(scanner, /veryStrongCandidates/);
assert.match(scanner, /veryStrongTrendSources/);
assert.match(server, /veryStrongTrendPool/);
assert.match(server, /pathname === '\/very-strong-entry-watch'/);

const publicDirectory = new URL('../public/', import.meta.url);
const missingMenu = [];
for (const name of (await readdir(publicDirectory)).filter((item) => item.endsWith('.html'))) {
  const page = await readFile(new URL(name, publicDirectory), 'utf8');
  if (page.includes('href="/low-supply-market"') && !page.includes('href="/very-strong-entry-watch"')) missingMenu.push(name);
}
assert.deepEqual(missingMenu, [], 'mọi menu có Cung thấp phải có Entry rất mạnh');

console.log('very strong entry watch tests: OK');
