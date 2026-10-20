import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BtcLiquidationContext, classifyLiquidationContext, contextInputs } from '../src/btcLiquidationContext.js';
import { BTC_LIQUIDATION_CONTEXT_VERSION as VERSION, btcLiquidationKey, btcLiquidationTradeKey,
  BTC_LIQUIDATION_STATES, BTC_LIQUIDATION_CONTEXT_LEGACY_VERSION as LEGACY_VERSION } from '../public/btc-liquidation-context-model.js';
import { normalizeLiquidLiveCardKey, liquidLiveCardKeysOfTrade, matchLiquidLiveCardWhitelist } from '../src/liquidLiveCardWhitelist.js';
import { isBinanceCardAvgRoeEligible } from '../public/binance-card-visibility.js';

const MIN = 60_000, BAR = 5 * MIN;
let now = Date.parse('2026-10-09T06:00:00Z');
const breadth = { dataReady:true, evaluatedAt:now, metrics:{ context15m:'DOWN' } };
const data = {
  candles: Array.from({length:40}, (_,i) => ({ openTime:now-(40-i)*BAR, closeTime:now-(39-i)*BAR-1,
    open:100, close:100, low:99, high:101, quoteVolume:1000, takerBuyQuoteVolume:400 })),
  accounts:Array.from({length:288}, (_,i) => ({timestamp:now-(287-i)*BAR, longShortRatio:1.5+i*.001})),
  positions:Array.from({length:288}, (_,i) => ({timestamp:now-(287-i)*BAR, longShortRatio:1.3})),
  interests:Array.from({length:12}, (_,i) => ({timestamp:now-(11-i)*BAR, sumOpenInterest:10000})),
};
const m = contextInputs(data, now);
assert.equal(m.ready, true);
assert.equal(m.account.samples, 288);
assert.equal(m.takerBuy15m, .4);
const future = structuredClone(data); future.candles.push({ ...data.candles.at(-1), closeTime:now+BAR-1, close:100000 });
assert.equal(contextInputs(future, now).price, 100, 'never use open/future candle');
for (const key of ['candles','accounts','positions','interests']) {
  const bad=structuredClone(data); bad[key].splice(-2,1);
  assert.equal(contextInputs(bad, now).ready,false, `${key} gap`);
}
assert.equal(contextInputs(data, now+8*MIN).ready,false);
const bad=structuredClone(data);bad.accounts.at(-1).longShortRatio=null;
assert.equal(contextInputs(bad,now).ready,false);
const liq = {ready:true, errors:[], long5m:9e6, short5m:1e5, longShare:.9, longBurst:4, shortBurst:1};
const sell = {...m, price15mPct:-.6, price5mPct:-.2, oi:{...m.oi,change15mPct:-.5}};
const cascade=classifyLiquidationContext(sell,liq,breadth,null,now);
assert.equal(cascade.state,'LONG_CASCADE');
const buy={...sell,price15mPct:.6,price5mPct:.2,takerBuy15m:.65};
const shortLiq={...liq,long5m:1e5,short5m:9e6,longShare:.1,longBurst:1,shortBurst:4};
assert.equal(classifyLiquidationContext(buy,shortLiq,{},null,now).state,'SHORT_CASCADE');
assert.equal(classifyLiquidationContext(sell,{...liq,ready:false},breadth,null,now).state,'WAIT_DATA');
assert.equal(classifyLiquidationContext(sell,{...liq,long5m:10},breadth,null,now).state,'NEUTRAL');
assert.equal(classifyLiquidationContext({...sell,oi:{...m.oi,change15mPct:.2}},liq,breadth,null,now).state,'LONG_SPIKE');
assert.equal(classifyLiquidationContext({...sell,oi:{...m.oi,change15mPct:.2}},{...liq,long5m:100},breadth,null,now).state,'LONG_CROWDED');
const crowdedShort={...buy,account:{...m.account,value:.6,p20:.7},position:{...m.position,value:.8},
  oi:{...m.oi,change15mPct:.2},price15mPct:.1};
assert.equal(classifyLiquidationContext(crowdedShort,shortLiq,{},null,now).state,'SHORT_SPIKE');
assert.equal(classifyLiquidationContext(crowdedShort,{...shortLiq,short5m:100},{},null,now).state,'SHORT_CROWDED');
const quiet={...liq,long5m:1e5,longBurst:.5};
assert.equal(classifyLiquidationContext({...sell,price5mPct:.2},quiet,breadth,cascade.risk,now+MIN).state,'LONG_CASCADE','one green bounce does not erase risk');
const recovering={...m,holdingLow:true,takerBuy15m:.6,oi:{...m.oi,change15mPct:0}};
assert.equal(classifyLiquidationContext(recovering,quiet,{},cascade.risk,now+MIN).state,'POST_LONG_LIQUIDATION');
assert.equal(classifyLiquidationContext(sell,quiet,breadth,cascade.risk,now+2*MIN).state,'LONG_CASCADE','renewed weakness relatches');
assert.equal(classifyLiquidationContext(m,quiet,{},cascade.risk,now+61*MIN).state,'NEUTRAL');

