import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export const AI_SIGNAL_REVIEW_VERSION = 'AI_SIGNAL_REVIEW_V1_CAUSAL_ENTRY_COMPARISON_20261003';
export const BAR_MS = 15 * 60_000;
const HOUR = 60 * 60_000;
const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const positive = value => number(value) > 0 ? Number(value) : null;
const meanReturn = (side, entry, exit) => (side === 'SHORT' ? -1 : 1) * (exit - entry) / entry * 100;

export function normalizeReviewSignals(journal = [], records = [], archived = []) {
  const signals = new Map();
  for (const row of archived) if (row?.eventId) signals.set(row.eventId, row);
  for (const record of records) {
    if (!record.sent || !positive(record.sentAt) || !record.id) continue;
    if (signals.has(record.id)) continue;
    // Legacy state.sample used to be overwritten on repeated evaluations.
    // Only the immutable sent journal can prove the score/zone at notification.
    signals.set(record.id, {
      eventId: record.id, symbol: record.symbol, side: record.side, verdict: record.verdict,
      sentAt: Number(record.sentAt), sourceAt: number(String(record.id).split('|').at(-1)),
      strength: null, strengthBand: 'UNKNOWN', historyQuality: 'LEGACY_NO_SNAPSHOT',
    });
  }
  for (const sample of journal) {
    if (!sample?.eventId || !positive(sample.sentAt)) continue;
    const previous = signals.get(sample.eventId);
    if (previous?.historyQuality === 'SENT_SNAPSHOT') continue;
    signals.set(sample.eventId, { ...sample, historyQuality: 'SENT_SNAPSHOT' });
  }
  return [...signals.values()].filter(row => /^[\p{L}\p{N}_-]+USDT$/u.test(row.symbol ?? '')
    && ['LONG', 'SHORT'].includes(row.side) && positive(row.sentAt))
    .sort((a, b) => a.sentAt - b.sentAt || a.eventId.localeCompare(b.eventId));
}

export function normalizeReviewBars(rows) {
  return [...new Map((rows ?? []).map(row => {
    const bar = Array.isArray(row)
      ? { time: number(row[0]), open: positive(row[1]), high: positive(row[2]), low: positive(row[3]), close: positive(row[4]) }
      : row;
    return [bar.time, bar];
  }).filter(([, bar]) => Number.isFinite(bar.time) && bar.time % BAR_MS === 0
    && [bar.open, bar.high, bar.low, bar.close].every(value => positive(value))
    && bar.low <= Math.min(bar.open, bar.close) && bar.high >= Math.max(bar.open, bar.close))).values()]
    .sort((a, b) => a.time - b.time);
}

function fullWindow(byTime, start, count, now) {
  if (start + count * BAR_MS > now) return { state: 'PENDING', bars: [] };
  const bars = Array.from({ length: count }, (_, i) => byTime.get(start + i * BAR_MS));
  return bars.every(Boolean) ? { state: 'READY', bars } : { state: 'MISSING_CANDLES', bars: [] };
}

export function btcContextAt(rows, sentAt) {
  const bars = new Map(rows.filter(row => row.time + BAR_MS <= sentAt).map(row => [row.time, row]));
  const closeAt = Math.floor(sentAt / BAR_MS) * BAR_MS;
  const last = bars.get(closeAt - BAR_MS);
  const pct = count => {
    const previous = bars.get(closeAt - BAR_MS - count * BAR_MS);
    // Require every candle, rather than silently crossing a market-data gap.
    const continuous = Array.from({ length: count + 1 }, (_, i) => bars.has(closeAt - BAR_MS - i * BAR_MS)).every(Boolean);
    return last && previous && continuous ? (last.close / previous.close - 1) * 100 : null;
  };
  const ret1h = pct(4), ret4h = pct(16);
  return {
    source: 'RECONSTRUCTED_CLOSED_15M', closedAt: last ? closeAt : null,
    price: last?.close ?? null, return15mPct: pct(1), return1hPct: ret1h, return4hPct: ret4h,
    momentum: ret1h == null ? 'UNKNOWN' : ret1h > 0.1 ? 'UP' : ret1h < -0.1 ? 'DOWN' : 'FLAT',
  };
}

function outcome(side, price, entryIndex, bars, touch = false) {
  const exit = bars.at(-1).close;
  // We cannot know whether a wick preceded a zone touch in the same candle.
  const after = bars.slice(entryIndex + (touch ? 1 : 0));
  const favorable = after.map(bar => meanReturn(side, price, side === 'LONG' ? bar.high : bar.low));
  const adverse = after.map(bar => -meanReturn(side, price, side === 'LONG' ? bar.low : bar.high));
  return {
    state: 'READY', entry: price, entryAt: bars[entryIndex].time,
    touchWindowEnd: touch ? bars[entryIndex].time + BAR_MS : null,
    exit, exitAt: bars.at(-1).time + BAR_MS,
    grossPct: meanReturn(side, price, exit),
    mfePct: after.length ? Math.max(0, ...favorable) : null,
    maePct: after.length ? Math.max(0, ...adverse) : null,
    excursionExcludesTouchBar: touch,
  };
}

