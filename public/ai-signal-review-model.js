export function selectReviewRows(rows, filters = {}) {
  return rows.filter(row => (!filters.independent || row.independent4h)
    && (!filters.symbol || row.symbol.includes(filters.symbol.toUpperCase().trim()))
    && (!filters.side || row.side === filters.side)
    && (!filters.band || row.strengthBand === filters.band)
    && (!filters.verdict || row.verdict === filters.verdict)
    && (!filters.market || (row.market?.regime ?? 'UNKNOWN') === filters.market)
    && (!filters.btc || row.btcAlignment === filters.btc)
    && (!filters.from || row.dayVn >= filters.from)
    && (!filters.to || row.dayVn <= filters.to)
    && (!filters.source || (row.historyQuality !== 'SENT_SNAPSHOT' ? 'UNKNOWN'
      : row.model?.deterministicFallback ? 'FALLBACK' : row.model?.applied === true ? 'MODEL' : 'UNKNOWN') === filters.source));
}

export function summarizeReviewRows(rows, hours = 4, cost = 0.12) {
  const result = {};
  for (const strategy of ['market', 'zone', 'pullback']) {
    const outcomes = rows.map(row => row.horizons?.[hours]?.[strategy]).filter(Boolean);
    const ready = outcomes.filter(row => row.state === 'READY');
    const missed = outcomes.filter(row => row.state === 'NOT_TOUCHED').length;
    const returns = ready.map(row => row.grossPct - cost).sort((a, b) => a - b);
    const avg = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const qualified = rows.filter(row => row.horizons?.[hours]?.market?.state === 'READY'
      && row.horizons?.[hours]?.[strategy]?.state === 'READY');
    const delta = qualified.map(row => row.horizons[hours][strategy].grossPct - row.horizons[hours].market.grossPct);
    result[strategy] = {
      filled: ready.length, missed, eligible: ready.length + missed,
      pending: outcomes.filter(row => row.state === 'PENDING').length,
      missing: outcomes.filter(row => row.state === 'MISSING_CANDLES').length,
      noZone: outcomes.filter(row => row.state === 'NO_ZONE').length,
      winPct: returns.length ? 100 * returns.filter(value => value > 0).length / returns.length : null,
      avgNetPct: avg(returns), medianNetPct: returns.length ? (returns[Math.floor((returns.length - 1) / 2)] + returns[Math.floor(returns.length / 2)]) / 2 : null,
      maePct: avg(ready.map(row => row.maePct).filter(value => value != null)),
      mfePct: avg(ready.map(row => row.mfePct).filter(value => value != null)),
      pairedDeltaPct: avg(delta), pairedCount: delta.length,
      opportunityNetPct: ready.length + missed ? returns.reduce((a, b) => a + b, 0) / (ready.length + missed) : null,
    };
  }
  return result;
}

export function groupReviewRows(rows, keyOf, hours, cost) {
  const groups = new Map();
  for (const row of rows) { const key = keyOf(row); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
  return [...groups].map(([key, samples]) => ({ key, count: samples.length, stats: summarizeReviewRows(samples, hours, cost) }));
}
