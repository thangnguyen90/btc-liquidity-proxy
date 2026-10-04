import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mainDistanceCandidate,mainDistancePlan,validMainDistancePlan,MainKillDistanceRunner,mainDistanceClosedStats,MAIN_DISTANCE_ROUTES,mainDistanceRouteKey,mainDistanceOpenSlots} from '../src/mainKillDistanceEntry.js';
import {entryRoute} from '../src/autoEntryControls.js';
import {shouldSuppressBotShortStopLoss,resolveNonLiquidFlowV2TakeProfit} from '../src/shortTakeProfitPolicy.js';
import {resolveFillAnchoredProtectionPrices} from '../src/liveCardSignalProtection.js';
import {authorizeMainDistanceOrder,evaluateAutoBinanceEntryPolicy} from '../src/autoBinancePolicy.js';
const now=Date.now();
for(const route of MAIN_DISTANCE_ROUTES)assert.equal(mainDistanceRouteKey(route),entryRoute(route).key);
assert.equal(mainDistanceClosedStats({},'LONG').whitelistEligible,false);
const record={signalSource:'main-kill-distance-entry',streamId:'active-main-distance',signalLabel:'MAIN_KILL_DISTANCE_2_5',direction:'LONG',positionStatus:'CLOSED',marginUsdt:2,netRealizedPnlUsdt:.08,closeGroupId:'a'};
assert.equal(mainDistanceClosedStats({a:{record}},'LONG').whitelistEligible,false,'Exactly 4% stays hidden');
assert.equal(mainDistanceClosedStats({a:{record:{...record,netRealizedPnlUsdt:.1}}},'LONG').whitelistEligible,true);
assert.equal(mainDistanceClosedStats({a:{record:{...record,positionStatus:'OPEN',netRealizedPnlUsdt:10}}},'LONG').whitelistEligible,false);
const w={id:'one',symbol:'TAOUSDT',role:'MAIN_KILL',enabled:true,status:'ACTIVE',seen:{ACTIVE:true},socketFresh:true,priceAt:now-100,lastClosedAt:now-10000,markPrice:100,zone:{low:102.5,high:104},direction:'UPPER'};
const candidate=mainDistanceCandidate(w,now);assert.equal(candidate.side,'LONG');assert.equal(candidate.distancePct,2.5);
const otherPositions=Array.from({length:54},(_,i)=>({symbol:`OTHER${i}USDT`,positionAmt:1}));
assert.equal(mainDistanceOpenSlots({positions:otherPositions,fills:{},attempts:{},now}),0,'54 other positions do not consume MAIN slots');
const routePositions=Array.from({length:10},(_,i)=>({symbol:`MAIN${i}USDT`,positionAmt:i%2?'-1':'1'}));
const routeFills=Object.fromEntries(routePositions.map(p=>[p.symbol,{record:{...record,symbol:p.symbol,direction:Number(p.positionAmt)>0?'LONG':'SHORT',positionStatus:'OPEN',clientOrderId:`client-${p.symbol}`}}]));
const routeAttempts=Object.fromEntries(routePositions.map(p=>[p.symbol,{symbol:p.symbol,side:Number(p.positionAmt)>0?'LONG':'SHORT',status:'SUBMITTED',at:now-300000,clientOrderId:`client-${p.symbol}`} ]));
assert.equal(mainDistanceOpenSlots({positions:[...otherPositions,...routePositions],fills:routeFills,attempts:routeAttempts,now}),10,'Count live route positions once across audit and ledger, both sides');
assert.equal(mainDistanceOpenSlots({positions:[...otherPositions,...routePositions.slice(1)],fills:routeFills,attempts:routeAttempts,now}),9,'Closed position frees a slot despite stale OPEN audit record');
assert.equal(mainDistanceOpenSlots({positions:[],fills:{},attempts:{a:{symbol:'MAINUSDT',side:'LONG',status:'SUBMITTING',at:now-300000}},now}),1,'Unknown submission reserves capacity across restarts');
assert.equal(mainDistanceOpenSlots({positions:[],fills:{},attempts:{a:{symbol:'MAINUSDT',side:'LONG',status:'SUBMITTING',clientOrderId:'current'}},excludeClientOrderId:'current',now}),0,'Current reserved attempt does not double count at placeOrder');
assert.equal(mainDistanceOpenSlots({positions:[],fills:{},attempts:{a:{symbol:'MAINUSDT',side:'LONG',status:'ERROR_OR_UNKNOWN',error:'Max open positions (50) reached. Currently 54 open.'}},now}),0,'Old pre-submit max50 rejection is not an open trade');
assert.throws(()=>mainDistanceOpenSlots({positions:null}),/snapshot missing/);
assert.equal(mainDistanceOpenSlots({positions:[],fills:{},attempts:{a:{symbol:'MAINUSDT',side:'LONG',status:'ERROR_OR_UNKNOWN',orderId:null,error:"Order's notional must be no smaller than 5 (unless you choose reduce only)."}},now}),0,'Definitive notional rejection does not occupy a position slot');
const short={...w,direction:'LOWER',zone:{low:95,high:97.5}};
assert.equal(mainDistanceCandidate(short,now).side,'SHORT');
for(const changed of [{enabled:false},{role:'FAR_KILL'},{status:'TOUCHING'},{consumedAtCapture:true},{historyIncomplete:true},{seen:{PRICE_PASSED:true}},{seen:{CLOSED_BEYOND:true}},{seen:{REJECTED_AFTER_SWEEP:true}},{seen:undefined},{socketFresh:false},{priceAt:now-16000},{lastClosedAt:null},{lastClosedAt:now-400000},{direction:'LOWER'},{markPrice:101},{markPrice:103}])assert.equal(mainDistanceCandidate({...w,...changed},now),null,JSON.stringify(changed));
for(const watch of [w,short]){
  const p=mainDistancePlan(mainDistanceCandidate(watch,now),now);
  assert.equal(validMainDistancePlan(p,100,now),true);
  assert.equal(p.maxOpenPositions,10);assert.equal(p.maxOpenPositionsScope,'main-kill-distance-entry');
  for(const change of [{marginUsdt:4},{maxOpenPositions:50},{maxOpenPositionsScope:'global'},{leverage:10},{stopLossRoePct:20},{takeProfitDistanceFraction:.025},{takeProfitPrice:200},{entryExpiresAt:now-1}])assert.equal(validMainDistancePlan({...p,...change},100,now),false);
  assert.equal(shouldSuppressBotShortStopLoss({side:p.side,source:p.source}),false);
  assert.equal(resolveNonLiquidFlowV2TakeProfit({side:p.side,source:p.source,entryPrice:100,leverage:5,requestedTakeProfitPrice:p.takeProfitPrice}).takeProfitPrice,p.takeProfitPrice);
  const anchored=resolveFillAnchoredProtectionPrices({...p,fillPrice:101});
  assert.equal(anchored.takeProfitPrice,p.takeProfitPrice);assert.equal(anchored.stopLossPrice,101*(p.side==='BUY'?.94:1.06));
  assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeMainDistanceOrder(p),orderEnabled:true}).allowed,true);
  assert.equal(evaluateAutoBinanceEntryPolicy({payload:p,orderEnabled:true}).allowed,false,'Raw payload cannot authorize route');
}
const dir=await mkdtemp(join(tmpdir(),'main-distance-'));
try{
  let watches=[w],orders=0,pushes=0,enabled=true,excluded=false,contextHook=()=>{};
  const options={file:join(dir,'state.json'),now:()=>now,controls:{register:()=>({key:'r'}),read:()=>({enabled:true,routes:{r:{enabled,enabledAt:'fixed'}}}),assertEntry:()=>{}},
    getWatches:async()=>watches,isProtectionExcluded:()=>excluded,
    getContext:async()=>{contextHook();return {enabled:true,markPrice:100,positions:[],openOrders:[]};},
    submit:async()=>{orders++;return {status:'submitted',orderResult:{orderId:123}};},pushSender:async()=>{pushes++;return {sent:1};}};
  const runner=new MainKillDistanceRunner(options);
  enabled=false;await runner.tick();assert.equal(orders,0);
  enabled=true;excluded=true;await runner.tick();assert.equal(orders,0);
  excluded=false;contextHook=()=>{watches=[{...w,seen:{PRICE_PASSED:true}}];};await runner.tick();assert.equal(orders,0,'Recheck after context fetch');
  watches=[w];contextHook=()=>{};await Promise.all([runner.tick(),runner.tick()]);assert.equal(orders,1);assert.equal(pushes,1);
  await new MainKillDistanceRunner(options).tick();assert.equal(orders,1,'Restart does not replay');
  watches=[{...w,id:'readded'}];await runner.tick();assert.equal(orders,1,'Same frozen bounds cannot reenter by readding');
  const failed=new MainKillDistanceRunner({...options,file:join(dir,'failed.json'),submit:async()=>{orders++;throw Error('timeout');}});
  await failed.tick();await failed.tick();assert.equal(orders,2,'Ambiguous order is never retried');
  assert.equal(Object.values(JSON.parse(await readFile(join(dir,'failed.json'),'utf8')).attempts)[0].status,'ERROR_OR_UNKNOWN');
  let capPositions=[...otherPositions,...routePositions],capOrders=0;
  const capRunner=new MainKillDistanceRunner({...options,file:join(dir,'capacity.json'),getFills:async()=>routeFills,
    getContext:async()=>({enabled:true,markPrice:100,positions:capPositions,openOrders:[]}),submit:async()=>{capOrders++;return {status:'submitted'};}});
  await capRunner.tick();assert.equal(capOrders,0,'Ten scoped positions blocks entry despite valid signal');
  assert.equal(Object.keys(capRunner.state.attempts).length,0,'Waiting at capacity must not consume setup');
  capPositions=[...otherPositions,...routePositions.slice(1)];await capRunner.tick();assert.equal(capOrders,1,'Nine own plus 54 other allows entry');
  const legacyRunner=new MainKillDistanceRunner({...options,file:join(dir,'old-limit.json')});
  await legacyRunner.load();
  legacyRunner.state.attempts[candidate.key]={...candidate,status:'ERROR_OR_UNKNOWN',error:'Max open positions (50) reached. Currently 54 open.',orderId:null};
  await legacyRunner.save();const beforeRetry=orders;await legacyRunner.tick();assert.equal(orders,beforeRetry+1,'Known rejection before submitting may reevaluate under new scoped limit');
  assert.equal(legacyRunner.state.attempts[candidate.key].previousAttempts[0].error,'Max open positions (50) reached. Currently 54 open.');
  await legacyRunner.tick();assert.equal(orders,beforeRetry+1,'Successful retry still dedupes');
  const html=await readFile(new URL('../public/liquidity-zone-manager.html',import.meta.url),'utf8');
  assert.match(html,/value="MAIN_KILL" selected/);assert.match(html,/value="farthest" selected/);
}finally{await rm(dir,{recursive:true,force:true});}
console.log('MAIN distance eligibility, guards, TP boundary, SL30, authorization, dedupe and restart OK');
