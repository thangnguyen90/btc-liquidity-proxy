import assert from 'node:assert/strict';
import {withEma99DirectionStopLoss,withEma99EntryProtection,withEma99LongStopLoss,withEma99ShortStopLoss} from '../src/ema99ShortStopLoss.js';
import {resolveFillAnchoredProtectionPrices} from '../src/liveCardSignalProtection.js';
for(const source of ['ema99-near-reject-short','ema99-observe-only']){
 const p=withEma99ShortStopLoss({source,side:'SELL',leverage:5,signalEntryPrice:.014,stopLossPrice:.014214,takeProfitPrice:.013302});
 assert.equal(p.stopLossDistanceFraction,.06);assert.equal(p.takeProfitDistanceFraction,null);
 const prices=resolveFillAnchoredProtectionPrices({...p,fillPrice:.013956});
 assert.ok(Math.abs(prices.stopLossPrice-.01479336)<1e-12);assert.equal(prices.takeProfitPrice,.013302);
 assert.ok(Math.abs(((prices.stopLossPrice/.013956)-1)*5-.3)<1e-10);
}
const old={side:'SELL',fillAnchorEnabled:false,stopLossPrice:.014214,takeProfitPrice:.013302,fillPrice:.013956};
assert.equal(resolveFillAnchoredProtectionPrices(old).stopLossPrice,.014214);
for(const p of [{source:'ema99-observe-only',side:'BUY'},{source:'manual',side:'SELL'}])assert.equal(withEma99ShortStopLoss(p),p);
for(const source of ['ema99-reclaim-long','ema99-bounce-long','ema99-observe-only']){
 const p=withEma99LongStopLoss({source,side:'BUY',leverage:5,signalEntryPrice:.6255,stopLossPrice:.6171,takeProfitPrice:.6571});
 assert.equal(p.stopLossDistanceFraction,.04);assert.equal(p.takeProfitDistanceFraction,null);
 const prices=resolveFillAnchoredProtectionPrices({...p,fillPrice:.6255});
 assert.ok(Math.abs(prices.stopLossPrice-.60048)<1e-12);assert.equal(prices.takeProfitPrice,.6571);
 assert.ok(Math.abs((1-prices.stopLossPrice/.6255)*5-.20)<1e-10);
}
for(const p of [{source:'ema99-observe-only',side:'SELL'},{source:'manual',side:'BUY'}])assert.equal(withEma99LongStopLoss(p),p);
assert.equal(withEma99DirectionStopLoss({source:'manual',side:'BUY'}).source,'manual');
for(const sample of [
 {source:'ema99-near-reject-short',side:'SELL',entry:.013956,expectedTp:.01353732,expectedSl:.01479336},
 {source:'ema99-observe-only',side:'SELL',entry:.013956,expectedTp:.01353732,expectedSl:.01479336},
 {source:'ema99-reclaim-long',side:'BUY',entry:.6255,expectedTp:.644265,expectedSl:.60048},
 {source:'ema99-bounce-long',side:'BUY',entry:.6255,expectedTp:.644265,expectedSl:.60048},
 {source:'ema99-observe-only',side:'BUY',entry:.6255,expectedTp:.644265,expectedSl:.60048},
 {source:'ema99-kill-reclaim',side:'BUY',entry:.6255,expectedTp:.644265,expectedSl:.60048},
 {source:'ema99-kill-reclaim-pump-dump-absorption',side:'BUY',entry:.6255,expectedTp:.644265,expectedSl:.60048},
]){
 const signal=sample.side==='BUY'?.62:.014,plan=withEma99EntryProtection({source:sample.source,side:sample.side,leverage:5,signalEntryPrice:signal,takeProfitPrice:sample.side==='BUY'?.7:.012,stopLossPrice:sample.side==='BUY'?.6:.015});
 assert.equal(plan.takeProfitDistanceFraction,.03);assert.equal(plan.stopLossDistanceFraction,sample.side==='BUY'?.04:.06);
 const prices=resolveFillAnchoredProtectionPrices({...plan,fillPrice:sample.entry});
 assert.ok(Math.abs(prices.takeProfitPrice-sample.expectedTp)<1e-12);assert.ok(Math.abs(prices.stopLossPrice-sample.expectedSl)<1e-12);
 const tpRoe=sample.side==='BUY'?(prices.takeProfitPrice/sample.entry-1)*5:(1-prices.takeProfitPrice/sample.entry)*5;
 assert.ok(Math.abs(tpRoe-.15)<1e-10);
}
assert.equal(withEma99EntryProtection({source:'manual',side:'BUY'}).source,'manual');
console.log('EMA99 new-entry fill protection passed: all TP +15% ROE; SHORT SL -30%, LONG SL -20%; legacy unchanged.');
