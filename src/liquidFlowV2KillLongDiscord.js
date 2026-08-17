export const LIQUID_FLOW_V2_KILL_LONG_DISCORD_VERSION =
  'LIQUID_FLOW_V2_KILL_LONG_EXHAUSTION_DISCORD_V1_20260815';

export const LIQUID_FLOW_V2_KILL_LONG_DISCORD_LABELS = new Set([
  'KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY',
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
    LIQUID_FLOW_V2_KILL_LONG_DISCORD_LABELS.has(String(classification?.labelKey ?? ''))) ?? null;
}

export function liquidFlowV2KillLongDiscordDedupeKey(row = {}, classificationInput = null) {
  const symbol = String(row.symbol ?? '').trim().toUpperCase();
  const classification = matchingClassification(row, classificationInput);
  const labelKey = String(classification?.labelKey ?? '');
  const candleClosedAt = finite(classification?.signalCandleClosedAt)
    ?? finite(row.features?.candleClosedAt)
    ?? 0;
  if (!symbol || !LIQUID_FLOW_V2_KILL_LONG_DISCORD_LABELS.has(labelKey)) return null;
  return `${symbol}|${labelKey}|${candleClosedAt}`;
}

export function buildLiquidFlowV2KillLongDiscordPayload(
  row = {},
  classificationInput = null,
  generatedAt = Date.now(),
) {
  const classification = matchingClassification(row, classificationInput);
  const labelKey = String(classification?.labelKey ?? '');
  if (!LIQUID_FLOW_V2_KILL_LONG_DISCORD_LABELS.has(labelKey)) return null;

  const features = row.features ?? {};
  const symbol = String(row.symbol ?? '').trim().toUpperCase();
  const candle = features.lastClosedCandle ?? {};
  const forceDecay = finite(features.longLiquidationDecayRatio);
  const oiCurrent = finite(features.openInterestDeltaPct);
  const oiPrior = finite(features.openInterestPriorDeltaPct);
  const generated = Number.isFinite(Number(generatedAt)) ? Number(generatedAt) : Date.now();
  const binanceUrl = `https://www.binance.com/en/futures/${encodeURIComponent(symbol)}`;
  const coinglassUrl = `https://www.coinglass.com/tv/Binance_${encodeURIComponent(symbol)}`;

  return {
    embeds: [
      {
        title: `🟢 [LIQ FLOW V2] ${symbol} · KILL LONG EXHAUSTION`,
        description: [
          '**Kết luận: LONG READY sau khi cascade suy kiệt.**',
          'Không vào chỉ vì giá đã giảm sâu: nhãn yêu cầu force SELL giảm, OI ổn định và nến 5m reclaim xác nhận.',
          `[Binance](${binanceUrl}) · [Coinglass](${coinglassUrl})`,
        ].join('\n'),
        color: 0x22c55e,
        fields: [
          { name: '🏷️ Nhãn', value: `\`${labelKey}\``, inline: false },
          { name: '🎯 Confidence', value: `${fmt(classification?.confidence, 0)}%`, inline: true },
          { name: '💵 Mark / close 5m', value: `${fmt(features.markPrice, 8)} / ${fmt(candle.close, 8)}`, inline: true },
          { name: '📉 Pullback / hồi từ đáy', value: `${pct(features.pullbackFromRecentHighPct)} / ${pct(features.reboundFromApproachLowPct)}`, inline: true },
          { name: '🧨 Force SELL LONG liq', value: `5m hiện tại ${usd(features.longLiquidationUsd)}\n5m trước ${usd(features.prior5mLongLiquidationUsd)}\nDecay ${forceDecay == null ? '-' : `${fmt(forceDecay, 2)}x`}`, inline: true },
          { name: '📊 OI washout → ổn định', value: `5m ${pct(features.openInterestDelta5mPct)}\n1m trước ${pct(oiPrior)} → hiện tại ${pct(oiCurrent)}`, inline: true },
          { name: '🔄 Reclaim 5m', value: `EMA13 ${fmt(features.ema13, 8)}\nEMA25 ${fmt(features.ema25, 8)}\nHigher-low ${features.higherLowConfirmed === true ? 'YES' : 'NO'}`, inline: true },
          { name: '⚖️ Volume / taker', value: `${fmt(features.volumeX, 2)}x / ${pct(features.takerDeltaPct)}`, inline: true },
          { name: '🧪 Theo dõi', value: 'PAPER $10 × 5x · TP +10% ROE · SL -20% ROE · tối đa 4 giờ', inline: true },
          { name: '🚫 Binance', value: 'KHÔNG đặt lệnh thật', inline: true },
        ],
        footer: { text: `${LIQUID_FLOW_V2_KILL_LONG_DISCORD_VERSION} | causal closed-5m + OI + force-order` },
        timestamp: new Date(generated).toISOString(),
      },
      {
        title: '🟠 Điều kiện hủy ý tưởng LONG',
        description: [
          '• Giá tạo đáy mới sau nến reclaim.',
          '• Force SELL tăng trở lại thay vì tiếp tục suy giảm.',
          '• OI quay lại giảm nhanh hoặc taker chuyển âm.',
          '• Nến 5m đóng mất EMA13/EMA25 vừa reclaim.',
        ].join('\n'),
        color: 0xf59e0b,
      },
    ],
  };
}
