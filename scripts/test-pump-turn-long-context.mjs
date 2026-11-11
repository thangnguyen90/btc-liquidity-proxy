import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {STEP,plannedPumpZones,livePumpZone} from '../public/pump-turn-model.js';
import {captureLongContext,validLongContext,longContextView,LONG_CONTEXT_TITLES} from '../public/pump-turn-long-context-model.js';
import {pumpTurnDiscordPayload,createPumpTurnDiscordSender} from '../src/pumpTurnDiscord.js';
import {PumpTurnWatch} from '../src/pumpTurnWatch.js';
import {plannedShortFlowZone,captureShortFlowContext,shortFlowContextView} from '../public/pump-turn-short-flow-model.js';
import {validPumpTurnNearSignal,buildPumpTurnNearOrder} from '../src/pumpTurnNearShortBinance.js';
const end=Math.floor(Date.now()/STEP)*STEP,now=end+10000;
const bars=Array.from({length:73},(_,i)=>({t:end-(73-i)*STEP,end:end-(72-i)*STEP-1,o:100,c:i>=70?105:100,h:i>=70?106:101,l:99,v:100,q:i>=70?30000:10000,buy:i>=70?18000:5000}));
const plan=plannedPumpZones('TESTUSDT',bars)[0],point={price:plan.zoneLow*.999,at:now};
const e={...livePumpZone(plan,point,now),id:'pump-turn-near:'+plan.id,observedAt:now};
assert.equal(e.alertEligible,true);
const cases=[['STRONG_BUY',{preBuyPct:55,preVolumeX:2,gain60:4}],['BUY_PRESSURE',{preBuyPct:55,preVolumeX:1.99,gain60:9.99}],['EXTENDED',{gain60:10}],['MIXED',{preBuyPct:54.99}],['UNKNOWN',{preBuyPct:null}]];
for(const [label,patch] of cases){const event={...e,...patch};event.longContext=captureLongContext(event);assert.equal(event.longContext.label,label);assert.ok(validLongContext(event));
 const payload=pumpTurnDiscordPayload(event),embed=payload.embeds[0];assert.ok(embed.title.includes(LONG_CONTEXT_TITLES[label]));assert.match(embed.title,/CHƯA XÁC NHẬN/);assert.equal(embed.fields.find(f=>f.name==='PHÂN LOẠI BỐI CẢNH LONG').name,'PHÂN LOẠI BỐI CẢNH LONG');assert.ok(embed.fields.find(f=>f.name==='PHÂN LOẠI BỐI CẢNH LONG').value.includes('\n'));assert.ok(embed.title.length<=256);assert.ok(embed.fields.every(f=>f.value.length<=1024));assert.deepEqual(payload.allowed_mentions.parse,[]);
 assert.equal(longContextView({...event,state:'EXPIRED'}).label,label);assert.equal(validLongContext({...event,livePrice:event.livePrice*1.01}),false);
 assert.equal(captureLongContext({...event,futureResult:999}).label,label);
}
for(const patch of [{liveAt:now-30001},{liveAt:now+1001},{asOf:now},{side:'SHORT'},{gain60:3.99},{preVolumeX:1.19},{preBuyPct:101},{livePrice:plan.zoneHigh*1.01}])assert.equal(captureLongContext({...e,...patch}).label,'UNKNOWN');
assert.equal(longContextView(e).label,'UNKNOWN');
const mainUrl='https://discord.com/api/webhooks/123/mock',extraUrl='https://discord.com/api/webhooks/456/mock';
const strong={...e,preBuyPct:55,preVolumeX:2,gain60:4};
strong.longContext=captureLongContext(strong);
const calls=[];
let contexts=0,extraStatus=200;
const router=createPumpTurnDiscordSender({
  webhookUrl:mainUrl,strongLongWebhookUrl:extraUrl,
  getContext:async()=>{contexts++;return null;},
  fetchImpl:async(url,o)=>{
    calls.push({url,body:o.body});
    return url===mainUrl?{ok:true,status:204}:{ok:extraStatus===200,status:extraStatus};
  },
});
assert.equal(router.strongLongRoute.configured,true);
const routed=await router(strong);
assert.deepEqual(calls.map(c=>c.url),[mainUrl,extraUrl+'?wait=true']);
assert.equal(calls[0].body,calls[1].body);
assert.equal(contexts,1);
assert.equal(routed.sent,1);
assert.deepEqual(routed.strongLongDelivery,{sent:1,failed:0,httpStatus:200});
calls.length=0;
for(const event of [{...strong,preBuyPct:54.99},{...strong,side:'SHORT'},{...strong,longContext:null}]){
  assert.equal((await router(event)).strongLongDelivery,undefined);
}
assert.deepEqual(calls.map(c=>c.url),[mainUrl,mainUrl,mainUrl]);
extraStatus=429;
const limited=await router(strong);
assert.equal(limited.sent,1);
assert.deepEqual(limited.strongLongDelivery,{sent:0,failed:1,httpStatus:429});
for(const secondary of [undefined,mainUrl,'https://example.com/api/webhooks/456/mock']){
  const primaryOnly=createPumpTurnDiscordSender({webhookUrl:mainUrl,strongLongWebhookUrl:secondary,fetchImpl:async url=>{
    assert.equal(url,mainUrl);return {ok:true,status:204};
  }});
  assert.equal(primaryOnly.strongLongRoute.configured,false);
  assert.equal((await primaryOnly(strong)).strongLongDelivery,undefined);
}

