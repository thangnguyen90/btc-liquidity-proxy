import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BAR_MS, normalizeReviewSignals, normalizeReviewBars, evaluateReviewSignal, btcContextAt, LocalAiSignalReview } from '../src/localAiSignalReview.js';
import { summarizeReviewRows, selectReviewRows } from '../public/ai-signal-review-model.js';

const anchor = BAR_MS * 1000;
const sample = { eventId:'AAAUSDT|LONG|PRIORITY|1', symbol:'AAAUSDT', side:'LONG', verdict:'PRIORITY',
  sentAt: anchor - 30_000, strength: 72, strengthBand:'65_74', price:{entryLow:98,entryHigh:100,entryMid:99} };
const bars = Array.from({length:100},(_,i)=>({time:anchor+i*BAR_MS,open:100,high:103,low:100,close:102}));
bars[1] = { ...bars[1], low:98, close:101 };
const now = anchor + 100*BAR_MS;
const btc = Array.from({length:30},(_,i)=>({time:anchor-(30-i)*BAR_MS,open:100+i,high:102+i,low:99+i,close:101+i}));
const row = evaluateReviewSignal(sample,bars,btc,now);
assert.equal(row.horizons[1].market.entry,100);
assert.equal(row.horizons[1].market.grossPct,2);
assert.equal(row.horizons[1].zone.entry,99);
assert.equal(row.horizons[1].zone.entryAt,anchor+BAR_MS);
assert.equal(row.horizons[1].zone.maePct,0,'touch-candle low must not imply post-entry drawdown');
assert.equal(row.horizons[1].zone.excursionExcludesTouchBar,true);
assert.equal(row.horizons[1].zone.exitAt,row.horizons[1].market.exitAt,'paired methods share the same exit');
assert.equal(row.btcAlignment,'ALIGNED');
assert.equal(row.btcReconstructed.closedAt,anchor-BAR_MS,'the candle containing notification must be excluded');
const short = evaluateReviewSignal({...sample,side:'SHORT'},bars,btc,now);
assert.equal(short.horizons[1].market.grossPct,-2,'linear USDT short PnL uses entry denominator');
assert.equal(short.btcAlignment,'OPPOSED');
const legacy = evaluateReviewSignal({...sample,price:null},bars,btc,now);
assert.equal(legacy.horizons[4].zone.state,'NO_ZONE');
const pending = evaluateReviewSignal(sample,bars,btc,anchor+2*BAR_MS);
assert.equal(pending.horizons[1].market.state,'PENDING');
const gap = evaluateReviewSignal(sample,bars.filter((_,i)=>i!==2),btc,now);
assert.equal(gap.horizons[1].market.state,'MISSING_CANDLES');
const noTouch = evaluateReviewSignal({...sample,price:{entryLow:49,entryHigh:51,entryMid:50}},bars,btc,now);
assert.equal(noTouch.horizons[24].zone.state,'NOT_TOUCHED');
const lateBars=bars.map(bar=>({...bar,low:100})); lateBars[17].low=98;
assert.equal(evaluateReviewSignal(sample,lateBars,btc,now).horizons[24].zone.state,'NOT_TOUCHED','4h entry expiry');
assert.equal(btcContextAt([...btc,{time:anchor-BAR_MS,close:999}],sample.sentAt).price,row.btcReconstructed.price,'ignore future/incomplete candle');
const merged=normalizeReviewSignals([{...sample,historyVersion:'v1'}],[
  {id:sample.eventId,sent:true,sentAt:sample.sentAt,symbol:'AAAUSDT',side:'LONG',sample:{strength:99}},
  {id:'BBBUSDT|SHORT|WATCH|2',sent:true,sentAt:sample.sentAt,symbol:'BBBUSDT',side:'SHORT',strength:99,sample:{strength:99}},
  {id:'UNSENT',sent:false,symbol:'CCCUSDT',side:'LONG',sentAt:sample.sentAt},
]);
assert.equal(merged.length,2);
assert.equal(merged[0].strength,72);
assert.equal(merged[1].strength,null,'mutable legacy sample must not be treated as original score');
const stats=summarizeReviewRows([row,noTouch,legacy,pending,gap],1,0.12);
assert.equal(stats.market.filled,3);
assert.equal(stats.market.pending,1);
assert.equal(stats.market.missing,1);
assert.equal(stats.zone.noZone,1);
assert.equal(stats.zone.missed,1);
assert.equal(stats.zone.pairedCount,1);
assert.ok(Math.abs(stats.market.avgNetPct-1.88)<1e-9);
assert.equal(stats.zone.opportunityNetPct,stats.zone.avgNetPct/2,'missed setups stay in per-opportunity denominator');
assert.equal(selectReviewRows([{...row,independent4h:true},{...row,independent4h:false}],{independent:true}).length,1);
assert.equal(normalizeReviewBars([[anchor,'100','110','90','105']]).length,1);

const directory=await mkdtemp(join(tmpdir(),'ai-review-'));
await writeFile(join(directory,'local-ai-trend-discord.json'),JSON.stringify({records:{a:{id:sample.eventId,symbol:sample.symbol,side:sample.side,sent:true,sentAt:sample.sentAt}}}));
await writeFile(join(directory,'local-ai-trend-discord-history.ndjson'),JSON.stringify(sample)+'\n'+'{broken line\n');
let requests=0;
const service=new LocalAiSignalReview({dataDir:directory,now:()=>now,getCandles:async(symbol,start,end)=>{
  requests++;return [...btc,...bars].filter(row=>row.time>=start&&row.time<=end);
}});
await service.rebuild();
const saved=JSON.parse(await readFile(join(directory,'ai-signal-review','report.json'),'utf8'));
assert.equal(saved.rows.length,1);assert.equal(saved.fullSnapshotCount,1);assert.equal(saved.malformedLines,1);
assert.equal(saved.rows[0].horizons[4].zone.entry,99);
assert.equal((await service.snapshot()).binanceEligible,false);
assert.ok(requests>0);
assert.equal(saved.partial,false);
assert.equal(saved.plannedSignals,1);
const events=Array.from({length:11},(_,i)=>({...sample,eventId:`COIN${i}USDT|LONG|PRIORITY|1`,symbol:`COIN${i}USDT`}));
await writeFile(join(directory,'local-ai-trend-discord-history.ndjson'),events.map(value=>JSON.stringify(value)).join('\n'));
let sawPartial=false;
const incremental=new LocalAiSignalReview({dataDir:directory,now:()=>now,getCandles:async(symbol,start,end)=>{
  if(symbol==='COIN9USDT'){
    const partial=(await incremental.snapshot()).report;
    assert.equal(partial.partial,true);assert.equal(partial.rows.length,10);assert.equal(partial.plannedSignals,12);
    assert.equal(partial.rows.filter(value=>value.independent4h).length,10);
    sawPartial=true;
  }
  return [...btc,...bars].filter(value=>value.time>=start&&value.time<=end);
}});
await incremental.rebuild();
assert.equal(sawPartial,true);
assert.equal((await incremental.snapshot()).report.partial,false);
assert.equal((await incremental.snapshot()).report.rows.length,12);
console.log('AI signal review: causal windows, short PnL, missing snapshots, pairs, dedupe and report persistence OK');
