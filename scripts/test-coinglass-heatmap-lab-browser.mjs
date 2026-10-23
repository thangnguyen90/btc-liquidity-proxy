import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {HEATMAP_LAB_VERSION,demoHeatmap} from '../public/coinglass-heatmap-model.js';
import {heatmapRangePlan,normalizeBinanceHeatmapCandles,buildBinanceLocalHeatmap} from '../src/binanceHeatmapModel.js';
import {deriveHeatmapEntryScenarios} from '../src/heatmapEntryScenarios.js';
const publicRoot=resolve('public'),writes=[],errors=[],requests=[];let mode='OK';
let holdStatus=false,statusReleases=[],transientCalls=0;const chartRequests=[];
function localFixture(symbol,range,model){
 const now=Date.now(),plan=heatmapRangePlan(range,now),n=(plan.end-plan.from)/plan.step;
 const raw=Array.from({length:n},(_,i)=>{const c=i<200?100+i*.02:i<300?104+(i-200)*.4:144-(i-300)*.1;return [plan.from+i*plan.step,c,c+.2,c-.2,c,1000,plan.from+(i+1)*plan.step-1,100000+i*20];});
 const candles=normalizeBinanceHeatmapCandles(raw,plan),oiRows=raw.map((r,i)=>({timestamp:r[0],sumOpenInterest:100000+i*500+Math.sin(i*.11)*1000}));
 return buildBinanceLocalHeatmap({query:{symbol,range},plan,candles,markRows:candles,oiRows,model,now});
}
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost'),path=u.pathname;if(req.method!=='GET'){writes.push(path);res.writeHead(405);res.end();return;}
 if(path==='/ws/coin-level-analysis'){res.writeHead(503);res.end();return;}
 if(path.startsWith('/api/')){
  if(path.endsWith('/status')&&holdStatus)await new Promise(resolve=>statusReleases.push(resolve));
  if(path==='/api/coinglass-heatmap-lab'){
   chartRequests.push({symbol:u.searchParams.get('symbol'),range:u.searchParams.get('range')});
   if(mode==='TRANSIENT_ONCE'||mode==='TRANSIENT_ALWAYS'){
    const failed=++transientCalls===1||mode==='TRANSIENT_ALWAYS';
    if(failed){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({version:HEATMAP_LAB_VERSION,models:[1,3].map(model=>({model,status:'BINANCE_UNAVAILABLE',message:'Temporary initial read failure',data:null}))}));return;}
   }
   if(mode==='HTTP429'){res.writeHead(429,{'content-type':'application/json'});res.end('{}');return;}
   if(mode==='BADJSON'){res.writeHead(200,{'content-type':'application/json'});res.end('{invalid');return;}
  }
  requests.push(path);const payload=path.endsWith('/status')?{version:HEATMAP_LAB_VERSION,source:'BINANCE_LOCAL',requiresCoinglassApi:false}:path==='/api/coinglass-heatmap-lab'?{version:HEATMAP_LAB_VERSION,models:[1,3].map(model=>mode==='OK'||mode==='TRANSIENT_ONCE'||mode==='PARTIAL'&&model===1?{status:'OK',model,data:localFixture(u.searchParams.get('symbol'),u.searchParams.get('range'),model)}:{status:'INSUFFICIENT_OI',model,message:'Thiếu dữ liệu Binance/OI.',data:null})}:{};
  if(path==='/api/coinglass-heatmap-lab'){
   const data=payload.models.find(m=>m.data)?.data;
   const candles=(data?.candles??[]).map((c,i)=>({...c,end:c.time+data.step-1,quoteVolume:100000+i*20,takerBuyQuoteVolume:60000}));
   payload.scenarios=deriveHeatmapEntryScenarios({models:payload.models,candles,step:data?.step,now:Date.now(),symbol:u.searchParams.get('symbol'),range:u.searchParams.get('range')});
  }
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(payload));return;
 }
 const file=resolve(publicRoot,'.'+path);if(!file.startsWith(publicRoot+sep))throw Error();res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(file)]??'text/plain'});res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,artifacts=await mkdtemp(join(tmpdir(),'heatmap-lab-'));
