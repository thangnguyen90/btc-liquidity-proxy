import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateRisingVolume,RisingVolumeMonitor,RISING_VOLUME_VERSION,RISING_VOLUME_FRAMES} from '../src/risingVolume.js';
import {risingVolumeKey,risingVolumeTradeKey} from '../public/rising-volume-model.js';
import {normalizeLiquidLiveCardKey,matchLiquidLiveCardWhitelist,matchLiveCardWhitelistKeys,liquidLiveCardKeysOfTrade} from '../src/liquidLiveCardWhitelist.js';
import {isBinanceCardAvgRoeEligible} from '../public/binance-card-visibility.js';
const now=Date.UTC(2026,9,8,6,0,5);

function fixture({interval='1m',side='LONG',volumes=null}={}) {
  const duration=RISING_VOLUME_FRAMES[interval],end=Math.floor(now/duration)*duration;
  let close=100;
  return Array.from({length:28},(_,i)=>{
    const open=close;close=i<23?100:close*(side==='LONG'?1.004:.996);
    const v=volumes?.[i]??(i<23?100:[150,180,210,240,280][i-23]);
    return {openTime:end-(28-i)*duration,closeTime:end-(27-i)*duration-1,isClosed:true,
      open,close,high:Math.max(open,close)+.1,low:Math.min(open,close)-.1,
      volume:v,quoteVolume:v*close,takerBuyQuoteVolume:v*close*(side==='LONG'?.7:.3)};
  });
}
const longRows=fixture(),shortRows=fixture({side:'SHORT'});
for(const interval of Object.keys(RISING_VOLUME_FRAMES))for(const side of ['LONG','SHORT']) {
  const evaluated=evaluateRisingVolume({symbol:'ONUSDT',interval,rows:fixture({interval,side}),now});
  assert.equal(evaluated.status,'SIGNAL');assert.equal(evaluated.signal.side,side);
  assert.equal(evaluated.signal.key,risingVolumeKey(interval,side));
  assert.equal(evaluated.signal.observeOnly,true);assert.equal(evaluated.signal.volumeRatio,2.12);
  assert.equal(evaluated.signal.baselineMean,100);assert.equal(evaluated.signal.risingSteps,3);
  assert.equal(evaluated.signal.aboveBaseline,5);assert.equal(evaluated.signal.chart.length,28);
  assert.equal(evaluated.signal.volumePattern,'UNKNOWN','28 bars in signal frame do not supply 30 closed 1m bars');
  assert.equal(evaluated.signal.volumePatternSource,'AT_DETECTION');
}
const input={symbol:'ONUSDT',interval:'1m',rows:longRows,now};
const original=evaluateRisingVolume(input).signal;
const copy=rows=>JSON.parse(JSON.stringify(rows));
assert.equal(evaluateRisingVolume({...input,rows:longRows.slice(1)}).status,'INSUFFICIENT');
assert.equal(evaluateRisingVolume({...input,now:now+75_000}).status,'STALE');
assert.equal(evaluateRisingVolume({...input,interval:'1h'}).status,'INVALID');
let altered=copy(longRows);altered[13].openTime-=60_000;altered[13].closeTime-=60_000;
assert.equal(evaluateRisingVolume({...input,rows:altered}).status,'GAP');
altered=copy(longRows);altered[10].volume=-1;
assert.equal(evaluateRisingVolume({...input,rows:altered}).status,'INVALID');
altered=copy(longRows);delete altered[10].quoteVolume;
assert.equal(evaluateRisingVolume({...input,rows:altered}).status,'INVALID');
altered=copy(longRows);for(const r of altered)r.volume=100;
assert.equal(evaluateRisingVolume({...input,rows:altered}).status,'NO_SIGNAL');
altered=copy(longRows);for(let i=0;i<27;i++)altered[i].volume=100;altered[27].volume=10000;
assert.equal(evaluateRisingVolume({...input,rows:altered}).status,'NO_SIGNAL','single spike is not gradual volume');
altered=copy(longRows);for(const r of altered){r.open=r.close=100;r.high=100.1;r.low=99.9;}
assert.equal(evaluateRisingVolume({...input,rows:altered}).status,'NO_SIGNAL','volume alone is not LONG/SHORT');
altered=copy(longRows);for(let i=3;i<23;i++)altered[i].volume=0;
assert.equal(evaluateRisingVolume({...input,rows:altered}).status,'NO_BASELINE');
// Dips in individual columns can still qualify when the volume MA keeps rising.
const dipping=fixture({volumes:Array.from({length:28},(_,i)=>i<23?100:[200,180,210,240,280][i-23])});
assert.equal(evaluateRisingVolume({...input,rows:dipping}).status,'SIGNAL');
const plateau=fixture({volumes:Array.from({length:28},(_,i)=>i<23?100:[180,180,210,240,280][i-23])});
const plateauSignal=evaluateRisingVolume({...input,rows:plateau}).signal;
assert(plateauSignal,'base detector remains unchanged');
altered=copy(longRows);delete altered[27].takerBuyQuoteVolume;
assert.equal(evaluateRisingVolume({...input,rows:altered}).signal.takerBuyPct,null,'taker info is not a gate');
const future={...longRows.at(-1),openTime:now+60_000,closeTime:now+120_000,volume:1e10,close:9000,isClosed:true};
assert.deepEqual(evaluateRisingVolume({...input,rows:[...longRows,future]}).signal,original,'no future candle leakage');
const open={...future,isClosed:false};
assert.deepEqual(evaluateRisingVolume({...input,rows:[...longRows,open]}).signal,original);
assert.equal(evaluateRisingVolume({...input,symbol:'龙虾USDT'}).status,'SIGNAL');

