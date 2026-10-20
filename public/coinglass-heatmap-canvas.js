import {heatmapColor} from './coinglass-heatmap-model.js?v=20261018-v3';
const time=x=>new Date(x).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'});
export const priceText=x=>Number(x).toLocaleString('en-US',{maximumSignificantDigits:6});
function nearest(a,x,value=v=>v){let lo=0,hi=a.length-1;while(lo<hi){const m=Math.floor((lo+hi)/2);if(value(a[m])<x)lo=m+1;else hi=m;}return lo>0&&Math.abs(value(a[lo-1])-x)<Math.abs(value(a[lo])-x)?lo-1:lo;}
export class HeatmapCanvas{
 constructor(canvas,{tooltip,onView=()=>{}}={}){
  Object.assign(this,{canvas,tooltip,onView,data:null,options:{floor:.05,log:true},domain:null,view:null});
  this.base=document.createElement('canvas');this.ctx=canvas.getContext('2d');this.bctx=this.base.getContext('2d');
  this.resizeObserver=new ResizeObserver(()=>this.draw());this.resizeObserver.observe(canvas.parentElement);
  canvas.addEventListener('pointerdown',e=>{this.drag={x:e.clientX,view:[...(this.view??[])]};canvas.setPointerCapture(e.pointerId);this.inspect(e);});
  canvas.addEventListener('pointermove',e=>{if(this.drag?.view.length&&Math.abs(e.clientX-this.drag.x)>4){const delta=(e.clientX-this.drag.x)/this.plot.w*(this.drag.view[1]-this.drag.view[0]);this.onView([this.drag.view[0]-delta,this.drag.view[1]-delta]);}else this.inspect(e);});
  canvas.addEventListener('pointerup',()=>{this.drag=null;});canvas.addEventListener('pointercancel',()=>{this.drag=null;});
  canvas.addEventListener('pointerleave',()=>{if(!this.drag){this.tooltip.hidden=true;this.paint();}});
  canvas.addEventListener('wheel',e=>{if(!this.data)return;e.preventDefault();const r=canvas.getBoundingClientRect(),p=Math.max(0,Math.min(1,(e.clientX-r.left-this.plot.x)/this.plot.w)),anchor=this.view[0]+p*(this.view[1]-this.view[0]),factor=e.deltaY>0?1.22:.82;this.onView([anchor-(anchor-this.view[0])*factor,anchor+(this.view[1]-anchor)*factor]);},{passive:false});
 }
 set(data,domain,view,options){if(this.data!==data){this.columns=data?Array.from({length:data.candles.length},()=>[]):[];for(const c of data?.cells??[])this.columns[c[0]].push(c);}this.data=data;this.domain=domain;this.view=view;this.options=options;this.draw();}
 draw(){
  const rect=this.canvas.parentElement.getBoundingClientRect(),w=Math.max(240,rect.width),h=Math.max(340,rect.height),dpr=Math.min(2,devicePixelRatio||1);
  this.w=w;this.h=h;for(const c of [this.canvas,this.base]){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';
  this.ctx.setTransform(dpr,0,0,dpr,0,0);this.bctx.setTransform(dpr,0,0,dpr,0,0);this.plot={x:10,y:16,w:w-92,h:h-54};
  const ctx=this.bctx,p=this.plot;ctx.fillStyle='#30003d';ctx.fillRect(0,0,w,h);
  if(!this.data||!this.domain){ctx.fillStyle='#d8b8e7';ctx.font='13px system-ui';ctx.textAlign='center';ctx.fillText('Chưa có ma trận heatmap cho model này',w/2,h/2);this.paint();return;}
  const d=this.data,[start,end]=this.view,[low,high]=this.domain.price,x=t=>p.x+(t-start)/(end-start)*p.w,y=v=>p.y+(high-v)/(high-low)*p.h;
  this.toX=x;this.toY=y;
  ctx.save();ctx.beginPath();ctx.rect(p.x,p.y,p.w,p.h);ctx.clip();
  const floor=d.maxIntensity*this.options.floor;
  for(const [ix,iy,value] of d.cells){if(value<=0||value<floor)continue;const bar=d.candles[ix],next=Math.min(d.candles[ix+1]?.time??bar.time+d.step,bar.time+d.step);if(next<start||bar.time>end)continue;
   const v=d.y[iy],bottom=iy? (d.y[iy-1]+v)/2:v-(d.y[1]-v)/2,top=iy+1<d.y.length?(d.y[iy+1]+v)/2:v+(v-d.y[iy-1])/2;
   ctx.fillStyle=heatmapColor(value,d.maxIntensity,this.options.log);ctx.fillRect(x(bar.time),y(top),Math.max(.3,x(next)-x(bar.time)),Math.max(.3,y(bottom)-y(top)));
  }
  ctx.strokeStyle='#ffffff17';ctx.lineWidth=.5;for(let i=0;i<=6;i++){const yy=p.y+i*p.h/6;ctx.beginPath();ctx.moveTo(p.x,yy);ctx.lineTo(p.x+p.w,yy);ctx.stroke();}
  for(const c of d.candles){if(c.time<start-d.step||c.time>end)continue;const xx=x(c.time+d.step/2),body=Math.max(1,Math.min(5,p.w/(end-start)*d.step*.6));ctx.strokeStyle=ctx.fillStyle=c.close>=c.open?'#17d6a0':'#ff4f77';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(xx,y(c.high));ctx.lineTo(xx,y(c.low));ctx.stroke();ctx.fillRect(xx-body/2,Math.min(y(c.open),y(c.close)),body,Math.max(1,Math.abs(y(c.open)-y(c.close))));}
  const last=d.candles.at(-1);ctx.setLineDash([4,4]);ctx.strokeStyle='#ffe469';ctx.beginPath();ctx.moveTo(p.x,y(last.close));ctx.lineTo(p.x+p.w,y(last.close));ctx.stroke();ctx.setLineDash([]);
  if(d.source==='DEMO'){ctx.globalAlpha=.45;ctx.fillStyle='#fff';ctx.textAlign='center';const text='DEMO · KHÔNG PHẢI COINGLASS';ctx.font='bold 22px system-ui';const size=Math.min(22,22*p.w*.9/ctx.measureText(text).width);ctx.font=`bold ${size}px system-ui`;ctx.fillText(text,p.x+p.w/2,p.y+p.h/2);ctx.globalAlpha=1;}
  ctx.restore();ctx.font='11px system-ui';ctx.fillStyle='#e8d6ee';ctx.textAlign='left';
  for(let i=0;i<=6;i++){const value=high-i*(high-low)/6;ctx.fillText(priceText(value),p.x+p.w+8,p.y+i*p.h/6+4);}
  for(let i=0;i<=4;i++){ctx.textAlign=i===0?'left':i===4?'right':'center';ctx.fillText(time(start+i*(end-start)/4),p.x+i*p.w/4,p.y+p.h+20);}
  ctx.textAlign='left';ctx.fillStyle='#dbc3e1';ctx.fillText(d.source==='DEMO'?'Dữ liệu dựng minh họa renderer':d.source==='IMPORT'?'JSON người dùng · nguồn chưa xác minh':d.source==='BINANCE_LOCAL'?'BINANCE · TỰ TÍNH ƯỚC LƯỢNG · không phải USD':'Nguồn chưa xác minh',p.x,this.h-5);
  this.paint();
 }
 paint(){if(this.ctx){this.ctx.clearRect(0,0,this.w??0,this.h??0);this.ctx.drawImage(this.base,0,0,this.w??0,this.h??0);}}
 inspect(event){
  if(!this.data||!this.plot||!this.view)return;const rect=this.canvas.getBoundingClientRect(),px=event.clientX-rect.left,py=event.clientY-rect.top,p=this.plot;
  if(px<p.x||px>p.x+p.w||py<p.y||py>p.y+p.h)return;
  const t=this.view[0]+(px-p.x)/p.w*(this.view[1]-this.view[0]),price=this.domain.price[1]-(py-p.y)/p.h*(this.domain.price[1]-this.domain.price[0]),ix=nearest(this.data.candles,t,c=>c.time+this.data.step/2),iy=nearest(this.data.y,price),c=this.data.candles[ix],cell=this.columns[ix].find(z=>z[1]===iy);
  this.paint();const ctx=this.ctx;ctx.strokeStyle='#fff9';ctx.lineWidth=.7;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(px,p.y);ctx.lineTo(px,p.y+p.h);ctx.moveTo(p.x,py);ctx.lineTo(p.x+p.w,py);ctx.stroke();ctx.setLineDash([]);
  this.tooltip.textContent=`${new Date(c.time).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} VN\nVùng giá ${priceText(this.data.y[iy])}\nCường độ ${cell?cell[2].toLocaleString('en-US'):'không có ô dữ liệu'}${this.data.source==='BINANCE_LOCAL'?' /100 · ước lượng':''}\nO ${priceText(c.open)} · H ${priceText(c.high)}\nL ${priceText(c.low)} · C ${priceText(c.close)}`;
  this.tooltip.style.left=Math.max(4,Math.min(this.w-240,px+14))+'px';this.tooltip.style.top=Math.max(4,Math.min(this.h-142,py+12))+'px';this.tooltip.hidden=false;
 }
}
