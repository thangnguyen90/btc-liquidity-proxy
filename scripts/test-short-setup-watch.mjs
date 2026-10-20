import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {detectShortSetup,detectLongSetup,advanceShortSetup,ShortSetupWatch,shortSetupPushPayload} from '../src/shortSetupWatch.js';
import {rankShortSetups,SHORT_SETUP_VERSION,SHORT_SETUP_LEGACY_VERSION,SHORT_SETUP_PUSH_TYPE} from '../public/short-setup-model.js';
import {createShortSetupDiscordSender,buildShortSetupDiscordPayload} from '../src/shortSetupDiscord.js';

const MIN=60_000,start=Date.UTC(2026,9,11,0,0);
export function shortFixture() {
  const rows=Array.from({length:80},(_,i)=>{
    const close=i<40?100+Math.sin(i)*.2:100.8+(i-40)*.1;
    return {openTime:start+i*MIN,closeTime:start+(i+1)*MIN-1,open:close-.03,high:close+.1,
      low:close-.1,close,quoteVolume:i<40?10000:20000,takerBuyQuoteVolume:i<40?5000:13000,isClosed:true};
  });
  rows[61].high=105.2;rows[71].high=105.15;
  rows.push(bar(80,{open:105.1,high:105.55,low:104.7,close:104.8}));return rows;
}
function bar(i,values={}) {
  return {openTime:start+i*MIN,closeTime:start+(i+1)*MIN-1,open:104.7,high:104.85,low:104.45,close:104.5,
    quoteVolume:50000,takerBuyQuoteVolume:15000,isClosed:true,...values};
}
let now=start+81*MIN+1000,rows=shortFixture();
const detected=detectShortSetup({symbol:'TESTUSDT',rows,now});
assert.equal(detected.status,'SETUP');assert.equal(detected.row.pattern,'FAILED_HIGH');
assert.equal(detected.row.state,'WAIT_BREAK');assert.ok(detected.row.zone.establishedAt<detected.row.createdAt);
assert.ok(detected.row.targetPrice<103,'target is old support, not a made-up liquidation band');
assert.ok(detected.row.context.pumped);
const breakRows=shortFixture();breakRows[70].low=103.25;
Object.assign(breakRows.at(-1),{open:104.5,high:104.6,low:102.98,close:103});
const broken=detectShortSetup({symbol:'TESTUSDT',rows:breakRows,now});
assert.equal(broken.status,'SETUP');assert.equal(broken.row.pattern,'BREAK_RETEST');
assert.equal(broken.row.state,'WAIT_RETEST');assert.ok(broken.row.targetPrice<broken.row.zone.low);
const future=bar(81,{open:900,high:950,low:890,close:920});
assert.deepEqual(detectShortSetup({symbol:'TESTUSDT',rows:[...rows,future],now}),detected,'future candle cannot alter levels');
const current=bar(81),next=advanceShortSetup(detected.row,current,rows.at(-1),now+MIN);
assert.equal(next.state,'READY');assert.ok(next.rewardRisk>=1.5);assert.equal(next.priorityEligible,true);
assert.equal(advanceShortSetup(next,bar(82,{high:106}),current,now+2*MIN).state,'INVALIDATED');
assert.equal(advanceShortSetup(next,bar(82,{low:102,close:102.3,open:104.5}),current,now+2*MIN).state,'CHASE');
assert.equal(advanceShortSetup(detected.row,bar(96),current,now+16*MIN).state,'EXPIRED');
assert.equal(detectShortSetup({symbol:'TESTUSDT',rows:rows.slice(-30),now}).status,'WAIT_DATA');
assert.equal(detectShortSetup({symbol:'TESTUSDT',rows:rows.filter((_,i)=>i!==60),now}).status,'WAIT_DATA');
assert.equal(detectShortSetup({symbol:'TESTUSDT',rows,now:now+120000}).status,'WAIT_DATA');
assert.equal(detectShortSetup({symbol:'TESTUSDT',rows:[...rows.slice(0,-1),{...rows.at(-1),isClosed:false}],now}).status,'WAIT_DATA');
const reclaim=rows.map(r=>({...r}));Object.assign(reclaim.at(-1),{low:102,close:105.2,open:105.3,high:105.5});
assert.notEqual(detectShortSetup({symbol:'TESTUSDT',rows:reclaim,now}).status,'SETUP','lower-wick recovery does not become short');
const giant=rows.map(r=>({...r}));for(const r of giant.slice(0,-1)){r.quoteVolume=10000;r.takerBuyQuoteVolume=5000;}
assert.equal(detectShortSetup({symbol:'TESTUSDT',rows:giant,now}).status,'NO_PUMP','dump volume cannot manufacture prior pump');
const flat=rows.map(r=>({...r,open:100,close:100,high:100.2,low:99.8}));
assert.equal(detectShortSetup({symbol:'TESTUSDT',rows:flat,now}).status,'NO_PUMP');

