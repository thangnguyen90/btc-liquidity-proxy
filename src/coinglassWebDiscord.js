import {
  COINGLASS_WEB_BINANCE_LEVERAGE,
  COINGLASS_WEB_BINANCE_STOP_LOSS_ROE_PCT,
  coinglassWebDefaultStopLossPrice,
} from './coinglassWebBinance.js';

export const COINGLASS_WEB_DISCORD_VERSION = 'COINGLASS_WEB_DISCORD_BINANCE_V9_QUALIFIED_12H24H_20260823';
export const COINGLASS_WEB_ZONE_EVALUATION_VERSION = 'COINGLASS_WEB_TWO_SIDED_ZONE_EVAL_V1_20260823';

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

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function zoneAttractionScore(zone = {}, referencePrice = null) {
  const price = finite(zone.price);
  const reference = finite(referencePrice);
  if (!(price > 0) || !(reference > 0)) return 0;
  const distancePct = Math.abs(((price / reference) - 1) * 100);
  return (
    Math.max(0, finite(zone.strength, 0))
    * Math.exp(-distancePct / 8)
    * (1 + Math.min(50, Math.max(0, finite(zone.persistenceBars, 0))) / 100)
  );
}

function buildSideLiquidationBand(row = {}, side = 'ABOVE') {
  const referencePrice = finite(
    row.proposal?.referencePrice,
    finite(row.lastPrice, finite(row.heatmap?.currentPrice)),
  );
  if (!(referencePrice > 0)) return null;
  const candidates = (Array.isArray(row.heatmap?.zones) ? row.heatmap.zones : [])
    .map((zone) => {
      const price = finite(zone?.price);
      if (!(price > 0)) return null;
      const normalizedSide = price >= referencePrice ? 'ABOVE' : 'BELOW';
      return {
        ...zone,
        price,
        side: normalizedSide,
        distancePct: ((price / referencePrice) - 1) * 100,
        attractionScore: zoneAttractionScore(zone, referencePrice),
      };
    })
    .filter((zone) => zone?.side === side && Math.abs(zone.distancePct) <= 20)
    .sort((left, right) => right.attractionScore - left.attractionScore);
  const anchor = candidates[0];
  if (!anchor) return null;

  // A marked heatmap region is normally several neighboring price bins rather
  // than one exact price. Prefer the range extracted by the collector; legacy
  // snapshots fall back to neighboring peaks within 2.5% of reference price.
  const cluster = candidates.filter((zone) => (
    Math.abs(zone.price - anchor.price) / referencePrice * 100 <= 2.5
  ));
  const lows = cluster.map((zone) => finite(zone.bandLow, zone.price)).filter((price) => price > 0);
  const highs = cluster.map((zone) => finite(zone.bandHigh, zone.price)).filter((price) => price > 0);
  const rawLow = Math.min(...lows);
  const rawHigh = Math.max(...highs);
  const low = side === 'ABOVE' ? Math.max(referencePrice, rawLow) : rawLow;
  const high = side === 'BELOW' ? Math.min(referencePrice, rawHigh) : rawHigh;
  if (!(high >= low)) return null;
  const midpoint = (low + high) / 2;
  const nearestPrice = side === 'ABOVE' ? low : high;
  return {
    side,
    low,
    high,
    midpoint,
    distancePct: ((midpoint / referencePrice) - 1) * 100,
    nearestDistancePct: ((nearestPrice / referencePrice) - 1) * 100,
    strength: Math.max(...cluster.map((zone) => Math.max(0, finite(zone.strength, 0)))),
    persistenceBars: Math.max(...cluster.map((zone) => Math.max(0, finite(zone.persistenceBars, 0)))),
    attractionScore: cluster.reduce((total, zone) => total + zone.attractionScore, 0),
  };
}

