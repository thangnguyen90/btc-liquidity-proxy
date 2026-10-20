import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {evaluateCoinPumpWickEarly} from './coinPumpWickEarly.js';
import {wickClosedRows} from './btcWickRecovery.js';
import {buildRisingVolumeRatioProof,validRisingVolumeRatioProof,RISING_VOLUME_RATIO_RULE} from './risingVolumeRatioGate.js';
import {COIN_PUMP_WICK_EARLY_VERSION,COIN_PUMP_WICK_EARLY_PUSH_TYPE,coinPumpWickEarlyKey} from '../public/coin-pump-wick-early-model.js';
export const EARLY_WICK_ENTRY_VERSION='COIN_PUMP_WICK_EARLY_RATIO_LONG_3USDT_5X_TP10_SL30_V1_20261011';
export const EARLY_WICK_SOURCE='coin-pump-wick-early-ratio';
export const EARLY_WICK_ROUTE=Object.freeze({source:EARLY_WICK_SOURCE,streamId:'closed-1m-early-wick',side:'LONG',signalLabel:COIN_PUMP_WICK_EARLY_PUSH_TYPE});
export const EARLY_WICK_RULE=Object.freeze({marginUsdt:3,leverage:5,takeProfitRoePct:10,stopLossRoePct:30,maxOpenPositions:50,maxAgeMs:70000,maxPriceDrift:.005});
const key=JSON.stringify([EARLY_WICK_ROUTE.source,EARLY_WICK_ROUTE.streamId,EARLY_WICK_ROUTE.signalLabel,'LONG']);
const clone=x=>JSON.parse(JSON.stringify(x)),epoch=x=>typeof x==='number'?x:Date.parse(x??'');
const same=(a,b)=>typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<1e-9;
const unresolved=a=>['CHECKING','SUBMITTING','UNKNOWN','ERROR_OR_UNKNOWN'].includes(a.status);
export function isEarlyWickEntrySignal(e={}) {
  if(!e||typeof e!=='object')return false;
  if(e.version!==COIN_PUMP_WICK_EARLY_VERSION||e.observeOnly!==true||e.pattern!=='EARLY_WICK'||e.status!=='WICK_DETECTED'
    ||e.interval!=='1m'||e.confirmationRequired!==false||! /^[\p{L}\p{N}]{1,32}USDT$/u.test(e.symbol??'')
    ||e.symbol==='BTCUSDT'||!Array.isArray(e.preSweepRows)||![50,65,80].includes(e.preSweepRows.length)
    ||e.id!==`pump-wick-early:${e.symbol}:${e.sweep?.openTime}`||!Number.isFinite(e.observedAt)||e.observedAt<=e.detectedAt)return false;
  const rows=wickClosedRows([...e.preSweepRows,e.sweep],e.observedAt,81);
  if(rows.length!==e.preSweepRows.length+1)return false;
  const r=evaluateCoinPumpWickEarly(rows,rows.length-1);
  return !!r&&['detectedAt','sweepAt','price','sweepHigh','sweepLow','level','wickPct','highToLowDropPct','reboundPct']
    .every(k=>same(e[k],r[k]))&&e.reclaimed===r.reclaimed
    &&Object.entries(r.pump).every(([k,v])=>same(e.pump?.[k],v));
}
export const earlyWickRatioEvent=e=>({id:e.id,snapshot:{symbol:e.symbol,side:'LONG',closedAt:e.detectedAt,observedAt:e.observedAt}});
function frozen(e){const r=evaluateCoinPumpWickEarly([...e.preSweepRows,e.sweep],e.preSweepRows.length);return {...r,symbol:e.symbol,id:e.id,observedAt:e.observedAt,source:'AT_ENTRY'};}
function fresh(e,{now,enabledAt,startedAt,markPrice}) {
  const activation=epoch(enabledAt),start=epoch(startedAt),mark=Number(markPrice);
  return [now,activation,start,mark].every(Number.isFinite)&&activation>0&&start>0&&mark>0
    &&e.detectedAt>Math.max(activation,start)&&e.detectedAt<e.observedAt&&e.observedAt<=now
    &&now-e.detectedAt<=70000&&Math.abs(mark/e.price-1)<=.005;
}
export function buildEarlyWickMarketOrder(e={},options={}) {
  const {now=Date.now(),enabledAt,startedAt,markPrice,ratioProof}=options,mark=Number(markPrice);
  if(!isEarlyWickEntrySignal(e)||!fresh(e,{now,enabledAt,startedAt,markPrice})
    ||!validRisingVolumeRatioProof(earlyWickRatioEvent(e),ratioProof,now))return null;
  return {...EARLY_WICK_ROUTE,...EARLY_WICK_RULE,side:'BUY',symbol:e.symbol,signalType:EARLY_WICK_ROUTE.signalLabel,
    signalInterval:'1m',signalStageKey:'EARLY_WICK',signalCombo:'1m|EARLY_WICK|LONG',executionPage:'local-ai-trend-evaluation',
    orderType:'MARKET',notionalUsdt:15,dryRun:false,allowMinNotionalCeil:false,signalEntryPrice:mark,
    takeProfitPrice:mark*1.02,stopLossPrice:mark*.94,takeProfitDistanceFraction:.02,stopLossDistanceFraction:.06,
    protectionOnFill:true,preserveSignalProtection:true,fillAnchorEnabled:true,fillAnchorVersion:EARLY_WICK_ENTRY_VERSION,
    protectionSignalEntryPrice:mark,protectionSignalTakeProfitPrice:mark*1.02,protectionSignalStopLossPrice:mark*.94,
    entryActivationAt:epoch(enabledAt),entryRunnerStartedAt:epoch(startedAt),entryExpiresAt:e.detectedAt+70000,
    coinPumpWickEarlyAtEntry:frozen(e),coinPumpWickEarlyRatioProof:clone(ratioProof),coinPumpWickEarlySignalId:e.id,
    matchedKeys:[coinPumpWickEarlyKey('EARLY_WICK')],clientOrderId:`cwer_${createHash('sha256').update(e.id).digest('hex').slice(0,27)}`,
    signalReason:`${EARLY_WICK_ENTRY_VERSION} | ${e.id} | EARLY, không chờ xác nhận hồi | ratio ${ratioProof.changePct}% / ${ratioProof.transitionMinutes}m`};
}
export function validEarlyWickOrder(p={},markPrice=p.signalEntryPrice,now=Date.now()) {
  const e=p.coinPumpWickEarlyAtEntry;
  const r=buildEarlyWickMarketOrder(e,{now,enabledAt:p.entryActivationAt,startedAt:p.entryRunnerStartedAt,
    markPrice:p.signalEntryPrice,ratioProof:p.coinPumpWickEarlyRatioProof});
  if(!r||p.coinPumpWickEarlySignalId!==e.id||p.source!==EARLY_WICK_SOURCE||p.streamId!==EARLY_WICK_ROUTE.streamId
    ||p.signalLabel!==EARLY_WICK_ROUTE.signalLabel||p.side!=='BUY'||p.symbol!==e.symbol||p.signalInterval!=='1m'
    ||p.signalStageKey!=='EARLY_WICK'||p.orderType!=='MARKET'||p.clientOrderId!==r.clientOrderId
    ||p.fillAnchorVersion!==EARLY_WICK_ENTRY_VERSION||p.dryRun!==false||p.allowMinNotionalCeil!==false
    ||p.protectionOnFill!==true||p.preserveSignalProtection!==true||p.fillAnchorEnabled!==true
    ||!(Number(markPrice)>0)||Math.abs(Number(markPrice)/p.signalEntryPrice-1)>.005||Math.abs(Number(markPrice)/e.price-1)>.005)return false;
  return ['marginUsdt','notionalUsdt','leverage','takeProfitRoePct','stopLossRoePct','maxOpenPositions','takeProfitPrice','stopLossPrice',
    'takeProfitDistanceFraction','stopLossDistanceFraction','protectionSignalEntryPrice','protectionSignalTakeProfitPrice',
    'protectionSignalStopLossPrice','entryExpiresAt'].every(k=>same(p[k],r[k]));
}
export function earlyWickClosedStats(fills={}) {
  const groups=new Map();
  for(const fill of Object.values(fills??{})) {
    const r=fill.record??fill,e=r.coinPumpWickEarlyAtEntry;
    if(r.signalSource!==EARLY_WICK_SOURCE||r.coinPumpWickEarlyEntryVersion!==EARLY_WICK_ENTRY_VERSION||e?.source!=='AT_ENTRY'
      ||r.positionStatus!=='CLOSED'||r.isDca===true||r.direction!=='LONG'||!isEarlyWickEntrySignal(e)
      ||r.coinPumpWickEarlySignalId!==e.id||!(epoch(r.closedAt)>=epoch(r.filledAt))||epoch(r.filledAt)<e.observedAt
      ||epoch(r.filledAt)-e.detectedAt>120000||r.netRealizedPnlUsdt==null||!Number.isFinite(Number(r.netRealizedPnlUsdt))
      ||!(Number(r.marginUsdt)>0)||!validRisingVolumeRatioProof(earlyWickRatioEvent(e),r.coinPumpWickEarlyRatioProof,r.coinPumpWickEarlyRatioProof?.fetchedAt)
      ||r.coinPumpWickEarlyRatioProof.fetchedAt>epoch(r.filledAt))continue;
    const id=r.closeGroupId??r.orderId??r.clientOrderId;if(!id)continue;
    const g=groups.get(id)??{net:0,margin:0};g.net+=Number(r.netRealizedPnlUsdt);g.margin+=Number(r.marginUsdt);groups.set(id,g);
  }
  const roes=[...groups.values()].map(g=>g.net/g.margin*100);
  return {closed:roes.length,avgRoe:roes.length?roes.reduce((a,b)=>a+b,0)/roes.length:null};
}
export class EarlyWickBinanceRunner {
  constructor({file,controls,getRatioRows,getContext,submit,isProtectionExcluded=()=>false,now=()=>Date.now(),startedAt=now(),storage}={}) {
    Object.assign(this,{file,controls,getRatioRows,getContext,submit,isProtectionExcluded,now,startedAt,storage});
    this.state=null;this.queue=Promise.resolve();this.error=null;
  }
  async load(){
    if(this.state)return this.state;let raw;
    try{raw=this.storage?await this.storage.load():JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(raw&&(raw.version!==EARLY_WICK_ENTRY_VERSION||!raw.attempts||typeof raw.attempts!=='object'||Array.isArray(raw.attempts)))throw Error('EARLY_WICK_LEDGER_INVALID_RETAINED');
    return this.state=raw??{version:EARLY_WICK_ENTRY_VERSION,attempts:{}};
  }
  async save(){
    this.state.attempts=Object.fromEntries(Object.entries(this.state.attempts).filter(([,a])=>a.at>=this.now()-14*86400000||unresolved(a)));
    this.state.updatedAt=this.now();const copy=clone(this.state);if(this.storage)return this.storage.save(copy);
    await mkdir(dirname(this.file),{recursive:true});const tmp=`${this.file}.tmp-${process.pid}`;
    await writeFile(tmp,JSON.stringify(copy),'utf8');await rename(tmp,this.file);
  }
  snapshot(){const c=this.controls.read(),r=c.routes?.[key];return {version:EARLY_WICK_ENTRY_VERSION,...EARLY_WICK_RULE,ratioRule:RISING_VOLUME_RATIO_RULE,
    startedAt:this.startedAt,masterEnabled:c.enabled===true,routeEnabled:r?.enabled===true,enabledAt:r?.enabledAt??null,error:this.error,
    attempts:Object.values(this.state?.attempts??{}).sort((a,b)=>b.at-a.at).slice(0,100).map(({plan,...a})=>a)};}
  process(e){const run=this.queue.catch(()=>{}).then(()=>this.processEvent(e));this.queue=run.catch(()=>{});return run;}
  async processEvent(e={}){
    try{await this.load();}catch{this.error='EARLY_WICK_LEDGER_UNAVAILABLE';return {status:'STATE_ERROR'};}
    if(!isEarlyWickEntrySignal(e))return {status:'INELIGIBLE'};
    if(this.state.attempts[e.id])return {status:'DEDUPED'};
    const c=this.controls.read(),setting=c.routes?.[key];
    if(!c.enabled||setting?.enabled!==true)return {status:'OFF'};
    if(!fresh(e,{now:this.now(),enabledAt:setting.enabledAt,startedAt:this.startedAt,markPrice:e.price}))return {status:'PRE_ENABLE_OR_STALE'};
    const a={id:e.id,symbol:e.symbol,side:'LONG',at:this.now(),detectedAt:e.detectedAt,status:'CHECKING',...EARLY_WICK_RULE};this.state.attempts[e.id]=a;
    try{await this.save();}catch{a.status='STATE_ERROR';return {status:a.status};}
    try{
      let reason=this.isProtectionExcluded(e.symbol)?'PROTECTION_DISABLED':null;
      if(Object.values(this.state.attempts).some(x=>x.id!==e.id&&x.symbol===e.symbol&&unresolved(x)))reason='UNRESOLVED_PREVIOUS_ORDER';
      if(!reason){let rows;try{rows=await this.getRatioRows(e.symbol);}catch{reason='RATIO_UNAVAILABLE';}
        if(!reason){a.ratioProof=buildRisingVolumeRatioProof(earlyWickRatioEvent(e),rows,this.now());if(!a.ratioProof.pass)reason=a.ratioProof.reason;}
        await this.save();}
      const context=reason?null:await this.getContext(e.symbol);
      if(!reason&&context?.enabled!==true)reason='RUNTIME_OFF';
      if(!reason&&(!Array.isArray(context.positions)||!Array.isArray(context.openOrders)))reason='ACCOUNT_DATA_MISSING';
      if(!reason&&context.positions.some(p=>p.symbol===e.symbol&&Number(p.positionAmt)!==0))reason='EXISTING_POSITION';
      if(!reason&&context.openOrders.some(o=>o.symbol===e.symbol&&![true,'true'].includes(o.reduceOnly)&&![true,'true'].includes(o.closePosition)))reason='EXISTING_ORDER';
      if(!reason&&context.positions.filter(p=>Number(p.positionAmt)!==0).length>=50)reason='MAX_OPEN_POSITIONS';
      const current=this.controls.read();if(!reason&&(!current.enabled||current.routes?.[key]?.enabled!==true||current.routes[key].enabledAt!==setting.enabledAt))reason='CONTROL_CHANGED';
      if(!reason&&this.isProtectionExcluded(e.symbol))reason='PROTECTION_DISABLED';
      const plan=reason?null:buildEarlyWickMarketOrder(e,{now:this.now(),enabledAt:setting.enabledAt,startedAt:this.startedAt,markPrice:context.markPrice,ratioProof:a.ratioProof});
      if(!reason&&!plan)reason='PRICE_OR_AGE_BLOCKED';
      if(reason){a.status=reason;await this.save();return {status:reason};}
      this.controls.assertEntry(plan);a.plan=clone(plan);a.planBuiltAt=this.now();a.clientOrderId=plan.clientOrderId;a.status='SUBMITTING';await this.save();
      const r=await this.submit(plan,context);a.status=String(r?.status??'UNKNOWN').toUpperCase();a.orderId=r?.orderResult?.orderId??null;
      a.takeProfitPrice=r?.order?.takeProfitPrice??plan.takeProfitPrice;a.stopLossPrice=r?.order?.stopLossPrice??plan.stopLossPrice;
      await this.save();this.error=null;return {status:a.status,orderId:a.orderId};
    }catch(error){a.status=error.code==='CAUSAL_SIGNAL_RESERVATION'?'SHARED_ENTRY_RESERVED':'ERROR_OR_UNKNOWN';this.error=a.status==='SHARED_ENTRY_RESERVED'?null:'EARLY_WICK_ENTRY_FAILED_OR_UNKNOWN';try{await this.save();}catch{}return {status:a.status};}
  }
  async protectionPlanFor({symbol,side,orderId,clientOrderId}={}) {
    await this.load();if(!orderId||!clientOrderId||!['BUY','LONG'].includes(side))return null;
    const a=Object.values(this.state.attempts).find(x=>x.symbol===symbol&&x.clientOrderId===String(clientOrderId)
      &&(!x.orderId||String(x.orderId)===String(orderId))&&['SUBMITTING','SUBMITTED','FILLED','NEW','UNKNOWN','ERROR_OR_UNKNOWN'].includes(x.status));
    return a?.plan&&validEarlyWickOrder(a.plan,a.plan.signalEntryPrice,a.planBuiltAt)?clone(a.plan):null;
  }
}
