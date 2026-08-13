export const LIQUID_FLOW_V2_HTF_DISCORD_VERSION = 'LIQUID_FLOW_V2_HTF_DISCORD_MTF_V2_20260811';

export const LIQUID_FLOW_V2_HTF_DISCORD_LABELS = new Set([
  'HTF_BEAR_15M_EMA99_PUMP_REJECT',
  'HTF_BULL_15M_EMA99_DUMP_RECLAIM',
]);

const finite = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const fmt = (value, digits = 4) => {
  const parsed = finite(value);
  if (parsed == null) return '-';
  return parsed.toFixed(digits).replace(/\.?0+$/, '');
};

const pct = (value, digits = 2) => {
  const parsed = finite(value);
  return parsed == null ? '-' : `${parsed.toFixed(digits)}%`;
};

export function liquidFlowV2HtfDiscordDedupeKey(row = {}) {
  const symbol = String(row.symbol ?? '').trim().toUpperCase();
  const labelKey = String(row.classification?.labelKey ?? '');
  const timeframe = String(row.classification?.ema99RetestTimeframe ?? '15m');
  const retest = timeframe === '5m' ? row.features?.ema99Retest5m : row.features?.ema99Retest15m;
  const closedAt = finite(row.classification?.ema99RetestCandleClosedAt)
    ?? finite(retest?.candleClosedAt)
    ?? finite(row.features?.candleClosedAt)
    ?? 0;
  if (!symbol || !LIQUID_FLOW_V2_HTF_DISCORD_LABELS.has(labelKey)) return null;
  return `${symbol}|${labelKey}|${closedAt}`;
}

export function buildLiquidFlowV2HtfDiscordPayload(row = {}, generatedAt = Date.now()) {
  const labelKey = String(row.classification?.labelKey ?? '');
  if (!LIQUID_FLOW_V2_HTF_DISCORD_LABELS.has(labelKey)) return null;
  const bearish = labelKey === 'HTF_BEAR_15M_EMA99_PUMP_REJECT';
  const features = row.features ?? {};
  const timeframe = String(row.classification?.ema99RetestTimeframe ?? '15m');
  const retest = (timeframe === '5m' ? features.ema99Retest5m : features.ema99Retest15m) ?? {};
  const trend1h = features.trend1h ?? {};
  const trend4h = features.trend4h ?? {};
  const side = bearish ? 'SHORT' : 'LONG';
  const direction = bearish ? 'BEAR' : 'BULL';
  const moveName = bearish ? 'Pump / Giveback' : 'Dump / Recovery';
  const moveValue = bearish
    ? `${pct(retest.pumpPct)} / ${pct(finite(retest.givebackRatio) == null ? null : finite(retest.givebackRatio) * 100)}`
    : `${pct(retest.dumpPct)} / ${pct(finite(retest.recoveryRatio) == null ? null : finite(retest.recoveryRatio) * 100)}`;
  const touchDistance = bearish ? retest.shortTouchDistancePct : retest.longTouchDistancePct;
  const trendText = (trend, expected) => `${trend.ready === true ? 'ready' : 'warmup'} / ${trend[expected] === true ? expected : 'not-confirmed'}`;
  const timestamp = new Date(Number.isFinite(Number(generatedAt)) ? Number(generatedAt) : Date.now()).toISOString();

  return {
    embeds: [{
      title: `[LIQ FLOW V2 HTF ${direction}] ${String(row.symbol ?? '').toUpperCase()} ${side}`,
      description: String(row.classification?.reason ?? labelKey),
      color: bearish ? 0xf43f5e : 0x10b981,
      fields: [
        { name: 'Signal', value: `\`${labelKey}\``, inline: false },
        { name: 'Confidence', value: `${fmt(row.classification?.confidence, 0)}%`, inline: true },
        { name: 'HTF tier', value: String(bearish ? features.htfBearTier ?? '-' : features.htfBullTier ?? '-'), inline: true },
        { name: 'Side', value: side, inline: true },
        { name: '1h trend', value: trendText(trend1h, bearish ? 'bearish' : 'bullish'), inline: true },
        { name: '4h trend', value: trendText(trend4h, bearish ? 'bearish' : 'bullish'), inline: true },
        { name: `${timeframe} close / EMA99`, value: `${fmt(retest.close, 8)} / ${fmt(retest.ema99, 8)}`, inline: true },
        { name: 'EMA99 touch distance', value: pct(touchDistance), inline: true },
        { name: moveName, value: moveValue, inline: true },
        { name: 'Volume / Taker', value: `${fmt(retest.volumeX, 2)}x / ${pct(retest.takerDeltaPct)}`, inline: true },
        { name: '24h / 1h', value: `${pct(features.change24hPct)} / ${pct(features.change1hPct)}`, inline: true },
        { name: 'Mark', value: fmt(features.markPrice, 8), inline: true },
      ],
      footer: { text: `${LIQUID_FLOW_V2_HTF_DISCORD_VERSION} | PAPER EVAL ONLY | no Binance order` },
      timestamp,
    }],
  };
}
