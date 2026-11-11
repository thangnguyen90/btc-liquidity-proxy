import assert from 'node:assert/strict';
import {sweepPositionContext,SweepPositionAnalysis,sweepPositionFields} from '../src/heatmapSweepPositionAnalysis.js';
import {heatmapSweepDiscordPayload,createHeatmapSweepDiscordSender} from '../src/heatmapSweepDiscord.js';
const at=1794027600000,e={symbol:'GTCUSDT',direction:'UPPER',kind:'UPPER_ZONE_SWEPT',at,id:'test',viewRange:'24h',zones:[],clearedCount:1,totalCount:3,maxDistancePct:5,referencePrice:1,markPrice:1.02,zonesAsOf:at-300000,armedAt:at-200000};
const p={sourceAt:at-60000,observedAt:at-30000,whaleCount:100,whaleLong:10,smartLong:20,crowdLong:70},previous={...p,sourceAt:p.sourceAt-3600000,observedAt:p.observedAt-3600000,whaleLong:20,smartLong:30};
const c=sweepPositionContext(e,{at,points:[previous,p],ratioReadAt:at,ratioRows:[{timestamp:at-300000,longShortRatio:3}]});assert.equal(c.point.whaleLong,10);assert.match(c.view,/NGHIÊNG SHORT/);assert.match(c.view,/trái chiều/);assert.equal(c.top.longPct,75);assert.equal(c.previous.whaleLong,20);
for(const bad of [{...p,ambiguous:true},{...p,observedAt:at+1},{...p,sourceAt:at-1000000},{...p,smartLong:null}])assert.equal(sweepPositionContext(e,{at,points:[bad]}).point,null);
assert.equal(sweepPositionContext(e,{at,ratioReadAt:at,ratioRows:[{timestamp:at+1,longShortRatio:3}]}).top,null);
assert.match(sweepPositionContext({...e,direction:'LOWER'},{at,points:[p]}).view,/áp lực giảm/);
assert.match(sweepPositionContext({...e,direction:'LOWER'},{at,points:[{...p,whaleLong:80,smartLong:90,crowdLong:30}]}).view,/thiên hướng hồi/);
for(const direction of ['UPPER','LOWER']){const x=heatmapSweepDiscordPayload({...e,direction,positionAnalysis:c});assert.ok(x.embeds[0].fields.some(f=>f.name.includes('TOP BINANCE')));assert.ok(x.embeds[0].fields.every(f=>f.value.length<=1024));assert.ok(x.embeds[0].fields.some(f=>f.name==='BINANCE'));assert.equal(x.allowed_mentions.parse.length,0);}
let calls=0;const sender=createHeatmapSweepDiscordSender({webhookUrl:'https://discord.com/api/webhooks/123/test',getAnalysis:async()=>c,fetchImpl:async(url,o)=>{calls++;const payload=JSON.parse(o.body);assert.match(JSON.stringify(payload),/90.0% SHORT/);return{ok:true,status:204};}});const delivered=await sender(e);assert.equal(calls,1);assert.deepEqual(delivered.positionAnalysis,c);
const fail=createHeatmapSweepDiscordSender({webhookUrl:'https://discord.com/api/webhooks/123/test',getAnalysis:async()=>{throw Error('source');},fetchImpl:async(url,o)=>{assert.match(o.body,/Chưa có dữ liệu/);return{ok:true,status:204};}});assert.equal((await fail(e)).sent,1);
const provider=new SweepPositionAnalysis({now:()=>at,getPoints:()=>[p],getRatio:()=>({fetchedAt:at,rows:[{timestamp:at-300000,longShortRatio:3}]}),fetchImpl:()=>{throw Error('should use cache');}});assert.equal((await provider.get(e)).point.whaleLong,10);
console.log('PASS context both directions; known/stale/ambiguous data; independent Binance ratio; payload limits; delivery proof; provider failure preserves send');
