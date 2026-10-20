import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {plannedPumpZones,confirmationChecks,closedPumpRows,livePumpZone,STEP,PUMP_TURN_VERSION} from '../public/pump-turn-model.js';
import {PumpTurnWatch} from '../src/pumpTurnWatch.js';
import {createPumpTurnDiscordSender,pumpTurnDiscordPayload} from '../src/pumpTurnDiscord.js';
import {detect} from './research-pump-turn-entry-week.mjs';
import vm from 'node:vm';
const baseTime=1792200000000-Math.floor(1792200000000%STEP);
const rows=()=>Array.from({length:74},(_,i)=>({t:baseTime+i*STEP,end:baseTime+(i+1)*STEP-1,o:100,c:100,h:101,l:99,v:100,q:10000,buy:5000}));
const raw=a=>a.map(b=>({openTime:b.t,closeTime:b.end,open:b.o,close:b.c,high:b.h,low:b.l,volume:b.v,quoteVolume:b.q,takerBuyQuoteVolume:b.buy,isClosed:true}));
const a=rows();a[72]={...a[72],o:102,c:106,h:107,l:101,q:100000,buy:60000};
let now=a[72].end+10000;
assert.equal(closedPumpRows(raw(a),now).status,'READY');
assert.equal(closedPumpRows(raw(a.slice(0,60)),now).status,'INSUFFICIENT');
assert.equal(closedPumpRows(raw(a).map((b,i)=>i===60?{...b,openTime:b.openTime-STEP}:b),now).status,'INVALID_OR_GAP');
assert.equal(closedPumpRows(raw(a),now+1000000).status,'STALE');
const plans=plannedPumpZones('QUSDT',a.slice(0,73)),long=plans[0];assert.equal(long.contextEligible,true);
const point={at:now,price:long.zoneLow*.996};
assert.equal(livePumpZone(long,point,now).state,'NEAR');
assert.equal(livePumpZone(long,{at:now-31000,price:long.zoneLow},now).state,'WAIT_PRICE');
assert.equal(livePumpZone(long,{at:now,price:long.zoneHigh*1.001},now).state,'CHASE');
assert.equal(livePumpZone(long,point,long.expiresAt).state,'EXPIRED');
const frozen=JSON.stringify(long);livePumpZone(long,point,now);assert.equal(JSON.stringify(long),frozen);
// Runtime closed confirmation must match the fixed backtest detector (before cooldown), both directions.
for(const side of ['LONG','SHORT']){
  const f=rows();
  if(side==='LONG')f[73]={...f[73],o:101,c:110,h:111,l:100,q:200000,buy:140000};
  else{f[68]={...f[68],o:118,h:120,l:118,c:119};for(let i=69;i<73;i++)f[i]={...f[i],o:119,h:120,l:118,c:119};f[73]={...f[73],o:119,c:114,h:119,l:113,q:200000,buy:60000};}
  const plan=plannedPumpZones('XUSDT',f.slice(0,73)).find(p=>p.side===side);
  assert.equal(confirmationChecks(plan,f[73]).passed,true);
  assert.equal(detect(f,0,Infinity).some(e=>e.side===side&&e.at===f[73].end),true);
}
const temp=await mkdtemp(join(tmpdir(),'pump-turn-watch-')),file=join(temp,'state.json');
let sent=0;
const options={file,now:()=>now,getSymbols:()=>['QUSDT'],getRows:()=>raw(a),getLive:()=>({...point,at:now}),discordSender:async e=>{
  const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.history.at(-1).delivery.status,'PENDING','durable reserve precedes send');sent++;return {sent:1,failed:0,httpStatus:204};
}};
const watch=new PumpTurnWatch(options);await watch.scan();assert.equal(sent,1);assert.equal(watch.history[0].delivery.status,'SENT');
await watch.scan();assert.equal(sent,1);const snap=watch.snapshot(watch.history[0].id);assert.equal(snap.selected.symbol,'QUSDT');
snap.history[0].symbol='MUTATED';assert.equal(watch.history[0].symbol,'QUSDT');
const restart=new PumpTurnWatch(options);await restart.scan();assert.equal(sent,1,'no duplicate after restart');
await restart.update({discordEnabled:false,nearPct:1});assert.equal(restart.settings.discordEnabled,false);
await assert.rejects(()=>restart.update({discordEnabled:true,nearPct:10}));
const bad=join(temp,'bad.json');await writeFile(bad,'{invalid');const broken=new PumpTurnWatch({...options,file:bad});await broken.scan();assert.ok(broken.error);assert.equal(sent,1);
const unsafe=new PumpTurnWatch({...options,file:join(temp,'nonexistent'),getLive:()=>({price:point.price,at:now-31000})});await unsafe.scan();assert.equal(sent,1,'stale quote never sends');
const eight=new PumpTurnWatch({...options,file:join(temp,'many.json'),getSymbols:()=>Array.from({length:8},(_,i)=>'C'+i+'USDT'),discordSender:async()=>({sent:1})});await eight.scan();assert.equal(eight.history.length,5,'global max5 per scan');await eight.scan();assert.equal(eight.history.length,8);
const failed=new PumpTurnWatch({...options,file:join(temp,'failed.json'),discordSender:async()=>{throw Error('unknown');}});await failed.scan();assert.equal(failed.history[0].delivery.status,'UNKNOWN');const retry=new PumpTurnWatch({...options,file:join(temp,'failed.json')});await retry.scan();assert.equal(sent,1,'unknown delivery not blindly retried');
const payload=pumpTurnDiscordPayload({...long,livePrice:point.price,distancePct:.4,observedAt:now});assert.deepEqual(payload.allowed_mentions.parse,[]);assert.match(JSON.stringify(payload),/pump-turn-watch\?signal=/);assert.match(payload.embeds[0].title,/CHƯA XÁC NHẬN/);
assert.throws(()=>createPumpTurnDiscordSender({webhookUrl:'https://evil.test/api/webhooks/123/token'}));
const sender=createPumpTurnDiscordSender({webhookUrl:'https://discord.com/api/webhooks/123/mock',fetchImpl:async(url,init)=>{assert.equal(init.redirect,'error');assert.equal(init.method,'POST');return {ok:true,status:204};}});assert.equal((await sender({...long,observedAt:now})).sent,1);
const safe=createPumpTurnDiscordSender({webhookUrl:'https://discord.com/api/webhooks/123/mock',fetchImpl:async()=>{throw Error('secret');}});assert.doesNotMatch(JSON.stringify(await safe({...long,observedAt:now})),/secret|webhooks/);
assert.match(await readFile('src/server.js','utf8'),/isSameOriginWriteRequest\(request\)[\s\S]*pumpTurnWatch.update/);
assert.equal(JSON.parse(await readFile(file,'utf8')).version,PUMP_TURN_VERSION);
const serverSource=await readFile('src/server.js','utf8'),start=serverSource.indexOf("if (requestUrl.pathname === '/api/pump-turn-watch')"),end=serverSource.indexOf("if (requestUrl.pathname === '/api/short-setup-watch')",start);
assert.ok(start>0&&end>start);const handler=serverSource.slice(start,end);
for(const [method,origin,expected] of [['GET',false,200],['POST',false,403],['POST',true,200],['DELETE',true,405]]){
  const outputs=[],calls={init:0,snapshot:0,update:0};
  await vm.runInNewContext('(async()=>{'+handler+'})()',{
    requestUrl:new URL('http://local/api/pump-turn-watch?signal=X'),request:{method},response:{setHeader(){}},pumpTurnNearRunner:{snapshot:()=>({routeEnabled:false})},
    pumpTurnWatch:{init:async()=>calls.init++,snapshot:id=>{calls.snapshot++;return {id};},update:async()=>{calls.update++;return {ok:true};}},
    isSameOriginWriteRequest:()=>origin,readJsonBody:async()=>({}),sendJson:async(_r,body,status=200)=>outputs.push({body,status})
  });
  assert.equal(outputs[0].status,expected);assert.equal(calls.snapshot,method==='GET'?1:0);assert.equal(calls.update,method==='POST'&&origin?1:0);
}
console.log('PASS frozen zones, backtest parity, closed/fresh/gap, durable dedupe/restart/unknown, max5, settings, Discord payload and secret handling');
