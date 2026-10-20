import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {PUMP_TURN_VERSION,STEP,plannedPumpZones,livePumpZone} from '../public/pump-turn-model.js';
export const PUMP_TURN_NEAR_SOURCE='pump-turn-near-short';
export const PUMP_TURN_NEAR_ENTRY_VERSION='PUMP_TURN_NEAR_SHORT_2USDT_5X_TP10_SL30_OWN_CAP20_V2_20261018';
export const PUMP_TURN_NEAR_REJECTION_VERSION='PUMP_TURN_NEAR_KNOWN_EXCHANGE_REJECTION_V2_MARGIN_20261019';
const LEGACY_ENTRY_VERSION='PUMP_TURN_NEAR_SHORT_2USDT_5X_TP10_SL30_V1_20261018';
export const PUMP_TURN_NEAR_ROUTE=Object.freeze({source:PUMP_TURN_NEAR_SOURCE,streamId:'live-5m-near-zone',signalLabel:'PUMP_TURN_NEAR_SHORT',side:'SHORT'});
export const PUMP_TURN_NEAR_RULE=Object.freeze({marginUsdt:2,leverage:5,takeProfitRoePct:10,stopLossRoePct:30,maxOpenPositions:20,maxAgeMs:30000,maxPriceDrift:.005});
export const pumpTurnNearRouteKey=JSON.stringify([PUMP_TURN_NEAR_SOURCE,PUMP_TURN_NEAR_ROUTE.streamId,PUMP_TURN_NEAR_ROUTE.signalLabel,'SHORT']);
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
// Count only this route's SHORT positions and durable in-flight reservations.
// Unknown submissions retain a slot until reconciliation; other strategies never consume this quota.
export function pumpTurnNearOpenSlots({positions,fills={},attempts={},now=Date.now(),excludeClientOrderId=null}={}){
 if(!Array.isArray(positions)||positions.some(p=>!Number.isFinite(Number(p.positionAmt))))throw Error('PUMP_TURN_ACCOUNT_DATA_MISSING');
 if(!fills||typeof fills!=='object'||Array.isArray(fills))throw Error('PUMP_TURN_AUDIT_DATA_MISSING');
 const live=new Set(positions.filter(p=>Number(p.positionAmt)<0).map(p=>p.symbol)),slots=new Set(),closed=new Set();
 for(const item of Object.values(fills)){
  const r=item?.record??item;if(!r||r.signalSource!==PUMP_TURN_NEAR_SOURCE||r.direction!=='SHORT')continue;
  if(r.positionStatus==='CLOSED'){if(r.clientOrderId)closed.add(r.clientOrderId);continue;}
  if(live.has(r.symbol))slots.add(r.symbol);
 }
 for(const a of Object.values(attempts)){
  if(a.side!=='SHORT'||a.clientOrderId===excludeClientOrderId||closed.has(a.clientOrderId))continue;
  if(unresolved(a)&&a.status!=='CHECKING'||accepted(a)&&(live.has(a.symbol)||now-a.at<120000))slots.add(a.symbol);
 }
 return slots.size;
}
export function validPumpTurnNearSignal(e={}){
 if(!e||typeof e!=='object')return false;
 if(e.version!==PUMP_TURN_VERSION||e.side!=='SHORT'||e.interval!=='5m'||e.observeOnly!==true||!Array.isArray(e.preRows)||e.preRows.length!==72
  ||!Number.isFinite(e.observedAt)||!Number.isFinite(e.liveAt)||e.liveAt>e.observedAt||!Number.isFinite(e.nearPct)||e.nearPct<.1||e.nearPct>3
  ||!/^[\p{L}\p{N}]{1,32}USDT$/u.test(e.symbol??''))return false;
 if(e.preRows.some((b,i)=>![b.t,b.end,b.o,b.c,b.h,b.l,b.q,b.v,b.buy].every(Number.isFinite)||b.t%STEP!==0||b.end!==b.t+STEP-1
  ||b.end>=e.observedAt||Math.min(b.o,b.c,b.h,b.l)<=0||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c)||b.q<0||b.v<0||b.buy<0||b.buy>b.q*1.000001
  ||i&&b.t-e.preRows[i-1].t!==STEP))return false;
 const p=plannedPumpZones(e.symbol,e.preRows).find(p=>p.side==='SHORT');
 if(!p||e.id!=='pump-turn-near:'+p.id||!['asOf','expiresAt','zoneLow','zoneHigh','peak','pump6h'].every(k=>same(e[k],p[k])))return false;
 const r=livePumpZone(p,{price:e.livePrice,at:e.liveAt},e.observedAt,e.nearPct);
 return p.contextEligible&&r.alertEligible&&r.state===e.state&&['NEAR','IN_ZONE'].includes(r.state);
}
function fresh(e,{now,enabledAt,startedAt,markPrice}){
 const active=epoch(enabledAt),start=epoch(startedAt),mark=Number(markPrice);
 if(![now,active,start,mark].every(Number.isFinite)||active<=0||start<=0||mark<=0||e.observedAt<=Math.max(active,start)||e.liveAt<=Math.max(active,start)
  ||e.observedAt>now||now-e.observedAt>30000||now-e.liveAt>30000||now>=e.expiresAt||Math.abs(mark/e.livePrice-1)>.005)return false;
 return livePumpZone(plannedPumpZones(e.symbol,e.preRows).find(p=>p.side==='SHORT'),{price:mark,at:now},now,e.nearPct).alertEligible;
}
export function buildPumpTurnNearOrder(e={},options={}){
 const {now=Date.now(),enabledAt,startedAt,markPrice,maxOpenPositions=PUMP_TURN_NEAR_RULE.maxOpenPositions}=options,mark=Number(markPrice);
 if(!validPumpTurnNearSignal(e)||!fresh(e,{now,enabledAt,startedAt,markPrice})||maxOpenPositions!==20)return null;
 return {...PUMP_TURN_NEAR_ROUTE,...PUMP_TURN_NEAR_RULE,side:'SELL',symbol:e.symbol,signalType:PUMP_TURN_NEAR_ROUTE.signalLabel,signalInterval:'5m',signalStageKey:'NEAR_UNCONFIRMED',
  executionPage:'pump-turn-watch',orderType:'MARKET',notionalUsdt:10,maxOpenPositions,maxOpenPositionsScope:PUMP_TURN_NEAR_SOURCE,dryRun:false,allowMinNotionalCeil:false,
  signalEntryPrice:mark,takeProfitPrice:mark*.98,stopLossPrice:mark*1.06,takeProfitDistanceFraction:.02,stopLossDistanceFraction:.06,
  protectionOnFill:true,preserveSignalProtection:true,fillAnchorEnabled:true,fillAnchorVersion:PUMP_TURN_NEAR_ENTRY_VERSION,
  protectionSignalEntryPrice:mark,protectionSignalTakeProfitPrice:mark*.98,protectionSignalStopLossPrice:mark*1.06,
  entryActivationAt:epoch(enabledAt),entryRunnerStartedAt:epoch(startedAt),entryExpiresAt:Math.min(e.expiresAt,e.observedAt+30000),
  pumpTurnNearAtEntry:copy(e),pumpTurnNearSignalId:e.id,clientOrderId:'ptns_'+createHash('sha256').update(e.id).digest('hex').slice(0,27),
  signalReason:`${PUMP_TURN_NEAR_ENTRY_VERSION} | ${e.id} | GẦN VÙNG SHORT, chưa xác nhận nến | không phải Heatmap sweep`};
}
export function validPumpTurnNearOrder(p={},markPrice=p.signalEntryPrice,now=Date.now()){
 return validOrder(p,markPrice,now,false);
}
function validOrder(p,markPrice,now,legacyProtectionOnly){
 if(p.takeProfitLegs?.length)return false;
 const e=p.pumpTurnNearAtEntry,r=buildPumpTurnNearOrder(e,{now,enabledAt:p.entryActivationAt,startedAt:p.entryRunnerStartedAt,markPrice:p.signalEntryPrice});
 if(!r||!fresh(e,{now,enabledAt:p.entryActivationAt,startedAt:p.entryRunnerStartedAt,markPrice})||Math.abs(Number(markPrice)/p.signalEntryPrice-1)>.005)return false;
 // V1 proof may recover an exact old fill's protection only, never authorize a new entry.
 if(legacyProtectionOnly&&p.fillAnchorVersion===LEGACY_ENTRY_VERSION){
  if(p.maxOpenPositionsScope!=null||!Number.isInteger(p.maxOpenPositions)||p.maxOpenPositions<1||p.maxOpenPositions>50)return false;
  r.fillAnchorVersion=LEGACY_ENTRY_VERSION;r.maxOpenPositions=p.maxOpenPositions;r.maxOpenPositionsScope=p.maxOpenPositionsScope;
 }
 return ['source','streamId','signalLabel','side','symbol','signalType','signalInterval','signalStageKey','executionPage','orderType','clientOrderId','pumpTurnNearSignalId',
  'maxOpenPositionsScope','dryRun','allowMinNotionalCeil','protectionOnFill','preserveSignalProtection','fillAnchorEnabled','fillAnchorVersion'].every(k=>p[k]===r[k])
  &&['marginUsdt','notionalUsdt','leverage','takeProfitRoePct','stopLossRoePct','maxOpenPositions','takeProfitPrice','stopLossPrice','takeProfitDistanceFraction','stopLossDistanceFraction',
   'protectionSignalEntryPrice','protectionSignalTakeProfitPrice','protectionSignalStopLossPrice','entryExpiresAt'].every(k=>same(p[k],r[k]));
}
export class PumpTurnNearShortRunner{
 constructor({file,controls,getContext,getFills=async()=>({}),submit,isProtectionExcluded=()=>false,now=Date.now,startedAt=now(),storage}={}){
  Object.assign(this,{file,controls,getContext,getFills,submit,isProtectionExcluded,now,startedAt,storage});this.queue=Promise.resolve();this.error=null;
 }
 async load(){if(this.state)return this.state;let s;try{s=this.storage?await this.storage.load():JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(s&&(![PUMP_TURN_NEAR_ENTRY_VERSION,LEGACY_ENTRY_VERSION].includes(s.version)||!s.attempts||Array.isArray(s.attempts)||typeof s.attempts!=='object'
   ||Object.entries(s.attempts).some(([id,a])=>!a||a.id!==id||a.side!=='SHORT'||typeof a.symbol!=='string'||!Number.isFinite(a.at)||typeof a.status!=='string')))throw Error('PUMP_TURN_LEDGER_INVALID');
  return this.state=s?{...s,version:PUMP_TURN_NEAR_ENTRY_VERSION}:{version:PUMP_TURN_NEAR_ENTRY_VERSION,attempts:{}};
 }
 async save(){const s=copy(this.state);if(this.storage)return this.storage.save(s);await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(s));await rename(tmp,this.file);}
 enabled(){const c=this.controls.read();return !this.error&&c.enabled===true&&c.routes?.[pumpTurnNearRouteKey]?.enabled===true;}
 snapshot(){const c=this.controls.read();return {version:PUMP_TURN_NEAR_ENTRY_VERSION,rejectionVersion:PUMP_TURN_NEAR_REJECTION_VERSION,...PUMP_TURN_NEAR_RULE,capScope:PUMP_TURN_NEAR_SOURCE,openSlots:this.openSlots??null,slotsCheckedAt:this.slotsCheckedAt??null,startedAt:this.startedAt,masterEnabled:c.enabled===true,
  routeEnabled:c.routes?.[pumpTurnNearRouteKey]?.enabled===true,enabledAt:c.routes?.[pumpTurnNearRouteKey]?.enabledAt??null,error:this.error,
  attempts:Object.values(this.state?.attempts??{}).sort((a,b)=>b.at-a.at).slice(0,100).map(({plan,...a})=>({...a,
   effectiveStatus:a.status==='ERROR_OR_UNKNOWN'&&knownRejected(a)?'EXCHANGE_REJECTED':a.status}))};}
 process(e){const p=this.queue.then(()=>this.processEvent(e));this.queue=p.catch(()=>{});return p;}
 async processEvent(e){
  try{await this.load();}catch{this.error='PUMP_TURN_LEDGER_UNAVAILABLE';return {status:'STATE_ERROR'};}
  if(!validPumpTurnNearSignal(e))return {status:'INELIGIBLE'};
  if(this.state.attempts[e.id])return {status:'DEDUPED'};
  const c=this.controls.read(),setting=c.routes?.[pumpTurnNearRouteKey];if(!c.enabled||setting?.enabled!==true)return {status:'OFF'};
  if(!fresh(e,{now:this.now(),enabledAt:setting.enabledAt,startedAt:this.startedAt,markPrice:e.livePrice}))return {status:'PRE_ENABLE_OR_STALE'};
  const a={id:e.id,symbol:e.symbol,side:'SHORT',entryVersion:PUMP_TURN_NEAR_ENTRY_VERSION,at:this.now(),status:'CHECKING'};this.state.attempts[e.id]=a;
  try{await this.save();}catch{this.error='PUMP_TURN_LEDGER_UNAVAILABLE';return {status:'STATE_ERROR'};}
  try{
   let reason=this.isProtectionExcluded(e.symbol)?'PROTECTION_DISABLED':Object.values(this.state.attempts).some(x=>x.id!==e.id&&x.symbol===e.symbol&&unresolved(x))?'UNRESOLVED_PREVIOUS_ORDER':null;
   const ctx=reason?null:await this.getContext(e.symbol);
   if(!reason&&ctx?.enabled!==true)reason='RUNTIME_OFF';
   if(!reason&&(!Array.isArray(ctx.positions)||!Array.isArray(ctx.openOrders)))reason='ACCOUNT_DATA_MISSING';
   if(!reason&&ctx.positions.some(p=>!Number.isFinite(Number(p.positionAmt))))reason='ACCOUNT_DATA_INVALID';
   if(!reason&&ctx.positions.some(p=>p.symbol===e.symbol&&Number(p.positionAmt)!==0))reason='EXISTING_POSITION';
   if(!reason&&ctx.openOrders.some(o=>o.symbol===e.symbol&&![true,'true'].includes(o.reduceOnly)&&![true,'true'].includes(o.closePosition)))reason='EXISTING_ORDER';
   if(!reason){this.openSlots=pumpTurnNearOpenSlots({positions:ctx.positions,fills:await this.getFills(),attempts:this.state.attempts,now:this.now()});this.slotsCheckedAt=this.now();if(this.openSlots>=20)reason='MAX_PUMP_TURN_NEAR_20';}
   const latest=this.controls.read();if(!reason&&(!latest.enabled||latest.routes?.[pumpTurnNearRouteKey]?.enabled!==true||latest.routes[pumpTurnNearRouteKey].enabledAt!==setting.enabledAt))reason='CONTROL_CHANGED';
   const plan=reason?null:buildPumpTurnNearOrder(e,{now:this.now(),enabledAt:setting.enabledAt,startedAt:this.startedAt,markPrice:ctx.markPrice});
   if(!reason&&!plan)reason='PRICE_OR_AGE_BLOCKED';
   if(reason){a.status=reason;await this.save();return {status:reason};}
   this.controls.assertEntry(plan);a.plan=copy(plan);a.planBuiltAt=this.now();a.clientOrderId=plan.clientOrderId;a.status='SUBMITTING';await this.save();
   const r=await this.submit(plan,ctx);a.status=String(r?.status??'UNKNOWN').toUpperCase();a.orderId=r?.orderResult?.orderId??null;await this.save();return {status:a.status,orderId:a.orderId};
  }catch(error){a.reason=String(error.message??'Không rõ kết quả').slice(0,220);
   a.errorCode=error.code!=null&&Number.isFinite(Number(error.code))?Number(error.code):null;
   a.status=error.code==='CAUSAL_SIGNAL_RESERVATION'?'SHARED_ENTRY_RESERVED':knownRejected(a)?'EXCHANGE_REJECTED':'ERROR_OR_UNKNOWN';
   try{await this.save();}catch{this.error='PUMP_TURN_LEDGER_UNAVAILABLE';}return {status:a.status};}
 }
 async protectionPlanFor({symbol,side,orderId,clientOrderId}={}){await this.load();if(!orderId||!clientOrderId||!['SELL','SHORT'].includes(side))return null;
  const a=Object.values(this.state.attempts).find(a=>a.symbol===symbol&&a.clientOrderId===String(clientOrderId)&&(!a.orderId||String(a.orderId)===String(orderId))
   &&['SUBMITTING','SUBMITTED','FILLED','NEW','PARTIALLY_FILLED','UNKNOWN','ERROR_OR_UNKNOWN'].includes(a.status));
  return a?.plan&&validOrder(a.plan,a.plan.signalEntryPrice,a.planBuiltAt,true)?copy(a.plan):null;
 }
}
