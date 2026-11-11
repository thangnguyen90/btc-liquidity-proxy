import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {provePumpHighWhaleShort,S,H} from '../src/pumpHighWhaleShortModel.js';
import {PumpHighWhaleShortDiscordWatch,pumpHighWhaleShortPayload,PUMP_HIGH_WHALE_SHORT_RULE} from '../src/pumpHighWhaleShortDiscordWatch.js';
const directory=await mkdtemp(join(tmpdir(),'pump-high-whale-short-'));let clock=Date.UTC(2026,10,3,14,15,30),posts=0,postMode='ok',chartMode='ok',badToken=false;const stateFile=join(directory,'state.json'),cache=join(directory,'cache');await mkdir(cache);
const symbol='TESTUSDT',decision=()=>Math.floor(clock/S)*S,cut=()=>decision()-15*60000;
function rows(){const at=decision();const a=Array.from({length:288},(_,i)=>{const t=at-(288-i)*S;return[t,100,100.5,99.5,100,10,t+S-1,1000000,0,0,0];});a[287]=[at-S,115,120,110,119,10,at-1,1000000,0,0,0];return a;}
function token(s=symbol){return {symbol:s,basis:badToken?'smart':'whales',whale_count:100,scanned_at:Math.floor((clock-60000)/1000)};}
function chart(s=symbol){const c=cut();return {symbol:s,locked:true,whales:[[c/1000-14400,60,40,700,300],[c/1000,55,45,650,350],[Math.floor((clock-30000)/1000),54,46,648,352]],crowd:[[c/1000-3600,.34],[c/1000,.35]],refresh:chartMode==='refresh'?[c-3600000].map(t=>t/1000):[]};}
const proof=()=>provePumpHighWhaleShort({symbol,rows:rows(),chart:chart(),token:token(),now:clock});
let e=proof();assert.equal(e.status,'QUALIFIED');assert.equal(e.position.whaleLong,65);assert.equal(e.position.crowdShort,65);assert.equal(e.position.whaleDelta4hPp,-5);assert.equal(e.affectsOrders,false);
const payload=pumpHighWhaleShortPayload(e);assert.equal(payload.embeds[0].color,0xf59e0b);assert.equal(payload.embeds[0].color,PUMP_HIGH_WHALE_SHORT_RULE.color);assert.deepEqual(payload.allowed_mentions.parse,[]);assert.match(JSON.stringify(payload),/15 phút/);assert.doesNotMatch(JSON.stringify(payload),/92[,.]3|6[,.]89/,'no research win-rate marketing in live alert');
assert.equal(provePumpHighWhaleShort({symbol,rows:rows(),chart:{...chart(),symbol:'OTHERUSDT'},token:token(),now:clock}).status,'INVALID_CHART');
badToken=true;assert.equal(proof().status,'LIVE_BASIS_MISSING_OR_STALE');badToken=false;
chartMode='refresh';assert.equal(proof().status,'COHORT_REFRESH_EXCLUDED');chartMode='ok';
const baseChart=chart();baseChart.whales[1][3]=701;baseChart.whales[1][4]=299;assert.equal(provePumpHighWhaleShort({symbol,rows:rows(),chart:baseChart,token:token(),now:clock}).status,'CONDITIONS_NOT_MET');
const flatCrowd=chart();flatCrowd.crowd[0][1]=.35;assert.equal(provePumpHighWhaleShort({symbol,rows:rows(),chart:flatCrowd,token:token(),now:clock}).status,'CONDITIONS_NOT_MET');
assert.equal(provePumpHighWhaleShort({symbol,rows:rows(),chart:chart(),token:token(),now:clock+900001}).status,'PRICE_NOT_READY_OR_NOT_HIGH');
const futureToken={...token(),scanned_at:clock/1000+1};assert.equal(provePumpHighWhaleShort({symbol,rows:rows(),chart:chart(),token:futureToken,now:clock}).status,'LIVE_BASIS_MISSING_OR_STALE');
const gapRows=rows();gapRows.splice(100,1);assert.equal(provePumpHighWhaleShort({symbol,rows:gapRows,chart:chart(),token:token(),now:clock}).status,'PRICE_NOT_READY_OR_NOT_HIGH');
async function http(url,options={}){
 if(options.method==='POST'){
  posts++;const saved=JSON.parse(await readFile(activeFile,'utf8'));assert.ok(Object.values(saved.alerts).length);assert.equal(saved.history.at(-1).delivery.status,'RESERVED','durable before transport');
  if(postMode==='throw')throw Error('network');return {ok:postMode!=='429',status:postMode==='429'?429:204,json:async()=>({retry_after:100})};
 }
 const u=new URL(url),s=u.searchParams.get('symbol');if(chartMode==='rate-limit'&&u.pathname.endsWith('/chart'))return {ok:false,status:429};
 return {ok:true,json:async()=>u.pathname.endsWith('/token')?token(s):chart(s)};
}
let activeFile=stateFile;
const make=file=>new PumpHighWhaleShortDiscordWatch({file,directory:cache,getSymbols:()=>[symbol],webhookUrl:'https://discord.com/api/webhooks/123/test-placeholder',fetchImpl:http,now:()=>clock});
async function cached(s=symbol){await writeFile(join(cache,s+'.json'),JSON.stringify({symbol:s,price:rows()}));}
try{
 await cached();const w=make(stateFile);await w.scan();assert.equal(posts,1);assert.equal(w.snapshot().history[0].delivery.status,'SENT');assert.equal(w.coverage.priceReady,1);assert.equal(w.coverage.checked,1);assert.equal(w.snapshot().affectsOrders,false);
 await w.scan();assert.equal(posts,1);await make(stateFile).scan();assert.equal(posts,1,'restart cooldown');
 const before=posts;clock+=8*H;await cached();await w.scan();assert.equal(posts,before+1,'new current setup after8h can notify');
 const oldEvent=w.state.alerts[symbol].eventId;assert.equal(w.canSend(symbol,oldEvent),false,'same event never replayed');
 clock=Date.UTC(2026,10,4,14,15,30);await cached();
 activeFile=join(directory,'unknown.json');postMode='throw';await make(activeFile).scan();const unknownPosts=posts;postMode='ok';clock+=61000;await make(activeFile).scan();assert.equal(posts,unknownPosts,'unknown send never retried after restart');
 activeFile=join(directory,'rate.json');postMode='429';await make(activeFile).scan();const ratePosts=posts,saved=JSON.parse(await readFile(activeFile,'utf8'));assert.ok(saved.retryUntil>=clock+100000);await make(activeFile).scan();assert.equal(posts,ratePosts);postMode='ok';
 activeFile=join(directory,'refresh.json');chartMode='refresh';await make(activeFile).scan();assert.equal(posts,ratePosts);chartMode='rate-limit';const upstream=make(join(directory,'upstream.json'));await upstream.scan();assert.ok(upstream.state.retryUntil>clock);assert.equal(posts,ratePosts);chartMode='ok';
 await writeFile(join(directory,'broken.json'),'{}');const broken=make(join(directory,'broken.json'));await broken.scan();assert.equal(broken.error,'STATE_READ_FAILED_NO_SEND');assert.equal(posts,ratePosts);
 const storage=make('/dev/null/impossible');await storage.scan();assert.ok(storage.error);assert.equal(posts,ratePosts);
 const wrongUniverse=new PumpHighWhaleShortDiscordWatch({file:join(directory,'universe.json'),directory:cache,getSymbols:()=>['OTHERUSDT'],webhookUrl:'https://discord.com/api/webhooks/123/test-placeholder',fetchImpl:http,now:()=>clock});await wrongUniverse.scan();assert.equal(wrongUniverse.coverage.checked,0);
 const symbols=Array.from({length:7},(_,i)=>'TEST'+i+'USDT');for(const s of symbols)await cached(s);
 activeFile=join(directory,'batch.json');const batch=new PumpHighWhaleShortDiscordWatch({file:activeFile,directory:cache,getSymbols:()=>symbols,webhookUrl:'https://discord.com/api/webhooks/123/test-placeholder',fetchImpl:http,now:()=>clock});const start=posts;await batch.scan();assert.equal(posts-start,3);assert.equal(batch.coverage.checked,3);await batch.scan();assert.equal(posts-start,6,'fair next batch without duplicate');
 assert.throws(()=>new PumpHighWhaleShortDiscordWatch({webhookUrl:'https://evil.test/hook'}));assert.throws(()=>new PumpHighWhaleShortDiscordWatch({webhookUrl:'https://discord.com/api/webhooks/123/test?extra=1'}));
 console.log('PASS SHORT observation Discord: same branch, lag15m, orange payload, basis/freshness/refresh/gap rejection, 8h cooldown/restart, durable reservation, unknown/429/storage failures, universe restriction,3per-scan cap. Mock transport only.');
}finally{await rm(directory,{recursive:true,force:true});}
