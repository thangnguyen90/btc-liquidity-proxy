import { buildCoinLevelEntryDisplay } from './coin-level-entry-preview.js';
import { buildCoinLevelBinanceBlockStatus } from './coin-level-binance-block-status.js';
import {
  entryWatchTierDisplayLabel,
  sortCoinLevelEntryWatchForDisplay,
} from './coin-level-entry-watch-sort.js';
import { nextObserveSort, sortCoinLevelObserveWatches } from './coin-level-observe-sort.js';

const $ = (selector) => document.querySelector(selector);
const form = $('#search-form');
const input = $('#symbol-input');
const button = $('#search-button');
const status = $('#status');
const result = $('#result');
let activeSymbol = null;
let activeController = null;
let requestSequence = 0;
let searchInFlight = false;
let coinglassPollSequence = 0;
let activeData = null;
let liveSocket = null;
let liveSocketSymbol = null;
let liveSocketGeneration = 0;
let liveSocketRetryTimer = null;
let liveSocketRetryMs = 1_000;
let lastLiveMark = null;
let showEarlyLongHistory = false;
let showEarlyShortHistory = false;
const earlyObserveSort = { LONG: {}, SHORT: {} };
const earlyObserveShown = { LONG: [], SHORT: [] };

function normalizeInput(value) {
  const clean = String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/^[#$]+/u, '')
    .replace(/[-/_\s]/gu, '');
  return clean.endsWith('USDT') ? clean : `${clean}USDT`;
}

function validUsdtSymbol(symbol) {
  return /^[\p{L}\p{N}]{1,40}USDT$/u.test(symbol);
}

function liveSocketUrl(symbol) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = location.host || '127.0.0.1:19082';
  return `${protocol}//${host}/ws/coin-level-analysis?symbol=${encodeURIComponent(symbol)}`;
}

function setLiveSocketState(state, detail = '') {
  const badge = $('#live-socket-badge');
  const text = $('#live-socket-at');
  if (!badge || !text) return;
  const labels = {
    connected: 'SOCKET LIVE',
    connecting: 'SOCKET ĐANG NỐI',
    fallback: 'POLLING DỰ PHÒNG',
  };
  badge.className = `live-socket-badge ${state}`;
  badge.textContent = labels[state] ?? 'SOCKET';
  text.textContent = detail;
}

