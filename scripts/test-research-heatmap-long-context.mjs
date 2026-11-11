import assert from 'node:assert/strict';
import {barsBefore,samplesBefore,featuresFor,selectCohort,stats,summarize} from './research-heatmap-long-context.mjs';
const STEP=300000,at=3000000000+1234;
const end=Math.floor(at/STEP)*STEP;
const bars=Array.from({length:242},(_,i)=>{const t=end+(i-240)*STEP,p=100+i*.01;return [t,p,p+1,p-1,p+.1,100,t+STEP-1,1000,20,50,500];});
const selected=barsBefore(bars,at);assert.equal(selected.length,240);assert.equal(selected.at(-1).time,end-STEP);assert(selected.every(r=>r.end<at));
const future=structuredClone(bars);future.at(-1)[4]=999999;assert.deepEqual(barsBefore(future,at),selected,'future candle cannot repaint features');
const missing=bars.filter((_,i)=>i!==200);assert.equal(barsBefore(missing,at),null,'gap cannot become an EMA/return');
const stale=bars.filter(r=>r[0]<end-STEP);assert.equal(barsBefore(stale,at),null);
const raw=Array.from({length:26},(_,i)=>({timestamp:end+(i-25)*STEP,longShortRatio:2,longAccount:2/3,shortAccount:1/3,sumOpenInterest:100+i}));
const ratio=samplesBefore(raw,at,'longShortRatio');assert.equal(ratio.length,25);assert.equal(ratio.at(-1).timestamp,end-STEP);assert(ratio.every(r=>r.timestamp+STEP<=at));
const changed=structuredClone(raw);changed.at(-1).longShortRatio=1000;assert.deepEqual(samplesBefore(changed,at,'longShortRatio'),ratio,'incomplete ratio period excluded');
assert.equal(samplesBefore(raw.filter((_,i)=>i!==20),at,'longShortRatio'),null);
assert.equal(samplesBefore(raw.map(r=>({...r,longAccount:.4})),at,'longShortRatio'),null);
const event={id:'event',symbol:'TESTUSDT',kind:'ALL_TRACKED_LOWER_SWEPT',direction:'LOWER',at,armedAt:at-10000,referencePrice:100,markPrice:98,zones:[{low:99,high:99.5,overlapStrength:55}]};
const r={symbol:'TESTUSDT',orderId:1,clientOrderId:'hms_test',signalSource:'heatmap-full-sweep',direction:'LONG',heatmapSweepSignalId:'event',heatmapSweepAtEntry:event,
 positionStatus:'CLOSED',netRealizedPnlUsdt:1,realizedRoePct:10,filledAt:new Date(at).toISOString(),closeGroupId:'group',avgFillPrice:98.1};
const f=featuresFor({record:r,coin:bars,btc:bars,ratio:raw,oi:raw});assert.equal(f.armDropPct,2.0000000000000018);assert.equal(f.relative1h,0);assert.equal(f.coin.rsi14,100);assert.equal(f.ratio.change30m,0);assert(f.ratio.assumedAvailableAt<=at);assert(f.coin.lastClosedAt<at);assert(f.oi.change1h>0);
const audit={fills:{one:{record:r},duplicate:{record:r},dca:{record:{...r,orderId:2,clientOrderId:'dca',isDca:true}},other:{record:{...r,orderId:3,clientOrderId:'other',signalSource:'other'}}}};
const cohort=selectCohort(audit,{attempts:{e:{symbol:'TESTUSDT',orderId:1,side:'LONG',id:'event'}}});assert.equal(cohort.included.length,1);assert(cohort.included[0].mixedClose);assert.equal(cohort.excluded.length,2);
const bad=selectCohort({fills:{r:{record:{...r,heatmapSweepAtEntry:null}}}},{attempts:{}});assert.equal(bad.included.length,0);assert.equal(bad.excluded[0].reason,'NO_LOWER_SWEEP_PROOF');
const rs=[{record:{...r,mixedClose:false},features:f},{record:{...r,netRealizedPnlUsdt:-.5,realizedRoePct:-5,mixedClose:false},features:{...f,ratio:null}},
 {record:{...r,positionStatus:'OPEN',netRealizedPnlUsdt:null,mixedClose:false},features:f},{record:{...r,netRealizedPnlUsdt:99,mixedClose:true},features:f}];
assert.equal(stats(rs).closed,3);assert.equal(stats(rs).open,1);
const summary=summarize(rs);assert.equal(summary.clean.closed,2);assert.equal(summary.clean.net,.5);assert.equal(summary.clean.winRate,50);
const candidate=summary.candidates.find(r=>r.id==='RATIO_NOT_SURGING');assert.equal(candidate.pass.closed,1);assert.equal(candidate.fail.closed,0);assert.equal(candidate.missing.closed,1,'missing ratio is neither FAIL nor PASS');
assert.equal(summary.factors.find(f=>f.key==='ratio.value').groups.reduce((s,r)=>s+r.closed,0),2,'bins partition only clean closed cohort');
assert.equal(stats([]).avgRoe,null);assert.equal(stats([]).winRate,null);assert.equal(stats([]).profitFactor,null);
console.log('PASS heatmap long research: closed-only pre-signal candles, ratio/OI one-period lag/gap/account checks, exact ledger/noDCA/dedupe/mixed groups, OPEN exclusion, missing split, bins reconciliation.');
