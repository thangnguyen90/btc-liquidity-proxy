import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const MEGA_PUMP_STAIRCASE_VERSION = 'MEGA_PUMP_STAIRCASE_1H_V2_SIGNAL_PRICE_20260913';

export const MEGA_PUMP_STAIRCASE_RULE = Object.freeze({
  minBars: 30,
  earlyRet3hPct: 20,
  earlyRet6hPct: 35,
  earlyRet24hPct: 25,
  earlyVolumeRatio: 2,
  earlyBreakoutPct: 2,
  acceleratingRet3hPct: 50,
  acceleratingRet6hPct: 80,
  acceleratingVolumeRatio: 2,
  acceleratingBreakoutPct: 5,
  dangerRet3hPct: 100,
  dangerRet6hPct: 150,
  dangerCandleHighPct: 80,
  dangerVolumeRatio: 2.5,
  dangerBreakoutPct: 10,
  exhaustionUpperWickPct: 35,
  exhaustionRetracePct: 30,
  maxBoundaryGapPct: 8,
  maxFreshAgeMs: 75 * 60_000,
});

const HOUR_MS = 60 * 60_000;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const pct = (value, digits = 1) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%` : '--';
const number = (value) => Number.isFinite(value) ? Number(value.toFixed(8)).toString() : '--';
const compact = (value) => Number.isFinite(value)
  ? Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
  : '--';
const vn = (value) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

function valueOf(row, key, index) {
  return finite(Array.isArray(row) ? row[index] : row?.[key]);
}

function normalizeBar(row) {
  if (!row) return null;
  const bar = {
    openTime: valueOf(row, 'openTime', 0),
    open: valueOf(row, 'open', 1),
    high: valueOf(row, 'high', 2),
    low: valueOf(row, 'low', 3),
    close: valueOf(row, 'close', 4),
    volume: valueOf(row, 'volume', 5),
    closeTime: valueOf(row, 'closeTime', 6),
    quoteVolume: valueOf(row, 'quoteVolume', 7),
  };
  if (![bar.openTime, bar.open, bar.high, bar.low, bar.close, bar.closeTime].every(Number.isFinite)
    || bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0
    || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) return null;
  if (!Number.isFinite(bar.quoteVolume) && Number.isFinite(bar.volume)) bar.quoteVolume = bar.volume * bar.close;
  return bar;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function ema(values, period) {
  if (values.length < period) return null;
  const alpha = 2 / (period + 1);
  let result = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const value of values.slice(period)) result = value * alpha + result * (1 - alpha);
  return result;
}

function normalizeClosedRows(rows, now, rule) {
  const closed = (Array.isArray(rows) ? rows : [])
    .map(normalizeBar)
    .filter((bar) => bar && bar.closeTime < now)
    .sort((a, b) => a.openTime - b.openTime)
    .slice(-72);
  if (closed.length < rule.minBars) return [];
  const recent = closed.slice(-rule.minBars);
  for (let index = 1; index < recent.length; index += 1) {
    const previous = recent[index - 1];
    const current = recent[index];
    if (Math.abs(current.openTime - previous.openTime - HOUR_MS) > 1_000) return [];
    const boundaryGapPct = Math.abs(current.open / previous.close - 1) * 100;
    if (boundaryGapPct > rule.maxBoundaryGapPct) return [];
  }
  return closed;
}

export function detectMegaPumpStaircase(rows, {
  symbol,
  now = Date.now(),
  config = {},
} = {}) {
  const rule = { ...MEGA_PUMP_STAIRCASE_RULE, ...config };
  const bars = normalizeClosedRows(rows, now, rule);
  if (!symbol || !bars.length) return null;
  const current = bars.at(-1);
  if (now - current.closeTime > rule.maxFreshAgeMs) return null;
  const at = (hours) => bars.at(-(hours + 1));
  const anchor3 = at(3);
  const anchor6 = at(6);
  const anchor24 = at(24);
  if (!anchor3 || !anchor6 || !anchor24) return null;

  const ret3hPct = (current.close / anchor3.close - 1) * 100;
  const ret6hPct = (current.close / anchor6.close - 1) * 100;
  const ret24hPct = (current.close / anchor24.close - 1) * 100;
  const prior24 = bars.slice(-25, -1);
  const priorMaxClose = Math.max(...prior24.map((bar) => bar.close));
  const priorMaxHigh = Math.max(...prior24.map((bar) => bar.high));
  const breakoutPct = (current.close / priorMaxClose - 1) * 100;
  const highBreakoutPct = (current.high / priorMaxHigh - 1) * 100;
  const priorVolume = median(prior24.map((bar) => bar.quoteVolume).filter((value) => Number.isFinite(value) && value > 0));
  const volumeRatio = priorVolume > 0 && Number(current.quoteVolume) > 0 ? current.quoteVolume / priorVolume : null;
  if (!Number.isFinite(volumeRatio)) return null;
  const last3 = bars.slice(-3);
  const last6 = bars.slice(-6);
  const green3 = last3.filter((bar) => bar.close > bar.open).length;
  const green6 = last6.filter((bar) => bar.close > bar.open).length;
  let higherHighs6 = 0;
  for (let index = 1; index < last6.length; index += 1) {
    if (last6[index].high > last6[index - 1].high) higherHighs6 += 1;
  }
  const closes = bars.map((bar) => bar.close);
  const ema13 = ema(closes, 13);
  const ema25 = ema(closes, 25);
  const trendAligned = Number.isFinite(ema13) && Number.isFinite(ema25)
    && current.close > ema13 && ema13 > ema25;
  const candleHighPct = (current.high / current.open - 1) * 100;
  const range = current.high - current.low;
  const upperWickPct = range > 0 ? (current.high - Math.max(current.open, current.close)) / range * 100 : 0;
  const retracePct = current.high > current.open
    ? (current.high - current.close) / (current.high - current.open) * 100
    : 0;
  const early = (ret3hPct >= rule.earlyRet3hPct || ret6hPct >= rule.earlyRet6hPct)
    && ret24hPct >= rule.earlyRet24hPct
    && volumeRatio >= rule.earlyVolumeRatio
    && breakoutPct >= rule.earlyBreakoutPct
    && green3 >= 2
    && trendAligned;
  const accelerating = (ret3hPct >= rule.acceleratingRet3hPct || ret6hPct >= rule.acceleratingRet6hPct)
    && volumeRatio >= rule.acceleratingVolumeRatio
    && breakoutPct >= rule.acceleratingBreakoutPct
    && green3 >= 2
    && trendAligned;
  const parabolic = (ret3hPct >= rule.dangerRet3hPct
    || ret6hPct >= rule.dangerRet6hPct
    || candleHighPct >= rule.dangerCandleHighPct)
    && volumeRatio >= rule.dangerVolumeRatio
    && Math.max(breakoutPct, highBreakoutPct) >= rule.dangerBreakoutPct;
  const exhaustion = parabolic
    && upperWickPct >= rule.exhaustionUpperWickPct
    && retracePct >= rule.exhaustionRetracePct;
  const stage = exhaustion
    ? 'PARABOLIC_EXHAUSTION'
    : parabolic
      ? 'PARABOLIC_DANGER'
      : accelerating
        ? 'MEGA_PUMP_ACCELERATING'
        : early
          ? 'MEGA_PUMP_EARLY'
          : null;
  if (!stage) return null;

  const score = Math.round(clamp(
    24 * clamp(ret3hPct / 100)
    + 24 * clamp(ret6hPct / 150)
    + 12 * clamp(ret24hPct / 300)
    + 14 * clamp(volumeRatio / 5)
    + 10 * clamp(breakoutPct / 25)
    + 6 * (green3 / 3)
    + 5 * (higherHighs6 / 5)
    + 5 * (trendAligned ? 1 : 0),
    0,
    100,
  ));
  return {
    version: MEGA_PUMP_STAIRCASE_VERSION,
    symbol: String(symbol).toUpperCase(),
    interval: '1h',
    stage,
    side: 'PUMP',
    score,
    observeOnly: true,
    candleAt: current.openTime,
    candleCloseAt: current.closeTime,
    observedAt: now,
    generatedAt: new Date(now).toISOString(),
    price: current.close,
    signalPrice: current.close,
    signalPriceSource: 'CLOSED_1H_FALLBACK',
    signalPriceVsClosePct: 0,
    open: current.open,
    high: current.high,
    low: current.low,
    quoteVolume: current.quoteVolume,
    ret3hPct,
    ret6hPct,
    ret24hPct,
    breakoutPct,
    highBreakoutPct,
    volumeRatio,
    green3,
    green6,
    higherHighs6,
    ema13,
    ema25,
    trendAligned,
    candleHighPct,
    upperWickPct,
    retracePct,
    dedupeKey: `${String(symbol).toUpperCase()}|${stage}`,
  };
}

const STYLES = Object.freeze({
  MEGA_PUMP_EARLY: {
    color: 0xfbbf24,
    icon: '🟡',
    priceBadge: '🟨',
    title: 'MEGA PUMP EARLY · BẮT ĐẦU TĂNG BẬC THANG',
    action: 'Theo dõi, chưa đuổi giá. Chờ nến đóng/retest nếu muốn đánh giá entry thủ công.',
  },
  MEGA_PUMP_ACCELERATING: {
    color: 0xf97316,
    icon: '🟠',
    priceBadge: '🟧',
    title: 'MEGA PUMP ACCELERATING · SÓNG ĐANG TĂNG TỐC',
    action: 'Rủi ro squeeze tăng mạnh: né mở SHORT mới và không đuổi LONG ở nến dựng.',
  },
  PARABOLIC_DANGER: {
    color: 0xef4444,
    icon: '🚨',
    priceBadge: '🟥',
    title: 'PARABOLIC DANGER · TĂNG DỐC ĐỨNG',
    action: 'Nguy hiểm cao: không đuổi LONG, không bắt đỉnh SHORT khi chưa có reject xác nhận.',
  },
  PARABOLIC_EXHAUSTION: {
    color: 0xa855f7,
    icon: '☠️',
    priceBadge: '🟪',
    title: 'PARABOLIC EXHAUSTION · RÚT ĐỈNH MẠNH',
    action: 'Có dấu hiệu trả lại nhịp bơm; vẫn không SHORT market mù, cần reject/retest riêng.',
  },
});

export function megaPumpStaircasePayload(event) {
  const style = STYLES[event.stage];
  return {
    username: 'Market Shock Guard',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${style.icon} ${event.symbol} · ${style.title}`,
      color: style.color,
      description: `**${style.action}**\nOBSERVE ONLY — không tự đặt/chặn/đóng lệnh Binance. Detector nhận diện hình thái giống LSK; không dự đoán coin chắc chắn tăng 1.000%.`,
      fields: [
        {
          name: `${style.priceBadge} GIÁ LÚC PHÁT TÍN HIỆU`,
          value: `**${style.priceBadge} \`${number(event.signalPrice ?? event.price)} USDT\`**\nClose nến 1h xác nhận: **${number(event.price)}** · lệch ${pct(event.signalPriceVsClosePct, 2)}\nNguồn: **${event.signalPriceSource === 'BINANCE_MARKET_SNAPSHOT' ? 'snapshot Binance lúc phát' : 'close nến 1h fallback'}**`,
          inline: false,
        },
        {
          name: '📈 ĐÀ TĂNG LŨY KẾ',
          value: `3h **${pct(event.ret3hPct)}** · 6h **${pct(event.ret6hPct)}** · 24h **${pct(event.ret24hPct)}**\nBreakout close 24h **${pct(event.breakoutPct)}** · breakout high **${pct(event.highBreakoutPct)}**\nĐiểm hình thái **${event.score}/100**`,
          inline: false,
        },
        {
          name: '🔥 VOLUME / CẤU TRÚC',
          value: `Volume nến cuối **${event.volumeRatio.toFixed(2)}× median 24h** · ${compact(event.quoteVolume)} USDT\nNến xanh 3h: **${event.green3}/3** · 6h: **${event.green6}/6** · higher-high: **${event.higherHighs6}/5**\nClose > EMA13 > EMA25: **${event.trendAligned ? 'CÓ' : 'KHÔNG'}**`,
          inline: false,
        },
        {
          name: '💰 GIÁ / RÚT ĐỈNH',
          value: `Open ${number(event.open)} · High **${number(event.high)}** · Close xác nhận 1h **${number(event.price)}**\nHigh/open ${pct(event.candleHighPct)} · râu trên ${event.upperWickPct.toFixed(1)}% · trả lại open→high ${event.retracePct.toFixed(1)}%`,
          inline: false,
        },
        {
          name: '🕒 THỜI ĐIỂM VIỆT NAM',
          value: `Nến 1h mở ${vn(event.candleAt)}\nĐánh giá ${vn(event.observedAt)} · ${event.stage}`,
          inline: false,
        },
        {
          name: 'MỞ BIỂU ĐỒ',
          value: `[Binance](https://www.binance.com/en/futures/${encodeURIComponent(event.symbol)})`,
          inline: false,
        },
      ],
      timestamp: event.generatedAt,
      footer: { text: `${MEGA_PUMP_STAIRCASE_VERSION} · closed 1h only · cảnh báo, không phải entry` },
    }],
  };
}

