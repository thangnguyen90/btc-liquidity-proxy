import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {EMA99_CONTROL_CATALOG as EMA99_ENTRY_CATALOG,ema99Leverage} from '../src/ema99EntryCatalog.js';
import {AutoEntryControls,entryRoute} from '../src/autoEntryControls.js';
import {buildEma99WatchOrder} from '../src/ema99WatchBinance.js';
import {POST_PUMP_EMA99_RETEST_VERSION} from '../src/postPumpEma99Retest.js';
import {EMA99_PULLBACK_LONG_VERSION} from '../src/ema99PullbackLong.js';
import {authorizeEma99WatchOrder,evaluateAutoBinanceEntryPolicy} from '../src/autoBinancePolicy.js';
const dir=await mkdtemp(join(tmpdir(),'ema-all11-')),controls=new AutoEntryControls(join(dir,'controls.json'));
controls.seed(EMA99_ENTRY_CATALOG);
for(const spec of EMA99_ENTRY_CATALOG.filter(r=>r.executable)){const key=entryRoute(spec).key;
 controls.update({action:'margin',key,marginUsdt:8,expectedMarginUsdt:5});
 controls.update({action:'route',key,enabled:true});assert.equal(controls.read().routes[key].marginUsdt,8);
}
assert.equal(Object.values(controls.read().routes).filter(r=>r.enabled).length,22);
const now=Date.now(),opts={now,enabledAt:new Date(now-2000).toISOString(),markPrice:100};
for(const spec of EMA99_ENTRY_CATALOG.filter(r=>r.source==='ema99-observe-only')){
 const short=spec.side==='SHORT',event={version:short?POST_PUMP_EMA99_RETEST_VERSION:EMA99_PULLBACK_LONG_VERSION,stage:spec.signalLabel,side:spec.side,closed:true,interval:spec.signalInterval,symbol:'TESTUSDT',price:100,
  candleAt:now-301000,candleCloseAt:now-1000,generatedAt:new Date(now).toISOString(),takeProfit:short?null:105,executionTakeProfit:short?95:null,invalidation:short?103:97};
 const leverage=ema99Leverage(spec),p=buildEma99WatchOrder(event,{...opts,leverage});assert.ok(p,spec.signalLabel);assert.equal(p.side,short?'SELL':'BUY');
 assert.equal(p.takeProfitDistanceFraction,.15/leverage);assert.equal(p.takeProfitPrice,short?100*(1-.15/leverage):100*(1+.15/leverage));
 assert.equal(p.stopLossDistanceFraction,(short?.30:.20)/leverage);assert.equal(p.stopLossPrice,short?100*(1+.30/leverage):100*(1-.20/leverage));
 assert.ok(evaluateAutoBinanceEntryPolicy({payload:authorizeEma99WatchOrder(p),orderEnabled:true}).allowed);
 assert.equal(evaluateAutoBinanceEntryPolicy({payload:p,orderEnabled:true}).allowed,false);
 for(const patch of [{closed:false},{candleCloseAt:now-100000},{invalidation:null},{side:'FAKE'},{takeProfit:null,executionTakeProfit:null}])assert.equal(buildEma99WatchOrder({...event,...patch},opts),null);
 assert.equal(buildEma99WatchOrder(event,{...opts,enabledAt:new Date(now).toISOString()}),null);
}
for(const [label,interval] of [['NEAR_EMA_WATCH','5m'],['CLOSED_ABOVE_EMA_WATCH','15m']]){
 const spec=EMA99_ENTRY_CATALOG.find(r=>r.signalLabel===label&&r.signalInterval===interval),event={version:POST_PUMP_EMA99_RETEST_VERSION,
  stage:label,side:'SHORT',closed:true,interval,symbol:'TENXUSDT',price:100,candleAt:now-301000,candleCloseAt:now-1000,
  generatedAt:new Date(now).toISOString(),executionTakeProfit:95,invalidation:103};
 const p=buildEma99WatchOrder(event,{...opts,leverage:10});assert.ok(p);assert.equal(p.leverage,10);assert.equal(p.notionalUsdt,50);
 assert.equal(p.takeProfitPrice,98.5);assert.equal(p.takeProfitDistanceFraction,.015);
 assert.equal(p.stopLossPrice,103);assert.equal(p.stopLossDistanceFraction,.03);
}
// Historical observe metadata becomes editable, never silently enabled.
const s=controls.read(),r=Object.values(s.routes).find(r=>r.source==='ema99-observe-only');r.executable=false;r.marginUsdt=null;r.enabled=true;
await writeFile(controls.file,JSON.stringify(s));const migrated=controls.read().routes[r.key];assert.equal(migrated.enabled,false);assert.equal(migrated.marginUsdt,5);
console.log('EMA99 executable controls and 8 generic WATCH builders passed; first-pump remains observe-only. No real orders.');
