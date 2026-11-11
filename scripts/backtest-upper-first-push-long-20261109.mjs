import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { evaluateSweepPumpPhase, validSweepPumpPhase } from '../src/heatmapSweepPumpPhase.js';

const partial = process.argv.includes('--partial');
const FULL_DIR = 'data/research/upper-first-push-long-20261109';
const DIR = partial ? 'data/research/upper-partial-first-push-long-20261109' : FULL_DIR;
const MIN = 60000, STEP = 5 * MIN, HOLD = 8 * 60 * MIN, DAY = 24 * 60 * MIN;
const read = async path => JSON.parse(await fs.readFile(path, 'utf8'));
const write = async (name, value) => fs.writeFile(DIR + '/' + name, JSON.stringify(value, null, 2));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(DIR + '/raw', { recursive: true });

let manifest;
try {
  manifest = await read(DIR + '/manifest.json');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const full = partial ? await read(FULL_DIR + '/manifest.json') : null;
  const cutoff = full?.cutoff ?? Math.floor(Date.now() / STEP) * STEP;
  const snapshots = partial ? Object.keys(full.inputs).map(name => [name, FULL_DIR + '/' + name]) : [
    ['archived-sweeps.json', 'data/research/upper-partial-long-bnt-20261108/sweeps-frozen.json'],
    ['current-sweeps.json', 'data/heatmap-sweep-watch.json'],
  ];
  const inputs = {};
  for (const [destination, source] of snapshots) {
    const bytes = await fs.readFile(source);
    await fs.writeFile(DIR + '/' + destination, bytes);
    inputs[destination] = { source, sha256: hash(bytes) };
  }
  manifest = {
    version: partial ? 'UPPER_PARTIAL_FIRST_PUSH_LONG_RESEARCH_V1_20261109' : 'UPPER_FULL_FIRST_PUSH_LONG_RESEARCH_V1_20261109',
    frozenAt: Date.now(), cutoff, inputs,
    phaseCodeHash: hash(await fs.readFile('src/heatmapSweepPumpPhase.js')),
    cohort: partial ? 'Confirmed SENT UPPER_CLUSTER_SWEPT with a recorded, valid phase. This is the exact quoted Discord title. Compare all recorded phases.'
      : 'Confirmed SENT ALL_TRACKED_UPPER_SWEPT with frozen pre-event zones. Deduplicate exact event and cohort.',
    timing: 'After max(sweep, observation, webhook response), first 5m open strictly after that time + 5m. Sensitivity without extra 5m.',
    rules: { leverage: 3, tpRoePct: 5, slRoePct: 20, holdMs: HOLD, costsNotionalPct: 0.14, stressNotionalPct: 0.30 },
    grouping: 'Stored phase is authoritative. Reconstructed phases are separate evidence, use only candles closed before the sweep. Show same-symbol 8h dedup and rebound comparison.',
    candleExecution: '5m contract OHLC for both legs, adverse open gap for SL, SL first on ambiguity. 1m check on native FIRST_PUSH. Historical funding. Full 8h available before inclusion.',
  };
  await write('manifest.json', manifest);
}
assert.equal(manifest.phaseCodeHash, hash(await fs.readFile('src/heatmapSweepPumpPhase.js')));
const union = new Map();
for (const [file, info] of Object.entries(manifest.inputs)) {
  const bytes = await fs.readFile(DIR + '/' + file);
  assert.equal(hash(bytes), info.sha256);
  for (const e of JSON.parse(bytes).history) union.set(e.id, e);
}

