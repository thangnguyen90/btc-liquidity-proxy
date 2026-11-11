import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';

const S=300000,H=3600000,HOLD=8*H;
const START=Date.parse('2026-11-08T00:00:00+07:00');
const CUT=Date.parse('2026-11-09T11:10:00+07:00');
const DIR='data/research/lower-partial-continuation-short-20261109';
const OLD='data/research/upper-partial-first-push-long-20261109';
const FILES=[OLD+'/archived-sweeps.json',OLD+'/current-sweeps.json','data/heatmap-sweep-watch.json'];
const VERSION='LOWER_PARTIAL_CONTINUATION_SHORT_RESEARCH_V1_20261109';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const save=(p,data)=>fs.writeFile(p,JSON.stringify(data,null,2));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const optional=async p=>{try{return await read(p);}catch(err){if(err.code!=='ENOENT')throw err;return null;}};
const startOf=t=>Math.floor(t/S)*S;
const times=(a,b)=>Array.from({length:(b-a)/S},(_,i)=>a+i*S);
await Promise.all(['raw','funding'].map(d=>fs.mkdir(DIR+'/'+d,{recursive:true})));
let manifest=await optional(DIR+'/manifest.json');
if(!manifest){
 const snapshots=[];
 for(const [i,src] of FILES.entries()){
  const bytes=await fs.readFile(src),name='sweep-source-'+i+'.json';
  await fs.writeFile(DIR+'/'+name,bytes);
  snapshots.push({src,name,hash:hash(bytes)});
 }
 manifest={version:VERSION,from:START,cut:CUT,snapshots,
  setup:{side:'SHORT',leverage:3,tpRoe:5,slRoe:20,holdHours:8,roundTripNotionalCostPct:.14},
  rules:{belowEdgeBufferPct:.14,targetHeadroomPct:5/3,targets:'nearest not touched as of entry from frozen cluster set'},
  timing:'Open after a full 5m candle following webhook receipt; completed OHLC only. MARK high/low path includes the candle with sweep tick, conservatively.'};
 await save(DIR+'/manifest.json',manifest);
}
assert.equal(manifest.version,VERSION);
const frozen=new Map();
for(const {name,hash:digest} of manifest.snapshots){
 const bytes=await fs.readFile(DIR+'/'+name);assert.equal(hash(bytes),digest);
 for(const e of JSON.parse(bytes).history)frozen.set(e.id,e);
}
const byCohort=new Set(), alerts=[];
for(const e of [...frozen.values()].sort((a,b)=>a.at-b.at)){
 if(e.kind!=='LOWER_CLUSTER_SWEPT'||e.direction!=='LOWER'||e.at<START||e.at>=CUT||!e.cohortId||byCohort.has(e.cohortId)
  ||e.delivery?.status!=='SENT'||!(e.delivery.httpStatus>=200&&e.delivery.httpStatus<300)||!(e.delivery.at>=e.at&&e.delivery.at<=CUT)
  ||!(e.zonesAsOf<=e.armedAt&&e.armedAt<=e.at)||e.clearedCount<1||e.clearedCount>=e.totalCount
  ||!Array.isArray(e.zones)||e.zones.length!==e.totalCount||e.zones.filter(z=>z.cleared).length!==e.clearedCount
  ||e.zones.some(z=>!(z.low>0&&z.high>z.low&&z.establishedAt<=z.asOf&&z.asOf<=e.zonesAsOf)
    ||(z.cleared&&!(z.clearedAt<=e.at&&e.markPrice<=z.low))))continue;
 byCohort.add(e.cohortId);
 alerts.push({...e,entryAt:startOf(Math.max(e.at,e.observedAt??e.at,e.delivery.at))+2*S});
}
const events=alerts.filter(e=>e.entryAt+HOLD<=CUT);
assert.ok(events.length);
const symbols=[...new Set(events.map(e=>e.symbol))], wanted=new Set(symbols);
console.log(JSON.stringify({alerts:alerts.length,mature:events.length,symbols:symbols.length,pending:alerts.length-events.length}));
const fundingFrom=Math.min(...events.map(e=>e.entryAt)),end=Math.max(...events.map(e=>e.entryAt+HOLD));
let requests=0,next=0;
async function publicData(path,params){
 if(Date.now()<next)await new Promise(r=>setTimeout(r,next-Date.now()));
 next=Date.now()+850;
 const res=await fetch('https://fapi.binance.com'+path+'?'+new URLSearchParams(params),{signal:AbortSignal.timeout(12000)});
 requests++;
 if(!res.ok)throw Error(path+' HTTP '+res.status);
 if(+res.headers.get('x-mbx-used-weight-1m')>1000)next=Math.ceil(Date.now()/60000)*60000+500;
 const rows=await res.json();assert.ok(Array.isArray(rows));return rows;
}
const knownFile='data/research/upper-partial-long-bnt-20261108/funding.json';
const knownBytes=await fs.readFile(knownFile);
const knownFunding=JSON.parse(knownBytes);
const knownManifest=await read('data/research/upper-partial-long-bnt-20261108/manifest.json');
const knownReceipt=await read('data/research/upper-partial-long-bnt-20261108/fetch-complete.json');
assert.equal(hash(knownBytes),knownReceipt.fundingHash);
const knownEnd=Math.floor(knownManifest.end/H)*H;
const funding=knownFunding.filter(r=>+r.fundingTime>=fundingFrom&&+r.fundingTime<Math.min(knownEnd,end)&&wanted.has(r.symbol));
for(let t=Math.max(Math.floor(fundingFrom/H)*H,knownEnd);t<end;t+=H){
 const pageFile=DIR+'/funding/'+t+'.json';
 let page=await optional(pageFile);
 if(!page){
  page=await publicData('/fapi/v1/fundingRate',{startTime:t,endTime:Math.min(t+H,end)-1,limit:1000});
  assert.ok(page.length<1000,'truncated funding window');
  await save(pageFile,page);
 }
 assert.ok(page.length<1000&&page.every(r=>+r.fundingTime>=t&&+r.fundingTime<Math.min(t+H,end)&&Number.isFinite(+r.fundingRate)));
 funding.push(...page.filter(r=>wanted.has(r.symbol)));
}
const byFunding=Object.groupBy([...new Map(funding.map(r=>[r.symbol+':'+r.fundingTime+':'+(r.rateType??'Regular'),r])).values()],f=>f.symbol);
await save(DIR+'/funding-used.json',{reused:{file:knownFile,sha256:hash(knownBytes),endExclusive:knownEnd},byFunding});