const libs=join(process.cwd(),'.playwright-libs/root/usr/lib/x86_64-linux-gnu');
const browser=await chromium.launch({headless:true,env:{...process.env,LD_LIBRARY_PATH:[existsSync(libs)?libs:'',process.env.LD_LIBRARY_PATH??''].filter(Boolean).join(':')}});
try{for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1512,height:1120},isMobile:mobile,hasTouch:mobile}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/coinglass-heatmap-lab.html');await page.waitForFunction(()=>document.querySelectorAll('.source-badge[data-source="BINANCE_LOCAL"]').length===2);
 assert.equal(await page.locator('#scale').inputValue(),'linear','both models default to linear color intensity');
 assert.equal(await page.locator('canvas').count(),2);assert((await page.locator('#sourceState').textContent()).includes('Đã tự dựng'));
 assert((await page.locator('#apiState').textContent()).includes('Không sử dụng API Coinglass'));
 assert((await page.locator('[data-model="3"] .chart-meta').textContent()).includes('OI 100%'));
 assert.equal(await page.locator('.entry-plan').count(),4);assert.match(await page.locator('#scenario-context').innerText(),/ZEREBROUSDT/);
 assert.doesNotMatch(await page.locator('#entry-analysis').innerText(),/undefined|NaN/);
 await page.screenshot({path:join(artifacts,`${mobile?'mobile':'desktop'}-local.png`),fullPage:true});
 const beforeClear=chartRequests.length;assert(await page.locator('#symbolClear').isVisible());
 if(mobile)await page.locator('#symbolClear').tap();else await page.locator('#symbolClear').click();
 assert.equal(await page.locator('#symbol').inputValue(),'');assert(await page.locator('#symbol').evaluate(n=>document.activeElement===n),'clear returns focus to the input');assert.equal(await page.locator('#symbolClear').isVisible(),false);assert.equal(chartRequests.length,beforeClear,'clear never searches or submits');assert.equal(await page.locator('.source-badge[data-source]').count(),0);
 await page.locator('#symbol').fill('BTC');assert(await page.locator('#symbolClear').isVisible());await page.locator('#symbolClear').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#symbol').inputValue(),'');assert(await page.locator('#symbol').evaluate(n=>document.activeElement===n));assert.equal(chartRequests.length,beforeClear,'keyboard clear is not a search');
 await page.locator('#symbol').fill('ZEREBRO');await page.locator('#symbol').press('Enter');await page.waitForFunction(()=>document.querySelectorAll('.source-badge[data-source="BINANCE_LOCAL"]').length===2);
 await page.locator('#demo').click();await page.waitForFunction(()=>document.querySelectorAll('.source-badge[data-source="DEMO"]').length===2);
 assert((await page.locator('#sourceState').textContent()).includes('KHÔNG PHẢI DỮ LIỆU THỊ TRƯỜNG'));
 assert.equal(await page.locator('.entry-plan').count(),0,'DEMO clears authoritative scenarios');
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const linear=await page.locator('canvas').first().evaluate(c=>c.toDataURL());await page.locator('#scale').selectOption('log');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.notEqual(await page.locator('canvas').first().evaluate(c=>c.toDataURL()),linear,'manual Log option still redraws heatmap');
 const pixels=await page.locator('canvas').first().evaluate(c=>{const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let green=0,yellow=0;for(let i=0;i<a.length;i+=4){if(a[i+1]>100&&a[i+1]>a[i]*1.2)green++;if(a[i]>180&&a[i+1]>160&&a[i+2]<100)yellow++;}return {green,yellow};});
 assert(pixels.green>300&&pixels.yellow>100,'real canvas paints heatmap and candles');
 await page.locator('canvas').first().hover({position:{x:140,y:220}});assert.equal(await page.locator('.chart-tooltip').first().isVisible(),true);assert((await page.locator('.chart-tooltip').first().textContent()).includes('Cường độ'));
 for(const model of [1,3]){
  const canvas=page.locator(`[data-model="${model}"] canvas`),tip=page.locator(`[data-model="${model}"] .chart-tooltip`);
  await canvas.scrollIntoViewIfNeeded();await canvas.dispatchEvent('pointerleave');
  if(mobile)await canvas.tap({position:{x:130,y:180}});else await canvas.click({position:{x:130,y:180}});
  assert.equal(await tip.isVisible(),true,`Model${model}: first click/tap opens and pins popup`);
  const pinned=await tip.innerText();assert.match(pinned,/Cường độ/);assert.match(pinned,/O .*H .*\nL .*C /);
  if(!mobile){await page.mouse.move(0,0);assert.equal(await tip.isVisible(),true,'pinned desktop popup survives pointerleave');await canvas.hover({position:{x:200,y:230}});assert.equal(await tip.innerText(),pinned,'hover cannot change pinned values');}
  if(model===1)await page.locator('[data-model="1"] .chart-frame').screenshot({path:join(artifacts,`${mobile?'mobile':'desktop'}-click-tooltip.png`)});
  if(mobile)await canvas.tap({position:{x:200,y:230}});else await canvas.click({position:{x:200,y:230}});
  assert.equal(await tip.isVisible(),false,`Model${model}: second click/tap (even another point) closes popup`);
  await page.waitForTimeout(80);assert.equal(await tip.isVisible(),false,'second tap must not reopen from synthetic hover events');
  if(!mobile){await canvas.hover({position:{x:145,y:195}});assert.equal(await tip.isVisible(),true,'real mouse movement resumes desktop hover');await canvas.dispatchEvent('pointerleave');assert.equal(await tip.isVisible(),false,'unpinned desktop hover still hides on leave');}
 }
 await page.locator('#scale').selectOption('linear');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const old=await page.locator('canvas').first().evaluate(c=>c.toDataURL());await page.locator('#zoomIn').click();await page.waitForTimeout(100);const zoom=await page.locator('canvas').first().evaluate(c=>c.toDataURL());assert.notEqual(zoom,old);
 const dragCanvas=page.locator('canvas').first();await dragCanvas.scrollIntoViewIfNeeded();const rect=await dragCanvas.boundingBox();
 if(mobile){
  const touch=await context.newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+120,y:rect.y+160}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rect.x+180,y:rect.y+160}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await page.locator('.chart-tooltip').first().isVisible(),false,'horizontal touch drag is not a tap');
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+120,y:rect.y+200}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rect.x+120,y:rect.y+120}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();
  assert.equal(await page.locator('.chart-tooltip').first().isVisible(),false,'vertical scroll/cancel must not toggle popup');
 }else{
  await page.mouse.move(rect.x+120,rect.y+160);await page.mouse.down();await page.mouse.move(rect.x+180,rect.y+160,{steps:4});await page.mouse.up();
  assert.equal(await page.locator('.chart-tooltip').first().isVisible(),false,'mouse drag is not a click');
 }
 await page.locator('#reset').click();await dragCanvas.scrollIntoViewIfNeeded();
 if(mobile)await dragCanvas.tap({position:{x:130,y:180}});else await dragCanvas.click({position:{x:130,y:180}});
 assert.equal(await page.locator('.chart-tooltip').first().isVisible(),true);await page.locator('#zoomIn').click();
 await page.waitForFunction(()=>document.querySelector('.chart-tooltip').hidden,'zoom clears a pinned popup from the old view');
 await page.locator('#reset').click();await page.locator('#floor').fill('50');await page.locator('#floor').dispatchEvent('input');assert.equal(await page.locator('#floorText').textContent(),'50%');
 await page.locator('#floor').fill('5');await page.locator('#floor').dispatchEvent('input');await page.locator('canvas').first().dispatchEvent('pointerleave');
 await page.screenshot({path:join(artifacts,`${mobile?'mobile':'desktop'}-demo.png`),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 if(mobile)await dragCanvas.tap({position:{x:130,y:180}});else await dragCanvas.click({position:{x:130,y:180}});
 assert.equal(await page.locator('.chart-tooltip').first().isVisible(),true);
 mode='MISSING';await page.locator('#load').click();await page.waitForFunction(()=>document.getElementById('sourceState').textContent.includes('Chưa dựng được'));
 assert.equal(await page.locator('.chart-tooltip').first().isVisible(),false,'new/failed data load cannot retain the old pinned popup');
 assert.equal(await page.locator('.source-badge[data-source="DEMO"]').count(),0,'never auto-fallback demo after real API error');
 assert.equal(await page.locator('.entry-plan').count(),0,'failed load cannot keep old scenarios');
 mode='PARTIAL';await page.locator('#load').click();await page.waitForSelector('.source-badge[data-source="BINANCE_LOCAL"]');assert.equal(await page.locator('.source-badge[data-source]').count(),1,'model3 must not borrow model1');
 assert.equal(await page.locator('.entry-plan').count(),0);assert.match(await page.locator('#scenario-context').innerText(),/Cần đủ hai model/);
 const fixture=demoHeatmap({symbol:'ZEREBROUSDT',range:'24h',model:3}),raw={model:3,symbol:fixture.symbol,range:fixture.range,data:{y_axis:fixture.y,price_candlesticks:fixture.candles.map(c=>[c.time/1000,c.open,c.high,c.low,c.close]),liquidation_leverage_data:fixture.cells}};
 await page.locator('[data-import="3"]').setInputFiles({name:'model3.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))});await page.waitForSelector('[data-model="3"] .source-badge[data-source="IMPORT"]');
 await page.waitForFunction(()=>document.getElementById('comparison').textContent.includes('HAI NGUỒN KHÁC NHAU'));
 await page.locator('[data-import="1"]').setInputFiles({name:'wrong-model.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))});await page.waitForFunction(()=>document.querySelector('[data-model="1"] .chart-meta').textContent.includes('không khớp'));
 assert.equal(await page.locator('[data-model="1"] .source-badge[data-source]').count(),0);
 await page.locator('#range').selectOption('12h');assert.equal(await page.locator('.source-badge[data-source]').count(),0,'changing range clears stale datasets');
 assert.equal(await page.locator('.entry-plan').count(),0);
 mode='OK';await page.locator('#symbol').fill('BTC');await page.locator('#symbol').press('Enter');await page.waitForFunction(()=>document.getElementById('scenario-context').textContent.includes('BTCUSDT'));
 assert.equal(await page.locator('.entry-plan').count(),4);assert.equal(new URL(page.url()).searchParams.get('symbol'),'BTCUSDT');
 await page.locator('#scenario-title').click();assert.equal(await page.locator('.entry-plan').count(),4,'blurring symbol after Enter must not clear completed search');
 for(const variant of ['BTW','BTWusdt','btwusdt','  BTWusdt  ']){
  await page.locator('#symbol').fill(variant);await page.locator('#symbol').press('Enter');await page.waitForFunction(()=>document.getElementById('scenario-context').textContent.includes('BTWUSDT'));
  assert.equal(await page.locator('#symbol').inputValue(),'BTWUSDT');assert.equal(new URL(page.url()).searchParams.get('symbol'),'BTWUSDT');
  assert.equal(await page.locator('#priceAlertSymbol').inputValue(),'BTWUSDT');assert.equal(await page.locator('#sweepCoin').innerText(),'BTWUSDT');assert.equal(await page.locator('.entry-plan').count(),4);
 }
 await page.locator('#symbol').fill('<invalid>');await page.locator('#symbol').press('Enter');assert.equal(await page.locator('.entry-plan').count(),0,'invalid search clears previous coin scenarios');
 assert.equal(await page.locator('input[type=password]').count(),0,'API key never entered into browser');await context.close();mode='OK';
}
// Opening a deep link must load immediately, independently of the status probe.
const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
holdStatus=true;let start=chartRequests.length;
await page.goto(base+'/coinglass-heatmap-lab.html?symbol=BTWusdt&range=12h');
await page.waitForFunction(()=>document.querySelectorAll('.source-badge[data-source="BINANCE_LOCAL"]').length===2);
assert.equal(statusReleases.length,1,'status request is still pending while linked charts have painted');
assert.deepEqual(chartRequests.slice(start),[{symbol:'BTWUSDT',range:'12h'}]);
await page.locator('#symbol').fill('BTC');await page.locator('#symbol').press('Enter');
await page.waitForFunction(()=>document.getElementById('scenario-context').textContent.includes('BTCUSDT'));
holdStatus=false;statusReleases.splice(0).forEach(r=>r());await page.waitForFunction(()=>document.getElementById('apiState').textContent.includes('Không sử dụng API Coinglass'));
assert.equal(chartRequests.length,start+2,'late status cannot issue another search or erase the manual selection');
assert.equal(await page.locator('#symbol').inputValue(),'BTCUSDT');
mode='TRANSIENT_ONCE';transientCalls=0;start=chartRequests.length;
await page.goto(base+'/coinglass-heatmap-lab.html?symbol=ETH&range=24h');
await page.waitForFunction(()=>document.getElementById('sourceState').textContent.includes('thử lại 1/1'));
await page.waitForFunction(()=>document.querySelectorAll('.source-badge[data-source="BINANCE_LOCAL"]').length===2);
assert.deepEqual(chartRequests.slice(start),[{symbol:'ETHUSDT',range:'24h'},{symbol:'ETHUSDT',range:'24h'}]);
mode='TRANSIENT_ALWAYS';transientCalls=0;start=chartRequests.length;
await page.goto(base+'/coinglass-heatmap-lab.html?symbol=ADA&range=24h');
await page.waitForFunction(()=>document.getElementById('sourceState').textContent.includes('Chưa dựng được'));
await page.waitForTimeout(1700);assert.equal(chartRequests.length,start+2,'automatic retry is bounded to one, never a polling loop');
mode='HTTP429';start=chartRequests.length;await page.goto(base+'/coinglass-heatmap-lab.html?symbol=XRP&range=24h');
await page.waitForFunction(()=>document.getElementById('sourceState').textContent.includes('Không tải được'));
await page.waitForTimeout(1700);assert.equal(chartRequests.length,start+1,'do not retry HTTP429/explicit rate limit');
mode='BADJSON';start=chartRequests.length;await page.goto(base+'/coinglass-heatmap-lab.html?symbol=TRX&range=24h');
await page.waitForFunction(()=>document.getElementById('sourceState').textContent.includes('Không tải được'));
await page.waitForTimeout(1700);assert.equal(chartRequests.length,start+1,'malformed JSON is a protocol failure, not an automatic retry case');
mode='PARTIAL';start=chartRequests.length;await page.goto(base+'/coinglass-heatmap-lab.html?symbol=BNB&range=24h');
await page.waitForFunction(()=>document.getElementById('sourceState').textContent.includes('Đã tự dựng 1/2'));
await page.waitForTimeout(1700);assert.equal(chartRequests.length,start+1,'partial/insufficient OI is not a transient auto-retry case');
mode='TRANSIENT_ALWAYS';transientCalls=0;start=chartRequests.length;
await page.goto(base+'/coinglass-heatmap-lab.html?symbol=DOGE&range=24h');
await page.waitForFunction(()=>document.getElementById('sourceState').textContent.includes('thử lại 1/1'));
mode='OK';await page.locator('#symbol').fill('SOL');await page.locator('#symbol').press('Enter');
await page.waitForFunction(()=>document.getElementById('scenario-context').textContent.includes('SOLUSDT'));
await page.waitForTimeout(1700);assert.deepEqual(chartRequests.slice(start),[{symbol:'DOGEUSDT',range:'24h'},{symbol:'SOLUSDT',range:'24h'}],'coin change cancels pending automatic retry');
mode='TRANSIENT_ALWAYS';transientCalls=0;start=chartRequests.length;await page.goto(base+'/coinglass-heatmap-lab.html?symbol=DOGE&range=24h');await page.waitForFunction(()=>document.getElementById('sourceState').textContent.includes('thử lại 1/1'));await page.locator('#symbolClear').click();await page.waitForTimeout(1700);assert.equal(chartRequests.length,start+1,'× cancels pending initial-load retry');assert.equal(await page.locator('#symbol').inputValue(),'');assert.equal(await page.locator('.source-badge[data-source]').count(),0);
await context.close();assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert(!requests.some(p=>/binance|refresh|login/.test(p)));console.log(`PASS Heatmap Lab desktop/mobile + deep-link first load/status independence, late-status race, bounded transient retry/rate-limit/partial/cancel guards; canvas/model/JSON/no-write regressions. Artifacts ${artifacts}`);
}finally{holdStatus=false;statusReleases.splice(0).forEach(r=>r());await browser.close();await new Promise(r=>server.close(r));}
