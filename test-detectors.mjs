/**
 * test-detectors.mjs — Chạy: node test-detectors.mjs
 */

import { detectDumpIgnition } from './src/dumpIgnitionDetector.js';
import { detectPumpIgnition  } from './src/pumpIgnitionDetector.js';
import { detectSpikeReversal } from './src/spikeReversalDetector.js';

const c = (o, h, l, cl, v) => ({ open: o, high: h, low: l, close: cl, volume: v });

// ── Candle factories ──────────────────────────────────────────────────────────
// Dùng range lớn ở base (3-4%) để bwP cao, sau đó squeeze cực chặt (0.05%) → bwTight thấp → score cao

function buildDumpCandles() {
  const vol = 1000;
  const candles = [];
  // Base: 90 nến downtrend, range rộng (~3%) để bwP cao
  let p = 1.10;
  for (let i = 0; i < 90; i++) {
    const o = p;
    p = Math.max(0.90, p - 0.002 + (Math.random() - 0.45) * 0.008);
    const cl = p;
    const h = Math.max(o, cl) + Math.random() * 0.012;
    const l = Math.min(o, cl) - Math.random() * 0.012;
    candles.push(c(o, h, l, cl, vol * (0.7 + Math.random() * 0.6)));
  }
  // Squeeze: 65 nến siêu chặt → bwPrev << bwP → squeeze score cao
  const sq = 0.960;
  for (let i = 0; i < 65; i++) {
    candles.push(c(sq, sq + 0.0003, sq - 0.0003, sq - 0.0001, vol * 0.45));
  }
  // Ignition: nến đỏ lớn, body ≥ 60%, vol 2.5×
  candles.push(c(sq, sq * 1.001, sq * 0.960, sq * 0.962, vol * 2.5));
  return candles;
}

function buildPumpCandles() {
  const vol = 1000;
  const candles = [];
  // Base: 90 nến uptrend, range rộng → bwP cao
  let p = 0.90;
  for (let i = 0; i < 90; i++) {
    const o = p;
    p = Math.min(1.10, p + 0.002 + (Math.random() - 0.45) * 0.008);
    const cl = p;
    const h = Math.max(o, cl) + Math.random() * 0.012;
    const l = Math.min(o, cl) - Math.random() * 0.012;
    candles.push(c(o, h, l, cl, vol * (0.7 + Math.random() * 0.6)));
  }
  // Squeeze: 65 nến siêu chặt
  const sq = 1.040;
  for (let i = 0; i < 65; i++) {
    candles.push(c(sq, sq + 0.0003, sq - 0.0003, sq + 0.0001, vol * 0.45));
  }
  // Ignition: nến xanh lớn, body ≥ 60%, upper wick nhỏ, vol 2.5×
  candles.push(c(sq, sq * 1.042, sq * 1.000, sq * 1.040, vol * 2.5));
  return candles;
}

function buildSpikeCandles() {
  const vol = 1000;
  const candles = [];
  // 148 nến uptrend nhẹ → RSI tăng lên ~70+
  let p = 0.85;
  for (let i = 0; i < 148; i++) {
    const o = p;
    p = Math.min(1.02, p + 0.0008 + (Math.random() - 0.4) * 0.004);
    const cl = p;
    const h = Math.max(o, cl) + Math.random() * 0.003;
    const l = Math.min(o, cl) - Math.random() * 0.002;
    candles.push(c(o, h, l, cl, vol * (0.8 + Math.random() * 0.4)));
  }
  // EMA13 ≈ 1.0. Spike cần high > EMA13 + 2×ATR. ATR ≈ 0.005 → cần high > 1.01
  // Spike: +9% body, vol 3.5×, overext 10%+
  candles.push(c(1.000, 1.098, 0.999, 1.090, vol * 3.5));
  // Reversal: bearish, close < spikeH - 30% range. spikeH=1.098, range=0.099, 30%=0.0297 → close <= 1.0683
  // body >= 1.5%, vol >= 2×
  candles.push(c(1.090, 1.093, 1.055, 1.058, vol * 2.2));
  // Nến hiện tại
  candles.push(c(1.058, 1.062, 1.050, 1.052, vol * 0.8));
  return candles;
}

