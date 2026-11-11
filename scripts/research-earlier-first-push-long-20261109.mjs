import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { evaluateSweepPumpPhase, validSweepPumpPhase } from '../src/heatmapSweepPumpPhase.js';

const MIN = 60000, STEP = 5 * MIN, DAY = 1440 * MIN, HOLD = 480 * MIN;
const SOURCE = 'data/research/upper-partial-first-push-long-20261109';
const OUT = 'data/research/upper-first-push-earlier-20261109';
const THRESHOLDS = [0.3, 0.6, 1];
const floor = (time, step) => Math.floor(time / step) * step;
const next = (time, step) => floor(time, step) + step;
const read = async path => JSON.parse(await fs.readFile(path, 'utf8'));
const save = (path, data) => fs.writeFile(path, JSON.stringify(data, null, 2));
const digest = async path => createHash('sha256').update(await fs.readFile(path)).digest('hex');
const inRange = (start, end, step) => Array.from({ length: Math.max(0, (end - start) / step) }, (_, i) => start + i * step);
const [base, events, fetched] = await Promise.all(['results.json', 'events.json', 'fetch-complete.json'].map(f => read(SOURCE + '/' + f)));
const priorById = new Map(base.records.filter(r => r.native === 'FIRST_PUSH').map(r => [r.id, r]));
const sample = events.filter(e => priorById.has(e.id));
assert.equal(sample.length, 17);
assert.equal(priorById.size, sample.length);
const symbols = [...new Set(sample.map(e => e.symbol))];
await fs.mkdir(OUT + '/raw', { recursive: true });
const inputs = Object.fromEntries(await Promise.all(['events.json', 'results.json', 'fetch-complete.json'].map(async f => [f, await digest(SOURCE + '/' + f)])));
const manifest = { version: 'UPPER_PARTIAL_FIRST_PUSH_EARLY_RESEARCH_V1_20261109', inputs, count: sample.length,
  phaseHash: await digest('src/heatmapSweepPumpPhase.js'), thresholdsPct: THRESHOLDS,
  forward: { leverage: 3, tpRoe: 5, slRoe: 20, horizonMs: HOLD, costsNotionalPct: 0.14 },
  pre: 'Retrospective coverage conditional on recorded successful sweeps. Use nearest frozen band, arm mark and subsequent closed 1m MARK bars, stop on first touch.',
  confirm: 'First of five complete contract 1m closes at or above swept upper edge after alert availability, enter at following minute open.',
};
const manifestPath = OUT + '/manifest.json';
try { assert.deepEqual(await read(manifestPath), manifest); }
catch (error) { if (error.code !== 'ENOENT') throw error; await save(manifestPath, manifest); }

