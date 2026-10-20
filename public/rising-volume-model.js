export const RISING_VOLUME_VERSION = 'RISING_VOLUME_V1_CLOSED_BASE_VOLUME_OBSERVE_20261008';
export const RISING_VOLUME_FRAMES = Object.freeze({'1m':60_000,'5m':300_000,'15m':900_000});
export const RISING_VOLUME_RULE = Object.freeze({requiredBars:28,baselineBars:20,recentBars:5,
  maRises:3,minVolumeRatio:1.5,minAboveBaseline:3,minPriceChangePct:0.25,minDirectionalBars:3});
export const RISING_VOLUME_PATTERN_VERSION='RISING_VOLUME_PATTERN_V2_1M_SUSTAINED_FLOW_20261008';
export const RISING_VOLUME_PATTERN_RULE=Object.freeze({interval:'1m',baselineBars:20,recentBars:10,requiredBars:30,
  maxAgeMs:70000,minMeanRatio:1.5,baselineFloorRatio:1.2,recentMedianFloorRatio:.5,
  minElevatedBars:8,minSpikeBaselineRatio:2,maxDropRetainRatio:.25,maxDominantShare:.35});
export const RISING_VOLUME_PATTERNS=Object.freeze(['SUSTAINED','BURSTY','OTHER']);
export const RISING_VOLUME_PATTERN_LABELS=Object.freeze({SUSTAINED:'Volume 1m liền mạch',BURSTY:'Volume 1m ngắt quãng',
  OTHER:'Kiểu 1m chưa rõ',UNKNOWN:'Thiếu dữ liệu 1m lúc quan sát'});
export const risingVolumePatternKey=pattern=>RISING_VOLUME_PATTERNS.includes(pattern)?`rising-volume:flow-1m:${pattern}`:null;
const finiteNumber=value=>value==null||value===''?NaN:Number(value);
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),middle=sorted.length/2;return(sorted[Math.floor(middle)]+sorted[Math.ceil(middle)-1])/2;};

// Descriptive split of already eligible signals, never a new signal/entry gate.
// The continuity is ALWAYS measured on 1m, not the signal's 5m/15m columns.
// Old larger-timeframe charts must never masquerade as 1m evidence.
export function classifyRisingVolumePattern(snapshot={}) {
  const rule=RISING_VOLUME_PATTERN_RULE,duration=60000;
  const unknown=reason=>({volumePatternVersion:RISING_VOLUME_PATTERN_VERSION,volumePattern:'UNKNOWN',volumePatternReason:reason,
    pattern1mBaseline:null,pattern1mMeanRatio:null,pattern1mFloor:null,pattern1mElevatedBars:null,
    pattern1mBars:rule.recentBars,pattern1mDropCount:null,pattern1mDominantShare:null,pattern1mClosedAt:null});
  const source=Array.isArray(snapshot.volume1mChart)?snapshot.volume1mChart:snapshot.interval==='1m'?snapshot.chart:[];
  const rows=Array.isArray(source)?source.slice(-rule.requiredBars):[];
  const observedAt=finiteNumber(snapshot.observedAt),closedAt=finiteNumber(rows.at(-1)?.closeTime);
  if(rows.length!==rule.requiredBars)return unknown('INSUFFICIENT_1M');
  if(!Number.isFinite(observedAt)||!Number.isFinite(closedAt)||closedAt>=observedAt)return unknown('INVALID_1M');
  if(observedAt-closedAt>rule.maxAgeMs)return unknown('STALE_1M');
  for(let i=0;i<rows.length;i++) {
    const r=rows[i],openTime=finiteNumber(r?.openTime),closeTime=finiteNumber(r?.closeTime),volume=finiteNumber(r?.volume);
    if(!Number.isFinite(openTime)||openTime%duration!==0||closeTime!==openTime+duration-1
      ||closeTime>=observedAt||r.isClosed===false||!Number.isFinite(volume)||volume<0
      ||(i&&openTime-finiteNumber(rows[i-1].openTime)!==duration))return unknown('INVALID_OR_GAP_1M');
  }
  const baseline=median(rows.slice(0,rule.baselineBars).map(r=>finiteNumber(r.volume)));
  const recent=rows.slice(-rule.recentBars).map(r=>finiteNumber(r.volume));
  const sum=recent.reduce((a,b)=>a+b,0),mean=sum/rule.recentBars,recentMedian=median(recent);
  if(!(baseline>0)||!Number.isFinite(sum)||!Number.isFinite(mean))return unknown('NO_BASELINE_1M');
  const floor=Math.max(baseline*rule.baselineFloorRatio,recentMedian*rule.recentMedianFloorRatio);
  const elevated=recent.filter(v=>v>=floor).length,ratio=mean/baseline;
  const dominantShare=sum>0?Math.max(...recent)/sum:0;
  const drops=recent.slice(1).filter((v,i)=>recent[i]>=Math.max(baseline*rule.minSpikeBaselineRatio,recentMedian)
    &&v<floor&&v/recent[i]<=rule.maxDropRetainRatio).length;
  // Mild dips/flat high columns are sustained. A peak followed by genuinely
  // weak volume is interrupted even when MA5 of larger candles looks smooth.
  const sustained=ratio>=rule.minMeanRatio&&elevated>=rule.minElevatedBars&&recent.at(-1)>=floor
    &&dominantShare<=rule.maxDominantShare&&drops===0;
  const type=drops>0?'BURSTY':sustained?'SUSTAINED':'OTHER';
  return {volumePatternVersion:RISING_VOLUME_PATTERN_VERSION,volumePattern:type,volumePatternReason:`${type}_1M`,
    pattern1mBaseline:baseline,pattern1mMeanRatio:ratio,pattern1mFloor:floor,pattern1mElevatedBars:elevated,
    pattern1mBars:rule.recentBars,pattern1mDropCount:drops,pattern1mDominantShare:dominantShare,pattern1mClosedAt:closedAt};
}

