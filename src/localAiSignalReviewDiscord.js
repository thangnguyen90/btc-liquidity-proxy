import { dirname } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

export const AI_SIGNAL_REVIEW_DISCORD_VERSION =
  'AI_SIGNAL_REVIEW_DISCORD_V2_DUAL_1H_4H_ENTRY_IMPROVEMENT_20261003';
export const BTC_EXTREME_MOVE_DISCORD_VERSION =
  'BTC_EXTREME_MOVE_DISCORD_V2_CLOSED_15M_1H_4H_20261003';

export const AI_SIGNAL_REVIEW_PASS_RULE = Object.freeze({
  horizonHours: 4,
  roundTripCostPct: 0.12,
  minEntryImprovementPct: 0.10,
  requireIndependent4h: true,
  requireSentSnapshot: true,
});
export const AI_SIGNAL_REVIEW_PASS_RULES = Object.freeze([
  Object.freeze({ ...AI_SIGNAL_REVIEW_PASS_RULE, horizonHours: 1 }),
  AI_SIGNAL_REVIEW_PASS_RULE,
]);

const finite = (value, fallback = null) => {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

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

const fmt = (value) => {
  const parsed = finite(value);
  return parsed == null ? '—' : parsed.toLocaleString('en-US', {
    maximumSignificantDigits: 10,
    maximumFractionDigits: parsed >= 100 ? 2 : parsed >= 1 ? 5 : 8,
  });
};

const pct = (value) => {
  const parsed = finite(value);
  return parsed == null ? '—' : `${parsed > 0 ? '+' : ''}${parsed.toFixed(3)}%`;
};

export function classifyAiSignalReviewPass(row = {}, rule = AI_SIGNAL_REVIEW_PASS_RULE) {
  const hours = Math.max(1, Math.trunc(finite(rule.horizonHours, 4)));
  const cost = Math.max(0, finite(rule.roundTripCostPct, 0.12));
  const minImprovement = Math.max(0, finite(rule.minEntryImprovementPct, 0.10));
  const market = row.horizons?.[hours]?.market;
  const zone = row.horizons?.[hours]?.zone;
  const marketNetPct = market?.state === 'READY' ? finite(market.grossPct) - cost : null;
  const zoneNetPct = zone?.state === 'READY' ? finite(zone.grossPct) - cost : null;
  const entryImprovementPct = marketNetPct == null || zoneNetPct == null
    ? null : zoneNetPct - marketNetPct;
  const checks = {
    immutableSnapshot: !rule.requireSentSnapshot || row.historyQuality === 'SENT_SNAPSHOT',
    independent4h: !rule.requireIndependent4h || row.independent4h === true,
    directionCorrect: marketNetPct != null && marketNetPct > 0,
    originalEntryTouched: zone?.state === 'READY',
    originalEntryProfitable: zoneNetPct != null && zoneNetPct > 0,
    entryImproved: entryImprovementPct != null && entryImprovementPct >= minImprovement,
    followThroughObserved: finite(zone?.mfePct) != null && finite(zone?.maePct) != null,
  };
  return {
    version: AI_SIGNAL_REVIEW_DISCORD_VERSION,
    pass: Object.values(checks).every(Boolean),
    hours,
    costPct: cost,
    minEntryImprovementPct: minImprovement,
    marketNetPct,
    zoneNetPct,
    entryImprovementPct,
    checks,
  };
}

export function buildAiSignalReviewDiscordPayload(row = {}, classification = {}, baseUrl) {
  const root = validBaseUrl(baseUrl);
  const side = String(row.side ?? '').toUpperCase();
  const isLong = side === 'LONG';
  const outcome = row.horizons?.[classification.hours ?? 4]?.zone ?? {};
  const btc = row.btcReconstructed ?? {};
  const sentAt = finite(row.sentAt, Date.now());
  return {
    username: 'AI Signal Review',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${isLong ? '🟢' : '🔴'} HẬU KIỂM PASS · ${side} · ${row.symbol}`,
      color: isLong ? 0x16c784 : 0xf43f5e,
      description: `**TÍN HIỆU ĐÚNG + ĐIỂM VÀO GỐC TỐT HƠN · HẬU KIỂM ${classification.hours}H.** Đây là kết quả nhìn lại sau khi đủ nến, không phải tín hiệu vào lệnh mới và không xác nhận Binance đã khớp.`,
      fields: [
        {
          name: 'KẾT QUẢ SAU CHI PHÍ',
          value: `Vào ngay **${pct(classification.marketNetPct)}**\nChờ vùng gốc **${pct(classification.zoneNetPct)}**\nEntry cải thiện **${pct(classification.entryImprovementPct)}**`,
          inline: true,
        },
        {
          name: 'VÙNG ENTRY GỐC',
          value: `**${fmt(row.price?.entryLow)} – ${fmt(row.price?.entryHigh)}**\nGiữa ${fmt(row.zoneMid)} · chờ ${fmt(outcome.waitMinutes)} phút\nMFE ${pct(outcome.mfePct)} · MAE ${pct(outcome.maePct)}`,
          inline: true,
        },
        {
          name: 'TÍN HIỆU GỐC',
          value: `${row.verdict ?? '—'} · điểm ${fmt(row.strength)}/100 · ${row.strengthBand ?? 'UNKNOWN'}\nGửi ${new Date(sentAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\nNguồn ${row.model?.deterministicFallback ? 'ENGINE FALLBACK' : row.model?.applied ? 'OLLAMA' : 'CHƯA RÕ'}`,
          inline: false,
        },
        {
          name: 'BTC / THỊ TRƯỜNG LÚC PHÁT',
          value: `BTC ${btc.momentum ?? 'UNKNOWN'} · 1h ${pct(btc.return1hPct)} · 4h ${pct(btc.return4hPct)}\n${row.market?.regime ?? 'UNKNOWN'} · breadth ${row.breadth?.state ?? 'UNKNOWN'} · ${row.btcAlignment ?? 'UNKNOWN'}`,
          inline: false,
        },
        {
          name: 'MỞ MÀN HÌNH',
          value: `[Đánh giá tín hiệu](${root}/ai-signal-review) · [Coin Level](${root}/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}) · [Binance](https://www.binance.com/vi/futures/${encodeURIComponent(row.symbol)})`,
          inline: false,
        },
      ],
      footer: { text: `${AI_SIGNAL_REVIEW_DISCORD_VERSION} · OBSERVE ONLY · không MARKET · không đổi size/SL/TP` },
      timestamp: new Date(finite(outcome.exitAt, Date.now())).toISOString(),
    }],
  };
}

