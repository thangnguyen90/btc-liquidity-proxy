export const VERSION='PUMPGLASS_POSITIONING_RESEARCH_V1_20261102';
const H=3600000,S=300000;
export const FILTERS={ALL:()=>true,WHALE70:(b,side)=>side===1?b.w>=70:b.w<=30,DIVERGENCE70_40:(b,side)=>side===1?b.w>=70&&b.c<=40:b.w<=30&&b.c>=60,GAP30_60:(b,side)=>side===1?b.w>=60&&b.w-b.c>=30:b.w<=40&&b.c-b.w>=30,RISING5_60:(b,side)=>Number.isFinite(b.delta)&&(side===1?b.w>=60&&b.delta>=5:b.w<=40&&b.delta<=-5),BOTH70:(b,side)=>side===1?b.w>=70&&b.c>=70:b.w<=30&&b.c<=30};
export function historyPoints(h,end){
 if(!Array.isArray(h?.bars)||!(h.bucket>0))throw Error('INVALID_HISTORY');
 const rs=h.bars.filter(b=>Number.isFinite(b.t)&&Number.isFinite(b.w)&&Number.isFinite(b.c)&&b.w>=0&&b.w<=100&&b.c>=0&&b.c<=100&&b.t*1000<end).sort((a,b)=>a.t-b.t);
 if(new Set(rs.map(b=>b.t)).size!==rs.length)throw Error('DUPLICATE_HISTORY');
 return rs.map((b,i)=>({...b,delta:i&&b.t-rs[i-1].t===h.bucket?b.w-rs[i-1].w:null}));
}
export function selectPoints(h,{start,end,filter='ALL',side=1,lagBuckets=1}){
 const rs=historyPoints(h,end),out=[];let prior=-Infinity;
 for(const b of rs){
  const decision=(b.t+h.bucket*lagBuckets)*1000,entryAt=decision+S;
  if(decision<start||entryAt+8*H>end||entryAt-prior<8*H||!FILTERS[filter](b,side))continue;
  out.push({...b,decision,entryAt,sourceAt:b.t*1000,bucket:h.bucket*1000,lagBuckets});prior=entryAt;
 }return out;
}
export function outcome(price,point,side,funding){
 const i=price.findIndex(x=>+x[0]===point.entryAt),path=price.slice(i,i+96);
 if(i<0||path.length!==96||path.some((b,j)=>+b[0]!==point.entryAt+j*S||+b[6]!==+b[0]+S-1))return {status:'PRICE_GAP'};
 const e=+path[0][1],stop=e*(1-side*.2/3),target=e*(1+side*.1/3);
 let exit=+path.at(-1)[4],at=+path.at(-1)[6],kind='TIME',ambiguous=false;
 for(const b of path){const o=+b[1],hi=+b[2],lo=+b[3];
  if(side*(o-stop)<=0){exit=o;at=+b[0];kind='SL_GAP';break;}
  if(side*(o-target)>=0){exit=target;at=+b[0];kind='TP_GAP';break;}
  const sl=side===1?lo<=stop:hi>=stop,tp=side===1?hi>=target:lo<=target;
  if(sl||tp){ambiguous=sl&&tp;exit=sl?stop:target;at=+b[6];kind=sl?'SL':'TP';break;}
 }
 const pays=funding.filter(f=>+f.fundingTime>point.entryAt&&+f.fundingTime<=at);
 const fundingPct=side*pays.reduce((s,f)=>s+(+f.fundingRate)*(+f.markPrice>0?+f.markPrice/e:1)*100,0);
 const netRoe=(side*(exit/e-1)*100-.14-fundingPct)*3;
 return {status:'OK',entry:e,stop,target,exit,exitAt:at,kind,ambiguous,fundingPct,netRoe,stressRoe:netRoe-.48};
}
export function stats(rs,key='netRoe'){
 const a=rs.filter(r=>r.trade.status==='OK'),v=a.map(r=>r.trade[key]),n=v.length,p=v.filter(x=>x>0).reduce((s,x)=>s+x,0),l=-v.filter(x=>x<0).reduce((s,x)=>s+x,0),sort=[...v].sort((a,b)=>a-b);
 const coin=new Map();for(const r of a){if(!coin.has(r.symbol))coin.set(r.symbol,[]);coin.get(r.symbol).push(r.trade[key]);}
 return {n,coins:coin.size,winPct:n?100*v.filter(x=>x>0).length/n:null,mean:n?v.reduce((s,x)=>s+x,0)/n:null,median:n?(sort[Math.floor((n-1)/2)]+sort[Math.ceil((n-1)/2)])/2:null,pf:l?p/l:null,coinEqualMean:coin.size?[...coin.values()].reduce((s,x)=>s+x.reduce((a,b)=>a+b,0)/x.length,0)/coin.size:null,sl:a.filter(r=>r.trade.kind.startsWith('SL')).length,ambiguous:a.filter(r=>r.trade.ambiguous).length};
}
export function coinCI(rs){const gs=new Map();for(const r of rs.filter(r=>r.trade.status==='OK')){if(!gs.has(r.symbol))gs.set(r.symbol,[]);gs.get(r.symbol).push(r.trade.netRoe);}const a=[...gs.values()];if(a.length<2)return null;let seed=20261102;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},vs=[];for(let k=0;k<1000;k++){let s=0,n=0;for(let j=0;j<a.length;j++){const x=a[Math.floor(rand()*a.length)];s+=x.reduce((s,v)=>s+v,0);n+=x.length;}vs.push(s/n);}vs.sort((a,b)=>a-b);return[vs[25],vs[974]];}
