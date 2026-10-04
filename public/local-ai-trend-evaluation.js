import {
  BTC_HOURLY_ENTRY_FORECAST_CARD_VERSION,
  btcHourlyEntryForecastTradeKey,
} from './btc-hourly-entry-forecast-model.js';
import { installLiveCardWhitelistUi } from './live-card-whitelist-ui.js';

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const number = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
const bookUsd = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return '—';
  if (amount >= 1_000_000_000) return `${number(amount / 1_000_000_000, 2)}B USDT`;
  if (amount >= 1_000_000) return `${number(amount / 1_000_000, 2)}M USDT`;
  if (amount >= 1_000) return `${number(amount / 1_000, 2)}K USDT`;
  return `${number(amount, 2)} USDT`;
};
const price = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return parsed >= 100 ? parsed.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : parsed >= 1 ? parsed.toFixed(5).replace(/0+$/, '').replace(/\.$/, '')
      : parsed.toPrecision(6).replace(/0+$/, '').replace(/\.$/, '');
};
const time = (value) => Number(value) > 0 ? new Date(Number(value)).toLocaleString('vi-VN') : '—';
const verdictLabel = { PRIORITY:'ƯU TIÊN QUAN SÁT', WATCH:'THEO DÕI', WAIT:'CHỜ', AVOID:'BỎ QUA' };
const biasLabel = { LONG_BIAS:'NGHIÊNG LONG', SHORT_BIAS:'NGHIÊNG SHORT', NEUTRAL:'TRUNG TÍNH' };
const pathLabel = { CONTINUATION:'Tiếp diễn', RETEST:'Retest', RANGE:'Đi ngang', REVERSAL:'Đảo chiều', UNCLEAR:'Chưa rõ' };
const BTC_AI_TOP_CARD_VERSION = 'LOCAL_AI_BTC_TOP_CARD_V1_20260930';
const btcForecastLabel = {
  UP_STRONG:'TĂNG MẠNH', SW_UP:'ĐI NGANG THIÊN TĂNG', DOWN_STRONG:'GIẢM MẠNH',
  SW_DOWN:'ĐI NGANG THIÊN GIẢM', RANGE:'ĐI NGANG', UNCLEAR:'CHƯA RÕ',
};
const hourlyDirectionLabel = { LONG:'NGHIÊNG LONG THEO LỊCH SỬ', SHORT:'NGHIÊNG SHORT THEO LỊCH SỬ', NEUTRAL:'TRUNG TÍNH / CHƯA ĐỦ MẪU' };
const HOURLY_BTC_GUIDANCE_VERSION = 'LOCAL_AI_HOURLY_BTC_GUIDANCE_V1_20261001';

let status = null;
let running = false;
let chatRunning = false;
let chatHasResult = false;
const chatHistory = [];

const hourlyForecastWhitelistUi = installLiveCardWhitelistUi({
  page: 'btc-hourly-forecast',
  label: 'Thiên hướng giờ + BTC · quan sát',
  root: document,
});

function chatReady() {
  return !chatRunning && ($('#chat-mode')?.value !== 'OLLAMA_BINANCE_ORDERBOOK'
    || Boolean(status?.ollama?.online && status?.ollama?.modelReady));
}

function syncChatControls() {
  $('#chat-input').disabled = chatRunning;
  $('#chat-mode').disabled = chatRunning;
  $('#chat-send').disabled = !chatReady();
  document.querySelectorAll('[data-chat-question]').forEach((button) => {
    button.disabled = !chatReady();
  });
}

function renderBtcAi(data = {}) {
  const evaluation = data.evaluation ?? null;
  const persisted = data.discord ?? {};
  const forecast = String(evaluation?.marketRegime ?? persisted.btcForecast ?? 'UNCLEAR').toUpperCase();
  const btc = evaluation?.btc ?? {};
  const current = evaluation
    ? `1h ${String(btc.trend1h ?? '—').toUpperCase()} · 4h ${String(btc.trend4h ?? '—').toUpperCase()}`
    : String(persisted.btcDirection ?? 'CHƯA RÕ').replaceAll('_', ' ');
  const score = Number(evaluation?.marketScore);
  const evaluatedAt = evaluation?.evaluatedAt ?? persisted.updatedAt;
  const tone = forecast.includes('DOWN') ? 'down'
    : forecast.includes('UP') ? 'up' : forecast === 'RANGE' ? 'range' : 'unclear';
  $('#btc-ai-top').className = `btc-ai-top btc-ai-${tone}`;
  $('#btc-ai-top').dataset.version = BTC_AI_TOP_CARD_VERSION;
  $('#btc-ai-forecast').textContent = btcForecastLabel[forecast] ?? forecast.replaceAll('_', ' ');
  $('#btc-ai-current').textContent = current;
  $('#btc-ai-context').textContent = `${btcForecastLabel[forecast] ?? forecast.replaceAll('_', ' ')}${evaluation?.marketBias ? ` · ${biasLabel[evaluation.marketBias] ?? evaluation.marketBias}` : ''}`;
  $('#btc-ai-score').textContent = Number.isFinite(score) ? `${number(score, 1)}/100` : '—';
  $('#btc-ai-model').textContent = evaluation?.deterministicFallback
    ? 'ENGINE FALLBACK' : evaluation?.model ?? data.model ?? 'qwen3:8b';
  $('#btc-ai-time').textContent = time(evaluatedAt);
  $('#btc-ai-assessment').textContent = evaluation?.btcAssessment
    || (data.running ? 'Ollama đang chạy đánh giá BTC mới…'
      : 'Chưa có lời giải thích AI sau lần khởi động này. Bấm “Chạy đánh giá mới” để cập nhật.');
  $('#btc-ai-source').textContent = evaluation
    ? `${evaluation.deterministicFallback ? 'ENGINE CAUSAL FALLBACK · KHÔNG BINANCE' : `AI ${evaluation.model ?? data.model ?? 'qwen3:8b'}`} · dữ liệu nguồn ${time(evaluation.inputGeneratedAt)} · OBSERVE ONLY`
    : `Dự báo lưu gần nhất${evaluatedAt ? ` · ${time(evaluatedAt)}` : ''} · OBSERVE ONLY`;
}

