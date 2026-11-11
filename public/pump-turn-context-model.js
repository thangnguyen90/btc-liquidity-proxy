import {PUMP_TURN_VERSION,STEP,plannedPumpZones,livePumpZone} from './pump-turn-model.js';

export const PUMP_TURN_CONTEXT_VERSION='PUMP_TURN_NEAR_CONTEXT_V1_20261028';
export const PUMP_TURN_CONTEXT_TITLES=Object.freeze({SELL_PRESSURE:'NGHIÊNG BÁN',BUY_PRESSURE:'CÒN LỰC MUA',DEEP_DROP:'ĐÃ GIẢM SÂU',MIXED:'HỖN HỢP',UNKNOWN:'THIẾU DỮ LIỆU'});
export const PUMP_TURN_CONTEXT_COLORS=Object.freeze({SELL_PRESSURE:0x27b7c5,BUY_PRESSURE:0x5199ee,DEEP_DROP:0xf0ad45,MIXED:0xa58ce6,UNKNOWN:0x939ba8});
export const pumpTurnContextKey=label=>Object.hasOwn(PUMP_TURN_CONTEXT_TITLES,label)?'pump-turn-context:'+label:null;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const fields=['version','side','state','observedAt','asOf','expiresAt','liveAt','livePrice','peak','peakAt','pump6h','preBuyPct','preVolumeX','gain60','zoneLow','zoneHigh'];
const inputOf=e=>Object.fromEntries(fields.map(k=>[k,e?.[k]??null]));
const unknown=reason=>({label:'UNKNOWN',flow:'UNKNOWN',deepDrop:null,reasons:[reason]});

