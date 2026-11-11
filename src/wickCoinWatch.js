import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
export const WICK_COIN_VERSION='WICK_COIN_AIN_TIERS_V3_20261101';
export const WICK_COIN_RULE=Object.freeze({minRangePct:8,minQuoteVolume:1000000,minVolumeX:3,minWickPct:50,cooldownMs:3600000});
export const WICK_COIN_EXPANDED_RULE=Object.freeze({...WICK_COIN_RULE,minRangePct:4,minQuoteVolume:500000,minWickPct:40});
const S=900000,DAY=86400000;
const median=a=>{a.sort((a,b)=>a-b);return (a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2;};
export function aggregateWickBars(raw,now){
 const groups=new Map();for(const x of raw??[]){if(!Array.isArray(x)||+x[6]>=now)continue;const t=Math.floor(+x[0]/S)*S;if(!groups.has(t))groups.set(t,[]);groups.get(t).push(x);}
 const out=[];for(const[t,rs]of groups){rs.sort((a,b)=>a[0]-b[0]);if(rs.length!==3||rs.some((x,j)=>+x[0]!==t+j*300000||+x[6]!==+x[0]+299999))continue;
 const b={t,o:+rs[0][1],h:Math.max(...rs.map(x=>+x[2])),l:Math.min(...rs.map(x=>+x[3])),c:+rs[2][4],q:rs.reduce((s,x)=>s+(+x[7]),0)};
 if(Object.values(b).every(Number.isFinite)&&Math.min(b.o,b.h,b.l,b.c)>0&&b.q>=0&&b.h>=Math.max(b.o,b.c)&&b.l<=Math.min(b.o,b.c))out.push(b);}
 return out.sort((a,b)=>a.t-b.t);
}
export function findWickCoins(rows,now,rule=WICK_COIN_RULE){
 const events=[];let last=-Infinity;for(let i=21;i<rows.length;i++){
 const b=rows[i];if(b.t+S<now-DAY||b.t+S>now||b.t+S-last<rule.cooldownMs)continue;
 if(rows.slice(i-21,i+1).some((x,j,a)=>j&&x.t-a[j-1].t!==S))continue;
 const atr=rows.slice(i-14,i).reduce((s,x,j)=>s+Math.max(x.h-x.l,Math.abs(x.h-rows[i-15+j].c),Math.abs(x.l-rows[i-15+j].c)),0)/14;
 const span=b.h-b.l,baseline=median(rows.slice(i-20,i).map(x=>x.q)),upper=(b.h-Math.max(b.o,b.c))/span,lower=(Math.min(b.o,b.c)-b.l)/span;
 if(!(atr>0&&baseline>0&&span>=2*atr&&Math.max(upper,lower)*100>=rule.minWickPct&&b.q/baseline>=rule.minVolumeX&&span/b.o*100>=rule.minRangePct&&b.q>=rule.minQuoteVolume))continue;
 const base=rows.slice(i-12,i),hi=Math.max(...base.map(x=>x.h)),lo=Math.min(...base.map(x=>x.l)),travel=base.reduce((s,x,j)=>s+Math.abs(x.c-(j?base[j-1].c:rows[i-13].c)),0),eff=travel?Math.abs(base.at(-1).c-rows[i-13].c)/travel:0;
 if((hi-lo)/atr>8||eff>.35)continue;
 events.push({at:b.t+S,price:b.c,rangePct:span/b.o*100,quoteVolume:b.q,volumeX:b.q/baseline,wickPct:Math.max(upper,lower)*100,wickSide:upper>=lower?'UPPER':'LOWER',atr,baseHigh:hi,baseLow:lo,widthAtr:(hi-lo)/atr,efficiency:eff});last=b.t+S;
 }return events;
}
export function currentWickRatio(rows,now){
 const rs=(rows??[]).filter(x=>+x.timestamp<=now-900000&&+x.longShortRatio>0).sort((a,b)=>+a.timestamp-+b.timestamp),last=rs.at(-1);
 if(!last||now-last.timestamp>45*60000)return null;
 return {at:+last.timestamp,ratio:+last.longShortRatio,shortPct:100/(1+(+last.longShortRatio))};
}
export class WickCoinWatch{
 constructor({directory,getUniverse=()=>[],loadContext=async()=>null,now=Date.now}={}){Object.assign(this,{directory,getUniverse,loadContext,now});this.rows=[];this.strictRows=[];this.context=new Map();this.updatedAt=0;this.error=null;this.coverage={};this.contextAt=0;}
 async refresh(){if(this.pending)return this.pending;return this.pending=(async()=>{const now=this.now(),rows=[],strictRows=[],universe=new Set(this.getUniverse());let files=0,usable=0,stale=0,invalid=0;try{const names=await readdir(this.directory);for(const f of names.filter(f=>f.endsWith('.json'))){files++;try{const raw=JSON.parse(await readFile(join(this.directory,f),'utf8'));if(!/^[\p{L}\p{N}]{1,32}USDT$/u.test(raw.symbol)||universe.size&&!universe.has(raw.symbol))continue;const bars=aggregateWickBars(raw.price,now);if(bars.length<36){invalid++;continue;}usable++;const strictEvents=findWickCoins(bars,now),events=findWickCoins(bars,now,WICK_COIN_EXPANDED_RULE);if(!events.length)continue;const last=bars.at(-1),age=now-(last.t+S),isStale=age>30*60000;if(isStale)stale++;
 const makeRow=(es,tier)=>({symbol:raw.symbol,last:es.at(-1),events:es,count:es.length,repeated:es.length>=2,dataAt:last.t+S,stale:isStale,price:last.c,changeSincePct:(last.c/es.at(-1).price-1)*100,candles:bars.slice(-72),tier,strictCount:strictEvents.length});
 rows.push(makeRow(events,strictEvents.length?'STRICT':'EXPANDED'));if(strictEvents.length)strictRows.push(makeRow(strictEvents,'STRICT'));
 }catch{invalid++;}}
 this.strictRows=strictRows;this.rows=rows.sort((a,b)=>b.count-a.count||b.last.at-a.last.at);this.updatedAt=now;this.coverage={files,usable,stale,invalid};this.error=null;
 }catch{this.error='Không đọc được dữ liệu nến';}finally{this.pending=null;}})();}
 async enrich(symbol){const now=this.now();if(this.context.has(symbol)&&now-this.context.get(symbol).readAt<15*60000)return true;if(this.contextPending||now-this.contextAt<15000)return false;this.contextAt=now;this.contextPending=true;try{const data=await this.loadContext(symbol);if(data)this.context.set(symbol,{...data,readAt:this.now()});return !!data;}catch{return false;}finally{this.contextPending=false;}}
 async snapshot(){if(this.now()-this.updatedAt>60000)await this.refresh();const now=this.now();const next=this.rows.filter(r=>!r.stale).find(r=>!this.context.has(r.symbol)||now-this.context.get(r.symbol).readAt>15*60000);if(next)void this.enrich(next.symbol);
 const withContext=r=>{const c=this.context.get(r.symbol);return {...r,context:c?{...c,stale:now-c.readAt>15*60000}:null};};
 return {version:WICK_COIN_VERSION,rule:WICK_COIN_EXPANDED_RULE,rules:{strict:WICK_COIN_RULE,expanded:WICK_COIN_EXPANDED_RULE},strictRows:this.strictRows.map(withContext),generatedAt:now,updatedAt:this.updatedAt,error:this.error,coverage:this.coverage,observeOnly:true,affectsOrders:false,contextLoading:this.contextPending,rows:this.rows.map(r=>{const c=this.context.get(r.symbol);return {...r,context:c?{...c,stale:now-c.readAt>15*60000}:null};})};}
}
