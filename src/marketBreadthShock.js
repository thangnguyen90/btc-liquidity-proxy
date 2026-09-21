import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { BreadthAlertStability, breadthDeliveryDecision, recordBreadthDelivery,
  breadthContextText, breadthPhase, breadthConfirmationText, freshBreadthSymbol } from './breadthAlertStability.js';

export const MARKET_BREADTH_SHOCK_VERSION = 'MARKET_BREADTH_SHOCK_5M_V2_20260913';

export const MARKET_BREADTH_SHOCK_DEFAULTS = Object.freeze({
  maxSymbols: 400,
  minQuoteVolume: 1_000_000,
  minSamples: 60,
  minCoveragePct: 20,
  movePct: 0.30,
  strongMovePct: 0.75,
  volumeRatio: 1.5,
  watchScore: 58,
  dangerScore: 78,
  persistenceSamples: 2,
  persistenceMs: 60_000,
});

const FIVE_MINUTES = 5 * 60_000;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const finite = (value) => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const pct = (value, digits = 1) => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%` : '--';
const compact = (value) => Number.isFinite(value)
  ? Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
  : '--';

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
    takerBuyQuoteVolume: valueOf(row, 'takerBuyQuoteVolume', 10),
  };
  if (![bar.openTime, bar.open, bar.high, bar.low, bar.close, bar.closeTime].every(Number.isFinite)
    || bar.open <= 0 || bar.close <= 0 || bar.high < bar.low) return null;
  if (!Number.isFinite(bar.quoteVolume) && Number.isFinite(bar.volume)) {
    bar.quoteVolume = bar.volume * bar.close;
  }
  return bar;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function chooseRecentMove(current, previous) {
  const currentPct = (current.close / current.open - 1) * 100;
  if (!previous) return { movePct: currentPct, window: 'CURRENT_5M' };
  const twoBarPct = (current.close / previous.open - 1) * 100;
  // Keep the current candle when it has reversed the previous candle. Otherwise retain
  // the larger same-direction 5-10m impulse so a shock is not lost at a 5m boundary.
  if (Math.sign(currentPct) !== 0 && Math.sign(currentPct) !== Math.sign(twoBarPct)) {
    return { movePct: currentPct, window: 'CURRENT_5M' };
  }
  return Math.abs(twoBarPct) > Math.abs(currentPct)
    ? { movePct: twoBarPct, window: 'ROLLING_5_10M' }
    : { movePct: currentPct, window: 'CURRENT_5M' };
}

function projectedVolumeRatio(rows, current, now) {
  const prior = rows.slice(-21, -1)
    .map(normalizeBar)
    .filter(Boolean)
    .map((bar) => bar.quoteVolume)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (prior.length < 3 || !Number.isFinite(current.quoteVolume) || current.quoteVolume <= 0) return null;
  const average = prior.reduce((sum, value) => sum + value, 0) / prior.length;
  if (!(average > 0)) return null;
  const live = current.closeTime >= now;
  const elapsedRatio = live
    ? clamp((now - current.openTime) / FIVE_MINUTES, 0.15, 1)
    : 1;
  return current.quoteVolume / elapsedRatio / average;
}

function leaderSummary(samples, direction) {
  const leaderSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  return leaderSymbols.map((symbol) => {
    const row = samples.find((item) => item.symbol === symbol);
    const confirms = row
      ? (direction === 'PUMP' ? row.movePct > 0.10 : row.movePct < -0.10)
      : false;
    return { symbol, movePct: row?.movePct ?? null, confirms };
  });
}

function contextMove(rows, current, now, minutes) {
  const bars = rows.map(normalizeBar).filter(Boolean);
  const target = now - minutes * 60_000;
  const index = bars.findLastIndex((bar) => bar.closeTime <= target);
  if (index < 0 || target - bars[index].closeTime > FIVE_MINUTES) return null;
  for (let i = index + 1; i < bars.length; i += 1) {
    if (bars[i].openTime - bars[i - 1].openTime !== FIVE_MINUTES) return null;
  }
  return (current.close / bars[index].close - 1) * 100;
}

function contextSummary(samples, minutes, minSamples) {
  const values = samples.map((row) => row.contextMoves[`${minutes}m`]).filter(Number.isFinite);
  const processed = values.length;
  const upCount = values.filter((v) => v >= 0.10).length;
  const downCount = values.filter((v) => v <= -0.10).length;
  const medianMovePct = processed ? median(values) : null;
  const complete = processed >= minSamples && processed >= samples.length * 0.60;
  const direction = !complete ? 'UNKNOWN'
    : upCount / processed >= 0.60 && medianMovePct >= 0.10 ? 'UP'
      : downCount / processed >= 0.60 && medianMovePct <= -0.10 ? 'DOWN' : 'MIXED';
  return { minutes, processed, upCount, downCount, medianMovePct, direction };
}

export function collectMarketBreadthShockMetrics({
  marketRows = [],
  klineCache,
  now = Date.now(),
  config = {},
} = {}) {
  const rule = { ...MARKET_BREADTH_SHOCK_DEFAULTS, ...config };
  const universe = [...marketRows]
    .filter((row) => String(row?.symbol ?? '').toUpperCase().endsWith('USDT'))
    .filter((row) => Number(row?.quoteVolume ?? 0) >= rule.minQuoteVolume)
    .sort((a, b) => Number(b.quoteVolume ?? 0) - Number(a.quoteVolume ?? 0))
    .slice(0, rule.maxSymbols);
  const samples = [];

  for (const market of universe) {
    const symbol = String(market.symbol).toUpperCase();
    const rows = klineCache?.getIfCached?.(symbol, '5m', 22);
    if (!Array.isArray(rows) || !rows.length) continue;
    if (!freshBreadthSymbol(klineCache, symbol, '5m', now, 45_000)) continue;
    const current = normalizeBar(rows.at(-1));
    const previous = normalizeBar(rows.at(-2));
    if (!current || current.openTime > now || now - current.closeTime > 90_000) continue;
    const recentMove = chooseRecentMove(current,
      previous && current.openTime - previous.openTime === FIVE_MINUTES ? previous : null);
    const takerRatio = Number.isFinite(current.takerBuyQuoteVolume)
      && Number.isFinite(current.quoteVolume) && current.quoteVolume > 0
      ? current.takerBuyQuoteVolume / current.quoteVolume
      : null;
    samples.push({
      symbol,
      movePct: recentMove.movePct,
      window: recentMove.window,
      quoteVolume: current.quoteVolume,
      takerBuyRatio: takerRatio,
      projectedVolumeRatio: projectedVolumeRatio(rows, current, now),
      contextMoves: { '15m': contextMove(rows, current, now, 15), '30m': contextMove(rows, current, now, 30) },
    });
  }

  const moves = samples.map((row) => row.movePct);
  const up = samples.filter((row) => row.movePct >= rule.movePct);
  const down = samples.filter((row) => row.movePct <= -rule.movePct);
  const strongUp = samples.filter((row) => row.movePct >= rule.strongMovePct);
  const strongDown = samples.filter((row) => row.movePct <= -rule.strongMovePct);
  const volumeUp = strongUp.filter((row) => Number(row.projectedVolumeRatio ?? 0) >= rule.volumeRatio);
  const volumeDown = strongDown.filter((row) => Number(row.projectedVolumeRatio ?? 0) >= rule.volumeRatio);
  const flowRows = samples.filter((row) => Number.isFinite(row.takerBuyRatio) && Number(row.quoteVolume) > 0);
  const flowQuote = flowRows.reduce((sum, row) => sum + row.quoteVolume, 0);
  const takerBuyRatio = flowQuote > 0
    ? flowRows.reduce((sum, row) => sum + row.quoteVolume * row.takerBuyRatio, 0) / flowQuote
    : null;
  const processed = samples.length;
  const coveragePct = universe.length ? processed / universe.length * 100 : 0;
  const topUp = [...samples].sort((a, b) => b.movePct - a.movePct).slice(0, 5);
  const topDown = [...samples].sort((a, b) => a.movePct - b.movePct).slice(0, 5);
  const waveUp = [...strongUp].sort((a, b) => b.movePct - a.movePct).slice(0, 30);
  const waveDown = [...strongDown].sort((a, b) => a.movePct - b.movePct).slice(0, 30);

  return {
    version: MARKET_BREADTH_SHOCK_VERSION,
    evaluatedAt: now,
    requested: universe.length,
    processed,
    coveragePct,
    context: { '15m': contextSummary(samples, 15, rule.minSamples), '30m': contextSummary(samples, 30, rule.minSamples) },
    socketFresh: Number(klineCache?.stats?.('5m')?.staleSec ?? Infinity) <= 45,
    medianMovePct: median(moves),
    takerBuyRatio,
    upCount: up.length,
    downCount: down.length,
    strongUpCount: strongUp.length,
    strongDownCount: strongDown.length,
    volumeUpCount: volumeUp.length,
    volumeDownCount: volumeDown.length,
    upPct: processed ? up.length / processed * 100 : 0,
    downPct: processed ? down.length / processed * 100 : 0,
    strongUpPct: processed ? strongUp.length / processed * 100 : 0,
    strongDownPct: processed ? strongDown.length / processed * 100 : 0,
    volumeUpPct: processed ? volumeUp.length / processed * 100 : 0,
    volumeDownPct: processed ? volumeDown.length / processed * 100 : 0,
    leaders: {
      pump: leaderSummary(samples, 'PUMP'),
      dump: leaderSummary(samples, 'DUMP'),
    },
    topUp,
    topDown,
    waveUp,
    waveDown,
  };
}

function accelerationFor(direction, metrics, previous) {
  if (!previous) return { ratio: 1, ageMs: null };
  const current = direction === 'PUMP' ? metrics.strongUpCount : metrics.strongDownCount;
  const before = direction === 'PUMP' ? previous.strongUpCount : previous.strongDownCount;
  return {
    ratio: current / Math.max(3, before),
    ageMs: metrics.evaluatedAt - previous.evaluatedAt,
  };
}

export function classifyMarketBreadthShock(metrics, { previous = null, config = {} } = {}) {
  const rule = { ...MARKET_BREADTH_SHOCK_DEFAULTS, ...config };
  if (!metrics || metrics.version !== MARKET_BREADTH_SHOCK_VERSION
    || metrics.socketFresh !== true
    || metrics.processed < rule.minSamples
    || metrics.coveragePct < rule.minCoveragePct) return null;

  const direction = metrics.strongUpCount === metrics.strongDownCount
    ? (metrics.upCount > metrics.downCount ? 'PUMP' : metrics.downCount > metrics.upCount ? 'DUMP' : null)
    : metrics.strongUpCount > metrics.strongDownCount ? 'PUMP' : 'DUMP';
  if (!direction) return null;
  const isPump = direction === 'PUMP';
  const sideCount = isPump ? metrics.upCount : metrics.downCount;
  const oppositeCount = isPump ? metrics.downCount : metrics.upCount;
  const strongCount = isPump ? metrics.strongUpCount : metrics.strongDownCount;
  const oppositeStrong = isPump ? metrics.strongDownCount : metrics.strongUpCount;
  const volumeCount = isPump ? metrics.volumeUpCount : metrics.volumeDownCount;
  const directionalShare = sideCount / metrics.processed;
  const strongShare = strongCount / metrics.processed;
  const volumeShare = volumeCount / metrics.processed;
  const dominance = sideCount / Math.max(1, sideCount + oppositeCount);
  const strongDominance = strongCount / Math.max(1, strongCount + oppositeStrong);
  const leaders = isPump ? metrics.leaders.pump : metrics.leaders.dump;
  const leaderConfirmCount = leaders.filter((row) => row.confirms).length;
  const directionalTaker = Number.isFinite(metrics.takerBuyRatio)
    ? (isPump ? metrics.takerBuyRatio : 1 - metrics.takerBuyRatio)
    : 0.5;
  const directionalMedian = isPump ? metrics.medianMovePct : -metrics.medianMovePct;
  const acceleration = accelerationFor(direction, metrics, previous);

  const score = Math.round(clamp(
    28 * clamp((directionalShare - 0.08) / 0.27)
    + 28 * clamp((strongShare - 0.025) / 0.15)
    + 14 * clamp((Math.max(dominance, strongDominance) - 0.55) / 0.35)
    + 10 * clamp((volumeShare - 0.01) / 0.08)
    + 8 * clamp((directionalTaker - 0.50) / 0.08)
    + 7 * clamp((directionalMedian - 0.03) / 0.42)
    + 5 * (leaderConfirmCount / 3)
    + 8 * clamp((acceleration.ratio - 1.15) / 1.35),
    0,
    100,
  ));
  const minimumBreadth = sideCount >= Math.max(12, Math.ceil(metrics.processed * 0.12));
  const minimumImpulse = strongCount >= Math.max(6, Math.ceil(metrics.processed * 0.035));
  const minimumDominance = Math.max(dominance, strongDominance) >= 0.62;
  if (!minimumBreadth || !minimumImpulse || !minimumDominance || score < rule.watchScore) return null;

  const dangerFlow = directionalTaker >= 0.54 || volumeShare >= 0.06 || leaderConfirmCount >= 2;
  const severity = score >= rule.dangerScore
    && strongShare >= 0.09
    && dominance >= 0.70
    && dangerFlow
    ? 'DANGER'
    : 'WATCH';
  return {
    ...metrics,
    direction,
    severity,
    score,
    side: `${direction}_${severity}`,
    sideCount,
    oppositeCount,
    strongCount,
    oppositeStrong,
    volumeCount,
    directionalSharePct: directionalShare * 100,
    strongSharePct: strongShare * 100,
    volumeSharePct: volumeShare * 100,
    dominancePct: dominance * 100,
    directionalTakerRatio: directionalTaker,
    leaderConfirmCount,
    accelerationRatio: acceleration.ratio,
    accelerationAgeMs: acceleration.ageMs,
    observeOnly: true,
  };
}

export class MarketBreadthShockDetector {
  constructor({ config = {}, now = () => Date.now() } = {}) {
    this.config = { ...MARKET_BREADTH_SHOCK_DEFAULTS, ...config };
    this.now = now;
    this.history = [];
    this.stability = new BreadthAlertStability({ confirmMs: this.config.persistenceMs, minSamples: this.config.persistenceSamples });
  }

  observe(metrics) {
    const now = this.now();
    this.history = this.history.filter((row) => now - row.evaluatedAt <= 5 * 60_000);
    const previous = [...this.history].reverse().find((row) => now - row.evaluatedAt >= 45_000) ?? null;
    const candidate = classifyMarketBreadthShock(metrics, { previous, config: this.config });
    if (Number.isFinite(metrics?.evaluatedAt) && metrics.evaluatedAt <= now
      && now - metrics.evaluatedAt <= 45_000
      && metrics.evaluatedAt > (this.history.at(-1)?.evaluatedAt ?? 0)) this.history.push(metrics);
    return this.stability.observe(candidate, metrics?.evaluatedAt, now);
  }
}

export function marketBreadthShockPayload(event) {
  const pump = event.direction === 'PUMP';
  const danger = event.severity === 'DANGER';
  const color = danger ? (pump ? 0xff1744 : 0xb00020) : (pump ? 0xffa000 : 0xff6d00);
  const icon = danger ? '🚨' : '⚠️';
  const title = pump
    ? 'BƠM ĐỒNG LOẠT · NGUY CƠ KILL SHORT'
    : 'XẢ ĐỒNG LOẠT · NGUY CƠ KILL LONG';
  const avoid = pump
    ? '**TẠM NÉ MỞ SHORT MỚI**; không đuổi LONG sau nến dựng.'
    : '**TẠM NÉ MỞ LONG MỚI**; không đuổi SHORT sau nến xả.';
  const leaders = (pump ? event.leaders?.pump : event.leaders?.dump) ?? [];
  const movers = (pump ? event.topUp : event.topDown) ?? [];
  const moverText = movers.map((row) => `${row.symbol.replace(/USDT$/, '')} ${pct(row.movePct, 2)}`).join(' · ') || '--';
  const sameWave = (pump ? event.waveUp : event.waveDown) ?? [];
  const counterWave = (pump ? event.waveDown : event.waveUp) ?? [];
  const waveText = (rows, limit = 25) => rows.slice(0, limit).map((row) => (
    `**${row.symbol.replace(/USDT$/, '')}** ${pct(row.movePct, 2)}`
    + `${Number(row.projectedVolumeRatio ?? 0) >= 1.5 ? ` · vol ${row.projectedVolumeRatio.toFixed(1)}× 🔥` : ''}`
  )).join('\n') || '--';
  const leaderText = leaders.map((row) => `${row.symbol.replace(/USDT$/, '')} ${pct(row.movePct, 2)}${row.confirms ? ' ✓' : ''}`).join(' · ');
  return {
    username: 'Market Shock Guard',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${icon} ${event.severity} · ${title}`,
      color,
      description: `**${breadthPhase(event)}**\n${avoid}\n**OBSERVE ONLY** — cảnh báo quản trị rủi ro, không tự đặt/chặn/đóng lệnh Binance. “Kill short/long” mô tả hình thái đồng loạt, không khẳng định toàn bộ là thanh lý thật.`,
      fields: [
        { name: '🧭 BỐI CẢNH 15–30 PHÚT', value: breadthContextText(event.context), inline: false },
        { name: '⏱️ XÁC NHẬN / SO VỚI LẦN TRƯỚC', value: breadthConfirmationText(event), inline: false },
        {
          name: '🌐 ĐỘ RỘNG 5–10 PHÚT',
          value: `Điểm nguy hiểm **${event.score}/100** · đồng thuận **${event.dominancePct.toFixed(1)}%**\nTăng ≥0.30%: **${event.upCount} (${event.upPct.toFixed(1)}%)** · giảm ≤-0.30%: **${event.downCount} (${event.downPct.toFixed(1)}%)**\nTăng mạnh: **${event.strongUpCount}** · giảm mạnh: **${event.strongDownCount}** · median ${pct(event.medianMovePct, 2)}`,
          inline: false,
        },
        {
          name: '🔥 DÒNG TIỀN / GIA TỐC',
          value: `Taker buy toàn mẫu **${Number.isFinite(event.takerBuyRatio) ? `${(event.takerBuyRatio * 100).toFixed(1)}%` : '--'}**\n${pump ? 'Bơm' : 'Xả'} mạnh + volume ≥1.5×: **${event.volumeCount} coin**\nGia tốc breadth: **${event.accelerationRatio.toFixed(2)}×**${event.accelerationAgeMs ? ` so với ${Math.round(event.accelerationAgeMs / 1000)} giây trước` : ' · chưa có baseline cũ'}`,
          inline: false,
        },
        { name: '₿ COIN DẪN', value: leaderText || '--', inline: false },
        { name: '📈 COIN BIẾN ĐỘNG MẠNH', value: moverText.slice(0, 1024), inline: false },
        {
          name: `🌊 COIN ${pump ? 'BƠM' : 'SẬP'} MẠNH CÙNG SÓNG · ${sameWave.length}${sameWave.length >= 30 ? '+' : ''}`,
          value: waveText(sameWave).slice(0, 1024),
          inline: false,
        },
        ...(counterWave.length ? [{
          name: `↔️ COIN MẠNH NGƯỢC SÓNG · ${counterWave.length}${counterWave.length >= 30 ? '+' : ''}`,
          value: waveText(counterWave, 10).slice(0, 1024),
          inline: false,
        }] : []),
        {
          name: '🛡️ HÀNH ĐỘNG PHÒNG THỦ',
          value: pump
            ? 'Không thêm SHORT khi breadth còn mở rộng. Chờ breadth hạ nhiệt và nến 5m đóng/retest trước khi xét lại.'
            : 'Không thêm LONG khi breadth còn mở rộng. Chờ breadth hạ nhiệt và nến 5m đóng/retest trước khi xét lại.',
          inline: false,
        },
        {
          name: '📡 ĐỘ PHỦ',
          value: `Đã đọc **${event.processed}/${event.requested}** coin (${event.coveragePct.toFixed(1)}%) · quote volume mẫu ${compact((pump ? event.topUp : event.topDown)?.reduce((sum, row) => sum + Number(row.quoteVolume ?? 0), 0))}`,
          inline: false,
        },
      ],
      timestamp: event.generatedAt,
      footer: { text: `${MARKET_BREADTH_SHOCK_VERSION} · cache-only 5m · cảnh báo né, không phải entry` },
    }],
  };
}