function renderHourlyEntryForecast(data = {}) {
  const forecast = data.hourlyEntryForecast ?? {};
  const root = $('#btc-hourly-forecast');
  if (!root) return;
  if (!forecast.ready) {
    root.className = 'hourly-forecast hourly-neutral';
    $('#btc-hourly-badge').textContent = 'ĐANG XÂY CACHE';
    $('#btc-hourly-explanation').textContent = forecast.rebuild?.error
      ? `Chưa đọc được cache: ${forecast.rebuild.error}`
      : 'Đang xây cache thống kê hằng ngày từ audit lệnh đã khớp.';
    return;
  }
  const current = forecast.current ?? {};
  const direction = String(current.direction ?? 'NEUTRAL').toUpperCase();
  const selected = current.selected ?? null;
  const quality = Number(selected?.quality?.score);
  const profiled = selected?.quality?.profileEligible === true;
  const conditioned = selected?.quality?.conditionedEligible === true;
  const sample = profiled ? selected?.profile : conditioned ? selected?.conditioned : selected?.base;
  const btc = forecast.currentBtc ?? {};
  const hour = Number(forecast.currentHourVn);
  root.className = `hourly-forecast hourly-${direction.toLowerCase()}`;
  root.dataset.version = forecast.version ?? '';
  $('#btc-hourly-badge').textContent = hourlyDirectionLabel[direction] ?? direction;
  $('#btc-hourly-now').textContent = Number.isFinite(hour) ? `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00` : '—';
  $('#btc-hourly-direction').textContent = hourlyDirectionLabel[direction] ?? direction;
  $('#btc-hourly-source').textContent = direction === 'NEUTRAL'
    ? 'Không ép hướng khi điểm/số mẫu chưa đủ'
    : `Nguồn chấm: ${selected?.quality?.source ?? 'GIỜ'}`;
  $('#btc-hourly-quality').textContent = Number.isFinite(quality) ? `${number(quality, 1)}/100` : '—';
  $('#btc-hourly-sample').textContent = sample
    ? `${number(sample.closed, 0)} lệnh đóng · net ${number(sample.netPnl, 3)} USDT · PF ${number(sample.profitFactor, 2)}`
    : 'Chưa đủ mẫu tối thiểu';
  $('#btc-hourly-btc').textContent = `${String(btc.trend ?? 'UNKNOWN')} 1h · ${String(btc.trend4h ?? 'UNKNOWN')} 4h`;
  $('#btc-hourly-btc-score').textContent = `15m ${number(btc.return15mPct, 3)}% (${btc.momentum15m ?? 'UNKNOWN'}) · 1h ${number(btc.return1hPct, 3)}% (${btc.move1h ?? 'UNKNOWN'})`;
  $('#btc-hourly-explanation').textContent = direction === 'NEUTRAL'
    ? `Giờ ${String(hour).padStart(2, '0')}h chưa có chênh lệch LONG/SHORT đủ lớn theo mẫu lịch sử. Chờ tín hiệu riêng của coin, không dùng khung giờ để ép entry.`
    : `Trong mẫu mọi size lệnh bot đã đóng, giờ ${String(hour).padStart(2, '0')}h nghiêng ${direction}${profiled ? ` với BTC ${btc.trend}, 15m ${btc.momentum15m}, 1h ${btc.move1h}` : conditioned ? ` khi BTC ${btc.trend}` : ''}. Đây là thiên hướng lịch sử, không phải dự báo chắc chắn hay gate giao dịch.`;
  const renderBestHours = (side) => {
    const rows = forecast.bestByBtcTrend?.[side] ?? [];
    return `<div class="hourly-best-row"><strong>Giờ tốt ${side} theo BTC:</strong>${rows.length
      ? rows.map((slot) => `<span class="hourly-chip ${side.toLowerCase()}" title="WR ${number(slot.winRate, 1)}% · AvgROE ${number(slot.avgRoe, 2)}% · PF ${number(slot.profitFactor, 2)}">${String(slot.hourVn).padStart(2, '0')}h · ${side} · BTC ${esc(slot.btcTrend)} · ${number(slot.qualityScore, 1)}/100 · n=${number(slot.closed, 0)}</span>`).join('')
      : '<span>Chưa có tổ hợp đủ mẫu.</span>'}</div>`;
  };
  $('#btc-hourly-next').innerHTML = `${renderBestHours('LONG')}${renderBestHours('SHORT')}`;
  $('#btc-hourly-strip').innerHTML = (forecast.schedule ?? []).map((slot) => `<span class="${String(slot.direction ?? 'NEUTRAL').toLowerCase()}${Number(slot.hourVn) === hour ? ' current' : ''}" title="${String(slot.hourVn).padStart(2, '0')}h · ${esc(hourlyDirectionLabel[slot.direction] ?? slot.direction)}">${String(slot.hourVn).padStart(2, '0')}</span>`).join('');
  const coverage = forecast.coverage ?? {};
  const marginSummary = (coverage.marginSizes ?? []).map((row) => `${number(row.marginUsdt, 2)}$:${number(row.entries, 0)}`).join(' · ');
  $('#btc-hourly-coverage').textContent = `${number(coverage.closedEntries, 0)} entry mọi size bot đã đóng · ${number(coverage.btcMatchedEntries, 0)} ghép BTC hợp lệ${marginSummary ? ` · size ${marginSummary}` : ''} · cập nhật ${time(Date.parse(forecast.generatedAt))} · OBSERVE ONLY · không tác động Binance/size/SL/TP.`;
}

