import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {evaluateRisingVolume} from './risingVolume.js';
import {buildRisingVolumeRatioProof,validRisingVolumeRatioProof,RISING_VOLUME_RATIO_RULE} from './risingVolumeRatioGate.js';
import {RISING_VOLUME_VERSION,RISING_VOLUME_PATTERN_VERSION,classifyRisingVolumePattern,
  risingVolumeKey,risingVolumePatternKey,risingVolumeTradeKey,risingVolumePatternTradeKey} from '../public/rising-volume-model.js';

export const RISING_VOLUME_LEGACY_VERSION='RISING_VOLUME_1M_SUSTAINED_MARKET_3USDT_5X_TP10_SL30_V1_20261008';
export const RISING_VOLUME_BINANCE_VERSION='RISING_VOLUME_1M_SUSTAINED_RATIO_LONG2_SHORT1_5X_TP10_SL30_V2_20261011';
export const RISING_VOLUME_SOURCE='rising-volume-sustained-1m';
export const RISING_VOLUME_STREAM='closed-1m-sustained';
export const RISING_VOLUME_ENTRY_RULE=Object.freeze({longMarginUsdt:2,shortMarginUsdt:1,leverage:5,takeProfitRoePct:10,
  stopLossRoePct:30,maxOpenPositions:50,maxAgeMs:70000,maxPriceDrift:.005});
export const risingVolumeMargin=side=>side==='LONG'?2:side==='SHORT'?1:null;
export const RISING_VOLUME_ROUTES=Object.freeze(['LONG','SHORT'].map(side=>Object.freeze({
  source:RISING_VOLUME_SOURCE,streamId:RISING_VOLUME_STREAM,side,signalLabel:`RISING_VOLUME_1M_SUSTAINED_${side}`})));
const clone=value=>JSON.parse(JSON.stringify(value));
const epoch=value=>typeof value==='number'?value:Date.parse(value??'');
const routeFor=side=>RISING_VOLUME_ROUTES.find(r=>r.side===side)??null;
const routeKey=route=>JSON.stringify([route.source,route.streamId,route.signalLabel,route.side]);
const exactNumber=(a,b)=>typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<1e-9;

