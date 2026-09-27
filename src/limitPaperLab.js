import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const LIMIT_PAPER_LAB_VERSION = 'LIMIT_PAPER_LAB_V2_SELECTED_SHALLOW_FILL_BINANCE_20260923';

const DEFAULT_ATR_PCT = Object.freeze({
  '5m': 1,
  '15m': 1.5,
  '1h': 3,
  '4h': 5,
});

const PENDING_MS = Object.freeze({
  '5m': 45 * 60_000,
  '15m': 3 * 60 * 60_000,
  '1h': 12 * 60 * 60_000,
  '4h': 36 * 60 * 60_000,
});

const HOLD_MS = Object.freeze({
  '5m': 4 * 60 * 60_000,
  '15m': 12 * 60 * 60_000,
  '1h': 48 * 60 * 60_000,
  '4h': 96 * 60 * 60_000,
});

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function normalizeSide(value) {
  const side = String(value ?? '').trim().toUpperCase();
  if (['LONG', 'BUY'].includes(side)) return 'LONG';
  if (['SHORT', 'SELL'].includes(side)) return 'SHORT';
  return null;
}

function normalizeInterval(value) {
  const interval = String(value ?? '').trim().toLowerCase();
  return ['5m', '15m', '1h', '4h'].includes(interval) ? interval : '15m';
}

function safeText(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function signalIdOf(signal) {
  const explicit = safeText(signal.dedupeKey, '');
  const raw = explicit || [
    signal.source,
    signal.streamId,
    signal.label,
    signal.symbol,
    signal.side,
    signal.interval,
    signal.signalAt,
  ].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

function realizedRoePct(side, entryPrice, exitPrice, leverage) {
  if (![entryPrice, exitPrice, leverage].every((value) => Number.isFinite(value) && value > 0)) return null;
  const move = side === 'LONG' ? exitPrice / entryPrice - 1 : 1 - exitPrice / entryPrice;
  return move * leverage * 100;
}

function priceForRoe(side, entryPrice, leverage, roePct) {
  const distance = roePct / 100 / leverage;
  return side === 'LONG' ? entryPrice * (1 + distance) : entryPrice * (1 - distance);
}

function candidateLadder({ side, signalPrice, interval, atrPct, referencePrice }) {
  const normalizedAtrPct = clamp(
    finite(atrPct, DEFAULT_ATR_PCT[interval] ?? DEFAULT_ATR_PCT['15m']),
    0.2,
    12,
  );
  const definitions = [
    ['SHALLOW', 'LIMIT nông · 0.35 ATR', clamp(normalizedAtrPct * 0.35, 0.25, 2.5)],
    ['BALANCED', 'LIMIT cân bằng · 0.70 ATR', clamp(normalizedAtrPct * 0.70, 0.5, 5)],
    ['DEEP', 'LIMIT sâu · 1.00 ATR', clamp(normalizedAtrPct, 1, 8)],
  ];
  const rows = definitions.map(([key, name, distancePct]) => ({
    key,
    name,
    basis: 'ATR_NORMALIZED',
    distancePct: round(distancePct, 4),
    limitPrice: round(side === 'LONG'
      ? signalPrice * (1 - distancePct / 100)
      : signalPrice * (1 + distancePct / 100), 12),
  }));
  const reference = finite(referencePrice);
  const adverse = reference > 0 && (side === 'LONG' ? reference < signalPrice : reference > signalPrice);
  const referenceDistancePct = adverse ? Math.abs(reference / signalPrice - 1) * 100 : null;
  if (adverse && referenceDistancePct >= 0.1 && referenceDistancePct <= 12) {
    rows.push({
      key: 'REFERENCE',
      name: 'LIMIT theo EMA/cấu trúc',
      basis: 'SIGNAL_REFERENCE',
      distancePct: round(referenceDistancePct, 4),
      limitPrice: round(reference, 12),
    });
  }
  const seen = new Set();
  return rows.filter((row) => {
    const bucket = Number(row.limitPrice).toPrecision(8);
    if (seen.has(bucket)) return false;
    seen.add(bucket);
    return true;
  });
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value), 'utf8');
  await rename(tmp, file);
}

