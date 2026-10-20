import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {wickClosedRows} from './btcWickRecovery.js';
import {deliverWickChannels} from './coinPumpWickDiscord.js';
import {COIN_PUMP_WICK_EARLY_VERSION as VERSION,COIN_PUMP_WICK_EARLY_PUSH_TYPE,COIN_PUMP_WICK_EARLY_LABEL} from '../public/coin-pump-wick-early-model.js';
const mean = xs => xs.reduce((a,b)=>a+b,0)/xs.length;
const pct = (a,b) => (a/b-1)*100;
const copy = x => JSON.parse(JSON.stringify(x));

// Freeze a 30/45/60-minute pump BEFORE the wick, including a late pullback after its peak.
export function broadCoinPumpContext(prior = []) {
  const candidates = [];
  for (const minutes of [30,45,60]) {
    if (prior.length < minutes + 20) continue;
    const window = prior.slice(-(minutes+20)), base = window.slice(0,20), wave = window.slice(20);
    const baseline = mean(base.map(r=>r.quoteVolume));
    const atr = mean(base.map((r,i)=>Math.max(r.high-r.low,Math.abs(r.high-(base[i-1]?.close??r.open)),Math.abs(r.low-(base[i-1]?.close??r.open)))));
    const peak = Math.max(...wave.map(r=>r.high)), peakIndex = wave.findIndex(r=>r.high===peak);
    const run = wave.slice(0,peakIndex+1), gain = pct(peak,wave[0].open), atrPct = atr/wave[0].open*100;
    const waveVolume = mean(run.map(r=>r.quoteVolume)), green = run.filter(r=>r.close>r.open).length;
    const drawdown = (1-wave.at(-1).close/peak)*100;
    if (!(baseline>0&&atr>0) || run.length<5 || gain<Math.max(3,4*atrPct)
      || waveVolume/baseline<1.5 || green<Math.max(3,Math.ceil(run.length*.4)) || drawdown>20) continue;
    candidates.push({lookbackMinutes:minutes,waveGainPct:gain,waveVolumeRatio:waveVolume/baseline,
      peak,peakAt:wave[peakIndex].closeTime,drawdownPct:drawdown,greenBars:green,runBars:run.length,
      atr,atrPct,baseline,waveVolume,support:Math.min(...prior.slice(-3).map(r=>r.low)),preSweepRows:window});
  }
  // Deterministic, choose the shortest sufficient context, not the window with the best future return.
  return candidates[0] ?? null;
}

export function evaluateCoinPumpWickEarly(rows, index) {
  const sweep = rows[index], prior = rows.slice(Math.max(0,index-80),index), pump = broadCoinPumpContext(prior);
  if (!sweep || !pump) return null;
  const range = sweep.high-sweep.low, drop = (1-sweep.low/sweep.high)*100;
  const wick = range>0 ? (Math.min(sweep.open,sweep.close)-sweep.low)/range : 0;
  const rebound = pct(sweep.close,sweep.low);
  if (!(range>0) || drop<Math.max(2,3*pump.atrPct) || range<2.5*pump.atr || wick<.4 || rebound<.5
    || sweep.low>pump.support*.9985 || sweep.quoteVolume<Math.max(2*pump.baseline,1.2*pump.waveVolume)) return null;
  return {version:VERSION,observeOnly:true,contextMode:'BROAD_COIN_PUMP',status:'WICK_DETECTED',pattern:'EARLY_WICK',interval:'1m',
    detectedAt:sweep.closeTime,sweepAt:sweep.closeTime,price:sweep.close,sweepHigh:sweep.high,sweepLow:sweep.low,
    level:pump.support,reclaimed:sweep.close>=pump.support,wickPct:wick*100,highToLowDropPct:drop,reboundPct:rebound,
    pump:{lookbackMinutes:pump.lookbackMinutes,waveGainPct:pump.waveGainPct,waveVolumeRatio:pump.waveVolumeRatio,
      peak:pump.peak,peakAt:pump.peakAt,drawdownPct:pump.drawdownPct,atrPct:pump.atrPct,
      killVolumeRatio:sweep.quoteVolume/pump.waveVolume,greenBars:pump.greenBars,runBars:pump.runBars},
    preSweepRows:pump.preSweepRows,sweep,confirmationRequired:false,
    reason:'Sóng bơm 30–60 phút → một nến quét sâu có râu dưới; báo ngay khi đóng, không chờ reclaim hay nến sau. Chưa xác nhận hồi.'};
}

export function earlyWickPushPayload(e, now=Date.now()) {
  return {signalType:COIN_PUMP_WICK_EARLY_PUSH_TYPE,eventId:e.id,symbol:e.symbol,interval:'1m',expiresAt:now+120_000,
    title:`🟠 ${e.symbol} · ${COIN_PUMP_WICK_EARLY_LABEL}`,
    body:`Sóng ${e.pump.lookbackMinutes}m +${e.pump.waveGainPct.toFixed(2)}% → xả sâu ${e.highToLowDropPct.toFixed(2)}% → râu dưới ${e.wickPct.toFixed(1)}%. Đáy ${e.sweepLow}, đóng ${e.price}; ${e.reclaimed?'đã':'chưa'} lấy lại ${e.level}. KHÔNG chờ xác nhận; vẫn có thể giảm tiếp. Cảnh báo không xác nhận Binance đã vào; nhánh LONG3 cần pass ratio/guard và route ON.`,
    url:`/local-ai-trend-evaluation?earlyWick=${encodeURIComponent(e.id)}#coin-pump-wick-early`};
}

