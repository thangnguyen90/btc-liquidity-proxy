import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { POST_DUMP_NO_SELL_STAGE } from './postDumpNoSellWatch.js';

export const POST_DUMP_NO_SELL_DISCORD_VERSION =
  'POST_DUMP_NO_SELL_DISCORD_V3_IMPULSE_MARKET8_20260927';

const MAX_SIGNAL_AGE_MS = 12 * 60_000;
const RETRY_MIN_MS = 60_000;
const RETRY_MAX_MS = 60 * 60_000;

function number(value, digits = 8) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits).replace(/\.?0+$/, '') : '—';
}

function vietnamTime(value) {
  return new Date(value).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
  });
}

function chartLinks(symbol) {
  return `[Coin Level](http://127.0.0.1:19082/coin-level-analysis?symbol=${encodeURIComponent(symbol)}) · [BTC Session](http://127.0.0.1:19082/btc-session-watch.html) · [Binance](https://www.binance.com/en/futures/${encodeURIComponent(symbol)})`;
}

function validDiscordWebhook(value) {
  try {
    const parsed = new URL(String(value ?? '').trim());
    return parsed.protocol === 'https:'
      && ['discord.com', 'discordapp.com'].includes(parsed.hostname)
      && /^\/api\/webhooks\/[^/]+\/[^/]+$/.test(parsed.pathname)
      ? parsed.toString()
      : '';
  } catch {
    return '';
  }
}

