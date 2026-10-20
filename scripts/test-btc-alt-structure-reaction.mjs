import assert from 'node:assert/strict';
import {btcReactionContext,evaluateBtcAltReaction,classifyBtcReaction} from '../src/btcAltReaction.js';
import {trendProfile,evaluateBtcAltStructure,classifyTrendMetrics} from '../src/btcAltCoinStructure.js';
import {BTC_ALT_STRUCTURE_VERSION,BTC_ALT_STRUCTURE_LABELS,btcAltStructureKey,btcAltStructureTradeKey} from '../public/btc-alt-structure-model.js';
import {BTC_ALT_REACTION_VERSION,BTC_ALT_REACTION_LABELS,btcAltReactionKey,btcAltReactionTradeKey} from '../public/btc-alt-reaction-model.js';
import {normalizeLiquidLiveCardKey,liquidLiveCardKeysOfTrade,matchLiquidLiveCardWhitelist} from '../src/liquidLiveCardWhitelist.js';
const minute=60000,step=900000,end=Math.floor(Date.now()/minute)*minute-1,now=end+10000;
function bars(closes,size,finish){return closes.map((close,i)=>{const open=closes[Math.max(0,i-1)];return {openTime:finish-(closes.length-i)*size+1,closeTime:finish-(closes.length-1-i)*size,open,close,high:Math.max(open,close)*1.0001,low:Math.min(open,close)*.9999,quoteVolume:100};});}
const close15=Math.floor(now/step)*step-1;
const sideways=bars(Array.from({length:100},(_,i)=>i>=96?100+(i-95)*.155:100+.5*Math.sin(i*Math.PI/4)),step,close15);
const pump=bars(Array.from({length:100},(_,i)=>100*(1.001**i)),step,close15),dump=bars(Array.from({length:100},(_,i)=>100*(.999**i)),step,close15);
assert.equal(trendProfile(sideways,now).state,'SIDEWAYS');assert(trendProfile(sideways,now).ret1h>.6,'BTC green1h can still have sideways6h structure');
assert.equal(trendProfile(pump,now).state,'UP');assert.equal(trendProfile(dump,now).state,'DOWN');
assert.equal(classifyTrendMetrics({ret6h:2.218,ret3h:7.538,ret24h:28.406,efficiency:.07,atr:3.334,emaUp:true,emaDown:false}).state,'UP','Q live metrics: 24h trend cannot be called sideways just because6h is choppy');
assert.equal(classifyTrendMetrics({ret6h:-2.218,ret3h:-7.538,ret24h:-28.406,efficiency:.07,atr:3.334,emaUp:false,emaDown:true}).state,'DOWN','symmetric persistent dump');
assert.equal(classifyTrendMetrics({ret6h:-12.861,ret3h:-2.333,ret24h:-13.323,efficiency:.323,atr:4.039,emaUp:false,emaDown:true}).state,'DOWN','screenshot dumpcoin is not sideways just because volatility is high');
assert.equal(classifyTrendMetrics({ret6h:-.838,ret3h:-.625,ret24h:-.75,efficiency:.204,atr:.35,emaUp:false,emaDown:true}).state,'SIDEWAYS','BTC oscillating broad base is not inferred strong down from red1h');
const minuteBTC=bars([...Array(12).fill(100),101,102,101,100.8],minute,end),minuteQ=bars(Array(16).fill(.05),minute,end);
const minuteRows={BTCUSDT:minuteBTC,QUSDT:minuteQ,DUMPUSDT:minuteBTC};
const reaction=evaluateBtcAltReaction({symbols:['QUSDT','DUMPUSDT','MISSINGUSDT'],getRows:s=>minuteRows[s],now});
assert.equal(reaction.context.direction,'DOWN');assert.equal(reaction.context.anchorPrice,102);
assert.equal(reaction.coins.find(c=>c.symbol==='QUSDT').group,'FLAT','Q holding during new dump cannot be called followsBTC because1h pumped');
assert.equal(reaction.coins.find(c=>c.symbol==='DUMPUSDT').group,'WITH_STRONG');assert.equal(reaction.counts.DATA_MISSING,1);
const profiles={BTCUSDT:sideways,QUSDT:pump,DUMPUSDT:dump};
const structure=evaluateBtcAltStructure({symbols:['QUSDT','DUMPUSDT','MISSINGUSDT'],getRows:s=>profiles[s],now,reaction});
assert.equal(structure.btc.state,'SIDEWAYS');assert.equal(structure.coins.find(c=>c.symbol==='QUSDT').group,'UP');
assert(structure.coins.find(c=>c.symbol==='QUSDT').relation.includes('BTC đi ngang'));
assert.equal(structure.coins.find(c=>c.symbol==='DUMPUSDT').group,'DOWN');assert(structure.coins.find(c=>c.symbol==='DUMPUSDT').relation.includes('nền giảm riêng'));
const rising=minuteBTC.map(r=>({...r,open:200-r.open,close:200-r.close,high:200-r.low,low:200-r.high}));
assert.equal(btcReactionContext(rising,now).direction,'UP','symmetric recent rebound');
const forming=s=>({price:s==='BTCUSDT'?100.4:.05002,at:now,openTime:end+1});
const live=evaluateBtcAltReaction({symbols:['QUSDT'],getRows:s=>minuteRows[s],getLivePoint:forming,now});
assert.equal(live.context.mode,'LIVE_PREVIEW');assert.equal(live.coins[0].group,'FLAT');
assert.equal(evaluateBtcAltReaction({symbols:['QUSDT'],getRows:s=>minuteRows[s],getLivePoint:s=>({...forming(s),at:s==='QUSDT'?now-6000:now}),now}).coins[0].group,'DATA_MISSING');
assert.equal(evaluateBtcAltReaction({symbols:['QUSDT'],getRows:s=>minuteRows[s],getLivePoint:s=>({...forming(s),at:s==='QUSDT'?now+1:now}),now}).coins[0].group,'DATA_MISSING');
assert.equal(btcReactionContext(minuteBTC,now+120000).ready,false);assert.equal(btcReactionContext(minuteBTC.filter((_,i)=>i!==8),now).ready,false);
assert.equal(classifyBtcReaction(-1,0),'FLAT');assert.equal(classifyBtcReaction(-1,.2),'AGAINST_WEAK');assert.equal(classifyBtcReaction(1,-2),'AGAINST_STRONG');assert.equal(classifyBtcReaction(null,1),'DATA_MISSING');
const future={...minuteBTC.at(-1),openTime:end+1,closeTime:end+minute,close:1e9,high:1e9};assert.deepEqual(btcReactionContext([...minuteBTC,future],now),btcReactionContext(minuteBTC,now));
for(const [labels,keyOf,match,version,field] of [[BTC_ALT_STRUCTURE_LABELS,btcAltStructureKey,btcAltStructureTradeKey,BTC_ALT_STRUCTURE_VERSION,'btcAltStructureAtEntry'],[BTC_ALT_REACTION_LABELS,btcAltReactionKey,btcAltReactionTradeKey,BTC_ALT_REACTION_VERSION,'btcAltReactionAtEntry']]){
 for(const group of Object.keys(labels)){
  const key=keyOf(group),proof={version,group,ready:true,source:'AT_ENTRY',symbol:'QUSDT',evaluatedAt:now},trade={symbol:'QUSDT',entryAt:now,[field]:proof};
  assert.equal(normalizeLiquidLiveCardKey(key),key);assert.equal(matchLiquidLiveCardWhitelist(trade,[]).allowed,false);
  if(group==='DATA_MISSING')assert.equal(match(trade),null);else assert(liquidLiveCardKeysOfTrade(trade).includes(key));
  assert.equal(match({...trade,symbol:'OTHERUSDT'}),null);assert.equal(match({...trade,entryAt:now-1}),null);assert.equal(match({...trade,entryAt:now+60001}),null);assert.equal(match({...trade,[field]:{...proof,source:'VIEW_ONLY'}}),null);
 }
 assert.equal(match({}),null);
}
console.log('PASS separate trend/reaction: sideways BTC + pumpingQ + dumpingcoin, same-time dump anchor/flatQ, live freshness/skew/future, coverage, whitelist all14 keys/defaultOFF. No orders/notifications.');
