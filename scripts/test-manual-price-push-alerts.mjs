import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MANUAL_PRICE_PUSH_SIGNAL_TYPE,
  ManualPricePushAlerts,
  buildManualPricePushPayload,
  normalizeManualPriceAlertSymbol,
} from '../src/manualPricePushAlerts.js';

const directory = await mkdtemp(join(tmpdir(), 'manual-price-push-'));
let now = Date.UTC(2026, 9, 4, 12, 0);
const pushed = [];
const symbolSets = [];

try {
  assert.equal(normalizeManualPriceAlertSymbol('btc'), 'BTCUSDT');
  assert.equal(normalizeManualPriceAlertSymbol('龙虾usdt'), '龙虾USDT');
  assert.throws(() => normalizeManualPriceAlertSymbol('usdt'), /không hợp lệ/);
  const manager = new ManualPricePushAlerts({
    stateFile: join(directory, 'alerts.json'),
    now: () => now,
    onSymbolsChanged: symbols => symbolSets.push(symbols),
    pushSender: async payload => {
      pushed.push(payload);
      return { attempted: 1, sent: 1, failed: 0 };
    },
  });
  await manager.initialize();
  const created = await manager.create({ symbol:'btc', targetPrice:105, currentPrice:100 });
  assert.equal(created.alert.symbol, 'BTCUSDT');
  assert.equal(created.alert.direction, 'UP');
  assert.deepEqual(symbolSets.at(-1), ['BTCUSDT']);
  await assert.rejects(
    manager.create({ symbol:'BTCUSDT', targetPrice:105, currentPrice:100 }), /đã có cảnh báo/,
  );
  assert.equal((await manager.onMark({ symbol:'BTCUSDT', markPrice:104, eventTime:now })).triggered.length, 0);
  now += 1_000;
  const crossedUp = await manager.onMark({ symbol:'BTCUSDT', markPrice:105.2, eventTime:now });
  assert.equal(crossedUp.triggered.length, 1);
  assert.equal(crossedUp.triggered[0].triggerDirection, 'UP');
  assert.equal(pushed[0].signalType, MANUAL_PRICE_PUSH_SIGNAL_TYPE);
  assert.match(pushed[0].title, /BTCUSDT.*105/);
  assert.match(pushed[0].body, /cắt lên/);
  assert.deepEqual(symbolSets.at(-1), []);
  assert.equal((await manager.onMark({ symbol:'BTCUSDT', markPrice:106, eventTime:now + 1_000 })).triggered.length, 0,
    'one-shot alert must not fire twice');

  now += 2_000;
  await manager.rearm(created.alert.id, { currentPrice:106 });
  assert.deepEqual(symbolSets.at(-1), ['BTCUSDT']);
  const crossedDown = await manager.onMark({ symbol:'BTCUSDT', markPrice:104.9, eventTime:now });
  assert.equal(crossedDown.triggered[0].triggerDirection, 'DOWN');
  assert.match(pushed[1].body, /cắt xuống/);

  const payload = buildManualPricePushPayload(crossedDown.triggered[0]);
  assert.equal(payload.url, '/coin-level-analysis?symbol=BTCUSDT');
  assert.equal(payload.side, 'DOWN');
  await manager.remove(created.alert.id);
  assert.equal(manager.snapshot().alerts.length, 0);

  const reloaded = new ManualPricePushAlerts({ stateFile: join(directory, 'alerts.json'), now: () => now });
  assert.equal((await reloaded.initialize()).alerts.length, 0);
} finally {
  await rm(directory, { recursive:true, force:true });
}

console.log('manual Binance price Web Push alerts tests: OK');
