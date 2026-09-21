import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AutoEntryControls,entryRoute} from '../src/autoEntryControls.js';
import {EMA99_ENTRY_CATALOG,EMA99_CONTROL_CATALOG,ema99Leverage,validEma99OrderSize} from '../src/ema99EntryCatalog.js';
import {Ema99NearRejectRunner} from '../src/ema99NearRejectBinance.js';
import {POST_PUMP_EMA99_RETEST_VERSION} from '../src/postPumpEma99Retest.js';

const dir=await mkdtemp(join(tmpdir(),'ema99-timeframes-'));
const controls=new AutoEntryControls(join(dir,'settings.json'));
const legacy={enabled:true,routes:{}};
const oldCatalog=EMA99_ENTRY_CATALOG.filter(spec=>spec.signalLabel!=='FIRST_PUMP_NEAR_REJECT_SHORT_WATCH');
for(const [i,spec] of oldCatalog.entries()) {
  const r={source:spec.source,stream:spec.streamId,
    label:spec.signalLabel==='REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH'?'NEAR_REJECT_SHORT_WATCH':spec.signalLabel,side:spec.side};
  r.key=JSON.stringify(Object.values(r));
  legacy.routes[r.key]={...r,enabled:i%2===0,marginUsdt:6+i,enabledAt:'2026-09-01T00:00:00Z'};
}
const other=entryRoute({source:'coinglass-zone-lifecycle',side:'BUY',signalLabel:'TEST'});
legacy.routes[other.key]={...other,enabled:false};
await writeFile(controls.file,JSON.stringify(legacy));
controls.seed(EMA99_CONTROL_CATALOG);
const migrated=controls.read();
assert.equal(Object.keys(migrated.routes).length,25);
assert.deepEqual(migrated.routes[other.key],{...legacy.routes[other.key],ema99SettingsEditable:false});
for(const spec of EMA99_CONTROL_CATALOG) {
  const r=migrated.routes[entryRoute(spec).key];
  assert.equal(r.interval,spec.signalInterval);
  if(r.label==='FIRST_PUMP_NEAR_REJECT_SHORT_WATCH') {
    assert.equal(r.enabled,false);assert.equal(r.marginUsdt,null);assert.equal(r.enabledAt,undefined);
  } else {
    const oldLabel=r.label==='REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH'?'NEAR_REJECT_SHORT_WATCH':r.label;
    const old=legacy.routes[JSON.stringify([r.source,r.stream,oldLabel,r.side])];
    assert.equal(r.enabled,old.enabled);assert.equal(r.marginUsdt,old.marginUsdt);
    assert.equal(r.enabledAt,old.enabledAt);
  }
}
const spec=EMA99_ENTRY_CATALOG.find(r=>r.signalLabel==='REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH');
const p5={...spec,signalInterval:'5m',notionalUsdt:35,leverage:5};
const p15={...spec,signalInterval:'15m',notionalUsdt:35,leverage:5};
const key5=entryRoute(p5).key,key15=entryRoute(p15).key;
assert.notEqual(key5,key15);
controls.update({action:'route',key:key5,enabled:true});
controls.update({action:'route',key:key15,enabled:false});
controls.update({action:'margin',key:key5,marginUsdt:9,expectedMarginUsdt:7});
assert.equal(controls.read().routes[key15].marginUsdt,7);
assert.doesNotThrow(()=>controls.assertEntry({...p5,notionalUsdt:45}));
assert.throws(()=>controls.assertEntry(p15),/OFF/);
assert.throws(()=>controls.assertEntry(p5),/size.*changed/);
for(const signalInterval of [undefined,'','1h','5M']) {
  assert.throws(()=>controls.assertEntry({...p5,signalInterval}),/OFF/);
}
assert.throws(()=>controls.update({action:'route',key:JSON.stringify([spec.source,spec.streamId,spec.signalLabel,spec.side]),enabled:true}));
const near5=EMA99_CONTROL_CATALOG.find(r=>r.signalLabel==='NEAR_EMA_WATCH'&&r.signalInterval==='5m');
const near15=EMA99_CONTROL_CATALOG.find(r=>r.signalLabel==='NEAR_EMA_WATCH'&&r.signalInterval==='15m');
const closed5=EMA99_CONTROL_CATALOG.find(r=>r.signalLabel==='CLOSED_ABOVE_EMA_WATCH'&&r.signalInterval==='5m');
const closed15=EMA99_CONTROL_CATALOG.find(r=>r.signalLabel==='CLOSED_ABOVE_EMA_WATCH'&&r.signalInterval==='15m');
assert.equal(ema99Leverage(near5),10);assert.equal(ema99Leverage(near15),5);
assert.equal(ema99Leverage(closed5),5);assert.equal(ema99Leverage(closed15),10);
assert.equal(validEma99OrderSize({...near5,marginUsdt:5,leverage:10,notionalUsdt:50}),true);
assert.equal(validEma99OrderSize({...near5,marginUsdt:5,leverage:5,notionalUsdt:25}),true,'editable leverage is self-consistent');
assert.equal(validEma99OrderSize({...near5,marginUsdt:5,leverage:5.5,notionalUsdt:27.5}),false,'leverage must be an integer');
for(const target of [near5,closed15]){
  const targetKey=entryRoute(target).key;controls.update({action:'route',key:targetKey,enabled:true});
  assert.equal(controls.read().routes[targetKey].leverage,10);
  assert.doesNotThrow(()=>controls.assertEntry({...target,marginUsdt:controls.read().routes[targetKey].marginUsdt,
    leverage:10,notionalUsdt:controls.read().routes[targetKey].marginUsdt*10}));
  assert.throws(()=>controls.assertEntry({...target,leverage:5,notionalUsdt:controls.read().routes[targetKey].marginUsdt*5}),/size\/leverage changed/);
}
// Migration/seed/restart must not restore an interval the user switched OFF.
controls.seed(EMA99_CONTROL_CATALOG);
controls.seed([{source:'ema99-near-reject-short',streamId:'ema99-retest',signalLabel:'NEAR_REJECT_SHORT_WATCH',side:'SELL'}]);
const restarted=new AutoEntryControls(controls.file);
assert.equal(restarted.read().routes[key15].enabled,false);
assert.equal(restarted.read().routes[key5].marginUsdt,9);
assert.equal(Object.keys(restarted.read().routes).length,25);
assert.ok(!Object.values(restarted.read().routes).some(r=>r.label==='NEAR_REJECT_SHORT_WATCH'));

