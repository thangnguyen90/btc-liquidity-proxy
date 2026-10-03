import { dirname } from 'node:path';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';

export const LOCAL_AI_TREND_DISCORD_VERSION =
  'LOCAL_AI_TREND_DISCORD_V7_NO_STRENGTH_GATE_HISTORY_20261003';
export const LOCAL_AI_TREND_DISCORD_HISTORY_VERSION =
  'LOCAL_AI_TREND_DISCORD_HISTORY_V2_IMMUTABLE_SENT_20261003';

const RETAIN_MS = 7 * 24 * 60 * 60_000;
const VERDICT_COLORS = Object.freeze({ PRIORITY: 0x22c55e, WATCH: 0xf6c344 });
const SIDE_COLORS = Object.freeze({ LONG: 0x16c784, SHORT: 0xf43f5e });
const SIDE_ICONS = Object.freeze({ LONG: '🟢', SHORT: '🔴' });

const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const optionalFinite = (value) => (value == null || value === '' ? null : finite(value));

function validWebhook(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return url.protocol === 'https:'
      && ['discord.com', 'discordapp.com'].includes(url.hostname.toLowerCase())
      && /^\/api\/webhooks\/[^/]+\/[^/]+\/?$/.test(url.pathname)
      ? url.toString() : '';
  } catch {
    return '';
  }
}

function validBaseUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return ['http:', 'https:'].includes(url.protocol)
      ? url.toString().replace(/\/$/, '') : 'http://127.0.0.1:19082';
  } catch {
    return 'http://127.0.0.1:19082';
  }
}

function fmt(value) {
  const parsed = finite(value);
  if (parsed == null) return '—';
  return parsed.toLocaleString('en-US', {
    maximumSignificantDigits: 10,
    maximumFractionDigits: parsed >= 100 ? 2 : parsed >= 1 ? 5 : 8,
  });
}

function pct(value) {
  const parsed = finite(value);
  return parsed == null ? '—' : `${parsed > 0 ? '+' : ''}${parsed.toFixed(3)}%`;
}

function compactTextList(values, empty = '—') {
  const rows = (Array.isArray(values) ? values : []).map((value) => String(value ?? '').trim()).filter(Boolean);
  return rows.length ? rows.map((value) => `• ${value}`).join('\n').slice(0, 900) : empty;
}

export function localAiTrendStrengthBand(value) {
  const strength = optionalFinite(value);
  if (strength == null) return 'UNKNOWN';
  if (strength < 50) return '00_49';
  if (strength < 65) return '50_64';
  if (strength < 75) return '65_74';
  if (strength < 85) return '75_84';
  return '85_100';
}

