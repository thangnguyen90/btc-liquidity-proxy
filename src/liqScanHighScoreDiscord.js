import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { assessSweepDirection } from './liqScanSnapshot.js';
import { normalizeCoinHorizonSweepWebhookUrl } from './coinHorizonSweepTransitionDiscord.js';

export const LIQ_SCAN_HIGH_SCORE_DISCORD_VERSION =
  'LIQ_SCAN_SCORE65_DISCORD_BINANCE80_V3_20260918';
export const LIQ_SCAN_HIGH_SCORE_DISCORD_THRESHOLD = 65;
export const LIQ_SCAN_HIGH_SCORE_BINANCE_THRESHOLD = 80;
// Compatibility alias for callers that historically used this as the Binance gate.
export const LIQ_SCAN_HIGH_SCORE_THRESHOLD = LIQ_SCAN_HIGH_SCORE_BINANCE_THRESHOLD;

const RETENTION_MS = 30 * 24 * 60 * 60_000;
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const price = (value) => {
  const number = finite(value);
  return number == null ? '—' : number.toFixed(8).replace(/\.?0+$/, '');
};
const compact = (value) => {
  const number = finite(value);
  if (number == null) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact', maximumFractionDigits: 2,
  }).format(number);
};
const localTime = (value) => new Date(value).toLocaleString('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', hour12: false,
});
const zone = (value) => value
  ? `${price(value.bandLow ?? value.low)}–${price(value.bandHigh ?? value.high)}`
  : 'Chưa có vùng hợp lệ';

// Discord is active from 65 inclusive. Binance retains the historical strict >80 gate.
// Stale/invalid snapshots return null and never reset state.
export function collectLiqScanHighScoreState(analysis = {}, now = Date.now()) {
  const current = analysis?.liqScan?.current ?? analysis?.liqScan;
  const symbol = String(analysis?.symbol ?? current?.symbol ?? '').trim().toUpperCase();
  const score = finite(current?.imbalanceScore ?? current?.sweepProbabilityPct);
  const evaluatedAt = Date.parse(current?.evaluatedAt);
  const ageMs = now - evaluatedAt;
  const dominantSide = String(current?.dominantSide ?? '').toUpperCase();
  const markPrice = finite(analysis?.market?.markPrice);
  if (!symbol || score == null || score < 0 || score > 100
    || !['ABOVE', 'BELOW'].includes(dominantSide)
    || markPrice == null || markPrice <= 0
    || current?.stale === true || analysis?.freshness?.stale === true
    || !Number.isFinite(ageMs) || ageMs < 0 || ageMs > 90_000) return null;
  const active = score >= LIQ_SCAN_HIGH_SCORE_DISCORD_THRESHOLD;
  const binanceEligible = score > LIQ_SCAN_HIGH_SCORE_BINANCE_THRESHOLD;
  const direction = assessSweepDirection(analysis, current, now);
  return {
    version: LIQ_SCAN_HIGH_SCORE_DISCORD_VERSION,
    symbol,
    active,
    score,
    dominantSide,
    side: dominantSide === 'ABOVE' ? 'LONG' : 'SHORT',
    markPrice,
    current,
    direction,
    evaluatedAt,
    observedAt: now,
    observeOnly: !binanceEligible,
    binanceEligible,
    executionEligible: binanceEligible,
  };
}

