import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {wickClosedRows} from './btcWickRecovery.js';
import {coinPumpWaveContext} from './coinPumpWaveContext.js';
import {COIN_PUMP_FLUSH_VERSION as VERSION,COIN_PUMP_FLUSH_DELIVERY_VERSION,COIN_PUMP_FLUSH_PUSH_TYPE,COIN_PUMP_FLUSH_LABELS} from '../public/coin-pump-long-flush-model.js';
const pct=(a,b)=>(a/b-1)*100;
const clone=x=>JSON.parse(JSON.stringify(x));

// The pump is measured strictly BEFORE the dump candle, never using its volume to manufacture a rising wave.
export function evaluateCoinPumpLongFlush({symbol,rows=[],now=Date.now(),liquidation=null}={}) {
  const closed=wickClosedRows(rows,now),result=(status,extra={})=>({status,...extra});
  if(!/^[\p{L}\p{N}]{1,32}USDT$/u.test(symbol??''))return result('INVALID_SYMBOL');
  if(closed.length<31)return result('WAIT_DATA');
  const prior=closed.slice(-31,-1),kill=closed.at(-1),context=coinPumpWaveContext(prior);
  if(!context)return result('NO_BASELINE');
  const {baseline,waveVolume,atr,atrPct,waveGain,maEarly,maLate,support}=context;
  if(!context.pumped)return result('NO_PUMP',{closedAt:kill.closeTime});
  const range=kill.high-kill.low;
  const drop=(1-kill.low/kill.high)*100,bodyDrop=-pct(kill.close,kill.open);
  const sell=kill.quoteVolume>0?1-kill.takerBuyQuoteVolume/kill.quoteVolume:null;
  const closePosition=range>0?(kill.close-kill.low)/range:null;
  const lowerWick=range>0?(Math.min(kill.open,kill.close)-kill.low)/range:0;
  const common=drop>=Math.max(1,3*atrPct) && range>=2.5*atr && kill.low<=support*.9985
    && kill.quoteVolume>=Math.max(baseline*2,waveVolume*1.2) && sell!=null && sell>=.6;
  const pattern=common && kill.close<kill.open && bodyDrop>=.75 && kill.close<support && closePosition<=.35?'DUMP_CLOSE'
    :common && lowerWick>=.4 && kill.close>=support?'FLUSH_RECLAIM':null;
  if(!pattern)return result('PUMP_ONLY',{closedAt:kill.closeTime});
  const signal={version:VERSION,observeOnly:true,status:'CONFIRMED',symbol,interval:'1m',pattern,
    confirmedAt:kill.closeTime,observedAt:now,price:kill.close,support,high:kill.high,low:kill.low,
    waveGainPct:waveGain,waveVolumeRatio:waveVolume/baseline,maGrowthRatio:maLate/maEarly,
    killVolumeRatio:kill.quoteVolume/waveVolume,baselineKillVolumeRatio:kill.quoteVolume/baseline,
    highToLowDropPct:drop,bodyDropPct:bodyDrop,takerSellPct:sell*100,atrPct,closePosition,lowerWickPct:lowerWick*100,
    preKillRows:prior,kill,
    // Optional sampled evidence, never a fabricated total or a trading gate.
    liquidation:liquidation?.covered===true?{sampled:true,longUsd:liquidation.longUsd,longCount:liquidation.longCount}:null,
    reason:pattern==='DUMP_CLOSE'?'Sóng bơm + volume tăng trước đó; một nến xả phá hỗ trợ, đóng gần đáy':
      'Sóng bơm + volume tăng trước đó; một nến quét sâu nhưng đóng lấy lại hỗ trợ · chưa xác nhận đảo chiều giảm'};
  return result('SIGNAL',{signal});
}

export function coinPumpFlushPushPayload(e,now=Date.now()) {
  const evidence=e.liquidation?.longCount>0?` · Binance quan sát thanh lý LONG ${e.liquidation.longUsd.toFixed(0)} USDT (mẫu)`
    :' · nghi vấn quét LONG từ giá/volume, chưa có bằng chứng thanh lý đầy đủ';
  return {signalType:COIN_PUMP_FLUSH_PUSH_TYPE,eventId:e.id,symbol:e.symbol,interval:'1m',expiresAt:now+120_000,
    title:`⚠ ${e.symbol} · ${COIN_PUMP_FLUSH_LABELS[e.pattern]}`,
    body:`Sóng +${e.waveGainPct.toFixed(2)}% → xả cao/đáy ${e.highToLowDropPct.toFixed(2)}% · volume ${e.killVolumeRatio.toFixed(2)}× sóng · bán ${e.takerSellPct.toFixed(0)}%. Hỗ trợ ${e.support}, đáy ${e.low}, đóng ${e.price}${evidence}. Chỉ cảnh báo; không tự đóng lệnh/vào SHORT.`,
    url:`/local-ai-trend-evaluation?flush=${encodeURIComponent(e.id)}#coin-pump-long-flush`};
}