function applyLiveMark({ symbol, markPrice, eventAt }) {
  const mark = Number(markPrice);
  const at = Number(eventAt) || Date.now();
  if (!activeSymbol || symbol !== activeSymbol || !(mark > 0)) return;
  lastLiveMark = { symbol, markPrice: mark, eventAt: at };
  const formatted = price(mark);
  for (const selector of ['#mark-price', '#ladder-price', '#liq-scan-live-mark']) {
    const node = $(selector);
    if (node) node.textContent = formatted;
  }
  const circulatingSupply = Number(activeData?.supplyProfile?.circulatingSupply);
  const supplyMarketCap = $('#supply-market-cap');
  if (supplyMarketCap && circulatingSupply > 0) {
    supplyMarketCap.textContent = compact(circulatingSupply * mark, ' USD');
  }
  const target = activeData?.liqScan?.current?.sweepTarget;
  const targetDistance = $('#liq-scan-target-distance');
  if (targetDistance && Number(target?.price) > 0) {
    targetDistance.textContent = pct((Number(target.price) / mark - 1) * 100, true);
  }
  const liveTime = new Date(at).toLocaleTimeString('vi-VN', {
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  setLiveSocketState('connected', `MARK ${formatted} · ${liveTime}`);
}

function connectLiveSocket(symbol, { force = false } = {}) {
  if (!validUsdtSymbol(symbol)) return;
  if (!force && liveSocketSymbol === symbol
    && [WebSocket.CONNECTING, WebSocket.OPEN].includes(liveSocket?.readyState)) return;
  clearTimeout(liveSocketRetryTimer);
  liveSocketRetryTimer = null;
  const generation = ++liveSocketGeneration;
  liveSocketSymbol = symbol;
  liveSocket?.close(1000, 'symbol changed');
  setLiveSocketState('connecting', `${symbol} · giá MARK mỗi giây`);
  const socket = new WebSocket(liveSocketUrl(symbol));
  liveSocket = socket;
  socket.addEventListener('message', (message) => {
    if (generation !== liveSocketGeneration) return;
    let payload;
    try { payload = JSON.parse(message.data); } catch { return; }
    if (payload?.symbol !== symbol) return;
    if (payload.type === 'ready') {
      liveSocketRetryMs = 1_000;
      setLiveSocketState('connected', `${symbol} · chờ tick MARK`);
    } else if (payload.type === 'mark') {
      applyLiveMark(payload);
    }
  });
  socket.addEventListener('close', () => {
    if (generation !== liveSocketGeneration || activeSymbol !== symbol) return;
    setLiveSocketState('fallback', 'Socket mất kết nối · vẫn đồng bộ HTTP mỗi 20 giây');
    if (document.hidden) return;
    const delay = liveSocketRetryMs;
    liveSocketRetryMs = Math.min(15_000, liveSocketRetryMs * 2);
    liveSocketRetryTimer = setTimeout(() => {
      if (generation === liveSocketGeneration && activeSymbol === symbol) {
        connectLiveSocket(symbol, { force: true });
      }
    }, delay);
  });
  socket.addEventListener('error', () => socket.close());
}

function price(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const digits = number >= 100 ? 2 : number >= 1 ? 4 : number >= .1 ? 5 : number >= .01 ? 6 : 8;
  return number.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function compact(value, suffix = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(number)}${suffix}`;
}

function earlyObserveQuoteVolumeCell(item) {
  const value = item?.quoteVolumeUsdt;
  const amount = Number(value);
  return `<td class="observe-quote-volume">${value == null || !Number.isFinite(amount) || amount < 0
    ? '—' : compact(amount, ' USDT')}</td>`;
}

function pct(value, signed = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${signed && number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function zoneHtml(zone) {
  const confidence = String(zone.confidence ?? 'LOW').toLowerCase();
  const book = Number(zone.orderBookNotional) > 0 ? `<span>BOOK ${compact(zone.orderBookNotional, ' USDT')}</span>` : '';
  return `
    <article class="zone-card">
      <div class="zone-top">
        <strong>${price(zone.low)} – ${price(zone.high)}</strong>
        <span class="zone-distance">${pct(zone.distancePct, true)}</span>
      </div>
      <div class="zone-meta">
        <span class="${confidence}">${zone.confidence} · ${Number(zone.score).toFixed(1)}</span>
        ${(zone.sources ?? []).slice(0, 5).map((source) => `<span>${source}</span>`).join('')}
        ${book}
      </div>
    </article>`;
}

function renderZones(selector, zones) {
  $(selector).innerHTML = zones?.length
    ? zones.map(zoneHtml).join('')
    : '<div class="empty-zone">Chưa gom được vùng đủ gần giá.</div>';
}

function renderFrames(frames) {
  $('#frame-rows').innerHTML = frames.map((frame) => `
    <tr>
      <td><strong>${frame.interval}</strong></td>
      <td class="state-${String(frame.state).toLowerCase()}">${frame.state}</td>
      <td>${price(frame.close)}</td>
      <td>${price(frame.ema13)}</td>
      <td>${price(frame.ema25)}</td>
      <td>${price(frame.ema99)}</td>
      <td>${pct(frame.atrPct)}</td>
    </tr>`).join('');
}

function renderCandles(candles) {
  $('#candles').innerHTML = candles.map((candle) => `
    <article class="candle">
      <div class="candle-head">
        <span>${candle.interval}</span>
        <strong class="${candle.direction === 'GREEN' ? 'positive' : candle.direction === 'RED' ? 'negative' : ''}">${candle.direction} · ${pct(candle.changePct, true)}</strong>
      </div>
      <div class="candle-grid">
        <span>O ${price(candle.open)}</span><span>H ${price(candle.high)}</span>
        <span>L ${price(candle.low)}</span><span>C ${price(candle.close)}</span>
        <span>Râu trên ${pct(candle.upperWickPctOfRange)}</span><span>Râu dưới ${pct(candle.lowerWickPctOfRange)}</span>
        <span>Taker buy</span><strong>${pct(candle.takerBuyPct)}</strong>
      </div>
    </article>`).join('');
}

function renderPlan(prefix, plan) {
  $(`#${prefix}-status`).textContent = plan.status.replaceAll('_', ' ');
  $(`#${prefix}-trigger`).textContent = plan.trigger;
  $(`#${prefix}-zone`).textContent = `${price(plan.entryZone.low)} – ${price(plan.entryZone.high)}`;
  $(`#${prefix}-invalid`).textContent = price(plan.invalidation);
  $(`#${prefix}-targets`).textContent = plan.targets?.length ? plan.targets.map(price).join(' → ') : 'Chưa có vùng kế tiếp';
}

function renderEntryPreview(data) {
  const display = buildCoinLevelEntryDisplay(data);
  const summary = $('#entry-direction-summary');
  if (summary) summary.className = `entry-direction-summary ${display.confirmedSide?.toLowerCase() ?? ''}`;
  const trendLabel = $('#entry-trend-label');
  if (trendLabel) trendLabel.textContent = display.trendLabel;
  const actionLabel = $('#entry-action-label');
  if (actionLabel) actionLabel.textContent = display.actionLabel;
  for (const side of ['LONG', 'SHORT']) {
    const preview = display.cards[side];
    const prefix = side.toLowerCase();
    const card = $(`#${prefix}-entry-preview`);
    const level = $(`#${prefix}-entry-price`);
    const zone = $(`#${prefix}-entry-range`);
    const state = $(`#${prefix}-entry-state`);
    const condition = $(`#${prefix}-entry-condition`);
    if (!card || !level || !zone || !state || !condition) continue;
    card.classList.toggle('unavailable', !preview.available);
    card.classList.toggle('confirmed', display.confirmedSide === side && preview.available);
    card.classList.toggle('alternative', display.confirmedSide != null && display.confirmedSide !== side);
    condition.textContent = preview.condition;
    level.textContent = preview.visible ? price(preview.displayPrice) : '—';
    zone.textContent = preview.available
      ? `${display.sharedSupport ? 'Vùng hỗ trợ' : 'Vùng theo dõi'} ${price(preview.zone.low)} – ${price(preview.zone.high)}`
      : preview.status === 'STALE' ? 'Dữ liệu Binance cũ · chờ cập nhật' : 'Chưa có vùng giá hợp lệ';
    state.textContent = preview.state;
  }
  const disclaimer = $('#entry-preview-disclaimer');
  if (disclaimer) {
    disclaimer.textContent = display.sharedSupport
      ? 'Hai ngưỡng là hai mép của cùng vùng hỗ trợ: 15m đóng trên mép trên rồi retest giữ được mới xem LONG; 15m đóng dưới mép dưới rồi retest không lấy lại mới xem SHORT. Ở giữa vùng thì chờ. Đây không phải giá vào lệnh; trang không đặt Binance.'
      : display.sameZone
        ? 'Hai kịch bản cùng neo một vùng; xem điều kiện nến riêng ở LONG/SHORT PLAN. Không phải hai giá vào lệnh hoặc hai lệnh đồng thời; trang không đặt Binance.'
        : 'Mốc lớn là trung điểm vùng theo dõi, không phải dự báo giá khớp lệnh. Chỉ xem xét sau nến 15m xác nhận và retest 5m; trang không đặt Binance.';
  }
}

function liquidZoneHtml(zone) {
  const lifecycle = zone.lifecycle && zone.lifecycle !== 'UNTRACKED'
    ? `<span class="lifecycle-badge">${escapeHtml(zone.lifecycle)}</span>`
    : '';
  const effectiveScore = Number.isFinite(Number(zone.effectiveAttractionScore))
    ? Number(zone.effectiveAttractionScore)
    : Number(zone.attractionScore);
  const lifecycleEffect = zone.lifecycle === 'REJECTED'
    ? ` · hút hiệu dụng 0 · áp lực ngược ${Number(zone.rejectionPressureScore ?? 0).toFixed(1)}`
    : Number(zone.lifecycleMultiplier) < 1
      ? ` · hút hiệu dụng ${effectiveScore.toFixed(1)}`
      : '';
  return `<div class="liquid-zone ${zone.side === 'BELOW' ? 'below' : 'above'}">
    <strong>${price(zone.bandLow)} – ${price(zone.bandHigh)} ${lifecycle}</strong>
    <small>${pct(zone.distancePct, true)} · lực ${Number(zone.strength).toFixed(0)} · giữ ${Number(zone.persistenceBars).toLocaleString('en-US')} bars${lifecycleEffect}</small>
  </div>`;
}

function liquidSideHtml(label, zones) {
  return `<div class="liquid-side"><span>${label}</span>${zones?.length
    ? zones.slice(0, 3).map(liquidZoneHtml).join('')
    : '<small>Không có active edge zone ≤35%</small>'}</div>`;
}

function coinglassFrameHtml(frame) {
  return `<article class="coinglass-frame">
    <div class="coinglass-frame-head"><strong>${escapeHtml(frame.range)}</strong><span>${compact(frame.cellCount)} cells</span></div>
    <div class="liquid-side-grid">
      ${liquidSideHtml('PHÍA TRÊN · KILL SHORT', frame.above)}
      ${liquidSideHtml('PHÍA DƯỚI · KILL LONG', frame.below)}
    </div>
  </article>`;
}

function coinglassRefreshLabel(refresh) {
  const state = String(refresh?.status ?? 'IDLE');
  if (state === 'QUEUED') return 'Đang chờ collector Top 40 hoàn tất…';
  if (state === 'RUNNING') return 'Đang cào CoinGlass 48h, 12h và 24h…';
  if (state === 'FAILED') return `Lần cào gần nhất lỗi: ${refresh?.error || 'không rõ nguyên nhân'}`;
  return 'Chưa có snapshot riêng; bấm Phân tích để cào đúng coin này.';
}

function secondRejectionCardHtml(setup, side) {
  if (!setup?.detected) return '';
  const long = side === 'LONG';
  return `
    <article class="second-rejection-card ${setup.ready ? 'ready' : 'watch'} ${long ? 'long' : 'short'}">
      <div>
        <span>${setup.ready
          ? `${side} READY · ${long ? 'REJECT ĐÁY LẦN 2' : 'REJECT LẦN 2'}`
          : `WATCH · ${long ? 'CÓ DẠNG REJECT ĐÁY LẦN 2' : 'CÓ DẠNG REJECT LẦN 2'}`}</span>
        <strong>${escapeHtml(setup.message)}</strong>
      </div>
      <div class="second-rejection-levels">
        <small>ENTRY <b>${price(setup.entryPrice)}</b></small>
        <small>TP1 <b>${price(setup.takeProfitPrice)}</b></small>
        <small>VÔ HIỆU <b>${price(setup.invalidationPrice)}</b></small>
        <small>R:R <b>${Number.isFinite(Number(setup.rewardRiskRatio)) ? Number(setup.rewardRiskRatio).toFixed(2) : '—'}</b></small>
      </div>
    </article>`;
}

function renderLiqScan(liqScan) {
  const panel = $('#liq-scan-panel');
  const badge = $('#liq-scan-badge');
  const container = $('#liq-scan-content');
  const current = liqScan?.current ?? null;
  const lastAlert = liqScan?.lastAlert ?? null;
  const snapshot = current ?? lastAlert;
  const assessment = liqScan?.directionAssessment;
  if (!snapshot) {
    panel.className = 'liq-scan-panel panel idle';
    badge.className = 'liq-scan-badge idle';
    badge.textContent = 'CHƯA CÓ DỮ LIỆU';
    container.innerHTML = '<div class="empty-zone">Chưa có snapshot LiqScan cho coin này; dữ liệu cũ vẫn tương thích và sẽ tự bổ sung ở lần phân tích mới.</div>';
    return;
  }

  const upper = snapshot.dominantSide === 'ABOVE';
  const stale = !current || Boolean(current.stale) || Date.now() - Date.parse(current.evaluatedAt) > 90_000;
  const activeAlert = !stale && snapshot.isAlert;
  const score = Number(snapshot.imbalanceScore ?? snapshot.sweepProbabilityPct ?? 0);
  const directionClass = upper ? 'upper' : 'lower';
  panel.className = `liq-scan-panel panel ${activeAlert ? directionClass : 'quiet'}${stale ? ' stale' : ''}`;
  badge.className = `liq-scan-badge ${activeAlert ? directionClass : 'idle'}`;
  badge.textContent = stale
    ? 'CẢNH BÁO CŨ'
    : assessment?.state === 'CONFLICT' ? 'HAI NGUỒN MÂU THUẪN'
      : activeAlert ? `ĐIỂM LỆCH · ${score}/100` : 'CHƯA ĐỦ NGƯỠNG';

  const evaluatedAt = Date.parse(snapshot.evaluatedAt ?? 0);
  const time = Number.isFinite(evaluatedAt)
    ? new Date(evaluatedAt).toLocaleTimeString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' })
    : '—';
  const prefix = current ? 'LiqScan hiện tại' : 'LiqScan lịch sử';
  const action = assessment?.headline ?? 'Chưa đủ dữ liệu đối chiếu để xác định phía quét trước.';
  const target = snapshot.sweepTarget?.price > 0
    ? `<span>VÙNG PROXY THAM KHẢO <b>${price(snapshot.sweepTarget.price)}</b> (<i id="liq-scan-target-distance">${pct(snapshot.sweepTarget.distancePct, true)}</i>)</span>`
    : '';
  const mainKill = snapshot.killZoneCluster?.mainKillZone;
  const farKill = snapshot.killZoneCluster?.farKillZone;
  const mainKillHtml = mainKill?.low > 0
    ? `<span>MAIN KILL <b>${price(mainKill.low)}–${price(mainKill.high)}</b></span>`
    : '';
  const farKillHtml = farKill?.low > 0
    ? `<span>FAR KILL <b>${price(farKill.low)}–${price(farKill.high)}</b></span>`
    : '';
  const ageText = Number.isFinite(Number(lastAlert?.ageMs))
    ? ` · cách đây ${Math.max(0, Math.round(Number(lastAlert.ageMs) / 60_000))} phút`
    : '';
  const currentLine = lastAlert
    ? `<details class="liq-scan-current"><summary>Cảnh báo lịch sử${ageText}</summary>LiqScan báo lúc ${new Date(lastAlert.evaluatedAt).toLocaleTimeString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' })}: trên ${compact(lastAlert.liquidityAbove)}, dưới ${compact(lastAlert.liquidityBelow)}, điểm lệch ${Number(lastAlert.imbalanceScore ?? lastAlert.sweepProbabilityPct)}/100. Đây là dữ liệu tại thời điểm phát hiện, không xác nhận hướng hiện tại.</details>`
    : '';
  const zoneHtml = (zone, side, plan) => `<article class="coinglass-frame">
    <strong>${side === 'ABOVE' ? '↑ VÙNG TRÊN · KILL SHORT' : '↓ VÙNG DƯỚI · KILL LONG'}</strong>
    <p>${zone ? `${price(zone.bandLow)}–${price(zone.bandHigh)} · cách mép gần ${pct(zone.distanceToEdgePct)} · ${escapeHtml(zone.lifecycle)}` : 'Chưa có vùng mới, chưa quét hợp lệ.'}</p>
    <p>Xác nhận ${side === 'ABOVE' ? 'LONG' : 'SHORT'}: ${escapeHtml(plan?.trigger ?? 'Chờ dữ liệu nến 15m và retest 5m.')}</p>
    <p>Vô hiệu kịch bản: ${price(plan?.invalidation)}${plan?.invalidation > 0 ? ` · giá ${side === 'ABOVE' ? 'xuống dưới' : 'lên trên'} mức này.` : ''}</p>
  </article>`;
  const directionHtml = assessment ? `<div class="coinglass-timeframe-trial">
    <strong>${escapeHtml(assessment.headline)}</strong>
    <p>Mức đồng thuận: ${assessment.agreement === 'PARTIAL' ? 'MỘT PHẦN' : 'THẤP'} · vùng từ ${escapeHtml(assessment.sourceRange ?? 'chưa có khung mới')}.</p>
    <p>${assessment.target ? `Vùng ưu tiên theo dõi: ${price(assessment.target.bandLow)}–${price(assessment.target.bandHigh)} · cách ${pct(assessment.target.distanceToEdgePct)}.` : 'Chưa chọn mục tiêu quét trước; hai vùng dưới đây là kịch bản tham khảo.'}</p>
    <div class="liquid-side-grid">${zoneHtml(assessment.above, 'ABOVE', assessment.longPlan)}${zoneHtml(assessment.below, 'BELOW', assessment.shortPlan)}</div>
    <p>${assessment.reasons.map(escapeHtml).join('<br>')}</p>
  </div>` : '';
  const alertTier = liqScan?.alertTier;
  const tierHtml = alertTier ? `<div class="coinglass-timeframe-trial">
    <strong>${alertTier.tier==='MARKET_READY'?'MARKET READY · ĐỦ BỘ ĐIỀU KIỆN THỬ':'CHÚ Ý / THEO DÕI · CHƯA ĐỦ ĐIỀU KIỆN MARKET'} · ${escapeHtml(alertTier.side)}</strong>
    <p>${alertTier.checks.map(c=>`${c.pass?'✓':'✗'} ${escapeHtml(c.label)}`).join('<br>')}</p>
    <span>Discord từ 40 điểm; MARKET READY từ 70 điểm và đủ xác nhận. Hai ngưỡng đang thử, không phải xác suất và không tự đặt lệnh Binance.</span>
  </div>` : '<p class="liq-scan-note">Chưa đạt 40 điểm hoặc dữ liệu cũ: không gửi cảnh báo điểm LiqScan.</p>';

  container.innerHTML = `
    <div class="liq-scan-callout">
      <div class="liq-scan-probability">${score}<small>/100</small></div>
      <div class="liq-scan-copy">
        <strong>${prefix} ${time}: thanh khoản ước tính trên ${compact(snapshot.liquidityAbove)}, dưới ${compact(snapshot.liquidityBelow)}, điểm lệch thanh khoản ${score}/100.</strong>
        <p>${escapeHtml(action)}${stale ? ' · Dữ liệu cũ, chờ cập nhật.' : ''}</p>
      </div>
    </div>
    <div class="liq-scan-meta">
      <span>BIAS <b>${Number(snapshot.bias).toFixed(3)}</b></span>
      <span>MARK <b id="liq-scan-live-mark">${price(snapshot.markPrice)}</b></span>
      <span>PHÍA TRỘI <b>${upper ? 'TRÊN · KILL SHORT' : 'DƯỚI · KILL LONG'}</b></span>
      ${target}${mainKillHtml}${farKillHtml}
    </div>
    ${currentLine}
    ${directionHtml}
    ${tierHtml}
    <div class="liq-scan-note">Thanh khoản trên/dưới là proxy từ quote-volume USDT có trọng số tuổi nến và đòn bẩy; không phải số coin hoặc USD thanh lý thực tế. Discord quét MAIN KILL/vùng tham khảo chỉ gửi khi proxy phía bị quét >100M, cùng các điều kiện cũ. Điểm lệch từ nến Binance 15m, không phải xác suất quét. Vùng CoinGlass là ước tính riêng. Đánh giá này chỉ tham khảo, không tự phát lệnh.</div>`;
}

function renderLiqScanShort(setup) {
  const container = $('#liqscan-short-content');
  const panel = $('#liqscan-short-panel');
  if (!container || !panel) return;
  panel.className = `panel liqscan-short-panel${setup?.ready ? ' confirmed' : ''}`;
  if (!setup) { container.innerHTML = '<p>Chưa có dữ liệu đánh giá; chờ lần cập nhật mới.</p>'; return; }
  const labels = {
    WAIT_ALERT: 'CHỜ CẢNH BÁO PHÍA TRÊN', WAIT_SWEEP: 'CHỜ QUÉT VÙNG TRÊN',
    SWEPT_WAIT_REJECT: 'ĐÃ QUÉT · CHỜ REJECT', REJECTED_WAIT_CONFIRMATION: 'ĐÃ REJECT · CHỜ XÁC NHẬN',
    CANCELLED_ACCEPTED: 'HỦY · GIÁ GIỮ TRÊN VÙNG', INVALIDATED: 'ĐÃ VÔ HIỆU', EXPIRED: 'HẾT HẠN THEO DÕI',
    MISSING_DATA: 'CHỜ DỮ LIỆU NẾN', WATCH_NO_CHASE: 'WATCH · CHƯA VÀO / KHÔNG ĐUỔI',
    SHORT_SETUP_CONFIRMED: '↓ SHORT · ĐỦ ĐIỀU KIỆN QUAN SÁT',
  };
  const dateLabel = value => value ? new Date(value).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh',hour12:false}) : 'Chưa có';
  const level = value => Number.isFinite(value) && value > 0 ? price(value) : '—';
  container.innerHTML = `<strong>${escapeHtml(labels[setup.state] ?? setup.state)}</strong>
    <p>${escapeHtml(setup.message)}</p>
    <div class="liq-scan-meta">
      <span>VÙNG GỐC <b>${setup.zone ? `${price(setup.zone.low)}–${price(setup.zone.high)}` : '—'}</b></span>
      <span>GIÁ THAM KHẢO <b>${level(setup.entry)}</b></span>
      <span>TP GẦN <b>${level(setup.takeProfit)}</b></span>
      <span>VÔ HIỆU <b>${level(setup.invalidation)}</b></span>
      <span>R:R <b>${Number.isFinite(setup.rewardRisk) ? setup.rewardRisk.toFixed(2) : '—'}</b></span>
    </div>
    <p>Cảnh báo gốc: ${escapeHtml(dateLabel(setup.alertAt))}<br>
      Nến quét đóng: ${escapeHtml(dateLabel(setup.sweepAt))} · Reject: ${escapeHtml(dateLabel(setup.rejectAt))}<br>
      Nến xác nhận đóng: ${escapeHtml(dateLabel(setup.confirmationAt))}</p>
    <div>${(setup.checks??[]).map(check=>`<p class="${check.pass ? 'positive' : 'negative'}">${check.pass ? '✓' : '✗'} ${escapeHtml(check.label)}</p>`).join('')}</div>
    <p class="liq-scan-note">${(setup.notes??[]).map(escapeHtml).join('<br>')}</p>`;
}

function renderHorizonAnalysis(data) {
  const container = $('#horizon-content');
  if (!container) return;
  if (!data?.available) { container.innerHTML='<p>Chưa đủ ATR nến 1h/4h để tính biên tham khảo.</p>'; return; }
  const directions={UPPER:'↑ NGHIÊNG LÊN',LOWER:'↓ NGHIÊNG XUỐNG',MIXED:'CHƯA ĐỒNG THUẬN',CONFLICT:'HAI NGUỒN NGƯỢC HƯỚNG',WAIT_DATA:'CHỜ DỮ LIỆU MỚI'};
  const zone = value => value ? `${price(value.low??value.bandLow)}–${price(value.high??value.bandHigh)}` : 'Chưa có vùng hợp lệ trong biên';
  const time = value => new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false});
  container.innerHTML=`<p>Mốc tính: ${escapeHtml(time(data.generatedAt))} · Giá ${price(data.anchor)} · cập nhật theo lần phân tích mới.</p>
    <div class="horizon-grid">${data.scenarios.map(s=>`<article class="horizon-scenario">
      <h3>${s.hours} GIỜ TỚI</h3><strong>${escapeHtml(directions[s.direction]??s.direction)}</strong>
      <p>Đến ${escapeHtml(time(s.validUntil))} · Đồng thuận ${s.agreement==='PARTIAL'?'một phần':'thấp'}</p>
      <div class="horizon-bounds"><span>CẬN TRÊN THAM KHẢO<b>${price(s.upper)}</b>${pct(s.upperPct,true)}</span><span>CẬN DƯỚI THAM KHẢO<b>${price(s.lower)}</b>${pct(s.lowerPct,true)}</span></div>
      <p>Kháng cự 1h/4h gần: <b>${zone(s.resistance)}</b><br>Hỗ trợ 1h/4h gần: <b>${zone(s.support)}</b></p>
      <p>Vùng quét trên: <b>${zone(s.upperLiquidity)}</b><br>Vùng quét dưới: <b>${zone(s.lowerLiquidity)}</b><br>CoinGlass: ${escapeHtml(s.liquidityRange??'thiếu dữ liệu mới')}</p>
      <p>${escapeHtml(s.upperBreak)}<br>${escapeHtml(s.lowerBreak)}</p>
      ${s.clipped?'<p class="negative">Biến động cực cao: cận dưới đã giới hạn ở 1% giá mốc; biên ít hữu ích.</p>':''}
    </article>`).join('')}</div>
    <details><summary>Cách tính và giới hạn</summary><p>Độ rộng = lớn hơn giữa ATR 1h × √số giờ và ATR 4h × √(số giờ/4). Biên đặt hai phía quanh giá mốc; hỗ trợ/kháng cự và CoinGlass là các vùng đối chiếu bên trong biên.</p></details>
    <p class="liq-scan-note">${data.notes.map(escapeHtml).join('<br>')}</p>`;
}

