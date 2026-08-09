import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const LIVE_CARD_BINANCE_LIFECYCLE_VERSION = 'LIVE_CARD_BINANCE_LIFECYCLE_V2_20260804';
export const LIVE_CARD_WHITELIST_PNL_STATS_VERSION = 'LIVE_CARD_WHITELIST_PNL_STATS_V4_20260809_SIDE_SPLIT';
export const LIVE_CARD_ENTRY_FAST_PATH_VERSION = 'LIVE_CARD_ENTRY_FAST_PATH_V1_20260809';

const CLOSABLE_STATUSES = new Set([
  'ENTRY_PREPARING',
  'ENTRY_SUBMITTED',
  'ENTRY_PARTIALLY_FILLED',
  'ENTRY_FILLED',
  'PROTECTED',
  'PROTECTION_FAILED',
  'BOT_CLOSE_FAILED',
]);
const POSITION_TRACKED_STATUSES = new Set([
  ...CLOSABLE_STATUSES,
  'BOT_CLOSE_REQUESTED',
  'BOT_CLOSE_SUBMITTED',
]);

const upper = (value) => String(value ?? '').trim().toUpperCase();
const finite = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizedPaperSource = (value) => {
  const source = String(value ?? '').trim().toLowerCase();
  if (source === 'edge' || source === 'edge-short') return 'short-edge';
  if (source === 'liquid-scan') return 'liquid';
  if (source === 'paper') return 'ema';
  return source || 'unknown';
};

export function attachLiveCardPaperOriginals(executions = [], paperTradesBySource = {}) {
  const indexes = new Map();
  for (const [sourceValue, trades] of Object.entries(paperTradesBySource ?? {})) {
    const source = normalizedPaperSource(sourceValue);
    const index = indexes.get(source) ?? new Map();
    for (const trade of Array.isArray(trades) ? trades : []) {
      const id = String(trade?.id ?? '').trim();
      if (id) index.set(id, trade);
    }
    indexes.set(source, index);
  }
  return (Array.isArray(executions) ? executions : []).map((row) => {
    const paperTradeId = String(row?.paperTradeId ?? '').trim();
    if (!paperTradeId) return { ...row, paperOriginal: { mappingStatus: 'MISSING_ID' } };
    const preferredSources = [...new Set([
      normalizedPaperSource(row?.originSourceType),
      normalizedPaperSource(row?.sourceType),
    ])];
    let paper = null;
    let mappingSource = null;
    for (const source of preferredSources) {
      paper = indexes.get(source)?.get(paperTradeId) ?? null;
      if (paper) {
        mappingSource = source;
        break;
      }
    }
    if (!paper) {
      for (const [source, index] of indexes) {
        paper = index.get(paperTradeId) ?? null;
        if (paper) {
          mappingSource = source;
          break;
        }
      }
    }
    if (!paper) return { ...row, paperOriginal: { mappingStatus: 'NOT_FOUND', paperTradeId } };
    const symbolMatches = upper(paper.symbol) === upper(row.symbol);
    const sideMatches = upper(paper.side) === upper(row.side);
    if (!symbolMatches || !sideMatches) {
      return {
        ...row,
        paperOriginal: {
          mappingStatus: 'IDENTITY_MISMATCH',
          paperTradeId,
          mappingSource,
          symbol: paper.symbol ?? null,
          side: paper.side ?? null,
        },
      };
    }
    return {
      ...row,
      paperOriginal: {
        mappingStatus: 'MAPPED',
        paperTradeId,
        mappingSource,
        status: upper(paper.status) || null,
        outcome: upper(paper.outcome) || null,
        entryPrice: finite(paper.entryPrice),
        exitPrice: finite(paper.exitPrice),
        pnl: finite(paper.pnl ?? paper.realizedPnl ?? paper.closedPnl),
        roe: finite(paper.roe ?? paper.realizedRoe ?? paper.closedRoe),
        closedAt: paper.closedAt ?? paper.exitAt ?? null,
      },
    };
  });
}

const CLOSED_INCOME_TYPES = new Set(['REALIZED_PNL', 'COMMISSION', 'FUNDING_FEE']);
const lifecycleStartMs = (row) => Date.parse(
  row?.entrySubmittedAt ?? row?.attemptedAt ?? row?.entryFilledAt ?? '',
);
const lifecycleEndMs = (row) => Date.parse(row?.positionClosedAt ?? '');

