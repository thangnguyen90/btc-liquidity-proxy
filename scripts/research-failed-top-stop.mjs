// Offline SHORT scenario; fixed initial margin, no TP, funding or order placement.
export function simulateShortStop(bars,{entry,at,horizon,cutoff,leverage=3,slRoe=20,costPct=.12}) {
 const step=900000, count=horizon/15;
 if(!(entry>0)||!(leverage>0)||!(slRoe>0)||!Number.isInteger(count)||count<1)throw Error('INVALID_INPUT');
 const path=bars.filter(b=>b.t>=at&&b.t<at+horizon*60000);
 // Require a mature, gap-free full horizon even if an early stop is observable.
 // This keeps the stop and no-stop comparisons on exactly the same cohort.
 if(path.length!==count||path.some((b,i)=>b.t!==at+i*step||b.end>=cutoff))return null;
 const stopPrice=entry*(1+slRoe/leverage/100);
 const hit=path.find(b=>b.h>=stopPrice);
 const exit=hit?Math.max(stopPrice,hit.o):path.at(-1).c;
 const grossRoe=(1-exit/entry)*100*leverage;
 const baselineRoe=((1-path.at(-1).c/entry)*100-costPct)*leverage;
 return {entry,stopPrice,exit,reason:hit?'SL':'TIME',exitBarAt:hit?.t??path.at(-1).t,
  exitTimeExact:!hit,exitTime:hit?null:path.at(-1).end,
  gapThroughStop:!!hit&&hit.o>stopPrice,grossRoe,netRoe:grossRoe-costPct*leverage,
  baselineRoe,costRoe:costPct*leverage,stressNetRoe:grossRoe-.20*leverage};
}
export function summarizeStop(rows) {
 const vs=rows.map(r=>r.netRoe).sort((a,b)=>a-b),n=vs.length;
 if(!n)return {n:0};
 const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
 const wins=vs.filter(v=>v>0),losses=vs.filter(v=>v<0);
 const stops=rows.filter(r=>r.reason==='SL');
 return {n,winPct:wins.length/n*100,meanNetRoe:mean(vs),medianNetRoe:n%2?vs[(n-1)/2]:(vs[n/2-1]+vs[n/2])/2,
  profitFactor:losses.length?wins.reduce((s,v)=>s+v,0)/-losses.reduce((s,v)=>s+v,0):null,
  minRoe:vs[0],maxRoe:vs.at(-1),stopCount:stops.length,stopPct:stops.length/n*100,
  gapStops:stops.filter(r=>r.gapThroughStop).length,
  meanNoStopRoe:mean(rows.map(r=>r.baselineRoe)),meanStressRoe:mean(rows.map(r=>r.stressNetRoe)),
  stoppedButWouldFinishProfitable:stops.filter(r=>r.baselineRoe>0).length,
  stopsImprovedOutcome:stops.filter(r=>r.netRoe>r.baselineRoe).length};
}
