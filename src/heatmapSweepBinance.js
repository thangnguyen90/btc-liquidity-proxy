import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {HEATMAP_SWEEP_VERSION,heatmapSweepCohortId} from './heatmapSweepWatch.js';
import {SECOND_SWEEP_LABEL,SECOND_SWEEP_KEY,isSecondUpperSweep} from '../public/heatmap-second-sweep-model.js';
import {LONG_QUALITY_LABELS,longQualityKey,validLongQuality} from '../public/heatmap-long-quality-model.js';
import {blocksUpperMomentumEntry,UPPER_MOMENTUM_ENTRY_GUARD_VERSION,UPPER_MOMENTUM_BLOCK_STATUS} from './heatmapUpperMomentumEntryGuard.js';
import {blocksLowerMomentumEntry,LOWER_MOMENTUM_ENTRY_GUARD_VERSION,LOWER_MOMENTUM_BLOCK_STATUS} from './heatmapLowerMomentumEntryGuard.js';
export const HEATMAP_LONG_GOOD_ENTRY_VERSION='HEATMAP_LOWER_GOOD_LONG5_5X_TP10_SL30_V1_20261026';
export const HEATMAP_LONG_BAD_ENTRY_VERSION='HEATMAP_LOWER_BAD_LONG1_5X_TP10_SL30_V1_20261026';
const QUALITY_VERSIONS=Object.freeze({[HEATMAP_LONG_GOOD_ENTRY_VERSION]:LONG_QUALITY_LABELS.GOOD,[HEATMAP_LONG_BAD_ENTRY_VERSION]:LONG_QUALITY_LABELS.BAD});
export const HEATMAP_SECOND_SWEEP_ENTRY_VERSION='HEATMAP_SECOND_SWEEP_SHORT10_5X_TP10_SL30_V1_20261025';
export const HEATMAP_SWEEP_SOURCE='heatmap-full-sweep';
export const HEATMAP_SWEEP_ENTRY_VERSION='HEATMAP_FULL_SWEEP_NO_DRIFT_SHORT5_LONG2_5X_TP10_SL30_CAP20_V4_20261023';
export const HEATMAP_SWEEP_PRICE_GUARDED_ENTRY_VERSION='HEATMAP_FULL_SWEEP_SHORT5_LONG2_5X_TP10_SL30_CAP20_V3_20261023';
export const HEATMAP_SWEEP_PREVIOUS_ENTRY_VERSION='HEATMAP_FULL_SWEEP_SHORT3_LONG2_5X_TP10_SL30_CAP20_V2_20261023';
export const HEATMAP_SWEEP_LEGACY_ENTRY_VERSION='HEATMAP_FULL_SWEEP_SHORT3_LONG1_5X_TP10_SL30_CAP20_V1_20261020';
const ENTRY_MARGINS=Object.freeze({
 [HEATMAP_LONG_GOOD_ENTRY_VERSION]:Object.freeze({LONG:5}),
 [HEATMAP_LONG_BAD_ENTRY_VERSION]:Object.freeze({LONG:1}),
 [HEATMAP_SECOND_SWEEP_ENTRY_VERSION]:Object.freeze({SHORT:10}),
 [HEATMAP_SWEEP_ENTRY_VERSION]:Object.freeze({SHORT:5,LONG:2}),
 [HEATMAP_SWEEP_PRICE_GUARDED_ENTRY_VERSION]:Object.freeze({SHORT:5,LONG:2}),
 [HEATMAP_SWEEP_PREVIOUS_ENTRY_VERSION]:Object.freeze({SHORT:3,LONG:2}),
 [HEATMAP_SWEEP_LEGACY_ENTRY_VERSION]:Object.freeze({SHORT:3,LONG:1}),
});
const LEGACY_RULE=Object.freeze({leverage:5,takeProfitRoePct:10,stopLossRoePct:30,maxOpenPositions:20,maxAgeMs:30000,maxPriceDrift:.005});
export const HEATMAP_SWEEP_RULE=Object.freeze({...LEGACY_RULE,maxPriceDrift:null,priceDriftGuardEnabled:false});
export const HEATMAP_SWEEP_ROUTES=Object.freeze([...['SHORT','LONG'].map(side=>Object.freeze({source:HEATMAP_SWEEP_SOURCE,streamId:'live-mark-frozen-clusters',
 signalLabel:side==='SHORT'?'ALL_TRACKED_UPPER_SWEPT':'ALL_TRACKED_LOWER_SWEPT',side})),Object.freeze({source:HEATMAP_SWEEP_SOURCE,streamId:'live-mark-frozen-clusters',signalLabel:SECOND_SWEEP_LABEL,side:'SHORT'}),
 ...[LONG_QUALITY_LABELS.GOOD,LONG_QUALITY_LABELS.BAD].map(signalLabel=>Object.freeze({source:HEATMAP_SWEEP_SOURCE,streamId:'live-mark-frozen-clusters',signalLabel,side:'LONG'}))]);