export function buildLiqScanHighScorePayload(event = {}) {
  const upward = event.dominantSide === 'ABOVE';
  const target = event.direction?.target;
  const preferredZone = upward ? event.direction?.above : event.direction?.below;
  const targetText = target ? zone(target) : zone(preferredZone);
  const symbol = encodeURIComponent(event.symbol);
  const coin = encodeURIComponent(event.symbol.replace(/USDT$/, ''));
  const execution = event.binanceExecution ?? { status: 'off' };
  const executionStatus = String(execution.status ?? 'unknown').toUpperCase();
  const activeOrder = ['SUBMITTED', 'FILLED', 'PARTIALLY_FILLED', 'NEW'].includes(executionStatus);
  const executionText = executionStatus === 'BELOW-BINANCE-THRESHOLD'
    ? `**DISCORD ĐÃ ĐỦ ≥${LIQ_SCAN_HIGH_SCORE_DISCORD_THRESHOLD}; BINANCE chưa đủ strict >${LIQ_SCAN_HIGH_SCORE_BINANCE_THRESHOLD}/100 — không đặt lệnh.**`
    : executionStatus === 'BACKGROUND-OBSERVE-ONLY'
      ? '**SCANNER NỀN CHỈ GỬI DISCORD — không gọi executor Binance.**'
    : activeOrder
    ? `**BINANCE THẬT: ${executionStatus} · ${execution.side ?? event.side} MARKET · ${execution.marginUsdt ?? 5} USDT margin ×${execution.leverage ?? 5} · TP +${execution.takeProfitRoePct ?? 15}% ROE · SL −${execution.stopLossRoePct ?? (upward ? 20 : 30)}% ROE.**`
    : executionStatus === 'OFF'
      ? '**BINANCE OFF cho đúng route này — Discord vẫn gửi, không đặt lệnh.**'
      : `**BINANCE: ${executionStatus}${execution.code ? ` · ${execution.code}` : ''} — không xác nhận có entry mới.**`;
  return {
    username: `LiqScan · Điểm lệch ≥${LIQ_SCAN_HIGH_SCORE_DISCORD_THRESHOLD}`,
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${upward ? '🟢 ↑' : '🔴 ↓'} ${event.symbol} · LIQSCAN ${event.score}/100 · ${upward ? 'ƯU TIÊN QUÉT TRÊN' : 'ƯU TIÊN QUÉT DƯỚI'}`,
      color: upward ? 0x10b981 : 0xef4444,
      description: [
        `**ĐẠT NGƯỠNG DISCORD ≥${LIQ_SCAN_HIGH_SCORE_DISCORD_THRESHOLD}/100 · ĐIỂM LỆCH, KHÔNG PHẢI XÁC SUẤT**`,
        upward
          ? 'Thanh khoản proxy phía trên áp đảo — theo dõi khả năng giá hút lên quét SHORT.'
          : 'Thanh khoản proxy phía dưới áp đảo — theo dõi khả năng giá hút xuống quét LONG.',
        executionText,
        'Đây là entry thử nghiệm theo lực hút thanh khoản; điểm lệch không phải xác suất thắng.',
      ].join('\n'),
      fields: [
        {
          name: 'GIÁ / THANH KHOẢN ƯỚC TÍNH',
          value: `Giá **${price(event.markPrice)}**\nTrên **${compact(event.current?.liquidityAbove)}** · Dưới **${compact(event.current?.liquidityBelow)}** · Bias ${price(event.current?.bias)}`,
        },
        {
          name: 'HƯỚNG ĐÁNH GIÁ',
          value: `${event.direction?.headline ?? 'Chưa đủ xác nhận đa nguồn.'}\nVùng ${upward ? 'trên' : 'dưới'} gần: **${targetText}**`.slice(0, 1024),
        },
        {
          name: 'ĐỐI CHIẾU COINGLASS / XÁC NHẬN',
          value: [
            `Proxy: ${event.direction?.proxySide ?? event.dominantSide} · CoinGlass: ${event.direction?.coinglassSide ?? 'chưa đồng thuận'} · khung ${event.direction?.sourceRange ?? '—'}`,
            ...(event.direction?.reasons ?? []),
          ].join('\n').slice(0, 1024),
        },
        {
          name: 'THỜI ĐIỂM',
          value: `${localTime(event.evaluatedAt)} (VN) · chỉ dùng snapshot còn mới tối đa 90 giây.`,
        },
        {
          name: 'MỞ NHANH',
          value: `[Binance](https://www.binance.com/en/futures/${symbol}) · [CoinGlass](https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3?coin=${coin})`,
        },
      ],
      timestamp: new Date(event.evaluatedAt).toISOString(),
      footer: { text: `${LIQ_SCAN_HIGH_SCORE_DISCORD_VERSION} | reset khi <65; Binance vẫn strict >80` },
    }],
  };
}

export class LiqScanHighScoreDiscordNotifier {
  constructor({
    stateFile,
    webhookUrl = () => '',
    now = () => Date.now(),
    fetchImpl = fetch,
    execute = async () => ({ status: 'off' }),
  } = {}) {
    Object.assign(this, { stateFile, webhookUrl, now, fetchImpl, execute });
    this.memory = null;
    this.queue = Promise.resolve();
    this.retryAfter = 0;
  }

