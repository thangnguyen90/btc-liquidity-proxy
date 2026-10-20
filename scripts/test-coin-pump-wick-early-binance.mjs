import assert from 'node:assert/strict';
import {STRUCTURE_SOURCE} from '../src/structureSetupBinance.js';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {evaluateCoinPumpWickEarly,CoinPumpWickEarlyMonitor} from '../src/coinPumpWickEarly.js';
import {EarlyWickBinanceRunner,EARLY_WICK_ROUTE,EARLY_WICK_SOURCE,EARLY_WICK_ENTRY_VERSION,isEarlyWickEntrySignal,
  earlyWickRatioEvent,buildEarlyWickMarketOrder,validEarlyWickOrder,earlyWickClosedStats} from '../src/coinPumpWickEarlyBinance.js';
import {AutoEntryControls,entryRoute} from '../src/autoEntryControls.js';
import {authorizeEarlyWickOrder,evaluateAutoBinanceEntryPolicy} from '../src/autoBinancePolicy.js';
import {ratioRowsFor,ratioProofFor} from './rising-volume-ratio-fixtures.mjs';
import {resolveFillAnchoredProtectionPrices,resolveSignalProtectionWorkingTypes} from '../src/liveCardSignalProtection.js';
import {resolveNonLiquidFlowV2TakeProfit,resolveOrdersManualTakeProfit,shouldSuppressBotShortStopLoss,isManualShortProtectionSource} from '../src/shortTakeProfitPolicy.js';
import {buildBinanceFilledSignalAuditRecord} from '../src/binanceFilledSignalAudit.js';
import {buildClosePositionProtectionParams,BINANCE_CLOSE_POSITION_PROTECTION_VERSION} from '../src/binanceClosePositionProtection.js';
import {hasOpenProtectionOrder} from '../src/protectionOrderGuard.js';
import {coinPumpWickEarlyKey} from '../public/coin-pump-wick-early-model.js';
import {liquidLiveCardKeysOfTrade,normalizeLiquidLiveCardKey} from '../src/liquidLiveCardWhitelist.js';
const f=JSON.parse(await readFile('scripts/fixtures/era-pump-wick-20261010.json','utf8'));
const rows=f.rows.map(row=>Object.fromEntries(f.columns.map((k,i)=>[k,row[i]]))),now=rows.at(-1).closeTime+1000,activation=now-20000;
const e={...evaluateCoinPumpWickEarly(rows,rows.length-1),symbol:'ERAUSDT',observedAt:now,id:`pump-wick-early:ERAUSDT:${rows.at(-1).openTime}`};
assert.equal(e.reclaimed,false);assert(isEarlyWickEntrySignal(e),'no reclaim/confirmed/Volume1m gate');
const ratioEvent=earlyWickRatioEvent(e),ratioRows=ratioRowsFor(ratioEvent),ratioProof=ratioProofFor(ratioEvent,now);
const options={now,enabledAt:activation,startedAt:activation,markPrice:e.price,ratioProof};
const plan=buildEarlyWickMarketOrder(e,options);assert(plan);
assert.equal(plan.side,'BUY');assert.equal(plan.marginUsdt,3);assert.equal(plan.notionalUsdt,15);assert.equal(plan.leverage,5);
assert.equal(plan.takeProfitPrice,e.price*1.02);assert.equal(plan.stopLossPrice,e.price*.94);assert.equal(plan.allowMinNotionalCeil,false);
assert.equal(validEarlyWickOrder(plan,e.price,now),true);
for(const changed of [{pattern:'IMMEDIATE'},{status:'CONFIRMED'},{interval:'15m'},{version:'OLD'},{observedAt:e.detectedAt},
  {id:'wrong'},{symbol:'CKBUSDT'},{price:999},{preSweepRows:[]},{sweep:{...e.sweep,low:.0001}},{pump:{...e.pump,waveVolumeRatio:999}}])
  assert.equal(isEarlyWickEntrySignal({...e,...changed}),false);
