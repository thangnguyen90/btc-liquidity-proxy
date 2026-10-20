// Offline public-data research only. Never imports a server, order manager or notifier.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectPumps, evaluateEvent, summarizeResearch, derivativeAsOf, VERSION, SETTINGS } from './research-pump-path-model.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flag = (key, fallback) => process.argv.find(x => x.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const STAGE = flag('stage', 'all');
const END = Date.parse(flag('end', '2026-10-15T13:00:00Z'));
const START = END - 7 * 86400000;
const DIR = path.join(ROOT, 'data/research/pump-path-week-20261015');
const API = 'https://fapi.binance.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let nextRequest = 0, requests = 0, weight = 0;
await fs.mkdir(path.join(DIR, 'raw'), { recursive: true });
async function jsonFile(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
async function save(file, value) { await fs.writeFile(file, JSON.stringify(value)); }
async function get(endpoint, params = {}) {
  const url = new URL(endpoint, API); url.search = new URLSearchParams(params).toString();
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(Math.max(0, nextRequest - Date.now()));
    if (weight >= 1000) {
      const wait = 61000 - Date.now() % 60000;
      console.log(JSON.stringify({ progress: 'rate-safety-pause', milliseconds: wait, weight }));
      await sleep(wait); weight = 0;
    }
    nextRequest = Date.now() + 450;
    let response;
    try { response = await fetch(url, { signal: AbortSignal.timeout(20000) }); }
    catch (e) { if (attempt === 2) throw e; await sleep(1500); continue; }
    requests++; weight = Number(response.headers.get('x-mbx-used-weight-1m') ?? weight);
    if ([418, 429].includes(response.status)) throw Error(`RATE_LIMIT_${response.status}: stopped; no retry storm`);
    if (!response.ok) { if (response.status >= 500 && attempt < 2) { await sleep(2000); continue; } throw Error(`HTTP_${response.status}`); }
    return await response.json();
  }
}
const rawPath = (symbol, kind, from, to) => path.join(DIR, 'raw', `${encodeURIComponent(symbol)}-${kind}-${from}-${to}.json`);
async function klines(symbol, interval, from, to) {
  const file = rawPath(symbol, interval, from, to), cached = await jsonFile(file);
  if (cached) return cached;
  const output = []; let cursor = from;
  const step = interval === '15m' ? 900000 : 60000;
  while (cursor < to) {
    const rows = await get('/fapi/v1/klines', { symbol, interval, startTime: String(cursor), endTime: String(to - 1), limit: '1000' });
    if (!Array.isArray(rows)) throw Error('INVALID_KLINES');
    if (!rows.length) break;
    output.push(...rows.filter(r => Number(r[6]) < to));
    const next = Number(rows.at(-1)[0]) + step;
    if (!(next > cursor)) throw Error('PAGINATION');
    cursor = next; if (rows.length < 1000) break;
  }
  await save(file, output); return output;
}
function mergeWindows(windows) {
  const result = [];
  for (const w of windows.sort((a,b) => a[0]-b[0])) {
    const last = result.at(-1);
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]); else result.push([...w]);
  }
  return result;
}
const bar = r => ({ t: Number(r[0]), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5], end: +r[6], q: +r[7], buy: +r[10] });
function compactScreenWindows(raw) {
  const rows=raw.map(bar),windows=[];
  for(let i=4;i<rows.length;i++){
    if(rows[i].end<START)continue;
    const lo=Math.min(...rows.slice(i-4,i+1).map(r=>r.l));
    if(rows[i].h/lo-1>=SETTINGS.pumpPct/100)windows.push([Math.max(START-120*60000,rows[i].t-120*60000),Math.min(END,rows[i].t+900000)]);
  }
  return mergeWindows(windows);
}
const metaFile = path.join(DIR, 'universe.json');
let universe = await jsonFile(metaFile);
if (!universe) {
  const info = await get('/fapi/v1/exchangeInfo');
  universe = { fetchedAt: Date.now(), rateLimits: info.rateLimits, symbols: info.symbols.filter(x => x.status === 'TRADING' && x.contractType === 'PERPETUAL' && x.quoteAsset === 'USDT').map(x => ({symbol:x.symbol,onboardDate:x.onboardDate})).sort((a,b)=>a.symbol.localeCompare(b.symbol)) };
  await save(metaFile, universe);
}
const scanFile = path.join(DIR, 'scan.json');
let scan = await jsonFile(scanFile);
if (['scan', 'all'].includes(STAGE)) {
  scan = { version: VERSION, start: START, end: END, currentListingSurvivorshipBias: true, symbols: [], errors: [] };
  let n = 0;
  for (const item of universe.symbols) {
    try {
      const raw = await klines(item.symbol, '15m', START - 3*3600000, END), rows = raw.map(bar), windows = [];
      for (let i = 4; i < rows.length; i++) {
        if (rows[i].end < START) continue;
        // Superset screen only: includes intrabar lows (false positives allowed).
        // Every causal close/close[-15m] >=8% event must fall inside this mask.
        const lo = Math.min(...rows.slice(i-4,i+1).map(r=>r.l));
        if (rows[i].h / lo - 1 >= SETTINGS.pumpPct / 100) windows.push([Math.max(START-120*60000,rows[i].t-120*60000), Math.min(END,rows[i].t+900000+SETTINGS.horizonMinutes*60000)]);
      }
      const merged = mergeWindows(windows);
      scan.symbols.push({ ...item, bars: rows.length, firstBar: rows[0]?.t, lastBar: rows.at(-1)?.end, windows: merged, minutes: merged.reduce((s,[a,b])=>s+(b-a)/60000,0) });
    } catch (e) { if (String(e.message).startsWith('RATE_LIMIT')) throw e; scan.errors.push({symbol:item.symbol,error:e.message}); }
    n++; if(n%20===0) console.log(JSON.stringify({stage:'scan',done:n,total:universe.symbols.length,candidateSymbols:scan.symbols.filter(x=>x.windows.length).length,requests,weight}));
  }
  await save(scanFile,scan);
  console.log(JSON.stringify({stage:'scan-complete',symbols:scan.symbols.length,errors:scan.errors,candidateSymbols:scan.symbols.filter(x=>x.windows.length).length,minutes:scan.symbols.reduce((s,x)=>s+x.minutes,0),requests}));
}
if (!scan || scan.start !== START || scan.end !== END) throw Error('Run matching scan first');
const eventsFile = path.join(DIR, 'events.json');
let result = await jsonFile(eventsFile);
if (['events','all'].includes(STAGE)) {
  result = {version:VERSION,start:START,end:END,settings:SETTINGS,events:[],coverage:[],errors:[]};
  let n=0;
  for (const s of scan.symbols.filter(x=>x.windows.length)) {
    try {
      const coarse=await klines(s.symbol,'15m',START-3*3600000,END);
      const groups=[],windows=compactScreenWindows(coarse);
      for (const [from,to] of windows) groups.push((await klines(s.symbol,'1m',from,to)).map(bar));
      let rows=[...new Map(groups.flat().map(r=>[r.t,r])).values()].sort((a,b)=>a.t-b.t);
      const detected=detectPumps(rows,{start:START,end:END});
      // Future data is loaded only AFTER detection and never fed into historical features.
      // This avoids downloading six extra hours for every coarse false positive.
      for(const e of detected){
        const to=Math.min(END,e.at+1+(SETTINGS.horizonMinutes+SETTINGS.landmarkMinutes)*60000);
        const known=new Set(rows.filter(r=>r.t>=e.at+1&&r.t<to).map(r=>r.t));
        const expected=Math.round((to-e.at-1)/60000);
        if(known.size<expected)groups.push((await klines(s.symbol,'1m',e.at+1,to)).map(bar));
      }
      rows=[...new Map(groups.flat().map(r=>[r.t,r])).values()].sort((a,b)=>a.t-b.t);
      const events=detected.map(e=>evaluateEvent(s.symbol,rows,{...e,index:rows.findIndex(r=>r.end===e.at)},END));
      for(const e of events){
        const deadline=e.at+86400000,after=coarse.map(bar).filter(r=>r.end>e.at&&r.end<=deadline);
        const recovery=e.path.baseAt?after.find(r=>r.end>e.path.baseAt&&r.c>=e.path.recoveryLevel):null;
        const last=after.at(-1),complete=deadline<END&&last&&deadline-last.end<900000;
        e.supplement24h={interval:'15m',complete:Boolean(complete),closeReturnPct:complete?(last.c/e.atSignal.price-1)*100:null,closeAgeMinutesAt24h:complete?(deadline-last.end)/60000:null,recoveryAt:recovery?.end??null,baseTouchScope:'ONLY_BASE_TOUCH_KNOWN_IN_FIRST_6H'};
      }
      result.events.push(...events);
      result.coverage.push({symbol:s.symbol,bars:rows.length,events:events.length,screenMinutes:windows.reduce((s,[a,b])=>s+(b-a)/60000,0)});
    } catch(e) {if(String(e.message).startsWith('RATE_LIMIT'))throw e;result.errors.push({symbol:s.symbol,error:e.message});}
    n++; if(n%5===0){await save(eventsFile,result);console.log(JSON.stringify({stage:'events',done:n,total:scan.symbols.filter(x=>x.windows.length).length,events:result.events.length,requests,weight}));}
  }
  result.events.sort((a,b)=>a.at-b.at||a.symbol.localeCompare(b.symbol));
  await save(eventsFile,result);
}
if (['derivatives','all'].includes(STAGE)) {
  if (!result) throw Error('Run events first');
  let n=0;
  for (const e of result.events) {
    const from=e.at-2*3600000,to=e.at+1;
    e.derivatives={};
    for (const [key,endpoint] of [['oi','/futures/data/openInterestHist'],['ratio','/futures/data/topLongShortAccountRatio']]) {
      const file=rawPath(e.symbol,key,from,to);
      try {
        let rows=await jsonFile(file);
        if(!rows){rows=await get(endpoint,{symbol:e.symbol,period:'5m',startTime:String(from),endTime:String(to),limit:'50'});await save(file,rows);}
        if(!Array.isArray(rows))throw Error('INVALID_ROWS');
        e.derivatives[key]=derivativeAsOf(rows,e.at,key);
      }catch(err){if(String(err.message).startsWith('RATE_LIMIT'))throw err;e.derivatives[key]={ready:false,reason:err.message};}
    }
    n++;if(n%10===0){await save(eventsFile,result);console.log(JSON.stringify({stage:'derivatives',done:n,total:result.events.length,requests,weight}));}
  }
  await save(eventsFile,result);
}
if (['report','all'].includes(STAGE)) {
  if(!result)throw Error('Run events first');
  const btc=(await klines('BTCUSDT','15m',START-3*3600000,END)).map(bar);
  for(const e of result.events){
    let i=btc.findLastIndex(r=>r.end<=e.at);
    e.btcContext=i>=12&&e.at-btc[i].end<900000?{ready:true,interval:'15m_CLOSED',at:btc[i].end,lagMinutes:(e.at-btc[i].end)/60000,return15mPct:(btc[i].c/btc[i-1].c-1)*100,return1hPct:(btc[i].c/btc[i-4].c-1)*100,return3hPct:(btc[i].c/btc[i-12].c-1)*100}:{ready:false};
  }
  const summary=summarizeResearch(result.events,START,END);
  const output={version:VERSION,generatedAt:Date.now(),start:START,end:END,settings:SETTINGS,universe:{requested:universe.symbols.length,scanned:scan.symbols.length,scanErrors:scan.errors,minuteCoverage:result.coverage,minuteErrors:result.errors,currentListingSurvivorshipBias:true},summary,events:result.events};
  await save(path.join(DIR,'results.json'),output);
  console.log(JSON.stringify({stage:'results',path:path.join(DIR,'results.json'),...summary},null,2));
}
