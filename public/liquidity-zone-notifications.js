import {NotificationZoneOrder} from '/liquidity-zone-notification-order.js?v=20261005-2';
import {notificationDirectionClass,notificationDirectionHtml} from '/liquidity-zone-notification-direction.js?v=20261005-1';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=v=>new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
const READ_KEY='liquidityZoneNotificationsReadV1';
let data=null,page=1,loading=false,again=false,searchTimer;
const notificationOrder=new NotificationZoneOrder();
function readIds(){try{return new Set(JSON.parse(localStorage.getItem(READ_KEY)??'[]'));}catch{return new Set();}}
function markRead(ids){try{localStorage.setItem(READ_KEY,JSON.stringify([...new Set([...ids,...readIds()])].slice(0,1000)));}catch{}}
function deliveryLabel(d){
  if(d?.sent>0)return `Push đã gửi ${d.sent} thiết bị${d.failed?` · lỗi ${d.failed}`:''}`;
  if(d?.error||d?.failed)return 'Lỗi gửi Push';
  if(d?.skipped)return d.skipped==='HISTORICAL_EVENT'?'Lịch sử · không Push trễ':'Đã bỏ qua Push';
  return d?'Không có thiết bị nhận':'Chưa có log gửi Push';
}
function render(){
  if(!data)return;const read=readIds();
  $('notificationList').innerHTML=data.items.map(n=>`<article class="notification-card ${notificationDirectionClass(n)} ${read.has(n.eventId)?'read':''}">
    <a class="notification-open" href="${esc(n.url)}" data-open-notification="${esc(n.eventId)}">
      <div class="notification-meta"><span class="notification-state">${read.has(n.eventId)?'Đã đọc':'● Chưa đọc'}</span><span>${time(n.notifiedAt)}</span><span>${n.kind==='RISK'?'DELIST / TẤT TOÁN':n.kind==='ENTRY'?'MAIN MARKET':'THAY ĐỔI VÙNG'}</span></div>
      <h2>${esc(n.title)}</h2>${notificationDirectionHtml(n)}<p>${esc(n.body)}</p><small>${esc(deliveryLabel(n.delivery))}${n.legacy?' · Khôi phục từ dữ liệu lịch sử':''}</small><small>Mở đúng thông báo →</small>
    </a><div class="notification-footer"><button type="button" data-read-notification="${esc(n.eventId)}">Đánh dấu đã đọc</button>${n.kind==='RISK'?'':`<button type="button" class="manual-zone-entry" data-order-notification="${esc(n.eventId)}">Vào lệnh · margin USDT</button>`}</div></article>`).join('')||'<p class="empty">Không có thông báo phù hợp.</p>';
  $('notificationPage').textContent=`Trang ${data.page}/${data.pages} · ${data.total} thông báo`;
  $('notificationPrev').disabled=data.page<=1;$('notificationNext').disabled=data.page>=data.pages;
  $('notificationStatus').textContent=`Cập nhật ${time(data.generatedAt)} · giữ lịch sử ${data.retentionDays} ngày`;
}
async function load(){
  if(loading){again=true;return;}loading=true;
  const q=new URLSearchParams({search:$('notificationSearch').value.trim(),kind:$('notificationKind').value,
    delivery:$('notificationDelivery').value,page:String(page),size:'30'});
  try{
    const response=await fetch(`/api/liquidity-zone-notifications?${q}`,{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error(`HTTP ${response.status}`);data=await response.json();page=data.page;render();
  }catch(e){$('notificationStatus').textContent=`Chưa tải được: ${e.message}`;}
  finally{loading=false;if(again){again=false;void load();}}
}
$('notificationSearch').value=new URLSearchParams(location.search).get('symbol')??'';
$('notificationSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page=1;void load();},300);});
for(const id of ['notificationKind','notificationDelivery'])$(id).addEventListener('change',()=>{page=1;void load();});
$('notificationPrev').addEventListener('click',()=>{page=Math.max(1,page-1);void load();});
$('notificationNext').addEventListener('click',()=>{page+=1;void load();});
$('reloadNotifications').addEventListener('click',()=>void load());
$('readCurrentPage').addEventListener('click',()=>{markRead((data?.items??[]).map(n=>n.eventId));render();});
$('notificationList').addEventListener('click',e=>{
  const order=e.target.closest('[data-order-notification]');
  if(order){const notification=data?.items.find(n=>n.eventId===order.dataset.orderNotification);if(notification)void notificationOrder.open(notification);return;}
  const anchor=e.target.closest('[data-open-notification]');if(anchor)markRead([anchor.dataset.openNotification]);
  const button=e.target.closest('[data-read-notification]');if(button){markRead([button.dataset.readNotification]);render();}
});
void load();setInterval(()=>{if(!document.hidden)void load();},15_000);
