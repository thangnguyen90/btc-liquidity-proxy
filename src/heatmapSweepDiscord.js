import {HEATMAP_SWEEP_VERSION} from './heatmapSweepWatch.js';
const f=n=>Number.isFinite(n)?Number(n.toPrecision(10)).toString():'—';
export function heatmapSweepDiscordPayload(e){
 const all=['ALL_TRACKED_UPPER_SWEPT','ALL_TRACKED_LOWER_SWEPT'].includes(e.kind),upper=e.direction!=='LOWER',where=upper?'TRÊN':'DƯỚI',side=upper?'SHORT':'LONG';
 return {username:'Heatmap · Quét cụm hai phía',allowed_mentions:{parse:[]},embeds:[{
  title:`${all?(upper?'🔴':'🟢'):'🟠'} ${e.symbol} · ${all?'QUÉT HẾT CÁC CỤM ĐÃ CHỐT · PHÍA '+where:'QUÉT HẾT CỤM PHÍA '+where}`,color:all?(upper?0xff627e:0x29d5a0):0xffb553,
  description:`MARK đã vượt mép ${upper?'trên':'dưới'} cụm ước lượng có trước nhịp giá. Không đợi nến đảo chiều. KHÔNG có nghĩa đã thanh lý hết toàn sàn hay bảo đảm giá đảo chiều.`,
  fields:[{name:'PHẠM VI / TIẾN ĐỘ',value:`${e.clearedCount}/${e.totalCount} cụm đã chốt trong ${upper?'+':'−'}${f(e.maxDistancePct)}% từ MARK lúc arm ${f(e.referencePrice)}. ${all?'Chỉ hết tập cụm này; vẫn có thể có vùng khác xa hơn hoặc mới sinh.':'Còn cụm chưa quét trong tập đang theo dõi.'}`},
   {name:'MARK / CỤM ĐÃ QUÉT',value:`MARK ${f(e.markPrice)}\n`+e.zones.filter(z=>z.cleared).map(z=>`${f(z.low)} – ${f(z.high)}`).join('\n')},
   {name:'VÙNG CÓ TRƯỚC GIÁ (VN)',value:`Nến chốt ${new Date(e.zonesAsOf).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}\nBắt đầu theo dõi ${new Date(e.armedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`},
   {name:'NGUỒN',value:'Hai model tự tính từ Binance 24h/nến5m, cùng giả định leverage. Cụm ≥35% mỗi profile/3nến, MARK/OI đủ nguồn. Không phải thanh lý thực được xác nhận.'},
   {name:'BINANCE',value:all&&e.binance?`${side} MARKET ${upper?3:1} USDT margin ×5 · TP +10% / SL −30% ROE · max riêng 20 chung hai hướng.\nKết quả: ${e.binance.status}${e.binance.orderId?' · orderId '+e.binance.orderId:''}. Không coi Discord là đã khớp; không sửa vị thế cũ.`:'Chỉ quan sát; chưa có kết quả entry từ thông báo này. Quét một cụm không cấp lệnh; lịch sử cũ không replay.'},
   {name:'MỞ ĐÚNG LẦN QUÉT',value:`[Heatmap và vùng đã chốt](https://liquidity.nhathadev.trade/coinglass-heatmap-lab?symbol=${encodeURIComponent(e.symbol)}&range=${encodeURIComponent(e.viewRange)}&sweep=${encodeURIComponent(e.id)}#heatmap-sweep)`}],
  footer:{text:HEATMAP_SWEEP_VERSION+' · Không phải thanh lý thực được xác nhận'},timestamp:new Date(e.at).toISOString()
 }]};
}
export function createHeatmapSweepDiscordSender({webhookUrl,fetchImpl=fetch}={}){
 if(!webhookUrl?.trim())return null;let u;try{u=new URL(webhookUrl.trim());}catch{throw Error('INVALID_HEATMAP_SWEEP_DISCORD');}
 if(u.protocol!=='https:'||!['discord.com','discordapp.com'].includes(u.hostname)||u.username||u.password||u.port||u.search||u.hash||!/^\/api\/webhooks\/\d+\/[^/]+$/.test(u.pathname))throw Error('INVALID_HEATMAP_SWEEP_DISCORD');
 return async e=>{try{const r=await fetchImpl(u.href,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(heatmapSweepDiscordPayload(e)),signal:AbortSignal.timeout(8000)});return {sent:r.ok?1:0,failed:r.ok?0:1,httpStatus:r.status};}
 catch{return {sent:0,failed:1,error:'DISCORD_FAILED_OR_UNKNOWN'};}};
}