function freshState(now) {
  return {
    version: AI_SIGNAL_REVIEW_DISCORD_VERSION,
    initializedAt: now,
    updatedAt: now,
    baselineComplete: false,
    baselineAt: null,
    baselineHorizons: { 1: false, 4: false },
    records: {},
    recent: [],
  };
}

async function writeJsonAtomic(path, payload) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

export class LocalAiSignalReviewDiscordNotifier {
  constructor({ stateFile, webhookUrl, baseUrl, fetchImpl = globalThis.fetch, now = () => Date.now(), maxPerRun = 10 } = {}) {
    this.stateFile = stateFile;
    this.webhookUrl = typeof webhookUrl === 'function' ? webhookUrl : () => webhookUrl;
    this.baseUrl = typeof baseUrl === 'function' ? baseUrl : () => baseUrl;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.maxPerRun = Math.max(1, Math.min(20, Math.trunc(finite(maxPerRun, 10))));
    this.state = null;
    this.queue = Promise.resolve();
  }

  configured() { return Boolean(validWebhook(this.webhookUrl?.())); }

  snapshot() {
    return {
      version: AI_SIGNAL_REVIEW_DISCORD_VERSION,
      configured: this.configured(),
      observeOnly: true,
      binanceEligible: false,
      baselineComplete: this.state?.baselineComplete === true,
      baselineAt: this.state?.baselineAt ?? null,
      baselineHorizons: this.state?.baselineHorizons ?? { 1: false, 4: false },
      sent: Object.values(this.state?.records ?? {}).filter((record) => record.status === 'SENT').length,
      updatedAt: this.state?.updatedAt ?? null,
      rules: AI_SIGNAL_REVIEW_PASS_RULES,
    };
  }