const cacheDirs=['upper-partial-long-bnt-20261108','short-squeeze-volume-20261107','sideways-allshort-20261107','dominance-model13-20261106','margin3-market-volume-20261107'];
const valid=r=>Array.isArray(r)&&Number.isSafeInteger(+r[0])&&+r[0]%S===0&&+r[6]===+r[0]+S-1&&
 [1,2,3,4].every(i=>Number.isFinite(+r[i])&&+r[i]>0)&&+r[2]>=Math.max(+r[1],+r[4])&&+r[3]<=Math.min(+r[1],+r[4]);
function beforeEntry(e,price,marks){
 const edge=Math.min(...e.zones.filter(z=>z.cleared).map(z=>z.low));
 const markLow=Math.min(e.markPrice,...marks.map(b=>+b[3]));
 const remaining=e.zones.filter(z=>!z.cleared&&!z.touched&&z.high<Math.min(markLow,price)).sort((a,b)=>b.high-a.high);
 const zone=remaining[0]??null;
 const belowEdgePct=(1-price/edge)*100;
 return {edge,price,belowEdgePct,remaining:remaining.length,zone,
  nearPct:zone?(1-zone.high/price)*100:null,farPct:zone?(1-zone.low/price)*100:null};
}
function positionAt(e,points){
 const fromDelivery=e.delivery.positionAnalysis?.point,prevDelivery=e.delivery.positionAnalysis?.previous;
 const ps=[...points,fromDelivery,prevDelivery].filter(p=>p&&!p.ambiguous&&p.whaleCount>=10&&p.sourceAt<=p.observedAt&&p.observedAt<e.entryAt
  &&[p.whaleLong,p.smartLong,p.crowdLong].every(v=>Number.isFinite(v)&&v>=0&&v<=100));
 const p=ps.filter(p=>e.entryAt-p.sourceAt<=15*60000).sort((a,b)=>a.sourceAt-b.sourceAt||a.observedAt-b.observedAt).at(-1);
 if(!p)return null;
 const previous=ps.filter(x=>p.sourceAt-H>=x.sourceAt&&p.sourceAt-H-x.sourceAt<=15*60000).sort((a,b)=>a.sourceAt-b.sourceAt).at(-1);
 return {sourceAt:p.sourceAt,observedAt:p.observedAt,whaleShort:100-p.whaleLong,smartShort:100-p.smartLong,crowdLong:p.crowdLong,
  whaleShortDelta:previous?previous.whaleLong-p.whaleLong:null,smartShortDelta:previous?previous.smartLong-p.smartLong:null};
}
function simulate(e,path,funding,hours=8){
 const entry=+path[0][1],tp=entry*(1-5/300),sl=entry*(1+20/300);
 const candles=path.slice(0,hours*12),last=candles.at(-1);
 let exit=+last[4],exitAt=+last[6],reason='TIME',sameBar=false;
 for(const b of candles){
  const [at,o,h,l]=b.map(Number);
  if(o>=sl||o<=tp){[exit,exitAt,reason]=o>=sl?[o,at,'SL_GAP']:[tp,at,'TP'];break;}
  if(h>=sl||l<=tp){[exit,exitAt,reason]=h>=sl?[sl,+b[6],'SL']:[tp,+b[6],'TP'];sameBar=h>=sl&&l<=tp;break;}
 }
 const fundingCredit=funding.filter(f=>+f.fundingTime>e.entryAt&&+f.fundingTime<=exitAt)
  .reduce((s,f)=>s+(+f.fundingRate)*(+f.markPrice>0?+f.markPrice/entry:1)*100,0);
 const netRoe=(1-exit/entry)*300-3*.14+3*fundingCredit;
 return {entry,exit,exitAt,reason,sameBar,netRoe,fundingCredit};
}

