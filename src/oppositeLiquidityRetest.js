import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export const RETEST_VERSION = 'OPPOSITE_LONG_RETEST_OBSERVE_V2_RESULT_LABELS_20261004';
const BAR = 300_000;
const HOUR = 3_600_000;
const terminal = row => ['PASS', 'FAIL', 'UNVERIFIED'].includes(row.status);
const num = value => value == null || value === '' ? null
  : Number.isFinite(Number(value)) ? Number(value) : null;
const time = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const price = value => Number(value).toLocaleString('en-US', { maximumSignificantDigits: 10 });
export const RETEST_REASONS = {
  WAIT_TOUCH: 'Chờ retest mép trên vùng',
  WAIT_CONFIRMATION: 'Đã chạm vùng; chờ nến 5m xanh đóng vượt đỉnh nến trước',
  CLOSED_BELOW_ZONE: 'Nến 5m đóng dưới đáy vùng — hủy setup',
  TIMEOUT_NO_TOUCH: 'Hết 60 phút; chưa retest vùng',
  TIMEOUT_NO_CONFIRMATION: 'Hết 60 phút; đã chạm vùng nhưng chưa xác nhận',
  CONFIRMED: 'Đã retest; nến 5m xanh đóng vượt đỉnh nến trước; đã sang nến kế tiếp',
  MISSING_CANDLES: 'Thiếu chuỗi nến 5m liên tục; chưa thể xác minh',
};

// Presentation only: keep stored lifecycle status/reason and delivery dedupe intact.
export function retestPresentation(row) {
  if (row.status === 'PASS') return { resultLabel: 'PASS', resultTone: 'good',
    resultExplanation: 'Đạt điều kiện setup; không phải xác nhận lãi/lỗ.' };
  if (row.status === 'FAIL' && ['TIMEOUT_NO_TOUCH', 'TIMEOUT_NO_CONFIRMATION'].includes(row.reason)) {
    return { resultLabel: 'KHÔNG CÓ ĐIỂM VÀO', resultTone: 'wait',
      resultExplanation: 'Hết hạn chưa đủ điều kiện vào theo rule retest; không có nghĩa xu hướng LONG sai.' };
  }
  if (row.status === 'FAIL' && row.reason === 'CLOSED_BELOW_ZONE') {
    return { resultLabel: 'SETUP BỊ VÔ HIỆU', resultTone: 'bad',
      resultExplanation: 'Nến 5m đóng dưới zone.low trước khi setup PASS; không phải kết quả lỗ của một lệnh.' };
  }
  return { resultLabel: { WAIT_TOUCH: 'CHỜ RETEST', WAIT_CONFIRMATION: 'CHỜ XÁC NHẬN',
    DATA_MISSING: 'CHỜ DỮ LIỆU' }[row.status] ?? 'CHƯA XÁC MINH', resultTone: 'wait',
    resultExplanation: 'Chưa kết luận điểm vào hoặc kết quả giao dịch.' };
}

export function createRetestRecord(event, now) {
  // Older notifier timestamps mark scan start; never evaluate before its analysis existed.
  const sourceSentAt = num(event.sentAt ?? event.notifiedAt);
  const sentAt = Math.max(sourceSentAt ?? 0, num(event.analysisGeneratedAt) ?? 0);
  const low = num(event.zone?.low), high = num(event.zone?.high);
  if (event.direction !== 'ABOVE' || event.side !== 'LONG' || !event.eventId
    || !(sourceSentAt > 0) || sentAt > now || !(low > 0) || !(high >= low)) return null;
  return {
    eventId: event.eventId, symbol: event.symbol, interval: event.interval,
    zone: { low, high }, sourceSentAt, sentAt, expiresAt: sentAt + HOUR,
    status: 'WAIT_TOUCH', reason: 'WAIT_TOUCH', observeOnly: true,
    binanceEligible: false, notifyEligible: now < sentAt + HOUR,
    adoptedAt: now, delivery: null,
  };
}

