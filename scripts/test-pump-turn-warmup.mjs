import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PumpTurnWarmup,PUMP_TURN_WARMUP_POLICY as policy} from '../src/pumpTurnWarmup.js';
import {PumpTurnWatch} from '../src/pumpTurnWatch.js';
import {KlineCache} from '../src/klineCache.js';
import {BinanceRateGate} from '../src/binanceRateGate.js';
import {closedPumpRows,plannedPumpZones,STEP,PUMP_TURN_VERSION} from '../public/pump-turn-model.js';

let now=Date.UTC(2026,9,18,14,40,10);
const rows=(length=90,at=now)=>Array.from({length},(_,i)=>{
  const openTime=Math.floor(at/STEP)*STEP-(length-i)*STEP;
  return {openTime,closeTime:openTime+STEP-1,open:100,high:101,low:99,close:100,
    quoteVolume:10000,takerBuyQuoteVolume:5000,volume:100,isClosed:true};
});
const universe=Array.from({length:18},(_,i)=>`C${i}USDT`),loaded=new Set(),calls=[];
const warmer=new PumpTurnWarmup({now:()=>now,getSymbols:()=>[...universe,universe[0],'invalid'],
  getPrioritySymbols:()=>[universe[16],universe[17],universe[15],'NOUSDT'],
  getRows:s=>loaded.has(s)?rows():[],seed:async(s,options)=>{calls.push({s,options});loaded.add(s);}});
await warmer.run();assert.equal(calls.length,6);assert.deepEqual(calls.slice(0,2).map(x=>x.s),universe.slice(16));
assert.deepEqual(calls.slice(2).map(x=>x.s),universe.slice(0,4));
assert(calls.every(x=>x.options.force&&x.options.subscribe===false&&x.options.batchSize===1));
await warmer.run();assert.equal(calls.length,6,'scan plus timer cannot exceed one cycle budget');
now+=policy.intervalMs;await warmer.run();now+=policy.intervalMs;await warmer.run();
assert.equal(loaded.size,18,'hot symbols cannot starve the rotating universe');
now+=policy.intervalMs;await warmer.run();assert.equal(calls.length,18,'ready histories use zero REST');
assert.equal(warmer.snapshot().pending,0);assert.equal(warmer.snapshot().independentOfCoreWarmup,true);

let blocked=true,attempts=0;
const paused=new PumpTurnWarmup({now:()=>now,getSymbols:()=>universe,blocked:()=>blocked,
  seed:async()=>{attempts++;blocked=true;}});
await paused.run();assert.equal(attempts,0);assert.equal(paused.snapshot().deferredReason,'REST_BLOCKED_OR_CONGESTED');
blocked=false;await paused.run();assert.equal(attempts,1,'new REST congestion stops mid batch');
let failedCalls=0;
const fail=new PumpTurnWarmup({now:()=>now,getSymbols:()=>['FAILUSDT'],seed:async()=>{failedCalls++;throw Error('secret');}});
await fail.run();for(let i=0;i<5;i++){now+=10000;await fail.run();}assert.equal(failedCalls,1);
now+=10000;await fail.run();assert.equal(failedCalls,2);assert.equal(fail.snapshot().failed,2);
assert.doesNotMatch(JSON.stringify(fail.snapshot()),/secret/);
// KlineCache.seed deliberately swallows REST errors: success MUST be verified
// against the detector, not inferred from a resolved seed promise/cache length.
const swallowed=new PumpTurnWarmup({now:()=>now,getSymbols:()=>['FAILUSDT'],seed:async()=>{}});
await swallowed.run();assert.equal(swallowed.snapshot().refreshed,0);assert.equal(swallowed.snapshot().failed,1);
let release,overlaps=0;
const busy=new PumpTurnWarmup({now:()=>now,getSymbols:()=>['BUSYUSDT'],seed:async()=>{overlaps++;await new Promise(r=>release=r);}});
const first=busy.run();await busy.run();assert.equal(overlaps,1);release();await first;
busy.start();const timer=busy.timer;busy.start();assert.equal(busy.timer,timer);busy.stop();

const metadata=[],cache=new KlineCache({now:()=>now,client:{getKlines:async(_s,interval,limit,meta)=>{
  assert.equal(interval,'5m');assert.equal(limit,90);metadata.push(meta);return rows(limit).map(({isClosed,...r})=>r);}}});
const bad=rows(100).filter((_,i)=>i!==82);cache._cache.set('GAPUSDT|5m',bad);
const repair=new PumpTurnWarmup({now:()=>now,getSymbols:()=>['GAPUSDT'],getRows:s=>cache.getIfCached(s,'5m',90),
  seed:(s,opts)=>cache.seed([s],'5m',90,opts)});
