import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {evaluateParabolicPumpRisk,ParabolicPumpRiskWatch,PARABOLIC_RISK_VERSION,
  parabolicPumpRiskPayload,parabolicRiskWebhook} from '../src/parabolicPumpRiskWatch.js';
import {buildDiscordPushRouteCatalog} from '../src/discordPushManager.js';
import {preContext} from './fixtures-parabolic-confluence.mjs';
const STEP=300_000,END=Date.UTC(2026,9,24,0),SYMBOL='TESTUSDT';
const base=()=>Array.from({length:90},(_,i)=>({openTime:END-(90-i)*STEP,closeTime:END-(89-i)*STEP-1,
  open:100,high:100.2,low:99.8,close:100,quoteVolume:20_000,takerBuyQuoteVolume:10_000,isClosed:true}));
function shape(kind='pre'){
  const rows=base();let closes=kind==='pre'?[100.3,100.6,101]:kind==='early'?[103,107,110]:[110,140,160];
  for(let i=0;i<3;i++){const r=rows[87+i],o=i?closes[i-1]:100,c=closes[i];Object.assign(r,{open:o,close:c,high:c*1.001,low:o*.999,quoteVolume:120_000,takerBuyQuoteVolume:84_000});}
  if(kind==='exhaust')Object.assign(rows.at(-1),{open:150,high:200,low:120,close:130,quoteVolume:160_000,takerBuyQuoteVolume:48_000});
  if(kind==='crash'){
    Object.assign(rows.at(-2),{open:110,high:200,low:109,close:180,quoteVolume:160_000,takerBuyQuoteVolume:112_000});
    Object.assign(rows.at(-1),{open:180,high:181,low:89,close:90,quoteVolume:160_000,takerBuyQuoteVolume:48_000});
  }
  return rows;
}
const evaluate=(rows,options={})=>evaluateParabolicPumpRisk(rows,{symbol:SYMBOL,now:END+1000,...options});
for(const [kind,stage] of [['pre','PRE_PUMP_WATCH'],['early','PUMP_ACCELERATING'],['danger','PARABOLIC_DANGER'],['exhaust','EXHAUSTION'],['crash','CRASH_OBSERVED']]){
  const e=evaluate(shape(kind)).event;assert.equal(e?.stage,stage,kind);assert.equal(e.observeOnly,true);
  const p=parabolicPumpRiskPayload(e);assert.deepEqual(p.allowed_mentions,{parse:[]});assert.match(p.embeds[0].description,/OBSERVE ONLY/);assert.match(p.embeds[0].fields.at(-1).value,/symbol=TESTUSDT/);
}
assert.equal(evaluate(base()).event,null,'flat low-volume coin does not alert');
const future={...base().at(-1),openTime:END+STEP,closeTime:END+2*STEP-1,high:900,close:800};
assert.deepEqual(evaluate([...shape('pre'),future]).event,evaluate(shape('pre')).event,'future candle cannot change a causal event');
const bad=shape('pre');bad.splice(45,1);assert.equal(evaluate(bad).status,'INVALID_OR_GAP');
assert.equal(evaluate(shape('pre'),{now:END+400_000}).status,'STALE');
assert.equal(evaluate(shape('pre'),{now:END+100_000}).event,null,'do not retrospectively send a stale closed signal');
const malformed=shape('pre');malformed.at(-1).takerBuyQuoteVolume=200_000;assert.equal(evaluate(malformed).status,'INVALID_OR_GAP');
const oneSided=shape('pre');oneSided.slice(-3).forEach(r=>r.takerBuyQuoteVolume=r.quoteVolume*.4);assert.equal(evaluate(oneSided).event,null,'pre-build needs real taker buying');
const alreadyRan=shape('pre');alreadyRan.at(-1).close=110;alreadyRan.at(-1).high=111;assert.notEqual(evaluate(alreadyRan).event?.stage,'PRE_PUMP_WATCH','a breakout far above the base is not a pre-pump alert');
const live=shape('pre');live.at(-1).isClosed=false;
const liveNow=live.at(-1).openTime+60_000;
assert.equal(evaluate(live,{now:liveNow,liveAt:liveNow}).event?.stage,'PRE_PUMP_WATCH');
assert.equal(evaluate(live,{now:liveNow,liveAt:liveNow-16_000}).event,null,'stale live socket is not proof');
assert.equal(evaluate(live,{now:liveNow,liveAt:liveNow+1}).event,null,'future tick is not proof');
const liveExhaust=shape('exhaust');liveExhaust.at(-1).isClosed=false;
assert.notEqual(evaluate(liveExhaust,{now:liveNow,liveAt:liveNow}).event?.stage,'EXHAUSTION','exhaustion requires closed confirmation');
assert.equal(parabolicRiskWebhook(''),null);
assert.throws(()=>parabolicRiskWebhook('https://example.test/api/webhooks/1/secret'));
assert.throws(()=>parabolicRiskWebhook('https://discord.com/api/webhooks/1/secret?wait=true'));
const url='https://discord.com/api/webhooks/123/mock-secret';
const catalog=buildDiscordPushRouteCatalog({PARABOLIC_PUMP_RISK_DISCORD_WEBHOOK_URL:url});
assert.equal(catalog[0].defaultEnabled,false);assert.match(catalog[0].label,/nghi tích lũy/);
const dir=await mkdtemp(join(tmpdir(),'parabolic-risk-'));
try{
  let clock=END-2000,rows=shape('pre'),calls=0;
  const file=join(dir,'state.json');
  const create=(extra={})=>new ParabolicPumpRiskWatch({file,loadPrePumpContext:async e=>preContext(e,clock),getSymbols:()=>[SYMBOL],getRows:()=>rows,now:()=>clock,webhookUrl:url,
    fetchImpl:async(_u,options)=>{
      calls++;const state=JSON.parse(await readFile(file));assert.equal(state.history.at(-1).delivery.status,'RESERVED','persist before POST');
      assert.match(JSON.parse(options.body).embeds[0].title,/NGHI TÍCH LŨY/);return {ok:true,status:204};
    },...extra});
  const watch=create();clock=END+1000;await watch.scan();assert.equal(calls,1);await watch.scan();assert.equal(calls,1);
  assert.equal(watch.snapshot().history[0].delivery.status,'SENT');assert(!JSON.stringify(watch.snapshot()).includes('mock-secret'));
  const next={...rows.at(-1),openTime:END,closeTime:END+STEP-1,open:101,low:100.95,close:101.15,high:101.2};rows=[...rows,next];
  clock=END+STEP-1000;const restarted=create();clock=END+STEP+1000;await restarted.scan();assert.equal(calls,1,'restart does not resend within stage cooldown');
  let unknownCalls=0;clock=END-2000;rows=shape('pre');
  const unknown=new ParabolicPumpRiskWatch({loadPrePumpContext:async e=>preContext(e,clock),file:join(dir,'unknown.json'),getSymbols:()=>[SYMBOL],getRows:()=>rows,webhookUrl:url,now:()=>clock,fetchImpl:async()=>{unknownCalls++;throw Error('mock network');}});
  clock=END+1000;await unknown.scan();assert.equal(unknown.snapshot().history[0].delivery.status,'UNKNOWN');clock+=60_000;await unknown.scan();assert.equal(unknownCalls,1,'unknown POST is not retried');
  let rateCalls=0;clock=END-2000;
  const rate=new ParabolicPumpRiskWatch({loadPrePumpContext:async e=>preContext(e,clock),file:join(dir,'rate.json'),getSymbols:()=>[SYMBOL,'OTHERUSDT'],getRows:()=>rows,webhookUrl:url,now:()=>clock,fetchImpl:async()=>{rateCalls++;return {ok:false,status:429,json:async()=>({retry_after:120})};}});
  clock=END+1000;await rate.scan();assert.equal(rateCalls,1);assert.equal(rate.snapshot().retryUntil,clock+120_000);
  let deniedCalls=0;clock=END-2000;
  const storage=new ParabolicPumpRiskWatch({loadPrePumpContext:async e=>preContext(e,clock),file:join(dir,'storage.json'),getSymbols:()=>[SYMBOL],getRows:()=>rows,webhookUrl:url,now:()=>clock,fetchImpl:async()=>{deniedCalls++;return {ok:true,status:204};}});
  storage.save=async()=>{throw Error('mock disk full');};clock=END+1000;await storage.scan();assert.equal(deniedCalls,0);assert.equal(storage.error,'SCAN_OR_STORAGE_FAILED');
  const corruptFile=join(dir,'corrupt.json');await writeFile(corruptFile,'{"version":"legacy-unknown"}');
  const corrupt=create({file:corruptFile});await corrupt.scan();assert.equal(corrupt.error,'STATE_READ_FAILED');
  const bootstrap=create({file:join(dir,'bootstrap.json')});await bootstrap.scan();assert.equal(bootstrap.snapshot().history.length,0,'do not replay closed pre-start candles');
  const liveBootstrap=new ParabolicPumpRiskWatch({file:join(dir,'live-start.json'),getSymbols:()=>[SYMBOL],getRows:()=>live,getLiveAt:()=>liveNow,webhookUrl:url,now:()=>liveNow,fetchImpl:async()=>{throw Error('must not send');}});
  await liveBootstrap.scan();assert.equal(liveBootstrap.snapshot().history.length,0,'pre-start open candle does not burst on startup');
  clock=END-2000;rows=shape('pre');let boundedCalls=0;
  const bounded=new ParabolicPumpRiskWatch({loadPrePumpContext:async e=>preContext(e,clock),file:join(dir,'bounded.json'),getSymbols:()=>Array.from({length:6},(_,i)=>`COIN${i}USDT`),getRows:()=>rows,webhookUrl:url,now:()=>clock,fetchImpl:async()=>{boundedCalls++;return {ok:true,status:204};}});
  clock=END+1000;await bounded.scan();assert.equal(boundedCalls,3);await bounded.scan();assert.equal(boundedCalls,6,'bounded context reads; deduped coins cannot starve a new coin');
  clock=END-2000;let escalationCalls=0;
  const escalation=new ParabolicPumpRiskWatch({loadPrePumpContext:async e=>preContext(e,clock),file:join(dir,'escalation.json'),getSymbols:()=>[SYMBOL],getRows:()=>rows,webhookUrl:url,now:()=>clock,fetchImpl:async()=>{escalationCalls++;return {ok:true,status:204};}});
  clock=END+1000;await escalation.scan();
  rows=[...rows,{...rows.at(-1),openTime:END,closeTime:END+STEP-1,open:101,high:120.1,low:100.95,close:120}];
  clock=END+STEP+1000;await escalation.scan();assert.equal(escalationCalls,2,'an escalation is not blocked by the pre-build cooldown');
  assert.equal(escalation.snapshot().history[0].stage,'PUMP_ACCELERATING');
  assert.equal(PARABOLIC_RISK_VERSION,watch.snapshot().version);
}finally{await rm(dir,{recursive:true,force:true});}
const server=await readFile(new URL('../src/server.js',import.meta.url),'utf8');
const apiStart=server.indexOf("    if (requestUrl.pathname === '/api/parabolic-pump-risk-watch')");
const apiEnd=server.indexOf("    if (requestUrl.pathname === '/api/rising-volume-warmup'",apiStart);
assert(apiStart>0&&apiEnd>apiStart);
const api=server.slice(apiStart,apiEnd);let initCalls=0;const responses=[];
const runApi=new vm.Script(`(async()=>{${api}})()`);
const ctx={requestUrl:new URL('http://localhost/api/parabolic-pump-risk-watch'),request:{method:'GET'},response:{setHeader(){}},
  parabolicPumpRiskWatch:{init:async()=>{initCalls++;},snapshot:()=>({configured:true,observeOnly:true})},sendJson:async(_r,body,status=200)=>responses.push({body,status})};
await runApi.runInNewContext(ctx);assert.equal(initCalls,1);assert.equal(responses[0].status,200);
ctx.request.method='POST';await runApi.runInNewContext(ctx);assert.equal(responses.at(-1).status,405);assert.equal(initCalls,1);
assert(!api.includes('.scan('),'GET status must not trigger scans or delivery');
console.log('PASS parabolic risk: pre-build causal/live/closed stages, gaps, timing, durable no-replay, 429, storage, secret isolation; mock sends only');