function renderHourlyBtcGuidance(data = {}) {
  const root = $('#hourly-btc-guidance');
  if (!root) return;
  const forecast = data.hourlyEntryForecast ?? {};
  const current = forecast.current ?? {};
  const direction = forecast.ready ? String(current.direction ?? 'NEUTRAL').toUpperCase() : 'NEUTRAL';
  const hour = Number(forecast.currentHourVn);
  const btc = forecast.currentBtc ?? {};
  const quality = Number(current.selected?.quality?.score);
  const selectedStats = current.selected?.quality?.profileEligible === true
    ? current.selected?.profile
    : current.selected?.quality?.conditionedEligible === true
      ? current.selected?.conditioned
      : current.selected?.base;
  const selectedAvgRoe = Number(selectedStats?.avgRoe);
  const allowedVerdicts = new Set(['PRIORITY', 'WATCH']);
  const candidates = [...(data.evaluation?.candidates ?? [])]
    .filter((row) => ['LONG', 'SHORT'].includes(String(row?.side ?? '').toUpperCase()))
    .filter((row) => allowedVerdicts.has(String(row?.verdict ?? '').toUpperCase()))
    .sort((left, right) => (String(left.verdict).toUpperCase() === 'PRIORITY' ? 0 : 1)
      - (String(right.verdict).toUpperCase() === 'PRIORITY' ? 0 : 1)
      || Number(right.strength ?? 0) - Number(left.strength ?? 0));
  const lists = {
    LONG: candidates.filter((row) => String(row.side).toUpperCase() === 'LONG'),
    SHORT: candidates.filter((row) => String(row.side).toUpperCase() === 'SHORT'),
  };
  const renderCandidates = (side) => lists[side].length
    ? lists[side].map((row) => {
      const zone = row.deterministic?.entryZone ?? {};
      const zoneText = Number.isFinite(Number(zone.low)) && Number.isFinite(Number(zone.high))
        ? `${price(zone.low)} – ${price(zone.high)}` : 'chưa có vùng engine';
      const verdict = String(row.verdict ?? 'WATCH').toUpperCase();
      return `<a class="guidance-coin guidance-coin-${side.toLowerCase()}" href="/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}"><strong>${esc(row.symbol)}</strong><span class="verdict verdict-${verdict.toLowerCase()}">${esc(verdictLabel[verdict] ?? verdict)}</span><small>Độ rõ ${number(row.strength, 1)}/100 · vùng ${esc(zoneText)}</small></a>`;
    }).join('')
    : `<p>Chưa có PRIORITY/WATCH ${side} trong Top 10 AI hiện tại.</p>`;

  root.className = `market-guidance guidance-${direction.toLowerCase()}`;
  root.dataset.version = HOURLY_BTC_GUIDANCE_VERSION;
  const whitelistObservation = current.whitelistObservation ?? {
    version: BTC_HOURLY_ENTRY_FORECAST_CARD_VERSION,
    direction,
  };
  const whitelistKey = current.whitelistKey ?? btcHourlyEntryForecastTradeKey({
    btcHourlyEntryForecastObservation: whitelistObservation,
  });
  root.dataset.whitelistKey = whitelistKey ?? '';
  root.dataset.liveCardKey = whitelistKey ?? '';
  root.dataset.binanceCardAvgRoe = Number.isFinite(selectedAvgRoe) ? String(selectedAvgRoe) : '';
  root.dataset.binanceCardAvgRoeEligible = Number.isFinite(selectedAvgRoe) && selectedAvgRoe > 4 ? 'true' : 'false';
  hourlyForecastWhitelistUi.decorate();
  $('#hourly-btc-guidance-badge').textContent = direction === 'LONG'
    ? 'ƯU TIÊN QUAN SÁT LONG'
    : direction === 'SHORT' ? 'ƯU TIÊN QUAN SÁT SHORT' : 'CHƯA ƯU TIÊN HƯỚNG';
  $('#hourly-btc-guidance-explanation').textContent = forecast.ready
    ? `Khung ${String(hour).padStart(2, '0')}h VN · BTC ${String(btc.trend ?? 'UNKNOWN')} 1h / ${String(btc.trend4h ?? 'UNKNOWN')} 4h${Number.isFinite(quality) ? ` · chất lượng lịch sử ${number(quality, 1)}/100` : ''}. ${direction === 'NEUTRAL' ? 'Không đủ edge để ép LONG/SHORT; chờ điều kiện riêng từng coin.' : `Dữ liệu lịch sử đang nghiêng ${direction}; chỉ cân nhắc các coin cùng hướng khi cấu trúc/vùng entry của coin còn hiệu lực.`}`
    : 'Cache thống kê giờ/BTC chưa sẵn sàng; chưa đưa khuyến nghị hướng.';
  $('#guidance-long-count').textContent = String(lists.LONG.length);
  $('#guidance-short-count').textContent = String(lists.SHORT.length);
  $('#guidance-long-list').innerHTML = renderCandidates('LONG');
  $('#guidance-short-list').innerHTML = renderCandidates('SHORT');
  $('#hourly-btc-guidance-policy').textContent = `OBSERVE ONLY · key ${root.dataset.whitelistKey || 'chưa có'} mặc định OFF · checkbox chỉ hiện khi CLOSED AvgROE >4% · chỉ liệt kê PRIORITY/WATCH; WAIT/AVOID không được gọi là điểm vào · không đổi Binance, size, SL hoặc TP.`;
}

function renderHealth(data) {
  status = data;
  const health = data.ollama ?? {};
  const fallback = data.evaluation?.deterministicFallback === true;
  const recentInferenceFailure = fallback && Boolean(data.lastInferenceFailure?.code);
  $('#ollama-dot').className = `dot ${health.online && health.modelReady && !recentInferenceFailure ? 'online' : 'error'}`;
  $('#ollama-status').textContent = health.online
    ? health.modelReady
      ? recentInferenceFailure ? 'Ollama online · lần suy luận gần nhất bị lỗi' : 'Ollama đang hoạt động'
      : 'Ollama online · đang thiếu model'
    : 'Ollama chưa kết nối';
  const priorityZone = data.priorityZoneExecution ?? {};
  $('#model-status').textContent = fallback
    ? `ENGINE FALLBACK đang giữ luồng altcoin · Binance route không được gài${data.lastInferenceFailure?.code ? ` · ${data.lastInferenceFailure.code}` : ''}${data.lastInferenceFailure?.message ? ` · ${data.lastInferenceFailure.message}` : ''}`
    : `${data.model ?? 'qwen3:8b'} · AI OBSERVE${priorityZone.version ? ` · PRIORITY zone ${priorityZone.active ?? 0} active` : ''}${data.running ? ' · đang đánh giá' : ''}`;
  $('#evaluate-button').disabled = running;
  if (!chatRunning && !chatHasResult) {
    $('#chat-status').textContent = health.online && health.modelReady
      ? data.running
        ? 'Đánh giá AI nền đang chạy · chatbot vẫn gọi model; có fallback định lượng nếu model lỗi hoặc hết thời gian.'
        : `${data.model ?? 'qwen3:8b'} sẵn sàng · nến và order book Binance được đưa qua model trước khi trả lời.`
      : 'Model local chưa sẵn sàng; chatbot vẫn ưu tiên engine định lượng khi có dữ liệu.';
  }
  syncChatControls();
  renderHourlyBtcGuidance(data);
  renderHourlyEntryForecast(data);
  renderBtcAi(data);
  if (data.evaluation) renderEvaluation(data.evaluation);
}

function appendChatMessage(role, content, { error = false, details = '', source = 'AI LOCAL' } = {}) {
  const article = document.createElement('article');
  article.className = `chat-message ${role === 'user' ? 'user' : 'assistant'}${error ? ' error' : ''}`;
  article.innerHTML = `<span>${role === 'user' ? 'BẠN' : esc(source)}</span><p>${esc(content)}</p>${details}`;
  $('#chat-messages').append(article);
  $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
  return article;
}

