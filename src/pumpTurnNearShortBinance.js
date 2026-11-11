import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {PUMP_TURN_VERSION,STEP,plannedPumpZones,livePumpZone} from '../public/pump-turn-model.js';
import {longContextView} from '../public/pump-turn-long-context-model.js';
import {evaluateSweepPumpPhase,SWEEP_PUMP_PHASE_RULE} from './heatmapSweepPumpPhase.js';
export const PUMP_TURN_NEAR_SOURCE='pump-turn-near-short';
export const PUMP_TURN_NEAR_ENTRY_VERSION='PUMP_TURN_NEAR_SHORT_2USDT_5X_TP10_SL30_OWN_CAP20_V2_20261018';
export const PUMP_TURN_NEAR_REJECTION_VERSION='PUMP_TURN_NEAR_KNOWN_EXCHANGE_REJECTION_V2_MARGIN_20261019';
const LEGACY_ENTRY_VERSION='PUMP_TURN_NEAR_SHORT_2USDT_5X_TP10_SL30_V1_20261018';
export const PUMP_TURN_NEAR_ROUTE=Object.freeze({source:PUMP_TURN_NEAR_SOURCE,streamId:'live-5m-near-zone',signalLabel:'PUMP_TURN_NEAR_SHORT',side:'SHORT'});
export const PUMP_TURN_NEAR_RULE=Object.freeze({marginUsdt:2,leverage:5,takeProfitRoePct:10,stopLossRoePct:30,maxOpenPositions:20,maxAgeMs:30000,maxPriceDrift:.005});
export const PUMP_TURN_NEAR_LONG_SOURCE='pump-turn-near-long';
export const PUMP_TURN_NEAR_LONG_ENTRY_VERSION='PUMP_TURN_NEAR_LONG_STRONG_BUY_5USDT_3X_TP5_SL20_V1_20261110';
export const PUMP_TURN_NEAR_LONG_PHASE_VERSION='PUMP_TURN_NEAR_LONG_FIRST_PUMP_24H_V1_20261110';
export const PUMP_TURN_NEAR_LONG_PRICE_VERSION='PUMP_TURN_NEAR_LONG_PRICE_UP_ONLY_V2_20261110';
export const PUMP_TURN_NEAR_LONG_ROUTE=Object.freeze({source:PUMP_TURN_NEAR_LONG_SOURCE,streamId:'live-5m-near-zone',signalLabel:'PUMP_TURN_NEAR_LONG_STRONG_BUY',side:'LONG'});
export const PUMP_TURN_NEAR_LONG_RULE=Object.freeze({...PUMP_TURN_NEAR_RULE,marginUsdt:5,leverage:3,takeProfitRoePct:5,stopLossRoePct:20});
export const pumpTurnNearRouteKey=JSON.stringify([PUMP_TURN_NEAR_SOURCE,PUMP_TURN_NEAR_ROUTE.streamId,PUMP_TURN_NEAR_ROUTE.signalLabel,'SHORT']);
export const pumpTurnNearLongRouteKey=JSON.stringify([PUMP_TURN_NEAR_LONG_SOURCE,PUMP_TURN_NEAR_LONG_ROUTE.streamId,PUMP_TURN_NEAR_LONG_ROUTE.signalLabel,'LONG']);
const shortVariant={route:PUMP_TURN_NEAR_ROUTE,rule:PUMP_TURN_NEAR_RULE,key:pumpTurnNearRouteKey,version:PUMP_TURN_NEAR_ENTRY_VERSION,prefix:'ptns_',orderSide:'SELL'};
const longVariant={route:PUMP_TURN_NEAR_LONG_ROUTE,rule:PUMP_TURN_NEAR_LONG_RULE,key:pumpTurnNearLongRouteKey,version:PUMP_TURN_NEAR_LONG_ENTRY_VERSION,prefix:'ptnl_',orderSide:'BUY'};
const copy=x=>structuredClone(x),epoch=x=>typeof x==='number'?x:Date.parse(x??''),same=(a,b)=>typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<1e-10;
const notionalRejected=a=>Number(a.errorCode)===-4164
 ||/^Order's notional must be no smaller than \d+(?:\.\d+)? \(unless you choose reduce only\)\.$/.test(a.reason??'');
