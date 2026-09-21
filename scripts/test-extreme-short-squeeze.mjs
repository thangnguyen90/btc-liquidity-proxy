import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {detectExtremeShortSqueeze as detect,extremeShortSqueezeEvent,extremeShortSqueezePayload,scanExtremeShortSqueeze} from '../src/extremeShortSqueeze.js';
import {buildExtremeShortSqueezeOrder,ExtremeShortSqueezeBinanceRunner,EXTREME_SHORT_SQUEEZE_BINANCE_VERSION} from '../src/extremeShortSqueezeBinance.js';
import {CoinHorizonDiscordNotifier} from '../src/coinHorizonDiscord.js';
for (const interval of ['5m','15m']) {
  const d=interval==='5m'?300000:900000, now=Date.UTC(2026,8,9,13,30);
  const rows=Array.from({length:30},(_,i)=>({openTime:now-(30-i)*d,closeTime:now-(29-i)*d-1,
    open:100,high:101,low:99,close:100,volume:1000,quoteVolume:100000}));
  Object.assign(rows.at(-1),{open:100,high:132,low:99,close:129,volume:5000,quoteVolume:600000});
  const opts={symbol:'测试USDT',interval,now},event=detect(rows,opts).at(-1);
  assert.equal(event.stage,'EXTREME_PUMP_CLOSED');assert.equal(event.volumeRatio,5);
  assert.equal(event.binanceEligible,interval==='5m');assert.equal(event.observeOnly,interval!=='5m');
  assert.equal(event.atr,2);assert.equal(event.spikeAtr,16,'baseline excludes current spike');
  const reject=structuredClone(rows);reject.at(-1).close=103;
  const rejected=detect(reject,opts).at(-1);assert.equal(rejected.stage,'UPPER_REJECTION_CLOSED');
  const both=structuredClone(reject);both.at(-1).low=90;
  assert.equal(detect(both,opts).at(-1).stage,'TWO_SIDE_SWEEP_CLOSED');
  for (const patch of [{high:107,close:106},{volume:2000},{quoteVolume:99999},{high:90},{low:0},{close:NaN}]) {
    const bad=structuredClone(rows);Object.assign(bad.at(-1),patch);assert.equal(detect(bad,opts).length,0);
  }
  const normal=rows.map((b,i)=>({...b,high:i===29?132:135,low:98}));assert.equal(detect(normal,opts).length,0,'must exceed recent highs');
  assert.equal(detect(rows.filter((_,i)=>i!==15),opts).length,0,'missing candle');
  assert.equal(detect(rows,{...opts,now:now+90001}).length,0,'stale closed candle');
  const liveNow=now-d+60000;
  assert.equal(detect(rows,{...opts,now:liveNow}).length,0,'intrabar requires fresh per-symbol websocket tick');
  assert.equal(detect(rows,{...opts,now:liveNow,liveUpdatedAt:liveNow-30001}).length,0);
  const live=detect(rows,{...opts,now:liveNow,liveUpdatedAt:liveNow}).at(-1);
  assert.equal(live.stage,'EXTREME_PUMP_LIVE');assert.ok(extremeShortSqueezeEvent(live,liveNow));
  const peakRows=structuredClone(rows);Object.assign(peakRows.at(-1),{open:100,high:110,low:100,close:108,volume:5000,quoteVolume:550000});
  assert.equal(detect(peakRows,{...opts,now:liveNow,liveUpdatedAt:liveNow,peakStableMs:14999})
    .some(e=>e.kind==='PEAK_ZONE_SHORT_WATCH'),false,'peak high must remain unchanged for 15 seconds');
  const peak=detect(peakRows,{...opts,now:liveNow,liveUpdatedAt:liveNow,peakStableMs:15000})
    .find(e=>e.kind==='PEAK_ZONE_SHORT_WATCH');
  assert.ok(peak);assert.equal(peak.stage,'PEAK_ZONE_SHORT_WATCH_LIVE');assert.ok(extremeShortSqueezeEvent(peak,liveNow));
  assert.equal(peak.binanceEligible,interval==='5m');assert.equal(peak.observeOnly,interval!=='5m');
  assert.equal(peak.retracePct,20);assert.ok(peak.distanceFromHighPct<2.01);assert.equal(peak.peakStableMs,15000);
  assert.equal(extremeShortSqueezeEvent(live,now+1),null,'queued LIVE cannot send after candle closes');
  assert.equal(extremeShortSqueezeEvent(event,now+90001),null);
  assert.equal(extremeShortSqueezeEvent({...event,observedAt:now+1000},now),null);
  const follow={openTime:now,closeTime:now+d-1,open:129,high:130,low:90,close:102,volume:5000,quoteVolume:500000};
  const next=detect([...rows,follow],{...opts,now:now+d});
  assert.equal(next.at(-1).stage,'FOLLOW_TWO_SIDE_SWEEP_CLOSED');assert.equal(next.at(-1).followBars,1);
  const followReject={...follow,low:100,close:108},followLiveNow=now+60_000;
  const liveFollow=detect([...rows,followReject],{...opts,now:followLiveNow,liveUpdatedAt:followLiveNow})
    .find(e=>e.stage==='FOLLOW_REJECTION_LIVE');
  assert.ok(liveFollow);assert.ok(extremeShortSqueezeEvent(liveFollow,followLiveNow));
  assert.equal(liveFollow.binanceEligible,interval==='5m');assert.equal(liveFollow.observeOnly,interval!=='5m');
  const liveFollowPlan=buildExtremeShortSqueezeOrder(liveFollow,{now:followLiveNow,
    enabledAt:new Date(now-30_000).toISOString(),markPrice:liveFollow.price});
  if(interval==='5m') {
    assert.equal(liveFollowPlan.signalLabel,'FOLLOW_REJECTION_LIVE');assert.equal(liveFollowPlan.notionalUsdt,5);
    assert.equal(buildExtremeShortSqueezeOrder(liveFollow,{now:followLiveNow,
      enabledAt:new Date(now+1).toISOString(),markPrice:liveFollow.price}),null,'live candle opened before enabledAt is blocked');
    assert.equal(buildExtremeShortSqueezeOrder({...liveFollow,liveUpdatedAt:followLiveNow-30_001},{now:followLiveNow,
      enabledAt:new Date(now-30_000).toISOString(),markPrice:liveFollow.price}),null,'stale live tick blocked');
  } else assert.equal(liveFollowPlan,null,'15m live follow remains observe-only');
  const extended=[...rows,follow,{...follow,openTime:now+d,closeTime:now+2*d-1}];
  assert.equal(detect(extended,{...opts,now:now+2*d}).length,0,'never renew old follow confirmation');
  const continuing={...follow,high:140,low:100,close:103};
  assert.equal(detect([...rows,continuing],{...opts,now:now+d}).some(e=>e.kind==='FOLLOW_REJECTION'),false);
  const fallback=structuredClone(rows);delete fallback.at(-1).quoteVolume;
  assert.equal(detect(fallback,opts).at(-1).quoteEstimated,true);
  assert.equal(detect(fallback,opts).at(-1).quoteVolume,495000);
  const payload=extremeShortSqueezePayload(event);assert.deepEqual(payload.allowed_mentions.parse,[]);
  assert.ok(payload.embeds[0].fields.every(f=>f.value.length<=1024));
  assert.match(payload.embeds[0].description,interval==='5m'?/\$1 margin × 5x/:/không tự đặt lệnh Binance/);
  assert.equal(payload.embeds[0].color,0xf59e0b);assert.equal(extremeShortSqueezePayload(rejected).embeds[0].color,0xef4444);
  const peakPayload=extremeShortSqueezePayload(peak);assert.equal(peakPayload.embeds[0].color,0xff7a00);
  assert.match(peakPayload.embeds[0].description,interval==='5m'?/\$2 margin × 5x/:/không tự đặt lệnh Binance/);
  const peakPlan=buildExtremeShortSqueezeOrder(peak,{now:liveNow,enabledAt:new Date(peak.evaluatedCandleAt-1000).toISOString(),markPrice:peak.price});
  if(interval==='5m'){
    assert.equal(peakPlan.signalLabel,'PEAK_ZONE_SHORT_WATCH');assert.equal(peakPlan.marginUsdt,2);
    assert.equal(peakPlan.notionalUsdt,10);assert.equal(peakPlan.leverage,5);
    assert.equal(peakPlan.takeProfitDistanceFraction,.03);assert.equal(peakPlan.stopLossDistanceFraction,.06);
    const configuredPeakPlan=buildExtremeShortSqueezeOrder(peak,{now:liveNow,
      enabledAt:new Date(peak.evaluatedCandleAt-1000).toISOString(),markPrice:peak.price,
      routeState:{marginUsdt:4.5,leverage:9,takeProfitRoePct:18}});
    assert.equal(configuredPeakPlan.marginUsdt,4.5);assert.equal(configuredPeakPlan.leverage,9);
    assert.equal(configuredPeakPlan.notionalUsdt,40.5);assert.equal(configuredPeakPlan.takeProfitRoePct,18);
    assert.equal(configuredPeakPlan.takeProfitDistanceFraction,.02);
    assert.ok(Math.abs(configuredPeakPlan.stopLossDistanceFraction-(.30/9))<1e-12);
  }else assert.equal(peakPlan,null,'15m peak-zone remains observe-only');
  const plan=buildExtremeShortSqueezeOrder(event,{now,enabledAt:new Date(now-d-30_000).toISOString(),markPrice:event.price});
  if(interval==='5m') {
    assert.equal(plan.source,'extreme-short-squeeze');assert.equal(plan.side,'SELL');assert.equal(plan.orderType,'MARKET');
    assert.equal(plan.marginUsdt,1);assert.equal(plan.notionalUsdt,5);assert.equal(plan.leverage,5);
    assert.equal(plan.takeProfitRoePct,15);assert.equal(plan.takeProfitDistanceFraction,.03);assert.equal(plan.stopLossDistanceFraction,.06);
    assert.equal(plan.fillAnchorVersion,EXTREME_SHORT_SQUEEZE_BINANCE_VERSION);
    assert.equal(buildExtremeShortSqueezeOrder(event,{now,enabledAt:new Date(now+1).toISOString(),markPrice:event.price}),null,'pre-enable event blocked');
    assert.equal(buildExtremeShortSqueezeOrder(event,{now,enabledAt:new Date(now-d-30_000).toISOString(),markPrice:event.price*1.006}),null,'mark drift blocked');
    assert.equal(buildExtremeShortSqueezeOrder(rejected,{now,enabledAt:new Date(now-d-30_000).toISOString(),markPrice:rejected.price}),null,'rejection is not this route');
  } else assert.equal(plan,null,'15m remains observe-only');
  const dir=await mkdtemp(join(tmpdir(),'extreme-spike-')),stateFile=join(dir,'state.json');
  if(interval==='5m') {
    const route={key:JSON.stringify(['extreme-short-squeeze','extreme-short-squeeze','EXTREME_PUMP_CLOSED','SHORT'])};
    const controlState={enabled:true,routes:{[route.key]:{enabled:true,enabledAt:new Date(now-d-30_000).toISOString()}}};
    let submitted=null,asserted=0;
    const runner=new ExtremeShortSqueezeBinanceRunner({file:join(dir,'binance.json'),now:()=>now,
      controls:{register:()=>route,read:()=>controlState,assertEntry:p=>{asserted++;assert.equal(p.notionalUsdt,5);}},
      getContext:async()=>({enabled:true,positions:[],openOrders:[],markPrice:event.price}),
      submit:async p=>{submitted=p;return {status:'placed',orderResult:{orderId:123}};}});
    const placed=await runner.handle(event);assert.equal(placed.status,'placed');assert.equal(placed.orderId,123);
    assert.equal(asserted,1);assert.equal(submitted.signalEntryPrice,event.price);
    assert.equal((await runner.handle(event)).status,'deduped','same event is never submitted twice');
  }
  let clock=now,sends=0;
  const create=(fetchImpl=async()=>{sends++;return {ok:true};})=>new CoinHorizonDiscordNotifier({
    stateFile,webhookUrl:'https://discord.invalid/test',now:()=>clock,fetchImpl,
    eventBuilder:extremeShortSqueezeEvent,payloadBuilder:extremeShortSqueezePayload});
  let notifier=create();await Promise.all([notifier.notify(event),notifier.notify(event)]);assert.equal(sends,1);
  notifier=create();await notifier.notify(event);assert.equal(sends,1,'restart dedupe');
  await notifier.notify(rejected);assert.equal(sends,2,'rejection update allowed');
  clock=now+d;await notifier.notify(event);assert.equal(sends,2,'expired queue rejected');
  assert.equal(Object.keys(JSON.parse(await readFile(stateFile)).symbols).length,2);
  let calls=0;const failing=create(async()=>{calls++;return {ok:false,status:429,json:async()=>({retry_after:1})};});
  await assert.rejects(failing.notify(next.at(-1)),/HTTP 429/);await failing.notify(next.at(-1));assert.equal(calls,1,'rate limit backoff');
  const peakStages=[];const peakCache={getIfCached:(_s,i)=>i===interval?peakRows:null,
    liveCoverage:(_symbols,_interval,scanNow)=>({newestTickAt:scanNow})};
  await scanExtremeShortSqueeze(['PEAKUSDT'],peakCache,async e=>{peakStages.push(e.stage);return {sent:1};},liveNow);
  assert.equal(peakStages.includes('PEAK_ZONE_SHORT_WATCH_LIVE'),false);
  await scanExtremeShortSqueeze(['PEAKUSDT'],peakCache,async e=>{peakStages.push(e.stage);return {sent:1};},liveNow+15000);
  assert.equal(peakStages.includes('PEAK_ZONE_SHORT_WATCH_LIVE'),true,'scanner waits 15s without a higher high');
  const result=await scanExtremeShortSqueeze(['测试USDT','测试USDT'],{getIfCached:(_s,i)=>i===interval?rows:null},async()=>({sent:1}),now);
  assert.deepEqual(result,{processed:1,detected:1,sent:1,failed:0});
}

