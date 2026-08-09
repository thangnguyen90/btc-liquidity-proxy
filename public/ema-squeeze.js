import { installBinanceCardAvgRoeGuard } from './binance-card-visibility.js';
import { installLiveCardWhitelistUi, liveCardAttrs } from './live-card-whitelist-ui.js?v=20260802-live-whitelist-v5-two-step';

installBinanceCardAvgRoeGuard();

const SSE_URL = '/api/ema-squeeze-stream';
const API_URL = '/api/ema-squeeze-signals';

let allSignals = [];
let scannedAt  = null;
let total      = 0;
let activeStage = 'all';  // 'all' | 'BREAKOUT' | 'BREAKDOWN' | 'PRE_BREAKOUT' | 'PRE_BREAKDOWN' | 'SQUEEZE' | 'RUNNER' | 'BR_LIKE' | 'BR_LIKE_SHORT' | 'SQUEEZE_SHORT'
let esPaperTrades = [];
let esPaperSort = { key: 'status', dir: 'asc' };
let esPaperTypeFilter = 'all';
let esPaperDayFilter = 'all';
let esPaperTfFilter = 'all';
let esPaperCandleFlagFilter = 'all';
let esStageCandleFilter = 'all';
let esPaperPage = 1;
let esPaperLimit = 300;
let esPaperPagination = null;
let esPaperServerSummary = null; // summary tổng từ server (gồm net PnL realized+unrealized theo mark live)
let esPaperAvailableDays = [];
let esSupportEntryStats = null;

const grid          = document.getElementById('esGrid');
const breakoutCount = document.getElementById('breakoutCount');
const squeezeCount  = document.getElementById('squeezeCount');
const avgScore      = document.getElementById('avgScore');
const lastScan      = document.getElementById('lastScan');
const nextRefresh   = document.getElementById('nextRefresh');
const scanStatus    = document.getElementById('scanStatus');
const scanMeta      = document.getElementById('scanMeta');
const metaTotal     = document.getElementById('metaTotal');
const metaSignals   = document.getElementById('metaSignals');
const metaTime      = document.getElementById('metaTime');
const visibleCount  = document.getElementById('visibleCount');
const searchInput   = document.getElementById('searchInput');
const searchClear   = document.getElementById('searchClear');
const scoreFilter   = document.getElementById('scoreFilter');
const spreadFilter  = document.getElementById('spreadFilter');
const sortSelect    = document.getElementById('sortSelect');
const esPaperTypeSelect = document.getElementById('esPaperTypeFilter');
const esPaperDaySelect = document.getElementById('esPaperDayFilter');
const esPaperTfSelect = document.getElementById('esPaperTfFilter');
const esPaperCandleFlagSelect = document.getElementById('esPaperCandleFlagFilter');
const esStageCandleSelect = document.getElementById('esStageCandleFilter');
const esPaperOverview = document.getElementById('esPaperOverview');
const esSupportEntryGroups = document.getElementById('esSupportEntryGroups');
const esSupportEntryShort = document.getElementById('esSupportEntryShort');
const esSupportEntryLong = document.getElementById('esSupportEntryLong');
const esPaperScrollTop = document.getElementById('esPaperScrollTop');
const esPaperScrollTopSpacer = document.getElementById('esPaperScrollTopSpacer');
const esPaperScroll = document.getElementById('esPaperScroll');
const esPaperTable = esPaperScroll?.querySelector('.es-paper-table');
const btcSqueezeContextEl = document.getElementById('btcSqueezeContext');
const emaSqueezeAutoOrderChk = document.getElementById('emaSqueezeAutoOrderChk');
const emaSqueezeAutoOrderWrap = document.getElementById('emaSqueezeAutoOrderWrap');
const emaSqueezeAutoOrderText = document.getElementById('emaSqueezeAutoOrderText');

let btcSqueezeContext = null;

installLiveCardWhitelistUi({
  page: 'ema',
  label: 'EMA',
  mountBefore: esPaperOverview,
});

