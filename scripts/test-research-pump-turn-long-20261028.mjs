import assert from 'node:assert/strict';
import {simulateLong} from './research-pump-turn-long-20261028.mjs';
const M=60000,start=1792800000000,event={observedAt:start-10000,zoneLow:104,returnBase:100,baseline:10000};
const rows=()=>Array.from({length:360},(_,i)=>({t:start+i*M,end:start+(i+1)*M-1,o:100,h:101,l:99,c:100,v:10,q:10000,buy:6000}));
let a=rows(),r=simulateLong(event,a,start+360*M);assert.equal(r.status,'TIMEOUT');assert.ok(Math.abs(r.netRoe5x+.7)<1e-8);assert.equal(r.stressRoe5x,-1.5);
a[0].h=102;r=simulateLong(event,a,start+360*M);assert.equal(r.status,'TP');assert.ok(Math.abs(r.netRoe5x-9.3)<1e-8);
a[0].l=94;r=simulateLong(event,a,start+360*M);assert.equal(r.status,'SL');assert.equal(r.ambiguous,true);assert.ok(Math.abs(r.netRoe5x+30.7)<1e-8);
a[0].o=90; // Entry uses the actual first OPEN, never the event's historical live price.
r=simulateLong({...event,livePrice:999},a,start+360*M);assert.equal(r.entry,90);
a=rows();a[1].o=90;a[1].l=89;r=simulateLong(event,a,start+360*M);assert.equal(r.exit,90,'gap SL executes at adverse open');
a=rows();a.splice(10,1);assert.equal(simulateLong(event,a,start+360*M).status,'DATA_GAP');
assert.equal(simulateLong(event,rows().slice(0,2),start+2*M).status,'CENSORED');
assert.equal(simulateLong(event,[],start+360*M).status,'NO_ENTRY_DATA');
assert.equal(simulateLong(event,rows(),start+360*M,'wait_full_5m').status,'NO_CONFIRMATION');
a=rows();for(let i=0;i<5;i++)Object.assign(a[i],{o:105,c:110,h:111,l:104,q:30000,buy:20000});
r=simulateLong({...event,observedAt:start+1000},a,start+360*M,'wait_full_5m');assert.equal(r.entryAt,start+5*M,'entry only after the full qualifying candle closes');
console.log('PASS LONG research: TP/SL/ambiguity/gaps/timeouts/censoring, next-minute execution and closed confirmation, no price lookahead.');
