import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {risingVolumeContext,RISING_VOLUME_CONTEXT_VERSION} from '../src/risingVolumeContext.js';
import {sweepPositionContext} from '../src/heatmapSweepPositionAnalysis.js';
import {heatmapRangePlan,normalizeBinanceHeatmapCandles,buildBinanceHeatmapProfiles} from '../src/binanceHeatmapModel.js';

const DIR='data/research/rising-volume-context-20261109';
const VERSION='RISING_VOLUME_CONTEXT_RESEARCH_V1_20261109';
const CUT=Date.parse('2026-11-09T14:55:00+07:00');
const MIN=60000,S=5*MIN,H=60*MIN,DAY=24*H,START=CUT-3*DAY;
const LEV=3,TP=5,SL=20,FEES=.14;
const asVN=t=>new Date(t+7*H).toISOString().slice(0,10);
const read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const maybe=async f=>{try{return await read(f);}catch(err){if(err.code!=='ENOENT')throw err;return null;}};
const save=async(f,v)=>{await fs.writeFile(f+'.tmp',JSON.stringify(v));await fs.rename(f+'.tmp',f);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const range=(a,b,step)=>Array.from({length:(b-a)/step},(_,i)=>a+i*step);
const folderDirs=['upper-partial-long-bnt-20261108','short-squeeze-volume-20261107','sideways-allshort-20261107',
 'dominance-model13-20261106','margin3-market-volume-20261107','lower-partial-continuation-short-20261109',
 'upper-first-push-quality-20261109'];
for(const d of ['raw','funding','journal'])await fs.mkdir(DIR+'/'+d,{recursive:true});
let manifest=await maybe(DIR+'/manifest.json');
if(!manifest){
 const ledger=JSON.parse(await fs.readFile('data/rising-volume-discord.json','utf8'));
 const history=new Map((await read('data/rising-volume-history.json')).history.map(e=>[e.id,e.snapshot]));
 const trades=(await read('data/rising-volume-binance.json')).attempts;
 const candidates=[];
 for(const r of Object.values(ledger.events)){
  if(r.status!=='SENT'||!(r.httpStatus>=200&&r.httpStatus<300)||r.closedAt<START||r.closedAt>=CUT
   ||!['LONG','SHORT'].includes(r.side)||!Number.isFinite(r.sentAt)||r.sentAt<=r.closedAt||r.sentAt>CUT
   ||r.id!==['rv',r.symbol,'1m',r.side,r.closedAt].join(':')||!/VOLUME 1M LIỀN MẠCH/.test(r.payload?.embeds?.[0]?.title??''))continue;
  const entryAt=(Math.floor(r.sentAt/S)+1)*S, h=history.get(r.id);
  const gate=r.payload.embeds[0].fields.find(f=>f.name==='GATE BINANCE · VOLUME + RATIO')?.value;
  candidates.push({id:r.id,symbol:r.symbol,side:r.side,closedAt:r.closedAt,sentAt:r.sentAt,entryAt,
   gatePass:gate?.startsWith('**PASS ratio tài khoản top trader 5m**')??false,
   snapshotPrice:h?.price??null,tradeStatus:trades[r.id]?.status??null});
 }
 candidates.sort((a,b)=>a.closedAt-b.closedAt||a.id.localeCompare(b.id));
 const journals={};
 for(const symbol of new Set(candidates.map(e=>e.symbol))){
  try{
   const b=await fs.readFile('data/pumpglass-position-journal/'+symbol+'.json');
   const name='journal/'+encodeURIComponent(symbol)+'.json';
   assert.equal(JSON.parse(b).symbol,symbol);await fs.writeFile(DIR+'/'+name,b);
   journals[symbol]={name,sha256:hash(b)};
  }catch(err){if(err.code!=='ENOENT')throw err;}
 }
 const evt=Buffer.from(JSON.stringify(candidates));await fs.writeFile(DIR+'/events.json',evt);
 manifest={version:VERSION,contextVersion:RISING_VOLUME_CONTEXT_VERSION,cut:CUT,start:START,eventsHash:hash(evt),journals,
  protocol:{data:'Actual Discord SENT 1m sustained LONG/SHORT. Complete 8h after first 5m open strictly after receipt.',
  whale:'First-observed journal only, timestamp <= signal close boundary and age <=15m. Missing not retro-filled.',
  model:'Reconstruct from price/MARK/OI at latest 5m end before or at signal close. Closed 1m highs/lows exclude already touched bands.',
  scope:'Model replay only on signals with causal whale data; insufficient whale group still gets trade baseline, not a full classifier evaluation.',
  leverage:LEV,tpRoe:TP,slRoe:SL,feePct:FEES,holdHours:8,
  timings:'TP/SL hit on 5m contract OHLC, SL first on ties, adverse stop gap, actual historic funding. Sensitivity 2h and first/coin/8h.'}};
 await save(DIR+'/manifest.json',manifest);
}
assert.equal(manifest.version,VERSION);
const input=await fs.readFile(DIR+'/events.json');assert.equal(hash(input),manifest.eventsHash);
const alerts=JSON.parse(input),events=alerts.filter(e=>e.entryAt+8*H<=CUT),bySymbol=Object.groupBy(events,e=>e.symbol);
const journalMap=new Map(), positions=new Map();
for(const e of events){
 if(!journalMap.has(e.symbol)){
  const file=manifest.journals[e.symbol];
  let points=[];
  if(file){const bytes=await fs.readFile(DIR+'/'+file.name);assert.equal(hash(bytes),file.sha256);points=JSON.parse(bytes).points;}
  journalMap.set(e.symbol,points);
 }
 const position=sweepPositionContext({symbol:e.symbol,at:e.closedAt,direction:e.side==='LONG'?'UPPER':'LOWER'},
  {points:journalMap.get(e.symbol),at:e.closedAt+1});
 if(position.point)positions.set(e.id,position);
}
console.log(JSON.stringify({stage:'frozen',mature:events.length,alerts:alerts.length,symbols:Object.keys(bySymbol).length,causalWhale:positions.size}));
let next=0,calls=0,weight=0,restErrors=[];
async function market(path,params){
 while(next>Date.now())await new Promise(r=>setTimeout(r,next-Date.now()));
 next=Date.now()+350;
 const response=await fetch('https://fapi.binance.com'+path+'?'+new URLSearchParams(params),{signal:AbortSignal.timeout(15000)});
 calls++;
 if(!response.ok){
  if(response.status===418||response.status===429||response.status===403)throw Error('STOP_BINANCE_'+response.status);
  throw Error(path+' '+(params.symbol??'')+' HTTP_'+response.status);
 }
 weight=Math.max(weight,Number(response.headers.get('x-mbx-used-weight-1m'))||0);
 if(Number(response.headers.get('x-mbx-used-weight-1m'))>1750)next=Math.ceil(Date.now()/MIN)*MIN+500;
 const rows=await response.json();assert.ok(Array.isArray(rows));
 return rows;
}
const oldFundDir='data/research/upper-partial-long-bnt-20261108';
const fb=await fs.readFile(oldFundDir+'/funding.json');
assert.equal(hash(fb),(await read(oldFundDir+'/fetch-complete.json')).fundingHash);
const fEnd=Math.floor((await read(oldFundDir+'/manifest.json')).end/H)*H;
const fundFrom=Math.min(...events.map(e=>e.entryAt)),fundTo=Math.max(...events.map(e=>e.entryAt+8*H));
const funding=JSON.parse(fb).filter(r=>+r.fundingTime>=fundFrom&&+r.fundingTime<fEnd);
for(let t=Math.max(Math.floor(fundFrom/H)*H,fEnd);t<fundTo;t+=H){
 const until=Math.min(t+H,fundTo),out=DIR+'/funding/'+t+'.json';
 let p=await maybe(out);
 if(!p&&until===t+H)p=await maybe('data/research/lower-partial-continuation-short-20261109/funding/'+t+'.json');
 if(!p)p=await market('/fapi/v1/fundingRate',{startTime:t,endTime:until-1,limit:1000});
 assert.ok(p.length<1000&&p.every(r=>+r.fundingTime>=t&&+r.fundingTime<until&&Number.isFinite(+r.fundingRate)));
 await save(out,p);
 funding.push(...p);
}
const byFunding=Object.groupBy([...new Map(funding.map(f=>[f.symbol+':'+f.fundingTime+':'+(f.rateType??'Regular'),f])).values()],f=>f.symbol);
const pathByType={price:'/fapi/v1/klines',minute:'/fapi/v1/klines',mark:'/fapi/v1/markPriceKlines',oi:'/futures/data/openInterestHist'};
const validBar=(b,step)=>Array.isArray(b)&&Number.isSafeInteger(+b[0])&&+b[0]%step===0&&+b[6]===+b[0]+step-1
 &&[1,2,3,4].every(i=>Number.isFinite(+b[i])&&+b[i]>0)&&+b[2]>=Math.max(+b[1],+b[4])&&+b[3]<=Math.min(+b[1],+b[4]);
async function buildData(symbol,list){
 const file=DIR+'/raw/'+encodeURIComponent(symbol)+'.json';
 const have=await maybe(file);if(have)return have;
 const name=encodeURIComponent(symbol);
 const dirs=['data/heatmap-market-raw-cache/'+symbol+'.json',...folderDirs.flatMap(d=>['data/research/'+d+'/raw/'+name+'-data.json','data/research/'+d+'/raw/'+name+'.json'])];
 const caches=(await Promise.all(dirs.map(maybe))).filter(r=>r?.symbol===symbol);
 const need={price:new Set(),mark:new Set(),oi:new Set(),minute:new Set()};
 for(const e of list){
  for(const t of range(e.entryAt,e.entryAt+8*H,S))need.price.add(t);
  if(!positions.has(e.id))continue;
  const p=heatmapRangePlan('24h',e.closedAt+1);
  for(const t of range(p.from,p.end,S))for(const k of ['price','mark','oi'])need[k].add(t);
  for(const t of range(Math.min(p.end,e.closedAt+1-MIN),e.closedAt+1,MIN))need.minute.add(t);
 }
 const result={symbol,errors:[]};
 for(const k of Object.keys(need)){
  const step=k==='minute'?MIN:S,time=b=>k==='oi'?+b.timestamp:+b[0];
  const valid=b=>k==='oi'?b.symbol===symbol&&Number.isFinite(+b.sumOpenInterest)&&+b.sumOpenInterest>0&&time(b)%step===0:validBar(b,step);
  const index=new Map(caches.flatMap(c=>c[k]??[]).filter(valid).map(b=>[time(b),b]));
  const ts=[...need[k]].sort((a,b)=>a-b),gaps=ts.filter(t=>!index.has(t));
  for(let i=0;i<gaps.length;){
   let j=i+1;
   while(j<gaps.length&&gaps[j]-gaps[i]<499*step&&gaps[j]-gaps[j-1]<=45*step)j++;
   const t0=gaps[i],t1=gaps[j-1]+step;
   try{
    const out=await market(pathByType[k],{symbol,[k==='oi'?'period':'interval']:k==='minute'?'1m':'5m',startTime:t0,endTime:t1-1,limit:(t1-t0)/step});
    for(const b of out)if(valid(b))index.set(time(b),b);
   }catch(err){
    if(err.message.startsWith('STOP_BINANCE_'))throw err;
    result.errors.push({type:k,from:t0,end:t1,error:err.message});
   }
   i=j;
  }
  result[k]=ts.flatMap(t=>index.has(t)?[index.get(t)]:[]);
 }
 await save(file,result);
 return result;
}
function outcome(e,bars,hours){
 const c=bars.slice(0,hours*12);
 const side=e.side==='LONG'?1:-1,entry=+c[0][1],tp=entry*(1+side*TP/(100*LEV)),sl=entry*(1-side*SL/(100*LEV));
 let exit=+c.at(-1)[4],exitAt=+c.at(-1)[6],reason='TIME',tie=false;
 for(const b of c){
  const [at,o,h,l]=b.map(Number),slHit=side===1?l<=sl:h>=sl,tpHit=side===1?h>=tp:l<=tp;
  if(side*(o-sl)<=0){exit=o;exitAt=at;reason='SL';break;}
  if(side*(o-tp)>=0){exit=tp;exitAt=at;reason='TP';break;}
  if(slHit||tpHit){exit=slHit?sl:tp;exitAt=+b[6];reason=slHit?'SL':'TP';tie=slHit&&tpHit;break;}
 }
 const credit=-side*(byFunding[e.symbol]??[]).filter(r=>+r.fundingTime>e.entryAt&&+r.fundingTime<=exitAt)
  .reduce((a,r)=>a+(+r.fundingRate)*(+r.markPrice>0?+r.markPrice/entry:1)*100,0);
 return {entry,exit,exitAt,reason,tie,netRoe:((exit/entry-1)*100*side-FEES+credit)*LEV,fundingCreditPct:credit};
}
function evalContext(e,raw,minute){
 const p=heatmapRangePlan('24h',e.closedAt+1);
 const last=minute.get(e.closedAt+1-MIN);
 if(!last)return {status:'MISSING_SIGNAL_MINUTE'};
 const price=+last[4];
 if(e.snapshotPrice!==null)assert.ok(Math.abs(e.snapshotPrice-price)<=price*1e-7,e.id+' close mismatch');
 const s={id:e.id,snapshot:{symbol:e.symbol,side:e.side,closedAt:e.closedAt,price}};
 const position=positions.get(e.id),f=k=>raw[k].filter(b=>+b[0]>=p.from&&+b[6]<p.end);
 const klines=f('price'),marks=f('mark'),oi=raw.oi.filter(b=>+b.timestamp>=p.from&&+b.timestamp<p.end);
 if(klines.length!==432||marks.length!==432)return {status:'MISSING_36H_PRICE_MARK',price};
 if(oi.length/432<.95)return {status:'MISSING_OI',price};
 const candles=normalizeBinanceHeatmapCandles(klines,p),markRows=normalizeBinanceHeatmapCandles(marks,p);
 const models=[1,3].map(model=>({model,status:'OK',data:buildBinanceHeatmapProfiles({query:{symbol:e.symbol,range:'24h'},plan:p,candles,markRows,oiRows:oi,model})}));
 const minuteRows=range(p.end,e.closedAt+1,MIN).map(t=>minute.get(t)).filter(Boolean)
  .map(b=>({openTime:+b[0],open:+b[1],high:+b[2],low:+b[3],close:+b[4],closeTime:+b[6]}));
 const result=risingVolumeContext(s,{bundle:{models},position,minuteRows,at:e.closedAt+1});
 if(!result.model)return {status:'MISSING_MODEL_OR_PATH',price};
 assert.ok(result.position&&result.model.at<=e.closedAt+1&&result.position.point.observedAt<=e.closedAt+1);
 return {status:'OK',price,result};
}
const list=Object.entries(bySymbol),records=[];
let index=0,done=0;
const worker=async()=>{
 while(index<list.length){
  const [symbol,rows]=list[index++],raw=await buildData(symbol,rows);
  restErrors.push(...raw.errors.map(r=>({symbol,...r})));
  const price=new Map(raw.price.map(b=>[+b[0],b])),minute=new Map(raw.minute.map(b=>[+b[0],b]));
  for(const e of rows){
   const path=range(e.entryAt,e.entryAt+8*H,S).map(t=>price.get(t));
   const status=positions.has(e.id)?evalContext(e,raw,minute):{status:'MISSING_WHALE'};
   const full=path.every(Boolean);
   records.push({...e,context:status,trade:full?outcome(e,path,8):null,trade2h:full?outcome(e,path,2):null});
  }
  done++;
  if(done%25===0||done===list.length)console.log(JSON.stringify({stage:'replay',symbols:done,total:list.length,calls,weight,errors:restErrors.length,classified:records.filter(r=>r.context.status==='OK').length}));
 }
};
await Promise.all(Array.from({length:4},worker));
records.sort((a,b)=>a.closedAt-b.closedAt||a.id.localeCompare(b.id));
const once=records.filter((r,i)=>!records.slice(0,i).some(p=>p.symbol===r.symbol&&r.closedAt-p.closedAt<8*H));
const grade=r=>r.context.status==='OK'?r.context.result.state:'MISSING';
const avg=xs=>xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null;
function stats(xs,key='trade'){
 const n=xs.length,rr=xs.filter(r=>r[key]),rows=rr.map(r=>r[key]);
 return {n,valid:rows.length,coins:new Set(rr.map(r=>r.symbol)).size,wins:rows.filter(t=>t.netRoe>0).length,
  tp:rows.filter(t=>t.reason==='TP').length,sl:rows.filter(t=>t.reason==='SL').length,
  time:rows.filter(t=>t.reason==='TIME').length,ties:rows.filter(t=>t.tie).length,
  mean:avg(rows.map(t=>t.netRoe)),stress:avg(rows.map(t=>t.netRoe-LEV*(.30-FEES)))};
}
function groups(rows){
 return Object.fromEntries(Object.entries({ALL:rows,KNOWN:rows.filter(r=>r.context.status==='OK'),
  ...Object.groupBy(rows,grade)}).map(([k,r])=>[k,{all:stats(r),long:stats(r.filter(e=>e.side==='LONG')),short:stats(r.filter(e=>e.side==='SHORT')),hold2h:stats(r,'trade2h')}]));
}
const statusCount=Object.fromEntries(Object.entries(Object.groupBy(records,r=>r.context.status)).map(([k,v])=>[k,v.length]));
const known=records.filter(r=>r.context.status==='OK');
const tests={
 WHALE_ONLY:r=>r.context.result.whaleSide===r.side,
 MODEL_ONLY:r=>r.context.result.liquiditySide===r.side&&!!(r.side==='LONG'?r.context.result.model.above:r.context.result.model.below),
 BOTH:r=>grade(r)==='ALIGNED',
};
const factors=Object.fromEntries(Object.entries(tests).map(([k,f])=>[k,{pass:stats(known.filter(f)),other:stats(known.filter(r=>!f(r)))}]));
const report={version:VERSION,total:alerts.length,mature:records.length,pending:alerts.length-records.length,causalWhale:positions.size,factors,
 statusCount,calls,weight,restErrors,groups:groups(records),dedup:groups(once),
 days:Object.fromEntries(Object.entries(Object.groupBy(records,r=>asVN(r.closedAt))).map(([k,v])=>[k,groups(v)])),
 ratioPass:groups(records.filter(r=>r.gatePass)),records};
await save(DIR+'/results.json',report);
console.log(JSON.stringify({statusCount,groups:Object.fromEntries(Object.entries(report.groups).map(([k,g])=>[k,g.all])),ratioPass:report.ratioPass.ALL?.all}));

