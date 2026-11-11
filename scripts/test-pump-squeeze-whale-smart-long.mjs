import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PumpglassPositionJournal} from '../src/pumpglassPositionJournal.js';
import {PumpHighWhaleShortDiscordWatch} from '../src/pumpHighWhaleShortDiscordWatch.js';
import {provePumpLowWhaleSmartLong} from '../src/pumpLowWhaleSmartLong.js';
import {provePumpSqueezeWhaleSmartLong,pumpSqueezeWhaleSmartLongPayload,pumpSqueezeWhaleSmartLongStrategy,PUMP_SQUEEZE_WHALE_SMART_LONG_VERSION,PUMP_SQUEEZE_WHALE_SMART_LONG_GROUP} from '../src/pumpSqueezeWhaleSmartLong.js';
const H=3600000,S=300000,day=Date.UTC(2026,10,5),dir=await mkdtemp(join(tmpdir(),'squeeze-long-'));
let clock=day+10*H+60000;
const token=(source=clock-60000,w=65,smart=70)=>({symbol:'TESTUSDT',basis:'whales',whale_count:100,scanned_at:source/1000,now:[{k:'Whales',v:w,was:99},{k:'Smart traders',v:smart,was:99},{k:'Crowd',v:35,was:1}]});
function prices(){const end=Math.floor(clock/S)*S;return Array.from({length:299},(_,i)=>[end-(299-i)*S,100,101,99,100,1,end-(298-i)*S-1,1000,0,0,500]);}
function chart(prev=.40,current=.35){const c=Math.floor(clock/S)*S-900000;return {symbol:'TESTUSDT',whales:[[(c-4*H)/1000,60,40,600,400],[c/1000,60,40,650,350],[Math.floor(clock/1000)-30,60,40,660,340]],crowd:[[(c-H)/1000,prev],[c/1000,current]],refresh:[]};}
try{
 const journal=new PumpglassPositionJournal({directory:join(dir,'journal'),now:()=>clock});
 await journal.capture(token(day+10*H,60,62),'TESTUSDT');
 clock=day+14*H+60000;await journal.capture(token(day+14*H),'TESTUSDT');
 clock=day+14*H+15*60000+30000;
 const prepared=await journal.context('TESTUSDT',Math.floor(clock/S)*S);
 const args={symbol:'TESTUSDT',rows:prices(),chart:chart(),token:token(),now:clock,prepared};
 const e=provePumpSqueezeWhaleSmartLong(args);assert.equal(e.status,'QUALIFIED');assert.equal(e.group,PUMP_SQUEEZE_WHALE_SMART_LONG_GROUP);assert.equal(e.side,'LONG');assert.equal(e.affectsOrders,false);assert.equal(e.position.crowdShort,65);assert.equal(e.position.whaleDelta4hPp,5);assert.equal(e.position.smartDelta4hPp,8);
 assert.notEqual(provePumpLowWhaleSmartLong(args).status,'QUALIFIED','squeeze admits a price outside LOW branch');
 assert.equal(provePumpSqueezeWhaleSmartLong({...args,chart:chart(.30,.35)}).status,'QUALIFIED','crowd SHORT may fall');
 const one={...chart(),crowd:chart().crowd.slice(-1)};const noPrior=provePumpSqueezeWhaleSmartLong({...args,chart:one});assert.equal(noPrior.status,'QUALIFIED');assert.equal(noPrior.position.crowdShortDelta1hPp,null);
 assert.equal(provePumpSqueezeWhaleSmartLong({...args,chart:chart(.40,.40)}).status,'QUALIFIED','60 percent inclusive');
 assert.equal(provePumpSqueezeWhaleSmartLong({...args,chart:chart(.40,.41)}).status,'CONDITIONS_NOT_MET');
 for(const k of ['whaleLong','smartLong'])for(const change of [0,-1])assert.equal(provePumpSqueezeWhaleSmartLong({...args,prepared:{...prepared,current:{...prepared.current,[k]:prepared.previous[k]+change}}}).status,'CONDITIONS_NOT_MET');
 assert.equal(provePumpSqueezeWhaleSmartLong({...args,prepared:{status:'WARMING_HISTORY'}}).status,'WARMING_HISTORY');
 assert.equal(provePumpSqueezeWhaleSmartLong({...args,prepared:{...prepared,current:{...prepared.current,observedAt:clock+1}}}).status,'SNAPSHOT_INVALID');
 assert.equal(provePumpSqueezeWhaleSmartLong({...args,prepared:{...prepared,current:{...prepared.current,ambiguous:true}}}).status,'SNAPSHOT_INVALID');
 assert.equal(provePumpSqueezeWhaleSmartLong({...args,chart:{...chart(),refresh:[(day+12*H)/1000]}}).status,'COHORT_REFRESH_EXCLUDED');
 assert.equal(provePumpSqueezeWhaleSmartLong({...args,chart:{...chart(),crowd:[]}}).status,'CROWD_HISTORY_MISSING_OR_STALE');
 assert.equal(provePumpSqueezeWhaleSmartLong({...args,token:token(clock+1000)}).status,'LIVE_BASIS_MISSING_OR_STALE');
 assert.equal(provePumpSqueezeWhaleSmartLong({...args,token:token(clock-900001)}).status,'LIVE_BASIS_MISSING_OR_STALE');
 assert.equal(provePumpSqueezeWhaleSmartLong({...args,rows:prices().slice(-200)}).status,'PRICE_NOT_READY');
 assert.equal(provePumpSqueezeWhaleSmartLong({...args,now:clock+600000}).status,'PRICE_NOT_READY');
 const body=pumpSqueezeWhaleSmartLongPayload(noPrior);assert.equal(body.embeds[0].color,0x3b82f6);assert.match(body.embeds[0].title,/LONG ÉP SHORT/);assert.match(body.embeds[0].description,/Chưa có xác nhận/);assert.deepEqual(body.allowed_mentions.parse,[]);assert.ok(!JSON.stringify(body).includes('NaN'));
 const priceSource={collect:async()=>({coverage:{total:1,ready:1,counts:{STALE:0,INSUFFICIENT:0,GAP_OR_INVALID:0}},rows:[{symbol:'TESTUSDT',rows:prices(),status:'READY',price:e.price}]}),snapshot:()=>({ready:1})};
 let posts=0,gets=0;const make=(file,j)=>new PumpHighWhaleShortDiscordWatch({file,priceSource,getSymbols:()=>['TESTUSDT'],strategy:pumpSqueezeWhaleSmartLongStrategy(j),webhookUrl:'https://discord.com/api/webhooks/123/test-placeholder',now:()=>clock,fetchImpl:async(url,opts={})=>{if(opts.method==='POST'){posts++;assert.equal(JSON.parse(await readFile(file,'utf8')).history.at(-1).delivery.status,'RESERVED');assert.equal(JSON.parse(opts.body).embeds[0].color,0x3b82f6);return {ok:true,status:204};}gets++;return {ok:true,json:async()=>url.includes('/token?')?token():chart()};}});
 const file=join(dir,'squeeze-alerts.json'),watch=make(file,journal);await watch.scan();assert.equal(posts,1);assert.equal(watch.state.history[0].group,PUMP_SQUEEZE_WHALE_SMART_LONG_GROUP);assert.equal(watch.snapshot().version,PUMP_SQUEEZE_WHALE_SMART_LONG_VERSION);assert.equal(watch.snapshot().coverage.priceCandidates,1);assert.equal(watch.snapshot().rule.minDropPct,undefined);assert.equal(watch.snapshot().rule.minCrowdLongPct,undefined);assert.equal(watch.snapshot().observeOnly,true);
 await make(file,journal).scan();assert.equal(posts,1,'squeeze cooldown survives restart');
 await make(join(dir,'other-branch-state.json'),journal).scan();assert.equal(posts,2,'cooldown belongs to branch state, not shared journal');
 const empty=new PumpglassPositionJournal({directory:join(dir,'empty'),now:()=>clock});const before=gets,warming=make(join(dir,'warming.json'),empty);await warming.scan();assert.equal(warming.coverage.prefilter.WARMING_HISTORY,1);assert.equal(gets,before);assert.equal(posts,2,'no alert or source fetch with missing4h history');
 console.log('PASS squeeze LONG: crowd SHORT>=60, both genuine4h LONG deltas, no LOW gate or crowd trend requirement, missing/future/stale/refresh rejection, blue payload, separate durable cooldown and warmup without external requests.');
}finally{await rm(dir,{recursive:true,force:true});}
