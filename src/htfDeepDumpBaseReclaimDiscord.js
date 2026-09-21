import {
  HTF_DEEP_DUMP_BASE_RECLAIM_RULE,
  HTF_DEEP_DUMP_BASE_RECLAIM_VERSION,
  HTF_DEEP_DUMP_EARLY_WATCH,
  HTF_DEEP_DUMP_RETEST_LONG_READY,
  HTF_DEEP_PUMP_EARLY_SHORT_WATCH,
  HTF_DEEP_PUMP_RETEST_SHORT_READY,
} from './htfDeepDumpBaseReclaim.js';

export const HTF_DEEP_DUMP_BASE_15M_DISCORD_VERSION =
  'HTF_DEEP_DUMP_BASE_15M_LONG_SHORT_BINANCE_V4_SHORT_LARGE_REBOUND_20260914';

const MAX_EVENT_AGE_MS = 15 * 60_000 + 90_000;

const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const fmt = (value, digits = 6) => {
  const parsed = finite(value);
  return parsed == null ? '-' : parsed.toFixed(digits).replace(/\.?0+$/, '');
};

const pct = (value, digits = 2) => {
  const parsed = finite(value);
  return parsed == null ? '-' : `${parsed.toFixed(digits)}%`;
};

const ratio = (value, digits = 2) => {
  const parsed = finite(value);
  return parsed == null ? '-' : `${parsed.toFixed(digits)}x`;
};

