import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {sweepPositionContext} from '../src/heatmapSweepPositionAnalysis.js';
import {classifyPpksContext, PPKS_CONTEXT_VERSION} from '../src/ppksModel13WhaleContext.js';
import {heatmapRangePlan, normalizeBinanceHeatmapCandles, buildBinanceHeatmapProfiles} from '../src/binanceHeatmapModel.js';

const OUT = 'data/research/ppks-model13-whale-20261110';
const START = Date.parse('2026-11-07T00:00:00+07:00');
const STEP = 300_000;
const HOLD = 48;
const LEVERAGE = 3;
const TP = 5;
const SL = 20;
const ROUND_TRIP_FEE_PCT = .14;
const CUT = Math.floor(Date.now()/STEP)*STEP;
const read = async path => JSON.parse(await readFile(path,'utf8'));
const maybe = async path => {
  try { return await read(path); }
  catch (error) { if(error.code!=='ENOENT')throw error; return null; }
};
const save = (file,value) => writeFile(file,JSON.stringify(value,null,2)+'\n');
const all = (await read('data/ppks-paper-trades.json')).trades
  .filter(t => /^ppks-auto-\d+$/.test(t.source) && t.ppksSignalTimeframe==='15m'
    && ((t.side==='LONG'&&t.ppksSignalType==='post_dump_kill_long')
      || (t.side==='SHORT'&&t.ppksSignalType==='post_pump_kill_short'))
    && Date.parse(t.createdAt)>=START && Date.parse(t.createdAt)<CUT)
  .map(t => ({id:t.id,symbol:t.symbol,side:t.side,stage:t.side==='LONG'?'confirmed_long':'confirmed_short',
    scannedAt:Date.parse(t.createdAt),entryAt:(Math.floor(Date.parse(t.createdAt)/STEP)+1)*STEP,
    paperStatus:t.status,paperOutcome:t.outcome??null}))
  .sort((a,b)=>a.scannedAt-b.scannedAt);
const events = all.filter(e=>e.entryAt+HOLD*STEP<=CUT);
const groups = Object.entries(Object.groupBy(events,e=>e.symbol));
const caches = [
  symbol=>'data/heatmap-market-raw-cache/'+symbol+'.json',
  symbol=>'data/research/rising-volume-context-20261109/raw/'+encodeURIComponent(symbol)+'.json',
  symbol=>'data/research/upper-first-push-quality-20261109/raw/'+encodeURIComponent(symbol)+'.json',
  symbol=>'data/research/lower-partial-continuation-short-20261109/raw/'+encodeURIComponent(symbol)+'.json',
  symbol=>'data/research/upper-partial-long-bnt-20261108/raw/'+encodeURIComponent(symbol)+'.json',
];
const endpoints={price:'/fapi/v1/klines',mark:'/fapi/v1/markPriceKlines',oi:'/futures/data/openInterestHist'};
const timestamp=(k,r)=>Number(k==='oi'?r.timestamp:r[0]);
const sequence=(start,end)=>Array.from({length:(end-start)/STEP},(_,i)=>start+i*STEP);
let nextRequest=0, requests=0;
async function fetchRows(symbol,k,from,to) {
  const now=Date.now(),scheduled=Math.max(nextRequest,now);
  nextRequest=scheduled+320;
  if(scheduled>now)await sleep(scheduled-now);
  const params=new URLSearchParams({symbol,[k==='oi'?'period':'interval']:'5m',
    startTime:from,endTime:to-1,limit:(to-from)/STEP});
  requests++;
  const res=await fetch('https://fapi.binance.com'+endpoints[k]+'?'+params,{signal:AbortSignal.timeout(8500)});
  if([418,429].includes(res.status))throw Error('BINANCE_RATE_LIMIT_'+res.status);
  if(!res.ok)throw Error(k+' '+symbol+' HTTP '+res.status);
  const rows=await res.json();
  assert.ok(Array.isArray(rows));
  return rows;
}

function simulate(event,price,mark) {
  const times=sequence(event.entryAt,event.entryAt+HOLD*STEP);
  if(!times.every(t=>price.has(t)&&mark.has(t)))return null;
  const sign=event.side==='LONG'?1:-1,entry=Number(price.get(times[0])[1]);
  const tp=entry*(1+sign*TP/300),sl=entry*(1-sign*SL/300);
  let exit=Number(price.get(times.at(-1))[4]),reason='TIME',tie=false;
  for(const t of times){
    const p=price.get(t),m=mark.get(t);
    const stop=sign===1?Number(m[3])<=sl:Number(m[2])>=sl;
    const target=sign===1?Number(p[2])>=tp:Number(p[3])<=tp;
    if(stop||target){
      exit=stop?(sign*(Number(m[1])-sl)<=0?Number(p[1]):sl):tp;
      reason=stop?'SL':'TP';
      tie=stop&&target;
      break;
    }
  }
  return {entry,tp,sl,exit,reason,tie,netRoe:((exit/entry-1)*100*sign-ROUND_TRIP_FEE_PCT)*LEVERAGE};
}

