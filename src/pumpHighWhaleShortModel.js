// Pure shared signal calculations, used by offline research and the live observation notifier.
export const S=300000,H=3600000;
const num=v=>typeof v==='number'&&Number.isFinite(v);
export function normalizeChart(raw){
 const unique=rows=>{rows.sort((a,b)=>a.t-b.t);for(let i=1;i<rows.length;i++)if(rows[i].t===rows[i-1].t)throw Error('DUPLICATE_SOURCE_TIME');return rows;};
 const whales=unique((raw.whales??[]).filter(r=>Array.isArray(r)&&r.slice(0,5).every(num)&&r[0]>0&&r[1]>=0&&r[2]>=0&&r[3]>=0&&r[4]>=0&&r[3]+r[4]>0).map(r=>({t:r[0]*1000,w:100*r[3]/(r[3]+r[4]),count:r[1]+r[2],normalizedTotal:r[3]+r[4]})));
 const crowd=unique((raw.crowd??[]).filter(r=>Array.isArray(r)&&num(r[0])&&num(r[1])&&r[1]>=0&&r[1]<=1).map(r=>({t:r[0]*1000,short:100*(1-r[1])})));
 return {whales,crowd,refresh:(raw.refresh??[]).filter(num).map(t=>t*1000),locked:raw.locked===true};
}
export function asof(rows,t,maxAge){let lo=0,hi=rows.length;while(lo<hi){const mid=(lo+hi)>>>1;if(rows[mid].t<=t)lo=mid+1;else hi=mid;}const r=rows[lo-1];return r&&t-r.t<=maxAge?r:null;}
export function refreshOverlap(from,to,refresh=[]){
 if(refresh.some(t=>t<=to&&to>=t-120000&&from<=t+40*60000))return true;
 for(let day=from-from%86400000;day<=to;day+=86400000)if(to>=day+6*H&&from<=day+7.5*H)return true;
 return false;
}
export function priceFeatures(raw){
 const out=[],low=[],high=[];let quote=0,run=0;
 for(let i=0;i<raw.length;i++){
  const b=raw[i],t=+b[0],valid=b.length>=8&&[0,1,2,3,4,6,7].every(k=>Number.isFinite(+b[k]))&&+b[3]>0&&+b[2]>=+b[3]&&+b[4]>=+b[3]&&+b[4]<=+b[2]&&+b[6]===t+S-1;
  run=valid?(i&&t===+raw[i-1][0]+S?run+1:1):0;
  while(low.length&&+raw[low.at(-1)][3]>=+b[3])low.pop();while(high.length&&+raw[high.at(-1)][2]<=+b[2])high.pop();low.push(i);high.push(i);while(low[0]<i-287)low.shift();while(high[0]<i-287)high.shift();quote+=+b[7];if(i>=288)quote-=+raw[i-288][7];
  if(run<288) {out.push(null);continue;}
  const lo=+raw[low[0]][3],hi=+raw[high[0]][2],close=+b[4],pumpPct=100*(close/lo-1),heightPct=hi>lo?100*(close-lo)/(hi-lo):0;
  out.push({index:i,at:t+S,price:close,pumpPct,heightPct,high24h:hi,low24h:lo,quote24h:quote,pumpHigh:pumpPct>=15&&heightPct>=80});
 }
 return out;
}
export function positioningAt(chart,at,lagMinutes){
 const cut=at-lagMinutes*60000,w=asof(chart.whales,cut,30*60000),wp=asof(chart.whales,cut-4*H,30*60000),c=asof(chart.crowd,cut,10*60000),cp=asof(chart.crowd,cut-H,10*60000);
 if(!w||!wp||!c||!cp||w.count<10||wp.count<10)return {status:'MISSING_OR_STALE_SOURCE'};
 const listRefresh=refreshOverlap(wp.t,w.t,chart.refresh),crowdDelta=c.short-cp.short,whaleDelta=w.w-wp.w;
 const c20=asof(chart.crowd,cut-20*60000,10*60000),c40=asof(chart.crowd,cut-40*60000,10*60000),crowdFallingSteadily=!!c20&&!!c40&&cp.short>=c40.short&&c40.short>=c20.short&&c20.short>=c.short&&crowdDelta<0;
 return {status:'OK',sourceCutoff:cut,whaleAt:w.t,previousWhaleAt:wp.t,crowdAt:c.t,previousCrowdAt:cp.t,whaleLong:w.w,previousWhaleLong:wp.w,whaleDelta4hPp:whaleDelta,crowdShort:c.short,previousCrowdShort:cp.short,crowdDelta1hPp:crowdDelta,whaleCount:w.count,previousWhaleCount:wp.count,listRefresh,crowdFallingSteadily,crowdUnwinding:c.short>=60&&crowdDelta<=-5,whaleWeakening:whaleDelta<=-10,whaleFlip:wp.w>=60&&w.w<=40};
}

export const PUMP_HIGH_WHALE_SHORT_GROUP='PUMP_HIGH_WHALE_LONG_WEAKENING';
export function provePumpHighWhaleShort({symbol,rows,chart,now,token}={}){
 if(!/^[\p{L}\p{N}]{1,32}USDT$/u.test(symbol??''))return {status:'INVALID_SYMBOL'};
 const prices=priceFeatures((rows??[]).filter(b=>Array.isArray(b)&&+b[6]<now));
 const price=prices.at(-1);
 if(!price||!price.pumpHigh||price.at>now||now-price.at>450000||price.at%S!==0)return {status:'PRICE_NOT_READY_OR_NOT_HIGH'};
 if(token?.symbol!==symbol||token.basis!=='whales'||!Number.isInteger(token.whale_count)||token.whale_count<10
  ||!Number.isFinite(token.scanned_at)||token.scanned_at*1000>now||now-token.scanned_at*1000>900000)return {status:'LIVE_BASIS_MISSING_OR_STALE'};
 if(chart?.symbol!==symbol||!Array.isArray(chart.whales)||!Array.isArray(chart.crowd))return {status:'INVALID_CHART'};
 let data;try{data=normalizeChart(chart);}catch{return {status:'INVALID_CHART'};}
 const last=data.whales.at(-1);if(!last||last.t>now||now-last.t>900000)return {status:'LATEST_WHALE_SOURCE_STALE'};
 const position=positioningAt(data,price.at,15);
 if(position.status!=='OK')return {status:position.status};
 if(position.listRefresh)return {status:'COHORT_REFRESH_EXCLUDED'};
 if(!(position.crowdShort>=60&&position.crowdDelta1hPp < -1e-9&&position.whaleDelta4hPp < -1e-9))return {status:'CONDITIONS_NOT_MET'};
 return {status:'QUALIFIED',group:PUMP_HIGH_WHALE_SHORT_GROUP,symbol,side:'SHORT',purpose:'WATCH_ONLY',observeOnly:true,affectsOrders:false,decisionAt:price.at,observedAt:now,tokenSourceAt:token.scanned_at*1000,latestWhaleAt:last.t,price,position};
}
