import assert from 'node:assert/strict';import {historyPoints,selectPoints,outcome} from './research-pumpglass-positioning.mjs';
const t=1800000000000,S=300000,H=3600000,h={bucket:28800,bars:[{t:t/1000,w:80,c:20},{t:(t+8*H)/1000,w:90,c:20}]};
let p=selectPoints(h,{start:t,end:t+30*H,filter:'DIVERGENCE70_40'})[0];assert.equal(p.entryAt,t+8*H+S);assert.equal(selectPoints(h,{start:t,end:t+16*H,filter:'ALL'}).length,0);assert.equal(selectPoints(h,{start:t,end:t+40*H,lagBuckets:2})[0].entryAt,t+16*H+S);
assert.equal(historyPoints(h,t+30*H)[1].delta,10);assert.equal(historyPoints({bucket:28800,bars:[h.bars[0],{...h.bars[1],t:h.bars[1].t+28800}]},t+40*H)[1].delta,null);
const bars=Array.from({length:96},(_,i)=>[p.entryAt+i*S,100,101,99,100,100,p.entryAt+(i+1)*S-1]);
for(const side of [1,-1]){let o=outcome(bars,p,side,[]);assert(Math.abs(o.netRoe+.42)<1e-8);const both=bars.map((x,i)=>i?[...x]:[x[0],100,110,90,100,100,x[6]]);o=outcome(both,p,side,[]);assert.equal(o.kind,'SL');assert(o.ambiguous);assert(Math.abs(o.netRoe+20.42)<1e-8);}
assert.equal(outcome(bars.slice(1),p,1,[]).status,'PRICE_GAP');
const fund=[{fundingTime:p.entryAt+H,fundingRate:.001,markPrice:100}];assert(Math.abs(outcome(bars,p,1,fund).netRoe+.72)<1e-8);assert(Math.abs(outcome(bars,p,-1,fund).netRoe+.12)<1e-8);
console.log('PASS: bucket-end availability, extra bucket delay, gaps, LONG/SHORT SL-first and funding direction.');
