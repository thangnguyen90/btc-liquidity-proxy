#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LIQ_SCAN_LARGE_VOLUME_THRESHOLD_USDT,
  LIQ_SCAN_MAIN_KILL_SHORT_MAX_SWEEP_DEPTH_PCT,
  LIQ_SCAN_MAIN_KILL_SWEEP_VERSION,
  LIQ_SCAN_REFERENCE_SWEEP_VERSION,
  LiqScanMainKillSweepTracker,
  LiqScanReferenceSweepTracker,
  buildLiqScanMainKillSweepPayload,
  classifyMainKillSweepVolume,
  collectLiqScanMainKillSweepEvent,
  collectLiqScanSweepDiscordEvent,
  deliverLiqScanSweepDiscord,
  sweptSideLiquidityProxy,
  LIQ_SCAN_SWEEP_DISCORD_MIN_SIDE_PROXY,
  isLargeVolumeLiqScanSweepEvent,
} from '../src/liqScanMainKillSweep.js';

let now=Date.UTC(2026,8,18,14,0,0);
const tracker=new LiqScanMainKillSweepTracker({now:()=>now,cooldownMs:60_000});
const row=({symbol='UPUSDT',side='UP',score=77,mark=99,low=100,high=101,candleHigh=99.5,candleLow=98.5,zoneLiquidity=12_000_000}={})=>({
  symbol,generatedAt:new Date(now).toISOString(),
  market:{markPrice:mark},
  backgroundCandle:{openTime:now-10_000,closeTime:now+890_000,high:candleHigh,low:candleLow,close:mark},
  liqScan:{imbalanceScore:score,liquidityAbove:77_000_000,liquidityBelow:23_000_000,
    killZoneCluster:{side,mainKillZone:{low,high,score:zoneLiquidity}}},
});

assert.equal(tracker.observe(row()),null,'first observation only arms an untouched upper zone');
now+=30_000;
assert.equal(tracker.observe(row({mark:100.2,candleHigh:100.5})),null,'entering but not clearing the full zone is not a sweep');
now+=30_000;
const upper=tracker.observe(row({score:61,mark:100.8,candleHigh:101.2}));
assert.equal(upper.version,LIQ_SCAN_MAIN_KILL_SWEEP_VERSION);
assert.equal(upper.side,'UPPER');
assert.equal(upper.zone.high,101);
assert.equal(upper.crossingExtreme,101.2);
assert.equal(upper.sweepDepthPct,0.198);
assert.equal(upper.rejection.confirmed,false);
assert.equal(upper.execution.binanceEligible,false,'UPPER cannot trade before returning below the swept zone');
assert.equal(upper.scoreAtArm,77,'the score is frozen causally when the zone is armed');
assert.equal(upper.scoreNow,61,'a recomputed score drop after arming does not erase a real sweep');
assert.equal(upper.zone.liquidity,12_000_000);
assert.equal(upper.volumeTier.key,'VERY_LARGE');
assert.equal(upper.zoneSharePct,15.6);
assert.equal(tracker.observe(row({score:61,mark:100.7,candleHigh:101.3})),upper,'pending delivery is retried without rebuilding the event');
tracker.acknowledge(upper);
assert.equal(tracker.observe(row({mark:100.7,candleHigh:101.4})),null,'acknowledged zone enters cooldown');

const lowerTracker=new LiqScanMainKillSweepTracker({now:()=>now});
assert.equal(lowerTracker.observe(row({symbol:'DOWNUSDT',side:'DOWN',mark:103,low:101,high:102,candleHigh:104,candleLow:102.2})),null);
now+=30_000;
const lower=lowerTracker.observe(row({symbol:'DOWNUSDT',side:'DOWN',mark:101.2,low:101,high:102,candleHigh:103,candleLow:100.8}));
assert.equal(lower.side,'LOWER');
assert.equal(lower.crossingExtreme,100.8);

const replayGuard=new LiqScanMainKillSweepTracker({now:()=>now});
assert.equal(replayGuard.observe(row({symbol:'OLDUSDT',mark:99,candleHigh:102})),null);
now+=30_000;
assert.equal(replayGuard.observe(row({symbol:'OLDUSDT',mark:99,candleHigh:102})),null,'an old wick present at startup is never replayed');
assert.equal(replayGuard.observe(row({symbol:'LOWUSDT',score:64})),null);
now+=30_000;
assert.equal(replayGuard.observe(row({symbol:'LOWUSDT',score:64,mark:102,candleHigh:102})),null,'score below 65 never arms the zone');

