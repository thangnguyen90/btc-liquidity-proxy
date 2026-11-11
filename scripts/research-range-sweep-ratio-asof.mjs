const P=300000;
export function asofRatio(rows,at,lag){
 const eligible=rows.filter(x=>Number.isFinite(+x.timestamp)&&+x.timestamp<=at-lag&&+x.longShortRatio>0).sort((a,b)=>+a.timestamp-+b.timestamp);
 const last=eligible.at(-1);if(!last||at-lag-last.timestamp>P)return null;
 const prev=eligible.find(x=>+x.timestamp===+last.timestamp-3*P);if(!prev)return null;
 // Require the four 5m points, not just two endpoints spanning a gap.
 if([0,1,2,3].some(i=>!eligible.some(x=>+x.timestamp===+last.timestamp-i*P)))return null;
 return {timestamp:+last.timestamp,ratio:+last.longShortRatio,change15Pct:(+last.longShortRatio/+prev.longShortRatio-1)*100};
}
