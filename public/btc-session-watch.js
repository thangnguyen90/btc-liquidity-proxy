import { buildSessionRows, btcContext, fresh, sessionAt, SESSION_NAMES, sessionCardKey } from './btc-session-model.js?v=20260926-ignore-long-regime-v2';
import { BTC_SESSION_WATCH_HISTORY_KEY, mergeBtcSessionWatchCandidates, normalizeBtcSessionWatchHistory, updateBtcSessionWatchHistory } from './btc-session-history.js';
import { PostMoveLivePriceSocket } from './post-move-live-prices.js';
import { installLiveCardWhitelistUi } from './live-card-whitelist-ui.js';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const price = v => v != null && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v).toLocaleString('en-US', {maximumSignificantDigits:8}) : '—';
const time = v => Number(v) > 0 ? new Date(Number(v)).toLocaleString('vi-VN', {timeZone:'Asia/Bangkok', hour12:false}) : '—';
let payload = null, health = null, loading = false, error = '', lastTable = '', controller;
function readWatchHistory() {
  try { return normalizeBtcSessionWatchHistory(JSON.parse(localStorage.getItem(BTC_SESSION_WATCH_HISTORY_KEY) || 'null')); }
  catch { return normalizeBtcSessionWatchHistory(null); }
}
function saveWatchHistory(value) {
  try { localStorage.setItem(BTC_SESSION_WATCH_HISTORY_KEY, JSON.stringify(value)); } catch {}
}
let watchHistory = readWatchHistory();
const ticks = new Map();
const socket = new PostMoveLivePriceSocket({onTick(t) { if (!ticks.has(t.symbol) || t.eventAt >= ticks.get(t.symbol).eventAt) ticks.set(t.symbol,t); }, onState(s) { $('socket').textContent = s.detail; }});
function render() {
  const now = Date.now(), current = sessionAt(now), btc = btcContext(health, now), bt = ticks.get('BTCUSDT');
  $('clock').textContent = new Date(now).toLocaleTimeString('vi-VN', {timeZone:'Asia/Bangkok', hour12:false});
  $('session').textContent = `${SESSION_NAMES[current.key]}${current.weekend ? ' · cuối tuần' : ''}`;
  $('btc-price').textContent = fresh(bt?.eventAt, now, 10000) ? price(bt.markPrice) : 'Chờ socket';
  $('btc-trend').textContent = btc.label;
  $('btc-trend').className = btc.direction === 'UP' ? 'long' : btc.direction === 'DOWN' ? 'short' : '';
  $('btc-age').textContent = `Nguồn 1h / 4h: ${health?.btcTrendDir ?? '—'} / ${health?.btcTrendDir4h ?? '—'} · ${time(health?.updatedAt)}`;
  $('regime').textContent = fresh(payload?.marketRegime?.evaluatedAt,now,120000) ? payload.marketRegime.state : 'CHƯA CÓ DỮ LIỆU MỚI';
  $('regime-reason').textContent = (payload?.marketRegime?.reasons ?? []).join(' ');
  $('updated').textContent = error || `Snapshot ${time(payload?.generatedAt)} · BTC ${time(health?.updatedAt)} · Discord ${payload?.btcSessionDiscordConfigured ? 'ON' : 'OFF'}`;
  const currentCandidates = payload?.candidates ?? [];
  const mergedCandidates = mergeBtcSessionWatchCandidates(currentCandidates, watchHistory, now);
  const shownCandidates = $('scope').value === 'CURRENT' ? currentCandidates : mergedCandidates;
  const renderPayload = {...(payload ?? {}),candidates:shownCandidates};
  let rows = buildSessionRows(renderPayload,health,ticks,now,$('window').value).filter(r => ($('side').value === 'ALL' || r.side === $('side').value) && r.symbol.toUpperCase().includes($('search').value.trim().toUpperCase()));
  if ($('sort').value === 'score') rows.sort((a,b) => (b.entryScore ?? 0)-(a.entryScore ?? 0));
  if ($('sort').value === 'distance') rows.sort((a,b) => (a.distance == null ? Infinity : Math.abs(a.distance))-(b.distance == null ? Infinity : Math.abs(b.distance)));
  if ($('sort').value === 'symbol') rows.sort((a,b) => a.symbol.localeCompare(b.symbol));
  const html = rows.map(r => `<tr class="${r.contextClass} ${r.dual ? 'dual' : ''} ${(r.stale || r.broken) && !r.retainedOnly ? 'dim' : ''}" data-context="${r.rank === 3 ? r.side : 'WAIT'}"><td><a class="coin-link" href="/coin-level-analysis?symbol=${encodeURIComponent(r.symbol)}">${esc(r.symbol)}</a><small class="${r.side.toLowerCase()}">${r.side} · ${r.retainedOnly ? 'Đã lưu hôm nay' : esc(SESSION_NAMES[r.window])}</small></td><td><strong class="context-badge ${r.rank === 3 ? r.side.toLowerCase() : ''}">${esc(r.status)}</strong><small>${r.retainedOnly ? `Ghi nhận gần nhất ${time(r.watchLastSeenAt)} · chỉ theo dõi` : `${r.aligned ? 'Cùng hướng BTC' : 'BTC chưa đồng thuận'} · chỉ quan sát`}</small></td><td>${price(r.price)}<small>${r.live ? 'MARK SOCKET' : 'Nến đóng · không phải live'}</small></td><td><strong class="entry">${r.retainedOnly ? price(r.middle) : r.validZone && !r.stale && !r.broken ? price(r.middle) : '—'}</strong><small>${price(r.low)} – ${price(r.high)}${r.retainedOnly ? ' · vùng đã lưu, không phải entry live' : r.stale || r.broken ? ' · vùng cũ, không dùng' : ''}</small></td><td>${r.distance == null ? '—' : `${r.distance.toFixed(2)}%`}</td><td>${price(r.level)}<small>${r.side === 'LONG' ? 'Dưới mốc: chờ đánh giá lại' : 'Trên mốc: chờ đánh giá lại'} · không phải SL Binance</small></td><td>${(r.targetPlan?.targets ?? []).filter(t => t.structural).map(t => price(t.price)).join(' / ') || '—'}<small>Tham khảo, không bảo đảm chạm</small></td><td>${esc(r.entryScore ?? '—')}/100<small>Không phải xác suất thắng</small></td><td>${time(r.confirmationAt)}<small>Retest: ${time(r.retestAt)}</small></td></tr>`).join('') || '<tr><td colspan="9" class="empty">Không có coin phù hợp / chưa có snapshot. Không tạo tín hiệu giả để lấp danh sách.</td></tr>';
  if (html !== lastTable) { $('rows').innerHTML = html; lastTable = html; }
  const retainedCount = mergedCandidates.filter(candidate => candidate.retainedOnly).length;
  $('coverage').textContent = `${rows.length} dòng hiển thị · ${currentCandidates.length} đang có trong snapshot · ${retainedCount} hướng đã lưu chờ nguồn trở lại · độ phủ ${payload?.covered ?? 0}/${payload?.universe ?? 0} coin. Watchlist lưu tối đa 100 coin/hướng trong ngày Việt Nam trên trình duyệt này.`;
}
async function json(url, signal) { const r = await fetch(url,{cache:'no-store',signal}); if(!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); }
async function load() {
  if(loading || document.hidden) return;
  loading = true; $('refresh').disabled = true; controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(),12000);
  try {
    const results = await Promise.allSettled([json('/api/coin-level-entry-watch',controller.signal),json('/api/btc-health',controller.signal)]);
    payload = results[0].status === 'fulfilled' ? results[0].value : null;
    health = results[1].status === 'fulfilled' ? results[1].value : null;
    error = results.some(r => r.status === 'rejected') ? 'Không tải đủ dữ liệu; các trạng thái liên quan chuyển về CHỜ.' : '';
    if (payload) {
      watchHistory = updateBtcSessionWatchHistory(watchHistory, payload.candidates, Date.now());
      saveWatchHistory(watchHistory);
    }
    const watchedCandidates = mergeBtcSessionWatchCandidates(payload?.candidates ?? [], watchHistory, Date.now());
    if (!document.hidden) socket.setSymbols(['BTCUSDT',...watchedCandidates.map(c => c.symbol)]);
    const wanted = new Set(['BTCUSDT',...watchedCandidates.map(c => c.symbol)]);
    for(const key of ticks.keys()) if(!wanted.has(key)) ticks.delete(key);
  } catch(e) { payload = null; health = null; error = `Lỗi tải: ${e.message}`; }
  finally { clearTimeout(timeout); loading = false; $('refresh').disabled = false; render(); }
}
// Reserved exact group keys, no invented closed ROE. Existing policy hides the
// checkbox until real closed statistics for this strategy exist; default OFF.
$('whitelist-groups').innerHTML = ['LONG','SHORT'].flatMap(side => Object.keys(SESSION_NAMES).map(window => `<section data-live-card-key="${sessionCardKey(side,window)}" data-binance-card-avg-roe=""></section>`)).join('');
installLiveCardWhitelistUi({page:'btc-session',label:'BTC Session · quan sát',root:$('whitelist-groups')});
for(const id of ['window','scope','side','sort']) $(id).addEventListener('change',render);
$('search').addEventListener('input',render); $('refresh').addEventListener('click',load);
setInterval(() => { if(!document.hidden) render(); },1000);
setInterval(load,30000);
document.addEventListener('visibilitychange',() => { if(document.hidden) {controller?.abort();socket.disconnect('hidden');ticks.clear();} else {void load();} });
window.addEventListener('beforeunload',() => {controller?.abort();socket.disconnect('unload');});
render(); void load();
