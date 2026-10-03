import { dirname } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

export const LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_VERSION =
  'LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_V2_EXPLICIT_OPT_IN_20261002';

const TRACK_MS = 6 * 60 * 60_000;
const RETAIN_MS = 7 * 24 * 60 * 60_000;

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
    return ['http:', 'https:'].includes(url.protocol) ? url.toString().replace(/\/$/, '') : 'http://127.0.0.1:19082';
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

function normalizeZone(zone = {}) {
  const low = finite(zone.low);
  const high = finite(zone.high);
  if (!(low > 0) || !(high > 0)) return null;
  return { low: Math.min(low, high), high: Math.max(low, high), mid: finite(zone.mid, (low + high) / 2) };
}

export function normalizeLiqScanSweepAlert(alert = {}) {
  const symbol = String(alert.symbol ?? '').trim().toUpperCase();
  const direction = String(alert.dominantSide ?? '').toUpperCase();
  const alertAt = Date.parse(alert.evaluatedAt ?? 0);
  const markPrice = finite(alert.markPrice);
  const zone = normalizeZone(alert.killZoneCluster?.mainKillZone);
  if (!symbol.endsWith('USDT') || !['ABOVE', 'BELOW'].includes(direction)
    || alert.isAlert !== true || !Number.isFinite(alertAt) || !(markPrice > 0) || !zone) return null;
  if (direction === 'ABOVE' && !(zone.low > markPrice)) return null;
  if (direction === 'BELOW' && !(zone.high < markPrice)) return null;
  return {
    symbol,
    direction,
    side: direction === 'ABOVE' ? 'SHORT' : 'LONG',
    alertAt,
    lastSeenAt: alertAt,
    markPriceAtAlert: markPrice,
    dominantPct: finite(alert.dominantPct),
    imbalanceScore: finite(alert.imbalanceScore),
    zone,
  };
}

function validClosedBar(bar, now) {
  return bar && finite(bar.openTime) != null && finite(bar.closeTime) != null && bar.closeTime < now
    && [bar.open, bar.high, bar.low, bar.close].every(value => finite(value) > 0)
    && bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close);
}

export function detectLiqScanSweepRejectEvent({ track, candles5m = [], markPrice = null, now = Date.now() } = {}) {
  if (!track || now - finite(track.alertAt, now) > TRACK_MS) return null;
  const bars = (Array.isArray(candles5m) ? candles5m : [])
    .filter(bar => validClosedBar(bar, now) && bar.openTime >= track.alertAt)
    .sort((left, right) => left.openTime - right.openTime);
  if (!bars.length || now - bars.at(-1).closeTime > 6 * 60_000) return null;
  if (bars.some((bar, index) => index > 0 && bar.openTime - bars[index - 1].openTime !== 300_000)) return null;
  const zone = normalizeZone(track.zone);
  if (!zone) return null;
  const sweepIndex = bars.findIndex(bar => bar.high >= zone.low && bar.low <= zone.high);
  if (sweepIndex < 0) return null;
  const afterSweep = bars.slice(sweepIndex);
  const reject = track.direction === 'ABOVE'
    ? afterSweep.find(bar => bar.close < zone.low && bar.close < bar.open)
    : afterSweep.find(bar => bar.close > zone.high && bar.close > bar.open);
  if (!reject) return null;
  const side = track.direction === 'ABOVE' ? 'SHORT' : 'LONG';
  return {
    version: LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_VERSION,
    observeOnly: true,
    binanceEligible: false,
    symbol: track.symbol,
    side,
    direction: track.direction,
    state: 'REJECTED_AFTER_SWEEP',
    alertAt: track.alertAt,
    sweepAt: bars[sweepIndex].closeTime,
    rejectAt: reject.closeTime,
    rejectClose: reject.close,
    markPrice: finite(markPrice),
    markPriceAtAlert: track.markPriceAtAlert,
    dominantPct: track.dominantPct,
    imbalanceScore: track.imbalanceScore,
    zone,
    eventId: [track.symbol, side, 'REJECTED_AFTER_SWEEP', track.alertAt, reject.closeTime].join('|'),
    routeKey: [track.symbol, side, 'LIQSCAN_SWEEP_REJECT'].join('|'),
  };
}

