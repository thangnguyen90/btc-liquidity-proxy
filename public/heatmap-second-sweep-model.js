export const SECOND_SWEEP_VERSION='HEATMAP_SECOND_UPPER_BELOW_PEAK_V1_20261025';
export const SECOND_SWEEP_LABEL='SECOND_UPPER_BELOW_PEAK';
export const SECOND_SWEEP_KEY='heatmap-sweep:'+SECOND_SWEEP_LABEL;
export const SECOND_SWEEP_TITLE='QUÉT LẦN 2 SAU BƠM · CHƯA VƯỢT ĐỈNH CŨ';
export const SECOND_SWEEP_RULE=Object.freeze({pumpPct:10,retracePct:5,reboundPct:2,maxAgeMs:86400000,maxGapMs:10000,marginUsdt:10});
const near=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<1e-7;
export function isSecondUpperSweep(e){
 const s=e?.secondSweep;
 return e?.kind==='ALL_TRACKED_UPPER_SWEPT'&&e.direction==='UPPER'&&s?.version===SECOND_SWEEP_VERSION&&s.label===SECOND_SWEEP_LABEL
  &&s.symbol===e.symbol&&s.firstEventId!==e.id&&typeof s.firstEventId==='string'&&s.firstEventId.length>0
  &&['firstAt','baselinePrice','previousPeak','peakAt','trough','troughAt','classifiedAt','pumpPct','retracementPct','reboundPct','distanceBelowPeakPct','maxGapMs'].every(k=>Number.isFinite(s[k]))
  &&s.baselinePrice>0&&s.trough>0&&s.firstAt>0&&s.firstAt<=s.peakAt&&s.peakAt<s.troughAt&&s.troughAt<e.at&&s.classifiedAt===e.at
  &&e.at-s.firstAt<=SECOND_SWEEP_RULE.maxAgeMs&&s.maxGapMs>0&&s.maxGapMs<=SECOND_SWEEP_RULE.maxGapMs
  &&e.markPrice<s.previousPeak&&e.markPrice>s.trough
  &&near(s.pumpPct,(s.previousPeak/s.baselinePrice-1)*100)&&s.pumpPct+1e-9>=SECOND_SWEEP_RULE.pumpPct
  &&near(s.retracementPct,(1-s.trough/s.previousPeak)*100)&&s.retracementPct+1e-9>=SECOND_SWEEP_RULE.retracePct
  &&near(s.reboundPct,(e.markPrice/s.trough-1)*100)&&s.reboundPct+1e-9>=SECOND_SWEEP_RULE.reboundPct
  &&near(s.distanceBelowPeakPct,(1-e.markPrice/s.previousPeak)*100);
}
export function secondSweepTradeKey(trade){return isSecondUpperSweep(trade?.heatmapSweepAtEntry)?SECOND_SWEEP_KEY:null;}
// Only realized CLOSED Binance records, deduplicated by opening order identity.
export function secondSweepClosedStats(fills={}){
 const seen=new Set(),roes=[];
 for(const item of Object.values(fills??{})){
  const r=item?.record??item,id=r?.clientOrderId??r?.orderId,key=String(r?.symbol)+':'+String(id);
  if(!id||seen.has(key)||r.symbol!==r.heatmapSweepAtEntry?.symbol||r.signalSource!=='heatmap-full-sweep'||r.direction!=='SHORT'||r.positionStatus!=='CLOSED'
   ||!secondSweepTradeKey(r)||!Number.isFinite(r.realizedRoePct))continue;
  seen.add(key);roes.push(r.realizedRoePct);
 }
 const avgRoePct=roes.length?roes.reduce((a,b)=>a+b,0)/roes.length:null;
 return {key:SECOND_SWEEP_KEY,closed:roes.length,avgRoePct,eligible:roes.length>0&&avgRoePct>4};
}