function renderOrderBookChart(coin) {
  const orderBook = coin?.orderBook;
  const scenario = coin?.liquidityScenario ?? {};
  if (!orderBook) return '';
  const finiteValue = (value) => value == null || value === ''
    ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  const normalizeZone = (zone, side, layer) => {
    const fallback = finiteValue(zone?.mid ?? zone?.price);
    const low = finiteValue(zone?.low) ?? fallback;
    const high = finiteValue(zone?.high) ?? fallback;
    if (!(low > 0) || !(high > 0)) return null;
    return {
      side, layer, low:Math.min(low, high), high:Math.max(low, high),
      mid:finiteValue(zone?.mid) ?? ((low + high) / 2),
      notional:Math.max(0, finiteValue(zone?.orderBookNotional) ?? 0),
      distancePct:finiteValue(zone?.distancePct),
    };
  };
  const collect = (zones, side, layer, limit) => (zones ?? [])
    .map((zone) => normalizeZone(zone, side, layer)).filter(Boolean).slice(0, limit);
  const rows = [
    ...collect(orderBook.near?.bidZones ?? orderBook.bidZones, 'BID', 'NEAR', 4),
    ...collect(orderBook.near?.askZones ?? orderBook.askZones, 'ASK', 'NEAR', 4),
    ...collect(orderBook.wide?.bidZones, 'BID', 'WIDE', 5),
    ...collect(orderBook.wide?.askZones, 'ASK', 'WIDE', 5),
  ];
  const normalizeKillZone = (zone, role) => {
    const fallback = finiteValue(zone?.mid ?? zone?.price);
    const low = finiteValue(zone?.low) ?? fallback;
    const high = finiteValue(zone?.high) ?? fallback;
    if (!(low > 0) || !(high > 0)) return null;
    return {
      ...zone, role, low:Math.min(low, high), high:Math.max(low, high),
      mid:finiteValue(zone?.mid) ?? ((low + high) / 2),
    };
  };
  const mainKill = normalizeKillZone(scenario.mainKillZone, 'MAIN KILL');
  const farKill = normalizeKillZone(scenario.farKillZone, 'FAR KILL');
  const mark = finiteValue(scenario.markPrice);
  const pricePoints = rows.flatMap((row) => [row.low, row.high]);
  if (mark != null) pricePoints.push(mark);
  if (mainKill) pricePoints.push(mainKill.low, mainKill.high);
  if (!pricePoints.length) return '';
  let minPrice = Math.min(...pricePoints);
  let maxPrice = Math.max(...pricePoints);
  if (minPrice === maxPrice) {
    minPrice *= .99;
    maxPrice *= 1.01;
  }
  const padding = (maxPrice - minPrice) * .055;
  minPrice = Math.max(Number.MIN_VALUE, minPrice - padding);
  maxPrice += padding;
  const width = 860;
  const height = 340;
  const plotTop = 34;
  const plotBottom = 260;
  const center = 430;
  const barMaxWidth = 265;
  const yFor = (value) => plotTop + ((maxPrice - value) / (maxPrice - minPrice)) * (plotBottom - plotTop);
  const maxNotional = Math.max(1, ...rows.map((row) => row.notional));
  const grids = Array.from({ length:6 }, (_, index) => {
    const ratio = index / 5;
    const y = plotTop + ratio * (plotBottom - plotTop);
    const value = maxPrice - ratio * (maxPrice - minPrice);
    return `<line class="orderbook-chart-grid" x1="55" y1="${y.toFixed(2)}" x2="805" y2="${y.toFixed(2)}"></line><text class="orderbook-chart-axis" x="812" y="${(y + 4).toFixed(2)}">${esc(price(value))}</text>`;
  }).join('');
  const bars = rows.map((row) => {
    const yTop = yFor(row.high);
    const yBottom = yFor(row.low);
    const barHeight = Math.max(7, yBottom - yTop);
    const y = ((yTop + yBottom) / 2) - (barHeight / 2);
    const barWidth = 34 + (row.notional / maxNotional) * barMaxWidth;
    const x = row.side === 'BID' ? center - barWidth : center;
    const className = `orderbook-depth-bar ${row.side.toLowerCase()} ${row.layer.toLowerCase()}`;
    return `<g><rect class="${className}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="4"><title>${esc(`${row.layer} ${row.side} · ${price(row.low)}–${price(row.high)} · ${number(row.notional, 0)} USDT`)}</title></rect></g>`;
  }).join('');
  const killBand = (zone, type) => {
    if (!zone) return '';
    const yTop = yFor(zone.high);
    const yBottom = yFor(zone.low);
    const bandHeight = Math.max(12, yBottom - yTop);
    const y = ((yTop + yBottom) / 2) - (bandHeight / 2);
    const consumed = zone.active === false ? ' consumed' : '';
    return `<g class="kill-zone-band ${type}${consumed}"><rect x="65" y="${y.toFixed(2)}" width="730" height="${bandHeight.toFixed(2)}" rx="6"><title>${esc(`${zone.role} · ${price(zone.low)}–${price(zone.high)}`)}</title></rect></g>`;
  };
  const markLine = mark == null ? '' : `<g class="orderbook-mark"><line x1="55" y1="${yFor(mark).toFixed(2)}" x2="805" y2="${yFor(mark).toFixed(2)}"></line><text x="650" y="${(yFor(mark) - 6).toFixed(2)}">MARK ${esc(price(mark))}</text></g>`;
  const farGuide = farKill ? `<g class="far-kill-guide${farKill.active === false ? ' consumed' : ''}"><line x1="65" y1="282" x2="795" y2="282"></line><text x="70" y="300">${esc(`FAR KILL ${scenario.proxyDirection === 'UPPER' ? '↑' : scenario.proxyDirection === 'LOWER' ? '↓' : '↕'} ${price(farKill.low)}–${price(farKill.high)} · ngoài khung giá gần`)}</text></g>` : '';
  const distanceText = (zone) => {
    const low = finiteValue(zone?.distancePctLow);
    const high = finiteValue(zone?.distancePctHigh);
    if (low != null && high != null) return `cách ${number(Math.min(Math.abs(low), Math.abs(high)), 2)}–${number(Math.max(Math.abs(low), Math.abs(high)), 2)}%`;
    const mid = mark != null ? ((zone.mid - mark) / mark) * 100 : finiteValue(zone?.distancePct);
    return mid == null ? 'chưa có khoảng cách' : `cách ${number(Math.abs(mid), 2)}%`;
  };
  const killNote = (zone, type, description) => zone ? `<article class="kill-zone-note ${type}${zone.active === false ? ' consumed' : ''}"><b>${esc(zone.role)}</b><strong>${esc(`${price(zone.low)} – ${price(zone.high)}`)}</strong><span>${esc(distanceText(zone))}${finiteValue(zone.score) != null ? ` · score proxy ${number(zone.score, 0)}` : ''}</span><small>${esc(zone.lifecycleLabel || (zone.active === false ? 'VÙNG ĐÃ TIÊU THỤ' : 'VÙNG ĐANG HOẠT ĐỘNG'))} · ${esc(description)}</small></article>` : '';
  const killNotes = `${killNote(mainKill, 'main', 'cụm thanh khoản chính/gần hơn')}${killNote(farKill, 'far', 'cụm thanh khoản xa hơn, không dùng thay MAIN KILL')}`
    || '<p class="kill-zone-empty">Snapshot này chưa có MAIN KILL/FAR KILL hợp lệ; chart vẫn chỉ hiển thị depth Binance.</p>';
  const hoverContext = esc(JSON.stringify({
    direction: scenario.proxyDirection, dominantPct: scenario.proxyDominantPct,
    main: mainKill, far: farKill,
  }));
  return `<section class="orderbook-chart-panel" data-version="LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V6_TOUCH_TOGGLE_TOOLTIP_20261004" data-hover-context="${hoverContext}">
    <header><div><b>BIỂU ĐỒ ORDER BOOK · ${esc(coin.symbol)}</b><small>Thanh BID/ASK = Binance Futures depth; vùng kill = Binance LiqScan 15m proxy.</small></div><span>OBSERVE ONLY</span></header>
    <div class="orderbook-chart-legend"><span class="bid">BID</span><span class="ask">ASK</span><span class="main">MAIN KILL trong khung giá gần</span><span class="far">FAR KILL chỉ báo ngoài khung</span><span class="mark">MARK</span></div>
    <svg class="orderbook-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ order book Binance Futures với vùng Main Kill và Far Kill của ${esc(coin.symbol)}" data-price-min="${minPrice}" data-price-max="${maxPrice}" data-plot-top="${plotTop}" data-plot-bottom="${plotBottom}" data-view-height="${height}">
      <text class="orderbook-side-title bid" x="165" y="22">BID · HỖ TRỢ</text><text class="orderbook-side-title ask" x="695" y="22" text-anchor="end">ASK · KHÁNG CỰ</text>
      ${grids}<line class="orderbook-chart-center" x1="${center}" y1="${plotTop}" x2="${center}" y2="${plotBottom}"></line>${bars}${killBand(mainKill, 'main')}${markLine}${farGuide}
      <g class="orderbook-hover-layer" aria-hidden="true"><line class="orderbook-hover-line" x1="55" y1="0" x2="805" y2="0"></line><g class="orderbook-hover-tooltip"><rect x="350" y="0" width="455" height="112" rx="7"></rect><text class="hover-price" x="362" y="18">GIÁ —</text><text class="hover-zone" x="362" y="36"></text><text class="hover-liquidation-usd" x="362" y="55"></text><text class="hover-liquidity" x="362" y="74"></text><text class="hover-probability" x="362" y="94">Proxy ước tính, không phải vị thế thanh lý xác thực</text></g></g>
      <text class="orderbook-chart-foot" x="55" y="325">NEAR sáng · WIDE mờ · rê chuột hoặc chạm để xem; chạm lần nữa để đóng</text>
    </svg>
    <div class="kill-zone-notes">${killNotes}</div>
    <small class="orderbook-chart-caveat">MAIN/FAR KILL là vùng proxy 15m để quan sát hướng hút/thanh khoản; không phải lệnh treo xác thực, không phải xác suất và không tự tạo entry Binance.</small>
  </section>`;
}

