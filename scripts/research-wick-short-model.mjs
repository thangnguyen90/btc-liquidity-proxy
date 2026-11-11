const S=900000,H=3600000;
const median=a=>{a.sort((a,b)=>a-b);return (a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2;};
export function detect(rows,start,end){const es=[];let last=-Infinity;const flags=[];
for(let i=21;i<rows.length;i++){const b=rows[i],prior=rows.slice(i-14,i);const atr=prior.reduce((s,x,j)=>s+Math.max(x.h-x.l,Math.abs(x.h-rows[i-15+j].c),Math.abs(x.l-rows[i-15+j].c)),0)/14;
const range=b.h-b.l,wick=Math.max(b.h-Math.max(b.o,b.c),Math.min(b.o,b.c)-b.l)/range,volX=b.q/median(rows.slice(i-20,i).map(x=>x.q));flags[i]=range>=2*atr&&wick>=.5&&volX>=3;
if(b.t+S<start||b.t+S>=end||b.t+S-last<6*H||!flags[i])continue;
if(rows.slice(i-24,i+1).some((x,j,a)=>j&&x.t-a[j-1].t!==S))continue;
if(flags.slice(i-23,i+1).filter(Boolean).length<2)continue;
const base=rows.slice(i-12,i),hi=Math.max(...base.map(x=>x.h)),lo=Math.min(...base.map(x=>x.l)),travel=base.reduce((s,x,j)=>s+Math.abs(x.c-(j?base[j-1].c:rows[i-13].c)),0),eff=travel?Math.abs(base.at(-1).c-rows[i-13].c)/travel:0;
if((hi-lo)>8*atr||eff>.35||b.c<lo||b.c>hi)continue;
es.push({at:b.t+S,atr,volX,wick,eff,widthAtr:(hi-lo)/atr,baseHigh:hi,baseLow:lo});last=b.t+S;
}return es;}
export function ratioAt(rows,at){const eligible=rows.filter(x=>+x.timestamp<=at-H).sort((a,b)=>+a.timestamp-+b.timestamp),x=eligible.at(-1);if(!x||at-H-x.timestamp>H)return null;const prev=eligible.find(y=>+y.timestamp===+x.timestamp-H);const ratio=+x.longShortRatio;return {at:+x.timestamp,ratio,shortPct:100/(1+ratio),shortRising:prev?ratio<+prev.longShortRatio:null};}
