import { dirname } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { normalizeLiqScanSweepAlert } from './localAiLiquiditySweepRejectDiscord.js';

export const LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_VERSION =
  'LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_V6_UPPER_LONG_LOWER_SHORT_20261003';

const TRACK_MS = 6 * 60 * 60_000;
const RETAIN_MS = 7 * 24 * 60 * 60_000;
const CLOSED_CANDLE_INTERVALS = Object.freeze({
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
});

const breakoutTradeSide = direction => String(direction ?? '').toUpperCase() === 'ABOVE'
  ? 'LONG' : String(direction ?? '').toUpperCase() === 'BELOW' ? 'SHORT' : '';

const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function validWebhook(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return url.protocol === 'https:'
      && ['discord.com', 'discordapp.com'].includes(url.hostname.toLowerCase())
      && /^\/api\/webhooks\/[^/]+\/[^/]+\/?$/.test(url.pathname)
      ? url.toString() : '';
  } catch {
    return '';
  }
}

function validBaseUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return ['http:', 'https:'].includes(url.protocol)
      ? url.toString().replace(/\/$/, '') : 'http://127.0.0.1:19082';
  } catch {
    return 'http://127.0.0.1:19082';
  }
}

function fmt(value) {
  const parsed = finite(value);
  return parsed == null ? '—' : parsed.toLocaleString('en-US', {
    maximumSignificantDigits: 10,
    maximumFractionDigits: parsed >= 100 ? 2 : parsed >= 1 ? 5 : 8,
  });
}

function usd(value) {
  const parsed = finite(value);
  if (parsed == null) return '—';
  return `${new Intl.NumberFormat('en-US', {
    notation: parsed >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 2,
  }).format(parsed)} USDT`;
}

function validClosedBar(bar, now) {
  return bar && finite(bar.openTime) != null && finite(bar.closeTime) != null
    && bar.closeTime < now
    && [bar.open, bar.high, bar.low, bar.close].every(value => finite(value) > 0)
    && bar.high >= Math.max(bar.open, bar.close)
    && bar.low <= Math.min(bar.open, bar.close);
}

export function detectLiquidityZoneBreakout({
  track,
  candles,
  candles5m,
  interval = '5m',
  now = Date.now(),
} = {}) {
  if (!track || now - finite(track.alertAt, now) > TRACK_MS) return null;
  const normalizedInterval = Object.hasOwn(CLOSED_CANDLE_INTERVALS, interval) ? interval : '5m';
  const intervalMs = CLOSED_CANDLE_INTERVALS[normalizedInterval];
  const source = Array.isArray(candles) ? candles
    : normalizedInterval === '5m' && Array.isArray(candles5m) ? candles5m : [];
  const bars = source
    .filter(bar => validClosedBar(bar, now) && bar.openTime >= track.alertAt)
    .sort((left, right) => left.openTime - right.openTime);
  if (!bars.length || now - bars.at(-1).closeTime > intervalMs + 60_000) return null;
  if (bars.some((bar, index) => index > 0 && bar.openTime - bars[index - 1].openTime !== intervalMs)) return null;
  const zoneLow = finite(track.zone?.low);
  const zoneHigh = finite(track.zone?.high);
  if (!(zoneLow > 0) || !(zoneHigh > 0)) return null;

  const direction = String(track.direction ?? '').toUpperCase();
  const latest = bars.at(-1);
  const beyondNow = direction === 'ABOVE' ? latest.close > zoneHigh
    : direction === 'BELOW' ? latest.close < zoneLow : false;
  if (!beyondNow) return null;
  const breach = direction === 'ABOVE'
    ? bars.find(bar => bar.close > zoneHigh && (bar.open <= zoneHigh || bar.low <= zoneHigh))
    : bars.find(bar => bar.close < zoneLow && (bar.open >= zoneLow || bar.high >= zoneLow));
  if (!breach) return null;
  return {
    symbol: track.symbol,
    interval: normalizedInterval,
    direction,
    side: breakoutTradeSide(direction),
    state: direction === 'ABOVE' ? 'CLOSED_ABOVE_UPPER_ZONE' : 'CLOSED_BELOW_LOWER_ZONE',
    alertAt: track.alertAt,
    breachAt: breach.closeTime,
    breachClose: breach.close,
    latestClosedAt: latest.closeTime,
    latestClose: latest.close,
    zone: track.zone,
    dominantPct: finite(track.dominantPct),
    imbalanceScore: finite(track.imbalanceScore),
  };
}

