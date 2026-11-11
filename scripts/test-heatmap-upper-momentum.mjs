import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {evaluateUpperMomentum} from '../src/heatmapUpperMomentum.js';
import {upperMomentumKey,upperMomentumChecks,upperMomentumState,validUpperMomentum,upperMomentumClosedStats} from '../public/heatmap-upper-momentum-model.js';
import {normalizeLiquidLiveCardKey,matchLiquidLiveCardWhitelist} from '../src/liquidLiveCardWhitelist.js';
import {heatmapSweepDiscordPayload} from '../src/heatmapSweepDiscord.js';
import {HeatmapSweepWatch} from '../src/heatmapSweepWatch.js';
import {PROFILE_RATIO} from '../src/heatmapEntryScenarios.js';
import {buildHeatmapSweepOrder,HeatmapSweepBinanceRunner,HEATMAP_SWEEP_ROUTES,heatmapSweepRouteKey} from '../src/heatmapSweepBinance.js';
import {AutoEntryControls} from '../src/autoEntryControls.js';
import {blocksUpperMomentumEntry,UPPER_MOMENTUM_BLOCK_STATUS} from '../src/heatmapUpperMomentumEntryGuard.js';
const STEP=300000,base=Math.floor(Date.now()/STEP)*STEP;let now=base+1000;
export function momentumFixture(e){const end=Math.floor(e.at/STEP)*STEP;return {event:e,now:e.observedAt,coinReadAt:e.observedAt,coinRows:Array.from({length:21},(_,i)=>{const t=end-(21-i)*STEP,p=90+i;return [t,p-.5,p+.05,p-1,p,100,t+STEP-1,i===20?2000:1000];})};}
const event={id:'momentum-test',symbol:'TESTUSDT',kind:'ALL_TRACKED_UPPER_SWEPT',direction:'UPPER',at:now,observedAt:now,markPrice:111,viewRange:'24h',referencePrice:100,maxDistancePct:5,clearedCount:1,totalCount:1,zones:[{low:109,high:110,cleared:true}]};
const input=momentumFixture(event);event.upperMomentum=evaluateUpperMomentum(input);assert.equal(event.upperMomentum.state,'CONTINUATION');assert(validUpperMomentum(event));
assert.equal(event.upperMomentum.features.volumeRatio,2);assert.equal(event.upperMomentum.features.ratioLevel,null,'missing optional ratio does not fabricate a short bias');
const future=structuredClone(input);future.coinRows.push([base,1,999,1,999,100,base+STEP-1,1e20]);assert.deepEqual(evaluateUpperMomentum(future),event.upperMomentum);
for(const mutate of [x=>x.coinRows.pop(),x=>x.coinRows.splice(4,1),x=>x.coinReadAt--,x=>x.coinRows[5][2]=1,x=>x.coinRows[20][7]=NaN,x=>x.coinRows.forEach(r=>r[7]=0),x=>{const r=x.coinRows[20];r[1]=r[2]=r[3]=r[4];}]){const x=structuredClone(input);mutate(x);assert.equal(evaluateUpperMomentum(x).state,'UNKNOWN');}
const no={...structuredClone(event),id:'no'};const noInput=momentumFixture(no);noInput.coinRows.at(-1)[7]=100;no.upperMomentum=evaluateUpperMomentum(noInput);assert.equal(no.upperMomentum.state,'NOT_CONFIRMED');assert(validUpperMomentum(no));
const unknown={...event,id:'unknown'};unknown.upperMomentum=evaluateUpperMomentum({event:unknown,now});assert(validUpperMomentum(unknown));
assert.equal(upperMomentumState({return15m:1,return1h:3,volumeRatio:1.5,closePositionPct:75}),'CONTINUATION');
assert.equal(upperMomentumChecks({}).filter(c=>c.pass===null).length,4);
const rawInput={event,now,raw:{symbol:event.symbol,savedAt:now,price:input.coinRows}};assert.equal(evaluateUpperMomentum(rawInput).state,'CONTINUATION');rawInput.raw.savedAt=now-120001;assert.equal(evaluateUpperMomentum(rawInput).state,'UNKNOWN');
const ratioInput=structuredClone(input);ratioInput.raw={symbol:event.symbol,savedAt:now,oi:Array.from({length:13},(_,i)=>({symbol:event.symbol,timestamp:base-(13-i)*STEP,sumOpenInterest:100+i}))};
ratioInput.ratio={symbol:event.symbol,period:'5m',source:'BINANCE_TOP_TRADER_ACCOUNT_RATIO',fetchedAt:now,rows:Array.from({length:13},(_,i)=>({timestamp:base-(13-i)*STEP,longShortRatio:2,longAccount:2/3,shortAccount:1/3}))};
let q=evaluateUpperMomentum(ratioInput);assert.equal(q.features.ratioLevel,2);assert.equal(q.features.oiChange1h,12.00000000000001);
ratioInput.ratio.rows.push({timestamp:base,longShortRatio:99});ratioInput.raw.oi.push({timestamp:base,sumOpenInterest:99999});assert.deepEqual(evaluateUpperMomentum(ratioInput),q);
ratioInput.ratio.source='POSITION_RATIO';assert.equal(evaluateUpperMomentum(ratioInput).features.ratioLevel,null);
for(const e of [event,no,unknown]){
 const r={symbol:e.symbol,clientOrderId:e.id,signalSource:'heatmap-full-sweep',direction:'SHORT',positionStatus:'CLOSED',realizedRoePct:5,heatmapSweepAtEntry:e},key=upperMomentumKey(e.upperMomentum.state);
 assert.equal(normalizeLiquidLiveCardKey(key),key);assert(!matchLiquidLiveCardWhitelist(r,[]).allowed);assert(matchLiquidLiveCardWhitelist(r,[key]).allowed);
 assert.equal(upperMomentumClosedStats({a:r,b:r},e.upperMomentum.state).closed,1);assert(upperMomentumClosedStats({a:r},e.upperMomentum.state).eligible);
 for(const patch of [{realizedRoePct:4},{positionStatus:'OPEN'},{isDca:true},{direction:'LONG'},{heatmapSweepAtEntry:{...e,upperMomentum:undefined}}])assert(!upperMomentumClosedStats({a:{...r,...patch}},e.upperMomentum.state).eligible);
 assert.equal(upperMomentumClosedStats({a:{...r,closeGroupId:'x'},b:{...r,clientOrderId:'other',closeGroupId:'x',signalSource:'other'}},e.upperMomentum.state).closed,0);
 const payload=heatmapSweepDiscordPayload(e),text=JSON.stringify(payload);assert(payload.embeds[0].fields.some(f=>f.name==='ĐÁNH GIÁ ĐỘNG LƯỢNG TRƯỚC QUÉT · PHÍA TRÊN'));assert(text.includes('KHÔNG có nghĩa đảo chiều'));assert(text.includes('coinglass-heatmap-lab?symbol=TESTUSDT'));assert(payload.embeds[0].title.length<=256);for(const f of payload.embeds[0].fields)assert(f.value.length<=1024,f.name);
}
// Snapshot must be persisted before entry and cannot be stripped/repainted later.
const dir=await mkdtemp(join(tmpdir(),'heatmap-momentum-')),file=join(dir,'watch.json'),ordered=[];
const d={symbol:event.symbol,source:'BINANCE_LOCAL',range:'24h',step:STEP,end:base,candles:[{time:base-STEP,close:100}],profiles:Array.from({length:3},(_,i)=>({at:base-1-(2-i)*STEP,oiFresh:true,mark:true,bins:[102,104].map(p=>[Math.round(Math.log(p)/Math.log(PROFILE_RATIO)),100])}))};
const w=new HeatmapSweepWatch({file,now:()=>now,loadBundle:async()=>({models:[1,3].map(model=>({model,status:'OK',data:d}))}),getLive:()=>({price:100,at:now}),
 assessUpper:e=>{ordered.push('ASSESS');return evaluateUpperMomentum(momentumFixture(e));},
 onFullSweep:async e=>{ordered.push('ENTRY');assert(validUpperMomentum(e));assert.deepEqual(JSON.parse(await readFile(file,'utf8')).history.at(-1).upperMomentum,e.upperMomentum);return {status:'OFF'};},discordSender:async()=>{ordered.push('DISCORD');return {sent:1};}});
