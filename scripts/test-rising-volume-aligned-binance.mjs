import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {evaluateRisingVolume} from '../src/risingVolume.js';
import {risingVolumeEntryId,RisingVolumeBinanceRunner,RISING_VOLUME_ROUTES,RISING_VOLUME_ALIGNED_ROUTES,
 buildRisingVolumeMarketOrder,validRisingVolumeOrder,RISING_VOLUME_ALIGNED_LONG_VERSION} from '../src/risingVolumeBinance.js';
import {buildRisingVolumeAlignedProof,validRisingVolumeAlignedProof,RISING_VOLUME_ALIGNED_VERSION} from '../src/risingVolumeAlignedProof.js';
import {RISING_VOLUME_CONTEXT_VERSION} from '../src/risingVolumeContext.js';
import {authorizeRisingVolumeOrder,evaluateAutoBinanceEntryPolicy} from '../src/autoBinancePolicy.js';
import {AutoEntryControls} from '../src/autoEntryControls.js';
import {flowRows,flowTestNow} from './rising-volume-flow-fixtures.mjs';

const base=flowTestNow+2*60000;
const fixture=(side,symbol='ONUSDT')=>{
 const rows=flowRows({side,now:base});
 const s=evaluateRisingVolume({symbol,interval:'1m',rows,rows1m:rows,now:base}).signal;
 const e={id:risingVolumeEntryId(s),snapshot:s};
 const decision=s.closedAt+1, modelAt=Math.floor(decision/300000)*300000;
 const zone=side==='LONG'?{low:s.price*1.02,high:s.price*1.025,overlapStrength:60}:{low:s.price*.975,high:s.price*.98,overlapStrength:60};
 const ctx={version:RISING_VOLUME_CONTEXT_VERSION,id:e.id,symbol,side,state:'ALIGNED',at:decision,decisionAt:decision,
  model:{at:modelAt,price:s.price,upperScore:side==='LONG'?100:10,lowerScore:side==='SHORT'?100:10,
   above:side==='LONG'?zone:null,below:side==='SHORT'?zone:null},
  position:{at:decision,point:{whaleCount:100,sourceAt:decision-30000,observedAt:decision-20000,whaleLong:side==='LONG'?70:30,smartLong:side==='LONG'?72:27}}};
 return {e,ctx,proof:buildRisingVolumeAlignedProof(e,ctx,base+2000)};
};
const {e,ctx,proof}=fixture('LONG'), short=fixture('SHORT','ARKUSDT');
assert.ok(proof&&short.proof);
const early=proof.entryAt-1,at=proof.entryAt+500;
assert.equal(validRisingVolumeAlignedProof(e,proof,early),false);
assert.equal(validRisingVolumeAlignedProof(e,proof,at),true);
assert.equal(validRisingVolumeAlignedProof(e,proof,proof.entryAt+20001),false);
assert.equal(buildRisingVolumeAlignedProof(e,{...ctx,state:'WAIT'},base+2000),null);
assert.equal(buildRisingVolumeAlignedProof(e,{...ctx,at:ctx.at+1},base+2000),null);
assert.equal(buildRisingVolumeAlignedProof(e,{...ctx,position:{...ctx.position,point:{...ctx.position.point,observedAt:ctx.at+1}}},base+2000),null);
assert.equal(buildRisingVolumeAlignedProof(e,ctx,e.snapshot.closedAt+70001),null);
assert.equal(validRisingVolumeAlignedProof(e,{...proof,upperScore:5},at),false);
assert.equal(validRisingVolumeAlignedProof(e,{...proof,whale:{...proof.whale,longPct:59}},at),false);
const options={now:at,enabledAt:base-20000,startedAt:base-30000};
for(const x of [{e,proof},short]){
 const plan=buildRisingVolumeMarketOrder(x.e,{...options,markPrice:x.e.snapshot.price,alignedProof:x.proof});
 assert.ok(plan);
 const margin=x.e.snapshot.side==='LONG'?5:2;
 assert.equal(plan.fillAnchorVersion,margin===5?RISING_VOLUME_ALIGNED_LONG_VERSION:RISING_VOLUME_ALIGNED_VERSION);
 assert.deepEqual([plan.marginUsdt,plan.leverage,plan.notionalUsdt,plan.takeProfitRoePct,plan.stopLossRoePct],[margin,3,margin*3,5,20]);
 assert.ok(Math.abs(plan.takeProfitDistanceFraction-1/60)<1e-9&&Math.abs(plan.stopLossDistanceFraction-1/15)<1e-9);
 assert.equal(plan.allowMinNotionalCeil,false);
 assert.equal(validRisingVolumeOrder(plan,x.e.snapshot.price,at),true);
 assert.equal(validRisingVolumeOrder({...plan,marginUsdt:3},x.e.snapshot.price,at),false);
 assert.equal(validRisingVolumeOrder(plan,x.e.snapshot.price*1.006,at),false);
 assert.equal(evaluateAutoBinanceEntryPolicy({payload:plan,orderEnabled:true,now:at}).allowed,false);
 assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeRisingVolumeOrder(plan),orderEnabled:true,now:at}).allowed,true);
 assert.equal(validRisingVolumeOrder({...plan,risingVolumeAlignedProof:null},x.e.snapshot.price,at),false);
}
const key=r=>JSON.stringify([r.source,r.streamId,r.signalLabel,r.side]);
const dir=await mkdtemp(join(tmpdir(),'volume-aligned-'));
const originalNow=Date.now;
try{
 let now=at;Date.now=()=>now;
 const controls=new AutoEntryControls(join(dir,'controls.json'));
 controls.seed([...RISING_VOLUME_ROUTES,...RISING_VOLUME_ALIGNED_ROUTES]);
 controls.update({action:'master',enabled:true});
 const loaded=controls.read();
 for(const r of RISING_VOLUME_ALIGNED_ROUTES){
  assert.equal(loaded.routes[key(r)].enabled,false);
  loaded.routes[key(r)].enabled=true;
  loaded.routes[key(r)].enabledAt=new Date(base-20000).toISOString();
 }
 controls.save(loaded);
 let data=null,submits=0,lookups=0,qtyFailure=false;
 const runner=new RisingVolumeBinanceRunner({controls,now:()=>now,startedAt:base-30000,
  storage:{load:async()=>data,save:async s=>{data=s;}},
  getRatioRows:async()=>{throw Error('aligned does not request ratio');},
  getContext:async symbol=>{lookups++;return {enabled:true,positions:[],openOrders:[],markPrice:symbol===e.snapshot.symbol?e.snapshot.price:short.e.snapshot.price};},
  checkAlignedQuantity:async()=>qtyFailure?'MIN_NOTIONAL_OR_LOT_BLOCKED':null,
  submit:async plan=>{
   submits++;assert.equal(data.attempts[e.id+'|aligned'].status,'SUBMITTING');
   assert.equal(plan.notionalUsdt,15);
   return {status:'FILLED',orderResult:{orderId:987}};
  }});
 now=early;
 assert.equal((await runner.process(e,proof)).status,'pre-enable-or-stale');
 assert.equal(lookups,0);
 now=at;
 assert.equal((await runner.process(e,proof)).status,'FILLED');
 assert.equal((await runner.process(e,proof)).status,'deduped');
 assert.equal(submits,1);
 assert.equal((await runner.protectionPlanFor({symbol:e.snapshot.symbol,side:'BUY',orderId:987,
  clientOrderId:data.attempts[e.id+'|aligned'].clientOrderId})).stopLossRoePct,20);
 const storedLong=data.attempts[e.id+'|aligned'];
 const recoveryIdentity={symbol:e.snapshot.symbol,side:'BUY',orderId:987,clientOrderId:storedLong.clientOrderId};
 const oldPlan={...storedLong.plan,fillAnchorVersion:RISING_VOLUME_ALIGNED_VERSION,marginUsdt:2,notionalUsdt:6};
 assert.equal(validRisingVolumeOrder(oldPlan,e.snapshot.price,at),false);
 assert.throws(()=>controls.assertEntry(oldPlan),/chặn MARKET/);
 const recovery=new RisingVolumeBinanceRunner({controls,now:()=>now,storage:{
  load:async()=>({...data,attempts:{[e.id+'|aligned']:{...storedLong,marginUsdt:2,plan:oldPlan}}}),
 }});
 assert.deepEqual(await recovery.protectionPlanFor(recoveryIdentity),oldPlan);
 assert.equal(await recovery.protectionPlanFor({...recoveryIdentity,orderId:999}),null);
 const routes=runner.managementSnapshot().routes.filter(r=>r.streamId==='closed-1m-sustained-aligned');
 assert.deepEqual(routes.map(r=>[r.side,r.marginUsdt]),[['LONG',5],['SHORT',2]]);
 qtyFailure=true;
 assert.equal((await runner.process(short.e,short.proof)).status,'MIN_NOTIONAL_OR_LOT_BLOCKED');
 assert.equal(submits,1);
 const prior=new RisingVolumeBinanceRunner({controls,now:()=>now,startedAt:base-30000,storage:{
  load:async()=>({...data,attempts:{[e.id]:{status:'SUBMITTED',clientOrderId:'prior'}}}),save:async()=>{}}});
 assert.equal((await prior.process(e,proof)).status,'deduped-other-route');
}finally{Date.now=originalNow;await rm(dir,{recursive:true,force:true});}
console.log('PASS aligned LONG/SHORT causal proof, first 5m deadline, route/size/TP/SL auth, no ratio IO, min-notional, durable dedupe and exact protection recovery.');