export const heatmapSweepMargin=(side,label)=>longQualityKey(label)?(side==='LONG'?(label===LONG_QUALITY_LABELS.GOOD?5:1):null):label===SECOND_SWEEP_LABEL?(side==='SHORT'?10:null):['LONG','SHORT'].includes(side)?ENTRY_MARGINS[HEATMAP_SWEEP_ENTRY_VERSION][side]:null;
export const heatmapSweepRouteKey=(side,label)=>{const r=HEATMAP_SWEEP_ROUTES.find(r=>r.side===side&&(!label||r.signalLabel===label));return r?JSON.stringify([r.source,r.streamId,r.signalLabel,r.side]):null;};
export const heatmapLongQualityMode=c=>[LONG_QUALITY_LABELS.GOOD,LONG_QUALITY_LABELS.BAD].some(label=>c?.routes?.[heatmapSweepRouteKey('LONG',label)]?.enabled===true);
const copy=x=>structuredClone(x),epoch=x=>typeof x==='number'?x:Date.parse(x??''),same=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<1e-10;
const directionSide=e=>e.direction==='UPPER'?'SHORT':'LONG';
const rejected=a=>[-4164,-2019].includes(Number(a.errorCode));
const unresolved=a=>['SUBMITTING','UNKNOWN','ERROR_OR_UNKNOWN'].includes(a.status);
const accepted=a=>['SUBMITTED','FILLED','NEW','PARTIALLY_FILLED'].includes(a.status);
// Both directions share 20 slots, but no unrelated strategy consumes this cap.
export function heatmapSweepOpenSlots({positions,fills={},attempts={},now=Date.now(),excludeClientOrderId=null}={}){
 if(!Array.isArray(positions)||positions.some(p=>!Number.isFinite(Number(p.positionAmt))))throw Error('HEATMAP_ACCOUNT_DATA_MISSING');
 if(!fills||typeof fills!=='object'||Array.isArray(fills))throw Error('HEATMAP_AUDIT_DATA_MISSING');
 const live=new Set(positions.filter(p=>Number(p.positionAmt)!==0).map(p=>`${p.symbol}:${Number(p.positionAmt)>0?'LONG':'SHORT'}`)),slots=new Set(),closed=new Set();
 for(const item of Object.values(fills)){
  const r=item?.record??item;if(r?.signalSource!==HEATMAP_SWEEP_SOURCE||!['LONG','SHORT'].includes(r.direction))continue;
  if(r.positionStatus==='CLOSED'){if(r.clientOrderId)closed.add(r.clientOrderId);continue;}
  if(live.has(`${r.symbol}:${r.direction}`))slots.add(r.symbol);
 }
 for(const a of Object.values(attempts)){
  if(a.clientOrderId===excludeClientOrderId||closed.has(a.clientOrderId))continue;
  if(unresolved(a)||accepted(a)&&(live.has(`${a.symbol}:${a.side}`)||now-a.at<120000))slots.add(a.symbol);
 }
 return slots.size;
}
export function validHeatmapSweepSignal(e={}){
 if(!e||e.version!==HEATMAP_SWEEP_VERSION||!['UPPER','LOWER'].includes(e.direction)||e.kind!==`ALL_TRACKED_${e.direction}_SWEPT`
  ||!/^[\p{L}\p{N}]{1,32}USDT$/u.test(e.symbol??'')||!Array.isArray(e.zones)||!e.zones.length||e.zones.length>2000)return false;
 const upper=e.direction==='UPPER';
 if(!['at','observedAt','armedAt','zonesAsOf','cohortExpiresAt','previousTickAt','previousMarkPrice','maxTickGapMs','referencePrice','markPrice','maxDistancePct'].every(k=>Number.isFinite(e[k]))
  ||e.zonesAsOf>=e.armedAt||e.armedAt-e.zonesAsOf>420000||e.zonesAsOf%300000!==299999||e.at<=e.armedAt||e.observedAt<e.at-1000
  ||e.observedAt-e.at>10000||e.at>=e.cohortExpiresAt||e.cohortExpiresAt!==e.armedAt+900000||e.previousTickAt>=e.at||e.previousTickAt<e.armedAt-10000
  ||e.at-e.previousTickAt>10000||e.maxTickGapMs<=0||e.maxTickGapMs>10000||e.referencePrice<=0||e.previousMarkPrice<=0||e.markPrice<=0
  ||e.maxDistancePct<.5||e.maxDistancePct>10||e.clearedCount!==e.zones.length||e.totalCount!==e.zones.length)return false;
 if(e.zones.some((z,i)=>!['low','high','overlapStrength','establishedAt','asOf','clearedAt'].every(k=>Number.isFinite(z[k]))
  ||z.low<=0||z.high<=z.low||z.overlapStrength<35||z.overlapStrength>100.000001||z.persistenceBars!==3||z.asOf!==e.zonesAsOf||z.establishedAt!==e.zonesAsOf-600000
  ||z.cleared!==true||z.touched!==true||z.clearedAt<e.armedAt||z.clearedAt>e.at
  ||(upper?z.low<=e.referencePrice*1.001||z.high>e.referencePrice*(1+e.maxDistancePct/100)||e.markPrice<z.high
    :z.high>=e.referencePrice*.999||z.low<e.referencePrice*(1-e.maxDistancePct/100)||e.markPrice>z.low)
  ||i&&(upper?z.low<=e.zones[i-1].high:z.high>=e.zones[i-1].low)))return false;
 const final=e.zones.at(-1);
 if(upper?e.previousMarkPrice>=final.high:e.previousMarkPrice<=final.low)return false;
 return e.cohortId===heatmapSweepCohortId(e.symbol,e.zonesAsOf,e.zones,e.direction)&&e.id===e.cohortId+':'+e.kind;
}
function fresh(e,{now,enabledAt,startedAt,markPrice,maxPriceDrift=HEATMAP_SWEEP_RULE.maxPriceDrift}){
 const active=epoch(enabledAt),start=epoch(startedAt),mark=Number(markPrice);
 return [now,active,start,mark].every(Number.isFinite)&&active>0&&start>0&&mark>0&&e.armedAt>Math.max(active,start)
  &&e.at>Math.max(active,start)&&e.observedAt<=now+1000&&now-e.at<=30000&&now<e.cohortExpiresAt
  &&(maxPriceDrift===null||Math.abs(mark/e.markPrice-1)<=maxPriceDrift);
}
export function buildHeatmapSweepOrder(e={},options={}){
 const qualityVersion=Object.keys(QUALITY_VERSIONS).find(v=>QUALITY_VERSIONS[v]===options.qualityLabel);
 if(options.qualityLabel&&!qualityVersion)return null;
 return buildSweepOrderForVersion(e,options,qualityVersion??(options.secondSweep===true?HEATMAP_SECOND_SWEEP_ENTRY_VERSION:HEATMAP_SWEEP_ENTRY_VERSION));
}
// Legacy sizing is only used to validate exact stored protection plans,
// never to build or authorize new entries.
function buildSweepOrderForVersion(e,options,version){
 const {now=Date.now(),enabledAt,startedAt,markPrice}=options;
 const second=version===HEATMAP_SECOND_SWEEP_ENTRY_VERSION;
 const quality=QUALITY_VERSIONS[version];
 if(quality&&(!validLongQuality(e)||e.longQuality.label!==quality||e.longQuality.evaluatedAt>now+1000))return null;
 if(second&&!isSecondUpperSweep(e))return null;
 const rule=quality||second||version===HEATMAP_SWEEP_ENTRY_VERSION?HEATMAP_SWEEP_RULE:LEGACY_RULE;
 if(!validHeatmapSweepSignal(e)||!fresh(e,{now,enabledAt,startedAt,markPrice,maxPriceDrift:rule.maxPriceDrift}))return null;
 const direction=directionSide(e),label=quality??(second?SECOND_SWEEP_LABEL:`ALL_TRACKED_${e.direction}_SWEPT`),route=HEATMAP_SWEEP_ROUTES.find(r=>r.side===direction&&r.signalLabel===label),mark=Number(markPrice),sign=direction==='LONG'?1:-1,margin=ENTRY_MARGINS[version]?.[direction];
 if(second&&mark>=e.secondSweep.previousPeak)return null;
 if(!Number.isFinite(margin))return null;
 return {...route,...rule,marginUsdt:margin,notionalUsdt:margin*5,side:sign>0?'BUY':'SELL',symbol:e.symbol,
  signalType:route.signalLabel,signalInterval:'5m',signalStageKey:'ALL_FROZEN_CLUSTERS_SWEPT',executionPage:'coinglass-heatmap-lab',orderType:'MARKET',
  maxOpenPositionsScope:HEATMAP_SWEEP_SOURCE,dryRun:false,allowMinNotionalCeil:false,signalEntryPrice:mark,takeProfitPrice:mark*(1+sign*.02),stopLossPrice:mark*(1-sign*.06),
  takeProfitDistanceFraction:.02,stopLossDistanceFraction:.06,protectionOnFill:true,preserveSignalProtection:true,fillAnchorEnabled:true,fillAnchorVersion:version,
  protectionSignalEntryPrice:mark,protectionSignalTakeProfitPrice:mark*(1+sign*.02),protectionSignalStopLossPrice:mark*(1-sign*.06),
  entryActivationAt:epoch(enabledAt),entryRunnerStartedAt:epoch(startedAt),entryExpiresAt:Math.min(e.cohortExpiresAt,e.at+30000),
  heatmapSweepAtEntry:copy(e),heatmapSweepSignalId:e.id,clientOrderId:'hms_'+createHash('sha256').update(e.id).digest('hex').slice(0,28),
  signalReason:`${version} | ${e.id} | quét hết tập cụm ${e.direction}; không đợi xác nhận đảo chiều`};
}
export function validHeatmapSweepOrder(p={},markPrice=p.signalEntryPrice,now=Date.now()){
 return [HEATMAP_SWEEP_ENTRY_VERSION,HEATMAP_SECOND_SWEEP_ENTRY_VERSION,...Object.keys(QUALITY_VERSIONS)].includes(p.fillAnchorVersion)&&validSweepOrderForVersion(p,markPrice,now,p.fillAnchorVersion);
}
function validSweepOrderForVersion(p,markPrice,now,version){
 if(version===HEATMAP_SECOND_SWEEP_ENTRY_VERSION&&Number(markPrice)>=p.heatmapSweepAtEntry?.secondSweep?.previousPeak)return false;
 if(p.takeProfitLegs?.length)return false;
 const e=p.heatmapSweepAtEntry,r=buildSweepOrderForVersion(e,{now,enabledAt:p.entryActivationAt,startedAt:p.entryRunnerStartedAt,markPrice:p.signalEntryPrice},version);
 return !!r&&fresh(e,{now,enabledAt:p.entryActivationAt,startedAt:p.entryRunnerStartedAt,markPrice,maxPriceDrift:r.maxPriceDrift})
  &&(r.maxPriceDrift===null||Math.abs(Number(markPrice)/p.signalEntryPrice-1)<=r.maxPriceDrift)
  &&['source','streamId','signalLabel','side','symbol','signalType','signalInterval','signalStageKey','executionPage','orderType','clientOrderId','heatmapSweepSignalId',
   'maxOpenPositionsScope','dryRun','allowMinNotionalCeil','protectionOnFill','preserveSignalProtection','fillAnchorEnabled','fillAnchorVersion','maxPriceDrift','priceDriftGuardEnabled'].every(k=>p[k]===r[k])
  &&['marginUsdt','notionalUsdt','leverage','takeProfitRoePct','stopLossRoePct','maxOpenPositions','takeProfitPrice','stopLossPrice','takeProfitDistanceFraction','stopLossDistanceFraction',
   'protectionSignalEntryPrice','protectionSignalTakeProfitPrice','protectionSignalStopLossPrice','entryExpiresAt'].every(k=>same(p[k],r[k]));
}
export class HeatmapSweepBinanceRunner{
 constructor({file,controls,getContext,getFills=async()=>({}),getSecondSweepGate=async()=>({allowed:false}),getLongQualityGate=async()=>({allowed:false}),submit,isProtectionExcluded=()=>false,now=Date.now,startedAt=now(),storage}={}){
  Object.assign(this,{file,controls,getContext,getFills,getSecondSweepGate,getLongQualityGate,submit,isProtectionExcluded,now,startedAt,storage});this.queue=Promise.resolve();this.error=null;
 }
 load(){return this.loading??=this.loadState();}
 async loadState(){if(this.state)return this.state;let s;try{s=this.storage?await this.storage.load():JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(s&&(!Object.hasOwn(ENTRY_MARGINS,s.version)||!s.attempts||Array.isArray(s.attempts)||typeof s.attempts!=='object'
   ||Object.entries(s.attempts).some(([id,a])=>!a||a.id!==id||!['LONG','SHORT'].includes(a.side)||typeof a.symbol!=='string'||!Number.isFinite(a.at)||typeof a.status!=='string')))throw Error('HEATMAP_LEDGER_INVALID');
  return this.state=s??{version:HEATMAP_SWEEP_ENTRY_VERSION,attempts:{}};
 }
 async save(){this.state.version=HEATMAP_SWEEP_ENTRY_VERSION;const s=copy(this.state);if(this.storage)return this.storage.save(s);await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(s));await rename(tmp,this.file);}
 snapshot(){const c=this.controls.read();return {version:HEATMAP_SWEEP_ENTRY_VERSION,...HEATMAP_SWEEP_RULE,lowerMomentumEntryGuardVersion:LOWER_MOMENTUM_ENTRY_GUARD_VERSION,blockLowerContinuation:true,upperMomentumEntryGuardVersion:UPPER_MOMENTUM_ENTRY_GUARD_VERSION,blockUpperContinuation:true,capScope:HEATMAP_SWEEP_SOURCE,shortMarginUsdt:heatmapSweepMargin('SHORT'),longMarginUsdt:heatmapSweepMargin('LONG'),longQualityMode:heatmapLongQualityMode(c),
  openSlots:this.openSlots??null,slotsCheckedAt:this.slotsCheckedAt??null,startedAt:this.startedAt,masterEnabled:c.enabled===true,error:this.error,
  routes:HEATMAP_SWEEP_ROUTES.map(r=>({...r,enabled:c.routes?.[heatmapSweepRouteKey(r.side,r.signalLabel)]?.enabled===true,enabledAt:c.routes?.[heatmapSweepRouteKey(r.side,r.signalLabel)]?.enabledAt??null})),
  attempts:Object.values(this.state?.attempts??{}).sort((a,b)=>b.at-a.at).slice(0,100).map(({plan,...a})=>a)};}
 process(e){const p=this.queue.then(async()=>{const result=await this.processEvent(e),attempt=this.state?.attempts?.[e?.id];
  const margin=ENTRY_MARGINS[attempt?.entryVersion]?.[attempt?.side];
  return margin&&attempt?.entryVersion!==HEATMAP_SWEEP_ENTRY_VERSION?{...result,requestedMarginUsdt:margin}:result;});this.queue=p.catch(()=>{});return p;}
 async processEvent(e){
  try{await this.load();}catch{this.error='HEATMAP_LEDGER_UNAVAILABLE';return {status:'STATE_ERROR'};}
  if(this.error)return {status:'STATE_ERROR'};
  if(!validHeatmapSweepSignal(e))return {status:'INELIGIBLE'};
  if(this.state.attempts[e.id])return {status:'DEDUPED'};
  if(blocksLowerMomentumEntry(e)){
   this.state.attempts[e.id]={id:e.id,symbol:e.symbol,side:'LONG',at:this.now(),status:LOWER_MOMENTUM_BLOCK_STATUS,entryGuardVersion:LOWER_MOMENTUM_ENTRY_GUARD_VERSION,
    lowerMomentum:copy(e.lowerMomentum),reason:'CÒN ĐÀ XẢ: chặn LONG mới, kể cả nhóm tốt5/xấu1; vẫn gửi Discord. Không sửa vị thế cũ/SL/TP.'};
   try{await this.save();return {status:LOWER_MOMENTUM_BLOCK_STATUS};}catch{this.error='HEATMAP_LEDGER_UNAVAILABLE';return {status:'STATE_ERROR'};}
  }
  const side=directionSide(e),c=this.controls.read(),second=isSecondUpperSweep(e)&&c.routes?.[heatmapSweepRouteKey('SHORT',SECOND_SWEEP_LABEL)]?.enabled===true;
  const qualityMode=side==='LONG'&&heatmapLongQualityMode(c),qualityLabel=qualityMode&&validLongQuality(e)?longQualityKey(e.longQuality.label)&&e.longQuality.label:null;
  if(qualityMode&&!qualityLabel)return {status:'LONG_QUALITY_UNKNOWN',qualityMode:true};
  const key=heatmapSweepRouteKey(side,qualityLabel||(second?SECOND_SWEEP_LABEL:undefined)),setting=c.routes?.[key];
  if(!c.enabled||setting?.enabled!==true)return {status:'OFF'};
  if(!fresh(e,{now:this.now(),enabledAt:setting.enabledAt,startedAt:this.startedAt,markPrice:e.markPrice}))return {status:'PRE_ENABLE_OR_STALE'};
  const entryVersion=qualityLabel?Object.keys(QUALITY_VERSIONS).find(v=>QUALITY_VERSIONS[v]===qualityLabel):second?HEATMAP_SECOND_SWEEP_ENTRY_VERSION:HEATMAP_SWEEP_ENTRY_VERSION;
  const a={id:e.id,symbol:e.symbol,side,entryVersion,at:this.now(),status:'CHECKING'};this.state.attempts[e.id]=a;
  try{await this.save();}catch{this.error='HEATMAP_LEDGER_UNAVAILABLE';return {status:'STATE_ERROR'};}
  try{
   let reason=blocksUpperMomentumEntry(e)?UPPER_MOMENTUM_BLOCK_STATUS:this.isProtectionExcluded(e.symbol)?'PROTECTION_DISABLED':Object.values(this.state.attempts).some(x=>x.id!==e.id&&x.symbol===e.symbol&&unresolved(x))?'UNRESOLVED_PREVIOUS_ORDER':null;
   if(reason===UPPER_MOMENTUM_BLOCK_STATUS){a.upperMomentum=copy(e.upperMomentum);a.entryGuardVersion=UPPER_MOMENTUM_ENTRY_GUARD_VERSION;a.reason='CÒN ĐÀ BƠM: tắt SHORT tự động; vẫn gửi Discord, không sửa vị thế cũ.';}
   if(!reason&&second&&(await this.getSecondSweepGate()).allowed!==true)reason='SECOND_SWEEP_WHITELIST_OR_AVG_ROE';
   if(!reason&&qualityLabel&&(await this.getLongQualityGate(qualityLabel)).allowed!==true)reason='LONG_QUALITY_WHITELIST_OR_AVG_ROE';
   const ctx=reason?null:await this.getContext(e.symbol);
   if(!reason&&ctx?.enabled!==true)reason='RUNTIME_OFF';
   if(!reason&&(!Array.isArray(ctx.positions)||!Array.isArray(ctx.openOrders)||ctx.positions.some(p=>!Number.isFinite(Number(p.positionAmt)))))reason='ACCOUNT_DATA_MISSING';
   if(!reason&&ctx.positions.some(p=>p.symbol===e.symbol&&Number(p.positionAmt)!==0))reason='EXISTING_POSITION';
   if(!reason&&ctx.openOrders.some(o=>o.symbol===e.symbol&&![true,'true'].includes(o.reduceOnly)&&![true,'true'].includes(o.closePosition)))reason='EXISTING_ORDER';
   if(!reason){this.openSlots=heatmapSweepOpenSlots({positions:ctx.positions,fills:await this.getFills(),attempts:this.state.attempts,now:this.now()});this.slotsCheckedAt=this.now();if(this.openSlots>=20)reason='MAX_HEATMAP_SWEEP_20';}
   const latest=this.controls.read();if(!reason&&(!latest.enabled||latest.routes?.[key]?.enabled!==true||latest.routes[key].enabledAt!==setting.enabledAt))reason='CONTROL_CHANGED';
   if(!reason&&side==='LONG'&&heatmapLongQualityMode(latest)!==qualityMode)reason='CONTROL_CHANGED';
   const plan=reason?null:buildHeatmapSweepOrder(e,{now:this.now(),enabledAt:setting.enabledAt,startedAt:this.startedAt,markPrice:ctx.markPrice,secondSweep:second,qualityLabel});
   if(!reason&&!plan)reason='PRICE_OR_AGE_BLOCKED';
   if(reason){a.status=reason;await this.save();return {status:reason};}
   if(second){const gate=await this.getSecondSweepGate();if(gate.allowed!==true){a.status='SECOND_SWEEP_WHITELIST_OR_AVG_ROE';await this.save();return {status:a.status};}a.whitelistAtEntry={...gate,key:SECOND_SWEEP_KEY,checkedAt:this.now()};}
   if(qualityLabel){const gate=await this.getLongQualityGate(qualityLabel);if(gate.allowed!==true){a.status='LONG_QUALITY_WHITELIST_OR_AVG_ROE';await this.save();return {status:a.status};}a.whitelistAtEntry={...gate,key:longQualityKey(qualityLabel),checkedAt:this.now()};}
   this.controls.assertEntry(plan);a.plan=copy(plan);a.planBuiltAt=this.now();a.clientOrderId=plan.clientOrderId;a.status='SUBMITTING';await this.save();
   const r=await this.submit(plan,ctx);a.status=String(r?.status??'UNKNOWN').toUpperCase();a.orderId=r?.orderResult?.orderId??null;await this.save();return {status:a.status,orderId:a.orderId,side,marginUsdt:plan.marginUsdt};
  }catch(error){a.reason=String(error.message??'Không rõ kết quả').slice(0,220);a.errorCode=error.code!=null&&Number.isFinite(Number(error.code))?Number(error.code):null;
   a.status=error.code==='CAUSAL_SIGNAL_RESERVATION'?'SHARED_ENTRY_RESERVED':error.beforeHeatmapMarket===true?'PREFLIGHT_REJECTED'
    :accepted(a)?'ERROR_OR_UNKNOWN':a.status!=='SUBMITTING'?'PREFLIGHT_REJECTED':rejected(a)?'EXCHANGE_REJECTED':'ERROR_OR_UNKNOWN';
   try{await this.save();}catch{this.error='HEATMAP_LEDGER_UNAVAILABLE';}return {status:a.status};}
 }
 async protectionPlanFor({symbol,side,orderId,clientOrderId}={}){await this.load();if(!orderId||!clientOrderId)return null;
  const direction=['BUY','LONG'].includes(side)?'LONG':['SELL','SHORT'].includes(side)?'SHORT':null;
  const a=Object.values(this.state.attempts).find(a=>a.symbol===symbol&&a.side===direction&&a.clientOrderId===String(clientOrderId)&&(!a.orderId||String(a.orderId)===String(orderId))
   &&['SUBMITTING','SUBMITTED','FILLED','NEW','PARTIALLY_FILLED','UNKNOWN','ERROR_OR_UNKNOWN'].includes(a.status));
  const version=a?.plan?.fillAnchorVersion;
  return Object.hasOwn(ENTRY_MARGINS,version)
   &&validSweepOrderForVersion(a.plan,a.plan.signalEntryPrice,a.planBuiltAt,version)?copy(a.plan):null;
 }
}
