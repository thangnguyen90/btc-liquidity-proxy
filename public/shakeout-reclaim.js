const SSE_URL = '/api/shakeout-reclaim-stream';
const API_URL = '/api/shakeout-reclaim-signals';
const PAPER_API_URL = '/api/shakeout-paper-trades';
const PAPER_SSE_URL = '/api/shakeout-paper-trades-stream';

let allSignals = [];
let total = 0;
let processed = 0;
let scannedAt = null;

const grid = document.getElementById('srGrid');
const confirmedCount = document.getElementById('confirmedCount');
const watchCount = document.getElementById('watchCount');
const totalScanned = document.getElementById('totalScanned');
const lastScan = document.getElementById('lastScan');
const scanStatus = document.getElementById('scanStatus');
const cachedCount = document.getElementById('cachedCount');
const totalCount = document.getElementById('totalCount');
const foundCount = document.getElementById('foundCount');
const searchInput = document.getElementById('searchInput');
const sideFilter = document.getElementById('sideFilter');
const stageFilter = document.getElementById('stageFilter');
const scoreFilter = document.getElementById('scoreFilter');
const sortSelect = document.getElementById('sortSelect');
const srPaperBody = document.getElementById('srPaperBody');
const srPaperSummary = document.getElementById('srPaperSummary');

let srPaperTrades = [];
let srPaperSort = { key: 'status', dir: 'asc' };

