#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const inputFile = join(rootDir, 'data', 'pump-paper-trades.json');
const outputFile = join(rootDir, 'data', 'br-like-limit-eval.json');
const fromDay = process.argv[2] || '2026-06-26';
const toDay = process.argv[3] || new Date().toISOString().slice(0, 10);
const startMs = Date.parse(`${fromDay}T00:00:00Z`);
const endMs = Date.parse(`${toDay}T23:59:59.999Z`);
const windows = [30, 60, 240];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchKlines(symbol, start, end, tryNo = 1) {
  const url = new URL('https://fapi.binance.com/fapi/v1/klines');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', '1m');
  url.searchParams.set('startTime', String(start));
  url.searchParams.set('endTime', String(end));
  url.searchParams.set('limit', '1500');
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 429 && tryNo < 6) {
      await sleep(8000 * tryNo);
      return fetchKlines(symbol, start, end, tryNo + 1);
    }
    throw new Error(`${symbol}{res.status} ${await res.text()}`);
  }
  return res.json();
}

async function fetchKlineRange(symbol, start, end) {
  const all = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard++ < 30) {
    const chunkEnd = Math.min(end, cur + 1499 * 60_000);
    const chunk = await fetchKlines(symbol, cur, chunkEnd);
    if (!Array.isArray(chunk) || !chunk.length) break;
    all.push(...chunk);
    const lastOpen = Number(chunk.at(-1)?.[0]);
    if (!Number.isFinite(lastOpen)) break;
    cur = lastOpen + 60_000;
    if (chunk.length < 1499) break;
    await sleep(250);
  }
  return all;
}

function summarize(records, windowMin) {
  const filled = records.filter((r) => r.fills[windowMin]?.filled);
  const wins = filled.filter((r) => r.fills[windowMin].pnl > 0).length;
  const losses = filled.filter((r) => r.fills[windowMin].pnl < 0).length;
  const pnl = filled.reduce((sum, r) => sum + Number(r.fills[windowMin].pnl ?? 0), 0);
  const oldPnl = records.reduce((sum, r) => sum + Number(r.oldPnl ?? 0), 0);
  const avgRoe = filled.length
    ? filled.reduce((sum, r) => sum + Number(r.fills[windowMin].roe ?? 0), 0) / filled.length
    : null;
  return {
    signals: records.length,
    filled: filled.length,
    missed: records.length - filled.length,
    fillRate: records.length ? +(filled.length / records.length * 100).toFixed(1) : 0,
    oldPnl: +oldPnl.toFixed(3),
    pendingPnl: +pnl.toFixed(3),
    delta: +(pnl - oldPnl).toFixed(3),
    wr: filled.length ? +(wins / filled.length * 100).toFixed(1) : 0,
    wl: `${wins}/${losses}`,
    avgRoe: avgRoe == null ? null : +avgRoe.toFixed(1),
  };
}

function pack(records) {
  const out = {};
  for (const w of windows) {
    out[`${w}m`] = {
      all: summarize(records, w),
      long: summarize(records.filter((r) => r.side === 'LONG'), w),
      short: summarize(records.filter((r) => r.side === 'SHORT'), w),
    };
  }
  return out;
}

async function main() {
  const store = JSON.parse(await readFile(inputFile, 'utf8'));
  const rows = (store.trades || []).filter((t) => {
    const created = Date.parse(t.createdAt || '');
    return Number.isFinite(created)
      && created >= startMs
      && created <= endMs
      && t.status === 'CLOSED'
      && String(t.source || '').startsWith('emasq-')
      && String(t.source || '').includes('-br_like')
      && String(t.source || '').includes('-mkt')
      && String(t.variant || '').toUpperCase() === 'MARKET';
  });

  const bySymbol = new Map();
  for (const t of rows) {
    if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, []);
    bySymbol.get(t.symbol).push(t);
  }

  const records = [];
  const fetchErrors = [];
  let idx = 0;
  for (const [symbol, trades] of bySymbol) {
    idx += 1;
    if (idx % 10 === 0) await sleep(2500);
    const times = trades.map((t) => Date.parse(t.createdAt)).filter(Number.isFinite);
    if (!times.length) continue;
    let klines = [];
    try {
      klines = await fetchKlineRange(symbol, Math.min(...times) - 60_000, Math.max(...times) + 241 * 60_000);
    } catch (err) {
      fetchErrors.push(String(err.message || err));
      continue;
    }
    const kmap = new Map(klines.map((k) => [Math.floor(Number(k[0]) / 60_000), k]));
    for (const t of trades) {
      const created = Date.parse(t.createdAt);
      const entry = Number(t.entryRebasedFrom ?? t.entryPrice);
      const exit = Number(t.exitPrice);
      const margin = Number(t.marginUsdt || 0);
      const lev = Number(t.leverage || 1);
      const side = String(t.side || '').toUpperCase();
      const sideMult = side === 'LONG' ? 1 : -1;
      const fills = {};
      for (const w of windows) {
        let hit = null;
        const fromMin = Math.floor(created / 60_000);
        const toMin = Math.floor((created + w * 60_000) / 60_000);
        for (let minute = fromMin; minute <= toMin; minute += 1) {
          const k = kmap.get(minute);
          if (!k) continue;
          if (side === 'LONG' ? Number(k[3]) <= entry : Number(k[2]) >= entry) {
            hit = k;
            break;
          }
        }
        if (hit && Number.isFinite(exit) && exit > 0 && margin > 0 && entry > 0) {
          const qty = margin * lev / entry;
          const pnl = (exit - entry) * qty * sideMult;
          fills[w] = {
            filled: true,
            fillAt: new Date(Number(hit[0])).toISOString(),
            pnl,
            roe: pnl / margin * 100,
          };
        } else {
          fills[w] = { filled: false };
        }
      }
      records.push({
        id: t.id,
        day: String(t.createdAt).slice(0, 10),
        symbol: t.symbol,
        side,
        source: t.source,
        score: t.score ?? null,
        createdAt: t.createdAt,
        entry,
        exit,
        oldPnl: Number(t.pnl || 0),
        oldRoe: Number(t.roe || 0),
        fills,
      });
    }
  }

  const days = [...new Set(records.map((r) => r.day))].sort();
  const byDay = Object.fromEntries(days.map((day) => [day, pack(records.filter((r) => r.day === day))]));
  const payload = {
    generatedAt: new Date().toISOString(),
    fromDay,
    toDay,
    sourceRows: rows.length,
    analyzedRows: records.length,
    fetchErrors,
    windows: windows.map((w) => `${w}m`),
    recommendedWindow: '240m',
    note: 'BR-like MARKET history re-evaluated as pending limit at setup entry; fill is counted when 1m candle touches entry within the window.',
    overall: pack(records),
    byDay,
    records,
  };
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({
    outputFile,
    sourceRows: rows.length,
    analyzedRows: records.length,
    fetchErrors: fetchErrors.length,
    generatedAt: payload.generatedAt,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
