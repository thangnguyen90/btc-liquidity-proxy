import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { classifyLiquidityZoneLifecycle } from './localAiTrendChat.js';
import {zoneNotificationUrl} from './liquidityZoneNotifications.js';
import {safeZoneDirectionNote, historicalDirectionText} from './liquidityZoneObservation.js';

export const ZONE_MANAGER_VERSION = 'LIQUIDITY_ZONE_MANAGER_V5_CACHE_FIRST_DIRECTION_NOTE_20261005';
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
const BAR_MS = 300_000;
const historyStart = w => Math.ceil(w.capturedAt / BAR_MS) * BAR_MS;
const lastClosedTime = now => Math.floor(now / BAR_MS) * BAR_MS - 1;
const validClosedBar = (b, now) => number(b.openTime) != null && b.openTime % BAR_MS === 0
  && number(b.closeTime) === Number(b.openTime) + BAR_MS - 1 && b.closeTime < now && b.isClosed !== false
  && [b.open,b.high,b.low,b.close].every(v => number(v) > 0)
  && b.high >= Math.max(b.open,b.close) && b.low <= Math.min(b.open,b.close);
// Ignore small proxy drift, not a new setup. Exact bounds also match across direction changes.
export const equivalentLiquidityZone = (a,b) => {
  const x=a.zone,y=b.zone;if(!x||!y)return false;
  if(x.low===y.low && x.high===y.high)return true;
  if(a.direction!==b.direction)return false;
  const aw=x.high-x.low,bw=y.high-y.low;
  return aw>0 && bw>0 && Math.min(x.high,y.high)-Math.max(x.low,y.low)>=.8*Math.min(aw,bw)
    && Math.abs((x.low+x.high-y.low-y.high)/2)<=.25*Math.max(aw,bw);
};

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
    body: `${event.role === 'MAIN_KILL' ? 'MAIN KILL' : 'FAR KILL'} ${event.direction === 'UPPER' ? 'trên' : 'dưới'} ${fmt(event.zone.low)}–${fmt(event.zone.high)} · ${event.candleAt ? 'Close 5m' : 'MARK'} ${fmt(event.price)}. ${event.state === 'PRICE_PASSED' ? 'Chờ nến đóng xác nhận.' : 'Theo dõi vùng thanh khoản.'} ${historicalDirectionText(event.directionNote)}`,
    symbol: event.symbol, watchId:event.watchId,notifiedAt: event.at,directionNote:event.directionNote, url:zoneNotificationUrl(event) };
}

