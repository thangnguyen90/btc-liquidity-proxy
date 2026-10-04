import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import webPush from 'web-push';

export const OPPOSITE_LIQUIDITY_WEB_PUSH_VERSION =
  'OPPOSITE_LIQUIDITY_WEB_PUSH_V2_DISCORD_ROUTE_ALLOWLIST_20261004';

const RETAIN_EVENT_MS = 7 * 24 * 60 * 60_000;

const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const cleanText = (value, max = 240) => String(value ?? '').trim().slice(0, max);

function validBase64Url(value, minLength = 8, maxLength = 256) {
  const text = cleanText(value, maxLength + 1);
  return text.length >= minLength && text.length <= maxLength && /^[A-Za-z0-9_-]+$/.test(text);
}

export function normalizeWebPushSubscription(value = {}) {
  let endpoint;
  try {
    endpoint = new URL(cleanText(value?.endpoint, 4096));
  } catch {
    throw new Error('INVALID_PUSH_ENDPOINT');
  }
  if (endpoint.protocol !== 'https:' || endpoint.toString().length > 4096) {
    throw new Error('INVALID_PUSH_ENDPOINT');
  }
  const p256dh = cleanText(value?.keys?.p256dh, 256);
  const auth = cleanText(value?.keys?.auth, 128);
  if (!validBase64Url(p256dh, 32, 256) || !validBase64Url(auth, 8, 128)) {
    throw new Error('INVALID_PUSH_KEYS');
  }
  const expirationTime = value?.expirationTime == null ? null : finite(value.expirationTime);
  return {
    endpoint: endpoint.toString(),
    expirationTime,
    keys: { p256dh, auth },
  };
}

function subscriptionId(endpoint) {
  return createHash('sha256').update(endpoint).digest('hex');
}

function emptyState(now) {
  return {
    version: OPPOSITE_LIQUIDITY_WEB_PUSH_VERSION,
    updatedAt: now,
    subscriptions: {},
    sentEvents: {},
    lastDelivery: null,
  };
}

async function writeJsonAtomic(path, payload, mode = 0o600) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode });
  await rename(temporary, path);
}

function formatPrice(value) {
  const parsed = finite(value);
  return parsed == null ? '—' : parsed.toLocaleString('en-US', { maximumSignificantDigits: 9 });
}

export function buildOppositeLiquidityPushPayload(event = {}) {
  const side = String(event.side ?? '').toUpperCase() === 'LONG' ? 'LONG' : 'SHORT';
  const symbol = cleanText(event.symbol, 40) || 'UNKNOWN';
  const interval = cleanText(event.interval, 10) || '—';
  const ratio = finite(event.depth?.oppositeRatio);
  const execution = cleanText(event.binanceExecution?.status ?? 'NO_BINANCE_CALLBACK', 80).toUpperCase();
  return {
    signalType: 'LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH',
    eventId: cleanText(event.eventId, 240),
    title: `${side === 'LONG' ? '🔴' : '🟢'} ${side} · ${symbol}`,
    body: `${interval} · vùng ${formatPrice(event.zone?.low)} – ${formatPrice(event.zone?.high)} · depth ngược ${ratio == null ? '—' : ratio.toFixed(3)}x · Binance ${execution}`,
    url: `/opposite-liquidity-manager?symbol=${encodeURIComponent(symbol)}`,
    side,
    symbol,
    interval,
    notifiedAt: finite(event.notifiedAt, Date.now()),
  };
}

export class OppositeLiquidityWebPushService {
  constructor({
    stateFile,
    vapidFile,
    vapidSubject = 'https://liquidity.nhathadev.trade',
    vapidPublicKey = '',
    vapidPrivateKey = '',
    webPushImpl = webPush,
    now = () => Date.now(),
    maxSubscriptions = 50,
  } = {}) {
    this.stateFile = stateFile;
    this.vapidFile = vapidFile;
    this.vapidSubject = cleanText(vapidSubject, 512) || 'https://liquidity.nhathadev.trade';
    this.vapidPublicKey = cleanText(vapidPublicKey, 256);
    this.vapidPrivateKey = cleanText(vapidPrivateKey, 256);
    this.webPush = webPushImpl;
    this.now = now;
    this.maxSubscriptions = Math.max(1, Math.min(200, Math.trunc(finite(maxSubscriptions, 50))));
    this.state = null;
    this.vapid = null;
    this.initializing = null;
    this.queue = Promise.resolve();
  }