const retest={...detected.row,pattern:'BREAK_RETEST',state:'WAIT_RETEST',zone:{low:104.5,high:104.6,touches:2},
  triggerPrice:104.5,invalidationPrice:104.9,targetPrice:101,updatedAt:rows.at(-1).closeTime};
const retestCandle=bar(81,{open:104.5,high:104.6,low:104.0,close:104.1});
const readyRetest=advanceShortSetup(retest,retestCandle,rows.at(-1),now+MIN);
assert.equal(readyRetest.state,'READY');assert.ok(readyRetest.retestedAt);assert.ok(readyRetest.rewardRisk>=1.5);
assert.equal(advanceShortSetup(retest,{...retestCandle,high:105.5},rows.at(-1),now+MIN).state,'INVALIDATED','invalidation wins unknown OHLC path');
assert.equal(advanceShortSetup(retest,{...retestCandle,close:104.55},rows.at(-1),now+MIN).state,'WAIT_RETEST','reclaim does not confirm');
assert.equal(advanceShortSetup(retest,{...retestCandle,takerBuyQuoteVolume:40000},rows.at(-1),now+MIN).state,'WAIT_RETEST','buy-heavy retest does not confirm');
// Price reflection is a test fixture only; production derives LONG from real swings and candles.
const reflect=r=>({...r,open:205-r.open,close:205-r.close,high:205-r.low,low:205-r.high,
  takerBuyQuoteVolume:r.quoteVolume-r.takerBuyQuoteVolume});
const longRows=shortFixture().map(reflect),longFound=detectLongSetup({symbol:'LONGUSDT',rows:longRows,now});
assert.equal(longFound.status,'SETUP');assert.equal(longFound.row.pattern,'FAILED_LOW');
assert.equal(longFound.row.side,'LONG');assert.equal(longFound.row.state,'WAIT_BREAK');assert.ok(longFound.row.context.dumped);
assert.ok(longFound.row.zone.establishedAt<longFound.row.createdAt);assert.ok(longFound.row.targetPrice>longFound.row.triggerPrice);
const longCurrent=reflect(current),longReady=advanceShortSetup(longFound.row,longCurrent,longRows.at(-1),now+MIN);
assert.equal(longReady.state,'READY');assert.ok(longReady.rewardRisk>=1.5);assert.equal(longReady.priorityEligible,true);
assert.equal(advanceShortSetup(longReady,reflect(bar(82,{high:106})),longCurrent,now+2*MIN).state,'INVALIDATED');
assert.equal(advanceShortSetup(longReady,reflect(bar(82,{low:102,close:102.3,open:104.5})),longCurrent,now+2*MIN).state,'CHASE');
const longBreak=detectLongSetup({symbol:'LONGUSDT',rows:breakRows.map(reflect),now});
assert.equal(longBreak.row.pattern,'BREAK_HOLD');assert.equal(longBreak.row.state,'WAIT_RETEST');
const longRetest={...retest,side:'LONG',pattern:'BREAK_HOLD',zone:{low:100.4,high:100.5,touches:2},
  triggerPrice:100.5,invalidationPrice:100.1,targetPrice:104};
