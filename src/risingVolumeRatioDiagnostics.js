import {evaluateRisingVolumeRatio,RISING_VOLUME_RATIO_VERSION,RISING_VOLUME_RATIO_RULE} from './risingVolumeRatioGate.js';

// Display only: never consumed by the order builder, ledger, audit or whitelist.
export const RISING_VOLUME_RATIO_DIAGNOSTICS_VERSION='RISING_VOLUME_RATIO_EXPLANATION_V2_BINANCE_CHART_20261012';
const STEP=300000;
const symbolOk=s=>/^[\p{L}\p{N}]{1,32}USDT$/u.test(s??'');
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const copy=x=>JSON.parse(JSON.stringify(x));
const unavailable=(reason,extra={})=>({version:RISING_VOLUME_RATIO_DIAGNOSTICS_VERSION,gateVersion:RISING_VOLUME_RATIO_VERSION,
  state:'UNAVAILABLE',pass:null,reason,rule:RISING_VOLUME_RATIO_RULE,rows:[],...extra});

export function explainRisingVolumeRatio(rows,{side,asOf,source='VIEW_ONLY',fetchedAt=null}={}) {
  const curve=Array.isArray(rows)?rows.filter(r=>Number(r?.timestamp)<=asOf)
    .map(r=>({timestamp:Number(r.timestamp),longShortRatio:Number(r.longShortRatio)})):[];
  const result=evaluateRisingVolumeRatio(curve,{side,asOf});
  const meta={side,asOf,source,fetchedAt,gateReason:result.reason};
  if(!['PASS','RATIO_NO_FLAT_THEN_BREAK'].includes(result.reason)) {
    const last=curve.at(-1),validLast=['RATIO_STALE','RATIO_HISTORY_MISSING'].includes(result.reason)&&last?.longShortRatio>0;
    return unavailable(result.reason,{...meta,...(result.reason!=='RATIO_DATA_INVALID'?{rows:curve}:{}),
      ...(validLast?{latestRatio:last.longShortRatio,latestAt:last.timestamp}: {})});
  }
  const latest=curve.at(-1),candidates=[];
  for(let steps=1;steps<=6;steps++) {
    const end=curve.length-1-steps,start=end-6;
    if(start<0)continue;
    const segment=curve.slice(start);
    if(segment.some((r,i)=>i&&r.timestamp-segment[i-1].timestamp!==STEP))continue;
    const base=curve.slice(start,end+1),values=base.map(r=>r.longShortRatio),center=median(values);
    const low=Math.min(...values),high=Math.max(...values),widthPct=(high-low)/center*100;
    const changePct=(latest.longShortRatio/center-1)*100;
    const flat=widthPct<=5+1e-9,shift=side==='LONG'?changePct<=-10+1e-9:changePct>=10-1e-9;
    const outside=side==='LONG'?latest.longShortRatio<low:latest.longShortRatio>high;
    candidates.push({baselineStartAt:base[0].timestamp,baselineEndAt:base.at(-1).timestamp,baselineMedian:center,
      baselineLow:low,baselineHigh:high,widthPct,changePct,transitionMinutes:steps*5,flat,shift,outside});
  }
  if(!candidates.length)return unavailable('RATIO_WINDOW_GAP',{...meta,rows:curve});
  // PASS uses the exact runtime-selected window. FAIL shows a flat window with
  // the closest directional shift, or the tightest available non-flat window.
  // This reference window explains a miss; it does not redefine the gate.
  const flats=candidates.filter(c=>c.flat);
  const chosen=result.pass?candidates.find(c=>c.baselineEndAt===result.baselineEndAt)
    :(flats.length?flats.sort((a,b)=>side==='LONG'?a.changePct-b.changePct:b.changePct-a.changePct)
      :candidates.sort((a,b)=>a.widthPct-b.widthPct))[0];
  const reason=result.pass?'PASS':!flats.length?'RATIO_NOT_FLAT'
    :(side==='LONG'?chosen.changePct>0:chosen.changePct<0)?'RATIO_WRONG_DIRECTION'
      :!chosen.shift?'RATIO_SHIFT_TOO_SMALL':'RATIO_NOT_OUTSIDE_BASE';
  return {version:RISING_VOLUME_RATIO_DIAGNOSTICS_VERSION,gateVersion:RISING_VOLUME_RATIO_VERSION,rule:RISING_VOLUME_RATIO_RULE,
    ...meta,state:result.pass?'PASS':'FAIL',pass:result.pass,reason,latestAt:latest.timestamp,latestRatio:latest.longShortRatio,
    longAccountPct:latest.longShortRatio/(1+latest.longShortRatio)*100,shortAccountPct:100/(1+latest.longShortRatio),
    ...chosen,rows:curve};
}

