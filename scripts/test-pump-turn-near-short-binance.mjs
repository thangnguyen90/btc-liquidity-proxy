import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {STEP,plannedPumpZones,livePumpZone} from '../public/pump-turn-model.js';
import {PumpTurnWatch} from '../src/pumpTurnWatch.js';
import {PumpTurnNearShortRunner,buildPumpTurnNearOrder,validPumpTurnNearOrder,validPumpTurnNearSignal,PUMP_TURN_NEAR_SOURCE,PUMP_TURN_NEAR_ROUTE,pumpTurnNearRouteKey,PUMP_TURN_NEAR_ENTRY_VERSION,pumpTurnNearOpenSlots} from '../src/pumpTurnNearShortBinance.js';
import {AutoEntryControls} from '../src/autoEntryControls.js';
import {authorizePumpTurnNearOrder,evaluateAutoBinanceEntryPolicy} from '../src/autoBinancePolicy.js';
import {shouldSuppressBotShortStopLoss,resolveNonLiquidFlowV2TakeProfit} from '../src/shortTakeProfitPolicy.js';
import {resolveFillAnchoredProtectionPrices,resolveSignalProtectionWorkingTypes} from '../src/liveCardSignalProtection.js';
import {resolveOrdersManualTakeProfit,isManualShortProtectionSource} from '../src/shortTakeProfitPolicy.js';
import {buildClosePositionProtectionParams,BINANCE_CLOSE_POSITION_PROTECTION_VERSION} from '../src/binanceClosePositionProtection.js';
import {hasOpenProtectionOrder} from '../src/protectionOrderGuard.js';
import {buildBinanceFilledSignalAuditRecord} from '../src/binanceFilledSignalAudit.js';
const end=Math.floor(Date.now()/STEP)*STEP,now=end+10000,start=now-5000;
const preRows=Array.from({length:72},(_,i)=>({t:end-(72-i)*STEP,end:end-(71-i)*STEP-1,o:i<60?100:118,c:i<60?100:118,h:i<60?101:120,l:i<60?99:117,q:100000,v:1000,buy:50000}));
const plan=plannedPumpZones('TESTUSDT',preRows)[1],price=plan.zoneHigh*1.003;
const e={...livePumpZone(plan,{price,at:now-50},now),id:'pump-turn-near:'+plan.id,chart:undefined,preRows,observedAt:now,nearPct:.75};
assert.equal(validPumpTurnNearSignal(e),true);const p=buildPumpTurnNearOrder(e,{now,enabledAt:start,startedAt:start,markPrice:price});assert.ok(p);
assert.equal(validPumpTurnNearOrder(p,price,now),true);
assert.equal(p.marginUsdt,2);assert.equal(p.notionalUsdt,10);assert.equal(p.leverage,5);assert.equal(p.takeProfitPrice,price*.98);assert.equal(p.stopLossPrice,price*1.06);
assert.equal(p.allowMinNotionalCeil,false);assert.equal(p.maxOpenPositions,20);assert.equal(p.maxOpenPositionsScope,PUMP_TURN_NEAR_SOURCE);
for(const change of [{marginUsdt:3},{leverage:10},{stopLossRoePct:25},{takeProfitRoePct:6},{takeProfitPrice:1},{stopLossPrice:1},{notionalUsdt:20},{side:'BUY'},{source:'heatmap-sweep'},
 {entryExpiresAt:now+60000},{protectionOnFill:false},{preserveSignalProtection:false},{allowMinNotionalCeil:true},{clientOrderId:'fake'},
 {maxOpenPositions:30},{maxOpenPositions:19},{maxOpenPositionsScope:undefined},{maxOpenPositionsScope:'GLOBAL'}])assert.equal(validPumpTurnNearOrder({...p,...change},price,now),false,JSON.stringify(change));
