import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {classifyNearShort,firstRetainedWaveEvents,preEventInput} from './research-pump-turn-near-classification-20261028.mjs';
import {matureCohort} from './research-pump-turn-near-20261028.mjs';
const close=Date.parse('2026-10-24T00:59:59.999Z');
const base={version:'PUMP_TURN_ZONE_WATCH_V1_20261018',side:'SHORT',state:'NEAR',asOf:close,expiresAt:close+300001,observedAt:close+10001,liveAt:close+9001,livePrice:95,peak:100,peakAt:close+1-1800000,pump6h:25,preBuyPct:45,preVolumeX:1,gain60:-1,zoneLow:94,zoneHigh:94.7};
const classify=changes=>classifyNearShort({...base,...changes});
assert.equal(classify({}).label,'SELL_PRESSURE');
assert.equal(classify({preBuyPct:50,gain60:1}).label,'BUY_PRESSURE');
for(const change of [{preBuyPct:45.01},{preVolumeX:.999},{gain60:0},{preBuyPct:50,gain60:0},{preBuyPct:49.99,gain60:1}])assert.equal(classify(change).label,'MIXED');
const deep=classify({livePrice:90,zoneLow:89,zoneHigh:89.5});
assert.equal(deep.label,'DEEP_DROP');assert.equal(deep.flow,'SELL_PRESSURE');
assert.equal(classify({livePrice:90.0001,zoneLow:89,zoneHigh:89.5}).label,'SELL_PRESSURE');
for(const field of ['observedAt','asOf','expiresAt','liveAt','livePrice','peak','peakAt','pump6h','preBuyPct','preVolumeX','gain60','zoneLow','zoneHigh']){
 for(const value of [null,undefined,NaN,Infinity,'1'])assert.equal(classify({[field]:value}).label,'UNKNOWN',field+': '+value);
}
for(const change of [{asOf:base.observedAt},{expiresAt:base.observedAt},{asOf:close-1},{liveAt:base.observedAt-30001},{liveAt:base.observedAt+1001},{peakAt:close+1},{peakAt:base.peakAt+1},{pump6h:14.99},{preBuyPct:101},{preBuyPct:-1},{preVolumeX:-1},{version:'legacy'},{side:'LONG'},{state:'CHASE'},{state:'IN_ZONE'},{livePrice:93.99},{livePrice:100.01},{peak:200}])assert.equal(classify(change).label,'UNKNOWN',JSON.stringify(change));
assert.notEqual(classify({liveAt:base.observedAt-30000}).label,'UNKNOWN');
assert.notEqual(classify({liveAt:base.observedAt+1000}).label,'UNKNOWN');
assert.equal(classify({state:'IN_ZONE',livePrice:94.7}).label,'SELL_PRESSURE');
const hostile={...base};
for(const key of ['results','futureCandles','dropFromPeakPct','preReturn60m','netRoe5x'])Object.defineProperty(hostile,key,{get(){throw Error('Future/derived input read: '+key);}});
assert.deepEqual(classifyNearShort(hostile),classifyNearShort(base));
assert.equal('results' in preEventInput({...base,results:{immediate:{netRoe5x:999}}}),false);
assert.equal(classify({}).observeOnly,true);assert.equal(classify({}).affectsOrders,false);
const waves=[{id:'later',symbol:'A',peakAt:1,observedAt:2},{id:'first',symbol:'A',peakAt:1,observedAt:1},{id:'nextPeak',symbol:'A',peakAt:2,observedAt:3},{id:'otherCoin',symbol:'B',peakAt:1,observedAt:4}];
assert.deepEqual(firstRetainedWaveEvents(waves).map(e=>e.id),['first','nextPeak','otherCoin']);
const snapshot=JSON.parse(await fs.readFile(new URL('../data/research/pump-turn-near-eval-20261028/cohort.json',import.meta.url),'utf8'));
assert.equal(snapshot.events.length,571);assert.equal(matureCohort(snapshot.events,snapshot.cutoff).length,527);
for(const e of snapshot.events){const a=classifyNearShort(e),b=classifyNearShort({...e,results:{immediate:{netRoe5x:999}},preReturn60m:999,dropFromPeakPct:999});assert.deepEqual(a,b);}
console.log('PASS: pre-event-only inputs, boundaries, missing/legacy/future/stale fail-closed, exclusive depth precedence, first retained global wave, frozen cohort maturity.');
