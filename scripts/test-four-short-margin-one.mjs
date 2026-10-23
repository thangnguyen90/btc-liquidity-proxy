import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AutoEntryControls,entryRoute} from '../src/autoEntryControls.js';
import {FOUR_SHORT_MARGIN_ONE_TARGETS,applyFourShortMarginOne,fourShortMarginOneKeys} from '../src/fourShortMarginOneRollout.js';
import {impulseSizing} from '../src/postMoveImpulseSizing.js';
const controls=new AutoEntryControls(join(await mkdtemp(join(tmpdir(),'four-short-margin-')),'controls.json'));
const routes=FOUR_SHORT_MARGIN_ONE_TARGETS.map(t=>({...t,streamId:t.stream,signalLabel:t.label,signalInterval:t.interval}));
controls.seed([...routes,{source:'heatmap-full-sweep',streamId:'live-mark-frozen-clusters',signalLabel:'ALL_TRACKED_UPPER_SWEPT',side:'SHORT'},
 {source:'pump-turn-near-short',streamId:'live-5m-near-zone',signalLabel:'PUMP_TURN_NEAR_SHORT',side:'SHORT'},
 {source:'liqscan-high-score',streamId:'coin-level-analysis',signalLabel:'LIQSCAN_HIGH_SCORE_ABOVE_LONG',side:'LONG'}]);
const before=controls.read();before.enabled=true;
for(const r of Object.values(before.routes))Object.assign(r,{enabled:true,enabledAt:'2026-10-18T00:00:00.000Z'});
for(const key of fourShortMarginOneKeys(before))before.routes[key].marginUsdt=5;
before.protectionExclusions=['QUSDT'];before.protectionFullBypasses=['RLCUSDT'];
const pristine=structuredClone(before),after=applyFourShortMarginOne(before),keys=fourShortMarginOneKeys(after);
assert.deepEqual(before,pristine,'pure operation never mutates input');assert.equal(keys.length,4);
for(const [key,r] of Object.entries(before.routes))assert.deepEqual(after.routes[key],keys.includes(key)?{...r,marginUsdt:1}:r);
assert.equal(after.enabled,before.enabled);assert.deepEqual(after.protectionExclusions,before.protectionExclusions);assert.deepEqual(after.protectionFullBypasses,before.protectionFullBypasses);
assert.deepEqual(applyFourShortMarginOne(after),after,'idempotent without resetting activation');
controls.save(after);
const restart=new AutoEntryControls(controls.file),read=restart.read();assert.deepEqual(fourShortMarginOneKeys(read),keys);
for(const key of keys)assert.equal(read.routes[key].marginUsdt,1);
assert.equal(read.routes[entryRoute({source:'heatmap-full-sweep',streamId:'live-mark-frozen-clusters',signalLabel:'ALL_TRACKED_UPPER_SWEPT',side:'SHORT'}).key].marginUsdt,5);
assert.equal(read.routes[entryRoute({source:'pump-turn-near-short',streamId:'live-5m-near-zone',signalLabel:'PUMP_TURN_NEAR_SHORT',side:'SHORT'}).key].marginUsdt,2);
for(const route of routes){const r=read.routes[entryRoute(route).key];const p={...route,side:'SELL',marginUsdt:1,leverage:r.leverage,notionalUsdt:r.leverage,takeProfitRoePct:r.takeProfitRoePct};
 if(route.source==='post-move-impulse')p.impulseSizing=impulseSizing({side:'SHORT'});
 restart.assertEntry(p);assert.throws(()=>restart.assertEntry({...p,marginUsdt:5,notionalUsdt:5*r.leverage}),/size|quyết định/i);
}
const missing=structuredClone(before);delete missing.routes[keys[0]];assert.throws(()=>applyFourShortMarginOne(missing),/MISSING/);
const raced=structuredClone(before);raced.routes[keys[0]].marginUsdt=7;assert.throws(()=>applyFourShortMarginOne(raced),/CHANGED/);
const disk=JSON.parse(await readFile(controls.file,'utf8'));for(const key of keys)assert.equal(disk.routes[key].enabledAt,before.routes[key].enabledAt);
console.log('PASS exact four SHORT5→1 config operation, restart, stale5 blocked, activation/TP/leverage/other routes including current Heatmap5/PumpTurn2/LONG/protection unchanged. Mock only.');
