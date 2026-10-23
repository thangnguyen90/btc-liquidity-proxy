import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {HeatmapManualOrders,buildHeatmapManualOrder,assertHeatmapManualLive,HEATMAP_MANUAL_ORDER_VERSION} from '../src/heatmapManualOrder.js';
import {evaluateAutoBinanceEntryPolicy} from '../src/autoBinancePolicy.js';
import {resolveOrdersManualTakeProfit,resolveNonLiquidFlowV2TakeProfit,isManualShortProtectionSource,resolveManualShortEma99TakeProfit} from '../src/shortTakeProfitPolicy.js';
import {resolveSignalProtectionWorkingTypes} from '../src/liveCardSignalProtection.js';
const now=Date.now(),body={symbol:'ERAUSDT',side:'LONG',marginUsdt:2,leverage:5,requestId:randomUUID(),requestedAt:now},key='a'.repeat(64);
const live={authorized:true,orderEnabled:true,excluded:false,markPrice:100,positions:[],openOrders:[]};
for(const orderType of ['MARKET','LIMIT'])for(const side of ['LONG','SHORT'])for(const symbol of ['ERAUSDT','龙虾USDT'])for(const leverage of [1,5,20,125]){
 const p=buildHeatmapManualOrder({...body,side,symbol,leverage,orderType,limitPrice:95},key,now);
 assert.equal(p.notionalUsdt,2*leverage);assert.equal(p.side,side==='LONG'?'BUY':'SELL');assert.equal(p.source,'orders-manual');
 assert.equal(p.executionPage,'coinglass-heatmap-lab');assert.equal(p.allowMinNotionalCeil,false);assert.equal(p.takeProfitPrice,undefined);assert.equal(p.stopLossPrice,undefined);
 assert.equal(p.orderType,orderType);assert.equal(p.limitPrice,orderType==='LIMIT'?95:undefined);assert.equal(p.timeInForce,orderType==='LIMIT'?'GTC':undefined);
 assertHeatmapManualLive(p,live,now);assert.equal(evaluateAutoBinanceEntryPolicy({payload:p,tokenIsAuthorized:true,orderEnabled:true,exclusive:true}).allowed,true);
 for(const changed of [{authorized:false},{orderEnabled:false},{excluded:true},{markPrice:NaN},{positions:null},{positions:[{symbol,positionAmt:'NaN'}]},
  {positions:[{symbol,positionAmt:1}]},{positions:[{symbol,positionAmt:-1}]},{openOrders:[{symbol,reduceOnly:false}]}])assert.throws(()=>assertHeatmapManualLive(p,{...live,...changed},now));
 assertHeatmapManualLive(p,{...live,openOrders:[{symbol,reduceOnly:true}]},now);
 assert.throws(()=>assertHeatmapManualLive(p,live,now+60001));
 for(const changed of [{source:'heatmap-full-sweep'},{notionalUsdt:999},{dryRun:true},{leverage:1.5},{allowMinNotionalCeil:true},{entryExpiresAt:Infinity}])assert.throws(()=>assertHeatmapManualLive({...p,...changed},live,now));
 for(const changed of orderType==='LIMIT'?[{timeInForce:'IOC'},{limitPrice:0},{limitPrice:Infinity},{limitPrice:'95'},{orderType:'LIMIT_IOC'}]:[{limitPrice:95},{timeInForce:'GTC'},{orderType:'LIMIT'}])assert.throws(()=>assertHeatmapManualLive({...p,...changed},live,now));
}
for(const change of [{symbol:'../.env'},{side:'BUY'},{marginUsdt:0},{marginUsdt:101},{marginUsdt:Infinity},{marginUsdt:true},{leverage:0},{leverage:126},{leverage:2.5},{requestId:'bad'},{requestedAt:now-120001}])assert.throws(()=>buildHeatmapManualOrder({...body,...change},key,now));
for(const limitPrice of [undefined,null,'',0,-1,'95',true,NaN,Infinity])assert.throws(()=>buildHeatmapManualOrder({...body,orderType:'LIMIT',limitPrice},key,now));
for(const orderType of ['LIMIT_IOC','STOP','BAD'])assert.throws(()=>buildHeatmapManualOrder({...body,orderType,limitPrice:95},key,now));
const dir=await mkdtemp(join(tmpdir(),'heatmap-manual-'));let calls=0;
const options={file:join(dir,'ledger.json'),now:()=>now,submit:async p=>{calls++;const disk=JSON.parse(await readFile(options.file,'utf8'));assert(Object.values(disk.attempts).some(a=>a.status==='SUBMITTING'));return {status:'submitted',orderResult:{orderId:123,status:'NEW'},order:{symbol:p.symbol,side:p.side,notionalUsdt:p.notionalUsdt,leverage:p.leverage}};}};
const service=new HeatmapManualOrders(options),[first,second]=await Promise.all([service.execute(body,'account',{}),service.execute(body,'account',{})]);
assert.equal(calls,1);assert.equal(first.status,'SUBMITTED');assert.equal(second.replayed,true);
const restarted=new HeatmapManualOrders(options);assert.equal((await restarted.execute(body,'account',{})).replayed,true);assert.equal(calls,1);
assert.equal((await restarted.get(body.requestId,'account')).orderId,123);assert.equal(await restarted.get(body.requestId,'other'),null);
await assert.rejects(restarted.execute({...body,marginUsdt:3},'account',{}),/Mã xác nhận/);
const limitBody={...body,requestId:randomUUID(),orderType:'LIMIT',limitPrice:95};
const limitResult=await restarted.execute(limitBody,'account',{});assert.equal(limitResult.orderType,'LIMIT');assert.equal(limitResult.limitPrice,95);
assert.equal((await new HeatmapManualOrders(options).execute(limitBody,'account',{})).replayed,true);
await assert.rejects(restarted.execute({...limitBody,limitPrice:96},'account',{}),/Mã xác nhận/);
await assert.rejects(restarted.execute({...limitBody,orderType:'MARKET'},'account',{}),/Mã xác nhận/);
// V1 MARKET fingerprints/UUIDs remain readable without migration or any replay.
const legacyFile=join(dir,'legacy.json'),legacyKey=createHash('sha256').update('account|'+body.requestId).digest('hex');
const legacy={version:'HEATMAP_MANUAL_MARKET_MARGIN_LEVERAGE_V1_20261021',attempts:{[legacyKey]:{...first}}};delete legacy.attempts[legacyKey].orderType;
assert.equal(first.fingerprint,createHash('sha256').update(JSON.stringify(body)).digest('hex'));
await writeFile(legacyFile,JSON.stringify(legacy));const legacySaved=await readFile(legacyFile,'utf8'),legacyService=new HeatmapManualOrders({...options,file:legacyFile}),beforeLegacyCalls=calls;
assert.equal((await legacyService.get(body.requestId,'account')).orderId,123);assert.equal((await legacyService.execute({...body,orderType:'MARKET'},'account',{})).replayed,true);assert.equal(calls,beforeLegacyCalls);assert.equal(await readFile(legacyFile,'utf8'),legacySaved,'old lookup does not rewrite JSON');
legacy.attempts[legacyKey].status='SUBMITTING';await writeFile(legacyFile,JSON.stringify(legacy));
await assert.rejects(new HeatmapManualOrders({...options,file:legacyFile}).execute(limitBody,'account',{}),/chưa rõ/);
const uncertain=new HeatmapManualOrders({...options,file:join(dir,'unknown.json'),submit:async()=>{throw Error('timeout');}});
assert.equal((await uncertain.execute(body,'account',{})).status,'ERROR_OR_UNKNOWN');
await assert.rejects(uncertain.execute({...body,requestId:randomUUID()},'account',{}),/chưa rõ/);
assert.equal((await new HeatmapManualOrders({...options,file:join(dir,'unknown.json')}).get(body.requestId,'account')).status,'ERROR_OR_UNKNOWN');
const rejected=new HeatmapManualOrders({...options,file:join(dir,'rejected.json'),submit:async()=>{throw Object.assign(Error('preflight rejected'),{beforeHeatmapManualMarket:true});}});
assert.equal((await rejected.execute(body,'account',{})).status,'REJECTED');
const off=new HeatmapManualOrders({...options,file:join(dir,'off.json'),submit:()=>{throw Error('must never submit when OFF');}});
assert.equal((await off.execute(body,'account',{enabled:false})).status,'REJECTED');
for(const code of [-2019,-4164]){
 const known=new HeatmapManualOrders({...options,file:join(dir,`reject${code}.json`),submit:async()=>{throw Object.assign(Error('exchange rejected'),{code});}});
 assert.equal((await known.execute(body,'account',{})).status,'REJECTED');
}
const broken=join(dir,'broken.json');await writeFile(broken,'{invalid');await assert.rejects(new HeatmapManualOrders({...options,file:broken}).execute(body,'account',{}),/Không đọc được/);
const noSave=new HeatmapManualOrders({...options,file:join(dir,'save-fail.json'),submit:()=>{throw Error('must not submit');}});noSave.save=async()=>{throw Error('disk full');};await assert.rejects(noSave.execute(body,'account',{}),/disk full/);
const source=await readFile('src/server.js','utf8'),routeStart=source.indexOf("if(requestUrl.pathname==='/api/coinglass-heatmap-lab/order')"),routeEnd=source.indexOf("if(requestUrl.pathname==='/api/coinglass-heatmap-lab/status')",routeStart),handler=source.slice(routeStart,routeEnd);
for(const [method,origin,authorized,confirmed,status] of [['POST',false,true,true,403],['POST',true,false,true,401],['POST',true,true,false,400],['DELETE',true,true,true,405],['GET',false,true,false,200],['POST',true,true,true,200]]){
 let sent=0;const output=[];
 await vm.runInNewContext('(async()=>{'+handler+'})()',{
  requestUrl:new URL('http://local/api/coinglass-heatmap-lab/order?requestId='+body.requestId),request:{method,headers:{'x-orders-token':'session'}},response:{setHeader(){}},
  isSameOriginWriteRequest:()=>origin,ordersTokens:new Set(authorized?['session']:[]),getApiCredentials:()=>({apiKey:'mock'}),crypto:{createHash},runtimeSettings:{orderEnabled:true},
  readJsonBody:async()=>({...body,confirm:confirmed}),heatmapManualOrders:{get:async()=>({status:'SUBMITTED'}),execute:async()=>{sent++;return {status:'SUBMITTED'};}},
  invalidateOpenOrdersCache(){},sendJson:async(_r,data,status=200)=>output.push({data,status})
 });assert.equal(output[0].status,status);assert.equal(sent,method==='POST'&&status===200?1:0);
}
// Actual native order prefix, mocked exchange. Both early and final guards run.
const start=source.indexOf('async function executePlaceOrder('),end=source.indexOf('\n  // LIMIT IOC:',start);
function native(p,{positions=[],pending=[],finalExisting=false,excluded=false,leverageResult=p.leverage,finalMark=100,roundedLimit=null}={}){
 let reads=0,premiumReads=0;const orders=[],plans=[],sizingPrices=[];
 const run=vm.runInNewContext(source.slice(start,end)+'\nreturn {orderResult,plannedOrder};\n}\nexecutePlaceOrder',{
  PUMP_TURN_NEAR_SOURCE:'pump-turn-near-short',STRUCTURE_SOURCE:'structure-setup-ready',RISING_VOLUME_SOURCE:'rising-volume-sustained-1m',MAIN_DISTANCE_SOURCE:'main-kill-distance-entry',ZONE_MANUAL_SOURCE:'liquidity-zone-manual',
  ordersTokens:new Set(['session']),runtimeSettings:{orderEnabled:true,dryRun:false},autoEntryControls:{assertEntry(){}},normalizeSymbol:s=>s,isBinanceProtectionExcluded:()=>excluded,
  shortStopLossSuppression:()=>({suppressed:false}),resolveSignalProtectionWorkingTypes,evaluateAutoBinanceEntryPolicy,AUTO_BINANCE_ENTRY_POLICY_VERSION:'mock',
  getSymbols:async()=>[{symbol:p.symbol}],client:{getPremiumIndex:async()=>({markPrice:++premiumReads>1?finalMark:100}),getPositions:async()=>++reads>1&&finalExisting?[{symbol:p.symbol,positionAmt:1}]:positions,getOpenOrders:async()=>pending,
   setLeverage:async()=>({leverage:leverageResult}),placeFuturesOrder:async({params})=>{orders.push(params);return {orderId:321};}},
  priceFromTick:(_,v)=>String(v===p.limitPrice&&roundedLimit!=null?roundedLimit:v),quantityFromNotional:(_,n,m,_d,o)=>{sizingPrices.push(m);assert.equal(n,p.marginUsdt*p.leverage);assert.equal(o.allowMinNotionalCeil,false);return String(n/m);},
  isManualShortProtectionSource,resolveOrdersManualTakeProfit,resolveNonLiquidFlowV2TakeProfit,resolveManualShortEma99TakeProfit,manualShortEma99Candidates:async()=>[],
  getApiCredentials:()=>({apiKey:'mock',apiSecret:'mock'}),inspectLiquidFlowV2DcaPositions:()=>({hasExistingSameSide:false}),getHedgeMode:async()=>false,
  binanceFilledSignalAudit:{registerSubmission:async()=>{}},rememberSignalProtectionPlan:p=>plans.push(p),signalProtectionPlans:new Map(),assertHeatmapManualLive,Date,process:{env:{}},console,
 });return {run,orders,plans,sizingPrices};
}
for(const orderType of ['MARKET','LIMIT'])for(const side of ['LONG','SHORT']){
 const limitPrice=side==='LONG'?95:105,p=buildHeatmapManualOrder({...body,side,orderType,limitPrice,requestedAt:Date.now()},key),h=native(p),r=await h.run(p,'session',null,{heatmapManual:true});
 assert.equal(h.orders.length,1);assert.equal(h.orders[0].side,side==='LONG'?'BUY':'SELL');assert.equal(h.orders[0].type,orderType);assert.equal(r.plannedOrder.leverage,5);
 assert.equal(h.orders[0].price,orderType==='LIMIT'?String(limitPrice):undefined);assert.equal(h.orders[0].timeInForce,orderType==='LIMIT'?'GTC':undefined);assert.equal(h.sizingPrices[0],orderType==='LIMIT'?limitPrice:100);
 assert.equal(h.orders[0].quantity,String(10/(orderType==='LIMIT'?limitPrice:100)));assert.equal(h.plans.length,1,'protection remains on-fill, not sent against unfilled entry');
 assert.equal(h.plans[0].source,'orders-manual');assert.equal(h.plans[0].executionPage,'coinglass-heatmap-lab');
 for(const options of [{positions:[{symbol:p.symbol,positionAmt:1}]},{pending:[{symbol:p.symbol,reduceOnly:false}]},{finalExisting:true},{excluded:true},{leverageResult:4},...(orderType==='MARKET'?[{finalMark:101}]:[{roundedLimit:limitPrice+.01},{roundedLimit:0}])]){
  const blocked=native(p,options);await assert.rejects(blocked.run(p,'session',null,{heatmapManual:true}));assert.equal(blocked.orders.length,0);
 }
 const expired=native(p);await assert.rejects(expired.run(p,'bad',null,{heatmapManual:true}),/Phiên Orders/);assert.equal(expired.orders.length,0);
 if(orderType==='LIMIT'){const fixed=native(p,{finalMark:110});await fixed.run(p,'session',null,{heatmapManual:true});assert.equal(fixed.orders[0].price,String(limitPrice),'MARK drift must not rewrite a fixed LIMIT price');}
}
const wrapper=source.slice(source.indexOf('async function placeOrder('),source.indexOf('async function executePlaceOrder('));
for(const reserved of [false,true]){
 const call=vm.runInNewContext(wrapper+'\nplaceOrder',{
  STRUCTURE_SOURCE:'structure-setup-ready',PUMP_TURN_NEAR_SOURCE:'pump-turn-near-short',MAIN_DISTANCE_SOURCE:'main-kill-distance-entry',ZONE_MANUAL_SOURCE:'liquidity-zone-manual',
  causalSignalOrderQueue:Promise.resolve(),causalSignalOrderReservations:new Map(reserved?[[body.symbol,Date.now()+75000]]:[]),normalizeSymbol:s=>s,
  executePlaceOrder:async()=>{throw Error('preflight stopped');}
 });await assert.rejects(call(buildHeatmapManualOrder(body,key),'session',null,{heatmapManual:true}),e=>e.beforeHeatmapManualMarket===true);
}
console.log('PASS Heatmap manual MARKET/LIMIT GTC margin/leverage/price, LONG/SHORT/Unicode, auth+CSRF+confirm/native guards, fixed-price sizing/tick validation/on-fill protection, legacy ledger/fingerprint/idempotency/restart/unknown no retry/no min-size ceil. Mock only.');
