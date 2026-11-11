import {PUMP_TURN_VERSION,STEP} from './pump-turn-model.js';
export const PUMP_TURN_LONG_CONTEXT_VERSION='PUMP_TURN_LONG_CONTEXT_V1_20261028';
export const LONG_CONTEXT_TITLES=Object.freeze({STRONG_BUY:'LỰC MUA + VOLUME MẠNH',BUY_PRESSURE:'NGHIÊNG MUA · VOLUME CHƯA MẠNH',EXTENDED:'ĐÃ TĂNG MẠNH',MIXED:'LỰC MUA CHƯA RÕ',UNKNOWN:'THIẾU DỮ LIỆU'});
export const LONG_CONTEXT_COLORS=Object.freeze({STRONG_BUY:0x27b7c5,BUY_PRESSURE:0x5199ee,EXTENDED:0xf0ad45,MIXED:0xa58ce6,UNKNOWN:0x939ba8});
const fields=['version','side','state','asOf','expiresAt','observedAt','liveAt','livePrice','zoneLow','zoneHigh','gain60','preBuyPct','preVolumeX'];
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const inputs=e=>Object.fromEntries(fields.map(k=>[k,e?.[k]??null]));
function classify(i){
 const unknown=reason=>({label:'UNKNOWN',reason});
 if(i.version!==PUMP_TURN_VERSION||i.side!=='LONG'||!['NEAR','IN_ZONE'].includes(i.state))return unknown('INVALID_SOURCE_STATE');
 if(fields.filter(k=>!['version','side','state'].includes(k)).some(k=>!finite(i[k])))return unknown('MISSING_DATA');
 if(i.asOf%STEP!==STEP-1||i.asOf>=i.observedAt||i.expiresAt!==i.asOf+STEP+1||i.observedAt>=i.expiresAt||i.observedAt-i.liveAt>30000||i.liveAt>i.observedAt+1000)return unknown('STALE_OR_UNCLOSED');
 if(i.livePrice<=0||i.zoneLow<=0||i.zoneHigh<i.zoneLow||i.livePrice>i.zoneHigh||i.preBuyPct>100||i.preBuyPct<50||i.preVolumeX<1.2||i.gain60<4)return unknown('INVALID_OR_INELIGIBLE_CONTEXT');
 if(i.state==='IN_ZONE'&&i.livePrice<i.zoneLow||i.state==='NEAR'&&(i.livePrice>=i.zoneLow||(i.zoneLow/i.livePrice-1)*100>3+1e-9))return unknown('INVALID_ZONE_STATE');
 // Provisional descriptive thresholds, never fitted to future outcomes.
 if(i.gain60>=10)return {label:'EXTENDED',reason:'GAIN_1H_GE_10'};
 if(i.preBuyPct>=55&&i.preVolumeX>=2)return {label:'STRONG_BUY',reason:'BUY_GE_55_VOLUME_GE_2'};
 if(i.preBuyPct>=55)return {label:'BUY_PRESSURE',reason:'BUY_GE_55_VOLUME_LT_2'};
 return {label:'MIXED',reason:'BUY_50_TO_55'};
}
export function captureLongContext(e){const i=inputs(e);return {version:PUMP_TURN_LONG_CONTEXT_VERSION,eventId:e.id,symbol:e.symbol,observeOnly:true,affectsOrders:false,inputs:i,...classify(i)};}
export function validLongContext(e){
 const q=e?.longContext;if(!q||q.version!==PUMP_TURN_LONG_CONTEXT_VERSION||e.side!=='LONG'||q.eventId!==e.id||q.symbol!==e.symbol||!q.inputs||q.observeOnly!==true||q.affectsOrders!==false)return false;
 if(e.state!==q.inputs.state&&(!['EXPIRED','WAIT_PRICE'].includes(e.state)||!['NEAR','IN_ZONE'].includes(q.inputs.state)))return false;
 const i=inputs(e);if(fields.some(k=>k!=='state'&&i[k]!==q.inputs[k]))return false;
 const expected=classify(q.inputs);return q.label===expected.label&&q.reason===expected.reason;
}
export function longContextView(e){const valid=validLongContext(e),q=valid?e.longContext:null,i=q?.inputs;return {valid,label:q?.label??'UNKNOWN',title:LONG_CONTEXT_TITLES[q?.label??'UNKNOWN'],gain60:i?.gain60??null,buyPct:i?.preBuyPct??null,volumeX:i?.preVolumeX??null,
 distancePct:finite(i?.zoneLow)&&finite(i?.livePrice)&&i.livePrice>0?Math.max(0,(i.zoneLow/i.livePrice-1)*100):null,
 note:!valid?'Chưa có bản phân loại hợp lệ tại lúc phát; không tính lại lịch sử.':'Nhãn thử nghiệm, chưa backtest; chưa xác nhận điểm vào LONG.'};}
