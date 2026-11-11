import assert from 'node:assert/strict';
import {classifyPpksContext, ppksContextFields} from '../src/ppksModel13WhaleContext.js';
import {sweepPositionContext} from '../src/heatmapSweepPositionAnalysis.js';

const step=300_000, end=1794042900000, at=end+1000, symbol='TESTUSDT';
const bundle=(side,asOf=end)=>{
  const bin=Math.round(Math.log(side==='LONG'?103:97)/Math.log(1.0025));
  return {models:[1,3].map(model=>({model,status:'OK',data:{
    source:'BINANCE_LOCAL',symbol,range:'24h',step,end:asOf,
    inputs:{markCoveragePct:100,oiCoveragePct:100},
    candles:[{time:asOf-2*step,close:100,high:100.2,low:99.8},{time:asOf-step,close:100,high:100.1,low:99.9}],
    profiles:Array.from({length:3},(_,i)=>({at:asOf-1-(2-i)*step,mark:true,oiFresh:true,bins:[[bin,100]]})),
  }}))};
};
const position=(long,observedAt=at-1000)=>sweepPositionContext({symbol,at},{at,points:[
  {sourceAt:at-30_000,observedAt,whaleCount:30,whaleLong:long,smartLong:long,crowdLong:50},
]});
const long={symbol,scannedAt:at,stage:'confirmed_long'};
const short={symbol,scannedAt:at,stage:'confirmed_short'};
const aligned=classifyPpksContext(long,{bundle:bundle('LONG'),position:position(60)});
assert.equal(aligned.state,'ALIGNED');
assert.equal(aligned.affectsOrders,false);
assert.equal(classifyPpksContext(short,{bundle:bundle('SHORT'),position:position(40)}).state,'ALIGNED');
assert.equal(classifyPpksContext(long,{bundle:bundle('SHORT'),position:position(70)}).state,'CONFLICT');
assert.equal(classifyPpksContext(long,{bundle:bundle('LONG'),position:position(55)}).state,'WAIT');
assert.equal(classifyPpksContext(long,{bundle:bundle('LONG'),position:position(75,at+1)}).state,'MISSING');
assert.equal(classifyPpksContext(long,{bundle:bundle('LONG',end+step),position:position(75)}).state,'MISSING');
assert.equal(classifyPpksContext({...long,stage:'watch_long_sweep'},{bundle:bundle('LONG'),position:position(60)}),null);
assert.ok(ppksContextFields(aligned).every(f=>f.value.length<=1024));
assert.match(ppksContextFields(aligned)[0].value,/Cụm trên.*điểm/);
assert.match(ppksContextFields(aligned)[1].value,/Cá voi: 60\.0% LONG/);
console.log('PASS PPKS context both directions, missing/future sources, conflict, bounded Discord and observe-only.');
