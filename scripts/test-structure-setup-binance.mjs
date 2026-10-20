import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {gzipSync,gunzipSync} from 'node:zlib';
import {detectShortSetup,detectLongSetup,advanceShortSetup,ShortSetupWatch} from '../src/shortSetupWatch.js';
import {StructureSetupRunner,STRUCTURE_SOURCE,STRUCTURE_ENTRY_VERSION,STRUCTURE_ROUTES,structureRouteKey,
  validStructureSignal,buildStructureOrder,validStructureOrder,structureOpenSlots} from '../src/structureSetupBinance.js';
import {AutoEntryControls} from '../src/autoEntryControls.js';
import {authorizeStructureOrder,evaluateAutoBinanceEntryPolicy} from '../src/autoBinancePolicy.js';
import {shouldSuppressBotShortStopLoss,resolveNonLiquidFlowV2TakeProfit,resolveOrdersManualTakeProfit,isManualShortProtectionSource} from '../src/shortTakeProfitPolicy.js';
import {buildBinanceFilledSignalAuditRecord} from '../src/binanceFilledSignalAudit.js';
import {resolveFillAnchoredProtectionPrices,resolveSignalProtectionWorkingTypes} from '../src/liveCardSignalProtection.js';
import {buildClosePositionProtectionParams,BINANCE_CLOSE_POSITION_PROTECTION_VERSION} from '../src/binanceClosePositionProtection.js';
import {hasOpenProtectionOrder} from '../src/protectionOrderGuard.js';
const MIN=60000,start=Date.UTC(2026,9,12,0,0),clone=x=>JSON.parse(JSON.stringify(x));
const rows=Array.from({length:80},(_,i)=>{
  const close=i<40?100+Math.sin(i)*.2:100.8+(i-40)*.1;
  return {openTime:start+i*MIN,closeTime:start+(i+1)*MIN-1,open:close-.03,high:close+.1,low:close-.1,close,
    quoteVolume:i<40?10000:20000,takerBuyQuoteVolume:i<40?5000:13000};
});
rows[61].high=105.2;rows[71].high=105.15;
rows.push({openTime:start+80*MIN,closeTime:start+81*MIN-1,open:105.1,high:105.55,low:104.7,close:104.8,quoteVolume:50000,takerBuyQuoteVolume:15000});
const candle={openTime:start+81*MIN,closeTime:start+82*MIN-1,open:104.7,high:104.85,low:104.45,close:104.5,quoteVolume:50000,takerBuyQuoteVolume:15000};
const reflect=r=>({...r,open:205-r.open,close:205-r.close,high:205-r.low,low:205-r.high,takerBuyQuoteVolume:r.quoteVolume-r.takerBuyQuoteVolume});
let now=candle.closeTime+1000;
const initial=detectShortSetup({symbol:'TESTUSDT',rows,now:rows.at(-1).closeTime+1000}).row;
const short=advanceShortSetup(initial,candle,rows.at(-1),now);
const longInitial=detectLongSetup({symbol:'LONGUSDT',rows:rows.map(reflect),now:rows.at(-1).closeTime+1000}).row;
const long=advanceShortSetup(longInitial,reflect(candle),reflect(rows.at(-1)),now);
const startedAt=start+80*MIN,enabledAt=startedAt;
for(const e of [short,long]) {
  assert.equal(validStructureSignal(e),true);
  const p=buildStructureOrder(e,{now,enabledAt,startedAt,markPrice:e.price});assert.ok(p);
  assert.equal(p.marginUsdt,1);assert.equal(p.leverage,5);assert.equal(p.notionalUsdt,5);assert.equal(p.maxOpenPositions,15);
  assert.equal(p.maxOpenPositionsScope,STRUCTURE_SOURCE);assert.equal(p.allowMinNotionalCeil,false);
  assert.equal(validStructureOrder(p,e.price,now),true);
  assert.equal(evaluateAutoBinanceEntryPolicy({payload:p,orderEnabled:true,now}).allowed,false);
  assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeStructureOrder(p),orderEnabled:true,now}).allowed,true);
  assert.equal(evaluateAutoBinanceEntryPolicy({payload:clone(authorizeStructureOrder(p)),orderEnabled:true,now}).allowed,false);
  assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeStructureOrder(p),orderEnabled:false,now}).allowed,false);
  assert.equal(shouldSuppressBotShortStopLoss({side:p.side,source:p.source}),false);
  const direction=e.side==='LONG'?1:-1;
  assert.ok(Math.abs(p.takeProfitPrice/e.price-1-direction*.02)<1e-9);
  assert.ok(Math.abs(p.stopLossPrice/e.price-1+direction*.06)<1e-9);
  for(const change of [{marginUsdt:2},{notionalUsdt:10},{leverage:10},{maxOpenPositions:50},{maxOpenPositionsScope:'global'},
    {stopLossRoePct:25},{takeProfitRoePct:6},{takeProfitPrice:e.price},{stopLossPrice:e.price},{protectionOnFill:false},
    {side:p.side==='BUY'?'SELL':'BUY'},{allowMinNotionalCeil:true},{clientOrderId:'ssr_forged'},{entryExpiresAt:now+120000}])
    assert.equal(validStructureOrder({...p,...change},e.price,now),false,JSON.stringify(change));
  assert.equal(validStructureOrder(p,e.price,now+71000),false);
  assert.equal(validStructureOrder(p,e.price*1.006,now),false);
  assert.equal(buildStructureOrder(e,{now,enabledAt:now,startedAt,markPrice:e.price}),null);
  assert.equal(buildStructureOrder(e,{now,enabledAt,startedAt:now,markPrice:e.price}),null);
  for(const change of [{originRows:undefined},{transitionRows:[]},{state:'WATCH'},{rewardRisk:9},{targetPrice:e.targetPrice*2},
    {pattern:'FAKE'},{triggeredAt:e.updatedAt-60000},{context:{...e.context,atr:99}}])assert.equal(validStructureSignal({...e,...change}),false);
  const gap=clone(e);gap.originRows.splice(50,1);assert.equal(validStructureSignal(gap),false);
  const future=clone(e);future.transitionRows.at(-1).closeTime=now+60000;assert.equal(validStructureSignal(future),false);
}
assert.equal(shouldSuppressBotShortStopLoss({side:'SELL',source:'other-bot'}),true,'do not change other SHORT rules');
const lots=Array.from({length:60},(_,i)=>({symbol:`OTHER${i}USDT`,positionAmt:1}));
assert.equal(structureOpenSlots({positions:lots}),0,'global positions do not count');
const attempts=Object.fromEntries(Array.from({length:15},(_,i)=>[String(i),{id:String(i),symbol:`OWN${i}USDT`,side:i%2?'SHORT':'LONG',status:'SUBMITTING',clientOrderId:`own${i}`,at:now}]));
assert.equal(structureOpenSlots({positions:lots,attempts,now}),15);
assert.equal(structureOpenSlots({positions:lots,attempts,now,excludeClientOrderId:'own0'}),14);
const fills={closed:{record:{signalSource:STRUCTURE_SOURCE,structureSetupEntryVersion:STRUCTURE_ENTRY_VERSION,positionStatus:'CLOSED',clientOrderId:'own0'}}};
assert.equal(structureOpenSlots({positions:lots,attempts,fills,now}),14);
const live={symbol:'OLDUSDT',positionAmt:-1};
const ownFill={signalSource:STRUCTURE_SOURCE,structureSetupEntryVersion:STRUCTURE_ENTRY_VERSION,symbol:'OLDUSDT',direction:'SHORT',positionStatus:'OPEN'};
assert.equal(structureOpenSlots({positions:[...lots,live],fills:{x:ownFill},now}),1);
assert.equal(structureOpenSlots({positions:[...lots,live],fills:{x:{...ownFill,signalSource:'other'}},now}),0);
assert.equal(structureOpenSlots({positions:[],attempts:{x:{symbol:'XUSDT',side:'LONG',status:'ERROR_OR_UNKNOWN',at:now-20*86400000}},now}),1);
const dir=await mkdtemp(join(tmpdir(),'structure-ready-')),controls=new AutoEntryControls(join(dir,'controls.json'));
controls.seed(STRUCTURE_ROUTES);for(const r of STRUCTURE_ROUTES)assert.equal(controls.read().routes[structureRouteKey(r.side)].enabled,false);
controls.update({action:'master',enabled:true});
for(const r of STRUCTURE_ROUTES)controls.update({action:'route',key:structureRouteKey(r.side),enabled:true});
// Use deterministic activation timestamps rather than host clock in mocked tests.
const settings=controls.read();for(const r of Object.values(settings.routes))r.enabledAt=enabledAt;controls.save(settings);
let calls=0,stored=null,context={enabled:true,positions:lots,openOrders:[],markPrice:short.price};
const storage={load:async()=>stored,save:async v=>{stored=clone(v);}};
const runner=new StructureSetupRunner({controls,storage,startedAt,now:()=>now,getContext:async()=>context,
  submit:async p=>{assert.equal(stored.attempts[p.structureSetupSignalId].status,'SUBMITTING');calls++;return {status:'SUBMITTED',orderResult:{orderId:123}};}});