assert.equal(collectLiqScanMainKillSweepEvent(upper),upper);
assert.equal(collectLiqScanMainKillSweepEvent({...upper,version:'OLD'}),null);
const payload=buildLiqScanMainKillSweepPayload(upper);
assert.match(payload.embeds[0].title,/RẤT LỚN.*QUÉT XONG MAIN KILL TRÊN/);
assert.match(payload.embeds[0].description,/không tự đặt lệnh Binance/);
assert.match(payload.embeds[0].description,/12\.00M proxy/);
assert.match(payload.embeds[0].fields[0].value,/15\.6%/);
assert.match(payload.embeds[0].fields[3].value,/không replay râu nến cũ/);
assert.equal(classifyMainKillSweepVolume(60_000_000,100_000_000).key,'EXTREME');
assert.equal(classifyMainKillSweepVolume(2_000_000,10_000_000).key,'LARGE');
assert.equal(classifyMainKillSweepVolume(500_000,10_000_000).bar,'████░░░░░░');
assert.equal(LIQ_SCAN_MAIN_KILL_SHORT_MAX_SWEEP_DEPTH_PCT,0.1);
assert.equal(LIQ_SCAN_LARGE_VOLUME_THRESHOLD_USDT,2_000_000);
assert.equal(isLargeVolumeLiqScanSweepEvent(upper),true,'large/very-large MAIN KILL goes to the dedicated webhook');
assert.equal(isLargeVolumeLiqScanSweepEvent({
  zone:{liquidity:1_999_999},
  volumeTier:classifyMainKillSweepVolume(1_999_999,10_000_000),
}),false,'smaller MAIN KILL remains on the existing webhook');
const extremePayload=buildLiqScanMainKillSweepPayload({
  ...upper,
  sweepDepthPct:0.08,
  rejection:{confirmed:true,returnedBeyondZone:true,closedBeyondZone:false,
    confirmationType:'LIVE_MARK_BEYOND_ZONE'},
  zone:{...upper.zone,liquidity:60_000_000},
  volumeTier:classifyMainKillSweepVolume(60_000_000,77_000_000),
  binanceExecution:{status:'SUBMITTED',side:'SHORT',marginUsdt:1,leverage:5,takeProfitRoePct:10,stopLossRoePct:30},
});
assert.match(extremePayload.embeds[0].title,/SIÊU LỚN/);
assert.match(extremePayload.embeds[0].description,/BINANCE THẬT.*SHORT MARKET 1 USDT margin ×5/);
assert.match(extremePayload.embeds[0].fields[2].value,/0\.080%.*ĐÃ XÁC NHẬN/s);
const noRejectPayload=buildLiqScanMainKillSweepPayload({
  ...upper,
  zone:{...upper.zone,liquidity:60_000_000},
  volumeTier:classifyMainKillSweepVolume(60_000_000,77_000_000),
  binanceExecution:{status:'observe-only-zone-not-rejected',recentBidirectional3d:false},
});
assert.match(noRejectPayload.embeds[0].description,/SHORT chưa xác nhận rút xuống dưới đáy vùng quét/);
const deepPayload=buildLiqScanMainKillSweepPayload({
  ...upper,sweepDepthPct:0.101,
  zone:{...upper.zone,liquidity:60_000_000},
  volumeTier:classifyMainKillSweepVolume(60_000_000,77_000_000),
  rejection:{confirmed:true,confirmationType:'LIVE_MARK_BEYOND_ZONE'},
  binanceExecution:{status:'observe-only-deep-sweep',recentBidirectional3d:false},
});
assert.match(deepPayload.embeds[0].description,/0\.101% vượt trần 0\.10%/);
const twoWayPayload=buildLiqScanMainKillSweepPayload({
  ...lower,
  zone:{...lower.zone,liquidity:60_000_000},
  volumeTier:classifyMainKillSweepVolume(60_000_000,77_000_000),
  binanceExecution:{status:'observe-only-bidirectional-3d',recentBidirectional3d:true},
});
assert.match(twoWayPayload.embeds[0].description,/cả LONG và SHORT trong 3 ngày/);

const referenceTracker=new LiqScanReferenceSweepTracker({now:()=>now,cooldownMs:60_000});
const referenceRow=({mark=0.00970,candleHigh=0.00975,targetPrice=0.00979229,targetScore=5_400_000,score=61}={})=>({
  symbol:'ESPORTSUSDT',generatedAt:new Date(now).toISOString(),
  market:{markPrice:mark},
  backgroundCandle:{openTime:now-10_000,closeTime:now+890_000,high:candleHigh,low:0.00960,close:mark},
  liqScan:{imbalanceScore:score,liquidityAbove:587_770_000,liquidityBelow:142_680_000,
    sweepTarget:{side:'ABOVE',price:targetPrice,distancePct:0.3,score:targetScore}},
});
assert.equal(referenceTracker.observe(referenceRow()),null,'large reference proxy only arms before price crosses it');
now+=30_000;
const referenceEvent=referenceTracker.observe(referenceRow({mark:0.00980,candleHigh:0.00981}));
assert.equal(referenceEvent.version,LIQ_SCAN_REFERENCE_SWEEP_VERSION);
assert.equal(referenceEvent.zoneType,'REFERENCE_PROXY');
assert.equal(referenceEvent.observeOnly,true);
assert.equal(referenceEvent.execution.binanceEligible,false);
assert.equal(referenceEvent.zone.liquidity,5_400_000,'tier uses target-zone proxy volume, not total side liquidity');
assert.equal(referenceEvent.scoreAtArm,61,'reference sweep is allowed below imbalance score 65');
assert.equal(referenceEvent.volumeTier.key,'LARGE');
assert.equal(isLargeVolumeLiqScanSweepEvent(referenceEvent),true);
assert.equal(collectLiqScanMainKillSweepEvent(referenceEvent),referenceEvent);
const referencePayload=buildLiqScanMainKillSweepPayload(referenceEvent);
assert.match(referencePayload.embeds[0].title,/QUÉT XONG VÙNG PROXY THAM KHẢO TRÊN/);
assert.match(referencePayload.embeds[0].description,/OBSERVE ONLY.*không tự đặt lệnh Binance/);
assert.match(referencePayload.embeds[0].fields[0].name,/LỰC VÙNG PROXY/);
assert.match(referencePayload.embeds[0].fields[3].value,/587\.77M proxy.*142\.68M proxy/s);
referenceTracker.acknowledge(referenceEvent);
assert.equal(referenceTracker.observe(referenceRow({mark:0.00981,candleHigh:0.00982})),null,'reference event enters cooldown after delivery');

