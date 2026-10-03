import {
  BTC_RELATIVE_STRENGTH_UI_VERSION,
  BTC_RELATIVE_TABS,
  buildBtcRelativeStrengthRows,
} from './btc-relative-strength-model.js?v=20260929-v5';

const $ = (selector) => document.querySelector(selector);
let snapshot = null;
let btcHealth = null;
let activeTab = 'STRONG_WHILE_BTC_DOWN';
let userSelectedTab = false;
let loading = false;

function number(value, digits = 2) {
  if (value == null || value === '') return '—';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-US', { maximumFractionDigits:digits }) : '—';
}

function price(value) {
  if (value == null || value === '') return '—';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  const digits = parsed >= 100 ? 2 : parsed >= 1 ? 4 : parsed >= .1 ? 5 : parsed >= .01 ? 6 : 8;
  return parsed.toLocaleString('en-US', { maximumFractionDigits:digits });
}

function signedPct(value) {
  if (value == null || value === '') return '—';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed > 0 ? '+' : ''}${parsed.toFixed(2)}%` : '—';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;',
  })[character]);
}

function countdown(milliseconds) {
  const seconds = Math.max(0, Math.floor(Number(milliseconds) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function model(tab, overrides = {}) {
  return buildBtcRelativeStrengthRows(snapshot, btcHealth, {
    tab, status:'ALL', sort:'priority', ...overrides,
  });
}

function render() {
  if (!snapshot || !btcHealth) return;
  const strong = model('STRONG_WHILE_BTC_DOWN');
  const weak = model('WEAK_WHILE_BTC_UP');
  if (!userSelectedTab) {
    if (strong.btc.pullback5m?.active === true
      && ['DOWN_STRONG','DOWN_LEAN'].includes(strong.btc.key)) activeTab = 'WEAK_WHILE_BTC_UP';
    else if (['UP_STRONG','UP_LEAN'].includes(strong.btc.key)) activeTab = 'WEAK_WHILE_BTC_UP';
    else if (strong.btc.key === 'DOWN_STRONG') activeTab = 'STRONG_WHILE_BTC_DOWN';
  }
  const all = model(activeTab);
  const filtered = model(activeTab, { status:$('#status-filter').value, sort:$('#sort').value });
  const { btc, definition } = filtered;
  const strongReady = strong.rows.filter((row) => row.relative.key !== 'DATA_WARMUP');
  const weakReady = weak.rows.filter((row) => row.relative.key !== 'DATA_WARMUP');
  const evaluated = all.rows.filter((row) => row.relative.key !== 'DATA_WARMUP');
  const contextClass = btc.key.startsWith('DOWN') ? 'down' : btc.key.startsWith('UP') ? 'up' : 'mixed';
  $('#btc-context').className = `btc-context panel ${contextClass}`;
  $('#btc-context-title').textContent = `${btc.label} · BTC ${price(btc.price)}`;
  const pullbackText = btc.pullback5m?.active
    ? ` · BTC 5m đang hồi ${signedPct(btc.pullback5m.movePct)} sau nhịp ${signedPct(btc.pullback5m.priorMovePct)}` : '';
  $('#btc-context-reason').textContent = `1h ${btc.direction1h || '—'} · 4h ${btc.direction4h || '—'} · EMA1h ${btc.emaTrend1h || '—'} · 6h ${signedPct(btc.pct6h)}${pullbackText}. Trang này không dùng allowLongEntry/allowShortEntry làm gate.`;
  $('#btc-context-badge').textContent = btc.key;
  $('#strong-count').textContent = `${strongReady.length} đạt · ${strong.rows.length - strongReady.length} nạp`;
  $('#weak-count').textContent = `${weakReady.length} đạt · ${weak.rows.length - weakReady.length} nạp`;
  $('#candidate-count').textContent = evaluated.length.toLocaleString('vi-VN');
  $('#context-count').textContent = all.rows.filter((row) => row.relative.contextActive).length.toLocaleString('vi-VN');
  $('#near-count').textContent = all.rows.filter((row) => row.relative.nearEntry).length.toLocaleString('vi-VN');
  $('#ready-count').textContent = all.rows.filter((row) => row.relative.key === 'RELATIVE_ENTRY_READY').length.toLocaleString('vi-VN');
  $('#list-title').textContent = definition.title;
  for (const button of document.querySelectorAll('.relative-tab')) {
    const selected = button.dataset.tab === activeTab;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  }
  $('#rows').innerHTML = filtered.rows.length ? filtered.rows.map((row) => {
    const sourceTime = new Date(row.confirmationAt).toLocaleString('vi-VN', { timeZone:'Asia/Ho_Chi_Minh', hour12:false });
    const rowClass = row.relative.key.toLowerCase().replaceAll('_','-');
    const route = snapshot.btcRelativeStrengthBinanceExecution?.routes?.[row.side];
    const readyRouteBadge = row.relative.key === 'RELATIVE_ENTRY_READY'
      ? `<span class="binance-route ${route?.enabled ? 'on' : 'off'}">BINANCE 2 USDT ${route?.enabled ? 'ON' : 'OFF'}</span>` : '';
    return `<tr class="${rowClass}">
      <td><a class="coin" href="/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}">${escapeHtml(row.symbol)}</a><span class="side ${row.side.toLowerCase()}">${row.side}</span><span class="sub">Nguồn ${escapeHtml(sourceTime)}</span></td>
      <td><span class="state">${escapeHtml(row.relative.label)}</span>${readyRouteBadge}<span class="sub">${escapeHtml(row.relative.detail)}</span></td>
      <td><span class="relative-score">${number(row.relativeScore, 1)}</span><span class="sub">Điểm xếp hạng, không phải xác suất · Trend ${number(row.currentTrendScore, 0)} · volume gốc ${number(row.originVolumeRatio, 2)}x</span></td>
      <td><b>${escapeHtml(row.currentFrames?.['15m'] ?? '—')} 15m · ${escapeHtml(row.currentFrames?.['1h'] ?? '—')} 1h · ${escapeHtml(row.currentFrames?.['4h'] ?? '—')} 4h</b><span class="sub btc-opposite">${row.side === 'LONG' ? `BTC ${escapeHtml(btc.key)} · alpha coin−BTC ${signedPct(row.relative.alpha15mPct)}/15m · ${signedPct(row.relative.alpha1hPct)}/1h` : row.relative.contextMode === 'BTC_DOWNTREND_PULLBACK_SHORT' ? `BTC HỒI 5M ${signedPct(btc.pullback5m?.movePct)} · coin ${signedPct(row.last5mMovePct)} · yếu hơn ${signedPct(row.relative.relativeMovePct)}` : `BTC ${escapeHtml(btc.key)} · coin giữ độ yếu`}</span></td>
      <td>${row.relative.key === 'DATA_WARMUP' ? '<span class="entry">—</span><span class="sub">Chưa cấp vùng động mới</span>' : `<span class="entry">${price(row.entryZone?.low)} – ${price(row.entryZone?.high)}</span><span class="sub">${escapeHtml(row.entryZone?.basis ?? '—')} · vô hiệu ${price(row.invalidationPrice)}</span>`}</td>
      <td>${price(row.livePrice)}<span class="sub">${escapeHtml(row.livePriceSource ?? 'CLOSED_5M')} · đi thuận ${signedPct(row.directionalDistancePct)}</span></td>
      <td><b>15m ${number(row.currentVolumeRatio15m, 2)}x</b><span class="sub">5m ${number(row.currentVolumeRatio5m, 2)}x · nến ${signedPct(row.last5mMovePct)} · taker mua ${number(row.lastTakerBuyPct, 1)}% · ${row.coinTrigger ? '5m ĐÃ XÁC NHẬN' : '5m CHƯA XÁC NHẬN'}</span></td>
      <td><b>${countdown(row.setupRemainingMs)}</b><span class="sub">pool tối đa 24 giờ</span></td>
      <td><span class="links"><a href="/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}">Setup</a><a href="https://www.binance.com/en/futures/${encodeURIComponent(row.symbol)}" target="_blank" rel="noreferrer">Binance</a></span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="9">Chưa có coin giữ đủ cấu trúc 1h + 4h cho tab và bộ lọc này.</td></tr>';
  const loadingCount = all.rows.filter((row) => row.relative.key === 'DATA_WARMUP').length;
  const discordStatus = snapshot.btcRelativeStrengthDiscordConfigured ? 'Discord ON' : 'Discord OFF';
  const execution = snapshot.btcRelativeStrengthBinanceExecution;
  const longRoute = execution?.routes?.LONG?.enabled ? 'LONG ON' : 'LONG OFF';
  const shortRoute = execution?.routes?.SHORT?.enabled ? 'SHORT ON' : 'SHORT OFF';
  const binanceStatus = execution?.masterEnabled ? `Binance ${longRoute} / ${shortRoute}` : 'Binance MASTER OFF';
  $('#status').textContent = `${filtered.rows.length}/${all.rows.length} dòng · ${evaluated.length} coin đã phân loại · ${loadingCount} đang nạp nến · ${definition.title} · ${discordStatus} · ${binanceStatus} · nguồn ${new Date(snapshot.generatedAt).toLocaleTimeString('vi-VN', { hour12:false })} · ${BTC_RELATIVE_STRENGTH_UI_VERSION}`;
  $('#status').className = 'status panel';
}

