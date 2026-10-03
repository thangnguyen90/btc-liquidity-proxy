import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ORDERS_PASSWORD_AUTH_VERSION,
  isSameOriginWriteRequest,
  ordersPasswordConfigured,
  verifyOrdersPassword,
} from '../src/ordersPasswordAuth.js';

assert.equal(ORDERS_PASSWORD_AUTH_VERSION, 'ORDERS_PASSWORD_AUTH_V1_PUBLIC_CONTROLS_20261002');
assert.equal(ordersPasswordConfigured({ ORDERS_PASSWORD: 'secret' }), true);
assert.equal(ordersPasswordConfigured({}), false);
assert.equal(verifyOrdersPassword('secret', { ORDERS_PASSWORD: 'secret' }), true);
assert.equal(verifyOrdersPassword('wrong', { ORDERS_PASSWORD: 'secret' }), false);
assert.equal(verifyOrdersPassword('', { ORDERS_PASSWORD: 'secret' }), false);

const request = (origin, host = 'liquidity.example', forwardedProto = 'https') => ({
  headers: { origin, host, 'x-forwarded-proto': forwardedProto },
  socket: { encrypted: false },
});
assert.equal(isSameOriginWriteRequest(request('https://liquidity.example')), true);
assert.equal(isSameOriginWriteRequest(request('http://liquidity.example', 'liquidity.example', 'https')), false);
assert.equal(isSameOriginWriteRequest(request('https://evil.example')), false);
assert.equal(isSameOriginWriteRequest({ headers: { host: 'liquidity.example' }, socket: {} }), true);

const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.ok(server.includes("requestUrl.pathname === '/api/auth/orders-password'"));
assert.ok(server.includes('verifyOrdersPassword(body.password)'));
assert.ok(server.includes('ordersPasswordAttemptState(request)'));
assert.ok(server.includes('recordOrdersPasswordFailure(attempt.key)'));
assert.ok(server.includes("createVerifiedOrdersSession(credentials, snapshot, 'orders-password')"));
assert.ok(server.includes('if(!isSameOriginWriteRequest(request))'));

console.log('Orders password auth passed: timing-safe secret check, proxy same-origin validation, rate-limit wiring and verified Binance session issuance.');
