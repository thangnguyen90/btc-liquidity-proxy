import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { classifyLiquidityZoneLifecycle } from './localAiTrendChat.js';

export const ZONE_MANAGER_VERSION = 'LIQUIDITY_ZONE_MANAGER_V3_ALL_COINS_IMPORT_20261004';
export const ZONE_PUSH_TYPE = 'BINANCE_LIQUIDITY_ZONE_LIFECYCLE';
export const ZONE_STATES = {
  ACTIVE: 'VÙNG CÒN HOẠT ĐỘNG', TOUCHING: 'ĐANG CHẠM VÙNG',
  PRICE_PASSED: 'GIÁ ĐÃ VƯỢT VÙNG', CLOSED_BEYOND: '5M ĐÓNG VƯỢT VÙNG',
  REJECTED_AFTER_SWEEP: 'ĐÃ QUÉT · 5M ĐÓNG TRỞ LẠI',
  CONSUMED_AT_CAPTURE: 'VÙNG KHÔNG ACTIVE LÚC THÊM',
};
const number = v => v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const fmt = v => Number(v).toLocaleString('en-US', { maximumSignificantDigits: 10 });
export const zonePriceRelation = (mark, zone) => mark < zone.low ? 'BELOW' : mark > zone.high ? 'ABOVE' : 'INSIDE';
const beyond = (direction, relation) => direction === 'UPPER' ? relation === 'ABOVE' : relation === 'BELOW';
const originalSide = (direction, relation) => direction === 'UPPER' ? relation === 'BELOW' : relation === 'ABOVE';

export function captureLiquidityZones(analysis, now) {
  if (analysis?.freshness?.stale) throw Error('Dữ liệu coin đã cũ; hãy thử lại sau khi cập nhật.');
  const current = analysis?.liqScan?.current ?? analysis?.liqScan;
  const direction = current?.dominantSide === 'ABOVE' ? 'UPPER' : current?.dominantSide === 'BELOW' ? 'LOWER' : null;
  const mark = number(analysis?.market?.markPrice ?? current?.markPrice);
  if (!direction || !(mark > 0)) throw Error('Chưa có giá và hướng vùng LiqScan hợp lệ.');
  const cluster = current.killZoneCluster ?? current;
  const seen = new Set();
  return ['mainKillZone', 'farKillZone'].flatMap((key) => {
    const zone = cluster[key];
    const low = number(zone?.low), high = number(zone?.high);
    if (!(low > 0) || !(high >= low)) return [];
    const dedupe = `${low}|${high}`;
    if (seen.has(dedupe)) return [];
    seen.add(dedupe);
    const lifecycle = classifyLiquidityZoneLifecycle({ direction, zone, markPrice: mark,
      sweepRejectShort: analysis.liqScan?.sweepRejectShort, sweepRejectLong: analysis.liqScan?.sweepRejectLong });
    return [{ role: key === 'mainKillZone' ? 'MAIN_KILL' : 'FAR_KILL', direction,
      zone: { low, high }, sourceAt: analysis.generatedAt ?? null, markPrice: mark,
      capturedAt: now, consumedAtCapture: lifecycle.active === false,
      initialState: lifecycle.active === false ? 'CONSUMED_AT_CAPTURE'
        : zonePriceRelation(mark, { low, high }) === 'INSIDE' ? 'TOUCHING' : 'ACTIVE' }];
  });
}

export function buildZonePush(event) {
  return { signalType: ZONE_PUSH_TYPE, eventId: event.eventId,
    title: `🔔 ${event.symbol} · ${ZONE_STATES[event.state]}`,
    body: `${event.role === 'MAIN_KILL' ? 'MAIN KILL' : 'FAR KILL'} ${event.direction === 'UPPER' ? 'trên' : 'dưới'} ${fmt(event.zone.low)}–${fmt(event.zone.high)} · ${event.candleAt ? 'Close 5m' : 'MARK'} ${fmt(event.price)}. ${event.state === 'PRICE_PASSED' ? 'Chờ nến đóng xác nhận.' : 'Theo dõi vùng thanh khoản.'}`,
    symbol: event.symbol, notifiedAt: event.at, url: `/liquidity-zone-manager?symbol=${encodeURIComponent(event.symbol)}` };
}