assert.equal(advanceShortSetup(longRetest,reflect(retestCandle),reflect(rows.at(-1)),now+MIN).state,'READY');
assert.equal(advanceShortSetup(longRetest,reflect({...retestCandle,high:105.5}),reflect(rows.at(-1)),now+MIN).state,'INVALIDATED');
assert.equal(advanceShortSetup(longRetest,reflect({...retestCandle,takerBuyQuoteVolume:40000}),reflect(rows.at(-1)),now+MIN).state,'WAIT_RETEST');
assert.deepEqual(detectLongSetup({symbol:'LONGUSDT',rows:[...longRows,reflect(future)],now}),longFound);
assert.equal(detectLongSetup({symbol:'LONGUSDT',rows:longRows.filter((_,i)=>i!==60),now}).status,'WAIT_DATA');
assert.equal(shortSetupPushPayload(longReady,now).side,'LONG');assert.match(shortSetupPushPayload(longReady,now).title,/LONG/);
const ordered=rankShortSetups([{symbol:'A',state:'WATCH',score:100},{symbol:'B',state:'READY',score:60,priorityEligible:true},
  {symbol:'C',state:'CHASE',score:100},{symbol:'D',state:'READY',score:99,priorityEligible:false}]);
assert.equal(ordered[0].symbol,'B');assert.equal(ordered.at(-1).symbol,'C');
const payload=shortSetupPushPayload(next,now);assert.equal(payload.signalType,SHORT_SETUP_PUSH_TYPE);
assert.equal(new URL(payload.url,'https://app.test').searchParams.get('signal'),next.id);assert.equal(payload.expiresAt,now+120000);

const directory=await mkdtemp(join(tmpdir(),'short-setup-'));let pushes=[];
const monitor=new ShortSetupWatch({file:join(directory,'history.json'),getRows:()=>rows,getSymbols:()=>['TESTUSDT'],
  pushSender:async p=>{const persisted=JSON.parse(await readFile(join(directory,'history.json'),'utf8'));
    assert.equal(persisted.history.at(-1).timeline.at(-1).delivery.status,'POSTING');pushes.push(p);return {sent:1};},now:()=>now});
await monitor.init();await monitor.scan();assert.equal(pushes.length,0,'initial data does not replay');
assert.equal(monitor.snapshot().live[0].state,'WAIT_BREAK');
rows=[...rows,current];now+=MIN;await monitor.scan();assert.equal(pushes.length,1);
await monitor.scan();assert.equal(pushes.length,1,'poll dedupe');
assert.equal(monitor.snapshot(next.id).selected.timeline.at(-1).delivery.status,'SENT');
const restarted=new ShortSetupWatch({file:join(directory,'history.json'),getRows:()=>rows,getSymbols:()=>['TESTUSDT'],
  pushSender:async()=>{throw new Error('must not replay');},now:()=>now});
await restarted.init();assert.equal(restarted.snapshot(next.id).selected.state,'DATA_GAP');
await restarted.scan();assert.equal(restarted.error,null);
await monitor.settings({pushEnabled:false,pushEarly:true});assert.equal(monitor.snapshot().pushEnabled,false);
assert.equal(JSON.parse(await readFile(join(directory,'history.json'),'utf8')).pushEarly,true);
await assert.rejects(monitor.settings({pushEnabled:'false',pushEarly:true}),/invalid/);

const oldFile=join(directory,'legacy.json');
await writeFile(oldFile,JSON.stringify({version:SHORT_SETUP_LEGACY_VERSION,pushEnabled:false,pushEarly:true,
  history:[{...detected.row,version:SHORT_SETUP_LEGACY_VERSION,timeline:[{state:'WAIT_BREAK',at:detected.row.updatedAt,delivery:{status:'POSTING'}}]}]}));
const legacy=new ShortSetupWatch({file:oldFile,now:()=>now});await legacy.init();assert.equal(legacy.error,null);
assert.equal(legacy.history[0].version,SHORT_SETUP_LEGACY_VERSION);assert.equal(legacy.history[0].state,'DATA_GAP');
assert.equal(legacy.history[0].timeline[0].delivery.status,'UNKNOWN_AFTER_RESTART');
assert.equal(legacy.history[0].timeline[0].discordDelivery,undefined,'no fabricated historical Discord result');
await legacy.settings({pushEnabled:false,pushEarly:true});assert.equal(legacy.discordEnabled,true,'old client preserves Discord');
await assert.rejects(legacy.settings({pushEnabled:false,pushEarly:false,discordEnabled:'true'}),/invalid/);

