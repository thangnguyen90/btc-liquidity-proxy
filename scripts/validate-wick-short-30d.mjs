import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {detect} from './research-wick-short-model.mjs';
const dir='data/research/wick-short-30d-20261031',r=JSON.parse(await fs.readFile(dir+'/results.json','utf8')),S=900000;
let checked=0,priceGaps=0;
for(const cohort of r.cohorts){
 const raw=JSON.parse(await fs.readFile(dir+'/raw/'+encodeURIComponent(cohort.symbol)+'-price.json','utf8'));
 const rows=raw.map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],q:+x[7]})).filter(x=>x.t+S<=r.manifest.end);
 priceGaps+=rows.filter((x,i)=>i&&x.t-rows[i-1].t!==S).length;
 assert.equal(detect(rows,r.manifest.start,r.manifest.end).length,cohort.events.length);
 for(const e of cohort.events){
  const until=rows.filter(x=>x.t<e.at);
  assert.ok(detect(until,r.manifest.start,e.at+1).some(x=>x.at===e.at),'Future isolation');
  const i=rows.findIndex(x=>x.t===e.at);
  if(i>=0)assert.equal(rows[i].o,e.entry);
  for(const h of [1,4,24]){const o=e.outcomes[h];if(!o)continue;
   const bars=rows.slice(i,i+4*h);assert.equal(bars.length,4*h);
   let first='NEITHER';for(const b of bars){if(b.l<=e.entry*.95){first='DOWN';break;}if(b.h>=e.entry*1.05){first='UP';break;}}
   assert.equal(o.success,first==='UP');assert.equal(o.first,first);
   const stop=e.entry*(1-.2/3);const hit=bars.find(b=>b.l<=stop),exit=hit?Math.min(stop,hit.o):bars.at(-1).c;
   assert.ok(Math.abs(o.netRoe-((exit/e.entry-1)*100-.12)*3)<1e-9);
   if(hit)assert.ok(o.netRoe<=-20.36+1e-8);
   checked++;
  }
 }
}
assert.equal(r.events.length,r.splits.priceOnly.events);
const result={passed:true,cohorts:r.cohorts.length,outcomesChecked:checked,priceGaps,causalDetection:true,independentBarrierAndCostReconciliation:true};
await fs.writeFile(dir+'/independent-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