export class CoinPumpLongFlushMonitor {
  constructor({file,getRows=()=>[],getSymbols=()=>[],getLiquidation=()=>null,isRecoveryHandled=()=>false,pushSender=async()=>({sent:0}),now=()=>Date.now()}={}) {
    Object.assign(this,{file,getRows,getSymbols,getLiquidation,isRecoveryHandled,pushSender,now});
    this.startedAt=now();this.enabled=true;this.history=[];this.error=null;this.busy=false;this.lastClosed=new Map();this.coverage={};
  }
  async init() {
    if(!this.file)return this;
    try {
      const raw=JSON.parse(await readFile(this.file,'utf8'));
      if(raw.version!==VERSION || !Array.isArray(raw.history) || typeof raw.enabled!=='boolean')throw new Error('schema');
      this.history=raw.history;this.enabled=raw.enabled;
      for(const e of this.history)if(e.delivery?.status==='POSTING')e.delivery={status:'UNKNOWN_AFTER_RESTART'};
    }catch(e){if(e.code!=='ENOENT')this.error='Không đọc được lịch sử hợp lệ · giữ file cũ và dừng push.';}
    return this;
  }
  async save() {
    if(this.error)throw new Error('storage unavailable');
    this.history=this.history.filter(e=>this.now()-e.confirmedAt<=14*86400_000).slice(-5000);
    if(!this.file)return;
    try{await mkdir(dirname(this.file),{recursive:true});const tmp=`${this.file}.tmp-${process.pid}`;
      await writeFile(tmp,JSON.stringify({version:VERSION,enabled:this.enabled,history:this.history}));await rename(tmp,this.file);
    }catch{this.error='Không lưu được lịch sử · dừng push.';throw new Error('storage unavailable');}
  }
  async setEnabled(enabled) {
    if(typeof enabled!=='boolean' || this.busy)throw new Error('invalid or busy');this.busy=true;
    try{this.enabled=enabled;await this.save();return this.snapshot();}finally{this.busy=false;}
  }
  async scan() {
    if(this.busy || this.error)return;this.busy=true;
    try {
      const now=this.now(),symbols=[...new Set(this.getSymbols())];
      this.coverage={total:symbols.length,ready:0,pumping:0,updatedAt:now};const updates=[];
      for(const symbol of symbols) {
        const rows=wickClosedRows(this.getRows(symbol),now);if(rows.length<31)continue;this.coverage.ready++;
        const kill=rows.at(-1),evaluation=evaluateCoinPumpLongFlush({symbol,rows,now});
        if(['SIGNAL','PUMP_ONLY'].includes(evaluation.status))this.coverage.pumping++;
        if(this.lastClosed.get(symbol)===kill.closeTime)continue;this.lastClosed.set(symbol,kill.closeTime);
        const id=`pump-long-flush:${symbol}:${kill.openTime}`;
        if(kill.closeTime<=this.startedAt || evaluation.status!=='SIGNAL' || this.history.some(e=>e.id===id))continue;
        const sampled=this.getLiquidation(symbol,kill.openTime,kill.closeTime);
        const e={...evaluation.signal,id,liquidation:sampled?.covered===true?{sampled:true,longUsd:sampled.longUsd,longCount:sampled.longCount}:null};
        e.delivery={status:!this.enabled?'DISABLED':now-e.confirmedAt>75_000?'STALE':
          e.pattern==='FLUSH_RECLAIM'&&this.isRecoveryHandled(symbol,kill.closeTime)?'RECOVERY_CHANNEL':'POSTING'};
        this.history.push(e);updates.push(e);
      }
      if(updates.length)await this.save(); // Durable dedupe/intent BEFORE external sends.
      for(const e of updates.filter(e=>e.delivery.status==='POSTING')) {
        if(this.now()-e.confirmedAt>75_000){e.delivery={status:'STALE'};continue;}
        try{const d=await this.pushSender(coinPumpFlushPushPayload(e,this.now()));
          e.delivery={...d,status:d.skipped==='QUIET_HOURS'?'QUIET_HOURS':d.sent>0?(d.failed>0?'PARTIAL':'SENT'):d.error||d.attempted>0?'FAILED':'NO_SUBSCRIBERS'};
        }catch{e.delivery={status:'FAILED'};}
      }
      if(updates.length)await this.save();
    }catch{if(!this.error)this.error='Detector lỗi · dừng push để kiểm tra.';}
    finally{this.busy=false;}
  }
  start(){void this.init().then(()=>{void this.scan();this.timer=setInterval(()=>void this.scan(),5000);this.timer.unref?.();});}
  snapshot(id=null){return clone({version:VERSION,deliveryVersion:COIN_PUMP_FLUSH_DELIVERY_VERSION,observeOnly:true,enabled:this.enabled,startedAt:this.startedAt,error:this.error,coverage:this.coverage,
    history:[...this.history].reverse().slice(0,100),selected:id?this.history.find(e=>e.id===id)??null:null,
    counts:Object.fromEntries(Object.keys(COIN_PUMP_FLUSH_LABELS).map(p=>[p,this.history.filter(e=>e.pattern===p).length])),
    closedStats:{closed:0,avgRoe:null}});}
}
