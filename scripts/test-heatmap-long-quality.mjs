import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {HeatmapSweepWatch} from '../src/heatmapSweepWatch.js';
import {PROFILE_RATIO} from '../src/heatmapEntryScenarios.js';
import {HeatmapLongQualityLoader,evaluateHeatmapLongQuality} from '../src/heatmapLongQuality.js';
import {LONG_QUALITY_LABELS,longQualityChecks,longQualityKey,validLongQuality,longQualityClosedStats} from '../public/heatmap-long-quality-model.js';
import {HeatmapSweepBinanceRunner,HEATMAP_SWEEP_ROUTES,heatmapSweepRouteKey,buildHeatmapSweepOrder,validHeatmapSweepOrder} from '../src/heatmapSweepBinance.js';
import {AutoEntryControls} from '../src/autoEntryControls.js';
import {heatmapSweepDiscordPayload} from '../src/heatmapSweepDiscord.js';
import {matchLiquidLiveCardWhitelist,normalizeLiquidLiveCardKey} from '../src/liquidLiveCardWhitelist.js';
import {longQualityInputs} from './fixtures-heatmap-long-quality.mjs';
const STEP=300000,base=Math.floor(Date.now()/STEP)*STEP;let now=base+5000;
const dir=await mkdtemp(join(tmpdir(),'heatmap-quality-')),file=join(dir,'watch.json');
const data={symbol:'TESTUSDT',source:'BINANCE_LOCAL',range:'24h',step:STEP,end:base,candles:[{time:base-STEP,close:100}],profiles:Array.from({length:3},(_,i)=>({at:base-1-(2-i)*STEP,oiFresh:true,mark:true,bins:[96,98,102,104].map(p=>[Math.round(Math.log(p)/Math.log(PROFILE_RATIO)),100])}))};
const ordered=[];
const watch=new HeatmapSweepWatch({file,now:()=>now,loadBundle:async()=>({models:[1,3].map(model=>({model,status:'OK',data}))}),getLive:()=>({price:100,at:now}),
 assessLong:async e=>{ordered.push('ASSESS');return evaluateHeatmapLongQuality(longQualityInputs(e));},
 onFullSweep:async e=>{ordered.push('ENTRY');assert(validLongQuality(e));assert.deepEqual(JSON.parse(await readFile(file,'utf8')).history.at(-1).longQuality,e.longQuality);return {status:'OFF'};},
 discordSender:async e=>{ordered.push('DISCORD');assert(validLongQuality(e));return {sent:1};}});