const smallReferenceTracker=new LiqScanReferenceSweepTracker({now:()=>now});
assert.equal(smallReferenceTracker.observe(referenceRow({targetScore:1_999_999})),null);
now+=30_000;
assert.equal(smallReferenceTracker.observe(referenceRow({mark:0.00980,candleHigh:0.00981,targetScore:1_999_999})),null,
  'reference proxy below the large threshold is intentionally ignored');

assert.equal(LIQ_SCAN_SWEEP_DISCORD_MIN_SIDE_PROXY,100_000_000);
for(const sample of [upper,lower,referenceEvent,{...referenceEvent,side:'LOWER'}]) {
  const key=sample.side==='UPPER'?'above':'below';
  for(const amount of [undefined,null,'',NaN,Infinity,-1,99_999_999,100_000_000]) {
    const event={...sample,zone:{...sample.zone,liquidity:900_000_000},
      liquidityAbove:5_000_000_000,liquidityBelow:5_000_000_000,
      liquidityAtSweep:{above:2_000_000_000,below:2_000_000_000,[key]:amount}};
    assert.equal(collectLiqScanSweepDiscordEvent(event),null,'only swept-side current proxy, never zone/other side/sum/old fallback');
    let ack=0;
    const result=await deliverLiqScanSweepDiscord(event,{notify:async()=>{throw new Error('must not post');}},
      {acknowledge:()=>ack++});
    assert.equal(result.sent,0);assert.equal(result.filtered,true);assert.equal(ack,1);
  }
  const eligible={...sample,zone:{...sample.zone,liquidity:2_000_000},
    liquidityAbove:1,liquidityBelow:1,liquidityAtSweep:{above:0,below:0,[key]:100_000_001}};
  assert.equal(collectLiqScanSweepDiscordEvent(eligible),eligible,'small zone can pass with >100M same-side total');
  let posts=0,ack=0;
  await deliverLiqScanSweepDiscord(eligible,{notify:async()=>{posts++;return {sent:1};}}, {acknowledge:()=>ack++});
  assert.equal(posts,1);assert.equal(ack,1);
  ack=0;
  await deliverLiqScanSweepDiscord(eligible,{notify:async()=>({sent:0,reason:'backoff'})},{acknowledge:()=>ack++});
  assert.equal(ack,0);
  await assert.rejects(deliverLiqScanSweepDiscord(eligible,{notify:async()=>{throw new Error('HTTP 500');}},
    {acknowledge:()=>ack++}),/HTTP 500/);
  assert.equal(ack,0,'failed send still pending');
}
assert.equal(sweptSideLiquidityProxy({...upper,liquidityAtSweep:undefined,liquidityAbove:1160000000}),1160000000,'old JSON compatible');
assert.equal(sweptSideLiquidityProxy({...lower,liquidityAtSweep:undefined,liquidityBelow:281890000}),281890000);
assert.equal(sweptSideLiquidityProxy({...upper,side:'INVALID'}),null);
assert.equal(collectLiqScanMainKillSweepEvent(upper),upper,'raw event remains available for Discord even when Binance filter rejects it');
assert.equal(collectLiqScanSweepDiscordEvent({...upper,version:'OLD',liquidityAbove:1e9}),null);
// The totals at the crossing must not accidentally remain frozen at arm time.
const currentTracker=new LiqScanMainKillSweepTracker({now:()=>now});
currentTracker.observe(row({symbol:'CURRENTUSDT'}));
now+=30_000;
const crossed=row({symbol:'CURRENTUSDT',mark:102,candleHigh:102});
crossed.liqScan.liquidityAbove=1_160_000_000;
const currentEvent=currentTracker.observe(crossed);
assert.equal(currentEvent.liquidityAbove,77_000_000);
assert.equal(sweptSideLiquidityProxy(currentEvent),1_160_000_000);
assert.equal(collectLiqScanSweepDiscordEvent(currentEvent),currentEvent);
assert.match(buildLiqScanMainKillSweepPayload(currentEvent).embeds[0].fields[4].value,/1\.16B proxy/);
console.log('LiqScan sweep PASS: current proxy, SHORT rejection/depth metadata, observe-only Discord reasons, old JSON, send/ack/retry and honest units.');
