import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {PUSH_QUIET_HOURS_DEFAULT,normalizePushQuietHours,isPushQuietNow,pushTtlBeforeQuiet} from '../public/push-quiet-hours-model.js';
import {OppositeLiquidityWebPushService} from '../src/oppositeLiquidityWebPush.js';
import {DiscordPushManager,buildDiscordPushRouteCatalog} from '../src/discordPushManager.js';
import {deliverWickChannels} from '../src/coinPumpWickDiscord.js';
const vn=time=>Date.parse(`2026-10-12T${time}+07:00`);
const defaultRule={...PUSH_QUIET_HOURS_DEFAULT};
assert.deepEqual(defaultRule,{enabled:true,start:'00:00',end:'06:00',timeZone:'Asia/Ho_Chi_Minh'});
for(const [time,quiet] of [['00:00:00',true],['05:59:59',true],['06:00:00',false],['23:59:59',false]])
  assert.equal(isPushQuietNow(defaultRule,vn(time)),quiet,time);
const overnight=normalizePushQuietHours({enabled:true,start:'22:00',end:'07:00'});
for(const [time,quiet] of [['21:59:59',false],['22:00:00',true],['00:00:00',true],['06:59:59',true],['07:00:00',false]])
  assert.equal(isPushQuietNow(overnight,vn(time)),quiet,time);
const daytime=normalizePushQuietHours({enabled:true,start:'12:00',end:'14:30'});
assert.equal(isPushQuietNow(daytime,vn('12:00:00')),true);assert.equal(isPushQuietNow(daytime,vn('14:30:00')),false);
assert.equal(isPushQuietNow({...defaultRule,enabled:false},vn('02:00:00')),false);
assert.equal(pushTtlBeforeQuiet(defaultRule,vn('23:59:50'),300),10);
assert.equal(pushTtlBeforeQuiet(defaultRule,vn('23:59:59.900'),300),0);
assert.equal(pushTtlBeforeQuiet(defaultRule,vn('06:00:00'),120),120);
const toastClient=await readFile('public/opposite-liquidity-toast.js','utf8');
for(const [active,expected] of [[true,0],[false,1],[undefined,0]]) {
  let nativeCount=0;
  const registration={pushManager:{getSubscription:async()=>null},showNotification:async()=>{nativeCount++;}};
  const context=vm.createContext({__oppositeLiquidityToastLoaded:true,
    window:{isSecureContext:true,Notification:{}},Notification:{permission:'granted'},
    navigator:{serviceWorker:{register:async()=>registration,ready:Promise.resolve()}},
    fetch:async()=>({ok:true,json:async()=>({publicKey:'TEST',quietHoursActive:active})}),AbortSignal});
  vm.runInContext(toastClient,context);
  await vm.runInContext("showPushNotification({eventId:'test',symbol:'BTCUSDT',side:'LONG',interval:'5m'})",context);
  assert.equal(nativeCount,expected,'native fallback quiet/missing config is fail-closed; toast unaffected');
}
for(const bad of [null,{}, {enabled:'true',start:'00:00',end:'06:00'},
  {enabled:true,start:'24:00',end:'06:00'},{enabled:true,start:'00:00',end:'00:00'},
  {enabled:true,start:'0:00',end:'06:00'},{enabled:true,start:'00:00',end:'06:00',timeZone:'UTC'}])
  assert.throws(()=>normalizePushQuietHours(bad),/INVALID_PUSH_QUIET_HOURS/);
const directory=await mkdtemp(join(tmpdir(),'push-quiet-hours-'));
let now=vn('01:00:00'),sent=[];
const webPushImpl={generateVAPIDKeys:()=>({publicKey:'PUBLIC_TEST',privateKey:'PRIVATE_TEST'}),setVapidDetails(){},
  async sendNotification(subscription,payload,options){sent.push({payload:JSON.parse(payload),options});return {statusCode:201};}};
