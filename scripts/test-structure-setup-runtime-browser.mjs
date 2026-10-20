import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {join} from 'node:path';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
// Explicit runtime smoke test: read-only, blocks every API write, never submits an order.
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],env:{...process.env,
  LD_LIBRARY_PATH:join(process.cwd(),'.playwright-libs/root/usr/lib/x86_64-linux-gnu')+':'+(process.env.LD_LIBRARY_PATH??'')}});
const artifacts=await mkdtemp(join(tmpdir(),'structure-runtime-browser-')),errors=[],writes=[];
try {
  for(const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',async route=>{
      if(!['GET','HEAD'].includes(route.request().method())){writes.push(route.request().url());await route.abort();}
      else await route.continue();
    });
    await page.goto('https://liquidity.nhathadev.trade/short-setup-watch#binance-entry',{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>document.getElementById('binance-status')?.textContent.includes('LONG ON · SHORT ON'),{},{timeout:45000});
    assert.match(await page.locator('#binance-status').textContent(),/max riêng 15/);
    assert.equal(await page.locator('#binance-entry').count(),1);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
    await page.locator('#binance-entry').scrollIntoViewIfNeeded();
    await page.screenshot({path:join(artifacts,mobile?'mobile.png':'desktop.png')});
    await context.close();
  }
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log('Runtime desktop/mobile: LONG ON, SHORT ON, own max15; zero API writes/browser errors. Screenshots:',artifacts);
}finally{await browser.close();}
