import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

export const MANUAL_PRICE_PUSH_ALERT_VERSION =
  'MANUAL_PRICE_PUSH_ALERT_V1_BINANCE_MARK_CROSS_20261004';
export const MANUAL_PRICE_PUSH_SIGNAL_TYPE = 'MANUAL_BINANCE_PRICE_ALERT';

const finite = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function normalizeManualPriceAlertSymbol(value) {
  const compact = String(value ?? '').trim().toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (!compact) throw new Error('Nhập mã coin, ví dụ BTC hoặc BTCUSDT.');
  const symbol = compact.endsWith('USDT') ? compact : `${compact}USDT`;
  if (symbol === 'USDT' || symbol.length > 36) throw new Error('Mã coin không hợp lệ.');
  return symbol;
}

function priceText(value) {
  const number = finite(value);
  return number == null ? '—' : number.toLocaleString('en-US', { maximumSignificantDigits: 12 });
}

function crossingDirection(previousPrice, currentPrice, targetPrice) {
  if (previousPrice < targetPrice && currentPrice >= targetPrice) return 'UP';
  if (previousPrice > targetPrice && currentPrice <= targetPrice) return 'DOWN';
  if (previousPrice === targetPrice) return currentPrice >= targetPrice ? 'UP' : 'DOWN';
  if (currentPrice === targetPrice) return previousPrice <= targetPrice ? 'UP' : 'DOWN';
  return null;
}

export function buildManualPricePushPayload(alert = {}) {
  const direction = alert.triggerDirection === 'DOWN' ? 'DOWN' : 'UP';
  const verb = direction === 'UP' ? 'cắt lên' : 'cắt xuống';
  return {
    signalType: MANUAL_PRICE_PUSH_SIGNAL_TYPE,
    eventId: `manual-price:${alert.id}:${alert.triggeredAt}`,
    title: `🔔 ${alert.symbol} chạm ${priceText(alert.targetPrice)}`,
    body: `MARK Binance ${priceText(alert.triggerPrice)} đã ${verb} mốc ${priceText(alert.targetPrice)} bạn đặt.`,
    url: `/coin-level-analysis?symbol=${encodeURIComponent(alert.symbol)}`,
    side: direction,
    symbol: alert.symbol,
    targetPrice: alert.targetPrice,
    triggerPrice: alert.triggerPrice,
    triggerDirection: direction,
    notifiedAt: alert.triggeredAt,
  };
}

function emptyState(now) {
  return { version: MANUAL_PRICE_PUSH_ALERT_VERSION, updatedAt: now, alerts: [] };
}

async function writeJsonAtomic(path, payload) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

function normalizeStoredAlert(value = {}) {
  try {
    const symbol = normalizeManualPriceAlertSymbol(value.symbol);
    const targetPrice = finite(value.targetPrice);
    if (!(targetPrice > 0)) return null;
    return {
      id: String(value.id ?? randomUUID()),
      symbol,
      targetPrice,
      status: value.status === 'TRIGGERED' ? 'TRIGGERED' : 'ACTIVE',
      direction: ['UP', 'DOWN', 'AT_TARGET'].includes(value.direction) ? value.direction : null,
      referencePrice: finite(value.referencePrice),
      lastPrice: finite(value.lastPrice),
      createdAt: finite(value.createdAt) ?? Date.now(),
      armedAt: finite(value.armedAt),
      triggeredAt: finite(value.triggeredAt),
      triggerPrice: finite(value.triggerPrice),
      triggerDirection: ['UP', 'DOWN'].includes(value.triggerDirection) ? value.triggerDirection : null,
      pushResult: value.pushResult && typeof value.pushResult === 'object' ? value.pushResult : null,
    };
  } catch {
    return null;
  }
}

