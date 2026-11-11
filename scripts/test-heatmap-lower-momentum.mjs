import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {evaluateLowerMomentum} from '../src/heatmapLowerMomentum.js';
import {lowerMomentumState,validLowerMomentum,lowerMomentumKey,lowerMomentumClosedStats} from '../public/heatmap-lower-momentum-model.js';
import {blocksLowerMomentumEntry,LOWER_MOMENTUM_BLOCK_STATUS} from '../src/heatmapLowerMomentumEntryGuard.js';
import {normalizeLiquidLiveCardKey,matchLiquidLiveCardWhitelist} from '../src/liquidLiveCardWhitelist.js';
import {HeatmapSweepWatch} from '../src/heatmapSweepWatch.js';import {PROFILE_RATIO} from '../src/heatmapEntryScenarios.js';
import {HeatmapSweepBinanceRunner,HEATMAP_SWEEP_ROUTES,heatmapSweepRouteKey,buildHeatmapSweepOrder} from '../src/heatmapSweepBinance.js';
import {AutoEntryControls} from '../src/autoEntryControls.js';import {heatmapSweepDiscordPayload} from '../src/heatmapSweepDiscord.js';
import {LONG_QUALITY_LABELS} from '../public/heatmap-long-quality-model.js';import {evaluateHeatmapLongQuality} from '../src/heatmapLongQuality.js';
import {longQualityInputs} from './fixtures-heatmap-long-quality.mjs';import {lowerMomentumInputs} from './fixtures-heatmap-lower-momentum.mjs';
const STEP=300000,base=Math.floor(Date.now()/STEP)*STEP,dir=await mkdtemp(join(tmpdir(),'lower-momentum-'));let now=base+1000;
const event={id:'test',symbol:'TESTUSDT',kind:'ALL_TRACKED_LOWER_SWEPT',direction:'LOWER',at:now,observedAt:now,markPrice:94.9,viewRange:'24h',referencePrice:100,maxDistancePct:5,clearedCount:1,totalCount:1,zones:[{low:95,high:96,cleared:true}]};
const input=lowerMomentumInputs(event);event.lowerMomentum=evaluateLowerMomentum(input);assert.equal(event.lowerMomentum.state,'CONTINUATION');assert(validLowerMomentum(event));assert(blocksLowerMomentumEntry(event));assert.equal(event.lowerMomentum.features.volumeRatio,2);
assert.equal(lowerMomentumState({return15m:-1,return1h:-3,volumeRatio:1.5,closePositionPct:25}),'CONTINUATION');
for(const patch of [{return15m:-.99},{return1h:-2.99},{volumeRatio:1.49},{closePositionPct:25.01}])assert.equal(lowerMomentumState({...event.lowerMomentum.features,...patch}),'NOT_CONFIRMED');
for(const mutate of [x=>x.coinRows.pop(),x=>x.coinRows.splice(4,1),x=>x.coinReadAt--,x=>x.coinRows[4][2]=1,x=>x.coinRows.at(-1)[7]=NaN,x=>x.coinRows.forEach(r=>r[7]=0),x=>{const r=x.coinRows.at(-1);r[1]=r[2]=r[3]=r[4];}]){const x=structuredClone(input);mutate(x);assert.equal(evaluateLowerMomentum(x).state,'UNKNOWN');}
const future=structuredClone(input);future.coinRows.push([base,1,1e9,1,1e9,1,base+STEP-1,1e9]);assert.deepEqual(evaluateLowerMomentum(future),event.lowerMomentum);
const raw={symbol:event.symbol,savedAt:now,price:input.coinRows,oi:Array.from({length:13},(_,i)=>({symbol:event.symbol,timestamp:base-(13-i)*STEP,sumOpenInterest:100+i}))};
assert.equal(evaluateLowerMomentum({event,now,raw}).state,'CONTINUATION');assert.equal(evaluateLowerMomentum({event,now,raw:{...raw,savedAt:now-120001}}).state,'UNKNOWN');
const ratio={symbol:event.symbol,period:'5m',source:'BINANCE_TOP_TRADER_ACCOUNT_RATIO',fetchedAt:now,rows:Array.from({length:13},(_,i)=>({timestamp:base-(13-i)*STEP,longShortRatio:2,longAccount:2/3,shortAccount:1/3}))};
const optional=evaluateLowerMomentum({...input,raw,ratio});assert.equal(optional.features.ratioLevel,2);assert(Math.abs(optional.features.oiChange1h-12)<1e-9);
assert.equal(evaluateLowerMomentum({...input,ratio:{...ratio,source:'POSITION_RATIO'}}).features.ratioLevel,null);assert.equal(event.lowerMomentum.features.ratioLevel,null);
assert(!blocksLowerMomentumEntry({...event,direction:'UPPER'}));assert(!blocksLowerMomentumEntry({...event,lowerMomentum:undefined}));
for(const state of ['CONTINUATION','NOT_CONFIRMED','UNKNOWN']){
 const e=structuredClone(event),x=lowerMomentumInputs(e);if(state==='UNKNOWN')x.coinRows=[];if(state==='NOT_CONFIRMED')x.coinRows.at(-1)[7]=100;e.lowerMomentum=evaluateLowerMomentum(x);assert.equal(e.lowerMomentum.state,state);assert(validLowerMomentum(e));
 const key=lowerMomentumKey(state),r={symbol:e.symbol,clientOrderId:'id',signalSource:'heatmap-full-sweep',direction:'LONG',positionStatus:'CLOSED',realizedRoePct:5,heatmapSweepAtEntry:e};
 assert.equal(normalizeLiquidLiveCardKey(key),key);assert(!matchLiquidLiveCardWhitelist(r,[]).allowed);assert(matchLiquidLiveCardWhitelist(r,[key]).allowed);assert.equal(lowerMomentumClosedStats({a:r,b:r},state).closed,1);assert(lowerMomentumClosedStats({a:r},state).eligible);
 for(const patch of [{realizedRoePct:4},{positionStatus:'OPEN'},{isDca:true},{direction:'SHORT'},{heatmapSweepAtEntry:{...e,lowerMomentum:undefined}}])assert(!lowerMomentumClosedStats({a:{...r,...patch}},state).eligible);
 assert.equal(lowerMomentumClosedStats({a:{...r,closeGroupId:'x'},b:{...r,closeGroupId:'x',clientOrderId:'other',signalSource:'other'}},state).closed,0);
 const text=JSON.stringify(heatmapSweepDiscordPayload(e));assert(heatmapSweepDiscordPayload(e).embeds[0].fields.some(f=>f.name==='ĐÁNH GIÁ ĐỘNG LƯỢNG TRƯỚC QUÉT · PHÍA DƯỚI'));assert(text.includes('ĐÀ XẢ'));assert(text.includes('KHÔNG phải xác nhận hồi'));for(const f of heatmapSweepDiscordPayload(e).embeds[0].fields)assert(f.value.length<=1024,f.name);
}
const discord=heatmapSweepDiscordPayload({...event,binance:{status:LOWER_MOMENTUM_BLOCK_STATUS}});assert.equal(discord.embeds[0].color,0xff627e);assert(discord.embeds[0].title.includes('CÒN ĐÀ XẢ'));assert(discord.embeds[0].fields.find(f=>f.name==='BINANCE').value.includes('KHÔNG GỬI LỆNH'));assert(JSON.stringify(discord).includes('coinglass-heatmap-lab?symbol=TESTUSDT'));
const controls=new AutoEntryControls(join(dir,'controls.json'));controls.seed(HEATMAP_SWEEP_ROUTES);const s=controls.read();s.enabled=true;s.routes[heatmapSweepRouteKey('LONG')].enabled=true;s.routes[heatmapSweepRouteKey('LONG')].enabledAt=base;controls.save(s);
const d={symbol:event.symbol,source:'BINANCE_LOCAL',range:'24h',step:STEP,end:base,candles:[{time:base-STEP,close:100}],profiles:Array.from({length:3},(_,i)=>({at:base-1-(2-i)*STEP,oiFresh:true,mark:true,bins:[96,98].map(p=>[Math.round(Math.log(p)/Math.log(PROFILE_RATIO)),100])}))};
const file=join(dir,'watch.json'),order=[],store={};let submits=0,contexts=0;
const opts={controls,now:()=>now,startedAt:base,storage:{load:async()=>null,save:async s=>{store.state=s;}},getContext:async()=>{contexts++;return {enabled:true,positions:[],openOrders:[],markPrice:95};},submit:async()=>{submits++;return {status:'SUBMITTED'};},getLongQualityGate:async()=>({allowed:true})};
const runner=new HeatmapSweepBinanceRunner(opts),watch=new HeatmapSweepWatch({file,now:()=>now,getLive:()=>({price:100,at:now}),loadBundle:async()=>({models:[1,3].map(model=>({model,status:'OK',data:d}))}),
 assessLower:e=>{order.push('MOMENTUM');return evaluateLowerMomentum(lowerMomentumInputs(e));},assessLong:async e=>{order.push('QUALITY');return evaluateHeatmapLongQuality(longQualityInputs(e));},
 onFullSweep:async e=>{order.push('ENTRY');assert.deepEqual(JSON.parse(await readFile(file,'utf8')).history.at(-1).lowerMomentum,e.lowerMomentum);return runner.process(e);},
 discordSender:async e=>{order.push('DISCORD');assert.equal(e.binance.status,LOWER_MOMENTUM_BLOCK_STATUS);return {sent:1};}});
