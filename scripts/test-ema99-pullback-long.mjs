import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {detectEma99PullbackLong as detect,ema99PullbackLongEvent,ema99PullbackLongPayload,scanEma99PullbackLong} from '../src/ema99PullbackLong.js';
import {CoinHorizonDiscordNotifier} from '../src/coinHorizonDiscord.js';
function fixture(interval) {
  const duration=interval==='5m'?300000:900000,now=Date.UTC(2026,8,7),start=now-240*duration;
  const bars=Array.from({length:240},(_,i)=>{
    const close=i<130?150:i<=145?150-(i-130)*50/15:100+(i-145)*60/93;
    return {openTime:start+i*duration,closeTime:start+(i+1)*duration-1,open:close-.3,close,high:close+.4,low:close-.6,volume:100};
  });
  let ema=150;for(let i=99;i<239;i++)ema+=.02*(bars[i].close-ema);
  Object.assign(bars.at(-1),{open:160,close:159,high:160.1,low:ema-.1,volume:220});
  return {bars,now,duration,interval};
}
for(const interval of ['5m','15m']) {
  const {bars,now,duration}=fixture(interval),opts={symbol:'TESTUSDT',interval,now};
  const event=detect(bars,opts).find(e=>e.candleAt===bars.at(-1).openTime);
  assert.equal(event.stage,'RECLAIM_LONG_WATCH');assert.equal(event.side,'LONG');assert.equal(event.observeOnly,true);
  assert.equal(event.referenceEntry,null);assert.ok(event.risePct>=8&&event.riseLegPct>=.5);
  const near=structuredClone(bars);near.at(-1).low=event.ema99*(1+event.nearLimitPct*.8/100);
  assert.equal(detect(near,opts).at(-1).stage,'NEAR_RECLAIM_LONG_WATCH');
  assert.equal(detect(near,{...opts,now:now-duration+120000}).at(-1).stage,'NEAR_EMA_LONG_WATCH');
  assert.equal(detect(bars,{...opts,now:now-duration+120000}).at(-1).stage,'TOUCH_EMA_LONG_WATCH');
  const far=structuredClone(bars);far.at(-1).low=event.ema99*(1+(event.nearLimitPct+.1)/100);
  assert.equal(detect(far,opts).length,0);
  const volume=structuredClone(bars);volume.at(-1).volume=100;assert.equal(detect(volume,opts).length,0);
  const below=structuredClone(bars);below.at(-1).close=below.at(-1).low;
  assert.equal(detect(below,opts).at(-1).stage,'CLOSED_BELOW_EMA_LONG_WAIT');
  const gap=structuredClone(bars);gap.splice(10,1);assert.equal(detect(gap,opts).length,0);
  const invalid=structuredClone(bars);invalid.at(-1).low=NaN;assert.equal(detect(invalid,opts).length,0);
  assert.equal(detect(bars,{...opts,now:now+5*duration}).length,0);
  const flat=bars.map(b=>({...b,open:100,close:100,high:100.5,low:99.5}));assert.equal(detect(flat,opts).length,0);
  const falling=bars.map((b,i)=>({...b,open:200-i*.2,close:200-i*.2,high:201-i*.2,low:199-i*.2}));
  assert.equal(detect(falling,opts).length,0,'must not long a falling EMA from below');
  const pullback=structuredClone(bars);
  for(let i=233;i<239;i++) {
    const close=156-(i-233)*2;
    Object.assign(pullback[i],{open:close+.3,close,high:close+.4,low:close-.6});
  }
  let pe=150;for(let i=99;i<239;i++)pe+=.02*(pullback[i].close-pe);
  Object.assign(pullback.at(-1),{open:146,close:145,high:146.1,low:pe+.3,volume:220});
  const multi=detect(pullback,opts).find(e=>e.candleAt===pullback.at(-1).openTime);
  assert.ok(multi,'multi-candle pullback must not erase prior rise');assert.equal(multi.pullbackBars,6);
  assert.ok(multi.riseEndAt<pullback[233].openTime&&multi.pullbackPct<0);
  const old=structuredClone(pullback);
  for(let i=222;i<239;i++) {
    const close=158-(i-222)*.7;
    Object.assign(old[i],{open:close+.2,close,high:close+.3,low:close-.5});
  }
  assert.equal(detect(old,opts).length,0,'crest outside 12-bar correction window must fail');
  const follow={openTime:now,closeTime:now+duration-1,open:159,low:158,high:162,close:161,volume:100};
  const confirm=detect([...bars,follow],{...opts,now:now+duration}).find(e=>e.stage==='BOUNCE_CONFIRMED_LONG_WATCH');
  assert.equal(confirm.confirmation,'CLOSE_ABOVE_RECLAIM_HIGH');assert.equal(confirm.referenceEntry,161);
  assert.equal(detect([...bars,follow],{...opts,now:now+120000}).some(e=>e.confirmation),false,'unclosed follow-up cannot confirm');
  assert.deepEqual(detect([...bars,follow],{...opts,now:now-1}),detect(bars,{...opts,now:now-1}),'ignore future bars');
  const fail={...follow,low:event.invalidation-.1};
  assert.equal(detect([...bars,fail],{...opts,now:now+duration}).some(e=>e.confirmation),false,'invalidation wins over rebound');
  const retest={...follow,low:event.ema99+.2,close:159.5,high:160};
  assert.equal(detect([...bars,retest],{...opts,now:now+duration}).find(e=>e.confirmation)?.confirmation,'EMA_RETEST_HELD');
  const expired=[...bars,follow];
  for(let k=1;k<=4;k++)expired.push({...follow,openTime:now+k*duration,closeTime:now+(k+1)*duration-1});
  assert.equal(detect(expired,{...opts,now:now+5*duration}).some(e=>e.candleAt===event.candleAt),false,'do not refresh old confirmation');
  const payload=ema99PullbackLongPayload(confirm);assert.equal(payload.embeds[0].color,0x10b981);
  assert.ok(payload.embeds[0].title.startsWith('🟢 LONG ·'));
  for(const stage of ['NEAR_EMA_LONG_WATCH','NEAR_RECLAIM_LONG_WATCH','RECLAIM_LONG_WATCH','TOUCH_EMA_LONG_WATCH','CLOSED_BELOW_EMA_LONG_WAIT']) {
    const watchEmbed=ema99PullbackLongPayload({...event,stage}).embeds[0];
    assert.equal(watchEmbed.color,0x3b82f6);
    assert.ok(watchEmbed.title.startsWith('🔵 LONG ·'));
    assert.ok(![0xf59e0b,0xef4444,0xfbbf24].includes(watchEmbed.color),'LONG must not reuse SHORT palette');
  }
  assert.ok(payload.embeds[0].description.includes('KHÔNG TỰ ĐẶT LỆNH'));
  assert.ok(payload.embeds[0].fields.every(f=>f.value.length<=1024));assert.deepEqual(payload.allowed_mentions.parse,[]);
  assert.equal(ema99PullbackLongEvent({...event,generatedAt:'bad'},now),null);
  assert.equal(ema99PullbackLongEvent(event,now+90001),null);
  const dir=await mkdtemp(join(tmpdir(),'ema99-long-'));let sends=0;
  const create=()=>new CoinHorizonDiscordNotifier({stateFile:join(dir,'state.json'),now:()=>now+duration,
    webhookUrl:'https://discord.invalid/test',eventBuilder:ema99PullbackLongEvent,payloadBuilder:ema99PullbackLongPayload,
    fetchImpl:async()=>{sends++;return {ok:true};}});
  const watch={...event,generatedAt:new Date(now+duration).toISOString()};
  let notifier=create();await Promise.all([notifier.notify(watch),notifier.notify(watch)]);assert.equal(sends,1);
  notifier=create();await notifier.notify(watch);assert.equal(sends,1);await notifier.notify(confirm);assert.equal(sends,2);
  const result=await scanEma99PullbackLong(['TESTUSDT'],{getIfCached:(_s,i)=>i===interval?bars:null},async e=>{
    assert.ok(e.emaContext);assert.equal(e.emaContext.kind,'UNAVAILABLE');
    assert.equal(e.emaContext.frames[interval].available,true);
    assert.equal(e.stage,event.stage);return {sent:0};
  },now);
  assert.equal(result.processed,1);assert.ok(result.detected>0);
}
console.log('EMA99 pullback LONG tests passed (mock sends only)');