export function buildLocalAiTrendHistorySample(evaluation = {}, candidate = {}, sentAt = Date.now()) {
  const deterministic = candidate.deterministic ?? {};
  const entryZone = deterministic.entryZone ?? {};
  const qualification = candidate.qualification ?? {};
  const sourceAt = optionalFinite(deterministic.closedAt) ?? optionalFinite(evaluation.inputGeneratedAt);
  const strength = optionalFinite(candidate.strength);
  return {
    historyVersion: LOCAL_AI_TREND_DISCORD_HISTORY_VERSION,
    eventId: localAiTrendDiscordEventId(evaluation, candidate),
    sentAt: optionalFinite(sentAt),
    evaluatedAt: optionalFinite(evaluation.evaluatedAt),
    inputGeneratedAt: optionalFinite(evaluation.inputGeneratedAt),
    sourceAt,
    symbol: String(candidate.symbol ?? '').toUpperCase(),
    side: String(candidate.side ?? '').toUpperCase(),
    verdict: String(candidate.verdict ?? '').toUpperCase(),
    strength,
    strengthBand: localAiTrendStrengthBand(strength),
    horizon: candidate.horizon ?? null,
    path: candidate.path ?? null,
    qualification: {
      passed: qualification.passed === true,
      passedCount: optionalFinite(qualification.passedCount),
      totalCount: optionalFinite(qualification.totalCount),
    },
    price: {
      live: optionalFinite(deterministic.livePrice),
      source: deterministic.livePriceSource ?? null,
      entryLow: optionalFinite(entryZone.low),
      entryHigh: optionalFinite(entryZone.high),
      entryMid: optionalFinite(entryZone.mid),
      invalidation: optionalFinite(deterministic.invalidationPrice),
    },
    candidateInput: {
      source: deterministic.source ?? null,
      frames: deterministic.frames ?? null,
      targetPlan: deterministic.targetPlan ?? null,
      entryScore: optionalFinite(deterministic.entryScore),
      trendScore: optionalFinite(deterministic.trendScore),
      volumeRatio15m: optionalFinite(deterministic.volumeRatio15m),
      volumeRatio5m: optionalFinite(deterministic.volumeRatio5m),
    },
    market: {
      regime: evaluation.marketRegime ?? null,
      bias: evaluation.marketBias ?? null,
      score: optionalFinite(evaluation.marketScore),
    },
    btc: {
      trend1h: evaluation.btc?.trend1h ?? null,
      trend4h: evaluation.btc?.trend4h ?? null,
      return15mPct: optionalFinite(evaluation.btc?.return15mPct),
      return1hPct: optionalFinite(evaluation.btc?.return1hPct),
      rsi1h: optionalFinite(evaluation.btc?.rsi1h),
      rsi4h: optionalFinite(evaluation.btc?.rsi4h),
    },
    breadth: {
      state: evaluation.breadth?.state ?? null,
      shockLabel: evaluation.breadth?.shockLabel ?? null,
    },
    model: {
      name: evaluation.model ?? null,
      applied: evaluation.deterministicFallback === true || evaluation.fallback?.active === true
        ? false : evaluation.modelApplied ?? (evaluation.model ? true : null),
      deterministicFallback: evaluation.deterministicFallback === true || evaluation.fallback?.active === true,
      fallbackReasonCode: evaluation.fallback?.reasonCode ?? null,
    },
  };
}

export function localAiTrendDiscordEventId(evaluation = {}, candidate = {}) {
  const symbol = String(candidate.symbol ?? '').toUpperCase();
  const side = String(candidate.side ?? '').toUpperCase();
  const verdict = String(candidate.verdict ?? '').toUpperCase();
  const sourceAt = finite(candidate.deterministic?.closedAt, finite(evaluation.inputGeneratedAt, 0));
  if (!symbol || !['LONG', 'SHORT'].includes(side) || !['PRIORITY', 'WATCH'].includes(verdict) || !(sourceAt > 0)) {
    return null;
  }
  return `${symbol}|${side}|${verdict}|${sourceAt}`;
}

