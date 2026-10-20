import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {wickClosedRows,btcCrashContext,evaluateWickEpisode,BtcWickRecovery,wickPushPayload} from '../src/btcWickRecovery.js';
import {BTC_WICK_VERSION as VERSION,btcWickKey,btcWickTradeKey} from '../public/btc-wick-recovery-model.js';
import {normalizeLiquidLiveCardKey,liquidLiveCardKeysOfTrade,matchLiquidLiveCardWhitelist} from '../src/liquidLiveCardWhitelist.js';
import {isBinanceCardAvgRoeEligible} from '../public/binance-card-visibility.js';
import {OppositeLiquidityWebPushService} from '../src/oppositeLiquidityWebPush.js';
const MIN=60_000,start=Date.UTC(2026,9,9,0),bar=(i,p=100)=>({openTime:start+i*MIN,closeTime:start+(i+1)*MIN-1,
  open:p,high:p+.02,low:p-.02,close:p,quoteVolume:100,takerBuyQuoteVolume:50});
const btc=Array.from({length:30},(_,i)=>bar(i,i<25?100:100-(i-24)*.12));
for(const r of btc.slice(25)){r.quoteVolume=300;r.takerBuyQuoteVolume=90;}
const alt=Array.from({length:30},(_,i)=>bar(i));
Object.assign(alt[29],{open:99.9,high:100.1,low:99.2,close:99.4,takerBuyQuoteVolume:30});
let now=alt.at(-1).closeTime+2;
assert.equal(wickClosedRows(alt,now).length,30);
assert.ok(btcCrashContext(btc,alt[29].closeTime));
assert.equal(btcCrashContext(btc.map(r=>({...r,close:100,open:100,high:100.02,low:99.98})),now),null);
const slow=Array.from({length:31},(_,i)=>({...bar(i,i===0?100.3:i<26?100:100-(i-25)*.07),
  high:(i===0?100.3:i<26?100:100-(i-25)*.07)+.08,
  low:(i===0?100.3:i<26?100:100-(i-25)*.07)-.08,
  quoteVolume:i<26?100:125,takerBuyQuoteVolume:i<26?50:37.5}));
