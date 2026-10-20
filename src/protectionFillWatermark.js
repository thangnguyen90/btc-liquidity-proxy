export const POSITION_PROTECTION_FILL_WATERMARK_VERSION = 'POSITION_PROTECTION_FILL_WATERMARK_V1_20260812';
export const POSITION_PROTECTION_NEW_ORDERS_ONLY_VERSION = 'POSITION_PROTECTION_NEW_ORDERS_ONLY_V1_20261007';

export function normalizeProtectionFillWatermark(raw = {}, now = Date.now()) {
  const lastHandledFillAt = Math.max(0, Number(raw?.lastHandledFillAt) || Number(now) || 0);
  const handledOrderIds = [...new Set(
    (Array.isArray(raw?.handledOrderIds) ? raw.handledOrderIds : [])
      .map((value) => String(value ?? '').trim())
      .filter(Boolean),
  )].slice(-2_000);
  return {
    version: POSITION_PROTECTION_FILL_WATERMARK_VERSION,
    lastHandledFillAt,
    handledOrderIds,
    newOrdersOnlySince: Number.isFinite(Number(raw?.newOrdersOnlySince)) && Number(raw.newOrdersOnlySince)>0
      ? Number(raw.newOrdersOnlySince) : null,
    newOrdersOnlyVersion: raw?.newOrdersOnlyVersion??null,
  };
}

// Set once when this release first loads; restarts must not move the boundary
// and lose recovery for genuine NEW orders missed after this activation.
export function activateProtectionNewOrdersOnly(raw={}, now=Date.now()) {
  const state=normalizeProtectionFillWatermark(raw,0);
  if (raw?.newOrdersOnlySince!=null || raw?.newOrdersOnlyVersion!=null) {
    if (!(state.newOrdersOnlySince>0) || state.newOrdersOnlyVersion!==POSITION_PROTECTION_NEW_ORDERS_ONLY_VERSION)
      throw new Error('Invalid new-orders-only protection boundary');
  } else {
    if (!(Number(now)>0) || !Number.isFinite(Number(now))) throw new Error('Invalid protection activation time');
    state.newOrdersOnlySince=Number(now);
    state.newOrdersOnlyVersion=POSITION_PROTECTION_NEW_ORDERS_ONLY_VERSION;
  }
  state.lastHandledFillAt=Math.max(state.lastHandledFillAt,state.newOrdersOnlySince);
  return state;
}

export function protectionOrderIsNew(state,order,fill={}) {
  const cutoff=Number(state?.newOrdersOnlySince),created=Number(order?.time),filled=Number(fill.fillTime);
  const flag=v=>v===true||String(v).toLowerCase()==='true';
  return state?.newOrdersOnlyVersion===POSITION_PROTECTION_NEW_ORDERS_ONLY_VERSION
    && Number.isFinite(cutoff) && cutoff>0 && Number.isFinite(created) && created>cutoff
    && Number.isFinite(filled) && filled>cutoff && created<=filled
    && order?.status==='FILLED' && ['MARKET','LIMIT'].includes(order?.type)
    && fill.orderId!=null && order.orderId!=null && String(fill.orderId).trim()!==''
    && order?.symbol===fill.symbol && String(order?.orderId)===String(fill.orderId)
    && order?.side===fill.side && ['BUY','SELL'].includes(order?.side)
    && String(order?.positionSide??'BOTH')===String(fill.positionSide??'BOTH')
    && !flag(order?.reduceOnly) && !flag(order?.closePosition);
}

export function protectionTrackingIsNew(state,tracking) {
  const cutoff=Number(state?.newOrdersOnlySince);
  const created=Number(tracking?.protectionOrderCreatedAt),opened=Number(tracking?.openedAt);
  return state?.newOrdersOnlyVersion===POSITION_PROTECTION_NEW_ORDERS_ONLY_VERSION && Number.isFinite(cutoff) && cutoff>0
    && tracking?.protectionNewOrdersOnlyVersion===POSITION_PROTECTION_NEW_ORDERS_ONLY_VERSION
    && tracking?.protectionNewOrdersOnlySince===cutoff
    && Number.isFinite(created) && Number.isFinite(opened) && created>cutoff && opened>=created;
}

export function advanceProtectionFillWatermark(raw = {}, fill = {}) {
  const state = normalizeProtectionFillWatermark(raw, 0);
  const fillAt = Number(fill?.fillTime ?? fill?.updateTime ?? 0);
  const orderId = String(fill?.orderId ?? fill?.clientOrderId ?? '').trim();
  state.lastHandledFillAt = Math.max(state.lastHandledFillAt, Number.isFinite(fillAt) ? fillAt : 0);
  if (orderId && !state.handledOrderIds.includes(orderId)) state.handledOrderIds.push(orderId);
  state.handledOrderIds = state.handledOrderIds.slice(-2_000);
  return state;
}
