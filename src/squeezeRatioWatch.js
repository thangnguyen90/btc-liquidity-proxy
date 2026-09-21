import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export const SQUEEZE_RATIO_VERSION = 'SQUEEZE_RATIO_WATCH_V1_20260920';
const Q = 900_000, H = 3600_000;
const pct = (a, b) => a > 0 && b > 0 ? (b / a - 1) * 100 : null;
const median = values => { const a = [...values].sort((a,b)=>a-b), i = a.length >> 1; return a.length % 2 ? a[i] : (a[i-1]+a[i])/2; };
function ema(values, period) {
  const out = Array(values.length).fill(null);
  if (values.length < period) return out;
  let value = values.slice(0,period).reduce((a,b)=>a+b,0)/period;
  out[period-1] = value;
  for (let i=period;i<values.length;i++) out[i] = value += 2/(period+1)*(values[i]-value);
  return out;
}

// No open candles, partial hours or future derivatives samples may enter a decision.
export function squeezePriceCandidate(symbol, rows, now = Date.now()) {
  const bars = [...new Map((rows ?? []).filter(b => Number(b.closeTime) < now)
    .map(b => [Number(b.openTime), b])).values()].sort((a,b)=>a.openTime-b.openTime);
  const b = bars.at(-1);
  if (!b || now-b.closeTime > Q || bars.length < 120) return null;
  if (bars.some(x => !['openTime','closeTime','open','high','low','close','quoteVolume'].every(k=>Number.isFinite(Number(x[k])))
    || x.closeTime-x.openTime !== Q-1 || !(x.low>0 && x.high>=Math.max(x.open,x.close) && x.low<=Math.min(x.open,x.close)))) return null;
  const prior = bars.slice(-21,-1);
  if (prior.some((x,i)=>x.openTime !== b.openTime-(20-i)*Q)) return null;
  const volumeBase = median(prior.map(x=>Number(x.quoteVolume)));
  const volumeX = volumeBase>0 ? b.quoteVolume/volumeBase : 0;
  if (!(b.close>b.open && b.close>Math.max(...prior.map(x=>x.high)) && volumeX>=2
    && b.high>b.low && (b.close-b.low)/(b.high-b.low)>=0.75)) return null;
  const groups = new Map();
  for (const row of bars) { const t=Math.floor(row.openTime/H)*H; const a=groups.get(t)??[];a.push(row);groups.set(t,a); }
  const hours = [...groups].filter(([t,a])=>a.length===4&&a.every((x,i)=>x.openTime===t+i*Q))
    .map(([t,a])=>({t,close:Number(a[3].close),end:a[3].closeTime}));
  if (hours.length<29 || b.closeTime-hours.at(-1).end>H
    || hours.slice(-29).some((x,i,a)=>i && x.t-a[i-1].t!==H)) return null;
  const e13=ema(hours.map(x=>x.close),13), e25=ema(hours.map(x=>x.close),25);
  if (!(hours.at(-1).close>e13.at(-1) && e13.at(-1)>e25.at(-1) && e25.at(-1)>e25.at(-5))) return null;
  return {symbol,at:Number(b.closeTime),signalPrice:Number(b.close),volumeX,ema13h:e13.at(-1),ema25h:e25.at(-1)};
}

export function derivativeAsOf(rows, at) {
  const row = [...(Array.isArray(rows)?rows:[])].filter(r=>Number(r.timestamp)+Q<=at)
    .sort((a,b)=>a.timestamp-b.timestamp).at(-1);
  return row && at-(Number(row.timestamp)+Q)<=Q+2000 ? row : null;
}

export function qualifySqueeze(candidate, ratios, interests) {
  const current=derivativeAsOf(ratios,candidate.at), previous=derivativeAsOf(ratios,candidate.at-H);
  const ratio=Number(current?.longShortRatio), ratioDelta=pct(Number(previous?.longShortRatio),ratio);
  if (!(ratio>0 && ratio<1 && ratioDelta!==null && ratioDelta<=-10)) return null;
  const oi=derivativeAsOf(interests,candidate.at), old=derivativeAsOf(interests,candidate.at-H);
  const oiDelta=pct(Number(old?.sumOpenInterest),Number(oi?.sumOpenInterest));
  return {...candidate,version:SQUEEZE_RATIO_VERSION,observeOnly:true,ratio,ratioDelta,oiDelta,
    ratioAt:Number(current.timestamp),oiAt:oi?Number(oi.timestamp):null,
    tier:oiDelta!==null && oiDelta>=3?'RATIO_OI':'RATIO'};
}

