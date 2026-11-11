import assert from 'node:assert/strict';
import {evaluateSweepPumpPhase} from '../src/heatmapSweepPumpPhase.js';
import {buildUpperReboundWatch,createHeatmapSweepDiscordSender,heatmapSweepDiscordPayload,UPPER_REBOUND_WATCH_VERSION} from '../src/heatmapSweepDiscord.js';

const S=300000,end=1800000000000,at=end+1000;
const zone=(low,high,extra={})=>({low,high,overlapStrength:70,asOf:end-1,establishedAt:end-2*S-1,...extra});
const e={id:'rebound-observation',symbol:'PIEVERSEUSDT',kind:'UPPER_CLUSTER_SWEPT',direction:'UPPER',viewRange:'24h',at,observedAt:at,
 zonesAsOf:end-1,armedAt:end,referencePrice:104,markPrice:105,previousMarkPrice:104.8,previousTickAt:end+500,maxDistancePct:5,
 clearedCount:1,totalCount:3,zones:[zone(104.4,104.9,{cleared:true,touched:true}),zone(106,107),zone(107.2,108)]};
const closes=[...Array(270).fill(100),105,110,115,120,118,112,105,100,99,98,100,101,102,102,103,103,104,104];
const rows=closes.map((close,i)=>{const o=closes[i-1]??close;return [end-(288-i)*S,o,Math.max(o,close),Math.min(o,close),close,1,end-(287-i)*S-1];});
const phase=e=>evaluateSweepPumpPhase({event:e,coinRows:rows,now:e.at});
assert.equal(phase(e).state,'REBOUND_BELOW_PEAK');
const review=buildUpperReboundWatch(e,phase(e));
assert.equal(review.version,UPPER_REBOUND_WATCH_VERSION);
assert.equal(review.clearedEdge,104.9);
assert.equal(review.target.low,106);
assert.equal(review.target.high,107);
assert.equal(review.remainingCount,2);
assert.equal(review.affectsOrders,false);
assert.equal(buildUpperReboundWatch(e,{...phase(e),state:'FIRST_PUSH'}),null);
assert.equal(buildUpperReboundWatch({...e,previousMarkPrice:104.95},phase(e)),null);
assert.equal(buildUpperReboundWatch({...e,previousTickAt:at-10001},phase(e)),null);
assert.equal(buildUpperReboundWatch({...e,zones:[e.zones[0],{...e.zones[1],asOf:end+1},e.zones[2]]},phase(e)),null);
assert.equal(buildUpperReboundWatch({...e,zones:e.zones.map(z=>({...z,touched:true}))},phase(e)),null);
assert.equal(buildUpperReboundWatch({...e,zones:[e.zones[0],{...e.zones[1],touched:true},e.zones[2]]},phase(e)).target.low,107.2);
const all={...e,id:'full',kind:'ALL_TRACKED_UPPER_SWEPT',clearedCount:3};
assert.equal(buildUpperReboundWatch(all,phase(all)),null);
const payload=heatmapSweepDiscordPayload({...e,pumpPhase:phase(e),upperReboundWatch:review});
const b=payload.embeds[0];
assert.match(b.title,/^🔵 PIEVERSEUSDT.*BƠM HỒI · HƯỚNG TỚI CỤM TRÊN$/);
assert.equal(b.color,0x3ea6ff);
assert.match(b.fields[0].value,/Chạm cụm kế tiếp khi MARK ≥ 106/);
assert.match(b.fields[0].value,/Vượt hết cụm kế tiếp khi MARK ≥ 107/);
assert.match(b.fields[0].value,/70\.0/);
assert.deepEqual(payload.allowed_mentions.parse,[]);
assert.ok(b.fields.length<=25&&b.fields.every(f=>f.value.length<=1024));
assert.ok(b.title.length+b.description.length+b.footer.text.length+b.fields.reduce((sum,f)=>sum+f.name.length+f.value.length,0)<=6000);
assert.doesNotMatch(heatmapSweepDiscordPayload({...e,pumpPhase:phase(e)}).embeds[0].title,/HƯỚNG TỚI CỤM TRÊN/);

const partial='https://discord.com/api/webhooks/123/partial', full='https://discord.com/api/webhooks/124/full';
const sent=[];
const original=structuredClone(e);
const sender=createHeatmapSweepDiscordSender({webhookUrl:partial,fullSweepWebhookUrl:full,getPumpPhase:phase,loadSweepContinuation:()=>{throw Error('No candle wait');},
 fetchImpl:async(url,request)=>{
  sent.push([url,request.method,JSON.parse(request.body)]);
  return {ok:true,status:204};
 }});
const delivery=await sender(e);
assert.deepEqual(e,original);
assert.equal(sender.upperReboundWatchVersion,UPPER_REBOUND_WATCH_VERSION);
assert.equal(delivery.sent,1);
assert.deepEqual(delivery.upperReboundWatch,review);
assert.equal(delivery.firstPushLong,undefined);
assert.equal(sent.length,1);
assert.equal(sent[0][0],partial);
assert.equal(sent[0][1],'POST');
assert.match(sent[0][2].embeds[0].title,/HƯỚNG TỚI CỤM TRÊN/);
assert.equal((await sender(all)).upperReboundWatch,undefined);
assert.equal(sent[1][0],full);
assert.doesNotMatch(sent[1][2].embeds[0].title,/HƯỚNG TỚI CỤM TRÊN/);
console.log('PASS early rebound crossover, immutable next band and levels, partial Discord single POST, existing phases and full routing.');

