import assert from 'node:assert/strict';
import {ema99ShortReboundPreview} from '../src/ema99ShortReboundPreview.js';
import {postPumpEma99Payload} from '../src/postPumpEma99Retest.js';
const e={stage:'REJECTED_SHORT_WATCH',side:'SHORT',closed:true,ema99:.05173073,price:.04784,invalidation:.05303,symbol:'TESTUSDT',interval:'15m',generatedAt:new Date().toISOString(),candleAt:Date.now()};
const p=ema99ShortReboundPreview(e);assert.ok(p);assert.ok(Math.abs(p.lower-.05147207635)<1e-12);assert.ok(p.upper<p.invalidation);
const embeds=postPumpEma99Payload(e).embeds;assert.equal(embeds.length,2);assert.equal(embeds[1].color,0xf59e0b);assert.match(embeds[1].fields[1].value,/KHÔNG phải SL/);
for(const patch of [{stage:'NEAR_REJECT_SHORT_WATCH'},{closed:false},{side:'LONG'},{ema99:null},{price:.052},{invalidation:.0518}])assert.equal(ema99ShortReboundPreview({...e,...patch}),null);
assert.equal(postPumpEma99Payload({...e,stage:'TOUCH_WATCH'}).embeds.length,1);
console.log('Rebound price preview passed; no orders or Discord sends.');
