import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {evaluateCoinPumpLongFlush,CoinPumpLongFlushMonitor,coinPumpFlushPushPayload} from '../src/coinPumpLongFlush.js';
import {COIN_PUMP_FLUSH_VERSION as VERSION,coinPumpFlushKey,coinPumpFlushTradeKey} from '../public/coin-pump-long-flush-model.js';
import {normalizeLiquidLiveCardKey,liquidLiveCardKeysOfTrade,matchLiquidLiveCardWhitelist} from '../src/liquidLiveCardWhitelist.js';
import {isBinanceCardAvgRoeEligible} from '../public/binance-card-visibility.js';
import {OppositeLiquidityWebPushService} from '../src/oppositeLiquidityWebPush.js';
const MIN=60_000,start=Date.UTC(2026,9,9,0);
const bar=(i,p=100)=>({openTime:start+i*MIN,closeTime:start+(i+1)*MIN-1,open:p,high:p+.1,low:p-.1,close:p,quoteVolume:100,takerBuyQuoteVolume:50});
const rows=Array.from({length:20},(_,i)=>bar(i));
for(let i=0;i<10;i++)rows.push({...bar(i+20),open:100+i*.25,close:100+(i+1)*.25,high:100+(i+1)*.25+.08,low:100+i*.25-.08,
  quoteVolume:i<5?180:300,takerBuyQuoteVolume:(i<5?180:300)*.65});
