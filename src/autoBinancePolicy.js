export const AUTO_BINANCE_ENTRY_POLICY_VERSION = 'LIVE_CARD_ONLY_V1_20260803';

const LIVE_CARD_AUTO_ORDER_AUTHORIZATION = Symbol('live-card-auto-order-authorization');

export function liveCardOnlyAutoBinanceEnabled(env = process.env) {
  return env.LIVE_CARD_WHITELIST_ONLY_AUTO_BINANCE !== 'false';
}

export function authorizeLiveCardAutoOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, LIVE_CARD_AUTO_ORDER_AUTHORIZATION, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return authorized;
}

export function evaluateAutoBinanceEntryPolicy({
  payload = {},
  tokenIsAuthorized = false,
  orderEnabled = false,
  env = process.env,
} = {}) {
  const exclusive = liveCardOnlyAutoBinanceEnabled(env);
  const dryRun = payload?.dryRun !== false;

  if (!exclusive) {
    return { allowed: true, exclusive: false, reason: 'LEGACY_AUTO_MODE' };
  }
  if (dryRun || !orderEnabled) {
    return { allowed: true, exclusive: true, reason: 'NO_REAL_ORDER' };
  }
  if (tokenIsAuthorized) {
    return { allowed: true, exclusive: true, reason: 'MANUAL_ORDERS_SESSION' };
  }
  if (payload?.[LIVE_CARD_AUTO_ORDER_AUTHORIZATION] === true) {
    return { allowed: true, exclusive: true, reason: 'CHECKED_LIVE_CARD' };
  }
  return {
    allowed: false,
    exclusive: true,
    reason: 'AUTO_BINANCE_BLOCKED_NOT_CHECKED_IN_ORDERS',
  };
}
