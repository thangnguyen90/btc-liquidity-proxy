import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {forecastLiquidationRisk} from '../src/btcLiquidationForecast.js';
import {contextInputs,BtcLiquidationContext} from '../src/btcLiquidationContext.js';
import {BTC_LIQUIDATION_CONTEXT_V2_VERSION} from '../public/btc-liquidation-context-model.js';
import {BTC_LIQUIDATION_FORECAST_VERSION as VERSION,BTC_LIQUIDATION_FORECAST_LEGACY_VERSION as LEGACY_VERSION,btcLiquidationForecastKey,btcLiquidationForecastTradeKey} from '../public/btc-liquidation-forecast-model.js';
import {normalizeLiquidLiveCardKey,liquidLiveCardKeysOfTrade,matchLiquidLiveCardWhitelist} from '../src/liquidLiveCardWhitelist.js';
import {isBinanceCardAvgRoeEligible} from '../public/binance-card-visibility.js';

const now=Date.parse('2026-10-13T02:00:00Z'),MIN=60_000,BAR=5*MIN;
const base={ready:true,closedAt:now-1,price15mPct:0,price5mPct:0,takerBuy15m:.5,
  account:{value:1.3,p20:1.2,p80:1.4,at:now-1},position:{value:1.3,p20:1.2,p80:1.4,at:now-1},
  oi:{change15mPct:0,change30mPct:0,buildBefore15mPct:0,at:now-1},
  forecastData:{ready:true,volumeRatio15m:1,support30m:82000,resistance30m:83000,breakSupport:false,breakResistance:false}};
const find=(m,side,at=now)=>forecastLiquidationRisk(m,at).sides.find(s=>s.side===side);
assert.equal(find(base,'LONG').tier,'MONITOR');assert.equal(find(base,'SHORT').tier,'MONITOR');
const long={...base,price15mPct:-.2,takerBuy15m:.4,account:{...base.account,value:1.5},
  forecastData:{...base.forecastData,volumeRatio15m:1.5}};
assert.equal(find(long,'LONG').tier,'EARLY','zero liquidation data is required for early warning');
assert.equal(find(long,'SHORT').tier,'MONITOR');
const short={...long,price15mPct:.2,takerBuy15m:.6,account:{value:.7,p20:.8,p80:1.4}};
assert.equal(find(short,'SHORT').tier,'EARLY');assert.equal(find(short,'LONG').tier,'MONITOR');
const build={...base,account:{...base.account,value:1.5},oi:{...base.oi,change30mPct:.4}};
assert.equal(find(build,'LONG').tier,'WATCH','crowding + accumulation before price drop');
assert.equal(find({...long,forecastData:{...long.forecastData,volumeRatio15m:1.29}},'LONG').tier,'WATCH');
assert.equal(find({...long,takerBuy15m:.46},'LONG').tier,'WATCH');
assert.equal(find({...long,oi:{...base.oi,change15mPct:-.31}},'LONG').tier,'WATCH','deleveraging is not an EARLY forecast');
assert.equal(find({...long,account:base.account},'LONG').tier,'MONITOR','flow alone is not enough');
assert.equal(find({...long,account:base.account,oi:{...base.oi,buildBefore15mPct:.3}},'LONG').tier,'EARLY','prior build can remain when latest OI flat');
assert.equal(find({...long,price15mPct:0,forecastData:{...long.forecastData,breakSupport:true}},'LONG').tier,'EARLY');
const actualShort={...base,price15mPct:.36625884,price5mPct:-.21115,takerBuy15m:.5989098,
  account:{...base.account,value:1.4697,p80:1.4832},position:{...base.position,value:1.5661,p80:1.6108},
  oi:{...base.oi,change15mPct:-.631075,change30mPct:-.681455,buildBefore15mPct:-.05679},
  forecastData:{...base.forecastData,volumeRatio15m:3.46307}};
assert.equal(find(actualShort,'SHORT').tier,'UNWINDING','actual 10:44 snapshot no longer MONITOR');
assert.equal(find(actualShort,'LONG').tier,'MONITOR','one red 5m bar does not flip the 15m squeeze direction');
const actualLong={...actualShort,price15mPct:-.36625884,takerBuy15m:.4010902};
assert.equal(find(actualLong,'LONG').tier,'UNWINDING');
assert.equal(find({...actualShort,oi:{...actualShort.oi,change15mPct:0}},'SHORT').tier,'MONITOR','price increase alone not unwind');
assert.equal(find({...actualShort,forecastData:{...actualShort.forecastData,volumeRatio15m:1.29}},'SHORT').tier,'MONITOR');
assert.equal(find({...actualShort,takerBuy15m:.54},'SHORT').tier,'MONITOR');
assert.equal(find({...actualShort,price15mPct:.29},'SHORT').tier,'MONITOR');
for(const bad of [{...long,ready:false,errors:['stale']},{...long,closedAt:now+1},
  {...long,closedAt:now-8*MIN},{...long,forecastData:null},{...long,oi:{...base.oi,change30mPct:null}},
  {...long,account:null},{...long,forecastData:{...long.forecastData,volumeRatio15m:NaN}}]) {
  assert.equal(forecastLiquidationRisk(bad,now).ready,false);
  assert.equal(find(bad,'LONG').tier,'WAIT_DATA','missing/stale/future never looks safe');
}
const raw={candles:Array.from({length:40},(_,i)=>({openTime:now-(40-i)*BAR,closeTime:now-(39-i)*BAR-1,
  open:100,close:100,high:101,low:99,quoteVolume:i>=37?2000:1000,takerBuyQuoteVolume:i>=37?800:500})),
  accounts:Array.from({length:40},(_,i)=>({timestamp:now-(39-i)*BAR,longShortRatio:i===39?1.5:1.3})),
  positions:Array.from({length:40},(_,i)=>({timestamp:now-(39-i)*BAR,longShortRatio:1.3})),
  interests:Array.from({length:12},(_,i)=>({timestamp:now-(11-i)*BAR,sumOpenInterest:10000+i*10}))};