  async load() {
    if (this.state) return this.state;
    const now = this.now();
    try {
      const parsed = JSON.parse(await readFile(this.stateFile, 'utf8'));
      this.state = {
        ...freshState(now), ...parsed,
        version: AI_SIGNAL_REVIEW_DISCORD_VERSION,
        baselineHorizons: parsed?.baselineHorizons && typeof parsed.baselineHorizons === 'object'
          ? { 1: parsed.baselineHorizons[1] === true, 4: parsed.baselineHorizons[4] === true }
          : { 1: false, 4: parsed?.baselineComplete === true },
        records: parsed?.records && typeof parsed.records === 'object' ? parsed.records : {},
        recent: Array.isArray(parsed?.recent) ? parsed.recent : [],
      };
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[AiSignalReviewDiscord] state reset: ${error.message}`);
      this.state = freshState(now);
    }
    return this.state;
  }

  evaluate(report = {}) {
    this.queue = this.queue.catch(() => {}).then(() => this.#evaluate(report));
    return this.queue;
  }

  async #post(payload) {
    const webhook = validWebhook(this.webhookUrl?.());
    if (!webhook) return { sent: false, error: 'WEBHOOK_NOT_CONFIGURED' };
    try {
      const response = await this.fetchImpl(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok ? { sent: true } : { sent: false, error: `HTTP_${response.status}` };
    } catch (error) {
      return { sent: false, error: error?.message ?? 'NETWORK_ERROR' };
    }
  }

  async #evaluate(report) {
    if (!this.configured()) return { configured: false, sent: 0, pass: 0 };
    if (report?.partial === true || !Array.isArray(report?.rows)) {
      return { configured: true, skipped: true, reason: 'REPORT_NOT_COMPLETE', sent: 0 };
    }
    const state = await this.load();
    const now = this.now();
    const passed = report.rows.flatMap((row) => AI_SIGNAL_REVIEW_PASS_RULES.map((rule) => ({
      row,
      classification: classifyAiSignalReviewPass(row, rule),
    })))
      .filter((item) => item.classification.pass && item.row.eventId)
      .map((item) => ({ ...item, reviewEventId: `${item.row.eventId}|${item.classification.hours}H` }))
      .sort((left, right) => left.row.sentAt - right.row.sentAt
        || left.classification.hours - right.classification.hours);
    const missingBaselineHorizons = [1, 4].filter((hours) => state.baselineHorizons?.[hours] !== true);
    if (missingBaselineHorizons.length) {
      const baselineRows = passed.filter(({ classification }) => missingBaselineHorizons.includes(classification.hours));
      for (const { row, classification, reviewEventId } of baselineRows) state.records[reviewEventId] = {
        eventId: row.eventId, reviewEventId, horizonHours: classification.hours,
        symbol: row.symbol, side: row.side, status: 'BASELINED',
        classifiedAt: now, classification,
      };
      state.baselineHorizons = { ...(state.baselineHorizons ?? {}) };
      for (const hours of missingBaselineHorizons) state.baselineHorizons[hours] = true;
      state.baselineComplete = [1, 4].every((hours) => state.baselineHorizons[hours] === true);
      state.baselineAt = now;
      state.updatedAt = now;
      await writeJsonAtomic(this.stateFile, state);
      return { configured: true, baselined: baselineRows.length, baselineHorizons: missingBaselineHorizons,
        sent: 0, pass: passed.length };
    }
    let sent = 0;
    for (const { row, classification, reviewEventId } of passed) {
      const legacy4hSent = classification.hours === 4 && state.records[row.eventId];
      if (state.records[reviewEventId] || legacy4hSent || sent >= this.maxPerRun) continue;
      const result = await this.#post(buildAiSignalReviewDiscordPayload(row, classification, this.baseUrl?.()));
      if (!result.sent) {
        state.recent.unshift({ eventId: row.eventId, reviewEventId, horizonHours: classification.hours,
          symbol: row.symbol, side: row.side, status: 'FAILED', error: result.error, at: now });
        continue;
      }
      state.records[reviewEventId] = {
        eventId: row.eventId, reviewEventId, horizonHours: classification.hours,
        symbol: row.symbol, side: row.side, status: 'SENT',
        classifiedAt: now, sentAt: this.now(), classification,
      };
      state.recent.unshift({ eventId: row.eventId, reviewEventId, horizonHours: classification.hours,
        symbol: row.symbol, side: row.side, status: 'SENT', at: this.now() });
      sent++;
    }
    state.recent = state.recent.slice(0, 100);
    state.updatedAt = this.now();
    await writeJsonAtomic(this.stateFile, state);
    return { configured: true, sent, pass: passed.length,
      passByHorizon: Object.fromEntries([1, 4].map((hours) => [hours,
        passed.filter((item) => item.classification.hours === hours).length])),
      pending: passed.filter(({ reviewEventId }) => !state.records[reviewEventId]).length };
  }
}

export function classifyBtcExtremeMove(health = {}, {
  min15mPct = 0.75,
  min1hPct = 1.50,
  min4hPct = 3.00,
} = {}) {
  const return15mPct = finite(health.btcRelativeReturn15mPct);
  const return1hPct = finite(health.btcRelativeReturn1hPct);
  const return4hPct = finite(health.btcRelativeReturn4hPct);
  const closedAt = finite(health.btcRelativeReturnClosedAt);
  if (health.seeding === true || return15mPct == null || return1hPct == null
    || return4hPct == null || !(closedAt > 0)) {
    return { ready: false, direction: 'NEUTRAL', level: 0, reason: 'Thiếu return BTC đã đóng' };
  }
  const up = (return15mPct >= min15mPct && return1hPct >= 0)
    || (return1hPct >= min1hPct && return15mPct >= 0)
    || (return4hPct >= min4hPct && return1hPct >= -0.25);
  const down = (return15mPct <= -min15mPct && return1hPct <= 0)
    || (return1hPct <= -min1hPct && return15mPct <= 0)
    || (return4hPct <= -min4hPct && return1hPct <= 0.25);
  const direction = up && !down ? 'UP' : down && !up ? 'DOWN' : 'NEUTRAL';
  const ratio = direction === 'NEUTRAL' ? 0 : Math.max(
    Math.abs(return15mPct) / Math.max(0.01, min15mPct),
    Math.abs(return1hPct) / Math.max(0.01, min1hPct),
    Math.abs(return4hPct) / Math.max(0.01, min4hPct),
  );
  const level = ratio >= 2 ? 3 : ratio >= 1.5 ? 2 : ratio >= 1 ? 1 : 0;
  return {
    ready: true,
    direction,
    level,
    closedAt,
    return15mPct,
    return1hPct,
    return4hPct,
    min15mPct,
    min1hPct,
    min4hPct,
    reason: direction === 'DOWN' ? 'BTC giảm cực mạnh trên dữ liệu đã đóng'
      : direction === 'UP' ? 'BTC tăng cực nóng trên dữ liệu đã đóng'
        : 'BTC chưa đạt ngưỡng cực đoan',
  };
}

export function buildBtcExtremeMoveDiscordPayload(health = {}, move = {}, baseUrl, now = Date.now()) {
  const root = validBaseUrl(baseUrl);
  const down = move.direction === 'DOWN';
  const intensity = move.level >= 3 ? 'CỰC ĐOAN' : move.level >= 2 ? 'RẤT MẠNH' : 'MẠNH';
  return {
    username: 'BTC Extreme Move Alert',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${down ? '🔴 BTC SẬP RẤT SÂU' : '🟢 BTC TĂNG RẤT NÓNG'} · ${intensity}`,
      color: down ? 0xef4444 : 0x22c55e,
      description: '**CẢNH BÁO BTC LIVE · NẾN ĐÃ ĐÓNG · OBSERVE ONLY.** Biến động BTC đã vượt ngưỡng cực đoan; đây là cảnh báo quản trị bối cảnh, không phải lệnh LONG/SHORT hay xác nhận đảo chiều.',
      fields: [
        {
          name: 'BIẾN ĐỘNG BTC',
          value: `15m **${pct(move.return15mPct)}** · 1h **${pct(move.return1hPct)}** · 4h **${pct(move.return4hPct)}**\nNgưỡng ${pct(move.min15mPct)} / 15m, ${pct(move.min1hPct)} / 1h hoặc ${pct(move.min4hPct)} / 4h`,
          inline: false,
        },
        {
          name: 'TRẠNG THÁI HIỆN TẠI',
          value: `Giá **${fmt(health.price)}** · trend 1h **${String(health.btcTrendDir ?? '—').toUpperCase()}** · 4h **${String(health.btcTrendDir4h ?? '—').toUpperCase()}**\nRSI 1h ${fmt(health.rsi1h)} · RSI 4h ${fmt(health.rsi4h)} · funding ${pct(health.fundingRate)}`,
          inline: false,
        },
        {
          name: 'Ý NGHĨA',
          value: down
            ? 'BTC đang giảm cực mạnh; cần đánh giá lại toàn bộ LONG và tránh coi một nhịp hồi ngắn là đảo chiều.'
            : 'BTC đang tăng cực nóng; cần đánh giá lại toàn bộ SHORT và tránh đuổi giá khi động lượng đã mở rộng.',
          inline: false,
        },
        {
          name: 'MỞ MÀN HÌNH',
          value: `[Đánh giá tín hiệu](${root}/ai-signal-review) · [AI Local](${root}/local-ai-trend-evaluation) · [BTC Session](${root}/btc-session-watch.html)`,
          inline: false,
        },
      ],
      footer: { text: `${BTC_EXTREME_MOVE_DISCORD_VERSION} · cooldown + escalation dedupe · không Binance` },
      timestamp: new Date(finite(move.closedAt, now)).toISOString(),
    }],
  };
}

