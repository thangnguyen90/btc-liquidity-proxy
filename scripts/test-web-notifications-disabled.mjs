import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {OppositeLiquidityWebPushService} from '../src/oppositeLiquidityWebPush.js';
const dir=await mkdtemp(join(tmpdir(),'web-mute-'));
let sent=0;
const webPush={generateVAPIDKeys:()=>({publicKey:'PUBLIC',privateKey:'PRIVATE'}),setVapidDetails(){},async sendNotification(){sent++;}};
try {
  const opts={stateFile:join(dir,'state.json'),vapidFile:join(dir,'vapid.json'),webPushImpl:webPush};
  const original=new OppositeLiquidityWebPushService(opts);
  await original.subscribe({endpoint:'https://push.test/device',keys:{p256dh:'A'.repeat(88),auth:'B'.repeat(24)}});
  const off=new OppositeLiquidityWebPushService({...opts,enabled:false});
  const config=await off.publicConfig();
  assert.equal(config.enabled,false);assert.equal(config.subscriptionCount,1);
  await assert.rejects(off.subscribe({}),/WEB_NOTIFICATIONS_DISABLED/);
  for(const signalType of ['LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH','MANUAL_BINANCE_PRICE_ALERT','BINANCE_LIQUIDITY_ZONE_LIFECYCLE','BINANCE_FUTURES_CONTRACT_RISK','DISCORD_ROUTE:any','PUMP_TURN_NEAR_SHORT']) {
    const result=await off.sendPayload({signalType,eventId:signalType});
    assert.equal(result.skipped,'WEB_NOTIFICATIONS_DISABLED');assert.equal(result.attempted,0);
  }
  assert.equal(sent,0);assert.equal((await off.publicConfig()).subscriptionCount,1);
  assert.deepEqual(JSON.parse(await readFile(opts.stateFile,'utf8')).sentEvents,{});
  assert.equal((await new OppositeLiquidityWebPushService({...opts,enabled:false}).publicConfig()).enabled,false);
  assert.equal((await new OppositeLiquidityWebPushService(opts).publicConfig()).enabled,true);

  const worker=await readFile(new URL('../public/opposite-liquidity-push-sw.js',import.meta.url),'utf8');
  for(const policy of [false,true,'failure']){
    const handlers={};let shown=0,closed=0;
    const context={AbortSignal,Date,URL,Object,fetch:async()=>{if(policy==='failure')throw Error('offline');return {ok:true,json:async()=>({enabled:policy})};},self:{addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>{}},registration:{showNotification:async()=>shown++,getNotifications:async()=>[{close:()=>closed++}]}}};
    vm.runInNewContext(worker,context);
    let pending;
    handlers.push({data:{json:()=>({signalType:'MANUAL_BINANCE_PRICE_ALERT',eventId:'queued'})},waitUntil:p=>pending=p});await pending;
    assert.equal(shown,policy===true?1:0);
    handlers.activate({waitUntil:p=>pending=p});await pending;
    assert.equal(closed,policy===true?0:1);
  }

  const client=await readFile(new URL('../public/opposite-liquidity-toast.js',import.meta.url),'utf8');
  const buttons=[{dataset:{}}],helps=[{}],handlers={};let closed=0,subscriptionsPosted=0,permissionRequests=0,created=0;
  const registration={getNotifications:async()=>[{close:()=>closed++}]};
  const context={AbortSignal,Date,URL,Uint8Array,console,setTimeout(){},setInterval(){},localStorage:{getItem:()=>null,setItem(){}},window:{isSecureContext:true,Notification:{},PushManager:{}},Notification:{permission:'granted',requestPermission:async()=>{permissionRequests++;return 'granted';}},navigator:{userAgent:'desktop',serviceWorker:{register:async()=>registration,ready:Promise.resolve(registration)}},document:{hidden:false,querySelectorAll:sel=>sel==='[data-opposite-liquidity-push]'?buttons:helps,querySelector:()=>null,createElement:()=>{created++;throw Error('toast must not be created');},addEventListener:(name,fn)=>handlers[name]=fn},fetch:async(url,opts)=>{if(opts?.method==='POST')subscriptionsPosted++;return {ok:true,json:async()=>url.endsWith('/config')?{enabled:false,publicKey:'PUBLIC'}:{version:'OPPOSITE_LIQUIDITY_MANAGER_test',webPush:{enabled:false},scanner:{browserNotifications:[{eventId:'must-not-show',notifiedAt:Date.now()}]}}};}};
  vm.runInNewContext(client,context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(buttons[0].disabled,true);assert.match(buttons[0].textContent,/ĐÃ TẮT/);
  handlers.click({target:{closest:()=>true}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(permissionRequests,0);assert.equal(subscriptionsPosted,0);assert.equal(created,0);assert.equal(closed,1);
  console.log('Web notifications disabled: transport blocked, state preserved, worker queued/offline suppressed, client muted.');
}finally{await rm(dir,{recursive:true,force:true});}