function orderBookHoverDetails(context, hoveredPrice, farGuide = false) {
  const zones = farGuide ? [context.far] : [context.main, context.far];
  const zone = zones.find((item) => item && (farGuide || (hoveredPrice >= item.low && hoveredPrice <= item.high)));
  const numeric = (value) => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  const score = numeric(zone?.score);
  const dominant = numeric(context.dominantPct);
  const direction = context.direction === 'UPPER' ? 'TRÊN' : context.direction === 'LOWER' ? 'DƯỚI' : null;
  const consumed = zone?.active === false;
  const formatUsd = (value) => {
    const amount = numeric(value);
    if (amount == null || amount < 0) return null;
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2).replace(/\.00$/, '')}B USD`;
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2).replace(/\.00$/, '')}M USD`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(2).replace(/\.00$/, '')}K USD`;
    return `${amount.toFixed(2).replace(/\.00$/, '')} USD`;
  };
  const liquidationUsd = formatUsd(score);
  return {
    zone: zone ? `${zone.role} · ${consumed ? 'ĐÃ TIÊU THỤ' : zone.active === true ? 'ĐANG HOẠT ĐỘNG' : 'CHƯA RÕ TRẠNG THÁI'}` : 'Ngoài vùng MAIN/FAR KILL',
    liquidationUsd: zone
      ? liquidationUsd == null
        ? 'Thanh lý proxy: chưa có giá trị USD hợp lệ'
        : consumed
          ? `Giá trị proxy tại snapshot đã quét: ≈ ${liquidationUsd}`
          : `Thanh lý proxy ước tính tại vùng: ≈ ${liquidationUsd}`
      : 'Thanh lý proxy: chỉ hiện khi hover vùng MAIN/FAR KILL',
    liquidity: consumed ? 'Không còn là mục tiêu quét đang hoạt động'
      : direction && dominant != null && dominant >= 0 && dominant <= 100
        ? `Tỷ trọng thanh khoản phía ${direction}: ${dominant.toFixed(1)}%`
        : 'Chưa có tỷ trọng thanh khoản hợp lệ',
  };
}

function updateOrderBookHover(event) {
  const chart = event.target?.closest?.('svg.orderbook-chart');
  if (!chart) return;
  if (event.type === 'pointermove' && chart.dataset.tooltipPinned === 'true') return;
  const rect = chart.getBoundingClientRect();
  if (!(rect.height > 0)) return;
  const plotTop = Number(chart.dataset.plotTop);
  const plotBottom = Number(chart.dataset.plotBottom);
  const viewHeight = Number(chart.dataset.viewHeight);
  const minPrice = Number(chart.dataset.priceMin);
  const maxPrice = Number(chart.dataset.priceMax);
  if (![plotTop, plotBottom, viewHeight, minPrice, maxPrice].every(Number.isFinite) || maxPrice <= minPrice) return;
  const rawY = ((event.clientY - rect.top) / rect.height) * viewHeight;
  const y = Math.max(plotTop, Math.min(plotBottom, rawY));
  const ratio = (y - plotTop) / (plotBottom - plotTop);
  const hoveredPrice = maxPrice - ratio * (maxPrice - minPrice);
  const layer = chart.querySelector('.orderbook-hover-layer');
  const text = chart.querySelector('.hover-price');
  if (!layer || !text) return;
  const farGuide = Boolean(event.target?.closest?.('.far-kill-guide'));
  let context;
  try { context = JSON.parse(chart.closest('.orderbook-chart-panel').dataset.hoverContext); } catch { context = {}; }
  const details = orderBookHoverDetails(context, hoveredPrice, farGuide);
  layer.setAttribute('transform', `translate(0 ${y.toFixed(2)})`);
  text.textContent = `GIÁ ${price(hoveredPrice)}`;
  if (farGuide && context.far) text.textContent = `FAR ${price(context.far.low)} – ${price(context.far.high)}`;
  chart.querySelector('.orderbook-hover-tooltip').setAttribute('transform', `translate(0 ${y + 122 > plotBottom ? -118 : 10})`);
  chart.querySelector('.hover-zone').textContent = details.zone;
  chart.querySelector('.hover-liquidation-usd').textContent = details.liquidationUsd;
  chart.querySelector('.hover-liquidity').textContent = details.liquidity;
  chart.classList.add('hovering');
  layer.setAttribute('aria-hidden', 'false');
}

function closeOrderBookTooltip(chart) {
  if (!chart) return;
  chart.classList.remove('hovering');
  chart.dataset.tooltipPinned = 'false';
  chart.querySelector('.orderbook-hover-layer')?.setAttribute('aria-hidden', 'true');
}

function isTouchOrderBookInteraction(event) {
  if (event?.pointerType === 'touch' || event?.pointerType === 'pen') return true;
  return Boolean(globalThis.matchMedia?.('(hover: none), (pointer: coarse)').matches);
}

document.addEventListener('pointermove', updateOrderBookHover);
document.addEventListener('pointerout', (event) => {
  const chart = event.target?.closest?.('svg.orderbook-chart');
  if (chart && !chart.contains(event.relatedTarget) && chart.dataset.tooltipPinned !== 'true') closeOrderBookTooltip(chart);
});
document.addEventListener('click', (event) => {
  const chart = event.target?.closest?.('svg.orderbook-chart');
  if (!chart || !isTouchOrderBookInteraction(event)) return;
  event.preventDefault();
  const wasPinned = chart.dataset.tooltipPinned === 'true';
  document.querySelectorAll('svg.orderbook-chart[data-tooltip-pinned="true"]').forEach(closeOrderBookTooltip);
  if (wasPinned) return;
  updateOrderBookHover(event);
  if (chart.classList.contains('hovering')) chart.dataset.tooltipPinned = 'true';
});

function renderChatDetails(answer) {
  const singleCoin = (answer.coins ?? []).length === 1;
  const coins = (answer.coins ?? []).map((coin) => {
    const sideClass = `chat-side-${String(coin.side ?? 'neutral').toLowerCase()}`;
    const zoneText = (zone) => {
      const low = price(zone?.low);
      const high = price(zone?.high);
      return low !== '—' && high !== '—' ? `${low} – ${high}` : price(zone?.mid ?? zone?.price ?? zone?.low ?? zone?.high);
    };
    const supports = (coin.supports ?? []).map((zone) => `<span class="chat-level support"><b>HỖ TRỢ</b>${zoneText(zone)}${zone.confidence ? `<small>${esc(zone.confidence)}</small>` : ''}</span>`).join('');
    const resistances = (coin.resistances ?? []).map((zone) => `<span class="chat-level resistance"><b>KHÁNG CỰ</b>${zoneText(zone)}${zone.confidence ? `<small>${esc(zone.confidence)}</small>` : ''}</span>`).join('');
    const renderBookZones = (zones, layer) => (zones ?? []).map((zone) => `<span class="book-zone ${String(zone.side ?? '').toLowerCase() === 'ask' ? 'ask' : 'bid'}"><b>${esc(layer)} · ${esc(zone.side ?? '')}</b>${zoneText(zone)}<small>${number(zone.orderBookNotional, 0)} USDT · cách ${number(Math.abs(Number(zone.distancePct)), 2)}% · ${number(zone.levelCount, 0)} level</small></span>`).join('');
    const nearBid = renderBookZones(coin.orderBook?.near?.bidZones ?? coin.orderBook?.bidZones, 'NEAR');
    const nearAsk = renderBookZones(coin.orderBook?.near?.askZones ?? coin.orderBook?.askZones, 'NEAR');
    const wideBid = renderBookZones(coin.orderBook?.wide?.bidZones, 'WIDE');
    const wideAsk = renderBookZones(coin.orderBook?.wide?.askZones, 'WIDE');
    const zoneNotional = (zones) => (zones ?? []).reduce((sum, zone) => {
      const value = Number(zone?.orderBookNotional);
      return sum + (Number.isFinite(value) && value > 0 ? value : 0);
    }, 0);
    const fallbackBidTotal = zoneNotional(coin.orderBook?.near?.bidZones ?? coin.orderBook?.bidZones)
      + zoneNotional(coin.orderBook?.wide?.bidZones);
    const fallbackAskTotal = zoneNotional(coin.orderBook?.near?.askZones ?? coin.orderBook?.askZones)
      + zoneNotional(coin.orderBook?.wide?.askZones);
    const bidTotal = Number.isFinite(Number(coin.orderBook?.totals?.bidNotional))
      ? Number(coin.orderBook.totals.bidNotional) : fallbackBidTotal;
    const askTotal = Number.isFinite(Number(coin.orderBook?.totals?.askNotional))
      ? Number(coin.orderBook.totals.askNotional) : fallbackAskTotal;
    const totalNotional = Math.max(0, bidTotal) + Math.max(0, askTotal);
    const bidShare = totalNotional > 0 ? (bidTotal / totalNotional) * 100 : null;
    const askShare = totalNotional > 0 ? (askTotal / totalNotional) * 100 : null;
    const sideTotals = totalNotional > 0 ? `<div class="book-side-totals" data-version="LOCAL_AI_ORDER_BOOK_SIDE_TOTALS_UI_V1_20261002">
      <span class="bid"><b>TỔNG BÊN DƯỚI · BID</b><strong>${bookUsd(bidTotal)}</strong><small>${bidShare == null ? '—' : `${number(bidShare, 1)}%`} tổng depth trong phạm vi</small></span>
      <span class="ask"><b>TỔNG BÊN TRÊN · ASK</b><strong>${bookUsd(askTotal)}</strong><small>${askShare == null ? '—' : `${number(askShare, 1)}%`} tổng depth trong phạm vi</small></span>
    </div>` : '';
    const coverage = coin.orderBook?.coverage;
    const coverageText = coverage
      ? `Depth ${number(coin.orderBook?.requestedLimit,0)} · BID phủ ${number(coverage.bid?.farthestDistancePct,2)}% · ASK phủ ${number(coverage.ask?.farthestDistancePct,2)}%${coverage.bid?.reachesWideEdge && coverage.ask?.reachesWideEdge ? ' · đủ biên WIDE 20%' : ' · WIDE chỉ hiển thị phần Binance thực sự trả về'}`
      : '';
    const scenario = coin.liquidityScenario ?? null;
    const scenarioClass = scenario?.combinedState === 'LIQUIDITY_ZONE_CONSUMED' ? 'consumed'
      : scenario?.combinedState === 'LIQUIDITY_CONFLICT' ? 'conflict'
      : scenario?.combinedState === 'COUNTER_TREND_LIQUIDITY_PULL' ? 'counter'
        : scenario?.likelyDirection === 'UPPER' ? 'upper' : scenario?.likelyDirection === 'LOWER' ? 'lower' : 'conflict';
    const trendText = scenario?.trendDirection ? `XU HƯỚNG ${scenario.trendDirection}` : 'XU HƯỚNG CHƯA RÕ';
    const scenarioLabel = scenario?.combinedState === 'LIQUIDITY_ZONE_CONSUMED'
      ? `${trendText} · VÙNG THANH KHOẢN ĐÃ TIÊU THỤ`
      : scenario?.combinedState === 'LIQUIDITY_CONFLICT'
      ? `${trendText} · THANH KHOẢN XUNG ĐỘT`
      : scenario?.combinedState === 'COUNTER_TREND_LIQUIDITY_PULL'
        ? `${trendText} · LỰC HÚT NGƯỢC XU HƯỚNG`
        : scenario?.combinedState === 'TREND_LIQUIDITY_ALIGNED'
          ? `${trendText} · THANH KHOẢN ĐỒNG HƯỚNG`
          : `${trendText} · CHƯA XÁC NHẬN`;
    const sweepZones = scenario ? `<div class="sweep-zones">
      ${scenario.upperZone ? `<span class="sweep-zone upper${scenario.upperZone.active === false ? ' consumed' : ''}"><b>${esc(scenario.upperZone.lifecycleLabel || 'VÙNG TRÊN')}</b>${zoneText(scenario.upperZone)}${Number.isFinite(Number(scenario.upperZone.distancePct)) ? `<small>${number(scenario.upperZone.distancePct,2)}%</small>` : ''}</span>` : ''}
      ${scenario.lowerZone ? `<span class="sweep-zone lower${scenario.lowerZone.active === false ? ' consumed' : ''}"><b>${esc(scenario.lowerZone.lifecycleLabel || 'VÙNG DƯỚI')}</b>${zoneText(scenario.lowerZone)}${Number.isFinite(Number(scenario.lowerZone.distancePct)) ? `<small>${number(scenario.lowerZone.distancePct,2)}%</small>` : ''}</span>` : ''}
    </div>` : '';
    return `<article class="chat-coin">
      <strong><a class="coin" href="/coin-level-analysis?symbol=${encodeURIComponent(coin.symbol)}">${esc(coin.symbol)}</a><span class="${sideClass}">${esc(coin.side)}</span></strong>
      <small>${esc(coin.trend)} · độ rõ ${number(coin.clarity, 1)}/100 (không phải xác suất)</small>
      <small>${esc(coin.entryContext || 'Không có vùng entry trong snapshot.')}</small>
      ${supports || resistances ? `<div class="chat-levels">${supports}${resistances}</div>` : ''}
      ${sideTotals}
      ${nearBid || nearAsk ? `<div class="book-panel near"><strong>ORDER BOOK BINANCE FUTURES THẬT · NEAR 0–3% · ƯU TIÊN ENTRY</strong><div>${nearBid}${nearAsk}</div></div>` : ''}
      ${wideBid || wideAsk ? `<div class="book-panel wide"><strong>ORDER BOOK BINANCE FUTURES THẬT · WIDE 3–20% · VÙNG HÚT XA</strong><div>${wideBid}${wideAsk}</div></div>` : ''}
      ${coverageText ? `<small class="book-coverage">${esc(coverageText)}</small>` : ''}
      ${scenario ? `<div class="sweep-panel ${scenarioClass}"><strong>${scenarioLabel} · ${esc(scenario.confidence)}</strong><p>${esc(scenario.combinedHeadline || scenario.headline)}</p>${sweepZones}<small>Binance LiqScan: ${esc(scenario.proxyDirection ?? '—')}${Number.isFinite(Number(scenario.proxyDominantPct)) ? ` ${number(scenario.proxyDominantPct,1)}%` : ''} · nguồn BINANCE FUTURES</small></div>` : ''}
      ${singleCoin ? renderOrderBookChart(coin) : ''}
      <small>${esc(coin.reason)}</small>
    </article>`;
  }).join('');
  const riskText = (answer.risks ?? []).length
    ? `<p class="chat-extra"><strong>Rủi ro:</strong> ${esc(answer.risks.join(' · '))}</p>` : '';
  const limitation = answer.limitations
    ? `<p class="chat-extra"><strong>Giới hạn:</strong> ${esc(answer.limitations)}</p>` : '';
  return `${answer.marketContext ? `<p class="chat-answer-context">${esc(answer.marketContext)}</p>` : ''}${coins ? `<div class="chat-coins">${coins}</div>` : ''}${riskText}${limitation}`;
}

async function askChat(question) {
  const text = String(question ?? '').trim();
  if (chatRunning) return;
  if (!text) {
    $('#chat-status').textContent = 'Nhập câu hỏi hoặc mã coin rồi bấm Hỏi AI.';
    $('#chat-input').focus();
    return;
  }
  const requestHistory = chatHistory.slice(-6);
  const analysisMode = $('#chat-mode').value;
  const modeLabel = analysisMode === 'DIRECT_ENGINE'
    ? 'COIN LEVEL NHANH'
    : analysisMode === 'DIRECT_ENGINE_BINANCE_ORDERBOOK'
      ? 'ENGINE NHANH + ORDER BOOK'
      : 'OLLAMA + ORDER BOOK';
  appendChatMessage('user', text);
  chatHistory.push({ role:'user', content:text });
  chatRunning = true;
  syncChatControls();
  $('#chat-send').textContent = analysisMode === 'OLLAMA_BINANCE_ORDERBOOK' ? 'AI đang trả lời…' : 'Đang phân tích…';
  $('#chat-status').textContent = analysisMode === 'DIRECT_ENGINE_BINANCE_ORDERBOOK'
    ? 'Đang lấy nến/engine và Binance order book/LiqScan; không gọi Ollama…'
    : 'Đang tổng hợp BTC, nến đã đóng, volume và vùng engine hiện tại…';
  $('#chat-input').value = '';
  const requestStartedAt = Date.now();
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch('/api/local-ai-trend-chat', {
      method:'POST',
      signal:controller.signal,
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ question:text, history:requestHistory, analysisMode }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    const answer = data.answer ?? {};
    appendChatMessage('assistant', answer.answer || 'Chưa đủ dữ liệu để kết luận.', {
      source: answer.analysisMode === 'DIRECT_ENGINE' ? 'COIN LEVEL · KHÔNG ORDER BOOK'
        : answer.analysisMode === 'DIRECT_ENGINE_BINANCE_ORDERBOOK' ? 'ENGINE NHANH · BINANCE ORDER BOOK · KHÔNG OLLAMA'
        : answer.modelApplied === false || answer.fallbackReason ? 'DỮ LIỆU ENGINE · OLLAMA CHƯA TRẢ LỜI HỢP LỆ' : `OLLAMA + ORDER BOOK · ${answer.model ?? data.model ?? 'AI LOCAL'}`,
      details: renderChatDetails(answer),
    });
    chatHistory.push({ role:'assistant', content:answer.answer || '' });
    while (chatHistory.length > 8) chatHistory.shift();
    const duration = Date.now() - requestStartedAt;
    $('#chat-status').textContent = `${modeLabel} · ${answer.model ?? data.model ?? 'qwen3:8b'}${answer.fallbackReason ? ` · ${answer.fallbackReason}` : ''} · OBSERVE ONLY · ${Math.round(duration / 1000)} giây`;
  } catch (error) {
    appendChatMessage('assistant', error.name === 'AbortError' ? 'Yêu cầu quá 90 giây, đã dừng chờ. Chưa nhận được câu trả lời; bạn có thể thử lại.' : error.message, { error:true, source:'LỖI YÊU CẦU' });
    $('#chat-status').textContent = 'Không thể trả lời lúc này; dữ liệu hoặc model local chưa sẵn sàng.';
  } finally {
    clearTimeout(deadline);
    chatHasResult = true;
    chatRunning = false;
    $('#chat-send').textContent = 'Hỏi AI';
    syncChatControls();
    if (!$('#chat-input').disabled) $('#chat-input').focus();
  }
}

// Keep a stable page-level entry point for browsers that restore a cached DOM
// without preserving module-scoped button listeners. It still goes through the
// same busy guard and the same OBSERVE ONLY API request.
window.askLocalTrendChat = askChat;

function renderList(values, empty = '—') {
  return Array.isArray(values) && values.length
    ? `<span class="list">${values.map((item) => `<span>• ${esc(item)}</span>`).join('')}</span>`
    : `<span>${empty}</span>`;
}

function renderEvaluation(result) {
  $('#empty-state').hidden = true;
  $('#evaluation').hidden = false;
  $('#market-regime').textContent = result.marketRegime ?? 'UNCLEAR';
  $('#market-bias').textContent = biasLabel[result.marketBias] ?? result.marketBias ?? '—';
  $('#market-score').textContent = `${number(result.marketScore, 1)}/100`;
  const deterministicFallback = result.deterministicFallback === true;
  $('#model-name').textContent = deterministicFallback ? 'ENGINE FALLBACK' : result.model ?? 'qwen3:8b';
  $('#evaluated-at').textContent = `${time(result.evaluatedAt)}${result.cached ? ' · cache' : ''}`;
  $('#evaluated-at').className = result.cached ? 'cached' : '';
  $('#summary').textContent = result.summary || 'Không có tóm tắt.';
  $('#btc-assessment').textContent = `BTC: ${result.btcAssessment || 'Chưa có đánh giá.'}`;
  $('#warnings').innerHTML = (result.warnings ?? []).map((item) => `<li>${esc(item)}</li>`).join('');
  const rows = [...(result.candidates ?? [])].sort((a,b) => {
    const order = { PRIORITY:0, WATCH:1, WAIT:2, AVOID:3 };
    return (order[a.verdict] ?? 9) - (order[b.verdict] ?? 9) || Number(b.strength) - Number(a.strength);
  });
  const priorityCount = rows.filter((row) => row.verdict === 'PRIORITY').length;
  $('#candidate-count').textContent = deterministicFallback
    ? `${rows.length} candidate · ${priorityCount} PRIORITY quan sát · KHÔNG BINANCE`
    : `${rows.length} candidate · ${priorityCount} PRIORITY chờ vùng engine`;
  $('#candidate-body').innerHTML = rows.map((row) => {
    const d = row.deterministic ?? {};
    const zone = d.entryZone ?? {};
    const targets = d.targetPlan?.targets ?? [];
    const q = row.qualification ?? {};
    const qTotal = Number(q.totalCount) || 6;
    const qPassed = Number(q.passedCount) || 0;
    const missing = Array.isArray(q.missing) ? q.missing : [];
    const midpoint = Number.isFinite(Number(q.midpoint))
      ? Number(q.midpoint)
      : Number.isFinite(Number(zone.low)) && Number.isFinite(Number(zone.high))
        ? (Number(zone.low) + Number(zone.high)) / 2
        : null;
    return `<tr class="${q.passed ? 'ai-qualified' : 'ai-not-qualified'}">
      <td><a class="coin" href="/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}">${esc(row.symbol)}</a><small class="side-${row.side.toLowerCase()}">${esc(row.side)} · ${esc(d.source)}</small></td>
      <td><span class="verdict verdict-${String(row.verdict).toLowerCase()}">${esc(verdictLabel[row.verdict] ?? row.verdict)}</span><small>Độ rõ ${number(row.strength,1)}/100 · không phải xác suất</small></td>
      <td><span class="qualification ${row.verdict === 'PRIORITY' ? 'qualification-pass' : 'qualification-wait'}">${row.verdict === 'PRIORITY' ? deterministicFallback ? 'PRIORITY ENGINE · CHỈ DISCORD' : 'PRIORITY · CHỜ VÙNG ENGINE' : `CHƯA ĐẠT ${qPassed}/${qTotal}`}</span><small>${row.verdict === 'PRIORITY' ? deterministicFallback ? 'Ollama lỗi: không gài route và không vào Binance' : `MARKET 1 USDT ×5 khi MARK vào ${price(zone.low)} – ${price(zone.high)} · route/Auto Controls phải ON` : esc(missing.join(' · ') || 'WATCH/WAIT chỉ quan sát')}</small></td>
      <td><strong>${esc(pathLabel[row.path] ?? row.path)}</strong><small>Khung ${esc(row.horizon)}</small></td>
      <td><strong>${price(d.livePrice)}</strong><small class="zone">${price(zone.low)} – ${price(zone.high)}</small><small class="midpoint">giữa ${price(midpoint)}</small><small>${esc(d.livePriceSource)}</small></td>
      <td>${targets.length ? targets.map((target) => `<strong>${esc(target.label)} ${price(target.price)}</strong><small>${number(target.movePct,2)}% · ${target.structural ? 'cấu trúc' : 'tham khảo'}</small>`).join('') : '—'}</td>
      <td>${renderList(row.reasons)}</td>
      <td>${renderList(row.risks)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="8">AI chưa chọn candidate nào; không tạo tín hiệu giả để lấp bảng.</td></tr>';
}

