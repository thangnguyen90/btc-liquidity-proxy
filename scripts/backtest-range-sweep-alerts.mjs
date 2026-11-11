// Offline study of alerts actually delivered. Public GET requests only; no server/order/notifier imports.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simulateBracket} from './research-range-sweep-alert-model.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DIR=path.join(ROOT,'data/research/range-sweep-alert-backtest-20261031');
const VERSION='RANGE_SWEEP_DELIVERED_ALERT_STUDY_V1_20261031';
const M=60000,HORIZONS=[5,15,30,60],COST=.0012,STRESS=.002;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const save=async(f,v)=>fs.writeFile(f,JSON.stringify(v,null,2));
await fs.mkdir(path.join(DIR,'raw'),{recursive:true});
let requests=0,weight=0,nextAt=0;
async function get(endpoint,params){
 await sleep(Math.max(0,nextAt-Date.now()));nextAt=Date.now()+550;
 const url=new URL(endpoint,'https://fapi.binance.com');url.search=new URLSearchParams(params);
 const r=await fetch(url,{signal:AbortSignal.timeout(20000)});requests++;
 weight=Number(r.headers.get('x-mbx-used-weight-1m')??weight);
 if([418,429].includes(r.status))throw Error('STOP_RATE_LIMIT_'+r.status);
 if(!r.ok)throw Error('PUBLIC_DATA_HTTP_'+r.status);
 const data=await r.json();
 if(weight>=1050){console.log(JSON.stringify({pause:'shared IP weight',weight}));nextAt=Math.max(nextAt,Date.now()+61000-Date.now()%60000);}
 return data;
}
function histories(j){const out=[];if(Array.isArray(j?.history))out.push(...j.history);for(const key of ['observer','snapshot'])if(j?.[key])out.push(...histories(j[key]));return out;}
let manifest;try{manifest=await read(path.join(DIR,'signals.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(!manifest){
 const sources=[path.join(DIR,'live-history-snapshot.json')];
 for(const dir of ['range-sweep-flow-diagnostics-20261030','range-sweep-no-signals-fix-20261030','range-liquidity-sweep-deploy-20261029']){
  const folder=path.join(ROOT,'data/research',dir);for(const name of await fs.readdir(folder))if(name.endsWith('.json'))sources.push(path.join(folder,name));
 }
 const all=new Map(),sourceCounts={};
 for(const file of sources){const events=histories(await read(file)).filter(e=>['LONG','SHORT'].includes(e.side)&&e.delivery?.status==='SENT'&&e.delivery?.sent>0);sourceCounts[path.relative(ROOT,file)]=events.length;for(const e of events)all.set(e.id,e);}
 const events=[...all.values()].sort((a,b)=>a.at-b.at);manifest={version:VERSION,cutoff:Date.now(),sourceCounts,events};await save(path.join(DIR,'signals.json'),manifest);
}
const cutoff=manifest.cutoff;
const events=manifest.events.filter(e=>Number.isFinite(e.delivery.at)&&e.delivery.at>=e.at&&e.delivery.at<=cutoff&&e.price>0&&e.base?.atr>0);
const bySymbol=new Map();for(const e of events){if(!bySymbol.has(e.symbol))bySymbol.set(e.symbol,[]);bySymbol.get(e.symbol).push(e);}
const market=new Map(),errors=[];
for(const [symbol,es]of bySymbol){
 const from=Math.floor(Math.min(...es.map(e=>e.at))/M)*M;
 const to=Math.min(Math.floor(cutoff/M)*M,Math.max(...es.map(e=>Math.ceil((e.delivery.at+1)/M)*M))+60*M);
 const prefix=path.join(DIR,'raw',encodeURIComponent(symbol)+'-'+from+'-'+to);
 try{
  let candles;try{candles=await read(prefix+'-klines.json');}catch(e){if(e.code!=='ENOENT')throw e;const rows=[];let cursor=from;while(cursor<to){const page=await get('/fapi/v1/klines',{symbol,interval:'1m',startTime:String(cursor),endTime:String(to-1),limit:'1000'});if(!Array.isArray(page))throw Error('INVALID_KLINES');rows.push(...page.filter(r=>+r[0]>=from&&+r[6]<to));if(page.length===0)break;const next=+page.at(-1)[0]+M;if(next<=cursor)throw Error('PAGINATION');cursor=next;if(page.length<1000)break;}candles=rows;await save(prefix+'-klines.json',candles);}
  let funding;try{funding=await read(prefix+'-funding.json');}catch(e){if(e.code!=='ENOENT')throw e;funding=await get('/fapi/v1/fundingRate',{symbol,startTime:String(from),endTime:String(to-1),limit:'1000'});if(!Array.isArray(funding))throw Error('INVALID_FUNDING');await save(prefix+'-funding.json',funding);}
  market.set(symbol,{candles:new Map(candles.map(r=>[+r[0],{t:+r[0],end:+r[6],o:+r[1],h:+r[2],l:+r[3],c:+r[4]}])),funding});
 }catch(e){if(/STOP_RATE_LIMIT/.test(e.message))throw e;errors.push({symbol,error:e.message});}
 console.log(JSON.stringify({progress:market.size+errors.length,total:bySymbol.size,symbol,requests,weight}));
}
function fundingCost(m,entryAt,exitAt,entry,sign){return m.funding.filter(f=>+f.fundingTime>entryAt&&+f.fundingTime<=exitAt).reduce((sum,f)=>sum+sign*Number(f.fundingRate)*(Number(f.markPrice)>0?Number(f.markPrice)/entry:1),0);}
const records=[];
for(const e of events){
 const m=market.get(e.symbol),entryAt=Math.ceil((e.delivery.at+1)/M)*M;
 const row={id:e.id,cohortId:e.cohortId,symbol:e.symbol,side:e.side,kind:e.kind,signalAt:e.at,deliveredAt:e.delivery.at,entryAt,signalMark:e.price,atr:e.base.atr,volumeX:e.flow?.volumeX,buyPct:e.flow?.buyPct,widthAtr:e.base.widthAtr,zone:e.zone,horizons:{},brackets:{}};
 if(!m){row.excluded='PUBLIC_DATA_UNAVAILABLE';records.push(row);continue;}
 const entryBar=m.candles.get(entryAt);if(!entryBar){row.excluded=entryAt>=Math.floor(cutoff/M)*M?'IMMATURE':'ENTRY_BAR_MISSING';records.push(row);continue;}
 const entry=entryBar.o,sign=e.side==='LONG'?1:-1;row.entry=entry;row.delaySeconds=(entryAt-e.at)/1000;row.markToEntryPct=(entry/e.price-1)*100;
 for(const h of HORIZONS){
  if(entryAt+h*M>Math.floor(cutoff/M)*M){row.horizons[h]={excluded:'IMMATURE'};continue;}
  const bars=Array.from({length:h},(_,i)=>m.candles.get(entryAt+i*M));
  if(bars.some(b=>!b||b.end!==b.t+M-1||![b.o,b.h,b.l,b.c].every(Number.isFinite)||b.o<=0||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c))){row.horizons[h]={excluded:'MISSING_OR_INVALID_BAR'};continue;}
  const last=bars.at(-1),gross=sign*(last.c/entry-1),funding=fundingCost(m,entryAt,last.end,entry,sign);
  const mfe=Math.max(0,...bars.map(b=>sign===1?b.h/entry-1:1-b.l/entry));const mae=Math.max(0,...bars.map(b=>sign===1?1-b.l/entry:b.h/entry-1));
  const target=e.kind==='DIRECTION_CONFIRMED'?(sign===1?e.zone?.low:e.zone?.high):null;const targetAhead=Number.isFinite(target)&&sign*(target-entry)>0;
  row.horizons[h]={grossPct:gross*100,netPct:(gross-COST-funding)*100,stressNetPct:(gross-STRESS-funding)*100,fundingPct:funding*100,mfePct:mfe*100,maePct:mae*100,exit:last.c,targetEligible:targetAhead,targetHit:targetAhead?bars.some(b=>sign===1?b.h>=target:b.l<=target):null};
  for(const [name,tp,sl]of [['ATR1_TP1_SL1',1,1],['ATR2_TP2_SL1',2,1]])if(h===30){const b=simulateBracket(bars,entry,sign,e.base.atr,tp,sl);if(b){const f=fundingCost(m,entryAt,b.exitAt,entry,sign);row.brackets[name]={...b,netPct:(sign*(b.exit/entry-1)-COST-f)*100};}}
 }
 records.push(row);
}
const avg=x=>x.length?x.reduce((a,b)=>a+b,0)/x.length:null;
const median=x=>{const s=[...x].sort((a,b)=>a-b);return s.length?(s[Math.floor((s.length-1)/2)]+s[Math.ceil((s.length-1)/2)])/2:null;};
function summary(values){const x=values.filter(Number.isFinite);const gain=x.filter(v=>v>0).reduce((a,b)=>a+b,0),loss=-x.filter(v=>v<0).reduce((a,b)=>a+b,0);return {n:x.length,winPct:x.length?x.filter(v=>v>0).length/x.length*100:null,avgNetPct:avg(x),medianNetPct:median(x),profitFactor:loss?gain/loss:null,sumEqualNotionalPct:x.reduce((a,b)=>a+b,0),avgRoe3xPct:avg(x)===null?null:3*avg(x)};}
function groupSummary(rs){return {events:rs.length,horizons:Object.fromEntries(HORIZONS.map(h=>[h,{...summary(rs.map(r=>r.horizons[h]?.netPct)),avgGrossPct:avg(rs.map(r=>r.horizons[h]?.grossPct).filter(Number.isFinite)),avgStressNetPct:avg(rs.map(r=>r.horizons[h]?.stressNetPct).filter(Number.isFinite)),targetEligible:rs.filter(r=>r.horizons[h]?.targetEligible).length,targetHitCount:rs.filter(r=>r.horizons[h]?.targetHit).length,medianMfePct:median(rs.map(r=>r.horizons[h]?.mfePct).filter(Number.isFinite)),medianMaePct:median(rs.map(r=>r.horizons[h]?.maePct).filter(Number.isFinite)),exclusions:rs.filter(r=>!Number.isFinite(r.horizons[h]?.netPct)).reduce((a,r)=>{const reason=r.excluded??r.horizons[h]?.excluded??'UNKNOWN';a[reason]=(a[reason]??0)+1;return a;},{})}])),brackets:Object.fromEntries(['ATR1_TP1_SL1','ATR2_TP2_SL1'].map(k=>[k,{...summary(rs.map(r=>r.brackets[k]?.netPct)),outcomes:rs.filter(r=>r.brackets[k]).reduce((a,r)=>(a[r.brackets[k].outcome]=(a[r.brackets[k].outcome]??0)+1,a),{}),ambiguous:rs.filter(r=>r.brackets[k]?.ambiguous).length}]))};}
// One-hour time block bootstrap, preserving simultaneous-market dependence within each block.
function blockCI(rs,h){const blocks=new Map();for(const r of rs)if(Number.isFinite(r.horizons[h]?.netPct)){const k=Math.floor(r.entryAt/3600000);if(!blocks.has(k))blocks.set(k,[]);blocks.get(k).push(r.horizons[h].netPct);}const bs=[...blocks.values()];if(bs.length<3)return {blocks:bs.length,ci95:null};let seed=104729;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const means=[];for(let i=0;i<3000;i++){const v=[];for(let j=0;j<bs.length;j++)v.push(...bs[Math.floor(rand()*bs.length)]);means.push(avg(v));}means.sort((a,b)=>a-b);return {blocks:bs.length,ci95:[means[75],means[2924]]};}
const groups={ALL:groupSummary(records),LONG:groupSummary(records.filter(r=>r.side==='LONG')),SHORT:groupSummary(records.filter(r=>r.side==='SHORT'))};
const phases=Object.fromEntries([...new Set(records.map(r=>r.side+' '+r.kind))].map(k=>[k,groupSummary(records.filter(r=>r.side+' '+r.kind===k))]));
const chronological=Object.fromEntries(['LONG','SHORT'].map(side=>{const rs=records.filter(r=>r.side===side);return [side,{firstHalf:groupSummary(rs.slice(0,Math.floor(rs.length/2))),secondHalf:groupSummary(rs.slice(Math.floor(rs.length/2)))}];}));
const uncertainty=Object.fromEntries(['ALL','LONG','SHORT'].map(side=>[side,blockCI(records.filter(r=>side==='ALL'||r.side===side),15)]));
const perSymbol=Object.fromEntries([...bySymbol.keys()].map(symbol=>[symbol,summary(records.filter(r=>r.symbol===symbol).map(r=>r.horizons[15]?.netPct))]));
const result={version:VERSION,generatedAt:new Date().toISOString(),cutoff:new Date(cutoff).toISOString(),scope:{events:events.length,symbols:bySymbol.size,firstSignal:new Date(events[0].at).toISOString(),lastSignal:new Date(events.at(-1).at).toISOString(),sourceCounts:manifest.sourceCounts,rollingHistoryLimit:500,incompleteLifetimeHistory:true},method:{entry:'Next full 1m traded-price open strictly after successful Discord delivery; no signal-bar high/low used',horizonsMinutes:HORIZONS,roundTripCostPct:COST*100,costAssumptions:'0.05% taker fee + 0.01% slippage per side; assumed, not account commission',stressRoundTripCostPct:STRESS*100,funding:'Actual public funding history, side signed; markPrice/entry scales payment; entry-time payment excluded',brackets:'Research assumptions, not bot SL/TP: 1ATR TP/1ATR SL or 2ATR TP/1ATR SL; 30m timeout; simultaneous touches SL first; gap at open',leverageForRoe:3,portfolio:'Each signal independent equal notional; overlaps allowed; sum is not a funded portfolio return',limitations:['Only retained delivered alerts plus available frozen snapshots; older rolling-history losses cannot be recovered','Single short observation period, correlated symbols/events, no untouched out-of-sample validation','Minute OHLC simulation, no order-book fills/size constraints; costs are assumptions','Late entry avoids pre-alert movement; MARK snapshot is not an executable fill','No runtime changes, orders, restarts or Discord messages']},groups,phases,chronological,uncertainty,perSymbol,errors,requests,records};
await save(path.join(DIR,'results.json'),result);
const csv=['symbol,side,kind,signal_at,delivered_at,entry_at,entry,net_5m_pct,net_15m_pct,net_30m_pct,net_60m_pct,mfe_15m_pct,mae_15m_pct,atr1_net_pct,atr1_outcome,excluded'];for(const r of records)csv.push([r.symbol,r.side,r.kind,new Date(r.signalAt).toISOString(),new Date(r.deliveredAt).toISOString(),new Date(r.entryAt).toISOString(),r.entry,...HORIZONS.map(h=>r.horizons[h]?.netPct),r.horizons[15]?.mfePct,r.horizons[15]?.maePct,r.brackets.ATR1_TP1_SL1?.netPct,r.brackets.ATR1_TP1_SL1?.outcome,r.excluded].map(x=>JSON.stringify(x??'')).join(','));await fs.writeFile(path.join(DIR,'trades.csv'),csv.join('\n')+'\n');
console.log(JSON.stringify({done:true,dir:DIR,groups,phases,uncertainty,errors},null,2));