// Durable episodes: one frozen observation, no refresh/restart duplicate or
// mutation of original snapshots as the next closed candle arrives.
let saved=null,saves=0,clock=now,current=longRows;
const storage={load:async()=>saved,save:async v=>{saved=copy(v);saves++;}};
const getRows=(symbol,interval)=>interval==='1m'?current:[];
let monitor=new RisingVolumeMonitor({storage,getRows,now:()=>clock});
await monitor.scan({symbols:['ONUSDT','ONUSDT','bad<script>USDT']});
assert.equal(monitor.state.history.length,1);assert.equal(saves,1);
const frozen=copy(monitor.state.history[0]);
await monitor.scan({symbols:['ONUSDT']});assert.equal(saves,1,'refresh is idempotent');
monitor=new RisingVolumeMonitor({storage,getRows,now:()=>clock});
await monitor.scan({symbols:['ONUSDT']});assert.equal(monitor.state.history.length,1);assert.equal(saves,1,'restart is idempotent');
const last=longRows.at(-1);clock+=60_000;
current=[...longRows.slice(1),{...last,openTime:last.openTime+60_000,closeTime:last.closeTime+60_000,
  open:last.close,close:last.close*1.004,high:last.close*1.004+.1,low:last.close-.1,
  volume:350,quoteVolume:350*last.close*1.004,takerBuyQuoteVolume:200*last.close}];
await monitor.scan({symbols:['ONUSDT']});assert.deepEqual(monitor.state.history[0],frozen);
assert.equal(monitor.state.history.length,1);assert.equal(monitor.live[0].closedAt,last.closeTime+60_000);
const historyResult=monitor.snapshot({view:'history',search:'on',side:'LONG',interval:'1m'});
assert.equal(historyResult.total,1);assert.equal(historyResult.rows[0].price,frozen.snapshot.price);
assert.equal(monitor.snapshot({side:'SHORT'}).total,0);
assert.equal(monitor.snapshot({id:frozen.id}).detail.id,frozen.id);
assert.equal(monitor.snapshot({offset:Infinity}).offset,0);
const staleClock=clock+90_000;
await monitor.scan({symbols:['ONUSDT'],now:staleClock});assert.equal(monitor.live.length,0);
assert.equal(monitor.coverage['1m'].STALE,1);assert.equal(monitor.state.history.length,1);
clock=now;current=shortRows;
await monitor.scan({symbols:['ONUSDT']});assert.equal(monitor.state.history.length,2);
assert.equal(monitor.live[0].side,'SHORT');
assert.deepEqual(monitor.state.history[0],frozen);
assert.equal(monitor.snapshot().cohorts.length,6);
for(const c of monitor.snapshot().cohorts){assert.equal(c.closedAvgRoe,null);assert.equal(c.closedCount,0);assert.equal(c.whitelistDefault,false);}
const corrupt=new RisingVolumeMonitor({storage:{load:async()=>({version:'WRONG',history:[]}),save:async()=>{throw new Error('must not overwrite');}}});
await assert.rejects(corrupt.init(),/schema/);
const legacy=new RisingVolumeMonitor({storage:{load:async()=>null,save:async()=>{}},getRows});
await legacy.init();assert.equal(legacy.state.history.length,0);
const retained=new RisingVolumeMonitor({storage,getRows,now:()=>now+15*86400_000});await retained.init();
assert.equal(retained.state.history.length,0,'bounded retention');
let writeAttempts=0,recovered=null;
const retrying=new RisingVolumeMonitor({now:()=>now,getRows:(_,frame)=>frame==='1m'?longRows:[],
  storage:{load:async()=>null,save:async state=>{if(++writeAttempts===1)throw new Error('disk temporarily unavailable');recovered=copy(state);}}});
