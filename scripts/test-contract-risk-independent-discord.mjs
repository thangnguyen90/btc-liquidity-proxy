import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {BinanceContractRiskMonitor,buildContractRiskPush,collectContractRisks} from '../src/binanceContractRisk.js';
import {buildContractRiskDiscordPayload,createContractRiskDiscordSender} from '../src/binanceContractRiskDiscord.js';
const dir=await mkdtemp(join(tmpdir(),'contract-risk-v2-'));
let now=Date.parse('2026-10-17T06:00:00Z');
const info={symbols:[{symbol:'EPICUSDT',quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING',deliveryDate:now+3*86400_000}]};
const risk=collectContractRisks(info,[],now)[0],payload=buildContractRiskPush(risk,now),pushes=[],discord=[];
const file=join(dir,'risk.json');
try{
  // Old Push history must not suppress the first CURRENT schedule Discord.
  await writeFile(file,JSON.stringify({risks:[risk],checkedAt:now,nextCheckAt:now+300_000,sent:{[payload.eventId]:now},
    alerts:[{...payload,delivery:{sent:4}}]}));
  const options={file,notices:[],now:()=>now,loadExchangeInfo:async()=>info,
    pushSender:async p=>{pushes.push(p);return {sent:4};},
    discordSender:async(r,at)=>{discord.push({r,at});return {attempted:1,sent:1,failed:0,httpStatus:204};},discordChannel:'DEFAULT'};
  const monitor=new BinanceContractRiskMonitor(options);await monitor.tick();
  assert.equal(pushes.length,0);assert.equal(discord.length,1);assert.equal(monitor.state.alerts[0].delivery.sent,4);
  assert.equal(monitor.snapshot().risks[0].discordDelivery.sent,1);
  const before=await readFile(file,'utf8');for(let i=0;i<4;i++)monitor.snapshot();
  assert.equal(await readFile(file,'utf8'),before,'GET snapshot is read-only');
  assert.ok(JSON.stringify(monitor.snapshot()).length<5000);
  await new BinanceContractRiskMonitor(options).tick();assert.equal(discord.length,1,'restart dedupe');
  now=info.symbols[0].deliveryDate-3_600_000;await monitor.tick();assert.equal(discord.length,2);assert.equal(pushes.length,1);
  now=info.symbols[0].deliveryDate+180_000;await monitor.tick();assert.equal(discord.length,2,'no historical replay');
  assert.equal(monitor.state.alerts[0].discordDelivery.skipped,'HISTORICAL_EVENT');
  now=Date.parse('2026-10-17T06:00:00Z');
  const failing=new BinanceContractRiskMonitor({...options,file:join(dir,'fail.json'),discordSender:async()=>{throw Error('do not leak secret URL');}});
  await failing.tick();assert.equal(failing.state.alerts[0].delivery.sent,4,'Discord failure does not block Push');
  assert.equal(failing.state.alerts[0].discordDelivery.error,'DISCORD_FAILED_OR_UNKNOWN');
  const noConfig=new BinanceContractRiskMonitor({...options,file:join(dir,'late-config.json'),discordSender:null});await noConfig.tick();
  assert.equal(Object.keys(noConfig.state.discordSent).length,0,'no configuration must not consume Discord dedupe');
  noConfig.discordSender=options.discordSender;await noConfig.tick();assert.equal(noConfig.snapshot().risks[0].discordDelivery.sent,1);
  // Unknown/PENDING sends are reserved durably and must not duplicate after restart.
  const reserved=JSON.parse(await readFile(file,'utf8'));reserved.discordSent[payload.eventId]=now;
  reserved.alerts.find(a=>a.eventId===payload.eventId).discordDelivery={skipped:'PENDING'};
  reserved.checkedAt=now;reserved.nextCheckAt=now+300_000;await writeFile(file,JSON.stringify(reserved));
  const count=discord.length;await new BinanceContractRiskMonitor(options).tick();assert.equal(discord.length,count);
  const body=buildContractRiskDiscordPayload({...risk,restrictedAt:null},now);
  assert.deepEqual(body.allowed_mentions,{parse:[]});assert.match(body.embeds[0].fields[1].value,/Chưa có giờ xác nhận/);
  assert.ok(body.embeds[0].fields[3].value.includes(encodeURIComponent(risk.riskId)));
  let sent;
  const sender=createContractRiskDiscordSender({webhookUrl:'https://discord.com/api/webhooks/123/test-secret',fetchImpl:async(url,init)=>{sent={url,init};return {ok:true,status:204};}});
  assert.equal((await sender(risk,now)).sent,1);assert.equal(sent.init.redirect,'error');
  assert.equal(createContractRiskDiscordSender({webhookUrl:''}),null);
  for(const url of ['http://discord.com/api/webhooks/123/token','https://evil.test/api/webhooks/123/token','https://discord.com/api/webhooks/123/token?leak=1'])
    assert.throws(()=>createContractRiskDiscordSender({webhookUrl:url}),/Invalid/);
  const failSender=createContractRiskDiscordSender({webhookUrl:'https://discord.com/api/webhooks/123/token',fetchImpl:async()=>{throw Error('secret');}});
  assert.equal((await failSender(risk,now)).error,'DISCORD_FAILED_OR_UNKNOWN');
  // Execute the real lightweight endpoint with a poison zone manager: no read
  // of huge zone history or any market/notification side effect is permitted.
  const server=await readFile(new URL('../src/server.js',import.meta.url),'utf8');
  const start=server.indexOf("    if (requestUrl.pathname === '/api/binance-contract-risks')");
  const end=server.indexOf("    if (requestUrl.pathname === '/api/liquidity-zone-manager')",start);
  assert.ok(start>0&&end>start);let result,headers={};
  const route=runInNewContext('(async function(method){const request={method};'+server.slice(start,end)+'})',{
    requestUrl:{pathname:'/api/binance-contract-risks'},response:{setHeader:(k,v)=>{headers[k]=v;}},
    contractRiskMonitor:monitor,sendJson:async(_res,body,status=200)=>{result={body,status};},
    liquidityZoneManager:{snapshot(){throw Error('Huge history touched');}},
  });
  await route('GET');assert.equal(result.status,200);assert.equal(headers['Cache-Control'],'no-store');
  assert.ok(!('watches' in result.body));await route('POST');assert.equal(result.status,405);
  console.log('PASS: independent GET, legacy Push/Discord isolation, current bootstrap, stage/restart/unknown dedupe, stale/history, source/deep link, safe sender');
}finally{await rm(dir,{recursive:true,force:true});}
