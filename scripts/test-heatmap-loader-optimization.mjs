import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {HeatmapMarketProfiles} from '../src/heatmapMarketProfiles.js';
import {HeatmapRawCache,HEATMAP_FULL_REFRESH_MS} from '../src/heatmapRawCache.js';
import {HeatmapSweepWatch,prepareHeatmapSweepCohort} from '../src/heatmapSweepWatch.js';
import {heatmapRangePlan,normalizeBinanceHeatmapCandles,buildBinanceLocalHeatmap} from '../src/binanceHeatmapModel.js';
const STEP=300000,base=Math.floor(Date.now()/STEP)*STEP;let now=base+10000;
const initial=heatmapRangePlan('24h',now),dir=await mkdtemp(join(tmpdir(),'heatmap-opt-')),requests=[];
const rows=Array.from({length:500},(_,i)=>{const t=initial.from+i*STEP,c=100+i*.005+Math.sin(i/10)*.3;return [t,c,c+.2,c-.2,c,100+i,t+STEP-1,10000+i*17,10,50,5000];});
const oi=rows.map((r,i)=>({timestamp:r[0],sumOpenInterest:1000+i*2+Math.sin(i/3)*8}));let missingAt=null;
const select=(rs,p,timeOf)=>rs.filter(r=>timeOf(r)>=p.startTime&&timeOf(r)<=p.endTime).slice(0,p.limit);
const io={loadKlines:async p=>{requests.push({kind:'price',...p});return select(rows,p,r=>r[0]).filter(r=>r[0]!==missingAt);},
 loadMarkKlines:async p=>{requests.push({kind:'mark',...p});return select(rows,p,r=>r[0]);},loadOi:async p=>{requests.push({kind:'oi',...p});return select(oi,p,r=>r.timestamp);}};
const opts={...io,now:()=>now,cacheDirectory:join(dir,'raw')},loader=new HeatmapMarketProfiles(opts);
function full(symbol){const plan=heatmapRangePlan('24h',now),params={startTime:plan.from,endTime:plan.end-1,limit:499},c=normalizeBinanceHeatmapCandles(select(rows,params,r=>r[0]),plan);
 return {models:[1,3].map(model=>({model,status:'OK',data:buildBinanceLocalHeatmap({query:{symbol,range:'24h'},plan,candles:c,markRows:c,oiRows:select(oi,{...params,limit:500},r=>r.timestamp),model,now})}))};}
function parity(value){const expected=full(value.symbol);for(const m of value.models){const f=expected.models.find(x=>x.model===m.model);assert.equal(m.status,'OK');assert.deepEqual(m.data.profiles,f.data.profiles);
  assert.deepEqual(m.data.candles,f.data.candles.slice(-1).map(c=>({time:c.time,close:c.close})));}
 for(const direction of ['UPPER','LOWER'])assert.deepEqual(prepareHeatmapSweepCohort(value,{price:102,at:now},now,5,direction),prepareHeatmapSweepCohort(expected,{price:102,at:now},now,5,direction));
}
const first=await loader.compare({symbol:'TESTUSDT'});parity(first);assert.equal(requests.length,3);assert.equal(requests[0].limit,499);
await loader.compare({symbol:'TESTUSDT'});assert.equal(requests.length,3);
// Move the exact 36h window; overlap refreshes corrected recent candles/OI.
now+=STEP;rows.find(r=>r[0]===base-STEP)[7]*=1.2;oi.find(r=>r.timestamp===base-STEP).sumOpenInterest+=2;
const incremental=await loader.compare({symbol:'TESTUSDT'});parity(incremental);assert.equal(requests.length,6);assert.equal(requests[3].startTime,base-3*STEP);assert(requests[3].limit<10);
assert.equal(loader.snapshot().incrementalLoads,1);
const restart=new HeatmapMarketProfiles({...opts,loadKlines:()=>{throw Error('must not fetch fresh disk cache');}});
const restored=await restart.cachedBundle({symbol:'TESTUSDT'});parity(restored);assert.equal(restart.snapshot().rawCache.diskHits,1);assert.equal(restart.snapshot().restRequests,0);
// Re-arm local DATA with a new live tick; never restore old active cohorts.
const raw=await loader.rawCache.get('TESTUSDT');for(let i=0;i<10;i++)await loader.rawCache.put({...raw,symbol:`C${i}USDT`});
let callbacks=0;const w=new HeatmapSweepWatch({file:join(dir,'watch.json'),getUniverse:()=>Array.from({length:10},(_,i)=>`C${i}USDT`),now:()=>now,
 loadCachedBundle:q=>restart.cachedBundle(q),loadBundle:()=>{throw Error('cache warmup cannot call REST');},getLive:()=>({price:102,at:now}),onFullSweep:()=>callbacks++});
