import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { injectLocalAiNavigation, injectBinanceAutoControlsNavigation, LOCAL_AI_NAVIGATION_VERSION } from '../src/localAiNavigation.js';

const publicDir = new URL('../public/', import.meta.url);
const files = (await readdir(publicDir)).filter((name) => name.endsWith('.html')).sort();
let menuPages = 0;
let noMenuPages = 0;

for (const name of files) {
  const source = await readFile(new URL(name, publicDir), 'utf8');
  const hasMenu = /<nav\b/i.test(source) || /<a\b[^>]*class\s*=\s*["'][^"']*\bnav-link\b/i.test(source);
  const rendered = injectLocalAiNavigation(source);
  const menuScope=/<nav\b[^>]*>[\s\S]*?<\/nav\s*>/i.exec(rendered)?.[0]
    ??[...rendered.matchAll(/<a\b[^>]*class\s*=\s*["'][^"']*\bnav-link\b[^"']*["'][^>]*>[\s\S]*?<\/a\s*>/gi)].map(m=>m[0]).join('');
  const matches = rendered.match(/href=["']\/local-ai-trend-evaluation["']/g) ?? [];
  const gapMatches = rendered.match(/href=["']\/main-kill-gap-watch["']/g) ?? [];
  const orderMatches = rendered.match(/href=["']\/binance-signal-orders["']/g) ?? [];
  const oppositeLiquidityMatches = rendered.match(/href=["']\/opposite-liquidity-manager["']/g) ?? [];
  const pushManagerMatches = rendered.match(/href=["']\/push-signal-manager["']/g) ?? [];
  if (hasMenu) {
    menuPages += 1;
    assert.equal((menuScope.match(/href=["']\/pump-turn-watch["']/g)??[]).length,1,`${name} has exactly one planned pump/turn menu entry`);
    assert.equal((menuScope.match(/href=["']\/coinglass-heatmap-lab["']/g)??[]).length,1,`${name} has exactly one heatmap lab menu entry`);
    assert.equal((menuScope.match(/\bhref\s*=\s*["']\/binance-auto-controls(?:\.html)?(?:[?#][^"']*)?["']/gi)??[]).length,1,
      `${name} must have exactly one Binance auto controls link INSIDE its menu`);
    assert.equal(injectBinanceAutoControlsNavigation(source),source,`${name} static menu must work without backend restart/injection`);
    assert.equal((rendered.match(/href=["']\/short-setup-watch["']/g) ?? []).length, 1,
      `${name} must contain exactly one short setup menu link`);
    assert.equal((rendered.match(/href=["']\/rising-volume-watch["']/g) ?? []).length, 1,
      `${name} must contain exactly one rising volume menu link`);
    assert.equal(matches.length, 1, `${name} must contain exactly one AI Local menu link`);
    assert.equal((rendered.match(/href=["']\/liquidity-zone-manager["']/g) ?? []).length, 1,
      `${name} must contain exactly one liquidity zone manager menu link`);
    assert.equal(gapMatches.length, 1, `${name} must contain exactly one Main Kill Gap menu link`);
    assert.equal(orderMatches.length, 1, `${name} must contain exactly one Binance signal orders menu link`);
    assert.equal(oppositeLiquidityMatches.length, 1,
      `${name} must contain exactly one opposite liquidity manager menu link`);
    assert.equal(pushManagerMatches.length, 1,
      `${name} must contain exactly one Discord push manager menu link`);
    assert.equal((rendered.match(/href=["']\/ai-signal-review["']/g) ?? []).length, 1,
      `${name} must contain exactly one signal review menu link`);
    assert.equal(injectLocalAiNavigation(rendered), rendered, `${name} injection must be idempotent`);
  } else {
    noMenuPages += 1;
    assert.equal(rendered, source, `${name} has no menu and must remain unchanged`);
  }
}

assert.equal(noMenuPages, 0, `every HTML dashboard must expose a menu; missing on ${noMenuPages} page(s)`);
assert.equal(menuPages, files.length, `all ${files.length} HTML dashboards must be covered`);
assert.equal(menuPages + noMenuPages, files.length);
assert.match(LOCAL_AI_NAVIGATION_VERSION, /ALL_MENUS/);
const withCta='<nav><a href="/orders">Orders</a></nav><p><a href="/binance-auto-controls">Open controls</a></p>';
const added=injectBinanceAutoControlsNavigation(withCta);
assert.equal((added.match(/href="\/binance-auto-controls"/g)??[]).length,2,'keep body CTA and add a distinct menu link');
assert.match(added,/<nav><a[^>]+href="\/binance-auto-controls"/);assert.equal(injectBinanceAutoControlsNavigation(added),added);
const active='<nav><a class="active" href="/binance-auto-controls" aria-current="page">Existing</a></nav>';
assert.equal(injectBinanceAutoControlsNavigation(active),active,'preserve existing active menu item');
const alias="<nav><a href = '/binance-auto-controls.html?tab=entry#settings'>Existing</a></nav>";
assert.equal(injectBinanceAutoControlsNavigation(alias),alias,'no duplicate .html/query/hash alias');
const pagination='<nav><a href="/orders">Orders</a></nav><nav aria-label="Phân trang"><a href="#page2">Next</a></nav>';
assert.equal((injectBinanceAutoControlsNavigation(pagination).match(/href="\/binance-auto-controls"/g)??[]).length,1,'exclude pagination menu');
const legacy='<header><a class="nav-link" href="/orders">Orders</a></header><a href="/binance-auto-controls">CTA</a>';
assert.match(injectBinanceAutoControlsNavigation(legacy),/<header><a[^>]+href="\/binance-auto-controls"/);
assert.equal(injectBinanceAutoControlsNavigation('<p>No menu</p>'),'<p>No menu</p>');

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(serverSource, /injectLocalAiNavigation\(html\)/);
assert.doesNotMatch(serverSource, /!html\.includes\('href="\/local-ai-trend-evaluation"'\)/);

console.log(`local AI navigation: ${menuPages}/${files.length} pages with menus covered; ${noMenuPages} pages have no menu`);
