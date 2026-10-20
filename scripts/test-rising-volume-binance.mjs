import assert from 'node:assert/strict';
import {STRUCTURE_SOURCE} from '../src/structureSetupBinance.js';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {AutoEntryControls,entryRoute} from '../src/autoEntryControls.js';
import {RisingVolumeBinanceRunner,RISING_VOLUME_ROUTES,RISING_VOLUME_SOURCE,RISING_VOLUME_BINANCE_VERSION,RISING_VOLUME_LEGACY_VERSION,
  buildRisingVolumeMarketOrder,isRisingVolumeEntrySignal,validRisingVolumeOrder,risingVolumeEntryId,buildRisingVolumeClosedStats} from '../src/risingVolumeBinance.js';
import {evaluateRisingVolume,RisingVolumeMonitor} from '../src/risingVolume.js';
import {authorizeRisingVolumeOrder,evaluateAutoBinanceEntryPolicy} from '../src/autoBinancePolicy.js';
import {shouldSuppressBotShortStopLoss,resolveNonLiquidFlowV2TakeProfit,resolveOrdersManualTakeProfit,isManualShortProtectionSource} from '../src/shortTakeProfitPolicy.js';
import {buildBinanceFilledSignalAuditRecord} from '../src/binanceFilledSignalAudit.js';
import {resolveFillAnchoredProtectionPrices} from '../src/liveCardSignalProtection.js';
import {buildClosePositionProtectionParams,BINANCE_CLOSE_POSITION_PROTECTION_VERSION} from '../src/binanceClosePositionProtection.js';
import {hasOpenProtectionOrder} from '../src/protectionOrderGuard.js';
import {liquidLiveCardKeysOfTrade,normalizeLiquidLiveCardKey} from '../src/liquidLiveCardWhitelist.js';
import {flowRows,flowTestNow as now} from './rising-volume-flow-fixtures.mjs';
import {ratioRowsFor,ratioProofFor} from './rising-volume-ratio-fixtures.mjs';
const clone=v=>JSON.parse(JSON.stringify(v)),activation=now-20000;
function signal({side='LONG',interval='1m',pattern='SUSTAINED',symbol='ONUSDT'}={}) {
  const minute=flowRows({side,pattern,now}),rows=interval==='1m'?minute:flowRows({interval,side,now});
  const snapshot=evaluateRisingVolume({symbol,interval,rows,rows1m:minute,now}).signal;
  return {id:risingVolumeEntryId(snapshot),snapshot};
}
const event=signal(),short=signal({side:'SHORT'}),options={now,enabledAt:activation,startedAt:activation,markPrice:event.snapshot.price,ratioProof:ratioProofFor(event,now)};
const plan=buildRisingVolumeMarketOrder(event,options);
assert(plan);assert.equal(plan.marginUsdt,2);assert.equal(plan.leverage,5);assert.equal(plan.notionalUsdt,10);
assert.equal(plan.takeProfitPrice,plan.signalEntryPrice*1.02);assert.equal(plan.stopLossPrice,plan.signalEntryPrice*.94);
assert.equal(plan.allowMinNotionalCeil,false);assert.equal(plan.fillAnchorEnabled,true);assert.equal(plan.stopLossRoePct,30);
assert.equal(validRisingVolumeOrder(plan,plan.signalEntryPrice,now),true);
assert.equal(isRisingVolumeEntrySignal(event),true);
for(const interval of ['5m','15m'])assert.equal(buildRisingVolumeMarketOrder(signal({interval}),options),null);
for(const pattern of ['BURSTY','OTHER'])assert.equal(buildRisingVolumeMarketOrder(signal({pattern}),options),null);
for(const snapshot of [{...event.snapshot,volumePattern:'BURSTY'}, {...event.snapshot,volumePatternSource:'FROZEN_CHART_LEGACY'},
  {...event.snapshot,volumePatternVersion:'OLD'}, {...event.snapshot,volume1mChart:[]}, {...event.snapshot,price:999}])
  assert.equal(buildRisingVolumeMarketOrder({id:event.id,snapshot},options),null);
