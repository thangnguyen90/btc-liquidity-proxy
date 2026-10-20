import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {join,resolve,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
const root=resolve('public'),at=Date.now(),id='pump-wick-early:ERAUSDT:123';let enabled=true,fail=false;
const selected={id,symbol:'ERAUSDT',status:'WICK_DETECTED',pattern:'EARLY_WICK',detectedAt:at,
  sweepLow:.07317,sweepHigh:.08448,level:.08417,price:.07844,reclaimed:false,wickPct:46.6,reboundPct:7.2,highToLowDropPct:13.39,
  pump:{lookbackMinutes:30,waveGainPct:28.1,waveVolumeRatio:7.42,drawdownPct:7.49},delivery:{status:'SENT'},discordDelivery:{status:'SENT'}};
const errors=[],writes=[];
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path.startsWith('/api/')){
      if(req.method==='POST'){writes.push(path);let raw='';for await(const c of req)raw+=c;enabled=JSON.parse(raw).enabled;}
      const data=path==='/api/coin-pump-wick-early'?{enabled,discordConfigured:true,coverage:{ready:400,total:500,pumping:3,updatedAt:at},history:[selected],selected,counts:{WICK_DETECTED:1}}
        :path==='/api/btc-wick-recovery'?{enabled:true,discordConfigured:true,coverage:{ready:500,total:500,updatedAt:at},history:[],counts:{CONFIRMED:2}}
        :path==='/api/live-card-whitelist'?{enabledKeys:[]}:path==='/api/btc-liquidation-context'?{state:'WAIT_DATA',reasons:[]}
        :{ollama:{online:false,modelReady:false},evaluation:{btc:{},candidates:[],warnings:[]}};
      res.writeHead(fail&&path==='/api/coin-pump-wick-early'?503:200,{'content-type':'application/json'});res.end(JSON.stringify(data));return;
    }
    const file=resolve(root,'.'+(path==='/'?'/local-ai-trend-evaluation.html':decodeURIComponent(path)));
    if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    res.writeHead(200,{'content-type':{'.js':'text/javascript','.css':'text/css','.html':'text/html'}[extname(file)]??'text/plain'});res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const artifacts=await mkdtemp(join(tmpdir(),'early-wick-browser-'));
const browser=await chromium.launch({headless:true,env:{...process.env,LD_LIBRARY_PATH:join(process.cwd(),'.playwright-libs/root/usr/lib/x86_64-linux-gnu')+':'+(process.env.LD_LIBRARY_PATH??'')}});
try{
 for(const mobile of [false,true]){
  enabled=true;fail=false;const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?earlyWick=${encodeURIComponent(id)}#coin-pump-wick-early`);
  const panel=page.locator('#coin-pump-wick-early');await panel.locator('.wick-selected').waitFor();
  const text=await panel.textContent();assert(text.includes('RÚT RÂU SỚM · CHƯA XÁC NHẬN HỒI'));assert(text.includes('CHƯA LẤY LẠI'));
  assert(text.includes('Discord: Đã gửi'));assert(text.includes('46,6%'));assert(text.includes('7,2%'));
  assert.equal(await panel.locator('[data-live-card-key="coin-pump-wick-early:EARLY_WICK"]').count(),1);
  assert.equal(await panel.locator('[data-live-card-toggle]').count(),0,'no checkbox before real CLOSED AvgROE>4');
  for(const [closed,avgRoe,count]of [[0,10,0],[1,4,0],[1,4.01,1]]) {
    await page.evaluate(async({closed,avgRoe})=>{
      const {renderEarlyWick}=await import('/coin-pump-wick-early.js?v=20261011-ratio-v1');
      renderEarlyWick({enabled:true,history:[],closedStats:{closed,avgRoe},binance:{masterEnabled:true,routeEnabled:false,executionEnabled:true}});
    },{closed,avgRoe});
    assert.equal(await panel.locator('[data-live-card-toggle]').count(),count,'only real CLOSED AvgROE>4 reveals exact whitelist key');
    if(count){assert.equal(await panel.locator('[data-live-card-toggle]').getAttribute('data-key'),'coin-pump-wick-early:EARLY_WICK');assert.equal(await panel.locator('[data-live-card-toggle]').isChecked(),false);}
  }
  await page.evaluate(async({selected,at})=>{
    const {renderEarlyWick}=await import('/coin-pump-wick-early.js?v=20261011-ratio-v1');
    renderEarlyWick({enabled:true,discordConfigured:true,coverage:{ready:400,total:500,pumping:3,updatedAt:at},history:[selected],selected,
      counts:{WICK_DETECTED:1},closedStats:{closed:0,avgRoe:null},
      binance:{masterEnabled:true,routeEnabled:false,executionEnabled:true,attempts:[{id:selected.id,status:'RATIO_NO_FLAT_THEN_BREAK',ratioProof:{pass:false}}]}});
  },{selected,at});
  assert((await panel.locator('[data-early-binance]').textContent()).includes('route LONG OFF'));
  assert((await panel.locator('.wick-selected').textContent()).includes('RATIO_NO_FLAT_THEN_BREAK'));
  assert.equal(await panel.locator('[data-live-card-toggle]').count(),0);
  await page.locator('#btc-wick-recovery [data-wick-counts]').getByText('xác nhận 2',{exact:false}).waitFor();
  assert((await page.locator('#btc-wick-title').textContent()).includes('CŨ'));
  assert.equal(await panel.locator('[data-early-details]').getAttribute('open'),'');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await panel.screenshot({path:join(artifacts,mobile?'mobile.png':'desktop.png')});
  await page.evaluate(async()=>{
    const {renderEarlyWick}=await import('/coin-pump-wick-early.js?v=20261011-ratio-v1');
    renderEarlyWick({enabled:true,history:[{id:'xss',symbol:'<img src=x onerror="window.injected=true">',pump:{},discordDelivery:{status:'<script>bad</script>'}}]});
  });
  assert.equal(await panel.locator('img,script').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
  await panel.locator('[data-early-enabled]').uncheck();await page.waitForFunction(()=>!document.querySelector('[data-early-enabled]').disabled);
  assert.equal(enabled,false);assert(await page.locator('[data-wick-enabled]').isChecked(),'new toggle must not disable old rule');
  fail=true;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(()=>document.querySelector('[data-early-status]').textContent.includes('Không lấy được dữ liệu mới'));
  await context.close();
 }
 assert.equal(errors.length,0,errors.join('\n'));assert(writes.every(p=>p==='/api/coin-pump-wick-early'),'no Binance or old-rule mutation');
 console.log('PASS early wick browser: separate EARLY/CONFIRMED, desktop/mobile/deep-link/Discord/toggle/XSS/whitelist OFF. Artifacts:',artifacts);
}finally{await browser.close();await new Promise(r=>server.close(r));}
