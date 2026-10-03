import { dirname } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { BTC_RELATIVE_STRENGTH_UI_VERSION } from '../public/btc-relative-strength-model.js';

export const BTC_RELATIVE_STRENGTH_DISCORD_VERSION =
  'BTC_RELATIVE_STRENGTH_DISCORD_V5_CAUSAL_ALPHA_ENTRY_ZONE_20260929';

const ELIGIBLE = new Set(['WAIT_5M_CONFIRM', 'RELATIVE_ENTRY_READY']);
const RETAIN_MS = 7 * 24 * 60 * 60_000;

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validWebhook(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return url.protocol === 'https:'
      && ['discord.com', 'discordapp.com'].includes(url.hostname.toLowerCase())
      && /^\/api\/webhooks\/[^/]+\/[^/]+\/?$/.test(url.pathname) ? url.toString() : '';
  } catch { return ''; }
}

function validBaseUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return ['http:', 'https:'].includes(url.protocol)
      ? url.toString().replace(/\/$/, '') : 'http://127.0.0.1:19082';
  } catch { return 'http://127.0.0.1:19082'; }
}

function fmt(value) {
  const parsed = finite(value);
  if (parsed == null) return '—';
  return parsed.toLocaleString('en-US', {
    maximumSignificantDigits: 10,
    maximumFractionDigits: parsed >= 100 ? 2 : parsed >= 1 ? 5 : 8,
  });
}

function pct(value) {
  const parsed = finite(value);
  return parsed == null ? '—' : `${parsed > 0 ? '+' : ''}${parsed.toFixed(2)}%`;
}

export function btcRelativeStrengthDiscordEventId(row) {
  const symbol = String(row?.symbol ?? '').toUpperCase();
  const side = String(row?.side ?? '').toUpperCase();
  const stage = String(row?.relative?.key ?? '');
  const confirmationAt = finite(row?.confirmationAt, 0);
  if (!symbol || !['LONG', 'SHORT'].includes(side) || !ELIGIBLE.has(stage) || !(confirmationAt > 0)) return null;
  return `${symbol}|${side}|${confirmationAt}|${stage}`;
}

function eligibleRow(row, now = Date.now()) {
  return row?.active === true
    && row?.relative?.contextActive === true
    && row?.relative?.nearEntry === true
    && ELIGIBLE.has(row?.relative?.key)
    && (row?.relative?.key !== 'RELATIVE_ENTRY_READY' || row?.relative?.inZone === true)
    && finite(row?.entryZone?.low) > 0
    && finite(row?.entryZone?.high) > 0
    && finite(row?.livePrice) > 0
    && finite(row?.poolExpiresAt, 0) > now;
}

