import assert from 'node:assert/strict';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {capturePumpTurnContext,validPumpTurnContext,pumpTurnContextView,pumpTurnContextKey,pumpTurnContextTradeKey,pumpTurnContextClosedStats,PUMP_TURN_CONTEXT_TITLES,PUMP_TURN_CONTEXT_VERSION} from '../public/pump-turn-context-model.js';
import {plannedPumpZones,livePumpZone,STEP} from '../public/pump-turn-model.js';
import {classifyNearShort} from './research-pump-turn-near-classification-20261028.mjs';
import {pumpTurnDiscordPayload,createPumpTurnDiscordSender} from '../src/pumpTurnDiscord.js';
import {PumpTurnWatch} from '../src/pumpTurnWatch.js';
import {buildPumpTurnNearOrder,validPumpTurnNearSignal,validPumpTurnNearOrder} from '../src/pumpTurnNearShortBinance.js';
import {normalizeLiquidLiveCardKey,matchLiquidLiveCardWhitelist} from '../src/liquidLiveCardWhitelist.js';
import {buildBinanceFilledSignalAuditRecord} from '../src/binanceFilledSignalAudit.js';

const freeze=JSON.parse(await readFile('data/research/pump-turn-near-eval-20261028/cohort.json','utf8'));
for(const event of freeze.events){
 const before=structuredClone(event),e={...event,nearContext:capturePumpTurnContext(event)};
 assert.equal(e.nearContext.label,classifyNearShort(event).label,'all 571 historical labels match research V1');
 assert.ok(validPumpTurnContext(e));assert.deepEqual(event,before);
 assert.equal(pumpTurnContextView({...event}).valid,false,'legacy record never backfilled');
 const payload=pumpTurnDiscordPayload(e),embed=payload.embeds[0];
 assert.match(embed.title,/CHƯA XÁC NHẬN/);assert.ok(embed.title.includes(PUMP_TURN_CONTEXT_TITLES[e.nearContext.label]));
 assert.ok(embed.fields.some(f=>f.name==='PHÂN LOẠI BỐI CẢNH SHORT'));
 assert.ok(embed.title.length<=256);assert.ok(embed.fields.every(f=>f.name.length<=256&&f.value.length<=1024));
 assert.ok(embed.title.length+embed.description.length+embed.footer.text.length+embed.fields.reduce((s,f)=>s+f.name.length+f.value.length,0)<=6000);
 assert.deepEqual(payload.allowed_mentions.parse,[]);
 const altered=structuredClone(e);altered.nearContext.label=e.nearContext.label==='MIXED'?'DEEP_DROP':'MIXED';assert.equal(validPumpTurnContext(altered),false);
 const later=structuredClone(e);later.state='EXPIRED';assert.equal(pumpTurnContextView(later).label,e.nearContext.label,'display expiration does not rewrite the frozen label');
}
const representative=freeze.events.find(e=>e.preBuyPct!==null),captured=capturePumpTurnContext(representative);
for(const change of [{liveAt:representative.observedAt-30001},{asOf:representative.observedAt},{gain60:null},{preBuyPct:'45'},{version:'LEGACY'}])assert.equal(capturePumpTurnContext({...representative,...change}).label,'UNKNOWN');
assert.equal(capturePumpTurnContext({...representative,results:{netRoe5x:999},futurePrice:999}).label,captured.label);
assert.equal(pumpTurnDiscordPayload({...representative,side:'LONG'}).embeds[0].fields.some(f=>f.name==='PHÂN LOẠI BỐI CẢNH SHORT'),false);

