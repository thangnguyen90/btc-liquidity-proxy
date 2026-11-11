import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {classifyRangeSweepContext,collectRangeSweepContext,rangeSweepPositionRatio,rangeSweepContextFields,rangeSweepEntryPlan,rangeSweepEntryIntro,RANGE_SWEEP_CONTEXT_VERSION,RANGE_SWEEP_ENTRY_VERSION,assessRangeSweepSignal,RANGE_SWEEP_DECISION_VERSION} from '../src/rangeSweepCombinedContext.js';
import {sweepPositionContext} from '../src/heatmapSweepPositionAnalysis.js';
import {rangeSweepDiscordPayload,RANGE_SWEEP_COLORS} from '../src/rangeLiquiditySweepDiscord.js';
import {RangeLiquiditySweepWatch} from '../src/rangeLiquiditySweepWatch.js';
import {RANGE_SWEEP_VERSION} from '../src/rangeLiquiditySweepModel.js';
const S=300000,at=1794363433000,end=at-1000,now=at+1500;
const event={id:'range-context-test',version:RANGE_SWEEP_VERSION,symbol:'TESTUSDT',kind:'DIRECTION_CONFIRMED',side:'SHORT',at,price:100,
 direction:'LOWER',reason:'test',zone:{low:96.5,high:97.5,overlapStrength:60},base:{low:100.5,high:102,atr:2,asOf:end,widthAtr:2,efficiency:.1},
 flow:{volumeX:3,buyPct:30,o:100.2,c:99,end},observeOnly:true,affectsOrders:false};
const model=(e=event,upper=false)=>({models:[1,3].map(model=>({model,status:'OK',data:{
 source:'BINANCE_LOCAL',symbol:e.symbol,range:'24h',step:S,end,inputs:{markCoveragePct:100,oiCoveragePct:100},
 candles:[{time:end-2*S,open:100,high:100.4,low:99.6,close:100},{time:end-S,open:100,high:100.3,low:99.7,close:100}],
 profiles:Array.from({length:3},(_,i)=>({at:end-1-(2-i)*S,mark:true,oiFresh:true,
 bins:[[Math.round(Math.log(upper?103:97)/Math.log(1.0025)),100]]}))
}}))});
const point={sourceAt:at-60000,observedAt:at-30000,whaleCount:100,whaleLong:20,smartLong:25,crowdLong:75};
const position=(e=event,p=point,top=.5)=>sweepPositionContext(e,{at:now,points:[p],ratioReadAt:now,
 ratioRows:[{timestamp:end-S,longShortRatio:top}]});
const ratio=(value=.5)=>({fetchedAt:now,rows:Array.from({length:15},(_,i)=>({symbol:event.symbol,timestamp:end-S-(14-i)*S,longShortRatio:value}))});
const inputs={bundle:model(),position:position(),positionRatio:ratio(),at:now};
const short=classifyRangeSweepContext(event,inputs);
assert.equal(short.state,'ALIGNED');assert.equal(short.modelSide,'SHORT');assert.equal(short.model.above,null);
assert.ok(short.model.belowDistancePct>0);assert.equal(short.observeOnly,true);assert.equal(short.affectsOrders,false);
const longEvent={...event,id:'long-test',side:'LONG',direction:'UPPER',zone:{low:102.5,high:103.5,overlapStrength:60},base:{...event.base,low:98,high:99.5},flow:{...event.flow,buyPct:70,o:99.2,c:100}};
const long=classifyRangeSweepContext(longEvent,{bundle:model(longEvent,true),
 position:position(longEvent,{...point,whaleLong:80,smartLong:75,crowdLong:25},2),positionRatio:ratio(2),at:now});
