import WebSocket from 'ws';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { BTC_LIQUIDATION_CONTEXT_VERSION as VERSION, BTC_LIQUIDATION_CONTEXT_LEGACY_VERSION as LEGACY_VERSION,
  BTC_LIQUIDATION_CONTEXT_V2_VERSION as V2_VERSION, BTC_LIQUIDATION_CONTEXT_V3_VERSION as V3_VERSION } from '../public/btc-liquidation-context-model.js';
import { forecastLiquidationRisk } from './btcLiquidationForecast.js';

const MIN = 60_000;
const BAR = 5 * MIN;
const numeric = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const pct = (a, b) => a != null && b > 0 ? (a / b - 1) * 100 : null;
const quantile = (values, p) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null;
};

export function contextInputs({ candles = [], accounts = [], positions = [], interests = [] }, now) {
  const errors = [];
  const ordered = (rows, field) => [...rows].filter(r => numeric(r[field]) > 0 && r[field] <= now)
    .sort((a, b) => a[field] - b[field]);
  const series = (rows, field, label, minimum = 4) => {
    const sorted = ordered(rows, 'timestamp');
    const last = sorted.at(-1);
    const valid = sorted.length >= minimum && now - last.timestamp <= 7 * MIN
      && sorted.every((r, i) => numeric(r[field]) > 0
        && (!i || r.timestamp - sorted[i - 1].timestamp === BAR));
    if (!valid) errors.push(`${label}: thiếu, cũ hoặc đứt chuỗi 5m.`);
    const previous = sorted.find(r => r.timestamp === last?.timestamp - 3 * BAR);
    const previous30 = sorted.find(r=>r.timestamp===last?.timestamp-6*BAR);
    const previous45 = sorted.find(r=>r.timestamp===last?.timestamp-9*BAR);
    const values = sorted.slice(0, -1).map(r => numeric(r[field]));
    return { value: numeric(last?.[field]), change15mPct: pct(numeric(last?.[field]), numeric(previous?.[field])),
      change30mPct:pct(numeric(last?.[field]),numeric(previous30?.[field])),
      buildBefore15mPct:pct(numeric(previous?.[field]),numeric(previous45?.[field])),
      at: last?.timestamp ?? null, p20: quantile(values, .2), p80: quantile(values, .8), samples: sorted.length };
  };
  const bars = ordered(candles, 'closeTime');
  const last = bars.at(-1), prior = bars.at(-2);
  if (bars.length < 7 || now - last.closeTime > 7 * MIN
    || bars.some((b, i) => ![b.open, b.high, b.low, b.close, b.quoteVolume].every(v => numeric(v) > 0)
      || numeric(b.takerBuyQuoteVolume) == null || b.takerBuyQuoteVolume < 0 || b.takerBuyQuoteVolume > b.quoteVolume
      || b.low > Math.min(b.open, b.close) || b.high < Math.max(b.open, b.close)
      || b.openTime % BAR !== 0 || b.closeTime - b.openTime !== BAR - 1
      || (i && b.openTime - bars[i - 1].openTime !== BAR))) errors.push('Nến BTC 5m: thiếu, cũ hoặc đứt chuỗi.');
  const account = series(accounts, 'longShortRatio', 'Ratio tài khoản', 37);
  const position = series(positions, 'longShortRatio', 'Ratio vị thế top trader', 37);
  const oi = series(interests, 'sumOpenInterest', 'OI');
  if (bars.length && [account.at, position.at, oi.at].some(t => t == null || Math.abs(t - last.closeTime) > BAR + 1)) {
    errors.push('Nguồn nến, ratio và OI chưa đồng bộ.');
  }
  const recent = bars.slice(-3), volume = recent.reduce((s, b) => s + b.quoteVolume, 0);
  const volumeBase=bars.slice(-15,-3), previousRange=bars.slice(-7,-1);
  const support30m=previousRange.length===6?Math.min(...previousRange.map(b=>b.low)):null;
  const resistance30m=previousRange.length===6?Math.max(...previousRange.map(b=>b.high)):null;
  const baselineVolume15m=volumeBase.length===12?volumeBase.reduce((s,b)=>s+b.quoteVolume,0)/4:null;
  return { ready: errors.length === 0, errors, account, position, oi,
    price: last?.close ?? null, closedAt: last?.closeTime ?? null,
    price15mPct: pct(last?.close, bars.at(-4)?.close),
    price5mPct: pct(last?.close, prior?.close),
    forecastData:{ready:errors.length===0 && bars.length>=16 && oi.samples>=10,
      volume15mUsd:volume,volumeRatio15m:baselineVolume15m>0?volume/baselineVolume15m:null,
      support30m,resistance30m,breakSupport:support30m!=null && last.close<support30m,
      breakResistance:resistance30m!=null && last.close>resistance30m},
    takerBuy15m: volume > 0 ? recent.reduce((s, b) => s + b.takerBuyQuoteVolume, 0) / volume : null,
    holdingLow: Boolean(last && prior && last.low >= prior.low && last.close >= prior.close),
    holdingHigh: Boolean(last && prior && last.high <= prior.high && last.close <= prior.close) };
}