const end=Math.floor(Date.now()/STEP)*STEP;
let bars=Array.from({length:73},(_,i)=>({t:end-(73-i)*STEP,end:end-(72-i)*STEP-1,o:100,c:100,h:101,l:99,v:100,q:10000,buy:5000}));
bars[65]={...bars[65],h:120,c:119,o:118,l:118};
for(let i=66;i<73;i++)bars[i]={...bars[i],h:117,c:115,o:116,l:114};
const preRows=structuredClone(bars.slice(-72)),plan=plannedPumpZones('TESTUSDT',preRows)[1];
let now=end+10000;const price=plan.zoneHigh*1.002;
const original={...livePumpZone(plan,{price,at:now-1},now),id:'pump-turn-near:'+plan.id,observedAt:now,nearPct:.75,preRows};
const e={...original,nearContext:capturePumpTurnContext(original)};
assert.equal(validPumpTurnNearSignal(e),true);
const opts={now,enabledAt:now-1000,startedAt:now-1000,markPrice:price},oldOrder=buildPumpTurnNearOrder(original,opts),newOrder=buildPumpTurnNearOrder(e,opts);
assert.ok(newOrder);assert.ok(validPumpTurnNearOrder(newOrder,price,now));
const {pumpTurnNearAtEntry:oldProof,...oldFields}=oldOrder,{pumpTurnNearAtEntry:newProof,...newFields}=newOrder;
assert.deepEqual(newFields,oldFields,'context does not change entry, size, SL, TP, route or protection');
assert.deepEqual(newProof.nearContext,e.nearContext);
const auditRecord=buildBinanceFilledSignalAuditRecord({symbol:e.symbol,side:'SELL',orderId:123,fillTime:now+1},{...newOrder,signalSource:'pump-turn-near-short',pumpTurnNearEntryVersion:newOrder.fillAnchorVersion});
assert.deepEqual(auditRecord.pumpTurnNearAtEntry.nearContext,e.nearContext);

const primaryUrl='https://discord.com/api/webhooks/123/mock',extraUrl='https://discord.com/api/webhooks/456/mock';
const posts=[];
const sender=createPumpTurnDiscordSender({webhookUrl:primaryUrl,strongLongWebhookUrl:extraUrl,fetchImpl:async(url,init)=>{
 posts.push({url,body:init.body});
 return {ok:true,status:url===primaryUrl?204:200};
}});
assert.deepEqual(sender.strongLongRoute.sides,['LONG','SHORT']);
const shortFlow=patch=>{
 const event={...original,preBuyPct:45,preVolumeX:2,gain60:3,...patch};
 return {...event,nearContext:capturePumpTurnContext(event)};
};
const short=shortFlow({});
assert.equal(pumpTurnContextView(short).label,'MIXED','the 1h trend can still be up');
assert.ok(pumpTurnContextView(short).dropPct<10);
assert.match(pumpTurnDiscordPayload(short).embeds[0].title,/GẦN VÙNG SHORT · CHƯA XÁC NHẬN.*LỰC BÁN \+ VOLUME MẠNH/);
assert.deepEqual((await sender(short)).strongShortDelivery,{sent:1,failed:0,httpStatus:200});
assert.deepEqual(posts.map(p=>p.url),[primaryUrl,extraUrl+'?wait=true']);
assert.equal(posts[0].body,posts[1].body);
const leaning=shortFlow({gain60:-1});
assert.equal(pumpTurnContextView(leaning).label,'SELL_PRESSURE');
assert.equal((await sender(leaning)).strongShortDelivery.sent,1);
const deep=shortFlow({peak:original.livePrice/.9});
assert.equal(pumpTurnContextView(deep).label,'DEEP_DROP');
posts.length=0;
for(const event of [shortFlow({preBuyPct:45.01}),shortFlow({preVolumeX:1.99}),deep,{...short,nearContext:undefined},{...short,preVolumeX:4}]){
 const result=await sender(event);
 assert.equal(result.sent,1);
 assert.equal(result.strongShortDelivery,undefined);
 assert.doesNotMatch(pumpTurnDiscordPayload(event).embeds[0].title,/LỰC BÁN \+ VOLUME MẠNH/);
}
assert.deepEqual(posts.map(p=>p.url),Array(5).fill(primaryUrl));

const row={symbol:e.symbol,signalSource:'pump-turn-near-short',direction:'SHORT',pumpTurnNearAtEntry:e,pumpTurnNearSignalId:e.id,clientOrderId:newOrder.clientOrderId,orderId:123,positionStatus:'CLOSED',isDca:false,closeGroupId:'group1',netRealizedPnlUsdt:1,realizedRoePct:5};
const label=e.nearContext.label,key=pumpTurnContextKey(label),stats=x=>pumpTurnContextClosedStats(x,label);
assert.equal(pumpTurnContextTradeKey(row),key);assert.equal(normalizeLiquidLiveCardKey(key),key);
assert.equal(matchLiquidLiveCardWhitelist(row,[]).allowed,false);assert.ok(matchLiquidLiveCardWhitelist(row,[key]).matchedKeys.includes(key));
assert.equal(stats({}).eligible,false);assert.equal(stats({r:row}).eligible,true);assert.equal(stats({r:{...row,realizedRoePct:4}}).eligible,false);
assert.equal(stats({r:row,dup:{record:structuredClone(row)}}).closed,1);
for(const patch of [{isDca:true},{positionStatus:'OPEN'},{realizedRoePct:null},{netRealizedPnlUsdt:null},{signalSource:'other'},{direction:'LONG'},{pumpTurnNearSignalId:'wrong'},{closeGroupId:null},{pumpTurnNearAtEntry:original}])assert.equal(stats({r:{...row,...patch}}).closed,0,JSON.stringify(patch).slice(0,100));
assert.equal(stats({r:row,dca:{...row,orderId:124,isDca:true}}).closed,0,'exclude whole DCA close group');
assert.equal(stats({r:row,other:{...row,orderId:124,signalSource:'other'}}).closed,0,'exclude mixed close group');
const tampered=structuredClone(row);tampered.pumpTurnNearAtEntry.preRows[71].buy=100;assert.equal(pumpTurnContextTradeKey(tampered),null,'replay closed candle proof for stats');
assert.equal(pumpTurnContextClosedStats({r:row},'nonsense').closed,0);
assert.equal(normalizeLiquidLiveCardKey('pump-turn-context:FAKE'),null);