await assert.rejects(retrying.scan({symbols:['ONUSDT']}),/disk temporarily/);
assert.equal(retrying.dirty,true);
await retrying.scan({symbols:['ONUSDT']});
assert.equal(retrying.dirty,false);assert.equal(writeAttempts,2);
assert.equal(recovered.history.length,1,'failed save is retried even without a new candle');

// Exact six UI/runtime keys, default OFF, closed-only eligibility and no legacy
// backfilling from today's symbol/price. Whitelist alone is not an order route.
for(const interval of Object.keys(RISING_VOLUME_FRAMES))for(const side of ['LONG','SHORT']) {
  const key=risingVolumeKey(interval,side);
  assert.equal(normalizeLiquidLiveCardKey(key),key);
  assert.equal(matchLiveCardWhitelistKeys([key],[]).allowed,false);
  const snapshot={...original,interval,side};
  const trade={side,openedAt:new Date(now).toISOString(),risingVolumeSnapshot:snapshot};
  assert.equal(risingVolumeTradeKey(trade),key);
  assert.equal(matchLiquidLiveCardWhitelist(trade,[key]).allowed,true);
  assert.equal(matchLiquidLiveCardWhitelist(trade,[]).allowed,false);
  assert.equal(risingVolumeTradeKey({...trade,openedAt:now-1}),null);
  assert.equal(risingVolumeTradeKey({...trade,side:side==='LONG'?'SHORT':'LONG'}),null);
  assert.equal(risingVolumeTradeKey({...trade,risingVolumeSnapshot:{...snapshot,version:'OLD'}}),null);
}
assert.equal(normalizeLiquidLiveCardKey('rising-volume:1h:LONG'),null);
assert.equal(normalizeLiquidLiveCardKey('rising-volume:1m:NEUTRAL'),null);
assert.equal(liquidLiveCardKeysOfTrade({side:'LONG',symbol:'ONUSDT'}).some(k=>k.startsWith('rising-volume:')),false);
assert.equal(normalizeLiquidLiveCardKey('rising-volume:pattern:UNKNOWN'),null);
assert.equal(normalizeLiquidLiveCardKey('rising-volume:pattern:CONTINUOUS:EXTRA'),null);
for(const value of [null,0,3.9,4,NaN])assert.equal(isBinanceCardAvgRoeEligible(value),false);
assert.equal(isBinanceCardAvgRoeEligible(4.01),true);

const html=await readFile(new URL('../public/rising-volume-watch.html',import.meta.url),'utf8');
const ui=await readFile(new URL('../public/rising-volume-watch.js',import.meta.url),'utf8');
const source=await readFile(new URL('../src/risingVolume.js',import.meta.url),'utf8');
const server=await readFile(new URL('../src/server.js',import.meta.url),'utf8');
assert.match(html,/OBSERVE ONLY/);assert.match(html,/data-live-card-status="rising-volume"/);
assert.match(ui,/risingVolumeKey\(c.interval,c.side\)/);assert.match(ui,/c.closedCount>0\?c.closedAvgRoe:null/);
assert.match(ui,/risingVolumePatternKey\(c.pattern\)/);assert.match(html,/id="pattern"/);
assert.match(ui,/FROZEN_CHART_LEGACY/);assert.match(server,/options.pattern/);
assert.match(ui,/page:'rising-volume'/);assert.match(ui,/readout.textContent=bar.dataset.readout/);
assert.match(ui,/readout.hidden=true/);assert.match(ui,/escapeHtml\(row.symbol\)/);
assert.doesNotMatch(source,/placeOrder|placeAlgoOrder|cancelOrder|submitMarket|sendPayload/);
assert.match(server,/pathname === '\/rising-volume-watch'/);
assert.match(server,/pathname === '\/api\/rising-volume' && request.method === 'GET'/);
assert.match(server,/subscribeGroup\('rising-volume-observe'/);
assert.match(server,/requested<6/);assert.match(server,/subscribe: false/);
assert.match(server,/rising-volume-history.json/);
await import('./test-rising-volume-flow.mjs');
console.log('Rising volume base passed: 6 direction/frame cohorts, closed/fresh/continuous data, frozen history/restart/save retry, unchanged detector/entries, default-OFF whitelist; observe-only, no order IO.');
