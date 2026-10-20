import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {formatBinanceFixed,decimalsFromStep,BINANCE_FIXED_FORMAT_VERSION} from '../src/binancePrecision.js';
import {ceilQuantityAtMinimumNotional} from '../src/orderQuantityPolicy.js';
assert.equal(BINANCE_FIXED_FORMAT_VERSION,'BINANCE_FIXED_FORMAT_KEEP_INTEGER_ZEROS_V1_20261018');
for(const [n,p,expected]of [[140,0,'140'],[100,0,'100'],[100000,0,'100000'],[0,0,'0'],[10,0,'10'],[14,0,'14'],
 [140,2,'140'],[10.5,3,'10.5'],[.0012,8,'0.0012'],[.0000109592,8,'0.00001096'],[-100,0,'-100'],[1000,8,'1000']])assert.equal(formatBinanceFixed(n,p),expected);
// Execute real server sizing/price helpers; no mocked quantity implementation.
const server=await readFile('src/server.js','utf8'),start=server.indexOf('function quantityFromNotional('),end=server.indexOf('\nfunction clamp(',start);
assert(start>0&&end>start);
const {quantityFromNotional:q,priceFromTick:price}=vm.runInNewContext(server.slice(start,end)+'\n({quantityFromNotional,priceFromTick})',{
 decimalsFromStep,formatBinanceFixed,ceilQuantityAtMinimumNotional,
});
const info=(step='1',tick='.00001',minimum=5)=>({symbol:'ERAUSDT',quantityPrecision:decimalsFromStep(step),filters:[
 {filterType:'LOT_SIZE',stepSize:step,minQty:step},{filterType:'MIN_NOTIONAL',notional:String(minimum)},{filterType:'PRICE_FILTER',tickSize:tick}]});
assert.equal(q(info(),10,.07119,false,{allowMinNotionalCeil:false}),'140','ERA regression: no stripping integer zero');
assert.ok(Math.abs(Number(q(info(),10,.07119))*.07119-9.9666)<1e-10);
assert.equal(q(info('10'),10,.07119),'140','whole-lot step10 preserves integer zero');
assert.equal(q(info('.1'),10,.07119),'140.4');
assert.equal(q(info('.001'),10,.07119),'140.469');
assert.equal(price(info('1','1'),100000),'100000','whole tick prices preserve all zeros');
assert.equal(price(info('1','10'),1200),'1200');
assert.equal(price(info(),.0754614),'0.07546');
assert.equal(price(info('1','1e-8'),.0000109592),'0.00001096');
assert.throws(()=>q(info(),2,.07119,false,{allowMinNotionalCeil:false}),/notional too small/,'real under-minimum orders still blocked, not auto enlarged');
for(const step of ['1','10','100','.1','.01','.001','1e-8']){
 const p=decimalsFromStep(step);
 for(const n of [1,10,14,100,140,1000,1100,100000]){
  const formatted=formatBinanceFixed(n,p);assert.equal(Number(formatted),n);
 }
}
// Keep old position-monitor/TP refresh branches untouched; no backfill or repair loop introduced.
assert.match(server,/newOrdersOnlySince|POSITION_PROTECTION_NEW_ORDERS_ONLY_VERSION/);
console.log('PASS actual server quantity/price serialization: ERA 140 remains140 (~9.9666 USDT), integer/scientific/fractional steps, min-notional no-ceil unchanged. Zero exchange IO.');