export function buildLiqScanSweepRejectDiscordPayload(event = {}, baseUrl) {
  const isLong = event.side === 'LONG';
  const root = validBaseUrl(baseUrl);
  const zoneLabel = event.direction === 'ABOVE' ? 'TRÊN' : 'DƯỚI';
  return {
    username: 'AI Local · Binance LiqScan',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${isLong ? '🟢' : '🔴'} LIQSCAN QUÉT ${zoneLabel} + REJECT · ${event.side} WATCH · ${event.symbol}`,
      color: isLong ? 0x16c784 : 0xf43f5e,
      description: `**NẾN 5M ĐÃ ĐÓNG · OBSERVE ONLY.** Giá đã quét vùng thanh khoản ${zoneLabel.toLowerCase()} rồi đóng trở lại ${event.direction === 'ABOVE' ? 'dưới' : 'trên'} vùng. Vùng cũ đã tiêu thụ; đây không phải xác nhận lệnh Binance.`,
      fields: [
        {
          name: `VÙNG ${zoneLabel} ĐÃ QUÉT + REJECT`,
          value: `**${fmt(event.zone?.low)} – ${fmt(event.zone?.high)}**\nReject close **${fmt(event.rejectClose)}** · MARK ${fmt(event.markPrice)}`,
          inline: false,
        },
        {
          name: 'BINANCE LIQSCAN',
          value: `${event.direction} **${fmt(event.dominantPct)}%** · score ${fmt(event.imbalanceScore)}\nNguồn **BINANCE FUTURES** · confidence lifecycle **LOW**`,
          inline: false,
        },
        {
          name: 'Ý NGHĨA',
          value: isLong
            ? 'Quét vùng dưới + reclaim tạo **LONG WATCH**. Chờ cấu trúc/entry riêng; không LONG đuổi.'
            : 'Quét vùng trên + reject tạo **SHORT WATCH**. Chờ cấu trúc/entry riêng; không SHORT đuổi.',
          inline: false,
        },
        {
          name: 'MỞ MÀN HÌNH',
          value: `[AI Local](${root}/local-ai-trend-evaluation) · [Coin Level](${root}/coin-level-analysis?symbol=${encodeURIComponent(event.symbol)}) · [Binance](https://www.binance.com/vi/futures/${encodeURIComponent(event.symbol)})`,
          inline: false,
        },
      ],
      footer: { text: `${LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_VERSION} · không MARKET · không đổi SL/TP` },
      timestamp: new Date(finite(event.rejectAt, Date.now())).toISOString(),
    }],
  };
}

