export const FAILED_TOP_SETTINGS={version:'FAILED_TOP_POSITION_DOWN_14D_V1_20261031',step:900000,pump24hPct:8,peakLookbackBars:12,retestTolerancePct:2,supportBars:4,atrBars:14,breakAtr:.1,cooldownHours:4,ratioLagBars:1};
export function detectFailedTops(rows,start,end){
 const out=[];let last=-Infinity;const S=FAILED_TOP_SETTINGS;
 for(let i=96;i<rows.length;i++){
  const b=rows[i];if(b.end<start||b.end>=end||b.end-last<S.cooldownHours*3600000)continue;
  const past=rows.slice(i-96,i),window=rows.slice(i-14,i+1);
  if(window.some((x,j)=>j&&x.t-window[j-1].t!==S.step)||past.some((x,j)=>j&&x.t-past[j-1].t!==S.step))continue;
  const roof=Math.max(...rows.slice(i-12,i-2).map(x=>x.h)),floor24=Math.min(...past.map(x=>x.l));
  if((roof/floor24-1)*100<S.pump24hPct)continue;
  const recent=rows.slice(i-2,i);if(recent.some(x=>x.h>roof)||Math.max(...recent.map(x=>x.h))<roof*.98)continue;
  const support=Math.min(...rows.slice(i-4,i).map(x=>x.l));
  const atr=rows.slice(i-14,i).reduce((sum,x,j)=>{const previous=rows[i-15+j];return sum+Math.max(x.h-x.l,Math.abs(x.h-previous.c),Math.abs(x.l-previous.c));},0)/14;
  if(!(atr>0)||b.c>=support-.1*atr||b.c>=b.o)continue;
  out.push({at:b.end+1,barAt:b.t,roof,support,atr,signalPrice:b.c,pump24Pct:(roof/floor24-1)*100,retestHigh:Math.max(...recent.map(x=>x.h))});last=b.end;
 }
 return out;
}
export function ratioBefore(rows,at){
 const S=900000,eligible=rows.filter(x=>+x.timestamp<=at-S&&+x.longShortRatio>0).sort((a,b)=>+a.timestamp-+b.timestamp),last=eligible.at(-1);
 if(!last||at-S-last.timestamp>S)return null;
 const prev=eligible.find(x=>+x.timestamp===+last.timestamp-S);if(!prev)return null;
 const points=[0,1,2,3].map(i=>eligible.find(x=>+x.timestamp===+last.timestamp-i*S));if(points.some(x=>!x))return null;const minimum=Math.min(...points.slice(0,3).map(x=>+x.longShortRatio));return {at:+last.timestamp,previousAt:+prev.timestamp,ratio:+last.longShortRatio,previous:+prev.longShortRatio,changePct:(+last.longShortRatio/+prev.longShortRatio-1)*100,nearTopDropPct:(minimum/+points[3].longShortRatio-1)*100,baselineAt:+points[3].timestamp};
}