export function assessLiquidityBreakoutOppositeDepth({ breakout, analysis } = {}) {
  if (!breakout || !analysis || analysis.freshness?.stale === true) return null;
  const symbol = String(breakout.symbol ?? '').toUpperCase();
  if (!symbol || symbol !== String(analysis.symbol ?? '').toUpperCase()) return null;
  const bidNotional = finite(analysis.orderBookProfile?.totals?.bidNotional);
  const askNotional = finite(analysis.orderBookProfile?.totals?.askNotional);
  if (!(bidNotional > 0) || !(askNotional > 0)) return null;
  const upper = breakout.direction === 'ABOVE';
  const oppositeNotional = upper ? bidNotional : askNotional;
  const sameSideNotional = upper ? askNotional : bidNotional;
  if (!(oppositeNotional > sameSideNotional)) return null;
  const ratio = oppositeNotional / sameSideNotional;
  const coverage = analysis.orderBookProfile?.coverage ?? {};
  const interval = breakout.interval === '15m' ? '15m' : '5m';
  // Keep the original 5m keys unchanged so V1 sent/cooldown JSON remains authoritative.
  const eventId = interval === '5m'
    ? [symbol, breakout.direction, 'BREAKOUT_OPPOSITE_DEPTH', breakout.alertAt, breakout.breachAt].join('|')
    : [symbol, breakout.direction, interval, 'BREAKOUT_OPPOSITE_DEPTH', breakout.alertAt, breakout.breachAt].join('|');
  const routeKey = interval === '5m'
    ? [symbol, breakout.direction, 'BREAKOUT_OPPOSITE_DEPTH'].join('|')
    : [symbol, breakout.direction, interval, 'BREAKOUT_OPPOSITE_DEPTH'].join('|');
  return {
    ...breakout,
    version: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_VERSION,
    observeOnly: false,
    binanceEligible: true,
    binanceRequiresExplicitRoute: true,
    markPrice: finite(analysis.market?.markPrice),
    depth: {
      source: analysis.orderBookProfile?.source ?? 'BINANCE_FUTURES_DEPTH',
      bidNotional,
      askNotional,
      oppositeSide: upper ? 'BID_BELOW' : 'ASK_ABOVE',
      oppositeNotional,
      sameSideNotional,
      oppositeRatio: Number(ratio.toFixed(3)),
      bidCoveragePct: finite(coverage.bid?.farthestDistancePct),
      askCoveragePct: finite(coverage.ask?.farthestDistancePct),
      range: 'NEAR_0_3_PLUS_WIDE_3_20_VISIBLE_DEPTH',
    },
    analysisGeneratedAt: analysis.generatedAt ?? null,
    interval,
    eventId,
    routeKey,
  };
}

