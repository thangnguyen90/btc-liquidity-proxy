import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {PumpTurnWatch} from '../src/pumpTurnWatch.js';
import {STEP,plannedPumpZones,livePumpZone} from '../public/pump-turn-model.js';
import {PUMP_TURN_NEAR_PUSH_TYPE,PUMP_TURN_NEAR_PUSH_ROUTE,pumpTurnNearShortPushPayload} from '../src/pumpTurnNearPush.js';
import {DiscordPushManager,buildDiscordPushRouteCatalog} from '../src/discordPushManager.js';
import {OppositeLiquidityWebPushService} from '../src/oppositeLiquidityWebPush.js';
const dir=await mkdtemp(join(tmpdir(),'pump-turn-near-push-'));
let now=Date.parse('2026-10-18T19:00:10+07:00');const end=Math.floor(now/STEP)*STEP;
const rows=Array.from({length:73},(_,i)=>({t:end-(73-i)*STEP,end:end-(72-i)*STEP-1,o:i<60?100:118,c:i<60?100:118,h:i<60?101:120,l:i<60?99:117,q:100000,v:1000,buy:50000}));
const plan=plannedPumpZones('TESTUSDT',rows)[1],price=plan.zoneHigh*1.003;
const e={...livePumpZone(plan,{price,at:now},now),id:'pump-turn-near:'+plan.id,observedAt:now};
const payload=pumpTurnNearShortPushPayload(e,now);assert.ok(payload);assert.equal(payload.signalType,PUMP_TURN_NEAR_PUSH_TYPE);assert.equal(payload.side,'SHORT');assert.match(payload.title,/CHƯA XÁC NHẬN/);assert.match(payload.body,/không phải thông báo đã khớp/);
assert.equal(new URL(payload.url,'https://test').searchParams.get('signal'),e.id);assert.equal(payload.expiresAt,now+30000);
for(const change of [{side:'LONG'},{state:'FAR'},{state:'CHASE'},{interval:'1m'},{liveAt:now-31000},{observedAt:now-31000},{expiresAt:now},{zoneLow:0},{id:'fake'}])assert.equal(pumpTurnNearShortPushPayload({...e,...change},now),null);
const sent=[],pushFile=join(dir,'push.json');const webPushImpl={generateVAPIDKeys:()=>({publicKey:'PUB',privateKey:'PRIV'}),setVapidDetails(){},sendNotification:async(_s,p,o)=>{sent.push({payload:JSON.parse(p),options:o});}};
const service=new OppositeLiquidityWebPushService({stateFile:pushFile,vapidFile:join(dir,'vapid.json'),now:()=>now,webPushImpl});
await service.subscribe({endpoint:'https://push.example.test/phone',keys:{p256dh:'A'.repeat(88),auth:'B'.repeat(24)}});
const oldRoutes=buildDiscordPushRouteCatalog({RISING_VOLUME_DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/mock'});
const file=join(dir,'manager.json'),routes=[...oldRoutes,PUMP_TURN_NEAR_PUSH_ROUTE],options={stateFile:file,routes,webPushService:service,now:()=>now};
const manager=new DiscordPushManager(options);await manager.initialize();assert.equal(manager.isRouteEnabled(PUMP_TURN_NEAR_PUSH_ROUTE.id),false);
assert.equal((await manager.observeSignalEvent({routeId:PUMP_TURN_NEAR_PUSH_ROUTE.id,payload})).enabled,false);assert.equal(sent.length,0);
await manager.updateRoute(PUMP_TURN_NEAR_PUSH_ROUTE.id,true);const enabledAt=manager.state.routeEnabledAt[PUMP_TURN_NEAR_PUSH_ROUTE.id];
now+=100;await manager.updateRoute(PUMP_TURN_NEAR_PUSH_ROUTE.id,true);assert.equal(manager.state.routeEnabledAt[PUMP_TURN_NEAR_PUSH_ROUTE.id],enabledAt,'idempotent ON does not reset activation');
const emit=(eventId=e.id,notifiedAt=now)=>({...payload,eventId,notifiedAt,expiresAt:notifiedAt+30000});
assert.equal((await manager.observeSignalEvent({routeId:PUMP_TURN_NEAR_PUSH_ROUTE.id,payload:emit()})).delivery.sent,1);assert.equal(sent.length,1);assert.equal(sent[0].options.TTL,30);
assert.equal((await manager.observeSignalEvent({routeId:PUMP_TURN_NEAR_PUSH_ROUTE.id,payload:emit()})).deduped,true);assert.equal(sent.length,1);
assert.equal((await manager.snapshot()).routes.find(r=>r.id===PUMP_TURN_NEAR_PUSH_ROUTE.id).transport,'SIGNAL_EVENT');assert.equal(manager.routeByWebhook.size,1,'native route cannot be matched by webhook');
assert.equal((await manager.observeSignalEvent({routeId:PUMP_TURN_NEAR_PUSH_ROUTE.id,payload:{...emit(),signalType:'LONG'}})).matched,false);
assert.equal((await manager.observeSignalEvent({routeId:PUMP_TURN_NEAR_PUSH_ROUTE.id,payload:emit('pump-turn-near:old',enabledAt-100)})).skipped,'STALE_OR_PRE_ENABLE');
const restarted=new DiscordPushManager(options);await restarted.initialize();assert.equal((await restarted.observeSignalEvent({routeId:PUMP_TURN_NEAR_PUSH_ROUTE.id,payload:emit()})).deduped,true);
await manager.updateRoute(PUMP_TURN_NEAR_PUSH_ROUTE.id,false);assert.equal((await manager.observeSignalEvent({routeId:PUMP_TURN_NEAR_PUSH_ROUTE.id,payload:emit('pump-turn-near:off')})).enabled,false);
// Quiet hours consume the event, never a delayed morning replay.
now=Date.parse('2026-10-19T01:00:00+07:00');await manager.updateRoute(PUMP_TURN_NEAR_PUSH_ROUTE.id,true);
const quiet=await manager.observeSignalEvent({routeId:PUMP_TURN_NEAR_PUSH_ROUTE.id,payload:emit('pump-turn-near:quiet')});assert.equal(quiet.delivery.skipped,'QUIET_HOURS');assert.equal(sent.length,1);
now=Date.parse('2026-10-19T06:00:00+07:00');assert.equal((await manager.observeSignalEvent({routeId:PUMP_TURN_NEAR_PUSH_ROUTE.id,payload:emit('pump-turn-near:quiet')})).deduped,true);
// Persist PENDING before transport and retain unknown outcomes across restart.
const pendingFile=join(dir,'pending.json');let failures=0;
const failing=new DiscordPushManager({...options,stateFile:pendingFile,webPushService:{...service,publicConfig:()=>service.publicConfig(),sendPayload:async p=>{
 const saved=JSON.parse(await readFile(pendingFile,'utf8'));assert.equal(saved.signalEventReservations[PUMP_TURN_NEAR_PUSH_ROUTE.id+':'+p.eventId].status,'PENDING');failures++;throw Error('secret failure');}}});
await failing.updateRoute(PUMP_TURN_NEAR_PUSH_ROUTE.id,true);await failing.observeSignalEvent({routeId:PUMP_TURN_NEAR_PUSH_ROUTE.id,payload:emit('pump-turn-near:unknown')});
assert.equal(failures,1);const reloaded=new DiscordPushManager({...options,stateFile:pendingFile});await reloaded.initialize();assert.equal((await reloaded.observeSignalEvent({routeId:PUMP_TURN_NEAR_PUSH_ROUTE.id,payload:emit('pump-turn-near:unknown')})).deduped,true);
// Legacy manager JSON retains booleans/telemetry and seeds only the new route OFF.
const legacy=join(dir,'legacy.json');await writeFile(legacy,JSON.stringify({version:'DISCORD_PUSH_MANAGER_V1_POST_SUCCESS_ROUTE_ALLOWLIST_20261004',routeSettings:{[oldRoutes[0].id]:true},routeTelemetry:{[oldRoutes[0].id]:{observedCount:7}}}));
const old=new DiscordPushManager({...options,stateFile:legacy});await old.initialize();assert.equal(old.isRouteEnabled(oldRoutes[0].id),true);assert.equal(old.isRouteEnabled(PUMP_TURN_NEAR_PUSH_ROUTE.id),false);assert.equal(old.state.routeTelemetry[oldRoutes[0].id].observedCount,7);
old.stateFile=dir;await assert.rejects(old.updateRoute(PUMP_TURN_NEAR_PUSH_ROUTE.id,true));assert.equal(old.isRouteEnabled(PUMP_TURN_NEAR_PUSH_ROUTE.id),false,'failed save must not enable Push in memory');
// Detector sends the native SHORT event even with Discord and Binance OFF; no LONG/replay.
now=end+10000;const raw=rows.map(b=>({openTime:b.t,closeTime:b.end,open:b.o,close:b.c,high:b.h,low:b.l,volume:b.v,quoteVolume:b.q,takerBuyQuoteVolume:b.buy,isClosed:true}));
const events=[],watchFile=join(dir,'watch.json');let marketCalls=0;
const w=new PumpTurnWatch({file:watchFile,now:()=>now,getSymbols:()=>['TESTUSDT'],getRows:()=>raw,getLive:()=>({price,at:now}),
 nearShortPushEnabled:()=>true,onNearShortPush:async event=>{assert.equal(JSON.parse(await readFile(watchFile,'utf8')).history[0].id,event.id);events.push(event);},
 nearShortEnabled:()=>false,onNearShort:()=>marketCalls++});w.settings.discordEnabled=false;await w.scan();await new Promise(r=>setImmediate(r));assert.equal(events.length,1);assert.equal(events[0].side,'SHORT');assert.equal(marketCalls,0);await w.scan();assert.equal(events.length,1);
const restartWatch=new PumpTurnWatch({...w,file:watchFile,onNearShortPush:()=>events.push('REPLAY')});await restartWatch.scan();assert.equal(events.length,1);
const independent=new PumpTurnWatch({...w,file:join(dir,'both.json'),discordSender:async()=>({sent:1}),nearShortEnabled:()=>true,onNearShort:()=>marketCalls++,onNearShortPush:()=>{throw Error('Push unavailable');}});
await independent.scan();await new Promise(r=>setImmediate(r));assert.equal(marketCalls,1,'failed Push does not block independent MARKET callback');assert.equal(independent.history[0].delivery.status,'SENT');assert.equal(independent.error,null);
// Worker allows native type, rejects expired and forces same-origin exact signal deep link.
const listeners={},shown=[],opened=[],ctx={self:{addEventListener:(k,v)=>listeners[k]=v,skipWaiting(){},clients:{claim(){},matchAll:async()=>[],openWindow:async u=>opened.push(u)},location:{origin:'https://app.test'},registration:{showNotification:async(t,o)=>shown.push({t,o})}},URL,Date};
vm.runInNewContext(await readFile('public/opposite-liquidity-push-sw.js','utf8'),ctx);
const current={...payload,expiresAt:Date.now()+30000};let tasks=[];listeners.push({data:{json:()=>current},waitUntil:p=>tasks.push(p)});await Promise.all(tasks);assert.equal(shown.length,1);
listeners.push({data:{json:()=>({...current,expiresAt:Date.now()-1})},waitUntil:p=>tasks.push(p)});assert.equal(shown.length,1);
tasks=[];listeners.notificationclick({notification:{data:{signalType:PUMP_TURN_NEAR_PUSH_TYPE,eventId:e.id,url:'https://evil.test'},close(){}},waitUntil:p=>tasks.push(p)});await Promise.all(tasks);
assert.equal(new URL(opened[0]).origin,'https://app.test');assert.equal(new URL(opened[0]).pathname,'/pump-turn-watch');assert.equal(new URL(opened[0]).searchParams.get('signal'),e.id);
console.log('PASS managed SHORT Push default OFF/explicit ON, native exact type, independent Discord/Binance, new-only/durable no replay, TTL30/quiet no backlog, legacy settings, worker deep link. Mock only.');
