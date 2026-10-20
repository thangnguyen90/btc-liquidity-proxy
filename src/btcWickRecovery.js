import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { BTC_WICK_VERSION, BTC_WICK_PUSH_TYPE, BTC_WICK_LABELS,
  COIN_PUMP_WICK_VERSION as VERSION, COIN_PUMP_WICK_PUSH_TYPE, COIN_PUMP_WICK_LABELS } from '../public/btc-wick-recovery-model.js';
import {coinPumpWaveContext} from './coinPumpWaveContext.js';
import {deliverWickChannels} from './coinPumpWickDiscord.js';
const MIN = 60_000;
const mean = xs => xs.reduce((a,b) => a+b,0)/xs.length;
const pct = (a,b) => (a/b-1)*100;
const buy = r => r.quoteVolume > 0 ? r.takerBuyQuoteVolume/r.quoteVolume : null;
const copy = x => JSON.parse(JSON.stringify(x));

// Cache-only, closed-only. Reject invalid rows/gaps instead of treating missing data as a calm market.
export function wickClosedRows(rows = [], now = Date.now(), maxRows = 60) {
  const out = rows.filter(r => Number(r.closeTime) < now && r.isClosed !== false).slice(-maxRows)
    .map(r => Object.fromEntries(['openTime','closeTime','open','high','low','close','quoteVolume','takerBuyQuoteVolume']
      .map(k => [k,r[k]==null || r[k]===''?NaN:Number(r[k])])));
  if (out.length < 26 || now-out.at(-1).closeTime > 75_000) return [];
  for (let i=0;i<out.length;i++) {
    const r=out[i];
    if (!Object.values(r).every(Number.isFinite) || r.openTime % MIN !== 0 || r.closeTime !== r.openTime+MIN-1
      || Math.min(r.open,r.low,r.close)<=0 || r.high<Math.max(r.open,r.close) || r.low>Math.min(r.open,r.close)
      || r.quoteVolume<0 || r.takerBuyQuoteVolume<0 || r.takerBuyQuoteVolume>r.quoteVolume
      || (i && r.openTime-out[i-1].openTime!==MIN)) return [];
  }
  return out;
}

export function btcCrashContext(rows, endAt) {
  const before=rows.filter(r=>r.closeTime<=endAt);
  // A sharp drop may precede the alt sweep, but context expires after ten minutes.
  for (let end=before.length-1;end>=25 && before.length-1-end<=10;end--) {
    const base=before.slice(end-25,end-5), move=before.slice(end-4,end+1), prev=before[end-5];
    const atrPct=mean(base.map((r,i)=> Math.max(r.high-r.low,
      Math.abs(r.high-(base[i-1]?.close??r.open)),Math.abs(r.low-(base[i-1]?.close??r.open)))/r.close*100));
    const return5m=pct(move.at(-1).close,prev.close), quote=move.reduce((s,r)=>s+r.quoteVolume,0);
    const taker=quote>0?move.reduce((s,r)=>s+r.takerBuyQuoteVolume,0)/quote:null;
    const baseline=mean(base.map(r=>r.quoteVolume));
    const volumeRatio=baseline>0?quote/(5*baseline):null;
    const return30m=end>=30?pct(move.at(-1).close,before[end-30].close):null;
    const sharp=return5m<=-.5 && -return5m>=2.5*atrPct && taker!=null && taker<=.45
      && (volumeRatio>=1.5 || return5m<=-1);
    // A final flush can be smaller after sustained selling. Do not require a fresh crash at the exact bottom.
    const continuing=return30m!=null && return30m<=-.5 && return5m<=-.3 && -return5m>=2*atrPct
      && taker!=null && taker<=.35 && volumeRatio>=1.2;
    if (sharp || continuing) {
      return {at:move.at(-1).closeTime,mode:sharp?'SHARP_DROP':'CONTINUED_SELL',return5m,return30m,atrPct,volumeRatio,takerBuy:taker,
        low:Math.min(...move.map(r=>r.low)),close:move.at(-1).close,closedRows:before.slice(end-25,end+1)};
    }
  }
  return null;
}

