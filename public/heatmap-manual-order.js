export const HEATMAP_MANUAL_ORDER_UI_VERSION='HEATMAP_MANUAL_ORDER_UI_LIMIT_GTC_V2_20261022';
const ENDPOINT='/api/coinglass-heatmap-lab/order',STORE='heatmap_manual_order_requests_v1';
export function mountHeatmapManualOrders(){
 const $=id=>document.getElementById(id);let selection=null,busy=false,records={},limitEnabled=false;
 try{const saved=JSON.parse(localStorage.getItem(STORE)??'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))records=saved;}catch{}
 const token=()=>{try{return localStorage.getItem('orders_token')??'';}catch{return '';}};
 const save=()=>{try{localStorage.setItem(STORE,JSON.stringify(records));}catch{}}
 const say=text=>{$('heatmapOrderResult').textContent=text;};
 function render(){
  const pending=selection&&records[selection.symbol],blocked=pending&&!pending.final;
  $('heatmapOrderCoin').textContent=selection?.symbol??'Tìm coin Binance thật trước';
  $('heatmapOrderLong').disabled=$('heatmapOrderShort').disabled=busy||!selection||!!blocked;
  const limitPrice=Number($('heatmapOrderLimitPrice').value),validLimit=Number.isFinite(limitPrice)&&limitPrice>0;
  $('heatmapOrderLimitLong').disabled=$('heatmapOrderLimitShort').disabled=busy||!selection||!!blocked||!validLimit||!limitEnabled;
  $('heatmapOrderMargin').disabled=$('heatmapOrderLeverage').disabled=$('heatmapOrderLimitPrice').disabled=busy;
  $('heatmapOrderCheck').disabled=busy||!pending;
  const margin=Number($('heatmapOrderMargin').value),leverage=Number($('heatmapOrderLeverage').value);
  $('heatmapOrderSummary').textContent=Number.isFinite(margin)&&margin>0&&Number.isInteger(leverage)&&leverage>0
   ?`Margin ${margin} USDT × ${leverage}x = ${Number((margin*leverage).toPrecision(10))} USDT giá trị vị thế dự tính. ${!limitEnabled?'LIMIT chưa sẵn sàng: đang chờ backend xác nhận hỗ trợ. ':validLimit?`LIMIT GTC tại ${limitPrice} USDT; quantity tính theo giá LIMIT. `:'Nhập giá chờ để bật hai nút LIMIT. '}MARKET vẫn dùng giá thị trường; không dùng ô giá LIMIT.`
   :'Nhập margin USDT và đòn bẩy hợp lệ.';
 }
 function resultOf(r,original){
  const symbol=r.symbol??original.symbol,side=r.side??original.side,type=r.orderType??original.orderType??'MARKET',limitPrice=r.order?.limitPrice??r.limitPrice??original.limitPrice;
  if(r.status==='SUBMITTED'&&r.orderId){
   say(`Binance đã nhận ${type} ${side} ${symbol}${type==='LIMIT'?' · giá '+limitPrice+' USDT · GTC':''} · order ID ${r.orderId} · ${r.marginUsdt??original.marginUsdt} USDT ×${r.leverage??original.leverage}x. Trạng thái sàn: ${r.exchangeStatus??'chờ đối soát'}. ${type==='LIMIT'?'Lệnh chờ đến khi khớp/hủy, không tự chuyển MARKET; xem/hủy ở Orders hoặc Binance. ':''}TP/SL theo chính sách lệnh tay, chờ xử lý sự kiện khớp; không coi đây là xác nhận TP/SL đã đặt.`);
   return true;
  }
  if(r.status==='REJECTED'){say(`${type} ${side} ${symbol} bị chặn hoặc Binance từ chối: ${r.error??'Kiểm tra an toàn không đạt.'}`);return true;}
  say(`${side} ${symbol}: ${r.status??'UNKNOWN'} · ${r.error??r.message??'Lệnh đang gửi hoặc chưa rõ kết quả.'} Không gửi lại. Bấm Kiểm tra kết quả hoặc xem Orders.`);return false;
 }
 async function submit(side,orderType='MARKET'){
  if(busy||!selection)return;
  if(orderType==='LIMIT'&&!limitEnabled){say('Backend chưa xác nhận hỗ trợ LIMIT GTC. Chưa gửi lệnh. Tải lại sau khi backend cập nhật.');return;}
  const chosen={...selection},marginUsdt=Number($('heatmapOrderMargin').value),leverage=Number($('heatmapOrderLeverage').value),auth=token();
  if(!auth){say('Đăng nhập Binance tại trang Orders rồi quay lại để đặt lệnh.');return;}
  if(records[chosen.symbol]&&!records[chosen.symbol].final){say('Coin có yêu cầu chưa rõ kết quả. Kiểm tra Orders, không gửi lại.');return;}
  if(!Number.isFinite(marginUsdt)||marginUsdt<.01||marginUsdt>100||!Number.isInteger(leverage)||leverage<1||leverage>125){say('Margin 0,01–100 USDT; đòn bẩy nguyên 1–125x, còn phụ thuộc giới hạn của coin trên Binance.');return;}
  const limitPrice=Number($('heatmapOrderLimitPrice').value);
  if(orderType==='LIMIT'&&(!Number.isFinite(limitPrice)||limitPrice<=0)){say('Nhập giá LIMIT lớn hơn 0.');return;}
  if(!confirm(`Đặt LỆNH THẬT Binance ${orderType} ${side} ${chosen.symbol}?\nMargin ${marginUsdt} USDT × ${leverage}x = ${marginUsdt*leverage} USDT.\n${orderType==='LIMIT'?`Giá LIMIT ${limitPrice} USDT · GTC, có thể khớp ngay nếu cắt giá thị trường. Chờ đến khi khớp/hủy tại Orders/Binance; không tự chuyển MARKET.`:'Dùng giá thị trường khi gửi, không phải giá trên chart; bỏ qua ô giá LIMIT.'}\nTP/SL dùng chính sách lệnh tay Orders hiện có sau khi khớp. Không DCA/đảo chiều vị thế đang mở.`))return;
  const request={symbol:chosen.symbol,side,orderType,...(orderType==='LIMIT'?{limitPrice}:{}),marginUsdt,leverage,requestId:crypto.randomUUID(),requestedAt:Date.now(),confirm:true};
  records[chosen.symbol]={...request,final:false};save();busy=true;render();say(`Đang gửi ${orderType} ${side} ${chosen.symbol}… Không bấm lại khi kết quả chưa rõ.`);
  try{
   const response=await fetch(ENDPOINT,{method:'POST',headers:{'content-type':'application/json','x-orders-token':auth},body:JSON.stringify(request),signal:AbortSignal.timeout(60000)});
   if([401,403,404,405].includes(response.status)){delete records[chosen.symbol];save();}
   const result=await response.json().catch(()=>({error:`HTTP ${response.status} · phản hồi không hợp lệ`}));
   if(!response.ok)throw Error(result.error??`HTTP ${response.status}`);
   records[chosen.symbol].final=resultOf(result,request);save();
  }catch(error){say(`${side} ${chosen.symbol}: ${error.message}\nChưa xác nhận gửi/khớp. Kiểm tra kết quả hoặc Orders trước; trang không tự gửi lại.`);}
  finally{busy=false;render();}
 }
 async function check(){
  if(busy||!selection)return;const request=records[selection.symbol],auth=token();if(!request)return;
  if(!auth){say('Đăng nhập Orders để kiểm tra đúng tài khoản.');return;}
  busy=true;render();
  try{
   const response=await fetch(ENDPOINT+'?'+new URLSearchParams({requestId:request.requestId}),{cache:'no-store',headers:{'x-orders-token':auth},signal:AbortSignal.timeout(12000)}),result=await response.json();
   if(!response.ok)throw Error(result.error??`HTTP ${response.status}`);
   records[request.symbol].final=resultOf(result,request);save();
  }catch(error){say(`Kiểm tra ${request.symbol}: ${error.message}. Không gửi lại khi chưa rõ kết quả.`);}
  finally{busy=false;render();}
 }
 $('heatmapOrderLong').addEventListener('click',()=>void submit('LONG'));
 $('heatmapOrderShort').addEventListener('click',()=>void submit('SHORT'));
 $('heatmapOrderLimitLong').addEventListener('click',()=>void submit('LONG','LIMIT'));
 $('heatmapOrderLimitShort').addEventListener('click',()=>void submit('SHORT','LIMIT'));
 $('heatmapOrderCheck').addEventListener('click',()=>void check());
 for(const id of ['heatmapOrderMargin','heatmapOrderLeverage','heatmapOrderLimitPrice'])$(id).addEventListener('input',render);
 render();
 return {setCapabilities(value){limitEnabled=value?.version==='HEATMAP_MANUAL_MARKET_LIMIT_GTC_V2_20261022'&&value.limitTimeInForce==='GTC'&&Array.isArray(value.orderTypes)&&value.orderTypes.includes('LIMIT');render();},setSelection(value){if(selection?.symbol!==value?.symbol)$('heatmapOrderLimitPrice').value='';selection=value?{symbol:value.symbol,range:value.range}:null;render();if(selection&&records[selection.symbol]&&!records[selection.symbol].final)say(`Có yêu cầu ${selection.symbol} chưa rõ kết quả từ trước. Bấm Kiểm tra kết quả; không gửi lại.`);}};
}
