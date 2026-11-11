import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildEarlyFlowZone,buildEarlyShortZone,captureEarlyFlowContext,captureEarlyShortContext,earlyShortContextView,earlyFlowContextView,EARLY_SHORT_VERSION,EARLY_LONG_VERSION} from '../public/pump-turn-early-short-model.js';
import {PumpTurnWatch} from '../src/pumpTurnWatch.js';
import {pumpTurnDiscordPayload,createPumpTurnDiscordSender} from '../src/pumpTurnDiscord.js';
import {validPumpTurnNearSignal,buildPumpTurnNearOrder} from '../src/pumpTurnNearShortBinance.js';
import {STEP} from '../public/pump-turn-model.js';
const t=Math.floor(1794372000000/STEP)*STEP;
let clock=t+120000,price=99.6;
const bars=Array.from({length:73},(_,i)=>({t:t-(73-i)*STEP,end:t-(72-i)*STEP-1,
 o:100,h:100.3,l:99.7,c:100,v:1000,q:100000,buy:50000}));
const raw=()=>({openTime:t,closeTime:t+STEP-1,open:100,high:100,low:99.6,close:price,
 volume:1000,quoteVolume:100000*(clock-t)/STEP*2.5,takerBuyQuoteVolume:100000*(clock-t)/STEP, isClosed:false});
const point=()=>({price,at:clock});
const row=buildEarlyShortZone('TESTUSDT',bars,raw(),point(),clock);
assert.ok(row);assert.equal(row.shortFlowOnly,true);assert.equal(row.shortFlowEarlyOnly,true);
assert.ok(row.gain60>-4);assert.ok(row.preVolumeX>=2);
const original={...row,id:'pump-turn-near:'+row.id,observedAt:clock,earlyFirstAt:clock-10000,earlySustainMs:10000,earlySamples:2,marketRuleEnabled:false};
original.earlyShortContext=captureEarlyShortContext(original);
assert.equal(earlyShortContextView(original).label,'EARLY_SELL');
assert.equal(earlyShortContextView({...original,earlyQuote:1}).label,'UNKNOWN');
assert.equal(earlyShortContextView({...original,earlySamples:1}).label,'UNKNOWN');
assert.equal(earlyShortContextView({...original,state:'EXPIRED'}).label,'EARLY_SELL');
for(const patch of [
 {isClosed:true},{isClosed:undefined},{openTime:t-STEP},{closeTime:t+STEP},{quoteVolume:49999,takerBuyQuoteVolume:20000},
 {quoteVolume:70000,takerBuyQuoteVolume:28000},{takerBuyQuoteVolume:43000},
 {close:100,low:99.6},{close:98,low:98}
]){
 const candidate={...raw(),...patch},p={price:+candidate.close,at:clock};
 assert.equal(buildEarlyShortZone('TESTUSDT',bars,candidate,p,clock),null,JSON.stringify(patch));
}
assert.equal(buildEarlyShortZone('TESTUSDT',bars,raw(),{...point(),at:clock-10001},clock),null);
assert.equal(buildEarlyShortZone('TESTUSDT',bars,raw(),{...point(),at:clock+1001},clock),null);
assert.equal(buildEarlyShortZone('TESTUSDT',bars.slice(1,10),raw(),point(),clock),null);
assert.equal(buildEarlyShortZone('TESTUSDT',bars,raw(),point(),t+59999),null);
assert.equal(validPumpTurnNearSignal({...original,preRows:bars.slice(-72),nearPct:.75}),false);
assert.equal(buildPumpTurnNearOrder({...original,preRows:bars.slice(-72),nearPct:.75},
 {now:clock,enabledAt:clock-1000,startedAt:clock-1000,markPrice:price}),null);