function fmtPrice(p) {
  if (p == null || p === '') return '-';
  const v = Number(p);
  if (!Number.isFinite(v) || v <= 0) return '-';
  if (v >= 1000) return v.toLocaleString('en', { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4);
  if (v >= 0.01) return v.toFixed(5);
  return v.toFixed(6);
}

function fmtPct(v, digits = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtSigned(v, suffix = '') {
  if (v == null || v === '') return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  const cls = n >= 0 ? 'var(--green)' : 'var(--red)';
  return `<span style="color:${cls};font-weight:800">${n >= 0 ? '+' : ''}${n.toFixed(2)}${suffix}</span>`;
}

function timeAgo(ts) {
  if (!ts) return '-';
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

function chip(label, cls = '') {
  return `<span class="sr-chip ${cls}">${label}</span>`;
}

function buildFactors(sig) {
  const f = sig.factors || {};
  const isShort = sig.action === 'SHORT';
  const impulseText = isShort ? 'Dump' : 'Pump';
  const pullText = isShort ? 'Bounce' : 'Drop';
  const confirmText = isShort ? 'Reject' : 'Reclaim';
  const chips = [];
  chips.push(chip(`5m vol ${Number(f.vol5mX ?? 0).toFixed(1)}x`, Number(f.vol5mX ?? 0) >= 2 ? 'ok' : 'warn'));
  chips.push(chip(`15m vol ${Number(f.vol15mX ?? 0).toFixed(1)}x`, Number(f.vol15mX ?? 0) >= 1.8 ? 'ok' : 'warn'));
  chips.push(chip(`${impulseText} 5m ${Number(f.move5mPct ?? 0).toFixed(1)}%`, Number(f.move5mPct ?? 0) >= 12 ? 'ok' : ''));
  chips.push(chip(`${impulseText} 15m ${Number(f.move15mPct ?? 0).toFixed(1)}%`, Number(f.move15mPct ?? 0) >= 14 ? 'ok' : ''));
  chips.push(chip(`${pullText} ${Number(f.drop5mPct ?? 0).toFixed(1)}%`, Number(f.drop5mPct ?? 0) >= 5 ? 'ok' : 'warn'));
  chips.push(chip(`EMA dist ${Number(f.emaZoneDistPct ?? 0).toFixed(2)}%`, Number(f.emaZoneDistPct ?? 99) <= 3 ? 'ok' : 'warn'));
  chips.push(chip(`${confirmText} ${Number(f.reclaimPct ?? 0).toFixed(1)}%`, Number(f.reclaimPct ?? 0) >= 1.8 ? 'ok' : ''));
  chips.push(chip(`Pull ${f.pullbackAge5m ?? '?'} bars`, Number(f.pullbackAge5m ?? 99) <= 4 ? 'ok' : ''));
  if (sig.entryMode === 'EMA99_LOW_SCORE') chips.push(chip('Entry EMA99', 'warn'));
  if (f.rsi5m != null) chips.push(chip(`RSI5 ${Number(f.rsi5m).toFixed(0)}`));
  if (f.rsi15m != null) chips.push(chip(`RSI15 ${Number(f.rsi15m).toFixed(0)}`));
  return chips.join('');
}

function buildTrapAlert(sig) {
  const flags = sig.riskFlags || {};
  if (sig.bottomReboundRisk || String(sig.subtype ?? '') === 'BOTTOM_REBOUND_RISK') {
    const reasons = Array.isArray(flags.bottomRiskReasons) && flags.bottomRiskReasons.length
      ? flags.bottomRiskReasons.join(' | ')
      : sig.autoTradeBlockReason || 'False-bottom risk: rebound may be distribution.';
    return `
      <div class="sr-trap-alert">
        <strong>FALSE BOTTOM / DISTRIBUTION RISK</strong>
        <span>${escapeHtml(reasons)}</span>
        <span style="margin-top:8px;font-weight:900">BLOCK PAPER + BINANCE AUTO</span>
      </div>
    `;
  }
  const risk = String(flags.trapRisk || 'LOW').toUpperCase();
  if (!['MEDIUM', 'HIGH'].includes(risk)) return '';
  const isShort = sig.action === 'SHORT';
  const title = risk === 'HIGH'
    ? `CANH BAO DO: NE ${isShort ? 'SHORT' : 'LONG'}`
    : `CANH BAO: ${isShort ? 'SHORT' : 'LONG'} CO RUI RO BAY`;
  const reasons = Array.isArray(flags.trapReasons) && flags.trapReasons.length
    ? flags.trapReasons.join(' | ')
    : 'Cau truc sau pump/dump dang yeu, tin hieu co the la bay.';
  return `
    <div class="sr-trap-alert">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(reasons)}</span>
    </div>
  `;
}

function buildEmaCompare(sig) {
  const entry = Number(sig.entry);
  const ema5 = Number(sig.ema99_5m ?? sig.ema99 ?? sig.factors?.ema99_5m);
  const ema15 = Number(sig.ema99_15m ?? sig.factors?.ema99_15m);
  const item = (label, value) => {
    const dist = Number.isFinite(entry) && entry > 0 && Number.isFinite(value) && value > 0
      ? ((entry - value) / value) * 100
      : null;
    const distText = dist == null ? '-' : `${dist >= 0 ? '+' : ''}${dist.toFixed(2)}% vs Entry`;
    const color = dist == null ? 'var(--muted)' : dist >= 0 ? 'var(--green)' : 'var(--red)';
    return `
      <div class="sr-price">
        <span>${label}</span>
        <strong>${fmtPrice(value)}</strong>
        <small style="color:${color}">${distText}</small>
      </div>
    `;
  };
  return `<div class="sr-ema-compare">${item('EMA99 5m', ema5)}${item('EMA99 15m', ema15)}</div>`;
}

function buildOrderDecision(sig) {
  const symbol = String(sig.symbol ?? '').toUpperCase();
  const side = String(sig.action ?? '').toUpperCase();
  const opposite = side === 'LONG' ? 'SHORT' : 'LONG';
  const now = Date.now();
  const cooldownMs = 4 * 3600 * 1000;
  const related = srPaperTrades.filter((t) =>
    String(t.symbol ?? '').toUpperCase() === symbol
    && String(t.source ?? '').startsWith('shakeout-auto'));
  const sameSide = related.filter((t) => String(t.side ?? '').toUpperCase() === side);
  const activeSame = sameSide.filter((t) => ['OPEN', 'PENDING'].includes(t.status));
  const activeOpposite = related.find((t) =>
    String(t.side ?? '').toUpperCase() === opposite
    && ['OPEN', 'PENDING'].includes(t.status));
  const latestSame = sameSide
    .slice()
    .sort((a, b) => Date.parse(b.createdAt ?? 0) - Date.parse(a.createdAt ?? 0))[0];
  const trapRisk = String(sig.riskFlags?.trapRisk ?? 'LOW').toUpperCase();

  let paperTone = '#34d399';
  let paperTitle = 'PAPER: DU DIEU KIEN';
  let paperReason = 'Dang cho backend xu ly o vong scan tiep theo.';

  if (sig.stage !== 'RECLAIM_CONFIRMED') {
    paperTone = '#fbbf24';
    paperTitle = 'PAPER: CHUA VAO';
    paperReason = 'Tin hieu moi o SHAKEOUT WATCH, paper chi vao RECLAIM_CONFIRMED.';
  } else if (Number(sig.score ?? 0) < 55) {
    paperTone = '#fb7185';
    paperTitle = 'PAPER: KHONG DU DIEM';
    paperReason = `Score ${sig.score ?? '-'} < 55.`;
  } else if (sig.bottomReboundRisk || sig.autoTradeBlocked
      || String(sig.subtype ?? '') === 'BOTTOM_REBOUND_RISK') {
    paperTone = '#fb7185';
    paperTitle = 'PAPER: BI BLOCK';
    paperReason = sig.autoTradeBlockReason || 'False-bottom / distribution risk.';
  } else if (activeOpposite) {
    paperTone = '#fb7185';
    paperTitle = 'PAPER: BLOCK HEDGE';
    paperReason = `Dang co ${opposite} ${activeOpposite.status} tu ${activeOpposite.source}; khong mo ${side} cung symbol.`;
  } else if (activeSame.length) {
    const scout = activeSame.find((t) => String(t.source ?? '').includes('-scout-'));
    const dynamic = activeSame.find((t) => t.btcDynamicEntry);
    const regular = activeSame.find((t) =>
      !String(t.source ?? '').includes('-scout-') && !t.btcDynamicEntry);
    paperTitle = 'PAPER: DA VAO';
    paperReason = [
      scout ? `Scout $${Number(scout.marginUsdt ?? 1).toFixed(0)} ${scout.status}` : '',
      dynamic
        ? `BTC Dynamic ${dynamic.status}${dynamic.btcDynamicLocked ? ' / entry da khoa' : ' / dang bam BTC'} @ ${fmtPrice(dynamic.entryPrice)}`
        : '',
      regular ? `${regular.variant ?? 'ORDER'} ${regular.status} @ ${fmtPrice(regular.entryPrice)}` : '',
    ].filter(Boolean).join(' | ');
  } else if (latestSame) {
    const ageMs = now - Date.parse(latestSame.createdAt ?? 0);
    if (ageMs >= 0 && ageMs < cooldownMs) {
      paperTone = '#fbbf24';
      paperTitle = 'PAPER: COOLDOWN';
      paperReason = `Da phat ${latestSame.status} luc ${new Date(latestSame.createdAt).toLocaleTimeString('vi-VN')}; con ${Math.ceil((cooldownMs - ageMs) / 60000)} phut cooldown.`;
    } else {
      paperTone = '#fbbf24';
      paperTitle = 'PAPER: CHUA TAO LENH';
      paperReason = 'Khong co lenh active; co the signal vua xuat hien sau batch paper hoac bi dedup backend.';
    }
  }

  const realBlocked = ['MEDIUM', 'HIGH'].includes(trapRisk);
  const realTone = realBlocked ? '#fb7185' : '#94a3b8';
  const realText = realBlocked
    ? `BINANCE: KHONG VAO - trapRisk ${trapRisk} hien van bi chan cho lenh that.`
    : 'BINANCE: phu thuoc score, runtime Auto ON, vi the/open order, liquidity block va so du.';

  return `
    <div style="margin-top:9px;padding:9px 10px;border:2px solid ${paperTone};background:#111827;color:${paperTone};font-size:11px;font-weight:900;line-height:1.45">
      <div style="font-size:12px">${escapeHtml(paperTitle)}</div>
      <div style="color:#e5e7eb;font-weight:700">${escapeHtml(paperReason)}</div>
      <div style="margin-top:5px;padding-top:5px;border-top:1px solid #374151;color:${realTone}">${escapeHtml(realText)}</div>
    </div>
  `;
}

function buildCard(sig) {
  const confirmed = sig.stage === 'RECLAIM_CONFIRMED';
  const isShort = sig.action === 'SHORT';
  const isBottomReboundRisk = !isShort
    && (sig.bottomReboundRisk || String(sig.subtype ?? '') === 'BOTTOM_REBOUND_RISK');
  const isBottomRebound = !isShort
    && !isBottomReboundRisk
    && (sig.bottomReboundQualified || String(sig.subtype ?? '') === 'BOTTOM_REBOUND');
  const stageClass = isBottomReboundRisk ? 'bottom-rebound-risk'
    : isBottomRebound ? 'bottom-rebound'
    : isShort ? 'short' : (confirmed ? 'confirmed' : 'watch');
  const badgeClass = isBottomReboundRisk ? 'bottom-rebound-risk'
    : isBottomRebound ? 'bottom-rebound' : isShort ? 'short' : stageClass;
  const stageText = isBottomReboundRisk
    ? 'FALSE BOTTOM · AUTO BLOCKED'
    : isBottomRebound
    ? 'BOTTOM REBOUND · MARKET $5'
    : isShort
    ? (confirmed ? 'SHORT REJECT CONFIRMED' : 'SHORT PULLBACK WATCH')
    : (confirmed ? 'LONG RECLAIM CONFIRMED' : 'LONG SHAKEOUT WATCH');
  const detailUrl = `/?symbol=${encodeURIComponent(sig.symbol)}`;
  const changeColor = Number(sig.change24h ?? 0) >= 0 ? 'var(--green)' : 'var(--red)';
  return `
    <article class="sr-card ${stageClass}">
      <div class="sr-top">
        <div>
          <a class="sr-symbol" href="${detailUrl}" target="_blank">${sig.symbol.replace(/USDT$/, '')}<span>USDT</span></a>
          <span class="sr-change" style="color:${changeColor}">${fmtPct(sig.change24h)} 24h · ${fmtPrice(sig.markPrice)}</span>
        </div>
        <div class="sr-right">
          <span class="sr-badge ${badgeClass}">${stageText}</span>
          <div class="sr-score"><strong>${sig.score ?? '-'}</strong><span class="sr-grade">${sig.grade ?? '-'}</span></div>
        </div>
      </div>

      <div class="sr-pattern">${sig.reason || ''}</div>
      ${isBottomRebound ? `<div style="margin-top:8px;padding:9px;border:1px solid #22d3ee;background:#083344;color:#a5f3fc;font-weight:900">
        SONG HOI TU DAY · MARKET $5 · DCA +$10 KHI ROE ≤ -25% · NO SL<br>
        drawdown ${fmtPct(sig.factors?.bottomDeclinePct)} · rebound ${fmtPct(sig.factors?.bottomReboundPct)}
      </div>` : ''}
      ${isBottomReboundRisk ? `<div style="margin-top:8px;padding:10px;border:2px solid #fb7185;background:#7f1d1d;color:#fff;font-weight:900">
        HOI PHAN PHOI / DAY GIA · KHONG VAO LONG<br>
        drawdown ${fmtPct(sig.factors?.bottomDeclinePct)} · rebound ${fmtPct(sig.factors?.bottomReboundPct)}
      </div>` : ''}
      ${sig.btcStrongShortEma99 ? `<div style="margin-top:8px;padding:10px;border:2px solid #fbbf24;background:#422006;color:#fde68a;font-weight:900">
        BTC STRONG · SHORT CHO DUNG EMA99 5M<br>
        Khong vao MARKET · khong clamp entry ve 5%
      </div>` : ''}
      ${sig.btcIndependentShort ? `<div style="margin-top:8px;padding:10px;border:2px solid #22d3ee;background:#083344;color:#a5f3fc;font-weight:900">
        ${escapeHtml(sig.btcEntryClass)} · COIN KHONG THEO BTC<br>
        Entry theo cau truc coin · corr ${sig.btcRelation?.corr ?? '-'} · beta ${sig.btcRelation?.beta ?? '-'}
      </div>` : ''}
      ${buildTrapAlert(sig)}
      ${buildOrderDecision(sig)}

      <div class="sr-prices">
        <div class="sr-price"><span>Entry</span><strong>${fmtPrice(sig.entry)}</strong></div>
        <div class="sr-price"><span>SL</span><strong style="color:${isBottomRebound ? '#67e8f9' : 'var(--red)'}">${isBottomRebound ? 'NO SL' : isBottomReboundRisk ? 'AUTO BLOCK' : fmtPrice(sig.sl)}</strong></div>
        <div class="sr-price"><span>${isShort ? 'TP1 low' : 'TP1 high'}</span><strong style="color:var(--amber)">${fmtPrice(sig.tp1)}</strong></div>
        <div class="sr-price"><span>Runner TP</span><strong style="color:var(--green)">${fmtPrice(sig.tp)}</strong></div>
      </div>
      ${buildEmaCompare(sig)}

      <div class="sr-factors">${buildFactors(sig)}</div>
      <div style="color:var(--muted);font-size:12px;line-height:1.45">${sig.note || ''}</div>

      <div class="sr-footer">
        <span>${timeAgo(sig.scannedAt)} ago</span>
        <span>${isShort ? 'Dump expansion -> short kill -> reject' : 'Volume expansion -> shakeout -> reclaim'}</span>
      </div>
    </article>
  `;
}

function render() {
  const q = searchInput.value.trim().toUpperCase();
  const side = sideFilter.value;
  const stage = stageFilter.value;
  const minScore = Number(scoreFilter.value || 0);
  let rows = allSignals.slice();
  if (q) rows = rows.filter((s) => s.symbol.includes(q));
  if (side !== 'all') rows = rows.filter((s) => s.action === side);
  if (stage !== 'all') rows = rows.filter((s) => s.stage === stage);
  if (minScore > 0) rows = rows.filter((s) => Number(s.score ?? 0) >= minScore);

  const sort = sortSelect.value;
  rows.sort((a, b) => {
    if (sort === 'volume') return Number(b.factors?.vol5mX ?? 0) - Number(a.factors?.vol5mX ?? 0);
    if (sort === 'drop') return Number(b.factors?.drop5mPct ?? 0) - Number(a.factors?.drop5mPct ?? 0);
    if (sort === 'fresh') return Number(a.factors?.pullbackAge5m ?? 99) - Number(b.factors?.pullbackAge5m ?? 99);
    return Number(b.score ?? 0) - Number(a.score ?? 0);
  });

  confirmedCount.textContent = allSignals.filter((s) => s.stage === 'RECLAIM_CONFIRMED').length;
  watchCount.textContent = allSignals.filter((s) => s.stage !== 'RECLAIM_CONFIRMED').length;
  totalScanned.textContent = processed || '-';
  lastScan.textContent = scannedAt ? timeAgo(scannedAt) : '-';
  cachedCount.textContent = processed || 0;
  totalCount.textContent = total || 0;
  foundCount.textContent = allSignals.length;

  if (!rows.length) {
    grid.innerHTML = '<div class="empty">Chua co shakeout reclaim signal. Doi cache 5m/15m du hon hoac ha score filter.</div>';
    return;
  }
  grid.innerHTML = rows.map(buildCard).join('');
}

const srDailyStats = document.getElementById('srDailyStats');
const srVariantCompare = document.getElementById('srVariantCompare');

function renderVariantCompare(vc) {
  if (!srVariantCompare) return;
  if (!Array.isArray(vc) || !vc.length) {
    srVariantCompare.innerHTML = '';
    return;
  }
  const cls = (v) => (Number(v) >= 0 ? 'sr-daily-pos' : 'sr-daily-neg');
  const sign = (v) => (Number(v) >= 0 ? '+' : '');
  const label = { MARKET: 'MARKET (vào ngay)', PENDING: 'PENDING (chờ chạm entry)' };
  const rows = vc.map((v) => `
    <tr>
      <td class="sr-daily-date">${escapeHtml(label[v.variant] ?? v.variant)}</td>
      <td>${v.total ?? 0}</td>
      <td>${v.closed ?? 0}</td>
      <td>${v.open ?? 0}${v.pending ? ` / ${v.pending} chờ` : ''}</td>
      <td class="sr-daily-pos">${v.wins ?? 0}</td>
      <td class="sr-daily-neg">${v.losses ?? 0}</td>
      <td>${v.winRate ?? 0}%</td>
      <td class="${cls(v.totalPnl)}">${sign(v.totalPnl)}$${Number(v.totalPnl ?? 0).toFixed(2)}</td>
      <td class="${cls(v.avgRoe)}">${v.avgRoe != null ? sign(v.avgRoe) + Number(v.avgRoe).toFixed(1) + '%' : '-'}</td>
    </tr>
  `).join('');
  srVariantCompare.innerHTML = `
    <div class="sr-daily-title">So sanh diem vao - MARKET vs PENDING (2 lenh / 1 tin hieu)</div>
    <table class="sr-daily-table">
      <thead>
        <tr>
          <th>Cach vao</th><th>Tong</th><th>Closed</th><th>Open/Cho</th><th>Win</th><th>Loss</th><th>WR</th><th>PnL ($)</th><th>Avg ROE</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderDailyStats(daily) {
  if (!srDailyStats) return;
  if (!Array.isArray(daily) || !daily.length) {
    srDailyStats.innerHTML = '';
    return;
  }
  const totPnl = daily.reduce((s, d) => s + Number(d.totalPnl ?? 0), 0);
  const cls = (v) => (Number(v) >= 0 ? 'sr-daily-pos' : 'sr-daily-neg');
  const sign = (v) => (Number(v) >= 0 ? '+' : '');
  const rows = daily.map((d) => `
    <tr>
      <td class="sr-daily-date">${escapeHtml(d.date)}</td>
      <td>${d.orders ?? 0}</td>
      <td class="sr-daily-pos">${d.wins ?? 0}</td>
      <td class="sr-daily-neg">${d.losses ?? 0}</td>
      <td>${d.tpHits ?? 0} / ${d.slHits ?? 0}</td>
      <td>${d.winRate ?? 0}%</td>
      <td class="${cls(d.totalPnl)}">
        ${sign(d.totalPnl)}$${Number(d.totalPnl ?? 0).toFixed(2)}
        ${Number(d.openPartialRealizedPnl ?? 0) !== 0
          ? `<small style="display:block;color:#67e8f9">+$${Number(d.openPartialRealizedPnl).toFixed(2)} đã chốt từ lệnh mở</small>`
          : ''}
      </td>
      <td class="${cls(d.totalRoe)}">${sign(d.totalRoe)}${Number(d.totalRoe ?? 0).toFixed(0)}%</td>
    </tr>
  `).join('');
  srDailyStats.innerHTML = `
    <div class="sr-daily-title">Thong ke theo ngay - tong PnL <span class="${cls(totPnl)}">${sign(totPnl)}$${totPnl.toFixed(2)}</span></div>
    <table class="sr-daily-table">
      <thead>
        <tr>
          <th>Ngay</th><th>Lenh</th><th>Win</th><th>Loss</th><th>TP/SL</th><th>WR</th><th>PnL ($)</th><th>ROE</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function srPaperSortValue(t, key) {
  switch (key) {
    case 'variant': return String(t.variant ?? '');
    case 'symbol': return String(t.symbol ?? '');
    case 'side': return String(t.side ?? '');
    case 'entry': return Number(t.entryPrice);
    case 'sl': return t.sl == null ? null : Number(t.sl);
    case 'tp': return t.tp == null ? null : Number(t.tp);
    case 'projectedPnl': return getSrProjectedPnl(t).roe;
    case 'mark': return Number(t.markPrice ?? t.exitPrice);
    case 'pnl': return t.pnl == null ? null : Number(t.pnl);
    case 'roe': return t.roe == null ? null : Number(t.roe);
    case 'score': return t.score == null ? null : Number(t.score);
    case 'source': return String(t.source ?? '');
    case 'time': return Date.parse(t.createdAt ?? '') || 0;
    case 'status': {
      const rank = { OPEN: 0, PENDING: 1, CLOSED: 2 };
      return rank[t.status] ?? 9;
    }
    default: return '';
  }
}

function getSrProjectedPnl(t) {
  const entry = Number(t.entryPrice);
  const tp = Number(t.tp);
  const leverage = Number(t.leverage);
  const margin = Number(t.marginUsdt);
  if (![entry, tp, leverage, margin].every(Number.isFinite) || entry <= 0 || leverage <= 0 || margin <= 0) {
    return { pnl: null, roe: null };
  }
  const sideMult = t.side === 'SHORT' ? -1 : 1;
  if (t.partialTpTaken) {
    const quantity = Number(t.quantity);
    const realizedPnl = Number(t.realizedPnl ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return { pnl: null, roe: null };
    const pnl = realizedPnl + (tp - entry) * quantity * sideMult;
    return { pnl, roe: pnl / margin * 100 };
  }
  const roe = ((tp - entry) / entry) * leverage * 100 * sideMult;
  return {
    roe,
    pnl: margin * roe / 100,
  };
}

function compareSrValues(a, b, dir) {
  const aMissing = a == null || (typeof a === 'number' && Number.isNaN(a));
  const bMissing = b == null || (typeof b === 'number' && Number.isNaN(b));
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;   // null luôn xuống cuối
  if (bMissing) return -1;
  const r = (typeof a === 'string' || typeof b === 'string')
    ? String(a).localeCompare(String(b), 'en')
    : a - b;
  return dir === 'asc' ? r : -r;
}

function sortSrPaperTrades(trades) {
  const { key, dir } = srPaperSort;
  return trades.slice().sort((a, b) => {
    const r = compareSrValues(srPaperSortValue(a, key), srPaperSortValue(b, key), dir);
    if (r !== 0) return r;
    // tie-break: lệnh mới nhất trước
    return Date.parse(b.createdAt ?? 0) - Date.parse(a.createdAt ?? 0);
  });
}

function updateSrSortHeaders() {
  document.querySelectorAll('.sr-sort').forEach((th) => {
    const active = th.dataset.sort === srPaperSort.key;
    th.classList.toggle('active', active);
    const mark = th.querySelector('.sr-sort-mark');
    if (mark) mark.textContent = active ? (srPaperSort.dir === 'asc' ? '^' : 'v') : '';
  });
}

document.querySelectorAll('.sr-sort').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (!key) return;
    if (srPaperSort.key === key) {
      srPaperSort.dir = srPaperSort.dir === 'asc' ? 'desc' : 'asc';
      if (isCancelled) {
        variantBadge = `<span class="sr-variant-badge pending" style="color:#fb7185;border-color:#fb7185" title="${escapeHtml(t.note)}">B · CANCELLED - MARKET ≤ -10%</span>`;
      }
    } else {
      // số/giá mặc định desc, chữ mặc định asc
      srPaperSort = { key, dir: ['symbol', 'side', 'variant', 'source', 'status'].includes(key) ? 'asc' : 'desc' };
    }
    renderPaperTrades({ trades: srPaperTrades, summary: srPaperLastSummary, daily: srPaperLastDaily, variantCompare: srPaperLastVariant });
  });
});

let srPaperLastSummary = {};
let srPaperLastDaily = [];
let srPaperLastVariant = [];

function renderPaperTrades(data) {
  const trades = Array.isArray(data?.trades) ? data.trades : [];
  srPaperTrades = trades;
  if (allSignals.length) render();
  srPaperLastSummary = data?.summary ?? {};
  srPaperLastDaily = Array.isArray(data?.daily) ? data.daily : [];
  srPaperLastVariant = Array.isArray(data?.variantCompare) ? data.variantCompare : [];
  const summary = data?.summary ?? {};
  const validClosed = Math.max(0, Number(summary.closed ?? 0) - Number(summary.invalid ?? 0));
  const winRate = validClosed > 0 ? Math.round(Number(summary.wins ?? 0) / validClosed * 100) : null;
  srPaperSummary.textContent = `${summary.open ?? 0} open - ${summary.closed ?? 0} closed`
    + (summary.expired ? ` - ${summary.expired} expired` : '')
    + (summary.cancelled ? ` - ${summary.cancelled} cancelled` : '')
    + (summary.invalid ? ` - ${summary.invalid} invalid` : '')
    + ((summary.recoveryActive || summary.recoveryBreakeven || summary.recoverySl30)
      ? ` - recovery ${summary.recoveryActive ?? 0} active / ${summary.recoveryBreakeven ?? 0} BE / ${summary.recoverySl30 ?? 0} SL30`
      : '')
    + ((summary.partialActive || summary.partialBreakeven || summary.partialTrail || summary.runnerTpHits)
      ? ` - partial ${summary.partialActive ?? 0} active / ${summary.partialBreakeven ?? 0} BE / ${summary.partialTrail ?? 0} trail / ${summary.runnerTpHits ?? 0} runner TP`
      : '')
    + (winRate != null ? ` - WR ${winRate}% - avg ROE ${summary.avgRoe ?? '-'}%` : ' - auto confirmed >=60');

  renderVariantCompare(Array.isArray(data?.variantCompare) ? data.variantCompare : []);
  renderDailyStats(Array.isArray(data?.daily) ? data.daily : []);

  const rows = sortSrPaperTrades(trades);
  updateSrSortHeaders();

  if (!rows.length) {
    srPaperBody.innerHTML = '<tr><td colspan="15" style="text-align:center;color:var(--muted);padding:16px">Chua co paper trade Shakeout nao.</td></tr>';
    return;
  }

  srPaperBody.innerHTML = rows.map((t) => {
    const isClosed = t.status === 'CLOSED';
    const sideClass = t.side === 'LONG' ? 'sr-paper-long' : 'sr-paper-short';
    const isExpired = t.status === 'EXPIRED';
    const isCancelled = t.status === 'CANCELLED';
    const action = isClosed || isExpired || isCancelled
      ? `<button class="sr-paper-btn del" data-paper-delete="${escapeHtml(t.id)}">Del</button>`
      : `<button class="sr-paper-btn" data-paper-close="${escapeHtml(t.id)}">Close</button>`;
    const variant = String(t.variant ?? '').toUpperCase();
    const isLegacyBottomRisk = Boolean(t.bottomRebound)
      && String(t.trapRisk ?? '').toUpperCase() === 'HIGH';
    const isBottomRisk = Boolean(t.bottomReboundRisk)
      || String(t.subtype ?? '') === 'BOTTOM_REBOUND_RISK'
      || isLegacyBottomRisk;
    const rowClass = isBottomRisk
      ? 'sr-row-bottom-rebound-risk'
      : t.bottomRebound || String(t.subtype ?? '') === 'BOTTOM_REBOUND'
        ? 'sr-row-bottom-rebound'
        : variant === 'MARKET' ? 'sr-row-market'
          : variant === 'PENDING' ? 'sr-row-pending' : '';
    const isNearMarketPending = String(t.note ?? '').includes('nearMarketEntry=');
    let variantBadge;
    if (variant === 'MARKET') {
      variantBadge = '<span class="sr-variant-badge market" title="Cách A: vào ngay theo giá market">A · MARKET</span>';
    } else if (variant === 'PENDING') {
      // PENDING chỉ thành vị thế khi giá chạm entry (status chuyển PENDING -> OPEN)
      variantBadge = t.status === 'PENDING'
        ? '<span class="sr-variant-badge pending waiting" title="Cách B: CHƯA khớp - đang chờ giá chạm entry, chưa có vị thế">B · CHỜ KHỚP</span>'
        : '<span class="sr-variant-badge pending" title="Cách B: ĐÃ khớp khi giá chạm entry">B · ĐÃ KHỚP</span>';
    } else {
      variantBadge = '<span class="sr-variant-badge none">-</span>';
    }
    if (isCancelled) {
      variantBadge = `<span class="sr-variant-badge pending" style="color:#fb7185;border-color:#fb7185" title="${escapeHtml(t.note)}">B · CANCELLED - MARKET ≤ -10%</span>`;
    }
    if (variant === 'PENDING' && isNearMarketPending && !isCancelled) {
      variantBadge = `<span class="sr-variant-badge pending${t.status === 'PENDING' ? ' waiting' : ''}" title="${escapeHtml(t.note)}">B · LIMIT GẦN MARKET</span>`;
    }
    if (t.btcStrongShortEma99) {
      variantBadge = `<span class="sr-variant-badge pending${t.status === 'PENDING' ? ' waiting' : ''}" style="color:#fde68a;border-color:#fbbf24;background:#422006" title="${escapeHtml(t.note)}">BTC STRONG · EMA99 EXACT</span>`;
    }
    if (String(t.source ?? '').includes('-scout-')) {
      variantBadge = `<span class="sr-variant-badge market" style="color:#a5f3fc;border-color:#22d3ee;background:#083344" title="${escapeHtml(t.note)}">SCOUT · MARKET $${Number(t.marginUsdt ?? 1).toFixed(0)}</span>`;
    }
    if (t.btcDynamicEntry) {
      const state = t.btcDynamicLocked ? 'LOCKED' : t.status === 'PENDING' ? 'FOLLOWING' : t.status;
      variantBadge = `<span class="sr-variant-badge pending${t.status === 'PENDING' ? ' waiting' : ''}" style="color:#fef08a;border-color:#eab308;background:#422006" title="${escapeHtml(t.note)}">BTC DYNAMIC · ${escapeHtml(state)}</span>`
        + `<div style="margin-top:5px;color:#fde68a;font-size:10px;font-weight:900;line-height:1.35">`
        + `MAX ${Number(t.btcDynamicMaxPct ?? 0).toFixed(0)}% · beta ${Number(t.btcDynamicBeta ?? 1).toFixed(2)}`
        + `<br>BTC ${fmtPrice(t.btcAnchorPrice)} → ${fmtPrice(t.btcLastPrice)}`
        + `</div>`;
    }
    if (t.btcIndependentShort) {
      variantBadge += `<div style="margin-top:5px;color:#a5f3fc;font-size:10px;font-weight:900;line-height:1.35">`
        + `${escapeHtml(t.btcEntryClass || 'INDEPENDENT')} · COIN STRUCTURE`
        + `<br>corr ${t.btcRelation?.corr ?? '-'} · beta ${t.btcRelation?.beta ?? '-'}`
        + `</div>`;
    }
    if (t.lossTpMovedToEntry) {
      variantBadge += `<div style="margin-top:5px;padding:4px;color:#fde68a;background:#422006;border:1px solid #fbbf24;font-size:10px;font-weight:900;line-height:1.35">`
        + `AM ${Math.abs(Number(t.lossTpTriggerRoe ?? 15)).toFixed(0)}% · TP VE ENTRY`
        + `<br>old TP ${fmtPrice(t.lossTpOriginalTp)}`
        + `</div>`;
    }
    if (t.partialTpTaken) {
      const closedPct = Math.round(Number(t.partialCloseRatio ?? 0.3) * 100);
      const runnerPct = Math.max(0, 100 - closedPct);
      variantBadge += `<div style="margin-top:5px;color:#67e8f9;font-size:10px;font-weight:900;line-height:1.35">`
        + `DA CAT ${closedPct}% · CON ${runnerPct}%`
        + `<br>REALIZED ${fmtSigned(Number(t.realizedPnl ?? 0))}`
        + `</div>`;
    }
    if (isBottomRisk) {
      const riskReason = t.autoTradeBlockReason
        || t.warning
        || 'Historical bottom rebound with trapRisk HIGH';
      variantBadge += `<div style="margin-top:5px;padding:5px;color:#fff;background:#9f1239;border:1px solid #fb7185;font-size:10px;font-weight:900;line-height:1.35">`
        + `${isLegacyBottomRisk ? 'LEGACY ' : ''}FALSE BOTTOM · AUTO BLOCKED`
        + `<br>${escapeHtml(riskReason)}`
        + `</div>`;
    } else if (t.bottomRebound || String(t.subtype ?? '') === 'BOTTOM_REBOUND') {
      variantBadge += `<div style="margin-top:5px;color:#67e8f9;font-size:10px;font-weight:900;line-height:1.35">`
        + `BOTTOM REBOUND · MARKET $${Number(t.marginBeforeDca ?? t.marginUsdt ?? 5).toFixed(0)} · NO SL`
        + (t.dcaTaken
          ? `<br>DCA +$${Number(t.dcaMarginUsdt ?? 10).toFixed(0)} @ ${fmtPrice(t.dcaPrice)} · AVG ${fmtPrice(t.entryPrice)}`
          : '<br>DCA +$10 khi ROE ≤ -25%')
        + `</div>`;
    }
    const projected = getSrProjectedPnl(t);
    const projectedHtml = projected.roe == null
      ? '-'
      : `<strong style="color:${projected.roe >= 20 ? '#34d399' : '#fbbf24'}">${fmtSigned(projected.pnl)} / ${fmtSigned(projected.roe, '%')}</strong>`;
    return `
      <tr class="${rowClass}" style="${isClosed ? 'opacity:.55' : ''}">
        <td>${variantBadge}</td>
        <td><a href="/?symbol=${encodeURIComponent(t.symbol)}" target="_blank" style="color:var(--text);font-weight:900;text-decoration:none">${escapeHtml(t.symbol)}</a></td>
        <td><span class="${sideClass}">${escapeHtml(t.side)}</span></td>
        <td>${fmtPrice(t.entryPrice)}</td>
        <td>${fmtPrice(t.sl)}</td>
        <td>${fmtPrice(t.tp)}</td>
        <td title="PnL tai TP theo entry, margin va leverage">${projectedHtml}</td>
        <td data-srmark="${escapeHtml(t.id)}">${fmtPrice(t.markPrice)}</td>
        <td data-srpnl="${escapeHtml(t.id)}">${t.status === 'PENDING' ? '<span style="color:var(--muted)">chưa khớp</span>' : fmtSigned(t.pnl)}</td>
        <td data-srroe="${escapeHtml(t.id)}">${t.status === 'PENDING' ? '-' : fmtSigned(t.roe, '%')}</td>
        <td>${t.partialTpTaken
          ? `<span style="display:inline-block;padding:3px 7px;border:1px solid #22d3ee;color:#67e8f9;background:#083344;border-radius:4px;font-weight:900" title="${escapeHtml(t.note)}">${escapeHtml(
            isClosed
              ? (t.outcome === 'RUNNER_TP'
                ? 'RUNNER TP'
                : t.outcome === 'PARTIAL_TRAIL' ? 'PARTIAL TRAIL' : 'PARTIAL BE')
              : '30% TP · 70% RUNNER',
          )}</span>`
          : t.recoveryMode
          ? `<span style="display:inline-block;padding:3px 7px;border:1px solid #f59e0b;color:#fbbf24;background:#422006;border-radius:4px;font-weight:900" title="${escapeHtml(t.note)}">${escapeHtml(
            isClosed
              ? (t.outcome === 'RECOVERY_BE' ? 'RECOVERY BE' : 'RECOVERY SL30')
              : 'RECOVERY',
          )}</span>`
          : escapeHtml(t.status)}</td>
        <td>${t.score ?? '-'}</td>
        <td>${escapeHtml(t.source)}</td>
        <td>${t.createdAt ? new Date(t.createdAt).toLocaleTimeString('vi-VN') : '-'}</td>
        <td>${action}</td>
      </tr>
    `;
  }).join('');
}

async function loadPaperTrades() {
  try {
    const res = await fetch(PAPER_API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderPaperTrades(await res.json());
  } catch (err) {
    srPaperSummary.textContent = `Paper loi: ${err.message}`;
  }
}

async function postPaperAction(path, payload) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await loadPaperTrades();
}

function applyPayload(data) {
  allSignals = Array.isArray(data?.signals) ? data.signals : [];
  total = Number(data?.total ?? 0);
  processed = Number(data?.processed ?? 0);
  scannedAt = Number(data?.scannedAt ?? Date.now());
  scanStatus.textContent = data?.stale ? `Dung cache cu: ${data.staleReason || 'REST congested'}` : 'Live scan 5m + 15m kline cache';
  render();
}

async function fetchOnce() {
  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    const data = await res.json();
    applyPayload(data);
  } catch (err) {
    scanStatus.textContent = `Fetch loi: ${err.message}`;
  }
}