export function risingVolumePatternProjection(snapshot={}) {
  const pattern=classifyRisingVolumePattern(snapshot);
  const stamped=snapshot.volumePatternVersion===RISING_VOLUME_PATTERN_VERSION&&snapshot.volumePattern===pattern.volumePattern
    &&snapshot.volumePatternSource==='AT_DETECTION';
  return {...pattern,volumePatternSource:pattern.volumePattern==='UNKNOWN'?'UNKNOWN':stamped?'AT_DETECTION':'FROZEN_CHART_LEGACY'};
}

export function risingVolumeKey(interval,side) {
  return Object.hasOwn(RISING_VOLUME_FRAMES,interval) && ['LONG','SHORT'].includes(side)
    ? `rising-volume:${interval}:${side}` : null;
}

// Only an explicitly frozen observation can match; do not infer labels from
// today's price or attach a new label to historical trades by symbol alone.
export function risingVolumeTradeKey(trade={}) {
  const snapshot=trade.risingVolumeSnapshot;
  if (snapshot?.version!==RISING_VOLUME_VERSION || snapshot.observeOnly!==true
    || snapshot.side!==trade.side || !(Number(snapshot.closedAt)>0)
    || !(Number(snapshot.observedAt)>=Number(snapshot.closedAt))) return null;
  const rawOpenedAt=trade.openedAt??trade.entryTime;
  const openedAt=typeof rawOpenedAt==='number'?rawOpenedAt:Date.parse(rawOpenedAt??'');
  if (!Number.isFinite(openedAt) || openedAt<Number(snapshot.observedAt)) return null;
  return risingVolumeKey(snapshot.interval,snapshot.side);
}

export function risingVolumePatternTradeKey(trade={}) {
  const snapshot=trade.risingVolumeSnapshot;
  if(!risingVolumeTradeKey(trade)||snapshot.volumePatternVersion!==RISING_VOLUME_PATTERN_VERSION
    ||snapshot.volumePatternSource!=='AT_DETECTION')return null;
  const pattern=classifyRisingVolumePattern(snapshot);
  return snapshot.volumePattern===pattern.volumePattern?risingVolumePatternKey(pattern.volumePattern):null;
}
