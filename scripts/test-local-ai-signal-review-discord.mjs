import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AI_SIGNAL_REVIEW_PASS_RULE,
  BtcExtremeMoveDiscordNotifier,
  LocalAiSignalReviewDiscordNotifier,
  buildAiSignalReviewDiscordPayload,
  buildBtcExtremeMoveDiscordPayload,
  classifyAiSignalReviewPass,
  classifyBtcExtremeMove,
} from '../src/localAiSignalReviewDiscord.js';

const now = Date.UTC(2026, 9, 3, 12);
const ready = (grossPct, extra = {}) => ({
  state: 'READY', grossPct, entry: 100, entryAt: now - 4 * 60 * 60_000,
  exit: 102, exitAt: now, mfePct: 2.5, maePct: 0.4, waitMinutes: 30, ...extra,
});
const passRow = (eventId = 'AAAUSDT|LONG|PRIORITY|1') => ({
  eventId, symbol: eventId.split('|')[0], side: eventId.includes('|SHORT|') ? 'SHORT' : 'LONG',
  verdict: 'PRIORITY', sentAt: now - 4 * 60 * 60_000, strength: 76, strengthBand: '75_84',
  historyQuality: 'SENT_SNAPSHOT', independent4h: true, zoneMid: 99,
  price: { entryLow: 98, entryHigh: 100 }, model: { applied: true },
  market: { regime: 'SW_UP' }, breadth: { state: 'RECOVERY' }, btcAlignment: 'ALIGNED',
  btcReconstructed: { momentum: 'UP', return1hPct: 0.4, return4hPct: 0.8 },
  horizons: { 4: { market: ready(1), zone: ready(1.35) } },
});

const classification = classifyAiSignalReviewPass(passRow());
assert.equal(classification.pass, true);
assert.equal(classification.marketNetPct, 0.88);
assert.equal(classification.zoneNetPct, 1.23);
assert.ok(classification.entryImprovementPct >= AI_SIGNAL_REVIEW_PASS_RULE.minEntryImprovementPct);
assert.equal(classifyAiSignalReviewPass({ ...passRow(), independent4h: false }).pass, false);
assert.equal(classifyAiSignalReviewPass({ ...passRow(), historyQuality: 'LEGACY_NO_SNAPSHOT' }).pass, false);
assert.equal(classifyAiSignalReviewPass({ ...passRow(), horizons: { 4: {
  market: ready(-0.1), zone: ready(0.5),
} } }).checks.directionCorrect, false);
assert.equal(classifyAiSignalReviewPass({ ...passRow(), horizons: { 4: {
  market: ready(1), zone: ready(1.05),
} } }).checks.entryImproved, false);
assert.equal(classifyAiSignalReviewPass({ ...passRow(), horizons: { 4: {
  market: ready(1), zone: ready(1.35, { mfePct: null }),
} } }).checks.followThroughObserved, false);

const payload = buildAiSignalReviewDiscordPayload(passRow(), classification, 'https://example.test');
assert.match(payload.embeds[0].title, /HẬU KIỂM PASS · LONG/);
assert.match(payload.embeds[0].description, /không phải tín hiệu vào lệnh mới/);
assert.match(payload.embeds[0].fields[0].value, /Entry cải thiện/);
assert.equal(payload.embeds[0].color, 0x16c784);
const shortPayload = buildAiSignalReviewDiscordPayload(passRow('BBBUSDT|SHORT|WATCH|2'), classification, 'https://example.test');
assert.equal(shortPayload.embeds[0].color, 0xf43f5e);

const directory = await mkdtemp(join(tmpdir(), 'ai-review-discord-'));
const stateFile = join(directory, 'state.json');
const posted = [];
const notifier = new LocalAiSignalReviewDiscordNotifier({
  stateFile,
  webhookUrl: 'https://discord.com/api/webhooks/123/token',
  baseUrl: 'https://liquidity.example',
  now: () => now,
  fetchImpl: async (_url, options) => { posted.push(JSON.parse(options.body)); return { ok: true, status: 204 }; },
});
const first = await notifier.evaluate({ partial: false, rows: [passRow()] });
assert.equal(first.baselined, 1, 'existing passes must be baselined without a historical flood');
assert.equal(posted.length, 0);
const second = await notifier.evaluate({ partial: false, rows: [passRow(), passRow('BBBUSDT|SHORT|WATCH|2')] });
assert.equal(second.sent, 1);
assert.equal(posted.length, 1);
assert.match(posted[0].embeds[0].title, /BBBUSDT/);
const oneHour = { ...passRow('CCCUSDT|LONG|WATCH|3'), horizons: { 1: {
  market: ready(1), zone: ready(1.35),
} } };
assert.equal((await notifier.evaluate({ partial: false, rows: [passRow(), passRow('BBBUSDT|SHORT|WATCH|2'), oneHour] })).sent, 1);
assert.match(posted.at(-1).embeds[0].description, /HẬU KIỂM 1H/);
const dualHorizon = { ...oneHour, horizons: { ...oneHour.horizons, 4: {
  market: ready(1.2), zone: ready(1.6),
} } };
assert.equal((await notifier.evaluate({ partial: false, rows: [dualHorizon] })).sent, 1,
  'the same signal can pass again at 4h without duplicating its 1h alert');
