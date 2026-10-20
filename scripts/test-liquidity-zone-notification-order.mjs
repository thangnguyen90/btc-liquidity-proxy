import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {notificationDirectionClass,notificationDirectionHtml} from '../public/liquidity-zone-notification-direction.js';
const now=Date.now(),w={id:'original',symbol:'龙虾USDT',role:'MAIN_KILL',enabled:true,status:'ACTIVE',seen:{ACTIVE:true},
  socketFresh:true,priceAt:now-100,lastClosedAt:now-10000,markPrice:100,zone:{low:103,high:104},direction:'UPPER'};
const n={eventId:'zone:original:ACTIVE',watchId:w.id,symbol:w.symbol,title:'Thông báo gốc <script>not HTML</script>',notifiedAt:now-10000000};
let snapshot={watches:[w]},token='',sends=0,posted,waitPost;
const nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',checked:false,open:false,handlers:{},
  addEventListener(k,v){this.handlers[k]=v;},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);};
const source=await readFile(new URL('../public/liquidity-zone-notification-order.js',import.meta.url),'utf8');
const flow=runInNewContext(`${source.replace('export class','class')};new NotificationZoneOrder()`,{
  document:{getElementById:node},structuredClone,URLSearchParams,AbortSignal:{timeout:()=>null},
  localStorage:{getItem:()=>token},
  fetch:async(url,opts)=>{
    if(url.startsWith('/api/liquidity-zone-manager?')){
      assert.equal(new URL(url,'https://app.test').searchParams.get('notification'),n.eventId);
      return {ok:true,json:async()=>structuredClone(snapshot)};
    }
    assert.equal(url,'/api/liquidity-zone-manager/order');sends++;posted=JSON.parse(opts.body);
    assert.equal(opts.headers['x-orders-token'],token);
    if(waitPost)await waitPost;
    return {ok:true,json:async()=>({status:'SUBMITTED',orderId:321,symbol:w.symbol,side:posted.side})};
  },
});
await flow.open(n);assert.equal(node('manualOrderDialog').open,true);
assert.match(node('manualOrderSummary').textContent,/LONG 龙虾USDT/);
assert.match(node('manualOrderSummary').textContent,/MARK 100 · TP 103/,'Use fresh mark rather than notification time/price');
assert.match(node('manualOrderSummary').textContent,/<script>not HTML<\/script>/,'Title goes to textContent');
node('manualMargin').value='8.5';node('manualConfirmed').checked=true;flow.summary();
await flow.submit();assert.equal(sends,0);assert.match(node('manualOrderResult').textContent,/Đăng nhập/);
token='authorized';node('manualConfirmed').checked=false;await flow.submit();assert.equal(sends,0);
node('manualConfirmed').checked=true;
let release;waitPost=new Promise(r=>{release=r;});
const running=flow.submit();await flow.submit();assert.equal(sends,1,'Concurrent clicks dispatch once');
assert.equal(node('manualMargin').disabled,true);
let prevented=false;node('manualOrderDialog').handlers.cancel({preventDefault(){prevented=true;}});assert.equal(prevented,true);
release();await running;waitPost=null;
assert.equal(posted.watchId,w.id);assert.equal(posted.marginUsdt,8.5);assert.equal(posted.confirm,true);
assert.equal(posted.side,'LONG');assert.equal(posted.referenceMark,100);
assert.equal(posted.zone.low,103);assert.equal(posted.zone.high,104);
assert.match(node('manualOrderResult').textContent,/321/);assert.equal(node('manualSubmit').disabled,true);
node('manualClose').handlers.click();assert.equal(node('manualOrderDialog').open,false);
const changed={...w,direction:'LOWER',zone:{low:95,high:97}};snapshot={watches:[changed]};
await flow.open(n);assert.match(node('manualOrderSummary').textContent,/SHORT 龙虾USDT/);
assert.match(node('manualOrderSummary').textContent,/TP 97/);node('manualClose').handlers.click();
for(const mutation of [{enabled:false},{role:'FAR_KILL'},{status:'TOUCHING'},{seen:{PRICE_PASSED:true}},
  {consumedAtCapture:true},{historyIncomplete:true},{priceAt:now-16000},{markPrice:101}]){
  snapshot={watches:[{...w,...mutation}]};await flow.open(n);
  assert.equal(node('manualOrderDialog').open,true,'Blocked cases still visibly open feedback dialog');
  assert.equal(node('manualSubmit').disabled,true);assert.equal(flow.selection,null);
  assert.match(node('manualOrderResult').textContent,/không đủ điều kiện/);
  assert.match(node('manualOrderSummary').textContent,/Chưa gửi lệnh Binance/);
  node('manualClose').handlers.click();
}
snapshot={watches:[{...w,id:'newer-same-symbol'}]};await flow.open(n);
assert.equal(node('manualOrderDialog').open,true);assert.match(node('manualOrderResult').textContent,/Không dùng vùng thay thế/);
node('manualClose').handlers.click();
await flow.open({...n,watchId:''});assert.match(node('manualOrderResult').textContent,/thiếu ID/);assert.equal(node('manualSubmit').disabled,true);
node('manualClose').handlers.click();
snapshot={watches:[w],mainDistanceTrading:{attempts:[{key:'old-entry',watchId:w.id}]}};
await flow.open({...n,watchId:'',attemptKey:'old-entry'});assert.equal(node('manualOrderDialog').open,true,'Legacy uses exact attempt watch ID, not coin lookup');
node('manualClose').handlers.click();
// The dialog must open before a slow GET resolves. Closing it invalidates that
// response, so an older request can never overwrite a newly selected notification.
const raceNodes=new Map();
const raceNode=id=>{if(!raceNodes.has(id))raceNodes.set(id,{value:'',textContent:'',open:false,handlers:{},
  addEventListener(k,v){this.handlers[k]=v;},showModal(){this.open=true;},close(){this.open=false;}});return raceNodes.get(id);};
