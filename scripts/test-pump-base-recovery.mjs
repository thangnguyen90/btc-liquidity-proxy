import assert from 'node:assert/strict';
import { analyzePumpBase, aggregatePumpRows, closedPumpRows, PumpBaseScanner, PumpBaseWarmup } from '../src/pumpBaseRecovery.js';
import { PUMP_BASE_VERSION, PUMP_BASE_FRAMES, PUMP_BASE_STAGES, pumpBaseCardKey } from '../public/pump-base-recovery-model.js';
import { normalizeLiquidLiveCardKey, liquidLiveCardKeysOfTrade, matchLiveCardWhitelistKeys } from '../src/liquidLiveCardWhitelist.js';
import { isBinanceCardAvgRoeEligible } from '../public/binance-card-visibility.js';
const start = Date.UTC(2026, 0, 1);
function fixture(interval) {
  const ms = PUMP_BASE_FRAMES[interval];
  const c = (i, o=100, h=100.2, l=99.8, close=100.1, v=100) => ({ openTime:start+i*ms, closeTime:start+(i+1)*ms-1, open:o, high:h, low:l, close, volume:v });
  const rows = Array.from({length:24}, (_,i)=>c(i));
  rows.push(c(24,100,103,99.9,101,300), c(25,101,101.1,99.8,100,90), c(26,100,100.3,99.9,100.2,120), c(27,100.2,100.6,100.1,100.5,150), c(28,100.5,101,100.4,100.9,200));
  return { rows, now:start+29*ms+10, c, ms };
}
for (const interval of Object.keys(PUMP_BASE_FRAMES)) {
  const {rows, now, c, ms} = fixture(interval);
  const evaluate = (r=rows, t=now) => analyzePumpBase('TESTUSDT',r,interval,t);
  assert.equal(evaluate().cases.length,1);
  const r = evaluate().cases[0];
  assert.equal(r.stage,'VOLUME_RECOVERY'); assert.equal(r.sweptBelow,true);
  assert.equal(r.pumpOpen,100); assert.equal(r.pumpHigh,103); assert.equal(r.retestAt,rows[25].closeTime);
  assert.equal(r.watchOnly,true); assert.equal(r.binanceEligible,false);
  assert.equal(evaluate(rows.slice(0,26),start+26*ms+10).cases[0].stage,'AT_BASE');
  assert.equal(evaluate(rows.slice(0,27),start+27*ms+10).cases[0].stage,'RECOVERING');
  const volumeDown = structuredClone(rows); volumeDown[27].volume=90;
  assert.equal(evaluate(volumeDown).cases[0].stage,'RECOVERING');
  const lost = [...rows,c(29,100.9,101,99,99.2,250)];
  assert.equal(evaluate(lost,now+ms).cases[0].stage,'WEAKENED');
  const noRetest = structuredClone(rows); noRetest[25].low=100.5; noRetest[25].close=100.6; noRetest[26].low=100.5; noRetest[26].open=100.6; noRetest[26].high=100.9; noRetest[26].close=100.8; noRetest[27].low=100.5; noRetest[27].open=100.5;
  assert.equal(evaluate(noRetest).cases.length,0);
  const weakPump = structuredClone(rows); weakPump[24].volume=100;
  assert.equal(evaluate(weakPump).cases.length,0);
  const future = c(29,100,110,80,105,10000);
  assert.deepEqual(evaluate([...rows,future]),evaluate());
  const missing = rows.filter((_,i)=>i!==26);
  assert.equal(evaluate(missing).reason,'DATA_GAP');
  assert.equal(evaluate(rows,now+2*ms+90000).reason,'STALE_DATA');
  assert.equal(evaluate(rows.slice(0,10)).reason,'INSUFFICIENT_DATA');
  assert.deepEqual(closedPumpRows([...rows,rows[0]],interval,now),rows);
  assert.equal(evaluate([...rows,...Array.from({length:97},(_,i)=>c(29+i))],now+97*ms).cases.length,0);
  for (const stage of Object.keys(PUMP_BASE_STAGES)) {
    const key = pumpBaseCardKey(interval,stage);
    assert.equal(normalizeLiquidLiveCardKey(key),key);
    const keys=liquidLiveCardKeysOfTrade({side:'LONG',pumpBaseObservation:{version:PUMP_BASE_VERSION,interval,stage}});
    assert(keys.includes(key)); assert(!matchLiveCardWhitelistKeys(keys,[]).allowed);
    assert(matchLiveCardWhitelistKeys(keys,[key]).allowed);
    assert(!liquidLiveCardKeysOfTrade({side:'SHORT',pumpBaseObservation:{version:PUMP_BASE_VERSION,interval,stage}}).includes(key));
  }
}
assert.equal(pumpBaseCardKey('3m','RECOVERING'),null);
assert.equal(normalizeLiquidLiveCardKey('pump-base:1d:FAKE'),null);
assert(!liquidLiveCardKeysOfTrade({side:'LONG'}).some(k=>k.startsWith('pump-base:')));
assert(!isBinanceCardAvgRoeEligible(null)); assert(!isBinanceCardAvgRoeEligible(4)); assert(isBinanceCardAvgRoeEligible(4.01));
const f = fixture('5m');
const agg = aggregatePumpRows(f.rows,'5m','15m',f.now);
assert.equal(agg.length,9); assert.equal(agg[0].volume,300);
assert.equal(aggregatePumpRows(f.rows.filter((_,i)=>i!==1),'5m','15m',f.now).length,8);
assert.deepEqual(aggregatePumpRows([...f.rows,f.rows[0]],'5m','15m',f.now),agg);
const h = fixture('4h');
assert.equal(aggregatePumpRows(h.rows,'4h','1d',h.now).length,4);
let calls=0, now=f.now;
const scanner = new PumpBaseScanner({ getSymbols:()=>['TESTUSDT','TESTUSDT','EMPTYUSDT'], getRows:(s,tf)=>{calls++;return s==='TESTUSDT'&&tf==='5m'?f.rows:[];}, now:()=>now });
const [s1,s2]=await Promise.all([scanner.snapshot('5m'),scanner.snapshot('5m')]);
assert.equal(s1,s2); assert.equal(s1.covered,1); assert.equal(s1.totalSymbols,2); assert.equal(s1.totalCases,1); assert.equal(s1.counts.VOLUME_RECOVERY,1);
const priorCalls=calls; await scanner.snapshot('5m'); assert.equal(calls,priorCalls);
await assert.rejects(()=>scanner.snapshot('bad'));
const seeded=[]; let blocked=false;
const warm=new PumpBaseWarmup({scanner,seed:async(...args)=>seeded.push(args),blocked:()=>blocked,now:()=>now});
await warm.tick();assert.equal(seeded.length,0);
warm.touch('1d');blocked=true;await warm.tick();assert.equal(seeded.length,0);assert.equal(warm.status,'PAUSED_RATE_GATE');
blocked=false;await warm.tick();assert.equal(seeded.length,1);
await warm.tick();assert.equal(seeded.length,1);
now+=16000;await warm.tick();assert.equal(seeded.length,2); // Different coin, not retrying the first.
now+=100000;await warm.tick();assert.equal(seeded.length,2);assert.equal(warm.status,'IDLE');
console.log('Pump base recovery: 5 timeframes, causal stages, aggregation, coverage, warmup and whitelist passed');
