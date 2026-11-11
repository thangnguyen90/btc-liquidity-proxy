import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {PROFILE_RATIO} from '../src/heatmapEntryScenarios.js';
import {HeatmapSweepWatch} from '../src/heatmapSweepWatch.js';
import {HEATMAP_LAB_VERSION} from '../public/coinglass-heatmap-model.js';
import {HeatmapSecondSweepTracker} from '../src/heatmapSecondSweep.js';
import {SECOND_SWEEP_KEY,SECOND_SWEEP_TITLE} from '../public/heatmap-second-sweep-model.js';
import {LONG_QUALITY_LABELS,longQualityKey} from '../public/heatmap-long-quality-model.js';
import {evaluateHeatmapLongQuality} from '../src/heatmapLongQuality.js';
import {longQualityInputs} from './fixtures-heatmap-long-quality.mjs';
import {evaluateUpperMomentum} from '../src/heatmapUpperMomentum.js';
import {upperMomentumKey} from '../public/heatmap-upper-momentum-model.js';
import {evaluateLowerMomentum} from '../src/heatmapLowerMomentum.js';
import {lowerMomentumKey} from '../public/heatmap-lower-momentum-model.js';
import {lowerMomentumInputs} from './fixtures-heatmap-lower-momentum.mjs';
const STEP=300000,dir=await mkdtemp(join(tmpdir(),'heatmap-sweep-browser-')),root=resolve('public'),writes=[],errors=[],sent=[],entries=[];
let manager,now=Date.now(),failRead=false,failWrite=false,secondSweepGate={key:SECOND_SWEEP_KEY,closed:0,avgRoePct:null,eligible:false,enabled:false,allowed:false};
let longQualityGates=[];
let upperMomentumStats=[];
let lowerMomentumStats=[];
const bundle=symbol=>{const at=Math.floor(now/STEP)*STEP-1,d={symbol,source:'BINANCE_LOCAL',range:'24h',step:STEP,end:at+1,candles:[{time:at-STEP+1,close:100}],profiles:Array.from({length:3},(_,i)=>({at:at-(2-i)*STEP,oiFresh:true,mark:true,bins:[96,98,102,104,110].map(p=>[Math.round(Math.log(p)/Math.log(PROFILE_RATIO)),100])}))};return {models:[1,3].map(model=>({model,status:'OK',data:structuredClone(d)}))};};
const snapshot=id=>({...manager.snapshot(id),secondSweepGate,longQualityGates,upperMomentumStats,lowerMomentumStats,binance:{blockLowerContinuation:true,blockUpperContinuation:true,masterEnabled:true,routes:[{side:'SHORT',enabled:true},{side:'LONG',enabled:true}],shortMarginUsdt:5,longMarginUsdt:2,maxPriceDrift:null,priceDriftGuardEnabled:false,openSlots:2,attempts:[]}});
const server=createServer(async(req,res)=>{const u=new URL(req.url,'http://local'),p=u.pathname;try{
 if(p==='/ws/coin-level-analysis'){res.writeHead(503);res.end();return;}
 if(p.startsWith('/api/')){
  let body={};if(p==='/api/heatmap-sweep-watch'){
   if(req.method==='GET'){if(failRead)throw Error('offline fixture');body=snapshot(u.searchParams.get('sweep'));}
   else{let raw='';for await(const r of req)raw+=r;const payload=JSON.parse(raw);writes.push({method:req.method,payload});if(failWrite)throw Error('write fixture');await manager.update(payload);body=snapshot();}
  }else if(p==='/api/live-card-whitelist'&&req.method==='POST'){
   let raw='';for await(const r of req)raw+=r;const payload=JSON.parse(raw),gate=payload.key===SECOND_SWEEP_KEY?secondSweepGate:[...longQualityGates,...upperMomentumStats,...lowerMomentumStats].find(g=>g.key===payload.key);assert(gate?.eligible);writes.push({method:'POST',payload});gate.enabled=payload.enabled;body={enabledKeys:payload.enabled?[payload.key]:[]};
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
 now=Date.now();failRead=false;failWrite=false;secondSweepGate={key:SECOND_SWEEP_KEY,closed:0,avgRoePct:null,eligible:false,enabled:false,allowed:false};
 longQualityGates=[LONG_QUALITY_LABELS.GOOD,LONG_QUALITY_LABELS.BAD].map(label=>({label,key:longQualityKey(label),closed:0,avgRoePct:null,eligible:false,enabled:false,allowed:false}));
 upperMomentumStats=[{state:'CONTINUATION',key:upperMomentumKey('CONTINUATION'),closed:0,avgRoePct:null,eligible:false,enabled:false}];
 lowerMomentumStats=[{state:'NOT_CONFIRMED',key:lowerMomentumKey('NOT_CONFIRMED'),closed:0,avgRoePct:null,eligible:false,enabled:false}];
 manager=new HeatmapSweepWatch({file:join(dir,`${mobile}.json`),getUniverse:()=>['ARCUSDT','BTCUSDT','ETHUSDT'],now:()=>now,loadBundle:async q=>bundle(q.symbol),getLive:()=>({price:100,at:now}),onFullSweep:async e=>{entries.push(e);return {status:'SUBMITTED',orderId:123};},discordSender:async e=>{sent.push(e);return {sent:1,httpStatus:204};}});await manager.init();
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1512,height:1120},isMobile:mobile,hasTouch:mobile}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const before=writes.length;await page.goto(base+'/coinglass-heatmap-lab.html?symbol=ARCUSDT&range=24h#heatmap-sweep');await page.locator('#sweepState').filter({hasText:'Discord riêng đã cấu hình'}).waitFor();
 assert.equal(writes.length,before);assert.equal(manager.watches.length,0,'search alone cannot enable live Discord');
 assert.match(await page.locator('#upperMomentumEntryPolicy').innerText(),/ĐANG CHẶN SHORT TỰ ĐỘNG/);
 assert.match(await page.locator('#lowerMomentumEntryPolicy').innerText(),/ĐANG CHẶN LONG TỰ ĐỘNG/);
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
 assert.equal(await page.locator('#secondSweepWhitelist').isVisible(),false,'no CLOSED sample hides checkbox');
 secondSweepGate={...secondSweepGate,closed:2,avgRoePct:4};await page.locator('#sweepRefresh').click();await page.locator('#secondSweepStats').filter({hasText:'2 lệnh'}).waitFor();assert.equal(await page.locator('#secondSweepWhitelist').isVisible(),false,'4% is not >4%');
 secondSweepGate={...secondSweepGate,avgRoePct:5,eligible:true};await page.locator('#sweepRefresh').click();await page.locator('#secondSweepWhitelist').waitFor();assert.equal(await page.locator('#secondSweepWhitelist').isChecked(),false);
 await page.locator('#secondSweepWhitelist').check();await page.locator('#sweepAction').filter({hasText:'Đã lưu WHITELIST'}).waitFor();await page.locator('#secondSweepStats').filter({hasText:'WHITELIST ON'}).waitFor();assert.deepEqual(writes.at(-1).payload,{key:SECOND_SWEEP_KEY,enabled:true});
 const tracker=new HeatmapSecondSweepTracker(),sample={...e,id:'second-browser',at:now,markPrice:105};tracker.classify({...sample,id:'first-browser',at:now-30000,referencePrice:90,markPrice:100});
 for(const [price,at] of [[120,now-20000],[100,now-10000],[105,now]])tracker.onMark(sample.symbol,price,at);sample.secondSweep=tracker.classify(sample);assert(sample.secondSweep);manager.history.push(sample);
 await page.locator('#sweepRefresh').click();await page.locator('#sweepHistory').filter({hasText:SECOND_SWEEP_TITLE}).waitFor();assert.match(await page.locator('#sweepHistory').innerText(),/đỉnh MARK trước 120/);
 assert.equal(await page.locator('[data-long-quality-key]').count(),0,'no closed AvgROE hides both tier whitelist checkboxes');
 longQualityGates[0]={...longQualityGates[0],closed:3,avgRoePct:5,eligible:true};await page.locator('#sweepRefresh').click();await page.locator('[data-long-quality-key]').waitFor();assert.equal(await page.locator('[data-long-quality-key]').count(),1);assert.equal(await page.locator('[data-long-quality-key]').isChecked(),false);
 await page.locator('[data-long-quality-key]').check();await page.locator('#sweepAction').filter({hasText:'Đã lưu WHITELIST LONG'}).waitFor();assert.deepEqual(writes.at(-1).payload,{key:longQualityKey(LONG_QUALITY_LABELS.GOOD),enabled:true});
 for(const grade of ['GOOD','BAD','UNKNOWN']){const e={...manager.history.find(e=>e.direction==='LOWER'),id:'quality-'+grade,at:now,observedAt:now},low=Math.min(...e.zones.map(z=>z.low));e.markPrice=low*(grade==='GOOD'?.9995:.998);e.longQuality=evaluateHeatmapLongQuality(grade==='UNKNOWN'?{event:e,now}:longQualityInputs(e));manager.history.push(e);}
 await page.locator('#sweepRefresh').click();await page.locator('#sweepHistory .long-quality[data-grade="GOOD"]').waitFor();assert.match(await page.locator('#sweepHistory').innerText(),/size theo phân loại 5 USDT/);assert.match(await page.locator('#sweepHistory').innerText(),/size theo phân loại 1 USDT/);assert.match(await page.locator('#sweepHistory').innerText(),/LONG · CHƯA ĐÁNH GIÁ/);
 await page.locator('#sweepHistory .long-quality[data-grade="GOOD"]').screenshot({path:join(dir,mobile?'quality-mobile.png':'quality-desktop.png')});
 for(const state of ['CONTINUATION','NOT_CONFIRMED','UNKNOWN']){
  const sample={...e,id:'momentum-'+state,at:now,observedAt:now},end=Math.floor(now/STEP)*STEP;
  const coinRows=Array.from({length:21},(_,i)=>{const t=end-(21-i)*STEP,p=90+i;return [t,p-.5,p+.05,p-1,p,100,t+STEP-1,i===20&&state==='CONTINUATION'?2000:1000];});
  sample.upperMomentum=evaluateUpperMomentum({event:sample,now,coinReadAt:now,coinRows:state==='UNKNOWN'?[]:coinRows});manager.history.push(sample);
 }
 await page.locator('#sweepRefresh').click();await page.locator('.upper-momentum[data-state="CONTINUATION"]').waitFor();assert.match(await page.locator('#sweepHistory').innerText(),/CHƯA ĐỦ DẤU HIỆU BƠM TIẾP/);assert.match(await page.locator('#sweepHistory').innerText(),/THIẾU DỮ LIỆU ĐÀ BƠM/);
 await page.locator('#upperMomentumStats').evaluate(el=>el.parentElement.open=true);assert.equal(await page.locator('[data-upper-momentum-key]').count(),0);
 upperMomentumStats[0]={...upperMomentumStats[0],closed:2,avgRoePct:4};await page.locator('#sweepRefresh').click();await page.locator('#upperMomentumStats').filter({hasText:'AvgROE 4%'}).waitFor();assert.equal(await page.locator('[data-upper-momentum-key]').count(),0);
 upperMomentumStats[0]={...upperMomentumStats[0],avgRoePct:5,eligible:true};await page.locator('#sweepRefresh').click();await page.locator('[data-upper-momentum-key]').waitFor();assert.equal(await page.locator('[data-upper-momentum-key]').isChecked(),false);await page.locator('[data-upper-momentum-key]').check();await page.locator('#sweepAction').filter({hasText:'Đã lưu WHITELIST đà bơm'}).waitFor();assert.deepEqual(writes.at(-1).payload,{key:upperMomentumKey('CONTINUATION'),enabled:true});
 await page.locator('.upper-momentum[data-state="CONTINUATION"]').screenshot({path:join(dir,mobile?'momentum-mobile.png':'momentum-desktop.png')});
 for(const state of ['CONTINUATION','NOT_CONFIRMED','UNKNOWN']){const sample={...manager.history.find(e=>e.direction==='LOWER'),id:'lower-momentum-'+state,at:now,observedAt:now},x=lowerMomentumInputs(sample);if(state==='UNKNOWN')x.coinRows=[];if(state==='NOT_CONFIRMED')x.coinRows.at(-1)[7]=100;sample.lowerMomentum=evaluateLowerMomentum(x);sample.binance={status:state==='CONTINUATION'?'LOWER_MOMENTUM_CONTINUATION_BLOCKED':'OFF'};manager.history.push(sample);}
 await page.locator('#sweepRefresh').click();await page.locator('.lower-momentum[data-state="CONTINUATION"]').waitFor();assert.match(await page.locator('#sweepHistory').innerText(),/CHƯA ĐỦ DẤU HIỆU XẢ TIẾP/);assert.match(await page.locator('#sweepHistory').innerText(),/THIẾU DỮ LIỆU ĐÀ XẢ/);assert.match(await page.locator('#sweepHistory').innerText(),/LOWER_MOMENTUM_CONTINUATION_BLOCKED/);
 await page.locator('#lowerMomentumStats').evaluate(el=>el.parentElement.open=true);assert.equal(await page.locator('[data-lower-momentum-key]').count(),0);
 lowerMomentumStats[0]={...lowerMomentumStats[0],closed:2,avgRoePct:4};await page.locator('#sweepRefresh').click();await page.locator('#lowerMomentumStats').filter({hasText:'AvgROE 4%'}).waitFor();assert.equal(await page.locator('[data-lower-momentum-key]').count(),0);
 lowerMomentumStats[0]={...lowerMomentumStats[0],avgRoePct:5,eligible:true};await page.locator('#sweepRefresh').click();await page.locator('[data-lower-momentum-key]').waitFor();assert.equal(await page.locator('[data-lower-momentum-key]').isChecked(),false);await page.locator('[data-lower-momentum-key]').check();await page.locator('#sweepAction').filter({hasText:'Đã lưu WHITELIST đà xả'}).waitFor();assert.deepEqual(writes.at(-1).payload,{key:lowerMomentumKey('NOT_CONFIRMED'),enabled:true});
 await page.locator('.lower-momentum[data-state="CONTINUATION"]').screenshot({path:join(dir,mobile?'lower-momentum-mobile.png':'lower-momentum-desktop.png')});
 await page.locator('#heatmap-sweep').screenshot({path:join(dir,mobile?'market-mobile.png':'market-desktop.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('#sweepMarketToggle').click();await page.locator('#sweepAction').filter({hasText:'Đã tắt toàn thị trường'}).waitFor();await context.close();
}assert.deepEqual(errors,[]);console.log(`PASS Heatmap sweep UI desktop/mobile: explicit opt-in only, fixed zones/progress, partial/all Discord mock, deep link/current coin, no cross-coin history, read/write errors/no retry, DEMO and no overflow. Artifacts ${dir}`);
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
