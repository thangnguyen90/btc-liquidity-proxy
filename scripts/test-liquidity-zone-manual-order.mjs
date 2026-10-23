import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {LiquidityZoneManualOrders,zoneManualPlan,validZoneManualPlan,ZONE_MANUAL_SOURCE} from '../src/liquidityZoneManualOrder.js';
import {mainDistanceOpenSlots,mainDistanceClosedStats} from '../src/mainKillDistanceEntry.js';
import {isManualShortProtectionSource,shouldSuppressBotShortStopLoss,resolveNonLiquidFlowV2TakeProfit,resolveOrdersManualTakeProfit} from '../src/shortTakeProfitPolicy.js';
import {resolveFillAnchoredProtectionPrices,resolveSignalProtectionWorkingTypes} from '../src/liveCardSignalProtection.js';
const now=Date.now();
const w={id:'one',symbol:'龙虾USDT',role:'MAIN_KILL',enabled:true,status:'ACTIVE',seen:{ACTIVE:true},socketFresh:true,
  priceAt:now-100,lastClosedAt:now-10000,markPrice:100,zone:{low:103,high:104},direction:'UPPER'};
const input={watchId:w.id,marginUsdt:7.25,side:'LONG',zone:w.zone,referenceMark:100};
for(const watch of [w,{...w,direction:'LOWER',zone:{low:95,high:97}}]){
  const side=watch.direction==='UPPER'?'LONG':'SHORT',p=zoneManualPlan(watch,{...input,zone:watch.zone,side},'account',now);
  assert.equal(p.marginUsdt,7.25);assert.equal(p.notionalUsdt,36.25);assert.equal(p.leverage,5);
  assert.equal(validZoneManualPlan(p,watch,100,now),true);
  assert.equal(validZoneManualPlan(p,watch,100.6,now),false,'Price drift from confirmation blocked');
  assert.equal(validZoneManualPlan({...p,takeProfitPrice:101},watch,100,now),false);
  assert.equal(validZoneManualPlan({...p,entryExpiresAt:now-1},watch,100,now),false);
  assert.equal(isManualShortProtectionSource({source:p.source,side:p.side}),false,'Do not force manual SHORT EMA99 policy');
  assert.equal(shouldSuppressBotShortStopLoss({source:p.source,side:p.side}),false);
  const tp=resolveNonLiquidFlowV2TakeProfit({source:p.source,side:p.side,entryPrice:100,leverage:5,requestedTakeProfitPrice:p.takeProfitPrice});
  assert.equal(tp.applied,false);assert.equal(tp.takeProfitPrice,p.takeProfitPrice);
  const filled=resolveFillAnchoredProtectionPrices({...p,side:p.side,signalEntryPrice:100,signalTakeProfitPrice:p.takeProfitPrice,
    signalStopLossPrice:p.stopLossPrice,fillPrice:100.2});
  assert.equal(filled.takeProfitPrice,p.takeProfitPrice,'TP stays frozen');
  assert.ok(Math.abs(filled.stopLossPrice/100.2-(p.side==='BUY'?.94:1.06))<1e-10,'SL follows actual fill');
}
for(const marginUsdt of [0,-1,'junk',Infinity,NaN])assert.throws(()=>zoneManualPlan(w,{...input,marginUsdt},'a',now),/Margin/);
for(const changed of [{role:'FAR_KILL'},{enabled:false},{historyIncomplete:true},{status:'TOUCHING'},{socketFresh:false},
  {consumedAtCapture:true},{seen:{PRICE_PASSED:true}},{priceAt:now-16000},{lastClosedAt:0},{markPrice:101}])
  assert.throws(()=>zoneManualPlan({...w,...changed},input,'a',now),/điều kiện/);
