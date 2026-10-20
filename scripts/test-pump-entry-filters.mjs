import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FILTERS,matches,stats,analyze} from './backtest-pump-entry-filters.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/research/pump-path-week-20261015/results.json',import.meta.url),'utf8'));
for(const e of data.events){
  const changed={...e,path:{complete:false},pathAfter3m:{complete:false},tradeAtSignal:{status:'SL',netRoe5x:-100},tradeAfter3m:{status:'TP',netRoe5x:100},supplement24h:{recoveryAt:0}};
  for(const f of FILTERS)assert.equal(matches(e,f),matches(changed,f),'Outcomes cannot change membership');
}
const result=analyze(data),changed=structuredClone(data),split=data.start+4*86400000;
for(const e of changed.events.filter(e=>e.at>=split)){
  e.tradeAtSignal={status:'TP',netRoe5x:100};e.tradeAfter3m={status:'TP',netRoe5x:100};
}
assert.equal(analyze(changed).selectedId,result.selectedId,'Later outcomes cannot choose train winner');
const btc=FILTERS.find(f=>f.id==='btc_nonnegative');
assert.equal(matches({...data.events[0],btcContext:{ready:false}},btc),false);
const keep=FILTERS.find(f=>f.id==='keep_buy');
const censored={...data.events[0],after3m:{state:'KEEP_HIGH',takerBuyPct:60},pathAfter3m:{complete:false},tradeAfter3m:{status:'TP',netRoe5x:9.3}};
assert.equal(stats([censored],keep).n,0,'Early TP cannot bypass full-window censoring');
const pullback=FILTERS.find(f=>f.id==='pullback_reclaim');
const fixture={...data.events[0],breakout:100,after3m:{forecastEligible:true,retracePct:25,price:99,avwap:98,takerBuyPct:60}};
assert.equal(matches(fixture,pullback),false,'Breakout must be reclaimed');
assert.equal(matches({...fixture,after3m:{...fixture.after3m,price:101}},pullback),true);
assert.equal(result.selectedId,null);
assert.equal(result.candidates.find(c=>c.id==='keep_buy').all.n,9);
console.log('PASS: pre-entry membership, train-only selection, missing data, censoring, reclaim, cached result regression');
