import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BtcRelativeStrengthDiscordNotifier,
  BTC_RELATIVE_STRENGTH_DISCORD_VERSION,
  btcRelativeStrengthDiscordPayload,
} from '../src/btcRelativeStrengthDiscord.js';

const now = Date.UTC(2026, 8, 28, 11, 0, 0);
const row = (stage = 'WAIT_5M_CONFIRM') => ({
  symbol:'ONDOUSDT', side:'LONG', active:true, confirmationAt:now - 60_000,
  poolExpiresAt:now + 60 * 60_000, livePrice:.572, livePriceSource:'MARK_SOCKET_1S',
  directionalDistancePct:.98, relativeScore:79.2, currentTrendScore:22,
  currentFrames:{ '15m':'UP', '1h':'UP', '4h':'UP' }, originVolumeRatio:7.57,
  currentVolumeRatio15m:.92, currentVolumeRatio5m:1.1, lastTakerBuyPct:44.4,
  entryZone:{ low:.56486, high:.56814, mid:.5665, basis:'MỐC BREAKOUT GỐC' },
  invalidationPrice:.52183,
  relative:{
    key:stage, contextActive:true, nearEntry:true,
    inZone:stage === 'RELATIVE_ENTRY_READY', alpha15mPct:.85, alpha1hPct:1.9,
    detail:'Chờ nến 5m xác nhận.',
  },
});
const btc = { key:'DOWN_STRONG', label:'BTC DOWN 1h + 4h', price:83_300, direction1h:'DOWN', direction4h:'DOWN', pct6h:-1 };

const payload = btcRelativeStrengthDiscordPayload(row(), btc);
assert.match(payload.embeds[0].title, /LONG GẦN VÙNG/);
assert.match(payload.embeds[0].fields[0].value, /🟩🟩/);
assert.match(payload.embeds[0].fields[0].value, /0\.56486/);
assert.match(payload.embeds[0].description, /chưa được xét Binance/);
const pullbackShortPayload = btcRelativeStrengthDiscordPayload({
  ...row('RELATIVE_ENTRY_READY'), symbol:'WEAKUSDT', side:'SHORT', last5mMovePct:-.34,
  relative:{
    key:'RELATIVE_ENTRY_READY', contextActive:true, nearEntry:true,
    contextMode:'BTC_DOWNTREND_PULLBACK_SHORT', relativeMovePct:.52,
    detail:'Entry theo nến hồi BTC đã đóng.',
  },
}, {
  ...btc, pullback5m:{ active:true, movePct:.18, priorMovePct:-.4 },
});
assert.match(pullbackShortPayload.embeds[0].description, /XẢ MẠNH HƠN BTC/);
assert.match(pullbackShortPayload.embeds[0].fields[3].value, /Nến hồi BTC 5m/);
assert.match(pullbackShortPayload.embeds[0].fields[3].value, /coin 5m/);

const directory = await mkdtemp(join(tmpdir(), 'btc-relative-discord-'));
const stateFile = join(directory, 'state.json');
const deliveries = [];
const notifier = new BtcRelativeStrengthDiscordNotifier({
  stateFile,
  webhookUrl:'https://discord.com/api/webhooks/123/token',
  baseUrl:'http://127.0.0.1:19082',
  now:() => now,
  fetchImpl:async (_url, options) => {
    deliveries.push(JSON.parse(options.body));
    return { ok:true, status:204 };
  },
});

const first = await notifier.process({ rows:[row()], btc });
assert.equal(first.sent, 1);
assert.equal(deliveries.length, 1);
const duplicate = await notifier.process({ rows:[row()], btc });
assert.equal(duplicate.sent, 0, 'same setup + same stage must be deduped');
const promoted = await notifier.process({ rows:[row('RELATIVE_ENTRY_READY')], btc });
assert.equal(promoted.sent, 1, 'promotion from near to ready gets one second notification');
assert.match(deliveries[1].embeds[0].title, /ĐỦ ĐIỀU KIỆN QUAN SÁT/);
assert.match(deliveries[1].embeds[0].description, /MARKET 2 USDT/);
assert.match(deliveries[1].embeds[0].fields[3].value, /Alpha coin−BTC/);
const outsideReady = await notifier.process({ rows:[{
  ...row('RELATIVE_ENTRY_READY'), symbol:'OUTSIDEUSDT',
  relative:{ ...row('RELATIVE_ENTRY_READY').relative, inZone:false },
}], btc });
assert.equal(outsideReady.sent, 0, 'READY outside the actual zone fails closed');

const state = JSON.parse(await readFile(stateFile, 'utf8'));
assert.equal(state.version, BTC_RELATIVE_STRENGTH_DISCORD_VERSION);
assert.equal(state.records.filter((record) => record.status === 'SENT').length, 2);
await rm(directory, { recursive:true, force:true });

console.log('btc relative strength Discord tests: OK');