const m=contextInputs(raw,now);
assert.equal(m.forecastData.ready,true);assert.equal(m.forecastData.volumeRatio15m,2);
assert.equal(m.forecastData.volume15mUsd,6000);assert.equal(m.forecastData.support30m,99);
assert.ok(m.oi.change30mPct>0);assert.ok(m.oi.buildBefore15mPct>0);
const future=structuredClone(raw);future.candles.push({...raw.candles.at(-1),closeTime:now+BAR-1,quoteVolume:1e12});
assert.deepEqual(contextInputs(future,now).forecastData,m.forecastData,'future bars never change baseline');
const gap=structuredClone(raw);gap.interests.splice(-3,1);
assert.equal(forecastLiquidationRisk(contextInputs(gap,now),now).ready,false);
const monitor=new BtcLiquidationContext({now:()=>now});monitor.inputs=long;monitor.fetchedAt=now;
assert.equal(monitor.snapshot().state,'WAIT_DATA','liquidation stream not ready');
assert.equal(monitor.snapshot().forecast.sides[0].tier,'EARLY','forecast independent from 35m stream warmup');
const count=monitor.forecastHistory.length;monitor.snapshot();assert.equal(monitor.forecastHistory.length,count,'dedupe poll');
monitor.error='refresh failed';assert.equal(monitor.snapshot().forecast.ready,true,'reuse complete fresh snapshot, not partial series');
assert.ok(monitor.snapshot().forecast.refreshWarning);monitor.error=null;
monitor.fetchedAt=now-91_000;assert.equal(monitor.snapshot().forecast.ready,false,'expired cache never forecasts');
monitor.fetchedAt=now;
monitor.inputs={...long,ready:false};assert.equal(monitor.snapshot().forecast.ready,false);
const dir=await mkdtemp(join(tmpdir(),'btc-early-risk-')),file=join(dir,'v2.json');
await writeFile(file,JSON.stringify({version:BTC_LIQUIDATION_CONTEXT_V2_VERSION,
  history:[{at:now-1,state:'LONG_SPIKE'}],lastEpisode:{at:now-1,side:'LONG',peak:9e6}}));
const old=new BtcLiquidationContext({file,now:()=>now});await old.load();
assert.equal(old.history[0].version,BTC_LIQUIDATION_CONTEXT_V2_VERSION);assert.equal(old.lastEpisode.historicalOnly,true);
assert.equal(old.risk,null);assert.deepEqual(old.forecastHistory,[],'no backfill early signals');
old.snapshot();await old.pendingSave;assert.ok(JSON.parse(await readFile(file,'utf8')).forecastHistory);
for(const side of ['LONG','SHORT'])for(const tier of ['WATCH','EARLY','UNWINDING']) {
  const key=btcLiquidationForecastKey(side,tier);assert.equal(normalizeLiquidLiveCardKey(key),key);
  const trade={entryAt:now,btcLiquidationForecastAtEntry:{version:VERSION,source:'AT_ENTRY',ready:true,side,tier,evaluatedAt:now-1}};
  assert.equal(btcLiquidationForecastTradeKey(trade),key);assert.ok(liquidLiveCardKeysOfTrade(trade).includes(key));
  assert.equal(matchLiquidLiveCardWhitelist(trade,[]).allowed,false);
  assert.equal(matchLiquidLiveCardWhitelist(trade,[key]).allowed,true);
  assert.equal(btcLiquidationForecastTradeKey({...trade,entryAt:now-1000}),null);
  assert.equal(btcLiquidationForecastTradeKey({...trade,entryAt:now+MIN}),null);
  assert.equal(btcLiquidationForecastTradeKey({...trade,btcLiquidationForecastAtEntry:{...trade.btcLiquidationForecastAtEntry,source:'VIEW_ONLY'}}),null);
}
const legacyProof={entryAt:now,btcLiquidationForecastAtEntry:{version:LEGACY_VERSION,source:'AT_ENTRY',ready:true,side:'SHORT',tier:'EARLY',evaluatedAt:now-1}};
assert.equal(btcLiquidationForecastTradeKey(legacyProof),'btc-liquidation-forecast:SHORT:EARLY');
assert.equal(btcLiquidationForecastTradeKey({...legacyProof,btcLiquidationForecastAtEntry:{...legacyProof.btcLiquidationForecastAtEntry,tier:'UNWINDING'}}),null,'no retroactive V1 unwinding label');
assert.equal(btcLiquidationForecastTradeKey({}),null);assert.equal(normalizeLiquidLiveCardKey('btc-liquidation-forecast:LONG:MONITOR'),null);
for(const roe of [null,0,4])assert.equal(isBinanceCardAvgRoeEligible(roe),false);assert.equal(isBinanceCardAvgRoeEligible(4.01),true);
console.log('PASS early risk: no-liquidation LONG/SHORT, closed causal volume/OI, thresholds, stale/legacy, independent warmup, history, whitelist OFF. Not a backtest.');