  notify(analysis) {
    const job = this.queue.catch(() => {}).then(() => this.process(analysis));
    this.queue = job;
    return job;
  }

  async loadState() {
    if (this.memory) return this.memory;
    try {
      this.memory = JSON.parse(await readFile(this.stateFile, 'utf8'));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw new Error('Cannot read LiqScan high-score state');
      this.memory = { symbols: {} };
    }
    this.memory.symbols ??= {};
    return this.memory;
  }

  async saveState(state, now) {
    state.version = LIQ_SCAN_HIGH_SCORE_DISCORD_VERSION;
    state.updatedAt = new Date(now).toISOString();
    state.symbols = Object.fromEntries(Object.entries(state.symbols).filter(([, item]) => (
      now - finite(item?.observedAt, 0) <= RETENTION_MS
    )));
    await mkdir(dirname(this.stateFile), { recursive: true });
    const temporary = `${this.stateFile}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await rename(temporary, this.stateFile);
  }

  async process(analysis) {
    const now = this.now();
    const current = collectLiqScanHighScoreState(analysis, now);
    if (!current) return { sent: 0, reason: 'stale_or_invalid' };
    const state = await this.loadState();
    const previous = state.symbols[current.symbol] ?? null;
    if (!current.active) {
      // A background universe scan should not grow/write the state file for every
      // symbol that has never had an active episode. Only persist a real reset.
      if (previous && (previous.active !== false || previous.dominantSide !== current.dominantSide)) {
        state.symbols[current.symbol] = {
          active: false, dominantSide: current.dominantSide, score: current.score, observedAt: now,
        };
        await this.saveState(state, now);
      }
      return { sent: 0, reason: 'below_discord_threshold' };
    }
    const sameDirectionEpisode = previous?.active === true
      && previous?.dominantSide === current.dominantSide;
    const discordNotified = sameDirectionEpisode
      && (previous?.discordNotified === true || previous?.discordNotified == null);
    const binanceNotified = sameDirectionEpisode && (previous?.binanceNotified === true
      || (previous?.binanceNotified == null
        && finite(previous?.score, -Infinity) > LIQ_SCAN_HIGH_SCORE_BINANCE_THRESHOLD));
    const needsDiscordThresholdAlert = !discordNotified;
    const needsBinanceTierAlert = current.binanceEligible && !binanceNotified;
    if (!needsDiscordThresholdAlert && !needsBinanceTierAlert) {
      return { sent: 0, reason: 'same_high_score_episode' };
    }
    const url = normalizeCoinHorizonSweepWebhookUrl(
      typeof this.webhookUrl === 'function' ? this.webhookUrl() : this.webhookUrl,
    );
    if (!url) return { sent: 0, reason: 'not_configured' };
    if (now < this.retryAfter) return { sent: 0, reason: 'backoff' };
    let binanceExecution = {
      status: 'below-binance-threshold',
      code: `SCORE_MUST_BE_GT_${LIQ_SCAN_HIGH_SCORE_BINANCE_THRESHOLD}`,
    };
    if (current.binanceEligible) {
      try {
        binanceExecution = await this.execute(current);
      } catch (error) {
        binanceExecution = {
          status: 'error',
          code: error?.code ?? 'BINANCE_ERROR',
          message: String(error?.message ?? error).slice(0, 300),
        };
      }
    }
    const event = { ...current, binanceExecution };
    let response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildLiqScanHighScorePayload(event)),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      this.retryAfter = now + 60_000;
      throw new Error('LiqScan high-score Discord network failure; retry delayed');
    }
    if (!response.ok) {
      const rate = response.status === 429 ? await response.json().catch(() => ({})) : {};
      this.retryAfter = now + Math.max(
        60_000,
        Math.min(60 * 60_000, finite(rate.retry_after, 0) * 1_000),
      );
      throw new Error(`LiqScan high-score Discord HTTP ${response.status}`);
    }
    state.symbols[current.symbol] = {
      active: true,
      dominantSide: current.dominantSide,
      score: current.score,
      observedAt: now,
      notifiedAt: now,
      discordNotified: true,
      binanceNotified: binanceNotified || current.binanceEligible,
    };
    await this.saveState(state, now);
    return {
      sent: 1,
      reason: 'high_score_sent',
      side: current.side,
      score: current.score,
      binanceExecution,
    };
  }
}
