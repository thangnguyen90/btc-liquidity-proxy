// Offline research only; no execution, server or notification imports.
import {classifyWhaleSmartDominance,proveDominanceCrowdTrend} from '../src/pumpglassWhaleSmartDominance.js';
export const VERSION='DOMINANCE_CROWD_MODEL13_RESEARCH_V1_20261106',S=300000,H=3600000;
export function baseEvent(symbol,p){
 if(![p.sourceAt,p.observedAt].every(Number.isFinite)||p.sourceAt>p.observedAt||p.observedAt-p.sourceAt>900000||!Number.isInteger(p.whaleCount)||p.whaleCount<10||typeof p.crowdLong!=='number'||!Number.isFinite(p.crowdLong)||p.crowdLong<0||p.crowdLong>100)return null;
 const c=classifyWhaleSmartDominance(p.whaleLong,p.smartLong);if(!c)return null;
 const opposite=c.side==='LONG'?100-p.crowdLong:p.crowdLong;if(!(opposite>60))return null;
 return {...c,symbol,laterTimestampConflict:!!p.ambiguous,sourceAt:p.sourceAt,observedAt:p.observedAt,decisionAt:p.observedAt,modelDecision:Math.floor(p.observedAt/S)*S,entryAt:Math.ceil(p.observedAt/S)*S+S,crowdLongPct:p.crowdLong,crowdOppositePct:opposite,crowdOppositeSide:c.side==='LONG'?'SHORT':'LONG',whaleCount:p.whaleCount};
}
export function replaySymbol(symbol,points,chart,end){
 const result=[],rejected={},last=new Map();
 for(const p of [...points].sort((a,b)=>a.observedAt-b.observedAt||a.sourceAt-b.sourceAt)){
  if(p.observedAt>=end)continue;const e=baseEvent(symbol,p);if(!e)continue;
  const historical={symbol:chart.symbol,crowd:(chart.crowd??[]).filter(r=>Array.isArray(r)&&typeof r[0]==='number'&&r[0]*1000<=e.decisionAt)};
  const trend=proveDominanceCrowdTrend(e,historical,e.decisionAt);if(trend.status!=='QUALIFIED'){rejected[trend.status]=(rejected[trend.status]??0)+1;continue;}
  if(e.decisionAt-(last.get(e.side)??-Infinity)<8*H)continue;
  result.push({...e,crowdTrend:trend,cohort:'JOURNAL_REPLAY'});last.set(e.side,e.decisionAt);
 }
 return {events:result,rejected};
}