const dir=await mkdtemp(join(tmpdir(),'pump-context-')),file=join(dir,'watch.json'),sent=[],orders=[];
const raw=()=>bars.map(b=>({openTime:b.t,closeTime:b.end,open:b.o,high:b.h,low:b.l,close:b.c,volume:b.v,quoteVolume:b.q,takerBuyQuoteVolume:b.buy,isClosed:true}));
const watch=new PumpTurnWatch({file,now:()=>now,getSymbols:()=>['TESTUSDT'],getRows:raw,getLive:()=>({price,at:now}),nearShortEnabled:()=>true,
 onNearShort:async event=>orders.push(event),discordSender:async event=>{
  const saved=JSON.parse(await readFile(file,'utf8')).history.at(-1);
  assert.deepEqual(saved.nearContext,event.nearContext,'snapshot durable before POST');
  sent.push(structuredClone(event));return {sent:1,failed:0,httpStatus:204};
 }});
now+=100;await watch.scan();await new Promise(r=>setTimeout(r,0));
assert.equal(sent.length,1);assert.equal(orders.length,1);assert.ok(validPumpTurnContext(sent[0]));assert.deepEqual(orders[0].nearContext,sent[0].nearContext);
const frozenLabel=JSON.stringify(sent[0].nearContext);bars=bars.map(b=>({...b,buy:0}));
assert.equal(JSON.stringify(watch.snapshot(sent[0].id).selected.nearContext),frozenLabel);
const restart=new PumpTurnWatch({file,now:()=>now,getSymbols:()=>[],discordSender:async()=>{throw Error('must not replay');}});await restart.init();
assert.equal(JSON.stringify(restart.history[0].nearContext),frozenLabel);assert.equal(restart.snapshot().contextVersion,PUMP_TURN_CONTEXT_VERSION);

const server=await readFile('src/server.js','utf8'),start=server.indexOf('async function updateLiquidLiveCardWhitelist('),stop=server.indexOf('async function updateLiveCardRealEnabled(',start),method=server.slice(start,stop);
let eligible=false,saved=[];
const harness={PUMP_TURN_CONTEXT_TITLES,pumpTurnContextKey,pumpTurnContextStats:async()=>[{label,eligible}],LOWER_MOMENTUM_TITLES:{},UPPER_MOMENTUM_TITLES:{},LONG_QUALITY_LABELS:{GOOD:'good',BAD:'bad'},longQualityKey:()=>null,SECOND_SWEEP_KEY:'second',readLiquidLiveCardWhitelist:async()=>({enabledKeys:[]}),writeLiquidLiveCardWhitelist:async x=>{saved.push(x);return x;},readLiveCardRealEnabled:async()=>({enabledKeys:[]})};
const update=vm.runInNewContext(method+'\nupdateLiquidLiveCardWhitelist',harness);
await assert.rejects(()=>update(key,true),/closed AvgROE >4/);assert.equal(saved.length,0);
eligible=true;await update(key,true);assert.deepEqual(Array.from(saved[0].enabledKeys),[key]);
eligible=false;await update(key,false);assert.equal(saved.at(-1).enabledKeys.length,0);
console.log('PASS: 571-label research parity, causal/legacy/tamper handling, Discord limits, frozen durable delivery/native/audit proof, entry invariant, CLOSED dedupe/DCA/mixed stats, whitelist default OFF and >4 server guard.');
