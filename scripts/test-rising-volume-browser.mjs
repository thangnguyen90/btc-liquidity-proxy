import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {RisingVolumeMonitor,evaluateRisingVolume} from '../src/risingVolume.js';
import {buildRisingVolumePassedSignals} from '../src/risingVolumePassedSignals.js';
import {RISING_VOLUME_SOURCE,RISING_VOLUME_BINANCE_VERSION,risingVolumeEntryId} from '../src/risingVolumeBinance.js';
import {flowRows,flowTestNow} from './rising-volume-flow-fixtures.mjs';
import {RisingVolumeRatioDiagnostics} from '../src/risingVolumeRatioDiagnostics.js';
import {buildRisingVolumeRatioProof} from '../src/risingVolumeRatioGate.js';
import {ratioRowsFor} from './rising-volume-ratio-fixtures.mjs';

// Browser QA uses fake candle histories and GET fixtures, never Binance orders
// or persistent whitelist writes. Run against an already running local server.
const now=flowTestNow,baseUrl=process.env.RISING_VOLUME_TEST_URL??'http://127.0.0.1:19082';
function fixture(symbol,interval) {
  const side=symbol==='ONUSDT'?'LONG':'SHORT';
  // Synthetic shapes only. Larger-frame candles intentionally look sustained
  // for both coins; the interrupted label must come from independent 1m data.
  return flowRows({interval,side,pattern:interval==='1m'&&side==='SHORT'?'BURSTY':'SUSTAINED',now});
}
const monitor=new RisingVolumeMonitor({now:()=>now,getRows:fixture});
await monitor.scan({symbols:['ONUSDT','BEARUSDT']});
const ratioDiagnostic=new RisingVolumeRatioDiagnostics({now:()=>now,getRows:async()=>{throw Error('no real public read');}});
for(const symbol of ['ONUSDT','BEARUSDT']) {
  const row=monitor.live.find(r=>r.symbol===symbol&&r.interval==='1m');
  const curve=ratioRowsFor({snapshot:row});
  ratioDiagnostic.cache.set(symbol,{rows:symbol==='BEARUSDT'?curve.map(r=>({...r,longShortRatio:2})):curve,
    fetchedAt:now,expiresAt:now+60000,pending:false});
}
const onEvent=monitor.state.history.find(e=>e.snapshot.symbol==='ONUSDT'&&e.snapshot.interval==='1m');
const frozenRatioProof=buildRisingVolumeRatioProof(onEvent,ratioRowsFor(onEvent),now);
const shortRows=flowRows({side:'SHORT',pattern:'SUSTAINED',now});
const shortSnapshot=evaluateRisingVolume({symbol:'SHORTPASSUSDT',interval:'1m',rows:shortRows,rows1m:shortRows,now}).signal;
const shortEvent={id:risingVolumeEntryId(shortSnapshot),snapshot:shortSnapshot};
const shortProof=buildRisingVolumeRatioProof(shortEvent,ratioRowsFor(shortEvent),now);
const passAttempts=[{id:onEvent.id,symbol:'ONUSDT',side:'LONG',interval:'1m',at:now,status:'SUBMITTED',orderId:123,
  closedAt:onEvent.snapshot.closedAt,snapshotObservedAt:onEvent.snapshot.observedAt,marginUsdt:2,leverage:5,
  risingVolumeRatioProof:frozenRatioProof,plan:{risingVolumeSnapshot:onEvent.snapshot}},
  {id:shortEvent.id,symbol:'SHORTPASSUSDT',side:'SHORT',interval:'1m',at:now,status:'EXISTING_POSITION',
    closedAt:shortSnapshot.closedAt,snapshotObservedAt:shortSnapshot.observedAt,marginUsdt:1,leverage:5,risingVolumeRatioProof:shortProof}];
const passAudit={record:{signalSource:RISING_VOLUME_SOURCE,risingVolumeEntryVersion:RISING_VOLUME_BINANCE_VERSION,
  risingVolumeSignalId:onEvent.id,risingVolumeSnapshot:onEvent.snapshot,risingVolumeRatioProof:frozenRatioProof,
  symbol:'ONUSDT',direction:'LONG',orderId:123,orderStatus:'FILLED',positionStatus:'CLOSED',
  filledAt:new Date(now+1000).toISOString(),closedAt:new Date(now+60000).toISOString(),marginUsdt:2,
  netRealizedPnlUsdt:.2,avgFillPrice:123,closeReason:'TAKE_PROFIT'}};
