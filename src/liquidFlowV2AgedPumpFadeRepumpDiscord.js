export const LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_DISCORD_VERSION =
  'LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_DISCORD_V1_20260901';

export const LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_DISCORD_LABELS = new Set([
  'AGED_PUMP_FADE_REPUMP_SHORT_ALERT',
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
    LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_DISCORD_LABELS.has(
      String(classification?.labelKey ?? ''),
    )) ?? null;
}

export function liquidFlowV2AgedPumpFadeRepumpDiscordDedupeKey(
  row = {},
  classificationInput = null,
) {
  const symbol = String(row.symbol ?? '').trim().toUpperCase();
  const classification = matchingClassification(row, classificationInput);
  const labelKey = String(classification?.labelKey ?? '');
  const closedAt = finite(classification?.signalCandleClosedAt)
    ?? finite(row.features?.agedPumpFadeRepump5m?.readyAt)
    ?? 0;
  if (!symbol || !LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_DISCORD_LABELS.has(labelKey)) return null;
  return `${symbol}|${labelKey}|${closedAt}`;
}

export function buildLiquidFlowV2AgedPumpFadeRepumpDiscordPayload(
  row = {},
  classificationInput = null,
  generatedAt = Date.now(),
) {
  const classification = matchingClassification(row, classificationInput);
  const labelKey = String(classification?.labelKey ?? '');
  if (!LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_DISCORD_LABELS.has(labelKey)) return null;

  const features = row.features ?? {};
  const setup = features.agedPumpFadeRepump5m ?? {};
  const symbol = String(row.symbol ?? '').trim().toUpperCase();
  if (!symbol) return null;
  const generated = Number.isFinite(Number(generatedAt)) ? Number(generatedAt) : Date.now();
  const binanceUrl = `https://www.binance.com/en/futures/${encodeURIComponent(symbol)}`;
  const coinglassUrl = `https://www.coinglass.com/tv/Binance_${encodeURIComponent(symbol)}`;

  return {
    embeds: [{
      title: `🟠 [LIQ FLOW V2] ${symbol} · AGED FADE REPUMP KILL SHORT`,
      description: [
        '**OBSERVE ONLY · KHÔNG VÀO PAPER/BINANCE.**',
        'Coin đã bơm tạo đỉnh, xả dần/lower-high rồi bất ngờ dựng một nến 5m quét SHORT và rút khỏi đỉnh nến.',
        `[Binance](${binanceUrl}) · [Coinglass](${coinglassUrl})`,
      ].join('\n'),
      color: 0xf59e0b,
      fields: [
        { name: '🏷️ Nhãn', value: `\`${labelKey}\``, inline: false },
        { name: '🎯 Confidence', value: `${fmt(classification?.confidence, 0)}%`, inline: true },
        { name: '💵 Giá tham chiếu', value: fmt(setup.signalClose, 8), inline: true },
        { name: '🏔️ Sóng cũ', value: `Pump ${pct(setup.priorPumpPct)}\nCách đỉnh ${fmt(setup.barsSincePriorPeak, 0)} nến\nDrawdown ${pct(setup.waveDrawdownPct)}`, inline: true },
        { name: '📉 Pha xả', value: `${fmt(setup.fadeBarCount, 0)} nến\nReturn ${pct(setup.fadeReturnPct)}\nLower-high ${fmt(setup.lowerHighSteps, 0)} bước`, inline: true },
        { name: '🚀 Nến repump 5m', value: `High/open ${pct(setup.signalHighOpenPct)}\nClose/open ${pct(setup.signalCloseOpenPct)}\nRange/ATR ${fmt(setup.signalRangeAtr, 2)}x`, inline: true },
        { name: '🧲 Volume / taker', value: `${fmt(setup.signalVolumeX, 2)}x / ${pct(setup.signalTakerDeltaPct)}`, inline: true },
        { name: '↘️ Xác nhận rút đỉnh', value: `Giveback ${pct(setup.signalGivebackPct)}\nRâu trên ${pct(finite(setup.signalUpperWickShare) == null ? null : finite(setup.signalUpperWickShare) * 100)}\nQuét đỉnh gần ${pct(setup.localHighSweepPct)}`, inline: true },
        { name: '📐 EMA trước tín hiệu', value: `EMA13 ${fmt(setup.ema13, 8)}\nEMA25 ${fmt(setup.ema25, 8)}\nEMA99 ${fmt(setup.ema99, 8)}`, inline: true },
        { name: '⚠️ Hành động', value: 'Chỉ cảnh báo đánh giá. Detector không tạo entry, size, SL hay TP.', inline: false },
      ],
      footer: {
        text: `${LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_DISCORD_VERSION} | closed 5m causal`,
      },
      timestamp: new Date(generated).toISOString(),
    }],
  };
}
