import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { BTC_LIQUIDATION_CONTEXT_VERSION as version } from '../public/btc-liquidation-context-model.js';
import { BTC_LIQUIDATION_FORECAST_VERSION as forecastVersion } from '../public/btc-liquidation-forecast-model.js';

const at=Date.now();let fail=false;
const fixture={version,state:'LONG_CASCADE',ready:true,evaluatedAt:at,
  forecast:{version:forecastVersion,ready:true,evaluatedAt:at,closedAt:at-1,sides:[
    {side:'LONG',tier:'EARLY',level:82000,scenario:'Nếu lực bán tiếp diễn, LONG dễ bị ép.',conditions:[{met:true,label:'Volume bán tăng'},{met:false,label:'<img src=x onerror="window.injected=true">'}]},
    {side:'SHORT',tier:'WATCH',level:83000,scenario:'Theo dõi nguy cơ ép SHORT.',conditions:[]}]},
  reasons:['Thanh lý LONG tăng tốc','<img src=x onerror="window.injected=true">'],
  inputs:{price:82000,price15mPct:-.6,takerBuy15m:.35,oi:{change15mPct:-.5,at},forecastData:{volume15mUsd:3e9,volumeRatio15m:1.5},
    account:{value:1.8,change15mPct:-2,samples:288},position:{value:1.5,change15mPct:-3}},
  liquidation:{ready:true,transportReady:true,long5m:9e6,short5m:1e6,long1m:2e6,short1m:1e5,longBurst:4,shortBurst:1,
    symbols5m:40,socketState:'OPEN',coverageMs:35*60_000},
  history:[{at,state:'LONG_CASCADE'}],closedStats:{closed:0,avgRoe:null}};
