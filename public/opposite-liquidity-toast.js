const VERSION = 'OPPOSITE_LIQUIDITY_SITEWIDE_TOAST_V2_NATIVE_PUSH_20261003';
const STORAGE_KEY = 'opposite-liquidity-toast:seen-event-ids:v1';
const SERVICE_WORKER_URL = '/opposite-liquidity-push-sw.js?v=20261003-1';
const FIRST_LOAD_RECENT_MS = 2 * 60_000;
const POLL_MS = 10_000;
const MAX_SEEN = 200;

const escape = value => String(value ?? '—').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const finite = value => value === null || value === undefined || value === ''
  ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const price = value => finite(value) == null ? '—' : finite(value).toLocaleString('en-US', {
  maximumSignificantDigits: 9,
});

function readSeen() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return null;
  }
}

function writeSeen(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids].slice(0, MAX_SEEN)));
  } catch {
    // Toast remains functional for this page even when storage is unavailable.
  }
}

function container() {
  let node = document.querySelector('#oppositeLiquidityToastStack');
  if (node) return node;
  node = document.createElement('section');
  node.id = 'oppositeLiquidityToastStack';
  node.className = 'opposite-liquidity-toast-stack';
  node.setAttribute('aria-live', 'polite');
  node.setAttribute('aria-label', 'Tín hiệu thanh khoản ngược chiều');
  document.body.append(node);
  return node;
}

function removeToast(node) {
  node.classList.add('is-leaving');
  setTimeout(() => node.remove(), 260);
}

function pushSupported() {
  return window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator;
}

function updatePushControls(message = '') {
  for (const button of document.querySelectorAll('[data-opposite-liquidity-push]')) {
    const permission = pushSupported() ? Notification.permission : 'unsupported';
    button.dataset.permission = permission;
    button.disabled = permission === 'granted' || permission === 'unsupported';
    button.textContent = message || (permission === 'granted' ? 'Push thanh khoản ngược: ON'
      : permission === 'denied' ? 'Push bị trình duyệt chặn'
        : permission === 'unsupported' ? 'Trình duyệt không hỗ trợ Push'
          : 'Bật Push thanh khoản ngược');
  }
}

async function pushRegistration() {
  if (!pushSupported()) return null;
  return navigator.serviceWorker.register(SERVICE_WORKER_URL, {
    scope: '/',
    updateViaCache: 'none',
  });
}

async function requestPushPermission() {
  if (!pushSupported()) {
    updatePushControls('Trình duyệt không hỗ trợ Push');
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') await pushRegistration();
    updatePushControls(permission === 'granted' ? 'Push thanh khoản ngược: ON'
      : permission === 'denied' ? 'Push bị trình duyệt chặn' : 'Chưa cấp quyền Push');
  } catch {
    updatePushControls('Không bật được Push');
  }
}

async function showPushNotification(event) {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try {
    const registration = await pushRegistration();
    if (!registration) return;
    const side = event.side === 'LONG' ? 'LONG' : 'SHORT';
    const ratio = finite(event.depth?.oppositeRatio);
    const execution = String(event.binanceExecution?.status ?? 'NO_BINANCE_CALLBACK').toUpperCase();
    await registration.showNotification(`${side === 'LONG' ? '🟢' : '🔴'} ${side} · ${event.symbol}`, {
      body: `${event.interval} · vùng ${price(event.zone?.low)} – ${price(event.zone?.high)} · depth ngược ${ratio == null ? '—' : ratio.toFixed(3)}x · Binance ${execution}`,
      tag: `LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH:${event.eventId}`,
      renotify: false,
      requireInteraction: false,
      data: {
        signalType: 'LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH',
        eventId: event.eventId,
        url: `/opposite-liquidity-manager?symbol=${encodeURIComponent(event.symbol ?? '')}`,
      },
    });
  } catch {
    // Native notification failure must not suppress the in-page toast.
  }
}

