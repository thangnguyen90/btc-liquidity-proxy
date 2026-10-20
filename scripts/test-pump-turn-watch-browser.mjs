import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {injectLocalAiNavigation} from '../src/localAiNavigation.js';
import {plannedPumpZones,livePumpZone,STEP} from '../public/pump-turn-model.js';
let now=Date.now(),end=Math.floor(now/STEP)*STEP;
const rows=Array.from({length:73},(_,i)=>({t:end-(73-i)*STEP,end:end-(72-i)*STEP-1,o:100,c:100,h:101,l:99,v:100,q:10000,buy:5000}));
rows[72]={...rows[72],o:102,c:106,h:107,l:101,q:100000,buy:60000};
const plan=plannedPumpZones('QUSDT',rows)[0];plan.expiresAt=now+STEP;
const near=livePumpZone(plan,{at:now,price:plan.zoneLow*.996},now);
const history={...near,id:'alert:Q',observedAt:now-10000,delivery:{status:'SENT'}};
const fixture={version:'TEST',observeOnly:true,settings:{discordEnabled:true,nearPct:.75},discordConfigured:true,error:null,coverage:{total:525,ready:525,updatedAt:now},rows:[near,{...near,id:'short',symbol:'AGTUSDT',side:'SHORT',state:'FAR',distancePct:3}],history:[history],confirmed:[{id:'confirmed:Q',symbol:'QUSDT',side:'LONG',referencePrice:110,at:now,zoneLow:107,zoneHigh:107.5,checks:[{label:'Đóng vượt đỉnh',pass:true,value:110,unit:' giá'}]}],selected:history};
fixture.binance={masterEnabled:true,routeEnabled:true,maxOpenPositions:20,capScope:'pump-turn-near-short',openSlots:19,slotsCheckedAt:now,enabledAt:now-10000,attempts:[{symbol:'ERAUSDT',side:'SHORT',status:'EXISTING_POSITION',at:now}]};
fixture.binance.attempts.push({symbol:'AGTUSDT',side:'SHORT',status:'ERROR_OR_UNKNOWN',effectiveStatus:'EXCHANGE_REJECTED',errorCode:-2019,reason:'Margin is insufficient.',at:now});
let fail=false,writes=[];const errors=[];
const server=createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/api/pump-turn-watch'){
    if(req.method==='POST'){let body='';for await(const p of req)body+=p;writes.push(JSON.parse(body));fixture.settings=writes.at(-1);}
    res.writeHead(fail?503:200,{'content-type':'application/json'});res.end(JSON.stringify(fixture));return;
  }
  try{const p=u.pathname==='/pump-turn-watch'?'/pump-turn-watch.html':u.pathname;let body=await readFile(resolve('public','.'+p));if(p.endsWith('.html'))body=injectLocalAiNavigation(body.toString());res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(p)]??'text/plain'});res.end(body);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const dir=await mkdtemp(join(tmpdir(),'pump-turn-browser-'));
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],env:{...process.env,LD_LIBRARY_PATH:join(process.cwd(),'.playwright-libs/root/usr/lib/x86_64-linux-gnu')+':'+(process.env.LD_LIBRARY_PATH??'')}});
try{for(const mobile of [false,true]){
  fail=false;const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/pump-turn-watch?signal=alert%3AQ#signals`);
  await page.locator('#rows .signal').waitFor();assert.equal(await page.locator('#rows .signal').count(),1);
  assert.match(await page.locator('#binance-status').innerText(),/Master ON.*rule SHORT ON.*max riêng 20.*19\/20/);assert.match(await page.locator('#binance-attempts').innerText(),/ERAUSDT.*EXISTING_POSITION/);
  assert.match(await page.locator('#binance-attempts').innerText(),/AGTUSDT.*EXCHANGE_REJECTED.*Margin is insufficient/);
  assert.doesNotMatch(await page.locator('#binance-attempts').innerText(),/ERROR_OR_UNKNOWN/,'legacy margin reject is presented as a definite rejection');
  assert.match(await page.locator('#selected').innerText(),/Đã gửi/);
  await page.locator('#view').selectOption('all');assert.equal(await page.locator('#rows .signal').count(),2);
  await page.locator('#side').selectOption('SHORT');assert.match(await page.locator('#rows').innerText(),/AGTUSDT/);assert.doesNotMatch(await page.locator('#rows').innerText(),/QUSDT/);
  await page.locator('#side').selectOption('ALL');await page.locator('#view').selectOption('confirmed');assert.match(await page.locator('#rows').innerText(),/ĐẠT NẾN ĐÓNG/);
  await page.locator('#view').selectOption('near');await page.locator('#rows details summary').click();assert.equal(await page.locator('#rows svg').count(),1);
  await page.screenshot({path:join(dir,mobile?'mobile.png':'desktop.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'no horizontal overflow');
  await page.locator('#discordEnabled').uncheck();await page.locator('#nearPct').fill('1.25');await page.locator('#save').click();await page.locator('#settings-status').filter({hasText:'Đã lưu'}).waitFor();assert.deepEqual(writes.at(-1),{discordEnabled:false,nearPct:1.25});
  fixture.coverage={total:525,ready:3,gap:521,stale:1,updatedAt:Date.now()};
  fixture.warmup={independentOfCoreWarmup:true,busy:true,attempted:6,refreshed:3,failed:3,deferredReason:null};
  await page.locator('#filters button').click();await page.locator('#status').filter({hasText:'Độ phủ dữ liệu chưa đầy đủ: 3/525'}).waitFor();
  assert.match(await page.locator('#warmup-status').innerText(),/độc lập warm-up EMA.*đã thử 6, khôi phục 3/);
  fixture.coverage.updatedAt=Date.now()-60000;await page.locator('#filters button').click();
  await page.locator('#status').filter({hasText:'quá 30 giây'}).waitFor();
  fixture.coverage={total:525,ready:525,updatedAt:Date.now()};
  fail=true;await page.locator('#filters button').click();await page.locator('#status').filter({hasText:'HTTP 503'}).waitFor();assert.match(await page.locator('#rows').innerText(),/QUSDT/);
  await context.close();
}assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,artifacts:dir,writes:writes.length,checks:'desktop/mobile, filters/chart/deep link, saved settings, network error preserves data, no overflow'}));}
finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
