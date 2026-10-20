import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {cachedZoneKlines,loadZoneKlines,buildZoneDirectionNote,historicalDirectionText} from '../src/liquidityZoneObservation.js';
import {mainDistanceCandidate,mainDistancePlan,MainKillDistanceRunner} from '../src/mainKillDistanceEntry.js';
import {buildZoneNotificationHistory} from '../src/liquidityZoneNotifications.js';
import {LiquidityZoneManager,captureLiquidityZones,buildZonePush} from '../src/liquidityZoneManager.js';
const I=900_000,T=1_800_000_000_000;
let now=T+240*I+1000;
const bar=(openTime,interval,close)=>({openTime,closeTime:openTime+interval-1,open:100,high:110,low:90,close,volume:100});
const cache=Array.from({length:240},(_,i)=>bar(T+i*I,I,100));
assert.deepEqual(cachedZoneKlines(cache,now),cache);
assert.equal(cachedZoneKlines(cache.slice(1),now),null,'239 bars cannot replace the 240-bar REST input');
assert.equal(cachedZoneKlines(cache,now+I+60_000),null,'Stale closed tail rejected');
assert.equal(cachedZoneKlines(cache.map((b,i)=>i===4?{...b,openTime:b.openTime+I}:b),now),null,'Cache gap/duplicate rejected');
assert.equal(cachedZoneKlines(cache.map((b,i)=>i===4?{...b,closeTime:b.closeTime-1}:b),now),null);
assert.equal(cachedZoneKlines(cache.map((b,i)=>i===4?{...b,close:0}:b),now),null);
const future=bar(T+240*I,I,100);
assert.deepEqual(cachedZoneKlines([...cache,future],now),[...cache,future].slice(-240),'Current open candle remains in heatmap input, as with REST');
let rest=0;
await loadZoneKlines({cachedRows:cache,now,restBusy:()=>true,loadRest:async()=>{rest++;return cache;}});
assert.equal(rest,0,'Fresh socket/cache bypasses a congested REST queue');
await assert.rejects(loadZoneKlines({cachedRows:cache.slice(1),now,restBusy:()=>true,loadRest:async()=>{rest++;}}),/tạm hoãn/);
assert.equal(rest,0,'Missing cache does not enqueue background requests during congestion');
assert.equal(await loadZoneKlines({cachedRows:[],now,loadRest:async()=>{rest++;return cache;}}),cache);
assert.equal(rest,1,'Allowed fallback uses the existing REST input');

const pair=(interval,up)=>{
  const end=Math.floor(now/interval)*interval;
  return [bar(end-2*interval,interval,100),bar(end-interval,interval,up?101:99)];
};
const getRows=(symbol,label)=>pair(label==='5m'?300_000:I,symbol!=='BTCUSDT');
const input={symbol:'TESTUSDT',mark:100,zone:{low:103,high:104},getRows,now};
const note=buildZoneDirectionNote(input);
assert.equal(note.target,'UP');assert.equal(note.coin['15m'].direction,'UP');assert.equal(note.btc['15m'].direction,'DOWN');
assert.match(note.text,/BTC 15m ngược hướng/);assert.match(note.text,/không chặn entry/);
const shortNote=buildZoneDirectionNote({...input,zone:{low:95,high:97}});
assert.equal(shortNote.target,'DOWN');assert.match(shortNote.text,/BTC 15m cùng hướng/);
assert.equal(buildZoneDirectionNote({...input,zone:{low:100,high:102}}).target,'INSIDE');
const noData=buildZoneDirectionNote({...input,getRows:()=>[]});assert.match(noData.text,/chưa đủ dữ liệu/);
assert.equal(buildZoneDirectionNote({...input,getRows:()=>pair(I,true).map(b=>({...b,isClosed:false}))}).coin['15m'].direction,'UNKNOWN');
assert.equal(buildZoneDirectionNote({...input,getRows:()=>pair(I,true).map(b=>({...b,openTime:b.openTime-I*10,closeTime:b.closeTime-I*10}))}).coin['15m'].direction,'UNKNOWN');
assert.equal(buildZoneDirectionNote({...input,getRows:()=>[pair(I,true)[0],{...pair(I,true)[1],close:0}]}).coin['15m'].direction,'UNKNOWN');
assert.equal(buildZoneDirectionNote({...input,getRows:()=>[pair(I,true)[0],bar(Math.floor(now/I)*I,I,500)]}).coin['15m'].direction,'UNKNOWN','Open/future candle cannot supply confirmation');
assert.match(historicalDirectionText(),/Thông báo cũ/);

const watch={id:'watch',symbol:'TESTUSDT',role:'MAIN_KILL',enabled:true,status:'ACTIVE',seen:{ACTIVE:true},
  direction:'UPPER',zone:input.zone,markPrice:100,priceAt:now,lastClosedAt:now-1000,socketFresh:true};