export function buildLiquidityBreakoutOppositeDepthDiscordPayload(event = {}, baseUrl) {
  const upper = event.direction === 'ABOVE';
  const root = validBaseUrl(baseUrl);
  const zoneLabel = upper ? 'TRÊN' : 'DƯỚI';
  const intervalLabel = event.interval === '15m' ? '15M' : '5M';
  const oppositeLabel = upper ? 'BID BÊN DƯỚI' : 'ASK BÊN TRÊN';
  const sameLabel = upper ? 'ASK BÊN TRÊN' : 'BID BÊN DƯỚI';
  const execution = event.binanceExecution ?? null;
  const submitted = ['submitted', 'filled', 'new'].includes(String(execution?.status ?? '').toLowerCase());
  return {
    username: 'AI Local · Vượt vùng + Opposite Depth',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${upper ? '🔴' : '🟢'} GIÁ VƯỢT VÙNG ${zoneLabel} · ${intervalLabel} · ${oppositeLabel} LỚN HƠN · ${event.symbol}`,
      color: upper ? 0xf43f5e : 0x16c784,
      description: `**NẾN ${intervalLabel} ĐÃ ĐÓNG.** Giá đã ${upper ? 'đóng trên toàn bộ vùng thanh khoản trên' : 'đóng dưới toàn bộ vùng thanh khoản dưới'} và tổng thanh khoản phía ngược lại đang lớn hơn.${submitted ? ' Binance đã nhận lệnh MARKET theo route đã bật.' : ' Binance chỉ vào khi Auto Controls của route đang ON và toàn bộ guard đều đạt.'}`,
      fields: [
        {
          name: `VÙNG THANH KHOẢN ${zoneLabel} ĐÃ VƯỢT`,
          value: `**${fmt(event.zone?.low)} – ${fmt(event.zone?.high)}**\nClose vượt vùng **${fmt(event.breachClose)}** · close mới nhất **${fmt(event.latestClose)}** · MARK ${fmt(event.markPrice)}`,
          inline: false,
        },
        {
          name: 'TỔNG BÊN · BINANCE FUTURES DEPTH',
          value: `**${oppositeLabel}: ${usd(event.depth?.oppositeNotional)}**\n${sameLabel}: ${usd(event.depth?.sameSideNotional)}\nTỷ lệ phía ngược **${fmt(event.depth?.oppositeRatio)}x** · coverage BID/ASK ${fmt(event.depth?.bidCoveragePct)}% / ${fmt(event.depth?.askCoveragePct)}%`,
          inline: false,
        },
        {
          name: 'Ý NGHĨA',
          value: upper
            ? 'Giá đã chạy lên vượt vùng trên và tổng BID bên dưới lớn hơn ASK phía trên: **LONG theo hướng breakout** theo rule đã chọn.'
            : 'Giá đã chạy xuống xuyên vùng dưới và tổng ASK bên trên lớn hơn BID phía dưới: **SHORT theo hướng breakdown** theo rule đã chọn.',
          inline: false,
        },
        {
          name: 'BINANCE MARKET 4 USDT × 5X',
          value: submitted
            ? `**ĐÃ GỬI ${event.side}** · order ${execution.orderId ?? '—'}\n${execution.protectionSuppressedBySymbol ? 'TP/SL bị bỏ qua theo protection exclusion của coin' : `TP +10% ROE ${fmt(execution.takeProfitPrice)} · ${execution.stopLossSuppressed ? 'SHORT TP-ONLY theo policy chung' : `SL -20% ROE ${fmt(execution.stopLossPrice)}`}`}`
            : `**KHÔNG VÀO** · ${String(execution?.status ?? 'ROUTE_OFF').toUpperCase()}${execution?.error ? `\n${String(execution.error).slice(0, 220)}` : ''}`,
          inline: false,
        },
        {
          name: 'MỞ MÀN HÌNH',
          value: `[AI Local](${root}/local-ai-trend-evaluation) · [Coin Level](${root}/coin-level-analysis?symbol=${encodeURIComponent(event.symbol)}) · [Binance](https://www.binance.com/vi/futures/${encodeURIComponent(event.symbol)})`,
          inline: false,
        },
      ],
      footer: {
        text: `${LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_VERSION} · MARKET chỉ qua route opt-in · depth có thể bị rút`,
      },
      timestamp: new Date(finite(event.latestClosedAt, Date.now())).toISOString(),
    }],
  };
}

function freshState(now) {
  return {
    version: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_VERSION,
    initializedAt: now,
    updatedAt: now,
    tracks: {},
    sent: {},
    lastByRoute: {},
    recent: [],
    browserNotifications: [],
  };
}

async function writeJsonAtomic(path, payload) {
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

function sameZone(left, right) {
  const aLow = finite(left?.low); const aHigh = finite(left?.high);
  const bLow = finite(right?.low); const bHigh = finite(right?.high);
  if (!(aLow > 0) || !(aHigh > 0) || !(bLow > 0) || !(bHigh > 0)) return false;
  return Math.max(aLow, bLow) <= Math.min(aHigh, bHigh);
}

async function mapInBatches(items, batchSize, mapper) {
  const output = [];
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    output.push(...await Promise.all(batch.map(mapper)));
  }
  return output;
}

function eventPriority(event = {}) {
  return {
    ratio: finite(event.depth?.oppositeRatio, 0),
    coverage: Math.min(
      finite(event.depth?.bidCoveragePct, 0),
      finite(event.depth?.askCoveragePct, 0),
    ),
    notional: finite(event.depth?.oppositeNotional, 0),
  };
}

