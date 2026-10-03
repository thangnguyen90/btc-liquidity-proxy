import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BTC_RELATIVE_STRENGTH_UI_VERSION,
  buildBtcRelativeStrengthRows,
} from '../public/btc-relative-strength-model.js';
import { analyzeBtcDowntrendPullback5m } from '../src/btcRelativeBtcPullback.js';

const now = Date.UTC(2026, 8, 28, 8, 0, 0);
const record = (overrides = {}) => ({
  symbol:'ONDOUSDT', side:'LONG', active:true, confirmationAt:now - 2 * 60 * 60_000,
  lastClosed5mAt:now - 30_000,
  poolExpiresAt:now + 22 * 60 * 60_000, currentTrendScore:24,
  currentFrames:{ '5m':'MIXED', '15m':'UP', '1h':'UP', '4h':'UP' },
  originVolumeRatio:7.57, currentVolumeRatio15m:.99, currentVolumeRatio5m:1.7,
  recentMovePct15m:.55, recentMovePct1h:1.1,
  entryDistancePct:.83, livePrice:.5712, entryZone:{ low:.5647, high:.5683, mid:.5665 },
  coinTrigger:false, ...overrides,
});
const snapshot = {
  marketRegime:{ dataReady:true, allowLongEntry:false, allowShortEntry:true, state:'RISK_OFF' },
  veryStrongTrendPool:{ records:[
    record(),
    record({ symbol:'READYUSDT', coinTrigger:true, entryDistancePct:.2, livePrice:.5668 }),
    record({ symbol:'BROKENUSDT', currentFrames:{ '15m':'DOWN', '1h':'DOWN', '4h':'UP' }, currentTrendScore:4 }),
    record({ symbol:'WEAKUSDT', side:'SHORT', currentTrendScore:-22,
      currentFrames:{ '5m':'MIXED', '15m':'DOWN', '1h':'DOWN', '4h':'DOWN' },
      entryDistancePct:-.4, livePrice:.566, coinTrigger:true }),
  ] },
};
const btcDown = {
  updatedAt:now - 5_000, price:83_400, btcTrendDir:'down', btcTrendDir4h:'down',
  emaTrend1h:'below', pct6h:-1.5, btcRelativeReturnClosedAt:now - 30_000,
  btcRelativeReturn15mPct:-.3, btcRelativeReturn1hPct:-.8,
};
const btcUp = { ...btcDown, btcTrendDir:'up', btcTrendDir4h:'up', emaTrend1h:'above', pct6h:1.2 };
const btcDownPullback = {
  ...btcDown,
  btcPullback5m:{ active:true, closedAt:now - 30_000, movePct:.18, priorMovePct:-.34,
    volumeRatio:1.1, takerBuyPct:58 },
};

const strong = buildBtcRelativeStrengthRows(snapshot, btcDown, { now, tab:'STRONG_WHILE_BTC_DOWN' });
assert.deepEqual(strong.rows.map((row) => row.symbol), ['READYUSDT','ONDOUSDT']);
assert.equal(strong.rows[0].relative.key, 'RELATIVE_ENTRY_READY');
assert.equal(strong.rows[1].relative.key, 'WAIT_5M_CONFIRM');
assert.ok(strong.rows[1].relativeScore >= 65,
  'ranking still reflects trend/volume/alpha but is not presented as win probability');
assert.equal(strong.btc.allowLongEntry, false, 'fixture proves Market Regime is risk-off');
assert.equal(strong.rows[0].relative.contextActive, true, 'observe-only relative context ignores allowLongEntry gate');
assert.deepEqual(buildBtcRelativeStrengthRows(snapshot, btcDown, {
  now, tab:'STRONG_WHILE_BTC_DOWN', status:'READY',
}).rows.map((row) => row.symbol), ['READYUSDT']);
const btcDownLean = { ...btcDown, btcTrendDir4h:'up' };
assert.equal(buildBtcRelativeStrengthRows(snapshot, btcDownLean, {
  now, tab:'STRONG_WHILE_BTC_DOWN', status:'READY',
}).rows.length, 0, 'LONG no longer treats DOWN_LEAN as an execution context');
const weakAlpha = buildBtcRelativeStrengthRows({
  ...snapshot,
  veryStrongTrendPool:{ records:[record({
    symbol:'NOALPHAUSDT', coinTrigger:true, livePrice:.5668,
    recentMovePct15m:-.1, recentMovePct1h:-.4,
  })] },
}, btcDown, { now, tab:'STRONG_WHILE_BTC_DOWN' });
assert.equal(weakAlpha.rows[0].relative.key, 'WAIT_BTC_OPPOSITE');
assert.match(weakAlpha.rows[0].relative.detail, /Chưa đủ alpha/);
const outsideZone = buildBtcRelativeStrengthRows({
  ...snapshot,
  veryStrongTrendPool:{ records:[record({ symbol:'NEARUSDT', coinTrigger:true })] },
}, btcDown, { now, tab:'STRONG_WHILE_BTC_DOWN' });
assert.equal(outsideZone.rows[0].relative.key, 'WAIT_5M_CONFIRM');
assert.equal(outsideZone.rows[0].relative.inZone, false);
assert.match(outsideZone.rows[0].relative.label, /CHỜ VÀO ĐÚNG VÙNG/);