export function risingVolumeEntryId(snapshot={}) {
  return `rv:${snapshot.symbol}:${snapshot.interval}:${snapshot.side}:${snapshot.closedAt}`;
}
// Recompute eligibility from the frozen 1m data, not a mutable badge or current
// volume cache. High/low are not part of this detector's price/volume gates.
export function isRisingVolumeEntrySignal(event={}) {
  const s=event.snapshot;
  if(s?.version!==RISING_VOLUME_VERSION||s.observeOnly!==true||s.interval!=='1m'
    ||!routeFor(s.side)||s.volumePatternVersion!==RISING_VOLUME_PATTERN_VERSION
    ||s.volumePatternSource!=='AT_DETECTION'||s.volumePattern!=='SUSTAINED'
    ||event.id!==risingVolumeEntryId(s)||!Array.isArray(s.volume1mChart)||s.volume1mChart.length!==30
    ||classifyRisingVolumePattern(s).volumePattern!=='SUSTAINED')return false;
  const rows=s.volume1mChart.map(r=>({...r,high:Math.max(Number(r.open),Number(r.close)),low:Math.min(Number(r.open),Number(r.close))}));
  const reevaluated=evaluateRisingVolume({symbol:s.symbol,interval:'1m',rows,now:s.observedAt}).signal;
  return !!reevaluated&&reevaluated.side===s.side&&reevaluated.closedAt===s.closedAt
    &&exactNumber(s.price,reevaluated.price);
}
function buildMarketOrder(event={}, {now=Date.now(),enabledAt,startedAt,markPrice,ratioProof}={},legacy=false) {
  if(!isRisingVolumeEntrySignal(event))return null;
  if(!legacy&&!validRisingVolumeRatioProof(event,ratioProof,now))return null;
  const s=event.snapshot,activation=epoch(enabledAt),start=epoch(startedAt),mark=Number(markPrice),rule=RISING_VOLUME_ENTRY_RULE;
  if(![now,activation,start,mark].every(Number.isFinite)||!(activation>0)||!(start>0)||!(mark>0)
    ||s.closedAt<=Math.max(activation,start)||s.closedAt>=s.observedAt||s.observedAt>now
    ||now-s.closedAt>rule.maxAgeMs||Math.abs(mark/s.price-1)>rule.maxPriceDrift)return null;
  const route=routeFor(s.side),direction=s.side==='LONG'?1:-1,tpFraction=.02,slFraction=.06;
  const margin=legacy?3:risingVolumeMargin(s.side),version=legacy?RISING_VOLUME_LEGACY_VERSION:RISING_VOLUME_BINANCE_VERSION;
  return {...route,side:s.side==='LONG'?'BUY':'SELL',signalType:route.signalLabel,signalInterval:'1m',
    signalStageKey:'SUSTAINED_1M',signalCombo:`1m|SUSTAINED|${s.side}`,executionPage:'rising-volume-watch',
    symbol:s.symbol,orderType:'MARKET',marginUsdt:margin,leverage:5,notionalUsdt:margin*5,
    takeProfitRoePct:10,stopLossRoePct:30,maxOpenPositions:50,
    signalEntryPrice:mark,takeProfitPrice:mark*(1+direction*tpFraction),stopLossPrice:mark*(1-direction*slFraction),
    takeProfitDistanceFraction:tpFraction,stopLossDistanceFraction:slFraction,
    protectionOnFill:true,preserveSignalProtection:true,fillAnchorEnabled:true,fillAnchorVersion:version,
    protectionSignalEntryPrice:mark,protectionSignalTakeProfitPrice:mark*(1+direction*tpFraction),
    protectionSignalStopLossPrice:mark*(1-direction*slFraction),allowMinNotionalCeil:false,dryRun:false,
    entryExpiresAt:s.closedAt+rule.maxAgeMs,entryActivationAt:activation,entryRunnerStartedAt:start,
    risingVolumeSignalId:event.id,risingVolumeSnapshot:clone(s),
    ...(!legacy?{risingVolumeRatioProof:clone(ratioProof)}:{}),
    matchedKeys:[risingVolumeKey('1m',s.side),risingVolumePatternKey('SUSTAINED')],
    clientOrderId:`rvs_${createHash('sha256').update(event.id).digest('hex').slice(0,28)}`,
    signalReason:`${version} | ${event.id} | MA5 ${s.maGrowthPct}% | volume ${s.volumeRatio}x | 1m nền ${s.pattern1mElevatedBars}/10 | giá ${s.priceChangePct}%`};
}
export function buildRisingVolumeMarketOrder(event={},options={}) {return buildMarketOrder(event,options);}
function validMarketOrder(p={},markPrice=p.signalEntryPrice,now=Date.now(),legacy=false) {
  const s=p.risingVolumeSnapshot,side=p.side==='BUY'?'LONG':p.side==='SELL'?'SHORT':null,route=routeFor(side);
  const rebuilt=buildMarketOrder({id:p.risingVolumeSignalId,snapshot:s},
    {now,enabledAt:p.entryActivationAt,startedAt:p.entryRunnerStartedAt,markPrice:p.signalEntryPrice,ratioProof:p.risingVolumeRatioProof},legacy);
  if(!route||!rebuilt||p.source!==route.source||p.streamId!==route.streamId||p.signalLabel!==route.signalLabel
    ||p.symbol!==s.symbol||p.signalInterval!=='1m'||p.signalStageKey!=='SUSTAINED_1M'||p.orderType!=='MARKET'
    ||p.fillAnchorVersion!==(legacy?RISING_VOLUME_LEGACY_VERSION:RISING_VOLUME_BINANCE_VERSION)||p.clientOrderId!==rebuilt.clientOrderId
    ||p.dryRun!==false||p.allowMinNotionalCeil!==false||p.protectionOnFill!==true
    ||p.preserveSignalProtection!==true||p.fillAnchorEnabled!==true
    ||!(Number(markPrice)>0)||Math.abs(Number(markPrice)/p.signalEntryPrice-1)>.005
    ||Math.abs(Number(markPrice)/s.price-1)>.005)return false;
  return ['marginUsdt','leverage','notionalUsdt','takeProfitRoePct','stopLossRoePct','maxOpenPositions',
    'takeProfitDistanceFraction','stopLossDistanceFraction','takeProfitPrice','stopLossPrice',
    'protectionSignalEntryPrice','protectionSignalTakeProfitPrice','protectionSignalStopLossPrice','entryExpiresAt']
    .every(key=>exactNumber(p[key],rebuilt[key]));
}
export function validRisingVolumeOrder(p={},markPrice=p.signalEntryPrice,now=Date.now()) {return validMarketOrder(p,markPrice,now);}

