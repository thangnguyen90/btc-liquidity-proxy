import assert from 'node:assert/strict';
import {HeatmapSecondSweepTracker} from '../src/heatmapSecondSweep.js';
import {evaluateSweepPumpPhase,SWEEP_PUMP_PHASE_VERSION,validSweepPumpPhase} from '../src/heatmapSweepPumpPhase.js';
import {heatmapSweepDiscordPayload,createHeatmapSweepDiscordSender} from '../src/heatmapSweepDiscord.js';
import {evaluateUpperMomentum} from '../src/heatmapUpperMomentum.js';
import {sweepPositionContext} from '../src/heatmapSweepPositionAnalysis.js';
import {reviewSweep} from '../src/heatmapSweepVerdict.js';

const S=300000,end=Math.floor(Date.now()/S)*S,at=end+1000;
const e={id:'pump-phase-test',symbol:'BNTUSDT',direction:'UPPER',kind:'ALL_TRACKED_UPPER_SWEPT',at,observedAt:at,
 markPrice:103.5,referencePrice:100,clearedCount:1,totalCount:1,maxDistancePct:5,viewRange:'24h',zonesAsOf:end-1,armedAt:end,
 zones:[{low:102,high:103,cleared:true}]};
const rowsFor=closes=>closes.map((close,i)=>{const open=i?closes[i-1]:close;return[end-(288-i)*S,open,Math.max(open,close)+.01,Math.min(open,close)-.01,close,1,end-(287-i)*S-1,1000,1,0,500];});
const initial=rowsFor([...Array(282).fill(100),100.5,101,101.5,102,102.5,103]);
const evalRows=(event,rows)=>evaluateSweepPumpPhase({event,coinRows:rows,now:event.at});
const first=evalRows(e,initial);assert.equal(first.state,'FIRST_PUSH');assert.equal(first.sources.bars,288);assert.ok(validSweepPumpPhase(e,first));
const rebound=rowsFor([...Array(270).fill(100),105,110,115,120,118,112,105,100,99,98,100,101,102,102,103,103,104,104]);
const re={...e,id:'rebound',markPrice:105},r=evalRows(re,rebound);
assert.equal(r.state,'REBOUND_BELOW_PEAK');assert.equal(r.features.previousPeak,120);assert.equal(r.features.trough,98);
assert.ok(Math.abs(r.features.reboundPct-(105/98-1)*100)<1e-9);
assert.equal(evalRows({...re,markPrice:121},rebound).state,'REBOUND_BREAKOUT');
assert.equal(evalRows({...re,markPrice:98.5},rebound).state,'UNKNOWN','a sweep uptick is not automatically a rebound');
assert.equal(evalRows(e,rowsFor(Array(288).fill(103.5))).state,'UNKNOWN','no clear rise is not called a first pump');
assert.equal(evalRows(e,initial.slice(1)).state,'UNKNOWN');
assert.equal(evalRows(e,initial.filter((_,i)=>i!==270)).state,'UNKNOWN','a gap cannot become evidence of absence');
assert.equal(evalRows(e,[...initial.slice(0,-1),initial.at(-2)]).state,'UNKNOWN','duplicates do not replace a missing bar');
const malformed=structuredClone(initial);malformed[250][3]=-1;assert.equal(evalRows(e,malformed).state,'UNKNOWN');
const spike=structuredClone(initial);spike[100][2]=200;
assert.equal(evalRows(e,spike).state,'FIRST_PUSH','intrabar wick is not a proven ordered pump/dump on close data');
const future=[end,103,9999,.01,9998,1,end+S-1,1e12];
assert.deepEqual(evalRows(e,[...initial,future]),first,'forming/future bars cannot repaint the event');
assert.equal(evaluateSweepPumpPhase({event:e,coinRows:initial,now:e.at+30001}).state,'UNKNOWN');
assert.equal(evaluateSweepPumpPhase({event:e,coinRows:initial,now:e.at-1001}).state,'UNKNOWN');
assert.equal(evalRows({...e,direction:'LOWER'},initial),null);
const raw={symbol:e.symbol,savedAt:at,price:initial,mark:rebound};
assert.equal(evaluateSweepPumpPhase({event:re,coinRows:initial,raw,now:at}).state,'REBOUND_BELOW_PEAK');
assert.equal(evaluateSweepPumpPhase({event:re,coinRows:initial,raw,now:at}).sources.type,'MARK_5M_CLOSE');
assert.equal(evaluateSweepPumpPhase({event:e,raw:{...raw,symbol:'OTHERUSDT'},now:at}).state,'UNKNOWN');
assert.equal(evaluateSweepPumpPhase({event:e,raw:{...raw,savedAt:at+1},now:at}).state,'UNKNOWN');
const objects=initial.map(b=>({openTime:b[0],open:b[1],high:b[2],low:b[3],close:b[4],closeTime:b[6],isClosed:true}));
assert.equal(evalRows(e,objects).state,'FIRST_PUSH');objects.at(-1).isClosed=false;assert.equal(evalRows(e,objects).state,'UNKNOWN');
assert.equal(evaluateSweepPumpPhase({event:e,raw:{symbol:e.symbol,savedAt:at,price:initial.slice(0,280)},coinRows:initial.slice(280),now:at}).state,'FIRST_PUSH');