const subscription={endpoint:'https://push.example.test/quiet-phone',keys:{p256dh:'A'.repeat(88),auth:'B'.repeat(24)}};
const stateFile=join(directory,'subscriptions.json'),vapidFile=join(directory,'vapid.json');
try {
  let service=new OppositeLiquidityWebPushService({stateFile,vapidFile,webPushImpl,now:()=>now});
  assert.equal((await service.publicConfig()).quietHoursActive,true);
  await service.subscribe(subscription);
  const types=['LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH','MANUAL_BINANCE_PRICE_ALERT','BINANCE_LIQUIDITY_ZONE_LIFECYCLE',
    'BTC_ALT_WICK_RECOVERY_1M','COIN_PUMP_WICK_RECOVERY_1M','COIN_PUMP_WICK_EARLY_1M','COIN_PUMP_VOLUME_LONG_FLUSH_1M',
    'BINANCE_SHORT_SETUP_WATCH','BINANCE_FUTURES_CONTRACT_RISK','DISCORD_ROUTE:test'];
  for(const [i,signalType] of types.entries()) {
    const d=await service.sendPayload({signalType,eventId:`quiet:${i}`,expiresAt:now+120000,title:'quiet fixture'});
    assert.equal(d.skipped,'QUIET_HOURS');assert.equal(d.sent,0);assert.equal(d.attempted,0);assert.equal(d.failed,0);
  }
  assert.equal(sent.length,0,'no push transport for any family during quiet hours');
  assert.ok((await service.zoneNotificationHistory()).some(r=>r.delivery.skipped==='QUIET_HOURS'),'history kept even when suppressed');
  now=vn('06:00:00');
  assert.equal((await service.sendPayload({signalType:types[0],eventId:'quiet:0'})).deduped,true,'suppressed events are not replayed after morning');
  assert.equal((await service.sendPayload({signalType:types[0],eventId:'morning:new'})).sent,1);
  now=vn('23:59:50');await service.sendPayload({signalType:types[0],eventId:'before-midnight'});
  assert.equal(sent.at(-1).options.TTL,10,'offline delivery expires before quiet starts');
  const invalidBefore=JSON.stringify(await service.publicConfig());
  await assert.rejects(service.updateQuietHours({enabled:true,start:'00:00',end:'00:00'}));
  assert.equal(JSON.stringify(await service.publicConfig()),invalidBefore,'invalid POST leaves state untouched');
  await service.updateQuietHours(overnight);assert.deepEqual((await service.publicConfig()).quietHours,overnight);
  service=new OppositeLiquidityWebPushService({stateFile,vapidFile,webPushImpl,now:()=>now});
  assert.deepEqual((await service.publicConfig()).quietHours,overnight,'settings survive restart');
  await service.subscribe(subscription);assert.deepEqual((await service.publicConfig()).quietHours,overnight,'resubscribe cannot reset quiet schedule');
  assert.equal((await service.sendPayload({signalType:types[0],eventId:'after-restart'})).skipped,'QUIET_HOURS');
  const routes=buildDiscordPushRouteCatalog({LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/100/test-secret'});
  const manager=new DiscordPushManager({stateFile:join(directory,'manager.json'),routes,webPushService:service,now:()=>now});
  const wrapped=manager.wrapFetch(async()=>new Response(null,{status:204}));
  const beforeSent=sent.length;
  await wrapped(routes[0].webhook,{method:'POST',body:JSON.stringify({embeds:[{title:'quiet Discord fixture'}]})});
  await new Promise(resolve=>setTimeout(resolve,20));await manager.queue;
  const telemetry=(await manager.snapshot()).routes[0];
  assert.equal(telemetry.observedCount,1,'successful Discord remains observed');assert.equal(telemetry.pushedCount,0);
  assert.equal(manager.state.routeTelemetry[routes[0].id].lastPushedAt,null);assert.equal(telemetry.lastPushResult.skipped,'QUIET_HOURS');assert.equal(sent.length,beforeSent);
  let discordSent=0;
  const e={detectedAt:now,delivery:{status:'POSTING'},discordDelivery:{status:'POSTING'}};
  await deliverWickChannels(e,{now:()=>now,pushSender:p=>service.sendPayload(p),
    discordSender:async()=>{discordSent++;return {sent:1};},payload:{signalType:types[0],eventId:'channels'}});
  assert.equal(e.delivery.status,'QUIET_HOURS');assert.equal(e.discordDelivery.status,'SENT');assert.equal(discordSent,1);
  await service.updateQuietHours({...overnight,enabled:false});
  assert.equal((await service.sendPayload({signalType:types[0],eventId:'disabled:new'})).sent,1,'turning schedule off resumes new pushes');
  const saved=JSON.parse(await readFile(stateFile,'utf8'));
  assert.equal(saved.quietHours.enabled,false);assert.equal(Object.keys(saved.subscriptions).length,1);
  delete saved.quietHours;saved.version='OPPOSITE_LIQUIDITY_WEB_PUSH_V10_SHORT_SETUP_WATCH_20261011';
  await writeFile(join(directory,'legacy.json'),JSON.stringify(saved));
  // Missing legacy config adopts the explicitly requested default without changing subscriptions/dedupe.
  const legacy=new OppositeLiquidityWebPushService({stateFile:join(directory,'legacy.json'),vapidFile,webPushImpl,now:()=>now});
  await legacy.initialize();assert.equal(legacy.state.sentEvents['quiet:0']>0,true);
  assert.deepEqual((await legacy.publicConfig()).quietHours,defaultRule);assert.equal((await legacy.publicConfig()).subscriptionCount,1);
  await legacy.subscribe({...subscription,endpoint:'https://push.example.test/phone2'});
  now=vn('23:59:59.900');
  const normalSend=webPushImpl.sendNotification;
  webPushImpl.sendNotification=(...args)=>{const d=normalSend(...args);now=vn('00:00:00');return d;};
  const crossing=await legacy.sendPayload({signalType:types[0],eventId:'batch-midnight'});
  assert.equal(crossing.sent,1);assert.equal(crossing.attempted,1);assert.equal(crossing.skippedSubscriptions,1);
  webPushImpl.sendNotification=normalSend;
  // Atomic save failure must restore the previous active schedule.
  const blockedFile=join(directory,'does-not-exist','cannot-save.json');
  const failed=new OppositeLiquidityWebPushService({stateFile:blockedFile,vapidFile,webPushImpl,now:()=>now});
  await failed.initialize();failed.stateFile=directory;
  await assert.rejects(failed.updateQuietHours({...overnight,enabled:false}));
  assert.deepEqual((await failed.publicConfig()).quietHours,defaultRule);
} finally {await rm(directory,{recursive:true,force:true});}
console.log('PASS quiet Push: default00–06VN, adjustable/disabled/cross-midnight/boundaries, all families zero transport, TTL cutoff, persisted dedupe/no replay, independent Discord/telemetry, invalid/failed-save rollback. Mock only.');