assert.equal(repair.snapshot().samples[0].reason,'NON_CONTIGUOUS_CLOSED');
await repair.run();assert.equal(repair.snapshot().ready,1);assert.equal(repair.snapshot().refreshed,1);
assert.equal(metadata[0].priority,6);assert.equal(metadata[0].source,'PumpTurn.repair:5m');
assert.equal(metadata[0].dropOnCongestion,true);assert.equal(cache._conns.size,0);
const unclosed=rows(90);unclosed[80].isClosed=false;cache._cache.set('GAPUSDT|5m',unclosed);
assert.equal(closedPumpRows(unclosed,now).status,'INVALID_OR_GAP','missed final socket candle is NOT invented/marked closed');
now+=60000;await repair.run();assert.equal(repair.snapshot().ready,1,'REST repairs the missing closed candle');
const invalid=rows(90);invalid[80].takerBuyQuoteVolume=20000;cache._cache.set('GAPUSDT|5m',invalid);
assert.equal(repair.snapshot().samples[0].reason,'INVALID_CANDLE');
now+=60000;await repair.run();assert.equal(repair.snapshot().ready,1);
cache._cache.set('GAPUSDT|5m',rows(90,now-2*STEP));now+=60000;await repair.run();assert.equal(repair.snapshot().ready,1);

const gate=new BinanceRateGate({concurrency:1,limitPerMin:1200}),order=[];let unlock;
const keepAlive=setInterval(()=>{},1000);
const held=gate.schedule({priority:0},()=>new Promise(r=>unlock=r));
const bulk=gate.schedule({priority:8},async()=>order.push('bulk'));
const priorityRepair=gate.schedule({priority:6,dropOnCongestion:true},async()=>order.push('repair'));
const account=gate.schedule({priority:1},async()=>order.push('account'));
await new Promise(r=>setTimeout(r,20));
unlock();await Promise.all([held,bulk,priorityRepair,account]);
clearInterval(keepAlive);
assert.deepEqual(order,['account','repair','bulk'],'account/order work precedes bounded repair, which is not starved by bulk reads');
const defaultMeta=[],defaultCache=new KlineCache({client:{getKlines:async(_s,_i,_l,meta)=>{defaultMeta.push(meta);return rows();}}});
await defaultCache.seed(['DEFAULTUSDT'],'5m',90,{subscribe:false});assert.equal(defaultMeta[0].priority,8);
assert.equal(defaultMeta[0].source,'KlineCache.seed:5m','other cache callers keep default QoS/source');

// Reordered/overlapping streams must not leave a real closed candle marked
// open forever. Only an actual x=true event can finalize it; no synthetic bars.
const currentOpen=Math.floor(now/STEP)*STEP,previousOpen=currentOpen-STEP;
const tick=(t,x,c=100)=>({t,T:t+STEP-1,o:'100',h:'101',l:'99',c:String(c),v:'100',q:'10000',Q:'5000',V:'50',n:10,x});
const reordered=new KlineCache({now:()=>now});
const missed=rows(90);missed.at(-1).isClosed=false;reordered._cache.set('LATEUSDT|5m',missed);
reordered._applyTick('LATEUSDT','5m',tick(currentOpen,false));
assert.ok(closedPumpRows(reordered.getIfCached('LATEUSDT','5m',90),now).lastClosedAt<previousOpen+STEP-1,'partial candle is not treated as final');
reordered._applyTick('LATEUSDT','5m',tick(previousOpen,true));
assert.equal(closedPumpRows(reordered.getIfCached('LATEUSDT','5m',90),now).status,'READY');
assert.equal(reordered.getIfCached('LATEUSDT','5m',1)[0].openTime,currentOpen,'late final cannot replace the live tail');
reordered._applyTick('LATEUSDT','5m',tick(previousOpen,false,99.5));
assert.equal(reordered.getIfCached('LATEUSDT','5m',90).at(-2).close,100,'late partial cannot downgrade final');
const beforeMissing=reordered.getIfCached('LATEUSDT','5m',500).length;
reordered._applyTick('LATEUSDT','5m',tick(currentOpen-200*STEP,true));
assert.equal(reordered.getIfCached('LATEUSDT','5m',500).length,beforeMissing,'no insertion of absent historical bar');
const finalTail=new KlineCache();finalTail._applyTick('FINALUSDT','5m',tick(previousOpen,true));
finalTail._applyTick('FINALUSDT','5m',tick(previousOpen,false,99.5));
assert.equal(finalTail.getIfCached('FINALUSDT','5m',1)[0].isClosed,true);
const finalBeforeSeed=rows(90);const originalFinal=structuredClone(finalBeforeSeed.at(-1));
const snapshotRows=rows(90).map(r=>({...r,isClosed:undefined,close:99.5}));
let mergeAt=originalFinal.closeTime-100;
const mergeCache=new KlineCache({now:()=>mergeAt,client:{getKlines:async()=>{
  mergeAt+=1000;mergeCache._applyTick('FINALUSDT','5m',tick(originalFinal.openTime,true));return snapshotRows;
}}});
finalBeforeSeed.at(-1).isClosed=false;
mergeCache._cache.set('FINALUSDT|5m',finalBeforeSeed);
await mergeCache.seed(['FINALUSDT'],'5m',90,{force:true,subscribe:false});
assert.equal(mergeCache.getIfCached('FINALUSDT','5m',1)[0].close,100,'REST requested before close cannot overwrite final socket data');
assert.equal(mergeCache.getIfCached('FINALUSDT','5m',1)[0].isClosed,true);
await mergeCache.seed(['FINALUSDT'],'5m',90,{force:true,subscribe:false});
assert.equal(mergeCache.getIfCached('FINALUSDT','5m',1)[0].close,99.5,'REST requested after close can still repair historical data');