const candidate=mainDistanceCandidate(watch,now),plan=mainDistancePlan(candidate,now);
for(const directionNote of [note,noData,shortNote]){
  assert.deepEqual(mainDistanceCandidate({...watch,directionNote},now),candidate);
  assert.deepEqual(mainDistancePlan({...candidate,directionNote},now),plan,'Direction note cannot change plan/side/size/SL/TP');
}
const dir=await mkdtemp(join(tmpdir(),'zone-note-'));
try{
  let submitted=0;const pushes=[];
  const options={file:join(dir,'runner.json'),now:()=>now,getWatches:async()=>[watch],getDirectionNote:()=>note,
    getContext:async()=>({enabled:true,markPrice:100,positions:[],openOrders:[]}),isProtectionExcluded:()=>false,
    controls:{register:()=>({key:'r'}),read:()=>({enabled:true,routes:{r:{enabled:true,enabledAt:'fixed'}}}),assertEntry:()=>{}},
    submit:async p=>{assert.deepEqual(p,plan);submitted++;return {status:'SUBMITTED',orderResult:{orderId:123}};},
    pushSender:async p=>{pushes.push(p);return {sent:1};}};
  const runner=new MainKillDistanceRunner(options);await runner.tick();
  assert.equal(submitted,1,'Opposing BTC does not gate the current entry');assert.match(pushes[0].body,/BTC 15m ngược hướng/);
  assert.deepEqual(Object.values(runner.state.attempts)[0].directionNote,note,'Freeze note before submission');
  await new MainKillDistanceRunner({...options,getDirectionNote:()=>shortNote}).tick();
  assert.equal(submitted,1);assert.equal(pushes.length,1,'Restart/new direction does not replay an existing attempt');
  const restored=buildZoneNotificationHistory({attempts:Object.values(runner.state.attempts),now});
  assert.match(restored[0].body,/BTC 15m ngược hướng/);
  assert.match(buildZoneNotificationHistory({attempts:[{...Object.values(runner.state.attempts)[0],directionNote:undefined}],now})[0].body,/Thông báo cũ/);
  await new MainKillDistanceRunner({...options,file:join(dir,'note-failed.json'),getDirectionNote:()=>{throw Error('cache missing');}}).tick();
  assert.equal(submitted,2,'Observation callback failure cannot block entry');assert.match(pushes.at(-1).body,/chưa đủ dữ liệu/);

  // Fast bounded retries rotate fairly; old bounds/stops and history guards are not altered.
  const tracker=new LiquidityZoneManager({stateFile:join(dir,'refresh.json'),now:()=>now});
  const analysis={generatedAt:new Date(now).toISOString(),market:{markPrice:100},liqScan:{current:{dominantSide:'ABOVE',mainKillZone:input.zone}}};
  await tracker.add('TESTUSDT',captureLiquidityZones(analysis,now));const old=tracker.snapshot().watches[0];
  now+=900_001;let loads=0;
  await tracker.refreshBatch(async()=>{loads++;throw Error('REST busy');});
  assert.equal(loads,1);assert.equal(tracker.snapshot().refreshState.TESTUSDT.failures,1);
  now+=59_000;await tracker.refreshBatch(async()=>{loads++;return analysis;});assert.equal(loads,1,'No immediate retry loop');
  now+=1000;await tracker.refreshBatch(async()=>{loads++;return {...analysis,generatedAt:new Date(now).toISOString()};});
  assert.equal(loads,2,'Retry after 60s, not 15min');assert.equal(tracker.snapshot().refreshState.TESTUSDT.error,null);
  assert.equal(tracker.snapshot().refreshState.TESTUSDT.failures,0);assert.equal(tracker.snapshot().watches[0].id,old.id);
  now+=60_000;await tracker.refreshBatch(async()=>{loads++;return analysis;});assert.equal(loads,2,'Success retains 15min refresh interval');
  const server=await readFile(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(server,/loadZoneKlines\(\{cachedRows:klineCache.getIfCached\(symbol,'15m',240\)/);
  assert.match(server,/analyzeRateGate.queue.length>=20/);
  const lifecycle=new LiquidityZoneManager({stateFile:join(dir,'events.json'),now:()=>now,
    getDirectionNote:input=>buildZoneDirectionNote({...input,getRows})});
  await lifecycle.add('TESTUSDT',captureLiquidityZones({...analysis,generatedAt:new Date(now).toISOString()},now));
  const tracked=lifecycle.snapshot().watches[0];
  lifecycle.record(lifecycle.state.watches[0],'TOUCHING',103.5,now);
  const event=lifecycle.snapshot().events[0],eventText=buildZonePush(event).body;
  assert.equal(event.directionNote.observedAt,now);assert.equal(event.directionNote.target,'INSIDE');
  assert.match(eventText,/Coin 5m/);assert.match(eventText,/BTC 5m/);
  now+=I*10;assert.equal(buildZonePush(event).body,eventText,'Lifecycle Push must use frozen event note, not current market');
  assert.equal(lifecycle.snapshot().watches[0].id,tracked.id);
  console.log('Zone observations/cache-first: fresh 240bars, bounded REST, closed-only/no-lookahead notes, frozen history, no entry changes/replay, fail-open observation, bounded retry OK');
}finally{await rm(dir,{recursive:true,force:true});}
