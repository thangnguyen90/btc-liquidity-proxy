import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {PROFILE_RATIO} from '../src/heatmapEntryScenarios.js';
import {HeatmapSweepWatch,prepareHeatmapSweepCohort,HEATMAP_SWEEP_VERSION} from '../src/heatmapSweepWatch.js';
import {createHeatmapSweepDiscordSender,heatmapSweepDiscordPayload} from '../src/heatmapSweepDiscord.js';
const STEP=300000,base=Math.floor(1792320000000/STEP)*STEP;
let now=base+10000;
const fixture=(symbol='ARCUSDT',prices=[102,104,110],at=base-1)=>{
 const profiles=Array.from({length:3},(_,i)=>({at:at-(2-i)*STEP,oiFresh:true,mark:true,bins:prices.map(p=>[Math.round(Math.log(p)/Math.log(PROFILE_RATIO)),100])}));
 const d={symbol,source:'BINANCE_LOCAL',range:'24h',step:STEP,end:at+1,candles:[{time:at-STEP+1,close:100}],profiles};
 return {models:[1,3].map(model=>({model,status:'OK',data:structuredClone(d)}))};
};
const point=()=>({price:100,at:now});
const original=fixture(),prepared=prepareHeatmapSweepCohort(original,point(),now);
assert.equal(prepared.cohort.zones.length,2,'only unvisited strong clusters fully inside +5%');
const frozen=JSON.stringify(prepared.cohort.zones);original.models.forEach(m=>m.data.profiles.at(-1).bins=[]);assert.equal(JSON.stringify(prepared.cohort.zones),frozen);
for(const mutate of [b=>b.models.pop(),b=>b.models[1].data.source='DEMO',b=>b.models[0].data.profiles[0].mark=false,b=>b.models[1].data.profiles[0].oiFresh=false,b=>b.models[1].data.symbol='WRONGUSDT',b=>b.models[1].data.profiles[0].at--,b=>b.models[0].data.range='7d']){
 const b=fixture();mutate(b);assert(!prepareHeatmapSweepCohort(b,point(),now).cohort);
}
assert(!prepareHeatmapSweepCohort(fixture(),{price:100,at:now-11000},now).cohort);
assert(!prepareHeatmapSweepCohort(fixture(),point(),now+STEP+120000).cohort);
assert(!prepareHeatmapSweepCohort(fixture('ARCUSDT',[102,104]),{price:106,at:now},now).cohort,'already crossed before arm is not replayed');
assert(!prepareHeatmapSweepCohort(fixture('ARCUSDT',[104]),{price:99,at:now},now).cohort,'distance ceiling is measured from live MARK, not a higher historical close');
const dir=await mkdtemp(join(tmpdir(),'heatmap-sweep-')),file=join(dir,'main.json'),sent=[],symbols=[];
const options={file,now:()=>now,loadBundle:async()=>fixture(),getLive:point,onSymbolsChanged:s=>symbols.push(s),discordSender:async e=>{
 const disk=JSON.parse(await readFile(file,'utf8'));assert.equal(disk.history.at(-1).delivery.status,'PENDING');sent.push(e);return {sent:1,httpStatus:204};
}};
const watch=new HeatmapSweepWatch(options);await watch.update({symbol:'ARCUSDT',enabled:true});assert.deepEqual(symbols.at(-1),['ARCUSDT']);
await watch.scan();assert.equal(watch.watches[0].status,'ARMED');assert.equal(sent.length,0,'load/search/arm never sends historical chart sweeps');
const c=watch.watches[0].cohort,z0=c.zones[0],z1=c.zones[1];
const tick=async(price,delta=1000)=>{now+=delta;await watch.onMark({symbol:'ARCUSDT',markPrice:price,eventTime:now});};
await tick(z0.low);assert.equal(sent.length,0,'lower edge touch is not full sweep');assert(c.zones[0].touched);
await tick(z0.high+.0001);assert.equal(sent.length,1);assert.equal(sent[0].kind,'UPPER_CLUSTER_SWEPT');assert.equal(sent[0].clearedCount,1);
await tick(z0.high+.0001);assert.equal(sent.length,1);
await tick(z1.high+.0001);assert.equal(sent.length,2);assert.equal(sent[1].kind,'ALL_TRACKED_UPPER_SWEPT');assert.equal(sent[1].totalCount,2);
await tick(110);assert.equal(sent.length,2,'completion cannot fire twice');
const snap=watch.snapshot(sent[1].id);snap.history[0].symbol='MUTATED';assert.equal(watch.history.at(-1).symbol,'ARCUSDT');assert.equal(snap.selected.kind,'ALL_TRACKED_UPPER_SWEPT');
const restart=new HeatmapSweepWatch({...options,getLive:()=>({price:110,at:now})});await restart.init();assert.equal(restart.watches[0].enabled,true);assert.equal(restart.watches[0].cohort,null,'cohort is not restored across a blind restart gap');await restart.scan();assert.equal(sent.length,2);
const jump=new HeatmapSweepWatch({...options,file:join(dir,'jump.json'),discordSender:async e=>{sent.push(e);return {sent:1};}});await jump.update({symbol:'ARCUSDT',enabled:true});await jump.scan();now+=1000;await jump.onMark({symbol:'ARCUSDT',markPrice:105,eventTime:now});assert.equal(jump.history.length,1);assert.equal(jump.history[0].kind,'ALL_TRACKED_UPPER_SWEPT','one jump across all clusters gives one aggregate message');
const sentCount=sent.length,repeat=structuredClone(jump.watches[0].cohort);repeat.id+=':new';repeat.state='ARMED';repeat.firstReserved=false;repeat.allReserved=false;repeat.armedAt=now;repeat.lastTickAt=now;repeat.zones.forEach(z=>{z.cleared=false;});jump.watches[0].cohort=repeat;now+=1000;await jump.onMark({symbol:'ARCUSDT',markPrice:105,eventTime:now});assert.equal(jump.history.at(-1).delivery.status,'COOLDOWN');assert.equal(sent.length,sentCount,'same family capped once per15min/coin even if cohort changes');
const gap=new HeatmapSweepWatch({...options,file:join(dir,'gap.json'),discordSender:async()=>{throw Error('must not send');}});await gap.update({symbol:'ARCUSDT',enabled:true});await gap.scan();now+=11000;await gap.onMark({symbol:'ARCUSDT',markPrice:105,eventTime:now});assert.equal(gap.watches[0].status,'GAP');assert.equal(gap.history.length,0);
const expired=new HeatmapSweepWatch({...options,file:join(dir,'expired.json')});await expired.update({symbol:'ARCUSDT',enabled:true});await expired.scan();now+=16*60000;await expired.onMark({symbol:'ARCUSDT',markPrice:105,eventTime:now});assert.equal(expired.watches[0].status,'EXPIRED');assert.equal(expired.history.length,0);
now=base+10000;
const unknown=new HeatmapSweepWatch({...options,file:join(dir,'unknown.json'),discordSender:async()=>{throw Error('transport unknown');}});await unknown.update({symbol:'ARCUSDT',enabled:true});await unknown.scan();now+=1000;await unknown.onMark({symbol:'ARCUSDT',markPrice:105,eventTime:now});assert.equal(unknown.history[0].delivery.status,'UNKNOWN');now+=1000;await unknown.onMark({symbol:'ARCUSDT',markPrice:106,eventTime:now});assert.equal(unknown.history.length,1);
await writeFile(join(dir,'corrupt.json'),'{invalid');const corrupt=new HeatmapSweepWatch({...options,file:join(dir,'corrupt.json')});await corrupt.scan();assert(corrupt.error);assert.equal(await readFile(join(dir,'corrupt.json'),'utf8'),'{invalid');
await writeFile(join(dir,'not-directory'),'x');const fail=new HeatmapSweepWatch({...options,file:join(dir,'not-directory','state.json')});await assert.rejects(fail.update({symbol:'ARCUSDT',enabled:true}));assert(fail.error);
let loads=0;const bounded=new HeatmapSweepWatch({...options,file:join(dir,'bounded.json'),loadBundle:async q=>{loads++;return fixture(q.symbol);}});for(let i=0;i<10;i++)await bounded.update({symbol:`C${i}USDT`,enabled:true});await assert.rejects(bounded.update({symbol:'OVERUSDT',enabled:true}),/Tối đa/);for(let i=0;i<10;i++)await bounded.scan();assert.equal(loads,1,'global load slot no faster than30s');now+=30000;await bounded.scan();assert.equal(loads,2);
await assert.rejects(bounded.update({symbol:'C0USDT',enabled:true,maxDistancePct:20}));
const payload=heatmapSweepDiscordPayload(sent[1]);assert.deepEqual(payload.allowed_mentions.parse,[]);assert.match(JSON.stringify(payload),/Không.*toàn sàn|không.*toàn sàn/);assert.match(JSON.stringify(payload),/sweep=.*#heatmap-sweep/);
assert.throws(()=>createHeatmapSweepDiscordSender({webhookUrl:'https://evil.test/api/webhooks/123/token'}));
const sender=createHeatmapSweepDiscordSender({webhookUrl:'https://discord.com/api/webhooks/123/mock',fetchImpl:async(u,init)=>{assert.equal(init.redirect,'error');assert.equal(init.method,'POST');return {ok:true,status:204};}});assert.equal((await sender(sent[1])).sent,1);
const failingSender=createHeatmapSweepDiscordSender({webhookUrl:'https://discord.com/api/webhooks/123/mock',fetchImpl:async()=>{throw Error('private token');}});assert.doesNotMatch(JSON.stringify(await failingSender(sent[1])),/private|webhooks/);
const src=await readFile('src/server.js','utf8'),start=src.indexOf("if(requestUrl.pathname==='/api/heatmap-sweep-watch')"),end=src.indexOf("if(requestUrl.pathname==='/api/coinglass-heatmap-lab/status')",start),handler=src.slice(start,end);
assert(start>0&&end>start);
for(const [method,origin,status] of [['GET',false,200],['POST',false,403],['POST',true,200],['DELETE',true,405]]){
 let reads=0,updates=0;const out=[];
 await vm.runInNewContext('(async()=>{'+handler+'})()',{requestUrl:new URL('http://local/api/heatmap-sweep-watch'),request:{method},response:{setHeader(){}},
  heatmapSweepWatch:{init:async()=>{},snapshot:()=>{reads++;return {};},update:async()=>{updates++;return {};}},heatmapSweepRunner:{snapshot:()=>({})},isSameOriginWriteRequest:()=>origin,
  readJsonBody:async()=>({symbol:'ARCUSDT',enabled:true}),normalizeManualPriceAlertSymbol:s=>s,getSymbols:async()=>[{symbol:'ARCUSDT'}],sendJson:async(r,b,s=200)=>out.push(s)});
 assert.equal(out[0],status);assert.equal(reads,method==='GET'?1:0);assert.equal(updates,method==='POST'&&origin?1:0);
}
assert.equal(JSON.parse(await readFile(file,'utf8')).version,HEATMAP_SWEEP_VERSION);
console.log('PASS causal frozen upper clusters, touch/full/aggregate, real MARK/OI guards, one-shot/durable reservation/restart/no replay/gap/expiry, cap/quota/storage fail, Discord payload/secret safety, GET read-only and same-origin writes. Mock only.');