assert.equal(buildRisingVolumeMarketOrder({...event,id:'forged'},options),null);
for(const change of [{enabledAt:now},{startedAt:now},{enabledAt:null},{now:now+71000},{markPrice:plan.signalEntryPrice*1.006}])
  assert.equal(buildRisingVolumeMarketOrder(event,{...options,...change}),null);
const shortPlan=buildRisingVolumeMarketOrder(short,{...options,markPrice:short.snapshot.price,ratioProof:ratioProofFor(short,now)});
assert.equal(shortPlan.marginUsdt,1);assert.equal(shortPlan.notionalUsdt,5);
assert.equal(buildRisingVolumeMarketOrder(event,{...options,ratioProof:null}),null);
assert.equal(shortPlan.side,'SELL');assert.equal(shortPlan.takeProfitPrice,shortPlan.signalEntryPrice*.98);
assert.equal(shortPlan.stopLossPrice,shortPlan.signalEntryPrice*1.06);
for(const p of [plan,shortPlan]) {
  const anchored=resolveFillAnchoredProtectionPrices({...p,fillPrice:105});
  assert.equal(anchored.rebased,true);
  assert.equal(anchored.takeProfitPrice,105*(p.side==='BUY'?1.02:.98));
  assert.equal(anchored.stopLossPrice,105*(p.side==='BUY'?.94:1.06));
}
assert.equal(shouldSuppressBotShortStopLoss({side:'SHORT',source:RISING_VOLUME_SOURCE}),false,'new SHORT keeps its SL30');
assert.equal(shouldSuppressBotShortStopLoss({side:'SHORT',source:'local-ai-liquidity-breakout-opposite-depth'}),true,'other bot policy unchanged');
for(const changed of [{marginUsdt:4},{leverage:10},{notionalUsdt:20},{takeProfitRoePct:15},{stopLossRoePct:20},
  {stopLossPrice:null},{allowMinNotionalCeil:true},{maxOpenPositions:100},{signalInterval:'5m'},{entryExpiresAt:now+1e6},
  {protectionOnFill:false},{fillAnchorEnabled:false},{symbol:'OTHERUSDT'},{side:'SELL'}])
  assert.equal(validRisingVolumeOrder({...plan,...changed},plan.signalEntryPrice,now),false);
assert.equal(validRisingVolumeOrder(plan,plan.signalEntryPrice*1.006,now),false);
assert.equal(validRisingVolumeOrder(plan,plan.signalEntryPrice,now+71000),false);
for(const exclusive of ['true','false']) {
  const policy={orderEnabled:true,now,env:{AUTO_BINANCE_LIVE_CARD_ONLY:exclusive}};
  assert.equal(evaluateAutoBinanceEntryPolicy({...policy,payload:plan}).allowed,false);
  assert.equal(evaluateAutoBinanceEntryPolicy({...policy,payload:clone(authorizeRisingVolumeOrder(plan))}).allowed,false,'JSON cannot mint server capability');
  assert.equal(evaluateAutoBinanceEntryPolicy({...policy,payload:authorizeRisingVolumeOrder(plan)}).allowed,true);
  assert.equal(evaluateAutoBinanceEntryPolicy({...policy,payload:authorizeRisingVolumeOrder({...plan,stopLossRoePct:20})}).allowed,false);
}

