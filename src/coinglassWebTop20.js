import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

export const COINGLASS_WEB_TOP20_VERSION = 'COINGLASS_WEB_MODEL3_TOP20_V1_20260817';
export const COINGLASS_WEB_TOP20_MODE = 'OBSERVE_ONLY';
export const COINGLASS_WEB_TOP20_ISOLATION = Object.freeze({
  observationOnly: true,
  affectsLiquidFlowV2: false,
  affectsSignals: false,
  affectsPaper: false,
  affectsBinance: false,
  affectsEntry: false,
  affectsSize: false,
  affectsSlTp: false,
});

const execFileAsync = promisify(execFile);

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function safeCoinglassSymbol(value) {
  const symbol = String(value ?? '').trim().toUpperCase();
  return /^[A-Z0-9]{2,24}USDT$/.test(symbol) ? symbol : '';
}

export function selectTopBinanceUsdtPerpetuals(exchangeInfo = {}, tickers = [], limit = 20) {
  const contracts = new Map(
    (Array.isArray(exchangeInfo?.symbols) ? exchangeInfo.symbols : [])
      .filter((row) => (
        row?.status === 'TRADING'
        && row?.contractType === 'PERPETUAL'
        && row?.quoteAsset === 'USDT'
        && safeCoinglassSymbol(row?.symbol)
      ))
      .map((row) => [row.symbol, row]),
  );

  return (Array.isArray(tickers) ? tickers : [])
    .map((ticker) => {
      const symbol = safeCoinglassSymbol(ticker?.symbol);
      const contract = contracts.get(symbol);
      if (!contract) return null;
      return {
        symbol,
        baseAsset: String(contract.baseAsset ?? symbol.replace(/USDT$/, '')),
        quoteAsset: 'USDT',
        quoteVolume24h: Math.max(0, finiteNumber(ticker.quoteVolume, 0)),
        lastPrice: finiteNumber(ticker.lastPrice),
        priceChangePercent24h: finiteNumber(ticker.priceChangePercent),
        tradeCount24h: Math.max(0, Math.trunc(finiteNumber(ticker.count, 0))),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.quoteVolume24h - left.quoteVolume24h)
    .slice(0, Math.max(1, Math.min(50, Math.trunc(finiteNumber(limit, 20)))))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function localPeakIndexes(levels) {
  const indexes = [];
  for (let index = 0; index < levels.length; index += 1) {
    const current = levels[index]?.totalIntensity ?? 0;
    const before = levels[index - 1]?.totalIntensity ?? -1;
    const after = levels[index + 1]?.totalIntensity ?? -1;
    if (current >= before && current >= after && current > 0) indexes.push(index);
  }
  return indexes;
}

export function summarizeCoinglassHeatmap(data = {}, { maxZones = 12, minIndexGap = 3 } = {}) {
  const prices = Array.isArray(data?.prices) ? data.prices : [];
  const y = Array.isArray(data?.y) ? data.y.map((value) => finiteNumber(value)) : [];
  const liquidationRows = Array.isArray(data?.liq) ? data.liq : [];
  const lastBar = prices.at(-1);
  const currentPrice = finiteNumber(Array.isArray(lastBar) ? lastBar[4] : null);
  const levels = y.map((price, index) => ({
    index,
    price,
    totalIntensity: 0,
    maxIntensity: 0,
    firstX: null,
    lastX: null,
    xIndexes: new Set(),
  }));

  for (const row of liquidationRows) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const xIndex = Math.trunc(finiteNumber(row[0], -1));
    const yIndex = Math.trunc(finiteNumber(row[1], -1));
    const intensity = Math.max(0, finiteNumber(row[2], 0));
    const level = levels[yIndex];
    if (!level || xIndex < 0 || intensity <= 0) continue;
    level.totalIntensity += intensity;
    level.maxIntensity = Math.max(level.maxIntensity, intensity);
    level.firstX = level.firstX == null ? xIndex : Math.min(level.firstX, xIndex);
    level.lastX = level.lastX == null ? xIndex : Math.max(level.lastX, xIndex);
    level.xIndexes.add(xIndex);
  }

  const candidates = localPeakIndexes(levels)
    .map((index) => levels[index])
    .filter((level) => Number.isFinite(level.price))
    .sort((left, right) => right.totalIntensity - left.totalIntensity);
  const selected = [];
  for (const candidate of candidates) {
    if (selected.some((row) => Math.abs(row.index - candidate.index) < minIndexGap)) continue;
    selected.push(candidate);
    if (selected.length >= Math.max(1, maxZones)) break;
  }
  const strongestIntensity = selected[0]?.totalIntensity ?? 0;
  const zones = selected.map((level) => ({
    price: level.price,
    side: currentPrice == null ? 'UNKNOWN' : level.price >= currentPrice ? 'ABOVE' : 'BELOW',
    distancePct: currentPrice > 0 ? ((level.price / currentPrice) - 1) * 100 : null,
    strength: strongestIntensity > 0 ? Math.round((level.totalIntensity / strongestIntensity) * 100) : 0,
    totalIntensity: Math.round(level.totalIntensity),
    maxIntensity: Math.round(level.maxIntensity),
    persistenceBars: level.xIndexes.size,
    firstX: level.firstX,
    lastX: level.lastX,
  }));

  return {
    instrument: {
      exchange: data?.instrument?.exName ?? null,
      instrumentId: data?.instrument?.instrumentId ?? null,
      baseAsset: data?.instrument?.baseAsset ?? null,
      quoteAsset: data?.instrument?.quoteAsset ?? null,
      contractType: data?.instrument?.contractType ?? null,
    },
    updateTime: finiteNumber(data?.updateTime),
    precision: finiteNumber(data?.precision),
    rangeLow: finiteNumber(data?.rangeLow),
    rangeHigh: finiteNumber(data?.rangeHigh),
    currentPrice,
    candleCount: prices.length,
    priceLevelCount: y.length,
    liquidationCellCount: liquidationRows.length,
    zones,
  };
}

export function mergeLastGoodHeatmapRows({ markets = [], freshRows = [], failures = [], previousRows = [] } = {}) {
  const freshBySymbol = new Map(freshRows.map((row) => [row.symbol, row]));
  const failureBySymbol = new Map(failures.map((row) => [row.symbol, row]));
  const previousBySymbol = new Map(previousRows.map((row) => [row.symbol, row]));
  return markets.flatMap((market) => {
    const fresh = freshBySymbol.get(market.symbol);
    if (fresh) return [fresh];
    const previous = previousBySymbol.get(market.symbol);
    if (!previous) return [];
    return [{
      ...previous,
      ...market,
      status: 'STALE_LAST_GOOD',
      stale: true,
      lastError: failureBySymbol.get(market.symbol)?.error ?? 'Fresh capture unavailable',
    }];
  });
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export class CoinGlassWebTop20Manager {
  constructor({ rootDir, dataDir = join(rootDir, 'data', 'coinglass-web-top20') } = {}) {
    if (!rootDir) throw new Error('rootDir is required');
    this.rootDir = rootDir;
    this.dataDir = dataDir;
    this.snapshotFile = join(dataDir, 'snapshot.json');
    this.progressFile = join(dataDir, 'progress.json');
    this.running = false;
    this.startedAt = null;
    this.lastError = null;
    this.inflight = null;
  }

  config() {
    return {
      enabled: process.env.COINGLASS_WEB_TOP20_ENABLED !== 'false',
      limit: Math.max(1, Math.min(20, Number(process.env.COINGLASS_WEB_TOP20_LIMIT ?? 20))),
      range: '48h',
      browserMode: process.env.COINGLASS_WEB_BROWSER_MODE ?? 'headed',
      timeoutMs: Math.max(120_000, Number(process.env.COINGLASS_WEB_TOP20_TIMEOUT_MS ?? 12 * 60_000)),
    };
  }

  async snapshot() {
    const [saved, progress] = await Promise.all([
      readJson(this.snapshotFile, null),
      this.running ? readJson(this.progressFile, null) : Promise.resolve(null),
    ]);
    return {
      version: COINGLASS_WEB_TOP20_VERSION,
      mode: COINGLASS_WEB_TOP20_MODE,
      isolation: COINGLASS_WEB_TOP20_ISOLATION,
      config: this.config(),
      running: this.running,
      startedAt: this.startedAt,
      error: this.lastError,
      progress,
      updatedAt: saved?.updatedAt ?? null,
      source: saved?.source ?? null,
      rows: Array.isArray(saved?.rows) ? saved.rows : [],
      failures: Array.isArray(saved?.failures) ? saved.failures : [],
    };
  }

  async startRefresh(reason = 'manual') {
    const config = this.config();
    if (!config.enabled) {
      return { accepted: false, reason: 'disabled', snapshot: await this.snapshot() };
    }
    if (this.running) {
      return { accepted: false, reason: 'already_running', snapshot: await this.snapshot() };
    }
    await mkdir(this.dataDir, { recursive: true });
    this.running = true;
    this.startedAt = new Date().toISOString();
    this.lastError = null;
    this.inflight = this.runCollector({ ...config, reason })
      .catch((error) => {
        this.lastError = String(error?.message ?? error);
        console.warn(`[CoinGlassWebTop20] refresh failed: ${this.lastError}`);
      })
      .finally(() => {
        this.running = false;
        this.inflight = null;
      });
    return { accepted: true, reason, snapshot: await this.snapshot() };
  }

  async runCollector({ limit, range, reason, timeoutMs }) {
    const script = join(this.rootDir, 'scripts', 'crawl-coinglass-web-top20.mjs');
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      script,
      '--limit', String(limit),
      '--range', range,
      '--data-dir', this.dataDir,
      '--reason', String(reason ?? 'manual'),
    ], {
      cwd: this.rootDir,
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      env: process.env,
    });
    if (stderr?.trim()) console.warn(`[CoinGlassWebTop20] ${stderr.trim()}`);
    const result = JSON.parse(String(stdout).trim() || '{}');
    if (!result.ok) throw new Error(result.error || 'CoinGlass collector did not complete');
    return result;
  }

  imageFile(symbol) {
    const safeSymbol = safeCoinglassSymbol(symbol);
    return safeSymbol ? join(this.dataDir, 'images', `${safeSymbol}.png`) : null;
  }
}