export function buildLocalAiTrendDiscordPayload(evaluation = {}, candidate = {}, baseUrl) {
  const verdict = String(candidate.verdict ?? '').toUpperCase();
  const side = String(candidate.side ?? '').toUpperCase();
  const d = candidate.deterministic ?? {};
  const zone = d.entryZone ?? {};
  const qualification = candidate.qualification ?? {};
  const root = validBaseUrl(baseUrl);
  const verdictLabel = verdict === 'PRIORITY' ? 'ƯU TIÊN' : 'THEO DÕI';
  const icon = SIDE_ICONS[side] ?? (verdict === 'PRIORITY' ? '🟢' : '🟡');
  const deterministicFallback = evaluation.deterministicFallback === true || evaluation.fallback?.active === true;
  const sourceLabel = deterministicFallback ? 'ENGINE FALLBACK' : 'AI';
  return {
    username: deterministicFallback ? 'Local Trend Engine Fallback' : 'AI Local Trend',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${icon} ${sourceLabel} ${verdictLabel} · ${side} · ${candidate.symbol}`,
      color: SIDE_COLORS[side] ?? VERDICT_COLORS[verdict] ?? 0x64748b,
      description: deterministicFallback
        ? '**ENGINE CAUSAL FALLBACK · OBSERVE ONLY.** Ollama đang lỗi nên đây là xếp hạng định lượng từ dữ liệu engine; không cấp quyền vào Binance.'
        : '**OBSERVE ONLY.** Model local chỉ đánh giá bối cảnh; Discord không xác nhận lệnh Binance, xác suất thắng hoặc giá dự báo.',
      fields: [
        {
          name: 'AI ĐÁNH GIÁ / ĐIỀU KIỆN',
          value: `**${verdictLabel} · ${fmt(candidate.strength)}/100** *(không phải xác suất)*\n${qualification.passed ? '✅ ĐẠT ĐỦ 6/6' : `⏳ CHƯA ĐẠT ${qualification.passedCount ?? 0}/${qualification.totalCount ?? 6}`}\n${qualification.passed ? 'Đủ điều kiện quan sát ưu tiên.' : compactTextList(qualification.missing)}`,
          inline: false,
        },
        {
          name: 'GIÁ LIVE / VÙNG ENGINE',
          value: `**${fmt(d.livePrice)}**\n${fmt(zone.low)} – ${fmt(zone.high)} · giữa ${fmt(zone.mid)}\nNguồn ${d.livePriceSource ?? '—'}`,
          inline: true,
        },
        {
          name: 'ĐƯỜNG ĐI / KHUNG',
          value: `**${candidate.path ?? 'UNCLEAR'}** · ${candidate.horizon ?? '—'}\nVô hiệu tham khảo ${fmt(d.invalidationPrice)}`,
          inline: true,
        },
        {
          name: 'BỐI CẢNH BTC / BREADTH',
          value: `${evaluation.marketRegime ?? 'UNCLEAR'} · ${evaluation.marketBias ?? 'NEUTRAL'} · rõ ${fmt(evaluation.marketScore)}/100\nBTC 1h ${evaluation.btc?.trend1h ?? '—'} · 4h ${evaluation.btc?.trend4h ?? '—'} · 15m ${pct(evaluation.btc?.return15mPct)}\n${evaluation.breadth?.state ?? '—'}${evaluation.breadth?.shockLabel ? ` · ${evaluation.breadth.shockLabel}` : ''}`,
          inline: false,
        },
        { name: 'LÝ DO', value: compactTextList(candidate.reasons), inline: true },
        { name: 'RỦI RO', value: compactTextList(candidate.risks), inline: true },
        {
          name: 'MỞ MÀN HÌNH',
          value: `[AI Local](${root}/local-ai-trend-evaluation) · [Coin Level](${root}/coin-level-analysis?symbol=${encodeURIComponent(candidate.symbol)}) · [Binance](https://www.binance.com/vi/futures/${encodeURIComponent(candidate.symbol)})`,
          inline: false,
        },
      ],
      footer: { text: `${LOCAL_AI_TREND_DISCORD_VERSION} · ${sourceLabel} · LONG xanh / SHORT đỏ · OBSERVE ONLY` },
      timestamp: new Date(finite(evaluation.evaluatedAt, Date.now())).toISOString(),
    }],
  };
}

export function classifyLocalAiBtcForecast(evaluation = {}) {
  const regime = String(evaluation.marketRegime ?? 'UNCLEAR').toUpperCase();
  const bias = String(evaluation.marketBias ?? 'NEUTRAL').toUpperCase();
  const allowed = new Set(['UP_STRONG', 'SW_UP', 'DOWN_STRONG', 'SW_DOWN', 'RANGE']);
  let direction = allowed.has(regime) ? regime : 'UNCLEAR';
  if (direction === 'UNCLEAR' && bias === 'LONG_BIAS') direction = 'SW_UP';
  if (direction === 'UNCLEAR' && bias === 'SHORT_BIAS') direction = 'SW_DOWN';
  const labels = {
    UP_STRONG: 'TĂNG MẠNH', SW_UP: 'ĐI NGANG THIÊN TĂNG',
    DOWN_STRONG: 'GIẢM MẠNH', SW_DOWN: 'ĐI NGANG THIÊN GIẢM',
    RANGE: 'ĐI NGANG', UNCLEAR: 'CHƯA RÕ',
  };
  return {
    ready: finite(evaluation.evaluatedAt) > 0,
    direction,
    label: labels[direction],
    clarity: Math.max(0, Math.min(100, finite(evaluation.marketScore, 0))),
    sourceAt: finite(evaluation.inputGeneratedAt, finite(evaluation.evaluatedAt, 0)),
  };
}

