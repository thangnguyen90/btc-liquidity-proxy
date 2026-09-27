import { dirname } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

export const BTC_SESSION_WATCH_DISCORD_VERSION = 'BTC_SESSION_CONTEXT_READY_DISCORD_V2_IGNORE_LONG_MARKET_REGIME_20260926';
const RETAIN_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_MIN_MS = 60_000;
const RETRY_MAX_MS = 60 * 60_000;

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeWebhookUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'https:') return '';
    if (!['discord.com', 'discordapp.com'].includes(url.hostname.toLowerCase())) return '';
    if (!/^\/api\/webhooks\/[^/]+\/[^/]+\/?$/.test(url.pathname)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function normalizeBaseUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return 'http://127.0.0.1:19082';
    return url.toString().replace(/\/$/, '');
  } catch {
    return 'http://127.0.0.1:19082';
  }
}

function formatNumber(value, digits = 8) {
  const parsed = finite(value);
  if (!Number.isFinite(parsed)) return '—';
  return parsed.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    maximumSignificantDigits: 10,
    useGrouping: parsed >= 1_000,
  });
}

function formatVnTime(value) {
  const timestamp = finite(value);
  if (!(timestamp > 0)) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(timestamp));
}

function isReadyRow(row) {
  const expectedClass = row?.side === 'LONG' ? 'context-long-ready' : 'context-short-ready';
  return ['LONG', 'SHORT'].includes(row?.side)
    && row?.retainedOnly !== true
    && row?.rank === 3
    && row?.status === 'TRONG VÙNG · CÙNG BTC'
    && row?.contextClass === expectedClass
    && row?.live === true
    && row?.stale !== true
    && row?.broken !== true
    && row?.dual !== true
    && row?.observeOnly === true
    && row?.executionEligible === false
    && row?.binanceEligible === false;
}

export function btcSessionWatchDiscordEventId(row) {
  const symbol = String(row?.symbol ?? '').toUpperCase().trim();
  const side = String(row?.side ?? '').toUpperCase();
  const window = String(row?.window ?? '').toUpperCase();
  const confirmationAt = finite(row?.confirmationAt, 0);
  const retestAt = finite(row?.retestAt, 0);
  if (!symbol || !['LONG', 'SHORT'].includes(side) || !window || !(confirmationAt > 0)) return null;
  return `${symbol}|${side}|${window}|${confirmationAt}|${retestAt}`;
}

export function btcSessionWatchDiscordPayload(row, context = {}, now = Date.now()) {
  const isLong = row.side === 'LONG';
  const icon = isLong ? '🟢' : '🔴';
  const targets = (Array.isArray(row?.targetPlan?.targets) ? row.targetPlan.targets : [])
    .filter((target) => target?.structural !== false && finite(target?.price) > 0)
    .slice(0, 3)
    .map((target) => `${target.label ?? 'Mục tiêu'} **${formatNumber(target.price)}**`);
  const regime = context?.marketRegime ?? {};
  const btcDirection = String(context?.health?.btcTrendDir ?? '').toUpperCase();
  const btc4h = String(context?.health?.btcTrendDir4h ?? '—').toUpperCase();
  const distance = finite(row?.distance);
  const baseUrl = normalizeBaseUrl(context?.baseUrl);
  return {
    username: 'BTC Session Watch',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${icon} ${row.side} ĐẠT ĐIỂM CHÚ Ý · ${row.symbol} · ${row.window}`,
      description: '**TRONG VÙNG · CÙNG BTC** — dòng vừa chuyển sang màu đạt trên `/btc-session-watch`. Market Regime chỉ hiển thị tham khảo, không chặn LONG/Discord ở trang này. OBSERVE ONLY: không đặt lệnh Binance và không xác nhận xác suất thắng.',
      color: isLong ? 0x22c55e : 0xf43f5e,
      fields: [
        {
          name: 'GIÁ LIVE / VÙNG VÀO THAM KHẢO',
          value: [`**${formatNumber(row.price)}**`, `${formatNumber(row.low)} – ${formatNumber(row.high)} · giữa **${formatNumber(row.middle)}**`, distance == null ? '' : `Cách giữa vùng ${distance.toFixed(2)}%`].filter(Boolean).join('\n'),
          inline: true,
        },
        {
          name: 'ĐIỂM NGUỒN / KHUNG GIỜ',
          value: [`**${formatNumber(row.entryScore, 1)}/100**`, `${row.window} · ${row.side}`].join('\n'),
          inline: true,
        },
        {
          name: 'BỐI CẢNH BTC / THỊ TRƯỜNG',
          value: [`BTC 1h **${btcDirection || '—'}** · 4h **${btc4h}**`, `${regime.state ?? '—'}${Array.isArray(regime.reasons) && regime.reasons.length ? ` · ${regime.reasons.join(' ')}` : ''}`].join('\n'),
          inline: false,
        },
        {
          name: 'MỐC PHÁ / MỤC TIÊU CẤU TRÚC',
          value: [`Mốc **${formatNumber(row.level)}**`, targets.length ? targets.join(' · ') : 'Chưa đủ mục tiêu cấu trúc'].join('\n'),
          inline: false,
        },
        {
          name: 'XÁC NHẬN / RETEST',
          value: [formatVnTime(row.confirmationAt), `Retest ${formatVnTime(row.retestAt)}`].join('\n'),
          inline: true,
        },
        {
          name: 'MỞ MÀN HÌNH',
          value: `[BTC Session](${baseUrl}/btc-session-watch.html) · [Coin Level](${baseUrl}/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}) · [Binance](https://www.binance.com/vi/futures/${encodeURIComponent(row.symbol)})`,
          inline: false,
        },
      ],
      footer: { text: `${BTC_SESSION_WATCH_DISCORD_VERSION} · OBSERVE ONLY · một lần cho mỗi setup` },
      timestamp: new Date(now).toISOString(),
    }],
  };
}

