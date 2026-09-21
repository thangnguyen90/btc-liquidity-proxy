import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {classifyLiqScanTier as classify,buildLiqScanTierPayload} from '../src/liqScanTierDiscord.js';
import {CoinHorizonDiscordNotifier} from '../src/coinHorizonDiscord.js';
const t=Date.UTC(2026,8,6),now=t+21*60000;
const a={symbol:'TESTUSDT',generatedAt:new Date(now).toISOString(),market:{markPrice:102},liqScan:{symbol:'TESTUSDT',evaluatedAt:new Date(now).toISOString(),imbalanceScore:80,totalLiquidity:100,bias:0.8,isAlert:true,dominantSide:'ABOVE'},trend:{bias:'BULLISH',frames:[{interval:'5m',atr14:2}]},recommendation:{confirmation:{breakout:'CONFIRMED_15M'},longPlan:{entryZone:{low:99,high:100},invalidation:98,targets:[106]}},
  coinglass:{available:true,combined:{liquidityBias:'UPPER_FIRST'},frames:[{range:'24h',scrapedAt:new Date(now).toISOString(),above:[{bandLow:110,bandHigh:112,price:111,attractionScore:50,effectiveAttractionScore:50,lifecycle:'FRESH'}],below:[]}]},
  liqScanCandleContext:{'15m':[{openTime:t,closeTime:t+15*60000-1,open:99,high:103,low:98,close:102}],
    '5m':[{openTime:t+15*60000,closeTime:t+20*60000-1,open:101,high:103,low:100,close:102,quoteVolume:100,takerBuyQuoteVolume:65}]}};
a.recommendation.longPlan.targets=[108];
assert.equal(classify(a,now).tier,'MARKET_READY');
for(const [score,expected] of [[39,null],[40,'WATCH'],[69,'WATCH'],[70,'MARKET_READY']]){
  const b=structuredClone(a);b.liqScan.imbalanceScore=score;assert.equal(classify(b,now)?.tier??null,expected);
}
const conflict=structuredClone(a);conflict.coinglass.combined.liquidityBias='LOWER_FIRST';assert.equal(classify(conflict,now).tier,'WATCH');
const stale=structuredClone(a);stale.liqScan.evaluatedAt=new Date(now-91000).toISOString();assert.equal(classify(stale,now),null);
const early=structuredClone(a);early.liqScanCandleContext['5m'][0].openTime=t+10*60000;assert.equal(classify(early,now).tier,'WATCH');
const noflow=structuredClone(a);delete noflow.liqScanCandleContext['5m'][0].takerBuyQuoteVolume;assert.equal(classify(noflow,now).tier,'WATCH');
const rr=structuredClone(a);rr.recommendation.longPlan.targets=[102.1];assert.equal(classify(rr,now).tier,'WATCH');
const short=structuredClone(a);short.market.markPrice=98;short.liqScan.dominantSide='BELOW';short.liqScan.bias=-0.8;short.trend.bias='BEARISH';short.recommendation={confirmation:{breakdown:'CONFIRMED_15M'},shortPlan:{entryZone:{low:100,high:101},invalidation:102,targets:[94]}};
short.coinglass.combined.liquidityBias='LOWER_FIRST';short.coinglass.frames[0].below=[{bandLow:88,bandHigh:90,price:89,attractionScore:50,effectiveAttractionScore:50,lifecycle:'FRESH'}];short.coinglass.frames[0].above=[];
Object.assign(short.liqScanCandleContext['15m'][0],{open:101,high:102,low:97,close:98});Object.assign(short.liqScanCandleContext['5m'][0],{open:99,high:100,low:97,close:98,takerBuyQuoteVolume:35});
short.recommendation.shortPlan.targets=[92];
assert.equal(classify(short,now).tier,'MARKET_READY');assert.equal(classify(short,now).side,'SHORT');
const payload=buildLiqScanTierPayload(classify(short,now));assert.equal(payload.embeds[0].color,0xef4444);assert.ok(JSON.stringify(payload).includes('KHÔNG TỰ ĐẶT LỆNH'));
const directory=await mkdtemp(join(tmpdir(),'liq-tier-'));let sent=0;
const bot=new CoinHorizonDiscordNotifier({stateFile:join(directory,'state.json'),webhookUrl:'https://discord.invalid/test',now:()=>now,eventBuilder:classify,payloadBuilder:buildLiqScanTierPayload,fetchImpl:async()=>{sent++;return {ok:true};}});
const watch=structuredClone(a);watch.liqScan.imbalanceScore=40;
await bot.notify(watch);await bot.notify(watch);await bot.notify(a);assert.equal(sent,2);
console.log('LiqScan two-tier tests passed (mock sends only)');