const writes=[],errors=[];
const publicRoot=resolve('public');
const server=createServer(async(req,res)=>{
  try {
    if(req.method!=='GET'){writes.push(req.url);res.writeHead(405);res.end();return;}
    const path=new URL(req.url,'http://localhost').pathname;
    if(path.startsWith('/api/')){
      const result=path==='/api/btc-liquidation-context'?fixture:path==='/api/live-card-whitelist'?{enabledKeys:[]}
        :{ollama:{online:false,modelReady:false},evaluation:{btc:{},candidates:[],warnings:[]}};
      res.writeHead(fail&&path==='/api/btc-liquidation-context'?503:200,{'content-type':'application/json'});
      res.end(JSON.stringify(result));return;
    }
    const file=resolve(publicRoot,'.'+(path==='/'?'/local-ai-trend-evaluation.html':decodeURIComponent(path)));
    if(!file.startsWith(publicRoot+sep)){res.writeHead(403);res.end();return;}
    res.writeHead(200,{'content-type':{'.js':'text/javascript','.css':'text/css','.html':'text/html'}[extname(file)]??'text/plain'});
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const artifacts=await mkdtemp(join(tmpdir(),'btc-liquidation-browser-'));
const localLibs=join(process.cwd(),'.playwright-libs','root','usr','lib','x86_64-linux-gnu');
const libraryPath=[existsSync(localLibs)?localLibs:'',process.env.LD_LIBRARY_PATH??''].filter(Boolean).join(':');
let browser;
try {
  browser=await chromium.launch({headless:true,env:{...process.env,LD_LIBRARY_PATH:libraryPath}});
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    fail=false;await page.goto(base);
    await page.waitForSelector('#btc-liquidation-context[data-state="LONG_CASCADE"]');
    const root=page.locator('#btc-liquidation-context');
    assert.ok((await root.textContent()).includes('9 triệu USD'));
    assert.equal(await root.locator('img').count(),0);
    assert.equal(await page.evaluate(()=>window.injected),undefined);
    assert.equal(await root.getAttribute('data-live-card-key'),'btc-liquidation-context:LONG_CASCADE');
    assert.equal(await root.locator('[data-live-card-toggle]').count(),0,'no CLOSED AvgROE => no checkbox');
    assert.equal(await root.locator('[data-forecast-side="LONG"]').getAttribute('data-live-card-key'),'btc-liquidation-forecast:LONG:EARLY');
    assert.equal(await root.locator('[data-forecast-side="SHORT"]').getAttribute('data-live-card-key'),'btc-liquidation-forecast:SHORT:WATCH');
    assert.equal(await root.locator('.volume-large').count(),1,'LONG 9 million highlighted red outside details');
    assert.equal(await root.locator('.context-volume-card .volume-large-text').count(),1,'LONG 2 million /1m highlighted');
    assert.equal(await root.locator('[data-context-totals] .context-forecast-note').evaluate(el=>getComputedStyle(el).color),'rgb(255, 134, 153)','BTC large volume red');
    assert.equal(await root.locator('[data-forecast-side="LONG"]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(52, 19, 29)');
    await page.evaluate(()=>{const card=document.querySelector('[data-forecast-side="LONG"]');card.dataset.binanceCardAvgRoe='4';card.append(document.createTextNode(''));});
    await page.waitForTimeout(40);assert.equal(await root.locator('[data-live-card-toggle]').count(),0,'4% is not eligible');
    await page.evaluate(()=>{const card=document.querySelector('[data-forecast-side="LONG"]');card.dataset.binanceCardAvgRoe='4.01';card.append(document.createTextNode(''));});
    await page.waitForSelector('[data-forecast-side="LONG"] [data-live-card-toggle]');
    const toggle=root.locator('[data-forecast-side="LONG"] [data-live-card-toggle]');
    assert.equal(await toggle.getAttribute('data-key'),'btc-liquidation-forecast:LONG:EARLY');
    assert.equal(await toggle.isChecked(),false,'hook exists but default OFF');
    await page.evaluate(()=>{const card=document.querySelector('[data-forecast-side="LONG"]');card.dataset.binanceCardAvgRoe='';card.append(document.createTextNode(''));});
    await page.waitForFunction(()=>!document.querySelector('[data-forecast-side="LONG"] [data-live-card-toggle]'));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'no horizontal overflow');
    await root.locator('.context-data summary').click();
    assert.ok(await root.locator('[data-context-metrics]').isVisible());
    await root.locator('.context-data summary').click();
    await root.locator('.context-history summary').click();assert.ok((await root.locator('[data-context-history]').textContent()).includes('thanh lý LONG'));
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:join(artifacts,mobile?'mobile.png':'desktop.png'),fullPage:false});
    for(const state of ['SHORT_CASCADE','POST_LONG_LIQUIDATION','POST_SHORT_LIQUIDATION','LONG_CROWDED','SHORT_CROWDED','NEUTRAL',
      'LONG_SPIKE','SHORT_SPIKE','RECENT_LONG_LIQUIDATION','RECENT_SHORT_LIQUIDATION',
      'LONG_OBSERVED_LARGE','SHORT_OBSERVED_LARGE','BOTH_OBSERVED_LARGE']){
      await page.evaluate(async({fixture,state})=>{
        const module=await import('/btc-liquidation-context.js?v=20261013-v4');
        module.renderBtcLiquidationContext({...fixture,state,lastEpisode:{side:state.includes('SHORT')?'SHORT':'LONG',
          at:fixture.evaluatedAt-60_000,peakAt:fixture.evaluatedAt-90_000,peak:16.64e6,confirmed:false}});
      },{fixture,state});
      assert.equal(await root.getAttribute('data-state'),state);
      assert.equal(await root.getAttribute('data-live-card-key'),`btc-liquidation-context:${state}`);
      assert.equal(await root.locator('[data-live-card-toggle]').count(),0,'new labels obey CLOSED AvgROE gate');
      assert.ok((await root.locator('[data-context-episode]').textContent()).includes('16,64 triệu USD'));
      assert.ok(await root.locator('[data-context-episode]').isVisible());
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
      if(state==='LONG_SPIKE') await root.screenshot({path:join(artifacts,mobile?'spike-mobile.png':'spike-desktop.png')});
    }
    await page.evaluate(async(fixture)=>{
      const module=await import('/btc-liquidation-context.js?v=20261013-v4');
      module.renderBtcLiquidationContext({...fixture,state:'WAIT_DATA',ready:false,lastEpisode:{side:'LONG',
        at:fixture.evaluatedAt-60_000,peak:16.64e6,historicalOnly:true}});
    },fixture);
    assert.ok((await root.locator('[data-context-episode]').textContent()).includes('trước restart'));
    await page.evaluate(async(fixture)=>{
      const module=await import('/btc-liquidation-context.js?v=20261013-v4');
      module.renderBtcLiquidationContext({...fixture,state:'NEUTRAL',lastEpisode:{side:'LONG',
        at:fixture.evaluatedAt-61*60_000,peak:16.64e6}});
    },fixture);
    assert.equal(await root.locator('[data-context-episode]').isVisible(),false,'expired trace hidden');
    for(const side of ['LONG','SHORT']) {
      await page.evaluate(async({fixture,side})=>{
        const module=await import('/btc-liquidation-context.js?v=20261013-v4');
        module.renderBtcLiquidationContext({...fixture,state:`${side}_OBSERVED_LARGE`,ready:false,
          liquidation:{...fixture.liquidation,ready:false,transportReady:true},
          forecast:{...fixture.forecast,sides:fixture.forecast.sides.map(s=>s.side===side?{...s,tier:'UNWINDING',scenario:'Giá và OI cho thấy đang tháo, chưa xác nhận bên thanh lý từ forceOrder.'}:s)}});
      },{fixture,side});
      const card=root.locator(`[data-forecast-side="${side}"]`);
      assert.equal(await card.getAttribute('data-tier'),'UNWINDING');
      assert.equal(await card.getAttribute('data-live-card-key'),`btc-liquidation-forecast:${side}:UNWINDING`);
      assert.equal(await card.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(52, 19, 29)');
      assert.ok((await card.textContent()).includes('chưa xác nhận'));
      assert.ok((await root.locator('[data-context-totals]').textContent()).includes('nền chưa đủ'));
      assert.equal(await root.locator('[data-live-card-toggle]').count(),0);
      await card.evaluate(el=>{el.dataset.binanceCardAvgRoe='4.01';el.append(document.createTextNode(''));});
      await card.locator('[data-live-card-toggle]').waitFor();
      assert.equal(await card.locator('[data-live-card-toggle]').getAttribute('data-key'),`btc-liquidation-forecast:${side}:UNWINDING`);
      assert.equal(await card.locator('[data-live-card-toggle]').isChecked(),false);
      await card.evaluate(el=>{el.dataset.binanceCardAvgRoe='';el.append(document.createTextNode(''));});
      await page.waitForFunction(side=>!document.querySelector(`[data-forecast-side="${side}"] [data-live-card-toggle]`),side);
      if(side==='SHORT')await root.screenshot({path:join(artifacts,mobile?'unwinding-mobile.png':'unwinding-desktop.png')});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    }
    fail=true;await page.reload();await page.waitForSelector('#btc-liquidation-context[data-state="WAIT_DATA"]');
    await page.waitForFunction(()=>document.querySelector('[data-context-reasons]').textContent.includes('Không lấy được'));
    assert.equal(await root.getAttribute('data-live-card-key'),null);
    assert.equal(await root.locator('[data-live-card-toggle]').count(),0);
    assert.equal(await root.locator('[data-forecast-side="LONG"]').getAttribute('data-tier'),'WAIT_DATA');
    assert.equal(await root.locator('[data-forecast-side="LONG"]').getAttribute('data-live-card-key'),null);
    await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  console.log(`PASS AI Local liquidation desktop/mobile, labels/history, stale API, XSS, whitelist hidden, no trade/write. Screenshots: ${artifacts}`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
