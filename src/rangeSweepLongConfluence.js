export const RANGE_SWEEP_LONG_COLOR_VERSION='RANGE_SWEEP_LONG_POSITION_ZONE_PURPLE_V1_20261031';
const P=300000;
export function assessRangeSweepLongColor(event,rows){
 const base={version:RANGE_SWEEP_LONG_COLOR_VERSION,qualified:false,observeOnly:true,affectsOrders:false};
 if(event.side!=='LONG'||!event.flow||!Number.isFinite(event.zone?.overlapStrength)||event.zone.overlapStrength<50)return {...base,reason:'NOT_ELIGIBLE'};
 const cutoff=event.at-P;
 const valid=(rows??[]).filter(r=>Number.isFinite(Number(r.timestamp))&&Number(r.timestamp)<=cutoff&&Number(r.longShortRatio)>0&&Number.isFinite(Number(r.longShortRatio))).sort((a,b)=>Number(a.timestamp)-Number(b.timestamp));
 const last=valid.at(-1);if(!last||cutoff-Number(last.timestamp)>P)return {...base,reason:'POSITION_RATIO_MISSING_OR_STALE'};
 const t=Number(last.timestamp),points=[0,1,2,3].map(i=>valid.find(r=>Number(r.timestamp)===t-i*P));
 if(points.some(r=>!r))return {...base,reason:'POSITION_RATIO_GAP'};
 const ratio=Number(last.longShortRatio),previous=Number(points[3].longShortRatio),change15Pct=(ratio/previous-1)*100;
 return {...base,qualified:change15Pct>0,reason:change15Pct>0?'LONG_POSITION_UP_ZONE_50':'POSITION_NOT_RISING',symbol:event.symbol,ratioAt:t,baselineAt:t-3*P,ratio,previous,change15Pct,zoneStrength:event.zone.overlapStrength,lagMs:P};
}
export class RangeSweepLongColor{
 constructor({loadRows,blocked=()=>false,now=Date.now,budgetMs=2000}={}){Object.assign(this,{loadRows,blocked,now,budgetMs});this.cache=new Map();this.busy=false;this.reads=[];this.stats={requests:0,qualified:0,unavailable:0};}
 async read(symbol){
  const now=this.now(),prior=this.cache.get(symbol);let rows;
  if(prior&&now-prior.fetchedAt<60000)rows=prior.rows;
  else{
   this.reads=this.reads.filter(t=>now-t<60000);
   if(this.busy||this.blocked()||this.reads.length>=6)return null;
   this.busy=true;this.reads.push(now);this.stats.requests++;
   const pending=Promise.resolve().then(()=>this.loadRows(symbol)).then(value=>{if(!Array.isArray(value))throw Error('INVALID_RATIO');this.cache.set(symbol,{rows:value,fetchedAt:this.now()});while(this.cache.size>100)this.cache.delete(this.cache.keys().next().value);return value;}).catch(()=>null).finally(()=>{this.busy=false;});
   let timer;try{rows=await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),this.budgetMs);})]);}finally{clearTimeout(timer);}
  }
  return rows?this.cache.get(symbol):null;
 }
 async evaluate(event){
  const preliminary=assessRangeSweepLongColor(event,[]);if(preliminary.reason==='NOT_ELIGIBLE')return preliminary;
  const snapshot=await this.read(event.symbol),rows=snapshot?.rows;
  const result=rows?assessRangeSweepLongColor(event,rows):{...preliminary,reason:'POSITION_LOOKUP_UNAVAILABLE'};
  if(result.qualified)this.stats.qualified++;else if(!rows)this.stats.unavailable++;
  return {...result,classifiedAt:this.now()};
 }
}
