const $=id=>document.getElementById(id);
const price=v=>Number(v).toLocaleString('en-US',{maximumSignificantDigits:10});
function ready(w,now=Date.now()){
  const mark=Number(w?.markPrice),low=Number(w?.zone?.low),high=Number(w?.zone?.high);
  if(![mark,low,high].every(Number.isFinite)||!(mark>0&&low>0&&high>=low))return false;
  const side=mark<low?'LONG':mark>high?'SHORT':null;
  const tp=side==='LONG'?low:high;
  return !!side&&w.role==='MAIN_KILL'&&w.enabled&&w.status==='ACTIVE'&&!w.consumedAtCapture
    &&!!w.seen&&!['PRICE_PASSED','CLOSED_BEYOND','REJECTED_AFTER_SWEEP'].some(s=>w.seen[s])
    &&!w.historyIncomplete&&w.socketFresh&&w.priceAt>0&&now-w.priceAt<=15000&&w.priceAt<=now+5000
    &&w.lastClosedAt>0&&now-w.lastClosedAt<=360000&&w.lastClosedAt<now
    &&(side==='LONG'?w.direction==='UPPER':w.direction==='LOWER')&&Math.abs(tp-mark)/mark*100>=2.5;
}
// Presentation uses the notification's immutable watch ID, never the newest zone
// for the same symbol. The existing server endpoint remains the entry authority.
export class NotificationZoneOrder {
  constructor(){
    this.selection=null;this.opening=false;this.submitting=false;this.openSequence=0;
    $('manualMargin').addEventListener('input',()=>this.summary());
    $('manualOrderForm').addEventListener('submit',e=>{e.preventDefault();void this.submit();});
    $('manualClose').addEventListener('click',()=>{if(!this.submitting){this.cancelOpening();$('manualOrderDialog').close();}});
    $('manualOrderDialog').addEventListener('cancel',e=>{if(this.submitting)e.preventDefault();else this.cancelOpening();});
  }
  cancelOpening(){this.openSequence++;this.opening=false;this.selection=null;}
  message(text){$('notificationOrderStatus').textContent=text;$('manualOrderResult').textContent=text;}
  async open(notification){
    if(this.opening||this.submitting||$('manualOrderDialog').open)return;
    const sequence=++this.openSequence;
    this.opening=true;this.selection=null;
    $('manualMargin').value='2';$('manualConfirmed').checked=false;
    $('manualSubmit').disabled=$('manualMargin').disabled=$('manualConfirmed').disabled=true;
    $('manualOrderSummary').textContent=`Thông báo: ${notification.title}\nCoin: ${notification.symbol}\nChưa có kế hoạch vào lệnh; đang kiểm tra vùng gốc và giá hiện tại.`;
    $('manualOrderDialog').showModal();
    this.message('Đang kiểm tra đúng vùng của thông báo và giá hiện tại…');
    try{
      if(!notification.watchId&&!notification.attemptKey)throw Error('Thông báo cũ thiếu ID vùng; không tự chọn vùng mới cùng coin để đặt lệnh.');
      const q=new URLSearchParams({notification:notification.eventId});
      if(notification.attemptKey)q.set('attempt',notification.attemptKey);
      const response=await fetch(`/api/liquidity-zone-manager?${q}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});
      const snapshot=await response.json();if(!response.ok)throw Error(snapshot.error??`HTTP ${response.status}`);
      if(sequence!==this.openSequence)return; // Closed or another notification opened during the GET.
      const attempt=(snapshot.mainDistanceTrading?.attempts??[]).find(a=>a.key===notification.attemptKey);
      const id=notification.watchId||attempt?.watchId;
      const w=snapshot.watches?.find(w=>w.id===id&&w.symbol===notification.symbol);
      if(!w)throw Error('Vùng gốc của thông báo không còn trong dữ liệu. Không dùng vùng thay thế.');
      if(!ready(w))throw Error('Vùng gốc hiện không đủ điều kiện vào lệnh: chỉ MAIN ACTIVE chưa vượt, cách giá ≥2,5%, đủ nến và giá mới. FAR/vùng cũ/đã vượt không dùng để vào lại.');
      this.selection={w:structuredClone(w),side:w.markPrice<w.zone.low?'LONG':'SHORT',notification:structuredClone(notification)};
      $('manualSubmit').disabled=$('manualMargin').disabled=$('manualConfirmed').disabled=false;
      this.summary();this.message('Đã lấy đúng vùng gốc và giá mới. Nhập margin, kiểm tra hướng rồi xác nhận.');
    }catch(error){if(sequence===this.openSequence){
      $('manualOrderSummary').textContent=`Thông báo: ${notification.title}\nCoin: ${notification.symbol}\nKhông có kế hoạch vào lệnh. Chưa gửi lệnh Binance.`;
      this.message(error.message);
    }}
    finally{if(sequence===this.openSequence)this.opening=false;}
  }
  summary(){
    if(!this.selection)return;
    const {w,side,notification}=this.selection,margin=Number($('manualMargin').value);
    const tp=side==='LONG'?w.zone.low:w.zone.high,sl=w.markPrice*(side==='LONG'?.94:1.06);
    $('manualOrderSummary').textContent=`Thông báo: ${notification.title}\n${side} ${w.symbol} · MARKET · dùng giá hiện tại, không phải giá lúc phát thông báo.\nMargin ${Number.isFinite(margin)?margin:'—'} USDT ×5x = ${Number.isFinite(margin*5)?price(margin*5):'—'} USDT notional (quantity làm tròn, không tự nâng margin).\nMARK ${price(w.markPrice)} · TP ${price(tp)} · SL tham khảo ${price(sl)} (−30% ROE, neo giá khớp).\nVùng MAIN gốc ${price(w.zone.low)} – ${price(w.zone.high)}. Giá khớp có thể khác; phí/trượt giá chưa tính. Cap MAIN tự động + thủ công: 20.`;
  }
  async submit(){
    if(this.submitting||!this.selection)return;
    const margin=Number($('manualMargin').value),token=localStorage.getItem('orders_token')??'';
    if(!token){$('manualOrderResult').textContent='Đăng nhập Binance tại Orders rồi quay lại để gửi lệnh.';return;}
    if(!Number.isFinite(margin)||margin<=0||!$('manualConfirmed').checked){$('manualOrderResult').textContent='Nhập margin >0 và tick xác nhận MARKET thật.';return;}
    this.submitting=true;$('manualSubmit').disabled=$('manualClose').disabled=true;
    $('manualMargin').disabled=$('manualConfirmed').disabled=true;
    $('manualOrderResult').textContent='Đang gửi Binance… Không đặt lại khi kết quả chưa rõ.';
    const {w,side}=this.selection;
    try{
      const response=await fetch('/api/liquidity-zone-manager/order',{method:'POST',headers:{'content-type':'application/json','x-orders-token':token},
        body:JSON.stringify({watchId:w.id,side,zone:w.zone,referenceMark:w.markPrice,marginUsdt:margin,confirm:true}),signal:AbortSignal.timeout(60000)});
      const result=await response.json();if(!response.ok)throw Error(result.error??`HTTP ${response.status}`);
      $('manualOrderResult').textContent=(result.status==='SUBMITTED'&&result.orderId
        ?`Binance đã nhận ${result.side} ${result.symbol} · order ID ${result.orderId}. TP/SL chờ sự kiện khớp đầy đủ.`
        :`${result.status}: ${result.error??'Chưa xác nhận Binance đã nhận lệnh. Kiểm tra Orders trước khi thao tác thêm.'}`)
        +(result.replayed?'\nKết quả đã lưu; không gửi thêm lệnh.':'');
    }catch(error){$('manualOrderResult').textContent=`${error.message}\nNếu timeout/mất kết nối, kiểm tra Orders trước; không tự gửi lại cùng vùng.`;}
    finally{this.submitting=false;$('manualClose').disabled=false;$('manualMargin').disabled=$('manualConfirmed').disabled=false;}
  }
}
