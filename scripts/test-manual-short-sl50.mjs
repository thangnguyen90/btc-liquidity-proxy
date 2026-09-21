import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {buildManualShortSl30,applyManualShortSl30ToPlan,manualShortSl30MatchesPosition,reconcileManualShortSl30} from '../src/manualShortStopLoss.js';
import {buildClosePositionProtectionParams,BINANCE_CLOSE_POSITION_PROTECTION_VERSION} from '../src/binanceClosePositionProtection.js';
import {hasOpenProtectionOrder} from '../src/protectionOrderGuard.js';
import {resolveNonLiquidFlowV2TakeProfit,resolveManualSocketProtection,BINANCE_MANUAL_SHORT_EMA99_TP_ONLY_VERSION} from '../src/shortTakeProfitPolicy.js';
import {resolveFillAnchoredProtectionPrices} from '../src/liveCardSignalProtection.js';
const at=Date.UTC(2026,8,9,15),source='binance-manual-socket';
const input={activatedAt:new Date(at).toISOString(),fillTime:at+2000,symbol:'TESTUSDT',orderId:123,source,
  order:{symbol:'TESTUSDT',orderId:123,side:'SELL',status:'FILLED',type:'MARKET',time:at+1000,
    executedQty:'1',avgPrice:'100',positionSide:'BOTH',reduceOnly:false},
  positionAmount:-1,positionEntryPrice:100,positionLeverage:5,positionSide:'BOTH'};
const policy=buildManualShortSl30(input);
assert.ok(policy);assert.equal(policy.stopLossRoePct,30);assert.ok(Math.abs(policy.stopLossPrice-106)<1e-10);
for(const lev of [1,5,10,20,125]) {
  const p=buildManualShortSl30({...input,positionLeverage:lev});
  assert.ok(Math.abs((p.stopLossPrice/100-1)*lev*100-30)<1e-8);
}
for(const patch of [{activatedAt:null},{activatedAt:'bad'},{fillTime:at-1},{positionAmount:-2},{positionAmount:1},
  {positionAmount:-.5},{positionAmount:null},{positionEntryPrice:101},{positionLeverage:0},{positionLeverage:Infinity},
  {source:'ema99-near-reject-short'},{source:'unknown-manual-bot'},{orderId:999},{positionSide:'LONG'}]) {
  assert.equal(buildManualShortSl30({...input,...patch}),null,JSON.stringify(patch));
}
for(const patch of [{time:at-1},{time:null},{time:at+3000},{side:'BUY'},{status:'PARTIALLY_FILLED'},
  {reduceOnly:true},{closePosition:'true'},{avgPrice:0},{executedQty:2},{symbol:'OTHERUSDT'},{type:'STOP_MARKET'}]) {
  assert.equal(buildManualShortSl30({...input,order:{...input.order,...patch}}),null,JSON.stringify(patch));
}
assert.ok(buildManualShortSl30({...input,order:{...input.order,type:'LIMIT'}}));
const position={symbol:'TESTUSDT',positionAmt:'-1',entryPrice:'100',leverage:'5',positionSide:'BOTH'};
const dcaPosition={...position,positionAmt:'-2',entryPrice:'101'};
const trades=[{id:1,symbol:'TESTUSDT',positionSide:'BOTH',side:'SELL',orderId:123,qty:'1',price:'100',time:at+2000,realizedPnl:'0'},
  {id:2,symbol:'TESTUSDT',positionSide:'BOTH',side:'SELL',orderId:124,qty:'1',price:'102',time:at+2100,realizedPnl:'0'}];
const reconciled=reconcileManualShortSl30(policy,dcaPosition,trades,source);
assert.ok(reconciled);
assert.equal(reconciled.entryPrice,100);assert.equal(reconciled.quantity,1);
assert.equal(reconciled.stopLossPrice,policy.stopLossPrice,'DCA must not rebase the initial SL');
assert.ok(manualShortSl30MatchesPosition(reconciled,dcaPosition,source));
for(const history of [[],trades.slice(1),[trades[0],trades[0]],
  [...trades,{...trades[1],id:3,side:'BUY'}],
  [trades[0],{...trades[1],qty:'2'}],
  [trades[0],{...trades[1],realizedPnl:'1'}]]) {
  assert.equal(reconcileManualShortSl30(policy,dcaPosition,history,source),null);
}
assert.ok(manualShortSl30MatchesPosition(policy,position,source));
assert.equal(manualShortSl30MatchesPosition({...policy,version:'MANUAL_SHORT_NEW_FILL_SL50_V1_20260909'},position,source),false);
assert.equal(manualShortSl30MatchesPosition(null,position,source),false);
assert.equal(manualShortSl30MatchesPosition({...policy,orderCreatedAt:NaN},position,source),false);
assert.equal(manualShortSl30MatchesPosition(policy,{...position,positionAmt:'-2'},source),false);
assert.equal(manualShortSl30MatchesPosition(policy,position,'ema99-observe-only'),false);
const old=resolveManualSocketProtection({side:'SELL',entryPrice:100,leverage:5});
assert.equal(old.stopLossPrice,null,'legacy manual short policy unchanged');
const plan={side:'SELL',source,tpPrice:94,slPrice:null,fillAnchorEnabled:false};
assert.equal(applyManualShortSl30ToPlan(plan,null),plan);
const protectedPlan=applyManualShortSl30ToPlan(plan,policy);
assert.equal(protectedPlan.tpPrice,94);assert.equal(protectedPlan.takeProfitDistanceFraction,null);
const fill=resolveFillAnchoredProtectionPrices({side:'SELL',fillPrice:100,takeProfitPrice:94,
  stopLossPrice:protectedPlan.slPrice,fillAnchorEnabled:true,takeProfitDistanceFraction:null,
  stopLossDistanceFraction:protectedPlan.stopLossDistanceFraction});