// Real runner, mocked exchange: disabled 15m never fetches context/submits;
// 5m gets its own amount; enabling 15m later uses its independent amount.
const now=Date.now()+5000;
const event={version:POST_PUMP_EMA99_RETEST_VERSION,stage:spec.signalLabel,side:'SHORT',closed:true,nearMiss:true,
  symbol:'TEST5USDT',interval:'5m',pumpLegType:'REBOUND_PUMP_AFTER_DUMP',candleAt:now-301000,candleCloseAt:now-1000,generatedAt:new Date(now).toISOString(),
  referenceEntry:100,takeProfit:95,invalidation:103};
const sent=[];let contexts=0;
const runner=new Ema99NearRejectRunner({file:join(dir,'attempts.json'),controls,now:()=>now,
  getContext:async()=>{contexts++;return {enabled:true,positions:[],openOrders:[],markPrice:100};},
  submit:async p=>{controls.assertEntry(p);sent.push(p);return {status:'submitted'};}});
assert.equal((await runner.handle({...event,interval:'15m'})).status,'off');assert.equal(contexts,0);
assert.equal((await runner.handle(event)).status,'submitted');assert.equal(sent[0].notionalUsdt,45);
assert.equal(sent[0].signalInterval,'5m');
controls.update({action:'route',key:key15,enabled:true});
assert.equal((await runner.handle({...event,symbol:'TEST15USDT',interval:'15m'})).status,'submitted');
assert.equal(sent[1].notionalUsdt,35);assert.equal(sent[1].signalInterval,'15m');
assert.equal((await runner.handle({...event,interval:'15m'})).status,'deduped','symbol cooldown remains shared');
controls.update({action:'pauseAll'});
assert.ok(Object.values(controls.read().routes).every(r=>r.enabled===false));
const fresh=new AutoEntryControls(join(dir,'fresh.json'));fresh.seed(EMA99_CONTROL_CATALOG);
assert.equal(Object.keys(fresh.read().routes).length,24);
assert.ok(Object.values(fresh.read().routes).every(r=>!r.enabled));
const html=await readFile(new URL('../public/binance-auto-controls.html',import.meta.url),'utf8');
assert.ok(html.includes('id="ema99-5m-routes"')&&html.includes('id="ema99-15m-routes"'));
console.log('EMA99 timeframe controls passed: 24 routes, per-timeframe gates/sizes, historical defaults 10x for two SHORT routes and 5x elsewhere; leverage is editable. Mock exchange only.');