async function loadStatus() {
  const response = await fetch('/api/local-ai-trend-evaluation', { cache:'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  renderHealth(data);
  return data;
}

async function evaluate(force = false) {
  if (running) return;
  running = true;
  $('#evaluate-button').disabled = true;
  $('#evaluate-button').textContent = 'AI đang đánh giá…';
  $('#model-status').textContent = 'CPU local đang chạy; có thể mất 30–120 giây.';
  try {
    const response = await fetch('/api/local-ai-trend-evaluation', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ force }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    renderHealth(data);
    renderEvaluation(data.evaluation);
  } catch (error) {
    $('#model-status').textContent = error.message;
    $('#ollama-dot').className = 'dot error';
  } finally {
    running = false;
    $('#evaluate-button').textContent = 'Chạy đánh giá mới';
    $('#evaluate-button').disabled = false;
  }
}

$('#evaluate-button').addEventListener('click', () => evaluate(true));
$('#chat-form').addEventListener('submit', (event) => {
  event.preventDefault();
  askChat($('#chat-input').value);
});
$('#chat-send').addEventListener('mousedown', (event) => {
  if (event.button !== 0 || $('#chat-send').disabled) return;
  askChat($('#chat-input').value);
});
$('#chat-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    askChat($('#chat-input').value);
  }
});
$('#chat-input').addEventListener('input', () => {
  if (!chatRunning) $('#chat-status').textContent = 'Enter hoặc bấm Hỏi AI để gửi câu hỏi hoàn chỉnh.';
});
$('#chat-mode').addEventListener('change', () => {
  syncChatControls();
  const mode = $('#chat-mode').value;
  $('#chat-status').textContent = mode === 'DIRECT_ENGINE'
    ? 'Coin cụ thể: trả trực tiếp từ nến/engine, không gọi Ollama và không dùng order book.'
    : mode === 'DIRECT_ENGINE_BINANCE_ORDERBOOK'
      ? 'Coin cụ thể: lấy nến/engine + Binance order book/LiqScan và vẽ chart, không gọi Ollama.'
      : 'Coin cụ thể: gửi qua Ollama với Binance Futures order book/LiqScan.';
});
document.querySelectorAll('[data-chat-question]').forEach((button) => {
  button.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || button.disabled) return;
    askChat(button.dataset.chatQuestion);
  });
  button.addEventListener('click', () => askChat(button.dataset.chatQuestion));
});
loadStatus().then((data) => {
  if (!data.evaluation) evaluate(false);
}).catch((error) => {
  $('#ollama-status').textContent = 'Không đọc được API AI Local';
  $('#model-status').textContent = error.message;
  $('#ollama-dot').className = 'dot error';
});

setInterval(() => {
  if (running || chatRunning || document.hidden) return;
  loadStatus().catch(() => {});
}, 30_000);