function lifecycleQuoteAsset(symbol) {
  const normalized = upper(symbol);
  if (normalized.endsWith('USDC')) return 'USDC';
  if (normalized.endsWith('BUSD')) return 'BUSD';
  return 'USDT';
}

function emptyClosedPnl() {
  return {
    realized: 0,
    commission: 0,
    funding: 0,
    net: 0,
    incomeCount: 0,
    realizedIncomeCount: 0,
    skippedIncomeCount: 0,
  };
}

export function reconcileLiveCardClosedPnl(executions = [], incomeRows = []) {
  const windows = (Array.isArray(executions) ? executions : [])
    .filter((row) => row?.status === 'POSITION_CLOSED' && Number.isFinite(lifecycleEndMs(row)))
    .map((row) => {
      const start = lifecycleStartMs(row);
      const end = lifecycleEndMs(row);
      return {
        row,
        start: Number.isFinite(start) ? start - 30_000 : end - 24 * 60 * 60_000,
        end: end + 30_000,
      };
    });
  const totals = new Map(windows.map(({ row }) => [row.lifecycleId, emptyClosedPnl()]));

  for (const income of Array.isArray(incomeRows) ? incomeRows : []) {
    const incomeType = upper(income?.incomeType);
    const incomeTime = Number(income?.time);
    const symbol = upper(income?.symbol);
    if (!CLOSED_INCOME_TYPES.has(incomeType) || !symbol || !Number.isFinite(incomeTime)) continue;
    const candidates = windows
      .filter(({ row, start, end }) => upper(row.symbol) === symbol && incomeTime >= start && incomeTime <= end)
      .sort((a, b) => b.start - a.start || a.end - b.end);
    if (!candidates.length) continue;
    const selected = candidates[0];
    const bucket = totals.get(selected.row.lifecycleId);
    const asset = upper(income?.asset);
    if (asset && asset !== lifecycleQuoteAsset(selected.row.symbol)) {
      bucket.skippedIncomeCount += 1;
      continue;
    }
    const amount = finite(income?.income);
    if (amount == null) continue;
    if (incomeType === 'REALIZED_PNL') {
      bucket.realized += amount;
      bucket.realizedIncomeCount += 1;
    }
    else if (incomeType === 'COMMISSION') bucket.commission += amount;
    else if (incomeType === 'FUNDING_FEE') bucket.funding += amount;
    bucket.incomeCount += 1;
    bucket.net = bucket.realized + bucket.commission + bucket.funding;
  }

  return windows.map(({ row }) => ({
    lifecycleId: row.lifecycleId,
    ...totals.get(row.lifecycleId),
  }));
}