function average(values = []) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function aggregateCandidate(records, candidateKey, getPrice) {
  const candidates = records
    .map((record) => ({ record, candidate: record.candidates.find((item) => item.key === candidateKey) }))
    .filter(({ candidate }) => candidate);
  const closed = candidates.filter(({ candidate }) => candidate.status === 'CLOSED');
  const filled = candidates.filter(({ candidate }) => ['OPEN', 'CLOSED'].includes(candidate.status));
  const realized = closed.map(({ candidate }) => finite(candidate.roePct)).filter(Number.isFinite);
  const wins = realized.filter((value) => value > 0.1).length;
  const losses = realized.filter((value) => value < -0.1).length;
  const flats = realized.length - wins - losses;
  const netRoePct = realized.reduce((sum, value) => sum + value, 0);
  const signals = candidates.length;
  const fillRatePct = signals ? filled.length / signals * 100 : 0;
  const avgRoePct = average(realized);
  const expectedRoePerSignalPct = signals ? netRoePct / signals : 0;
  const sample = candidates[0]?.candidate;
  const open = candidates.filter(({ candidate }) => candidate.status === 'OPEN');
  const liveRoes = open.map(({ record, candidate }) => realizedRoePct(
    record.side,
    candidate.fillPrice,
    finite(getPrice?.(record.symbol)),
    record.leverage,
  )).filter(Number.isFinite);
  return {
    key: candidateKey,
    name: sample?.name ?? candidateKey,
    basis: sample?.basis ?? null,
    averageDistancePct: round(average(candidates.map(({ candidate }) => finite(candidate.distancePct))), 4),
    signals,
    pending: candidates.filter(({ candidate }) => candidate.status === 'PENDING').length,
    missed: candidates.filter(({ candidate }) => candidate.status === 'MISSED').length,
    open: open.length,
    filled: filled.length,
    fillRatePct: round(fillRatePct, 1),
    closed: closed.length,
    wins,
    losses,
    flats,
    winRatePct: closed.length ? round(wins / closed.length * 100, 1) : null,
    avgRoePct: round(avgRoePct, 2),
    netRoePct: round(netRoePct, 2),
    expectedRoePerSignalPct: round(expectedRoePerSignalPct, 2),
    liveAvgRoePct: round(average(liveRoes), 2),
    qualified: signals >= 20 && closed.length >= 12 && fillRatePct >= 25,
  };
}

function publicRecord(record, getPrice) {
  const markPrice = finite(getPrice?.(record.symbol));
  return {
    ...record,
    candidates: record.candidates.map((candidate) => ({
      ...candidate,
      liveRoePct: candidate.status === 'OPEN'
        ? round(realizedRoePct(record.side, candidate.fillPrice, markPrice, record.leverage), 2)
        : null,
    })),
  };
}

export class LimitPaperLab {
  constructor({
    file,
    now = () => Date.now(),
    getPrice = () => null,
    onSymbolsChanged = () => {},
    onCandidateFilled = async () => ({ status: 'observe-only' }),
    leverage = 5,
    takeProfitRoePct = 10,
    stopLossRoePct = 20,
    maxRecords = 5_000,
  } = {}) {
    if (!file) throw new Error('LimitPaperLab file is required');
    Object.assign(this, {
      file, now, getPrice, onSymbolsChanged, onCandidateFilled, leverage,
      takeProfitRoePct, stopLossRoePct, maxRecords,
    });
    this.state = null;
    this.initPromise = null;
    this.writeQueue = Promise.resolve();
  }

