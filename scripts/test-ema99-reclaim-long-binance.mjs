import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {EMA99_PULLBACK_LONG_VERSION,ema99PullbackLongPayload} from '../src/ema99PullbackLong.js';
import {buildEma99ReclaimLongOrder,EMA99_RECLAIM_LONG_ROUTE} from '../src/ema99ReclaimLongBinance.js';
import {Ema99NearRejectRunner} from '../src/ema99NearRejectBinance.js';
import {AutoEntryControls} from '../src/autoEntryControls.js';
import {authorizeEma99ReclaimLongOrder,evaluateAutoBinanceEntryPolicy} from '../src/autoBinancePolicy.js';
import {resolveNonLiquidFlowV2TakeProfit} from '../src/shortTakeProfitPolicy.js';
const now=Date.now()+5000,event={version:EMA99_PULLBACK_LONG_VERSION,stage:'RECLAIM_LONG_WATCH',side:'LONG',closed:true,nearMiss:false,
 symbol:'TESTUSDT',interval:'15m',candleAt:now-901000,candleCloseAt:now-1000,generatedAt:new Date(now).toISOString(),price:100,
 ema99:99,lowerWickPct:40,takeProfit:105,invalidation:97,volumeRatio:2};
const opts={now,enabledAt:new Date(now-2000).toISOString(),markPrice:100},plan=buildEma99ReclaimLongOrder(event,opts);
assert.ok(plan);assert.equal(plan.side,'BUY');assert.equal(plan.orderType,'MARKET');assert.equal(plan.notionalUsdt,25);assert.equal(plan.leverage,5);
assert.equal(plan.takeProfitPrice,103);assert.equal(plan.takeProfitDistanceFraction,.03);assert.equal(plan.stopLossDistanceFraction,.04);
for(const patch of [{stage:'NEAR_RECLAIM_LONG_WATCH'},{stage:'BOUNCE_CONFIRMED_LONG_WATCH'},{stage:'TOUCH_EMA_LONG_WATCH'},{side:'SHORT'},
 {closed:false},{nearMiss:true},{takeProfit:null},{invalidation:null},{takeProfit:99},{invalidation:101},{ema99:101},{lowerWickPct:24},
 {candleCloseAt:now-91000},{generatedAt:'bad'},{interval:'1h'},{version:'old'}])assert.equal(buildEma99ReclaimLongOrder({...event,...patch},opts),null);
assert.ok(buildEma99ReclaimLongOrder({...event,interval:'5m'},opts));
assert.equal(buildEma99ReclaimLongOrder(event,{...opts,enabledAt:new Date(now).toISOString()}),null);
assert.equal(buildEma99ReclaimLongOrder(event,{...opts,markPrice:101}),null);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:plan,orderEnabled:true}).allowed,false);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeEma99ReclaimLongOrder(plan),orderEnabled:true}).allowed,true);
for(const patch of [{side:'SELL'},{leverage:10},{notionalUsdt:50},{signalLabel:'NEAR_RECLAIM_LONG_WATCH'}])
 assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeEma99ReclaimLongOrder({...plan,...patch}),orderEnabled:true}).allowed,false);
assert.equal(resolveNonLiquidFlowV2TakeProfit({side:'BUY',source:plan.source,entryPrice:100,leverage:5,requestedTakeProfitPrice:105}).takeProfitPrice,105);
assert.match(ema99PullbackLongPayload(event).embeds[0].description,/OBSERVE ONLY/);
assert.match(ema99PullbackLongPayload({...event,binanceExecution:{status:'off'}}).embeds[0].description,/LONG MARKET/);
const dir=await mkdtemp(join(tmpdir(),'ema-reclaim-long-')),controls=new AutoEntryControls(join(dir,'controls.json'));
const route=controls.register({...EMA99_RECLAIM_LONG_ROUTE,signalInterval:event.interval});let count=0,context={enabled:true,positions:[],openOrders:[],markPrice:100};
const file=join(dir,'attempts.json');
const make=(submit=async()=>{count++;return {status:'submitted'};})=>new Ema99NearRejectRunner({file,controls,now:()=>now,
 routeSpec:EMA99_RECLAIM_LONG_ROUTE,buildOrder:buildEma99ReclaimLongOrder,referencePrice:e=>e.price,getContext:async()=>context,submit});
let runner=make();assert.equal((await runner.handle(event)).status,'off');
controls.update({action:'route',key:route.key,enabled:true});controls.update({action:'master',enabled:true});
context.positions=[{symbol:event.symbol,positionAmt:-1}];assert.equal((await runner.handle(event)).status,'existing-position');
context.positions=[];context.openOrders=[{symbol:event.symbol,reduceOnly:false}];assert.equal((await runner.handle(event)).status,'existing-order');
context.openOrders=[];await Promise.all([runner.handle(event),runner.handle(event)]);assert.equal(count,1);
assert.equal((await make().handle(event)).status,'deduped');
const other=controls.register({...EMA99_RECLAIM_LONG_ROUTE,signalInterval:'5m'});
controls.update({action:'route',key:other.key,enabled:true});
assert.equal((await make().handle({...event,interval:'5m'})).status,'deduped');
await assert.rejects(make(async()=>{throw Error('timeout');}).handle({...event,symbol:'OTHERUSDT'}));
assert.equal((await make().handle({...event,symbol:'OTHERUSDT'})).status,'deduped');
await writeFile(file,'bad json');assert.equal((await make().handle(event)).status,'state-error');
controls.update({action:'pauseAll'});assert.equal((await make().handle(event)).status,'off');
console.log('EMA99 reclaim LONG tests passed (mock orders only).');
