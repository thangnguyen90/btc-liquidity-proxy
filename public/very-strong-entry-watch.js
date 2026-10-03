import {
  VERY_STRONG_ENTRY_WATCH_UI_VERSION,
  buildVeryStrongEntryRows,
} from './very-strong-entry-watch-model.js';

const $ = (selector) => document.querySelector(selector);
let snapshot = null;
let btcHealth = null;
let loading = false;

function number(value, digits = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
}

function price(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  const digits = parsed >= 100 ? 2 : parsed >= 1 ? 4 : parsed >= .1 ? 5 : parsed >= .01 ? 6 : 8;
  return parsed.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function signedPct(value) {
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
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function targetHtml(targetPlan) {
  const targets = targetPlan?.targets ?? [];
  return targets.length ? targets.map((target) => `<span><b>${escapeHtml(target.label)}</b> ${price(target.price)} · ${signedPct(target.movePct)}</span>`).join('<br>') : '—';
}

function render() {
  if (!snapshot || !btcHealth) return;
  const options = { side: $('#side').value, status: $('#context-filter').value, sort: $('#sort').value };
  const all = buildVeryStrongEntryRows(snapshot, btcHealth, { side: 'ALL', status: 'ALL' });
  const filtered = buildVeryStrongEntryRows(snapshot, btcHealth, options);
  const { btc } = filtered;
  const contextClass = btc.key === 'DOWN_STRONG' ? 'down' : btc.key === 'UP_STRONG' ? 'up' : 'mixed';
  $('#btc-context').className = `btc-context panel ${contextClass}`;
  $('#btc-context-title').textContent = `${btc.label} · BTC ${price(btc.price)}`;
  $('#btc-context-reason').textContent = `1h ${btc.direction1h || '—'} · 4h ${btc.direction4h || '—'} · EMA1h ${btc.emaTrend1h || '—'} · 6h ${signedPct(btc.pct6h)} · Market ${btc.marketState}. ${btc.marketReason}`;
  $('#btc-context-badge').textContent = btc.key;
  $('#active-count').textContent = all.rows.filter((row) => row.active === true).length.toLocaleString('vi-VN');
  $('#context-count').textContent = all.rows.filter((row) => row.context.btcAligned).length.toLocaleString('vi-VN');
  $('#waiting-count').textContent = all.rows.filter((row) => ['WAIT_BTC', 'WAIT_BTC_TURN'].includes(row.context.key)).length.toLocaleString('vi-VN');
  $('#ready-count').textContent = all.rows.filter((row) => row.context.key === 'READY_BTC_WAVE').length.toLocaleString('vi-VN');
  $('#rows').innerHTML = filtered.rows.length ? filtered.rows.map((row) => {
    if (row.trendPool) {
      const time = new Date(row.confirmationAt).toLocaleString('vi-VN', { timeZone:'Asia/Ho_Chi_Minh', hour12:false });
      const distance = Number(row.entryDistancePct);
      const distanceText = Number.isFinite(distance) ? signedPct(distance) : '—';
      return `<tr class="${row.context.key.toLowerCase().replaceAll('_','-')}">
        <td><a class="coin" href="/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}">${escapeHtml(row.symbol)}</a><span class="side ${row.side.toLowerCase()}">${row.side}</span><span class="sub">Nguồn ${escapeHtml(time)}</span></td>
        <td><span class="state">${escapeHtml(row.context.label)}</span><span class="sub">${escapeHtml(row.context.detail)}</span></td>
        <td><span class="score">Trend ${number(row.score, 2)}</span><span class="sub">Volume gốc ${number(row.originVolumeRatio, 2)}x · Entry Score ${number(row.entryScore, 1)}</span></td>
        <td><b>${escapeHtml(row.currentFrames?.['1h'] ?? '—')} 1h · ${escapeHtml(row.currentFrames?.['4h'] ?? '—')} 4h</b><span class="sub">${escapeHtml(row.trendReason)}</span></td>
        <td><span class="entry">${price(row.entryZone?.low)} – ${price(row.entryZone?.high)}</span><span class="sub">${escapeHtml(row.entryZone?.basis ?? '—')} · vô hiệu ${price(row.invalidationPrice)}</span></td>
        <td>${price(row.livePrice)}<span class="sub">${escapeHtml(row.livePriceSource ?? 'CLOSED_5M')} · lệch ${distanceText}</span></td>
        <td><b>15m ${number(row.currentVolumeRatio15m, 2)}x</b><span class="sub">5m ${number(row.currentVolumeRatio5m, 2)}x · taker mua ${number(row.lastTakerBuyPct, 1)}% · ${row.coinTrigger ? 'ĐÃ XÁC NHẬN' : 'CHƯA XÁC NHẬN'}</span></td>
        <td><b>${countdown(row.setupRemainingMs)}</b><span class="sub">pool tối đa 24 giờ</span></td>
        <td><span class="links"><a href="/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}">Setup</a><a href="https://www.binance.com/en/futures/${encodeURIComponent(row.symbol)}" target="_blank" rel="noreferrer">Binance</a></span></td>
      </tr>`;
    }
    const stage = row.context.executionWindow === 'MARKET_RETEST_WINDOW' ? 'RETEST 5m MỚI · MARKET WINDOW'
      : row.context.executionWindow === 'LIMIT_SUBMIT_WINDOW' ? 'CHƯA RETEST · LIMIT WINDOW'
        : row.context.executionWindow === 'RETEST_EXPIRED' ? 'RETEST ĐÃ QUÁ 90 GIÂY'
          : 'CHỜ RETEST MỚI';
    const time = new Date(row.confirmationAt).toLocaleString('vi-VN', { timeZone:'Asia/Ho_Chi_Minh', hour12:false });
    return `<tr class="${row.context.key.toLowerCase().replaceAll('_','-')}">
      <td><a class="coin" href="/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}">${escapeHtml(row.symbol)}</a><span class="side ${row.side.toLowerCase()}">${row.side}</span></td>
      <td><span class="state">${escapeHtml(row.context.label)}</span><span class="sub">${escapeHtml(row.context.detail)}</span></td>
      <td><span class="score">${number(row.entryScore, 1)}</span><span class="sub">Trend ${number(row.score, 2)} · RẤT MẠNH</span></td>
      <td>${escapeHtml(stage)}<span class="sub">Xác nhận ${escapeHtml(time)}</span></td>
      <td><span class="entry">${price(row.entryPrice)}</span><span class="sub">${price(row.entryZone?.low)} – ${price(row.entryZone?.high)}</span></td>
      <td>${price(row.lastClosed5m)}<span class="sub">Lệch ${number(row.distancePct, 2)}%</span></td>
      <td class="targets">${targetHtml(row.targetPlan)}</td>
      <td><b>${countdown(row.setupRemainingMs)}</b><span class="sub">setup cấu trúc 45 phút</span></td>
      <td><span class="links"><a href="/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}">Setup</a><a href="https://www.binance.com/en/futures/${encodeURIComponent(row.symbol)}" target="_blank" rel="noreferrer">Binance</a></span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="9">Không có coin từng rất mạnh còn giữ đủ cấu trúc và volume trong bộ lọc hiện tại.</td></tr>';
  $('#status').textContent = `${filtered.rows.length}/${all.rows.length} coin đang hiển thị · nguồn ${new Date(snapshot.generatedAt).toLocaleTimeString('vi-VN', { hour12:false })} · ${VERY_STRONG_ENTRY_WATCH_UI_VERSION}`;
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
    $('#status').textContent = `Không tải được danh sách RẤT MẠNH: ${error.message}`;
    $('#status').className = 'status panel error';
  } finally {
    loading = false;
    $('#refresh').disabled = false;
  }
}

for (const id of ['#side','#context-filter','#sort']) $(id).addEventListener('change', render);
$('#refresh').addEventListener('click', load);
load();
setInterval(load, 10_000);
setInterval(render, 1_000);
