import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';
import {OppositeLiquidityWebPushService} from '../src/oppositeLiquidityWebPush.js';
import {BinanceContractRiskMonitor,collectContractRisks,buildContractRiskPush,contractRiskStage,VERIFIED_CONTRACT_NOTICES} from '../src/binanceContractRisk.js';
import {buildZoneNotificationHistory,zoneNotificationRecord,CONTRACT_RISK_NOTIFICATION_TYPE} from '../src/liquidityZoneNotifications.js';
let now=Date.parse('2026-10-05T08:00:00Z');
const deadline=now+3600_000;
const info={symbols:[{symbol:'BTCUSDT',quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING',deliveryDate:4133404800000},
  {symbol:'TESTUSDT',quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING',deliveryDate:deadline},
  {symbol:'NEWUSDT',quoteAsset:'USDT',contractType:'PERPETUAL',status:'PENDING_TRADING',deliveryDate:4133404800000},
  {symbol:'OLDUSDT',quoteAsset:'USDT',contractType:'PERPETUAL',status:'DELIVERED',deliveryDate:now-20*86400_000},
  {symbol:'OLDSETTLINGUSDT',quoteAsset:'USDT',contractType:'PERPETUAL',status:'SETTLING',deliveryDate:now-20*86400_000},
  {symbol:'QUARTERUSDT',quoteAsset:'USDT',contractType:'CURRENT_QUARTER',status:'TRADING',deliveryDate:deadline},
  {symbol:'COINUSD',quoteAsset:'USD',contractType:'PERPETUAL',status:'TRADING',deliveryDate:deadline}]};
const risks=collectContractRisks(info,[],now);assert.equal(risks.length,1);
assert.equal(risks[0].symbol,'TESTUSDT');assert.equal(risks[0].restrictedAt,null,'Never invent a universal -30min restriction');
assert.equal(risks[0].stage,'ONE_HOUR');
assert.match(buildContractRiskPush(risks[0],now).body,/Chưa xác nhận giờ ngừng/);
assert.equal(collectContractRisks(info,VERIFIED_CONTRACT_NOTICES,now).length,4,'Verified notice covers removed contracts too');
const pump=collectContractRisks(info,VERIFIED_CONTRACT_NOTICES,now).find(r=>r.symbol==='PUMPBTCUSDT');
assert.equal(pump.restrictedAt,Date.parse('2026-10-05T08:30:00Z'));
assert.equal(contractRiskStage(pump,deadline-2*86400_000),'ANNOUNCED');
assert.equal(contractRiskStage(pump,deadline-86400_000),'ONE_DAY');
assert.equal(contractRiskStage(pump,pump.restrictedAt),'RESTRICTED');
assert.equal(contractRiskStage(pump,deadline),'SETTLEMENT_DUE');
assert.throws(()=>collectContractRisks({error:'not json'},[],now),/không xóa/);
const conflict=collectContractRisks({symbols:[{...info.symbols[1],symbol:'PUMPBTCUSDT',deliveryDate:deadline+1000}]},VERIFIED_CONTRACT_NOTICES,now).find(r=>r.symbol==='PUMPBTCUSDT');
assert.equal(conflict.restrictedAt,null);assert.equal(conflict.sourceConflict,true);
assert.equal(collectContractRisks({symbols:[{...info.symbols[1],deliveryDate:0,status:'SETTLING'}]},[],now)[0].settlementAt,null);
const dir=await mkdtemp(join(tmpdir(),'contract-risk-'));
try{
  let loads=0,fail=false;const pushes=[];
  const options={file:join(dir,'state.json'),notices:[],now:()=>now,
    loadExchangeInfo:async()=>{loads++;if(fail)throw Error('REST blocked');return info;},
    pushSender:async p=>{pushes.push(p);return {attempted:1,sent:1};}};
  const monitor=new BinanceContractRiskMonitor(options);await Promise.all([monitor.tick(),monitor.tick()]);
  assert.equal(loads,1);assert.equal(pushes.length,1);assert.equal(monitor.snapshot().entryGate,false);
  await monitor.tick();assert.equal(loads,1);assert.equal(pushes.length,1,'No polling spam');
  const reboot=new BinanceContractRiskMonitor(options);await reboot.tick();assert.equal(pushes.length,1,'Restart dedupe');
  const record=zoneNotificationRecord(pushes[0],{now});
  assert.equal(record.kind,'RISK');assert.equal(record.watchId,'');assert.equal(record.attemptKey,'');
  assert.equal(new URL(record.url,'https://app.test').searchParams.get('contractRisk'),risks[0].riskId);
  assert.equal(buildZoneNotificationHistory({riskAlerts:monitor.state.alerts,now})[0].delivery.sent,1);
  const before=monitor.snapshot().risks[0].riskId;
  fail=true;now+=300_000;await monitor.tick();
  assert.equal(monitor.snapshot().risks[0].riskId,before,'API outage preserves last known risk');assert.match(monitor.snapshot().error,/REST blocked/);
  assert.equal(pushes.length,1);now+=900_000;assert.equal(monitor.snapshot().stale,true);
  fail=false;await monitor.tick();assert.equal(monitor.snapshot().stale,false);
  now=deadline+5000;await monitor.tick();assert.equal(pushes.length,2);assert.match(pushes.at(-1).title,/ĐÃ ĐẾN GIỜ/);
  now=deadline+180_000;
  const late=new BinanceContractRiskMonitor({...options,file:join(dir,'historical.json')});await late.tick();
  assert.equal(pushes.length,2,'No late Push for past settlement');assert.equal(late.state.alerts[0].delivery.skipped,'HISTORICAL_EVENT');
  const changed={symbols:[{...info.symbols[1],deliveryDate:deadline+86400_000}]};
  now+=300_000;monitor.loadExchangeInfo=async()=>changed;await monitor.tick();
  assert.equal(pushes.length,3,'Changed official API deadline gets its own identity');
  assert.equal(monitor.snapshot().risks.length,1);
  const module=await readFile(new URL('../src/binanceContractRisk.js',import.meta.url),'utf8');
  assert.doesNotMatch(module,/placeOrder|cancelOrder|assertEntry|authorizeMainDistanceOrder/,'Warnings have no trading authority');
  const sw=await readFile(new URL('../public/opposite-liquidity-push-sw.js',import.meta.url),'utf8');
  const handlers={};let result,navigated='';
  runInNewContext(sw,{URL,self:{location:{origin:'https://app.test'},addEventListener:(k,v)=>handlers[k]=v,
    clients:{matchAll:async()=>[],openWindow:async u=>{navigated=u;}}}});
  handlers.notificationclick({notification:{data:{signalType:CONTRACT_RISK_NOTIFICATION_TYPE,eventId:record.eventId,url:record.url},close:()=>{}},waitUntil:p=>result=p});await result;
  assert.equal(new URL(navigated).searchParams.get('contractRisk'),record.riskId);
  const html=await readFile(new URL('../public/liquidity-zone-manager.html',import.meta.url),'utf8');
  assert.match(html,/id="contractRiskPanel"/);assert.match(html,/không chặn entry/);
  const managerUi=await readFile(new URL('../public/contract-risk-panel.js',import.meta.url),'utf8');
  const nodes={contractRiskStatus:{},contractRiskRows:{querySelectorAll:()=>[]}};
  const renderContext={document:{getElementById:id=>nodes[id]},location:{search:''},URLSearchParams,Date,URL};
  runInNewContext(managerUi.slice(0,managerUi.indexOf('async function loadContractRisks')),renderContext);
  renderContext.snapshot={checkedAt:now,stale:true,error:'REST unavailable',risks:[{...pump,symbol:'<script>alert(1)</script>',sourceUrl:'javascript:alert(1)'}]};
  runInNewContext('renderContractRisks(snapshot)',renderContext);
  assert.match(nodes.contractRiskStatus.textContent,/không kết luận coin an toàn/);
  assert.match(nodes.contractRiskRows.innerHTML,/&lt;script&gt;/);
  assert.doesNotMatch(nodes.contractRiskRows.innerHTML,/<script>|javascript:/);
  let scrolled=0;
  nodes.contractRiskRows.querySelectorAll=()=>[{dataset:{contractRisk:pump.riskId},scrollIntoView:()=>scrolled++}];
  runInNewContext(`notificationParams.set('contractRisk',${JSON.stringify(pump.riskId)})`,renderContext);
  runInNewContext('renderContractRisks(snapshot);renderContractRisks(snapshot)',renderContext);
  assert.equal(scrolled,1,'Exact risk deep link scrolls only once');
  const notificationUi=await readFile(new URL('../public/liquidity-zone-notifications.js',import.meta.url),'utf8');
  assert.match(notificationUi,/n.kind==='RISK'\?'':/,'No entry button on a risk-only warning');
  const delivered=[];
  const webPushImpl={generateVAPIDKeys:()=>({publicKey:'TEST_PUBLIC',privateKey:'TEST_PRIVATE'}),setVapidDetails:()=>{},
    sendNotification:async(_,body)=>{delivered.push(JSON.parse(body));return {statusCode:201};}};
  const serviceOptions={stateFile:join(dir,'subscriptions.json'),vapidFile:join(dir,'vapid.json'),webPushImpl,now:()=>now};
  const service=new OppositeLiquidityWebPushService(serviceOptions);
  await service.subscribe({endpoint:'https://push.example.test/risk',keys:{p256dh:'A'.repeat(88),auth:'B'.repeat(24)}});
  const freshPush={...pushes.at(-1),notifiedAt:now};
  assert.equal((await service.sendPayload(freshPush)).sent,1);
  assert.equal(delivered[0].signalType,CONTRACT_RISK_NOTIFICATION_TYPE);
  const history=await service.zoneNotificationHistory();assert.equal(history[0].kind,'RISK');assert.equal(history[0].delivery.sent,1);
  assert.ok(!JSON.stringify(history).includes('push.example.test'),'Public risk history must not expose subscription endpoints');
  assert.equal((await new OppositeLiquidityWebPushService(serviceOptions).sendPayload(freshPush)).deduped,true);
  console.log('Contract risk WARN ONLY: sentinel/old/quarter exclusions, verified deadlines, unknown restrictions/conflicts, stale preservation, phases/dedupe/restart/no-late-Push, exact history/SW link, no trading authority OK');
}finally{await rm(dir,{recursive:true,force:true});}
