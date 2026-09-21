import assert from 'node:assert/strict';
import {buildEma99Context,emaFrameContext,ema99ContextEmbed,enrichFiveMinuteEma99Context} from '../src/ema99Context.js';
import {ema99PullbackLongPayload} from '../src/ema99PullbackLong.js';
import {postPumpEma99Payload} from '../src/postPumpEma99Retest.js';
const asOf=Date.UTC(2026,8,9,0,15)-1;
function bars(interval,fn) {
  const duration=interval==='5m'?300000:interval==='15m'?900000:interval==='1h'?3600000:14400000;
  return Array.from({length:240},(_,i)=>({openTime:asOf+1-(240-i)*duration,
    closeTime:asOf-(239-i)*duration,close:fn(i)}));
}
const event={interval:'15m',side:'LONG',closed:true,candleCloseAt:asOf};
const rows={'5m':bars('5m',i=>200-i*.1),'15m':bars('15m',i=>100+i*.1),
  '1h':bars('1h',i=>100+i*.2),'4h':bars('4h',i=>80+i*.1)};
const established=buildEma99Context(event,rows,asOf+1000);
assert.equal(established.kind,'PULLBACK_ESTABLISHED');
assert.equal(established.frames['5m'].order,'EMA13 < EMA25 < EMA99');
assert.equal(ema99ContextEmbed(established).color,0x06b6d4);
assert.equal(established.higherTimeframe.direction,'BULLISH');
assert.equal(established.higherTimeframe.alignment,'ALIGNED');
const htfEmbed=ema99ContextEmbed(established,{includeHigherTimeframes:true});
assert.deepEqual(htfEmbed.fields.map(field=>field.name.split(' · ')[0]),['5m','15m','1h','4h']);
assert.match(htfEmbed.description,/1h \+ 4h ĐỒNG THUẬN TĂNG/);
assert.match(htfEmbed.fields[2].value,/EMA99 .* \/ 3 nến/);
const shortContext=buildEma99Context({...event,side:'SHORT'},rows,asOf+1000);
assert.equal(shortContext.higherTimeframe.alignment,'AGAINST');
assert.match(ema99ContextEmbed(shortContext,{includeHigherTimeframes:true}).title,/^SHORT/);
const transition=buildEma99Context(event,{...rows,'5m':bars('5m',()=>100)},asOf+1000);
assert.equal(transition.kind,'TRANSITION');assert.equal(ema99ContextEmbed(transition).color,0xa855f7);
const crossed=bars('15m',i=>i===239?100:100+i*.1);
assert.equal(emaFrameContext(crossed,'15m',asOf).cross,'DOWN');
assert.equal(buildEma99Context(event,{...rows,'15m':crossed},asOf+1000).kind,'TRANSITION');
assert.match(ema99ContextEmbed(buildEma99Context(event,{...rows,'15m':crossed},asOf+1000)).fields[1].value,/VỪA CẮT XUỐNG/);
// A later candle, including its final OHLC, cannot change an earlier snapshot.
const future={openTime:asOf+1,closeTime:asOf+300000,close:10000};
assert.deepEqual(buildEma99Context(event,{...rows,'5m':[...rows['5m'],future]},asOf+600000),established);
const live=buildEma99Context({...event,closed:false,candleCloseAt:asOf+900000},rows,asOf+1000);
assert.equal(live.usesPreviousClosedBar,true);assert.equal(live.frames['15m'].closeTime,asOf);
// A 5m event between 15m closes uses the last finished 15m candle.
assert.equal(buildEma99Context({...event,interval:'5m',candleCloseAt:asOf+300000},rows,asOf+300001).frames['15m'].closeTime,asOf);
assert.equal(buildEma99Context({...event,candleCloseAt:asOf+900000},rows,asOf+900001).kind,'UNAVAILABLE');
assert.equal(buildEma99Context(event,{'5m':rows['5m']},asOf+1000).kind,'UNAVAILABLE');
assert.equal(emaFrameContext(rows['5m'].slice(0,99),'5m',asOf).available,false);
assert.equal(emaFrameContext(rows['5m'].filter((_,i)=>i!==120),'5m',asOf).available,false);
assert.equal(emaFrameContext(rows['5m'].map((r,i)=>i===120?{...r,close:NaN}:r),'5m',asOf).available,false);
assert.equal(ema99ContextEmbed(null),null);
const cacheRows={'5m':rows['5m'],'15m':rows['15m']};
const seeded=[];
const cache={
  getIfCached:(_symbol,interval,limit)=>(cacheRows[interval]??[]).slice(-limit),
  needsRefresh:(_symbols,interval,minBars)=>[(cacheRows[interval]?.length??0)<minBars?'TESTUSDT':null].filter(Boolean),
  async seed(_symbols,interval){seeded.push(interval);cacheRows[interval]=rows[interval];},
};
const enriched=await enrichFiveMinuteEma99Context({...event,symbol:'TESTUSDT',interval:'5m'},cache,asOf+1000);
assert.deepEqual(seeded,['1h','4h']);
assert.equal(enriched.emaContext.frames['1h'].available,true);
assert.equal(enriched.emaContext.frames['4h'].available,true);
assert.equal(await enrichFiveMinuteEma99Context({...event,symbol:'TESTUSDT'},cache,asOf+1000).then(v=>v.emaContext),undefined,
  '15m event remains on the existing Discord path');
const base={...event,symbol:'TESTUSDT',stage:'NEAR_RECLAIM_LONG_WATCH',generatedAt:new Date(asOf+1).toISOString(),candleAt:asOf-899999};
assert.equal(ema99PullbackLongPayload(base).embeds.length,1,'legacy event still renders');
const rendered=ema99PullbackLongPayload({...base,emaContext:established});
assert.equal(rendered.embeds.length,2);assert.equal(rendered.embeds[0].color,0x3b82f6);
assert.deepEqual(rendered.allowed_mentions.parse,[]);
assert.ok(rendered.embeds[1].fields.every(f=>f.value.length<=1024));
const rendered5m=ema99PullbackLongPayload({...base,interval:'5m',emaContext:established});
assert.equal(rendered5m.embeds[1].fields.length,4,'5m Discord gets 1h/4h context');
const renderedShort=postPumpEma99Payload({...base,interval:'5m',side:'SHORT',stage:'TOUCH_WATCH',
  emaContext:shortContext});
assert.equal(renderedShort.embeds.at(-1).fields.length,4,'SHORT 5m Discord also gets 1h/4h context');
assert.match(renderedShort.embeds.at(-1).title,/^SHORT/);
console.log('EMA context passed: timing, cross, two palettes, incomplete/stale data, legacy Discord. No live sends/orders.');
