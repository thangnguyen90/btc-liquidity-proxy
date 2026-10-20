import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {join,resolve,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {DiscordPushManager,buildDiscordPushRouteCatalog} from '../src/discordPushManager.js';
import {PUMP_TURN_NEAR_PUSH_ROUTE} from '../src/pumpTurnNearPush.js';
const dir=await mkdtemp(join(tmpdir(),'near-short-push-browser-')),root=resolve('public'),writes=[],errors=[];
let manager;
const webPushService={publicConfig:async()=>({configured:true,subscriptionCount:4,quietHours:{enabled:true,start:'00:00',end:'06:00',timeZone:'Asia/Ho_Chi_Minh'}}),sendPayload:async()=>{throw Error('browser must never send Push');}};
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://local');let body;
 if(u.pathname==='/api/discord-push-manager')body=await manager.snapshot();
 else if(u.pathname==='/api/discord-push-manager/routes'){
  let raw='';for await(const b of req)raw+=b;const v=JSON.parse(raw);writes.push(v);body=await manager.updateRoute(v.routeId,v.enabled);
 }else if(u.pathname.startsWith('/api/'))body={};
 if(body){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(body));return;}
 const p=resolve(root,'.'+u.pathname);if(!p.startsWith(root+sep))throw Error('path');res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(p)]??'text/plain'});res.end(await readFile(p));
 }catch(e){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,env:{...process.env,LD_LIBRARY_PATH:join(process.cwd(),'.playwright-libs/root/usr/lib/x86_64-linux-gnu')}});
try{for(const mobile of [false,true]){
 manager=new DiscordPushManager({stateFile:join(dir,String(mobile)+'.json'),routes:[...buildDiscordPushRouteCatalog({DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/mock'}),PUMP_TURN_NEAR_PUSH_ROUTE],webPushService});await manager.initialize();
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1450,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const n=writes.length;await page.goto(base+'/push-signal-manager.html');await page.locator('#'+PUMP_TURN_NEAR_PUSH_ROUTE.id).waitFor();assert.equal(writes.length,n,'GET/page load never enables route');
 await page.locator('#search').fill('GẦN VÙNG SHORT');assert.equal(await page.locator('.route-card').count(),1);assert.match(await page.locator('.route-card').innerText(),/Tín hiệu trực tiếp/);assert.doesNotMatch(await page.locator('.route-card').innerText(),/endpoint #/);
 const button=page.locator('[data-route-id="'+PUMP_TURN_NEAR_PUSH_ROUTE.id+'"]');await button.click();await page.locator('.route-card.is-enabled').waitFor();assert.equal(manager.isRouteEnabled(PUMP_TURN_NEAR_PUSH_ROUTE.id),true);assert.equal(writes.length,n+1);assert.deepEqual(writes.at(-1),{routeId:PUMP_TURN_NEAR_PUSH_ROUTE.id,enabled:true});
 assert.equal(manager.snapshotSync().routes.find(r=>r.transport==='DISCORD_WEBHOOK').enabled,false,'native toggle does not enable webhook or LONG');
 await page.locator('.route-card').screenshot({path:join(dir,mobile?'mobile.png':'desktop.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const href=await page.locator('.route-card a').getAttribute('href');assert.equal(href,'/pump-turn-watch#signals');
 await button.click();await page.locator('.route-card.is-disabled').waitFor();assert.equal(manager.isRouteEnabled(PUMP_TURN_NEAR_PUSH_ROUTE.id),false);await context.close();
 }assert.deepEqual(errors,[]);console.log('PASS managed native SHORT Push UI desktop/mobile: exact searchable card, explicit ON/OFF only, independent webhook, no sends/overflow. Artifacts '+dir);
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