assert.equal(long.state,'ALIGNED');assert.ok(long.model.aboveDistancePct>0);
assert.deepEqual([short.entry.low,short.entry.high,short.entry.invalidationClose,short.entry.maxChasePrice],[100,100.5,100.5,98.5]);
assert.equal(short.entry.status,'IN_ZONE');assert.equal(short.entry.version,RANGE_SWEEP_ENTRY_VERSION);
assert.deepEqual([long.entry.low,long.entry.high,long.entry.invalidationClose,long.entry.maxChasePrice],[99.5,100,99.5,101.5]);
assert.equal(long.entry.status,'IN_ZONE');
assert.equal(rangeSweepEntryPlan({...event,price:99.5},short,now).status,'WAIT_RETEST');
assert.equal(rangeSweepEntryPlan({...event,price:98.49},short,now).status,'NO_CHASE');
assert.equal(rangeSweepEntryPlan({...event,price:100.5},short,now).status,'INVALIDATED');
assert.equal(rangeSweepEntryPlan({...event,expiresAt:now},short,now).status,'EXPIRED');
assert.equal(rangeSweepEntryPlan(event,{...short,state:'CONFLICT'},now).status,'WAIT_CONTEXT');
assert.equal(rangeSweepEntryPlan({...event,base:{...event.base,atr:0}},short,now),null);
assert.equal(rangeSweepEntryPlan({...event,base:{...event.base,asOf:at}},short,now),null);
assert.equal(rangeSweepEntryPlan({...event,kind:'BREAKOUT'},short,now),null);
assert.equal(rangeSweepEntryPlan(event,short,at-1),null);
assert.match(rangeSweepEntryIntro({...event,analysis:short}),/^\*\*ENTRY SHORT THAM KHẢO: 100 – 100.5/);
assert.equal(rangeSweepEntryIntro({...event,id:'other',analysis:short}),'');
assert.equal(rangeSweepEntryIntro({...event,analysis:{...short,entry:undefined}}),'');
for(const change of [
 {bundle:model(event,true)},
 {position:position(event,{...point,whaleLong:80,smartLong:75},.5)},
 {positionRatio:ratio(2)},
 {position:position(event,point,2)}
])assert.equal(classifyRangeSweepContext(event,{...inputs,...change}).state,'CONFLICT');
assert.equal(classifyRangeSweepContext(event,{...inputs,position:position(event,{...point,whaleLong:50,smartLong:50})}).state,'WAIT');
assert.equal(classifyRangeSweepContext(event,{...inputs,positionRatio:ratio(1)}).state,'WAIT');
for(const key of ['bundle','position','positionRatio'])assert.equal(classifyRangeSweepContext(event,{...inputs,[key]:null}).state,'MISSING');
const mutateModel=fn=>{const b=model();fn(b);return b;};
for(const bundle of [
 mutateModel(b=>b.models.forEach(m=>m.data.end=at+1)),
 mutateModel(b=>b.models.forEach(m=>m.data.end=at-420001)),
 mutateModel(b=>b.models[1].data.symbol='WRONGUSDT'),
 mutateModel(b=>b.models[1].data.inputs.oiCoveragePct=94.9),
 mutateModel(b=>b.models[0].data.inputs.markCoveragePct=99.9),
 mutateModel(b=>b.models[0].data.profiles[2].mark=false)
])assert.equal(classifyRangeSweepContext(event,{...inputs,bundle}).state,'MISSING');
for(const p of [
 {...position(),symbol:'WRONGUSDT'},{...position(),sweepAt:at-1},
 {...position(),at:now+1},{...position(),at:now-30001},
 {...position(),point:{...point,sourceAt:now+1,observedAt:now+1}},
 {...position(),point:{...point,sourceAt:now-900001,observedAt:now-800000}},
 {...position(),point:{...point,whaleLong:101}},
 {...position(),point:{...point,whaleCount:9}}
])assert.equal(classifyRangeSweepContext(event,{...inputs,position:p}).state,'MISSING');
for(const snapshot of [
 {...ratio(),fetchedAt:now+1},{...ratio(),fetchedAt:now-60001},
 {...ratio(),rows:ratio().rows.map(r=>({...r,timestamp:r.timestamp-2*S}))},
 {...ratio(),rows:[...ratio().rows,{...ratio().rows.at(-1),longShortRatio:99}]},
 {...ratio(),rows:ratio().rows.map(r=>({...r,symbol:'WRONGUSDT'}))}
])assert.equal(rangeSweepPositionRatio(event,snapshot,now),null);
const current=rangeSweepPositionRatio(event,ratio(),now);
assert.equal(current.deltaLong1hPp,0);
assert.deepEqual(rangeSweepPositionRatio(event,{...ratio(),rows:[...ratio().rows,{timestamp:at,longShortRatio:99}]},now),current);
const changed=ratio();changed.rows[2].longShortRatio=1;
assert.ok(rangeSweepPositionRatio(event,changed,now).deltaLong1hPp<0);
assert.equal(rangeSweepPositionRatio(event,{...ratio(),rows:ratio().rows.slice(-1)},now).deltaLong1hPp,null);
assert.equal(classifyRangeSweepContext({...event,kind:'BREAKOUT'},inputs),null);
assert.equal(classifyRangeSweepContext({...event,side:'UNKNOWN'},inputs),null);
const enriched={...event,analysis:short},payload=rangeSweepDiscordPayload(enriched),embed=payload.embeds[0];
assert.equal(embed.color,RANGE_SWEEP_COLORS.SHORT);assert.match(embed.title,/PHÁ NỀN CÓ XÁC NHẬN/);
assert.match(embed.fields[0].name,/CÙNG HƯỚNG/);assert.match(embed.description,/^\*\*ENTRY SHORT THAM KHẢO/);
assert.ok(embed.fields.some(f=>f.name.includes('VỊ THẾ')));
assert.ok(embed.fields.some(f=>f.name.includes('CÁ VOI')));
assert.deepEqual(payload.allowed_mentions,{parse:[]});
assert.ok(embed.fields.every(f=>f.value.length<=1024&&f.name.length<=256));
assert.ok(embed.fields.reduce((sum,f)=>sum+f.name.length+f.value.length,0)+embed.title.length+embed.description.length+embed.footer.text.length<=6000);
assert.equal(rangeSweepContextFields({...enriched,id:'other'}).length,0);
assert.equal(rangeSweepContextFields({...enriched,analysis:{...short,version:'old'}}).length,0);
assert.equal(rangeSweepContextFields(event).length,0);
const collected=await collectRangeSweepContext(event,{loadBundle:async()=>inputs.bundle,loadPosition:async()=>inputs.position,
 loadPositionRatio:async()=>inputs.positionRatio,now:()=>now});
