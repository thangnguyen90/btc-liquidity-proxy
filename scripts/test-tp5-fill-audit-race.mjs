import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NewBotTakeProfitLedger,NEW_BOT_TP_VERSION} from '../src/newBotTakeProfitPolicy.js';
import {resolveNonLiquidFlowV2TakeProfit} from '../src/shortTakeProfitPolicy.js';

// Actual 4USDT lifecycle exposed a gap between socket verification and async
// audit.recordFill. Reproduce that ordering with a fake private client only.
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tp5-audit-race-'));
const now=1794139557358,source='pump-squeeze-sell-flow-short';
const policy={version:NEW_BOT_TP_VERSION,roePct:5,scope:'NEW_BOT_ORDERS_ONLY',activatedAt:'2026-11-08T09:54:29.992Z'};
const l=new NewBotTakeProfitLedger({file:path.join(dir,'ledger.json'),readPolicy:()=>policy,now:()=>now});
const c={placeFuturesOrder:async()=>({orderId:1895885701,status:'FILLED',executedQty:'638'})};l.install(c);
await c.placeFuturesOrder({params:{symbol:'4USDT',side:'SELL',type:'MARKET',newClientOrderId:'sq55_4_fill'},entryControl:{payload:{source}}});
const p={symbol:'4USDT',positionAmt:'-638',entryPrice:'0.0094',leverage:'3'};
const tracking={entry:0.0094,signalSource:source,signalSide:'SELL',entryClientOrderId:'sq55_4_fill',entryOrderId:'1895885701',openedAt:1794139559268,protectionOrderCreatedAt:1794139559268};
const noAudit={},legacy=resolveNonLiquidFlowV2TakeProfit({source,side:'SHORT',entryPrice:.0094,leverage:3,requestedTakeProfitPrice:.009243333333333333});
assert.equal(legacy.applied,false);assert.equal(legacy.takeProfitPrice,.009243333333333333);
const proof=l.positionProof('4USDT',p,noAudit,tracking);assert.ok(proof);
const first=resolveNonLiquidFlowV2TakeProfit({source,side:'SHORT',entryPrice:+p.entryPrice,leverage:+p.leverage,newBotTakeProfitProof:proof,requestedTakeProfitPrice:.009212});
assert.equal(first.roePct,5);assert.ok(Math.abs(first.takeProfitPrice-.009243333333333333)<1e-12);
const fill={record:{symbol:'4USDT',direction:'SHORT',signalSource:source,clientOrderId:tracking.entryClientOrderId,orderId:tracking.entryOrderId,positionStatus:'OPEN',filledAt:new Date(tracking.openedAt).toISOString(),avgFillPrice:.0094}};
assert.deepEqual(l.positionProof('4USDT',p,{one:fill},tracking),proof);
assert.equal(resolveNonLiquidFlowV2TakeProfit({source:'post-move-ideal-entry',side:'LONG',entryPrice:100,leverage:3,newBotTakeProfitProof:{...proof,source:'post-move-ideal-entry',side:'BUY'}}).roePct,5);
for(const t of [null,{...tracking,entryOrderId:'other'},{...tracking,entryClientOrderId:'manual'},{...tracking,signalSide:'BUY'},{...tracking,signalSource:'orders-manual'},{...tracking,openedAt:now-1},{...tracking,protectionOrderCreatedAt:0},{...tracking,entry:.0095}])
  assert.equal(l.positionProof('4USDT',p,{},t),null);
assert.equal(l.positionProof('4USDT',{...p,entryPrice:.0095},{},tracking),null);
assert.equal(l.positionProof('4USDT',p,{closed:{record:{...fill.record,positionStatus:'CLOSED'}}},tracking),null);
assert.equal(l.positionProof('4USDT',p,{manual:{record:{...fill.record,clientOrderId:'manual'}}},tracking),null);
// A request not yet accepted by Binance cannot become a verified position.
l.state.entries.sq55_4_fill.status='RESERVED';assert.equal(l.positionProof('4USDT',p,{},tracking),null);
l.state.entries.sq55_4_fill.status='UNKNOWN_OR_REJECTED';assert.equal(l.positionProof('4USDT',p,{},tracking),null);
const older=resolveNonLiquidFlowV2TakeProfit({source:'post-move-ideal-entry',side:'LONG',entryPrice:100,leverage:3});assert.equal(older.roePct,10);
assert.equal(resolveNonLiquidFlowV2TakeProfit({source:'orders-manual',side:'LONG',entryPrice:100,leverage:3,newBotTakeProfitProof:{...proof,side:'BUY'}}).applied,false);
await fs.rm(dir,{recursive:true,force:true});
console.log('PASS TP5 before async audit arrival; exact tracked client/order/fill/side/entry; closed/manual/old/reserved identities rejected; SELL55 never overwritten by legacy TP6.');
