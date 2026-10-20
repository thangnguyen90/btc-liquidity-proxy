import {weakAltClosedRows} from './weakAltRebound.js';
import {BTC_ALT_STRUCTURE_VERSION as VERSION,BTC_ALT_STRUCTURE_LABELS} from '../public/btc-alt-structure-model.js';
const pct=(a,b)=>(a/b-1)*100,round=x=>Number(x.toFixed(3));
function ema(a,n){let x=a.slice(0,n).reduce((s,v)=>s+v,0)/n;for(const v of a.slice(n))x+=2/(n+1)*(v-x);return x;}
export function classifyTrendMetrics({ret6h,ret3h,ret24h,efficiency,atr,emaUp,emaDown}){
 const min6=Math.max(.5,2*atr),min3=Math.max(.2,atr),min24=Math.max(1,2*atr),strongPath=efficiency>=.35;
 const impulseUp=ret6h>=min6&&ret3h>=min3&&strongPath,impulseDown=ret6h<=-min6&&ret3h<=-min3&&strongPath;
 const broadUp=ret24h>=min24&&ret3h>=-.5*atr,broadDown=ret24h<=-min24&&ret3h<=.5*atr;
 const state=emaUp&&(impulseUp||broadUp)?'UP':emaDown&&(impulseDown||broadDown)?'DOWN':
  Math.abs(ret24h)<min24&&(efficiency<.35||Math.abs(ret6h)<Math.max(.5,1.5*atr))?'SIDEWAYS':'MIXED';
 return {state,min6,min3,min24,strongPath,broadUp,broadDown};
}
export function trendProfile(input=[],now=Date.now()){
 const rows=weakAltClosedRows(input,now);if(!rows.length)return {ready:false,state:'DATA_MISSING',reason:'Thiếu97 nến15m liên tục/fresh≤16phút; không suy trend từ1h.'};
 const closes=rows.map(r=>r.close),last=rows.at(-1),ret1h=pct(last.close,rows.at(-5).close),ret3h=pct(last.close,rows.at(-13).close),ret6h=pct(last.close,rows.at(-25).close),ret24h=pct(last.close,rows.at(-97).close);
 const e20=ema(closes,20),e50=ema(closes,50),old20=ema(closes.slice(0,-4),20),old50=ema(closes.slice(0,-4),50);
 const window=rows.slice(-25),path=window.slice(1).reduce((s,r,i)=>s+Math.abs(r.close-window[i].close),0),efficiency=path>0?Math.abs(last.close-window[0].close)/path:0;
 const atr=rows.slice(-14).reduce((s,r,i)=>{const prev=rows[rows.length-15+i].close;return s+Math.max(r.high-r.low,Math.abs(r.high-prev),Math.abs(r.low-prev));},0)/14/last.close*100;
 const {state,min6,min3,min24,strongPath,broadUp,broadDown}=classifyTrendMetrics({ret6h,ret3h,ret24h,efficiency,atr,
  emaUp:last.close>e20&&e20>e50&&e20>old20&&e50>old50,emaDown:last.close<e20&&e20<e50&&e20<old20&&e50<old50});
 return {ready:true,state,closedAt:last.closeTime,price:last.close,ret1h:round(ret1h),ret3h:round(ret3h),ret6h:round(ret6h),ret24h:round(ret24h),
  ema20:e20,ema50:e50,efficiency:round(efficiency),atr15mPct:round(atr),min6hPct:round(min6),min3hPct:round(min3),min24hPct:round(min24),
  conditions:[{met:Math.abs(ret6h)>=min6,label:`Biên độ6h≥${round(min6)}% (max0,5%;2×ATR15m)`},{met:Math.abs(ret3h)>=min3&&Math.sign(ret3h)===Math.sign(ret6h),label:`3h cùng hướng6h, biên độ≥${round(min3)}%`},
   {met:strongPath,label:'Hiệu suất đường giá6h≥0,35; không coi dao động qua lại là trend mạnh'},
   {met:broadUp||broadDown,label:`Nhánh nền24h: |return24h|≥${round(min24)}% (max1%;2×ATR), 3h không đảo ngược quá0,5×ATR; không gọi coin biến động lớn là sideway chỉ vì6h nhiễu`},
   {met:last.close>e20&&e20>e50&&e20>old20&&e50>old50||last.close<e20&&e20<e50&&e20<old20&&e50<old50,label:'Giá/EMA20/EMA50 và độ dốc cả2 EMA đồng thuận một hướng'}]};
}
export function evaluateBtcAltStructure({symbols=[],getRows=()=>[],now=Date.now(),reaction=null}={}){
 const btc=trendProfile(getRows('BTCUSDT')??[],now),coins=[...new Set(symbols)].filter(s=>/^[\p{L}\p{N}]{1,32}USDT$/u.test(s)&&s!=='BTCUSDT').map(symbol=>{
  const profile=trendProfile(getRows(symbol)??[],now),sync=profile.ready&&btc.ready&&profile.closedAt===btc.closedAt;
  return {symbol,group:profile.state,profile,btcAligned:sync,relation:!sync?'Nền BTC thiếu hoặc lệch timestamp; không kết luận quan hệ.':
   btc.state==='SIDEWAYS'?(profile.state==='UP'?'BTC đi ngang · coin có nền tăng riêng':profile.state==='DOWN'?'BTC đi ngang · coin có nền giảm riêng':'BTC đi ngang · xem nền coin độc lập'):
   ['UP','DOWN'].includes(btc.state)&&['UP','DOWN'].includes(profile.state)?btc.state===profile.state?'Nền cùng hướng · chưa chứng minh bám BTC':'Nền trái hướng BTC': 'BTC/coin phân hóa; không gán cùng/ngược trend',
   reaction:reaction?.coins?.find(c=>c.symbol===symbol)??{symbol,group:'DATA_MISSING',ready:false,reason:'Chưa có phản ứng1m đồng bộ.'}};
 });
 coins.sort((a,b)=>Object.keys(BTC_ALT_STRUCTURE_LABELS).indexOf(a.group)-Object.keys(BTC_ALT_STRUCTURE_LABELS).indexOf(b.group)||Math.abs(b.profile.ret6h??0)-Math.abs(a.profile.ret6h??0)||a.symbol.localeCompare(b.symbol));
 return {version:VERSION,evaluatedAt:now,ready:symbols.length>0,observeOnly:true,affectsOrders:false,btc,total:coins.length,coins,
 counts:Object.fromEntries(Object.keys(BTC_ALT_STRUCTURE_LABELS).map(g=>[g,coins.filter(c=>c.group===g).length]))};
}