function compareEventPriority(left, right) {
  const a = eventPriority(left);
  const b = eventPriority(right);
  return b.ratio - a.ratio
    || b.coverage - a.coverage
    || b.notional - a.notional
    || finite(left?.breachAt, 0) - finite(right?.breachAt, 0);
}

export class LocalAiLiquidityBreakoutOppositeDepthDiscordNotifier {
  constructor({
    stateFile,
    enabled = false,
    webhookUrl,
    baseUrl,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    cooldownMs = 4 * 60 * 60_000,
    maxPerScan = 5,
    analysisBatchSize = 5,
    onQualified,
  } = {}) {
    this.stateFile = stateFile;
    this.enabledFlag = typeof enabled === 'function' ? enabled : () => enabled;
    this.webhookUrl = typeof webhookUrl === 'function' ? webhookUrl : () => webhookUrl;
    this.baseUrl = typeof baseUrl === 'function' ? baseUrl : () => baseUrl;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.cooldownMs = Math.max(60_000, finite(cooldownMs, 4 * 60 * 60_000));
    this.maxPerScan = Math.max(1, Math.min(10, Math.trunc(finite(maxPerScan, 5))));
    this.analysisBatchSize = Math.max(1, Math.min(10,
      Math.trunc(finite(analysisBatchSize, 5))));
    this.onQualified = onQualified;
    this.state = null;
    this.lastScan = null;
    this.queue = Promise.resolve();
  }

  enabled() { return this.enabledFlag?.() === true; }
  configured() { return this.enabled() && Boolean(validWebhook(this.webhookUrl?.())); }

  snapshot() {
    return {
      version: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_VERSION,
      enabled: this.enabled(),
      configured: this.configured(),
      observeOnly: false,
      binanceEligible: true,
      binanceRequiresExplicitRoute: true,
      analysisBatchSize: this.analysisBatchSize,
      maxDeliveriesPerScan: this.maxPerScan,
      tracked: Object.keys(this.state?.tracks ?? {}).length,
      updatedAt: this.state?.updatedAt ?? null,
      lastScan: this.lastScan,
    };
  }

  async managementSnapshot({ recentLimit = 50 } = {}) {
    const state = await this.load();
    const now = this.now();
    const tracks = Object.entries(state.tracks ?? {}).map(([key, track]) => {
      const completedIntervals = track?.completedIntervals ?? {};
      const pendingIntervals = Object.keys(CLOSED_CANDLE_INTERVALS)
        .filter((interval) => !completedIntervals[interval]);
      const lastSeenAt = finite(track?.lastSeenAt, track?.alertAt);
      return {
        key,
        symbol: track?.symbol ?? '',
        direction: track?.direction ?? '',
        side: breakoutTradeSide(track?.direction),
        zone: track?.zone ?? null,
        markPriceAtAlert: finite(track?.markPriceAtAlert),
        dominantPct: finite(track?.dominantPct),
        imbalanceScore: finite(track?.imbalanceScore),
        alertAt: finite(track?.alertAt),
        lastSeenAt,
        expiresAt: lastSeenAt == null ? null : lastSeenAt + TRACK_MS,
        completedIntervals,
        pendingIntervals,
      };
    }).sort((left, right) => finite(right.lastSeenAt, 0) - finite(left.lastSeenAt, 0));
    const recent = [...(state.recent ?? [])]
      .sort((left, right) => finite(right?.sentAt, 0) - finite(left?.sentAt, 0))
      .slice(0, Math.max(1, Math.min(200, Math.trunc(finite(recentLimit, 50)))))
      .map((event) => ({ ...event }));
    const browserNotifications = [...(state.browserNotifications ?? [])]
      .sort((left, right) => finite(right?.notifiedAt, 0) - finite(left?.notifiedAt, 0))
      .slice(0, Math.max(1, Math.min(200, Math.trunc(finite(recentLimit, 50)))))
      .map((event) => ({ ...event }));
    return {
      ...this.snapshot(),
      generatedAt: now,
      trackRetentionMs: TRACK_MS,
      trackedSymbols: new Set(tracks.map((track) => track.symbol)).size,
      pending5m: tracks.filter((track) => track.pendingIntervals.includes('5m')).length,
      pending15m: tracks.filter((track) => track.pendingIntervals.includes('15m')).length,
      aboveTracks: tracks.filter((track) => track.direction === 'ABOVE').length,
      belowTracks: tracks.filter((track) => track.direction === 'BELOW').length,
      tracks,
      recent,
      browserNotifications,
    };
  }

