import { dirname } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

export const POST_MOVE_IDEAL_ENTRY_DISCORD_VERSION = 'POST_MOVE_IDEAL_ENTRY_TOUCH_DISCORD_ACTUAL_TYPE_V6_20260925';

const RETAIN_MS = 7 * 24 * 60 * 60 * 1000;
const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';
const BEAUTIFUL_STAGE_KEYS = Object.freeze({
  LONG: new Set(['LONG_FRESH_REVERSAL', 'LONG_FIRST_STRONG_CANDLE']),
  SHORT: new Set(['SHORT_NEAR_TOP', 'SHORT_FIRST_STRONG_CANDLE']),
});

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

function formatPrice(value) {
  const number = finite(value);
  if (!(number > 0)) return '-';
  if (number >= 1_000) return number.toLocaleString('en-US', { maximumFractionDigits: 4 });
  if (number >= 1) return number.toLocaleString('en-US', { maximumFractionDigits: 6 });
  return number.toLocaleString('en-US', { maximumSignificantDigits: 8, useGrouping: false });
}

function formatVnTime(value) {
  const timestamp = finite(value);
  if (!(timestamp > 0)) return '-';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: VN_TIMEZONE,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(timestamp));
}

function candidateRows(snapshot, side) {
  const rows = [];
  for (const frame of Array.isArray(snapshot?.timeframes) ? snapshot.timeframes : []) {
    for (const candidate of Array.isArray(frame?.items) ? frame.items : []) {
      const symbol = String(candidate?.symbol ?? '').toUpperCase().trim();
      const interval = String(candidate?.interval ?? frame?.interval ?? '').trim();
      const anchorAt = finite(side === 'LONG' ? candidate?.dumpAt : candidate?.pumpAt);
      const price = finite(candidate?.currentPrice);
      const zoneLow = finite(candidate?.idealEntry?.zoneLow);
      const zoneHigh = finite(candidate?.idealEntry?.zoneHigh);
      if (!symbol || !interval || !(anchorAt > 0) || !(price > 0)) continue;
      if (!(zoneLow > 0) || !(zoneHigh >= zoneLow)) continue;
      if (candidate?.status === 'WEAKENED' || candidate?.idealEntry?.state === 'AVOID_WEAKENED') continue;
      rows.push({
        id: `${side}|${interval}|${symbol}|${anchorAt}`,
        side,
        symbol,
        interval,
        anchorAt,
        anchorCloseAt: finite(side === 'LONG' ? candidate?.dumpCloseAt : candidate?.pumpCloseAt),
        price,
        zoneLow,
        zoneHigh,
        midpoint: finite(candidate?.idealEntry?.midpoint),
        distanceFromLivePct: finite(candidate?.idealEntry?.distanceFromLivePct),
        entryState: String(candidate?.idealEntry?.state ?? ''),
        entryBasis: String(candidate?.idealEntry?.basis ?? ''),
        status: String(candidate?.status ?? ''),
        score: finite(candidate?.score),
        moveStage: candidate?.moveStage && typeof candidate.moveStage === 'object'
          ? {
            key: String(candidate.moveStage.key ?? ''),
            label: String(candidate.moveStage.label ?? ''),
            tone: String(candidate.moveStage.tone ?? ''),
            rank: finite(candidate.moveStage.rank),
            entryHint: String(candidate.moveStage.entryHint ?? ''),
          }
          : null,
        confirmationPrice: finite(candidate?.confirmationPrice),
        invalidationPrice: finite(candidate?.invalidationPrice),
      });
    }
  }
  return rows;
}

function isInside(price, zoneLow, zoneHigh) {
  return price >= zoneLow && price <= zoneHigh;
}

function segmentTouchesZone(previousPrice, price, zoneLow, zoneHigh) {
  if (!(finite(previousPrice) > 0)) return isInside(price, zoneLow, zoneHigh);
  return Math.min(previousPrice, price) <= zoneHigh && Math.max(previousPrice, price) >= zoneLow;
}

function freshState(now) {
  return {
    version: POST_MOVE_IDEAL_ENTRY_DISCORD_VERSION,
    initializedAt: now,
    updatedAt: now,
    setups: {},
  };
}