const kill={...bar(30),open:102.5,high:102.6,low:100,close:100.2,quoteVolume:600,takerBuyQuoteVolume:180};rows.push(kill);
let now=kill.closeTime+2;
const evaluate=(data=rows,extra={})=>evaluateCoinPumpLongFlush({symbol:'TESTUSDT',rows:data,now,...extra});
const signal=evaluate().signal;assert.equal(signal.pattern,'DUMP_CLOSE');assert.equal(signal.preKillRows.length,30);assert.equal(signal.liquidation,null);
assert.equal(evaluate([...rows.slice(0,30),{...kill,close:102.3}]).signal.pattern,'FLUSH_RECLAIM');
assert.equal(evaluate(rows,{now:kill.closeTime-1}).status,'WAIT_DATA','live candle cannot trigger');
assert.equal(evaluate(rows,{now:now+2*MIN}).status,'WAIT_DATA','stale');
assert.equal(evaluate(rows.filter((_,i)=>i!==15)).status,'WAIT_DATA','gap');
assert.equal(evaluate(rows.map((r,i)=>i===25?{...r,takerBuyQuoteVolume:r.quoteVolume+1}:r)).status,'WAIT_DATA','invalid taker');
assert.equal(evaluate([...rows.slice(0,30),{...kill,takerBuyQuoteVolume:null}]).status,'WAIT_DATA','unknown buying is not zero buying');
assert.equal(evaluate(rows.map((r,i)=>i<30?{...bar(i),quoteVolume:r.quoteVolume,takerBuyQuoteVolume:r.takerBuyQuoteVolume}:r)).status,'NO_PUMP','volume alone not pump');
assert.equal(evaluate(rows.map((r,i)=>i<30?{...r,quoteVolume:100,takerBuyQuoteVolume:60}:r)).status,'NO_PUMP','dump volume cannot create pre-pump volume');
assert.equal(evaluate(rows.map((r,i)=>i>=20&&i<30?{...r,quoteVolume:i%2?20:300,takerBuyQuoteVolume:i%2?12:180}:r)).status,'NO_PUMP','isolated spikes not rising volume wave');
assert.equal(evaluate([...rows.slice(0,30),{...kill,takerBuyQuoteVolume:350}]).status,'PUMP_ONLY','not sell-dominant');
assert.equal(evaluate([...rows.slice(0,30),{...kill,low:101.8,close:102.1}]).status,'PUMP_ONLY','small adjustment not deep flush');
const future={...bar(31),quoteVolume:1e9,takerBuyQuoteVolume:0};
assert.deepEqual(evaluate([...rows,future]).signal,signal,'no open/future candle influence');
const sampled=evaluate(rows,{liquidation:{covered:true,longUsd:8000,longCount:2}}).signal;
assert.equal(sampled.liquidation.longUsd,8000);assert.ok(coinPumpFlushPushPayload({...sampled,id:'e'},now).body.includes('8000 USDT'));
assert.ok(coinPumpFlushPushPayload({...signal,id:'e'},now).body.includes('nghi vấn'));
for(const pattern of ['DUMP_CLOSE','FLUSH_RECLAIM']){
  const key=coinPumpFlushKey(pattern),trade={entryAt:now,coinPumpLongFlushAtEntry:{version:VERSION,source:'AT_ENTRY',status:'CONFIRMED',pattern,confirmedAt:now-1}};
  assert.equal(normalizeLiquidLiveCardKey(key),key);assert.ok(liquidLiveCardKeysOfTrade(trade).includes(key));assert.equal(matchLiquidLiveCardWhitelist(trade,[]).allowed,false);
  assert.equal(coinPumpFlushTradeKey({...trade,entryAt:now-5}),null);assert.equal(coinPumpFlushTradeKey({...trade,entryAt:now+3*MIN}),null);
}
assert.equal(coinPumpFlushTradeKey({}),null);assert.equal(normalizeLiquidLiveCardKey('coin-pump-long-flush:FAKE'),null);
assert.equal(isBinanceCardAvgRoeEligible(4),false);assert.equal(isBinanceCardAvgRoeEligible(4.01),true);
const dir=await mkdtemp(join(tmpdir(),'coin-pump-flush-'));
try{
  const file=join(dir,'history.json');let visible=rows.slice(0,30),sent=[];now=visible.at(-1).closeTime+2;
  const opts={file,now:()=>now,getSymbols:()=>['TESTUSDT','TESTUSDT'],getRows:()=>visible,
    getLiquidation:()=>({covered:true,longUsd:8000,longCount:2}),
    pushSender:async p=>{assert.equal(JSON.parse(await readFile(file,'utf8')).history[0].delivery.status,'POSTING');sent.push(p);return{sent:1,attempted:1};}};
  const monitor=new CoinPumpLongFlushMonitor(opts);await monitor.init();await monitor.scan();assert.equal(sent.length,0);
  visible=rows;now=kill.closeTime+2;await monitor.scan();await monitor.scan();assert.equal(sent.length,1);assert.equal(monitor.history[0].delivery.status,'SENT');
  assert.equal(monitor.snapshot().counts.DUMP_CLOSE,1);assert.equal(monitor.coverage.ready,1);assert.equal(monitor.snapshot().closedStats.avgRoe,null);
  const restart=new CoinPumpLongFlushMonitor(opts);await restart.init();await restart.scan();assert.equal(sent.length,1,'no replay');
  await restart.setEnabled(false);assert.equal(JSON.parse(await readFile(file,'utf8')).enabled,false);
  const cold=new CoinPumpLongFlushMonitor({now:()=>now,getSymbols:()=>['TESTUSDT'],getRows:()=>rows,pushSender:()=>{throw Error('old');}});await cold.scan();assert.equal(cold.history.length,0,'startup fence');
  const disabled=new CoinPumpLongFlushMonitor({...opts,file:null,now:()=>kill.openTime});disabled.enabled=false;disabled.now=()=>now;await disabled.scan();assert.equal(disabled.history[0].delivery.status,'DISABLED');
  const corruptFile=join(dir,'corrupt.json');await writeFile(corruptFile,'legacy');const corrupt=new CoinPumpLongFlushMonitor({file:corruptFile});await corrupt.init();assert.ok(corrupt.error);assert.equal(await readFile(corruptFile,'utf8'),'legacy');
  const transport=[],service=new OppositeLiquidityWebPushService({stateFile:join(dir,'push.json'),vapidFile:join(dir,'vapid.json'),now:()=>now,
    webPushImpl:{generateVAPIDKeys:()=>({publicKey:'PUBLIC_TEST',privateKey:'PRIVATE_TEST'}),setVapidDetails:()=>{},sendNotification:async(s,p,o)=>transport.push({p:JSON.parse(p),o})}});
  await service.publicConfig();await service.subscribe({endpoint:'https://push.example.test/device',keys:{p256dh:'A'.repeat(88),auth:'B'.repeat(24)}});
  const payload=sent[0];assert.equal((await service.sendPayload(payload)).sent,1);assert.equal(transport[0].o.TTL,120);assert.equal((await service.sendPayload(payload)).deduped,true);
  assert.ok((await service.sendPayload({...payload,eventId:'old',expiresAt:now-1})).error);
  const handlers={},shown=[];vm.runInNewContext(await readFile('public/opposite-liquidity-push-sw.js','utf8'),{Date:{now:()=>now},URL,
    self:{addEventListener:(k,f)=>handlers[k]=f,registration:{showNotification:(t,p)=>{shown.push({t,p});return Promise.resolve();}}}});
  handlers.push({data:{json:()=>payload},waitUntil:()=>{}});assert.equal(shown.length,1);assert.match(shown[0].p.data.url,/flush=.*#coin-pump/);
  handlers.push({data:{json:()=>({...payload,expiresAt:now-1})},waitUntil:()=>{}});assert.equal(shown.length,1);
}finally{await rm(dir,{recursive:true,force:true});}
console.log('PASS coin pump/long-flush: closed causal wave, dump/reclaim, false-positive guards, durable no-replay, mockpush/SW, whitelist OFF.');
