import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RisingVolumeDiscordNotifier,risingVolumeDiscordPayload,risingVolumeDiscordWebhook,RISING_VOLUME_DISCORD_VERSION} from '../src/risingVolumeDiscord.js';
import {evaluateRisingVolume} from '../src/risingVolume.js';
import {risingVolumeEntryId} from '../src/risingVolumeBinance.js';
import {buildDiscordPushRouteCatalog} from '../src/discordPushManager.js';
import {flowRows,flowTestNow} from './rising-volume-flow-fixtures.mjs';
let now=flowTestNow;
const hook='https://discord.com/api/webhooks/123/test-secret',startedAt=now-20000;
function event({side='LONG',interval='1m',pattern='SUSTAINED',symbol='ONUSDT',at=now}={}) {
  const rows=flowRows({side,interval,pattern,now:at}),rows1m=flowRows({side,pattern,now:at});
  const snapshot=evaluateRisingVolume({symbol,interval,rows,rows1m,now:at}).signal;
  return {id:risingVolumeEntryId(snapshot),snapshot};
}
const long=event(),short=event({side:'SHORT'});
assert.equal(risingVolumeDiscordWebhook(hook+'?wait=true'),hook);
for(const url of ['http://discord.com/api/webhooks/123/token','https://evil.test/api/webhooks/123/token',
  'https://discord.com.evil.test/api/webhooks/123/token','https://user:pass@discord.com/api/webhooks/123/token',
  'https://discord.com:444/api/webhooks/123/token','https://discord.com/api/webhooks/x/token'])
  assert.equal(risingVolumeDiscordWebhook(url),null);