// Regression: the actual 19:37 burst must not be hidden by delayed OI; 19:41 may confirm later.
const delayedOi={...sell,price15mPct:-.3557116,oi:{...m.oi,change15mPct:-.0413477}};
const realBurst={...liq,long5m:16_640_363,longBurst:58.423,longShare:.988536};
const spike=classifyLiquidationContext(delayedOi,realBurst,breadth,null,now);
assert.equal(spike.state,'LONG_SPIKE');assert.equal(spike.risk.confirmed,false);
assert.equal(spike.risk.peak,16_640_363);
const later={...sell,price15mPct:-.5283517,oi:{...m.oi,change15mPct:-.5933646}};
const laterLiq={...liq,long5m:5_063_361,longBurst:2.234,longShare:.9716779};
assert.equal(classifyLiquidationContext(later,laterLiq,{},spike.risk,now+4*MIN).state,'LONG_CASCADE');
assert.equal(classifyLiquidationContext(later,laterLiq,{},spike.risk,now+30*MIN).state,'LONG_CASCADE');
assert.equal(classifyLiquidationContext(later,laterLiq,{},spike.risk,now+30*MIN+1).state,'LONG_OBSERVED_LARGE','absolute observation does not extend spike confirmation window');
assert.equal(classifyLiquidationContext(m,quiet,{},spike.risk,now+60*MIN).state,'RECENT_LONG_LIQUIDATION');
assert.equal(classifyLiquidationContext(m,quiet,{},spike.risk,now+60*MIN+1).state,'NEUTRAL');
assert.equal(classifyLiquidationContext(m,quiet,{}, {...spike.risk,at:now+1},now).state,'NEUTRAL','future risk rejected');
const missing={ready:false,errors:['Ratio/OI cập nhật chậm.']};
const blindSpike=classifyLiquidationContext(missing,realBurst,{},null,now);
assert.equal(blindSpike.state,'LONG_SPIKE');assert.equal(blindSpike.ready,false);
assert.equal(classifyLiquidationContext(missing,quiet,{},blindSpike.risk,now+MIN).state,'RECENT_LONG_LIQUIDATION');
assert.equal(classifyLiquidationContext(missing,{...liq,ready:false,errors:['socket gap']},{},blindSpike.risk,now+MIN).state,'WAIT_DATA');
assert.equal(classifyLiquidationContext(m,{...realBurst,long5m:4_999_999},{},null,now).state,'LONG_OBSERVED_LARGE');
assert.equal(classifyLiquidationContext(m,{...realBurst,longBurst:2.999},{},null,now).state,'LONG_OBSERVED_LARGE');
assert.equal(classifyLiquidationContext(m,{...realBurst,longShare:.6999},{},null,now).state,'LONG_OBSERVED_LARGE');
const shortSpike=classifyLiquidationContext(m,shortLiq,{},null,now);
assert.equal(shortSpike.state,'SHORT_SPIKE');
assert.equal(classifyLiquidationContext(buy,{...shortLiq,shortBurst:2},{},shortSpike.risk,now+5*MIN).state,'SHORT_CASCADE');
assert.equal(classifyLiquidationContext(m,{...shortLiq,short5m:100,shortBurst:0},{},shortSpike.risk,now+MIN).state,'RECENT_SHORT_LIQUIDATION');

