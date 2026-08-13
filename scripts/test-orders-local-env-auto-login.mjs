import assert from 'node:assert/strict';
import {
  ORDERS_LOCAL_ENV_AUTO_LOGIN_VERSION,
  isLocalEnvAutoLoginRequest,
  isBinanceCredentialRejection,
  localEnvAutoLoginEnabled,
  localEnvAuthFailure,
  localEnvOrdersCredentials,
} from '../src/ordersLocalEnvAutoLogin.js';

assert.equal(ORDERS_LOCAL_ENV_AUTO_LOGIN_VERSION, 'ORDERS_LOCAL_ENV_AUTO_LOGIN_V1_20260813');
assert.equal(localEnvAutoLoginEnabled({ ORDERS_LOCAL_ENV_AUTO_LOGIN: 'true' }), true);
assert.equal(localEnvAutoLoginEnabled({ ORDERS_LOCAL_ENV_AUTO_LOGIN: 'false' }), false);
assert.deepEqual(localEnvOrdersCredentials({ BINANCE_API_KEY: ' key ', BINANCE_API_SECRET: ' secret ' }), {
  apiKey: 'key',
  apiSecret: 'secret',
});
assert.equal(localEnvOrdersCredentials({ BINANCE_API_KEY: 'key' }), null);
assert.equal(isBinanceCredentialRejection({ code: -2015, message: 'rejected' }), true);
assert.equal(isBinanceCredentialRejection({ message: 'Invalid API-key, IP, or permissions for action' }), true);
assert.equal(isBinanceCredentialRejection({ code: -1000, message: 'network timeout' }), false);
assert.deepEqual(localEnvAuthFailure({ code: -2015 }), {
  status: 401,
  code: 'BINANCE_AUTH_REJECTED',
  error: 'Binance từ chối account trong .env: kiểm tra API key/secret, quyền Futures và IP whitelist.',
});
assert.equal(localEnvAuthFailure(new Error('timeout')).code, 'BINANCE_SESSION_UNAVAILABLE');

const request = (host, remoteAddress, origin = '') => ({
  headers: { host, ...(origin ? { origin } : {}) },
  socket: { remoteAddress },
});
assert.equal(isLocalEnvAutoLoginRequest(request('127.0.0.1:19082', '::ffff:127.0.0.1', 'http://127.0.0.1:19082')), true);
assert.equal(isLocalEnvAutoLoginRequest(request('localhost:19082', '::1', 'http://localhost:19082')), true);
assert.equal(isLocalEnvAutoLoginRequest(request('192.168.1.10:19082', '192.168.1.20')), false);
assert.equal(isLocalEnvAutoLoginRequest(request('127.0.0.1:19082', '192.168.1.20')), false);
assert.equal(isLocalEnvAutoLoginRequest(request('127.0.0.1:19082', '127.0.0.1', 'https://evil.example')), false);

console.log('Orders local env auto-login tests passed.');
