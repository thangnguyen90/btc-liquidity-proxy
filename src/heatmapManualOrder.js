import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';

export const HEATMAP_MANUAL_ORDER_VERSION='HEATMAP_MANUAL_MARKET_LIMIT_GTC_V2_20261022';
const LEGACY_VERSION='HEATMAP_MANUAL_MARKET_MARGIN_LEVERAGE_V1_20261021';
const hash=x=>createHash('sha256').update(x).digest('hex');
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(x);
const unresolved=a=>['SUBMITTING','UNKNOWN','ERROR_OR_UNKNOWN'].includes(a.status);
const fail=message=>{throw Error(message);};
function inputOf(body){
 const symbol=String(body.symbol??'').trim().toUpperCase(),side=String(body.side??'').toUpperCase();
 if(!/^[\p{L}\p{N}]{1,32}USDT$/u.test(symbol))fail('Coin Binance USDT không hợp lệ.');
 if(!['LONG','SHORT'].includes(side))fail('Chọn LONG hoặc SHORT.');
 if(typeof body.marginUsdt!=='number'||!Number.isFinite(body.marginUsdt)||body.marginUsdt<.01||body.marginUsdt>100)fail('Margin phải từ 0,01 đến 100 USDT.');
 if(!Number.isInteger(body.leverage)||body.leverage<1||body.leverage>125)fail('Đòn bẩy phải là số nguyên từ 1 đến 125x.');
 const orderType=String(body.orderType??'MARKET').toUpperCase();
 if(!['MARKET','LIMIT'].includes(orderType))fail('Chỉ nhận MARKET hoặc LIMIT GTC.');
 if(orderType==='LIMIT'&&(typeof body.limitPrice!=='number'||!Number.isFinite(body.limitPrice)||body.limitPrice<=0))fail('Giá LIMIT phải là số lớn hơn 0.');
 if(!uuid(body.requestId)||!Number.isFinite(body.requestedAt))fail('Thiếu mã hoặc thời điểm xác nhận lệnh.');
 // Keep the exact V1 MARKET fingerprint, including field order, for old UUIDs.
 return {symbol,side,marginUsdt:body.marginUsdt,leverage:body.leverage,requestId:body.requestId,requestedAt:body.requestedAt,
  ...(orderType==='LIMIT'?{orderType,limitPrice:body.limitPrice}:{})};
}
export function buildHeatmapManualOrder(input,key,now=Date.now()){
 const x=inputOf(input);
 if(x.requestedAt>now+5000||now-x.requestedAt>120000)fail('Xác nhận đã cũ. Kiểm tra lại coin, số tiền và đòn bẩy.');
 return {source:'orders-manual',streamId:'heatmap-manual',executionPage:'coinglass-heatmap-lab',
  signalType:'ORDERS_MANUAL',signalLabel:'ORDERS_MANUAL',symbol:x.symbol,side:x.side==='LONG'?'BUY':'SELL',
  orderType:x.orderType??'MARKET',...(x.orderType==='LIMIT'?{limitPrice:x.limitPrice,timeInForce:'GTC'}:{}),marginUsdt:x.marginUsdt,notionalUsdt:x.marginUsdt*x.leverage,leverage:x.leverage,
  dryRun:false,allowMinNotionalCeil:false,protectionOnFill:true,clientOrderId:'hm_manual_'+key.slice(0,24),
  heatmapManualVersion:HEATMAP_MANUAL_ORDER_VERSION,entryExpiresAt:now+60000,
  signalReason:`${HEATMAP_MANUAL_ORDER_VERSION} | human confirmed ${x.orderType??'MARKET'} ${x.side}${x.orderType==='LIMIT'?' GTC price='+x.limitPrice:''} | margin=${x.marginUsdt} | leverage=${x.leverage} | chart is observe only`};
}
// Called by the authenticated server path, including immediately before entry.
// Chart matrices, scenario labels and client JSON never grant auto-entry authority.
export function assertHeatmapManualLive(p,c,now=Date.now()){
 if(c.authorized!==true||c.orderEnabled!==true)fail('Phiên Orders hết hạn hoặc Binance execution đang tắt.');
 if(c.excluded===true)fail('Coin đang tắt bảo vệ/tự động; không vào thêm từ Heatmap.');
 if(p.heatmapManualVersion!==HEATMAP_MANUAL_ORDER_VERSION||p.source!=='orders-manual'||p.streamId!=='heatmap-manual'
  ||p.executionPage!=='coinglass-heatmap-lab'||!['MARKET','LIMIT'].includes(p.orderType)||p.dryRun!==false||p.allowMinNotionalCeil!==false
  ||(p.orderType==='LIMIT'?!(Number.isFinite(p.limitPrice)&&p.limitPrice>0&&p.timeInForce==='GTC'):p.limitPrice!=null||p.timeInForce!=null)
  ||p.protectionOnFill!==true||!['BUY','SELL'].includes(p.side)||!Number.isFinite(p.entryExpiresAt)||p.entryExpiresAt<now
  ||p.entryExpiresAt>now+60000||!(p.marginUsdt>=.01&&p.marginUsdt<=100)||!Number.isInteger(p.leverage)||p.leverage<1||p.leverage>125
  ||p.notionalUsdt!==p.marginUsdt*p.leverage||!/^[\p{L}\p{N}]{1,32}USDT$/u.test(p.symbol)
  ||!/^hm_manual_[0-9a-f]{24}$/.test(p.clientOrderId)||!(c.markPrice>0)||!Number.isFinite(c.markPrice))fail('Kế hoạch MARKET/LIMIT hoặc giá đã cũ/không hợp lệ. Chưa gửi lệnh.');
 if(!Array.isArray(c.positions)||!Array.isArray(c.openOrders)||c.positions.some(x=>!Number.isFinite(Number(x.positionAmt))))fail('Chưa đủ dữ liệu vị thế/lệnh chờ để kiểm tra Binance.');
 if(c.positions.some(x=>x.symbol===p.symbol&&Number(x.positionAmt)!==0)
  ||c.openOrders.some(x=>x.symbol===p.symbol&&![true,'true'].includes(x.reduceOnly)&&![true,'true'].includes(x.closePosition)))fail('Coin đã có vị thế hoặc lệnh entry chờ; không DCA/đảo chiều từ Heatmap.');
}
export class HeatmapManualOrders{
 constructor({file,submit,now=Date.now}={}){Object.assign(this,{file,submit,now});this.state=null;this.queue=Promise.resolve();}
 async load(){
  if(this.state)return;
  this.loading??=(async()=>{try{
   const s=JSON.parse(await readFile(this.file,'utf8'));
   if(![HEATMAP_MANUAL_ORDER_VERSION,LEGACY_VERSION].includes(s.version)||!s.attempts||Array.isArray(s.attempts)||typeof s.attempts!=='object'
    ||Object.entries(s.attempts).some(([key,a])=>!a||a.key!==key||typeof a.accountKey!=='string'||!uuid(a.requestId)||typeof a.status!=='string'))throw Error('Invalid ledger');
   this.state=s;
  }catch(e){if(e.code!=='ENOENT')fail('Không đọc được sổ lệnh Heatmap; dừng gửi để kiểm tra.');this.state={version:HEATMAP_MANUAL_ORDER_VERSION,attempts:{}};}})();
  await this.loading;
 }
 async save(){this.state.version=HEATMAP_MANUAL_ORDER_VERSION;await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(this.state));await rename(tmp,this.file);}
 async get(requestId,accountKey){if(!uuid(requestId))fail('Mã lệnh không hợp lệ.');await this.load();return structuredClone(this.state.attempts[hash(accountKey+'|'+requestId)]??null);}
 execute(body,accountKey,context){
  const task=this.queue.then(async()=>{
   const x=inputOf(body),key=hash(accountKey+'|'+x.requestId),fingerprint=hash(JSON.stringify(x));await this.load();
   const previous=this.state.attempts[key];
   if(previous){if(previous.fingerprint!==fingerprint)fail('Mã xác nhận đã dùng với số tiền/coin/hướng khác. Không gửi thêm lệnh.');return {...structuredClone(previous),replayed:true};}
   if(Object.values(this.state.attempts).some(a=>a.accountKey===accountKey&&a.symbol===x.symbol&&unresolved(a)))fail('Coin có lệnh Heatmap đang gửi/chưa rõ kết quả. Kiểm tra Orders; không gửi lại.');
   const plan=buildHeatmapManualOrder(x,key,this.now()),a={...x,orderType:plan.orderType,key,accountKey,fingerprint,at:this.now(),clientOrderId:plan.clientOrderId,status:'SUBMITTING'};
   this.state.attempts[key]=a;await this.save(); // Durable reservation precedes leverage/order mutations.
   try{
    if(context?.enabled===false)throw Object.assign(Error('Binance execution đang tắt trong Settings. Không gửi lệnh.'),{beforeHeatmapManualMarket:true});
    const r=await this.submit(plan,context);a.status=r?.status==='submitted'&&r.orderResult?.orderId?'SUBMITTED':'UNKNOWN';
    a.orderId=r?.orderResult?.orderId??null;a.exchangeStatus=r?.orderResult?.status??null;a.executedQty=r?.orderResult?.executedQty??null;
    a.order=r?.order?{symbol:r.order.symbol,side:r.order.side,type:r.order.type,limitPrice:r.order.limitPrice,quantity:r.order.quantity,notionalUsdt:r.order.notionalUsdt,leverage:r.order.leverage,
     takeProfitPrice:r.order.takeProfitPrice,stopLossPrice:r.order.stopLossPrice,protectionOnFill:r.order.protectionOnFill}:null;
   }catch(e){a.errorCode=e.code!=null&&Number.isFinite(Number(e.code))?Number(e.code):null;
    a.status=e.beforeHeatmapManualMarket===true||[-2019,-4164].includes(a.errorCode)?'REJECTED':'ERROR_OR_UNKNOWN';a.error=String(e.message??'Chưa rõ kết quả Binance.').slice(0,500);}
   await this.save();return structuredClone(a);
  });this.queue=task.catch(()=>{});return task;
 }
}
