export const EDGE_SHORT_WAVE_2B_VERSION = 'edge-short-wave-2b-observe-v1';

const CORE_KEYS = [
  'SHORT_TRANSITION',
  'SHORT_COUNTER_ACTIVE',
  'SHORT_COUNTER_EXHAUSTED',
  'SHORT_ALIGNED_ACTIVE',
  'SHORT_ALIGNED_EXHAUSTED',
  'LONG_TRANSITION',
  'LONG_COUNTER_ACTIVE',
  'LONG_COUNTER_EXHAUSTED',
  'LONG_ALIGNED_ACTIVE',
  'LONG_ALIGNED_EXHAUSTED',
];

const EXTRA_KEYS = [
  'WAVE_NO_DATA',
];

const ALL_KEYS = [...CORE_KEYS, ...EXTRA_KEYS];

const META = {
  SHORT_TRANSITION: {
    label: '2B SHORT · BTC TRANSITION',
    tone: 'GOOD',
  },
  SHORT_COUNTER_ACTIVE: {
    label: '2B SHORT · BTC DRIVE COUNTER',
    tone: 'GOOD',
  },
  SHORT_COUNTER_EXHAUSTED: {
    label: '2B SHORT · BTC EXHAUSTED COUNTER',
    tone: 'WATCH',
  },
  LONG_TRANSITION: {
    label: '2B LONG · BTC TRANSITION',
    tone: 'RISK',
  },
  LONG_COUNTER_ACTIVE: {
    label: '2B LONG · BTC DRIVE COUNTER',
    tone: 'RISK',
  },
  LONG_COUNTER_EXHAUSTED: {
    label: '2B LONG · BTC EXHAUSTED COUNTER',
    tone: 'WATCH',
  },
  SHORT_ALIGNED_ACTIVE: {
    label: '2B SHORT · BTC DRIVE ALIGNED',
    tone: 'GOOD',
  },
  SHORT_ALIGNED_EXHAUSTED: {
    label: '2B SHORT · BTC EXHAUSTED ALIGNED',
    tone: 'WATCH',
  },
  LONG_ALIGNED_ACTIVE: {
    label: '2B LONG · BTC DRIVE ALIGNED',
    tone: 'RISK',
  },
  LONG_ALIGNED_EXHAUSTED: {
    label: '2B LONG · BTC EXHAUSTED ALIGNED',
    tone: 'RISK',
  },
  WAVE_NO_DATA: {
    label: '2B BTC WAVE · NO DATA',
    tone: 'NO_DATA',
  },
};

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value) {
  return String(value ?? '').trim().toUpperCase();
}

function sideOf(trade = {}) {
  const side = normalize(trade.side ?? trade.action);
  if (side.includes('SHORT')) return 'SHORT';
  if (side.includes('LONG')) return 'LONG';
  return 'NO_SIDE';
}

function directionStructure(trade = {}) {
  const health = trade.btcHealth ?? {};
  const direction = normalize(health.btcTrendDir ?? trade.btcTrendDir);
  const emaTrend1h = normalize(health.emaTrend1h);
  const marketRegime = normalize(health.marketRegime);
  const legacyRegime = normalize(health.regime);
  const regime = marketRegime || legacyRegime;
  const directionalRegime = direction === 'DOWN'
    ? ['DOWN', 'WEAK_DOWN', 'SIDEWAY_DOWN'].includes(regime)
      || (!marketRegime && legacyRegime.includes('DOWN'))
    : direction === 'UP'
      ? ['UP', 'WEAK_UP', 'SIDEWAY_UP'].includes(regime)
        || (!marketRegime && legacyRegime.includes('UP'))
      : false;
  const emaAligned = (direction === 'DOWN' && emaTrend1h === 'BELOW')
    || (direction === 'UP' && emaTrend1h === 'ABOVE');
  return {
    direction,
    emaTrend1h,
    marketRegime,
    legacyRegime,
    regime,
    confirmed: Boolean(directionalRegime && emaAligned),
  };
}

function flowState(direction, obvTrend) {
  if (
    (direction === 'UP' && obvTrend === 'RISING')
    || (direction === 'DOWN' && obvTrend === 'FALLING')
  ) return 'CONFIRMED';
  if (['RISING', 'FALLING', 'FLAT'].includes(obvTrend)) return 'DIVERGENT';
  return 'NO_DATA';
}