export function aggregateLiveCardWhitelistStats(executions = [], { includeSideStats = true } = {}) {
  const byKey = new Map();
  for (const row of Array.isArray(executions) ? executions : []) {
    const keys = [...new Set((Array.isArray(row?.matchedKeys) ? row.matchedKeys : [])
      .map((key) => String(key ?? '').trim())
      .filter(Boolean))];
    const effectiveKeys = keys.length
      ? keys
      : [`unmatched:${row?.sourceType ?? 'unknown'}:${row?.originSourceType ?? 'unknown'}`];
    for (const key of effectiveKeys) {
      const bucket = byKey.get(key) ?? {
        key,
        total: 0,
        submitted: 0,
        filled: 0,
        protected: 0,
        closed: 0,
        botClosed: 0,
        failed: 0,
        closedPnlKnown: 0,
        closedPnlMissing: 0,
        closedPnlRealized: 0,
        closedPnlCommission: 0,
        closedPnlFunding: 0,
        closedPnlNet: 0,
        wins: 0,
        losses: 0,
        breakEven: 0,
        grossProfit: 0,
        grossLoss: 0,
        closedRoeKnown: 0,
        closedRoeSum: 0,
        paperCohort: 0,
        paperMapped: 0,
        paperMissing: 0,
        paperIdentityMismatch: 0,
        paperOpen: 0,
        paperClosed: 0,
        paperWins: 0,
        paperLosses: 0,
        paperBreakEven: 0,
        paperGrossProfit: 0,
        paperGrossLoss: 0,
        paperPnl: 0,
        paperRoeKnown: 0,
        paperRoeSum: 0,
      };
      bucket.total += 1;
      if (row.entrySubmittedAt) bucket.submitted += 1;
      if (row.entryFilledAt) bucket.filled += 1;
      if (row.protectionAppliedAt) bucket.protected += 1;
      if (row.status === 'POSITION_CLOSED') {
        bucket.closed += 1;
        if (row.closedPnlKnown === true && finite(row.closedPnlNet) != null) {
          bucket.closedPnlKnown += 1;
          bucket.closedPnlRealized += finite(row.closedPnlRealized) ?? 0;
          bucket.closedPnlCommission += finite(row.closedPnlCommission) ?? 0;
          bucket.closedPnlFunding += finite(row.closedPnlFunding) ?? 0;
          const net = finite(row.closedPnlNet) ?? 0;
          bucket.closedPnlNet += net;
          const marginUsdt = finite(row.marginUsdt);
          if (marginUsdt != null && marginUsdt > 0) {
            bucket.closedRoeKnown += 1;
            bucket.closedRoeSum += (net / marginUsdt) * 100;
          }
          if (net > 0) {
            bucket.wins += 1;
            bucket.grossProfit += net;
          } else if (net < 0) {
            bucket.losses += 1;
            bucket.grossLoss += Math.abs(net);
          } else {
            bucket.breakEven += 1;
          }
        } else {
          bucket.closedPnlMissing += 1;
        }
      }
      if (row.botCloseSubmittedAt || row.status === 'POSITION_CLOSED') bucket.botClosed += 1;
      if (String(row.status ?? '').includes('FAILED')) bucket.failed += 1;
      if (row.entryFilledAt) {
        bucket.paperCohort += 1;
        const paper = row.paperOriginal ?? {};
        if (paper.mappingStatus === 'MAPPED') {
          bucket.paperMapped += 1;
          if (paper.status === 'CLOSED') {
            bucket.paperClosed += 1;
            const pnl = finite(paper.pnl);
            const roe = finite(paper.roe);
            const resultValue = pnl ?? roe;
            if (pnl != null) bucket.paperPnl += pnl;
            if (roe != null) {
              bucket.paperRoeKnown += 1;
              bucket.paperRoeSum += roe;
            }
            if (resultValue != null && resultValue > 0) {
              bucket.paperWins += 1;
              bucket.paperGrossProfit += resultValue;
            } else if (resultValue != null && resultValue < 0) {
              bucket.paperLosses += 1;
              bucket.paperGrossLoss += Math.abs(resultValue);
            } else if (resultValue != null) {
              bucket.paperBreakEven += 1;
            }
          } else {
            bucket.paperOpen += 1;
          }
        } else {
          bucket.paperMissing += 1;
          if (paper.mappingStatus === 'IDENTITY_MISMATCH') bucket.paperIdentityMismatch += 1;
        }
      }
      byKey.set(key, bucket);
    }
  }
  const summarized = [...byKey.values()].map((bucket) => {
    const decided = bucket.wins + bucket.losses;
    return {
      ...bucket,
      winRate: decided > 0 ? (bucket.wins / decided) * 100 : null,
      profitFactor: bucket.grossLoss > 0
        ? bucket.grossProfit / bucket.grossLoss
        : bucket.grossProfit > 0 ? null : 0,
      avgClosedPnlNet: bucket.closedPnlKnown > 0
        ? bucket.closedPnlNet / bucket.closedPnlKnown
        : null,
      avgClosedRoe: bucket.closedRoeKnown > 0
        ? bucket.closedRoeSum / bucket.closedRoeKnown
        : null,
      paperWinRate: bucket.paperWins + bucket.paperLosses > 0
        ? (bucket.paperWins / (bucket.paperWins + bucket.paperLosses)) * 100
        : null,
      paperProfitFactor: bucket.paperGrossLoss > 0
        ? bucket.paperGrossProfit / bucket.paperGrossLoss
        : bucket.paperGrossProfit > 0 ? null : 0,
      paperAvgRoe: bucket.paperRoeKnown > 0
        ? bucket.paperRoeSum / bucket.paperRoeKnown
        : null,
    };
  }).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  if (!includeSideStats) return summarized;

  const sideMaps = Object.fromEntries(['SHORT', 'LONG'].map((side) => [
    side,
    new Map(aggregateLiveCardWhitelistStats(
      (Array.isArray(executions) ? executions : []).filter((row) => upper(row?.side) === side),
      { includeSideStats: false },
    ).map((row) => [row.key, row])),
  ]));
  return summarized.map((row) => ({
    ...row,
    sideStats: {
      SHORT: sideMaps.SHORT.get(row.key) ?? null,
      LONG: sideMaps.LONG.get(row.key) ?? null,
    },
  }));
}