export function buildCoinglassTwoSidedLiquidationBands(row = {}) {
  const referencePrice = finite(
    row.proposal?.referencePrice,
    finite(row.lastPrice, finite(row.heatmap?.currentPrice)),
  );
  const upper = buildSideLiquidationBand(row, 'ABOVE');
  const lower = buildSideLiquidationBand(row, 'BELOW');
  return {
    referencePrice,
    upper,
    lower,
    complete: Boolean(referencePrice > 0 && upper && lower),
  };
}

export function selectCoinglassZoneEvaluationRow(rows = []) {
  const candidates = (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.status === 'OK' && row?.stale !== true)
    .map((row) => {
      const bands = buildCoinglassTwoSidedLiquidationBands(row);
      const twoSidedScore = bands.complete
        ? (Math.min(bands.upper.attractionScore, bands.lower.attractionScore) * 2)
          + (Math.max(bands.upper.attractionScore, bands.lower.attractionScore) * 0.25)
        : 0;
      return { row, bands, twoSidedScore };
    })
    .filter((candidate) => candidate.bands.complete);
  const altcoins = candidates.filter((candidate) => candidate.row.symbol !== 'BTCUSDT');
  const pool = altcoins.length ? altcoins : candidates;
  return pool.sort((left, right) => right.twoSidedScore - left.twoSidedScore)[0] ?? null;
}

function formatLiquidationBand(band) {
  if (!band) return '—';
  const range = Math.abs(band.high - band.low) > Math.max(1e-12, Math.abs(band.midpoint) * 1e-8)
    ? `**${number(band.low, 8)} – ${number(band.high, 8)}**`
    : `quanh **${number(band.midpoint, 8)}**`;
  return `${range}\nCách giá **${number(band.distancePct)}%** · lực **${number(band.strength, 0)}/100** · bền **${number(band.persistenceBars, 0)} bars**`;
}

function formatCompactLiquidationBand(band) {
  if (!band) return '—';
  const range = Math.abs(band.high - band.low) > Math.max(1e-12, Math.abs(band.midpoint) * 1e-8)
    ? `${number(band.low, 8)}–${number(band.high, 8)}`
    : number(band.midpoint, 8);
  return `**${range}** · ${number(band.distancePct)}% · lực ${number(band.strength, 0)}`;
}

function buildQualifiedTimeframeBands(row = {}, range = '12h') {
  const frame = row.qualifiedTimeframes?.[range];
  if (!frame?.heatmap) return null;
  const referencePrice = finite(frame.heatmap.currentPrice, finite(row.lastPrice));
  return buildCoinglassTwoSidedLiquidationBands({
    ...row,
    lastPrice: referencePrice,
    heatmap: frame.heatmap,
    proposal: { referencePrice },
  });
}

function formatQualifiedTimeframe(row, range) {
  const bands = buildQualifiedTimeframeBands(row, range);
  if (!bands?.complete) {
    return row.qualifiedTimeframeError
      ? `Chưa lấy được (${String(row.qualifiedTimeframeError).slice(0, 140)}).\nKhông ảnh hưởng qualified/Binance.`
      : 'Chưa lấy được trong budget lượt quét. Không ảnh hưởng qualified/Binance.';
  }
  return [
    `🟥 Trên: ${formatCompactLiquidationBand(bands.upper)}`,
    `🟦 Dưới: ${formatCompactLiquidationBand(bands.lower)}`,
    `Giá khung: **${number(bands.referencePrice, 8)}**`,
  ].join('\n');
}