function renderCoinGlass(coinglass, secondRejectionShort = null, secondRejectionLong = null) {
  const container = $('#coinglass-content');
  if (!coinglass?.available) {
    const auth = coinglass?.authRequired;
    const refreshLabel = coinglassRefreshLabel(coinglass?.refresh);
    container.innerHTML = `<div class="coinglass-unavailable">
      <div><strong>${auth ? 'CoinGlass cần đăng nhập/quyền dữ liệu.' : 'Coin chưa có trong lượt quét Top 1–80 hiện tại.'}</strong>
      <div>${auth ? 'Đăng nhập collector rồi cào lại.' : escapeHtml(refreshLabel)}</div></div>
      <span>${escapeHtml(coinglass?.snapshotUpdatedAt ? new Date(coinglass.snapshotUpdatedAt).toLocaleTimeString('vi-VN') : 'NO DATA')}</span>
    </div>`;
    return;
  }
  $('#coinglass-link').href = coinglass.link;
  const combined = coinglass.combined;
  const freshnessMinutes = Number.isFinite(Number(coinglass.ageMs)) ? Math.round(Number(coinglass.ageMs) / 60_000) : null;
  const frameMap = new Map((coinglass.frames ?? []).map((frame) => [frame.range, frame]));
  const framesHtml = ['24h', '48h', '12h'].map((range) => {
    const frame = frameMap.get(range);
    return frame ? coinglassFrameHtml(frame) : `<article class="coinglass-frame missing"><strong>${range}</strong><span>${escapeHtml(coinglassRefreshLabel(coinglass.refresh))}</span></article>`;
  }).join('');
  const secondRejectHtml = [
    secondRejectionCardHtml(secondRejectionShort, 'SHORT'),
    secondRejectionCardHtml(secondRejectionLong, 'LONG'),
  ].join('');
  container.innerHTML = `
    ${coinglass.timeframeTrial ? `<div class="coinglass-timeframe-trial">
      <strong>THỬ NGHIỆM ƯU TIÊN 24H · CHỈ THAM KHẢO</strong>
      <p>24h ×1,4 · 48h ×1,1 · 12h ×0,75 — chỉ tính dữ liệu trong 20 phút.</p>
      <p>Ưu tiên 24h: <b>${escapeHtml(coinglass.timeframeTrial.weighted.liquidityBias)}</b> · độ lệch ${pct(coinglass.timeframeTrial.weighted.dominancePct)}.
      Trọng số bằng nhau (cùng dữ liệu mới): <b>${escapeHtml(coinglass.timeframeTrial.equalWeight.liquidityBias)}</b> · ${pct(coinglass.timeframeTrial.equalWeight.dominancePct)}.</p>
      <p>${coinglass.timeframeTrial.hasFresh24h ? 'Đã có dữ liệu 24h mới.' : 'Chưa có dữ liệu 24h mới — kết quả tạm dựa trên khung còn lại.'}
      ${escapeHtml([...coinglass.timeframeTrial.missingRanges, ...coinglass.timeframeTrial.excludedRanges].length ? `Khung thiếu/cũ: ${[...coinglass.timeframeTrial.missingRanges, ...coinglass.timeframeTrial.excludedRanges].join(', ')}.` : '')}</p>
      <span>REJECTED vẫn được tính là áp lực ngược. Độ lệch không phải xác suất thắng; trọng số thử chưa được backtest. Không dùng bản thử để phát lệnh.</span>
    </div>` : ''}
    <div class="coinglass-summary">
      <article class="coinglass-assessment"><strong>${escapeHtml(combined.headline)}</strong><span>${escapeHtml(combined.agreement)} · chỉ dùng active zone còn ở mép phải heatmap</span></article>
      <article class="coinglass-stat"><span>Lực hút</span><strong>${escapeHtml(combined.liquidityBias)}</strong></article>
      <article class="coinglass-stat"><span>Độ lệch hai phía</span><strong>${pct(combined.dominancePct)}</strong></article>
      <article class="coinglass-stat"><span>Stream / rank</span><strong>${escapeHtml(coinglass.streamId)} · #${coinglass.globalRank ?? '—'}</strong></article>
      <article class="coinglass-stat"><span>Độ mới</span><strong class="${coinglass.stale ? 'negative' : 'positive'}">${freshnessMinutes == null ? '—' : `${freshnessMinutes} phút`}</strong></article>
    </div>
    ${secondRejectHtml}
    <div class="coinglass-frames">${framesHtml}</div>`;
}