function connectSse() {
  const es = new EventSource(SSE_URL);
  es.onopen = () => { scanStatus.textContent = 'SSE connected'; };
  es.onmessage = (ev) => {
    try { applyPayload(JSON.parse(ev.data)); }
    catch (err) { scanStatus.textContent = `Parse loi: ${err.message}`; }
  };
  es.onerror = () => {
    scanStatus.textContent = 'SSE reconnecting...';
  };
}

function connectPaperSse() {
  const es = new EventSource(PAPER_SSE_URL);
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data?.error) {
        srPaperSummary.textContent = `Paper stream loi: ${data.error}`;
        return;
      }
      renderPaperTrades(data);
    } catch (err) {
      srPaperSummary.textContent = `Paper stream parse loi: ${err.message}`;
    }
  };
  es.onerror = () => {
    srPaperSummary.textContent = 'Paper stream disconnected, dang dung fallback poll...';
  };
}

// ── Live price socket (số nhảy realtime cho Mark & PnL) ───────────────────────
// Dùng Last Price (miniTicker .c) để khớp với giá hiển thị trên Binance, không dùng Mark Price (lệch theo index/funding)
const PRICE_URLS = [
  'wss://fstream.binance.com/ws/!miniTicker@arr@1s',
  'wss://fstream.binancefuture.com/ws/!miniTicker@arr@1s',
];
let priceUrlIdx = 0;
const livePrices = new Map();