assert.equal((await runner.process(short)).status,'SUBMITTED');assert.equal(calls,1);
assert.equal((await runner.process(short)).status,'DEDUPED');
assert.equal((await runner.protectionPlanFor({symbol:'TESTUSDT',side:'SELL',orderId:123,clientOrderId:stored.attempts[short.id].clientOrderId})).source,STRUCTURE_SOURCE);
assert.equal(await runner.protectionPlanFor({symbol:'TESTUSDT',side:'BUY',orderId:123,clientOrderId:stored.attempts[short.id].clientOrderId}),null);
assert.equal(await runner.protectionPlanFor({symbol:'TESTUSDT',side:'SELL',orderId:999,clientOrderId:stored.attempts[short.id].clientOrderId}),null);
const restarted=new StructureSetupRunner({controls,storage,startedAt:now,now:()=>now,getContext:async()=>context,submit:async()=>{calls++;}});
assert.equal((await restarted.process(short)).status,'DEDUPED');assert.equal(calls,1);
for(const [test,expected] of [
  [{positions:[...lots,{symbol:'TESTUSDT',positionAmt:1}]},'EXISTING_POSITION'],
  [{openOrders:[{symbol:'TESTUSDT',reduceOnly:false}]},'EXISTING_ORDER'],
  [{enabled:false},'RUNTIME_OFF'],[{positions:null},'ACCOUNT_DATA_MISSING'],[{markPrice:120},'PRICE_RR_OR_AGE_BLOCKED']]) {
  const state={};const r=new StructureSetupRunner({controls,startedAt,now:()=>now,storage:{load:async()=>null,save:async v=>Object.assign(state,clone(v))},
    getContext:async()=>({...context,...test}),submit:async()=>{throw Error('must not submit');}});
  assert.equal((await r.process(short)).status,expected);
}
const full=new StructureSetupRunner({controls,startedAt,now:()=>now,storage:{load:async()=>({version:STRUCTURE_ENTRY_VERSION,attempts}),save:async()=>{}},getContext:async()=>context,submit:async()=>{throw Error('must not submit');}});
assert.equal((await full.process(short)).status,'MAX_STRUCTURE_15');
const failing=new StructureSetupRunner({controls,startedAt,now:()=>now,storage:{load:async()=>null,save:async()=>{}},getContext:async()=>context,
  submit:async()=>{throw Error('transport timeout');}});