export class LiquidityZoneManager {
  constructor({ stateFile, pushSender, onSymbolsChanged = () => {}, getRows = () => [], getDirectionNote, now = Date.now }) {
    Object.assign(this, { stateFile, pushSender, onSymbolsChanged, getRows, getDirectionNote, now });
    this.state = null; this.loading = null; this.queue = Promise.resolve(); this.live = new Map(); this.pending = new Map();
    this.flushing = false;
    this.importing = false; this.trackedSymbols = new Set(); this.symbolSignature = null;
    this.repairing = false; this.refreshing = false;
  }
  async initialize() {
    if (this.state) return;
    if (!this.loading) this.loading = (async () => {
      let parsed;
      try { parsed = JSON.parse(await readFile(this.stateFile, 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') throw e; parsed = { watches: [], events: [] }; }
      if (!Array.isArray(parsed.watches) || !Array.isArray(parsed.events)) throw Error('Invalid liquidity zone state');
      this.state = parsed;
      this.state.refreshState ??= {};
      for (const w of parsed.watches) {
        w.seen ??= { [w.status]:true };
        // A legacy gap has no trusted cursor: replay closed bars from capture, not from lastClosedAt.
        w.historyVerifiedThrough ??= w.historyIncomplete ? historyStart(w)-1
          : Math.max(historyStart(w)-1, Number(w.lastClosedAt)||0);
        if(w.enabled && !this.state.refreshState[w.symbol]){
          const history=parsed.watches.filter(other=>other.symbol===w.symbol);
          this.state.refreshState[w.symbol]={enabled:true,checkedAt:0,
            stoppedRoles:['MAIN_KILL','FAR_KILL'].filter(role=>history.some(other=>other.role===role&&!other.enabled&&!other.retiredReason)
              && !history.some(other=>other.role===role&&other.enabled)),
            pushByRole:Object.fromEntries(history.filter(other=>other.enabled).map(other=>[other.role,other.pushEnabled===true]))};
        }
      }
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
      }), events: this.state?.events ?? [], importJob: this.state?.importJob ?? null,
      refreshState: this.state?.refreshState ?? {} };
  }
  insert(symbol, zones, pushEnabled = false) {
    if (!zones.length) throw Error('Coin chưa có MAIN/FAR KILL hợp lệ.');
    if (this.state.watches.some(w => w.symbol === symbol && w.enabled)) throw Error('Coin đã được theo dõi. Dừng vùng cũ trước khi lấy vùng mới.');
    for (const zone of zones) this.state.watches.unshift({ ...zone, symbol, id: randomUUID(), enabled: true,
      pushEnabled: pushEnabled === true, status: zone.initialState,
      seen: { [zone.initialState]: true }, lastClosedAt: null, historyVerifiedThrough:historyStart(zone)-1 });
    const refresh=this.state.refreshState[symbol]??{stoppedRoles:[]};
    this.state.refreshState[symbol]={...refresh,enabled:true,checkedAt:this.now(),
      pushByRole:{...refresh.pushByRole,...Object.fromEntries(zones.map(z=>[z.role,pushEnabled===true]))},
      stoppedRoles:(refresh.stoppedRoles??[]).filter(role=>!zones.some(z=>z.role===role))};
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
      if (typeof options.enabled === 'boolean') {
        watch.enabled = options.enabled;
        const refresh=this.state.refreshState[watch.symbol]??{enabled:true,stoppedRoles:[],checkedAt:0};
        const stopped=new Set(refresh.stoppedRoles??[]);
        if(options.enabled)stopped.delete(watch.role);else stopped.add(watch.role);
        Object.assign(refresh,{stoppedRoles:[...stopped],enabled:options.enabled
          || this.state.watches.some(w=>w.symbol===watch.symbol&&w.enabled&&!stopped.has(w.role))});
        this.state.refreshState[watch.symbol]=refresh;
      }
      if (typeof options.pushEnabled === 'boolean') {
        watch.pushEnabled = options.pushEnabled;
        const refresh=this.state.refreshState[watch.symbol];
        if(refresh)refresh.pushByRole={...refresh.pushByRole,[watch.role]:options.pushEnabled};
      }
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
    const priorSweep=watch.sweepAt;
    if (state === 'PRICE_PASSED') watch.sweepAt = Math.min(watch.sweepAt ?? Infinity, candleAt ?? at);
    if (watch.seen[state]) return priorSweep!==watch.sweepAt;
    watch.seen[state] = true; watch.status = state;
    const event = { eventId: `zone:${watch.id}:${state}`, watchId: watch.id, symbol: watch.symbol,
      role: watch.role, direction: watch.direction, zone: watch.zone, state, price, at, candleAt,
      pushEnabled: watch.pushEnabled, delivery: null,
      directionNote: safeZoneDirectionNote({symbol:watch.symbol,mark:price,zone:watch.zone,now:Math.min((candleAt??at)+1,this.now())},this.getDirectionNote) };
    this.state.events.unshift(event);
    return true;
  }
  applyCandles(w, rows, now) {
    let changed=false;
    const start=historyStart(w), target=lastClosedTime(now);
    w.historyVerifiedThrough ??= w.historyIncomplete?start-1:Math.max(start-1,Number(w.lastClosedAt)||0);
    const beforeCursor=w.historyVerifiedThrough;
    // Missing earlier bars must never be skipped by advancing to the newest close.
    const bars=[...new Map(rows.filter(b=>validClosedBar(b,now)&&b.openTime>=start
      && (b.closeTime>(w.lastClosedAt??0)||b.closeTime>w.historyVerifiedThrough))
      .map(b=>[Number(b.openTime),b])).values()].sort((a,b)=>a.openTime-b.openTime);
    for(const b of bars){
      if(b.openTime===w.historyVerifiedThrough+1)w.historyVerifiedThrough=Number(b.closeTime);
      const swept=w.direction==='UPPER'?b.high>w.zone.high:b.low<w.zone.low;
      const relation=zonePriceRelation(b.close,w.zone);
      if(swept)changed=this.record(w,'PRICE_PASSED',w.direction==='UPPER'?b.high:b.low,now,b.closeTime)||changed;
      if(beyond(w.direction,relation))changed=this.record(w,'CLOSED_BEYOND',b.close,now,b.closeTime)||changed;
      if(w.seen.PRICE_PASSED && w.sweepAt<=b.closeTime && originalSide(w.direction,relation))
        changed=this.record(w,'REJECTED_AFTER_SWEEP',b.close,now,b.closeTime)||changed;
      if(b.closeTime>(w.lastClosedAt??0)){w.lastClosedAt=Number(b.closeTime);changed=true;}
    }
    const incomplete=w.historyVerifiedThrough<target && target>=start;
    if(w.historyIncomplete!==incomplete){w.historyIncomplete=incomplete;changed=true;}
    return changed||beforeCursor!==w.historyVerifiedThrough;
  }
  async repairBatch(loadCandles,batchSize=2) {
    if(this.repairing)return;this.repairing=true;
    try{
      await this.initialize();await this.flush();
      const now=this.now();
      const watches=this.state.watches.filter(w=>w.enabled&&!w.consumedAtCapture&&w.historyIncomplete
        && !w.seen.PRICE_PASSED && !w.seen.CLOSED_BEYOND && !w.seen.REJECTED_AFTER_SWEEP
        && now-(w.historyRepairAt??0)>=60_000)
        .sort((a,b)=>(a.historyRepairAt??0)-(b.historyRepairAt??0)).slice(0,batchSize);
      const results=await Promise.all(watches.map(async w=>{
        const startTime=w.historyVerifiedThrough+1,endTime=Math.min(lastClosedTime(now),startTime+499*BAR_MS-1);
        try{return {id:w.id,rows:await loadCandles(w.symbol,{startTime,endTime,limit:499})};}
        catch(e){return {id:w.id,error:String(e.message).slice(0,180)};}
      }));
      await this.run(async()=>{
        for(const result of results){
          const w=this.state.watches.find(w=>w.id===result.id);
          if(!w?.enabled||w.consumedAtCapture)continue;
          w.historyRepairAt=this.now();w.historyRepairError=result.error??null;
          if(!result.error){
            this.applyCandles(w,Array.isArray(result.rows)?result.rows:[],this.now());
            this.applyCandles(w,this.getRows(w.symbol),this.now());
            if(!w.historyIncomplete)w.historyRepairedAt=this.now();
          }
        }
        if(results.length)await this.save();
      });
    }finally{this.repairing=false;}
  }
  async refreshBatch(loadAnalysis,batchSize=2,minAgeMs=900_000) {
    if(this.refreshing||this.importing)return;this.refreshing=true;
    try{
      await this.initialize();if(this.state.importJob?.status==='RUNNING')return;
      const now=this.now();
      const symbols=Object.entries(this.state.refreshState).filter(([,r])=>r.enabled
        && now-(r.checkedAt??0)>=(r.error?Math.min(300_000,60_000*2**Math.min(3,Math.max(0,(r.failures??1)-1))):minAgeMs))
        .sort((a,b)=>(a[1].checkedAt??0)-(b[1].checkedAt??0)).slice(0,batchSize).map(([symbol])=>symbol);
      const results=await Promise.all(symbols.map(async symbol=>{
        try{
          const analysis=await loadAnalysis(symbol),sourceAt=Date.parse(analysis.generatedAt);
          if(!Number.isFinite(sourceAt)||this.now()-sourceAt>90_000||sourceAt>this.now()+5000)throw Error('Snapshot refresh không đủ mới.');
          const zones=captureLiquidityZones(analysis,this.now());
          if(!zones.length)throw Error('Snapshot refresh chưa có MAIN/FAR hợp lệ.');
          return {symbol,zones};
        }catch(e){return {symbol,error:String(e.message).slice(0,180)};}
      }));
      await this.run(async()=>{
        for(const result of results){
          const r=this.state.refreshState[result.symbol];if(!r?.enabled)continue;
          r.checkedAt=this.now();r.error=result.error??null;
          r.failures=result.error?(r.failures??0)+1:0;
          if(result.error)continue;
          r.succeededAt=this.now();
          for(const old of this.state.watches.filter(w=>w.symbol===result.symbol&&w.enabled
            && !result.zones.some(z=>z.role===w.role))){
            old.enabled=false;old.retiredAt=this.now();old.retiredReason='SNAPSHOT_REPLACED';
          }
          for(const zone of result.zones){
            if(r.stoppedRoles?.includes(zone.role))continue;
            const history=this.state.watches.filter(w=>w.symbol===result.symbol);
            const sameRole=history.filter(w=>w.role===zone.role);
            const current=sameRole.filter(w=>w.enabled);
            if(current.some(w=>equivalentLiquidityZone(w,zone)))continue;
            const known=history.find(w=>equivalentLiquidityZone(w,zone)
              && (w.role===zone.role||w.seen.PRICE_PASSED||w.seen.CLOSED_BEYOND||w.seen.REJECTED_AFTER_SWEEP));
            const pushEnabled=r.pushByRole?.[zone.role]??current.some(w=>w.pushEnabled);
            for(const old of current){old.enabled=false;old.retiredAt=this.now();old.retiredReason='SNAPSHOT_REPLACED';}
            // Never revive a previously tracked cluster (including stopped or swept zones).
            if(known)continue;
            this.state.watches.unshift({...zone,symbol:result.symbol,id:randomUUID(),enabled:true,pushEnabled,
              status:zone.initialState,seen:{[zone.initialState]:true},lastClosedAt:null,
              historyVerifiedThrough:historyStart(zone)-1,automaticRefresh:true});
          }
        }
        if(results.length){this.publish();await this.save();}
      });
    }finally{this.refreshing=false;}
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
        changed=this.applyCandles(w,this.getRows(w.symbol),now)||changed;
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
