import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { buildCoinHorizonAnalysis } from './coinHorizonAnalysis.js';

export const COIN_HORIZON_SWEEP_TRANSITION_DISCORD_VERSION =
  'COIN_HORIZON_SWEEP_TRANSITION_DISCORD_V2_BINANCE_STATUS_20260913';

const RETENTION_MS = 30 * 24 * 60 * 60_000;

const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const numberText = (value) => {
  const parsed = finite(value);
  return parsed == null ? '—' : parsed.toFixed(8).replace(/\.?0+$/, '');
};

const stateText = (state) => ({
  UPPER: 'QUÉT LÊN',
  LOWER: 'QUÉT XUỐNG',
  NEUTRAL: 'CHƯA ĐỒNG THUẬN',
}[state] ?? 'CHƯA CÓ TRẠNG THÁI');

const zoneText = (zone) => zone
  ? `${numberText(zone.low ?? zone.bandLow)}–${numberText(zone.high ?? zone.bandHigh)}`
  : 'Chưa có vùng hợp lệ';

export function normalizeCoinHorizonSweepWebhookUrl(value) {
  const input = String(value ?? '').trim();
  if (!input) return '';
  try {
    const url = new URL(input);
    const validHost = url.hostname === 'discord.com' || url.hostname === 'discordapp.com';
    const validPath = /^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
    if (url.protocol !== 'https:' || !validHost || !validPath || url.username || url.password) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

export function collectCoinHorizonSweepState(analysis = {}, now = Date.now()) {
  const horizon = analysis?.horizonAnalysis ?? buildCoinHorizonAnalysis(analysis, now);
  const symbol = String(analysis?.symbol ?? '').trim().toUpperCase();
  if (!symbol || !horizon.available || horizon.stale) return null;
  const directions = [...new Set((horizon.scenarios ?? []).map((scenario) => scenario.direction))];
  const directional = directions.length === 1 && ['UPPER', 'LOWER'].includes(directions[0]);
  return {
    version: COIN_HORIZON_SWEEP_TRANSITION_DISCORD_VERSION,
    symbol,
    state: directional ? directions[0] : 'NEUTRAL',
    side: directions[0] === 'UPPER' ? 'LONG' : directions[0] === 'LOWER' ? 'SHORT' : null,
    horizon,
    observedAt: now,
    observeOnly: true,
    executionEnabled: analysis?.horizonSweepBinanceExecution?.status === 'submitted',
    binanceExecution: analysis?.horizonSweepBinanceExecution ?? null,
  };
}

function executionText(execution, upward) {
  const status = execution?.status;
  if (status === 'submitted') return [
    `**BINANCE: ĐÃ GỬI ${upward ? 'LONG' : 'SHORT'} MARKET.**`,
    `Ký quỹ ${numberText(execution.marginUsdt)} USDT × ${numberText(execution.leverage)}x`,
    `TP động ${numberText(execution.takeProfitPrice)} (+${numberText(execution.takeProfitRoePct)}% ROE)`,
    `SL ${numberText(execution.stopLossPrice)} (−${numberText(execution.stopLossRoePct)}% ROE) · R:R ${numberText(execution.rewardRisk)}`,
  ].join('\n');
  if (status === 'master-off') return 'BINANCE: khóa tổng đang OFF — không gửi lệnh.';
  if (status === 'baseline-recorded') return 'BINANCE: chỉ ghi trạng thái nền đầu tiên sau khi bật — không replay tín hiệu cũ.';
  if (status === 'target-or-risk-blocked' || status === 'price-or-age-blocked') {
    return 'BINANCE: không vào — thiếu TP thanh khoản hợp lệ, R:R < 1, giá trôi hoặc tín hiệu quá tuổi.';
  }
  if (status === 'error') return 'BINANCE: chưa xác nhận gửi lệnh do lỗi executor; cần kiểm tra log.';
  if (['existing-position', 'existing-order', 'deduped', 'control-changed', 'runtime-off'].includes(status)) {
    return `BINANCE: không gửi lệnh (${status}).`;
  }
  return 'BINANCE: công tắc riêng của hướng này đang OFF — Discord vẫn cảnh báo.';
}

export function buildCoinHorizonSweepTransitionPayload(event = {}) {
  if (!['UPPER', 'LOWER'].includes(event.state)) return null;
  const upward = event.state === 'UPPER';
  const symbol = String(event.symbol ?? '').trim().toUpperCase();
  const frameFields = (event.horizon?.scenarios ?? []).map((scenario) => ({
    name: `${scenario.hours} GIỜ TỚI · ${upward ? 'QUÉT LÊN' : 'QUÉT XUỐNG'}`,
    inline: false,
    value: [
      `Cận trên **${numberText(scenario.upper)}** (${numberText(scenario.upperPct)}%)`,
      `Cận dưới **${numberText(scenario.lower)}** (${numberText(scenario.lowerPct)}%)`,
      `Vùng quét trên: ${zoneText(scenario.upperLiquidity)} · vùng quét dưới: ${zoneText(scenario.lowerLiquidity)}`,
      `Kháng cự: ${zoneText(scenario.resistance)} · hỗ trợ: ${zoneText(scenario.support)}`,
      `CoinGlass: ${scenario.liquidityRange ?? 'thiếu dữ liệu mới'} · đồng thuận: ${scenario.agreement === 'PARTIAL' ? 'một phần' : 'thấp'}`,
    ].join('\n').slice(0, 1024),
  }));
  return {
    username: 'Coin Horizon Sweep Transition',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${upward ? '🟢 ↑' : '🔴 ↓'} ${symbol} · CHUYỂN SANG ${stateText(event.state)} · 4h/8h/12h`,
      color: upward ? 0x10b981 : 0xef4444,
      description: [
        `Trạng thái trước: **${stateText(event.previousState)}** → hiện tại: **${stateText(event.state)}**.`,
        `Giá mốc **${numberText(event.horizon?.anchor)}**.`,
        executionText(event.binanceExecution, upward),
        `[Mở Binance](https://www.binance.com/en/futures/${encodeURIComponent(symbol)})`,
      ].join('\n'),
      fields: [
        ...frameFields,
        {
          name: 'LƯU Ý',
          value: (event.horizon?.notes ?? []).join('\n').slice(0, 1024) || 'Chỉ dùng để theo dõi hướng quét.',
          inline: false,
        },
      ],
      timestamp: new Date(finite(event.observedAt, Date.now())).toISOString(),
      footer: { text: `${COIN_HORIZON_SWEEP_TRANSITION_DISCORD_VERSION} | transition + Binance route status` },
    }],
  };
}

