export const ORDERS_LOCAL_ENV_AUTO_LOGIN_VERSION = 'ORDERS_LOCAL_ENV_AUTO_LOGIN_V1_20260813';

export function isBinanceCredentialRejection(error = {}) {
  const code = Number(error?.code);
  const message = String(error?.message ?? '');
  return code === -2014
    || code === -2015
    || /invalid api-key|api-key.*invalid|permissions for action/i.test(message);
}

export function localEnvAuthFailure(error = {}) {
  if (isBinanceCredentialRejection(error)) {
    return {
      status: 401,
      code: 'BINANCE_AUTH_REJECTED',
      error: 'Binance từ chối account trong .env: kiểm tra API key/secret, quyền Futures và IP whitelist.',
    };
  }
  return {
    status: 502,
    code: 'BINANCE_SESSION_UNAVAILABLE',
    error: `Không thể tạo phiên Binance từ .env: ${String(error?.message ?? error).slice(0, 300)}`,
  };
}

function normalizeHostname(hostHeader = '') {
  const value = String(hostHeader ?? '').trim();
  if (!value) return '';
  try {
    return new URL(`http://${value}`).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return '';
  }
}

function normalizeRemoteAddress(remoteAddress = '') {
  return String(remoteAddress ?? '').trim().toLowerCase().replace(/^::ffff:/, '');
}

export function localEnvAutoLoginEnabled(env = process.env) {
  return String(env.ORDERS_LOCAL_ENV_AUTO_LOGIN ?? '').toLowerCase() === 'true';
}

export function localEnvOrdersCredentials(env = process.env) {
  const apiKey = String(env.BINANCE_API_KEY ?? '').trim();
  const apiSecret = String(env.BINANCE_API_SECRET ?? '').trim();
  return apiKey && apiSecret ? { apiKey, apiSecret } : null;
}

export function isLocalEnvAutoLoginRequest(request = {}) {
  const hostname = normalizeHostname(request.headers?.host);
  const remoteAddress = normalizeRemoteAddress(request.socket?.remoteAddress);
  const localHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const localPeer = remoteAddress === '127.0.0.1' || remoteAddress === '::1';
  if (!localHost || !localPeer) return false;

  const origin = String(request.headers?.origin ?? '').trim();
  if (!origin) return true;
  try {
    const originHostname = new URL(origin).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return originHostname === hostname;
  } catch {
    return false;
  }
}