  async init() {
    if (this.state) return this.state;
    if (!this.initPromise) {
      this.initPromise = readJson(this.file, null).then((stored) => {
        this.state = stored && Array.isArray(stored.records)
          ? { ...stored, version: LIMIT_PAPER_LAB_VERSION }
          : { version: LIMIT_PAPER_LAB_VERSION, createdAt: this.now(), updatedAt: this.now(), records: [] };
        this.syncSymbols();
        return this.state;
      });
    }
    return this.initPromise;
  }

  async persist() {
    if (!this.state) return;
    this.state.updatedAt = this.now();
    const snapshot = JSON.parse(JSON.stringify(this.state));
    this.writeQueue = this.writeQueue.then(() => writeJsonAtomic(this.file, snapshot));
    return this.writeQueue;
  }

  activeSymbols() {
    if (!this.state) return [];
    return [...new Set(this.state.records
      .filter((record) => record.candidates.some((candidate) => ['PENDING', 'OPEN'].includes(candidate.status)))
      .map((record) => record.symbol))];
  }

  syncSymbols() {
    this.onSymbolsChanged(this.activeSymbols());
  }

  async observe(input = {}) {
    await this.init();
    const symbol = safeText(input.symbol, '').toUpperCase().replace(/[-/_\s]/gu, '');
    const side = normalizeSide(input.side);
    const signalPrice = finite(input.signalPrice ?? input.price);
    if (symbol === 'USDT' || symbol.length > 50 || !/^[\p{L}\p{N}]+USDT$/u.test(symbol)
      || !side || !(signalPrice > 0)) return { status: 'ineligible' };
    const interval = normalizeInterval(input.interval);
    const signalAt = finite(input.signalAt, this.now());
    const normalized = {
      source: safeText(input.source, 'unknown'),
      streamId: safeText(input.streamId, 'default'),
      label: safeText(input.label, 'UNLABELED'),
      symbol,
      side,
      interval,
      signalAt,
      dedupeKey: safeText(input.dedupeKey, ''),
    };
    const id = signalIdOf(normalized);
    if (this.state.records.some((record) => record.id === id)) return { status: 'deduped', id };
    const now = this.now();
    const candidates = candidateLadder({
      side,
      signalPrice,
      interval,
      atrPct: input.atrPct,
      referencePrice: input.referencePrice,
    }).map((candidate) => ({
      ...candidate,
      status: 'PENDING',
      createdAt: now,
      expiresAt: now + (PENDING_MS[interval] ?? PENDING_MS['15m']),
      filledAt: null,
      fillPrice: null,
      closeAt: null,
      closedAt: null,
      exitPrice: null,
      roePct: null,
      outcome: null,
      closeReason: null,
    }));
    const record = {
      id,
      version: LIMIT_PAPER_LAB_VERSION,
      createdAt: now,
      signalAt,
      source: normalized.source,
      streamId: normalized.streamId,
      label: normalized.label,
      symbol,
      side,
      interval,
      signalPrice: round(signalPrice, 12),
      atrPct: round(finite(input.atrPct), 4),
      referencePrice: round(finite(input.referencePrice), 12),
      binanceSkipStatus: safeText(input.binanceSkipStatus, 'OBSERVE_ONLY'),
      reason: safeText(input.reason, ''),
      leverage: this.leverage,
      takeProfitRoePct: this.takeProfitRoePct,
      stopLossRoePct: this.stopLossRoePct,
      candidates,
    };
    this.state.records.unshift(record);
    if (this.state.records.length > this.maxRecords) {
      const active = this.state.records.filter((item) => item.candidates.some((candidate) => ['PENDING', 'OPEN'].includes(candidate.status)));
      const inactive = this.state.records.filter((item) => !active.includes(item));
      this.state.records = [...active, ...inactive].slice(0, this.maxRecords);
    }
    this.syncSymbols();
    await this.persist();
    return { status: 'recorded', id, candidates: candidates.length };
  }

