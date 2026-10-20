import assert from 'node:assert/strict';
import fs from 'node:fs';
import {shortSimulation,FILTERS,analyze} from './backtest-pump-short-filters.mjs';
import {matches,stats} from './backtest-pump-entry-filters.mjs';
const bar=(i,o=100,h=101,l=99,c=100)=>({t:i*60000,end:(i+1)*60000-1,o,h,l,c});
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,a+' != '+b);
const both=shortSimulation([bar(0),bar(1,100,107,97)],0,Infinity);
assert.equal(both.status,'SL');assert.equal(both.ambiguousStopFirst,true);approx(both.netRoe5x,-30.7);
const tp=shortSimulation([bar(0),bar(1,100,101,97)],0,Infinity);
assert.equal(tp.status,'TP');approx(tp.netRoe5x,9.3);
const gap=shortSimulation([bar(0),bar(1),bar(2,110,111,109)],0,Infinity);
approx(gap.exit,110);approx(gap.netRoe5x,-50.7);
assert.equal(shortSimulation([bar(0),bar(2)],0,Infinity).status,'NO_ENTRY_DATA');
assert.equal(shortSimulation([bar(0),bar(1),bar(3)],0,Infinity).status,'DATA_GAP');
assert.equal(shortSimulation([bar(0),bar(1)],0,Infinity).status,'CENSORED');
const full=Array.from({length:361},(_,i)=>bar(i));
const timeout=shortSimulation(full,0,Infinity);assert.equal(timeout.status,'TIMEOUT');approx(timeout.netRoe5x,-.7);
const data=JSON.parse(fs.readFileSync(new URL('../data/research/pump-path-week-20261015/results.json',import.meta.url),'utf8'));
for(const e of data.events){
  const changed={...e,path:{complete:false},pathAfter3m:{complete:false},tradeAtSignal:{status:'SL'},tradeAfter3m:{status:'TP'}};
  for(const f of FILTERS)assert.equal(matches(e,f),matches(changed,f));
}
const f=FILTERS[0],sample={...data.events[0],path:{complete:false},tradeAtSignal:tp};
assert.equal(stats([sample],f).n,0);
// Selection must ignore later outcomes, using synthetic sufficiently broad train cohort.
const start=0,split=4*86400000,fixture={start,events:Array.from({length:30},(_,i)=>({symbol:'S'+i,at:(i%3)*86400000+i*60000,atSignal:{rsi14:95},path:{complete:true},tradeAtSignal:tp}))};
fixture.events.push({...fixture.events[0],at:split+60000,tradeAtSignal:both});
const first=analyze(fixture).selectedId;
fixture.events.at(-1).tradeAtSignal={...tp,netRoe5x:1000};
assert.equal(analyze(fixture).selectedId,first);assert.equal(first,'short_rsi90');
console.log('PASS: SHORT formula/TP/SL/same-bar/gap/timeout/censor, causal filters, train-only selection');