await watch.update({symbol:event.symbol,enabled:true});await watch.scan();now+=1000;const low=watch.watches[0].lowerCohort.zones.at(-1).low;await watch.onMark({symbol:event.symbol,markPrice:low*.9995,eventTime:now});
assert.deepEqual(order,['MOMENTUM','QUALITY','ENTRY','DISCORD']);assert.equal(submits,0);assert.equal(contexts,0);const e=structuredClone(watch.history.at(-1));assert(watch.isCurrentFullSweep(e));const stripped=structuredClone(e);delete stripped.lowerMomentum;assert(!watch.isCurrentFullSweep(stripped));assert.equal((await runner.process(e)).status,'DEDUPED');
for(const label of [null,LONG_QUALITY_LABELS.GOOD,LONG_QUALITY_LABELS.BAD]){
 const state=controls.read();for(const l of [LONG_QUALITY_LABELS.GOOD,LONG_QUALITY_LABELS.BAD]){const r=state.routes[heatmapSweepRouteKey('LONG',l)];r.enabled=l===label;r.enabledAt=base;}controls.save(state);
 const sample=structuredClone(e);sample.longQuality=evaluateHeatmapLongQuality(longQualityInputs(sample,{priceDirection:label===LONG_QUALITY_LABELS.BAD?1:-1}));
 assert.equal((await new HeatmapSweepBinanceRunner(opts).process(sample)).status,LOWER_MOMENTUM_BLOCK_STATUS);
 const p=buildHeatmapSweepOrder(sample,{now,enabledAt:base,startedAt:base,markPrice:95,qualityLabel:label});assert(p);
 const old={version:p.fillAnchorVersion,attempts:{[e.id]:{id:e.id,symbol:e.symbol,side:'LONG',at:now,status:'SUBMITTED',orderId:123,clientOrderId:p.clientOrderId,planBuiltAt:now,plan:p}}};
 const recovery=new HeatmapSweepBinanceRunner({...opts,storage:{load:async()=>old,save:async()=>assert.fail('readonly')}});assert.deepEqual(await recovery.protectionPlanFor({symbol:e.symbol,side:'LONG',orderId:123,clientOrderId:p.clientOrderId}),p);
}
assert.equal(submits,0);assert.equal(contexts,0);
const state=controls.read();for(const l of [LONG_QUALITY_LABELS.GOOD,LONG_QUALITY_LABELS.BAD])state.routes[heatmapSweepRouteKey('LONG',l)].enabled=false;controls.save(state);
for(const mode of ['NOT_CONFIRMED','UNKNOWN','LEGACY']){const sample=structuredClone(e),x=lowerMomentumInputs(sample);if(mode==='LEGACY')delete sample.lowerMomentum;else{if(mode==='UNKNOWN')x.coinRows=[];else x.coinRows.at(-1)[7]=100;sample.lowerMomentum=evaluateLowerMomentum(x);}assert.equal((await new HeatmapSweepBinanceRunner(opts).process(sample)).status,'SUBMITTED');}
assert.equal(submits,3);console.log('PASS lower momentum: cache-only/closed/causal/unknown/optional data, frozen before queue/entry, Discord after veto, all LONG tiers blocked no IO, old protection, other states, whitelist closed>4/defaultOFF/dedupe/mixed. Mock only.');
