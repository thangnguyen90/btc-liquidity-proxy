import { classifyLiquidityZoneLifecycle } from './localAiTrendChat.js';
import { buildMainKillPriceForecast } from './mainKillPriceForecast.js';

export const LOCAL_AI_MAIN_KILL_GAP_WATCH_VERSION =
  'LOCAL_AI_MAIN_KILL_GAP_WATCH_V2_PRICE_SCENARIO_20261002';

const finite = (value) => value == null || value === ''
  ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 3) => finite(value) == null ? null : Number(Number(value).toFixed(digits));

export function resolveMainKillGapCandidateSource({ evaluation = null, input = null } = {}) {
  if ((evaluation?.candidates ?? []).length) return { ...evaluation, candidateSource: 'AI_EVALUATION' };
  return {
    evaluatedAt: null,
    model: null,
    marketRegime: null,
    marketBias: null,
    candidateSource: 'AI_DETERMINISTIC_SHORTLIST_PENDING_MODEL',
    candidates: (input?.candidates ?? []).slice(0, 10).map((candidate) => ({
      symbol: candidate.symbol,
      side: candidate.side,
      verdict: 'UNRATED',
      strength: null,
      path: 'PENDING_MODEL',
      horizon: null,
    })),
  };
}

function zoneBounds(zone = {}) {
  if (!zone || typeof zone !== 'object') return null;
  const fallback = finite(zone.mid ?? zone.price);
  const low = finite(zone.low) ?? fallback;
  const high = finite(zone.high) ?? fallback;
  if (!(low > 0) || !(high > 0)) return null;
  return { low: Math.min(low, high), high: Math.max(low, high) };
}

function relevantDepthZones(profile = {}, direction) {
  const key = direction === 'UPPER' ? 'askZones' : 'bidZones';
  return [...(profile.near?.[key] ?? []), ...(profile.wide?.[key] ?? [])]
    .flatMap((zone) => {
      const bounds = zoneBounds(zone);
      const notional = finite(zone.orderBookNotional);
      return bounds && notional != null && notional >= 0 ? [{ ...zone, ...bounds, notional }] : [];
    });
}

function zoneIsBetweenMarkAndMain(zone, direction, mark, main) {
  return direction === 'UPPER'
    ? zone.high > mark && zone.low < main.low
    : zone.low < mark && zone.high > main.high;
}

function statusFor({ lifecycle, gapPct, gapAtr, coverageEnough, intermediateSharePct }) {
  if (!lifecycle.active) return lifecycle.state === 'TOUCHING' ? 'TOUCHING_MAIN_KILL' : 'MAIN_KILL_CONSUMED';
  if (!(gapPct > 0)) return 'TOUCHING_MAIN_KILL';
  if (gapAtr == null) return gapPct >= 1.2 ? 'GAP_PCT_ONLY_UNCONFIRMED_ATR' : 'GAP_NARROW';
  const wide = gapPct >= 1.2 && gapAtr >= 2;
  if (!wide) return gapAtr >= 1 ? 'GAP_MEDIUM' : 'GAP_NARROW';
  if (!coverageEnough || intermediateSharePct == null) return 'GAP_WIDE_DEPTH_UNCONFIRMED';
  return intermediateSharePct <= 25
    ? 'GAP_WIDE_VACUUM_CONFIRMED'
    : 'GAP_WIDE_WITH_INTERMEDIATE_DEPTH';
}