function showToast(event) {
  const side = event.side === 'LONG' ? 'LONG' : 'SHORT';
  const execution = event.binanceExecution ?? {};
  const status = String(execution.status ?? 'NO_BINANCE_CALLBACK').toUpperCase();
  const discord = event.discordDelivery?.sent === true ? 'Discord OK'
    : `Discord ${String(event.discordDelivery?.error ?? 'chưa gửi')}`;
  const node = document.createElement('article');
  node.className = `opposite-liquidity-toast ${side === 'LONG' ? 'is-long' : 'is-short'}`;
  node.dataset.eventId = event.eventId ?? '';
  node.innerHTML = `<button class="opposite-liquidity-toast-close" type="button" aria-label="Đóng">×</button>
    <p class="opposite-liquidity-toast-kicker">THANH KHOẢN NGƯỢC · ${escape(event.interval)}</p>
    <h2>${side === 'LONG' ? '🟢' : '🔴'} ${escape(side)} · ${escape(event.symbol)}</h2>
    <p>Giá đã ${event.direction === 'ABOVE' ? 'vượt vùng trên' : 'xuyên vùng dưới'} <b>${price(event.zone?.low)} – ${price(event.zone?.high)}</b>.</p>
    <p>Depth ngược <b>${escape(event.depth?.oppositeSide)} · ${finite(event.depth?.oppositeRatio)?.toFixed(3) ?? '—'}x</b></p>
    <p class="opposite-liquidity-toast-meta">Binance: ${escape(status)} · ${escape(discord)}</p>
    <div class="opposite-liquidity-toast-links"><a href="/opposite-liquidity-manager">Mở quản lý</a><a href="/coin-level-analysis?symbol=${encodeURIComponent(event.symbol ?? '')}">Coin Level</a></div>`;
  node.querySelector('.opposite-liquidity-toast-close')?.addEventListener('click', () => removeToast(node));
  container().prepend(node);
  setTimeout(() => removeToast(node), 15_000);
}

function handleNotifications(items) {
  const notifications = (Array.isArray(items) ? items : [])
    .filter(event => event?.eventId && finite(event?.notifiedAt) != null)
    .sort((left, right) => finite(left.notifiedAt) - finite(right.notifiedAt));
  const stored = readSeen();
  const seen = stored ?? new Set();
  const now = Date.now();
  const unseen = notifications.filter(event => !seen.has(event.eventId)
    && (stored != null || now - finite(event.notifiedAt) <= FIRST_LOAD_RECENT_MS));
  const merged = new Set([
    ...notifications.map(event => event.eventId),
    ...seen,
  ]);
  writeSeen(merged);
  const display = unseen.slice(-4);
  for (const event of unseen) void showPushNotification(event);
  for (const event of display) showToast(event);
  if (unseen.length > display.length) {
    const node = document.createElement('article');
    node.className = 'opposite-liquidity-toast is-summary';
    node.innerHTML = `<button class="opposite-liquidity-toast-close" type="button" aria-label="Đóng">×</button><p class="opposite-liquidity-toast-kicker">THANH KHOẢN NGƯỢC</p><h2>+${unseen.length - display.length} tín hiệu mới khác</h2><div class="opposite-liquidity-toast-links"><a href="/opposite-liquidity-manager">Xem tất cả</a></div>`;
    node.querySelector('button')?.addEventListener('click', () => removeToast(node));
    container().prepend(node);
    setTimeout(() => removeToast(node), 15_000);
  }
}

async function poll() {
  try {
    const response = await fetch('/api/opposite-liquidity-manager', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return;
    const payload = await response.json();
    if (payload?.version !== 'OPPOSITE_LIQUIDITY_MANAGER_V1_READ_ONLY_20261003') return;
    handleNotifications(payload.scanner?.browserNotifications);
  } catch {
    // A transient manager/API failure must never interrupt the host dashboard.
  }
}

if (!globalThis.__oppositeLiquidityToastLoaded) {
  globalThis.__oppositeLiquidityToastLoaded = VERSION;
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-opposite-liquidity-push]')) void requestPushPermission();
  });
  updatePushControls();
  if (pushSupported() && Notification.permission === 'granted') void pushRegistration();
  void poll();
  setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void poll(); });
}