function freshState(now) {
  return {
    version: LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_VERSION,
    initializedAt: now,
    updatedAt: now,
    tracks: {},
    sent: {},
    lastByRoute: {},
    recent: [],
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
  const a = normalizeZone(left);
  const b = normalizeZone(right);
  if (!a || !b) return false;
  const overlap = Math.max(a.low, b.low) <= Math.min(a.high, b.high);
  const middle = Math.max(1e-12, Math.abs((a.mid + b.mid) / 2));
  return overlap || Math.abs(a.mid - b.mid) / middle <= 0.0015;
}

export class LocalAiLiquiditySweepRejectDiscordNotifier {
  constructor({
    stateFile,
    enabled = false,
    webhookUrl,
    baseUrl,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    cooldownMs = 4 * 60 * 60_000,
    maxPerScan = 5,
  } = {}) {
    this.stateFile = stateFile;
    this.enabledFlag = typeof enabled === 'function' ? enabled : () => enabled;
    this.webhookUrl = typeof webhookUrl === 'function' ? webhookUrl : () => webhookUrl;
    this.baseUrl = typeof baseUrl === 'function' ? baseUrl : () => baseUrl;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.cooldownMs = Math.max(60_000, finite(cooldownMs, 4 * 60 * 60_000));
    this.maxPerScan = Math.max(1, Math.min(10, Math.trunc(finite(maxPerScan, 5))));
    this.state = null;
    this.queue = Promise.resolve();
  }

  enabled() { return this.enabledFlag?.() === true; }

  configured() { return this.enabled() && Boolean(validWebhook(this.webhookUrl?.())); }

  snapshot() {
    return {
      version: LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_VERSION,
      enabled: this.enabled(),
      configured: this.configured(),
      observeOnly: true,
      binanceEligible: false,
      tracked: Object.keys(this.state?.tracks ?? {}).length,
      updatedAt: this.state?.updatedAt ?? null,
    };
  }

  async load() {
    if (this.state) return this.state;
    const now = this.now();
    try {
      const parsed = JSON.parse(await readFile(this.stateFile, 'utf8'));
      this.state = {
        ...freshState(now), ...parsed,
        version: LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_VERSION,
        tracks: parsed?.tracks && typeof parsed.tracks === 'object' ? parsed.tracks : {},
        sent: parsed?.sent && typeof parsed.sent === 'object' ? parsed.sent : {},
        lastByRoute: parsed?.lastByRoute && typeof parsed.lastByRoute === 'object' ? parsed.lastByRoute : {},
        recent: Array.isArray(parsed?.recent) ? parsed.recent : [],
      };
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[LocalAiLiqSweepReject] state reset: ${error.message}`);
      this.state = freshState(now);
    }
    return this.state;
  }

  arm(alert = {}) {
    this.queue = this.queue.catch(() => {}).then(async () => {
      if (!this.enabled()) return { armed: false, reason: 'DISABLED' };
      const normalized = normalizeLiqScanSweepAlert(alert);
      if (!normalized) return { armed: false, reason: 'INVALID_ALERT' };
      const state = await this.load();
      const key = `${normalized.symbol}|${normalized.direction}`;
      const previous = state.tracks[key];
      state.tracks[key] = previous && sameZone(previous.zone, normalized.zone)
        ? { ...previous, ...normalized, alertAt: Math.min(previous.alertAt, normalized.alertAt), lastSeenAt: normalized.lastSeenAt }
        : normalized;
      state.updatedAt = this.now();
      return { armed: true, key, track: state.tracks[key] };
    });
    return this.queue;
  }

  scan({ getRows, getMark } = {}) {
    this.queue = this.queue.catch(() => {}).then(() => this.#scan({ getRows, getMark }));
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

  async #scan({ getRows, getMark }) {
    const state = await this.load();
    const now = this.now();
    if (!this.enabled()) {
      const tracked = Object.keys(state.tracks ?? {}).length;
      if (tracked > 0) {
        state.tracks = {};
        state.updatedAt = now;
        state.version = LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_VERSION;
        await writeJsonAtomic(this.stateFile, state);
      }
      return {
        enabled: false,
        configured: false,
        tracked: 0,
        detected: 0,
        sent: 0,
        errors: [],
      };
    }
    state.tracks = Object.fromEntries(Object.entries(state.tracks)
      .filter(([, track]) => now - finite(track?.lastSeenAt, track?.alertAt) <= TRACK_MS));
    state.sent = Object.fromEntries(Object.entries(state.sent)
      .filter(([, sentAt]) => now - finite(sentAt, 0) <= RETAIN_MS));
    const events = Object.values(state.tracks)
      .map(track => detectLiqScanSweepRejectEvent({
        track,
        candles5m: typeof getRows === 'function' ? getRows(track.symbol) : [],
        markPrice: typeof getMark === 'function' ? getMark(track.symbol) : null,
        now,
      }))
      .filter(Boolean)
      .sort((left, right) => left.rejectAt - right.rejectAt);
    let sent = 0;
    const errors = [];
    for (const event of events.slice(0, this.maxPerScan)) {
      const trackKey = `${event.symbol}|${event.direction}`;
      const cooldown = now - finite(state.lastByRoute[event.routeKey], 0) < this.cooldownMs;
      if (state.sent[event.eventId] || cooldown) {
        delete state.tracks[trackKey];
        continue;
      }
      const result = await this.#post(buildLiqScanSweepRejectDiscordPayload(event, this.baseUrl?.()));
      if (result.sent) {
        state.sent[event.eventId] = now;
        state.lastByRoute[event.routeKey] = now;
        state.recent = [{ ...event, sentAt: now }, ...state.recent].slice(0, 50);
        delete state.tracks[trackKey];
        sent += 1;
      } else {
        errors.push(`${event.symbol}:${event.side}:${result.error}`);
      }
    }
    state.updatedAt = now;
    state.version = LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_VERSION;
    await writeJsonAtomic(this.stateFile, state);
    return {
      enabled: true,
      configured: this.configured(),
      tracked: Object.keys(state.tracks).length,
      detected: events.length,
      sent,
      errors,
    };
  }
}
