import assert from 'node:assert/strict';
import {evaluateRisingVolume,RisingVolumeMonitor,RISING_VOLUME_VERSION,RISING_VOLUME_FRAMES} from '../src/risingVolume.js';
import {RISING_VOLUME_PATTERN_VERSION,RISING_VOLUME_PATTERNS,classifyRisingVolumePattern,
  risingVolumePatternKey,risingVolumePatternTradeKey,risingVolumePatternProjection} from '../public/rising-volume-model.js';
import {normalizeLiquidLiveCardKey,matchLiquidLiveCardWhitelist} from '../src/liquidLiveCardWhitelist.js';
import {flowTestNow as now,flowRows} from './rising-volume-flow-fixtures.mjs';
const clone=value=>JSON.parse(JSON.stringify(value));
const patternOf=rows=>classifyRisingVolumePattern({observedAt:now,volume1mChart:rows});

const steady=flowRows(),bursty=flowRows({pattern:'BURSTY'});
assert.equal(patternOf(steady).volumePattern,'SUSTAINED');
assert.equal(patternOf(steady).pattern1mElevatedBars,10);
assert.equal(patternOf(steady).pattern1mDropCount,0);
assert.equal(patternOf(flowRows({recent:Array(10).fill(300)})).volumePattern,'SUSTAINED','flat elevated flow is continuous, not staircase');
assert.equal(patternOf(flowRows({recent:[350,400,380,450,430,500,470,520,490,550]})).volumePattern,'SUSTAINED','mild down columns do not break flow');
assert.equal(patternOf(bursty).volumePattern,'BURSTY');assert.equal(patternOf(bursty).pattern1mDropCount,1);
assert.equal(patternOf(flowRows({recent:[1000,20,1000,20,1000,20,1000,20,1000,20]})).volumePattern,'BURSTY');
assert.equal(patternOf(flowRows({recent:[100,100,100,100,100,100,100,100,5000,100]})).volumePattern,'BURSTY');
assert.equal(patternOf(flowRows({pattern:'OTHER'})).volumePattern,'OTHER');
assert.equal(patternOf(flowRows({recent:Array(10).fill(100)})).volumePattern,'OTHER');
assert.equal(patternOf(flowRows({baseline:0})).volumePattern,'UNKNOWN');
assert.equal(patternOf(steady.slice(1)).volumePattern,'UNKNOWN');
assert.equal(classifyRisingVolumePattern({observedAt:now+75000,volume1mChart:steady}).volumePattern,'UNKNOWN');
const badGap=clone(steady);badGap[12].openTime-=60000;badGap[12].closeTime-=60000;
assert.equal(patternOf(badGap).volumePattern,'UNKNOWN');
const missing=clone(steady);missing[25].volume=null;assert.equal(patternOf(missing).volumePattern,'UNKNOWN');
const notClosed=clone(steady);notClosed[25].isClosed=false;assert.equal(patternOf(notClosed).volumePattern,'UNKNOWN');
const future=clone(steady);future.at(-1).openTime+=60000;future.at(-1).closeTime+=60000;
assert.equal(patternOf(future).volumePattern,'UNKNOWN');
const quoteOnly=clone(bursty);quoteOnly.slice(-10).forEach((r,i)=>{r.quoteVolume=(i+1)*1e8;});
assert.equal(patternOf(quoteOnly).volumePattern,'BURSTY','USDT up-ramp cannot hide coin-volume collapse');
assert.equal(classifyRisingVolumePattern({interval:'5m',observedAt:now,chart:flowRows({interval:'5m'})}).volumePattern,'UNKNOWN','never infer 1m continuity from 5m');
for(const rows1m of [null,{},[],steady.slice(1)]) {
  const result=evaluateRisingVolume({symbol:'ONUSDT',interval:'5m',rows:flowRows({interval:'5m'}),rows1m,now});
  assert.equal(result.status,'SIGNAL','missing/bad 1m cache does not block the base signal');
  assert.equal(result.signal.volumePattern,'UNKNOWN');
}