// Only complete candles beginning after delivery can touch/confirm/invalidate.
// The previous bar supplies a known high; the next bar supplies only its open.
export function evaluateRetest(record, input, now) {
  if (terminal(record)) return record;
  const rows = new Map((Array.isArray(input) ? input : []).map(b => Object.fromEntries(
    ['openTime', 'closeTime', 'open', 'high', 'low', 'close'].map(key => [key, num(b?.[key])])
  )).filter(b =>
    [b.openTime, b.closeTime, b.open, b.high, b.low, b.close].every(v => num(v) != null)
    && b.open > 0 && b.low > 0 && b.high >= Math.max(b.open, b.close)
    && b.low <= Math.min(b.open, b.close) && b.closeTime === b.openTime + BAR - 1
  ).map(b => [b.openTime, b]));
  const start = Math.ceil(record.sentAt / BAR) * BAR;
  let touchAt = null;
  const result = (status, reason, extra = {}) => ({ ...record, status, reason, touchAt, ...extra });
  const missing = () => result(now >= record.expiresAt + 10 * 60_000 ? 'UNVERIFIED' : 'DATA_MISSING', 'MISSING_CANDLES');
  for (let t = start; t + BAR <= Math.min(now, record.expiresAt); t += BAR) {
    const bar = rows.get(t);
    if (!bar) return missing();
    if (bar.close < record.zone.low) return result('FAIL', 'CLOSED_BELOW_ZONE', {
      decidedAt: bar.closeTime, invalidationClose: bar.close,
    });
    if (bar.low <= record.zone.high && bar.high >= record.zone.high && !touchAt) touchAt = bar.closeTime;
    if (!touchAt) continue;
    const previous = rows.get(t - BAR);
    if (!previous) return missing();
    if (bar.close > bar.open && bar.close > previous.high) {
      const next = rows.get(t + BAR);
      if (!next || next.openTime > now) return missing();
      return result('PASS', 'CONFIRMED', {
        confirmationAt: bar.closeTime, confirmationOpen: bar.open, confirmationClose: bar.close,
        previousHigh: previous.high, nextCandleAt: next.openTime,
        entryReference: next.open, decidedAt: next.openTime,
      });
    }
  }
  if (now >= record.expiresAt) return result('FAIL', touchAt ? 'TIMEOUT_NO_CONFIRMATION' : 'TIMEOUT_NO_TOUCH', { decidedAt: record.expiresAt });
  return result(touchAt ? 'WAIT_CONFIRMATION' : 'WAIT_TOUCH', touchAt ? 'WAIT_CONFIRMATION' : 'WAIT_TOUCH');
}

export function buildRetestMessage(row, now = Date.now()) {
  const passed = row.status === 'PASS';
  const presentation = retestPresentation(row);
  return {
    username: 'AI Local · Theo dõi retest LONG', allowed_mentions: { parse: [] },
    embeds: [{
      title: `${passed ? '✅' : presentation.resultTone === 'bad' ? '❌' : '⚠️'} RETEST LONG · ${presentation.resultLabel} · ${row.symbol} · gốc ${row.interval}`,
      color: passed ? 0x16c784 : presentation.resultTone === 'bad' ? 0xf43f5e : 0xf4c767,
      description: `**OBSERVE ONLY · không đặt lệnh.** ${RETEST_REASONS[row.reason] ?? 'Chưa xác minh nguyên nhân.'}\n${presentation.resultExplanation}`,
      fields: [
        { name: 'VÙNG VÀ HẠN CHỜ', value: `Retest ${price(row.zone.high)} · hủy nếu 5m đóng dưới ${price(row.zone.low)}\nGốc ${time(row.sentAt)}\nHạn ${time(row.expiresAt)}` },
        { name: 'KẾT QUẢ', value: passed
          ? `Chạm (nến đóng) ${time(row.touchAt)}\nXác nhận ${time(row.confirmationAt)}: close ${price(row.confirmationClose)} > đỉnh trước ${price(row.previousHigh)}\nNến kế tiếp ${time(row.nextCandleAt)} · giá mở tham chiếu ${price(row.entryReference)} (không phải giá khớp lệnh)`
          : `${RETEST_REASONS[row.reason]}${row.invalidationClose ? `\nClose vô hiệu ${price(row.invalidationClose)}` : ''}` },
        { name: 'THỜI ĐIỂM', value: `Ghi nhận ${time(row.decidedAt ?? now)} · gửi ${time(now)}${passed && now - row.nextCandleAt > 60_000 ? '\nPhát hiện trễ — chỉ tham khảo lịch sử, không phải giá vào hiện tại.' : ''}` },
      ],
      footer: { text: `${RETEST_VERSION} · ${row.eventId}` },
    }],
  };
}

