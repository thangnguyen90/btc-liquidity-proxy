import {
  TOXIC_TWO_SIDE_TIERS,
  TOXIC_TWO_SIDE_UI_VERSION,
  filterToxicTwoSideRows,
  sortToxicTwoSideRows,
} from './toxic-two-side-model.js';
import { installLiveCardWhitelistUi } from './live-card-whitelist-ui.js';

const $ = (selector) => document.querySelector(selector);
let snapshot = null;
let loading = false;

installLiveCardWhitelistUi({
  page: 'toxic-two-side',
  label: 'Quét hai đầu · quan sát',
  root: $('#summary-cards'),
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;',
  })[character]);
}

function compact(value, suffix = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${Intl.NumberFormat('en-US', { notation:'compact', maximumFractionDigits:2 }).format(number)}${suffix}`;
}

function percent(value, digits = 2, signed = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${signed && number > 0 ? '+' : ''}${number.toFixed(digits)}%`;
}

function price(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (number >= 100) return number.toLocaleString('en-US', { maximumFractionDigits:3 });
  if (number >= 1) return number.toFixed(4);
  return number.toPrecision(6);
}

function frameHtml(interval, state) {
  const normalized = String(state ?? 'NO_DATA').toLowerCase();
  return `<span class="frame ${normalized}">${interval} ${escapeHtml(state ?? 'NO_DATA')}</span>`;
}

function render() {
  if (!snapshot) return;
  $('#extreme-count').textContent = snapshot.counts?.EXTREME ?? 0;
  $('#high-count').textContent = snapshot.counts?.HIGH ?? 0;
  $('#watch-count').textContent = snapshot.counts?.WATCH ?? 0;
  $('#normal-count').textContent = snapshot.counts?.NORMAL ?? 0;
  $('#complete-count').textContent = snapshot.complete ?? 0;
  $('#universe-count').textContent = `${snapshot.universe ?? 0} hợp đồng`;
  const rows = sortToxicTwoSideRows(filterToxicTwoSideRows(snapshot.rows, {
    minimumScore: Number($('#minimum-score').value),
    minimumQuoteVolume: Number($('#minimum-volume').value),
    tier: $('#tier').value,
    query: $('#query').value,
  }), $('#sort').value);
  $('#row-count').textContent = `${rows.length} coin`;
  $('#rows').innerHTML = rows.length ? rows.map((row, index) => {
    const tier = String(row.tier ?? 'NORMAL').toLowerCase();
    const changeClass = Number(row.change24hPct) >= 0 ? 'positive' : 'negative';
    const dataText = `${row.dataQuality?.checks ?? 0}/${row.dataQuality?.total ?? 5} dữ liệu`;
    return `<tr class="${tier}">
      <td>${index + 1}</td>
      <td><a class="coin" href="/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}">${escapeHtml(row.symbol)}</a><span class="coin-name">${dataText}</span></td>
      <td><span class="score">${row.score}</span><span class="cell-sub"><span class="badge">${escapeHtml(TOXIC_TWO_SIDE_TIERS[row.tier] ?? row.tier)}</span></span></td>
      <td>${price(row.markPrice)}<span class="cell-sub ${changeClass}">${percent(row.change24hPct,2,true)}</span></td>
      <td><strong>${percent(row.range24hPct)}</strong></td>
      <td>${percent(row.atr1hPct)} / ${percent(row.atr4hPct)}</td>
      <td>${percent(row.binanceTurnoverPct)}<span class="cell-sub">Vol ${compact(row.quoteVolume24h,' USDT')} · cap ${compact(row.marketCapUsd,' USD')}</span></td>
      <td class="${Number(row.fundingRatePct) >= 0 ? 'positive' : 'negative'}">${percent(row.fundingRatePct,4,true)}${row.fundingDivergence ? '<span class="cell-sub negative">NGƯỢC GIÁ</span>' : ''}</td>
      <td>${Object.entries(row.trend ?? {}).map(([interval,state]) => frameHtml(interval,state)).join('')}</td>
      <td>${row.sweeps?.total ?? 0}<span class="cell-sub">trên ${row.sweeps?.upper ?? 0} · dưới ${row.sweeps?.lower ?? 0}${row.sweeps?.twoSided ? ' · HAI ĐẦU' : ''}</span></td>
      <td>${(row.reasons ?? []).map((reason) => `<span class="reason">• ${escapeHtml(reason)}</span>`).join('') || 'Chưa đạt thành phần điểm nào'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="11">Không có coin đạt bộ lọc hiện tại.</td></tr>';
  const generated = new Date(snapshot.generatedAt).toLocaleString('vi-VN');
  $('#status').textContent = `${rows.length} coin đang hiển thị · ${snapshot.scored}/${snapshot.universe} có đủ dữ liệu tối thiểu · snapshot ${generated} · ${TOXIC_TWO_SIDE_UI_VERSION}`;
  $('#status').className = 'status panel';
}

async function load() {
  if (loading) return;
  loading = true;
  $('#refresh').disabled = true;
  $('#status').textContent = 'Đang ghép ticker, funding, cap và nến cache; không gọi order book/CoinGlass…';
  try {
    const response = await fetch(`/api/toxic-two-side-market?t=${Date.now()}`, { cache:'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    snapshot = data;
    render();
  } catch (error) {
    $('#status').textContent = `Không tải được danh sách: ${error.message}`;
    $('#status').className = 'status panel error';
  } finally {
    loading = false;
    $('#refresh').disabled = false;
  }
}

for (const selector of ['#minimum-score','#minimum-volume','#tier','#sort']) $(selector).addEventListener('change', render);
$('#query').addEventListener('input', render);
$('#refresh').addEventListener('click', load);
load();
setInterval(load, 60_000);
