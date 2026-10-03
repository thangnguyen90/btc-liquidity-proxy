import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  PUMP_SUPPORT_VERSION,
  SUPPORT_TYPES,
  livePumpSupport,
} from '../public/pump-support-model.js';

export const PUMP_BASE_SUPPORT_DISCORD_VERSION = 'PUMP_BASE_SUPPORT_DISCORD_V1_20260927';

const ACTIVE = new Set(['WATCHING', 'READY']);
const FRAMES = new Set(['5m', '15m', '1h', '4h', '1d']);
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const fmt = value => {
  const number = finite(value);
  return number != null && number > 0 ? Number(number.toPrecision(8)).toString() : '—';
};
const vn = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

function validWebhook(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['discord.com', 'discordapp.com'].includes(url.hostname)
      && /^\/api\/webhooks\/[^/]+\/[^/]+$/.test(url.pathname) ? url.href : '';
  } catch { return ''; }
}

function validBaseUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : 'http://127.0.0.1:19082';
  } catch { return 'http://127.0.0.1:19082'; }
}

function setupId(row) {
  const support = row?.support;
  return support?.version === PUMP_SUPPORT_VERSION && support.confirmedAt
    ? `${row.symbol}:${row.interval}:${support.confirmedAt}`
    : null;
}

function snapshotCandidates(snapshots, now) {
  const byId = new Map();
  for (const snapshot of snapshots ?? []) {
    if (!snapshot || !FRAMES.has(snapshot.interval)) continue;
    for (const row of snapshot.records ?? []) {
      const id = setupId(row);
      const support = row?.support;
      if (!id || support.status === 'BROKEN' || !(support.expiresAt >= now)) continue;
      const candidate = {
        id,
        sourceId: row.id,
        symbol: String(row.symbol ?? '').toUpperCase(),
        interval: row.interval,
        pumpAt: finite(row.pumpAt),
        retestAt: finite(row.retestAt),
        snapshotAt: finite(snapshot.generatedAt),
        support: structuredClone(support),
      };
      const previous = byId.get(id);
      if (!previous || Number(candidate.support.rr ?? -Infinity) > Number(previous.support.rr ?? -Infinity)) {
        byId.set(id, candidate);
      }
    }
  }
  return [...byId.values()];
}

export function pumpBaseSupportDiscordPayload(record, baseUrl = 'http://127.0.0.1:19082') {
  const support = record.support;
  const rr = finite(record.liveEvaluation?.rr);
  const root = validBaseUrl(baseUrl);
  return {
    username: 'Pump Base Support Watch',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `🟢 HỖ TRỢ LONG ĐÃ PASS · ${record.symbol} · ${record.interval}`,
      color: 0x2ecc71,
      description: `**${SUPPORT_TYPES[support.type] ?? 'Vùng hỗ trợ đã xác nhận'}**\nMARK mới đang nằm trong vùng entry hợp lệ sau nến retest + nến xác nhận đã đóng. Cảnh báo quan sát; không tự đặt Binance.`,
      fields: [
        {
          name: 'GIÁ XÁC NHẬN / MARK PASS',
          value: `Nến xác nhận **${fmt(support.entry)}** · MARK **${fmt(record.livePrice)}**\nVùng entry live **${fmt(support.entryLow)} – ${fmt(support.entryHigh)}**`,
        },
        {
          name: 'HỖ TRỢ / VÔ HIỆU',
          value: `Vùng **${fmt(support.zoneLow)} – ${fmt(support.zoneHigh)}**\nMốc vô hiệu **${fmt(support.stop)}** · kháng cự gần **${fmt(support.target)}**`,
        },
        {
          name: 'DƯ ĐỊA LIVE',
          value: `R:R sau chi phí giả định 0,12% **${rr != null ? rr.toFixed(2) : '—'}**\nKhoảng cách MARK khỏi mép hỗ trợ **${finite(record.liveEvaluation?.distancePct)?.toFixed(2) ?? '—'}%**`,
        },
        {
          name: 'NẾN ĐÃ ĐÓNG (VN)',
          value: `Retest ${vn(support.bounceAt)}\nXác nhận ${vn(support.confirmedAt)} · hết hiệu lực ${vn(support.expiresAt)}`,
        },
        {
          name: 'VOLUME XÁC NHẬN',
          value: `Pullback / max hồi trước **${finite(support.pullbackVolumeRatio)?.toFixed(2) ?? '—'}×**\nNến xác nhận / pullback **${finite(support.confirmationVolumeRatio)?.toFixed(2) ?? '—'}×**`,
        },
        {
          name: 'MỞ MÀN HÌNH',
          value: `[Pump Base](${root}/pump-base-recovery) · [Coin Level](${root}/coin-level-analysis?symbol=${encodeURIComponent(record.symbol)})`,
        },
      ],
      footer: { text: `${PUMP_BASE_SUPPORT_DISCORD_VERSION} · OBSERVE ONLY · không phải lệnh entry/SL/TP Binance` },
      timestamp: new Date(record.liveAt).toISOString(),
    }],
  };
}