function applyLivePrices() {
  if (!Array.isArray(srPaperTrades) || !srPaperTrades.length) return;
  for (const t of srPaperTrades) {
    const p = livePrices.get(t.symbol);
    if (!Number.isFinite(p) || p <= 0) continue;
    const markCell = srPaperBody.querySelector(`[data-srmark="${t.id}"]`);
    if (markCell) markCell.textContent = fmtPrice(p);
    if (t.status !== 'OPEN') continue; // PENDING chưa khớp / CLOSED đã chốt -> không tính lại PnL
    const entry = Number(t.entryPrice);
    const qty = Number(t.quantity);
    const margin = Number(t.marginUsdt);
    const realizedPnl = Number(t.realizedPnl ?? 0);
    if (!Number.isFinite(entry) || !Number.isFinite(qty) || !Number.isFinite(margin) || margin <= 0) continue;
    const sideMult = t.side === 'LONG' ? 1 : -1;
    const pnl = realizedPnl + (p - entry) * qty * sideMult;
    const roe = (pnl / margin) * 100;
    const pnlCell = srPaperBody.querySelector(`[data-srpnl="${t.id}"]`);
    const roeCell = srPaperBody.querySelector(`[data-srroe="${t.id}"]`);
    if (pnlCell) pnlCell.innerHTML = fmtSigned(pnl);
    if (roeCell) roeCell.innerHTML = fmtSigned(roe, '%');
  }
}

