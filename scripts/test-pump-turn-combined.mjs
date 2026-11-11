import assert from 'node:assert/strict';
import {pumpTurnCombinedContext,pumpTurnCombinedFields} from '../src/pumpTurnCombinedContext.js';
import {sweepPositionContext} from '../src/heatmapSweepPositionAnalysis.js';
import {pumpTurnDiscordPayload,createPumpTurnDiscordSender} from '../src/pumpTurnDiscord.js';
const S=300000,at=1794027601000,end=at-1000,e={symbol:'KATUSDT',side:'LONG',observedAt:at,liveAt:at,livePrice:100,expiresAt:at+S,id:'test',preBuyPct:58};
const point={sourceAt:at-60000,observedAt:at-30000,whaleCount:100,whaleLong:20,smartLong:25,crowdLong:70};
const position=sweepPositionContext({...e,at},{at,points:[point]});
const model=(below=true)=>({models:[1,3].map(model=>({model,status:'OK',data:{source:'BINANCE_LOCAL',symbol:e.symbol,range:'24h',step:S,end,inputs:{markCoveragePct:100,oiCoveragePct:100},candles:[{time:end-2*S,open:100,high:100.4,low:99.6,close:100},{time:end-S,open:100,high:100.3,low:99.7,close:100}],profiles:Array.from({length:3},(_,i)=>({at:end-1-(2-i)*S,mark:true,oiFresh:true,bins:[[Math.round(Math.log(below?97:103)/Math.log(1.0025)),100]]}))}}))});
const c=pumpTurnCombinedContext(e,{at,position,bundle:model()});assert.equal(c.state,'WATCH_SHORT');assert.equal(c.originalSide,'LONG');assert.match(c.model.priceState,/Chưa đóng/);assert.equal(c.affectsOrders,false);
const longPosition=sweepPositionContext({...e,at},{at,points:[{...point,whaleLong:80,smartLong:75}]});assert.equal(pumpTurnCombinedContext({...e,side:'SHORT'},{at,position:longPosition,bundle:model(false)}).state,'WATCH_LONG');
assert.equal(pumpTurnCombinedContext(e,{at,position,bundle:model(false)}).state,'CONFLICT');
assert.equal(pumpTurnCombinedContext(e,{at,position:null,bundle:model()}).state,'MISSING');
for(const mutate of [b=>b.models[1].data.symbol='BADUSDT',b=>b.models[1].data.inputs.oiCoveragePct=50,b=>b.models[0].data.end=at+1,b=>b.models[0].data.profiles[0].mark=false]){const b=model();mutate(b);assert.equal(pumpTurnCombinedContext(e,{at,position,bundle:b}).model,null);}
assert.equal(pumpTurnCombinedContext({...e,liveAt:at-40000},{at,position,bundle:model()}).model,null);
const payload=pumpTurnDiscordPayload({...e,combinedContext:c});assert.match(payload.embeds[0].title,/BỐI CẢNH NGHIÊNG SHORT/);assert.match(payload.embeds[0].fields[0].value,/QUAN SÁT SHORT/);assert.ok(payload.embeds[0].fields.every(f=>f.value.length<=1024));assert.ok(JSON.stringify(payload).includes('MODEL1/3'));assert.ok(payload.embeds[0].fields.some(f=>f.name==='BINANCE'));
let sent=0;const sender=createPumpTurnDiscordSender({webhookUrl:'https://discord.com/api/webhooks/123/test',getContext:async()=>c,fetchImpl:async(url,o)=>{sent++;assert.match(o.body,/QUAN SÁT SHORT/);return{ok:true,status:204};}});assert.deepEqual((await sender(e)).combinedContext,c);assert.equal(sent,1);
const failed=createPumpTurnDiscordSender({webhookUrl:'https://discord.com/api/webhooks/123/test',getContext:async()=>{throw Error('missing');},fetchImpl:async()=>({ok:true,status:204})});assert.equal((await failed(e)).sent,1);
console.log('PASS: early opposite-side assessment without breakdown; LONG/SHORT symmetry; missing/stale/mismatched models; delivery evidence and failure isolation');
