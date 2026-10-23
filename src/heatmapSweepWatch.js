import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {heatmapConsensusZones} from './heatmapEntryScenarios.js';
export const HEATMAP_SWEEP_VERSION='HEATMAP_DUAL_SWEEP_MARKET_V3_20261020';
export const HEATMAP_SWEEP_LOAD_POLICY_VERSION='HEATMAP_SWEEP_CACHE_REARM_BOUNDED3_V1_20261020';
const STEP=300000,TTL=15*60000,DAY=86400000;
const symbolOk=s=>/^[\p{L}\p{N}]{1,32}USDT$/u.test(s??'');
const ranges=new Set(['12h','24h','3d','7d','30d']);
const fresh=(p,now)=>p&&Number.isFinite(p.price)&&p.price>0&&Number.isFinite(p.at)&&p.at<=now+1000&&now-p.at<=10000;
export function heatmapSweepCohortId(symbol,asOf,zones,direction='UPPER'){
 const key=createHash('sha256').update(JSON.stringify([direction,symbol,asOf,zones.map(z=>[z.low,z.high])])).digest('hex').slice(0,20);
 return `heatmap-${direction.toLowerCase()}:${symbol}:${key}`;
}
export function prepareHeatmapSweepCohort(bundle,point,now,maxDistancePct=5,direction='UPPER'){
 if(!['UPPER','LOWER'].includes(direction))return {reason:'Hướng cụm không hợp lệ.'};
 const data=n=>bundle?.models?.find(m=>m.model===n&&m.status==='OK')?.data;
 const a=data(1),b=data(3);
 if(!a||!b||a.source!=='BINANCE_LOCAL'||b.source!=='BINANCE_LOCAL')return {reason:'Thiếu hai model Binance thật; không suy ra đã quét.'};
 if(a.symbol!==b.symbol||a.range!=='24h'||b.range!=='24h'||a.step!==STEP||b.step!==STEP||a.end!==b.end)return {reason:'Hai model phải đồng bộ 24h/nến5m.'};
 const candle=a.candles.at(-1),asOf=candle?.time+STEP-1;
 if(a.end!==asOf+1||b.candles?.at(-1)?.time!==candle?.time)return {reason:'Mốc nến hai model không khớp.'};
 if(!Number.isFinite(asOf)||asOf>=now||now-asOf>STEP+120000)return {reason:'Nến 5m đã cũ hoặc chưa đóng.'};
 if(!fresh(point,now))return {reason:'Chờ tick MARK mới (≤10 giây).'};
 if(point.at<asOf)return {reason:'Chờ MARK sau nến chốt vùng.'};
 if(!Array.isArray(a.profiles)||!Array.isArray(b.profiles))return {reason:'Backend chưa có profile vùng trước giá.'};
 const selected=[...a.profiles.filter(p=>p.at<=asOf).slice(-3),...b.profiles.filter(p=>p.at<=asOf).slice(-3)];
 if(selected.length!==6||selected.some(p=>!p.mark))return {reason:'Thiếu MARK lịch sử ở ba nến chốt vùng.'};
 const merged=heatmapConsensusZones(a,b,asOf,STEP,candle.close);
 if(merged.status!=='OK')return {reason:'Profile/OI thiếu, cũ hoặc không đồng bộ.'};
 const upper=direction==='UPPER',referencePrice=upper?Math.max(candle.close,point.price):Math.min(candle.close,point.price);
 const zones=merged.zones.filter(z=>upper?z.low>referencePrice*1.001&&z.high<=point.price*(1+maxDistancePct/100)
  :z.high<referencePrice*.999&&z.low>=point.price*(1-maxDistancePct/100)).sort((x,y)=>upper?x.low-y.low:y.high-x.high)
  .map(z=>({...z,cleared:false,touched:false}));
 if(!zones.length)return {reason:`Chưa có cụm đồng thuận chưa chạm trong ${upper?'+':'−'}${maxDistancePct}% phía ${upper?'trên':'dưới'}.`};
 return {cohort:{id:heatmapSweepCohortId(a.symbol,asOf,zones,direction),symbol:a.symbol,direction,asOf,armedAt:now,expiresAt:now+TTL,referencePrice:point.price,
  maxDistancePct,zones,lastTickAt:point.at,lastPrice:point.price,peakPrice:point.price,maxTickGapMs:0,state:'ARMED',firstReserved:false,allReserved:false}};
}
export class HeatmapSweepWatch{
 constructor({file,loadBundle,loadCachedBundle=null,getLoaderStats=()=>null,getUniverse=()=>[],getLive=()=>null,onSymbolsChanged=()=>{},blocked=()=>false,discordSender=null,onFullSweep=null,now=Date.now,maxWatches=10,maxInFlight=3}={}){
  Object.assign(this,{file,loadBundle,loadCachedBundle,getLoaderStats,getUniverse,getLive,onSymbolsChanged,blocked,discordSender,onFullSweep,now,maxWatches});
  this.maxInFlight=Math.min(3,Math.max(1,maxInFlight));this.activeLoads=new Set();this.cacheWarmBusy=false;this.cacheRestored=0;
  this.marketEnabled=false;this.marketDistancePct=5;this.cooldowns={};
  this.watches=[];this.history=[];this.queue=Promise.resolve();this.error=null;this.cursor=0;this.scanBusy=false;this.initPromise=null;this.startedAt=now();
 }
 async init(){return this.initPromise??=this.load();}
 async load(){
  try{const s=JSON.parse(await readFile(this.file,'utf8'));if(![HEATMAP_SWEEP_VERSION,'HEATMAP_UPPER_SWEEP_MARKET_V2_20261018','HEATMAP_UPPER_SWEEP_WATCH_V1_20261018'].includes(s.version)||!Array.isArray(s.watches)||!Array.isArray(s.history))throw Error('schema');
   this.marketEnabled=s.marketEnabled===true;this.marketDistancePct=Number.isFinite(s.marketDistancePct)&&s.marketDistancePct>=.5&&s.marketDistancePct<=10?s.marketDistancePct:5;
   this.watches=s.watches.filter(w=>symbolOk(w.symbol)&&typeof w.enabled==='boolean').slice(0,this.maxWatches).map(w=>({symbol:w.symbol,enabled:w.enabled,viewRange:ranges.has(w.viewRange)?w.viewRange:'24h',maxDistancePct:Number.isFinite(w.maxDistancePct)&&w.maxDistancePct>=.5&&w.maxDistancePct<=10?w.maxDistancePct:5,
    lastAlertAt:Number.isFinite(w.lastAlertAt)?w.lastAlertAt:null,nextArmAt:Math.max(Number(w.nextArmAt)||0,this.startedAt),status:w.enabled?'WARMING':'OFF',reason:'Khởi động lại: chốt vùng mới, không phát lại lần quét cũ.',cohort:null}));
   this.history=s.history.filter(e=>e&&typeof e.id==='string'&&Number.isFinite(e.at)&&this.now()-e.at<14*DAY).slice(-500);
   this.cooldowns=Object.fromEntries(Object.entries(s.cooldowns??{}).filter(([k,t])=>k.length<150&&Number.isFinite(t)&&this.now()-t<TTL));
   for(const e of this.history)if(e.delivery?.status!=='COOLDOWN')this.cooldowns[e.symbol+':'+e.kind]=Math.max(this.cooldowns[e.symbol+':'+e.kind]??0,e.at);
  }catch(e){if(e.code!=='ENOENT')this.error='Không đọc được state; dừng theo dõi/gửi để kiểm tra.';}
  this.syncUniverse();this.publish();
 }
 syncUniverse(){
  const universe=new Set(this.marketEnabled?this.getUniverse().filter(symbolOk):[]);
  for(const w of this.watches){w.manualEnabled??=w.enabled;w.market=universe.has(w.symbol);w.enabled=w.manualEnabled||w.market;
   if(w.market)w.maxDistancePct=this.marketDistancePct;}
  for(const symbol of universe)if(!this.watches.some(w=>w.symbol===symbol))this.watches.push({symbol,market:true,manualEnabled:false,enabled:true,viewRange:'24h',maxDistancePct:this.marketDistancePct,
   status:'WARMING',reason:'Chờ lượt nạp hai model toàn thị trường.',cohort:null,nextLoadAt:0});
  this.watches=this.watches.filter(w=>w.manualEnabled||w.market);
 }
 publish(){this.onSymbolsChanged(this.error?[]:this.watches.filter(w=>w.enabled).map(w=>w.symbol));}
 run(fn){const p=this.queue.then(async()=>{await this.init();return fn();});this.queue=p.catch(()=>{});return p;}
 async save(){
  this.history=this.history.filter(e=>this.now()-e.at<14*DAY).slice(-500);
  this.cooldowns=Object.fromEntries(Object.entries(this.cooldowns).filter(([,t])=>this.now()-t<TTL));
  const stored={version:HEATMAP_SWEEP_VERSION,marketEnabled:this.marketEnabled,marketDistancePct:this.marketDistancePct,
   watches:this.watches.filter(w=>w.manualEnabled??w.enabled).map(({symbol,manualEnabled,enabled,viewRange,maxDistancePct,lastAlertAt,nextArmAt})=>({symbol,enabled:manualEnabled??enabled,viewRange,maxDistancePct,lastAlertAt,nextArmAt})),history:this.history,cooldowns:this.cooldowns};
  if(!this.file)return;
  try{await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(stored));await rename(tmp,this.file);}
  catch{this.error='Không lưu được state; dừng gửi.';this.publish();throw Error('HEATMAP_SWEEP_STORAGE_FAILED');}
 }
 update({action,symbol,enabled,viewRange='24h',maxDistancePct=5}={}){return this.run(async()=>{
  if(this.error)throw Error(this.error);
  if(action==='market'){
   if(typeof enabled!=='boolean'||!Number.isFinite(maxDistancePct)||maxDistancePct<.5||maxDistancePct>10)throw Error('Cấu hình thị trường không hợp lệ.');
   if(enabled===this.marketEnabled&&maxDistancePct===this.marketDistancePct)return this.snapshot();
   this.marketEnabled=enabled;this.marketDistancePct=maxDistancePct;
   this.syncUniverse();for(const w of this.watches){w.cohort=null;w.lowerCohort=null;w.status='WARMING';w.nextLoadAt=0;}
   this.nextBatchAt=0;await this.save();this.publish();return this.snapshot();
  }
  if(this.marketEnabled)throw Error('Đang bật toàn thị trường; dùng cấu hình thị trường.');
  if(!symbolOk(symbol)||typeof enabled!=='boolean'||!ranges.has(viewRange)||!Number.isFinite(maxDistancePct)||maxDistancePct<.5||maxDistancePct>10)throw Error('Cấu hình không hợp lệ.');
  let w=this.watches.find(w=>w.symbol===symbol);
  if(!w&&this.watches.filter(w=>w.enabled).length>=this.maxWatches&&enabled)throw Error(`Tối đa ${this.maxWatches} coin theo dõi.`);
  if(!w){w={symbol};this.watches.push(w);}
  if(enabled&&!w.enabled&&this.watches.filter(x=>x.enabled).length>=this.maxWatches)throw Error(`Tối đa ${this.maxWatches} coin theo dõi.`);
  const changed=w.enabled!==enabled||w.maxDistancePct!==maxDistancePct;
  Object.assign(w,{enabled,manualEnabled:enabled,viewRange,maxDistancePct});
  if(changed){w.cohort=null;w.lowerCohort=null;w.status=enabled?'WARMING':'OFF';w.reason=enabled?'Chờ chốt vùng mới hai phía giá hiện tại.':'Đã tắt.';w.nextLoadAt=0;}
  this.watches=this.watches.filter(x=>x.enabled||x.symbol===symbol);await this.save();this.publish();return this.snapshot();
 });}
 armBundle(w,bundle,at){
  const point=this.getLive(w.symbol),prepared=prepareHeatmapSweepCohort(bundle,point,at,w.maxDistancePct),lower=prepareHeatmapSweepCohort(bundle,point,at,w.maxDistancePct,'LOWER');w.lastLoadedAt=at;
  if([1,3].every(n=>bundle?.models?.some(m=>m.model===n&&m.status==='OK')))w.lastDataAt=at;
  w.cohort=prepared.cohort?.symbol===w.symbol?prepared.cohort:null;w.lowerCohort=lower.cohort?.symbol===w.symbol?lower.cohort:null;
  if(w.cohort||w.lowerCohort){w.status='ARMED';w.reason='Vùng hai phía đã chốt; chỉ xét các tick MARK sau lúc bật.';}
  else {w.status='WAIT_DATA';w.reason=prepared.reason??'Coin trong bundle không khớp coin theo dõi.';w.nextLoadAt=at+60000;}
 }
 async warmCache(){
  await this.init();if(this.error||!this.marketEnabled||!this.loadCachedBundle||this.cacheWarmBusy||this.now()<(this.nextCacheWarmAt??0))return;
  this.cacheWarmBusy=true;this.nextCacheWarmAt=this.now()+1000;
  try{const due=this.watches.filter(w=>w.enabled&&!w.cacheChecked&&!w.lastLoadedAt&&!this.activeLoads.has(w.symbol)).slice(0,8);
   for(const w of due){w.cacheChecked=true;let bundle;try{bundle=await this.loadCachedBundle({symbol:w.symbol,range:'24h'});}catch{continue;}
    if(!bundle||this.error||!w.enabled||!this.watches.includes(w)||w.lastLoadedAt||this.activeLoads.has(w.symbol))continue;
    this.armBundle(w,bundle,this.now());w.nextLoadAt=this.now()+STEP;w.loadedVia='FRESH_RAW_CACHE';this.cacheRestored++;
   }
  }finally{this.cacheWarmBusy=false;}
 }
 async scan(){
  await this.init();if(this.error||this.activeLoads.size>=(this.marketEnabled?this.maxInFlight:1)||this.blocked())return;
  const before=this.watches.map(w=>w.symbol).join(',');this.syncUniverse();if(before!==this.watches.map(w=>w.symbol).join(','))this.publish();
  const now=this.now();for(const w of this.watches)for(const c of [w.cohort,w.lowerCohort])if(c?.state==='ARMED'&&now>=c.expiresAt){c.state='EXPIRED';w.status='EXPIRED';w.reason='Hết hạn 15 phút; chờ chốt vùng mới.';w.nextLoadAt=0;}
  const due=this.watches.filter(w=>w.enabled&&!this.activeLoads.has(w.symbol)&&![w.cohort,w.lowerCohort].some(c=>c?.state==='ARMED')&&now>=(w.nextArmAt??0)&&now>=(w.nextLoadAt??0));
  if(!due.length||now<(this.nextBatchAt??0))return;this.nextBatchAt=now+(this.marketEnabled?1000:30000);
  const w=due.sort((a,b)=>(a.lastLoadedAt??0)-(b.lastLoadedAt??0))[0];this.activeLoads.add(w.symbol);this.scanBusy=true;w.nextLoadAt=now+STEP;
  try{
   const bundle=await this.loadBundle({symbol:w.symbol,range:'24h'});
   if(!w.enabled||!this.watches.includes(w)||this.error)return;
   this.armBundle(w,bundle,this.now());w.loadedVia='REST_OR_SHARED_CACHE';
  }catch{w.lastLoadedAt=this.now();w.status='WAIT_DATA';w.reason='Chưa tải được bundle; chờ lượt tiếp theo, không suy ra quét.';}
  finally{this.activeLoads.delete(w.symbol);this.scanBusy=this.activeLoads.size>0;}
 }
 onMark(tick){
  const w=this.watches.find(w=>w.enabled&&w.symbol===tick.symbol);
  return Promise.all([w?.cohort,w?.lowerCohort].filter(Boolean).map(c=>this.onCohortMark(w,c,tick)));
 }
 onCohortMark(w,c,tick){
  const now=this.now(),p={price:Number(tick.markPrice),at:Number(tick.eventTime)},upper=c.direction!=='LOWER';
  if(this.error||!c||c.state!=='ARMED'||!fresh(p,now)||p.at<c.armedAt||p.at<=c.lastTickAt)return Promise.resolve();
  if(now>=c.expiresAt){c.state='EXPIRED';w.status='EXPIRED';w.reason='Hết hạn 15 phút; chờ chốt vùng mới.';w.nextLoadAt=0;return Promise.resolve();}
  if(p.at-c.lastTickAt>10000){c.state='GAP';w.status='GAP';w.reason='Gián đoạn MARK >10 giây: không phát lại lần quét qua khoảng trống.';w.nextLoadAt=0;return Promise.resolve();}
  const previousTickAt=c.lastTickAt,previousMarkPrice=c.lastPrice;
  c.maxTickGapMs=Math.max(c.maxTickGapMs??0,p.at-c.lastTickAt);c.lastTickAt=p.at;c.lastPrice=p.price;c.peakPrice=upper?Math.max(c.peakPrice,p.price):Math.min(c.peakPrice,p.price);
  for(const z of c.zones){if(upper?p.price>=z.low:p.price<=z.high)z.touched=true;if(upper?p.price>=z.high:p.price<=z.low){z.cleared=true;z.clearedAt??=p.at;}}
  const cleared=c.zones.filter(z=>z.cleared),all=cleared.length===c.zones.length;
  if(!cleared.length||all&&c.allReserved||!all&&c.firstReserved)return Promise.resolve();
  const kind=all?`ALL_TRACKED_${upper?'UPPER':'LOWER'}_SWEPT`:`${upper?'UPPER':'LOWER'}_CLUSTER_SWEPT`;if(all){c.allReserved=true;c.state='COMPLETE';w.status='COMPLETE';w.reason='Đã quét hết các cụm đã chốt trong phạm vi theo dõi.';}else c.firstReserved=true;
  const e={version:HEATMAP_SWEEP_VERSION,id:c.id+':'+kind,kind,symbol:w.symbol,viewRange:w.viewRange,at:p.at,observedAt:now,armedAt:c.armedAt,zonesAsOf:c.asOf,
   direction:upper?'UPPER':'LOWER',cohortId:c.id,cohortExpiresAt:c.expiresAt,previousTickAt,previousMarkPrice,maxTickGapMs:c.maxTickGapMs,
   referencePrice:c.referencePrice,markPrice:p.price,maxDistancePct:c.maxDistancePct,clearedCount:cleared.length,totalCount:c.zones.length,zones:structuredClone(c.zones),delivery:{status:'PENDING'}};
  return this.run(async()=>{
   if(this.error||!w.enabled||this.history.some(x=>x.id===e.id))return;
   const cooldownKey=e.symbol+':'+e.kind,lastAlert=this.cooldowns[cooldownKey];
   const cooling=Number.isFinite(lastAlert)&&e.at-lastAlert>=0&&e.at-lastAlert<TTL;
   if(cooling)e.delivery={status:'COOLDOWN'};
   else this.cooldowns[cooldownKey]=e.at;
   w.lastAlertAt=e.at;if(all)w.nextArmAt=c.expiresAt;this.history.push(e);
   await this.save(); // durable reservation BEFORE Discord; never retry unknown outcomes/restarts
   if(cooling)return;
   // Entry is independent of webhook delivery and is never replayed from history.
   if(all&&this.onFullSweep){try{e.binance=await this.onFullSweep(structuredClone(e));}catch{e.binance={status:'CALLBACK_ERROR_OR_UNKNOWN'};}await this.save();}
   if(!this.discordSender)e.delivery={status:'NOT_CONFIGURED'};
   else if(this.now()-e.at>30000)e.delivery={status:'EXPIRED',reason:'Không gửi trễ quá30giây.'};
   else try{const r=await this.discordSender(e);e.delivery={...r,status:r.sent>0?'SENT':'FAILED',at:this.now()};}catch{e.delivery={status:'UNKNOWN',at:this.now()};}
   await this.save();
  }).catch(()=>{});
 }
 start(){void this.init().then(()=>{void this.warmCache();void this.scan();});this.timer=setInterval(()=>{void this.warmCache();void this.scan();},1000);this.timer.unref?.();}
 stop(){clearInterval(this.timer);}
 isCurrentFullSweep(e){
  const w=this.watches.find(w=>w.enabled&&w.symbol===e?.symbol);
  return !this.error&&!!w&&[w.cohort,w.lowerCohort].some(c=>c?.id===e.cohortId&&c.state==='COMPLETE'&&c.allReserved===true)
   &&this.history.some(h=>h.id===e.id&&h.version===HEATMAP_SWEEP_VERSION&&h.kind.startsWith('ALL_TRACKED_')&&h.delivery?.status!=='COOLDOWN');
 }
 snapshot(id=null){return structuredClone({version:HEATMAP_SWEEP_VERSION,observeOnly:!this.onFullSweep,affectsOrders:!!this.onFullSweep,discordConfigured:!!this.discordSender,error:this.error,maxWatches:this.maxWatches,
  marketEnabled:this.marketEnabled,marketDistancePct:this.marketDistancePct,
  loadPolicyVersion:HEATMAP_SWEEP_LOAD_POLICY_VERSION,loader:this.getLoaderStats(),
  coverage:{total:this.watches.filter(w=>w.enabled).length,checked:this.watches.filter(w=>w.enabled&&w.lastLoadedAt).length,loaded:this.watches.filter(w=>w.enabled&&w.lastDataAt).length,
   armed:this.watches.filter(w=>w.enabled&&[w.cohort,w.lowerCohort].some(c=>c?.state==='ARMED'&&this.now()<c.expiresAt)).length,
   waiting:this.watches.filter(w=>w.enabled&&w.status==='WAIT_DATA').length,unloaded:this.watches.filter(w=>w.enabled&&!w.lastLoadedAt).length,
   expired:this.watches.filter(w=>w.enabled&&![w.cohort,w.lowerCohort].some(c=>c?.state==='ARMED'&&this.now()<c.expiresAt)&&[w.cohort,w.lowerCohort].some(c=>c?.state==='EXPIRED'||c?.state==='ARMED'&&this.now()>=c.expiresAt)).length,
   inFlight:this.activeLoads.size,cacheRestored:this.cacheRestored,updatedAt:this.now()},
  policy:{range:'24h',interval:'5m',maxDistancePctDefault:5,cohortTtlMinutes:15,maxBundleLoadsPerMinute:this.marketEnabled?60:2,maxInFlight:this.marketEnabled?this.maxInFlight:1,maxCacheRestoresPerSecond:8,noHistoryReplay:true},
  watches:this.watches.map(w=>({...w,status:[w.cohort,w.lowerCohort].some(c=>c?.state==='ARMED'&&this.now()<c.expiresAt)?'ARMED':
   [w.cohort,w.lowerCohort].some(c=>c?.state==='ARMED'&&this.now()>=c.expiresAt)?'EXPIRED':w.status})),history:this.history.slice(-50).reverse(),selected:id?this.history.find(e=>e.id===id)??null:null});}
}
