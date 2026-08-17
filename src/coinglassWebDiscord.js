export const COINGLASS_WEB_DISCORD_VERSION = 'COINGLASS_WEB_DISCORD_V1_20260817';

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
  return symbol && row.qualified ? `${symbol}:${action}` : '';
}

export function buildCoinglassWebDiscordPayload(row = {}, generatedAt = Date.now()) {
  const proposal = row.proposal ?? {};
  const isLong = proposal.action === 'WAIT_LONG_CONFIRMATION';
  const target = proposal.targetZone;
  const risk = proposal.riskZone;
  return {
    username: 'CoinGlass Movers Observer',
    embeds: [{
      title: `${row.symbol} · ${sideTitle(row)} · ${isLong ? 'CANH LONG' : 'CANH SHORT'}`,
      description: [
        proposal.rationale,
        `**Xác nhận bắt buộc:** ${proposal.confirmation}`,
        '**OBSERVE ONLY — chưa phải lệnh Binance.**',
      ].filter(Boolean).join('\n'),
      color: isLong ? 0x35f3b0 : 0xff6e87,
      fields: [
        { name: 'Giá tham chiếu', value: number(proposal.referencePrice ?? row.lastPrice, 8), inline: true },
        { name: 'Vùng hút', value: target ? `${number(target.price, 8)} (${number(target.distancePct)}%)` : '—', inline: true },
        { name: 'Vùng rủi ro', value: risk ? `${number(risk.price, 8)} (${number(risk.distancePct)}%)` : '—', inline: true },
        { name: 'Lực trên / dưới', value: `${number(proposal.aboveScore)} / ${number(proposal.belowScore)}`, inline: true },
        { name: 'Volume / OI', value: `${compactUsd(row.quoteVolume24h)} / ${compactUsd(row.binanceLiquidity?.openInterestNotional)}`, inline: true },
        { name: 'CoinGlass cells', value: number(row.heatmap?.liquidationCellCount, 0), inline: true },
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
