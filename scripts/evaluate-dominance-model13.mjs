import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {VERSION,S,H,planFor,FILTERS,trade,statistics,clusterCI} from './research-dominance-model13.mjs';
import {simulate as independentTrade} from './research-pump-high-whale-turn.mjs';
const dir='data/research/dominance-model13-20261106',read=async f=>JSON.parse(await fs.readFile(f,'utf8')),m=await read(dir+'/manifest.json'),cohort=await read(dir+'/cohort.json'),funding=await read(dir+'/funding.json');await read(dir+'/fetch-complete.json');
const rawCache=new Map(),records=[],coverage={},validation={fixedIndependentReplays:0,modelAsOfChecks:0,passed:false},btc=await read(dir+'/raw/BTCUSDT-data.json');
const phase=e=>e.entryAt+8*H<=m.split?'TRAIN':e.decisionAt>=m.split?'TEST':'PURGED';
let done=0;
for(const e of cohort.events.filter(e=>e.entryAt+8*H<=m.end)){
 let raw=rawCache.get(e.symbol);if(!raw){raw=await read(dir+'/raw/'+encodeURIComponent(e.symbol)+'-data.json');rawCache.set(e.symbol,raw);}
 const fixed=trade(raw.price,e,funding,m.end),inverse=trade(raw.price,{...e,side:e.side==='LONG'?'SHORT':'LONG'},funding,m.end);
 if(fixed.status==='OK'){const audit=independentTrade(raw.price,e.entryAt,e.side==='LONG'?1:-1,funding.filter(f=>f.symbol===e.symbol),m.end);assert.equal(audit.status,'OK');assert.ok(Math.abs(audit.netRoe-fixed.netRoe)<1e-9);assert.equal(audit.exitAt,fixed.exitAt);validation.fixedIndependentReplays++;}
 const benchmark=trade(btc.price,{...e,symbol:'BTCUSDT'},funding,m.end);
 for(const lag of [S,2*S]){const model=planFor(raw,e,lag);coverage[model.status]=(coverage[model.status]??0)+1;if(model.status==='OK'){assert.ok(model.liq.asOf<=e.modelDecision-lag);validation.modelAsOfChecks++;}
  records.push({...e,phase:phase(e),modelLagMinutes:lag/60000,features:model,trade:fixed,inverse,benchmark,modelTrade:trade(raw.price,e,funding,m.end,{model})});
 }
 done++;await fs.writeFile(dir+'/evaluate-progress.json',JSON.stringify({done,total:cohort.events.filter(e=>e.entryAt+8*H<=m.end).length,coverage,at:Date.now()}));if(done%10===0)console.log(JSON.stringify({stage:'EVALUATE',done,coverage}));
}
const groups=[];
for(const side of ['LONG','SHORT'])for(const [filter,fn]of Object.entries(FILTERS)){
 const base=records.filter(r=>r.side===side&&r.modelLagMinutes===5),selected=base.filter(r=>fn(r.features)),train=selected.filter(r=>r.phase==='TRAIN'),test=selected.filter(r=>r.phase==='TEST');
 groups.push({side,filter,all:statistics(selected),train:statistics(train),test:statistics(test),testCoinCI:clusterCI(test),testTimeCI:clusterCI(test,'trade',r=>Math.floor(r.decisionAt/(2*H))),lag10:statistics(records.filter(r=>r.side===side&&r.modelLagMinutes===10&&fn(r.features))),matchedAvailableBaseline:statistics(base.filter(r=>r.features.status==='OK')),testRejectedAvailable:statistics(base.filter(r=>r.phase==='TEST'&&r.features.status==='OK'&&!fn(r.features))),rejectedAvailable:statistics(base.filter(r=>r.features.status==='OK'&&!fn(r.features))),withoutLaterConflicts:statistics(selected.filter(r=>!r.laterTimestampConflict)),crowdRiseAtLeast1pp:statistics(selected.filter(r=>r.crowdTrend.delta1hPp>=1)),marketRelative8hPct:(()=>{const rs=selected.filter(r=>r.trade.status==='OK'&&r.benchmark.status==='OK');return rs.length?rs.reduce((s,r)=>s+r.trade.directionalReturns['8h']-r.benchmark.directionalReturns['8h'],0)/rs.length:null;})(),inverse:statistics(selected,'inverse'),benchmark:statistics(selected,'benchmark'),modelExit:filter==='MODEL_RR15'?statistics(selected,'modelTrade'):undefined,modelExitTest:filter==='MODEL_RR15'?statistics(test,'modelTrade'):undefined,matchedFixedModelExitTest:filter==='MODEL_RR15'?statistics(test.filter(r=>r.modelTrade.status==='OK')):undefined,matchedFixedForModelExit:filter==='MODEL_RR15'?statistics(selected.filter(r=>r.modelTrade.status==='OK')):undefined});
}
const runtime=await read(dir+'/runtime-signals-frozen.json'),actual=runtime.history.filter(e=>e.version.includes('_V2_')&&e.delivery.status==='SENT'&&e.observedAt<m.end),actualMature=actual.filter(e=>Math.ceil(e.observedAt/S)*S+S+8*H<=m.end);
validation.passed=true;const summary={version:VERSION,manifest:m,coverage,groups,validation,counts:{replay:cohort.events.length,mature:records.length/2,validOutcomes:records.filter(r=>r.modelLagMinutes===5&&r.trade.status==='OK').length,invalidPriceOutcomes:records.filter(r=>r.modelLagMinutes===5&&r.trade.status!=='OK').length,bySide:Object.fromEntries(['LONG','SHORT'].map(s=>[s,cohort.events.filter(e=>e.side===s).length])),actualV2Signals:actual.length,actualMature:actualMature.length},limitations:m.protocol.limitations};
await fs.writeFile(dir+'/results.json',JSON.stringify({...summary,records}));await fs.writeFile(dir+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify({stage:'COMPLETE',counts:summary.counts,coverage,validation,groups:groups.map(g=>({side:g.side,filter:g.filter,all:g.all,train:g.train,test:g.test,lag10:g.lag10,modelExit:g.modelExit}))}));