export function assessLocalAiMainKillGap({ candidate = {}, analysis = {} } = {}) {
  const current = analysis.liqScan?.current
    ?? (analysis.liqScan?.dominantSide ? analysis.liqScan : null);
  const mark = finite(analysis.market?.markPrice ?? current?.markPrice);
  const mainZone = current?.killZoneCluster?.mainKillZone ?? current?.mainKillZone ?? null;
  const main = zoneBounds(mainZone);
  const direction = current?.dominantSide === 'ABOVE' ? 'UPPER'
    : current?.dominantSide === 'BELOW' ? 'LOWER'
      : ['UPPER', 'LOWER'].includes(String(mainZone?.direction ?? '').toUpperCase())
        ? String(mainZone.direction).toUpperCase() : null;
  const frame15m = (analysis.trend?.frames ?? []).find((frame) => frame.interval === '15m');
  const atr15mPct = finite(frame15m?.atrPct);
  const lifecycle = classifyLiquidityZoneLifecycle({
    direction,
    zone: mainZone,
    markPrice: mark,
    sweepRejectShort: analysis.liqScan?.sweepRejectShort,
    sweepRejectLong: analysis.liqScan?.sweepRejectLong,
  });
  if (!(mark > 0) || !main || !direction) {
    return {
      version: LOCAL_AI_MAIN_KILL_GAP_WATCH_VERSION,
      symbol: String(candidate.symbol ?? analysis.symbol ?? '').toUpperCase(),
      side: String(candidate.side ?? '').toUpperCase() || null,
      verdict: candidate.verdict ?? null,
      strength: finite(candidate.strength),
      status: 'NO_ACTIVE_MAIN_KILL',
      observeOnly: true,
      binanceEligible: false,
    };
  }

  const nearestEdge = direction === 'UPPER' ? main.low : main.high;
  const rawGapPrice = direction === 'UPPER' ? nearestEdge - mark : mark - nearestEdge;
  const gapPrice = Math.max(0, rawGapPrice);
  const gapPct = gapPrice / mark * 100;
  const gapAtr = atr15mPct != null && atr15mPct > 0 ? gapPct / atr15mPct : null;
  const profile = analysis.orderBookProfile ?? {};
  const coverageSide = direction === 'UPPER' ? profile.coverage?.ask : profile.coverage?.bid;
  const coveragePct = finite(coverageSide?.farthestDistancePct);
  const coverageEnough = coveragePct != null && coveragePct + 0.05 >= gapPct;
  const depthZones = relevantDepthZones(profile, direction);
  const intermediateZones = depthZones.filter((zone) => zoneIsBetweenMarkAndMain(zone, direction, mark, main));
  const visibleTopNotionalUsd = depthZones.reduce((sum, zone) => sum + zone.notional, 0);
  const intermediateTopNotionalUsd = intermediateZones.reduce((sum, zone) => sum + zone.notional, 0);
  const intermediateSharePct = visibleTopNotionalUsd > 0
    ? intermediateTopNotionalUsd / visibleTopNotionalUsd * 100 : null;
  const status = statusFor({
    lifecycle, gapPct, gapAtr, coverageEnough, intermediateSharePct,
  });
  return {
    version: LOCAL_AI_MAIN_KILL_GAP_WATCH_VERSION,
    symbol: String(candidate.symbol ?? analysis.symbol ?? '').toUpperCase(),
    side: String(candidate.side ?? '').toUpperCase() || null,
    verdict: candidate.verdict ?? null,
    strength: finite(candidate.strength),
    path: candidate.path ?? null,
    aiHorizon: candidate.horizon ?? null,
    markPrice: round(mark, 10),
    direction,
    mainKillZone: {
      low: round(main.low, 10), high: round(main.high, 10),
      scoreUsdProxy: round(mainZone?.score, 2),
    },
    lifecycle: {
      state: lifecycle.state, label: lifecycle.label, active: lifecycle.active,
    },
    atr15mPct: round(atr15mPct, 3),
    gapPrice: round(gapPrice, 10),
    gapPct: round(gapPct, 3),
    gapAtr: round(gapAtr, 2),
    depth: {
      source: profile.source ?? 'BINANCE_FUTURES_DEPTH',
      side: direction === 'UPPER' ? 'ASK' : 'BID',
      coveragePct: round(coveragePct, 3),
      coverageEnough,
      intermediateTopZoneCount: intermediateZones.length,
      intermediateTopNotionalUsd: round(intermediateTopNotionalUsd, 2),
      visibleTopNotionalUsd: round(visibleTopNotionalUsd, 2),
      intermediateSharePct: round(intermediateSharePct, 1),
      method: 'TOP_NEAR_WIDE_ZONE_SHARE',
    },
    status,
    wideGap: ['GAP_WIDE_VACUUM_CONFIRMED', 'GAP_WIDE_WITH_INTERMEDIATE_DEPTH', 'GAP_WIDE_DEPTH_UNCONFIRMED'].includes(status),
    vacuumConfirmed: status === 'GAP_WIDE_VACUUM_CONFIRMED',
    stale: analysis.freshness?.stale === true,
    generatedAt: analysis.generatedAt ?? null,
    observeOnly: true,
    binanceEligible: false,
  };
}

export function buildLocalAiMainKillGapWatchSnapshot({ evaluation = null, analyses = [], now = Date.now() } = {}) {
  const bySymbol = new Map((analyses ?? []).map((analysis) => [String(analysis?.symbol ?? '').toUpperCase(), analysis]));
  const rows = (evaluation?.candidates ?? []).slice(0, 10).map((candidate) => {
    const analysis = bySymbol.get(String(candidate.symbol ?? '').toUpperCase()) ?? {};
    const gap = assessLocalAiMainKillGap({ candidate, analysis });
    return { ...gap, priceForecast: buildMainKillPriceForecast({ analysis, gap, evaluation: evaluation ?? {}, now }) };
  }).sort((left, right) => {
    const rank = (row) => row.status === 'GAP_WIDE_VACUUM_CONFIRMED' ? 5
      : row.status === 'GAP_WIDE_WITH_INTERMEDIATE_DEPTH' ? 4
        : row.status === 'GAP_WIDE_DEPTH_UNCONFIRMED' ? 3
          : row.status === 'GAP_MEDIUM' ? 2 : 1;
    return rank(right) - rank(left) || (right.gapAtr ?? -1) - (left.gapAtr ?? -1);
  });
  return {
    version: LOCAL_AI_MAIN_KILL_GAP_WATCH_VERSION,
    generatedAt: Date.now(),
    evaluationAt: evaluation?.evaluatedAt ?? null,
    model: evaluation?.model ?? null,
    marketRegime: evaluation?.marketRegime ?? null,
    marketBias: evaluation?.marketBias ?? null,
    candidateSource: evaluation?.candidateSource ?? 'AI_EVALUATION',
    observeOnly: true,
    binanceEligible: false,
    methodology: {
      wideMinGapPct: 1.2,
      wideMinAtr: 2,
      vacuumMaxIntermediateTopDepthSharePct: 25,
      requiresDepthCoverageToMainEdge: true,
    },
    counts: {
      candidates: rows.length,
      wide: rows.filter((row) => row.wideGap).length,
      vacuumConfirmed: rows.filter((row) => row.vacuumConfirmed).length,
      depthUnconfirmed: rows.filter((row) => row.status === 'GAP_WIDE_DEPTH_UNCONFIRMED').length,
    },
    rows,
  };
}