  async load() {
    if (this.state) return this.state;
    const now = this.now();
    try {
      const parsed = JSON.parse(await readFile(this.stateFile, 'utf8'));
      this.state = {
        ...freshState(now), ...parsed,
        version: LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_VERSION,
        tracks: parsed?.tracks && typeof parsed.tracks === 'object' ? parsed.tracks : {},
        sent: parsed?.sent && typeof parsed.sent === 'object' ? parsed.sent : {},
        lastByRoute: parsed?.lastByRoute && typeof parsed.lastByRoute === 'object' ? parsed.lastByRoute : {},
        recent: Array.isArray(parsed?.recent) ? parsed.recent : [],
        browserNotifications: Array.isArray(parsed?.browserNotifications)
          ? parsed.browserNotifications : [],
      };
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[LocalAiLiqBreakoutDepth] state reset: ${error.message}`);
      this.state = freshState(now);
    }
    return this.state;
  }

  arm(alert = {}) {
    this.queue = this.queue.catch(() => {}).then(async () => {
      if (!this.enabled()) return { armed: false, reason: 'DISABLED' };
      const normalized = normalizeLiqScanSweepAlert(alert);
      if (!normalized) return { armed: false, reason: 'INVALID_ALERT' };
      normalized.side = breakoutTradeSide(normalized.direction);
      const state = await this.load();
      const key = `${normalized.symbol}|${normalized.direction}`;
      const previous = state.tracks[key];
      state.tracks[key] = previous && sameZone(previous.zone, normalized.zone)
        ? {
          ...previous, ...normalized,
          alertAt: Math.min(previous.alertAt, normalized.alertAt),
          lastSeenAt: normalized.lastSeenAt,
        }
        : normalized;
      state.updatedAt = this.now();
      await writeJsonAtomic(this.stateFile, state);
      return { armed: true, key, track: state.tracks[key] };
    });
    return this.queue;
  }

  scan({ getRows, getAnalysis } = {}) {
    this.queue = this.queue.catch(() => {}).then(() => this.#scan({ getRows, getAnalysis }))
      .then((result) => {
        this.lastScan = { ...result, completedAt: this.now() };
        return result;
      });
    return this.queue;
  }

  async #post(payload) {
    if (!this.enabled()) return { sent: false, error: 'DISABLED' };
    const webhookUrl = validWebhook(this.webhookUrl?.());
    if (!webhookUrl) return { sent: false, error: 'WEBHOOK_NOT_CONFIGURED' };
    try {
      const response = await this.fetchImpl(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok ? { sent: true } : { sent: false, error: `HTTP_${response.status}` };
    } catch (error) {
      return { sent: false, error: error?.message ?? 'NETWORK_ERROR' };
    }
  }

  async #scan({ getRows, getAnalysis }) {
    const state = await this.load();
    const now = this.now();
    if (!this.enabled()) {
      if (Object.keys(state.tracks).length) {
        state.tracks = {};
        state.updatedAt = now;
        await writeJsonAtomic(this.stateFile, state);
      }
      return { enabled: false, configured: false, tracked: 0, detected: 0, qualified: 0, sent: 0, errors: [] };
    }
    state.tracks = Object.fromEntries(Object.entries(state.tracks)
      .filter(([, track]) => now - finite(track?.lastSeenAt, track?.alertAt) <= TRACK_MS));
    state.sent = Object.fromEntries(Object.entries(state.sent)
      .filter(([, sentAt]) => now - finite(sentAt, 0) <= RETAIN_MS));
    state.browserNotifications = (state.browserNotifications ?? [])
      .filter((event) => now - finite(event?.notifiedAt, 0) <= RETAIN_MS)
      .slice(0, 100);
    const breakouts = Object.values(state.tracks)
      .flatMap(track => Object.keys(CLOSED_CANDLE_INTERVALS)
        .filter(interval => !track?.completedIntervals?.[interval])
        .map(interval => detectLiquidityZoneBreakout({
          track,
          candles: typeof getRows === 'function' ? getRows(track.symbol, interval) : [],
          interval,
          now,
        })))
      .filter(Boolean)
      .sort((left, right) => left.breachAt - right.breachAt);
    let qualified = 0;
    let sent = 0;
    const errors = [];
    const completeInterval = (trackKey, interval) => {
      const track = state.tracks[trackKey];
      if (!track) return;
      track.completedIntervals = { ...(track.completedIntervals ?? {}), [interval]: now };
      if (Object.keys(CLOSED_CANDLE_INTERVALS).every(key => track.completedIntervals[key])) {
        delete state.tracks[trackKey];
      }
    };
    const pendingBreakouts = [];
    for (const breakout of breakouts) {
      const trackKey = `${breakout.symbol}|${breakout.direction}`;
      const provisionalRoute = breakout.interval === '15m'
        ? `${breakout.symbol}|${breakout.direction}|15m|BREAKOUT_OPPOSITE_DEPTH`
        : `${breakout.symbol}|${breakout.direction}|BREAKOUT_OPPOSITE_DEPTH`;
      if (now - finite(state.lastByRoute[provisionalRoute], 0) < this.cooldownMs) {
        completeInterval(trackKey, breakout.interval);
        continue;
      }
      pendingBreakouts.push(breakout);
    }
    const symbols = [...new Set(pendingBreakouts.map((breakout) => breakout.symbol))];
    const analysisRows = await mapInBatches(symbols, this.analysisBatchSize, async (symbol) => {
      try {
        const analysis = typeof getAnalysis === 'function' ? await getAnalysis(symbol) : null;
        return [symbol, analysis];
      } catch (error) {
        errors.push(`${symbol}:ANALYSIS:${error?.message ?? 'FAILED'}`);
        return [symbol, null];
      }
    });
    const analysisBySymbol = new Map(analysisRows);
    const events = [];
    for (const breakout of pendingBreakouts) {
      const trackKey = `${breakout.symbol}|${breakout.direction}`;
      const event = assessLiquidityBreakoutOppositeDepth({
        breakout,
        analysis: analysisBySymbol.get(breakout.symbol),
      });
      if (!event) continue;
      qualified += 1;
      if (state.sent[event.eventId]) {
        completeInterval(trackKey, breakout.interval);
        continue;
      }
      events.push(event);
    }
    events.sort(compareEventPriority);
    const selectedEvents = events.slice(0, this.maxPerScan);
    for (const event of selectedEvents) {
      const trackKey = `${event.symbol}|${event.direction}`;
      if (typeof this.onQualified === 'function') {
        try {
          event.binanceExecution = await this.onQualified(event);
        } catch (error) {
          event.binanceExecution = { status: 'error', error: error?.message ?? 'BINANCE_EXECUTION_FAILED' };
        }
      }
      const result = await this.#post(buildLiquidityBreakoutOppositeDepthDiscordPayload(event, this.baseUrl?.()));
      const notificationIndex = state.browserNotifications
        .findIndex((notification) => notification?.eventId === event.eventId);
      const browserNotification = {
        ...event,
        notifiedAt: notificationIndex >= 0
          ? state.browserNotifications[notificationIndex].notifiedAt : now,
        discordDelivery: result,
      };
      if (notificationIndex >= 0) state.browserNotifications[notificationIndex] = browserNotification;
      else state.browserNotifications = [browserNotification, ...state.browserNotifications].slice(0, 100);
      if (result.sent) {
        state.sent[event.eventId] = now;
        state.lastByRoute[event.routeKey] = now;
        state.recent = [{ ...event, sentAt: now }, ...state.recent].slice(0, 50);
        completeInterval(trackKey, event.interval);
        sent += 1;
      } else {
        errors.push(`${event.symbol}:${event.side}:${result.error}`);
      }
    }
    state.updatedAt = now;
    state.version = LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_VERSION;
    await writeJsonAtomic(this.stateFile, state);
    return {
      enabled: true,
      configured: this.configured(),
      tracked: Object.keys(state.tracks).length,
      detected: breakouts.length,
      analyzedSymbols: symbols.length,
      analyzedBreakouts: pendingBreakouts.length,
      qualified,
      selected: selectedEvents.length,
      deferredQualified: Math.max(0, events.length - selectedEvents.length),
      sent,
      errors,
    };
  }
}