assert.equal(collected.state,'ALIGNED');
let finish;
const partial=await collectRangeSweepContext(event,{loadBundle:()=>new Promise(r=>{finish=r;}),loadPosition:async()=>inputs.position,
 loadPositionRatio:async()=>inputs.positionRatio,budgetMs:5,now:()=>now});
assert.equal(partial.state,'MISSING');assert.ok(partial.position.point);assert.ok(partial.positionRatio);assert.equal(partial.model,null);
finish(inputs.bundle);await new Promise(r=>setTimeout(r,0));assert.equal(partial.model,null);
const failed=await collectRangeSweepContext(event,{loadBundle:()=>{throw Error('test');},loadPosition:async()=>inputs.position,
 loadPositionRatio:async()=>inputs.positionRatio,now:()=>now});
assert.equal(failed.state,'MISSING');assert.ok(failed.position.point);
const dir=await mkdtemp(join(tmpdir(),'range-sweep-context-')),file=join(dir,'state.json');
try{
 let sent=0;
 const watch=new RangeLiquiditySweepWatch({file,now:()=>now,getAnalysis:async e=>classifyRangeSweepContext(e,inputs),
 discordSender:async e=>{
  const disk=JSON.parse(await readFile(file,'utf8'));
  assert.equal(disk.history.at(-1).analysis.version,RANGE_SWEEP_CONTEXT_VERSION);
  assert.equal(disk.history.at(-1).delivery.status,'PENDING');
  assert.equal(e.analysis.state,'ALIGNED');assert.equal(disk.history.at(-1).analysis.entry.version,RANGE_SWEEP_ENTRY_VERSION);sent++;return {sent:1};
 }});
 await watch.init();await watch.record(event);assert.equal(sent,1);
 const restored=new RangeLiquiditySweepWatch({file,now:()=>now,discordSender:()=>{throw Error('replay');}});
 await restored.init();assert.equal(restored.history.at(-1).analysis.state,'ALIGNED');
 await restored.record(event);assert.equal(restored.history.length,1);
 const fallback=new RangeLiquiditySweepWatch({now:()=>now,getAnalysis:()=>{throw Error('test');},
 discordSender:async e=>{assert.equal(e.analysis.state,'MISSING');return {sent:1};}});
 await fallback.record(event);assert.equal(fallback.history.at(-1).delivery.status,'SENT');
 let clock=now,lateSends=0;
 const late=new RangeLiquiditySweepWatch({now:()=>clock,getAnalysis:async()=>{clock=at+31000;return short;},
 discordSender:()=>{lateSends++;return {sent:1};}});
 await late.record(event);assert.equal(lateSends,0);assert.equal(late.history.at(-1).delivery.status,'EXPIRED');
 const unaffected=new RangeLiquiditySweepWatch({now:()=>now,getAnalysis:()=>{throw Error('non-confirmed analyzed');},discordSender:async()=>({sent:1})});
 await unaffected.record({...event,id:'breakout',kind:'BREAKOUT'});assert.equal(unaffected.history[0].analysis,undefined);
}finally{await rm(dir,{recursive:true,force:true});}
console.log('PASS range context: symmetric confluence/conflict/wait/missing, causal source guards, partial timeout, frozen ATR entry/retest/expiry/chase, bounded Discord payload, durable before-send metadata and no replay. Mock only.');


