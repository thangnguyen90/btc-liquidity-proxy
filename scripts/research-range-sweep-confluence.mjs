// Offline retrospective enrichment. No runtime/order/notifier imports.
import fs from 'node:fs/promises';
import {asofRatio} from './research-range-sweep-ratio-asof.mjs';
const dir='data/research/range-sweep-confluence-20261031';
await fs.mkdir(dir+'/raw',{recursive:true});
const read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const save=async(f,x)=>fs.writeFile(f,JSON.stringify(x,null,2));
const source='data/research/range-sweep-alert-backtest-20261031';
const study=await read(source+'/results.json'),manifest=await read(source+'/signals.json');
const es=manifest.events,events=new Map(es.map(e=>[e.id,e])),symbols=[...new Set(es.map(e=>e.symbol))];
const P=300000,raw=new Map(),errors=[];let calls=0,next=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(const symbol of symbols){
 const se=es.filter(e=>e.symbol===symbol),from=Math.floor((Math.min(...se.map(e=>e.at))-3600000)/P)*P,to=Math.max(...se.map(e=>e.at));const data={};
 for(const type of ['Account','Position']){
  const f=dir+'/raw/'+encodeURIComponent(symbol)+'-'+type+'.json';
  try{data[type]=await read(f);}catch(e){if(e.code!=='ENOENT')throw e;
   try{await sleep(Math.max(0,next-Date.now()));next=Date.now()+550;
    const q=new URLSearchParams({symbol,period:'5m',startTime:String(from),endTime:String(to),limit:'500'});
    const r=await fetch('https://fapi.binance.com/futures/data/topLongShort'+type+'Ratio?'+q,{signal:AbortSignal.timeout(15000)});calls++;
    if([418,429].includes(r.status))throw Error('STOP_RATE_'+r.status);
    if(!r.ok)throw Error('HTTP_'+r.status);const v=await r.json();if(!Array.isArray(v))throw Error('INVALID_RESPONSE');data[type]=v;await save(f,v);
    const w=Number(r.headers.get('x-mbx-used-weight-1m')??0);if(w>=1050)next=Math.max(next,Date.now()+61000-Date.now()%60000);
   }catch(err){if(err.message.startsWith('STOP_RATE'))throw err;errors.push({symbol,type,error:err.message});data[type]=[];}
  }
 }
 raw.set(symbol,data);if(raw.size%10===0)console.log(JSON.stringify({done:raw.size,total:symbols.length,calls,errors:errors.length}));
}
const median=xs=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
const avg=xs=>xs.length?xs.reduce((s,v)=>s+v,0)/xs.length:null;
const midpoint=(es[0].at+es.at(-1).at)/2;
function stats(rs){const vals=rs.map(r=>r.net15).filter(Number.isFinite),profits=vals.filter(x=>x>0).reduce((a,b)=>a+b,0),loss=-vals.filter(x=>x<0).reduce((a,b)=>a+b,0);const n=vals.length;return {n,winPct:n?vals.filter(x=>x>0).length/n*100:null,avgNet15:avg(vals),medianNet15:median(vals),pf:loss?profits/loss:null,firstN:rs.filter(r=>r.at<=midpoint).length,firstNet:avg(rs.filter(r=>r.at<=midpoint).map(r=>r.net15)),secondN:rs.filter(r=>r.at>midpoint).length,secondNet:avg(rs.filter(r=>r.at>midpoint).map(r=>r.net15)),atr1Mean:avg(rs.map(r=>r.atr1).filter(Number.isFinite))};}
const rows=study.records.filter(r=>Number.isFinite(r.horizons[15]?.netPct)).map(r=>{const e=events.get(r.id),s=e.side==='LONG'?1:-1;const data=raw.get(e.symbol);const account=asofRatio(data.Account,e.at,P),position=asofRatio(data.Position,e.at,P),account10=asofRatio(data.Account,e.at,2*P),position10=asofRatio(data.Position,e.at,2*P);const dist=e.kind==='DIRECTION_CONFIRMED'?(s===1?e.zone.low-e.price:e.price-e.zone.high)/e.base.atr:null;
 return {id:r.id,symbol:r.symbol,side:r.side,kind:r.kind,at:e.at,net15:r.horizons[15].netPct,atr1:r.brackets.ATR1_TP1_SL1?.netPct,zoneStrength:e.zone.overlapStrength,zoneDistanceAtr:dist,volumeX:e.flow.volumeX,quoteVolume:e.flow.q,takerAlignedPct:s===1?e.flow.buyPct:100-e.flow.buyPct,widthAtr:e.base.widthAtr,efficiency:e.base.efficiency,chaseAtr:(s===1?e.price-e.base.high:e.base.low-e.price)/e.base.atr,account,position,account10,position10,accountDelta:account?s*account.change15Pct:null,positionDelta:position?s*position.change15Pct:null};});