export class BtcExtremeMoveDiscordNotifier {
  constructor({
    stateFile,
    webhookUrl,
    baseUrl,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    min15mPct = 0.75,
    min1hPct = 1.50,
    min4hPct = 3.00,
    cooldownMs = 60 * 60_000,
  } = {}) {
    this.stateFile = stateFile;
    this.webhookUrl = typeof webhookUrl === 'function' ? webhookUrl : () => webhookUrl;
    this.baseUrl = typeof baseUrl === 'function' ? baseUrl : () => baseUrl;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.min15mPct = Math.max(0.1, finite(min15mPct, 0.75));
    this.min1hPct = Math.max(0.2, finite(min1hPct, 1.50));
    this.min4hPct = Math.max(0.5, finite(min4hPct, 3.00));
    this.cooldownMs = Math.max(5 * 60_000, finite(cooldownMs, 60 * 60_000));
    this.state = null;
    this.queue = Promise.resolve();
  }

  configured() { return Boolean(validWebhook(this.webhookUrl?.())); }

  snapshot() {
    return {
      version: BTC_EXTREME_MOVE_DISCORD_VERSION,
      configured: this.configured(),
      observeOnly: true,
      binanceEligible: false,
      initialized: this.state?.initialized === true,
      direction: this.state?.direction ?? 'NEUTRAL',
      level: this.state?.level ?? 0,
      lastNotifiedAt: this.state?.lastNotifiedAt ?? null,
      thresholds: { min15mPct: this.min15mPct, min1hPct: this.min1hPct, min4hPct: this.min4hPct },
    };
  }

