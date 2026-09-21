import {createHash} from 'node:crypto';
import {EMA99_ENTRY_CATALOG} from './ema99EntryCatalog.js';
import {POST_PUMP_EMA99_RETEST_VERSION} from './postPumpEma99Retest.js';
import {EMA99_PULLBACK_LONG_VERSION} from './ema99PullbackLong.js';
import {withEma99EntryProtection} from './ema99ShortStopLoss.js';
export const EMA99_WATCH_EXECUTION_VERSION='EMA99_ALL11_EDITABLE_ROUTE_LEVERAGE_V3_20260913';
export function buildEma99WatchOrder(event,{now=Date.now(),enabledAt,markPrice,leverage=5,takeProfitRoePct=15}={}) {
  const spec=EMA99_ENTRY_CATALOG.find(r=>r.source==='ema99-observe-only'&&r.signalLabel===event?.stage&&r.side===event?.side);
  if(!spec||event.closed!==true||!['5m','15m'].includes(event.interval))return null;
  const short=spec.side==='SHORT';
  if(event.version!==(short?POST_PUMP_EMA99_RETEST_VERSION:EMA99_PULLBACK_LONG_VERSION))return null;
  const at=Number(event.candleCloseAt),generated=Date.parse(event.generatedAt),start=Date.parse(enabledAt);
  if(![at,generated,start].every(Number.isFinite)||at<start||at>=now||now-at>90000||generated>now||now-generated>90000)return null;
  const entry=Number(event.price),tp=Number(event.takeProfit??event.executionTakeProfit),sl=Number(event.invalidation),mark=Number(markPrice);
  if(![entry,tp,sl,mark,leverage].every(v=>Number.isFinite(v)&&v>0)||Math.abs(mark/entry-1)>.005
    ||!(short?(tp<entry&&entry<sl&&tp<mark&&mark<sl):(sl<entry&&entry<tp&&sl<mark&&mark<tp)))return null;
  return withEma99EntryProtection({source:spec.source,streamId:spec.streamId,signalLabel:spec.signalLabel,signalType:spec.signalLabel,signalInterval:event.interval,
    executionPage:'binance-auto-controls',side:short?'SELL':'BUY',symbol:event.symbol,orderType:'MARKET',notionalUsdt:5*leverage,leverage,takeProfitRoePct,
    signalEntryPrice:entry,entryExpiresAt:at+90000,takeProfitPrice:tp,stopLossPrice:sl,protectionOnFill:true,preserveSignalProtection:true,
    allowMinNotionalCeil:false,dryRun:false,maxOpenPositions:30,
    clientOrderId:`ew_${createHash('sha256').update(`${event.symbol}|${event.interval}|${event.candleAt}|${event.stage}`).digest('hex').slice(0,26)}`,
    signalCombo:`${event.interval}|${event.stage}`,signalReason:`Explicit WATCH opt-in | ${event.stage} | ${spec.side} | ${event.interval} | closed=${new Date(at).toISOString()} | EMA99=${event.ema99} | not a confirmed reversal`});
}
