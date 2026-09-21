export const MANUAL_SHORT_SL30_VERSION = 'MANUAL_SHORT_NEW_FILL_SL30_V1_20260915';
export const MANUAL_SHORT_SL30_DCA_VERSION = 'MANUAL_SHORT_SL30_PENDING_DCA_FIX_V1_20260915';
const SOURCES = new Set(['manual','orders-manual','binance-manual-socket','liquid-flow-v2-manual','pump-manual-order']);
export const isManualShortSl30Source = source => SOURCES.has(String(source??'').trim().toLowerCase());
const near = (a,b) => Math.abs(a-b)<=Math.max(Math.abs(b)*1e-8,1e-12);
const truthy = v => v===true || String(v).toLowerCase()==='true';

// Eligibility is proved from a verified opening order, not position updateTime.
// Orders created before activation are excluded, even if their last fill is new.
export function buildManualShortSl30({activatedAt,fillTime,symbol,orderId,source,order,
  positionAmount,positionEntryPrice,positionLeverage,positionSide='BOTH'}={}) {
  const activation=Date.parse(activatedAt),filled=Number(fillTime),created=Number(order?.time);
  const amount=Number(positionAmount),qty=Number(order?.executedQty),entry=Number(order?.avgPrice),lev=Number(positionLeverage);
  if (!Number.isFinite(activation) || activation<=0 || !Number.isFinite(filled) || filled<activation
    || ![amount,qty,entry,lev,Number(positionEntryPrice)].every(Number.isFinite)
    || !Number.isFinite(created) || created<activation || created>filled
    || !isManualShortSl30Source(source) || !orderId || String(order?.orderId)!==String(orderId)
    || order?.symbol!==symbol || order?.side!=='SELL' || order?.status!=='FILLED'
    || !['MARKET','LIMIT'].includes(order?.type) || truthy(order?.reduceOnly) || truthy(order?.closePosition)
    || !['BOTH','SHORT'].includes(positionSide) || String(order?.positionSide??'BOTH')!==positionSide
    || !(amount<0) || !(qty>0) || !near(-amount,qty) || !(entry>0) || !(lev>=1)
    || !near(Number(positionEntryPrice),entry)) return null;
  return {version:MANUAL_SHORT_SL30_VERSION,symbol,source,side:'SELL',positionSide,orderId:String(orderId),
    activatedAt:activation,orderCreatedAt:created,fillTime:filled,entryPrice:entry,quantity:qty,leverage:lev,
    stopLossRoePct:30,stopLossDistanceFraction:.3/lev,stopLossPrice:entry*(1+.3/lev)};
}

export function manualShortSl30MatchesPosition(policy,position,source) {
  const positionQuantity=policy?.positionQuantity??policy?.quantity;
  const positionEntry=policy?.positionEntryPrice??policy?.entryPrice;
  if (policy?.version!==MANUAL_SHORT_SL30_VERSION || !isManualShortSl30Source(source)
    || ![policy.activatedAt,policy.orderCreatedAt,policy.fillTime,policy.entryPrice,policy.quantity,policy.leverage,policy.stopLossPrice].every(Number.isFinite)
    || source!==policy.source || !(policy.activatedAt>0) || policy.orderCreatedAt<policy.activatedAt
    || policy.fillTime<policy.orderCreatedAt || !policy.orderId || policy.side!=='SELL'
    || !(policy.leverage>=1) || !(policy.entryPrice>0) || !(policy.quantity>0)
    || policy.symbol!==position?.symbol || policy.positionSide!==String(position?.positionSide??'BOTH')
    || !Number.isFinite(positionQuantity) || positionQuantity<policy.quantity || !(positionEntry>0)
    || ((policy.positionQuantity!=null || policy.positionEntryPrice!=null) && policy.dcaReconciliationVersion!==MANUAL_SHORT_SL30_DCA_VERSION)
    || !near(Number(position?.entryPrice),positionEntry)
    || !near(Number(position?.positionAmt),-positionQuantity)
    || !near(policy.stopLossPrice,policy.entryPrice*(1+.3/policy.leverage))) return false;
  return true;
}

// Fill additions may change qty/average while the FIRST SL is still being sent.
// Prove uninterrupted SELL-only history including the complete original order;
// preserve the original SL anchor, never silently rebase it after DCA.
export function reconcileManualShortSl30(policy,position,trades,source) {
  const base=policy?{...policy,positionQuantity:undefined,positionEntryPrice:undefined}:null;
  if (!base || !manualShortSl30MatchesPosition(base,{symbol:base.symbol,positionSide:base.positionSide,
    entryPrice:base.entryPrice,positionAmt:-base.quantity},source)) return null;
  const relevant=(trades??[]).filter(t=>t.symbol===base.symbol
    && String(t.positionSide??'BOTH')===base.positionSide && Number(t.time)>=base.orderCreatedAt);
  if (!relevant.length || relevant.some(t=>t.id==null || t.side!=='SELL' || !(Number(t.qty)>0)
    || !(Number(t.price)>0) || !Number.isFinite(Number(t.time)) || Number(t.realizedPnl)!==0)
    || new Set(relevant.map(t=>String(t.id))).size!==relevant.length) return null;
  const original=relevant.filter(t=>String(t.orderId)===base.orderId);
  const sum=rows=>rows.reduce((a,t)=>({qty:a.qty+Number(t.qty),value:a.value+Number(t.qty)*Number(t.price)}),{qty:0,value:0});
  const opening=sum(original),all=sum(relevant);
  if (!near(opening.qty,base.quantity) || !near(opening.value/opening.qty,base.entryPrice)
    || !original.every(t=>Number(t.time)<=base.fillTime) || all.qty<base.quantity) return null;
  const extended={...base,positionQuantity:all.qty,positionEntryPrice:all.value/all.qty,
    dcaReconciliationVersion:MANUAL_SHORT_SL30_DCA_VERSION,
    dcaOrderIds:[...new Set(relevant.filter(t=>String(t.orderId)!==base.orderId).map(t=>String(t.orderId)))],
    positionReconciledAt:Math.max(...relevant.map(t=>Number(t.time)))};
  return manualShortSl30MatchesPosition(extended,position,source)?extended:null;
}

export function applyManualShortSl30ToPlan(plan,policy) {
  if (!policy || !plan || plan.source!==policy.source || !['SELL','SHORT'].includes(plan.side)) return plan;
  return {...plan,manualShortSl50:policy,slPrice:policy.stopLossPrice,signalStopLossPrice:policy.stopLossPrice,
    stopLossSuppressed:false,stopLossSuppressionVersion:null,fillAnchorEnabled:true,
    fillAnchorVersion:MANUAL_SHORT_SL30_VERSION,fillPrice:policy.entryPrice,
    stopLossDistanceFraction:policy.stopLossDistanceFraction,takeProfitDistanceFraction:null,
    signalReason:`${plan.signalReason??'Lệnh SHORT vào tay'} | SL=-30% ROE from actual full-fill; ${MANUAL_SHORT_SL30_VERSION}`};
}
