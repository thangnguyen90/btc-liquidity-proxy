import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {zoneNotificationUrl,zoneNotificationRecord,buildZoneNotificationHistory,zoneNotificationPage} from '../src/liquidityZoneNotifications.js';
import {injectLocalAiNavigation} from '../src/localAiNavigation.js';
const now=Date.now(),type='BINANCE_LIQUIDITY_ZONE_LIFECYCLE';
const url=zoneNotificationUrl({symbol:'龙虾USDT',watchId:'w1',eventId:'zone:w1:CLOSED_BEYOND'});
const q=new URL(url,'https://test.local').searchParams;
assert.equal(q.get('symbol'),'龙虾USDT');assert.equal(q.get('watch'),'w1');assert.equal(q.get('notification'),'zone:w1:CLOSED_BEYOND');
const row=zoneNotificationRecord({signalType:type,eventId:'zone:w1:CLOSED_BEYOND',symbol:'龙虾USDT',title:'Test',body:'100 – 105',notifiedAt:now,subscription:{endpoint:'SECRET'},keys:{auth:'SECRET'}},{delivery:{sent:2,attempted:2,privateKey:'SECRET'}});
assert.equal(row.kind,'ZONE');assert.equal(row.watchId,'w1');assert.ok(!JSON.stringify(row).includes('SECRET'));
assert.equal(zoneNotificationRecord({signalType:'OTHER',eventId:'test'}),null);
const events=[{eventId:row.eventId,watchId:'w1',symbol:'龙虾USDT',state:'CLOSED_BEYOND',pushEnabled:true,at:now,zone:{low:100,high:105},delivery:{sent:1}},
 {eventId:'zone:w2:TOUCHING',watchId:'w2',symbol:'BTCUSDT',state:'TOUCHING',pushEnabled:true,at:now-1000,zone:{low:10,high:12},delivery:{skipped:'HISTORICAL_EVENT'}},
 {eventId:'off',pushEnabled:false,at:now},{eventId:'bad-date',pushEnabled:true}];
const attempts=[{key:'abc',symbol:'TESTUSDT',side:'LONG',watchId:'w3',at:now-2000,status:'SUBMITTED',takeProfitPrice:10,push:{eventId:'main-distance:abc:V3',sent:1}}];
const rows=buildZoneNotificationHistory({stored:[row],events,attempts,now});
assert.equal(rows.length,3);assert.equal(rows[0].delivery.sent,2,'Persisted exact message wins over legacy reconstruction');
assert.equal(rows[2].attemptKey,'abc');assert.equal(rows[2].legacy,true);
assert.equal(zoneNotificationPage(rows,new URLSearchParams({kind:'ENTRY'})).total,1);
assert.equal(zoneNotificationPage(rows,new URLSearchParams({search:'龙虾'})).total,1);
assert.equal(zoneNotificationPage(rows,new URLSearchParams({delivery:'skipped'})).total,1);
const paged=zoneNotificationPage(rows,new URLSearchParams({size:'1',page:'999'}));assert.equal(paged.page,3);assert.equal(paged.items[0].eventId,'main-distance:abc:V3');
assert.equal(buildZoneNotificationHistory({stored:[{...row,notifiedAt:now-8*86400000}],now}).length,0);
assert.equal(buildZoneNotificationHistory({stored:Array.from({length:1100},(_,i)=>({...row,eventId:`zone:${i}:TOUCHING`,notifiedAt:now-i})),now}).length,1000);
const nav=injectLocalAiNavigation('<nav><a href="/liquidity-zone-manager">Vùng</a></nav>');
assert.match(nav,/href="\/liquidity-zone-notifications"/);assert.equal(injectLocalAiNavigation(nav),nav);

const ui=await readFile(new URL('../public/liquidity-zone-manager.js',import.meta.url),'utf8');
const nodes=new Map(),storage=new Map();
const node=id=>{
  if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',hidden:true,handlers:{},attributes:{},
    querySelectorAll:()=>[],setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,v){this.handlers[k]=v;},scrollIntoView(){this.scrolled=true;}});
  return nodes.get(id);
};
for(const id of ['filter','zoneRole','zoneSide','scenarioFilter'])node(id).value=id==='filter'?'active':'all';
node('zoneRole').value='MAIN_KILL';node('sortOrder').value='newest-main-3';
const view=runInNewContext(`${ui}; ({setData:v=>{data=v;render();},getPage:()=>page})`,{
  document:{getElementById:node,querySelectorAll:()=>[]},location:{search:new URL(url,'https://test.local').search},URLSearchParams,
  setInterval:()=>0,fetch:()=>new Promise(()=>{}),AbortSignal:{timeout:()=>null},
  localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
});
const watches=Array.from({length:60},(_,i)=>({id:`other${i}`,symbol:'龙虾USDT',role:'MAIN_KILL',enabled:true,direction:'UPPER',socketFresh:true,markPrice:100,zone:{low:104+i,high:105+i},seen:{ACTIVE:true},status:'ACTIVE'}));
watches.push({...watches[0],id:'w1',enabled:false,role:'FAR_KILL',seen:{PRICE_PASSED:true}});
view.setData({watches,events:[],generatedAt:now,focusedNotification:row});
assert.equal(node('filter').value,'all');assert.equal(node('zoneRole').value,'all');assert.equal(node('sortOrder').value,'farthest');
assert.equal(view.getPage(),2,'Target on another page must become visible, including archived FAR');
assert.match(node('watchRows').innerHTML,/data-watch-id="w1"/);assert.match(node('watchRows').innerHTML,/notification-target/);
assert.equal(node('focusedNotificationTitle').textContent,'Test');assert.equal(node('focusedNotification').hidden,false);
assert.ok(JSON.parse(storage.get('liquidityZoneNotificationsReadV1')).includes(row.eventId));
node('filter').value='active';view.setData({watches,events:[],generatedAt:now,focusedNotification:row});
assert.equal(node('filter').value,'active','Polling must not reset user filters after opening target');
view.setData({watches,events:[],generatedAt:now,focusedNotification:{...row,body:'<script>alert(1)</script>'}});
assert.equal(node('focusedNotificationBody').textContent,'<script>alert(1)</script>','Message body is rendered as text, not HTML');

const worker=await readFile(new URL('../public/opposite-liquidity-push-sw.js',import.meta.url),'utf8');
const handlers={};let navigated='',finished;
runInNewContext(worker,{URL,self:{location:{origin:'https://app.test'},addEventListener:(k,v)=>{handlers[k]=v;},
  clients:{matchAll:async()=>[{url:'https://app.test/other',focus:async()=>{},navigate:async u=>{navigated=u;}}]}}});
handlers.notificationclick({notification:{data:{signalType:type,eventId:'main-distance:abc:V3',url:'/liquidity-zone-manager?symbol=TESTUSDT'},close:()=>{}},waitUntil:p=>{finished=p;}});
await finished;const target=new URL(navigated);
assert.equal(target.searchParams.get('notification'),'main-distance:abc:V3');assert.equal(target.searchParams.get('attempt'),'abc');
const server=await readFile(new URL('../src/server.js',import.meta.url),'utf8');
assert.match(server,/pathname==='\/api\/liquidity-zone-notifications'/);assert.match(server,/pathname === '\/liquidity-zone-notifications'/);
assert.match(server,/recentMainAttempts.push\(focusedAttempt\)/,'Deep links include an old attempt outside the normal last30 list');
console.log('Zone notification history: exact links, Unicode, legacy/no-replay, privacy, retention, filters/pagination, archived targets and old Push clicks OK');