const weak = buildBtcRelativeStrengthRows(snapshot, btcUp, { now, tab:'WEAK_WHILE_BTC_UP' });
assert.deepEqual(weak.rows.map((row) => row.symbol), ['WEAKUSDT']);
assert.equal(weak.rows[0].relative.key, 'RELATIVE_ENTRY_READY');
assert.equal(weak.rows[0].directionalDistancePct, .4);
assert.equal(weak.observeOnly, false);
assert.equal(weak.binanceEligible, true);
assert.equal(weak.rows[0].binanceEligible, true);
const pullbackShortSnapshot = {
  ...snapshot,
  veryStrongTrendPool:{ records:[record({
    symbol:'PULLBACKSHORTUSDT', side:'SHORT', currentTrendScore:-24,
    currentFrames:{ '5m':'DOWN', '15m':'DOWN', '1h':'DOWN', '4h':'DOWN' },
    entryDistancePct:-.3, livePrice:.566, coinTrigger:true, last5mMovePct:-.31,
    currentVolumeRatio5m:1.25, currentVolumeRatio15m:.9, lastTakerBuyPct:39,
  })] },
};
const pullbackShort = buildBtcRelativeStrengthRows(pullbackShortSnapshot, btcDownPullback, {
  now, tab:'WEAK_WHILE_BTC_UP',
});
assert.equal(pullbackShort.rows[0].relative.key, 'RELATIVE_ENTRY_READY');
assert.equal(pullbackShort.rows[0].relative.contextMode, 'BTC_DOWNTREND_PULLBACK_SHORT');
assert.ok(pullbackShort.rows[0].relative.relativeMovePct >= .49);
const weakVolume = buildBtcRelativeStrengthRows({
  ...pullbackShortSnapshot,
  veryStrongTrendPool:{ records:[{
    ...pullbackShortSnapshot.veryStrongTrendPool.records[0], currentVolumeRatio5m:.8,
  }] },
}, btcDownPullback, { now, tab:'WEAK_WHILE_BTC_UP' });
assert.equal(weakVolume.rows[0].relative.key, 'WAIT_BTC_OPPOSITE');

const btcRows = Array.from({ length:30 }, (_, index) => ({
  open:100, high:100.1, low:99.9, close:100, quoteVolume:100,
  takerBuyQuoteVolume:52, closeTime:now - (30 - index) * 300_000,
}));
Object.assign(btcRows[26], { open:100, high:100.02, low:99.86, close:99.9 });
Object.assign(btcRows[27], { open:99.9, high:99.92, low:99.75, close:99.8 });
Object.assign(btcRows[28], { open:99.8, high:99.82, low:99.65, close:99.7 });
Object.assign(btcRows[29], {
  open:99.7, high:99.95, low:99.68, close:99.9, quoteVolume:120,
  takerBuyQuoteVolume:72, closeTime:now - 30_000,
});
const pullback = analyzeBtcDowntrendPullback5m(btcRows, now);
assert.equal(pullback.active, true);
assert.ok(pullback.movePct >= .19 && pullback.movePct <= .21);
assert.ok(pullback.priorMovePct <= -.29);
assert.equal(BTC_RELATIVE_STRENGTH_UI_VERSION, 'BTC_RELATIVE_STRENGTH_WATCH_V5_CAUSAL_ALPHA_ONE_ZONE_20260929');

const html = await readFile(new URL('../public/btc-relative-strength-watch.html', import.meta.url), 'utf8');
const browser = await readFile(new URL('../public/btc-relative-strength-watch.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(html, /Coin mạnh khi BTC giảm/);
assert.match(html, /Coin yếu khi BTC tăng \/ hồi trong downtrend/);
assert.match(html, /yếu hơn BTC ≥0,25 điểm %/);
assert.match(html, /coin hơn BTC tối thiểu 0,25 điểm %\/15m/);
assert.match(html, /Mỗi setup nguồn chỉ được xét Binance một lần/);
assert.match(html, /READY MỚI XÉT BINANCE 2 USDT/);
assert.match(html, /không đặt SL gốc/i);
assert.match(browser, /btcRelativeStrengthBinanceExecution/);
assert.match(browser, /api\/coin-level-entry-watch/);
assert.match(browser, /api\/btc-health/);
assert.match(server, /pathname === '\/btc-relative-strength-watch'/);

console.log('btc relative strength watch tests: OK');
