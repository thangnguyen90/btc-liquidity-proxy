import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {HEATMAP_SWEEP_VERSION} from './heatmapSweepWatch.js';
import {whaleSmartDominanceProof,proveDominanceCrowdTrend} from './pumpglassWhaleSmartDominance.js';
import {validUpperMomentum,UPPER_MOMENTUM_TITLES} from '../public/heatmap-upper-momentum-model.js';
export const UPPER_SWEEP_WHALE_SHORT_VERSION='UPPER_SWEEP_WHALE_SMART_SHORT_OBSERVE_V1_20261106';
export const UPPER_SWEEP_WHALE_SHORT_GROUP='UPPER_SWEEP_WHALE_SMART_SHORT_GT70';
export const UPPER_SWEEP_WHALE_SHORT_RULE=Object.freeze({color:0xd946ef,minWhaleShortPct:70,minSmartShortPct:70,thresholdOperator:'>',minCrowdLongPct:60,crowdThresholdOperator:'>',crowdDelta1hPp:'>0',sourceMaxAgeMs:900000,eventMaxAgeMs:30000,cooldownMs:8*3600000,maxContextsPerMinute:6,maxSendsPerMinute:3,maxPending:6,requiresLiveUpperFullSweep:true,requiresBreakdown:false,backtested:false});
const validSymbol=s=>typeof s==='string'&&/^[\p{L}\p{N}]{1,32}USDT$/u.test(s),num=x=>typeof x==='number'&&Number.isFinite(x),fresh=(t,now,age)=>num(t)&&t<=now&&now-t<=age;
function validateWebhook(value){if(!value)return null;let u;try{u=new URL(value);}catch{throw Error('INVALID_WEBHOOK');}if(u.protocol!=='https:'||!['discord.com','discordapp.com'].includes(u.hostname)||u.username||u.password||u.port||u.search||u.hash||!/^\/api\/webhooks\/\d+\/[^/]+$/.test(u.pathname))throw Error('INVALID_WEBHOOK');return u.href;}
export function validateUpperSweepEvent(e,now,startedAt=0){
 if(e?.version!==HEATMAP_SWEEP_VERSION||e.kind!=='ALL_TRACKED_UPPER_SWEPT'||e.direction!=='UPPER'||!validSymbol(e.symbol)||typeof e.id!=='string'||typeof e.cohortId!=='string'||e.id!==e.cohortId+':'+e.kind)return 'NOT_LIVE_UPPER_FULL_SWEEP';
 if(!fresh(e.at,now,30000)||e.at<startedAt||!num(e.observedAt)||e.observedAt<e.at-1000||e.observedAt>now)return 'SWEEP_EXPIRED_OR_BEFORE_START';
 if(![e.armedAt,e.zonesAsOf,e.cohortExpiresAt,e.previousTickAt,e.maxTickGapMs,e.markPrice,e.previousMarkPrice,e.maxDistancePct].every(num)||!(e.zonesAsOf<e.armedAt&&e.armedAt<=e.at&&e.at<e.cohortExpiresAt&&e.previousTickAt<e.at&&e.previousTickAt>=e.armedAt&&e.at-e.previousTickAt<=10000&&e.maxTickGapMs<=10000&&e.maxTickGapMs>=0&&e.markPrice>0&&e.previousMarkPrice>0&&e.maxDistancePct>=.5&&e.maxDistancePct<=10))return 'SWEEP_EVIDENCE_INVALID';
 if(!Number.isInteger(e.totalCount)||e.totalCount<1||e.clearedCount!==e.totalCount||!Array.isArray(e.zones)||e.zones.length!==e.totalCount||e.zones.some(z=>!num(z.low)||!num(z.high)||z.low<=0||z.high<z.low||z.cleared!==true||!num(z.clearedAt)||z.clearedAt<e.armedAt||z.clearedAt>e.at))return 'SWEEP_NOT_ALL_CLEARED';
 const finalHigh=Math.max(...e.zones.map(z=>z.high));if(!(e.previousMarkPrice<finalHigh&&e.markPrice>=finalHigh))return 'NO_FRESH_CROSSING';return null;
}
export function proveUpperSweepWhaleShort(sweep,token,chart,now,startedAt=0){
 const invalid=validateUpperSweepEvent(sweep,now,startedAt);if(invalid)return {status:invalid};
 const p=whaleSmartDominanceProof(token,sweep.symbol,now);if(!p||p.side!=='SHORT')return {status:'SHORT_POSITIONING_NOT_QUALIFIED'};
 if(p.sourceAt>sweep.at)return {status:'POSITION_SOURCE_AFTER_SWEEP'};
 const historical={...chart,crowd:Array.isArray(chart?.crowd)?chart.crowd.filter(r=>Array.isArray(r)&&num(r[0])&&r[0]*1000<=sweep.at):chart?.crowd};
 const trend=proveDominanceCrowdTrend(p,historical,now);if(trend.status!=='QUALIFIED')return {status:trend.status};
 const short=token.short??{},momentum=validUpperMomentum(sweep)?structuredClone(sweep.upperMomentum):null;
 return {status:'QUALIFIED',version:UPPER_SWEEP_WHALE_SHORT_VERSION,group:UPPER_SWEEP_WHALE_SHORT_GROUP,symbol:sweep.symbol,side:'SHORT',purpose:'WATCH_ONLY',observeOnly:true,affectsOrders:false,backtested:false,eventId:sweep.id,observedAt:now,sweep:structuredClone(sweep),positioning:p,crowdTrend:trend,momentum,momentumState:momentum?.state??'UNKNOWN',extremeShort:p.whaleShortPct>90&&p.smartShortPct>90,sourceShort:{avgEntry:num(short.avg_entry)&&short.avg_entry>0?short.avg_entry:null,pnlUsd:num(short.pnl_usd)?short.pnl_usd:null,inProfitPct:num(short.in_profit_pct)&&short.in_profit_pct>=0&&short.in_profit_pct<=100?short.in_profit_pct:null}};
}
const f=x=>num(x)?x.toFixed(2):'—',vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false});
export function upperSweepWhaleShortPayload(e){
 const p=e.positioning,s=e.sweep,t=e.crowdTrend,coin=encodeURIComponent(e.symbol),q=e.momentum?.features??{},momentumTitle=UPPER_MOMENTUM_TITLES[e.momentumState]??UPPER_MOMENTUM_TITLES.UNKNOWN;
 return {username:'Quét trên · Cá voi + Smart SHORT',allowed_mentions:{parse:[]},embeds:[{title:'🟪 '+e.symbol+' · QUÉT TRÊN + CÁ VOI/SMART SHORT',color:UPPER_SWEEP_WHALE_SHORT_RULE.color,description:'**THEO DÕI SHORT · CHƯA XÁC NHẬN GÃY ĐÀ / RETEST THẤT BẠI**\n'+(e.extremeShort?'Cả cá voi và Smart có tỷ trọng SHORT >90%.':'Cả cá voi và Smart có tỷ trọng SHORT >70%.')+' Đám đông LONG >60% và tăng ròng 1h.',fields:[
  {name:'LƯỢT QUÉT THẬT · MODEL 1/3',value:vn(s.at)+' VN\nMARK '+s.markPrice+' · '+s.clearedCount+'/'+s.totalCount+' cụm đã chốt trong phạm vi +'+s.maxDistancePct+'%.\nQuét hết tập đã chốt; vùng mới hoặc vùng ngoài phạm vi vẫn có thể tồn tại.'},
  {name:'CÁ VOI / SMART · SHORT',value:'Cá voi **'+f(p.whaleShortPct)+'%** · Smart **'+f(p.smartShortPct)+'%**\nNguồn '+p.whaleCount+' cá voi · '+vn(p.sourceAt)+' VN\nBot đọc vị thế '+vn(p.observedAt)+' VN'},
  {name:'ĐÁM ĐÔNG LONG · TĂNG 1h',value:'Token **'+f(p.crowdLongPct)+'%**\nChart '+f(t.previousPct)+'% → **'+f(t.currentPct)+'%** · **+'+f(t.delta1hPp)+' điểm %**'},
  {name:momentumTitle,value:'Giá 15m '+f(q.return15m)+'% · 1h '+f(q.return1h)+'%\nVolume '+f(q.volumeRatio)+'× · đóng nến '+f(q.closePositionPct)+'% trong biên.\n'+(e.momentumState==='CONTINUATION'?'Còn đà bơm: giá có thể tăng tiếp dù cá voi/Smart nghiêng SHORT.':'Thiếu dấu hiệu bơm tiếp chưa chứng minh giá đã đảo chiều.')},
  {name:'VỊ THẾ SHORT CỦA NGUỒN · THAM KHẢO',value:'Giá vào TB '+f(e.sourceShort.avgEntry)+' · đang lãi '+f(e.sourceShort.inProfitPct)+'%\nPnL chưa thực hiện '+f(e.sourceShort.pnlUsd)+' USD. Tỷ trọng SHORT cao không bảo đảm điểm vào có lợi.'},
  {name:'CÁCH ĐỌC',value:'Đây là nhánh quan sát riêng, không đặt lệnh Binance hoặc sửa SL/TP. Chưa backtest riêng tổ hợp quét + vị thế. Chưa có xác nhận breakdown/retest; không suy ra đã thanh lý hết toàn sàn.'},
  {name:'MỞ COIN',value:'[Model 1/3](https://liquidity.nhathadev.trade/coinglass-heatmap-lab?symbol='+coin+'&range=24h&sweep='+encodeURIComponent(s.id)+'#heatmap-sweep) · [PumpGlass](https://pumpglass.com/smart-money/'+coin+')'},
 ],timestamp:new Date(e.observedAt).toISOString(),footer:{text:UPPER_SWEEP_WHALE_SHORT_VERSION+' | OBSERVE ONLY | 1 lần/coin/8h'}}]};
}
export class UpperSweepWhaleShortWatch{
 constructor({file,webhookUrl,fetchImpl=fetch,now=Date.now}={}){Object.assign(this,{file,fetchImpl,now});this.webhook=validateWebhook(webhookUrl);this.startedAt=now();this.state={version:UPPER_SWEEP_WHALE_SHORT_VERSION,alerts:{},history:[],retryUntil:0};this.queue=Promise.resolve();this.pending=0;this.contextStarts=[];this.sendStarts=[];this.error=null;this.lastError=null;this.metrics={received:0,checked:0,qualified:0,sent:0,confirmed:0,rejected:{},lastChecks:[]};}
 async init(){return this.initializing??=(async()=>{try{const s=JSON.parse(await readFile(this.file,'utf8'));if(s.version!==UPPER_SWEEP_WHALE_SHORT_VERSION||!s.alerts||typeof s.alerts!=='object'||Array.isArray(s.alerts)||!Array.isArray(s.history)||!num(s.retryUntil)||s.retryUntil<0||Object.entries(s.alerts).some(([symbol,a])=>!validSymbol(symbol)||!num(a?.at)||typeof a?.eventId!=='string'))throw Error('SCHEMA');this.state=s;}catch(e){if(e.code!=='ENOENT')this.error='STATE_READ_FAILED_NO_SEND';}})();}
 async save(){this.state.history=this.state.history.filter(e=>fresh(e.observedAt,this.now(),7*86400000)).slice(-500);await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(this.state));await rename(tmp,this.file);}
 reject(status,symbol){this.metrics.rejected[status]=(this.metrics.rejected[status]??0)+1;this.metrics.lastChecks.push({symbol,at:this.now(),status});this.metrics.lastChecks=this.metrics.lastChecks.slice(-20);return {status};}
 onSweep(event){this.metrics.received++;if(this.pending>=6)return Promise.resolve(this.reject('QUEUE_FULL',event?.symbol));const frozen=structuredClone(event);this.pending++;const task=this.queue.then(()=>this.process(frozen));this.queue=task.catch(()=>{});return task.finally(()=>{this.pending--;});}
 async json(url,deadline){const remaining=deadline-this.now();if(remaining<500)throw Error('SOURCE_BUDGET_EXPIRED');const r=await this.fetchImpl(url,{redirect:'error',cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(Math.min(8000,remaining))});if(!r.ok){if([403,418,429].includes(r.status)){this.state.retryUntil=this.now()+900000;try{await this.save();}catch{this.error='STORAGE_FAILED_NO_SEND';}}throw Error('UPSTREAM_HTTP_'+r.status);}return r.json();}
 async process(sweep){
  await this.init();if(this.error||!this.webhook)return this.reject(this.error??'NOT_CONFIGURED',sweep?.symbol);
  const invalid=validateUpperSweepEvent(sweep,this.now(),this.startedAt);if(invalid)return this.reject(invalid,sweep?.symbol);
  if(this.now()<this.state.retryUntil)return this.reject('BACKOFF',sweep.symbol);
  const prior=this.state.alerts[sweep.symbol];if(prior&&(prior.eventId===sweep.id||this.now()-prior.at<8*3600000))return this.reject('COOLDOWN',sweep.symbol);
  this.contextStarts=this.contextStarts.filter(t=>this.now()-t<60000);this.sendStarts=this.sendStarts.filter(t=>this.now()-t<60000);if(this.contextStarts.length>=6||this.sendStarts.length>=3)return this.reject('RATE_BUDGET',sweep.symbol);
  this.contextStarts.push(this.now());this.metrics.checked++;const deadline=Math.min(this.now()+20000,sweep.at+25000);let token,chart;
  try{token=await this.json('https://pumpglass.com/smart-money/api/token?symbol='+encodeURIComponent(sweep.symbol),deadline);const p=whaleSmartDominanceProof(token,sweep.symbol,this.now());if(!p||p.side!=='SHORT')return this.reject('SHORT_POSITIONING_NOT_QUALIFIED',sweep.symbol);if(p.sourceAt>sweep.at)return this.reject('POSITION_SOURCE_AFTER_SWEEP',sweep.symbol);
   chart=await this.json('https://pumpglass.com/smart-money/api/chart?'+new URLSearchParams({symbol:sweep.symbol,since:Math.floor((p.sourceAt-4200000)/1000),until:Math.floor(sweep.at/1000)}),deadline);
  }catch(error){const code=/^UPSTREAM_HTTP_\d+$|^SOURCE_BUDGET_EXPIRED$/.test(error.message)?error.message:'SOURCE_UNAVAILABLE';this.lastError=code;return this.reject(code,sweep.symbol);}
  const e=proveUpperSweepWhaleShort(sweep,token,chart,this.now(),this.startedAt);if(e.status!=='QUALIFIED')return this.reject(e.status,sweep.symbol);this.metrics.qualified++;
  const configuredWebhookId=new URL(this.webhook).pathname.split('/')[3];e.delivery={status:'RESERVED',at:this.now(),configuredWebhookId};this.state.alerts[e.symbol]={at:this.now(),eventId:e.eventId};this.state.history.push(e);
  try{await this.save();}catch{this.error='STORAGE_FAILED_NO_SEND';return this.reject(this.error,e.symbol);}
  if(!fresh(sweep.at,this.now(),30000)||!fresh(e.positioning.sourceAt,this.now(),900000)){e.delivery={status:'EXPIRED_BEFORE_SEND',at:this.now(),configuredWebhookId};try{await this.save();}catch{this.error='STORAGE_FAILED_NO_SEND';}return {status:e.delivery.status};}
  this.sendStarts.push(this.now());const destination=new URL(this.webhook);destination.searchParams.set('wait','true');
  try{const r=await this.fetchImpl(destination.href,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(upperSweepWhaleShortPayload(e)),signal:AbortSignal.timeout(8000)});e.delivery={status:r.ok?'SENT':'FAILED',httpStatus:r.status,at:this.now(),configuredWebhookId};if(r.ok){this.metrics.sent++;let b;try{b=await r.json();}catch{}const id=v=>typeof v==='string'&&/^\d+$/.test(v),confirmed=id(b?.id)&&id(b?.channel_id)&&b?.webhook_id===configuredWebhookId;Object.assign(e.delivery,{confirmed,messageId:id(b?.id)?b.id:null,channelId:id(b?.channel_id)?b.channel_id:null,webhookId:id(b?.webhook_id)?b.webhook_id:null});if(confirmed)this.metrics.confirmed++;}else{this.state.retryUntil=this.now()+900000;if(r.status===429){const b=await r.json().catch(()=>({}));this.state.retryUntil=this.now()+Math.max(60000,Math.min(3600000,num(b.retry_after)?b.retry_after*1000:60000));}}}
  catch{e.delivery={status:'UNKNOWN',at:this.now(),configuredWebhookId};this.state.retryUntil=this.now()+60000;}
  try{await this.save();}catch{this.error='STORAGE_FAILED_NO_SEND';}this.lastError=null;return {status:e.delivery.status};
 }
 snapshot(){return structuredClone({version:UPPER_SWEEP_WHALE_SHORT_VERSION,group:UPPER_SWEEP_WHALE_SHORT_GROUP,observeOnly:true,affectsOrders:false,configured:!!this.webhook,destinationWebhookId:this.webhook?new URL(this.webhook).pathname.split('/')[3]:null,rule:UPPER_SWEEP_WHALE_SHORT_RULE,startedAt:this.startedAt,error:this.error,lastError:this.lastError,pending:this.pending,retryUntil:this.state.retryUntil,metrics:this.metrics,history:this.state.history.slice(-50).reverse()});}
}
