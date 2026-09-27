import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  PostDumpNoSellDiscordNotifier,
  postDumpNoSellDiscordPayload,
} from '../src/postDumpNoSellDiscord.js';
import { POST_DUMP_NO_SELL_STAGE } from '../src/postDumpNoSellWatch.js';

const directory = await mkdtemp(join(tmpdir(), 'post-dump-no-sell-discord-'));
try {
  let clock = Date.UTC(2026, 8, 26, 12, 0, 0);
  const requests = [];
  const notifier = new PostDumpNoSellDiscordNotifier({
    stateFile: join(directory, 'state.json'),
    webhookUrl: () => 'https://discord.com/api/webhooks/123/token',
    now: () => clock,
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, status: 204 };
    },
  });
  assert.equal(notifier.configured(), true);

  clock += 60_000;
  const common = {
    symbol: 'LONGUSDT',
    side: 'LONG',
    watchOnly: true,
    binanceEligible: false,
    impulseAt: clock - 30_000,
    observedAt: clock - 30_000,
    dumpPct: -12,
    dumpPrice: 0.088,
    accumulationBaseLow: 0.092,
    accumulationBaseHigh: 0.094,
    impulseRisePct: 2.4,
    impulseRangeAtr: 2.2,
    impulseVolumeRatio: 3.1,
    impulseTakerBuyPct: 68,
    score: 82,
    retestZone: { low: 0.0938, high: 0.0942 },
    invalidationPrice: 0.092,
    rsi14: 64,
  };
  const stageOne = { ...common, stage: POST_DUMP_NO_SELL_STAGE.BUY_IMPULSE };
  assert.equal(await notifier.deliver(stageOne), true);
  assert.equal(await notifier.deliver(stageOne), false);
  assert.equal(requests.length, 1);
  assert.match(requests[0].body.embeds[0].title, /HỒI MẠNH SAU XẢ/);
  assert.equal(requests[0].body.embeds[0].fields[0].value, '**HỒI MẠNH SAU XẢ**');
  assert.match(requests[0].body.embeds[0].description, /MARKET LONG 8 USDT/i);
  assert.match(requests[0].body.embeds[0].footer.text, /route MARKET LONG 8 USDT/i);

  clock += 10 * 60_000;
  const stageTwo = {
    ...common,
    stage: POST_DUMP_NO_SELL_STAGE.NO_SELL_CONFIRMATION,
    observedAt: clock - 10_000,
    followBars: 2,
    pullbackPct: 22,
    followVolumeRatio: 0.42,
    followTakerSellPct: 39,
  };
  assert.equal(await notifier.deliver(stageTwo), true);
  assert.equal(requests.length, 2);
  assert.match(requests[1].body.embeds[0].title, /KHÔNG CÒN LỰC BÁN/);
  assert.match(requests[1].body.embeds[0].title, /HỒI MẠNH SAU XẢ/);

  clock += 60_000;
  const late = {
    ...common,
    symbol: 'LATEUSDT',
    stage: POST_DUMP_NO_SELL_STAGE.LATE_NO_CHASE,
    observedAt: clock - 10_000,
    rsi14: 82,
    emaDistanceAtr: 2.6,
    moveAboveBasePct: 5.4,
  };
  assert.equal(await notifier.deliver(late), true);
  assert.equal(requests.length, 3);
  assert.match(requests[2].body.embeds[0].title, /KHÔNG LONG ĐUỔI/);
  assert.match(requests[2].body.embeds[0].description, /KHÔNG PHẢI ĐIỂM VÀO/);

  const unsafe = { ...stageTwo, symbol: 'UNSAFEUSDT', binanceEligible: true };
  assert.equal(await notifier.deliver(unsafe), false);
  assert.equal(requests.length, 3);

  const payload = postDumpNoSellDiscordPayload(stageTwo);
  assert.equal(payload.allowed_mentions.parse.length, 0);
  assert.match(payload.embeds[0].footer.text, /không vào thêm/i);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('post-dump no-sell Discord tests passed');
