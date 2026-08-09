import {
  binanceCardAvgRoeAttrs,
  isBinanceCardAvgRoeEligible,
} from './binance-card-visibility.js';

const controllers = new Set();
let sharedConfig = null;
let sharedLoadPromise = null;
let mutationObserver = null;

async function whitelistApi(options = {}) {
  const response = await fetch('/api/live-card-whitelist', {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Server trả về ${response.headers.get('content-type') ?? 'nội dung không phải JSON'} (HTTP ${response.status}). Hãy reload trang rồi thử lại.`);
  }
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

export function liveCardKey(page, group, value) {
  const normalizedPage = String(page ?? '').trim().toLowerCase();
  const normalizedGroup = String(group ?? '').trim().toLowerCase();
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedPage || !normalizedGroup || !normalizedValue) return '';
  return `${normalizedPage}:${normalizedGroup}:${encodeURIComponent(normalizedValue)}`;
}

export function liveCardAttrs(page, group, value, avgRoe) {
  const key = liveCardKey(page, group, value);
  return key
    ? `data-live-card-key="${key.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" ${binanceCardAvgRoeAttrs(avgRoe)}`
    : binanceCardAvgRoeAttrs(avgRoe);
}

function pageEnabledKeys(page) {
  const prefix = `${page}:`;
  return new Set((sharedConfig?.enabledKeys ?? []).filter((key) => key.startsWith(prefix)));
}

function renderStatus(controller) {
  const status = controller.status;
  if (!status) return;
  const enabled = pageEnabledKeys(controller.page).size;
  const className = 'liquid-live-card-status';
  const state = sharedConfig ? 'WHITELIST ĐÃ LƯU' : 'ĐANG TẢI';
  const html = `<strong>${controller.label} · ${state}</strong><span>${enabled} card trong whitelist · chưa cấp lệnh thật tại đây · vào trang Orders để bật riêng checkbox LỆNH THẬT.</span>`;
  if (status.className !== className) status.className = className;
  if (status.innerHTML !== html) status.innerHTML = html;
}

function decorateController(controller) {
  const enabledKeys = pageEnabledKeys(controller.page);
  controller.root.querySelectorAll(`[data-live-card-key^="${controller.page}:"]`).forEach((card) => {
    const key = String(card.dataset.liveCardKey ?? '');
    const avgRoe = Number(card.dataset.binanceCardAvgRoe);
    let toggle = card.querySelector(':scope > .live-card-toggle');
    if (!isBinanceCardAvgRoeEligible(avgRoe)) {
      toggle?.remove();
      card.classList.remove('live-card-enabled');
      return;
    }
    const checked = enabledKeys.has(key);
    card.classList.toggle('live-card-enabled', checked);
    if (!toggle) {
      toggle = document.createElement('label');
      toggle.className = 'live-card-toggle';
      toggle.title = 'Lưu card vào whitelist quan sát. Thao tác này chưa cho phép đặt lệnh thật.';
      toggle.innerHTML = '<input type="checkbox" data-live-card-toggle><span>WHITELIST</span>';
      card.appendChild(toggle);
    }
    const input = toggle.querySelector('input');
    input.checked = checked;
    input.dataset.key = key;
    input.dataset.page = controller.page;
  });
  renderStatus(controller);
}

function decorateAll() {
  controllers.forEach(decorateController);
}

function ensureMutationObserver() {
  if (mutationObserver || typeof MutationObserver !== 'function') return;
  let scheduled = false;
  mutationObserver = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorateAll();
    });
  });
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
}

async function loadSharedConfig({ force = false } = {}) {
  if (sharedConfig && !force) return sharedConfig;
  if (sharedLoadPromise && !force) return sharedLoadPromise;
  sharedLoadPromise = whitelistApi()
    .then((data) => {
      sharedConfig = data;
      decorateAll();
      return data;
    })
    .finally(() => { sharedLoadPromise = null; });
  return sharedLoadPromise;
}

async function updateToggle(input) {
  const key = String(input.dataset.key ?? '');
  const page = String(input.dataset.page ?? '');
  const enabled = input.checked;
  if (!key || !page) return;
  if (enabled) {
    const confirmed = confirm(`Thêm card này vào whitelist?\n\n${key}\n\nThao tác này chỉ lưu danh sách, CHƯA đánh lệnh thật. Muốn cho phép Binance phải bật checkbox LỆNH THẬT riêng tại trang Orders.`);
    if (!confirmed) {
      input.checked = false;
      return;
    }
  }
  input.disabled = true;
  try {
    sharedConfig = await whitelistApi({
      method: 'POST',
      body: JSON.stringify({ key, enabled }),
    });
    decorateAll();
  } catch (error) {
    input.checked = !enabled;
    alert(`Không lưu được whitelist: ${error.message}`);
  } finally {
    input.disabled = false;
  }
}

document.addEventListener('change', (event) => {
  const input = event.target.closest?.('[data-live-card-toggle]');
  if (input) updateToggle(input);
});

export function installLiveCardWhitelistUi({
  page,
  label,
  root = document,
  mountBefore = null,
} = {}) {
  const normalizedPage = String(page ?? '').trim().toLowerCase();
  if (!normalizedPage) throw new Error('page is required');
  let status = root.querySelector?.(`[data-live-card-status="${normalizedPage}"]`) ?? null;
  if (!status && mountBefore?.parentElement) {
    status = document.createElement('div');
    status.dataset.liveCardStatus = normalizedPage;
    status.className = 'liquid-live-card-status is-blocked';
    mountBefore.parentElement.insertBefore(status, mountBefore);
  }
  const controller = {
    page: normalizedPage,
    label: String(label ?? normalizedPage).toUpperCase(),
    root,
    status,
    decorate: () => decorateController(controller),
    reload: () => loadSharedConfig({ force: true }),
  };
  controllers.add(controller);
  ensureMutationObserver();
  loadSharedConfig().catch((error) => {
    if (status) status.innerHTML = `<strong>WHITELIST · LỖI</strong><span>${String(error.message)}</span>`;
  });
  return controller;
}
