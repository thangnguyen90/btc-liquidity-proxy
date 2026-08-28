export const LIQUID_MARKET_DIRECTION_DISCORD_VERSION = 'LIQUID_MARKET_DIRECTION_DISCORD_V1_COMMITTED_CHANGE_20260823';

const LABEL_META = Object.freeze({
  LONG_FAVORED: { emoji: '🟢', color: 0x32eeb8, title: 'SÓNG LONG · ƯU TIÊN SETUP LONG' },
  SHORT_FAVORED: { emoji: '🔴', color: 0xff5878, title: 'SÓNG SHORT · ƯU TIÊN SETUP SHORT' },
  MARKET_CHOP: { emoji: '🟡', color: 0xe6b558, title: 'THỊ TRƯỜNG SIDEWAY · GIẢM TẦN SUẤT' },
  MARKET_DISPERSION: { emoji: '🟣', color: 0xb68cff, title: 'THỊ TRƯỜNG PHÂN HÓA · CHỌN COIN KỸ' },
  MARKET_TRANSITION: { emoji: '🟠', color: 0xf0a34a, title: 'THỊ TRƯỜNG ĐANG CHUYỂN SÓNG' },
  MARKET_SHOCK: { emoji: '🔥', color: 0xff6b2c, title: 'BIẾN ĐỘNG SỐC · RỦI RO CAO' },
  NO_DATA: { emoji: '⚪', color: 0x87938f, title: 'CHƯA ĐỦ DỮ LIỆU XÁC ĐỊNH SÓNG' },
});

const normalizedLabel = (value) => String(value ?? '').trim().toUpperCase();
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const pct = (value, digits = 1) => {
  const number = finite(value);
  return number == null ? '--' : `${number >= 0 ? '+' : ''}${number.toFixed(digits)}%`;
};
const score = (value) => {
  const number = finite(value);
  return number == null ? '--' : number.toFixed(0);
};

export function evaluateMarketDirectionDiscordTransition(previousLabel, market = {}) {
  const previous = normalizedLabel(previousLabel);
  const current = normalizedLabel(market?.label);
  if (!current || current === 'NO_DATA') {
    return { action: 'IGNORE_NO_DATA', previousLabel: previous || null, currentLabel: current || 'NO_DATA' };
  }
  if (!previous || previous === 'NO_DATA') {
    return { action: 'ARM_BASELINE', previousLabel: previous || null, currentLabel: current };
  }
  if (previous === current) {
    return { action: 'NO_CHANGE', previousLabel: previous, currentLabel: current };
  }
  return { action: 'NOTIFY', previousLabel: previous, currentLabel: current };
}

export function buildMarketDirectionDiscordPayload({ previousLabel, market = {} } = {}) {
  const transition = evaluateMarketDirectionDiscordTransition(previousLabel, market);
  if (transition.action !== 'NOTIFY') return null;

  const currentMeta = LABEL_META[transition.currentLabel] ?? LABEL_META.NO_DATA;
  const previousMeta = LABEL_META[transition.previousLabel] ?? LABEL_META.NO_DATA;
  const scores = market.scores ?? {};
  const breadth = market.breadth ?? {};
  const btc = market.btc ?? {};
  const confidence = finite(scores.confidence);
  const evaluatedAt = finite(market.evaluatedAt) ?? Date.now();
  const reasons = Array.isArray(market.reasons)
    ? market.reasons.filter(Boolean).slice(0, 4).map((reason) => `• ${String(reason).slice(0, 240)}`).join('\n')
    : '';

  return {
    username: 'V2 Market Wave',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${currentMeta.emoji} ĐỔI SÓNG: ${transition.previousLabel.replaceAll('_', ' ')} → ${transition.currentLabel.replaceAll('_', ' ')}`,
      description: `**${currentMeta.title}**\nNhãn đã commit sau hysteresis nến 5m. Cảnh báo tham khảo **OBSERVE ONLY**, không tự đặt/chặn lệnh Binance.`,
      color: currentMeta.color,
      fields: [
        {
          name: '📊 Điểm hướng',
          value: `LONG **${score(scores.long)}** · SHORT **${score(scores.short)}** · Confidence **${confidence == null ? '--' : `${confidence.toFixed(0)}%`}**`,
          inline: false,
        },
        {
          name: '🌐 Breadth altcoin',
          value: `1h ↑${pct(breadth.up1hPct)} / ↓${pct(breadth.down1hPct)}\n3h ↑${pct(breadth.up3hPct)} / ↓${pct(breadth.down3hPct)}\n6h ↑${pct(breadth.up6hPct)} / ↓${pct(breadth.down6hPct)}`,
          inline: true,
        },
        {
          name: '₿ BTC',
          value: `15m ${pct(btc.ret15m, 2)}\n1h ${pct(btc.ret1h, 2)}\n6h ${pct(btc.ret6h, 2)} · ${String(btc.trend ?? '--')}`,
          inline: true,
        },
        {
          name: '✅ Xác nhận',
          value: `Stable: **${transition.currentLabel.replaceAll('_', ' ')}**\nSample: ${Number(market.sampleSize ?? 0)}/${Number(market.universeSize ?? 0)} · ${Number(market.hysteresisSamples ?? 2)} nến 5m`,
          inline: false,
        },
        ...(reasons ? [{ name: '🧭 Lý do', value: reasons, inline: false }] : []),
      ],
      footer: {
        text: `${LIQUID_MARKET_DIRECTION_DISCORD_VERSION} · trước đó ${previousMeta.title}`,
      },
      timestamp: new Date(evaluatedAt).toISOString(),
    }],
  };
}
