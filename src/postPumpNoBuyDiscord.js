import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { POST_PUMP_NO_BUY_STAGE } from './postPumpNoBuyWatch.js';
import { impulseSizingDiscordField } from './postMoveImpulseSizing.js';

export const POST_PUMP_NO_BUY_DISCORD_VERSION =
  'POST_PUMP_NO_BUY_DISCORD_V6_DYNAMIC_SIZE_20261001';

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

export function postPumpNoBuyDiscordPayload(watch) {
  const confirmed = watch?.stage === POST_PUMP_NO_BUY_STAGE.NO_BUY_CONFIRMATION;
  const late = watch?.stage === POST_PUMP_NO_BUY_STAGE.LATE_NO_CHASE;
  const size = watch?.impulseSizing?.marginUsdt ?? '1 hoặc 5';
  return {
    username: 'Post-pump Sell Watch',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${late ? '⚪ XẢ MẠNH SAU BƠM · ĐÃ XẢ QUÁ XA · KHÔNG SHORT ĐUỔI' : confirmed ? '🔴 XẢ MẠNH SAU BƠM · ĐÃ XÁC NHẬN SHORT' : '🟠 XẢ MẠNH SAU BƠM · CẢNH BÁO SỚM'} · ${watch.symbol}`,
      color: late ? 0x95a5a6 : confirmed ? 0xe74c3c : 0xff9f43,
      description: late
        ? '**OBSERVE ONLY · KHÔNG PHẢI ĐIỂM VÀO**\nĐã nhận ra cây xả nhưng giá/RSI hiện quá giãn. **Không SHORT đuổi và không tự đặt Binance.**'
        : confirmed
          ? `**MARKET SHORT ${size} USDT · XÁC NHẬN 2–3 NẾN 5m ĐÃ ĐÓNG**\nLực mua sau cây xả vẫn yếu. **Binance chỉ được xét ở bước xác nhận này khi khóa tổng + route SHORT đang ON; không SHORT đuổi và Discord không xác nhận lệnh đã khớp.**`
          : '**OBSERVE ONLY · CHỜ XÁC NHẬN 2–3 NẾN 5m**\nCây xả đầu tiên sau nhịp bơm vừa đạt ngưỡng. **Vẫn gửi Discord nhưng chưa đặt Binance.**',
      fields: [
        {
          name: 'PHÂN LOẠI',
          value: '**XẢ MẠNH SAU BƠM**',
        },
        ...(confirmed ? [impulseSizingDiscordField(watch)] : []),
        {
          name: 'NHỊP BƠM / ĐÁY PHÂN PHỐI',
          value: `Bơm **+${number(watch.pumpPct, 2)}%** · đỉnh **${number(watch.pumpPrice)}**\nĐáy vùng **${number(watch.distributionBaseLow)}** · đỉnh vùng **${number(watch.distributionBaseHigh)}**`,
        },
        {
          name: 'CÂY XẢ 5m',
          value: `Giảm **${number(watch.impulseDropPct, 2)}%** · range **${number(watch.impulseRangeAtr, 2)} ATR**\nVolume **${number(watch.impulseVolumeRatio, 2)}× median20** · taker bán **${number(watch.impulseTakerSellPct, 1)}%**`,
        },
        {
          name: late ? 'ANTI-CHASE' : confirmed ? 'XÁC NHẬN KHÔNG CÓ LỰC MUA' : 'ĐANG CHỜ XÁC NHẬN',
          value: late
            ? `RSI14 **${number(watch.rsi14, 1)}** · cách EMA13 **${number(watch.emaDistanceAtr, 2)} ATR**\nDưới đáy vùng **${number(watch.moveBelowBasePct, 2)}%** · chỉ theo dõi nhịp hồi.`
            : confirmed
            ? `${watch.followBars} nến · hồi **${number(watch.reboundPct, 1)}% thân xả**\nVolume sau xả **${number(watch.followVolumeRatio, 2)}× cây xả** · taker mua **${number(watch.followTakerBuyPct, 1)}%**`
            : 'Cần 2–3 nến 5m: hồi ≤35%, volume ≤60% cây xả, taker mua ≤45%, không lấy lại đáy vùng/EMA13.',
        },
        {
          name: 'VÙNG RETEST THAM KHẢO · KHÔNG SHORT ĐUỔI',
          value: `**${number(watch.retestZone?.low)} – ${number(watch.retestZone?.high)}**\nVô hiệu tham khảo: **${number(watch.invalidationPrice)}** · RSI14 **${number(watch.rsi14, 1)}**`,
        },
        {
          name: 'ĐIỂM / THỜI ĐIỂM (VIỆT NAM)',
          value: `**${number(watch.score, 1)}/100** · ${vietnamTime(watch.observedAt)}`,
        },
        { name: 'MỞ MÀN HÌNH', value: chartLinks(watch.symbol) },
      ],
      footer: {
        text: `${POST_PUMP_NO_BUY_DISCORD_VERSION} · ${late ? 'không vào' : confirmed ? `route MARKET SHORT ${size} USDT sau xác nhận` : 'chờ xác nhận · không đặt Binance'}`,
      },
      timestamp: new Date(watch.observedAt).toISOString(),
    }],
  };
}

export class PostPumpNoBuyDiscordNotifier {
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
      if (error.code !== 'ENOENT') throw new Error('Post-pump no-buy Discord state unreadable');
      state = { events: [] };
    }
    if (!Array.isArray(state.events)) throw new Error('Post-pump no-buy Discord state invalid');
    this.state = state;
  }

  async save() {
    this.state.version = POST_PUMP_NO_BUY_DISCORD_VERSION;
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
    if (!webhook || !watch?.symbol || watch?.side !== 'SHORT') return false;
    if (watch.watchOnly !== true || watch.binanceEligible !== false) return false;
    if (!Object.values(POST_PUMP_NO_BUY_STAGE).includes(watch.stage)) return false;
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
        body: JSON.stringify(postPumpNoBuyDiscordPayload(record)),
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