export function buildCoinglassWebZoneEvaluationPayload({
  row = null,
  generatedAt = Date.now(),
  statusMessage = '',
  pageUrl = '',
} = {}) {
  if (!row) {
    return {
      username: 'CoinGlass Zone Evaluation',
      embeds: [{
        title: '🟠 ĐÁNH GIÁ 2 VÙNG · CHƯA CÓ DỮ LIỆU',
        description: [
          '**THAM KHẢO SAU LƯỢT QUÉT — KHÔNG PHẢI TÍN HIỆU VÀO LỆNH**',
          statusMessage || 'Không có coin fresh với đủ cả vùng thanh lý phía trên và phía dưới.',
          pageUrl ? `[Mở CoinGlass collector](${pageUrl}) để kiểm tra hoặc đăng nhập lại.` : null,
          'Không tác động paper, Binance, entry, size, SL hoặc TP.',
        ].filter(Boolean).join('\n'),
        color: 0xf59e0b,
        timestamp: new Date(generatedAt).toISOString(),
        footer: { text: COINGLASS_WEB_ZONE_EVALUATION_VERSION },
      }],
    };
  }

  const bands = buildCoinglassTwoSidedLiquidationBands(row);
  const links = buildCoinglassWebExternalLinks(row);
  const upperDistance = Math.abs(finite(bands.upper?.nearestDistancePct, Infinity));
  const lowerDistance = Math.abs(finite(bands.lower?.nearestDistancePct, Infinity));
  const closer = upperDistance < lowerDistance
    ? 'Vùng phía trên đang gần giá hơn.'
    : lowerDistance < upperDistance
      ? 'Vùng phía dưới đang gần giá hơn.'
      : 'Khoảng cách hai vùng tới giá đang cân bằng.';
  return {
    username: 'CoinGlass Zone Evaluation',
    embeds: [{
      title: `🟣 ĐÁNH GIÁ 2 VÙNG THANH LÝ · ${row.symbol}`,
      url: links.coinglass ?? undefined,
      description: [
        '**THAM KHẢO SAU LƯỢT QUÉT — KHÔNG PHẢI TÍN HIỆU VÀO LỆNH**',
        'Coin này được chọn vì có hai cụm thanh lý rõ nhất trong lượt quét; không bắt buộc pass toàn bộ gate qualified.',
        `**Nhận xét:** ${closer} ${row.proposal?.label ? `Proposal hiện tại: **${row.proposal.label}**.` : ''}`,
        '**BINANCE AUTO:** KHÔNG áp dụng cho message đánh giá này.',
      ].join('\n'),
      color: 0x8b5cf6,
      fields: [
        {
          name: '💵 GIÁ THAM CHIẾU',
          value: `**${number(bands.referencePrice, 8)}**\n24h **${number(row.priceChangePercent24h)}%** · ${sideTitle(row)}`,
          inline: false,
        },
        {
          name: '🟥 VÙNG THANH LÝ PHÍA TRÊN · SHORT LIQ',
          value: formatLiquidationBand(bands.upper),
          inline: true,
        },
        {
          name: '🟦 VÙNG THANH LÝ PHÍA DƯỚI · LONG LIQ',
          value: formatLiquidationBand(bands.lower),
          inline: true,
        },
        {
          name: '🧲 CÂN BẰNG LỰC HÚT',
          value: `Trên/dưới **${number(row.proposal?.aboveScore)} / ${number(row.proposal?.belowScore)}**\nCells **${number(row.heatmap?.liquidationCellCount, 0)}**`,
          inline: false,
        },
        {
          name: '🔗 MỞ BIỂU ĐỒ',
          value: [
            links.coinglass ? `[🔥 CoinGlass Model 3](${links.coinglass})` : null,
            links.binance ? `[📈 Binance Futures](${links.binance})` : null,
            pageUrl ? `[🧪 Trang đánh giá](${pageUrl})` : null,
          ].filter(Boolean).join('  ·  ') || '—',
          inline: false,
        },
      ],
      timestamp: new Date(generatedAt).toISOString(),
      footer: { text: COINGLASS_WEB_ZONE_EVALUATION_VERSION },
    }],
  };
}

