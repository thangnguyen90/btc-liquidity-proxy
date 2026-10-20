import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
let fail=false,riskRequests=0,zoneRequests=0;
const errors=[],writes=[];
const fixture={version:'TEST',checkedAt:Date.now(),stale:false,discordConfigured:true,risks:[{
  symbol:'EPICUSDT',riskId:'EPICUSDT:123',settlementAt:Date.now()+86400000,restrictedAt:null,stage:'ANNOUNCED',status:'TRADING',
  source:'BINANCE_EXCHANGE_INFO',sourceUrl:'https://developers.binance.com/docs/',discordDelivery:{sent:1}}]};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method!=='GET')writes.push(url.pathname);
  if(url.pathname==='/api/liquidity-zone-manager'){zoneRequests++;return;}// deliberately never resolves
  if(url.pathname==='/api/binance-contract-risks'){
    riskRequests++;res.writeHead(fail?503:200,{'content-type':'application/json'});res.end(JSON.stringify(fixture));return;
  }
  try{
    const name=url.pathname==='/liquidity-zone-manager'?'/liquidity-zone-manager.html':url.pathname;
    res.writeHead(200,{'content-type':{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[extname(name)]??'text/plain'});
    res.end(await readFile(resolve('public','.'+name)));
  }catch{res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const artifacts=await mkdtemp(join(tmpdir(),'contract-risk-panel-'));
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],env:{...process.env,
  LD_LIBRARY_PATH:join(process.cwd(),'.playwright-libs/root/usr/lib/x86_64-linux-gnu')+':'+(process.env.LD_LIBRARY_PATH??'')}});
try{
  for(const mobile of [false,true]){
    fail=false;
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/liquidity-zone-manager?contractRisk=EPICUSDT%3A123#contractRiskPanel`,{waitUntil:'domcontentloaded'});
    await page.locator('#contractRiskRows').filter({hasText:'EPICUSDT'}).waitFor({timeout:5000});
    assert.match(await page.locator('#contractRiskStatus').innerText(),/1 hợp đồng/);
    assert.match(await page.locator('#contractRiskRows').innerText(),/Đã gửi Discord/);
    await page.locator('#contractRiskRows .notification-target').waitFor();
    await page.screenshot({path:join(artifacts,mobile?'mobile.png':'desktop.png')});
    fail=true;await page.locator('#refreshContractRisks').click();
    await page.locator('#contractRiskStatus').filter({hasText:'HTTP 503'}).waitFor();
    assert.match(await page.locator('#contractRiskRows').innerText(),/EPICUSDT/,'failed refresh keeps previous evidence');
    const empty=await context.newPage();
    await empty.goto(`http://127.0.0.1:${server.address().port}/liquidity-zone-manager`,{waitUntil:'domcontentloaded'});
    await empty.locator('#contractRiskRows').filter({hasText:'Không tải được dữ liệu'}).waitFor();
    assert.doesNotMatch(await empty.locator('#contractRiskRows').innerText(),/Đang tải/);
    await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.ok(riskRequests>=4&&zoneRequests>=2);
  console.log(JSON.stringify({passed:true,riskRequests,zoneRequests,artifacts,checks:'desktop/mobile render while main API hung, deep link, Discord status, failure and cached data, zero writes'}));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
