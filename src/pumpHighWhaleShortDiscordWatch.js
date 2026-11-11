import {mkdir,readdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {mergeEarlyPumpBars} from './earlyPumpWatch.js';
import {priceFeatures,provePumpHighWhaleShort,PUMP_HIGH_WHALE_SHORT_GROUP} from './pumpHighWhaleShortModel.js';
export const PUMP_HIGH_WHALE_SHORT_DISCORD_VERSION='PUMP_HIGH_WHALE_SHORT_DISCORD_V1_20261103';
export const PUMP_HIGH_WHALE_SHORT_DATA_VERSION='PUMP_HIGH_WHALE_SHORT_DATA_V2_20261104';
export const PUMP_HIGH_WHALE_SHORT_RULE=Object.freeze({scanMs:60000,cooldownMs:8*3600000,maxChecks:6,maxSends:3,sourceLagMinutes:15,maxPriceAgeMs:450000,maxLiveSourceAgeMs:900000,minPumpPct:15,minHeightPct:80,minCrowdShortPct:60,crowdDelta1hPp:'<0',whaleLongDelta4hPp:'<0',minWhales:10,color:0xf59e0b});
const symbolOk=s=>typeof s==='string'&&/^[\p{L}\p{N}]{1,32}USDT$/u.test(s);
const vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false});
const fmt=x=>Number(x).toFixed(2),delta=x=>(x>=0?'+':'')+fmt(x);
const fresh=(at,now,age)=>Number.isFinite(at)&&at<=now&&now-at<=age;
function validateWebhook(value){
 if(!value)return null;let u;try{u=new URL(value);}catch{throw Error('INVALID_WEBHOOK');}
 if(u.protocol!=='https:'||!['discord.com','discordapp.com'].includes(u.hostname)||u.username||u.password||u.port||u.search||u.hash||!/^\/api\/webhooks\/\d+\/[^/]+$/.test(u.pathname))throw Error('INVALID_WEBHOOK');return u.href;
}
export function pumpHighWhaleShortPayload(e){
 const p=e.position,s=e.price,symbol=encodeURIComponent(e.symbol);
 return {username:'Bơm cao · Cá voi giảm LONG',allowed_mentions:{parse:[]},embeds:[{
  title:'🟠 '+e.symbol+' · THEO DÕI SHORT',color:PUMP_HIGH_WHALE_SHORT_RULE.color,
  description:'**BƠM CAO · SHORT ĐÔNG GIẢM RÒNG · CÁ VOI GIẢM LONG**\nNhánh nghiên cứu để theo dõi nhịp điều chỉnh. Chưa xác nhận tạo đỉnh hoặc cá voi mở thêm SHORT.',
  fields:[
   {name:'GIÁ ĐÓNG BINANCE 5m',value:'Giá: **'+s.price+'**\nTăng từ đáy 24h: **'+fmt(s.pumpPct)+'%**\nVị trí trong biên 24h: **'+fmt(s.heightPct)+'%**\nNến đóng: '+vn(e.decisionAt)+' VN'},
   {name:'SHORT ĐÁM ĐÔNG · PUMPGLASS',value:fmt(p.previousCrowdShort)+'% → **'+fmt(p.crowdShort)+'%**\nThay đổi 1h: **'+delta(p.crowdDelta1hPp)+' điểm %**\nNguồn: '+vn(p.crowdAt)+' VN'},
   {name:'LONG CÁ VOI · PUMPGLASS',value:fmt(p.previousWhaleLong)+'% → **'+fmt(p.whaleLong)+'%**\nThay đổi 4h: **'+delta(p.whaleDelta4hPp)+' điểm %**\nNhóm có '+p.whaleCount+' cá voi theo nguồn\nNguồn: '+vn(p.whaleAt)+' VN'},
   {name:'CÁCH ĐỌC',value:'Dùng tỷ trọng trễ 15 phút trước nến đóng, cùng cách kiểm tra backtest. Hai mức giảm có thể nhỏ; giảm LONG chưa chứng minh mở thêm SHORT. Model 1/3 chưa là điều kiện lọc của nhánh này. Giá vẫn có thể bơm tiếp. Chỉ quan sát, không gửi lệnh Binance.'},
   {name:'MỞ COIN',value:'[Model 1/3](https://liquidity.nhathadev.trade/coinglass-heatmap-lab?symbol='+symbol+'&range=24h) · [PumpGlass](https://pumpglass.com/smart-money/'+symbol+') · [Binance](https://www.binance.com/en/futures/'+symbol+')'},
  ],timestamp:new Date(e.observedAt).toISOString(),footer:{text:PUMP_HIGH_WHALE_SHORT_DISCORD_VERSION+' | OBSERVE ONLY | Lặp tối đa 1 lần/coin/8h'},
 }]};
}
export class PumpHighWhaleShortDiscordWatch{
 constructor({file,directory,getSymbols=()=>[],getRows=()=>[],priceSource=null,strategy=null,webhookUrl,prepareExecution=null,onDelivered=null,fetchImpl=fetch,now=Date.now}={}){
  Object.assign(this,{file,directory,getSymbols,getRows,priceSource,strategy,fetchImpl,now});this.prepareExecution=prepareExecution;this.onDelivered=onDelivered;this.version=strategy?.version??PUMP_HIGH_WHALE_SHORT_DISCORD_VERSION;this.group=strategy?.group??PUMP_HIGH_WHALE_SHORT_GROUP;this.rule=strategy?.rule??PUMP_HIGH_WHALE_SHORT_RULE;this.webhook=validateWebhook(webhookUrl);
  this.state={version:this.version,alerts:{},history:[],retryUntil:0};this.error=null;this.lastError=null;this.busy=false;this.checked=new Map();this.coverage={};this.sourceTotals={requests:0,retries:0,timeouts:0,failures:0};
 }
 async init(){return this.initializing??=(async()=>{try{
  const s=JSON.parse(await readFile(this.file,'utf8'));
  if(s.version!==this.version||!s.alerts||typeof s.alerts!=='object'||Array.isArray(s.alerts)||!Array.isArray(s.history)||!Number.isFinite(s.retryUntil)||s.retryUntil<0||Object.entries(s.alerts).some(([symbol,a])=>!symbolOk(symbol)||!Number.isFinite(a?.at)||typeof a?.eventId!=='string'))throw Error('STATE_SCHEMA');
  this.state=s;
 }catch(e){if(e.code!=='ENOENT')this.error='STATE_READ_FAILED_NO_SEND';}})();}
 async save(){
  const now=this.now();this.state.history=this.state.history.filter(e=>fresh(e.observedAt,now,7*86400000)).slice(-500);
  this.state.alerts=Object.fromEntries(Object.entries(this.state.alerts).filter(([,e])=>fresh(e.at,now,7*86400000)));
  await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(this.state));await rename(tmp,this.file);
 }
 canSend(symbol,eventId){const p=this.state.alerts[symbol];return !p||(p.eventId!==eventId&&this.now()-p.at>=this.rule.cooldownMs);}
 async json(url,{deadline=Infinity}={}){
  for(let attempt=0;attempt<2;attempt++){
   const remaining=deadline-this.now();if(remaining<500){const e=new Error('SOURCE_SCAN_BUDGET');e.sourceCode='SOURCE_SCAN_BUDGET';throw e;}
   try{
    this.sourceTotals.requests++;
    const response=await this.fetchImpl(url,{redirect:'error',cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(Math.min(8000,remaining))});
    if(!response.ok){
     if([403,418,429].includes(response.status)){this.state.retryUntil=this.now()+15*60000;try{await this.save();}catch{this.error='STORAGE_FAILED_NO_SEND';}}
     const e=new Error('UPSTREAM_HTTP_'+response.status);e.sourceCode=e.message;e.retryable=[500,502,503,504].includes(response.status);throw e;
    }
    try{return await response.json();}catch{const e=new Error('UPSTREAM_INVALID_JSON');e.sourceCode=e.message;e.retryable=false;throw e;}
   }catch(error){
    const timedOut=['TimeoutError','AbortError'].includes(error.name);if(timedOut)this.sourceTotals.timeouts++;
    const code=error.sourceCode??(timedOut?'UPSTREAM_TIMEOUT':'UPSTREAM_NETWORK');
    if(attempt===0&&error.retryable!==false&&!this.error&&this.now()>=this.state.retryUntil&&deadline-this.now()>=500){this.sourceTotals.retries++;continue;}
    this.sourceTotals.failures++;error.sourceCode=code;throw error;
   }
  }
 }
 matchesPrice(price){return this.strategy?.priceMatches?this.strategy.priceMatches(price):!!price?.pumpHigh;}
 async admitPrice(candidate,coverage,now){
  if(!this.strategy?.quickCheck)return true;
  const result=await this.strategy.quickCheck(candidate,now);if(result.status==='READY')return true;
  coverage.prefilter??={};coverage.prefilter[result.status]=(coverage.prefilter[result.status]??0)+1;return false;
 }
 async candidates(universe,coverage){
  const rows=new Map(),now=this.now();
  if(this.priceSource){
   const data=await this.priceSource.collect([...universe]),c=data.coverage;
   Object.assign(coverage,{files:c.total,priceReady:c.ready,stalePrice:c.counts.STALE,insufficientPrice:c.counts.INSUFFICIENT+c.counts.GAP_OR_INVALID,priceCoverage:c});
   for(const row of data.rows){if(row.status!=='READY'||!this.matchesPrice(row.price))continue;coverage.priceHigh++;if(this.canSend(row.symbol,'')&&await this.admitPrice(row,coverage,now))rows.set(row.symbol,{symbol:row.symbol,rows:row.rows,price:row.price});}
   return [...rows.values()].sort((a,b)=>(this.checked.get(a.symbol)??0)-(this.checked.get(b.symbol)??0)||a.symbol.localeCompare(b.symbol));
  }
  for(const name of (await readdir(this.directory)).filter(name=>name.endsWith('.json'))){
   coverage.files++;try{
    const raw=JSON.parse(await readFile(join(this.directory,name),'utf8'));
    if(!symbolOk(raw.symbol)||!universe.has(raw.symbol))continue;
    const bars=mergeEarlyPumpBars(raw.price,this.getRows(raw.symbol),now).map(b=>[b.t,b.o,b.h,b.l,b.c,0,b.end-1,b.q,0,0,b.buy]);
    const price=priceFeatures(bars).at(-1);
    if(!price){coverage.insufficientPrice++;continue;}
    if(!fresh(price.at,now,this.rule.maxPriceAgeMs)){coverage.stalePrice++;continue;}
    coverage.priceReady++;if(!this.matchesPrice(price))continue;coverage.priceHigh++;
    if(this.canSend(raw.symbol,'')&&await this.admitPrice({symbol:raw.symbol,rows:bars,price},coverage,now))rows.set(raw.symbol,{symbol:raw.symbol,rows:bars,price});
   }catch{coverage.invalidPrice++;}
  }
  return [...rows.values()].sort((a,b)=>(this.checked.get(a.symbol)??0)-(this.checked.get(b.symbol)??0)||a.symbol.localeCompare(b.symbol));
 }
 async scan(){
  await this.init();if(this.busy||this.error||!this.webhook||this.now()<this.state.retryUntil)return;
  this.busy=true;const coverage={at:this.now(),files:0,universe:0,priceReady:0,insufficientPrice:0,stalePrice:0,invalidPrice:0,priceHigh:0,candidates:0,checked:0,qualified:0,attempted:0,sent:0,rejected:{},lastChecks:[]};
  const reject=status=>coverage.rejected[status]=(coverage.rejected[status]??0)+1;
  try{
   const universe=new Set((await this.getSymbols()).filter(symbolOk));coverage.universe=universe.size;
   if(!universe.size){this.lastError='UNIVERSE_NOT_READY';return;}
   const candidates=await this.candidates(universe,coverage);coverage.candidates=candidates.length;
   const sourceDeadline=this.now()+45000;
   for(const c of candidates){
    if(this.now()>=sourceDeadline){coverage.sourceBudgetExceeded=true;break;}
    if(coverage.checked>=this.rule.maxChecks||coverage.attempted>=this.rule.maxSends||this.now()<this.state.retryUntil||this.error)break;
    this.checked.set(c.symbol,this.now());coverage.checked++;
    let token,chart,prepared=null;const detail={symbol:c.symbol,at:this.now(),status:'CHECKING'};coverage.lastChecks.push(detail);
    try{
     token=await this.json('https://pumpglass.com/smart-money/api/token?symbol='+encodeURIComponent(c.symbol),{deadline:sourceDeadline});
     detail.tokenAgeMs=Number.isFinite(token?.scanned_at)?this.now()-token.scanned_at*1000:null;
     if(token?.symbol!==c.symbol||token.basis!=='whales'||!Number.isInteger(token.whale_count)||token.whale_count<10||!fresh(token.scanned_at*1000,this.now(),900000)){detail.status='LIVE_BASIS_MISSING_OR_STALE';reject(detail.status);continue;}
     if(this.strategy?.prepare){prepared=await this.strategy.prepare({symbol:c.symbol,price:c.price,token,now:this.now()});if(prepared.status!=='READY'){detail.status=prepared.status;reject(detail.status);continue;}}
     chart=await this.json('https://pumpglass.com/smart-money/api/chart?'+new URLSearchParams({symbol:c.symbol,since:Math.floor((this.now()-5*3600000)/1000),until:Math.floor(this.now()/1000)}),{deadline:sourceDeadline});
    }catch(error){detail.status=error.sourceCode??'UPSTREAM_UNAVAILABLE';reject(detail.status);continue;}
    const e=this.strategy?.prove?await this.strategy.prove({symbol:c.symbol,rows:c.rows,chart,token,now:this.now(),prepared}):provePumpHighWhaleShort({symbol:c.symbol,rows:c.rows,chart,token,now:this.now()});
    detail.status=e.status;
    if(e.status!=='QUALIFIED'){reject(e.status);continue;}
    e.version=this.version;e.eventId=c.symbol+':'+e.decisionAt+':'+e.position.whaleAt;e.delivery={status:'RESERVED',at:this.now()};
    if(!this.canSend(e.symbol,e.eventId))continue;coverage.qualified++;
    // Reserve durably before POST. An unknown result is never replayed after restart.
    this.state.alerts[e.symbol]={at:this.now(),eventId:e.eventId};this.state.history.push(e);
    try{await this.save();}catch{this.error='STORAGE_FAILED_NO_SEND';break;}
    if(!fresh(e.decisionAt,this.now(),450000)||!fresh(e.tokenSourceAt,this.now(),900000)){e.delivery={status:'EXPIRED_BEFORE_SEND',at:this.now()};try{await this.save();}catch{this.error='STORAGE_FAILED_NO_SEND';}continue;}
    if(this.prepareExecution){try{e.marketExecution=this.prepareExecution(e,c.rows);}catch{e.marketExecution={enabled:false,error:'FLOW_UNAVAILABLE'};}}
    coverage.attempted++;
    try{
     const response=await this.fetchImpl(this.webhook,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify((this.strategy?.payload??pumpHighWhaleShortPayload)(e)),signal:AbortSignal.timeout(8000)});
     e.delivery={status:response.ok?'SENT':'FAILED',httpStatus:response.status,at:this.now()};if(response.ok)coverage.sent++;
     if(!response.ok){this.state.retryUntil=this.now()+15*60000;if(response.status===429){const b=await response.json().catch(()=>({}));this.state.retryUntil=this.now()+Math.max(60000,Math.min(3600000,Number.isFinite(b.retry_after)?b.retry_after*1000:60000));}}
    }catch{e.delivery={status:'UNKNOWN',at:this.now()};this.state.retryUntil=this.now()+60000;}
    try{await this.save();}catch{this.error='STORAGE_FAILED_NO_SEND';break;}
    if(e.delivery.status==='SENT'&&this.onDelivered)void Promise.resolve().then(()=>this.onDelivered(structuredClone(e),structuredClone(c.rows))).then(async result=>{e.binanceExecution=result;await this.save();}).catch(()=>{this.lastExecutionError='EXECUTION_CALLBACK_FAILED';});
   }
   this.lastError=null;
  }catch(e){this.lastError=/^UPSTREAM_HTTP_\d+$/.test(e.message)?e.message:'SCAN_FAILED';}
  finally{coverage.completedAt=this.now();this.coverage=coverage;this.busy=false;}
 }
 start(){if(this.timer||!this.webhook)return;void this.scan();this.timer=setInterval(()=>void this.scan(),this.rule.scanMs);this.timer.unref?.();}
 stop(){clearInterval(this.timer);this.timer=null;}
 snapshot(){return structuredClone({version:this.version,group:this.group,observeOnly:true,affectsOrders:false,configured:!!this.webhook,destinationWebhookId:this.webhook?new URL(this.webhook).pathname.split('/')[3]:null,dataVersion:this.strategy?.version??PUMP_HIGH_WHALE_SHORT_DATA_VERSION,priceSource:this.priceSource?.snapshot()??null,sourceTotals:{...this.sourceTotals},error:this.error,lastError:this.lastError,rule:this.rule,coverage:this.coverage,retryUntil:this.state.retryUntil,history:this.state.history.slice(-50).reverse(),...(this.strategy?.snapshot?.(this)??{})});}
}