// Only actual closed Binance audit records with their original causal snapshot.
// Group multiple fills of the same close and compute net ROE from their margin;
// never count observations, OPEN positions or legacy symbol-only associations.
export function buildRisingVolumeClosedStats(fills={}) {
  const groups=new Map();
  for(const fill of Object.values(fills??{})) {
    const r=fill?.record??fill,s=r?.risingVolumeSnapshot;
    if(r?.signalSource!==RISING_VOLUME_SOURCE||![RISING_VOLUME_BINANCE_VERSION,RISING_VOLUME_LEGACY_VERSION].includes(r.risingVolumeEntryVersion)
      ||r.positionStatus!=='CLOSED'||r.isDca===true||r.netRealizedPnlUsdt==null
      ||!Number.isFinite(Number(r.netRealizedPnlUsdt))||!(Number(r.marginUsdt)>0)
      ||!(epoch(r.closedAt)>=epoch(r.filledAt))||!isRisingVolumeEntrySignal({id:r.risingVolumeSignalId,snapshot:s}))continue;
    if(r.risingVolumeEntryVersion===RISING_VOLUME_BINANCE_VERSION
      &&!validRisingVolumeRatioProof({id:r.risingVolumeSignalId,snapshot:s},r.risingVolumeRatioProof,r.risingVolumeRatioProof?.fetchedAt))continue;
    if(r.risingVolumeEntryVersion===RISING_VOLUME_BINANCE_VERSION&&r.risingVolumeRatioProof.fetchedAt>epoch(r.filledAt))continue;
    const trade={side:r.direction,openedAt:r.filledAt,risingVolumeSnapshot:s};
    const keys=[risingVolumeTradeKey(trade),risingVolumePatternTradeKey(trade)].filter(Boolean);
    for(const key of keys) {
      const groupKey=JSON.stringify([key,r.closeGroupId??r.orderId??r.clientOrderId]);
      if(!r.closeGroupId&&!r.orderId&&!r.clientOrderId)continue;
      const group=groups.get(groupKey)??{key,margin:0,net:0};
      group.margin+=Number(r.marginUsdt);group.net+=Number(r.netRealizedPnlUsdt);groups.set(groupKey,group);
    }
  }
  const byKey={};
  for(const group of groups.values())(byKey[group.key]??=[]).push(group.net/group.margin*100);
  return Object.fromEntries(Object.entries(byKey).map(([key,roes])=>[key,{closedCount:roes.length,
    closedAvgRoe:roes.reduce((a,b)=>a+b,0)/roes.length}]));
}