let longNow=start+81*MIN+1000,longData=longRows,discordCalls=0;
const discordFile=join(directory,'discord.json');
const dual=new ShortSetupWatch({file:discordFile,getSymbols:()=>['LONGUSDT'],getRows:()=>longData,now:()=>longNow,
  discordSender:async e=>{const saved=JSON.parse(await readFile(discordFile,'utf8'));
    assert.equal(saved.history.find(r=>r.id===e.id).timeline.at(-1).discordDelivery.status,'POSTING');
    assert.equal(e.side,'LONG');discordCalls++;return {sent:1};},pushSender:async()=>{throw new Error('push disabled');}});
await dual.settings({pushEnabled:false,pushEarly:false,discordEnabled:true});await dual.scan();assert.equal(discordCalls,0);
longData=[...longData,longCurrent];longNow+=MIN;await dual.scan();assert.equal(discordCalls,1);
await dual.scan();assert.equal(discordCalls,1);assert.equal(dual.history[0].timeline.at(-1).delivery.status,'DISABLED');
assert.equal(dual.history[0].timeline.at(-1).discordDelivery.status,'SENT');
const isolation=new ShortSetupWatch({getSymbols:()=>['LONGUSDT'],getRows:()=>longData,now:()=>longNow,
  pushSender:async()=>({sent:1}),discordSender:async()=>{throw new Error('channel failure');}});
isolation.history=[{...longFound.row,timeline:[]}];isolation.startedAt=longNow-MIN;
await isolation.scan();assert.equal(isolation.history[0].timeline.at(-1).delivery.status,'SENT');
assert.equal(isolation.history[0].timeline.at(-1).discordDelivery.status,'FAILED');assert.equal(isolation.error,null);

const discordBody=buildShortSetupDiscordPayload(longReady);assert.match(discordBody.embeds[0].title,/LONG/);
assert.match(discordBody.embeds[0].fields[1].value,/Kháng cự/);assert.deepEqual(discordBody.allowed_mentions,{parse:[]});
assert.match(buildShortSetupDiscordPayload(longFound.row).embeds[0].description,/CHƯA KÍCH HOẠT/);
assert.match(buildShortSetupDiscordPayload(next).embeds[0].title,/SHORT/);
assert.equal(createShortSetupDiscordSender({}),null);
for(const webhookUrl of ['bad','http://discord.com/api/webhooks/1/token','https://evil.test/api/webhooks/1/token',
  'https://discord.com/api/webhooks/1/token?x=secret'])assert.throws(()=>createShortSetupDiscordSender({webhookUrl}),/Invalid structure/);
let sentBody;
const sender=createShortSetupDiscordSender({webhookUrl:'https://discord.com/api/webhooks/1/test',fetchImpl:async(url,opts)=>{
  sentBody=JSON.parse(opts.body);assert.equal(opts.redirect,'error');assert.ok(opts.signal);return {ok:true,status:204};}});
assert.equal((await sender(longReady)).sent,1);assert.deepEqual(sentBody,discordBody);
const rejectSender=createShortSetupDiscordSender({webhookUrl:'https://discord.com/api/webhooks/1/test',fetchImpl:async()=>({ok:false,status:429})});
assert.equal((await rejectSender(next)).failed,1);
const unknownSender=createShortSetupDiscordSender({webhookUrl:'https://discord.com/api/webhooks/1/secret',fetchImpl:async()=>{throw new Error('secret');}});
assert.doesNotMatch(JSON.stringify(await unknownSender(next)),/secret/);
const unknownFile=join(directory,'unknown.json');
await writeFile(unknownFile,JSON.stringify({version:SHORT_SETUP_VERSION,pushEnabled:true,pushEarly:true,discordEnabled:true,
  history:[{...longFound.row,timeline:[{state:'WAIT_BREAK',at:longFound.row.updatedAt,
    delivery:{status:'POSTING'},discordDelivery:{status:'POSTING'}}]}]}));
