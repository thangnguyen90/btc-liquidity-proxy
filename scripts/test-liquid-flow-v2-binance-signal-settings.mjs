import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LIQUID_FLOW_V2_BINANCE_SIGNAL_SETTINGS_VERSION,
  LiquidFlowV2BinanceSignalSettings,
} from '../src/liquidFlowV2BinanceSignalSettings.js';

const directory = await mkdtemp(join(tmpdir(), 'lfv2-binance-signal-settings-'));
const file = join(directory, 'settings.json');
const settings = new LiquidFlowV2BinanceSignalSettings({ file });

assert.deepEqual((await settings.init()).signals, {});
await assert.rejects(
  settings.update({ labelKey: 'BAD KEY', enabled: true, marginUsdt: 2 }),
  /labelKey/,
);
await assert.rejects(
  settings.update({ labelKey: 'EMA_FAN_LONG_READY', enabled: true, marginUsdt: 0 }),
  /marginUsdt/,
);

const saved = await settings.update({
  labelKey: 'EMA_FAN_LONG_READY',
  enabled: false,
  marginUsdt: 3.5,
});
assert.equal(saved.source, 'PERSISTED');
assert.equal(saved.enabled, false);
assert.equal(saved.marginUsdt, 3.5);
assert.equal(settings.override('ema_fan_long_ready').marginUsdt, 3.5);

const disk = JSON.parse(await readFile(file, 'utf8'));
assert.equal(disk.version, LIQUID_FLOW_V2_BINANCE_SIGNAL_SETTINGS_VERSION);
assert.equal(disk.signals.EMA_FAN_LONG_READY.enabled, false);

const reloaded = new LiquidFlowV2BinanceSignalSettings({ file });
await reloaded.init();
assert.equal(reloaded.override('EMA_FAN_LONG_READY').enabled, false);
assert.equal(reloaded.override('EMA_FAN_LONG_READY').marginUsdt, 3.5);

await writeFile(file, JSON.stringify({
  version: 'LEGACY_OR_UNKNOWN',
  signals: {
    EMA_FAN_LONG_READY: { enabled: true, marginUsdt: 2 },
    BAD_MARGIN: { enabled: true, marginUsdt: -1 },
    BAD_TYPE: { enabled: 'true', marginUsdt: 2 },
  },
}), 'utf8');
const compatible = new LiquidFlowV2BinanceSignalSettings({ file });
await compatible.init();
assert.equal(compatible.override('EMA_FAN_LONG_READY').enabled, true);
assert.equal(compatible.override('BAD_MARGIN'), null);
assert.equal(compatible.override('BAD_TYPE'), null);

await rm(directory, { recursive: true, force: true });
console.log('Liquid Flow V2 per-signal Binance settings tests passed.');