export class RisingVolumeBinanceRunner {
  constructor({file,controls,getContext,getRatioRows,submit,isProtectionExcluded=()=>false,now=()=>Date.now(),startedAt=now(),storage=null}={}) {
    Object.assign(this,{file,controls,getContext,getRatioRows,submit,isProtectionExcluded,now,startedAt,storage});
    this.state=null;this.queue=Promise.resolve();this.error=null;
  }
  async load() {
    if(this.state)return this.state;
    let raw;
    try{raw=this.storage?await this.storage.load():JSON.parse(await readFile(this.file,'utf8'));}
    catch(e){if(e.code!=='ENOENT')throw e;}
    if(raw&&(raw.version!==RISING_VOLUME_LEGACY_VERSION||!raw.attempts||typeof raw.attempts!=='object'||Array.isArray(raw.attempts)))
      throw Error('Rising volume Binance ledger invalid; retained, execution blocked');
    this.state=raw??{version:RISING_VOLUME_LEGACY_VERSION,initializedAt:this.now(),attempts:{},updatedAt:null};
    return this.state;
  }
  async save() {
    const cutoff=this.now()-14*86400_000;
    this.state.attempts=Object.fromEntries(Object.entries(this.state.attempts).filter(([,a])=>a.at>=cutoff
      ||['CHECKING','SUBMITTING','UNKNOWN','ERROR_OR_UNKNOWN'].includes(a.status)));
    this.state.updatedAt=this.now();const copy=clone(this.state);
    if(this.storage)return this.storage.save(copy);
    await mkdir(dirname(this.file),{recursive:true});const tmp=`${this.file}.tmp-${process.pid}`;
    await writeFile(tmp,JSON.stringify(copy),'utf8');await rename(tmp,this.file);
  }
  managementSnapshot() {
    const controls=this.controls.read();
    return {version:RISING_VOLUME_BINANCE_VERSION,...RISING_VOLUME_ENTRY_RULE,ratioRule:RISING_VOLUME_RATIO_RULE,startedAt:this.startedAt,error:this.error,
      masterEnabled:controls.enabled===true,failClosed:controls.failClosed===true,
      routes:RISING_VOLUME_ROUTES.map(route=>({...route,key:routeKey(route),enabled:controls.routes?.[routeKey(route)]?.enabled===true,
        enabledAt:controls.routes?.[routeKey(route)]?.enabledAt??null,marginUsdt:risingVolumeMargin(route.side)})),
      attempts:Object.values(this.state?.attempts??{}).sort((a,b)=>b.at-a.at).slice(0,100)
        .map(({plan,...attempt})=>attempt)};
  }
  // Protection-only recovery for an exact exchange-verified opening order.
  // Original build time is used: a later fill must not replay MARKET or borrow
  // a new snapshot/plan merely because the symbol matches.
  async protectionPlanFor({symbol,side,orderId,clientOrderId}={}) {
    await this.load();
    const direction=side==='BUY'?'LONG':side==='SELL'?'SHORT':side;
    if(!clientOrderId||!orderId)return null;
    const attempt=Object.values(this.state.attempts).find(a=>a.symbol===symbol&&a.side===direction
      &&a.clientOrderId===String(clientOrderId)&&(!a.orderId||String(a.orderId)===String(orderId))
      &&['SUBMITTING','SUBMITTED','FILLED','NEW','UNKNOWN','ERROR_OR_UNKNOWN'].includes(a.status));
    if(!attempt?.plan||!validMarketOrder(attempt.plan,attempt.plan.signalEntryPrice,attempt.planBuiltAt,
      attempt.plan.fillAnchorVersion===RISING_VOLUME_LEGACY_VERSION))return null;
    return clone(attempt.plan);
  }
  process(event) {const run=this.queue.catch(()=>{}).then(()=>this.processEvent(event));this.queue=run.catch(()=>{});return run;}
  async processEvent(event={}) {
    try{await this.load();}catch(e){this.error=e.message;return {status:'state-error'};}
    if(!isRisingVolumeEntrySignal(event))return {status:'ineligible'};
    const s=event.snapshot,route=routeFor(s.side),key=routeKey(route),controls=this.controls.read(),setting=controls.routes?.[key];
    if(this.state.attempts[event.id])return {status:'deduped'};
    if(!controls.enabled||setting?.enabled!==true)return {status:'off'};
    if(!buildMarketOrder(event,{now:this.now(),enabledAt:setting.enabledAt,startedAt:this.startedAt,markPrice:s.price},true))
      return {status:'pre-enable-or-stale'};
    // Reserve the whole observation BEFORE network IO. Even a blocked, failed or
    // unknown send is never automatically retried later as a stale/chasing entry.
    const attempt={id:event.id,symbol:s.symbol,side:s.side,interval:'1m',at:this.now(),status:'CHECKING',
      snapshotObservedAt:s.observedAt,closedAt:s.closedAt,marginUsdt:risingVolumeMargin(s.side),leverage:5,takeProfitRoePct:10,stopLossRoePct:30};
    this.state.attempts[event.id]=attempt;
    try{await this.save();}catch(e){this.error=e.message;attempt.status='STATE_ERROR';return {status:'state-error'};}
    try {
      let reason=null;
      if(this.isProtectionExcluded(s.symbol))reason='PROTECTION_DISABLED';
      const unresolved=Object.values(this.state.attempts).some(a=>a.id!==event.id&&a.symbol===s.symbol
        &&['CHECKING','SUBMITTING','UNKNOWN','ERROR_OR_UNKNOWN'].includes(a.status));
      if(unresolved)reason='UNRESOLVED_PREVIOUS_ORDER';
      // No account/order IO for a ratio miss. Freeze the actual public response
      // before entry; missing/stale/failed data never grants MARKET permission.
      if(!reason) {
        let rows;
        try{rows=await this.getRatioRows?.(s.symbol);}catch{reason='RATIO_UNAVAILABLE';}
        if(!reason) {
          attempt.risingVolumeRatioProof=buildRisingVolumeRatioProof(event,rows,this.now());
          if(!attempt.risingVolumeRatioProof.pass)reason=attempt.risingVolumeRatioProof.reason;
        }
        await this.save();
      }
      const context=reason?null:await this.getContext(s.symbol);
      if(!reason&&context?.enabled!==true)reason='RUNTIME_OFF';
      if(!reason&&(!Array.isArray(context.positions)||!Array.isArray(context.openOrders)))reason='ACCOUNT_DATA_MISSING';
      if(!reason&&context.positions.some(p=>p.symbol===s.symbol&&Number(p.positionAmt)!==0))reason='EXISTING_POSITION';
      if(!reason&&context.openOrders.some(o=>o.symbol===s.symbol&&![true,'true'].includes(o.reduceOnly)&&![true,'true'].includes(o.closePosition)))reason='EXISTING_ORDER';
      if(!reason&&context.positions.filter(p=>Number(p.positionAmt)!==0).length>=50)reason='MAX_OPEN_POSITIONS';
      const latest=this.controls.read(),current=latest.routes?.[key];
      if(!reason&&(!latest.enabled||current?.enabled!==true||current.enabledAt!==setting.enabledAt))reason='CONTROL_CHANGED';
      if(!reason&&this.isProtectionExcluded(s.symbol))reason='PROTECTION_DISABLED';
      const plan=reason?null:buildRisingVolumeMarketOrder(event,{now:this.now(),enabledAt:current.enabledAt,
        startedAt:this.startedAt,markPrice:context.markPrice,ratioProof:attempt.risingVolumeRatioProof});
      if(!reason&&!plan)reason='PRICE_OR_AGE_BLOCKED';
      if(reason){attempt.status=reason;await this.save();return {status:reason};}
      this.controls.assertEntry(plan);attempt.status='SUBMITTING';attempt.clientOrderId=plan.clientOrderId;
      attempt.plan=clone(plan);attempt.planBuiltAt=this.now();await this.save();
      const result=await this.submit(plan,context);
      attempt.status=String(result?.status??'UNKNOWN').toUpperCase();attempt.orderId=result?.orderResult?.orderId??null;
      attempt.takeProfitPrice=result?.order?.takeProfitPrice??plan.takeProfitPrice;
      attempt.stopLossPrice=result?.order?.stopLossPrice??plan.stopLossPrice;
      await this.save();this.error=null;return {status:attempt.status,orderId:attempt.orderId};
    } catch(e) {
      attempt.status=e.code==='CAUSAL_SIGNAL_RESERVATION'?'SHARED_ENTRY_RESERVED':'ERROR_OR_UNKNOWN';attempt.error=String(e.message??e).slice(0,300);this.error=attempt.status==='SHARED_ENTRY_RESERVED'?null:attempt.error;
      try{await this.save();}catch(saveError){this.error=`${attempt.error}; ledger: ${saveError.message}`;}
      return {status:attempt.status,error:attempt.error};
    }
  }
}
