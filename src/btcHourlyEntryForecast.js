import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import {
  BTC_HOURLY_ENTRY_FORECAST_CARD_VERSION,
  btcHourlyEntryForecastTradeKey,
} from '../public/btc-hourly-entry-forecast-model.js';

export const BTC_HOURLY_ENTRY_FORECAST_VERSION = 'BTC_HOURLY_ENTRY_FORECAST_V3_ALL_SIZES_CLEAR_BEST_HOURS_20261001';
const LEGACY_ALL_SIZE_FORECAST_VERSION = 'BTC_HOURLY_ENTRY_FORECAST_V2_ALL_SIZES_BTC_PROFILE_20261001';
const LEGACY_BTC_HOURLY_ENTRY_FORECAST_VERSION = 'BTC_HOURLY_ENTRY_FORECAST_V1_DAILY_CAUSAL_20261001';
const SUPPORTED_FORECAST_VERSIONS = new Set([
  BTC_HOURLY_ENTRY_FORECAST_VERSION,
  LEGACY_ALL_SIZE_FORECAST_VERSION,
  LEGACY_BTC_HOURLY_ENTRY_FORECAST_VERSION,
]);

const execFileAsync = promisify(execFile);
const VN_OFFSET_MS = 7 * 60 * 60_000;

function finite(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hourVn(now = Date.now()) {
  return new Date(Number(now) + VN_OFFSET_MS).getUTCHours();
}

function normalizeTrend(value) {
  const trend = String(value ?? '').trim().toUpperCase();
  return ['UP', 'DOWN', 'FLAT'].includes(trend) ? trend : 'UNKNOWN';
}

function btcMomentum15m(value) {
  const parsed = finite(value);
  return parsed == null ? 'UNKNOWN' : parsed > 0 ? 'RISING' : parsed < 0 ? 'FALLING' : 'FLAT';
}

function btcMove1h(value) {
  const parsed = finite(value);
  return parsed == null ? 'UNKNOWN' : parsed >= 0.3 ? 'UP_GE_0_3'
    : parsed <= -0.3 ? 'DOWN_LE_NEG_0_3' : 'SMALL_MOVE';
}

function emptySide() {
  return {
    entries: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    winRate: null,
    netPnl: 0,
    avgNetPnl: null,
    avgRoe: null,
    profitFactor: null,
    qualityScore: null,
    closedCycles: 0,
  };
}

function sideStats(row, side) {
  return row?.sides?.[side] && typeof row.sides[side] === 'object'
    ? row.sides[side]
    : emptySide();
}

function weightedQuality(base, conditioned, profile, thresholds) {
  const baseScore = finite(base?.qualityScore);
  const conditionedScore = finite(conditioned?.qualityScore);
  const profileScore = finite(profile?.qualityScore);
  const baseEligible = Number(base?.closed ?? 0) >= Number(thresholds?.baseMinClosed ?? 12)
    && baseScore != null;
  const conditionedEligible = Number(conditioned?.closed ?? 0) >= Number(
    thresholds?.btcConditionedMinClosed ?? 6,
  ) && conditionedScore != null;
  const profileEligible = Number(profile?.closed ?? 0) >= Number(
    thresholds?.btcProfileMinClosed ?? 4,
  ) && profileScore != null;
  if (!baseEligible && !conditionedEligible && !profileEligible) {
    return { score: null, source: 'INSUFFICIENT_SAMPLE', baseEligible, conditionedEligible, profileEligible };
  }
  if (profileEligible) {
    const supports = [
      ...(baseEligible ? [{ score: baseScore, weight: conditionedEligible ? 0.25 : 0.35 }] : []),
      ...(conditionedEligible ? [{ score: conditionedScore, weight: baseEligible ? 0.25 : 0.35 }] : []),
      { score: profileScore, weight: baseEligible || conditionedEligible ? 0.5 : 1 },
    ];
    const totalWeight = supports.reduce((sum, item) => sum + item.weight, 0);
    return {
      score: Math.round((supports.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight) * 10) / 10,
      source: baseEligible || conditionedEligible ? 'GIỜ + BTC PROFILE' : 'BTC_PROFILE_MẪU_NHỎ',
      baseEligible,
      conditionedEligible,
      profileEligible,
    };
  }
  if (baseEligible && conditionedEligible) {
    return {
      score: Math.round((baseScore * 0.35 + conditionedScore * 0.65) * 10) / 10,
      source: 'GIỜ + BTC',
      baseEligible,
      conditionedEligible,
      profileEligible,
    };
  }
  return {
    score: baseEligible ? baseScore : conditionedScore,
    source: baseEligible ? 'GIỜ' : 'BTC_MẪU_NHỎ',
    baseEligible,
    conditionedEligible,
    profileEligible,
  };
}

export function classifyBtcHourlyEntrySlot({
  hourRow,
  btcRow = null,
  btcProfileRow = null,
  thresholds = {},
} = {}) {
  const longBase = sideStats(hourRow, 'LONG');
  const shortBase = sideStats(hourRow, 'SHORT');
  const longConditioned = sideStats(btcRow, 'LONG');
  const shortConditioned = sideStats(btcRow, 'SHORT');
  const longProfile = sideStats(btcProfileRow, 'LONG');
  const shortProfile = sideStats(btcProfileRow, 'SHORT');
  const long = weightedQuality(longBase, longConditioned, longProfile, thresholds);
  const short = weightedQuality(shortBase, shortConditioned, shortProfile, thresholds);
  const minimumScore = Number(thresholds.minimumScore ?? 53);
  const minimumEdge = Number(thresholds.minimumEdge ?? 4);
  const longScore = finite(long.score);
  const shortScore = finite(short.score);
  const edge = longScore != null && shortScore != null ? Math.round((longScore - shortScore) * 10) / 10 : null;

  let direction = 'NEUTRAL';
  if (longScore != null && longScore >= minimumScore
    && (shortScore == null || longScore - shortScore >= minimumEdge)) direction = 'LONG';
  if (shortScore != null && shortScore >= minimumScore
    && (longScore == null || shortScore - longScore >= minimumEdge)) direction = 'SHORT';

  const selected = direction === 'LONG' ? { base: longBase, conditioned: longConditioned, profile: longProfile, quality: long }
    : direction === 'SHORT' ? { base: shortBase, conditioned: shortConditioned, profile: shortProfile, quality: short }
      : null;
  return {
    direction,
    edge,
    long: { ...long, base: longBase, conditioned: longConditioned },
    short: { ...short, base: shortBase, conditioned: shortConditioned },
    selected,
    observationOnly: true,
    affectsBinance: false,
  };
}

export function buildBtcHourlyEntryForecastSnapshot(cache, { btcHealth = {}, now = Date.now() } = {}) {
  if (!cache || !SUPPORTED_FORECAST_VERSIONS.has(cache.version)) {
    return {
      version: BTC_HOURLY_ENTRY_FORECAST_VERSION,
      ready: false,
      reason: 'DAILY_CACHE_NOT_READY',
      observationOnly: true,
      affectsBinance: false,
    };
  }
  const currentHourVn = hourVn(now);
  const btcTrend = normalizeTrend(btcHealth.btcTrendDir);
  const hourRows = Array.isArray(cache.hourly) ? cache.hourly : [];
  const btcRows = Array.isArray(cache.hourlyByBtcTrend) ? cache.hourlyByBtcTrend : [];
  const btcProfileRows = Array.isArray(cache.hourlyByBtcProfile) ? cache.hourlyByBtcProfile : [];
  const currentMomentum15m = btcMomentum15m(btcHealth.btcRelativeReturn15mPct);
  const currentMove1h = btcMove1h(btcHealth.btcRelativeReturn1hPct);
  const classifyHour = (hour, trend = 'UNKNOWN', includeCurrentProfile = false) => {
    const hourRow = hourRows.find((row) => Number(row.hourVn) === hour) ?? { hourVn: hour, sides: {} };
    const btcRow = trend === 'UNKNOWN' ? null : btcRows.find((row) => (
      Number(row.hourVn) === hour && normalizeTrend(row.btcTrend) === trend
    ));
    const btcProfileRow = trend === 'UNKNOWN' || !includeCurrentProfile ? null : btcProfileRows.find((row) => (
      Number(row.hourVn) === hour
      && normalizeTrend(row.btcTrend) === trend
      && row.btcMomentum15m === currentMomentum15m
      && row.btcMove1h === currentMove1h
    ));
    return {
      hourVn: hour,
      btcTrend: trend,
      btcProfile: trend === 'UNKNOWN' || !includeCurrentProfile ? null : {
        trend,
        momentum15m: currentMomentum15m,
        move1h: currentMove1h,
      },
      ...classifyBtcHourlyEntrySlot({ hourRow, btcRow, btcProfileRow, thresholds: cache.thresholds }),
    };
  };

  const classifiedCurrent = classifyHour(currentHourVn, btcTrend, true);
  const whitelistObservation = {
    version: BTC_HOURLY_ENTRY_FORECAST_CARD_VERSION,
    direction: classifiedCurrent.direction,
  };
  const current = {
    ...classifiedCurrent,
    whitelistKey: btcHourlyEntryForecastTradeKey({
      btcHourlyEntryForecastObservation: whitelistObservation,
    }),
    whitelistObservation,
  };
  const schedule = Array.from({ length: 24 }, (_, hour) => classifyHour(hour));
  const btcTrendSchedule = Array.from({ length: 24 }, (_, hour) => (
    ['UP', 'DOWN', 'FLAT'].map((trend) => classifyHour(hour, trend))
  )).flat();
  const rankedBtcTrendSlots = btcTrendSchedule.filter((slot) => (
    slot.direction !== 'NEUTRAL'
    && slot.selected?.quality?.conditionedEligible === true
  )).map((slot) => ({
    hourVn: slot.hourVn,
    direction: slot.direction,
    btcTrend: slot.btcTrend,
    qualityScore: finite(slot.selected?.quality?.score),
    closed: Number(slot.selected?.conditioned?.closed ?? 0),
    winRate: finite(slot.selected?.conditioned?.winRate),
    avgRoe: finite(slot.selected?.conditioned?.avgRoe),
    profitFactor: finite(slot.selected?.conditioned?.profitFactor),
    source: slot.selected?.quality?.source ?? 'GIỜ + BTC',
  })).sort((left, right) => Number(right.qualityScore ?? 0) - Number(left.qualityScore ?? 0)
    || right.closed - left.closed || left.hourVn - right.hourVn);
  const bestByBtcTrend = {
    LONG: rankedBtcTrendSlots.filter((slot) => slot.direction === 'LONG').slice(0, 8),
    SHORT: rankedBtcTrendSlots.filter((slot) => slot.direction === 'SHORT').slice(0, 8),
  };
  const nextSlots = Array.from({ length: 23 }, (_, offset) => (currentHourVn + offset + 1) % 24)
    .map((hour, offset) => ({ ...schedule[hour], hoursFromNow: offset + 1 }))
    .filter((slot) => slot.direction !== 'NEUTRAL')
    .sort((left, right) => left.hoursFromNow - right.hoursFromNow
      || Math.abs(Number(right.edge ?? 0)) - Math.abs(Number(left.edge ?? 0)))
    .slice(0, 4);

  return {
    ...cache,
    ready: true,
    currentHourVn,
    currentBtc: {
      trend: btcTrend,
      trendScore: finite(btcHealth.btcTrendScore),
      trend4h: normalizeTrend(btcHealth.btcTrendDir4h),
      trendScore4h: finite(btcHealth.btcTrendScore4h),
      return15mPct: finite(btcHealth.btcRelativeReturn15mPct),
      return1hPct: finite(btcHealth.btcRelativeReturn1hPct),
      momentum15m: currentMomentum15m,
      move1h: currentMove1h,
      updatedAt: finite(btcHealth.updatedAt),
    },
    current,
    schedule,
    btcTrendSchedule,
    bestByBtcTrend,
    nextSlots,
    observationOnly: true,
    affectsBinance: false,
  };
}

export class BtcHourlyEntryForecastService {
  constructor({ file, script, python = process.env.PYTHON_BIN || 'python3' } = {}) {
    this.file = file;
    this.script = script;
    this.python = python;
    this.cache = null;
    this.fileMtimeMs = 0;
    this.running = false;
    this.lastError = null;
    this.lastRebuildAt = 0;
  }

  async load({ force = false } = {}) {
    try {
      const info = await stat(this.file);
      if (!force && this.cache && info.mtimeMs <= this.fileMtimeMs) return this.cache;
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      if (!SUPPORTED_FORECAST_VERSIONS.has(parsed.version)) {
        throw new Error(`Unsupported hourly forecast version ${parsed.version ?? 'UNKNOWN'}`);
      }
      this.cache = parsed;
      this.fileMtimeMs = info.mtimeMs;
      this.lastError = null;
      return parsed;
    } catch (error) {
      if (error.code !== 'ENOENT') this.lastError = error.message;
      return this.cache;
    }
  }

  async rebuild() {
    if (this.running) return { running: true, rebuilt: false };
    this.running = true;
    try {
      await execFileAsync(this.python, [this.script], {
        timeout: 10 * 60_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      await this.load({ force: true });
      this.lastRebuildAt = Date.now();
      this.lastError = null;
      return { running: false, rebuilt: true, generatedAt: this.cache?.generatedAt ?? null };
    } catch (error) {
      this.lastError = error.message;
      throw error;
    } finally {
      this.running = false;
    }
  }

  async snapshot({ btcHealth = {}, now = Date.now() } = {}) {
    await this.load();
    return {
      ...buildBtcHourlyEntryForecastSnapshot(this.cache, { btcHealth, now }),
      rebuild: {
        running: this.running,
        lastRebuildAt: this.lastRebuildAt || null,
        error: this.lastError,
      },
    };
  }
}
