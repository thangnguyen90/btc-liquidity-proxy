import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {PUSH_QUIET_HOURS_DEFAULT,normalizePushQuietHours,isPushQuietNow} from '../public/push-quiet-hours-model.js';
const base=process.env.QUIET_PUSH_TEST_URL??'http://127.0.0.1:19082';
const directory=await mkdtemp(join(tmpdir(),'push-quiet-browser-'));
const localLibs=join(process.cwd(),'.playwright-libs','root','usr','lib','x86_64-linux-gnu');
const libraryPath=[existsSync(localLibs)?localLibs:'',process.env.LD_LIBRARY_PATH??''].filter(Boolean).join(':');
const browser=await chromium.launch({headless:true,env:{...process.env,...(libraryPath?{LD_LIBRARY_PATH:libraryPath}:{})}});
const now=Date.parse('2026-10-12T05:00:00+07:00'),errors=[],writes=[];
const server=await readFile('src/server.js','utf8');
assert.match(server,/pathname === '\/api\/opposite-liquidity-web-push\/quiet-hours'[\s\S]{0,140}isSameOriginWriteRequest/);
try {
  for(const mobile of [false,true])for(const name of ['push-signal-manager','rising-volume-watch']) {
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    let rule={...PUSH_QUIET_HOURS_DEFAULT},failSave=false,quietPosts=0;
    const config=()=>({configured:true,publicKey:'TEST_PUBLIC',subscriptionCount:1,quietHours:rule,quietHoursActive:isPushQuietNow(rule,now)});
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.pathname==='/api/opposite-liquidity-web-push/quiet-hours'&&request.method()==='POST') {
        quietPosts++;if(failSave)return route.fulfill({status:500,contentType:'application/json',body:'{"error":"FIXTURE_SAVE_FAILURE"}'});
        rule=normalizePushQuietHours(request.postDataJSON());
        return route.fulfill({contentType:'application/json',body:JSON.stringify(config())});
      }
      if(!['GET','HEAD'].includes(request.method())){writes.push(url.pathname);return route.abort();}
      if(url.pathname==='/api/opposite-liquidity-web-push/config')return route.fulfill({contentType:'application/json',body:JSON.stringify(config())});
      if(url.pathname==='/api/discord-push-manager')return route.fulfill({contentType:'application/json',body:JSON.stringify({routes:[],configuredRoutes:0,enabledRoutes:0,webPush:config()})});
      if(url.pathname==='/api/rising-volume')return route.fulfill({contentType:'application/json',body:JSON.stringify({rows:[],cohorts:[],patterns:[],total:0})});
      if(url.pathname==='/api/live-card-whitelist')return route.fulfill({contentType:'application/json',body:'{"enabledKeys":[]}'});
      if(url.pathname.startsWith('/api/'))return route.fulfill({status:403,contentType:'application/json',body:'{"error":"disabled in fixture"}'});
      return route.continue();
    });
    await page.goto(`${base}/${name}.html`);
    const panel=page.locator('[data-push-quiet-hours]'),form=panel.locator('form');
    const button=form.getByRole('button',{name:'Lưu giờ Push'}),enabled=form.locator('[name=enabled]');
    await button.waitFor();await page.waitForFunction(()=>!document.querySelector('.quiet-form button').disabled);
    assert.equal(await enabled.isChecked(),true);assert.equal(await form.locator('[name=start]').inputValue(),'00:00');
    assert.equal(await form.locator('[name=end]').inputValue(),'06:00');assert.match(await panel.innerText(),/ĐANG TẠM NGỪNG PUSH.*giờ Việt Nam/s);
    assert.equal(quietPosts,0,'loading never saves or enables any route');
    await form.locator('[name=start]').fill('22:00');await form.locator('[name=end]').fill('07:00');
    assert.match(await panel.locator('.quiet-message').innerText(),/chưa lưu/);
    await button.click();await page.waitForFunction(()=>document.querySelector('.quiet-message').textContent.includes('Đã lưu'));
    assert.deepEqual(rule,{enabled:true,start:'22:00',end:'07:00',timeZone:'Asia/Ho_Chi_Minh'});assert.equal(quietPosts,1);
    await enabled.uncheck();await button.click();await page.waitForFunction(()=>document.querySelector('.quiet-status').textContent.includes('đang TẮT'));
    assert.equal(rule.enabled,false);assert.equal(quietPosts,2);
    await form.locator('[name=end]').fill('22:00');await button.click();
    assert.match(await panel.locator('.quiet-message').innerText(),/khác giờ kết thúc/);assert.equal(quietPosts,2,'invalid equal hours not submitted');
    await form.locator('[name=end]').fill('08:00');failSave=true;await button.click();
    await page.waitForFunction(()=>document.querySelector('.quiet-message').textContent.includes('Chưa xác nhận'));
    assert.equal(rule.end,'07:00','failed save cannot be displayed as saved');assert.equal(await button.isEnabled(),true);
    await page.reload();await page.waitForFunction(()=>!document.querySelector('.quiet-form button').disabled);
    assert.equal(await form.locator('[name=end]').inputValue(),'07:00','reload restores server-confirmed schedule');
    assert.equal(await enabled.isChecked(),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no mobile horizontal overflow');
    await panel.screenshot({path:join(directory,`${name}-${mobile?'mobile':'desktop'}.png`)});
    await context.close();
  }
  if(process.argv.includes('--runtime')) {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{
      if(!['GET','HEAD'].includes(route.request().method())){writes.push(new URL(route.request().url()).pathname);return route.abort();}
      return route.continue();
    });
    for(const name of ['rising-volume-watch','push-signal-manager']) {
      await page.goto(`${base}/${name}#push-quiet-hours`);
      await page.waitForFunction(()=>!!document.querySelector('.quiet-form button')&&!document.querySelector('.quiet-form button').disabled);
      const panel=page.locator('[data-push-quiet-hours]');
      assert.equal(await panel.locator('[name=enabled]').isChecked(),true);
      assert.equal(await panel.locator('[name=start]').inputValue(),'00:00');assert.equal(await panel.locator('[name=end]').inputValue(),'06:00');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await panel.screenshot({path:join(directory,`${name}-runtime-mobile.png`)});
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[],'only explicitly mocked schedule POST, never subscription/route/order writes');
  console.log(JSON.stringify({passed:true,artifacts:directory,errors:0,realWrites:0}));
}finally{await browser.close();}
