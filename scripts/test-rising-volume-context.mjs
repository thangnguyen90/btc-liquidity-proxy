import assert from 'node:assert/strict';
import {evaluateRisingVolume} from '../src/risingVolume.js';
import {risingVolumeEntryId} from '../src/risingVolumeBinance.js';
import {risingVolumeContext,risingVolumeContextFields,RISING_VOLUME_CONTEXT_VERSION} from '../src/risingVolumeContext.js';
import {sweepPositionContext} from '../src/heatmapSweepPositionAnalysis.js';
import {RisingVolumeDiscordNotifier,risingVolumeDiscordPayload,RISING_VOLUME_DISCORD_VERSION} from '../src/risingVolumeDiscord.js';
import {flowRows,flowTestNow} from './rising-volume-flow-fixtures.mjs';

const S=300000, MIN=60000, now=flowTestNow+2*MIN, at=now+1000;
const observation=side=>{
 const rows=flowRows({side,now});
 const snapshot=evaluateRisingVolume({symbol:'ONUSDT',interval:'1m',rows,rows1m:rows,now}).signal;
 return {event:{id:risingVolumeEntryId(snapshot),snapshot},rows};
};
const bundle=(e,side,end=Math.floor((e.snapshot.closedAt+1)/S)*S)=>{
 const {symbol,price}=e.snapshot,bin=Math.round(Math.log(price*(side==='LONG'?1.03:.97))/Math.log(1.0025));
 return {models:[1,3].map(model=>({model,status:'OK',data:{
  source:'BINANCE_LOCAL',symbol,range:'24h',step:S,end,inputs:{markCoveragePct:100,oiCoveragePct:100},
  candles:[{time:end-2*S,open:price,high:price*1.002,low:price*.998,close:price},
   {time:end-S,open:price,high:price*1.001,low:price*.999,close:price}],
  profiles:Array.from({length:3},(_,i)=>({at:end-1-(2-i)*S,mark:true,oiFresh:true,bins:[[bin,100]]})),
 }}))};
};
const position=(e,long,sourceAt=now-30000,observedAt=now-25000)=>sweepPositionContext({symbol:e.snapshot.symbol,at:e.snapshot.closedAt},{at,points:[
 {sourceAt:sourceAt-3600000,observedAt:sourceAt-3500000,whaleCount:100,whaleLong:long-5,smartLong:long-5,crowdLong:65},
 {sourceAt,observedAt,whaleCount:100,whaleLong:long,smartLong:long,crowdLong:65},
]});
const {event:long,rows}=observation('LONG'), {event:short,rows:shortRows}=observation('SHORT');
const b=bundle(long,'LONG'),p=position(long,70);
const assess=(changes={})=>risingVolumeContext(long,{at,position:p,bundle:b,minuteRows:rows,...changes});
const good=assess();
assert.equal(good.state,'ALIGNED');
assert.equal(good.affectsOrders,false);
assert.equal(good.model.at,Math.floor((long.snapshot.closedAt+1)/S)*S);
assert.ok(good.model.above.low>long.snapshot.price);
assert.equal(risingVolumeContext(short,{at,bundle:bundle(short,'SHORT'),position:position(short,25),minuteRows:shortRows}).state,'ALIGNED');
assert.equal(assess({position:position(long,25)}).state,'CONFLICT');
assert.equal(assess({bundle:bundle(long,'SHORT')}).state,'CONFLICT');
assert.equal(assess({position:position(long,55)}).state,'WAIT');
assert.equal(assess({position:null}).state,'MISSING');
assert.equal(assess({position:position(long,70,at-16*MIN,at-15*MIN)}).state,'MISSING');
assert.equal(assess({bundle:bundle(long,'LONG',good.model.at+S)}).model,null);
assert.equal(assess({bundle:bundle(long,'LONG',good.model.at-2*S)}).model,null);
const gap=rows.filter(r=>r.openTime!==good.model.at);
assert.equal(assess({minuteRows:gap}).model,null);
const touched=rows.map(r=>r.openTime===good.model.at?{...r,high:good.model.above.low}:r);
assert.equal(assess({minuteRows:touched}).state,'WAIT');
assert.equal(assess({minuteRows:touched}).model.above,null);
const future=[...rows,{...rows.at(-1),openTime:long.snapshot.closedAt+1,closeTime:long.snapshot.closedAt+MIN,high:9999}];
assert.equal(assess({minuteRows:future}).model.above.low,good.model.above.low);

const payload=risingVolumeDiscordPayload(long,{status:'OFF'},'https://liquidity.nhathadev.trade',good);
const embed=payload.embeds[0];
assert.equal(embed.color,0x35f3b0);
assert.match(embed.fields[4].value,/CÙNG HƯỚNG/);
assert.match(embed.fields[5].value,/Phía trên:.*điểm/);
assert.match(embed.fields[6].value,/Cá voi: 70\.0% LONG.*Δ tỷ trọng LONG ~1h/s);
assert.match(embed.fields.at(-1).value,/coinglass-heatmap-lab\?symbol=ONUSDT/);
assert.ok(embed.fields.length<=25&&embed.fields.every(f=>f.value.length<=1024));
assert.deepEqual(risingVolumeContextFields(short,good),[]);

let calls=0,loaded=0,record=null;
const config={webhookUrl:()=> 'https://discord.com/api/webhooks/123/test',now:()=>at,startedAt:at-20000,
 storage:{load:async()=>record,save:async x=>{record=x;}},
 getContext:async()=>{loaded++;return good;},
 fetchImpl:async(_url,opts)=>{
  calls++;assert.match(opts.body,/CÙNG HƯỚNG/);
  assert.equal(record.events[long.id].status,'POSTING');
  assert.equal(record.events[long.id].context.version,RISING_VOLUME_CONTEXT_VERSION);
  return new Response('{"id":"1234"}',{status:200});
 }};
const n=new RisingVolumeDiscordNotifier(config);
assert.equal((await n.process(long,{status:'OFF'})).status,'SENT');
assert.equal(record.version,RISING_VOLUME_DISCORD_VERSION);
assert.equal((await n.process(long,{status:'OFF'})).status,'deduped');
assert.equal(calls,1);assert.equal(loaded,1);
assert.equal(n.snapshot().contextVersion,RISING_VOLUME_CONTEXT_VERSION);
const missing=new RisingVolumeDiscordNotifier({...config,storage:{load:async()=>null,save:async()=>{}},
 getContext:()=>{throw Error('context offline');},
 fetchImpl:async(_url,opts)=>{assert.match(opts.body,/THIẾU BỐI CẢNH/);return new Response('{"id":"1235"}',{status:200});}});
assert.equal((await missing.process(long,{status:'OFF'})).status,'SENT');
console.log('PASS Volume 1m context both sides, conflicting/missing data, causal Model 1/3 target, ledger, one POST and safe context failure.');

