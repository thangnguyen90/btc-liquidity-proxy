import {validCirculatingMarketCap} from './pumpglassMarketCap.js';
export const PUMPGLASS_POSITION_SIZE_LEGACY_VERSION='PUMPGLASS_WHALE_POSITION_SIZE_DISCORD_V1_20261108';
export const PUMPGLASS_POSITION_SIZE_VERSION='PUMPGLASS_WHALE_POSITION_CAP_RATIO_DISCORD_V2_20261108';
export const PUMPGLASS_POSITION_SIZE_RULE=Object.freeze({smallBelowCapPct:0.1,largeFromCapPct:1,colorBasis:'SIGNAL_SIDE_WHALE_USD_DIV_CIRCULATING_MARKET_CAP',capBasis:'CIRCULATING_MARKET_CAP_USD',usesFdv:false,missingCapBlocksSignal:false,observeOnly:true,affectsOrders:false});
export const PUMPGLASS_POSITION_SIZE_TIERS=Object.freeze({
 SMALL:{title:'NHỎ',icon:'⚪',color:0x94a3b8},
 MEDIUM:{title:'VỪA',icon:'🟠',color:0xf59e0b},
 LARGE:{title:'LỚN',icon:'🟣',color:0x8b5cf6},
 UNKNOWN:{title:'CHƯA RÕ',icon:'❔',color:0x475569},
});
const usd=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=Number.MAX_SAFE_INTEGER?x:null;
const capPct=(value,cap)=>usd(value)!==null&&typeof cap==='number'&&Number.isFinite(cap)&&cap>0&&Number.isFinite(value/cap*100)?value/cap*100:null;
export function positionSizeTier(value,marketCapUsd){const p=capPct(value,marketCapUsd);return p===null?'UNKNOWN':p>=1?'LARGE':p>=.1?'MEDIUM':'SMALL';}
const legacyTier=value=>usd(value)===null?'UNKNOWN':value>=1000000?'LARGE':value>=100000?'MEDIUM':'SMALL';
export function whalePositionSizeSnapshot(token,{symbol,side,sourceAt,observedAt}={}){
 if(token?.symbol!==symbol||token.basis!=='whales'||!['LONG','SHORT'].includes(side)||!Number.isFinite(sourceAt)
  ||!Number.isFinite(observedAt)||token.scanned_at*1000!==sourceAt||sourceAt>observedAt||observedAt-sourceAt>900000)return null;
 const longUsd=usd(token.long?.size_usd),shortUsd=usd(token.short?.size_usd),signalUsd=side==='LONG'?longUsd:shortUsd;
 return {version:PUMPGLASS_POSITION_SIZE_VERSION,symbol,side,sourceAt,observedAt,basis:'whales',source:'PUMPGLASS_LIVE_TOKEN',
  longUsd,shortUsd,signalUsd,marketCap:null,capStatus:'CAP_NOT_LOADED',capEvaluatedAt:observedAt,
  longCapPct:null,shortCapPct:null,signalCapPct:null,tier:'UNKNOWN',observeOnly:true,affectsOrders:false};
}
export function attachWhalePositionMarketCap(size,cap,now){
 if(size?.version!==PUMPGLASS_POSITION_SIZE_VERSION||!validWhalePositionSize(size,size)||!Number.isFinite(now)||now<size.observedAt)return size;
 const s=structuredClone(size);s.capEvaluatedAt=now;
 const known=validCirculatingMarketCap(cap,s.symbol,now);s.marketCap=known?structuredClone(cap):null;
 s.capStatus=known?'OK':typeof cap?.status==='string'&&/^CAP_[A-Z_0-9]+$/.test(cap.status)?cap.status:'CAP_UNAVAILABLE';
 s.longCapPct=known?capPct(s.longUsd,cap.marketCapUsd):null;s.shortCapPct=known?capPct(s.shortUsd,cap.marketCapUsd):null;
 s.signalCapPct=s.side==='LONG'?s.longCapPct:s.shortCapPct;
 s.tier=positionSizeTier(s.signalUsd,known?cap.marketCapUsd:null);return s;
}
export function validWhalePositionSize(e,s){
 const base=s&&s.symbol===e.symbol&&s.side===e.side&&['LONG','SHORT'].includes(e.side)&&s.sourceAt===e.sourceAt&&s.observedAt===e.observedAt
  &&Number.isFinite(s.sourceAt)&&Number.isFinite(s.observedAt)&&s.sourceAt<=s.observedAt&&s.observedAt-s.sourceAt<=900000
  &&s.basis==='whales'&&s.source==='PUMPGLASS_LIVE_TOKEN'&&s.observeOnly===true&&s.affectsOrders===false
  &&[s.longUsd,s.shortUsd].every(x=>x===null||usd(x)!==null)&&s.signalUsd===(e.side==='LONG'?s.longUsd:s.shortUsd);
 if(!base)return false;
 if(s.version===PUMPGLASS_POSITION_SIZE_LEGACY_VERSION)return s.tier===legacyTier(s.signalUsd);
 if(s.version!==PUMPGLASS_POSITION_SIZE_VERSION||!Number.isFinite(s.capEvaluatedAt)||s.capEvaluatedAt<s.observedAt)return false;
 if(s.marketCap===null)return s.tier==='UNKNOWN'&&[s.longCapPct,s.shortCapPct,s.signalCapPct].every(p=>p===null);
 if(s.capStatus!=='OK'||!validCirculatingMarketCap(s.marketCap,e.symbol,s.capEvaluatedAt))return false;
 return s.longCapPct===capPct(s.longUsd,s.marketCap.marketCapUsd)&&s.shortCapPct===capPct(s.shortUsd,s.marketCap.marketCapUsd)
  &&s.signalCapPct===(e.side==='LONG'?s.longCapPct:s.shortCapPct)&&s.tier===positionSizeTier(s.signalUsd,s.marketCap.marketCapUsd);
}
const money=v=>v===null?'chưa có dữ liệu':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2}).format(v);
const percent=p=>p===null?'chưa tính được % cap':p>0&&p<.000001?'<0.000001% cap':`${p.toFixed(p>=1?2:p>=.01?4:6)}% cap`;
export function whalePositionSizePresentation(e){
 const s=validWhalePositionSize(e,e.positionSize)?e.positionSize:null;
 const modern=s?.version===PUMPGLASS_POSITION_SIZE_VERSION,c=modern?s.marketCap:null,selectedTier=modern?s.tier:'UNKNOWN';
 const tier=PUMPGLASS_POSITION_SIZE_TIERS[selectedTier];
 const sideRow=(side,value)=>`${side}: **${money(value)}** · ${percent(c?capPct(value,c.marketCapUsd):null)} · ${PUMPGLASS_POSITION_SIZE_TIERS[positionSizeTier(value,c?.marketCapUsd)].title}`;
 const lines=s?[sideRow('LONG',s.longUsd),sideRow('SHORT',s.shortUsd),`Phía tín hiệu ${e.side}: **${tier.icon} ${tier.title}** theo tỷ lệ vị thế/cap.`]
  :['Chưa có số USD trong snapshot nguồn; không suy quy mô từ tỷ trọng LONG/SHORT.'];
 if(s&&s.longUsd!==null&&s.shortUsd!==null){
  lines.push(`Tổng hai phía: **${money(s.longUsd+s.shortUsd)}**${c?' · '+percent(capPct(s.longUsd+s.shortUsd,c.marketCapUsd)):''}.`);
  const larger=s.longUsd>s.shortUsd?'LONG':s.shortUsd>s.longUsd?'SHORT':null,lo=Math.min(s.longUsd,s.shortUsd),hi=Math.max(s.longUsd,s.shortUsd);
  if(larger&&lo>0)lines.push(Number.isFinite(hi/lo)?`${larger} lớn gấp **${(hi/lo).toFixed(2)}×** phía còn lại · chênh **${money(hi-lo)}**.`:`${larger} lớn hơn phía còn lại · chênh **${money(hi-lo)}**; không tính bội số do mẫu quá nhỏ.`);
  else if(larger)lines.push(`${larger} có ${money(hi)}; phía còn lại 0 USD, không tính bội số.`);
  else lines.push('Hai phía có cùng quy mô USD.');
 }
 lines.push('Chỉ là mẫu cá voi của nguồn, không phải toàn sàn hoặc USD của Smart.');
 const capLines=c?[`Vốn hóa lưu hành: **${money(c.marketCapUsd)}**.`,`CoinGecko · mã ${c.providerId} · nguồn ${new Date(c.sourceAt).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false})} VN.`]
  :[!modern&&s?'Snapshot cũ chỉ lưu USD; chưa có cap tại thời điểm cảnh báo.':'Chưa có vốn hóa lưu hành mới và khớp đúng coin; giữ số USD, chưa xếp lớn/nhỏ theo cap.'];
 capLines.push('Quy ước theo phía tín hiệu: NHỎ <0,1% · VỪA 0,1–<1% · LỚN ≥1% cap. Không dùng FDV.','So quy mô vị thế với cap, không phải % sở hữu token hoặc % OI.');
 const field={name:'QUY MÔ VỊ THẾ CÁ VOI (USD)',value:lines.join('\n')},capField={name:'VỐN HÓA LƯU HÀNH ĐỐI CHIẾU',value:capLines.join('\n')};
 return {tier:selectedTier,title:tier.title,color:tier.color,field,capField,fields:[field,capField]};
}