if (esPaperScrollTop && esPaperScrollTopSpacer && esPaperScroll && esPaperTable) {
  let syncingPaperScroll = false;
  const syncPaperScroll = (source, target) => {
    if (syncingPaperScroll) return;
    syncingPaperScroll = true;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => { syncingPaperScroll = false; });
  };
  const updatePaperScrollWidth = () => {
    esPaperScrollTopSpacer.style.width = `${esPaperTable.scrollWidth}px`;
    esPaperScrollTop.scrollLeft = esPaperScroll.scrollLeft;
  };
  esPaperScrollTop.addEventListener('scroll', () => syncPaperScroll(esPaperScrollTop, esPaperScroll), { passive: true });
  esPaperScroll.addEventListener('scroll', () => syncPaperScroll(esPaperScroll, esPaperScrollTop), { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(updatePaperScrollWidth).observe(esPaperTable);
  window.addEventListener('resize', updatePaperScrollWidth, { passive: true });
  requestAnimationFrame(updatePaperScrollWidth);
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPrice(p) {
  if (p == null || isNaN(p)) return '-';
  if (p >= 10000) return p.toLocaleString('en', { maximumFractionDigits: 1 });
  if (p >= 1000)  return p.toLocaleString('en', { maximumFractionDigits: 2 });
  if (p >= 100)   return p.toFixed(3);
  if (p >= 1)     return p.toFixed(4);
  if (p >= 0.01)  return p.toFixed(5);
  return p.toFixed(6);
}

function fmtPct(v, digits = 2) {
  if (v == null || isNaN(v)) return '-';
  return (v >= 0 ? '+' : '') + Number(v).toFixed(digits) + '%';
}

function fmtPnl(pnl, roe) {
  if (pnl == null || isNaN(pnl)) return '-';
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}${Number(pnl).toFixed(3)} (${sign}${Number(roe ?? 0).toFixed(1)}%)`;
}

function timeAgo(ts) {
  if (!ts) return '-';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function fmtSigned(v, digits = 2) {
  if (v == null || isNaN(v)) return '-';
  const n = Number(v);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderEsCandlePattern(t = {}) {
  const raw = t.candlePatternAtEntry;
  const name = String(raw?.name ?? raw ?? t.brCandleKind ?? 'NO_DATA').toUpperCase();
  const labels = {
    BULLISH_ENGULFING: 'Bullish Engulfing', BEARISH_ENGULFING: 'Bearish Engulfing',
    SHOOTING_STAR: 'Shooting Star', BULLISH_PIN_BAR: 'Bullish Pin Bar',
    BEARISH_PIN_BAR: 'Bearish Pin Bar', BULLISH_MARUBOZU: 'Bullish Marubozu',
    BEARISH_MARUBOZU: 'Bearish Marubozu', BULLISH_CANDLE: 'Bullish Candle',
    BEARISH_CANDLE: 'Bearish Candle', DOJI: 'Doji', HAMMER: 'Hammer',
    NO_DATA: 'No data', UNKNOWN: 'No data',
  };
  const direction = String(raw?.direction ?? t.brCandleDir ?? 'NEUTRAL').toUpperCase();
  const tone = direction.includes('BULL') || direction === 'GREEN'
    ? '#34d399'
    : direction.includes('BEAR') || direction === 'RED' ? '#fb7185' : '#fbbf24';
  const timeframe = String(raw?.timeframe ?? t.candlePatternTimeframe ?? getEsTimeframe(t) ?? '-').toUpperCase();
  return `<span style="display:inline-block;min-width:116px;color:${tone};font-weight:900">${escapeHtml(labels[name] ?? name.replaceAll('_', ' '))}<small style="display:block;margin-top:3px;color:var(--muted);font-size:9px">${escapeHtml(timeframe)} · lúc vào lệnh</small></span>`;
}

function renderEsBtcCandlePattern(t = {}) {
  return renderEsCandlePattern({
    ...t,
    candlePatternAtEntry: t.btcCandlePatternAtEntry ?? t.btcCandlePattern5m ?? null,
    candlePatternTimeframe: t.btcCandlePatternAtEntry?.timeframe
      ?? t.btcCandlePattern5m?.timeframe
      ?? '5m',
    brCandleKind: null,
    brCandleDir: null,
  });
}

function zoneText(zone) {
  if (!zone) return '-';
  return `${fmtPrice(zone.low)} - ${fmtPrice(zone.high)}`;
}

function zoneDistText(zone) {
  if (!zone || zone.distancePctLow == null || zone.distancePctHigh == null) return '-';
  return `${fmtPct(zone.distancePctLow, 1)} -> ${fmtPct(zone.distancePctHigh, 1)}`;
}

function buildBtcSqueezeContext(data) {
  const liq = data?.liquidationProxy ?? {};
  const cluster = liq.killZoneCluster ?? {};
  const signalLabel = String(data?.signal?.label ?? '').toLowerCase();
  const quickDir = String(data?.quickScan?.direction ?? '').toLowerCase();
  const direction = String(cluster.direction ?? '').toLowerCase();
  const bias = Number(liq.bias ?? 0);
  const bearish = direction === 'below' || cluster.side === 'DOWN' || bias < -0.15 || quickDir === 'short' || signalLabel.includes('bearish');
  const bullish = direction === 'above' || cluster.side === 'UP' || bias > 0.15 || quickDir === 'long' || signalLabel.includes('bullish');
  const side = bearish && !bullish ? 'short' : bullish && !bearish ? 'long' : 'neutral';
  const market = data?.market ?? {};
  const ls = market.longShortRatio ?? {};
  const note = side === 'short'
    ? 'BTC đang ưu tiên kéo xuống quét long. LONG squeeze alt nên thận trọng nếu BTC mất hỗ trợ; SHORT/squeeze short thuận gió hơn.'
    : side === 'long'
      ? 'BTC đang ưu tiên kéo lên quét short. SHORT squeeze alt nên thận trọng nếu BTC giữ lực mua; LONG/breakout thuận gió hơn.'
      : 'BTC chưa có hướng liquidation rõ. Ưu tiên theo score, entry liquid và lực riêng từng coin.';

  return {
    side,
    mark: data?.price?.mark ?? null,
    quickDir: data?.quickScan?.direction ?? '-',
    quickScore: data?.quickScan?.score ?? null,
    label: data?.signal?.label ?? '-',
    signalScore: data?.signal?.score ?? null,
    bias,
    liquidityAbove: liq.liquidityAbove ?? null,
    liquidityBelow: liq.liquidityBelow ?? null,
    sweep: liq.sweepTarget ?? null,
    mainZone: cluster.mainKillZone ?? null,
    farZone: cluster.farKillZone ?? null,
    takerBuyRatio: market.takerBuyRatio ?? null,
    longAccount: ls.longAccount ?? null,
    shortAccount: ls.shortAccount ?? null,
    momentumPct: market.momentumPct ?? null,
    note,
    updatedAt: Date.now(),
  };
}

function renderBtcSqueezeContext() {
  if (!btcSqueezeContextEl) return;
  if (!btcSqueezeContext) {
    btcSqueezeContextEl.innerHTML = `
      <div class="btc-sq-top">
        <span class="btc-sq-title">BTC liquidation context</span>
        <strong class="btc-sq-bias">Loading...</strong>
      </div>
    `;
    return;
  }

  const ctx = btcSqueezeContext;
  btcSqueezeContextEl.className = `btc-squeeze-context btc-sq-context ${ctx.side === 'short' ? 'bearish' : ctx.side === 'long' ? 'bullish' : ''}`;
  const biasLabel = ctx.side === 'short'
    ? 'Bearish: canh quét LONG'
    : ctx.side === 'long'
      ? 'Bullish: canh quét SHORT'
      : 'Neutral';
  const biasColor = ctx.side === 'short' ? 'var(--red)' : ctx.side === 'long' ? 'var(--green)' : 'var(--muted)';
  const sweepText = ctx.sweep
    ? `${fmtPrice(ctx.sweep.price)} (${fmtPct(ctx.sweep.distancePct, 1)})`
    : '-';
  const liqRatio = ctx.liquidityAbove != null && ctx.liquidityBelow != null
    ? `${Number(ctx.liquidityAbove).toFixed(1)}B / ${Number(ctx.liquidityBelow).toFixed(1)}B`
    : '-';
  const lsText = ctx.longAccount != null && ctx.shortAccount != null
    ? `${Number(ctx.longAccount).toFixed(0)}% long / ${Number(ctx.shortAccount).toFixed(0)}% short`
    : '-';

  btcSqueezeContextEl.innerHTML = `
    <div class="btc-sq-top">
      <span class="btc-sq-title">BTC liquidation context</span>
      <strong class="btc-sq-bias" style="color:${biasColor}">${biasLabel}</strong>
    </div>
    <div class="btc-sq-grid">
      <div class="btc-sq-cell"><span>BTC mark</span><strong>${fmtPrice(ctx.mark)}</strong></div>
      <div class="btc-sq-cell"><span>Quick scan</span><strong>${ctx.quickDir} ${ctx.quickScore != null ? Number(ctx.quickScore).toFixed(3) : ''}</strong></div>
      <div class="btc-sq-cell"><span>Signal</span><strong>${ctx.label} ${ctx.signalScore != null ? Number(ctx.signalScore).toFixed(0) : ''}</strong></div>
      <div class="btc-sq-cell"><span>Bias / liquidity</span><strong>${fmtSigned(ctx.bias, 2)} · ${liqRatio}</strong></div>
      <div class="btc-sq-cell"><span>Near sweep</span><strong>${sweepText}</strong></div>
      <div class="btc-sq-cell"><span>Main kill zone</span><strong>${zoneText(ctx.mainZone)} · ${zoneDistText(ctx.mainZone)}</strong></div>
      <div class="btc-sq-cell"><span>Far kill zone</span><strong>${zoneText(ctx.farZone)} · ${zoneDistText(ctx.farZone)}</strong></div>
      <div class="btc-sq-cell"><span>Flow</span><strong>Taker ${ctx.takerBuyRatio != null ? Number(ctx.takerBuyRatio).toFixed(2) : '-'} · L/S ${lsText}</strong></div>
    </div>
    <div class="btc-sq-note">${ctx.note} Updated ${new Date(ctx.updatedAt).toLocaleTimeString('vi')}.</div>
  `;
}

function btcChartChipForSignal(sig) {
  const rel = sig.btcChartRelation;
  if (!rel) return { cls: 'btc-warn', label: 'BTC chart chưa có cache' };
  if (rel.relation === 'aligned') return { cls: 'btc-ok', label: 'Chart giống BTC' };
  if (rel.relation === 'opposed') return { cls: 'btc-warn', label: 'Chart ngược BTC' };
  if (rel.relation === 'same_direction_weak_corr') return { cls: 'warn', label: 'Cùng hướng BTC yếu' };
  if (rel.relation === 'decoupled') return { cls: 'runner', label: 'Tách BTC' };
  return { cls: 'bad', label: 'BTC/coin nhiễu' };
}

function btcChartDirectionBanner(sig) {
  const rel = sig.btcChartRelation;
  if (!rel) {
    return `
      <div class="btc-direction-alert neutral">
        <span>Chưa có chart BTC cùng nến</span>
        <small>Đợi cache BTC ${sig.interval ?? ''} warm-up</small>
      </div>
    `;
  }

  const cls = rel.relation === 'aligned'
    ? 'aligned'
    : rel.relation === 'opposed'
      ? 'opposed'
      : 'neutral';
  const title = rel.relation === 'aligned'
    ? 'CHART BÁM BTC - CHỈ ĐÁNH CÙNG HƯỚNG'
    : rel.relation === 'opposed'
      ? 'CHART NGƯỢC BTC - KHÔNG LỌC BTC'
      : rel.relation === 'decoupled'
        ? 'CHART TÁCH BTC - KHÔNG LỌC BTC'
        : rel.relation === 'same_direction_weak_corr'
          ? 'CÙNG HƯỚNG BTC NHƯNG YẾU - THAM KHẢO'
          : 'BTC/COIN ĐANG NHIỄU - KHÔNG LỌC BTC';
  const btcDir = Math.abs(Number(rel.btcMovePct ?? 0)) < 0.15
    ? 'BTC flat'
    : Number(rel.btcMovePct) > 0 ? 'BTC LONG' : 'BTC SHORT';
  const detail = `Coin ${fmtPct(rel.coinMovePct, 2)} · BTC ${fmtPct(rel.btcMovePct, 2)} (${btcDir}) · corr ${rel.corr ?? '-'} · ${rel.bars} nến`;

  return `
    <div class="btc-direction-alert ${cls}">
      <span>${title}</span>
      <small>${detail}</small>
    </div>
  `;
}

function realOrderBadge(sig) {
  const st = sig.realOrderStatus;
  if (!st) return '';
  const cls = st.status === 'CANDIDATE'
    ? 'ok'
    : st.code === 'BTC_CHART'
      ? 'block-btc'
      : st.status === 'DISABLED'
        ? 'off'
        : 'block';
  const label = st.label ?? (st.status === 'CANDIDATE' ? 'REAL OK' : 'REAL BLOCK');
  const reason = String(st.reason ?? st.code ?? '').replace(/"/g, '&quot;');
  return `<span class="real-order-badge ${cls}" title="${reason}">${label}</span>`;
}

async function loadBtcSqueezeContext() {
  if (!btcSqueezeContextEl) return;
  try {
    const res = await fetch('/api/analyze?symbol=BTCUSDT&interval=15m&rangePct=0.20&binSizePct=0.001&limit=192', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    btcSqueezeContext = buildBtcSqueezeContext(data);
    renderBtcSqueezeContext();
    render();
  } catch (e) {
    btcSqueezeContextEl.className = 'btc-squeeze-context btc-sq-context';
    btcSqueezeContextEl.innerHTML = `
      <div class="btc-sq-top">
        <span class="btc-sq-title">BTC liquidation context</span>
        <strong class="btc-sq-bias" style="color:var(--amber)">Không tải được BTC context</strong>
      </div>
      <div class="btc-sq-note">Giữ nguyên tín hiệu EMA Squeeze hiện tại; sẽ thử lại ở chu kỳ sau.</div>
    `;
  }
}

function setEmaSqueezeAutoUi({ enabled, envEnabled = true } = {}) {
  if (!emaSqueezeAutoOrderChk || !emaSqueezeAutoOrderWrap || !emaSqueezeAutoOrderText) return;
  emaSqueezeAutoOrderChk.checked = !!enabled;
  emaSqueezeAutoOrderChk.disabled = !envEnabled;
  emaSqueezeAutoOrderWrap.classList.toggle('off', !enabled);
  emaSqueezeAutoOrderWrap.classList.toggle('disabled', !envEnabled);
  emaSqueezeAutoOrderText.textContent = !envEnabled
    ? 'Auto Binance OFF ENV'
    : enabled
      ? 'Auto Binance ON'
      : 'Auto Binance OFF';
}

async function loadEmaSqueezeAutoOrderEnabled() {
  if (!emaSqueezeAutoOrderChk) return;
  try {
    const res = await fetch('/api/ema-squeeze-auto-order-enabled', { cache: 'no-store' });
    if (!res.ok) return;
    setEmaSqueezeAutoUi(await res.json());
  } catch {}
}

async function saveEmaSqueezeAutoOrderEnabled() {
  if (!emaSqueezeAutoOrderChk) return;
  const nextEnabled = emaSqueezeAutoOrderChk.checked;
  setEmaSqueezeAutoUi({ enabled: nextEnabled, envEnabled: !emaSqueezeAutoOrderChk.disabled });
  try {
    const res = await fetch('/api/ema-squeeze-auto-order-enabled', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: nextEnabled }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setEmaSqueezeAutoUi(await res.json());
  } catch {
    emaSqueezeAutoOrderChk.checked = !nextEnabled;
    setEmaSqueezeAutoUi({ enabled: emaSqueezeAutoOrderChk.checked, envEnabled: !emaSqueezeAutoOrderChk.disabled });
  }
}

// ── Card builder ──────────────────────────────────────────────────────────────

function buildCard(sig) {
  const isShort       = sig.action === 'SHORT' || sig.stage === 'BREAKDOWN' || sig.stage === 'PRE_BREAKDOWN' || sig.stage === 'SQUEEZE_SHORT';
  const isBreakout    = sig.stage === 'BREAKOUT' || sig.stage === 'BREAKDOWN';
  const isPreBreakout = sig.stage === 'PRE_BREAKOUT' || sig.preBreakout;
  const isPreBreakdown = sig.stage === 'PRE_BREAKDOWN' || sig.preBreakdown;
  const isRunner      = !!sig.runnerCandidate;
  const breakoutQuality = isBreakout && sig.stage === 'BREAKOUT'
    ? String(sig.breakoutQuality ?? 'REVIEW').toUpperCase()
    : null;
  const breakoutQualityClass = breakoutQuality ? ` breakout-${breakoutQuality.toLowerCase()}` : '';
  const breakoutQualityBanner = breakoutQuality
    ? `<div class="breakout-quality-banner ${breakoutQuality.toLowerCase()}">${
        breakoutQuality === 'PREMIUM'
          ? 'PREMIUM BREAKOUT - Paper duoc phep'
          : breakoutQuality === 'QUALITY'
            ? 'QUALITY BREAKOUT - Paper duoc phep'
            : breakoutQuality === 'EXHAUSTION'
              ? 'EXHAUSTION - Canh bao nong, khong vao Paper'
              : 'REVIEW - Ngoai tap chat luong, khong vao Paper'
      }${sig.breakoutQualityReason ? ` · ${sig.breakoutQualityReason}` : ''}</div>`
    : '';
  const stageClass    = sig.stage === 'BREAKOUT'
    ? 'stage-breakout'
    : sig.stage === 'PRE_BREAKOUT'
      ? 'stage-pre-breakout'
      : sig.stage === 'PRE_BREAKDOWN'
        ? 'stage-pre-breakdown'
      : sig.stage === 'BREAKDOWN'
        ? 'stage-breakdown'
        : sig.stage === 'SQUEEZE_SHORT'
          ? 'stage-squeeze-short'
          : 'stage-squeeze';
  const stageBadgeCls = sig.stage.toLowerCase().replace('_', '-');
  const stageName     = sig.stage === 'BREAKOUT'
    ? '🟢 BREAKOUT'
    : sig.stage === 'PRE_BREAKOUT'
      ? '🟦 PRE BREAKOUT'
      : sig.stage === 'PRE_BREAKDOWN'
        ? '🟪 PRE BREAKDOWN'
      : sig.stage === 'BREAKDOWN'
        ? '🔴 BREAKDOWN'
        : sig.stage === 'SQUEEZE_SHORT'
          ? '🟥 SQUEEZE SHORT'
          : '🔶 SQUEEZE';
  const intervalName  = sig.interval ?? '15m';
  const changeColor   = (sig.change24h ?? 0) >= 0 ? 'var(--green)' : 'var(--red)';
  const btcBanner     = btcChartDirectionBanner(sig);
  const realBadge     = realOrderBadge(sig);
  const hasLiquidEntry = sig.liquidEntryOk && sig.liquidEntry != null;
  const paperEntry = hasLiquidEntry ? (sig.paperEntry ?? sig.liquidBestEntry ?? sig.liquidEntry) : sig.entry;
  const paperTp = hasLiquidEntry ? (sig.paperTp ?? sig.tp) : sig.tp;
  const paperSl = hasLiquidEntry ? (sig.paperSl ?? sig.sl) : sig.sl;
  const liquidDiffPct = hasLiquidEntry && paperEntry && sig.liquidEntry
    ? ((Number(sig.liquidEntry) - Number(paperEntry)) / Number(paperEntry)) * 100
    : null;

  // Compression progress bar
  const squeezeRatio = sig.lbTotal > 0 ? Math.min(1, (sig.squeezeBars ?? 0) / sig.lbTotal) : 0;
  const tightRatio   = sig.squeezeBars > 0 ? Math.min(1, (sig.tightBars ?? 0) / sig.squeezeBars) : 0;
  const barClass     = tightRatio > 0.5 ? 'tight' : 'moderate';
  const spreadPctStr = sig.spreadPct != null ? (sig.spreadPct * 100).toFixed(1) : '?';
  const tightLabel   = sig.spreadPct < 0.03 ? '🔴 Rất chặt' : sig.spreadPct < 0.06 ? '🟡 Chặt vừa' : '⚪ Nhẹ';

  // Chips
  const chips = [];
  chips.push(`<span class="es-chip ok">${intervalName}</span>`);
  const btcChip = btcChartChipForSignal(sig);
  if (btcChip) chips.push(`<span class="es-chip ${btcChip.cls}">${btcChip.label}</span>`);
  const rsi = sig.rsi;
  if (rsi != null) {
    const rsiCls = rsi > 75 ? 'warn' : rsi >= 50 ? 'ok' : 'warn';
    chips.push(`<span class="es-chip ${rsiCls}">RSI ${rsi}</span>`);
  }
  if (isBreakout && sig.volRatio != null) {
    const v = sig.breakoutVolRatio ?? sig.volRatio;
    const vCls = v >= 3 ? 'ok' : v >= 2 ? 'warn' : 'bad';
    chips.push(`<span class="es-chip ${vCls}">Break Vol ${Number(v).toFixed(1)}×</span>`);
  }
  if (isPreBreakout) {
    const pv = Number(sig.pulseVolRatio ?? sig.volRatio ?? 0);
    chips.push(`<span class="es-chip runner">Pre Vol ${pv.toFixed(1)}×</span>`);
    chips.push(`<span class="es-chip ok">Green ${sig.greenPulseBars ?? '?'}</span>`);
  }
  if (isPreBreakdown) {
    const pv = Number(sig.pulseVolRatio ?? sig.volRatio ?? 0);
    chips.push(`<span class="es-chip danger">Pre Vol ${pv.toFixed(1)}×</span>`);
    chips.push(`<span class="es-chip danger">Red ${sig.redPulseBars ?? '?'}</span>`);
  }
  if (Number(sig.brLikeScore ?? 0) >= 55) {
    const cls = isShort ? 'danger' : (Number(sig.brLikeScore) >= 82 ? 'br-hot' : 'br-like');
    chips.push(`<span class="es-chip ${cls}" title="${isShort ? 'BR-like SHORT: EMA nen o dinh/base, volume do phinh, roi gay xuong' : 'BR-like LONG: EMA nen o nen, volume xanh phinh, roi keo manh'}">${sig.brLikeLabel ?? (isShort ? 'BR-like short' : 'BR-like')} ${Number(sig.brLikeScore).toFixed(0)}</span>`);
  }
  if (sig.baseRangePct != null) {
    const b = Number(sig.baseRangePct) * 100;
    chips.push(`<span class="es-chip ${b <= 6 ? 'ok' : 'warn'}">Base ${b.toFixed(1)}%</span>`);
  }
  if (isBreakout && sig.pumpMovePct != null) {
    chips.push(`<span class="es-chip ok">${isShort ? 'Dump' : 'Pump'} ${Number(sig.pumpMovePct).toFixed(1)}%</span>`);
  }
  if (breakoutQuality) {
    const qualityChipClass = breakoutQuality === 'EXHAUSTION'
      ? 'bad'
      : breakoutQuality === 'REVIEW'
        ? 'warn'
        : 'runner';
    chips.push(`<span class="es-chip ${qualityChipClass}">${breakoutQuality}</span>`);
  }
  if (isRunner) {
    chips.push(`<span class="es-chip runner">RUNNER ${Number(sig.runnerScore ?? 0).toFixed(0)}</span>`);
    if (sig.runnerProjectedMovePct != null) {
      chips.push(`<span class="es-chip runner">Projected ${isShort ? '-' : '+'}${Number(sig.runnerProjectedMovePct).toFixed(1)}%</span>`);
    }
  }
  if (isBreakout && sig.breakoutAge != null) {
    const ageCls = sig.breakoutAge <= 1 ? 'ok' : sig.breakoutAge <= 3 ? 'warn' : 'bad';
    chips.push(`<span class="es-chip ${ageCls}">${isShort ? 'Down' : 'Break'} ${sig.breakoutAge === 0 ? 'nến này' : sig.breakoutAge + ' nến trước'}</span>`);
  }
  chips.push(`<span class="es-chip">Nén ${sig.squeezeBars ?? '?'}/${sig.lbTotal ?? '?'} nến</span>`);
  chips.push(`<span class="es-chip">Chặt ${sig.tightBars ?? '?'} nến</span>`);

  // EMA values
  const emaChip = [sig.ema13, sig.ema25, sig.ema99].every((v) => v != null)
    ? `<span class="es-chip" title="EMA13 / EMA25 / EMA99">${fmtPrice(sig.ema13)} · ${fmtPrice(sig.ema25)} · ${fmtPrice(sig.ema99)}</span>`
    : '';
  if (emaChip) chips.push(emaChip);
  if (hasLiquidEntry) {
    const liq = sig.liquidityEntry ?? {};
    chips.push(`<span class="es-chip ok">Liquid zone ${fmtPrice(sig.liquidEntry)}</span>`);
    if (liquidDiffPct != null && Math.abs(liquidDiffPct) >= 0.05) {
      chips.push(`<span class="es-chip">Paper ${fmtPrice(paperEntry)} (${liquidDiffPct > 0 ? '+' : ''}${liquidDiffPct.toFixed(2)}%)</span>`);
    }
    if (liq.sweepProb != null) chips.push(`<span class="es-chip ok">Sweep ${Number(liq.sweepProb).toFixed(0)}</span>`);
  }
  const paperPayload = encodeURIComponent(JSON.stringify({
    symbol: sig.symbol,
    side: isShort ? 'SHORT' : 'LONG',
    status: isBreakout ? 'OPEN' : 'PENDING',
    marginUsdt: sig.stage === 'BREAKOUT' ? 10 : 1,
    leverage: 10,
    entryPrice: isBreakout ? sig.entry : paperEntry,
    tp: paperTp ?? null,
    sl: paperSl ?? null,
    source: `emasq-${intervalName}-${String(sig.stage ?? '').toLowerCase()}${isRunner ? '-runner' : ''}-${sig.score}`,
    note: [
      sig.liquidityEntryNote ?? sig.note ?? sig.reason ?? '',
      isRunner ? `runner=Y | runnerSide=${isShort ? 'SHORT' : 'LONG'} | runnerScore=${Number(sig.runnerScore ?? 0).toFixed(0)} | runnerTP=${fmtPrice(sig.runnerTp)} | runnerProjected=${isShort ? '-' : '+'}${Number(sig.runnerProjectedMovePct ?? 0).toFixed(1)}%` : '',
    ].filter(Boolean).join(' | '),
    signalMarkPrice: sig.markPrice ?? null,
    entryPlan: sig.liquidityEntryPlan ?? null,
    runnerCandidate: isRunner,
    runnerScore: isRunner ? Number(sig.runnerScore ?? 0) : null,
    runnerTp: isRunner ? Number(sig.runnerTp ?? 0) : null,
    runnerProjectedMovePct: isRunner ? Number(sig.runnerProjectedMovePct ?? 0) : null,
    runnerReason: isRunner ? (sig.runnerReason ?? null) : null,
    breakoutQuality: breakoutQuality,
    breakoutQualityReason: sig.breakoutQualityReason ?? null,
    breakoutPaperEligible: sig.breakoutPaperEligible ?? null,
  }));
  const paperBlocked = breakoutQuality && sig.breakoutPaperEligible !== true;

  return `
    <article class="es-card ${stageClass}${isRunner ? ' runner' : ''}${breakoutQualityClass}">
      <div class="es-card-top">
        <div class="es-symbol-wrap">
          <a class="es-symbol" href="/?symbol=${sig.symbol}" target="_blank">
            ${sig.symbol.replace(/USDT$/, '')}<span class="sym-usdt">USDT</span>
          </a>
          <span class="es-change" style="color:${changeColor}">${fmtPct(sig.change24h)} 24h · ${fmtPrice(sig.markPrice)}</span>
        </div>
        <div class="es-right">
          <span class="es-stage-badge ${stageBadgeCls}">${stageName} · ${intervalName}</span>
          ${realBadge}
          <div class="es-score-wrap">
            <span class="es-score-num">${sig.score}</span>
            <span class="es-grade grade-${sig.grade.toLowerCase()}">${sig.grade}</span>
          </div>
        </div>
      </div>

      ${btcBanner}
      ${breakoutQualityBanner}

      <div class="es-compress-bar">
        <div class="es-compress-label">
          <span>EMA Compression · Spread ${spreadPctStr}% · ${tightLabel}</span>
          <span>${Math.round(squeezeRatio * 100)}%</span>
        </div>
        <div class="es-bar-track">
          <div class="es-bar-fill ${barClass}" style="width:${Math.round(squeezeRatio * 100)}%"></div>
        </div>
      </div>

      <div class="es-prices">
        <div class="es-price-cell">
          <span>Entry EMA</span>
          <strong>${fmtPrice(sig.emaEntry ?? sig.entry)}</strong>
        </div>
        <div class="es-price-cell ${hasLiquidEntry ? 'liquid' : 'muted'}">
          <span>Entry Liquid</span>
          <strong>${hasLiquidEntry ? fmtPrice(sig.liquidEntry) : '-'}</strong>
        </div>
        <div class="es-price-cell">
          <span>SL</span>
          <strong style="color:${isShort ? 'var(--green)' : 'var(--red)'}">${fmtPrice(paperSl)}</strong>
        </div>
        <div class="es-price-cell">
          <span>TP</span>
          <strong style="color:${isShort ? 'var(--red)' : 'var(--green)'}">${fmtPrice(paperTp)}</strong>
        </div>
        <div class="es-price-cell ${isRunner ? 'liquid' : 'muted'}">
          <span>Runner TP</span>
          <strong>${isRunner ? fmtPrice(sig.runnerTp) : '-'}</strong>
        </div>
      </div>

      <div class="es-chips">${chips.join('')}</div>

      ${sig.reason ? `<div class="es-note">${sig.reason}</div>` : ''}
      ${sig.runnerReason ? `<div class="es-note" style="color:#67e8f9">${sig.runnerReason}</div>` : ''}
      ${sig.note    ? `<div class="es-note" style="opacity:.7">${sig.note}</div>` : ''}

      <div class="es-footer">
        <span>${timeAgo(sig.scannedAt)}</span>
        <button class="es-paper-btn ${isShort ? 'short' : 'long'}" ${paperBlocked ? 'disabled title="Breakout khong dat QUALITY/PREMIUM"' : `onclick="createEmaSqueezePaper(this,'${paperPayload}')"`}>${paperBlocked ? 'Paper blocked' : '+ Paper'}</button>
      </div>
    </article>
  `;
}

window.createEmaSqueezePaper = async function(btn, encodedPayload) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const payload = JSON.parse(decodeURIComponent(encodedPayload));
    const res = await fetch('/api/pump-paper-trades', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    btn.textContent = res.ok ? 'Added' : 'ERR';
    if (res.ok) await loadEsPaperTrades();
  } catch {
    btn.textContent = 'ERR';
  } finally {
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1800);
  }
};

// ── EMA Squeeze Paper Trades ─────────────────────────────────────────────────

document.addEventListener('click', (e) => {
  const th = e.target.closest('[data-es-sort]');
  if (!th || !th.classList.contains('es-paper-sort')) return;
  const key = th.dataset.esSort;
  if (esPaperSort.key === key) {
    esPaperSort.dir = esPaperSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    esPaperSort = { key, dir: key === 'status' || key === 'candleFlag' ? 'asc' : 'desc' };
  }
  renderEsPaperTable();
});

// Filter đổi -> reload từ server (server lọc + tính lại summary/pagination khớp filter), về trang 1
if (esPaperTypeSelect) {
  esPaperTypeSelect.addEventListener('change', () => {
    esPaperTypeFilter = esPaperTypeSelect.value || 'all';
    loadEsPaperTrades(1);
    connectEsPaperStream();
  });
}

if (esPaperDaySelect) {
  esPaperDaySelect.addEventListener('change', () => {
    esPaperDayFilter = esPaperDaySelect.value || 'all';
    loadEsPaperTrades(1);
    connectEsPaperStream();
  });
}

if (esPaperTfSelect) {
  esPaperTfSelect.addEventListener('change', () => {
    esPaperTfFilter = esPaperTfSelect.value || 'all';
    loadEsPaperTrades(1);
    connectEsPaperStream();
  });
}

// Ngày local YYYY-MM-DD theo thời điểm tạo lệnh
function getEsDay(t) {
  // UTC date để khớp filter server (server lọc theo createdAt.slice(0,10) UTC)
  const ts = t.createdAt ?? t.closedAt;
  if (!ts) return '?';
  return String(ts).slice(0, 10);
}

// Cập nhật options ngày từ danh sách trades hiện có (giữ lựa chọn đang chọn)
function updateEsDayFilterOptions() {
  if (!esPaperDaySelect) return;
  const pageDays = esPaperTrades.map(getEsDay).filter((d) => d && d !== '?');
  const days = [...new Set([...esPaperAvailableDays, ...pageDays, esPaperDayFilter !== 'all' ? esPaperDayFilter : ''])]
    .filter((d) => d && d !== 'all')
    .sort((a, b) => b.localeCompare(a));
  const prev = esPaperDayFilter;
  esPaperDaySelect.innerHTML = '<option value="all">Tất cả</option>'
    + days.map((d) => `<option value="${d}">${d}</option>`).join('');
  esPaperDaySelect.value = prev !== 'all' ? prev : 'all';
}

if (esPaperCandleFlagSelect) {
  esPaperCandleFlagSelect.addEventListener('change', () => {
    esPaperCandleFlagFilter = esPaperCandleFlagSelect.value || 'all';
    renderEsPaperTable();
  });
}

if (esStageCandleSelect) {
  esStageCandleSelect.addEventListener('change', () => {
    esStageCandleFilter = esStageCandleSelect.value || 'all';
    loadEsPaperTrades(1);
    connectEsPaperStream();
  });
}

function esPaperSortValue(t, key) {
  if (key === 'symbol') return t.symbol ?? '';
  if (key === 'side') return t.side ?? '';
  if (key === 'entry') return Number(t.entryPrice);
  if (key === 'sl') return t.sl == null ? null : Number(t.sl);
  if (key === 'tp') return t.tp == null ? null : Number(t.tp);
  if (key === 'mark') return Number(t.markPrice ?? t.exitPrice);
  if (key === 'pnl') return (t.netPnl ?? t.pnl) == null ? null : Number(t.netPnl ?? t.pnl);
  if (key === 'roe') return (t.netRoe ?? t.roe) == null ? null : Number(t.netRoe ?? t.roe);
  if (key === 'source') return t.source ?? '';
  if (key === 'time') return Date.parse(t.createdAt ?? '') || 0;
  if (key === 'status') {
    const order = { OPEN: 0, PENDING: 1, CLOSED: 2 };
    return order[t.status] ?? 9;
  }
  if (key === 'candleFlag') return getEsCandleFlagRank(t);
  if (key === 'stageCandle') return getEsStageCandleRank(t);
  return '';
}

function compareEsValues(a, b, dir) {
  const aMiss = a == null || (typeof a === 'number' && isNaN(a));
  const bMiss = b == null || (typeof b === 'number' && isNaN(b));
  if (aMiss && bMiss) return 0;
  if (aMiss) return 1;
  if (bMiss) return -1;
  const r = typeof a === 'string' ? String(a).localeCompare(String(b), 'en') : a - b;
  return dir === 'asc' ? r : -r;
}

function sortEsPaperTrades(trades) {
  const { key, dir } = esPaperSort;
  return trades.slice().sort((a, b) => {
    const r = compareEsValues(esPaperSortValue(a, key), esPaperSortValue(b, key), dir);
    return r !== 0 ? r : compareEsValues(esPaperSortValue(a, 'time'), esPaperSortValue(b, 'time'), 'desc');
  });
}

function updateEsSortHeaders() {
  document.querySelectorAll('[data-es-sort]').forEach((th) => {
    const active = th.dataset.esSort === esPaperSort.key;
    th.classList.toggle('active', active);
    const mark = th.querySelector('.sort-mark');
    if (mark) mark.textContent = active ? (esPaperSort.dir === 'asc' ? '^' : 'v') : '';
  });
}

function esPaperMarginBucket(trade) {
  const margin = Number(trade?.marginUsdt ?? trade?.marginUsd ?? trade?.margin ?? trade?.orderUsdt);
  if (Number.isFinite(margin) && margin >= 9.5 && margin <= 10.5) return 'test10';
  if (Number.isFinite(margin) && margin > 0 && margin <= 1.01) return 'test1';
  return 'other';
}

function summarizeEsPaperMarginBuckets(trades) {
  const base = {
    all: { label: 'Tổng filter', total: 0, open: 0, closed: 0, wins: 0, losses: 0, pnl: 0, roeSum: 0 },
    test10: { label: 'TEST $10', total: 0, open: 0, closed: 0, wins: 0, losses: 0, pnl: 0, roeSum: 0 },
    test1: { label: 'TEST $1', total: 0, open: 0, closed: 0, wins: 0, losses: 0, pnl: 0, roeSum: 0 },
    other: { label: 'Other', total: 0, open: 0, closed: 0, wins: 0, losses: 0, pnl: 0, roeSum: 0 },
  };
  const add = (group, trade) => {
    group.total += 1;
    const status = String(trade?.status ?? '').toUpperCase();
    if (status === 'CLOSED') {
      group.closed += 1;
      const pnl = Number(trade?.pnl);
      if (Number.isFinite(pnl)) {
        if (pnl > 0) group.wins += 1;
        else if (pnl < 0) group.losses += 1;
        group.pnl += pnl;
      }
      const roe = Number(trade?.roe);
      if (Number.isFinite(roe)) group.roeSum += roe;
    } else {
      group.open += 1;
      const pnl = Number(trade?.pnl);
      if (Number.isFinite(pnl)) group.pnl += pnl;
    }
  };

  trades.forEach((trade) => {
    add(base.all, trade);
    add(base[esPaperMarginBucket(trade)], trade);
  });
  Object.values(base).forEach((group) => {
    group.wr = group.closed > 0 ? (group.wins / group.closed) * 100 : null;
    group.avgRoe = group.closed > 0 ? group.roeSum / group.closed : null;
  });
  return base;
}

function renderEsPaperOverview(trades, serverSummary = null) {
  if (!esPaperOverview) return;
  const groups = serverSummary?.byMargin ?? summarizeEsPaperMarginBuckets(trades);
  const cards = [groups.all, groups.test10, groups.test1, groups.other].filter(Boolean);
  esPaperOverview.innerHTML = cards.map((group, index) => {
    const pnl = Number(group.netPnl ?? group.pnl ?? 0);
    const gross = Number(group.grossPnl ?? group.pnl ?? pnl);
    const fee = Number(group.estimatedFeeUsdt ?? 0);
    const pnlColor = pnl >= 0 ? 'var(--green)' : 'var(--red)';
    const cls = index === 1 ? ' test10' : index === 2 ? ' test1' : '';
    const wr = group.wr == null ? '-' : `${group.wr.toFixed(0)}%`;
    const avgRoe = group.avgRoe == null ? '-' : fmtPct(group.avgRoe, 1);
    const liveKey = ['all', 'test10', 'test1', 'other'][index] ?? group.label;
    return `<article class="es-paper-margin-card${cls}" ${liveCardAttrs('ema', 'overview', liveKey, group.avgRoe)}>
      <strong>${escapeHtml(group.label)}</strong>
      <div class="pnl" style="color:${pnlColor}">${formatEsMoney(pnl)}</div>
      <small>${group.total} total · ${group.open} open · ${group.closed} closed</small>
      <small>WR ${wr} · AvgROE ${avgRoe} · ${group.wins}W/${group.losses}L</small>
      <small>Gross ${formatEsMoney(gross)} · Fee -${Math.abs(fee).toFixed(3)} · Net ${formatEsMoney(pnl)}</small>
    </article>`;
  }).join('');
}

function ensureEsPaperPager() {
  let pager = document.getElementById('esPaperPager');
  if (pager) return pager;
  const summary = document.getElementById('esPaperSummary');
  if (!summary?.parentElement) return null;
  pager = document.createElement('div');
  pager.id = 'esPaperPager';
  pager.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0;color:var(--muted);font-size:12px';
  summary.insertAdjacentElement('afterend', pager);
  return pager;
}

function renderEsPaperPager() {
  const pager = ensureEsPaperPager();
  if (!pager || !esPaperPagination) return;
  const p = esPaperPagination;
  const cur = Number(p.page) || 1;
  const total = Math.max(1, Number(p.totalPages) || 1);

  // Danh sách số trang dạng 1,2,3 ... với cửa sổ quanh trang hiện tại + dấu …
  const pages = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    const s = Math.max(2, cur - 2);
    const e = Math.min(total - 1, cur + 2);
    if (s > 2) pages.push('...');
    for (let i = s; i <= e; i++) pages.push(i);
    if (e < total - 1) pages.push('...');
    pages.push(total);
  }
  const numBtns = pages.map((n) => (n === '...'
    ? '<span style="padding:0 4px;color:var(--muted)">…</span>'
    : `<button class="es-paper-close-btn" data-es-page="${n}"${n === cur ? ' style="background:var(--blue);color:#fff;border-color:var(--blue)" disabled' : ''}>${n}</button>`)).join('');

  pager.innerHTML = `
    <button class="es-paper-close-btn" data-es-page="prev" ${cur > 1 ? '' : 'disabled'}>‹</button>
    ${numBtns}
    <button class="es-paper-close-btn" data-es-page="next" ${cur < total ? '' : 'disabled'}>›</button>
    <span style="margin-left:6px">${p.total} rows</span>
    <select id="esPaperLimitSelect" style="background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:4px 8px">
      ${[100, 300, 500, 1000].map((n) => `<option value="${n}" ${n === esPaperLimit ? 'selected' : ''}>${n}/page</option>`).join('')}
    </select>
  `;
  pager.querySelectorAll('[data-es-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.esPage;
      if (v === 'prev') loadEsPaperTrades(Math.max(1, cur - 1));
      else if (v === 'next') loadEsPaperTrades(cur + 1);
      else loadEsPaperTrades(Number(v));
    });
  });
  pager.querySelector('#esPaperLimitSelect')?.addEventListener('change', (event) => {
    esPaperLimit = Number(event.target.value) || 300;
    loadEsPaperTrades(1);
  });
}

function getEsStage(t) {
  const source = String(t.source ?? '');
  const note = String(t.note ?? '');
  if (source.includes('br_like_short') || note.includes('brLikeShort=Y')) return 'BR-like Short';
  if (source.includes('br_like') || note.includes('brLike=Y')) return 'BR-like';
  if (t.runnerCandidate || source.includes('runner') || note.includes('runner=Y')) return 'Runner';
  if (source.includes('pre_breakout')) return 'Pre Breakout';
  if (source.includes('pre_breakdown')) return 'Pre Breakdown';
  if (source.includes('breakout')) return 'Breakout';
  if (source.includes('breakdown')) return 'Breakdown';
  if (source.includes('squeeze_short')) return 'Squeeze Short';
  if (source.includes('squeeze')) return 'Squeeze';
  return 'Other';
}

function getEsTimeframe(t) {
  const match = String(t.source ?? '').match(/^emasq-(\d+[mh])-/);
  return match ? match[1] : 'Mixed';
}

function renderBtcTurnGateBanner(summary = {}) {
  const groups = [
    ['BR-like', summary?.btcTurnGates],
    ['Runner', summary?.runnerBtcTurnGates],
    ['Breakout', summary?.breakoutBtcTurnGates],
  ];
  const active = groups.flatMap(([kind, gates]) =>
    (gates ?? []).filter((g) => g?.blockMarket).map((g) => ({ ...g, kind })));
  if (!active.length) return '';
  return active.map((g) => {
    const kind = escapeHtml(g.kind ?? 'Gate');
    const side = escapeHtml(g.side ?? '');
    const label = escapeHtml(g.label ?? 'BTC_TURN_CLUSTER_BAD');
    const reason = escapeHtml(g.reason ?? '');
    const cluster = g.cluster ?? {};
    return `
      <div style="margin:8px 16px 0;padding:10px 12px;border:2px solid #ff4d6d;background:#3a0712;color:#ffb3c1;font-weight:900;font-size:18px;line-height:1.25">
        BTC TURN WARNING - CHẶN ${kind} ${side} MARKET: ${label}
        <div style="font-size:12px;color:#ffd6de;margin-top:4px;font-weight:700">
          open=${cluster.open ?? '-'} · pnl=${cluster.pnl ?? '-'} · losers=${cluster.losers ?? '-'} · fast=${cluster.fastLosers ?? '-'} · ${reason}
        </div>
      </div>
    `;
  }).join('');
}

function getEsBrQuality(t) {
  const stage = getEsStage(t);
  if (!stage.startsWith('BR-like')) return null;
  const note = String(t.note ?? '');
  const label = String(t.brQualityLabel ?? (note.match(/BR_QUALITY=([A-Z_]+)/)?.[1] ?? '')).trim();
  if (!label) return null;
  const reasons = Array.isArray(t.brQualityReasons)
    ? t.brQualityReasons.join(', ')
    : String(note.match(/brQualityReason=([^|]+)/)?.[1] ?? '').trim();
  return { label, reasons };
}

function renderEsBrQualityBadge(t) {
  const q = getEsBrQuality(t);
  if (!q) return '';
  const cls = q.label.startsWith('LOW_') ? 'low' : q.label === 'HIGH' ? 'high' : 'ok';
  const text = q.label.replace(/^LOW_/, '').replaceAll('_', ' ');
  const title = q.reasons ? `BR_QUALITY=${q.label}: ${q.reasons}` : `BR_QUALITY=${q.label}`;
  return `<span class="es-br-quality ${cls}" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`;
}

function renderEsShortEnvBadge(t) {
  const label = String(t?.brShortEnvLabel ?? '').toUpperCase();
  if (!label) return '';
  const block = t?.brShortEnvBlockMarket === true || label === 'SHORT_ENV_BAD_STRICT' || label === 'SHORT_ENV_BTC_UP_BAD_STRICT';
  const btcUpBlock = label === 'SHORT_ENV_BTC_UP_BAD_STRICT';
  const recovery = label === 'SHORT_RECOVERY_60M';
  const color = block ? '#fb7185' : recovery ? '#34d399' : '#93c5fd';
  const text = btcUpBlock ? 'BTC UP SHORT BLOCK' : block ? 'SHORT ENV BLOCK' : recovery ? 'SHORT RECOVERY' : 'SHORT ENV OK';
  const r2 = t?.brShortEnvRolling2h ?? {};
  const r60 = t?.brShortRecovery60m ?? {};
  const title = [
    t?.brShortEnvReason ?? label,
    `2h closed=${r2.closed ?? '-'} pnl=${r2.pnl ?? '-'} wr=${r2.wr ?? '-'} lossCut=${r2.breadthLossCut ?? '-'}`,
    `60m closed=${r60.closed ?? '-'} pnl=${r60.pnl ?? '-'} wr=${r60.wr ?? '-'}`,
  ].join(' | ');
  return `<span title="${escapeHtml(title)}" style="font-size:9px;font-weight:900;padding:1px 5px;border-radius:3px;border:1px solid ${color};color:${color};background:rgba(15,23,42,.25)">${escapeHtml(text)}</span>`;
}

function renderEsBreakoutRuleBadge(t) {
  if (!String(t?.source ?? '').includes('-breakout')) return '';
  const badges = [];
  const turnLabel = String(t?.breakoutBtcTurnClusterLabel ?? '').toUpperCase();
  if (turnLabel) {
    const blocked = t?.breakoutBtcTurnClusterBlockMarket === true;
    const color = blocked ? '#fb7185' : '#34d399';
    const text = blocked ? 'BREAKOUT BTC BLOCK' : 'BREAKOUT BTC OK';
    badges.push(`<span title="${escapeHtml(t?.breakoutBtcTurnClusterReason ?? turnLabel)}" style="font-size:9px;font-weight:900;padding:1px 5px;border-radius:3px;border:1px solid ${color};color:${color};background:rgba(15,23,42,.25)">${text}</span>`);
  }
  const regimeLabel = String(t?.breakoutMarketRegimeLabel ?? '').toUpperCase();
  if (regimeLabel) {
    const blocked = t?.breakoutMarketRegimeBlockMarket === true;
    const chop = regimeLabel.includes('CHOP');
    const color = blocked ? '#fb7185' : chop ? '#fbbf24' : '#34d399';
    const text = blocked ? 'BREAKOUT TEST ONLY' : chop ? 'BREAKOUT CHOP $3' : 'BREAKOUT REGIME OK';
    badges.push(`<span title="${escapeHtml(t?.breakoutMarketRegimeReason ?? regimeLabel)}" style="font-size:9px;font-weight:900;padding:1px 5px;border-radius:3px;border:1px solid ${color};color:${color};background:rgba(15,23,42,.25)">${text}</span>`);
  }
  const chaseLabel = String(t?.breakoutChaseLabel ?? '').toUpperCase();
  if (chaseLabel) {
    const blocked = t?.breakoutChaseBlockMarket === true;
    const color = blocked ? '#fb7185' : '#34d399';
    const text = blocked ? 'CHASE TEST ONLY' : 'CHASE OK';
    badges.push(`<span title="${escapeHtml(t?.breakoutChaseReason ?? chaseLabel)}" style="font-size:9px;font-weight:900;padding:1px 5px;border-radius:3px;border:1px solid ${color};color:${color};background:rgba(15,23,42,.25)">${text}</span>`);
  }
  return badges.join('');
}

function renderEsRunnerRuleBadge(t) {
  const source = String(t?.source ?? '').toLowerCase();
  const note = String(t?.note ?? '').toLowerCase();
  if (!t?.runnerCandidate && !source.includes('runner') && !note.includes('runner=y')) return '';
  const badges = [];
  const preLabel = String(t?.runnerPreWeakLabel ?? '').toUpperCase();
  if (preLabel) {
    const blocked = t?.runnerPreWeakBlockMarket === true;
    const color = blocked ? '#fb7185' : '#34d399';
    const text = blocked ? 'RUNNER TEST ONLY' : 'RUNNER PRE OK';
    badges.push(`<span title="${escapeHtml(t?.runnerPreWeakReason ?? preLabel)}" style="font-size:9px;font-weight:900;padding:1px 5px;border-radius:3px;border:1px solid ${color};color:${color};background:rgba(15,23,42,.25)">${text}</span>`);
  }
  const turnLabel = String(t?.runnerBtcTurnClusterLabel ?? '').toUpperCase();
  if (turnLabel) {
    const blocked = t?.runnerBtcTurnClusterBlockMarket === true;
    const color = blocked ? '#fb7185' : '#34d399';
    const text = blocked ? 'RUNNER BTC BLOCK' : 'RUNNER BTC OK';
    badges.push(`<span title="${escapeHtml(t?.runnerBtcTurnClusterReason ?? turnLabel)}" style="font-size:9px;font-weight:900;padding:1px 5px;border-radius:3px;border:1px solid ${color};color:${color};background:rgba(15,23,42,.25)">${text}</span>`);
  }
  if (String(t?.status ?? '').toUpperCase() === 'RUNNER_TP_ENTRY_FAIL_FAST') {
    badges.push('<span style="font-size:9px;font-weight:900;padding:1px 5px;border-radius:3px;border:1px solid #fb7185;color:#fb7185;background:rgba(15,23,42,.25)">RUNNER FAIL FAST</span>');
  }
  return badges.join('');
}

function renderEsBtcTrendBadge(t) {
  const corr = Number(t?.btcCorr);
  const dir = String(t?.btcHealth?.btcTrendDir ?? t?.btcTrendDir ?? '').toLowerCase();
  const regime = String(t?.btcHealth?.regime ?? '').toUpperCase();
  const score = Number(t?.btcHealth?.btcTrendScore ?? t?.btcTrendScore);
  const pct6h = Number(t?.btcHealth?.pct6h);
  const ema1h = String(t?.btcHealth?.emaTrend1h ?? '').toLowerCase();
  const bullBias = String(t?.btcHealth?.bullBias ?? '').toLowerCase();
  const side = String(t?.side ?? '').toUpperCase();
  const expected = side === 'LONG' ? 'up' : side === 'SHORT' ? 'down' : '';
  const hasCorr = Number.isFinite(corr);
  const corrText = hasCorr ? corr.toFixed(2) : '-';
  const trendLabel = dir ? `BTC ${dir.toUpperCase()}${Number.isFinite(score) ? ` ${score}` : ''}` : 'BTC NO DATA';
  const pctText = Number.isFinite(pct6h) ? `${pct6h >= 0 ? '+' : ''}${pct6h.toFixed(2)}%/6h` : '';
  const trendTitle = [
    dir ? `btcTrend=${dir}` : 'btcTrend=?',
    Number.isFinite(score) ? `score=${score}` : '',
    regime ? `regime=${regime}` : '',
    Number.isFinite(pct6h) ? `pct6h=${pct6h.toFixed(2)}%` : '',
    ema1h ? `ema1h=${ema1h}` : '',
    bullBias ? `bull=${bullBias}` : '',
    `side=${side || '-'}`,
    `corr=${corrText}`,
  ].filter(Boolean).join(' | ');
  let trendColor = 'var(--muted)';
  let trendBg = 'rgba(157,170,165,.12)';
  if (dir === 'up') {
    trendColor = Number.isFinite(score) && score < 45 ? '#fbbf24' : '#34d399';
    trendBg = Number.isFinite(score) && score < 45 ? 'rgba(251,191,36,.18)' : 'rgba(52,211,153,.16)';
  } else if (dir === 'down') {
    trendColor = Number.isFinite(score) && score < 45 ? '#fbbf24' : '#fb7185';
    trendBg = Number.isFinite(score) && score < 45 ? 'rgba(251,191,36,.18)' : 'rgba(251,113,133,.16)';
  } else if (regime === 'FLAT') {
    trendColor = '#67e8f9';
    trendBg = 'rgba(34,211,238,.16)';
  }
  const stateBadge = `<span title="${escapeHtml(trendTitle)}" style="display:inline-flex;align-items:center;gap:4px;width:max-content;max-width:120px;padding:2px 6px;border-radius:4px;border:1px solid ${trendColor};background:${trendBg};color:${trendColor};font-weight:950;font-size:10px;line-height:1.15">${escapeHtml(trendLabel)}${pctText ? `<small style="color:${trendColor};font-size:9px;font-weight:800">${escapeHtml(pctText)}</small>` : ''}</span>`;
  let relationBadge;
  if (hasCorr && corr < 0.3) {
    relationBadge = `<span title="Coin khong di theo BTC ro: corr=${corrText}" style="font-weight:900;color:var(--red);font-size:10px">DOC LAP ${corrText}</span>`;
  } else if (hasCorr && corr < 0.5) {
    relationBadge = `<span title="Coin theo BTC yeu: corr=${corrText}" style="font-weight:900;color:#fbbf24;font-size:10px">THEO YEU ${corrText}</span>`;
  } else if (!dir || !expected) {
    relationBadge = `<span title="Chua du du lieu BTC trend${hasCorr ? `, corr=${corrText}` : ''}" style="font-weight:800;color:var(--muted);font-size:10px">-</span>`;
  } else {
    const aligned = dir === expected;
    const color = aligned ? '#34d399' : '#fb7185';
    const label = aligned ? 'THUAN BTC' : 'NGUOC BTC';
    relationBadge = `<span title="BTC trend=${dir}, side=${side}, corr=${corrText}" style="font-weight:900;color:${color};font-size:10px">${label} ${corrText}</span>`;
  }
  return `<div style="display:flex;flex-direction:column;gap:3px;align-items:flex-start">${stateBadge}${relationBadge}</div>`;
}

function renderEsRealCandleFitBadge(t) {
  const label = String(t?.brRealCandleFit ?? '').toUpperCase();
  if (!label || label === 'NO_DATA') {
    return '<span title="Chua co du lieu mau nen" style="font-weight:800;color:var(--muted);font-size:11px">-</span>';
  }
  const kind = String(t?.brCandleKind ?? '-');
  const closePos = Number(t?.brCandleClosePos);
  const body = Number(t?.brCandleBodyShare);
  const upper = Number(t?.brCandleUpperShare);
  const lower = Number(t?.brCandleLowerShare);
  const title = [
    `fit=${label}`,
    `kind=${kind}`,
    Number.isFinite(closePos) ? `closePos=${closePos.toFixed(2)}` : '',
    Number.isFinite(body) ? `body=${body.toFixed(2)}` : '',
    Number.isFinite(upper) ? `upper=${upper.toFixed(2)}` : '',
    Number.isFinite(lower) ? `lower=${lower.toFixed(2)}` : '',
  ].filter(Boolean).join(' | ');
  const map = {
    REAL_OK_CANDLE: ['REAL OK', '#34d399'],
    REAL_MID_CANDLE: ['MID', '#fbbf24'],
    REAL_BAD_CANDLE: ['REAL BAD', '#fb7185'],
  };
  const [text, color] = map[label] ?? [label.replaceAll('_', ' '), 'var(--muted)'];
  return `<span title="${escapeHtml(title)}" style="font-weight:900;color:${color};font-size:11px">${escapeHtml(text)}</span>`;
}

function getEsBrScores(t) {
  const match = String(t?.source ?? '').match(/br_like(?:_short)?-(\d+)-(\d+)/);
  return {
    brScore: match ? Number(match[1]) : Number(t?.brLikeScore ?? 0),
    score: match ? Number(match[2]) : Number(t?.score ?? 0),
  };
}

function getEsRealGate(t) {
  const real = String(t?.brRealCandleFit ?? '').toUpperCase();
  if (!String(t?.source ?? '').includes('br_like')) return null;
  const { brScore, score } = getEsBrScores(t);
  const corr = Number(t?.btcCorr);
  const side = String(t?.side ?? '').toUpperCase();
  const dir = String(t?.btcHealth?.btcTrendDir ?? t?.btcTrendDir ?? '').toLowerCase();
  const expected = side === 'LONG' ? 'up' : side === 'SHORT' ? 'down' : '';
  const trendAligned = dir && expected ? dir === expected : null;
  const corrStrong = Number.isFinite(corr) && corr >= 0.5;
  const corrWeakOrIndependent = Number.isFinite(corr) && corr < 0.5;
  const scoreBeautiful = brScore >= 94 || score >= 90;

  if (real !== 'REAL_BAD_CANDLE') {
    return {
      label: real === 'REAL_MID_CANDLE' ? 'PASS MID' : 'PASS',
      color: real === 'REAL_MID_CANDLE' ? '#fbbf24' : '#34d399',
      reason: `real=${real || 'NO_DATA'} br=${brScore || '-'} score=${score || '-'}`,
    };
  }

  if (corrStrong && trendAligned === true) {
    return {
      label: 'BLOCK',
      color: '#fb7185',
      reason: `REAL_BAD + BTC theo manh + trend thuan; br=${brScore || '-'} score=${score || '-'}`,
    };
  }
  if (trendAligned === false || corrWeakOrIndependent) {
    return {
      label: scoreBeautiful ? 'TEST OK' : 'TEST',
      color: scoreBeautiful ? '#34d399' : '#fbbf24',
      reason: `REAL_BAD nhung ${trendAligned === false ? 'trend nguoc' : 'btc khong theo manh'}; br=${brScore || '-'} score=${score || '-'}`,
    };
  }
  return {
    label: scoreBeautiful ? 'TEST' : 'CAUTION',
    color: scoreBeautiful ? '#fbbf24' : '#fb7185',
    reason: `REAL_BAD thieu xac nhan BTC; br=${brScore || '-'} score=${score || '-'}`,
  };
}

function renderEsRealGateBadge(t) {
  const gate = getEsRealGate(t);
  if (!gate) return '<span style="color:var(--muted)">-</span>';
  return `<span title="${escapeHtml(gate.reason)}" style="font-weight:900;color:${gate.color};font-size:11px">${escapeHtml(gate.label)}</span>`;
}

function noteNumber(t, pattern) {
  const match = String(t?.note ?? '').match(pattern);
  return match ? Number(match[1]) : null;
}

function getEsShortGate(t) {
  const source = String(t?.source ?? '');
  if (!source.includes('br_like_short') && String(t?.side ?? '').toUpperCase() !== 'SHORT') return null;
  const reasons = [];
  const warn = [];
  const block = [];
  const { brScore, score } = getEsBrScores(t);
  const btcPct6h = Number(t?.btcHealth?.pct6h);
  const btcTrendDir = String(t?.btcHealth?.btcTrendDir ?? t?.btcTrendDir ?? '').toLowerCase();
  const lower = Number(t?.brCandleLowerShare);
  const closePos = Number(t?.brCandleClosePos);
  const candleKind = String(t?.brCandleKind ?? '');
  const movePct = noteNumber(t, /brLikeMove=([\d.]+)%/i);
  const volX = noteNumber(t, /brLikeVol=([\d.]+)x/i);
  const real = String(t?.brRealCandleFit ?? '').toUpperCase();

  if (Number.isFinite(btcPct6h) && btcPct6h <= -1.2) block.push(`BTC dump late ${btcPct6h.toFixed(2)}%/6h`);
  else if (Number.isFinite(btcPct6h) && btcPct6h <= -0.7) warn.push(`BTC da giam ${btcPct6h.toFixed(2)}%/6h`);
  else reasons.push(`BTC chua dump sau ${Number.isFinite(btcPct6h) ? btcPct6h.toFixed(2) : '?'}%/6h`);

  if (Number.isFinite(lower) && lower >= 0.45) block.push(`rau duoi lon ${lower.toFixed(2)} = short day`);
  else if (Number.isFinite(lower) && lower >= 0.35) warn.push(`rau duoi ${lower.toFixed(2)}`);
  else if (Number.isFinite(lower)) reasons.push(`rau duoi ok ${lower.toFixed(2)}`);

  if (Number.isFinite(closePos) && closePos > 0.55) block.push(`close cao ${closePos.toFixed(2)} khong confirm breakdown`);
  else if (Number.isFinite(closePos) && closePos > 0.40) warn.push(`close chua thap ${closePos.toFixed(2)}`);
  else if (Number.isFinite(closePos)) reasons.push(`close thap ${closePos.toFixed(2)}`);

  if (Number.isFinite(movePct) && movePct >= 6) block.push(`move late ${movePct.toFixed(1)}%`);
  else if (Number.isFinite(movePct) && movePct >= 4.5) warn.push(`move hoi rong ${movePct.toFixed(1)}%`);

  if (real === 'REAL_BAD_CANDLE') warn.push(`realBad/${candleKind || '-'}`);
  if (btcTrendDir === 'down' && block.length) warn.push('trend down nhung co dau hieu capitulation');
  if (Number.isFinite(volX) && volX >= 250) warn.push(`vol blowoff ${volX.toFixed(0)}x`);

  const scoreGood = brScore >= 94 || score >= 88;
  if (block.length >= 2) return { label: 'SHORT BLOCK', color: '#fb7185', reason: [...block, ...warn, ...reasons].join(' | ') };
  if (block.length === 1) return { label: scoreGood ? 'SHORT LATE' : 'SHORT BLOCK', color: scoreGood ? '#fbbf24' : '#fb7185', reason: [...block, ...warn, ...reasons].join(' | ') };
  if (warn.length >= 2) return { label: scoreGood ? 'SHORT TEST' : 'SHORT LATE', color: scoreGood ? '#fbbf24' : '#fb7185', reason: [...warn, ...reasons].join(' | ') };
  return { label: 'SHORT OK', color: '#34d399', reason: [...reasons, ...warn, `br=${brScore || '-'} score=${score || '-'}`].join(' | ') };
}

function renderEsShortGateBadge(t) {
  const gate = getEsShortGate(t);
  if (!gate) return '<span style="color:var(--muted)">-</span>';
  return `<span title="${escapeHtml(gate.reason)}" style="font-weight:900;color:${gate.color};font-size:11px">${escapeHtml(gate.label)}</span>`;
}

function getEsBtcCandleShortGate(t) {
  const source = String(t?.source ?? '');
  if (!source.includes('br_like_short') && String(t?.side ?? '').toUpperCase() !== 'SHORT') return null;
  const h = t?.btcHealth ?? {};
  const c1h = Number(h.btcCandle1hPct ?? t?.btcCandle1hPct);
  const pct6h = Number(h.pct6h ?? t?.btcPct6h);
  const trendDir = String(h.btcTrendDir ?? t?.btcTrendDir ?? '').toLowerCase();
  const trendScore = Number(h.btcTrendScore ?? t?.btcTrendScore);
  const ema1h = String(h.emaTrend1h ?? '').toLowerCase();
  const bullBias = String(h.bullBias ?? '').toLowerCase();
  const spike = Boolean(h.btcSpikeAlert ?? h.btcSpike);
  const hasCandle = Number.isFinite(c1h);
  const parts = [
    hasCandle ? `btc1h=${c1h.toFixed(2)}%` : 'btc1h=?',
    Number.isFinite(pct6h) ? `btc6h=${pct6h.toFixed(2)}%` : 'btc6h=?',
    trendDir ? `trend=${trendDir}${Number.isFinite(trendScore) ? `/${trendScore}` : ''}` : '',
    ema1h ? `ema1h=${ema1h}` : '',
    bullBias ? `bull=${bullBias}` : '',
    spike ? 'spike' : '',
  ].filter(Boolean);

  if (!hasCandle) {
    return { label: 'BTC NO DATA', color: 'var(--muted)', reason: parts.join(' | ') };
  }
  if (c1h >= 0.18 || (bullBias === 'bullish' && c1h > -0.05) || (ema1h === 'above' && trendDir === 'up')) {
    return { label: 'BTC SHORT BAD', color: '#fb7185', reason: `BTC dang hoi/giu cao | ${parts.join(' | ')}` };
  }
  if (c1h <= -0.9 || (Number.isFinite(pct6h) && pct6h <= -1.4) || spike) {
    return { label: 'BTC SHORT LATE', color: '#fbbf24', reason: `BTC da do manh, de hoi | ${parts.join(' | ')}` };
  }
  if (c1h <= -0.15 && c1h > -0.9 && (!Number.isFinite(pct6h) || pct6h > -1.4)) {
    return { label: 'BTC BREAK OK', color: '#34d399', reason: `BTC flat/breakdown vua du | ${parts.join(' | ')}` };
  }
  if (Math.abs(c1h) <= 0.15 && trendDir !== 'up') {
    return { label: 'BTC FLAT WAIT', color: '#fbbf24', reason: `BTC flat, chua confirm do | ${parts.join(' | ')}` };
  }
  return { label: 'BTC MIXED', color: '#fbbf24', reason: parts.join(' | ') };
}

function renderEsBtcCandleShortBadge(t) {
  const gate = getEsBtcCandleShortGate(t);
  if (!gate) return '<span style="color:var(--muted)">-</span>';
  return `<span title="${escapeHtml(gate.reason)}" style="font-weight:900;color:${gate.color};font-size:11px">${escapeHtml(gate.label)}</span>`;
}

function getFilteredEsPaperTrades() {
  let list = esPaperTrades;
  if (esPaperTypeFilter !== 'all') list = list.filter((t) => getEsStage(t) === esPaperTypeFilter);
  if (esPaperDayFilter !== 'all') list = list.filter((t) => getEsDay(t) === esPaperDayFilter);
  if (esPaperTfFilter !== 'all') list = list.filter((t) => getEsTimeframe(t) === esPaperTfFilter);
  if (esPaperCandleFlagFilter !== 'all') list = list.filter((t) => getEsCandleFlagCode(t) === esPaperCandleFlagFilter);
  if (esStageCandleFilter !== 'all') list = list.filter((t) => getEsStageCandleCode(t) === esStageCandleFilter);
  return list;
}

function getEsCandleFlag(t) {
  const evaluate = window.PaperCandleColumns?.evaluate;
  if (typeof evaluate === 'function') return evaluate(t);
  const tier = String(t.sideCandleTier ?? 'WATCH').toUpperCase();
  return {
    tier: ['GOOD', 'RISK', 'WATCH'].includes(tier) ? tier : 'WATCH',
    label: String(t.sideCandleLabel ?? tier),
    regime: String(t.sideCandleContext ?? '-'),
    side: String(t.side ?? '-'),
    reason: String(t.sideCandleReason ?? 'Display only'),
  };
}

function getEsCandleFlagCode(t) {
  const label = String(getEsCandleFlag(t)?.label ?? 'WATCH').toUpperCase();
  if (label.includes('NO DATA')) return 'NO_DATA';
  if (label.startsWith('GOOD-TEST')) return 'GOOD_TEST';
  if (label.startsWith('WATCH+')) return 'WATCH_PLUS';
  if (label.startsWith('GOOD')) return 'GOOD';
  if (label.startsWith('RISK')) return 'RISK';
  return 'WATCH';
}

function getEsCandleFlagRank(t) {
  return { GOOD: 0, GOOD_TEST: 1, WATCH_PLUS: 2, WATCH: 3, RISK: 4, NO_DATA: 5 }[getEsCandleFlagCode(t)] ?? 9;
}

function renderEsCandleFlag(t) {
  const evaluation = getEsCandleFlag(t);
  const render = window.PaperCandleColumns?.renderEvaluation;
  if (typeof render === 'function') return render(evaluation);
  return `<span title="${escapeHtml(evaluation.reason ?? '')}">${escapeHtml(evaluation.label ?? 'WATCH')}</span>`;
}

function getEsStageCandleCode(t = {}) {
  const saved = String(t.emaStageCandleFilterCode ?? '').toUpperCase();
  if (['GOOD', 'GOOD_TEST', 'WATCH_PLUS', 'WATCH', 'RISK', 'NO_DATA'].includes(saved)) return saved;
  if (String(t.emaStageCandleCode ?? '').includes('PAIR_MISSING')) return 'NO_DATA';
  const tier = String(t.emaStageCandleTier ?? 'WATCH').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return ['GOOD', 'GOOD_TEST', 'WATCH_PLUS', 'WATCH', 'RISK'].includes(tier) ? tier : 'WATCH';
}

function getEsStageCandleRank(t) {
  return { GOOD: 0, GOOD_TEST: 1, WATCH_PLUS: 2, WATCH: 3, RISK: 4, NO_DATA: 5 }[getEsStageCandleCode(t)] ?? 9;
}

function renderEsStageCandleFlag(t = {}) {
  const code = getEsStageCandleCode(t);
  const label = code === 'GOOD_TEST'
    ? 'GOOD-TEST'
    : code === 'WATCH_PLUS'
      ? 'WATCH+'
      : code === 'NO_DATA'
        ? 'NO DATA'
        : code;
  const colors = {
    GOOD: ['#34d399', 'rgba(52,211,153,.13)'],
    GOOD_TEST: ['#67e8f9', 'rgba(34,211,238,.12)'],
    WATCH_PLUS: ['#a7f3d0', 'rgba(16,185,129,.10)'],
    WATCH: ['#fbbf24', 'rgba(251,191,36,.11)'],
    RISK: ['#fb7185', 'rgba(251,113,133,.13)'],
    NO_DATA: ['var(--muted)', 'rgba(148,163,184,.10)'],
  };
  const [color, background] = colors[code] ?? colors.WATCH;
  const title = [
    t.emaStageCandleReason,
    `stage=${t.emaStageCandleStage ?? getEsStage(t)}`,
    `ALT=${t.emaStageCandleAltPattern ?? 'NO_DATA'}`,
    `BTC=${t.emaStageCandleBtcPattern ?? 'NO_DATA'}`,
    t.emaStageCandleDerived ? 'derived from saved entry snapshot' : 'saved at entry',
    'observe only',
  ].filter(Boolean).join(' | ');
  return `<span title="${escapeHtml(title)}" style="display:inline-flex;flex-direction:column;gap:2px;min-width:94px;padding:4px 6px;border-radius:4px;border:1px solid ${color};background:${background};color:${color};font-size:9px;font-weight:950">
    <span>${escapeHtml(label)}</span>
    <small style="font-size:8px;color:inherit;opacity:.86">${escapeHtml(String(t.emaStageCandleStage ?? getEsStage(t)).replaceAll('_', ' '))}</small>
  </span>`;
}

function calcEsStats(trades) {
  const list = trades ?? [];
  const closed = list.filter((t) => t.status === 'CLOSED');
  const wins = closed.filter((t) => Number(t.netPnl ?? t.pnl ?? 0) > 0).length;
  const losses = closed.filter((t) => Number(t.netPnl ?? t.pnl ?? 0) < 0).length;
  const breakeven = closed.length - wins - losses;
  const grossPnl = closed.reduce((sum, t) => sum + Number(t.grossPnl ?? t.pnl ?? 0), 0);
  const estimatedFeeUsdt = closed.reduce((sum, t) => sum + Number(t.estimatedFeeUsdt ?? 0), 0);
  const netPnl = closed.reduce((sum, t) => sum + Number(t.netPnl ?? t.pnl ?? 0), 0);
  const avgPnl = closed.length ? netPnl / closed.length : null;
  const avgRoe = closed.length
    ? closed.reduce((sum, t) => sum + Number(t.netRoe ?? t.roe ?? 0), 0) / closed.length
    : null;

  return {
    total: list.length,
    open: list.filter((t) => t.status === 'OPEN').length,
    pending: list.filter((t) => t.status === 'PENDING').length,
    closed: closed.length,
    wins,
    losses,
    breakeven,
    winRate: closed.length ? (wins / closed.length) * 100 : null,
    grossPnl,
    estimatedFeeUsdt,
    netPnl,
    pnl: netPnl,
    avgPnl,
    avgRoe,
  };
}

function formatEsMoney(v) {
  if (v == null || isNaN(v)) return '-';
  const sign = Number(v) >= 0 ? '+' : '';
  return `${sign}${Number(v).toFixed(3)}`;
}

function formatEsBucket(name, stats) {
  const wr = stats.closed ? `${stats.winRate.toFixed(0)}%` : '-';
  return `
    <strong>${name}</strong>
    ${stats.wins}W/${stats.losses}L · WR ${wr}<br>
    Closed ${stats.closed}/${stats.total} · Net ${formatEsMoney(stats.netPnl)}<br>
    Gross ${formatEsMoney(stats.grossPnl)} · Fee -${Math.abs(Number(stats.estimatedFeeUsdt ?? 0)).toFixed(3)}
  `;
}

function getEsComboTone(row) {
  const pnl = Number(row?.pnl ?? 0);
  const wr = Number(row?.wr ?? 0);
  const avgRoe = Number(row?.avgRoe ?? 0);
  const key = String(row?.key ?? '').toUpperCase();
  const isLong = key.includes('LONG');
  const isShort = key.includes('SHORT');
  const side = isLong ? 'LONG' : isShort ? 'SHORT' : 'NEUTRAL';
  const sideColor = isLong ? '#22c55e' : isShort ? '#fb7185' : '#94a3b8';
  const sideBg = isLong ? 'rgba(34,197,94,.10)' : isShort ? 'rgba(251,113,133,.10)' : 'rgba(148,163,184,.08)';
  const goodMinAvgRoe = 0.5;
  const feeFloorAvgRoe = 0.2;
  const strongSampleMinClosed = 80;
  const strongSampleMinPnl = 10;
  const strongSampleMinAvgRoe = 0.8;
  const closed = Number(row?.closed ?? 0);
  const strongSample = pnl >= strongSampleMinPnl
    && closed >= strongSampleMinClosed
    && wr >= 60
    && avgRoe >= strongSampleMinAvgRoe;
  let quality = 'neutral';
  if (closed > 0) {
    if (pnl > 0 && wr >= 60 && avgRoe >= goodMinAvgRoe) quality = 'good';
    if (strongSample) quality = 'strong';
    if (pnl < 0 || wr < 50 || avgRoe < feeFloorAvgRoe) quality = 'bad';
  }
  const tones = {
    strong: {
      bg: 'linear-gradient(135deg, rgba(20,83,45,.72), rgba(8,47,73,.50), rgba(15,23,42,.92))',
      border: '#2dd4bf',
      shadow: '0 0 0 1px rgba(45,212,191,.34), 0 14px 30px rgba(20,184,166,.16)',
      label: 'STRONG SAMPLE',
      labelColor: '#ccfbf1',
    },
    good: {
      bg: 'linear-gradient(135deg, rgba(6,78,59,.48), rgba(15,23,42,.92))',
      border: '#34d399',
      shadow: '0 0 0 1px rgba(52,211,153,.24), 0 10px 22px rgba(16,185,129,.10)',
      label: 'GOOD',
      labelColor: '#d1fae5',
    },
    bad: {
      bg: 'linear-gradient(135deg, rgba(127,29,29,.52), rgba(15,23,42,.92))',
      border: '#fb7185',
      shadow: '0 0 0 1px rgba(251,113,133,.25), 0 10px 22px rgba(190,18,60,.12)',
      label: 'BAD',
      labelColor: '#ffe4e6',
    },
    neutral: {
      bg: 'linear-gradient(135deg, rgba(66,32,6,.34), rgba(15,23,42,.92))',
      border: '#fbbf24',
      shadow: '0 0 0 1px rgba(251,191,36,.18)',
      label: 'NEUTRAL',
      labelColor: '#fef3c7',
    },
  };
  return {
    ...tones[quality],
    quality,
    side,
    sideColor,
    sideBg,
    feeFloorAvgRoe,
    goodMinAvgRoe,
    strongSample,
    strongSampleMinClosed,
    strongSampleMinPnl,
    strongSampleMinAvgRoe,
  };
}

function formatEsServerComboBucket(row) {
  const wr = row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`;
  const pnlColor = Number(row.pnl ?? 0) >= 0 ? 'var(--green)' : 'var(--red)';
  const tone = getEsComboTone(row);
  const grossPnl = Number(row.grossPnl ?? row.pnl ?? 0);
  const estimatedFeeUsdt = Number(row.estimatedFeeUsdt ?? 0);
  const netPnl = Number(row.netPnl ?? row.pnl ?? 0);
  const plan = row.tradePlan ?? {};
  const planLabel = String(plan.label ?? '').trim() || 'TEST $10';
  const planMargin = Number(plan.marginUsdt);
  const planColor = Number.isFinite(planMargin) && planMargin <= 1.01 ? '#fb7185' : '#34d399';
  const planTitle = plan.reason ? ` title="${escapeHtml(plan.reason)}"` : '';
  const parts = String(row.key ?? '').split('|').map((s) => s.trim());
  const title = parts.slice(0, 2).join(' ');
  const chips = parts.slice(2).map((p) => {
    let color = 'var(--muted)';
    if (/OK|PASS|THEO|THUAN|STRONG|MID/.test(p)) color = '#34d399';
    if (/YEU|WEAK|LATE|TEST|CAUTION/.test(p)) color = '#fbbf24';
    if (/RAC|BAD|BLOCK|NGUOC|DOC_LAP/.test(p)) color = '#fb7185';
    return `<span style="display:inline-block;margin:2px 3px 0 0;padding:1px 5px;border-radius:3px;border:1px solid ${color};color:${color};font-size:9px;font-weight:900">${escapeHtml(p.replaceAll('_', ' '))}</span>`;
  }).join('');
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <strong>COMBO ${escapeHtml(title)}</strong>
      <span style="display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;justify-content:flex-end">
        <span${planTitle} style="display:inline-flex;align-items:center;gap:5px;padding:2px 6px;border-radius:4px;border:1px solid ${planColor};background:rgba(15,23,42,.28);color:${planColor};font-size:9px;font-weight:950">${escapeHtml(planLabel)}</span>
        <span style="display:inline-flex;align-items:center;gap:5px;padding:2px 6px;border-radius:4px;border:1px solid ${tone.sideColor};background:${tone.sideBg};color:${tone.sideColor};font-size:9px;font-weight:950">${tone.side}</span>
      </span>
    </div>
    <div style="margin-top:3px">${chips}</div>
    <div style="margin-top:5px">${row.wins}W/${row.losses}L · WR ${wr} · ${row.open ?? Math.max(0, Number(row.total ?? 0) - Number(row.closed ?? 0))} open · ${row.closed} closed</div>
    <div style="margin-top:3px;font-size:10px;font-weight:850;color:var(--muted)">Gross ${formatEsMoney(grossPnl)} · Fee -${Math.abs(estimatedFeeUsdt).toFixed(3)}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px">
      <span style="color:${pnlColor};font-weight:900">Net ${formatEsMoney(netPnl)} · AvgNetROE ${row.avgRoe == null ? '-' : `${row.avgRoe >= 0 ? '+' : ''}${row.avgRoe}%`}</span>
      <span style="padding:2px 6px;border-radius:4px;border:1px solid ${tone.border};color:${tone.labelColor};font-size:9px;font-weight:950">${tone.label}</span>
    </div>
    ${tone.strongSample ? `<div style="margin-top:3px;color:#ccfbf1;font-size:10px;font-weight:950">MẪU MẠNH: Closed ≥ ${tone.strongSampleMinClosed}, PnL ≥ +$${tone.strongSampleMinPnl}, AvgROE ≥ +${tone.strongSampleMinAvgRoe}%</div>` : ''}
    <div style="margin-top:2px;color:var(--muted);font-size:9px;font-weight:800">GOOD cần AvgROE ≥ +${tone.goodMinAvgRoe}% · dưới +${tone.feeFloorAvgRoe}% coi như phí ăn hết</div>
  `;
}

function renderEsBrLikeScore75Log(summary) {
  const log = summary?.brLikeScore75Log;
  if (!log) return [];
  const scoreLine = log.netByScore
    ? Object.entries(log.netByScore)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([score, n]) => `${score}:${n}`)
      .join(' ')
    : '';
  const tfLine = log.netByTf
    ? Object.entries(log.netByTf)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tf, n]) => `${tf}:${n}`)
      .join(' ')
    : '';
  const sample = Array.isArray(log.samples) && log.samples.length
    ? log.samples.slice(0, 10).map((s) => `${s.symbol} ${s.tf} ${s.score}`).join(', ')
    : log.error ? `error: ${log.error}` : 'no net new sample';
  return [
    `<div class="es-paper-mini" style="border-color:rgba(96,165,250,.55);background:rgba(96,165,250,.08)">
      <strong>BR-like hiện tại</strong><br>
      Day ${escapeHtml(log.day)} Â· score >=${Number(log.thresholdNow ?? 80)}<br>
      Raw skip rows ${Number(log.rawScoreSkipRows ?? 0)}
    </div>`,
    `<div class="es-paper-mini" style="border-color:rgba(251,191,36,.72);background:rgba(251,191,36,.10)">
      <strong>TEST score >=75</strong><br>
      +${Number(log.netNewPossible ?? 0)} net lệnh Â· unique ${Number(log.unique75to79 ?? 0)}<br>
      ${escapeHtml([scoreLine, tfLine].filter(Boolean).join(' | ') || '-')}
    </div>`,
    `<div class="es-paper-mini" style="border-color:rgba(54,211,153,.58);background:rgba(54,211,153,.08)">
      <strong>Đã có / trùng</strong><br>
      ${Number(log.alreadyHadBr ?? 0)} signal đã vào BR-like sau đó<br>
      raw add rows ${Number(log.rawAddRows ?? 0)}
    </div>`,
    `<div class="es-paper-mini" style="border-color:rgba(248,113,113,.62);background:rgba(248,113,113,.09)">
      <strong>Chase skip</strong><br>
      ${Number(log.chaseSkips ?? 0)} dòng market entry too chased<br>
      <span title="${escapeHtml(sample)}">${escapeHtml(sample)}</span>
    </div>`,
  ];
}

function getEsPaperGateReason(t) {
  const items = [];
  const add = (label, reason, state = 'ok') => {
    const l = String(label ?? '').trim();
    const r = String(reason ?? '').trim();
    if (!l && !r) return;
    items.push({ label: l || r.slice(0, 42), reason: r || l, state });
  };
  const stateFrom = (label, block) => {
    const text = String(label ?? '').toUpperCase();
    if (block === true || /BLOCK|BAD|LOSS_CUT|FAIL_FAST|OPPOSITE|CUT|SL/.test(text)) return 'bad';
    if (/WAIT|TEST|CHOP|LATE|WEAK|CAUTION|BOUNCE|REJECT/.test(text)) return 'warn';
    return 'ok';
  };
  add(t.brMarketRegimeLabel, t.brMarketRegimeReason, stateFrom(t.brMarketRegimeLabel, t.brMarketRegimeBlockMarket));
  add(t.brBtcTurnClusterLabel, t.brBtcTurnClusterReason, stateFrom(t.brBtcTurnClusterLabel, t.brBtcTurnClusterBlockMarket));
  add(t.runnerPreWeakLabel, t.runnerPreWeakReason, stateFrom(t.runnerPreWeakLabel, t.runnerPreWeakBlockMarket));
  add(t.runnerBtcTurnClusterLabel, t.runnerBtcTurnClusterReason, stateFrom(t.runnerBtcTurnClusterLabel, t.runnerBtcTurnClusterBlockMarket));
  add(t.runnerSessionTestLabel, t.runnerSessionTestReason, 'warn');
  add(t.shortSessionTestLabel, t.shortSessionTestReason, 'warn');
  add(t.breakoutMarketRegimeLabel, t.breakoutMarketRegimeReason, stateFrom(t.breakoutMarketRegimeLabel, t.breakoutMarketRegimeBlockMarket));
  add(t.breakoutBtcTurnClusterLabel, t.breakoutBtcTurnClusterReason, stateFrom(t.breakoutBtcTurnClusterLabel, t.breakoutBtcTurnClusterBlockMarket));
  add(t.breakoutChaseLabel, t.breakoutChaseReason, stateFrom(t.breakoutChaseLabel, t.breakoutChaseBlockMarket));
  add(t.emaStageGateLabel, t.emaStageGateReason, stateFrom(t.emaStageGateLabel, t.emaStageGateBlockMarket));
  add(t.brShortEnvLabel, t.brShortEnvReason, stateFrom(t.brShortEnvLabel, t.brShortEnvBlockMarket));
  if (t.closeReason) add('CLOSE_REASON', t.closeReason, 'bad');
  const outcome = String(t.outcome ?? '').trim();
  if (outcome && outcome !== 'TP' && outcome !== 'SL') {
    add(outcome, t.closeReason ?? outcome, stateFrom(outcome, false));
  }
  const quality = getEsBrQuality(t);
  if (quality?.label?.startsWith('LOW_')) add(quality.label, quality.reasons, 'warn');
  if (!items.length) {
    const note = String(t.note ?? '');
    const m = note.match(/(?:closeReason|breadthBEReason|runnerTpEntryGuard|brLikeTpEntryGuard|breakoutTpEntryGuard|paperSlTrail)=([^|]+)/i);
    if (m) add(m[0].split('=')[0], m[1], stateFrom(m[0], false));
  }
  if (!items.length) return null;
  const worst = items.some((x) => x.state === 'bad') ? 'bad' : items.some((x) => x.state === 'warn') ? 'warn' : 'ok';
  const primary = items.find((x) => x.state === worst) ?? items[0];
  const title = items.map((x) => `${x.label}: ${x.reason}`).join(' | ');
  return { label: primary.label, title, state: worst };
}

function renderEsPaperGateReason(t) {
  const gate = getEsPaperGateReason(t);
  if (!gate) return '<span style="color:var(--muted)">-</span>';
  return `<span class="es-paper-gate-pill ${gate.state}" title="${escapeHtml(gate.title)}">${escapeHtml(gate.label.replaceAll('_', ' '))}</span>`;
}

function groupEsTrades(trades, keyFn) {
  const map = new Map();
  for (const trade of trades) {
    const key = keyFn(trade);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(trade);
  }
  return Array.from(map.entries());
}

function renderEsStageCandleStatCard(row = {}, liveGroup = 'stage-tier') {
  const pnl = Number(row.closedNetPnl ?? 0);
  const color = pnl > 0 ? '#34d399' : pnl < 0 ? '#fb7185' : 'var(--muted)';
  return `<div class="es-paper-mini" ${liveCardAttrs('ema', liveGroup, row.key ?? row.label, row.avgRoe)}>
    <strong>${escapeHtml(row.label ?? row.key ?? '-')}</strong><br>
    ${Number(row.total ?? 0)} total · ${Number(row.open ?? 0)} open · ${Number(row.pending ?? 0)} pending · ${Number(row.closed ?? 0)} closed<br>
    ${Number(row.wins ?? 0)}W/${Number(row.losses ?? 0)}L${Number(row.breakeven ?? 0) ? `/${Number(row.breakeven)}BE` : ''} · WR ${row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`}<br>
    <span style="color:${color};font-weight:900">Net ${formatEsMoney(pnl)} · AvgROE ${row.avgRoe == null ? '-' : `${Number(row.avgRoe) >= 0 ? '+' : ''}${Number(row.avgRoe).toFixed(2)}%`}</span>
  </div>`;
}

function renderEsSupportEntryCards(element, rows = [], emptyLabel = 'Chưa có cohort đủ điều kiện') {
  if (!element) return;
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    element.innerHTML = `<div class="es-paper-mini" style="color:var(--muted)">
      <strong>${escapeHtml(emptyLabel)}</strong><br>0 lệnh · OBSERVE ONLY
    </div>`;
    return;
  }
  const liveGroup = element === esSupportEntryShort
    ? 'support-short-source'
    : element === esSupportEntryLong
      ? 'support-long-source'
      : 'support-entry';
  element.innerHTML = list.map((row) => {
    const tier = String(row.tier ?? 'WATCH').toUpperCase();
    const color = tier === 'GOOD' ? '#34d399' : tier === 'RISK' ? '#fb7185' : '#fbbf24';
    const bg = tier === 'GOOD'
      ? 'rgba(52,211,153,.08)'
      : tier === 'RISK'
        ? 'rgba(251,113,133,.08)'
        : 'rgba(251,191,36,.08)';
    const totalPnl = Number(row.pnl ?? 0);
    const pnlColor = totalPnl >= 0 ? '#34d399' : '#fb7185';
    const wr = row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`;
    const avgRoe = row.avgRoe == null
      ? '-'
      : `${Number(row.avgRoe) >= 0 ? '+' : ''}${Number(row.avgRoe).toFixed(1)}%`;
    const streak = Number(row.negativeDayStreak ?? 0) > 0
      ? ` · chuỗi âm ${Number(row.negativeDayStreak)} ngày`
      : '';
    return `<div class="es-paper-mini" ${liveCardAttrs('ema', liveGroup, row.key ?? row.label, row.avgRoe)} style="border-color:${color};background:${bg}">
      <strong style="color:${color}">${escapeHtml(row.label ?? 'ENTRY SUPPORT')}</strong><br>
      <span style="color:${pnlColor};font-size:16px;font-weight:950">${formatEsMoney(totalPnl)}</span><br>
      ${row.total ?? 0} lệnh · ${row.open ?? 0} mở · ${row.pending ?? 0} pending · ${row.closed ?? 0} đóng<br>
      ${row.wins ?? 0}W/${row.losses ?? 0}L · WR ${wr} · AvgROE ${avgRoe}<br>
      PnL đóng ${formatEsMoney(row.closedPnl)} · active ${formatEsMoney(row.activePnl)} · PF ${Number(row.profitFactor ?? 0).toFixed(2)}<br>
      ngày dương ${row.positiveDays ?? 0}/${row.days ?? 0} · ngày âm ${row.negativeDays ?? 0}${streak}
    </div>`;
  }).join('');
}

function renderEsSupportEntryStats(stats = esSupportEntryStats) {
  renderEsSupportEntryCards(
    esSupportEntryGroups,
    stats?.groups,
    'Chưa có tín hiệu đẹp/xấu trong bộ lọc EMA',
  );
  renderEsSupportEntryCards(
    esSupportEntryShort,
    stats?.shortSourceGroups,
    'Chưa có EMA SHORT đủ điều kiện sau flip',
  );
  renderEsSupportEntryCards(
    esSupportEntryLong,
    stats?.longSourceGroups,
    'Chưa có EMA LONG đủ điều kiện sau flip',
  );
}

function renderEmaStageCandleStats(stats) {
  const el = document.getElementById('esStageCandleStats');
  if (!el) return;
  if (!stats) {
    el.innerHTML = '<div class="es-paper-mini" style="grid-column:1/-1;color:var(--muted)">EMA Stage Candle: chưa có thống kê.</div>';
    return;
  }
  const tiers = Array.isArray(stats.byTier) ? stats.byTier : [];
  const stageTiers = Array.isArray(stats.byStageTier) ? stats.byStageTier : [];
  const contexts = Array.isArray(stats.byContext) ? stats.byContext : [];
  const contextRows = contexts.slice(0, 100).map((row) => {
    const pnl = Number(row.closedNetPnl ?? 0);
    const pnlColor = pnl > 0 ? '#34d399' : pnl < 0 ? '#fb7185' : 'var(--muted)';
    return `<tr>
      <td style="min-width:420px;font-weight:800">${escapeHtml(row.label ?? row.key ?? '-')}</td>
      <td>${Number(row.total ?? 0)}</td>
      <td>${Number(row.open ?? 0)}/${Number(row.pending ?? 0)}/${Number(row.closed ?? 0)}</td>
      <td>${Number(row.wins ?? 0)}/${Number(row.losses ?? 0)}</td>
      <td>${row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`}</td>
      <td style="color:${pnlColor};font-weight:900">${formatEsMoney(pnl)}</td>
      <td>${row.avgRoe == null ? '-' : `${Number(row.avgRoe) >= 0 ? '+' : ''}${Number(row.avgRoe).toFixed(2)}%`}</td>
    </tr>`;
  }).join('');
  const legacyNote = esPaperCandleFlagFilter === 'all'
    ? ''
    : ' · Legacy candle filter không trộn vào bảng thống kê mới';
  el.innerHTML = `
    <div style="grid-column:1/-1;border:1px solid rgba(34,211,238,.24);border-radius:8px;padding:12px;background:rgba(34,211,238,.045)">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <strong style="color:#67e8f9">EMA Stage Candle · lớp quan sát riêng theo từng loại</strong>
          <div style="margin-top:4px;color:var(--muted);font-size:10px">Stage → ALT candle → BTC candle · PnL chỉ tính lệnh đã đóng, net sau phí · không đổi entry/size/SL/TP${escapeHtml(legacyNote)}</div>
        </div>
        <span style="color:var(--muted);font-size:10px">${escapeHtml(stats.version ?? '-')}</span>
      </div>
      <div class="es-paper-breakdown" style="margin-top:10px">${tiers.map((row) => renderEsStageCandleStatCard(row, 'stage-tier')).join('')}</div>
      <details open style="margin-top:10px">
        <summary style="cursor:pointer;color:var(--text);font-weight:900">Theo stage × nhãn (${stageTiers.length})</summary>
        <div class="es-paper-breakdown" style="margin-top:8px">${stageTiers.map((row) => renderEsStageCandleStatCard(row, 'stage-tier-matrix')).join('')}</div>
      </details>
      <details style="margin-top:10px">
        <summary style="cursor:pointer;color:var(--text);font-weight:900">Chi tiết stage × ALT candle × BTC candle (${Math.min(contexts.length, 100)}/${Number(stats.contextTotal ?? contexts.length)})</summary>
        <div style="overflow-x:auto;margin-top:8px">
          <table class="es-paper-table" style="min-width:940px">
            <thead><tr><th>Context</th><th>Total</th><th>O/P/C</th><th>W/L</th><th>WR</th><th>Net PnL</th><th>AvgROE</th></tr></thead>
            <tbody>${contextRows || '<tr><td colspan="7" style="text-align:center;color:var(--muted)">Chưa có context</td></tr>'}</tbody>
          </table>
        </div>
      </details>
    </div>`;
}

function updateEsPaperStats(trades = esPaperTrades) {
  const stats = calcEsStats(trades);
  const wr = stats.closed ? `${stats.winRate.toFixed(0)}%` : '-';
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText('esStatWr', wr);
  setText('esStatWinLoss', `${stats.wins} win / ${stats.losses} loss${stats.breakeven ? ` / ${stats.breakeven} BE` : ''}`);
  // Net PnL = tổng realized + unrealized (OPEN theo mark live) từ server summary; fallback về page nếu chưa có
  const srv = esPaperCandleFlagFilter === 'all' ? esPaperServerSummary : null;
  if (srv && srv.netPnl != null) {
    setText('esStatPnl', formatEsMoney(srv.netPnl));
    setText('esStatAvgPnl', `gross ${formatEsMoney(srv.grossPnl)} · fee -${Math.abs(Number(srv.estimatedFeeUsdt ?? 0)).toFixed(3)} · net ${formatEsMoney(srv.netPnl)} (mark live)`);
  } else {
    setText('esStatPnl', formatEsMoney(stats.pnl));
    setText('esStatAvgPnl', `Avg/trade ${stats.avgPnl == null ? '-' : formatEsMoney(stats.avgPnl)}`);
  }
  setText('esStatAvgRoe', stats.avgRoe == null ? '-' : `${stats.avgRoe >= 0 ? '+' : ''}${stats.avgRoe.toFixed(1)}%`);
  setText('esStatOpen', `${stats.open} open · ${stats.pending} pending · ${stats.closed} closed`);

  const buckets = [
    ...groupEsTrades(trades, (t) => t.side ?? 'Other').map(([name, list]) => ({ name, stats: calcEsStats(list) })),
    ...groupEsTrades(trades, getEsStage).map(([name, list]) => ({ name, stats: calcEsStats(list) })),
    ...groupEsTrades(trades, getEsTimeframe).map(([name, list]) => ({ name, stats: calcEsStats(list) })),
  ].filter((b) => b.stats.closed > 0);

  const ranked = buckets.slice().sort((a, b) => b.stats.winRate - a.stats.winRate || b.stats.pnl - a.stats.pnl);
  const worst = ranked[ranked.length - 1];
  setText('esStatBest', ranked[0] ? `${ranked[0].name} ${ranked[0].stats.winRate.toFixed(0)}%` : '-');
  setText('esStatWorst', worst ? `Worst ${worst.name} ${worst.stats.winRate.toFixed(0)}%` : '-');

  const breakdown = document.getElementById('esPaperBreakdown');
  if (breakdown) {
    const sideRows = groupEsTrades(trades, (t) => t.side ?? 'Other')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => `<div class="es-paper-mini">${formatEsBucket(name, calcEsStats(list))}</div>`);
    const stageRows = groupEsTrades(trades, getEsStage)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => `<div class="es-paper-mini">${formatEsBucket(name, calcEsStats(list))}</div>`);
    const tfRows = groupEsTrades(trades, getEsTimeframe)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => `<div class="es-paper-mini">${formatEsBucket(name, calcEsStats(list))}</div>`);
    const qualityRows = groupEsTrades(
      trades.filter((t) => getEsBrQuality(t)),
      (t) => `BR ${getEsBrQuality(t).label.replaceAll('_', ' ')}`,
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => `<div class="es-paper-mini">${formatEsBucket(name, calcEsStats(list))}</div>`);
    const realCandleRows = groupEsTrades(
      trades.filter((t) => t.brRealCandleFit),
      (t) => `REAL ${String(t.brRealCandleFit).replace(/^REAL_/, '').replaceAll('_', ' ')}`,
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => `<div class="es-paper-mini">${formatEsBucket(name, calcEsStats(list))}</div>`);
    const realGateRows = groupEsTrades(
      trades.filter((t) => getEsRealGate(t)),
      (t) => `GATE ${getEsRealGate(t).label}`,
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => `<div class="es-paper-mini">${formatEsBucket(name, calcEsStats(list))}</div>`);
    const shortGateRows = groupEsTrades(
      trades.filter((t) => getEsShortGate(t)),
      (t) => getEsShortGate(t).label,
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => `<div class="es-paper-mini">${formatEsBucket(name, calcEsStats(list))}</div>`);
    const btcCandleRows = groupEsTrades(
      trades.filter((t) => getEsBtcCandleShortGate(t)),
      (t) => getEsBtcCandleShortGate(t).label,
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => `<div class="es-paper-mini">${formatEsBucket(name, calcEsStats(list))}</div>`);
    const serverCombos = esPaperCandleFlagFilter !== 'all'
      ? null
      : esPaperTypeFilter === 'BR-like' || esPaperTypeFilter === 'BR-like Short'
        ? esPaperServerSummary?.brLikeCombos
        : esPaperServerSummary?.emaCombos;
    const comboRows = Array.isArray(serverCombos)
      ? serverCombos
        .slice(0, 18)
        .map((row) => {
          const tone = getEsComboTone(row);
          return `<div class="es-paper-mini" ${liveCardAttrs('ema', 'combo', row.key, row.avgRoe)} style="position:relative;overflow:hidden;border-color:${tone.border};background:${tone.bg};box-shadow:${tone.shadow};padding-left:13px">
            <span style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${tone.sideColor}"></span>
            ${formatEsServerComboBucket(row)}
          </div>`;
        })
      : [];
    const score75Rows = (esPaperTypeFilter === 'all' || esPaperTypeFilter === 'BR-like')
      ? renderEsBrLikeScore75Log(esPaperServerSummary)
      : [];
    breakdown.innerHTML = [...score75Rows, ...comboRows, ...sideRows, ...stageRows, ...tfRows, ...qualityRows, ...realCandleRows, ...realGateRows, ...shortGateRows, ...btcCandleRows].join('');
  }
}

