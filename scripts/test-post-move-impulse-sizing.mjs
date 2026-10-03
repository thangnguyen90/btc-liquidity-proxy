import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { impulseSizing, validImpulseSizing } from '../src/postMoveImpulseSizing.js';
import { PostMoveImpulseBinanceRunner, POST_MOVE_IMPULSE_LONG_ROUTE, buildPostMoveImpulseMarketOrder } from '../src/postMoveImpulseBinance.js';
import { POST_DUMP_NO_SELL_WATCH_VERSION, POST_DUMP_NO_SELL_STAGE } from '../src/postDumpNoSellWatch.js';
import { postDumpNoSellDiscordPayload } from '../src/postDumpNoSellDiscord.js';
import { postPumpNoBuyDiscordPayload } from '../src/postPumpNoBuyDiscord.js';
import { POST_PUMP_NO_BUY_WATCH_VERSION, POST_PUMP_NO_BUY_STAGE } from '../src/postPumpNoBuyWatch.js';
import { AutoEntryControls } from '../src/autoEntryControls.js';
import { authorizePostMoveImpulse5mOrder, evaluateAutoBinanceEntryPolicy } from '../src/autoBinancePolicy.js';
import { ceilQuantityAtMinimumNotional } from '../src/orderQuantityPolicy.js';

const at = hour => Date.parse(`2026-10-01T${String(hour).padStart(2,'0')}:00:00+07:00`);
const market = (time, trend) => ({evaluatedAt:time,btc:{trend,ret15m:0.1,ret1h:0.2}});
for (const [side,hour,expected] of [['LONG',2,1],['LONG',3,5],['LONG',5,5],['LONG',6,1],['LONG',12,5],['LONG',15,1],['SHORT',0,5],['SHORT',8,5],['SHORT',9,1],['SHORT',18,5],['SHORT',21,1]]) {
  assert.equal(impulseSizing({side,now:at(hour)}).marginUsdt,expected,`${side} ${hour} VN`);
}
for (const [side,aligned,opposite] of [['LONG','UP','DOWN'],['SHORT','DOWN','UP']]) {
  const now=at(10);
  assert.equal(impulseSizing({side,now,market:market(now,aligned)}).marginUsdt,5);
  assert.equal(impulseSizing({side,now,market:market(now,opposite)}).marginUsdt,1);
  for (const timestamp of [now-120001,now+1]) assert.equal(impulseSizing({side,now,market:market(timestamp,aligned)}).marginUsdt,1);
  assert.equal(impulseSizing({side,now:at(3),market:market(at(3),opposite)}).marginUsdt,5,'good-hour OR overrides opposing BTC');
}

const now=at(10);
const watch={symbol:'TESTUSDT',side:'LONG',version:POST_DUMP_NO_SELL_WATCH_VERSION,stage:POST_DUMP_NO_SELL_STAGE.BUY_IMPULSE,
  watchOnly:true,binanceEligible:false,executionCandidate:true,observedAt:now-1000,impulseAt:now-1000,priceAtWatch:100};
const opts={now,enabledAt:now-2000,startedAt:now-2000,markPrice:100};
const low=buildPostMoveImpulseMarketOrder(watch,opts);
const high=buildPostMoveImpulseMarketOrder(watch,{...opts,market:market(now,'UP')});
assert.equal(low.marginUsdt,1);assert.equal(low.notionalUsdt,5);
assert.equal(high.marginUsdt,5);assert.equal(high.notionalUsdt,25);
assert.equal(high.stopLossPrice,low.stopLossPrice);assert.equal(high.takeProfitPrice,low.takeProfitPrice);
assert.equal(high.clientOrderId,low.clientOrderId,'size change does not bypass dedupe');
assert.equal(validImpulseSizing(low),true);
assert.equal(validImpulseSizing({...low,marginUsdt:5,notionalUsdt:25}),false);
assert.equal(validImpulseSizing({...low,impulseSizing:null}),false);
for (const plan of [low,high]) {
  const result=evaluateAutoBinanceEntryPolicy({payload:authorizePostMoveImpulse5mOrder(plan),orderEnabled:true,env:{}});
  assert.equal(result.allowed,true);
  const embed=postDumpNoSellDiscordPayload({...watch,impulseSizing:plan.impulseSizing,impulseExecutionStatus:'submitted'}).embeds[0];
  assert.ok(embed.description.includes(`${plan.marginUsdt} USDT`));
  assert.ok(embed.fields.some(f=>f.name.includes(`SIZE ${plan.marginUsdt} USDT`)));
  assert.ok(embed.fields.some(f=>f.value.includes('không xác nhận khớp')));
}
const short={...watch,side:'SHORT',version:POST_PUMP_NO_BUY_WATCH_VERSION,stage:POST_PUMP_NO_BUY_STAGE.NO_BUY_CONFIRMATION};
const shortPlan=buildPostMoveImpulseMarketOrder(short,opts);
assert.equal(shortPlan.marginUsdt,1);
assert.ok(postPumpNoBuyDiscordPayload({...short,impulseSizing:shortPlan.impulseSizing}).embeds[0].description.includes('SHORT 1 USDT'));
assert.equal(buildPostMoveImpulseMarketOrder({...short,stage:POST_PUMP_NO_BUY_STAGE.SELL_IMPULSE},opts),null);