// -2019 is a definite rejection, not an uncertain submission. Legacy records
// without a code accept only the complete Binance message, never a substring
// or a message paired with a contradictory timeout/unknown error code.
const marginRejected=a=>Number(a.errorCode)===-2019
 ||(a.errorCode==null&&a.reason==='Margin is insufficient.');
const knownRejected=a=>notionalRejected(a)||marginRejected(a);
const unresolved=a=>['CHECKING','SUBMITTING','UNKNOWN','ERROR_OR_UNKNOWN'].includes(a.status)
 &&!(a.status==='ERROR_OR_UNKNOWN'&&knownRejected(a));
const accepted=a=>['SUBMITTED','FILLED','NEW','PARTIALLY_FILLED'].includes(a.status);
// Count only this route's positions and durable in-flight reservations.
// Unknown submissions retain a slot until reconciliation; other strategies never consume this quota.
export function pumpTurnNearOpenSlots({positions,fills={},attempts={},now=Date.now(),excludeClientOrderId=null,source=PUMP_TURN_NEAR_SOURCE}={}){
 if(!Array.isArray(positions)||positions.some(p=>!Number.isFinite(Number(p.positionAmt))))throw Error('PUMP_TURN_ACCOUNT_DATA_MISSING');
 if(!fills||typeof fills!=='object'||Array.isArray(fills))throw Error('PUMP_TURN_AUDIT_DATA_MISSING');
 const long=source===PUMP_TURN_NEAR_LONG_SOURCE,side=long?'LONG':'SHORT';
 const live=new Set(positions.filter(p=>long?Number(p.positionAmt)>0:Number(p.positionAmt)<0).map(p=>p.symbol)),slots=new Set(),closed=new Set();
 for(const item of Object.values(fills)){
  const r=item?.record??item;if(!r||r.signalSource!==source||r.direction!==side)continue;
  if(r.positionStatus==='CLOSED'){if(r.clientOrderId)closed.add(r.clientOrderId);continue;}
  if(live.has(r.symbol))slots.add(r.symbol);
 }
 for(const a of Object.values(attempts)){
  if(a.side!==side||a.clientOrderId===excludeClientOrderId||closed.has(a.clientOrderId))continue;
  if(unresolved(a)&&a.status!=='CHECKING'||accepted(a)&&(live.has(a.symbol)||now-a.at<120000))slots.add(a.symbol);
 }
 return slots.size;
}
export function validPumpTurnNearSignal(e={}){
 if(!e||typeof e!=='object'||e.shortFlowOnly===true||e.longFlowEarlyOnly===true)return false;
 if(e.version!==PUMP_TURN_VERSION||!['LONG','SHORT'].includes(e.side)||e.interval!=='5m'||e.observeOnly!==true||!Array.isArray(e.preRows)||e.preRows.length!==72
  ||!Number.isFinite(e.observedAt)||!Number.isFinite(e.liveAt)||e.liveAt>e.observedAt||!Number.isFinite(e.nearPct)||e.nearPct<.1||e.nearPct>3
  ||!/^[\p{L}\p{N}]{1,32}USDT$/u.test(e.symbol??''))return false;
 if(e.preRows.some((b,i)=>![b.t,b.end,b.o,b.c,b.h,b.l,b.q,b.v,b.buy].every(Number.isFinite)||b.t%STEP!==0||b.end!==b.t+STEP-1
  ||b.end>=e.observedAt||Math.min(b.o,b.c,b.h,b.l)<=0||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c)||b.q<0||b.v<0||b.buy<0||b.buy>b.q*1.000001
  ||i&&b.t-e.preRows[i-1].t!==STEP))return false;
 const p=plannedPumpZones(e.symbol,e.preRows).find(p=>p.side===e.side);
 if(!p||e.id!=='pump-turn-near:'+p.id||!['asOf','expiresAt','zoneLow','zoneHigh','peak','pump6h'].every(k=>same(e[k],p[k])))return false;
 if(e.side==='LONG'&&(!['gain60','preBuyPct','preVolumeX'].every(k=>same(e[k],p[k]))||longContextView(e).label!=='STRONG_BUY'))return false;
 const r=livePumpZone(p,{price:e.livePrice,at:e.liveAt},e.observedAt,e.nearPct);
 return p.contextEligible&&r.alertEligible&&r.state===e.state&&['NEAR','IN_ZONE'].includes(r.state);
}
export function capturePumpTurnLongPhase(e,rows){
 const phase=evaluateSweepPumpPhase({event:{id:e.id,symbol:e.symbol,direction:'UPPER',at:e.observedAt,markPrice:e.livePrice},
  coinRows:Array.isArray(rows)?rows:[],now:e.observedAt});
 const usable=phase.sources?.closedAt===e.asOf;
 return {version:PUMP_TURN_NEAR_LONG_PHASE_VERSION,state:usable?phase.state:'UNKNOWN',
  closedAt:phase.sources?.closedAt??null,features:usable?phase.features:null};
}
function validFirstPump(e){
 if(e.longPumpPhase?.version!==PUMP_TURN_NEAR_LONG_PHASE_VERSION||e.longPumpPhase.state!=='FIRST_PUSH'
   ||e.longPumpPhase.closedAt!==e.asOf||e.phaseRows?.length!==SWEEP_PUMP_PHASE_RULE.bars)return false;
 return capturePumpTurnLongPhase(e,e.phaseRows).state==='FIRST_PUSH';
}
function withinPriceDrift(side,mark,reference){
 return side==='LONG'
  ?mark<=reference*(1+PUMP_TURN_NEAR_LONG_RULE.maxPriceDrift)
  :Math.abs(mark/reference-1)<=PUMP_TURN_NEAR_RULE.maxPriceDrift;
}
function fresh(e,{now,enabledAt,startedAt,markPrice}){
 const active=epoch(enabledAt),start=epoch(startedAt),mark=Number(markPrice);
 if(![now,active,start,mark].every(Number.isFinite)||active<=0||start<=0||mark<=0||e.observedAt<=Math.max(active,start)||e.liveAt<=Math.max(active,start)
  ||e.observedAt>now||now-e.observedAt>30000||now-e.liveAt>30000||now>=e.expiresAt||!withinPriceDrift(e.side,mark,e.livePrice))return false;
 return livePumpZone(plannedPumpZones(e.symbol,e.preRows).find(p=>p.side===e.side),{price:mark,at:now},now,e.nearPct).alertEligible;
}
export function buildPumpTurnNearOrder(e={},options={}){
 return buildOrder(e,options,false);
}
function buildOrder(e,options,legacyProtectionOnly){
 const isLong=e?.side==='LONG',v=isLong?longVariant:shortVariant;
 const {now=Date.now(),enabledAt,startedAt,markPrice,maxOpenPositions=v.rule.maxOpenPositions}=options,mark=Number(markPrice);
 if(!validPumpTurnNearSignal(e)||!fresh(e,{now,enabledAt,startedAt,markPrice})||maxOpenPositions!==v.rule.maxOpenPositions)return null;
 if(isLong&&!validFirstPump(e)&&!(legacyProtectionOnly&&e.longPumpPhase==null&&e.phaseRows==null))return null;
 const tpDistance=v.rule.takeProfitRoePct/(100*v.rule.leverage),slDistance=v.rule.stopLossRoePct/(100*v.rule.leverage);
 const tp=mark*(isLong?1+tpDistance:1-tpDistance),sl=mark*(isLong?1-slDistance:1+slDistance);
 return {...v.route,...v.rule,side:v.orderSide,symbol:e.symbol,signalType:v.route.signalLabel,signalInterval:'5m',signalStageKey:'NEAR_UNCONFIRMED',
  executionPage:'pump-turn-watch',orderType:'MARKET',notionalUsdt:v.rule.marginUsdt*v.rule.leverage,maxOpenPositions,maxOpenPositionsScope:v.route.source,dryRun:false,allowMinNotionalCeil:false,
  signalEntryPrice:mark,takeProfitPrice:tp,stopLossPrice:sl,takeProfitDistanceFraction:tpDistance,stopLossDistanceFraction:slDistance,
  protectionOnFill:true,preserveSignalProtection:true,fillAnchorEnabled:true,fillAnchorVersion:v.version,
  protectionSignalEntryPrice:mark,protectionSignalTakeProfitPrice:tp,protectionSignalStopLossPrice:sl,
  entryActivationAt:epoch(enabledAt),entryRunnerStartedAt:epoch(startedAt),entryExpiresAt:Math.min(e.expiresAt,e.observedAt+30000),
  pumpTurnNearAtEntry:copy(e),pumpTurnNearSignalId:e.id,clientOrderId:v.prefix+createHash('sha256').update(e.id).digest('hex').slice(0,27),
  signalReason:isLong?`${v.version} | ${e.id} | GẦN VÙNG LONG · CHƯA XÁC NHẬN · LỰC MUA + VOLUME MẠNH`:`${v.version} | ${e.id} | GẦN VÙNG SHORT, chưa xác nhận nến | không phải Heatmap sweep`};
}
export function validPumpTurnNearOrder(p={},markPrice=p.signalEntryPrice,now=Date.now()){
 return validOrder(p,markPrice,now,false);
}
function validOrder(p,markPrice,now,legacyProtectionOnly){
 if(p.takeProfitLegs?.length)return false;
 const e=p.pumpTurnNearAtEntry,r=buildOrder(e??{},{now,enabledAt:p.entryActivationAt,startedAt:p.entryRunnerStartedAt,markPrice:p.signalEntryPrice},legacyProtectionOnly);
 if(!r||!fresh(e,{now,enabledAt:p.entryActivationAt,startedAt:p.entryRunnerStartedAt,markPrice})||!withinPriceDrift(e.side,Number(markPrice),p.signalEntryPrice))return false;
 // V1 proof may recover an exact old fill's protection only, never authorize a new entry.
 if(legacyProtectionOnly&&r.source===PUMP_TURN_NEAR_SOURCE&&p.fillAnchorVersion===LEGACY_ENTRY_VERSION){
  if(p.maxOpenPositionsScope!=null||!Number.isInteger(p.maxOpenPositions)||p.maxOpenPositions<1||p.maxOpenPositions>50)return false;
  r.fillAnchorVersion=LEGACY_ENTRY_VERSION;r.maxOpenPositions=p.maxOpenPositions;r.maxOpenPositionsScope=p.maxOpenPositionsScope;
 }
 return ['source','streamId','signalLabel','side','symbol','signalType','signalInterval','signalStageKey','executionPage','orderType','clientOrderId','pumpTurnNearSignalId',
  'maxOpenPositionsScope','dryRun','allowMinNotionalCeil','protectionOnFill','preserveSignalProtection','fillAnchorEnabled','fillAnchorVersion'].every(k=>p[k]===r[k])
  &&['marginUsdt','notionalUsdt','leverage','takeProfitRoePct','stopLossRoePct','maxOpenPositions','takeProfitPrice','stopLossPrice','takeProfitDistanceFraction','stopLossDistanceFraction',
   'protectionSignalEntryPrice','protectionSignalTakeProfitPrice','protectionSignalStopLossPrice','entryExpiresAt'].every(k=>same(p[k],r[k]));
}
export class PumpTurnNearRunner{
 constructor({file,controls,getContext,getFills=async()=>({}),submit,isProtectionExcluded=()=>false,now=Date.now,startedAt=now(),storage,side='SHORT'}={}){
  Object.assign(this,{file,controls,getContext,getFills,submit,isProtectionExcluded,now,startedAt,storage});this.variant=side==='LONG'?longVariant:shortVariant;this.queue=Promise.resolve();this.error=null;
 }
 async load(){if(this.state)return this.state;let s;try{s=this.storage?await this.storage.load():JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const {route,version}=this.variant,versions=route.side==='SHORT'?[version,LEGACY_ENTRY_VERSION]:[version];
  if(s&&(!versions.includes(s.version)||!s.attempts||Array.isArray(s.attempts)||typeof s.attempts!=='object'
   ||Object.entries(s.attempts).some(([id,a])=>!a||a.id!==id||a.side!==route.side||typeof a.symbol!=='string'||!Number.isFinite(a.at)||typeof a.status!=='string')))throw Error('PUMP_TURN_LEDGER_INVALID');
  return this.state=s?{...s,version}:{version,attempts:{}};
 }
 async save(){const s=copy(this.state);if(this.storage)return this.storage.save(s);await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(s));await rename(tmp,this.file);}
 enabled(){const c=this.controls.read();return !this.error&&c.enabled===true&&c.routes?.[this.variant.key]?.enabled===true;}
 snapshot(){const c=this.controls.read(),{route,rule,key,version}=this.variant;return {version,rejectionVersion:PUMP_TURN_NEAR_REJECTION_VERSION,...rule,...(route.side==='LONG'?{pricePolicyVersion:PUMP_TURN_NEAR_LONG_PRICE_VERSION,priceDriftMode:'UP_ONLY',pumpPhaseVersion:PUMP_TURN_NEAR_LONG_PHASE_VERSION,requiredPhase:'FIRST_PUSH'}:{}),capScope:route.source,openSlots:this.openSlots??null,slotsCheckedAt:this.slotsCheckedAt??null,startedAt:this.startedAt,masterEnabled:c.enabled===true,
  routeEnabled:c.routes?.[key]?.enabled===true,enabledAt:c.routes?.[key]?.enabledAt??null,error:this.error,
  attempts:Object.values(this.state?.attempts??{}).sort((a,b)=>b.at-a.at).slice(0,100).map(({plan,...a})=>({...a,
   effectiveStatus:a.status==='ERROR_OR_UNKNOWN'&&knownRejected(a)?'EXCHANGE_REJECTED':a.status}))};}
 process(e){const p=this.queue.then(()=>this.processEvent(e));this.queue=p.catch(()=>{});return p;}
 async processEvent(e){
  try{await this.load();}catch{this.error='PUMP_TURN_LEDGER_UNAVAILABLE';return {status:'STATE_ERROR'};}
  const {route,rule,key,version}=this.variant;
  if(e?.side!==route.side||!validPumpTurnNearSignal(e))return {status:'INELIGIBLE'};
  if(route.side==='LONG'&&!validFirstPump(e))return {status:'NOT_FIRST_PUMP'};
  if(this.state.attempts[e.id])return {status:'DEDUPED'};
  const c=this.controls.read(),setting=c.routes?.[key];if(!c.enabled||setting?.enabled!==true)return {status:'OFF'};
  if(!fresh(e,{now:this.now(),enabledAt:setting.enabledAt,startedAt:this.startedAt,markPrice:e.livePrice}))return {status:'PRE_ENABLE_OR_STALE'};
  const a={id:e.id,symbol:e.symbol,side:route.side,entryVersion:version,at:this.now(),status:'CHECKING'};this.state.attempts[e.id]=a;
  try{await this.save();}catch{this.error='PUMP_TURN_LEDGER_UNAVAILABLE';return {status:'STATE_ERROR'};}
  try{
   let reason=this.isProtectionExcluded(e.symbol)?'PROTECTION_DISABLED':Object.values(this.state.attempts).some(x=>x.id!==e.id&&x.symbol===e.symbol&&unresolved(x))?'UNRESOLVED_PREVIOUS_ORDER':null;
   const ctx=reason?null:await this.getContext(e.symbol);
   if(!reason&&ctx?.enabled!==true)reason='RUNTIME_OFF';
   if(!reason&&(!Array.isArray(ctx.positions)||!Array.isArray(ctx.openOrders)))reason='ACCOUNT_DATA_MISSING';
   if(!reason&&ctx.positions.some(p=>!Number.isFinite(Number(p.positionAmt))))reason='ACCOUNT_DATA_INVALID';
   if(!reason&&ctx.positions.some(p=>p.symbol===e.symbol&&Number(p.positionAmt)!==0))reason='EXISTING_POSITION';
   if(!reason&&ctx.openOrders.some(o=>o.symbol===e.symbol&&![true,'true'].includes(o.reduceOnly)&&![true,'true'].includes(o.closePosition)))reason='EXISTING_ORDER';
   if(!reason){this.openSlots=pumpTurnNearOpenSlots({positions:ctx.positions,fills:await this.getFills(),attempts:this.state.attempts,now:this.now(),source:route.source});this.slotsCheckedAt=this.now();if(this.openSlots>=rule.maxOpenPositions)reason='MAX_PUMP_TURN_NEAR_20';}
   const latest=this.controls.read();if(!reason&&(!latest.enabled||latest.routes?.[key]?.enabled!==true||latest.routes[key].enabledAt!==setting.enabledAt))reason='CONTROL_CHANGED';
   const checkedAt=this.now();
   const plan=reason?null:buildPumpTurnNearOrder(e,{now:checkedAt,enabledAt:setting.enabledAt,startedAt:this.startedAt,markPrice:ctx.markPrice});
   if(!reason&&!plan){
    reason='PRICE_OR_AGE_BLOCKED';
    if(route.side==='LONG'){
     const floor=e.zoneLow/(1+e.nearPct/100),ceiling=Math.min(e.zoneHigh,e.livePrice*(1+rule.maxPriceDrift));
     a.reason=`MARK ${Number(ctx.markPrice)||'—'} · phạm vi ${floor.toPrecision(8)}–${ceiling.toPrecision(8)} · tuổi ${checkedAt-e.observedAt} ms`;
    }
   }
   if(reason){a.status=reason;await this.save();return {status:reason};}
   this.controls.assertEntry(plan);a.plan=copy(plan);a.planBuiltAt=this.now();a.clientOrderId=plan.clientOrderId;a.status='SUBMITTING';await this.save();
   const r=await this.submit(plan,ctx);a.status=String(r?.status??'UNKNOWN').toUpperCase();a.orderId=r?.orderResult?.orderId??null;await this.save();return {status:a.status,orderId:a.orderId};
  }catch(error){a.reason=String(error.message??'Không rõ kết quả').slice(0,220);
   a.errorCode=error.code!=null&&Number.isFinite(Number(error.code))?Number(error.code):null;
   a.status=error.code==='CAUSAL_SIGNAL_RESERVATION'?'SHARED_ENTRY_RESERVED':knownRejected(a)?'EXCHANGE_REJECTED':error.beforePumpTurnMarket===true?'PRE_MARKET_REJECTED':'ERROR_OR_UNKNOWN';
   try{await this.save();}catch{this.error='PUMP_TURN_LEDGER_UNAVAILABLE';}return {status:a.status};}
 }
 async protectionPlanFor({symbol,side,orderId,clientOrderId}={}){await this.load();if(!orderId||!clientOrderId||![this.variant.orderSide,this.variant.route.side].includes(side))return null;
  const a=Object.values(this.state.attempts).find(a=>a.symbol===symbol&&a.clientOrderId===String(clientOrderId)&&(!a.orderId||String(a.orderId)===String(orderId))
   &&['SUBMITTING','SUBMITTED','FILLED','NEW','PARTIALLY_FILLED','UNKNOWN','ERROR_OR_UNKNOWN'].includes(a.status));
  return a?.plan&&validOrder(a.plan,a.plan.signalEntryPrice,a.planBuiltAt,true)?copy(a.plan):null;
 }
}

export {PumpTurnNearRunner as PumpTurnNearShortRunner};
