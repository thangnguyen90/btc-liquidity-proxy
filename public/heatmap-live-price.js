export const HEATMAP_LIVE_PRICE_VERSION='HEATMAP_SOCKET_MARK_OVERLAY_V1_20261022';
export const HEATMAP_LIVE_PRICE_MAX_AGE_MS=10000;
const sources=new Set(['BINANCE_FUTURES_MARK_PRICE_SOCKET','BINANCE_FUTURES_MARK_PRICE_SOCKET_CACHE']);
export class HeatmapLivePrice{
 constructor({onTick=()=>{},onState=()=>{},WebSocketImpl=globalThis.WebSocket,location=globalThis.location,now=()=>Date.now(),timers=globalThis}={}){
  Object.assign(this,{onTick,onState,WebSocketImpl,location,now,timers,symbol:null,socket:null,generation:0,retryMs:1000,lastEventAt:0,tick:null});
 }
 setSelection(symbol){
  symbol=typeof symbol==='string'&&/^[\p{L}\p{N}]{1,32}USDT$/u.test(symbol)?symbol:null;
  if(symbol===this.symbol)return;
  this.stop();this.symbol=symbol;this.lastEventAt=0;this.retryMs=1000;
  if(symbol)this.connect();else this.onState('idle');
 }
 stop(){
  this.generation++;this.timers.clearTimeout(this.retryTimer);this.timers.clearInterval(this.watchTimer);
  this.retryTimer=null;this.watchTimer=null;const socket=this.socket;this.socket=null;this.tick=null;this.onTick(null);
  try{socket?.close(1000,'heatmap selection changed');}catch{}
 }
 connect(){
  if(!this.symbol)return;
  if(!this.WebSocketImpl||!['http:','https:'].includes(this.location?.protocol)){this.onState('unavailable');return;}
  const generation=++this.generation,symbol=this.symbol;this.connectedAt=this.now();this.onState('connecting');
  const retry=()=>{
   if(generation!==this.generation)return;
   this.stop();this.onState('stale');
   const nextGeneration=this.generation,delay=this.retryMs;this.retryMs=Math.min(15000,delay*2);
   this.retryTimer=this.timers.setTimeout(()=>{if(nextGeneration===this.generation&&this.symbol===symbol)this.connect();},delay);
  };
  let socket;
  try{socket=new this.WebSocketImpl(`${this.location.protocol==='https:'?'wss:':'ws:'}//${this.location.host}/ws/coin-level-analysis?symbol=${encodeURIComponent(symbol)}`);this.socket=socket;}catch{retry();return;}
  socket.addEventListener('message',event=>{
   if(generation!==this.generation)return;
   let row;try{row=JSON.parse(event.data);}catch{return;}
   if(row?.type!=='mark'||row.symbol!==symbol||!sources.has(row.source))return;
   const markPrice=Number(row.markPrice),eventAt=Number(row.eventAt),now=this.now();
   if(!Number.isFinite(markPrice)||markPrice<=0||!Number.isFinite(eventAt)||eventAt<=0||eventAt>now+2000||now-eventAt>HEATMAP_LIVE_PRICE_MAX_AGE_MS||eventAt<=this.lastEventAt)return;
   this.tick={symbol,markPrice,eventAt};this.lastEventAt=eventAt;this.retryMs=1000;this.onTick(this.tick);this.onState('live');
  });
  socket.addEventListener('close',retry);
  socket.addEventListener('error',retry);
  this.watchTimer=this.timers.setInterval(()=>{
   if(generation===this.generation&&this.now()-(this.tick?.eventAt??this.connectedAt)>HEATMAP_LIVE_PRICE_MAX_AGE_MS)retry();
  },1000);
 }
}
