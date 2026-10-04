import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

export const DISCORD_PUSH_MANAGER_VERSION =
  'DISCORD_PUSH_MANAGER_V1_POST_SUCCESS_ROUTE_ALLOWLIST_20261004';

const OPPOSITE_ROUTE_KEY = 'LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_WEBHOOK_URL';
const DISCORD_WEBHOOK_KEY = /(?:^DISCORD_WEBHOOK_URL$|(?:DISCORD_)?WEBHOOK_URL$)/;

const cleanText = (value, max = 320) => String(value ?? '').trim().slice(0, max);
const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function canonicalDiscordWebhook(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'https:' || !['discord.com', 'discordapp.com'].includes(url.hostname.toLowerCase())) {
      return '';
    }
    if (!/^\/api\/webhooks\/[^/]+\/[^/]+\/?$/.test(url.pathname)) return '';
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return '';
  }
}

const hash = value => createHash('sha256').update(String(value)).digest('hex');

function humanizeKey(key) {
  const custom = {
    LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_WEBHOOK_URL: 'Thanh khoản ngược chiều',
    LOCAL_AI_TREND_DISCORD_WEBHOOK_URL: 'AI Local · đánh giá xu hướng',
    LOCAL_AI_SIGNAL_REVIEW_DISCORD_WEBHOOK_URL: 'AI Local · tín hiệu pass điểm vào',
    MARKET_BREADTH_SHOCK_DISCORD_WEBHOOK_URL: 'BTC / Market breadth shock',
    BTC_SESSION_WATCH_DISCORD_WEBHOOK_URL: 'BTC Session Watch',
    BTC_RELATIVE_STRENGTH_DISCORD_WEBHOOK_URL: 'BTC Relative Strength',
    BINANCE_FILLED_SIGNAL_AUDIT_WEBHOOK_URL: 'Binance · lệnh đã khớp',
    BINANCE_CLOSED_SIGNAL_AUDIT_WEBHOOK_URL: 'Binance · vị thế đã đóng',
    ORDER_FILL_WEBHOOK_URL: 'Binance · order fill',
  };
  if (custom[key]) return custom[key];
  return key
    .replace(/_DISCORD_WEBHOOK_URL$/, '')
    .replace(/_WEBHOOK_URL$/, '')
    .replaceAll('_', ' ')
    .toLocaleLowerCase('vi')
    .replace(/(^|\s)\S/g, letter => letter.toLocaleUpperCase('vi'));
}

function categoryForKeys(keys) {
  const joined = keys.join(' ');
  if (/LOCAL_AI/.test(joined)) return 'AI Local';
  if (/BTC_|MARKET_BREADTH|MEGA_PUMP/.test(joined)) return 'BTC / thị trường';
  if (/COIN_LEVEL|COIN_HORIZON/.test(joined)) return 'Coin Level';
  if (/LIQ_SCAN|LIQUID_|LIQ_FLOW|COINGLASS/.test(joined)) return 'Thanh khoản';
  if (/EMA|POST_|PUMP_|DUMP_|SHAKEOUT|SQUEEZE|SPIKE|BIG_CANDLE/.test(joined)) return 'Chiến lược';
  if (/BINANCE|ORDER_FILL|TSL/.test(joined)) return 'Binance / vận hành';
  return 'Khác';
}

function targetPathForKeys(keys) {
  const joined = keys.join(' ');
  if (joined.includes(OPPOSITE_ROUTE_KEY)) return '/opposite-liquidity-manager';
  if (/LOCAL_AI_SIGNAL_REVIEW/.test(joined)) return '/ai-signal-review';
  if (/BINANCE|ORDER_FILL|TSL/.test(joined)) return '/binance-signal-orders';
  if (/LOCAL_AI/.test(joined)) return '/local-ai-trend-evaluation';
  return '/push-signal-manager';
}

