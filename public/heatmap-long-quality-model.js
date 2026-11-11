export const LONG_QUALITY_VERSION='HEATMAP_LOWER_LONG_QUALITY_V1_20261026';
export const LONG_QUALITY_LABELS=Object.freeze({GOOD:'LOWER_SWEEP_LONG_GOOD',BAD:'LOWER_SWEEP_LONG_BAD',UNKNOWN:'LOWER_SWEEP_LONG_UNKNOWN'});
export const LONG_QUALITY_RULE=Object.freeze({maxOvershootPct:.1,maxRsi:60,minRatioChange1h:-5,minOiChange1h:-2,goodMarginUsdt:5,badMarginUsdt:1,step:300000,bars:240});
export const LONG_QUALITY_TITLES=Object.freeze({GOOD:'LONG · NHÓM TỐT (THỬ NGHIỆM)',BAD:'LONG · NHÓM XẤU (THỬ NGHIỆM)',UNKNOWN:'LONG · CHƯA ĐÁNH GIÁ'});
export const longQualityKey=label=>[LONG_QUALITY_LABELS.GOOD,LONG_QUALITY_LABELS.BAD].includes(label)?'heatmap-long-quality:'+label:null;
export function longQualityChecks(f={}){return [
 {key:'OVERSHOOT',label:'Xuyên mép cụm <0,1%',value:f.overshootPct,pass:Number.isFinite(f.overshootPct)?f.overshootPct>=0&&f.overshootPct<.1:null},
 {key:'RSI',label:'RSI14 nến5m <60',value:f.rsi14,pass:Number.isFinite(f.rsi14)?f.rsi14>=0&&f.rsi14<60:null},
 {key:'RATIO',label:'Ratio tài khoản Δ1h ≥−5%',value:f.ratioChange1h,pass:Number.isFinite(f.ratioChange1h)?f.ratioChange1h>=-5-1e-9:null},
 {key:'OI',label:'OI lượng hợp đồng Δ1h ≥−2%',value:f.oiChange1h,pass:Number.isFinite(f.oiChange1h)?f.oiChange1h>=-2-1e-9:null},
 ];}
export function longQualityGrade(features){const c=longQualityChecks(features);return c.some(x=>x.pass===null)?'UNKNOWN':c.every(x=>x.pass)?'GOOD':'BAD';}
export function validLongQuality(e){
 const q=e?.longQuality,f=q?.features,s=q?.sources,step=300000;
 if(e?.kind!=='ALL_TRACKED_LOWER_SWEPT'||e.direction!=='LOWER'||q?.version!==LONG_QUALITY_VERSION||q.symbol!==e.symbol||q.eventId!==e.id
  ||q.asOf!==e.at||!Number.isFinite(q.evaluatedAt)||q.evaluatedAt<e.at-1000||q.evaluatedAt>e.at+30000||!f||!s)return false;
 if(!['GOOD','BAD','UNKNOWN'].includes(q.grade)||q.label!==LONG_QUALITY_LABELS[q.grade]||q.grade!==longQualityGrade(f))return false;
 const checks=longQualityChecks(f);if(JSON.stringify(q.checks)!==JSON.stringify(checks))return false;
 if(q.grade==='UNKNOWN')return q.proposedMarginUsdt===null;
 if(q.proposedMarginUsdt!==(q.grade==='GOOD'?5:1)||!Array.isArray(q.missing)||q.missing.length||!Number.isFinite(f.ratioLevel)||f.ratioLevel<=0||f.rsi14<0||f.rsi14>100
  ||f.overshootPct<0||f.overshootPct>=100||f.ratioChange1h<=-100||f.oiChange1h<=-100||s.ratioSource!=='BINANCE_TOP_TRADER_ACCOUNT_RATIO'||s.ratioOiLagMs!==step)return false;
 if(![s.coinClosedAt,s.ratioAt,s.oiAt,s.ratioFetchedAt,s.rawSavedAt].every(Number.isFinite)||s.coinBars!==240
  ||s.coinClosedAt!==Math.floor(e.at/step)*step-1||s.ratioAt!==Math.floor((e.at-step)/step)*step||s.oiAt!==s.ratioAt
  ||s.ratioFetchedAt>q.evaluatedAt||s.rawSavedAt>q.evaluatedAt||q.evaluatedAt-s.ratioFetchedAt>60000||s.rawSavedAt<e.at-120000)return false;
 if(!Array.isArray(e.zones)||!e.zones.length||e.zones.some(z=>!Number.isFinite(z.low)||z.low<=0))return false;
 const low=Math.min(...e.zones.map(z=>z.low)),overshoot=low>0?(1-e.markPrice/low)*100:NaN;
 return Number.isFinite(overshoot)&&Math.abs(overshoot-f.overshootPct)<1e-7;
}
export function longQualityTradeKey(trade){const e=trade?.heatmapSweepAtEntry;return validLongQuality(e)?longQualityKey(e.longQuality.label):null;}
export function longQualityClosedStats(fills={},label){
 const key=longQualityKey(label),all=Object.values(fills??{}).map(x=>x?.record??x),seen=new Set(),rows=[];
 for(const r of all){const id=r?.symbol+':'+(r?.clientOrderId??r?.orderId);
  if(!key||!r||!r.clientOrderId&&!r.orderId||seen.has(id)||r.isDca===true||r.signalSource!=='heatmap-full-sweep'||r.direction!=='LONG'||r.positionStatus!=='CLOSED'
   ||r.symbol!==r.heatmapSweepAtEntry?.symbol||!Number.isFinite(r.realizedRoePct)||longQualityTradeKey(r)!==key)continue;
  if(r.closeGroupId&&all.some(x=>x?.closeGroupId===r.closeGroupId&&(x.signalSource!=='heatmap-full-sweep'||x.direction!=='LONG'||x.isDca===true)))continue;
  seen.add(id);rows.push(r);
 }
 const avgRoePct=rows.length?rows.reduce((s,r)=>s+r.realizedRoePct,0)/rows.length:null;
 return {key,label,closed:rows.length,avgRoePct,eligible:rows.length>0&&avgRoePct>4};
}