await mkdir(OUT+'/raw',{recursive:true});
await save(OUT+'/sample.json',{cut:CUT,start:START,all});
const results=[];
const errors=[];
async function processSymbol(symbol,rows) {
  const journal=await maybe('data/pumpglass-position-journal/'+symbol+'.json');
  const need={price:new Set(),mark:new Set(),oi:new Set()};
  for(const e of rows){
    e.plan=heatmapRangePlan('24h',e.scannedAt);
    for(const t of sequence(e.plan.from,e.plan.end))for(const k of Object.keys(need))need[k].add(t);
    for(const t of sequence(e.entryAt,e.entryAt+HOLD*STEP))for(const k of ['price','mark'])need[k].add(t);
  }
  const local=await Promise.all(caches.map(path=>maybe(path(symbol))));
  const indexes={};
  for(const k of Object.keys(need)){
    const index=new Map(local.flatMap(x=>x?.[k]??[]).filter(r=>need[k].has(timestamp(k,r))).map(r=>[timestamp(k,r),r]));
    const missing=[...need[k]].filter(t=>!index.has(t)).sort((a,b)=>a-b);
    for(let i=0;i<missing.length;){
      let j=i+1;
      while(j<missing.length&&missing[j]-missing[i]<499*STEP&&missing[j]-missing[j-1]<=24*STEP)j++;
      try{
        for(const item of await fetchRows(symbol,k,missing[i],missing[j-1]+STEP)){
          const t=timestamp(k,item);
          if(need[k].has(t))index.set(t,item);
        }
      }catch(error){
        if(error.message.startsWith('BINANCE_RATE_LIMIT_'))throw error;
        errors.push({symbol,key:k,at:missing[i],error:error.message});
      }
      i=j;
    }
    indexes[k]=index;
  }
  await writeFile(OUT+'/raw/'+encodeURIComponent(symbol)+'.json',JSON.stringify(Object.fromEntries(
    Object.entries(indexes).map(([k,v])=>[k,[...v.values()]]))));
  for(const e of rows){
    const {plan,...record}=e;
    const points=journal?.symbol===symbol?journal.points:[];
    const position=sweepPositionContext({symbol,at:e.scannedAt},{points,at:e.scannedAt});
    let bundle=null;
    try {
      const time=sequence(plan.from,plan.end);
      const raw=k=>time.map(t=>indexes[k].get(t)).filter(Boolean);
      const p=raw('price'),m=raw('mark'),oiRows=raw('oi');
      if(p.length===time.length&&m.length===time.length){
        const candles=normalizeBinanceHeatmapCandles(p,plan),markRows=normalizeBinanceHeatmapCandles(m,plan);
        bundle={models:[1,3].map(model=>({model,status:'OK',data:buildBinanceHeatmapProfiles({
          query:{symbol,range:'24h'},plan,candles,markRows,oiRows,model,
        })}))};
      }
    }catch(error){errors.push({symbol,key:'model',at:e.scannedAt,error:error.message});}
    const c=classifyPpksContext(e,{bundle,position});
    results.push({...record,context:c,trade:simulate(e,indexes.price,indexes.mark)});
  }
}
let cursor=0,done=0;
await Promise.all(Array.from({length:4},async()=>{
  while(cursor<groups.length){
    const [symbol,rows]=groups[cursor++];
    await processSymbol(symbol,rows);
    done++;
    if(done%10===0||done===groups.length)console.log(JSON.stringify({done,symbols:groups.length,requests}));
  }
}));
results.sort((a,b)=>a.scannedAt-b.scannedAt);

function stats(rows) {
  const r=rows.filter(e=>e.trade);
  const pnl=r.map(e=>e.trade.netRoe);
  return {n:r.length,coins:new Set(r.map(e=>e.symbol)).size,wins:pnl.filter(x=>x>0).length,
    tp:r.filter(e=>e.trade.reason==='TP').length,sl:r.filter(e=>e.trade.reason==='SL').length,
    mean:pnl.length?pnl.reduce((a,b)=>a+b,0)/pnl.length:null};
}
const sides=Object.fromEntries(['LONG','SHORT'].map(side=>{
  const rows=results.filter(e=>e.side===side),matched=rows.filter(e=>e.context.position?.point&&e.context.model);
  return [side,{
    total:all.filter(e=>e.side===side).length,mature:rows.length,knownWhale:rows.filter(e=>e.context.position?.point).length,
    knownModel:rows.filter(e=>e.context.model).length,baseline:stats(rows),matchedBaseline:stats(matched),
    whaleOnly:stats(matched.filter(e=>e.context.whalePass)),modelOnly:stats(matched.filter(e=>e.context.modelPass)),
    aligned:stats(matched.filter(e=>e.context.state==='ALIGNED')),
    conflict:stats(matched.filter(e=>e.context.state==='CONFLICT')),
    wait:stats(matched.filter(e=>e.context.state==='WAIT')),
  }];
}));
const report={version:PPKS_CONTEXT_VERSION,start:START,cut:CUT,protocol:{leverage:LEVERAGE,tp:TP,sl:SL,holdMinutes:240,
  feePct:ROUND_TRIP_FEE_PCT,entry:'Next 5m open after paper signal timestamp',funding:false,tpTrigger:'Contract',
  slTrigger:'Mark; SL wins same-bar tie',position:'PumpGlass journal known by signal timestamp within 15m'},
  requests,errors,sides,results};
await save(OUT+'/results.json',report);
console.log(JSON.stringify({sides,errors:errors.length,requests,cut:CUT},null,2));
