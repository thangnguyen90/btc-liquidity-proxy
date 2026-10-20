import {PUMP_TURN_VERSION} from '../public/pump-turn-model.js';
export const PUMP_TURN_NEAR_PUSH_VERSION='PUMP_TURN_NEAR_SHORT_MANAGED_PUSH_V1_20261018';
export const PUMP_TURN_NEAR_PUSH_TYPE='PUMP_TURN_NEAR_SHORT';
export const PUMP_TURN_NEAR_PUSH_ROUTE=Object.freeze({
 id:'signal-pump-turn-near-short-v1',transport:'SIGNAL_EVENT',signalType:PUMP_TURN_NEAR_PUSH_TYPE,eventPrefix:'pump-turn-near:',
 keys:[PUMP_TURN_NEAR_PUSH_TYPE],label:'GẦN VÙNG SHORT · CHƯA XÁC NHẬN',category:'Điểm bơm / xả',
 description:'Push trực tiếp cho tín hiệu SHORT mới, không phụ thuộc Discord hoặc kết quả vào Binance. Mở đúng tín hiệu; tuân thủ giờ yên lặng, không gửi lại lịch sử.',
 targetPath:'/pump-turn-watch#signals',defaultEnabled:false,sharedWebhook:false,
});
const f=n=>Number(n.toPrecision(8)).toString();
export function pumpTurnNearShortPushPayload(e,now=Date.now()){
 if(!e||e.version!==PUMP_TURN_VERSION||e.side!=='SHORT'||e.interval!=='5m'||!['NEAR','IN_ZONE'].includes(e.state)||!e.contextEligible||!e.alertEligible
  ||!String(e.id??'').startsWith('pump-turn-near:pump-turn:'+e.symbol+':SHORT:')||!/^[\p{L}\p{N}]{1,32}USDT$/u.test(e.symbol??'')
  ||![e.observedAt,e.liveAt,e.expiresAt,e.livePrice,e.zoneLow,e.zoneHigh,e.distancePct].every(Number.isFinite)
  ||e.observedAt>now||now-e.observedAt>30000||e.liveAt>now+1000||now-e.liveAt>30000||e.expiresAt<=now
  ||Math.min(e.livePrice,e.zoneLow)<=0||e.zoneHigh<e.zoneLow||e.distancePct<0)return null;
 return {version:PUMP_TURN_NEAR_PUSH_VERSION,signalType:PUMP_TURN_NEAR_PUSH_TYPE,eventId:e.id,side:'SHORT',symbol:e.symbol,interval:'5m',
  title:`🔴 ${e.symbol} · GẦN VÙNG SHORT · CHƯA XÁC NHẬN`,
  body:`Giá ${f(e.livePrice)} · vùng ${f(e.zoneLow)}–${f(e.zoneHigh)} · cách ${f(e.distancePct)}%. Chưa xác nhận nến; không phải thông báo đã khớp lệnh.`,
  url:'/pump-turn-watch?signal='+encodeURIComponent(e.id)+'#signals',notifiedAt:e.observedAt,expiresAt:Math.min(e.expiresAt,e.observedAt+30000)};
}
