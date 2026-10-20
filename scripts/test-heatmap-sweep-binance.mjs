import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {PROFILE_RATIO} from '../src/heatmapEntryScenarios.js';
import {HeatmapSweepWatch,prepareHeatmapSweepCohort,HEATMAP_SWEEP_VERSION} from '../src/heatmapSweepWatch.js';
import {HeatmapSweepBinanceRunner,HEATMAP_SWEEP_SOURCE,HEATMAP_SWEEP_ROUTES,HEATMAP_SWEEP_ENTRY_VERSION,heatmapSweepRouteKey,
 validHeatmapSweepSignal,buildHeatmapSweepOrder,validHeatmapSweepOrder,heatmapSweepOpenSlots} from '../src/heatmapSweepBinance.js';
import {AutoEntryControls} from '../src/autoEntryControls.js';
import {authorizeHeatmapSweepOrder,evaluateAutoBinanceEntryPolicy} from '../src/autoBinancePolicy.js';
import {heatmapSweepDiscordPayload} from '../src/heatmapSweepDiscord.js';
import {shouldSuppressBotShortStopLoss,resolveNonLiquidFlowV2TakeProfit,resolveOrdersManualTakeProfit,isManualShortProtectionSource} from '../src/shortTakeProfitPolicy.js';
import {resolveFillAnchoredProtectionPrices,resolveSignalProtectionWorkingTypes} from '../src/liveCardSignalProtection.js';
import {buildClosePositionProtectionParams,BINANCE_CLOSE_POSITION_PROTECTION_VERSION} from '../src/binanceClosePositionProtection.js';
import {hasOpenProtectionOrder} from '../src/protectionOrderGuard.js';
import {buildBinanceFilledSignalAuditRecord} from '../src/binanceFilledSignalAudit.js';
const STEP=300000,base=Math.floor(Date.now()/STEP)*STEP,start=base+1000;
let now=base+5000;
const fixture=(symbol='TESTUSDT')=>{const d={symbol,source:'BINANCE_LOCAL',range:'24h',step:STEP,end:base,candles:[{time:base-STEP,close:100}],
 profiles:Array.from({length:3},(_,i)=>({at:base-1-(2-i)*STEP,oiFresh:true,mark:true,bins:[90,96,98,102,104,110].map(p=>[Math.round(Math.log(p)/Math.log(PROFILE_RATIO)),100])}))};
 return {models:[1,3].map(model=>({model,status:'OK',data:structuredClone(d)}))};};
const dir=await mkdtemp(join(tmpdir(),'heatmap-entry-')),events=[],file=join(dir,'watch.json');
const watch=new HeatmapSweepWatch({file,now:()=>now,loadBundle:async()=>fixture(),getLive:()=>({price:100,at:now}),
 onFullSweep:async e=>{assert.equal(JSON.parse(await readFile(file,'utf8')).history.at(-1).id,e.id);assert(validHeatmapSweepSignal(e));events.push(e);return {status:'OFF'};},
 discordSender:async()=>{throw Error('Discord fails, must not disable entry');}});
