import {buildEarlyFlowZone,captureEarlyFlowContext,buildEarlyShortZone,captureEarlyShortContext} from '../public/pump-turn-early-short-model.js';
import {captureLongContext,LONG_CONTEXT_TITLES} from '../public/pump-turn-long-context-model.js';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {capturePumpTurnContext,PUMP_TURN_CONTEXT_TITLES,pumpTurnContextKey} from '../public/pump-turn-context-model.js';
const snapshot=JSON.parse(await readFile('data/research/pump-turn-near-eval-20261028/cohort.json','utf8'));
const events=Object.keys(PUMP_TURN_CONTEXT_TITLES).map(label=>{
 const e=snapshot.events.find(x=>capturePumpTurnContext(x).label===label);assert.ok(e);
 return {...e,nearContext:capturePumpTurnContext(e),delivery:{status:'SENT'}};
});
const longBase={...events[0],side:'LONG',id:'long-fixture',state:'NEAR',livePrice:100,zoneLow:100.1,zoneHigh:100.6,gain60:5,preBuyPct:60,preVolumeX:2,nearContext:undefined};
for(const patch of [{},{preVolumeX:1.5},{gain60:10},{preBuyPct:52},{preBuyPct:null}]){const e={...longBase,...patch,id:'long-'+events.length};e.longContext=captureLongContext(e);events.push(e);}
const earlyStep=300000,earlyT=Math.floor(Date.now()/earlyStep)*earlyStep,earlyAt=earlyT+120000;
const earlyRows=Array.from({length:73},(_,i)=>({t:earlyT-(73-i)*earlyStep,end:earlyT-(72-i)*earlyStep-1,o:100,h:100.3,l:99.7,c:100,v:1000,q:100000,buy:50000}));
const early={...buildEarlyShortZone('EARLYUSDT',earlyRows,{openTime:earlyT,closeTime:earlyT+earlyStep-1,open:100,high:100,low:99.6,close:99.6,quoteVolume:100000,takerBuyQuoteVolume:40000,isClosed:false},{price:99.6,at:earlyAt},earlyAt),
 id:'early-browser',observedAt:earlyAt,earlyFirstAt:earlyAt-10000,earlySustainMs:10000,earlySamples:2,delivery:{status:'SENT'}};
early.earlyShortContext=captureEarlyShortContext(early);events.push(early);
const earlyLong={...buildEarlyFlowZone('EARLYLONGUSDT',earlyRows,{openTime:earlyT,closeTime:earlyT+earlyStep-1,
 open:100,high:100.4,low:100,close:100.4,quoteVolume:100000,takerBuyQuoteVolume:60000,isClosed:false},
 {price:100.4,at:earlyAt},earlyAt),id:'early-long-browser',observedAt:earlyAt,earlyFirstAt:earlyAt-10000,
 earlySustainMs:10000,earlySamples:2,delivery:{status:'SENT'}};
earlyLong.earlyLongContext=captureEarlyFlowContext(earlyLong);events.push(earlyLong);
const legacy={...events[0],id:'legacy',nearContext:undefined};
const fixture={version:'TEST',settings:{discordEnabled:true,nearPct:.75},discordConfigured:true,coverage:{total:5,ready:5,updatedAt:Date.now()},rows:events,history:events,confirmed:[],selected:legacy,
 contextStats:Object.keys(PUMP_TURN_CONTEXT_TITLES).map(label=>({key:pumpTurnContextKey(label),label,closed:label==='BUY_PRESSURE'?20:label==='SELL_PRESSURE'?10:0,avgRoePct:label==='BUY_PRESSURE'?5.1:label==='SELL_PRESSURE'?4:null,eligible:label==='BUY_PRESSURE'||label==='SELL_PRESSURE',enabled:false}))};
const writes=[],errors=[];
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/api/pump-turn-watch'){fixture.coverage.updatedAt=Date.now();res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(fixture));return;}
 if(u.pathname==='/api/live-card-whitelist'){
  let body='';for await(const chunk of req)body+=chunk;const update=JSON.parse(body);writes.push(update);
  const row=fixture.contextStats.find(g=>g.key===update.key);assert.ok(row);assert.ok(!update.enabled||row.avgRoePct>4);row.enabled=update.enabled;
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({enabledKeys:fixture.contextStats.filter(g=>g.enabled).map(g=>g.key)}));return;
 }
 try{const p=u.pathname==='/pump-turn-watch'?'/pump-turn-watch.html':u.pathname;const content=await readFile(resolve('public','.'+p));res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(p)]??'text/plain'});res.end(content);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const dir=await mkdtemp(join(tmpdir(),'pump-context-browser-'));
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],env:{...process.env,LD_LIBRARY_PATH:join(process.cwd(),'.playwright-libs/root/usr/lib/x86_64-linux-gnu')+':'+(process.env.LD_LIBRARY_PATH??'')}});
try{
 for(const mobile of [false,true]){
  fixture.contextStats.forEach(s=>s.enabled=false);
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1100}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/pump-turn-watch?signal=legacy`);
  await page.locator('#rows .signal').first().waitFor();
  assert.equal(await page.locator('#rows .short-context').count(),12);
  assert.match(await page.locator('#rows [data-id="early-browser"]').innerText(),/SHORT SỚM/);
  assert.match(await page.locator('#rows [data-id="early-browser"]').innerText(),/volume theo thời gian/);
  assert.ok(!(await page.locator('#rows [data-id="early-browser"]').innerText()).includes('đáy12 nến'));
  const earlyLongText=await page.locator('#rows [data-id="early-long-browser"]').innerText();
  assert.match(earlyLongText,/LONG SỚM/);
  assert.match(earlyLongText,/ÁP LỰC MUA ĐANG HÌNH THÀNH/);
  assert.match(earlyLongText,/kháng cự/);
  assert.doesNotMatch(earlyLongText,/tăng60m ≥8%/);
  for(const title of [...Object.values(PUMP_TURN_CONTEXT_TITLES),...Object.values(LONG_CONTEXT_TITLES)])assert.ok((await page.locator('#rows').innerText()).includes(title));
  assert.match(await page.locator('#selected').innerText(),/THIẾU DỮ LIỆU.*Chưa có bản phân loại hợp lệ/s);
  const inputs=page.locator('#context-stats input[data-context-key]');assert.equal(await inputs.count(),1,'exactly 4% must not show checkbox even if eligible flag is wrong');
  assert.equal(await inputs.first().getAttribute('data-context-key'),pumpTurnContextKey('BUY_PRESSURE'));
  assert.equal(await inputs.first().isChecked(),false,'default OFF');
  await inputs.first().check();await page.locator('#context-status').filter({hasText:'Đã lưu WHITELIST'}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#context-stats input')?.checked===true&&!document.querySelector('#context-stats input')?.disabled);
  assert.deepEqual(writes.at(-1),{key:pumpTurnContextKey('BUY_PRESSURE'),enabled:true});
  await inputs.first().uncheck();await page.waitForFunction(()=>document.querySelector('#context-stats input')?.checked===false&&!document.querySelector('#context-stats input')?.disabled);
  await page.screenshot({path:join(dir,mobile?'mobile.png':'desktop.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,artifacts:dir,checks:'five labels + frozen metrics + legacy UNKNOWN; default OFF/>4 checkbox; exact matching POST key; desktop/mobile/no overflow'}));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