const routes=buildDiscordPushRouteCatalog({RISING_VOLUME_1M_SUSTAINED_DISCORD_WEBHOOK_URL:hook});
assert.equal(routes[0].defaultEnabled,false);assert.equal(routes[0].targetPath,'/rising-volume-watch');
assert.equal(routes[0].label,'Volume 1m · liền mạch LONG/SHORT');
for(const e of [long,short]) {
  const p=risingVolumeDiscordPayload(e,{status:'MAX_OPEN_POSITIONS'},'https://liquidity.nhathadev.trade');
  assert(p.embeds[0].title.includes(e.snapshot.side));assert.equal(p.embeds[0].color,e.snapshot.side==='LONG'?0x35f3b0:0xff6e87);
  assert.equal(p.allowed_mentions.parse.length,0);assert.match(JSON.stringify(p),/đã đủ cap chung 50/);
  assert.match(JSON.stringify(p),/TP.*\+10% ROE.*SL.*−30% ROE/);
  assert.match(JSON.stringify(p),new RegExp('id='+encodeURIComponent(e.id)));
  assert(!JSON.stringify(p).includes('test-secret'));assert(!JSON.stringify(p).includes('127.0.0.1'));
}
const directory=await mkdtemp(join(tmpdir(),'rising-volume-discord-'));
try {
  let sends=0;const requests=[];
  const create=(name,options={})=>new RisingVolumeDiscordNotifier({stateFile:join(directory,name+'.json'),webhookUrl:()=>hook,
    baseUrl:()=> 'https://liquidity.nhathadev.trade',now:()=>now,startedAt,
    fetchImpl:async(url,init)=>{sends++;requests.push({url,init});return new Response('{"id":"456"}',{status:200});},...options});
  const n=create('sent');
  assert.equal((await n.process(long,{status:'SUBMITTED',orderId:100})).status,'SENT');assert.equal(sends,1);
  assert.equal(new URL(requests[0].url).searchParams.get('wait'),'true');assert.equal(requests[0].init.redirect,'error');
  assert.equal(JSON.parse(requests[0].init.body).embeds[0].fields[2].value.includes('Order ID **100**'),true);
  assert.equal((await n.process(long)).status,'deduped');await n.flush();assert.equal(sends,1);
  const reboot=create('sent',{startedAt:now});assert.equal((await reboot.process(long)).status,'old-or-stale');
  assert.equal(reboot.snapshot().sent,1);assert(!JSON.stringify(reboot.snapshot()).includes('test-secret'));
  assert.equal((await n.process(short,{status:'EXISTING_POSITION'})).status,'SENT');assert.equal(sends,2);
  for(const interval of ['5m','15m'])assert.equal((await n.process(event({interval}))).status,'ineligible');
  for(const pattern of ['BURSTY','OTHER'])assert.equal((await n.process(event({pattern}))).status,'ineligible');
  for(const snapshot of [{...long.snapshot,volumePatternVersion:'OLD'},{...long.snapshot,volumePatternSource:'FROZEN_CHART_LEGACY'},
    {...long.snapshot,volume1mChart:[]},{...long.snapshot,price:999}])
    assert.equal((await n.process({id:long.id,snapshot})).status,'ineligible');
  assert.equal((await n.process({...long,id:'fake'})).status,'ineligible');
  assert.equal((await create('old',{startedAt:now}).process(long)).status,'old-or-stale');
  assert.equal((await create('off',{webhookUrl:()=>''}).process(long)).status,'off');
  const stale=event({symbol:'STALEUSDT'});now+=71000;
  assert.equal((await n.process(stale)).status,'old-or-stale');now=flowTestNow;
  // 429 explicitly rejected the send: safely retry via the separate outbox.
  let rateSends=0;
  const rate=create('rate',{fetchImpl:async()=>{rateSends++;return rateSends===1
    ?new Response('{"retry_after":2}',{status:429}):new Response('{"id":"789"}',{status:200});}});
  assert.equal((await rate.process(long)).status,'PENDING');assert.equal(rate.snapshot().pending,1);
  await rate.flush();assert.equal(rateSends,1);now+=2100;await rate.flush();assert.equal(rateSends,2);
  assert.equal(rate.snapshot().sent,1);await rate.process(long);assert.equal(rateSends,2);now=flowTestNow;
  const blocked=create('expire',{fetchImpl:async()=>new Response('{"retry_after":180}',{status:429})});
  await blocked.process(long);now+=181000;await blocked.flush();assert.equal(blocked.snapshot().pending,0);now=flowTestNow;
  for(const mode of ['timeout','server','rejected']) {
    let count=0;const unknown=create(mode,{fetchImpl:async()=>{count++;if(mode==='timeout')throw Error(hook);
      return new Response('',{status:mode==='server'?502:404});}});
    const result=await unknown.process(long);assert.equal(result.status,mode==='rejected'?'REJECTED':'UNKNOWN');
    await unknown.process(long);await unknown.flush();assert.equal(count,1);
    assert(!JSON.stringify(unknown.snapshot()).includes('test-secret'),'transport errors cannot leak URL');
    const restored=create(mode);await restored.load();await restored.flush();assert.equal(restored.snapshot().sent,0);
  }
  const corruptPath=join(directory,'corrupt.json');await writeFile(corruptPath,'{"version":"OLD","events":[]}');
  const corrupt=create('corrupt');assert.equal((await corrupt.process(long)).status,'state-error');
  assert.equal(await readFile(corruptPath,'utf8'),'{"version":"OLD","events":[]}');
  let io=0;const fail=create('save',{storage:{load:async()=>null,save:async()=>{throw Error('disk failed');}},
    fetchImpl:async()=>{io++;return new Response(null,{status:204});}});
  assert.equal((await fail.process(long)).status,'state-error');assert.equal(io,0);
  // Reservation is durable before network; crash while POSTING never replays.
  const durable=create('durable',{fetchImpl:async()=>{const r=JSON.parse(await readFile(join(directory,'durable.json'),'utf8'));
    assert.equal(r.version,RISING_VOLUME_DISCORD_VERSION);assert.equal(r.events[long.id].status,'POSTING');return new Response(null,{status:204});}});
  assert.equal((await durable.process(long)).status,'SENT');
  const saved=JSON.parse(await readFile(join(directory,'durable.json'),'utf8'));saved.events[long.id].status='POSTING';
  await writeFile(join(directory,'durable.json'),JSON.stringify(saved));
  const crashed=create('durable');await crashed.load();await crashed.flush();assert.equal(crashed.snapshot().uncertain,1);
  // Multiple eligible coins are not limited to a top-5/batch gate.
  const many=create('many');let before=sends;
  await Promise.all(Array.from({length:8},(_,i)=>many.process(event({symbol:'COIN'+i+'USDT'}),{status:'OFF'})));
  assert.equal(sends-before,8);assert.equal(many.snapshot().sent,8);
  const server=await readFile(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(server,/void risingVolumeDiscordNotifier\.process\(observation,/,'Discord is not awaited in the entry loop');
} finally {await rm(directory,{recursive:true,force:true});}
console.log('Rising volume Discord passed: fresh initial SUSTAINED 1m LONG/SHORT only, blocked entry still alerts, exact-ID/restart dedupe, durable intent, 429 queue/expiry, ambiguous no retry, safe secret-free snapshots, default-OFF Push. Mock POST only.');
