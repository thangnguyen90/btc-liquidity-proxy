import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LiquidityZoneManager,captureLiquidityZones,equivalentLiquidityZone} from '../src/liquidityZoneManager.js';
import {mainDistanceCandidate} from '../src/mainKillDistanceEntry.js';
const B=300_000,T=1_800_000_000_000;
let now=T+4*B+1000,rows=[],pushes=0;
const dir=await mkdtemp(join(tmpdir(),'zone-recovery-'));
const analysis=(low=105,high=110)=>({generatedAt:new Date(now).toISOString(),market:{markPrice:100},
  liqScan:{current:{dominantSide:'ABOVE',mainKillZone:{low,high},farKillZone:{low:120,high:125}}}});
const candle=(i,high=101,close=100)=>({openTime:T+i*B,closeTime:T+(i+1)*B-1,open:100,high,low:99,close});
const opts=file=>({stateFile:join(dir,file),now:()=>now,getRows:()=>rows,pushSender:async()=>{pushes++;return {sent:1};}});
try{
  const tracker=new LiquidityZoneManager(opts('repair.json'));
  await tracker.add('TESTUSDT',captureLiquidityZones(analysis(),T),true);
  rows=[candle(0),candle(2),candle(3)];await tracker.flush();
  tracker.onMark({symbol:'TESTUSDT',markPrice:100,eventTime:now});
  let main=()=>tracker.snapshot().watches.find(w=>w.role==='MAIN_KILL');
  assert.equal(main().historyIncomplete,true);assert.equal(main().historyVerifiedThrough,T+B-1);
  assert.equal(mainDistanceCandidate(main(),now),null,'An unseen gap blocks real entry despite latest candle freshness');
  let request;
  await tracker.repairBatch(async(symbol,r)=>{request=r;return [candle(1)];});
  assert.equal(request.startTime,T+B,'Backfill starts at earliest unverified candle, not last processed close');
  assert.equal(main().historyIncomplete,false);assert.equal(main().historyVerifiedThrough,T+4*B-1);
  assert.equal(mainDistanceCandidate(main(),now)?.side,'LONG','Clearing needs actual contiguous historical evidence');
  const restart=new LiquidityZoneManager(opts('repair.json'));await restart.initialize();
  assert.equal(restart.snapshot().watches.find(w=>w.role==='MAIN_KILL').historyVerifiedThrough,T+4*B-1);
  assert.equal(restart.snapshot().watches.find(w=>w.role==='MAIN_KILL').historyIncomplete,false);

  rows=[candle(0),candle(2),candle(3)];
  const swept=new LiquidityZoneManager(opts('swept.json'));
  await swept.add('TESTUSDT',captureLiquidityZones(analysis(),T),true);await swept.flush();
  const beforePush=pushes;
  await swept.repairBatch(async()=>[candle(1,112)]);await swept.flush();
  const old=swept.snapshot().watches.find(w=>w.role==='MAIN_KILL');
  assert.equal(old.historyIncomplete,false);assert.equal(old.seen.PRICE_PASSED,true);
  assert.equal(old.seen.REJECTED_AFTER_SWEEP,true);
  assert.equal(mainDistanceCandidate({...old,socketFresh:true,priceAt:now},now),null,'Repair does not revive a swept target');
  assert.equal(pushes,beforePush,'Historical backfill must not push late sweep/reject alerts');
  assert.ok(swept.snapshot().events.every(e=>e.delivery?.skipped==='HISTORICAL_EVENT'));

  const bad=new LiquidityZoneManager(opts('bad.json'));await bad.add('TESTUSDT',captureLiquidityZones(analysis(),T));await bad.flush();
  await bad.repairBatch(async()=>[{...candle(1),high:90}]);
  assert.equal(bad.snapshot().watches[0].historyIncomplete,true,'Invalid OHLC cannot close a gap');
  now+=60_000;await bad.repairBatch(async()=>{throw Error('congestion');});
  assert.equal(bad.snapshot().watches[0].historyIncomplete,true);
  assert.match(bad.snapshot().watches[0].historyRepairError,/congestion/);

  // Legacy sticky flags must rewind verification while preserving all lifecycle evidence.
  const legacyWatch={...old,id:'legacy',seen:{ACTIVE:true},status:'ACTIVE',historyIncomplete:true};
  delete legacyWatch.historyVerifiedThrough;
  await writeFile(join(dir,'legacy.json'),JSON.stringify({watches:[legacyWatch],events:[]}));
  const legacy=new LiquidityZoneManager(opts('legacy.json'));await legacy.initialize();
  assert.equal(legacy.snapshot().watches[0].historyVerifiedThrough,T-1);
  assert.equal(legacy.snapshot().watches[0].lastClosedAt,old.lastClosedAt,'Do not erase old processed timestamps');
  rows=[];await legacy.repairBatch(async()=>[candle(0),candle(1),candle(2),candle(3)]);
  assert.equal(legacy.snapshot().watches[0].historyIncomplete,false);

  // Pagination/cursor progress persists across restart; a recent tail alone cannot prove old gaps.
  now=T+600*B+1000;
  const paged=new LiquidityZoneManager(opts('paged.json'));await paged.add('TESTUSDT',captureLiquidityZones(analysis(),T));
  await paged.flush();await paged.repairBatch(async(_,r)=>Array.from({length:r.limit},(_,i)=>candle((r.startTime-T)/B+i)));
  assert.equal(paged.snapshot().watches[0].historyVerifiedThrough,T+499*B-1);
  assert.equal(paged.snapshot().watches[0].historyIncomplete,true);
  now+=60_000;
  const pageRestart=new LiquidityZoneManager(opts('paged.json'));await pageRestart.initialize();
  await pageRestart.repairBatch(async(_,r)=>{
    assert.equal(r.startTime,T+499*B);
    return Array.from({length:101},(_,i)=>candle(499+i));
  });
  assert.equal(pageRestart.snapshot().watches[0].historyIncomplete,false);

  // Snapshot changes create separate immutable records, not rewritten or revived zones.
  rows=[];now=T+1000;
  const refreshed=new LiquidityZoneManager(opts('refresh.json'));
  await refreshed.add('TESTUSDT',captureLiquidityZones(analysis(),T),true);
  const ids=refreshed.snapshot().watches.map(w=>w.id);
  now+=900_001;
  await refreshed.refreshBatch(async()=>analysis());
  assert.equal(refreshed.snapshot().watches.length,2,'Unchanged snapshot must not create duplicate watches');
  assert.equal(equivalentLiquidityZone({zone:{low:105,high:110},direction:'UPPER'},
    {zone:{low:105.01,high:110.01},direction:'UPPER'}),true,'Small proxy drift is not a new setup');
  now+=900_001;await refreshed.refreshBatch(async()=>analysis(115,118));
  let snap=refreshed.snapshot();
  assert.equal(snap.watches.length,3);assert.equal(snap.watches.filter(w=>w.enabled&&w.role==='MAIN_KILL').length,1);
  assert.deepEqual(snap.watches.find(w=>w.id===ids.find(id=>snap.watches.find(w=>w.id===id).role==='MAIN_KILL')).zone,{low:105,high:110});
  assert.equal(snap.watches.find(w=>w.role==='MAIN_KILL'&&w.enabled).pushEnabled,true,'Inherit explicit Push setting, never globally enable it');
  assert.equal(snap.watches.find(w=>w.role==='MAIN_KILL'&&!w.enabled).retiredReason,'SNAPSHOT_REPLACED');
  const latestMain=snap.watches.find(w=>w.role==='MAIN_KILL'&&w.enabled);
  now+=900_001;await refreshed.refreshBatch(async()=>analysis());
  assert.equal(refreshed.snapshot().watches.length,3,'Returning to previously tracked bounds cannot revive them');
  assert.equal(refreshed.snapshot().watches.find(w=>w.id===latestMain.id).enabled,false);
  assert.equal(refreshed.snapshot().refreshState.TESTUSDT.enabled,true,'Retired roles still permit truly new clusters later');
  now+=900_001;await refreshed.refreshBatch(async()=>analysis(130,135));
  assert.equal(refreshed.snapshot().watches.find(w=>w.role==='MAIN_KILL'&&w.enabled).zone.low,130);
  assert.equal(refreshed.snapshot().watches.find(w=>w.role==='MAIN_KILL'&&w.enabled).pushEnabled,true,'Push preference survives a refresh with no active role');
  const stopMain=refreshed.snapshot().watches.find(w=>w.role==='MAIN_KILL'&&w.enabled);
  await refreshed.update(stopMain.id,{enabled:false});
  now+=900_001;await refreshed.refreshBatch(async()=>analysis(140,145));
  assert.equal(refreshed.snapshot().watches.some(w=>w.role==='MAIN_KILL'&&w.enabled),false,'Manual stop suppresses automatic replacement for that role');
  const stopFar=refreshed.snapshot().watches.find(w=>w.role==='FAR_KILL'&&w.enabled);
  await refreshed.update(stopFar.id,{enabled:false});
  assert.equal(refreshed.snapshot().refreshState.TESTUSDT.enabled,false);
  now+=900_001;let loads=0;await refreshed.refreshBatch(async()=>{loads++;return analysis(150,155);});assert.equal(loads,0);

  const stale=new LiquidityZoneManager(opts('stale-refresh.json'));await stale.add('TESTUSDT',captureLiquidityZones(analysis(),now));
  now+=900_001;await stale.refreshBatch(async()=>({...analysis(150,155),generatedAt:new Date(now-91_000).toISOString()}));
  assert.equal(stale.snapshot().watches.length,2,'Stale source must not replace current snapshots');
  assert.match(stale.snapshot().refreshState.TESTUSDT.error,/mới/);

  const inFlight=new LiquidityZoneManager(opts('inflight-refresh.json'));
  await inFlight.add('TESTUSDT',captureLiquidityZones(analysis(),now),false);
  now+=900_001;
  let releaseLoad,signalStarted;
  const started=new Promise(resolve=>{signalStarted=resolve;});
  const refreshing=inFlight.refreshBatch(()=>new Promise(resolve=>{releaseLoad=resolve;signalStarted();}));
  await started;
  await inFlight.update(inFlight.snapshot().watches.find(w=>w.role==='MAIN_KILL').id,{enabled:false});
  releaseLoad(analysis(155,160));await refreshing;
  assert.equal(inFlight.snapshot().watches.some(w=>w.role==='MAIN_KILL'&&w.enabled),false,'Manual stop during REST discards replacement for stopped role');
  assert.equal(inFlight.snapshot().watches.filter(w=>w.role==='MAIN_KILL').length,1);

  const legacyStopped={watches:[
    {...legacyWatch,id:'main-stopped',role:'MAIN_KILL',enabled:false,historyIncomplete:false},
    {...legacyWatch,id:'far-on',role:'FAR_KILL',enabled:true,historyIncomplete:false}],events:[]};
  await writeFile(join(dir,'legacy-stop.json'),JSON.stringify(legacyStopped));
  const migratedStop=new LiquidityZoneManager(opts('legacy-stop.json'));await migratedStop.initialize();
  assert.deepEqual(migratedStop.snapshot().refreshState.TESTUSDT.stoppedRoles,['MAIN_KILL']);
  await migratedStop.refreshBatch(async()=>analysis(170,175));
  assert.equal(migratedStop.snapshot().watches.some(w=>w.role==='MAIN_KILL'&&w.enabled),false,'Legacy manual stop remains stopped after schema migration');

  const cacheRepair=new LiquidityZoneManager(opts('cache-repair.json'));
  rows=[candle(0),candle(2),candle(3)];now=T+4*B+1000;
  await cacheRepair.add('TESTUSDT',captureLiquidityZones(analysis(),T));await cacheRepair.flush();
  assert.equal(cacheRepair.snapshot().watches[0].historyIncomplete,true);
  rows=[candle(0),candle(1),candle(2),candle(3)];await cacheRepair.flush();
  assert.equal(cacheRepair.snapshot().watches[0].historyIncomplete,false,'A complete repaired WS/REST cache also resolves the gap without extra REST');
  const server=await readFile(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(server,/importBatch\(getLiquidityZoneCaptureAnalysis, 4\)\s*\.then\(\(\)=>liquidityZoneManager.refreshBatch/,
    'Refresh must run after import releases its in-flight flag, not always skip beside it');
  assert.match(server,/liquidityZoneHistoryRepair/);
  const ui=await readFile(new URL('../public/liquidity-zone-manager.js',import.meta.url),'utf8');
  assert.match(ui,/historyVerifiedThrough/);assert.match(ui,/retiredReason==='SNAPSHOT_REPLACED'/);
  console.log('Zone recovery: continuous backfill, historical sweep evidence, pagination/restart, immutable refresh, no revival and manual-stop guards OK');
}finally{await rm(dir,{recursive:true,force:true});}
