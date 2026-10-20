import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {detectShortSetup,detectLongSetup,advanceShortSetup} from './shortSetupWatch.js';
import {SHORT_SETUP_VERSION} from '../public/short-setup-model.js';
import {wickClosedRows} from './btcWickRecovery.js';

export const STRUCTURE_ENTRY_VERSION='STRUCTURE_READY_1USDT_5X_TP10_SL30_OWN_CAP15_V1_20261012';
export const STRUCTURE_SOURCE='structure-setup-ready';
export const STRUCTURE_ROUTES=['LONG','SHORT'].map(side=>Object.freeze({source:STRUCTURE_SOURCE,streamId:'closed-1m-structure',signalLabel:'STRUCTURE_SETUP_READY',side}));
export const STRUCTURE_RULE=Object.freeze({marginUsdt:1,leverage:5,takeProfitRoePct:10,stopLossRoePct:30,maxOpenPositions:15,maxAgeMs:70000,maxPriceDrift:.005});
export const structureRouteKey=side=>JSON.stringify([STRUCTURE_SOURCE,'closed-1m-structure','STRUCTURE_SETUP_READY',side]);
const clone=x=>JSON.parse(JSON.stringify(x)),epoch=x=>typeof x==='number'?x:Date.parse(x??'');
const same=(a,b)=>typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<1e-9;
const pending=a=>['CHECKING','SUBMITTING','UNKNOWN','ERROR_OR_UNKNOWN'].includes(a.status);
const accepted=a=>['SUBMITTED','FILLED','NEW','PARTIALLY_FILLED'].includes(a.status);