assert.equal((await failing.process(short)).status,'ERROR_OR_UNKNOWN');assert.equal((await failing.process(short)).status,'DEDUPED');
const rejected=new StructureSetupRunner({controls,startedAt,now:()=>now,storage:{load:async()=>null,save:async()=>{}},getContext:async()=>context,
  submit:async()=>{const e=Error('Order notional below minimum');e.beforeStructureMarket=true;throw e;}});
assert.equal((await rejected.process(short)).status,'BLOCKED_PRE_SUBMIT');assert.equal(structureOpenSlots({positions:[],attempts:rejected.state.attempts,now}),0);
const noSave=new StructureSetupRunner({controls,startedAt,now:()=>now,storage:{load:async()=>null,save:async()=>{throw Error('disk');}},getContext:async()=>{throw Error('must not fetch');}});
assert.equal((await noSave.process(short)).status,'STATE_ERROR');
// Monitor callback still runs with both channels OFF, exactly once at the transition, never on historical READY.
let clock=rows.at(-1).closeTime+1000,cache=rows,events=[];
const watch=new ShortSetupWatch({file:join(dir,'watch.json'),now:()=>clock,getRows:()=>cache,getSymbols:()=>['TESTUSDT'],onEntry:async e=>events.push(e)});
await watch.init();watch.pushEnabled=false;watch.discordEnabled=false;await watch.scan();
clock=now;cache=[...rows,candle];await watch.scan();await watch.scan();assert.equal(events.length,1);assert.ok(validStructureSignal(events[0]));
assert.equal(watch.snapshot().live[0].originRows,undefined);
const historyReload=new ShortSetupWatch({file:join(dir,'watch.json'),now:()=>clock,getRows:()=>cache,getSymbols:()=>['TESTUSDT'],onEntry:async e=>events.push(e)});
await historyReload.init();await historyReload.scan();assert.equal(events.length,1);
const badFile=join(dir,'bad.json');await writeFile(badFile,'{');
const bad=new StructureSetupRunner({file:badFile,controls,startedAt,now:()=>now});assert.equal((await bad.process(short)).status,'STATE_ERROR');assert.equal(await readFile(badFile,'utf8'),'{');
const server=(await readFile('src/server.js','utf8')).replace(/\r\n/g,'\n');
const zipStart=server.indexOf('function sendStructureSetupJson('),zipEnd=server.indexOf('\nasync function sendJson(',zipStart);
const sendReadOnly=vm.runInNewContext(server.slice(zipStart,zipEnd)+'\nsendStructureSetupJson',{Buffer,gzipSync});
for(const encoding of ['', 'gzip', 'br, gzip, deflate', 'gzip;q=0', 'gzip;q=0.5']) {
  let headers,body;sendReadOnly({headers:{'accept-encoding':encoding}},{writeHead:(_,h)=>headers=h,end:b=>body=b},{binance:{max:15},chart:rows});
  assert.deepEqual(JSON.parse(headers['content-encoding']?gunzipSync(body).toString():body.toString()),{binance:{max:15},chart:rows});
  assert.equal(headers['content-length'],body.length);assert.equal(headers['cache-control'],'no-store');
  assert.equal(headers['content-encoding']==='gzip',encoding.includes('gzip')&&encoding!=='gzip;q=0');
}
assert.match(server,/onEntry:e=>structureSetupRunner\.process\(e\)/);assert.match(server,/startsWith\('ssr_'\)/);
assert.match(server,/structureOpenSlots\(\{positions:latest\.positions/);assert.match(server,/executionContext\.structureMarketSent=true/);
const readyStart=server.indexOf('function structureStillReady('),readyEnd=server.indexOf('\nfunction sampledCoinLiquidations(',readyStart);
let currentState='READY',lastCandle=candle;
const stillReady=vm.runInNewContext(server.slice(readyStart,readyEnd)+'\nstructureStillReady',{
  shortSetupWatch:{error:null,history:[short]},klineCache:{getIfCached:()=>[...rows,lastCandle]},
  wickClosedRows:(input)=>input,Date,
});
const frozenPlan=buildStructureOrder(short,{now,enabledAt,startedAt,markPrice:short.price});
assert.equal(stillReady(frozenPlan),true);const originalState=short.state;short.state='INVALIDATED';assert.equal(stillReady(frozenPlan),false);short.state=originalState;
lastCandle={...candle,closeTime:candle.closeTime+60000};assert.equal(stillReady(frozenPlan),false);lastCandle=candle;
// Execute production MARKET and protection functions with mock Binance, not a source regex alone.
const executeStart=server.indexOf('async function executePlaceOrder('),executeEnd=server.indexOf('\n  // LIMIT IOC:',executeStart);
const tpStart=server.indexOf('async function setTpSl(payload, token = null)'),tpEnd=server.indexOf('\nasync function getMarketSnapshot()',tpStart);
function executionHarness(p,{positions=lots,orders=[],excluded=false,finalMark=p.signalEntryPrice,types=null,attempts={},minimum=false,stillReady=true}={}) {
  const placed=[],audits=[],plans=[];let reads=0;
  const execution=vm.runInNewContext(server.slice(executeStart,executeEnd)+'\nreturn {orderResult,plannedOrder};\n}\nexecutePlaceOrder',{
    PUMP_TURN_NEAR_SOURCE:'pump-turn-near-short',STRUCTURE_SOURCE,RISING_VOLUME_SOURCE:'rising-volume-sustained-1m',MAIN_DISTANCE_SOURCE:'main-kill-distance-entry',ZONE_MANUAL_SOURCE:'liquidity-zone-manual',
    ordersTokens:new Map(),runtimeSettings:{orderEnabled:true,dryRun:false},shortSetupWatch:{error:null},structureStillReady:()=>stillReady,
    autoEntryControls:{assertEntry:x=>controls.assertEntry(x),isProtectionExcluded:()=>excluded},
    normalizeSymbol:s=>s,isBinanceProtectionExcluded:()=>excluded,
    shortStopLossSuppression:(side,source)=>({suppressed:shouldSuppressBotShortStopLoss({side,source})}),resolveSignalProtectionWorkingTypes,
    evaluateAutoBinanceEntryPolicy:x=>evaluateAutoBinanceEntryPolicy({...x,now}),AUTO_BINANCE_ENTRY_POLICY_VERSION:'mock',
    validStructureOrder:(x,m)=>validStructureOrder(x,m,now),structureOpenSlots,structureSetupRunner:{state:{attempts}},
    getSymbols:async()=>[{symbol:p.symbol,orderTypes:types}],
    client:{getPremiumIndex:async()=>({markPrice:reads++===0?p.signalEntryPrice:finalMark}),getPositions:async()=>positions,getOpenOrders:async()=>orders,
      setLeverage:async()=>({leverage:5}),placeFuturesOrder:async({params})=>{placed.push(params);return {orderId:456};}},
    ema99NearRejectRunner:{getContext:async()=>({enabled:true,positions,openOrders:orders,markPrice:finalMark})},
    priceFromTick:(_,v)=>String(v),quantityFromNotional:(_,n,price,dryRun,o)=>{assert.equal(n,5);assert.equal(o.allowMinNotionalCeil,false);if(minimum)throw Error('Order notional below minimum');return '.05';},
    isManualShortProtectionSource,resolveOrdersManualTakeProfit,resolveNonLiquidFlowV2TakeProfit,
    inspectLiquidFlowV2DcaPositions:()=>({hasExistingSameSide:false}),getHedgeMode:async()=>false,
    binanceFilledSignalAudit:{init:async()=>({fills:{}}),registerSubmission:async a=>audits.push(a)},
    rememberSignalProtectionPlan:p=>plans.push(p),signalProtectionPlans:new Map(),console:{log(){},warn(){}},process:{env:{}},Date,
  });return {execution,placed,audits,plans};
}
function protectionHarness(p,hide=false) {
  const placed=[],long=p.side==='BUY';
  const run=vm.runInNewContext(server.slice(tpStart,tpEnd)+'\nsetTpSl',{
    PUMP_TURN_NEAR_SOURCE:'pump-turn-near-short',STRUCTURE_SOURCE,RISING_VOLUME_SOURCE:'rising-volume-sustained-1m',BINANCE_CLOSE_POSITION_PROTECTION_VERSION,BINANCE_MANUAL_SHORT_EMA99_TP_ONLY_VERSION:'manual',
    client:{getOpenOrders:async()=>[],getOpenAlgoOrders:async()=>hide?[]:placed,
      getPositions:async()=>[{symbol:p.symbol,positionAmt:long?'1':'-1',entryPrice:'100',leverage:'5',positionSide:'BOTH'}],
      getPremiumIndex:async()=>({markPrice:100}),placeAlgoOrder:async({params})=>{placed.push(params);return {algoId:placed.length};}},
    normalizeSymbol:s=>s,getApiCredentials:()=>({}),getSymbols:async()=>[{symbol:p.symbol}],resolveSignalProtectionWorkingTypes,
    shortStopLossSuppression:(side,source)=>({suppressed:shouldSuppressBotShortStopLoss({side,source})}),
    isTrackedManualShortTpOnlyPosition:()=>false,isBinanceProtectionExcluded:()=>false,resolveNonLiquidFlowV2TakeProfit,hasOpenProtectionOrder,buildClosePositionProtectionParams,
    priceFromTick:(_,v)=>v,console:{log(){}},process:{env:{}},Date,
  });return {run,placed};
}
for(const e of [short,long]) {
  const p=buildStructureOrder(e,{now,enabledAt,startedAt,markPrice:e.price});
  const h=executionHarness(p),context={structureMarketSent:false};
  const result=await h.execution(authorizeStructureOrder(p),null,{},context);
  assert.equal(h.placed.length,1);assert.equal(h.placed[0].side,p.side);assert.equal(h.placed[0].type,'MARKET');assert.equal(context.structureMarketSent,true);
  assert.equal(result.plannedOrder.stopLossSuppressed,false);assert.equal(h.plans[0].takeProfitDistanceFraction,.02);assert.equal(h.plans[0].stopLossDistanceFraction,.06);
  const record=buildBinanceFilledSignalAuditRecord({symbol:e.symbol,side:p.side,orderId:456,fillTime:now+1},h.audits[0]);
  assert.equal(record.structureSetupEntryVersion,STRUCTURE_ENTRY_VERSION);assert.equal(record.structureSetupSignalId,e.id);assert.deepEqual(record.structureSetupAtEntry,e);
  const fillPrices=resolveFillAnchoredProtectionPrices({...p,fillPrice:100});
  assert.equal(fillPrices.takeProfitPrice,p.side==='BUY'?102:98);assert.equal(fillPrices.stopLossPrice,p.side==='BUY'?94:106);
  const protect=protectionHarness(p);const input={symbol:p.symbol,source:STRUCTURE_SOURCE,tpPrice:p.side==='BUY'?102:98,slPrice:p.side==='BUY'?94:106};
  const protection=await protect.run(input);assert.equal(protection.hasTp,true);assert.equal(protection.hasSl,true);
  assert.deepEqual(protect.placed.map(o=>Number(o.triggerPrice)),[input.tpPrice,input.slPrice]);
  await assert.rejects(protectionHarness(p,true).run(input),/not confirmed both open legs/);
  for(const opts of [{positions:[...lots,{symbol:p.symbol,positionAmt:1}]},{orders:[{symbol:p.symbol}]},{excluded:true},
    {finalMark:p.signalEntryPrice*1.006},{types:['MARKET','TAKE_PROFIT_MARKET']},{attempts},{minimum:true},{stillReady:false}]) {
    const h=executionHarness(p,opts);await assert.rejects(h.execution(authorizeStructureOrder(p),null,{},{}));assert.equal(h.placed.length,0);
  }
}
const lockStart=server.indexOf('async function placeOrder('),lockEnd=server.indexOf('async function executePlaceOrder(',lockStart);
let transports=0;const locked=vm.runInNewContext(server.slice(lockStart,lockEnd)+'\nplaceOrder',{
  PUMP_TURN_NEAR_SOURCE:'pump-turn-near-short',STRUCTURE_SOURCE,MAIN_DISTANCE_SOURCE:'main-kill-distance-entry',ZONE_MANUAL_SOURCE:'liquidity-zone-manual',causalSignalOrderQueue:Promise.resolve(),causalSignalOrderReservations:new Map(),normalizeSymbol:s=>s,Date,
  executePlaceOrder:async()=>{transports++;return 'mock';},
});
await locked({source:STRUCTURE_SOURCE,symbol:'TESTUSDT'});await assert.rejects(locked({source:'rising-volume-sustained-1m',symbol:'TESTUSDT'}),/75s/);assert.equal(transports,1);
console.log('structure READY MARKET: causal proof, both sides, own cap15, guards, durable intent and new-only tests passed');
