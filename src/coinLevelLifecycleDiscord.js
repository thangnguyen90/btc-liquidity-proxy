import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const COIN_LEVEL_LIFECYCLE_DISCORD_VERSION = 'COIN_LEVEL_LIFECYCLE_DISCORD_V5_ONE_SIDED_REJECT_APPROACH_20260902';
export const COIN_LEVEL_LIFECYCLE_DISCORD_DEDUPE_MS = 4 * 60 * 60_000;

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function number(value, digits = 8) {
  const parsed = finite(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString('en-US', { maximumFractionDigits: digits })
    : '—';
}

function zoneKey(zone = {}) {
  return [zone.range, Number(zone.bandLow).toPrecision(8), Number(zone.bandHigh).toPrecision(8)].join(':');
}

function nearest(zones = []) {
  return [...zones].sort((left, right) => (
    Math.abs(finite(left.distancePct, Infinity)) - Math.abs(finite(right.distancePct, Infinity))
  ))[0] ?? null;
}

function collectDirection(analysis, {
  side,
  rejectedSide,
  approachingSide,
  confirmationKey,
  eventType,
}) {
  const matches = [];
  for (const frame of analysis?.coinglass?.frames ?? []) {
    const rejectedPool = rejectedSide === 'ABOVE' ? frame.above : frame.below;
    const approachingPool = approachingSide === 'ABOVE' ? frame.above : frame.below;
    const rejected = (rejectedPool ?? []).filter((zone) => zone.lifecycle === 'REJECTED');
    const targets = (approachingPool ?? []).filter((zone) => (
      zone.lifecycle === 'APPROACHING' || zone.lifecycle === 'FRESH'
    ));
    if (rejected.length && targets.length) {
      matches.push({ range: frame.range, rejected, targets });
    }
  }
  if (!matches.length) return null;
  const rejected = nearest(matches.flatMap((match) => match.rejected));
  const targets = matches.flatMap((match) => match.targets);
  const approachingTargets = targets.filter((zone) => zone.lifecycle === 'APPROACHING');
  const approaching = nearest(approachingTargets.length ? approachingTargets : targets);
  if (!rejected || !approaching) return null;
  const targetLifecycle = approaching.lifecycle === 'FRESH' ? 'FRESH' : 'APPROACHING';
  const resolvedEventType = targetLifecycle === 'FRESH'
    ? eventType.replace(/_APPROACHING$/, '_FRESH')
    : eventType;
  const ranges = [...new Set(matches.map((match) => match.range))];
  const confirmation = analysis?.recommendation?.confirmation?.[confirmationKey] ?? 'WAITING';
  return {
    version: COIN_LEVEL_LIFECYCLE_DISCORD_VERSION,
    eventType: resolvedEventType,
    observeOnly: true,
    symbol: analysis.symbol,
    side,
    rejectedSide,
    approachingSide,
    ranges,
    rejected,
    approaching,
    targetLifecycle,
    markPrice: finite(analysis?.market?.markPrice),
    binanceBias: String(analysis?.trend?.bias ?? 'NEUTRAL'),
    liquidityBias: String(analysis?.coinglass?.combined?.liquidityBias ?? 'BALANCED'),
    confirmation,
    generatedAt: analysis?.generatedAt ?? new Date().toISOString(),
    dedupeKey: [analysis.symbol, resolvedEventType].join('|'),
  };
}

function collectOneSidedLifecycleEvents(analysis, coveredZoneKeys = new Set()) {
  const grouped = new Map();
  for (const frame of analysis?.coinglass?.frames ?? []) {
    for (const side of ['ABOVE', 'BELOW']) {
      const pool = side === 'ABOVE' ? frame.above : frame.below;
      for (const zone of pool ?? []) {
        const lifecycle = String(zone?.lifecycle ?? '').toUpperCase();
        if (!['REJECTED', 'APPROACHING'].includes(lifecycle)) continue;
        if (coveredZoneKeys.has(zoneKey(zone))) continue;
        const key = `${side}:${lifecycle}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(zone);
      }
    }
  }
  return [...grouped.entries()].map(([key, zones]) => {
    const [zoneSide, lifecycle] = key.split(':');
    const selected = nearest(zones);
    const ranges = [...new Set(zones.map((zone) => zone.range).filter(Boolean))];
    const side = lifecycle === 'REJECTED'
      ? (zoneSide === 'ABOVE' ? 'SHORT' : 'LONG')
      : (zoneSide === 'ABOVE' ? 'LONG' : 'SHORT');
    const confirmationKey = side === 'LONG' ? 'breakout' : 'breakdown';
    const eventType = `${zoneSide}_${lifecycle}_ONE_SIDED`;
    return {
      version: COIN_LEVEL_LIFECYCLE_DISCORD_VERSION,
      eventType,
      observeOnly: true,
      oneSided: true,
      symbol: analysis.symbol,
      side,
      zoneSide,
      lifecycle,
      zone: selected,
      ranges,
      markPrice: finite(analysis?.market?.markPrice),
      binanceBias: String(analysis?.trend?.bias ?? 'NEUTRAL'),
      liquidityBias: String(analysis?.coinglass?.combined?.liquidityBias ?? 'BALANCED'),
      confirmation: analysis?.recommendation?.confirmation?.[confirmationKey] ?? 'WAITING',
      generatedAt: analysis?.generatedAt ?? new Date().toISOString(),
      dedupeKey: [analysis.symbol, eventType].join('|'),
    };
  });
}

function collectSecondRejectionShort(analysis) {
  const setup = analysis?.recommendation?.secondRejectionShort;
  if (!setup?.ready || setup?.state !== 'READY') return null;
  return {
    version: COIN_LEVEL_LIFECYCLE_DISCORD_VERSION,
    eventType: 'COIN_LEVEL_SECOND_REJECTION_ALIGNED_SHORT',
    observeOnly: true,
    symbol: analysis.symbol,
    side: 'SHORT',
    ranges: [setup?.targetZone?.range].filter(Boolean),
    markPrice: finite(analysis?.market?.markPrice),
    binanceBias: String(analysis?.trend?.bias ?? 'NEUTRAL'),
    liquidityBias: String(analysis?.coinglass?.combined?.liquidityBias ?? 'BALANCED'),
    confirmation: 'SECOND_REJECTION_15M_CONFIRMED',
    setup,
    generatedAt: analysis?.generatedAt ?? new Date().toISOString(),
    dedupeKey: [
      analysis.symbol,
      'SECOND_REJECTION_SHORT',
      finite(setup?.secondReject?.openTime, 0),
      Number(setup?.targetZone?.bandHigh ?? 0).toPrecision(8),
    ].join('|'),
  };
}

function collectSecondRejectionLong(analysis) {
  const setup = analysis?.recommendation?.secondRejectionLong;
  if (!setup?.ready || setup?.state !== 'READY') return null;
  return {
    version: COIN_LEVEL_LIFECYCLE_DISCORD_VERSION,
    eventType: 'COIN_LEVEL_SECOND_REJECTION_ALIGNED_LONG',
    observeOnly: true,
    symbol: analysis.symbol,
    side: 'LONG',
    ranges: [setup?.targetZone?.range].filter(Boolean),
    markPrice: finite(analysis?.market?.markPrice),
    binanceBias: String(analysis?.trend?.bias ?? 'NEUTRAL'),
    liquidityBias: String(analysis?.coinglass?.combined?.liquidityBias ?? 'BALANCED'),
    confirmation: 'SECOND_SUPPORT_REJECTION_15M_CONFIRMED',
    setup,
    generatedAt: analysis?.generatedAt ?? new Date().toISOString(),
    dedupeKey: [
      analysis.symbol,
      'SECOND_REJECTION_LONG',
      finite(setup?.secondReject?.openTime, 0),
      Number(setup?.targetZone?.bandLow ?? 0).toPrecision(8),
    ].join('|'),
  };
}

export function detectCoinLevelRejectApproachEvents(analysis = {}) {
  if (!analysis?.coinglass?.available
    || analysis?.coinglass?.stale
    || analysis?.freshness?.binance === 'STALE_LAST_GOOD') return [];
  const paired = [
    collectDirection(analysis, {
      side: 'SHORT',
      rejectedSide: 'ABOVE',
      approachingSide: 'BELOW',
      confirmationKey: 'breakdown',
      eventType: 'UPPER_REJECTED_LOWER_APPROACHING',
    }),
    collectDirection(analysis, {
      side: 'LONG',
      rejectedSide: 'BELOW',
      approachingSide: 'ABOVE',
      confirmationKey: 'breakout',
      eventType: 'LOWER_REJECTED_UPPER_APPROACHING',
    }),
  ].filter(Boolean);
  const coveredZoneKeys = new Set(paired.flatMap((event) => [
    zoneKey(event.rejected),
    zoneKey(event.approaching),
  ]));
  return [
    ...paired,
    ...collectOneSidedLifecycleEvents(analysis, coveredZoneKeys),
    collectSecondRejectionShort(analysis),
    collectSecondRejectionLong(analysis),
  ].filter(Boolean);
}

function zoneText(zone) {
  return [
    `**${number(zone?.bandLow)} – ${number(zone?.bandHigh)}**`,
    `Cách mark **${number(zone?.distancePct, 2)}%** · lực **${number(zone?.strength, 0)}**`,
    `Lifecycle **${zone?.lifecycle ?? '—'}** · hút hiệu dụng **${number(zone?.effectiveAttractionScore, 2)}**`,
  ].join('\n');
}

export function buildCoinLevelRejectApproachDiscordPayload(event) {
  const short = event.side === 'SHORT';
  const coin = String(event.symbol ?? '').replace(/USDT$/, '');
  const coinglassUrl = `https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3?coin=${encodeURIComponent(coin)}`;
  const binanceUrl = `https://www.binance.com/en/futures/${encodeURIComponent(event.symbol)}`;
  const secondRejectionShort = event.eventType === 'COIN_LEVEL_SECOND_REJECTION_ALIGNED_SHORT';
  const secondRejectionLong = event.eventType === 'COIN_LEVEL_SECOND_REJECTION_ALIGNED_LONG';
  if (secondRejectionShort || secondRejectionLong) {
    const setup = event.setup ?? {};
    const isLong = secondRejectionLong;
    const firstLevel = isLong ? setup.firstReject?.low : setup.firstReject?.high;
    const secondLevel = isLong ? setup.secondReject?.low : setup.secondReject?.high;
    const wickRatio = isLong
      ? setup.secondReject?.lowerWickRangeRatio
      : setup.secondReject?.upperWickRangeRatio;
    return {
      username: 'Coin Level Lifecycle',
      embeds: [{
        title: `${isLong ? '🟢 REJECT ĐÁY LẦN 2' : '🔴 REJECT LẦN 2'} · ${event.symbol} · ${event.side} READY`,
        url: coinglassUrl,
        description: [
          '**TÍN HIỆU ĐÁNH GIÁ — OBSERVE ONLY, KHÔNG TỰ VÀO BINANCE**',
          isLong
            ? 'Hai lần từ chối cùng vùng dưới đã hoàn tất bằng nến 15m đóng; lần hai có lực mua xác nhận.'
            : 'Hai lần từ chối cùng vùng trên đã hoàn tất bằng nến 15m đóng; lần hai có lực bán xác nhận.',
          isLong
            ? 'CoinGlass đang **ALIGNED_LONG** và còn active target phía trên. Chỉ cân nhắc LONG khi giá chưa chạy quá xa entry tham khảo.'
            : 'CoinGlass đang **ALIGNED_SHORT** và còn active target phía dưới. Chỉ cân nhắc SHORT khi giá chưa chạy quá xa entry tham khảo.',
        ].join('\n'),
        color: isLong ? 0x10b981 : 0xdc2626,
        fields: [
          {
            name: 'ENTRY / TP / VÔ HIỆU',
            value: [
              `Entry tham khảo **${number(setup.entryPrice)}**`,
              `TP1 **${number(setup.takeProfitPrice)}**${setup.takeProfit2Price ? ` · TP2 **${number(setup.takeProfit2Price)}**` : ''}`,
              `Vô hiệu **${number(setup.invalidationPrice)}**`,
              `Reward **${number(setup.rewardPct, 2)}%** · Risk **${number(setup.riskPct, 2)}%** · R:R **${number(setup.rewardRiskRatio, 2)}**`,
            ].join('\n'),
            inline: false,
          },
          {
            name: 'REJECT #1',
            value: `${isLong ? 'Low' : 'High'} **${number(firstLevel)}**\n${new Date(finite(setup.firstReject?.openTime, 0)).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok' })}`,
            inline: true,
          },
          {
            name: 'REJECT #2 · 15M CONFIRMED',
            value: `${isLong ? 'Low' : 'High'} **${number(secondLevel)}** · close **${number(setup.secondReject?.close)}**\nRâu ${isLong ? 'dưới' : 'trên'} **${number(finite(wickRatio, 0) * 100, 1)}%** · xác nhận sau **${number(setup.confirmationCandle?.barsAfterSecondReject, 0)} bar** · taker buy **${number(setup.confirmationCandle?.takerBuyPct, 1)}%**`,
            inline: true,
          },
          {
            name: `COINGLASS TARGET ${isLong ? 'TRÊN' : 'DƯỚI'}`,
            value: zoneText(setup.targetZone),
            inline: false,
          },
          { name: 'MỞ NHANH', value: `[CoinGlass](${coinglassUrl}) · [Binance](${binanceUrl})`, inline: false },
        ],
        timestamp: new Date(event.generatedAt).toISOString(),
        footer: { text: COIN_LEVEL_LIFECYCLE_DISCORD_VERSION },
      }],
    };
  }
  if (event.oneSided) {
    const rejected = event.lifecycle === 'REJECTED';
    const lifecycleNote = rejected
      ? 'Vùng đã bị quét rồi từ chối giá. Đây mới là phản ứng một phía; chưa có target đối diện để xác nhận setup hoàn chỉnh.'
      : 'Giá đang tiến gần vùng thanh lý. APPROACHING chỉ là cảnh báo khoảng cách, chưa xác nhận vùng sẽ bị quét hoặc giá sẽ đảo chiều.';
    return {
      username: 'Coin Level Lifecycle',
      embeds: [{
        title: `${rejected ? '🟠' : '🟡'} ${event.lifecycle} MỘT PHÍA · ${event.symbol} · ${event.side} WATCH`,
        url: coinglassUrl,
        description: [
          '**CẢNH BÁO MỘT PHÍA — OBSERVE ONLY, KHÔNG TỰ VÀO BINANCE**',
          lifecycleNote,
          `Hướng **${event.side} WATCH** chỉ là hướng tham khảo theo vị trí vùng; chỉ cân nhắc khi nến 15m xác nhận. Trạng thái hiện tại: **${event.confirmation}**.`,
        ].join('\n'),
        color: rejected ? 0xf97316 : 0xeab308,
        fields: [
          { name: 'GIÁ / BIAS', value: `Mark **${number(event.markPrice)}**\nBinance **${event.binanceBias}** · CoinGlass **${event.liquidityBias}**`, inline: false },
          { name: `${event.zoneSide} · ${event.lifecycle}`, value: zoneText(event.zone), inline: false },
          { name: 'KHUNG PHÁT HIỆN', value: `**${event.ranges.join(' + ')}**`, inline: false },
          { name: 'GHI CHÚ', value: rejected
            ? 'REJECTED một phía đã đủ điều kiện gửi cảnh báo, nhưng không đồng nghĩa lệnh vào ngay.'
            : 'APPROACHING một phía đã đủ điều kiện gửi cảnh báo sớm, nhưng có thể đổi trạng thái hoặc bị rút vùng.', inline: false },
          { name: 'MỞ NHANH', value: `[CoinGlass](${coinglassUrl}) · [Binance](${binanceUrl})`, inline: false },
        ],
        timestamp: new Date(event.generatedAt).toISOString(),
        footer: { text: COIN_LEVEL_LIFECYCLE_DISCORD_VERSION },
      }],
    };
  }
  const targetLifecycle = event.targetLifecycle ?? event.approaching?.lifecycle ?? 'APPROACHING';
  const targetIsFresh = targetLifecycle === 'FRESH';
  return {
    username: 'Coin Level Lifecycle',
    embeds: [{
      title: `${short ? '🔴' : '🟢'} REJECTED → ${targetLifecycle} · ${event.symbol} · ${event.side} WATCH`,
      url: coinglassUrl,
      description: [
        '**CẢNH BÁO ĐÁNH GIÁ — OBSERVE ONLY, KHÔNG TỰ VÀO BINANCE**',
        short
          ? targetIsFresh
            ? 'Cụm phía trên đã bị quét và reject; cụm thanh lý phía dưới vẫn FRESH và là target tham khảo.'
            : 'Cụm phía trên đã bị quét và reject; giá đang tiến gần cụm thanh lý phía dưới.'
          : targetIsFresh
            ? 'Cụm phía dưới đã bị quét và reject; cụm thanh lý phía trên vẫn FRESH và là target tham khảo.'
            : 'Cụm phía dưới đã bị quét và reject; giá đang tiến gần cụm thanh lý phía trên.',
        `Chỉ xem xét **${event.side}** khi nến 15m xác nhận; trạng thái hiện tại: **${event.confirmation}**.`,
      ].join('\n'),
      color: short ? 0xef4444 : 0x10b981,
      fields: [
        { name: 'GIÁ / BIAS', value: `Mark **${number(event.markPrice)}**\nBinance **${event.binanceBias}** · CoinGlass **${event.liquidityBias}**`, inline: false },
        { name: `${event.rejectedSide} · REJECTED`, value: zoneText(event.rejected), inline: true },
        { name: `${event.approachingSide} · ${targetLifecycle}`, value: zoneText(event.approaching), inline: true },
        { name: 'KHUNG KHỚP', value: `**${event.ranges.join(' + ')}**`, inline: false },
        { name: 'MỞ NHANH', value: `[CoinGlass](${coinglassUrl}) · [Binance](${binanceUrl})`, inline: false },
      ],
      timestamp: new Date(event.generatedAt).toISOString(),
      footer: { text: COIN_LEVEL_LIFECYCLE_DISCORD_VERSION },
    }],
  };
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(path, payload) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

export class CoinLevelLifecycleDiscordNotifier {
  constructor({ stateFile, webhookUrl = () => '', now = () => Date.now(), fetchImpl = fetch } = {}) {
    this.stateFile = stateFile;
    this.webhookUrl = webhookUrl;
    this.now = now;
    this.fetchImpl = fetchImpl;
    this.queue = Promise.resolve();
  }

  notify(analysis) {
    this.queue = this.queue
      .catch(() => {})
      .then(() => this.process(analysis));
    return this.queue;
  }

  async process(analysis) {
    const events = detectCoinLevelRejectApproachEvents(analysis);
    const webhookUrl = String(typeof this.webhookUrl === 'function' ? this.webhookUrl() : this.webhookUrl).trim();
    if (!events.length) return { evaluated: true, sent: 0, reason: 'no_match' };
    if (!webhookUrl) return { evaluated: true, sent: 0, reason: 'webhook_not_configured' };
    const now = this.now();
    const state = await readJson(this.stateFile, {
      version: COIN_LEVEL_LIFECYCLE_DISCORD_VERSION,
      sent: {},
      recent: [],
    });
    const sent = Object.fromEntries(Object.entries(state.sent ?? {})
      .filter(([, timestamp]) => now - finite(timestamp, 0) < 24 * 60 * 60_000));
    let sentCount = 0;
    for (const event of events) {
      if (now - finite(sent[event.dedupeKey], 0) < COIN_LEVEL_LIFECYCLE_DISCORD_DEDUPE_MS) continue;
      const send = () => this.fetchImpl(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildCoinLevelRejectApproachDiscordPayload(event)),
      });
      let response = await send();
      if (response.status === 429) {
        const rateLimit = await response.json().catch(() => ({}));
        const retryMs = Math.max(500, Math.min(5_000, finite(rateLimit?.retry_after, 1) * 1_000));
        await new Promise((resolve) => setTimeout(resolve, retryMs));
        response = await send();
      }
      if (!response.ok) throw new Error(`Discord webhook HTTP ${response.status}`);
      sent[event.dedupeKey] = now;
      state.recent = [{
        symbol: event.symbol,
        eventType: event.eventType,
        side: event.side,
        ranges: event.ranges,
        sentAt: now,
      }, ...(state.recent ?? [])].slice(0, 50);
      sentCount += 1;
    }
    state.version = COIN_LEVEL_LIFECYCLE_DISCORD_VERSION;
    state.updatedAt = new Date(now).toISOString();
    state.sent = sent;
    await writeJsonAtomic(this.stateFile, state);
    return { evaluated: true, sent: sentCount, reason: sentCount ? 'sent' : 'deduped' };
  }
}
