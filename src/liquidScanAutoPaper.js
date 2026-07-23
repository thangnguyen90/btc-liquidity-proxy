const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

function finiteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isLiquidKillZoneRow(row = {}) {
  const cluster = row.killZoneCluster;
  return Boolean(cluster?.mainKillZone || cluster?.farKillZone || cluster?.isOneSided);
}

export function liquidScanSignalType(row = {}) {
  return isLiquidKillZoneRow(row) ? 'LIQUID_KILL_ZONE' : 'LIQUID_SCAN';
}

export function liquidKillZoneDistancePct(row = {}) {
  const zone = row.killZoneCluster?.farKillZone
    ?? row.killZoneCluster?.mainKillZone
    ?? row.killZoneCluster?.exhaustionZone
    ?? null;
  if (!zone) return null;
  const low = Math.abs(finiteNumber(zone.distancePctLow, 0));
  const high = Math.abs(finiteNumber(zone.distancePctHigh, 0));
  return Math.max(low, high);
}

export function isSameLiquidScanPlannedTrade(trade = {}, row = {}, {
  now = Date.now(),
  dedupeMs = FOUR_HOURS_MS,
} = {}) {
  const plan = row.entryPlan;
  if (!plan) return false;
  if (trade.symbol !== row.symbol || trade.side !== plan.side) return false;
  if (!String(trade.source ?? '').startsWith('liquid-scan')) return false;
  const openedAt = Date.parse(trade.openedAt ?? trade.createdAt ?? '') || 0;
  return openedAt > 0 && now - openedAt < dedupeMs;
}

export function selectLiquidScanAutoPaperRows(rows = [], trades = [], {
  minPoint = 75,
  minDistancePct = 1,
  now = Date.now(),
  dedupeMs = FOUR_HOURS_MS,
} = {}) {
  return rows.filter((row) => {
    const killZone = isLiquidKillZoneRow(row);
    if (!killZone && finiteNumber(row.sweepProb, 0) <= minPoint) return false;
    if (!row.entryPlan?.entryPrice || !row.entryPlan?.side) return false;
    const distance = Math.max(
      Math.abs(finiteNumber(row.sweepTarget?.distancePct ?? row.entryPlan?.targetDistancePct, 0)),
      finiteNumber(liquidKillZoneDistancePct(row), 0),
    );
    if (minDistancePct > 0 && distance < minDistancePct) return false;
    return !trades.some((trade) => isSameLiquidScanPlannedTrade(trade, row, { now, dedupeMs }));
  });
}

export function buildLiquidScanAutoPaperPayload(row = {}, {
  marginUsdt = 10,
  shadowCapUsdt = 1,
  leverage = 10,
  minPoint = 75,
  signalTimeframe = '15m',
} = {}) {
  const plan = row.entryPlan ?? {};
  const marketEntry = finiteNumber(row.markPrice);
  const setupEntry = finiteNumber(plan.entryPrice);
  const entryPrice = marketEntry && marketEntry > 0 ? marketEntry : setupEntry;
  if (!entryPrice || !plan.side) throw new Error(`Invalid Liquid Scan entry plan for ${row.symbol ?? 'unknown'}.`);
  const signalType = liquidScanSignalType(row);
  const hunt = row.huntSignal;
  const huntNote = hunt
    ? [
        `hunt=${hunt.type}`,
        `huntScore=${finiteNumber(hunt.score, 0)}`,
        `huntDist=${finiteNumber(hunt.targetDistancePct, 0).toFixed(2)}%`,
        Number.isFinite(Number(hunt.rsi)) ? `huntRSI=${Number(hunt.rsi).toFixed(0)}` : null,
        `huntVol=${finiteNumber(hunt.volX, 0).toFixed(1)}x`,
      ].filter(Boolean).join(' ')
    : '';
  return {
    symbol: row.symbol,
    side: plan.side,
    marginUsdt: Math.min(Math.max(0.01, finiteNumber(marginUsdt, 1)), Math.max(0.01, finiteNumber(shadowCapUsdt, 1))),
    requestedMarginUsdt: Math.max(0.01, finiteNumber(marginUsdt, 1)),
    leverage,
    entryPrice,
    status: 'OPEN',
    source: `liquid-scan-auto-${finiteNumber(row.sweepProb, 0)}`,
    note: [
      `serverAuto=1`,
      `autoPaper point>${minPoint}`,
      `marketPaper=1`,
      `setupEntry=${setupEntry ?? '-'}`,
      `marketEntry=${entryPrice}`,
      `type=${signalType}`,
      `sweepProb=${finiteNumber(row.sweepProb, 0)}%`,
      huntNote,
      `heavySide=${row.heavySide ?? '-'}`,
      `target=${row.sweepTarget?.price ?? '-'}`,
      `killZone=${row.killZoneCluster?.mainKillZone ? `${row.killZoneCluster.mainKillZone.low}-${row.killZoneCluster.mainKillZone.high}` : '-'}`,
      `farKill=${row.killZoneCluster?.farKillZone ? `${row.killZoneCluster.farKillZone.low}-${row.killZoneCluster.farKillZone.high}` : '-'}`,
      `tp=${plan.takeProfitPrice ?? '-'}`,
      `sl=${plan.stopLossPrice ?? '-'}`,
    ].filter(Boolean).join(' | '),
    takeProfitPrice: plan.takeProfitPrice,
    stopLossPrice: plan.stopLossPrice,
    signalType,
    signalTimeframe,
    signalPoint: finiteNumber(row.sweepProb, 0),
    signalMarkPrice: finiteNumber(row.markPrice, entryPrice),
    sweepTargetPrice: finiteNumber(row.sweepTarget?.price),
    sweepDistancePct: finiteNumber(plan.targetDistancePct),
    feasibleLeverage: finiteNumber(plan.feasibleLeverage),
    feasibilityScore: finiteNumber(plan.feasibilityScore),
    rewardPct: finiteNumber(plan.rewardPct),
    riskPct: finiteNumber(plan.riskPct),
    rr: finiteNumber(plan.rr),
    heavySide: row.heavySide ?? null,
    huntSignal: hunt ?? null,
    entryPlan: plan,
  };
}
