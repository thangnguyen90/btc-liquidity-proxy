import assert from 'node:assert/strict';
import {
  POSITION_PROTECTION_FILL_WATERMARK_VERSION,
  POSITION_PROTECTION_NEW_ORDERS_ONLY_VERSION,
  activateProtectionNewOrdersOnly,
  advanceProtectionFillWatermark,
  normalizeProtectionFillWatermark,
  protectionOrderIsNew,
  protectionTrackingIsNew,
} from '../src/protectionFillWatermark.js';

const initial = normalizeProtectionFillWatermark({}, 1000);
assert.equal(initial.version, POSITION_PROTECTION_FILL_WATERMARK_VERSION);
assert.equal(initial.lastHandledFillAt, 1000);
assert.deepEqual(initial.handledOrderIds, []);

const first = advanceProtectionFillWatermark(initial, { orderId: 123, fillTime: 1500 });
assert.equal(first.lastHandledFillAt, 1500);
assert.deepEqual(first.handledOrderIds, ['123']);

const duplicate = advanceProtectionFillWatermark(first, { orderId: 123, fillTime: 1400 });
assert.equal(duplicate.lastHandledFillAt, 1500);
assert.deepEqual(duplicate.handledOrderIds, ['123']);

const next = advanceProtectionFillWatermark(duplicate, { clientOrderId: 'manual-2', updateTime: 1700 });
assert.equal(next.lastHandledFillAt, 1700);
assert.deepEqual(next.handledOrderIds, ['123', 'manual-2']);

const activated=activateProtectionNewOrdersOnly(next,2000);
assert.equal(activated.newOrdersOnlySince,2000);
assert.equal(activated.lastHandledFillAt,2000);
assert.equal(activated.newOrdersOnlyVersion,POSITION_PROTECTION_NEW_ORDERS_ONLY_VERSION);
assert.deepEqual(activated.handledOrderIds,next.handledOrderIds);
const later=advanceProtectionFillWatermark(activated,{orderId:200,fillTime:2500});
assert.deepEqual(activateProtectionNewOrdersOnly(JSON.parse(JSON.stringify(later)),9000),later,'restart must not move activation');
assert.equal(activateProtectionNewOrdersOnly({...next,lastHandledFillAt:3000},2000).lastHandledFillAt,3000);
for(const broken of [{newOrdersOnlySince:-1},{newOrdersOnlySince:'bad'},
  {newOrdersOnlySince:2000},{newOrdersOnlyVersion:POSITION_PROTECTION_NEW_ORDERS_ONLY_VERSION},
  {...activated,newOrdersOnlyVersion:'UNKNOWN'}]) {
  assert.throws(()=>activateProtectionNewOrdersOnly(broken,9000),/Invalid/);
}
assert.throws(()=>activateProtectionNewOrdersOnly({},NaN),/Invalid/);
const order={symbol:'GTCUSDT',orderId:123,side:'SELL',status:'FILLED',type:'MARKET',time:2100,positionSide:'BOTH'};
const fill={symbol:'GTCUSDT',orderId:123,side:'SELL',fillTime:2200,positionSide:'BOTH'};
assert.equal(protectionOrderIsNew(activated,order,fill),true);
for(const patch of [{time:2000},{time:1500,type:'LIMIT'},{time:null},{time:Infinity},
  {time:2300},{symbol:'OTHERUSDT'},{orderId:999},{side:'BUY'},{status:'NEW'},
  {type:'STOP_MARKET'},{reduceOnly:true},{closePosition:'true'},{positionSide:'SHORT'}]) {
  assert.equal(protectionOrderIsNew(activated,{...order,...patch},fill),false,JSON.stringify(patch));
}
assert.equal(protectionOrderIsNew(activated,order,{...fill,fillTime:2000}),false);
assert.equal(protectionOrderIsNew(initial,order,fill),false);
const tracking={openedAt:2200,protectionOrderCreatedAt:2100,
  protectionNewOrdersOnlySince:2000,protectionNewOrdersOnlyVersion:POSITION_PROTECTION_NEW_ORDERS_ONLY_VERSION};
assert.equal(protectionTrackingIsNew(activated,tracking),true);
for(const patch of [{openedAt:1999},{openedAt:2050},{openedAt:Infinity},
  {protectionOrderCreatedAt:Infinity},{protectionOrderCreatedAt:1500},
  {protectionNewOrdersOnlySince:3000},{protectionNewOrdersOnlyVersion:null}]) {
  assert.equal(protectionTrackingIsNew(activated,{...tracking,...patch}),false);
}
assert.equal(protectionTrackingIsNew(activated,{openedAt:1500,entryOrderId:123}),false,'old JSON must not be adopted');
assert.equal(protectionTrackingIsNew(activated,{openedAt:2200}),false,'DCA/recent position update is not proof');
console.log('Protection watermark passed: fixed activation, restart persistence, old LIMIT fills and old tracking excluded');
