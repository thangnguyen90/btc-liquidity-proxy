// Loads independently of the large zone-history response and its renderer.
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=v=>v?new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
const notificationParams=new URLSearchParams(location.search);
let contractRiskScrolled=false,riskLoading=false,riskSnapshot=null;
function discordLabel(d,configured){
  if(d?.sent>0)return 'Đã gửi Discord';
  if(d?.failed||d?.error)return 'Lỗi gửi Discord';
  if(d?.skipped==='HISTORICAL_EVENT')return 'Lịch cũ · không gửi Discord trễ';
  if(d?.skipped==='PENDING')return 'Đã ghi nhận gửi Discord · đang chờ kết quả';
  return configured?'Chờ gửi Discord':'Discord chưa cấu hình';
}
function renderContractRisks(snapshot){
  if(!snapshot)return;
  const rows=snapshot.risks??[],target=notificationParams.get('contractRisk');
  const stages={ANNOUNCED:'CÓ LỊCH DELIST',ONE_DAY:'CÒN ≤24 GIỜ',ONE_HOUR:'CÒN ≤1 GIỜ',RESTRICTED:'HẠN CHẾ GIAO DỊCH',SETTLEMENT_DUE:'ĐÃ ĐẾN / QUA GIỜ TẤT TOÁN',STATUS_WARNING:'TRẠNG THÁI HỢP ĐỒNG CẦN KIỂM TRA'};
  $('contractRiskStatus').textContent=`${snapshot.stale||snapshot.error?'⚠ Dữ liệu chưa mới / lỗi cập nhật, không kết luận coin an toàn':'Lịch hợp đồng cập nhật'} · ${time(snapshot.checkedAt)} · ${rows.length} hợp đồng cần chú ý${snapshot.error?` · ${snapshot.error}`:''}`;
  $('contractRiskRows').innerHTML=rows.map(r=>{
    const minutes=r.settlementAt?Math.ceil((r.settlementAt-Date.now())/60000):null;
    const countdown=minutes==null?'Chưa có thời điểm xác nhận':minutes>0?`Còn ${minutes>=60?`${Math.floor(minutes/60)} giờ `:''}${minutes%60} phút`:'Đã đến / qua thời điểm theo lịch; không xác nhận vị thế của bạn đã đóng';
    const source=/^https:\/\/(www\.binance\.com|developers\.binance\.com)\//.test(r.sourceUrl??'')?r.sourceUrl:null;
    return `<tr data-contract-risk="${esc(r.riskId)}" tabindex="-1" class="${target===r.riskId?'notification-target':''}"><td><b>${esc(r.symbol)}</b><small>${esc(stages[r.stage]??r.stage)} · ${esc(r.status)}</small></td><td>${r.restrictedAt?time(r.restrictedAt):'Chưa có giờ xác nhận'}<small>Không đồng nghĩa khóa đóng vị thế</small></td><td><b>${r.settlementAt?time(r.settlementAt):'Chưa có giờ xác nhận'}</b><small>${esc(countdown)}${r.sourceConflict?'<br>⚠ Giờ API khác thông báo, cần kiểm tra lại.':''}</small></td><td>${source?`<a href="${esc(source)}" target="_blank" rel="noopener">${r.source==='BINANCE_OFFICIAL_NOTICE'?'Thông báo Binance':'API Binance / tài liệu'} ↗</a>`:esc(r.source)}<small>${esc(discordLabel(r.discordDelivery,snapshot.discordConfigured))}</small></td></tr>`;
  }).join('')||'<tr><td colspan="4">Chưa phát hiện lịch rủi ro trong dữ liệu hiện có; không bảo đảm mọi hợp đồng đều an toàn.</td></tr>';
  if(target&&!contractRiskScrolled){
    const node=[...$('contractRiskRows').querySelectorAll('[data-contract-risk]')].find(n=>n.dataset.contractRisk===target);
    if(node){contractRiskScrolled=true;node.scrollIntoView({block:'center'});}
  }
}
async function loadContractRisks(){
  if(riskLoading)return;riskLoading=true;
  try{
    const response=await fetch('/api/binance-contract-risks',{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    const snapshot=await response.json();
    if(!Array.isArray(snapshot.risks))throw Error('Dữ liệu lịch hợp đồng không hợp lệ');
    riskSnapshot=snapshot;renderContractRisks(snapshot);
  }catch(error){
    $('contractRiskStatus').textContent=`⚠ Chưa tải được lịch hợp đồng: ${error.message}${riskSnapshot?' · đang giữ dữ liệu cũ':''}`;
    if(!riskSnapshot)$('contractRiskRows').innerHTML='<tr><td colspan="4">Không tải được dữ liệu. Bấm Làm mới cảnh báo để thử lại; chưa thể kết luận không có coin delist.</td></tr>';
  }finally{riskLoading=false;}
}
$('refreshContractRisks')?.addEventListener('click',()=>void loadContractRisks());
void loadContractRisks();setInterval(()=>{if(!document.hidden)void loadContractRisks();},60_000);
