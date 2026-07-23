(function installPaperLearningColumns() {
  if (window.__paperLearningColumnsInstalled) return;
  window.__paperLearningColumnsInstalled = true;

  const page = location.pathname.replace(/^\//, '').replace(/\.html$/, '') || 'paper';
  const supported = new Set([
    'paper', 'ema-squeeze', 'pump', 'liquid-scan', 'cap', 'dump-ignition',
    'pump-ignition', 'br-like-limit', 'edge-short', 'spike-reversal',
    'post-pump-kill-short', 'top-reversal', 'decision-paper',
  ]);
  if (!supported.has(page)) return;

  const contexts = new Map();
  const normalize = (value) => String(value ?? '').trim().toUpperCase();
  const plain = (value) => normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();
  const number = (value) => {
    const parsed = Number(String(value ?? '').replace(/,/g, '').split(/\s|→/)[0]);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const symbolKey = (value) => normalize(value).split(/\s|·/)[0].replace(/USDT$/, '');
  const remember = (flag) => {
    const symbol = symbolKey(flag?.symbol);
    if (!symbol) return;
    const rows = contexts.get(symbol) ?? [];
    rows.push({ ...flag, entry: number(flag.entryPrice), openedMs: Date.parse(flag.openedAt ?? '') || 0 });
    contexts.set(symbol, rows);
  };
  const closest = (symbol, entry) => {
    const rows = contexts.get(symbolKey(symbol)) ?? [];
    if (!rows.length) return null;
    return [...rows].sort((a, b) => {
      const ad = entry == null || a.entry == null ? Infinity : Math.abs(a.entry - entry) / Math.max(entry, 1e-12);
      const bd = entry == null || b.entry == null ? Infinity : Math.abs(b.entry - entry) / Math.max(entry, 1e-12);
      return ad - bd || b.openedMs - a.openedMs;
    })[0] ?? null;
  };
  const badge = (flag) => {
    if (!flag) return '<span style="opacity:.55">PY NO DATA</span>';
    const tone = flag.tone === 'good' ? '#34d399' : flag.tone === 'risk' ? '#fb7185' : flag.tone === 'watch' ? '#fbbf24' : '#94a3b8';
    const title = String(flag.reason ?? '').replaceAll('"', '&quot;');
    return `<span title="${title}" style="display:inline-block;padding:3px 7px;border:1px solid ${tone};color:${tone};border-radius:4px;font-size:10px;font-weight:900;white-space:nowrap">${flag.label ?? flag.flag ?? 'PY NO DATA'}</span>`;
  };
  const modelRank = (flag) => {
    const value = plain(flag?.label ?? flag?.flag ?? '');
    if (value.includes('GOOD') || value.includes('VERIFIED')) return 4;
    if (value.includes('WATCH')) return 3;
    if (value.includes('RISK')) return 2;
    if (value.includes('NO OOS')) return 1;
    return 0;
  };
  const updateSortHeader = (table) => {
    const th = table.querySelector('th[data-paper-learning-column="true"]');
    if (!th) return;
    const dir = table.dataset.paperLearningSortDir ?? '';
    th.textContent = `PY MODEL${dir ? (dir === 'desc' ? ' ▼' : ' ▲') : ''}`;
  };
  const applyLearningSort = (table) => {
    const dir = table.dataset.paperLearningSortDir;
    const body = table.tBodies[0];
    if (!dir || !body) return;
    const current = [...body.rows];
    const sortable = current.filter((row) => row.cells.length > 1);
    if (sortable.length < 2) return;
    const factor = dir === 'asc' ? 1 : -1;
    const originalIndex = new Map(current.map((row, index) => [row, index]));
    const sorted = [...sortable].sort((a, b) => {
      const rankA = Number(a.querySelector('[data-paper-learning-cell]')?.dataset.paperLearningRank ?? 0);
      const rankB = Number(b.querySelector('[data-paper-learning-cell]')?.dataset.paperLearningRank ?? 0);
      return (rankA - rankB) * factor || originalIndex.get(a) - originalIndex.get(b);
    });
    const desired = [...sorted, ...current.filter((row) => row.cells.length <= 1)];
    if (desired.every((row, index) => current[index] === row)) return;
    const fragment = document.createDocumentFragment();
    desired.forEach((row) => fragment.appendChild(row));
    body.appendChild(fragment);
  };
  const isPaperTable = (table) => {
    const body = table.querySelector('tbody');
    const marker = `${body?.id ?? ''} ${table.className ?? ''} ${table.parentElement?.className ?? ''}`.toLowerCase();
    return page === 'paper' || page === 'br-like-limit' || marker.includes('paper') || marker.includes('closedtrade');
  };
  const enhance = (table) => {
    if (!isPaperTable(table)) return;
    const header = table.tHead?.rows?.[0];
    if (!header) return;
    let cells = [...header.cells];
    if (cells.some((cell) => plain(cell.textContent).includes('PY MODEL') || plain(cell.textContent).includes('PYTHON'))) return;
    const symbolIndex = cells.findIndex((cell) => {
      const text = plain(cell.textContent);
      return text.startsWith('SYMBOL') || text.startsWith('TIN HIEU');
    });
    if (symbolIndex < 0) return;
    const anchorIndex = Math.max(
      cells.findIndex((cell) => ['NEN BTC', 'BTC CANDLE'].some((name) => plain(cell.textContent).includes(name))),
      cells.findIndex((cell) => ['MAU NEN', 'CANDLE PATTERN'].some((name) => plain(cell.textContent).includes(name))),
      cells.findIndex((cell) => plain(cell.textContent).startsWith('SIDE')),
      symbolIndex,
    );
    const th = document.createElement('th');
    th.textContent = 'PY MODEL';
    th.dataset.paperLearningColumn = 'true';
    th.title = 'Bấm để sort theo đánh giá Python';
    th.style.cursor = 'pointer';
    th.style.userSelect = 'none';
    th.addEventListener('click', () => {
      table.dataset.paperLearningSortDir = table.dataset.paperLearningSortDir === 'desc' ? 'asc' : 'desc';
      updateSortHeader(table);
      applyLearningSort(table);
    });
    header.insertBefore(th, header.cells[anchorIndex + 1] ?? null);
    table.dataset.paperLearningColumns = 'true';
    enhanceRows(table);
  };
  const enhanceRows = (table) => {
    const header = table.tHead?.rows?.[0];
    if (!header) return;
    const cells = [...header.cells];
    const pyIndex = cells.findIndex((cell) => cell.dataset.paperLearningColumn === 'true');
    const symbolIndex = cells.findIndex((cell) => {
      const text = plain(cell.textContent);
      return text.startsWith('SYMBOL') || text.startsWith('TIN HIEU');
    });
    const entryIndex = cells.findIndex((cell) => plain(cell.textContent).startsWith('ENTRY'));
    if (pyIndex < 0 || symbolIndex < 0) return;
    for (const row of table.tBodies[0]?.rows ?? []) {
      if (row.cells.length <= 1) {
        if (row.cells[0]?.colSpan > 1) row.cells[0].colSpan = header.cells.length;
        continue;
      }
      const existing = row.querySelector('[data-paper-learning-cell]');
      const missing = existing ? 0 : 1;
      const sourceIndex = (index) => index - (missing && index > pyIndex ? 1 : 0);
      const symbol = row.cells[sourceIndex(symbolIndex)]?.textContent;
      const entry = entryIndex >= 0 ? number(row.cells[sourceIndex(entryIndex)]?.textContent) : null;
      const td = existing ?? document.createElement('td');
      td.dataset.paperLearningCell = 'true';
      td.style.minWidth = '104px';
      const flag = closest(symbol, entry);
      td.dataset.paperLearningRank = String(modelRank(flag));
      td.innerHTML = badge(flag);
      if (!existing) row.insertBefore(td, row.cells[pyIndex] ?? null);
    }
    applyLearningSort(table);
  };
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      document.querySelectorAll('table').forEach((table) => table.dataset.paperLearningColumns === 'true' ? enhanceRows(table) : enhance(table));
    });
  };
  const loadLearning = () => fetch(`/api/paper-page-self-learning?page=${encodeURIComponent(page)}`)
    .then((response) => response.json())
    .then((data) => {
      if (data?.error) throw new Error(data.error);
      contexts.clear();
      Object.values(data?.tradeFlags ?? {}).forEach(remember);
      schedule();
    })
    .catch((error) => console.warn('[PaperPageML]', error.message));
  loadLearning();
  setInterval(loadLearning, 305_000);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();
