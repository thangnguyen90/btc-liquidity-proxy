import {earlyFlowContextView,isEarlyFlow,EARLY_LONG_VERSION,EARLY_SHORT_VERSION,EARLY_SHORT_POLICY} from '../public/pump-turn-early-short-model.js';
import {pumpTurnCombinedFields} from './pumpTurnCombinedContext.js';
import {SWEEP_PUMP_PHASE_TITLES} from './heatmapSweepPumpPhase.js';
import {PUMP_TURN_VERSION} from '../public/pump-turn-model.js';
import {pumpTurnContextView,PUMP_TURN_CONTEXT_COLORS,PUMP_TURN_CONTEXT_TITLES} from '../public/pump-turn-context-model.js';
import {longContextView,LONG_CONTEXT_COLORS} from '../public/pump-turn-long-context-model.js';
import {shortFlowContextView,SHORT_FLOW_COLORS} from '../public/pump-turn-short-flow-model.js';
export const PUMP_TURN_DISCORD_VERSION='PUMP_TURN_DISCORD_MODEL13_POSITION_V5_20261107';
export const PUMP_TURN_STRONG_FLOW_DISCORD_ROUTE_VERSION='PUMP_TURN_STRONG_FLOW_DISCORD_ROUTE_V5_EARLY_BOTH_20261111';
const f=n=>Number.isFinite(n)?Number(n.toPrecision(8)).toString():'—';
const discordContext=e=>isEarlyFlow(e)?earlyFlowContextView(e):e.shortFlowOnly?shortFlowContextView(e):e.side==='SHORT'?pumpTurnContextView(e):longContextView(e);
const strongShortFlow=c=>(c.label==='EARLY_SELL'||c.label==='STRONG_SELL'||c.label==='SELL_PRESSURE'||c.label==='MIXED')&&c.buyPct<=45&&c.volumeX>=2;
export function pumpTurnDiscordPayload(e){
  const c=discordContext(e);
  const strongShort=e.side==='SHORT'&&strongShortFlow(c);
  const n=x=>Number.isFinite(x)?x.toFixed(2):'—';
  const phase=e.side==='LONG'?e.longPumpPhase:null;
  const phaseTitle=SWEEP_PUMP_PHASE_TITLES[phase?.state];
  const rebound=phase?.state?.startsWith('REBOUND_');
  const phaseField=phaseTitle?{name:'NHỊP BƠM · 24H',value:'**'+phaseTitle+'**'+(rebound
    ?'\nĐỉnh cũ '+f(phase.features?.previousPeak)+' · giá báo '+(phase.features?.distanceBelowPeakPct>=0?'dưới':'trên')+' đỉnh '+n(Math.abs(phase.features?.distanceBelowPeakPct))+'%\nĐã điều chỉnh '+n(phase.features?.pullbackPct)+'% · hồi '+n(phase.features?.reboundPct)+'%.\nNhánh MARKET LONG chỉ xét bơm đầu.'
    :phase.state==='UNKNOWN'?'\nChưa đủ bối cảnh để xét MARKET LONG.':'')}:null;
  const payload={username:'Vùng dự tính bơm / xả',allowed_mentions:{parse:[]},embeds:[{
    title:`${e.side==='LONG'?'🟢':'🔴'} ${e.symbol} · GẦN VÙNG ${e.side} · CHƯA XÁC NHẬN${c?' · '+c.title:''}${strongShort&&c.label!=='STRONG_SELL'?' · LỰC BÁN + VOLUME MẠNH':''}${rebound?' · BƠM HỒI':''}`,color:(e.shortFlowOnly?SHORT_FLOW_COLORS:e.side==='LONG'?LONG_CONTEXT_COLORS:PUMP_TURN_CONTEXT_COLORS)[c.label],
    description:'Giá đang tiến gần mốc theo dõi của nến 5m tiếp theo. Các điều kiện nến kích hoạt vẫn cần chờ đóng. Quan sát thử nghiệm.',
    fields:[...(c?[{name:'PHÂN LOẠI BỐI CẢNH '+e.side,value:e.side==='LONG'?'**'+c.title+'**\nBiến động 1h: '+n(c.gain60)+'% · mua chủ động 15m: '+n(c.buyPct)+'%\nVol3/nền20: '+n(c.volumeX)+'× · cách mốc LONG: '+n(c.distancePct)+'%\n'+c.note:`**${c.title}**\nGiảm từ đỉnh: ${n(c.dropPct)}% · biến động 1h: ${n(c.gain60)}%\nMua chủ động 15m: ${n(c.buyPct)}% · vol3/nền20: ${n(c.volumeX)}×${strongShort?'\nBán chủ động 15m: '+n(100-c.buyPct)+'%':''}${c.label==='DEEP_DROP'?'\nDòng mua/bán: '+PUMP_TURN_CONTEXT_TITLES[c.flow]:''}\n${c.note}`}]:[]),
      ...(phaseField?[phaseField]:[]),
      {name:'GIÁ / VÙNG / KHOẢNG CÁCH',value:`Giá ${f(e.livePrice)}\nVùng ${f(e.zoneLow)} – ${f(e.zoneHigh)}\nCách vùng ${f(e.distancePct)}%`},
      {name:'BỐI CẢNH ĐÃ ĐÓNG',value:e.shortFlowOnly?`Giảm60m ${f(-e.gain60)}% · vol3/nền20 ${f(e.preVolumeX)}× · taker bán3 ${f(100-e.preBuyPct)}%`:e.side==='LONG'?`Tăng60m ${f(e.gain60)}% · vol3/nền20 ${f(e.preVolumeX)}× · taker mua3 ${f(e.preBuyPct)}%`:`Sóng tăng6h ${f(e.pump6h)}% · đỉnh ${f(e.peak)}`},
      {name:'CÒN CHỜ NẾN KÍCH HOẠT',value:e.shortFlowOnly?'Chờ nến 5m đóng dưới đáy 12 nến và kiểm tra phản ứng sau phá.':e.side==='LONG'?'Đóng vượt mốc; tăng60m≥8%, volume≥2×/≥100kUSDT, mua≥55%, đóng vùng trên30%.':'Nến đỏ đóng thủng mốc, trả3–20% từ đỉnh; volume≥1,5×/≥100kUSDT, bán≥55%.'},
      {name:'BINANCE',value:e.side==='LONG'&&e.marketRuleEnabled?'Rule LONG đang ON: xét MARKET 5 USDT ký quỹ ×'+(e.marketExecutionLeverage??3)+', TP +5% / SL −20% ROE từ giá khớp. Xem kết quả xử lý trên trang.':e.side==='SHORT'&&e.marketRuleEnabled?'Rule SHORT mới đang ON: xét MARKET 2 USDT margin ×'+(e.marketExecutionLeverage??5)+', TP/SL theo mốc giá gốc; ROE phụ thuộc đòn bẩy thực thi; còn kiểm tra giá/vị thế/cap. Xem kết quả trên trang, không coi Discord là đã khớp.':'Không cấp lệnh từ thông báo này; xem trạng thái rule trên trang.'},
      {name:'HẾT HIỆU LỰC (VN)',value:new Date(e.expiresAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false})},
      {name:'MỞ ĐÚNG TÍN HIỆU',value:`[Xem vùng và lý do](https://liquidity.nhathadev.trade/pump-turn-watch?signal=${encodeURIComponent(e.id)}#signals)`},
      {name:'HEATMAP MODEL 1 / 3',value:`[Mở hai model đúng coin · 24h](https://liquidity.nhathadev.trade/coinglass-heatmap-lab?symbol=${encodeURIComponent(e.symbol)}&range=24h)`}],
    footer:{text:PUMP_TURN_VERSION+' · '+PUMP_TURN_DISCORD_VERSION+' · Cảnh báo quan sát'},timestamp:new Date(e.observedAt).toISOString()
  }]};
  const embed=payload.embeds[0];
  if(isEarlyFlow(e)){
    const long=e.side==='LONG',pressure=long?'mua':'bán',movement=long?'Tăng':'Giảm';
    const level=long?e.zoneLow:e.zoneHigh,levelName=long?'kháng cự':'hỗ trợ';
    embed.title=(long?'🟦':'🟠')+' '+e.symbol+' · '+e.side+' SỚM · '+c.title;
    embed.color=long?0x38bdf8:0xf59e0b;
    embed.description='Áp lực '+pressure+' duy trì qua ít nhất hai lần quét cách nhau 10 giây. Nến 5 phút đang chạy và có thể đổi hướng trước khi đóng.';
    embed.fields=embed.fields.filter(field=>!['PHÂN LOẠI BỐI CẢNH '+e.side,'BỐI CẢNH ĐÃ ĐÓNG','CÒN CHỜ NẾN KÍCH HOẠT','BINANCE'].includes(field.name));
    embed.fields.unshift(
      {name:'LỰC '+pressure.toUpperCase()+' / VOLUME ĐANG HÌNH THÀNH',value:(long?'Mua':'Bán')+' chủ động '+n(long?c.buyPct:100-c.buyPct)+'% · volume theo thời gian '+n(c.volumeX)+'× nền 20 nến\nĐã chạy '+n(c.elapsedMs/1000)+' giây · khối lượng '+f(c.quote)+' USDT\n'+movement+' trong nến '+n(c.bodyPct)+'% / '+n(c.bodyAtr)+' ATR.'},
      {name:'ĐIỂM CẦN CHỜ',value:'Giá còn gần '+levelName+' của 3 nến trước. Chờ nến 5 phút đóng '+(long?'trên ':'dưới ')+f(level)+' rồi kiểm tra lại vùng.'},
      {name:'BINANCE',value:'Cảnh báo sớm dùng để quan sát.'});
    embed.footer.text+=' · '+(long?EARLY_LONG_VERSION:EARLY_SHORT_VERSION);
  }
  if(['WATCH_LONG','WATCH_SHORT'].includes(e.combinedContext?.state))embed.title+=' · BỐI CẢNH NGHIÊNG '+e.combinedContext.state.slice(6);else if(e.combinedContext?.state==='CONFLICT')embed.title+=' · BỐI CẢNH TRÁI CHIỀU';embed.title=embed.title.slice(0,256);let used=embed.title.length+embed.description.length+embed.footer.text.length+embed.fields.reduce((n,f)=>n+f.name.length+f.value.length,0);
  const extra=[];for(const field of pumpTurnCombinedFields(e.combinedContext)){const room=Math.min(1024,5900-used-field.name.length);if(room<100||embed.fields.length+extra.length>=25)break;const value=field.value.length>room?field.value.slice(0,room-1)+'…':field.value;extra.push({...field,value});used+=field.name.length+value.length;}embed.fields.unshift(...extra);return payload;
}
function pumpTurnWebhook(webhookUrl){
  if(!webhookUrl?.trim())return null;let u;
  try{u=new URL(webhookUrl.trim());}catch{throw Error('INVALID_PUMP_TURN_DISCORD');}
  if(u.protocol!=='https:'||!['discord.com','discordapp.com'].includes(u.hostname)||u.username||u.password||u.port||u.search||u.hash||!/^\/api\/webhooks\/\d+\/[^/]+$/.test(u.pathname))throw Error('INVALID_PUMP_TURN_DISCORD');
  return u;
}

