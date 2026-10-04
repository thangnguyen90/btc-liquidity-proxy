export const LOCAL_AI_NAVIGATION_VERSION = 'LOCAL_AI_NAVIGATION_ALL_MENUS_V8_ZONE_MANAGER_20261004';

const LOCAL_AI_HREF = '/local-ai-trend-evaluation';
const LOCAL_AI_LINK = `<a class="nav-link local-ai-nav-link" href="${LOCAL_AI_HREF}">AI Local</a>`;
const MAIN_KILL_GAP_HREF = '/main-kill-gap-watch';
const MAIN_KILL_GAP_LINK = `<a class="nav-link main-kill-gap-nav-link" href="${MAIN_KILL_GAP_HREF}">Main Kill Gap</a>`;
const BINANCE_SIGNAL_ORDERS_HREF = '/binance-signal-orders';
const BINANCE_SIGNAL_ORDERS_LINK = `<a class="nav-link binance-signal-orders-nav-link" href="${BINANCE_SIGNAL_ORDERS_HREF}">Lệnh theo tín hiệu</a>`;
const OPPOSITE_LIQUIDITY_MANAGER_HREF = '/opposite-liquidity-manager';
const OPPOSITE_LIQUIDITY_MANAGER_LINK = `<a class="nav-link opposite-liquidity-manager-nav-link" href="${OPPOSITE_LIQUIDITY_MANAGER_HREF}">Thanh khoản ngược</a>`;
const PUSH_SIGNAL_MANAGER_HREF = '/push-signal-manager';
const PUSH_SIGNAL_MANAGER_LINK = `<a class="nav-link push-signal-manager-nav-link" href="${PUSH_SIGNAL_MANAGER_HREF}">Quản lý Push</a>`;
const ZONE_MANAGER_HREF = '/liquidity-zone-manager';
const ZONE_MANAGER_LINK = `<a class="nav-link" href="${ZONE_MANAGER_HREF}">Quản lý vùng thanh khoản</a>`;

export function injectLocalAiNavigation(value) {
  const html = String(value ?? '');
  if (!html) return html;
  const missingLinks = [
    html.includes(`href="${ZONE_MANAGER_HREF}"`) || html.includes(`href='${ZONE_MANAGER_HREF}'`) ? '' : ZONE_MANAGER_LINK,
    /href=["']\/ai-signal-review["']/.test(html) ? '' : '<a class="nav-link" href="/ai-signal-review">Đánh giá tín hiệu</a>',
    html.includes(`href="${LOCAL_AI_HREF}"`) || html.includes(`href='${LOCAL_AI_HREF}'`) ? '' : LOCAL_AI_LINK,
    html.includes(`href="${MAIN_KILL_GAP_HREF}"`) || html.includes(`href='${MAIN_KILL_GAP_HREF}'`) ? '' : MAIN_KILL_GAP_LINK,
    html.includes(`href="${BINANCE_SIGNAL_ORDERS_HREF}"`) || html.includes(`href='${BINANCE_SIGNAL_ORDERS_HREF}'`)
      ? '' : BINANCE_SIGNAL_ORDERS_LINK,
    html.includes(`href="${OPPOSITE_LIQUIDITY_MANAGER_HREF}"`) || html.includes(`href='${OPPOSITE_LIQUIDITY_MANAGER_HREF}'`)
      ? '' : OPPOSITE_LIQUIDITY_MANAGER_LINK,
    html.includes(`href="${PUSH_SIGNAL_MANAGER_HREF}"`) || html.includes(`href='${PUSH_SIGNAL_MANAGER_HREF}'`)
      ? '' : PUSH_SIGNAL_MANAGER_LINK,
  ].join('');
  if (!missingLinks) return html;

  const semanticNav = /<nav\b[^>]*>/i.exec(html);
  if (semanticNav) {
    const insertAt = semanticNav.index + semanticNav[0].length;
    return `${html.slice(0, insertAt)}${missingLinks}${html.slice(insertAt)}`;
  }

  // Older dashboards use a div/header with a contiguous group of .nav-link
  // anchors instead of a semantic <nav>. Prepending beside the first nav-link
  // keeps the new destination inside that existing menu without guessing its
  // wrapper or changing page-specific layout.
  const legacyNavLink = /<a\b[^>]*class\s*=\s*["'][^"']*\bnav-link\b[^"']*["'][^>]*>/i.exec(html);
  if (legacyNavLink) {
    return `${html.slice(0, legacyNavLink.index)}${missingLinks}${html.slice(legacyNavLink.index)}`;
  }

  return html;
}