  async initialize() {
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      const now = this.now();
      try {
        const parsed = JSON.parse(await readFile(this.stateFile, 'utf8'));
        this.state = {
          ...emptyState(now),
          ...parsed,
          version: OPPOSITE_LIQUIDITY_WEB_PUSH_VERSION,
          subscriptions: parsed?.subscriptions && typeof parsed.subscriptions === 'object'
            ? parsed.subscriptions : {},
          sentEvents: parsed?.sentEvents && typeof parsed.sentEvents === 'object'
            ? parsed.sentEvents : {},
        };
      } catch (error) {
        if (error?.code !== 'ENOENT') console.warn(`[OppositeWebPush] state reset: ${error.message}`);
        this.state = emptyState(now);
      }
      await this.#initializeVapid();
      return this.snapshotSync();
    })();
    return this.initializing;
  }

  async #initializeVapid() {
    let publicKey = this.vapidPublicKey;
    let privateKey = this.vapidPrivateKey;
    if (Boolean(publicKey) !== Boolean(privateKey)) throw new Error('VAPID_KEY_PAIR_INCOMPLETE');
    if (!publicKey) {
      try {
        const saved = JSON.parse(await readFile(this.vapidFile, 'utf8'));
        publicKey = cleanText(saved?.publicKey, 256);
        privateKey = cleanText(saved?.privateKey, 256);
      } catch (error) {
        if (error?.code !== 'ENOENT') console.warn(`[OppositeWebPush] VAPID reset: ${error.message}`);
      }
    }
    if (!publicKey || !privateKey) {
      const generated = this.webPush.generateVAPIDKeys();
      publicKey = generated.publicKey;
      privateKey = generated.privateKey;
      await writeJsonAtomic(this.vapidFile, {
        version: OPPOSITE_LIQUIDITY_WEB_PUSH_VERSION,
        generatedAt: this.now(),
        publicKey,
        privateKey,
      });
    }
    this.webPush.setVapidDetails(this.vapidSubject, publicKey, privateKey);
    this.vapid = { publicKey, privateKey };
  }

  #run(task) {
    const next = this.queue.catch(() => {}).then(async () => {
      await this.initialize();
      return task();
    });
    this.queue = next;
    return next;
  }

  async #save() {
    this.state.version = OPPOSITE_LIQUIDITY_WEB_PUSH_VERSION;
    this.state.updatedAt = this.now();
    await writeJsonAtomic(this.stateFile, this.state);
  }

  snapshotSync() {
    return {
      version: OPPOSITE_LIQUIDITY_WEB_PUSH_VERSION,
      configured: Boolean(this.vapid?.publicKey),
      subscriptionCount: Object.keys(this.state?.subscriptions ?? {}).length,
      maxSubscriptions: this.maxSubscriptions,
      updatedAt: this.state?.updatedAt ?? null,
      lastDelivery: this.state?.lastDelivery ?? null,
    };
  }

  async publicConfig() {
    await this.initialize();
    return {
      ...this.snapshotSync(),
      publicKey: this.vapid.publicKey,
      signalType: 'LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH',
    };
  }

  subscribe(value, metadata = {}) {
    return this.#run(async () => {
      const subscription = normalizeWebPushSubscription(value);
      const id = subscriptionId(subscription.endpoint);
      const now = this.now();
      const previous = this.state.subscriptions[id];
      this.state.subscriptions[id] = {
        subscription,
        createdAt: finite(previous?.createdAt, now),
        lastSeenAt: now,
        userAgent: cleanText(metadata.userAgent, 320),
        deviceLabel: cleanText(metadata.deviceLabel, 80),
        lastSentAt: finite(previous?.lastSentAt),
        lastError: null,
        lastErrorAt: null,
      };
      const ordered = Object.entries(this.state.subscriptions)
        .sort((left, right) => finite(right[1]?.lastSeenAt, 0) - finite(left[1]?.lastSeenAt, 0));
      this.state.subscriptions = Object.fromEntries(ordered.slice(0, this.maxSubscriptions));
      await this.#save();
      return {
        subscribed: true,
        subscriptionId: id.slice(0, 16),
        subscriptionCount: Object.keys(this.state.subscriptions).length,
      };
    });
  }

  unsubscribe(endpointValue) {
    return this.#run(async () => {
      const endpoint = cleanText(endpointValue, 4096);
      const id = endpoint ? subscriptionId(endpoint) : '';
      const removed = Boolean(id && this.state.subscriptions[id]);
      if (removed) delete this.state.subscriptions[id];
      await this.#save();
      return { unsubscribed: removed, subscriptionCount: Object.keys(this.state.subscriptions).length };
    });
  }

  send(event = {}) {
    return this.sendPayload(buildOppositeLiquidityPushPayload(event));
  }

  sendPayload(payload = {}) {
    return this.#run(async () => {
      const eventId = cleanText(payload.eventId, 240);
      if (!eventId) return { attempted: 0, sent: 0, removed: 0, failed: 0, error: 'EVENT_ID_REQUIRED' };
      const signalType = cleanText(payload.signalType, 120);
      if (signalType !== 'LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH'
        && !signalType.startsWith('DISCORD_ROUTE:')) {
        return { attempted: 0, sent: 0, removed: 0, failed: 0, error: 'SIGNAL_TYPE_NOT_ALLOWED' };
      }
      const now = this.now();
      this.state.sentEvents = Object.fromEntries(Object.entries(this.state.sentEvents)
        .filter(([, sentAt]) => now - finite(sentAt, 0) <= RETAIN_EVENT_MS));
      if (this.state.sentEvents[eventId]) {
        return { attempted: 0, sent: 0, removed: 0, failed: 0, deduped: true };
      }
      const entries = Object.entries(this.state.subscriptions);
      let sent = 0;
      let removed = 0;
      let failed = 0;
      await Promise.all(entries.map(async ([id, record]) => {
        try {
          await this.webPush.sendNotification(record.subscription, JSON.stringify(payload), {
            TTL: 5 * 60,
            urgency: 'high',
            timeout: 8_000,
          });
          sent += 1;
          record.lastSentAt = now;
          record.lastError = null;
          record.lastErrorAt = null;
        } catch (error) {
          const statusCode = finite(error?.statusCode);
          if (statusCode === 404 || statusCode === 410) {
            delete this.state.subscriptions[id];
            removed += 1;
            return;
          }
          failed += 1;
          record.lastError = cleanText(error?.message ?? 'WEB_PUSH_FAILED', 240);
          record.lastErrorAt = now;
        }
      }));
      this.state.sentEvents[eventId] = now;
      this.state.lastDelivery = {
        eventId,
        signalType,
        routeId: cleanText(payload.routeId, 100) || null,
        attempted: entries.length,
        sent,
        removed,
        failed,
        completedAt: now,
      };
      await this.#save();
      return { ...this.state.lastDelivery };
    });
  }
}
