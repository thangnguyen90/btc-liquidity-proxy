import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoEntryControls, entryRoute } from '../src/autoEntryControls.js';
import {
  OTHER_ENTRY_CATALOG,
  OTHER_ENTRY_SETTINGS_VERSION,
  otherRouteMeta,
  resolveOtherEntrySettings,
} from '../src/otherEntryCatalog.js';

assert.equal(OTHER_ENTRY_SETTINGS_VERSION, 'OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V19_LOCAL_AI_PRIORITY_ZONE_1USDT_20261003');
assert.equal(OTHER_ENTRY_CATALOG.length, 36);
assert.ok(OTHER_ENTRY_CATALOG.every((route) => otherRouteMeta(route)));
assert.deepEqual(OTHER_ENTRY_CATALOG
  .filter((route) => route.source === 'post-move-impulse')
  .map((route) => route.marginUsdt), [5, 5]);
assert.deepEqual(OTHER_ENTRY_CATALOG
  .filter((route) => route.source === 'btc-relative-strength-watch')
  .map((route) => [route.side, route.marginUsdt, route.leverage, route.takeProfitRoePct]),
[['LONG', 2, 5, 10], ['SHORT', 2, 5, 10]]);
assert.deepEqual(OTHER_ENTRY_CATALOG
  .filter((route) => route.source === 'local-ai-trend-evaluation')
  .map((route) => [route.side, route.marginUsdt, route.leverage, route.takeProfitRoePct]),
[['LONG', 1, 5, 10], ['SHORT', 1, 5, 10]]);
assert.deepEqual(OTHER_ENTRY_CATALOG
  .filter((route) => route.source === 'local-ai-liquidity-breakout-opposite-depth')
  .map((route) => [route.side, route.marginUsdt, route.leverage, route.takeProfitRoePct]),
[['LONG', 4, 5, 10], ['SHORT', 4, 5, 10]]);