await w.update({symbol:event.symbol,enabled:true});await w.scan();now+=1000;await w.onMark({symbol:event.symbol,markPrice:105,eventTime:now});assert.deepEqual(ordered,['ASSESS','ENTRY','DISCORD']);
const frozen=structuredClone(w.history.at(-1));assert(w.isCurrentFullSweep(frozen));delete frozen.upperMomentum;assert(!w.isCurrentFullSweep(frozen));
const e=w.history.at(-1),opts={now,enabledAt:base,startedAt:base,markPrice:105};const withLabel=buildHeatmapSweepOrder(e,opts),withoutLabel=buildHeatmapSweepOrder({...e,upperMomentum:undefined},opts);assert(withLabel&&withoutLabel);
for(const field of ['signalLabel','marginUsdt','leverage','notionalUsdt','stopLossPrice','takeProfitPrice','maxOpenPositions'])assert.equal(withLabel[field],withoutLabel[field],field+' annotation must not affect orders');
console.log('PASS upper momentum: causal closed data/cache-only/future isolation, optional ratio/OI, three states, frozen pre-entry proof, Discord limits, whitelist defaultOFF/closed>4/mixed exclusions, legacy entry sizing unchanged. Mock only.');
const controls=new AutoEntryControls(join(dir,'controls.json'));controls.seed(HEATMAP_SWEEP_ROUTES);const settings=controls.read();settings.enabled=true;settings.routes[heatmapSweepRouteKey('SHORT')].enabled=true;settings.routes[heatmapSweepRouteKey('SHORT')].enabledAt=base;controls.save(settings);
let contexts=0,submitted=0;const store={};const runner=new HeatmapSweepBinanceRunner({controls,now:()=>now,startedAt:base,storage:{load:async()=>null,save:async s=>{store.state=s;}},getContext:async()=>{contexts++;return {enabled:true,positions:[],openOrders:[],markPrice:105};},submit:async()=>{submitted++;return {status:'SUBMITTED'};}});
assert(blocksUpperMomentumEntry(e));assert(!blocksUpperMomentumEntry(no));assert(!blocksUpperMomentumEntry(unknown));assert(!blocksUpperMomentumEntry({...e,upperMomentum:undefined}));
assert.equal((await runner.process(e)).status,UPPER_MOMENTUM_BLOCK_STATUS);assert.equal(contexts,0);assert.equal(submitted,0);assert.equal(store.state.attempts[e.id].status,UPPER_MOMENTUM_BLOCK_STATUS);assert.equal((await runner.process(e)).status,'DEDUPED');
for(const state of ['NOT_CONFIRMED','UNKNOWN','LEGACY']){const next=structuredClone(e);if(state==='LEGACY')delete next.upperMomentum;else{const input=momentumFixture(next);if(state==='UNKNOWN')input.coinRows=[];else input.coinRows.at(-1)[7]=100;next.upperMomentum=evaluateUpperMomentum(input);}const other=new HeatmapSweepBinanceRunner({controls,now:()=>now,startedAt:base,storage:{load:async()=>null,save:async()=>{}},getContext:async()=>({enabled:true,positions:[],openOrders:[],markPrice:105}),submit:async()=>{submitted++;return {status:'SUBMITTED'};}});assert.equal((await other.process(next)).status,'SUBMITTED');}
assert.equal(submitted,3,'other states retain existing behavior');
// An already accepted old CONTINUATION plan remains recoverable, even though new entries now block.
const saved={version:withLabel.fillAnchorVersion,attempts:{[e.id]:{id:e.id,symbol:e.symbol,side:'SHORT',at:now,status:'SUBMITTED',orderId:123,clientOrderId:withLabel.clientOrderId,planBuiltAt:now,plan:withLabel}}};
const recovery=new HeatmapSweepBinanceRunner({controls,storage:{load:async()=>saved,save:async()=>assert.fail('must not rewrite protection')}});assert.deepEqual(await recovery.protectionPlanFor({symbol:e.symbol,side:'SHORT',orderId:123,clientOrderId:withLabel.clientOrderId}),withLabel);
console.log('PASS continuation entry block: no account/submission IO, durable dedupe, other states preserved, old accepted plan protection recoverable.');
