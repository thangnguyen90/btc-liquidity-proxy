import assert from 'node:assert/strict';
import {detectExtremeShortSqueeze} from '../src/extremeShortSqueeze.js';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildExtremeShortSqueezeOrder,ExtremeShortSqueezeBinanceRunner,validExtremeReboundSweepOrder} from '../src/extremeShortSqueezeBinance.js';
import {EXTREME_REBOUND_SWEEP_ROUTE} from '../src/otherEntryCatalog.js';
import {AutoEntryControls} from '../src/autoEntryControls.js';
import {authorizeExtremeShortSqueezeOrder,evaluateAutoBinanceEntryPolicy} from '../src/autoBinancePolicy.js';
import {
  ExtremeReboundSweepFollowups, findExtremeReboundSweep,
  extremeReboundSweepDiscordEvent, extremeReboundSweepDiscordPayload,
} from '../src/extremeReboundSweepDiscord.js';

const close = Date.UTC(2026,10,9,9,30);
const rows = Array.from({length:30},(_,i) => ({
  openTime:close-(30-i)*300_000,closeTime:close-(29-i)*300_000-1,
  open:100,high:101,low:99,close:100,volume:1000,quoteVolume:100_000,
}));
Object.assign(rows.at(-3),{low:92,close:94});
Object.assign(rows.at(-2),{open:94,high:96,low:93,close:94});
Object.assign(rows.at(-1),{open:94,high:117,low:93,close:114,volume:5000,quoteVolume:550_000});
const options = {symbol:'TESTUSDT',interval:'5m',now:close};
const pump = detectExtremeShortSqueeze(rows,options).find(event=>event.stage==='EXTREME_PUMP_CLOSED');
assert.ok(pump?.reboundContext);
const liveTime = close-5000;
assert.equal(detectExtremeShortSqueeze(rows,{...options,now:liveTime,liveUpdatedAt:liveTime})
  .find(event=>event.stage==='EXTREME_PUMP_LIVE')?.reboundContext,undefined);

const at = close+41_000;
const sweep = {
  id:'sweep-id',kind:'ALL_TRACKED_UPPER_SWEPT',viewRange:'24h',symbol:pump.symbol,
  at,observedAt:at+500,zonesAsOf:pump.candleAt-1,armedAt:close-30_000,
  previousTickAt:at-1000,maxTickGapMs:1000,previousMarkPrice:116.5,markPrice:117.5,
  zones:[{low:116,high:117,establishedAt:pump.candleAt-600_001,asOf:pump.candleAt-1,
    overlapStrength:41.8,persistenceBars:3,cleared:true,clearedAt:at}],
};
const now = at+1000;
const confirmation = findExtremeReboundSweep(pump,[sweep],now);
assert.ok(confirmation);
for (const patch of [
  {zonesAsOf:pump.candleAt},{previousTickAt:at-10_001},{previousMarkPrice:117},
  {markPrice:116.99},{symbol:'WRONGUSDT'},{observedAt:now+1},
]) assert.equal(findExtremeReboundSweep(pump,[{...sweep,...patch}],now),null);
assert.equal(extremeReboundSweepDiscordEvent(confirmation,at+90_001),null);
const enabledAt = new Date(pump.candleAt-1000).toISOString();
const settings = {now,markPrice:sweep.markPrice,enabledAt};
const plan = buildExtremeShortSqueezeOrder(confirmation,settings);
assert.ok(plan);
assert.deepEqual([plan.marginUsdt,plan.leverage,plan.notionalUsdt,plan.takeProfitRoePct,plan.side,plan.orderType],
  [3,3,9,5,'SELL','MARKET']);
assert.ok(Math.abs(plan.stopLossDistanceFraction-.1)<1e-12);
assert.equal(plan.takeProfitDistanceFraction,5/300);
assert.equal(plan.allowMinNotionalCeil,false);
assert.equal(plan.protectionOnFill,true);
assert.equal(buildExtremeShortSqueezeOrder(confirmation,{...settings,enabledAt:new Date(pump.candleAt+1).toISOString()}),null);
assert.equal(buildExtremeShortSqueezeOrder(confirmation,{...settings,now:at+90_001}),null);
assert.equal(buildExtremeShortSqueezeOrder(confirmation,{...settings,markPrice:sweep.markPrice*1.006}),null);
assert.equal(validExtremeReboundSweepOrder(plan,sweep.markPrice,now),true);
assert.equal(validExtremeReboundSweepOrder(plan,sweep.markPrice,at+90_001),false);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:plan,orderEnabled:true,env:{}}).allowed,false);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeExtremeShortSqueezeOrder(plan),orderEnabled:true,env:{}}).allowed,true);
const embed = extremeReboundSweepDiscordPayload(confirmation).embeds[0];
assert.match(embed.title,/NẾN HỒI SAU XẢ · ĐÃ QUÉT CỤM SHORT/);
assert.equal(embed.color,0x8b5cf6);
assert.match(embed.fields.at(-1).value,/sweep=sweep-id#heatmap-sweep/);

const directory = await mkdtemp(join(tmpdir(),'rebound-short-'));
const controls = new AutoEntryControls(join(directory,'controls.json'));
const route = controls.register(EXTREME_REBOUND_SWEEP_ROUTE);
const state = controls.read();
state.enabled = true;
state.routes[route.key].enabled = true;
state.routes[route.key].enabledAt = enabledAt;
controls.save(state);
let submitted = 0;
const runner = new ExtremeShortSqueezeBinanceRunner({
  file:join(directory,'orders.json'),controls,now:()=>now,
  getContext:async()=>({enabled:true,positions:[],openOrders:[],markPrice:sweep.markPrice}),
  submit:async candidate=>{
    assert.deepEqual(candidate,plan);
    submitted++;
    return {status:'submitted',orderResult:{orderId:123}};
  },
});
const restarted = new ExtremeReboundSweepFollowups(close+1);
restarted.track(pump);
const unexpected = async()=>assert.fail('replay or duplicate');
assert.deepEqual(await restarted.flush([sweep],{execute:unexpected,notify:unexpected},now),{sent:0,failed:0});
const live = new ExtremeReboundSweepFollowups(close-60_000);
live.track(pump);
const execute = event=>runner.handle(event);
assert.deepEqual(await live.flush([sweep],{
  execute,notify:()=>({sent:0,reason:'backoff'}),
},now),{sent:0,failed:0});
assert.deepEqual(await live.flush([sweep],{
  execute:unexpected,notify:event=>{
    assert.equal(event.binanceExecution.orderId,123);
    assert.equal(event.binanceExecution.status,'submitted');
    return {sent:1,reason:'sent'};
  },
},now),{sent:1,failed:0});
live.track(pump);
assert.deepEqual(await live.flush([sweep],{execute:unexpected,notify:unexpected},now),{sent:0,failed:0});
assert.equal((await runner.handle(confirmation)).status,'deduped');
assert.equal(submitted,1);
console.log('PASS rebound SHORT 3 USDT mock, eligibility, controls, freshness, no replay and Discord retry dedupe.');
