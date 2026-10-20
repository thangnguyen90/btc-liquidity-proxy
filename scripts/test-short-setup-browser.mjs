import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {resolve,extname,join,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {injectLocalAiNavigation} from '../src/localAiNavigation.js';
import {injectOppositeLiquidityToast} from '../src/oppositeLiquidityToast.js';
const root=resolve('public'),at=Date.now(),id='short-setup:TESTUSDT:FAILED_HIGH:123';
const candles=Array.from({length:40},(_,i)=>({open:101+i*.05,close:101.04+i*.05,high:101.2+i*.05,low:100.8+i*.05,closeTime:at-(40-i)*60000}));
const row={id,symbol:'TESTUSDT',pattern:'FAILED_HIGH',state:'READY',score:85,priorityEligible:true,
  zone:{low:103,high:103.2,touches:2},price:102.5,triggerPrice:102.5,invalidationPrice:104,targetPrice:99,rewardRisk:2.33,
  updatedAt:at,deadline:at+600000,reason:'<img src=x onerror="window.injected=true">',
  context:{pumpGainPct:6,waveVolumeRatio:2.5,ema9:103,ema21:102,rsi14:69,atr:.3},
  volumeRatio:2,takerSellPct:70,factors:[{label:'Đã có nến kích hoạt',points:10}],chart:candles,
  timeline:[{state:'READY',at,reason:'Nến đóng phá đáy từ chối',delivery:{status:'SENT'}}]};
const longRow={...row,id:'long',symbol:'LONGUSDT',side:'LONG',pattern:'FAILED_LOW',score:80,
  triggerPrice:102.5,invalidationPrice:100,targetPrice:108,takerBuyPct:65,
  timeline:[{state:'READY',at,reason:'Nến xanh vượt đỉnh lấy lại hỗ trợ',delivery:{status:'SENT'},discordDelivery:{status:'SENT'}}]};
let enabled=true,early=false,discord=true,fail=false;const errors=[],writes=[];
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path.startsWith('/api/')) {
      if(req.method==='POST'){writes.push(path);let raw='';for await(const chunk of req)raw+=chunk;
        const body=JSON.parse(raw);enabled=body.pushEnabled;early=body.pushEarly;discord=body.discordEnabled;}
      const data=path==='/api/short-setup-watch'?{pushEnabled:enabled,pushEarly:early,discordEnabled:discord,discordConfigured:true,
        binance:{masterEnabled:true,openSlots:3,routes:[{side:'LONG',enabled:true},{side:'SHORT',enabled:true}],attempts:[{id,symbol:'TESTUSDT',side:'SHORT',at,status:'BLOCKED_PRE_SUBMIT',reason:'<img src=x onerror="window.injected=true">'}]},
        coverage:{ready:520,total:525,pumping:8,updatedAt:at},live:[{...row,id:'wait',symbol:'WAITUSDT',state:'WAIT_BREAK',score:99},
          {...row,id:'chase',symbol:'CHASEUSDT',state:'CHASE',score:100},longRow,row],history:[longRow,row],selected:row}
        :path==='/api/opposite-liquidity-web-push/config'?{configured:true,subscriptionCount:0}:{};
      res.writeHead(fail&&path==='/api/short-setup-watch'?503:200,{'content-type':'application/json'});res.end(JSON.stringify(data));return;
    }
    const file=resolve(root,'.'+(path==='/'?'/short-setup-watch.html':decodeURIComponent(path)));
    if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    res.writeHead(200,{'content-type':{'.js':'text/javascript','.css':'text/css','.html':'text/html'}[extname(file)]??'text/plain'});
    const body=await readFile(file);res.end(extname(file)==='.html'?injectOppositeLiquidityToast(injectLocalAiNavigation(body.toString())):body);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const artifacts=await mkdtemp(join(tmpdir(),'short-setup-browser-'));
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],env:{...process.env,
  LD_LIBRARY_PATH:join(process.cwd(),'.playwright-libs/root/usr/lib/x86_64-linux-gnu')+':'+(process.env.LD_LIBRARY_PATH??'')}});
try {
  for(const mobile of [false,true]) {
    enabled=true;early=false;discord=true;fail=false;
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?signal=${encodeURIComponent(id)}`);
    await page.locator('.setup.selected').waitFor();
    assert.equal(await page.locator('.setup').first().getAttribute('data-signal-id'),id,'best eligible READY first');
    assert.equal(await page.locator('.setup').last().getAttribute('data-signal-id'),'chase');
    assert.equal(await page.locator('.setup.selected details').getAttribute('open'),'');
    assert.equal(await page.locator('.setup img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
    assert.equal(await page.locator('[data-live-card-toggle]').count(),0,'no statistics card or trading authority');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
    assert.equal(await page.locator('.setup.selected svg').count(),1);
    assert.match(await page.locator('#binance-status').textContent(),/LONG ON · SHORT ON · max riêng 15/);
    assert.match(await page.locator('#binance-attempts').textContent(),/Bị chặn trước khi gửi/);
    assert.equal(await page.locator('#binance-attempts img').count(),0);
    assert.equal(await page.locator('link[rel="manifest"]').count(),1);
    assert.equal(await page.locator('script[src*="opposite-liquidity-toast.js"]').count(),1);
    assert.equal(await page.locator('.setup.long .direction').textContent(),'LONG');
    assert.match(await page.locator('.setup.long .state').textContent(),/LONG/);
    assert.match(await page.locator('.setup.long').textContent(),/Kháng cự gần nhất/);
    assert.match(await page.locator('#discord-status').textContent(),/đã cấu hình/);
    await page.locator('#side').selectOption('LONG');assert.equal(await page.locator('.setup').count(),2,'long and selected old short');
    await page.locator('#pattern').selectOption('FAILED_LOW');assert.equal(await page.locator('.setup.long').count(),1);
    await page.locator('#side').selectOption('ALL');await page.locator('#pattern').selectOption('ALL');
    await page.locator('#discord-enabled').uncheck();await page.waitForFunction(()=>!document.getElementById('discord-enabled').disabled);
    assert.equal(discord,false);
    await page.locator('#push-early').check();await page.waitForFunction(()=>!document.getElementById('push-early').disabled);
    assert.equal(early,true);await page.locator('#push-enabled').uncheck();
    await page.waitForFunction(()=>!document.getElementById('push-enabled').disabled);assert.equal(enabled,false);
    await page.locator('#pattern').selectOption('BREAK_RETEST');assert.equal(await page.locator('.setup').count(),1,'deep link remains available through filters');
    await page.locator('#pattern').selectOption('ALL');await page.locator('#state').selectOption('WAIT');
    assert.equal(await page.locator('.setup').count(),2);
    await page.locator('#state').selectOption('ALL');
    await page.screenshot({path:join(artifacts,mobile?'mobile.png':'desktop.png'),fullPage:true});
    fail=true;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Không lấy được dữ liệu mới'));
    await context.close();
  }
  assert.equal(errors.length,0,errors.join('\n'));assert.ok(writes.every(p=>p==='/api/short-setup-watch'));
  console.log('PASS SHORT browser: desktop/mobile, ranking, chart, deep link, filters, toggles, XSS, stale API, no Binance writes. Artifacts:',artifacts);
}finally{await browser.close();await new Promise(r=>server.close(r));}
