import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LocalAiTrendDiscordNotifier,
  buildLocalAiBtcForecastDiscordPayload,
  buildLocalAiTrendDiscordPayload,
  localAiTrendStrengthBand,
  classifyLocalAiBtcForecast,
  classifyLocalAiBtcSuddenDirection,
  isLocalAiBtcRecovery,
} from '../src/localAiTrendDiscord.js';

const evaluation = {
  evaluatedAt: 1_789_000_000_000,
  inputGeneratedAt: 1_788_999_900_000,
  marketRegime: 'SW_UP',
  marketBias: 'LONG_BIAS',
  marketScore: 72,
  btc: { trend1h: 'UP', trend4h: 'UP', return15mPct: 0.31 },
  breadth: { state: 'RECOVERY', shockLabel: null },
  candidates: [
    {
      symbol: 'AAAUSDT', side: 'LONG', verdict: 'PRIORITY', strength: 78,
      path: 'RETEST', horizon: '15m-1h', reasons: ['Vùng retest còn hiệu lực'], risks: ['BTC có thể đổi hướng'],
      qualification: { passed: true, passedCount: 6, totalCount: 6, missing: [] },
      deterministic: {
        closedAt: 1_788_999_840_000, livePrice: 1.01, livePriceSource: 'MARK_SOCKET_1S',
        entryZone: { low: 1, high: 1.02, mid: 1.01 }, invalidationPrice: 0.97,
      },
    },
    {
      symbol: 'BBBUSDT', side: 'SHORT', verdict: 'WATCH', strength: 64,
      path: 'CONTINUATION', horizon: '1h-4h', reasons: ['Xu hướng giảm còn giữ'], risks: ['Chưa đủ 6 điều kiện'],
      qualification: { passed: false, passedCount: 4, totalCount: 6, missing: ['AI chưa xếp PRIORITY'] },
      deterministic: {
        closedAt: 1_788_999_780_000, livePrice: 2.03, livePriceSource: 'MARK_SOCKET_1S',
        entryZone: { low: 2, high: 2.04, mid: 2.02 }, invalidationPrice: 2.1,
      },
    },
    {
      symbol: 'BOUNDARYUSDT', side: 'LONG', verdict: 'PRIORITY', strength: 65,
      path: 'RETEST', horizon: '15m', reasons: ['Đúng biên 65'], risks: [],
      qualification: { passed: true, passedCount: 6, totalCount: 6, missing: [] },
      deterministic: {
        closedAt: 1_788_999_720_000, livePrice: 3.01, livePriceSource: 'MARK_SOCKET_1S',
        entryZone: { low: 3, high: 3.02, mid: 3.01 }, invalidationPrice: 2.9,
      },
    },
  ],
};

const priorityPayload = buildLocalAiTrendDiscordPayload(evaluation, evaluation.candidates[0], 'http://127.0.0.1:19082');
const watchPayload = buildLocalAiTrendDiscordPayload(evaluation, evaluation.candidates[1], 'http://127.0.0.1:19082');
assert.equal(priorityPayload.embeds[0].color, 0x16c784);
assert.equal(watchPayload.embeds[0].color, 0xf43f5e);
assert.match(priorityPayload.embeds[0].title, /^🟢/);
assert.match(watchPayload.embeds[0].title, /^🔴/);
assert.match(priorityPayload.embeds[0].title, /ƯU TIÊN/);
assert.match(watchPayload.embeds[0].title, /THEO DÕI/);
assert.match(priorityPayload.embeds[0].description, /OBSERVE ONLY/);
const fallbackPayload = buildLocalAiTrendDiscordPayload({
  ...evaluation,
  deterministicFallback:true,
  fallback:{ active:true, binanceEligible:false },
}, evaluation.candidates[0], 'http://127.0.0.1:19082');
assert.match(fallbackPayload.embeds[0].title, /ENGINE FALLBACK ƯU TIÊN/);
assert.match(fallbackPayload.embeds[0].description, /không cấp quyền vào Binance/i);
assert.match(fallbackPayload.embeds[0].footer.text, /ENGINE FALLBACK/);
const forecast = classifyLocalAiBtcForecast(evaluation);
assert.equal(forecast.direction, 'SW_UP');
assert.equal(forecast.clarity, 72);
const forecastPayload = buildLocalAiBtcForecastDiscordPayload(
  evaluation,
  forecast,
  'http://127.0.0.1:19082',
);
assert.equal(forecastPayload.embeds[0].color, 0x2dd4bf);
assert.match(forecastPayload.embeds[0].title, /ĐI NGANG THIÊN TĂNG/);
assert.match(forecastPayload.embeds[0].description, /không phải xác suất/i);

assert.equal(classifyLocalAiBtcSuddenDirection({
  btcRelativeReturnClosedAt: 10,
  btcRelativeReturn15mPct: 0.3,
  btcRelativeReturn1hPct: 0.6,
}).direction, 'UP');
assert.equal(classifyLocalAiBtcSuddenDirection({
  btcRelativeReturnClosedAt: 20,
  btcRelativeReturn15mPct: -0.3,
  btcRelativeReturn1hPct: -0.6,
}).direction, 'DOWN');
assert.equal(isLocalAiBtcRecovery('DOWN', {
  direction: 'NEUTRAL', return15mPct: -0.14, return1hPct: -0.3,
}), true);
assert.equal(isLocalAiBtcRecovery('DOWN', {
  direction: 'NEUTRAL', return15mPct: -0.2, return1hPct: -0.4,
}), false);

