import assert from 'node:assert/strict';
import {evaluateWeakAltRebound,evaluateAltCountertrend,weakAltClosedRows,countertrendEvidence} from '../src/weakAltRebound.js';
import {COUNTERTREND_VERSION as VERSION,COUNTERTREND_LABELS,countertrendKey,countertrendTradeKey} from '../public/weak-alt-rebound-model.js';
import {normalizeLiquidLiveCardKey,liquidLiveCardKeysOfTrade,matchLiquidLiveCardWhitelist} from '../src/liquidLiveCardWhitelist.js';
const step=900000,end=Math.floor(Date.now()/step)*step-1,now=end+1000,start=end-100*step+1;
function bars(change=.2){let p=100;return Array.from({length:100},(_,i)=>{const open=p;p*=1+change/100;const q=i>=96?30:10;
  return {openTime:start+i*step,closeTime:start+(i+1)*step-1,open,close:p,high:Math.max(open,p)*1.0001,low:Math.min(open,p)*.9999,quoteVolume:q,takerBuyQuoteVolume:q*.65};});}
const rows=weakAltClosedRows(bars(),now),btc={ret15m:-.2,ret1h:-.4};
const common={symbol:'TESTUSDT',rows,btc,now};
assert.equal(evaluateAltCountertrend(common).tier,'SQUEEZE_SUSPECTED');
assert.equal(evaluateAltCountertrend({...common,rows:rows.map(r=>({...r,takerBuyQuoteVolume:null}))}).tier,'COUNTERTREND_UP');
assert.equal(evaluateAltCountertrend({...common,rows:weakAltClosedRows(bars(0),now)}).tier,'HOLDING');
assert.equal(evaluateAltCountertrend({...common,rows:weakAltClosedRows(bars(-.2),now)}),null);
assert.equal(evaluateAltCountertrend({...common,btc:{ret15m:.2,ret1h:.4}}),null);
const only15=evaluateAltCountertrend({...common,btc:{ret15m:-.2,ret1h:.4}});
assert.equal(only15.basis,'15m');assert.equal(only15.btcReturn,-.2);
assert.equal(evaluateAltCountertrend({...common,btc:{ret15m:-1,ret1h:-.4}}).basis,'1h','one-hour downside takes priority');
assert.equal(evaluateAltCountertrend({...common,rows:rows.map(r=>({...r,takerBuyQuoteVolume:r.quoteVolume+1}))}).tier,'COUNTERTREND_UP','invalid taker cannot imply flow');
const observed=evaluateAltCountertrend({...common,getEvidence:(s,a,b)=>({startAt:a,endAt:b,shortLiquidation:{covered:true,usd:1500,count:2},oi:{covered:false}})});
assert.equal(observed.tier,'SHORT_LIQ_OBSERVED');assert.equal(observed.shortLiquidation.usd,1500);
assert.equal(evaluateAltCountertrend({...common,getEvidence:()=>({startAt:0,endAt:1,shortLiquidation:{covered:true,usd:999,count:1}})}).tier,'SQUEEZE_SUSPECTED','mismatched evidence window not used');
const a=end-step+1,evidence={startAt:a,endAt:end,now,socketState:'OPEN',connectedAt:a-1,lastTransportAt:now,
  oiRows:Array.from({length:16},(_,i)=>({at:a+i*60000,value:1000-i})),
  events:[{side:'BUY',at:a+100,usd:10},{side:'SELL',at:a+100,usd:50},{side:'BUY',at:end+1,usd:100000}]};
const e=countertrendEvidence(evidence);assert.equal(e.shortLiquidation.usd,10);assert.equal(e.shortLiquidation.count,1);
assert(e.oi.covered);assert(e.oi.changePct<-.3);
assert.equal(countertrendEvidence({...evidence,connectedAt:a+1}).shortLiquidation.covered,false);
assert.equal(countertrendEvidence({...evidence,lastTransportAt:now+1}).shortLiquidation.covered,false);
assert.equal(countertrendEvidence({...evidence,lastTransportAt:now-240001}).shortLiquidation.covered,false);
assert.equal(countertrendEvidence({...evidence,events:[]}).shortLiquidation.usd,0,'zero only on covered sampled source');
assert.equal(countertrendEvidence({...evidence,connectedAt:null,events:[]}).shortLiquidation.usd,null,'no coverage is unknown, never zero');
assert.equal(countertrendEvidence({...evidence,oiRows:evidence.oiRows.filter((_,i)=>i<4||i>10)}).oi.covered,false);
assert.equal(countertrendEvidence({...evidence,oiRows:evidence.oiRows.map(r=>({...r,at:r.at+step}))}).oi.covered,false);
const universe=Array.from({length:35},(_,i)=>({symbol:`ALT${i}USDT`,candles15m:bars(-.5)}));universe.push({symbol:'LEADERUSDT',candles15m:bars()});
const data=evaluateWeakAltRebound({universe,btcRows:bars(-.2),now});
assert.equal(data.state,'BTC_DOWN_ALT_WEAK');assert.equal(data.countertrend.coins.length,1);assert.equal(data.countertrend.coins[0].symbol,'LEADERUSDT');
assert.equal(data.countertrend.counts.SQUEEZE_SUSPECTED,1);assert.equal(data.coins[0].symbol==='LEADERUSDT',false,'general weak-market sort can hide leader, separate list cannot');
const future={...bars().at(-1),openTime:end+1,closeTime:end+step};
const withEvidence=evaluateWeakAltRebound({universe,btcRows:bars(-.2),now,getCountertrendEvidence:(s,a,b)=>({startAt:a,endAt:b,shortLiquidation:{covered:true,usd:1500,count:2}})});
const strip=x=>{const {countertrend,...rest}=x;return rest;};
assert.deepEqual(strip(withEvidence),strip(data),'coin evidence never changes global state or market Push eligibility');
assert.equal(evaluateWeakAltRebound({universe:universe.slice(0,20),btcRows:bars(-.2),now}).countertrend,undefined,'insufficient synchronized coverage does not expose a false complete list');
assert.deepEqual(evaluateWeakAltRebound({universe:[...universe.slice(0,-1),{symbol:'LEADERUSDT',candles15m:[...bars(),future]}],btcRows:bars(-.2),now}).countertrend,data.countertrend);
for(const tier of Object.keys(COUNTERTREND_LABELS)){
  const key=countertrendKey(tier),proof={version:VERSION,source:'AT_ENTRY',ready:true,tier,symbol:'TESTUSDT',evaluatedAt:now};
  const trade={symbol:'TESTUSDT',entryAt:now+1,altCountertrendAtEntry:proof};
  assert.equal(normalizeLiquidLiveCardKey(key),key);assert(liquidLiveCardKeysOfTrade(trade).includes(key));assert.equal(matchLiquidLiveCardWhitelist(trade,[]).allowed,false);
  assert.equal(countertrendTradeKey({...trade,symbol:'OTHERUSDT'}),null);
  assert.equal(countertrendTradeKey({...trade,entryAt:now-1}),null);
  assert.equal(countertrendTradeKey({...trade,entryAt:now+60001}),null);
  assert.equal(countertrendTradeKey({...trade,altCountertrendAtEntry:{...proof,source:'VIEW_ONLY'}}),null);
}
assert.equal(countertrendTradeKey({}),null);assert.equal(countertrendKey('UNKNOWN'),null);
console.log('ALT countertrend PASS: red market retains leader, 4 causal tiers, OI/force time coverage, no future evidence, exact whitelist/defaultOFF. No orders or notifications.');
