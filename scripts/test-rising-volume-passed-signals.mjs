import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateRisingVolume} from '../src/risingVolume.js';
import {RISING_VOLUME_SOURCE,RISING_VOLUME_BINANCE_VERSION,risingVolumeEntryId} from '../src/risingVolumeBinance.js';
import {buildRisingVolumePassedSignals,RISING_VOLUME_PASSED_VERSION} from '../src/risingVolumePassedSignals.js';
import {flowRows,flowTestNow as at} from './rising-volume-flow-fixtures.mjs';
import {ratioProofFor} from './rising-volume-ratio-fixtures.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(symbol,side='LONG',status='SUBMITTED') {
  const candleRows=flowRows({side,pattern:'SUSTAINED',now:at});
  const snapshot=evaluateRisingVolume({symbol,side,interval:'1m',rows:candleRows,rows1m:candleRows,now:at}).signal;
  const event={id:risingVolumeEntryId(snapshot),snapshot},proof=ratioProofFor(event,at);
  const attempt={id:event.id,symbol,side,interval:'1m',at,closedAt:snapshot.closedAt,snapshotObservedAt:snapshot.observedAt,
    status,marginUsdt:side==='LONG'?2:1,leverage:5,orderId:status==='SUBMITTED'?symbol+'-order':null,
    risingVolumeRatioProof:proof,plan:{risingVolumeSnapshot:snapshot}};
  const fill={signalSource:RISING_VOLUME_SOURCE,risingVolumeEntryVersion:RISING_VOLUME_BINANCE_VERSION,
    risingVolumeSignalId:event.id,risingVolumeSnapshot:snapshot,risingVolumeRatioProof:proof,
    symbol,direction:side,orderId:attempt.orderId,orderStatus:'FILLED',isDca:false,
    filledAt:new Date(at+1000).toISOString(),closedAt:new Date(at+60000).toISOString(),positionStatus:'CLOSED',
    marginUsdt:attempt.marginUsdt,netRealizedPnlUsdt:.2,avgFillPrice:123,closeReason:'TAKE_PROFIT'};
  return {attempt,fill};
}
const closed=fixture('CLOSEDUSDT'),blocked=fixture('BLOCKUSDT','LONG','EXISTING_POSITION'),open=fixture('OPENUSDT','SHORT'),sent=fixture('SENTUSDT');
const attempts=[closed.attempt,blocked.attempt,open.attempt,sent.attempt];
const fills={closed:{record:closed.fill},duplicate:{record:closed.fill},open:{record:{...open.fill,positionStatus:'OPEN',netRealizedPnlUsdt:999}}};
const before=JSON.stringify({attempts,fills});
const result=buildRisingVolumePassedSignals(attempts,fills,{now:at+120000});
assert.equal(result.version,RISING_VOLUME_PASSED_VERSION);assert.equal(result.total,4);
const bySymbol=Object.fromEntries(result.rows.map(r=>[r.symbol,r]));
assert.equal(bySymbol.CLOSEDUSDT.netRealizedPnlUsdt,.2);assert.equal(bySymbol.CLOSEDUSDT.realizedRoePct,10);
assert.equal(bySymbol.CLOSEDUSDT.orderState,'CLOSED');assert.equal(bySymbol.CLOSEDUSDT.ratioDiagnostics.source,'AT_ENTRY');
assert.equal(bySymbol.CLOSEDUSDT.ratioDiagnostics.state,'PASS');assert.equal(bySymbol.OPENUSDT.side,'SHORT');
assert.equal(bySymbol.BLOCKUSDT.orderState,'BLOCKED');assert.equal(bySymbol.BLOCKUSDT.netRealizedPnlUsdt,null);
assert.equal(bySymbol.OPENUSDT.orderState,'OPEN');assert.equal(bySymbol.OPENUSDT.netRealizedPnlUsdt,null,'OPEN cannot turn unrealized or stale net into realized PnL');
assert.equal(bySymbol.SENTUSDT.orderState,'AWAITING_AUDIT');assert.equal(bySymbol.SENTUSDT.netRealizedPnlUsdt,null,'submitted is not filled');
assert.equal(JSON.stringify({attempts,fills}),before,'read-only projection never mutates ledger/audit');
for(const change of [{signalSource:'manual'},{risingVolumeSignalId:'wrong'},{orderId:'manual-other-order'},
  {direction:'SHORT'},{symbol:'OTHERUSDT'},{risingVolumeEntryVersion:'OLD_3USDT'},
  {risingVolumeSnapshot:{...closed.fill.risingVolumeSnapshot,price:999}},
  {risingVolumeRatioProof:{...closed.fill.risingVolumeRatioProof,signalId:'wrong'}},
  {filledAt:new Date(at-1000).toISOString()},{isDca:true}]) {
  const r=buildRisingVolumePassedSignals([closed.attempt],{one:{record:{...closed.fill,...change}}},{now:at+120000}).rows[0];
  assert.equal(r.netRealizedPnlUsdt,null,'cannot borrow unrelated/legacy/invalid fill');
}
for(const change of [{netRealizedPnlUsdt:null},{marginUsdt:0},{closedAt:new Date(at-1000).toISOString()}])
  assert.equal(buildRisingVolumePassedSignals([closed.attempt],{x:{record:{...closed.fill,...change}}},{now:at+120000}).rows[0].netRealizedPnlUsdt,null);
