import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const COIN_LEVEL_ENTRY_WATCH_DISCORD_VERSION = 'COIN_LEVEL_ENTRY_WATCH_DISCORD_V7_CANDLE_STATUS_20260921';
const MAX_SIGNAL_AGE_MS = 45 * 60_000;
const RETRY_MIN_MS = 60_000;
const RETRY_MAX_MS = 60 * 60_000;

function number(value, digits = 8) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits).replace(/\.?0+$/, '') : '—';
}

function candleStatus(candidate) {
  return Number(candidate?.retestAt) > 0
    ? '✅ 15m đã xác nhận · retest 5m đã đạt · đủ trạng thái nến để xét MARKET theo route'
    : '⏳ 15m đã xác nhận · chưa có retest 5m · có thể xét LIMIT tại entry dự kiến';
}

export function coinLevelEntryWatchDiscordPayload(candidate) {
  const isLong = candidate.side === 'LONG';
  const retested = Number(candidate.retestAt) > 0;
  const direction = isLong ? '🟢 LONG' : '🔴 SHORT';
  const components = candidate.entryScoreComponents ?? {};
  const targetLines = (candidate.targetPlan?.targets ?? []).map((target) => (
    `**${target.label} ${number(target.price)}** · +${number(target.movePct, 2)}% giá · ≈+${number(target.grossRoePctAt5x, 1)}% ROE 5x · ${(target.basis ?? []).join(' + ')}`
  ));
  return {
    username: 'Coin Level Entry Watch',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `🟨 ENTRY DỰ KIẾN · ${candidate.symbol} · ${candidate.side}`,
      color: 0xffc857,
      description: `**TRẠNG THÁI NẾN**\n${candleStatus(candidate)}\n\n**GIÁ ENTRY DỰ KIẾN: ${number(candidate.entryPrice)}**\nVÙNG THAM KHẢO: **${number(candidate.entryZone?.low)} – ${number(candidate.entryZone?.high)}**\n*Chỉ là mốc chờ; tin Discord không xác nhận Binance đã đặt hoặc khớp lệnh.*`,
    }, {
      title: `${direction} · ${candidate.symbol} · ĐẠT BỘ LỌC ĐIỂM VÀO`,
      color: isLong ? 0x35f3b0 : 0xff6e87,
      description: '**QUÉT NẾN ĐÃ ĐÓNG**\nCoin đã xuất hiện trong bảng “Coin đạt bộ lọc điểm vào”. Entry Score và T1/T2/T3 chỉ đánh giá; Binance chỉ được xét khi khóa tổng + đúng route ON: LIMIT 3 USDT tại entry dự kiến nếu giá đã đi qua, hoặc MARKET theo cấu hình sau retest 5m đã đóng.',
      fields: [
        {
          name: 'ĐIỀU KIỆN ĐÃ ĐẠT',
          value: `Hướng **${candidate.side}** · Trend Score **${number(candidate.score, 2)}**\n15m đã đóng ${isLong ? 'vượt đỉnh' : 'thủng đáy'} 12 nến trước; 15m và 1h đồng hướng.`,
        },
        {
          name: 'TRẠNG THÁI NẾN',
          value: candleStatus(candidate),
        },
        {
          name: 'MỐC / GIÁ NẾN ĐÓNG',
          value: `Mốc phá vùng **${number(candidate.referenceLevel)}**\nClose xác nhận 15m **${number(candidate.signalClose)}**\nClose 5m mới nhất **${number(candidate.lastClosed5m)}**`,
        },
        {
          name: '🟨 ENTRY DỰ KIẾN · LIMIT CHỜ GIÁ',
          value: `**GIÁ ENTRY DỰ KIẾN: ${number(candidate.entryPrice)}**\nVÙNG THAM KHẢO **${number(candidate.entryZone?.low)} – ${number(candidate.entryZone?.high)}**\nLIMIT 3 USDT chỉ khi tín hiệu mới ≤90s, giá đang qua entry 0,15–5%, không có vị thế/lệnh cùng coin; hết hạn sau 45 phút. Nếu đã retest 5m đóng, nhánh MARKET theo cấu hình riêng. Tin Discord không xác nhận lệnh đã đặt.`,
        },
        {
          name: 'ENTRY SCORE 0–100 · KHÔNG PHẢI XÁC SUẤT',
          value: `**${number(candidate.entryScore, 1)} · ${candidate.entryTierLabel ?? candidate.entryTier ?? '—'}**\nTrend ${number(components.trend, 1)}/25 · breakout ${number(components.breakout, 1)}/20 · retest ${number(components.retest, 1)}/25\nVolume/taker ${number(components.flow, 1)}/15 · khoảng trống mục tiêu ${number(components.targetRoom, 1)}/15`,
        },
        {
          name: 'T1 / T2 / T3 DỰ KIẾN',
          value: targetLines.length
            ? `${targetLines.join('\n')}\nCấu trúc/ATR trước entry; chưa hiệu chỉnh xác suất, giá có thể dừng trước hoặc vượt vùng.`
            : 'Chưa đủ dữ liệu cấu trúc/ATR để dựng mục tiêu.',
        },
        {
          name: 'RETEST 5m',
          value: retested
            ? `✅ Đã có nến 5m retest đạt lúc ${new Date(candidate.retestAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false })}`
            : '⏳ Chưa có retest 5m đạt; không đuổi giá.',
        },
        {
          name: 'THỜI ĐIỂM XÁC NHẬN (VIỆT NAM)',
          value: new Date(candidate.confirmationAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }),
        },
        {
          name: 'MỞ BIỂU ĐỒ',
          value: `[Coin Level](http://127.0.0.1:19082/coin-level-analysis?symbol=${encodeURIComponent(candidate.symbol)}) · [Binance](https://www.binance.com/en/futures/${encodeURIComponent(candidate.symbol)})`,
        },
      ],
      footer: { text: `${COIN_LEVEL_ENTRY_WATCH_DISCORD_VERSION} · Bảng cảnh báo; executor LIMIT/MARKET chạy độc lập` },
      timestamp: new Date(candidate.confirmationAt).toISOString(),
    }],
  };
}

