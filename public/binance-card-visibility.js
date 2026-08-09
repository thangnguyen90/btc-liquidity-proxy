export const BINANCE_CARD_MIN_AVG_ROE = 4;

export function isBinanceCardAvgRoeEligible(avgRoe) {
  const value = Number(avgRoe);
  return Number.isFinite(value) && value > BINANCE_CARD_MIN_AVG_ROE;
}

export function binanceCardAvgRoeAttrs(avgRoe) {
  const value = Number(avgRoe);
  const normalized = Number.isFinite(value) ? value : '';
  return `data-binance-card-avg-roe="${normalized}" data-binance-card-avg-roe-eligible="${isBinanceCardAvgRoeEligible(value) ? 'true' : 'false'}"`;
}

function displayedAvgRoe(card) {
  const stored = Number(card?.dataset?.binanceCardAvgRoe);
  if (Number.isFinite(stored)) return stored;
  const match = String(card?.textContent ?? '').match(/AvgROE\s*([+-]?\d+(?:\.\d+)?)\s*%/i);
  return match ? Number(match[1]) : null;
}

export function enforceBinanceCardAvgRoeVisibility(root = document) {
  const controls = root.querySelectorAll([
    '[data-binance-card-button]',
    '.liquid-live-card-toggle',
    '.live-card-toggle',
  ].join(','));
  for (const control of controls) {
    if (!String(control.textContent ?? '').toUpperCase().includes('BINANCE')) continue;
    const card = control.closest([
      '[data-binance-card-avg-roe]',
      '.pump-paper-metric',
      '.pump-combo-card',
      '.edge-combo-card',
      '.combo-card',
      '.stat-card',
    ].join(','));
    const eligible = card ? isBinanceCardAvgRoeEligible(displayedAvgRoe(card)) : false;
    control.hidden = !eligible;
    control.setAttribute('aria-hidden', eligible ? 'false' : 'true');
  }
}

export function installBinanceCardAvgRoeGuard(root = document) {
  let scheduled = false;
  const enforce = () => {
    scheduled = false;
    enforceBinanceCardAvgRoeVisibility(root);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(enforce);
    else setTimeout(enforce, 0);
  };
  schedule();
  if (typeof MutationObserver !== 'function') return null;
  const observer = new MutationObserver(schedule);
  observer.observe(root.documentElement ?? root, { childList: true, subtree: true });
  return observer;
}
