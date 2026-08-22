export const LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_DISCORD_VERSION =
  'LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_DISCORD_V1_20260818';

export const LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_DISCORD_LABELS = new Set([
  'FADING_WAVE_LIVE_PUMP_SHORT_READY',
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

function matchingClassification(row = {}, supplied = null) {
  const candidates = supplied ? [supplied] : [
    row.classification,
    ...(Array.isArray(row.classification?.secondaryLabels) ? row.classification.secondaryLabels : []),
  ];
  return candidates.find((classification) =>
    LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_DISCORD_LABELS.has(
      String(classification?.labelKey ?? ''),
    )) ?? null;
}

export function liquidFlowV2FadingWaveLivePumpDiscordDedupeKey(
  row = {},
  classificationInput = null,
) {
  const symbol = String(row.symbol ?? '').trim().toUpperCase();
  const classification = matchingClassification(row, classificationInput);
  const labelKey = String(classification?.labelKey ?? '');
  const liveOpenAt = finite(classification?.signalLiveCandleOpenAt)
    ?? finite(row.features?.fadingWaveLivePump5m?.liveCandleOpenAt)
    ?? 0;
  if (!symbol || !LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_DISCORD_LABELS.has(labelKey)) return null;
  return `${symbol}|${labelKey}|${liveOpenAt}`;
}

export function buildLiquidFlowV2FadingWaveLivePumpDiscordPayload(
  row = {},
  classificationInput = null,
  generatedAt = Date.now(),
) {
  const classification = matchingClassification(row, classificationInput);
  const labelKey = String(classification?.labelKey ?? '');
  if (!LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_DISCORD_LABELS.has(labelKey)) return null;

  const features = row.features ?? {};
  const setup = features.fadingWaveLivePump5m ?? {};
  const symbol = String(row.symbol ?? '').trim().toUpperCase();
  if (!symbol) return null;
  const generated = Number.isFinite(Number(generatedAt)) ? Number(generatedAt) : Date.now();
  const binanceUrl = `https://www.binance.com/en/futures/${encodeURIComponent(symbol)}`;
  const coinglassUrl = `https://www.coinglass.com/tv/Binance_${encodeURIComponent(symbol)}`;
  const wickPct = finite(setup.liveUpperWickShare);

  return {
    embeds: [{
      title: `🔴 [LIQ FLOW V2] ${symbol} · FADING WAVE LIVE PUMP SHORT`,
      description: [
        '**SHORT READY ngay trong nến 5m đang bơm.**',
        'Coin đang ở nhịp sóng tàn/downtrend; nến live quét lên EMA99 bằng volume/taker mua lớn và đã bắt đầu rút khỏi đỉnh.',
        `[Binance](${binanceUrl}) · [Coinglass](${coinglassUrl})`,
      ].join('\n'),
      color: 0xef4444,
      fields: [
        { name: '🏷️ Nhãn', value: `\`${labelKey}\``, inline: false },
        { name: '🎯 Confidence', value: `${fmt(classification?.confidence, 0)}%`, inline: true },
        { name: '💵 Entry mark', value: fmt(features.markPrice, 8), inline: true },
        { name: '📉 Downtrend', value: `EMA99 slope ${pct(setup.ema99Slope12Pct)}\n12 nến ${pct(setup.downReturn12Pct)}\nDưới EMA99 ${fmt(setup.belowEma99Bars, 0)}/12`, inline: true },
        { name: '🌊 Sóng tàn', value: `Cách đỉnh ${fmt(setup.barsSinceWavePeak, 0)} nến\nDrawdown ${pct(setup.waveDrawdownPct)}`, inline: true },
        { name: '🚀 Nến pump live', value: `High/open ${pct(setup.livePumpHighPct)}\nMark/open ${pct(setup.liveMarkPumpPct)}\nRange/ATR ${fmt(setup.liveRangeAtr, 2)}x`, inline: true },
        { name: '🧲 Volume / taker', value: `${fmt(setup.liveVolumeX, 2)}x / ${pct(setup.liveTakerDeltaPct)}`, inline: true },
        { name: '↘️ Rút khỏi đỉnh', value: `Giveback ${pct(setup.liveGivebackPct)}\nRâu trên ${pct(wickPct == null ? null : wickPct * 100)}`, inline: true },
        { name: '⚡ Binance', value: 'MARKET SHORT · margin $1 × 5x (quantity có thể ceil tối thiểu notional sàn)', inline: false },
        { name: '🛡️ Protection', value: 'TP +10% ROE · SL -20% ROE · fill-anchored · tối đa 4 giờ', inline: false },
      ],
      footer: {
        text: `${LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_DISCORD_VERSION} | live 5m causal tick`,
      },
      timestamp: new Date(generated).toISOString(),
    }],
  };
}
