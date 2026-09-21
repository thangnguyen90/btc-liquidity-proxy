import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {AutoEntryControls} from '../src/autoEntryControls.js';
import {EMA99_CONTROL_CATALOG} from '../src/ema99EntryCatalog.js';

// Only static HTML/JS/CSS comes from the local app. EVERY API is intercepted;
// edits go to a temporary fixture, never the live trading controls or Binance.
const dir=await mkdtemp(join(tmpdir(),'ema99-ui-'));
const controls=new AutoEntryControls(join(dir,'fixture.json'));
controls.seed(EMA99_CONTROL_CATALOG);
const localLibs=join(process.cwd(),'.playwright-libs','root','usr','lib','x86_64-linux-gnu');
const libraryPath=[existsSync(localLibs)?localLibs:'',process.env.LD_LIBRARY_PATH??''].filter(Boolean).join(':');
const browser=await chromium.launch({headless:true,env:{...process.env,...(libraryPath?{LD_LIBRARY_PATH:libraryPath}:{})}});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname!=='/api/auto-entry-controls')return route.fulfill({status:403,contentType:'application/json',body:'{"error":"API disabled in UI test"}'});
    try {
      const state=req.method()==='POST'?controls.update(req.postDataJSON()):controls.read();
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...state,canEdit:true,dailyStats:{date:'2026-09-12',totals:{entries:3,openEntries:1,closedPositions:2,realizedPnlUsdt:.42},routes:{}}})});
    }catch(e){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:e.message})});}
  });
  page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:19082/binance-auto-controls');
  await page.waitForFunction(()=>document.querySelectorAll('#ema99-15m-routes tr').length===12);
  for(const frame of ['5m','15m']) {
    assert.equal(await page.locator(`#ema99-${frame}-routes input[type=checkbox]`).count(),12);
    assert.equal(await page.locator(`#ema99-${frame}-routes input[aria-label^="Ký quỹ"]`).count(),11);
    assert.equal(await page.locator(`#ema99-${frame}-routes input[aria-label^="Đòn bẩy"]`).count(),11);
    assert.equal(await page.locator(`#ema99-${frame}-routes input[aria-label^="TP ROE"]`).count(),11);
  }
  const label='NEAR_RECLAIM_LONG_WATCH';
  const row5=page.locator('#ema99-5m-routes tr').filter({hasText:label});
  const row15=page.locator('#ema99-15m-routes tr').filter({hasText:label});
  await row5.locator('input[type=checkbox]').check();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Đã lưu'));
  assert.equal(await row15.locator('input[type=checkbox]').isChecked(),false);
  await row5.locator('input[aria-label^="Ký quỹ"]').fill('8.5');
  await row5.getByRole('button',{name:'Lưu',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#ema99-5m-routes').textContent.includes('Đã lưu: 8.5'));
  assert.equal(await row15.locator('input[aria-label^="Ký quỹ"]').inputValue(),'5');
  await row5.locator('input[aria-label^="Đòn bẩy"]').fill('7');
  await row5.getByRole('button',{name:'Lưu x',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#ema99-5m-routes').textContent.includes('Đã lưu: 7x'));
  assert.equal(await row15.locator('input[aria-label^="Đòn bẩy"]').inputValue(),'5');
  await row5.locator('input[aria-label^="TP ROE"]').fill('22.5');
  await row5.getByRole('button',{name:'Lưu TP',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#ema99-5m-routes').textContent.includes('Đã lưu: +22.5%'));
  await page.reload();
  await page.waitForFunction(()=>document.querySelectorAll('#ema99-5m-routes input[type=checkbox]').length===12);
  assert.equal(await row5.locator('input[type=checkbox]').isChecked(),true);
  assert.equal(await row5.locator('input[aria-label^="Ký quỹ"]').inputValue(),'8.5');
  assert.equal(await row15.locator('input[aria-label^="Ký quỹ"]').inputValue(),'5');
  assert.equal(await row5.locator('input[aria-label^="Đòn bẩy"]').inputValue(),'7');
  assert.equal(await row15.locator('input[aria-label^="Đòn bẩy"]').inputValue(),'5');
  assert.equal(await row5.locator('input[aria-label^="TP ROE"]').inputValue(),'22.5');
  assert.equal(await row15.locator('input[aria-label^="TP ROE"]').inputValue(),'15');
  assert.equal(await page.locator('#daily-entries').textContent(),'3');assert.match(await page.locator('#daily-pnl').textContent(),/\+0\.4200/);
  await page.locator('#search').fill('15m');
  assert.equal(await page.locator('#ema99-5m-routes input').count(),0);
  assert.equal(await page.locator('#ema99-15m-routes input[type=checkbox]').count(),12);
  assert.deepEqual(errors,[]);
  console.log('Browser UI passed: 12 rows per timeframe, independent tick/margin/leverage/TP save, reload and search, no page errors. All APIs mocked; live settings untouched.');
}finally{await browser.close();}