export function createPumpTurnDiscordSender({webhookUrl,strongLongWebhookUrl,fetchImpl=fetch,getContext=null,now=Date.now}={}){
  const primary=pumpTurnWebhook(webhookUrl);
  if(!primary)return null;
  let secondary=null;
  try{
    const candidate=pumpTurnWebhook(strongLongWebhookUrl);
    if(candidate&&candidate.pathname.split('/')[3]!==primary.pathname.split('/')[3]){
      candidate.searchParams.set('wait','true');
      secondary=candidate;
    }
  }catch{} // A bad optional webhook must leave the primary sender available.
  const post=async (url,body)=>{
    try{
      const r=await fetchImpl(url.href,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body,signal:AbortSignal.timeout(8000)});
      return {sent:r.ok?1:0,failed:r.ok?0:1,httpStatus:r.status};
    }catch{return {sent:0,failed:1,error:'DISCORD_FAILED_OR_UNKNOWN'};}
  };
  const send=async e=>{
    const context=discordContext(e);
    const earlyExpired=()=>isEarlyFlow(e)&&(context.label==='UNKNOWN'||!Number.isFinite(e.observedAt)
      ||now()-e.observedAt>EARLY_SHORT_POLICY.sendMaxAgeMs||now()>=e.expiresAt);
    const earlyError={sent:0,failed:1,error:e.side==='LONG'?'EARLY_LONG_EXPIRED_OR_INVALID':'EARLY_SHORT_EXPIRED_OR_INVALID'};
    if(earlyExpired())return earlyError;
    let combinedContext=null,timer;
    try{if(getContext)combinedContext=await Promise.race([Promise.resolve().then(()=>getContext(structuredClone(e))),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),3200);})]);}catch{}finally{clearTimeout(timer);}
    if(earlyExpired())return earlyError;
    const body=JSON.stringify(pumpTurnDiscordPayload({...e,combinedContext}));
    const mirror=secondary&&(e.side==='LONG'?(context.label==='STRONG_BUY'||context.label==='EARLY_BUY'):e.side==='SHORT'&&strongShortFlow(context));
    const [result,extra]=await Promise.all([post(primary,body),mirror?post(secondary,body):null]);
    const deliveryKey=e.side==='SHORT'?'strongShortDelivery':'strongLongDelivery';
    return {...result,...(result.error?{}:{combinedContext}),...(extra?{[deliveryKey]:extra}:{})};
  };
  send.strongLongRoute={version:PUMP_TURN_STRONG_FLOW_DISCORD_ROUTE_VERSION,configured:!!secondary,sides:['LONG','SHORT']};
  return send;
}
