import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {HEATMAP_LAB_VERSION,demoHeatmap} from '../public/coinglass-heatmap-model.js';
const root=resolve('public'),posts=[],gets=[],errors=[],stored=new Map();let mode='OK',release=null;
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://local');
 if(u.pathname.startsWith('/api/')){
  let data={};res.setHeader('content-type','application/json');
  if(u.pathname==='/api/coinglass-heatmap-lab/order'){
   if(req.method==='GET'){gets.push(u.pathname);data=stored.get(u.searchParams.get('requestId'))??{status:'NOT_FOUND'};}
   else{
    let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);posts.push({body,token:req.headers['x-orders-token']});
    if(mode==='HOLD')await new Promise(r=>release=r);
    data={...body,status:'SUBMITTED',orderId:123,exchangeStatus:'NEW'};stored.set(body.requestId,data);
    if(mode==='ERROR'){res.statusCode=503;data={error:'temporary network outcome unknown'};stored.set(body.requestId,{...body,status:'ERROR_OR_UNKNOWN'});}
    if(mode==='AUTH'){res.statusCode=401;data={error:'Đăng nhập Orders'};}
   }
  }else if(req.method!=='GET')throw Error('Unexpected write');
  else if(u.pathname.endsWith('/status'))data={source:'BINANCE_LOCAL',version:HEATMAP_LAB_VERSION,manualOrders:{version:'HEATMAP_MANUAL_MARKET_LIMIT_GTC_V2_20261022',orderTypes:['MARKET','LIMIT'],limitTimeInForce:'GTC'}};
  else if(u.pathname==='/api/coinglass-heatmap-lab')data={version:HEATMAP_LAB_VERSION,models:[1,3].map(model=>({model,status:'OK',data:{...demoHeatmap({symbol:u.searchParams.get('symbol'),range:u.searchParams.get('range'),model}),source:'BINANCE_LOCAL',estimated:true,inputs:{interval:'5m',markCoveragePct:100,oiCoveragePct:100}}}))};
  res.end(JSON.stringify(data));return;
 }
 const file=resolve(root,'.'+u.pathname);if(!file.startsWith(root+sep))throw Error('bad path');
 res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]??'text/plain');res.end(await readFile(file));
}catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,dir=await mkdtemp(join(tmpdir(),'heatmap-manual-ui-'));
const libs=join(process.cwd(),'.playwright-libs/root/usr/lib/x86_64-linux-gnu'),browser=await chromium.launch({headless:true,env:{...process.env,LD_LIBRARY_PATH:[existsSync(libs)?libs:'',process.env.LD_LIBRARY_PATH??''].filter(Boolean).join(':')}});
try{for(const mobile of [false,true]){
 mode='OK';const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const start=posts.length;
 await page.goto(base+'/coinglass-heatmap-lab.html?symbol=ERA&range=24h');await page.waitForFunction(()=>!document.getElementById('heatmapOrderLong').disabled);
 assert.equal(posts.length,start,'opening a link/search never submits an order');
 assert.equal(await page.locator('#heatmapOrderCoin').innerText(),'ERAUSDT');assert.equal(await page.locator('#heatmapOrderMargin').inputValue(),'2');assert.equal(await page.locator('#heatmapOrderLeverage').inputValue(),'5');
 assert.equal(await page.locator('.heatmap-order-controls input[type="number"]').count(),3);assert.equal(await page.locator('#heatmapOrderLimitPrice').inputValue(),'');assert(await page.locator('#heatmapOrderLimitLong').isDisabled());assert(await page.locator('#heatmapOrderLimitShort').isDisabled());
 await page.locator('#heatmapOrderLong').click();assert.match(await page.locator('#heatmapOrderResult').innerText(),/Đăng nhập/);assert.equal(posts.length,start);
 await page.evaluate(()=>localStorage.setItem('orders_token','mock-session'));
 for(const [margin,leverage] of [['0','5'],['101','5'],['2','2.5'],['2','126']]){
  await page.locator('#heatmapOrderMargin').fill(margin);await page.locator('#heatmapOrderLeverage').fill(leverage);await page.locator('#heatmapOrderShort').click();assert.equal(posts.length,start);
 }
 await page.locator('#heatmapOrderMargin').fill('3.25');await page.locator('#heatmapOrderLeverage').fill('10');
 await page.locator('#heatmapOrderLimitPrice').fill('0.123');assert.equal(posts.length,start,'typing a LIMIT price never sends an order');
 page.once('dialog',d=>d.dismiss());await page.locator('#heatmapOrderLong').click();assert.equal(posts.length,start,'cancel is not authorization to submit');
 let confirmation='';mode='HOLD';page.once('dialog',d=>{confirmation=d.message();void d.accept();});await page.locator('#heatmapOrderLong').click();
 await page.waitForFunction(()=>document.getElementById('heatmapOrderResult').textContent.includes('Đang gửi'));
 await page.evaluate(()=>{document.getElementById('heatmapOrderLong').click();document.getElementById('heatmapOrderShort').click();});
 assert.equal(posts.length,start+1);assert.match(confirmation,/LONG ERAUSDT/);assert.match(confirmation,/3.25 USDT × 10x/);
 const body=posts.at(-1).body;assert.equal(body.marginUsdt,3.25);assert.equal(body.leverage,10);assert.equal(body.confirm,true);assert.equal(posts.at(-1).token,'mock-session');
 assert.equal(body.source,undefined);assert.equal(body.takeProfitPrice,undefined);assert.equal(body.stopLossPrice,undefined);
 assert.equal(body.orderType,'MARKET');assert.equal(body.limitPrice,undefined,'MARKET ignores a filled LIMIT input');
 await page.locator('#symbol').fill('BTC');await page.locator('#symbol').press('Enter');await page.waitForFunction(()=>document.getElementById('heatmapOrderCoin').textContent==='BTCUSDT');
 assert.equal(await page.locator('#heatmapOrderLong').isDisabled(),true,'old request remains busy after coin changes');
 release();release=null;mode='OK';await page.waitForFunction(()=>document.getElementById('heatmapOrderResult').textContent.includes('order ID 123'));
 assert.match(await page.locator('#heatmapOrderResult').innerText(),/ERAUSDT/);assert.doesNotMatch(await page.locator('#heatmapOrderResult').innerText(),/đã khớp/);
 await page.locator('#symbol').fill('Q');await page.locator('#symbol').press('Enter');await page.waitForFunction(()=>!document.getElementById('heatmapOrderShort').disabled);
 mode='ERROR';page.once('dialog',d=>d.accept());await page.locator('#heatmapOrderShort').click();await page.waitForFunction(()=>document.getElementById('heatmapOrderResult').textContent.includes('chưa rõ'));
 const count=posts.length;assert.equal(await page.locator('#heatmapOrderShort').isDisabled(),true);
 await page.reload();await page.waitForFunction(()=>document.getElementById('heatmapOrderCoin').textContent==='QUSDT');assert.equal(posts.length,count);assert.equal(await page.locator('#heatmapOrderShort').isDisabled(),true,'reload retains unresolved request without resending');
 await page.locator('#heatmapOrderCheck').click();await page.waitForFunction(()=>document.getElementById('heatmapOrderResult').textContent.includes('ERROR_OR_UNKNOWN'));assert.equal(posts.length,count);
 const pending=posts.at(-1).body;stored.set(pending.requestId,{...pending,status:'REJECTED',error:'preflight blocked'});
 await page.locator('#heatmapOrderCheck').click();await page.waitForFunction(()=>!document.getElementById('heatmapOrderShort').disabled);
 mode='OK';page.once('dialog',d=>d.accept());await page.locator('#heatmapOrderShort').click();await page.waitForFunction(()=>document.getElementById('heatmapOrderResult').textContent.includes('MARKET SHORT QUSDT'));
 assert.equal(await page.locator('#heatmapOrderLimitPrice').inputValue(),'','changing coin/reset clears old coin LIMIT price');
 for(const value of ['','0','-1']){await page.locator('#heatmapOrderLimitPrice').fill(value);assert(await page.locator('#heatmapOrderLimitLong').isDisabled());assert(await page.locator('#heatmapOrderLimitShort').isDisabled());}
 await page.locator('#heatmapOrderMargin').fill('3.25');await page.locator('#heatmapOrderLeverage').fill('10');
 const limitStart=posts.length;await page.locator('#heatmapOrderLimitPrice').fill('0.123');await page.locator('#heatmapOrderLimitPrice').press('Enter');assert.equal(posts.length,limitStart,'Enter in price input does not submit');
 page.once('dialog',d=>d.dismiss());await page.locator('#heatmapOrderLimitLong').click();assert.equal(posts.length,limitStart,'cancelled LIMIT never submits');
 let limitConfirmation='';page.once('dialog',d=>{limitConfirmation=d.message();void d.accept();});await page.locator('#heatmapOrderLimitLong').click();await page.waitForFunction(()=>document.getElementById('heatmapOrderResult').textContent.includes('Binance đã nhận LIMIT LONG QUSDT'));
 assert.equal(posts.length,limitStart+1);const limitBody=posts.at(-1).body;assert.equal(limitBody.orderType,'LIMIT');assert.equal(limitBody.side,'LONG');assert.equal(limitBody.limitPrice,.123);assert.equal(limitBody.marginUsdt,3.25);assert.equal(limitBody.leverage,10);assert.match(limitConfirmation,/LIMIT LONG QUSDT/);assert.match(limitConfirmation,/0.123 USDT · GTC/);assert.match(limitConfirmation,/có thể khớp ngay/);assert.match(await page.locator('#heatmapOrderResult').innerText(),/không tự chuyển MARKET/);
 mode='ERROR';await page.locator('#heatmapOrderLimitPrice').fill('0.13');page.once('dialog',d=>d.accept());await page.locator('#heatmapOrderLimitShort').click();await page.waitForFunction(()=>document.getElementById('heatmapOrderResult').textContent.includes('chưa rõ'));
 for(const id of ['heatmapOrderLong','heatmapOrderShort','heatmapOrderLimitLong','heatmapOrderLimitShort'])assert(await page.locator('#'+id).isDisabled(),'unknown LIMIT blocks both LIMIT and MARKET');
 const limitPending=posts.at(-1).body,limitCount=posts.length;assert.equal(limitPending.side,'SHORT');assert.equal(limitPending.limitPrice,.13);assert.notEqual(limitPending.requestId,limitBody.requestId);
 await page.reload();await page.waitForFunction(()=>document.getElementById('heatmapOrderCoin').textContent==='QUSDT');assert.equal(posts.length,limitCount,'reload never retries LIMIT');
 await page.locator('#heatmapOrderCheck').click();await page.waitForFunction(()=>document.getElementById('heatmapOrderResult').textContent.includes('ERROR_OR_UNKNOWN'));assert.equal(posts.length,limitCount);
 stored.set(limitPending.requestId,{...limitPending,status:'SUBMITTED',orderId:234,exchangeStatus:'NEW'});await page.locator('#heatmapOrderCheck').click();await page.waitForFunction(()=>document.getElementById('heatmapOrderResult').textContent.includes('Binance đã nhận LIMIT SHORT QUSDT'));
 assert.match(await page.locator('#heatmapOrderResult').innerText(),/0.13 USDT · GTC/);assert.equal(posts.length,limitCount,'GET result never resubmits');
 await page.locator('#heatmapOrderLimitPrice').fill('0.14');
 await page.screenshot({path:join(dir,mobile?'mobile.png':'desktop.png'),fullPage:false});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.locator('#demo').click();for(const id of ['heatmapOrderLong','heatmapOrderShort','heatmapOrderLimitLong','heatmapOrderLimitShort'])assert(await page.locator('#'+id).isDisabled(),'DEMO never enables live order buttons');
 const demo=demoHeatmap({symbol:'QUSDT',range:'24h',model:3}),imported={model:3,symbol:'QUSDT',range:'24h',data:{y_axis:demo.y,price_candlesticks:demo.candles.map(c=>[c.time/1000,c.open,c.high,c.low,c.close]),liquidation_leverage_data:demo.cells}};
 await page.locator('[data-import="3"]').setInputFiles({name:'comparison.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});assert.equal(await page.locator('#heatmapOrderLong').isDisabled(),true,'import is not entry authority');
 await context.close();
}
for(const manualOrders of [undefined,{version:'HEATMAP_MANUAL_MARKET_MARGIN_LEVERAGE_V1_20261021',orderTypes:['MARKET','LIMIT'],limitTimeInForce:'GTC'},{version:'HEATMAP_MANUAL_MARKET_LIMIT_GTC_V2_20261022',orderTypes:['MARKET','LIMIT'],limitTimeInForce:'IOC'}]){
 const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));const count=posts.length;
 await page.route('**/api/coinglass-heatmap-lab/status',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({source:'BINANCE_LOCAL',manualOrders})}));
 await page.goto(base+'/coinglass-heatmap-lab.html?symbol=QUSDT&range=24h');await page.waitForFunction(()=>!document.getElementById('heatmapOrderLong').disabled&&document.getElementById('apiState').textContent.includes('Không sử dụng API Coinglass'));
 await page.evaluate(()=>localStorage.setItem('orders_token','mock-session'));await page.locator('#heatmapOrderLimitPrice').fill('0.123');assert(await page.locator('#heatmapOrderLimitLong').isDisabled());
 await page.evaluate(()=>{const button=document.getElementById('heatmapOrderLimitLong');button.disabled=false;button.click();});assert.equal(posts.length,count,'unconfirmed/old backend cannot downgrade a LIMIT request into MARKET');assert.match(await page.locator('#heatmapOrderResult').innerText(),/Backend chưa xác nhận/);await context.close();
}
assert.deepEqual(errors,[]);assert(gets.length>=4);console.log('PASS Heatmap manual desktop/mobile: margin/leverage/LIMIT input, separate MARKET/LIMIT LONG/SHORT confirmation, exact fixed price, no typing/search/demo/import/Enter writes, cross-type pending/reload/unknown guards, GET/no retry/no overflow and fail-closed backend capability. Mock only. Artifacts '+dir);
}finally{release?.();await browser.close();await new Promise(r=>server.close(r));}
