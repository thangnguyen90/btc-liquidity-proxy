import {atrBefore} from './research-early-pump-model.mjs';
export const VERSION='PUMPGLASS_MODEL13_RESEARCH_V1_20261102';
export function planAt(bars,decision,liq){
 const i=bars.findIndex(b=>b.end===decision),c=bars[i];if(i<20)return {status:'PRICE_MISSING'};
 const atr=atrBefore(bars,i),since=liq.status==='OK'?bars.filter(b=>b.t>=liq.asOf&&b.end<=decision):[];
 const seenHigh=Math.max(c.h,...since.map(b=>b.h)),zones=liq.status==='OK'?liq.zones:[];
 const upper=zones.filter(z=>z.low>Math.max(c.c*1.001,seenHigh)&&z.low<=c.c*1.1).sort((a,b)=>a.low-b.low)[0];
 const lower=zones.filter(z=>z.high<c.c*.999).sort((a,b)=>b.high-a.high)[0];
 const stop=Math.min(...bars.slice(i-2,i+1).map(b=>b.l))-.2*atr,risk=c.c-stop,cost=c.c*.0014,rr=upper&&risk>0?(upper.low-c.c-cost)/(risk+cost):null;
 const reclaim=zones.some(z=>z.high<bars[i-1].c&&c.l<=z.low&&c.c>z.high&&c.c>c.o);
 return {status:'OK',referencePrice:c.c,atr,stop,target:upper?.low??null,lowerZone:lower??null,rr,reclaim,liq};
}
export const FILTERS={
 ALL:()=>true,
 AVAILABLE:f=>f.status==='OK'&&f.liq.status==='OK',
 UPPER_2X:f=>FILTERS.AVAILABLE(f)&&f.liq.upperScore>0&&f.liq.upperScore>=2*f.liq.lowerScore,
 UPPER_GROWING:f=>FILTERS.AVAILABLE(f)&&f.liq.upperScore>f.liq.lowerScore&&f.liq.upperGrowth15m>=1.2,
 TARGET_RR15:f=>FILTERS.AVAILABLE(f)&&f.rr>=1.5,
 LOWER_RECLAIM:f=>FILTERS.AVAILABLE(f)&&f.reclaim,
 UPPER2X_RR15:f=>FILTERS.UPPER_2X(f)&&f.rr>=1.5,
};
export function modelExit(price,point,f,funding,end){
 if(!FILTERS.TARGET_RR15(f))return {status:'NO_MODEL_PLAN'};
 const i=price.findIndex(b=>+b[0]===point.entryAt),path=price.slice(i,i+96),wait=price.filter(b=>+b[0]>=point.decision&&+b[6]<point.entryAt);
 if(i<0||path.length!==96||point.entryAt+8*3600000>end||path.some((b,j)=>+b[0]!==point.entryAt+j*300000)||wait.length!==1)return {status:'PRICE_GAP'};
 const entry=+path[0][1],stop=Math.max(entry*(1-.2/3),f.stop),target=f.target,cost=entry*.0014;
 if(!(target>entry&&stop<entry)||wait.some(b=>+b[3]<=f.stop||+b[2]>=target))return {status:'LEVELS_ALREADY_INVALID'};
 if((target-entry-cost)/(entry-stop+cost)<1.5)return {status:'ENTRY_RR_BELOW_15'};
 let exit=+path.at(-1)[4],exitAt=+path.at(-1)[6],kind='TIME',ambiguous=false;
 for(const b of path){if(+b[1]<=stop){exit=+b[1];exitAt=+b[0];kind='SL_GAP';break;}if(+b[1]>=target){exit=target;exitAt=+b[0];kind='TP_GAP';break;}const sl=+b[3]<=stop,tp=+b[2]>=target;if(sl||tp){ambiguous=sl&&tp;exit=sl?stop:target;exitAt=+b[6];kind=sl?'SL':'TP';break;}}
 const fundingPct=funding.filter(x=>+x.fundingTime>point.entryAt&&+x.fundingTime<=exitAt).reduce((s,x)=>s+(+x.fundingRate)*(+x.markPrice>0?+x.markPrice/entry:1)*100,0);
 const netRoe=((exit/entry-1)*100-.14-fundingPct)*3;return {status:'OK',entry,stop,target,exit,exitAt,kind,ambiguous,fundingPct,netRoe,stressRoe:netRoe-.48};
}
