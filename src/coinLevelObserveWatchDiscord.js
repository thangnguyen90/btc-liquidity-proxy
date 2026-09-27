import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const COIN_LEVEL_OBSERVE_WATCH_DISCORD_VERSION =
  'COIN_LEVEL_OBSERVE_WATCH_DISCORD_V1_20260922';

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
  return `[Coin Level](http://127.0.0.1:19082/coin-level-analysis?symbol=${encodeURIComponent(symbol)}) · [Binance](https://www.binance.com/en/futures/${encodeURIComponent(symbol)})`;
}

export function coinLevelObserveWatchDiscordPayload(watch) {
  const isLong = watch?.side === 'LONG';
  const isBreakdownShort = !isLong && watch?.setupMode === 'BREAKDOWN_PRESSURE';
  const direction = isLong ? '🟢 LONG SỚM' : '🔴 SHORT SỚM';
  const pressureName = isLong ? 'LỰC MUA 5m' : 'LỰC BÁN 5m';
  const pressureValue = isLong
    ? `Volume **${number(watch.volumeRatio, 2)}× median20** · taker mua **${number(watch.takerBuyPct, 1)}%**`
    : `Volume **${number(watch.volumeRatio, 2)}× median20** · taker bán **${number(watch.takerSellPct, 1)}%**`;
  const structureValue = isLong
    ? `Close 5m **${number(watch.priceAtWatch)}** · mốc cần phá **${number(watch.breakoutLevel)}**\nCòn cách mốc **${number(watch.breakoutGapPct, 2)}%** · EMA13 **${number(watch.ema13)}** · EMA25 **${number(watch.ema25)}**\nRange/ATR14 **${number(watch.rangeAtr, 2)}×** · cách EMA13 **${number(watch.ema13DistanceAtr, 2)} ATR**`
    : isBreakdownShort
      ? `Mẫu **BREAKDOWN PRESSURE** · close 5m **${number(watch.priceAtWatch)}**\nĐáy 15m cần phá **${number(watch.breakdownLevel)}** · lệch **${number(watch.breakdownGapPct, 2)}%**\nEMA13 **${number(watch.ema13)}** · EMA25 **${number(watch.ema25)}** · Range/ATR14 **${number(watch.rangeAtr, 2)}×**`
      : `Mẫu **POST-PUMP FADE** · close 5m **${number(watch.priceAtWatch)}** · đỉnh gần **${number(watch.peakPrice)}**\nNhịp tăng trước **+${number(watch.pumpPct, 2)}%** · đã rời đỉnh **−${number(watch.pullbackPct, 2)}%**\nEMA13 **${number(watch.ema13)}** · EMA25 **${number(watch.ema25)}** · Range/ATR14 **${number(watch.rangeAtr, 2)}×**`;
  const zoneLabel = isLong ? 'VÙNG RETEST SAU PHÁ' : 'VÙNG HỒI CHỜ REJECT';
  return {
    username: 'Coin Level Observe Watch',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${direction} · QUAN SÁT · ${watch.symbol}`,
      color: isLong ? 0x20e6a8 : 0xff5f7f,
      description: '**OBSERVE ONLY · NẾN 5m ĐÃ ĐÓNG**\nTín hiệu cảnh báo sớm, chưa phải điểm vào đã xác nhận. **Không đặt lệnh Binance.**',
      fields: [
        { name: 'CẤU TRÚC HIỆN TẠI', value: structureValue },
        { name: pressureName, value: pressureValue },
        {
          name: zoneLabel,
          value: `**${number(watch.entryZone?.low)} – ${number(watch.entryZone?.high)}**\nVô hiệu tham khảo: **${number(watch.invalidationPrice)}**`,
        },
        {
          name: 'ĐIỀU KIỆN TIẾP THEO',
          value: String(watch.entryCondition ?? 'Chờ nến đóng xác nhận; không đuổi giá.'),
        },
        {
          name: isLong ? 'ĐIỂM LONG SỚM / THỜI ĐIỂM (VIỆT NAM)' : 'ĐIỂM SHORT SỚM / THỜI ĐIỂM (VIỆT NAM)',
          value: `Điểm sớm **${number(watch.earlyScore, 1)}/100** · Trend 15m/1h **${number(watch.trendScore, 2)}**\n${vietnamTime(watch.observedAt)}`,
        },
        { name: 'MỞ BIỂU ĐỒ', value: chartLinks(watch.symbol) },
      ],
      footer: {
        text: `${COIN_LEVEL_OBSERVE_WATCH_DISCORD_VERSION} · Chỉ cảnh báo; không thuộc candidate Binance`,
      },
      timestamp: new Date(watch.observedAt).toISOString(),
    }],
  };
}

export class CoinLevelObserveWatchDiscordNotifier {
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
      if (error.code !== 'ENOENT') throw new Error('Coin Level observe Discord state unreadable');
      state = { events: [] };
    }
    if (!Array.isArray(state.events)) throw new Error('Coin Level observe Discord state invalid');
    this.state = state;
  }

  async save() {
    this.state.version = COIN_LEVEL_OBSERVE_WATCH_DISCORD_VERSION;
    this.state.events = this.state.events
      .filter((event) => this.now() - Number(event.observedAt) < 7 * 24 * 60 * 60_000)
      .slice(-500);
    await mkdir(dirname(this.stateFile), { recursive: true });
    await writeFile(`${this.stateFile}.tmp`, JSON.stringify(this.state, null, 2));
    await rename(`${this.stateFile}.tmp`, this.stateFile);
  }

  async deliver(watch) {
    await this.load();
    const webhook = String(this.webhookUrl?.() ?? '').trim();
    const observedAt = Number(watch?.observedAt);
    const now = this.now();
    if (!webhook || !watch?.symbol || !['LONG', 'SHORT'].includes(watch?.side)) return false;
    if (watch.watchOnly !== true || watch.binanceEligible !== false) return false;
    if (!(observedAt >= this.startedAt && observedAt < now && now - observedAt <= MAX_SIGNAL_AGE_MS)) return false;
    if (now < this.retryAfter) return false;
    const id = `${watch.symbol}:${watch.side}:${watch.reason ?? 'OBSERVE'}:${observedAt}`;
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
        body: JSON.stringify(coinLevelObserveWatchDiscordPayload(record)),
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

  async deliverWatches(watches) {
    let sent = 0;
    for (const watch of Array.isArray(watches) ? watches : []) {
      if (await this.deliver(watch)) sent += 1;
    }
    return sent;
  }
}