for(const interval of Object.keys(RISING_VOLUME_FRAMES))for(const side of ['LONG','SHORT'])for(const pattern of RISING_VOLUME_PATTERNS) {
  const minute=flowRows({side,pattern}),rows=interval==='1m'?minute:flowRows({interval,side});
  const signal=evaluateRisingVolume({symbol:'ONUSDT',interval,rows,rows1m:minute,now}).signal;
  assert(signal,'flow split does not remove base detector candidates');assert.equal(signal.volumePattern,pattern);
  assert.equal(signal.volume1mChart.length,30);assert.equal(signal.volumePatternVersion,RISING_VOLUME_PATTERN_VERSION);
  const key=risingVolumePatternKey(pattern),trade={side,openedAt:now,risingVolumeSnapshot:signal};
  assert.equal(normalizeLiquidLiveCardKey(key),key);assert.equal(risingVolumePatternTradeKey(trade),key);
  assert.equal(matchLiquidLiveCardWhitelist(trade,[]).allowed,false);assert.equal(matchLiquidLiveCardWhitelist(trade,[key]).allowed,true);
  assert.equal(risingVolumePatternTradeKey({...trade,openedAt:now-1}),null);
  assert.equal(risingVolumePatternTradeKey({...trade,risingVolumeSnapshot:{...signal,volumePattern:'UNKNOWN'}}),null);
  assert.equal(risingVolumePatternTradeKey({...trade,risingVolumeSnapshot:{...signal,volumePatternVersion:'RISING_VOLUME_PATTERN_V1_FIVE_CLOSED_COLUMNS_20261008'}}),null);
  assert.equal(risingVolumePatternTradeKey({...trade,risingVolumeSnapshot:{...signal,volumePatternSource:'FROZEN_CHART_LEGACY'}}),null);
}
assert.equal(normalizeLiquidLiveCardKey('rising-volume:flow-1m:UNKNOWN'),null);

// Freeze 1m data at first observation; later volume type is live-only.
let minute=steady;
const monitor=new RisingVolumeMonitor({now:()=>now,getRows:(_,interval)=>interval==='1m'?minute:flowRows({interval})});
await monitor.scan({symbols:['ONUSDT']});const frozen=clone(monitor.state.history);
minute=bursty;await monitor.scan({symbols:['ONUSDT']});
assert.equal(monitor.state.history.length,3);assert.deepEqual(monitor.state.history,frozen);
assert.equal(monitor.snapshot({pattern:'BURSTY'}).total,3);
assert.equal(monitor.snapshot({view:'history',pattern:'SUSTAINED'}).total,3);
assert.equal(monitor.snapshot({view:'history',pattern:'BURSTY'}).total,0);
for(const card of monitor.snapshot().patterns){assert.equal(card.closedCount,0);assert.equal(card.closedAvgRoe,null);assert.equal(card.whitelistDefault,false);}

// Existing V1 five-column labels survive on disk but cannot be recycled into
// new 1m cohorts. No current-cache backfill or history overwrite is allowed.
const old=clone(monitor.state);
for(const row of old.history){delete row.snapshot.volume1mChart;row.snapshot.volumePatternVersion='RISING_VOLUME_PATTERN_V1_FIVE_CLOSED_COLUMNS_20261008';row.snapshot.volumePattern='CONTINUOUS';}
const before=clone(old);
const legacy=new RisingVolumeMonitor({now:()=>now,storage:{load:async()=>old,save:async()=>{throw new Error('do not write legacy projection');}}});
await legacy.init();assert.equal(legacy.snapshot({view:'history',pattern:'UNKNOWN'}).total,3);
assert.deepEqual(legacy.state.history,before.history);assert.deepEqual(old,before);
const projected=legacy.snapshot({view:'history'}).rows[0];
assert.equal(risingVolumePatternTradeKey({side:projected.side,openedAt:now,risingVolumeSnapshot:projected}),null);
const legacyFull={...frozen[0].snapshot,volumePatternVersion:'OLD',volumePatternSource:undefined};
const projection=risingVolumePatternProjection(legacyFull);
assert.equal(projection.volumePattern,'SUSTAINED');assert.equal(projection.volumePatternSource,'FROZEN_CHART_LEGACY');
assert.equal(risingVolumePatternTradeKey({side:legacyFull.side,openedAt:now,risingVolumeSnapshot:{...legacyFull,...projection}}),null);
assert.equal(legacy.state.version,RISING_VOLUME_VERSION,'history schema remains compatible');
console.log('1m flow passed: sustained/flat/mild-dip vs peak-low interruption, OTHER/UNKNOWN, all LONG/SHORT/frame cohorts, frozen 30x1m before entry, legacy 5m/15m cannot infer 1m, versioned default-OFF whitelist, no Binance IO.');