import {earlyPumpBars} from '../src/earlyPumpWatch.js';
import {atrBefore,liquidityAt} from './research-early-pump-model.mjs';
export function planFor(raw,e,lag=S){
 const bars=earlyPumpBars(raw.price,e.modelDecision),c=bars.at(-1);if(!c||c.end!==e.modelDecision||bars.length<20)return {status:'PRICE_HISTORY_MISSING'};
 const liq=liquidityAt(raw,{at:e.modelDecision},c.c,lag);if(liq.status!=='OK')return {status:liq.status,liq};
 if(liq.asOf>e.modelDecision-lag)throw Error('MODEL_FUTURE_LEAK');
 const side=e.side==='LONG'?1:-1,atr=atrBefore(bars,bars.length-1),seen=bars.filter(b=>b.t>=liq.asOf),seenHigh=Math.max(c.c,...seen.map(b=>b.h)),seenLow=Math.min(c.c,...seen.map(b=>b.l));
 const targetZone=liq.zones.filter(z=>side===1?z.low>Math.max(c.c*1.001,seenHigh)&&z.low<=c.c*1.1:z.high<Math.min(c.c*.999,seenLow)&&z.high>=c.c*.9).sort((a,b)=>side===1?a.low-b.low:b.high-a.high)[0]??null;
 const target=targetZone?(side===1?targetZone.low:targetZone.high):null,structural=side===1?Math.min(...bars.slice(-3).map(b=>b.l))-.2*atr:Math.max(...bars.slice(-3).map(b=>b.h))+.2*atr;
 const cap=c.c*(1-side*.2/3),stop=side===1?Math.max(cap,structural):Math.min(cap,structural),risk=side*(c.c-stop),reward=target?side*(target-c.c):null,cost=c.c*.0014,rr=target&&risk>0?(reward-cost)/(risk+cost):null;
 return {status:'OK',liq,referencePrice:c.c,atr,structuralStop:structural,stop,target,targetZone,rr,directionalScore:side===1?liq.upperScore:liq.lowerScore,oppositeScore:side===1?liq.lowerScore:liq.upperScore};
}
export const FILTERS={ALL:()=>true,MODEL_AVAILABLE:f=>f.status==='OK',DIRECTION_STRONGER:f=>f.status==='OK'&&f.directionalScore>f.oppositeScore,DIRECTION_2X:f=>f.status==='OK'&&f.directionalScore>0&&f.directionalScore>=2*f.oppositeScore,MODEL_RR15:f=>f.status==='OK'&&f.rr>=1.5,DIRECTION_2X_RR15:f=>FILTERS.DIRECTION_2X(f)&&f.rr>=1.5};
export function trade(raw,e,funding,end,{model=null,costPct=.14}={}){
 const i=raw.findIndex(b=>+b[0]===e.entryAt),path=raw.slice(i,i+96),side=e.side==='LONG'?1:-1;
 if(i<0||e.entryAt+8*H>end||path.length!==96||path.some((b,j)=>+b[0]!==e.entryAt+j*S||+b[6]!==+b[0]+S-1))return {status:'INCOMPLETE_FUTURE_OR_GAP'};
 const entry=+path[0][1];let stop=entry*(1-side*.2/3),target=entry*(1+side*.1/3);
 if(model){
  if(model.status!=='OK'||!(model.rr>=1.5)||!model.target)return {status:'NO_MODEL_PLAN'};
  stop=side===1?Math.max(stop,model.structuralStop):Math.min(stop,model.structuralStop);target=model.target;
  const waiting=raw.filter(b=>+b[0]>=e.modelDecision&&+b[6]<e.entryAt);
  if(waiting.length!==(e.entryAt-e.modelDecision)/S||waiting.some((b,j)=>+b[0]!==e.modelDecision+j*S))return {status:'WAIT_PRICE_GAP'};
  if(!(side*(entry-stop)>0&&side*(target-entry)>0)||waiting.some(b=>side===1?+b[3]<=model.structuralStop||+b[2]>=target:+b[2]>=model.structuralStop||+b[3]<=target))return {status:'MODEL_LEVEL_INVALIDATED_BEFORE_ENTRY'};
  if((side*(target-entry)-entry*costPct/100)/(side*(entry-stop)+entry*costPct/100)<1.5)return {status:'ENTRY_RR_BELOW_15'};
 }
 let exit=+path.at(-1)[4],exitAt=+path.at(-1)[6],kind='TIME',ambiguous=false;
 for(const b of path){const open=+b[1],sl=side===1?+b[3]<=stop:+b[2]>=stop,tp=side===1?+b[2]>=target:+b[3]<=target;
  if(side*(open-stop)<=0){exit=open;exitAt=+b[0];kind='SL_GAP';break;}
  if(side*(open-target)>=0){exit=target;exitAt=+b[0];kind='TP_GAP';break;}
  if(sl||tp){ambiguous=sl&&tp;exit=sl?stop:target;exitAt=+b[6];kind=sl?'SL':'TP';break;}
 }
 const fundingPct=side*funding.filter(f=>f.symbol===e.symbol&&+f.fundingTime>e.entryAt&&+f.fundingTime<=exitAt).reduce((sum,f)=>sum+(+f.fundingRate)*(+f.markPrice>0?+f.markPrice/entry:1)*100,0),grossPct=side*(exit/entry-1)*100,netRoe=(grossPct-costPct-fundingPct)*3;
 return {status:'OK',entry,stop,target,exit,exitAt,kind,ambiguous,fundingPct,grossPct,costPct,netRoe,stressRoe:netRoe-(.30-costPct)*3,directionalReturns:Object.fromEntries([1,4,8].map(h=>[h+'h',side*100*(+path[h*12-1][4]/entry-1)]))};
}
export function statistics(rows,field='trade'){
 const rs=rows.filter(r=>r[field]?.status==='OK'),v=rs.map(r=>r[field].netRoe),n=v.length,mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null,loss=v.filter(x=>x<0).reduce((s,x)=>s-x,0),sorted=v.slice().sort((a,b)=>a-b);
 const byCoin={};for(const r of rs)(byCoin[r.symbol]??=[]).push(r[field].netRoe);
 return {n,coins:Object.keys(byCoin).length,win:n?v.filter(x=>x>0).length:0,winPct:n?100*v.filter(x=>x>0).length/n:null,meanRoe:mean(v),medianRoe:n?(sorted[Math.floor((n-1)/2)]+sorted[Math.ceil((n-1)/2)])/2:null,stressMeanRoe:mean(rs.map(r=>r[field].stressRoe)),profitFactor:loss?v.filter(x=>x>0).reduce((s,x)=>s+x,0)/loss:null,tp:rs.filter(r=>r[field].kind.startsWith('TP')).length,sl:rs.filter(r=>r[field].kind.startsWith('SL')).length,time:rs.filter(r=>r[field].kind==='TIME').length,ambiguous:rs.filter(r=>r[field].ambiguous).length,coinEqualMean:mean(Object.values(byCoin).map(mean)),direction:Object.fromEntries([1,4,8].map(h=>[h+'h',{meanPct:mean(rs.map(r=>r[field].directionalReturns[h+'h'])),correctPct:n?100*rs.filter(r=>r[field].directionalReturns[h+'h']>0).length/n:null}])),byCoin:Object.fromEntries(Object.entries(byCoin).map(([c,x])=>[c,{n:x.length,meanRoe:mean(x)}]))};
}
export function clusterCI(rows,field='trade',key=r=>r.symbol){
 const groups=new Map();for(const r of rows.filter(r=>r[field]?.status==='OK')){const k=key(r);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r[field].netRoe);}
 const a=[...groups.values()];if(a.length<2)return null;let seed=20261106;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},xs=[];
 for(let n=0;n<2000;n++){let sum=0,count=0;for(let i=0;i<a.length;i++){const b=a[Math.floor(rand()*a.length)];sum+=b.reduce((s,x)=>s+x,0);count+=b.length;}xs.push(sum/count);}xs.sort((a,b)=>a-b);return [xs[50],xs[1949]];
}