export function buildLocalAiBtcForecastDiscordPayload(evaluation = {}, forecast = {}, baseUrl) {
  const root = validBaseUrl(baseUrl);
  const presentation = {
    UP_STRONG: ['🟢', 0x16c784], SW_UP: ['🟩', 0x2dd4bf],
    DOWN_STRONG: ['🔴', 0xf43f5e], SW_DOWN: ['🟠', 0xf97316],
    RANGE: ['🔵', 0x3b82f6], UNCLEAR: ['⚪', 0x64748b],
  }[forecast.direction] ?? ['⚪', 0x64748b];
  return {
    username: 'AI Local BTC Forecast',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${presentation[0]} AI DỰ BÁO XU HƯỚNG BTC · ${forecast.label}`,
      color: presentation[1],
      description: '**DỰ BÁO BỐI CẢNH · OBSERVE ONLY.** Đây không phải xác suất thắng, mục tiêu giá hoặc quyền vào lệnh. Dự báo có thể sai và chỉ có hiệu lực đến vòng đánh giá kế tiếp.',
      fields: [
        {
          name: 'HƯỚNG / ĐỘ RÕ',
          value: `**${forecast.label}** · ${fmt(forecast.clarity)}/100 *(độ rõ, không phải xác suất)*\nRegime ${evaluation.marketRegime ?? 'UNCLEAR'} · bias ${evaluation.marketBias ?? 'NEUTRAL'}`,
          inline: false,
        },
        {
          name: 'BTC NẾN ĐÃ ĐÓNG',
          value: `15m ${pct(evaluation.btc?.return15mPct)} · 1h ${pct(evaluation.btc?.return1hPct)}\nTrend 1h **${String(evaluation.btc?.trend1h ?? '—').toUpperCase()}** · 4h **${String(evaluation.btc?.trend4h ?? '—').toUpperCase()}** · RSI 1h ${fmt(evaluation.btc?.rsi1h)} · 4h ${fmt(evaluation.btc?.rsi4h)}`,
          inline: false,
        },
        {
          name: 'NHẬN ĐỊNH AI',
          value: String(evaluation.btcAssessment ?? evaluation.summary ?? '—').slice(0, 900),
          inline: false,
        },
        {
          name: 'BREADTH / CẢNH BÁO',
          value: `${evaluation.breadth?.state ?? '—'}${evaluation.breadth?.shockLabel ? ` · ${evaluation.breadth.shockLabel}` : ''}\n${compactTextList(evaluation.warnings, 'Không có cảnh báo bổ sung.')}`,
          inline: false,
        },
        {
          name: 'MỞ MÀN HÌNH',
          value: `[AI Local](${root}/local-ai-trend-evaluation) · [BTC Session](${root}/btc-session-watch.html)`,
          inline: false,
        },
      ],
      footer: { text: `${LOCAL_AI_TREND_DISCORD_VERSION} · forecast refresh tối đa mỗi 60 phút hoặc khi đổi hướng` },
      timestamp: new Date(finite(evaluation.evaluatedAt, Date.now())).toISOString(),
    }],
  };
}

export function classifyLocalAiBtcSuddenDirection(health = {}, {
  min15mPct = 0.25,
  min1hPct = 0.55,
} = {}) {
  if (health?.seeding === true) return { direction: 'NEUTRAL', ready: false, reason: 'BTC health seeding' };
  const return15mPct = finite(health.btcRelativeReturn15mPct);
  const return1hPct = finite(health.btcRelativeReturn1hPct);
  const closedAt = finite(health.btcRelativeReturnClosedAt, finite(health.updatedAt, 0));
  if (return15mPct == null || return1hPct == null || !(closedAt > 0)) {
    return { direction: 'NEUTRAL', ready: false, reason: 'Thiếu return BTC đã đóng' };
  }
  const up = (return15mPct >= min15mPct && return1hPct >= -0.05)
    || (return1hPct >= min1hPct && return15mPct >= 0);
  const down = (return15mPct <= -min15mPct && return1hPct <= 0.05)
    || (return1hPct <= -min1hPct && return15mPct <= 0);
  const direction = up && !down ? 'UP' : down && !up ? 'DOWN' : 'NEUTRAL';
  return {
    direction,
    ready: true,
    closedAt,
    return15mPct,
    return1hPct,
    reason: direction === 'UP'
      ? `BTC tăng nhanh ${pct(return15mPct)} / 15m · ${pct(return1hPct)} / 1h`
      : direction === 'DOWN'
        ? `BTC giảm nhanh ${pct(return15mPct)} / 15m · ${pct(return1hPct)} / 1h`
        : `BTC chưa vượt ngưỡng đổi hướng ${pct(return15mPct)} / 15m · ${pct(return1hPct)} / 1h`,
  };
}

export function isLocalAiBtcRecovery(previousDirection, shift = {}, {
  min15mPct = 0.25,
  min1hPct = 0.55,
  exitRatio = 0.6,
} = {}) {
  if (shift.direction !== 'NEUTRAL') return false;
  const return15mPct = finite(shift.return15mPct);
  const return1hPct = finite(shift.return1hPct);
  if (return15mPct == null || return1hPct == null) return false;
  const exit15mPct = Math.max(0.03, min15mPct * exitRatio);
  const exit1hPct = Math.max(0.08, min1hPct * exitRatio);
  if (previousDirection === 'DOWN') {
    return return15mPct > -exit15mPct && return1hPct > -exit1hPct;
  }
  if (previousDirection === 'UP') {
    return return15mPct < exit15mPct && return1hPct < exit1hPct;
  }
  return false;
}

export function buildLocalAiBtcShiftDiscordPayload(health = {}, shift = {}, baseUrl, now = Date.now()) {
  const isUp = shift.direction === 'UP';
  const isRecovery = shift.direction === 'NEUTRAL'
    && ['UP', 'DOWN'].includes(shift.previousDirection);
  const stoppedDirection = shift.previousDirection === 'DOWN' ? 'GIẢM' : 'TĂNG';
  const title = isRecovery
    ? `🔵 BTC ĐÃ DỪNG ${stoppedDirection} MẠNH · TRỞ LẠI BÌNH THƯỜNG`
    : `${isUp ? '🟢' : '🔴'} BTC ĐỘT NGỘT CHUYỂN SANG ${isUp ? 'TĂNG' : 'GIẢM'}`;
  const color = isRecovery ? 0x38bdf8 : isUp ? 0x16c784 : 0xf43f5e;
  const root = validBaseUrl(baseUrl);
  return {
    username: 'AI Local BTC Context',
    allowed_mentions: { parse: [] },
    embeds: [{
      title,
      color,
      description: isRecovery
        ? '**BTC NORMALIZED · OBSERVE ONLY.** Động lượng mạnh trước đó đã hạ dưới ngưỡng; đây không phải xác nhận đảo chiều hay tín hiệu vào lệnh.'
        : '**CẢNH BÁO BỐI CẢNH · OBSERVE ONLY.** Đây không phải tín hiệu vào lệnh; cần chạy lại AI Local để đánh giá candidate theo bối cảnh BTC mới.',
      fields: [
        {
          name: 'BIẾN ĐỘNG ĐÃ ĐÓNG',
          value: `15m **${pct(shift.return15mPct)}** · 1h **${pct(shift.return1hPct)}**\n${shift.reason}`,
          inline: false,
        },
        {
          name: 'BTC HEALTH',
          value: `Giá **${fmt(health.price)}** · trend 1h **${String(health.btcTrendDir ?? '—').toUpperCase()}** · 4h **${String(health.btcTrendDir4h ?? '—').toUpperCase()}**\nRSI 1h ${fmt(health.rsi1h)} · RSI 4h ${fmt(health.rsi4h)} · funding ${pct(health.fundingRate)}`,
          inline: false,
        },
        {
          name: 'MỞ MÀN HÌNH',
          value: `[AI Local](${root}/local-ai-trend-evaluation) · [BTC Session](${root}/btc-session-watch.html)`,
          inline: false,
        },
      ],
      footer: { text: `${LOCAL_AI_TREND_DISCORD_VERSION} · strong/recovery transition có dedupe` },
      timestamp: new Date(now).toISOString(),
    }],
  };
}

function freshState(now) {
  return {
    version: LOCAL_AI_TREND_DISCORD_VERSION,
    initializedAt: now,
    updatedAt: now,
    retryAfter: 0,
    records: {},
    lastByRoute: {},
    btc: {
      initialized: false,
      direction: 'NEUTRAL',
      closedAt: 0,
      lastNotifiedAt: 0,
      lastStrongNotifiedAt: 0,
      lastRecoveryNotifiedAt: 0,
      lastEventId: null,
    },
    btcForecast: {
      direction: null,
      sourceAt: 0,
      lastNotifiedAt: 0,
      lastEventId: null,
    },
  };
}

export class LocalAiTrendDiscordNotifier {
  constructor({
    stateFile,
    historyFile,
    webhookUrl,
    baseUrl,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    signalCooldownMs = 30 * 60_000,
    btcCooldownMs = 15 * 60_000,
    minBtc15mPct = 0.25,
    minBtc1hPct = 0.55,
    maxPerEvaluation = 3,
    forecastRefreshMs = 60 * 60_000,
  } = {}) {
    this.stateFile = stateFile;
    this.historyFile = historyFile ?? (stateFile
      ? String(stateFile).replace(/\.json$/i, '-history.ndjson')
      : null);
    this.webhookUrl = typeof webhookUrl === 'function' ? webhookUrl : () => webhookUrl;
    this.baseUrl = typeof baseUrl === 'function' ? baseUrl : () => baseUrl;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.signalCooldownMs = Math.max(60_000, finite(signalCooldownMs, 30 * 60_000));
    this.btcCooldownMs = Math.max(60_000, finite(btcCooldownMs, 15 * 60_000));
    this.minBtc15mPct = Math.max(0.05, finite(minBtc15mPct, 0.25));
    this.minBtc1hPct = Math.max(0.1, finite(minBtc1hPct, 0.55));
    this.maxPerEvaluation = Math.max(1, Math.min(5, finite(maxPerEvaluation, 3)));
    this.forecastRefreshMs = Math.max(10 * 60_000, finite(forecastRefreshMs, 60 * 60_000));
    this.state = null;
    this.queue = Promise.resolve();
  }

  configured() { return Boolean(validWebhook(this.webhookUrl?.())); }

  snapshot() {
    return {
      version: LOCAL_AI_TREND_DISCORD_VERSION,
      configured: this.configured(),
      observeOnly: true,
      binanceEligible: false,
      candidateStrengthRule: 'OFF',
      historyVersion: LOCAL_AI_TREND_DISCORD_HISTORY_VERSION,
      historyStrengthBands: ['00_49', '50_64', '65_74', '75_84', '85_100', 'UNKNOWN'],
      btcDirection: this.state?.btc?.direction ?? null,
      btcForecast: this.state?.btcForecast?.direction ?? null,
      updatedAt: this.state?.updatedAt ?? null,
    };
  }

  async load() {
    if (this.state) return this.state;
    const now = this.now();
    try {
      const parsed = JSON.parse(await readFile(this.stateFile, 'utf8'));
      this.state = {
        ...freshState(now),
        ...parsed,
        version: LOCAL_AI_TREND_DISCORD_VERSION,
        records: parsed?.records && typeof parsed.records === 'object' ? parsed.records : {},
        lastByRoute: parsed?.lastByRoute && typeof parsed.lastByRoute === 'object' ? parsed.lastByRoute : {},
        btc: { ...freshState(now).btc, ...(parsed?.btc ?? {}) },
        btcForecast: { ...freshState(now).btcForecast, ...(parsed?.btcForecast ?? {}) },
      };
      if (!(finite(this.state.btc.lastStrongNotifiedAt, 0) > 0)
        && finite(this.state.btc.lastNotifiedAt, 0) > 0
        && !String(this.state.btc.lastEventId ?? '').startsWith('RECOVERY_FROM_')) {
        this.state.btc.lastStrongNotifiedAt = finite(this.state.btc.lastNotifiedAt, 0);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[LocalAiDiscord] state reset: ${error.message}`);
      this.state = freshState(now);
    }
    return this.state;
  }

  async save() {
    if (!this.stateFile || !this.state) return;
    const now = this.now();
    this.state.records = Object.fromEntries(Object.entries(this.state.records)
      .filter(([, record]) => now - finite(record?.lastSeenAt, now) <= RETAIN_MS)
      .sort((a, b) => finite(a[1]?.lastSeenAt, 0) - finite(b[1]?.lastSeenAt, 0))
      .slice(-1_000));
    this.state.updatedAt = now;
    this.state.version = LOCAL_AI_TREND_DISCORD_VERSION;
    await mkdir(dirname(this.stateFile), { recursive: true });
    const temporary = `${this.stateFile}.tmp`;
    await writeFile(temporary, JSON.stringify(this.state, null, 2), 'utf8');
    await rename(temporary, this.stateFile);
  }

  async #post(payload) {
    const webhookUrl = validWebhook(this.webhookUrl?.());
    if (!webhookUrl) return { sent: false, error: 'WEBHOOK_NOT_CONFIGURED' };
    const now = this.now();
    if (now < finite(this.state?.retryAfter, 0)) return { sent: false, error: 'RATE_LIMIT_COOLDOWN' };
    let response;
    try {
      response = await this.fetchImpl(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      return { sent: false, error: error?.message ?? 'NETWORK_ERROR' };
    }
    if (response.ok) return { sent: true };
    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      this.state.retryAfter = now + Math.max(60_000, Math.min(60 * 60_000, finite(body?.retry_after, 60) * 1_000));
    }
    return { sent: false, error: `HTTP_${response.status}` };
  }

  async #appendHistory(sample) {
    if (!this.historyFile) return false;
    await mkdir(dirname(this.historyFile), { recursive: true });
    await appendFile(this.historyFile, `${JSON.stringify(sample)}\n`, 'utf8');
    return true;
  }

  deliverEvaluation(evaluation = {}) {
    this.queue = this.queue.catch(() => {}).then(() => this.#deliverEvaluation(evaluation));
    return this.queue;
  }

  async #deliverEvaluation(evaluation) {
    if (!this.configured()) return { configured: false, candidates: 0, sent: 0, forecastSent: 0, errors: [] };
    const state = await this.load();
    const now = this.now();
    const forecast = classifyLocalAiBtcForecast(evaluation);
    let forecastSent = 0;
    if (forecast.ready) {
      const eventId = `${forecast.direction}|${forecast.sourceAt}`;
      const changed = forecast.direction !== state.btcForecast.direction;
      const refreshDue = now - finite(state.btcForecast.lastNotifiedAt, 0) >= this.forecastRefreshMs;
      if (state.btcForecast.lastEventId !== eventId && (changed || refreshDue)) {
        const result = await this.#post(buildLocalAiBtcForecastDiscordPayload(
          evaluation,
          forecast,
          this.baseUrl?.(),
        ));
        if (result.sent) {
          state.btcForecast = {
            direction: forecast.direction,
            sourceAt: forecast.sourceAt,
            lastNotifiedAt: now,
            lastEventId: eventId,
          };
          forecastSent = 1;
        }
      }
    }
    const candidates = (Array.isArray(evaluation?.candidates) ? evaluation.candidates : [])
      .filter((candidate) => ['PRIORITY', 'WATCH'].includes(candidate?.verdict))
      .sort((left, right) => (left.verdict === 'PRIORITY' ? -1 : 1) - (right.verdict === 'PRIORITY' ? -1 : 1))
      .slice(0, this.maxPerEvaluation);
    let sent = 0;
    const errors = [];
    for (const candidate of candidates) {
      const id = localAiTrendDiscordEventId(evaluation, candidate);
      if (!id) continue;
      const routeKey = `${candidate.symbol}|${candidate.side}|${candidate.verdict}`;
      const record = state.records[id] ?? {
        id, symbol: candidate.symbol, side: candidate.side, verdict: candidate.verdict,
        firstSeenAt: now, lastSeenAt: now, sent: false,
      };
      const historySample = buildLocalAiTrendHistorySample(evaluation, candidate, now);
      record.lastSeenAt = now;
      state.records[id] = record;
      if (record.sent || now - finite(state.lastByRoute[routeKey], 0) < this.signalCooldownMs) continue;
      record.strength = historySample.strength;
      record.strengthBand = historySample.strengthBand;
      record.sample = historySample;
      const result = await this.#post(buildLocalAiTrendDiscordPayload(evaluation, candidate, this.baseUrl?.()));
      record.lastAttemptAt = now;
      if (result.sent) {
        historySample.sentAt = this.now();
        record.sent = true;
        record.sentAt = historySample.sentAt;
        state.lastByRoute[routeKey] = now;
        try {
          record.historyPersisted = await this.#appendHistory(historySample);
          record.historyPersistedAt = now;
        } catch (error) {
          record.historyPersisted = false;
          record.historyError = error?.message ?? 'HISTORY_APPEND_FAILED';
          console.warn(`[LocalAiDiscord] history append failed: ${record.historyError}`);
        }
        sent += 1;
      } else {
        record.lastError = result.error;
        errors.push(`${candidate.symbol}:${candidate.side}:${result.error}`);
      }
    }
    await this.save();
    return {
      configured: true,
      candidates: candidates.length,
      sent,
      forecastSent,
      forecast: forecast.ready ? forecast.direction : null,
      errors,
    };
  }

  deliverBtcHealth(health = {}) {
    this.queue = this.queue.catch(() => {}).then(() => this.#deliverBtcHealth(health));
    return this.queue;
  }

  async #deliverBtcHealth(health) {
    if (!this.configured()) return { configured: false, sent: 0, direction: 'NEUTRAL' };
    const state = await this.load();
    const now = this.now();
    const shift = classifyLocalAiBtcSuddenDirection(health, {
      min15mPct: this.minBtc15mPct,
      min1hPct: this.minBtc1hPct,
    });
    if (!shift.ready) return { configured: true, sent: 0, direction: shift.direction, reason: shift.reason };
    if (!state.btc.initialized) {
      state.btc = { ...state.btc, initialized: true, direction: shift.direction, closedAt: shift.closedAt };
      await this.save();
      return { configured: true, baseline: true, sent: 0, direction: shift.direction };
    }
    const previousDirection = state.btc.direction ?? 'NEUTRAL';
    state.btc.closedAt = shift.closedAt;
    if (shift.direction === previousDirection) {
      await this.save();
      return { configured: true, sent: 0, direction: shift.direction };
    }
    const isRecovery = isLocalAiBtcRecovery(previousDirection, shift, {
      min15mPct: this.minBtc15mPct,
      min1hPct: this.minBtc1hPct,
    });
    if (shift.direction === 'NEUTRAL' && !isRecovery) {
      await this.save();
      return {
        configured: true,
        sent: 0,
        direction: previousDirection,
        observedDirection: shift.direction,
        holdingStrongState: ['UP', 'DOWN'].includes(previousDirection),
      };
    }
    const eventId = isRecovery
      ? `RECOVERY_FROM_${previousDirection}|${shift.closedAt}`
      : `${shift.direction}|${shift.closedAt}`;
    const lastStrongNotifiedAt = finite(
      state.btc.lastStrongNotifiedAt,
      finite(state.btc.lastNotifiedAt, 0),
    );
    if (state.btc.lastEventId === eventId
      || (!isRecovery && now - lastStrongNotifiedAt < this.btcCooldownMs)) {
      await this.save();
      return { configured: true, sent: 0, direction: shift.direction, cooldown: true };
    }
    const result = await this.#post(buildLocalAiBtcShiftDiscordPayload(
      health,
      { ...shift, previousDirection },
      this.baseUrl?.(),
      now,
    ));
    if (result.sent) {
      state.btc.direction = shift.direction;
      state.btc.lastEventId = eventId;
      state.btc.lastNotifiedAt = now;
      if (isRecovery) state.btc.lastRecoveryNotifiedAt = now;
      else state.btc.lastStrongNotifiedAt = now;
      state.btc.previousDirection = previousDirection;
    }
    await this.save();
    return {
      configured: true,
      sent: result.sent ? 1 : 0,
      direction: shift.direction,
      recovery: isRecovery,
      previousDirection,
      error: result.error,
    };
  }
}
