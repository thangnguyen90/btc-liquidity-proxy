import {HEATMAP_TOP_RATIO_VERSION,topRatioQuery,normalizeTopRatioRows,topRatioGapCount,RATIO_RANGES} from '../public/heatmap-top-ratio-model.js';
export {HEATMAP_TOP_RATIO_VERSION};
export class HeatmapTopTraderRatio{
 constructor({loadRows,now=Date.now,ttlMs=60000,maxConcurrent=2,maxReads=12,maxCache=32}={}){
  Object.assign(this,{loadRows,now,ttlMs,maxConcurrent,maxReads,maxCache});this.cache=new Map();this.inflight=new Map();this.reads=[];
 }
 async get(input){
  const q=topRatioQuery(input),key=`${q.symbol}:${q.range}:${q.resolvedPeriod}`,now=this.now(),prior=this.cache.get(key);
  const base={version:HEATMAP_TOP_RATIO_VERSION,source:'BINANCE_TOP_TRADER_ACCOUNT_RATIO',observeOnly:true,affectsOrders:false,symbol:q.symbol,range:q.range,period:q.resolvedPeriod,step:q.step,limit:q.limit,truncated:q.truncated};
  const result=(data,cached=false)=>{const at=this.now(),latest=data.rows.at(-1);return {...base,...data,cached,status:!latest?'EMPTY':at-latest.timestamp>q.step*2?'STALE':'OK'};};
  if(prior&&now>=prior.fetchedAt&&now-prior.fetchedAt<this.ttlMs)return structuredClone(result(prior,true));
  if(this.inflight.has(key))return structuredClone(await this.inflight.get(key));
  this.reads=this.reads.filter(t=>now-t<60000);
  const unavailable=(reason,retryAfterMs=60000)=>({...base,status:'UNAVAILABLE',reason,retryAfterMs,rows:[],fetchedAt:null,from:now-RATIO_RANGES[q.range],to:now});
  const failure=this.failures?.get(key);if(failure?.until>now)return structuredClone({...failure.value,cached:true,retryAfterMs:failure.until-now});
  if(this.inflight.size>=this.maxConcurrent||this.reads.length>=this.maxReads)return unavailable('RATIO_BUSY');
  this.reads.push(now);
  const pending=(async()=>{
   try{
    const raw=await this.loadRows({symbol:q.symbol,period:q.resolvedPeriod,limit:q.limit}),at=this.now(),from=at-RATIO_RANGES[q.range];
    const rows=normalizeTopRatioRows(raw,{symbol:q.symbol,step:q.step,now:at,from}),data={rows,fetchedAt:at,from,to:at,gaps:topRatioGapCount(rows,q.step)};
    this.failures?.delete(key);this.cache.delete(key);this.cache.set(key,data);while(this.cache.size>this.maxCache)this.cache.delete(this.cache.keys().next().value);
    return result(data);
   }catch(error){
    const reason=error.message==='INVALID_RATIO_DATA'?'INVALID_RATIO_DATA':[418,429].includes(error.status)?'RATIO_RATE_LIMIT':'RATIO_UNAVAILABLE';
    const retryAfterMs=Math.max(60000,Math.min(3600000,Number(error.retryAfterMs)||60000));
    // Cache the failure too: reload/multi-tab activity must not hammer an upstream ban.
    const failure=unavailable(reason,retryAfterMs);this.failures??=new Map();this.failures.set(key,{until:this.now()+retryAfterMs,value:failure});
    while(this.failures.size>this.maxCache)this.failures.delete(this.failures.keys().next().value);return failure;
   }
  })().finally(()=>this.inflight.delete(key));
  this.inflight.set(key,pending);return structuredClone(await pending);
 }
}
