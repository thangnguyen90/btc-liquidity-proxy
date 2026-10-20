import assert from 'node:assert/strict';
import {classifyCoinRelation,evaluateWeakAltRebound,WeakAltReboundMonitor} from '../src/weakAltRebound.js';
import {COIN_RELATION_VERSION as version,COIN_RELATION_LABELS,coinRelationKey,coinRelationTradeKey} from '../public/weak-alt-rebound-model.js';
import {normalizeLiquidLiveCardKey,liquidLiveCardKeysOfTrade,matchLiquidLiveCardWhitelist} from '../src/liquidLiveCardWhitelist.js';
const cases=[[1,2,'WITH_STRONG'],[1,.4,'WITH_WEAK'],[1,-2,'AGAINST_STRONG'],[1,-.4,'AGAINST_WEAK'],[1,0,'FLAT'],
  [-1,-2,'WITH_STRONG'],[-1,-.4,'WITH_WEAK'],[-1,2,'AGAINST_STRONG'],[-1,.4,'AGAINST_WEAK'],[-1,0,'FLAT'],
  [0,.05,'NEUTRAL_UP'],[0,-.05,'NEUTRAL_DOWN'],[0,.049,'NEUTRAL_FLAT'],[.1,.15,'WITH_STRONG'],[.1,.149,'WITH_WEAK'],[.099,.2,'NEUTRAL_UP']];
for(const [b,c,g] of cases)assert.equal(classifyCoinRelation(b,c),g,`${b}/${c}`);
assert.equal(classifyCoinRelation(null,1),null);assert.equal(classifyCoinRelation(NaN,1),null);
const step=900000,end=Math.floor(Date.now()/step)*step-1,now=end+1000,start=end-100*step+1;
function bars(change){let p=100;return Array.from({length:100},(_,i)=>{const open=p;p*=1+change/100;return {openTime:start+i*step,closeTime:start+(i+1)*step-1,open,close:p,high:Math.max(open,p)*1.001,low:Math.min(open,p)*.999,quoteVolume:100};});}
const universe=Array.from({length:80},(_,i)=>({symbol:`TEST${i}USDT`,candles15m:bars([.5,.05,-.5,-.05,0][i%5])}));
for(const btcChange of [.2,-.2,0]){
  const d=evaluateWeakAltRebound({universe,btcRows:bars(btcChange),now}),m=d.coinRelations;
  assert.equal(m.version,version);assert.equal(m.total,80);assert.equal(m.coins.length,80);
  assert.equal(Object.values(m.counts).reduce((a,b)=>a+b,0),80);assert.equal(new Set(m.coins.map(x=>x.symbol)).size,80);
  assert(m.coins.every(x=>Object.hasOwn(COIN_RELATION_LABELS,x.group)&&x.basis==='1h'));
  const monitor=new WeakAltReboundMonitor({now:()=>now});await monitor.process(d);
  assert.equal(monitor.snapshot().coins.length,30);assert.equal(monitor.snapshot().coinRelations.coins.length,80,'full matrix not truncated by old general list');
  const future={...universe[0].candles15m.at(-1),openTime:end+1,closeTime:end+step,close:1e9};
  assert.deepEqual(evaluateWeakAltRebound({universe:universe.map((x,i)=>i?x:{...x,candles15m:[...x.candles15m,future]}),btcRows:bars(btcChange),now}).coinRelations,m);
}
assert.equal(evaluateWeakAltRebound({universe:universe.slice(0,10),btcRows:bars(.2),now}).coinRelations,undefined);
for(const group of Object.keys(COIN_RELATION_LABELS)){
  const key=coinRelationKey(group),proof={version,group,source:'AT_ENTRY',symbol:'TESTUSDT',evaluatedAt:now,ready:true},trade={entryAt:now,symbol:'TESTUSDT',altBtcRelationAtEntry:proof};
  assert.equal(normalizeLiquidLiveCardKey(key),key);assert(liquidLiveCardKeysOfTrade(trade).includes(key));assert.equal(matchLiquidLiveCardWhitelist(trade,[]).allowed,false);
  assert.equal(coinRelationTradeKey({...trade,symbol:'OTHERUSDT'}),null);assert.equal(coinRelationTradeKey({...trade,entryAt:now-1}),null);assert.equal(coinRelationTradeKey({...trade,entryAt:now+60001}),null);
  assert.equal(coinRelationTradeKey({...trade,altBtcRelationAtEntry:{...proof,source:'VIEW_ONLY'}}),null);
}
assert.equal(coinRelationTradeKey({}),null);assert.equal(coinRelationKey('UNKNOWN'),null);
console.log('PASS coin matrix: UP/DOWN/NEUTRAL, both direction strong/weak, flat, raw boundaries, all80 exactly once beyond30 cap, causal/legacy/whitelist/defaultOFF. No orders or notifications.');
