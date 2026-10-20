import {dirname} from 'node:path';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {RISING_VOLUME_VERSION,RISING_VOLUME_FRAMES,RISING_VOLUME_RULE,risingVolumeKey,
  RISING_VOLUME_PATTERN_VERSION,RISING_VOLUME_PATTERN_RULE,RISING_VOLUME_PATTERNS,risingVolumePatternKey,classifyRisingVolumePattern,risingVolumePatternProjection} from '../public/rising-volume-model.js';
export {RISING_VOLUME_VERSION,RISING_VOLUME_FRAMES,RISING_VOLUME_RULE,RISING_VOLUME_PATTERN_VERSION,RISING_VOLUME_PATTERNS};
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
const number=v=>v==null||v===''?NaN:Number(v);
const symbolOf=v=>String(v??'').trim().toUpperCase();
const validSymbol=s=>/^[\p{L}\p{N}]{1,32}USDT$/u.test(s);

export function evaluateRisingVolume({symbol,interval,rows=[],rows1m=[],now=Date.now()}={}) {
  const duration=RISING_VOLUME_FRAMES[interval];
  const result=(status,extra={})=>({status,signal:null,...extra});
  if (!duration || !validSymbol(symbolOf(symbol)) || !Number.isFinite(now)) return result('INVALID');
  // Open/future candles cannot confirm the pattern. REST rows have no isClosed.
  const closed=(Array.isArray(rows)?rows:[]).filter(r=>number(r?.closeTime)<now && r?.isClosed!==false)
    .slice(-RISING_VOLUME_RULE.requiredBars);
  const closedAt=number(closed.at(-1)?.closeTime);
  if (closed.length<RISING_VOLUME_RULE.requiredBars) return result('INSUFFICIENT',{bars:closed.length,closedAt:closedAt||null});
  if (now-closedAt>duration+10_000) return result('STALE',{closedAt});
  for(let i=0;i<closed.length;i++) {
    const r=closed[i];
    if (![r.openTime,r.closeTime,r.open,r.high,r.low,r.close,r.volume,r.quoteVolume].every(v=>Number.isFinite(number(v)))
      || !(number(r.open)>0) || !(number(r.low)>0) || !(number(r.close)>0)
      || number(r.high)<Math.max(number(r.open),number(r.close))
      || number(r.low)>Math.min(number(r.open),number(r.close))
      || number(r.volume)<0 || number(r.quoteVolume)<0
      || number(r.openTime)%duration!==0 || number(r.closeTime)!==number(r.openTime)+duration-1) return result('INVALID',{closedAt});
    if (i && number(r.openTime)-number(closed[i-1].openTime)!==duration) return result('GAP',{closedAt});
  }
  const volumes=closed.map(r=>number(r.volume));
  const recent=closed.slice(-5),baseline=closed.slice(-25,-5);
  const baselineMean=mean(baseline.map(r=>number(r.volume)));
  if (!(baselineMean>0)) return result('NO_BASELINE',{closedAt});
  const recentMean=mean(recent.map(r=>number(r.volume)));
  const volumeRatio=recentMean/baselineMean;
  const ma5=[3,2,1,0].map(offset=>mean(volumes.slice(volumes.length-5-offset,volumes.length-offset)));
  const risingSteps=ma5.slice(1).filter((value,i)=>value>ma5[i]).length;
  const aboveBaseline=recent.filter(r=>number(r.volume)>baselineMean).length;
  const last=recent.at(-1),previous=recent.at(-2);
  const priceChangePct=(number(last.close)/number(closed.at(-6).close)-1)*100;
  const upBars=recent.filter(r=>number(r.close)>number(r.open)).length;
  const downBars=recent.filter(r=>number(r.close)<number(r.open)).length;
  const side=priceChangePct>=RISING_VOLUME_RULE.minPriceChangePct
    && upBars>=RISING_VOLUME_RULE.minDirectionalBars && number(last.close)>number(previous.close)?'LONG'
    :priceChangePct<=-RISING_VOLUME_RULE.minPriceChangePct
      && downBars>=RISING_VOLUME_RULE.minDirectionalBars && number(last.close)<number(previous.close)?'SHORT':null;
  if (risingSteps<3 || volumeRatio<RISING_VOLUME_RULE.minVolumeRatio || aboveBaseline<3 || !side)
    return result('NO_SIGNAL',{closedAt});
  const buyQuote=recent.map(r=>number(r.takerBuyQuoteVolume));
  const recentQuote=recent.reduce((sum,r)=>sum+number(r.quoteVolume),0);
  const takerBuyPct=recentQuote>0 && buyQuote.every((v,i)=>v>=0&&v<=number(recent[i].quoteVolume))
    ?buyQuote.reduce((a,b)=>a+b,0)/recentQuote*100:null;
  const chart=closed.map(r=>({openTime:number(r.openTime),closeTime:number(r.closeTime),
    open:number(r.open),close:number(r.close),volume:number(r.volume),quoteVolume:number(r.quoteVolume)}));
  const minuteRows=interval==='1m'?rows:rows1m;
  const volume1mChart=(Array.isArray(minuteRows)?minuteRows:[]).filter(r=>number(r?.closeTime)<now&&r?.isClosed!==false)
    .slice(-RISING_VOLUME_PATTERN_RULE.requiredBars).map(r=>({openTime:number(r.openTime),closeTime:number(r.closeTime),
      open:number(r.open),close:number(r.close),volume:number(r.volume),quoteVolume:number(r.quoteVolume)}));
  const volumePattern=classifyRisingVolumePattern({interval,closedAt,observedAt:now,chart,volume1mChart});
  return result('SIGNAL',{closedAt,signal:{version:RISING_VOLUME_VERSION,observeOnly:true,
    symbol:symbolOf(symbol),interval,side,key:risingVolumeKey(interval,side),closedAt,observedAt:now,
    price:number(last.close),priceChangePct,volumeRatio,baselineMean,ma5:ma5.at(-1),ma5Previous:ma5[0],
    maGrowthPct:(ma5.at(-1)/ma5[0]-1)*100,risingSteps,aboveBaseline,upBars,downBars,
    lastBaseVolume:number(last.volume),lastQuoteVolume:number(last.quoteVolume),recentQuoteVolume:recentQuote,
    takerBuyPct,chart,volume1mChart,...volumePattern,volumePatternSource:'AT_DETECTION'}});
}

