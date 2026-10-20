import {dirname} from 'node:path';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {isRisingVolumeEntrySignal,risingVolumeMargin} from './risingVolumeBinance.js';

export const RISING_VOLUME_DISCORD_VERSION='RISING_VOLUME_1M_SUSTAINED_DISCORD_V1_20261008';
export const RISING_VOLUME_DISCORD_MAX_AGE_MS=70_000;
const DELIVERY_TTL_MS=180_000,RETENTION_MS=14*86400_000;
const clone=v=>JSON.parse(JSON.stringify(v));
const number=(v,d=4)=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:d});
const executionLabels={SUBMITTED:'ĐÃ GỬI MARKET · chưa xác nhận khớp / TP-SL',FILLED:'ĐÃ KHỚP · xem trạng thái TP/SL trên Binance',
  EXISTING_POSITION:'KHÔNG VÀO · đã có vị thế coin này',EXISTING_ORDER:'KHÔNG VÀO · có entry đang chờ',
  MAX_OPEN_POSITIONS:'KHÔNG VÀO · đã đủ cap chung 50',PROTECTION_DISABLED:'KHÔNG VÀO · protection / FULL BYPASS',
  RUNTIME_OFF:'KHÔNG VÀO · execution OFF hoặc dry-run',OFF:'KHÔNG VÀO · master / route OFF',
  CONTROL_CHANGED:'KHÔNG VÀO · setting đã thay đổi',PRICE_OR_AGE_BLOCKED:'KHÔNG VÀO · giá lệch / tín hiệu quá tuổi',
  'PRE-ENABLE-OR-STALE':'KHÔNG VÀO · trước lúc bật / tín hiệu quá tuổi',ACCOUNT_DATA_MISSING:'KHÔNG VÀO · thiếu dữ liệu tài khoản',
  UNRESOLVED_PREVIOUS_ORDER:'KHÔNG VÀO · lệnh trước chưa rõ kết quả',ERROR_OR_UNKNOWN:'LỖI / CHƯA RÕ · không tự gửi lại MARKET',
  UNKNOWN:'CHƯA RÕ · không tự gửi lại MARKET',STATE_ERROR:'KHÔNG VÀO · lỗi lưu trạng thái',
  'STATE-ERROR':'KHÔNG VÀO · lỗi lưu trạng thái'};

