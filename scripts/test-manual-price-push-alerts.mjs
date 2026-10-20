import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
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
  assert.equal(manager.snapshot().maxActive, 50);

  // A heatmap alert shares the existing matcher/state, only adding a safe return-page context.
  await assert.rejects(manager.create({symbol:'Q',targetPrice:105,sourcePage:'HEATMAP_LAB',range:'https://invalid.test'}), /không hợp lệ/);
  const heatmap = await manager.create({symbol:'Q',targetPrice:105,currentPrice:100,sourcePage:'HEATMAP_LAB',range:'24h'});
  assert.equal(heatmap.alert.sourcePage, 'HEATMAP_LAB');
  assert.equal(pushed.length, 2, 'saving a level cannot send immediately');
  const restarted = new ManualPricePushAlerts({stateFile:join(directory,'alerts.json'),now:()=>now,pushSender:async p=>{pushed.push(p);return {sent:1};}});
  assert.equal((await restarted.initialize()).alerts[0].sourcePage, 'HEATMAP_LAB');
  await restarted.onMark({symbol:'QUSDT',markPrice:104,eventTime:now});
  await restarted.onMark({symbol:'QUSDT',markPrice:105,eventTime:now+1000});
  const heatmapPayload = pushed.at(-1), destination = new URL(heatmapPayload.url, 'https://example.test');
  assert.equal(destination.pathname, '/coinglass-heatmap-lab');
  assert.equal(destination.searchParams.get('symbol'), 'QUSDT');
  assert.equal(destination.searchParams.get('range'), '24h');
  assert.equal(destination.searchParams.get('alert'), heatmap.alert.id);
  assert.equal(destination.hash, '#price-alerts');
  assert.equal(heatmapPayload.signalType, MANUAL_PRICE_PUSH_SIGNAL_TYPE);
  await restarted.onMark({symbol:'QUSDT',markPrice:106,eventTime:now+2000});
  assert.equal(pushed.length, 3, 'one-shot remains shared across pages/restarts');
  const saved = JSON.parse(await readFile(join(directory,'alerts.json'),'utf8'));
  saved.version='MANUAL_PRICE_PUSH_ALERT_V1_BINANCE_MARK_CROSS_20261004';
  delete saved.alerts[0].sourcePage;delete saved.alerts[0].range;
  await writeFile(join(directory,'legacy.json'),JSON.stringify(saved));
  const legacy = new ManualPricePushAlerts({stateFile:join(directory,'legacy.json'),now:()=>now});
  const oldAlert = (await legacy.initialize()).alerts[0];
  assert.equal(oldAlert.status, 'TRIGGERED');
  assert.equal(buildManualPricePushPayload(oldAlert).url, '/coin-level-analysis?symbol=QUSDT');
  assert.match(buildManualPricePushPayload({...oldAlert,sourcePage:'HEATMAP_LAB',range:'//evil.test'}).url, /^\/coin-level-analysis\?/);
  const source = await readFile('src/server.js','utf8');
  const getRoute = source.slice(source.indexOf("if (requestUrl.pathname === '/api/manual-price-push-alerts' && request.method === 'GET')"));
  assert.match(getRoute.slice(0,getRoute.indexOf('\n    }')), /manualPricePushAlerts\.snapshot\(\)/);
  assert.doesNotMatch(getRoute.slice(0,getRoute.indexOf('\n    }')), /managementSnapshot|getSymbols|\.create\(|placeOrder|sendPayload/);
  assert.match(source, /sourcePage: body\.sourcePage, range: body\.range/);
} finally {
  await rm(directory, { recursive:true, force:true });
}

console.log('manual Binance price Web Push alerts tests: OK');
