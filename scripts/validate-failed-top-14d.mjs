import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const dir='data/research/failed-top-14d-20261031',r=JSON.parse(await fs.readFile(dir+'/results.json','utf8'));
assert.equal(r.errors.length,0);assert.equal(r.cohorts.length,r.manifest.universe.length);
assert.equal(r.events.length,r.counts.priceCandidates);assert.equal(r.events.filter(e=>e.qualifies).length,r.counts.ratioDown);
let prior=new Map();for(const e of r.events){
 assert.ok(e.at>=r.manifest.start&&e.at<=r.manifest.end);assert.ok(!prior.has(e.symbol)||e.at-prior.get(e.symbol)>=4*3600000);prior.set(e.symbol,e.at);
 if(e.ratio){assert.ok(e.ratio.at<=e.at-900000);assert.ok(e.ratio.baselineAt===e.ratio.at-3*900000);assert.equal(e.qualifies,e.ratio.nearTopDropPct<0);}
 for(const [h,o]of Object.entries(e.outcomes))if(Number.isFinite(o.netPct)){assert.ok(e.at+Number(h)*60000<=r.manifest.end);assert.ok(Math.abs(o.grossPct-o.netPct-.12)<1e-8);assert.ok(e.entry>0);}
}
const ain=r.events.find(e=>e.symbol==='AINUSDT'&&e.at===Date.parse('2026-10-31T11:00:00Z'));assert.ok(ain?.qualifies,'known AIN case captured without using later fall');
const validation={at:new Date().toISOString(),passed:true,coins:r.cohorts.length,counts:r.counts,tests:['All universe symbols accounted for; no request errors','Signal cutoff, 4h cooldown, lagged ratio and baseline checks','Outcome horizon maturity and cost arithmetic','Known AIN case at18:00 VN captured'],heatmapConfirmed:false};await fs.writeFile(dir+'/validation.json',JSON.stringify(validation,null,2));console.log(JSON.stringify(validation));
