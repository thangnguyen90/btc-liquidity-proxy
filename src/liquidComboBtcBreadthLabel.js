import {
  liquidComboCycleContext,
  liquidComboCycleEntrySnapshot,
  liquidComboKey,
} from './liquidComboCycleStats.js';

export const LIQUID_COMBO_BTC_BREADTH_VERSION =
  'LIQUID_COMBO_BTC_BREADTH_V1_20260808';

function normalized(value) {
  return String(value ?? '').trim().toUpperCase();
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tradeEntryMs(trade = {}) {
  const value = Date.parse(
    trade.openedAt
      ?? trade.entryReadyAt
      ?? trade.createdAt
      ?? '',
  );
  return Number.isFinite(value) ? value : 0;
}

function tradeCloseMs(trade = {}) {
  const value = Date.parse(trade.closedAt ?? trade.updatedAt ?? '');
  return Number.isFinite(value) ? value : 0;
}

function comboCycleKey(trade = {}) {
  const comboKey = liquidComboKey(trade);
  const cycle = liquidComboCycleContext(trade);
  if (!comboKey || comboKey.includes('NO_DATA') || !cycle.complete) return null;
  return `${comboKey} || CYCLE ${cycle.key}`;
}

function marketSnapshotOf(trade = {}) {
  const market = trade.marketDirectionAtSignal;
  return market && typeof market === 'object' ? market : null;
}

function breadthValues(market, side) {
  const breadth = market?.breadth ?? {};
  const favorable = side === 'LONG'
    ? [breadth.up1hPct, breadth.up3hPct, breadth.up6hPct]
    : [breadth.down1hPct, breadth.down3hPct, breadth.down6hPct];
  const opposing = side === 'LONG'
    ? [breadth.down1hPct, breadth.down3hPct, breadth.down6hPct]
    : [breadth.up1hPct, breadth.up3hPct, breadth.up6hPct];
  const complete = [...favorable, ...opposing].every((value) => finiteOrNull(value) != null);
  const leadCount = complete
    ? favorable.reduce((count, value, index) => (
      count + (Number(value) > Number(opposing[index]) ? 1 : 0)
    ), 0)
    : null;
  return {
    favorable: complete ? favorable.map(Number) : [],
    opposing: complete ? opposing.map(Number) : [],
    leadCount,
  };
}

export function evaluateLiquidComboBtcBreadthLabel(
  trade = {},
  comboSnapshot = null,
) {
  const side = normalized(trade.side);
  const entryMs = tradeEntryMs(trade);
  const history = comboSnapshot && typeof comboSnapshot === 'object'
    ? comboSnapshot
    : liquidComboCycleEntrySnapshot(trade, []);
  const market = marketSnapshotOf(trade);
  const marketSampleMs = finiteOrNull(market?.sampleKey);
  const marketSampleCausal = marketSampleMs != null
    && entryMs > 0
    && marketSampleMs <= entryMs;
  const btcRet1h = finiteOrNull(market?.btc?.ret1h);
  const btcRet6h = finiteOrNull(market?.btc?.ret6h);
  const sideSign = side === 'LONG' ? 1 : side === 'SHORT' ? -1 : 0;
  const btc1hAligned = sideSign !== 0
    && btcRet1h != null
    && sideSign * btcRet1h >= 0;
  const btc6hAligned = sideSign !== 0
    && btcRet6h != null
    && sideSign * btcRet6h >= 0;
  const breadth = breadthValues(market, side);
  const breadthAligned = breadth.leadCount != null && breadth.leadCount >= 2;
  const candleName = normalized(trade.candlePatternAtEntry?.name);
  const sweepDistancePct = finiteOrNull(trade.sweepDistancePct);
  const stableCombo = history.tier === 'STABLE_GOOD';
  const dojiNearSweep = candleName === 'DOJI'
    && sweepDistancePct != null
    && Math.abs(sweepDistancePct) < 1;
  const marketComplete = Boolean(
    market
    && marketSampleCausal
    && btcRet1h != null
    && breadth.leadCount != null,
  );
  const eligible = ['LONG', 'SHORT'].includes(side)
    && stableCombo
    && dojiNearSweep;
  const matched = eligible
    && marketComplete
    && btc1hAligned
    && breadthAligned;
  const tier = matched
    ? side === 'SHORT' ? 'PRIME_TEST' : 'WATCH_LOW_SAMPLE'
    : 'UNRATED';
  const code = matched
    ? side === 'SHORT'
      ? 'COMBO_SHORT_BTC_BREADTH_PRIME_TEST'
      : 'COMBO_LONG_BTC_BREADTH_WATCH'
    : `COMBO_${side || 'UNKNOWN'}_BTC_BREADTH_UNRATED`;
  const label = matched
    ? side === 'SHORT'
      ? 'LIQ COMBO SHORT · BTC-BREADTH PRIME TEST'
      : 'LIQ COMBO LONG · BTC-BREADTH WATCH'
    : null;

  const missingFields = [
    !['LONG', 'SHORT'].includes(side) ? 'side' : '',
    !history.key ? 'comboCycleKey' : '',
    !market ? 'marketDirectionAtSignal' : '',
    market && !marketSampleCausal ? 'causalMarketSample' : '',
    market && btcRet1h == null ? 'btc.ret1h' : '',
    market && breadth.leadCount == null ? 'breadth1h3h6h' : '',
    !candleName ? 'candlePatternAtEntry.name' : '',
    sweepDistancePct == null ? 'sweepDistancePct' : '',
  ].filter(Boolean);

  let reason = 'Outside causal stable combo + DOJI + |sweep| <1% + same-side BTC1h + breadth lead 2/3.';
  if (missingFields.length) {
    reason = `Entry snapshot missing/non-causal: ${missingFields.join(', ')}.`;
  } else if (!stableCombo) {
    reason = `Combo-cycle history tier ${history.tier ?? 'NO_DATA'} before entry; requires STABLE_GOOD.`;
  } else if (!dojiNearSweep) {
    reason = `Entry layer requires DOJI and |sweepDistancePct| <1%; got ${candleName || '-'} / ${sweepDistancePct ?? '-'}.`;
  } else if (!btc1hAligned || !breadthAligned) {
    reason = `${side} market regime not aligned: BTC1h ${btcRet1h ?? '-'}%; breadth lead ${breadth.leadCount ?? '-'}/3.`;
  } else {
    reason = [
      `${side} causal stable combo`,
      `DOJI + |sweep| ${Math.abs(sweepDistancePct).toFixed(3)}%`,
      `same-side BTC1h ${btcRet1h >= 0 ? '+' : ''}${btcRet1h.toFixed(2)}%`,
      `breadth leads ${breadth.leadCount}/3 horizons`,
      side === 'LONG' ? 'WATCH LOW SAMPLE' : 'PRIME TEST',
      'OBSERVE ONLY',
    ].join('; ');
  }

  return {
    liquidComboBtcBreadthEligible: eligible,
    liquidComboBtcBreadthMatched: matched,
    liquidComboBtcBreadthSide: ['LONG', 'SHORT'].includes(side) ? side : null,
    liquidComboBtcBreadthTier: tier,
    liquidComboBtcBreadthCode: code,
    liquidComboBtcBreadthLabel: label,
    liquidComboBtcBreadthReason: reason,
    liquidComboBtcBreadthComboKey: history.key ?? null,
    liquidComboBtcBreadthHistoryTier: history.tier ?? 'NO_DATA',
    liquidComboBtcBreadthHistory: history.history ?? null,
    liquidComboBtcBreadthRecent: history.recent ?? null,
    liquidComboBtcBreadthCandleName: candleName || null,
    liquidComboBtcBreadthSweepDistancePct: sweepDistancePct,
    liquidComboBtcBreadthMarketSampleKey: market?.sampleKey ?? null,
    liquidComboBtcBreadthMarketEvaluatedAt: market?.evaluatedAt ?? null,
    liquidComboBtcBreadthMarketSampleCausal: marketSampleCausal,
    liquidComboBtcBreadthMarketLabel: normalized(market?.label ?? market?.rawLabel) || null,
    liquidComboBtcBreadthBtcRet1h: btcRet1h,
    liquidComboBtcBreadthBtcRet6h: btcRet6h,
    liquidComboBtcBreadthBtc1hAligned: btc1hAligned,
    liquidComboBtcBreadthBtc6hAligned: btc6hAligned,
    liquidComboBtcBreadthBreadthLeadCount: breadth.leadCount,
    liquidComboBtcBreadthFavorableBreadth: breadth.favorable,
    liquidComboBtcBreadthOpposingBreadth: breadth.opposing,
    liquidComboBtcBreadthBreadthAligned: breadthAligned,
    liquidComboBtcBreadthMissingFields: missingFields,
    liquidComboBtcBreadthBasis: 'ENTRY_MARKET_DIRECTION_SNAPSHOT_AND_CLOSED_COMBO_HISTORY',
    liquidComboBtcBreadthVersion: LIQUID_COMBO_BTC_BREADTH_VERSION,
    liquidComboBtcBreadthObservationOnly: true,
    liquidComboBtcBreadthAffectsEntry: false,
    liquidComboBtcBreadthAffectsMargin: false,
    liquidComboBtcBreadthAffectsSl: false,
    liquidComboBtcBreadthAffectsTp: false,
    liquidComboBtcBreadthAffectsBinance: false,
  };
}

export function deriveLiquidComboBtcBreadthSnapshots(
  trades = [],
  marketDirectionByTradeId = new Map(),
) {
  const chronological = trades
    .map((trade) => ({ trade, entryMs: tradeEntryMs(trade), closeMs: tradeCloseMs(trade) }))
    .filter((row) => row.trade?.id != null && row.entryMs > 0)
    .sort((left, right) => left.entryMs - right.entryMs);
  const closes = chronological
    .filter((row) => String(row.trade.status ?? '').toUpperCase() === 'CLOSED')
    .filter((row) => String(row.trade.outcome ?? '').toUpperCase() !== 'INVALID')
    .filter((row) => row.closeMs > row.entryMs)
    .sort((left, right) => left.closeMs - right.closeMs);
  const historyByKey = new Map();
  const result = new Map();
  let closeIndex = 0;

  for (const row of chronological) {
    while (closeIndex < closes.length && closes[closeIndex].closeMs < row.entryMs) {
      const closed = closes[closeIndex].trade;
      const key = comboCycleKey(closed);
      if (key) {
        const history = historyByKey.get(key) ?? [];
        history.push(closed);
        historyByKey.set(key, history);
      }
      closeIndex += 1;
    }
    const key = comboCycleKey(row.trade);
    const storedMarket = marketSnapshotOf(row.trade);
    const loggedMarket = marketDirectionByTradeId.get(String(row.trade.id)) ?? null;
    const tradeWithMarket = {
      ...row.trade,
      marketDirectionAtSignal: storedMarket ?? loggedMarket,
    };
    const preflight = evaluateLiquidComboBtcBreadthLabel(tradeWithMarket, {
      key,
      tier: 'NEW',
      history: null,
      recent: null,
    });
    const needsHistory = ['LONG', 'SHORT'].includes(preflight.liquidComboBtcBreadthSide)
      && preflight.liquidComboBtcBreadthCandleName === 'DOJI'
      && preflight.liquidComboBtcBreadthSweepDistancePct != null
      && Math.abs(preflight.liquidComboBtcBreadthSweepDistancePct) < 1
      && preflight.liquidComboBtcBreadthMarketSampleCausal === true
      && preflight.liquidComboBtcBreadthBtc1hAligned === true
      && preflight.liquidComboBtcBreadthBreadthAligned === true;
    const evaluated = needsHistory
      ? evaluateLiquidComboBtcBreadthLabel(
        tradeWithMarket,
        liquidComboCycleEntrySnapshot(row.trade, key ? (historyByKey.get(key) ?? []) : []),
      )
      : preflight;
    if (evaluated.liquidComboBtcBreadthMatched === true) {
      result.set(String(row.trade.id), {
        ...evaluated,
        liquidComboBtcBreadthMarketSnapshotSource: storedMarket
          ? 'TRADE_ENTRY_SNAPSHOT'
          : loggedMarket
            ? 'SIGNAL_LOG_BACKFILL'
            : 'NO_DATA',
        liquidComboBtcBreadthBasis: storedMarket
          ? evaluated.liquidComboBtcBreadthBasis
          : `DERIVED_${evaluated.liquidComboBtcBreadthBasis}`,
        liquidComboBtcBreadthVersion: `${LIQUID_COMBO_BTC_BREADTH_VERSION}:DERIVED`,
      });
    }
  }
  return result;
}