export function coinglassWebDiscordDedupeKey(row = {}) {
  const symbol = String(row.symbol ?? '').toUpperCase();
  const action = String(row.proposal?.action ?? 'NO_DATA');
  return symbol && row.qualified ? `V5:${symbol}:${action}` : '';
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

export function buildCoinglassWebDiscordPayload(row = {}, generatedAt = Date.now(), binanceSettings = {}) {
  const proposal = row.proposal ?? {};
  const isLong = proposal.action === 'WAIT_LONG_CONFIRMATION';
  const target = proposal.targetZone;
  const risk = proposal.riskZone;
  const plan = proposal.tradePlan ?? {};
  const entry = plan.entry;
  const takeProfit = plan.takeProfit;
  const takeProfit2 = plan.takeProfit2;
  const direction = isLong ? 'LONG' : 'SHORT';
  const leverage = Math.max(1, Number(
    binanceSettings.leverage
    ?? process.env.COINGLASS_WEB_BINANCE_LEVERAGE
    ?? COINGLASS_WEB_BINANCE_LEVERAGE,
  ));
  const marginUsdt = Math.max(0.01, Number(binanceSettings.marginUsdt ?? 2));
  const binanceEnabled = binanceSettings.binanceEnabled !== false;
  const stopLossRoePct = Math.max(1, Number(
    process.env.COINGLASS_WEB_BINANCE_STOP_LOSS_ROE_PCT ?? COINGLASS_WEB_BINANCE_STOP_LOSS_ROE_PCT,
  ));
  const stopLoss = coinglassWebDefaultStopLossPrice({
    side: direction,
    entryPrice: entry?.price,
    leverage,
    stopLossRoePct,
  });
  const stopLossPricePct = stopLossRoePct / leverage;
  const directionIcon = isLong ? '🟢' : '🔴';
  const links = buildCoinglassWebExternalLinks(row);
  const bands = buildCoinglassTwoSidedLiquidationBands(row);
  return {
    username: 'CoinGlass Qualified Setups',
    embeds: [{
      title: `${directionIcon} ${direction} · ${row.symbol} · ${sideTitle(row)}`,
      url: links.binance ?? undefined,
      description: [
        `**ĐỦ ĐIỀU KIỆN COINGLASS · ${direction} SETUP**`,
        proposal.rationale,
        binanceEnabled
          ? `**BINANCE AUTO:** BẬT · MARKET \`$${number(marginUsdt)} x${number(leverage, 0)}\` khi Mark Binance **cao hơn entry đề xuất**.`
          : '**BINANCE AUTO:** TẮT cho CoinGlass Qualified; chỉ gửi cảnh báo, không vào lệnh thật.',
        `**SL Binance:** cố định **-${number(stopLossRoePct)}% ROE** (${number(stopLossPricePct)}% giá @${number(leverage, 0)}x), neo theo average fill.`,
        '**Đảo chiều:** chỉ đóng vị thế ngược chiều khi uPnL đang dương; uPnL ≤ 0 thì bỏ lệnh mới.',
      ].filter(Boolean).join('\n'),
      color: isLong ? 0x22c55e : 0xef4444,
      fields: [
        {
          name: '📍 ENTRY THAM CHIẾU',
          value: entry
            ? `**${number(entry.price, 8)}**\nTrigger MARKET: Mark Binance > entry\n${entry.instruction}`
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
            ? `SL **${number(stopLoss, 8)}** · -${number(stopLossRoePct)}% ROE · ${number(stopLossPricePct)}% giá @${number(leverage, 0)}x`
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
          name: '🟥 VÙNG THANH LÝ PHÍA TRÊN · 48H',
          value: formatLiquidationBand(bands.upper),
          inline: true,
        },
        {
          name: '🟦 VÙNG THANH LÝ PHÍA DƯỚI · 48H',
          value: formatLiquidationBand(bands.lower),
          inline: true,
        },
        {
          name: '⏱️ THANH LÝ 12H · RIÊNG',
          value: formatQualifiedTimeframe(row, '12h'),
          inline: false,
        },
        {
          name: '🕘 THANH LÝ 24H · RIÊNG',
          value: formatQualifiedTimeframe(row, '24h'),
          inline: false,
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
