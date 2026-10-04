const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '—').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const time = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'chưa có';
const number = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('vi-VN') : '0';

let snapshot = null;
let controller = null;
const updating = new Set();

function routeVisible(route) {
  const needle = $('#search').value.trim().toLocaleUpperCase('vi');
  const category = $('#category').value;
  const state = $('#routeState').value;
  if (category && route.category !== category) return false;
  if (state === 'enabled' && !route.enabled) return false;
  if (state === 'disabled' && route.enabled) return false;
  return !needle || [route.label, route.category, ...(route.keys ?? [])]
    .join(' ').toLocaleUpperCase('vi').includes(needle);
}

function routeHtml(route) {
  const isUpdating = updating.has(route.id);
  return `<article class="route-card ${route.enabled ? 'is-enabled' : 'is-disabled'}">
    <div>
      <div class="route-meta"><span class="pill ${route.enabled ? 'good' : 'bad'}">${route.enabled ? 'PUSH ON' : 'PUSH OFF'}</span><span class="pill wait">${escape(route.category)}</span>${route.sharedWebhook ? '<span class="pill shared">WEBHOOK DÙNG CHUNG</span>' : ''}</div>
      <h3>${escape(route.label)}</h3>
      <p>${escape((route.keys ?? []).join(' · '))}</p>
      <small>Discord 2xx đã thấy: <b>${number(route.observedCount)}</b> · Push event: <b>${number(route.pushedCount)}</b> · thiết bị nhận: <b>${number(route.deliveredCount)}</b><br>Thấy gần nhất ${time(route.lastObservedAt)} · Push gần nhất ${time(route.lastPushedAt)} · endpoint #${escape(route.endpointHash)}</small>
    </div>
    <button class="route-toggle ${route.enabled ? 'on' : 'off'}" data-route-id="${escape(route.id)}" data-next-enabled="${String(!route.enabled)}" ${isUpdating ? 'disabled' : ''}>${isUpdating ? 'Đang lưu…' : route.enabled ? 'Đang bật · bấm tắt' : 'Đang tắt · bấm bật'}</button>
  </article>`;
}

function render() {
  if (!snapshot) return;
  const routes = snapshot.routes ?? [];
  const visible = routes.filter(routeVisible);
  $('#configuredRoutes').textContent = number(snapshot.configuredRoutes);
  $('#enabledRoutes').textContent = number(snapshot.enabledRoutes);
  $('#subscriptions').textContent = number(snapshot.webPush?.subscriptionCount);
  $('#observed').textContent = number(routes.reduce((sum, route) => sum + Number(route.observedCount || 0), 0));
  $('#status').textContent = `Web Push ${snapshot.webPush?.configured ? 'READY' : 'CHƯA CẤU HÌNH'} · ${snapshot.webPush?.subscriptionCount ?? 0} thiết bị · cập nhật ${time(snapshot.generatedAt)}`;
  const last = snapshot.webPush?.lastDelivery;
  $('#lastDelivery').textContent = last
    ? `Lần gửi gần nhất: ${time(last.completedAt)} · gửi ${last.sent ?? 0}/${last.attempted ?? 0} · lỗi ${last.failed ?? 0}`
    : 'Chưa có lần Web Push nào trong state hiện tại.';
  $('#routeCount').textContent = `${visible.length}/${routes.length} route phù hợp`;
  $('#routes').innerHTML = visible.map(routeHtml).join('') || '<p class="empty">Không có route phù hợp bộ lọc.</p>';

  const categories = [...new Set(routes.map(route => route.category))].sort((a, b) => a.localeCompare(b, 'vi'));
  const selected = $('#category').value;
  $('#category').innerHTML = '<option value="">Tất cả nhóm</option>'
    + categories.map(category => `<option value="${escape(category)}" ${category === selected ? 'selected' : ''}>${escape(category)}</option>`).join('');
}

async function load() {
  controller?.abort();
  controller = new AbortController();
  $('#refresh').disabled = true;
  document.body.classList.add('loading');
  try {
    const response = await fetch('/api/discord-push-manager', {
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    snapshot = await response.json();
    render();
  } catch (error) {
    if (error.name !== 'AbortError') $('#status').textContent = `Không tải được quản lý Push: ${error.message}`;
  } finally {
    $('#refresh').disabled = false;
    document.body.classList.remove('loading');
  }
}

async function updateRoute(routeId, enabled) {
  if (updating.has(routeId)) return;
  updating.add(routeId);
  render();
  try {
    const response = await fetch('/api/discord-push-manager/routes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ routeId, enabled }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    snapshot = { ...snapshot, ...result.snapshot, webPush: snapshot.webPush };
  } catch (error) {
    $('#status').textContent = `Không lưu được route Push: ${error.message}`;
  } finally {
    updating.delete(routeId);
    render();
  }
}

$('#routes').addEventListener('click', event => {
  const button = event.target.closest('[data-route-id]');
  if (!button) return;
  updateRoute(button.dataset.routeId, button.dataset.nextEnabled === 'true');
});
$('#refresh').addEventListener('click', load);
for (const id of ['search', 'category', 'routeState']) {
  $(`#${id}`).addEventListener(id === 'search' ? 'input' : 'change', render);
}
await load();
setInterval(() => { if (!document.hidden && updating.size === 0) load(); }, 30_000);