assert.equal(isEarlyWickEntrySignal(null),false);
for(const changed of [{ratioProof:null},{ratioProof:{...ratioProof,symbol:'CKBUSDT'}},{ratioProof:{...ratioProof,side:'SHORT'}},
  {ratioProof:{...ratioProof,fetchedAt:now+1}},{enabledAt:now},{startedAt:now},{now:now+71000},{markPrice:e.price*1.006}])
  assert.equal(buildEarlyWickMarketOrder(e,{...options,...changed}),null);
for(const changed of [{side:'SELL'},{marginUsdt:2},{notionalUsdt:10},{leverage:10},{stopLossPrice:null},{stopLossRoePct:20},
  {takeProfitRoePct:15},{allowMinNotionalCeil:true},{maxOpenPositions:100},{fillAnchorEnabled:false},{coinPumpWickEarlySignalId:'wrong'}])
  assert.equal(validEarlyWickOrder({...plan,...changed},e.price,now),false);
assert.equal(validEarlyWickOrder(plan,e.price*1.006,now),false);
const anchored=resolveFillAnchoredProtectionPrices({...plan,fillPrice:100});assert.equal(anchored.takeProfitPrice,102);assert.equal(anchored.stopLossPrice,94);
assert.deepEqual(resolveSignalProtectionWorkingTypes(plan),{preserveSignalProtection:true,takeProfitWorkingType:'CONTRACT_PRICE',stopLossWorkingType:'MARK_PRICE'});
for(const exclusive of ['true','false']){
  const policy={now,orderEnabled:true,env:{AUTO_BINANCE_LIVE_CARD_ONLY:exclusive}};
  assert.equal(evaluateAutoBinanceEntryPolicy({...policy,payload:plan}).allowed,false);
  assert.equal(evaluateAutoBinanceEntryPolicy({...policy,payload:JSON.parse(JSON.stringify(authorizeEarlyWickOrder(plan)))}).allowed,false);
  assert.equal(evaluateAutoBinanceEntryPolicy({...policy,payload:authorizeEarlyWickOrder(plan)}).allowed,true);
}
const dir=await mkdtemp(join(tmpdir(),'early-wick-binance-'));
try{
  const controls=new AutoEntryControls(join(dir,'controls.json'));controls.seed([EARLY_WICK_ROUTE]);
  const key=entryRoute(EARLY_WICK_ROUTE).key,initial=controls.read();assert.equal(initial.routes[key].enabled,false);assert.equal(initial.routes[key].marginUsdt,3);
  initial.enabled=true;initial.routes[key].enabled=true;initial.routes[key].enabledAt=new Date(activation).toISOString();controls.save(initial);
  controls.assertEntry(plan);assert.throws(()=>controls.assertEntry({...plan,marginUsdt:2}),/cố định/);
  let ratioReads=0,accountReads=0,sends=0;
  const ctx={enabled:true,positions:[],openOrders:[],markPrice:e.price};
  const make=(opts={})=>new EarlyWickBinanceRunner({file:join(dir,'case'+Math.random()+'.json'),controls,now:()=>now,startedAt:activation,
    getRatioRows:async()=>{ratioReads++;return ratioRows;},getContext:async()=>{accountReads++;return ctx;},
    submit:async p=>{sends++;assert.equal(p.marginUsdt,3);return {status:'SUBMITTED',orderResult:{orderId:123}};},...opts});
  const runner=make();assert.equal((await runner.process(e)).status,'SUBMITTED');assert.equal(sends,1);
  assert.equal((await runner.process(e)).status,'DEDUPED');assert.equal(sends,1);
  const recovery={symbol:e.symbol,side:'BUY',orderId:123,clientOrderId:plan.clientOrderId};
  const restarted=new EarlyWickBinanceRunner({file:runner.file,controls,now:()=>now+86400000,startedAt:now,
    getRatioRows:async()=>{throw Error('no old ratio');},getContext:async()=>{throw Error('no old scan');},submit:async()=>{throw Error('no old MARKET');}});
  assert.deepEqual(await restarted.protectionPlanFor(recovery),plan);assert.equal((await restarted.process(e)).status,'DEDUPED');
  for(const change of [{side:'SELL'},{orderId:999},{clientOrderId:'wrong'},{symbol:'CFXUSDT'}])assert.equal(await restarted.protectionPlanFor({...recovery,...change}),null);
  const accountBefore=accountReads,sendsBefore=sends;
  for(const [opts,status]of [[{getRatioRows:async()=>ratioRows.map(r=>({...r,longShortRatio:2}))},'RATIO_NO_FLAT_THEN_BREAK'],
    [{getRatioRows:async()=>[]},'RATIO_STALE'],[{getRatioRows:async()=>{throw Error('public failed');}},'RATIO_UNAVAILABLE'],
    [{isProtectionExcluded:()=>true},'PROTECTION_DISABLED'],[{startedAt:now},'PRE_ENABLE_OR_STALE']]) {
    const r=make(opts);assert.equal((await r.process(e)).status,status);assert.equal(accountReads,accountBefore);assert.equal(sends,sendsBefore);
  }
  for(const [context,status]of [[{enabled:false},'RUNTIME_OFF'],[{enabled:true},'ACCOUNT_DATA_MISSING'],
    [{...ctx,positions:[{symbol:e.symbol,positionAmt:'1'}]},'EXISTING_POSITION'],[{...ctx,openOrders:[{symbol:e.symbol}]},'EXISTING_ORDER'],
    [{...ctx,positions:Array.from({length:50},(_,i)=>({symbol:'X'+i,positionAmt:'1'}))},'MAX_OPEN_POSITIONS'],
    [{...ctx,markPrice:e.price*1.006},'PRICE_OR_AGE_BLOCKED']])assert.equal((await make({getContext:async()=>context}).process(e)).status,status);
  const unknown=make({submit:async()=>{throw Error('unknown');}});assert.equal((await unknown.process(e)).status,'ERROR_OR_UNKNOWN');
  assert.equal((await unknown.process(e)).status,'DEDUPED');assert.deepEqual(await unknown.protectionPlanFor({...recovery,orderId:888}),plan);
  const reserved=make({submit:async()=>{const error=Error('reserved');error.code='CAUSAL_SIGNAL_RESERVATION';throw error;}});
  assert.equal((await reserved.process(e)).status,'SHARED_ENTRY_RESERVED');assert.equal(reserved.error,null);
  const offState=controls.read();offState.routes[key].enabled=false;controls.save(offState);
  assert.equal((await make().process(e)).status,'OFF');controls.save(initial);
  const corruptPath=join(dir,'corrupt.json');await writeFile(corruptPath,'{"version":"OLD","attempts":{}}');
  assert.equal((await make({file:corruptPath}).process(e)).status,'STATE_ERROR');assert.equal(await readFile(corruptPath,'utf8'),'{"version":"OLD","attempts":{}}');
  assert.equal((await make({storage:{load:async()=>null,save:async()=>{throw Error('disk');}}}).process(e)).status,'STATE_ERROR');
  const record=buildBinanceFilledSignalAuditRecord({symbol:e.symbol,side:'BUY',orderId:123,fillTime:now+1},
    {signalSource:EARLY_WICK_SOURCE,coinPumpWickEarlyAtEntry:plan.coinPumpWickEarlyAtEntry,coinPumpWickEarlyRatioProof:ratioProof,
      coinPumpWickEarlySignalId:e.id,coinPumpWickEarlyEntryVersion:EARLY_WICK_ENTRY_VERSION,marginUsdt:3});
  assert.deepEqual(record.coinPumpWickEarlyRatioProof,ratioProof);assert.equal('coinPumpWickEarlyAtEntry'in buildBinanceFilledSignalAuditRecord({symbol:e.symbol,side:'BUY'}),false);
  const closed={...record,positionStatus:'CLOSED',closedAt:new Date(now+60000).toISOString(),closeGroupId:'close1',netRealizedPnlUsdt:.3,marginUsdt:3};
  assert.deepEqual(earlyWickClosedStats({a:{record:closed},b:{record:{...closed,marginUsdt:2,netRealizedPnlUsdt:.2}}}),{closed:1,avgRoe:10});
  for(const change of [{positionStatus:'OPEN'},{isDca:true},{direction:'SHORT'},{coinPumpWickEarlyAtEntry:null},
    {coinPumpWickEarlyRatioProof:null},{coinPumpWickEarlyEntryVersion:'OLD'},{netRealizedPnlUsdt:null}])assert.deepEqual(earlyWickClosedStats({a:{record:{...closed,...change}}}),{closed:0,avgRoe:null});
  const cardKey=coinPumpWickEarlyKey('EARLY_WICK');assert.equal(normalizeLiquidLiveCardKey(cardKey),cardKey);
  assert(liquidLiveCardKeysOfTrade({side:'LONG',openedAt:record.filledAt,coinPumpWickEarlyAtEntry:record.coinPumpWickEarlyAtEntry}).includes(cardKey));
  // Alerts must not await the account/execution callback.
  let notify=0;let release;const pending=new Promise(r=>release=r);
  const monitor=new CoinPumpWickEarlyMonitor({now:()=>now,getRows:()=>rows,getSymbols:()=>[e.symbol],onEntry:()=>pending,pushSender:async()=>{notify++;return {sent:1};}});
  monitor.startedAt=activation;await monitor.scan();assert.equal(notify,1);assert.equal(monitor.history.length,1);release();

  const server=(await readFile('src/server.js','utf8')).replace(/\r\n/g,'\n');
  const start=server.indexOf('async function executePlaceOrder('),end=server.indexOf('\n  // LIMIT IOC:',start);
  function harness({positions=[],orders=[],excluded=false,mark=e.price,finalMark=mark,types=null,execution=true}={}) {
    const placed=[],audits=[],protectedPlans=[];let reads=0;
    const run=vm.runInNewContext(server.slice(start,end)+'\nreturn {orderResult,plannedOrder};\n}\nexecutePlaceOrder',{
      PUMP_TURN_NEAR_SOURCE:'pump-turn-near-short',STRUCTURE_SOURCE,RISING_VOLUME_SOURCE:'rising-volume-sustained-1m',MAIN_DISTANCE_SOURCE:'main-kill-distance-entry',ZONE_MANUAL_SOURCE:'liquidity-zone-manual',
      ordersTokens:new Map(),runtimeSettings:{orderEnabled:execution,dryRun:false},coinPumpWickEarly:{enabled:true,error:null},
      autoEntryControls:{assertEntry:p=>controls.assertEntry(p),read(){},isProtectionExcluded:()=>excluded},normalizeSymbol:s=>s,
      isBinanceProtectionExcluded:()=>excluded,shortStopLossSuppression:(side,source)=>({suppressed:shouldSuppressBotShortStopLoss({side,source})}),
      resolveSignalProtectionWorkingTypes,evaluateAutoBinanceEntryPolicy:x=>evaluateAutoBinanceEntryPolicy({...x,now}),AUTO_BINANCE_ENTRY_POLICY_VERSION:'test',
      validEarlyWickOrder:(p,m)=>validEarlyWickOrder(p,m,now),getSymbols:async()=>[{symbol:e.symbol,orderTypes:types}],
      client:{getPremiumIndex:async()=>({markPrice:reads++===0?mark:finalMark}),getPositions:async()=>positions,getOpenOrders:async()=>orders,
        setLeverage:async()=>({leverage:5}),placeFuturesOrder:async({params})=>{placed.push(params);return {orderId:456};}},
      priceFromTick:(_,p)=>String(p),quantityFromNotional:()=>'.15',isManualShortProtectionSource,resolveOrdersManualTakeProfit,resolveNonLiquidFlowV2TakeProfit,
      inspectLiquidFlowV2DcaPositions:()=>({hasExistingSameSide:false}),getHedgeMode:async()=>false,binanceFilledSignalAudit:{registerSubmission:async a=>audits.push(a)},
      rememberSignalProtectionPlan:p=>protectedPlans.push(p),signalProtectionPlans:new Map(),console:{log(){},warn(){}},process:{env:{}},Date});
    return {run,placed,audits,protectedPlans};
  }
  const h=harness();await h.run(authorizeEarlyWickOrder(plan),null,{});assert.equal(h.placed.length,1);assert.equal(h.placed[0].side,'BUY');
  assert.deepEqual(h.audits[0].coinPumpWickEarlyAtEntry,plan.coinPumpWickEarlyAtEntry);assert.equal(h.protectedPlans[0].stopLossDistanceFraction,.06);
  assert.equal(h.protectedPlans[0].takeProfitWorkingType,'CONTRACT_PRICE');assert.equal(h.protectedPlans[0].stopLossWorkingType,'MARK_PRICE');
  for(const opts of [{positions:[{symbol:e.symbol,positionAmt:'1'}]},{orders:[{symbol:e.symbol}]},{excluded:true},{execution:false},
    {types:['MARKET','TAKE_PROFIT_MARKET']},{finalMark:e.price*1.006}]){const h=harness(opts);await assert.rejects(h.run(authorizeEarlyWickOrder(plan),null,{}));assert.equal(h.placed.length,0);}
  const lockStart=server.indexOf('async function placeOrder('),lockEnd=server.indexOf('async function executePlaceOrder(',lockStart);
  let calls=0;const place=vm.runInNewContext(server.slice(lockStart,lockEnd)+'\nplaceOrder',{
    PUMP_TURN_NEAR_SOURCE:'pump-turn-near-short',STRUCTURE_SOURCE,causalSignalOrderQueue:Promise.resolve(),causalSignalOrderReservations:new Map(),normalizeSymbol:s=>s,Date,
    executePlaceOrder:async()=>{calls++;return 'done';},MAIN_DISTANCE_SOURCE:'main-kill-distance-entry',ZONE_MANUAL_SOURCE:'liquidity-zone-manual'});
  await place({source:EARLY_WICK_SOURCE,symbol:e.symbol});await assert.rejects(place({source:'rising-volume-sustained-1m',symbol:e.symbol}),/75s/);assert.equal(calls,1);
  const tpStart=server.indexOf('async function setTpSl(payload, token = null)'),tpEnd=server.indexOf('\nasync function getMarketSnapshot()',tpStart);
  function protectionHarness(hide=false){
    const placed=[];const run=vm.runInNewContext(server.slice(tpStart,tpEnd)+'\nsetTpSl',{
      PUMP_TURN_NEAR_SOURCE:'pump-turn-near-short',STRUCTURE_SOURCE,RISING_VOLUME_SOURCE:'rising-volume-sustained-1m',BINANCE_CLOSE_POSITION_PROTECTION_VERSION,BINANCE_MANUAL_SHORT_EMA99_TP_ONLY_VERSION:'manual',
      client:{getOpenOrders:async()=>[],getOpenAlgoOrders:async()=>hide?[]:placed,
        getPositions:async()=>[{symbol:e.symbol,positionAmt:'1',entryPrice:'100',leverage:'5',positionSide:'BOTH'}],getPremiumIndex:async()=>({markPrice:'100'}),
        placeAlgoOrder:async({params})=>{placed.push(params);return {algoId:placed.length};}},
      normalizeSymbol:s=>s,getApiCredentials:()=>({}),getSymbols:async()=>[{symbol:e.symbol}],
      resolveSignalProtectionWorkingTypes,
      shortStopLossSuppression:(side,source)=>({suppressed:shouldSuppressBotShortStopLoss({side,source})}),isTrackedManualShortTpOnlyPosition:()=>false,
      isBinanceProtectionExcluded:()=>false,resolveNonLiquidFlowV2TakeProfit,hasOpenProtectionOrder,buildClosePositionProtectionParams,
      priceFromTick:(_,p)=>p,console:{log(){}},process:{env:{}},Date});return{run,placed};
  }
  const p={symbol:e.symbol,source:EARLY_WICK_SOURCE,tpPrice:102,slPrice:94,...resolveSignalProtectionWorkingTypes(plan)},protect=protectionHarness();
  const protection=await protect.run(p);assert.equal(protection.hasTp,true);assert.equal(protection.hasSl,true);
  assert.deepEqual(protect.placed.map(o=>Number(o.triggerPrice)),[102,94]);
  assert.deepEqual(protect.placed.map(o=>o.workingType),['CONTRACT_PRICE','MARK_PRICE']);
  await assert.rejects(protectionHarness(true).run(p),/not confirmed both open legs/);
}finally{await rm(dir,{recursive:true,force:true});}
console.log('PASS EARLY wick + own top-account ratio DOWN -> LONG3x5 TP10/SL30: native auth, defaultOFF, pre-entry frozen proof, no old replay, guards/locks, fill audit/realclosed/whitelist, exact protection-only recovery, alerts do not wait for MARKET. Mock only.');