export function evaluateWickEpisode(rows, index, btcRows, liquidation = null) {
  const sweep=rows[index], prior=rows.slice(index-20,index);
  if (!sweep || prior.length!==20) return null;
  const level=Math.min(...prior.map(r=>r.low)), context=btcCrashContext(btcRows,sweep.closeTime);
  if (!context || sweep.low>=level*.9995) return null; // at least 0.05% below the fixed prior low
  const range=sweep.high-sweep.low, wick=range>0?(Math.min(sweep.open,sweep.close)-sweep.low)/range:0;
  const sweepBuy=buy(sweep);
  const result={version:BTC_WICK_VERSION,observeOnly:true,side:'LONG',sweepAt:sweep.closeTime,level,
    sweepLow:sweep.low,sweepHigh:sweep.high,sweepBuy,wickPct:wick*100,btc:context,
    liquidation:liquidation?.ready?{long1m:liquidation.long1m,long5m:liquidation.long5m,sampled:true}:null,
    preSweepRows:prior,sweep,confirmationRows:[],status:'WAIT_CONFIRM',pattern:null};
  for(let j=index;j<=Math.min(index+3,rows.length-1);j++) {
    const r=rows[j];
    if(j>index && r.low<sweep.low) return {...result,confirmationRows:rows.slice(index+1,j+1),status:'INVALIDATED',resolvedAt:r.closeTime,reason:'Tạo đáy mới trước xác nhận'};
    const taker=buy(r), immediate=j===index;
    const recovered=r.close>r.open && (r.close>level || r.close>sweep.high);
    const pressure=taker!=null && taker>=.5 && (immediate || (sweepBuy!=null && taker>sweepBuy));
    const shape=!immediate || (wick>=.4 && range>0 && (r.close-r.low)/range>=.6);
    if(recovered && pressure && shape) {
      const rebound=pct(r.close,sweep.low), btcSweep=btcRows.find(b=>b.closeTime===sweep.closeTime), btcConfirm=btcRows.find(b=>b.closeTime===r.closeTime);
      if(!btcSweep || !btcConfirm) return {...result,status:'WAIT_DATA',reason:'Thiếu nến BTC đồng bộ'};
      return {...result,status:rebound>1.5?'TOO_LATE':'CONFIRMED',pattern:immediate?'IMMEDIATE':'MULTI_BAR',
        confirmationRows:rows.slice(index+1,j+1),
        confirmedAt:r.closeTime,nextCandleAt:r.closeTime+1,price:r.close,reboundPct:rebound,takerBuy:taker,
        barsToConfirm:j-index,relativeStrengthPct:pct(r.close,sweep.close)-pct(btcConfirm.close,btcSweep.close),
        reason:rebound>1.5?'Đã hồi quá 1.5% từ đáy · không đuổi giá':'Nến 1m xanh lấy lại vùng/đỉnh quét và lực mua cải thiện'};
    }
  }
  if(rows.length-1>=index+3) return {...result,confirmationRows:rows.slice(index+1,index+4),status:'EXPIRED',resolvedAt:rows[index+3].closeTime,reason:'Không xác nhận trong 3 nến 1m'};
  return {...result,confirmationRows:rows.slice(index+1,index+4)};
}

// Independent coin context: BTC/ratio/OI are neither prerequisites nor invalidation gates.
export function evaluatePumpWickEpisode(rows,index,liquidation=null) {
  const sweep=rows[index],prior=rows.slice(index-30,index),pump=coinPumpWaveContext(prior);
  if(!sweep||!pump?.pumped)return null;
  const range=sweep.high-sweep.low,drop=(1-sweep.low/sweep.high)*100;
  if(!(range>0)||drop<Math.max(1,3*pump.atrPct)||range<2.5*pump.atr
    ||sweep.low>pump.support*.9985||sweep.quoteVolume<Math.max(2*pump.baseline,1.2*pump.waveVolume))return null;
  const wick=(Math.min(sweep.open,sweep.close)-sweep.low)/range,sweepBuy=buy(sweep);
  const result={version:VERSION,contextMode:'COIN_PUMP',observeOnly:true,side:'LONG',interval:'1m',
    sweepAt:sweep.closeTime,level:pump.support,sweepLow:sweep.low,sweepHigh:sweep.high,sweepBuy,
    wickPct:wick*100,highToLowDropPct:drop,
    pump:{waveGainPct:pump.waveGain,waveVolumeRatio:pump.waveVolume/pump.baseline,
      maGrowthRatio:pump.maLate/pump.maEarly,atrPct:pump.atrPct,greenBars:pump.green,
      elevatedBars:pump.elevated,killVolumeRatio:sweep.quoteVolume/pump.waveVolume},
    liquidation:liquidation?.covered===true?{longUsd:liquidation.longUsd,longCount:liquidation.longCount,sampled:true}:null,
    preSweepRows:prior,sweep,confirmationRows:[],status:'WAIT_CONFIRM',pattern:null};
  for(let j=index;j<=Math.min(index+3,rows.length-1);j++) {
    const r=rows[j],immediate=j===index;
    if(!immediate&&r.low<sweep.low)return {...result,confirmationRows:rows.slice(index+1,j+1),status:'INVALIDATED',resolvedAt:r.closeTime,reason:'Tạo đáy mới trước khi lấy lại hỗ trợ sóng bơm'};
    const taker=buy(r),recovered=r.close>=pump.support;
    // A red flush may still close reclaimed with a large lower wick. Its sell volume is NOT required to be buy-dominant.
    const shape=immediate?wick>=.4&&(r.close-r.low)/range>=.6:
      r.close>r.open&&r.close>rows[j-1].close&&taker!=null&&taker>=.5&&(sweepBuy==null||taker>sweepBuy);
    if(recovered&&shape)return {...result,status:'CONFIRMED',pattern:immediate?'IMMEDIATE':'MULTI_BAR',
      confirmationRows:rows.slice(index+1,j+1),confirmedAt:r.closeTime,nextCandleAt:r.closeTime+1,
      price:r.close,reboundPct:pct(r.close,sweep.low),extensionAboveLevelPct:pct(r.close,pump.support),
      takerBuy:taker,barsToConfirm:j-index,
      reason:immediate?'Coin đang bơm; một nến quét sâu rút râu, đóng lấy lại hỗ trợ (có thể là nến đỏ)':
        'Coin đang bơm; sau cây xả sâu có nến xanh lấy lại hỗ trợ và lực mua cải thiện'};
  }
  if(rows.length-1>=index+3)return {...result,confirmationRows:rows.slice(index+1,index+4),status:'EXPIRED',resolvedAt:rows[index+3].closeTime,reason:'Không lấy lại hỗ trợ trong 3 nến 1m sau cây xả'};
  return {...result,confirmationRows:rows.slice(index+1,index+4)};
}

