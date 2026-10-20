import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {join,resolve,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
const root=resolve('public'),at=Date.now(),id='pump-wick:TESTUSDT:123';let enabled=true,fail=false;
const selected={id,symbol:'TESTUSDT',contextMode:'COIN_PUMP',status:'CONFIRMED',pattern:'IMMEDIATE',sweepAt:at-60_000,confirmedAt:at,nextCandleAt:at+1,
  sweepLow:1,level:1.02,price:1.03,takerBuy:.3,reboundPct:3,highToLowDropPct:4,
  pump:{waveGainPct:2.5,waveVolumeRatio:2,killVolumeRatio:3},delivery:{status:'SENT'},reason:'<img src=x onerror="window.injected=true">'};
const errors=[],writes=[];
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path.startsWith('/api/')){
      if(req.method==='POST'){writes.push(path);let raw='';for await(const chunk of req)raw+=chunk;enabled=JSON.parse(raw).enabled;}
      const data=path==='/api/btc-wick-recovery'?{enabled,coverage:{btcRequired:false,pumping:4,ready:400,total:500,updatedAt:at},history:[selected],selected,counts:{CONFIRMED:1}}
        :path==='/api/live-card-whitelist'?{enabledKeys:[]}:path==='/api/btc-liquidation-context'?{state:'WAIT_DATA',reasons:[]}
          :{ollama:{online:false,modelReady:false},evaluation:{btc:{},candidates:[],warnings:[]}};
      res.writeHead(fail&&path==='/api/btc-wick-recovery'?503:200,{'content-type':'application/json'});res.end(JSON.stringify(data));return;
    }
    const file=resolve(root,'.'+(path==='/'?'/local-ai-trend-evaluation.html':decodeURIComponent(path)));
    if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    res.writeHead(200,{'content-type':{'.js':'text/javascript','.css':'text/css','.html':'text/html'}[extname(file)]??'text/plain'});res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const artifacts=await mkdtemp(join(tmpdir(),'btc-wick-browser-'));
const browser=await chromium.launch({headless:true,env:{...process.env,LD_LIBRARY_PATH:join(process.cwd(),'.playwright-libs/root/usr/lib/x86_64-linux-gnu')+':'+(process.env.LD_LIBRARY_PATH??'')}});
try{
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));enabled=true;fail=false;
    await page.goto(`http://127.0.0.1:${server.address().port}/?wick=${encodeURIComponent(id)}#btc-wick-recovery`);
    const panel=page.locator('#btc-wick-recovery');await panel.locator('.wick-selected').waitFor();
    assert.ok((await panel.textContent()).includes('ĐÃ XÁC NHẬN HỒI'));
    assert.ok((await panel.textContent()).includes('không cần BTC giảm'));
    assert.ok((await panel.textContent()).includes('Hồi 3% từ đáy râu'));
    assert.equal(await panel.locator('[data-live-card-key="coin-pump-wick-recovery:IMMEDIATE"]').count(),1);
    assert.equal(await panel.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
    assert.equal(await panel.locator('[data-live-card-toggle]').count(),0,'no closed AvgROE checkbox');
    assert.equal(await panel.locator('[data-wick-history-details]').getAttribute('open'),'');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
    assert.ok(await panel.locator('[data-wick-enabled]').isChecked());await panel.locator('[data-wick-enabled]').uncheck();
    await page.waitForFunction(()=>!document.querySelector('[data-wick-enabled]').disabled);
    assert.equal(enabled,false);assert.equal(await panel.locator('[data-wick-enabled]').isChecked(),false);
    await panel.screenshot({path:join(artifacts,mobile?'mobile.png':'desktop.png')});
    fail=true;await page.evaluate(async()=>{await import('/btc-wick-recovery.js?v=20261010-discord-v1');document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>document.querySelector('[data-wick-status]').textContent.includes('Không lấy được dữ liệu mới'));
    await context.close();
  }
  assert.equal(errors.length,0,errors.join('\n'));assert.ok(writes.every(p=>p==='/api/btc-wick-recovery'),'no Binance writes');
  console.log('PASS wick browser: desktop/mobile, selected deep-link, escaped data, toggle/error, no Binance or overflow. Artifacts:',artifacts);
}finally{await browser.close();await new Promise(r=>server.close(r));}