let finishOld;
const oldRequest=new Promise(r=>{finishOld=r;});let lookups=0;
const race=runInNewContext(`${source.replace('export class','class')};new NotificationZoneOrder()`,{
  document:{getElementById:raceNode},structuredClone,URLSearchParams,AbortSignal:{timeout:()=>null},
  fetch:async()=>{if(++lookups===1)await oldRequest;return {ok:true,json:async()=>({watches:[w]})};},
});
const oldOpening=race.open(n);
assert.equal(raceNode('manualOrderDialog').open,true,'Click immediately opens dialog before response');
assert.match(raceNode('manualOrderResult').textContent,/Đang kiểm tra/);
assert.equal(raceNode('manualSubmit').disabled,true);assert.equal(race.selection,null);
raceNode('manualClose').handlers.click();
const nextNotification={...n,title:'New notification'};
await race.open(nextNotification);assert.equal(race.selection.notification.title,nextNotification.title);
finishOld();await oldOpening;assert.equal(race.selection.notification.title,nextNotification.title,'Late response cannot overwrite newer dialog');

// The card action is outside the navigation link and uses immutable event ID.
const listSource=await readFile(new URL('../public/liquidity-zone-notifications.js',import.meta.url),'utf8');
const clean=listSource.replace(/^import[^\n]+\n/gm,'');let opened;
for(const id of ['notificationSearch','notificationKind','notificationDelivery'])node(id).value='all';
const view=runInNewContext(`${clean};({set:v=>{data=v;render();}})`,{
  document:{getElementById:node,hidden:false},URLSearchParams,location:{search:''},setInterval(){},clearTimeout(){},setTimeout(){},
  NotificationZoneOrder:class {open(v){opened=v;}},localStorage:{getItem:()=>null,setItem(){}},
  notificationDirectionClass,notificationDirectionHtml,
  fetch:()=>new Promise(()=>{}),AbortSignal:{timeout:()=>null},
});
view.set({items:[{...n,url:'/liquidity-zone-manager?watch=original',kind:'ZONE'}],page:1,pages:1,total:1,generatedAt:now,retentionDays:7});
assert.match(node('notificationList').innerHTML,/<\/a><div class="notification-footer">/);
assert.match(node('notificationList').innerHTML,/data-order-notification="zone:original:ACTIVE"/);
node('notificationList').handlers.click({target:{closest:s=>s==='[data-order-notification]'?{dataset:{orderNotification:n.eventId}}:null}});
assert.equal(opened.eventId,n.eventId);assert.equal(opened.watchId,w.id);
console.log('Notification manual order UI: visible loading/blocked/missing-ID feedback, close/request race, exact frozen IDs, fresh LONG/SHORT TP, stale gates, auth/confirm, doubleclick and margin OK (mock only)');