export function normalizeHtfDeepDumpDiscordWebhookUrl(value) {
  const input = String(value ?? '').trim();
  if (!input) return '';
  try {
    const url = new URL(input);
    const allowedHost = url.hostname === 'discord.com' || url.hostname === 'discordapp.com';
    const validPath = /^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
    if (url.protocol !== 'https:' || !allowedHost || !validPath || url.username || url.password) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function eventRank(event) {
  return ([HTF_DEEP_DUMP_RETEST_LONG_READY, HTF_DEEP_PUMP_RETEST_SHORT_READY]
    .includes(event.stage) ? 1_000_000 : 0)
    + (event.shockTier === 'EXTREME' ? 100_000 : 0)
    + Math.min(50_000, Math.round(finite(event.shockPct, 0) * 1_000))
    + (event.htfInterval === '4h' ? 100 : 0);
}

function hasMeasuredShortRebound(event = {}) {
  if (event.side !== 'SHORT' || event.stage !== HTF_DEEP_PUMP_RETEST_SHORT_READY) return true;
  return finite(event.shortReboundPct, -Infinity)
      >= HTF_DEEP_DUMP_BASE_RECLAIM_RULE.shortMinReboundPct
    && finite(event.shortReboundAtrMultiple, -Infinity)
      >= HTF_DEEP_DUMP_BASE_RECLAIM_RULE.shortMinReboundAtr
    && finite(event.shortFadePct, -Infinity)
      >= HTF_DEEP_DUMP_BASE_RECLAIM_RULE.shortMinFadePct
    && finite(event.shortFadeAtrMultiple, -Infinity)
      >= HTF_DEEP_DUMP_BASE_RECLAIM_RULE.shortMinFadeAtr;
}

export function collectHtfDeepDumpBase15mDiscordEvent(row = {}, now = Date.now()) {
  if (!Number.isFinite(now)
    || row?.dataFreshness?.stale === true
    || row?.dataFreshness?.fresh === false) return null;
  const snapshot = row?.features?.htfDeepDumpBaseReclaim;
  const candidates = Array.isArray(snapshot?.events)
    ? snapshot.events
    : snapshot?.primary ? [snapshot.primary] : [];
  const event = [...candidates]
    .filter((candidate) => candidate?.executionEnabled === false
      && candidate?.closed === true
      && ['LONG', 'SHORT'].includes(candidate?.side)
      && [
        HTF_DEEP_DUMP_EARLY_WATCH,
        HTF_DEEP_DUMP_RETEST_LONG_READY,
        HTF_DEEP_PUMP_EARLY_SHORT_WATCH,
        HTF_DEEP_PUMP_RETEST_SHORT_READY,
      ]
        .includes(candidate?.stage)
      && (candidate.observeOnly === true || candidate.executionEligible === true)
      && hasMeasuredShortRebound(candidate)
      && finite(candidate?.candleCloseAt) != null
      && finite(candidate?.candleCloseAt) <= now
      && now - finite(candidate?.candleCloseAt) <= MAX_EVENT_AGE_MS
      && /^(HTF_DEEP_DUMP_BASE_RECLAIM|HTF_DEEP_PUMP_BASE_REJECT)\|/
        .test(String(candidate?.dedupeKey ?? '')))
    .sort((left, right) => eventRank(right) - eventRank(left)
      || finite(right.candleCloseAt, 0) - finite(left.candleCloseAt, 0))[0];
  const symbol = String(row?.symbol ?? event?.symbol ?? '').trim().toUpperCase();
  if (!event || !symbol) return null;
  return {
    ...event,
    version: HTF_DEEP_DUMP_BASE_15M_DISCORD_VERSION,
    detectorVersion: HTF_DEEP_DUMP_BASE_RECLAIM_VERSION,
    symbol,
    binanceExecution: row?.binanceExecution ?? event?.binanceExecution ?? null,
    dedupeKey: event.dedupeKey,
  };
}

export function buildHtfDeepDumpBase15mDiscordPayload(event = {}) {
  const long = event.side === 'LONG';
  const ready = long
    ? event.stage === HTF_DEEP_DUMP_RETEST_LONG_READY
    : event.stage === HTF_DEEP_PUMP_RETEST_SHORT_READY;
  const watch = long
    ? event.stage === HTF_DEEP_DUMP_EARLY_WATCH
    : event.stage === HTF_DEEP_PUMP_EARLY_SHORT_WATCH;
  const symbol = String(event.symbol ?? '').trim().toUpperCase();
  if (!symbol || !['LONG', 'SHORT'].includes(event.side) || (!ready && !watch)) return null;
  const binanceUrl = `https://www.binance.com/en/futures/${encodeURIComponent(symbol)}`;
  const confirmationInterval = ready && event.confirmationInterval === '5m' ? '5m' : '15m';
  const stageText = ready
    ? `${confirmationInterval.toUpperCase()} ${confirmationInterval === '5m' ? 'FAST ' : ''}RETEST ${event.side} READY`
    : `15M EARLY ${event.side} WATCH`;
  const baseStructure = event.baseStructure === 'IMMEDIATE_ACCEPTED_WICK'
    ? (long ? 'rút chân và giữ đáy ngay' : 'rút đầu và giữ đỉnh ngay')
    : (long ? 'đáy ngang / higher-low' : 'đỉnh ngang / lower-high');
  const binanceStatus = String(event.binanceExecution?.status ?? '');
  const executionLine = !ready
    ? '**OBSERVE ONLY — EARLY WATCH KHÔNG ĐẶT LỆNH BINANCE.**'
    : ['FILLED', 'NEW', 'PARTIALLY_FILLED', 'SUBMITTED'].includes(binanceStatus.toUpperCase())
      ? `**BINANCE: ${event.side} MARKET · margin 5 USDT ×5 · ${binanceStatus.toUpperCase()}.**`
      : binanceStatus === 'off'
        ? '**BINANCE OFF TRÊN TRANG ĐIỀU KHIỂN — KHÔNG ĐẶT LỆNH.**'
        : `**BINANCE READY · ${event.side} MARKET · margin 5 USDT ×5 · trạng thái ${binanceStatus || 'đang xử lý'}.**`;
  const confirmationLines = [
    `Close **${fmt(event.price, 8)}** · EMA13 **${fmt(event.ema13, 8)}**`,
    `${long ? 'Breakout' : 'Breakdown'} volume **${ratio(event.breakoutQuoteVolumeRatio)}** · nến đóng lúc <t:${Math.floor(finite(event.candleCloseAt, 0) / 1000)}:F>`,
  ];
  if (ready) {
    confirmationLines.push(
      confirmationInterval === '5m'
        ? `Xác nhận sau **${fmt(event.retestBars5mAfterEarly, 0)} nến 5m** kể từ EARLY 15m · vùng ${long ? 'giữ' : 'bị từ chối'} **${fmt(event.retestSupportLow, 8)}–${fmt(event.retestSupportHigh, 8)}**`
        : `Retest sau **${fmt(event.retestBarsAfterEarly, 0)} nến 15m** · vùng ${long ? 'giữ' : 'bị từ chối'} **${fmt(event.retestSupportLow, 8)}–${fmt(event.retestSupportHigh, 8)}**`,
    );
    if (!long) {
      confirmationLines.push(
        `Nhịp hồi lớn **${pct(event.shortReboundPct)} / ${ratio(event.shortReboundAtrMultiple)} ATR15m** từ **${fmt(event.shortReboundLow, 8)}** lên **${fmt(event.shortReboundHigh, 8)}**`,
        `Sau đỉnh hồi đã giảm lại **${pct(event.shortFadePct)} / ${ratio(event.shortFadeAtrMultiple)} ATR15m** rồi mới xác nhận SHORT`,
      );
    }
  } else {
    confirmationLines.push(long
      ? 'Mới reclaim đường cổ; còn chờ một nến 15m retest giữ vùng để nâng thành READY.'
      : 'Mới breakdown đường cổ; còn chờ một nến 15m retest bị từ chối để nâng thành READY.');
  }
  return {
    username: 'HTF Deep Base Retest 15m',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${ready ? (long ? '🟢' : '🔴') : '🟡'} ${symbol} · ${event.htfInterval} ${long ? 'DEEP DUMP BASE' : 'DEEP PUMP TOP'} · ${stageText}`,
      color: ready ? (long ? 0x10b981 : 0xef4444) : 0xf59e0b,
      description: [
        executionLine,
        ready
          ? (long
            ? `Đáy sideway khung ${event.htfInterval} đã có; nến ${confirmationInterval} đóng retest giữ đường cổ và EMA13.`
            : `Đỉnh sideway khung ${event.htfInterval} đã có; nến ${confirmationInterval} đóng retest bị từ chối dưới đường cổ và EMA13.`)
          : (long
            ? 'Đáy sideway khung lớn đã có; nến 15m vừa đóng reclaim đường cổ và EMA13.'
            : 'Đỉnh sideway khung lớn đã có; nến 15m vừa đóng breakdown đường cổ và EMA13.'),
        `[Mở Binance](${binanceUrl})`,
      ].join('\n'),
      fields: [
        {
          name: '🏷️ Loại tín hiệu',
          value: `\`${event.stage}\` · hướng **${event.side}** · ${event.shockTier}`,
          inline: false,
        },
        {
          name: `${long ? '💥 Cú sập' : '🚀 Cú bơm'} ${event.htfInterval}`,
          value: [
            `${long ? 'Shock' : 'Pump'} **${pct(long ? event.shockPct : event.pumpPct)}** · phá ${long ? 'đáy' : 'đỉnh'} cũ **${pct(long ? event.breakPriorLowPct : event.breakPriorHighPct)}**`,
            `True range **${ratio(event.trueRangeRatio)} ATR14** · volume **${ratio(event.quoteVolumeRatio)}**`,
            `Râu ${long ? 'dưới' : 'trên'} **${pct(finite(long ? event.lowerWickShare : event.upperWickShare) == null ? null : finite(long ? event.lowerWickShare : event.upperWickShare) * 100)}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: `🧱 ${long ? 'Đáy' : 'Đỉnh'} sideway`,
          value: [
            `${fmt(event.baseBars, 0)} nến ${event.htfInterval} · ${baseStructure}`,
            `${long ? 'Đáy' : 'Đỉnh'} **${fmt(long ? event.baseLow : event.baseHigh, 8)}** · đường cổ **${fmt(event.baseNeckline, 8)}**`,
            `Biên/nhịp ${long ? 'sập' : 'bơm'} **${pct(finite(event.baseRangeShockFraction) == null ? null : finite(event.baseRangeShockFraction) * 100)}** · volume nền/spike **${pct(finite(event.baseMedianVolumeRatio) == null ? null : finite(event.baseMedianVolumeRatio) * 100)}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: `✅ Xác nhận ${confirmationInterval}${confirmationInterval === '5m' ? ' sớm' : ''} · ${stageText}`,
          value: confirmationLines.join('\n'),
          inline: false,
        },
        {
          name: '⚠️ Mốc vô hiệu tham khảo',
          value: ready
            ? `${long ? 'Đáy cú sập' : 'Đỉnh cú bơm'} **${fmt(long ? event.eventLow : event.eventHigh, 8)}** · ${long ? 'đáy' : 'đỉnh'} nền **${fmt(long ? event.baseLow : event.baseHigh, 8)}**. Lệnh dùng TP +15% ROE, SL -30% ROE tính từ giá fill.`
            : `${long ? 'Đáy cú sập' : 'Đỉnh cú bơm'} **${fmt(long ? event.eventLow : event.eventHigh, 8)}** · ${long ? 'đáy' : 'đỉnh'} nền **${fmt(long ? event.baseLow : event.baseHigh, 8)}**. WATCH chỉ quan sát, chưa tạo entry/size/SL/TP.`,
          inline: false,
        },
      ].map((field) => ({ ...field, value: field.value.slice(0, 1024) })),
      footer: {
        text: `${HTF_DEEP_DUMP_BASE_15M_DISCORD_VERSION} | ${HTF_DEEP_DUMP_BASE_RECLAIM_VERSION} | closed candles only`,
      },
      timestamp: new Date(finite(event.candleCloseAt, Date.now())).toISOString(),
    }],
  };
}
