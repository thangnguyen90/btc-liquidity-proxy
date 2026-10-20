import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {WEAK_ALT_VERSION as version,WEAK_ALT_STATES,WEAK_ALT_THEMES,COUNTERTREND_VERSION,COUNTERTREND_LABELS,COIN_RELATION_VERSION,COIN_RELATION_LABELS} from '../public/weak-alt-rebound-model.js';
import {BTC_ALT_STRUCTURE_VERSION,BTC_ALT_STRUCTURE_LABELS} from '../public/btc-alt-structure-model.js';
import {BTC_ALT_REACTION_VERSION,BTC_ALT_REACTION_LABELS} from '../public/btc-alt-reaction-model.js';
let fail=false;const at=Date.now(),id='weak-alt:fixture:FRAGILE_REBOUND';
const fixture={version,state:'FRAGILE_REBOUND',ready:true,enabled:true,evaluatedAt:at,closedAt:at-1000,
  coverage:{ready:120,universe:120,betaReady:110},btc:{ret15m:.15,ret1h:.12},
  breadth:{belowEma20Pct:89.2,down3hPct:86.7,alignedUpPct:4.2,recoveryWeakPct:75,fragilePct:35,volumeReady:112,higherLowPct:8},
  conditions:[{met:true,label:'Breadth yếu'},{met:false,label:'<img src=x onerror="window.injected=true">'}],
  coins:[{symbol:'TESTUSDT',ret1h:-.2,ret3h:-1,aboveEma20:false,volumeRecoveryRatio:.6,betaUp:.4,betaDown:2,upN:30,downN:40,fragile:true}],
  history:[{id,at:at-1000,state:'FRAGILE_REBOUND',btc:{ret15m:.15,ret1h:.12},breadth:{belowEma20Pct:89.2,recoveryWeakPct:75,fragilePct:35},delivery:{status:'QUIET_HOURS'}}]};
const countertrend={version:COUNTERTREND_VERSION,ready:true,btcDown:true,
  counts:Object.fromEntries(Object.keys(COUNTERTREND_LABELS).map(t=>[t,1])),
  coins:Object.keys(COUNTERTREND_LABELS).reverse().map((tier,i)=>({symbol:`LEADER${i}USDT`,tier,basis:'1h',btcReturn:-1,coinReturn:1,relativeStrengthPct:2,ret1h:1,ret3h:3,
    price:.02,ema20:.019,ema50:.018,higherLow:true,volumeRatio:2,takerBuyPct:65,oi:{covered:false},shortLiquidation:{covered:i===0,usd:1500,count:2},
    closedAt:at-1000,conditions:[{met:false,label:'<img src=x onerror="window.injected=true">'}],note:'Mẫu quan sát, không phải tổng thanh lý hay tín hiệu vào lệnh.'}))};
