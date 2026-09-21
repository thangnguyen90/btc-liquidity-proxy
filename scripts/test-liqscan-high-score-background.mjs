#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LIQ_SCAN_HIGH_SCORE_BACKGROUND_VERSION,
  buildBackgroundLiqScanAnalysis,
  scanLiqScanHighScoreBackground,
} from '../src/liqScanHighScoreBackground.js';

const interval=15*60_000;
const now=Date.UTC(2026,8,18,12,0,10);
const currentOpen=Math.floor(now/interval)*interval;
const rows=Array.from({length:60},(_,index)=>({
  openTime:currentOpen-(59-index)*interval,
  closeTime:currentOpen-(59-index)*interval+interval-1,
  open:100,high:101,low:99,close:100,volume:1000,quoteVolume:100000,
  takerBuyQuoteVolume:50000,
}));
const heatmapBuilder=({currentPrice})=>{
  if(currentPrice===100)return {liquidityAbove:84_500_000,liquidityBelow:15_500_000,bias:.69};
  if(currentPrice===200)return {liquidityAbove:82_000_000,liquidityBelow:18_000_000,bias:.64};
  return {liquidityAbove:500_000,liquidityBelow:99_500_000,bias:-.99};
};

const exact65=buildBackgroundLiqScanAnalysis({
  row:{symbol:'EXACTUSDT',markPrice:100,quoteVolume:10_000_000},
  klines:rows,now,heatmapBuilder:()=>({liquidityAbove:82_500_000,liquidityBelow:17_500_000,bias:.65}),
});
assert.equal(exact65.liqScan.imbalanceScore,65);
assert.equal(exact65.freshness.binance,'BACKGROUND_CACHE_LIVE');
assert.deepEqual(exact65.backgroundCandle,{
  openTime:currentOpen,closeTime:currentOpen+interval-1,high:101,low:99,close:100,
});

const snapshot=[
  {symbol:'AUSDT',markPrice:100,quoteVolume:20_000_000,change24hPct:1},
  {symbol:'BUSDT',markPrice:200,quoteVolume:10_000_000,change24hPct:-1},
  {symbol:'CUSDT',markPrice:300,quoteVolume:30_000_000,change24hPct:-5},
];
const cache={
  getIfCached:()=>rows,
  liveCoverage:()=>({live:1,ticked:1,newestTickAgeMs:1000}),
};
const notified=[];
const result=await scanLiqScanHighScoreBackground({
  snapshot,snapshotAt:now-1000,cache,now,maxSymbols:2,minBars:60,alertDelayMs:0,heatmapBuilder,
  notify:async analysis=>{notified.push(analysis);return {sent:analysis.liqScan.imbalanceScore>=65?1:0};},
});
assert.equal(result.version,LIQ_SCAN_HIGH_SCORE_BACKGROUND_VERSION);
assert.deepEqual(notified.map(item=>item.symbol),['CUSDT','AUSDT'],'top quote-volume selection is deterministic');
assert.deepEqual(notified.map(item=>item.liqScan.imbalanceScore),[99,69]);
assert.deepEqual([result.selected,result.processed,result.active,result.sent,result.failed],[2,2,2,2,0]);

const staleSnapshot=await scanLiqScanHighScoreBackground({
  snapshot,snapshotAt:now-90_001,cache,notify:async()=>({sent:1}),now,heatmapBuilder,
});
assert.equal(staleSnapshot.skipped,'SNAPSHOT_STALE_OR_INVALID');
const staleCache=await scanLiqScanHighScoreBackground({
  snapshot,snapshotAt:now,cache:{...cache,liveCoverage:()=>({live:1,ticked:1,newestTickAgeMs:90_001})},
  notify:async()=>({sent:1}),now,heatmapBuilder,
});
assert.equal(staleCache.processed,0);assert.equal(staleCache.staleCache,3);
const gapRows=structuredClone(rows);gapRows[30].openTime+=interval;gapRows[30].closeTime+=interval;
assert.equal(buildBackgroundLiqScanAnalysis({
  row:snapshot[0],klines:gapRows,now,heatmapBuilder,
}),null,'a kline gap fails closed');

console.log('LiqScan background Top-400 PASS: cache-only 15m, score-65 watchlist, live candle baseline, volume ranking, freshness and gap guards.');
