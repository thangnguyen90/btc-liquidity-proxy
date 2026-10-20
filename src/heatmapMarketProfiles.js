import {heatmapRangePlan,normalizeBinanceHeatmapCandles,buildBinanceHeatmapProfiles} from './binanceHeatmapModel.js';
export const HEATMAP_MARKET_PROFILES_VERSION='HEATMAP_MARKET_COMPACT_PROFILES_V1_20261018';
// One shared-client, low-priority bundle per second, not 525 full chart renders.
export class HeatmapMarketProfiles{
 constructor({loadKlines,loadMarkKlines,loadOi,manualCache,blocked=()=>false,now=Date.now}={}){
  Object.assign(this,{loadKlines,loadMarkKlines,loadOi,manualCache,blocked,now});this.cache=new Map();this.busy=false;this.nextAt=0;
 }
 async compare({symbol,range='24h'}){
  if(range!=='24h')throw Error('MARKET_REQUIRES_24H');
  const at=this.now(),key=symbol+':24h',cached=this.manualCache?.get(key)??this.cache.get(key);
  if(cached&&at-cached.at<120000)return cached.value;
  if(this.blocked()||this.busy||at<this.nextAt)throw Error('MARKET_BUDGET_OR_CONGESTION');
  this.busy=true;this.nextAt=at+1000;
  try{
   const plan=heatmapRangePlan('24h',at),params={symbol,interval:plan.interval,startTime:plan.from,endTime:plan.end-1,limit:499};
   const r=await Promise.allSettled([this.loadKlines(params),this.loadMarkKlines(params),this.loadOi({symbol,period:'5m',startTime:plan.from,endTime:plan.end-1,limit:500})]);
   if(r.some(x=>x.status!=='fulfilled'))throw Error('MARKET_DATA_UNAVAILABLE');
   const candles=normalizeBinanceHeatmapCandles(r[0].value,plan),markRows=normalizeBinanceHeatmapCandles(r[1].value,plan),oiRows=r[2].value;
   const models=[1,3].map(model=>{try{return {model,status:'OK',data:buildBinanceHeatmapProfiles({query:{symbol,range},plan,candles,markRows,oiRows,model})};}
    catch(e){return {model,status:e.message,data:null};}});
   const value={symbol,range,models,version:HEATMAP_MARKET_PROFILES_VERSION};
   this.cache.set(key,{at:this.now(),value});while(this.cache.size>700)this.cache.delete(this.cache.keys().next().value);return value;
  }finally{this.busy=false;}
 }
}