async function load() {
  if (loading) return;
  loading = true;
  $('#refresh').disabled = true;
  try {
    const [entryResponse, btcResponse] = await Promise.all([
      fetch(`/api/coin-level-entry-watch?t=${Date.now()}`, { cache:'no-store' }),
      fetch(`/api/btc-health?t=${Date.now()}`, { cache:'no-store' }),
    ]);
    const [entryData, btcData] = await Promise.all([entryResponse.json(), btcResponse.json()]);
    if (!entryResponse.ok) throw new Error(entryData.error || `Entry HTTP ${entryResponse.status}`);
    if (!btcResponse.ok) throw new Error(btcData.error || `BTC HTTP ${btcResponse.status}`);
    snapshot = entryData;
    btcHealth = btcData;
    render();
  } catch (error) {
    $('#status').textContent = `Không tải được sức mạnh tương đối: ${error.message}`;
    $('#status').className = 'status panel error';
  } finally {
    loading = false;
    $('#refresh').disabled = false;
  }
}

for (const button of document.querySelectorAll('.relative-tab')) button.addEventListener('click', () => {
  activeTab = button.dataset.tab;
  userSelectedTab = true;
  render();
});
for (const id of ['#status-filter','#sort']) $(id).addEventListener('change', render);
$('#refresh').addEventListener('click', load);
load();
setInterval(load, 10_000);
setInterval(render, 1_000);
