import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
export const PUMPGLASS_POSITION_JOURNAL_VERSION='PUMPGLASS_POSITION_JOURNAL_V1_20261105';
const H=3600000,DAY=86400000;
const symbolOk=s=>typeof s==='string'&&/^[\p{L}\p{N}]{1,32}USDT$/u.test(s);
const pct=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=100;
export function positionTokenPoint(token,symbol,observedAt){
 if(token?.symbol!==symbol||!symbolOk(symbol)||token.basis!=='whales'||!Number.isInteger(token.whale_count)||token.whale_count<10||!Number.isFinite(token.scanned_at))return null;
 const sourceAt=token.scanned_at*1000;if(sourceAt>observedAt||observedAt-sourceAt>900000||!Array.isArray(token.now))return null;
 const point={sourceAt,observedAt,whaleCount:token.whale_count};
 for(const[key,label]of [['whaleLong','Whales'],['smartLong','Smart traders'],['crowdLong','Crowd']]){const rows=token.now.filter(r=>r?.k===label);if(rows.length!==1||!pct(rows[0].v))return null;point[key]=rows[0].v;}
 return point;
}
function validPoint(p){return p&&[p.sourceAt,p.observedAt].every(Number.isFinite)&&p.sourceAt>0&&p.observedAt>=p.sourceAt&&p.observedAt-p.sourceAt<=900000&&Number.isInteger(p.whaleCount)&&p.whaleCount>=10&&['whaleLong','smartLong','crowdLong'].every(k=>pct(p[k]));}
export class PumpglassPositionJournal{
 constructor({directory,getSymbols=()=>[],fetchImpl=fetch,now=Date.now}={}){Object.assign(this,{directory,getSymbols,fetchImpl,now});this.points=new Map();this.loaded=new Set();this.bad=new Set();this.queues=new Map();this.cursor=0;this.retryUntil=0;this.error=null;this.busy=false;this.coverage={};this.lastCollectAt=0;this.lastStartedAt=null;this.lastSourceErrors=[];}
 async init(){return this.initializing??=(async()=>{try{await mkdir(this.directory,{recursive:true});}catch{this.error='JOURNAL_INIT_FAILED';return;}try{const v=JSON.parse(await readFile(join(this.directory,'meta.json'),'utf8'));if(v.version!==PUMPGLASS_POSITION_JOURNAL_VERSION||!Number.isInteger(v.cursor)||!Number.isFinite(v.retryUntil)||v.cursor<0||v.retryUntil<0)throw Error('SCHEMA');this.cursor=v.cursor;this.retryUntil=v.retryUntil;}catch(e){if(e.code!=='ENOENT')this.error='JOURNAL_META_INVALID';}})();}
 async load(symbol){
  if(this.loaded.has(symbol))return;
  try{const x=JSON.parse(await readFile(join(this.directory,symbol+'.json'),'utf8'));if(x.version!==PUMPGLASS_POSITION_JOURNAL_VERSION||x.symbol!==symbol||!Array.isArray(x.points)||x.points.some((p,i)=>!validPoint(p)||(i&&p.sourceAt<=x.points[i-1].sourceAt)))throw Error('SCHEMA');this.points.set(symbol,x.points.filter(p=>p.sourceAt>=this.now()-3*DAY));}
  catch(e){if(e.code!=='ENOENT')this.bad.add(symbol);}
  this.loaded.add(symbol);
 }
 async saveMeta(){const file=join(this.directory,'meta.json'),tmp=file+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify({version:PUMPGLASS_POSITION_JOURNAL_VERSION,cursor:this.cursor,retryUntil:this.retryUntil,at:this.now()}));await rename(tmp,file);}
 capture(token,symbol){
  const task=(this.queues.get(symbol)??Promise.resolve()).catch(()=>{}).then(async()=>{
   await this.init();if(this.error||!symbolOk(symbol))return {status:'JOURNAL_UNAVAILABLE'};await this.load(symbol);if(this.bad.has(symbol))return {status:'JOURNAL_COIN_INVALID'};
   const point=positionTokenPoint(token,symbol,this.now());if(!point)return {status:'TOKEN_MISSING_OR_STALE'};
   const rows=(this.points.get(symbol)??[]).filter(p=>p.sourceAt>=this.now()-3*DAY),existing=rows.find(p=>p.sourceAt===point.sourceAt);
   if(existing&&['whaleLong','smartLong','crowdLong','whaleCount'].every(k=>existing[k]===point[k]))return {status:'UNCHANGED'};
   if(existing)existing.ambiguous=true;else rows.push(point);
   rows.sort((a,b)=>a.sourceAt-b.sourceAt);const kept=rows.slice(-512),file=join(this.directory,symbol+'.json'),tmp=file+'.tmp-'+process.pid;
   try{await writeFile(tmp,JSON.stringify({version:PUMPGLASS_POSITION_JOURNAL_VERSION,symbol,points:kept}));await rename(tmp,file);this.points.set(symbol,kept);return {status:existing?'SOURCE_TIMESTAMP_CONFLICT':'STORED'};}
   catch{this.bad.add(symbol);return {status:'JOURNAL_STORAGE_FAILED'};}
  });this.queues.set(symbol,task);return task.finally(()=>{if(this.queues.get(symbol)===task)this.queues.delete(symbol);});
 }
 async context(symbol,decisionAt,knownBy=this.now()){
  await this.init();await this.load(symbol);if(this.error||this.bad.has(symbol))return {status:'JOURNAL_UNAVAILABLE'};
  const rows=(this.points.get(symbol)??[]).filter(p=>!p.ambiguous&&p.sourceAt>=this.now()-3*DAY&&p.observedAt<=knownBy),cut=decisionAt-900000;
  const get=at=>{const p=rows.filter(p=>p.sourceAt<=at).at(-1);return p&&at-p.sourceAt<=1800000?p:null;},current=get(cut),previous=get(cut-4*H);
  if(!current||!previous)return {status:'WARMING_HISTORY',samples:rows.length,firstSourceAt:rows[0]?.sourceAt??null,earliestReadyAt:rows[0]?rows[0].sourceAt+4*H+900000:null};
  return {status:'READY',current,previous,cutoff:cut};
 }
 async collect(){
  await this.init();if(this.busy||this.error||this.now()<this.retryUntil||(this.lastStartedAt!==null&&this.now()-this.lastStartedAt<10000))return;this.busy=true;this.lastStartedAt=this.now();
  const c={at:this.now(),universe:0,checked:0,stored:0,unchanged:0,rejected:0};
  try{const symbols=[...new Set((await this.getSymbols()).filter(symbolOk))].sort();c.universe=symbols.length;if(!symbols.length)return;
   // Four tokens per ten-second tick, with a fair cursor across the whole universe.
   for(let i=0;i<Math.min(4,symbols.length);i++){
    const symbol=symbols[this.cursor++%symbols.length];c.checked++;
    try{const r=await this.fetchImpl('https://pumpglass.com/smart-money/api/token?symbol='+encodeURIComponent(symbol),{redirect:'error',cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(8000)});
     if(!r.ok){if([403,418,429].includes(r.status)){c.rejected++;this.retryUntil=this.now()+900000;break;}throw Error('HTTP_'+r.status);}
     const result=await this.capture(await r.json(),symbol);if(result.status==='STORED')c.stored++;else if(result.status==='UNCHANGED')c.unchanged++;else c.rejected++;
    }catch{c.rejected++;}
   }
   await this.saveMeta();this.lastCollectAt=this.now();
  }catch{this.error='JOURNAL_COLLECT_FAILED';}finally{this.coverage=c;this.busy=false;}
 }
 start(){if(this.timer)return;void this.collect();this.timer=setInterval(()=>void this.collect(),10000);this.timer.unref?.();}
 stop(){clearInterval(this.timer);this.timer=null;}
 snapshot(){let valid=0,readyHistory=0,oldest=Infinity;for(const rows of this.points.values()){const good=rows.filter(p=>!p.ambiguous&&p.sourceAt>=this.now()-3*DAY);if(good.length){valid++;oldest=Math.min(oldest,good[0].sourceAt);if(good.at(-1).sourceAt-good[0].sourceAt>=4*H)readyHistory++;}}
  return {version:PUMPGLASS_POSITION_JOURNAL_VERSION,error:this.error,collecting:this.busy,coverage:this.coverage,updatedAt:this.lastCollectAt||null,symbolsWithSamples:valid,symbolsWith4hSpan:readyHistory,invalidCoins:this.bad.size,oldestSourceAt:Number.isFinite(oldest)?oldest:null,retryUntil:this.retryUntil,intervalMs:10000,maxChecksPerTick:4,requiresFreshVerifiedTokens:true};
 }
}