export class MarketBreadthShockDiscordNotifier {
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
    if (!event || event.version !== MARKET_BREADTH_SHOCK_VERSION
      || event.observeOnly !== true || !['PUMP', 'DUMP'].includes(event.direction)
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
        body: JSON.stringify(marketBreadthShockPayload(event)),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      this.retryAfter = now + 60_000;
      throw new Error('Market breadth Discord network failure; retry delayed');
    }
    if (!response.ok) {
      const rate = response.status === 429 ? await response.json().catch(() => ({})) : {};
      this.retryAfter = now + Math.max(60_000, Math.min(3_600_000, Number(rate.retry_after ?? 0) * 1_000));
      throw new Error(`Market breadth Discord HTTP ${response.status}`);
    }
    this.memory.alerts[key] = now;
    recordBreadthDelivery(this.memory, event, now);
    this.memory.updatedAt = new Date(now).toISOString();
    this.memory.version = MARKET_BREADTH_SHOCK_VERSION;
    this.memory.alerts = Object.fromEntries(Object.entries(this.memory.alerts)
      .filter(([, sentAt]) => now - Number(sentAt) < 7 * 24 * 60 * 60_000));
    await mkdir(dirname(this.stateFile), { recursive: true });
    const temp = `${this.stateFile}.tmp`;
    await writeFile(temp, JSON.stringify(this.memory, null, 2), 'utf8');
    await rename(temp, this.stateFile);
    return { sent: 1, reason: 'sent', direction: event.direction, severity: event.severity };
  }
}
