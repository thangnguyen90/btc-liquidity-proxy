import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {PROFILE_RATIO} from '../src/heatmapEntryScenarios.js';
import {HeatmapSweepWatch} from '../src/heatmapSweepWatch.js';
import {HEATMAP_LAB_VERSION} from '../public/coinglass-heatmap-model.js';
const STEP=300000,dir=await mkdtemp(join(tmpdir(),'heatmap-sweep-browser-')),root=resolve('public'),writes=[],errors=[],sent=[],entries=[];
let manager,now=Date.now(),failRead=false,failWrite=false;
const bundle=symbol=>{const at=Math.floor(now/STEP)*STEP-1,d={symbol,source:'BINANCE_LOCAL',range:'24h',step:STEP,end:at+1,candles:[{time:at-STEP+1,close:100}],profiles:Array.from({length:3},(_,i)=>({at:at-(2-i)*STEP,oiFresh:true,mark:true,bins:[96,98,102,104,110].map(p=>[Math.round(Math.log(p)/Math.log(PROFILE_RATIO)),100])}))};return {models:[1,3].map(model=>({model,status:'OK',data:structuredClone(d)}))};};
const snapshot=id=>({...manager.snapshot(id),binance:{masterEnabled:true,routes:[{side:'SHORT',enabled:true},{side:'LONG',enabled:true}],shortMarginUsdt:5,longMarginUsdt:2,maxPriceDrift:null,priceDriftGuardEnabled:false,openSlots:2,attempts:[]}});
const server=createServer(async(req,res)=>{const u=new URL(req.url,'http://local'),p=u.pathname;try{
 if(p==='/ws/coin-level-analysis'){res.writeHead(503);res.end();return;}
 if(p.startsWith('/api/')){
  let body={};if(p==='/api/heatmap-sweep-watch'){
   if(req.method==='GET'){if(failRead)throw Error('offline fixture');body=snapshot(u.searchParams.get('sweep'));}
   else{let raw='';for await(const r of req)raw+=r;const payload=JSON.parse(raw);writes.push({method:req.method,payload});if(failWrite)throw Error('write fixture');await manager.update(payload);body=snapshot();}
  }else if(p==='/api/coinglass-heatmap-lab/status')body={version:HEATMAP_LAB_VERSION,source:'BINANCE_LOCAL'};
  else if(p==='/api/coinglass-heatmap-lab')body={version:HEATMAP_LAB_VERSION,models:[1,3].map(model=>({model,status:'MISSING'}))};
  else if(p==='/api/manual-price-push-alerts')body={alerts:[],activeCount:0,triggeredCount:0,maxActive:50};
  else assert.equal(req.method,'GET');
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(body));return;
 }
 const file=resolve(root,'.'+p);if(!file.startsWith(root+sep))throw Error('path');res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(file)]??'text/plain'});res.end(await readFile(file));
}catch(e){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,env:{...process.env,LD_LIBRARY_PATH:join(process.cwd(),'.playwright-libs/root/usr/lib/x86_64-linux-gnu')+':'+(process.env.LD_LIBRARY_PATH??'')}});
try{for(const mobile of [false,true]){
 now=Date.now();failRead=false;failWrite=false;
 manager=new HeatmapSweepWatch({file:join(dir,`${mobile}.json`),getUniverse:()=>['ARCUSDT','BTCUSDT','ETHUSDT'],now:()=>now,loadBundle:async q=>bundle(q.symbol),getLive:()=>({price:100,at:now}),onFullSweep:async e=>{entries.push(e);return {status:'SUBMITTED',orderId:123};},discordSender:async e=>{sent.push(e);return {sent:1,httpStatus:204};}});await manager.init();
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1512,height:1120},isMobile:mobile,hasTouch:mobile}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const before=writes.length;await page.goto(base+'/coinglass-heatmap-lab.html?symbol=ARCUSDT&range=24h#heatmap-sweep');await page.locator('#sweepState').filter({hasText:'Discord riêng đã cấu hình'}).waitFor();
 assert.equal(writes.length,before);assert.equal(manager.watches.length,0,'search alone cannot enable live Discord');
 await page.locator('#sweepDistance').fill('5.5');await page.locator('#sweepToggle').click();await page.locator('#sweepAction').filter({hasText:'Đã bật'}).waitFor();
 assert.deepEqual(writes.at(-1),{method:'POST',payload:{symbol:'ARCUSDT',viewRange:'24h',enabled:true,maxDistancePct:5.5}});
 await manager.scan();await page.locator('#sweepRefresh').click();await page.locator('#sweepState').filter({hasText:'ARMED'}).waitFor();assert.match(await page.locator('#sweepProgress').innerText(),/0\/2 cụm/);
 const c=manager.watches[0].cohort;now+=1000;await manager.onMark({symbol:'ARCUSDT',markPrice:c.zones[0].high+.001,eventTime:now});await page.locator('#sweepRefresh').click();await page.locator('.sweep-event').waitFor();assert.match(await page.locator('#sweepHistory').innerText(),/QUÉT HẾT CỤM PHÍA TRÊN/);
 now+=1000;await manager.onMark({symbol:'ARCUSDT',markPrice:c.zones[1].high+.001,eventTime:now});await page.locator('#sweepRefresh').click();await page.locator('#sweepProgress').filter({hasText:'2/2 cụm'}).waitFor();assert.equal(await page.locator('.sweep-event').count(),2);
 const e=manager.history.at(-1);await page.goto(base+`/coinglass-heatmap-lab.html?symbol=ARCUSDT&range=24h&sweep=${encodeURIComponent(e.id)}#heatmap-sweep`);await page.waitForSelector('.sweep-event.is-selected');
 assert.match(await page.locator('#heatmap-sweep h2').innerText(),/SHORT 5\$.*LONG 2\$/);
 assert.match(await page.locator('#sweepBinance').innerText(),/SHORT ON · LONG ON/);assert.match(await page.locator('#sweepBinance').innerText(),/SHORT 5 \/ LONG 2 USDT/);assert.match(await page.locator('#sweepBinance').innerText(),/2\/20/);
 assert.match(await page.locator('#sweepBinance').innerText(),/Không chặn lệch giá so với tín hiệu/);assert.match(await page.locator('#heatmap-sweep').textContent(),/không vào bù tín hiệu cũ/);
 now+=1000;await manager.onMark({symbol:'ARCUSDT',markPrice:95,eventTime:now});await page.locator('#sweepRefresh').click();await page.locator('#sweepHistory').filter({hasText:'PHÍA DƯỚI → LONG'}).waitFor();
 assert.equal(await page.locator('.sweep-event').count(),3);assert.match(await page.locator('#sweepHistory').innerText(),/Binance SUBMITTED · orderId 123/);assert.match(await page.locator('#sweepHistory').innerText(),/OBSERVE ONLY/);
 await page.locator('#heatmap-sweep').screenshot({path:join(dir,mobile?'mobile.png':'desktop.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 failRead=true;await page.locator('#sweepRefresh').click();await page.locator('#sweepState').filter({hasText:'Chưa đồng bộ'}).waitFor();assert.equal(await page.locator('.sweep-event').count(),3);failRead=false;
 await page.locator('#sweepToggle').click();await page.locator('#sweepAction').filter({hasText:'Đã tắt'}).waitFor();assert.equal(manager.watches[0].enabled,false);
 await page.locator('#symbol').fill('BTC');assert.equal(await page.locator('#sweepToggle').isDisabled(),true);await page.locator('#symbol').press('Enter');await page.locator('#sweepCoin').filter({hasText:'BTCUSDT'}).waitFor();assert.equal(await page.locator('.sweep-event').count(),0,'old-coin history is not mixed into new search');
 await page.locator('#sweepDistance').fill('0');const n=writes.length;await page.locator('#sweepToggle').click();assert.equal(writes.length,n);
 await page.locator('#sweepDistance').fill('5');failWrite=true;await page.locator('#sweepToggle').click();await page.locator('#sweepAction').filter({hasText:'Chưa xác nhận'}).waitFor();assert.equal(writes.length,n+1);failWrite=false;
 await page.locator('#demo').click();assert.equal(await page.locator('#sweepToggle').isDisabled(),true);
 await page.locator('#sweepMarketToggle').click();await page.locator('#sweepAction').filter({hasText:'Đã bật toàn thị trường'}).waitFor();
 assert.equal(manager.watches.length,3);assert.match(await page.locator('#sweepCoverage').innerText(),/TOÀN BỘ BINANCE FUTURES USDT/);assert.equal(await page.locator('#sweepToggle').isDisabled(),true);
 assert.equal(await page.locator('.sweep-event').count(),3,'market history includes ARC even when search is DEMO/other symbol');
 await page.locator('#heatmap-sweep').screenshot({path:join(dir,mobile?'market-mobile.png':'market-desktop.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('#sweepMarketToggle').click();await page.locator('#sweepAction').filter({hasText:'Đã tắt toàn thị trường'}).waitFor();await context.close();
}assert.deepEqual(errors,[]);console.log(`PASS Heatmap sweep UI desktop/mobile: explicit opt-in only, fixed zones/progress, partial/all Discord mock, deep link/current coin, no cross-coin history, read/write errors/no retry, DEMO and no overflow. Artifacts ${dir}`);
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
