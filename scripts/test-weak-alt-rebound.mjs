import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {classifyBtcAltState,directionalCapture,evaluateWeakAltRebound,weakAltClosedRows,WeakAltReboundMonitor,weakAltPushPayload} from '../src/weakAltRebound.js';
import {WEAK_ALT_VERSION as VERSION,WEAK_ALT_LEGACY_VERSION,WEAK_ALT_STATES,WEAK_ALT_THEMES,weakAltKey,weakAltTradeKey} from '../public/weak-alt-rebound-model.js';
import {normalizeLiquidLiveCardKey,liquidLiveCardKeysOfTrade,matchLiquidLiveCardWhitelist} from '../src/liquidLiveCardWhitelist.js';
import {OppositeLiquidityWebPushService} from '../src/oppositeLiquidityWebPush.js';
export function weakFixture(){
  const step=900000,end=Math.floor(Date.now()/step)*step-1,start=end-100*step+1;
  const make=coin=>{let price=100;return Array.from({length:100},(_,i)=>{
    const up=i>=96||i%2===0,change=coin?(up?.025:-.22):(up?.1:-.1),open=price;price*=1+change/100;
    return {openTime:start+i*step,closeTime:start+(i+1)*step-1,open,close:price,low:Math.min(open,price)*.9997,high:Math.max(open,price)*1.0003,quoteVolume:coin?(up?4:10):100};});};
  const btcRows=make(false),coins=make(true);const now=btcRows.at(-1).closeTime+1000;
  return {now,btcRows,universe:Array.from({length:30},(_,i)=>({symbol:`ALT${i}USDT`,candles15m:coins}))};
}
const input=weakFixture(),d=evaluateWeakAltRebound(input);
assert.equal(d.ready,true);assert.equal(d.state,'FRAGILE_REBOUND');assert.equal(d.coverage.ready,30);
assert.equal(d.breadth.recoveryWeakPct,100);assert.equal(d.breadth.fragilePct,100);
assert.equal(d.coins[0].betaUp,.25);assert.equal(d.coins[0].betaDown,2.2);
assert.equal(d.coins[0].volumeRecoveryRatio,.4);assert.equal(d.affectsOrders,false);
assert.equal(evaluateWeakAltRebound({...input,universe:input.universe.slice(0,29)}).state,'WAIT_DATA');
assert.equal(evaluateWeakAltRebound({...input,now:input.now+16*60000}).state,'WAIT_DATA');
assert.equal(weakAltClosedRows(input.btcRows.filter((_,i)=>i!==50),input.now).length,0);
assert.equal(weakAltClosedRows(input.btcRows.map((r,i)=>i===70?{...r,quoteVolume:null}:r),input.now).length,0);
const future={...input.btcRows.at(-1),closeTime:input.now+900000,openTime:input.now+1,close:99999};
assert.deepEqual(evaluateWeakAltRebound({...input,btcRows:[...input.btcRows,future]}),d,'future bar cannot affect signal');
const strongVolume=input.universe.map(x=>({...x,candles15m:x.candles15m.map(r=>({...r,quoteVolume:r.close>r.open?20:10}))}));
assert.equal(evaluateWeakAltRebound({...input,universe:strongVolume}).state,'WEAK_REBOUND');
const downBtc=input.btcRows.map(r=>({...r}));for(let i=96;i<100;i++){const r=downBtc[i];r.open=downBtc[i-1].close;r.close=r.open*.999;r.high=r.open*1.0003;r.low=r.close*.9997;}
assert.equal(evaluateWeakAltRebound({...input,btcRows:downBtc}).state,'BTC_DOWN_ALT_RESILIENT','ALT barely rises while BTC drops');
assert.equal(evaluateWeakAltRebound({...input,btcRows:input.btcRows.map((r,i)=>i===80?{...r,close:0}:r)}).state,'WAIT_DATA');
assert.equal(directionalCapture(Array(20).fill(.1),Array(20).fill(.2)).down,null);
assert.equal(directionalCapture(Array(7).fill(-.1),Array(7).fill(-.2)).down,null);
assert.equal(directionalCapture([.1,-.1],[.2]).up,null);
const strong={aboveEma20Pct:70,belowEma20Pct:30,up1hPct:65,down1hPct:15,higherLowPct:55,alignedUpPct:30,buyingVolumePct:55,laggingPct:0,resilientPct:0,fasterDownPct:0,downBasisPct:0,down3hPct:10,recoveryWeakPct:0,fragilePct:0};
const weak={...strong,aboveEma20Pct:25,belowEma20Pct:75,up1hPct:15,down1hPct:65,higherLowPct:20,alignedUpPct:10,buyingVolumePct:20,laggingPct:80,down3hPct:75};
for(const [btc,breadth,beta,expected] of [
  [{ret15m:.05,ret1h:-.05},strong,0,'BTC_NEUTRAL_ALT_STRONG'],[{ret15m:0,ret1h:.09},weak,0,'BTC_NEUTRAL_ALT_WEAK'],
  [{ret15m:.1,ret1h:.3},strong,0,'BTC_UP_ALT_STRONG'],[{ret15m:.2,ret1h:.3},{...strong,up1hPct:20,laggingPct:60},0,'BTC_UP_ALT_LAGGING'],
  [{ret15m:-.2,ret1h:-.3},{...strong,resilientPct:65},0,'BTC_DOWN_ALT_RESILIENT'],
  [{ret15m:-.2,ret1h:-.3},{...weak,fasterDownPct:65,downBasisPct:70},0,'BTC_DOWN_ALT_WEAK'],
  [{ret15m:.2,ret1h:.3},weak,0,'WEAK_REBOUND'],[{ret15m:.2,ret1h:.3},{...weak,recoveryWeakPct:60,fragilePct:25},30,'FRAGILE_REBOUND'],
  [{ret15m:.2,ret1h:-.3},strong,0,'NORMAL'],[{ret15m:.2,ret1h:-.3},weak,0,'WEAK_REBOUND'],
  [{ret15m:.09,ret1h:-.09},{...strong,up1hPct:59},0,'NORMAL'],
])assert.equal(classifyBtcAltState(btc,breadth,beta).state,expected);
assert.equal(classifyBtcAltState({ret15m:NaN,ret1h:0},strong).state,'WAIT_DATA');
assert.equal(classifyBtcAltState({ret15m:0,ret1h:.1},strong).regime,'UP');
assert.equal(classifyBtcAltState({ret15m:0,ret1h:-.1},strong).regime,'DOWN');
assert.equal(new Set(WEAK_ALT_STATES.map(s=>WEAK_ALT_THEMES[s].accent)).size,8,'each alert has unique color');
for(const state of WEAK_ALT_STATES){
  const key=weakAltKey(state),proof={version:VERSION,source:'AT_ENTRY',ready:true,state,evaluatedAt:input.now};
  const trade={entryAt:input.now+1000,weakAltReboundAtEntry:proof};
  assert.equal(normalizeLiquidLiveCardKey(key),key);assert(liquidLiveCardKeysOfTrade(trade).includes(key));
  assert.equal(matchLiquidLiveCardWhitelist(trade,[]).allowed,false);
  assert.equal(weakAltTradeKey({...trade,weakAltReboundAtEntry:{...proof,evaluatedAt:input.now+1001}}),null);
  assert.equal(weakAltTradeKey({...trade,weakAltReboundAtEntry:{...proof,source:'VIEW_ONLY'}}),null);
  assert.equal(weakAltTradeKey({...trade,entryAt:input.now+60001}),null);
  assert.equal(weakAltTradeKey({...trade,weakAltReboundAtEntry:{...proof,version:WEAK_ALT_LEGACY_VERSION}}),['WEAK_REBOUND','FRAGILE_REBOUND'].includes(state)?key:null,'legacy cannot claim new states');
}
assert.equal(weakAltTradeKey({entryAt:input.now}),null);assert.equal(normalizeLiquidLiveCardKey('weak-alt-rebound:NORMAL'),null);
const dir=await mkdtemp(join(tmpdir(),'weak-alt-'));
try{
  let now=d.closedAt-1;const sent=[],file=join(dir,'state.json');
  const m=new WeakAltReboundMonitor({file,now:()=>now,pushSender:async p=>{sent.push(p);return {sent:1,failed:0};}});
  now=d.closedAt+1000;await m.process({...d,state:'WEAK_REBOUND'});assert.equal(sent.length,1);
  await m.process(d);assert.equal(sent.length,1,'same close not processed twice');
  now+=900000;await m.process({...d,closedAt:d.closedAt+900000});assert.equal(sent.length,2,'escalation sends once');
  const restored=new WeakAltReboundMonitor({file,now:()=>now,pushSender:async p=>{sent.push(p);return {sent:1};}});
  await restored.init();await restored.process({...d,closedAt:d.closedAt+900000});assert.equal(sent.length,2,'restart does not replay');
  let strongNow=d.closedAt-1;let strongSends=0;const strongFirst=new WeakAltReboundMonitor({now:()=>strongNow,pushSender:async()=>{strongSends++;return {sent:1};}});
  strongNow=input.now;await strongFirst.process(d);strongNow+=900000;await strongFirst.process({...d,state:'WEAK_REBOUND',closedAt:d.closedAt+900000});
  assert.equal(strongSends,1,'first FRAGILE then WEAK is a downgrade, never another Push');
  let transitionNow=d.closedAt-1;const changes=[];
  const transitions=new WeakAltReboundMonitor({now:()=>transitionNow,pushSender:async p=>{changes.push(p);return {sent:1};}});
  for(const [i,state] of WEAK_ALT_STATES.entries()){
    transitionNow=input.now+i*900000;await transitions.process({...d,state,closedAt:d.closedAt+i*900000});
  }
  assert.equal(changes.length,8,'new states each notify independently');
  assert.equal(new Set(changes.map(p=>p.title)).size,8);assert(changes.every(p=>p.state&&p.signalType==='BTC_ALT_MARKET_STATE'));
  transitionNow+=1000;await transitions.process({...d,state:WEAK_ALT_STATES.at(-1),closedAt:transitionNow-1});assert.equal(changes.length,8,'same state does not spam');
  const intent=JSON.parse(await readFile(file,'utf8'));intent.history[0].delivery={status:'POSTING'};
  await writeFile(join(dir,'intent.json'),JSON.stringify(intent));const uncertain=new WeakAltReboundMonitor({file:join(dir,'intent.json'),now:()=>now});await uncertain.init();
  assert.equal(uncertain.history[0].delivery.status,'UNKNOWN_AFTER_RESTART');
  const legacyState={...intent,version:WEAK_ALT_LEGACY_VERSION,enabled:false,history:intent.history.map(e=>({...e,version:WEAK_ALT_LEGACY_VERSION}))};
  await writeFile(join(dir,'v1.json'),JSON.stringify(legacyState));const v1=new WeakAltReboundMonitor({file:join(dir,'v1.json'),now:()=>now});await v1.init();
  assert.equal(v1.error,null);assert.equal(v1.enabled,false);assert.equal(v1.history[0].version,WEAK_ALT_LEGACY_VERSION);await v1.save();
  assert.equal(JSON.parse(await readFile(join(dir,'v1.json'),'utf8')).history[0].version,WEAK_ALT_LEGACY_VERSION);
  now+=1000;await m.process({...d,closedAt:now-1,state:'NORMAL'});
  now+=1000;await m.process({...d,closedAt:now-1});assert.equal(sent.length,2,'new episode cooldown');
  assert.equal(m.history.at(-1).delivery.status,'COOLDOWN');
  await m.process({...d,ready:false,state:'WAIT_DATA',closedAt:now+900000});assert(m.active,'missing data cannot rearm episode');
  const old=new WeakAltReboundMonitor({now:()=>input.now,pushSender:async()=>{throw Error('no stale replay');}});
  await old.process(d);assert.equal(old.history.length,0,'startup existing closed bar is display only');
  const disabled=new WeakAltReboundMonitor({now:()=>d.closedAt-1,pushSender:async()=>{throw Error('disabled');}});
  await disabled.setEnabled(false);disabled.now=()=>input.now;await disabled.process(d);assert.equal(disabled.history[0].delivery.status,'DISABLED');
  await writeFile(join(dir,'bad.json'),'broken');const bad=new WeakAltReboundMonitor({file:join(dir,'bad.json')});await bad.init();assert(bad.error);
  await bad.process(d);assert.equal(await readFile(join(dir,'bad.json'),'utf8'),'broken');
  let failClock=d.closedAt-1;const quiet=new WeakAltReboundMonitor({now:()=>failClock,pushSender:async()=>({sent:0,skipped:'QUIET_HOURS'})});
  failClock=input.now;await quiet.process(d);assert.equal(quiet.history[0].delivery.status,'QUIET_HOURS');
  const transport=[],service=new OppositeLiquidityWebPushService({stateFile:join(dir,'push.json'),vapidFile:join(dir,'vapid.json'),now:()=>input.now,
    webPushImpl:{generateVAPIDKeys:()=>({publicKey:'A'.repeat(50),privateKey:'B'.repeat(50)}),setVapidDetails(){},sendNotification:async(s,p,o)=>transport.push({p:JSON.parse(p),o})}});
  await service.subscribe({endpoint:'https://push.test/device',keys:{p256dh:'A'.repeat(88),auth:'B'.repeat(24)}});
  await service.updateQuietHours({enabled:false,start:'00:00',end:'06:00',timeZone:'Asia/Ho_Chi_Minh'});
  const payload=weakAltPushPayload({...d,id:'fixture-event'},input.now);
  assert.equal((await service.sendPayload(payload)).sent,1);assert(transport[0].p.title.startsWith('💗'));assert(transport[0].o.TTL<=120);
  assert.equal((await service.sendPayload({...payload,eventId:'bad-state',state:'NORMAL'})).error,'INVALID_BTC_ALT_STATE');
  assert((await service.sendPayload(payload)).deduped);assert.equal((await service.sendPayload({...payload,eventId:'expired',expiresAt:input.now})).sent,0);
  const quietNow=Date.parse('2026-10-14T01:00:00+07:00');service.now=()=>quietNow;
  await service.updateQuietHours({enabled:true,start:'00:00',end:'06:00',timeZone:'Asia/Ho_Chi_Minh'});
  assert.equal((await service.sendPayload({...payload,eventId:'quiet-new-type',expiresAt:quietNow+120000})).skipped,'QUIET_HOURS');assert.equal(transport.length,1);
  const listeners={},notifications=[];const self={addEventListener:(k,f)=>listeners[k]=f,registration:{showNotification:async(t,o)=>notifications.push({t,o})},location:{origin:'https://local.test'},
    clients:{matchAll:async()=>[],openWindow:async url=>notifications.push({url})}};
  vm.runInNewContext(await readFile('public/opposite-liquidity-push-sw.js','utf8'),{self,URL,Date:class extends Date{static now(){return input.now;}}});
  let wait;listeners.push({data:{json:()=>payload},waitUntil:p=>wait=p});await wait;assert.equal(notifications[0].o.icon,'/btc-alt-state-fragile.svg');
  listeners.notificationclick({notification:{data:{...notifications[0].o.data,url:'https://evil.test'},close(){}},waitUntil:p=>wait=p});await wait;
  assert.equal(new URL(notifications[1].url).origin,'https://local.test');assert.equal(new URL(notifications[1].url).searchParams.get('weakAlt'),'fixture-event');
  for(const state of WEAK_ALT_STATES){
    const before=notifications.length,p=weakAltPushPayload({...d,state,id:`state-${state}`},input.now);
    listeners.push({data:{json:()=>p},waitUntil:p=>wait=p});await wait;
    assert.equal(notifications[before].o.icon,`/btc-alt-state-${WEAK_ALT_THEMES[state].icon}.svg`);
    assert((await readFile(`public/btc-alt-state-${WEAK_ALT_THEMES[state].icon}.svg`,'utf8')).includes(WEAK_ALT_THEMES[state].accent));
  }
}finally{await rm(dir,{recursive:true,force:true});}
console.log('Weak ALT: causal bars, 3 layers, coverage, beta, dedupe/escalation/restart, cooldown/quiet, Push/SW, whitelist PASS');
