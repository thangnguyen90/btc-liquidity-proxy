import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {HEATMAP_LAB_VERSION} from '../public/coinglass-heatmap-model.js';
import {heatmapRangePlan,normalizeBinanceHeatmapCandles,buildBinanceLocalHeatmap} from '../src/binanceHeatmapModel.js';
import {deriveHeatmapEntryScenarios} from '../src/heatmapEntryScenarios.js';
import {ManualPricePushAlerts} from '../src/manualPricePushAlerts.js';
const dir=await mkdtemp(join(tmpdir(),'heatmap-price-alerts-')),root=resolve('public'),writes=[],pushes=[],errors=[];
let manager,failRead=false,failWrite=false,quietSend=false;
function bundle(symbol,range){
 const now=Date.now(),plan=heatmapRangePlan(range,now),n=(plan.end-plan.from)/plan.step;
 const raw=Array.from({length:n},(_,i)=>{const c=100+Math.sin(i*.03)*5;return [plan.from+i*plan.step,c,c+.2,c-.2,c,1000,plan.from+(i+1)*plan.step-1,100000+i*20,10,500,60000];});
 const candles=normalizeBinanceHeatmapCandles(raw,plan),oiRows=raw.map((r,i)=>({timestamp:r[0],sumOpenInterest:100000+i*500}));
 const models=[1,3].map(model=>({status:'OK',model,data:buildBinanceLocalHeatmap({query:{symbol,range},plan,candles,markRows:candles,oiRows,model,now})}));
 return {version:HEATMAP_LAB_VERSION,models,scenarios:deriveHeatmapEntryScenarios({models,candles,step:plan.step,now,symbol,range})};
}
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost'),p=u.pathname;
 try{
  if(p.startsWith('/api/')){
   let value={},code=200;
   if(p==='/api/manual-price-push-alerts'){
    if(req.method==='GET'){if(failRead)throw Error('Fixture offline');value=manager.snapshot();}
    else{
     let raw='';for await(const piece of req)raw+=piece;const b=JSON.parse(raw);writes.push({method:req.method,payload:b});
     if(failWrite)throw Error('Fixture write unavailable');
     value=req.method==='DELETE'?await manager.remove(b.id):b.action==='rearm'?await manager.rearm(b.id,{currentPrice:106}):await manager.create({...b,currentPrice:100});
    }
   }else if(p==='/api/coinglass-heatmap-lab/status')value={version:HEATMAP_LAB_VERSION,source:'BINANCE_LOCAL'};
   else if(p==='/api/coinglass-heatmap-lab')value=bundle(u.searchParams.get('symbol'),u.searchParams.get('range'));
   else if(req.method!=='GET')throw Error('Unexpected API write '+p);
   res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(value));return;
  }
  const file=resolve(root,'.'+p);if(!file.startsWith(root+sep))throw Error('Invalid path');
  res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(file)]??'text/plain'});res.end(await readFile(file));
 }catch(e){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,env:{...process.env,LD_LIBRARY_PATH:join(process.cwd(),'.playwright-libs/root/usr/lib/x86_64-linux-gnu')+':'+(process.env.LD_LIBRARY_PATH??'')}});
