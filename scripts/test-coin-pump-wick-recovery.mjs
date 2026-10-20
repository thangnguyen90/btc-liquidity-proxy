import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {evaluatePumpWickEpisode,BtcWickRecovery,wickClosedRows,wickPushPayload} from '../src/btcWickRecovery.js';
import {COIN_PUMP_WICK_VERSION as VERSION,coinPumpWickKey,coinPumpWickTradeKey,BTC_WICK_VERSION} from '../public/btc-wick-recovery-model.js';
import {normalizeLiquidLiveCardKey,liquidLiveCardKeysOfTrade,matchLiquidLiveCardWhitelist} from '../src/liquidLiveCardWhitelist.js';
import {isBinanceCardAvgRoeEligible} from '../public/binance-card-visibility.js';
import {OppositeLiquidityWebPushService} from '../src/oppositeLiquidityWebPush.js';
import {CoinPumpLongFlushMonitor} from '../src/coinPumpLongFlush.js';
import {pumpWickRows,recovery,bar,MIN} from './coin-pump-wick-fixtures.mjs';
const rows=pumpWickRows(),immediate=pumpWickRows({immediate:true});
let now=rows.at(-1).closeTime+2;
const pending=evaluatePumpWickEpisode(rows,30);
assert.equal(pending.status,'WAIT_CONFIRM');assert.equal(pending.preSweepRows.length,30);
const e=evaluatePumpWickEpisode([...rows,recovery],30);
assert.equal(e.status,'CONFIRMED');assert.equal(e.contextMode,'COIN_PUMP');assert.equal(e.pattern,'MULTI_BAR');
assert.equal(e.level,101.67);assert.equal(e.nextCandleAt,recovery.closeTime+1);assert.equal(e.btc,undefined);
const red=evaluatePumpWickEpisode(immediate,30);
assert.equal(red.pattern,'IMMEDIATE');assert(red.sweep.close<red.sweep.open);
assert(red.reboundPct>1.5);assert.equal(red.status,'CONFIRMED','a large recovered wick is an alert, not an entry gate');
assert.equal(evaluatePumpWickEpisode([...rows,{...recovery,low:99.9}],30).status,'INVALIDATED');
assert.equal(evaluatePumpWickEpisode([...rows,...[31,32,33].map(i=>({...bar(i,100.2),low:100.1}))],30).status,'EXPIRED');
assert.equal(evaluatePumpWickEpisode([...rows,{...recovery,takerBuyQuoteVolume:120}],30).status,'WAIT_CONFIRM');
assert.equal(evaluatePumpWickEpisode(rows.map((r,i)=>i<30?{...bar(i),quoteVolume:r.quoteVolume,takerBuyQuoteVolume:r.takerBuyQuoteVolume}:r),30),null,'volume without a preceding pump');
assert.equal(evaluatePumpWickEpisode(rows.map((r,i)=>i<30?{...r,quoteVolume:100,takerBuyQuoteVolume:50}:r),30),null,'flush volume cannot manufacture the earlier rising wave');
assert.equal(evaluatePumpWickEpisode([...rows.slice(0,30),{...rows[30],low:101.8,close:102}],30),null,'small adjustment');
assert.equal(wickClosedRows(rows,rows[30].closeTime-1).length,30,'open flush excluded');
assert.equal(wickClosedRows(rows,now+2*MIN).length,0);assert.equal(wickClosedRows(rows.filter((_,i)=>i!==18),now).length,0);
assert.equal(wickClosedRows(rows.map((r,i)=>i===30?{...r,takerBuyQuoteVolume:null}:r),now).length,0);
for(const pattern of ['IMMEDIATE','MULTI_BAR']) {
  const key=coinPumpWickKey(pattern),trade={entryAt:now,coinPumpWickRecoveryAtEntry:{version:VERSION,contextMode:'COIN_PUMP',source:'AT_ENTRY',status:'CONFIRMED',pattern,confirmedAt:now-1}};
  assert.equal(normalizeLiquidLiveCardKey(key),key);assert(liquidLiveCardKeysOfTrade(trade).includes(key));
  assert.equal(matchLiquidLiveCardWhitelist(trade,[]).allowed,false);
  for(const change of [{source:'AT_DETECTION'},{version:BTC_WICK_VERSION},{contextMode:'BTC_DOWN'},{confirmedAt:now+1},{confirmedAt:now-120001}])
    assert.equal(coinPumpWickTradeKey({...trade,coinPumpWickRecoveryAtEntry:{...trade.coinPumpWickRecoveryAtEntry,...change}}),null);
  assert.equal(coinPumpWickTradeKey({entryAt:now,btcWickRecoveryAtEntry:trade.coinPumpWickRecoveryAtEntry}),null,'no legacy relabel');
}
assert.equal(coinPumpWickTradeKey({}),null);assert.equal(normalizeLiquidLiveCardKey('coin-pump-wick-recovery:FAKE'),null);
assert.equal(isBinanceCardAvgRoeEligible(null),false);assert.equal(isBinanceCardAvgRoeEligible(4),false);assert.equal(isBinanceCardAvgRoeEligible(4.01),true);
const dir=await mkdtemp(join(tmpdir(),'pump-wick-'));
try {
  let visible=rows.slice(0,30),sent=[];now=visible.at(-1).closeTime+2;
  const file=join(dir,'state.json'),opts={file,now:()=>now,getSymbols:()=>['TESTUSDT','BTCUSDT'],
    getRows:s=>{assert.notEqual(s,'BTCUSDT','no BTC cache dependency');return visible;},
    getLiquidation:()=>({covered:false}),pushSender:async p=>{
      assert.equal(JSON.parse(await readFile(file,'utf8')).history.find(r=>r.id===p.eventId).delivery.status,'POSTING');
      sent.push(p);return {sent:1,attempted:1};}};
  const monitor=new BtcWickRecovery(opts);await monitor.init();await monitor.scan();assert.equal(sent.length,0);
  visible=rows;now=rows.at(-1).closeTime+2;await monitor.scan();assert.equal(monitor.history[0].status,'WAIT_CONFIRM');
  visible=[...rows,recovery];now=recovery.closeTime+2;await monitor.scan();await monitor.scan();
  assert.equal(sent.length,1);assert.equal(sent[0].signalType,'COIN_PUMP_WICK_RECOVERY_1M');assert(!sent[0].body.includes('BTC 5m'));
  assert.equal(monitor.coverage.btcRequired,false);assert.equal(monitor.snapshot().closedStats.avgRoe,null);
  const restart=new BtcWickRecovery({...opts,pushSender:()=>{throw Error('replay');}});await restart.init();await restart.scan();
  assert.equal(restart.history[0].delivery.status,'SENT');
  visible.push({...bar(32,102),low:99.9});now=visible.at(-1).closeTime+2;await monitor.scan();assert(monitor.history[0].followUp);
  const legacyFile=join(dir,'legacy.json');await writeFile(legacyFile,JSON.stringify({version:BTC_WICK_VERSION,enabled:false,
    history:[{version:BTC_WICK_VERSION,id:'legacy',sweepAt:now-1000,status:'CONFIRMED',delivery:{status:'SENT'}}]}));
  const legacy=new BtcWickRecovery({...opts,file:legacyFile});await legacy.init();assert.equal(legacy.enabled,false);
  assert.equal(legacy.snapshot().legacyCount,1);assert.equal(legacy.snapshot().counts.CONFIRMED,undefined);
  await legacy.save();assert.equal(JSON.parse(await readFile(legacyFile,'utf8')).history[0].version,BTC_WICK_VERSION);
  const corruptFile=join(dir,'corrupt.json');await writeFile(corruptFile,'broken');const corrupt=new BtcWickRecovery({...opts,file:corruptFile});
  await corrupt.init();await corrupt.scan();assert(corrupt.error);assert.equal(await readFile(corruptFile,'utf8'),'broken');
  const cold=new BtcWickRecovery({...opts,file:null,now:()=>now});await cold.scan();assert.equal(cold.history.length,0,'startup fence');
  let immediateSends=0;const one=new BtcWickRecovery({...opts,file:null,now:()=>rows[30].openTime,getRows:()=>immediate,
    pushSender:async()=>{immediateSends++;return{sent:1};}});one.now=()=>rows[30].closeTime+2;await one.scan();assert.equal(immediateSends,1);
  let warnings=0;const flush=new CoinPumpLongFlushMonitor({now:()=>rows[30].openTime,getSymbols:()=>['TESTUSDT'],getRows:()=>immediate,
    isRecoveryHandled:()=>true,pushSender:async()=>{warnings++;return{sent:1};}});flush.now=one.now;await flush.scan();
  assert.equal(warnings,0);assert.equal(flush.history[0].delivery.status,'RECOVERY_CHANNEL');
  const fallback=new CoinPumpLongFlushMonitor({now:()=>rows[30].openTime,getSymbols:()=>['TESTUSDT'],getRows:()=>immediate,
    isRecoveryHandled:()=>false,pushSender:async()=>{warnings++;return{sent:1};}});fallback.now=one.now;await fallback.scan();assert.equal(warnings,1);
  const shown=[],service=new OppositeLiquidityWebPushService({stateFile:join(dir,'push.json'),vapidFile:join(dir,'vapid.json'),now:one.now,
    webPushImpl:{generateVAPIDKeys:()=>({publicKey:'PUBLIC_TEST',privateKey:'PRIVATE_TEST'}),setVapidDetails:()=>{},sendNotification:async(s,p,o)=>shown.push({p:JSON.parse(p),o})}});
  await service.publicConfig();await service.subscribe({endpoint:'https://push.example.test/device',keys:{p256dh:'A'.repeat(88),auth:'B'.repeat(24)}});
  const payload=wickPushPayload({...red,id:'test',symbol:'TESTUSDT'},one.now());
  assert.equal((await service.sendPayload(payload)).sent,1);assert.equal(shown[0].o.TTL,120);
  assert.equal((await service.sendPayload(payload)).deduped,true);
  assert.equal((await service.sendPayload({...payload,eventId:'expired',expiresAt:one.now()-1})).error,'EXPIRED_WICK_ALERT');
  const handlers={},notifications=[];vm.runInNewContext(await readFile('public/opposite-liquidity-push-sw.js','utf8'),{Date:{now:one.now},URL,
    self:{addEventListener:(k,f)=>handlers[k]=f,registration:{showNotification:(t,p)=>{notifications.push({t,p});return Promise.resolve();}}}});
  handlers.push({data:{json:()=>payload},waitUntil:()=>{}});assert.equal(notifications.length,1);
  handlers.push({data:{json:()=>({...payload,expiresAt:one.now()-1})},waitUntil:()=>{}});assert.equal(notifications.length,1);
}finally {await rm(dir,{recursive:true,force:true});}
console.log('PASS pump wick: no BTC dependency, red immediate/deep rebound, causal pump, delayed recovery, invalidation, legacy isolation, dedupe/mock push/SW, exact whitelist OFF.');