for(const change of [{side:'LONG'},{preRows:preRows.slice(1)},{zoneHigh:999},{state:'FAR'},{expiresAt:now+10000000},{observedAt:preRows.at(-1).end},{id:'fake'}])assert.equal(validPumpTurnNearSignal({...e,...change}),false);
assert.equal(validPumpTurnNearOrder(p,price,now+31000),false);assert.equal(validPumpTurnNearOrder(p,price*1.006,now),false);
assert.equal(buildPumpTurnNearOrder(e,{now,enabledAt:now,startedAt:start,markPrice:price}),null);
assert.equal(buildPumpTurnNearOrder(e,{now,enabledAt:start,startedAt:now,markPrice:price}),null);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:p,orderEnabled:true,now}).allowed,false);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizePumpTurnNearOrder(p),orderEnabled:true,now}).allowed,true);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:structuredClone(authorizePumpTurnNearOrder(p)),orderEnabled:true,now}).allowed,false);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizePumpTurnNearOrder(p),orderEnabled:false,now}).allowed,false);
assert.equal(shouldSuppressBotShortStopLoss({side:'SELL',source:p.source}),false);assert.equal(shouldSuppressBotShortStopLoss({side:'SELL',source:'other-bot'}),true);
const tp=resolveNonLiquidFlowV2TakeProfit({side:'SELL',source:p.source,entryPrice:price,leverage:5,takeProfitPrice:p.takeProfitPrice});assert.equal(tp.applied,false,'generic TP6 must not override TP10');
const anchored=resolveFillAnchoredProtectionPrices({side:'SELL',fillPrice:120,signalEntryPrice:price,signalTakeProfitPrice:p.takeProfitPrice,signalStopLossPrice:p.stopLossPrice,fillAnchorEnabled:true,takeProfitDistanceFraction:.02,stopLossDistanceFraction:.06});
assert.equal(anchored.rebased,true);assert.equal(anchored.takeProfitPrice,117.6);assert.equal(anchored.stopLossPrice,127.2);
const others=Array.from({length:60},(_,i)=>({symbol:`OTHER${i}USDT`,positionAmt:i%2?1:-1}));
assert.equal(pumpTurnNearOpenSlots({positions:others}),0,'60 unrelated positions do not consume this quota');
const ownPositions=Array.from({length:20},(_,i)=>({symbol:`OWN${i}USDT`,positionAmt:-1}));
const ownFills=Object.fromEntries(ownPositions.map((v,i)=>[i,{record:{symbol:v.symbol,direction:'SHORT',signalSource:PUMP_TURN_NEAR_SOURCE,positionStatus:'OPEN',clientOrderId:`ptns_own${i}`}}]));
const ownAttempts=Object.fromEntries(ownPositions.map((v,i)=>[i,{id:String(i),symbol:v.symbol,side:'SHORT',status:'SUBMITTING',clientOrderId:`ptns_own${i}`,at:now}]));
assert.equal(pumpTurnNearOpenSlots({positions:[...others,...ownPositions],fills:ownFills,attempts:ownAttempts,now}),20,'dedupe live fill and reservation by coin');
assert.equal(pumpTurnNearOpenSlots({positions:[],attempts:ownAttempts,now}),20,'in-flight entries reserve slots before position appears');
assert.equal(pumpTurnNearOpenSlots({positions:[],attempts:ownAttempts,now,excludeClientOrderId:'ptns_own0'}),19);
const closed={x:{record:{...ownFills[0].record,positionStatus:'CLOSED'}}};
assert.equal(pumpTurnNearOpenSlots({positions:[],attempts:ownAttempts,fills:closed,now}),19,'closed lifecycle frees its slot');
assert.equal(pumpTurnNearOpenSlots({positions:[],attempts:{x:{symbol:'UNKNOWNUSDT',side:'SHORT',status:'UNKNOWN',at:now-20*86400000}}}),1,'unknown stays reserved across restart/age');
assert.equal(pumpTurnNearOpenSlots({positions:ownPositions.map(x=>({...x,positionAmt:1})),fills:ownFills,now}),0,'LONG does not match own SHORT fill');
assert.equal(pumpTurnNearOpenSlots({positions:ownPositions,fills:Object.fromEntries(Object.entries(ownFills).map(([k,v])=>[k,{record:{...v.record,signalSource:'other-bot'}}])),now}),0);
assert.throws(()=>pumpTurnNearOpenSlots({positions:null}));assert.throws(()=>pumpTurnNearOpenSlots({positions:[],fills:null}));
const dir=await mkdtemp(join(tmpdir(),'pump-turn-near-')),controls=new AutoEntryControls(join(dir,'controls.json'));
controls.seed([PUMP_TURN_NEAR_ROUTE]);assert.equal(controls.read().routes[pumpTurnNearRouteKey].enabled,false);
assert.equal(controls.read().routes[pumpTurnNearRouteKey].maxOpenPositions,20);assert.equal(controls.read().routes[pumpTurnNearRouteKey].maxOpenPositionsScope,PUMP_TURN_NEAR_SOURCE);
controls.update({action:'master',enabled:true});controls.update({action:'route',key:pumpTurnNearRouteKey,enabled:true});const settings=controls.read();settings.routes[pumpTurnNearRouteKey].enabledAt=start;controls.save(settings);
assert.throws(()=>controls.assertEntry({...p,maxOpenPositions:30}),/max riêng 20/);assert.throws(()=>controls.assertEntry({...p,maxOpenPositionsScope:'GLOBAL'}),/max riêng 20/);
let stored=null,calls=0;const ctx={enabled:true,positions:[],openOrders:[],markPrice:price};
const storage={load:async()=>stored,save:async s=>{stored=structuredClone(s);}};
const opts={controls,storage,startedAt:start,now:()=>now,getContext:async()=>ctx,submit:async payload=>{assert.equal(stored.attempts[e.id].status,'SUBMITTING');assert.equal(payload.notionalUsdt,10);calls++;return {status:'SUBMITTED',orderResult:{orderId:123}};}};
const runner=new PumpTurnNearShortRunner(opts);assert.equal((await runner.process(e)).status,'SUBMITTED');assert.equal((await runner.process(e)).status,'DEDUPED');assert.equal(calls,1);
assert.ok(await runner.protectionPlanFor({symbol:e.symbol,side:'SELL',orderId:123,clientOrderId:p.clientOrderId}));
assert.equal(await runner.protectionPlanFor({symbol:e.symbol,side:'BUY',orderId:123,clientOrderId:p.clientOrderId}),null);
assert.equal(await runner.protectionPlanFor({symbol:e.symbol,side:'SELL',orderId:999,clientOrderId:p.clientOrderId}),null);
assert.equal((await new PumpTurnNearShortRunner({...opts,startedAt:now}).process(e)).status,'DEDUPED');
for(const [change,status] of [[{positions:[{symbol:e.symbol,positionAmt:1}]},'EXISTING_POSITION'],[{openOrders:[{symbol:e.symbol,reduceOnly:false}]},'EXISTING_ORDER'],
 [{positions:null},'ACCOUNT_DATA_MISSING'],[{positions:[{symbol:'BAD',positionAmt:'NaN'}]},'ACCOUNT_DATA_INVALID'],[{enabled:false},'RUNTIME_OFF'],[{markPrice:price*1.01},'PRICE_OR_AGE_BLOCKED']]){
 const r=new PumpTurnNearShortRunner({...opts,storage:{load:async()=>null,save:async()=>{}},getContext:async()=>({...ctx,...change}),submit:async()=>{throw Error('must not submit');}});
 assert.equal((await r.process(e)).status,status);
}
for(const [extra,status] of [[{isProtectionExcluded:()=>true},'PROTECTION_DISABLED'],[{getContext:async()=>({...ctx,positions:[...others,...ownPositions]}),getFills:async()=>ownFills},'MAX_PUMP_TURN_NEAR_20']]){
 const r=new PumpTurnNearShortRunner({...opts,...extra,storage:{load:async()=>null,save:async()=>{}},submit:async()=>{throw Error('must not submit');}});assert.equal((await r.process(e)).status,status);
}
const own19=new PumpTurnNearShortRunner({...opts,storage:{load:async()=>null,save:async()=>{}},getContext:async()=>({...ctx,positions:[...others,...ownPositions.slice(0,19)]}),getFills:async()=>ownFills,
 submit:async()=>({status:'SUBMITTED',orderResult:{orderId:124}})});