export class CoinLevelEntryWatchDiscordNotifier {
  constructor({ stateFile, webhookUrl, now = () => Date.now(), fetchImpl = fetch } = {}) {
    Object.assign(this, { stateFile, webhookUrl, now, fetchImpl });
    this.startedAt = now();
    this.state = null;
    this.retryAfter = 0;
  }

  async load() {
    if (this.state) return;
    let state;
    try { state = JSON.parse(await readFile(this.stateFile, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Coin Level entry Discord state unreadable');
      state = { events: [] };
    }
    if (!Array.isArray(state.events)) throw new Error('Coin Level entry Discord state invalid');
    this.state = state;
  }

  async save() {
    this.state.version = COIN_LEVEL_ENTRY_WATCH_DISCORD_VERSION;
    this.state.events = this.state.events
      .filter((event) => this.now() - Number(event.confirmationAt) < 7 * 24 * 60 * 60_000)
      .slice(-300);
    await mkdir(dirname(this.stateFile), { recursive: true });
    await writeFile(`${this.stateFile}.tmp`, JSON.stringify(this.state, null, 2));
    await rename(`${this.stateFile}.tmp`, this.stateFile);
  }

  async deliver(candidate) {
    await this.load();
    const webhook = String(this.webhookUrl?.() ?? '').trim();
    const confirmationAt = Number(candidate?.confirmationAt);
    const now = this.now();
    if (!webhook || !candidate?.symbol || !['LONG', 'SHORT'].includes(candidate?.side)) return false;
    if (!(confirmationAt >= this.startedAt && confirmationAt < now && now - confirmationAt <= MAX_SIGNAL_AGE_MS)) return false;
    if (now < this.retryAfter) return false;
    const id = `${candidate.symbol}:${candidate.side}:${confirmationAt}`;
    let record = this.state.events.find((event) => event.id === id);
    if (record && record.delivery !== 'rejected') return false;
    if (record && Number(record.retryAt) > now) return false;
    if (!record) {
      record = { ...candidate, id, detectedAt: now };
      this.state.events.push(record);
    } else {
      Object.assign(record, candidate);
    }
    // Save the intent before POST. A crash/timeout stays unknown and is not replayed blindly.
    record.delivery = 'unknown';
    delete record.retryAt;
    await this.save();
    let response;
    try {
      response = await this.fetchImpl(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(coinLevelEntryWatchDiscordPayload(record)),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      await this.save();
      return false;
    }
    if (response.ok) {
      record.delivery = 'sent';
      record.sentAt = this.now();
      await this.save();
      return true;
    }
    record.delivery = 'rejected';
    record.httpStatus = response.status;
    let retryMs = RETRY_MIN_MS;
    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      retryMs = Math.max(RETRY_MIN_MS, Math.min(RETRY_MAX_MS, Number(body.retry_after || 0) * 1000));
    }
    this.retryAfter = this.now() + retryMs;
    record.retryAt = this.retryAfter;
    await this.save();
    return false;
  }

  async deliverCandidates(candidates) {
    let sent = 0;
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      if (await this.deliver(candidate)) sent += 1;
    }
    return sent;
  }
}
