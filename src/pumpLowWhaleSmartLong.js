import {priceFeatures,normalizeChart,asof,refreshOverlap} from './pumpHighWhaleShortModel.js';
export const PUMP_LOW_WHALE_SMART_LONG_VERSION='PUMP_LOW_WHALE_SMART_LONG_V1_20261105';
export const PUMP_LOW_WHALE_SMART_LONG_GROUP='PUMP_LOW_WHALE_SMART_LONG_RISING';
export const PUMP_LOW_WHALE_SMART_LONG_RULE=Object.freeze({scanMs:60000,cooldownMs:8*3600000,maxChecks:6,maxSends:3,sourceLagMinutes:15,maxPriceAgeMs:450000,maxLiveSourceAgeMs:900000,minDropPct:15,maxHeightPct:20,minCrowdLongPct:60,crowdLongDelta1hPp:'<0',whaleLongDelta4hPp:'>0',smartLongDelta4hPp:'>0',minWhales:10,color:0x22c55e,backtested:false});
export function pumpLowPriceMatches(p){return !!p&&p.high24h>0&&(1-p.price/p.high24h)*100>=15&&p.heightPct<=20;}
export function provePumpLowWhaleSmartLong(args={}){return proveWhaleSmartPositioning(args,{priceMatches:pumpLowPriceMatches,group:PUMP_LOW_WHALE_SMART_LONG_GROUP,crowdSide:'LONG',requiresCrowdDecline:true});}
// Keep the existing LONG helper export for callers; direction defaults to LONG.
export {proveWhaleSmartPositioning as proveWhaleSmartLong};
export function proveWhaleSmartPositioning({symbol,rows,chart,token,now,prepared}={},options){
 if(!/^[\p{L}\p{N}]{1,32}USDT$/u.test(symbol??''))return {status:'INVALID_SYMBOL'};
 const price=priceFeatures((rows??[]).filter(r=>Array.isArray(r)&&+r[6]<now)).at(-1);
 if(!options.priceMatches(price)||price.at>now||now-price.at>450000||price.at%300000!==0)return {status:options.priceRejectedStatus??(options.crowdSide==='LONG'?'PRICE_NOT_READY_OR_NOT_LOW':'PRICE_NOT_READY')};
 if(token?.symbol!==symbol||token.basis!=='whales'||!Number.isInteger(token.whale_count)||token.whale_count<10||!Number.isFinite(token.scanned_at)||token.scanned_at*1000>now||now-token.scanned_at*1000>900000)return {status:'LIVE_BASIS_MISSING_OR_STALE'};
 if(prepared?.status!=='READY')return {status:prepared?.status??'WARMING_HISTORY'};
 const current=prepared.current,previous=prepared.previous,cut=price.at-900000;
 if(![current,previous].every(p=>p&&Number.isFinite(p.sourceAt)&&Number.isFinite(p.observedAt)&&p.observedAt<=now&&!p.ambiguous&&Number.isInteger(p.whaleCount)&&p.whaleCount>=10&&['whaleLong','smartLong'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])&&p[k]>=0&&p[k]<=100)))return {status:'SNAPSHOT_INVALID'};
 if(current.sourceAt>cut||cut-current.sourceAt>1800000||previous.sourceAt>cut-14400000||cut-14400000-previous.sourceAt>1800000)return {status:'SNAPSHOT_MISSING_OR_STALE'};
 if(chart?.symbol!==symbol||!Array.isArray(chart.whales)||!Array.isArray(chart.crowd))return {status:'INVALID_CHART'};
 let data;try{data=normalizeChart(chart);}catch{return {status:'INVALID_CHART'};}
 const last=data.whales.at(-1);if(!last||last.t>now||now-last.t>900000)return {status:'LATEST_WHALE_SOURCE_STALE'};
 if(refreshOverlap(previous.sourceAt,current.sourceAt,data.refresh))return {status:'COHORT_REFRESH_EXCLUDED'};
 const c=asof(data.crowd,cut,600000),cp=asof(data.crowd,cut-3600000,600000);if(!c||(options.requiresCrowdDecline&&!cp))return {status:'CROWD_HISTORY_MISSING_OR_STALE'};
 const crowdLong=100-c.short,crowdShort=c.short,previousCrowdLong=cp?100-cp.short:null,crowdDelta1hPp=cp?crowdLong-previousCrowdLong:null,previousCrowdShort=cp?cp.short:null,crowdShortDelta1hPp=cp?crowdShort-previousCrowdShort:null,whaleDelta4hPp=current.whaleLong-previous.whaleLong,smartDelta4hPp=current.smartLong-previous.smartLong;
 const crowdMatches=options.crowdSide==='SHORT'?crowdShort>=60:crowdLong>=60;
 const direction=options.side==='SHORT'?-1:1;
 if(!(crowdMatches&&(!options.requiresCrowdDecline||crowdDelta1hPp < -1e-9)&&direction*whaleDelta4hPp > 1e-9&&direction*smartDelta4hPp > 1e-9))return {status:'CONDITIONS_NOT_MET'};
 return {status:'QUALIFIED',group:options.group,symbol,side:options.side??'LONG',purpose:'WATCH_ONLY',observeOnly:true,affectsOrders:false,decisionAt:price.at,observedAt:now,tokenSourceAt:token.scanned_at*1000,latestWhaleAt:last.t,price:{...price,dropPct:(1-price.price/price.high24h)*100},position:{whaleAt:current.sourceAt,previousWhaleAt:previous.sourceAt,whaleObservedAt:current.observedAt,previousWhaleObservedAt:previous.observedAt,crowdAt:c.t,previousCrowdAt:cp?.t??null,whaleLong:current.whaleLong,previousWhaleLong:previous.whaleLong,smartLong:current.smartLong,previousSmartLong:previous.smartLong,whaleDelta4hPp,smartDelta4hPp,crowdLong,previousCrowdLong,crowdDelta1hPp,crowdShort,previousCrowdShort,crowdShortDelta1hPp,whaleCount:current.whaleCount}};
}
const vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false}),f=x=>x.toFixed(2),delta=x=>(x>=0?'+':'')+f(x);
export function pumpLowWhaleSmartLongPayload(e){
 const p=e.position,s=e.price,coin=encodeURIComponent(e.symbol);
 return {username:'Giảm sâu · Cá voi & Smart tăng LONG',allowed_mentions:{parse:[]},embeds:[{title:'🟢 '+e.symbol+' · THEO DÕI LONG',color:0x22c55e,description:'**GIẢM SÂU · CÁ VOI VÀ TRADER THÔNG MINH CÙNG TĂNG LONG**\nNhánh quan sát đối xứng với nhóm SHORT màu cam. Chưa backtest riêng và chưa xác nhận tạo đáy.',fields:[
  {name:'GIÁ ĐÓNG BINANCE 5m',value:'Giá: **'+s.price+'**\nGiảm từ đỉnh 24h: **'+f(s.dropPct)+'%**\nVị trí trong biên 24h: **'+f(s.heightPct)+'%**\nNến đóng: '+vn(e.decisionAt)+' VN'},
  {name:'LONG CÁ VOI · 4h',value:f(p.previousWhaleLong)+'% → **'+f(p.whaleLong)+'%** · **'+delta(p.whaleDelta4hPp)+' điểm %**'},
  {name:'LONG TRADER THÔNG MINH · 4h',value:f(p.previousSmartLong)+'% → **'+f(p.smartLong)+'%** · **'+delta(p.smartDelta4hPp)+' điểm %**'},
  {name:'LONG ĐÁM ĐÔNG · 1h',value:f(p.previousCrowdLong)+'% → **'+f(p.crowdLong)+'%** · **'+delta(p.crowdDelta1hPp)+' điểm %**'},
  {name:'NGUỒN VÀ CÁCH ĐỌC',value:'Tỷ trọng trễ 15 phút trước nến quyết định. Mốc nhóm: '+vn(p.previousWhaleAt)+' → '+vn(p.whaleAt)+' VN, theo snapshot bot đã lưu. Tăng tỷ trọng LONG của nhóm chưa chứng minh từng trader mở thêm LONG. Chỉ theo dõi, không gửi lệnh Binance; Model 1/3 chưa là điều kiện lọc.'},
  {name:'MỞ COIN',value:'[Model 1/3](https://liquidity.nhathadev.trade/coinglass-heatmap-lab?symbol='+coin+'&range=24h) · [PumpGlass](https://pumpglass.com/smart-money/'+coin+') · [Binance](https://www.binance.com/en/futures/'+coin+')'},
 ],timestamp:new Date(e.observedAt).toISOString(),footer:{text:PUMP_LOW_WHALE_SMART_LONG_VERSION+' | OBSERVE ONLY | 1 lần/coin/8h'}}]};
}
export function pumpLowWhaleSmartLongStrategy(journal){return {
 version:PUMP_LOW_WHALE_SMART_LONG_VERSION,group:PUMP_LOW_WHALE_SMART_LONG_GROUP,rule:PUMP_LOW_WHALE_SMART_LONG_RULE,priceMatches:pumpLowPriceMatches,payload:pumpLowWhaleSmartLongPayload,prove:provePumpLowWhaleSmartLong,
 quickCheck:async(candidate,now)=>{const c=await journal.context(candidate.symbol,candidate.price.at,now);if(c.status!=='READY')return c;return c.current.whaleLong-c.previous.whaleLong>1e-9&&c.current.smartLong-c.previous.smartLong>1e-9?c:{status:'POSITION_NOT_RISING'};},
 prepare:async({symbol,price,token,now})=>{const result=await journal.capture(token,symbol);if(!['STORED','UNCHANGED'].includes(result.status))return {status:result.status};return journal.context(symbol,price.at,now);},
 snapshot:watch=>({positionJournal:journal.snapshot(),coverage:{...watch.coverage,priceLow:watch.coverage.priceHigh,priceHigh:undefined},warmup:'Cần snapshot thật của cả cá voi và Smart cách nhau khoảng 4h; không lấy was7d làm mốc4h.'}),
};}