const payload=pumpTurnDiscordPayload(original),embed=payload.embeds[0];
assert.match(embed.title,/SHORT SỚM/);assert.equal(embed.color,0xf59e0b);
assert.ok(embed.fields.some(f=>f.name==='LỰC BÁN / VOLUME ĐANG HÌNH THÀNH'));
assert.ok(!embed.fields.some(f=>f.name==='BỐI CẢNH ĐÃ ĐÓNG'));
assert.ok(embed.fields.every(f=>f.value.length<=1024));
assert.ok(embed.title.length+embed.description.length+embed.footer.text.length+embed.fields.reduce((s,f)=>s+f.name.length+f.value.length,0)<=6000);
let posts=0;
const sender=createPumpTurnDiscordSender({webhookUrl:'https://discord.com/api/webhooks/111/mock',
 strongLongWebhookUrl:'https://discord.com/api/webhooks/222/mock',now:()=>clock,
 fetchImpl:async(url,options)=>{posts++;assert.match(JSON.parse(options.body).embeds[0].title,/SHORT SỚM/);return {ok:true,status:204};}});
const delivery=await sender(original);assert.equal(delivery.sent,1);assert.equal(delivery.strongShortDelivery.sent,1);assert.equal(posts,2);
clock+=20001;assert.equal((await sender(original)).error,'EARLY_SHORT_EXPIRED_OR_INVALID');assert.equal(posts,2);
clock=t+120000;
const lateSender=createPumpTurnDiscordSender({webhookUrl:'https://discord.com/api/webhooks/111/mock',now:()=>clock,
 getContext:async()=>{clock+=20001;return null;},fetchImpl:()=>{throw Error('late alert posted');}});
assert.equal((await lateSender(original)).error,'EARLY_SHORT_EXPIRED_OR_INVALID');
clock=t+120000;
const directory=await mkdtemp(join(tmpdir(),'early-short-')),file=join(directory,'watch.json');
const mapped=bars.map(b=>({openTime:b.t,closeTime:b.end,open:b.o,high:b.h,low:b.l,close:b.c,volume:b.v,quoteVolume:b.q,takerBuyQuoteVolume:b.buy,isClosed:true}));
let sent=0,orders=0;
const opts={file,now:()=>clock,getSymbols:()=>['TESTUSDT'],getRows:()=>mapped,getForming:()=>raw(),getLive:point,
 nearShortEnabled:()=>true,onNearShort:()=>orders++,nearLongEnabled:()=>true,onNearLong:()=>orders++,
 nearShortPushEnabled:()=>true,onNearShortPush:()=>orders++,
 discordSender:async event=>{
  const saved=JSON.parse(await readFile(file,'utf8'));
  assert.equal(saved.history.at(-1).earlyShortContext.version,EARLY_SHORT_VERSION);
  assert.equal(saved.history.at(-1).delivery.status,'PENDING');
  assert.equal(earlyShortContextView(event).label,'EARLY_SELL');
  assert.equal(event.marketRuleEnabled,false);sent++;return {sent:1};
 }};
try{
 const watch=new PumpTurnWatch(opts);await watch.scan();assert.equal(sent,0);
 clock+=10000;await watch.scan();assert.equal(sent,1);assert.equal(orders,0);
 assert.ok(watch.lastAlerts['TESTUSDT:SHORT_FLOW_EARLY']);
 assert.equal(watch.lastAlerts['TESTUSDT:SHORT_FLOW'],undefined);
 const restart=new PumpTurnWatch(opts);await restart.scan();clock+=10000;await restart.scan();assert.equal(sent,1);
 let flicker=0;
 const transient=new PumpTurnWatch({...opts,file:null,discordSender:async()=>{flicker++;return {sent:1};}});
 await transient.scan();clock+=10000;price=100;await transient.scan();assert.equal(transient.earlyPending.size,0);
 price=99.6;clock+=10000;await transient.scan();assert.equal(flicker,0);
 clock+=10000;await transient.scan();assert.equal(flicker,1);
 const sameTick=new PumpTurnWatch({...opts,file:null,getLive:()=>({price,at:clock}),discordSender:async()=>{throw Error('one tick counted twice');}});
 await sameTick.scan();const frozen=clock;clock+=10000;sameTick.getLive=()=>({price,at:frozen});
 await sameTick.scan();assert.equal(sameTick.history.length,0);
}finally{await rm(directory,{recursive:true,force:true});}
console.log('PASS early SHORT: causal forming candles/elapsed volume, freshness/missing/chase guards, two fresh samples, reset/cooldown/restart, dual Discord routing/expiry, durable storage and no Binance/push orders. Mock only.');