// Same V1 thresholds as the offline experiment. Never reads results or later bars.
function classify(e){
 if(fields.filter(k=>!['version','side','state'].includes(k)).some(k=>!finite(e[k])))return unknown('MISSING_PRE_EVENT_DATA');
 if(e.version!==PUMP_TURN_VERSION||e.side!=='SHORT'||!['NEAR','IN_ZONE'].includes(e.state))return unknown('UNSUPPORTED_SOURCE_OR_STATE');
 if(e.asOf>=e.observedAt||e.asOf%STEP!==STEP-1||e.observedAt>=e.expiresAt||e.expiresAt!==e.asOf+STEP+1)return unknown('UNCLOSED_OR_EXPIRED_PLAN');
 if(e.observedAt-e.liveAt>30000||e.liveAt>e.observedAt+1000)return unknown('STALE_OR_FUTURE_TICK');
 if(e.livePrice<=0||e.peak<=0||e.peakAt>e.asOf||e.peakAt%STEP!==0||e.peakAt<e.asOf+1-72*STEP||e.pump6h<15||e.preBuyPct<0||e.preBuyPct>100||e.preVolumeX<0||e.zoneLow<=0||e.zoneHigh<e.zoneLow)return unknown('INVALID_CONTEXT');
 if(e.livePrice<e.zoneLow||e.livePrice>e.peak||e.livePrice<e.peak*.8)return unknown('INVALID_LIVE_ZONE_OR_PEAK');
 if(e.state==='IN_ZONE'&&(e.livePrice<e.zoneLow||e.livePrice>e.zoneHigh)||e.state==='NEAR'&&e.livePrice<=e.zoneHigh)return unknown('INCONSISTENT_ZONE_STATE');
 const deepDrop=e.livePrice<=e.peak*.9;
 const flow=e.preBuyPct>=50&&e.gain60>0?'BUY_PRESSURE':e.preBuyPct<=45&&e.preVolumeX>=1&&e.gain60<0?'SELL_PRESSURE':'MIXED';
 return {label:deepDrop?'DEEP_DROP':flow,flow,deepDrop,reasons:[...(deepDrop?['DROP_GE_10']:[]),flow]};
}
export function capturePumpTurnContext(e){
 const inputs=inputOf(e);
 return {version:PUMP_TURN_CONTEXT_VERSION,eventId:e.id,symbol:e.symbol,observedAt:e.observedAt,asOf:e.asOf,
  observeOnly:true,affectsOrders:false,inputs,...classify(inputs)};
}
export function validPumpTurnContext(e){
 const q=e?.nearContext;
 if(!q||q.version!==PUMP_TURN_CONTEXT_VERSION||e.side!=='SHORT'||q.eventId!==e.id||q.symbol!==e.symbol||!finite(q.observedAt)||q.observedAt!==e.observedAt||q.asOf!==e.asOf||q.observeOnly!==true||q.affectsOrders!==false||!q.inputs)return false;
 if(e.state!==q.inputs.state&&(!['EXPIRED','WAIT_PRICE'].includes(e.state)||!['NEAR','IN_ZONE'].includes(q.inputs.state)))return false;
 // The UI can mark a frozen row EXPIRED/WAIT_PRICE later. That does not change
 // the original classification; all price and candle inputs must still match.
 if(fields.some(k=>k!=='state'&&q.inputs[k]!==inputOf(e)[k]))return false;
 const expected=classify(q.inputs);
 return ['label','flow','deepDrop'].every(k=>q[k]===expected[k])&&JSON.stringify(q.reasons)===JSON.stringify(expected.reasons);
}
export function pumpTurnContextView(e){
 const valid=validPumpTurnContext(e),q=valid?e.nearContext:null,i=q?.inputs;
 return {valid,label:q?.label??'UNKNOWN',title:PUMP_TURN_CONTEXT_TITLES[q?.label??'UNKNOWN'],flow:q?.flow??'UNKNOWN',
  dropPct:finite(i?.livePrice)&&finite(i?.peak)&&i.peak>0?(1-i.livePrice/i.peak)*100:null,
  buyPct:i?.preBuyPct??null,volumeX:i?.preVolumeX??null,gain60:i?.gain60??null,
  note:!valid?'Chưa có bản phân loại hợp lệ tại lúc phát; không tính lại lịch sử.':q.label==='UNKNOWN'?'Thiếu hoặc không hợp lệ dữ liệu trước cảnh báo.':'Nhãn bối cảnh, chưa xác nhận điểm vào lệnh.'};
}
export function pumpTurnContextTradeKey(r){
 const e=r?.pumpTurnNearAtEntry;
 if(r?.signalSource!=='pump-turn-near-short'||r.direction!=='SHORT'||r.symbol!==e?.symbol||r.pumpTurnNearSignalId!==e?.id||!String(r.clientOrderId??'').startsWith('ptns_')||!r.orderId||!validPumpTurnContext(e))return null;
 // Audited fills carry the original 72 closed bars. Replay the context fields,
 // rather than accepting an arbitrary label copied into a CLOSED record.
 const rows=e.preRows;
 if(!Array.isArray(rows)||rows.length!==72||rows.some((b,j)=>!['t','end','o','h','l','c','q','v','buy'].every(k=>finite(b?.[k]))||b.t%STEP!==0||b.end!==b.t+STEP-1||b.end>=e.observedAt||Math.min(b.o,b.h,b.l,b.c)<=0||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c)||b.q<0||b.v<0||b.buy<0||b.buy>b.q*1.000001||j&&b.t!==rows[j-1].t+STEP))return null;
 const p=plannedPumpZones(e.symbol,rows).find(p=>p.side==='SHORT');
 if(!p||e.id!=='pump-turn-near:'+p.id||!['asOf','expiresAt','zoneLow','zoneHigh','peak','peakAt','pump6h','gain60','preVolumeX','preBuyPct'].every(k=>p[k]===e[k]))return null;
 if(!finite(e.nearPct)||e.nearPct<.1||e.nearPct>3||e.observeOnly!==true)return null;
 const live=livePumpZone(p,{price:e.livePrice,at:e.liveAt},e.observedAt,e.nearPct);
 if(!live.alertEligible||live.state!==e.state)return null;
 return pumpTurnContextKey(e.nearContext.label);
}
export function pumpTurnContextClosedStats(fills={},label){
 const key=pumpTurnContextKey(label),all=Object.values(fills??{}).map(x=>x?.record??x),seen=new Set(),rows=[];
 if(!key)return {key:null,label,closed:0,avgRoePct:null,eligible:false,observeOnly:true,affectsOrders:false};
 for(const r of all){
  if(!r||r.signalSource!=='pump-turn-near-short'||r.isDca===true||r.positionStatus!=='CLOSED'||!finite(r.realizedRoePct)||!finite(r.netRealizedPnlUsdt)||!r.closeGroupId||pumpTurnContextTradeKey(r)!==key)continue;
  const id=r.symbol+':'+r.orderId;if(seen.has(id))continue;
  if(all.some(x=>x?.closeGroupId===r.closeGroupId&&(x.isDca===true||pumpTurnContextTradeKey(x)!==key)))continue;
  seen.add(id);rows.push(r);
 }
 const avgRoePct=rows.length?rows.reduce((s,r)=>s+r.realizedRoePct,0)/rows.length:null;
 return {key,label,closed:rows.length,avgRoePct,eligible:!!key&&rows.length>0&&avgRoePct>4,observeOnly:true,affectsOrders:false};
}
