import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const BINANCE_FILLED_SIGNAL_AUDIT_VERSION =
  'BINANCE_SIGNAL_LIFECYCLE_AUDIT_V2_ALL_REAL_FILLS_AND_CLOSE_PNL_20260905';

export const BINANCE_FILLED_SIGNAL_AUDIT_CSV_COLUMNS = Object.freeze([
  'audit_version',
  'filled_at',
  'logged_at',
  'order_id',
  'client_order_id',
  'symbol',
  'direction',
  'order_side',
  'position_side',
  'order_type',
  'order_status',
  'fill_event_source',
  'signal_source',
  'signal_type',
  'signal_label',
  'entry_reason',
  'execution_page',
  'stream_id',
  'lifecycle_id',
  'matched_keys',
  'signal_combo',
  'signal_entry_price',
  'take_profit_price',
  'stop_loss_price',
  'stop_loss_suppressed',
  'margin_usdt',
  'leverage',
  'filled_qty',
  'cumulative_filled_qty',
  'avg_fill_price',
  'filled_notional_usdt',
  'is_dca',
  'metadata_quality',
  'position_status',
  'close_group_id',
  'closed_at',
  'close_order_ids',
  'close_client_order_id',
  'close_order_type',
  'close_reason',
  'exit_avg_price',
  'closed_qty',
  'gross_realized_pnl_usdt',
  'commission_usdt',
  'funding_pnl_usdt',
  'net_realized_pnl_usdt',
  'realized_roe_pct',
  'outcome',
  'close_event_source',
]);

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function text(value, max = 2_000) {
  return String(value ?? '').trim().slice(0, max);
}

function list(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => text(item, 200))
    .filter(Boolean);
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function iso(value, fallback = Date.now()) {
  const timestamp = finite(value, fallback);
  return new Date(timestamp).toISOString();
}