// Existing rounding policy permits at most 1% extra notional, never upgrades 1 to 5 margin.
assert.equal(ceilQuantityAtMinimumNotional({steppedQuantity:4.9,stepSize:.1,markPrice:1,requestedNotional:5,minimumNotional:5,enabled:low.allowMinNotionalCeil}),5);
assert.equal(ceilQuantityAtMinimumNotional({steppedQuantity:4.9,stepSize:.1,markPrice:1,requestedNotional:5,minimumNotional:10,enabled:true}),null);

const dir=await mkdtemp(join(tmpdir(),'impulse-dynamic-size-'));
try {
  const controls=new AutoEntryControls(join(dir,'controls.json'));
  controls.seed([POST_MOVE_IMPULSE_LONG_ROUTE]);
  const route=controls.register(POST_MOVE_IMPULSE_LONG_ROUTE);
  assert.throws(()=>controls.assertEntry(low),/OFF/);
  controls.update({action:'master',enabled:true});controls.update({action:'route',key:route.key,enabled:true});
  assert.doesNotThrow(()=>controls.assertEntry(low));assert.doesNotThrow(()=>controls.assertEntry(high));
  assert.throws(()=>controls.assertEntry({...low,marginUsdt:5,notionalUsdt:25}),/size/);
  assert.throws(()=>controls.update({action:'margin',key:route.key,marginUsdt:8,expectedMarginUsdt:5}),/tự động/);
  const state=controls.read();state.routes[route.key].enabledAt=new Date(now-2000).toISOString();controls.save(state);
  const sent=[];
  const runner=new PostMoveImpulseBinanceRunner({file:join(dir,'attempts.json'),controls,now:()=>now,startedAt:now-2000,
    getSizingMarket:()=>market(now,'DOWN'),getContext:async()=>({enabled:true,markPrice:100,positions:[],openOrders:[]}),
    submit:async plan=>{sent.push(plan);return {status:'submitted',orderResult:{orderId:1}};}});
  const w={...watch};await runner.processWatches([w]);
  assert.equal(sent.length,1);assert.equal(sent[0].marginUsdt,1);assert.equal(w.impulseSizing.marginUsdt,1);
  const saved=JSON.parse(await readFile(join(dir,'attempts.json'),'utf8'));
  assert.equal(Object.values(saved.attempts)[0].impulseSizing.marginUsdt,1);
  // Legacy attempts remain deduped and do not get falsely relabeled with current sizing.
  delete Object.values(saved.attempts)[0].impulseSizing;
  await writeFile(join(dir,'legacy.json'),JSON.stringify(saved));
  const legacy=new PostMoveImpulseBinanceRunner({file:join(dir,'legacy.json'),controls,now:()=>now,startedAt:now-2000,submit:()=>{throw Error('must not submit');}});
  const replay={...watch};const r=await legacy.processWatches([replay]);
  assert.equal(r.submitted,0);assert.equal(replay.impulseSizing,null);
} finally {await rm(dir,{recursive:true,force:true});}
console.log('PASS impulse 5/1: VN boundaries, OR, BTC freshness, controls/auth, Discord parity, legacy dedupe, rounding');