const features=['zoneStrength','zoneDistanceAtr','volumeX','quoteVolume','takerAlignedPct','widthAtr','efficiency'];
const comparisons=Object.fromEntries(['LONG','SHORT'].map(side=>[side,Object.fromEntries(features.map(f=>[f,{winMedian:median(rows.filter(r=>r.side===side&&r.net15>0).map(r=>r[f])),lossMedian:median(rows.filter(r=>r.side===side&&r.net15<=0).map(r=>r[f]))}]))]));
// Fixed exploratory splits, not an optimizer. Report every split, its complement, and temporal halves.
const filters={positionTrendAligned:r=>r.positionDelta>0,positionTrendOpposed:r=>r.positionDelta<0,accountTrendAligned:r=>r.accountDelta>0,bothTrendsAligned:r=>r.accountDelta>0&&r.positionDelta>0,bothTrendsOpposed:r=>r.accountDelta<0&&r.positionDelta<0,ratiosDiverge:r=>r.accountDelta*r.positionDelta<0,zoneAtLeast50:r=>r.zoneStrength>=50,zoneAtLeast50AndPositionAligned:r=>r.zoneStrength>=50&&r.positionDelta>0,zoneAtLeast50AndBothOpposed:r=>r.zoneStrength>=50&&r.positionDelta<0&&r.accountDelta<0,volumeAtLeast100k:r=>r.quoteVolume>=100000};
const splits={};for(const side of ['LONG','SHORT']){const rs=rows.filter(r=>r.side===side),complete=rs.filter(r=>r.account&&r.position);splits[side]={all:stats(rs),complete:stats(complete),missing:stats(rs.filter(r=>!r.account||!r.position)),filters:Object.fromEntries(Object.entries(filters).map(([k,fn])=>[k,{pass:stats(complete.filter(fn)),fail:stats(complete.filter(r=>!fn(r)))}]))};}
const sensitivity={};for(const side of ['LONG','SHORT']){const rs=rows.filter(r=>r.side===side&&r.account10&&r.position10).map(r=>({...r,accountDelta:(side==='LONG'?1:-1)*r.account10.change15Pct,positionDelta:(side==='LONG'?1:-1)*r.position10.change15Pct}));sensitivity[side]={complete:stats(rs),filters:Object.fromEntries(Object.entries(filters).map(([k,fn])=>[k,stats(rs.filter(fn))]))};}
const phases=Object.fromEntries([...new Set(rows.map(r=>r.side+' '+r.kind))].map(k=>[k,stats(rows.filter(r=>r.side+' '+r.kind===k))]));
const out={version:'RANGE_SWEEP_TOP_TRADER_CONFLUENCE_RESEARCH_V1_20261031',generatedAt:new Date().toISOString(),method:{outcome:'Net15m >0 good, <=0 bad; research outcome label only',costs:study.method,ratio:'Account and Position separate; latest point timestamp at least 5m before signal, 15m change; 10m lag sensitivity; no captured publication receipt time so availability remains an assumption',heatmap:'Only frozen Model1/3 consensus zone from each alert; no reconstruction using current raw cache',limits:'Retrospective exploratory splits of the same 123 alerts, no independent holdout; no liquidation proof; no runtime or trading changes'},calls,errors,comparisons,splits,sensitivity,phases,rows};await save(dir+'/results.json',out);console.log(JSON.stringify({complete:true,counts:Object.fromEntries(Object.entries(splits).map(([s,v])=>[s,{all:v.all.n,ratio:v.complete.n,missing:v.missing.n}])),errors}));
