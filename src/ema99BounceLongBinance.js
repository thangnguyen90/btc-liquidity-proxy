import {createHash} from 'node:crypto';
import {EMA99_PULLBACK_LONG_VERSION} from './ema99PullbackLong.js';
import {withEma99EntryProtection} from './ema99ShortStopLoss.js';
export const EMA99_BOUNCE_LONG_BINANCE_VERSION='EMA99_BOUNCE_CONFIRMED_LONG_MARKET_EDITABLE_LEVERAGE_V2_20260913';
export const EMA99_BOUNCE_LONG_ROUTE={source:'ema99-bounce-long',signalLabel:'BOUNCE_CONFIRMED_LONG_WATCH',signalType:'BOUNCE_CONFIRMED_LONG_WATCH',streamId:'ema99-retest',executionPage:'binance-auto-controls',side:'BUY'};
export function buildEma99BounceLongOrder(event,{now=Date.now(),enabledAt,markPrice,leverage=5,takeProfitRoePct=15}={}) {
  if(event?.version!==EMA99_PULLBACK_LONG_VERSION||event.stage!=='BOUNCE_CONFIRMED_LONG_WATCH'
    ||event.side!=='LONG'||event.closed!==true||!['5m','15m'].includes(event.interval)
    ||!['CLOSE_ABOVE_RECLAIM_HIGH','EMA_RETEST_HELD'].includes(event.confirmation))return null;
  const closeAt=Number(event.confirmedAt),reclaimAt=Number(event.candleCloseAt),generated=Date.parse(event.generatedAt),start=Date.parse(enabledAt);
  const duration=event.interval==='5m'?300000:900000;
  if(![closeAt,reclaimAt,generated,start].every(Number.isFinite)||!(reclaimAt>0)||closeAt<=reclaimAt||closeAt-reclaimAt>3*duration
    ||(closeAt-reclaimAt)%duration!==0||closeAt<start||closeAt>=now||now-closeAt>90_000
    ||generated>now||now-generated>90_000)return null;
  const entry=Number(event.referenceEntry),tp=Number(event.takeProfit),sl=Number(event.invalidation),mark=Number(markPrice);
  if(![entry,tp,sl,mark].every(v=>Number.isFinite(v)&&v>0)||!(sl<mark&&mark<tp)||!(sl<entry&&entry<tp)
    ||!(entry>Number(event.ema99))||!(Number(event.lowerWickPct)>=25)||Math.abs(mark/entry-1)>.005)return null;
  const key=`${event.symbol}|${event.interval}|${event.candleAt}|${event.stage}`;
  return withEma99EntryProtection({...EMA99_BOUNCE_LONG_ROUTE,signalInterval:event.interval,symbol:event.symbol,orderType:'MARKET',notionalUsdt:5*leverage,leverage,takeProfitRoePct,
    signalEntryPrice:entry,entryExpiresAt:closeAt+90_000,takeProfitPrice:tp,stopLossPrice:sl,
    protectionOnFill:true,preserveSignalProtection:true,allowMinNotionalCeil:false,dryRun:false,
    clientOrderId:`ebl_${createHash('sha256').update(key).digest('hex').slice(0,26)}`,
    signalReason:`EMA99 bounce confirmed | ${event.confirmation} | ${event.interval} | confirmed=${new Date(closeAt).toISOString()} | reclaim=${new Date(reclaimAt).toISOString()} | EMA99=${event.ema99} | lowerWick=${event.lowerWickPct}% | vol=${event.volumeRatio}x`,
    signalCombo:`${event.interval}|${event.stage}|${event.confirmation}`,maxOpenPositions:30});
}
