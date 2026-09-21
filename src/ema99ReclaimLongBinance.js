import {createHash} from 'node:crypto';
import {EMA99_PULLBACK_LONG_VERSION} from './ema99PullbackLong.js';
import {withEma99EntryProtection} from './ema99ShortStopLoss.js';
export const EMA99_RECLAIM_LONG_BINANCE_VERSION='EMA99_RECLAIM_LONG_MARKET_EDITABLE_LEVERAGE_V2_20260913';
export const EMA99_RECLAIM_LONG_ROUTE={source:'ema99-reclaim-long',signalLabel:'RECLAIM_LONG_WATCH',signalType:'RECLAIM_LONG_WATCH',streamId:'ema99-retest',executionPage:'binance-auto-controls',side:'BUY'};
export function buildEma99ReclaimLongOrder(event,{now=Date.now(),enabledAt,markPrice,leverage=5,takeProfitRoePct=15}={}) {
  if(event?.version!==EMA99_PULLBACK_LONG_VERSION||event.stage!=='RECLAIM_LONG_WATCH'
    ||event.side!=='LONG'||event.closed!==true||event.nearMiss!==false||!['5m','15m'].includes(event.interval))return null;
  const closeAt=Number(event.candleCloseAt),generated=Date.parse(event.generatedAt),start=Date.parse(enabledAt);
  if(![closeAt,generated,start].every(Number.isFinite)||closeAt<start||closeAt>=now||now-closeAt>90_000
    ||generated>now||now-generated>90_000)return null;
  const entry=Number(event.price),tp=Number(event.takeProfit),sl=Number(event.invalidation),mark=Number(markPrice);
  if(![entry,tp,sl,mark].every(v=>Number.isFinite(v)&&v>0)||!(sl<mark&&mark<tp)||!(sl<entry&&entry<tp)
    ||!(entry>Number(event.ema99))||!(Number(event.lowerWickPct)>=25)||Math.abs(mark/entry-1)>.005)return null;
  const key=`${event.symbol}|${event.interval}|${event.candleAt}|${event.stage}`;
  return withEma99EntryProtection({...EMA99_RECLAIM_LONG_ROUTE,signalInterval:event.interval,symbol:event.symbol,orderType:'MARKET',notionalUsdt:5*leverage,leverage,takeProfitRoePct,
    signalEntryPrice:entry,entryExpiresAt:closeAt+90_000,takeProfitPrice:tp,stopLossPrice:sl,
    protectionOnFill:true,preserveSignalProtection:true,allowMinNotionalCeil:false,dryRun:false,
    clientOrderId:`erl_${createHash('sha256').update(key).digest('hex').slice(0,26)}`,
    signalReason:`EMA99 rising pullback reclaim | ${event.interval} | closed=${new Date(closeAt).toISOString()} | EMA99=${event.ema99} | lowerWick=${event.lowerWickPct}% | vol=${event.volumeRatio}x`,
    signalCombo:`${event.interval}|${event.stage}`,maxOpenPositions:30});
}
