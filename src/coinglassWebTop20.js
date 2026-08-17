import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

export const COINGLASS_WEB_TOP20_VERSION = 'COINGLASS_WEB_MODEL3_LIQUID_MARKETS_V2_20260817';
export const COINGLASS_WEB_ZONE_PROPOSAL_VERSION = 'COINGLASS_WEB_ZONE_PROPOSAL_V1_20260817';
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

export function applyBinanceLiquidityFilter(markets = [], metricsBySymbol = {}, limit = 20, thresholds = {}) {
  const required = Math.max(1, Math.min(50, Math.trunc(finiteNumber(limit, 20))));
  const minimums = {
    quoteVolume24h: Math.max(0, finiteNumber(thresholds.quoteVolume24h, 50_000_000)),
    tradeCount24h: Math.max(0, finiteNumber(thresholds.tradeCount24h, 20_000)),
    openInterestNotional: Math.max(0, finiteNumber(thresholds.openInterestNotional, 5_000_000)),
    bookDepthUsd: Math.max(0, finiteNumber(thresholds.bookDepthUsd, 5_000)),
    maxSpreadBps: Math.max(0, finiteNumber(thresholds.maxSpreadBps, 15)),
  };
  const assessed = markets.map((market) => {
    const metric = metricsBySymbol?.[market.symbol] ?? {};
    const spreadBps = Math.max(0, finiteNumber(metric.spreadBps, Number.POSITIVE_INFINITY));
    const bidDepthUsd = Math.max(0, finiteNumber(metric.bidDepthUsd, 0));
    const askDepthUsd = Math.max(0, finiteNumber(metric.askDepthUsd, 0));
    const bookDepthUsd = Math.min(bidDepthUsd, askDepthUsd);
    const openInterestNotional = Math.max(0, finiteNumber(metric.openInterestNotional, 0));
    const checks = {
      quoteVolume: market.quoteVolume24h >= minimums.quoteVolume24h,
      trades: market.tradeCount24h >= minimums.tradeCount24h,
      openInterest: openInterestNotional >= minimums.openInterestNotional,
      bookDepth: bookDepthUsd >= minimums.bookDepthUsd,
      spread: spreadBps <= minimums.maxSpreadBps,
    };
    const isBtc = market.symbol === 'BTCUSDT';
    const eligible = isBtc || Object.values(checks).every(Boolean);
    const liquidityScore = (
      Math.log10(Math.max(1, market.quoteVolume24h)) * 18
      + Math.log10(Math.max(1, openInterestNotional)) * 22
      + Math.log10(Math.max(1, bookDepthUsd)) * 24
      + Math.log10(Math.max(1, market.tradeCount24h)) * 10
      + Math.max(0, minimums.maxSpreadBps - Math.min(minimums.maxSpreadBps, spreadBps)) * 2
    );
    return {
      ...market,
      binanceLiquidity: {
        eligible,
        forcedBtc: isBtc,
        spreadBps: Number.isFinite(spreadBps) ? spreadBps : null,
        bidDepthUsd,
        askDepthUsd,
        bookDepthUsd,
        openInterestNotional,
        score: Number(liquidityScore.toFixed(2)),
        checks,
        thresholds: minimums,
      },
    };
  });
  const eligible = assessed
    .filter((market) => market.binanceLiquidity.eligible)
    .sort((left, right) => {
      if (left.symbol === 'BTCUSDT') return -1;
      if (right.symbol === 'BTCUSDT') return 1;
      return right.binanceLiquidity.score - left.binanceLiquidity.score;
    })
    .slice(0, required)
    .map((market, index) => ({ ...market, rank: index + 1 }));
  const selectedSymbols = new Set(eligible.map((market) => market.symbol));
  return {
    rows: eligible,
    excluded: assessed
      .filter((market) => !selectedSymbols.has(market.symbol))
      .map((market) => ({
        symbol: market.symbol,
        quoteVolume24h: market.quoteVolume24h,
        binanceLiquidity: market.binanceLiquidity,
      })),
    thresholds: minimums,
  };
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
  const selectSeparated = (pool, count) => {
    const picked = [];
    for (const candidate of pool) {
      if (picked.some((row) => Math.abs(row.index - candidate.index) < minIndexGap)) continue;
      picked.push(candidate);
      if (picked.length >= count) break;
    }
    return picked;
  };
  const zoneLimit = Math.max(1, maxZones);
  const sideLimit = Math.max(1, Math.ceil(zoneLimit / 2));
  const above = currentPrice == null ? [] : candidates.filter((level) => level.price >= currentPrice);
  const below = currentPrice == null ? [] : candidates.filter((level) => level.price < currentPrice);
  const selected = currentPrice == null
    ? selectSeparated(candidates, zoneLimit)
    : [
      ...selectSeparated(above, sideLimit),
      ...selectSeparated(below, sideLimit),
    ].sort((left, right) => right.totalIntensity - left.totalIntensity).slice(0, zoneLimit);
  const strongestIntensity = Math.max(0, ...selected.map((level) => level.totalIntensity));
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
    totalLiquidationIntensity: Math.round(levels.reduce((total, level) => total + level.totalIntensity, 0)),
    zones,
  };
}

