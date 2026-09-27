export const STRATEGY_SCAN_CANDLE_CLOSE_BURST_VERSION =
  'STRATEGY_SCAN_CANDLE_CLOSE_BURST_DEBOUNCE_V1_20260926';

export function createBurstCoalescer(callback, options = {}) {
  if (typeof callback !== 'function') throw new TypeError('callback must be a function');
  const delayMs = Math.max(0, Number(options.delayMs ?? 1_200));
  const cooldownMs = Math.max(0, Number(options.cooldownMs ?? 30_000));
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
  let timer = null;
  let lastRunAt = Number.NEGATIVE_INFINITY;

  return {
    schedule() {
      if (timer != null || now() - lastRunAt < cooldownMs) return false;
      timer = setTimer(() => {
        timer = null;
        lastRunAt = now();
        callback();
      }, delayMs);
      timer?.unref?.();
      return true;
    },
    cancel() {
      if (timer == null) return false;
      clearTimer(timer);
      timer = null;
      return true;
    },
    snapshot() {
      return { pending: timer != null, lastRunAt, delayMs, cooldownMs };
    },
  };
}