const dir=await mkdtemp(join(tmpdir(),'rising-volume-binance-'));
try {
  const controls=new AutoEntryControls(join(dir,'controls.json'));controls.seed(RISING_VOLUME_ROUTES);
  assert.equal(controls.read().enabled,false);
  for(const route of RISING_VOLUME_ROUTES) {
    const s=controls.read().routes[entryRoute(route).key];assert.equal(s.enabled,false);
    assert.equal(s.marginUsdt,route.side==='LONG'?2:1);assert.equal(s.leverage,5);assert.equal(s.takeProfitRoePct,10);assert.equal(s.stopLossRoePct,30);
  }
  const c=controls.read();c.enabled=true;
  for(const route of RISING_VOLUME_ROUTES)Object.assign(c.routes[entryRoute(route).key],{enabled:true,enabledAt:new Date(activation).toISOString()});
  controls.save(c);controls.assertEntry(plan);
  assert.throws(()=>controls.assertEntry({...plan,marginUsdt:4}),/cố định/);
  const context={enabled:true,positions:[],openOrders:[],markPrice:event.snapshot.price};
  let reads=0,sends=0;
  const runner=new RisingVolumeBinanceRunner({file:join(dir,'runner.json'),controls,now:()=>now,startedAt:activation,
    getRatioRows:async()=>ratioRowsFor(event),
    getContext:async()=>{reads++;return context;},submit:async p=>{sends++;assert.deepEqual(p.risingVolumeSnapshot,event.snapshot);return {status:'submitted',orderResult:{orderId:123}};}});
  assert.equal((await runner.process(event)).status,'SUBMITTED');assert.equal(sends,1);
  assert.equal((await runner.process(event)).status,'deduped');assert.equal(reads,1);assert.equal(sends,1);
  const reboot=new RisingVolumeBinanceRunner({file:join(dir,'runner.json'),controls,now:()=>now,startedAt:activation,
    getContext:async()=>{throw Error('No replay REST');},submit:async()=>{throw Error('No replay MARKET');}});
  assert.equal((await reboot.process(event)).status,'deduped');
  assert.equal(reboot.managementSnapshot().attempts[0].orderId,123);
  assert.equal('plan' in reboot.managementSnapshot().attempts[0],false);
  const recoveryArgs={symbol:plan.symbol,side:plan.side,orderId:123,clientOrderId:plan.clientOrderId};
  assert.deepEqual(await reboot.protectionPlanFor(recoveryArgs),plan,'exact durable plan survives restart without MARKET replay');
  for(const change of [{symbol:'OTHERUSDT'},{side:'SELL'},{orderId:999},{clientOrderId:'wrong'},{clientOrderId:null}])
    assert.equal(await reboot.protectionPlanFor({...recoveryArgs,...change}),null);
  reboot.now=()=>now+86400_000;
  assert.deepEqual(await reboot.protectionPlanFor(recoveryArgs),plan,'fill protection recovery does not borrow present-day data');
  assert.equal((await runner.process(signal({pattern:'BURSTY'}))).status,'ineligible');
  assert.equal(reads,1);
  async function scenario({ctx=context,excluded=()=>false,submit=async()=>({status:'submitted'}),start=activation,storage=null}={}) {
    let count=0;const file=join(dir,'case-'+Math.random()+'.json');
    const r=new RisingVolumeBinanceRunner({file,controls,now:()=>now,startedAt:start,storage,isProtectionExcluded:excluded,
      getRatioRows:async()=>ratioRowsFor(event),
      getContext:async()=>ctx,submit:async(...args)=>{count++;return submit(...args);}});
    return {r,result:await r.process(event),sends:()=>count};
  }
  for(const [ctx,status] of [[{...context,enabled:false},'RUNTIME_OFF'],[{enabled:true},'ACCOUNT_DATA_MISSING'],
    [{...context,positions:[{symbol:'ONUSDT',positionAmt:'-2'}]},'EXISTING_POSITION'],
    [{...context,openOrders:[{symbol:'ONUSDT',reduceOnly:false,closePosition:false}]},'EXISTING_ORDER'],
    [{...context,positions:Array.from({length:50},(_,i)=>({symbol:'X'+i,positionAmt:'1'}))},'MAX_OPEN_POSITIONS'],
    [{...context,markPrice:event.snapshot.price*1.006},'PRICE_OR_AGE_BLOCKED']]) {
    const tested=await scenario({ctx});assert.equal(tested.result.status,status);assert.equal(tested.sends(),0);
    assert.equal((await tested.r.process(event)).status,'deduped','blocked initial signals do not chase/retry');
  }
  assert.equal((await scenario({excluded:()=>true})).result.status,'PROTECTION_DISABLED');
  assert.equal((await scenario({start:now})).result.status,'pre-enable-or-stale');
  const error=await scenario({submit:async()=>{throw Error('ambiguous timeout');}});
  assert.equal(error.result.status,'ERROR_OR_UNKNOWN');assert.equal(error.sends(),1);
  assert.equal((await error.r.process(event)).status,'deduped');assert.equal(error.sends(),1);
  assert.deepEqual(await error.r.protectionPlanFor({...recoveryArgs,orderId:900}),plan,'verified ambiguous send can recover only protection');
  const failedSave=await scenario({storage:{load:async()=>null,save:async()=>{throw Error('disk failed');}}});
  assert.equal(failedSave.result.status,'state-error');assert.equal(failedSave.sends(),0);
  const corruptFile=join(dir,'corrupt.json');await writeFile(corruptFile,'{"version":"OLD","attempts":[]}');
  const corrupt=new RisingVolumeBinanceRunner({file:corruptFile,controls,now:()=>now});
  assert.equal((await corrupt.process(event)).status,'state-error');assert.equal(await readFile(corruptFile,'utf8'),'{"version":"OLD","attempts":[]}');
  let sequence=0;
  const race=await scenario({excluded:()=>++sequence>1});assert.equal(race.result.status,'PROTECTION_DISABLED');assert.equal(race.sends(),0);
  const old=controls.read();old.enabled=false;controls.save(old);
  const off=await scenario();assert.equal(off.result.status,'off');assert.equal(off.sends(),0);controls.save(c);

  // A SHORT-only pause must persist without pausing LONG, master or protection.
  const shortKey=entryRoute(RISING_VOLUME_ROUTES.find(r=>r.side==='SHORT')).key;
  const longKey=entryRoute(RISING_VOLUME_ROUTES.find(r=>r.side==='LONG')).key;
  const beforePause=controls.read();
  controls.update({action:'route',key:shortKey,enabled:false});
  const persisted=new AutoEntryControls(join(dir,'controls.json'));
  assert.equal(persisted.read().enabled,true);
  assert.equal(persisted.read().routes[shortKey].enabled,false);
  assert.equal(persisted.read().routes[shortKey].enabledAt,beforePause.routes[shortKey].enabledAt);
  assert.deepEqual(persisted.read().routes[longKey],beforePause.routes[longKey]);
  assert.throws(()=>persisted.assertEntry(shortPlan),/Auto Binance OFF/);
  persisted.assertEntry(plan);
  let directionReads=0,directionSends=0;
  const longOnly=new RisingVolumeBinanceRunner({file:join(dir,'long-only.json'),controls:persisted,
    getRatioRows:async()=>ratioRowsFor(event),
    now:()=>now,startedAt:activation,getContext:async()=>{directionReads++;return context;},
    submit:async()=>{directionSends++;return {status:'submitted',orderResult:{orderId:456}};}});
  assert.equal((await longOnly.process(short)).status,'off');
  assert.equal(directionReads,0);assert.equal(directionSends,0);
  assert.equal((await longOnly.process(event)).status,'SUBMITTED');
  assert.equal(directionSends,1);
  assert.deepEqual(await reboot.protectionPlanFor(recoveryArgs),plan);
  controls.save(c);

  // Freeze entry proof in new fills; old records must NOT be enriched by coin.
  const record=buildBinanceFilledSignalAuditRecord({symbol:'ONUSDT',side:'BUY',orderId:'123',fillTime:now+1},
    {signalSource:RISING_VOLUME_SOURCE,risingVolumeSnapshot:event.snapshot,risingVolumeSignalId:event.id,
      risingVolumeEntryVersion:RISING_VOLUME_BINANCE_VERSION,risingVolumeRatioProof:options.ratioProof,marginUsdt:2,leverage:5});
  assert.deepEqual(record.risingVolumeSnapshot,event.snapshot);
  assert.deepEqual(record.risingVolumeRatioProof,options.ratioProof);
  assert.equal('risingVolumeSnapshot' in buildBinanceFilledSignalAuditRecord({symbol:'ONUSDT',side:'BUY'}),false);
  const closed={...record,positionStatus:'CLOSED',closedAt:new Date(now+60000).toISOString(),closeGroupId:'close1',
    netRealizedPnlUsdt:.3,marginUsdt:3};
  const stats=buildRisingVolumeClosedStats({a:{record:closed},b:{record:{...closed,orderId:'124',netRealizedPnlUsdt:.2,marginUsdt:2}}});
  assert.deepEqual(stats['rising-volume:1m:LONG'],{closedCount:1,closedAvgRoe:10});
  assert.deepEqual(stats['rising-volume:flow-1m:SUSTAINED'],{closedCount:1,closedAvgRoe:10});
  for(const change of [{positionStatus:'OPEN'},{risingVolumeSnapshot:null},{risingVolumeEntryVersion:'OLD'},
    {risingVolumeRatioProof:null},
    {isDca:true},{netRealizedPnlUsdt:null},{filledAt:new Date(now-1).toISOString()},{direction:'SHORT'}])
    assert.deepEqual(buildRisingVolumeClosedStats({a:{record:{...closed,...change}}}),{});
  const legacyPlan={...plan,fillAnchorVersion:RISING_VOLUME_LEGACY_VERSION,marginUsdt:3,notionalUsdt:15};
  delete legacyPlan.risingVolumeRatioProof;
  assert.equal(validRisingVolumeOrder(legacyPlan,legacyPlan.signalEntryPrice,now),false,'old plan cannot place new MARKET');
  const oldState={version:RISING_VOLUME_LEGACY_VERSION,attempts:{[event.id]:{id:event.id,symbol:plan.symbol,side:'LONG',
    at:now,status:'SUBMITTED',orderId:123,clientOrderId:plan.clientOrderId,plan:legacyPlan,planBuiltAt:now}}};
  const legacy=new RisingVolumeBinanceRunner({controls,now:()=>now,startedAt:activation,storage:{load:async()=>oldState,save:async()=>{}},
    getContext:async()=>{throw Error('no old account scan');},submit:async()=>{throw Error('no old MARKET');}});
  assert.deepEqual(await legacy.protectionPlanFor(recoveryArgs),legacyPlan,'old exact 3USDT plan recovers protection only');
  assert.equal((await legacy.process(event)).status,'deduped');
  assert.deepEqual(buildRisingVolumeClosedStats({a:{record:{...closed,risingVolumeEntryVersion:RISING_VOLUME_LEGACY_VERSION,risingVolumeRatioProof:null}}})['rising-volume:1m:LONG'],{closedCount:1,closedAvgRoe:10});
  const monitor=new RisingVolumeMonitor({now:()=>now});await monitor.init();
  const cards=monitor.snapshot({closedStats:stats});assert.equal(cards.cohorts[0].closedAvgRoe,10);
  for(const key of ['rising-volume:1m:LONG','rising-volume:flow-1m:SUSTAINED']) {
    assert.equal(normalizeLiquidLiveCardKey(key),key);
    assert(liquidLiveCardKeysOfTrade({side:'LONG',openedAt:record.filledAt,risingVolumeSnapshot:record.risingVolumeSnapshot}).includes(key));
  }

  // Execute the actual shared MARKET prefix with fake Binance IO. This proves
  // both protection legs/fill fractions and final pre-submit guards, not just a builder.
  const server=(await readFile(new URL('../src/server.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
  const guardStart=server.indexOf('    if (plan.source===RISING_VOLUME_SOURCE && (protectionResult?.stopLossSuppressed');
  const guardEnd=server.indexOf('    if (protectionResult?.takeProfitPolicyVersion',guardStart);
  assert(guardStart>0&&guardEnd>guardStart);
  const guard=result=>vm.runInNewContext(server.slice(guardStart,guardEnd),{
    plan:{source:RISING_VOLUME_SOURCE},RISING_VOLUME_SOURCE,protectionResult:result,symbol:'ONUSDT'});
  guard({hasTp:true,hasSl:true});
  for(const result of [{hasTp:true,hasSl:false},{hasSl:true},{hasTp:true,hasSl:true,stopLossSuppressed:true}])
    assert.throws(()=>guard(result),/not both confirmed/);
  const start=server.indexOf('async function executePlaceOrder('),end=server.indexOf('\n  // LIMIT IOC:',start);
  assert(start>0&&end>start);
  function harness({positions=[],orders=[],excluded=false,mark=plan.signalEntryPrice,types=null,finalMark=mark,execution=true}={}) {
    const placed=[],protection=[],audits=[];
    const run=vm.runInNewContext(server.slice(start,end)+'\n return {orderResult,plannedOrder};\n}\nexecutePlaceOrder',{
      PUMP_TURN_NEAR_SOURCE:'pump-turn-near-short',STRUCTURE_SOURCE,RISING_VOLUME_SOURCE,MAIN_DISTANCE_SOURCE:'main-kill-distance-entry',ZONE_MANUAL_SOURCE:'liquidity-zone-manual',
      ordersTokens:new Map(),runtimeSettings:{orderEnabled:execution,dryRun:false},
      autoEntryControls:{assertEntry:p=>controls.assertEntry(p),read(){},isProtectionExcluded:()=>excluded},
      normalizeSymbol:s=>s,isBinanceProtectionExcluded:()=>excluded,
      shortStopLossSuppression:(side,source)=>({suppressed:shouldSuppressBotShortStopLoss({side,source})}),
      resolveSignalProtectionWorkingTypes:()=>({}),evaluateAutoBinanceEntryPolicy:input=>evaluateAutoBinanceEntryPolicy({...input,now}),
      AUTO_BINANCE_ENTRY_POLICY_VERSION:'test',validRisingVolumeOrder:(p,m)=>validRisingVolumeOrder(p,m,now),
      getSymbols:async()=>[{symbol:'ONUSDT',orderTypes:types}],
      client:{getPremiumIndex:async()=>({markPrice:placed.reads++===0?mark:finalMark}),getPositions:async()=>positions,
        getOpenOrders:async()=>orders,setLeverage:async()=>({leverage:5}),placeFuturesOrder:async args=>{placed.push(args.params);return {orderId:789};}},
      priceFromTick:(_,p)=>String(p),quantityFromNotional:()=>'.15',isManualShortProtectionSource,
      resolveOrdersManualTakeProfit,resolveNonLiquidFlowV2TakeProfit,
      inspectLiquidFlowV2DcaPositions:()=>({hasExistingSameSide:false}),getHedgeMode:async()=>false,
      binanceFilledSignalAudit:{registerSubmission:async a=>audits.push(a)},
      rememberSignalProtectionPlan:p=>protection.push(p),signalProtectionPlans:new Map(),
      console:{log(){},warn(){}},process:{env:{}},Date,
    });placed.reads=0;return {run,placed,protection,audits};
  }
  for(const p of [plan,shortPlan]) {
    const h=harness({mark:p.signalEntryPrice});const result=await h.run(authorizeRisingVolumeOrder(p),null,{});
    assert.equal(h.placed.length,1);assert.equal(h.placed[0].type,'MARKET');assert.equal(h.placed[0].side,p.side);
    assert.equal(result.plannedOrder.stopLossSuppressed,false);assert.equal(h.protection[0].stopLossDistanceFraction,.06);
    assert.equal(h.protection[0].takeProfitDistanceFraction,.02);assert.equal(h.protection[0].fillAnchorEnabled,true);
    assert.deepEqual(h.audits[0].risingVolumeSnapshot,event.snapshot.side===p.risingVolumeSnapshot.side?event.snapshot:short.snapshot);
  }
  for(const opts of [{positions:[{symbol:'ONUSDT',positionAmt:'-1'}]},
    {orders:[{symbol:'ONUSDT',reduceOnly:false}]},{excluded:true},{execution:false},
    {types:['MARKET','TAKE_PROFIT_MARKET']},{finalMark:plan.signalEntryPrice*1.006}]) {
    const h=harness(opts);await assert.rejects(h.run(authorizeRisingVolumeOrder(plan),null,{}));assert.equal(h.placed.length,0);
  }
  const tpStart=server.indexOf('async function setTpSl(payload, token = null)'),tpEnd=server.indexOf('\nasync function getMarketSnapshot()',tpStart);
  function protectionHarness(side,hidePlaced=false) {
    const placed=[];
    const run=vm.runInNewContext(server.slice(tpStart,tpEnd)+'\nsetTpSl',{
      PUMP_TURN_NEAR_SOURCE:'pump-turn-near-short',STRUCTURE_SOURCE,RISING_VOLUME_SOURCE,BINANCE_CLOSE_POSITION_PROTECTION_VERSION,BINANCE_MANUAL_SHORT_EMA99_TP_ONLY_VERSION:'manual',
      client:{getOpenOrders:async()=>[],getOpenAlgoOrders:async()=>hidePlaced?[]:placed,
        getPositions:async()=>[{symbol:'ONUSDT',positionAmt:side==='BUY'?'1':'-1',entryPrice:'100',leverage:'5',positionSide:'BOTH'}],
        getPremiumIndex:async()=>({markPrice:'100'}),placeAlgoOrder:async({params})=>{placed.push(params);return {algoId:placed.length};}},
      normalizeSymbol:s=>s,getApiCredentials:()=>({}),getSymbols:async()=>[{symbol:'ONUSDT'}],
      resolveSignalProtectionWorkingTypes:()=>({takeProfitWorkingType:'CONTRACT_PRICE',stopLossWorkingType:'MARK_PRICE'}),
      shortStopLossSuppression:(side,source)=>({suppressed:shouldSuppressBotShortStopLoss({side,source})}),
      isTrackedManualShortTpOnlyPosition:()=>false,isBinanceProtectionExcluded:()=>false,
      resolveNonLiquidFlowV2TakeProfit,hasOpenProtectionOrder,buildClosePositionProtectionParams,
      priceFromTick:(_,p)=>Number(p.toFixed(6)),console:{log(){}},process:{env:{}},Date,
    });return {run,placed};
  }
  for(const side of ['BUY','SELL']) {
    const p={symbol:'ONUSDT',source:RISING_VOLUME_SOURCE,tpPrice:side==='BUY'?102:98,slPrice:side==='BUY'?94:106};
    const h=protectionHarness(side),result=await h.run(p);
    assert.equal(result.hasTp,true);assert.equal(result.hasSl,true);assert.equal(result.stopLossSuppressed,false);
    assert.deepEqual(h.placed.map(o=>Number(o.triggerPrice)),[p.tpPrice,p.slPrice],'production protection keeps TP10, not generic SHORT TP6');
    const missing=protectionHarness(side,true);await assert.rejects(missing.run(p),/not confirmed both open legs/);
  }
} finally {await rm(dir,{recursive:true,force:true});}
console.log('Rising volume Binance passed: sustained1m + top-account ratio, LONG2/SHORT1 x5 TP10 SL30, legacy3 protection/stats only, native auth/fill-anchor/guards/dedupe. Mock exchange only.');