export function edgeShortBtcWaveState(trade = {}) {
  const health = trade.btcHealth ?? {};
  const structure = directionStructure(trade);
  const trendScore = finiteNumber(health.btcTrendScore ?? trade.btcTrendScore);
  const pct6h = finiteNumber(health.pct6h ?? trade.btcPct6h);
  const rsi1h = finiteNumber(health.rsi1h ?? trade.btcRsi1h);
  const obvTrend = normalize(health.obvTrend);
  const missingFields = [
    !['UP', 'DOWN'].includes(structure.direction) ? 'direction' : '',
    trendScore == null ? 'trendScore' : '',
    !structure.emaTrend1h ? 'emaTrend1h' : '',
    !structure.regime ? 'regime' : '',
    pct6h == null ? 'pct6h' : '',
    rsi1h == null ? 'rsi1h' : '',
    !obvTrend ? 'obvTrend' : '',
  ].filter(Boolean);

  if (missingFields.length) {
    return {
      state: 'NO_DATA',
      flow: 'NO_DATA',
      ...structure,
      trendScore,
      pct6h,
      rsi1h,
      obvTrend,
      missingFields,
    };
  }

  const flow = flowState(structure.direction, obvTrend);
  if (!structure.confirmed) {
    return {
      state: 'TRANSITION',
      flow,
      ...structure,
      trendScore,
      pct6h,
      rsi1h,
      obvTrend,
      missingFields,
    };
  }

  let exhausted = false;
  if (structure.direction === 'DOWN') {
    exhausted = (
      pct6h >= -0.2
      && (rsi1h <= 42 || trendScore < 50 || flow === 'DIVERGENT')
    ) || (rsi1h <= 33 && pct6h >= -0.5);
  } else {
    exhausted = (
      flow === 'DIVERGENT'
      && (pct6h <= 0.2 || rsi1h >= 58)
    ) || rsi1h >= 68;
  }

  return {
    state: exhausted ? 'EXHAUSTED' : 'CONTINUATION',
    flow,
    ...structure,
    trendScore,
    pct6h,
    rsi1h,
    obvTrend,
    missingFields,
  };
}

function keyOf(trade = {}, wave = edgeShortBtcWaveState(trade)) {
  const side = sideOf(trade);
  if (side === 'NO_SIDE' || wave.state === 'NO_DATA') return 'WAVE_NO_DATA';
  if (wave.state === 'TRANSITION') return `${side}_TRANSITION`;
  const aligned = (side === 'SHORT' && wave.direction === 'DOWN')
    || (side === 'LONG' && wave.direction === 'UP');
  const relation = aligned ? 'ALIGNED' : 'COUNTER';
  const phase = wave.state === 'EXHAUSTED' ? 'EXHAUSTED' : 'ACTIVE';
  return `${side}_${relation}_${phase}`;
}