export function aggregateLiveCardHistoryOverview(executions = []) {
  const rows = Array.isArray(executions) ? executions : [];
  const filled = rows.filter((row) => row?.entryFilledAt);
  const closed = filled.filter((row) => row?.status === 'POSITION_CLOSED');
  const known = closed.filter((row) => row?.closedPnlKnown === true && finite(row?.closedPnlNet) != null);
  const wins = known.filter((row) => finite(row.closedPnlNet) > 0).length;
  const losses = known.filter((row) => finite(row.closedPnlNet) < 0).length;
  const breakEven = known.length - wins - losses;
  const grossProfit = known.reduce((sum, row) => {
    const net = finite(row.closedPnlNet) ?? 0;
    return sum + (net > 0 ? net : 0);
  }, 0);
  const grossLoss = known.reduce((sum, row) => {
    const net = finite(row.closedPnlNet) ?? 0;
    return sum + (net < 0 ? Math.abs(net) : 0);
  }, 0);
  const closedPnlNet = known.reduce((sum, row) => sum + (finite(row.closedPnlNet) ?? 0), 0);
  const fillTimes = filled.map((row) => Date.parse(row.entryFilledAt)).filter(Number.isFinite);
  const paperMapped = filled.filter((row) => row?.paperOriginal?.mappingStatus === 'MAPPED');
  const paperIdentityMismatch = filled.filter((row) => row?.paperOriginal?.mappingStatus === 'IDENTITY_MISMATCH').length;
  return {
    total: rows.length,
    filled: filled.length,
    active: filled.length - closed.length,
    closed: closed.length,
    closedPnlKnown: known.length,
    closedPnlMissing: closed.length - known.length,
    wins,
    losses,
    breakEven,
    winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0,
    closedPnlNet,
    avgClosedPnlNet: known.length > 0 ? closedPnlNet / known.length : null,
    paperMapped: paperMapped.length,
    paperMissing: filled.length - paperMapped.length,
    paperIdentityMismatch,
    paperClosed: paperMapped.filter((row) => row.paperOriginal?.status === 'CLOSED').length,
    firstFilledAt: fillTimes.length ? new Date(Math.min(...fillTimes)).toISOString() : null,
    lastFilledAt: fillTimes.length ? new Date(Math.max(...fillTimes)).toISOString() : null,
  };
}

export function classifyLiveCardSignalSource(page, trade = {}) {
  const executionPage = String(page ?? '').trim().toLowerCase() || 'unknown';
  const originPage = executionPage === 'recommended'
    ? String(trade.sourcePage ?? trade.page ?? 'unknown').trim().toLowerCase()
    : executionPage;
  const sourceType = executionPage === 'edge' ? 'short-edge' : executionPage;
  const originSourceType = originPage === 'edge' ? 'short-edge' : originPage;
  const signalSource = String(
    trade.source
      ?? trade.recommendationCombo
      ?? trade.signalType
      ?? trade.setup
      ?? trade.stage
      ?? 'unknown',
  ).slice(0, 160);
  return { executionPage, sourceType, originSourceType, signalSource };
}

export function entryFillMatchesLifecycle(record, fill = {}) {
  if (!record || !fill) return false;
  if (upper(record.symbol) !== upper(fill.symbol)) return false;
  const orderId = String(fill.orderId ?? '');
  const clientOrderId = String(fill.clientOrderId ?? '');
  if (record.entryOrderId != null && orderId && String(record.entryOrderId) === orderId) return true;
  return Boolean(record.entryClientOrderId && clientOrderId && record.entryClientOrderId === clientOrderId);
}