await w.update({action:'market',enabled:true});await w.warmCache();assert.equal(w.snapshot().coverage.cacheRestored,8);await w.warmCache();assert.equal(w.snapshot().coverage.cacheRestored,8);now+=1000;await w.warmCache();assert.equal(w.snapshot().coverage.cacheRestored,10);
assert.equal(callbacks,0);assert.equal(w.history.length,0);assert(w.watches.every(w=>!w.cohort||w.cohort.armedAt>=now-1000&&w.cohort.armedAt<=now));
now+=2*STEP;assert.equal(await restart.cachedBundle({symbol:'TESTUSDT'}),null,'stale bucket never arms from disk');
missingAt=base+STEP;await assert.rejects(loader.compare({symbol:'TESTUSDT'}),/GAPPED/);assert(loader.forceFull.has('TESTUSDT'));
missingAt=null;now+=1000;const repair=await loader.compare({symbol:'TESTUSDT'});parity(repair);assert.equal(requests.at(-3).limit,499,'gap repair must use full data next bounded attempt');
now+=HEATMAP_FULL_REFRESH_MS;const refreshed=await loader.compare({symbol:'TESTUSDT'});parity(refreshed);assert.equal(requests.at(-3).limit,499,'periodic full REST validation');
await writeFile(join(dir,'raw','BADUSDT.json'),'{invalid');const corrupt=new HeatmapRawCache(join(dir,'raw'));assert.equal(await corrupt.get('BADUSDT'),null);assert.equal(corrupt.snapshot().invalid,1);
await assert.rejects(()=>corrupt.get('../escape'),/INVALID/);
// Inflight bundles are bounded3 with one launch/sec, including duplicate dedupe.
now=base+10000;let release;const gate=new Promise(r=>release=r),held=new HeatmapMarketProfiles({...opts,cacheDirectory:undefined,
 loadKlines:async p=>{await gate;return select(rows,p,r=>r[0]);},loadMarkKlines:async p=>{await gate;return select(rows,p,r=>r[0]);},loadOi:async p=>{await gate;return select(oi,p,r=>r.timestamp);}});
const jobs=[];for(let i=0;i<3;i++){jobs.push(held.compare({symbol:`H${i}USDT`}));await new Promise(r=>setImmediate(r));now+=1000;}
assert.equal(held.snapshot().inFlight,3);await assert.rejects(held.compare({symbol:'OVERUSDT'}),/BUDGET/);const duplicate=held.compare({symbol:'H0USDT'});release();await Promise.all([...jobs,duplicate]);assert.equal(held.snapshot().restRequests,9);
const waiters=[],scan=new HeatmapSweepWatch({file:join(dir,'scan.json'),now:()=>now,getUniverse:()=>['AUSDT','BUSDT','CUSDT','DUSDT'],getLive:()=>({price:102,at:now}),
 loadBundle:q=>new Promise(resolve=>waiters.push(()=>resolve({...first,symbol:q.symbol,models:first.models.map(m=>({...m,data:{...m.data,symbol:q.symbol}}))})))});
await scan.update({action:'market',enabled:true});const tasks=[];for(let i=0;i<3;i++){tasks.push(scan.scan());await new Promise(r=>setImmediate(r));now+=1000;}await scan.scan();assert.equal(waiters.length,3);assert.equal(scan.snapshot().coverage.inFlight,3);waiters.forEach(r=>r());await Promise.all(tasks);
assert.equal(scan.snapshot().coverage.inFlight,0);assert.equal(scan.history.length,0);
console.log('PASS incremental/full chart/profile/cohort parity, recent correction overlap, persistent cold rearm/no replay, stale/corrupt/gap/full refresh guards, cache8 batch, loader+scanner bounded3 and global1/s. Mock only.');