assert.equal((await own19.process(e)).status,'SUBMITTED','19 own + 60 other positions allows the 20th own entry');assert.equal(own19.openSlots,19);
const pendingFull=new PumpTurnNearShortRunner({...opts,storage:{load:async()=>({version:PUMP_TURN_NEAR_ENTRY_VERSION,attempts:ownAttempts}),save:async()=>{}},getContext:async()=>({...ctx,positions:others})});
assert.equal((await pendingFull.process(e)).status,'MAX_PUMP_TURN_NEAR_20','pending entries count at runner preflight');
const legacyVersion='PUMP_TURN_NEAR_SHORT_2USDT_5X_TP10_SL30_V1_20261018',legacyPlan={...p,fillAnchorVersion:legacyVersion,maxOpenPositions:30};delete legacyPlan.maxOpenPositionsScope;
assert.equal(validPumpTurnNearOrder(legacyPlan,price,now),false,'V1 plan cannot enter after V2');
const legacyState={version:legacyVersion,attempts:{[e.id]:{...stored.attempts[e.id],plan:legacyPlan}}};
const legacyRunner=new PumpTurnNearShortRunner({...opts,storage:{load:async()=>legacyState,save:async()=>{}}});
assert.equal((await legacyRunner.process(e)).status,'DEDUPED','V1 attempts are retained, never replayed');assert.equal(legacyRunner.state.version,PUMP_TURN_NEAR_ENTRY_VERSION);
assert.ok(await legacyRunner.protectionPlanFor({symbol:e.symbol,side:'SELL',orderId:123,clientOrderId:p.clientOrderId}),'exact V1 fill protection remains compatible');
const blockedLegacy={version:legacyVersion,attempts:{[e.id]:{id:e.id,symbol:e.symbol,side:'SHORT',status:'MAX_GLOBAL_POSITIONS',at:now}}};
const noReplay=new PumpTurnNearShortRunner({...opts,storage:{load:async()=>blockedLegacy,save:async()=>{}}});assert.equal((await noReplay.process(e)).status,'DEDUPED','old global-cap rejection not resubmitted');
const failed=new PumpTurnNearShortRunner({...opts,storage:{load:async()=>null,save:async()=>{}},submit:async()=>{throw Error('unknown');}});
assert.equal((await failed.process(e)).status,'ERROR_OR_UNKNOWN');assert.equal((await failed.process(e)).status,'DEDUPED');
const rejection="Order's notional must be no smaller than 5 (unless you choose reduce only).";
const legacyRejected={id:'legacy-rejected',symbol:e.symbol,side:'SHORT',at:now-3600000,status:'ERROR_OR_UNKNOWN',reason:rejection};
assert.equal(pumpTurnNearOpenSlots({positions:[],attempts:{legacyRejected},now}),0,'definitive legacy notional rejection does not reserve a slot');
assert.equal(pumpTurnNearOpenSlots({positions:[],attempts:{x:{...legacyRejected,status:'UNKNOWN'}},now}),1,'truly UNKNOWN remains reserved');
assert.equal(pumpTurnNearOpenSlots({positions:[],attempts:{x:{...legacyRejected,reason:'Timeout; '+rejection}},now}),1,'do not infer rejection from partial/ambiguous error text');
const afterRejection=new PumpTurnNearShortRunner({...opts,storage:{load:async()=>({version:PUMP_TURN_NEAR_ENTRY_VERSION,attempts:{[legacyRejected.id]:legacyRejected}}),save:async()=>{}},
 submit:async()=>({status:'SUBMITTED',orderResult:{orderId:125}})});