const records=[];
for(const symbol of symbols){
 const xs=events.filter(e=>e.symbol===symbol), key=encodeURIComponent(symbol), output=DIR+'/raw/'+key+'.json';
 let raw=await optional(output);
 if(!raw){
  const sources=['data/heatmap-market-raw-cache/'+symbol+'.json',
   ...cacheDirs.flatMap(dir=>['data/research/'+dir+'/raw/'+key+'-data.json','data/research/'+dir+'/raw/'+key+'.json'])];
  const caches=(await Promise.all(sources.map(optional))).filter(r=>r?.symbol===symbol);
  raw={symbol};
  for(const type of ['price','mark']){
   const required=[...new Set(xs.flatMap(e=>type==='price'?times(e.entryAt-S,e.entryAt+HOLD):times(startOf(e.at),e.entryAt)))].sort((a,b)=>a-b);
   const index=new Map(caches.flatMap(r=>r[type]??[]).filter(valid).map(b=>[+b[0],b]));
   const gaps=required.filter(t=>!index.has(t));
   for(let i=0;i<gaps.length;){
    let j=i+1;while(j<gaps.length&&gaps[j]===gaps[j-1]+S&&j-i<499)j++;
    const rows=await publicData(type==='price'?'/fapi/v1/klines':'/fapi/v1/markPriceKlines',
     {symbol,interval:'5m',startTime:gaps[i],endTime:gaps[j-1]+S-1,limit:j-i});
    for(const b of rows)if(valid(b))index.set(+b[0],b);
    i=j;
   }
   assert.ok(required.every(t=>index.has(t)),symbol+' incomplete '+type);
   raw[type]=required.map(t=>index.get(t));
  }
  const journal=await optional('data/pumpglass-position-journal/'+symbol+'.json');
  raw.points=journal?.symbol===symbol?journal.points:[];
  await save(output,raw);
 }
 assert.equal(raw.symbol,symbol);
 const price=new Map(raw.price.filter(valid).map(b=>[+b[0],b])),mark=new Map(raw.mark.filter(valid).map(b=>[+b[0],b]));
 for(const e of xs){
  const ref=price.get(e.entryAt-S);
  const prices=times(e.entryAt,e.entryAt+HOLD).map(t=>price.get(t)),marks=times(startOf(e.at),e.entryAt).map(t=>mark.get(t));
  assert.ok(ref&&prices.every(Boolean)&&marks.every(Boolean)&&+ref[6]<e.entryAt&&marks.every(b=>+b[6]<e.entryAt));
  const model=beforeEntry(e,+ref[4],marks);
  const firstHours=byFunding[symbol]??[];
  records.push({id:e.id,symbol,at:e.at,entryAt:e.entryAt,model,position:positionAt(e,raw.points),
   pressure:e.delivery.sweepVerdict?.state==='PRESSURE',trade:simulate(e,prices,firstHours),trade2h:simulate(e,prices,firstHours,2)});
 }
}
records.sort((a,b)=>a.at-b.at);
const first=records.filter((r,i)=>!records.slice(0,i).some(p=>p.symbol===r.symbol&&r.at-p.at<8*H));
const isStrong=r=>r.model.belowEdgePct>=.14&&r.model.nearPct>=5/3;
const stats=(xs,k='trade')=>{
 const n=xs.length;
 return {n,coins:new Set(xs.map(r=>r.symbol)).size,wins:xs.filter(r=>r[k].netRoe>0).length,tp:xs.filter(r=>r[k].reason==='TP').length,
  sl:xs.filter(r=>r[k].reason.startsWith('SL')).length,time:xs.filter(r=>r[k].reason==='TIME').length,
  mean:n?xs.reduce((s,r)=>s+r[k].netRoe,0)/n:null,median:n?[...xs].sort((a,b)=>a[k].netRoe-b[k].netRoe)[Math.floor((n-1)/2)][k].netRoe:null};
};
const defs={
 all:()=>true,edge:r=>r.model.belowEdgePct>=0,reclaim:r=>r.model.belowEdgePct<0,
 strong:isStrong,wait:r=>r.model.belowEdgePct>=0&&!isStrong(r),
 noTarget:r=>r.model.zone===null,nearTarget:r=>r.model.nearPct!==null&&r.model.nearPct<5/3,
 targetRoom:r=>r.model.nearPct>=5/3,
 strongWhaleKnown:r=>isStrong(r)&&!!r.position,strongWhaleBothShort:r=>isStrong(r)&&r.position?.whaleShort>50&&r.position?.smartShort>50,
 strongTrendKnown:r=>isStrong(r)&&r.position?.whaleShortDelta!=null&&r.position?.smartShortDelta!=null,
 strongShortTrend:r=>isStrong(r)&&r.position?.whaleShortDelta>0&&r.position?.smartShortDelta>0,
};
const groups=Object.fromEntries(Object.entries(defs).map(([k,f])=>[k,{main:stats(records.filter(f)),first:stats(first.filter(f)),hold2h:stats(records.filter(f),'trade2h')}]));
const startLate=Date.parse('2026-11-08T12:00:00+07:00');
const splits=[records.filter(r=>r.at<startLate),records.filter(r=>r.at>=startLate)].map(rs=>({
 all:stats(rs),strong:stats(rs.filter(isStrong)),wait:stats(rs.filter(defs.wait)),reclaim:stats(rs.filter(defs.reclaim)),
}));
const farRoom=r=>r.model.belowEdgePct>=.14&&r.model.farPct>=5/3;
const acrossTarget=r=>farRoom(r)&&!isStrong(r);
const exploratory=Object.fromEntries(Object.entries({farRoom,acrossTarget}).map(([k,f])=>[k,{
 main:stats(records.filter(f)),first:stats(first.filter(f)),hold2h:stats(records.filter(f),'trade2h'),
}]));
const result={version:VERSION,exploratory,alerts:alerts.length,pending:alerts.length-events.length,requests,groups,splits,records};
await save(DIR+'/results.json',result);
console.log(JSON.stringify({requests,groups,splits},null,2));

