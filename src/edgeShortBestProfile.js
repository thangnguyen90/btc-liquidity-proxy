export const EDGE_SHORT_BEST_PROFILE_VERSION = 'edge-short-best-profile-observe-v1';
export const EDGE_SHORT_BEST_RISK_PHASE_VERSION = 'edge-short-best-risk-day-point-observe-v1';
export const EDGE_SHORT_BEST_RISK_BEAR_PCT24H = -1;
export const EDGE_SHORT_BEST_RISK_BULL_PCT24H = 1;

const PROFILE_ORDER = [
  'SHORT_FIT',
  'PHASE_RISK',
  'SHORT_OTHER',
  'TIER_B_TEST',
  'LONG_UP',
];

const PROFILE_META = {
  SHORT_FIT: {
    label: 'SE BEST SHORT FIT',
    tone: 'GOOD',
  },
  PHASE_RISK: {
    label: 'SE BEST PHASE RISK',
    tone: 'RISK',
  },
  SHORT_OTHER: {
    label: 'SE BEST SHORT OTHER',
    tone: 'WATCH',
  },
  TIER_B_TEST: {
    label: 'SE BEST TIER B TEST',
    tone: 'WATCH',
  },
  LONG_UP: {
    label: 'SE BEST LONG / UP',
    tone: 'RISK',
  },
  N_A: {
    label: 'SE BEST PROFILE N/A',
    tone: 'NO_DATA',
  },
};

const PROFILE_SNAPSHOT_FIELDS = [
  'edgeShortBestProfileEligible',
  'edgeShortBestProfileKey',
  'edgeShortBestProfileLabel',
  'edgeShortBestProfileTone',
  'edgeShortBestProfileSide',
  'edgeShortBestProfileTier',
  'edgeShortBestProfileSetup',
  'edgeShortBestProfileBtcPhase',
  'edgeShortBestProfileMarketLabel',
  'edgeShortBestProfileShortWave',
  'edgeShortBestProfileShortScore',
  'edgeShortBestProfileReason',
  'edgeShortBestProfileVersion',
  'edgeShortBestProfileObservationOnly',
  'edgeShortBestProfileAffectsEntry',
  'edgeShortBestProfileAffectsMargin',
  'edgeShortBestProfileAffectsSl',
  'edgeShortBestProfileAffectsTp',
  'edgeShortBestProfileDerived',
];

const RISK_PHASE_ORDER = [
  'DAY_BEAR_CONTINUE',
  'NEUTRAL_REVERSAL',
  'MIXED_WATCH',
];

const RISK_PHASE_META = {
  DAY_BEAR_CONTINUE: {
    label: 'RISK DAY BEAR CONTINUE',
    tone: 'GOOD',
  },
  NEUTRAL_REVERSAL: {
    label: 'RISK NEUTRAL REVERSAL',
    tone: 'RISK',
  },
  MIXED_WATCH: {
    label: 'RISK MIXED WATCH',
    tone: 'WATCH',
  },
  N_A: {
    label: 'RISK PHASE N/A',
    tone: 'NO_DATA',
  },
};

