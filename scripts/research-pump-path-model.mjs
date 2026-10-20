export const VERSION='PUMP_PATH_WEEK_RESEARCH_V1_20261015';
export const SETTINGS=Object.freeze({pumpPct:8,lookbackMinutes:15,volumeX:3,volumeBaselineMinutes:60,minQuote5m:100000,cooldownMinutes:360,horizonMinutes:360,landmarkMinutes:3,keepRetrace:30,riskRetrace:50,continuationBeyondHighPct:2,reclaimFraction:.5,tpPricePct:2,slPricePct:6,leverage:5,feePerSidePct:.05,slippagePerSidePct:.02});
export const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const median=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2;};
const sum=a=>a.reduce((s,x)=>s+x,0);
const pct=(a,b)=>(b/a-1)*100;
const consecutive=rows=>rows.every((r,i)=>!i||r.t-rows[i-1].t===60000);
export function derivativeAsOf(rows,at,key){
  const field=key==='oi'?'sumOpenInterest':'longShortRatio';
  const usable=rows.filter(r=>Number.isFinite(Number(r.timestamp))&&Number(r.timestamp)<=at&&Number.isFinite(Number(r[field]))&&Number(r[field])>0).sort((a,b)=>a.timestamp-b.timestamp);
  const last=usable.at(-1),previous=usable.filter(r=>Number(r.timestamp)<=at-15*60000).at(-1);
  if(!last||at-last.timestamp>6*60000||!previous||at-15*60000-previous.timestamp>6*60000)return {ready:false,reason:'MISSING_OR_STALE'};
  return {ready:true,value:Number(last[field]),at:Number(last.timestamp),change15mPct:(Number(last[field])/Number(previous[field])-1)*100,samples:usable.length};
}
function ema(rows,p){if(rows.length<p)return null;let v=mean(rows.slice(0,p).map(r=>r.c));for(let i=p;i<rows.length;i++)v=rows[i].c*2/(p+1)+v*(1-2/(p+1));return v;}
function rsi(rows,p=14){if(rows.length<=p)return null;let up=0,dn=0;for(let i=1;i<=p;i++){const d=rows[i].c-rows[i-1].c;up+=Math.max(d,0)/p;dn+=Math.max(-d,0)/p;}for(let i=p+1;i<rows.length;i++){const d=rows[i].c-rows[i-1].c;up=(up*(p-1)+Math.max(d,0))/p;dn=(dn*(p-1)+Math.max(-d,0))/p;}return dn===0?100:100-100/(1+up/dn);}
export function detectPumps(rows,{start=-Infinity,end=Infinity}={}) {
  const output=[];let last=-Infinity;
  for(let i=80;i<rows.length;i++){
    const r=rows[i];if(r.end<start||r.end>=end||r.end-last<SETTINGS.cooldownMinutes*60000)continue;
    const context=rows.slice(i-79,i+1);if(!consecutive(context))continue;
    const b=rows[i-15].c,gain=pct(b,r.c),baseline=mean(rows.slice(i-75,i-15).map(x=>x.q)),q5=sum(rows.slice(i-4,i+1).map(x=>x.q));
    const breakout=Math.max(...rows.slice(i-60,i-15).map(x=>x.h));
    if(gain<SETTINGS.pumpPct||!(baseline>0)||q5/5/baseline<SETTINGS.volumeX||q5<SETTINGS.minQuote5m||r.c<=breakout*1.002)continue;
    output.push({index:i,at:r.end,base:b,breakout,volumeX:q5/5/baseline,gainPct:gain});last=r.end;
  }
  return output;
}
function point(rows,event,index){
  const wave=rows.slice(event.index-14,index+1),r=rows[index],high=Math.max(...wave.map(x=>x.h)),h0=Math.max(...rows.slice(event.index-14,event.index+1).map(x=>x.h));
  const v=sum(wave.map(x=>x.v)),avwap=sum(wave.map(x=>((x.h+x.l+x.c)/3)*x.v))/v;
  const tail=rows.slice(index-4,index+1),q=sum(tail.map(x=>x.q)),buy=sum(tail.map(x=>x.buy));
  let first=Math.max(0,index-119);
  for(let j=index;j>first;j--)if(rows[j].t-rows[j-1].t!==60000){first=j;break;}
  const recent=rows.slice(first,index+1),e20=ema(recent,20);
  const retrace=(high-r.c)/(high-event.base)*100;
  const redQ=sum(rows.slice(Math.max(event.index+1,index-2),index+1).filter(x=>x.c<x.o).map(x=>x.q));
  const tailQ=sum(rows.slice(Math.max(event.index+1,index-2),index+1).map(x=>x.q));
  const observed=rows.slice(event.index+1,index+1);
  const returned=observed.some(x=>x.l<=event.base);
  const continued=observed.some(x=>x.h>=h0*1.02);
  let state='UNCLASSIFIED';
  if(returned)state='ALREADY_BASE';
  else if(continued)state='ALREADY_CONTINUED';
  else if(r.c>avwap&&r.c>event.breakout&&retrace<=SETTINGS.keepRetrace)state='KEEP_HIGH';
  else if(r.c<avwap&&retrace>=SETTINGS.riskRetrace&&tailQ>0&&redQ/tailQ>=.55)state='FADE_RISK';
  return {at:r.end,index,price:r.c,high,h0,avwap,retracePct:retrace,retentionPct:100-retrace,takerBuyPct:q>0?buy/q*100:null,rsi14:rsi(recent),ema20DistancePct:e20?pct(e20,r.c):null,redQuoteSharePct:tailQ>0?redQ/tailQ*100:null,state,baseAlreadyTouched:returned,continuationAlreadyTouched:continued,forecastEligible:!returned&&!continued};
}
export function futurePath(rows,event,fromIndex,endTime){
  const high=Math.max(...rows.slice(event.index-14,event.index+1).map(x=>x.h)),target=high*1.02,deadline=rows[fromIndex].end+SETTINGS.horizonMinutes*60000;
  const future=rows.slice(fromIndex+1).filter(r=>r.end<=deadline&&r.end<endTime);
  if(!future.length||!consecutive([rows[fromIndex],...future]))return {label:'DATA_GAP',complete:false};
  const complete=future.at(-1).end>=deadline;let first=null,baseIndex=-1,continuationAt=null;
  for(let j=0;j<future.length;j++){
    const r=future[j],base=r.l<=event.base,up=r.h>=target;
    if(base&&baseIndex<0)baseIndex=j;
    if(up&&continuationAt==null)continuationAt=r.end;
    if(first==null){if(base&&up)first='AMBIGUOUS';else if(base)first='BASE';else if(up)first='CONTINUATION';}
  }
  const recoveryLevel=event.base+(high-event.base)*SETTINGS.reclaimFraction;
  // Must CLOSE back above the recovery level in a LATER bar after the base touch.
  const recovered=baseIndex>=0?future.slice(baseIndex+1).find(r=>r.c>=recoveryLevel):null;
  let label=first==='AMBIGUOUS'?'AMBIGUOUS':first==='CONTINUATION'?'CONTINUATION_FIRST':first==='BASE'?(recovered?'BASE_THEN_RECOVER':'BASE_NO_RECOVERY'):'UNRESOLVED';
  if(!complete)label='CENSORED';
  return {label,complete,firstObserved:first,baseAt:baseIndex>=0?future[baseIndex].end:null,continuationAt,recoveryAt:recovered?.end??null,recoveryLevel,baseTouched:baseIndex>=0,return6hPct:complete?pct(rows[fromIndex].c,future.at(-1).c):null,maxUpPct:pct(rows[fromIndex].c,Math.max(...future.map(r=>r.h))),maxDownPct:pct(rows[fromIndex].c,Math.min(...future.map(r=>r.l))),bars:future.length};
}
export function tradeSimulation(rows,index,endTime){
  const entryBar=rows[index+1],deadline=rows[index].end+SETTINGS.horizonMinutes*60000;
  if(!entryBar||entryBar.t!==rows[index].t+60000)return {status:'NO_ENTRY_DATA'};
  const entry=entryBar.o,tp=entry*1.02,sl=entry*.94,cost=2*(SETTINGS.feePerSidePct+SETTINGS.slippagePerSidePct);
  const future=rows.slice(index+1).filter(r=>r.end<=deadline&&r.end<endTime);
  let exit=null,status=null,ambiguous=false;
  for(let j=0;j<future.length;j++){
    const r=future[j];if(j&&r.t-future[j-1].t!==60000)return {status:'DATA_GAP'};
    if(r.l<=sl){exit=Math.min(sl,r.o);status='SL';ambiguous=r.h>=tp;break;}
    if(r.h>=tp){exit=tp;status='TP';break;}
  }
  if(exit==null){if(!future.length||future.at(-1).end<deadline)return {status:'CENSORED'};exit=future.at(-1).c;status='TIMEOUT';}
  const gross=pct(entry,exit);
  return {status,entry,entryAt:entryBar.t,exit,grossPricePct:gross,netPricePct:gross-cost,netRoe5x:(gross-cost)*5,ambiguousStopFirst:ambiguous};
}
export function evaluateEvent(symbol,rows,event,endTime){
  const p0=point(rows,event,event.index),i3=event.index+3;
  const p3=rows[i3]&&consecutive(rows.slice(event.index,i3+1))?point(rows,event,i3):null;
  return {symbol,at:event.at,base:event.base,breakout:event.breakout,gainPct:event.gainPct,volumeX:event.volumeX,atSignal:p0,after3m:p3,path:futurePath(rows,event,event.index,endTime),pathAfter3m:p3?futurePath(rows,event,i3,endTime):null,tradeAtSignal:tradeSimulation(rows,event.index,endTime),tradeAfter3m:p3?tradeSimulation(rows,i3,endTime):null};
}
function stats(events,state=null){
  const mature=events.filter(e=>e.path.complete),byPath={};for(const e of events)byPath[e.path.label]=(byPath[e.path.label]??0)+1;
  // Full windows only, even when a recent event hit TP/SL early: no selective censoring.
  const trades=events.filter(e=>state?e.pathAfter3m?.complete:e.path.complete).map(e=>state?e.tradeAfter3m:e.tradeAtSignal).filter(t=>t&&['TP','SL','TIMEOUT'].includes(t.status));
  const rows=events.map(e=>state?e.after3m:e.atSignal).filter(Boolean);
  const counts={};for(const t of trades)counts[t.status]=(counts[t.status]??0)+1;
  const future=events.filter(e=>!state||e.after3m?.forecastEligible).map(e=>state?e.pathAfter3m:e.path).filter(x=>x?.complete&&x.label!=='AMBIGUOUS');
  const oi=events.map(e=>e.derivatives?.oi).filter(x=>x?.ready),ratio=events.map(e=>e.derivatives?.ratio).filter(x=>x?.ready);
  return {n:events.length,mature:mature.length,coins:new Set(events.map(e=>e.symbol)).size,byPath,futureN:future.length,futureBasePct:future.length?future.filter(p=>p.baseTouched).length/future.length*100:null,futureBaseFirstPct:future.length?future.filter(p=>p.firstObserved==='BASE').length/future.length*100:null,meanVolumeX:mean(events.map(e=>e.volumeX)),medianVolumeX:median(events.map(e=>e.volumeX)),meanTakerBuyPct:mean(rows.map(x=>x.takerBuyPct).filter(Number.isFinite)),medianTakerBuyPct:median(rows.map(x=>x.takerBuyPct).filter(Number.isFinite)),meanRetracePct:mean(rows.map(x=>x.retracePct)),medianRetracePct:median(rows.map(x=>x.retracePct)),meanRsi14:mean(rows.map(x=>x.rsi14).filter(Number.isFinite)),medianRsi14:median(rows.map(x=>x.rsi14).filter(Number.isFinite)),medianEma20DistancePct:median(rows.map(x=>x.ema20DistancePct).filter(Number.isFinite)),medianBtc1hPct:median(events.filter(e=>e.btcContext?.ready).map(e=>e.btcContext.return1hPct)),oiReady:oi.length,meanOiChange15mPct:mean(oi.map(x=>x.change15mPct)),medianOiChange15mPct:median(oi.map(x=>x.change15mPct)),ratioReady:ratio.length,meanRatioChange15mPct:mean(ratio.map(x=>x.change15mPct)),medianRatioChange15mPct:median(ratio.map(x=>x.change15mPct)),tradeN:trades.length,tradeCounts:counts,netPositivePct:trades.length?trades.filter(t=>t.netPricePct>0).length/trades.length*100:null,avgNetRoe5x:mean(trades.map(t=>t.netRoe5x)),ambiguousStopFirst:trades.filter(t=>t.ambiguousStopFirst).length};
}
export function summarizeResearch(events,start,end){
  const split=start+4*86400000,states=['KEEP_HIGH','FADE_RISK','UNCLASSIFIED','ALREADY_BASE','ALREADY_CONTINUED'];
  const groups=xs=>Object.fromEntries(states.map(s=>[s,stats(xs.filter(e=>e.after3m?.state===s),s)]));
  const paths=['CONTINUATION_FIRST','BASE_THEN_RECOVER','BASE_NO_RECOVERY','UNRESOLVED','AMBIGUOUS','CENSORED','DATA_GAP'];
  const train=events.filter(e=>e.at<split-(SETTINGS.horizonMinutes+SETTINGS.landmarkMinutes)*60000),test=events.filter(e=>e.at>=split);
  const trajectory=e=>!e.path.complete?e.path.label:e.path.label==='CONTINUATION_FIRST'?(e.path.baseTouched?'CONTINUED_THEN_BASE':'CONTINUED_NO_BASE'):e.path.label;
  const late=events.filter(e=>e.path.label==='BASE_NO_RECOVERY'&&e.supplement24h?.complete);
  return {all:stats(events),splitAt:split,trainPurgedEvents:events.filter(e=>e.at>=split-(SETTINGS.horizonMinutes+SETTINGS.landmarkMinutes)*60000&&e.at<split).length,train:stats(train),test:stats(test),landmark3m:groups(events),trainLandmark3m:groups(train),testLandmark3m:groups(test),byPath:Object.fromEntries(paths.map(p=>[p,stats(events.filter(e=>e.path.label===p))])),byTrajectory:Object.fromEntries(['CONTINUED_NO_BASE','CONTINUED_THEN_BASE',...paths.filter(p=>p!=='CONTINUATION_FIRST')].map(p=>[p,stats(events.filter(e=>trajectory(e)===p))])),lateRecovery24h:{eligible:late.length,recovered:late.filter(e=>e.supplement24h.recoveryAt).length},settingsFrozenNotOptimized:true,noRealOrders:true,noLiquidationProof:true};
}
