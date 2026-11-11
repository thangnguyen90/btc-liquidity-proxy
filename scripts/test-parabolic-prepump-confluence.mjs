import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {evaluatePrePumpConfluence} from '../src/parabolicPrePumpConfluence.js';
import {evaluateParabolicPumpRisk,ParabolicPumpRiskWatch,PARABOLIC_RISK_LEGACY_VERSION,PARABOLIC_RISK_VERSION} from '../src/parabolicPumpRiskWatch.js';
import {preContext} from './fixtures-parabolic-confluence.mjs';
const STEP=300000,END=Date.UTC(2026,9,25,0),now=END+1000;
const rows=Array.from({length:90},(_,i)=>({openTime:END-(90-i)*STEP,closeTime:END-(89-i)*STEP-1,
  open:100,high:100.2,low:99.8,close:100,quoteVolume:20000,takerBuyQuoteVolume:10000,isClosed:true}));
for(let i=0;i<3;i++){const c=[100.3,100.6,101][i],o=i?rows[86+i].close:100;
  Object.assign(rows[87+i],{open:o,close:c,high:c*1.001,low:o*.999,quoteVolume:120000,takerBuyQuoteVolume:84000});}
const event=evaluateParabolicPumpRisk(rows,{symbol:'TESTUSDT',now}).event;
const context=()=>preContext(event,now);
const run=(input=context(),e=event)=>evaluatePrePumpConfluence({event:e,...input,rows,now});
const passed=run();assert.equal(passed.status,'PASS');assert.equal(passed.heatmap.asOf,event.candleAt-1);
assert.equal(passed.topAccountRatio.pass,true);assert.ok(Math.abs(passed.topAccountRatio.changePct+11)<1e-9);
assert.equal(passed.affectsOrders,false);
assert.equal(run({}).status,'UNAVAILABLE');
for(const model of [0,1]){
  let c=context();c.bundle.models[model].data.symbol='OTHERUSDT';assert.equal(run(c).status,'UNAVAILABLE');
  c=context();c.bundle.models[model].data.profiles[1].mark=false;assert.equal(run(c).status,'UNAVAILABLE');
  c=context();c.bundle.models[model].data.profiles[1].oiFresh=false;assert.equal(run(c).status,'UNAVAILABLE');
  c=context();c.bundle.models[model].data.profiles[1].at--;assert.equal(run(c).status,'UNAVAILABLE');
  c=context();c.bundle.models[model].data.profiles[1].bins[0][1]=NaN;assert.equal(run(c).status,'UNAVAILABLE');
}
let c=context();for(const m of c.bundle.models)m.data.profiles.forEach(p=>p.bins=[]);
assert.equal(run(c).status,'FAIL');assert.equal(run(c).heatmap.support,null);
c=context();for(const m of c.bundle.models)m.data.profiles[0].bins[0][1]=.34;
assert.equal(run(c).heatmap.support,null,'consensus requires >=35% in every model/profile');
assert.equal(run(context(),{...event,high:105}).heatmap.checks.find(x=>x.key==='TARGET_NOT_ALREADY_SWEPT').pass,false);
assert.equal(run(context(),{...event,low:99}).heatmap.checks.find(x=>x.key==='LOWER_CLUSTER_HELD').pass,false);
assert.equal(run(context(),{...event,price:103}).status,'FAIL','near target and poor RR rejected');
c=context();c.ratio.rows.forEach(r=>{r.longShortRatio=2;r.longAccount=2/3;r.shortAccount=1/3;});
assert.equal(run(c).topAccountRatio.status,'FAIL','flat alone is not a bearish account shift');
c=context();Object.assign(c.ratio.rows.at(-1),{longShortRatio:2.3,longAccount:2.3/3.3,shortAccount:1/3.3});
assert.equal(run(c).topAccountRatio.reason,'RATIO_WRONG_DIRECTION');
c=context();c.ratio.rows.splice(3,1);assert.equal(run(c).status,'UNAVAILABLE');
c=context();c.ratio.fetchedAt=now-60001;assert.equal(run(c).status,'UNAVAILABLE');
c=context();c.ratio.source='BINANCE_TOP_POSITION_RATIO';assert.equal(run(c).status,'UNAVAILABLE');
c=context();c.ratio.rows.at(-1).longAccount=.9;assert.equal(run(c).status,'UNAVAILABLE');
c=context();c.ratio.rows.forEach(r=>r.timestamp-=STEP);assert.equal(run(c).status,'UNAVAILABLE');
c=context();c.ratio.rows.push({...c.ratio.rows.at(-1),timestamp:END+STEP,longShortRatio:200});
assert.deepEqual(run(c),passed,'future ratio does not alter the decision');
c=context();for(const m of c.bundle.models)m.data.profiles.push({at:event.candleCloseAt,mark:true,oiFresh:true,bins:[]});
assert.deepEqual(run(c),passed,'candidate candle cannot seed its own confirming pools');
const dir=await mkdtemp(join(tmpdir(),'pre-pump-confluence-'));
try {
  let clock=END-2000,calls=0,reads=0,valid=false;
  const file=join(dir,'watch.json');
  const watch=new ParabolicPumpRiskWatch({file,now:()=>clock,getRows:()=>rows,getSymbols:()=>['TESTUSDT'],
    loadPrePumpContext:async e=>{reads++;return valid?preContext(e,clock):{};},
    webhookUrl:'https://discord.com/api/webhooks/123/mock-only',fetchImpl:async()=>{calls++;return {ok:true,status:204};}});
  clock=now;await watch.scan();assert.equal(calls,0);assert.equal(watch.state.history.length,0);assert.deepEqual(watch.state.alerts,{});
  assert.equal(watch.snapshot().diagnostics[0].assessment.status,'UNAVAILABLE');
  valid=true;await watch.scan();assert.equal(reads,1,'context attempts throttled');
  clock+=30001;await watch.scan();assert.equal(calls,1,'later fresh proof may pass, missing proof did not consume alert cooldown');
  assert.equal(watch.state.history[0].prePumpAssessment.pass,true);
  const legacy={version:PARABOLIC_RISK_LEGACY_VERSION,alerts:watch.state.alerts,history:[{...event,version:PARABOLIC_RISK_LEGACY_VERSION}],retryUntil:0};
  const legacyFile=join(dir,'legacy.json');const oldBytes=JSON.stringify(legacy);await writeFile(legacyFile,oldBytes);
  const old=new ParabolicPumpRiskWatch({file:legacyFile,now:()=>clock,getRows:()=>rows,getSymbols:()=>['TESTUSDT'],
    webhookUrl:'https://discord.com/api/webhooks/123/mock-only',fetchImpl:async()=>{throw Error('must not replay');}});
  await old.init();assert.equal(await readFile(legacyFile,'utf8'),oldBytes,'read never eagerly migrates');
  assert.deepEqual(old.state.history,legacy.history);assert.deepEqual(old.state.alerts,legacy.alerts);
  assert.equal(old.snapshot().version,PARABOLIC_RISK_VERSION);await old.scan();assert.equal(await readFile(legacyFile,'utf8'),oldBytes);
  await old.save();assert.equal(JSON.parse(await readFile(legacyFile)).version,PARABOLIC_RISK_VERSION);
  assert.deepEqual(old.state.history,legacy.history,'old history never receives invented new proof');
  const slow=new ParabolicPumpRiskWatch({file:join(dir,'slow.json'),now:()=>clock,getRows:()=>rows,getSymbols:()=>['TESTUSDT'],
    loadPrePumpContext:async e=>{clock+=100000;return preContext(e,clock);},
    webhookUrl:'https://discord.com/api/webhooks/123/mock-only',fetchImpl:async()=>{throw Error('expired proof must not send');}});
  slow.startedAt=END-2000;await slow.scan();assert.equal(slow.state.history.length,0);
} finally {await rm(dir,{recursive:true,force:true});}
console.log('PASS pre-pump dual-model/ratio confluence, causal profiles, fail-closed data, budget, proof persistence and V1 compatibility');
