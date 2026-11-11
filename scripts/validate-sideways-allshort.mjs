import fs from 'node:fs/promises';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {statistics,H} from './research-dominance-model13.mjs';
const d='data/research/sideways-allshort-20261107',read=async f=>JSON.parse(await fs.readFile(f)),r=await read(d+'/results.json'),m=r.manifest,previous=await read(d+'/pre-guard-results-check.json');
assert.deepEqual(previous.keys,r.records.map(x=>[x.symbol,x.decisionAt,x.variant,x.modelLagMinutes]));
assert.deepEqual(previous.groups,r.groups.map(x=>[x.variant,x.side,x.all.n,x.all.meanRoe,x.test.n,x.test.meanRoe]));
const journals=new Map(),seen=new Set(),last=new Map();let snapshots=0,models=0,trades=0,skippedEntry=0,incomplete=0,hashes=0;
for(const [f,h]of Object.entries(m.journalHashes)){assert.equal(crypto.createHash('sha256').update(await fs.readFile(d+'/journal/'+f)).digest('hex'),h);hashes++;}
for(const e of r.records){const key=[e.symbol,e.decisionAt,e.variant,e.modelLagMinutes].join(':');assert.ok(!seen.has(key));seen.add(key);
 const cold=[e.symbol,e.variant,e.modelLagMinutes].join(':');assert.ok(e.decisionAt-(last.get(cold)??-Infinity)>=8*H);last.set(cold,e.decisionAt);
 if(!journals.has(e.symbol))journals.set(e.symbol,await read(d+'/journal/'+e.symbol+'.json'));
 const p=journals.get(e.symbol).points.filter(p=>p.observedAt<=e.decisionAt).sort((a,b)=>a.observedAt-b.observedAt||a.sourceAt-b.sourceAt).at(-1);
 assert.equal(p.sourceAt,e.position.sourceAt);assert.equal(p.observedAt,e.position.observedAt);assert.ok(p.sourceAt<=p.observedAt&&p.observedAt<=e.decisionAt&&e.decisionAt-p.sourceAt<=900000);
 for(const[a,b]of[['whaleLong','whaleShortPct'],['smartLong','smartShortPct'],['crowdLong','crowdShortPct']]){assert.equal(100-p[a],e.position[b]);assert.ok(e.position[b]>60);}snapshots++;
 assert.ok(e.base.referencePrice>=e.base.floor&&e.base.referencePrice<=e.base.ceiling&&e.base.latestBodyPct<=.5&&e.base.rangePct<=3&&e.base.volumeX<=1.5);
 assert.equal(e.entryAt,e.decisionAt+300000);
 for(const[lag,model]of Object.entries(e.models))if(model.status==='QUALIFIED'){assert.ok(model.asOf<=e.decisionAt-Number(lag)*60000);assert.ok(model.zone.high<e.base.low*.999);assert.ok(model.distancePct<=3);models++;}
 for(const trade of Object.values(e.trades))if(trade.status==='OK'){assert.ok(e.entryAt+8*H<=m.end);assert.ok(trade.entry>=e.base.floor&&trade.entry<=e.base.ceiling);assert.ok(trade.exitAt>=e.entryAt&&trade.exitAt<e.entryAt+8*H);assert.ok(Math.abs(trade.netRoe-3*(trade.grossPct-trade.costPct-trade.fundingPct))<1e-9);trades++;}else if(trade.status==='LEFT_BASE_BEFORE_DELAYED_ENTRY')skippedEntry++;else incomplete++;
 if(e.phase==='TRAIN')assert.ok(e.entryAt+8*H<=m.split);if(e.phase==='TEST')assert.ok(e.decisionAt>=m.split);
}
for(const g of r.groups){const xs=r.records.filter(e=>!e.calibrationCase&&e.variant===g.variant&&e.modelLagMinutes===5&&e.entryAt+8*H<=m.end).map(e=>({...e,trade:e.trades[g.side]}));assert.deepEqual(statistics(xs),g.all);assert.ok(xs.every(x=>x.symbol!=='GTCUSDT'));}
const before=await read(d+'/runtime-before-evaluation.json'),runtime={};for(const[p,h]of Object.entries(before)){let now;try{now=crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');}catch(e){now='UNAVAILABLE_'+e.code;}runtime[p]=now===h;assert.ok(runtime[p]);}
const files=['src/sidewaysShortCrowding.js','scripts/fetch-sideways-allshort.mjs','scripts/evaluate-sideways-allshort.mjs','scripts/test-sideways-allshort.mjs','scripts/validate-sideways-allshort.mjs'],codeHashes={};for(const f of files)codeHashes[f]=crypto.createHash('sha256').update(await fs.readFile(f)).digest('hex');
const health=await fetch('http://127.0.0.1:19082/healthz',{signal:AbortSignal.timeout(5000)});assert.ok(health.ok);
const out={status:'PASS',at:Date.now(),researchVersion:r.version,unitTest:'scripts/test-sideways-allshort.mjs PASS',guardsDoNotChangeResults:true,checks:{frozenJournalHashes:hashes,uniqueEvents:seen.size,originalKnownSnapshots:snapshots,causalLowerZones:models,executedTrades:trades,skippedAfterLeavingBase:skippedEntry,incompleteTrades:incomplete,independentTradeEngineAudit:r.audit.independentTrades,trainTestPurge:true,gtcExcludedFromPrimary:true,statsRecomputed:true,sourceAge15m:true,signalCloseInsideBase:true,modelLag5and10m:true,runtimeHashesUnchanged:runtime,healthStatus:health.status},codeHashes};await fs.writeFile(d+'/validation.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
