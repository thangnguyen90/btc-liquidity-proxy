import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {positionSizeTier,whalePositionSizeSnapshot,attachWhalePositionMarketCap,validWhalePositionSize,whalePositionSizePresentation,PUMPGLASS_POSITION_SIZE_VERSION,PUMPGLASS_POSITION_SIZE_LEGACY_VERSION} from '../src/pumpglassPositionSize.js';
import {capFixture} from './fixtures-pumpglass-market-cap.mjs';
import {whaleSmartDominanceProof,proveDominanceCrowdTrend,whaleSmartDominancePayload,PumpglassWhaleSmartDominanceWatch} from '../src/pumpglassWhaleSmartDominance.js';

const now=1794144908000,symbol='4USDT';
const token=(longUsd=313713,shortUsd=895705,side='SHORT')=>({symbol,basis:'whales',price:.0094,whale_count:102,scanned_at:now/1000-30,
 now:[{k:'Whales',v:side==='LONG'?74.1:25.9},{k:'Smart traders',v:side==='LONG'?71.7:28.3},{k:'Crowd',v:side==='LONG'?25.5:74.5}],
 long:{size_usd:longUsd},short:{size_usd:shortUsd}});
const chart=side=>({symbol,crowd:[[(now-30000-3600000)/1000,side==='LONG'?.30:.70],[(now-30000)/1000,side==='LONG'?.25:.75]]});
const event=(longUsd,shortUsd,side='SHORT',cap=100000000)=>{const t=token(longUsd,shortUsd,side),p=whaleSmartDominanceProof(t,symbol,now);p.crowdTrend=proveDominanceCrowdTrend(p,chart(side),now);p.positionSize=attachWhalePositionMarketCap(p.positionSize,capFixture(symbol,now,cap,'4-2'),now);return p;};

for(const [v,tier]of [[0,'SMALL'],[99999.99,'SMALL'],[100000,'MEDIUM'],[999999.99,'MEDIUM'],[1000000,'LARGE'],[10000000,'LARGE'],[null,'UNKNOWN'],[undefined,'UNKNOWN'],['1000000','UNKNOWN'],[-1,'UNKNOWN'],[NaN,'UNKNOWN'],[Infinity,'UNKNOWN']])assert.equal(positionSizeTier(v,100000000),tier);
assert.equal(positionSizeTier(900000,10000000),'LARGE');assert.equal(positionSizeTier(900000,1000000000),'SMALL');
for(const bad of [null,undefined,0,-1,NaN,Infinity,'1000000'])assert.equal(positionSizeTier(900000,bad),'UNKNOWN');
const e=event(313713,895705);assert.ok(validWhalePositionSize(e,e.positionSize));
const view=whalePositionSizePresentation(e);assert.equal(view.tier,'MEDIUM');assert.equal(view.color,0xf59e0b);
assert.match(view.field.value,/\$313,713/);assert.match(view.field.value,/\$895,705/);assert.match(view.field.value,/2\.86×/);assert.match(view.field.value,/\$1,209,418/);
assert.match(view.field.value,/không phải toàn sàn/);assert.match(view.field.value,/USD của Smart/);
for(const side of ['LONG','SHORT'])for(const [amount,color,title]of [[99999,0x94a3b8,'NHỎ'],[100000,0xf59e0b,'VỪA'],[1000000,0x8b5cf6,'LỚN'],[null,0x475569,'CHƯA RÕ']]){
 const e=event(side==='LONG'?amount:2000000,side==='SHORT'?amount:2000000,side),p=whaleSmartDominancePayload(e),b=p.embeds[0];
 assert.equal(b.color,color,'embed follows signal-side USD, not total or opposite side');assert.match(b.title,new RegExp('QUY MÔ '+title));
 assert.ok(b.title.startsWith(side==='LONG'?'🟢':'🔴'),'direction icon remains visible');
 assert.ok(b.fields.some(f=>f.name==='QUY MÔ VỊ THẾ CÁ VOI (USD)'));assert.ok(b.fields.every(f=>f.value.length<=1024));
 const length=b.title.length+b.description.length+b.footer.text.length+b.fields.reduce((s,f)=>s+f.name.length+f.value.length,0);assert.ok(length<=6000);
 assert.deepEqual(p.allowed_mentions.parse,[]);assert.doesNotMatch(JSON.stringify(p),/NaN|Infinity/);
}
for(const [long,short]of [[0,0],[0,100000],[100000,0],[100000,100000],[null,100000],[100000,null]]){
 const value=whalePositionSizePresentation(event(long,short)).field.value;assert.doesNotMatch(value,/NaN|Infinity/);
 if(long===0||short===0)assert.doesNotMatch(value,/Infinity/);
}
assert.equal(whalePositionSizePresentation({...e,positionSize:undefined}).tier,'UNKNOWN','old state never infers USD from percentage');
const legacy={...e.positionSize,version:PUMPGLASS_POSITION_SIZE_LEGACY_VERSION,tier:'MEDIUM'};
assert.ok(validWhalePositionSize(e,legacy));const old=whalePositionSizePresentation({...e,positionSize:legacy});assert.equal(old.tier,'UNKNOWN');assert.match(old.field.value,/\$895,705/);assert.match(old.capField.value,/Snapshot cũ/);
const beforeCap=whaleSmartDominanceProof(token(),symbol,now);assert.equal(whalePositionSizePresentation(beforeCap).tier,'UNKNOWN');assert.match(whalePositionSizePresentation(beforeCap).field.value,/\$895,705/);
const stale=attachWhalePositionMarketCap(beforeCap.positionSize,{...capFixture(symbol,now),sourceAt:now-900001},now);assert.equal(stale.marketCap,null);assert.equal(stale.tier,'UNKNOWN');
assert.equal(validWhalePositionSize(e,{...e.positionSize,signalCapPct:99}),false);
const over100=event(1,200000000,'SHORT',1000000);assert.equal(over100.positionSize.signalCapPct,20000,'do not clamp notional/cap to ownership percentage');
for(const p of [{...e.positionSize,sourceAt:e.sourceAt+1},{...e.positionSize,symbol:'OTHERUSDT'},{...e.positionSize,side:'LONG'},{...e.positionSize,tier:'LARGE'},{...e.positionSize,longUsd:-1}])
 assert.equal(whalePositionSizePresentation({...e,positionSize:p}).tier,'UNKNOWN');
