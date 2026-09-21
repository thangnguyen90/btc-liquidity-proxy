export const BINANCE_NEGATIVE_TP_TO_ENTRY_VERSION = 'BINANCE_NEGATIVE_TP_TO_ENTRY_V6_ROE20_OVERRIDES_FAST_WAVE_20260905';
export const BINANCE_NEGATIVE_TP_TO_ENTRY_DEFAULT_ROE = -20;
export const BINANCE_FAST_WAVE_RECOVERY_VERSION = 'BINANCE_FAST_WAVE_RECOVERY_V1_ARM_NEG20_LOCK1_AT10_20260902';
export const BINANCE_FAST_WAVE_RECOVERY_TRIGGER_ROE = -20;
export const BINANCE_FAST_WAVE_RECOVERY_LOCK_TRIGGER_ROE = 10;
export const BINANCE_FAST_WAVE_RECOVERY_LOCK_ROE = 1;

export function normalizeNegativeTpRoe(value = BINANCE_NEGATIVE_TP_TO_ENTRY_DEFAULT_ROE) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed < 0
    ? parsed
    : BINANCE_NEGATIVE_TP_TO_ENTRY_DEFAULT_ROE;
}

export function shouldMoveNegativeTpToEntry({
  roe,
  thresholdRoe = BINANCE_NEGATIVE_TP_TO_ENTRY_DEFAULT_ROE,
  capTsl = false,
} = {}) {
  // Kept in the signature for old callers/JSON compatibility. Cap TSL only
  // caps profit-lock SL progression; it must not disable loss recovery TP.
  void capTsl;
  const normalizedRoe = Number(roe);
  const normalizedThreshold = normalizeNegativeTpRoe(thresholdRoe);
  return Number.isFinite(normalizedRoe) && normalizedRoe <= normalizedThreshold;
}

export function shouldBypassFastWaveRecoveryForNegativeTp({
  roe,
  thresholdRoe = BINANCE_NEGATIVE_TP_TO_ENTRY_DEFAULT_ROE,
} = {}) {
  return shouldMoveNegativeTpToEntry({ roe, thresholdRoe });
}

export function evaluateBinanceFastWaveRecovery({
  roe,
  fastWaveActive = false,
  recoveryState = null,
  triggerRoe = BINANCE_FAST_WAVE_RECOVERY_TRIGGER_ROE,
  lockTriggerRoe = BINANCE_FAST_WAVE_RECOVERY_LOCK_TRIGGER_ROE,
  lockRoe = BINANCE_FAST_WAVE_RECOVERY_LOCK_ROE,
} = {}) {
  const currentRoe = Number(roe);
  const normalizedTrigger = normalizeNegativeTpRoe(triggerRoe);
  const normalizedLockTrigger = Number(lockTriggerRoe);
  const normalizedLockRoe = Number(lockRoe);
  const state = String(recoveryState ?? '').trim().toUpperCase();
  if (!Number.isFinite(currentRoe)) return { action: 'INVALID_ROE' };
  if (state === 'LOCKED') {
    return { action: 'LOCKED', lockRoe: normalizedLockRoe };
  }
  if (state === 'ARMED') {
    if (Number.isFinite(normalizedLockTrigger) && currentRoe >= normalizedLockTrigger) {
      return { action: 'LOCK_SL', lockRoe: normalizedLockRoe };
    }
    return { action: 'WAIT_RECOVERY', lockRoe: normalizedLockRoe };
  }
  if (fastWaveActive === true && currentRoe <= normalizedTrigger) {
    return { action: 'ARM_RECOVERY', lockRoe: normalizedLockRoe };
  }
  return { action: 'NORMAL_NEGATIVE_TP', lockRoe: normalizedLockRoe };
}