export function buildDiscordPushRouteCatalog(environment = {}) {
  const grouped = new Map();
  for (const [key, value] of Object.entries(environment)) {
    if (!DISCORD_WEBHOOK_KEY.test(key)) continue;
    const webhook = canonicalDiscordWebhook(value);
    if (!webhook) continue;
    if (!grouped.has(webhook)) grouped.set(webhook, []);
    grouped.get(webhook).push(key);
  }
  return [...grouped.entries()].map(([webhook, rawKeys]) => {
    const keys = [...new Set(rawKeys)].sort();
    const id = `discord-route-${hash(keys.join('|')).slice(0, 16)}`;
    return {
      id,
      webhook,
      endpointHash: hash(webhook).slice(0, 12),
      keys,
      label: keys.map(humanizeKey).join(' + '),
      category: categoryForKeys(keys),
      targetPath: targetPathForKeys(keys),
      defaultEnabled: keys.includes(OPPOSITE_ROUTE_KEY),
      sharedWebhook: keys.length > 1,
    };
  }).sort((left, right) => left.category.localeCompare(right.category, 'vi')
    || left.label.localeCompare(right.label, 'vi'));
}

function emptyState(now) {
  return {
    version: DISCORD_PUSH_MANAGER_VERSION,
    updatedAt: now,
    routeSettings: {},
    routeTelemetry: {},
  };
}

async function writeJsonAtomic(path, payload) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, path);
}