assert.throws(()=>zoneManualPlan(w,{...input,side:'SHORT'},'a',now),/Hướng/);
assert.throws(()=>zoneManualPlan(w,{...input,zone:{low:102,high:104}},'a',now),/Hướng/);
assert.throws(()=>zoneManualPlan(w,{...input,referenceMark:98},'a',now),/0,5%/);
const dir=await mkdtemp(join(tmpdir(),'zone-manual-test-'));
try{
  let calls=0;
  const opts={file:join(dir,'ledger.json'),now:()=>now,getWatch:async()=>w,
    submit:async p=>{calls++;assert.equal(p.source,ZONE_MANUAL_SOURCE);return {status:'submitted',orderResult:{orderId:123}};}};
  const service=new LiquidityZoneManualOrders(opts);
  const result=await Promise.all([service.execute(input,'account',{}),service.execute(input,'account',{})]);
  assert.equal(calls,1);assert.equal(result[1].replayed,true);assert.equal(result[0].orderId,123);
  assert.equal((await new LiquidityZoneManualOrders(opts).execute(input,'account',{})).replayed,true);
  assert.equal(calls,1,'Restart cannot replay');
  const unknown=new LiquidityZoneManualOrders({...opts,file:join(dir,'unknown.json'),submit:async()=>{calls++;throw Error('timeout');}});
  assert.equal((await unknown.execute(input,'account',{})).status,'ERROR_OR_UNKNOWN');
  await unknown.execute(input,'account',{});assert.equal(calls,2,'Timeout never retried');
  const rejected=new LiquidityZoneManualOrders({...opts,file:join(dir,'rejected.json'),submit:async()=>{throw Object.assign(Error('Pre MARKET guard'),{beforeZoneMarket:true});}});
  const reject=await rejected.execute(input,'account',{});assert.equal(reject.status,'REJECTED');
  assert.equal(mainDistanceOpenSlots({positions:[],fills:{},attempts:{r:reject},now}),0,'Known pre-MARKET reject does not occupy slot');
  assert.equal(mainDistanceOpenSlots({positions:[],fills:{},attempts:unknown.state.attempts,now}),1,'Unknown reserves slot');
  assert.equal(mainDistanceOpenSlots({positions:[],fills:{},attempts:service.state.attempts,now}),1,'Submission reserves until REST catches up');
  const record={signalSource:ZONE_MANUAL_SOURCE,streamId:'manual-main-zone',signalLabel:'orders-manual',symbol:w.symbol,
    direction:'LONG',positionStatus:'OPEN',clientOrderId:result[0].clientOrderId};
  assert.equal(mainDistanceOpenSlots({positions:[{symbol:w.symbol,positionAmt:1}],fills:{r:{record}},attempts:service.state.attempts,now}),1);
  assert.equal(mainDistanceClosedStats({r:{record:{...record,positionStatus:'CLOSED',marginUsdt:7.25,netRealizedPnlUsdt:3}}},'LONG').closedCount,0,'Manual margin does not contaminate automatic WHITELIST stats');
}finally{await rm(dir,{recursive:true,force:true});}

const ui=await readFile(new URL('../public/liquidity-zone-manager.js',import.meta.url),'utf8'),nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',handlers:{},textContent:'',innerHTML:'',querySelectorAll:()=>[],
  setAttribute(){},addEventListener(k,v){this.handlers[k]=v;},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);};