await watch.update({symbol:'TESTUSDT',enabled:true});await watch.scan();const c=watch.watches[0].lowerCohort,low=c.zones.at(-1).low;
now+=1000;await watch.onMark({symbol:'TESTUSDT',markPrice:low*.9995,eventTime:now});
assert.deepEqual(ordered,['ASSESS','ENTRY','DISCORD']);const event=structuredClone(watch.history.at(-1)),good=structuredClone(event);assert.equal(good.longQuality.grade,'GOOD');
assert(watch.isCurrentFullSweep(good));const forged=structuredClone(good);forged.longQuality.features.rsi14=99;assert(!watch.isCurrentFullSweep(forged),'current event identity also locks frozen quality proof');
const bad={...structuredClone(event),markPrice:low*.998};bad.longQuality=evaluateHeatmapLongQuality(longQualityInputs(bad));assert.equal(bad.longQuality.grade,'BAD');assert(validLongQuality(bad));
for(const [options,checkKey] of [[{priceDirection:1},'RSI'],[{ratioChange:-5.01},'RATIO'],[{oiChange:-2.01},'OI']]){
 const q=evaluateHeatmapLongQuality(longQualityInputs(good,options));assert.equal(q.grade,'BAD');assert.equal(q.checks.find(c=>c.key===checkKey).pass,false);
}
assert.equal(evaluateHeatmapLongQuality(longQualityInputs(good,{ratioChange:-5,oiChange:-2})).grade,'GOOD');
for(const mutate of [x=>x.raw.price.pop(),x=>x.raw.price.splice(220,1),x=>x.raw.savedAt=event.at-120001,x=>x.raw.symbol='OTHERUSDT',x=>x.ratio.rows.splice(5,1),x=>x.ratio.fetchedAt=now-60001,x=>x.ratio.rows[0].longAccount=.99,x=>x.raw.oi.pop()]){
 const input=longQualityInputs(good);mutate(input);assert.equal(evaluateHeatmapLongQuality(input).grade,'UNKNOWN');
}
const future=longQualityInputs(good);future.raw.price.push([base,100,999999,1,999999,1,base+STEP-1,1,1,1,1]);future.ratio.rows.push({timestamp:base,longShortRatio:100,longAccount:.99,shortAccount:.01});assert.deepEqual(evaluateHeatmapLongQuality(future).features,good.longQuality.features,'future/incomplete bars and ratio cannot repaint');
const unknown={...structuredClone(good),longQuality:evaluateHeatmapLongQuality({event:good,now})};assert.equal(unknown.longQuality.grade,'UNKNOWN');assert(validLongQuality(unknown));
for(const e of [good,bad,unknown]){
 const payload=heatmapSweepDiscordPayload({...e,binance:{status:'OFF'}}),text=JSON.stringify(payload);assert(text.includes(e.longQuality.grade==='GOOD'?'NHÓM TỐT':e.longQuality.grade==='BAD'?'NHÓM XẤU':'CHƯA ĐÁNH GIÁ'));assert(text.includes('BTC15m'));assert(text.includes('coinglass-heatmap-lab?symbol=TESTUSDT'));
 assert(payload.embeds[0].title.length<=256);for(const f of payload.embeds[0].fields)assert(f.value.length<=1024,f.name+' exceeds Discord limit');
 assert(text.includes('LONG MARKET 2'),'classification proposal does not fake active size');
}
const controls=new AutoEntryControls(join(dir,'controls.json'));controls.seed(HEATMAP_SWEEP_ROUTES);
const keys=[LONG_QUALITY_LABELS.GOOD,LONG_QUALITY_LABELS.BAD].map(label=>heatmapSweepRouteKey('LONG',label));
for(const key of keys)assert.equal(controls.read().routes[key].enabled,false);
const state=controls.read();state.enabled=true;for(const key of [...keys,heatmapSweepRouteKey('LONG')]){state.routes[key].enabled=true;state.routes[key].enabledAt=base+1000;}controls.save(state);
let submissions=0;const opts={controls,now:()=>now,startedAt:base+1000,storage:{load:async()=>null,save:async()=>{}},getContext:async()=>({enabled:true,positions:[],openOrders:[],markPrice:100}),submit:async p=>{submissions++;assert([1,5].includes(p.marginUsdt));return {status:'SUBMITTED',orderResult:{orderId:123}};}};
for(const e of [good,bad]){
 const label=e.longQuality.label,p=buildHeatmapSweepOrder(e,{now,enabledAt:base+1000,startedAt:base+1000,markPrice:100,qualityLabel:label});assert(p);assert.equal(p.marginUsdt,e.longQuality.proposedMarginUsdt);assert.equal(p.notionalUsdt,p.marginUsdt*5);assert(validHeatmapSweepOrder(p,100,now));controls.assertEntry(p);
 assert.equal(p.takeProfitPrice,102);assert.equal(p.stopLossPrice,94);assert.equal(p.maxOpenPositions,20);assert.equal(p.allowMinNotionalCeil,false);
 assert(!validHeatmapSweepOrder({...p,marginUsdt:p.marginUsdt+1},100,now));
 const blocked=new HeatmapSweepBinanceRunner(opts);assert.equal((await blocked.process(e)).status,'LONG_QUALITY_WHITELIST_OR_AVG_ROE');
 const active=new HeatmapSweepBinanceRunner({...opts,getLongQualityGate:async()=>({allowed:true})});assert.equal((await active.process(e)).status,'SUBMITTED');assert.equal((await active.process(e)).status,'DEDUPED');
 assert.deepEqual(await active.protectionPlanFor({symbol:e.symbol,side:'LONG',orderId:123,clientOrderId:p.clientOrderId}),p);
 const key=longQualityKey(label),record={symbol:e.symbol,clientOrderId:'test',signalSource:'heatmap-full-sweep',direction:'LONG',positionStatus:'CLOSED',realizedRoePct:5,heatmapSweepAtEntry:e};
 assert.equal(normalizeLiquidLiveCardKey(key),key);assert(!matchLiquidLiveCardWhitelist(record,[]).allowed);assert(matchLiquidLiveCardWhitelist(record,[key]).allowed);
 assert.equal(longQualityClosedStats({a:{record},b:{record}},label).closed,1);assert(longQualityClosedStats({a:{record}},label).eligible);assert(!longQualityClosedStats({a:{record:{...record,realizedRoePct:4}}},label).eligible);
 assert.equal(longQualityClosedStats({a:{record:{...record,isDca:true}}},label).closed,0);assert.equal(longQualityClosedStats({a:{record:{...record,positionStatus:'OPEN'}}},label).closed,0);
 const mixed={...record,closeGroupId:'group'};assert.equal(longQualityClosedStats({a:mixed,b:{...mixed,clientOrderId:'other',signalSource:'other'}},label).closed,0);
}
assert.equal(submissions,2);assert.equal((await new HeatmapSweepBinanceRunner(opts).process(unknown)).status,'LONG_QUALITY_UNKNOWN');
const s=controls.read();s.routes[keys[0]].enabled=false;controls.save(s);assert.equal((await new HeatmapSweepBinanceRunner(opts).process(good)).status,'OFF','matching tier OFF never falls through to legacy2');
s.routes[keys[1]].enabled=false;controls.save(s);
const legacy=new HeatmapSweepBinanceRunner({...opts,submit:async p=>{assert.equal(p.marginUsdt,2);return {status:'SUBMITTED'};}});assert.equal((await legacy.process(good)).status,'SUBMITTED','both tier routes OFF preserve old LONG2');
let release;const loader=new HeatmapLongQualityLoader({load:()=>new Promise(r=>{release=r;}),now:()=>now,timeoutMs:5,maxConcurrent:1});
const timed=await loader.assess(good);assert.equal(timed.grade,'UNKNOWN');assert.equal(loader.inflight,1,'timed-out underlying work still occupies concurrency');assert.equal((await loader.assess(good)).grade,'UNKNOWN');release(longQualityInputs(good));await new Promise(r=>setTimeout(r,0));assert.equal(loader.inflight,0);
// Compare runtime calculations with every frozen historical research row, using cache only.
try{
 const {readdir}=await import('node:fs/promises'),root='data/research/heatmap-long-context-20261026',out=JSON.parse(await readFile(root+'/results.json','utf8')),raw=new Map();
 for(const file of await readdir(root+'/raw')){const u=new URL(decodeURIComponent(file.slice(0,-5)),'https://fapi.binance.com'),key=u.pathname+':'+u.searchParams.get('symbol'),rs=JSON.parse(await readFile(root+'/raw/'+file,'utf8'));raw.set(key,[...raw.get(key)??[],...rs]);}
 let checked=0;for(const row of out.results){const e=row.record.heatmapSweepAtEntry,q=evaluateHeatmapLongQuality({event:e,now:e.observedAt,raw:{symbol:e.symbol,savedAt:e.observedAt,price:raw.get('/fapi/v1/klines:'+e.symbol),oi:raw.get('/futures/data/openInterestHist:'+e.symbol)},
  ratio:{symbol:e.symbol,source:'BINANCE_TOP_TRADER_ACCOUNT_RATIO',period:'5m',status:'OK',fetchedAt:e.observedAt,rows:raw.get('/futures/data/topLongShortAccountRatio:'+e.symbol)},btcRows:raw.get('/fapi/v1/klines:BTCUSDT')});
  for(const [key,expected] of [['rsi14',row.features.coin?.rsi14],['overshootPct',row.features.overshootPct],['ratioChange1h',row.features.ratio?.change1h],['oiChange1h',row.features.oi?.change1h]])assert(Math.abs(q.features[key]-expected)<1e-9,e.symbol+' '+key);
  assert(validLongQuality({...e,longQuality:q}));checked++;
 }console.log('PASS cache-only research parity '+checked+' events');
}catch(error){if(error.code!=='ENOENT')throw error;}
console.log('PASS LONG quality: frozen pre-entry GOOD5/BAD1/UNKNOWN, causal RSI/ratio/OI/zone checks, Discord limits/actual sizing, defaultOFF/whitelist closed stats, guards/dedupe/protection/legacy2, timeout concurrency. Mock only.');
