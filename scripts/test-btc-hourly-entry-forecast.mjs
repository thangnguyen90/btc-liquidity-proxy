import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BTC_HOURLY_ENTRY_FORECAST_VERSION,
  buildBtcHourlyEntryForecastSnapshot,
  classifyBtcHourlyEntrySlot,
} from '../src/btcHourlyEntryForecast.js';
import {
  BTC_HOURLY_ENTRY_FORECAST_CARD_VERSION,
  btcHourlyEntryForecastTradeKey,
} from '../public/btc-hourly-entry-forecast-model.js';

const stats = (qualityScore, closed = 20) => ({
  entries: closed,
  closed,
  wins: Math.round(closed * .6),
  losses: Math.round(closed * .4),
  winRate: 60,
  netPnl: 1,
  avgNetPnl: .05,
  avgRoe: 1,
  profitFactor: 1.4,
  qualityScore,
  closedCycles: closed,
});

const thresholds = { baseMinClosed: 12, btcConditionedMinClosed: 6, btcProfileMinClosed: 4,
  minimumScore: 53, minimumEdge: 4 };
const longSlot = classifyBtcHourlyEntrySlot({
  hourRow: { sides: { LONG: stats(61), SHORT: stats(50) } },
  btcRow: { sides: { LONG: stats(65, 8), SHORT: stats(48, 8) } },
  btcProfileRow: { sides: { LONG: stats(72, 5), SHORT: stats(42, 5) } },
  thresholds,
});
assert.equal(longSlot.direction, 'LONG');
assert.equal(longSlot.long.source, 'GIỜ + BTC PROFILE');
assert.equal(longSlot.long.profileEligible, true);
assert.equal(longSlot.affectsBinance, false);

const tooSmall = classifyBtcHourlyEntrySlot({
  hourRow: { sides: { LONG: stats(80, 4), SHORT: stats(20, 4) } },
  thresholds,
});
assert.equal(tooSmall.direction, 'NEUTRAL');

const hourly = Array.from({ length: 24 }, (_, hourVn) => ({
  hourVn,
  sides: { LONG: stats(hourVn === 9 ? 61 : 49), SHORT: stats(hourVn === 10 ? 62 : 48) },
}));
const hourlyByBtcTrend = [{
  hourVn: 9,
  btcTrend: 'UP',
  sides: { LONG: stats(66, 8), SHORT: stats(44, 8) },
}, {
  hourVn: 10,
  btcTrend: 'DOWN',
  sides: { LONG: stats(45, 8), SHORT: stats(68, 8) },
}];
const hourlyByBtcProfile = [{
  hourVn: 9,
  btcTrend: 'UP',
  btcMomentum15m: 'RISING',
  btcMove1h: 'SMALL_MOVE',
  sides: { LONG: stats(72, 5), SHORT: stats(42, 5) },
}];
const snapshot = buildBtcHourlyEntryForecastSnapshot({
  version: BTC_HOURLY_ENTRY_FORECAST_VERSION,
  generatedAt: '2026-10-01T10:00:00+07:00',
  thresholds,
  coverage: { closedEntries: 100, btcMatchedEntries: 90,
    marginSizes: [{ marginUsdt:1, entries:30 }, { marginUsdt:5, entries:70 }] },
  hourly,
  hourlyByBtcTrend,
  hourlyByBtcProfile,
}, {
  now: Date.UTC(2026, 9, 1, 2, 30), // 09:30 VN
  btcHealth: { btcTrendDir: 'up', btcTrendScore: 70, btcTrendDir4h: 'down',
    btcRelativeReturn15mPct:.1, btcRelativeReturn1hPct:.2 },
});
assert.equal(snapshot.ready, true);
assert.equal(snapshot.currentHourVn, 9);
assert.equal(snapshot.current.direction, 'LONG');
assert.equal(snapshot.currentBtc.trend, 'UP');
assert.equal(snapshot.currentBtc.momentum15m, 'RISING');
assert.equal(snapshot.currentBtc.move1h, 'SMALL_MOVE');
assert.equal(snapshot.current.long.source, 'GIỜ + BTC PROFILE');
assert.equal(snapshot.current.selected.profile.closed, 5);
assert.equal(snapshot.current.whitelistKey, 'btc-hourly-forecast:LONG');
assert.deepEqual(snapshot.current.whitelistObservation, {
  version: BTC_HOURLY_ENTRY_FORECAST_CARD_VERSION,
  direction: 'LONG',
});
assert.equal(btcHourlyEntryForecastTradeKey({
  btcHourlyEntryForecastObservation: snapshot.current.whitelistObservation,
}), snapshot.current.whitelistKey);
assert.equal(snapshot.observationOnly, true);
assert.equal(snapshot.affectsBinance, false);
assert(snapshot.nextSlots.some((slot) => slot.hourVn === 10 && slot.direction === 'SHORT'));
assert(snapshot.bestByBtcTrend.LONG.some((slot) => (
  slot.hourVn === 9 && slot.direction === 'LONG' && slot.btcTrend === 'UP' && slot.closed === 8
)));
assert(snapshot.bestByBtcTrend.SHORT.some((slot) => (
  slot.hourVn === 10 && slot.direction === 'SHORT' && slot.btcTrend === 'DOWN' && slot.closed === 8
)));
const legacySnapshot = buildBtcHourlyEntryForecastSnapshot({
  version:'BTC_HOURLY_ENTRY_FORECAST_V1_DAILY_CAUSAL_20261001',
  generatedAt:'2026-10-01T09:00:00+07:00', thresholds, hourly, hourlyByBtcTrend,
}, { now:Date.UTC(2026, 9, 1, 2, 30), btcHealth:{ btcTrendDir:'up' } });
assert.equal(legacySnapshot.ready, true, 'V1 cache remains readable and falls back without BTC profile rows');
assert.equal(legacySnapshot.current.long.profileEligible, false);

const [html, ui, analyzer] = await Promise.all([
  readFile(new URL('../public/local-ai-trend-evaluation.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/local-ai-trend-evaluation.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/analyze-margin5-entry-btc.py', import.meta.url), 'utf8'),
]);
assert(html.includes('btc-hourly-forecast'));
assert(html.includes('id="hourly-btc-guidance"'));
assert(ui.includes('renderHourlyEntryForecast'));
assert(ui.includes('renderHourlyBtcGuidance'));
assert(ui.includes("new Set(['PRIORITY', 'WATCH'])"));
assert(ui.includes('current.whitelistKey'));
assert(ui.includes('WAIT/AVOID không được gọi là điểm vào'));
assert(ui.includes('OBSERVE ONLY'));
assert(html.includes('MỌI SIZE LỆNH BOT'));
assert(ui.includes('profileEligible'));
assert(ui.includes('entry mọi size bot đã đóng'));
assert(ui.includes('Giờ tốt ${side} theo BTC'));
assert(analyzer.includes('ALL_BOT_SIZE_ENTRY_TIME_BTC_AUDIT_V2_20261001'));
assert(analyzer.includes('hourlyByBtcProfile=hourly_btc_profile'));
assert(!analyzer.includes("number(r['margin_usdt']) == 5"));

console.log('BTC hourly entry forecast tests: OK');
