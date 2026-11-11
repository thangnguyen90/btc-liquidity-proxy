import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assessSweepContinuation,continuationReviewJob,firstPushReviewClose,LOWER_SHORT_REVIEW_VERSION} from '../src/heatmapFirstPushLongReview.js';
import {createHeatmapSweepDiscordSender,heatmapSweepDiscordPayload} from '../src/heatmapSweepDiscord.js';
import {sweepPositionContext} from '../src/heatmapSweepPositionAnalysis.js';
import {HeatmapSweepWatch} from '../src/heatmapSweepWatch.js';

const S=300000,H=3600000,base=1800000000000,at=base+40000;
const zone=(low,high,extra={})=>({low,high,asOf:base-1,establishedAt:base-2*S-1,overlapStrength:54,...extra});
const cleared=zone(100,101,{cleared:true,touched:true});
const e={id:'short-after-lower-sweep',symbol:'PONSUSDT',kind:'LOWER_CLUSTER_SWEPT',direction:'LOWER',viewRange:'24h',
 at,observedAt:at+10,zonesAsOf:base-1,armedAt:base+10,referencePrice:102,markPrice:99.8,clearedCount:1,totalCount:4,maxDistancePct:6,
 zones:[cleared,zone(96.5,97),zone(94.5,95),zone(98.5,98.8,{touched:true})]};
const bar=(t,o,h,l,c)=>[t,o,h,l,c,1,t+S-1,1000];
const closeAt=firstPushReviewClose(e,at+1000);
assert.equal(closeAt,base+2*S);
const data={
 closeAt,
 tradeRows:[bar(base+S,99.7,99.9,99,99.5),bar(closeAt,200,201,199,200)],
 markRows:[bar(base,100.2,101,99.6,99.7),bar(base+S,99.7,99.9,99.1,99.5),bar(closeAt,99.5,100,93,93.2)],
 topRows:[{symbol:e.symbol,timestamp:closeAt-S-H,longAccount:.48,shortAccount:.52},
  {symbol:e.symbol,timestamp:closeAt-S,longAccount:.43,shortAccount:.57},
  {symbol:e.symbol,timestamp:closeAt,longAccount:.99,shortAccount:.01}],
 position:sweepPositionContext(e,{at:closeAt,points:[
  {sourceAt:closeAt-H-60000,observedAt:closeAt-H-30000,whaleLong:30,smartLong:36,crowdLong:62,whaleCount:100},
  {sourceAt:closeAt-60000,observedAt:closeAt-30000,whaleLong:25,smartLong:31,crowdLong:65,whaleCount:100},
 ]}),
};
const assess=(event=e,rows=data)=>assessSweepContinuation(event,rows);
const pending=assessSweepContinuation(e),green=assess();
assert.equal(pending.state,'PENDING');
assert.deepEqual(pending.remaining.map(z=>z.high),[97,95]);
assert.equal(green.version,LOWER_SHORT_REVIEW_VERSION);
assert.equal(green.state,'PROMISING');
assert.equal(green.remaining[0].high,97);
assert.ok(Math.abs(green.belowEdgePct-.5)<1e-9&&green.remaining[0].farPct>green.remaining[0].nearPct);
assert.equal(green.top.longPct,43);

const changed=target=>({...e,zones:[cleared,target,e.zones[2],e.zones[3]]});
const inZone=assess(changed(zone(97.5,98.4)));
assert.equal(inZone.state,'IN_ZONE');
assert.ok(inZone.remaining[0].nearPct<5/3&&inZone.remaining[0].farPct>=5/3);
const amber=assess(changed(zone(98.1,98.4)));
assert.equal(amber.state,'WAIT');
const shallow=assess(e,{...data,tradeRows:[bar(base+S,99.7,100,99,99.95)]});
assert.equal(shallow.state,'WAIT');
const red=assess(e,{...data,tradeRows:[bar(base+S,99.7,101,99,100.1)]});
assert.equal(red.state,'WEAK');
const missing=assess(e,{...data,markRows:data.markRows.slice(1)});
assert.equal(missing.state,'MISSING');assert.equal(missing.remaining,null);
assert.equal(assess(e,{...data,tradeRows:data.tradeRows.slice(1)}).state,'MISSING');
const touched=assess(e,{...data,markRows:[data.markRows[0],bar(base+S,99.7,99.9,97,99.5)]});
assert.deepEqual(touched.remaining.map(z=>z.high),[95]);
const none=assess(e,{...data,markRows:[data.markRows[0],bar(base+S,99.7,99.9,94.6,99.5)]});
assert.equal(none.state,'WAIT');assert.deepEqual(none.remaining,[]);