for(const [net,outcome,roe] of [[-.6,'LOSS',-30],[0,'BREAKEVEN',0]]) {
  const row=buildRisingVolumePassedSignals([closed.attempt],{x:{record:{...closed.fill,netRealizedPnlUsdt:net}}},{now:at+120000}).rows[0];
  assert.equal(row.outcome,outcome);assert.equal(row.realizedRoePct,roe);
}
assert.equal(buildRisingVolumePassedSignals([{...sent.attempt,status:'ERROR_OR_UNKNOWN'}],{}, {now:at+120000}).rows[0].orderState,'UNKNOWN');
for(const change of [{risingVolumeRatioProof:null},{id:'fake'},{interval:'5m'},
  {risingVolumeRatioProof:{...closed.attempt.risingVolumeRatioProof,pass:false}},
  {risingVolumeRatioProof:{...closed.attempt.risingVolumeRatioProof,source:'VIEW_ONLY'}},
  {at:at+999999},{snapshotObservedAt:at+999999},{snapshotObservedAt:null}]) {
  assert.equal(buildRisingVolumePassedSignals([{...closed.attempt,...change}],fills,{now:at+120000}).total,0,'PASS requires frozen valid exact-ID proof');
}
assert.equal(buildRisingVolumePassedSignals(attempts,fills,{now:at+15*86400000}).total,0);
assert.deepEqual(buildRisingVolumePassedSignals([],{}).rows,[]);
assert.equal(new URL(bySymbol.CLOSEDUSDT.url,'https://app.test').searchParams.get('passed'),closed.attempt.id);
const module=await readFile('src/risingVolumePassedSignals.js','utf8');
assert.doesNotMatch(module,/fetch\(|writeFile\(|submit\(|getPositions\(/);
console.log('PASS passed-volume list: frozen ratio ledger, LONG/SHORT, exact ID/order/source/fill/close attribution, real net PnL/ROE, blocked/open/unknown null, dedupe, legacy excluded, read-only.');
if(process.argv.includes('--runtime')) {
  const ledger=JSON.parse(await readFile('data/rising-volume-binance.json','utf8'));
  const audit=JSON.parse(await readFile('data/binance-filled-signal-audit/state.json','utf8'));
  const projection=buildRisingVolumePassedSignals(Object.values(ledger.attempts??{}),audit.fills);
  console.log(JSON.stringify({version:projection.version,total:projection.total,rows:projection.rows.map(r=>({symbol:r.symbol,side:r.side,
    closedAt:r.closedAt,attemptStatus:r.attemptStatus,orderState:r.orderState,netRealizedPnlUsdt:r.netRealizedPnlUsdt,realizedRoePct:r.realizedRoePct}))}));
}