assert.ok(Math.abs(fill.stopLossPrice-106)<1e-10);assert.equal(fill.takeProfitPrice,94);

// Exercise production setTpSl with mocked exchange IO. This catches the legacy
// manual TP-only suppression accidentally dropping SL30 in the actual caller.
const server=await readFile(new URL('../src/server.js',import.meta.url),'utf8');
const start=server.indexOf('async function setTpSl(payload, token = null)');
const end=server.indexOf('\nasync function getMarketSnapshot()',start);
assert.ok(start>0&&end>start);
function harness({existingSl=false,changePosition=false,initialDca=false,history=[],hidePlaced=false,protectionExcluded=false}={}) {
  const placed=[];let reads=0;
  const client={getOpenOrders:async()=>[],getOpenAlgoOrders:async()=>existingSl?[{
    symbol:'TESTUSDT',side:'BUY',positionSide:'BOTH',type:'STOP_MARKET',triggerPrice:'105',closePosition:true}]:hidePlaced?[]:placed,
    getPositions:async()=>{reads++;return [initialDca||(changePosition&&reads>1)?dcaPosition:position];},
    getUserTrades:async()=>history,
    getPremiumIndex:async()=>({markPrice:'100'}),placeAlgoOrder:async({params})=>{placed.push(params);return {algoId:placed.length};}};
  const context={client,console:{log:()=>{}},process:{env:{}},Date,Number,String,Math,JSON,
    normalizeSymbol:x=>x,getApiCredentials:()=>({}),getSymbols:async()=>[{symbol:'TESTUSDT'}],
    resolveSignalProtectionWorkingTypes:()=>({takeProfitWorkingType:'MARK_PRICE',stopLossWorkingType:'MARK_PRICE'}),
    shortStopLossSuppression:()=>({suppressed:true,version:BINANCE_MANUAL_SHORT_EMA99_TP_ONLY_VERSION}),
    isTrackedManualShortTpOnlyPosition:()=>true,manualShortSl30MatchesPosition,reconcileManualShortSl30,
    isBinanceProtectionExcluded:()=>protectionExcluded,
    resolveNonLiquidFlowV2TakeProfit,hasOpenProtectionOrder,buildClosePositionProtectionParams,
    BINANCE_MANUAL_SHORT_EMA99_TP_ONLY_VERSION,BINANCE_CLOSE_POSITION_PROTECTION_VERSION,
    BINANCE_PROTECTION_EXCLUSION_VERSION:'BINANCE_SYMBOL_PROTECTION_EXCLUSION_V2_AUTO_RESET_ON_CLOSE_20260917',
    priceFromTick:(_info,value)=>Number(value.toFixed(6))};
  const run=vm.runInNewContext(server.slice(start,end)+'\nsetTpSl',context);
  return {run,placed};
}
const payload={symbol:'TESTUSDT',slPrice:policy.stopLossPrice,source,manualShortSl50:policy};
let excluded=harness({protectionExcluded:true});const excludedResult=await excluded.run(payload);
assert.equal(excludedResult.protectionSuppressedBySymbol,true);assert.equal(excluded.placed.length,0,'symbol exclusion suppresses SL30 placement');
let h=harness();const result=await h.run(payload);
assert.equal(result.stopLossSuppressed,false);assert.equal(h.placed.length,1);
assert.equal(result.hasSl,true);assert.equal(result.stopLossPrice,106);
assert.equal(h.placed[0].type,'STOP_MARKET');assert.equal(Number(h.placed[0].triggerPrice),106);
assert.equal(h.placed[0].side,'BUY');assert.equal(h.placed[0].closePosition,'true');
h=harness();await h.run({...payload,manualShortSl50:null});assert.equal(h.placed.length,0,'old manual position unchanged');
h=harness({existingSl:true});const retained=await h.run(payload);assert.equal(h.placed.length,0,'existing user SL retained');
assert.equal(retained.hasSl,true);assert.equal(retained.stopLossPrice,105);
h=harness({changePosition:true});await assert.rejects(h.run(payload),/position changed/);assert.equal(h.placed.length,0);
for(const options of [{initialDca:true,history:trades},{changePosition:true,history:trades}]) {
  h=harness(options);const r=await h.run({...payload,manualShortSl50:{...policy}});
  assert.equal(r.hasSl,true);assert.equal(r.stopLossSuppressed,false);
  assert.equal(Number(h.placed[0].triggerPrice),106,'verified concurrent fill keeps original SL');
}
h=harness({initialDca:true});await assert.rejects(h.run({...payload,manualShortSl50:{...policy}}),/cannot verify/);
assert.equal(h.placed.length,0);
h=harness({hidePlaced:true});await assert.rejects(h.run({...payload,manualShortSl50:{...policy}}),/not confirmed an open SL/);
console.log('Manual short SL30 passed: new fill/activation only, 1x–125x, DCA/old/bot guards, actual setTpSl path, existing SL and position race. Mock exchange only.');