const assessed=assessRangeSweepSignal(enriched,{at:now});
assert.equal(assessed.outcome,'SEND');assert.equal(assessed.reasonCode,'COMBINED_QUALIFIED');
assert.equal(assessed.priority,'QUALIFIED');assert.ok(assessed.target.remainingAtr>=.25);
assert.equal(assessed.affectsOrders,false);assert.equal(assessed.affectsDiscord,true);
assert.equal(assessRangeSweepSignal({...longEvent,analysis:long},{at:now}).outcome,'SEND');
for(const state of ['CONFLICT','MISSING','WAIT']){
 const result=assessRangeSweepSignal({...enriched,analysis:{...short,state}},{at:now});
 assert.equal(result.outcome,state==='CONFLICT'?'REJECT':'WAIT');
}
for(const analysis of [null,{...short,eventId:'wrong'},{...short,symbol:'OTHERUSDT'},{...short,at:now+1}]){
 assert.equal(assessRangeSweepSignal({...event,analysis},{at:now}).outcome,'WAIT');
}
for(const [current,code] of [
 [{price:100.5,at},'BASE_REENTERED'],[{price:98.4,at},'PRICE_TOO_FAR'],
 [{price:100,at,done:true},'WATCH_INVALIDATED'],[{price:100,at,touchedAt:at},'TARGET_ALREADY_TOUCHED'],
 [{price:100,at:at-1},'MARK_NOT_FRESH'],[{price:100,at:now+1001},'MARK_NOT_FRESH']
]){
 const result=assessRangeSweepSignal(enriched,{at:now,current});assert.equal(result.reasonCode,code);assert.notEqual(result.outcome,'SEND');
}
assert.equal(assessRangeSweepSignal(enriched,{at:at+10001}).reasonCode,'MARK_NOT_FRESH');
assert.equal(assessRangeSweepSignal(enriched,{at:at+30001}).reasonCode,'EVENT_EXPIRED');
const closeTarget={...enriched,analysis:{...short,model:{...short.model,below:{low:99.7,high:99.8}}}};
assert.equal(assessRangeSweepSignal(closeTarget,{at:now}).reasonCode,'TARGET_TOO_CLOSE');
assert.equal(assessRangeSweepSignal({...enriched,flow:{...event.flow,buyPct:46}},{at:now}).reasonCode,'FLOW_NOT_CONFIRMED');
assert.equal(assessRangeSweepSignal({...enriched,flow:{...event.flow,volumeX:1.99}},{at:now}).reasonCode,'FLOW_NOT_CONFIRMED');
assert.equal(assessRangeSweepSignal({...enriched,flow:{...event.flow,end:now}},{at:now}).reasonCode,'FLOW_NOT_CONFIRMED');
assert.equal(assessRangeSweepSignal({...enriched,analysis:{...short,position:{...short.position,point:{...point,sourceAt:now-900001}}}},{at:now}).reasonCode,'SOURCE_NOT_FRESH');
assert.equal(assessRangeSweepSignal({...enriched,analysis:{...short,positionRatio:{...short.positionRatio,longPct:70}}},{at:now}).reasonCode,'SOURCE_DISAGREES');
const qualifiedPayload=rangeSweepDiscordPayload({...enriched,assessment:assessed}).embeds[0];
assert.match(qualifiedPayload.title,/ĐỒNG THUẬN TỔNG HỢP/);
assert.match(qualifiedPayload.description,/ĐÃ QUA BỘ LỌC TỔNG HỢP/);
assert.match(qualifiedPayload.fields[0].name,/KẾT LUẬN TỔNG HỢP/);
assert.ok(qualifiedPayload.fields.every(f=>f.value.length<=1024));
assert.ok(qualifiedPayload.fields.reduce((sum,f)=>sum+f.name.length+f.value.length,0)+qualifiedPayload.title.length+qualifiedPayload.description.length+qualifiedPayload.footer.text.length<=6000);
const gateDirectory=await mkdtemp(join(tmpdir(),'range-send-filter-')),gateFile=join(gateDirectory,'state.json');
try{
 let gatedPosts=0;
 const allowed=new RangeLiquiditySweepWatch({file:gateFile,filterConfirmed:true,now:()=>now,getAnalysis:async()=>short,
  discordSender:async e=>{
   const saved=JSON.parse(await readFile(gateFile,'utf8')).history.at(-1);
   assert.equal(saved.assessment.outcome,'SEND');assert.equal(saved.delivery.status,'PENDING');
   assert.equal(e.assessment.reasonCode,'COMBINED_QUALIFIED');gatedPosts++;return {sent:1};
  }});
 await allowed.init();await allowed.record(event);assert.equal(gatedPosts,1);
 assert.equal(allowed.snapshot().deliveryPolicy.combinedConfirmed.enabled,true);
 const replay=new RangeLiquiditySweepWatch({file:gateFile,filterConfirmed:true,now:()=>now,discordSender:async()=>{gatedPosts++;return {sent:1};}});
 await replay.init();await replay.record(event);assert.equal(gatedPosts,1);
 for(const state of ['MISSING','CONFLICT','WAIT']){
  const filtered=new RangeLiquiditySweepWatch({filterConfirmed:true,now:()=>now,getAnalysis:async()=>({...short,state}),
   discordSender:async()=>{throw Error('filtered message posted');}});
  await filtered.record(event);assert.equal(filtered.history[0].delivery.status,'FILTERED');
  assert.notEqual(filtered.history[0].assessment.outcome,'SEND');
  await filtered.record({...event,id:event.id+'-another'});assert.equal(filtered.history.length,1);
 }
 const unavailable=new RangeLiquiditySweepWatch({filterConfirmed:true,now:()=>now,getAnalysis:()=>{throw Error('missing');},
  discordSender:()=>{throw Error('lookup failure posted');}});
 await unavailable.record(event);assert.equal(unavailable.history[0].delivery.reasonCode,'CONTEXT_MISSING');
 const latest=new RangeLiquiditySweepWatch({filterConfirmed:true,now:()=>now,getAnalysis:async()=>short,
  discordSender:()=>{throw Error('base reentry posted');}});
 latest.cohorts.set(event.symbol,{id:'cohort',lastPrice:101,lastTickAt:now});
 await latest.record({...event,cohortId:'cohort'});assert.equal(latest.history[0].assessment.reasonCode,'BASE_REENTERED');
 const broken=new RangeLiquiditySweepWatch({filterConfirmed:true,now:()=>now,getAnalysis:async()=>short,
  discordSender:()=>{throw Error('storage failure posted');}});
 broken.save=async()=>{throw Error('disk');};
 await assert.rejects(broken.record(event),/disk/);
}finally{await rm(gateDirectory,{recursive:true,force:true});}
console.log('PASS combined send filter: only qualified LONG/SHORT reach POST, wait/conflict/missing/invalid/stale/chased/target-close are filtered, latest cohort checked, durable decisions and no replay. Mock only.');

