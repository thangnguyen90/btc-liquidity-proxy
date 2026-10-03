import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { injectLocalAiNavigation, LOCAL_AI_NAVIGATION_VERSION } from '../src/localAiNavigation.js';

const publicDir = new URL('../public/', import.meta.url);
const files = (await readdir(publicDir)).filter((name) => name.endsWith('.html')).sort();
let menuPages = 0;
let noMenuPages = 0;

for (const name of files) {
  const source = await readFile(new URL(name, publicDir), 'utf8');
  const hasMenu = /<nav\b/i.test(source) || /<a\b[^>]*class\s*=\s*["'][^"']*\bnav-link\b/i.test(source);
  const rendered = injectLocalAiNavigation(source);
  const matches = rendered.match(/href=["']\/local-ai-trend-evaluation["']/g) ?? [];
  const gapMatches = rendered.match(/href=["']\/main-kill-gap-watch["']/g) ?? [];
  const orderMatches = rendered.match(/href=["']\/binance-signal-orders["']/g) ?? [];
  const oppositeLiquidityMatches = rendered.match(/href=["']\/opposite-liquidity-manager["']/g) ?? [];
  if (hasMenu) {
    menuPages += 1;
    assert.equal(matches.length, 1, `${name} must contain exactly one AI Local menu link`);
    assert.equal(gapMatches.length, 1, `${name} must contain exactly one Main Kill Gap menu link`);
    assert.equal(orderMatches.length, 1, `${name} must contain exactly one Binance signal orders menu link`);
    assert.equal(oppositeLiquidityMatches.length, 1,
      `${name} must contain exactly one opposite liquidity manager menu link`);
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

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(serverSource, /injectLocalAiNavigation\(html\)/);
assert.doesNotMatch(serverSource, /!html\.includes\('href="\/local-ai-trend-evaluation"'\)/);

console.log(`local AI navigation: ${menuPages}/${files.length} pages with menus covered; ${noMenuPages} pages have no menu`);