  async handlePriceTick({ symbol, markPrice, eventTime } = {}) {
    await this.init();
    const normalizedSymbol = safeText(symbol, '').toUpperCase();
    const mark = finite(markPrice);
    const now = finite(eventTime, this.now());
    if (!normalizedSymbol || !(mark > 0) || !Number.isFinite(now)) return { changed: 0 };
    let changed = 0;
    const newlyFilled = [];
    for (const record of this.state.records) {
      if (record.symbol !== normalizedSymbol) continue;
      for (const candidate of record.candidates) {
        if (candidate.status === 'PENDING') {
          if (now > candidate.expiresAt) {
            candidate.status = 'MISSED';
            candidate.closedAt = now;
            candidate.closeReason = 'LIMIT_NOT_TOUCHED_BEFORE_EXPIRY';
            changed += 1;
            continue;
          }
          const touched = record.side === 'LONG' ? mark <= candidate.limitPrice : mark >= candidate.limitPrice;
          if (!touched) continue;
          candidate.status = 'OPEN';
          candidate.filledAt = now;
          candidate.fillPrice = candidate.limitPrice;
          candidate.closeAt = now + (HOLD_MS[record.interval] ?? HOLD_MS['15m']);
          candidate.takeProfitPrice = round(priceForRoe(
            record.side,
            candidate.fillPrice,
            record.leverage,
            record.takeProfitRoePct,
          ), 12);
          candidate.stopLossPrice = round(priceForRoe(
            record.side,
            candidate.fillPrice,
            record.leverage,
            -record.stopLossRoePct,
          ), 12);
          newlyFilled.push({
            record,
            candidate,
            event: {
              record: JSON.parse(JSON.stringify(record)),
              candidate: JSON.parse(JSON.stringify(candidate)),
              markPrice: mark,
              eventTime: now,
            },
          });
          changed += 1;
        }
        if (candidate.status !== 'OPEN') continue;
        const roePct = realizedRoePct(record.side, candidate.fillPrice, mark, record.leverage);
        const hitTp = roePct >= record.takeProfitRoePct;
        const hitSl = roePct <= -record.stopLossRoePct;
        const timedOut = now >= candidate.closeAt;
        if (!hitTp && !hitSl && !timedOut) continue;
        candidate.status = 'CLOSED';
        candidate.closedAt = now;
        candidate.exitPrice = round(mark, 12);
        candidate.roePct = round(hitTp
          ? record.takeProfitRoePct
          : hitSl
            ? -record.stopLossRoePct
            : roePct, 4);
        candidate.closeReason = hitTp ? 'TAKE_PROFIT' : hitSl ? 'STOP_LOSS' : 'TIME_EXIT';
        candidate.outcome = candidate.roePct > 0.1 ? 'WIN' : candidate.roePct < -0.1 ? 'LOSS' : 'FLAT';
        changed += 1;
      }
    }
    if (changed) {
      this.syncSymbols();
      await this.persist();
    }
    const binanceTriggers = [];
    if (newlyFilled.length) {
      for (const filled of newlyFilled) {
        try {
          const result = await this.onCandidateFilled(filled.event);
          if (result == null) continue;
          const audit = {
            status: safeText(result?.status, 'UNKNOWN'),
            orderId: result?.orderId ?? null,
            attemptedAt: this.now(),
            signalLabel: result?.signalLabel ?? null,
            marginUsdt: finite(result?.marginUsdt),
            leverage: finite(result?.leverage),
            takeProfitRoePct: finite(result?.takeProfitRoePct),
            stopLossRoePct: finite(result?.stopLossRoePct),
          };
          filled.candidate.binanceExecution = audit;
          binanceTriggers.push({ recordId: filled.record.id, candidate: filled.candidate.key, ...audit });
        } catch (error) {
          const audit = {
            status: 'ERROR_OR_UNKNOWN',
            attemptedAt: this.now(),
            errorCode: error?.code ?? null,
            error: safeText(error?.message, 'Unknown Binance submission error').slice(0, 300),
          };
          filled.candidate.binanceExecution = audit;
          binanceTriggers.push({ recordId: filled.record.id, candidate: filled.candidate.key, ...audit });
        }
      }
      await this.persist();
    }
    return { changed, binanceTriggers };
  }

