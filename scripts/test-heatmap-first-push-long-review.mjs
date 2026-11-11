import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assessSweepContinuation,firstPushReviewClose,FIRST_PUSH_LONG_REVIEW_VERSION} from '../src/heatmapFirstPushLongReview.js';
import {createHeatmapSweepDiscordSender,heatmapSweepDiscordPayload} from '../src/heatmapSweepDiscord.js';
import {evaluateSweepPumpPhase} from '../src/heatmapSweepPumpPhase.js';
import {sweepPositionContext} from '../src/heatmapSweepPositionAnalysis.js';
import {HeatmapSweepWatch} from '../src/heatmapSweepWatch.js';

const S=300000, H=3600000, base=1800000000000, at=base+40000;
const bar=(t,o,h,l,c)=>[t,o,h,l,c,1,t+S-1,1000];
const zone=(low,high,extra={})=>({low,high,asOf:base-1,establishedAt:base-2*S-1,overlapStrength:57,...extra});
const e={id:'first-push-review',symbol:'ONUSDT',kind:'UPPER_CLUSTER_SWEPT',direction:'UPPER',viewRange:'24h',at,observedAt:at+10,
 zonesAsOf:base-1,armedAt:base+10,referencePrice:102,markPrice:103.1,clearedCount:1,totalCount:3,maxDistancePct:5,
 zones:[zone(102.8,103,{cleared:true,touched:true}),zone(105.4,105.8),zone(106,106.5,{touched:true})]};
const phaseFor=e=>evaluateSweepPumpPhase({event:e,now:e.at,coinRows:Array.from({length:288},(_,i)=>bar(base+(i-288)*S,102,102,102,102))});
const phase=phaseFor(e);
assert.equal(phase.state,'FIRST_PUSH');
const closeAt=firstPushReviewClose(e,at+1000);
assert.equal(closeAt,base+2*S);
const rows={
 closeAt,
 tradeRows:[bar(base+S,103.2,104,103,103.5),bar(closeAt,200,220,195,200)],
 markRows:[bar(base,103,104,102.8,103.2),bar(base+S,103.2,104,103,103.5),bar(closeAt,105.5,108,105.5,108)],
 topRows:[{symbol:e.symbol,timestamp:closeAt-S-H,longAccount:.60,shortAccount:.40},
  {symbol:e.symbol,timestamp:closeAt-S,longAccount:.65,shortAccount:.35},
  {symbol:e.symbol,timestamp:closeAt,longAccount:.95,shortAccount:.05}],
 globalRows:[{symbol:e.symbol,timestamp:closeAt-S,longAccount:.41,shortAccount:.59}],
 position:sweepPositionContext(e,{at:closeAt,points:[
  {sourceAt:closeAt-H-60000,observedAt:closeAt-H-30000,whaleLong:24,smartLong:32,crowdLong:64,whaleCount:100},
  {sourceAt:closeAt-60000,observedAt:closeAt-30000,whaleLong:25,smartLong:33,crowdLong:62,whaleCount:100},
  {sourceAt:closeAt-10000,observedAt:closeAt+1,whaleLong:98,smartLong:97,crowdLong:90,whaleCount:100},
 ]}),
};
const good=assessSweepContinuation(e,rows);
assert.equal(good.state,'PROMISING');
assert.equal(good.remaining.length,1);
assert.equal(good.remaining[0].low,105.4);
assert.equal(good.top.longPct,65);
assert.equal(good.top.delta1h,5);
assert.equal(good.whale.whaleDelta,1);
assert.equal(good.whale.smartDelta,1);
assert.equal(assessSweepContinuation(e,{...rows,position:null,topRows:[]}).state,'PROMISING','whale and ratio are context');
assert.equal(assessSweepContinuation(e).state,'PENDING');
assert.equal(assessSweepContinuation(e,{...rows,tradeRows:[rows.tradeRows[1]]}).state,'MISSING','future closed candle cannot backfill decision');
assert.equal(assessSweepContinuation(e,{...rows,markRows:[rows.markRows[0],rows.markRows[2]]}).state,'MISSING');
const touched=assessSweepContinuation(e,{...rows,markRows:[rows.markRows[0],bar(base+S,103,105.4,102.9,103.5)]});
assert.equal(touched.state,'WAIT');assert.deepEqual(touched.remaining,[]);
assert.equal(assessSweepContinuation(e,{...rows,tradeRows:[bar(base+S,103,104,102,102.9)]}).state,'WEAK');
assert.equal(assessSweepContinuation(e,{...rows,tradeRows:[bar(base+S,103,104,102,103.05)]}).state,'WAIT');
const narrow={...e,zones:[e.zones[0],zone(104.6,105),e.zones[2]]};
assert.equal(assessSweepContinuation(narrow,rows).state,'WAIT');

