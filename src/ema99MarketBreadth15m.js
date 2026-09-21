import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { BreadthAlertStability, breadthDeliveryDecision, recordBreadthDelivery,
  breadthContextText, breadthConfirmationText, freshBreadthSymbol } from './breadthAlertStability.js';

export const EMA99_MARKET_BREADTH_15M_VERSION = 'EMA99_MARKET_BREADTH_15M_V2_20260913';

export const EMA99_MARKET_BREADTH_15M_DEFAULTS = Object.freeze({
  maxSymbols: 400,
  minQuoteVolume: 1_000_000,
  minSamples: 60,
  minCoveragePct: 20,
  minimumNearPct: 0.30,
  maximumNearPct: 1.50,
  atrNearMultiplier: 0.75,
  minProgressPct: 0.05,
  watchCount: 8,
  dangerCount: 15,
  dangerSharePct: 10,
  minimumDominancePct: 65,
  watchPersistenceSamples: 2,
  persistenceMs: 90_000,
});

const FIFTEEN_MINUTES = 15 * 60_000;
const ALPHA_99 = 2 / 100;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value) => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const number = (value) => Number.isFinite(value) ? Number(value.toFixed(8)).toString() : '--';
const pct = (value, digits = 2) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%` : '--';

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
    closeTime: valueOf(row, 'closeTime', 6),
  };
  if (![bar.openTime, bar.open, bar.high, bar.low, bar.close, bar.closeTime].every(Number.isFinite)
    || bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0
    || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) return null;
  return bar;
}

function ema99(values) {
  if (values.length < 99) return null;
  let result = values.slice(0, 99).reduce((sum, value) => sum + value, 0) / 99;
  for (const value of values.slice(99)) result = value * ALPHA_99 + result * (1 - ALPHA_99);
  return result;
}

function trueRangeAverage(bars) {
  const recent = bars.slice(-15);
  if (recent.length < 15) return null;
  const ranges = [];
  for (let index = 1; index < recent.length; index += 1) {
    const current = recent[index];
    const previous = recent[index - 1];
    ranges.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    ));
  }
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function currentMarketPrice(row) {
  return finite(row?.markPrice ?? row?.lastPrice ?? row?.price);
}

function validClosedBars(rows, now) {
  const closed = (Array.isArray(rows) ? rows : [])
    .map(normalizeBar)
    .filter((bar) => bar && bar.closeTime < now)
    .sort((a, b) => a.openTime - b.openTime)
    .slice(-130);
  if (closed.length < 100) return null;
  const lastClosed = closed.at(-1);
  if (now - lastClosed.closeTime > FIFTEEN_MINUTES + 90_000) return null;
  for (let index = Math.max(1, closed.length - 100); index < closed.length; index += 1) {
    if (Math.abs(closed[index].openTime - closed[index - 1].openTime - FIFTEEN_MINUTES) > 1_000) return null;
  }
  return closed;
}

export function evaluateEma99Approach15m(market, rows, now = Date.now(), config = {}) {
  const rule = { ...EMA99_MARKET_BREADTH_15M_DEFAULTS, ...config };
  const symbol = String(market?.symbol ?? '').trim().toUpperCase();
  const markPrice = currentMarketPrice(market);
  if (!symbol.endsWith('USDT') || !(markPrice > 0)) return null;
  const closed = validClosedBars(rows, now);
  if (!closed) return null;
  const lastClosed = closed.at(-1);
  const closedEma99 = ema99(closed.map((bar) => bar.close));
  const atr14 = trueRangeAverage(closed);
  if (!(closedEma99 > 0) || !(atr14 > 0)) return null;
  const projectedEma99 = markPrice * ALPHA_99 + closedEma99 * (1 - ALPHA_99);
  const previousDistancePct = (lastClosed.close / closedEma99 - 1) * 100;
  const distancePct = (markPrice / projectedEma99 - 1) * 100;
  if (previousDistancePct === 0 || distancePct === 0 || Math.sign(previousDistancePct) !== Math.sign(distancePct)) return null;
  const nearLimitPct = clamp(
    rule.atrNearMultiplier * atr14 / projectedEma99 * 100,
    rule.minimumNearPct,
    rule.maximumNearPct,
  );
  const absoluteDistancePct = Math.abs(distancePct);
  const progressPct = Math.abs(previousDistancePct) - absoluteDistancePct;
  if (absoluteDistancePct > nearLimitPct || progressPct < rule.minProgressPct) return null;
  const direction = distancePct < 0 ? 'FROM_BELOW' : 'FROM_ABOVE';
  return {
    symbol,
    direction,
    markPrice,
    ema99: projectedEma99,
    distancePct,
    absoluteDistancePct,
    previousDistancePct,
    progressPct,
    nearLimitPct,
    atrPct: atr14 / projectedEma99 * 100,
  };
}

export function collectEma99MarketBreadth15m({
  marketRows = [],
  klineCache,
  now = Date.now(),
  config = {},
  context = null,
} = {}) {
  const rule = { ...EMA99_MARKET_BREADTH_15M_DEFAULTS, ...config };
  const universe = [...marketRows]
    .filter((row) => String(row?.symbol ?? '').toUpperCase().endsWith('USDT'))
    .filter((row) => Number(row?.quoteVolume ?? 0) >= rule.minQuoteVolume)
    .sort((a, b) => Number(b.quoteVolume ?? 0) - Number(a.quoteVolume ?? 0))
    .slice(0, rule.maxSymbols);
  const approaches = [];
  let processed = 0;
  for (const market of universe) {
    const rows = klineCache?.getIfCached?.(market.symbol, '15m', 130);
    if (!validClosedBars(rows, now)) continue;
    // Same live 5m price source as Market Shock; never mix an old REST mark with live breadth.
    if (!freshBreadthSymbol(klineCache, market.symbol, '5m', now, 45_000)) continue;
    const priceBar = normalizeBar(klineCache?.getIfCached?.(market.symbol, '5m', 1)?.at(-1));
    if (!priceBar || priceBar.openTime > now || now - priceBar.closeTime > 90_000) continue;
    processed += 1;
    const approach = evaluateEma99Approach15m({ ...market, markPrice: priceBar.close }, rows, now, rule);
    if (approach) approaches.push(approach);
  }
  const fromBelow = approaches
    .filter((row) => row.direction === 'FROM_BELOW')
    .sort((a, b) => a.absoluteDistancePct - b.absoluteDistancePct || b.progressPct - a.progressPct);
  const fromAbove = approaches
    .filter((row) => row.direction === 'FROM_ABOVE')
    .sort((a, b) => a.absoluteDistancePct - b.absoluteDistancePct || b.progressPct - a.progressPct);
  const requested = universe.length;
  return {
    version: EMA99_MARKET_BREADTH_15M_VERSION,
    evaluatedAt: now,
    context,
    priceSource: 'LIVE_5M_LAST_PRICE',
    requested,
    processed,
    coveragePct: requested ? processed / requested * 100 : 0,
    socketFresh: Number(klineCache?.stats?.('15m')?.staleSec ?? Infinity) <= 90,
    approaches,
    fromBelow,
    fromAbove,
    nearCount: approaches.length,
    nearSharePct: processed ? approaches.length / processed * 100 : 0,
    fromBelowCount: fromBelow.length,
    fromAboveCount: fromAbove.length,
  };
}

export function classifyEma99MarketBreadth15m(metrics, { config = {} } = {}) {
  const rule = { ...EMA99_MARKET_BREADTH_15M_DEFAULTS, ...config };
  if (!metrics || metrics.version !== EMA99_MARKET_BREADTH_15M_VERSION
    || metrics.socketFresh !== true || metrics.processed < rule.minSamples
    || metrics.coveragePct < rule.minCoveragePct) return null;
  const direction = metrics.fromBelowCount >= metrics.fromAboveCount ? 'FROM_BELOW' : 'FROM_ABOVE';
  const dominantCount = Math.max(metrics.fromBelowCount, metrics.fromAboveCount);
  const oppositeCount = Math.min(metrics.fromBelowCount, metrics.fromAboveCount);
  const dominancePct = dominantCount / Math.max(1, metrics.nearCount) * 100;
  const dominantSharePct = dominantCount / metrics.processed * 100;
  if (dominantCount < rule.watchCount || dominancePct < rule.minimumDominancePct) return null;
  const severity = dominantCount >= rule.dangerCount || dominantSharePct >= rule.dangerSharePct
    ? 'DANGER'
    : 'WATCH';
  const dominant = direction === 'FROM_BELOW' ? metrics.fromBelow : metrics.fromAbove;
  const averageDistancePct = dominant.reduce((sum, row) => sum + row.absoluteDistancePct, 0) / dominant.length;
  const averageProgressPct = dominant.reduce((sum, row) => sum + row.progressPct, 0) / dominant.length;
  const score = Math.round(clamp(
    35 + 30 * clamp((dominantCount - rule.watchCount) / Math.max(1, rule.dangerCount - rule.watchCount), 0, 1)
      + 20 * clamp((dominancePct - rule.minimumDominancePct) / (100 - rule.minimumDominancePct), 0, 1)
      + 15 * clamp(averageProgressPct / 0.5, 0, 1),
    0,
    100,
  ));
  return {
    ...metrics,
    direction,
    severity,
    dominantCount,
    oppositeCount,
    dominancePct,
    dominantSharePct,
    averageDistancePct,
    averageProgressPct,
    score,
    observeOnly: true,
  };
}

export class Ema99MarketBreadth15mDetector {
  constructor({ config = {}, now = () => Date.now() } = {}) {
    this.config = { ...EMA99_MARKET_BREADTH_15M_DEFAULTS, ...config };
    this.now = now;
    this.stability = new BreadthAlertStability({ confirmMs: this.config.persistenceMs, minSamples: this.config.watchPersistenceSamples });
  }

  observe(metrics) {
    const candidate = classifyEma99MarketBreadth15m(metrics, { config: this.config });
    return this.stability.observe(candidate, metrics?.evaluatedAt, this.now());
  }
}

function coinLines(rows, limit = 20) {
  return rows.slice(0, limit).map((row) => (
    `**${row.symbol.replace(/USDT$/, '')}** · giá ${number(row.markPrice)} · EMA ${number(row.ema99)}`
    + ` · cách ${row.absoluteDistancePct.toFixed(2)}% · tiến gần ${row.progressPct.toFixed(2)}%`
  )).join('\n') || '--';
}

export function ema99MarketBreadth15mPayload(event) {
  const fromBelow = event.direction === 'FROM_BELOW';
  const danger = event.severity === 'DANGER';
  const color = fromBelow ? 0xf59e0b : 0x22d3ee;
  const directionText = fromBelow ? 'TỪ DƯỚI TIẾN LÊN EMA99 · TIẾP CẬN KHÁNG CỰ' : 'TỪ TRÊN LÙI XUỐNG EMA99 · KIỂM TRA HỖ TRỢ';
  const dominant = fromBelow ? event.fromBelow : event.fromAbove;
  const opposite = fromBelow ? event.fromAbove : event.fromBelow;
  return {
    username: 'Market Shock Guard',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${fromBelow ? '🟡' : '🔵'} EMA99 15M · ${danger ? 'HỘI TỤ MẠNH' : 'THEO DÕI HỘI TỤ'}`,
      color,
      description: `**${directionText}**\n**Không phải tín hiệu bơm/xả toàn thị trường.** Chỉ nhóm **${event.dominantCount}/${event.processed} coin (${event.dominantSharePct.toFixed(1)}%)** đang tiến gần cùng phía EMA.\nOBSERVE ONLY — không tự đặt/chặn/đóng lệnh Binance. Gần EMA99 chưa phải xác nhận LONG/SHORT.`,
      fields: [
        {
          name: '🌐 ĐỘ RỘNG EMA99 15M',
          value: `Điểm hội tụ **${event.score}/100** · gần EMA **${event.nearCount}/${event.processed} coin (${event.nearSharePct.toFixed(1)}%)**\nTừ dưới: **${event.fromBelowCount}** · từ trên: **${event.fromAboveCount}** · tỷ lệ hướng chính TRONG NHÓM GẦN EMA **${event.dominancePct.toFixed(1)}%**\nKhoảng cách TB hướng chính **${event.averageDistancePct.toFixed(2)}%** · mức tiến gần TB **${event.averageProgressPct.toFixed(2)}%**`,
          inline: false,
        },
        { name: '🧭 BỐI CẢNH THỊ TRƯỜNG 15–30 PHÚT', value: breadthContextText(event.context), inline: false },
        { name: '⏱️ XÁC NHẬN HỘI TỤ', value: breadthConfirmationText(event), inline: false },
        {
          name: `${fromBelow ? '⬆️' : '⬇️'} NHÓM HƯỚNG CHÍNH · ${dominant.length}`,
          value: coinLines(dominant).slice(0, 1024),
          inline: false,
        },
        ...(opposite.length ? [{
          name: `↔️ NHÓM NGƯỢC HƯỚNG · ${opposite.length}`,
          value: coinLines(opposite, 8).slice(0, 1024),
          inline: false,
        }] : []),
        {
          name: '🧭 CÁCH ĐỌC',
          value: fromBelow
            ? 'Nhiều coin đang hồi từ dưới lên sát EMA99 15m: có thể gặp kháng cự/reject, nhưng chỉ xét SHORT sau nến đóng reject hoặc retest thất bại.'
            : 'Nhiều coin đang điều chỉnh từ trên xuống sát EMA99 15m: có thể test hỗ trợ; chỉ xét LONG khi giữ/reclaim, và đề phòng breakdown nếu nến đóng mất EMA.',
          inline: false,
        },
        {
          name: '📡 ĐỘ PHỦ',
          value: `Đã đọc **${event.processed}/${event.requested}** coin (${event.coveragePct.toFixed(1)}%) · EMA từ nến 15m đóng + last price live 5m (không phải mark price); chỉ dùng coin có tick ≤45 giây.`,
          inline: false,
        },
      ],
      timestamp: event.generatedAt,
      footer: { text: `${EMA99_MARKET_BREADTH_15M_VERSION} · cảnh báo tổng hợp, không phải entry` },
    }],
  };
}