{
  const d=300000,impulseOpenAt=Date.UTC(2026,8,18,0,0,0),now=impulseOpenAt+2*d+1000;
  const base=Array.from({length:20},(_,i)=>({
    openTime:impulseOpenAt-(20-i)*d,closeTime:impulseOpenAt-(19-i)*d-1,
    open:100,high:100.1,low:99.9,close:100,volume:1000,quoteVolume:100000,
    takerBuyQuoteVolume:50000,
  }));
  const impulse={openTime:impulseOpenAt,closeTime:impulseOpenAt+d-1,
    open:100,high:107.5,low:100,close:103.4,volume:750000,quoteVolume:75000000,
    takerBuyQuoteVolume:41000000};
  const flush={openTime:impulseOpenAt+d,closeTime:impulseOpenAt+2*d-1,
    open:103.5,high:106.4,low:102.3,close:105.6,volume:250000,quoteVolume:25000000,
    takerBuyQuoteVolume:13200000};
  const rows=[...base,impulse,flush];
  const signal=detect(rows,{symbol:'BABYUSDT',interval:'5m',now})
    .find(event=>event.kind==='FIRST_PUMP_FLUSH_RECLAIM_LONG');
  assert.ok(signal,'first pump + fast absorption/reclaim must be detected after the flush candle closes');
  assert.equal(signal.stage,'FIRST_PUMP_FLUSH_RECLAIM_LONG_CLOSED');
  assert.equal(signal.side,'LONG');assert.equal(signal.observeOnly,true);assert.equal(signal.binanceEligible,false);
  assert.ok(signal.entryZoneLow>=signal.reclaimLevel&&signal.entryZoneHigh===flush.close);
  assert.equal(signal.saferConfirmationPrice,impulse.high);
  assert.ok(extremeShortSqueezeEvent(signal,now));
  assert.equal(buildExtremeShortSqueezeOrder(signal,{now,enabledAt:new Date(impulseOpenAt-1).toISOString(),markPrice:signal.price}),null,
    'Discord-only first-pump signal must never build a Binance order');
  const payload=extremeShortSqueezePayload(signal);
  assert.equal(payload.embeds[0].color,0x06b6d4,'cyan distinguishes absorption/reclaim from yellow pump and red rejection');
  assert.match(payload.embeds[0].description,/OBSERVE ONLY/);
  assert.match(payload.embeds[0].fields[0].value,/USDT/);
  assert.ok(payload.embeds[0].fields.every(field=>field.value.length<=1024));

  const brokeStructure=structuredClone(rows);Object.assign(brokeStructure.at(-1),{low:99.7,close:104.5});
  assert.equal(detect(brokeStructure,{symbol:'BABYUSDT',interval:'5m',now})
    .some(event=>event.kind==='FIRST_PUMP_FLUSH_RECLAIM_LONG'),false,'flush below impulse open invalidates the setup');
  const weakImpulse=structuredClone(rows);Object.assign(weakImpulse.at(-2),{high:104.9,close:103.4});
  assert.equal(detect(weakImpulse,{symbol:'BABYUSDT',interval:'5m',now})
    .some(event=>event.kind==='FIRST_PUMP_FLUSH_RECLAIM_LONG'),false,'initial pump must reach the 5% threshold');
  const noReclaim=structuredClone(rows);Object.assign(noReclaim.at(-1),{open:103.5,high:105,low:102.3,close:103});
  assert.equal(detect(noReclaim,{symbol:'BABYUSDT',interval:'5m',now})
    .some(event=>event.kind==='FIRST_PUMP_FLUSH_RECLAIM_LONG'),false,'weak close below reclaim is not absorption confirmation');

  const stages=[];
  const result=await scanExtremeShortSqueeze(['BABYUSDT'],{getIfCached:(_symbol,interval)=>interval==='5m'?rows:null},
    async event=>{stages.push(event.stage);return {sent:1};},now);
  assert.deepEqual(result,{processed:1,detected:1,sent:1,failed:0});
  assert.deepEqual(stages,['FIRST_PUMP_FLUSH_RECLAIM_LONG_CLOSED']);
}

console.log('Extreme squeeze: closed pump, live follow and stable near-peak 5m SHORT routes plus cyan first-pump flush/reclaim LONG Discord-only alert; freshness, dedupe and 429 passed; mock only.');