export function assessCoinglassLiquidity(heatmap = {}, market = {}, thresholds = {}) {
  const minimums = {
    liquidationCells: Math.max(1, finiteNumber(thresholds.liquidationCells, 100)),
    nearbyZones: Math.max(1, finiteNumber(thresholds.nearbyZones, 2)),
    persistenceBars: Math.max(1, finiteNumber(thresholds.persistenceBars, 3)),
    maxDistancePct: Math.max(1, finiteNumber(thresholds.maxDistancePct, 20)),
  };
  const zones = Array.isArray(heatmap?.zones) ? heatmap.zones : [];
  const nearbyZones = zones.filter((zone) => Math.abs(finiteNumber(zone.distancePct, 999)) <= minimums.maxDistancePct);
  const persistentZones = nearbyZones.filter((zone) => finiteNumber(zone.persistenceBars, 0) >= minimums.persistenceBars);
  const liquidationCells = Math.max(0, finiteNumber(heatmap?.liquidationCellCount, 0));
  const isBtc = market?.symbol === 'BTCUSDT';
  const checks = {
    liquidationCells: liquidationCells >= minimums.liquidationCells,
    nearbyZones: nearbyZones.length >= minimums.nearbyZones,
    persistence: persistentZones.length >= 1,
  };
  const score = (
    Math.min(40, Math.log10(Math.max(1, liquidationCells)) * 12)
    + Math.min(30, nearbyZones.length * 5)
    + Math.min(30, persistentZones.reduce((total, zone) => total + Math.min(10, finiteNumber(zone.persistenceBars, 0)), 0))
  );
  return {
    eligible: isBtc || Object.values(checks).every(Boolean),
    forcedBtc: isBtc,
    score: Number(score.toFixed(2)),
    liquidationCells,
    nearbyZoneCount: nearbyZones.length,
    persistentZoneCount: persistentZones.length,
    checks,
    thresholds: minimums,
  };
}