await watch.update({symbol:'TESTUSDT',enabled:true});await watch.scan();assert(watch.watches[0].lowerCohort);
const tick=async price=>{now+=1000;await watch.onMark({symbol:'TESTUSDT',markPrice:price,eventTime:now});};
await tick(103);assert.equal(events.length,0,'partial upper sweep is observe-only');
await tick(105);assert.equal(events.length,1);assert.equal(events[0].direction,'UPPER');
await tick(97);assert.equal(events.length,1,'partial lower sweep is observe-only');
await tick(95);assert.equal(events.length,2);assert.equal(events[1].direction,'LOWER');
await tick(94);assert.equal(events.length,2);assert(watch.history.every(e=>e.delivery.status==='UNKNOWN'));
const oldFile=join(dir,'old.json');await writeFile(oldFile,JSON.stringify({version:'HEATMAP_UPPER_SWEEP_MARKET_V2_20261018',marketEnabled:false,watches:[{symbol:'TESTUSDT',enabled:true}],history:[{...events[0],version:'HEATMAP_UPPER_SWEEP_MARKET_V2_20261018'}]}));
const restarted=new HeatmapSweepWatch({file:oldFile,now:()=>now,onFullSweep:()=>{throw Error('no replay');}});await restarted.init();assert.equal(restarted.history.length,1);assert.equal(restarted.watches[0].cohort,null);assert.equal(restarted.watches[0].lowerCohort,undefined);
const lower=prepareHeatmapSweepCohort(fixture(),{price:95,at:now},now,5,'LOWER');assert(!lower.cohort,'old lower clusters already crossed before arm are not replayed');
const gap=new HeatmapSweepWatch({file:join(dir,'gap.json'),now:()=>now,loadBundle:async()=>fixture(),getLive:()=>({price:100,at:now}),onFullSweep:()=>{throw Error('gap must not submit');}});
await gap.update({symbol:'TESTUSDT',enabled:true});await gap.scan();now+=11000;await gap.onMark({symbol:'TESTUSDT',markPrice:95,eventTime:now});assert.equal(gap.history.length,0);assert.equal(gap.watches[0].lowerCohort.state,'GAP');
const controls=new AutoEntryControls(join(dir,'controls.json'));controls.seed(HEATMAP_SWEEP_ROUTES);
for(const side of ['LONG','SHORT']){const r=controls.read().routes[heatmapSweepRouteKey(side)];assert.equal(r.enabled,false);assert.equal(r.marginUsdt,side==='LONG'?1:3);assert.equal(r.maxOpenPositions,20);}
controls.update({action:'master',enabled:true});for(const side of ['LONG','SHORT'])controls.update({action:'route',key:heatmapSweepRouteKey(side),enabled:true});
const settings=controls.read();for(const r of Object.values(settings.routes))r.enabledAt=start;controls.save(settings);
const plans=events.map(e=>buildHeatmapSweepOrder(e,{now,enabledAt:start,startedAt:start,markPrice:e.markPrice}));
for(let i=0;i<2;i++){
 const e=events[i],p=plans[i],long=i===1;assert(p);assert(validHeatmapSweepOrder(p,p.signalEntryPrice,now));controls.assertEntry(p);
 assert.equal(p.side,long?'BUY':'SELL');assert.equal(p.marginUsdt,long?1:3);assert.equal(p.notionalUsdt,long?5:15);assert.equal(p.allowMinNotionalCeil,false);
 assert.equal(p.takeProfitPrice,p.signalEntryPrice*(long?1.02:.98));assert.equal(p.stopLossPrice,p.signalEntryPrice*(long?.94:1.06));
 assert.equal(shouldSuppressBotShortStopLoss({side:p.side,source:p.source}),false);
 assert.equal(resolveNonLiquidFlowV2TakeProfit({side:p.side,source:p.source,entryPrice:100,leverage:5,requestedTakeProfitPrice:p.takeProfitPrice}).applied,false);
 assert.equal(evaluateAutoBinanceEntryPolicy({payload:p,orderEnabled:true,now}).allowed,false,'JSON cannot forge server authority');
 assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeHeatmapSweepOrder(p),orderEnabled:true,now}).allowed,true);
 for(const k of ['marginUsdt','leverage','takeProfitPrice','stopLossPrice','maxOpenPositions','entryExpiresAt','notionalUsdt'])assert(!validHeatmapSweepOrder({...p,[k]:Number(p[k])+1},p.signalEntryPrice,now));
 assert(!validHeatmapSweepOrder(p,p.signalEntryPrice*1.006,now));assert(!validHeatmapSweepOrder(p,p.signalEntryPrice,e.at+30001));
 assert(!buildHeatmapSweepOrder(e,{now,enabledAt:e.armedAt,startedAt:start,markPrice:e.markPrice}),'cohort armed before enable cannot enter');
 const text=JSON.stringify(heatmapSweepDiscordPayload({...e,binance:{status:'SUBMITTED',orderId:123}}));assert.match(text,/SUBMITTED/);assert.match(text,long?/LONG MARKET 1/:/SHORT MARKET 3/);
 for(const mutate of [x=>x.version='HEATMAP_UPPER_SWEEP_MARKET_V2_20261018',x=>x.kind='UPPER_CLUSTER_SWEPT',x=>x.zones[0].low*=.99,x=>x.zones[0].cleared=false,
  x=>x.direction=long?'UPPER':'LOWER',x=>x.maxTickGapMs=10001,x=>x.zones[0].clearedAt=x.armedAt-1,x=>x.cohortId+=':fake']){const invalid=structuredClone(e);mutate(invalid);assert(!validHeatmapSweepSignal(invalid));}
 const filled=resolveFillAnchoredProtectionPrices({...p,fillPrice:p.signalEntryPrice*1.001});assert(filled);
}
const others=Array.from({length:60},(_,i)=>({symbol:`OTHER${i}USDT`,positionAmt:1}));
const own=Array.from({length:20},(_,i)=>({symbol:`OWN${i}USDT`,positionAmt:i%2?1:-1}));
const fills=Object.fromEntries(own.map((p,i)=>[i,{record:{symbol:p.symbol,direction:i%2?'LONG':'SHORT',positionStatus:'OPEN',signalSource:HEATMAP_SWEEP_SOURCE,clientOrderId:`hms_${i}`}}]));
const pending=Object.fromEntries(own.map((p,i)=>[i,{id:String(i),symbol:p.symbol,side:i%2?'LONG':'SHORT',status:'SUBMITTING',clientOrderId:`hms_${i}`,at:now}]));
assert.equal(heatmapSweepOpenSlots({positions:others}),0);assert.equal(heatmapSweepOpenSlots({positions:[...others,...own],fills,attempts:pending,now}),20);
assert.equal(heatmapSweepOpenSlots({positions:[],attempts:pending,now,excludeClientOrderId:'hms_0'}),19);
assert.equal(heatmapSweepOpenSlots({positions:[],attempts:{x:{symbol:'XUSDT',side:'LONG',status:'ERROR_OR_UNKNOWN',at:now-999999999}}}),1);
assert.equal(heatmapSweepOpenSlots({positions:[],attempts:{x:{symbol:'XUSDT',side:'LONG',status:'EXCHANGE_REJECTED',errorCode:-2019,at:now}}}),0);
for(const status of ['UNKNOWN','SUBMITTING','ERROR_OR_UNKNOWN'])assert.equal(heatmapSweepOpenSlots({positions:[],attempts:{x:{symbol:'XUSDT',side:'LONG',status,errorCode:-2019,at:now}}}),1,'never infer a safe rejection from a contradictory uncertain status');
assert.throws(()=>heatmapSweepOpenSlots({positions:null}));assert.throws(()=>heatmapSweepOpenSlots({positions:[],fills:null}));
for(const e of events){let saved,submits=0;const opts={controls,now:()=>now,startedAt:start,getContext:async()=>({enabled:true,positions:others,openOrders:[],markPrice:e.markPrice}),
 storage:{load:async()=>null,save:async s=>{saved=structuredClone(s);}},submit:async p=>{assert.equal(saved.attempts[e.id].status,'SUBMITTING');submits++;return {status:'submitted',orderResult:{orderId:123}};}};
 const runner=new HeatmapSweepBinanceRunner(opts);assert.equal((await runner.process(e)).status,'SUBMITTED');assert.equal(submits,1);assert.equal((await runner.process(e)).status,'DEDUPED');
 const restart=new HeatmapSweepBinanceRunner({...opts,storage:{load:async()=>saved,save:async()=>{}},startedAt:now});assert.equal((await restart.process(e)).status,'DEDUPED');
 const recovered=await restart.protectionPlanFor({symbol:e.symbol,side:e.direction==='UPPER'?'SELL':'BUY',orderId:123,clientOrderId:plans[events.indexOf(e)].clientOrderId});assert(recovered);
 assert.equal(await restart.protectionPlanFor({symbol:e.symbol,side:'SELL',orderId:456,clientOrderId:'hms_wrong'}),null);
 for(const [extra,status] of [[{isProtectionExcluded:()=>true},'PROTECTION_DISABLED'],[{getContext:async()=>({enabled:false})},'RUNTIME_OFF'],
  [{getContext:async()=>({enabled:true,positions:[{symbol:e.symbol,positionAmt:1}],openOrders:[],markPrice:e.markPrice})},'EXISTING_POSITION'],
  [{getContext:async()=>({enabled:true,positions:[],openOrders:[{symbol:e.symbol}],markPrice:e.markPrice})},'EXISTING_ORDER'],
  [{getContext:async()=>({enabled:true,positions:own,openOrders:[],markPrice:e.markPrice}),getFills:async()=>fills},'MAX_HEATMAP_SWEEP_20'],
  [{getContext:async()=>({enabled:true,positions:[],openOrders:[],markPrice:e.markPrice*1.006})},'PRICE_OR_AGE_BLOCKED'],
  [{submit:async()=>{throw Object.assign(Error('Margin is insufficient.'),{code:-2019});}},'EXCHANGE_REJECTED'],
  [{submit:async()=>{throw Error('Network timeout');}},'ERROR_OR_UNKNOWN'],
  [{submit:async()=>{throw Object.assign(Error('minimum notional'),{beforeHeatmapMarket:true});}},'PREFLIGHT_REJECTED']]){
  const r=new HeatmapSweepBinanceRunner({...opts,...extra});assert.equal((await r.process(e)).status,status);assert.equal((await r.process(e)).status,'DEDUPED');
 }
 const full=new HeatmapSweepBinanceRunner({...opts,storage:{load:async()=>({version:HEATMAP_SWEEP_ENTRY_VERSION,attempts:pending}),save:async()=>{}}});assert.equal((await full.process(e)).status,'MAX_HEATMAP_SWEEP_20');
 const broken=new HeatmapSweepBinanceRunner({...opts,storage:{load:async()=>({version:'bad'}),save:async()=>{}}});assert.equal((await broken.process(e)).status,'STATE_ERROR');
 const cannotSave=new HeatmapSweepBinanceRunner({...opts,storage:{load:async()=>null,save:async()=>{throw Error('disk full');}}});assert.equal((await cannotSave.process(e)).status,'STATE_ERROR');
 assert.equal((await new HeatmapSweepBinanceRunner({...opts,startedAt:now}).process(e)).status,'PRE_ENABLE_OR_STALE');
}
// Execute actual production MARKET prefix with mocked exchange IO in both directions.
const server=await readFile('src/server.js','utf8'),a=server.indexOf('async function executePlaceOrder('),z=server.indexOf('\n  // LIMIT IOC:',a);
const constants={PUMP_TURN_NEAR_SOURCE:'pump-turn-near-short',STRUCTURE_SOURCE:'structure-setup-ready',RISING_VOLUME_SOURCE:'rising-volume-sustained-1m',MAIN_DISTANCE_SOURCE:'main-kill-distance-entry',ZONE_MANUAL_SOURCE:'liquidity-zone-manual'};
function harness(p,{positions=others,orders=[],excluded=false,active=true,finalMark=p.signalEntryPrice,types=null,minimum=false,auditFills={},attempts={},latestFills=null}={}){
 const placed=[],audits=[],plans=[];
 const execution=vm.runInNewContext(server.slice(a,z)+'\nreturn {orderResult,plannedOrder};\n}\nexecutePlaceOrder',{
  ...constants,ordersTokens:new Map(),runtimeSettings:{orderEnabled:true,dryRun:false},heatmapSweepWatch:{error:null,isCurrentFullSweep:()=>active},heatmapSweepOpenSlots,heatmapSweepRunner:{error:null,state:{attempts}},
  autoEntryControls:{assertEntry:x=>controls.assertEntry(x),isProtectionExcluded:()=>excluded},normalizeSymbol:s=>s,isBinanceProtectionExcluded:()=>excluded,
  shortStopLossSuppression:(side,source)=>({suppressed:shouldSuppressBotShortStopLoss({side,source})}),resolveSignalProtectionWorkingTypes,
  evaluateAutoBinanceEntryPolicy:x=>evaluateAutoBinanceEntryPolicy({...x,now}),AUTO_BINANCE_ENTRY_POLICY_VERSION:'mock',validHeatmapSweepOrder:(x,m)=>validHeatmapSweepOrder(x,m,now),
  getSymbols:async()=>[{symbol:p.symbol,orderTypes:types}],
  client:{getPremiumIndex:async()=>({markPrice:p.signalEntryPrice}),getPositions:async()=>positions,getOpenOrders:async()=>orders,setLeverage:async()=>({leverage:5}),placeFuturesOrder:async({params})=>{placed.push(params);return {orderId:456};}},
  ema99NearRejectRunner:{getContext:async()=>({enabled:true,positions,openOrders:orders,markPrice:finalMark})},
  priceFromTick:(_,v)=>String(v),quantityFromNotional:(_,n,_price,_dryRun,o)=>{assert.equal(n,p.marginUsdt*5);assert.equal(o.allowMinNotionalCeil,false);if(minimum)throw Error('Order notional below minimum');return '.08';},
  isManualShortProtectionSource,resolveOrdersManualTakeProfit,resolveNonLiquidFlowV2TakeProfit,inspectLiquidFlowV2DcaPositions:()=>({hasExistingSameSide:false}),getHedgeMode:async()=>false,
  binanceFilledSignalAudit:{init:async()=>({fills:latestFills&&audits.length?latestFills:auditFills}),registerSubmission:async a=>audits.push(a)},rememberSignalProtectionPlan:p=>plans.push(p),signalProtectionPlans:new Map(),console:{log(){},warn(){}},process:{env:{}},Date,
 });return {execution,placed,audits,plans};
}
for(const p of plans){const h=harness(p);await h.execution(authorizeHeatmapSweepOrder(p),null,{},{});assert.equal(h.placed.length,1);assert.equal(h.placed[0].side,p.side);assert.equal(h.placed[0].type,'MARKET');
 assert.equal(h.plans[0].stopLossDistanceFraction,.06);assert.equal(h.plans[0].takeProfitDistanceFraction,.02);
 const record=buildBinanceFilledSignalAuditRecord({symbol:p.symbol,side:p.side,orderId:456,fillTime:now+1},h.audits[0]);assert.equal(record.heatmapSweepEntryVersion,HEATMAP_SWEEP_ENTRY_VERSION);assert.deepEqual(record.heatmapSweepAtEntry,p.heatmapSweepAtEntry);
 for(const options of [{positions:[{symbol:p.symbol,positionAmt:1}]},{orders:[{symbol:p.symbol}]},{excluded:true},{active:false},{finalMark:p.signalEntryPrice*1.006},{types:['MARKET','TAKE_PROFIT_MARKET']},{minimum:true},
  {positions:own,auditFills:fills},{attempts:pending},{positions:own,auditFills:{...fills,19:undefined},latestFills:fills}]){
  const h=harness(p,options);await assert.rejects(h.execution(authorizeHeatmapSweepOrder(p),null,{},{}));assert.equal(h.placed.length,0);
 }
 const available=harness(p,{positions:[...others,...own.slice(0,19)],auditFills:fills});await available.execution(authorizeHeatmapSweepOrder(p),null,{},{});assert.equal(available.placed.length,1,'unrelated 60 positions do not consume own cap');
 const self={...pending};delete self[19];self.self={symbol:p.symbol,side:p.side==='BUY'?'LONG':'SHORT',status:'SUBMITTING',at:now,clientOrderId:p.clientOrderId};
 const last=harness(p,{attempts:self});await last.execution(authorizeHeatmapSweepOrder(p),null,{},{});assert.equal(last.placed.length,1,'self reservation excluded at both cap checks');
}
const tpStart=server.indexOf('async function setTpSl(payload, token = null)'),tpEnd=server.indexOf('\nasync function getMarketSnapshot()',tpStart);
for(const side of ['BUY','SELL'])for(const hide of [false,true]){
 const placed=[],long=side==='BUY',run=vm.runInNewContext(server.slice(tpStart,tpEnd)+'\nsetTpSl',{
  ...constants,BINANCE_CLOSE_POSITION_PROTECTION_VERSION,BINANCE_MANUAL_SHORT_EMA99_TP_ONLY_VERSION:'manual',
  client:{getOpenOrders:async()=>[],getOpenAlgoOrders:async()=>hide?[]:placed,getPositions:async()=>[{symbol:'TESTUSDT',positionAmt:long?'1':'-1',entryPrice:'100',leverage:'5',positionSide:'BOTH'}],
   getPremiumIndex:async()=>({markPrice:100}),placeAlgoOrder:async({params})=>{placed.push(params);return {algoId:placed.length};}},
  normalizeSymbol:s=>s,getApiCredentials:()=>({}),getSymbols:async()=>[{symbol:'TESTUSDT'}],resolveSignalProtectionWorkingTypes,
  shortStopLossSuppression:(side,source)=>({suppressed:shouldSuppressBotShortStopLoss({side,source})}),isTrackedManualShortTpOnlyPosition:()=>false,isBinanceProtectionExcluded:()=>false,
  resolveNonLiquidFlowV2TakeProfit,hasOpenProtectionOrder,buildClosePositionProtectionParams,priceFromTick:(_,v)=>v,console:{log(){}},process:{env:{}},Date,
 });
 const request={symbol:'TESTUSDT',source:HEATMAP_SWEEP_SOURCE,tpPrice:long?102:98,slPrice:long?94:106};
 if(hide)await assert.rejects(run(request),/not confirmed both open legs/);else{const r=await run(request);assert(r.hasTp&&r.hasSl);assert.deepEqual(placed.map(x=>Number(x.triggerPrice)),long?[102,94]:[98,106]);}
}
assert.match(server,/startsWith\('hms_'\)/);assert.match(server,/heatmapSweepRunner.protectionPlanFor/);assert.match(server,/onFullSweep:e=>heatmapSweepRunner.process\(e\)/);
console.log('PASS dual causal full-sweep only, defaults OFF, authorized SHORT3/LONG1 x5 TP10/SL30, shared own cap20, no replay/DCA/min-size ceil, ledger/restart/unknown safety, native MARKET + audit + confirmed TP/SL both directions. Mock only.');
