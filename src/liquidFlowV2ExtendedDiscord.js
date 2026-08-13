export const LIQUID_FLOW_V2_EXTENDED_DISCORD_VERSION = 'LIQUID_FLOW_V2_PANIC_DISCORD_V2_PRIMARY_RECLAIM_20260812';
export const LIQUID_FLOW_V2_EXTENDED_LABEL = 'EXTENDED_EMA99_PANIC_RECLAIM_LONG';
export const LIQUID_FLOW_V2_PRIMARY_PANIC_LABEL = 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY';
export const LIQUID_FLOW_V2_PANIC_DISCORD_LABELS = new Set([
  LIQUID_FLOW_V2_EXTENDED_LABEL,
  LIQUID_FLOW_V2_PRIMARY_PANIC_LABEL,
]);

const finite = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const fmt = (value, digits = 4) => {
  const parsed = finite(value);
  return parsed == null ? '-' : parsed.toFixed(digits).replace(/\.?0+$/, '');
};

const pct = (value, digits = 2) => {
  const parsed = finite(value);
  return parsed == null ? '-' : `${parsed.toFixed(digits)}%`;
};

export function liquidFlowV2ExtendedDiscordDedupeKey(row = {}) {
  const symbol = String(row.symbol ?? '').trim().toUpperCase();
  const labelKey = String(row.classification?.labelKey ?? '');
  const candleClosedAt = finite(row.features?.candleClosedAt) ?? 0;
  if (!symbol || !LIQUID_FLOW_V2_PANIC_DISCORD_LABELS.has(labelKey)) return null;
  return `${symbol}|${labelKey}|${candleClosedAt}`;
}

export function buildLiquidFlowV2ExtendedDiscordPayload(row = {}, generatedAt = Date.now()) {
  const labelKey = String(row.classification?.labelKey ?? '');
  if (!LIQUID_FLOW_V2_PANIC_DISCORD_LABELS.has(labelKey)) return null;
  const features = row.features ?? {};
  const cohort = labelKey === LIQUID_FLOW_V2_PRIMARY_PANIC_LABEL ? 'PRIMARY PANIC' : 'EXTENDED';
  return {
    embeds: [{
      title: `[LIQ FLOW V2 ${cohort}] ${String(row.symbol ?? '').toUpperCase()} LONG READY`,
      description: String(row.classification?.reason ?? labelKey),
      color: 0x10b981,
      fields: [
        { name: 'Signal', value: `\`${labelKey}\``, inline: false },
        { name: 'Mover rank', value: `#${fmt(features.moverRank, 0)} · ${String(features.universeTier ?? '-')}`, inline: true },
        { name: 'Confidence', value: `${fmt(row.classification?.confidence, 0)}%`, inline: true },
        { name: 'Mark / EMA99 5m', value: `${fmt(features.markPrice, 8)} / ${fmt(features.ema99, 8)}`, inline: true },
        { name: 'Touch / reclaim', value: `${pct(features.ema99LongTouchDistancePct)} / ${pct(features.ema99DistancePct)}`, inline: true },
        { name: 'Panic / rebound', value: `${pct(features.pullbackFromRecentHighPct)} / ${pct(features.reboundFromApproachLowPct)}`, inline: true },
        { name: 'Volume / Taker', value: `${fmt(features.volumeX, 2)}x / ${pct(features.takerDeltaPct)}`, inline: true },
        { name: '24h / 1h', value: `${pct(features.change24hPct)} / ${pct(features.change1hPct)}`, inline: true },
        { name: 'HTF bull tier', value: String(features.htfBullTier ?? '-'), inline: true },
      ],
      footer: { text: `${LIQUID_FLOW_V2_EXTENDED_DISCORD_VERSION} | OBSERVE + PAPER ONLY | no Binance order` },
      timestamp: new Date(Number.isFinite(Number(generatedAt)) ? Number(generatedAt) : Date.now()).toISOString(),
    }],
  };
}
