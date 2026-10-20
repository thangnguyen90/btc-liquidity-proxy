import{readFileSync}from'node:fs';
import assert from'node:assert/strict';
// Frozen input only; public historical requests, no runtime/config/order writes.
const input=JSON.parse(readFileSync(new URL('../data/research/rising-volume-ratio-phase-replay-20261011.json',import.meta.url),'utf8'));
const FIVE=300000,MINUTE=60000;
const grid=[];
for(const flatPct of [3,5,8])for(const shiftPct of [5,10,15])for(const transitionMinutes of [15,30,45])
 grid.push({flatMinutes:30,flatPct,shiftPct,transitionMinutes});
const primary=grid.findIndex(g=>g.flatPct===5&&g.shiftPct===10&&g.transitionMinutes===30);
const median=a=>{const s=[...a].sort((a,b)=>a-b);return(s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2;};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let requests=0,maxWeight=0,nextAllowed=0,fatal=null;
const errors=[],curves=new Map(),outcomes=new Map();
async function get(path,params){
 for(let attempt=0;attempt<3;attempt++){
  if(nextAllowed>Date.now())await pause(nextAllowed-Date.now());
  const u=new URL('https://fapi.binance.com'+path);u.search=new URLSearchParams(params);
  let response;
  try{requests++;response=await fetch(u,{signal:AbortSignal.timeout(20000)});}
  catch(e){if(attempt===2)throw e;await pause(300);continue;}
  const weight=Number(response.headers.get('x-mbx-used-weight-1m')??0);
  maxWeight=Math.max(maxWeight,weight);
  if(weight>=950){nextAllowed=Math.floor(Date.now()/60000)*60000+61000;console.error('Reserve pause at weight '+weight);}
  if(response.status===429||response.status===418){fatal='RATE_LIMIT_STOP '+response.status;throw Error(fatal);}
  if(!response.ok)throw Error('HTTP '+response.status+' '+path);
  const data=await response.json();if(!Array.isArray(data))throw Error('Non-array data');
  return data;
 }
}
function classify(curve,side,asOf,g){
 const rows=curve.filter(r=>r.t<=asOf),last=rows.at(-1);
 if(!last||asOf-last.t>=FIVE)return{reason:'STALE_OR_MISSING'};
 const minHistory=Math.ceil(g.flatMinutes/5)+1;
 for(let steps=1;steps<=g.transitionMinutes/5;steps++){
  const end=rows.length-1-steps,start=end-minHistory+1;
  if(start<0)continue;
  const segment=rows.slice(start);
  if(segment.some((r,i)=>!Number.isFinite(r.v)||r.v<=0||(i&&r.t-segment[i-1].t!==FIVE)))continue;
  const base=rows.slice(start,end+1),center=median(base.map(r=>r.v));
  const low=Math.min(...base.map(r=>r.v)),high=Math.max(...base.map(r=>r.v));
  const width=(high-low)/center*100,delta=(last.v/center-1)*100;
  if(width>g.flatPct)continue;
  const passed=side==='LONG'?delta<=-g.shiftPct&&last.v<low:delta>=g.shiftPct&&last.v>high;
  if(passed)return{reason:'PASS',start:base[0].t,end:base.at(-1).t,last:last.t,center,width,delta,steps};
 }
 return{reason:'NO_FLAT_THEN_BREAK'};
}
const curve=(values,start=0)=>values.map((v,i)=>({t:start+i*FIVE,v}));
const testAsOf=9*FIVE;
assert.equal(classify(curve([2,2,2,2,2,2,2,1.99,1.95,1.79]),'LONG',testAsOf,{flatMinutes:30,flatPct:5,shiftPct:10,transitionMinutes:30}).reason,'PASS');
assert.equal(classify(curve([2,2,2,2,2,2,2,2.03,2.10,2.23]),'SHORT',testAsOf,grid[primary]).reason,'PASS');
assert.notEqual(classify(curve([2,2,2,2,2,2,2,1.99,1.95,1.79]),'SHORT',testAsOf,grid[primary]).reason,'PASS');
assert.notEqual(classify(curve([2.8,2.7,2.6,2.5,2.4,2.3,2.2,2.1,2,1.79]),'LONG',testAsOf,grid[primary]).reason,'PASS');
assert.notEqual(classify(curve([2,2,2,2,2,2,2,1.99,1.95,1.79]),'LONG',8*FIVE,grid[primary]).reason,'PASS');
assert.equal(classify(curve([2,2,2,2,2,2,2,1.99,1.95,1.79]),'LONG',10*FIVE,grid[primary]).reason,'STALE_OR_MISSING');
const grouped=new Map();
for(const e of input.events){const list=grouped.get(e.symbol)??[];list.push(e);grouped.set(e.symbol,list);}
let done=0;
for(const[symbol,events]of grouped){
 if(fatal)break;
 try{
  const start=Math.floor((Math.min(...events.map(e=>e.closedAt))-90*MINUTE)/FIVE)*FIVE;
  const end=Math.floor(Math.max(...events.map(e=>e.closedAt))/FIVE)*FIVE;
  const rows=[];
  for(let t=start;t<=end;t+=500*FIVE){
   const data=await get('/futures/data/topLongShortAccountRatio',{symbol,period:'5m',limit:'500',startTime:String(t),endTime:String(Math.min(t+499*FIVE,end))});
   rows.push(...data);await pause(375);
  }
  const normalized=rows.map(r=>({t:Number(r.timestamp),v:Number(r.longShortRatio),l:Number(r.longAccount),s:Number(r.shortAccount)}))
   .sort((a,b)=>a.t-b.t);
  if(normalized.some((r,i)=>!Number.isFinite(r.t)||r.t%FIVE!==0||!Number.isFinite(r.v)||r.v<=0||r.l<0||r.s<=0||Math.abs(r.l+r.s-1)>.002||(i&&r.t<=normalized[i-1].t)))throw Error('Invalid ratio records');
  curves.set(symbol,normalized);
 }catch(e){errors.push({symbol,type:'ratio',error:e.message});}
 done++;if(done%25===0)console.error('Ratio symbols '+done+'/'+grouped.size+', requests '+requests);
}
const phaseRows=input.events.map(e=>{
 const curve=curves.get(e.symbol)??[];
 const modes=[0,5].map(lag=>{
  const asOf=e.closedAt-lag*MINUTE;
  const flags=grid.map(g=>classify(curve,e.side,asOf,g).reason==='PASS');
  const mask=flags.reduce((m,p,i)=>p?m+2**i:m,0);
  const main=classify(curve,e.side,asOf,grid[primary]);
  const last=curve.filter(r=>r.t<=asOf).at(-1);
  return{lag,mask,primary:main,lastRatio:last?.v??null,lastTimestamp:last?.t??null};
 });
 return{id:e.id,symbol:e.symbol,side:e.side,closedAt:e.closedAt,modes};
});
console.error('Ratio stage complete. Main passes lag0='+phaseRows.filter(r=>r.modes[0].primary.reason==='PASS').length+' lag5='+phaseRows.filter(r=>r.modes[1].primary.reason==='PASS').length);
function convert(data){return data.map(r=>({t:Number(r[0]),o:Number(r[1]),h:Number(r[2]),l:Number(r[3]),c:Number(r[4]),end:Number(r[6])}));}
function complete(rows,start,end){
 const n=Math.max(0,Math.floor((end-start+1)/MINUTE));
 return rows.length===n&&rows.every((r,i)=>r.t===start+i*MINUTE&&r.end===r.t+MINUTE-1&&[r.o,r.h,r.l,r.c].every(x=>Number.isFinite(x)&&x>0)&&r.h>=Math.max(r.o,r.c)&&r.l<=Math.min(r.o,r.c));
}
function simulate(e,contract,mark,minutes){
 const start=Math.floor(e.observedAt/MINUTE)*MINUTE+MINUTE,end=start+minutes*MINUTE-1;
 if(end>input.cutoff)return{status:'CENSORED',mature:false};
 const c=contract.filter(r=>r.t>=start&&r.end<=end),m=mark.filter(r=>r.t>=start&&r.end<=end);
 if(!complete(c,start,end)||!complete(m,start,end))return{status:'GAP',mature:true};
 const entry=c[0].o,dir=e.side==='LONG'?1:-1,tp=entry*(1+dir*.02),sl=entry*(1-dir*.06);
 let status='TIMEOUT',exit=c.at(-1).c,hold=minutes;
 for(let i=0;i<c.length;i++){
  const profit=dir===1?c[i].h>=tp:c[i].l<=tp,loss=dir===1?m[i].l<=sl:m[i].h>=sl;
  if(profit&&loss){status='BOTH_BARRIERS';break;}
  if(profit||loss){status=profit?'TP':'SL';exit=profit?tp:sl*(c[i].c/m[i].c);hold=i+1;break;}
 }
 if(status==='BOTH_BARRIERS')return{status,mature:true,entry};
 const ratio=exit/entry,fee=.0005,roe=(dir*(ratio-1)-fee-fee*ratio)*500;
 const idealRatio=status==='TP'?tp/entry:status==='SL'?sl/entry:ratio;
 const idealRoe=(dir*(idealRatio-1)-fee-fee*idealRatio)*500;
 return{status,mature:true,entry,exit,roe,idealRoe,net:roe*(dir===1?2:1)/100,hold};
}
let candleDone=0,next=0;
const symbols=[...grouped.keys()];
async function candleWorker(){
 while(next<symbols.length&&!fatal){
  const symbol=symbols[next++],events=grouped.get(symbol);
  try{
   const ranges=events.map(e=>{const start=Math.floor(e.observedAt/MINUTE)*MINUTE+MINUTE;return{start,end:Math.min(start+360*MINUTE-1,Math.floor((input.cutoff+1)/MINUTE)*MINUTE-1)};}).filter(r=>r.end>=r.start).sort((a,b)=>a.start-b.start);
   const merged=[];
   for(const r of ranges){const previous=merged.at(-1);if(previous&&r.start<=previous.end+MINUTE)previous.end=Math.max(previous.end,r.end);else merged.push({...r});}
   const contracts=[],marks=[];
   for(const range of merged)for(let start=range.start;start<=range.end;start+=499*MINUTE){
    const end=Math.min(start+499*MINUTE-1,range.end);
    contracts.push(...convert(await get('/fapi/v1/klines',{symbol,interval:'1m',limit:'499',startTime:String(start),endTime:String(end)})));
    await pause(100);
    marks.push(...convert(await get('/fapi/v1/markPriceKlines',{symbol,interval:'1m',limit:'499',startTime:String(start),endTime:String(end)})));
    await pause(100);
   }
   contracts.sort((a,b)=>a.t-b.t);marks.sort((a,b)=>a.t-b.t);
   for(const e of events)outcomes.set(e.id,[60,360].map(h=>simulate(e,contracts,marks,h)));
  }catch(err){errors.push({symbol,type:'price',error:err.message});}
  candleDone++;if(candleDone%25===0)console.error('Price symbols '+candleDone+'/'+symbols.length+', requests '+requests+', max weight '+maxWeight);
 }
}
await Promise.all([candleWorker(),candleWorker()]);
const round=v=>Number.isFinite(v)?Number(v.toFixed(8)):v??null;
const statusCode={TIMEOUT:0,TP:1,SL:-1,CENSORED:2,GAP:3,BOTH_BARRIERS:4};
const phaseCols=['id','maskLag0','maskLag5','primaryLag0','primaryLag5'];
const compactPhase=p=>[p.reason,p.start??null,p.end??null,p.last??null,round(p.center),round(p.width),round(p.delta),p.steps??null];
const outcomeCols=['id','1h','6h'];
const compactOutcome=s=>[statusCode[s.status],s.mature===true,round(s.entry),round(s.exit),round(s.roe),round(s.idealRoe),round(s.net),s.hold??null];
const result={version:'RISING_VOLUME_TOP_ACCOUNT_FLAT_BREAK_RESEARCH_V1_20261011_OBSERVE_ONLY',cutoff:input.cutoff,count:input.events.length,grid,primary,requests,maxWeight,errors,fatal,selfTests:6,ratioSymbols:curves.size,phaseCols,phaseData:phaseRows.map(r=>[r.id,r.modes[0].mask,r.modes[1].mask,compactPhase(r.modes[0].primary),compactPhase(r.modes[1].primary)]),outcomeCols,outcomeData:[...outcomes].map(([id,sims])=>[id,...sims.map(compactOutcome)]),CKBCurve:curves.get('CKBUSDT')??[]};
console.log(JSON.stringify(result));