export function wickPushPayload(e,now=Date.now()) {
  const pump=e.contextMode==='COIN_PUMP';
  return {signalType:pump?COIN_PUMP_WICK_PUSH_TYPE:BTC_WICK_PUSH_TYPE,eventId:e.id,symbol:e.symbol,side:'LONG',interval:'1m',expiresAt:now+120_000,
    title:`↗ ${e.symbol} · ${(pump?COIN_PUMP_WICK_LABELS:BTC_WICK_LABELS)[e.pattern]}`,
    body:pump?`Sóng bơm +${e.pump.waveGainPct.toFixed(2)}% → một nến xả sâu ${e.highToLowDropPct.toFixed(2)}% → đóng hồi ${e.price}, lấy lại ${e.level}. Đáy quét ${e.sweepLow}. Không cần BTC giảm; chỉ cảnh báo, không tự vào lệnh. Hồi từ đáy ${e.reboundPct.toFixed(2)}% không phải điểm entry được khuyến nghị.`:
      `Quét ${e.sweepLow} → xác nhận ${e.price} · lấy lại ${e.level} · BTC 5m ${e.btc.return5m.toFixed(2)}%. Quan sát từ nến kế tiếp; không tự vào lệnh. Hủy nếu mất đáy ${e.sweepLow}.`,
    url:`/local-ai-trend-evaluation?wick=${encodeURIComponent(e.id)}#btc-wick-recovery`};
}