const passedSignals=buildRisingVolumePassedSignals(passAttempts,{one:passAudit},{now:now+120000});
const artifacts=await mkdtemp(join(tmpdir(),'rising-volume-browser-'));
const localLibs=join(process.cwd(),'.playwright-libs','root','usr','lib','x86_64-linux-gnu');
const libraryPath=[existsSync(localLibs)?localLibs:'',process.env.LD_LIBRARY_PATH??''].filter(Boolean).join(':');
const browser=await chromium.launch({headless:true,env:{...process.env,...(libraryPath?{LD_LIBRARY_PATH:libraryPath}:{})}});
const errors=[],writes=[];
try {
  for(const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1300},
      isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    let failApi=false,patternAvg=null;
    await page.route('**/*',async route=>{
      const request=route.request();
      if(!['GET','HEAD'].includes(request.method())){writes.push(request.url());return route.abort();}
      const url=new URL(request.url());
      if(url.pathname==='/api/rising-volume') {
        if(failApi)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fixture unavailable'})});
        const params=Object.fromEntries(url.searchParams);
        const attempts=[{id:onEvent.id,symbol:'ONUSDT',side:'LONG',at:now,status:'SUBMITTED',orderId:123,
          closedAt:onEvent.snapshot.closedAt,snapshotObservedAt:onEvent.snapshot.observedAt,risingVolumeRatioProof:frozenRatioProof,
          takeProfitPrice:102,stopLossPrice:94},{id:monitor.state.history[1].id,symbol:'BEARUSDT',side:'SHORT',at:now,
          status:'MAX_OPEN_POSITIONS',error:'<img src=x onerror=alert(1)>'}];
        const snapshot=ratioDiagnostic.project(monitor.snapshot(params),{attempts,view:params.view??'live'});
        snapshot.passedSignals=passedSignals;
        snapshot.discord={configured:true,sent:2,pending:1,uncertain:0,rejected:0};
        snapshot.binance={masterEnabled:true,routes:[{side:'LONG',enabled:true},{side:'SHORT',enabled:true}],
          attempts};
        if(patternAvg!==null)for(const pattern of snapshot.patterns){pattern.closedCount=1;pattern.closedAvgRoe=patternAvg;}
        return route.fulfill({contentType:'application/json',body:JSON.stringify(snapshot)});
      }
      if(url.pathname==='/api/live-card-whitelist')return route.fulfill({contentType:'application/json',body:'{"enabledKeys":[]}'});
      if(url.pathname.startsWith('/api/'))return route.fulfill({status:403,contentType:'application/json',body:'{"error":"API disabled in UI test"}'});
      return route.continue();
    });
    await page.goto(`${baseUrl}/rising-volume-watch.html`);
    await page.locator('.signal').first().waitFor();
    assert.equal(await page.locator('.signal').count(),6);
    assert.equal(await page.locator('.cohort').count(),6);
    assert.equal(await page.locator('.pattern-card').count(),3);
    assert.match(await page.locator('#discord-status').innerText(),/Discord ON.*đã gửi 2.*chờ 1/);
    assert.equal(await page.locator('.pattern-badge.sustained').count(),3);
    assert.equal(await page.locator('.pattern-badge.bursty').count(),3);
    assert.equal(await page.locator('.pattern-section').count(),2,'ALL visibly separates both types');
    assert.equal(await page.locator('.signal .ratio-diagnostics').count(),6,'ratio explanation on every frame');
    assert.equal(await page.locator('.passed-row').count(),2,'frozen PASS ledger separate from live signal filters');
    assert.match(await page.locator('.passed-row.long').innerText(),/Đã đóng.*\+0,2.*ROE \+10%/s);
    assert.match(await page.locator('.passed-row.short').innerText(),/SHORT.*Không vào lệnh.*Đã có vị thế.*PnL ròng đã chốt · USDT\s+—.*không có PnL/s);
    assert.equal(await page.locator('.passed-row [data-live-card-toggle]').count(),0,'individual ledger rows are not new stats/whitelist cards');
    await page.locator('#passed-side').selectOption('SHORT');assert.equal(await page.locator('.passed-row').count(),1);
    await page.locator('#passed-side').selectOption('ALL');
    await page.locator('#passed-state').selectOption('CLOSED');assert.equal(await page.locator('.passed-row.long').count(),1);
    await page.locator('#passed-state').selectOption('BLOCKED');assert.equal(await page.locator('.passed-row.short').count(),1);
    await page.locator('#passed-state').selectOption('ALL');
    await page.locator('#passed-search').fill('ON');assert.equal(await page.locator('.passed-row.long').count(),1);
    await page.locator('#passed-search').fill('');
    assert.equal(await page.locator('.signal').count(),6,'PASS filters never alter signal/cohort filters');
    await page.locator('#passed-signals').screenshot({path:join(artifacts,mobile?'passed-mobile.png':'passed-desktop.png')});
    const ratioOn=page.locator('.signal.long').filter({has:page.locator('.bias').getByText('1m',{exact:false})}).first();
    assert.match(await ratioOn.locator('.ratio-diagnostics').innerText(),/RATIO PASS.*Ratio đã lưu tại lần xử lý đầu đợt/s);
    assert.match(await ratioOn.locator('.ratio-metrics').innerText(),/LONG cần giảm ≥10%.*-15%/s);
    assert.match(await page.locator('.pattern-section h3').first().innerText(),/liền mạch/);
    assert.equal(await page.locator('[data-live-card-toggle]').count(),0,'no checkbox without real closed AvgROE');
    assert.match(await page.locator('#coverage').innerText(),/1m.*2\/2/);
    assert.match(await page.locator('#binance-status').innerText(),/Master ON.*LONG: ON.*SHORT: ON/);
    await page.locator('.execution-history > summary').click();
    assert.match(await page.locator('#binance-attempts').innerText(),/ĐÃ GỬI MARKET.*Order 123/s);
    assert.match(await page.locator('#binance-attempts').innerText(),/đủ cap 50/);
    assert.equal(await page.locator('#binance-attempts img').count(),0,'attempt errors escaped');
    assert.match(await page.locator('.notice').innerText(),/2 USDT.*1 USDT.*5x.*TP.*10%.*SL.*30%/);
    await page.locator('#pattern').selectOption('SUSTAINED');
    await page.waitForFunction(()=>document.querySelectorAll('.signal').length===3);
    assert.equal(await page.locator('.pattern-badge.bursty').count(),0);
    await page.locator('#pattern').selectOption('BURSTY');
    await page.waitForFunction(()=>document.querySelectorAll('.pattern-badge.bursty').length===3);
    assert.equal(await page.locator('.signal.long').count(),0);
    await page.locator('#pattern').selectOption('OTHER');
    await page.locator('.empty').waitFor();
    await page.locator('#pattern').selectOption('UNKNOWN');
    await page.locator('.empty').waitFor();
    await page.locator('#pattern').selectOption('ALL');
    await page.waitForFunction(()=>document.querySelectorAll('.signal').length===6);
    patternAvg=4;await page.locator('#refresh').click();
    await page.waitForFunction(()=>!document.getElementById('refresh').disabled);
    assert.equal(await page.locator('.pattern-card [data-live-card-toggle]').count(),0,'strict >4, not >=4');
    patternAvg=4.01;await page.locator('#refresh').click();
    await page.waitForFunction(()=>document.querySelectorAll('.pattern-card [data-live-card-toggle]').length===3);
    for(const type of ['SUSTAINED','BURSTY','OTHER']) {
      const input=page.locator(`.pattern-card [data-live-card-toggle][data-key="rising-volume:flow-1m:${type}"]`);
      assert.equal(await input.count(),1,'UI key exactly matches runtime key');assert.equal(await input.isChecked(),false);
    }
    patternAvg=null;await page.locator('#refresh').click();
    await page.waitForFunction(()=>document.querySelectorAll('[data-live-card-toggle]').length===0);
    await page.locator('#side').selectOption('SHORT');
    await page.waitForFunction(()=>document.querySelectorAll('.signal').length===3);
    assert.equal(await page.locator('.signal.long').count(),0);
    await page.locator('#side').selectOption('ALL');
    await page.locator('#interval').selectOption('5m');
    await page.waitForFunction(()=>document.querySelectorAll('.signal').length===2);
    assert.match(await page.locator('.signal.long .ratio-diagnostics').innerText(),/KHÔNG phải proof pre-entry/);
    assert.match(await page.locator('.signal.long .ratio-scope').innerText(),/OBSERVE ONLY/,'ratio PASS never grants 5m MARKET');
    assert.match(await page.locator('.signal.short .ratio-diagnostics').innerText(),/RATIO KHÔNG PASS.*chưa đạt 10%/s);
    await page.locator('.signal.long .ratio-curve > summary').click();
    const ratioChart=page.locator('.signal.long .ratio-curve'),ratioPoint=ratioChart.locator('.ratio-point').last(),ratioReadout=ratioChart.locator('.ratio-readout');
    assert.equal(await ratioChart.locator('.ratio-account-bar').count(),20);
    assert.equal(await ratioChart.locator('.ratio-threshold').count(),1);
    assert.match(await ratioChart.locator('.ratio-legend').innerText(),/Tài khoản Long %.*Tài khoản Short %.*Đen/s);
    if(mobile)await ratioChart.locator('.ratio-chart').evaluate(node=>{node.scrollLeft=node.scrollWidth-node.clientWidth;});
    if(!mobile){await ratioPoint.hover();assert.equal(await ratioReadout.isVisible(),true);await page.locator('h1').hover();assert.equal(await ratioReadout.isVisible(),false);}
    if(mobile)await ratioPoint.tap();else await ratioPoint.click();
    assert.equal(await ratioReadout.isVisible(),true);assert.match(await ratioReadout.innerText(),/Ratio .*Long .*Short .*so với nền/);
    if(mobile)await ratioPoint.tap();else await ratioPoint.click();
    assert.equal(await ratioReadout.isVisible(),false,'ratio second tap closes');
    await ratioPoint.focus();await ratioPoint.press('Enter');assert.equal(await ratioReadout.isVisible(),true);
    await ratioPoint.press('Enter');assert.equal(await ratioReadout.isVisible(),false,'keyboard toggles ratio popup');
    await page.locator('.signal.long').screenshot({path:join(artifacts,mobile?'ratio-mobile.png':'ratio-desktop.png')});
    for(const summary of await page.locator('.snapshot > summary').all())await summary.click();
    const largeFrame=page.locator('.signal.short').first();
    assert.match(await largeFrame.locator('.chart-heading').innerText(),/1 phút.*20.*10/);
    assert.equal(await largeFrame.locator('.snapshot > .chart .volume-bar').count(),30);
    assert.equal(await largeFrame.locator('.signal-frame-chart .volume-bar').count(),28);
    assert.equal(await largeFrame.locator('.signal-frame-chart').getAttribute('open'),null,'original 5m chart is secondary/collapsed');
    assert.equal(await largeFrame.locator('.pattern-badge.bursty').count(),1,'5m label follows 1m, not smooth 5m volume');
    await largeFrame.locator('.signal-frame-chart > summary').click();
    await page.locator('#unit').selectOption('quoteVolume');
    assert.equal(await largeFrame.locator('.signal-frame-chart').getAttribute('open'),'','secondary chart stays open across redraw');
    await page.locator('#unit').selectOption('volume');
    await page.locator('#interval').selectOption('1m');
    await page.waitForFunction(()=>document.querySelectorAll('.signal').length===2);
    await page.locator('#search').fill('on');
    await page.waitForFunction(()=>document.querySelectorAll('.signal').length===1);
    assert.match(await page.locator('.signal .coin').innerText(),/ONUSDT/);
    await page.locator('#search').fill('');
    await page.waitForFunction(()=>document.querySelectorAll('.signal').length===2);
    for(const summary of await page.locator('.snapshot > summary').all())await summary.click();
    const first=page.locator('.signal').first();
    assert.equal(await first.locator('.volume-bar').count(),30);
    const bar=first.locator('.volume-bar').last(),readout=first.locator('.chart-readout');
    if(mobile)await bar.tap();else await bar.click();
    assert.equal(await readout.isVisible(),true);assert.match(await readout.innerText(),/VOL coin .*VOL USDT/);
    if(mobile)await bar.tap();else await bar.click();
    assert.equal(await readout.isVisible(),false,'second tap/click closes');
    await bar.focus();await bar.press('Enter');assert.equal(await readout.isVisible(),true);
    await bar.press('Enter');assert.equal(await readout.isVisible(),false);
    await page.locator('#unit').selectOption('quoteVolume');
    assert.match(await first.locator('.chart-note').innerText(),/VOL USDT/);
    assert.equal(await page.locator('.pattern-badge.sustained').count(),1,'display unit does not change type');
    assert.equal(await page.locator('.pattern-badge.bursty').count(),1);
    assert.equal(await first.locator('.snapshot').getAttribute('open'),'','chart stays open across redraw');
    await first.locator('.ratio-curve > summary').click();
    assert.equal(await first.locator('.ratio-curve svg').count(),1);
    await page.locator('#unit').selectOption('volume');
    assert.equal(await first.locator('.ratio-curve').getAttribute('open'),'','ratio graph stays open across redraw');
    await page.locator('#view').selectOption('history');
    await page.locator('.snapshot-warning').first().waitFor();
    assert.match(await page.locator('.snapshot-warning').first().innerText(),/Snapshot gốc/);
    assert.match(await page.locator('.signal.short .ratio-diagnostics').innerText(),/Không lưu ratio tại lần xử lý gốc/);
    assert.match(await page.locator('.signal.long .ratio-diagnostics').innerText(),/Ratio đã lưu tại lần xử lý đầu đợt/);
    await page.locator('.signal.long .ratio-curve > summary').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
    await page.screenshot({path:join(artifacts,mobile?'mobile.png':'desktop.png'),fullPage:true});
    const link=await first.locator('.coin-actions a').last().getAttribute('href');
    // The .html suffix works even before the new alias has been reloaded.
    await page.goto(`${baseUrl}${link.replace('/rising-volume-watch?','/rising-volume-watch.html?')}`);
    await page.locator('.signal.highlight').waitFor();
    assert.equal(await page.locator('.signal.highlight .snapshot').getAttribute('open'),'');
    const passedLink=passedSignals.rows.find(r=>r.symbol==='SHORTPASSUSDT').url;
    await page.goto(`${baseUrl}${passedLink.replace('/rising-volume-watch?','/rising-volume-watch.html?')}`);
    await page.locator('.passed-row.pass-selected').waitFor();
    assert.match(await page.locator('.passed-row.pass-selected').innerText(),/SHORTPASSUSDT/);
    assert.equal(await page.locator('.passed-row.pass-selected .ratio-curve').getAttribute('open'),'','exact PASS deep link opens frozen ratio');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'PASS list no mobile overflow');
    failApi=true;await page.locator('#refresh').click();
    await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Fixture unavailable'));
    assert.equal(await page.locator('.passed-row.pass-selected').count(),1,'failed refresh retains previous PASS snapshot');
    await context.close();
  }
  if(process.argv.includes('--runtime')) {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{
      if(!['GET','HEAD'].includes(route.request().method())){writes.push(route.request().url());return route.abort();}
      return route.continue();
    });
    await page.goto(`${baseUrl}/rising-volume-watch#passed-signals`);
    await page.locator('.passed-row').first().waitFor();
    const bat=page.locator('.passed-row').filter({has:page.locator('.coin').getByText('BATUSDT',{exact:true})});
    assert.match(await bat.innerText(),/LONG.*Đã đóng.*\+0,143639.*ROE \+7,181938%/s,'live audit BAT net PnL precisely rounded for UI');
    await page.locator('#passed-search').fill('BAT');assert.equal(await page.locator('.passed-row').count(),1);
    await bat.locator('.ratio-curve > summary').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'real frozen PASS chart fits mobile');
    await page.locator('#passed-signals').screenshot({path:join(artifacts,'passed-runtime-mobile.png')});
    await context.close();
  }
  assert.deepEqual(errors,[],'no frontend exceptions');assert.deepEqual(writes,[],'browser never attempts a state write');
  console.log(JSON.stringify({passed:true,desktop:join(artifacts,'desktop.png'),mobile:join(artifacts,'mobile.png'),writes:0,errors:0}));
} finally {await browser.close();}