export function safeBotClosePlan(record, positions = []) {
  if (!record) return { allowed: false, reason: 'LIFECYCLE_NOT_FOUND' };
  const symbol = upper(record.symbol);
  const side = upper(record.side);
  const expectedPositionSide = side === 'LONG' ? 'LONG' : side === 'SHORT' ? 'SHORT' : null;
  if (!symbol || !expectedPositionSide) return { allowed: false, reason: 'INVALID_LIFECYCLE_SIDE' };

  const matching = (Array.isArray(positions) ? positions : []).find((position) => {
    if (upper(position.symbol) !== symbol || finite(position.positionAmt) === 0) return false;
    const positionSide = upper(position.positionSide || 'BOTH');
    if (positionSide !== 'BOTH') return positionSide === expectedPositionSide;
    return side === 'LONG' ? Number(position.positionAmt) > 0 : Number(position.positionAmt) < 0;
  });
  if (!matching) return { allowed: false, reason: 'POSITION_ALREADY_CLOSED' };

  const positionQty = Math.abs(Number(matching.positionAmt));
  const trackedQty = finite(record.remainingQty)
    ?? finite(record.filledQty)
    ?? finite(record.submittedQty);
  if (!trackedQty || trackedQty <= 0) return { allowed: false, reason: 'NO_TRACKED_BOT_QUANTITY' };
  const quantity = Math.min(positionQty, Math.abs(trackedQty));
  if (!(quantity > 0)) return { allowed: false, reason: 'NO_CLOSE_QUANTITY' };
  return {
    allowed: true,
    reason: 'BOT_POSITION_MATCHED',
    symbol,
    quantity,
    positionAmt: Number(matching.positionAmt),
    positionSide: upper(matching.positionSide || 'BOTH'),
    closeSide: side === 'LONG' ? 'SELL' : 'BUY',
  };
}