export class CoinHorizonSweepTransitionNotifier {
  constructor({
    stateFile,
    webhookUrl = () => '',
    now = () => Date.now(),
    fetchImpl = fetch,
  } = {}) {
    Object.assign(this, { stateFile, webhookUrl, now, fetchImpl });
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
      if (error?.code !== 'ENOENT') throw new Error('Cannot read Coin Horizon transition state');
      this.memory = { symbols: {} };
    }
    this.memory.symbols ??= {};
    return this.memory;
  }

  async saveState(state, now) {
    state.version = COIN_HORIZON_SWEEP_TRANSITION_DISCORD_VERSION;
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
    const current = collectCoinHorizonSweepState(analysis, now);
    if (!current) return { sent: 0, reason: 'stale_or_unavailable' };
    const state = await this.loadState();
    const previous = state.symbols[current.symbol] ?? null;
    const changed = previous != null && previous.state !== current.state;
    const shouldSend = changed && ['UPPER', 'LOWER'].includes(current.state);

    if (!shouldSend) {
      if (!previous || previous.state !== current.state) {
        state.symbols[current.symbol] = {
          state: current.state,
          observedAt: now,
          notifiedAt: previous?.notifiedAt ?? null,
        };
        await this.saveState(state, now);
      }
      return { sent: 0, reason: previous ? 'no_directional_transition' : 'baseline_recorded' };
    }

    const url = normalizeCoinHorizonSweepWebhookUrl(
      typeof this.webhookUrl === 'function' ? this.webhookUrl() : this.webhookUrl,
    );
    if (!url) return { sent: 0, reason: 'not_configured' };
    if (now < this.retryAfter) return { sent: 0, reason: 'backoff' };
    const event = { ...current, previousState: previous.state };
    let response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildCoinHorizonSweepTransitionPayload(event)),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      this.retryAfter = now + 60_000;
      throw new Error('Coin Horizon transition Discord network failure; retry delayed');
    }
    if (!response.ok) {
      const rate = response.status === 429 ? await response.json().catch(() => ({})) : {};
      this.retryAfter = now + Math.max(
        60_000,
        Math.min(60 * 60_000, finite(rate.retry_after, 0) * 1_000),
      );
      throw new Error(`Coin Horizon transition Discord HTTP ${response.status}`);
    }
    state.symbols[current.symbol] = { state: current.state, observedAt: now, notifiedAt: now };
    await this.saveState(state, now);
    return { sent: 1, reason: 'transition_sent', side: current.side, state: current.state };
  }
}
