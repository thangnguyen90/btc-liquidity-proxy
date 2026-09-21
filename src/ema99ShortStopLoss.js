export const EMA99_SHORT_SL_VERSION='EMA99_SHORT_FILL_SL_30ROE_EDITABLE_LEVERAGE_V2_20260913';
export const EMA99_LONG_SL_VERSION='EMA99_LONG_FILL_SL_20ROE_EDITABLE_LEVERAGE_V2_20260913';
export const EMA99_TP_VERSION='EMA99_ROUTE_FILL_TP_ROE_EDITABLE_LEVERAGE_V3_20260913';
export const EMA99_ENTRY_PROTECTION_VERSION='EMA99_ROUTE_TP_LONGSL20_SHORTSL30_EDITABLE_LEVERAGE_V3_20260913';
const isEma99Direction=plan=>Boolean(plan)&&(
  plan.side==='SELL'&&['ema99-near-reject-short','ema99-observe-only'].includes(plan.source)
  ||plan.side==='BUY'&&['ema99-reclaim-long','ema99-bounce-long','ema99-observe-only','ema99-kill-reclaim','ema99-kill-reclaim-pump-dump-absorption'].includes(plan.source));
// Applied only while constructing a NEW EMA99 entry; never to adopted positions.
export function withEma99ShortStopLoss(plan){
  if(!plan||plan.side!=='SELL'||!['ema99-near-reject-short','ema99-observe-only'].includes(plan.source))return plan;
  const entry=Number(plan.signalEntryPrice),lev=Number(plan.leverage);
  if(!(entry>0)||!(lev>0))throw Error('Invalid EMA99 SHORT SL anchor');
  const distance=.30/lev;
  return {...plan,stopLossPrice:entry*(1+distance),fillAnchorEnabled:true,fillAnchorVersion:EMA99_SHORT_SL_VERSION,
    protectionSignalEntryPrice:entry,protectionSignalStopLossPrice:entry*(1+distance),
    takeProfitDistanceFraction:null,stopLossDistanceFraction:distance,
    signalReason:`${plan.signalReason} | SL=-30% ROE from actual full-fill average (${distance*100}% price)`};
}
// LONG EMA99 entries use a separate, tighter risk cap requested by the user.
// The price written before submission is only a validation placeholder; the
// full-fill handler recalculates it from Binance's actual average fill.
export function withEma99LongStopLoss(plan){
  if(!plan||plan.side!=='BUY'||!['ema99-reclaim-long','ema99-bounce-long','ema99-observe-only','ema99-kill-reclaim','ema99-kill-reclaim-pump-dump-absorption'].includes(plan.source))return plan;
  const entry=Number(plan.signalEntryPrice),lev=Number(plan.leverage);
  if(!(entry>0)||!(lev>0))throw Error('Invalid EMA99 LONG SL anchor');
  const distance=.20/lev;
  return {...plan,stopLossPrice:entry*(1-distance),fillAnchorEnabled:true,fillAnchorVersion:EMA99_LONG_SL_VERSION,
    protectionSignalEntryPrice:entry,protectionSignalStopLossPrice:entry*(1-distance),
    takeProfitDistanceFraction:null,stopLossDistanceFraction:distance,
    signalReason:`${plan.signalReason} | SL=-20% ROE from actual full-fill average (${distance*100}% price)`};
}
export function withEma99DirectionStopLoss(plan){
  return withEma99LongStopLoss(withEma99ShortStopLoss(plan));
}
export function withEma99TakeProfit(plan){
  if(!isEma99Direction(plan))return plan;
  const entry=Number(plan.signalEntryPrice),lev=Number(plan.leverage),roe=Number(plan.takeProfitRoePct??15);
  if(!(entry>0)||!(lev>0)||!(roe>=1&&roe<=100))throw Error('Invalid EMA99 TP anchor');
  const distance=roe/100/lev,tp=entry*(plan.side==='BUY'?1+distance:1-distance);
  return {...plan,takeProfitPrice:tp,fillAnchorEnabled:true,fillAnchorVersion:EMA99_ENTRY_PROTECTION_VERSION,
    protectionSignalEntryPrice:entry,protectionSignalTakeProfitPrice:tp,takeProfitDistanceFraction:distance,takeProfitRoePct:roe,
    signalReason:`${plan.signalReason} | TP=+${roe}% ROE from actual full-fill average (${distance*100}% price)`};
}
export function withEma99EntryProtection(plan){
  return withEma99TakeProfit(withEma99DirectionStopLoss(plan));
}
