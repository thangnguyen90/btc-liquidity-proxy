export const LOCAL_AI_NAVIGATION_VERSION = 'LOCAL_AI_NAVIGATION_ALL_MENUS_V14_PUMP_TURN_20261018';

const BINANCE_AUTO_LINK='<a class="nav-link binance-auto-controls-nav-link" href="/binance-auto-controls">Quản lý Binance tự động</a>';
const BINANCE_AUTO_HREF=/\bhref\s*=\s*["']\/binance-auto-controls(?:\.html)?(?:[?#][^"']*)?["']/i;
const LEGACY_NAV_ANCHOR=/<a\b[^>]*class\s*=\s*["'][^"']*\bnav-link\b[^"']*["'][^>]*>[\s\S]*?<\/a\s*>/gi;

// A CTA in page content is not a menu entry. Pagination is not a site menu.
export function injectBinanceAutoControlsNavigation(value){
  const html=String(value??''),nav=/<nav\b[^>]*>[\s\S]*?<\/nav\s*>/i.exec(html);
  if(nav){
    if(BINANCE_AUTO_HREF.test(nav[0]))return html;
    const insertAt=nav.index+nav[0].indexOf('>')+1;
    return html.slice(0,insertAt)+BINANCE_AUTO_LINK+html.slice(insertAt);
  }
  const anchors=[...html.matchAll(LEGACY_NAV_ANCHOR)];
  if(!anchors.length||anchors.some(a=>BINANCE_AUTO_HREF.test(a[0])))return html;
  return html.slice(0,anchors[0].index)+BINANCE_AUTO_LINK+html.slice(anchors[0].index);
}

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
const ZONE_NOTIFICATIONS_HREF='/liquidity-zone-notifications';
const ZONE_NOTIFICATIONS_LINK=`<a class="nav-link" href="${ZONE_NOTIFICATIONS_HREF}">Thông báo vùng thanh khoản</a>`;

export function injectLocalAiNavigation(value) {
  const html = injectBinanceAutoControlsNavigation(value);
  if (!html) return html;
  const missingLinks = [
    /href=["']\/pump-turn-watch["']/.test(html)?'':'<a class="nav-link" href="/pump-turn-watch">Điểm bơm / xả</a>',
    /href=["']\/coinglass-heatmap-lab["']/.test(html)?'':'<a class="nav-link" href="/coinglass-heatmap-lab">Heatmap Model1 /3</a>',
    /href=["']\/short-setup-watch["']/.test(html)?'':'<a class="nav-link" href="/short-setup-watch">Cơ hội LONG / SHORT</a>',
    /href=["']\/rising-volume-watch["']/.test(html)?'':'<a class="nav-link" href="/rising-volume-watch">Volume tăng dần</a>',
    html.includes(`href="${ZONE_NOTIFICATIONS_HREF}"`)||html.includes(`href='${ZONE_NOTIFICATIONS_HREF}'`)?'':ZONE_NOTIFICATIONS_LINK,
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