export class BtcWickRecovery {
  constructor({file,getRows=()=>[],getSymbols=()=>[],getLiquidation=()=>null,pushSender=async()=>({sent:0}),discordSender=null,now=()=>Date.now()}={}) {
    Object.assign(this,{file,getRows,getSymbols,getLiquidation,pushSender,discordSender,now});
    this.startedAt=now();this.history=[];this.enabled=true;this.error=null;this.coverage={};this.busy=false;
    this.lastClosed=new Map();
  }
  async init() {
    if(!this.file)return this;
    try {
      const raw=JSON.parse(await readFile(this.file,'utf8'));
      if(![VERSION,BTC_WICK_VERSION].includes(raw.version) || !Array.isArray(raw.history) || typeof raw.enabled!=='boolean') throw new Error('schema');
      this.history=raw.history;this.enabled=raw.enabled;
      // No replay after restart; interrupted sends have an unknown outcome, not a promise to retry.
      for(const e of this.history) {
        if(e.delivery?.status==='POSTING') e.delivery={status:'UNKNOWN_AFTER_RESTART'};
        if(e.discordDelivery?.status==='POSTING') e.discordDelivery={status:'UNKNOWN_AFTER_RESTART'};
        if(e.status==='WAIT_CONFIRM' || e.status==='WAIT_DATA') {e.status='INTERRUPTED';e.reason='Khởi động lại · không phát lại setup cũ';}
      }
    } catch(e) {if(e.code!=='ENOENT') this.error='Lịch sử không hợp lệ/không đọc được; giữ file cũ và dừng gửi push.';}
    return this;
  }
  async save() {
    if(this.error) throw new Error('storage unavailable');
    this.history=this.history.filter(e=>this.now()-e.sweepAt<=14*86400_000).slice(-10_000);
    if(!this.file)return;
    try {
      await mkdir(dirname(this.file),{recursive:true});const tmp=`${this.file}.tmp-${process.pid}`;
      await writeFile(tmp,JSON.stringify({version:VERSION,enabled:this.enabled,history:this.history}));await rename(tmp,this.file);
    }catch{this.error='Không lưu được lịch sử; dừng gửi push.';throw new Error('storage unavailable');}
  }
  async setEnabled(enabled) {
    if(typeof enabled!=='boolean') throw new Error('enabled must be boolean');
    if(this.busy) throw new Error('Đang xử lý, thử lại sau');
    this.busy=true;try{this.enabled=enabled;await this.save();return this.snapshot();}finally{this.busy=false;}
  }
  async scan() {
    if(this.busy || this.error)return;this.busy=true;
    try {
      const now=this.now(),symbols=[...new Set(this.getSymbols())].filter(s=>s!=='BTCUSDT');
      this.coverage={total:symbols.length,ready:0,pumping:0,btcRequired:false,updatedAt:now};
      const updates=[];let dirty=false;
      for(const symbol of symbols) {
        if(symbol==='BTCUSDT' || !/^[\p{L}\p{N}]{1,32}USDT$/u.test(symbol))continue;
        const rows=wickClosedRows(this.getRows(symbol),now);if(rows.length<31)continue;this.coverage.ready++;
        if(coinPumpWaveContext(rows.slice(-31,-1))?.pumped)this.coverage.pumping++;
        if(this.lastClosed.get(symbol)===rows.at(-1).closeTime)continue;
        this.lastClosed.set(symbol,rows.at(-1).closeTime);
        for(const old of this.history.filter(e=>e.version===VERSION&&e.symbol===symbol && e.status==='CONFIRMED' && !e.followUp
          && now-e.confirmedAt<=10*MIN)) {
          const lost=rows.find(r=>r.closeTime>old.confirmedAt && r.low<old.sweepLow);
          if(lost){old.followUp={at:lost.closeTime,reason:'Sau xác nhận đã mất đáy quét · nhịp hồi không còn hợp lệ'};dirty=true;}
        }
        for(let i=Math.max(30,rows.length-4);i<rows.length;i++) {
          const id=`pump-wick:${symbol}:${rows[i].openTime}`,old=this.history.find(e=>e.id===id);
          if(rows[i].closeTime<=this.startedAt || (old && !['WAIT_CONFIRM','WAIT_DATA'].includes(old.status)))continue;
          const liq=old?.liquidation?{...old.liquidation,covered:true}:this.getLiquidation(symbol,rows[i].openTime,rows[i].closeTime);
          const e=evaluatePumpWickEpisode(rows,i,liq);if(!e)continue;
          Object.assign(e,{id,symbol,observedAt:now});
          if(old)Object.assign(old,e);else this.history.push(e);dirty=true;
          if(e.status==='CONFIRMED')updates.push(old??e);
        }
      }
      updates.sort((a,b)=>a.confirmedAt-b.confirmedAt||a.symbol.localeCompare(b.symbol));
      const emitted=new Set();
      for(const e of updates) {
        const confirmation=`${e.symbol}:${e.confirmedAt}`;
        e.delivery={status:emitted.has(confirmation)?'SAME_CONFIRMATION':!this.enabled?'DISABLED':now-e.confirmedAt>75_000?'STALE':'POSTING'};
        e.discordDelivery={status:this.discordSender?e.delivery.status:'NOT_CONFIGURED'};
        emitted.add(confirmation);
      }
      // Persist intent before external I/O. Crash => no blind repeat; unknown outcomes stay explicit.
      if(dirty)await this.save();
      for(const e of updates)await deliverWickChannels(e,{pushSender:this.pushSender,discordSender:this.discordSender,now:this.now,payload:wickPushPayload(e,this.now())});
      if(updates.length)await this.save();
    } catch {if(!this.error)this.error='Lỗi xử lý detector; cần kiểm tra trước khi phát push.';}
    finally{this.busy=false;}
  }
  start() {
    void this.init().then(()=>{void this.scan();this.timer=setInterval(()=>void this.scan(),5_000);this.timer.unref?.();});
  }
  snapshot(eventId=null) {
    const counts={};for(const e of this.history.filter(e=>e.version===VERSION))counts[e.status]=(counts[e.status]??0)+1;
    return copy({version:VERSION,observeOnly:true,enabled:this.enabled,startedAt:this.startedAt,error:this.error,coverage:this.coverage,discordConfigured:typeof this.discordSender==='function',
      history:[...this.history].reverse().slice(0,100),selected:eventId?this.history.find(e=>e.id===eventId)??null:null,
      counts,legacyCount:this.history.filter(e=>e.version!==VERSION).length,closedStats:{closed:0,avgRoe:null},policy:'Sóng bơm của chính coin, không cần BTC giảm · chỉ cảnh báo; số mẫu không phải số lệnh thắng.'});
  }
}