const directory = await mkdtemp(join(tmpdir(), 'local-ai-trend-discord-'));
const historyFile = join(directory, 'history.ndjson');
const requests = [];
let now = 1_789_000_000_000;
const notifier = new LocalAiTrendDiscordNotifier({
  stateFile: join(directory, 'state.json'),
  historyFile,
  webhookUrl: 'https://discord.com/api/webhooks/123/token',
  baseUrl: 'http://127.0.0.1:19082',
  now: () => now,
  fetchImpl: async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return { ok: true, status: 204, json: async () => ({}) };
  },
});

const first = await notifier.deliverEvaluation(evaluation);
assert.equal(first.candidates, 3);
assert.equal(first.sent, 3);
assert.equal(first.forecastSent, 1);
assert.equal(first.forecast, 'SW_UP');
assert.equal(requests.length, 4);
assert.equal(requests.some((payload) => payload.embeds?.[0]?.title?.includes('BOUNDARYUSDT')), true,
  'độ rõ đúng 65 vẫn phải gửi khi gate Discord đã tắt');
assert.equal(requests.some((payload) => payload.embeds?.[0]?.title?.includes('BBBUSDT')), true,
  'độ rõ dưới 65 vẫn phải gửi khi gate Discord đã tắt');
assert.equal(notifier.snapshot().candidateStrengthRule, 'OFF');
assert.equal(localAiTrendStrengthBand(49.9), '00_49');
assert.equal(localAiTrendStrengthBand(50), '50_64');
assert.equal(localAiTrendStrengthBand(65), '65_74');
assert.equal(localAiTrendStrengthBand(75), '75_84');
assert.equal(localAiTrendStrengthBand(85), '85_100');
assert.equal(localAiTrendStrengthBand(null), 'UNKNOWN');
const historyRows = (await readFile(historyFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
assert.equal(historyRows.length, 3);
assert.deepEqual(historyRows.map((row) => row.strengthBand), ['75_84', '65_74', '50_64']);
assert.equal(historyRows[0].price.live, 1.01);
assert.equal(historyRows[0].market.regime, 'SW_UP');
assert.equal(historyRows[0].btc.trend1h, 'UP');
const duplicate = await notifier.deliverEvaluation(evaluation);
assert.equal(duplicate.sent, 0);
assert.equal(duplicate.forecastSent, 0);
assert.equal(requests.length, 4);
assert.equal((await readFile(historyFile, 'utf8')).trim().split('\n').length, 3);
const originalSample = JSON.stringify(notifier.state.records[historyRows[0].eventId].sample);
await notifier.deliverEvaluation({ ...evaluation, candidates: [{ ...evaluation.candidates[0], strength: 12 }] });
assert.equal(JSON.stringify(notifier.state.records[historyRows[0].eventId].sample), originalSample,
  'duplicate evaluations must preserve the original sent snapshot');

const neutralHealth = {
  price: 84_000, btcRelativeReturnClosedAt: 100,
  btcRelativeReturn15mPct: 0.01, btcRelativeReturn1hPct: 0.03,
  btcTrendDir: 'mixed', btcTrendDir4h: 'down', rsi1h: 50, rsi4h: 48, fundingRate: 0.01,
};
const baseline = await notifier.deliverBtcHealth(neutralHealth);
assert.equal(baseline.baseline, true);
assert.equal(baseline.sent, 0);

now += 60_000;
const up = await notifier.deliverBtcHealth({
  ...neutralHealth, btcRelativeReturnClosedAt: 200,
  btcRelativeReturn15mPct: 0.31, btcRelativeReturn1hPct: 0.62,
});
assert.equal(up.direction, 'UP');
assert.equal(up.sent, 1);
assert.equal(requests.at(-1).embeds[0].color, 0x16c784);

now += 60_000;
const coolingButStillElevated = await notifier.deliverBtcHealth({
  ...neutralHealth, btcRelativeReturnClosedAt: 225,
  btcRelativeReturn15mPct: 0.2, btcRelativeReturn1hPct: 0.4,
});
assert.equal(coolingButStillElevated.sent, 0);
assert.equal(coolingButStillElevated.direction, 'UP');
assert.equal(coolingButStillElevated.observedDirection, 'NEUTRAL');
assert.equal(coolingButStillElevated.holdingStrongState, true);

now += 60_000;
const stoppedUp = await notifier.deliverBtcHealth({
  ...neutralHealth, btcRelativeReturnClosedAt: 250,
});
assert.equal(stoppedUp.direction, 'NEUTRAL');
assert.equal(stoppedUp.previousDirection, 'UP');
assert.equal(stoppedUp.recovery, true);
assert.equal(stoppedUp.sent, 1);
assert.equal(requests.at(-1).embeds[0].color, 0x38bdf8);
assert.match(requests.at(-1).embeds[0].title, /DỪNG TĂNG MẠNH/);

now += 16 * 60_000;
const down = await notifier.deliverBtcHealth({
  ...neutralHealth, btcRelativeReturnClosedAt: 300,
  btcRelativeReturn15mPct: -0.34, btcRelativeReturn1hPct: -0.71,
});
assert.equal(down.direction, 'DOWN');
assert.equal(down.sent, 1);
assert.equal(requests.at(-1).embeds[0].color, 0xf43f5e);

now += 60_000;
const stoppedDown = await notifier.deliverBtcHealth({
  ...neutralHealth, btcRelativeReturnClosedAt: 350,
});
assert.equal(stoppedDown.direction, 'NEUTRAL');
assert.equal(stoppedDown.previousDirection, 'DOWN');
assert.equal(stoppedDown.recovery, true);
assert.equal(stoppedDown.sent, 1);
assert.equal(requests.at(-1).embeds[0].color, 0x38bdf8);
assert.match(requests.at(-1).embeds[0].title, /DỪNG GIẢM MẠNH/);

console.log('local AI trend Discord tests: OK');