// Repair has its own timer, even when Discord/storage holds the scanner busy.
let subscriptions=0,seeded=0;
const watch=new PumpTurnWatch({file:null,now:()=>now,getSymbols:()=>['QUSDT'],getRows:()=>[],
  subscribe:s=>{assert.deepEqual(s,['QUSDT']);subscriptions++;},seed:async()=>seeded++});
watch.busy=true;watch.start();assert.ok(watch.warmer.timer);await new Promise(r=>setImmediate(r));
assert.equal(seeded,1);assert.equal(subscriptions,1);watch.stop();assert.equal(watch.warmer.timer,null);
assert.equal(watch.timer,null);assert.equal(watch.snapshot().warmup.pending,1);

// A repair can enable only a current live observation. It never posts a closed
// historical signal or replays a persisted event after restart.
const temp=await mkdtemp(join(tmpdir(),'pump-turn-warmup-')),file=join(temp,'history.json');
const complete=rows(90),tail=complete.at(-1);Object.assign(tail,{open:102,close:106,high:107,low:101,quoteVolume:100000,takerBuyQuoteVolume:60000});
const normalized=closedPumpRows(complete,now).rows,plan=plannedPumpZones('QUSDT',normalized)[0];
const event={...plan,id:'pump-turn-near:'+plan.id,observedAt:now-1000,delivery:{status:'SENT'}};
await writeFile(file,JSON.stringify({version:PUMP_TURN_VERSION,settings:{discordEnabled:true,nearPct:.75},history:[event],confirmed:[],lastAlerts:{'QUSDT:LONG':now-1000}}));
let restored=false,sent=0,market=0;
const restoredWatch=new PumpTurnWatch({file,now:()=>now,getSymbols:()=>['QUSDT'],getRows:()=>restored?complete:[],
  seed:async()=>{restored=true;},getLive:()=>({price:plan.zoneLow*.996,at:now}),
  discordSender:async()=>{sent++;return {sent:1};},onNearShort:()=>market++,nearShortEnabled:()=>true});
await restoredWatch.init();await restoredWatch.warmup();await restoredWatch.scan();
assert.equal(restoredWatch.coverage.ready,1);assert.equal(sent,0);assert.equal(market,0);
assert.equal(restoredWatch.history.length,1);assert.equal(restoredWatch.history[0].id,event.id);
assert.equal(JSON.parse(await readFile(file,'utf8')).version,PUMP_TURN_VERSION,'old JSON/history schema retained');

const shortRows=rows(90).map((r,i)=>i<78?r:{...r,open:118,close:118,high:120,low:117});
const shortPlan=plannedPumpZones('NEWUSDT',closedPumpRows(shortRows,now).rows)[1];
let shortLoaded=false,quoteAt=now-31000;const freshEvents=[];
const liveWatch=new PumpTurnWatch({file:null,now:()=>now,getSymbols:()=>['NEWUSDT'],getRows:()=>shortLoaded?shortRows:[],
  seed:async()=>{shortLoaded=true;},getLive:()=>({price:shortPlan.zoneHigh*1.003,at:quoteAt}),
  nearShortEnabled:()=>true,onNearShort:e=>freshEvents.push(e)});
await liveWatch.warmup();await liveWatch.scan();assert.equal(freshEvents.length,0,'repair never substitutes REST data for a fresh socket quote');
now+=1000;quoteAt=now;await liveWatch.scan();await new Promise(r=>setImmediate(r));
assert.equal(freshEvents.length,1,'new live SHORT can reach the existing runner after repair');
assert.equal(freshEvents[0].preRows.length,72);assert.equal(freshEvents[0].side,'SHORT');
await liveWatch.scan();assert.equal(freshEvents.length,1,'repeat scan cannot resend the new event');

const server=await readFile('src/server.js','utf8');
const config=server.slice(server.indexOf('const pumpTurnWatch=new PumpTurnWatch'),server.indexOf('pumpTurnWatch.start();'));
assert.doesNotMatch(config,/klineWarmupReady|_tieredWarmupPromise/);
assert.match(config,/binanceRateGate\.isBlocked/);assert.match(config,/isBinanceRestCongested/);
assert.match(config,/subscribe:symbols=>klineCache.subscribe\(symbols,'5m'\)/);
console.log('PASS independent 5m repair: bounded/fair/retry/blocked/busy, real-cache gap/missed close/invalid/stale, verified seed outcomes, fresh-only/no replay, legacy JSON. Mock only.');