for(const [review,color] of [[pending,0x91a6bc],[green,0x29d5a0],[inZone,0xf0cd56],[amber,0xffb553],[red,0xff627e],[missing,0x91a6bc]]){
 const p=heatmapSweepDiscordPayload({...e,lowerShort:review}), b=p.embeds[0];
 assert.equal(b.color,color);
 assert.match(b.title,/QUÉT HẾT CỤM PHÍA DƯỚI/);
 assert.equal(b.fields[1].name,'DƯ ĐỊA XUỐNG · CỤM MODEL 1/3 CHƯA CHẠM');
 assert.deepEqual(p.allowed_mentions.parse,[]);
 const size=b.title.length+b.description.length+b.footer.text.length+b.fields.reduce((n,f)=>n+f.name.length+f.value.length,0);
 assert.ok(size<=6000&&b.title.length<=256&&b.fields.length<=25&&b.fields.every(f=>f.value.length<=1024));
 if(review===green){
  assert.match(b.fields[1].value,/−2\.51% đến −3\.02%/);
  assert.match(b.fields[2].value,/Δ1h SHORT \+5\.00/);
  assert.match(b.fields[2].value,/ΔSHORT.*Cá voi \+5\.00.*Smart \+5\.00.*cùng tăng/);
 }
}
const legacy=heatmapSweepDiscordPayload(e).embeds[0];
assert.equal(legacy.color,0xffb553);
assert.ok(!legacy.fields.some(f=>f.name.includes('DƯ ĐỊA XUỐNG')));
const full={...e,kind:'ALL_TRACKED_LOWER_SWEPT',clearedCount:4};
assert.ok(!heatmapSweepDiscordPayload({...full,lowerShort:green}).embeds[0].fields.some(f=>f.name.includes('DƯ ĐỊA XUỐNG')));

const partial='https://discord.com/api/webhooks/123/partial',all='https://discord.com/api/webhooks/124/full',mid='1234567890123456789';
let now=at+1000,loads=0,complete=false;
const sent=[];
const sender=createHeatmapSweepDiscordSender({webhookUrl:partial,fullSweepWebhookUrl:all,now:()=>now,
 loadSweepContinuation:async(event,expectedClose)=>{
  loads++;assert.equal(event.id,e.id);assert.equal(expectedClose,closeAt);
  return complete?data:{...data,markRows:[]};
 },
 fetchImpl:async(url,opts)=>{
  sent.push([url,opts.method,JSON.parse(opts.body)]);
  return {ok:true,status:200,json:async()=>({id:mid})};
 }});
assert.equal(sender.lowerShortVersion,LOWER_SHORT_REVIEW_VERSION);
assert.equal((await sender(full)).lowerShort,undefined);
assert.equal(sent.at(-1)[0],all);
const result=await sender(e);
assert.equal(result.lowerShort.state,'PENDING');
assert.equal(result.lowerShortMessage.closeAt,closeAt);
assert.equal(result.firstPushLong,undefined);
assert.equal(sent.at(-1)[0],partial+'?wait=true');
const event={...e,delivery:{...result,status:'SENT',at:now}};
assert.equal(continuationReviewJob(event).mode,'pending');
const dir=await mkdtemp(join(tmpdir(),'heatmap-lower-short-'));
try{
 const config={file:join(dir,'state.json'),discordSender:sender,now:()=>now};
 const watcher=new HeatmapSweepWatch(config);
 await watcher.init();
 watcher.history.push(event);
 await watcher.save();
 const restarted=new HeatmapSweepWatch(config);
 now=closeAt+12000;
 await Promise.all([restarted.refreshDiscordReview(),restarted.refreshDiscordReview()]);
 assert.equal(loads,1);
 assert.equal(sent.length,2);
 now+=5000;
 await restarted.refreshDiscordReview();
 assert.equal(loads,1);
 complete=true;
 now+=10000;
 await restarted.refreshDiscordReview();
 assert.equal(sent.length,3);
 assert.equal(sent.at(-1)[0],partial+'/messages/'+mid);
 assert.equal(sent.at(-1)[1],'PATCH');
 assert.equal(sent.at(-1)[2].embeds[0].color,0x29d5a0);
 const again=new HeatmapSweepWatch(config);
 await again.init();
 assert.equal(again.history[0].delivery.lowerShortUpdate,'UPDATED');
 assert.equal(again.history[0].delivery.lowerShort.state,'PROMISING');
 assert.equal(continuationReviewJob(again.history[0]),null);
 await again.refreshDiscordReview();
 assert.equal(sent.length,3);
}finally{await rm(dir,{recursive:true,force:true});}
console.log('PASS lower continuation colors, frozen near/far target, future and touched exclusions, receipt edit with retry, legacy/full-route separation.');