export function squeezeDiscordPayload(e) {
  const strong=e.tier==='RATIO_OI', num=v=>Number.isFinite(v)?v.toFixed(2):'thiếu dữ liệu';
  return {username:'Squeeze Ratio Watch',allowed_mentions:{parse:[]},embeds:[{
    title:`${strong?'🟣':'🟠'} ${e.symbol} · NGUY CƠ SQUEEZE SHORT · ${strong?'RATIO + OI':'RATIO'}`,
    color:strong?0xa855f7:0xf59e0b,
    description:'**OBSERVE ONLY — KHÔNG TỰ VÀO BINANCE**\nGiá phá đỉnh nhưng tỷ lệ tài khoản long/short giảm. Không phải xác nhận đảo chiều hay bằng chứng thanh lý thực tế.',
    fields:[{name:'NẾN ĐÓNG 15m + XU HƯỚNG 1h',value:`Giá xác nhận ${e.signalPrice}\nVolume ${num(e.volumeX)}× median 20 nến trước\n1h close > EMA13 > EMA25; EMA25 tăng so với 4h trước.`},
      {name:'LONG / SHORT RATIO · OI',value:`Account L/S ${num(e.ratio)} · thay đổi 1h ${num(e.ratioDelta)}%\nOI số lượng thay đổi 1h ${num(e.oiDelta)}${e.oiDelta===null?'':'%'}\nDữ liệu 15m được lùi 15 phút; account ratio không phản ánh quy mô vị thế.`},
      {name:'THỜI ĐIỂM VIỆT NAM',value:new Date(e.at+1).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false})},
      {name:'BIỂU ĐỒ',value:`[Binance](https://www.binance.com/en/futures/${encodeURIComponent(e.symbol)})`}],
    footer:{text:SQUEEZE_RATIO_VERSION+' · Chưa kiểm định lợi nhuận · Không phải điểm vào lệnh'},timestamp:new Date(e.at).toISOString(),
  }]};
}

