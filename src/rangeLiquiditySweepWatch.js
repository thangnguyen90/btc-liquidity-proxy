import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';import {dirname} from 'node:path';
import {armRangeSweep,advanceRangeSweep,inspectRangeSweepFlow,RANGE_SWEEP_VERSION,RANGE_SWEEP_RULE,RANGE_SWEEP_DATA_VERSION} from './rangeLiquiditySweepModel.js';
import {classifyRangeSweepContext,RANGE_SWEEP_CONTEXT_VERSION,RANGE_SWEEP_ENTRY_VERSION,RANGE_SWEEP_DECISION_VERSION,assessRangeSweepSignal} from './rangeSweepCombinedContext.js';
export class RangeLiquiditySweepWatch{
 constructor({file,getRows=()=>[],getBaseRows=()=>null,seedFlow=null,subscribeFlow=null,getFlowStreamCoverage=null,classifyColor=null,getAnalysis=null,filterConfirmed=false,blocked=()=>false,discordSender=null,now=Date.now}={}){Object.assign(this,{file,getRows,getBaseRows,seedFlow,subscribeFlow,getFlowStreamCoverage,classifyColor,getAnalysis,filterConfirmed,blocked,discordSender,now});this.startedAt=now();this.cohorts=new Map();this.history=[];this.cooldowns={};this.queue=Promise.resolve();this.error=null;this.ready=false;this.bundles=0;this.rejected=0;this.rejectionReasons={};this.rejectionSamples={};this.armedTotal=0;this.tickInvalidations={};this.pending=0;this.minuteSends=[];this.flowRepair={busy:false,attempted:0,refreshed:0,failed:0,lastAt:null,lastSymbol:null};this.flowRepairAttempts=new Map();this.flowSymbols=new Map();this.flowStream={symbols:0,lastSyncAt:null};}
 async init(){if(this.initPromise)return this.initPromise;return this.initPromise=(async()=>{try{const s=JSON.parse(await readFile(this.file,'utf8'));if(s.version!==RANGE_SWEEP_VERSION||!Array.isArray(s.history)||!s.cooldowns)throw Error('INVALID_STATE');this.history=s.history.filter(e=>e?.version===RANGE_SWEEP_VERSION&&Number.isFinite(e.at)&&this.now()-e.at<14*86400000).slice(-500);this.cooldowns=s.cooldowns;}catch(e){if(e.code!=='ENOENT')this.error='STATE_UNAVAILABLE_NO_SEND';}this.ready=true;})();}
 arm(bundle,point){if(!this.ready||this.error||!this.discordSender)return;this.bundles++;const symbol=bundle?.models?.[0]?.data?.symbol,current=this.cohorts.get(symbol),now=this.now();
  if(current&&!current.done&&current.expiresAt>now)return;
  if(current&&now-current.armedAt<1800000)return;
  const diagnostic={},cohort=armRangeSweep(bundle,point,now,this.getBaseRows(symbol),diagnostic);if(!cohort){this.rejected++;const reason=diagnostic.reason??"UNSPECIFIED";this.rejectionReasons[reason]=(this.rejectionReasons[reason]??0)+1;this.rejectionSamples[reason]={symbol,at:now,...diagnostic.metrics};return;}
  this.armedTotal++;
  this.cohorts.set(cohort.symbol,cohort);while(this.cohorts.size>700)this.cohorts.delete(this.cohorts.keys().next().value);
 }
 onMark(tick){if(!this.ready||this.error)return;const c=this.cohorts.get(tick.symbol);if(!c||c.done||this.now()>=c.expiresAt)return;
  const events=advanceRangeSweep(c,{price:Number(tick.markPrice),at:Number(tick.eventTime)},this.getRows(tick.symbol),this.now());
  if(c.invalidReason)this.tickInvalidations[c.invalidReason]=(this.tickInvalidations[c.invalidReason]??0)+1;
  for(const event of events){if(this.pending>=60)continue;this.pending++;this.queue=this.queue.then(()=>this.record(event)).catch(()=>{this.error='STATE_OR_DELIVERY_UNAVAILABLE';}).finally(()=>this.pending--);}
 }
 async save(){const now=this.now();this.history=this.history.filter(e=>now-e.at<14*86400000).slice(-500);this.cooldowns=Object.fromEntries(Object.entries(this.cooldowns).filter(([,at])=>Number.isFinite(at)&&now-at<3600000));if(!this.file)return;
  await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify({version:RANGE_SWEEP_VERSION,history:this.history,cooldowns:this.cooldowns}));await rename(tmp,this.file);
 }
 async record(event){if(this.error)return;const now=this.now(),key=event.symbol+':'+event.kind+':'+event.side;
  if(this.history.some(e=>e.id===event.id)||now-(this.cooldowns[key]??0)<1800000)return;
  this.minuteSends=this.minuteSends.filter(at=>now-at<60000);
  const stale=now-event.at>30000,limited=this.minuteSends.length>=30,dataMissing=event.side==='UNKNOWN'&&!event.flow;
  event=structuredClone({...event,delivery:{status:stale?'EXPIRED':dataMissing?'DATA_NOT_READY':limited?'RATE_LIMITED':'PENDING'}});this.history.push(event);this.cooldowns[key]=now;await this.save();
  if(stale||limited||dataMissing)return;
  if(this.classifyColor){try{event.longConfluence=await this.classifyColor(event);}catch{event.longConfluence={qualified:false,reason:'POSITION_LOOKUP_UNAVAILABLE'};}await this.save();}
  if((this.getAnalysis||this.filterConfirmed)&&event.kind==='DIRECTION_CONFIRMED'&&['LONG','SHORT'].includes(event.side)){
   let timer;
   const waitMs=Math.max(1,Math.min(2500,30000-(this.now()-event.at)));
   try{event.analysis=await Promise.race([Promise.resolve().then(()=>this.getAnalysis?.(structuredClone(event))),
    new Promise(resolve=>{timer=setTimeout(()=>resolve(null),waitMs);})]);}
   catch{}finally{clearTimeout(timer);}
   event.analysis??=classifyRangeSweepContext(event,{at:this.now()});
   await this.save();
  }
  if(this.filterConfirmed&&event.kind==='DIRECTION_CONFIRMED'&&['LONG','SHORT'].includes(event.side)){
   const cohort=this.cohorts.get(event.symbol),current=cohort&&cohort.id===event.cohortId
    ?{price:cohort.lastPrice,at:cohort.lastTickAt,done:cohort.done,invalidReason:cohort.invalidReason,touchedAt:cohort.touchedAt}
    :{price:event.price,at:event.at};
   event.assessment=assessRangeSweepSignal(event,{at:this.now(),current});
   if(event.assessment?.outcome!=='SEND'){
    event.delivery={status:'FILTERED',at:this.now(),reasonCode:event.assessment?.reasonCode??'ASSESSMENT_UNAVAILABLE'};
    await this.save();return;
   }
   await this.save();
  }
  if(this.now()-event.at>30000){event.delivery={status:'EXPIRED'};await this.save();return;}this.minuteSends.push(this.now());
  try{const r=await this.discordSender(event);event.delivery={...r,status:r.sent>0?'SENT':'FAILED',at:this.now()};}catch{event.delivery={status:'UNKNOWN',at:this.now()};}
  await this.save();
 }
 start(){if(this.timer||!this.seedFlow||!this.discordSender)return;this.timer=setInterval(()=>void this.repairFlow(),10000);this.timer.unref?.();}
 syncFlow(){if(!this.subscribeFlow||!this.ready||this.error)return;const now=this.now();for(const c of this.cohorts.values())if(!c.done&&c.expiresAt>now)this.flowSymbols.set(c.symbol,now+3600000);for(const [s,until]of this.flowSymbols)if(until<=now)this.flowSymbols.delete(s);while(this.flowSymbols.size>700)this.flowSymbols.delete(this.flowSymbols.keys().next().value);if(this.flowStream.lastSyncAt!=null&&now-this.flowStream.lastSyncAt<60000&&this.flowStream.symbols>0)return;try{const symbols=[...this.flowSymbols.keys()];this.flowStream={...this.subscribeFlow(symbols),symbols:symbols.length,lastSyncAt:now};}catch{this.flowStream.error='SUBSCRIPTION_FAILED';}}
 async repairFlow(){this.syncFlow();const stats=this.flowRepair,now=this.now();if(!this.ready||this.error||stats.busy||!this.seedFlow||this.blocked()||stats.lastAt!=null&&now-stats.lastAt<10000)return;const symbol=this.flowPrioritySymbols().find(s=>!['LAST_MINUTE_ZERO_VOLUME','BASELINE_ZERO_VOLUME'].includes(inspectRangeSweepFlow(this.getRows(s),now).reason)&&now-(this.flowRepairAttempts.get(s)??0)>=60000);if(!symbol)return;stats.busy=true;stats.lastAt=now;stats.lastSymbol=symbol;stats.attempted++;this.flowRepairAttempts.set(symbol,now);try{await this.seedFlow(symbol);if(inspectRangeSweepFlow(this.getRows(symbol),this.now()).status==='READY')stats.refreshed++;else stats.failed++;}catch{stats.failed++;}finally{stats.busy=false;}}
 flowCoverage(){const now=this.now(),active=[...this.cohorts.values()].filter(c=>!c.done&&c.expiresAt>now),reasons={},samples=[];let ready=0;for(const c of active){const {flow,...d}=inspectRangeSweepFlow(this.getRows(c.symbol),now);if(d.status==='READY')ready++;else reasons[d.reason]=(reasons[d.reason]??0)+1;if(samples.length<12&&d.status!=='READY')samples.push({symbol:c.symbol,...d});}return {active:active.length,ready,unavailable:active.length-ready,reasons,samples};}
 flowPrioritySymbols(){const now=this.now();return [...this.cohorts.values()].filter(c=>!c.done&&c.expiresAt>now&&inspectRangeSweepFlow(this.getRows(c.symbol),now).status!=='READY').sort((a,b)=>Number(!!b.direction)-Number(!!a.direction)||Math.min(Math.abs(a.high-a.lastPrice),Math.abs(a.lastPrice-a.low))/a.atr-Math.min(Math.abs(b.high-b.lastPrice),Math.abs(b.lastPrice-b.low))/b.atr||a.armedAt-b.armedAt).map(c=>c.symbol);}
 snapshot(id=null){const now=this.now();return structuredClone({version:RANGE_SWEEP_VERSION,dataVersion:RANGE_SWEEP_DATA_VERSION,observeOnly:true,affectsOrders:false,startedAt:this.startedAt,error:this.error,discordConfigured:!!this.discordSender,ready:this.ready,policy:RANGE_SWEEP_RULE,analysisPolicy:{version:RANGE_SWEEP_CONTEXT_VERSION,entryVersion:RANGE_SWEEP_ENTRY_VERSION,kind:'DIRECTION_CONFIRMED',budgetMs:2500},colorPolicy:{version:'RANGE_SWEEP_LONG_POSITION_ZONE_PURPLE_V1_20261031',purple:'LONG + Position ratio tăng 15m + điểm vùng >=50',ratioLagMs:300000},deliveryPolicy:{combinedConfirmed:{version:RANGE_SWEEP_DECISION_VERSION,enabled:this.filterConfirmed,sendOnly:'COMBINED_QUALIFIED',persistFilteredReasons:true},suppressUnknownWithoutFlow:true,greyRequiresValidFlow:true,noHistoryReplay:true},flowStream:{...this.flowStream,live:this.getFlowStreamCoverage?.([...this.flowSymbols.keys()])??null},flowCoverage:this.flowCoverage(),flowRepair:{...this.flowRepair,maxPer10Seconds:1,maxInFlight:1,retryMs:60000},coverage:{armedTotal:this.armedTotal,rejectionReasons:this.rejectionReasons,rejectionSamples:this.rejectionSamples,tickInvalidations:this.tickInvalidations,bundles:this.bundles,rejected:this.rejected,active:[...this.cohorts.values()].filter(c=>!c.done&&c.expiresAt>now).length,tracked:this.cohorts.size,pending:this.pending},watches:[...this.cohorts.values()].filter(c=>!c.done&&c.expiresAt>now).map(({base,...c})=>c),history:this.history.slice(-50).reverse(),selected:id?this.history.find(e=>e.id===id)??null:null});}
}