// Re-run the detector and every subsequent closed candle. A UI badge alone grants nothing.
export function validStructureSignal(e={}) {
  if(e.version!==SHORT_SETUP_VERSION||e.observeOnly!==true||!['LONG','SHORT'].includes(e.side)||e.state!=='READY'
    ||e.interval!=='1m'||!Array.isArray(e.originRows)||e.originRows.length<81||e.originRows.length>90
    ||!Array.isArray(e.transitionRows)||!e.transitionRows.length||e.transitionRows.length>15
    ||!Number.isFinite(e.observedAt)||!(e.observedAt>e.updatedAt)||e.triggeredAt!==e.updatedAt)return false;
  const all=[...e.originRows,...e.transitionRows],closed=wickClosedRows(all,e.observedAt,120);
  if(closed.length!==all.length)return false;
  const detect=e.side==='LONG'?detectLongSetup:detectShortSetup;
  const initial=detect({symbol:e.symbol,rows:e.originRows,now:e.originRows.at(-1).closeTime+1});
  if(initial.status!=='SETUP'||initial.row.id!==e.id)return false;
  let replay=initial.row,previous=e.originRows.at(-1);
  for(const candle of e.transitionRows) {
    if(candle.closeTime-previous.closeTime!==60000||replay.state==='READY')return false;
    replay=advanceShortSetup(replay,candle,previous,candle.closeTime+1);previous=candle;
  }
  return replay.state==='READY'&&replay.rewardRisk>=1.5&&e.priorityEligible===true&&replay.pattern===e.pattern
    &&same(e.context?.atr,replay.context.atr)
    &&['createdAt','updatedAt','triggeredAt','price','triggerPrice','invalidationPrice','targetPrice','rewardRisk'].every(k=>same(e[k],replay[k]))
    &&['low','high','establishedAt','touches'].every(k=>same(e.zone?.[k],replay.zone?.[k]));
}
function fresh(e,{now,enabledAt,startedAt,markPrice}) {
  const activation=epoch(enabledAt),start=epoch(startedAt),mark=Number(markPrice),long=e.side==='LONG';
  const risk=long?mark-e.invalidationPrice:e.invalidationPrice-mark,reward=long?e.targetPrice-mark:mark-e.targetPrice;
  return [now,activation,start,mark].every(Number.isFinite)&&activation>0&&start>0&&mark>0
    &&e.updatedAt>Math.max(activation,start)&&e.observedAt<=now&&now-e.updatedAt<=STRUCTURE_RULE.maxAgeMs
    &&Math.abs(mark/e.price-1)<=STRUCTURE_RULE.maxPriceDrift&&risk>0&&reward/risk>=1.5
    &&(long?mark<e.price+e.context.atr*.5:mark>e.price-e.context.atr*.5);
}
export function buildStructureOrder(e={},options={}) {
  const {now=Date.now(),enabledAt,startedAt,markPrice}=options,mark=Number(markPrice);
  if(!validStructureSignal(e)||!fresh(e,{now,enabledAt,startedAt,markPrice}))return null;
  const long=e.side==='LONG',tp=mark*(long?1.02:.98),sl=mark*(long?.94:1.06);
  return {...STRUCTURE_ROUTES.find(r=>r.side===e.side),...STRUCTURE_RULE,side:long?'BUY':'SELL',symbol:e.symbol,
    signalType:'STRUCTURE_SETUP_READY',signalInterval:'1m',signalStageKey:e.pattern,executionPage:'short-setup-watch',
    orderType:'MARKET',notionalUsdt:5,dryRun:false,allowMinNotionalCeil:false,maxOpenPositionsScope:STRUCTURE_SOURCE,
    signalEntryPrice:mark,takeProfitPrice:tp,stopLossPrice:sl,takeProfitDistanceFraction:.02,stopLossDistanceFraction:.06,
    protectionOnFill:true,preserveSignalProtection:true,fillAnchorEnabled:true,fillAnchorVersion:STRUCTURE_ENTRY_VERSION,
    protectionSignalEntryPrice:mark,protectionSignalTakeProfitPrice:tp,protectionSignalStopLossPrice:sl,
    entryActivationAt:epoch(enabledAt),entryRunnerStartedAt:epoch(startedAt),entryExpiresAt:e.updatedAt+70000,
    structureSetupAtEntry:clone(e),structureSetupSignalId:e.id,
    clientOrderId:`ssr_${createHash('sha256').update(e.id).digest('hex').slice(0,27)}`,
    signalReason:`${STRUCTURE_ENTRY_VERSION} | ${e.id} | READY | structural R:R ${e.rewardRisk}`};
}
export function validStructureOrder(p={},markPrice=p.signalEntryPrice,now=Date.now()) {
  const e=p.structureSetupAtEntry,r=buildStructureOrder(e,{now,enabledAt:p.entryActivationAt,startedAt:p.entryRunnerStartedAt,markPrice:p.signalEntryPrice});
  if(!r||!fresh(e,{now,enabledAt:p.entryActivationAt,startedAt:p.entryRunnerStartedAt,markPrice}))return false;
  return ['source','streamId','signalLabel','side','symbol','orderType','signalInterval','signalStageKey','clientOrderId','structureSetupSignalId',
    'maxOpenPositionsScope','fillAnchorVersion','dryRun','allowMinNotionalCeil','protectionOnFill','preserveSignalProtection','fillAnchorEnabled'].every(k=>p[k]===r[k])
    &&['marginUsdt','notionalUsdt','leverage','takeProfitRoePct','stopLossRoePct','maxOpenPositions','takeProfitPrice','stopLossPrice',
      'takeProfitDistanceFraction','stopLossDistanceFraction','protectionSignalEntryPrice','protectionSignalTakeProfitPrice','protectionSignalStopLossPrice','entryExpiresAt'].every(k=>same(p[k],r[k]));
}
export function structureOpenSlots({positions,fills={},attempts={},now=Date.now(),excludeClientOrderId=null}) {
  if(!Array.isArray(positions)||positions.some(p=>!Number.isFinite(Number(p.positionAmt))))throw Error('STRUCTURE_ACCOUNT_DATA_MISSING');
  const live=new Set(positions.filter(p=>Number(p.positionAmt)!==0).map(p=>`${p.symbol}|${Number(p.positionAmt)>0?'LONG':'SHORT'}`));
  const slots=new Set(),closed=new Set();
  for(const item of Object.values(fills)) {
    const r=item.record??item;
    if(r.signalSource!==STRUCTURE_SOURCE||r.structureSetupEntryVersion!==STRUCTURE_ENTRY_VERSION)continue;
    if(r.positionStatus==='CLOSED'){if(r.clientOrderId)closed.add(r.clientOrderId);continue;}
    const key=`${r.symbol}|${r.direction}`;if(live.has(key))slots.add(key);
  }
  for(const a of Object.values(attempts)) {
    if(a.clientOrderId===excludeClientOrderId||closed.has(a.clientOrderId))continue;
    const key=`${a.symbol}|${a.side}`;
    if(pending(a)&&a.status!=='CHECKING'||accepted(a)&&(live.has(key)||now-a.at<120000))slots.add(key);
  }
  return slots.size;
}
export class StructureSetupRunner {
  constructor({file,controls,getContext,getFills=async()=>({}),submit,isProtectionExcluded=()=>false,now=Date.now,startedAt=now(),storage}={}) {
    Object.assign(this,{file,controls,getContext,getFills,submit,isProtectionExcluded,now,startedAt,storage});this.queue=Promise.resolve();this.error=null;
  }
  async load() {
    if(this.state)return this.state;let raw;
    try{raw=this.storage?await this.storage.load():JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(raw&&(raw.version!==STRUCTURE_ENTRY_VERSION||!raw.attempts||typeof raw.attempts!=='object'||Array.isArray(raw.attempts)))throw Error('STRUCTURE_LEDGER_INVALID_RETAINED');
    if(raw&&Object.entries(raw.attempts).some(([id,a])=>!a||a.id!==id||typeof a.symbol!=='string'
      ||!['LONG','SHORT'].includes(a.side)||!Number.isFinite(a.at)||typeof a.status!=='string'))throw Error('STRUCTURE_LEDGER_INVALID_RETAINED');
    return this.state=raw??{version:STRUCTURE_ENTRY_VERSION,attempts:{}};
  }
  async save() {
    // Accepted/unresolved IDs stay durable even after 14 days: no loss of cap ownership after restart.
    this.state.attempts=Object.fromEntries(Object.entries(this.state.attempts).filter(([,a])=>a.at>=this.now()-14*86400000||pending(a)||accepted(a)));
    const copy=clone(this.state);if(this.storage)return this.storage.save(copy);
    await mkdir(dirname(this.file),{recursive:true});const tmp=`${this.file}.tmp-${process.pid}`;await writeFile(tmp,JSON.stringify(copy));await rename(tmp,this.file);
  }
  snapshot() {
    const c=this.controls.read();return {version:STRUCTURE_ENTRY_VERSION,...STRUCTURE_RULE,startedAt:this.startedAt,masterEnabled:c.enabled===true,error:this.error,
      openSlots:this.openSlots??null,routes:STRUCTURE_ROUTES.map(r=>({...r,enabled:c.routes?.[structureRouteKey(r.side)]?.enabled===true})),
      attempts:Object.values(this.state?.attempts??{}).sort((a,b)=>b.at-a.at).slice(0,100).map(({plan,...a})=>a)};
  }
  process(e){const run=this.queue.catch(()=>{}).then(()=>this.processEvent(e));this.queue=run.catch(()=>{});return run;}
  async processEvent(e={}) {
    try{await this.load();}catch{this.error='STRUCTURE_LEDGER_UNAVAILABLE';return {status:'STATE_ERROR'};}
    if(!validStructureSignal(e))return {status:'INELIGIBLE'};
    if(this.state.attempts[e.id])return {status:'DEDUPED'};
    const key=structureRouteKey(e.side),c=this.controls.read(),setting=c.routes?.[key];
    if(!c.enabled||setting?.enabled!==true)return {status:'OFF'};
    if(!fresh(e,{now:this.now(),enabledAt:setting.enabledAt,startedAt:this.startedAt,markPrice:e.price}))return {status:'PRE_ENABLE_OR_STALE'};
    const a={id:e.id,symbol:e.symbol,side:e.side,at:this.now(),closedAt:e.updatedAt,status:'CHECKING',...STRUCTURE_RULE};this.state.attempts[e.id]=a;
    try{await this.save();}catch{this.error='STRUCTURE_LEDGER_UNAVAILABLE';return {status:'STATE_ERROR'};}
    try {
      let reason=this.isProtectionExcluded(e.symbol)?'PROTECTION_DISABLED':null;
      if(Object.values(this.state.attempts).some(x=>x.id!==e.id&&x.symbol===e.symbol&&pending(x)))reason='UNRESOLVED_PREVIOUS_ORDER';
      const context=reason?null:await this.getContext(e.symbol);
      if(!reason&&context?.enabled!==true)reason='RUNTIME_OFF';
      if(!reason&&(!Array.isArray(context.positions)||!Array.isArray(context.openOrders)))reason='ACCOUNT_DATA_MISSING';
      if(!reason&&context.positions.some(p=>p.symbol===e.symbol&&Number(p.positionAmt)!==0))reason='EXISTING_POSITION';
      if(!reason&&context.openOrders.some(o=>o.symbol===e.symbol&&![true,'true'].includes(o.reduceOnly)&&![true,'true'].includes(o.closePosition)))reason='EXISTING_ORDER';
      if(!reason){this.openSlots=structureOpenSlots({positions:context.positions,fills:await this.getFills(),attempts:this.state.attempts,now:this.now()});if(this.openSlots>=15)reason='MAX_STRUCTURE_15';}
      const latest=this.controls.read();if(!reason&&(!latest.enabled||latest.routes?.[key]?.enabled!==true||latest.routes[key].enabledAt!==setting.enabledAt))reason='CONTROL_CHANGED';
      if(!reason&&this.isProtectionExcluded(e.symbol))reason='PROTECTION_DISABLED';
      const plan=reason?null:buildStructureOrder(e,{now:this.now(),enabledAt:setting.enabledAt,startedAt:this.startedAt,markPrice:context.markPrice});
      if(!reason&&!plan)reason='PRICE_RR_OR_AGE_BLOCKED';
      if(reason){a.status=reason;await this.save();return {status:reason};}
      this.controls.assertEntry(plan);a.plan=clone(plan);a.planBuiltAt=this.now();a.clientOrderId=plan.clientOrderId;a.status='SUBMITTING';await this.save();
      const r=await this.submit(plan,context);a.status=String(r?.status??'UNKNOWN').toUpperCase();a.orderId=r?.orderResult?.orderId??null;
      a.takeProfitPrice=r?.order?.takeProfitPrice??plan.takeProfitPrice;a.stopLossPrice=r?.order?.stopLossPrice??plan.stopLossPrice;
      await this.save();this.error=null;return {status:a.status,orderId:a.orderId};
    }catch(error){a.status=error.beforeStructureMarket===true?'BLOCKED_PRE_SUBMIT':error.code==='CAUSAL_SIGNAL_RESERVATION'?'SHARED_ENTRY_RESERVED':'ERROR_OR_UNKNOWN';
      a.reason=String(error.message??'Không rõ kết quả').slice(0,220);try{await this.save();}catch{this.error='STRUCTURE_LEDGER_UNAVAILABLE';}return {status:a.status};}
  }
  async protectionPlanFor({symbol,side,orderId,clientOrderId}={}) {
    await this.load();if(!orderId||!clientOrderId)return null;
    const direction=['BUY','LONG'].includes(side)?'LONG':['SELL','SHORT'].includes(side)?'SHORT':null;
    const a=Object.values(this.state.attempts).find(x=>x.symbol===symbol&&x.side===direction&&x.clientOrderId===String(clientOrderId)
      &&(!x.orderId||String(x.orderId)===String(orderId))&&(pending(x)||accepted(x)));
    return a?.plan&&validStructureOrder(a.plan,a.plan.signalEntryPrice,a.planBuiltAt)?clone(a.plan):null;
  }
}
