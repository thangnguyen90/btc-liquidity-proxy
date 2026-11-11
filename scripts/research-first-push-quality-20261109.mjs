import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { validSweepPumpPhase } from '../src/heatmapSweepPumpPhase.js';
import { liquidityAt } from './research-early-pump-model.mjs';

const MIN=60000, S=5*MIN, H=60*MIN, HOLD=8*H;
const SRC='data/research/upper-partial-first-push-long-20261109';
const DIR='data/research/upper-first-push-quality-20261109';
const cut=Date.parse('2026-11-09T10:05:00+07:00');
const version='UPPER_PARTIAL_FIRST_PUSH_QUALITY_RESEARCH_V1_20261109';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const save=async (p,v)=>{await fs.writeFile(p+'.tmp',JSON.stringify(v,null,2));await fs.rename(p+'.tmp',p);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const floor=t=>Math.floor(t/S)*S;
const seq=(a,b)=>Array.from({length:(b-a)/S},(_,i)=>a+i*S);
const absent=async p=>{try{return await read(p);}catch(e){if(e.code!=='ENOENT')throw e;return null;}};
const [input,base]=await Promise.all([fs.readFile(SRC+'/events.json'),read(SRC+'/results.json')]);
const all=JSON.parse(input).filter(e=>e.kind==='UPPER_CLUSTER_SWEPT'&&e.delivery?.status==='SENT'&&e.delivery.pumpPhase?.state==='FIRST_PUSH'
  &&validSweepPumpPhase(e,e.delivery.pumpPhase)&&e.delivery.pumpPhase.evaluatedAt<=e.delivery.at);
const events=all.filter(e=>e.entryAt+HOLD<=cut), symbols=[...new Set(events.map(e=>e.symbol))];
assert.equal(events.length,19);
const old=new Map(base.records.filter(r=>r.native==='FIRST_PUSH').map(r=>[r.id,r]));
await Promise.all(['raw','journal'].map(d=>fs.mkdir(DIR+'/'+d,{recursive:true})));
const manifestPath=DIR+'/manifest.json';
let manifest=await absent(manifestPath);
if(!manifest){
 const journal={};
 for(const symbol of symbols){
  const file=DIR+'/journal/'+symbol+'.json';
  let bytes;
  try{bytes=await fs.readFile(file);}catch(e){
   if(e.code!=='ENOENT')throw e;
   try{bytes=await fs.readFile('data/pumpglass-position-journal/'+symbol+'.json');}
   catch(err){if(err.code!=='ENOENT')throw err;continue;}
   await fs.writeFile(file,bytes);
  }
  journal[symbol]=hash(bytes);
 }
 manifest={version,cut,eventsHash:hash(input),cohort:events.length,alerts:all.length,journal,
  execution:{leverage:3,tpRoe:5,slRoe:20,hours:8,costPct:.14}, ratio:{lagMin:5,trendMin:60},
  models:{freeze:'upper zones recorded at sweep',direction:'replay both models at original zonesAsOf, approximate',strength:50,bandPct:5},
  rules:['5m close >= upper edge','Untouched upper target after sweep','Remaining upper target strength >=50','Top Binance LONG% increases over 1h','Whale and Smart both LONG >=50%','Crowd Binance LONG >=60%','Whale and Smart both SHORT with PumpGlass crowd LONG >=60%']};
 await save(manifestPath,manifest);
}
assert.equal(manifest.eventsHash,hash(input));
assert.equal(manifest.cut,cut);
let next=0,calls=0;
async function get(path,params){
 if(next>Date.now())await new Promise(r=>setTimeout(r,next-Date.now()));
 next=Date.now()+850;
 const r=await fetch('https://fapi.binance.com'+path+'?'+new URLSearchParams(params),{signal:AbortSignal.timeout(12000)});
 calls++;
 if(!r.ok)throw Error(path+' '+params.symbol+' HTTP_'+r.status);
 if(+r.headers.get('x-mbx-used-weight-1m')>950)next=Math.ceil(Date.now()/MIN)*MIN+500;
 const rows=await r.json();assert.ok(Array.isArray(rows));
 return rows;
}
const endpoints={mark:'/fapi/v1/markPriceKlines',price:'/fapi/v1/klines',oi:'/futures/data/openInterestHist'};
async function marketRows(symbol,type,times,seeds){
 const time=b=>type==='oi'?+b.timestamp:+b[0];
 const valid=b=>type==='oi'?b.symbol===symbol&&+b.sumOpenInterest>0&&time(b)%S===0
  :+b[6]===time(b)+S-1&&time(b)%S===0&&[1,2,3,4].every(i=>+b[i]>0)&&+b[2]>=Math.max(+b[1],+b[4])&&+b[3]<=Math.min(+b[1],+b[4]);
 const m=new Map(seeds.filter(valid).map(b=>[time(b),b]));
 const miss=[...new Set(times)].sort((a,b)=>a-b).filter(t=>!m.has(t));
 for(let i=0;i<miss.length;){
  let j=i+1;
  while(j<miss.length&&miss[j]-miss[j-1]===S&&j-i<499)j++;
  const rows=await get(endpoints[type],{symbol,[type==='oi'?'period':'interval']:'5m',startTime:miss[i],endTime:miss[j-1]+S-1,limit:j-i});
  for(const b of rows)if(valid(b))m.set(time(b),b);
  i=j;
 }
 return [...new Set(times)].sort((a,b)=>a-b).flatMap(t=>m.has(t)?[m.get(t)]:[]);
}
function simulate(e,raw){
 const path=raw.price.filter(b=>+b[0]>=e.entryAt&&+b[0]<e.entryAt+HOLD);
 assert.ok(path.length===96&&path.every((b,i)=>+b[0]===e.entryAt+i*S));
 const entry=+path[0][1],tp=entry*(1+5/300),sl=entry*(1-20/300);
 let exit=+path.at(-1)[4],exitAt=+path.at(-1)[6],reason='TIME';
 for(const b of path){
  const [at,o,h,l]=b.map(Number);
  if(o<=sl||o>=tp){[exit,exitAt,reason]=o<=sl?[o,at,'SL_GAP']:[tp,at,'TP'];break;}
  if(l<=sl||h>=tp){[exit,exitAt,reason]=l<=sl?[sl,+b[6],'SL']:[tp,+b[6],'TP'];break;}
 }
 const funding=raw.funding.filter(f=>+f.fundingTime>e.entryAt&&+f.fundingTime<=exitAt)
  .reduce((s,f)=>s+(+f.fundingRate)*(+f.markPrice>0?+f.markPrice/entry:1)*100,0);
 return {entry,exit,exitAt,reason,netRoe:(exit/entry-1)*300-3*(.14+funding)};
}
function whaleAt(e,journal){
 const point=e.delivery.positionAnalysis?.point, previous=e.delivery.positionAnalysis?.previous;
 const valid=p=>p&&p.whaleCount>=10&&[p.whaleLong,p.smartLong,p.crowdLong].every(v=>Number.isFinite(v)&&v>=0&&v<=100)
  &&Number.isSafeInteger(p.sourceAt)&&Number.isSafeInteger(p.observedAt)&&p.sourceAt<=p.observedAt&&p.observedAt<e.entryAt
  &&(!Number.isFinite(p.ambiguousObservedAt)||p.ambiguousObservedAt>=e.entryAt)&&(!p.ambiguous||Number.isFinite(p.ambiguousObservedAt));
 const history=[...journal,point,previous].filter(valid);
 const recent=history.filter(p=>e.entryAt-p.sourceAt<=15*MIN).sort((a,b)=>a.sourceAt-b.sourceAt||a.observedAt-b.observedAt).at(-1);
 if(!recent)return null;
 const target=recent.sourceAt-H;
 const prev=history.filter(p=>p.sourceAt<=target&&target-p.sourceAt<=15*MIN).sort((a,b)=>a.sourceAt-b.sourceAt).at(-1);
 return {...recent,origin:recent===point?'DELIVERY':'JOURNAL',deltaWhale:prev?recent.whaleLong-prev.whaleLong:null,
  deltaSmart:prev?recent.smartLong-prev.smartLong:null,previousSourceAt:prev?.sourceAt??null};
}
function ratioAt(rows,e){
 const valid=rows.filter(r=>r.symbol===e.symbol&&Number.isFinite(+r.longAccount)&&+r.longAccount>=0&&+r.longAccount<=1
  &&Math.abs(+r.longAccount+ +r.shortAccount-1)<=.002&&+r.timestamp<=e.entryAt-S);
 const last=valid.sort((a,b)=>+a.timestamp- +b.timestamp).at(-1);
 if(!last||e.entryAt- +last.timestamp>3*S)return null;
 const prev=valid.find(r=>+r.timestamp===+last.timestamp-H);
 return {longPct:+last.longAccount*100,timestamp:+last.timestamp,delta:prev?(+last.longAccount- +prev.longAccount)*100:null};
}
function frozen(e,raw,price,edge){
 assert.ok(e.zonesAsOf<=e.armedAt&&e.armedAt<=e.at&&e.at<e.entryAt);
 const waiting=raw.mark.filter(b=>+b[0]>=floor(e.at)&&+b[6]<e.entryAt);
 if(waiting.length!==(e.entryAt-floor(e.at))/S)return {status:'MARK_GAP'};
 const high=Math.max(e.markPrice,...waiting.map(b=>+b[2]));
 const zones=e.zones.filter(z=>!z.cleared&&!z.touched&&z.low>e.markPrice&&z.establishedAt<=z.asOf&&z.asOf<=e.zonesAsOf)
  .sort((a,b)=>a.low-b.low);
 const untouched=zones.filter(z=>z.low>Math.max(high,price));
 const next=untouched[0];
 return {status:next?'OK':'NO_UNTOUCHED_UPPER',edge,knownUnhitAtSweep:zones.length,remaining:untouched.length,
  distancePct:next?(next.low/price-1)*100:null,target:next??null,
  holding:price>=edge,aboveEdgePct:(price/edge-1)*100};
}

const records=[];
const ids={position:'topLongShortPositionRatio',account:'topLongShortAccountRatio',global:'globalLongShortAccountRatio'};
for(const [i,symbol] of symbols.entries()){
 const list=events.filter(e=>e.symbol===symbol), file=encodeURIComponent(symbol)+'.json';
 const rawFile=DIR+'/raw/'+file;
 let raw=await absent(rawFile);
 if(!raw){
  const caches=(await Promise.all(['data/heatmap-market-raw-cache/'+file,SRC+'/raw/'+file,
   'data/research/upper-first-push-long-20261109/raw/'+file,
   'data/research/upper-partial-long-bnt-20261108/raw/'+encodeURIComponent(symbol)+'-data.json'].map(absent))).filter(r=>r?.symbol===symbol);
  const start=Math.min(...list.map(e=>e.zonesAsOf+1-36*H));
  const close=Math.max(...list.map(e=>e.entryAt));
  const end=Math.max(...list.map(e=>e.entryAt+HOLD));
  assert.ok(start%S===0&&end<=cut);
  const times=seq(start,close),future=list.filter(e=>!old.has(e.id)).flatMap(e=>seq(e.entryAt,e.entryAt+HOLD));
  raw={symbol,start,close,end};
  for(const type of ['price','mark','oi']){
   const wanted=type==='price'?[...times,...future]:times;
   raw[type]=await marketRows(symbol,type,wanted,caches.flatMap(r=>r[type]??[]));
  }
  const latest=Math.max(...list.map(e=>e.entryAt-S));
  raw.ratios={};
  for(const [key,endpoint] of Object.entries(ids)){
   const oldest=Math.min(...list.map(e=>e.entryAt))-H-4*S;
   raw.ratios[key]=await get('/futures/data/'+endpoint,{symbol,period:'5m',startTime:oldest,endTime:latest,limit:500});
  }
  raw.funding=future.length?await get('/fapi/v1/fundingRate',{symbol,startTime:Math.min(...future),endTime:end-1,limit:1000}):[];
  assert.ok(raw.funding.length<1000&&raw.funding.every(f=>f.symbol===symbol&&Number.isFinite(+f.fundingRate)&&Number.isFinite(+f.fundingTime)));
  await save(rawFile,raw);
 }
 assert.equal(raw.symbol,symbol);
 let journal=[];
 if(manifest.journal[symbol]){
  const bytes=await fs.readFile(DIR+'/journal/'+symbol+'.json');
  assert.equal(hash(bytes),manifest.journal[symbol]);
  const j=JSON.parse(bytes);assert.equal(j.symbol,symbol);journal=j.points;
 }
 for(const e of list){
  const prior=old.get(e.id);
  const trade=prior?.delayed??simulate(e,raw);
  const price=+raw.price.find(b=>+b[6]===e.entryAt-1)?.[4];
  assert.ok(price>0,'Missing decision close '+e.id);
  const edge=Math.max(...e.zones.filter(z=>z.cleared).map(z=>z.high));
  const model=frozen(e,raw,price,edge);
  if(prior)assert.equal(model.holding,prior.heldAbove);
  const replay=liquidityAt(raw,{at:e.zonesAsOf+1},e.markPrice,0);
  if(replay.status==='OK')assert.ok(replay.asOf<=e.armedAt);
  const ratio=Object.fromEntries(Object.entries(raw.ratios).map(([k,v])=>[k,ratioAt(v,e)]));
  records.push({id:e.id,symbol,at:e.at,entryAt:e.entryAt,price,trade,model,ratio,whale:whaleAt(e,journal),
   replay:{status:replay.status,asOf:replay.asOf,upperScore:replay.upperScore,lowerScore:replay.lowerScore},prior:!!prior});
 }
 console.log(JSON.stringify({symbol,done:i+1,total:symbols.length,calls}));
}
records.sort((a,b)=>a.at-b.at);
const first=records.filter((r,i)=>!records.slice(0,i).some(p=>r.symbol===p.symbol&&r.at-p.at<8*H));
const mean=xs=>xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null;
function stats(xs){
 const groups=Object.groupBy(xs,r=>r.symbol);
 return {n:xs.length,coins:Object.keys(groups).length,wins:xs.filter(r=>r.trade.netRoe>0).length,
  tp:xs.filter(r=>r.trade.reason==='TP').length,sl:xs.filter(r=>r.trade.reason.startsWith('SL')).length,
  time:xs.filter(r=>r.trade.reason==='TIME').length,meanRoe:mean(xs.map(r=>r.trade.netRoe)),
  coinEqualMean:mean(Object.values(groups).map(g=>mean(g.map(r=>r.trade.netRoe))))};
}
const rules={
  HOLD_EDGE:r=>r.model.holding??null,
  UPPER_LEFT:r=>r.model.status==='MARK_GAP'?null:r.model.remaining>0,
  NEXT_STRONG:r=>r.model.status==='OK'?r.model.target.overlapStrength>=50:null,
  TP_HEADROOM:r=>r.model.status==='OK'?r.model.distancePct>=5/3:null,
  UPPER_DOM:r=>r.replay.status==='OK'?r.replay.upperScore>r.replay.lowerScore:null,
  TOP_UP:r=>r.ratio.position?.delta==null?null:r.ratio.position.delta>0,
  TOP_LONG:r=>r.ratio.position?r.ratio.position.longPct>=50:null,
  TOP_ACCT_LONG:r=>r.ratio.account?r.ratio.account.longPct>=50:null,
  BINANCE_CROWD_LONG:r=>r.ratio.global?r.ratio.global.longPct>=60:null,
  WHALE_SMART_LONG:r=>r.whale?r.whale.whaleLong>=50&&r.whale.smartLong>=50:null,
  WHALE_SMART_SHORT_CROWDLONG:r=>r.whale?r.whale.whaleLong<50&&r.whale.smartLong<50&&r.whale.crowdLong>=60:null,
  WHALE_SMART_UP:r=>r.whale?.deltaWhale==null||r.whale?.deltaSmart==null?null:r.whale.deltaWhale>0&&r.whale.deltaSmart>0,
};
function join(...keys){return r=>{const values=keys.map(k=>rules[k](r));return values.includes(null)?null:values.every(Boolean);};}
rules.HOLD_UPPER=join('HOLD_EDGE','UPPER_LEFT');
rules.HOLD_UPPER_TOP_UP=join('HOLD_EDGE','UPPER_LEFT','TOP_UP');
rules.HOLD_UPPER_TOP_UP_WHALELONG=join('HOLD_EDGE','UPPER_LEFT','TOP_UP','WHALE_SMART_LONG');
rules.MODEL_TOP_WHALE_LONG=join('UPPER_LEFT','TOP_UP','WHALE_SMART_LONG');
function grouped(xs){
 return Object.fromEntries(Object.entries(rules).map(([k,f])=>[k,{
  yes:stats(xs.filter(r=>f(r)===true)),no:stats(xs.filter(r=>f(r)===false)),unknown:stats(xs.filter(r=>f(r)===null)),
 }]));
}
const exploratory={
  // Added after viewing this sample. The 0.14% buffer uses the assumed cost as its scale.
  bufferPct:.14,
  heldWithBuffer:stats(records.filter(r=>r.model.aboveEdgePct>=.14)),
  heldWithBufferAndUpper:stats(records.filter(r=>r.model.aboveEdgePct>=.14&&r.model.remaining>0)),
  heldWithWhaleSmartUp:stats(records.filter(r=>r.model.holding&&rules.WHALE_SMART_UP(r)===true)),
};
const result={version,all:stats(records),first:stats(first),groups:grouped(records),dedupGroups:grouped(first),exploratory,records};
await save(DIR+'/results.json',result);
console.log(JSON.stringify({all:result.all,first:result.first,groups:result.groups},null,2));