function stripDiscordMarkdown(value) {
  return String(value ?? '')
    .replace(/\[([^\]]+)]\((?:https?:\/\/[^)]+)\)/g, '$1')
    .replace(/[*_`~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstEmbed(discordPayload) {
  return Array.isArray(discordPayload?.embeds) && discordPayload.embeds[0]
    && typeof discordPayload.embeds[0] === 'object' ? discordPayload.embeds[0] : {};
}

export function buildDiscordRoutePushPayload({ route, discordPayload, now = Date.now() } = {}) {
  const embed = firstEmbed(discordPayload);
  const rawTitle = embed.title || discordPayload?.content || discordPayload?.username || route?.label || 'Tín hiệu Discord';
  const title = cleanText(stripDiscordMarkdown(rawTitle), 140) || 'Tín hiệu Discord';
  const fieldText = Array.isArray(embed.fields)
    ? embed.fields.slice(0, 2).map(field => `${field?.name ?? ''}: ${field?.value ?? ''}`).join(' · ')
    : '';
  const detail = stripDiscordMarkdown([embed.description, fieldText].filter(Boolean).join(' · '));
  const body = cleanText(`${route?.label ?? 'Discord'}${detail ? ` · ${detail}` : ''}`, 360);
  const upper = `${title} ${detail}`.toUpperCase();
  const side = /\bLONG\b/.test(upper) ? 'LONG' : /\bSHORT\b/.test(upper) ? 'SHORT' : '';
  const symbol = upper.match(/(?:^|\s|·|-)\b([A-Z0-9]{2,24}USDT)\b/)?.[1] ?? '';
  const contentHash = hash(JSON.stringify(discordPayload ?? {})).slice(0, 24);
  const bucket = Math.floor(now / (15 * 60_000));
  return {
    signalType: `DISCORD_ROUTE:${route.id}`,
    eventId: `${route.id}:${contentHash}:${bucket}`,
    title,
    body,
    url: route.targetPath || '/push-signal-manager',
    side,
    symbol,
    routeId: route.id,
    routeLabel: route.label,
    notifiedAt: now,
  };
}

function parseDiscordPayload(body) {
  if (typeof body !== 'string' || !body.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export class DiscordPushManager {
  constructor({ stateFile, routes = [], webPushService, now = () => Date.now() } = {}) {
    this.stateFile = stateFile;
    this.routes = routes;
    this.routeByWebhook = new Map(routes.map(route => [route.webhook, route]));
    this.routeById = new Map(routes.map(route => [route.id, route]));
    this.webPushService = webPushService;
    this.now = now;
    this.state = null;
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
          version: DISCORD_PUSH_MANAGER_VERSION,
          routeSettings: parsed?.routeSettings && typeof parsed.routeSettings === 'object'
            ? parsed.routeSettings : {},
          routeTelemetry: parsed?.routeTelemetry && typeof parsed.routeTelemetry === 'object'
            ? parsed.routeTelemetry : {},
        };
      } catch (error) {
        if (error?.code !== 'ENOENT') console.warn(`[DiscordPushManager] state reset: ${error.message}`);
        this.state = emptyState(now);
      }
      return this.snapshotSync();
    })();
    return this.initializing;
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
    this.state.version = DISCORD_PUSH_MANAGER_VERSION;
    this.state.updatedAt = this.now();
    await writeJsonAtomic(this.stateFile, this.state);
  }

  #enabled(route) {
    return typeof this.state?.routeSettings?.[route.id] === 'boolean'
      ? this.state.routeSettings[route.id] : route.defaultEnabled;
  }

  snapshotSync() {
    const routes = this.routes.map(route => {
      const telemetry = this.state?.routeTelemetry?.[route.id] ?? {};
      return {
        id: route.id,
        label: route.label,
        category: route.category,
        keys: route.keys,
        endpointHash: route.endpointHash,
        targetPath: route.targetPath,
        sharedWebhook: route.sharedWebhook,
        enabled: this.#enabled(route),
        defaultEnabled: route.defaultEnabled,
        observedCount: finite(telemetry.observedCount, 0),
        pushedCount: finite(telemetry.pushedCount, 0),
        deliveredCount: finite(telemetry.deliveredCount, 0),
        lastObservedAt: finite(telemetry.lastObservedAt),
        lastPushedAt: finite(telemetry.lastPushedAt),
        lastPushResult: telemetry.lastPushResult ?? null,
      };
    });
    return {
      version: DISCORD_PUSH_MANAGER_VERSION,
      generatedAt: this.now(),
      updatedAt: this.state?.updatedAt ?? null,
      configuredRoutes: routes.length,
      enabledRoutes: routes.filter(route => route.enabled).length,
      routes,
    };
  }

  async snapshot() {
    await this.initialize();
    const webPush = await this.webPushService.publicConfig();
    return {
      ...this.snapshotSync(),
      webPush: {
        configured: webPush.configured,
        subscriptionCount: webPush.subscriptionCount,
        maxSubscriptions: webPush.maxSubscriptions,
        lastDelivery: webPush.lastDelivery,
      },
    };
  }

  updateRoute(routeId, enabled) {
    return this.#run(async () => {
      const route = this.routeById.get(cleanText(routeId, 100));
      if (!route) throw new Error('DISCORD_PUSH_ROUTE_NOT_FOUND');
      if (typeof enabled !== 'boolean') throw new Error('DISCORD_PUSH_ENABLED_BOOLEAN_REQUIRED');
      this.state.routeSettings[route.id] = enabled;
      await this.#save();
      return { routeId: route.id, enabled, snapshot: this.snapshotSync() };
    });
  }

  observeSuccessfulDiscordPost({ url, body } = {}) {
    const webhook = canonicalDiscordWebhook(url);
    const route = webhook ? this.routeByWebhook.get(webhook) : null;
    const discordPayload = parseDiscordPayload(body);
    if (!route || !discordPayload) return Promise.resolve({ matched: false });
    return this.#run(async () => {
      const now = this.now();
      const telemetry = this.state.routeTelemetry[route.id] ?? {
        observedCount: 0,
        pushedCount: 0,
        deliveredCount: 0,
        lastObservedAt: null,
        lastPushedAt: null,
        lastPushResult: null,
      };
      telemetry.observedCount += 1;
      telemetry.lastObservedAt = now;
      this.state.routeTelemetry[route.id] = telemetry;
      if (!this.#enabled(route)) {
        await this.#save();
        return { matched: true, enabled: false, routeId: route.id };
      }
      const payload = buildDiscordRoutePushPayload({ route, discordPayload, now });
      const delivery = await this.webPushService.sendPayload(payload);
      telemetry.pushedCount += delivery.deduped ? 0 : 1;
      telemetry.deliveredCount += finite(delivery.sent, 0);
      telemetry.lastPushedAt = delivery.deduped ? telemetry.lastPushedAt : now;
      telemetry.lastPushResult = delivery;
      await this.#save();
      return { matched: true, enabled: true, routeId: route.id, delivery };
    });
  }

  wrapFetch(fetchImpl) {
    if (typeof fetchImpl !== 'function') throw new Error('FETCH_IMPL_REQUIRED');
    return async (input, init) => {
      const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
      const body = init?.body;
      const response = await fetchImpl(input, init);
      if (method === 'POST' && response?.ok && canonicalDiscordWebhook(url) && typeof body === 'string') {
        queueMicrotask(() => this.observeSuccessfulDiscordPost({ url, body })
          .catch(error => console.warn(`[DiscordPushManager] delivery bridge failed: ${error.message}`)));
      }
      return response;
    };
  }
}
