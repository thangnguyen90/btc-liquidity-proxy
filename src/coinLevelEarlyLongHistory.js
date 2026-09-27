import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { COIN_LEVEL_EARLY_LONG_WATCH_VERSION } from './coinLevelEarlyLongWatch.js';

export const COIN_LEVEL_EARLY_LONG_HISTORY_VERSION =
  'COIN_LEVEL_EARLY_LONG_HISTORY_V2_POLICY_20260922';

function vietnamDayKey(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
}

function eventId(watch) {
  return `${watch?.symbol ?? ''}:LONG:${Number(watch?.observedAt) || 0}`;
}

export class CoinLevelEarlyLongHistory {
  constructor({ file, now = () => Date.now(), maxEvents = 500 } = {}) {
    Object.assign(this, { file, now, maxEvents });
    this.state = null;
  }

  async load() {
    if (this.state) return;
    let state;
    try { state = JSON.parse(await readFile(this.file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Coin Level early LONG history unreadable');
      state = { events: [] };
    }
    if (!Array.isArray(state.events)) state.events = [];
    this.state = state;
  }

  async save() {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(this.state, null, 2));
    await rename(`${this.file}.tmp`, this.file);
  }

  async record(watches = [], at = this.now()) {
    await this.load();
    const dayKey = vietnamDayKey(at);
    let changed = false;
    if (this.state.dayKey !== dayKey) {
      this.state = { version: COIN_LEVEL_EARLY_LONG_HISTORY_VERSION, dayKey, events: [] };
      changed = true;
    }
    const compatibleEvents = this.state.events
      .filter((event) => event.version === COIN_LEVEL_EARLY_LONG_WATCH_VERSION);
    if (compatibleEvents.length !== this.state.events.length) {
      this.state.events = compatibleEvents;
      changed = true;
    }
    const known = new Set(this.state.events.map((event) => event.id));
    for (const watch of Array.isArray(watches) ? watches : []) {
      if (watch?.side !== 'LONG' || watch?.watchOnly !== true || watch?.binanceEligible !== false) continue;
      if (watch.version !== COIN_LEVEL_EARLY_LONG_WATCH_VERSION) continue;
      if (vietnamDayKey(watch.observedAt) !== dayKey) continue;
      const id = eventId(watch);
      if (known.has(id)) continue;
      known.add(id);
      this.state.events.push({ ...watch, id, recordedAt: at });
      changed = true;
    }
    this.state.version = COIN_LEVEL_EARLY_LONG_HISTORY_VERSION;
    this.state.events = this.state.events
      .sort((left, right) => Number(left.observedAt) - Number(right.observedAt))
      .slice(-this.maxEvents);
    if (changed) await this.save();
    return this.list(at);
  }

  list(at = this.now()) {
    const dayKey = vietnamDayKey(at);
    if (!this.state || this.state.dayKey !== dayKey) return [];
    return [...this.state.events].sort((left, right) => Number(right.observedAt) - Number(left.observedAt));
  }
}
