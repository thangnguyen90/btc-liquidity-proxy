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
function localFixture(symbol,range,model){
 const now=Date.now(),plan=heatmapRangePlan(range,now),n=(plan.end-plan.from)/plan.step;
 const raw=Array.from({length:n},(_,i)=>{const c=i<200?100+i*.02:i<300?104+(i-200)*.4:144-(i-300)*.1;return [plan.from+i*plan.step,c,c+.2,c-.2,c,1000,plan.from+(i+1)*plan.step-1,100000+i*20];});
 const candles=normalizeBinanceHeatmapCandles(raw,plan),oiRows=raw.map((r,i)=>({timestamp:r[0],sumOpenInterest:100000+i*500+Math.sin(i*.11)*1000}));
 return buildBinanceLocalHeatmap({query:{symbol,range},plan,candles,markRows:candles,oiRows,model,now});
}
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost'),path=u.pathname;if(req.method!=='GET'){writes.push(path);res.writeHead(405);res.end();return;}
 if(path.startsWith('/api/')){
  requests.push(path);const payload=path.endsWith('/status')?{version:HEATMAP_LAB_VERSION,source:'BINANCE_LOCAL',requiresCoinglassApi:false}:path==='/api/coinglass-heatmap-lab'?{version:HEATMAP_LAB_VERSION,models:[1,3].map(model=>mode==='OK'||mode==='PARTIAL'&&model===1?{status:'OK',model,data:localFixture(u.searchParams.get('symbol'),u.searchParams.get('range'),model)}:{status:'INSUFFICIENT_OI',model,message:'Thiếu dữ liệu Binance/OI.',data:null})}:{};
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
 await page.locator('#demo').click();await page.waitForFunction(()=>document.querySelectorAll('.source-badge[data-source="DEMO"]').length===2);
 assert((await page.locator('#sourceState').textContent()).includes('KHÔNG PHẢI DỮ LIỆU THỊ TRƯỜNG'));
 assert.equal(await page.locator('.entry-plan').count(),0,'DEMO clears authoritative scenarios');
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const linear=await page.locator('canvas').first().evaluate(c=>c.toDataURL());await page.locator('#scale').selectOption('log');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.notEqual(await page.locator('canvas').first().evaluate(c=>c.toDataURL()),linear,'manual Log option still redraws heatmap');
 const pixels=await page.locator('canvas').first().evaluate(c=>{const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let green=0,yellow=0;for(let i=0;i<a.length;i+=4){if(a[i+1]>100&&a[i+1]>a[i]*1.2)green++;if(a[i]>180&&a[i+1]>160&&a[i+2]<100)yellow++;}return {green,yellow};});
 assert(pixels.green>300&&pixels.yellow>100,'real canvas paints heatmap and candles');
 await page.locator('canvas').first().hover({position:{x:140,y:220}});assert.equal(await page.locator('.chart-tooltip').first().isVisible(),true);assert((await page.locator('.chart-tooltip').first().textContent()).includes('Cường độ'));
 await page.locator('#scale').selectOption('linear');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const old=await page.locator('canvas').first().evaluate(c=>c.toDataURL());await page.locator('#zoomIn').click();await page.waitForTimeout(100);const zoom=await page.locator('canvas').first().evaluate(c=>c.toDataURL());assert.notEqual(zoom,old);
 await page.locator('#reset').click();await page.locator('#floor').fill('50');await page.locator('#floor').dispatchEvent('input');assert.equal(await page.locator('#floorText').textContent(),'50%');
 await page.locator('#floor').fill('5');await page.locator('#floor').dispatchEvent('input');await page.locator('canvas').first().dispatchEvent('pointerleave');
 await page.screenshot({path:join(artifacts,`${mobile?'mobile':'desktop'}-demo.png`),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 mode='MISSING';await page.locator('#load').click();await page.waitForFunction(()=>document.getElementById('sourceState').textContent.includes('Chưa dựng được'));
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
}assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert(!requests.some(p=>/binance|refresh|login/.test(p)));console.log(`PASS Heatmap Lab browser desktop/mobile: painted2charts, badges/watermark/hover/zoom/threshold/import/model guard/no fallback/no overflow/no writes. Artifacts ${artifacts}`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
