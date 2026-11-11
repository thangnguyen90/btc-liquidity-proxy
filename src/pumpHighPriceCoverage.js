import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {mergeEarlyPumpBars} from './earlyPumpWatch.js';
import {priceFeatures} from './pumpHighWhaleShortModel.js';
export const PUMP_HIGH_PRICE_COVERAGE_VERSION='PUMP_HIGH_PRICE_COVERAGE_V1_20261104';
export const PUMP_HIGH_PRICE_POLICY=Object.freeze({intervalMs:5000,maxBatch:5,maxPerMinute:60,retryMs:120000,limit:300,closedBars:288,maxAgeMs:450000,priority:5});
const symbolOk=s=>typeof s==='string'&&/^[\p{L}\p{N}]{1,32}USDT$/u.test(s);
const symbolsOf=xs=>[...new Set((Array.isArray(xs)?xs:[]).filter(symbolOk))];
const rawRows=bars=>bars.map(b=>[b.t,b.o,b.h,b.l,b.c,0,b.end-1,b.q,0,0,b.buy]);
export function pumpHighPriceReadiness(rows,now){
 const price=priceFeatures(rows).at(-1);
 if(!price)return {status:rows.length<288?'INSUFFICIENT':'GAP_OR_INVALID',bars:rows.length,price:null};
 if(price.at>now||now-price.at>PUMP_HIGH_PRICE_POLICY.maxAgeMs)return {status:'STALE',bars:rows.length,price};
 return {status:'READY',bars:rows.length,price};
}
export class PumpHighPriceCoverage{
 constructor({directory,getSymbols=()=>[],getRows=()=>[],loadBaseRows=async()=>[],repair,subscribe=()=>{},streamCoverage=()=>null,blocked=()=>false,now=Date.now}={}){
  Object.assign(this,{directory,getSymbols,getRows,loadBaseRows,repair,subscribe,streamCoverage,blocked,now});
  this.rows=new Map();this.persistedEnds=new Map();this.loaded=new Set();this.states=new Map();this.attempts=new Map();this.requestTimes=[];this.busy=false;this.collecting=null;this.pendingReads=new Map();this.universe=[];this.signature=null;this.lastCollectAt=null;this.lastCompletedAt=null;this.attempted=0;this.refreshed=0;this.failed=0;this.persistFailures=0;this.deferredReason=null;this.error=null;this.lastBatch=[];
 }
 async loadOwn(symbol){
  if(this.loaded.has(symbol))return;
  if(this.directory)try{const value=JSON.parse(await readFile(join(this.directory,symbol+'.json'),'utf8'));if(value.version!==PUMP_HIGH_PRICE_COVERAGE_VERSION||value.symbol!==symbol||!Array.isArray(value.rows)||value.rows.length>500)throw Error('BAD_PRICE_CACHE');this.rows.set(symbol,value.rows);this.persistedEnds.set(symbol,Number(value.rows.at(-1)?.[6]));}catch(e){if(e.code!=='ENOENT')this.persistFailures++;}
  this.loaded.add(symbol);
 }
 async read(symbol){
  if(this.pendingReads.has(symbol))return this.pendingReads.get(symbol);
  const job=(async()=>{
   await this.loadOwn(symbol);let base=[];try{base=await this.loadBaseRows(symbol)??[];}catch{}
   const before=this.rows.get(symbol)??[],merged=rawRows(mergeEarlyPumpBars([...before,...base],this.getRows(symbol),this.now())).slice(-300),result=pumpHighPriceReadiness(merged,this.now());
   this.rows.set(symbol,merged);this.states.set(symbol,{symbol,...result,updatedAt:this.now()});
   // Save price alone; OI/model availability must not decide whether closed prices survive a restart.
   if(result.status==='READY'&&this.directory&&(before.length!==merged.length||this.persistedEnds.get(symbol)!==Number(merged.at(-1)?.[6]))){
    try{await mkdir(this.directory,{recursive:true});const file=join(this.directory,symbol+'.json'),tmp=file+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify({version:PUMP_HIGH_PRICE_COVERAGE_VERSION,symbol,savedAt:this.now(),rows:merged}));await rename(tmp,file);this.persistedEnds.set(symbol,Number(merged.at(-1)?.[6]));}catch{this.persistFailures++;}
   }
   return {symbol,rows:merged,...result};
  })();this.pendingReads.set(symbol,job);try{return await job;}finally{this.pendingReads.delete(symbol);}
 }
 async collect(values){
  if(this.collecting)return this.collecting;
  const job=(async()=>{
   this.universe=symbolsOf(values??await this.getSymbols());const sig=this.universe.slice().sort().join(',');
   if(sig!==this.signature){await this.subscribe(this.universe);this.signature=sig;}
   const allowed=new Set(this.universe);for(const symbol of this.states.keys())if(!allowed.has(symbol)){this.states.delete(symbol);this.rows.delete(symbol);this.persistedEnds.delete(symbol);this.loaded.delete(symbol);this.attempts.delete(symbol);}
   for(const symbol of this.universe)await this.read(symbol);
   this.lastCollectAt=this.now();this.error=null;return this.current();
  })();this.collecting=job;try{return await job;}catch{this.error='PRICE_COLLECTION_FAILED';return this.current();}finally{if(this.collecting===job)this.collecting=null;}
 }
 current(){return {rows:this.universe.map(symbol=>({symbol,rows:this.rows.get(symbol)??[],...this.states.get(symbol)})),coverage:this.snapshot()};}
 async tick(){
  if(this.busy||!this.repair)return;this.busy=true;this.lastBatch=[];
  try{
   if(this.lastCollectAt===null||this.now()-this.lastCollectAt>=60000)await this.collect();
   if(!this.universe.length){this.deferredReason='WAIT_UNIVERSE';return;}
   if(this.blocked()){this.deferredReason='REST_BLOCKED_OR_CONGESTED';return;}
   const policy=PUMP_HIGH_PRICE_POLICY,at=this.now();this.requestTimes=this.requestTimes.filter(t=>at-t<60000);this.deferredReason=null;
   const pending=this.universe.filter(s=>this.states.get(s)?.status!=='READY'&&(!this.attempts.has(s)||at-this.attempts.get(s)>=policy.retryMs))
    .sort((a,b)=>(this.attempts.get(a)??0)-(this.attempts.get(b)??0));
   for(const symbol of pending){
    if(this.lastBatch.length>=policy.maxBatch||this.requestTimes.length>=policy.maxPerMinute)break;
    if(this.blocked()){this.deferredReason='REST_BLOCKED_OR_CONGESTED';break;}
    if((await this.read(symbol)).status==='READY')continue; // Another shared consumer/socket may already have repaired it.
    this.attempts.set(symbol,this.now());this.requestTimes.push(this.now());this.attempted++;this.lastBatch.push(symbol);
    try{const requestedAt=this.now(),repaired=await this.repair(symbol,policy.limit,{force:true,subscribe:false,batchSize:1,batchDelayMs:0,maxAgeMs:policy.maxAgeMs,requestPriority:policy.priority,requestSource:'PumpHighPriceCoverage.repair'});
     if(Array.isArray(repaired)){
      // A candle forming when REST started is not a proven final just because the response arrived late.
      const closed=repaired.filter(r=>Number(r.closeTime)<requestedAt&&r.isClosed!==false);
      this.rows.set(symbol,rawRows(mergeEarlyPumpBars(this.rows.get(symbol)??[],closed,this.now())).slice(-300));
     }
     const after=await this.read(symbol);
     if(after.status==='READY'){
      this.refreshed++;
      if(Array.isArray(repaired)&&this.directory)try{await mkdir(this.directory,{recursive:true});const file=join(this.directory,symbol+'.json'),tmp=file+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify({version:PUMP_HIGH_PRICE_COVERAGE_VERSION,symbol,savedAt:this.now(),rows:after.rows}));await rename(tmp,file);this.persistedEnds.set(symbol,Number(after.rows.at(-1)?.[6]));}catch{this.persistFailures++;}
     }else this.failed++;
    }catch{this.failed++;}
   }
   this.lastCompletedAt=this.now();
  }catch{this.error='PRICE_REPAIR_FAILED';}finally{this.busy=false;}
 }
 start(){if(this.timer)return;void this.tick();this.timer=setInterval(()=>void this.tick(),PUMP_HIGH_PRICE_POLICY.intervalMs);this.timer.unref?.();}
 stop(){clearInterval(this.timer);this.timer=null;}
 snapshot(){
  const counts={READY:0,STALE:0,INSUFFICIENT:0,GAP_OR_INVALID:0};for(const symbol of this.universe){const row=this.states.get(symbol);counts[row?.status??'INSUFFICIENT']++;}
  return {version:PUMP_HIGH_PRICE_COVERAGE_VERSION,policy:PUMP_HIGH_PRICE_POLICY,total:this.universe.length,ready:counts.READY,pending:this.universe.length-counts.READY,counts,updatedAt:this.lastCollectAt,lastRepairAt:this.lastCompletedAt,repairBusy:this.busy,attempted:this.attempted,refreshed:this.refreshed,failed:this.failed,lastBatch:this.lastBatch.slice(),deferredReason:this.deferredReason,persistFailures:this.persistFailures,stream:this.streamCoverage(this.universe),error:this.error};
 }
}
