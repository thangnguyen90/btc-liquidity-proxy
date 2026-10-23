import {heatmapRangePlan,normalizeBinanceHeatmapCandles,buildBinanceHeatmapProfiles} from './binanceHeatmapModel.js';
import {HeatmapRawCache,HEATMAP_RAW_CACHE_VERSION,HEATMAP_FULL_REFRESH_MS,mergeHeatmapRawRows,validHeatmapRawCache} from './heatmapRawCache.js';
export const HEATMAP_MARKET_PROFILES_VERSION='HEATMAP_MARKET_INCREMENTAL_INPUTS_BOUNDED3_V2_20261020';
export const HEATMAP_MARKET_REQUEST_PRIORITY=6;
// Bounded bundles use the SAME shared REST gate; orders/protection remain ahead.
export class HeatmapMarketProfiles{
 constructor({loadKlines,loadMarkKlines,loadOi,manualCache,cacheDirectory,maxInFlight=3,blocked=()=>false,now=Date.now}={}){
  Object.assign(this,{loadKlines,loadMarkKlines,loadOi,manualCache,blocked,now});this.cache=new Map();this.rawCache=new HeatmapRawCache(cacheDirectory);
  this.maxInFlight=Math.min(3,Math.max(1,maxInFlight));this.pending=new Map();this.busy=false;this.nextAt=0;
  this.forceFull=new Set();
  this.metrics={fullLoads:0,incrementalLoads:0,cacheRestores:0,restRequests:0,failures:0,lastLoadMs:null,lastBuildMs:null};
 }
 build(symbol,plan,raw){
  const at=this.now(),candles=normalizeBinanceHeatmapCandles(raw.price,plan),markRows=normalizeBinanceHeatmapCandles(raw.mark,plan);
  const models=[1,3].map(model=>{try{return {model,status:'OK',data:buildBinanceHeatmapProfiles({query:{symbol,range:'24h'},plan,candles,markRows,oiRows:raw.oi,model})};}
   catch(e){return {model,status:e.message,data:null};}});
  this.metrics.lastBuildMs=this.now()-at;return {symbol,range:'24h',models,version:HEATMAP_MARKET_PROFILES_VERSION};
 }
 async cachedBundle({symbol,range='24h'}){
  if(range!=='24h')return null;const at=this.now(),plan=heatmapRangePlan('24h',at),key=symbol+':24h';
  const cached=this.manualCache?.get(key)??this.cache.get(key);
  if(!this.forceFull.has(symbol)&&cached&&at-cached.at<120000&&[1,3].every(n=>cached.value?.models?.some(m=>m.model===n&&m.status==='OK'&&m.data?.end===plan.end
   &&m.data.profiles?.slice(-3).length===3&&m.data.profiles.slice(-3).every(p=>p.mark&&p.oiFresh))))return cached.value;
  const c=await this.rawCache.get(symbol);if(this.forceFull.has(symbol)||!c||c.end!==plan.end||c.from>plan.from||at<c.savedAt||at-c.fullLoadedAt>=HEATMAP_FULL_REFRESH_MS)return null;
  try{const value=this.build(symbol,plan,c);if(!value.models.every(m=>m.status==='OK'))return null;
   this.cache.set(key,{at,value});this.metrics.cacheRestores++;return value;
  }catch{return null;}
 }
 async compare({symbol,range='24h'}){
  if(range!=='24h')throw Error('MARKET_REQUIRES_24H');
  const key=symbol+':24h';if(this.pending.has(key))return this.pending.get(key);
  const cached=await this.cachedBundle({symbol,range});if(cached)return cached;
  if(this.pending.has(key))return this.pending.get(key);
  const at=this.now();if(this.blocked()||this.pending.size>=this.maxInFlight||at<this.nextAt)throw Error('MARKET_BUDGET_OR_CONGESTION');
  this.busy=true;this.nextAt=at+1000;
  const p=this.load(symbol,key,at);this.pending.set(key,p);try{return await p;}finally{this.pending.delete(key);this.busy=this.pending.size>0;}
 }
 async load(symbol,key,at){
  try{
   const plan=heatmapRangePlan('24h',at),previous=await this.rawCache.get(symbol);
   const incremental=!this.forceFull.has(symbol)&&!!previous&&previous.from<=plan.from&&previous.end>plan.from+3*plan.step&&previous.end<=plan.end&&at>=previous.savedAt&&at-previous.fullLoadedAt<HEATMAP_FULL_REFRESH_MS;
   const from=incremental?Math.max(plan.from,previous.end-3*plan.step):plan.from,limit=incremental?Math.min(499,Math.ceil((plan.end-from)/plan.step)+1):499;
   const params={symbol,interval:plan.interval,startTime:from,endTime:plan.end-1,limit};this.metrics.restRequests+=3;
   const r=await Promise.allSettled([this.loadKlines(params),this.loadMarkKlines(params),this.loadOi({symbol,period:'5m',startTime:from,endTime:plan.end-1,limit:incremental?Math.min(500,limit+1):500})]);
   if(r.some(x=>x.status!=='fulfilled'))throw Error('MARKET_DATA_UNAVAILABLE');
   const prior=incremental?previous:{price:[],mark:[],oi:[]};
   const raw={version:HEATMAP_RAW_CACHE_VERSION,symbol,step:plan.step,from:plan.from,end:plan.end,savedAt:this.now(),fullLoadedAt:incremental?previous.fullLoadedAt:this.now(),
    price:mergeHeatmapRawRows(prior.price,r[0].value,x=>x[0],plan.from,plan.end),mark:mergeHeatmapRawRows(prior.mark,r[1].value,x=>x[0],plan.from,plan.end),
    oi:mergeHeatmapRawRows(prior.oi,r[2].value,x=>x.timestamp,plan.from,plan.end)};
   let value;try{value=this.build(symbol,plan,raw);}catch(e){if(incremental)this.forceFull.add(symbol);throw e;}
   if(value.models.every(m=>m.status==='OK'&&m.data.profiles.slice(-3).every(p=>p.mark&&p.oiFresh))&&validHeatmapRawCache(raw,symbol)){await this.rawCache.put(raw);this.forceFull.delete(symbol);}
   else if(incremental)this.forceFull.add(symbol);
   this.metrics[incremental?'incrementalLoads':'fullLoads']++;this.metrics.lastLoadMs=this.now()-at;
   this.cache.set(key,{at:this.now(),value});while(this.cache.size>700)this.cache.delete(this.cache.keys().next().value);return value;
  }catch(e){this.metrics.failures++;throw e;}
 }
 snapshot(){return {version:HEATMAP_MARKET_PROFILES_VERSION,maxInFlight:this.maxInFlight,inFlight:this.pending.size,requestPriority:HEATMAP_MARKET_REQUEST_PRIORITY,
  ...this.metrics,rawCache:this.rawCache.snapshot()};}
}
