import { readFile, writeFile, mkdir } from 'node:fs/promises';

// Offline outcome audit: public Binance reads only, frozen signals, no strategy imports.
const now = Date.now();
const root = new URL('../', import.meta.url);
const output = new URL('data/audits/liqscan-20260906/', root);
await mkdir(output, { recursive: true });
const store = JSON.parse(await readFile(new URL('frozen-alerts.json', output), 'utf8').catch(() => readFile(new URL('data/liq-scan-latest-alerts.json', root), 'utf8')));
await writeFile(new URL('frozen-alerts.json', output), JSON.stringify(store, null, 2));
const minute = 60_000;
const horizon = 240 * minute;
const eligible = store.alerts.filter(a => now - Date.parse(a.evaluatedAt) >= horizon && a.markPrice > 0 && a.sweepTarget?.price > 0);
async function get(path, params) {
  const url = new URL(`https://fapi.binance.com/fapi/v1/${path}`);
  for (const [key, val] of Object.entries(params)) url.searchParams.set(key, val);
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Binance ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('Invalid Binance response');
  return data;
}
function evaluate(alert, bars, mins) {
  const t = Date.parse(alert.evaluatedAt);
  const rows = bars.filter(b => b[6] < t + mins * minute);
  const p = alert.markPrice, up = alert.dominantSide === 'ABOVE';
  const target = alert.sweepTarget.price;
  const distance = Math.abs(target - p);
  if ((up && target <= p) || (!up && target >= p)) return { minutes: mins, invalidTarget: true };
  const opposite = up ? p - distance : p + distance;
  let first = 'NEITHER', targetAt = null, oppositeAt = null;
  for (const b of rows) {
    const hit = up ? +b[2] >= target : +b[3] <= target;
    const opp = up ? +b[3] <= opposite : +b[2] >= opposite;
    if (hit && targetAt == null) targetAt = b[0];
    if (opp && oppositeAt == null) oppositeAt = b[0];
    if (first === 'NEITHER' && (hit || opp)) first = hit && opp ? 'AMBIGUOUS' : hit ? 'TARGET_FIRST' : 'OPPOSITE_FIRST';
  }
  const excursions = rows.map(b => ({ favorable: up ? (+b[2] / p - 1) * 100 : (1 - +b[3] / p) * 100, adverse: up ? (1 - +b[3] / p) * 100 : (+b[2] / p - 1) * 100 }));
  return { minutes: mins, first, target, opposite, targetAt, oppositeAt,
    targetDelayMinutes: targetAt == null ? null : (targetAt - t) / minute,
    mfePct: Math.max(0, ...excursions.map(e => e.favorable)), maePct: Math.max(0, ...excursions.map(e => e.adverse)),
    directionalReturnPct: rows.length ? (+rows.at(-1)[4] / p - 1) * 100 * (up ? 1 : -1) : null,
    bars: rows.length };
}
const results = [], errors = [];
let cursor = 0;
await Promise.all([0, 1].map(async () => {
  while (cursor < eligible.length) {
    const alert = eligible[cursor++];
    try {
      const t = Date.parse(alert.evaluatedAt);
      const startTime = Math.ceil(t / minute) * minute;
      const bars = (await get('klines', { symbol: alert.symbol, interval: '1m', startTime, endTime: t + horizon - 1, limit: 500 })).filter(b => b[6] < t + horizon);
      const expected = Math.floor((t + horizon) / minute) - startTime / minute;
      if (bars.length !== expected || bars.some((b, i) => b[0] !== startTime + i * minute || ![b[1],b[2],b[3],b[4]].every(x => Number.isFinite(+x) && +x > 0))) throw new Error('Incomplete or invalid candle series');
      const result = { symbol: alert.symbol, at: alert.evaluatedAt, side: alert.dominantSide, score: alert.sweepProbabilityPct,
        outcomes: [15, 30, 60, 240].map(m => evaluate(alert, bars, m)) };
      results.push(result);
      if (alert.symbol === 'USELESSUSDT') {
        await writeFile(new URL('useless-candles.json', output), JSON.stringify(bars));
        const levels = { mainLow: alert.killZoneCluster?.mainKillZone?.low, mainHigh: alert.killZoneCluster?.mainKillZone?.high, target: alert.sweepTarget.price, farLow: alert.killZoneCluster?.farKillZone?.low };
        result.levels = Object.fromEntries(Object.entries(levels).filter(([,v])=>v>0).map(([name, price]) => {
          const hit = bars.find(b => +b[2] >= price);
          const before = bars.filter(b => hit && b[0] < hit[0]);
          return [name, { price, firstHitMinuteUTC: hit ? new Date(hit[0]).toISOString() : null,
            minBeforeHit: before.length ? Math.min(...before.map(b=>+b[3])) : null,
            hitMinuteLow: hit ? +hit[3] : null }];
        }));
        result.extremes = { high: Math.max(...bars.map(b=>+b[2])), low: Math.min(...bars.map(b=>+b[3])) };
      }
    } catch (error) { errors.push({ symbol: alert.symbol, error: error.message }); }
    if ((results.length + errors.length) % 20 === 0) console.log(`Audited ${results.length + errors.length}/${eligible.length}`);
  }
}));
function summarize(rows, mins) {
  const data = rows.map(r => r.outcomes.find(o=>o.minutes===mins)).filter(o=>!o.invalidTarget);
  const count = key => data.filter(o=>o.first===key).length;
  return { n: data.length, targetFirst: count('TARGET_FIRST'), oppositeFirst: count('OPPOSITE_FIRST'), ambiguous: count('AMBIGUOUS'), neither: count('NEITHER'), targetEver: data.filter(o=>o.targetAt!=null).length,
    avgDirectionalReturnPct: data.length ? data.reduce((s,o)=>s+o.directionalReturnPct,0)/data.length : null };
}
const summaries = Object.fromEntries(['ALL','ABOVE','BELOW'].map(side => [side, Object.fromEntries([15,30,60,240].map(m=>[m,summarize(results.filter(r=>side==='ALL'||r.side===side),m)]))]));
const report = { evaluatedAt: new Date(now).toISOString(), storedCount: store.alerts.length, eligibleCount: eligible.length,
  methodology: 'Latest alert per symbol only (selection bias). Frozen target. 1m futures trade candles starting next full minute; excludes first partial minute and incomplete last candle. Symmetric opposite barrier is benchmark, not actual opposite liquidity zone or SL. Same-minute both-hit ambiguous. Mark reference vs trade candles may differ. No fees, slippage, leverage or executed PnL. Not probability calibration or full strategy backtest.',
  summaries, errors, results };
await writeFile(new URL('outcomes.json', output), JSON.stringify(report,null,2));
console.log(JSON.stringify({ summaries, errors, useless: results.find(r=>r.symbol==='USELESSUSDT') },null,2));