function csvCell(value) {
  const raw = value == null ? '' : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function submissionKey(prefix, value) {
  const normalized = text(value, 120);
  return normalized ? `${prefix}:${normalized}` : '';
}

function submissionKeys(record = {}) {
  return [
    submissionKey('ORDER', record.orderId),
    submissionKey('CLIENT', record.clientOrderId),
  ].filter(Boolean);
}

function inferredClientOrderType(clientOrderId = '') {
  const id = text(clientOrderId, 80).toLowerCase();
  if (id.startsWith('zlc_')) return 'COINGLASS_ZONE_LIFECYCLE';
  if (id.startsWith('zlr_')) return 'COINGLASS_STRONG_WAVE_REVERSAL';
  if (id.startsWith('cg_')) return 'COINGLASS_QUALIFIED';
  if (id.startsWith('lfv2ui_')) return 'LIQUID_FLOW_V2_MANUAL_CARD';
  if (id.startsWith('lfv2_')) return 'LIQUID_FLOW_V2_AUTO';
  if (id.startsWith('ppks_') || id.startsWith('pks_')) return 'POST_PUMP_KILL_SHORT';
  if (id.startsWith('ekr_')) return 'EMA99_KILL_RECLAIM';
  if (id.startsWith('pda_')) return 'PUMP_DUMP_ABSORPTION';
  if (id.startsWith('liq_probe_')) return 'LIQUID_PROBE';
  if (id.startsWith('liq_mkt_')) return 'LIQUID_MARKET';
  if (id.startsWith('liq_conf_')) return 'LIQUID_CONFIRMED';
  if (id.startsWith('paper_probe_')) return 'PAPER_AUTO_PROBE';
  if (id.startsWith('paper_mkt_')) return 'PAPER_MANUAL_MARKET';
  if (id.startsWith('lp_manual_')) return 'ORDERS_MANUAL';
  if (id.startsWith('lp_auto_')) return 'LEGACY_AUTO_SIGNAL';
  if (id.startsWith('lp_')) return 'BINANCE_REAL_ORDER';
  return '';
}

function directionOf(side, positionSide) {
  const position = text(positionSide, 20).toUpperCase();
  if (position === 'LONG' || position === 'SHORT') return position;
  return text(side, 20).toUpperCase() === 'BUY' ? 'LONG' : 'SHORT';
}

function closeReasonOf(input = {}) {
  const explicit = text(input.closeReason, 500);
  if (explicit) return explicit;
  const orderType = text(input.closeOrderType, 80).toUpperCase();
  const clientId = text(input.closeClientOrderId, 120).toLowerCase();
  if (orderType.includes('TAKE_PROFIT') || /(?:^|_)(?:tp|ptp)(?:_|$)/.test(clientId)) return 'TAKE_PROFIT_FILLED';
  if (orderType.includes('STOP') || /(?:^|_)(?:sl|psl)(?:_|$)/.test(clientId)) return 'STOP_LOSS_FILLED';
  if (/close/.test(clientId)) return 'BOT_OR_MANUAL_CLOSE_FILLED';
  return 'POSITION_CLOSED_ON_BINANCE';
}

export function buildBinanceFilledSignalAuditRecord(input = {}, submission = {}, now = Date.now()) {
  const combined = { ...submission, ...input };
  const matchedKeys = list(firstPresent(input.matchedKeys, submission.matchedKeys));
  const inferredType = inferredClientOrderType(firstPresent(input.clientOrderId, submission.clientOrderId));
  const providedSignalSource = text(firstPresent(
    input.signalSource,
    submission.signalSource,
  ), 180);
  const signalSource = providedSignalSource || inferredType || 'BINANCE_UNATTRIBUTED';
  const signalType = text(
    firstPresent(
      input.signalType,
      submission.signalType,
      input.signalLabel,
      submission.signalLabel,
      input.signalCombo,
      submission.signalCombo,
      inferredType,
      signalSource,
      'BINANCE_UNATTRIBUTED',
    ),
    300,
  );
  const signalLabel = text(firstPresent(input.signalLabel, submission.signalLabel, inferredType, signalType), 300);
  const signalCombo = text(firstPresent(input.signalCombo, submission.signalCombo), 1_000);
  const reason = text(
    firstPresent(
      input.signalReason,
      submission.signalReason,
      input.entryReason,
      submission.entryReason,
      signalCombo,
      matchedKeys.join(' | '),
      `Binance entry fill từ nguồn ${signalSource || inferredType || 'không xác định'}`,
    ),
    1_500,
  );
  const filledQty = finite(combined.cumulativeFilledQty) > 0
    ? finite(combined.cumulativeFilledQty)
    : finite(combined.filledQty);
  const avgPrice = finite(combined.avgPrice);
  const marginUsdt = finite(firstPresent(input.marginUsdt, submission.marginUsdt));
  const leverage = finite(firstPresent(input.leverage, submission.leverage));
  const metadataQuality = firstPresent(
    input.signalLabel,
    submission.signalLabel,
    input.signalReason,
    submission.signalReason,
    input.signalCombo,
    submission.signalCombo,
  ) || matchedKeys.length
    ? 'RICH'
    : signalSource !== 'BINANCE_UNATTRIBUTED' || inferredType
      ? 'SOURCE_ONLY'
      : 'UNATTRIBUTED';
  return {
    auditVersion: BINANCE_FILLED_SIGNAL_AUDIT_VERSION,
    filledAt: iso(combined.fillTime),
    loggedAt: iso(now),
    orderId: text(combined.orderId, 120) || null,
    clientOrderId: text(combined.clientOrderId, 120) || null,
    symbol: text(combined.symbol, 60).toUpperCase(),
    direction: directionOf(combined.side, combined.positionSide),
    orderSide: text(combined.side, 20).toUpperCase(),
    positionSide: text(combined.positionSide || 'BOTH', 20).toUpperCase(),
    orderType: text(firstPresent(input.orderType, submission.orderType, 'UNKNOWN'), 40).toUpperCase(),
    orderStatus: text(combined.orderStatus || 'FILLED', 40).toUpperCase(),
    fillEventSource: text(combined.source || 'UNKNOWN', 80),
    signalSource: signalSource || inferredType || 'BINANCE_UNATTRIBUTED',
    signalType,
    signalLabel,
    entryReason: reason,
    executionPage: text(firstPresent(input.executionPage, submission.executionPage), 100) || null,
    streamId: text(firstPresent(input.streamId, submission.streamId), 60) || null,
    lifecycleId: text(firstPresent(input.lifecycleId, submission.lifecycleId), 220) || null,
    matchedKeys,
    signalCombo: signalCombo || null,
    signalEntryPrice: finite(firstPresent(input.signalEntryPrice, submission.signalEntryPrice)),
    takeProfitPrice: finite(firstPresent(input.takeProfitPrice, submission.takeProfitPrice)),
    stopLossPrice: finite(firstPresent(input.stopLossPrice, submission.stopLossPrice)),
    stopLossSuppressed: firstPresent(input.stopLossSuppressed, submission.stopLossSuppressed) === true,
    marginUsdt,
    leverage,
    filledQty,
    cumulativeFilledQty: finite(combined.cumulativeFilledQty),
    avgFillPrice: avgPrice,
    filledNotionalUsdt: filledQty != null && avgPrice != null ? filledQty * avgPrice : null,
    isDca: firstPresent(input.isDca, submission.isDca) === true,
    metadataQuality,
    positionStatus: 'OPEN',
    closeGroupId: null,
    closedAt: null,
    closeOrderIds: [],
    closeClientOrderId: null,
    closeOrderType: null,
    closeReason: null,
    exitAvgPrice: null,
    closedQty: null,
    grossRealizedPnlUsdt: null,
    commissionUsdt: null,
    fundingPnlUsdt: null,
    netRealizedPnlUsdt: null,
    realizedRoePct: null,
    outcome: null,
    closeEventSource: null,
  };
}

export function binanceFilledSignalAuditCsvLine(record = {}) {
  const values = {
    audit_version: record.auditVersion,
    filled_at: record.filledAt,
    logged_at: record.loggedAt,
    order_id: record.orderId,
    client_order_id: record.clientOrderId,
    symbol: record.symbol,
    direction: record.direction,
    order_side: record.orderSide,
    position_side: record.positionSide,
    order_type: record.orderType,
    order_status: record.orderStatus,
    fill_event_source: record.fillEventSource,
    signal_source: record.signalSource,
    signal_type: record.signalType,
    signal_label: record.signalLabel,
    entry_reason: record.entryReason,
    execution_page: record.executionPage,
    stream_id: record.streamId,
    lifecycle_id: record.lifecycleId,
    matched_keys: list(record.matchedKeys).join(' | '),
    signal_combo: record.signalCombo,
    signal_entry_price: record.signalEntryPrice,
    take_profit_price: record.takeProfitPrice,
    stop_loss_price: record.stopLossPrice,
    stop_loss_suppressed: record.stopLossSuppressed ? 'true' : 'false',
    margin_usdt: record.marginUsdt,
    leverage: record.leverage,
    filled_qty: record.filledQty,
    cumulative_filled_qty: record.cumulativeFilledQty,
    avg_fill_price: record.avgFillPrice,
    filled_notional_usdt: record.filledNotionalUsdt,
    is_dca: record.isDca ? 'true' : 'false',
    metadata_quality: record.metadataQuality,
    position_status: record.positionStatus ?? 'OPEN',
    close_group_id: record.closeGroupId,
    closed_at: record.closedAt,
    close_order_ids: list(record.closeOrderIds).join(' | '),
    close_client_order_id: record.closeClientOrderId,
    close_order_type: record.closeOrderType,
    close_reason: record.closeReason,
    exit_avg_price: record.exitAvgPrice,
    closed_qty: record.closedQty,
    gross_realized_pnl_usdt: record.grossRealizedPnlUsdt,
    commission_usdt: record.commissionUsdt,
    funding_pnl_usdt: record.fundingPnlUsdt,
    net_realized_pnl_usdt: record.netRealizedPnlUsdt,
    realized_roe_pct: record.realizedRoePct,
    outcome: record.outcome,
    close_event_source: record.closeEventSource,
  };
  return BINANCE_FILLED_SIGNAL_AUDIT_CSV_COLUMNS.map((column) => csvCell(values[column])).join(',');
}

export function buildBinanceFilledSignalAuditDiscordPayload(record = {}) {
  const isLong = record.direction === 'LONG';
  const fillText = [
    `Giá: **${record.avgFillPrice ?? '-'}**`,
    `Qty: **${record.filledQty ?? '-'}**`,
    `Notional: **${record.filledNotionalUsdt == null ? '-' : `$${record.filledNotionalUsdt.toFixed(4)}`}**`,
  ].join('\n');
  const marginText = record.marginUsdt != null
    ? `$${record.marginUsdt} × ${record.leverage ?? '-'}x`
    : `không xác định × ${record.leverage ?? '-'}x`;
  const planText = [
    `Signal entry: **${record.signalEntryPrice ?? '-'}**`,
    `TP: **${record.takeProfitPrice ?? '-'}**`,
    `SL: **${record.stopLossSuppressed ? 'SUPPRESSED' : record.stopLossPrice ?? '-'}**`,
  ].join('\n');
  return {
    username: 'Binance Filled Signal Audit',
    embeds: [{
      title: `[FILLED] ${record.symbol} · ${record.direction} · ${record.signalLabel || record.signalType}`.slice(0, 256),
      color: isLong ? 0x22c55e : 0xef4444,
      description: `**Nguyên nhân vào**\n${text(record.entryReason, 3_500)}`,
      fields: [
        { name: 'Loại tín hiệu', value: text(record.signalType || '-', 1_024), inline: false },
        { name: 'Nguồn / stream', value: `${record.signalSource || '-'}${record.streamId ? ` / ${record.streamId}` : ''}`.slice(0, 1_024), inline: true },
        { name: 'Margin / leverage', value: marginText.slice(0, 1_024), inline: true },
        { name: 'Khớp lệnh', value: fillText.slice(0, 1_024), inline: false },
        { name: 'Kế hoạch lúc vào', value: planText.slice(0, 1_024), inline: false },
        ...(record.signalCombo ? [{ name: 'Combo tại entry', value: text(record.signalCombo, 1_024), inline: false }] : []),
        ...(record.matchedKeys?.length ? [{ name: 'Matcher/whitelist', value: record.matchedKeys.join('\n').slice(0, 1_024), inline: false }] : []),
        { name: 'Order', value: `#${record.orderId ?? '-'}\nclient: ${record.clientOrderId ?? '-'}`.slice(0, 1_024), inline: true },
        { name: 'Mode', value: `${record.orderType} · ${record.isDca ? 'DCA' : 'NEW/INCREASE'} · ${record.metadataQuality}`.slice(0, 1_024), inline: true },
        ...(record.executionPage || record.lifecycleId ? [{
          name: 'Execution context',
          value: `${record.executionPage ?? '-'}\n${record.lifecycleId ?? '-'}`.slice(0, 1_024),
          inline: false,
        }] : []),
      ],
      footer: { text: BINANCE_FILLED_SIGNAL_AUDIT_VERSION },
      timestamp: record.filledAt,
    }],
  };
}

export function buildBinanceClosedSignalAuditDiscordPayload({ records = [], close = {} } = {}) {
  const primary = records.find((record) => record.isDca !== true) ?? records[0] ?? {};
  const labels = [...new Set(records.map((record) => record.signalLabel || record.signalType).filter(Boolean))];
  const types = [...new Set(records.map((record) => record.signalType).filter(Boolean))];
  const net = finite(close.netRealizedPnlUsdt, 0);
  const roe = finite(close.realizedRoePct, 0);
  const outcome = net > 0 ? 'WIN' : net < 0 ? 'LOSS' : 'BREAKEVEN';
  const color = net > 0 ? 0x22c55e : net < 0 ? 0xef4444 : 0xf59e0b;
  return {
    username: 'Binance Closed Signal Audit',
    embeds: [{
      title: `[CLOSED · ${outcome}] ${primary.symbol ?? close.symbol ?? '-'} · ${primary.direction ?? close.direction ?? '-'} · ${labels.join(' + ') || 'UNATTRIBUTED'}`.slice(0, 256),
      color,
      description: `**Loại tín hiệu gốc**\n${text(types.join(' + ') || primary.signalType || 'UNATTRIBUTED', 3_500)}`,
      fields: [
        { name: 'Nhãn lệnh', value: text(labels.join('\n') || '-', 1_024), inline: false },
        { name: 'Nguyên nhân vào', value: text(primary.entryReason || '-', 1_024), inline: false },
        { name: 'Kết quả thực', value: `Gross: **${finite(close.grossRealizedPnlUsdt, 0).toFixed(6)} USDT**\nFee: **-${finite(close.commissionUsdt, 0).toFixed(6)} USDT**\nFunding: **${finite(close.fundingPnlUsdt, 0).toFixed(6)} USDT**\nNet: **${net.toFixed(6)} USDT**\nROE: **${roe.toFixed(2)}%**`, inline: true },
        { name: 'Đóng lệnh', value: `Lý do: **${close.closeReason ?? '-'}**\nGiá TB: **${close.exitAvgPrice ?? '-'}**\nQty: **${close.closedQty ?? '-'}**`, inline: true },
        { name: 'Entry audit', value: `Fills: **${records.length}**\nMargin tổng: **$${finite(close.totalMarginUsdt, 0).toFixed(4)}**\nEntry orders: ${records.map((record) => record.orderId).filter(Boolean).join(', ') || '-'}`.slice(0, 1_024), inline: false },
        { name: 'Close order', value: `${list(close.closeOrderIds).join(', ') || '-'}\nclient: ${close.closeClientOrderId ?? '-'}\ntype: ${close.closeOrderType ?? '-'}`.slice(0, 1_024), inline: false },
        { name: 'Nguồn', value: `${primary.signalSource ?? '-'} / ${close.closeEventSource ?? '-'}`.slice(0, 1_024), inline: false },
      ],
      footer: { text: BINANCE_FILLED_SIGNAL_AUDIT_VERSION },
      timestamp: close.closedAt ?? new Date().toISOString(),
    }],
  };
}

async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export class BinanceFilledSignalAudit {
  constructor({ rootDir, dataDir = null, webhookUrl = null, closeWebhookUrl = null, fetchImpl = fetch } = {}) {
    if (!rootDir && !dataDir) throw new Error('rootDir or dataDir is required');
    this.dataDir = dataDir ?? join(rootDir, 'data', 'binance-filled-signal-audit');
    this.csvFile = join(this.dataDir, 'binance-filled-signals.csv');
    this.stateFile = join(this.dataDir, 'state.json');
    this.webhookUrl = typeof webhookUrl === 'function' ? webhookUrl : () => text(webhookUrl, 2_000);
    this.closeWebhookUrl = typeof closeWebhookUrl === 'function'
      ? closeWebhookUrl
      : () => text(closeWebhookUrl, 2_000);
    this.fetchImpl = fetchImpl;
    this.state = null;
    this.queue = Promise.resolve();
  }

  async init() {
    if (this.state) return this.state;
    const saved = await readJson(this.stateFile, null);
    this.state = {
      version: BINANCE_FILLED_SIGNAL_AUDIT_VERSION,
      submissions: saved?.submissions && typeof saved.submissions === 'object' ? saved.submissions : {},
      fills: saved?.fills && typeof saved.fills === 'object' ? saved.fills : {},
      updatedAt: saved?.updatedAt ?? null,
    };
    await this.ensureCsv();
    return this.state;
  }

  async ensureCsv() {
    await mkdir(this.dataDir, { recursive: true });
    let csvSize = 0;
    try { csvSize = Number((await stat(this.csvFile)).size) || 0; } catch {}
    if (csvSize === 0) {
      await appendFile(this.csvFile, `${BINANCE_FILLED_SIGNAL_AUDIT_CSV_COLUMNS.join(',')}\n`, 'utf8');
      return;
    }
    const expectedHeader = BINANCE_FILLED_SIGNAL_AUDIT_CSV_COLUMNS.join(',');
    const existingHeader = (await readFile(this.csvFile, 'utf8')).split(/\r?\n/, 1)[0];
    if (existingHeader !== expectedHeader && this.state) {
      await this.rewriteCsv();
    }
  }

  async rewriteCsv() {
    await mkdir(this.dataDir, { recursive: true });
    const records = Object.values(this.state.fills ?? {})
      .map((fill) => fill?.record)
      .filter(Boolean)
      .sort((left, right) => Date.parse(left.filledAt) - Date.parse(right.filledAt));
    const content = [
      BINANCE_FILLED_SIGNAL_AUDIT_CSV_COLUMNS.join(','),
      ...records.map((record) => binanceFilledSignalAuditCsvLine(record)),
    ].join('\n');
    const temporary = `${this.csvFile}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, `${content}\n`, 'utf8');
    await rename(temporary, this.csvFile);
  }

  async sendDiscord(record) {
    const webhookUrl = text(this.webhookUrl(), 2_000);
    if (!webhookUrl) return { sent: false, error: null };
    try {
      const payload = buildBinanceFilledSignalAuditDiscordPayload(record);
      let response = await this.fetchImpl(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 429) {
        const body = await response.json().catch(() => ({}));
        const waitMs = Math.max(500, Math.min(5_000, finite(body?.retry_after, 1) * 1_000));
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        response = await this.fetchImpl(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });
      }
      if (!response.ok) throw new Error(`Discord webhook HTTP ${response.status}`);
      return { sent: true, error: null };
    } catch (error) {
      return { sent: false, error: text(error?.message ?? error, 500) };
    }
  }

  async sendCloseDiscord(records, close) {
    const webhookUrl = text(this.closeWebhookUrl(), 2_000);
    if (!webhookUrl) return { sent: false, error: null };
    try {
      const payload = buildBinanceClosedSignalAuditDiscordPayload({ records, close });
      let response = await this.fetchImpl(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 429) {
        const body = await response.json().catch(() => ({}));
        const waitMs = Math.max(500, Math.min(5_000, finite(body?.retry_after, 1) * 1_000));
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        response = await this.fetchImpl(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });
      }
      if (!response.ok) throw new Error(`Discord close webhook HTTP ${response.status}`);
      return { sent: true, error: null };
    } catch (error) {
      return { sent: false, error: text(error?.message ?? error, 500) };
    }
  }

  enqueue(work) {
    const next = this.queue.catch(() => {}).then(work);
    this.queue = next;
    return next;
  }

  async save() {
    const now = Date.now();
    const cutoff = now - 45 * 24 * 60 * 60_000;
    const submissions = Object.fromEntries(Object.entries(this.state.submissions ?? {})
      .filter(([, value]) => finite(value?.submittedAt, now) >= cutoff));
    const fills = Object.fromEntries(Object.entries(this.state.fills ?? {})
      .sort(([, left], [, right]) => finite(right?.recordedAt, 0) - finite(left?.recordedAt, 0))
      .slice(0, 10_000));
    this.state = {
      version: BINANCE_FILLED_SIGNAL_AUDIT_VERSION,
      submissions,
      fills,
      updatedAt: new Date(now).toISOString(),
    };
    await atomicWriteJson(this.stateFile, this.state);
  }

  registerSubmission(input = {}) {
    return this.enqueue(async () => {
      await this.init();
      const context = {
        ...input,
        orderId: text(input.orderId, 120) || null,
        clientOrderId: text(input.clientOrderId, 120) || null,
        submittedAt: finite(input.submittedAt, Date.now()),
      };
      const keys = submissionKeys(context);
      if (!keys.length) return { registered: false, reason: 'missing_order_identity' };
      const previous = keys.map((key) => this.state.submissions[key]).find(Boolean) ?? {};
      const merged = { ...previous, ...context };
      for (const key of submissionKeys(merged)) this.state.submissions[key] = merged;
      await this.save();
      return { registered: true, keys };
    });
  }

  getOpenPositionContext(symbol, direction = null) {
    return this.enqueue(async () => {
      await this.init();
      const normalizedSymbol = text(symbol, 60).toUpperCase();
      const normalizedDirection = text(direction, 20).toUpperCase();
      const records = Object.values(this.state.fills ?? {})
        .map((fill) => fill?.record)
        .filter((record) => record
          && record.positionStatus !== 'CLOSED'
          && record.symbol === normalizedSymbol
          && (!normalizedDirection || record.direction === normalizedDirection))
        .sort((left, right) => Date.parse(left.filledAt) - Date.parse(right.filledAt));
      return {
        symbol: normalizedSymbol,
        direction: normalizedDirection || records[0]?.direction || null,
        records,
        openedAt: records[0]?.filledAt ?? null,
      };
    });
  }

  recordFill(input = {}) {
    return this.enqueue(async () => {
      await this.init();
      if (text(input.orderStatus || 'FILLED', 40).toUpperCase() !== 'FILLED') {
        return { recorded: false, reason: 'not_filled' };
      }
      const keys = submissionKeys(input);
      const submission = keys.map((key) => this.state.submissions[key]).find(Boolean) ?? {};
      const record = buildBinanceFilledSignalAuditRecord(input, submission);
      const dedupeKey = submissionKey('ORDER', record.orderId)
        || submissionKey('CLIENT', record.clientOrderId)
        || `FALLBACK:${record.symbol}:${record.orderSide}:${record.filledAt}`;
      const existing = this.state.fills[dedupeKey] ?? null;
      if (existing?.csvWrittenAt) {
        if (!existing.discordSentAt && text(this.webhookUrl(), 2_000)) {
          const discord = await this.sendDiscord(existing.record ?? record);
          existing.discordError = discord.error;
          if (discord.sent) existing.discordSentAt = Date.now();
          await this.save();
          return {
            recorded: false,
            duplicate: true,
            discordSent: discord.sent,
            discordError: discord.error,
            record: existing.record ?? record,
          };
        }
        return { recorded: false, duplicate: true, discordSent: true, record: existing.record ?? record };
      }

      await this.ensureCsv();
      await appendFile(this.csvFile, `${binanceFilledSignalAuditCsvLine(record)}\n`, 'utf8');

      const fillState = {
        record,
        recordedAt: Date.now(),
        csvWrittenAt: Date.now(),
        discordSentAt: null,
        discordError: null,
      };
      this.state.fills[dedupeKey] = fillState;
      const discord = await this.sendDiscord(record);
      const discordSent = discord.sent;
      fillState.discordError = discord.error;
      if (discordSent) fillState.discordSentAt = Date.now();
      await this.save();
      return {
        recorded: true,
        duplicate: false,
        discordSent,
        discordError: fillState.discordError,
        csvFile: this.csvFile,
        record,
      };
    });
  }


  recordPositionClose(input = {}) {
    return this.enqueue(async () => {
      await this.init();
      const symbol = text(input.symbol, 60).toUpperCase();
      const direction = text(input.direction, 20).toUpperCase();
      const candidates = Object.entries(this.state.fills ?? {})
        .filter(([, fill]) => {
          const record = fill?.record;
          if (!record || record.positionStatus === 'CLOSED') return false;
          if (record.symbol !== symbol) return false;
          return !direction || record.direction === direction;
        })
        .sort(([, left], [, right]) => Date.parse(left.record.filledAt) - Date.parse(right.record.filledAt));
      if (!candidates.length) {
        return { recorded: false, reason: 'no_open_entry_audit', symbol, direction };
      }

      const records = candidates.map(([, fill]) => fill.record);
      const weights = records.map((record) => Math.max(0, finite(record.filledNotionalUsdt, 0)));
      const totalWeight = weights.reduce((sum, value) => sum + value, 0);
      const totalMarginUsdt = records.reduce((sum, record) => sum + Math.max(0, finite(record.marginUsdt, 0)), 0);
      const gross = finite(input.grossRealizedPnlUsdt, 0);
      const commission = Math.abs(finite(input.commissionUsdt, 0));
      const funding = finite(input.fundingPnlUsdt, 0);
      const net = finite(input.netRealizedPnlUsdt, gross - commission + funding);
      const roe = totalMarginUsdt > 0 ? net / totalMarginUsdt * 100 : null;
      const closedAt = iso(input.closedAt);
      const close = {
        symbol,
        direction: direction || records[0]?.direction,
        closedAt,
        closeOrderIds: list(input.closeOrderIds),
        closeClientOrderId: text(input.closeClientOrderId, 120) || null,
        closeOrderType: text(input.closeOrderType, 80).toUpperCase() || null,
        closeReason: closeReasonOf(input),
        exitAvgPrice: finite(input.exitAvgPrice),
        closedQty: finite(input.closedQty),
        grossRealizedPnlUsdt: gross,
        commissionUsdt: commission,
        fundingPnlUsdt: funding,
        netRealizedPnlUsdt: net,
        realizedRoePct: roe,
        outcome: net > 0 ? 'WIN' : net < 0 ? 'LOSS' : 'BREAKEVEN',
        closeEventSource: text(input.closeEventSource || 'BINANCE_POSITION_CLOSE', 100),
        totalMarginUsdt,
      };
      close.closeGroupId = `${symbol}:${close.direction}:${close.closeOrderIds.at(-1) ?? closedAt}`;
      candidates.forEach(([key, fill], index) => {
        const allocation = totalWeight > 0 ? weights[index] / totalWeight : 1 / candidates.length;
        fill.record = {
          ...fill.record,
          positionStatus: 'CLOSED',
          closeGroupId: close.closeGroupId,
          closedAt: close.closedAt,
          closeOrderIds: close.closeOrderIds,
          closeClientOrderId: close.closeClientOrderId,
          closeOrderType: close.closeOrderType,
          closeReason: close.closeReason,
          exitAvgPrice: close.exitAvgPrice,
          closedQty: close.closedQty == null ? null : close.closedQty * allocation,
          grossRealizedPnlUsdt: gross * allocation,
          commissionUsdt: commission * allocation,
          fundingPnlUsdt: funding * allocation,
          netRealizedPnlUsdt: net * allocation,
          realizedRoePct: fill.record.marginUsdt > 0
            ? (net * allocation) / fill.record.marginUsdt * 100
            : null,
          outcome: close.outcome,
          closeEventSource: close.closeEventSource,
        };
        fill.closedAt = Date.now();
        this.state.fills[key] = fill;
      });
      await this.save();
      await this.rewriteCsv();
      const discord = await this.sendCloseDiscord(records, close);
      for (const [key, fill] of candidates) {
        fill.closeDiscordSentAt = discord.sent ? Date.now() : null;
        fill.closeDiscordError = discord.error;
        this.state.fills[key] = fill;
      }
      await this.save();
      return {
        recorded: true,
        symbol,
        direction: close.direction,
        records: records.length,
        close,
        discordSent: discord.sent,
        discordError: discord.error,
        csvFile: this.csvFile,
      };
    });
  }
}
