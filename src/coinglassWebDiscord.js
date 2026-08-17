export const COINGLASS_WEB_DISCORD_VERSION = 'COINGLASS_WEB_DISCORD_LINKS_V3_20260817';

function number(value, digits = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
}

function compactUsd(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact', style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  }).format(parsed);
}

function sideTitle(row = {}) {
  if (row.moverSide === 'UP') return `TOP TĂNG #${row.moverRank}`;
  if (row.moverSide === 'DOWN') return `TOP GIẢM #${row.moverRank}`;
  return 'BTC THAM CHIẾU';
}

export function coinglassWebDiscordDedupeKey(row = {}) {
  const symbol = String(row.symbol ?? '').toUpperCase();
  const action = String(row.proposal?.action ?? 'NO_DATA');
  return symbol && row.qualified ? `V3:${symbol}:${action}` : '';
}

export function buildCoinglassWebExternalLinks(row = {}) {
  const symbol = String(row.symbol ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,24}USDT$/.test(symbol)) return { binance: null, coinglass: null };
  const baseAsset = String(row.baseAsset ?? symbol.replace(/USDT$/, '')).trim().toUpperCase();
  if (!/^[A-Z0-9]{1,20}$/.test(baseAsset)) return { binance: null, coinglass: null };
  return {
    binance: `https://www.binance.com/en/futures/${encodeURIComponent(symbol)}`,
    coinglass: `https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3?coin=${encodeURIComponent(baseAsset)}&type=pair`,
  };
}

export function buildCoinglassWebDiscordPayload(row = {}, generatedAt = Date.now()) {
  const proposal = row.proposal ?? {};
  const isLong = proposal.action === 'WAIT_LONG_CONFIRMATION';
  const target = proposal.targetZone;
  const risk = proposal.riskZone;
  const plan = proposal.tradePlan ?? {};
  const entry = plan.entry;
  const takeProfit = plan.takeProfit;
  const takeProfit2 = plan.takeProfit2;
  const stopLoss = plan.stopLoss;
  const direction = isLong ? 'LONG' : 'SHORT';
  const directionIcon = isLong ? '🟢' : '🔴';
  const links = buildCoinglassWebExternalLinks(row);
  return {
    username: 'CoinGlass Qualified Setups',
    embeds: [{
      title: `${directionIcon} ${direction} · ${row.symbol} · ${sideTitle(row)}`,
      url: links.binance ?? undefined,
      description: [
        `**ĐỦ ĐIỀU KIỆN COINGLASS · ${direction} SETUP**`,
        proposal.rationale,
        '**OBSERVE ONLY — các mức dưới đây chỉ có hiệu lực sau xác nhận, bot không tự vào Binance.**',
      ].filter(Boolean).join('\n'),
      color: isLong ? 0x22c55e : 0xef4444,
      fields: [
        {
          name: '📍 ENTRY THAM CHIẾU',
          value: entry
            ? `**${number(entry.price, 8)}**\n${entry.instruction}`
            : '—',
          inline: false,
        },
        {
          name: '🎯 TAKE PROFIT',
          value: takeProfit
            ? `TP1 **${number(takeProfit.price, 8)}** · ${number(takeProfit.distancePct)}%${takeProfit2 ? `\nTP2 **${number(takeProfit2.price, 8)}** · ${number(takeProfit2.distancePct)}%` : ''}`
            : target ? number(target.price, 8) : '—',
          inline: true,
        },
        {
          name: '🛡️ STOP LOSS / INVALIDATION',
          value: stopLoss
            ? `SL **${number(stopLoss.price, 8)}** · ${number(stopLoss.distancePct)}%`
            : risk ? number(risk.price, 8) : '—',
          inline: true,
        },
        {
          name: '⚖️ RISK : REWARD',
          value: plan.complete
            ? `**1 : ${number(plan.rewardRiskRatio)}**\nRisk ${number(plan.riskPct)}% · Reward ${number(plan.rewardPct)}%`
            : 'Không đầy đủ — không nên được gửi',
          inline: true,
        },
        {
          name: '✅ XÁC NHẬN BẮT BUỘC',
          value: `${proposal.confirmation || '—'}\n**Vô hiệu:** ${proposal.invalidation || '—'}`,
          inline: false,
        },
        {
          name: '🧲 COINGLASS',
          value: `Cells **${number(row.heatmap?.liquidationCellCount, 0)}**\nLực trên/dưới **${number(proposal.aboveScore)} / ${number(proposal.belowScore)}**`,
          inline: true,
        },
        {
          name: '📊 BINANCE LIQUIDITY',
          value: `Vol **${compactUsd(row.quoteVolume24h)}**\nOI **${compactUsd(row.binanceLiquidity?.openInterestNotional)}**\nSpread **${number(row.binanceLiquidity?.spreadBps)} bps**`,
          inline: true,
        },
        {
          name: '🏷️ PHÂN LOẠI',
          value: `${sideTitle(row)}\n24h **${number(row.priceChangePercent24h)}%**`,
          inline: true,
        },
        {
          name: '🔗 MỞ BIỂU ĐỒ',
          value: [
            links.coinglass ? `[🔥 CoinGlass Model 3](${links.coinglass})` : null,
            links.binance ? `[📈 Binance Futures](${links.binance})` : null,
          ].filter(Boolean).join('  ·  ') || '—',
          inline: false,
        },
      ],
      timestamp: new Date(generatedAt).toISOString(),
      footer: { text: COINGLASS_WEB_DISCORD_VERSION },
    }],
  };
}

export function buildCoinglassWebAuthAlertPayload({ message, pageUrl, generatedAt = Date.now() } = {}) {
  return {
    username: 'CoinGlass Movers Observer',
    embeds: [{
      title: 'CoinGlass collector cần đăng nhập / mở quyền altcoin',
      description: [
        message || 'Collector không đọc được dữ liệu Model 3 altcoin.',
        pageUrl ? `[Mở trang collector](${pageUrl}) rồi bấm **Đăng nhập cho collector**.` : 'Mở trang collector rồi đăng nhập lại.',
        'Scheduler sẽ bỏ qua cảnh báo trùng trong thời gian cooldown.',
      ].join('\n'),
      color: 0xffbc5c,
      timestamp: new Date(generatedAt).toISOString(),
      footer: { text: COINGLASS_WEB_DISCORD_VERSION },
    }],
  };
}
