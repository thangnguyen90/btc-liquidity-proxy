import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {evaluateCoinPumpWickEarly,CoinPumpWickEarlyMonitor,earlyWickPushPayload,broadCoinPumpContext} from '../src/coinPumpWickEarly.js';
import {evaluatePumpWickEpisode,BtcWickRecovery} from '../src/btcWickRecovery.js';
import {buildCoinPumpWickDiscordPayload,createCoinPumpWickDiscordSender} from '../src/coinPumpWickDiscord.js';
import {COIN_PUMP_WICK_EARLY_VERSION as VERSION,coinPumpWickEarlyKey,coinPumpWickEarlyTradeKey} from '../public/coin-pump-wick-early-model.js';
import {normalizeLiquidLiveCardKey,liquidLiveCardKeysOfTrade,matchLiquidLiveCardWhitelist} from '../src/liquidLiveCardWhitelist.js';
import {isBinanceCardAvgRoeEligible} from '../public/binance-card-visibility.js';
import {OppositeLiquidityWebPushService} from '../src/oppositeLiquidityWebPush.js';
import {buildDiscordPushRouteCatalog} from '../src/discordPushManager.js';
import {pumpWickRows,bar,MIN} from './coin-pump-wick-fixtures.mjs';
const fixture=JSON.parse(await readFile('scripts/fixtures/era-pump-wick-20261010.json','utf8'));
const era=fixture.rows.map(row=>Object.fromEntries(fixture.columns.map((key,i)=>[key,row[i]])));
const index=era.length-1,early=evaluateCoinPumpWickEarly(era,index);
assert.equal(early.status,'WICK_DETECTED');assert.equal(early.reclaimed,false);assert.equal(early.confirmationRequired,false);
assert(early.wickPct>46&&early.wickPct<47);assert(early.reboundPct>7);assert.equal(early.price,0.07844);
assert.equal(early.pump.lookbackMinutes,30);assert.equal(early.preSweepRows.length,50);
assert.equal(evaluatePumpWickEpisode(era,index),null,'ERA does not become old confirmed recovery');
assert.deepEqual(evaluateCoinPumpWickEarly([...era,{...bar(1000),low:.00001}],index),early,'future bars cannot change the immediate early alert');
assert.equal(evaluateCoinPumpWickEarly(era.slice(1),index-1),null,'needs 20 baseline + 30 preceding wave + closed wick');
assert.equal(evaluateCoinPumpWickEarly(era.map((r,i)=>i===index?{...r,close:r.low+.00001}:r),index),null,'deep dump without lower wick');
assert.equal(evaluateCoinPumpWickEarly(era.map((r,i)=>i===index?{...r,quoteVolume:1}:r),index),null,'weak volume');
const flat=era.map((r,i)=>i<index?{...r,open:.08,high:.0801,low:.0799,close:.08,quoteVolume:100}:r);
assert.equal(evaluateCoinPumpWickEarly(flat,index),null,'a wick or its own volume cannot manufacture the preceding pump');
const longWave=Array.from({length:20},(_,i)=>bar(i));
for(let i=0;i<60;i++){
  const open=i<40?100+i*.4:116-(i-40)*.3,close=i<40?open+.4:open-.3;
  longWave.push({...bar(20+i),open,close,high:Math.max(open,close)+.1,low:Math.min(open,close)-.1,
    quoteVolume:i<40?250:180,takerBuyQuoteVolume:100});
}
longWave.push({...bar(80),open:110,high:110.2,low:100,close:105.2,quoteVolume:1000,takerBuyQuoteVolume:300});
assert.equal(broadCoinPumpContext(longWave.slice(0,-1)).lookbackMinutes,60,'remember the earlier broad pump after a pullback');
assert.equal(evaluateCoinPumpWickEarly(longWave,80).status,'WICK_DETECTED');
const at=early.detectedAt+2,key=coinPumpWickEarlyKey('EARLY_WICK');
const trade={entryAt:at,coinPumpWickEarlyAtEntry:{version:VERSION,source:'AT_ENTRY',status:'WICK_DETECTED',pattern:'EARLY_WICK',detectedAt:at-1}};
assert.equal(normalizeLiquidLiveCardKey(key),key);assert(liquidLiveCardKeysOfTrade(trade).includes(key));
assert.equal(matchLiquidLiveCardWhitelist(trade,[]).allowed,false);assert.equal(matchLiquidLiveCardWhitelist(trade,[key]).allowed,true);
for(const change of [{version:'LEGACY'},{source:'AT_DETECTION'},{status:'CONFIRMED'},{detectedAt:at+1},{detectedAt:at-120001}])
  assert.equal(coinPumpWickEarlyTradeKey({...trade,coinPumpWickEarlyAtEntry:{...trade.coinPumpWickEarlyAtEntry,...change}}),null);