const dir=await mkdtemp(join(tmpdir(),'btc-liquidation-context-')),file=join(dir,'state.json');
const monitor=new BtcLiquidationContext({file,now:()=>now});
monitor.socketState='OPEN';monitor.connectedAt=now-35*MIN;monitor.lastTransportAt=now;
function event({side='SELL',quantity=2,price=100,at=now,symbol='BTCUSDT',st=1}={}) {
  return {e:'forceOrder',st,o:{s:symbol,S:side,ap:String(price),z:String(quantity),T:at}};
}
assert.equal(monitor.ingest(event()),true);assert.equal(monitor.ingest(event()),false,'duplicate snapshot');
assert.equal(monitor.ingest(event({side:'BUY',quantity:3})),true);
assert.equal(monitor.ingest(event({symbol:'龙虾USDT'})),true);
assert.equal(monitor.ingest(event({st:2})),false,'no COIN-M units mixed with USDT');
assert.equal(monitor.ingest(event({at:now+1})),false);
assert.equal(monitor.ingest(event({at:now-2*MIN})),false);
const totals=monitor.liquidationSummary();
assert.equal(totals.long5m,400);assert.equal(totals.short5m,300);assert.equal(totals.ready,true);
assert.equal(totals.transportReady,true);
monitor.inputs=m;monitor.fetchedAt=now;
assert.equal(monitor.snapshot().ready,true);
const count=monitor.history.length;monitor.snapshot();assert.equal(monitor.history.length,count,'transition dedupe');
monitor.socketState='RECONNECTING';assert.equal(monitor.snapshot().state,'WAIT_DATA');
monitor.socketState='OPEN';monitor.connectedAt=now;assert.equal(monitor.snapshot().state,'WAIT_DATA','re-warm gaps');
await monitor.pendingSave;
const loaded=new BtcLiquidationContext({file,now:()=>now});await loaded.load();
assert.ok(loaded.history.length);assert.equal(loaded.risk,null);assert.equal(loaded.snapshot().state,'WAIT_DATA');
await loaded.pendingSave;
await writeFile(file,'broken');const corrupt=new BtcLiquidationContext({file,now:()=>now});await corrupt.load();
corrupt.snapshot();await corrupt.pendingSave;assert.equal(await readFile(file,'utf8'),'broken');
assert.ok(corrupt.storageError);
const cold={...shortLiq,transportReady:true,ready:false,errors:['Đang thu nền: 2/35 phút.'],shortBurst:90};
const coldObserved=classifyLiquidationContext(buy,cold,{},null,now);
assert.equal(coldObserved.state,'SHORT_OBSERVED_LARGE');assert.equal(coldObserved.ready,false);
assert.equal(coldObserved.risk.burstConfirmed,false,'partial baseline never claims a burst');
assert.equal(classifyLiquidationContext(buy,{...shortLiq,shortBurst:2},{},coldObserved.risk,now+MIN).state,'SHORT_OBSERVED_LARGE','warmup observation never confirms cascade later');
assert.equal(classifyLiquidationContext(m,{...cold,long5m:2e6},{},null,now).state,'BOTH_OBSERVED_LARGE');
assert.equal(classifyLiquidationContext(m,{...cold,transportReady:false},{},null,now).state,'WAIT_DATA','disconnected data is not a live alert');
assert.equal(classifyLiquidationContext(m,{...cold,ready:true,transportReady:false},{},null,now).state,'WAIT_DATA','explicit unhealthy transport wins');
assert.equal(classifyLiquidationContext(m,{...cold,short5m:999_999,long5m:100},{},null,now).state,'WAIT_DATA','absolute threshold boundary');
const coldFile=join(dir,'cold.json'),coldMonitor=new BtcLiquidationContext({file:coldFile,now:()=>now});
coldMonitor.socketState='OPEN';coldMonitor.connectedAt=now-2*MIN;coldMonitor.lastTransportAt=now;
coldMonitor.ingest(event({side:'BUY',quantity:12_000}));
assert.equal(coldMonitor.snapshot().state,'SHORT_OBSERVED_LARGE');await coldMonitor.pendingSave;
const coldSaved=JSON.parse(await readFile(coldFile,'utf8'));
assert.equal(coldSaved.history[0].state,'SHORT_OBSERVED_LARGE');assert.equal(coldSaved.lastEpisode.peak,1.2e6);
const coldRestart=new BtcLiquidationContext({file:coldFile,now:()=>now});await coldRestart.load();
assert.equal(coldRestart.risk,null);assert.equal(coldRestart.lastEpisode.historicalOnly,true);
const legacyFile=join(dir,'legacy.json');
await writeFile(legacyFile,JSON.stringify({version:LEGACY_VERSION,history:[{at:now-1,state:'NEUTRAL'}]}));
const legacyMonitor=new BtcLiquidationContext({file:legacyFile,now:()=>now});await legacyMonitor.load();
assert.equal(legacyMonitor.history[0].state,'NEUTRAL','old labels are not reclassified');
assert.equal(legacyMonitor.history[0].version,LEGACY_VERSION);assert.equal(legacyMonitor.risk,null);
const episodeFile=join(dir,'episode.json');
const epMonitor=new BtcLiquidationContext({file:episodeFile,now:()=>now});
epMonitor.socketState='OPEN';epMonitor.connectedAt=now-35*MIN;epMonitor.lastTransportAt=now;
epMonitor.ingest(event({quantity:90_000}));
epMonitor.inputs=delayedOi;epMonitor.fetchedAt=now;
assert.equal(epMonitor.snapshot().state,'LONG_SPIKE');await epMonitor.pendingSave;
const episodeRestart=new BtcLiquidationContext({file:episodeFile,now:()=>now});await episodeRestart.load();
assert.equal(episodeRestart.risk,null,'saved episode is not live confirmation evidence');
assert.equal(episodeRestart.snapshot().lastEpisode.historicalOnly,true);
assert.equal(episodeRestart.lastEpisode.peak,9e6);await episodeRestart.pendingSave;
monitor.connectedAt=now-40*MIN;monitor.lastTransportAt=now-5*MIN;
assert.equal(monitor.snapshot().state,'WAIT_DATA','dead stream never quiet');
monitor.lastTransportAt=now;monitor.fetchedAt=now-91_000;
assert.equal(monitor.snapshot().state,'WAIT_DATA','stale REST');

