import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {HEATMAP_LAB_VERSION,demoHeatmap} from '../public/coinglass-heatmap-model.js';
import {RATIO_PERIODS} from '../public/heatmap-top-ratio-model.js';
import {HeatmapTopTraderRatio} from '../src/heatmapTopTraderRatio.js';
const root=resolve('public'),writes=[],errors=[],ratioQueries=[],chartQueries=[];let holdSymbol='QUSDT',releases=[],mode='OK';
const ratios=new HeatmapTopTraderRatio({loadRows:async({symbol,period,limit})=>{
 const step=RATIO_PERIODS[period],now=Math.floor(Date.now()/step)*step;
 if(mode==='ERROR')throw Object.assign(Error('limited'),{status:429,retryAfterMs:300000});
 if(mode==='EMPTY')return [];
 return Array.from({length:limit},(_,i)=>{const ratio=symbol==='QUSDT'?1.6-i*.0005:2+i*.0003,longAccount=Number((ratio/(1+ratio)).toFixed(4));return {symbol,timestamp:now-(limit-1-i)*step-(mode==='STALE'?3*step:0),longShortRatio:ratio,longAccount,shortAccount:Number((1-longAccount).toFixed(4))};});
}});
const reset=()=>{ratios.cache.clear();ratios.failures?.clear();ratios.reads=[];};
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://local'),path=u.pathname;if(req.method!=='GET'){writes.push(path);res.writeHead(405);res.end();return;}
 if(path==='/ws/coin-level-analysis'){res.writeHead(503);res.end();return;}
 if(path.startsWith('/api/')){
  let data={};
  if(path==='/api/coinglass-heatmap-lab/ratio'){
   const query=Object.fromEntries(u.searchParams);ratioQueries.push(query);if(query.symbol===holdSymbol)await new Promise(r=>releases.push(r));data=await ratios.get(query);
   if(mode==='WRONG_COIN')data.symbol='BADUSDT';
  }else if(path==='/api/coinglass-heatmap-lab'){chartQueries.push(u.search);data={version:HEATMAP_LAB_VERSION,models:[1,3].map(model=>({model,status:'OK',data:{...demoHeatmap({symbol:u.searchParams.get('symbol'),range:u.searchParams.get('range'),model}),source:'BINANCE_LOCAL',estimated:true,inputs:{markCoveragePct:100,oiCoveragePct:100,interval:'5m'}}}))};}
  else if(path==='/api/coinglass-heatmap-lab/status')data={source:'BINANCE_LOCAL',manualOrders:{version:'HEATMAP_MANUAL_MARKET_LIMIT_GTC_V2_20261022',orderTypes:['MARKET','LIMIT'],limitTimeInForce:'GTC'}};
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));return;
 }
 const file=resolve(root,'.'+path);if(!file.startsWith(root+sep))throw Error('path');const body=await readFile(file);res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(file)]??'text/plain'});res.end(body);
}catch(e){if(!res.headersSent)res.writeHead(400);res.end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,dir=await mkdtemp(join(tmpdir(),'heatmap-top-ratio-'));
const libs=join(process.cwd(),'.playwright-libs/root/usr/lib/x86_64-linux-gnu'),browser=await chromium.launch({headless:true,env:{...process.env,LD_LIBRARY_PATH:[existsSync(libs)?libs:'',process.env.LD_LIBRARY_PATH??''].filter(Boolean).join(':')}});
try{for(const mobile of [false,true]){
 reset();mode='OK';holdSymbol='QUSDT';const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1512,height:1120},isMobile:mobile,hasTouch:mobile}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install();
 await page.goto(base+'/coinglass-heatmap-lab.html?symbol=QUSDT&range=24h');await page.waitForFunction(()=>document.querySelectorAll('.source-badge[data-source="BINANCE_LOCAL"]').length===2);
 assert.equal(await page.locator('#heatmap-top-ratio').getAttribute('data-state'),'loading','ratio cannot delay either heatmap');assert(await page.evaluate(()=>document.querySelector('.chart-grid').nextElementSibling.id==='heatmap-top-ratio'));
 holdSymbol='';releases.splice(0).forEach(r=>r());await page.waitForSelector('#heatmap-top-ratio[data-state="ready"]');assert.equal(await page.locator('#topRatioCoin').textContent(),'QUSDT');assert.equal(await page.locator('#topRatioPeriod').inputValue(),'auto');assert.match(await page.locator('#topRatioMeta').textContent(),/5m/);assert.match(await page.locator('#topRatioLatest').textContent(),/LONG 59.28% · SHORT 40.72%/);
 assert(await page.locator('.top-ratio-bar').count()>250);assert.equal(await page.locator('.top-ratio-line').getAttribute('stroke'),'#111827');assert.equal(await page.locator('.top-ratio-axis').count(),2);assert.doesNotMatch(await page.locator('#heatmap-top-ratio').innerText(),/NaN|Infinity/);
 assert(await page.evaluate(()=>{const plot=document.querySelector('.top-ratio-svg'),left=document.querySelector('.top-ratio-axis.left'),right=document.querySelector('.top-ratio-axis.right'),y=svg=>new DOMPoint(0,24).matrixTransform(svg.getScreenCTM()).y;return Math.abs(y(plot)-y(left))<1&&Math.abs(y(plot)-y(right))<1;}),'mobile/desktop axes stay aligned with the plot');
 await page.locator('#heatmap-top-ratio').scrollIntoViewIfNeeded();const scroll=page.locator('.top-ratio-scroll');await scroll.scrollIntoViewIfNeeded();let box=await scroll.boundingBox();const point={x:box.x+box.width*.7,y:box.y+150};
 if(mobile)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);assert(await page.locator('#topRatioReadout').isVisible());const pinned=await page.locator('#topRatioReadout').textContent();assert.match(pinned,/LONG [\d.]+% · SHORT [\d.]+%/);
 await page.mouse.move(0,0);assert.equal(await page.locator('#topRatioReadout').textContent(),pinned);assert(await page.locator('#topRatioReadout').isVisible(),'pinned readout survives leave');
 if(mobile)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);assert.equal(await page.locator('#topRatioReadout').isVisible(),false,'second click/tap toggles readout off');
 await page.locator('.top-ratio-svg').evaluate(svg=>svg.focus({preventScroll:true}));await page.keyboard.press('Enter');assert(await page.locator('#topRatioReadout').isVisible());await page.keyboard.press('ArrowLeft');await page.keyboard.press('Escape');assert.equal(await page.locator('#topRatioReadout').isVisible(),false);
 if(mobile){
  box=await scroll.boundingBox();const prior=await scroll.evaluate(n=>n.scrollLeft),cdp=await context.newCDPSession(page),x=box.x+60,y=box.y+180;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+i*20,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await page.locator('#topRatioReadout').isVisible(),false,'native horizontal scroll is not a tap');assert(await scroll.evaluate((n,p)=>n.scrollLeft<p,prior));await cdp.detach();
 }
 await page.locator('#heatmap-top-ratio').screenshot({path:join(dir,mobile?'mobile.png':'desktop.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const chartCount=chartQueries.length;await page.locator('#topRatioPeriod').selectOption('15m');await page.waitForFunction(()=>document.getElementById('topRatioMeta').textContent.includes('15m'));assert.equal(chartQueries.length,chartCount,'changing ratio period must not rebuild heatmaps or submit orders');
 const requests=ratioQueries.length;await page.locator('#topRatioRefresh').click();await page.waitForFunction(()=>!document.getElementById('topRatioRefresh').disabled);assert.equal(ratioQueries.length,requests+1);assert.equal(chartQueries.length,chartCount);
 const beforePoll=ratioQueries.length;await page.clock.runFor(61000);await page.waitForFunction(()=>!document.getElementById('topRatioRefresh').disabled);assert.equal(ratioQueries.length,beforePoll+1,'poll ratio only every minute');await page.clock.setSystemTime(Date.now());
 mode='STALE';reset();await page.locator('#topRatioRefresh').click();await page.waitForSelector('#heatmap-top-ratio[data-state="stale"]');assert(await page.locator('.top-ratio-bar').count()>0,'old samples remain visibly marked stale');
 mode='ERROR';reset();await page.locator('#topRatioRefresh').click();await page.waitForSelector('#heatmap-top-ratio[data-state="error"]');assert.match(await page.locator('#topRatioState').textContent(),/giới hạn tải|bản đã tải/);
 mode='EMPTY';reset();await page.locator('#topRatioRefresh').click();await page.waitForSelector('#heatmap-top-ratio[data-state="empty"]');assert.equal(await page.locator('.top-ratio-line').count(),0);
 mode='WRONG_COIN';reset();await page.locator('#topRatioRefresh').click();await page.waitForSelector('#heatmap-top-ratio[data-state="error"]');assert.equal(await page.locator('.top-ratio-line').count(),0,'wrong-symbol response is never drawn');
 mode='OK';reset();holdSymbol='QUSDT';await page.locator('#load').click();await page.waitForFunction(()=>document.querySelectorAll('.source-badge[data-source="BINANCE_LOCAL"]').length===2);assert.equal(await page.locator('#heatmap-top-ratio').getAttribute('data-state'),'loading');
 await page.locator('#symbol').fill('ERA');await page.locator('#symbol').press('Enter');await page.waitForSelector('#heatmap-top-ratio[data-state="ready"]');assert.equal(await page.locator('#topRatioCoin').textContent(),'ERAUSDT');const era=await page.locator('#topRatioLatest').textContent();holdSymbol='';releases.splice(0).forEach(r=>r());await page.waitForTimeout(40);assert.equal(await page.locator('#topRatioLatest').textContent(),era,'late old-symbol fetch cannot overwrite the new coin');
 await page.locator('#topRatioPeriod').selectOption('auto');await page.locator('#range').selectOption('30d');await page.locator('#load').click();await page.waitForSelector('#heatmap-top-ratio[data-state="ready"]');assert.match(await page.locator('#topRatioMeta').textContent(),/2h/);
 await page.locator('#topRatioPeriod').selectOption('5m');await page.waitForFunction(()=>document.getElementById('topRatioMeta').textContent.includes('không đủ toàn bộ khoảng 30d'));
 await page.locator('#symbol').fill('龙虾');await page.locator('#symbol').press('Enter');await page.waitForSelector('#heatmap-top-ratio[data-state="ready"]');assert.equal(await page.locator('#topRatioCoin').textContent(),'龙虾USDT');
 const fixture=demoHeatmap({symbol:'龙虾USDT',range:'30d',model:3}),raw={model:3,symbol:fixture.symbol,range:fixture.range,data:{y_axis:fixture.y,price_candlesticks:fixture.candles.map(c=>[c.time,c.open,c.high,c.low,c.close]),liquidation_leverage_data:fixture.cells}};
 await page.locator('[data-import="3"]').setInputFiles({name:'m3.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))});await page.waitForSelector('.source-badge[data-source="IMPORT"]');assert.equal(await page.locator('.top-ratio-line').count(),0);assert.equal(await page.locator('#topRatioCoin').textContent(),'Chưa chọn coin');
 const stopped=ratioQueries.length;await page.locator('#demo').click();await page.clock.runFor(61000);assert.equal(ratioQueries.length,stopped,'DEMO/import stops ratio reads, no artificial ratios');await page.locator('#clear').click();assert.equal(await page.locator('.top-ratio-line').count(),0);
 await context.close();
}assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log('PASS Heatmap top ratio desktop/mobile: below both charts, real-account stacked columns/black line/two axes, hover/tap/keyboard/scroll, independent load/period/polling, stale/error/empty, race/Unicode/auto-period/cap500/import/DEMO/no writes. Artifacts '+dir);
}finally{holdSymbol='';releases.splice(0).forEach(r=>r());await browser.close();await new Promise(r=>server.close(r));}