export function classifyLiquidationContext(m, liq, breadth = {}, previousRisk = null, now = Date.now()) {
  const prior = previousRisk && ['LONG','SHORT'].includes(previousRisk.side)
    && previousRisk.at > 0 && previousRisk.at <= now && now - previousRisk.at <= 60 * MIN ? previousRisk : null;
  const transportReady=liq?.transportReady===true || liq?.transportReady==null && liq?.ready===true;
  if (!transportReady) return { state: 'WAIT_DATA', ready: false,
    reasons: [...(m?.errors ?? []), ...(liq?.errors ?? ['Nguồn thanh lý chưa đủ dữ liệu.'])], risk: prior };
  // An observed liquidation burst must not wait for delayed BTC/ratio/OI REST data.
  const longSpike = liq.ready===true && liq.long5m >= 5_000_000 && liq.longShare >= .7 && liq.longBurst >= 3;
  const shortSpike = liq.ready===true && liq.short5m >= 5_000_000 && liq.longShare <= .3 && liq.shortBurst >= 3;
  // Actual observed USD is a lower bound, usable without a complete 30m comparison baseline.
  const longObserved=liq.long5m>=1_000_000 || liq.long1m>=1_000_000;
  const shortObserved=liq.short5m>=1_000_000 || liq.short1m>=1_000_000;
  const side = longSpike ? 'LONG' : shortSpike ? 'SHORT'
    :longObserved||shortObserved?liq.long5m>=liq.short5m?'LONG':'SHORT':null;
  const spike=longSpike||shortSpike;
  const alertState=spike?`${side}_SPIKE`:longObserved&&shortObserved?'BOTH_OBSERVED_LARGE':`${side}_OBSERVED_LARGE`;
  const amount = side==='LONG' ? liq.long5m : liq.short5m;
  let risk = prior;
  if (side) {
    const same = prior?.side === side;
    risk = { side, at: now, startedAt: same ? prior.startedAt ?? prior.at : now,
      peak: same ? Math.max(prior.peak, amount) : amount,
      peakAt: same && prior.peak >= amount ? prior.peakAt ?? prior.at : now,
      burstConfirmed:spike || same && prior.burstConfirmed===true,
      ...(spike?{burstAt:now}:same && prior.burstAt?{burstAt:prior.burstAt}:{}),
      confirmed: same && prior.confirmed === true,
      ...(same && prior.confirmedAt ? {confirmedAt:prior.confirmedAt} : {}) };
  }
  if(!liq.ready) return {state:side?alertState:prior?`RECENT_${prior.side}_LIQUIDATION`:'WAIT_DATA',ready:false,risk,
    reasons:[...(side?[`Đã quan sát thanh lý ${longObserved&&shortObserved?'LONG và SHORT':side} ≥1 triệu USD/5m; ghi nhận ngay trong lúc thu nền.`]:[]),
      ...(liq.errors??[]),'Chưa đủ nền để kết luận tăng ≥3× hoặc thanh lý dây chuyền; không bỏ qua số đã quan sát.']};
  if (!m?.ready) return { state: side ? alertState : risk && !risk.confirmed
      ? `RECENT_${risk.side}_LIQUIDATION` : 'WAIT_DATA', ready: false, risk,
    reasons: [...(risk ? [`Đã ghi nhận đợt thanh lý ${risk.side}; không xóa dấu vết vì BTC/ratio/OI cập nhật chậm.`] : []),
      ...(m?.errors ?? ['Đang tải nến BTC, ratio và OI.']), 'Chưa đủ dữ liệu để xác nhận thanh lý dây chuyền hoặc hồi phục.'] };
  const breadthFresh = breadth.dataReady === true && breadth.evaluatedAt <= now && now - breadth.evaluatedAt <= MIN;
  const down = breadthFresh && breadth.metrics?.context15m === 'DOWN';
  const up = breadthFresh && breadth.metrics?.context15m === 'UP';
  // Allow price/OI confirmation up to 30m after a LIVE observed spike, never after restart/history replay.
  const recentBurst=risk?.burstConfirmed===true && risk.burstAt>0 && risk.burstAt<=now && now-risk.burstAt<=30*MIN;
  const longEvidence = longSpike || recentBurst && risk.side === 'LONG';
  const shortEvidence = shortSpike || recentBurst && risk.side === 'SHORT';
  const longCascade = longEvidence
    && m.oi.change15mPct <= -.3 && m.price15mPct <= -.3 && m.takerBuy15m <= .45
    && (down || m.price15mPct <= -.5);
  const shortCascade = shortEvidence
    && m.oi.change15mPct <= -.3 && m.price15mPct >= .3 && m.takerBuy15m >= .55
    && (up || m.price15mPct >= .5);
  if (longCascade || shortCascade) {
    const side = longCascade ? 'LONG' : 'SHORT';
    const matching = risk?.side === side ? risk : null;
    return { state: `${side}_CASCADE`, ready: true, risk: { ...matching, side, confirmed:true,
      confirmedAt:matching?.confirmedAt ?? now },
    reasons: [`Đợt thanh lý ${side} tăng đột biến đã ghi nhận trong 30 phút gần nhất; giá/OI hiện cùng xác nhận.`,
      `OI giảm ${Math.abs(m.oi.change15mPct).toFixed(2)}%/15m; giá và dòng giao dịch cùng xác nhận áp lực.`] };
  }
  if (risk?.confirmed) {
    const long = risk.side === 'LONG';
    const recovering = (long ? liq.long5m : liq.short5m) <= risk.peak * .5
      && m.oi.change15mPct >= -.15 && (long ? m.holdingLow && m.takerBuy15m >= .5 && !down
        : m.holdingHigh && m.takerBuy15m <= .5 && !up);
    return { state: recovering ? `POST_${risk.side}_LIQUIDATION` : `${risk.side}_CASCADE`,
      ready: true, risk, reasons: recovering
        ? ['Thanh lý đã giảm ít nhất 50% so với đỉnh ghi nhận; OI dịu lại, hai nến đóng gần nhất và dòng giao dịch đang ổn định.',
          'Đang kiểm tra hồi phục; chưa xác nhận đảo chiều.']
        : ['Giữ cảnh báo từ đợt thanh lý gần nhất; chưa đủ bằng chứng ổn định giá, OI và dòng giao dịch.',
          'Một nhịp hồi ngắn chưa xóa trạng thái rủi ro.'] };
  }
  if (risk) return { state: side ? alertState : `RECENT_${risk.side}_LIQUIDATION`, ready:true, risk,
    reasons: [side ? spike?`Thanh lý ${side} 5m ≥5 triệu USD, tăng ≥3× nền và chiếm ≥70%; báo ngay, không chờ OI.`
      :`Đã quan sát thanh lý ${longObserved&&shortObserved?'LONG và SHORT':side} ≥1 triệu USD/5m; chưa đủ điều kiện gọi là tăng đột biến/dây chuyền.`
      : `Giữ dấu vết đợt thanh lý ${risk.side} trong 60 phút kể từ lần cuối đạt ngưỡng, dù cửa sổ 5m đã dịu lại.`,
      `Chưa xác nhận dây chuyền: BTC 15m ${m.price15mPct.toFixed(2)}%; OI 15m ${m.oi.change15mPct.toFixed(2)}%. Không phải tín hiệu vào lệnh hoặc xác nhận hồi phục.`] };
  const longCrowded = m.account.value >= 1.2 && m.account.value >= m.account.p80
    && m.position.value > 1 && m.oi.change15mPct >= .15 && m.price15mPct <= .15
    && (m.price5mPct < 0 || down);
  const shortCrowded = m.account.value <= 1 / 1.2 && m.account.value <= m.account.p20
    && m.position.value < 1 && m.oi.change15mPct >= .15 && m.price15mPct >= -.15
    && (m.price5mPct > 0 || up);
  return { state: longCrowded ? 'LONG_CROWDED' : shortCrowded ? 'SHORT_CROWDED' : 'NEUTRAL', ready: true, risk: null,
    reasons: longCrowded || shortCrowded
      ? ['Ratio tài khoản ở vùng cực trị so với nền trước đó, top trader cùng nghiêng hướng và OI đang tăng.',
        'Giá tiến triển yếu hoặc đi ngược vị thế đang tích tụ; chưa xác nhận thanh lý dây chuyền.']
      : ['Chưa đủ tổ hợp ratio, OI, giá và thanh lý để cảnh báo. Trạng thái này không bảo đảm thị trường an toàn.'] };
}