export function buildIdealEntryDiscordPayload(event) {
  const isLong = event.side === 'LONG';
  const isBeautiful = BEAUTIFUL_STAGE_KEYS[event.side]?.has(String(event.moveStage?.key ?? '')) === true;
  const direction = `${isLong ? 'LONG' : 'SHORT'}${isBeautiful ? ' ĐẸP' : ''}`;
  const icon = isLong ? '🟢' : '🔴';
  const pagePath = isLong ? 'post-dump-volume-recovery' : 'post-pump-volume-fade';
  const anchorLabel = isLong ? 'Nến xả gốc' : 'Nến bơm gốc';
  const dualText = event.dualDirection
    ? '\n⚠️ Coin này đồng thời còn có setup ở hướng ngược lại trên cùng khung.'
    : '';
  return {
    username: 'MTF Ideal Entry Touch',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${icon} ${direction} ĐÃ CHẠM · ${event.symbol} · ${event.interval}`,
      description: `Giá live vừa chạm vùng entry tham khảo của setup còn hiệu lực.${dualText}\n**Discord chỉ thông báo; Binance do route riêng và Auto Controls quyết định.**`,
      color: isLong ? 0x22c55e : 0xf43f5e,
      fields: [
        {
          name: isBeautiful ? 'GIÁ LIVE / VÙNG ĐẸP' : 'GIÁ LIVE / VÙNG ENTRY',
          value: `**${formatPrice(event.price)}**\n${formatPrice(event.zoneLow)} – ${formatPrice(event.zoneHigh)} · giữa ${formatPrice(event.midpoint)}`,
          inline: true,
        },
        {
          name: 'TRẠNG THÁI / ĐIỂM',
          value: `${event.status || '-'} · ${event.score ?? '-'} điểm\n${event.entryState || '-'}`,
          inline: true,
        },
        {
          name: isBeautiful ? 'LOẠI ĐẸP' : 'GIAI ĐOẠN NHỊP GIÁ',
          value: `**${event.moveStage?.label || 'CHƯA PHÂN LOẠI'}**\n${event.moveStage?.entryHint || 'Chờ thêm dữ liệu nến đã đóng.'}`,
          inline: false,
        },
        {
          name: 'XÁC NHẬN / VÔ HIỆU',
          value: `${formatPrice(event.confirmationPrice)} / ${formatPrice(event.invalidationPrice)}`,
          inline: true,
        },
        {
          name: anchorLabel,
          value: formatVnTime(event.anchorAt),
          inline: true,
        },
        {
          name: 'MỞ MÀN HÌNH',
          value: `[Setup](${`http://127.0.0.1:19082/${pagePath}`}) · [Binance](https://www.binance.com/vi/futures/${event.symbol})`,
          inline: true,
        },
      ],
      footer: { text: POST_MOVE_IDEAL_ENTRY_DISCORD_VERSION },
      timestamp: new Date(event.touchAt).toISOString(),
    }],
  };
}

export class PostMoveIdealEntryDiscordNotifier {
  constructor({ stateFile, webhookUrl, fetchImpl = globalThis.fetch, now = () => Date.now(), maxPerScan = 5 } = {}) {
    this.stateFile = stateFile;
    this.webhookUrl = typeof webhookUrl === 'function' ? webhookUrl : () => webhookUrl;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.maxPerScan = Math.max(1, finite(maxPerScan, 5));
    this.state = null;
    this.baselinedThisRun = false;
    this.queue = Promise.resolve();
  }

  configured() {
    return Boolean(normalizeWebhookUrl(this.webhookUrl?.()));
  }

