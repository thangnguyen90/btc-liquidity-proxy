#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import {
  COIN_LEVEL_LIVE_SOCKET_VERSION,
  attachCoinLevelLiveSocket,
} from '../src/coinLevelLiveSocket.js';

const handlers = new Map();
const subscriptions = new Map();
let latest = null;
const ticker = {
  register(id, onPrice) { handlers.set(id, onPrice); },
  setSymbols(id, symbols) { subscriptions.set(id, new Set(symbols)); },
  unregister(id) { handlers.delete(id); subscriptions.delete(id); },
  getPriceInfo(symbol) { return latest?.symbol === symbol ? { markPrice: latest.markPrice, at: latest.eventTime } : null; },
  emit(tick) {
    latest = tick;
    for (const [id, handler] of handlers) {
      if (subscriptions.get(id)?.has(tick.symbol)) handler(tick);
    }
  },
};

const server = createServer((_request, response) => response.end('ok'));
const live = attachCoinLevelLiveSocket({
  server,
  ticker,
  normalizeSymbol(value) {
    const clean = String(value ?? '').trim().toUpperCase();
    const symbol = clean.endsWith('USDT') ? clean : `${clean}USDT`;
    return /^[A-Z0-9]{2,24}USDT$/.test(symbol) ? symbol : '';
  },
  heartbeatMs: 60_000,
  now: () => Date.UTC(2026, 8, 19, 5, 0, 0),
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/coin-level-analysis?symbol=cross`);
const messages = [];
socket.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
await new Promise((resolve, reject) => {
  socket.once('open', resolve);
  socket.once('error', reject);
});
await new Promise((resolve) => setTimeout(resolve, 20));

assert.equal(messages[0]?.type, 'ready');
assert.equal(messages[0]?.version, COIN_LEVEL_LIVE_SOCKET_VERSION);
assert.equal(messages[0]?.symbol, 'CROSSUSDT');
assert.equal(handlers.size, 1);
assert.deepEqual([...subscriptions.values()].map((row) => [...row]), [['CROSSUSDT']]);

ticker.emit({
  symbol: 'CROSSUSDT',
  markPrice: 0.142071,
  eventTime: Date.UTC(2026, 8, 19, 5, 0, 1),
});
await new Promise((resolve) => setTimeout(resolve, 20));
const mark = messages.find((message) => message.type === 'mark');
assert.equal(mark.markPrice, 0.142071);
assert.equal(mark.source, 'BINANCE_FUTURES_MARK_PRICE_SOCKET');

ticker.emit({
  symbol: 'BTCUSDT',
  markPrice: 60_000,
  eventTime: Date.UTC(2026, 8, 19, 5, 0, 2),
});
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(messages.filter((message) => message.type === 'mark').length, 1,
  'the browser receives only its selected symbol');

socket.close();
await new Promise((resolve) => socket.once('close', resolve));
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(handlers.size, 0, 'closing a page removes its shared ticker subscription');
assert.equal(live.clientCount, 0);

live.close();
await new Promise((resolve) => server.close(resolve));

console.log('Coin-level live socket PASS: selected-symbol mark stream, filtering and disconnect cleanup.');