function savedProofFor(row,attempt,now) {
  const p=attempt?.risingVolumeRatioProof;
  if(!p) {
    if(attempt?.id===row.id&&attempt.symbol===row.symbol&&attempt.side===row.side&&attempt.status==='RATIO_UNAVAILABLE')
      return unavailable('RATIO_UNAVAILABLE',{source:'ATTEMPT_NO_RATIO',side:row.side,asOf:attempt.closedAt});
    return null;
  }
  const invalid=()=>unavailable('RATIO_PROOF_INVALID',{source:'AT_ENTRY',side:row.side,asOf:attempt.closedAt});
  if(attempt.id!==row.id||p.signalId!==row.id||p.symbol!==row.symbol||p.side!==row.side
    ||p.version!==RISING_VOLUME_RATIO_VERSION||p.source!=='AT_ENTRY'||p.period!=='5m'||p.asOf!==attempt.closedAt
    ||!Number.isFinite(attempt.snapshotObservedAt)||!Number.isFinite(attempt.closedAt)
    ||!Number.isFinite(p.fetchedAt)||p.fetchedAt>now||p.fetchedAt<attempt.snapshotObservedAt
    ||!Array.isArray(p.rows)||p.rows.length>20||p.rows.some(r=>Number(r.timestamp)>p.asOf))return invalid();
  const rebuilt=evaluateRisingVolumeRatio(p.rows,{side:p.side,asOf:p.asOf});
  if(!Object.entries(rebuilt).every(([k,v])=>p[k]===v))return invalid();
  return explainRisingVolumeRatio(p.rows,{side:p.side,asOf:p.asOf,source:'AT_ENTRY',fetchedAt:p.fetchedAt});
}

export class RisingVolumeRatioDiagnostics {
  constructor({getRows,now=()=>Date.now(),ttlMs=30000,maxConcurrent=2,maxReads=4,windowMs=10000,maxCache=256}={}) {
    Object.assign(this,{getRows,now,ttlMs,maxConcurrent,maxReads,windowMs,maxCache});
    this.cache=new Map();this.active=0;this.reads=0;this.windowAt=now();
  }
  warm(symbol) {
    if(!symbolOk(symbol))return;
    const at=this.now(),prior=this.cache.get(symbol);
    if(prior?.pending||prior?.expiresAt>at)return;
    if(at-this.windowAt>=this.windowMs){this.windowAt=at;this.reads=0;}
    if(this.active>=this.maxConcurrent||this.reads>=this.maxReads)return;
    while(this.cache.size>=this.maxCache&&!this.cache.has(symbol)){
      const key=[...this.cache].find(([,v])=>!v.pending)?.[0];if(!key)return;this.cache.delete(key);
    }
    const entry={...prior,pending:true};this.cache.set(symbol,entry);this.active++;this.reads++;
    // A GET page must not wait on the public rate gate, or touch signed account IO.
    void Promise.resolve().then(()=>this.getRows(symbol)).then(rows=>{
      entry.rows=Array.isArray(rows)?copy(rows).slice(-20):[];entry.fetchedAt=this.now();entry.error=null;
    }).catch(()=>{entry.rows=[];entry.fetchedAt=this.now();entry.error='RATIO_UNAVAILABLE';})
      .finally(()=>{entry.pending=false;entry.expiresAt=this.now()+this.ttlMs;this.active--;});
  }
  project(snapshot,{attempts=[],view='live'}={}) {
    const now=this.now(),byId=new Map(attempts.map(a=>[a.id,a]));
    const originals=new Map((snapshot.rows??[]).map(r=>[r.id,r]));
    if(snapshot.detail)originals.set(snapshot.detail.id,snapshot.detail);
    // History rows are immutable observations. Missing entry-time ratio is not
    // backfilled from today's response, even for an otherwise identical coin.
    if(view!=='history')[...originals.values()]
      .filter(row=>row!==snapshot.detail&&!savedProofFor(row,byId.get(row.id),now))
      .sort((a,b)=>(this.cache.get(a.symbol)?.fetchedAt??-1)-(this.cache.get(b.symbol)?.fetchedAt??-1))
      .forEach(row=>this.warm(row.symbol));
    const decorate=(row,isHistory=false)=>{
      if(!row)return null;
      const attempt=byId.get(row.id),saved=savedProofFor(row,attempt,now);
      const entryScope=row.interval==='1m'&&row.volumePattern==='SUSTAINED';
      let diagnostic=saved;
      if(!diagnostic) {
        if(isHistory||view==='history')diagnostic=unavailable('RATIO_NOT_SAVED',{source:'HISTORY_MISSING',asOf:row.closedAt,side:row.side});
        else {
          const cache=this.cache.get(row.symbol);
          diagnostic=cache?.error?unavailable(cache.error,{source:'VIEW_ONLY',fetchedAt:cache.fetchedAt})
            :cache?.rows?explainRisingVolumeRatio(cache.rows,{side:row.side,asOf:row.closedAt,source:'VIEW_ONLY',fetchedAt:cache.fetchedAt})
              :unavailable('RATIO_PENDING',{source:'VIEW_ONLY',asOf:row.closedAt,side:row.side});
          if(cache?.expiresAt<=now)diagnostic={...diagnostic,state:'UNAVAILABLE',pass:null,reason:'RATIO_CACHE_EXPIRED'};
          diagnostic.pending=cache?.pending===true;
        }
      }
      return {...row,ratioDiagnostics:{...diagnostic,entryScope,attemptStatus:attempt?.status??null,
        signalId:row.id,symbol:row.symbol,displayClosedAt:row.closedAt}};
    };
    return {...snapshot,ratioDiagnosticsVersion:RISING_VOLUME_RATIO_DIAGNOSTICS_VERSION,
      rows:(snapshot.rows??[]).map(r=>decorate(r)),detail:decorate(snapshot.detail,true)};
  }
}