assert.equal(coinPumpWickEarlyTradeKey({entryAt:at,coinPumpWickRecoveryAtEntry:trade.coinPumpWickEarlyAtEntry}),null);
assert.equal(normalizeLiquidLiveCardKey('coin-pump-wick-early:FAKE'),null);
const [catalogRoute]=buildDiscordPushRouteCatalog({COIN_PUMP_WICK_DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/TEST_ONLY'});
assert.equal(catalogRoute.defaultEnabled,false,'direct push is already emitted; bridge must remain opt-in');
assert.equal(catalogRoute.targetPath,'/local-ai-trend-evaluation#btc-wick-recovery');
assert(catalogRoute.label.includes('rút râu sớm'));
assert.equal(isBinanceCardAvgRoeEligible(null),false);assert.equal(isBinanceCardAvgRoeEligible(4),false);assert.equal(isBinanceCardAvgRoeEligible(4.01),true);
const dir=await mkdtemp(join(tmpdir(),'early-wick-'));
try{
 let now=era[index].openTime,visible=era.slice(0,-1),pushes=0,discord=0;
 const file=join(dir,'state.json'),opts={file,now:()=>now,getSymbols:()=>['ERAUSDT','BTCUSDT'],getRows:s=>{assert.notEqual(s,'BTCUSDT');return visible;},
   pushSender:async()=>{pushes++;assert.equal(JSON.parse(await readFile(file,'utf8')).history[0].delivery.status,'POSTING');throw Error('push failed');},
   discordSender:async()=>{discord++;assert.equal(JSON.parse(await readFile(file,'utf8')).history[0].discordDelivery.status,'POSTING');return{sent:1,attempted:1};}};
 const monitor=new CoinPumpWickEarlyMonitor(opts);await monitor.init();await monitor.scan();assert.equal(pushes,0);
 visible=era;now=at;await monitor.scan();await monitor.scan();assert.equal(pushes,1);assert.equal(discord,1);
 assert.equal(monitor.history[0].delivery.status,'FAILED');assert.equal(monitor.history[0].discordDelivery.status,'SENT');
 assert.equal(monitor.history[0].status,'WICK_DETECTED');assert.equal(monitor.snapshot().closedStats.avgRoe,null);
 const restarted=new CoinPumpWickEarlyMonitor({...opts,pushSender:()=>{throw Error('replay');},discordSender:()=>{throw Error('replay');}});
 await restarted.init();await restarted.scan();assert.equal(restarted.history.length,1);assert.equal(restarted.history[0].discordDelivery.status,'SENT');
 const startup=new CoinPumpWickEarlyMonitor({...opts,file:null,now:()=>at});await startup.scan();assert.equal(startup.history.length,0);
 await monitor.setEnabled(false);assert.equal((await new CoinPumpWickEarlyMonitor(opts).init()).enabled,false);
 const corruptFile=join(dir,'corrupt.json');await writeFile(corruptFile,'broken');const bad=new CoinPumpWickEarlyMonitor({...opts,file:corruptFile});
 await bad.init();await bad.scan();assert(bad.error);assert.equal(await readFile(corruptFile,'utf8'),'broken');
 for(const changed of [era.filter((_,i)=>i!==10),era.map((r,i)=>i===index?{...r,isClosed:false}:r)]){
   const check=new CoinPumpWickEarlyMonitor({...opts,file:null,now:()=>era[index].openTime,getRows:()=>changed});check.now=()=>at;
   await check.scan();assert.equal(check.history.length,0,'gap/open candle cannot alert');
 }
 const stale=new CoinPumpWickEarlyMonitor({...opts,file:null,now:()=>era[index].openTime});stale.now=()=>at+120000;await stale.scan();assert.equal(stale.history.length,0);
 const oldRows=pumpWickRows({immediate:true});let oldDiscord=0;
 const old=new BtcWickRecovery({now:()=>oldRows.at(-1).openTime,getSymbols:()=>['TESTUSDT'],getRows:()=>oldRows,
   pushSender:async()=>({sent:1}),discordSender:async e=>{assert.equal(e.status,'CONFIRMED');oldDiscord++;return{sent:1};}});
 old.now=()=>oldRows.at(-1).closeTime+2;await old.scan();await old.scan();assert.equal(oldDiscord,1);
 assert.equal(old.history[0].discordDelivery.status,'SENT');assert.equal(old.history[0].pattern,'IMMEDIATE');
 const earlyPayload=buildCoinPumpWickDiscordPayload({...early,id:'early',symbol:'ERAUSDT'}),oldPayload=buildCoinPumpWickDiscordPayload(old.history[0]);
 assert(earlyPayload.embeds[0].title.includes('MỚI'));assert(oldPayload.embeds[0].title.includes('CŨ'));
 assert(earlyPayload.embeds[0].description.includes('KHÔNG chờ'));assert.equal(earlyPayload.allowed_mentions.parse.length,0);
 assert.equal(createCoinPumpWickDiscordSender({}),null);assert.throws(()=>createCoinPumpWickDiscordSender({webhookUrl:'https://example.test/secret'}));
 let requests=0;const sender=createCoinPumpWickDiscordSender({webhookUrl:'https://discord.com/api/webhooks/123/TEST_ONLY',fetchImpl:async(url,opt)=>{
   requests++;assert.equal(opt.method,'POST');assert.equal(JSON.parse(opt.body).embeds[0].title,earlyPayload.embeds[0].title);return{ok:true,status:204};}});
 assert.equal((await sender({...early,id:'early',symbol:'ERAUSDT'})).sent,1);assert.equal(requests,1);
 const failedSender=createCoinPumpWickDiscordSender({webhookUrl:'https://discord.com/api/webhooks/123/TEST_ONLY',fetchImpl:async()=>{throw Error('sensitive URL must not leak');}});
 assert.equal((await failedSender({...early,id:'early',symbol:'ERAUSDT'})).error,'DISCORD_FAILED_OR_UNKNOWN');
 const notifications=[],service=new OppositeLiquidityWebPushService({stateFile:join(dir,'push.json'),vapidFile:join(dir,'vapid.json'),now:()=>at,
   webPushImpl:{generateVAPIDKeys:()=>({publicKey:'PUBLIC_TEST',privateKey:'PRIVATE_TEST'}),setVapidDetails:()=>{},sendNotification:async(s,p,o)=>notifications.push({p:JSON.parse(p),o})}});
 await service.publicConfig();await service.subscribe({endpoint:'https://push.example.test/device',keys:{p256dh:'A'.repeat(88),auth:'B'.repeat(24)}});
 const payload=earlyWickPushPayload({...early,id:'early',symbol:'ERAUSDT'},at);
 assert.equal((await service.sendPayload(payload)).sent,1);assert.equal(notifications[0].o.TTL,120);assert.equal((await service.sendPayload(payload)).deduped,true);
 assert.equal((await service.sendPayload({...payload,eventId:'expired',expiresAt:at-1})).error,'EXPIRED_WICK_ALERT');
 const handlers={},shown=[];vm.runInNewContext(await readFile('public/opposite-liquidity-push-sw.js','utf8'),{Date:{now:()=>at},URL,
   self:{addEventListener:(k,f)=>handlers[k]=f,registration:{showNotification:(t,p)=>{shown.push(p);return Promise.resolve();}}}});
 handlers.push({data:{json:()=>payload},waitUntil:()=>{}});assert.equal(shown.length,1);
 handlers.push({data:{json:()=>({...payload,expiresAt:at-1})},waitUntil:()=>{}});assert.equal(shown.length,1);
 const code=await readFile('src/server.js','utf8');assert(code.includes('new RisingVolumeMinuteWarmup('));
 assert(code.includes(".filter(interval => interval !== '1m')"));
 assert(code.includes("requestUrl.pathname === '/api/coin-pump-wick-early'"));
}finally{await rm(dir,{recursive:true,force:true});}
console.log('PASS early wick: real ERA fixture, 30/60m prior pump, no reclaim/future gate, old rule unchanged, mock dual-channel durable/no replay, whitelist OFF, push TTL/SW.');