const cohorts = new Set(), events = [];
const native = e => {
  const p = e.delivery?.pumpPhase;
  return validSweepPumpPhase(e, p) && p.evaluatedAt <= e.delivery.at ? p : null;
};
for (const e of [...union.values()].sort((a, b) => a.at - b.at)) {
  if (e.kind !== (partial ? 'UPPER_CLUSTER_SWEPT' : 'ALL_TRACKED_UPPER_SWEPT') || e.direction !== 'UPPER'
      || e.delivery?.status !== 'SENT' || e.delivery.httpStatus < 200 || e.delivery.httpStatus >= 300
      || !Number.isFinite(e.delivery.httpStatus) || !Number.isFinite(e.delivery.at) || e.delivery.at < e.at
      || !e.cohortId || cohorts.has(e.cohortId) || e.totalCount <= 0
      || (partial ? !(e.clearedCount >= 1 && e.clearedCount < e.totalCount && native(e)) : e.clearedCount !== e.totalCount)
      || !Array.isArray(e.zones) || e.zones.length !== e.totalCount || !(e.zonesAsOf <= e.armedAt && e.armedAt <= e.at)
      || e.zones.filter(z => z.cleared).length !== e.clearedCount
      || e.zones.some(z => z.cleared && (!(z.high > 0) || z.high > e.markPrice || !(z.clearedAt <= e.at)))) continue;
  const availableAt = Math.max(e.at, e.observedAt ?? e.at, e.delivery.at);
  if (availableAt > manifest.cutoff) continue;
  cohorts.add(e.cohortId);
  const fastAt = (Math.floor(availableAt / STEP) + 1) * STEP;
  events.push({ ...e, availableAt, fastAt, entryAt: fastAt + STEP });
}
await write('events.json', events);
const mature = events.filter(e => e.entryAt + HOLD <= manifest.cutoff);
const pending = events.filter(e => e.entryAt + HOLD > manifest.cutoff);
console.log(JSON.stringify({ stage: 'frozen', retainedUnique: union.size, alerts: events.length, mature: mature.length,
  nativeFirst: mature.filter(e => native(e)?.state === 'FIRST_PUSH').length, pending: pending.length }));

