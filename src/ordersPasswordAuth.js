import crypto from 'node:crypto';

export const ORDERS_PASSWORD_AUTH_VERSION = 'ORDERS_PASSWORD_AUTH_V1_PUBLIC_CONTROLS_20261002';

function digest(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest();
}

export function ordersPasswordConfigured(env = process.env) {
  return String(env.ORDERS_PASSWORD ?? '').length > 0;
}

export function verifyOrdersPassword(candidate, env = process.env) {
  const expected = String(env.ORDERS_PASSWORD ?? '');
  if (!expected || typeof candidate !== 'string' || !candidate) return false;
  return crypto.timingSafeEqual(digest(candidate), digest(expected));
}

export function isSameOriginWriteRequest(request = {}) {
  const origin = String(request.headers?.origin ?? '').trim();
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const host = String(request.headers?.host ?? '').trim().toLowerCase();
    if (!host || originUrl.host.toLowerCase() !== host) return false;
    if (!['http:', 'https:'].includes(originUrl.protocol)) return false;
    const forwardedProto = String(request.headers?.['x-forwarded-proto'] ?? '')
      .split(',')[0].trim().toLowerCase();
    if (forwardedProto && `${forwardedProto}:` !== originUrl.protocol) return false;
    if (request.socket?.encrypted === true && originUrl.protocol !== 'https:') return false;
    return true;
  } catch {
    return false;
  }
}