export class OppositeLiquidityRetest {
  constructor({ file, getEvents, getRows, send, now = () => Date.now() }) {
    Object.assign(this, { file, getEvents, getRows, send, now });
    this.state = null; this.loading = null; this.running = false;
  }
  async load() {
    if (this.state) return this.state;
    if (!this.loading) this.loading = (async () => {
      let parsed;
      try { parsed = JSON.parse(await readFile(this.file, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; parsed = { records: {} }; }
      if (!parsed?.records || typeof parsed.records !== 'object' || Array.isArray(parsed.records)) throw Error('Invalid retest state');
      this.state = parsed;
      return this.state;
    })().finally(() => { this.loading = null; });
    return this.loading;
  }
  async save() {
    await mkdir(dirname(this.file), { recursive: true });
    this.state.version = RETEST_VERSION;
    this.state.updatedAt = this.now();
    const tmp = `${this.file}.tmp-${process.pid}`;
    await writeFile(tmp, JSON.stringify(this.state, null, 2));
    await rename(tmp, this.file);
  }
  async snapshot() {
    await this.load();
    return { version: RETEST_VERSION, observeOnly: true, records: Object.fromEntries(
      Object.entries(this.state.records).map(([id, row]) => [id, { ...row, ...retestPresentation(row) }])
    ) };
  }
  async scan() {
    if (this.running) return;
    this.running = true;
    try {
      await this.load();
      const now = this.now();
      for (const event of await this.getEvents()) {
        if (this.state.records[event.eventId]) continue;
        const record = createRetestRecord(event, now);
        if (record && now - record.sentAt < 7 * 24 * HOUR) this.state.records[record.eventId] = record;
      }
      const bySymbol = new Map();
      for (const record of Object.values(this.state.records).sort((a,b) => b.sentAt-a.sentAt)) {
        if (terminal(record)) continue;
        if (!bySymbol.has(record.symbol)) {
          try { bySymbol.set(record.symbol, await this.getRows(record.symbol)); }
          catch { bySymbol.set(record.symbol, []); }
        }
        this.state.records[record.eventId] = evaluateRetest(record, bySymbol.get(record.symbol), now);
      }
      for (const [id,row] of Object.entries(this.state.records)) {
        if (now-row.sentAt > 7*24*HOUR) delete this.state.records[id];
      }
      // Persist decisions before notification; terminal results cannot change later.
      await this.save();
      const pending = Object.values(this.state.records).filter(r => terminal(r) && r.notifyEligible && !r.delivery?.sentAt
        && now >= (r.delivery?.retryAt ?? 0));
      for (const row of pending.slice(0, 3)) {
        try {
          await this.send(buildRetestMessage(row, now));
          row.delivery = { sentAt: this.now() };
        } catch (error) {
          row.delivery = { error: String(error.message).slice(0, 200), retryAt: this.now() + 60_000 };
        }
        await this.save();
      }
    } finally { this.running = false; }
  }
}
