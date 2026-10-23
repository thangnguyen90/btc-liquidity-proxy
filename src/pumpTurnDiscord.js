import {PUMP_TURN_VERSION} from '../public/pump-turn-model.js';
export const PUMP_TURN_DISCORD_VERSION='PUMP_TURN_DISCORD_HEATMAP_LINK_V2_20261021';
const f=n=>Number.isFinite(n)?Number(n.toPrecision(8)).toString():'—';
export function pumpTurnDiscordPayload(e){
  return {username:'Vùng dự tính bơm / xả',allowed_mentions:{parse:[]},embeds:[{
    title:`${e.side==='LONG'?'🟢':'🔴'} ${e.symbol} · GẦN VÙNG ${e.side} · CHƯA XÁC NHẬN`,color:e.side==='LONG'?0x29d5a0:0xff627e,
    description:'Giá đang tiến gần mốc theo dõi của nến 5m tiếp theo. Các điều kiện nến kích hoạt vẫn cần chờ đóng. Quan sát thử nghiệm.',
    fields:[{name:'GIÁ / VÙNG / KHOẢNG CÁCH',value:`Giá ${f(e.livePrice)}\nVùng ${f(e.zoneLow)} – ${f(e.zoneHigh)}\nCách vùng ${f(e.distancePct)}%`},
      {name:'BỐI CẢNH ĐÃ ĐÓNG',value:e.side==='LONG'?`Tăng60m ${f(e.gain60)}% · vol3/nền20 ${f(e.preVolumeX)}× · taker mua3 ${f(e.preBuyPct)}%`:`Sóng tăng6h ${f(e.pump6h)}% · đỉnh ${f(e.peak)}`},
      {name:'CÒN CHỜ NẾN KÍCH HOẠT',value:e.side==='LONG'?'Đóng vượt mốc; tăng60m≥8%, volume≥2×/≥100kUSDT, mua≥55%, đóng vùng trên30%.':'Nến đỏ đóng thủng mốc, trả3–20% từ đỉnh; volume≥1,5×/≥100kUSDT, bán≥55%.'},
      {name:'BINANCE',value:e.side==='SHORT'&&e.marketRuleEnabled?'Rule SHORT mới đang ON: xét MARKET 2 USDT margin ×5, TP +10% / SL −30% ROE; còn kiểm tra giá/vị thế/cap. Xem kết quả trên trang, không coi Discord là đã khớp.':'Không cấp lệnh từ thông báo này; xem trạng thái rule trên trang.'},
      {name:'HẾT HIỆU LỰC (VN)',value:new Date(e.expiresAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false})},
      {name:'MỞ ĐÚNG TÍN HIỆU',value:`[Xem vùng và lý do](https://liquidity.nhathadev.trade/pump-turn-watch?signal=${encodeURIComponent(e.id)}#signals)`},
      {name:'HEATMAP MODEL 1 / 3',value:`[Mở hai model đúng coin · 24h](https://liquidity.nhathadev.trade/coinglass-heatmap-lab?symbol=${encodeURIComponent(e.symbol)}&range=24h)`}],
    footer:{text:PUMP_TURN_VERSION+' · '+PUMP_TURN_DISCORD_VERSION+' · Cảnh báo quan sát'},timestamp:new Date(e.observedAt).toISOString()
  }]};
}
export function createPumpTurnDiscordSender({webhookUrl,fetchImpl=fetch}={}){
  if(!webhookUrl?.trim())return null;let u;
  try{u=new URL(webhookUrl.trim());}catch{throw Error('INVALID_PUMP_TURN_DISCORD');}
  if(u.protocol!=='https:'||!['discord.com','discordapp.com'].includes(u.hostname)||u.username||u.password||u.port||u.search||u.hash||!/^\/api\/webhooks\/\d+\/[^/]+$/.test(u.pathname))throw Error('INVALID_PUMP_TURN_DISCORD');
  return async e=>{try{const r=await fetchImpl(u.href,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(pumpTurnDiscordPayload(e)),signal:AbortSignal.timeout(8000)});
    return {sent:r.ok?1:0,failed:r.ok?0:1,httpStatus:r.status};}catch{return {sent:0,failed:1,error:'DISCORD_FAILED_OR_UNKNOWN'};}};
}