export function risingVolumeDiscordWebhook(value) {
  try {
    const u=new URL(String(value??'').trim());
    if(u.protocol!=='https:'||u.hostname!=='discord.com'||u.port||u.username||u.password
      ||!/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+\/?$/.test(u.pathname))return null;
    return `${u.origin}${u.pathname.replace(/\/$/,'')}`;
  } catch{return null;}
}
function publicBase(value) {
  try{const u=new URL(String(value));if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)return u.origin;}catch{}
  return 'https://liquidity.nhathadev.trade';
}
export function risingVolumeDiscordPayload(event,execution={},baseUrl) {
  const s=event.snapshot,isLong=s.side==='LONG',status=String(execution.status??'UNKNOWN').toUpperCase();
  const proof=execution.risingVolumeRatioProof;
  const ratioText=proof?.pass?`**PASS ratio tài khoản top trader 5m** · nền 30m biên **${number(proof.widthPct,2)}%** · đổi **${number(proof.changePct,2)}%** trong **${proof.transitionMinutes}m**`
    :`**CHỈ DISCORD khi chưa pass gate ratio** · ${String(proof?.reason??(status.startsWith('RATIO_')?status:'chưa kiểm tra / route OFF'))}\nCần nền 30m biên ≤5%, rồi ${isLong?'giảm':'tăng'} ≥10% trong ≤30m; không suy từ OI hoặc ratio vị thế.`;
  const id=String(execution.orderId??'').replace(/[^0-9]/g,'').slice(0,24);
  return {username:'Volume 1m · Liền mạch',allowed_mentions:{parse:[]},embeds:[{
    title:`${isLong?'🟢':'🔴'} VOLUME 1M LIỀN MẠCH · ${s.side} · ${s.symbol}`,color:isLong?0x35f3b0:0xff6e87,
    description:'**PASS DETECTOR + NỀN VOLUME 1M DUY TRÌ · NẾN ĐÃ ĐÓNG.**\nTín hiệu mới đầu đợt; không phải xác suất thắng. Đạt tín hiệu không đồng nghĩa Binance đã vào lệnh.',
    fields:[
      {name:'GIÁ / HƯỚNG TẠI LÚC PHÁT HIỆN',value:`Close **${number(s.price,10)}** · 5 nến **${number(s.priceChangePct,2)}%** · ${s.side}`,inline:false},
      {name:'VOLUME ĐÃ ĐẠT',value:`MA5 tăng **3/3 bước** · TB5 / nền20 **${number(s.volumeRatio,2)}x**\nNền 1m: **${s.pattern1mElevatedBars}/10 nến** giữ floor · TB10 / median20 **${number(s.pattern1mMeanRatio,2)}x**\nCột lớn nhất **${number(Number(s.pattern1mDominantShare)*100,1)}%** tổng10 · không cao→tụt ≥75%`,inline:false},
      {name:`BINANCE · RULE ${risingVolumeMargin(s.side)} USDT MARGIN × 5X`,value:`**${executionLabels[status]??(status.startsWith('RATIO_')?'KHÔNG VÀO · chưa đạt / thiếu dữ liệu ratio':'CHƯA RÕ · xem nhật ký trên web')}**${id?`\nOrder ID **${id}**`:''}\nTP **+10% ROE** / SL **−30% ROE**, neo giá khớp. Tin này không xác nhận đã đặt đủ TP/SL.`,inline:false},
      {name:'GATE BINANCE · VOLUME + RATIO',value:ratioText+'\nNgưỡng thử nghiệm, chưa chứng minh lợi thế. Các guard Binance vẫn áp dụng.',inline:false},
      {name:'THỜI ĐIỂM NẾN ĐÓNG (UTC+7)',value:new Date(s.closedAt).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false}),inline:false},
      {name:'MỞ TÍN HIỆU',value:`[Volume · snapshot gốc](${publicBase(baseUrl)}/rising-volume-watch?view=history&id=${encodeURIComponent(event.id)}) · [Binance](https://www.binance.com/en/futures/${encodeURIComponent(s.symbol)})`,inline:false},
    ],timestamp:new Date(s.observedAt).toISOString(),
    footer:{text:`${RISING_VOLUME_DISCORD_VERSION} · dữ liệu lúc phát hiện; xem giá mới trước quyết định`},
  }]};
}