export class PumpBaseSupportDiscordNotifier {
  constructor({ stateFile, webhookUrl, baseUrl = () => 'http://127.0.0.1:19082', now = () => Date.now(), fetchImpl = fetch, maxPerScan = 5 }) {
    Object.assign(this, { stateFile, webhookUrl, baseUrl, now, fetchImpl, maxPerScan });
    this.startedAt = now();
    this.state = null;
    this.running = false;
  }

  configured() { return Boolean(validWebhook(this.webhookUrl())); }

  async load() {
    if (this.state) return;
    let saved;
    try { saved = JSON.parse(await readFile(this.stateFile, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Pump support Discord state unreadable'); }
    if (saved && (saved.version !== PUMP_BASE_SUPPORT_DISCORD_VERSION || !Array.isArray(saved.records))) {
      throw new Error('Pump support Discord state version invalid');
    }
    this.state = saved ?? { version: PUMP_BASE_SUPPORT_DISCORD_VERSION, records: [], retryAfter: 0 };
    for (const record of this.state.records) {
      if (record.status === 'SENDING') {
        record.status = 'DELIVERY_UNKNOWN';
        record.reason = 'INTERRUPTED_SEND';
      }
    }
  }

  async save() {
    await mkdir(dirname(this.stateFile), { recursive: true });
    await writeFile(`${this.stateFile}.tmp`, JSON.stringify(this.state));
    await rename(`${this.stateFile}.tmp`, this.stateFile);
  }

  candidateSymbols(snapshots) {
    return [...new Set(snapshotCandidates(snapshots, this.now()).map(row => row.symbol))];
  }

  onMark({ symbol, markPrice, eventTime }) {
    if (!this.state || !(finite(markPrice) > 0) || !(finite(eventTime) > 0)) return;
    for (const record of this.state.records) {
      if (!ACTIVE.has(record.status) || record.symbol !== symbol || eventTime < record.support.confirmedAt) continue;
      if (markPrice <= record.support.stop) {
        record.status = 'INVALIDATED';
        record.reason = 'STOP_BROKEN_BY_MARK';
        record.invalidatedAt = eventTime;
      }
    }
  }

  snapshot() {
    const counts = {};
    for (const record of this.state?.records ?? []) counts[record.status] = (counts[record.status] ?? 0) + 1;
    return {
      version: PUMP_BASE_SUPPORT_DISCORD_VERSION,
      configured: this.configured(),
      evaluatedAt: this.state?.evaluatedAt ?? null,
      counts,
    };
  }

  async process({ snapshots = [], getQuote }) {
    if (this.running) return { busy: true, sent: 0 };
    this.running = true;
    try {
      await this.load();
      const now = this.now();
      const incoming = snapshotCandidates(snapshots, now);
      const existing = new Map(this.state.records.map(record => [record.id, record]));
      for (const candidate of incoming) {
        // A restart establishes a new notification baseline; never import an old closed-candle pass.
        if (!(candidate.support.confirmedAt >= this.startedAt && candidate.support.confirmedAt <= now)) continue;
        const previous = existing.get(candidate.id);
        if (previous) {
          if (ACTIVE.has(previous.status)) {
            previous.snapshotAt = candidate.snapshotAt;
            previous.support = candidate.support;
            previous.sourceId = candidate.sourceId;
          }
          continue;
        }
        const record = { ...candidate, status: 'WATCHING', reason: 'WAIT_LIVE_ENTRY' };
        this.state.records.push(record);
        existing.set(record.id, record);
      }

      for (const record of this.state.records.filter(item => ACTIVE.has(item.status))) {
        if (now > record.support.expiresAt) {
          record.status = 'EXPIRED';
          record.reason = 'PASS_EXPIRED';
          continue;
        }
        const evaluation = livePumpSupport(record.support, getQuote(record.symbol), {
          now,
          snapshotAt: record.snapshotAt,
          invalidated: Boolean(record.invalidatedAt),
        });
        record.liveEvaluation = evaluation;
        record.reason = evaluation.status;
        if (evaluation.status === 'BROKEN') record.status = 'INVALIDATED';
        else record.status = evaluation.status === 'READY' ? 'READY' : 'WATCHING';
        if (evaluation.status === 'READY') {
          record.livePrice = evaluation.live;
          record.liveAt = finite(getQuote(record.symbol)?.eventAt);
        }
      }

      this.state.evaluatedAt = now;
      this.state.records = this.state.records
        .filter(record => now - Number(record.support?.confirmedAt ?? 0) <= 7 * 86400_000)
        .slice(-4000);
      await this.save();

      let sent = 0;
      const url = validWebhook(this.webhookUrl());
      for (const record of this.state.records.filter(item => item.status === 'READY').slice(0, this.maxPerScan)) {
        if (!url || this.now() < Number(this.state.retryAfter ?? 0)) break;
        const quote = getQuote(record.symbol);
        const evaluation = livePumpSupport(record.support, quote, {
          now: this.now(),
          snapshotAt: record.snapshotAt,
          invalidated: Boolean(record.invalidatedAt),
        });
        record.liveEvaluation = evaluation;
        record.reason = evaluation.status;
        if (evaluation.status !== 'READY') {
          record.status = evaluation.status === 'BROKEN' ? 'INVALIDATED' : 'WATCHING';
          continue;
        }
        record.livePrice = evaluation.live;
        record.liveAt = finite(quote?.eventAt);
        record.status = 'SENDING';
        await this.save();
        try {
          const response = await this.fetchImpl(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(pumpBaseSupportDiscordPayload(record, this.baseUrl())),
            signal: AbortSignal.timeout(8000),
          });
          if (response.ok) {
            record.status = 'SENT';
            record.reason = 'DISCORD_SENT';
            record.sentAt = this.now();
            sent += 1;
          } else if (response.status === 429) {
            const body = await response.json().catch(() => ({}));
            const seconds = finite(body.retry_after);
            this.state.retryAfter = this.now() + Math.max(1000, seconds != null ? seconds * 1000 : 60000);
            record.status = 'READY';
            record.reason = 'DISCORD_RATE_LIMIT';
          } else {
            record.status = response.status >= 500 ? 'DELIVERY_UNKNOWN' : 'DELIVERY_FAILED';
            record.reason = `DISCORD_HTTP_${response.status}`;
          }
        } catch {
          record.status = 'DELIVERY_UNKNOWN';
          record.reason = 'DISCORD_NETWORK_UNKNOWN';
        }
        await this.save();
      }
      return { sent, ...this.snapshot().counts };
    } finally {
      this.running = false;
    }
  }
}
