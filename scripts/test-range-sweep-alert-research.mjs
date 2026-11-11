import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {simulateBracket} from './research-range-sweep-alert-model.mjs';
const bar=(o,h,l,c,t=60000)=>({o,h,l,c,t,end:t+59999});
assert.equal(simulateBracket([bar(100,102,99.5,101)],100,1,1,1,1).outcome,'TP');
assert.equal(simulateBracket([bar(100,100.5,98,99)],100,-1,1,1,1).outcome,'TP');
for(const side of [1,-1]){
 const both=simulateBracket([bar(100,102,98,100)],100,side,1,1,1);
 assert.equal(both.outcome,'SL');assert.equal(both.ambiguous,true);assert.equal(both.exit,100-side);
}
assert.equal(simulateBracket([bar(98,100,97,99)],100,1,1,1,1).exit,98);
assert.equal(simulateBracket([bar(102,103,100,101)],100,-1,1,1,1).exit,102);
assert.equal(simulateBracket([bar(102,104,100,103)],100,1,1,1,1).outcome,'TP_GAP');
assert.equal(simulateBracket([bar(100,100.5,99.5,100.2)],100,1,1,1,1).outcome,'TIMEOUT');
console.log('PASS research exit assumptions: LONG/SHORT, adverse-first ambiguous bar, gaps at open, timeout. No runtime imports.');
try{
 const r=JSON.parse(await fs.readFile('data/research/range-sweep-alert-backtest-20261031/results.json','utf8'));
 assert.equal(new Set(r.records.map(x=>x.id)).size,r.records.length);
 for(const x of r.records){
  assert.ok(x.entryAt>x.deliveredAt&&x.deliveredAt>=x.signalAt);
  for(const [minutes,h]of Object.entries(x.horizons))if(Number.isFinite(h.netPct)){
   assert.ok(x.entryAt+Number(minutes)*60000<=Math.floor(Date.parse(r.cutoff)/60000)*60000);
   assert.ok(Math.abs(h.grossPct-h.netPct-.12-h.fundingPct)<1e-8);
   assert.ok(Math.abs(h.netPct-h.stressNetPct-.08)<1e-8);
  }
  for(const b of Object.values(x.brackets))assert.ok(b.exitAt>=x.entryAt&&b.exitAt<x.entryAt+30*60000);
 }
 for(const h of [5,15,30,60])assert.equal(r.groups.ALL.horizons[h].n,r.groups.LONG.horizons[h].n+r.groups.SHORT.horizons[h].n);
 assert.equal(r.errors.length,0);
 console.log('PASS saved study integrity: unique delivered alerts, causal delayed entry, mature horizons, exact cost/funding arithmetic, bounded exits, side totals, no data errors.');
}catch(e){if(e.code!=='ENOENT')throw e;}