const unknown=new ShortSetupWatch({file:unknownFile,now:()=>longNow});await unknown.init();
assert.equal(unknown.history[0].timeline[0].delivery.status,'UNKNOWN_AFTER_RESTART');
assert.equal(unknown.history[0].timeline[0].discordDelivery.status,'UNKNOWN_AFTER_RESTART');
let failedStorageCalls=0;
const failedStorage=new ShortSetupWatch({getRows:()=>longData,getSymbols:()=>['LONGUSDT'],now:()=>longNow,
  pushSender:async()=>{failedStorageCalls++;return {sent:1};},discordSender:async()=>{failedStorageCalls++;return {sent:1};}});
failedStorage.startedAt=longNow-MIN;failedStorage.history=[{...longFound.row,timeline:[]}];
failedStorage.save=async()=>{throw new Error('disk unavailable');};await failedStorage.scan();
assert.equal(failedStorageCalls,0,'no channel sends when durable intent fails');assert.ok(failedStorage.error);
const eventMonitor=new ShortSetupWatch({discordSender:async()=>({sent:1}),now:()=>longNow});
eventMonitor.pushEarly=true;eventMonitor.startedAt=longNow-MIN;let events=[];
eventMonitor.transition({...longFound.row,updatedAt:longNow-80000,timeline:[]},longNow,events);assert.equal(events.length,0,'stale early signal');
eventMonitor.transition({...longFound.row,updatedAt:longNow-1000,timeline:[]},longNow,events);assert.equal(events.length,1,'new early LONG');
assert.equal(events[0].event.discordDelivery.status,'POSTING');

const miss=new ShortSetupWatch({getRows:()=>rows,getSymbols:()=>['TESTUSDT'],now:()=>now});
miss.history=[{...detected.row,updatedAt:detected.row.updatedAt-2*MIN,timeline:[]}];await miss.scan();
assert.equal(miss.history[0].state,'DATA_GAP');
const server=await readFile(new URL('../src/server.js',import.meta.url),'utf8');
assert.match(server,/pathname === '\/short-setup-watch'/);assert.match(server,/requestUrl.pathname === '\/api\/short-setup-watch'/);
assert.match(server,/shortSetupWatch.settings\(body\)/);assert.match(server,/getRows: symbol => klineCache.getIfCached\(symbol, '1m', 90\)/);
const module=await readFile(new URL('../src/shortSetupWatch.js',import.meta.url),'utf8');
assert.doesNotMatch(module,/submitOrder|newOrder|autoEntry|binanceFilledSignalAudit/,'observe-only has no order path');
assert.equal(monitor.snapshot().version,SHORT_SETUP_VERSION);
const listeners={},shown=[],opened=[];
const self={addEventListener:(name,fn)=>{listeners[name]=fn;},registration:{showNotification:async(title,options)=>shown.push({title,options})},
  skipWaiting:async()=>{},location:{origin:'https://app.test'},clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
runInNewContext(await readFile(new URL('../public/opposite-liquidity-push-sw.js',import.meta.url),'utf8'),{self,URL,Date:{now:()=>now}});
let pending;listeners.push({data:{json:()=>({...payload,expiresAt:now+120000})},waitUntil:p=>{pending=p;}});await pending;
assert.equal(shown.length,1);assert.equal(shown[0].options.data.eventId,payload.eventId);
listeners.push({data:{json:()=>({...payload,expiresAt:now-1})},waitUntil:p=>{pending=p;}});assert.equal(shown.length,1);
listeners.notificationclick({notification:{data:shown[0].options.data,close:()=>{}},waitUntil:p=>{pending=p;}});await pending;
assert.equal(new URL(opened[0]).searchParams.get('signal'),next.id);
console.log('PASS SHORT setup: causal structure, failed-high, retest, chase/reclaim/invalidation, gaps, rank, durable push, dedupe/restart, read-only orders.');