assert.equal(btcCrashContext(slow,slow.at(-1).closeTime).mode,'CONTINUED_SELL');
assert.equal(btcCrashContext(slow.map(r=>({...r,takerBuyQuoteVolume:r.quoteVolume*.5})),slow.at(-1).closeTime),null,'mere pullback without sell pressure');
assert.equal(evaluateWickEpisode(alt,29,btc).status,'WAIT_CONFIRM');
const recovery={...bar(30),open:99.4,high:100.3,low:99.25,close:100.15,takerBuyQuoteVolume:65};
alt.push(recovery);btc.push(bar(30,99.5));now=recovery.closeTime+2;
const e=evaluateWickEpisode(alt,29,btc);
assert.equal(e.status,'CONFIRMED');assert.equal(e.pattern,'MULTI_BAR');assert.equal(e.level,99.98);
assert.equal(e.nextCandleAt,recovery.closeTime+1);assert.equal(e.confirmationRows.length,1);
const future={...bar(31),close:100.2,high:100.3};alt.push(future);btc.push(bar(31,99.6));
assert.equal(evaluateWickEpisode(alt,29,btc).confirmationRows.length,1,'no data after first confirmation');
assert.equal(wickClosedRows(alt,now).length,31,'open candle excluded');
assert.equal(wickClosedRows(alt,now+3*MIN).length,0,'stale');
assert.equal(wickClosedRows(alt.filter((_,i)=>i!==24),now).length,0,'gap');
assert.equal(wickClosedRows(alt.map((r,i)=>i===20?{...r,takerBuyQuoteVolume:101}:r),now).length,0);
assert.equal(evaluateWickEpisode([...alt.slice(0,30),{...recovery,low:99.1}],29,btc).status,'INVALIDATED');
assert.equal(evaluateWickEpisode([...alt.slice(0,30),{...recovery,high:102,close:101}],29,btc).status,'TOO_LATE');
const immediate=alt.slice(0,30);immediate[29]={...immediate[29],close:100.05,high:100.1,takerBuyQuoteVolume:65};
assert.equal(evaluateWickEpisode(immediate,29,btc).pattern,'IMMEDIATE');
const noReclaim=[...alt.slice(0,30),...[30,31,32].map(i=>({...bar(i,99.4),low:99.3,takerBuyQuoteVolume:30}))];
assert.equal(evaluateWickEpisode(noReclaim,29,btc).status,'EXPIRED');
for(const pattern of ['IMMEDIATE','MULTI_BAR']) {
  const key=btcWickKey(pattern),trade={entryAt:now,btcWickRecoveryAtEntry:{version:VERSION,source:'AT_ENTRY',status:'CONFIRMED',pattern,confirmedAt:now-1}};
  assert.equal(normalizeLiquidLiveCardKey(key),key);assert.ok(liquidLiveCardKeysOfTrade(trade).includes(key));
  assert.equal(matchLiquidLiveCardWhitelist(trade,[]).allowed,false);
  assert.equal(btcWickTradeKey({...trade,entryAt:now-5}),null);assert.equal(btcWickTradeKey({...trade,entryAt:now+3*MIN}),null);
}
assert.equal(btcWickTradeKey({}),null);assert.equal(normalizeLiquidLiveCardKey('btc-wick-recovery:FAKE'),null);
assert.equal(isBinanceCardAvgRoeEligible(4),false);assert.equal(isBinanceCardAvgRoeEligible(4.01),true);
const dir=await mkdtemp(join(tmpdir(),'btc-wick-'));
try {
  const file=join(dir,'state.json');
  await writeFile(file,JSON.stringify({version:VERSION,enabled:false,history:[{...e,id:'old-wick',symbol:'TESTUSDT',delivery:{status:'SENT'}}]}));
  const monitor=new BtcWickRecovery({file,now:()=>now,getSymbols:()=>['TESTUSDT'],getRows:()=>alt,
    pushSender:()=>{throw Error('legacy must not replay');}});
  await monitor.init();await monitor.scan();assert.equal(monitor.history[0].delivery.status,'SENT');
  assert.equal(monitor.history[0].version,VERSION);assert.equal(monitor.snapshot().legacyCount,1);
  assert.equal(monitor.snapshot().counts.CONFIRMED,undefined);assert.equal(monitor.enabled,false);
  await monitor.setEnabled(false);assert.equal(JSON.parse(await readFile(file,'utf8')).enabled,false);
  const corruptFile=join(dir,'corrupt.json');await writeFile(corruptFile,'old json');
  const corrupt=new BtcWickRecovery({file:corruptFile});await corrupt.init();await corrupt.scan();assert.ok(corrupt.error);assert.equal(await readFile(corruptFile,'utf8'),'old json');
  // Mock Web Push transport only; never use actual device subscriptions.
  const delivered=[],service=new OppositeLiquidityWebPushService({stateFile:join(dir,'push.json'),vapidFile:join(dir,'vapid.json'),now:()=>now,
    webPushImpl:{generateVAPIDKeys:()=>({publicKey:'PUBLIC_TEST',privateKey:'PRIVATE_TEST'}),setVapidDetails:()=>{},sendNotification:async(s,p,o)=>delivered.push({p:JSON.parse(p),o})}});
  await service.publicConfig();await service.subscribe({endpoint:'https://push.example.test/device',keys:{p256dh:'A'.repeat(88),auth:'B'.repeat(24)}});
  const payload=wickPushPayload({...e,id:'test-event',symbol:'TESTUSDT'},now);
  assert.equal((await service.sendPayload(payload)).sent,1);assert.equal(delivered[0].o.TTL,120);
  assert.equal((await service.sendPayload(payload)).deduped,true);
  assert.equal((await service.sendPayload({...payload,eventId:'expired',expiresAt:now-1})).error,'EXPIRED_WICK_ALERT');
  const handlers={},shown=[];
  vm.runInNewContext(await readFile('public/opposite-liquidity-push-sw.js','utf8'),{Date:{now:()=>now},URL,self:{addEventListener:(k,f)=>handlers[k]=f,registration:{showNotification:(t,p)=>{shown.push({t,p});return Promise.resolve();}}}});
  handlers.push({data:{json:()=>payload},waitUntil:()=>{}});assert.equal(shown.length,1);assert.equal(shown[0].p.data.url,payload.url);
  handlers.push({data:{json:()=>({...payload,expiresAt:now-1})},waitUntil:()=>{}});assert.equal(shown.length,1);
}finally{await rm(dir,{recursive:true,force:true});}
console.log('PASS legacy BTC wick: causal V1 shapes/keys retained, history isolated/no replay, mock legacy push/SW; new runtime tested separately.');