const t=token(),proof=whaleSmartDominanceProof(t,symbol,now);t.short.size_usd=1;assert.equal(proof.positionSize.shortUsd,895705,'snapshot cannot change with the source object');
assert.equal(whalePositionSizeSnapshot(token(),{symbol:'OTHERUSDT',side:'SHORT',sourceAt:e.sourceAt,observedAt:now}),null);
assert.equal(whalePositionSizeSnapshot(token(),{symbol,side:'SHORT',sourceAt:e.sourceAt,observedAt:now+900001}),null);
// An absent USD field is optional display context and never removes the signal.
const missing=token();delete missing.long;delete missing.short;assert.equal(whaleSmartDominanceProof(missing,symbol,now).side,'SHORT');

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dominance-size-')),file=path.join(dir,'state.json');let posts=0,gets=0;
try{
 const fetchImpl=async(url,o={})=>{
  if(o.method==='POST'){
   posts++;const saved=JSON.parse(await fs.readFile(file));assert.equal(saved.history[0].delivery.status,'RESERVED');assert.equal(saved.history[0].positionSize.shortUsd,895705);
   const p=JSON.parse(o.body);assert.equal(p.embeds[0].color,0xf59e0b);assert.match(JSON.stringify(p),/2\.86×/);
   return {ok:true,status:200,json:async()=>({id:'111',channel_id:'222',webhook_id:'123'})};
  }
  gets++;return {ok:true,json:async()=>url.endsWith('/board')?{meta:{snapshot:now/1000,updated:now/1000},rows:[{s:symbol,basis:'whales',n:102,wl:25.9,sl:28.3,cr:74.5}]}:url.includes('/chart?')?chart('SHORT'):token()};
 };
 const options={file,getSymbols:()=>[symbol],webhookUrl:'https://discord.com/api/webhooks/123/mock',fetchImpl,now:()=>now,loadMarketCap:async()=>capFixture(symbol,now)};
 const watcher=new PumpglassWhaleSmartDominanceWatch(options);await watcher.scan();assert.equal(posts,1);assert.equal(gets,3,'same board/token/chart requests; no extra source IO');
 assert.equal(watcher.state.history[0].delivery.confirmed,true);assert.equal(watcher.snapshot().positionSizeVersion,PUMPGLASS_POSITION_SIZE_VERSION);
 const restart=new PumpglassWhaleSmartDominanceWatch(options);await restart.scan();assert.equal(posts,1,'new formatting does not replay an existing cooldown');
 assert.equal(restart.state.history[0].positionSize.shortUsd,895705);
}finally{await fs.rm(dir,{recursive:true,force:true});}
console.log('PASS signal-side USD/circulating-cap thresholds/colors; equalUSD differentcap; exact source/freshness; oldUSD retained but not relabeled; missing/zero/unclamped>100%; payload limits; durable cap before mock POST; unchanged PumpGlass calls/no replay.');