export function edgeShortWave2bSnapshot(trade = {}, { derived = false } = {}) {
  const side = sideOf(trade);
  const wave = edgeShortBtcWaveState(trade);
  const key = keyOf(trade, wave);
  const meta = META[key] ?? META.WAVE_NO_DATA;
  const aligned = (side === 'SHORT' && wave.direction === 'DOWN')
    || (side === 'LONG' && wave.direction === 'UP');
  const relation = wave.state === 'TRANSITION' || wave.state === 'NO_DATA'
    ? wave.state
    : aligned ? 'ALIGNED' : 'COUNTER';
  const pct6hText = wave.pct6h == null
    ? '-'
    : `${wave.pct6h >= 0 ? '+' : ''}${wave.pct6h.toFixed(2)}%`;
  return {
    edgeShortWave2bEligible: key !== 'WAVE_NO_DATA',
    edgeShortWave2bKey: key,
    edgeShortWave2bLabel: meta.label,
    edgeShortWave2bTone: meta.tone,
    edgeShortWave2bSide: side,
    edgeShortWave2bState: wave.state,
    edgeShortWave2bRelation: relation,
    edgeShortWave2bBtcDirection: wave.direction || null,
    edgeShortWave2bBtcTrendScore: wave.trendScore,
    edgeShortWave2bBtcPct6h: wave.pct6h,
    edgeShortWave2bBtcRsi1h: wave.rsi1h,
    edgeShortWave2bBtcEmaTrend1h: wave.emaTrend1h || null,
    edgeShortWave2bBtcMarketRegime: wave.marketRegime || null,
    edgeShortWave2bBtcLegacyRegime: wave.legacyRegime || null,
    edgeShortWave2bBtcObvTrend: wave.obvTrend || null,
    edgeShortWave2bBtcFlow: wave.flow,
    edgeShortWave2bMissingFields: wave.missingFields,
    edgeShortWave2bReason:
      `${side} | BTC ${wave.direction || 'NO_DATA'} ${wave.state}`
      + ` | EMA1h ${wave.emaTrend1h || '-'} | regime ${wave.regime || '-'}`
      + ` | 6h ${pct6hText} | RSI1h ${wave.rsi1h ?? '-'}`
      + ` | OBV ${wave.obvTrend || '-'} -> ${meta.label}`
      + ' | OBSERVE ONLY | no gate/block | no size/entry/SL/TP change',
    edgeShortWave2bVersion: EDGE_SHORT_WAVE_2B_VERSION,
    edgeShortWave2bObservationOnly: true,
    edgeShortWave2bAffectsEntry: false,
    edgeShortWave2bAffectsMargin: false,
    edgeShortWave2bAffectsSl: false,
    edgeShortWave2bAffectsTp: false,
    edgeShortWave2bDerived: Boolean(derived),
  };
}

export function decorateEdgeShortWave2bSnapshots(trades = []) {
  return trades.map((trade) => {
    const hasStoredSnapshot = trade?.edgeShortWave2bVersion === EDGE_SHORT_WAVE_2B_VERSION
      && ALL_KEYS.includes(trade?.edgeShortWave2bKey);
    return hasStoredSnapshot
      ? trade
      : { ...trade, ...edgeShortWave2bSnapshot(trade, { derived: true }) };
  });
}

function bangkokDayOf(trade = {}) {
  const parsed = Date.parse(trade.openedAt ?? trade.createdAt ?? '');
  if (!Number.isFinite(parsed)) return 'NO_DAY';
  return new Date(parsed + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function emptyStats(key) {
  const meta = META[key] ?? META.WAVE_NO_DATA;
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
    days: new Map(),
  };
}

export function edgeShortWave2bStats(trades = []) {
  const rows = new Map(ALL_KEYS.map((key) => [key, emptyStats(key)]));
  for (const trade of trades) {
    const key = ALL_KEYS.includes(trade?.edgeShortWave2bKey)
      ? trade.edgeShortWave2bKey
      : 'WAVE_NO_DATA';
    const row = rows.get(key);
    const pnl = finiteNumber(trade?.pnl) ?? 0;
    row.total += 1;
    if (trade?.status === 'CLOSED') {
      row.closed += 1;
      row.closedPnl += pnl;
      row.roeTotal += finiteNumber(trade?.roe) ?? 0;
      if (pnl > 0) {
        row.wins += 1;
        row.grossWin += pnl;
      } else if (pnl < 0) {
        row.losses += 1;
        row.grossLoss += Math.abs(pnl);
      } else {
        row.breakeven += 1;
      }
      const day = bangkokDayOf(trade);
      row.days.set(day, (row.days.get(day) ?? 0) + pnl);
    } else {
      row.active += 1;
      row.activePnl += pnl;
    }
  }

  return ALL_KEYS
    .filter((key) => CORE_KEYS.includes(key) || rows.get(key).total > 0)
    .map((key) => {
      const row = rows.get(key);
      const decisive = row.wins + row.losses;
      const profitFactor = row.grossLoss > 0
        ? row.grossWin / row.grossLoss
        : row.grossWin > 0
          ? 9.99
          : 0;
      const dayValues = [...row.days.values()];
      return {
        key: row.key,
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
        positiveDays: dayValues.filter((value) => value > 0).length,
        negativeDays: dayValues.filter((value) => value < 0).length,
        totalDays: dayValues.length,
      };
    });
}