export function btcRelativeStrengthDiscordPayload(row, btc = {}, baseUrl = 'http://127.0.0.1:19082', now = Date.now()) {
  const ready = row.relative.key === 'RELATIVE_ENTRY_READY';
  const isLong = row.side === 'LONG';
  const pullbackShort = !isLong
    && row?.relative?.contextMode === 'BTC_DOWNTREND_PULLBACK_SHORT';
  const icon = ready ? (isLong ? '🟢' : '🔴') : '🟡';
  const stage = ready ? 'ĐỦ ĐIỀU KIỆN QUAN SÁT' : 'GẦN VÙNG · CHỜ 5M';
  const zoneMarker = isLong ? '🟩' : '🟥';
  const root = validBaseUrl(baseUrl);
  return {
    username: 'BTC Relative Strength Watch',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${icon} ${row.side} ${stage} · ${row.symbol}`,
      color: ready ? (isLong ? 0x20e3a2 : 0xff476f) : 0xffc857,
      description: isLong
        ? `**COIN CÓ ALPHA THẬT KHI BTC DOWN_STRONG.** ${ready ? 'MARK đang trong vùng entry thật; Binance được xét MARKET 2 USDT khi route LONG và khóa tổng đang ON; TP +10% ROE, không đặt SL gốc.' : 'Mới gần vùng hoặc còn thiếu xác nhận; chưa được xét Binance.'}`
        : pullbackShort
          ? `**COIN XẢ MẠNH HƠN BTC TRONG NẾN BTC HỒI 5M.** ${ready ? 'Binance được xét MARKET 2 USDT khi route SHORT và khóa tổng đang ON; TP +10% ROE, không đặt SL gốc.' : 'Mới gần vùng; chưa được xét Binance.'}`
          : `**COIN GIỮ YẾU KHI BTC TĂNG.** ${ready ? 'Binance được xét MARKET 2 USDT khi route SHORT và khóa tổng đang ON; TP +10% ROE, không đặt SL gốc.' : 'Mới gần vùng; chưa được xét Binance.'}`,
      fields: [
        {
          name: '🎯 VÙNG VÀO THAM KHẢO',
          value: `${zoneMarker}${zoneMarker} **${fmt(row.entryZone.low)} – ${fmt(row.entryZone.high)}** ${zoneMarker}${zoneMarker}\nGiữa **${fmt(row.entryZone.mid)}** · cơ sở **${row.entryZone.basis ?? 'EMA/cấu trúc'}**`,
          inline: false,
        },
        {
          name: 'GIÁ LIVE / ĐỘ LỆCH',
          value: `**${fmt(row.livePrice)}** · đi thuận hướng **${pct(row.directionalDistancePct)}**\nNguồn ${row.livePriceSource ?? 'CLOSED_5M'}`,
          inline: true,
        },
        {
          name: 'ĐIỂM / XU HƯỚNG COIN',
          value: `Xếp hạng **${fmt(row.relativeScore)}/100** *(không phải xác suất)* · Trend **${fmt(row.currentTrendScore)}**\n15m ${row.currentFrames?.['15m'] ?? '—'} · 1h ${row.currentFrames?.['1h'] ?? '—'} · 4h ${row.currentFrames?.['4h'] ?? '—'}`,
          inline: true,
        },
        {
          name: 'BỐI CẢNH BTC',
          value: `**${btc.label ?? btc.key ?? '—'}** · BTC ${fmt(btc.price)}\n1h ${btc.direction1h ?? '—'} · 4h ${btc.direction4h ?? '—'} · 6h ${pct(btc.pct6h)}${isLong ? `\nAlpha coin−BTC: **${pct(row?.relative?.alpha15mPct)} / 15m** · **${pct(row?.relative?.alpha1hPct)} / 1h**` : pullbackShort ? `\nNến hồi BTC 5m **${pct(btc?.pullback5m?.movePct)}** · coin 5m **${pct(row.last5mMovePct)}** · yếu hơn **${pct(row?.relative?.relativeMovePct)}**` : ''}`,
          inline: false,
        },
        {
          name: ready ? 'XÁC NHẬN 5M' : 'CÒN THIẾU XÁC NHẬN 5M',
          value: `Volume 15m **${fmt(row.currentVolumeRatio15m)}×** · 5m **${fmt(row.currentVolumeRatio5m)}×**\nTaker mua **${fmt(row.lastTakerBuyPct)}%** · ${row.relative.detail}`,
          inline: false,
        },
        {
          name: 'VÔ HIỆU THAM KHẢO',
          value: `**${fmt(row.invalidationPrice)}** · pool hết hiệu lực ${new Date(row.poolExpiresAt).toLocaleString('vi-VN', { timeZone:'Asia/Ho_Chi_Minh', hour12:false })}`,
          inline: false,
        },
        {
          name: 'MỞ MÀN HÌNH',
          value: `[Ngược BTC](${root}/btc-relative-strength-watch) · [Coin Level](${root}/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}) · [Binance](https://www.binance.com/vi/futures/${encodeURIComponent(row.symbol)})`,
          inline: false,
        },
      ],
      footer: { text: `${BTC_RELATIVE_STRENGTH_DISCORD_VERSION} · Discord không xác nhận khớp · READY mới có quyền xét Binance` },
      timestamp: new Date(now).toISOString(),
    }],
  };
}

function freshState(now) {
  return { version:BTC_RELATIVE_STRENGTH_DISCORD_VERSION, initializedAt:now, updatedAt:now, retryAfter:0, records:[] };
}

export class BtcRelativeStrengthDiscordNotifier {
  constructor({ stateFile, webhookUrl, baseUrl, fetchImpl = globalThis.fetch, now = () => Date.now(), maxPerScan = 5 } = {}) {
    this.stateFile = stateFile;
    this.webhookUrl = typeof webhookUrl === 'function' ? webhookUrl : () => webhookUrl;
    this.baseUrl = typeof baseUrl === 'function' ? baseUrl : () => baseUrl;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.maxPerScan = maxPerScan;
    this.state = null;
    this.running = false;
  }