assert.equal((await afterRejection.process(e)).status,'SUBMITTED','a distinct fresh signal is allowed after a definitive rejection');
assert.deepEqual(afterRejection.state.attempts[legacyRejected.id],legacyRejected,'retain old id/status/audit, no replay or rewrite');
assert.equal(afterRejection.snapshot().attempts.find(a=>a.id===legacyRejected.id).effectiveStatus,'EXCHANGE_REJECTED');
const rejected=new PumpTurnNearShortRunner({...opts,storage:{load:async()=>null,save:async()=>{}},submit:async()=>{const error=Error(rejection);error.code=-4164;throw error;}});
assert.equal((await rejected.process(e)).status,'EXCHANGE_REJECTED');assert.equal(rejected.state.attempts[e.id].errorCode,-4164);
assert.equal((await rejected.process(e)).status,'DEDUPED','known rejection never retries the same signal');
// AGT: -2019 must not permanently block subsequent distinct/fresh signals or
// reserve own-cap20 slots. Never rewrite/replay historical attempt IDs.
const marginMessage='Margin is insufficient.';
const olderPreRows=preRows.map(b=>({...b,t:b.t-STEP,end:b.end-STEP}));
const olderPlan=plannedPumpZones(e.symbol,olderPreRows)[1];
const olderEvent={...livePumpZone(olderPlan,{price,at:now-STEP-50},now-STEP),id:'pump-turn-near:'+olderPlan.id,
 preRows:olderPreRows,observedAt:now-STEP,nearPct:.75};
