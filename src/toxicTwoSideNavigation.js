export const TOXIC_TWO_SIDE_NAVIGATION_VERSION = 'TOXIC_TWO_SIDE_NAVIGATION_ALL_MENUS_V1_20261001';

const HREF = '/toxic-two-side-market';
const LINK = `<a class="nav-link toxic-two-side-nav-link" href="${HREF}">Quét hai đầu</a>`;

export function injectToxicTwoSideNavigation(value) {
  const html = String(value ?? '');
  if (!html || html.includes(`href="${HREF}"`) || html.includes(`href='${HREF}'`)) return html;
  const nav = /<nav\b[^>]*>/i.exec(html);
  if (nav) {
    const at = nav.index + nav[0].length;
    return `${html.slice(0, at)}${LINK}${html.slice(at)}`;
  }
  const legacy = /<a\b[^>]*class\s*=\s*["'][^"']*\bnav-link\b[^"']*["'][^>]*>/i.exec(html);
  if (!legacy) return html;
  return `${html.slice(0, legacy.index)}${LINK}${html.slice(legacy.index)}`;
}
