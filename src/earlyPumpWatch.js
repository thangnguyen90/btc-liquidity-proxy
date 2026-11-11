import {readdir, readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import {join, dirname} from 'node:path';
export const EARLY_PUMP_VERSION = 'EARLY_PUMP_CATALOG_V1_20261101';
export const EARLY_PUMP_RULE = Object.freeze({minVolumeX:3, minQuoteVolume:500000, cooldownMs:3600000, followBars:3, followVolumeX:1.5});
const M5=300000, DAY=86400000;
const median=a=>{a.sort((a,b)=>a-b);return (a[9]+a[10])/2;};
export function earlyPumpBars(raw,now){
 return (raw??[]).filter(Array.isArray).map(x=>({t:+x[0],end:+x[6]+1,o:+x[1],h:+x[2],l:+x[3],c:+x[4],q:+x[7],buy:+x[10]}))
 .filter(b=>Object.values(b).every(Number.isFinite)&&b.end===b.t+M5&&b.t%M5===0&&b.end<=now&&Math.min(b.o,b.c,b.l)>0&&b.h>=Math.max(b.o,b.c,b.l)&&b.l<=Math.min(b.o,b.c)&&b.q>=0&&b.buy>=0&&b.buy<=b.q).sort((a,b)=>a.t-b.t);
}
export function mergeEarlyPumpBars(raw,stream,now){
 const closed=(stream??[]).filter(b=>b.isClosed!==false).map(b=>[b.openTime,b.open,b.high,b.low,b.close,b.volume,b.closeTime,b.quoteVolume,b.trades,b.takerBuyBaseVolume,b.takerBuyQuoteVolume]);
 return [...new Map([...earlyPumpBars(raw,now),...earlyPumpBars(closed,now)].map(b=>[b.t,b])).values()].sort((a,b)=>a.t-b.t);
}
export function findEarlyPumps(bars,now){
 const events=[];let last=-Infinity;
 for(let i=20;i<bars.length;i++){
  const b=bars[i],prior=bars.slice(i-20,i);
  if(b.end<now-DAY||b.end>now||b.end-last<EARLY_PUMP_RULE.cooldownMs||[...prior,b].some((x,j,a)=>j&&x.t-a[j-1].t!==M5))continue;
  const baseline=median(prior.map(x=>x.q)),level=Math.max(...prior.slice(-12).map(x=>x.h));
  if(!(baseline>0&&b.q>=EARLY_PUMP_RULE.minQuoteVolume&&b.q/baseline>=EARLY_PUMP_RULE.minVolumeX&&b.c>b.o&&b.c>level))continue;
  events.push({id:`${b.end}`,at:b.end,price:b.c,level,volumeX:b.q/baseline,quoteVolume:b.q,buyPct:100*b.buy/b.q,baseline,return1hPct:(b.c/bars[i-12].c-1)*100});last=b.end;
 }
 return events;
}
export function earlyPumpLifecycle(event,bars,now){
 const i=bars.findIndex(b=>b.end===event.at);
 if(i<0)return {state:'UNKNOWN',stateAt:null,confirmedAt:null};
 const after=bars.slice(i+1).filter(b=>b.end<=now);let previous=bars[i],confirmedAt=null,steps=0,volumeSum=0;
 for(const b of after){
  if(b.t!==previous.t+M5)return {state:'UNKNOWN',stateAt:b.end,confirmedAt};
  if(b.c<event.level)return {state:'LOST',stateAt:b.end,confirmedAt};
  steps++;volumeSum+=b.q;
  if(steps<=EARLY_PUMP_RULE.followBars&&steps>=2){
   const follow=after.slice(0,steps),higherLows=follow.every((x,j)=>x.l>=(j?follow[j-1]:bars[i]).l);
   if(higherLows&&b.c>event.price&&volumeSum/steps/event.baseline>=EARLY_PUMP_RULE.followVolumeX)confirmedAt??=b.end;
  }
  previous=b;
 }
 return {state:confirmedAt?'HOLD':steps>=3?'UNCONFIRMED':'EARLY',stateAt:previous.end,confirmedAt};
}
export function earlyPumpRatioTrend(rows,now){
 const valid=(rows??[]).filter(r=>Number.isFinite(+r.timestamp)&&+r.timestamp<=now-900000&&Number.isFinite(+r.longShortRatio)&&+r.longShortRatio>0).sort((a,b)=>a.timestamp-b.timestamp);
 const latest=valid.at(-1);if(!latest||now-latest.timestamp>2700000)return null;
 const before=valid.find(r=>+r.timestamp===+latest.timestamp-3600000);
 return {at:+latest.timestamp,ratio:+latest.longShortRatio,shortPct:100/(1+(+latest.longShortRatio)),shortDelta1hPp:before?100/(1+(+latest.longShortRatio))-100/(1+(+before.longShortRatio)):null};
}
export class EarlyPumpWatch{
 constructor({directory,file,getUniverse=()=>[],getRows=()=>[],contextProvider,now=Date.now}){Object.assign(this,{directory,file,getUniverse,getRows,contextProvider,now});this.startedAt=now();this.records={};this.rows=[];this.updatedAt=0;this.coverage={};this.error=null;}
 async init(){try{const s=JSON.parse(await readFile(this.file,'utf8'));if(s.version!==EARLY_PUMP_VERSION||!s.records||Array.isArray(s.records))throw Error('Schema');this.records=s.records;}catch(e){if(e.code!=='ENOENT')throw e;}}
 async refresh(){if(this.pending)return this.pending;this.pending=this.scan();try{await this.pending;}finally{this.pending=null;}}
 async scan(){
  const now=this.now(),rows=[];let files=0,usable=0,invalid=0,stale=0;
  try{
   const universe=new Set(await this.getUniverse());
   if(!universe.size){this.error='Đang nạp danh sách Binance Futures; chưa đủ dữ liệu để quét';return;}
   for(const f of (await readdir(this.directory)).filter(f=>f.endsWith('.json'))){
    files++;try{
     const raw=JSON.parse(await readFile(join(this.directory,f),'utf8'));
     if(!/^[\p{L}\p{N}]{1,32}USDT$/u.test(raw.symbol)||!universe.has(raw.symbol))continue;
     const bars=mergeEarlyPumpBars(raw.price,this.getRows(raw.symbol),now);if(bars.length<21){invalid++;continue;}usable++;
     const events=findEarlyPumps(bars,now),latest=bars.at(-1),isStale=now-latest.end>600000;if(isStale)stale++;
     for(const e of events){const id=raw.symbol+':'+e.id;if(!this.records[id]&&!Object.values(this.records).some(old=>old.symbol===raw.symbol&&Math.abs(old.at-e.at)<EARLY_PUMP_RULE.cooldownMs))this.records[id]={...e,symbol:raw.symbol,observedAt:now,origin:e.at>this.startedAt&&now-e.at<=120000?'LIVE':'REPLAY'};}
     const saved=Object.values(this.records).filter(e=>e.symbol===raw.symbol&&e.at>=now-DAY).sort((a,b)=>a.at-b.at);
     if(!saved.length)continue;
     const last=saved.at(-1),life=earlyPumpLifecycle(last,bars,now);
     rows.push({symbol:raw.symbol,first:saved[0],last,count:saved.length,events:saved.map(e=>({...e,...earlyPumpLifecycle(e,bars,now)})),...life,price:latest.c,dataAt:latest.end,stale:isStale,changeSincePct:(latest.c/last.price-1)*100,candles:bars.slice(-72)});
    }catch{invalid++;}
   }
   this.records=Object.fromEntries(Object.entries(this.records).filter(([,e])=>e.at>=now-DAY));
   await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify({version:EARLY_PUMP_VERSION,records:this.records}));await rename(tmp,this.file);
   this.rows=rows.sort((a,b)=>b.last.at-a.last.at);this.coverage={files,usable,invalid,stale};this.updatedAt=now;this.error=null;
  }catch{this.error='Không cập nhật được danh sách bơm sớm';}
 }
 async snapshot(){
  if(this.now()-this.updatedAt>60000)await this.refresh();const now=this.now(),provider=this.contextProvider;
  const candidates=this.rows.filter(r=>!r.stale).sort((a,b)=>Number(['EARLY','HOLD'].includes(b.state))-Number(['EARLY','HOLD'].includes(a.state))||b.last.at-a.last.at);
  const next=candidates.find(r=>!provider.context.has(r.symbol)||now-provider.context.get(r.symbol).readAt>=900000);if(next)void provider.enrich(next.symbol);
  return {version:EARLY_PUMP_VERSION,rule:EARLY_PUMP_RULE,observeOnly:true,affectsOrders:false,updatedAt:this.updatedAt,generatedAt:now,error:this.error,coverage:this.coverage,rows:this.rows.map(r=>{
   const c=provider.context.get(r.symbol),context=c?{...c,stale:now-c.readAt>=900000}:null;
   const position=context&&!context.stale?context.position:null;
   return {...r,context,squeezeRisk:!r.stale&&['EARLY','HOLD'].includes(r.state)&&r.price>=r.last.level&&position?.shortDelta1hPp>0};
  })};
 }
 start(){this.timer=setInterval(()=>void this.refresh(),60000);this.timer.unref?.();void this.refresh();}
}
