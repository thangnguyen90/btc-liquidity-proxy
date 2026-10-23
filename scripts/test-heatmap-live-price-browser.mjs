import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {HEATMAP_LAB_VERSION,demoHeatmap} from '../public/coinglass-heatmap-model.js';
import {attachCoinLevelLiveSocket} from '../src/coinLevelLiveSocket.js';
const root=resolve('public'),handlers=new Map(),subscriptions=new Map(),errors=[],writes=[],chartReads=[];
const ticker={register(id,fn){handlers.set(id,fn);},setSymbols(id,symbols){subscriptions.set(id,symbols);},unregister(id){handlers.delete(id);subscriptions.delete(id);},emit(symbol,markPrice,eventTime=Date.now()){for(const [id,fn] of handlers)if(subscriptions.get(id)?.includes(symbol))fn({symbol,markPrice,eventTime});}};
const fixture=(symbol,range,model)=>({...demoHeatmap({symbol,range,model}),source:'BINANCE_LOCAL',estimated:true,inputs:{markCoveragePct:100,oiCoveragePct:100,interval:'5m'}});
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');if(req.method!=='GET'){writes.push(url.pathname);res.writeHead(405);res.end();return;}
 if(url.pathname.startsWith('/api/')){
  let payload={};if(url.pathname==='/api/coinglass-heatmap-lab'){chartReads.push(url.search);payload={version:HEATMAP_LAB_VERSION,models:[1,3].map(model=>({model,status:'OK',data:fixture(url.searchParams.get('symbol'),url.searchParams.get('range'),model)}))};}
  if(url.pathname==='/api/coinglass-heatmap-lab/status')payload={source:'BINANCE_LOCAL'};
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(payload));return;
 }
 const file=resolve(root,'.'+url.pathname);if(!file.startsWith(root+sep))throw Error('path');const body=await readFile(file);res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(file)]??'text/plain'});res.end(body);
}catch{res.writeHead(404);res.end();}});
const stream=attachCoinLevelLiveSocket({server,ticker,normalizeSymbol:s=>/^[\p{L}\p{N}]+USDT$/u.test(s)?s:'',heartbeatMs:60000});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,artifacts=await mkdtemp(join(tmpdir(),'heatmap-live-mark-'));
const libs=join(process.cwd(),'.playwright-libs/root/usr/lib/x86_64-linux-gnu');
const browser=await chromium.launch({headless:true,env:{...process.env,LD_LIBRARY_PATH:[existsSync(libs)?libs:'',process.env.LD_LIBRARY_PATH??''].filter(Boolean).join(':')}});
const waitFor=async test=>{for(let i=0;i<100;i++){if(test())return;await new Promise(r=>setTimeout(r,20));}throw Error('socket subscription timeout');};
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1512,height:1120},isMobile:mobile,hasTouch:mobile}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  await page.goto(base+'/coinglass-heatmap-lab.html?symbol=QUSDT&range=24h');await page.waitForFunction(()=>document.querySelectorAll('.source-badge[data-source="BINANCE_LOCAL"]').length===2);await waitFor(()=>handlers.size===1);
  assert.equal(await page.locator('.chart-live-price[data-state="live"]').count(),0,'ready alone is not LIVE');
  const mark=fixture('QUSDT','24h',1).candles.at(-1).close;const metadata=await page.locator('.chart-meta').allTextContents();const reads=chartReads.length;
  ticker.emit('QUSDT',mark);await page.waitForFunction(()=>document.querySelectorAll('.chart-live-price[data-state="live"]').length===2);
  assert.deepEqual(await page.locator('.chart-live-price').allTextContents(),Array(2).fill(await page.locator('.chart-live-price').first().textContent()));
  for(const model of [1,3]){
   const canvas=page.locator(`[data-model="${model}"] canvas`),tip=page.locator(`[data-model="${model}"] .chart-tooltip`);
   await canvas.scrollIntoViewIfNeeded();if(mobile)await canvas.tap({position:{x:110,y:180}});else await canvas.click({position:{x:110,y:180}});
   assert(await tip.isVisible());const pinned=await tip.textContent(),before=await canvas.evaluate(c=>c.toDataURL());
   ticker.emit('QUSDT',mark*1.01,Date.now()+1);await page.waitForFunction(()=>document.querySelector('.chart-live-price').textContent.includes('USDT'));
   await page.waitForTimeout(60);assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),before,'live price line repaints');assert.equal(await tip.textContent(),pinned);assert(await tip.isVisible(),'socket tick keeps pinned popup');
   const cyan=await canvas.evaluate(c=>{const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<a.length;i+=4)if(a[i]===102&&a[i+1]===245&&a[i+2]===255)n++;return n;});assert(cyan>100,'MARK overlay and axis label are painted on canvas');
   if(mobile)await canvas.tap({position:{x:160,y:220}});else await canvas.click({position:{x:160,y:220}});assert.equal(await tip.isVisible(),false,'second click/tap still hides popup');
   ticker.emit('QUSDT',mark,Date.now()+2);await page.waitForTimeout(60);
  }
  assert.deepEqual(await page.locator('.chart-meta').allTextContents(),metadata,'ticks never mutate snapshot/candles/scenarios');assert.equal(chartReads.length,reads,'ticks do not rebuild heatmaps over REST');
  await page.locator('canvas').evaluateAll(canvases=>{window.markLabels=[];for(const c of canvases){const ctx=c.getContext('2d'),original=ctx.fillText;ctx.fillText=function(label,...args){window.markLabels.push(label);return original.call(this,label,...args);};}});
  ticker.emit('QUSDT',mark*100,Date.now()+3);await page.waitForFunction(()=>window.markLabels.some(s=>s.includes('↑ '))&&window.markLabels.filter(s=>s==='MARK · ngoài trục giá').length>=2);
  await page.evaluate(()=>window.markLabels=[]);ticker.emit('QUSDT',mark/100,Date.now()+4);await page.waitForFunction(()=>window.markLabels.some(s=>s.includes('↓ '))&&window.markLabels.filter(s=>s==='MARK · ngoài trục giá').length>=2);
  ticker.emit('QUSDT',mark,Date.now()+5);await page.waitForTimeout(60);
  await page.locator('[data-model="1"] .chart-frame').screenshot({path:join(artifacts,`${mobile?'mobile':'desktop'}-mark.png`)});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no mobile/desktop overflow');
  // A silent socket must lose its LIVE label, even while transport is still open.
  await page.clock.runFor(12000);assert.equal(await page.locator('.chart-live-price[data-state="live"]').count(),0);assert.match(await page.locator('.chart-live-price').first().textContent(),/đang nối|mất kết nối/);await page.clock.resume();await page.clock.setSystemTime(Date.now());
  await page.locator('#symbol').fill('龙虾');await page.locator('#symbol').press('Enter');await waitFor(()=>[...subscriptions.values()].some(s=>s.includes('龙虾USDT')));
  ticker.emit('QUSDT',999);assert.equal(await page.locator('.chart-live-price[data-state="live"]').count(),0,'no old-coin price after search');
  ticker.emit('龙虾USDT',.123);await page.waitForFunction(()=>document.querySelectorAll('.chart-live-price[data-state="live"]').length===2);assert.match(await page.locator('.chart-live-price').first().textContent(),/0.123 USDT/);
  const data=demoHeatmap({symbol:'龙虾USDT',range:'24h',model:3}),raw={model:3,symbol:data.symbol,range:data.range,data:{y_axis:data.y,price_candlesticks:data.candles.map(c=>[c.time,c.open,c.high,c.low,c.close]),liquidation_leverage_data:data.cells}};
  await page.locator('[data-import="3"]').setInputFiles({name:'m3.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))});await page.waitForSelector('.source-badge[data-source="IMPORT"]');await waitFor(()=>handlers.size===0);assert.equal(await page.locator('.chart-live-price[data-state="live"]').count(),0,'mixed IMPORT/Binance does not masquerade as current data');
  await page.locator('#demo').click();await page.waitForSelector('.source-badge[data-source="DEMO"]');assert.equal(handlers.size,0);await page.locator('#clear').click();assert.equal(handlers.size,0);
  await context.close();await waitFor(()=>handlers.size===0);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log(`PASS Heatmap live MARK desktop/mobile, shared real WS, pinned popup, cyan line/axis, stale removal, Unicode/coin switch/import/DEMO cleanup, no snapshot/REST/order writes. Artifacts ${artifacts}`);
}finally{await browser.close();stream.close();await new Promise(r=>server.close(r));}