assert.equal(validPumpTurnNearSignal(olderEvent),true);
for(const code of [-2019,'-2019',undefined]){
 const historical={id:olderEvent.id,symbol:e.symbol,side:'SHORT',at:now-3*3600000,status:'ERROR_OR_UNKNOWN',reason:marginMessage,
  ...(code===undefined?{}:{errorCode:code})};
 assert.equal(pumpTurnNearOpenSlots({positions:[],attempts:{historical},now}),0,'known margin rejection frees reservation');
 const priorBlocked={id:'old-blocked-'+String(code),symbol:e.symbol,side:'SHORT',at:now-3600000,status:'UNRESOLVED_PREVIOUS_ORDER'};
 let savedState,submitted=0;
 const recovered=new PumpTurnNearShortRunner({...opts,storage:{load:async()=>({version:PUMP_TURN_NEAR_ENTRY_VERSION,
  attempts:{[historical.id]:structuredClone(historical),[priorBlocked.id]:structuredClone(priorBlocked)}}),save:async s=>{savedState=structuredClone(s);}},
  submit:async()=>{submitted++;return {status:'SUBMITTED',orderResult:{orderId:126}};}});
 await recovered.load();const before=JSON.stringify(recovered.state.attempts);
 assert.equal(recovered.snapshot().attempts.find(a=>a.id===historical.id).effectiveStatus,'EXCHANGE_REJECTED');
 assert.equal(JSON.stringify(recovered.state.attempts),before,'snapshot interpretation cannot mutate raw history');
 assert.equal((await recovered.process(olderEvent)).status,'DEDUPED','valid legacy event ID is never retried');
 assert.equal((await recovered.process(e)).status,'SUBMITTED','new valid fresh signal remains eligible');
 assert.equal(submitted,1);assert.deepEqual(savedState.attempts[historical.id],historical);
 assert.deepEqual(savedState.attempts[priorBlocked.id],priorBlocked,'old blocked attempt remains history, no retry');
 assert.equal((await recovered.process(e)).status,'DEDUPED');
 const reloaded=new PumpTurnNearShortRunner({...opts,storage:{load:async()=>savedState,save:async()=>{}},submit:async()=>{throw Error('must not replay');}});
 assert.equal((await reloaded.process(e)).status,'DEDUPED','restart cannot resubmit the accepted event');
 assert.deepEqual(reloaded.state.attempts[historical.id],historical);
}
for(const error of [Object.assign(Error(marginMessage),{code:-2019}),Object.assign(Error('Binance rejected the order'),{code:'-2019'}),Error(marginMessage)]){
 const r=new PumpTurnNearShortRunner({...opts,storage:{load:async()=>null,save:async()=>{}},submit:async()=>{throw error;}});
 assert.equal((await r.process(e)).status,'EXCHANGE_REJECTED');
 assert.equal(pumpTurnNearOpenSlots({positions:[],attempts:r.state.attempts,now}),0);
 assert.equal((await r.process(e)).status,'DEDUPED','margin rejection never retries the same signal');
 assert.equal(r.state.attempts[e.id].errorCode,error.code!=null?Number(error.code):null);
}
for(const a of [
 {status:'UNKNOWN',errorCode:-2019,reason:marginMessage},
 {status:'SUBMITTING',errorCode:-2019,reason:marginMessage},
 {status:'ERROR_OR_UNKNOWN',reason:'Timeout; '+marginMessage},
 {status:'ERROR_OR_UNKNOWN',reason:marginMessage,errorCode:-1007},
 {status:'ERROR_OR_UNKNOWN',reason:'Request timeout'},
]){
 const pending={id:'uncertain',symbol:e.symbol,side:'SHORT',at:now-3600000,...a};
 assert.equal(pumpTurnNearOpenSlots({positions:[],attempts:{pending},now}),1,'uncertain submission still reserves one slot');
 const r=new PumpTurnNearShortRunner({...opts,storage:{load:async()=>({version:PUMP_TURN_NEAR_ENTRY_VERSION,attempts:{uncertain:pending}}),save:async()=>{}},
  getContext:async()=>{throw Error('must not reach account reads');},submit:async()=>{throw Error('must not submit');}});
 assert.equal((await r.process(e)).status,'UNRESOLVED_PREVIOUS_ORDER');
}
const marginOld={id:'old-margin-position',symbol:e.symbol,side:'SHORT',at:now-3600000,status:'ERROR_OR_UNKNOWN',reason:marginMessage,errorCode:-2019};
for(const [change,status] of [[{positions:[{symbol:e.symbol,positionAmt:-1}]},'EXISTING_POSITION'],[{openOrders:[{symbol:e.symbol,reduceOnly:false}]},'EXISTING_ORDER']]){
 const r=new PumpTurnNearShortRunner({...opts,storage:{load:async()=>({version:PUMP_TURN_NEAR_ENTRY_VERSION,attempts:{[marginOld.id]:marginOld}}),save:async()=>{}},
  getContext:async()=>({...ctx,...change}),submit:async()=>{throw Error('must not DCA');}});
 assert.equal((await r.process(e)).status,status,'clearing a rejection never bypasses no-DCA/current orders');
}
const invalid=new PumpTurnNearShortRunner({...opts,storage:{load:async()=>({version:PUMP_TURN_NEAR_ENTRY_VERSION,attempts:{bad:{}}}),save:async()=>{}}});assert.equal((await invalid.process(e)).status,'STATE_ERROR');
// Market callback is durable, new-only and independent of Discord being off or failing.
const all=[{...preRows[0],t:preRows[0].t-STEP,end:preRows[0].end-STEP},...preRows];
const raw=all.map(b=>({openTime:b.t,closeTime:b.end,open:b.o,close:b.c,high:b.h,low:b.l,volume:b.v,quoteVolume:b.q,takerBuyQuoteVolume:b.buy,isClosed:true}));
for(const discord of [false,true]){
 const events=[],file=join(dir,'watch-'+discord+'.json'),w=new PumpTurnWatch({file,now:()=>now,getSymbols:()=>[e.symbol],getRows:()=>raw,getLive:()=>({price,at:now}),nearShortEnabled:()=>true,
  onNearShort:async event=>{assert.equal(JSON.parse(await readFile(file,'utf8')).history[0].id,event.id);assert.equal(validPumpTurnNearSignal(event),true);events.push(event);},discordSender:async()=>{throw Error('Discord unavailable');}});
 w.settings.discordEnabled=discord;await w.scan();await new Promise(r=>setImmediate(r));assert.equal(events.length,1);await w.scan();assert.equal(events.length,1);
}
const server=await readFile('src/server.js','utf8');assert.match(server,/startsWith\('ptns_'\)/);assert.match(server,/pumpTurnNearRunner.protectionPlanFor/);
assert.match(server,/\[.*STRUCTURE_SOURCE,PUMP_TURN_NEAR_SOURCE\]/);assert.match(server,/PUMP_TURN_NEAR_SOURCE[\s\S]*confirmedProtection.hasSl/);
// Exercise production order and protection functions with mock exchange IO.
const executeStart=server.indexOf('async function executePlaceOrder('),executeEnd=server.indexOf('\n  // LIMIT IOC:',executeStart);
const constants={PUMP_TURN_NEAR_SOURCE:'pump-turn-near-short',STRUCTURE_SOURCE:'structure-setup-ready',RISING_VOLUME_SOURCE:'rising-volume-sustained-1m',MAIN_DISTANCE_SOURCE:'main-kill-distance-entry',ZONE_MANUAL_SOURCE:'liquidity-zone-manual'};
function harness({positions=[],orders=[],excluded=false,finalMark=price,types=null,minimum=false,fills={},attempts={},latestFills=null}={}){
 const placed=[],audits=[],plans=[];
 const execution=vm.runInNewContext(server.slice(executeStart,executeEnd)+'\nreturn {orderResult,plannedOrder};\n}\nexecutePlaceOrder',{
  ...constants,ordersTokens:new Map(),runtimeSettings:{orderEnabled:true,dryRun:false},pumpTurnWatch:{error:null},pumpTurnNearOpenSlots,pumpTurnNearRunner:{state:{attempts}},
  autoEntryControls:{assertEntry:x=>controls.assertEntry(x),isProtectionExcluded:()=>excluded},normalizeSymbol:s=>s,isBinanceProtectionExcluded:()=>excluded,
  shortStopLossSuppression:(side,source)=>({suppressed:shouldSuppressBotShortStopLoss({side,source})}),resolveSignalProtectionWorkingTypes,
  evaluateAutoBinanceEntryPolicy:x=>evaluateAutoBinanceEntryPolicy({...x,now}),AUTO_BINANCE_ENTRY_POLICY_VERSION:'mock',validPumpTurnNearOrder:(x,m)=>validPumpTurnNearOrder(x,m,now),
  getSymbols:async()=>[{symbol:p.symbol,orderTypes:types}],
  client:{getPremiumIndex:async()=>({markPrice:price}),getPositions:async()=>positions,getOpenOrders:async()=>orders,setLeverage:async()=>({leverage:5}),placeFuturesOrder:async({params})=>{placed.push(params);return {orderId:456};}},
  ema99NearRejectRunner:{getContext:async()=>({enabled:true,positions,openOrders:orders,markPrice:finalMark})},
  priceFromTick:(_,v)=>String(v),quantityFromNotional:(_,n,_price,_dryRun,o)=>{assert.equal(n,10);assert.equal(o.allowMinNotionalCeil,false);if(minimum)throw Error('Order notional below minimum');return '.08';},
  isManualShortProtectionSource,resolveOrdersManualTakeProfit,resolveNonLiquidFlowV2TakeProfit,inspectLiquidFlowV2DcaPositions:()=>({hasExistingSameSide:false}),getHedgeMode:async()=>false,
  binanceFilledSignalAudit:{init:async()=>({fills:latestFills&&audits.length?latestFills:fills}),registerSubmission:async a=>audits.push(a)},rememberSignalProtectionPlan:p=>plans.push(p),signalProtectionPlans:new Map(),console:{log(){},warn(){}},process:{env:{}},Date,
 });return {execution,placed,audits,plans};
}
const h=harness(),executed=await h.execution(authorizePumpTurnNearOrder(p),null,{},{});assert.equal(h.placed.length,1);assert.equal(h.placed[0].type,'MARKET');assert.equal(h.placed[0].side,'SELL');assert.equal(executed.plannedOrder.stopLossSuppressed,false);
assert.equal(h.plans[0].takeProfitDistanceFraction,.02);assert.equal(h.plans[0].stopLossDistanceFraction,.06);
const record=buildBinanceFilledSignalAuditRecord({symbol:e.symbol,side:'SELL',orderId:456,fillTime:now+1},h.audits[0]);assert.equal(record.pumpTurnNearEntryVersion,PUMP_TURN_NEAR_ENTRY_VERSION);assert.equal(record.pumpTurnNearSignalId,e.id);assert.deepEqual(record.pumpTurnNearAtEntry,JSON.parse(JSON.stringify(e)));
for(const options of [{positions:[{symbol:e.symbol,positionAmt:1}]},{orders:[{symbol:e.symbol}]},{excluded:true},{finalMark:price*1.006},{types:['MARKET','TAKE_PROFIT_MARKET']},{minimum:true},
 {positions:[...others,...ownPositions],fills:ownFills},{attempts:ownAttempts},
 {positions:ownPositions,fills:{...ownFills,19:undefined},latestFills:ownFills}]){
 const mock=harness(options);await assert.rejects(mock.execution(authorizePumpTurnNearOrder(p),null,{},{}));assert.equal(mock.placed.length,0);
}
const independent=harness({positions:[...others,...ownPositions.slice(0,19)],fills:ownFills});await independent.execution(authorizePumpTurnNearOrder(p),null,{},{});assert.equal(independent.placed.length,1,'production MARKET bypasses global cap for 19 own + 60 others');
const reservedSelf={...ownAttempts,self:{symbol:e.symbol,side:'SHORT',status:'SUBMITTING',clientOrderId:p.clientOrderId,at:now}};
delete reservedSelf[19];
const reserve20th=harness({positions:others,attempts:reservedSelf});await reserve20th.execution(authorizePumpTurnNearOrder(p),null,{},{});assert.equal(reserve20th.placed.length,1,'exclude current SUBMITTING intent at both production cap checks');
const tpStart=server.indexOf('async function setTpSl(payload, token = null)'),tpEnd=server.indexOf('\nasync function getMarketSnapshot()',tpStart);
for(const hide of [false,true]){
 const placed=[],run=vm.runInNewContext(server.slice(tpStart,tpEnd)+'\nsetTpSl',{
  ...constants,BINANCE_CLOSE_POSITION_PROTECTION_VERSION,BINANCE_MANUAL_SHORT_EMA99_TP_ONLY_VERSION:'manual',
  client:{getOpenOrders:async()=>[],getOpenAlgoOrders:async()=>hide?[]:placed,getPositions:async()=>[{symbol:e.symbol,positionAmt:'-1',entryPrice:'100',leverage:'5',positionSide:'BOTH'}],
   getPremiumIndex:async()=>({markPrice:100}),placeAlgoOrder:async({params})=>{placed.push(params);return {algoId:placed.length};}},
  normalizeSymbol:s=>s,getApiCredentials:()=>({}),getSymbols:async()=>[{symbol:e.symbol}],resolveSignalProtectionWorkingTypes,
  shortStopLossSuppression:(side,source)=>({suppressed:shouldSuppressBotShortStopLoss({side,source})}),isTrackedManualShortTpOnlyPosition:()=>false,isBinanceProtectionExcluded:()=>false,
  resolveNonLiquidFlowV2TakeProfit,hasOpenProtectionOrder,buildClosePositionProtectionParams,priceFromTick:(_,v)=>v,console:{log(){}},process:{env:{}},Date,
 });
 const request={symbol:e.symbol,source:p.source,tpPrice:98,slPrice:106};
 if(hide)await assert.rejects(run(request),/not confirmed both open legs/);
 else{const result=await run(request);assert.equal(result.hasTp,true);assert.equal(result.hasSl,true);assert.deepEqual(placed.map(o=>Number(o.triggerPrice)),[98,106]);}
}
console.log('PASS near-SHORT proof, own cap20 excluding other strategies, pending/unknown reservations, final MARKET recheck, V1 ledger/protection-only compatibility/no replay, unchanged 2×5 TP10/SL30, controls/no DCA. Mock only.');
