import {PUMP_TURN_VERSION,STEP,plannedPumpZones} from './pump-turn-model.js';

export const SHORT_FLOW_VERSION='PUMP_TURN_SHORT_FLOW_MIRROR_V1_20261111';
export const SHORT_FLOW_COLORS=Object.freeze({STRONG_SELL:0xdc2626,UNKNOWN:0x939ba8});
const fields=['version','side','state','asOf','expiresAt','observedAt','liveAt','livePrice','zoneLow','zoneHigh','gain60','preBuyPct','preVolumeX'];
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const inputs=e=>Object.fromEntries(fields.map(k=>[k,e?.[k]??null]));

export function plannedShortFlowZone(symbol,rows){
  const pre=rows.slice(-72),base=plannedPumpZones(symbol,pre).find(p=>p.side==='SHORT');
  if(!base)return null;
  const zoneHigh=Math.min(...pre.slice(-12).map(b=>b.l))*.999;
  return {...base,id:'pump-turn-short-flow:'+symbol+':'+base.asOf,shortFlowOnly:true,
    zoneHigh,zoneLow:zoneHigh*.995,
    contextEligible:base.gain60<=-4&&base.gain60>-10&&base.preBuyPct<=45&&base.preVolumeX>=2,
    contextChecks:[
      {label:'Giảm từ 4% đến dưới 10% / 60 phút',pass:base.gain60<=-4&&base.gain60>-10,value:-base.gain60,unit:'%'},
      {label:'Taker bán 3 nến ≥55%',pass:base.preBuyPct!=null&&base.preBuyPct<=45,value:base.preBuyPct==null?null:100-base.preBuyPct,unit:'%'},
      {label:'Volume TB 3 nến ≥2× nền20',pass:base.preVolumeX>=2,value:base.preVolumeX,unit:'×'},
    ]};
}
function classify(i){
  if(i.version!==PUMP_TURN_VERSION||i.side!=='SHORT'||!['NEAR','IN_ZONE'].includes(i.state))return 'UNKNOWN';
  if(fields.filter(k=>!['version','side','state'].includes(k)).some(k=>!finite(i[k])))return 'UNKNOWN';
  if(i.asOf%STEP!==STEP-1||i.asOf>=i.observedAt||i.expiresAt!==i.asOf+STEP+1||i.observedAt>=i.expiresAt
    ||i.observedAt-i.liveAt>30000||i.liveAt>i.observedAt+1000)return 'UNKNOWN';
  if(i.livePrice<=0||i.zoneLow<=0||i.zoneHigh<i.zoneLow||i.livePrice<i.zoneLow||i.preBuyPct<0||i.preBuyPct>45
    ||i.preVolumeX<2||i.gain60>-4||i.gain60<=-10)return 'UNKNOWN';
  if(i.state==='IN_ZONE'&&i.livePrice>i.zoneHigh||i.state==='NEAR'&&(i.livePrice<=i.zoneHigh||(1-i.zoneHigh/i.livePrice)*100>3+1e-9))return 'UNKNOWN';
  return 'STRONG_SELL';
}
export function captureShortFlowContext(e){
  const i=inputs(e);
  return {version:SHORT_FLOW_VERSION,eventId:e.id,symbol:e.symbol,observeOnly:true,affectsOrders:false,inputs:i,label:classify(i)};
}
export function shortFlowContextView(e){
  const q=e?.shortFlowContext;
  const valid=e?.shortFlowOnly===true&&q?.version===SHORT_FLOW_VERSION&&q.eventId===e.id&&q.symbol===e.symbol
    &&q.observeOnly===true&&q.affectsOrders===false&&q.inputs
    &&fields.every(k=>k==='state'&&['EXPIRED','WAIT_PRICE'].includes(e.state)?true:inputs(e)[k]===q.inputs[k])
    &&q.label===classify(q.inputs);
  const i=valid?q.inputs:null,label=valid?q.label:'UNKNOWN';
  return {valid:!!valid,label,title:label==='STRONG_SELL'?'LỰC BÁN + VOLUME MẠNH':'THIẾU DỮ LIỆU',
    gain60:i?.gain60??null,buyPct:i?.preBuyPct??null,volumeX:i?.preVolumeX??null,dropPct:null,
    note:'Theo dõi giá gần đáy 12 nến. Còn chờ giá phá vùng và phản ứng sau phá.'};
}
