import assert from 'node:assert/strict';
import {buildPumpSupport} from '../src/pumpBaseSupport.js';
import {PUMP_SUPPORT_VERSION, SUPPORT_LABELS, livePumpSupport, pumpSupportKey, supportNetRR} from '../public/pump-support-model.js';
import {PUMP_BASE_FRAMES} from '../public/pump-base-recovery-model.js';
import {normalizeLiquidLiveCardKey,liquidLiveCardKeysOfTrade,matchLiveCardWhitelistKeys} from '../src/liquidLiveCardWhitelist.js';
import {isBinanceCardAvgRoeEligible} from '../public/binance-card-visibility.js';
for(const [interval,duration] of Object.entries(PUMP_BASE_FRAMES)) {
  const start=Date.UTC(2026,0,1);
  const c=(i,open,high,low,close,volume)=>({openTime:start+i*duration,closeTime:start+(i+1)*duration-1,open,high,low,close,volume});
  const rows=Array.from({length:20},(_,i)=>c(i,100,100.2,99.8,100.1,100));
  rows.push(c(20,100,103,99.9,101,500),c(21,101,101.1,99.8,100,90),c(22,100,100.3,99.9,100.1,100),c(23,100.1,101.2,100,100.7,200),c(24,100.7,100.75,100.05,100.12,90),c(25,100.12,100.18,99.98,100.14,70),c(26,100.14,100.3,100.1,100.25,140));
  const now=rows.at(-1).closeTime+10, options={pumpIndex:20,retestIndex:21,atr:.4,duration,now};
  const p=buildPumpSupport(rows,options);
  assert.equal(p.type,'FOOT'); assert.equal(p.status,'WAIT_LIVE'); assert.equal(p.entry,100.25);
  assert.equal(p.target,101.2); assert(p.rr>=1.5); assert(p.entryLow<=p.entryHigh);
  const tick={markPrice:p.entry,eventAt:now}; const opts={now,snapshotAt:now};
  assert.equal(livePumpSupport(p,tick,opts).status,'READY');
  assert.equal(livePumpSupport(p,null,opts).status,'WAIT_LIVE');
  assert.equal(livePumpSupport(p,{...tick,eventAt:now-16000},opts).status,'WAIT_LIVE');
  assert.equal(livePumpSupport(p,{...tick,eventAt:now+3000},opts).status,'WAIT_LIVE');
  assert.equal(livePumpSupport(p,tick,{...opts,snapshotAt:now-91000}).status,'STALE');
  assert.equal(livePumpSupport(p,tick,{now:p.expiresAt+1,snapshotAt:p.expiresAt}).status,'STALE');
  assert.equal(livePumpSupport(p,tick,{...opts,invalidated:true}).status,'BROKEN');
  assert.equal(livePumpSupport(p,{...tick,markPrice:p.stop},opts).status,'BROKEN');
  assert.equal(livePumpSupport(p,{...tick,markPrice:p.entryHigh+.01},opts).status,'WAIT_RETEST');
  assert.equal(livePumpSupport(p,{...tick,markPrice:p.entryLow-.01},opts).status,'WAIT_RETEST');
  assert.equal(livePumpSupport({version:'old'},tick,opts).status,'NO_SUPPORT');
  const highVol=structuredClone(rows);highVol[25].volume=250;
  assert(!buildPumpSupport(highVol,options).confirmedAt);
  const noBreak=structuredClone(rows);noBreak[26].close=100.17;
  assert(!buildPumpSupport(noBreak,options).confirmedAt);
  const noWick=structuredClone(rows);noWick[25].low=100.12;
  assert(!buildPumpSupport(noWick,options).confirmedAt);
  const nearTarget=structuredClone(rows);nearTarget[21].high=100.71;nearTarget[23].high=100.8;
  assert.equal(buildPumpSupport(nearTarget,options).status,'NO_ROOM');
  const broken=[...rows,c(27,100.25,100.4,99.7,100.3,120)];
  assert.equal(buildPumpSupport(broken,{...options,now:now+duration}).status,'BROKEN');
  const expired=[...rows,...Array.from({length:3},(_,i)=>c(27+i,100.3,100.4,100.25,100.3,100))];
  assert(!buildPumpSupport(expired,{...options,now:now+3*duration}).confirmedAt);
  // No pivot from after entry is allowed to change that entry's chosen target.
  const later=[...rows,c(27,100.25,100.5,100.24,100.3,100)];
  assert.equal(buildPumpSupport(later,{...options,now:now+duration}).target,p.target);
  for(const status of Object.keys(SUPPORT_LABELS)) {
    const key=pumpSupportKey(interval,status);
    assert.equal(normalizeLiquidLiveCardKey(key),key);
    const trade={side:'LONG',pumpSupportObservation:{version:PUMP_SUPPORT_VERSION,interval,status}};
    const keys=liquidLiveCardKeysOfTrade(trade);assert(keys.includes(key));
    assert(!matchLiveCardWhitelistKeys(keys,[]).allowed);assert(matchLiveCardWhitelistKeys(keys,[key]).allowed);
    assert(!liquidLiveCardKeysOfTrade({...trade,side:'SHORT'}).includes(key));
    assert(!liquidLiveCardKeysOfTrade({...trade,pumpSupportObservation:{interval,status}}).includes(key));
  }
}
assert(!isBinanceCardAvgRoeEligible(null));assert(!isBinanceCardAvgRoeEligible(4));assert(isBinanceCardAvgRoeEligible(4.1));
assert.equal(supportNetRR(100,101,110),null);
assert.equal(pumpSupportKey('1m','READY'),null);
assert.equal(normalizeLiquidLiveCardKey('pump-support:1d:FAKE'),null);
console.log('Pump support: five frames, causal retest, volume, resistance, live invalidation/expiry, RR and whitelist passed');
