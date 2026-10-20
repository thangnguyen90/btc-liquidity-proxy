import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {
  POSITION_PROTECTION_NEW_ORDERS_ONLY_VERSION,
  activateProtectionNewOrdersOnly,
  protectionOrderIsNew,
  protectionTrackingIsNew,
} from '../src/protectionFillWatermark.js';
import {buildStartupTakeProfitOrderParams,startupPositionNeedsTakeProfit} from '../src/binanceStartupTakeProfitRecovery.js';

const server=(await readFile(new URL('../src/server.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const monitor=(await readFile(new URL('../src/positionMonitor.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const boundary=activateProtectionNewOrdersOnly({lastHandledFillAt:500,handledOrderIds:['old']},1000);
const order={symbol:'GTCUSDT',orderId:123,side:'SELL',type:'MARKET',status:'FILLED',
  time:1100,updateTime:1200,positionSide:'BOTH',executedQty:'1',origQty:'1',avgPrice:'100'};
const fill={symbol:'GTCUSDT',orderId:123,side:'SELL',fillTime:1200,positionSide:'BOTH',
  source:'ORDER_TRADE_UPDATE',orderStatus:'FILLED'};
const tracking={openedAt:1200,entry:100,entryOrderId:'123',protectionOrderCreatedAt:1100,
  protectionNewOrdersOnlySince:1000,protectionNewOrdersOnlyVersion:POSITION_PROTECTION_NEW_ORDERS_ONLY_VERSION};
const quiet={log(){},warn(){}};

// Exercise the actual callback prefix: old fills return before any mutating branch.
const prefixStart=server.indexOf('      const socketFullFill = [');
const prefixEnd=server.indexOf('      autoEntryControls.markProtectionPositionActive',prefixStart);
assert.ok(prefixStart>0&&prefixEnd>prefixStart);
function fillHarness(verifiedOrder=order,state=boundary,error=null) {
  let reads=0;
  const run=vm.runInNewContext('(async function({symbol,orderId,side,positionSide,fillTime,source,orderStatus}){'
    +server.slice(prefixStart,prefixEnd)+'return "NEW_ORDER_ALLOWED";})',{
    protectionFillWatermark:state,POSITION_PROTECTION_NEW_ORDERS_ONLY_VERSION,protectionOrderIsNew,
    POSITION_PROTECTION_TRIGGER_VERSION:'TEST',getApiCredentials:()=>({}),console:quiet,
    client:{getOrder:async()=>{reads++;if(error)throw error;return verifiedOrder;}},
  });
  return {run,reads:()=>reads};
}
let h=fillHarness();
assert.equal((await h.run({...fill,fillTime:900})).preActivationProtectionSkipped,true);
assert.equal(h.reads(),0,'old GTC fill must not even verify order or reach TP/SL logic');
for(const source of ['ORDER_TRADE_UPDATE','TRADE_LITE_VERIFIED','MISSED_FILL_RECOVERY','MISSED_FILL_RECONNECT_RECOVERY']) {
  h=fillHarness({...order,type:'LIMIT',time:900});
  assert.equal((await h.run({...fill,source})).preActivationProtectionSkipped,true,'old LIMIT filled later excluded in every source');
  assert.equal(h.reads(),1,'read-only verification, no protection calls');
}
h=fillHarness();assert.equal(await h.run(fill),'NEW_ORDER_ALLOWED');
h=fillHarness(order,activateProtectionNewOrdersOnly(boundary,9000));
assert.equal(await h.run(fill),'NEW_ORDER_ALLOWED','restart retains ability to protect genuinely new missed orders');
h=fillHarness(order,{});await assert.rejects(h.run(fill),/not initialized/);assert.equal(h.reads(),0);
h=fillHarness({...order,symbol:'OTHERUSDT'});await assert.rejects(h.run(fill),/cannot verify/);
h=fillHarness({...order,time:null});await assert.rejects(h.run(fill),/cannot verify/);
h=fillHarness(order,boundary,new Error('REST unavailable'));await assert.rejects(h.run(fill),/REST unavailable/);

// Actual recovery function: old trades never reach delivery; creation time also
// excludes late fills of orders placed before activation.
const recoveryStart=monitor.indexOf('  async function recoverMissedFullFills({');
const recoveryEnd=monitor.indexOf('\n  async function verifyTradeLiteFullFill',recoveryStart);
assert.ok(recoveryStart>0&&recoveryEnd>recoveryStart);
function recoveryHarness(orders,trades) {
  const delivered=[],observed=[],reads=[];
  const run=vm.runInNewContext(monitor.slice(recoveryStart,recoveryEnd)+'\nrecoverMissedFullFills',{
    console:quiet,onOrderFill:()=>{},syncPositions:async()=>{},resolveCredentials:()=>({}),
    posCache:new Map([['GTCUSDT',{amt:-1,positionSide:'BOTH'}]]),
    client:{getUserTrades:async()=>trades,getOrder:async({orderId})=>{reads.push(String(orderId));return orders.find(o=>String(o.orderId)===String(orderId));}},
    deliverSocketFullFill:async(symbol,f)=>delivered.push({symbol,...f}),
    onFullFillObserved:async(symbol,f)=>observed.push(f),
  });
  return {run,delivered,observed,reads};
}
let r=recoveryHarness([{...order,time:800,updateTime:900}],[{orderId:123,time:900}]);
assert.equal((await r.run({since:boundary.lastHandledFillAt,createdAfter:1000})).recovered,0);
assert.equal(r.reads.length,0);assert.equal(r.delivered.length,0);
r=recoveryHarness([{...order,type:'LIMIT',time:900}],[{orderId:123,time:1200}]);
assert.equal((await r.run({createdAfter:1000})).recovered,0);assert.equal(r.delivered.length,0);
r=recoveryHarness([order],[{orderId:123,time:1200}]);
assert.equal((await r.run({createdAfter:1000,recoverySource:'MISSED_FILL_RECONNECT_RECOVERY'})).recovered,1);
assert.equal(r.delivered[0].source,'MISSED_FILL_RECONNECT_RECOVERY');
r=recoveryHarness([order],[{orderId:123,time:1200}]);
assert.equal((await r.run({createdAfter:1000,handledOrderIds:['123']})).recovered,0);
assert.equal(r.reads.length,0,'handled order dedupe retained');
assert.match(server,/createdAfter: protectionFillWatermark\.newOrdersOnlySince/);
assert.match(server,/protectionTrackingIsNew\(protectionFillWatermark, trackedManual\)/);
assert.match(server,/Number\(pendingPlan\.manualShortSl50\.orderCreatedAt\)>protectionCutoff/);
const boot=server.slice(server.indexOf('server.listen(port, host, async () => {'));
assert.ok(boot.indexOf('await loadProtectionFillWatermark();')<boot.indexOf('startPositionSocketMonitor();'),'activation must be saved before socket monitor');

// The actual missing-TP helper must exclude unmarked/old tracking before REST
// or submit, and recheck eligibility if tracking changes while awaiting REST.
const tpStart=server.indexOf('async function placeStartupMissingTakeProfitOnly({');
const tpEnd=server.indexOf('\nasync function runStartupTakeProfitRecovery',tpStart);
assert.ok(tpStart>0&&tpEnd>tpStart);
function tpHarness(initialTracking,{race=false,existing=false}={}) {
  const placed=[],reads=[];
  const slTracking={positions:{GTCUSDT:initialTracking}};
  const run=vm.runInNewContext(server.slice(tpStart,tpEnd)+'\nplaceStartupMissingTakeProfitOnly',{
    protectionFillWatermark:boundary,slTracking,protectionTrackingIsNew,
    console:quiet,process:{env:{}},normalizeSymbol:s=>s,isBinanceProtectionExcluded:()=>false,
    startupPositionNeedsTakeProfit,buildStartupTakeProfitOrderParams,
    priceFromTick:(_,v)=>String(v),tpConfirmedSet:new Set(),invalidateOpenOrdersCache:()=>{},
    BINANCE_STARTUP_TP_ONLY_RECOVERY_VERSION:'TEST',
    client:{getOpenOrders:async()=>{reads.push('regular');if(race)slTracking.positions.GTCUSDT=null;return [];},
      getOpenAlgoOrders:async()=>{reads.push('algo');return existing?[{symbol:'GTCUSDT',side:'BUY',positionSide:'BOTH',
        type:'TAKE_PROFIT_MARKET',closePosition:true,triggerPrice:'90'}]:[];},
      placeAlgoOrder:async({params})=>{placed.push(params);return {algoId:1};}},
  });
  return {run,placed,reads};
}
const tpArgs={pos:{symbol:'GTCUSDT',positionAmt:'-1',entryPrice:'100',positionSide:'BOTH'},
  symbolInfo:{symbol:'GTCUSDT'},target:{takeProfitPrice:94},snapshotRegularOrders:[],snapshotAlgoOrders:[]};
for(const old of [null,{openedAt:900}, {...tracking,protectionOrderCreatedAt:800},
  {openedAt:1200,entryOrderId:'123'}]) {
  const t=tpHarness(old);assert.equal(await t.run(tpArgs),'PRE_ACTIVATION');
  assert.equal(t.placed.length,0);assert.equal(t.reads.length,0,'old positions never auto receive TP');
}
let t=tpHarness(tracking);assert.equal(await t.run(tpArgs),'PLACED');assert.equal(t.placed.length,1);
assert.equal(t.placed[0].type,'TAKE_PROFIT_MARKET');
t=tpHarness(tracking,{race:true});assert.equal(await t.run(tpArgs),'PRE_ACTIVATION');assert.equal(t.placed.length,0);
t=tpHarness(tracking,{existing:true});assert.equal(await t.run(tpArgs),'EXISTING');assert.equal(t.placed.length,0);

console.log('New-orders-only production paths passed: old GTC, late LIMIT, socket/reconnect/recovery, restart, DCA and initial TP guard. Mock IO only.');