// Reuse the pre-existing causal MARK proof, without changing its trade matcher.
const tracker=new HeatmapSecondSweepTracker(),t=at-30000;
tracker.classify({...e,id:'first-mark-sweep',at:t,markPrice:100,referencePrice:90});
for(const [p,delta]of [[110,10000],[100,20000],[105,30000]])tracker.onMark(e.symbol,p,t+delta);
const secondEvent={...e,id:'second-mark-sweep',markPrice:105};secondEvent.secondSweep=tracker.classify(secondEvent);assert.ok(secondEvent.secondSweep);
const fromMark=evalRows(secondEvent,[]);assert.equal(fromMark.state,'REBOUND_BELOW_PEAK');assert.equal(fromMark.sources.type,'CONTINUOUS_MARK_SECOND_SWEEP');
assert.equal(fromMark.sources.firstEventId,'first-mark-sweep');

const position=sweepPositionContext(e,{at,points:[{sourceAt:at-60000,observedAt:at-1000,whaleCount:100,whaleLong:40,smartLong:41,crowdLong:70}]});
const decorated={...e,pumpPhase:first,upperMomentum:evaluateUpperMomentum({event:e,coinRows:initial,coinReadAt:at,now:at}),positionAnalysis:position,sweepVerdict:reviewSweep(e,{rows:initial,now:at,position})};
for(const item of [decorated,{...re,pumpPhase:r},{...e,pumpPhase:evalRows(e,[])},{...secondEvent,pumpPhase:fromMark}]){
 const payload=heatmapSweepDiscordPayload(item),b=payload.embeds[0];
 assert.ok(b.fields.some(f=>f.name==='NHỊP BƠM / QUÉT THANH KHOẢN'));assert.ok(b.fields.every(f=>f.value.length<=1024));
 assert.ok(b.fields.length<=25&&b.title.length<=256);
 const size=b.title.length+b.description.length+b.footer.text.length+b.fields.reduce((s,f)=>s+f.name.length+f.value.length,0);assert.ok(size<=6000,size);
 assert.deepEqual(payload.allowed_mentions.parse,[]);
}
const combined=heatmapSweepDiscordPayload(decorated).embeds[0];
assert.ok(combined.fields.some(f=>f.name==='KẾT LUẬN QUAN SÁT'));assert.ok(combined.fields.some(f=>f.name.includes('TOP BINANCE')));
assert.match(combined.title,/BƠM ĐẦU/);assert.match(heatmapSweepDiscordPayload({...re,pumpPhase:r}).embeds[0].title,/BƠM HỒI/);
assert.equal(heatmapSweepDiscordPayload(e).embeds[0].fields.some(f=>f.name==='NHỊP BƠM / QUÉT THANH KHOẢN'),false,'old JSON remains unclassified');
assert.equal(heatmapSweepDiscordPayload({...e,pumpPhase:{...first,eventId:'other'}}).embeds[0].fields.some(f=>f.name==='NHỊP BƠM / QUÉT THANH KHOẢN'),false);
assert.equal(validSweepPumpPhase(e,{...first,features:null}),false);
assert.equal(validSweepPumpPhase(re,{...r,features:{...r.features,reboundPct:99}}),false);
assert.equal(validSweepPumpPhase(e,{...first,sources:{...first.sources,bars:287}}),false);

let calls=0;const eventBefore=structuredClone(e);
const sender=createHeatmapSweepDiscordSender({webhookUrl:'https://discord.com/api/webhooks/123/test',getPumpPhase:event=>evalRows(event,initial),getAnalysis:async()=>position,
 fetchImpl:async(_url,init)=>{calls++;const p=JSON.parse(init.body);assert.match(p.embeds[0].title,/BƠM ĐẦU/);return {ok:true,status:204};}});
const delivered=await sender(e);assert.equal(calls,1);assert.equal(delivered.pumpPhase.state,'FIRST_PUSH');assert.deepEqual(e,eventBefore);
assert.equal(sender.pumpPhaseVersion,SWEEP_PUMP_PHASE_VERSION);assert.equal(delivered.pumpPhase.affectsOrders,false);
initial.at(-1)[4]=999;assert.equal(delivered.pumpPhase.state,'FIRST_PUSH','delivery stores its own frozen snapshot');
const fail=createHeatmapSweepDiscordSender({webhookUrl:'https://discord.com/api/webhooks/123/test',getPumpPhase:()=>{throw Error('cache');},fetchImpl:async()=>({ok:true,status:204})});
assert.equal((await fail(e)).sent,1,'classification failure cannot suppress the existing alert');
console.log('PASS first push/rebound below or above peak; full24h/gap/stale/future/invalid guards; cached MARK/trade parity; immutable continuous MARK proof; Discord budget/context/metadata/routing single mock POST; old JSON/no trade impact.');
