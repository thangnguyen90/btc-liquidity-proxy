import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {earlyPumpBars} from '../src/earlyPumpWatch.js';
import {priceFeatures} from '../src/pumpHighWhaleShortModel.js';
import {shortCrowdingAt, sidewaysBaseAt, lowerZoneForBase} from '../src/sidewaysShortCrowding.js';
const S=300000;
const raw=Array.from({length:300},(_,i)=>{const o=100,c=100+(i%2?.05:-.05),h=i===50?120:100.2,l=99.8;return[i*S,o,h,l,c,1,(i+1)*S-1,1000,1,.5,500];});
const bars=earlyPumpBars(raw,300*S),feature=priceFeatures(raw).at(-1),base=sidewaysBaseAt(bars,299,feature);
assert.equal(base.status,'QUALIFIED');assert.equal(base.side,'UNDECIDED');assert.equal(base.affectsOrders,false);
// Appending an enormous future dump cannot change an earlier decision or its rolling features.
const future=[300*S,100,101,40,50,1,301*S-1,1000000,1,.5,500000],extended=[...raw,future];
assert.deepEqual(sidewaysBaseAt(earlyPumpBars(extended,301*S),299,priceFeatures(extended)[299]),base);
assert.equal(sidewaysBaseAt(bars,299,{...feature,at:feature.at+S}).status,'PRICE_HISTORY_MISSING');
assert.equal(sidewaysBaseAt(earlyPumpBars(extended,301*S),300,priceFeatures(extended)[300]).status,'ALREADY_LEFT_BASE_OR_IMPULSE');
const trend=structuredClone(bars);for(let i=288;i<300;i++){const c=99.8+(i-288)*.08;Object.assign(trend[i],{o:c-.03,c,l:c-.08,h:c+.08});}
assert.equal(sidewaysBaseAt(trend,299,feature).status,'NOT_SIDEWAYS');
const broken=structuredClone(bars);broken[290].t+=1;assert.equal(sidewaysBaseAt(broken,299,feature).status,'PRICE_HISTORY_MISSING');
const highVol=structuredClone(bars);highVol[299].q=2000;assert.equal(sidewaysBaseAt(highVol,299,feature).status,'NOT_SIDEWAYS');
assert.equal(sidewaysBaseAt(bars,299,{...feature,high24h:105}).status,'NOT_LOW_AFTER_DECLINE');
assert.equal(sidewaysBaseAt(bars,299,{...feature,heightPct:50}).status,'NOT_LOW_AFTER_DECLINE');
const at=300*S,p={sourceAt:at-120000,observedAt:at-60000,whaleCount:20,whaleLong:35,smartLong:36,crowdLong:37};
assert.equal(shortCrowdingAt([p],at).status,'QUALIFIED');
assert.equal(shortCrowdingAt([{...p,observedAt:at+1}],at).status,'POSITION_MISSING_OR_STALE');
assert.equal(shortCrowdingAt([{...p,sourceAt:at-900001}],at).status,'POSITION_MISSING_OR_STALE');
assert.equal(shortCrowdingAt([{...p,sourceAt:at+1}],at).status,'POSITION_MISSING_OR_STALE');
for(const k of ['whaleLong','smartLong','crowdLong']){
 assert.equal(shortCrowdingAt([{...p,[k]:40}],at).status,'NOT_ALL_THREE_SHORT_OVER_60');
 assert.equal(shortCrowdingAt([{...p,[k]:null}],at).status,'POSITION_MISSING_OR_STALE');
}
assert.equal(shortCrowdingAt([p,{...p,observedAt:at+1,whaleLong:90}],at).status,'QUALIFIED');
assert.equal(shortCrowdingAt([{...p,ambiguous:true}],at).laterTimestampConflict,true);
assert.equal(shortCrowdingAt([],at).status,'POSITION_MISSING_OR_STALE');
const liq={status:'OK',asOf:base.at-S,zones:[{low:98,high:98.5}],upperScore:0,lowerScore:40};
assert.equal(lowerZoneForBase(base,liq).status,'QUALIFIED');
assert.equal(lowerZoneForBase(base,{...liq,asOf:base.at}).status,'MODEL_MISSING_OR_NOT_CAUSAL');
assert.equal(lowerZoneForBase(base,null).status,'MODEL_MISSING');
assert.equal(lowerZoneForBase(base,{...liq,zones:[{low:95,high:96}]}).status,'NO_UNTOUCHED_LOWER_ZONE_WITHIN_3PCT');
assert.equal(lowerZoneForBase(base,{...liq,zones:[{low:99.7,high:99.8}]}).status,'NO_UNTOUCHED_LOWER_ZONE_WITHIN_3PCT');
assert.equal(lowerZoneForBase({status:'NOT_SIDEWAYS'},liq).status,'BASE_NOT_QUALIFIED');
// Regression against the actual pre-dump development case; not part of primary performance.
const r=JSON.parse(await fs.readFile('data/research/sideways-allshort-20261107/results.json'));
const before=r.gtc.timeline.find(x=>x.at===Date.UTC(2026,10,7,1,10));
assert.equal(before.base.status,'QUALIFIED');assert.equal(before.position.status,'QUALIFIED');assert.equal(before.model[5].status,'QUALIFIED');
const dump=r.gtc.timeline.find(x=>x.at===Date.UTC(2026,10,7,1,30));assert.equal(dump.base.status,'ALREADY_LEFT_BASE_OR_IMPULSE');
console.log('PASS: early base, future-data invariance, reject dump/trend/volume/gaps, position freshness/knownBy/strict thresholds, causal Model1/3, GTC pre-dump regression');
