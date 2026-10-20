import {SHORT_SETUP_VERSION,SHORT_SETUP_PATTERNS,shortSetupStateLabel} from '../public/short-setup-model.js';
const fmt=(n,d=7)=>n==null||!Number.isFinite(Number(n))?'chưa có':Number(n).toLocaleString('en-US',{maximumFractionDigits:d});
export function buildShortSetupDiscordPayload(e) {
  const long=e.side==='LONG',side=long?'LONG':'SHORT',early=e.state!=='READY';
  return {username:'AI Local · Hỗ trợ & kháng cự',allowed_mentions:{parse:[]},embeds:[{
    title:`${long?'🔴':'🟢'} ${side} · ${e.symbol} · ${SHORT_SETUP_PATTERNS[e.pattern]??'Cấu trúc giá'}`,
    color:long?0xff7791:0x20d6a1,
    description:`NẾN 1M ĐÃ ĐÓNG · OBSERVE ONLY · ${early?'CẢNH BÁO SỚM, CHƯA KÍCH HOẠT':shortSetupStateLabel(e)}.\n${e.reason}`,
    fields:[
      {name:'VÙNG / GIÁ',value:`Vùng ${fmt(e.zone.low)} – ${fmt(e.zone.high)} · ${fmt(e.zone.touches,0)} swing\nGiá nến đóng ${fmt(e.price)} · điểm ${fmt(e.score,0)}/100 (không phải xác suất)`},
      {name:'KÍCH HOẠT / VÔ HIỆU / MỤC TIÊU',value:`Kích hoạt tham khảo ${fmt(e.triggerPrice)}\nVô hiệu ${fmt(e.invalidationPrice)}\n${long?'Kháng cự':'Hỗ trợ'} gần nhất ${fmt(e.targetPrice)} · R:R ${fmt(e.rewardRisk,2)}`},
      {name:'VOLUME / LỰC CHỦ ĐỘNG',value:`Volume ${fmt(e.volumeRatio,2)}× nền20 · ${long?'mua':'bán'} ${fmt(long?e.takerBuyPct:e.takerSellPct,1)}%`},
      {name:'BINANCE',value:'Chỉ cảnh báo cấu trúc giá. Không tự MARKET, không đổi entry, margin, đòn bẩy, SL/TP hoặc lệnh đang mở. Mục tiêu/mức vô hiệu là tham khảo, chưa phải lệnh TP/SL.'},
      {name:'MỞ SETUP CỤ THỂ',value:`[Xem LONG / SHORT trên web](https://liquidity.nhathadev.trade/short-setup-watch?signal=${encodeURIComponent(e.id)})`}
    ],timestamp:new Date(e.updatedAt).toISOString(),footer:{text:SHORT_SETUP_VERSION}
  }]};
}
export function createShortSetupDiscordSender({webhookUrl,fetchImpl=fetch}={}) {
  if(!webhookUrl)return null;
  let url;
  try{url=new URL(webhookUrl.trim());}catch{throw new Error('Invalid structure Discord configuration');}
  if(url.protocol!=='https:'||!['discord.com','discordapp.com'].includes(url.hostname)||url.username||url.password||url.port
    ||url.search||url.hash||!/^\/api\/webhooks\/\d+\/[^/]+$/.test(url.pathname))throw new Error('Invalid structure Discord configuration');
  return async e=>{
    try{
      const response=await fetchImpl(url.href,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},
        body:JSON.stringify(buildShortSetupDiscordPayload(e)),signal:AbortSignal.timeout(8000)});
      return {attempted:1,sent:response.ok?1:0,failed:response.ok?0:1,httpStatus:response.status};
    }catch{return {attempted:1,sent:0,failed:1,error:'DISCORD_FAILED_OR_UNKNOWN'};}
  };
}