const clone=value=>JSON.parse(JSON.stringify(value));
const emptyState=now=>({version:RISING_VOLUME_VERSION,startedAt:now,updatedAt:now,history:[],episodes:{}});

export class RisingVolumeMonitor {
  constructor({stateFile,getRows=()=>[],now=()=>Date.now(),storage=null,maxHistory=3000,retentionMs=14*86400_000}={}) {
    this.stateFile=stateFile;this.getRows=getRows;this.now=now;this.storage=storage;
    this.maxHistory=maxHistory;this.retentionMs=retentionMs;this.state=emptyState(this.now());
    this.live=[];this.coverage={};this.lastScanAt=null;this.error=null;this.running=null;this.dirty=false;
  }
  init() {
    if(this.initPromise)return this.initPromise;
    this.initPromise=(async()=>{
      let raw;
      try{raw=this.storage?await this.storage.load():this.stateFile?JSON.parse(await readFile(this.stateFile,'utf8')):null;}
      catch(e){if(e.code!=='ENOENT')throw e;}
      if(raw){
        if(raw.version!==RISING_VOLUME_VERSION || !Array.isArray(raw.history) || typeof raw.episodes!=='object' || !raw.episodes)
          throw new Error('Rising volume history schema is invalid; existing file retained');
        this.state={...emptyState(this.now()),...raw,
          history:raw.history.filter(r=>r?.snapshot?.version===RISING_VOLUME_VERSION && validSymbol(symbolOf(r.snapshot.symbol))
            && risingVolumeKey(r.snapshot.interval,r.snapshot.side) && r.id
            && Number(r.snapshot.observedAt)>=Number(r.snapshot.closedAt))};
      }
      this.prune(this.now());return this;
    })().catch(e=>{this.error=e.message;throw e;});
    return this.initPromise;
  }
  prune(now) {
    this.state.history=this.state.history.filter(r=>Number(r.snapshot?.observedAt)>=now-this.retentionMs).slice(-this.maxHistory);
    const ids=new Set(this.state.history.map(r=>r.id));
    for(const[key,e]of Object.entries(this.state.episodes))if(!ids.has(e?.id))delete this.state.episodes[key];
  }
  async save() {
    const snapshot=clone(this.state);
    if(this.storage)return this.storage.save(snapshot);
    if(!this.stateFile)return;
    await mkdir(dirname(this.stateFile),{recursive:true});
    const tmp=`${this.stateFile}.tmp-${process.pid}`;
    await writeFile(tmp,JSON.stringify(snapshot),'utf8');await rename(tmp,this.stateFile);
  }
  scan({symbols=[],now=this.now()}={}) {
    if(this.running)return this.running;
    this.running=this.runScan({symbols,now}).finally(()=>{this.running=null;});
    return this.running;
  }
  async runScan({symbols,now}) {
    await this.init();
    const universe=[...new Set(symbols.map(symbolOf).filter(validSymbol))];
    const oneMinuteRows=new Map(universe.map(symbol=>[symbol,this.getRows(symbol,'1m')??[]]));
    const live=[],coverage={};let changed=false;
    for(const interval of Object.keys(RISING_VOLUME_FRAMES)) {
      const counts={requested:universe.length,ready:0,signals:0,INSUFFICIENT:0,STALE:0,GAP:0,INVALID:0};
      for(const symbol of universe) {
        const evaluation=evaluateRisingVolume({symbol,interval,rows:interval==='1m'?oneMinuteRows.get(symbol):this.getRows(symbol,interval)??[],
          rows1m:oneMinuteRows.get(symbol),now});
        const slot=`${symbol}|${interval}`;
        if(['SIGNAL','NO_SIGNAL','NO_BASELINE'].includes(evaluation.status))counts.ready++;
        else{counts[evaluation.status]=(counts[evaluation.status]??0)+1;continue;}
        if(!evaluation.signal){if(this.state.episodes[slot]){delete this.state.episodes[slot];changed=true;}continue;}
        counts.signals++;const signal=evaluation.signal;let episode=this.state.episodes[slot];
        if(!episode || episode.side!==signal.side || signal.closedAt-episode.lastClosedAt>RISING_VOLUME_FRAMES[interval]*2) {
          const id=`rv:${symbol}:${interval}:${signal.side}:${signal.closedAt}`;
          const existing=this.state.history.find(r=>r.id===id);
          if(!existing){this.state.history.push({id,snapshot:clone(signal)});changed=true;}
          episode={id,side:signal.side,lastClosedAt:signal.closedAt};this.state.episodes[slot]=episode;changed=true;
        }
        if(episode.lastClosedAt!==signal.closedAt){episode.lastClosedAt=signal.closedAt;changed=true;}
        const first=this.state.history.find(r=>r.id===episode.id);
        live.push({id:episode.id,...signal,firstObservedAt:first?.snapshot.observedAt??now});
      }
      coverage[interval]=counts;
    }
    this.live=live.sort((a,b)=>b.volumeRatio-a.volumeRatio||b.closedAt-a.closedAt);
    this.coverage=coverage;this.lastScanAt=now;
    const priorCount=this.state.history.length;this.prune(now);if(priorCount!==this.state.history.length)changed=true;
    if(changed){this.state.updatedAt=now;this.dirty=true;}
    if(this.dirty){await this.save();this.dirty=false;}
    this.error=null;return {live:live.length,history:this.state.history.length,coverage};
  }
  snapshot({view='live',search='',side='ALL',interval='ALL',pattern='ALL',offset=0,limit=50,id=null,closedStats={}}={}) {
    const query=String(search).trim().toUpperCase().slice(0,40);
    const activeIds=new Set(this.live.map(r=>r.id));
    const history=this.state.history.map(r=>({id:r.id,...r.snapshot,...risingVolumePatternProjection(r.snapshot),
      firstObservedAt:r.snapshot.observedAt,active:activeIds.has(r.id)})).reverse();
    const source=view==='history'?history:this.live;
    const filtered=source.filter(r=>(!query||r.symbol.includes(query))&&(side==='ALL'||r.side===side)
      &&(interval==='ALL'||r.interval===interval)&&(pattern==='ALL'||r.volumePattern===pattern));
    const start=Number.isFinite(Number(offset))?Math.max(0,Math.floor(Number(offset)||0)):0;
    const size=Number.isFinite(Number(limit))?Math.max(1,Math.min(100,Math.floor(Number(limit)||50))):50;
    const cohorts=Object.keys(RISING_VOLUME_FRAMES).flatMap(frame=>['LONG','SHORT'].map(direction=>({
      key:risingVolumeKey(frame,direction),interval:frame,side:direction,
      active:this.live.filter(r=>r.interval===frame&&r.side===direction).length,
      observations:history.filter(r=>r.interval===frame&&r.side===direction).length,
      closedCount:closedStats[risingVolumeKey(frame,direction)]?.closedCount??0,
      closedAvgRoe:closedStats[risingVolumeKey(frame,direction)]?.closedAvgRoe??null,observeOnly:true,whitelistDefault:false,
    })));
    const patterns=RISING_VOLUME_PATTERNS.map(value=>({key:risingVolumePatternKey(value),pattern:value,
      active:this.live.filter(r=>r.volumePattern===value).length,
      activeLong:this.live.filter(r=>r.volumePattern===value&&r.side==='LONG').length,
      activeShort:this.live.filter(r=>r.volumePattern===value&&r.side==='SHORT').length,
      observations:history.filter(r=>r.volumePattern===value).length,
      closedCount:closedStats[risingVolumePatternKey(value)]?.closedCount??0,
      closedAvgRoe:closedStats[risingVolumePatternKey(value)]?.closedAvgRoe??null,observeOnly:true,whitelistDefault:false}));
    return clone({version:RISING_VOLUME_VERSION,patternVersion:RISING_VOLUME_PATTERN_VERSION,patterns,
      observeOnly:true,rules:RISING_VOLUME_RULE,patternRules:RISING_VOLUME_PATTERN_RULE,startedAt:this.state.startedAt,
      lastScanAt:this.lastScanAt,error:this.error,coverage:this.coverage,total:filtered.length,offset:start,limit:size,
      rows:filtered.slice(start,start+size),cohorts,
      detail:id?(history.find(r=>r.id===id)??null):null});
  }
}