const dir = await mkdtemp(join(tmpdir(), 'other-entry-settings-'));
try {
  const file = join(dir, 'controls.json');
  let controls = new AutoEntryControls(file);
  controls.seed(OTHER_ENTRY_CATALOG);
  let state = controls.read();
  assert.equal(state.enabled, false);
  assert.equal(state.otherEntrySettingsVersion, OTHER_ENTRY_SETTINGS_VERSION);
  for (const profile of OTHER_ENTRY_CATALOG) {
    const row = state.routes[entryRoute(profile).key];
    const resolved = resolveOtherEntrySettings(profile);
    assert.equal(row.enabled, false, 'new route remains OFF');
    assert.equal(row.otherSettingsEditable, true);
    assert.equal(row.marginUsdt, resolved.marginUsdt);
    assert.equal(row.leverage, resolved.leverage);
    assert.equal(row.takeProfitRoePct, resolved.takeProfitRoePct);
    assert.equal(row.takeProfitSettingsEditable, resolved.takeProfitEditable);
  }

  const hybrid = OTHER_ENTRY_CATALOG.find((route) => route.streamId === 'primary'
    && route.signalLabel === 'HYBRID_UPPER_FIRST_SHORT_SQUEEZE_READY');
  const hybridKey = entryRoute(hybrid).key;
  controls.update({ action: 'margin', key: hybridKey, marginUsdt: 3.25, expectedMarginUsdt: 1 });
  controls.update({ action: 'leverage', key: hybridKey, leverage: 8, expectedLeverage: 5 });
  controls.update({ action: 'takeProfit', key: hybridKey, takeProfitRoePct: 17.5,
    expectedTakeProfitRoePct: 10 });
  state = controls.read();
  assert.equal(state.routes[hybridKey].enabled, false, 'saving values never enables an OFF route');
  assert.equal(state.routes[hybridKey].enabledAt, undefined);
  assert.deepEqual(
    [state.routes[hybridKey].marginUsdt, state.routes[hybridKey].leverage,
      state.routes[hybridKey].takeProfitRoePct],
    [3.25, 8, 17.5],
  );
  assert.throws(() => controls.update({ action: 'margin', key: hybridKey,
    marginUsdt: 4, expectedMarginUsdt: 1 }), /thay đổi/);
  assert.throws(() => controls.update({ action: 'leverage', key: hybridKey,
    leverage: 5.5, expectedLeverage: 8 }), /số nguyên/);
  assert.throws(() => controls.update({ action: 'takeProfit', key: hybridKey,
    takeProfitRoePct: 0, expectedTakeProfitRoePct: 17.5 }), /1–100/);

  controls.update({ action: 'master', enabled: true });
  controls.update({ action: 'route', key: hybridKey, enabled: true });
  const hybridPayload = { ...hybrid, side: 'BUY', orderType: 'MARKET',
    marginUsdt: 3.25, leverage: 8, notionalUsdt: 26, takeProfitRoePct: 17.5 };
  assert.doesNotThrow(() => controls.assertEntry(hybridPayload));
  assert.throws(() => controls.assertEntry({ ...hybridPayload, notionalUsdt: 8 }), /size\/leverage/);
  assert.throws(() => controls.assertEntry({ ...hybridPayload, takeProfitRoePct: 10 }), /TP changed/);

  const sagaClosedFollow = OTHER_ENTRY_CATALOG.find((route) => (
    route.streamId === 'extreme-short-squeeze-saga-15m'
    && route.signalLabel === 'FOLLOW_REJECTION_CLOSED'
  ));
  const sagaClosedFollowKey = entryRoute(sagaClosedFollow).key;
  controls.update({ action: 'route', key: sagaClosedFollowKey, enabled: true });
  assert.doesNotThrow(() => controls.assertEntry({ ...sagaClosedFollow,
    symbol: 'SAGAUSDT', signalInterval: '15m', side: 'SELL', orderType: 'MARKET',
    marginUsdt: 6, leverage: 5, notionalUsdt: 30, takeProfitRoePct: 15,
  }));
  assert.throws(() => controls.assertEntry({ ...sagaClosedFollow,
    symbol: 'SAGAUSDT', signalInterval: '15m', side: 'SELL', orderType: 'MARKET',
    marginUsdt: 5, leverage: 5, notionalUsdt: 25, takeProfitRoePct: 15,
  }), /size\/leverage/);

  const horizon = OTHER_ENTRY_CATALOG.find((route) => route.signalLabel === 'UPPER');
  const horizonKey = entryRoute(horizon).key;
  controls.update({ action: 'margin', key: horizonKey, marginUsdt: 6, expectedMarginUsdt: 5 });
  controls.update({ action: 'leverage', key: horizonKey, leverage: 7, expectedLeverage: 5 });
  assert.throws(() => controls.update({ action: 'takeProfit', key: horizonKey,
    takeProfitRoePct: 20, expectedTakeProfitRoePct: null }), /TP động/);
  controls.update({ action: 'route', key: horizonKey, enabled: true });
  assert.doesNotThrow(() => controls.assertEntry({ ...horizon, side: 'BUY', orderType: 'MARKET',
    marginUsdt: 6, leverage: 7, notionalUsdt: 42, takeProfitRoePct: 35 }));

  controls = new AutoEntryControls(file);
  state = controls.read();
  assert.deepEqual(
    [state.routes[hybridKey].marginUsdt, state.routes[hybridKey].leverage,
      state.routes[hybridKey].takeProfitRoePct, state.routes[hybridKey].enabled],
    [3.25, 8, 17.5, true],
    'saved settings and switch survive restart',
  );
  assert.deepEqual(
    [state.routes[horizonKey].marginUsdt, state.routes[horizonKey].leverage,
      state.routes[horizonKey].takeProfitRoePct, state.routes[horizonKey].enabled],
    [6, 7, null, true],
    'dynamic TP remains structural while margin/leverage survive restart',
  );

  const postMove = OTHER_ENTRY_CATALOG.find((route) => route.source === 'post-move-impulse');
  const postMoveKey = entryRoute(postMove).key;
  assert.throws(()=>controls.update({ action: 'margin', key: postMoveKey, marginUsdt: 8, expectedMarginUsdt: 5 }), /size tự động/);
  controls.update({ action: 'route', key: postMoveKey, enabled: true });
  const legacyEnabledAt = controls.read().routes[postMoveKey].enabledAt;
  const legacyState = JSON.parse(await readFile(file, 'utf8'));
  legacyState.routes[postMoveKey].marginUsdt = 8;
  legacyState.otherEntrySettingsVersion = 'OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V14_POST_MOVE_IMPULSE_8USDT_20260927';
  await writeFile(file, JSON.stringify(legacyState, null, 2));
  controls = new AutoEntryControls(file);
  controls.seed(OTHER_ENTRY_CATALOG);
  state = controls.read();
  assert.equal(state.routes[postMoveKey].marginUsdt, 5, 'legacy 8 USDT route migrates to 5');
  assert.equal(state.routes[postMoveKey].enabled, true, 'size migration preserves route switch');
  assert.equal(state.routes[postMoveKey].enabledAt, legacyEnabledAt, 'size migration preserves enabledAt');

  const localAiPriority = OTHER_ENTRY_CATALOG.find((route) => (
    route.source === 'local-ai-trend-evaluation' && route.side === 'LONG'
  ));
  const localAiPriorityKey = entryRoute(localAiPriority).key;
  controls.update({ action: 'route', key: localAiPriorityKey, enabled: true });
  const localAiEnabledAt = controls.read().routes[localAiPriorityKey].enabledAt;
  const legacyLocalAiState = JSON.parse(await readFile(file, 'utf8'));
  legacyLocalAiState.routes[localAiPriorityKey].marginUsdt = 3;
  legacyLocalAiState.otherEntrySettingsVersion = 'OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V18_LIQUIDITY_BREAKOUT_DEPTH_4USDT_20261003';
  await writeFile(file, JSON.stringify(legacyLocalAiState, null, 2));
  controls = new AutoEntryControls(file);
  controls.seed(OTHER_ENTRY_CATALOG);
  state = controls.read();
  assert.equal(state.routes[localAiPriorityKey].marginUsdt, 1, 'legacy AI PRIORITY 3 USDT route migrates to 1');
  assert.equal(state.routes[localAiPriorityKey].enabled, true, 'AI size migration preserves route switch');
  assert.equal(state.routes[localAiPriorityKey].enabledAt, localAiEnabledAt, 'AI size migration preserves enabledAt');
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log('Other entry settings PASS: 36 exact routes, editable margin/leverage/fixed TP, dynamic Horizon TP, stale-save, fail-closed and restart.');
