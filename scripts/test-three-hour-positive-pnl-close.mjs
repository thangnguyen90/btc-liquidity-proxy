import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
  BINANCE_THREE_HOUR_POSITIVE_PNL_CLOSE_VERSION,
  evaluateBinanceThreeHourPositivePnlClose,
  negativeAgeTpOpenedAt,
} from '../src/binanceTwelveHourTakeProfit.js';

// Execute only the active timeout executor with mocked exchange dependencies.
// Importing server.js directly is forbidden here because it starts live services.
const source = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
const start = source.indexOf('async function handlePositionTimeout(');
const end = source.indexOf('\nfunction startNegTpScanner()', start);
assert.ok(start > 0 && end > start, 'active positive-PnL timeout executor must be extractable');

function createRuntime({
  amount = 10,
  positionSide = 'BOTH',
  unrealizedPnl = 0.01,
  tracked = true,
  excluded = false,
  capTsl = false,
  failPlace = false,
} = {}) {
  const events = [];
  let shouldFail = failPlace;
  const now = Date.now();
  const signalSide = amount > 0 ? 'BUY' : 'SELL';
  const context = vm.createContext({
    BINANCE_THREE_HOUR_POSITIVE_PNL_CLOSE_VERSION,
    evaluateBinanceThreeHourPositivePnlClose,
    negativeAgeTpOpenedAt,
    runtimeSettings: { positionTimeoutEnabled: true, positionTimeoutH: 3 },
    slTracking: { positions: tracked ? {
      TESTUSDT: {
        openedAt: now - 3 * 60 * 60 * 1000 - 1,
        entry: 100,
        entryOrderId: 'filled-order',
        signalSide,
      },
    } : {} },
    positionTimeoutFired: new Set(),
    isBinanceProtectionExcluded: () => excluded,
    isCapTslSymbol: () => capTsl,
    getApiCredentials: () => ({ apiKey: 'mock', apiSecret: 'mock' }),
    getSymbols: async () => [{
      symbol: 'TESTUSDT',
      filters: [{ filterType: 'LOT_SIZE', stepSize: '1' }],
    }],
    decimalsFromStep: () => 0,
    process: { env: {} },
    console: { log() {}, warn() {}, error() {} },
    client: {
      placeFuturesOrder: async ({ params }) => {
        events.push(['place', params]);
        if (shouldFail) throw new Error('mock Binance block');
        return { orderId: 123 };
      },
    },
  });
  vm.runInContext(source.slice(start, end), context);
  const pos = {
    amt: amount,
    entry: 100,
    positionSide,
    markPrice: amount > 0 ? 101 : 99,
    unRealizedProfit: unrealizedPnl,
  };
  return {
    context,
    events,
    pos,
    allowRetry() { shouldFail = false; },
  };
}

for (const hedge of [false, true]) {
  const runtime = createRuntime({
    amount: hedge ? -10 : 10,
    positionSide: hedge ? 'SHORT' : 'BOTH',
  });
  const result = await runtime.context.handlePositionTimeout('TESTUSDT', runtime.pos, runtime.pos.markPrice, 0.1);
  assert.equal(result.status, 'submitted');
  assert.equal(runtime.events.length, 1, 'executor must place only the MARKET close');
  const params = runtime.events[0][1];
  assert.equal(params.type, 'MARKET');
  assert.equal(params.quantity, '10', 'integer quantity must keep trailing zero');
  assert.equal(params.side, hedge ? 'BUY' : 'SELL');
  assert.equal(params.positionSide, hedge ? 'SHORT' : undefined);
  assert.equal(params.reduceOnly, hedge ? undefined : 'true');
  assert.equal((await runtime.context.handlePositionTimeout('TESTUSDT', runtime.pos, runtime.pos.markPrice, 0.1)).status, 'deduped');
}

for (const options of [
  { unrealizedPnl: 0 },
  { unrealizedPnl: -0.01 },
  { tracked: false },
  { excluded: true },
  { capTsl: true },
]) {
  const runtime = createRuntime(options);
  const result = await runtime.context.handlePositionTimeout('TESTUSDT', runtime.pos, runtime.pos.markPrice, -0.1);
  assert.notEqual(result.status, 'submitted');
  assert.equal(runtime.events.length, 0);
}

const retryRuntime = createRuntime({ failPlace: true });
assert.equal((await retryRuntime.context.handlePositionTimeout(
  'TESTUSDT', retryRuntime.pos, retryRuntime.pos.markPrice, 0.1,
)).status, 'error');
retryRuntime.allowRetry();
assert.equal((await retryRuntime.context.handlePositionTimeout(
  'TESTUSDT', retryRuntime.pos, retryRuntime.pos.markPrice, 0.1,
)).status, 'submitted', 'failed write must release the dedupe lock for retry');

console.log('3h positive-PnL MARKET close executor mocked tests passed (no exchange calls).');