let sent=0,captured;
const view=runInNewContext(`${ui}; ({set:v=>data=v,openManualZoneOrder,submitManualZoneOrder,manualZoneReady,render})`,{
  document:{getElementById:node},location:{search:''},URLSearchParams,structuredClone,setInterval:()=>0,
  localStorage:{getItem:()=> 'session'},AbortSignal:{timeout:()=>null},
  fetch:async(url,options)=>{if(url==='/api/liquidity-zone-manager/order'){sent++;captured=JSON.parse(options.body);return {ok:true,json:async()=>({status:'SUBMITTED',orderId:456,symbol:w.symbol,side:'LONG'})};}
    return new Promise(()=>{});},
});
view.set({watches:[w]});view.openManualZoneOrder(w.id);assert.equal(node('manualOrderDialog').open,true);
node('manualMargin').value='7.25';node('manualConfirmed').checked=true;
const ev={preventDefault(){}};await Promise.all([view.submitManualZoneOrder(ev),view.submitManualZoneOrder(ev)]);
assert.equal(sent,1);assert.equal(captured.marginUsdt,7.25);assert.equal(captured.confirm,true);
assert.equal(captured.side,'LONG');assert.equal(captured.referenceMark,100);
assert.match(node('manualOrderResult').textContent,/456/);assert.equal(node('manualSubmit').disabled,true);
assert.equal(view.manualZoneReady({...w,role:'FAR_KILL'}),false);
const server=await readFile(new URL('../src/server.js',import.meta.url),'utf8');
const endpoint=server.slice(server.indexOf("if(requestUrl.pathname==='/api/liquidity-zone-manager/order')"),server.indexOf("if (requestUrl.pathname === '/api/liquidity-zone-manager')"));
assert.ok(endpoint.indexOf('!ordersTokens.has(token)')<endpoint.indexOf('getApiCredentials(token)'),'Authenticate before credential fallback/market');
assert.match(endpoint,/isSameOriginWriteRequest/);assert.match(endpoint,/body.confirm!==true/);
assert.match(endpoint,/watchId:String\(body.watchId/);assert.doesNotMatch(endpoint,/\.\.\.body/,'Client may not override source/order/TP/SL');
const orderFns=server.slice(server.indexOf('async function placeOrder('),server.indexOf('function trackSubmittedOrderPosition('));
const base={ZONE_MANUAL_SOURCE,MAIN_DISTANCE_SOURCE:'main-kill-distance-entry',STRUCTURE_SOURCE:'structure-setup-ready',
  PUMP_TURN_NEAR_SOURCE:'pump-turn-near-short',RISING_VOLUME_SOURCE:'rising-volume-sustained-1m',runtimeSettings:{orderEnabled:true},ordersTokens:new Set(['authorized']),
  autoEntryControls:{assertEntry(){},isProtectionExcluded:()=>false},normalizeSymbol:s=>s,isBinanceProtectionExcluded:()=>false,
  shortStopLossSuppression:()=>({suppressed:false}),resolveSignalProtectionWorkingTypes:()=>({}),
  evaluateAutoBinanceEntryPolicy:()=>({allowed:true}),getSymbols:async()=>[{symbol:w.symbol}],
  process:{env:{}},client:{getPremiumIndex:async()=>({markPrice:100})},
  liquidityZoneManualOrders:{getWatch:async()=>w},validZoneManualPlan};
const before=runInNewContext(`let zoneOrderQueue=Promise.resolve();${orderFns};placeOrder`,base);
const plan=zoneManualPlan(w,input,'account',now);
await assert.rejects(before(plan,''),/authorized Orders session/);
base.runtimeSettings.orderEnabled=false;await assert.rejects(before(plan,'authorized'),/execution disabled/);base.runtimeSettings.orderEnabled=true;
await assert.rejects(before({...plan,takeProfitPrice:90},'authorized'),e=>e.beforeZoneMarket===true&&/protection/.test(e.message));
let orders=0,positions=[],pending=[],audit={},savedPlan,watch=w;
const fakeClient={getPremiumIndex:async()=>({markPrice:100}),getPositions:async()=>positions,getOpenOrders:async()=>pending,
  setLeverage:async()=>({leverage:5}),placeFuturesOrder:async({params})=>{orders++;assert.equal(params.type,'MARKET');assert.equal(params.side,'BUY');return {orderId:789,clientOrderId:params.newClientOrderId};}};
const runtime={...base,client:fakeClient,priceFromTick:(_,p)=>p,quantityFromNotional:(_,n,m)=>String(n/m),
  resolveSignalProtectionWorkingTypes,isManualShortProtectionSource,resolveOrdersManualTakeProfit,resolveNonLiquidFlowV2TakeProfit,
  liquidityZoneManualOrders:{getWatch:async()=>watch,load:async()=>{},state:{attempts:{}}},
  mainKillDistanceRunner:{load:async()=>{},state:{attempts:{}}},mainDistanceOpenSlots,
  binanceFilledSignalAudit:{init:async()=>({fills:audit}),registerSubmission:async()=>{}},
  getApiCredentials:()=>({apiKey:'mock',apiSecret:'mock'}),inspectLiquidFlowV2DcaPositions:()=>({hasExistingSameSide:false}),
  getHedgeMode:async()=>false,rememberSignalProtectionPlan:p=>{savedPlan=p;},signalProtectionPlans:new Map(),
  trackSubmittedOrderPosition(){},console};
const place=runInNewContext(`let zoneOrderQueue=Promise.resolve();${orderFns};placeOrder`,runtime);
positions=[{symbol:w.symbol,positionAmt:1}];await assert.rejects(place(plan,'authorized'),/vị thế/);assert.equal(orders,0);
positions=[];pending=[{reduceOnly:false}];await assert.rejects(place(plan,'authorized'),/entry chờ/);assert.equal(orders,0);
pending=[];watch={...w,seen:{PRICE_PASSED:true}};await assert.rejects(place(plan,'authorized'),/protection/);assert.equal(orders,0);watch=w;
runtime.liquidityZoneManualOrders.state.attempts={unknown:{symbol:w.symbol,side:'LONG',status:'UNKNOWN',clientOrderId:'another'}};
await assert.rejects(place(plan,'authorized'),/chưa rõ/);assert.equal(orders,0);runtime.liquidityZoneManualOrders.state.attempts={};
positions=Array.from({length:20},(_,i)=>({symbol:`OTHER${i}USDT`,positionAmt:1}));
audit=Object.fromEntries(positions.map(p=>[p.symbol,{record:{symbol:p.symbol,signalSource:ZONE_MANUAL_SOURCE,streamId:'manual-main-zone',direction:'LONG',positionStatus:'OPEN'}}]));
await assert.rejects(place(plan,'authorized'),/Max open positions \(20\)/);assert.equal(orders,0);
audit={};positions=[];
const placed=await place(plan,'authorized');assert.equal(placed.status,'submitted');assert.equal(orders,1);
assert.equal(placed.order.notionalUsdt,36.25);assert.equal(placed.order.stopLossSuppressed,false);
assert.equal(savedPlan.takeProfitPrice,103);assert.equal(savedPlan.stopLossDistanceFraction,.06);
assert.equal(savedPlan.preserveSignalProtection,true);assert.equal(savedPlan.marginUsdt,7.25);
console.log('Manual MAIN margin order: LONG/SHORT zone TP, fill SL, auth/confirmation, no auto-size increase, stale gates, shared20 cap, immutable dedupe/restart/unknown and UI submit OK (mock Binance only)');