async function requestCoinGlassCrawl(symbol) {
  const response = await fetch('/api/coin-level-analysis/coinglass-refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ symbol }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function hasCoinGlassFrames(data) {
  const ranges = new Set((data?.coinglass?.frames ?? []).map((frame) => frame.range));
  return ['48h', '12h', '24h'].every((range) => ranges.has(range));
}

async function pollCoinGlass(symbol, pollId) {
  const deadline = Date.now() + 4 * 60_000;
  while (pollId === coinglassPollSequence && activeSymbol === symbol && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    if (pollId !== coinglassPollSequence || activeSymbol !== symbol) return;
    try {
      const response = await fetch(`/api/coin-level-analysis?symbol=${encodeURIComponent(symbol)}&coinglassPoll=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (pollId !== coinglassPollSequence || activeSymbol !== symbol) return;
      render(data);
      const refreshState = String(data?.coinglass?.refresh?.status ?? 'IDLE');
      if (hasCoinGlassFrames(data)) {
        const staleBinance = data?.freshness?.binance === 'STALE_LAST_GOOD';
        status.textContent = staleBinance
          ? `${symbol}: CoinGlass 48h/12h/24h đã cập nhật; Binance đang giữ snapshot gần nhất.`
          : `${symbol}: CoinGlass 48h, 12h và 24h đã cập nhật.`;
        status.className = staleBinance ? 'status error' : 'status';
        return;
      }
      if (refreshState === 'FAILED') {
        status.textContent = `${symbol}: CoinGlass cào lỗi — ${data.coinglass.refresh?.error || 'không rõ nguyên nhân'}`;
        status.className = 'status error';
        return;
      }
      status.textContent = refreshState === 'QUEUED'
        ? `${symbol}: đang chờ lượt quét Top 40 xong để cào riêng…`
        : `${symbol}: đang lấy CoinGlass 48h, 12h và 24h…`;
      status.className = 'status';
    } catch (error) {
      if (pollId !== coinglassPollSequence) return;
      status.textContent = `${symbol}: chưa đọc lại được dữ liệu phân tích — ${error.message}; kết quả gần nhất vẫn được giữ.`;
      status.className = 'status error';
    }
  }
  if (pollId === coinglassPollSequence && activeSymbol === symbol) {
    status.textContent = `${symbol}: CoinGlass chưa hoàn tất sau 4 phút; dữ liệu hiện có vẫn được giữ nguyên.`;
    status.className = 'status error';
  }
}

function showCoinBinanceIssue(symbol, reason, stale = false) {
  const line = $('#binance-coin-issue');
  if (!line) return;
  line.hidden = !reason;
  line.textContent = reason
    ? `${symbol}: ${stale ? 'đang dùng snapshot Binance cũ' : 'lần phân tích coin gặp lỗi'} — ${String(reason).slice(0, 500)}. Đây là lỗi của lần phân tích coin, không tự suy ra Binance chặn toàn bộ REST.`
    : '';
}

function renderSupplyProfile(profile) {
  const panel = $('#supply-profile');
  if (!panel) return;
  if (!profile?.available) {
    panel.className = 'supply-profile panel unknown';
    $('#supply-profile-title').textContent = 'Chưa lấy được dữ liệu tổng cung';
    $('#supply-profile-badge').textContent = 'KHÔNG CÓ DỮ LIỆU';
    for (const selector of [
      '#supply-market-cap', '#supply-circulating', '#supply-total', '#supply-max',
      '#supply-float-pct', '#supply-turnover',
    ]) $(selector).textContent = '—';
    $('#supply-profile-note').textContent = 'Coin Level vẫn hoạt động bình thường; lỗi nguồn cung không chặn trang và không tác động Binance.';
    $('#supply-profile-source').textContent = `Nguồn CoinGecko tạm thiếu · ${profile?.reason ?? 'không rõ nguyên nhân'} · OBSERVE ONLY`;
    return;
  }
  const classification = profile.classification ?? {};
  const severity = ['critical', 'warning', 'watch', 'normal'].includes(classification.severity)
    ? classification.severity
    : 'unknown';
  panel.className = `supply-profile panel ${severity}`;
  $('#supply-profile-title').textContent = `${profile.name || profile.providerSymbol || 'Coin'} · hồ sơ cung`;
  $('#supply-profile-badge').textContent = classification.label || 'ĐÃ CÓ DỮ LIỆU';
  $('#supply-market-cap').textContent = compact(profile.marketCapUsd, ' USD');
  $('#supply-circulating').textContent = compact(profile.circulatingSupply, ' token');
  $('#supply-total').textContent = compact(profile.totalSupply, ' token');
  $('#supply-max').textContent = compact(profile.maxSupply, ' token');
  $('#supply-float-pct').textContent = pct(profile.circulatingPctOfMax);
  $('#supply-turnover').textContent = pct(profile.providerTurnoverPct);
  const lowSupply = classification.highlighted
    ? 'LÀM NỔI BẬT: số token lưu hành thấp, giá theo đơn vị có thể biến động mạnh khi lệnh dồn vào một phía.'
    : 'Số token lưu hành không thuộc nhóm thấp theo ngưỡng hiển thị.';
  $('#supply-profile-note').textContent = `${lowSupply} ${profile.caveat || ''}`.trim();
  const updated = profile.sourceUpdatedAt
    ? new Date(profile.sourceUpdatedAt).toLocaleString('vi-VN')
    : 'không rõ thời điểm';
  const ambiguity = Number(profile.ambiguousMatches) > 0
    ? ` · đã chọn market cap lớn nhất trong ${Number(profile.ambiguousMatches) + 1} mã trùng symbol`
    : '';
  $('#supply-profile-source').textContent = `Nguồn: ${profile.source || 'CoinGecko'} · cập nhật ${updated}${ambiguity} · OBSERVE ONLY`;
}

function render(data) {
  activeData = data;
  const market = data.market;
  const recommendation = data.recommendation;
  const biasClass = String(data.trend.bias).toLowerCase();
  $('#symbol').textContent = data.symbol;
  $('#bias-badge').textContent = data.trend.bias;
  $('#bias-badge').className = `bias-badge ${biasClass}`;
  $('#mark-price').textContent = price(market.markPrice);
  $('#ladder-price').textContent = price(market.markPrice);
  $('#change-24h').textContent = pct(market.change24hPct, true);
  $('#change-24h').className = market.change24hPct >= 0 ? 'positive' : 'negative';
  const staleBinance = data?.freshness?.binance === 'STALE_LAST_GOOD';
  const partialFailures = Array.isArray(data?.freshness?.partialFailures) ? data.freshness.partialFailures.join('; ') : '';
  showCoinBinanceIssue(data.symbol, staleBinance ? data.freshness?.fallbackReason || 'không rõ nguyên nhân' : partialFailures, staleBinance);
  $('#updated-at').textContent = `Cập nhật ${new Date(data.generatedAt).toLocaleString('vi-VN')} · ${data.version}${staleBinance ? ' · BINANCE STALE' : ''}`;
  const encodedSymbol = encodeURIComponent(data.symbol);
  const encodedCoin = encodeURIComponent(data.symbol.replace(/USDT$/, ''));
  const binanceUrl = `https://www.binance.com/en/futures/${encodedSymbol}`;
  const coinglassModel3Url = `https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3?coin=${encodedCoin}`;
  $('#binance-link').href = binanceUrl;
  $('#binance-link').title = `Mở Binance Futures ${data.symbol}`;
  $('#coinglass-model3-link').href = coinglassModel3Url;
  $('#coinglass-model3-link').title = `Mở CoinGlass Model 3 cho ${data.symbol.replace(/USDT$/, '')}`;
  $('#coinglass-link').href = coinglassModel3Url;
  $('#coinglass-link').title = `Mở CoinGlass Model 3 cho ${data.symbol.replace(/USDT$/, '')}`;
  $('#range-24h').textContent = `${price(market.low24h)} – ${price(market.high24h)}`;
  $('#range-pct').textContent = pct(market.range24hPct);
  $('#funding').textContent = pct(market.fundingRatePct, true);
  $('#volume').textContent = compact(market.quoteVolume24h, ' USDT');
  renderSupplyProfile(data.supplyProfile);

  const decision = $('#decision');
  decision.className = `decision panel ${biasClass}`;
  $('#decision-title').textContent = recommendation.headline;
  $('#context-chip').textContent = recommendation.context.replaceAll('_', ' ');
  $('#trend-score').textContent = `TREND SCORE ${recommendation.trendScore}`;
  const confirmation = recommendation.confirmation ?? {};
  const confirmationState = recommendation.context === 'AT_SUPPORT'
    ? confirmation.breakdown
    : recommendation.context === 'AT_RESISTANCE' ? confirmation.breakout : 'WAITING';
  const confirmationChip = $('#confirmation-chip');
  confirmationChip.textContent = confirmationState === 'CONFIRMED_15M'
    ? '15M ĐÃ XÁC NHẬN'
    : confirmationState === 'EARLY_5M_ONLY' ? 'CHỈ MỚI 5M · CHỜ 15M' : '15M ĐANG CHỜ';
  confirmationChip.className = confirmationState === 'CONFIRMED_15M'
    ? 'confirmed'
    : confirmationState === 'EARLY_5M_ONLY' ? 'early' : 'waiting';
  $('#warnings').innerHTML = recommendation.warnings.map((warning) => `<div>⚠ ${warning}</div>`).join('');
  renderZones('#supports', data.zones.supports);
  renderZones('#resistances', data.zones.resistances);
  renderPlan('long', recommendation.longPlan);
  renderPlan('short', recommendation.shortPlan);
  renderEntryPreview(data);
  renderLiqScan(data.liqScan);
  renderLiqScanShort(data.liqScan?.sweepRejectShort);
  renderHorizonAnalysis(data.horizonAnalysis);
  renderCoinGlass(
    data.coinglass,
    recommendation.secondRejectionShort,
    recommendation.secondRejectionLong,
  );
  renderFrames(data.trend.frames);
  renderCandles(data.currentCandles);
  result.hidden = false;
  if (lastLiveMark?.symbol === data.symbol && Date.now() - lastLiveMark.eventAt <= 15_000) {
    applyLiveMark(lastLiveMark);
  }
}

async function search(symbol, { quiet = false, triggerCoinGlass = false, pollId = null } = {}) {
  const normalized = normalizeInput(symbol);
  if (!validUsdtSymbol(normalized)) {
    status.textContent = 'Mã coin không hợp lệ.';
    status.className = 'status error';
    return;
  }
  const requestId = ++requestSequence;
  if (!quiet) activeSymbol = normalized;
  activeController?.abort();
  activeController = new AbortController();
  searchInFlight = true;
  button.disabled = true;
  if (!quiet) {
    status.textContent = triggerCoinGlass
      ? `Đang phân tích ${normalized} và xếp lịch cào CoinGlass 48h/12h/24h…`
      : `Đang phân tích ${normalized} trên 5m, 15m, 1h và 4h…`;
    status.className = 'status';
  }
  try {
    const crawlPromise = triggerCoinGlass
      ? requestCoinGlassCrawl(normalized).catch((error) => ({ error: error.message }))
      : Promise.resolve(null);
    const response = await fetch(`/api/coin-level-analysis?symbol=${encodeURIComponent(normalized)}`, {
      signal: activeController.signal,
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    const crawl = await crawlPromise;
    if (requestId !== requestSequence) return;
    activeSymbol = data.symbol;
    input.value = data.symbol.replace(/USDT$/, '');
    history.replaceState(null, '', `/coin-level-analysis?symbol=${encodeURIComponent(data.symbol)}`);
    render(data);
    connectLiveSocket(data.symbol);
    const staleBinance = data?.freshness?.binance === 'STALE_LAST_GOOD';
    if (staleBinance) {
      status.textContent = `${data.symbol}: Binance live tạm lỗi; đang giữ kết quả gần nhất (${data.freshness?.fallbackReason ?? 'upstream unavailable'}).`;
      status.className = 'status error';
      if (triggerCoinGlass) pollCoinGlass(data.symbol, pollId).catch(() => {});
    } else if (triggerCoinGlass && crawl?.error) {
      status.textContent = `${data.symbol}: Binance đã cập nhật; chưa tạo được job CoinGlass — ${crawl.error}`;
      status.className = 'status error';
    } else if (triggerCoinGlass && hasCoinGlassFrames(data) && crawl?.reason === 'fresh_cache') {
      status.textContent = `${data.symbol}: dùng snapshot CoinGlass 48h/12h/24h còn mới.`;
      status.className = 'status';
    } else if (triggerCoinGlass) {
      status.textContent = crawl?.reason === 'queued_after_scan'
        ? `${data.symbol}: đang chờ lượt quét Top 40 xong để cào riêng…`
        : `${data.symbol}: đang lấy CoinGlass 48h, 12h và 24h…`;
      status.className = 'status';
      pollCoinGlass(data.symbol, pollId).catch(() => {});
    } else {
      status.textContent = `${data.symbol}: đã cập nhật · trang này không gửi lệnh Binance.`;
      status.className = 'status';
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (requestId !== requestSequence) return;
    showCoinBinanceIssue(normalized, error.message);
    status.textContent = `Không phân tích được: ${error.message}`;
    status.className = 'status error';
  } finally {
    if (requestId === requestSequence) {
      searchInFlight = false;
      button.disabled = false;
    }
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const pollId = ++coinglassPollSequence;
  search(input.value, { triggerCoinGlass: true, pollId });
});

const initial = new URLSearchParams(location.search).get('symbol') || 'CYS';
let binanceBlockLoading = false;
async function refreshBinanceBlockStatus() {
  const panel = $('#binance-block-panel'), title = $('#binance-block-title');
  const badge = $('#binance-block-badge'), details = $('#binance-block-details');
  const updated = $('#binance-block-updated');
  if (!panel || !title || !badge || !details || !updated || binanceBlockLoading) return;
  binanceBlockLoading = true;
  try {
    const base = location.protocol === 'file:' ? 'http://127.0.0.1:19082' : '';
    const response = await fetch(`${base}/api/binance-rate-gate`, { signal: AbortSignal.timeout(8_000), cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const status = buildCoinLevelBinanceBlockStatus(await response.json());
    panel.className = `panel binance-block-panel ${status.state.toLowerCase()}`;
    title.textContent = status.state === 'BLOCKED' ? 'Binance REST đang bị chặn'
      : status.state === 'CONGESTED' ? 'REST đang nghẽn hàng đợi'
        : status.state === 'CLEAR' ? 'Không ghi nhận Binance đang chặn' : 'Chưa xác định được trạng thái Binance';
    badge.textContent = status.state === 'BLOCKED' ? 'ĐANG CHẶN'
      : status.state === 'CONGESTED' ? 'NGHẼN NỘI BỘ'
        : status.state === 'CLEAR' ? 'KHÔNG CÓ BLOCK' : 'CHƯA RÕ';
    const lines = status.blocks.map((block) => {
      const type = block.type === 'AUTH' ? 'Xác thực / quyền (-2015)'
        : block.type === 'HTTP_418' ? 'HTTP 418 · Binance tạm cấm IP'
          : block.type === 'HTTP_429' ? 'HTTP 429 · vượt rate limit' : 'REST block';
      const until = new Date(block.until).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
      const remain = Math.max(0, Math.ceil((block.until - Date.now()) / 1_000));
      const probe = block.nextProbeAt ? ` · thử lại lúc ${new Date(block.nextProbeAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false })}` : '';
      return `${block.scope} · ${type}: ${block.reason}${block.source ? ` · nguồn ${block.source}` : ''} · dự kiến hết chặn ${until} (VN), còn ${remain}s${probe}`;
    });
    if (!lines.length && status.queues.length) {
      lines.push(...status.queues.map((queue) => `${queue.scope}: ${queue.queued}/${queue.highWatermark ?? '—'} yêu cầu đang chờ; đây là nghẽn nội bộ, không phải Binance trả mã chặn.`));
    }
    if (!lines.length) lines.push(status.state === 'CLEAR'
      ? 'Rate gate hiện không có 418/429 hoặc chặn xác thực -2015 còn hiệu lực. Nếu một lệnh riêng lỗi, hãy xem mã lỗi của chính lệnh đó.'
      : 'Endpoint chưa cung cấp đủ dữ liệu để kết luận có bị chặn hay không.');
    details.replaceChildren(...lines.map((line) => {
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      return paragraph;
    }));
    updated.textContent = `Kiểm tra lúc ${new Date(status.checkedAt ?? Date.now()).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false })} (VN) · tự cập nhật mỗi 10 giây.`;
  } catch (error) {
    panel.className = 'panel binance-block-panel unknown';
    title.textContent = 'Chưa kiểm tra được trạng thái Binance';
    badge.textContent = 'CHƯA RÕ';
    details.textContent = `Không đọc được rate gate (${String(error?.message ?? 'lỗi kết nối')}); không kết luận Binance đang chặn.`;
    updated.textContent = 'Sẽ tự thử lại sau 10 giây.';
  } finally { binanceBlockLoading = false; }
}
refreshBinanceBlockStatus();
setInterval(() => { if (!document.hidden) refreshBinanceBlockStatus(); }, 10_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBinanceBlockStatus(); });
let entryWatchLoading = false;
function renderCoinLevelMarketRegime(regime = {}) {
  const panel = $('#market-regime-panel');
  if (!panel) return;
  const state = ['RISK_OFF', 'RECOVERY_TEST', 'RISK_ON', 'WAIT_DATA'].includes(regime.state)
    ? regime.state : 'WAIT_DATA';
  const className = state.toLowerCase().replace('_', '-');
  panel.className = `panel market-regime-panel ${className}`;
  const titles = {
    RISK_OFF: 'RISK-OFF · CHẶN LONG COIN LEVEL MỚI',
    RECOVERY_TEST: 'RECOVERY TEST · LONG CHỈ QUAN SÁT',
    RISK_ON: 'RISK-ON · CHO PHÉP XÉT LONG MỚI',
    WAIT_DATA: 'WAIT DATA · FAIL-CLOSED LONG MỚI',
  };
  $('#market-regime-title').textContent = titles[state];
  $('#market-regime-badge').textContent = state.replace('_', ' ');
  $('#market-regime-summary').textContent = state === 'RISK_ON'
    ? 'Market regime đã giữ đủ điều kiện; Coin Level LONG mới vẫn phải qua toàn bộ rule nến, route và Binance hiện hữu.'
    : state === 'RISK_OFF'
      ? 'Thị trường đang bất lợi cho LONG; tín hiệu vẫn hiển thị/Discord nhưng executor không submit LONG mới.'
      : state === 'RECOVERY_TEST'
        ? 'Thị trường đang thử hồi nhưng chưa giữ đủ 15 phút hoặc chưa yên DUMP đủ 30 phút; LONG chỉ quan sát.'
        : 'Breadth socket chưa đủ/fresh; LONG mới bị chặn an toàn.';
  const metrics = regime.metrics ?? {};
  $('#market-regime-context').textContent = `${metrics.context15m ?? 'UNKNOWN'} / ${metrics.context30m ?? 'UNKNOWN'}`;
  const up = Number(metrics.upCount);
  const down = Number(metrics.downCount);
  const ratio = Number.isFinite(up) && Number.isFinite(down) ? up / Math.max(1, down) : null;
  $('#market-regime-breadth').textContent = Number.isFinite(ratio)
    ? `${up} / ${down} · ${ratio.toFixed(2)}×`
    : '— / —';
  const taker = Number(metrics.takerBuyRatio);
  $('#market-regime-taker').textContent = Number.isFinite(taker) ? `${(taker * 100).toFixed(1)}%` : '—';
  const minutes = (value) => Math.max(0, Math.ceil(Number(value ?? 0) / 60_000));
  const timer = state === 'RISK_ON'
    ? 'ĐÃ MỞ LONG MỚI'
    : state === 'WAIT_DATA'
      ? 'CHỜ BREADTH FRESH'
      : `Ổn định ${minutes(regime.riskOnRemainingMs)}p · yên DUMP ${minutes(regime.dumpQuietRemainingMs)}p`;
  $('#market-regime-timer').textContent = timer;
  const reasons = Array.isArray(regime.reasons) ? regime.reasons : [];
  $('#market-regime-reasons').innerHTML = reasons.map((reason) => `<p>⚠ ${escapeHtml(reason)}</p>`).join('');
}

function earlyLongDisplayPattern(item = {}) {
  const gap = item.breakoutGapPct == null || item.breakoutGapPct === ''
    ? null : Number(item.breakoutGapPct);
  const volumeRatio = Number(item.volumeRatio);
  const takerBuyPct = Number(item.takerBuyPct);
  const frame15m = item.frameStates?.['15m'];
  const frame1h = item.frameStates?.['1h'];
  const higherLowPoints = Number(item.scoreComponents?.higherLows);
  if (gap != null && Number.isFinite(gap) && gap <= 0.35) {
    return { key: 'breakout', label: 'SÁT MỐC PHÁ', title: 'Giá còn cách mốc phá tối đa 0,35% hoặc vừa vượt nhẹ.' };
  }
  if ((Number.isFinite(volumeRatio) && volumeRatio >= 2)
    || (Number.isFinite(takerBuyPct) && takerBuyPct >= 60)) {
    return { key: 'flow', label: 'DÒNG TIỀN MẠNH', title: 'Volume ≥2× hoặc taker mua ≥60%.' };
  }
  if (frame15m === 'UP' && frame1h === 'UP') {
    return { key: 'mtf', label: 'ĐỒNG THUẬN MTF', title: 'Cả 15m và 1h đang UP.' };
  }
  if (Number.isFinite(higherLowPoints) && higherLowPoints >= 10) {
    return { key: 'higher-low', label: 'ĐÁY NÂNG', title: 'Ba đáy 5m gần nhất tạo cấu trúc nâng.' };
  }
  return { key: 'pressure', label: 'ÁP LỰC TĂNG', title: 'Đủ tổng điểm nhờ nhiều thành phần nhưng chưa thuộc mẫu nổi trội khác.' };
}

function earlyShortDisplayPattern(item = {}) {
  const breakdownGapPct = item.breakdownGapPct == null || item.breakdownGapPct === ''
    ? null : Number(item.breakdownGapPct);
  const volumeRatio = Number(item.volumeRatio);
  const takerSellPct = Number(item.takerSellPct);
  const frame15m = item.frameStates?.['15m'];
  const frame1h = item.frameStates?.['1h'];
  const softMisses = Array.isArray(item.softMisses) ? item.softMisses : null;
  const hasLowerHigh = softMisses
    ? !softMisses.includes('LOWER_HIGH_MISSING')
    : Number(item.scoreComponents?.rejection) >= 6;
  if (item.setupMode === 'BREAKDOWN_PRESSURE'
    && breakdownGapPct != null && Number.isFinite(breakdownGapPct)
    && Math.abs(breakdownGapPct) <= 0.35) {
    return { key: 'trigger', label: 'SÁT MỐC PHÁ ĐÁY', title: 'Giá cách đáy kích hoạt tối đa 0,35% theo hai phía.' };
  }
  if ((Number.isFinite(volumeRatio) && volumeRatio >= 2)
    || (Number.isFinite(takerSellPct) && takerSellPct >= 60)) {
    return { key: 'flow', label: 'DÒNG TIỀN BÁN MẠNH', title: 'Volume ≥2× hoặc taker bán ≥60%.' };
  }
  if (frame15m === 'DOWN' && frame1h === 'DOWN') {
    return { key: 'mtf', label: 'ĐỒNG THUẬN MTF GIẢM', title: 'Cả 15m và 1h đang DOWN.' };
  }
  if (hasLowerHigh) {
    return { key: 'lower-high', label: 'ĐỈNH THẤP DẦN', title: 'Đỉnh nến 5m mới thấp hơn đỉnh nến trước.' };
  }
  return { key: 'pressure', label: 'ÁP LỰC GIẢM', title: 'Đủ tổng điểm nhờ nhiều thành phần nhưng chưa thuộc mẫu nổi trội khác.' };
}

function observePatternLabel(side, item) {
  return (side === 'LONG' ? earlyLongDisplayPattern(item) : earlyShortDisplayPattern(item)).label;
}

function sortedEarlyObserveWatches(watches, side) {
  return sortCoinLevelObserveWatches(watches, side, earlyObserveSort[side],
    (item) => observePatternLabel(side, item));
}

function updateEarlyObserveSortHeaders(side, table) {
  for (const th of table.querySelectorAll('thead th')) {
    const active = th.dataset.sortKey === earlyObserveSort[side].key;
    const direction = active ? earlyObserveSort[side].direction : null;
    th.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none');
    th.querySelector('.observe-sort-indicator').textContent = direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '↕';
  }
}

function initializeEarlyObserveSort(side, selector, keys) {
  const table = $(selector);
  if (!table) return;
  [...table.querySelectorAll('thead th')].forEach((th, index) => {
    const key = keys[index];
    if (!key) return;
    const label = th.textContent.trim();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'observe-sort-button';
    button.setAttribute('aria-label', `Sắp xếp theo ${label}`);
    button.append(document.createTextNode(label));
    const indicator = document.createElement('span');
    indicator.className = 'observe-sort-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.textContent = '↕';
    button.append(indicator);
    th.dataset.sortKey = key;
    th.replaceChildren(button);
    button.addEventListener('click', () => {
      earlyObserveSort[side] = nextObserveSort(earlyObserveSort[side], key);
      updateEarlyObserveSortHeaders(side, table);
      const tbody = table.tBodies[0];
      const shown = earlyObserveShown[side];
      const rows = [...tbody.rows];
      if (!shown.length || rows.length !== shown.length) return;
      const rowByItem = new Map(shown.map((item, rowIndex) => [item, rows[rowIndex]]));
      const sorted = sortedEarlyObserveWatches(shown, side);
      tbody.append(...sorted.map((item) => rowByItem.get(item)));
      earlyObserveShown[side] = sorted;
    });
  });
  updateEarlyObserveSortHeaders(side, table);
}

const RECENT_BIDIRECTIONAL_WINDOW_MS = 30 * 60_000;
function recentBidirectionalObserveSignals(data = {}) {
  const evaluatedAt = Number(data.generatedAt) || Date.now();
  const cutoff = evaluatedAt - RECENT_BIDIRECTIONAL_WINDOW_MS;
  const bySymbol = new Map();
  const collect = (rows, direction) => {
    for (const item of Array.isArray(rows) ? rows : []) {
      const symbol = String(item?.symbol ?? '').toUpperCase();
      const observedAt = Number(item?.observedAt);
      if (!symbol || !Number.isFinite(observedAt) || observedAt < cutoff || observedAt > evaluatedAt) continue;
      const state = bySymbol.get(symbol) ?? { LONG: null, SHORT: null };
      state[direction] = Math.max(Number(state[direction]) || 0, observedAt);
      bySymbol.set(symbol, state);
    }
  };
  collect(Array.isArray(data.earlyLongHistory) ? data.earlyLongHistory : data.earlyLongWatches, 'LONG');
  collect(Array.isArray(data.earlyShortHistory) ? data.earlyShortHistory : data.earlyShortWatches, 'SHORT');
  for (const item of Array.isArray(data.recentObserveHistory) ? data.recentObserveHistory : []) {
    collect([item], String(item?.side ?? '').toUpperCase());
  }
  collect(data.earlyLongWatches, 'LONG');
  collect(data.earlyShortWatches, 'SHORT');
  return new Map([...bySymbol].filter(([, state]) => (
    Number(state.LONG) > 0
    && Number(state.SHORT) > 0
    && Math.abs(Number(state.LONG) - Number(state.SHORT)) <= RECENT_BIDIRECTIONAL_WINDOW_MS
  )));
}

function recentBidirectionalRowMeta(item = {}, recent = new Map()) {
  const state = recent.get(String(item?.symbol ?? '').toUpperCase());
  if (!state) return { className: '', title: '' };
  const format = (value) => new Date(Number(value)).toLocaleTimeString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', hour12: false,
  });
  return {
    className: 'observe-recent-bidirectional',
    title: `Coin vừa xuất hiện ở cả LONG (${format(state.LONG)}) và SHORT (${format(state.SHORT)}) trong 30 phút.`,
  };
}

function earlyManualOrderControl(item = {}, direction, data = {}) {
  const leverage = Math.max(1, Number(data.binanceExecution?.routes?.[direction]?.leverage) || 5);
  const active = item.liveNow !== false && item.liveState !== 'INVALIDATED';
  const masterEnabled = data.binanceExecution?.masterEnabled === true;
  const regimeAllowed = direction !== 'LONG' || data.marketRegime?.allowLongEntry === true;
  const disabledReason = !active
    ? 'Tín hiệu không còn active'
    : !masterEnabled
      ? 'Khóa tổng Binance đang OFF'
      : !regimeAllowed
        ? `Market Regime ${data.marketRegime?.state ?? 'WAIT_DATA'} chặn LONG`
        : '';
  const disabled = disabledReason ? ' disabled' : '';
  const label = !active
    ? 'HẾT HIỆU LỰC'
    : !masterEnabled
      ? 'BINANCE OFF'
      : !regimeAllowed
        ? 'RISK-OFF'
        : direction === 'LONG' ? 'VÀO LONG' : 'VÀO SHORT';
  return `<span class="early-manual-order" data-symbol="${escapeHtml(item.symbol)}" data-side="${direction}" data-observed-at="${Number(item.observedAt) || 0}"><label><span>SỐ TIỀN (USDT)</span><input class="early-manual-margin" type="number" min="0.01" max="100" step="0.01" value="1" inputmode="decimal" placeholder="USDT" aria-label="Số tiền margin USDT ${escapeHtml(item.symbol)} ${direction}"></label><label><span>ĐÒN BẨY (x)</span><input class="early-manual-leverage" type="number" min="1" max="125" step="1" value="${leverage}" inputmode="numeric" placeholder="x" aria-label="Đòn bẩy ${escapeHtml(item.symbol)} ${direction}"></label><button class="early-manual-submit ${direction.toLowerCase()}" type="button"${disabled} title="${escapeHtml(disabledReason || `Gửi MARKET thật ${direction} ${item.symbol}`)}">${label}</button><small class="early-manual-result ${disabledReason ? 'blocked' : ''}">${escapeHtml(disabledReason || `MARKET · mặc định ${leverage}x`)}</small></span>`;
}

async function submitEarlyManualOrder(button) {
  const control = button.closest('.early-manual-order');
  const resultNode = control?.querySelector('.early-manual-result');
  const marginInput = control?.querySelector('.early-manual-margin');
  const leverageInput = control?.querySelector('.early-manual-leverage');
  if (!control || !resultNode || !marginInput || !leverageInput) return;
  const symbol = control.dataset.symbol;
  const side = control.dataset.side;
  const observedAt = Number(control.dataset.observedAt);
  const marginUsdt = Number(marginInput.value);
  const leverage = Number(leverageInput.value);
  if (!(marginUsdt >= 0.01) || marginUsdt > 100) {
    resultNode.textContent = 'Margin phải từ 0.01–100 USDT.';
    resultNode.className = 'early-manual-result error';
    return;
  }
  if (!Number.isInteger(leverage) || leverage < 1 || leverage > 125) {
    resultNode.textContent = 'Đòn bẩy phải là số nguyên từ 1–125x.';
    resultNode.className = 'early-manual-result error';
    return;
  }
  const token = localStorage.getItem('orders_token') ?? '';
  if (!token) {
    resultNode.textContent = 'Chưa đăng nhập Orders.';
    resultNode.className = 'early-manual-result error';
    return;
  }
  const confirmed = window.confirm(
    `GỬI LỆNH THẬT BINANCE MARKET ${side} ${symbol}?\n`
    + `Margin ${marginUsdt} USDT · đòn bẩy ${leverage}x · notional ${Number((marginUsdt * leverage).toFixed(8))} USDT.\n`
    + 'Đây là tín hiệu quan sát sớm, chưa phải xác nhận breakout/breakdown hoàn chỉnh.',
  );
  if (!confirmed) return;
  button.disabled = true;
  marginInput.disabled = true;
  leverageInput.disabled = true;
  resultNode.textContent = 'Đang kiểm tra và gửi Binance…';
  resultNode.className = 'early-manual-result pending';
  let submitted = false;
  try {
    const base = location.protocol === 'file:' ? 'http://127.0.0.1:19082' : '';
    const response = await fetch(`${base}/api/coin-level-observe-manual-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-orders-token': token },
      body: JSON.stringify({ symbol, side, observedAt, marginUsdt, leverage }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) localStorage.removeItem('orders_token');
      throw new Error(payload.error ?? `HTTP ${response.status}`);
    }
    submitted = true;
    button.textContent = 'ĐÃ GỬI';
    resultNode.textContent = `Đã gửi #${payload.orderId ?? payload.clientOrderId ?? '—'} · ${payload.marginUsdt} USDT x${payload.leverage}`;
    resultNode.className = 'early-manual-result success';
  } catch (error) {
    resultNode.textContent = error.message;
    resultNode.className = 'early-manual-result error';
  } finally {
    if (!submitted) {
      button.disabled = false;
      marginInput.disabled = false;
      leverageInput.disabled = false;
    }
  }
}

async function refreshEntryWatch() {
  const health = $('#entry-watch-health'), rows = $('#entry-watch-rows');
  const earlyLongHealth = $('#early-long-health'), earlyLongRows = $('#early-long-rows');
  const earlyLongDiagnostics = $('#early-long-diagnostics');
  const earlyHealth = $('#early-short-health'), earlyRows = $('#early-short-rows');
  const earlyShortDiagnostics = $('#early-short-diagnostics');
  if (!health || !rows || entryWatchLoading) return;
  entryWatchLoading = true;
  try {
    const base = location.protocol === 'file:' ? 'http://127.0.0.1:19082' : '';
    const includeHistory = showEarlyLongHistory || showEarlyShortHistory;
    const response = await fetch(`${base}/api/coin-level-entry-watch${includeHistory ? '?history=1' : ''}`, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 404 ? 'restart-required' : 'unavailable');
    const data = await response.json();
    const recentBidirectional = recentBidirectionalObserveSignals(data);
    renderCoinLevelMarketRegime(data.marketRegime);
    const at = new Date(data.generatedAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
    const longRoute = data.binanceExecution?.routes?.LONG;
    const shortRoute = data.binanceExecution?.routes?.SHORT;
    const routeText = longRoute?.enabled && shortRoute?.enabled
      ? `Binance LONG/SHORT ON · ${longRoute.marginUsdt} USDT ×${longRoute.leverage}`
      : `Binance LONG ${longRoute?.enabled ? 'ON' : 'OFF'} / SHORT ${shortRoute?.enabled ? 'ON' : 'OFF'}`;
    health.textContent = `Đã kiểm tra ${data.covered}/${data.universe} coin có đủ nến 5m/15m/1h/4h còn mới · ${data.totalCandidates} ứng viên · ${routeText} · Regime LONG ${data.marketRegime?.state ?? 'WAIT_DATA'} · LIMIT 3 USDT nếu giá đã qua entry, MARKET theo route sau retest · Discord ${data.discordConfigured ? 'đã cấu hình' : 'chưa cấu hình'} · cập nhật ${at} (VN). Entry Score và T1/T2/T3 chỉ đánh giá.`;
    if (earlyLongHealth && earlyLongRows) {
      if (!Array.isArray(data.earlyLongWatches)) {
        earlyLongHealth.textContent = 'Dịch vụ đang chạy chưa nạp logic LONG sớm; chờ lần nạp server an toàn.';
        earlyLongRows.innerHTML = '<tr><td colspan="13">Chưa có dữ liệu LONG sớm từ server; không coi đây là kết quả quét rỗng.</td></tr>';
        earlyObserveShown.LONG = [];
      } else {
        const liveWatches = data.earlyLongWatches;
        const historyWatches = Array.isArray(data.earlyLongHistory) ? data.earlyLongHistory : liveWatches;
        const currentWatches = Array.isArray(data.earlyLongHistory)
          ? historyWatches.filter((item) => item.liveNow !== false)
          : liveWatches;
        const watches = sortedEarlyObserveWatches(showEarlyLongHistory ? historyWatches : currentWatches, 'LONG');
        earlyObserveShown.LONG = watches;
        earlyLongHealth.textContent = `${currentWatches.length} coin đang đạt · ${data.totalEarlyLongHistory ?? historyWatches.length} tín hiệu lưu trong ngày (VN)${showEarlyLongHistory ? ' · đang hiện cả lịch sử' : ' · mặc định chỉ hiện đang đạt'} · ${recentBidirectional.size} coin vừa có cả LONG + SHORT trong 30 phút (nền hai màu) · tự cập nhật lúc ${at}. Discord quan sát ${data.observeDiscordConfigured ? 'ON' : 'OFF'}; không tự gửi Binance, nút MARKET thủ công cần tín hiệu active và chưa phải breakout 15m xác nhận.`;
        if (earlyLongDiagnostics) {
          const labels = {
            INVALID_SYMBOL: 'mã coin lỗi', MISSING_5M_DATA: 'thiếu 5m', MISSING_15M_DATA: 'thiếu 15m',
            MISSING_1H_DATA: 'thiếu 1h', STALE_5M: '5m cũ/chưa đóng',
            INVALID_PRICE_OR_INDICATOR: 'giá/EMA/ATR lỗi', TREND_15M_DOWN: '15m DOWN',
            TREND_1H_DOWN: '1h DOWN', TREND_ALIGNMENT_WEAK: '15m/1h chưa đồng thuận', FAR_FROM_BREAKOUT: 'xa mốc phá',
            EMA_MOMENTUM_WEAK: 'EMA/nến yếu', FLOW_WEAK: 'volume/taker yếu',
            OVEREXTENDED: 'nến quá giãn', SCORE_BELOW_THRESHOLD: 'dưới ngưỡng điểm',
          };
          const diagnostics = data.earlyLongDiagnostics ?? {};
          const reasons = Object.entries(diagnostics.excludedByReason ?? {})
            .sort((left, right) => Number(right[1]) - Number(left[1]))
            .map(([key, count]) => `${labels[key] ?? key}: ${count}`);
          earlyLongDiagnostics.textContent = `Phủ LONG sớm 3 khung: ${diagnostics.covered3tf ?? 0}/${diagnostics.evaluated ?? data.universe}; ngưỡng ${diagnostics.minScore ?? 65}/100; bị ẩn vì đã xác nhận LONG: ${diagnostics.hiddenConfirmed ?? 0}. Lý do loại${diagnostics.reasonCountsAreNonExclusive ? ' (có thể trùng)' : ''}: ${reasons.join(' · ') || 'không có'}.`;
        }
        earlyLongRows.innerHTML = watches.map((item) => {
          const time = new Date(item.observedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
          const zone = `${price(item.entryZone?.low)} – ${price(item.entryZone?.high)}`;
          const earlyScore = Number.isFinite(Number(item.earlyScore)) ? Number(item.earlyScore).toFixed(1) : '—';
          const liveState = item.liveState === 'INVALIDATED'
            ? 'GIÁ LIVE ĐÃ VÔ HIỆU'
            : item.liveNow === false ? 'Lịch sử hôm nay' : 'Nến đóng còn đạt';
          const liveClass = item.liveState === 'INVALIDATED' ? 'observe-live-invalidated' : '';
          const liveMove = Number(item.liveMovePct);
          const livePrice = Number(item.livePrice);
          const livePriceText = livePrice > 0
            ? `<small class="observe-live-price">Live ${price(livePrice)} · ${liveMove >= 0 ? '+' : ''}${liveMove.toFixed(2)}%</small>`
            : '<small class="observe-live-price">Live: đang chờ socket</small>';
          const gap = Number(item.breakoutGapPct);
          const gapText = gap >= 0 ? `Còn ${gap.toFixed(2)}%` : `Đã vượt ${Math.abs(gap).toFixed(2)}%`;
          const pattern = earlyLongDisplayPattern(item);
          const bidirectional = recentBidirectionalRowMeta(item, recentBidirectional);
          return `<tr class="early-long-pattern-${pattern.key} ${liveClass} ${bidirectional.className}" title="${escapeHtml(bidirectional.title)}"><td><div class="early-coin-order-head"><a href="/coin-level-analysis?symbol=${encodeURIComponent(item.symbol)}">${escapeHtml(item.symbol)}</a>${earlyManualOrderControl(item, 'LONG', data)}</div><small>${liveState}</small></td><td><span class="early-long-pattern-badge ${pattern.key}" title="${escapeHtml(pattern.title)}">${pattern.label}</span></td><td>${price(item.priceAtWatch)}${livePriceText}</td><td>${gapText}</td><td>${Number.isFinite(Number(item.volumeRatio)) ? `${Number(item.volumeRatio).toFixed(2)}×` : '—'}</td>${earlyObserveQuoteVolumeCell(item)}<td>${Number.isFinite(Number(item.takerBuyPct)) ? `${Number(item.takerBuyPct).toFixed(1)}%` : '—'}</td><td><strong>${earlyScore}/100</strong><small>Ngưỡng ${data.earlyLongDiagnostics?.minScore ?? 65}</small></td><td>${Number.isFinite(Number(item.rangeAtr)) ? `${Number(item.rangeAtr).toFixed(2)}×` : '—'}</td><td>${price(item.breakoutLevel)}</td><td>${zone}<small>Chờ phá + retest giữ</small></td><td>${price(item.invalidationPrice)}</td><td>${escapeHtml(time)}</td></tr>`;
        }).join('') || `<tr><td colspan="13">${showEarlyLongHistory ? 'Hôm nay chưa có tín hiệu LONG sớm trong lịch sử.' : 'Hiện không có coin LONG sớm nào còn đang đạt.'}</td></tr>`;
      }
    }
    if (earlyHealth && earlyRows) {
      if (!Array.isArray(data.earlyShortWatches)) {
        earlyHealth.textContent = 'Dịch vụ đang chạy chưa nạp logic SHORT sớm; chờ nạp lại an toàn sau khi xử lý lệnh LIMIT đang mở.';
        earlyRows.innerHTML = '<tr><td colspan="13">Chưa có dữ liệu SHORT sớm từ server; không coi đây là kết quả quét rỗng.</td></tr>';
        earlyObserveShown.SHORT = [];
      } else {
        const liveWatches = data.earlyShortWatches;
        const historyWatches = Array.isArray(data.earlyShortHistory) ? data.earlyShortHistory : liveWatches;
        const currentWatches = Array.isArray(data.earlyShortHistory)
          ? historyWatches.filter((item) => item.liveNow !== false)
          : liveWatches;
        const watches = sortedEarlyObserveWatches(showEarlyShortHistory ? historyWatches : currentWatches, 'SHORT');
        earlyObserveShown.SHORT = watches;
        earlyHealth.textContent = `${currentWatches.length} coin đang đạt · ${data.totalEarlyShortHistory ?? historyWatches.length} tín hiệu lưu trong ngày (VN)${showEarlyShortHistory ? ' · đang hiện cả lịch sử' : ' · mặc định chỉ hiện đang đạt'} · ${recentBidirectional.size} coin vừa có cả LONG + SHORT trong 30 phút (nền hai màu) · tự cập nhật lúc ${at}. Discord quan sát ${data.observeDiscordConfigured ? 'ON' : 'OFF'}; không tự gửi Binance, nút MARKET thủ công cần tín hiệu active và chưa phải breakdown 15m xác nhận.`;
        if (earlyShortDiagnostics) {
          const labels = {
            INVALID_SYMBOL: 'mã coin lỗi', MISSING_5M_DATA: 'thiếu 5m', MISSING_15M_DATA: 'thiếu 15m',
            MISSING_1H_DATA: 'thiếu 1h', STALE_5M: '5m cũ/chưa đóng',
            INVALID_PRICE_OR_INDICATOR: 'giá/EMA/ATR lỗi', SETUP_CONTEXT_WEAK: 'thiếu bối cảnh xả/breakdown',
            FAR_FROM_TRIGGER: 'xa vùng kích hoạt', EMA_MOMENTUM_WEAK: 'EMA/nến giảm yếu',
            REJECTION_WEAK: 'thiếu reject/phá hỗ trợ', FLOW_WEAK: 'volume/taker bán yếu',
            OVEREXTENDED: 'nến quá giãn', SCORE_BELOW_THRESHOLD: 'dưới ngưỡng điểm',
          };
          const diagnostics = data.earlyShortDiagnostics ?? {};
          const reasons = Object.entries(diagnostics.excludedByReason ?? {})
            .sort((left, right) => Number(right[1]) - Number(left[1]))
            .map(([key, count]) => `${labels[key] ?? key}: ${count}`);
          earlyShortDiagnostics.textContent = `Phủ SHORT sớm 3 khung: ${diagnostics.covered3tf ?? 0}/${diagnostics.evaluated ?? data.universe}; ngưỡng ${diagnostics.minScore ?? 65}/100; bị ẩn vì đã xác nhận SHORT: ${diagnostics.hiddenConfirmed ?? 0}. Lý do loại${diagnostics.reasonCountsAreNonExclusive ? ' (có thể trùng)' : ''}: ${reasons.join(' · ') || 'không có'}.`;
        }
        earlyRows.innerHTML = watches.map((item) => {
          const time = new Date(item.observedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
          const zone = `${price(item.entryZone?.low)} – ${price(item.entryZone?.high)}`;
          const earlyScore = Number.isFinite(Number(item.earlyScore)) ? Number(item.earlyScore).toFixed(1) : '—';
          const liveState = item.liveState === 'INVALIDATED'
            ? 'GIÁ LIVE ĐÃ VÔ HIỆU'
            : item.liveNow === false ? 'Lịch sử hôm nay' : 'Nến đóng còn đạt';
          const liveClass = item.liveState === 'INVALIDATED' ? 'observe-live-invalidated' : '';
          const liveMove = Number(item.liveMovePct);
          const livePrice = Number(item.livePrice);
          const livePriceText = livePrice > 0
            ? `<small class="observe-live-price">Live ${price(livePrice)} · ${liveMove >= 0 ? '+' : ''}${liveMove.toFixed(2)}%</small>`
            : '<small class="observe-live-price">Live: đang chờ socket</small>';
          const breakdown = item.setupMode === 'BREAKDOWN_PRESSURE';
          const setup = breakdown ? 'BREAKDOWN' : 'XẢ SAU BƠM';
          const pattern = earlyShortDisplayPattern(item);
          const position = breakdown
            ? `Đáy ${price(item.breakdownLevel)}<small>Lệch ${Number(item.breakdownGapPct).toFixed(2)}%</small>`
            : `+${Number(item.pumpPct).toFixed(2)}%<small>Rời đỉnh −${Number(item.pullbackPct).toFixed(2)}%</small>`;
          const bidirectional = recentBidirectionalRowMeta(item, recentBidirectional);
          return `<tr class="early-short-pattern-${pattern.key} ${liveClass} ${bidirectional.className}" title="${escapeHtml(bidirectional.title)}"><td><div class="early-coin-order-head"><a href="/coin-level-analysis?symbol=${encodeURIComponent(item.symbol)}">${escapeHtml(item.symbol)}</a>${earlyManualOrderControl(item, 'SHORT', data)}</div><small>${liveState}</small></td><td><strong>${setup}</strong></td><td><span class="early-short-pattern-badge ${pattern.key}" title="${escapeHtml(pattern.title)}">${pattern.label}</span></td><td>${price(item.priceAtWatch)}${livePriceText}</td><td>${position}</td><td>${Number.isFinite(Number(item.volumeRatio)) ? `${Number(item.volumeRatio).toFixed(2)}×` : '—'}</td>${earlyObserveQuoteVolumeCell(item)}<td>${Number.isFinite(Number(item.takerSellPct)) ? `${Number(item.takerSellPct).toFixed(1)}%` : '—'}</td><td><strong>${earlyScore}/100</strong><small>Ngưỡng ${data.earlyShortDiagnostics?.minScore ?? 65}</small></td><td>${Number.isFinite(Number(item.rangeAtr)) ? `${Number(item.rangeAtr).toFixed(2)}×` : '—'}</td><td>${zone}<small>${breakdown ? 'Chờ retest không lấy lại' : 'Chờ hồi + reject 5m'}</small></td><td>${price(item.invalidationPrice)}</td><td>${escapeHtml(time)}</td></tr>`;
        }).join('') || `<tr><td colspan="13">${showEarlyShortHistory ? 'Hôm nay chưa có tín hiệu SHORT sớm trong lịch sử.' : 'Hiện không có coin SHORT sớm nào còn đang đạt; không suy ra thị trường an toàn để SHORT.'}</td></tr>`;
      }
    }
    rows.innerHTML = sortCoinLevelEntryWatchForDisplay(data.candidates).map((item) => {
      const side = item.side === 'LONG' ? 'LONG' : 'SHORT';
      const stage = item.retestAt ? '15m + retest 5m đạt · xét MARKET' : '15m đạt · có thể xét LIMIT';
      const time = new Date(item.confirmationAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
      const entry = Number(item.entryPrice) > 0
        ? `<strong>${price(item.entryPrice)}</strong><small>${price(item.entryZone?.low)} – ${price(item.entryZone?.high)}</small>`
        : '<strong>—</strong><small>Chờ vùng retest</small>';
      const score = Number(item.entryScore);
      const scoreClass = ['VERY_STRONG', 'GOOD', 'WATCH', 'WEAK'].includes(item.entryTier)
        ? item.entryTier.toLowerCase().replace('_', '-') : 'unknown';
      const components = item.entryScoreComponents ?? {};
      const scoreTitle = `Trend ${components.trend ?? '—'}/25 · breakout ${components.breakout ?? '—'}/20 · retest ${components.retest ?? '—'}/25 · flow ${components.flow ?? '—'}/15 · target ${components.targetRoom ?? '—'}/15`;
      const entryScore = Number.isFinite(score)
        ? `<strong>${score.toFixed(1)}</strong><small>${escapeHtml(entryWatchTierDisplayLabel(item))}</small>`
        : '<strong>—</strong><small>JSON cũ</small>';
      const basisLabels = {
        TP_10_ROE_5X: 'TP +10% ROE', ATR15_1X: 'ATR15 ×1',
        ATR_4H_SCENARIO: 'biên ATR 4h', ATR_8H_SCENARIO: 'biên ATR 8h',
        '15M_RANGE': 'đỉnh/đáy 15m', '1H_RANGE': 'đỉnh/đáy 1h', '4H_RANGE': 'đỉnh/đáy 4h',
        '15M_SWING': 'swing 15m', '1H_SWING': 'swing 1h', '4H_SWING': 'swing 4h',
      };
      const targetLines = (item.targetPlan?.targets ?? []).map((target) => {
        const basis = (target.basis ?? []).map((key) => basisLabels[key] ?? key).join(' + ');
        return `<span><b>${escapeHtml(target.label)} ${price(target.price)}</b><small>+${Number(target.movePct).toFixed(2)}% giá · ≈+${Number(target.grossRoePctAt5x).toFixed(1)}% ROE · ${escapeHtml(basis)}</small></span>`;
      }).join('');
      const targets = targetLines || '<span><b>—</b><small>Chưa đủ ATR/cấu trúc</small></span>';
      return `<tr class="entry-watch-${side.toLowerCase()} ${item.retestAt ? 'entry-watch-retested' : ''}"><td><a href="/coin-level-analysis?symbol=${encodeURIComponent(item.symbol)}">${escapeHtml(item.symbol)}</a></td><td>${side}</td><td class="entry-watch-score ${scoreClass}" title="${escapeHtml(scoreTitle)}">${entryScore}</td><td>${Number(item.score).toFixed(2)}</td><td>${stage}</td><td class="entry-watch-price">${entry}</td><td class="entry-watch-targets">${targets}</td><td>${price(item.referenceLevel)}</td><td>${price(item.lastClosed5m)}</td><td>${escapeHtml(time)}</td></tr>`;
    }).join('') || `<tr><td colspan="10">${data.covered ? 'Chưa có coin nào đạt đồng thời điểm xu hướng và nến 15m phá vùng trong dữ liệu đang phủ.' : 'Chưa có coin nào đủ bốn khung nến còn mới trong cache; danh sách sẽ tự cập nhật khi scanner nền nạp dữ liệu.'}</td></tr>`;
  } catch (error) {
    health.textContent = error.message === 'restart-required'
      ? 'API mới chưa có trong tiến trình server đang chạy; cần nạp lại dịch vụ khi an toàn. Không ảnh hưởng bot/lệnh hiện tại.'
      : 'Không lấy được bộ lọc lúc này; danh sách có thể đã cũ. Tự thử lại sau 30 giây.';
    if (earlyHealth) earlyHealth.textContent = 'Không lấy được watch SHORT sớm lúc này; dữ liệu hiển thị có thể đã cũ.';
    if (earlyRows) earlyRows.innerHTML = '<tr><td colspan="13">Chờ lượt quét tiếp theo.</td></tr>';
    earlyObserveShown.SHORT = [];
    if (earlyLongHealth) earlyLongHealth.textContent = 'Không lấy được watch LONG sớm lúc này; dữ liệu hiển thị có thể đã cũ.';
    if (earlyLongDiagnostics) earlyLongDiagnostics.textContent = 'Chưa lấy được thống kê nguyên nhân bị loại.';
    if (earlyShortDiagnostics) earlyShortDiagnostics.textContent = 'Chưa lấy được thống kê nguyên nhân bị loại.';
    if (earlyLongRows) earlyLongRows.innerHTML = '<tr><td colspan="13">Chờ lượt quét tiếp theo.</td></tr>';
    earlyObserveShown.LONG = [];
  } finally { entryWatchLoading = false; }
}
initializeEarlyObserveSort('LONG', '.early-long-panel table', [
  'coin', 'pattern', 'price', 'distance', 'volume', 'volumeUsdt', 'taker', 'score', 'range',
  'trigger', 'zone', 'invalidation', 'time',
]);
initializeEarlyObserveSort('SHORT', '.early-short-panel table', [
  'coin', 'setup', 'pattern', 'price', 'distance', 'volume', 'volumeUsdt', 'taker', 'score',
  'range', 'zone', 'invalidation', 'time',
]);
refreshEntryWatch();
setInterval(() => { if (!document.hidden) refreshEntryWatch(); }, 30_000);
$('#early-long-history-toggle')?.addEventListener('change', (event) => {
  showEarlyLongHistory = event.currentTarget.checked === true;
  refreshEntryWatch();
});
$('#early-short-history-toggle')?.addEventListener('change', (event) => {
  showEarlyShortHistory = event.currentTarget.checked === true;
  refreshEntryWatch();
});
for (const selector of ['#early-long-rows', '#early-short-rows']) {
  $(selector)?.addEventListener('click', (event) => {
    const button = event.target.closest('.early-manual-submit');
    if (button && !button.disabled) submitEarlyManualOrder(button);
  });
}
let squeezeWatchLoading = false;
let showSqueezeHistory = false;
const squeezeSideVisible = { SHORT: true, LONG: true };
let lastSqueezeWatchData = null;

function renderSqueezeWatch(data) {
  const shortRows = $('#squeeze-watch-short-rows'), longRows = $('#squeeze-watch-long-rows');
  if (!shortRows || !longRows) return;
  const now = Date.now(), liveWindowMs = Number(data.liveWindowMs) || 900_000;
  const all = Array.isArray(data.events) ? data.events : [];
  const normalized = all.map(event => {
    const explicitSide = event.squeezeSide === 'LONG' || event.squeezeSide === 'SHORT';
    const ageMs = now - Number(event.at);
    return {...event, squeezeSide:event.squeezeSide === 'LONG' ? 'LONG' : 'SHORT',
      isLegacy:event.isLegacy === true || !explicitSide,
      isLive:event.isLive === true || (event.isLive == null && explicitSide && ageMs >= 0 && ageMs <= liveWindowMs),
      expiresAt:Number(event.expiresAt) || Number(event.at) + liveWindowMs};
  });
  const visible = showSqueezeHistory ? normalized : normalized.filter(event => event.isLive);
  const delivery = { sent:'Đã gửi', rejected:'Discord từ chối', unknown:'Chưa rõ đã gửi' };
  const time = at => at ? new Date(at).toLocaleString('vi-VN', { timeZone:'Asia/Ho_Chi_Minh', hour12:false }) : '—';
  const rowHtml = event => {
    const remainingMs = Math.max(0, Number(event.expiresAt) - now);
    const remaining = Math.max(1, Math.ceil(remainingMs / 60_000));
    const state = event.isLive
      ? `<span class="squeeze-live-badge">LIVE · CÒN ${remaining}P</span>`
      : event.isLegacy ? '<span class="squeeze-legacy-badge">LỊCH SỬ · LEGACY</span>' : '<span class="squeeze-history-badge">LỊCH SỬ</span>';
    const rowClass = `${event.tier === 'RATIO_OI' ? 'squeeze-oi-row' : 'squeeze-ratio-row'}${event.isLive ? '' : ' squeeze-history-row'}`;
    return `<tr class="${rowClass}"><td>${state}</td><td>${escapeHtml(time(Number(event.at) + 1))}</td><td><a href="/coin-level-analysis?symbol=${encodeURIComponent(event.symbol)}">${escapeHtml(event.symbol)}</a></td><td>${event.tier === 'RATIO_OI' ? '🟣 RATIO + OI' : '🟠 RATIO'}</td><td>${price(event.signalPrice)}</td><td>${Number(event.volumeX).toFixed(2)}×</td><td>${Number(event.ratio).toFixed(4)}</td><td>${pct(event.ratioDelta, true)}</td><td>${event.oiDelta == null ? 'Thiếu dữ liệu' : pct(event.oiDelta, true)}</td><td>${escapeHtml(delivery[event.delivery] ?? 'Chưa rõ')}</td></tr>`;
  };
  for (const side of ['SHORT', 'LONG']) {
    const sideEvents = visible.filter(event => event.squeezeSide === side);
    const liveCount = normalized.filter(event => event.squeezeSide === side && event.isLive).length;
    const historyCount = normalized.filter(event => event.squeezeSide === side && !event.isLive).length;
    const rows = side === 'SHORT' ? shortRows : longRows;
    rows.innerHTML = sideEvents.map(rowHtml).join('') || `<tr><td colspan="10">Không có SQUEEZE ${side} ${showSqueezeHistory ? 'trong lịch sử hiện có' : 'đang còn hiệu lực'}.</td></tr>`;
    const count = $(`#squeeze-${side.toLowerCase()}-count`);
    if (count) count.textContent = `${liveCount} LIVE${showSqueezeHistory ? ` · ${historyCount} LỊCH SỬ` : ''}`;
    const lane = $(`#squeeze-${side.toLowerCase()}-lane`);
    if (lane) lane.hidden = !squeezeSideVisible[side];
  }
}

async function refreshSqueezeWatch() {
  const health = $('#squeeze-watch-health');
  if (!health || !$('#squeeze-watch-short-rows') || !$('#squeeze-watch-long-rows') || squeezeWatchLoading) return;
  squeezeWatchLoading = true;
  try {
    const base = location.protocol === 'file:' ? 'http://127.0.0.1:19082' : '';
    const response = await fetch(`${base}/api/squeeze-ratio-watch`, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    if (!response.ok) throw new Error('unavailable');
    const data = await response.json(), h = data.health ?? {};
    lastSqueezeWatchData = data;
    const time = at => at ? new Date(at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : '—';
    const labels = { starting:'Đang khởi động', running:'Đang tự quét', rate_gate_paused:'Tạm chờ giới hạn Binance', scan_error:'Lượt quét lỗi; tự thử lại', not_configured:'Chưa cấu hình Discord' };
    const liveWindowMs = Number(data.liveWindowMs) || 900_000;
    const liveEvents = Array.isArray(data.liveEvents) ? data.liveEvents : (data.events ?? []).filter(event => {
      const ageMs = Date.now() - Number(event.at);
      return (event.squeezeSide === 'SHORT' || event.squeezeSide === 'LONG') && ageMs >= 0 && ageMs <= liveWindowMs;
    });
    const liveShort = liveEvents.filter(event => event.squeezeSide !== 'LONG').length;
    const liveLong = liveEvents.filter(event => event.squeezeSide === 'LONG').length;
    health.textContent = `${labels[h.status] ?? 'Đang chờ'} · LIVE: ${liveShort} SHORT / ${liveLong} LONG · cache đủ ≥120 nến: ${h.ready ?? 0}/${h.universe ?? 0} coin · ứng viên giá: ${h.candidates ?? 0} · lỗi dữ liệu: ${h.errors ?? 0} · lượt gần nhất ${time(h.lastScanAt)} (VN)`;
    renderSqueezeWatch(data);
  } catch {
    health.textContent = 'Không lấy được danh sách; dữ liệu bên dưới có thể cũ. Tự thử lại sau 30 giây.';
  } finally { squeezeWatchLoading = false; }
}
refreshSqueezeWatch();
setInterval(() => { if (!document.hidden) refreshSqueezeWatch(); }, 30_000);
$('#squeeze-watch-history-toggle')?.addEventListener('change', event => {
  showSqueezeHistory = event.currentTarget.checked === true;
  if (lastSqueezeWatchData) renderSqueezeWatch(lastSqueezeWatchData);
});
for (const side of ['SHORT', 'LONG']) {
  $(`#squeeze-watch-${side.toLowerCase()}-toggle`)?.addEventListener('change', event => {
    squeezeSideVisible[side] = event.currentTarget.checked === true;
    if (lastSqueezeWatchData) renderSqueezeWatch(lastSqueezeWatchData);
  });
}
input.value = initial.replace(/USDT$/i, '');
search(initial);

setInterval(() => {
  if (activeSymbol && !document.hidden && !searchInFlight) search(activeSymbol, { quiet: true });
}, 20_000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && activeSymbol
    && ![WebSocket.CONNECTING, WebSocket.OPEN].includes(liveSocket?.readyState)) {
    connectLiveSocket(activeSymbol, { force: true });
  }
});

window.addEventListener('beforeunload', () => {
  ++liveSocketGeneration;
  clearTimeout(liveSocketRetryTimer);
  liveSocket?.close(1000, 'page closed');
});