export class CoinPumpWickEarlyMonitor {
  constructor({file,getRows=()=>[],getSymbols=()=>[],pushSender=async()=>({sent:0}),discordSender=null,onEntry=null,now=()=>Date.now()}={}) {
    Object.assign(this,{file,getRows,getSymbols,pushSender,discordSender,onEntry,now});
    this.startedAt=now();this.enabled=true;this.history=[];this.error=null;this.busy=false;this.lastClosed=new Map();this.coverage={};
  }
  async init() {
    if(!this.file)return this;
    try {
      const raw=JSON.parse(await readFile(this.file,'utf8'));
      if(raw.version!==VERSION||!Array.isArray(raw.history)||typeof raw.enabled!=='boolean')throw Error('schema');
      this.history=raw.history;this.enabled=raw.enabled;
      for(const e of this.history)for(const key of ['delivery','discordDelivery'])
        if(e[key]?.status==='POSTING')e[key]={status:'UNKNOWN_AFTER_RESTART'};
    } catch(e) {if(e.code!=='ENOENT')this.error='Lịch sử rút râu sớm không hợp lệ · giữ file cũ và dừng gửi.';}
    return this;
  }
  async save() {
    if(this.error)throw Error('storage unavailable');
    this.history=this.history.filter(e=>this.now()-e.detectedAt<=14*86400_000).slice(-10_000);
    if(!this.file)return;
    try {
      await mkdir(dirname(this.file),{recursive:true});const tmp=`${this.file}.tmp-${process.pid}`;
      await writeFile(tmp,JSON.stringify({version:VERSION,enabled:this.enabled,history:this.history}));await rename(tmp,this.file);
    } catch {this.error='Không lưu được lịch sử · dừng gửi.';throw Error('storage unavailable');}
  }
  async setEnabled(enabled) {
    if(typeof enabled!=='boolean'||this.busy)throw Error('invalid or busy');this.busy=true;
    try{this.enabled=enabled;await this.save();return this.snapshot();}finally{this.busy=false;}
  }
  async scan() {
    if(this.busy||this.error)return;this.busy=true;
    try {
      const now=this.now(),symbols=[...new Set(this.getSymbols())].filter(s=>s!=='BTCUSDT');
      this.coverage={total:symbols.length,ready:0,pumping:0,btcRequired:false,requiredBars:51,updatedAt:now};const updates=[];
      for(const symbol of symbols) {
        if(!/^[\p{L}\p{N}]{1,32}USDT$/u.test(symbol))continue;
        const rows=wickClosedRows(this.getRows(symbol),now,90);if(rows.length<51)continue;this.coverage.ready++;
        if(broadCoinPumpContext(rows.slice(0,-1)))this.coverage.pumping++;
        if(this.lastClosed.get(symbol)===rows.at(-1).closeTime)continue;this.lastClosed.set(symbol,rows.at(-1).closeTime);
        for(let i=Math.max(50,rows.length-2);i<rows.length;i++) {
          const id=`pump-wick-early:${symbol}:${rows[i].openTime}`;
          if(rows[i].closeTime<=this.startedAt||this.history.some(e=>e.id===id))continue;
          const result=evaluateCoinPumpWickEarly(rows,i);if(!result)continue;
          const status=!this.enabled?'DISABLED':now-result.detectedAt>75_000?'STALE':'POSTING';
          const e={...result,id,symbol,observedAt:now,delivery:{status},discordDelivery:{status:this.discordSender?status:'NOT_CONFIGURED'}};
          this.history.push(e);updates.push(e);
        }
      }
      if(updates.length)await this.save();
      // A separate default-OFF executor checks ratio/risk. Do not delay either
      // alert channel while it reads ratio/account or submits an order.
      for(const e of updates)if(this.enabled&&now-e.detectedAt<=70000&&this.onEntry)
        void Promise.resolve().then(()=>this.onEntry(copy(e))).catch(()=>{});
      for(const e of updates)await deliverWickChannels(e,{pushSender:this.pushSender,discordSender:this.discordSender,now:this.now,payload:earlyWickPushPayload(e,this.now())});
      if(updates.length)await this.save();
    }catch{if(!this.error)this.error='Detector rút râu sớm lỗi · dừng gửi để kiểm tra.';}
    finally{this.busy=false;}
  }
  start(){void this.init().then(()=>{void this.scan();this.timer=setInterval(()=>void this.scan(),5000);this.timer.unref?.();});}
  snapshot(id=null){return copy({version:VERSION,observeOnly:true,enabled:this.enabled,startedAt:this.startedAt,error:this.error,
    discordConfigured:typeof this.discordSender==='function',coverage:this.coverage,counts:{WICK_DETECTED:this.history.length},
    history:[...this.history].reverse().slice(0,100),selected:id?this.history.find(e=>e.id===id)??null:null,closedStats:{closed:0,avgRoe:null}});}
}
