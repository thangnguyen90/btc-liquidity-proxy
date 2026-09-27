import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  PostPumpNoBuyDiscordNotifier,
  postPumpNoBuyDiscordPayload,
} from '../src/postPumpNoBuyDiscord.js';
import { POST_PUMP_NO_BUY_STAGE } from '../src/postPumpNoBuyWatch.js';

const directory = await mkdtemp(join(tmpdir(), 'post-pump-no-buy-discord-'));
try {
  let clock = Date.UTC(2026, 8, 26, 12, 0, 0);
  const requests = [];
  const notifier = new PostPumpNoBuyDiscordNotifier({
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
    symbol: 'BULLAUSDT',
    side: 'SHORT',
    watchOnly: true,
    binanceEligible: false,
    impulseAt: clock - 30_000,
    observedAt: clock - 30_000,
    pumpPct: 12,
    pumpPrice: 0.107,
    distributionBaseLow: 0.101,
    distributionBaseHigh: 0.102,
    impulseDropPct: -2.4,
    impulseRangeAtr: 2.2,
    impulseVolumeRatio: 3.1,
    impulseTakerSellPct: 68,
    score: 82,
    retestZone: { low: 0.1008, high: 0.1012 },
    invalidationPrice: 0.102,
    rsi14: 35,
  };
  const stageOne = { ...common, stage: POST_PUMP_NO_BUY_STAGE.SELL_IMPULSE };
  assert.equal(await notifier.deliver(stageOne), true);
  assert.equal(await notifier.deliver(stageOne), false);
  assert.equal(requests.length, 1);
  assert.match(requests[0].body.embeds[0].title, /XẢ MẠNH SAU BƠM/);
  assert.equal(requests[0].body.embeds[0].fields[0].value, '**XẢ MẠNH SAU BƠM**');
  assert.match(requests[0].body.embeds[0].description, /MARKET SHORT 8 USDT/i);
  assert.match(requests[0].body.embeds[0].footer.text, /route MARKET SHORT 8 USDT/i);

  clock += 10 * 60_000;
  const stageTwo = {
    ...common,
    stage: POST_PUMP_NO_BUY_STAGE.NO_BUY_CONFIRMATION,
    observedAt: clock - 10_000,
    followBars: 2,
    reboundPct: 22,
    followVolumeRatio: 0.42,
    followTakerBuyPct: 39,
  };
  assert.equal(await notifier.deliver(stageTwo), true);
  assert.equal(requests.length, 2);
  assert.match(requests[1].body.embeds[0].title, /KHÔNG CÓ LỰC MUA/);
  assert.match(requests[1].body.embeds[0].title, /XẢ MẠNH SAU BƠM/);
  assert.match(requests[1].body.embeds[0].description, /không vào thêm lần hai/i);

  clock += 60_000;
  const late = {
    ...common,
    symbol: 'LATEUSDT',
    stage: POST_PUMP_NO_BUY_STAGE.LATE_NO_CHASE,
    observedAt: clock - 10_000,
    rsi14: 18,
    emaDistanceAtr: 2.6,
    moveBelowBasePct: 5.4,
  };
  assert.equal(await notifier.deliver(late), true);
  assert.equal(requests.length, 3);
  assert.match(requests[2].body.embeds[0].title, /KHÔNG SHORT ĐUỔI/);
  assert.match(requests[2].body.embeds[0].title, /XẢ MẠNH SAU BƠM/);
  assert.match(requests[2].body.embeds[0].description, /KHÔNG PHẢI ĐIỂM VÀO/);

  const unsafe = { ...stageTwo, symbol: 'UNSAFEUSDT', binanceEligible: true };
  assert.equal(await notifier.deliver(unsafe), false);
  assert.equal(requests.length, 3);

  const payload = postPumpNoBuyDiscordPayload(stageTwo);
  assert.equal(payload.allowed_mentions.parse.length, 0);
  assert.match(payload.embeds[0].footer.text, /không vào thêm/i);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('post-pump no-buy Discord tests passed');
