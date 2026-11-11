import {RISING_VOLUME_CONTEXT_VERSION} from './risingVolumeContext.js';

export const RISING_VOLUME_ALIGNED_VERSION='RISING_VOLUME_1M_ALIGNED_MARKET_2USDT_3X_TP5_SL20_V1_20261109';
export const ALIGNED_ENTRY_STEP_MS=300000;
export const ALIGNED_ENTRY_GRACE_MS=20000;
export const ALIGNED_MAX_RECEIPT_LAG_MS=70000;

export function alignedEntryBoundary(sentAt){
 return (Math.floor(sentAt/ALIGNED_ENTRY_STEP_MS)+1)*ALIGNED_ENTRY_STEP_MS;
}

export function buildRisingVolumeAlignedProof(event,context,sentAt){
 const s=event?.snapshot,m=context?.model,p=context?.position?.point;
 if(context?.version!==RISING_VOLUME_CONTEXT_VERSION||context.id!==event?.id||context.state!=='ALIGNED'
  ||context.symbol!==s?.symbol||context.side!==s?.side||!m||!p||context.at!==s.closedAt+1
  ||context.decisionAt!==context.at||context.position?.at!==context.at)return null;
 const target=s.side==='LONG'?m.above:m.below;
 const proof={version:RISING_VOLUME_ALIGNED_VERSION,eventId:event.id,symbol:s.symbol,side:s.side,decisionAt:context.at,
  price:m.price,modelAt:m.at,upperScore:m.upperScore,lowerScore:m.lowerScore,target:target?{low:target.low,high:target.high,overlapStrength:target.overlapStrength}:null,
  whale:{sourceAt:p.sourceAt,observedAt:p.observedAt,count:p.whaleCount,longPct:p.whaleLong,smartLongPct:p.smartLong},
  sentAt,entryAt:alignedEntryBoundary(sentAt)};
 return validRisingVolumeAlignedProof(event,proof,proof.entryAt)?proof:null;
}

export function validRisingVolumeAlignedProof(event,p,now){
 const s=event?.snapshot,w=p?.whale,z=p?.target;
 if(!s||p?.version!==RISING_VOLUME_ALIGNED_VERSION||p.eventId!==event.id||p.symbol!==s.symbol||p.side!==s.side
  ||!['LONG','SHORT'].includes(s.side)||p.decisionAt!==s.closedAt+1||p.price!==s.price
  ||![p.price,p.modelAt,p.upperScore,p.lowerScore,p.sentAt,p.entryAt,now].every(Number.isFinite)
  ||p.price<=0||p.modelAt>p.decisionAt||p.modelAt%ALIGNED_ENTRY_STEP_MS||p.decisionAt-p.modelAt>420000
  ||p.upperScore<0||p.lowerScore<0||p.sentAt<s.observedAt||p.sentAt-s.closedAt>ALIGNED_MAX_RECEIPT_LAG_MS
  ||p.entryAt!==alignedEntryBoundary(p.sentAt)||now<p.entryAt||now>p.entryAt+ALIGNED_ENTRY_GRACE_MS
  ||!w||![w.sourceAt,w.observedAt,w.count,w.longPct,w.smartLongPct].every(Number.isFinite)
  ||w.count<10||w.sourceAt<=0||w.sourceAt>w.observedAt||w.observedAt>p.decisionAt||p.decisionAt-w.sourceAt>900000
  ||w.longPct<0||w.longPct>100||w.smartLongPct<0||w.smartLongPct>100
  ||!z||![z.low,z.high,z.overlapStrength].every(Number.isFinite)||z.low<=0||z.high<=z.low||z.overlapStrength<35)return false;
 if(s.side==='LONG')return w.longPct>=60&&w.smartLongPct>=60&&p.upperScore>p.lowerScore&&z.low>p.price&&z.low<=p.price*1.05;
 return w.longPct<=40&&w.smartLongPct<=40&&p.lowerScore>p.upperScore&&z.high<p.price&&z.high>=p.price*.95;
}

