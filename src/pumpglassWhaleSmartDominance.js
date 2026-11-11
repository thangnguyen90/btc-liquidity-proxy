import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {normalizeChart,asof,S} from './pumpHighWhaleShortModel.js';
import {whalePositionSizeSnapshot,attachWhalePositionMarketCap,whalePositionSizePresentation,PUMPGLASS_POSITION_SIZE_VERSION,PUMPGLASS_POSITION_SIZE_RULE} from './pumpglassPositionSize.js';
export const DOMINANCE_RECENT_PUMP_COLOR=Object.freeze({version:'PUMPGLASS_DOMINANCE_RECENT_PUMP_COLOR_V1_20261110',windowMs:12*S,minPumpPct:5,color:0x06b6d4,title:'VỪA BƠM MẠNH'});
export const PUMPGLASS_DOMINANCE_DELIVERY_VERSION='DISCORD_WAIT_RECEIPT_V1_20261106';
export const PUMPGLASS_WHALE_SMART_DOMINANCE_STATE_VERSION='PUMPGLASS_WHALE_SMART_DOMINANCE_V1_20261106';
export const PUMPGLASS_WHALE_SMART_DOMINANCE_VERSION='PUMPGLASS_WHALE_SMART_DOMINANCE_V2_CROWD_OPPOSITE_20261106';
export const PUMPGLASS_WHALE_SMART_DOMINANCE_RULE=Object.freeze({scanMs:60000,cooldownMs:8*3600000,boardMaxAgeMs:300000,tokenMaxAgeMs:900000,maxTokenChecks:6,maxSends:3,sourceBudgetMs:45000,minWhales:10,minSharePct:70,thresholdOperator:'>',requiresBothGroups:true,requires4hChange:false,minOppositeCrowdPct:60,crowdThresholdOperator:'>',requiresCrowdOppositeIncreasing:true,crowdTrendWindowMs:3600000,crowdTrendDelta1hPp:'>0',crowdMaxAsOfAgeMs:600000,crowdChartMaxAgeMs:900000,crowdSourceAlignment:'TOKEN_SCANNED_AT',backtested:false});
export const PUMPGLASS_WHALE_SMART_DOMINANCE_GROUPS=Object.freeze({
 WHALE_SMART_LONG_GT70:{side:'LONG',color:0x10b981,icon:'🟢'},
 WHALE_SMART_SHORT_GT70:{side:'SHORT',color:0xdc2626,icon:'🔴'},
});
const symbolOk=s=>typeof s==='string'&&/^[\p{L}\p{N}]{1,32}USDT$/u.test(s);
const pct=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=100;
const fresh=(t,now,age)=>Number.isFinite(t)&&t<=now&&now-t<=age;
const key=e=>e.symbol+':'+e.side;
const vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false});
export function classifyWhaleSmartDominance(whaleLongPct,smartLongPct){
 if(!pct(whaleLongPct)||!pct(smartLongPct))return null;
 const side=whaleLongPct>70&&smartLongPct>70?'LONG':100-whaleLongPct>70&&100-smartLongPct>70?'SHORT':null;
 if(!side)return null;
 return {side,group:side==='LONG'?'WHALE_SMART_LONG_GT70':'WHALE_SMART_SHORT_GT70',whaleLongPct,smartLongPct,whaleShortPct:100-whaleLongPct,smartShortPct:100-smartLongPct};
}
export function whaleSmartDominanceProof(token,symbol,now){
 if(!symbolOk(symbol)||token?.symbol!==symbol||token.basis!=='whales'||!Number.isInteger(token.whale_count)||token.whale_count<10||!Number.isFinite(token.scanned_at)||!Array.isArray(token.now)||!(typeof token.price==='number'&&Number.isFinite(token.price)&&token.price>0))return null;
 const sourceAt=token.scanned_at*1000;if(!fresh(sourceAt,now,900000))return null;
 const rows=label=>token.now.filter(r=>r?.k===label),w=rows('Whales'),s=rows('Smart traders'),crowd=rows('Crowd');
 if(w.length!==1||s.length!==1||crowd.length!==1||!pct(crowd[0].v))return null;
 const c=classifyWhaleSmartDominance(w[0].v,s[0].v);if(!c)return null;
 const crowdLongPct=crowd[0].v,crowdOppositeSide=c.side==='LONG'?'SHORT':'LONG',crowdOppositePct=c.side==='LONG'?100-crowdLongPct:crowdLongPct;
 if(!(crowdOppositePct>60))return null;
 return {...c,symbol,sourceAt,observedAt:now,whaleCount:token.whale_count,crowdLongPct,crowdOppositeSide,crowdOppositePct,price:token.price,source:'PUMPGLASS_LIVE_TOKEN',basis:'whales',observeOnly:true,affectsOrders:false,backtested:false,
  positionSize:whalePositionSizeSnapshot(token,{symbol,side:c.side,sourceAt,observedAt:now})};
}
export function proveDominanceCrowdTrend(e,chart,now){
 if(!e||!['LONG','SHORT'].includes(e.side)||!fresh(e.sourceAt,now,900000)||!pct(e.crowdLongPct)||!pct(e.crowdOppositePct)||!(e.crowdOppositePct>60))return {status:'CROWD_TOKEN_STALE_INVALID_OR_NOT_OPPOSITE'};
 if(chart?.symbol!==e.symbol||!Array.isArray(chart.crowd))return {status:'CROWD_CHART_INVALID'};
 let data;try{data=normalizeChart({crowd:chart.crowd});}catch{return {status:'CROWD_CHART_INVALID'};}
 const latest=data.crowd.at(-1);if(!latest||!fresh(latest.t,now,900000))return {status:'LATEST_CROWD_SOURCE_STALE_OR_FUTURE'};
 const current=asof(data.crowd,e.sourceAt,600000),previous=asof(data.crowd,e.sourceAt-3600000,600000);
 if(!current||!previous)return {status:'CROWD_1H_HISTORY_MISSING_OR_STALE'};
 const opposite=row=>e.side==='LONG'?row.short:100-row.short,currentPct=opposite(current),previousPct=opposite(previous),delta1hPp=currentPct-previousPct;
 if(!(currentPct-60>1e-9))return {status:'CROWD_OPPOSITE_NOT_OVER_60'};
 if(!(delta1hPp>1e-9))return {status:'CROWD_OPPOSITE_NOT_RISING_1H'};
 return {status:'QUALIFIED',side:e.crowdOppositeSide,sourceCutoff:e.sourceAt,currentAt:current.t,previousAt:previous.t,currentPct,previousPct,delta1hPp,tokenPct:e.crowdOppositePct,windowMs:3600000};
}
function recentPumpContext(bars,now){
 const rule=DOMINANCE_RECENT_PUMP_COLOR,closedAt=Math.floor(now/S)*S,barCount=rule.windowMs/S+1;
 const window=bars.slice(-barCount);
 if(window.length!==barCount||window.some((b,i)=>b.end!==closedAt-(barCount-1-i)*S))return null;
 const basePrice=window[0].c,peakPrice=Math.max(...window.slice(1).map(b=>b.h)),pumpPct=100*(peakPrice/basePrice-1);
 if(!Number.isFinite(pumpPct)||pumpPct+1e-9<rule.minPumpPct)return null;
 return {version:rule.version,closedAt,basePrice,peakPrice,pumpPct};
}
export function whaleSmartDominancePayload(e){
 if(e.crowdTrend?.status!=='QUALIFIED')throw Error('CROWD_TREND_NOT_VERIFIED');
 const g=PUMPGLASS_WHALE_SMART_DOMINANCE_GROUPS[e.group],coin=encodeURIComponent(e.symbol),f=x=>x.toFixed(2),size=whalePositionSizePresentation(e);
 const rule=DOMINANCE_RECENT_PUMP_COLOR,pump=e.side==='SHORT'&&size.tier==='LARGE'&&e.recentPump?.version===rule.version?e.recentPump:null;
 return {username:'Cá voi + Smart · Đồng thuận >70%',allowed_mentions:{parse:[]},embeds:[{
  title:g.icon+' '+e.symbol+' · CÁ VOI + SMART '+e.side+' >70% · QUY MÔ '+size.title+(pump?' · '+rule.title:''),
  color:pump?rule.color:size.color,
  description:'**CẢ HAI NHÓM CÙNG '+e.side+' >70%**\nĐám đông ngược chiều >60% và tăng ròng trong 1h. Chưa backtest riêng hoặc xác nhận điểm vào lệnh.',
  fields:[
   {name:'TỶ TRỌNG CÁ VOI',value:'LONG **'+f(e.whaleLongPct)+'%** · SHORT **'+f(e.whaleShortPct)+'%**'},
   {name:'TỶ TRỌNG TRADER THÔNG MINH',value:'LONG **'+f(e.smartLongPct)+'%** · SHORT **'+f(e.smartShortPct)+'%**'},
   ...size.fields,
   ...(pump?[{name:rule.title,value:'Đỉnh 60 phút cao hơn giá đầu khung **'+f(pump.pumpPct)+'%**. Nến 5m chốt lúc '+vn(pump.closedAt)+' VN. Bối cảnh quan sát sau bơm.'}]:[]),
   {name:'ĐÁM ĐÔNG NGƯỢC CHIỀU · '+e.crowdOppositeSide,value:'Hiện tại (token): **'+f(e.crowdOppositePct)+'%**\nLịch sử 1h (chart): '+f(e.crowdTrend.previousPct)+'% → **'+f(e.crowdTrend.currentPct)+'%** · **+'+f(e.crowdTrend.delta1hPp)+' điểm %**\nMốc nguồn: '+vn(e.crowdTrend.previousAt)+' → '+vn(e.crowdTrend.currentAt)+' VN'},
   {name:'GIÁ / ĐỘ MỚI',value:'Giá nguồn: '+e.price+'\nNguồn quét: '+vn(e.sourceAt)+' VN\nBot đọc: '+vn(e.observedAt)+' VN\nNhóm có '+e.whaleCount+' cá voi theo nguồn.'},
   {name:'CÁCH ĐỌC',value:'Mỗi nhóm phải vượt 70% cùng hướng; đám đông ngược chiều >60% ở cả token và chart, tăng ròng 1h theo chart as-of mốc token (mỗi mốc tối đa cũ 10 phút). Không yêu cầu biến động 4h hoặc giá ở đỉnh/đáy. Đây là tỷ trọng vị thế theo nguồn, không phải xác suất thắng hoặc tỷ lệ trader có lãi. Chỉ theo dõi; không gửi lệnh Binance. Model 1/3 chưa là gate.'},
   {name:'MỞ COIN',value:'[Model 1/3](https://liquidity.nhathadev.trade/coinglass-heatmap-lab?symbol='+coin+'&range=24h) · [PumpGlass](https://pumpglass.com/smart-money/'+coin+') · [Binance](https://www.binance.com/en/futures/'+coin+')'},
  ],timestamp:new Date(e.observedAt).toISOString(),footer:{text:PUMPGLASS_WHALE_SMART_DOMINANCE_VERSION+' | '+PUMPGLASS_POSITION_SIZE_VERSION+' | OBSERVE ONLY | 1 lần/coin/hướng/8h'},
 }]};
}
function validateWebhook(value){
 if(!value)return null;let u;try{u=new URL(value);}catch{throw Error('INVALID_WEBHOOK');}
 if(u.protocol!=='https:'||!['discord.com','discordapp.com'].includes(u.hostname)||u.username||u.password||u.port||u.search||u.hash||!/^\/api\/webhooks\/\d+\/[^/]+$/.test(u.pathname))throw Error('INVALID_WEBHOOK');return u.href;
}
export class PumpglassWhaleSmartDominanceWatch{
 constructor({file,getSymbols=()=>[],webhookUrl,fetchImpl=fetch,now=Date.now,loadMarketCap=null,getMarketCapStatus=()=>null,maxCapWaitMs=2500,getPriceBars=()=>[]}={}){
  Object.assign(this,{file,getSymbols,fetchImpl,now,loadMarketCap,getMarketCapStatus,maxCapWaitMs,getPriceBars});this.webhook=validateWebhook(webhookUrl);this.state={version:PUMPGLASS_WHALE_SMART_DOMINANCE_STATE_VERSION,alerts:{},history:[],retryUntil:0};this.error=null;this.lastError=null;this.busy=false;this.checked=new Map();this.coverage={};
 }
 async init(){return this.initializing??=(async()=>{try{
  const s=JSON.parse(await readFile(this.file,'utf8'));
  if(s.version!==PUMPGLASS_WHALE_SMART_DOMINANCE_STATE_VERSION||!s.alerts||typeof s.alerts!=='object'||Array.isArray(s.alerts)||!Array.isArray(s.history)||!Number.isFinite(s.retryUntil)||s.retryUntil<0||Object.entries(s.alerts).some(([k,a])=>!symbolOk(k.split(':')[0])||k.split(':').length!==2||!['LONG','SHORT'].includes(k.split(':')[1])||!Number.isFinite(a?.at)||a.at<0||typeof a?.eventId!=='string'))throw Error('STATE_SCHEMA');
  this.state=s;
 }catch(e){if(e.code!=='ENOENT')this.error='STATE_READ_FAILED_NO_SEND';}})();}
 async save(){
  const now=this.now();this.state.history=this.state.history.filter(e=>fresh(e.observedAt,now,7*86400000)).slice(-500);this.state.alerts=Object.fromEntries(Object.entries(this.state.alerts).filter(([,a])=>fresh(a.at,now,7*86400000)));
  await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(this.state));await rename(tmp,this.file);
 }
 canSend(e){const p=this.state.alerts[key(e)];return !p||this.now()-p.at>=PUMPGLASS_WHALE_SMART_DOMINANCE_RULE.cooldownMs;}
 async json(url,deadline){
  const remaining=deadline-this.now();if(remaining<500)throw Error('SOURCE_SCAN_BUDGET');
  const r=await this.fetchImpl(url,{headers:{Accept:'application/json','Cache-Control':'no-cache'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(Math.min(8000,remaining))});
  if(!r.ok){if([403,418,429].includes(r.status)){this.state.retryUntil=this.now()+900000;try{await this.save();}catch{this.error='STORAGE_FAILED_NO_SEND';}}throw Error('UPSTREAM_HTTP_'+r.status);}return r.json();
 }
 async scan(){
  await this.init();if(this.busy||this.error||!this.webhook||this.now()<this.state.retryUntil)return;
  this.busy=true;const c={at:this.now(),universe:0,boardRows:0,eligible:0,checked:0,qualified:0,attempted:0,sent:0,rejected:{},lastChecks:[]},reject=why=>c.rejected[why]=(c.rejected[why]??0)+1,deadline=this.now()+45000;
  try{
   const universe=new Set((await this.getSymbols()).filter(symbolOk));c.universe=universe.size;if(!universe.size){this.lastError='UNIVERSE_NOT_READY';return;}
   const board=await this.json('https://pumpglass.com/smart-money/api/board',deadline),now=this.now();
   if(!Array.isArray(board?.rows)||!fresh(board.meta?.snapshot*1000,now,300000)||!fresh(board.meta?.updated*1000,now,300000))throw Error('BOARD_STALE_OR_INVALID');c.boardRows=board.rows.length;
   const candidates=[...new Map(board.rows.filter(r=>symbolOk(r?.s)&&universe.has(r.s)&&r.basis==='whales'&&Number.isInteger(r.n)&&r.n>=10&&pct(r.cr)).map(r=>[r.s,{symbol:r.s,crowdLongPct:r.cr,side:pct(r.wl)&&pct(r.sl)?r.wl>=70&&r.sl>=70?'LONG':r.wl<=30&&r.sl<=30?'SHORT':null:null}])).values()].filter(e=>e.side&&(e.side==='LONG'?100-e.crowdLongPct>=60:e.crowdLongPct>=60)&&this.canSend(e));
   candidates.sort((a,b)=>(this.checked.get(a.symbol)??0)-(this.checked.get(b.symbol)??0)||a.symbol.localeCompare(b.symbol));c.eligible=candidates.length;
   for(const row of candidates){
    if(c.checked>=6||c.attempted>=3||this.now()>=deadline||this.now()<this.state.retryUntil||this.error)break;
    c.checked++;this.checked.set(row.symbol,this.now());const detail={symbol:row.symbol,at:this.now(),status:'CHECKING'};c.lastChecks.push(detail);
    let token;try{token=await this.json('https://pumpglass.com/smart-money/api/token?symbol='+encodeURIComponent(row.symbol),deadline);}catch(e){detail.status=/^UPSTREAM_HTTP_\d+$|^SOURCE_SCAN_BUDGET$/.test(e.message)?e.message:'TOKEN_UNAVAILABLE';reject(detail.status);continue;}
    const e=whaleSmartDominanceProof(token,row.symbol,this.now());if(!e){detail.status='TOKEN_STALE_INVALID_OR_NOT_DOMINANT_OR_CROWD_OPPOSITE';reject(detail.status);continue;}
    if(!this.canSend(e)){detail.status='COOLDOWN';reject(detail.status);continue;}
    let chart;try{chart=await this.json('https://pumpglass.com/smart-money/api/chart?'+new URLSearchParams({symbol:e.symbol,since:Math.floor((e.sourceAt-4200000)/1000),until:Math.floor(this.now()/1000)}),deadline);}catch(error){detail.status=/^UPSTREAM_HTTP_\d+$|^SOURCE_SCAN_BUDGET$/.test(error.message)?error.message:'CROWD_CHART_UNAVAILABLE';reject(detail.status);continue;}
    const crowdTrend=proveDominanceCrowdTrend(e,chart,this.now());if(crowdTrend.status!=='QUALIFIED'){detail.status=crowdTrend.status;reject(detail.status);continue;}e.crowdTrend=crowdTrend;
    if(this.loadMarketCap){let timer,cap={status:'CAP_LOOKUP_BUDGET'};const waitMs=Math.max(0,Math.min(this.maxCapWaitMs,deadline-this.now()-500));
     if(waitMs>=1)try{cap=await Promise.race([Promise.resolve().then(()=>this.loadMarketCap(structuredClone(e))),new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'CAP_LOOKUP_TIMEOUT'}),waitMs);})]);}catch{cap={status:'CAP_LOOKUP_FAILED'};}finally{clearTimeout(timer);}
     e.positionSize=attachWhalePositionMarketCap(e.positionSize,cap,this.now());
    }
    if(!fresh(board.meta.snapshot*1000,this.now(),300000)){detail.status='BOARD_EXPIRED';reject(detail.status);continue;}
    if(e.side==='SHORT'&&e.positionSize?.tier==='LARGE'){
     const at=this.now();
     try{
      const pump=recentPumpContext(this.getPriceBars(e.symbol,at),at);
      if(pump)e.recentPump=pump;
     }catch{} // Price context is optional for Discord presentation.
    }
    c.qualified++;detail.status='QUALIFIED';e.version=PUMPGLASS_WHALE_SMART_DOMINANCE_VERSION;e.boardAt=board.meta.snapshot*1000;e.eventId=e.symbol+':'+e.side+':'+e.sourceAt;const configuredWebhookId=new URL(this.webhook).pathname.split('/')[3];e.delivery={status:'RESERVED',at:this.now(),configuredWebhookId};
    this.state.alerts[key(e)]={at:this.now(),eventId:e.eventId};this.state.history.push(e);
    try{await this.save();}catch{this.error='STORAGE_FAILED_NO_SEND';break;}
    if(!fresh(e.sourceAt,this.now(),900000)||!fresh(e.boardAt,this.now(),300000)){e.delivery={status:'EXPIRED_BEFORE_SEND',at:this.now()};try{await this.save();}catch{this.error='STORAGE_FAILED_NO_SEND';}continue;}
    c.attempted++;
    try{
     const destination=new URL(this.webhook);destination.searchParams.set('wait','true');
     const response=await this.fetchImpl(destination.href,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(whaleSmartDominancePayload(e)),signal:AbortSignal.timeout(8000)});
     e.delivery={status:response.ok?'SENT':'FAILED',httpStatus:response.status,at:this.now(),configuredWebhookId};
     if(response.ok){
      c.sent++;let receipt=null;try{receipt=await response.json();}catch{}
      const id=v=>typeof v==='string'&&/^\d+$/.test(v),confirmed=id(receipt?.id)&&id(receipt?.channel_id)&&receipt?.webhook_id===configuredWebhookId;
      Object.assign(e.delivery,{confirmed,webhookId:id(receipt?.webhook_id)?receipt.webhook_id:null,channelId:id(receipt?.channel_id)?receipt.channel_id:null,messageId:id(receipt?.id)?receipt.id:null,receiptVersion:PUMPGLASS_DOMINANCE_DELIVERY_VERSION});
      if(confirmed)c.confirmed=(c.confirmed??0)+1;else{c.unconfirmed=(c.unconfirmed??0)+1;e.delivery.confirmationError='MISSING_OR_MISMATCHED_DISCORD_RECEIPT';}
     }
     else{this.state.retryUntil=this.now()+900000;if(response.status===429){const b=await response.json().catch(()=>({}));this.state.retryUntil=this.now()+Math.max(60000,Math.min(3600000,Number.isFinite(b.retry_after)?b.retry_after*1000:60000));}}
    }catch{e.delivery={status:'UNKNOWN',at:this.now(),configuredWebhookId};this.state.retryUntil=this.now()+60000;}
    try{await this.save();}catch{this.error='STORAGE_FAILED_NO_SEND';break;}
   }
   this.lastError=null;
  }catch(e){this.lastError=/^UPSTREAM_HTTP_\d+$|^BOARD_STALE_OR_INVALID$|^SOURCE_SCAN_BUDGET$/.test(e.message)?e.message:'SCAN_FAILED';}
  finally{c.completedAt=this.now();this.coverage=c;this.busy=false;}
 }
 start(){if(this.timer||!this.webhook)return;void this.scan();this.timer=setInterval(()=>void this.scan(),60000);this.timer.unref?.();}
 stop(){clearInterval(this.timer);this.timer=null;}
 snapshot(){return structuredClone({version:PUMPGLASS_WHALE_SMART_DOMINANCE_VERSION,stateVersion:PUMPGLASS_WHALE_SMART_DOMINANCE_STATE_VERSION,deliveryVersion:PUMPGLASS_DOMINANCE_DELIVERY_VERSION,positionSizeVersion:PUMPGLASS_POSITION_SIZE_VERSION,positionSizeRule:PUMPGLASS_POSITION_SIZE_RULE,recentPumpColor:DOMINANCE_RECENT_PUMP_COLOR,marketCapProvider:this.getMarketCapStatus(),observeOnly:true,affectsOrders:false,configured:!!this.webhook,destinationWebhookId:this.webhook?new URL(this.webhook).pathname.split('/')[3]:null,error:this.error,lastError:this.lastError,rule:PUMPGLASS_WHALE_SMART_DOMINANCE_RULE,groups:PUMPGLASS_WHALE_SMART_DOMINANCE_GROUPS,coverage:this.coverage,retryUntil:this.state.retryUntil,history:this.state.history.slice(-50).reverse()});}
}
