import { readFile, writeFile } from 'node:fs/promises';
const output = new URL('../data/audits/liqscan-20260906/', import.meta.url);
const frozen = JSON.parse(await readFile(new URL('frozen-alerts.json', output), 'utf8'));
const alert = frozen.alerts.find(a => a.symbol === 'USELESSUSDT');
const start = Date.parse(alert.evaluatedAt), end = Math.ceil(start / 60000) * 60000 - 1;
let fromId, complete = false;
const trades = [];
for (let page = 0; page < 30; page++) {
  const url = new URL('https://fapi.binance.com/fapi/v1/aggTrades');
  for (const [key,value] of Object.entries({symbol:alert.symbol,limit:1000,...(fromId == null ? {startTime:start,endTime:end} : {fromId})})) url.searchParams.set(key,value);
  const response = await fetch(url, {signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Invalid response');
  trades.push(...rows.filter(r=>r.T>=start&&r.T<=end));
  if (rows.length < 1000 || rows.at(-1).T >= end) {complete=true;break;}
  fromId = rows.at(-1).a + 1;
}
if (!complete) throw new Error('Pagination incomplete');
const levels = {mainLow:alert.killZoneCluster.mainKillZone.low, mainHigh:alert.killZoneCluster.mainKillZone.high,target:alert.sweepTarget.price};
const result = {complete,start:alert.evaluatedAt,end:new Date(end).toISOString(),count:trades.length,low:Math.min(...trades.map(r=>+r.p)),high:Math.max(...trades.map(r=>+r.p)),
  hits:Object.fromEntries(Object.entries(levels).map(([key,value])=>{const hit=trades.find(r=>+r.p>=value);return [key,hit ? {at:new Date(hit.T).toISOString(),price:+hit.p,minBefore:Math.min(...trades.filter(r=>r.a<=hit.a).map(r=>+r.p))} : null];}))};
await writeFile(new URL('useless-partial-minute.json',output),JSON.stringify({result,trades},null,2));
console.log(JSON.stringify(result,null,2));