try{for(const mobile of [false,true]){
 manager=new ManualPricePushAlerts({stateFile:join(dir,`${mobile}.json`),pushSender:async p=>{pushes.push(p);return quietSend?{attempted:0,sent:0,skipped:'QUIET_HOURS'}:{attempted:1,sent:1};}});await manager.initialize();quietSend=false;
 await manager.create({symbol:'BTC',targetPrice:200,currentPrice:100});failRead=false;failWrite=false;
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1512,height:1120},isMobile:mobile,hasTouch:mobile}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const before=writes.length;
 await page.goto(base+'/coinglass-heatmap-lab.html?symbol=QUSDT&range=24h');await page.waitForSelector('.entry-plan');
 await page.locator('#priceAlertLoadState').filter({hasText:'Đồng bộ'}).waitFor();
 assert.equal(await page.locator('#priceAlertSymbol').inputValue(),'QUSDT');assert.equal(await page.locator('[data-opposite-liquidity-push]').count(),1);
 assert.equal(writes.length,before,'opening/searching the page never creates an alert');
 const choose=page.locator('[data-heatmap-alert-price]').first(),chosen=await choose.getAttribute('data-heatmap-alert-price');await choose.click();
 assert.equal(await page.locator('#priceAlertTarget').inputValue(),chosen);assert.equal(writes.length,before,'quick select only fills form');
 await page.locator('#priceAlertTarget').fill('105');await page.locator('#priceAlertAdd').click();await page.locator('#priceAlertStatus').filter({hasText:'Đã lưu QUSDT'}).waitFor();
 assert.deepEqual(writes.at(-1),{method:'POST',payload:{symbol:'QUSDT',range:'24h',targetPrice:105,sourcePage:'HEATMAP_LAB'}});
 assert.equal(await page.locator('.price-alert-row').count(),1);const alert=manager.snapshot().alerts.find(a=>a.symbol==='QUSDT');
 const sentBefore=pushes.length;
 await page.locator('#priceAlertTarget').fill('105');await page.locator('#priceAlertAdd').click();await page.locator('#priceAlertStatus').filter({hasText:'đã có cảnh báo'}).waitFor();
 assert.equal(manager.snapshot().activeCount,2,'duplicate rejected across shared service');assert.equal(pushes.length,sentBefore);
 await manager.onMark({symbol:'QUSDT',markPrice:105.5,eventTime:Date.now()});
 await page.locator('#priceAlertRefresh').click();await page.locator('.price-alert-row').filter({hasText:'ĐÃ CHẠM'}).waitFor();
 assert.match(await page.locator('#priceAlertRows').innerText(),/Đã gửi 1 thiết bị/);assert.equal(pushes.length,sentBefore+1);
 const link=pushes.at(-1).url;assert.match(link,/coinglass-heatmap-lab\?symbol=QUSDT&range=24h&alert=/);
 await page.goto(base+link.replace('/coinglass-heatmap-lab?','/coinglass-heatmap-lab.html?'));await page.waitForSelector('.price-alert-row.is-selected');
 assert.equal((await page.locator('.price-alert-row.is-selected').getAttribute('data-alert-id')),alert.id);
 await page.locator('[data-price-alert-action=rearm]').click();await page.locator('#priceAlertStatus').filter({hasText:'Đã bật lại'}).waitFor();
 assert.equal(manager.snapshot().alerts.find(a=>a.id===alert.id).status,'ACTIVE');
 quietSend=true;await manager.onMark({symbol:'QUSDT',markPrice:104,eventTime:Date.now()});quietSend=false;
 await page.locator('#priceAlertRefresh').click();await page.locator('#priceAlertRows').filter({hasText:'Giờ yên lặng'}).waitFor();
 assert.doesNotMatch(await page.locator('#priceAlertRows').innerText(),/Không có thiết bị nhận Push/);
 await page.locator('[data-price-alert-action=rearm]').click();await page.locator('#priceAlertStatus').filter({hasText:'Đã bật lại'}).waitFor();
 await page.locator('#priceAlertScope').selectOption('all');assert.equal(await page.locator('.price-alert-row').count(),2,'legacy/shared other-page alerts remain visible');
 await page.locator('#price-alerts').screenshot({path:join(dir,mobile?'mobile.png':'desktop.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 failRead=true;await page.locator('#priceAlertRefresh').click();await page.locator('#priceAlertLoadState').filter({hasText:'Chưa đồng bộ'}).waitFor();assert.equal(await page.locator('.price-alert-row').count(),2,'network error preserves list but marks it stale');failRead=false;
 failWrite=true;const beforeFail=writes.length;await page.locator('#priceAlertTarget').fill('107');await page.locator('#priceAlertAdd').click();await page.locator('#priceAlertStatus').filter({hasText:'Chưa xác nhận'}).waitFor();assert.equal(writes.length,beforeFail+1,'ambiguous writes never auto retry');assert.equal(manager.snapshot().activeCount,2);failWrite=false;
 await page.locator(`[data-alert-id="${alert.id}"] [data-price-alert-action=remove]`).click();await page.locator('#priceAlertStatus').filter({hasText:'Đã xóa'}).waitFor();assert.equal(manager.snapshot().alerts.length,1);
 await page.locator('#priceAlertTarget').fill('109');await page.locator('#symbol').fill('ETH');assert.equal(await page.locator('#priceAlertAdd').isDisabled(),true,'editing search disarms old coin form');
 await page.locator('#symbol').press('Enter');await page.waitForFunction(()=>document.getElementById('scenario-context').textContent.includes('ETHUSDT'));assert.equal(await page.locator('#priceAlertSymbol').inputValue(),'ETHUSDT');assert.equal(await page.locator('#priceAlertTarget').inputValue(),'','draft cannot carry over to different coin');
 await page.locator('#demo').click();assert.equal(await page.locator('#priceAlertAdd').isDisabled(),true,'demo cannot populate authoritative alert form');
 await context.close();
}assert.deepEqual(errors,[]);console.log(`PASS Heatmap price alerts desktop/mobile: explicit-only shared CRUD, one-shot/mock delivery/deep link, legacy/filter, duplicate/error/no retry, quick pick, coin isolation, no overflow. Artifacts ${dir}`);
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