function renderEsPaperTable() {
  const tbody = document.getElementById('esPaperBody');
  if (!tbody) return;

  const filteredTrades = getFilteredEsPaperTrades();
  const open = filteredTrades.filter((t) => t.status !== 'CLOSED');
  const closed = filteredTrades.filter((t) => t.status === 'CLOSED');
  const tpHits = closed.filter((t) => ['TP', 'SQUEEZE_SHORT_TP2'].includes(t.outcome)).length;
  const slHits = closed.filter((t) => t.outcome === 'SL').length;
  const partialBeHits = closed.filter((t) => t.outcome === 'SQUEEZE_SHORT_PARTIAL_BE').length;
  const wins = closed.filter((t) => Number(t.netPnl ?? t.pnl ?? 0) > 0).length;
  const wr = closed.length > 0 ? ((wins / closed.length) * 100).toFixed(0) : '-';
  const avgRoe = closed.length > 0
    ? (closed.reduce((s, t) => s + Number(t.netRoe ?? t.roe ?? 0), 0) / closed.length).toFixed(1)
    : '-';

  const summary = document.getElementById('esPaperSummary');
  if (summary) {
    const scope = esPaperTypeFilter === 'all' ? 'All signals' : esPaperTypeFilter;
    const dayScope = esPaperDayFilter === 'all' ? '' : ` · ${esPaperDayFilter}`;
    const tfScope = esPaperTfFilter === 'all' ? '' : ` · ${esPaperTfFilter}`;
    const flagScope = esPaperCandleFlagFilter === 'all' ? '' : ` · legacy ${esPaperCandleFlagFilter.replaceAll('_', '+').replace('GOOD+TEST', 'GOOD-TEST')}`;
    const stageCandleScope = esStageCandleFilter === 'all' ? '' : ` · stage candle ${esStageCandleFilter.replaceAll('_', '+').replace('GOOD+TEST', 'GOOD-TEST')}`;
    const pageScope = esPaperPagination ? ` | page ${esPaperPagination.page}/${esPaperPagination.totalPages} (${filteredTrades.length}/${esPaperPagination.total} rows)` : '';
    summary.innerHTML = `${escapeHtml(`${scope}${dayScope}${tfScope}${flagScope}${stageCandleScope}${pageScope} | ${open.length} open/pending | ${closed.length} closed | TP ${tpHits} | SL ${slHits} | TP1-BE ${partialBeHits} | WR ${wr}% | AvgROE ${avgRoe}%`)}${renderBtcTurnGateBanner(esPaperServerSummary)}`;
  }
  renderEsPaperPager();
  renderEsPaperOverview(filteredTrades, esPaperCandleFlagFilter === 'all' ? esPaperServerSummary : null);
  renderEsSupportEntryStats();
  renderEmaStageCandleStats(esPaperServerSummary?.emaStageCandleStats);
  updateEsPaperStats(filteredTrades);

  if (filteredTrades.length === 0) {
    tbody.innerHTML = '<tr><td colspan="25" style="text-align:center;color:var(--muted);padding:16px">No EMA Squeeze paper trades yet</td></tr>';
    updateEsSortHeaders();
    return;
  }

  const RENDER_CAP = 400; // chỉ render tối đa 400 dòng để tránh đơ browser (stats vẫn tính trên toàn bộ filtered)
  const sortedAll = sortEsPaperTrades([...open, ...closed]);
  const sorted = sortedAll.slice(0, RENDER_CAP);
  tbody.innerHTML = sorted.map((t) => {
    const pnlVal = t.netPnl ?? t.pnl ?? null;
    const roeVal = t.netRoe ?? t.roe ?? null;
    const grossPnlVal = t.grossPnl ?? t.pnl ?? null;
    const estimatedFee = Number(t.estimatedFeeUsdt ?? 0);
    const isShort = t.side === 'SHORT';
    const sideColor = isShort ? 'var(--red)' : 'var(--green)';
    const pnlColor = pnlVal == null ? '' : pnlVal >= 0 ? 'color:var(--green)' : 'color:var(--red)';
    const statusBadge = t.status === 'OPEN' ? '<span style="color:var(--green)">OPEN</span>'
      : t.status === 'PENDING' ? '<span style="color:var(--amber)">PENDING</span>'
      : (() => {
        const outcomeText = String(t.outcome ?? 'CLOSED');
        const title = [outcomeText, t.closeReason ?? ''].filter(Boolean).join(' | ');
        return `<span title="${escapeHtml(title)}" style="display:inline-block;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle;color:var(--muted)">${escapeHtml(outcomeText)}</span>`;
      })();
    const canClose = t.status === 'OPEN' || t.status === 'PENDING';
    const actions = `
      ${canClose ? `<button class="es-paper-close-btn" onclick="closeEsPaperTrade('${t.id}')">Close</button>` : ''}
      <button class="es-paper-close-btn del" onclick="deleteEsPaperTrade('${t.id}')">Del</button>
    `;
    const symbol = String(t.symbol ?? '');
    const variant = String(t.variant ?? '').toUpperCase();
    const rowClass = variant === 'MARKET' ? 'es-row-market' : variant === 'PENDING' ? 'es-row-pending' : '';
    let variantBadge;
    if (variant === 'MARKET') {
      variantBadge = '<span class="es-variant-badge market" title="Cách A: vào breakout ngay (market)">A · MARKET</span>';
    } else if (variant === 'PENDING') {
      variantBadge = t.status === 'PENDING'
        ? '<span class="es-variant-badge pending waiting" title="Cách B: CHƯA khớp - chờ giá retest về mép cụm EMA">B · CHỜ KHỚP</span>'
        : '<span class="es-variant-badge pending" title="Cách B: ĐÃ khớp khi giá retest chạm entry">B · ĐÃ KHỚP</span>';
    } else {
      variantBadge = '<span class="es-variant-badge none">-</span>';
    }
    variantBadge += `<div style="margin-top:4px;color:${Number(t.leverage) === 5 ? '#fbbf24' : '#67e8f9'};font-size:10px;font-weight:900">${Number(t.leverage) || '-'}x</div>`;
    const tf = getEsTimeframe(t);
    const stageLabel = getEsStage(t);
    const squeezeLongTier = String(t.squeezeLongEvalTier ?? '').toUpperCase();
    const squeezeLongEvalBadge = squeezeLongTier
      ? `<span title="${escapeHtml(t.squeezeLongEvalReason ?? t.squeezeLongEvalLabel ?? '')}" style="font-size:9px;font-weight:900;padding:1px 5px;border-radius:3px;background:${squeezeLongTier === 'A' ? 'rgba(52,211,153,.16)' : squeezeLongTier === 'B' ? 'rgba(251,191,36,.16)' : 'rgba(148,163,184,.14)'};color:${squeezeLongTier === 'A' ? '#34d399' : squeezeLongTier === 'B' ? '#fbbf24' : '#94a3b8'}">LONG ${escapeHtml(squeezeLongTier)} · $${Number(t.squeezeLongEvalMarginUsdt ?? t.marginUsdt ?? 1).toFixed(0)}</span>`
      : '';
    const emaBreakTier = String(t.emaBreakEvalTier ?? '').toUpperCase();
    const emaBreakEvalBadge = emaBreakTier
      ? `<span title="${escapeHtml(t.emaBreakEvalReason ?? t.emaBreakEvalLabel ?? '')}" style="font-size:9px;font-weight:900;padding:1px 5px;border-radius:3px;background:${emaBreakTier === 'A' ? 'rgba(52,211,153,.16)' : emaBreakTier === 'B' ? 'rgba(251,191,36,.16)' : 'rgba(148,163,184,.14)'};color:${emaBreakTier === 'A' ? '#34d399' : emaBreakTier === 'B' ? '#fbbf24' : '#94a3b8'}">${escapeHtml(stageLabel)} ${escapeHtml(emaBreakTier)} · $${Number(t.emaBreakEvalMarginUsdt ?? t.marginUsdt ?? 1).toFixed(0)}</span>`
      : '';
    const brQualityBadge = renderEsBrQualityBadge(t);
    const shortEnvBadge = renderEsShortEnvBadge(t);
    const breakoutRuleBadge = renderEsBreakoutRuleBadge(t);
    const runnerRuleBadge = renderEsRunnerRuleBadge(t);
    return `<tr class="${rowClass}">
      <td>${variantBadge}</td>
      <td>
        <a class="es-symbol" href="/?symbol=${symbol}" target="_blank" rel="noopener">${symbol.replace(/USDT$/, '')}</a>
        <div style="margin-top:3px;display:flex;gap:5px;align-items:center;flex-wrap:wrap">
	          <span style="font-size:9px;font-weight:800;padding:1px 5px;border-radius:3px;background:rgba(96,165,250,.16);color:#93c5fd">${tf}</span>
	          <span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:rgba(157,170,165,.14);color:var(--muted)">${stageLabel}</span>
	          ${squeezeLongEvalBadge}
	          ${emaBreakEvalBadge}
	          ${brQualityBadge}
	          ${shortEnvBadge}
	          ${breakoutRuleBadge}
	          ${runnerRuleBadge}
	        </div>
      </td>
      <td><span style="color:${sideColor}">${t.side}</span></td>
      <td>${renderEsCandlePattern(t)}</td>
      <td>${renderEsBtcCandlePattern(t)}</td>
      <td data-paper-side-candle-cell="true">${renderEsCandleFlag(t)}</td>
      <td>${renderEsStageCandleFlag(t)}</td>
      <td>${fmtPrice(t.entryPrice)}</td>
      <td>${fmtPrice(t.sl)}</td>
      <td>
        ${fmtPrice(t.tp)}
        ${t.partialTpTaken === true ? `<div title="Da chot ${(Number(t.partialTpCloseRatio ?? 0.5) * 100).toFixed(0)}% tai +${Number(t.partialTpRoe ?? 5).toFixed(0)}% ROE" style="margin-top:3px;color:#34d399;font-size:9px;font-weight:900">TP1 ${(Number(t.partialTpCloseRatio ?? 0.5) * 100).toFixed(0)}% OK</div>` : ''}
      </td>
      <td>${(() => {
        const e = Number(t.entryPrice); const tp = Number(t.tp); const lev = Number(t.leverage) || 1;
        if (!Number.isFinite(e) || e <= 0 || !Number.isFinite(tp) || tp <= 0) return '-';
        const roe = (tp - e) / e * lev * 100 * (t.side === 'LONG' ? 1 : -1);
        return `<span style="font-weight:800;color:${roe >= 30 ? '#34d399' : roe >= 0 ? 'var(--text)' : 'var(--red)'}">${roe >= 0 ? '+' : ''}${roe.toFixed(0)}%</span>`;
      })()}</td>
      <td>${(() => {
        const c = t.btcCorr;
        if (c == null) return '<span style="color:var(--muted)">-</span>';
        const col = c >= 0.5 ? '#34d399' : c >= 0.3 ? '#fbbf24' : 'var(--red)';
        const lab = c >= 0.5 ? '✓ theo' : c >= 0.3 ? '~ yếu' : '✗ rác';
        return `<span title="corr coin vs BTC=${c}" style="font-weight:800;color:${col};font-size:11px">${lab} ${c.toFixed(2)}</span>`;
      })()}</td>
      <td>${renderEsBtcTrendBadge(t)}</td>
      <td>${renderEsRealCandleFitBadge(t)}</td>
      <td>${renderEsRealGateBadge(t)}</td>
      <td>${renderEsShortGateBadge(t)}</td>
      <td>${renderEsBtcCandleShortBadge(t)}</td>
      <td>${fmtPrice(t.markPrice)}</td>
      <td style="${pnlColor}">${fmtPnl(pnlVal, roeVal)}<div style="margin-top:2px;color:var(--muted);font-size:9px">gross ${formatEsMoney(grossPnlVal)} · fee -${Math.abs(estimatedFee).toFixed(3)}</div></td>
      <td style="${pnlColor}">${roeVal != null ? fmtPct(roeVal) : '-'}</td>
      <td>${statusBadge}</td>
      <td class="es-paper-gate-cell">${renderEsPaperGateReason(t)}</td>
      <td style="color:var(--muted);font-size:11px">${t.source ?? '-'}</td>
      <td style="color:var(--muted);font-size:11px">${t.createdAt ? new Date(t.createdAt).toLocaleTimeString('vi') : '-'}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
  if (sortedAll.length > RENDER_CAP) {
    tbody.innerHTML += `<tr><td colspan="25" style="text-align:center;color:var(--muted);padding:10px;font-size:11px">Hiển thị ${RENDER_CAP}/${sortedAll.length} lệnh (đã lọc) — lọc thêm theo ngày/khung nến/type để xem hết. Thống kê tính trên toàn bộ.</td></tr>`;
  }
  updateEsSortHeaders();
}

async function loadEsPaperTrades(page = esPaperPage) {
  try {
    const nextPage = Math.max(1, Number(page) || 1);
    const q = `page=${nextPage}&limit=${esPaperLimit}`
      + `&type=${encodeURIComponent(esPaperTypeFilter)}`
      + `&day=${encodeURIComponent(esPaperDayFilter)}`
      + `&tf=${encodeURIComponent(esPaperTfFilter)}`
      + `&stageCandle=${encodeURIComponent(esStageCandleFilter)}`;
    const res = await fetch(`/api/ema-squeeze-paper-trades?${q}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    esPaperPage = data.pagination?.page ?? nextPage;
    esPaperPagination = data.pagination ?? null;
    if (data.summary) esPaperServerSummary = data.summary;
    if (data.supportEntryStats) esSupportEntryStats = data.supportEntryStats;
    if (Array.isArray(data.availableDays)) esPaperAvailableDays = data.availableDays;
    esPaperTrades = (data.trades ?? []).filter((t) => String(t.source ?? '').startsWith('emasq-'));
    updateEsDayFilterOptions();
    renderEsPaperTable();
  } catch (e) {
    console.warn('[EmaSqueezePaper] load error:', e);
  }
}

let esPaperStream = null;
let esPaperFallbackTimer = null;

function esPaperStreamUrl() {
  const query = new URLSearchParams({
    type: esPaperTypeFilter || 'all',
    day: esPaperDayFilter || 'all',
    tf: esPaperTfFilter || 'all',
    stageCandle: esStageCandleFilter || 'all',
  });
  return `/api/ema-squeeze-paper-trades-stream?${query}`;
}

function applyEsPaperData(data) {
  const incoming = (data.trades ?? []).filter((t) => String(t.source ?? '').startsWith('emasq-'));
  if (data.supportEntryStats) esSupportEntryStats = data.supportEntryStats;
  // KHÔNG dùng summary từ stream (stream không lọc theo filter) — Net PnL lấy từ loadEsPaperTrades đã lọc
  if (data.partial) {
    const merged = new Map(esPaperTrades.map((t) => [t.id, t]));
    incoming.forEach((t) => merged.set(t.id, t));
    esPaperTrades = [...merged.values()];
  } else {
    esPaperPagination = data.pagination ?? esPaperPagination;
    if (Array.isArray(data.availableDays) && data.availableDays.length) esPaperAvailableDays = data.availableDays;
    esPaperTrades = incoming;
  }
  updateEsDayFilterOptions();
  renderEsPaperTable();
}

function connectEsPaperStream() {
  esPaperStream?.close();
  esPaperStream = new EventSource(esPaperStreamUrl());
  esPaperStream.onmessage = (event) => {
    try {
      applyEsPaperData(JSON.parse(event.data));
      clearInterval(esPaperFallbackTimer);
      esPaperFallbackTimer = null;
    } catch {}
  };
  esPaperStream.onerror = () => {
    esPaperStream?.close();
    if (!esPaperFallbackTimer) {
      esPaperFallbackTimer = setInterval(loadEsPaperTrades, 5000);
    }
    setTimeout(connectEsPaperStream, 4000);
  };
}

window.closeEsPaperTrade = async function(id) {
  try {
    await fetch('/api/pump-paper-trades/close', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await loadEsPaperTrades();
  } catch (e) {
    console.error('[EmaSqueezePaper] close error:', e);
  }
};

window.deleteEsPaperTrade = async function(id) {
  try {
    await fetch('/api/pump-paper-trades/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await loadEsPaperTrades();
  } catch (e) {
    console.error('[EmaSqueezePaper] delete error:', e);
  }
};

// ── Render ────────────────────────────────────────────────────────────────────

function getFiltered() {
  const q         = searchInput.value.trim().toUpperCase();
  const minScore  = Number(scoreFilter.value ?? 0);
  const spread    = spreadFilter.value;
  const sort      = sortSelect.value;

  let list = allSignals.filter((s) => {
    if (activeStage === 'RUNNER') {
      if (!s.runnerCandidate) return false;
    } else if (activeStage === 'BR_LIKE') {
      if (Number(s.brLikeScore ?? 0) < 80 || s.action === 'SHORT') return false;
    } else if (activeStage === 'BR_LIKE_SHORT') {
      if (Number(s.brLikeScore ?? 0) < 80 || s.action !== 'SHORT') return false;
    } else if (activeStage !== 'all' && s.stage !== activeStage) {
      return false;
    }
    if (q && !s.symbol.includes(q)) return false;
    if (s.score < minScore) return false;
    if (spread === 'tight'    && (s.spreadPct ?? 1) >= 0.03) return false;
    if (spread === 'moderate' && (s.spreadPct ?? 1) >= 0.06) return false;
    return true;
  });

  if (sort === 'score') {
    list.sort((a, b) => b.score - a.score);
  } else if (sort === 'squeeze') {
    list.sort((a, b) => (b.squeezeBars ?? 0) - (a.squeezeBars ?? 0));
  } else if (sort === 'spread') {
    list.sort((a, b) => (a.spreadPct ?? 1) - (b.spreadPct ?? 1));
  } else if (sort === 'brLike') {
    list.sort((a, b) => (b.brLikeScore ?? 0) - (a.brLikeScore ?? 0));
  }
  // default: BREAKOUT first, then SQUEEZE, within each sort by score (already sorted from server)

  return list;
}

function render() {
  const list = getFiltered();
  visibleCount.textContent = list.length;

  if (list.length === 0) {
    const stageMsg = activeStage === 'BREAKOUT'
      ? 'Không có coin nào vừa breakout'
      : activeStage === 'BREAKDOWN'
        ? 'Không có coin nào vừa breakdown'
      : activeStage === 'PRE_BREAKOUT'
        ? 'Không có coin nào EMA đang nén và volume bắt đầu bơm'
      : activeStage === 'PRE_BREAKDOWN'
        ? 'Không có coin nào đang ở đỉnh, EMA nén và volume đỏ bắt đầu vào'
      : activeStage === 'SQUEEZE'
        ? 'Không có coin nào đang nén EMA'
        : activeStage === 'RUNNER'
          ? 'Không có runner squeeze kiểu OPEN/OPN'
        : activeStage === 'BR_LIKE'
          ? 'Không có chart BR-like ≥ 80'
        : activeStage === 'SQUEEZE_SHORT'
          ? 'Không có coin nào đang nén để short'
        : 'Không có signal nào';
    grid.innerHTML = `<div class="es-empty"><strong>${stageMsg}</strong>Thử giảm filter hoặc đợi nến tiếp theo</div>`;
    return;
  }

  grid.innerHTML = list.map(buildCard).join('');
}

function applyData(data) {
  allSignals = data.signals ?? [];
  scannedAt  = data.scannedAt;
  total      = data.total ?? 0;

  const processed  = data.processed ?? 0;
  const cs         = data.cacheStats ?? {};
  const breakouts  = allSignals.filter((s) => s.stage === 'BREAKOUT');
  const breakdowns = allSignals.filter((s) => s.stage === 'BREAKDOWN');
  const preBreakouts = allSignals.filter((s) => s.stage === 'PRE_BREAKOUT');
  const preBreakdowns = allSignals.filter((s) => s.stage === 'PRE_BREAKDOWN');
  const squeezes   = allSignals.filter((s) => s.stage === 'SQUEEZE');
  const squeezeShorts = allSignals.filter((s) => s.stage === 'SQUEEZE_SHORT');
  const runners    = allSignals.filter((s) => s.runnerCandidate);
  const brLikes    = allSignals.filter((s) => Number(s.brLikeScore ?? 0) >= 80 && s.action !== 'SHORT');
  const brLikeShorts = allSignals.filter((s) => Number(s.brLikeScore ?? 0) >= 80 && s.action === 'SHORT');
  const scores     = allSignals.map((s) => s.score);
  const avg        = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  breakoutCount.textContent = `${breakouts.length}/${breakdowns.length}`;
  squeezeCount.textContent  = `${squeezes.length}/${squeezeShorts.length}`;
  avgScore.textContent      = avg || '-';
  lastScan.textContent      = scannedAt ? new Date(scannedAt).toLocaleTimeString('vi') : '-';

  metaTotal.textContent     = processed > 0 ? `${processed}/${total}` : total;
  metaSignals.textContent   = allSignals.length;
  metaTime.textContent      = scannedAt ? new Date(scannedAt).toLocaleTimeString('vi') : '-';
  scanMeta.style.display    = 'flex';

  scanStatus.textContent = allSignals.length > 0
    ? `🟢 ${breakouts.length} Breakout · 🔴 ${breakdowns.length} Breakdown · 🟦 ${preBreakouts.length} Pre Long · 🟪 ${preBreakdowns.length} Pre Short · 🔶 ${squeezes.length} Squeeze · BR ${brLikes.length} BR-like · 💠 ${runners.length} Runner · 🟥 ${squeezeShorts.length} Short`
    : `● Quét xong · Không có signal`;
  scanStatus.style.color = allSignals.length > 0 ? 'var(--green)' : 'var(--muted)';
  scanStatus.textContent = allSignals.length > 0
    ? `${breakouts.length} Breakout · ${breakdowns.length} Breakdown · ${preBreakouts.length} Pre Long · ${preBreakdowns.length} Pre Short · ${squeezes.length} Squeeze · BR ${brLikes.length} BR-like · BR Short ${brLikeShorts.length} · ${runners.length} Runner · ${squeezeShorts.length} Short`
    : 'Scan done · No signal';

  render();
}

// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll('.es-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.es-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeStage = btn.dataset.stage;
    render();
  });
});

