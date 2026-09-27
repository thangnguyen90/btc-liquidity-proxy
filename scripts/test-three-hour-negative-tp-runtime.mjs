import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { BINANCE_EIGHT_HOUR_NEGATIVE_TP_VERSION, isBinancePositionTpCloseOrder } from '../src/binanceTwelveHourTakeProfit.js';

// Execute only the existing executor function with mocked exchange dependencies.
// Never import server.js: importing it starts live trading services.
const source = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
const start = source.indexOf('async function handleNegativeTimeoutTp(');
const end = source.indexOf('\nconst negTpLastRun', start);
assert.ok(start > 0 && end > start);
async function run({ failPlace = false, atEntry = false, hedge = false } = {}) {
  const events = [];
  const positionSide = hedge ? 'SHORT' : 'BOTH';
  const closeSide = hedge ? 'BUY' : 'SELL';
  const base = { symbol: 'TESTUSDT', positionSide, side: closeSide, reduceOnly: !hedge };
  const orders = [
    { ...base, type: 'LIMIT', orderId: 1, price: atEntry ? '100' : '110' },
    { ...base, type: 'STOP_MARKET', orderId: 2, stopPrice: '90' },
    { ...base, type: 'LIMIT', positionSide: 'BOTH', reduceOnly: false, orderId: 3, price: '108' },
    { ...base, type: 'LIMIT', positionSide: hedge ? 'LONG' : 'SHORT', orderId: 4, price: '108' },
  ];
  const context = vm.createContext({
    BINANCE_EIGHT_HOUR_NEGATIVE_TP_VERSION, BINANCE_NEGATIVE_TP_TO_ENTRY_VERSION: 'deep',
    isBinancePositionTpCloseOrder,
    tpMovedToEntry: new Map(), negTpLastRun: new Map(), negativeSince: new Map(), NEG_TP_COOLDOWN_MS: 120000,
    process: { env: {} }, console: { log() {}, warn() {}, error() {} },
    setTimeout: (f) => f(),
    getApiCredentials: () => ({}),
    getSymbols: async () => [{ symbol: 'TESTUSDT', filters: [{ filterType: 'LOT_SIZE', stepSize: '1' }] }],
    priceFromTick: (_, value) => String(value), decimalsFromStep: () => 0,
    invalidateOpenOrdersCache() {},
    client: {
      getOpenOrders: async () => orders,
      getOpenAlgoOrders: async () => ({ orders: [
        { ...base, orderType: 'TAKE_PROFIT_MARKET', algoId: 5, triggerPrice: '112' },
        { ...base, orderType: 'STOP_MARKET', algoId: 6, triggerPrice: '90' },
      ] }),
      cancelOrder: async (o) => events.push(['cancel', o.orderId]),
      cancelAlgoOrder: async (o) => events.push(['cancelAlgo', o.algoId]),
      placeFuturesOrder: async ({ params }) => {
        events.push(['place', params]);
        if (failPlace) throw new Error('mock Binance blocked');
      },
    },
  });
  vm.runInContext(source.slice(start, end), context);
  const result = await context.handleNegativeTimeoutTp('TESTUSDT', {
    entry: 100, amt: hedge ? -10 : 10, positionSide,
  }, { triggerVersion: BINANCE_EIGHT_HOUR_NEGATIVE_TP_VERSION, triggerAgeMs: 10800000, triggerRoe: -1 });
  return { events, result, context };
}
for (const hedge of [false, true]) {
  const { events, result, context } = await run({ hedge });
  assert.equal(result.status, 'moved-to-entry');
  assert.equal(events[0][0], 'place', 'replacement must be accepted before canceling old TP');
  assert.equal(events[0][1].quantity, '10', 'integer quantity must not lose trailing zeros');
  assert.equal(events[0][1].price, '100');
  assert.equal(events[0][1].side, hedge ? 'BUY' : 'SELL');
  assert.equal(events[0][1].reduceOnly, hedge ? undefined : 'true');
  assert.equal(events[0][1].positionSide, hedge ? 'SHORT' : undefined);
  assert.deepEqual(events.slice(1), [['cancel', 1], ['cancelAlgo', 5]], 'preserve SL, opening LIMIT and opposite hedge orders');
  const duplicate = await context.handleNegativeTimeoutTp('TESTUSDT', { entry: 100, amt: hedge ? -10 : 10 },
    { triggerVersion: BINANCE_EIGHT_HOUR_NEGATIVE_TP_VERSION });
  assert.equal(duplicate.status, 'deduped');
}
const failure = await run({ failPlace: true });
assert.equal(failure.result.status, 'error');
assert.equal(failure.events.length, 1, 'failed replacement must not cancel existing TP/SL');
const existing = await run({ atEntry: true });
assert.equal(existing.result.status, 'already-at-entry');
assert.deepEqual(existing.events, [['cancelAlgo', 5]], 'no duplicate placement when entry close exists');
console.log('3h TP executor mocked tests passed (no exchange calls).');
