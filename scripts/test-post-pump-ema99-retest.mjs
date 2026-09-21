import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {detectPostPumpEma99Retest as detect,postPumpEma99Payload,postPumpEma99Event,scanPostPumpEma99Retest,
  EMA99_FIRST_PUMP_NEAR_REJECT_STAGE,EMA99_REBOUND_PUMP_NEAR_REJECT_STAGE} from '../src/postPumpEma99Retest.js';
import {CoinHorizonDiscordNotifier} from '../src/coinHorizonDiscord.js';
function fixture(interval='5m') {
  const duration=interval==='5m'?300000:900000,now=Date.UTC(2026,8,7),start=now-240*duration;
  const bars=Array.from({length:240},(_,i)=>{
    const close=i<130?100:i<=145?100+(i-130)*50/15:150-(i-145)*60/93;
    return {openTime:start+i*duration,closeTime:start+(i+1)*duration-1,open:close+0.3,close,high:close+0.6,low:close-0.4,volume:100};
  });
  let ema=100;for(let i=99;i<239;i++)ema+=0.02*(bars[i].close-ema);
  const last=bars.at(-1);Object.assign(last,{open:90,close:91,low:89.9,high:ema+0.1,volume:220});
  return {bars,now,interval};
}
for(const interval of ['5m','15m']) {
  const {bars,now}=fixture(interval);
  const opts={symbol:'TESTUSDT',interval,now};
  const events=detect(bars,opts);assert.equal(events.length,1);
  assert.equal(events[0].stage,'REJECTED_SHORT_WATCH');assert.ok(events[0].pumpPct>=8&&events[0].dropPct>=5);
  assert.equal(events[0].observeOnly,true);
  const near=structuredClone(bars);
  const limit=events[0].nearLimitPct;
  near.at(-1).high=events[0].ema99*(1-limit*0.8/100);
  const nearEvent=detect(near,opts)[0];
  assert.equal(nearEvent.stage,EMA99_REBOUND_PUMP_NEAR_REJECT_STAGE);
  assert.equal(nearEvent.pumpLegType,'REBOUND_PUMP_AFTER_DUMP');
  assert.ok(nearEvent.gapToEmaPct>0.15&&nearEvent.gapToEmaPct<limit);
  assert.equal(nearEvent.nearMiss,true);
  assert.equal(detect(near,{...opts,now:near.at(-1).openTime+120000})[0].stage,'NEAR_EMA_WATCH');
  const far=structuredClone(near);far.at(-1).high=events[0].ema99*(1-(limit+0.02)/100);
  assert.equal(detect(far,opts).length,0);
  const nearNoVolume=structuredClone(near);nearNoVolume.at(-1).volume=100;
  assert.equal(detect(nearNoVolume,opts).length,0);
  const nearPayload=postPumpEma99Payload(nearEvent);
  assert.equal(nearPayload.embeds[0].color,0xf97316);
  assert.ok(nearPayload.embeds[0].title.includes('BẬT HỤT EMA99'));
  assert.ok(nearPayload.embeds[0].title.includes('BƠM HỒI'));
  assert.ok(nearPayload.embeds[0].fields[0].value.includes('Còn hụt'));
  const lowVolume=structuredClone(bars);lowVolume.at(-1).volume=100;assert.equal(detect(lowVolume,opts).length,0);
  const miss=structuredClone(bars);miss.at(-1).high=92;assert.equal(detect(miss,opts).length,0);
  assert.equal(detect(bars,{...opts,now:now+2*(interval==='5m'?300000:900000)}).length,0);
  const gap=structuredClone(bars);gap.splice(10,1);assert.equal(detect(gap,opts).length,0);
  const noPump=bars.map((b,i)=>({...b,open:130-i*.1,high:130.2-i*.1,low:129.8-i*.1,close:130-i*.1}));
  assert.equal(detect(noPump,opts).length,0);
  const live=detect(bars,{...opts,now:bars.at(-1).openTime+120000});
  assert.equal(live[0].stage,'TOUCH_WATCH');assert.equal(live[0].referenceEntry,null);
  const above=structuredClone(bars);above.at(-1).close=above.at(-1).high-0.01;
  assert.equal(detect(above,opts)[0].stage,'CLOSED_ABOVE_EMA_WATCH');
  const payload=postPumpEma99Payload(events[0]);assert.equal(payload.embeds[0].color,0xef4444);
  assert.deepEqual(payload.allowed_mentions.parse,[]);
  assert.ok(payload.embeds[0].fields.every(f=>f.value.length<=1024));
  // Several recovery candles must not erase a genuine preceding decline.
  const recovery=structuredClone(bars);
  for(let i=233;i<239;i++) {
    const close=94+(i-233)*2;
    Object.assign(recovery[i],{open:close-0.3,close,high:close+0.6,low:close-0.4});
  }
  let recoveryEma=100;for(let i=99;i<239;i++)recoveryEma+=0.02*(recovery[i].close-recoveryEma);
  Object.assign(recovery.at(-1),{open:104,close:105,low:103.9,high:recoveryEma-0.3,volume:220});
  const recovered=detect(recovery,opts).find(e=>e.candleAt===recovery.at(-1).openTime);
  assert.ok(recovered,'pre-rebound decline should qualify');
  assert.ok(recovered.fadePct<=-0.5&&recovered.recentFadePct>0);
  assert.equal(recovered.reboundBars,6);
  assert.ok(recovered.fadeEndAt<recovery[233].openTime);
  assert.ok(recovered.stage.includes('WATCH'));
  assert.ok(postPumpEma99Payload(recovered).embeds[0].fields[1].value.includes('Đoạn giảm trước nhịp hồi'));
  const baseThenRecovery=structuredClone(recovery);
  for(let i=210;i<233;i++)Object.assign(baseThenRecovery[i],{open:94,close:94,high:94.6,low:93.6});
  assert.ok(detect(baseThenRecovery,opts).length,'a base after the decline must not erase that decline');
  const noDecline=structuredClone(recovery);
  for(let i=146;i<233;i++)Object.assign(noDecline[i],{open:94,close:94,high:94.6,low:93.6});
  assert.equal(detect(noDecline,opts).length,0,'flat base is not a preceding fade');
  const oldDecline=structuredClone(recovery);
  for(let i=222;i<239;i++) {
    const close=92+(i-222)*0.7;
    Object.assign(oldDecline[i],{open:close-0.2,close,high:close+0.5,low:close-0.3});
  }
  assert.equal(detect(oldDecline,opts).length,0,'do not borrow a decline beyond 12 recovery bars');
  const future={...recovery.at(-1),openTime:now+1,closeTime:now+(interval==='5m'?300000:900000)};
  assert.deepEqual(detect([...recovery,future],opts),detect(recovery,opts),'future candles must not affect classification');
}
for(const interval of ['5m','15m']) {
  const duration=interval==='5m'?300000:900000,now=Date.UTC(2026,8,7),start=now-240*duration;
  const bars=Array.from({length:240},(_,i)=>{const close=i<210?120-i*.12:94;return {
    openTime:start+i*duration,closeTime:start+(i+1)*duration-1,open:close+.05,close,high:close+.3,low:close-.3,volume:100};});
  let ema=bars.slice(0,99).reduce((sum,b)=>sum+b.close,0)/99;
  for(let i=99;i<240;i++)ema+=.02*(bars[i].close-ema);
  Object.assign(bars.at(-1),{open:94,close:95,low:93.9,high:ema*.997,volume:250});
  const first=detect(bars,{symbol:'FIRSTUSDT',interval,now});
  assert.equal(first.length,1);assert.equal(first[0].stage,EMA99_FIRST_PUMP_NEAR_REJECT_STAGE);
  assert.equal(first[0].pumpLegType,'FIRST_PUMP_FROM_BASE');assert.equal(first[0].historyWindowBars,96);
  assert.ok(first[0].baseRangePct<6&&first[0].baseDriftPct<2&&first[0].pumpPct>=3);
  const payload=postPumpEma99Payload(first[0]);
  assert.ok(payload.embeds[0].title.includes('BƠM LẦN ĐẦU'));assert.equal(payload.embeds[0].color,0xeab308);
  assert.ok(payload.embeds[0].fields.find(f=>f.name==='BỐI CẢNH').value.includes('chưa thấy pump–dump'));
  const wideBase=structuredClone(bars);wideBase[220].high=105;
  assert.equal(detect(wideBase,{symbol:'FIRSTUSDT',interval,now}).length,0,'wide base is not first pump');
}
const {bars,now}=fixture();
const event=detect(bars,{symbol:'TESTUSDT',interval:'5m',now})[0];
const dir=await mkdtemp(join(tmpdir(),'ema99-retest-'));let sends=0;
const create=()=>new CoinHorizonDiscordNotifier({stateFile:join(dir,'state.json'),webhookUrl:'https://discord.invalid/test',now:()=>now,
  eventBuilder:postPumpEma99Event,payloadBuilder:postPumpEma99Payload,fetchImpl:async()=>{sends++;return {ok:true};}});
let notifier=create();await Promise.all([notifier.notify(event),notifier.notify(event)]);assert.equal(sends,1);
notifier=create();await notifier.notify(event);assert.equal(sends,1);
await notifier.notify({...event,stage:'TOUCH_WATCH',dedupeKey:event.dedupeKey.replace('REJECTED_SHORT_WATCH','TOUCH_WATCH')});assert.equal(sends,2);
await notifier.notify({...event,stage:'NEAR_EMA_WATCH',dedupeKey:event.dedupeKey.replace('REJECTED_SHORT_WATCH','NEAR_EMA_WATCH')});assert.equal(sends,3);
await notifier.notify(event);assert.equal(sends,3);
const result=await scanPostPumpEma99Retest(['TESTUSDT'],{getIfCached:(_s,i)=>i==='5m'?bars:null},async()=>({sent:0}),now);
assert.equal(result.processed,1);assert.equal(result.detected,1);
console.log('Post pump EMA99 retest tests passed (mock sends only)');