await notifier.evaluate({ partial: false, rows: [dualHorizon] });
assert.equal(posted.length, 3, 'same event+horizon must not be sent twice');
const state = JSON.parse(await readFile(stateFile, 'utf8'));
assert.equal(state.baselineComplete, true);
assert.equal(state.baselineHorizons[1], true);
assert.equal(state.baselineHorizons[4], true);
assert.equal(state.records['BBBUSDT|SHORT|WATCH|2|4H'].status, 'SENT');
assert.equal(state.records['CCCUSDT|LONG|WATCH|3|1H'].status, 'SENT');
assert.equal(state.records['CCCUSDT|LONG|WATCH|3|4H'].status, 'SENT');
assert.equal(notifier.snapshot().binanceEligible, false);
assert.equal((await notifier.evaluate({ partial: true, rows: [passRow('CCCUSDT|LONG|WATCH|3')] })).reason, 'REPORT_NOT_COMPLETE');
assert.equal(posted.length, 3, 'partial reports must never send');

const neutralHealth = {
  price: 84_000, btcRelativeReturnClosedAt: now,
  btcRelativeReturn15mPct: 0.2, btcRelativeReturn1hPct: 0.4, btcRelativeReturn4hPct: 0.8,
  btcTrendDir: 'up', btcTrendDir4h: 'down', rsi1h: 55, rsi4h: 48, fundingRate: 0.01,
};
assert.equal(classifyBtcExtremeMove(neutralHealth).direction, 'NEUTRAL');
const crash = classifyBtcExtremeMove({
  ...neutralHealth, btcRelativeReturn15mPct: -0.9, btcRelativeReturn1hPct: -1.7,
});
assert.equal(crash.direction, 'DOWN');
assert.equal(crash.level, 1);
const hot = classifyBtcExtremeMove({
  ...neutralHealth, btcRelativeReturn15mPct: 1.2, btcRelativeReturn1hPct: 2.4,
});
assert.equal(hot.direction, 'UP');
assert.equal(hot.level, 2);
assert.equal(classifyBtcExtremeMove({ ...neutralHealth,
  btcRelativeReturn15mPct: -0.1, btcRelativeReturn1hPct: -0.2, btcRelativeReturn4hPct: -3.2,
}).direction, 'DOWN', 'a slow but deep 4h crash must still alert');
assert.match(buildBtcExtremeMoveDiscordPayload(neutralHealth, crash, 'https://example.test').embeds[0].title, /BTC SẬP RẤT SÂU/);
assert.match(buildBtcExtremeMoveDiscordPayload(neutralHealth, hot, 'https://example.test').embeds[0].title, /BTC TĂNG RẤT NÓNG/);

let extremeNow = now;
const extremePosts = [];
const extreme = new BtcExtremeMoveDiscordNotifier({
  stateFile: join(directory, 'btc-extreme.json'),
  webhookUrl: 'https://discord.com/api/webhooks/123/token',
  baseUrl: 'https://liquidity.example',
  now: () => extremeNow,
  fetchImpl: async (_url, options) => { extremePosts.push(JSON.parse(options.body)); return { ok: true, status: 204 }; },
});
assert.equal((await extreme.deliver(neutralHealth)).baseline, true);
assert.equal((await extreme.deliver({ ...neutralHealth, btcRelativeReturnClosedAt: now + 300_000,
  btcRelativeReturn15mPct: -0.9, btcRelativeReturn1hPct: -1.7 })).sent, 1);
assert.equal(extremePosts.length, 1);
extremeNow += 5 * 60_000;
assert.equal((await extreme.deliver({ ...neutralHealth, btcRelativeReturnClosedAt: now + 600_000,
  btcRelativeReturn15mPct: -1.0, btcRelativeReturn1hPct: -1.8 })).sent, 0, 'same level must cool down');
assert.equal((await extreme.deliver({ ...neutralHealth, btcRelativeReturnClosedAt: now + 900_000,
  btcRelativeReturn15mPct: -1.6, btcRelativeReturn1hPct: -3.1 })).sent, 1, 'severity escalation bypasses cooldown');
await extreme.deliver({ ...neutralHealth, btcRelativeReturnClosedAt: now + 1_200_000 });
assert.equal((await extreme.deliver({ ...neutralHealth, btcRelativeReturnClosedAt: now + 1_500_000,
  btcRelativeReturn15mPct: 0.9, btcRelativeReturn1hPct: 1.7 })).sent, 1, 'new extreme after neutral reset sends');
assert.equal(extremePosts.length, 3);
assert.equal(extreme.snapshot().binanceEligible, false);

console.log('AI signal review Discord: review pass plus BTC extreme closed-candle alerts, dedupe and observe-only payload OK');