export function postDumpNoSellDiscordPayload(watch) {
  const confirmed = watch?.stage === POST_DUMP_NO_SELL_STAGE.NO_SELL_CONFIRMATION;
  const late = watch?.stage === POST_DUMP_NO_SELL_STAGE.LATE_NO_CHASE;
  return {
    username: 'Post-dump Buy Watch',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${late ? '⚪ HỒI MẠNH SAU XẢ · ĐÃ BƠM QUÁ XA · KHÔNG LONG ĐUỔI' : confirmed ? '🟢 HỒI MẠNH SAU XẢ · KHÔNG CÒN LỰC BÁN' : '🟡 HỒI MẠNH SAU XẢ · CẢNH BÁO SỚM'} · ${watch.symbol}`,
      color: late ? 0x95a5a6 : confirmed ? 0x20e6a8 : 0xf1c40f,
      description: late
        ? '**OBSERVE ONLY · KHÔNG PHẢI ĐIỂM VÀO**\nĐã nhận ra cây hồi nhưng giá/RSI hiện quá giãn. **Không LONG đuổi và không tự đặt Binance.**'
        : confirmed
          ? '**OBSERVE ONLY · 2–3 NẾN 5m ĐÃ ĐÓNG**\nLực bán sau cây hồi vẫn yếu. **Chỉ cập nhật xác nhận; không vào thêm lần hai và không LONG đuổi.**'
          : '**MARKET LONG 8 USDT · NẾN 5m ĐÃ ĐÓNG**\nCây hồi đầu tiên sau nhịp xả vừa đạt ngưỡng. **Binance chỉ được xét khi khóa tổng + route LONG đang ON; Discord không xác nhận lệnh đã khớp.**',
      fields: [
        { name: 'PHÂN LOẠI', value: '**HỒI MẠNH SAU XẢ**' },
        {
          name: 'NHỊP XẢ / ĐỈNH TÍCH LŨY',
          value: `Xả **${number(watch.dumpPct, 2)}%** · đáy **${number(watch.dumpPrice)}**\nĐáy vùng **${number(watch.accumulationBaseLow)}** · đỉnh vùng **${number(watch.accumulationBaseHigh)}**`,
        },
        {
          name: 'CÂY HỒI 5m',
          value: `Tăng **+${number(watch.impulseRisePct, 2)}%** · range **${number(watch.impulseRangeAtr, 2)} ATR**\nVolume **${number(watch.impulseVolumeRatio, 2)}× median20** · taker mua **${number(watch.impulseTakerBuyPct, 1)}%**`,
        },
        {
          name: late ? 'ANTI-CHASE' : confirmed ? 'XÁC NHẬN KHÔNG CÒN LỰC BÁN' : 'ĐANG CHỜ XÁC NHẬN',
          value: late
            ? `RSI14 **${number(watch.rsi14, 1)}** · cách EMA13 **${number(watch.emaDistanceAtr, 2)} ATR**\nTrên đỉnh vùng **${number(watch.moveAboveBasePct, 2)}%** · chỉ theo dõi nhịp retest.`
            : confirmed
              ? `${watch.followBars} nến · điều chỉnh **${number(watch.pullbackPct, 1)}% thân hồi**\nVolume sau hồi **${number(watch.followVolumeRatio, 2)}× cây hồi** · taker bán **${number(watch.followTakerSellPct, 1)}%**`
              : 'Cần 2–3 nến 5m: điều chỉnh ≤35%, volume ≤60% cây hồi, taker bán ≤45%, không mất đỉnh vùng/EMA13.',
        },
        {
          name: 'VÙNG RETEST THAM KHẢO · KHÔNG LONG ĐUỔI',
          value: `**${number(watch.retestZone?.low)} – ${number(watch.retestZone?.high)}**\nVô hiệu tham khảo: **${number(watch.invalidationPrice)}** · RSI14 **${number(watch.rsi14, 1)}**`,
        },
        {
          name: 'ĐIỂM / THỜI ĐIỂM (VIỆT NAM)',
          value: `**${number(watch.score, 1)}/100** · ${vietnamTime(watch.observedAt)}`,
        },
        { name: 'MỞ MÀN HÌNH', value: chartLinks(watch.symbol) },
      ],
      footer: {
        text: `${POST_DUMP_NO_SELL_DISCORD_VERSION} · ${late || confirmed ? 'không vào thêm' : 'route MARKET LONG 8 USDT'}`,
      },
      timestamp: new Date(watch.observedAt).toISOString(),
    }],
  };
}

export class PostDumpNoSellDiscordNotifier {
  constructor({ stateFile, webhookUrl, now = () => Date.now(), fetchImpl = fetch } = {}) {
    Object.assign(this, { stateFile, webhookUrl, now, fetchImpl });
    this.startedAt = now();
    this.state = null;
    this.retryAfter = 0;
  }

  configured() {
    return Boolean(validDiscordWebhook(this.webhookUrl?.()));
  }

  async load() {
    if (this.state) return;
    let state;
    try { state = JSON.parse(await readFile(this.stateFile, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Post-dump no-sell Discord state unreadable');
      state = { events: [] };
    }
    if (!Array.isArray(state.events)) throw new Error('Post-dump no-sell Discord state invalid');
    this.state = state;
  }

  async save() {
    this.state.version = POST_DUMP_NO_SELL_DISCORD_VERSION;
    this.state.events = this.state.events
      .filter((event) => this.now() - Number(event.observedAt) < 7 * 24 * 60 * 60_000)
      .slice(-500);
    await mkdir(dirname(this.stateFile), { recursive: true });
    await writeFile(`${this.stateFile}.tmp`, JSON.stringify(this.state, null, 2));
    await rename(`${this.stateFile}.tmp`, this.stateFile);
  }

  async deliver(watch) {
    await this.load();
    const webhook = validDiscordWebhook(this.webhookUrl?.());
    const observedAt = Number(watch?.observedAt);
    const now = this.now();
    if (!webhook || !watch?.symbol || watch?.side !== 'LONG') return false;
    if (watch.watchOnly !== true || watch.binanceEligible !== false) return false;
    if (!Object.values(POST_DUMP_NO_SELL_STAGE).includes(watch.stage)) return false;
    if (!(observedAt >= this.startedAt && observedAt < now && now - observedAt <= MAX_SIGNAL_AGE_MS)) return false;
    if (now < this.retryAfter) return false;

    const id = `${watch.symbol}:${watch.stage}:${watch.impulseAt}:${observedAt}`;
    let record = this.state.events.find((event) => event.id === id);
    if (record && record.delivery !== 'rejected') return false;
    if (record && Number(record.retryAt) > now) return false;
    if (!record) {
      record = { ...watch, id, detectedAt: now };
      this.state.events.push(record);
    } else {
      Object.assign(record, watch);
    }
    record.delivery = 'unknown';
    delete record.retryAt;
    await this.save();

    let response;
    try {
      response = await this.fetchImpl(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(postDumpNoSellDiscordPayload(record)),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      record.delivery = 'rejected';
      record.retryAt = this.now() + RETRY_MIN_MS;
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

  async deliverWatches(watches) {
    let sent = 0;
    for (const watch of Array.isArray(watches) ? watches : []) {
      if (await this.deliver(watch)) sent += 1;
    }
    return sent;
  }
}