function connectPriceSocket() {
  let ws;
  try {
    ws = new WebSocket(PRICE_URLS[priceUrlIdx % PRICE_URLS.length]);
  } catch { setTimeout(connectPriceSocket, 3000); return; }
  ws.onmessage = (e) => {
    try {
      const rows = JSON.parse(e.data);
      if (!Array.isArray(rows)) return;
      for (const row of rows) {
        if (row.e !== '24hrMiniTicker') continue;
        const p = Number(row.c); // c = last price
        if (Number.isFinite(p)) livePrices.set(row.s, p);
      }
      applyLivePrices();
    } catch {}
  };
  ws.onclose = () => { priceUrlIdx++; setTimeout(connectPriceSocket, 3000); };
  ws.onerror = () => { try { ws.close(); } catch {} };
}

[searchInput, sideFilter, stageFilter, scoreFilter, sortSelect].forEach((el) => el.addEventListener('input', render));
srPaperBody.addEventListener('click', async (ev) => {
  const closeId = ev.target?.dataset?.paperClose;
  const deleteId = ev.target?.dataset?.paperDelete;
  if (!closeId && !deleteId) return;
  ev.target.disabled = true;
  try {
    if (closeId) await postPaperAction('/api/shakeout-paper-trades/close', { id: closeId });
    if (deleteId) await postPaperAction('/api/shakeout-paper-trades/delete', { id: deleteId });
  } catch (err) {
    srPaperSummary.textContent = `Paper action loi: ${err.message}`;
    ev.target.disabled = false;
  }
});
connectSse();
connectPaperSse();
fetchOnce();
loadPaperTrades();
setInterval(() => {
  lastScan.textContent = scannedAt ? timeAgo(scannedAt) : '-';
}, 1000);
setInterval(fetchOnce, 90_000);
function schedulePaperPoll() {
  const delay = srPaperTrades.some((t) => t.status === 'OPEN') ? 3000 : 15000;
  setTimeout(async () => {
    await loadPaperTrades();
    schedulePaperPoll();
  }, delay);
}
schedulePaperPoll();