export class RisingVolumeDiscordNotifier {
  constructor({stateFile,webhookUrl=()=>'',baseUrl=()=>'',fetchImpl=(...args)=>globalThis.fetch(...args),
    now=()=>Date.now(),startedAt=now(),storage=null}={}) {
    Object.assign(this,{stateFile,webhookUrl,baseUrl,fetchImpl,now,startedAt,storage});
    this.state=null;this.queue=Promise.resolve();this.error=null;
  }
  configured(){return !!risingVolumeDiscordWebhook(typeof this.webhookUrl==='function'?this.webhookUrl():this.webhookUrl);}
  load() {
    if(this.state)return Promise.resolve(this.state);
    if(this.loading)return this.loading;
    this.loading=(async()=>{
      let raw;
      try{raw=this.storage?await this.storage.load():JSON.parse(await readFile(this.stateFile,'utf8'));}
      catch(e){if(e.code!=='ENOENT')throw Error('DISCORD_LEDGER_UNREADABLE');}
      if(raw&&(raw.version!==RISING_VOLUME_DISCORD_VERSION||!raw.events||typeof raw.events!=='object'
        ||Array.isArray(raw.events)||Object.entries(raw.events).some(([id,e])=>!e||e.id!==id||!Number.isFinite(e.closedAt)
          ||!Number.isFinite(e.at)||!['PENDING','POSTING','SENT','UNKNOWN','REJECTED','EXPIRED'].includes(e.status))))
        throw Error('DISCORD_LEDGER_INVALID_RETAINED');
      this.state=raw??{version:RISING_VOLUME_DISCORD_VERSION,initializedAt:this.now(),events:{},retryAfter:0};
      return this.state;
    })().finally(()=>{this.loading=null;});
    return this.loading;
  }
  async save() {
    const cutoff=this.now()-RETENTION_MS;
    this.state.events=Object.fromEntries(Object.entries(this.state.events).filter(([,r])=>r.at>=cutoff));
    this.state.updatedAt=this.now();const value=clone(this.state);
    if(this.storage)return this.storage.save(value);
    await mkdir(dirname(this.stateFile),{recursive:true});const tmp=`${this.stateFile}.tmp-${process.pid}`;
    await writeFile(tmp,JSON.stringify(value),'utf8');await rename(tmp,this.stateFile);
  }
  serial(fn){const p=this.queue.catch(()=>{}).then(fn);this.queue=p.catch(()=>{});return p;}
  process(event,execution={}) {
    const admittedAt=this.now();
    return this.serial(async()=>{
      try {
        if(!this.configured())return {status:'off'};
        await this.load();
        if(!isRisingVolumeEntrySignal(event))return {status:'ineligible'};
        const s=event.snapshot;
        if(s.closedAt<=this.startedAt||s.closedAt>=s.observedAt||s.observedAt>admittedAt
          ||admittedAt-s.closedAt>RISING_VOLUME_DISCORD_MAX_AGE_MS)return {status:'old-or-stale'};
        if(this.state.events[event.id])return {status:'deduped'};
        const record={id:event.id,symbol:s.symbol,side:s.side,closedAt:s.closedAt,at:admittedAt,status:'PENDING',
          payload:risingVolumeDiscordPayload(event,execution,typeof this.baseUrl==='function'?this.baseUrl():this.baseUrl)};
        this.state.events[event.id]=record;await this.save();
        await this.sendPending();return {status:record.status};
      } catch(e){this.error=e.message;return {status:'state-error'};}
    });
  }
  flush(){return this.serial(async()=>{try{if(!this.configured())return;await this.load();await this.sendPending();}
    catch(e){this.error=e.message;}});}
  async sendPending() {
    for(const r of Object.values(this.state.events).filter(r=>r.status==='PENDING').sort((a,b)=>a.at-b.at)) {
      if(r.closedAt<=this.startedAt||this.now()-r.closedAt>DELIVERY_TTL_MS){r.status='EXPIRED';await this.save();continue;}
      if(this.now()<Number(this.state.retryAfter||0))return;
      const webhook=risingVolumeDiscordWebhook(typeof this.webhookUrl==='function'?this.webhookUrl():this.webhookUrl);
      if(!webhook)return;
      // Durable intent BEFORE POST. Timeout/5xx/crash is uncertain: never blindly
      // resend it. Only Discord's explicit 429 rejection is safely retried.
      r.status='POSTING';r.lastAttemptAt=this.now();r.attempts=(r.attempts||0)+1;await this.save();
      let response;
      try{response=await this.fetchImpl(`${webhook}?wait=true`,{method:'POST',redirect:'error',
        headers:{'content-type':'application/json'},body:JSON.stringify(r.payload),signal:AbortSignal.timeout(10_000)});}
      catch{r.status='UNKNOWN';this.error='DISCORD_NETWORK_RESULT_UNKNOWN';await this.save();continue;}
      r.httpStatus=response.status;
      if(response.ok){
        const result=await response.json().catch(()=>null);r.status='SENT';r.sentAt=this.now();
        if(/^\d+$/.test(String(result?.id??'')))r.messageId=String(result.id);
        this.error=null;
      } else if(response.status===429) {
        const result=await response.json().catch(()=>({})),delay=Number(result.retry_after);
        this.state.retryAfter=this.now()+Math.min(180_000,Math.max(1000,Number.isFinite(delay)?delay*1000:30_000));
        r.status='PENDING';this.error='DISCORD_RATE_LIMITED';
      } else {
        r.status=response.status>=500?'UNKNOWN':'REJECTED';this.error=`DISCORD_HTTP_${response.status}`;
        this.state.retryAfter=this.now()+30_000;
      }
      await this.save();
    }
  }
  snapshot() {
    const events=Object.values(this.state?.events??{});
    return {version:RISING_VOLUME_DISCORD_VERSION,configured:this.configured(),startedAt:this.startedAt,error:this.error,
      sent:events.filter(r=>r.status==='SENT').length,pending:events.filter(r=>r.status==='PENDING').length,
      uncertain:events.filter(r=>['POSTING','UNKNOWN'].includes(r.status)).length,
      rejected:events.filter(r=>r.status==='REJECTED').length,lastSentAt:Math.max(0,...events.map(r=>r.sentAt??0))||null};
  }
}