  async load() {
    if (this.state) return this.state;
    const now = this.now();
    try {
      const parsed = JSON.parse(await readFile(this.stateFile, 'utf8'));
      this.state = {
        ...freshState(now),
        ...(parsed && typeof parsed === 'object' ? parsed : {}),
        version: POST_MOVE_IDEAL_ENTRY_DISCORD_VERSION,
        setups: parsed?.setups && typeof parsed.setups === 'object' ? parsed.setups : {},
      };
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[IdealEntryDiscord] state load failed: ${error.message}`);
      this.state = freshState(now);
    }
    return this.state;
  }

  async save() {
    if (!this.stateFile || !this.state) return;
    await mkdir(dirname(this.stateFile), { recursive: true });
    const tmp = `${this.stateFile}.tmp`;
    await writeFile(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    await rename(tmp, this.stateFile);
  }

  processSnapshots(input = {}) {
    this.queue = this.queue
      .catch(() => {})
      .then(() => this.#process(input));
    return this.queue;
  }

  async #process({ longSnapshot, shortSnapshot } = {}) {
    const webhookUrl = normalizeWebhookUrl(this.webhookUrl?.());
    if (!webhookUrl) return { configured: false, baseline: false, candidates: 0, sent: 0, errors: [] };
    const state = await this.load();
    const now = this.now();
    const candidates = [
      ...candidateRows(longSnapshot, 'LONG'),
      ...candidateRows(shortSnapshot, 'SHORT'),
    ];
    const activeIds = new Set(candidates.map((candidate) => candidate.id));
    const activeDirection = new Set(candidates.map((candidate) => `${candidate.symbol}|${candidate.interval}|${candidate.side}`));

    for (const [id, setup] of Object.entries(state.setups)) {
      const referenceAt = finite(setup?.lastSeenAt, finite(setup?.anchorAt, 0));
      if (referenceAt > 0 && now - referenceAt > RETAIN_MS) delete state.setups[id];
      else if (!activeIds.has(id)) setup.active = false;
    }

    if (!this.baselinedThisRun) {
      for (const candidate of candidates) {
        const inside = isInside(candidate.price, candidate.zoneLow, candidate.zoneHigh);
        const previous = state.setups[candidate.id] ?? {};
        state.setups[candidate.id] = {
          ...previous,
          ...candidate,
          active: true,
          inside,
          armed: !inside,
          pending: false,
          lastPrice: candidate.price,
          lastSeenAt: now,
        };
      }
      state.updatedAt = now;
      this.baselinedThisRun = true;
      await this.save();
      return { configured: true, baseline: true, candidates: candidates.length, sent: 0, errors: [] };
    }

    const due = [];
    for (const candidate of candidates) {
      const previous = state.setups[candidate.id];
      const inside = isInside(candidate.price, candidate.zoneLow, candidate.zoneHigh);
      const record = {
        ...(previous ?? {}),
        ...candidate,
        active: true,
        inside,
        lastPrice: candidate.price,
        lastSeenAt: now,
      };
      if (!previous) {
        record.armed = !inside;
        record.pending = inside;
      } else if (!record.sentAt && !record.pending && record.armed
        && segmentTouchesZone(previous.lastPrice, candidate.price, candidate.zoneLow, candidate.zoneHigh)) {
        record.pending = true;
      }
      if (!inside) record.armed = true;
      state.setups[candidate.id] = record;
      if (record.pending && finite(record.retryAt, 0) <= now) {
        due.push({
          ...record,
          touchAt: now,
          dualDirection: activeDirection.has(`${record.symbol}|${record.interval}|${record.side === 'LONG' ? 'SHORT' : 'LONG'}`),
        });
      }
    }

    state.updatedAt = now;
    await this.save();
    const errors = [];
    let sent = 0;
    for (const event of due.slice(0, this.maxPerScan)) {
      const record = state.setups[event.id];
      if (!record || record.sentAt) continue;
      record.pending = false;
      record.delivery = 'SENDING';
      record.deliveryAttemptAt = now;
      await this.save();
      try {
        const response = await this.fetchImpl(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(buildIdealEntryDiscordPayload(event)),
          signal: AbortSignal.timeout(12_000),
        });
        if (response?.ok) {
          record.sentAt = this.now();
          record.delivery = 'SENT';
          record.retryAt = null;
          sent += 1;
        } else {
          const status = finite(response?.status, 0);
          record.delivery = `REJECTED_${status || 'UNKNOWN'}`;
          if (status === 429 || status >= 500) {
            const retryAfterHeader = finite(response?.headers?.get?.('retry-after'));
            record.pending = true;
            record.retryAt = this.now() + Math.max(15_000, retryAfterHeader ? retryAfterHeader * 1_000 : 60_000);
          }
          errors.push(`${event.id}:${record.delivery}`);
        }
      } catch (error) {
        // Delivery is uncertain after a timeout/network exception; do not retry blindly.
        record.delivery = 'UNKNOWN_NO_RETRY';
        record.deliveryError = String(error?.message ?? error).slice(0, 240);
        errors.push(`${event.id}:${record.delivery}`);
      }
      await this.save();
    }
    return {
      configured: true,
      baseline: false,
      candidates: candidates.length,
      queued: Math.max(0, due.length - this.maxPerScan),
      sent,
      errors,
    };
  }
}