const file=join(await mkdtemp(join(tmpdir(),'long-context-')),'watch.json');let sent=0,orders=0;
const options={file,now:()=>now,getSymbols:()=>['TESTUSDT'],getRows:()=>bars.map(b=>({openTime:b.t,closeTime:b.end,open:b.o,high:b.h,low:b.l,close:b.c,volume:b.v,quoteVolume:b.q,takerBuyQuoteVolume:b.buy,isClosed:true})),getLive:()=>point,nearShortEnabled:()=>true,onNearShort:()=>orders++,discordSender:async event=>{assert.equal(event.side,'LONG');assert.ok(validLongContext(event));const saved=JSON.parse(await readFile(file,'utf8'));assert.deepEqual(saved.history.at(-1).longContext,event.longContext);sent++;return {sent:1,httpStatus:204};}};
const watch=new PumpTurnWatch(options);await watch.scan();assert.equal(sent,1);assert.equal(orders,0);const original=structuredClone(watch.history[0]);
bars[72].buy=0;await watch.scan();assert.deepEqual(watch.history[0],original);const restarted=new PumpTurnWatch(options);await restarted.scan();assert.equal(sent,1);assert.equal(orders,0);
console.log('PASS LONG: five labels/boundaries/stale/tamper/legacy; Discord formatting; durable frozen history; no replay or LONG order.');

const falling=Array.from({length:73},(_,i)=>({
 t:end-(73-i)*STEP,end:end-(72-i)*STEP-1,o:100,c:i>=70?95:100,h:101,l:i>=70?94:99,
 v:100,q:i>=70?30000:10000,buy:i>=70?12000:5000,
}));
const mirrorPlan=plannedShortFlowZone('DROPUSDT',falling);
assert.equal(mirrorPlan.contextEligible,true);
assert.ok(mirrorPlan.pump6h<15);
assert.equal(plannedPumpZones('DROPUSDT',falling)[1].contextEligible,false);
const mirrorPrice=mirrorPlan.zoneHigh*1.001;
const mirror={...livePumpZone(mirrorPlan,{price:mirrorPrice,at:now},now),id:'pump-turn-near:'+mirrorPlan.id,observedAt:now};
mirror.shortFlowContext=captureShortFlowContext(mirror);
assert.equal(shortFlowContextView(mirror).label,'STRONG_SELL');
assert.match(pumpTurnDiscordPayload(mirror).embeds[0].title,/GẦN VÙNG SHORT · CHƯA XÁC NHẬN · LỰC BÁN \+ VOLUME MẠNH/);
assert.equal((await router(mirror)).strongShortDelivery.sent,0,'the existing mocked rate-limit remains visible per destination');
assert.equal(validPumpTurnNearSignal({...mirror,preRows:falling.slice(-72),nearPct:.75}),false);
assert.equal(buildPumpTurnNearOrder({...mirror,preRows:falling.slice(-72),nearPct:.75},{now,enabledAt:now-1000,startedAt:now-1000,markPrice:mirrorPrice}),null);
for(const patch of [{gain60:-3.99},{gain60:-10},{preBuyPct:45.01},{preVolumeX:1.99},{liveAt:now-30001}]){
 const altered={...mirror,...patch};
 altered.shortFlowContext=captureShortFlowContext(altered);
 assert.equal(shortFlowContextView(altered).label,'UNKNOWN');
}
assert.equal(shortFlowContextView({...mirror,preVolumeX:5}).label,'UNKNOWN');
assert.equal(livePumpZone({...mirrorPlan,peak:150},{price:mirrorPrice,at:now},now).state,'NEAR','mirror does not inherit post-pump drawdown veto');
let mirroredSends=0,unexpectedOrders=0;
const mirrorFile=join(await mkdtemp(join(tmpdir(),'short-flow-')),'watch.json');
const mirrorOptions={file:mirrorFile,now:()=>now,getSymbols:()=>['DROPUSDT'],
 getRows:()=>falling.map(b=>({openTime:b.t,closeTime:b.end,open:b.o,high:b.h,low:b.l,close:b.c,volume:b.v,quoteVolume:b.q,takerBuyQuoteVolume:b.buy,isClosed:true})),
 getLive:()=>({price:mirrorPrice,at:now}),nearShortEnabled:()=>true,onNearShort:()=>unexpectedOrders++,
 discordSender:async event=>{
  mirroredSends++;assert.equal(event.shortFlowOnly,true);assert.equal(event.marketRuleEnabled,false);
  assert.equal(shortFlowContextView(event).label,'STRONG_SELL');return {sent:1,strongShortDelivery:{sent:1,httpStatus:200}};
 }};
const mirrorWatch=new PumpTurnWatch(mirrorOptions);
await mirrorWatch.scan();assert.equal(mirroredSends,1);assert.equal(unexpectedOrders,0);
const mirrorRestart=new PumpTurnWatch(mirrorOptions);await mirrorRestart.scan();
assert.equal(mirroredSends,1,'mirror cooldown is durable');
assert.equal(mirrorRestart.history[0].delivery.strongShortDelivery.sent,1);
console.log('PASS true downward mirror, no prior-pump requirement, frozen boundaries, Discord routing, observation-only and durable cooldown.');