const perSymbol = new Map();
for (const e of mature) {
  if (!perSymbol.has(e.symbol)) perSymbol.set(e.symbol, []);
  perSymbol.get(e.symbol).push(e);
}
let requests = 0, nextAt = 0;
async function publicJson(endpoint, params) {
  const delay = Math.max(0, nextAt - Date.now());
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  nextAt = Date.now() + 1000;
  requests++;
  const response = await fetch('https://fapi.binance.com' + endpoint + '?' + new URLSearchParams(params),
    { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw Error('BINANCE_' + response.status + '_' + endpoint);
  const weight = Number(response.headers.get('x-mbx-used-weight-1m'));
  if (weight > 950) nextAt = Math.ceil(Date.now() / MIN) * MIN + 500;
  const rows = await response.json();
  assert.ok(Array.isArray(rows));
  return rows;
}
function validBar(row, step) {
  return Array.isArray(row) && Number.isFinite(+row[0]) && +row[0] % step === 0 && +row[6] === +row[0] + step - 1
    && [1, 2, 3, 4].every(i => Number.isFinite(+row[i]) && +row[i] > 0)
    && +row[2] >= Math.max(+row[1], +row[4]) && +row[3] <= Math.min(+row[1], +row[4]);
}
function rangesNeeded(map, times, step) {
  const runs = [];
  for (const t of [...times].sort((a, b) => a - b)) {
    if (map.has(t)) continue;
    const last = runs.at(-1);
    if (last && last[1] === t && (last[1] - last[0]) / step < 499) last[1] += step;
    else runs.push([t, t + step]);
  }
  return runs;
}
const files = {};
const cacheDirs = ['data/heatmap-market-raw-cache', 'data/research/upper-partial-long-bnt-20261108/raw',
  'data/research/short-squeeze-volume-20261107/raw', 'data/research/sideways-allshort-20261107/raw',
  'data/research/dominance-model13-20261106/raw'];
let completed = 0;
const ordered = [...perSymbol].sort((a, b) =>
  Number(b[1].some(e => native(e)?.state === 'FIRST_PUSH')) - Number(a[1].some(e => native(e)?.state === 'FIRST_PUSH')));
for (const [symbol, list] of ordered) {
  const name = 'raw/' + encodeURIComponent(symbol) + '.json';
  try {
    const bytes = await fs.readFile(DIR + '/' + name);
    if (JSON.parse(bytes).cutoff === manifest.cutoff) {
      files[symbol] = hash(bytes);
      completed++;
      continue;
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }

  const requiredMark = new Set(), requiredPrice = new Set(), requiredMinute = new Set();
  for (const e of list) {
    const closedEnd = Math.floor(e.at / STEP) * STEP;
    if (!partial) for (let t = closedEnd - DAY; t < closedEnd; t += STEP) requiredMark.add(t);
    for (let t = e.fastAt - STEP; t < e.entryAt + HOLD; t += STEP) requiredPrice.add(t);
    if (native(e)?.state === 'FIRST_PUSH') {
      for (let t = e.fastAt; t < e.entryAt + HOLD; t += MIN) requiredMinute.add(t);
    }
  }
  const mark = new Map(), price = new Map(), minute = new Map();
  for (const [i, dir] of cacheDirs.entries()) {
    try {
      const raw = await read(dir + '/' + (i === 0 ? symbol + '.json' : encodeURIComponent(symbol) + '-data.json'));
      if (raw.symbol && raw.symbol !== symbol) continue;
      for (const [rows, target, required] of [[raw.mark, mark, requiredMark], [raw.price, price, requiredPrice]]) {
        for (const row of rows ?? []) {
          if (required.has(+row[0]) && validBar(row, STEP) && !target.has(+row[0])) target.set(+row[0], row);
        }
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const [map, times, step, endpoint, interval] of [
    [mark, requiredMark, STEP, '/fapi/v1/markPriceKlines', '5m'],
    [price, requiredPrice, STEP, '/fapi/v1/klines', '5m'],
    [minute, requiredMinute, MIN, '/fapi/v1/klines', '1m'],
  ]) {
    for (const [startTime, end] of rangesNeeded(map, times, step)) {
      const data = await publicJson(endpoint, { symbol, interval, startTime, endTime: end - 1, limit: (end - startTime) / step });
      for (const row of data) if (times.has(+row[0]) && validBar(row, step)) map.set(+row[0], row);
    }
  }
  const funding = await publicJson('/fapi/v1/fundingRate', {
    symbol, startTime: Math.min(...list.map(e => e.fastAt)),
    endTime: Math.max(...list.map(e => e.entryAt + HOLD)) - 1, limit: 1000,
  });
  assert.ok(funding.length < 1000 && funding.every(f => f.symbol === symbol && Number.isFinite(+f.fundingRate) && Number.isFinite(+f.fundingTime)));
  const sorted = map => [...map.values()].sort((a, b) => +a[0] - +b[0]);
  const value = { symbol, cutoff: manifest.cutoff, mark: sorted(mark), price: sorted(price), minute: sorted(minute),
    funding: [...new Map(funding.map(f => [String(f.fundingTime) + ':' + (f.rateType ?? 'Regular'), f])).values()] };
  await write(name, value);
  files[symbol] = hash(await fs.readFile(DIR + '/' + name));
  completed++;
  if (completed <= 2 || completed % 10 === 0) console.log(JSON.stringify({ stage: 'fetch', completed, symbols: ordered.length, requests }));
}
await write('fetch-complete.json', { files, requests });

function run(bars, funding, entryAt, step, tpRoePct = 5) {
  const path = bars.filter(b => +b[0] >= entryAt && +b[0] < entryAt + HOLD);
  if (path.length !== HOLD / step || !path.every((b, i) => +b[0] === entryAt + i * step)) return null;
  const entry = +path[0][1], tp = entry * (1 + tpRoePct / 300), sl = entry * (1 - 20 / 300);
  let exit = +path.at(-1)[4], exitAt = +path.at(-1)[6], reason = 'TIME', ambiguous = false;
  for (const b of path) {
    const [time, open, high, low] = b.map(Number);
    if (open <= sl) { exit = open; exitAt = time; reason = 'SL_GAP'; break; }
    if (open >= tp) { exit = tp; exitAt = time; reason = 'TP'; break; }
    if (low <= sl || high >= tp) {
      const hitStop = low <= sl;
      exit = hitStop ? sl : tp;
      exitAt = +b[6];
      reason = hitStop ? 'SL' : 'TP';
      ambiguous = hitStop && high >= tp;
      break;
    }
  }
  const paid = funding.filter(f => +f.fundingTime > entryAt && +f.fundingTime <= exitAt);
  const fundingPct = paid.reduce((sum, f) => sum + +f.fundingRate * (+f.markPrice > 0 ? +f.markPrice / entry : 1) * 100, 0);
  const grossRoe = (exit / entry - 1) * 300;
  return { entryAt, entry, exitAt, exit, tp, sl, reason, ambiguous, grossRoe, fundingPct, fundingRows: paid.length,
    netRoe: grossRoe - 3 * (0.14 + fundingPct), stressRoe: grossRoe - 3 * (0.30 + fundingPct),
    final8hPct: (+path.at(-1)[4] / entry - 1) * 100,
    maxUp8hPct: (Math.max(...path.map(b => +b[2])) / entry - 1) * 100,
    maxDown8hPct: (Math.min(...path.map(b => +b[3])) / entry - 1) * 100 };
}
const records = [];
for (const e of mature) {
  const name = DIR + '/raw/' + encodeURIComponent(e.symbol) + '.json';
  const bytes = await fs.readFile(name);
  assert.equal(hash(bytes), files[e.symbol]);
  const raw = JSON.parse(bytes), pre = raw.mark.filter(b => +b[6] < e.at);
  const replay = partial ? null : evaluateSweepPumpPhase({ event: e, raw: { symbol: e.symbol, savedAt: e.at, mark: pre }, now: e.at });
  if (replay) assert.ok(validSweepPumpPhase(e, replay));
  const n = native(e);
  const upperEdge = Math.max(...e.zones.filter(z => z.cleared).map(z => z.high));
  const entryPrevious = raw.price.find(b => +b[0] === e.entryAt - STEP);
  records.push({ id: e.id, symbol: e.symbol, at: e.at, availableAt: e.availableAt, native: n?.state ?? null,
    replay: replay?.state ?? null, phase: n?.state ?? replay?.state, phaseSource: n ? 'RECORDED' : 'REPLAY_MARK',
    replayProof: replay, recordedProof: n, upperEdge,
    heldAbove: entryPrevious ? +entryPrevious[4] >= upperEdge : null,
    delayed: run(raw.price, raw.funding, e.entryAt, STEP), fast: run(raw.price, raw.funding, e.fastAt, STEP),
    tp10: run(raw.price, raw.funding, e.entryAt, STEP, 10),
    minute: n?.state === 'FIRST_PUSH' ? run(raw.minute, raw.funding, e.entryAt, MIN) : null });
}
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
function stats(rows, key = 'delayed') {
  const ok = rows.filter(r => r[key]), trades = ok.map(r => r[key]);
  const wins = trades.filter(r => r.netRoe > 0).length;
  return { alerts: rows.length, n: ok.length, coins: new Set(ok.map(r => r.symbol)).size, wins,
    winPct: ok.length ? wins / ok.length * 100 : null, meanRoe: mean(trades.map(r => r.netRoe)),
    stressMeanRoe: mean(trades.map(r => r.stressRoe)), tp: trades.filter(r => r.reason === 'TP').length,
    sl: trades.filter(r => r.reason.startsWith('SL')).length, time: trades.filter(r => r.reason === 'TIME').length,
    ambiguous: trades.filter(r => r.ambiguous).length, positive8h: trades.filter(r => r.final8hPct > 0).length,
    worstRoe: trades.length ? Math.min(...trades.map(r => r.netRoe)) : null };
}
const first = records.filter(r => r.phase === 'FIRST_PUSH');
const exact = records.filter(r => r.native === 'FIRST_PUSH');
function dedup(rows) {
  const last = new Map();
  return rows.filter(r => {
    if (r.at - (last.get(r.symbol) ?? -Infinity) < HOLD) return false;
    last.set(r.symbol, r.at);
    return true;
  });
}
const groups = {
  ALL: records,
  FIRST_RECORDED: exact,
  FIRST_REPLAY_ONLY: first.filter(r => r.phaseSource === 'REPLAY_MARK'),
  FIRST_ALL: first,
  FIRST_ONE_PER_8H: dedup(first),
  FIRST_HELD_ABOVE: first.filter(r => r.heldAbove === true),
  REBOUND: records.filter(r => r.phase.startsWith('REBOUND_')),
  UNKNOWN: records.filter(r => r.phase === 'UNKNOWN'),
};
const results = Object.fromEntries(Object.entries(groups).map(([k, rows]) => [
  k, { delayed: stats(rows), fast: stats(rows, 'fast'), tp10: stats(rows, 'tp10'), ...(k === 'FIRST_RECORDED' ? { minute: stats(rows, 'minute') } : {}) },
]));
const counts = { retainedUnique: union.size, alerts: events.length, mature: mature.length, pending: pending.length,
  priced: records.filter(r => r.delayed).length, nativePhase: records.filter(r => r.native).length,
  knownPhasePairs: records.filter(r => r.native && r.native !== 'UNKNOWN' && r.replay && r.replay !== 'UNKNOWN').length,
  phaseDisagreements: records.filter(r => r.native && r.native !== 'UNKNOWN' && r.replay && r.replay !== 'UNKNOWN' && r.native !== r.replay).map(r => ({ symbol: r.symbol, at: r.at, native: r.native, replay: r.replay })),
};
const output = { manifest, counts, groups: results, pending: pending.map(e => ({ id: e.id, symbol: e.symbol, at: e.at, maturesAt: e.entryAt + HOLD, phase: native(e)?.state ?? null })), records };
await write('results.json', output);
console.log(JSON.stringify({ stage: 'complete', counts, groups: results, exact: exact.map(({ symbol, at, delayed, fast, minute, replay }) => ({ symbol, at, delayed, fast, minute, replay })) }));
