import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const LIQUID_FLOW_V2_BINANCE_SIGNAL_SETTINGS_VERSION =
  'LIQUID_FLOW_V2_BINANCE_SIGNAL_SETTINGS_V1_20260821';

function safeLabelKey(value) {
  const key = String(value ?? '').trim().toUpperCase();
  return /^[A-Z0-9_]{2,120}$/.test(key) ? key : '';
}

function finiteMargin(value) {
  const margin = Number(value);
  return Number.isFinite(margin) && margin >= 0.01 && margin <= 10_000 ? margin : null;
}

async function writeJsonAtomic(file, payload) {
  await mkdir(dirname(file), { recursive: true });
  const temporaryFile = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(temporaryFile, file);
}

export class LiquidFlowV2BinanceSignalSettings {
  constructor({ file } = {}) {
    if (!file) throw new Error('file is required');
    this.file = file;
    this.state = {
      version: LIQUID_FLOW_V2_BINANCE_SIGNAL_SETTINGS_VERSION,
      signals: {},
      updatedAt: null,
    };
    this.loaded = false;
    this.inflight = null;
  }

  async init() {
    if (this.loaded) return this.snapshot();
    if (!this.inflight) {
      this.inflight = (async () => {
        let saved = null;
        try {
          saved = JSON.parse(await readFile(this.file, 'utf8'));
        } catch {}
        const signals = {};
        for (const [rawKey, raw] of Object.entries(saved?.signals ?? {})) {
          const key = safeLabelKey(rawKey);
          const marginUsdt = finiteMargin(raw?.marginUsdt);
          if (!key || typeof raw?.enabled !== 'boolean' || marginUsdt == null) continue;
          signals[key] = {
            enabled: raw.enabled,
            marginUsdt,
            updatedAt: raw.updatedAt ?? null,
          };
        }
        this.state = {
          version: LIQUID_FLOW_V2_BINANCE_SIGNAL_SETTINGS_VERSION,
          signals,
          updatedAt: saved?.updatedAt ?? null,
        };
        this.loaded = true;
        return this.snapshot();
      })().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  override(labelKey) {
    const key = safeLabelKey(labelKey);
    const row = key ? this.state.signals[key] : null;
    return row ? { ...row } : null;
  }

  async update({ labelKey, enabled, marginUsdt } = {}) {
    await this.init();
    const key = safeLabelKey(labelKey);
    const margin = finiteMargin(marginUsdt);
    if (!key) throw new Error('labelKey không hợp lệ.');
    if (typeof enabled !== 'boolean') throw new Error('enabled boolean là bắt buộc.');
    if (margin == null) throw new Error('marginUsdt phải trong khoảng 0.01..10000 USDT.');
    const updatedAt = new Date().toISOString();
    const nextState = {
      version: LIQUID_FLOW_V2_BINANCE_SIGNAL_SETTINGS_VERSION,
      signals: {
        ...this.state.signals,
        [key]: { enabled, marginUsdt: margin, updatedAt },
      },
      updatedAt,
    };
    await writeJsonAtomic(this.file, nextState);
    this.state = nextState;
    return { labelKey: key, ...this.state.signals[key], source: 'PERSISTED' };
  }

  snapshot() {
    return {
      version: LIQUID_FLOW_V2_BINANCE_SIGNAL_SETTINGS_VERSION,
      signals: Object.fromEntries(
        Object.entries(this.state.signals).map(([key, value]) => [key, { ...value }]),
      ),
      updatedAt: this.state.updatedAt,
    };
  }
}
