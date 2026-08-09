export const RECOMMENDED_SUPPORT_ENTRY_VERSION =
  "recommended-support-entry-shadow-v2-source-split";

export const RECOMMENDED_SUPPORT_ENTRY_RULES = Object.freeze({
  minScoreGap: 15,
  confirmationSamples: 2,
  maxFlipAgeMinutes: 180,
});

const CLASSIFICATIONS = new Set(["GOOD", "BAD", "OTHER", "NO_DATA"]);

function finite(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function sideOf(trade = {}) {
  const side = upper(trade?.side ?? trade?.action);
  if (side.includes("LONG")) return "LONG";
  if (side.includes("SHORT")) return "SHORT";
  return "NO_SIDE";
}

function sourceOf(trade = {}) {
  const source = upper(trade?.sourcePage ?? trade?.source ?? "UNKNOWN");
  if (source.includes("LIQUID")) return "LIQUID";
  if (source.includes("EDGE")) return "EDGE";
  if (source.includes("EMA")) return "EMA";
  if (source.includes("PUMP")) return "PUMP";
  return source || "UNKNOWN";
}

function marketSampleOf(trade = {}) {
  const snapshot = trade?.marketDirectionAtSignal;
  if (!snapshot || typeof snapshot !== "object") return null;
  const dynamics = snapshot?.scoreDynamics;
  const sampleKey = String(
    snapshot?.sampleKey ?? dynamics?.sampleKey ?? "",
  );
  const evaluatedAt = finite(
    snapshot?.evaluatedAt ??
      dynamics?.evaluatedAt ??
      Date.parse(trade?.openedAt ?? trade?.createdAt ?? ""),
  );
  const longScore = finite(snapshot?.scores?.long ?? dynamics?.longScore);
  const shortScore = finite(snapshot?.scores?.short ?? dynamics?.shortScore);
  if (!sampleKey || evaluatedAt == null || longScore == null || shortScore == null) {
    return null;
  }
  return { sampleKey, evaluatedAt, longScore, shortScore };
}

function rawSupport(sample, minScoreGap) {
  const gap = sample.longScore - sample.shortScore;
  if (gap >= minScoreGap) return "LONG";
  if (gap <= -minScoreGap) return "SHORT";
  return "BALANCED";
}

export function buildRecommendedSupportStateBySampleKey(
  trades = [],
  rules = RECOMMENDED_SUPPORT_ENTRY_RULES,
) {
  const samplesByKey = new Map();
  for (const trade of trades ?? []) {
    const sample = marketSampleOf(trade);
    if (!sample) continue;
    const previous = samplesByKey.get(sample.sampleKey);
    if (!previous || sample.evaluatedAt >= previous.evaluatedAt) {
      samplesByKey.set(sample.sampleKey, sample);
    }
  }

  const ordered = [...samplesByKey.values()].sort(
    (left, right) => left.evaluatedAt - right.evaluatedAt,
  );
  const stateBySampleKey = new Map();
  let committedSupport = "BALANCED";
  let candidateSupport = null;
  let candidateSamples = 0;
  let lastDirectionalSupport = null;
  let lastFlip = null;

  for (const sample of ordered) {
    const raw = rawSupport(sample, rules.minScoreGap);
    if (raw === committedSupport) {
      candidateSupport = null;
      candidateSamples = 0;
    } else {
      if (raw === candidateSupport) candidateSamples += 1;
      else {
        candidateSupport = raw;
        candidateSamples = 1;
      }
      if (candidateSamples >= rules.confirmationSamples) {
        committedSupport = raw;
        candidateSupport = null;
        candidateSamples = 0;
        if (["LONG", "SHORT"].includes(committedSupport)) {
          if (
            lastDirectionalSupport &&
            committedSupport !== lastDirectionalSupport
          ) {
            lastFlip = {
              from: lastDirectionalSupport,
              to: committedSupport,
              at: sample.evaluatedAt,
            };
          }
          lastDirectionalSupport = committedSupport;
        }
      }
    }

    const flipAgeMinutes = lastFlip
      ? Math.max(0, (sample.evaluatedAt - lastFlip.at) / 60_000)
      : null;
    stateBySampleKey.set(sample.sampleKey, {
      sampleKey: sample.sampleKey,
      evaluatedAt: sample.evaluatedAt,
      longScore: sample.longScore,
      shortScore: sample.shortScore,
      scoreGap: sample.longScore - sample.shortScore,
      rawSupport: raw,
      support: committedSupport,
      candidateSupport,
      candidateSamples,
      flipFrom: lastFlip?.from ?? null,
      flipTo: lastFlip?.to ?? null,
      flipAt: lastFlip?.at ?? null,
      flipAgeMinutes,
      flipConfirmed: Boolean(
        lastFlip &&
          committedSupport === lastFlip.to &&
          flipAgeMinutes <= rules.maxFlipAgeMinutes,
      ),
    });
  }
  return stateBySampleKey;
}

function classificationFor(trade, state, rules) {
  const source = sourceOf(trade);
  const side = sideOf(trade);
  if (!state) {
    return {
      classification: "NO_DATA",
      code: "SUPPORT_ENTRY_NO_DATA",
      tier: "WATCH",
      label: "ENTRY · NO DATA",
      cohortLabel: `ENTRY NO DATA · ${source} ${side}`,
      phase: "NO_DATA",
    };
  }
  const recentFlip = Boolean(
    state.flipConfirmed &&
      state.flipAgeMinutes != null &&
      state.flipAgeMinutes <= rules.maxFlipAgeMinutes,
  );
  const aligned = ["LONG", "SHORT"].includes(state.support)
    ? side === state.support
    : false;
  const oldSide = recentFlip && side === state.flipFrom && state.support === state.flipTo;

  if (recentFlip && source === "EDGE" && side === "SHORT" && aligned) {
    return {
      classification: "GOOD",
      code: "EDGE_SHORT_SUPPORT_ALIGNED",
      tier: "GOOD",
      label: "ENTRY ĐẸP · EDGE SHORT THEO SUPPORT",
      cohortLabel: "ENTRY FLIP · EDGE SHORT ALIGNED",
      phase: "POST_FLIP_ALIGNED",
    };
  }
  if (
    recentFlip &&
    source === "LIQUID" &&
    side === "SHORT" &&
    oldSide &&
    state.support === "LONG"
  ) {
    return {
      classification: "GOOD",
      code: "LIQUID_SHORT_POST_FLIP_OLD_SIDE",
      tier: "GOOD",
      label: "ENTRY ĐẸP · LIQUID SHORT GIỮ HƯỚNG CŨ",
      cohortLabel: "ENTRY FLIP · LIQUID SHORT OLD SIDE",
      phase: "POST_FLIP_OLD_SIDE",
    };
  }
  const provenBadAligned =
    (side === "SHORT" && ["LIQUID", "EMA", "PUMP"].includes(source)) ||
    (side === "LONG" && ["LIQUID", "EDGE"].includes(source));
  if (recentFlip && aligned && provenBadAligned) {
    return {
      classification: "BAD",
      code: `${source}_${side}_SUPPORT_ALIGNED_BAD_WATCH`,
      tier: "RISK",
      label: "ENTRY XẤU · SUPPORT KHÔNG HỢP SOURCE",
      cohortLabel: `ENTRY FLIP · ${source} ${side} ALIGNED`,
      phase: "POST_FLIP_ALIGNED",
    };
  }
  const cohortRelation = oldSide
    ? "OLD SIDE"
    : aligned
      ? "ALIGNED"
      : "COUNTER";
  return {
    classification: "OTHER",
    code: recentFlip
      ? `${source}_${side}_POST_FLIP_OTHER`
      : "SUPPORT_ENTRY_OUTSIDE_RECENT_FLIP",
    tier: "WATCH",
    label: "ENTRY · CHƯA PHÂN NHÓM",
    cohortLabel: recentFlip
      ? `ENTRY FLIP · ${source} ${side} ${cohortRelation}`
      : `ENTRY OUTSIDE · ${source} ${side}`,
    phase: recentFlip ? `POST_FLIP_${cohortRelation.replaceAll(" ", "_")}` : "OUTSIDE_FLIP",
  };
}

function sourceQualitySplitFor(trade, view, source, side) {
  if (
    view?.classification !== "GOOD" ||
    side !== "SHORT" ||
    !["EDGE", "LIQUID"].includes(source)
  ) {
    return null;
  }
  const sourceLayer = upper(trade?.recommendedSourceLayer) || "NO_DATA";
  const quality = sourceLayer === "GOOD" ? "CONFIRMED" : "WEAK";
  return {
    key: `${source}_${quality}`,
    code: `ENTRY_SUPPORT_${source}_${quality}`,
    label: `ENTRY SUPPORT · ${source} ${quality}`,
    tier: quality === "CONFIRMED" ? "GOOD" : "RISK",
    sourceLayer,
    reason:
      `Nhóm xanh ${view.cohortLabel} × SOURCE L1 ${sourceLayer} => ${source} ${quality} · ` +
      "OBSERVE ONLY",
  };
}

export function buildRecommendedSupportEntrySnapshot(
  trade = {},
  state = null,
  rules = RECOMMENDED_SUPPORT_ENTRY_RULES,
) {
  const view = classificationFor(trade, state, rules);
  const source = sourceOf(trade);
  const side = sideOf(trade);
  const sourceQuality = sourceQualitySplitFor(trade, view, source, side);
  const relation = !state || state.support === "BALANCED"
    ? "NEUTRAL"
    : side === state.support
      ? "ALIGNED"
      : "COUNTER";
  const age = state?.flipAgeMinutes;
  const reason = state
    ? `${source} ${side} · support ${state.support} · LONG ${state.longScore.toFixed(0)} vs SHORT ${state.shortScore.toFixed(0)} · ` +
      `flip ${state.flipFrom ?? "-"} → ${state.flipTo ?? "-"} · ${age == null ? "không có mốc flip" : `${age.toFixed(1)} phút sau flip`} · ` +
      `${view.label} · OBSERVE ONLY`
    : "Thiếu chuỗi snapshot điểm causal trước entry · OBSERVE ONLY";
  return {
    recommendedSupportEntryClass: CLASSIFICATIONS.has(view.classification)
      ? view.classification
      : "NO_DATA",
    recommendedSupportEntryTier: view.tier,
    recommendedSupportEntryCode: view.code,
    recommendedSupportEntryLabel: view.label,
    recommendedSupportEntryCohortKey: `${source}_${side}_${view.phase ?? "NO_DATA"}`,
    recommendedSupportEntryCohortLabel:
      view.cohortLabel ?? `ENTRY NO DATA · ${source} ${side}`,
    recommendedSupportEntryCohortTier: view.tier,
    recommendedSupportEntrySourceQualityKey: sourceQuality?.key ?? null,
    recommendedSupportEntrySourceQualityCode: sourceQuality?.code ?? null,
    recommendedSupportEntrySourceQualityLabel: sourceQuality?.label ?? null,
    recommendedSupportEntrySourceQualityTier: sourceQuality?.tier ?? null,
    recommendedSupportEntrySourceQualitySourceLayer:
      sourceQuality?.sourceLayer ?? null,
    recommendedSupportEntrySourceQualityReason: sourceQuality?.reason ?? null,
    recommendedSupportEntryPhase: view.phase ?? "NO_DATA",
    recommendedSupportEntryReason: reason,
    recommendedSupportEntrySource: source,
    recommendedSupportEntrySide: side,
    recommendedSupportEntryRelation: relation,
    recommendedSupportEntrySupport: state?.support ?? "NO_DATA",
    recommendedSupportEntryLongScore: state?.longScore ?? null,
    recommendedSupportEntryShortScore: state?.shortScore ?? null,
    recommendedSupportEntryScoreGap: state?.scoreGap ?? null,
    recommendedSupportEntryFlipFrom: state?.flipFrom ?? null,
    recommendedSupportEntryFlipTo: state?.flipTo ?? null,
    recommendedSupportEntryFlipAt: state?.flipAt ?? null,
    recommendedSupportEntryFlipAgeMinutes: age ?? null,
    recommendedSupportEntryVersion: RECOMMENDED_SUPPORT_ENTRY_VERSION,
    recommendedSupportEntryObservationOnly: true,
    recommendedSupportEntryAffectsEntry: false,
    recommendedSupportEntryAffectsOrders: false,
    recommendedSupportEntryAffectsMargin: false,
    recommendedSupportEntryAffectsSize: false,
    recommendedSupportEntryAffectsSl: false,
    recommendedSupportEntryAffectsTp: false,
  };
}

export function decorateRecommendedSupportEntrySnapshots(
  trades = [],
  rules = RECOMMENDED_SUPPORT_ENTRY_RULES,
) {
  const stateBySampleKey = buildRecommendedSupportStateBySampleKey(
    trades,
    rules,
  );
  return (trades ?? []).map((trade) => {
    const sample = marketSampleOf(trade);
    const state = sample ? stateBySampleKey.get(sample.sampleKey) : null;
    return {
      ...trade,
      ...buildRecommendedSupportEntrySnapshot(trade, state, rules),
    };
  });
}

export function buildRecommendedSupportEntryStatRows(
  trades = [],
  { sourcePage = null, rules = RECOMMENDED_SUPPORT_ENTRY_RULES } = {},
) {
  const stateBySampleKey = buildRecommendedSupportStateBySampleKey(
    trades,
    rules,
  );
  return (trades ?? []).map((trade) => {
    const sample = marketSampleOf(trade);
    const state = sample ? stateBySampleKey.get(sample.sampleKey) : null;
    const viewTrade = sourcePage
      ? {
          sourcePage,
          source: trade?.source,
          side: trade?.side,
          action: trade?.action,
          recommendedSourceLayer: trade?.recommendedSourceLayer,
        }
      : trade;
    return {
      id: trade?.id,
      sourcePage: sourcePage ?? trade?.sourcePage,
      source: trade?.source,
      side: trade?.side,
      action: trade?.action,
      status: trade?.status,
      pnl: trade?.pnl ?? trade?.netPnl,
      netPnl: trade?.netPnl,
      roe: trade?.roe ?? trade?.netRoe,
      netRoe: trade?.netRoe,
      activeDateUtc: trade?.activeDateUtc,
      createdAt: trade?.createdAt,
      openedAt: trade?.openedAt,
      closedAt: trade?.closedAt,
      ...buildRecommendedSupportEntrySnapshot(viewTrade, state, rules),
    };
  });
}
