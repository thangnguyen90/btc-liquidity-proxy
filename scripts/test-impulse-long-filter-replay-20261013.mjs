import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {POST_MOVE_IMPULSE_LEGACY_SIZING_VERSION as SIZING} from '../src/postMoveImpulseSizing.js';
import {cohort,evaluate,folds,selfTest,stats} from './backtest-impulse-long-filters-20261013.mjs';
selfTest();
const fill={symbol:'TESTUSDT',direction:'LONG',signalSource:'post-move-impulse',signalLabel:'POST_DUMP_NO_SELL_BUY_IMPULSE_LONG',
  entryReason:`test | observedAt=2026-10-01T01:59:59.999Z | sizing=${SIZING} | margin=5 | sizeReason=BTC_ALIGNED | btcAt=1790819999999 | btc15m=0.2 | btc1h=0.1 | score=45`,
  positionStatus:'CLOSED',filledAt:'2026-10-01T02:00:05Z',closedAt:'2026-10-01T03:00:00Z',
  closeGroupId:'test',orderId:1,marginUsdt:5,filledNotionalUsdt:25,leverage:5,isDca:false,netRealizedPnlUsdt:1};
const raw=(...a)=>({fills:Object.fromEntries(a.map((record,i)=>[i,{record}]))});
assert.equal(cohort(raw(fill)).rows.length,1);
assert.equal(cohort(raw({...fill,isDca:true})).rows.length,0);
assert.equal(cohort(raw({...fill,filledNotionalUsdt:250})).rows.length,0);
assert.equal(cohort(raw({...fill,entryReason:fill.entryReason.replace('margin=5','margin=1')})).rows.length,0);
assert.equal(cohort(raw({...fill,entryReason:fill.entryReason.replace('2026-10-01T01:59:59.999Z','2026-10-01T02:01:00Z')})).excluded.missingOrFutureProof,1);
assert.equal(cohort(raw({...fill,entryReason:fill.entryReason.replace('1790819999999','1999999999999')})).rows.length,0);
assert.equal(cohort(raw({...fill,entryReason:'legacy without proof'})).rows.length,0);
assert.equal(cohort(raw({...fill,closedAt:'2026-09-01T00:00:00Z'})).rows.length,0);
assert.equal(cohort(raw({...fill,positionStatus:'OPEN'})).excluded.notClosed,1);
assert.equal(cohort(raw(fill,{...fill,orderId:2,isDca:true})).excluded.mixedOrInconsistent,1);
assert.equal(cohort(raw(fill,{...fill,orderId:2})).excluded.multiOpening,1);
assert.equal(folds([{day:'2026-10-08',closedAt:Date.parse('2026-10-08T23:59:59+07:00')}]).train.length,1);
assert.equal(folds([{day:'2026-10-09',closedAt:0}]).validation.length,1);
assert.equal(folds([{day:'2026-10-13',closedAt:0}]).stress.length,1);
const saved=JSON.parse(await readFile('data/research/impulse-long-filter-input-20261013.json','utf8'));
assert.equal(saved.rows.length,419);assert.equal(new Set(saved.rows.map(r=>r.id)).size,419);
for(const margin of [1,5]){
  const rows=saved.rows.filter(r=>r.margin===margin),result=evaluate(rows);
  for(const metric of result.results)for(const key of ['train','validation','stress']){
    const base=result.results[0][key],keep=metric[key];
    assert.equal(keep.positions+keep.removed.positions,base.positions);
    assert.equal(keep.wins+keep.removed.wins,base.wins);
    assert.equal(keep.losses+keep.removed.losses,base.losses);
    assert(Math.abs(keep.net+keep.removed.net-base.net)<1e-8);
  }
  assert(Math.abs(result.results[0].all.net-stats(rows).net)<1e-8);
}
const withoutCandles=evaluate(saved.rows,true);assert.equal(withoutCandles.coverage,0);
assert.equal(withoutCandles.selectedByTrain,null);
const enriched=JSON.parse(await readFile('data/research/impulse-long-filter-features-20261013.json','utf8'));
const expected=JSON.parse(await readFile('data/research/impulse-long-filter-results-20261013.json','utf8'));
assert.equal(enriched.source,saved.source);assert.equal(enriched.asOf,saved.asOf);
assert.equal(enriched.rows.length,419);
for(const r of enriched.rows){
  assert(r.candle);assert(r.candle.closeAt<=r.signalAt);assert(r.signalAt<=r.entryAt);assert(r.candle.bars>=200);
  if(r.breadth){assert.equal(r.breadth.evaluatedAt,r.btcAt);assert(r.breadth.loggedAt<=r.entryAt);assert(r.entryAt-r.btcAt<=120000);}
}
for(const margin of [1,5]){
  const actual=evaluate(enriched.rows.filter(r=>r.margin===margin),true);
  assert.deepEqual(actual,expected[`size${margin}`]);
  for(const metric of actual.results)for(const key of ['train','validation','stress']){
    const base=actual.results[0][key],keep=metric[key];
    assert.equal(keep.positions+keep.removed.positions,base.positions);
    assert(Math.abs(keep.net+keep.removed.net-base.net)<1e-8);
  }
}
process.stdout.write('IMPULSE_FILTER_REPLAY_TESTS_PASS\n');