export class BtcLiquidationContext {
  constructor({ client, getBreadth = () => ({}), file = null, now = () => Date.now(),
    socketFactory = url => new WebSocket(url, { handshakeTimeout: 10_000 }), url = 'wss://fstream.binance.com/market/ws/!forceOrder@arr' } = {}) {
    Object.assign(this, { client, getBreadth, file, now, socketFactory, url });
    this.events = []; this.seen = new Map(); this.history = []; this.forecastHistory=[]; this.inputs = null;
    this.risk = null; this.lastEpisode = null; this.lastEpisodeSavedAt = 0;
    this.socket = null; this.socketState = 'IDLE'; this.connectedAt = null;
    this.lastTransportAt = null; this.lastEventAt = null; this.fetchedAt = null;
    this.error = null; this.storageError = null; this.pendingSave = Promise.resolve();
    this.running = false; this.started = false; this.stopped = false; this.last = null; this.lastPruneAt = 0;
  }
  async load() {
    if (!this.file) return;
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8'));
      if (![VERSION,V3_VERSION,V2_VERSION,LEGACY_VERSION].includes(saved.version) || !Array.isArray(saved.history)) throw new Error('schema');
      this.history = saved.history.filter(x => Number(x.at) > 0 && x.at <= this.now()).slice(-100)
        .map(x=>({...x,version:x.version ?? saved.version}));
      this.forecastHistory=(saved.forecastHistory??[]).filter(x=>[VERSION,V3_VERSION].includes(x.version) && Number(x.at)>0 && x.at<=this.now()).slice(-100);
      const episode = saved.version !== LEGACY_VERSION ? saved.lastEpisode : null;
      if (episode && ['LONG','SHORT'].includes(episode.side) && numeric(episode.peak) > 0
        && numeric(episode.at) > 0 && episode.at <= this.now()) this.lastEpisode = {...episode, historicalOnly:true};
      // Never restore live coverage, risk or liquidation totals across an unobserved gap.
    } catch (e) { if (e.code !== 'ENOENT') this.storageError = 'Không đọc được lịch sử; giữ nguyên file, tạm dừng ghi.'; }
  }
  async start() {
    if (this.started) return;
    this.started = true; await this.load(); if (this.stopped) return;
    this.connect(); void this.refresh();
    this.restTimer = setInterval(() => { void this.refresh(); }, MIN); this.restTimer.unref?.();
    this.timer = setInterval(() => {
      if (this.socketState === 'OPEN' && this.now() - this.lastTransportAt > 4 * MIN) this.socket?.terminate?.();
      this.evaluate();
    }, 5_000); this.timer.unref?.();
  }
  connect() {
    if (this.stopped || this.socket) return;
    this.socketState = 'CONNECTING';
    let socket;
    try { socket = this.socketFactory(this.url); } catch { this.reconnect(); return; }
    this.socket = socket;
    socket.on('open', () => {
      this.socketState = 'OPEN'; this.connectedAt = this.now(); this.lastTransportAt = this.now();
      this.events = []; this.seen.clear();
    });
    socket.on('ping', () => { this.lastTransportAt = this.now(); });
    socket.on('pong', () => { this.lastTransportAt = this.now(); });
    socket.on('message', raw => {
      this.lastTransportAt = this.now();
      try { const parsed = JSON.parse(raw.toString()), data = parsed.data ?? parsed;
        for (const event of Array.isArray(data) ? data : [data]) this.ingest(event);
      } catch { /* A malformed event is not usable liquidation evidence. */ }
    });
    socket.on('error', () => { this.socketState = 'ERROR'; socket.terminate?.(); });
    socket.on('close', () => { this.socket = null; this.connectedAt = null; this.reconnect(); this.evaluate(); });
  }
  reconnect() {
    this.socketState = this.stopped ? 'STOPPED' : 'RECONNECTING';
    if (this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.connect(); }, 5_000);
    this.retryTimer.unref?.();
  }
  stop() {
    this.stopped = true; clearInterval(this.restTimer); clearInterval(this.timer); clearTimeout(this.retryTimer);
    this.socket?.terminate?.(); this.socketState = 'STOPPED';
  }
  ingest(event) {
    const o = event?.o, now = this.now();
    const price = numeric(o?.ap), quantity = numeric(o?.z), at = numeric(o?.T ?? event?.E);
    if (event?.e !== 'forceOrder' || !/^[^\s]{1,40}USDT$/u.test(o?.s ?? '')
      || Number(event.st ?? o.st ?? 1) !== 1 || !['BUY', 'SELL'].includes(o.S)
      || !(price > 0 && quantity > 0 && at > 0) || at > now || now - at > MIN) return false;
    const key = [o.s, o.S, at, price, quantity].join('|');
    if (now - this.lastPruneAt >= 5_000) this.prune(now);
    if (this.seen.has(key)) return false;
    if (this.events.length >= 100_000) {
      // Bounded memory; incomplete coverage must re-warm instead of looking quiet.
      this.events = []; this.seen.clear(); this.connectedAt = now;
    }
    this.seen.set(key, at); this.events.push({ symbol: o.s, side: o.S, at, usd: price * quantity });
    this.lastEventAt = at; return true;
  }
  prune(now) {
    this.lastPruneAt = now;
    this.events = this.events.filter(e => e.at > now - 35 * MIN && e.at <= now);
    for (const [key, at] of this.seen) if (at <= now - MIN) this.seen.delete(key);
  }
  liquidationSummary(now = this.now()) {
    this.prune(now);
    const transportReady=this.socketState==='OPEN' && this.connectedAt!=null && this.connectedAt<=now
      && this.lastTransportAt!=null && this.lastTransportAt<=now && now-this.lastTransportAt<=4*MIN;
    const coverageMs = transportReady ? now - this.connectedAt : 0;
    const errors = [];
    if (!transportReady) {
      errors.push('Nguồn thanh lý chưa kết nối hoặc mất heartbeat.');
    }
    if (coverageMs < 35 * MIN) errors.push(`Đang thu nền thanh lý: ${Math.floor(coverageMs / MIN)}/35 phút liên tục.`);
    const sum = (side, start, end) => this.events.filter(e => e.side === side && e.at > start && e.at <= end)
      .reduce((s, e) => s + e.usd, 0);
    const long5m = sum('SELL', now - BAR, now), short5m = sum('BUY', now - BAR, now);
    const longBaseline5m = sum('SELL', now - 35 * MIN, now - BAR) / 6;
    const shortBaseline5m = sum('BUY', now - 35 * MIN, now - BAR) / 6;
    return { ready: !errors.length, transportReady, errors, coverageMs, long5m, short5m,
      long1m: sum('SELL', now - MIN, now), short1m: sum('BUY', now - MIN, now),
      longBaseline5m, shortBaseline5m,
      longBurst: long5m / Math.max(100_000, longBaseline5m), shortBurst: short5m / Math.max(100_000, shortBaseline5m),
      longShare: long5m + short5m > 0 ? long5m / (long5m + short5m) : null,
      symbols5m: new Set(this.events.filter(e => e.at > now - BAR).map(e => e.symbol)).size,
      socketState: this.socketState, lastEventAt: this.lastEventAt,
      sampled: true, scope: 'BINANCE_USDT_M_SNAPSHOT' };
  }
  async refresh() {
    if (this.running || this.stopped) return;
    this.running = true;
    const opts = { priority: 8, dropOnCongestion: true, source: 'btcLiquidationContext' };
    try {
      const results = await Promise.allSettled([
        this.client.getKlines('BTCUSDT', '5m', 40, opts),
        this.client.getGlobalLongShortRatio('BTCUSDT', '5m', 288, opts),
        this.client.getTopLongShortPositionRatio('BTCUSDT', '5m', 288, opts),
        this.client.get('/futures/data/openInterestHist', { symbol: 'BTCUSDT', period: '5m', limit: 12 }, opts),
      ]);
      if (results.some(r => r.status !== 'fulfilled' || !Array.isArray(r.value))) throw new Error('incomplete');
      this.inputs = contextInputs(Object.fromEntries(['candles', 'accounts', 'positions', 'interests']
        .map((k, i) => [k, results[i].value])), this.now());
      this.fetchedAt = this.now(); this.error = null;
    } catch { this.error = 'Chưa cập nhật được đầy đủ nến/ratio/OI từ Binance; đang thử lại.'; }
    finally { this.running = false; this.evaluate(); }
  }
  evaluate() {
    const now = this.now(), liquidation = this.liquidationSummary(now);
    const oldSource = this.inputs && [this.inputs.closedAt, this.inputs.account?.at,
      this.inputs.position?.at, this.inputs.oi?.at].some(at => !(at > 0) || now - at > 7 * MIN);
    const inputs = !this.inputs || now - this.fetchedAt > 90_000 || this.error || oldSource
      ? { ...this.inputs, ready: false, errors: [this.error ?? 'Đang chờ cập nhật nến BTC, ratio và OI.'] }
      : this.inputs;
    const result = classifyLiquidationContext(inputs, liquidation, this.getBreadth(), this.risk, now);
    // Reuse only the LAST complete atomic snapshot for <=90s if the next REST refresh fails.
    // Never mix partially refreshed series or restore these inputs from disk.
    const forecastInputs=this.inputs && now-this.fetchedAt<=90_000 && !oldSource?this.inputs:inputs;
    const forecast=forecastLiquidationRisk(forecastInputs,now);
    forecast.dataFetchedAt=this.fetchedAt;
    if(forecast.ready && this.error) forecast.refreshWarning='Lượt tải mới lỗi; đang dùng bộ dữ liệu đầy đủ gần nhất, tuổi không quá 90 giây.';
    const forecastSignature=JSON.stringify(forecast.sides.map(s=>[s.side,s.tier]));
    const forecastChanged=forecastSignature!==this.lastForecastSignature;
    if(forecastChanged) {
      this.lastForecastSignature=forecastSignature;
      this.forecastHistory.push({version:VERSION,at:now,forecast,inputs:forecastInputs});
      this.forecastHistory=this.forecastHistory.slice(-100);
    }
    this.risk = result.risk;
    if (result.risk) this.lastEpisode = {...result.risk,historicalOnly:false};
    const stateChanged = this.last?.state !== result.state;
    if (stateChanged) {
      const entry = { version:VERSION, at: now, state: result.state, reasons: result.reasons, inputs, liquidation, risk:result.risk };
      this.history.push(entry); this.history = this.history.slice(-100);
    }
    if (stateChanged || forecastChanged || result.risk && now - this.lastEpisodeSavedAt >= 30_000) {
      if (this.file && !this.storageError) {
        this.lastEpisodeSavedAt = now;
        const data = JSON.stringify({ version: VERSION, history: this.history,
          forecastHistory:this.forecastHistory,lastEpisode:this.lastEpisode });
        this.pendingSave = this.pendingSave.then(async () => {
          if (this.storageError) return;
          const tmp = `${this.file}.tmp-${process.pid}`;
          await writeFile(tmp, data); await rename(tmp, this.file);
        }).catch(() => { this.storageError = 'Không lưu được lịch sử cảnh báo.'; });
      }
    }
    this.last = { ...result, version: VERSION, observeOnly: true, evaluatedAt: now,
      inputs, liquidation, forecast, lastEpisode:this.lastEpisode,
      dataFetchedAt: this.fetchedAt, storageError: this.storageError };
    return this.last;
  }
  snapshot() {
    return { ...this.evaluate(), history: this.history.slice(-12).reverse(),
      forecastHistory:this.forecastHistory.slice(-12).reverse(),
      closedStats: { closed: 0, avgRoe: null },
      note: 'Số thanh lý quan sát từ snapshot Binance; không phải tổng đầy đủ đa sàn. Ngưỡng thử nghiệm, chưa hiệu chuẩn xác suất.' };
  }
}