export class MegaPumpStaircaseDiscordNotifier {
  constructor({ stateFile, webhookUrl = () => '', now = () => Date.now(), fetchImpl = fetch, cooldownMs = 6 * HOUR_MS } = {}) {
    Object.assign(this, { stateFile, webhookUrl, now, fetchImpl, cooldownMs });
    this.queue = Promise.resolve();
    this.memory = null;
    this.retryAfter = 0;
  }

  notify(event) {
    const job = this.queue.catch(() => {}).then(() => this.process(event));
    this.queue = job;
    return job;
  }

  async process(event) {
    const now = this.now();
    if (!event || event.version !== MEGA_PUMP_STAIRCASE_VERSION || event.observeOnly !== true
      || !STYLES[event.stage] || event.side !== 'PUMP'
      || !Number.isFinite(event.observedAt) || now - event.observedAt > 90_000) {
      return { sent: 0, reason: 'invalid_or_stale' };
    }
    const url = String(typeof this.webhookUrl === 'function' ? this.webhookUrl() : this.webhookUrl).trim();
    if (!url) return { sent: 0, reason: 'not_configured' };
    if (now < this.retryAfter) return { sent: 0, reason: 'backoff' };
    if (!this.memory) {
      try {
        this.memory = JSON.parse(await readFile(this.stateFile, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        this.memory = { alerts: {} };
      }
    }
    this.memory.alerts ??= {};
    const key = event.dedupeKey ?? `${event.symbol}|${event.stage}`;
    const priorAt = Number(this.memory.alerts[key] ?? 0);
    if (priorAt > 0 && now - priorAt < this.cooldownMs) return { sent: 0, reason: 'deduped' };
    let response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(megaPumpStaircasePayload(event)),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      this.retryAfter = now + 60_000;
      throw new Error('Mega pump Discord network failure; retry delayed');
    }
    if (!response.ok) {
      const rate = response.status === 429 ? await response.json().catch(() => ({})) : {};
      this.retryAfter = now + Math.max(60_000, Math.min(HOUR_MS, Number(rate.retry_after ?? 0) * 1_000));
      throw new Error(`Mega pump Discord HTTP ${response.status}`);
    }
    this.memory.alerts[key] = now;
    this.memory.version = MEGA_PUMP_STAIRCASE_VERSION;
    this.memory.updatedAt = new Date(now).toISOString();
    this.memory.alerts = Object.fromEntries(Object.entries(this.memory.alerts)
      .filter(([, sentAt]) => now - Number(sentAt) < 7 * 24 * HOUR_MS));
    await mkdir(dirname(this.stateFile), { recursive: true });
    const temp = `${this.stateFile}.tmp`;
    await writeFile(temp, JSON.stringify(this.memory, null, 2), 'utf8');
    await rename(temp, this.stateFile);
    return { sent: 1, reason: 'sent', symbol: event.symbol, stage: event.stage };
  }
}

export async function scanMegaPumpStaircase(symbols, klineCache, notify, {
  now = Date.now(),
  maxAlerts = 10,
  config = {},
  signalPrices = null,
} = {}) {
  const events = [];
  let processed = 0;
  for (const symbol of [...new Set(Array.isArray(symbols) ? symbols : [])]) {
    const rows = klineCache?.getIfCached?.(symbol, '1h', 72);
    if (!Array.isArray(rows) || rows.length < (config.minBars ?? MEGA_PUMP_STAIRCASE_RULE.minBars)) continue;
    processed += 1;
    const event = detectMegaPumpStaircase(rows, { symbol, now, config });
    if (event) {
      const key = String(symbol).toUpperCase();
      const snapshotPrice = Number(signalPrices instanceof Map ? signalPrices.get(key) : signalPrices?.[key]);
      const hasSnapshotPrice = Number.isFinite(snapshotPrice) && snapshotPrice > 0;
      const signalPrice = hasSnapshotPrice ? snapshotPrice : event.price;
      events.push({
        ...event,
        signalPrice,
        signalPriceSource: hasSnapshotPrice ? 'BINANCE_MARKET_SNAPSHOT' : 'CLOSED_1H_FALLBACK',
        signalPriceVsClosePct: event.price > 0 ? (signalPrice / event.price - 1) * 100 : 0,
      });
    }
  }
  events.sort((a, b) => b.score - a.score || b.ret6hPct - a.ret6hPct);
  let sent = 0;
  let failed = 0;
  for (const event of events.slice(0, Math.max(1, maxAlerts))) {
    try {
      sent += Number((await notify(event))?.sent ?? 0);
    } catch {
      failed += 1;
    }
  }
  return { processed, detected: events.length, sent, failed, top: events.slice(0, 10) };
}