// ── Print ─────────────────────────────────────────────────────────────────────
function printResult(label, result) {
  if (result.pass) {
    console.log(`  ✅ ${label}: score=${result.score} action=${result.action} stage=${result.stage}`);
    console.log(`     note: ${result.note}`);
  } else {
    console.log(`  ❌ ${label}: ${result.reason}`);
  }
}

// ── Synthetic tests (10 runs để tránh randomness) ─────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log('  Synthetic candle tests (10 runs mỗi loại)');
console.log('══════════════════════════════════════════');

let dumpPass = 0, pumpPass = 0, spikePass = 0;
const RUNS = 10;
let lastDump, lastPump, lastSpike;
for (let i = 0; i < RUNS; i++) {
  lastDump  = detectDumpIgnition(buildDumpCandles(), {});
  lastPump  = detectPumpIgnition(buildPumpCandles(), {});
  lastSpike = detectSpikeReversal(buildSpikeCandles(), { ema13: 1.01, ema25: 1.005 });
  if (lastDump.pass)  dumpPass++;
  if (lastPump.pass)  pumpPass++;
  if (lastSpike.pass) spikePass++;
}

console.log(`\nDump Ignition  : ${dumpPass}/${RUNS} pass`);
printResult('Dump Ignition (last run)', lastDump);

console.log(`\nPump Ignition  : ${pumpPass}/${RUNS} pass`);
printResult('Pump Ignition (last run)', lastPump);

console.log(`\nSpike Reversal : ${spikePass}/${RUNS} pass`);
printResult('Spike Reversal (last run)', lastSpike);

// ── Near-miss debug: lower threshold để xem score hiện tại ───────────────────
console.log('\n══════════════════════════════════════════');
console.log('  Score debug (passScore=0 để xem score thực tế)');
console.log('══════════════════════════════════════════');

const dumpDebug  = detectDumpIgnition(buildDumpCandles(),  {}, { passScore: 0, passScoreEarly: 0 });
const pumpDebug  = detectPumpIgnition(buildPumpCandles(),  {}, { passScore: 0, passScoreEarly: 0 });
const spikeDebug = detectSpikeReversal(buildSpikeCandles(), { ema13: 1.01, ema25: 1.005 }, { minScore: 0 });

console.log(`Dump  score: ${dumpDebug.score ?? 'no detect'}`);
console.log(`Pump  score: ${pumpDebug.score ?? 'no detect'}`);
console.log(`Spike score: ${spikeDebug.score ?? 'no detect'}`);

// ── API live check ────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log('  Live API — market scan results');
console.log('══════════════════════════════════════════');

const endpoints = [
  ['/api/dump-ignition-signals',  'Dump Ignition'],
  ['/api/spike-reversal-signals', 'Spike Reversal'],
  ['/api/pump-ignition-signals',  'Pump Ignition'],
];

for (const [ep, name] of endpoints) {
  try {
    const res  = await fetch(`http://127.0.0.1:19082${ep}`);
    const data = await res.json();
    if (data.error) {
      console.log(`❌ ${name}: ${JSON.stringify(data.error).slice(0, 100)}`);
    } else {
      const sigs = data.signals ?? [];
      console.log(`✅ ${name}: scanned=${data.processed}/${data.total} | signals=${sigs.length} | stale=${data.cacheStats?.isStale}`);
      sigs.slice(0, 5).forEach((s) => {
        console.log(`   → ${s.symbol.padEnd(12)} score=${s.score} grade=${s.grade} type=${s.type}`);
      });
    }
  } catch (e) {
    console.log(`❌ ${name}: server không chạy — ${e.message}`);
  }
}

console.log('\nDone.');
