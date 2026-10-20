export const CONTRACT_RISK_DISCORD_VERSION='BINANCE_CONTRACT_RISK_DISCORD_V1_20261017';
const local=t=>t?new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false})+' (UTC+7)':'Chưa có giờ xác nhận';
const stageLabels={ANNOUNCED:'CÓ LỊCH TẤT TOÁN',ONE_DAY:'CÒN ≤24 GIỜ',ONE_HOUR:'CÒN ≤1 GIỜ',RESTRICTED:'HẠN CHẾ GIAO DỊCH',SETTLEMENT_DUE:'ĐẾN GIỜ TẤT TOÁN',STATUS_WARNING:'KIỂM TRA TRẠNG THÁI HỢP ĐỒNG'};
export function buildContractRiskDiscordPayload(r,now=Date.now()){
  const path='/liquidity-zone-manager?contractRisk='+encodeURIComponent(r.riskId)+'#contractRiskPanel';
  const source=/^https:\/\/(www\.binance\.com|developers\.binance\.com)\//.test(r.sourceUrl??'')?r.sourceUrl:null;
  return {username:'Binance · Cảnh báo delist',allowed_mentions:{parse:[]},embeds:[{
    title:`⚠ ${r.symbol} · ${stageLabels[r.stage]??stageLabels.STATUS_WARNING}`,
    color:['RESTRICTED','SETTLEMENT_DUE'].includes(r.stage)?0xef4444:0xffb52b,
    description:'Lịch hợp đồng Binance USDT perpetual. '+(r.sourceConflict?'⚠ Giờ API khác thông báo; cần đối chiếu nguồn.':''),
    fields:[{name:'SÀN TỰ TẤT TOÁN',value:local(r.settlementAt)},
      {name:'NGỪNG MỞ LỆNH MỚI',value:local(r.restrictedAt)+(r.restrictedAt?'\nKhông đồng nghĩa khóa đóng vị thế.':'\nKhông suy đoán thời điểm hạn chế từ giờ tất toán.')},
      {name:'TRẠNG THÁI / NGUỒN',value:`API: ${String(r.status??'chưa có').slice(0,80)}\n${source?`[Nguồn Binance](${source})`:'Chưa có liên kết nguồn xác nhận'}`},
      {name:'XEM CẢNH BÁO',value:`[Mở đúng coin trên web](https://liquidity.nhathadev.trade${path})`},
      {name:'QUẢN LÝ LỆNH',value:'Chỉ cảnh báo. Hệ thống không tự đóng vị thế, chặn entry hoặc thay margin/TP/SL từ thông báo này.'}],
    timestamp:new Date(now).toISOString(),footer:{text:CONTRACT_RISK_DISCORD_VERSION}
  }]};
}
export function createContractRiskDiscordSender({webhookUrl,fetchImpl=fetch}={}){
  if(!webhookUrl?.trim())return null;
  let url;try{url=new URL(webhookUrl.trim());}catch{throw Error('Invalid contract-risk Discord configuration');}
  if(url.protocol!=='https:'||!['discord.com','discordapp.com'].includes(url.hostname)||url.username||url.password||url.port||url.search||url.hash
    ||!/^\/api\/webhooks\/\d+\/[^/]+$/.test(url.pathname))throw Error('Invalid contract-risk Discord configuration');
  return async(r,now)=>{
    try{
      const response=await fetchImpl(url.href,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},
        body:JSON.stringify(buildContractRiskDiscordPayload(r,now)),signal:AbortSignal.timeout(8000)});
      return {attempted:1,sent:response.ok?1:0,failed:response.ok?0:1,httpStatus:response.status};
    }catch{return {attempted:1,sent:0,failed:1,error:'DISCORD_FAILED_OR_UNKNOWN'};}
  };
}
