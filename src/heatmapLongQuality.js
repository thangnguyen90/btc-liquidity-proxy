import {LONG_QUALITY_VERSION,LONG_QUALITY_LABELS,longQualityChecks,longQualityGrade} from '../public/heatmap-long-quality-model.js';
const STEP=300000,finite=Number.isFinite,pct=(a,b)=>a>0&&b>0?(a/b-1)*100:null;
function closedBars(raw,at,count=240){
 const rs=(raw??[]).filter(r=>Array.isArray(r)&&Number(r[6])<at).map(r=>({time:Number(r[0]),end:Number(r[6]),close:Number(r[4])})).sort((a,b)=>a.time-b.time).slice(-count);
 return rs.length===count&&rs.at(-1).end===Math.floor(at/STEP)*STEP-1&&rs.every((r,i)=>finite(r.time)&&finite(r.end)&&r.close>0&&finite(r.close)&&r.end===r.time+STEP-1&&r.time%STEP===0&&(!i||r.time-rs[i-1].time===STEP))?rs:null;
}
function rsi(xs){let u=0,d=0;for(let i=1;i<=14;i++){u+=Math.max(0,xs[i]-xs[i-1])/14;d+=Math.max(0,xs[i-1]-xs[i])/14;}for(let i=15;i<xs.length;i++){u=(u*13+Math.max(0,xs[i]-xs[i-1]))/14;d=(d*13+Math.max(0,xs[i-1]-xs[i]))/14;}return d===0?(u===0?50:100):100-100/(1+u/d);}
function samples(raw,at,key,symbol){
 const rs=(raw??[]).map(r=>({at:Number(r.timestamp),v:Number(r[key]),long:Number(r.longAccount),short:Number(r.shortAccount),symbol:r.symbol})).filter(r=>r.at+STEP<=at).sort((a,b)=>a.at-b.at).slice(-13);
 if(rs.length!==13||rs.at(-1).at!==Math.floor((at-STEP)/STEP)*STEP||rs.some((r,i)=>!finite(r.at)||r.at%STEP!==0||!finite(r.v)||r.v<=0||i&&r.at-rs[i-1].at!==STEP||r.symbol&&r.symbol!==symbol))return null;
 if(key==='longShortRatio'&&rs.some(r=>!finite(r.long)||!finite(r.short)||r.long<=0||r.short<=0||Math.abs(r.long+r.short-1)>.002||Math.abs(r.long/r.short/r.v-1)>.01))return null;
 return rs;
}
export function evaluateHeatmapLongQuality({event:e,raw=null,ratio=null,btcRows=[],now=Date.now()}={}){
 if(e?.kind!=='ALL_TRACKED_LOWER_SWEPT'||e.direction!=='LOWER')return null;
 const missing=[],goodRaw=raw?.symbol===e.symbol&&finite(raw.savedAt)&&raw.savedAt<=now&&raw.savedAt>=e.at-120000;
 const coin=goodRaw?closedBars(raw.price,e.at):null,oi=goodRaw?samples(raw.oi,e.at,'sumOpenInterest',e.symbol):null;
 const goodRatio=ratio?.symbol===e.symbol&&ratio?.source==='BINANCE_TOP_TRADER_ACCOUNT_RATIO'&&ratio.period==='5m'&&['OK','STALE'].includes(ratio.status)
  &&finite(ratio.fetchedAt)&&ratio.fetchedAt<=now&&now-ratio.fetchedAt<=60000;
 const rr=goodRatio?samples(ratio.rows,e.at,'longShortRatio',e.symbol):null,btc=closedBars(btcRows,e.at,13);
 const zones=e.zones??[],low=zones.length?Math.min(...zones.map(z=>z.low)):null;
 const features={overshootPct:low>0?(1-e.markPrice/low)*100:null,rsi14:coin?rsi(coin.map(c=>c.close)):null,
  ratioLevel:rr?.at(-1).v??null,ratioChange1h:rr?pct(rr.at(-1).v,rr[0].v):null,oiChange1h:oi?pct(oi.at(-1).v,oi[0].v):null,
  btcReturn15m:btc?pct(btc.at(-1).close,btc.at(-4).close):null,btcReturn1h:btc?pct(btc.at(-1).close,btc[0].close):null};
 if(!coin)missing.push('COIN_240_CLOSED_5M_MISSING_OR_STALE');if(!rr)missing.push('TOP_ACCOUNT_RATIO_1H_MISSING_OR_STALE');if(!oi)missing.push('OI_1H_MISSING_OR_STALE');
 const grade=longQualityGrade(features);
 return {version:LONG_QUALITY_VERSION,eventId:e.id,symbol:e.symbol,asOf:e.at,evaluatedAt:now,grade,label:LONG_QUALITY_LABELS[grade],proposedMarginUsdt:grade==='GOOD'?5:grade==='BAD'?1:null,
  features,checks:longQualityChecks(features),missing,btcContextOnly:true,
  sources:{coinBars:coin?.length??0,coinClosedAt:coin?.at(-1).end??null,ratioAt:rr?.at(-1).at??null,ratioFetchedAt:ratio?.fetchedAt??null,oiAt:oi?.at(-1).at??null,rawSavedAt:raw?.savedAt??null,
   ratioSource:'BINANCE_TOP_TRADER_ACCOUNT_RATIO',ratioOiLagMs:STEP}};
}
// Candidate only; bounded loading budget does not block the scanner or change its REST universe.
export class HeatmapLongQualityLoader{
 constructor({load,now=Date.now,timeoutMs=4000,maxConcurrent=2}={}){Object.assign(this,{load,now,timeoutMs,maxConcurrent});this.inflight=0;}
 async assess(event){
  const unknown=reason=>{const q=evaluateHeatmapLongQuality({event,now:this.now()});q.missing.push(reason);return q;};
  if(this.inflight>=this.maxConcurrent)return unknown('LONG_CONTEXT_BUSY');
  this.inflight++;let timer;
  const pending=Promise.resolve().then(()=>this.load(event)).finally(()=>{this.inflight--;});
  try{const data=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LONG_CONTEXT_TIMEOUT')),this.timeoutMs);})]);return evaluateHeatmapLongQuality({event,...data,now:this.now()});}
  catch{return unknown('LONG_CONTEXT_UNAVAILABLE_OR_TIMEOUT');}finally{clearTimeout(timer);}
 }
}