  configured() { return Boolean(validWebhook(this.webhookUrl())); }

  async load() {
    if (this.state) return;
    const now = this.now();
    try {
      const parsed = JSON.parse(await readFile(this.stateFile, 'utf8'));
      if (!Array.isArray(parsed?.records)) {
        throw new Error('BTC relative Discord state version invalid');
      }
      this.state = { ...parsed, version:BTC_RELATIVE_STRENGTH_DISCORD_VERSION };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.state = freshState(now);
    }
    for (const record of this.state.records) {
      if (record.status === 'SENDING') record.status = 'DELIVERY_UNKNOWN';
    }
  }

  async save() {
    await mkdir(dirname(this.stateFile), { recursive:true });
    await writeFile(`${this.stateFile}.tmp`, JSON.stringify(this.state));
    await rename(`${this.stateFile}.tmp`, this.stateFile);
  }

  snapshot() {
    const counts = {};
    for (const record of this.state?.records ?? []) counts[record.status] = (counts[record.status] ?? 0) + 1;
    return { version:BTC_RELATIVE_STRENGTH_DISCORD_VERSION, configured:this.configured(), counts };
  }

  async process({ rows = [], btc = {} } = {}) {
    if (this.running) return { busy:true, sent:0, candidates:0, errors:[] };
    this.running = true;
    try {
      await this.load();
      const now = this.now();
      const known = new Set(this.state.records.map((record) => record.id));
      const incoming = rows.filter((row) => eligibleRow(row, now))
        .sort((left, right) => (right.relative.key === 'RELATIVE_ENTRY_READY') - (left.relative.key === 'RELATIVE_ENTRY_READY')
          || finite(right.relativeScore, 0) - finite(left.relativeScore, 0));
      for (const row of incoming) {
        const id = btcRelativeStrengthDiscordEventId(row);
        if (!id || known.has(id)) continue;
        this.state.records.push({ id, row, btc, status:'PENDING', createdAt:now, nextAttemptAt:now });
        known.add(id);
      }
      this.state.records = this.state.records
        .filter((record) => now - finite(record.createdAt, now) <= RETAIN_MS)
        .slice(-2000);
      this.state.updatedAt = now;
      await this.save();

      const url = validWebhook(this.webhookUrl());
      if (!url) return { sent:0, candidates:incoming.length, errors:['WEBHOOK_NOT_CONFIGURED'] };
      let sent = 0;
      const errors = [];
      const pending = this.state.records.filter((record) => record.status === 'PENDING'
        && finite(record.nextAttemptAt, 0) <= now).slice(0, this.maxPerScan);
      for (const record of pending) {
        if (this.now() < finite(this.state.retryAfter, 0)) break;
        record.status = 'SENDING';
        await this.save();
        try {
          const response = await this.fetchImpl(url, {
            method:'POST', headers:{ 'content-type':'application/json' },
            body:JSON.stringify(btcRelativeStrengthDiscordPayload(record.row, record.btc, this.baseUrl(), this.now())),
            signal:AbortSignal.timeout(8000),
          });
          if (response.ok) {
            record.status = 'SENT';
            record.sentAt = this.now();
            sent += 1;
          } else if (response.status === 429) {
            const body = await response.json().catch(() => ({}));
            const retryMs = Math.max(1000, finite(body.retry_after, 60) * 1000);
            record.status = 'PENDING';
            record.nextAttemptAt = this.now() + retryMs;
            this.state.retryAfter = record.nextAttemptAt;
            errors.push('DISCORD_RATE_LIMIT');
          } else {
            record.status = response.status >= 500 ? 'DELIVERY_UNKNOWN' : 'DELIVERY_FAILED';
            record.error = `HTTP_${response.status}`;
            errors.push(record.error);
          }
        } catch (error) {
          record.status = 'DELIVERY_UNKNOWN';
          record.error = error?.message ?? 'NETWORK_UNKNOWN';
          errors.push(record.error);
        }
        this.state.updatedAt = this.now();
        await this.save();
      }
      return { sent, candidates:incoming.length, errors, ...this.snapshot().counts };
    } finally {
      this.running = false;
    }
  }
}
