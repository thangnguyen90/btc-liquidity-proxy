import {proveWhaleSmartPositioning} from './pumpLowWhaleSmartLong.js';
import {pumpSqueezePriceMatches,pumpSqueezeWhaleSmartLongStrategy,PUMP_SQUEEZE_WHALE_SMART_LONG_RULE} from './pumpSqueezeWhaleSmartLong.js';
export const PUMP_SQUEEZE_WHALE_SMART_SHORT_VERSION='PUMP_SQUEEZE_WHALE_SMART_SHORT_V1_20261106';
export const PUMP_SQUEEZE_WHALE_SMART_SHORT_GROUP='PUMP_SQUEEZE_WHALE_SMART_LONG_WEAKENING';
const {minCrowdShortPct,crowdShortDelta1hPp,...common}=PUMP_SQUEEZE_WHALE_SMART_LONG_RULE;
export const PUMP_SQUEEZE_WHALE_SMART_SHORT_RULE=Object.freeze({...common,minCrowdLongPct:60,crowdLongDelta1hPp:'OBSERVE_ONLY',whaleLongDelta4hPp:'<0',smartLongDelta4hPp:'<0',color:0xef4444});
export function provePumpSqueezeWhaleSmartShort(args={}){
 return proveWhaleSmartPositioning(args,{priceMatches:pumpSqueezePriceMatches,priceRejectedStatus:'PRICE_NOT_READY',group:PUMP_SQUEEZE_WHALE_SMART_SHORT_GROUP,crowdSide:'LONG',requiresCrowdDecline:false,side:'SHORT'});
}
const f=x=>typeof x==='number'&&Number.isFinite(x)?x.toFixed(2):'—',delta=x=>typeof x==='number'&&Number.isFinite(x)?(x>=0?'+':'')+f(x):'—',vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false});
export function pumpSqueezeWhaleSmartShortPayload(e){
 const p=e.position,s=e.price,coin=encodeURIComponent(e.symbol),execution=e.marketExecution;
 const marketField=execution?.enabled?[{name:'MARKET thử nghiệm · lực bán ≥55%',value:'Bán chủ động15m: '+f(execution.flow?.sellPct)+'%. '+(execution.flow?.sellPct>=55?'Đạt ngưỡng; kiểm tra size/vị thế trước khi gửi MARKET.':'Chưa đạt ngưỡng nhánh MARKET.')+'\nKý quỹ2USDT ×3; TP+5%/SL−20%ROE; tối đa5vị thế riêng. Tín hiệu này chưa xác nhận lệnh khớp.'}]:[];
 return {username:'Ép LONG · Cá voi & Smart giảm LONG',allowed_mentions:{parse:[]},embeds:[{title:'🔴 '+e.symbol+' · SHORT ÉP LONG',color:PUMP_SQUEEZE_WHALE_SMART_SHORT_RULE.color,description:'**LONG ĐÁM ĐÔNG ≥60% · CÁ VOI VÀ SMART CÙNG GIẢM LONG**\nTheo dõi khả năng giảm/ép LONG. Chưa xác nhận breakdown hoặc có backtest riêng nhánh này.',fields:[...marketField,
  {name:'GIÁ ĐÓNG BINANCE 5m',value:'Giá: **'+s.price+'**\nVị trí trong biên 24h: '+f(s.heightPct)+'%\nNến đóng: '+vn(e.decisionAt)+' VN\nNhánh này không yêu cầu giá đang ở đỉnh hoặc đã giảm.'},
  {name:'LONG ĐÁM ĐÔNG',value:'Hiện tại: **'+f(p.crowdLong)+'%**\nThay đổi 1h: '+delta(p.crowdDelta1hPp)+' điểm % · chỉ tham khảo, không lọc theo chiều tăng/giảm.'},
  {name:'LONG CÁ VOI · 4h',value:f(p.previousWhaleLong)+'% → **'+f(p.whaleLong)+'%** · **'+delta(p.whaleDelta4hPp)+' điểm %**'},
  {name:'LONG TRADER THÔNG MINH · 4h',value:f(p.previousSmartLong)+'% → **'+f(p.smartLong)+'%** · **'+delta(p.smartDelta4hPp)+' điểm %**'},
  {name:'NGUỒN VÀ CÁCH ĐỌC',value:'Tỷ trọng trễ 15 phút trước nến quyết định. Mốc nhóm: '+vn(p.previousWhaleAt)+' → '+vn(p.whaleAt)+' VN, theo snapshot thật bot đã lưu. Giảm tỷ trọng LONG chưa chứng minh từng trader mở thêm SHORT hoặc có thanh lý thực tế. '+(execution?.enabled?'Nhánh MARKET thử nghiệm riêng cần lực bán≥55% và qua các kiểm tra vào lệnh.':'Chỉ quan sát, không gửi lệnh Binance.')+' Model 1/3 chưa là gate.'},
  {name:'MỞ COIN',value:'[Model 1/3](https://liquidity.nhathadev.trade/coinglass-heatmap-lab?symbol='+coin+'&range=24h) · [PumpGlass](https://pumpglass.com/smart-money/'+coin+') · [Binance](https://www.binance.com/en/futures/'+coin+')'},
 ],timestamp:new Date(e.observedAt).toISOString(),footer:{text:PUMP_SQUEEZE_WHALE_SMART_SHORT_VERSION+(execution?.enabled?' | MARKET TEST SELL55 | 1 lần/coin/8h':' | OBSERVE ONLY | 1 lần/coin/8h')}}]};
}
export function pumpSqueezeWhaleSmartShortStrategy(journal){
 const base=pumpSqueezeWhaleSmartLongStrategy(journal);
 return {...base,version:PUMP_SQUEEZE_WHALE_SMART_SHORT_VERSION,group:PUMP_SQUEEZE_WHALE_SMART_SHORT_GROUP,rule:PUMP_SQUEEZE_WHALE_SMART_SHORT_RULE,prove:provePumpSqueezeWhaleSmartShort,payload:pumpSqueezeWhaleSmartShortPayload,
  quickCheck:async(candidate,now)=>{const c=await journal.context(candidate.symbol,candidate.price.at,now);if(c.status!=='READY')return c;return c.current.whaleLong-c.previous.whaleLong < -1e-9&&c.current.smartLong-c.previous.smartLong < -1e-9?c:{status:'POSITION_NOT_FALLING'};},
 };
}