clock=t+120000;
price=100.4;
const longRaw=()=>({...raw(),high:Math.max(100,price),low:100,takerBuyQuoteVolume:raw().quoteVolume*.60});
const longRow=buildEarlyFlowZone('TESTUSDT',bars,longRaw(),point(),clock);
assert.equal(longRow?.longFlowEarlyOnly,true);
assert.equal(longRow.side,'LONG');
assert.equal(longRow.earlyResistance,longRow.zoneLow);
assert.equal(buildEarlyShortZone('TESTUSDT',bars,longRaw(),point(),clock),null);
const longEvent={...longRow,observedAt:clock,earlyFirstAt:clock-10000,earlySustainMs:10000,earlySamples:2};
longEvent.earlyLongContext=captureEarlyFlowContext(longEvent);
assert.equal(earlyFlowContextView(longEvent).label,'EARLY_BUY');
assert.equal(earlyFlowContextView({...longEvent,earlyResistance:100}).label,'UNKNOWN');
assert.equal(validPumpTurnNearSignal(longEvent),false);
const longEmbed=pumpTurnDiscordPayload(longEvent).embeds[0];
assert.match(longEmbed.title,/LONG SỚM · ÁP LỰC MUA ĐANG HÌNH THÀNH/);
assert.equal(longEmbed.color,0x38bdf8);
assert.match(longEmbed.fields.find(f=>f.name==='ĐIỂM CẦN CHỜ').value,/kháng cự.*đóng trên/);
for(const patch of [{isClosed:true},{close:101,high:101},{takerBuyQuoteVolume:longRaw().quoteVolume*.57}]){
 const candle={...longRaw(),...patch};
 assert.equal(buildEarlyFlowZone('TESTUSDT',bars,candle,{price:candle.close,at:clock},clock),null);
}
let longPosts=0;
const longSender=createPumpTurnDiscordSender({webhookUrl:'https://discord.com/api/webhooks/111/mock',
 strongLongWebhookUrl:'https://discord.com/api/webhooks/222/mock',now:()=>clock,
 fetchImpl:async()=>{longPosts++;return {ok:true,status:204};}});
assert.equal((await longSender(longEvent)).strongLongDelivery.sent,1);
assert.equal(longPosts,2);
clock+=20001;
assert.equal((await longSender(longEvent)).error,'EARLY_LONG_EXPIRED_OR_INVALID');
assert.equal(longPosts,2);

clock=t+120000;
price=99.6;
const sides=[];
const both=new PumpTurnWatch({...opts,file:null,getForming:()=>price<100?raw():longRaw(),
 discordSender:async e=>{sides.push(e.side);assert.equal(e.marketRuleEnabled,false);return {sent:1};}});
await both.scan();
clock+=10000;await both.scan();
assert.deepEqual(sides,['SHORT']);
price=100.4;clock+=10000;await both.scan();
assert.deepEqual(sides,['SHORT'],'the opposite direction cannot inherit the two-sample confirmation');
clock+=10000;await both.scan();
assert.deepEqual(sides,['SHORT','LONG']);
assert.ok(both.lastAlerts['TESTUSDT:LONG_FLOW_EARLY']);
assert.equal(both.lastAlerts['TESTUSDT:LONG'],undefined);
assert.equal(both.history.at(-1).earlyLongContext.version,EARLY_LONG_VERSION);
assert.equal(orders,0);
console.log('PASS early LONG: mirrored thresholds, resistant band and chase, direction-specific confirmation, independent cooldown, both Discord channels and no trade. Mock only.');