export class Ema99MarketBreadth15mDiscordNotifier {
  constructor({ stateFile, webhookUrl = () => '', now = () => Date.now(), fetchImpl = fetch, cooldownMs = 30 * 60_000 } = {}) {
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
    if (!event || event.version !== EMA99_MARKET_BREADTH_15M_VERSION || event.observeOnly !== true
      || !['FROM_BELOW', 'FROM_ABOVE'].includes(event.direction)
      || !['WATCH', 'DANGER'].includes(event.severity)
      || !Number.isFinite(event.observedAt) || now - event.observedAt > 90_000 || now < event.observedAt) {
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
    const key = `${event.direction}|${event.severity}`;
    const delivery = breadthDeliveryDecision(this.memory, event, now, this.cooldownMs);
    if (delivery.reason) return { sent: 0, reason: delivery.reason };
    event = { ...event, previousAlert: delivery.previous };
    let response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ema99MarketBreadth15mPayload(event)),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      this.retryAfter = now + 60_000;
      throw new Error('EMA99 15m breadth Discord network failure; retry delayed');
    }
    if (!response.ok) {
      const rate = response.status === 429 ? await response.json().catch(() => ({})) : {};
      this.retryAfter = now + Math.max(60_000, Math.min(3_600_000, Number(rate.retry_after ?? 0) * 1_000));
      throw new Error(`EMA99 15m breadth Discord HTTP ${response.status}`);
    }
    this.memory.alerts[key] = now;
    recordBreadthDelivery(this.memory, event, now);
    this.memory.version = EMA99_MARKET_BREADTH_15M_VERSION;
    this.memory.updatedAt = new Date(now).toISOString();
    this.memory.alerts = Object.fromEntries(Object.entries(this.memory.alerts)
      .filter(([, sentAt]) => now - Number(sentAt) < 7 * 24 * 60 * 60_000));
    await mkdir(dirname(this.stateFile), { recursive: true });
    const temp = `${this.stateFile}.tmp`;
    await writeFile(temp, JSON.stringify(this.memory, null, 2), 'utf8');
    await rename(temp, this.stateFile);
    return { sent: 1, reason: 'sent', direction: event.direction, severity: event.severity };
  }
}
