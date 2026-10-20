import {validRisingVolumeRatioProof} from './risingVolumeRatioGate.js';
import {explainRisingVolumeRatio} from './risingVolumeRatioDiagnostics.js';
import {RISING_VOLUME_SOURCE,RISING_VOLUME_BINANCE_VERSION,isRisingVolumeEntrySignal,risingVolumeEntryId} from './risingVolumeBinance.js';
export const RISING_VOLUME_PASSED_VERSION='RISING_VOLUME_PASSED_LEDGER_REAL_PNL_V1_20261012';
const epoch=x=>typeof x==='number'?x:Date.parse(x??'');
const finite=x=>x!=null&&Number.isFinite(Number(x));
const clone=x=>JSON.parse(JSON.stringify(x));

// Read-only projection of entry-time proofs and exactly attributed exchange fills.
// A blocked PASS is an observation, not a synthetic trade or zero-PnL winner.
export function buildRisingVolumePassedSignals(attempts=[],fills={}, {now=Date.now()}={}) {
  const rows=[],bySignal=new Map();
  for(const fill of Object.values(fills??{})) {
    const r=fill?.record??fill;
    if(!r?.risingVolumeSignalId)continue;
    if(!bySignal.has(r.risingVolumeSignalId))bySignal.set(r.risingVolumeSignalId,[]);
    bySignal.get(r.risingVolumeSignalId).push(r);
  }
  for(const a of attempts) {
    const p=a?.risingVolumeRatioProof;
    const event={id:a?.id,snapshot:{symbol:a?.symbol,side:a?.side,closedAt:a?.closedAt,observedAt:a?.snapshotObservedAt}};
    if(!a||a.interval!=='1m'||a.id!==risingVolumeEntryId({...event.snapshot,interval:'1m'})
      ||!Number.isFinite(a.at)||a.at>now||now-a.at>14*86400_000||!Number.isFinite(a.closedAt)
      ||!Number.isFinite(a.snapshotObservedAt)||a.snapshotObservedAt>now
      ||a.closedAt>=a.snapshotObservedAt||p?.fetchedAt>now||!validRisingVolumeRatioProof(event,p,p?.fetchedAt))continue;
    const matched=(bySignal.get(a.id)??[]).filter(r=>
      r.signalSource===RISING_VOLUME_SOURCE&&r.risingVolumeEntryVersion===RISING_VOLUME_BINANCE_VERSION
      &&r.symbol===a.symbol&&r.direction===a.side&&r.isDca!==true&&r.orderStatus==='FILLED'
      &&((a.orderId!=null&&String(a.orderId)===String(r.orderId))||(a.clientOrderId&&a.clientOrderId===r.clientOrderId))
      &&(a.orderId==null||String(a.orderId)===String(r.orderId))
      &&(!a.clientOrderId||a.clientOrderId===r.clientOrderId)
      &&isRisingVolumeEntrySignal({id:a.id,snapshot:r.risingVolumeSnapshot})
      &&validRisingVolumeRatioProof({id:a.id,snapshot:r.risingVolumeSnapshot},r.risingVolumeRatioProof,r.risingVolumeRatioProof?.fetchedAt)
      &&epoch(r.filledAt)>=r.risingVolumeRatioProof.fetchedAt&&epoch(r.filledAt)<=now);
    // Audit records are cumulative per opening order, not separate incremental fills.
    const unique=[...new Map(matched.map(r=>[String(r.orderId??r.clientOrderId),r])).values()];
    const allClosed=unique.length>0&&unique.every(r=>r.positionStatus==='CLOSED');
    const validClose=allClosed&&unique.every(r=>epoch(r.closedAt)>=epoch(r.filledAt)&&epoch(r.closedAt)<=now
      &&finite(r.netRealizedPnlUsdt)&&finite(r.marginUsdt)&&Number(r.marginUsdt)>0);
    const net=validClose?unique.reduce((sum,r)=>sum+Number(r.netRealizedPnlUsdt),0):null;
    const actualMargin=unique.length&&unique.every(r=>finite(r.marginUsdt)&&Number(r.marginUsdt)>0)
      ?unique.reduce((sum,r)=>sum+Number(r.marginUsdt),0):null;
    const orderState=unique.length?(allClosed?'CLOSED':unique.some(r=>r.positionStatus==='CLOSED')?'PARTIALLY_CLOSED':'OPEN')
      :['SUBMITTED','FILLED','NEW'].includes(a.status)?'AWAITING_AUDIT'
        :['SUBMITTING','CHECKING','UNKNOWN','ERROR_OR_UNKNOWN'].includes(a.status)?'UNKNOWN':'BLOCKED';
    rows.push({id:a.id,symbol:a.symbol,side:a.side,interval:'1m',closedAt:a.closedAt,observedAt:a.snapshotObservedAt,
      passedAt:p.fetchedAt,attemptStatus:a.status,orderState,orderId:a.orderId??null,
      marginUsdt:a.marginUsdt??null,actualMarginUsdt:actualMargin,leverage:a.leverage??null,
      fillPrice:unique.length===1&&finite(unique[0].avgFillPrice)?Number(unique[0].avgFillPrice):null,
      filledAt:unique.length?Math.min(...unique.map(r=>epoch(r.filledAt))):null,
      exitedAt:validClose?Math.max(...unique.map(r=>epoch(r.closedAt))):null,
      netRealizedPnlUsdt:net,realizedRoePct:net!=null&&actualMargin>0?net/actualMargin*100:null,
      outcome:net==null?null:net>0?'WIN':net<0?'LOSS':'BREAKEVEN',
      closeReason:unique.length===1?unique[0].closeReason??null:null,
      pnlNote:validClose?'PnL ròng từ audit Binance; đã gồm phân bổ phí/funding của bản ghi.'
        :allClosed?'Đã đóng nhưng thiếu dữ liệu PnL ròng/margin/thời gian hợp lệ.'
          :unique.length?'Chưa chốt đầy đủ; không gán PnL thả nổi của vị thế theo tên coin.'
            :orderState==='BLOCKED'?'Pass ratio nhưng bị chặn; không có PnL của tín hiệu này.'
              :'Chưa có fill audit khớp chính xác; không suy ra đã khớp hoặc đã đóng.',
      volumeEvidence:a.plan?.risingVolumeSnapshot?'FROZEN_ENTRY_SNAPSHOT':'ELIGIBLE_AT_RUNNER_ATTEMPT',
      ratioDiagnostics:{...explainRisingVolumeRatio(p.rows,{side:a.side,asOf:a.closedAt,source:'AT_ENTRY',fetchedAt:p.fetchedAt}),
        entryScope:true,attemptStatus:a.status},
      url:`/rising-volume-watch?passed=${encodeURIComponent(a.id)}#passed-signals`});
  }
  rows.sort((a,b)=>b.passedAt-a.passedAt||a.id.localeCompare(b.id));
  return clone({version:RISING_VOLUME_PASSED_VERSION,updatedAt:now,retentionDays:14,total:rows.length,rows:rows.slice(0,2000)});
}
