import assert from 'node:assert/strict';
import {evaluateRisingVolumeRatio,buildRisingVolumeRatioProof,validRisingVolumeRatioProof} from '../src/risingVolumeRatioGate.js';
import {evaluateRisingVolume} from '../src/risingVolume.js';
import {RisingVolumeBinanceRunner,RISING_VOLUME_ROUTES,risingVolumeEntryId} from '../src/risingVolumeBinance.js';
import {entryRoute} from '../src/autoEntryControls.js';
import {flowRows,flowTestNow as now} from './rising-volume-flow-fixtures.mjs';
import {ratioRowsFor,ratioProofFor} from './rising-volume-ratio-fixtures.mjs';
import {risingVolumeDiscordPayload} from '../src/risingVolumeDiscord.js';
const snapshot=evaluateRisingVolume({symbol:'ONUSDT',interval:'1m',rows:flowRows({now}),now}).signal;
const event={id:risingVolumeEntryId(snapshot),snapshot},rows=ratioRowsFor(event),asOf=snapshot.closedAt;
const long=sideRows=>evaluateRisingVolumeRatio(sideRows,{side:'LONG',asOf});
assert.equal(long(rows).pass,true);
assert.equal(evaluateRisingVolumeRatio(rows,{side:'SHORT',asOf}).pass,false);
assert.equal(evaluateRisingVolumeRatio(ratioRowsFor({...event,snapshot:{...snapshot,side:'SHORT'}}),{side:'SHORT',asOf}).pass,true);
assert.equal(long(rows.map(r=>({...r,longShortRatio:2}))).pass,false);
assert.equal(long(rows.map((r,i)=>({...r,longShortRatio:3-i*.055}))).pass,false,'steady trend is not a flat-then-break');
assert.equal(long(rows.slice(-6)).reason,'RATIO_HISTORY_MISSING');
assert.equal(long(rows.slice(0,-1)).reason,'RATIO_STALE');
assert.equal(long([...rows,rows.at(-1)]).reason,'RATIO_DATA_INVALID');
assert.equal(long(rows.map((r,i)=>i===19?{...r,longShortRatio:NaN}:r)).reason,'RATIO_DATA_INVALID');
assert.equal(long(rows.filter((_,i)=>i!==15)).pass,false,'gap inside required plateau fails');
const flat=rows.map(r=>({...r,longShortRatio:2}));
assert.equal(long([...flat,{timestamp:rows.at(-1).timestamp+300000,longShortRatio:1}]).pass,false,'future drop cannot pass');
const proof=ratioProofFor(event,now);
assert.equal(validRisingVolumeRatioProof(event,proof,now),true);
for(const change of [{version:'OLD'},{source:'CHART'},{symbol:'CKBUSDT'},{side:'SHORT'},{period:'15m'},
  {signalId:'forged'},{asOf:asOf+1},{fetchedAt:now+1},{fetchedAt:snapshot.observedAt-1},{widthPct:0},
  {changePct:-99},{pass:false},{rows:[...proof.rows,{timestamp:rows.at(-1).timestamp+300000,longShortRatio:1}]}])
  assert.equal(validRisingVolumeRatioProof(event,{...proof,...change},now),false);
assert.equal(validRisingVolumeRatioProof(event,proof,now+20001),false);
const boundary=flat.map((r,i)=>({...r,longShortRatio:i===19?1.8:2}));
assert.equal(long(boundary).pass,true,'10% boundary inclusive');
const shifted=rows.map((r,i)=>({...r,longShortRatio:i>=13?1.7:2}));
assert.equal(long(shifted).pass,false,'drop more than 30m ago cannot borrow an old flat base');
let accountReads=0,sends=0;
const setting={enabled:true,enabledAt:new Date(now-20000).toISOString()};
const controls={read:()=>({enabled:true,routes:Object.fromEntries(RISING_VOLUME_ROUTES.map(r=>[entryRoute(r).key,setting]))}),assertEntry(){}};
const make=getRatioRows=>new RisingVolumeBinanceRunner({controls,getRatioRows,now:()=>now,startedAt:now-20000,
  storage:{load:async()=>null,save:async()=>{}},getContext:async()=>{accountReads++;return {enabled:true,positions:[],openOrders:[],markPrice:snapshot.price};},
  submit:async()=>{sends++;return {status:'SUBMITTED'};}});
for(const [provider,status] of [[async()=>flat,'RATIO_NO_FLAT_THEN_BREAK'],[async()=>[],'RATIO_STALE'],
  [async()=>{throw Error('public API failed');},'RATIO_UNAVAILABLE']]) {
  const runner=make(provider);assert.equal((await runner.process(event)).status,status);
  assert.equal(accountReads,0);assert.equal(sends,0);
  assert.equal((await runner.process(event)).status,'deduped');
  const payload=risingVolumeDiscordPayload(event,runner.managementSnapshot().attempts[0]);
  assert.match(JSON.stringify(payload),/CHỈ DISCORD|KHÔNG VÀO/);
}
const runner=make(async()=>rows);assert.equal((await runner.process(event)).status,'SUBMITTED');
assert.equal(accountReads,1);assert.equal(sends,1);
assert(runner.state.attempts[event.id].plan.risingVolumeRatioProof.pass);
console.log('Volume ratio gate PASS: account5m flat30/width5/break10/window30, causal/fresh/gap/direction/proof binding, no account IO or MARKET for misses, Discord preserved. Mock only.');