  async load() {
    if (this.state) return this.state;
    const now = this.now();
    try {
      const parsed = JSON.parse(await readFile(this.stateFile, 'utf8'));
      this.state = {
        version: BTC_EXTREME_MOVE_DISCORD_VERSION,
        initialized: parsed?.initialized === true,
        direction: parsed?.direction ?? 'NEUTRAL',
        level: finite(parsed?.level, 0),
        closedAt: finite(parsed?.closedAt),
        lastEventId: parsed?.lastEventId ?? null,
        lastNotifiedAt: finite(parsed?.lastNotifiedAt),
        updatedAt: finite(parsed?.updatedAt, now),
      };
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[BtcExtremeDiscord] state reset: ${error.message}`);
      this.state = {
        version: BTC_EXTREME_MOVE_DISCORD_VERSION,
        initialized: false,
        direction: 'NEUTRAL', level: 0, closedAt: null,
        lastEventId: null, lastNotifiedAt: null, updatedAt: now,
      };
    }
    return this.state;
  }

  deliver(health = {}) {
    this.queue = this.queue.catch(() => {}).then(() => this.#deliver(health));
    return this.queue;
  }

  async #post(payload) {
    const webhook = validWebhook(this.webhookUrl?.());
    if (!webhook) return { sent: false, error: 'WEBHOOK_NOT_CONFIGURED' };
    try {
      const response = await this.fetchImpl(webhook, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000),
      });
      return response.ok ? { sent: true } : { sent: false, error: `HTTP_${response.status}` };
    } catch (error) {
      return { sent: false, error: error?.message ?? 'NETWORK_ERROR' };
    }
  }

  async #deliver(health) {
    if (!this.configured()) return { configured: false, sent: 0 };
    const state = await this.load();
    const now = this.now();
    const move = classifyBtcExtremeMove(health, {
      min15mPct: this.min15mPct,
      min1hPct: this.min1hPct,
      min4hPct: this.min4hPct,
    });
    if (!move.ready) return { configured: true, sent: 0, reason: move.reason };
    if (!state.initialized) {
      Object.assign(state, { initialized: true, direction: move.direction, level: move.level, closedAt: move.closedAt, updatedAt: now });
      await writeJsonAtomic(this.stateFile, state);
      return { configured: true, baseline: true, sent: 0, direction: move.direction, level: move.level };
    }
    if (move.direction === 'NEUTRAL') {
      Object.assign(state, { direction: 'NEUTRAL', level: 0, closedAt: move.closedAt, updatedAt: now });
      await writeJsonAtomic(this.stateFile, state);
      return { configured: true, sent: 0, direction: 'NEUTRAL' };
    }
    const eventId = `${move.direction}|${move.level}|${move.closedAt}`;
    const directionChanged = state.direction !== move.direction;
    const escalated = state.direction === move.direction && move.level > finite(state.level, 0);
    const cooldownDone = now - finite(state.lastNotifiedAt, 0) >= this.cooldownMs;
    if (state.lastEventId === eventId || (!directionChanged && !escalated && !cooldownDone)) {
      Object.assign(state, { direction: move.direction, level: Math.max(move.level, finite(state.level, 0)), closedAt: move.closedAt, updatedAt: now });
      await writeJsonAtomic(this.stateFile, state);
      return { configured: true, sent: 0, direction: move.direction, level: move.level, cooldown: true };
    }
    const result = await this.#post(buildBtcExtremeMoveDiscordPayload(health, move, this.baseUrl?.(), now));
    if (result.sent) Object.assign(state, {
      direction: move.direction, level: move.level, closedAt: move.closedAt,
      lastEventId: eventId, lastNotifiedAt: now,
    });
    state.updatedAt = now;
    await writeJsonAtomic(this.stateFile, state);
    return { configured: true, sent: result.sent ? 1 : 0, direction: move.direction, level: move.level, error: result.error };
  }
}