let nextRequest = 0, requests = 0;
async function market(path, params) {
  if (nextRequest > Date.now()) await new Promise(resolve => setTimeout(resolve, nextRequest - Date.now()));
  nextRequest = Date.now() + 1000;
  requests++;
  const response = await fetch('https://fapi.binance.com/fapi/v1/' + path + '?' + new URLSearchParams(params), {
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Error('BINANCE_' + response.status + '_' + path + '_' + params.symbol);
  if (Number(response.headers.get('x-mbx-used-weight-1m')) > 950) nextRequest = next(Date.now(), MIN) + 500;
  const data = await response.json();
  assert.ok(Array.isArray(data));
  return data;
}
const valid = (b, step) => Array.isArray(b) && Number.isSafeInteger(+b[0]) && +b[0] % step === 0 &&
  +b[6] === +b[0] + step - 1 && [1, 2, 3, 4].every(i => Number.isFinite(+b[i]) && +b[i] > 0) &&
  +b[2] >= Math.max(+b[1], +b[4]) && +b[3] <= Math.min(+b[1], +b[4]);
async function candles(symbol, key, step, times, seeds = []) {
  const bars = new Map(seeds.filter(b => valid(b, step)).map(b => [+b[0], b]));
  const missing = [...new Set(times)].sort((a, b) => a - b).filter(t => !bars.has(t));
  for (let i = 0; i < missing.length;) {
    let j = i + 1;
    while (j < missing.length && j - i < 499 && missing[j] === missing[j - 1] + step) j++;
    const data = await market(key, { symbol, interval: step === MIN ? '1m' : '5m',
      startTime: missing[i], endTime: missing[j - 1] + step - 1, limit: j - i });
    for (const b of data) if (valid(b, step)) bars.set(+b[0], b);
    i = j;
  }
  assert.ok(times.every(t => bars.has(t)), 'Missing candle: ' + symbol + ' ' + key + ' ' + step);
  return bars;
}
async function cachedMark(symbol, file) {
  const result = [];
  for (const path of ['data/heatmap-market-raw-cache/' + symbol + '.json',
    'data/research/upper-first-push-long-20261109/raw/' + file]) {
    try {
      const raw = await read(path);
      if (raw.symbol === symbol) result.push(...(raw.mark ?? []));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return result;
}

function simulate(bars, funding, entryAt) {
  const path = inRange(entryAt, entryAt + HOLD, MIN).map(t => bars.get(t));
  assert.ok(path.every(Boolean), 'Incomplete execution path');
  const entry = +path[0][1], tp = entry * (1 + 5 / 300), sl = entry * (1 - 20 / 300);
  let exit = +path.at(-1)[4], exitAt = +path.at(-1)[6], reason = 'TIME';
  for (const [time, open, high, low, , , closeAt] of path.map(b => b.map(Number))) {
    if (open <= sl || open >= tp) {
      [exit, exitAt, reason] = open <= sl ? [open, time, 'SL_GAP'] : [tp, time, 'TP'];
      break;
    }
    if (low <= sl || high >= tp) {
      [exit, exitAt, reason] = low <= sl ? [sl, closeAt, 'SL'] : [tp, closeAt, 'TP'];
      break;
    }
  }
  const fundingPct = funding.filter(f => +f.fundingTime > entryAt && +f.fundingTime <= exitAt)
    .reduce((sum, f) => sum + +f.fundingRate * (+f.markPrice > 0 ? +f.markPrice / entry : 1) * 100, 0);
  return { entryAt, entry, exitAt, exit, reason, fundingPct, netRoe: (exit / entry - 1) * 300 - 3 * (0.14 + fundingPct) };
}
function earlyWatch(e, marks, markFive) {
  assert.ok(e.zonesAsOf <= e.armedAt && e.armedAt < e.at);
  const zone = e.zones.filter(z => z.low > e.referencePrice && z.asOf <= e.zonesAsOf)
    .sort((a, b) => a.low - b.low)[0];
  if (!zone) return { zone: null, candidates: [] };
  const candidates = [];
  function observe(at, markPrice) {
    const distancePct = (zone.low / markPrice - 1) * 100;
    if (!(distancePct > 0 && distancePct <= THRESHOLDS.at(-1))) return;
    const end = floor(at, STEP);
    const event = { id: e.id + ':pre:' + at, symbol: e.symbol, direction: 'UPPER', at, markPrice };
    const phase = evaluateSweepPumpPhase({ event, now: at, raw: { symbol: e.symbol, savedAt: at,
      mark: inRange(end - DAY, end, STEP).map(t => markFive.get(t)) } });
    assert.ok(validSweepPumpPhase(event, phase));
    candidates.push({ at, markPrice, distancePct, phase: phase.state, leadMs: e.at - at });
  }
  observe(e.armedAt, e.referencePrice);
  for (const t of inRange(floor(e.armedAt, MIN), floor(e.at, MIN), MIN)) {
    const bar = marks.get(t);
    // Treat a touch in the partial arm minute conservatively, as its order is unknown.
    if (+bar[2] >= zone.low) break;
    if (t >= e.armedAt && t + MIN < e.at) observe(t + MIN, +bar[4]);
  }
  return { zone: { low: zone.low, high: zone.high, asOf: zone.asOf }, candidates };
}

const records = [];
for (const [index, symbol] of symbols.entries()) {
  const list = sample.filter(e => e.symbol === symbol), file = encodeURIComponent(symbol) + '.json';
  const oldFile = SOURCE + '/raw/' + file, newFile = OUT + '/raw/' + file;
  assert.equal(await digest(oldFile), fetched.files[symbol]);
  const old = await read(oldFile);
  const earliest = Math.min(...list.map(e => next(e.availableAt, MIN)));
  const latest = Math.max(...list.map(e => e.entryAt + HOLD));
  let data;
  try { data = await read(newFile); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const minute = await candles(symbol, 'klines', MIN,
      list.flatMap(e => inRange(next(e.availableAt, MIN), e.entryAt + HOLD, MIN)), old.minute);
    const marks = await candles(symbol, 'markPriceKlines', MIN, list.flatMap(e => inRange(floor(e.armedAt, MIN), floor(e.at, MIN), MIN)));
    const markFive = await candles(symbol, 'markPriceKlines', STEP,
      list.flatMap(e => inRange(floor(e.armedAt, STEP) - DAY, floor(e.at, STEP), STEP)), await cachedMark(symbol, file));
    const funding = await market('fundingRate', { symbol, startTime: earliest, endTime: latest - 1, limit: 1000 });
    assert.ok(funding.length < 1000 && funding.every(f => f.symbol === symbol && Number.isFinite(+f.fundingRate) && Number.isFinite(+f.fundingTime)));
    data = { symbol, earliest, latest, minute: [...minute], marks: [...marks], markFive: [...markFive],
      funding: [...new Map(funding.map(f => [String(f.fundingTime) + ':' + (f.rateType ?? 'Regular'), f])).values()] };
    await save(newFile, data);
  }
  assert.ok(data.symbol === symbol && data.earliest === earliest && data.latest === latest);
  const minute = new Map(data.minute), marks = new Map(data.marks), markFive = new Map(data.markFive);
  for (const e of list) {
    const oldResult = priorById.get(e.id), earliestOpen = next(e.availableAt, MIN);
    const baseline = simulate(minute, data.funding, e.entryAt);
    assert.equal(baseline.reason, oldResult.minute.reason);
    assert.ok(Math.abs(baseline.netRoe - oldResult.minute.netRoe) < 1e-8, e.id + ' baseline mismatch');
    const confirmOpen = inRange(earliestOpen, earliestOpen + 5 * MIN, MIN)
      .find(t => +minute.get(t)[4] >= oldResult.upperEdge);
    const confirmed = confirmOpen === undefined ? null : simulate(minute, data.funding, confirmOpen + MIN);
    assert.ok(!confirmed || confirmed.entryAt <= e.entryAt);
    records.push({ id: e.id, symbol, at: e.at, armedAt: e.armedAt, availableAt: e.availableAt,
      edge: oldResult.upperEdge, baseline, immediate: simulate(minute, data.funding, earliestOpen), confirmed,
      held5m: oldResult.heldAbove ? baseline : null, watch: earlyWatch(e, marks, markFive) });
  }
  console.log(JSON.stringify({ symbol, done: index + 1, total: symbols.length, requests }));
}
records.sort((a, b) => a.at - b.at);
function median(values) {
  const s = [...values].sort((a, b) => a - b), i = Math.floor(s.length / 2);
  return !s.length ? null : s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}
function stats(key, rows = records) {
  const subset = rows.filter(r => r[key]), trades = subset.map(r => r[key]), n = trades.length;
  return { n, coins: new Set(subset.map(r => r.symbol)).size, wins: trades.filter(t => t.netRoe > 0).length,
    tp: trades.filter(t => t.reason === 'TP').length, sl: trades.filter(t => t.reason.startsWith('SL')).length,
    time: trades.filter(t => t.reason === 'TIME').length, meanRoe: n ? trades.reduce((s, t) => s + t.netRoe, 0) / n : null,
    medianAfterAlertSec: median(subset.map(r => (r[key].entryAt - r.availableAt) / 1000)),
    medianSavedSec: median(subset.map(r => (r.baseline.entryAt - r[key].entryAt) / 1000)) };
}
const statsByEntry = Object.fromEntries(['baseline', 'immediate', 'confirmed', 'held5m'].map(key => [key, stats(key)]));
const confirmedSubset = records.filter(r => r.confirmed);
const paired = { baseline: stats('baseline', confirmedSubset), immediate: stats('immediate', confirmedSubset),
  confirmed: stats('confirmed', confirmedSubset) };
const watch = THRESHOLDS.map(maxDistancePct => {
  const hits = records.flatMap(r => {
    const first = r.watch.candidates.find(c => c.phase === 'FIRST_PUSH' && c.distancePct <= maxDistancePct);
    return first ? [{ symbol: r.symbol, ...first }] : [];
  });
  return { maxDistancePct, n: hits.length, coins: new Set(hits.map(h => h.symbol)).size,
    atLeast60Sec: hits.filter(h => h.leadMs >= MIN).length, medianLeadSec: median(hits.map(h => h.leadMs / 1000)), hits };
});
const result = { samples: records.length, symbols: symbols.length, statsByEntry, paired, watch, records };
await save(OUT + '/results.json', result);
console.log(JSON.stringify({ statsByEntry, paired, watch: watch.map(({ hits, ...s }) => s) }, null, 2));

