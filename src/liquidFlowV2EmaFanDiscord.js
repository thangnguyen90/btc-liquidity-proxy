export const LIQUID_FLOW_V2_EMA_FAN_DISCORD_VERSION = 'LIQUID_FLOW_V2_EMA_FAN_DISCORD_V2_ENTRY_ROUTING_20260814';

export const LIQUID_FLOW_V2_EMA_FAN_DISCORD_LABELS = new Set([
  'EMA_FAN_LONG_READY',
  'EMA_FAN_LONG_IMPULSE_RUNNER',
  'EMA_FAN_SHORT_READY',
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

export function liquidFlowV2EmaFanDiscordDedupeKey(row = {}, classification = {}) {
  const symbol = String(row.symbol ?? '').trim().toUpperCase();
  const labelKey = String(classification.labelKey ?? '');
  const side = labelKey === 'EMA_FAN_SHORT_READY' ? 'SHORT' : 'LONG';
  const fan = side === 'SHORT' ? row.features?.emaFanShort5m : row.features?.emaFanLong5m;
  const closedAt = finite(classification.signalCandleClosedAt)
    ?? finite(classification.emaFanReadyAt)
    ?? finite(fan?.readyAt)
    ?? finite(fan?.candleClosedAt)
    ?? 0;
  if (!symbol || !LIQUID_FLOW_V2_EMA_FAN_DISCORD_LABELS.has(labelKey)) return null;
  return `${symbol}|${labelKey}|${closedAt}`;
}

export function buildLiquidFlowV2EmaFanDiscordPayload(row = {}, classification = {}, generatedAt = Date.now()) {
  const labelKey = String(classification.labelKey ?? '');
  if (!LIQUID_FLOW_V2_EMA_FAN_DISCORD_LABELS.has(labelKey)) return null;
  const short = labelKey === 'EMA_FAN_SHORT_READY';
  const impulse = labelKey === 'EMA_FAN_LONG_IMPULSE_RUNNER';
  const side = short ? 'SHORT' : 'LONG';
  const features = row.features ?? {};
  const fan = (short ? features.emaFanShort5m : features.emaFanLong5m) ?? {};
  const rank = short ? features.liquidityRank : features.moverRank;
  const rankName = short ? 'Liquidity rank' : 'Gainer rank';
  return {
    embeds: [{
      title: `[LIQ FLOW V2 EMA FAN] ${String(row.symbol ?? '').toUpperCase()} ${side} READY`,
      description: String(classification.reason ?? labelKey),
      color: short ? 0xf43f5e : 0x10b981,
      fields: [
        { name: 'Signal', value: `\`${labelKey}\``, inline: false },
        { name: rankName, value: `#${fmt(rank, 0)} · ${String(features.universeTier ?? '-')}`, inline: true },
        { name: 'Confidence', value: `${fmt(classification.confidence, 0)}%`, inline: true },
        { name: '24h / 1h', value: `${pct(features.change24hPct)} / ${pct(features.change1hPct)}`, inline: true },
        { name: 'Mark', value: fmt(features.markPrice, 8), inline: true },
        { name: 'EMA13 / EMA25 / EMA99', value: `${fmt(fan.ema13, 8)} / ${fmt(fan.ema25, 8)} / ${fmt(fan.ema99, 8)}`, inline: false },
        { name: 'EMA gaps', value: `${pct(fan.gap1325Pct)} / ${pct(fan.gap2599Pct)}`, inline: true },
        { name: 'Compression', value: `median ${pct(fan.priorMedianSpreadPct)} · ${fmt(fan.compressedBars, 0)}/12`, inline: true },
        { name: 'Volume / RSI14', value: `${fmt(fan.volumeX, 2)}x / ${fmt(fan.rsi14, 1)}`, inline: true },
        { name: 'Distance EMA13', value: pct(fan.distanceFromEma13Pct), inline: true },
        {
          name: 'Entry route',
          value: short
            ? 'PAPER ONLY $10 × 5x'
            : impulse
              ? 'Paper MARKET $10 × 5x · Binance MARKET $5 × 5x ngay khi READY'
              : 'Paper LIMIT EMA13 +1% / 15m · paper fill → Binance MARKET $1 × 5x',
          inline: false,
        },
        { name: 'Paper exit', value: 'TP +10% ROE · SL -25% ROE · max 12h', inline: false },
      ],
      footer: {
        text: short
          ? `${LIQUID_FLOW_V2_EMA_FAN_DISCORD_VERSION} | SHORT PAPER ONLY | no Binance order`
          : `${LIQUID_FLOW_V2_EMA_FAN_DISCORD_VERSION} | ${impulse ? 'LONG IMPULSE MARKET' : 'LONG LIMIT-FILL ROUTE'}`,
      },
      timestamp: new Date(Number.isFinite(Number(generatedAt)) ? Number(generatedAt) : Date.now()).toISOString(),
    }],
  };
}