export function aggregateLiveCardBinanceStats(executions = []) {
  const bySource = {};
  for (const row of Array.isArray(executions) ? executions : []) {
    const key = [row.sourceType ?? 'unknown', row.originSourceType ?? 'unknown'].join(':');
    const bucket = bySource[key] ?? {
      key,
      sourceType: row.sourceType ?? 'unknown',
      originSourceType: row.originSourceType ?? 'unknown',
      total: 0,
      submitted: 0,
      filled: 0,
      protected: 0,
      botClosed: 0,
      failed: 0,
    };
    bucket.total += 1;
    if (row.entrySubmittedAt) bucket.submitted += 1;
    if (row.entryFilledAt) bucket.filled += 1;
    if (row.protectionAppliedAt) bucket.protected += 1;
    if (row.botCloseSubmittedAt || row.status === 'POSITION_CLOSED') bucket.botClosed += 1;
    if (String(row.status ?? '').includes('FAILED')) bucket.failed += 1;
    bySource[key] = bucket;
  }
  return Object.values(bySource).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

export class LiveCardBinanceLifecycleStore {
  constructor({ stateFile, eventFile }) {
    this.stateFile = stateFile;
    this.eventFile = eventFile;
    this.queue = Promise.resolve();
  }

  async read() {
    try {
      const parsed = JSON.parse(await readFile(this.stateFile, 'utf8'));
      return {
        version: LIVE_CARD_BINANCE_LIFECYCLE_VERSION,
        updatedAt: parsed?.updatedAt ?? null,
        executions: Array.isArray(parsed?.executions) ? parsed.executions : [],
      };
    } catch (error) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      return { version: LIVE_CARD_BINANCE_LIFECYCLE_VERSION, updatedAt: null, executions: [] };
    }
  }

  async #write(store) {
    await mkdir(dirname(this.stateFile), { recursive: true });
    const tmp = `${this.stateFile}.tmp`;
    await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    await rename(tmp, this.stateFile);
  }

  async #event(event) {
    await mkdir(dirname(this.eventFile), { recursive: true });
    await appendFile(this.eventFile, `${JSON.stringify({
      version: LIVE_CARD_BINANCE_LIFECYCLE_VERSION,
      at: new Date().toISOString(),
      ...event,
    })}\n`, 'utf8');
  }

  #mutate(mutator) {
    const task = this.queue.then(async () => {
      const store = await this.read();
      const outcome = await mutator(store);
      if (outcome?.changed) {
        store.updatedAt = new Date().toISOString();
        store.version = LIVE_CARD_BINANCE_LIFECYCLE_VERSION;
        await this.#write(store);
      }
      if (outcome?.event) await this.#event(outcome.event);
      return outcome?.value ?? null;
    });
    this.queue = task.catch(() => {});
    return task;
  }

  upsert(record, eventType = null, eventExtra = {}) {
    return this.#mutate((store) => {
      const index = store.executions.findIndex((row) => row.lifecycleId === record.lifecycleId);
      const next = { ...(index >= 0 ? store.executions[index] : {}), ...record };
      if (index >= 0) store.executions[index] = next;
      else store.executions.unshift(next);
      return {
        changed: true,
        value: next,
        event: eventType ? { eventType, lifecycleId: next.lifecycleId, ...eventExtra, execution: next } : null,
      };
    });
  }

  markSubmitted(record) {
    return this.#mutate((store) => {
      const index = store.executions.findIndex((row) => row.lifecycleId === record.lifecycleId);
      const current = index >= 0 ? store.executions[index] : {};
      const alreadyFilled = ['ENTRY_PARTIALLY_FILLED', 'ENTRY_FILLED', 'PROTECTED'].includes(current.status);
      const next = {
        ...current,
        ...record,
        status: alreadyFilled ? current.status : record.status,
        filledQty: current.filledQty ?? record.filledQty ?? null,
        fillPrice: current.fillPrice ?? record.fillPrice ?? null,
        entryFilledAt: current.entryFilledAt ?? record.entryFilledAt ?? null,
      };
      if (index >= 0) store.executions[index] = next;
      else store.executions.unshift(next);
      return {
        changed: true,
        value: next,
        event: { eventType: 'ENTRY_SUBMITTED', lifecycleId: next.lifecycleId, execution: next },
      };
    });
  }

  recordFill(fill) {
    return this.#mutate((store) => {
      const index = store.executions.findIndex((row) => entryFillMatchesLifecycle(row, fill));
      if (index < 0) return { changed: false, value: null };
      const row = store.executions[index];
      const cumulative = finite(fill.cumulativeFilledQty);
      const last = finite(fill.filledQty) ?? 0;
      const filledQty = cumulative ?? ((finite(row.filledQty) ?? 0) + last);
      const isFull = upper(fill.orderStatus) === 'FILLED';
      const next = {
        ...row,
        status: isFull ? 'ENTRY_FILLED' : 'ENTRY_PARTIALLY_FILLED',
        filledQty,
        remainingQty: filledQty,
        fillPrice: finite(fill.avgPrice) ?? row.fillPrice ?? null,
        entryFilledAt: isFull ? new Date(Number(fill.fillTime) || Date.now()).toISOString() : row.entryFilledAt ?? null,
        lastFillAt: new Date(Number(fill.fillTime) || Date.now()).toISOString(),
      };
      store.executions[index] = next;
      return {
        changed: true,
        value: next,
        event: { eventType: isFull ? 'ENTRY_FILLED' : 'ENTRY_PARTIAL_FILL', lifecycleId: next.lifecycleId, fill, execution: next },
      };
    });
  }

  markProtection(lifecycleId, result = {}, error = null) {
    return this.#mutate((store) => {
      const index = store.executions.findIndex((row) => row.lifecycleId === lifecycleId);
      if (index < 0) return { changed: false, value: null };
      if (['BOT_CLOSE_REQUESTED', 'BOT_CLOSE_SUBMITTED', 'POSITION_CLOSED'].includes(store.executions[index].status)) {
        return { changed: false, value: store.executions[index] };
      }
      const next = {
        ...store.executions[index],
        status: error ? 'PROTECTION_FAILED' : 'PROTECTED',
        protectionAppliedAt: error ? null : new Date().toISOString(),
        protectionError: error ? String(error).slice(0, 500) : null,
        protectionOrders: error ? store.executions[index].protectionOrders ?? null : result?.placed ?? result ?? null,
      };
      store.executions[index] = next;
      return {
        changed: true,
        value: next,
        event: { eventType: error ? 'PROTECTION_FAILED' : 'PROTECTION_APPLIED', lifecycleId, error, result },
      };
    });
  }

  claimBotClose(lifecycleId, closeMeta = {}) {
    return this.#mutate((store) => {
      const index = store.executions.findIndex((row) => row.lifecycleId === lifecycleId);
      if (index < 0) return { changed: false, value: null };
      const row = store.executions[index];
      if (!CLOSABLE_STATUSES.has(row.status)) return { changed: false, value: null };
      const next = {
        ...row,
        status: 'BOT_CLOSE_REQUESTED',
        botCloseRequestedAt: new Date().toISOString(),
        botCloseOutcome: closeMeta.outcome ?? null,
        botCloseReason: closeMeta.reason ?? null,
      };
      store.executions[index] = next;
      return {
        changed: true,
        value: next,
        event: { eventType: 'BOT_CLOSE_REQUESTED', lifecycleId, ...closeMeta },
      };
    });
  }

  markBotClose(lifecycleId, result = {}, error = null) {
    return this.#mutate((store) => {
      const index = store.executions.findIndex((row) => row.lifecycleId === lifecycleId);
      if (index < 0) return { changed: false, value: null };
      const noPosition = result?.reason === 'POSITION_ALREADY_CLOSED';
      const next = {
        ...store.executions[index],
        status: error ? 'BOT_CLOSE_FAILED' : (noPosition ? 'POSITION_CLOSED' : 'BOT_CLOSE_SUBMITTED'),
        botCloseSubmittedAt: error || noPosition ? null : new Date().toISOString(),
        botCloseOrderId: result?.orderId ?? null,
        botCloseClientOrderId: result?.clientOrderId ?? null,
        botCloseQuantity: finite(result?.quantity),
        botCloseError: error ? String(error).slice(0, 500) : null,
        positionClosedAt: noPosition ? new Date().toISOString() : store.executions[index].positionClosedAt ?? null,
      };
      store.executions[index] = next;
      return {
        changed: true,
        value: next,
        event: { eventType: error ? 'BOT_CLOSE_FAILED' : (noPosition ? 'BOT_CLOSE_NO_POSITION' : 'BOT_CLOSE_SUBMITTED'), lifecycleId, error, result },
      };
    });
  }

  markPositionClosed(symbol) {
    return this.#mutate((store) => {
      const changedRows = [];
      store.executions = store.executions.map((row) => {
        if (upper(row.symbol) !== upper(symbol) || !POSITION_TRACKED_STATUSES.has(row.status)) return row;
        const next = { ...row, status: 'POSITION_CLOSED', remainingQty: 0, positionClosedAt: new Date().toISOString() };
        changedRows.push(next);
        return next;
      });
      return {
        changed: changedRows.length > 0,
        value: changedRows,
        event: changedRows.length ? { eventType: 'POSITION_CLOSED', symbol: upper(symbol), lifecycleIds: changedRows.map((row) => row.lifecycleId) } : null,
      };
    });
  }

  reconcileClosedPnl(incomeRows = []) {
    return this.#mutate((store) => {
      const pendingExecutions = store.executions.filter((row) => row.closedPnlKnown !== true);
      const reconciliation = reconcileLiveCardClosedPnl(pendingExecutions, incomeRows);
      const byId = new Map(reconciliation.map((row) => [row.lifecycleId, row]));
      const updated = [];
      store.executions = store.executions.map((row) => {
        const pnl = byId.get(row.lifecycleId);
        if (row.closedPnlKnown === true || !pnl || pnl.realizedIncomeCount <= 0) return row;
        const next = {
          ...row,
          closedPnlKnown: true,
          closedPnlRealized: pnl.realized,
          closedPnlCommission: pnl.commission,
          closedPnlFunding: pnl.funding,
          closedPnlNet: pnl.net,
          closedPnlIncomeCount: pnl.incomeCount,
          closedPnlRealizedIncomeCount: pnl.realizedIncomeCount,
          closedPnlSkippedIncomeCount: pnl.skippedIncomeCount,
          closedPnlSource: 'BINANCE_INCOME_LIFECYCLE_WINDOW',
          closedPnlReconciledAt: new Date().toISOString(),
          closedPnlStatsVersion: LIVE_CARD_WHITELIST_PNL_STATS_VERSION,
        };
        updated.push(next);
        return next;
      });
      return {
        changed: updated.length > 0,
        value: updated,
        event: updated.length ? {
          eventType: 'CLOSED_PNL_RECONCILED',
          lifecycleIds: updated.map((row) => row.lifecycleId),
          count: updated.length,
        } : null,
      };
    });
  }

  async status() {
    await this.queue;
    const store = await this.read();
    return {
      ...store,
      stats: aggregateLiveCardBinanceStats(store.executions),
      whitelistStats: aggregateLiveCardWhitelistStats(store.executions),
    };
  }

  async get(lifecycleId) {
    await this.queue;
    const store = await this.read();
    return store.executions.find((row) => row.lifecycleId === lifecycleId) ?? null;
  }
}