const RISK_PHASE_SNAPSHOT_FIELDS = [
  'edgeShortBestRiskPhaseEligible',
  'edgeShortBestRiskPhaseKey',
  'edgeShortBestRiskPhaseLabel',
  'edgeShortBestRiskPhaseTone',
  'edgeShortBestRiskBtcDay',
  'edgeShortBestRiskBtcPct24h',
  'edgeShortBestRiskLongWave',
  'edgeShortBestRiskLongScore',
  'edgeShortBestRiskLongSlope',
  'edgeShortBestRiskShortWave',
  'edgeShortBestRiskShortScore',
  'edgeShortBestRiskShortSlope',
  'edgeShortBestRiskPhaseReason',
  'edgeShortBestRiskPhaseVersion',
  'edgeShortBestRiskPhaseObservationOnly',
  'edgeShortBestRiskPhaseAffectsEntry',
  'edgeShortBestRiskPhaseAffectsMargin',
  'edgeShortBestRiskPhaseAffectsSl',
  'edgeShortBestRiskPhaseAffectsTp',
  'edgeShortBestRiskPhaseDerived',
];

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value, fallback = 'NO_DATA') {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function setupOf(trade = {}) {
  const labelKeySetup = String(trade.edgeShortLabelKey ?? '').split('|')[0];
  return normalize(
    trade.edgeShortBestSetup
      ?? trade.pumpSignalType
      ?? trade.signalType
      ?? trade.type
      ?? labelKeySetup,
    'EDGE',
  );
}

function sideOf(trade = {}) {
  return normalize(trade.side, 'NO_SIDE');
}

function btcDirectionOf(trade = {}) {
  const phase = normalize(
    trade.edgeShortLiveBtcPhase
      ?? trade.btcHealth?.regime
      ?? trade.btcTrendDir
      ?? trade.btcHealth?.btcTrendDir,
    'NO_DATA',
  );
  if (phase.includes('DOWN')) return 'DOWN';
  if (phase.includes('UP')) return 'UP';
  return 'NO_DATA';
}

function btcPhaseOf(trade = {}) {
  const stored = normalize(trade.edgeShortLiveBtcPhase, '');
  if (stored) return stored;
  const direction = btcDirectionOf(trade);
  const score = finiteNumber(trade.btcHealth?.btcTrendScore ?? trade.btcTrendScore);
  const strength = score == null
    ? 'NO_SCORE'
    : score < 45
      ? 'WEAK'
      : score < 65
        ? 'MID'
        : 'STRONG';
  return `${direction}_${strength}`;
}

function marketSnapshotOf(trade = {}) {
  const snapshot = trade.marketDirectionAtSignal ?? {};
  const dynamics = snapshot.scoreDynamics ?? {};
  return {
    marketLabel: normalize(snapshot.label ?? snapshot.rawLabel, 'NO_DATA'),
    longWave: normalize(dynamics.longWaveState, 'NO_DATA'),
    longScore: finiteNumber(snapshot.scores?.long ?? dynamics.longScore),
    longSlope: finiteNumber(dynamics.longScoreSlope),
    shortWave: normalize(dynamics.shortWaveState, 'NO_DATA'),
    shortScore: finiteNumber(snapshot.scores?.short ?? dynamics.shortScore),
    shortSlope: finiteNumber(dynamics.shortScoreSlope),
  };
}

function btcDaySnapshotOf(trade = {}) {
  const pct24h = finiteNumber(trade.btcHealth?.pct24h ?? trade.btcPct24h);
  if (pct24h == null) return { key: 'NO_DATA', pct24h: null };
  if (pct24h <= EDGE_SHORT_BEST_RISK_BEAR_PCT24H) {
    return { key: 'DAY_BEAR', pct24h };
  }
  if (pct24h >= EDGE_SHORT_BEST_RISK_BULL_PCT24H) {
    return { key: 'DAY_BULL', pct24h };
  }
  return { key: 'DAY_NEUTRAL', pct24h };
}

function riskPhaseKeyOf(trade = {}, profileKey = profileKeyOf(trade)) {
  if (profileKey !== 'PHASE_RISK') return 'N_A';
  const btcDay = btcDaySnapshotOf(trade);
  const {
    longWave,
    shortWave,
  } = marketSnapshotOf(trade);
  if (
    btcDay.key === 'DAY_BEAR'
    && longWave !== 'BTC_RALLY_REJECT'
    && !['SHORT_FADE', 'SHORT_PEAK'].includes(shortWave)
  ) {
    return 'DAY_BEAR_CONTINUE';
  }
  if (
    btcDay.key === 'DAY_NEUTRAL'
    && longWave === 'BTC_RALLY_REJECT'
    && ['SHORT_FADE', 'SHORT_PEAK', 'BTC_CRASH_RECLAIM'].includes(shortWave)
  ) {
    return 'NEUTRAL_REVERSAL';
  }
  return 'MIXED_WATCH';
}

function edgeShortBestRiskPhaseSnapshot(
  trade = {},
  profileKey = profileKeyOf(trade),
  { derived = false } = {},
) {
  const eligible = profileKey === 'PHASE_RISK';
  const key = riskPhaseKeyOf(trade, profileKey);
  const meta = RISK_PHASE_META[key] ?? RISK_PHASE_META.N_A;
  const btcDay = btcDaySnapshotOf(trade);
  const {
    longWave,
    longScore,
    longSlope,
    shortWave,
    shortScore,
    shortSlope,
  } = marketSnapshotOf(trade);
  return {
    edgeShortBestRiskPhaseEligible: eligible,
    edgeShortBestRiskPhaseKey: key,
    edgeShortBestRiskPhaseLabel: meta.label,
    edgeShortBestRiskPhaseTone: meta.tone,
    edgeShortBestRiskBtcDay: btcDay.key,
    edgeShortBestRiskBtcPct24h: btcDay.pct24h,
    edgeShortBestRiskLongWave: longWave,
    edgeShortBestRiskLongScore: longScore,
    edgeShortBestRiskLongSlope: longSlope,
    edgeShortBestRiskShortWave: shortWave,
    edgeShortBestRiskShortScore: shortScore,
    edgeShortBestRiskShortSlope: shortSlope,
    edgeShortBestRiskPhaseReason:
      `${btcDay.key}${btcDay.pct24h == null ? '' : ` ${btcDay.pct24h >= 0 ? '+' : ''}${btcDay.pct24h.toFixed(2)}%`}`
      + ` | LONG ${longWave} score ${longScore ?? '-'} slope ${longSlope ?? '-'}`
      + ` | SHORT ${shortWave} score ${shortScore ?? '-'} slope ${shortSlope ?? '-'}`
      + ` -> ${meta.label}`
      + ' | OBSERVE ONLY | no gate/block | no size/entry/SL/TP change',
    edgeShortBestRiskPhaseVersion: EDGE_SHORT_BEST_RISK_PHASE_VERSION,
    edgeShortBestRiskPhaseObservationOnly: true,
    edgeShortBestRiskPhaseAffectsEntry: false,
    edgeShortBestRiskPhaseAffectsMargin: false,
    edgeShortBestRiskPhaseAffectsSl: false,
    edgeShortBestRiskPhaseAffectsTp: false,
    edgeShortBestRiskPhaseDerived: Boolean(derived),
  };
}

function profileKeyOf(trade = {}) {
  if (trade.edgeShortBestSelected !== true) return 'N_A';

  const side = sideOf(trade);
  const tier = normalize(trade.edgeShortTier, 'BLOCK');
  const setup = setupOf(trade);
  const btcDirection = btcDirectionOf(trade);
  const { marketLabel, shortWave, shortScore } = marketSnapshotOf(trade);
  const phaseRisk = [
    'SHORT_FADE',
    'SHORT_PEAK',
    'BTC_CRASH_RECLAIM',
  ].includes(shortWave)
    || (
      marketLabel === 'MARKET_DISPERSION'
      && shortScore != null
      && shortScore < 30
    );

  if (phaseRisk) return 'PHASE_RISK';
  if (
    side === 'SHORT'
    && tier === 'A'
    && btcDirection === 'DOWN'
    && ['EARLY_DUMP', 'BC_UTAD'].includes(setup)
  ) {
    return 'SHORT_FIT';
  }
  if (tier === 'B') return 'TIER_B_TEST';
  if (side === 'LONG' || setup === 'KILL_SHORT' || btcDirection === 'UP') {
    return 'LONG_UP';
  }
  if (side === 'SHORT') return 'SHORT_OTHER';
  return 'LONG_UP';
}

export function edgeShortBestProfileSnapshot(trade = {}, { derived = false } = {}) {
  const eligible = trade.edgeShortBestSelected === true;
  const key = profileKeyOf(trade);
  const meta = PROFILE_META[key] ?? PROFILE_META.N_A;
  const side = sideOf(trade);
  const tier = normalize(trade.edgeShortTier, 'BLOCK');
  const setup = setupOf(trade);
  const btcPhase = btcPhaseOf(trade);
  const { marketLabel, shortWave, shortScore } = marketSnapshotOf(trade);
  const profileSnapshot = {
    edgeShortBestProfileEligible: eligible,
    edgeShortBestProfileKey: key,
    edgeShortBestProfileLabel: meta.label,
    edgeShortBestProfileTone: meta.tone,
    edgeShortBestProfileSide: side,
    edgeShortBestProfileTier: tier,
    edgeShortBestProfileSetup: setup,
    edgeShortBestProfileBtcPhase: btcPhase,
    edgeShortBestProfileMarketLabel: marketLabel,
    edgeShortBestProfileShortWave: shortWave,
    edgeShortBestProfileShortScore: shortScore,
    edgeShortBestProfileReason:
      `${side} | TIER ${tier} | ${setup} | BTC ${btcPhase}`
      + ` | ${marketLabel} | ${shortWave}`
      + `${shortScore == null ? '' : ` | SHORT SCORE ${shortScore}`}`
      + ` -> ${meta.label}`
      + ' | OBSERVE ONLY | no gate/block | no size/entry/SL/TP change',
    edgeShortBestProfileVersion: EDGE_SHORT_BEST_PROFILE_VERSION,
    edgeShortBestProfileObservationOnly: true,
    edgeShortBestProfileAffectsEntry: false,
    edgeShortBestProfileAffectsMargin: false,
    edgeShortBestProfileAffectsSl: false,
    edgeShortBestProfileAffectsTp: false,
    edgeShortBestProfileDerived: Boolean(derived),
  };
  return {
    ...profileSnapshot,
    ...edgeShortBestRiskPhaseSnapshot(
      { ...trade, ...profileSnapshot },
      key,
      { derived },
    ),
  };
}

export function decorateEdgeShortBestProfileSnapshots(trades = []) {
  return trades.map((trade) => {
    const hasStoredProfileSnapshot = (
      trade.edgeShortBestProfileVersion === EDGE_SHORT_BEST_PROFILE_VERSION
      && [...PROFILE_ORDER, 'N_A'].includes(trade.edgeShortBestProfileKey)
      && typeof trade.edgeShortBestProfileEligible === 'boolean'
    );
    const profileTrade = hasStoredProfileSnapshot
      ? trade
      : {
        ...trade,
        ...edgeShortBestProfileSnapshot(trade, { derived: true }),
      };
    const hasStoredRiskPhaseSnapshot = (
      profileTrade.edgeShortBestRiskPhaseVersion === EDGE_SHORT_BEST_RISK_PHASE_VERSION
      && [...RISK_PHASE_ORDER, 'N_A'].includes(profileTrade.edgeShortBestRiskPhaseKey)
      && typeof profileTrade.edgeShortBestRiskPhaseEligible === 'boolean'
    );
    return hasStoredRiskPhaseSnapshot
      ? profileTrade
      : {
        ...profileTrade,
        ...edgeShortBestRiskPhaseSnapshot(
          profileTrade,
          profileTrade.edgeShortBestProfileKey,
          { derived: true },
        ),
      };
  });
}

export function edgeShortBestProfileSnapshotForEntry(trade = {}) {
  const snapshot = edgeShortBestProfileSnapshot(trade, { derived: false });
  return Object.fromEntries(
    [...PROFILE_SNAPSHOT_FIELDS, ...RISK_PHASE_SNAPSHOT_FIELDS]
      .map((field) => [field, snapshot[field]]),
  );
}

function emptyStats(key) {
  const meta = PROFILE_META[key];
  return {
    key,
    label: meta.label,
    tone: meta.tone,
    total: 0,
    active: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    closedPnl: 0,
    activePnl: 0,
    roeTotal: 0,
    grossWin: 0,
    grossLoss: 0,
    pnlByDay: new Map(),
  };
}

function entryDay(trade = {}) {
  const at = Date.parse(trade.openedAt ?? trade.createdAt ?? '');
  return Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : 'NO_DAY';
}

export function edgeShortBestProfileStats(trades = []) {
  const rows = new Map(PROFILE_ORDER.map((key) => [key, emptyStats(key)]));
  for (const trade of trades) {
    if (trade.edgeShortBestProfileEligible !== true) continue;
    const row = rows.get(trade.edgeShortBestProfileKey);
    if (!row) continue;
    const pnl = finiteNumber(trade.pnl) ?? 0;
    row.total += 1;
    if (trade.status === 'CLOSED') {
      row.closed += 1;
      row.closedPnl += pnl;
      row.roeTotal += finiteNumber(trade.roe) ?? 0;
      const day = entryDay(trade);
      row.pnlByDay.set(day, (row.pnlByDay.get(day) ?? 0) + pnl);
      if (pnl > 0) {
        row.wins += 1;
        row.grossWin += pnl;
      } else if (pnl < 0) {
        row.losses += 1;
        row.grossLoss += Math.abs(pnl);
      } else {
        row.breakeven += 1;
      }
    } else {
      row.active += 1;
      row.activePnl += pnl;
    }
  }

  return PROFILE_ORDER.map((key) => {
    const row = rows.get(key);
    const decisive = row.wins + row.losses;
    const profitFactor = row.grossLoss > 0
      ? row.grossWin / row.grossLoss
      : row.grossWin > 0
        ? 99
        : 0;
    const totalDays = row.pnlByDay.size;
    const positiveDays = [...row.pnlByDay.values()].filter((pnl) => pnl > 0).length;
    return {
      key,
      label: row.label,
      tone: row.tone,
      total: row.total,
      active: row.active,
      closed: row.closed,
      wins: row.wins,
      losses: row.losses,
      breakeven: row.breakeven,
      wr: decisive > 0 ? +((row.wins / decisive) * 100).toFixed(1) : null,
      avgRoe: row.closed > 0 ? +(row.roeTotal / row.closed).toFixed(1) : null,
      profitFactor: +profitFactor.toFixed(2),
      closedPnl: +row.closedPnl.toFixed(4),
      activePnl: +row.activePnl.toFixed(4),
      totalPnl: +(row.closedPnl + row.activePnl).toFixed(4),
      positiveDays,
      totalDays,
    };
  });
}

function bangkokEntryDay(trade = {}) {
  const at = Date.parse(trade.openedAt ?? trade.createdAt ?? '');
  return Number.isFinite(at)
    ? new Date(at + (7 * 60 * 60 * 1000)).toISOString().slice(0, 10)
    : 'NO_DAY';
}

export function edgeShortBestRiskPhaseStats(trades = []) {
  const rows = new Map(RISK_PHASE_ORDER.map((key) => [key, {
    key,
    label: RISK_PHASE_META[key].label,
    tone: RISK_PHASE_META[key].tone,
    total: 0,
    active: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    closedPnl: 0,
    activePnl: 0,
    roeTotal: 0,
    grossWin: 0,
    grossLoss: 0,
    pnlByDay: new Map(),
  }]));
  for (const trade of trades) {
    if (trade.edgeShortBestRiskPhaseEligible !== true) continue;
    const row = rows.get(trade.edgeShortBestRiskPhaseKey);
    if (!row) continue;
    const pnl = finiteNumber(trade.pnl) ?? 0;
    row.total += 1;
    if (trade.status === 'CLOSED') {
      row.closed += 1;
      row.closedPnl += pnl;
      row.roeTotal += finiteNumber(trade.roe) ?? 0;
      const day = bangkokEntryDay(trade);
      row.pnlByDay.set(day, (row.pnlByDay.get(day) ?? 0) + pnl);
      if (pnl > 0) {
        row.wins += 1;
        row.grossWin += pnl;
      } else if (pnl < 0) {
        row.losses += 1;
        row.grossLoss += Math.abs(pnl);
      } else {
        row.breakeven += 1;
      }
    } else {
      row.active += 1;
      row.activePnl += pnl;
    }
  }

  return RISK_PHASE_ORDER.map((key) => {
    const row = rows.get(key);
    const decisive = row.wins + row.losses;
    const profitFactor = row.grossLoss > 0
      ? row.grossWin / row.grossLoss
      : row.grossWin > 0
        ? 99
        : 0;
    const totalDays = row.pnlByDay.size;
    const positiveDays = [...row.pnlByDay.values()].filter((pnl) => pnl > 0).length;
    return {
      key,
      label: row.label,
      tone: row.tone,
      total: row.total,
      active: row.active,
      closed: row.closed,
      wins: row.wins,
      losses: row.losses,
      breakeven: row.breakeven,
      wr: decisive > 0 ? +((row.wins / decisive) * 100).toFixed(1) : null,
      avgRoe: row.closed > 0 ? +(row.roeTotal / row.closed).toFixed(1) : null,
      profitFactor: +profitFactor.toFixed(2),
      closedPnl: +row.closedPnl.toFixed(4),
      activePnl: +row.activePnl.toFixed(4),
      totalPnl: +(row.closedPnl + row.activePnl).toFixed(4),
      positiveDays,
      totalDays,
      dayTimeZone: 'Asia/Bangkok',
    };
  });
}
