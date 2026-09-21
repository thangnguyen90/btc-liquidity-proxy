import assert from 'node:assert/strict';
import { buildCoinHorizonAnalysis as build } from '../src/coinHorizonAnalysis.js';
const now=Date.UTC(2026,8,6,6);
const a={generatedAt:new Date(now).toISOString(),market:{markPrice:100},trend:{frames:[
  {interval:'1h',state:'UP',atr14:2,closeTime:now-1},
  {interval:'4h',state:'UP',atr14:5,closeTime:now-1},
]},zones:{supports:[{low:96,high:97,mid:96.5,sources:['1h SWING LOW']}],resistances:[{low:101,high:102,mid:101.5,sources:['5m SWING HIGH']}]},
coinglass:{available:true,combined:{liquidityBias:'UPPER_FIRST'},frames:[{range:'24h',scrapedAt:new Date(now).toISOString(),above:[{bandLow:103,bandHigh:104,price:103.5,lifecycle:'FRESH',effectiveAttractionScore:50}],below:[]}]}};
const r=build(a,now);
assert.equal(r.available,true);assert.equal(r.observeOnly,true);
assert.deepEqual(r.scenarios.map(s=>s.hours),[4,8,12]);
assert.equal(r.scenarios[0].lower,95);assert.equal(r.scenarios[0].upper,105);
assert.equal(r.scenarios[0].direction,'UPPER');
assert.ok(r.scenarios[0].support);assert.equal(r.scenarios[0].resistance,null);
assert.ok(r.scenarios[0].upperLiquidity);
assert.ok(r.scenarios[2].upper>r.scenarios[1].upper&&r.scenarios[1].lower<r.scenarios[0].lower);
const stale=structuredClone(a);stale.generatedAt=new Date(now-100000).toISOString();
assert.equal(build(stale,now).scenarios[0].direction,'WAIT_DATA');
const conflict=structuredClone(a);conflict.coinglass.combined.liquidityBias='LOWER_FIRST';
assert.equal(build(conflict,now).scenarios[0].direction,'CONFLICT');
const rejected=structuredClone(a);rejected.coinglass.frames[0].above[0].lifecycle='REJECTED';
assert.equal(build(rejected,now).scenarios[0].upperLiquidity,null);
const cgOld=structuredClone(a);cgOld.coinglass.frames[0].scrapedAt=new Date(now-21*60000).toISOString();
assert.equal(build(cgOld,now).scenarios[0].liquidityRange,null);
assert.equal(build({},now).available,false);
const missingTime=structuredClone(a);delete missingTime.trend.frames[0].closeTime;
assert.equal(build(missingTime,now).stale,true);
const huge=structuredClone(a);huge.trend.frames[1].atr14=500;
assert.equal(build(huge,now).scenarios[0].lower,1);
assert.equal(build(huge,now).scenarios[0].clipped,true);
console.log('Coin horizon scenarios tests passed');