function freshState(now) {
  return { version: BTC_SESSION_WATCH_DISCORD_VERSION, initializedAt: now, updatedAt: now, records: {} };
}

export class BtcSessionWatchDiscordNotifier {
  constructor({ stateFile, webhookUrl, baseUrl, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
    this.stateFile = stateFile;
    this.webhookUrl = typeof webhookUrl === 'function' ? webhookUrl : () => webhookUrl;
    this.baseUrl = typeof baseUrl === 'function' ? baseUrl : () => baseUrl;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.state = null;
    this.createdStateThisRun = false;
    this.baselinedThisRun = false;
    this.retryAfter = 0;
    this.queue = Promise.resolve();
  }

  configured() { return Boolean(normalizeWebhookUrl(this.webhookUrl?.())); }

  async load() {
    if (this.state) return this.state;
    const now = this.now();
    try {
      const parsed = JSON.parse(await readFile(this.stateFile, 'utf8'));
      if (!parsed?.records || typeof parsed.records !== 'object' || Array.isArray(parsed.records)) {
        throw new Error('invalid records');
      }
      this.state = { ...freshState(now), ...parsed, version: BTC_SESSION_WATCH_DISCORD_VERSION, records: parsed.records };
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[BtcSessionDiscord] state reset: ${error.message}`);
      this.state = freshState(now);
      this.createdStateThisRun = true;
    }
    return this.state;
  }

  async save() {
    if (!this.stateFile || !this.state) return;
    const now = this.now();
    const records = Object.entries(this.state.records)
      .filter(([, record]) => now - finite(record?.lastSeenAt, now) <= RETAIN_MS)
      .sort((a, b) => finite(a[1]?.lastSeenAt, 0) - finite(b[1]?.lastSeenAt, 0))
      .slice(-500);
    this.state.version = BTC_SESSION_WATCH_DISCORD_VERSION;
    this.state.updatedAt = now;
    this.state.records = Object.fromEntries(records);
    await mkdir(dirname(this.stateFile), { recursive: true });
    const temporary = `${this.stateFile}.tmp`;
    await writeFile(temporary, JSON.stringify(this.state, null, 2), 'utf8');
    await rename(temporary, this.stateFile);
  }

  process(input = {}) {
    this.queue = this.queue.catch(() => {}).then(() => this.#process(input));
    return this.queue;
  }

  async #post(webhookUrl, row, context, record) {
    record.delivery = 'unknown';
    delete record.retryAt;
    await this.save();
    let response;
    try {
      response = await this.fetchImpl(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(btcSessionWatchDiscordPayload(row, context, this.now())),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      record.lastError = error?.message ?? 'network error';
      await this.save();
      return { sent: false, error: record.lastError };
    }
    if (response.ok) {
      record.delivery = 'sent';
      record.notified = true;
      record.sentAt = this.now();
      delete record.lastError;
      await this.save();
      return { sent: true };
    }
    let retryMs = RETRY_MIN_MS;
    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      retryMs = Math.max(RETRY_MIN_MS, Math.min(RETRY_MAX_MS, finite(body?.retry_after, 0) * 1000));
    }
    this.retryAfter = this.now() + retryMs;
    record.delivery = 'rejected';
    record.httpStatus = response.status;
    record.retryAt = this.retryAfter;
    await this.save();
    return { sent: false, error: `HTTP ${response.status}` };
  }

  async #process({ rows = [], health = null, marketRegime = null } = {}) {
    const webhookUrl = normalizeWebhookUrl(this.webhookUrl?.());
    if (!webhookUrl) return { configured: false, baseline: false, candidates: 0, sent: 0, errors: [] };
    const state = await this.load();
    const now = this.now();
    const firstBaseline = this.createdStateThisRun && !this.baselinedThisRun;
    const candidates = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const id = btcSessionWatchDiscordEventId(row);
      if (!id) continue;
      const ready = isReadyRow(row);
      let record = state.records[id];
      const isNew = !record;
      if (!record) {
        record = { id, symbol: row.symbol, side: row.side, window: row.window, confirmationAt: finite(row.confirmationAt), retestAt: finite(row.retestAt), firstSeenAt: now, lastSeenAt: now, ready, notified: false, baselineSuppressed: firstBaseline && ready };
        state.records[id] = record;
      } else {
        record.lastSeenAt = now;
        if (!ready) record.baselineSuppressed = false;
      }
      const retryEligible = ready && record.delivery === 'rejected' && finite(record.retryAt, 0) <= now;
      const transitionEligible = ready && (isNew || record.ready !== true) && record.notified !== true && record.baselineSuppressed !== true;
      if (transitionEligible || retryEligible) candidates.push({ row, record });
      record.ready = ready;
    }
    this.baselinedThisRun = true;
    let sent = 0;
    const errors = [];
    for (const { row, record } of candidates) {
      if (this.now() < this.retryAfter) break;
      const result = await this.#post(webhookUrl, row, { health, marketRegime, baseUrl: this.baseUrl?.() }, record);
      if (result.sent) sent += 1;
      else if (result.error) errors.push(`${row.symbol}:${row.side}:${result.error}`);
    }
    await this.save();
    return { configured: true, baseline: firstBaseline, candidates: candidates.length, sent, errors };
  }
}
