export const OPPOSITE_LIQUIDITY_TOAST_VERSION =
  'OPPOSITE_LIQUIDITY_SITEWIDE_TOAST_V1_QUALIFIED_EVENT_20261003';

const STYLE_HREF = '/opposite-liquidity-toast.css?v=20261003-1';
const SCRIPT_SRC = '/opposite-liquidity-toast.js?v=20261003-1';

export function injectOppositeLiquidityToast(value) {
  let html = String(value ?? '');
  if (!html) return html;
  if (!html.includes(STYLE_HREF)) {
    const style = `<link rel="stylesheet" href="${STYLE_HREF}">`;
    if (html.includes('</head>')) html = html.replace('</head>', `  ${style}\n</head>`);
  }
  if (!html.includes(SCRIPT_SRC)) {
    const script = `<script type="module" src="${SCRIPT_SRC}"></script>`;
    if (html.includes('</body>')) html = html.replace('</body>', `  ${script}\n</body>`);
  }
  return html;
}
