import assert from 'node:assert/strict';import {dcaTrade} from './research-early-pump-dca.mjs';
const t=1800000000000,S=300000;
const path=Array.from({length:48},(_,i)=>({t:t+i*S,end:t+(i+1)*S,o:100,h:100.5,l:99.5,c:100}));
const run=(p,v='DCA',level=95,f=[])=>dcaTrade(p,level,f,v);
assert(Math.abs(run(path,'FULL').netPct+.42)<1e-8);assert(Math.abs(run(path,'THIRD_ONLY').netPct+.14)<1e-8);
let p=path.map((b,i)=>i===0?{...b,o:100,h:101,l:97,c:98}:i===1?{...b,o:98,h:99,l:95.5,c:96}:i>=2?{...b,o:96,h:96.5,l:95.5,c:96}:b);
let a=run(p);assert.equal(a.entryCount,3);assert.deepEqual(a.entries.map(e=>e.price),[100,98,96]);assert(Math.abs(a.marginUsed-1)<1e-8);assert.equal(a.stop,100*(1-.2/3));assert.equal(a.entries[1].at,t+S);
assert.equal(run(p,'DCA_RECLAIM',99).entryCount,1,'do not average after losing breakout level');
const gap=p.map((b,i)=>i===1?{...b,o:90,h:98,l:89,c:95}:b);a=run(gap);assert.equal(a.entryCount,1);assert.equal(a.reason,'SL_GAP');assert.equal(a.exitPrice,90);
const both=path.map((b,i)=>i===0?{...b,h:105,l:90,c:100}:b);a=run(both);assert.equal(a.reason,'SL');assert(a.ambiguous);assert.equal(a.entryCount,1);
const rebound=p.map((b,i)=>i===1?{...b,o:99}:b);assert.equal(run(rebound).entries[1]?.at,t+2*S,'gap above add threshold does not fill pending add');
a=run(p,'DCA',95,[{fundingTime:t+S,fundingRate:.001,markPrice:98},{fundingTime:t+3*S,fundingRate:.001,markPrice:96}]);
const expected=.01*98*.001+(1/100+1/98+1/96)*96*.001;assert(Math.abs(a.fundingCash-expected)<1e-10,'funding uses quantity held, same-open buy after funding');
for(const v of ['FULL','THIRD_ONLY','DCA','DCA_RECLAIM']){const q=run(p,v);assert(q.marginUsed<=1+1e-12);assert(Math.abs(q.averagePrice-(q.entries.reduce((s,e)=>s+e.price*e.qty,0)/q.entries.reduce((s,e)=>s+e.qty,0)))<1e-9);}
console.log('PASS DCA: fixed budget, three entries, causal close/open adds, no stop widening, gap/ambiguous stop first, reclaim gating and funding quantity.');