export function buildCoinglassZoneProposal(heatmap = {}, market = {}) {
  const referencePrice = finiteNumber(market?.lastPrice, finiteNumber(heatmap?.currentPrice));
  const rawZones = Array.isArray(heatmap?.zones) ? heatmap.zones : [];
  const zones = referencePrice > 0
    ? rawZones.map((zone) => ({
      ...zone,
      side: finiteNumber(zone.price, 0) >= referencePrice ? 'ABOVE' : 'BELOW',
      distancePct: ((finiteNumber(zone.price, 0) / referencePrice) - 1) * 100,
    })).filter((zone) => zone.price > 0 && Math.abs(zone.distancePct) <= 20)
    : [];
  const scored = zones.map((zone) => ({
    ...zone,
    attractionScore: (
      Math.max(0, finiteNumber(zone.strength, 0))
      * Math.exp(-Math.abs(zone.distancePct) / 8)
      * (1 + Math.min(50, finiteNumber(zone.persistenceBars, 0)) / 100)
    ),
  }));
  const side = (name) => scored
    .filter((zone) => zone.side === name)
    .sort((left, right) => right.attractionScore - left.attractionScore);
  const above = side('ABOVE');
  const below = side('BELOW');
  const aboveScore = above.slice(0, 3).reduce((total, zone) => total + zone.attractionScore, 0);
  const belowScore = below.slice(0, 3).reduce((total, zone) => total + zone.attractionScore, 0);
  const totalScore = aboveScore + belowScore;
  const dominancePct = totalScore > 0 ? ((aboveScore - belowScore) / totalScore) * 100 : 0;
  const common = {
    version: COINGLASS_WEB_ZONE_PROPOSAL_VERSION,
    mode: COINGLASS_WEB_TOP20_MODE,
    referencePrice,
    aboveScore: Number(aboveScore.toFixed(2)),
    belowScore: Number(belowScore.toFixed(2)),
    dominancePct: Number(dominancePct.toFixed(2)),
    affectedTrading: false,
  };
  if (!(referencePrice > 0) || !scored.length) {
    return {
      ...common,
      action: 'NO_DATA',
      label: 'CHƯA ĐỦ VÙNG THANH LÝ',
      targetZone: null,
      riskZone: null,
      rationale: 'Chưa có dữ liệu structured đủ gần giá để đưa ra thiên hướng.',
      confirmation: 'Đăng nhập collector và cào lại dữ liệu Model 3.',
      invalidation: null,
    };
  }
  if (above[0] && aboveScore >= belowScore * 1.25 && above[0].distancePct <= 15) {
    return {
      ...common,
      action: 'WAIT_LONG_CONFIRMATION',
      label: 'ƯU TIÊN CANH LONG',
      targetZone: above[0],
      riskZone: below[0] ?? null,
      rationale: `Lực hút thanh lý phía trên mạnh hơn ${Math.abs(dominancePct).toFixed(0)}% theo điểm cân bằng hai phía.`,
      confirmation: 'Chỉ xem xét LONG sau reclaim/giữ hỗ trợ hoặc breakout-retest; không đuổi market.',
      invalidation: below[0] ? `Mất cấu trúc hoặc đóng dưới vùng ${below[0].price}.` : 'Mất cấu trúc tăng gần nhất.',
    };
  }
  if (below[0] && belowScore >= aboveScore * 1.25 && Math.abs(below[0].distancePct) <= 15) {
    return {
      ...common,
      action: 'WAIT_SHORT_CONFIRMATION',
      label: 'ƯU TIÊN CANH SHORT',
      targetZone: below[0],
      riskZone: above[0] ?? null,
      rationale: `Lực hút thanh lý phía dưới mạnh hơn ${Math.abs(dominancePct).toFixed(0)}% theo điểm cân bằng hai phía.`,
      confirmation: 'Chỉ xem xét SHORT sau sweep-reject hoặc breakdown-retest; không đuổi market.',
      invalidation: above[0] ? `Mất cấu trúc hoặc đóng trên vùng ${above[0].price}.` : 'Mất cấu trúc giảm gần nhất.',
    };
  }
  const strongest = scored.sort((left, right) => right.attractionScore - left.attractionScore)[0] ?? null;
  return {
    ...common,
    action: 'WAIT_BALANCED',
    label: 'CHỜ XÁC NHẬN — HAI PHÍA CÂN BẰNG',
    targetZone: strongest,
    riskZone: strongest?.side === 'ABOVE' ? below[0] ?? null : above[0] ?? null,
    rationale: 'Hai phía chưa chênh đủ 25%, không có lợi thế định hướng rõ.',
    confirmation: 'Chờ giá sweep một vùng rồi reclaim/reject trước khi đánh giá lại.',
    invalidation: 'Không áp dụng vì đây chỉ là quan sát, chưa phải setup vào lệnh.',
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
    this.authFile = join(dataDir, 'auth.json');
    this.running = false;
    this.startedAt = null;
    this.lastError = null;
    this.inflight = null;
    this.loginRunning = false;
    this.loginStartedAt = null;
    this.loginError = null;
    this.loginInflight = null;
  }

  config() {
    return {
      enabled: process.env.COINGLASS_WEB_TOP20_ENABLED !== 'false',
      limit: Math.max(1, Math.min(20, Number(process.env.COINGLASS_WEB_TOP20_LIMIT ?? 20))),
      range: '48h',
      browserMode: process.env.COINGLASS_WEB_BROWSER_MODE ?? 'headed',
      timeoutMs: Math.max(120_000, Number(process.env.COINGLASS_WEB_TOP20_TIMEOUT_MS ?? 12 * 60_000)),
      loginTimeoutMs: Math.max(120_000, Number(process.env.COINGLASS_WEB_LOGIN_TIMEOUT_MS ?? 10 * 60_000)),
    };
  }

  async snapshot() {
    const [saved, progress, auth] = await Promise.all([
      readJson(this.snapshotFile, null),
      this.running ? readJson(this.progressFile, null) : Promise.resolve(null),
      readJson(this.authFile, null),
    ]);
    const savedRows = Array.isArray(saved?.rows) ? saved.rows : [];
    const rows = savedRows
      .map((row) => {
        const heatmapLiquidity = row?.heatmapLiquidity ?? assessCoinglassLiquidity(row?.heatmap, row);
        return {
          ...row,
          heatmapLiquidity,
          proposal: row?.proposal ?? buildCoinglassZoneProposal(row?.heatmap, row),
        };
      })
      .filter((row) => row.heatmapLiquidity.eligible)
      .slice(0, this.config().limit)
      .map((row, index) => ({ ...row, rank: index + 1 }));
    return {
      version: COINGLASS_WEB_TOP20_VERSION,
      mode: COINGLASS_WEB_TOP20_MODE,
      isolation: COINGLASS_WEB_TOP20_ISOLATION,
      config: this.config(),
      running: this.running,
      startedAt: this.startedAt,
      error: this.lastError,
      loginRunning: this.loginRunning,
      loginStartedAt: this.loginStartedAt,
      loginError: this.loginError,
      auth,
      progress,
      updatedAt: saved?.updatedAt ?? null,
      source: saved?.source ? { ...saved.source, viewLiquidityExcluded: Math.max(0, savedRows.length - rows.length) } : null,
      rows,
      failures: Array.isArray(saved?.failures) ? saved.failures : [],
      exclusions: saved?.exclusions ?? { binance: [], coinglass: [] },
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
    if (this.loginRunning) {
      return { accepted: false, reason: 'login_running', snapshot: await this.snapshot() };
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

  async startLogin() {
    const config = this.config();
    if (this.running) return { accepted: false, reason: 'refresh_running', snapshot: await this.snapshot() };
    if (this.loginRunning) return { accepted: false, reason: 'already_running', snapshot: await this.snapshot() };
    await mkdir(this.dataDir, { recursive: true });
    this.loginRunning = true;
    this.loginStartedAt = new Date().toISOString();
    this.loginError = null;
    this.loginInflight = this.runLogin(config.loginTimeoutMs)
      .catch((error) => {
        this.loginError = String(error?.message ?? error);
        console.warn(`[CoinGlassWebTop20] login failed: ${this.loginError}`);
      })
      .finally(() => {
        this.loginRunning = false;
        this.loginInflight = null;
      });
    return { accepted: true, reason: 'manual_login', snapshot: await this.snapshot() };
  }

  async runLogin(timeoutMs) {
    const script = join(this.rootDir, 'scripts', 'open-coinglass-web-login.mjs');
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      script,
      '--data-dir', this.dataDir,
      '--timeout-ms', String(timeoutMs),
    ], {
      cwd: this.rootDir,
      timeout: timeoutMs + 30_000,
      maxBuffer: 2 * 1024 * 1024,
      env: process.env,
    });
    if (stderr?.trim()) console.warn(`[CoinGlassWebTop20] ${stderr.trim()}`);
    const result = JSON.parse(String(stdout).trim() || '{}');
    if (!result.ok) throw new Error(result.error || 'CoinGlass login did not complete');
    return result;
  }

  imageFile(symbol) {
    const safeSymbol = safeCoinglassSymbol(symbol);
    return safeSymbol ? join(this.dataDir, 'images', `${safeSymbol}.png`) : null;
  }
}