const payload=heatmapSweepDiscordPayload({...e,pumpPhase:phase,firstPushLong:good,positionAnalysis:rows.position});
const embed=payload.embeds[0];
assert.equal(embed.color,0x29d5a0);
assert.match(embed.title,/BƠM ĐẦU \(24H\).*CÒN DƯ ĐỊA/);
assert.match(embed.fields[1].value,/105\.4–105\.8/);
assert.match(embed.fields[2].value,/65\.00% LONG.*cùng tăng/s);
const size=embed.title.length+embed.description.length+embed.footer.text.length+embed.fields.reduce((s,f)=>s+f.name.length+f.value.length,0);
assert.ok(size<=6000&&embed.fields.length<=25&&embed.fields.every(f=>f.value.length<=1024));
assert.deepEqual(payload.allowed_mentions.parse,[]);
for(const event of [e,{...e,kind:'ALL_TRACKED_UPPER_SWEPT'},{...e,direction:'LOWER'}]){
 const old=heatmapSweepDiscordPayload({...event,pumpPhase:phase}).embeds[0];
 assert.ok(!old.fields.some(f=>f.name.includes('DƯ ĐỊA LÊN')));
}

const url='https://discord.com/api/webhooks/123/test',mid='1234567890123456789';
let now=at+1000,post=0,patch=0,loads=0;
const sender=createHeatmapSweepDiscordSender({webhookUrl:url,getPumpPhase:phaseFor,now:()=>now,
 loadSweepContinuation:async(event,t)=>{loads++;assert.equal(t,closeAt);assert.equal(event.id,e.id);return rows;},
 fetchImpl:async(u,opts)=>{
  const b=JSON.parse(opts.body);
  if(opts.method==='POST'){
   post++;assert.equal(u,url+'?wait=true');assert.equal(b.embeds[0].color,0x91a6bc);
   assert.match(b.embeds[0].fields[1].value,/105\.4–105\.8/);
   return {ok:true,status:200,json:async()=>({id:mid})};
  }
  patch++;assert.equal(opts.method,'PATCH');assert.equal(u,url+'/messages/'+mid);
  assert.equal(b.embeds[0].color,0x29d5a0);assert.equal(b.username,undefined);
  return {ok:true,status:200};
 }});
assert.equal(sender.firstPushLongVersion,FIRST_PUSH_LONG_REVIEW_VERSION);
const delivery=await sender(e),event={...e,delivery:{...delivery,at:now,status:'SENT'}};
assert.equal(post,1);assert.equal(delivery.firstPushLongMessage.closeAt,closeAt);
assert.equal(await sender.reviewContinuation(event),null);
assert.equal(loads,0);
assert.equal((await sender.reviewContinuation({...event,delivery:{...event.delivery,firstPushLongMessage:{...delivery.firstPushLongMessage,webhookId:'456'}}})).firstPushLongUpdate,'INVALID_RECEIPT');
now=closeAt+300001;
assert.equal((await sender.reviewContinuation(event)).firstPushLongUpdate,'EXPIRED');
assert.equal(patch,0);
now=closeAt+12000;
const dir=await mkdtemp(join(tmpdir(),'heatmap-first-push-'));
try{
 const config={file:join(dir,'watch.json'),discordSender:sender,now:()=>now};
 const existing=new HeatmapSweepWatch(config);
 await existing.init();existing.history.push(event);await existing.save();
 const restarted=new HeatmapSweepWatch(config);
 await Promise.all([restarted.refreshDiscordReview(),restarted.refreshDiscordReview()]);
 assert.equal(loads,1);assert.equal(patch,1);assert.equal(post,1);
 const again=new HeatmapSweepWatch(config);
 await again.init();await again.refreshDiscordReview();
 const stored=again.history[0].delivery;
 assert.equal(stored.firstPushLongUpdate,'UPDATED');
 assert.equal(stored.firstPushLong.state,'PROMISING');
 assert.equal(patch,1);assert.equal(post,1);
}finally{await rm(dir,{recursive:true,force:true});}
const bad=createHeatmapSweepDiscordSender({webhookUrl:url,getPumpPhase:phaseFor,now:()=>at+1000,
 loadSweepContinuation:async()=>rows,fetchImpl:async()=>({ok:true,status:204})});