// ── Controls ──────────────────────────────────────────────────────────────────

searchInput.addEventListener('input', () => {
  searchClear.style.display = searchInput.value ? 'block' : 'none';
  render();
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  render();
});
scoreFilter.addEventListener('change',  render);
spreadFilter.addEventListener('change', render);
sortSelect.addEventListener('change',   render);
if (emaSqueezeAutoOrderChk) {
  emaSqueezeAutoOrderChk.addEventListener('change', saveEmaSqueezeAutoOrderEnabled);
}

// ── SSE connection ────────────────────────────────────────────────────────────

function connect() {
  const es = new EventSource(SSE_URL);

  es.onopen = () => {
    scanStatus.textContent = '● Live';
    scanStatus.style.color = 'var(--green)';
    nextRefresh.textContent = 'Cập nhật mỗi nến 5m/15m/1h';
  };

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      // Không xoá signals hiện tại nếu scan mới trả về rỗng nhưng đã có data
      if ((data.signals ?? []).length === 0 && allSignals.length > 0) return;
      applyData(data);
    } catch {}
  };

  es.onerror = () => {
    scanStatus.textContent = 'Reconnecting...';
    scanStatus.style.color = 'var(--amber)';
    nextRefresh.textContent = '';
    es.close();
    setTimeout(connect, 4000);
  };
}

connect();
connectEsPaperStream();

async function fetchAndApply() {
  try {
    scanStatus.textContent = 'Đang tải...';
    scanStatus.style.color = 'var(--muted)';
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    applyData(data);
  } catch {
    scanStatus.textContent = 'Lỗi tải data';
    scanStatus.style.color = 'var(--red)';
  }
}

fetchAndApply();
setInterval(fetchAndApply, 60_000);
loadEmaSqueezeAutoOrderEnabled();
renderBtcSqueezeContext();
loadBtcSqueezeContext();
setInterval(loadBtcSqueezeContext, 120_000);
loadEsPaperTrades();


