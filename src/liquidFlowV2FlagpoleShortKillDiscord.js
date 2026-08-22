export const LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_DISCORD_VERSION =
  'LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_DISCORD_V1_20260818';

export const LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_DISCORD_LABELS = new Set([
  'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY',
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

const usd = (value) => {
  const parsed = finite(value);
  if (parsed == null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(parsed);
};

function matchingClassification(row = {}, supplied = null) {
  const candidates = supplied ? [supplied] : [
    row.classification,
    ...(Array.isArray(row.classification?.secondaryLabels) ? row.classification.secondaryLabels : []),
  ];
  return candidates.find((classification) =>
    LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_DISCORD_LABELS.has(
      String(classification?.labelKey ?? ''),
    )) ?? null;
}

export function liquidFlowV2FlagpoleShortKillDiscordDedupeKey(
  row = {},
  classificationInput = null,
) {
  const symbol = String(row.symbol ?? '').trim().toUpperCase();
  const classification = matchingClassification(row, classificationInput);
  const labelKey = String(classification?.labelKey ?? '');
  const candleClosedAt = finite(classification?.signalCandleClosedAt)
    ?? finite(classification?.flagpoleShortKillReadyAt)
    ?? finite(row.features?.flagpoleShortKill5m?.readyAt)
    ?? 0;
  if (!symbol || !LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_DISCORD_LABELS.has(labelKey)) return null;
  return `${symbol}|${labelKey}|${candleClosedAt}`;
}

export function buildLiquidFlowV2FlagpoleShortKillDiscordPayload(
  row = {},
  classificationInput = null,
  generatedAt = Date.now(),
) {
  const classification = matchingClassification(row, classificationInput);
  const labelKey = String(classification?.labelKey ?? '');
  if (!LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_DISCORD_LABELS.has(labelKey)) return null;

  const features = row.features ?? {};
  const setup = features.flagpoleShortKill5m ?? {};
  const symbol = String(row.symbol ?? '').trim().toUpperCase();
  if (!symbol) return null;
  const generated = Number.isFinite(Number(generatedAt)) ? Number(generatedAt) : Date.now();
  const lowerWickPct = finite(setup.confirmationLowerWickShare);
  const closePositionPct = finite(setup.confirmationClosePosition);
  const binanceUrl = `https://www.binance.com/en/futures/${encodeURIComponent(symbol)}`;
  const coinglassUrl = `https://www.coinglass.com/tv/Binance_${encodeURIComponent(symbol)}`;

  return {
    embeds: [
      {
        title: `🚩 [LIQ FLOW V2] ${symbol} · FLAGPOLE KILL SHORT`,
        description: [
          '**Kết luận: LONG READY sau nhịp pump thứ hai có force BUY kill SHORT.**',
          'Đây không phải pump đầu: detector bắt buộc đã có pump trước, pullback đủ dài, flagpole 5m và nến kế tiếp rút râu đóng reclaim.',
          `[Binance](${binanceUrl}) · [Coinglass](${coinglassUrl})`,
        ].join('\n'),
        color: 0x14b8a6,
        fields: [
          { name: '🏷️ Nhãn', value: `\`${labelKey}\``, inline: false },
          { name: '🎯 Confidence', value: `${fmt(classification?.confidence, 0)}%`, inline: true },
          { name: '💵 Mark / close xác nhận', value: `${fmt(features.markPrice, 8)} / ${fmt(setup.confirmationClose, 8)}`, inline: true },
          { name: '🔁 Chu kỳ trước', value: `Pump ${pct(setup.priorPumpPct)}\nPullback ${pct(setup.pullbackPct)}\nCách đỉnh ${fmt(setup.barsAfterPriorPeak, 0)} nến`, inline: true },
          { name: '🚩 Cột cờ 5m', value: `Body ${pct(setup.flagpoleBodyPct)}\nRange/ATR ${fmt(setup.flagpoleRangeAtr, 2)}x\nVolume ${fmt(setup.flagpoleVolumeX, 2)}x`, inline: true },
          { name: '🟢 Taker / rút râu', value: `Taker cột cờ ${pct(setup.flagpoleTakerDeltaPct)}\nRâu dưới ${pct(lowerWickPct == null ? null : lowerWickPct * 100)}\nClose-pos ${pct(closePositionPct == null ? null : closePositionPct * 100)}`, inline: true },
          { name: '🧨 Force BUY kill SHORT', value: `5m hiện tại ${usd(features.shortLiquidationUsd)}\n5m trước ${usd(features.prior5mShortLiquidationUsd)}\nBurst ${fmt(features.shortLiquidationBurst, 2)}x`, inline: true },
          { name: '📊 OI', value: `${pct(features.openInterestDeltaPct)}${features.openInterestDeltaPct > 0 ? ' (đang mở rộng, giảm confidence)' : ' (không mở rộng)'}`, inline: true },
          { name: '🧪 Paper plan', value: 'LONG $10 × 5x · entry mark sau nến đóng · TP +10% ROE · SL -20% ROE · tối đa 4 giờ', inline: false },
          { name: '🚫 Binance', value: 'KHÔNG đặt lệnh thật; chờ đủ mẫu CLOSED và WHITELIST AvgROE > 4%.', inline: false },
        ],
        footer: {
          text: `${LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_DISCORD_VERSION} | causal closed-5m + force-order BUY`,
        },
        timestamp: new Date(generated).toISOString(),
      },
    ],
  };
}
