// Pure offline research functions. Never import execution, server or notification modules.
import {earlyPumpBars,earlyPumpRatioTrend} from '../src/earlyPumpWatch.js';
import {heatmapRangePlan,normalizeBinanceHeatmapCandles,buildBinanceHeatmapProfiles} from '../src/binanceHeatmapModel.js';
import {heatmapConsensusZones,PROFILE_RATIO} from '../src/heatmapEntryScenarios.js';
export const STUDY_VERSION='EARLY_PUMP_LIQUIDITY_RESEARCH_V1_20261102';
export const STEP=300000,HOUR=3600000;
const median=a=>{const b=[...a].sort((x,y)=>x-y);return (b[9]+b[10])/2;};
export function detectResearch(raw,start,end){
 const bars=earlyPumpBars(raw,end),out=[];let last=-Infinity;
 for(let i=20;i<bars.length;i++){
  const b=bars[i],p=bars.slice(i-20,i);
  if(b.end<start||b.end>=end||b.end-last<HOUR||[...p,b].some((x,j,a)=>j&&x.t-a[j-1].t!==STEP))continue;
  const baseline=median(p.map(x=>x.q)),level=Math.max(...p.slice(-12).map(x=>x.h));
  if(!(baseline>0&&b.q>=500000&&b.q/baseline>=3&&b.c>b.o&&b.c>level))continue;
  out.push({at:b.end,price:b.c,level,volumeX:b.q/baseline,quoteVolume:b.q,buyPct:100*b.buy/b.q,baseline,return1hPct:(b.c/bars[i-12].c-1)*100});last=b.end;
 }return out;
}
export function atrBefore(bars,i){if(i<15)return null;return bars.slice(i-14,i).reduce((s,b,j)=>s+Math.max(b.h-b.l,Math.abs(b.h-bars[i-15+j].c),Math.abs(b.l-bars[i-15+j].c)),0)/14;}
export function decisionFor(event,bars,mode){
 const i=bars.findIndex(b=>b.end===event.at);if(i<20)return null;
 if(mode==='BREAKOUT')return {at:event.at,index:i};
 const atr=atrBefore(bars,i);let previous=bars[i],sum=0,higher=true;
 for(let n=1;n<=(mode==='HOLD'?3:6);n++){
  const b=bars[i+n];if(!b||b.t!==previous.t+STEP||b.c<event.level)return null;
  sum+=b.q;higher&&=b.l>=previous.l;
  const pass=mode==='HOLD'?n>=2&&higher&&b.c>event.price&&sum/n/event.baseline>=1.5:b.l<=event.level+.25*atr&&b.c>event.level&&b.c>b.o;
  if(pass)return {at:b.end,index:i+n};previous=b;
 }return null;
}
function relativePair(p1,p3,price){
 const map=p=>{const max=Math.max(0,...p.bins.map(x=>x[1]));return new Map(p.bins.map(([k,w])=>[k,max?w/max*100:0]));};
 const a=map(p1),b=map(p3);let upper=0,lower=0;
 for(const [k,x]of a){const v=Math.min(x,b.get(k)??0);if(v<35)continue;const p=PROFILE_RATIO**k;if(p>price&&p<=price*1.05)upper+=v;if(p<price&&p>=price*.95)lower+=v;}
 return {upper,lower};
}
export function liquidityAt(raw,decision,price,lag=STEP){
 try{
  const plan=heatmapRangePlan('24h',decision.at-lag);
  const cut=xs=>xs.filter(r=>+r[0]>=plan.from&&+r[6]<plan.end);
  const candles=normalizeBinanceHeatmapCandles(cut(raw.price),plan),mark=normalizeBinanceHeatmapCandles(cut(raw.mark??[]),plan);
  if(candles.length!==432||mark.length!==432)return {status:'INCOMPLETE_36H'};
  const oi=(raw.oi??[]).filter(r=>+r.timestamp>=plan.from&&+r.timestamp<plan.end),oiTimes=new Set(oi.filter(r=>+r.sumOpenInterest>0).map(r=>+r.timestamp));
  if(candles.filter(c=>oiTimes.has(c.time)).length<.95*432)return {status:'OI_COVERAGE_BELOW_95'};
  const models=[1,3].map(model=>buildBinanceHeatmapProfiles({query:{symbol:raw.symbol,range:'24h'},plan,candles,markRows:mark,oiRows:oi,model}));
  const consensus=heatmapConsensusZones(models[0],models[1],plan.end-1,STEP,price);
  if(consensus.status!=='OK')return {status:consensus.status};
  const score=(lo,hi)=>consensus.zones.reduce((s,z)=>s+Math.max(0,Math.log(Math.min(hi,z.high)/Math.max(lo,z.low))/.0025)*z.overlapStrength,0);
  const upperScore=score(price,price*1.05),lowerScore=score(price*.95,price);
  const current=relativePair(models[0].profiles.at(-1),models[1].profiles.at(-1),price),old=relativePair(models[0].profiles[0],models[1].profiles[0],price);
  return {status:'OK',asOf:plan.end,lag,upperScore,lowerScore,upperGrowth15m:old.upper>0?current.upper/old.upper:null,zones:consensus.zones,zoneCount:consensus.zones.length};
 }catch(e){return {status:e.message};}
}
export function featuresAt(event,bars,decision,liq,position){
 const i=decision.index,b=bars[i],atr=atrBefore(bars,i),prior=bars[i-1];
 const stop=Math.min(event.level,...bars.slice(i-2,i+1).map(x=>x.l))-.2*atr;
 const lower=liq.status==='OK'?liq.zones.filter(z=>z.high<prior.c):[];
 const reclaim=lower.some(z=>b.l<=z.low&&b.c>z.high&&b.c>b.o);
 const sinceModel=liq.status==='OK'?bars.filter(x=>x.t>=liq.asOf&&x.end<=decision.at):[];
 const seenHigh=Math.max(b.c,...sinceModel.map(x=>x.h));
 const target=liq.status==='OK'?liq.zones.filter(z=>z.low>Math.max(b.c*1.001,seenHigh)&&z.low<=b.c*1.1).sort((a,b)=>a.low-b.low)[0]:null;
 const risk=b.c-stop,reward=target?target.low-b.c:null,cost=b.c*.0014;
 const ratio=earlyPumpRatioTrend(position??[],decision.at);
 return {atr,level:event.level,stop,target:target?.low??null,targetStrength:target?.overlapStrength??null,rr:target&&risk>0?(reward-cost)/(risk+cost):null,chaseAtr:(b.c-event.level)/atr,reclaim,position:ratio,liquidity:liq};
}
export const FILTERS={
 ALL:()=>true,
 MODEL_AVAILABLE:f=>f.liquidity.status==='OK',
 UPPER_2X:f=>f.liquidity.status==='OK'&&f.liquidity.upperScore>0&&f.liquidity.upperScore>=2*f.liquidity.lowerScore,
 UPPER_GROWING:f=>f.liquidity.status==='OK'&&f.liquidity.upperScore>f.liquidity.lowerScore&&f.liquidity.upperGrowth15m>=1.2,
 LOWER_RECLAIM:f=>f.liquidity.status==='OK'&&f.reclaim,
 UPPER_2X_RECLAIM:f=>FILTERS.UPPER_2X(f)&&f.reclaim,
 ROOM_RR15:f=>f.liquidity.status==='OK'&&f.rr>=1.5,
 UPPER_2X_RR15:f=>FILTERS.UPPER_2X(f)&&f.rr>=1.5,
 UPPER_2X_SHORT_RISING:f=>FILTERS.UPPER_2X(f)&&f.position?.shortDelta1hPp>0,
};
export function simulateTrade(bars,decision,features,funding,end,{exit='FIXED',delay=STEP,costPct=.14}={}){
 const start=decision.at+delay,i=bars.findIndex(b=>b.t===start),path=bars.slice(i,i+48);
 if(i<0||start+4*HOUR>end||path.length!==48||path.some((b,j)=>b.t!==start+j*STEP))return {status:'INCOMPLETE_FUTURE'};
 const entry=path[0].o;
 const waiting=bars.filter(b=>b.t>=decision.at&&b.end<=start);
 if(waiting.length!==delay/STEP||waiting.some((b,j)=>b.t!==decision.at+j*STEP))return {status:'GAP_BEFORE_ENTRY'};
 if(entry<features.level||waiting.some(b=>b.c<features.level))return {status:'LOST_BEFORE_ENTRY'};
 let stop=entry*(1-.2/3),target=entry*(1+.1/3);
 if(exit==='MODEL'){
  stop=Math.max(stop,features.stop);target=features.target;
  if(!(stop>0&&stop<entry&&target>entry))return {status:'INVALID_LEVELS'};
  if(waiting.some(b=>b.l<=features.stop||b.h>=target))return {status:'LEVEL_INVALIDATED_BEFORE_ENTRY'};
  const rr=(target-entry-entry*costPct/100)/(entry-stop+entry*costPct/100);
  if(rr<1.5)return {status:'ENTRY_RR_BELOW_15'};
 }
 let exitPrice=path.at(-1).c,exitAt=path.at(-1).end-1,kind='TIME',ambiguous=false;
 for(const b of path){
  if(b.o<=stop){exitPrice=b.o;exitAt=b.t;kind='SL_GAP';break;}
  if(b.o>=target){exitPrice=target;exitAt=b.t;kind='TP_GAP';break;}
  const sl=b.l<=stop,tp=b.h>=target;
  if(sl||tp){ambiguous=sl&&tp;exitPrice=sl?stop:target;exitAt=b.end-1;kind=sl?'SL':'TP';break;}
 }
 const payments=(funding??[]).filter(f=>+f.fundingTime>start&&+f.fundingTime<=exitAt);
 const fundingPct=payments.reduce((s,f)=>s+Number(f.fundingRate)*(Number(f.markPrice)>0?Number(f.markPrice)/entry:1)*100,0);
 const grossPct=(exitPrice/entry-1)*100,netRoe=(grossPct-costPct-fundingPct)*3;
 return {status:'OK',start,entry,stop,target,exitAt,exitPrice,kind,ambiguous,grossPct,fundingPct,costPct,netRoe,stressNetRoe:netRoe-(.30-costPct)*3};
}
export function stats(rows,key='netRoe'){
 const xs=rows.filter(r=>r.trade?.status==='OK'&&Number.isFinite(r.trade[key])),vs=xs.map(r=>r.trade[key]),n=vs.length,profits=vs.filter(x=>x>0).reduce((s,x)=>s+x,0),loss=-vs.filter(x=>x<0).reduce((s,x)=>s+x,0),sorted=[...vs].sort((a,b)=>a-b);
 const coins=new Set(xs.map(r=>r.symbol));return {n,coins:coins.size,winPct:n?100*vs.filter(x=>x>0).length/n:null,mean:n?vs.reduce((s,x)=>s+x,0)/n:null,median:n?(sorted[Math.floor((n-1)/2)]+sorted[Math.ceil((n-1)/2)])/2:null,pf:loss?profits/loss:null,sl:xs.filter(r=>r.trade.kind.startsWith('SL')).length,ambiguous:xs.filter(r=>r.trade.ambiguous).length,meanFundingRoe:n?xs.reduce((s,r)=>s+r.trade.fundingPct*3,0)/n:null};
}
