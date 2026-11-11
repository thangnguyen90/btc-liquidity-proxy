import {SECOND_SWEEP_VERSION,SECOND_SWEEP_LABEL,SECOND_SWEEP_RULE,isSecondUpperSweep} from '../public/heatmap-second-sweep-model.js';
// In-memory causal MARK lifecycle. Never reconstruct a missing peak across restart/gap.
export class HeatmapSecondSweepTracker {
 constructor(){this.cycles=new Map();}
 reset(symbol){this.cycles.delete(symbol);}
 onMark(symbol,price,at){
  const c=this.cycles.get(symbol);if(!c)return;
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(at)||at<=c.lastAt)return;
  if(at-c.lastAt>SECOND_SWEEP_RULE.maxGapMs||at-c.firstAt>SECOND_SWEEP_RULE.maxAgeMs){this.reset(symbol);return;}
  c.maxGapMs=Math.max(c.maxGapMs,at-c.lastAt);c.lastAt=at;c.lastPrice=price;
  if(c.consumed)return;
  if(c.pulledBack){
   // A return to the old peak invalidates the "not yet exceeded" hypothesis.
   if(price>=c.previousPeak){c.consumed=true;return;}
   if(price<c.trough){c.trough=price;c.troughAt=at;}
  }else{
   if(price>=c.previousPeak){c.previousPeak=price;c.peakAt=at;c.trough=price;c.troughAt=at;}
   else if((c.previousPeak/c.baselinePrice-1)*100+1e-9>=SECOND_SWEEP_RULE.pumpPct
    &&(1-price/c.previousPeak)*100+1e-9>=SECOND_SWEEP_RULE.retracePct){c.pulledBack=true;c.trough=price;c.troughAt=at;}
  }
 }
 classify(e){
  if(e.kind!=='ALL_TRACKED_UPPER_SWEPT'||e.direction!=='UPPER')return null;
  let c=this.cycles.get(e.symbol);
  if(c&&(e.at<c.lastAt||e.at-c.lastAt>SECOND_SWEEP_RULE.maxGapMs||e.at-c.firstAt>SECOND_SWEEP_RULE.maxAgeMs))c=null;
  if(!c){
   this.cycles.set(e.symbol,{symbol:e.symbol,firstEventId:e.id,firstAt:e.at,baselinePrice:e.referencePrice,
    previousPeak:e.markPrice,peakAt:e.at,trough:e.markPrice,troughAt:e.at,lastPrice:e.markPrice,lastAt:e.at,maxGapMs:0,pulledBack:false,consumed:false});
   return null;
  }
  if(c.firstEventId===e.id||c.consumed||!c.pulledBack)return null;
  const s={version:SECOND_SWEEP_VERSION,label:SECOND_SWEEP_LABEL,symbol:e.symbol,firstEventId:c.firstEventId,firstAt:c.firstAt,
   baselinePrice:c.baselinePrice,previousPeak:c.previousPeak,peakAt:c.peakAt,trough:c.trough,troughAt:c.troughAt,classifiedAt:e.at,maxGapMs:c.maxGapMs,
   pumpPct:(c.previousPeak/c.baselinePrice-1)*100,retracementPct:(1-c.trough/c.previousPeak)*100,
   reboundPct:(e.markPrice/c.trough-1)*100,distanceBelowPeakPct:(1-e.markPrice/c.previousPeak)*100};
  if(!isSecondUpperSweep({...e,secondSweep:s}))return null;
  c.consumed=true;return s;
 }
}