export function evaluateReviewSignal(sample, coinRows, btcRows, now = Date.now()) {
  const anchorAt = Math.ceil(sample.sentAt / BAR_MS) * BAR_MS;
  const byTime = new Map(coinRows.map(row => [row.time, row]));
  const start = byTime.get(anchorAt);
  const low = positive(sample.price?.entryLow), high = positive(sample.price?.entryHigh);
  const mid = positive(sample.price?.entryMid);
  const validZone = low != null && high != null && low <= high;
  const zoneMid = validZone ? (mid >= low && mid <= high ? mid : (low + high) / 2) : null;
  const pullback = start ? start.open * (sample.side === 'LONG' ? 0.995 : 1.005) : null;
  const horizons = {};
  for (const hours of [1, 4, 24]) {
    const window = fullWindow(byTime, anchorAt, hours * 4, now);
    const common = { state: window.state };
    if (window.state !== 'READY') {
      horizons[hours] = { market: common, zone: zoneMid ? common : { state: 'NO_ZONE' }, pullback: common };
      continue;
    }
    const bars = window.bars;
    const touch = price => {
      if (!(price > 0)) return { state: 'NO_ZONE' };
      const index = bars.slice(0, Math.min(16, bars.length)).findIndex(bar => bar.low <= price && bar.high >= price);
      if (index < 0) return { state: 'NOT_TOUCHED', entry: price };
      return { ...outcome(sample.side, price, index, bars, true), waitMinutes: index * 15 };
    };
    horizons[hours] = {
      market: outcome(sample.side, bars[0].open, 0, bars),
      zone: touch(zoneMid), pullback: touch(pullback),
    };
  }
  const btc = btcContextAt(btcRows, sample.sentAt);
  return {
    ...sample, anchorAt, hourVn: new Date(sample.sentAt + 7 * HOUR).getUTCHours(),
    dayVn: new Date(sample.sentAt + 7 * HOUR).toISOString().slice(0, 10),
    zoneMid, pullback, btcReconstructed: btc,
    btcAlignment: btc.momentum === 'UNKNOWN' ? 'UNKNOWN' : btc.momentum === 'FLAT' ? 'FLAT'
      : (sample.side === 'LONG' ? btc.momentum === 'UP' : btc.momentum === 'DOWN') ? 'ALIGNED' : 'OPPOSED',
    horizons,
  };
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function saveJson(path, value) {
  await writeFile(path + '.tmp', JSON.stringify(value), 'utf8');
  await rename(path + '.tmp', path);
}

export class LocalAiSignalReview {
  constructor({ dataDir, getCandles, now = () => Date.now(), onCompleted = null }) {
    this.dataDir = dataDir;
    this.directory = join(dataDir, 'ai-signal-review');
    this.getCandles = getCandles;
    this.now = now;
    this.onCompleted = onCompleted;
    this.report = null;
    this.job = null;
    this.progress = { running: false, done: 0, total: 0, error: null };
  }

  async snapshot() {
    if (!this.report) this.report = await readJson(join(this.directory, 'report.json'), null);
    return { version: AI_SIGNAL_REVIEW_VERSION, observeOnly: true, binanceEligible: false,
      progress: this.progress, report: this.report };
  }

  refresh() {
    if (this.job || (this.progress.finishedAt && this.now() - this.progress.finishedAt < 60_000)) return;
    this.progress = { running: true, done: 0, total: 0, startedAt: this.now(), error: null };
    this.job = this.rebuild().catch(error => { this.progress.error = error.message; })
      .finally(() => { this.progress.running = false; this.progress.finishedAt = this.now(); this.job = null; });
  }

  async candles(symbol, start, end) {
    const file = join(this.directory, 'candles', encodeURIComponent(symbol) + '.json');
    const cached = normalizeReviewBars(await readJson(file, []));
    const map = new Map(cached.map(row => [row.time, row]));
    let cursor = start;
    while (cursor < end) {
      if (map.has(cursor)) { cursor += BAR_MS; continue; }
      const chunkEnd = Math.min(end, cursor + 499 * BAR_MS);
      const raw = await this.getCandles(symbol, cursor, chunkEnd - 1);
      const bars = normalizeReviewBars(raw).filter(row => row.time >= cursor && row.time < chunkEnd
        && row.time + BAR_MS <= this.now());
      for (const bar of bars) map.set(bar.time, bar);
      cursor = chunkEnd;
      await saveJson(file, [...map.values()].sort((a, b) => a.time - b.time));
    }
    return [...map.values()].sort((a, b) => a.time - b.time);
  }

  async rebuild() {
    const now = this.now();
    await mkdir(join(this.directory, 'candles'), { recursive: true });
    const state = await readJson(join(this.dataDir, 'local-ai-trend-discord.json'), {});
    const archive = await readJson(join(this.directory, 'events.json'), []);
    let journalText = '';
    try { journalText = await readFile(join(this.dataDir, 'local-ai-trend-discord-history.ndjson'), 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    let malformedLines = 0;
    const journal = journalText.split('\n').filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line)]; } catch { malformedLines++; return []; }
    });
    const all = normalizeReviewSignals(journal, Object.values(state.records ?? {}), archive);
    await saveJson(join(this.directory, 'events.json'), all);
    const signals = all.filter(row => row.sentAt >= now - 30 * 24 * HOUR && row.sentAt <= now).slice(-20_000);
    const groups = new Map();
    for (const signal of signals) {
      if (!groups.has(signal.symbol)) groups.set(signal.symbol, []);
      groups.get(signal.symbol).push(signal);
    }
    this.progress.total = groups.size;
    const endNow = Math.floor(now / BAR_MS) * BAR_MS;
    const first = signals[0]?.sentAt ?? now;
    let btcRows = [], btcError = null;
    try { btcRows = await this.candles('BTCUSDT', Math.floor(first / BAR_MS) * BAR_MS - 17 * BAR_MS, endNow); }
    catch (error) { btcError = error.message; }
    const rows = [], errors = [];
    const publish = async partial => {
      const sorted = [...rows].sort((a, b) => a.sentAt - b.sentAt || a.eventId.localeCompare(b.eventId));
      const independent = new Map();
      for (const row of sorted) {
        const key = row.symbol + '|' + row.side;
        row.independent4h = row.sentAt - (independent.get(key) ?? -Infinity) >= 4 * HOUR;
        if (row.independent4h) independent.set(key, row.sentAt);
      }
      const report = {
        version: AI_SIGNAL_REVIEW_VERSION, generatedAt: now, firstAt: signals[0]?.sentAt ?? null,
        lastAt: signals.at(-1)?.sentAt ?? null, archiveCount: all.length,
        partial, plannedSignals: signals.length, processedSymbols: this.progress.done, totalSymbols: groups.size,
        fullSnapshotCount: sorted.filter(row => row.historyQuality === 'SENT_SNAPSHOT').length,
        malformedLines, btcError, errors: [...errors], rows: sorted,
        method: { candle: '15m', source: 'BINANCE_FUTURES_KLINES', timezone: 'Asia/Ho_Chi_Minh',
          sampleScope: 'SENT_DISCORD_ONLY_LAST_30_DAYS', maxEvents: 20_000,
          entry: 'NEXT_15M_OPEN_AFTER_SENT', zoneWaitHours: 4, pullbackPct: 0.5,
          horizonsHours: [1, 4, 24], fixedExitFromSignal: true,
          shortReturn: '(entry-exit)/entry', defaultRoundTripCostPct: 0.12,
          leverage: null, fundingIncluded: false, actualBinanceFills: false },
      };
      await saveJson(join(this.directory, 'report.json'), report);
      this.report = report;
      return report;
    };
    for (const [symbol, samples] of groups) {
      const start = Math.ceil(samples[0].sentAt / BAR_MS) * BAR_MS;
      const end = Math.min(endNow, Math.ceil(samples.at(-1).sentAt / BAR_MS) * BAR_MS + 24 * HOUR);
      let candles = [];
      try { candles = await this.candles(symbol, start, end); }
      catch (error) {
        errors.push({ symbol, error: error.message });
        candles = normalizeReviewBars(await readJson(join(this.directory, 'candles', encodeURIComponent(symbol) + '.json'), []));
      }
      for (const sample of samples) rows.push(evaluateReviewSignal(sample, candles, btcRows, now));
      this.progress.done++;
      this.progress.symbol = symbol;
      if (this.progress.done % 10 === 0) await publish(true);
      // Report partial progress without treating failed data as a losing trade.
      if (errors.length >= 5 && !candles.length) break;
    }
    const included = new Set(rows.map(row => row.eventId));
    for (const sample of signals) if (!included.has(sample.eventId)) rows.push(evaluateReviewSignal(sample, [], btcRows, now));
    const report = await publish(false);
    if (typeof this.onCompleted === 'function') {
      try { await this.onCompleted(report); }
      catch (error) { console.warn(`[AiSignalReview] completion hook failed: ${error.message}`); }
    }
    return report;
  }
}
