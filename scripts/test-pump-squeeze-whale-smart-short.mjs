import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PumpglassPositionJournal} from '../src/pumpglassPositionJournal.js';
import {PumpHighWhaleShortDiscordWatch} from '../src/pumpHighWhaleShortDiscordWatch.js';
import {provePumpSqueezeWhaleSmartLong,pumpSqueezeWhaleSmartLongStrategy} from '../src/pumpSqueezeWhaleSmartLong.js';
import {provePumpSqueezeWhaleSmartShort,pumpSqueezeWhaleSmartShortPayload,pumpSqueezeWhaleSmartShortStrategy,PUMP_SQUEEZE_WHALE_SMART_SHORT_VERSION,PUMP_SQUEEZE_WHALE_SMART_SHORT_GROUP} from '../src/pumpSqueezeWhaleSmartShort.js';
const H=3600000,S=300000,day=Date.UTC(2026,10,6),dir=await mkdtemp(join(tmpdir(),'squeeze-smart-short-'));
let clock=day+10*H+60000;
const token=(source=clock-60000,w=55,smart=50)=>({symbol:'TESTUSDT',basis:'whales',whale_count:100,scanned_at:source/1000,now:[{k:'Whales',v:w,was:99},{k:'Smart traders',v:smart,was:99},{k:'Crowd',v:65,was:1}]});
function prices(){const end=Math.floor(clock/S)*S;return Array.from({length:299},(_,i)=>[end-(299-i)*S,100,101,99,100,1,end-(298-i)*S-1,1000,0,0,500]);}
function chart(prev=.60,current=.65){const c=Math.floor(clock/S)*S-900000;return {symbol:'TESTUSDT',whales:[[(c-4*H)/1000,60,40,600,400],[c/1000,60,40,550,450],[Math.floor(clock/1000)-30,60,40,540,460]],crowd:[[(c-H)/1000,prev],[c/1000,current]],refresh:[]};}
try{
 const journal=new PumpglassPositionJournal({directory:join(dir,'journal'),now:()=>clock});
 await journal.capture(token(day+10*H,60,62),'TESTUSDT');
 clock=day+14*H+60000;await journal.capture(token(day+14*H),'TESTUSDT');clock=day+14*H+15*60000+30000;
 const prepared=await journal.context('TESTUSDT',Math.floor(clock/S)*S);
 const args={symbol:'TESTUSDT',rows:prices(),chart:chart(),token:token(),now:clock,prepared};
 const e=provePumpSqueezeWhaleSmartShort(args);assert.equal(e.status,'QUALIFIED');assert.equal(e.group,PUMP_SQUEEZE_WHALE_SMART_SHORT_GROUP);assert.equal(e.side,'SHORT');assert.equal(e.observeOnly,true);assert.equal(e.affectsOrders,false);assert.equal(e.position.crowdLong,65);assert.equal(e.position.whaleDelta4hPp,-5);assert.equal(e.position.smartDelta4hPp,-12);
 assert.notEqual(provePumpSqueezeWhaleSmartLong(args).status,'QUALIFIED');
 assert.equal(provePumpSqueezeWhaleSmartShort({...args,chart:chart(.70,.65)}).status,'QUALIFIED','crowd LONG may fall or rise');
 assert.equal(provePumpSqueezeWhaleSmartShort({...args,chart:chart(.60,.60)}).status,'QUALIFIED','60 percent inclusive');
 assert.equal(provePumpSqueezeWhaleSmartShort({...args,chart:chart(.60,.59)}).status,'CONDITIONS_NOT_MET');
 const one={...chart(),crowd:chart().crowd.slice(-1)},noPrior=provePumpSqueezeWhaleSmartShort({...args,chart:one});assert.equal(noPrior.status,'QUALIFIED');assert.equal(noPrior.position.crowdDelta1hPp,null);
 for(const k of ['whaleLong','smartLong'])for(const change of [0,1])assert.equal(provePumpSqueezeWhaleSmartShort({...args,prepared:{...prepared,current:{...prepared.current,[k]:prepared.previous[k]+change}}}).status,'CONDITIONS_NOT_MET','both groups must fall');
 assert.equal(provePumpSqueezeWhaleSmartShort({...args,prepared:{status:'WARMING_HISTORY'}}).status,'WARMING_HISTORY');
 for(const change of [{observedAt:clock+1},{ambiguous:true},{whaleCount:9}])assert.equal(provePumpSqueezeWhaleSmartShort({...args,prepared:{...prepared,current:{...prepared.current,...change}}}).status,'SNAPSHOT_INVALID');
 const cut=Math.floor(clock/S)*S-900000;assert.equal(provePumpSqueezeWhaleSmartShort({...args,prepared:{...prepared,current:{...prepared.current,sourceAt:cut+1}}}).status,'SNAPSHOT_MISSING_OR_STALE');
 assert.equal(provePumpSqueezeWhaleSmartShort({...args,chart:{...chart(),refresh:[(day+12*H)/1000]}}).status,'COHORT_REFRESH_EXCLUDED');
 assert.equal(provePumpSqueezeWhaleSmartShort({...args,chart:{...chart(),crowd:[]}}).status,'CROWD_HISTORY_MISSING_OR_STALE');
 assert.equal(provePumpSqueezeWhaleSmartShort({...args,chart:{...chart(),crowd:chart().crowd.map(r=>[r[0]-660,r[1]])}}).status,'CROWD_HISTORY_MISSING_OR_STALE');
 const staleChart={...chart(),whales:chart().whales.slice(0,2)};assert.equal(provePumpSqueezeWhaleSmartShort({...args,chart:staleChart}).status,'LATEST_WHALE_SOURCE_STALE');
 for(const change of [{scanned_at:(clock+1000)/1000},{scanned_at:(clock-900001)/1000},{basis:'smart'}])assert.equal(provePumpSqueezeWhaleSmartShort({...args,token:{...token(),...change}}).status,'LIVE_BASIS_MISSING_OR_STALE');
 assert.equal(provePumpSqueezeWhaleSmartShort({...args,rows:prices().slice(-200)}).status,'PRICE_NOT_READY');
 assert.equal(provePumpSqueezeWhaleSmartShort({...args,now:clock+600000}).status,'PRICE_NOT_READY');
 const low=prices();low[298]=[low[298][0],81,82,79,80,1,low[298][6],1000,0,0,500];assert.equal(provePumpSqueezeWhaleSmartShort({...args,rows:low}).status,'QUALIFIED','no high/low price location gate');
 const body=pumpSqueezeWhaleSmartShortPayload(noPrior);assert.equal(body.embeds[0].color,0xef4444);assert.match(body.embeds[0].title,/SHORT ÉP LONG/);assert.match(body.embeds[0].description,/Chưa xác nhận/);assert.match(JSON.stringify(body),/không gửi lệnh Binance/);assert.deepEqual(body.allowed_mentions.parse,[]);assert.ok(!JSON.stringify(body).includes('NaN'));
 const priceSource={collect:async()=>({coverage:{total:1,ready:1,counts:{STALE:0,INSUFFICIENT:0,GAP_OR_INVALID:0}},rows:[{symbol:'TESTUSDT',rows:prices(),status:'READY',price:e.price}]}),snapshot:()=>({ready:1})};
 let posts=0,gets=0;const make=(file,j,strategy=pumpSqueezeWhaleSmartShortStrategy)=>new PumpHighWhaleShortDiscordWatch({file,priceSource,getSymbols:()=>['TESTUSDT'],strategy:strategy(j),webhookUrl:'https://discord.com/api/webhooks/123/test-placeholder',now:()=>clock,fetchImpl:async(url,opts={})=>{if(opts.method==='POST'){posts++;const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.history.at(-1).delivery.status,'RESERVED');assert.equal(saved.history.at(-1).side,'SHORT');assert.equal(JSON.parse(opts.body).embeds[0].color,0xef4444);return {ok:true,status:204};}gets++;return {ok:true,json:async()=>url.includes('/token?')?token():chart()};}});
 const file=join(dir,'short-alerts.json'),watch=make(file,journal);await watch.scan();assert.equal(posts,1);assert.equal(watch.snapshot().version,PUMP_SQUEEZE_WHALE_SMART_SHORT_VERSION);assert.equal(watch.snapshot().rule.whaleLongDelta4hPp,'<0');assert.equal(watch.snapshot().rule.minCrowdShortPct,undefined);assert.equal(watch.snapshot().coverage.priceCandidates,1);
 await make(file,journal).scan();assert.equal(posts,1,'separate SHORT cooldown survives restart');
 const long=make(join(dir,'long-alerts.json'),journal,pumpSqueezeWhaleSmartLongStrategy);await long.scan();assert.equal(long.coverage.prefilter.POSITION_NOT_RISING,1);assert.equal(posts,1,'shared journal does not change existing LONG direction');
 const empty=new PumpglassPositionJournal({directory:join(dir,'empty'),now:()=>clock}),before=gets,warming=make(join(dir,'warming.json'),empty);await warming.scan();assert.equal(warming.coverage.prefilter.WARMING_HISTORY,1);assert.equal(gets,before);assert.equal(posts,1,'no fake signal or upstream request with missing4h history');
 const flat={context:async()=>({...prepared,current:{...prepared.current,smartLong:prepared.previous.smartLong}})};assert.equal((await pumpSqueezeWhaleSmartShortStrategy(flat).quickCheck({symbol:'TESTUSDT',price:e.price},clock)).status,'POSITION_NOT_FALLING');
 console.log('PASS SHORT long-squeeze: crowd LONG>=60, both genuine4h LONG deltas negative, red watch-only payload, no crowd trend/price location gate, source/refresh/future rejection, durable reservation/restart cooldown, separate LONG direction and no requests while warming. Mock transport only.');
}finally{await rm(dir,{recursive:true,force:true});}
