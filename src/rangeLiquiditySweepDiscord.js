import {RANGE_SWEEP_VERSION} from './rangeLiquiditySweepModel.js';
import {rangeSweepContextFields,rangeSweepEntryIntro,RANGE_SWEEP_CONTEXT_VERSION,RANGE_SWEEP_DECISION_VERSION} from './rangeSweepCombinedContext.js';
export const RANGE_SWEEP_COLORS=Object.freeze({SHORT:0xed4245,LONG:0x2ecc71,LONG_CONFLUENCE:0x9b59b6,UNKNOWN:0x95a5a6});
const title={BREAKOUT:'BẮT ĐẦU RỜI NỀN',ZONE_TOUCH:'ĐÃ CHẠM VÙNG',DIRECTION_CONFIRMED:'PHÁ NỀN CÓ XÁC NHẬN',REJECTION:'QUÉT VÙNG · TỪ CHỐI GIÁ',CONTINUATION:'QUÉT VÙNG · TIẾP DIỄN',BASE_REENTRY:'TRỞ LẠI NỀN · HỦY HƯỚNG'};
const missingTitles={FEWER_THAN_21_CLOSED_1M:'Chưa đủ21 nến1m đóng',CLOSED_1M_GAP_OR_INVALID:'Nến1m bị thiếu khoảng hoặc không hợp lệ',CLOSED_1M_STALE:'Nến1m đã cũ',TAKER_BUY_MISSING_OR_INVALID:'Thiếu/sai dữ liệu mua chủ động',LAST_MINUTE_ZERO_VOLUME:'Phút vừa đóng không có volume',BASELINE_ZERO_VOLUME:'Nền20 phút không có volume'};
const n=v=>Number.isFinite(v)?Number(v.toPrecision(8)).toString():'thiếu';
export function rangeSweepDiscordPayload(e){const side=['SHORT','LONG'].includes(e.side)?e.side:'UNKNOWN',flow=e.flow,confluence=e.longConfluence,purple=side==='LONG'&&!!flow&&confluence?.qualified===true&&confluence.symbol===e.symbol&&confluence.zoneStrength===e.zone?.overlapStrength&&confluence.zoneStrength>=50&&confluence.change15Pct>0&&confluence.ratioAt<=e.at-300000&&confluence.ratioAt>=e.at-600000&&confluence.baselineAt===confluence.ratioAt-900000;
 const payload={username:'Nền đi ngang · Quét vùng',allowed_mentions:{parse:[]},embeds:[{title:(side==='SHORT'?'🔴 SHORT':side==='LONG'?(purple?'🟣 LONG · POSITION↑ + VÙNG≥50':'🟢 LONG'):!flow?'⚪ THIẾU DỮ LIỆU XÁC NHẬN':'⚪ ĐỦ DỮ LIỆU · CHƯA CHỐT HƯỚNG')+' · '+e.symbol+' · '+(title[e.kind]??e.kind),color:purple?RANGE_SWEEP_COLORS.LONG_CONFLUENCE:RANGE_SWEEP_COLORS[side],
 description:e.reason+'\nĐiều kiện cảnh báo thử nghiệm; nghiên cứu trên mẫu ngắn, chưa xác nhận ngoài mẫu.',fields:[
 ...(side==='LONG'?[{name:'PHÂN LOẠI LONG · POSITION / MODEL 1+3',value:purple?'Màu tím: Position ratio tăng '+n(confluence.change15Pct)+'% trong15m · '+n(confluence.previous)+' → '+n(confluence.ratio)+'\nĐiểm vùng '+n(confluence.zoneStrength)+'/100 · ratio chốt '+new Date(confluence.ratioAt).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'})+' VN\nTỷ lệ vị thế top trader, không phải số tài khoản.':confluence?.reason==='POSITION_NOT_RISING'?'Position ratio không tăng trong15m; LONG màu xanh thường.':confluence?.reason==='NOT_ELIGIBLE'?'Điểm vùng chưa đạt50; LONG màu xanh thường.':'Chưa đủ dữ liệu Position ratio để xác nhận nhóm tím; LONG màu xanh thường.'}]:[]),
 {name:'TRẠNG THÁI XÁC NHẬN',value:flow?'Có đủ dữ liệu nến1m/volume/taker. Màu xám nếu đang chờ nến sau phá nền, chưa đạt điều kiện hoặc nhịp đã bị hủy.':(missingTitles[e.flowDiagnostic?.reason]??'Chưa có dữ liệu xác nhận1m hợp lệ')+' · nến đóng '+n(e.flowDiagnostic?.bars)+'/21. Không đủ dữ liệu để đánh giá LONG/SHORT.'},
 {name:'GIÁ / VÙNG ĐÃ CHỐT',value:'MARK '+n(e.price)+'\nNền '+n(e.base.low)+' – '+n(e.base.high)+'\nCụm '+n(e.zone?.low)+' – '+n(e.zone?.high)+' · quét '+(e.direction==='UPPER'?'lên':'xuống')},
 {name:'NỀN ĐI NGANG 2 GIỜ',value:'Biên/ATR '+n(e.base.widthAtr)+' · efficiency '+n(e.base.efficiency)+'\nNến5m chốt '+new Date(e.base.asOf).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'})+' VN'},
 {name:'NẾN1m ĐÃ ĐÓNG',value:flow?'Volume '+n(flow.volumeX)+'× nền20 · mua chủ động '+n(flow.buyPct)+'%\nĐóng '+n(flow.c)+' · '+new Date(flow.end).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'})+' VN':'Thiếu dữ liệu nến1m/volume/taker hợp lệ; giữ màu xám.'},
 {name:'Ý NGHĨA MÀU / BINANCE',value:'Tím: LONG + Position ratio tăng + điểm vùng≥50. Đỏ: điều kiện cảnh báo SHORT. Xanh: điều kiện cảnh báo LONG. Xám: chờ hoặc chưa rõ hướng.\nChỉ quan sát; bộ phát hiện này không gửi lệnh Binance. Vùng vàng là ước lượng từ hai model, không xác nhận thanh lý thực.'},
 {name:'XEM COIN / BẢN GHI GỐC',value:'[Heatmap Model1/3](https://liquidity.nhathadev.trade/coinglass-heatmap-lab?symbol='+encodeURIComponent(e.symbol)+'&range=24h) · [Snapshot](https://liquidity.nhathadev.trade/api/range-liquidity-sweep?event='+encodeURIComponent(e.id)+')'}],footer:{text:RANGE_SWEEP_VERSION+' · OBSERVE ONLY'},timestamp:new Date(e.at).toISOString()}]};
 const embed=payload.embeds[0],entryIntro=rangeSweepEntryIntro(e);
 if(e.assessment?.version===RANGE_SWEEP_DECISION_VERSION&&e.assessment.eventId===e.id&&e.assessment.symbol===e.symbol&&e.assessment.side===e.side&&e.assessment.outcome==='SEND')embed.title+=' · ĐỒNG THUẬN TỔNG HỢP';
 if(entryIntro)embed.description=entryIntro+'\n\n'+embed.description;
 let used=embed.title.length+embed.description.length+embed.footer.text.length+embed.fields.reduce((sum,f)=>sum+f.name.length+f.value.length,0);
 const fields=[];
 for(const field of rangeSweepContextFields(e)){
  const room=Math.min(1024,5900-used-field.name.length);
  if(room<100)break;
  const value=field.value.length>room?field.value.slice(0,room-1)+'…':field.value;
  fields.push({...field,value});used+=field.name.length+value.length;
 }
 embed.fields.unshift(...fields);
 if(fields.length)embed.footer.text+=' · '+RANGE_SWEEP_CONTEXT_VERSION;
 return payload;
}
export function createRangeSweepDiscordSender({webhookUrl,fetchImpl=fetch}={}){
 if(!webhookUrl?.trim())return null;let u;try{u=new URL(webhookUrl.trim());}catch{throw Error('INVALID_RANGE_SWEEP_WEBHOOK');}
 if(u.protocol!=='https:'||!['discord.com','discordapp.com'].includes(u.hostname)||u.username||u.password||u.port||u.hash||u.search||!/^\/api\/webhooks\/\d+\/[^/]+$/.test(u.pathname))throw Error('INVALID_RANGE_SWEEP_WEBHOOK');
 return async e=>{try{const r=await fetchImpl(u.href,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(rangeSweepDiscordPayload(e)),signal:AbortSignal.timeout(8000)});return {sent:r.ok?1:0,httpStatus:r.status,failed:r.ok?0:1};}catch{return {sent:0,failed:1,error:'DISCORD_FAILED_OR_UNKNOWN'};}};
}
