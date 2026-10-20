// Top-trader ACCOUNT ratio, not position ratio, global ratio or OI.
export const RISING_VOLUME_RATIO_VERSION='RISING_VOLUME_TOP_ACCOUNT_FLAT_BREAK_V1_20261011';
export const RISING_VOLUME_RATIO_RULE=Object.freeze({period:'5m',flatMinutes:30,flatPct:5,shiftPct:10,transitionMinutes:30});
const STEP=300000;
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
export function evaluateRisingVolumeRatio(rows,{side,asOf}={}) {
  const fail=reason=>({version:RISING_VOLUME_RATIO_VERSION,pass:false,reason});
  if(!['LONG','SHORT'].includes(side)||!Number.isFinite(asOf)||!Array.isArray(rows))return fail('RATIO_DATA_MISSING');
  const curve=rows.map(r=>({timestamp:Number(r.timestamp),longShortRatio:Number(r.longShortRatio)}));
  if(curve.some((r,i)=>!Number.isFinite(r.timestamp)||r.timestamp%STEP!==0||!(r.longShortRatio>0)
    ||!Number.isFinite(r.longShortRatio)||(i&&r.timestamp<=curve[i-1].timestamp)))return fail('RATIO_DATA_INVALID');
  const eligible=curve.filter(r=>r.timestamp<=asOf),last=eligible.at(-1);
  if(!last||asOf-last.timestamp>=STEP)return fail('RATIO_STALE');
  if(eligible.length<8)return fail('RATIO_HISTORY_MISSING');
  for(let steps=1;steps<=6;steps++) {
    const end=eligible.length-1-steps,start=end-6;
    if(start<0)continue;
    const segment=eligible.slice(start);
    if(segment.some((r,i)=>i&&r.timestamp-segment[i-1].timestamp!==STEP))continue;
    const base=eligible.slice(start,end+1),values=base.map(r=>r.longShortRatio),center=median(values);
    const low=Math.min(...values),high=Math.max(...values),widthPct=(high-low)/center*100;
    const changePct=(last.longShortRatio/center-1)*100;
    if(widthPct<=5+1e-9&&(side==='LONG'?changePct<=-10+1e-9&&last.longShortRatio<low:changePct>=10-1e-9&&last.longShortRatio>high))
      return {version:RISING_VOLUME_RATIO_VERSION,pass:true,reason:'PASS',side,asOf,
        baselineStartAt:base[0].timestamp,baselineEndAt:base.at(-1).timestamp,latestAt:last.timestamp,
        baselineMedian:center,latestRatio:last.longShortRatio,widthPct,changePct,transitionMinutes:steps*5};
  }
  return fail('RATIO_NO_FLAT_THEN_BREAK');
}
export function buildRisingVolumeRatioProof(event,rows,fetchedAt) {
  const s=event?.snapshot;
  const curve=Array.isArray(rows)?rows.filter(r=>Number(r.timestamp)<=s?.closedAt)
    .map(r=>({timestamp:Number(r.timestamp),longShortRatio:Number(r.longShortRatio)})):[];
  const result=evaluateRisingVolumeRatio(curve,{side:s?.side,asOf:s?.closedAt});
  return {version:RISING_VOLUME_RATIO_VERSION,source:'AT_ENTRY',symbol:s?.symbol,signalId:event?.id,
    side:s?.side,period:'5m',asOf:s?.closedAt,fetchedAt,rows:curve,...result};
}
export function validRisingVolumeRatioProof(event,proof,now) {
  const s=event?.snapshot;
  if(!proof||proof.version!==RISING_VOLUME_RATIO_VERSION||proof.source!=='AT_ENTRY'||proof.period!=='5m'
    ||proof.symbol!==s?.symbol||proof.signalId!==event.id||proof.side!==s.side||proof.asOf!==s.closedAt
    ||!Number.isFinite(proof.fetchedAt)||proof.fetchedAt<s.observedAt||proof.fetchedAt>now
    ||now-proof.fetchedAt>20000||!Array.isArray(proof.rows)||proof.rows.length>20
    ||proof.rows.some(r=>Number(r.timestamp)>s.closedAt))return false;
  const rebuilt=evaluateRisingVolumeRatio(proof.rows,{side:s.side,asOf:s.closedAt});
  return rebuilt.pass&&Object.entries(rebuilt).every(([key,value])=>proof[key]===value);
}
