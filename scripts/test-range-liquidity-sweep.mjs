import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {armRangeSweep,advanceRangeSweep,rangeSweepFlow,inspectRangeSweepFlow,RANGE_SWEEP_VERSION} from '../src/rangeLiquiditySweepModel.js';
import {RangeLiquiditySweepWatch} from '../src/rangeLiquiditySweepWatch.js';
import {rangeSweepDiscordPayload,createRangeSweepDiscordSender,RANGE_SWEEP_COLORS} from '../src/rangeLiquiditySweepDiscord.js';
import {PROFILE_RATIO} from '../src/heatmapEntryScenarios.js';
import {buildBinanceHeatmapProfiles,normalizeBinanceHeatmapCandles,heatmapRangePlan} from '../src/binanceHeatmapModel.js';
const S=300000,M=60000,base=Math.floor(Date.now()/S)*S;let now=base+10000;
function bundle(){const candles=Array.from({length:25},(_,i)=>({time:base-(25-i)*S,open:100,high:100.1,low:99.9,close:100+(i%2?.01:0)}));const profiles=Array.from({length:3},(_,i)=>({at:base-1-(2-i)*S,mark:true,oiFresh:true,bins:[99,101].map(x=>[Math.round(Math.log(x)/Math.log(PROFILE_RATIO)),100])}));return {models:[1,3].map(model=>({model,status:'OK',data:{source:'BINANCE_LOCAL',symbol:'TESTUSDT',range:'24h',step:S,end:base,candles:structuredClone(candles),profiles:structuredClone(profiles)}}))};}
function flow(at,price,buy=60,volume=3){const end=Math.floor(at/M)*M;return Array.from({length:21},(_,i)=>{const t=end-(21-i)*M,o=price+(buy<50?.01:-.01),q=i===20?100*volume:100;return {openTime:t,closeTime:t+M-1,open:o,high:price+.03,low:price-.03,close:price,quoteVolume:q,takerBuyQuoteVolume:q*buy/100,isClosed:true};});}
const point=()=>({price:100,at:now}),original=bundle(),c=armRangeSweep(original,point(),now);assert(c?.upper&&c.lower);const frozen=JSON.stringify(c.upper);original.models[0].data.profiles=[];assert.equal(JSON.stringify(c.upper),frozen);
// Production's optimized shared bundle deliberately has only one close.
// Keep the prior full-bundle fixtures, and explicitly exercise this contract.
const compact=bundle();for(const m of compact.models)m.data.candles=m.data.candles.slice(-1).map(c=>({time:c.time,close:c.close}));
const rawBase={symbol:'TESTUSDT',step:S,end:base,savedAt:base+1000,price:bundle().models[0].data.candles.map(c=>[c.time,c.open,c.high,c.low,c.close,100,c.time+S-1,10000,1,50,5000])};
assert.equal(armRangeSweep(compact,point(),now),null,'compact bundle alone lacks the base');
const diag={},armedRaw=armRangeSweep(compact,point(),now,rawBase,diag);assert.ok(armedRaw);assert.equal(armedRaw.base.length,24);assert.equal(armedRaw.baseSource,'SHARED_RAW_PRICE');assert.equal(diag.reason,'ARMED');assert.equal(diag.metrics.baseBars,25);
assert.deepEqual(armedRaw.base,c.base);const snap=structuredClone(armedRaw.base);rawBase.price[2][4]=101;assert.deepEqual(armedRaw.base,snap,'raw cache updates cannot change frozen base');rawBase.price[2][4]=100;
for(const patch of [{symbol:'WRONGUSDT'},{end:base-S},{savedAt:now+1},{price:rawBase.price.slice(1)}]){const d={};assert.equal(armRangeSweep(compact,point(),now,{...rawBase,...patch},d),null);assert.ok(d.reason.startsWith('RAW_BASE'));}
const plan=heatmapRangePlan('24h',now),normalized=normalizeBinanceHeatmapCandles(rawBase.price,plan),oiRows=normalized.map((c,i)=>({timestamp:c.time,sumOpenInterest:1000+i*100}));
const productionBundle={models:[1,3].map(model=>({model,status:'OK',data:buildBinanceHeatmapProfiles({query:{symbol:'TESTUSDT',range:'24h'},plan,candles:normalized,markRows:normalized,oiRows,model})}))};
assert.equal(productionBundle.models[0].data.candles.length,1);assert.ok(armRangeSweep(productionBundle,point(),now,rawBase),'real optimized producer + cached raw must arm');
const wired=new RangeLiquiditySweepWatch({getBaseRows:()=>rawBase,discordSender:async()=>({sent:1}),now:()=>now});wired.ready=true;wired.arm(productionBundle,point());assert.equal(wired.cohorts.size,1);assert.equal(wired.snapshot().coverage.armedTotal,1);
const subscriptionCalls=[];const streaming=new RangeLiquiditySweepWatch({getBaseRows:()=>rawBase,discordSender:async()=>({sent:1}),subscribeFlow:s=>{subscriptionCalls.push(s);return {connections:1};},now:()=>now});streaming.ready=true;streaming.arm(productionBundle,point());streaming.syncFlow();assert.deepEqual(subscriptionCalls,[['TESTUSDT']]);streaming.cohorts.get('TESTUSDT').done=true;streaming.syncFlow();assert.equal(subscriptionCalls.length,1,'sticky subscriptions do not churn on stage completion');
const missingWire=new RangeLiquiditySweepWatch({discordSender:async()=>({sent:1}),now:()=>now});missingWire.ready=true;missingWire.arm(productionBundle,point());assert.equal(missingWire.snapshot().coverage.rejectionReasons.RAW_BASE_MISSING_STALE_OR_MISMATCH,1);
for(const patch of [b=>b.models.pop(),b=>b.models[1].data.source='DEMO',b=>b.models[0].data.profiles[0].mark=false,b=>b.models[1].data.profiles[0].oiFresh=false,b=>b.models[0].data.candles[0].time--,b=>b.models[0].data.candles.forEach((x,i)=>{x.close=100+i;x.high=x.close+1;x.open=x.close;x.low=x.close-1;})]){const b=bundle();patch(b);assert.equal(armRangeSweep(b,point(),now),null);}
assert.equal(armRangeSweep(bundle(),{price:102,at:now},now),null,'no historical break replay');assert.equal(armRangeSweep(bundle(),{price:100,at:now-10001},now),null);
assert.equal(rangeSweepFlow(flow(now,100).slice(1),now),null);const future=flow(now,100);future.at(-1).isClosed=false;assert.equal(rangeSweepFlow(future,now),null);
assert.equal(inspectRangeSweepFlow([],now).reason,'FEWER_THAN_21_CLOSED_1M');
const goodFlow=flow(now,100);assert.equal(inspectRangeSweepFlow(goodFlow,now).status,'READY');
const gapFlow=structuredClone(goodFlow);gapFlow[5].openTime--;assert.equal(inspectRangeSweepFlow(gapFlow,now).reason,'CLOSED_1M_GAP_OR_INVALID');
const noTaker=structuredClone(goodFlow);delete noTaker.at(-1).takerBuyQuoteVolume;assert.equal(inspectRangeSweepFlow(noTaker,now).reason,'TAKER_BUY_MISSING_OR_INVALID');
const noVolume=structuredClone(goodFlow);noVolume.at(-1).quoteVolume=0;noVolume.at(-1).takerBuyQuoteVolume=0;assert.equal(inspectRangeSweepFlow(noVolume,now).reason,'LAST_MINUTE_ZERO_VOLUME');
assert.equal(inspectRangeSweepFlow(goodFlow,now+120000).reason,'CLOSED_1M_STALE');
const missingPayload=rangeSweepDiscordPayload({symbol:'TESTUSDT',kind:'BREAKOUT',side:'UNKNOWN',at:now,reason:'test',base:{},flow:null,flowDiagnostic:inspectRangeSweepFlow([],now)});assert.match(missingPayload.embeds[0].title,/THIẾU DỮ LIỆU XÁC NHẬN/);assert.equal(missingPayload.embeds[0].color,0x95a5a6);
const readyPayload=rangeSweepDiscordPayload({...missingPayload,symbol:'TESTUSDT',kind:'BREAKOUT',side:'UNKNOWN',at:now,reason:'test',base:{},flow:inspectRangeSweepFlow(goodFlow,now).flow});assert.match(readyPayload.embeds[0].title,/ĐỦ DỮ LIỆU/);
assert.deepEqual(wired.flowPrioritySymbols(),['TESTUSDT']);assert.equal(wired.flowCoverage().unavailable,1);
let repairRows=[],repairs=0;const repairing=new RangeLiquiditySweepWatch({getRows:()=>repairRows,getBaseRows:()=>rawBase,discordSender:async()=>({sent:1}),seedFlow:async()=>{repairs++;repairRows=goodFlow;},now:()=>now});repairing.ready=true;repairing.arm(productionBundle,point());await repairing.repairFlow();assert.equal(repairs,1);assert.equal(repairing.flowRepair.refreshed,1);await repairing.repairFlow();assert.equal(repairs,1,'no repeat inside10seconds / ready data');assert.equal(repairing.flowCoverage().ready,1);
const cases=[];
for(const direction of ['UPPER','LOWER'])for(const reaction of ['REJECTION','CONTINUATION']){
 now=base+10000;const c=armRangeSweep(bundle(),point(),now),up=direction==='UPPER',price=up?100.16:99.84;let events=[];
 const tick=(p,rows)=>{now+=1000;const out=advanceRangeSweep(c,{price:p,at:now},rows??flow(now,p,up?60:40),now);events.push(...out);return out;};
 assert.equal(tick(price)[0].side,'UNKNOWN');while(now<base+61000)tick(price);assert.ok(events.some(e=>e.kind==='DIRECTION_CONFIRMED'&&e.side===(up?'LONG':'SHORT')));
 const z=c.target;tick(up?z.high:z.low);assert.ok(events.some(e=>e.kind==='ZONE_TOUCH'&&e.side==='UNKNOWN'));
 const bullish=up?reaction==='CONTINUATION':reaction==='REJECTION',p=bullish?z.high+.02:z.low-.02;
 while(now<base+121000)tick(p,flow(now,p,bullish?60:40,reaction==='REJECTION'?1.6:3));
 const e=events.find(e=>e.kind===reaction);assert.ok(e);assert.equal(e.side,bullish?'LONG':'SHORT');assert.equal(c.done,true);cases.push(...events);
 const payload=rangeSweepDiscordPayload(e);assert.equal(payload.embeds[0].color,RANGE_SWEEP_COLORS[e.side]);assert.ok(payload.embeds[0].title.length<256);assert.ok(payload.embeds[0].fields.every(f=>f.value.length<=1024));assert.deepEqual(payload.allowed_mentions.parse,[]);
}
now=base+10000;const gap=armRangeSweep(bundle(),point(),now);advanceRangeSweep(gap,{price:101,at:now+11000},[],now+11000);assert.equal(gap.invalidReason,'MARK_GAP');
now=base+10000;const invalid=armRangeSweep(bundle(),point(),now);assert.deepEqual(advanceRangeSweep(invalid,{price:101,at:NaN},[],now),[]);assert.ok(Number.isFinite(invalid.lastTickAt));
const uncertain=rangeSweepDiscordPayload({...cases[0],side:'UNKNOWN'});assert.equal(uncertain.embeds[0].color,0x95a5a6);
assert.throws(()=>createRangeSweepDiscordSender({webhookUrl:'https://example.com/webhook'}));let posts=0;
const sender=createRangeSweepDiscordSender({webhookUrl:'https://discord.com/api/webhooks/123/mock',fetchImpl:async(url,opts)=>{posts++;assert.equal(opts.redirect,'error');assert.equal(JSON.parse(opts.body).embeds[0].color,RANGE_SWEEP_COLORS.LONG);return {ok:true,status:204};}});assert.equal((await sender(cases.find(e=>e.side==='LONG'))).httpStatus,204);assert.equal(posts,1);
const file=join(await mkdtemp(join(tmpdir(),'range-sweep-')),'watch.json'),sent=[];now=base+10000;
const watch=new RangeLiquiditySweepWatch({file,now:()=>now,getRows:()=>flow(now,100.16),discordSender:async e=>{const s=JSON.parse(await readFile(file,'utf8'));assert.equal(s.history.at(-1).delivery.status,'PENDING');sent.push(structuredClone(e));return {sent:1,httpStatus:204};}});
await watch.init();watch.arm(bundle(),point());assert.equal(sent.length,0);now+=1000;watch.onMark({symbol:'TESTUSDT',markPrice:100.16,eventTime:now});await watch.queue;assert.equal(sent.length,1);assert.equal(watch.snapshot().affectsOrders,false);const restart=new RangeLiquiditySweepWatch({file,now:()=>now,discordSender:()=>{throw Error('replayed');}});await restart.init();assert.equal(restart.history.length,1);assert.equal(restart.cohorts.size,0);
const mutedFile=join(await mkdtemp(join(tmpdir(),'range-sweep-muted-')),'state.json');let mutedSent=0;
const muted=new RangeLiquiditySweepWatch({file:mutedFile,now:()=>now,discordSender:async()=>{mutedSent++;return {sent:1,httpStatus:204};}});await muted.init();
await muted.record({...cases[0],id:'missing-flow-only',symbol:'MUTEDUSDT',at:now,side:'UNKNOWN',flow:null});assert.equal(mutedSent,0);assert.equal(muted.history.at(-1).delivery.status,'DATA_NOT_READY');
const readyEvent=cases.find(e=>e.side==='LONG');await muted.record({...readyEvent,id:'fresh-confirmation',symbol:'MUTEDUSDT',at:now});assert.equal(mutedSent,1);assert.equal(muted.history.at(-1).delivery.status,'SENT');
assert.equal(muted.snapshot().deliveryPolicy.greyRequiresValidFlow,true);
const bad=join(tmpdir(),'range-corrupt-'+Date.now()+'.json');await writeFile(bad,'{');const broken=new RangeLiquiditySweepWatch({file:bad,discordSender:()=>{throw Error('send');}});await broken.init();assert.ok(broken.error);broken.arm(bundle(),point());assert.equal(broken.cohorts.size,0);
console.log('PASS range sweep: causal frozen base/zones, no trend/missing/stale/gap/replay; UP/DOWN early+rejection+continuation; exact red/green/grey; durable reserve before Discord; safe restart/storage failure. Mock only.');