const noReceipt=await bad(e);
assert.equal(noReceipt.sent,1);
assert.equal(noReceipt.firstPushLongUpdate,'NO_MESSAGE_RECEIPT');
console.log('PASS exact FIRST_PUSH partial routing, causal candle/target, missing/stale context, color and embed limits, wait receipt, same-message PATCH, durable review/restart/expiry, no real webhook.');



// A transient MARK gap keeps the original message pending. An already gray
// message with a valid receipt can be repaired from the same historical close.
let recoveryPatch=0, recoveryLoads=0, haveMark=false;
now=closeAt+13000;
const repair=createHeatmapSweepDiscordSender({webhookUrl:url,getPumpPhase:phaseFor,now:()=>now,
 loadSweepContinuation:async()=>{recoveryLoads++;return haveMark?rows:{...rows,markRows:[]};},
 fetchImpl:async(u,opts)=>{
  assert.equal(opts.method,'PATCH');
  assert.equal(u,url+'/messages/'+mid);
  const b=JSON.parse(opts.body).embeds[0];
  assert.equal(b.color,haveMark?0x29d5a0:0x91a6bc);
  recoveryPatch++;return {ok:true,status:200};
 }});
assert.equal(await repair.reviewContinuation(event),null);
assert.equal(recoveryPatch,0);
const gray={...event,delivery:{...event.delivery,firstPushLongUpdate:'UPDATED',
 firstPushLong:assessSweepContinuation(e,{...rows,markRows:[]})}};
assert.equal(await repair.reviewContinuation(gray),null);
assert.equal(recoveryPatch,0);
now=closeAt+290000;
const timed=await repair.reviewContinuation(event);
assert.equal(timed.firstPushLong.state,'MISSING');
assert.equal(recoveryPatch,1);
haveMark=true;
now=closeAt+10*60000;
const recovered=await repair.reviewContinuation(gray);
assert.equal(recovered.firstPushLong.state,'PROMISING');
assert.equal(recovered.firstPushLongRecovery,'UPDATED');
assert.equal(recoveryPatch,2);
now=closeAt+30*60000+1;
assert.equal((await repair.reviewContinuation(gray)).firstPushLongRecovery,'EXPIRED');
assert.equal(recoveryLoads,4);
assert.equal(recoveryPatch,2);
now=closeAt+11*60000;
const withoutWhale={...event,delivery:{...event.delivery,...recovered,firstPushLong:{...recovered.firstPushLong,whale:null}}};
const enriched=await repair.reviewContinuation(withoutWhale);
assert.equal(enriched.firstPushLongContextRepair,'UPDATED');
assert.deepEqual(enriched.firstPushLong,{...withoutWhale.delivery.firstPushLong,whale:good.whale});
assert.equal(recoveryPatch,3);
assert.equal((await repair.reviewContinuation({...withoutWhale,delivery:{...withoutWhale.delivery,...enriched}})).firstPushLongUpdate,'INVALID_RECEIPT');
console.log('PASS bounded incomplete-data retry and same-message recovery from historical closed MARK.');