export class ManualPricePushAlerts {
  constructor({
    stateFile,
    pushSender = async () => ({ attempted: 0, sent: 0 }),
    onSymbolsChanged = () => {},
    now = () => Date.now(),
    maxActive = 50,
  } = {}) {
    this.stateFile = stateFile;
    this.pushSender = pushSender;
    this.onSymbolsChanged = onSymbolsChanged;
    this.now = now;
    this.maxActive = Math.max(1, Number(maxActive) || 50);
    this.state = null;
    this.initializing = null;
    this.queue = Promise.resolve();
    this.livePrices = new Map();
  }

  activeSymbols() {
    return [...new Set((this.state?.alerts ?? [])
      .filter(alert => alert.status === 'ACTIVE')
      .map(alert => alert.symbol))];
  }

  #publishSymbols() {
    try { this.onSymbolsChanged(this.activeSymbols()); } catch {}
  }

  async initialize() {
    if (this.state) return this.snapshot();
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      const now = this.now();
      try {
        const parsed = JSON.parse(await readFile(this.stateFile, 'utf8'));
        this.state = {
          ...emptyState(now),
          ...parsed,
          version: MANUAL_PRICE_PUSH_ALERT_VERSION,
          alerts: (Array.isArray(parsed?.alerts) ? parsed.alerts : [])
            .map(normalizeStoredAlert).filter(Boolean).slice(-200),
        };
      } catch (error) {
        if (error?.code !== 'ENOENT') console.warn(`[ManualPricePush] state reset: ${error.message}`);
        this.state = emptyState(now);
      }
      this.#publishSymbols();
      return this.snapshot();
    })();
    try { return await this.initializing; } finally { this.initializing = null; }
  }

  #run(task) {
    const next = this.queue.then(async () => {
      await this.initialize();
      return task();
    });
    this.queue = next.catch(() => {});
    return next;
  }

  async #save() {
    this.state.version = MANUAL_PRICE_PUSH_ALERT_VERSION;
    this.state.updatedAt = this.now();
    await writeJsonAtomic(this.stateFile, this.state);
  }

  snapshot() {
    const alerts = (this.state?.alerts ?? []).map(alert => {
      const live = this.livePrices.get(alert.symbol);
      return {
        ...alert,
        currentPrice: finite(live?.markPrice) ?? finite(alert.lastPrice),
        currentPriceAt: finite(live?.eventTime),
      };
    }).sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
    return {
      version: MANUAL_PRICE_PUSH_ALERT_VERSION,
      generatedAt: this.now(),
      observeOnly: true,
      binanceEligible: false,
      activeCount: alerts.filter(alert => alert.status === 'ACTIVE').length,
      triggeredCount: alerts.filter(alert => alert.status === 'TRIGGERED').length,
      alerts,
    };
  }

  create({ symbol: rawSymbol, targetPrice: rawTargetPrice, currentPrice = null } = {}) {
    return this.#run(async () => {
      const symbol = normalizeManualPriceAlertSymbol(rawSymbol);
      const targetPrice = finite(rawTargetPrice);
      if (!(targetPrice > 0)) throw new Error('Giá cảnh báo phải lớn hơn 0.');
      const duplicate = this.state.alerts.find(alert => alert.status === 'ACTIVE'
        && alert.symbol === symbol && alert.targetPrice === targetPrice);
      if (duplicate) throw new Error(`${symbol} đã có cảnh báo đang chờ tại giá này.`);
      if (this.state.alerts.filter(alert => alert.status === 'ACTIVE').length >= this.maxActive) {
        throw new Error(`Đã đạt giới hạn ${this.maxActive} cảnh báo đang chờ.`);
      }
      const now = this.now();
      const livePrice = finite(currentPrice) ?? finite(this.livePrices.get(symbol)?.markPrice);
      const alert = {
        id: randomUUID(), symbol, targetPrice, status: 'ACTIVE',
        direction: livePrice == null ? null : livePrice < targetPrice ? 'UP'
          : livePrice > targetPrice ? 'DOWN' : 'AT_TARGET',
        referencePrice: livePrice, lastPrice: livePrice,
        createdAt: now, armedAt: livePrice == null ? null : now,
        triggeredAt: null, triggerPrice: null, triggerDirection: null, pushResult: null,
      };
      this.state.alerts = [alert, ...this.state.alerts].slice(0, 200);
      await this.#save();
      this.#publishSymbols();
      return { created: true, alert, snapshot: this.snapshot() };
    });
  }

  rearm(id, { currentPrice = null } = {}) {
    return this.#run(async () => {
      const alert = this.state.alerts.find(item => item.id === String(id ?? ''));
      if (!alert) throw new Error('Không tìm thấy cảnh báo giá.');
      const now = this.now();
      const livePrice = finite(currentPrice) ?? finite(this.livePrices.get(alert.symbol)?.markPrice);
      alert.status = 'ACTIVE';
      alert.direction = livePrice == null ? null : livePrice < alert.targetPrice ? 'UP'
        : livePrice > alert.targetPrice ? 'DOWN' : 'AT_TARGET';
      alert.referencePrice = livePrice;
      alert.lastPrice = livePrice;
      alert.armedAt = livePrice == null ? null : now;
      alert.triggeredAt = null;
      alert.triggerPrice = null;
      alert.triggerDirection = null;
      alert.pushResult = null;
      await this.#save();
      this.#publishSymbols();
      return { rearmed: true, alert, snapshot: this.snapshot() };
    });
  }

  remove(id) {
    return this.#run(async () => {
      const before = this.state.alerts.length;
      this.state.alerts = this.state.alerts.filter(alert => alert.id !== String(id ?? ''));
      if (this.state.alerts.length === before) throw new Error('Không tìm thấy cảnh báo giá.');
      await this.#save();
      this.#publishSymbols();
      return { removed: true, snapshot: this.snapshot() };
    });
  }

  onMark({ symbol: rawSymbol, markPrice: rawMarkPrice, eventTime } = {}) {
    const symbol = String(rawSymbol ?? '').toUpperCase();
    const markPrice = finite(rawMarkPrice);
    if (!symbol || !(markPrice > 0)) return Promise.resolve({ triggered: [] });
    return this.#run(async () => {
      const previousLive = this.livePrices.get(symbol);
      this.livePrices.set(symbol, { markPrice, eventTime: finite(eventTime) ?? this.now() });
      const matches = this.state.alerts.filter(alert => alert.status === 'ACTIVE' && alert.symbol === symbol);
      if (!matches.length) return { triggered: [] };
      const triggered = [];
      let firstPriceArmed = false;
      for (const alert of matches) {
        const previousPrice = finite(previousLive?.markPrice) ?? finite(alert.lastPrice);
        if (!(previousPrice > 0)) {
          alert.referencePrice = markPrice;
          alert.lastPrice = markPrice;
          alert.direction = markPrice < alert.targetPrice ? 'UP' : markPrice > alert.targetPrice ? 'DOWN' : 'AT_TARGET';
          alert.armedAt = this.now();
          firstPriceArmed = true;
          continue;
        }
        alert.lastPrice = markPrice;
        const direction = crossingDirection(previousPrice, markPrice, alert.targetPrice);
        if (!direction) continue;
        alert.status = 'TRIGGERED';
        alert.triggeredAt = this.now();
        alert.triggerPrice = markPrice;
        alert.triggerDirection = direction;
        alert.direction = direction;
        triggered.push(alert);
      }
      if (!triggered.length) {
        if (firstPriceArmed) await this.#save();
        return { triggered: [] };
      }
      await this.#save();
      this.#publishSymbols();
      for (const alert of triggered) {
        try {
          alert.pushResult = await this.pushSender(buildManualPricePushPayload(alert));
        } catch (error) {
          alert.pushResult = { attempted: 0, sent: 0, failed: 1, error: String(error?.message ?? error) };
        }
      }
      await this.#save();
      return { triggered: triggered.map(alert => ({ ...alert })) };
    });
  }
}