export class SqueezeRatioWatch {
  constructor({stateFile,webhookUrl,client,cache,getSymbols,isBusy,now=()=>Date.now(),fetchImpl=fetch}) {
    Object.assign(this,{stateFile,webhookUrl,client,cache,getSymbols,isBusy,now,fetchImpl});
    this.startedAt=now(); this.state=null; this.running=false; this.checked=new Map(); this.retryAfter=0;
    this.health={status:'starting',startedAt:this.startedAt,universe:0,ready:0,candidates:0,errors:0};
  }
  async load() {
    if (this.state) return;
    if (this.loading) return this.loading;
    this.loading=(async()=>{
      let state;
      try { state=JSON.parse(await readFile(this.stateFile,'utf8')); }
      catch(e) { if(e.code!=='ENOENT') throw new Error('Squeeze state unreadable'); state={events:[]}; }
      if (!Array.isArray(state.events)) throw new Error('Squeeze state invalid');
      state.anchors ??= Object.fromEntries(state.events.filter(e=>e.delivery!=='rejected').map(e=>[`${e.symbol}:${e.tier}`,e.at]));
      this.state=state;
    })();
    try {await this.loading;} finally {this.loading=null;}
  }
  async save() {
    this.state.version=SQUEEZE_RATIO_VERSION;
    this.state.events=this.state.events.filter(e=>this.now()-e.at<7*24*H).slice(-200);
    this.state.anchors=Object.fromEntries(Object.entries(this.state.anchors).filter(([,at])=>this.now()-at<7*24*H));
    await mkdir(dirname(this.stateFile),{recursive:true});
    await writeFile(this.stateFile+'.tmp',JSON.stringify(this.state,null,2));
    await rename(this.stateFile+'.tmp',this.stateFile);
  }
  async snapshot() {
    await this.load();
    return {version:SQUEEZE_RATIO_VERSION,observeOnly:true,configured:!!this.webhookUrl(),
      health:{...this.health},events:[...this.state.events].reverse()};
  }
  async deliver(event) {
    await this.load();
    if (event.at<this.startedAt || event.at>=this.now() || this.now()-event.at>Q || !this.webhookUrl() || this.now()<this.retryAfter) return;
    // A stronger tier may follow a ratio-only alert. A strong alert also covers ratio-only for six hours.
    const anchorKey=`${event.symbol}:${event.tier}`;
    if ([this.state.anchors[anchorKey],event.tier==='RATIO'?this.state.anchors[`${event.symbol}:RATIO_OI`]:null]
      .some(at=>Number.isFinite(at)&&event.at-at<6*H)) return;
    const existing=this.state.events.find(e=>e.id===`${event.symbol}:${event.at}:${event.tier}`);
    if (existing && existing.retryAt>this.now()) return;
    const record=existing??{...event,id:`${event.symbol}:${event.at}:${event.tier}`,detectedAt:this.now()};
    if (!existing) this.state.events.push(record);
    // Durable intent BEFORE POST: crash/timeout is unknown, not safe to auto-replay a webhook.
    record.delivery='unknown'; delete record.retryAt;
    this.state.anchors[anchorKey]=event.at;
    await this.save();
    let response;
    try { response=await this.fetchImpl(this.webhookUrl(),{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify(squeezeDiscordPayload(record)),signal:AbortSignal.timeout(10_000)}); }
    catch { await this.save(); return; }
    if (response.ok) {record.delivery='sent';record.sentAt=this.now();}
    else {
      record.delivery='rejected';record.httpStatus=response.status;
      delete this.state.anchors[anchorKey];
      const body=response.status===429?await response.json().catch(()=>({})):{};
      this.retryAfter=this.now()+Math.max(60_000,Math.min(H,(Number(body.retry_after)||0)*1000));
      record.retryAt=this.retryAfter;
    }
    await this.save();
  }
  async scan() {
    if (this.running) return;
    this.running=true;
    try {
      await this.load();
      if (!this.webhookUrl()) {this.health.status='not_configured';return;}
      if (this.isBusy()) {this.health.status='rate_gate_paused';return;}
      const symbols=(await this.getSymbols()).map(s=>typeof s==='string'?s:s.symbol);
      this.cache.subscribeGroup('squeeze-ratio-watch',symbols,'15m');
      const missing=this.cache.needsRefresh(symbols,'15m',480,Q+60_000).slice(0,8);
      if (missing.length) await this.cache.seed(missing,'15m',500,{batchSize:2,batchDelayMs:1500,subscribe:false,maxAgeMs:Q+60_000});
      let ready=0,candidates=0,requests=0,errors=0;
      for (const symbol of symbols) {
        if (this.isBusy()) break;
        const rows=this.cache.getIfCached(symbol,'15m',500)??[];
        if (rows.length>=120) ready++;
        const candidate=squeezePriceCandidate(symbol,rows,this.now());
        if (!candidate || candidate.at<this.startedAt) continue;
        candidates++;
        const key=`${symbol}:${candidate.at}`;
        if (this.checked.has(key) || requests>=12) continue;
        requests++;
        try {
          const options={priority:8,dropOnCongestion:true,source:'SqueezeRatioWatch'};
          const ratios=await this.client.getGlobalLongShortRatio(symbol,'15m',12,options);
          if (!derivativeAsOf(ratios,candidate.at) || !derivativeAsOf(ratios,candidate.at-H)) continue;
          const basic=qualifySqueeze(candidate,ratios,[]);
          if (!basic) {this.checked.set(key,candidate.at);continue;}
          let interests=[];
          try {interests=await this.client.get('/futures/data/openInterestHist',{symbol,period:'15m',limit:12},options);}
          catch {errors++;}
          const event=qualifySqueeze(candidate,ratios,interests);
          await this.deliver(event);
          const completeOi=derivativeAsOf(interests,candidate.at)&&derivativeAsOf(interests,candidate.at-H);
          const delivered=this.state.events.some(e=>e.symbol===symbol&&candidate.at-e.at<6*H
            && e.delivery!=='rejected' && (e.tier===event.tier || event.tier==='RATIO'));
          if (completeOi && delivered) this.checked.set(key,candidate.at);
        } catch {errors++;}
      }
      this.checked=new Map([...this.checked].filter(([,at])=>this.now()-at<2*Q));
      Object.assign(this.health,{status:this.isBusy()?'rate_gate_paused':'running',lastScanAt:this.now(),universe:symbols.length,ready,candidates,errors});
    } catch {this.health.status='scan_error';this.health.errors++;}
    finally {this.running=false;}
  }
  start() {
    if (this.timer) return;
    this.timer=setInterval(()=>this.scan(),60_000);this.timer.unref?.();
    this.startTimer=setTimeout(()=>this.scan(),65_000);this.startTimer.unref?.();
  }
}