let socket;
const socketMonitor=new BtcLiquidationContext({now:()=>now,socketFactory:()=>{
  socket=new EventEmitter();socket.terminate=()=>socket.emit('close');return socket;
}});
socketMonitor.connect();socket.emit('open');assert.equal(socketMonitor.socketState,'OPEN');
socket.emit('message',JSON.stringify(event()));assert.equal(socketMonitor.events.length,1);
socket.emit('message','broken json');socketMonitor.stop();assert.equal(socketMonitor.socketState,'STOPPED');

const calls=[];
const client={getKlines:async()=>data.candles,getGlobalLongShortRatio:async()=>data.accounts,
  getTopLongShortPositionRatio:async()=>data.positions,get:async(path)=>{calls.push(path);return data.interests;}};
const rest=new BtcLiquidationContext({client,now:()=>now});await rest.refresh();assert.equal(rest.inputs.ready,true);
assert.deepEqual(calls,['/futures/data/openInterestHist']);
client.get=async()=>{throw new Error('private upstream details');};await rest.refresh();
assert.equal(rest.snapshot().ready,false);assert.ok(!JSON.stringify(rest.snapshot()).includes('private upstream'));

for(const state of Object.keys(BTC_LIQUIDATION_STATES)) {
  const key=btcLiquidationKey(state);if(!key)continue;
  assert.equal(normalizeLiquidLiveCardKey(key),key);
  const trade={entryAt:now,btcLiquidationContextAtEntry:{version:VERSION,source:'AT_ENTRY',ready:true,state,evaluatedAt:now-1}};
  assert.equal(btcLiquidationTradeKey(trade),key);
  assert.ok(liquidLiveCardKeysOfTrade(trade).includes(key));
  assert.equal(matchLiquidLiveCardWhitelist(trade,[]).allowed,false,'default OFF');
  assert.equal(matchLiquidLiveCardWhitelist(trade,[key]).allowed,true);
  assert.equal(btcLiquidationTradeKey({...trade,entryAt:now-1000}),null,'future observation');
  assert.equal(btcLiquidationTradeKey({...trade,entryAt:now+MIN}),null,'stale observation');
}
assert.equal(btcLiquidationTradeKey({}),null,'legacy not backfilled');
assert.equal(btcLiquidationTradeKey({entryAt:now,btcLiquidationContextAtEntry:{version:LEGACY_VERSION,
  source:'AT_ENTRY',ready:true,state:'LONG_CASCADE',evaluatedAt:now-1}}),'btc-liquidation-context:LONG_CASCADE');
assert.equal(btcLiquidationTradeKey({entryAt:now,btcLiquidationContextAtEntry:{version:LEGACY_VERSION,
  source:'AT_ENTRY',ready:true,state:'LONG_SPIKE',evaluatedAt:now-1}}),null,'V1 cannot claim a V2 label');
assert.equal(btcLiquidationTradeKey({entryAt:now,btcLiquidationContextAtEntry:{version:VERSION,
  source:'AT_ENTRY',ready:false,state:'LONG_SPIKE',evaluatedAt:now-1}}),null,'partial data alerts do not grant cohort eligibility');
assert.equal(normalizeLiquidLiveCardKey('btc-liquidation-context:FAKE'),null);
for(const n of [null,0,4])assert.equal(isBinanceCardAvgRoeEligible(n),false);
assert.equal(isBinanceCardAvgRoeEligible(4.01),true);
console.log('PASS BTC liquidation context: classification, causal inputs, LONG/SHORT, gaps, socket, REST, history, whitelist.');
