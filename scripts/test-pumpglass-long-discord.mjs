import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {classifyPumpglassLong,pumpglassTokenProof,pumpglassLongPayload,PumpglassLongDiscordWatch,PUMPGLASS_LONG_GROUPS} from '../src/pumpglassLongDiscordWatch.js';
const A='DIVERGENCE70_40',B='GAP30_60';
assert.deepEqual(classifyPumpglassLong(70,40).matched,[A,B]);assert.equal(classifyPumpglassLong(60,30).group,B);assert.equal(classifyPumpglassLong(69,39).group,B);
assert.equal(classifyPumpglassLong(60.3,30.3).group,B,'decimal boundary is inclusive');
for(const args of [[59,0],[60,31],[70,41],[null,0],['70',30],[NaN,0],[101,30],[70,-1]])assert.equal(classifyPumpglassLong(...args),null);
const dir=await mkdtemp(join(tmpdir(),'pumpglass-discord-'));let clock=1793628000000,levelA=true,posts=0,tokenLoads=0,boardStale=false,tokenStale=false,fail429=false,throwPost=false;
const token=(symbol='AINUSDT')=>({symbol,basis:'whales',whale_count:165,scanned_at:Math.floor(clock/1000)-(tokenStale?901:60),price:.27,now:[{k:'Whales',v:levelA?94:65},{k:'Crowd',v:32}]});
let proof=pumpglassTokenProof(token(),'AINUSDT',clock);assert.equal(proof.group,A);assert.equal(pumpglassTokenProof({...token(),basis:'smart'},'AINUSDT',clock),null);assert.equal(pumpglassTokenProof({...token(),whale_count:9},'AINUSDT',clock),null);assert.equal(pumpglassTokenProof({...token(),price:null},'AINUSDT',clock),null);assert.equal(pumpglassTokenProof({...token(),scanned_at:clock/1000+1},'AINUSDT',clock),null);
const payload=pumpglassLongPayload(proof);assert.equal(payload.embeds[0].color,0xa855f7);assert.equal(PUMPGLASS_LONG_GROUPS[B].color,0x14b8a6);assert.deepEqual(payload.allowed_mentions.parse,[]);assert(!JSON.stringify(payload).includes('81.8'));assert(JSON.stringify(payload).includes('symbol=AINUSDT'));
const http=async(url,options={})=>{
 if(options.method==='POST'){posts++;if(throwPost)throw Error('NETWORK');return {ok:!fail429,status:fail429?429:204,json:async()=>({retry_after:100})};}
 if(url.endsWith('/board'))return {ok:true,json:async()=>({meta:{updated:clock/1000,snapshot:clock/1000-(boardStale?301:30)},rows:[{s:'AINUSDT',basis:'whales',n:165,wl:levelA?94:65,cr:32},{s:'OTHERUSDT',basis:'whales',n:30,wl:90,cr:30}]})};
 tokenLoads++;return {ok:true,json:async()=>token()};
};
const setup=file=>new PumpglassLongDiscordWatch({file,getSymbols:()=>['AINUSDT'],webhookUrl:'https://discord.com/api/webhooks/123/test-placeholder',fetchImpl:http,now:()=>clock});
try{
 const file=join(dir,'state.json'),w=setup(file);await w.scan();assert.equal(posts,1);assert.equal(w.state.history[0].delivery.status,'SENT');assert.equal(w.state.history[0].matched.length,2);assert.equal(w.state.history.length,1,'one message for overlap');assert.equal(w.snapshot().affectsOrders,false);
 await w.scan();assert.equal(posts,1);const restart=setup(file);await restart.scan();assert.equal(posts,1,'restart preserves cooldown');
 const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.alerts.AINUSDT.group,A);
 clock+=8*3600000;await w.scan();assert.equal(posts,2,'8h reminder');
 levelA=false;const upgrade=setup(join(dir,'upgrade.json'));await upgrade.scan();assert.equal(upgrade.state.history[0].group,B);const before=posts;levelA=true;await upgrade.scan();assert.equal(posts,before+1,'upgrade teal to purple');levelA=false;await upgrade.scan();assert.equal(posts,before+1,'no downgrade spam');
 const stale=setup(join(dir,'stale.json'));boardStale=true;const oldLoads=tokenLoads;await stale.scan();assert.equal(tokenLoads,oldLoads);assert.equal(stale.lastError,'BOARD_STALE_OR_INVALID');boardStale=false;tokenStale=true;const beforeStale=posts;await stale.scan();assert.equal(posts,beforeStale);tokenStale=false;
 const limited=setup(join(dir,'limited.json'));fail429=true;await limited.scan();assert.equal(limited.state.history[0].delivery.status,'FAILED');assert(limited.state.retryUntil>=clock+100000);const limitedPosts=posts;await limited.scan();assert.equal(posts,limitedPosts);fail429=false;
 const unknown=setup(join(dir,'unknown.json'));throwPost=true;await unknown.scan();assert.equal(unknown.state.history[0].delivery.status,'UNKNOWN');const unknownPosts=posts;clock+=61000;throwPost=false;await setup(join(dir,'unknown.json')).scan();assert.equal(posts,unknownPosts,'unknown delivery not replayed after restart');
 await writeFile(join(dir,'broken.json'),'{}');const broken=setup(join(dir,'broken.json'));await broken.scan();assert.equal(broken.error,'STATE_READ_FAILED_NO_SEND');assert.equal(posts,unknownPosts);
 const storage=setup('/dev/null/impossible.json');await storage.scan();assert(storage.error);assert.equal(posts,unknownPosts,'storage failure must block POST');
 const symbols=Array.from({length:8},(_,i)=>`TEST${i}USDT`);let batchPosts=0;
 const batch=new PumpglassLongDiscordWatch({file:join(dir,'batch.json'),getSymbols:()=>symbols,webhookUrl:'https://discord.com/api/webhooks/123/test-placeholder',now:()=>clock,fetchImpl:async(url,options={})=>{
  if(options.method==='POST'){batchPosts++;return {ok:true,status:204};}
  if(url.endsWith('/board'))return {ok:true,json:async()=>({meta:{updated:clock/1000,snapshot:clock/1000},rows:symbols.map(s=>({s,basis:'whales',n:100,wl:94,cr:30}))})};
  return {ok:true,json:async()=>token(new URL(url).searchParams.get('symbol'))};
 }});levelA=true;await batch.scan();assert.equal(batchPosts,3,'max 3 actual sends per scan');await batch.scan();assert.equal(batchPosts,6,'remaining symbols scanned next round');assert.equal(batch.state.history.length,6);
 assert.throws(()=>new PumpglassLongDiscordWatch({webhookUrl:'https://evil.invalid/webhook'}));
}finally{await rm(dir,{recursive:true,force:true});}
console.log('PASS PumpGlass Discord: thresholds/colors/overlap, strict fields, stale/future/basis/universe rejection, durable cooldown/restart, upgrade, 429, unknown delivery and storage fail-closed. Mock POST only.');
