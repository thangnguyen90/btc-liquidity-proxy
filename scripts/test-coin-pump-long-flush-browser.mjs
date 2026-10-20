import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {join,resolve,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
const root=resolve('public'),at=Date.now(),id='pump-long-flush:TESTUSDT:123';let enabled=true,fail=false;
const selected={id,symbol:'TESTUSDT',status:'CONFIRMED',pattern:'FLUSH_RECLAIM',confirmedAt:at,
  high:102.6,low:100,price:102.3,support:101.67,waveGainPct:2.5,waveVolumeRatio:2.4,killVolumeRatio:2.5,takerSellPct:70,highToLowDropPct:2.53,
  liquidation:{sampled:true,longUsd:8000,longCount:2},delivery:{status:'SENT'},reason:'<img src=x onerror="window.injected=true">'};
const errors=[],writes=[];
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path.startsWith('/api/')){
      if(req.method==='POST'){writes.push(path);let raw='';for await(const chunk of req)raw+=chunk;enabled=JSON.parse(raw).enabled;}
      const data=path==='/api/coin-pump-long-flush'?{enabled,coverage:{ready:400,total:525,pumping:8,updatedAt:at},history:[selected],selected,counts:{FLUSH_RECLAIM:1}}
        :path==='/api/live-card-whitelist'?{enabledKeys:[]}:path==='/api/btc-liquidation-context'?{state:'WAIT_DATA',reasons:[]}
          :{ollama:{online:false,modelReady:false},evaluation:{btc:{},candidates:[],warnings:[]}};
      res.writeHead(fail&&path==='/api/coin-pump-long-flush'?503:200,{'content-type':'application/json'});res.end(JSON.stringify(data));return;
    }
    const file=resolve(root,'.'+(path==='/'?'/local-ai-trend-evaluation.html':decodeURIComponent(path)));
    if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    res.writeHead(200,{'content-type':{'.js':'text/javascript','.css':'text/css','.html':'text/html'}[extname(file)]??'text/plain'});res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const artifacts=await mkdtemp(join(tmpdir(),'coin-pump-flush-browser-'));
const browser=await chromium.launch({headless:true,env:{...process.env,LD_LIBRARY_PATH:join(process.cwd(),'.playwright-libs/root/usr/lib/x86_64-linux-gnu')+':'+(process.env.LD_LIBRARY_PATH??'')}});
try{
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));enabled=true;fail=false;
    await page.goto(`http://127.0.0.1:${server.address().port}/?flush=${encodeURIComponent(id)}#coin-pump-long-flush`);
    const panel=page.locator('#coin-pump-long-flush');await panel.locator('.wick-selected').waitFor();
    assert.ok((await panel.textContent()).includes('8.000 USDT'));assert.ok((await panel.textContent()).includes('Quét sâu · rút râu lấy lại hỗ trợ'));
    assert.equal(await panel.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
    assert.equal(await panel.locator('[data-live-card-toggle]').count(),0,'no CLOSED AvgROE checkbox');
    assert.equal(await panel.locator('[data-flush-history-details]').getAttribute('open'),'');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
    assert.ok(await panel.locator('[data-flush-enabled]').isChecked());await panel.locator('[data-flush-enabled]').uncheck();
    await page.waitForFunction(()=>!document.querySelector('[data-flush-enabled]').disabled);assert.equal(enabled,false);
    await panel.screenshot({path:join(artifacts,mobile?'mobile.png':'desktop.png')});
    selected.liquidation=null;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(()=>document.querySelector('[data-flush-history]').textContent.includes('chưa có bằng chứng thanh lý LONG đầy đủ'));
    fail=true;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(()=>document.querySelector('[data-flush-status]').textContent.includes('Chưa lấy được dữ liệu mới'));
    selected.liquidation={sampled:true,longUsd:8000,longCount:2};await context.close();
  }
  assert.equal(errors.length,0,errors.join('\n'));assert.ok(writes.every(p=>p==='/api/coin-pump-long-flush'),'no Binance writes');
  console.log('PASS pump-flush browser: desktop/mobile, sample/unknown evidence, deep-link, XSS, toggle, no Binance/overflow. Artifacts:',artifacts);
}finally{await browser.close();await new Promise(r=>server.close(r));}
