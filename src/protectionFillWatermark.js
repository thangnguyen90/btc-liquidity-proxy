export const POSITION_PROTECTION_FILL_WATERMARK_VERSION = 'POSITION_PROTECTION_FILL_WATERMARK_V1_20260812';

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
  };
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
