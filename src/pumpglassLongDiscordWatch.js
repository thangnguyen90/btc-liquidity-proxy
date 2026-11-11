import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
export const PUMPGLASS_LONG_DISCORD_VERSION='PUMPGLASS_LONG_GROUP_COLORS_V1_20261102';
export const PUMPGLASS_LONG_RULE=Object.freeze({scanMs:60000,cooldownMs:8*3600000,boardMaxAgeMs:5*60000,tokenMaxAgeMs:15*60000,maxTokenChecks:6,maxSends:3,minWhales:10});
export const PUMPGLASS_LONG_GROUPS=Object.freeze({
 DIVERGENCE70_40:{rank:2,color:0xa855f7,icon:'🟣',title:'CÁ VOI ≥70% · ĐÁM ĐÔNG ≤40%'},
 GAP30_60:{rank:1,color:0x14b8a6,icon:'🟢',title:'CÁ VOI ≥60% · CHÊNH LỆCH ≥30 ĐIỂM %'},
});
const symbolOk=s=>/^[\p{L}\p{N}]{1,32}USDT$/u.test(s??'');
const percent=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100;
const fresh=(t,now,max)=>Number.isFinite(t)&&t<=now&&now-t<=max;
const vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false});
export function classifyPumpglassLong(whaleLongPct,crowdLongPct){
 if(!percent(whaleLongPct)||!percent(crowdLongPct))return null;
 const gapPp=Number((whaleLongPct-crowdLongPct).toFixed(9)),matched=[];
 if(whaleLongPct>=70&&crowdLongPct<=40)matched.push('DIVERGENCE70_40');
 if(whaleLongPct>=60&&gapPp>=30)matched.push('GAP30_60');
 return matched.length?{group:matched[0],matched,whaleLongPct,crowdLongPct,gapPp}:null;
}
export function pumpglassTokenProof(raw,symbol,now){
 if(raw?.symbol!==symbol||!symbolOk(symbol)||raw.basis!=='whales'||!Number.isInteger(raw.whale_count)||raw.whale_count<PUMPGLASS_LONG_RULE.minWhales)return null;
 const sourceAt=raw.scanned_at*1000;if(!fresh(sourceAt,now,PUMPGLASS_LONG_RULE.tokenMaxAgeMs))return null;
 if(!Array.isArray(raw.now))return null;
 const whale=raw.now.filter(r=>r?.k==='Whales'),crowd=raw.now.filter(r=>r?.k==='Crowd');
 if(whale.length!==1||crowd.length!==1)return null;
 const classified=classifyPumpglassLong(whale[0].v,crowd[0].v);if(!classified)return null;
 if(!(typeof raw.price==='number'&&Number.isFinite(raw.price)&&raw.price>0))return null;
 return {...classified,symbol,sourceAt,observedAt:now,price:raw.price,whaleCount:raw.whale_count,basis:'whales',source:'PUMPGLASS_LIVE_TOKEN',observeOnly:true,affectsOrders:false};
}
export function pumpglassLongPayload(e){
 const g=PUMPGLASS_LONG_GROUPS[e.group],f=x=>x.toFixed(1),link=encodeURIComponent(e.symbol);
 return {username:'Cá voi · Nhóm LONG',allowed_mentions:{parse:[]},embeds:[{
  title:`${g.icon} ${e.symbol} · THEO DÕI LONG`,color:g.color,
  description:`**${g.title}**\nĐang đạt điều kiện tại lần quét hiện tại. Nhóm nghiên cứu, chưa phải điểm vào được xác nhận.`,
  fields:[
   {name:'TỶ TRỌNG LONG · PUMPGLASS',value:`Cá voi: **${f(e.whaleLongPct)}%**\nĐám đông: **${f(e.crowdLongPct)}%**\nChênh lệch: **${f(e.gapPp)} điểm %**\n${e.matched.length>1?'Đạt cả hai nhóm · ưu tiên màu tím.':'Đạt nhóm chênh lệch ≥30 điểm %.'}`},
   {name:'GIÁ / ĐỘ MỚI',value:`Giá nguồn: ${e.price}\nNguồn quét: ${vn(e.sourceAt)} VN\nBot đọc: ${vn(e.observedAt)} VN\nNhóm có ${e.whaleCount} cá voi theo PumpGlass.`},
   {name:'CÁCH ĐỌC',value:'Tỷ trọng vị thế của nhóm nguồn theo dõi; không phải xác suất thắng hoặc số % cá voi. Không dùng tỷ lệ đang lãi/giá vốn hiện tại để suy ngược lịch sử. Chỉ cảnh báo quan sát; chưa có xác nhận giá/volume hoặc Model 1/3.'},
   {name:'MỞ COIN',value:`[Model 1/3](https://liquidity.nhathadev.trade/coinglass-heatmap-lab?symbol=${link}&range=24h) · [PumpGlass](https://pumpglass.com/smart-money/${link}) · [Binance](https://www.binance.com/en/futures/${link})`},
  ],timestamp:new Date(e.observedAt).toISOString(),footer:{text:PUMPGLASS_LONG_DISCORD_VERSION+' | '+e.group+' | OBSERVE ONLY'},
 }]};
}
function validateWebhook(value){
 if(!value)return null;let u;try{u=new URL(value);}catch{throw Error('INVALID_WEBHOOK');}
 if(u.protocol!=='https:'||!['discord.com','discordapp.com'].includes(u.hostname)||u.username||u.password||u.port||u.search||u.hash||!/^\/api\/webhooks\/\d+\/[^/]+$/.test(u.pathname))throw Error('INVALID_WEBHOOK');return u.href;
}
export class PumpglassLongDiscordWatch{
 constructor({file,getSymbols=()=>[],webhookUrl,fetchImpl=fetch,now=Date.now}={}){
  Object.assign(this,{file,getSymbols,fetchImpl,now});this.webhook=validateWebhook(webhookUrl);this.state={version:PUMPGLASS_LONG_DISCORD_VERSION,alerts:{},history:[],retryUntil:0};this.error=null;this.busy=false;this.checked=new Map();this.coverage={};
 }
 async init(){return this.initializing??=(async()=>{try{
  const s=JSON.parse(await readFile(this.file,'utf8'));
  if(s.version!==PUMPGLASS_LONG_DISCORD_VERSION||!s.alerts||typeof s.alerts!=='object'||Array.isArray(s.alerts)||!Array.isArray(s.history)||!Number.isFinite(s.retryUntil)||Object.values(s.alerts).some(a=>!PUMPGLASS_LONG_GROUPS[a.group]||!Number.isFinite(a.at)))throw Error('STATE_SCHEMA');
  this.state=s;
 }catch(e){if(e.code!=='ENOENT')this.error='STATE_READ_FAILED_NO_SEND';}})();}
 async save(){
  const now=this.now();this.state.history=this.state.history.filter(e=>now-e.observedAt<7*86400000).slice(-500);
  this.state.alerts=Object.fromEntries(Object.entries(this.state.alerts).filter(([,a])=>now-a.at<7*86400000));
  await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(this.state));await rename(tmp,this.file);
 }
 canSend(e){const prior=this.state.alerts[e.symbol];return !prior||this.now()-prior.at>=PUMPGLASS_LONG_RULE.cooldownMs||PUMPGLASS_LONG_GROUPS[e.group].rank>PUMPGLASS_LONG_GROUPS[prior.group].rank;}
 async json(url){const r=await this.fetchImpl(url,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!r.ok){if([403,418,429].includes(r.status)){this.state.retryUntil=this.now()+15*60000;await this.save();}throw Error('UPSTREAM_HTTP_'+r.status);}return r.json();}
 async scan(){
  await this.init();if(this.busy||this.error||!this.webhook||this.now()<this.state.retryUntil)return;
  this.busy=true;let coverage={at:this.now(),boardRows:0,eligible:0,checked:0,qualified:0,attempted:0,sent:0,rejected:0};
  try{
   const universe=new Set(await this.getSymbols());if(!universe.size){this.lastError='UNIVERSE_NOT_READY';return;}
   const board=await this.json('https://pumpglass.com/smart-money/api/board'),now=this.now();
   if(!Array.isArray(board?.rows)||!fresh(board.meta?.snapshot*1000,now,PUMPGLASS_LONG_RULE.boardMaxAgeMs)||!fresh(board.meta?.updated*1000,now,PUMPGLASS_LONG_RULE.boardMaxAgeMs))throw Error('BOARD_STALE_OR_INVALID');
   coverage.boardRows=board.rows.length;
   const candidates=[...new Map(board.rows.filter(r=>symbolOk(r?.s)&&universe.has(r.s)&&r.basis==='whales'&&Number.isInteger(r.n)&&r.n>=10).map(r=>[r.s,{symbol:r.s,...classifyPumpglassLong(r.wl,r.cr)}])).values()].filter(r=>r.group&&this.canSend(r));
   candidates.sort((a,b)=>(this.checked.get(a.symbol)??0)-(this.checked.get(b.symbol)??0)||PUMPGLASS_LONG_GROUPS[b.group].rank-PUMPGLASS_LONG_GROUPS[a.group].rank);coverage.eligible=candidates.length;
   for(const row of candidates){
    if(coverage.checked>=PUMPGLASS_LONG_RULE.maxTokenChecks||coverage.attempted>=PUMPGLASS_LONG_RULE.maxSends||this.now()<this.state.retryUntil)break;
    this.checked.set(row.symbol,this.now());coverage.checked++;
    let token;try{token=await this.json('https://pumpglass.com/smart-money/api/token?symbol='+encodeURIComponent(row.symbol));}catch{coverage.rejected++;continue;}
    const e=pumpglassTokenProof(token,row.symbol,this.now());if(!e||!this.canSend(e)){coverage.rejected++;continue;}coverage.qualified++;
    e.version=PUMPGLASS_LONG_DISCORD_VERSION;e.boardAt=board.meta.snapshot*1000;e.delivery={status:'RESERVED',at:this.now()};
    if(!fresh(e.sourceAt,this.now(),PUMPGLASS_LONG_RULE.tokenMaxAgeMs)||!fresh(e.boardAt,this.now(),PUMPGLASS_LONG_RULE.boardMaxAgeMs))continue;
    this.state.alerts[e.symbol]={group:e.group,at:this.now()};this.state.history.push(e);
    try{await this.save();}catch{this.error='STORAGE_FAILED_NO_SEND';break;} // Durable reservation before POST; unknown delivery never replayed.
    coverage.attempted++;
    try{
     const r=await this.fetchImpl(this.webhook,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(pumpglassLongPayload(e)),signal:AbortSignal.timeout(8000)});
     e.delivery={status:r.ok?'SENT':'FAILED',httpStatus:r.status,at:this.now()};if(r.ok)coverage.sent++;
     if(!r.ok){this.state.retryUntil=this.now()+(r.status===429?60000:15*60000);if(r.status===429){const b=await r.json().catch(()=>({}));if(Number.isFinite(b.retry_after))this.state.retryUntil=this.now()+Math.max(60000,Math.min(3600000,b.retry_after*1000));}}
    }catch{e.delivery={status:'UNKNOWN',at:this.now()};this.state.retryUntil=this.now()+60000;}
    try{await this.save();}catch{this.error='STORAGE_FAILED_NO_SEND';break;}
   }
   this.lastError=null;
  }catch(e){this.lastError=/^UPSTREAM_HTTP_\d+$|^BOARD_STALE_OR_INVALID$/.test(e.message)?e.message:'SCAN_FAILED';}
  finally{this.coverage=coverage;this.busy=false;}
 }
 start(){if(this.timer||!this.webhook)return;void this.scan();this.timer=setInterval(()=>void this.scan(),PUMPGLASS_LONG_RULE.scanMs);this.timer.unref?.();}
 stop(){clearInterval(this.timer);this.timer=null;}
 snapshot(){return structuredClone({version:PUMPGLASS_LONG_DISCORD_VERSION,observeOnly:true,affectsOrders:false,configured:!!this.webhook,error:this.error,lastError:this.lastError??null,rule:PUMPGLASS_LONG_RULE,groups:PUMPGLASS_LONG_GROUPS,coverage:this.coverage,retryUntil:this.state.retryUntil,history:this.state.history.slice(-50).reverse()});}
}