  async snapshot() {
    await this.init();
    const groups = new Map();
    for (const record of this.state.records) {
      const key = [record.source, record.streamId, record.label, record.side, record.interval].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    }
    const groupRows = [...groups.entries()].map(([key, records]) => {
      const candidateKeys = [...new Set(records.flatMap((record) => record.candidates.map((item) => item.key)))];
      const candidates = candidateKeys.map((candidateKey) => aggregateCandidate(records, candidateKey, this.getPrice));
      const ranked = [...candidates].sort((left, right) => (
        Number(right.qualified) - Number(left.qualified)
        || finite(right.expectedRoePerSignalPct, -Infinity) - finite(left.expectedRoePerSignalPct, -Infinity)
        || finite(right.fillRatePct, 0) - finite(left.fillRatePct, 0)
      ));
      const [source, streamId, label, side, interval] = key.split('|');
      return {
        key,
        source,
        streamId,
        label,
        side,
        interval,
        signals: records.length,
        candidates,
        recommendation: ranked[0]
          ? {
            ...ranked[0],
            confidence: ranked[0].qualified ? 'QUALIFIED' : 'COLLECTING',
            note: ranked[0].qualified
              ? 'Đủ mẫu tối thiểu: ưu tiên theo expected ROE trên mỗi tín hiệu.'
              : 'Chưa đủ 20 tín hiệu, 12 lệnh đóng và fill-rate 25%; chỉ là ước lượng tạm thời.',
          }
          : null,
      };
    }).sort((left, right) => right.signals - left.signals || left.key.localeCompare(right.key));
    const publicRecords = this.state.records.slice(0, 200).map((record) => publicRecord(record, this.getPrice));
    const allCandidates = this.state.records.flatMap((record) => record.candidates);
    return {
      version: LIMIT_PAPER_LAB_VERSION,
      updatedAt: this.state.updatedAt,
      researchOnly: false,
      methodology: {
        entryCandidates: ['0.35 ATR', '0.70 ATR', '1.00 ATR', 'EMA/cấu trúc khi nằm phía chờ hồi'],
        leverage: this.leverage,
        takeProfitRoePct: this.takeProfitRoePct,
        stopLossRoePct: this.stopLossRoePct,
        qualifiedMinimum: '20 tín hiệu + 12 lệnh đóng + fill-rate ≥25%',
        causality: 'Chỉ dùng snapshot tín hiệu và tick giá đến sau thời điểm phát.',
        liveExecution: {
          scope: 'Chỉ LIMIT SHALLOW của 3 nhãn LONG 15m được chọn; mọi candidate/nhóm khác vẫn paper.',
          labels: ['NEAR_EMA_LONG_WATCH', 'NEAR_RECLAIM_LONG_WATCH', 'TOUCH_EMA_LONG_WATCH'],
          trigger: 'Chỉ khi paper LIMIT chuyển PENDING → OPEN sau lúc route được bật; không đặt khi tín hiệu phát lần đầu.',
          action: 'MARKET Binance 1 USDT ×5, TP +10% ROE, SL −20% ROE; yêu cầu RISK_ON.',
        },
      },
      summary: {
        signals: this.state.records.length,
        pendingLimits: allCandidates.filter((item) => item.status === 'PENDING').length,
        openPaper: allCandidates.filter((item) => item.status === 'OPEN').length,
        closedPaper: allCandidates.filter((item) => item.status === 'CLOSED').length,
        missedLimits: allCandidates.filter((item) => item.status === 'MISSED').length,
        qualifiedGroups: groupRows.filter((group) => group.recommendation?.confidence === 'QUALIFIED').length,
      },
      groups: groupRows,
      recent: publicRecords,
    };
  }
}