const writes=[],errors=[],publicRoot=resolve('public');
const relationCoins=Object.keys(COIN_RELATION_LABELS).flatMap((group,i)=>Array.from({length:5},(_,j)=>({group,symbol:`MATRIX${i}${j}USDT`,basis:'1h',btcReturn:-.5,coinReturn:i%2?.2:-1,amplitudeRatio:2,relativeStrengthPct:.7,ret1h:.2,ret3h:.5,price:1,ema20:.9,ema50:.8})));
const matrixFixture={version:COIN_RELATION_VERSION,ready:true,total:40,basis:'1h',btcReturn:-.5,counts:Object.fromEntries(Object.keys(COIN_RELATION_LABELS).map(g=>[g,5])),coins:relationCoins};
const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(req.method!=='GET'){writes.push(path);res.writeHead(405);res.end();return;}
  if(path.startsWith('/api/')){const result=path==='/api/weak-alt-rebound'?fixture:path==='/api/live-card-whitelist'?{enabledKeys:[]}
    :{ollama:{online:false,modelReady:false},evaluation:{btc:{},candidates:[],warnings:[]}};
    res.writeHead(fail&&path==='/api/weak-alt-rebound'?503:200,{'content-type':'application/json'});res.end(JSON.stringify(result));return;}
  const file=resolve(publicRoot,'.'+decodeURIComponent(path));if(!file.startsWith(publicRoot+sep)){res.writeHead(403);res.end();return;}
  res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[extname(file)]??'text/plain'});res.end(await readFile(file));
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const screenshots=await mkdtemp(join(tmpdir(),'weak-alt-browser-'));
const libs=join(process.cwd(),'.playwright-libs/root/usr/lib/x86_64-linux-gnu');
const browser=await chromium.launch({headless:true,env:{...process.env,LD_LIBRARY_PATH:[existsSync(libs)?libs:'',process.env.LD_LIBRARY_PATH??''].filter(Boolean).join(':')}});
try{for(const name of ['local-ai-trend-evaluation','rising-volume-watch'])for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));fail=false;
  await page.goto(`${base}/${name}.html?weakAlt=${encodeURIComponent(id)}`);await page.waitForSelector('#weak-alt-rebound[data-state="FRAGILE_REBOUND"]');
  const root=page.locator('#weak-alt-rebound');assert.equal(await root.getAttribute('data-live-card-key'),'weak-alt-rebound:FRAGILE_REBOUND');
  assert.equal(await root.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(53, 19, 43)');
  assert.equal(await root.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
  assert.equal(await root.locator('[data-live-card-toggle]').count(),0);assert((await root.textContent()).includes('Giờ yên lặng'));
  assert(await root.locator('[data-weak-history-details]').getAttribute('open')!==null,'deep link opens exact history');
  await page.evaluate(()=>{const r=document.querySelector('#weak-alt-rebound');r.dataset.binanceCardAvgRoe='4';r.append(document.createTextNode(''));});
  await page.waitForTimeout(40);assert.equal(await root.locator('[data-live-card-toggle]').count(),0);
  await page.evaluate(()=>{const r=document.querySelector('#weak-alt-rebound');r.dataset.binanceCardAvgRoe='4.01';r.append(document.createTextNode(''));});
  await page.waitForSelector('#weak-alt-rebound [data-live-card-toggle]');
  assert.equal(await root.locator('[data-live-card-toggle]').getAttribute('data-key'),'weak-alt-rebound:FRAGILE_REBOUND');assert.equal(await root.locator('[data-live-card-toggle]').isChecked(),false);
  await page.evaluate(async fixture=>{const m=await import('/weak-alt-rebound.js?v=20261014-phase-v2');m.renderWeakAlt({...fixture,state:'WEAK_REBOUND'});},fixture);
  assert.equal(await root.getAttribute('data-live-card-key'),'weak-alt-rebound:WEAK_REBOUND');
  assert.equal(await root.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(36, 19, 62)');
  await page.evaluate(()=>window.scrollTo(0,0));await root.screenshot({path:join(screenshots,`${name}-${mobile?'mobile':'desktop'}.png`)});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'no horizontal overflow');
  const colors=[];
  for(const state of WEAK_ALT_STATES){
    await page.evaluate(async({fixture,state})=>{const m=await import('/weak-alt-rebound.js?v=20261014-phase-v2');m.renderWeakAlt({...fixture,state});},{fixture,state});
    assert.equal(await root.getAttribute('data-live-card-key'),`weak-alt-rebound:${state}`);
    assert.equal(await root.evaluate(el=>el.style.getPropertyValue('--weak-accent')),WEAK_ALT_THEMES[state].accent);
    colors.push(await root.evaluate(el=>getComputedStyle(el).backgroundColor));
    assert.equal(await root.locator('[data-live-card-toggle]').count(),0);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  }
  assert.equal(new Set(colors).size,8);
  await page.evaluate(async({fixture,countertrend})=>{const m=await import('/weak-alt-rebound.js?v=20261014-phase-v2');m.renderWeakAlt({...fixture,state:'BTC_DOWN_ALT_WEAK',countertrend});},{fixture,countertrend});
  const list=root.locator('[data-weak-countertrend]'),cards=list.locator('.weak-counter-coin');
  await root.locator('[data-weak-old-counter]').evaluate(el=>el.open=true);
  assert.equal(await cards.count(),4,'all countertrend tiers visible despite red overall market');
  assert.equal(await cards.first().getAttribute('data-tier'),'SHORT_LIQ_OBSERVED');
  assert((await list.textContent()).includes('thiếu/gap'));assert((await list.textContent()).includes('1.500 USDT'));
  assert.equal(await list.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
  const tierColors=[];
  for(const card of await cards.all()){
    tierColors.push(await card.evaluate(el=>getComputedStyle(el).borderLeftColor));
    const key=await card.getAttribute('data-live-card-key');
    assert(key.startsWith('weak-alt-coin:'));
    await card.evaluate(el=>{el.dataset.binanceCardAvgRoe='4';el.append(document.createTextNode(''));});
    await page.waitForTimeout(40);assert.equal(await card.locator('[data-live-card-toggle]').count(),0);
    await card.evaluate(el=>{el.dataset.binanceCardAvgRoe='4.01';el.append(document.createTextNode(''));});
    await card.locator('[data-live-card-toggle]').waitFor();
    assert.equal(await card.locator('[data-live-card-toggle]').getAttribute('data-key'),key);
    assert.equal(await card.locator('[data-live-card-toggle]').isChecked(),false);
  }
  assert.equal(new Set(tierColors).size,4,'different tier colors');
  await page.evaluate(async({fixture,matrixFixture,countertrend})=>{const m=await import('/weak-alt-rebound.js?v=20261014-phase-v2');m.renderWeakAlt({...fixture,state:'BTC_DOWN_ALT_WEAK',coinRelations:matrixFixture,countertrend});},{fixture,matrixFixture,countertrend});
  const matrix=root.locator('[data-weak-relations]');
  await root.locator('[data-weak-old-matrix]').evaluate(el=>el.open=true);
  assert.equal(await matrix.locator('[data-relation-symbol]').count(),40,'all coins beyond old30 cap');
  assert.equal(await matrix.locator('[data-relation-group]').count(),8);
  const matrixColors=[];
  for(const card of await matrix.locator('[data-relation-group]').all()){
    matrixColors.push(await card.evaluate(el=>getComputedStyle(el).borderLeftColor));
    const key=await card.getAttribute('data-live-card-key');
    await card.evaluate(el=>{el.dataset.binanceCardAvgRoe='4';el.append(document.createTextNode(''));});await page.waitForTimeout(40);
    assert.equal(await card.locator('[data-live-card-toggle]').count(),0);
    await card.evaluate(el=>{el.dataset.binanceCardAvgRoe='4.01';el.append(document.createTextNode(''));});await card.locator('[data-live-card-toggle]').waitFor();
    assert.equal(await card.locator('[data-live-card-toggle]').getAttribute('data-key'),key);assert.equal(await card.locator('[data-live-card-toggle]').isChecked(),false);
  }
  assert.equal(new Set(matrixColors).size,8);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  await matrix.screenshot({path:join(screenshots,`${name}-matrix-${mobile?'mobile':'desktop'}.png`)});
  await root.screenshot({path:join(screenshots,`${name}-counter-${mobile?'mobile':'desktop'}.png`)});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  await page.evaluate(async({fixture,countertrend})=>{const m=await import('/weak-alt-rebound.js?v=20261014-phase-v2');m.renderWeakAlt({...fixture,countertrend:{...countertrend,coins:[],counts:{}}});},{fixture,countertrend});
  assert((await list.textContent()).includes('Chưa có coin đủ điều kiện'));
  await page.evaluate(async({fixture,countertrend})=>{const m=await import('/weak-alt-rebound.js?v=20261014-phase-v2');m.renderWeakAlt({...fixture,countertrend:{...countertrend,btcDown:false}});},{fixture,countertrend});
  assert.equal(await cards.count(),0);assert((await list.textContent()).includes('BTC chưa giảm'));
  await page.evaluate(async fixture=>{const m=await import('/weak-alt-rebound.js?v=20261014-phase-v2');m.renderWeakAlt({...fixture,state:'NORMAL'});},fixture);
  assert.equal(await root.getAttribute('data-live-card-key'),null);assert.equal(await root.locator('[data-live-card-toggle]').count(),0);
  assert((await list.textContent()).includes('mẫu cũ không được tự gán nhãn'));
  assert((await matrix.textContent()).includes('Không gán nhóm từ JSON cũ'));assert.equal(await matrix.locator('[data-relation-symbol]').count(),0);
  const profile={ready:true,state:'SIDEWAYS',ret1h:.62,ret3h:.2,ret6h:.1,ret24h:.4,efficiency:.1,atr15mPct:.3,closedAt:at-1000,conditions:[]};
  const reaction={version:BTC_ALT_REACTION_VERSION,ready:true,context:{ready:true,direction:'DOWN',anchorAt:at-180000,endAt:at,btcReturn:-1,mode:'LIVE_PREVIEW'},coverage:{ready:8},total:9};
  const structureCoins=Object.keys(BTC_ALT_REACTION_LABELS).map((group,i)=>({symbol:i===0?'QUSDT':`CASE${i}USDT`,group:Object.keys(BTC_ALT_STRUCTURE_LABELS)[i%5],profile:{...profile,state:Object.keys(BTC_ALT_STRUCTURE_LABELS)[i%5]},relation:'BTC đi ngang · xem nền coin độc lập',reaction:{group,ready:group!=='DATA_MISSING',btcReturn:-1,coinReturn:i===0?0:-1,relativeStrengthPct:1,anchorPrice:1,price:1,priceAt:at}}));
  const coinStructure={version:BTC_ALT_STRUCTURE_VERSION,ready:true,btc:profile,total:9,coins:structureCoins,counts:Object.fromEntries(Object.keys(BTC_ALT_STRUCTURE_LABELS).map(g=>[g,structureCoins.filter(x=>x.group===g).length]))};
  await page.evaluate(async({fixture,coinStructure,btcReaction})=>{const m=await import('/weak-alt-rebound.js?v=20261014-phase-v2');m.renderWeakAlt({...fixture,state:'WAIT_DATA',ready:false,coinStructure,btcReaction});},{fixture,coinStructure,btcReaction:reaction});
  const structure=root.locator('[data-weak-structure]');
  assert((await structure.textContent()).includes('Đi ngang / chưa có trend rõ'));assert((await structure.textContent()).includes('LIVE TẠM THỜI'));
  assert((await structure.locator('[data-reaction-symbol="QUSDT"]').textContent()).includes('Giữ giá'));
  assert.equal(await structure.locator('[data-structure-symbol]').count(),9,'individual evidence remains visible during general market warmup');
  await root.locator('[data-weak-old-matrix]').evaluate(el=>el.open=false);
  await root.locator('[data-weak-old-counter]').evaluate(el=>el.open=false);
  for(const card of await structure.locator('[data-live-card-key]').all()){
    const key=await card.getAttribute('data-live-card-key');
    await card.evaluate(el=>{el.dataset.binanceCardAvgRoe='4';el.append(document.createTextNode(''));});await page.waitForTimeout(30);assert.equal(await card.locator(':scope > .live-card-toggle').count(),0);
    await card.evaluate(el=>{el.dataset.binanceCardAvgRoe='4.01';el.append(document.createTextNode(''));});await card.locator(':scope > .live-card-toggle').waitFor();
    assert.equal(await card.locator(':scope > .live-card-toggle input').getAttribute('data-key'),key);assert.equal(await card.locator(':scope > .live-card-toggle input').isChecked(),false);
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  await structure.screenshot({path:join(screenshots,`${name}-structure-${mobile?'mobile':'desktop'}.png`)});
  await page.evaluate(async()=>{const m=await import('/weak-alt-rebound.js?v=20261014-phase-v2');m.renderWeakAlt({version:'LEGACY',ready:true,state:'FRAGILE_REBOUND'});});
  assert.equal(await root.getAttribute('data-state'),'WAIT_DATA');assert.equal(await root.locator('[data-weak-enabled]').isDisabled(),true);
  await context.close();
}assert.deepEqual(writes,[],'no actual API mutations/order tests');assert.deepEqual(errors,[]);
console.log(`Weak ALT browser desktop/mobile, both pages, 8 market colors + 4 countertrend tiers under red market, deep-link, XSS, whitelist4/4.01/defaultOFF, legacy/empty/nooverflow PASS · ${screenshots}`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
