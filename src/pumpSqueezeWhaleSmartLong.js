import {proveWhaleSmartLong,pumpLowWhaleSmartLongStrategy,PUMP_LOW_WHALE_SMART_LONG_RULE} from './pumpLowWhaleSmartLong.js';
export const PUMP_SQUEEZE_WHALE_SMART_LONG_VERSION='PUMP_SQUEEZE_WHALE_SMART_LONG_V1_20261105';
export const PUMP_SQUEEZE_WHALE_SMART_LONG_GROUP='PUMP_SQUEEZE_WHALE_SMART_LONG_RISING';
const {minDropPct,maxHeightPct,minCrowdLongPct,crowdLongDelta1hPp,...common}=PUMP_LOW_WHALE_SMART_LONG_RULE;
export const PUMP_SQUEEZE_WHALE_SMART_LONG_RULE=Object.freeze({...common,minCrowdShortPct:60,crowdShortDelta1hPp:'OBSERVE_ONLY',priceFilter:'FRESH_24H_ONLY',color:0x3b82f6});
export const pumpSqueezePriceMatches=p=>!!p&&p.price>0&&p.high24h>0&&p.low24h>0;
export function provePumpSqueezeWhaleSmartLong(args={}){return proveWhaleSmartLong(args,{priceMatches:pumpSqueezePriceMatches,group:PUMP_SQUEEZE_WHALE_SMART_LONG_GROUP,crowdSide:'SHORT',requiresCrowdDecline:false});}
const f=x=>typeof x==='number'&&Number.isFinite(x)?x.toFixed(2):'—',delta=x=>typeof x==='number'&&Number.isFinite(x)?(x>=0?'+':'')+f(x):'—',vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false});
export function pumpSqueezeWhaleSmartLongPayload(e){
 const p=e.position,s=e.price,coin=encodeURIComponent(e.symbol);
 return {username:'Ép SHORT · Cá voi & Smart tăng LONG',allowed_mentions:{parse:[]},embeds:[{title:'🔵 '+e.symbol+' · LONG ÉP SHORT',color:0x3b82f6,description:'**SHORT ĐÁM ĐÔNG ≥60% · CÁ VOI VÀ SMART CÙNG TĂNG LONG**\nTheo dõi khả năng bơm/ép SHORT. Chưa có xác nhận breakout hoặc backtest riêng nhánh này.',fields:[
  {name:'GIÁ ĐÓNG BINANCE 5m',value:'Giá: **'+s.price+'**\nVị trí trong biên 24h: '+f(s.heightPct)+'%\nNến đóng: '+vn(e.decisionAt)+' VN\nNhánh này không yêu cầu giá đang ở đáy hoặc đã bơm.'},
  {name:'SHORT ĐÁM ĐÔNG',value:'Hiện tại: **'+f(p.crowdShort)+'%**\nThay đổi 1h: '+delta(p.crowdShortDelta1hPp)+' điểm % · chỉ tham khảo, không lọc theo chiều tăng/giảm.'},
  {name:'LONG CÁ VOI · 4h',value:f(p.previousWhaleLong)+'% → **'+f(p.whaleLong)+'%** · **'+delta(p.whaleDelta4hPp)+' điểm %**'},
  {name:'LONG TRADER THÔNG MINH · 4h',value:f(p.previousSmartLong)+'% → **'+f(p.smartLong)+'%** · **'+delta(p.smartDelta4hPp)+' điểm %**'},
  {name:'NGUỒN VÀ CÁCH ĐỌC',value:'Tỷ trọng trễ 15 phút trước nến quyết định. Mốc nhóm: '+vn(p.previousWhaleAt)+' → '+vn(p.whaleAt)+' VN, theo snapshot thật bot đã lưu. Chỉ quan sát khả năng ép SHORT, không chứng minh từng trader mở thêm LONG và không gửi lệnh Binance. Model 1/3 chưa là gate.'},
  {name:'MỞ COIN',value:'[Model 1/3](https://liquidity.nhathadev.trade/coinglass-heatmap-lab?symbol='+coin+'&range=24h) · [PumpGlass](https://pumpglass.com/smart-money/'+coin+') · [Binance](https://www.binance.com/en/futures/'+coin+')'},
 ],timestamp:new Date(e.observedAt).toISOString(),footer:{text:PUMP_SQUEEZE_WHALE_SMART_LONG_VERSION+' | OBSERVE ONLY | 1 lần/coin/8h'}}]};
}
export function pumpSqueezeWhaleSmartLongStrategy(journal){const base=pumpLowWhaleSmartLongStrategy(journal);return {...base,
 version:PUMP_SQUEEZE_WHALE_SMART_LONG_VERSION,group:PUMP_SQUEEZE_WHALE_SMART_LONG_GROUP,rule:PUMP_SQUEEZE_WHALE_SMART_LONG_RULE,priceMatches:pumpSqueezePriceMatches,prove:provePumpSqueezeWhaleSmartLong,payload:pumpSqueezeWhaleSmartLongPayload,
 snapshot:watch=>({positionJournal:journal.snapshot(),coverage:{...watch.coverage,priceCandidates:watch.coverage.priceHigh,priceHigh:undefined},warmup:base.snapshot(watch).warmup}),
};}
