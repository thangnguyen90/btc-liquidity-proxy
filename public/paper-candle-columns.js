(function installPaperCandleColumns() {
  if (window.__paperCandleColumnsInstalled) return;
  window.__paperCandleColumnsInstalled = true;

  const bySymbol = new Map();
  const number = (value) => {
    const parsed = Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const normalize = (value) => String(value ?? '').trim().toUpperCase();
  const plain = (value) => normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const entryOf = (trade) => number(trade?.entryPrice ?? trade?.entry ?? trade?.fillPrice);
  const signalPatternOf = (trade) => {
    const timeframe = normalize(trade?.candlePatternTimeframe ?? trade?.timeframe ?? trade?.interval ?? trade?.tf ?? '');
    const direct = trade?.candlePatternAtEntry
      ?? (timeframe === '5M' ? trade?.candlePattern5m : trade?.candlePattern15m)
      ?? trade?.candlePattern5m;
    if (direct && typeof direct === 'object') return { ...direct, timeframe: normalize(direct.timeframe ?? timeframe) || '-' };
    if (direct) return { name: String(direct), direction: 'NEUTRAL', timeframe: timeframe || '-' };
    if (trade?.brCandleKind) return { name: String(trade.brCandleKind), direction: String(trade.brCandleDir ?? 'NEUTRAL'), timeframe: timeframe || '-' };
    return null;
  };
  const btcPatternOf = (trade) => {
    const direct = trade?.btcCandlePatternAtEntry ?? trade?.btcCandleAtEntry ?? trade?.btcCandlePattern5m;
    if (direct && typeof direct === 'object') return { ...direct, timeframe: normalize(direct.timeframe ?? '5m') || '5M' };
    if (direct) return { name: String(direct), direction: 'NEUTRAL', timeframe: '5M' };
    return null;
  };
  const candleBiasOf = (pattern) => {
    const name = normalize(pattern?.name ?? pattern);
    if (name.includes('BEARISH') || name === 'SHOOTING_STAR') return 'BEARISH';
    if (name.includes('BULLISH') || name === 'HAMMER') return 'BULLISH';
    return 'NEUTRAL';
  };
  const pumpCandleFlagOf = (trade, signalPattern, btcPattern) => {
    const source = normalize(trade?.source);
    if (!/^PUMP-\d+(?:-|$)/.test(source)) return null;
    const type = normalize(trade?.pumpSignalType ?? trade?.type ?? 'PUMP_UNKNOWN').replace(/\s+/g, '_');
    const timeframe = normalize(
      trade?.pumpSignalTimeframe ?? trade?.pumpSignalFactors?.timeframe
      ?? signalPattern?.timeframe ?? trade?.timeframe ?? '15m',
    ).toLowerCase();
    const altName = normalize(signalPattern?.name ?? 'NO_DATA');
    const btcName = normalize(btcPattern?.name ?? 'NO_DATA');
    const altBias = candleBiasOf(signalPattern);
    const btcBias = candleBiasOf(btcPattern);
    const missing = ['NO_DATA', 'UNKNOWN'].includes(altName) || ['NO_DATA', 'UNKNOWN'].includes(btcName);
    let tier = 'WATCH';
    let label = 'WATCH';
    let reasonCode = 'PUMP_CANDLE_DEFAULT_WATCH';

    if (missing) {
      label = 'WATCH · NO DATA';
      reasonCode = 'PUMP_CANDLE_PAIR_MISSING';
    } else if (type === 'EMA_PULLBACK') {
      label = 'WATCH';
      reasonCode = 'PULLBACK_BASE_WATCH';
      if (altName === 'BEARISH_CANDLE' && btcName === 'BEARISH_MARUBOZU') {
        label = 'GOOD-TEST';
        reasonCode = 'PULLBACK_ALT_BEARISH_BTC_BEARISH_MARUBOZU_2D_POSITIVE';
      } else if (altName === 'BEARISH_CANDLE'
          && ['BULLISH_CANDLE', 'BEARISH_CANDLE', 'SHOOTING_STAR'].includes(btcName)) {
        tier = 'RISK';
        label = 'RISK';
        reasonCode = `PULLBACK_ALT_BEARISH_BTC_${btcName}_2D_NEGATIVE`;
      } else if ((altBias === 'BULLISH' || altBias === 'NEUTRAL') && btcBias === 'BEARISH') {
        label = 'WATCH+';
        reasonCode = 'PULLBACK_ALT_NON_BEARISH_BTC_BEARISH_SMALL_SAMPLE';
      }
    } else if (type === 'PUMP_BREAKOUT') {
      tier = 'RISK';
      label = 'RISK';
      reasonCode = 'PUMP_BREAKOUT_BASE_2D_NEGATIVE';
      if (altBias === 'BEARISH' && btcBias === 'BULLISH') {
        tier = 'WATCH';
        label = 'WATCH';
        reasonCode = 'PUMP_BREAKOUT_ALT_BEARISH_BTC_BULLISH_SMALL_EDGE';
      }
      if (altName === 'BULLISH_CANDLE' && btcName === 'HAMMER') {
        tier = 'RISK';
        label = 'RISK';
        reasonCode = 'PUMP_BREAKOUT_ALT_BULLISH_BTC_HAMMER_0W3L';
      }
    } else if (type === 'DUMP') {
      label = 'WATCH-TAIL';
      reasonCode = 'DUMP_POSITIVE_PNL_BUT_NEGATIVE_CAPPED_ROE';
    } else if (type === 'EARLY_DUMP') {
      tier = 'RISK';
      label = 'RISK';
      reasonCode = 'EARLY_DUMP_2D_NEGATIVE';
    }

    return {
      tier,
      label,
      regime: `PUMP · ${type} · ${timeframe}`,
      side: normalize(trade?.side ?? trade?.action) || '-',
      reason: `PUMP_CANDLE_FLAG_V1_20260722 · ${reasonCode} · ALT=${altName}/${altBias} · BTC=${btcName}/${btcBias} · display only; không đổi entry/size/SL/TP`,
    };
  };
  const edgeCandleFlagOf = (trade, signalPattern, btcPattern) => {
    if (location.pathname !== '/edge-short') return null;
    const type = normalize(
      trade?.pumpSignalType ?? trade?.signalType ?? trade?.type ?? trade?.stage ?? trade?.source,
    ).replace(/\s+/g, '_');
    const side = normalize(trade?.side ?? trade?.action) || '-';
    const altName = normalize(signalPattern?.name ?? 'NO_DATA');
    const btcName = normalize(btcPattern?.name ?? 'NO_DATA');
    const altBias = candleBiasOf(signalPattern);
    const btcBias = candleBiasOf(btcPattern);
    const missing = ['NO_DATA', 'UNKNOWN'].includes(altName)
      || ['NO_DATA', 'UNKNOWN'].includes(btcName);
    let tier = 'WATCH';
    let label = 'WATCH';
    let reasonCode = 'EDGE_CANDLE_DEFAULT_WATCH';

    if (missing) {
      label = 'WATCH · NO DATA';
      reasonCode = 'EDGE_CANDLE_PAIR_MISSING';
    } else if (type === 'KILL_SHORT' && side === 'LONG'
        && altBias === 'BULLISH' && btcBias === 'BULLISH') {
      label = 'GOOD-TEST';
      reasonCode = 'KILL_SHORT_LONG_DOUBLE_BULLISH_5D_POSITIVE';
    } else if (type === 'EARLY_DUMP' && side === 'SHORT'
        && altBias === 'BEARISH' && btcBias === 'BEARISH') {
      label = 'GOOD-TEST';
      reasonCode = 'EARLY_DUMP_SHORT_DOUBLE_BEARISH_5D_POSITIVE';
    } else if (type === 'EMA_SQUEEZE_1H_BREAKOUT' && side === 'LONG'
        && altBias === 'BEARISH' && btcBias === 'BEARISH') {
      label = 'GOOD-TEST';
      reasonCode = 'EMA_1H_BREAKOUT_LONG_DOUBLE_BEARISH_SMALL_POSITIVE_SAMPLE';
    } else if (type === 'EMA_SQUEEZE_5M_BREAKOUT' && side === 'LONG'
        && altBias === 'BULLISH' && btcBias === 'BULLISH') {
      label = 'WATCH+';
      reasonCode = 'EMA_5M_BREAKOUT_LONG_DOUBLE_BULLISH_OUTLIER_SENSITIVE';
    } else if (type === 'EMA_SQUEEZE_5M_BREAKOUT' && side === 'LONG'
        && ((altBias === 'BULLISH' && btcBias === 'BEARISH')
          || (altBias === 'BEARISH' && btcBias === 'BULLISH'))) {
      tier = 'RISK';
      label = 'RISK';
      reasonCode = 'EMA_5M_BREAKOUT_LONG_ALT_BTC_CONFLICT_5D_NEGATIVE';
    } else if (type === 'EARLY_DUMP' && side === 'SHORT'
        && altBias === 'BEARISH' && btcBias === 'BULLISH') {
      tier = 'RISK';
      label = 'RISK';
      reasonCode = 'EARLY_DUMP_SHORT_BEARISH_ALT_BULLISH_BTC_5D_NEGATIVE';
    } else if (type === 'SC_SPRING' && side === 'LONG'
        && altBias === 'BEARISH' && btcBias === 'BEARISH') {
      tier = 'RISK';
      label = 'RISK';
      reasonCode = 'SC_SPRING_LONG_DOUBLE_BEARISH_5D_NEGATIVE';
    } else if (type === 'DUMP' && side === 'SHORT'
        && altBias === 'BEARISH' && btcBias === 'BULLISH') {
      tier = 'RISK';
      label = 'RISK';
      reasonCode = 'DUMP_SHORT_BEARISH_ALT_BULLISH_BTC_5D_NEGATIVE';
    }

    return {
      tier,
      label,
      regime: `EDGE · ${type || 'UNKNOWN'}`,
      side,
      reason: `EDGE_CANDLE_FLAG_V1_20260722_5D · ${reasonCode} · ALT=${altName}/${altBias} · BTC=${btcName}/${btcBias} · display only; không đổi entry/size/SL/TP`,
    };
  };
  const liquidCandleFlagOf = (trade, signalPattern, btcPattern) => {
    if (location.pathname !== '/liquid-scan') return null;
    const type = normalize(trade?.signalType ?? trade?.type ?? trade?.stage ?? 'LIQUID_SCAN').replace(/\s+/g, '_');
    const side = normalize(trade?.side ?? trade?.action) || '-';
    const altName = normalize(signalPattern?.name ?? 'NO_DATA');
    const btcName = normalize(btcPattern?.name ?? 'NO_DATA');
    const altBias = candleBiasOf(signalPattern);
    const btcBias = candleBiasOf(btcPattern);
    const missing = ['NO_DATA', 'UNKNOWN'].includes(altName)
      || ['NO_DATA', 'UNKNOWN'].includes(btcName);
    let tier = 'WATCH';
    let label = 'WATCH';
    let reasonCode = 'LIQUID_CANDLE_DEFAULT_WATCH';

    if (missing) {
      label = 'WATCH · NO DATA';
      reasonCode = 'LIQUID_CANDLE_PAIR_MISSING';
    } else if (type !== 'LIQUID_KILL_ZONE') {
      reasonCode = 'LIQUID_NON_KILL_ZONE_OBSERVE_ONLY';
    } else if (side === 'LONG' && altBias === 'NEUTRAL' && btcBias === 'BEARISH') {
      label = 'GOOD-TEST';
      reasonCode = 'LIQUID_LONG_NEUTRAL_ALT_BEARISH_BTC_5D_POSITIVE';
    } else if (side === 'SHORT' && altBias === 'BULLISH'
        && ['BULLISH', 'NEUTRAL'].includes(btcBias)) {
      label = 'GOOD-TEST';
      reasonCode = `LIQUID_SHORT_BULLISH_ALT_${btcBias}_BTC_5D_POSITIVE`;
    } else if (side === 'LONG' && altBias === 'BEARISH' && btcBias === 'BEARISH') {
      label = 'WATCH+';
      reasonCode = 'LIQUID_LONG_DOUBLE_BEARISH_SMALL_EDGE';
    } else if ((side === 'SHORT' && altBias === 'NEUTRAL' && btcBias === 'BULLISH')
        || (side === 'LONG' && altBias === 'BULLISH' && ['BEARISH', 'BULLISH'].includes(btcBias))
        || (side === 'SHORT' && altBias === 'BEARISH' && ['BEARISH', 'BULLISH'].includes(btcBias))) {
      tier = 'RISK';
      label = 'RISK';
      reasonCode = 'LIQUID_SIDE_ALT_BTC_GROUP_5D_NEGATIVE';
    }

    return {
      tier,
      label,
      regime: `LIQUID · ${type || 'UNKNOWN'}`,
      side,
      reason: `LIQUID_CANDLE_FLAG_V1_20260722_5D · ${reasonCode} · ALT=${altName}/${altBias} · BTC=${btcName}/${btcBias} · display only; không đổi entry/size/SL/TP`,
    };
  };
  const regimeOf = (trade) => {
    const explicit = normalize(trade?.regimeAtEntry);
    if (['SW_UP', 'SW_DOWN', 'SW_FLAT'].includes(explicit)) return explicit;
    const direction = normalize(
      trade?.btcTrendDir ?? trade?.btcHealth?.btcTrendDir ?? trade?.btcTrend?.direction,
    );
    if (direction === 'UP') return 'SW_UP';
    if (direction === 'DOWN') return 'SW_DOWN';
    const phase = normalize(
      trade?.btcPhase ?? trade?.btcPhaseLabel ?? trade?.btcRegimeAtEntry
      ?? trade?.btcRegime ?? trade?.btcHealth?.regime,
    );
    if (phase.includes('DOWN') || ['WEAK', 'WEAK_DOWN'].includes(phase)) return 'SW_DOWN';
    if (phase.includes('UP') || ['STRONG', 'WEAK_UP'].includes(phase)) return 'SW_UP';
    const pct6h = number(trade?.btcPct6hAtEntry ?? trade?.btcHealth?.pct6h ?? trade?.btcPct6h);
    if (pct6h != null && pct6h > 0) return 'SW_UP';
    if (pct6h != null && pct6h < 0) return 'SW_DOWN';
    return 'SW_FLAT';
  };
  const emaBreakCandleFlagOf = (trade, signalPattern, btcPattern) => {
    const source = normalize(trade?.source);
    const match = source.match(/^EMASQ-(5M|15M)-(BREAKOUT|BREAKDOWN)(?:-|$)/);
    if (!match) return null;
    const timeframe = match[1].toLowerCase();
    const stage = match[2];
    const side = stage === 'BREAKOUT' ? 'LONG' : 'SHORT';
    const altName = normalize(signalPattern?.name ?? 'NO_DATA');
    const btcName = normalize(btcPattern?.name ?? 'NO_DATA');
    const altBias = candleBiasOf(signalPattern);
    const btcBias = candleBiasOf(btcPattern);
    const regime = regimeOf(trade);
    const missing = ['NO_DATA', 'UNKNOWN'].includes(altName) || ['NO_DATA', 'UNKNOWN'].includes(btcName);
    let tier = 'WATCH';
    let label = 'WATCH';
    let reasonCode = 'EMA_BREAK_OBSERVE_DEFAULT';

    if (missing) {
      label = 'WATCH · NO DATA';
      reasonCode = 'EMA_BREAK_CANDLE_PAIR_MISSING';
    } else if (stage === 'BREAKOUT' && timeframe === '5m') {
      tier = 'GOOD';
      label = 'GOOD';
      reasonCode = 'BREAKOUT_5M_POSITIVE_BASE';
      if (altBias === 'BULLISH' && btcBias === 'BEARISH') {
        tier = 'RISK';
        label = 'RISK';
        reasonCode = 'BREAKOUT_5M_ALT_BULLISH_BTC_BEARISH_NEGATIVE';
      } else if (altBias === 'BEARISH') {
        tier = 'WATCH';
        label = 'WATCH+';
        reasonCode = 'BREAKOUT_5M_ALT_PULLBACK_POSITIVE_WATCH';
      }
    } else if (stage === 'BREAKOUT') {
      tier = 'WATCH';
      label = 'WATCH';
      reasonCode = 'BREAKOUT_15M_SMALL_EDGE';
      if (altBias === 'BEARISH' && btcBias === 'BULLISH') {
        label = 'WATCH+';
        reasonCode = 'BREAKOUT_15M_ALT_PULLBACK_BTC_SUPPORT_POSITIVE';
      } else if (altBias === 'BULLISH' && btcBias === 'BEARISH') {
        tier = 'RISK';
        label = 'RISK';
        reasonCode = 'BREAKOUT_15M_ALT_BULLISH_BTC_BEARISH_NEGATIVE';
      }
    } else if (timeframe === '5m') {
      tier = 'RISK';
      label = 'RISK';
      reasonCode = regime === 'SW_UP'
        ? 'BREAKDOWN_5M_SHORT_AGAINST_SW_UP_NEGATIVE'
        : 'BREAKDOWN_5M_NEGATIVE_BASE';
      if (regime !== 'SW_UP' && altBias === 'BULLISH' && btcBias !== 'BEARISH') {
        tier = 'WATCH';
        label = 'GOOD-TEST';
        reasonCode = 'BREAKDOWN_5M_COUNTER_CANDLE_SMALL_POSITIVE_SAMPLE';
      }
    } else {
      tier = regime === 'SW_UP' ? 'RISK' : 'WATCH';
      label = regime === 'SW_UP' ? 'RISK' : 'WATCH';
      reasonCode = regime === 'SW_UP'
        ? 'BREAKDOWN_15M_SHORT_AGAINST_SW_UP_NEGATIVE'
        : 'BREAKDOWN_15M_NEAR_BREAKEVEN';
      if (regime !== 'SW_UP' && altBias === 'BEARISH' && btcBias === 'BEARISH') {
        label = 'GOOD-TEST';
        reasonCode = 'BREAKDOWN_15M_DOUBLE_BEARISH_SMALL_POSITIVE_SAMPLE';
      }
    }

    return {
      tier,
      label,
      regime: `EMA · ${stage} · ${timeframe} · ${regime}`,
      side,
      reason: `EMA_BREAK_CANDLE_FLAG_V1_20260722 · ${reasonCode} · ALT=${altName}/${altBias} · BTC=${btcName}/${btcBias} · display only; không đổi entry/size/SL/TP`,
    };
  };
  const sideCandleOf = (trade, btcPattern, signalPattern = signalPatternOf(trade)) => {
    const edgeFlag = edgeCandleFlagOf(trade, signalPattern, btcPattern);
    if (edgeFlag) return edgeFlag;
    const liquidFlag = liquidCandleFlagOf(trade, signalPattern, btcPattern);
    if (liquidFlag) return liquidFlag;
    const pumpFlag = pumpCandleFlagOf(trade, signalPattern, btcPattern);
    if (pumpFlag) return pumpFlag;
    const emaBreakFlag = emaBreakCandleFlagOf(trade, signalPattern, btcPattern);
    if (emaBreakFlag) return emaBreakFlag;
    const rawSide = normalize(trade?.side ?? trade?.action);
    const side = rawSide.includes('SHORT') ? 'SHORT' : rawSide.includes('LONG') ? 'LONG' : rawSide;
    const regime = regimeOf(trade);
    const bias = candleBiasOf(btcPattern);
    const storedTier = normalize(trade?.shakeoutSideCandleTier ?? trade?.sideCandleTier);
    if (['GOOD', 'RISK', 'WATCH'].includes(storedTier)) {
      return {
        tier: storedTier,
        // PRE_BREAKOUT/PRE_BREAKDOWN persist their own evidence-based label.
        label: String(trade?.sideCandleLabel ?? (storedTier === 'RISK' ? 'RISK · TEST $1' : storedTier)),
        regime: String(trade?.sideCandleContext ?? regime),
        side,
        reason: String(trade?.shakeoutSideCandleReason ?? trade?.sideCandleReason ?? storedTier),
      };
    }
    let tier = 'WATCH';
    let reason = `${regime} + ${side || 'NO_SIDE'} + BTC ${normalize(btcPattern?.name) || 'NO_DATA'}: display only`;
    if (regime === 'SW_DOWN' && side === 'LONG' && bias === 'BEARISH') {
      tier = 'RISK';
      reason = 'LONG opposite SW_DOWN and BTC bearish candle';
    } else if (regime === 'SW_DOWN' && side === 'SHORT' && bias === 'BEARISH') {
      tier = 'GOOD';
      reason = 'SHORT aligned SW_DOWN and BTC bearish candle';
    } else if (regime === 'SW_UP' && side === 'SHORT' && bias === 'BULLISH') {
      tier = 'RISK';
      reason = 'SHORT opposite SW_UP and BTC bullish candle';
    } else if (regime === 'SW_UP' && side === 'LONG' && bias === 'BULLISH') {
      tier = 'GOOD';
      reason = 'LONG aligned SW_UP and BTC bullish candle';
    }
    return { tier, label: tier, regime, side, reason };
  };
  const remember = (trade) => {
    if (!trade || typeof trade !== 'object' || !trade.symbol) return;
    const signalPattern = signalPatternOf(trade);
    const btcPattern = btcPatternOf(trade);
    if (!signalPattern && !btcPattern && !trade.side && !trade.action) return;
    const symbol = normalize(trade.symbol);
    const rows = bySymbol.get(symbol) ?? [];
    const key = String(trade.id ?? `${entryOf(trade)}|${trade.openedAt ?? trade.createdAt ?? ''}`);
    const item = {
      key,
      entry: entryOf(trade),
      signalPattern,
      btcPattern,
      sideCandle: sideCandleOf(trade, btcPattern, signalPattern),
    };
    const index = rows.findIndex((row) => row.key === key);
    if (index >= 0) rows[index] = item;
    else rows.unshift(item);
    bySymbol.set(symbol, rows.slice(0, 100));
  };
  const walk = (value, seen = new WeakSet()) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) return value.forEach((item) => walk(item, seen));
    remember(value);
    Object.values(value).forEach((item) => walk(item, seen));
  };
  const labels = {
    BULLISH_ENGULFING: 'Bullish Engulfing', BEARISH_ENGULFING: 'Bearish Engulfing',
    SHOOTING_STAR: 'Shooting Star', BULLISH_PIN_BAR: 'Bullish Pin Bar',
    BEARISH_PIN_BAR: 'Bearish Pin Bar', BULLISH_MARUBOZU: 'Bullish Marubozu',
    BEARISH_MARUBOZU: 'Bearish Marubozu', BULLISH_CANDLE: 'Bullish Candle',
    BEARISH_CANDLE: 'Bearish Candle', STRONG_RED_CLOSE: 'Strong Red Close',
    STRONG_GREEN_CLOSE: 'Strong Green Close', DOJI: 'Doji', HAMMER: 'Hammer',
    NO_DATA: 'No data', UNKNOWN: 'No data',
  };
  const labelOf = (name) => labels[normalize(name)] ?? normalize(name).replaceAll('_', ' ');
  const patternFromCellText = (value, fallbackTimeframe = '-') => {
    const text = plain(value);
    if (!text || text.includes('NO DATA')) return null;
    const names = [
      'BULLISH_ENGULFING', 'BEARISH_ENGULFING', 'BULLISH_MARUBOZU', 'BEARISH_MARUBOZU',
      'BULLISH_PIN_BAR', 'BEARISH_PIN_BAR', 'BULLISH_CANDLE', 'BEARISH_CANDLE',
      'STRONG_GREEN_CLOSE', 'STRONG_RED_CLOSE', 'SHOOTING_STAR', 'HAMMER', 'DOJI',
    ];
    const name = names.find((candidate) => text.startsWith(plain(labels[candidate] ?? candidate)));
    if (!name) return null;
    const timeframe = text.includes('15M') ? '15M' : text.includes('5M') ? '5M' : normalize(fallbackTimeframe) || '-';
    return { name, direction: candleBiasOf(name), timeframe };
  };
  const closestContext = (symbol, entry) => {
    const rows = bySymbol.get(normalize(symbol)) ?? [];
    if (!rows.length) return null;
    if (entry == null) return rows[0];
    return [...rows].sort((left, right) => {
      const leftDiff = left.entry == null ? Infinity : Math.abs(left.entry - entry) / Math.max(entry, 1e-12);
      const rightDiff = right.entry == null ? Infinity : Math.abs(right.entry - entry) / Math.max(entry, 1e-12);
      return leftDiff - rightDiff;
    })[0] ?? null;
  };
  const symbolFromCell = (value) => {
    const text = normalize(value);
    return text.match(/\b[A-Z0-9]{2,}USDT\b/)?.[0] ?? text.split(/\s+/)[0] ?? '';
  };
  const cellContent = (pattern) => pattern
    ? `<strong style="display:block">${labelOf(pattern.name)}</strong><small style="opacity:.68">${normalize(pattern.timeframe) || '-'}</small>`
    : '<span style="opacity:.55">No data</span>';
  const sideCandleContent = (evaluation) => {
    if (!evaluation) {
      evaluation = {
        tier: 'WATCH', label: 'WATCH', regime: 'SW_FLAT', side: '-',
        reason: 'Khong du snapshot xac nhan; chi hien thi WATCH, khong doi rule',
      };
    }
    const colors = {
      GOOD: ['#052e1a', '#34d399', '#d1fae5'],
      WATCH: ['#422006', '#fbbf24', '#fde68a'],
      RISK: ['#7f1d1d', '#fb7185', '#fff1f2'],
    }[evaluation.tier] ?? ['#111827', '#64748b', '#94a3b8'];
    const title = escapeHtml(evaluation.reason);
    return `<span title="${title}" style="display:inline-block;padding:4px 7px;border:1px solid ${colors[1]};color:${colors[2]};background:${colors[0]};border-radius:4px;font-size:10px;font-weight:950;white-space:nowrap">`
      + `${escapeHtml(evaluation.label)}`
      + `<small style="display:block;margin-top:2px;font-size:9px;opacity:.82">${escapeHtml(evaluation.regime)} · ${escapeHtml(evaluation.side || '-')}</small>`
      + '</span>';
  };
  window.PaperCandleColumns = {
    evaluate(trade) {
      const signalPattern = signalPatternOf(trade);
      const btcPattern = btcPatternOf(trade);
      return sideCandleOf(trade, btcPattern, signalPattern);
    },
    renderEvaluation: sideCandleContent,
  };
  const isPaperTable = (table) => {
    if (location.pathname === '/paper') return true;
    const body = table.querySelector('tbody');
    const marker = `${body?.id ?? ''} ${table.className ?? ''} ${table.parentElement?.className ?? ''}`.toLowerCase();
    if (marker.includes('paper') || marker.includes('closedtrade')) return true;
    const knownPaperPaths = new Set([
      '/pump', '/post-pump-kill-short', '/cap', '/edge-short', '/liquid-scan',
      '/dump-ignition', '/ema-squeeze', '/spike-reversal', '/decision-paper',
      '/shakeout-reclaim', '/top-reversal', '/pump-ignition', '/br-like-limit',
      '/recommended-signals',
    ]);
    if (!knownPaperPaths.has(location.pathname)) return false;
    const headers = [...(table.tHead?.rows?.[0]?.cells ?? [])].map((cell) => plain(cell.textContent));
    return headers.some((text) => text.startsWith('SYMBOL'))
      && headers.some((text) => text.startsWith('SIDE'))
      && headers.some((text) => text.startsWith('ENTRY'));
  };
  const headerKind = (cell) => {
    const text = plain(cell.textContent);
    if (text.includes('SIDE X BTC') || text.includes('SIDE BTC CANDLE')
        || text.includes('PUMP CANDLE FLAG') || text.includes('EMA CANDLE FLAG')
        || text.includes('EDGE CANDLE FLAG') || text.includes('LIQUID CANDLE FLAG')) return 'sideCandle';
    if (text.includes('BTC CANDLE') || text.includes('NEN BTC')) return 'btc';
    if (text.includes('MAU NEN') || text.includes('CANDLE PATTERN')) return 'signal';
    return '';
  };
  const addHeader = (row, index, kind, text) => {
    const th = document.createElement('th');
    th.textContent = text;
    const datasetKey = kind === 'btc'
      ? 'paperBtcCandleColumn'
      : kind === 'sideCandle' ? 'paperSideCandleColumn' : 'paperCandleColumn';
    th.dataset[datasetKey] = 'true';
    th.dataset.paperCandleGenerated = 'true';
    row.insertBefore(th, row.cells[index] ?? null);
    return th;
  };
  const enhanceTable = (table) => {
    if (!isPaperTable(table)) return;
    const row = table.tHead?.rows?.[0];
    if (!row) return;
    let cells = [...row.cells];
    let symbolIndex = cells.findIndex((cell) => plain(cell.textContent).startsWith('SYMBOL'));
    if (symbolIndex < 0) {
      symbolIndex = cells.findIndex((cell) => {
        const text = plain(cell.textContent);
        return text.startsWith('TIN HIEU') || text === 'SIGNAL';
      });
    }
    if (symbolIndex < 0) return;
    let signal = cells.find((cell) => headerKind(cell) === 'signal');
    if (signal) signal.dataset.paperCandleColumn = 'true';
    if (!signal) {
      const sideIndex = cells.findIndex((cell) => plain(cell.textContent).startsWith('SIDE'));
      signal = addHeader(row, (sideIndex >= 0 ? sideIndex : symbolIndex) + 1, 'signal', 'Mẫu nến');
    }
    cells = [...row.cells];
    let btc = cells.find((cell) => headerKind(cell) === 'btc');
    if (btc) btc.dataset.paperBtcCandleColumn = 'true';
    if (!btc) btc = addHeader(row, cells.indexOf(signal) + 1, 'btc', 'Nến BTC');
    cells = [...row.cells];
    let sideCandle = cells.find((cell) => headerKind(cell) === 'sideCandle');
    if (sideCandle) sideCandle.dataset.paperSideCandleColumn = 'true';
    const flagHeader = {
      '/pump': 'Pump candle flag',
      '/ema-squeeze': 'EMA candle flag',
      '/edge-short': 'Edge candle flag',
      '/liquid-scan': 'Liquid candle flag',
    }[location.pathname] ?? 'Side x BTC';
    if (!sideCandle) sideCandle = addHeader(row, cells.indexOf(btc) + 1, 'sideCandle', flagHeader);
    if (flagHeader !== 'Side x BTC' || sideCandle.dataset.paperCandleGenerated === 'true') {
      sideCandle.textContent = flagHeader;
    }
    table.dataset.paperCandleColumns = 'true';
    enhanceRows(table);
  };
  const enhanceRows = (table) => {
    const headerRow = table.tHead?.rows?.[0];
    if (!headerRow) return;
    const headers = [...headerRow.cells];
    const signalIndex = headers.findIndex((cell) => cell.dataset.paperCandleColumn === 'true');
    const btcIndex = headers.findIndex((cell) => cell.dataset.paperBtcCandleColumn === 'true');
    const sideCandleIndex = headers.findIndex((cell) => cell.dataset.paperSideCandleColumn === 'true');
    let symbolIndex = headers.findIndex((cell) => plain(cell.textContent).startsWith('SYMBOL'));
    if (symbolIndex < 0) {
      symbolIndex = headers.findIndex((cell) => {
        const text = plain(cell.textContent);
        return text.startsWith('TIN HIEU') || text === 'SIGNAL';
      });
    }
    const entryIndex = headers.findIndex((cell) => plain(cell.textContent).startsWith('ENTRY'));
    const sideIndex = headers.findIndex((cell) => {
      const text = plain(cell.textContent);
      return text === 'SIDE' || (text.startsWith('SIDE ') && !text.includes('BTC'));
    });
    const btcContextIndex = headers.findIndex((cell) => {
      const text = plain(cell.textContent);
      return text.includes('BTC PHASE') || text.includes('BTC TREND')
        || text.includes('BTC DETAIL') || text.includes('BTC REGIME');
    });
    const sourceColumnIndex = headers.findIndex((cell) => plain(cell.textContent).startsWith('SOURCE'));
    if (signalIndex < 0 || btcIndex < 0 || sideCandleIndex < 0 || symbolIndex < 0) return;
    for (const row of table.tBodies[0]?.rows ?? []) {
      if (row.cells.length <= 1) {
        const missing = headers.length - row.cells.length;
        if (row.cells[0]?.colSpan > 1 && missing > 0) row.cells[0].colSpan = headers.length;
        continue;
      }
      const signalGenerated = headers[signalIndex]?.dataset.paperCandleGenerated === 'true';
      const btcGenerated = headers[btcIndex]?.dataset.paperCandleGenerated === 'true';
      const sideCandleGenerated = headers[sideCandleIndex]?.dataset.paperCandleGenerated === 'true';
      const signalCell = row.querySelector('[data-paper-candle-cell]');
      const btcCell = row.querySelector('[data-paper-btc-candle-cell]');
      const sideCandleCell = row.querySelector('[data-paper-side-candle-cell]');
      const missingIndexes = [];
      if (signalGenerated && !signalCell) missingIndexes.push(signalIndex);
      if (btcGenerated && !btcCell) missingIndexes.push(btcIndex);
      if (sideCandleGenerated && !sideCandleCell) missingIndexes.push(sideCandleIndex);
      const sourceIndex = (headerIndex) => headerIndex - missingIndexes.filter((index) => index < headerIndex).length;
      const symbol = symbolFromCell(row.cells[sourceIndex(symbolIndex)]?.textContent);
      const entry = entryIndex >= 0 ? number(row.cells[sourceIndex(entryIndex)]?.textContent) : null;
      const context = closestContext(symbol, entry);
      const rowSide = sideIndex >= 0
        ? row.cells[sourceIndex(sideIndex)]?.textContent
        : row.cells[sourceIndex(symbolIndex)]?.textContent;
      const rowBtcContext = btcContextIndex >= 0
        ? row.cells[sourceIndex(btcContextIndex)]?.textContent
        : '';
      const rowSignalPattern = context?.signalPattern ?? (!signalGenerated
        ? patternFromCellText(row.cells[sourceIndex(signalIndex)]?.textContent)
        : null);
      const rowBtcPattern = context?.btcPattern ?? (!btcGenerated
        ? patternFromCellText(row.cells[sourceIndex(btcIndex)]?.textContent, '5M')
        : null);
      const rowSource = sourceColumnIndex >= 0
        ? row.cells[sourceIndex(sourceColumnIndex)]?.textContent
        : '';
      const rowSideCandle = context?.sideCandle ?? sideCandleOf({
        side: rowSide,
        source: rowSource,
        candlePatternTimeframe: rowSignalPattern?.timeframe,
        btcPhase: rowBtcContext,
        btcTrendDir: rowBtcContext,
      }, rowBtcPattern, rowSignalPattern);
      if (signalGenerated) {
        const td = signalCell ?? document.createElement('td');
        td.dataset.paperCandleCell = 'true';
        td.style.minWidth = '128px';
        td.innerHTML = cellContent(context?.signalPattern);
        if (!signalCell) row.insertBefore(td, row.cells[signalIndex] ?? null);
      }
      if (btcGenerated) {
        const td = btcCell ?? document.createElement('td');
        td.dataset.paperBtcCandleCell = 'true';
        td.style.minWidth = '128px';
        td.innerHTML = cellContent(context?.btcPattern);
        if (!btcCell) row.insertBefore(td, row.cells[btcIndex] ?? null);
      }
      if (sideCandleGenerated) {
        const td = sideCandleCell ?? document.createElement('td');
        td.dataset.paperSideCandleCell = 'true';
        td.style.minWidth = '128px';
        td.innerHTML = sideCandleContent(rowSideCandle);
        if (!sideCandleCell) row.insertBefore(td, row.cells[sideCandleIndex] ?? null);
      }
    }
  };
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      document.querySelectorAll('table').forEach((table) => table.dataset.paperCandleColumns === 'true' ? enhanceRows(table) : enhanceTable(table));
    });
  };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = String(args[0]?.url ?? args[0] ?? '');
    if (url.toLowerCase().includes('paper')) response.clone().json().then((payload) => { walk(payload); schedule(); }).catch(() => {});
    return response;
  };
  if (window.EventSource) {
    const NativeEventSource = window.EventSource;
    window.EventSource = class PaperCandleEventSource extends NativeEventSource {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', (event) => { try { walk(JSON.parse(event.data)); schedule(); } catch {} });
      }
    };
  }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();