export class LiquidityZoneManager {
  constructor({ stateFile, pushSender, onSymbolsChanged = () => {}, getRows = () => [], now = Date.now }) {
    Object.assign(this, { stateFile, pushSender, onSymbolsChanged, getRows, now });
    this.state = null; this.loading = null; this.queue = Promise.resolve(); this.live = new Map(); this.pending = new Map();
    this.flushing = false;
    this.importing = false; this.trackedSymbols = new Set(); this.symbolSignature = null;
  }
  async initialize() {
    if (this.state) return;
    if (!this.loading) this.loading = (async () => {
      let parsed;
      try { parsed = JSON.parse(await readFile(this.stateFile, 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') throw e; parsed = { watches: [], events: [] }; }
      if (!Array.isArray(parsed.watches) || !Array.isArray(parsed.events)) throw Error('Invalid liquidity zone state');
      this.state = parsed;
      this.publish();
    })().finally(() => { this.loading = null; });
    return this.loading;
  }
  publish() {
    const symbols = [...new Set(this.state.watches.filter(w => w.enabled).map(w => w.symbol))].sort();
    this.trackedSymbols = new Set(symbols);
    const signature = symbols.join('|');
    if (signature !== this.symbolSignature) { this.symbolSignature = signature; this.onSymbolsChanged(symbols); }
  }
  run(task) {
    const result = this.queue.then(async () => { await this.initialize(); return task(); });
    this.queue = result.catch(() => {}); return result;
  }
  async save() {
    await mkdir(dirname(this.stateFile), { recursive: true });
    const tmp = `${this.stateFile}.tmp-${process.pid}`;
    await writeFile(tmp, JSON.stringify({ ...this.state, version: ZONE_MANAGER_VERSION }, null, 2));
    await rename(tmp, this.stateFile);
  }
  snapshot() {
    const now = this.now();
    return { version: ZONE_MANAGER_VERSION, generatedAt: now, observeOnly: true, binanceEligible: false,
      watches: (this.state?.watches ?? []).map(w => {
        const tick = this.live.get(w.symbol);
        const markPrice = tick?.markPrice ?? w.markPrice;
        const priceAt = tick?.eventTime ?? w.capturedAt;
        const captureRelation = zonePriceRelation(w.markPrice, w.zone);
        const inactiveAtCapture = w.consumedAtCapture || w.status === 'CONSUMED_AT_CAPTURE';
        const stateLabel = inactiveAtCapture && captureRelation !== 'INSIDE'
          ? 'GIÁ ĐÃ Ở NGOÀI VÙNG LÚC THÊM' : ZONE_STATES[w.status];
        const stateDescription = inactiveAtCapture
          ? `${captureRelation === 'BELOW' ? 'Giá lúc thêm ở dưới vùng.' : captureRelation === 'ABOVE' ? 'Giá lúc thêm ở trên vùng.' : 'Snapshot đánh dấu vùng không active lúc thêm.'} Chưa xác nhận đã quét vùng trong dữ liệu theo dõi.`
          : w.seen.PRICE_PASSED ? 'Đã ghi nhận giá vượt vùng từ lúc theo dõi; giữ lịch sử, không tự đổi lại thành vùng mới.'
            : 'Chưa ghi nhận giá vượt vùng từ lúc theo dõi.';
        return { ...w, markPrice, priceAt, socketFresh: !!tick && now - priceAt <= 90_000,
          relation: zonePriceRelation(markPrice, w.zone), captureRelation, stateLabel, stateDescription,
          distancePct: (markPrice < w.zone.low ? w.zone.low - markPrice : markPrice > w.zone.high ? markPrice - w.zone.high : 0) / markPrice * 100 };
      }), events: this.state?.events ?? [], importJob: this.state?.importJob ?? null };
  }
  insert(symbol, zones, pushEnabled = false) {
    if (!zones.length) throw Error('Coin chưa có MAIN/FAR KILL hợp lệ.');
    if (this.state.watches.some(w => w.symbol === symbol && w.enabled)) throw Error('Coin đã được theo dõi. Dừng vùng cũ trước khi lấy vùng mới.');
    for (const zone of zones) this.state.watches.unshift({ ...zone, symbol, id: randomUUID(), enabled: true,
      pushEnabled: pushEnabled === true, status: zone.initialState,
      seen: { [zone.initialState]: true }, lastClosedAt: null });
    this.state.watches = this.state.watches.filter(w => w.enabled || this.now() - w.capturedAt < 7 * 86_400_000);
  }
  add(symbol, zones, pushEnabled = false) {
    return this.run(async () => {
      this.insert(symbol, zones, pushEnabled);
      this.publish(); await this.save(); return this.snapshot();
    });
  }
  startImport(symbols, pushEnabled = false) {
    return this.run(async () => {
      if (this.state.importJob?.status === 'RUNNING') return this.snapshot();
      const existing = new Set(this.state.watches.map(w => w.symbol));
      this.state.importJob = { id:randomUUID(), status:'RUNNING', startedAt:this.now(), finishedAt:null,
        pushEnabled:pushEnabled === true,
        items:[...new Set(symbols)].map(symbol => ({ symbol, status:existing.has(symbol)?'EXISTING':'PENDING' })) };
      if (this.state.importJob.items.every(item => item.status !== 'PENDING')) {
        this.state.importJob.status = 'COMPLETED'; this.state.importJob.finishedAt = this.now();
      }
      await this.save(); return this.snapshot();
    });
  }
  stopImport() {
    return this.run(async () => {
      if (this.state.importJob?.status === 'RUNNING') {
        this.state.importJob.status = 'STOPPED'; this.state.importJob.finishedAt = this.now(); await this.save();
      }
      return this.snapshot();
    });
  }
  async importBatch(loadAnalysis, batchSize = 4) {
    if (this.importing) return;
    this.importing = true;
    try {
      await this.initialize();
      const job = this.state.importJob;
      if (job?.status !== 'RUNNING') return;
      const items = job.items.filter(item => item.status === 'PENDING').slice(0,batchSize);
      const results = await Promise.all(items.map(async item => {
        if (this.state.watches.some(w => w.symbol === item.symbol)) return { item, status:'EXISTING' };
        try {
          const zones = captureLiquidityZones(await loadAnalysis(item.symbol), this.now());
          return { item, zones, status:zones.length?'ADDED':'NO_ZONE', reason:zones.length?null:'Chưa có MAIN/FAR KILL hợp lệ.' };
        } catch(error) { return { item, status:'ERROR', reason:String(error.message).slice(0,200) }; }
      }));
      await this.run(async () => {
        if (this.state.importJob?.id !== job.id || job.status !== 'RUNNING') return;
        for (const result of results) {
          if (result.status === 'ADDED') {
            if (this.state.watches.some(w => w.symbol === result.item.symbol)) result.status = 'EXISTING';
            else this.insert(result.item.symbol, result.zones, job.pushEnabled);
          }
          Object.assign(result.item, { status:result.status, reason:result.reason ?? null, checkedAt:this.now() });
        }
        if (job.items.every(item => item.status !== 'PENDING')) { job.status='COMPLETED'; job.finishedAt=this.now(); }
        this.publish(); await this.save();
      });
    } finally { this.importing = false; }
  }
  update(id, options) {
    return this.run(async () => {
      const watch = this.state.watches.find(w => w.id === id);
      if (!watch) throw Error('Không tìm thấy vùng.');
      if (typeof options.enabled === 'boolean') watch.enabled = options.enabled;
      if (typeof options.pushEnabled === 'boolean') watch.pushEnabled = options.pushEnabled;
      this.publish(); await this.save(); return this.snapshot();
    });
  }
  onMark(tick) {
    const price = number(tick.markPrice), at = number(tick.eventTime);
    if (!(price > 0) || !(at > 0) || at > this.now() + 5_000 || this.now() - at > 90_000) return;
    if (at <= (this.live.get(tick.symbol)?.eventTime ?? 0)) return;
    this.live.set(tick.symbol, { markPrice: price, eventTime: at });
    if (this.state && !this.trackedSymbols.has(tick.symbol)) return;
    const pending = this.pending.get(tick.symbol);
    this.pending.set(tick.symbol, { markPrice: price, eventTime: at,
      high: Math.max(price, pending?.high ?? price), low: Math.min(price, pending?.low ?? price),
      highAt: !pending || price > pending.high ? at : pending.highAt,
      lowAt: !pending || price < pending.low ? at : pending.lowAt });
  }
  record(watch, state, price, at, candleAt = null) {
    if (state === 'PRICE_PASSED') watch.sweepAt = Math.min(watch.sweepAt ?? Infinity, candleAt ?? at);
    if (watch.seen[state]) return false;
    watch.seen[state] = true; watch.status = state;
    const event = { eventId: `zone:${watch.id}:${state}`, watchId: watch.id, symbol: watch.symbol,
      role: watch.role, direction: watch.direction, zone: watch.zone, state, price, at, candleAt,
      pushEnabled: watch.pushEnabled, delivery: null };
    this.state.events.unshift(event);
    return true;
  }
  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try { await this.run(async () => {
      const now = this.now(); let changed = false;
      const ticks = new Map(this.pending); this.pending.clear();
      for (const w of this.state.watches.filter(w => w.enabled && !w.consumedAtCapture)) {
        const tick = ticks.get(w.symbol);
        if (tick && tick.eventTime >= w.capturedAt) {
          const relation = zonePriceRelation(tick.markPrice, w.zone);
          if (relation === 'INSIDE' && !w.seen.PRICE_PASSED) changed = this.record(w, 'TOUCHING', tick.markPrice, tick.eventTime) || changed;
          const extremeAt = w.direction === 'UPPER' ? tick.highAt : tick.lowAt;
          const extreme = extremeAt >= w.capturedAt
            ? (w.direction === 'UPPER' ? tick.high : tick.low) : tick.markPrice;
          if (beyond(w.direction, zonePriceRelation(extreme, w.zone))) {
            changed = this.record(w, 'PRICE_PASSED', extreme, extremeAt >= w.capturedAt ? extremeAt : tick.eventTime) || changed;
          }
        }
        const bars = this.getRows(w.symbol).filter(b => number(b.openTime) >= Math.ceil(w.capturedAt / 300_000) * 300_000
          && number(b.closeTime) > (w.lastClosedAt ?? 0) && number(b.closeTime) < now
          && b.isClosed !== false
          && number(b.closeTime) === number(b.openTime) + 299_999
          && [b.open,b.high,b.low,b.close].every(v => number(v) > 0)
          && b.high >= Math.max(b.open,b.close) && b.low <= Math.min(b.open,b.close))
          .sort((a,b) => a.openTime-b.openTime);
        for (const b of bars) {
          const expected = w.lastClosedAt == null ? Math.ceil(w.capturedAt / 300_000)*300_000 : w.lastClosedAt+1;
          if (number(b.openTime) !== expected) w.historyIncomplete = true;
          // Candle range is evidence even when socket disconnected or jumped over the zone.
          const swept = w.direction === 'UPPER' ? b.high > w.zone.high : b.low < w.zone.low;
          const relation = zonePriceRelation(b.close, w.zone);
          if (swept) changed = this.record(w, 'PRICE_PASSED', w.direction === 'UPPER' ? b.high : b.low, now, b.closeTime) || changed;
          if (beyond(w.direction, relation)) changed = this.record(w, 'CLOSED_BEYOND', b.close, now, b.closeTime) || changed;
          if (w.seen.PRICE_PASSED && w.sweepAt <= b.closeTime && originalSide(w.direction, relation)) changed = this.record(w, 'REJECTED_AFTER_SWEEP', b.close, now, b.closeTime) || changed;
          w.lastClosedAt = b.closeTime; changed = true;
        }
      }
      this.state.events = this.state.events.filter(e => now - e.at < 7 * 86_400_000).slice(0, 300);
      if (changed) await this.save();
      const pending = this.state.events.filter(e => e.pushEnabled && !e.delivery).slice(-3);
      for (const event of pending) {
        const watch = this.state.watches.find(w => w.id === event.watchId);
        if (!watch?.enabled || !watch.pushEnabled) { event.delivery = { skipped:'PUSH_DISABLED' }; await this.save(); continue; }
        // Events observed during downtime remain in history but are not current Push alerts.
        if (now - (event.candleAt ?? event.at) > 120_000) event.delivery = { skipped: 'HISTORICAL_EVENT' };
        else {
          try { event.delivery = await this.pushSender(buildZonePush(event)); }
          catch (error) { event.delivery = { error: String(error.message).slice(0, 160), failed: 1 }; }
        }
        await this.save();
      }
    }); } finally { this.flushing = false; }
  }
}
