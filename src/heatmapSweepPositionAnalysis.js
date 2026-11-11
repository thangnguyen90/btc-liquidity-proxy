import {positionTokenPoint} from './pumpglassPositionJournal.js';
export const SWEEP_POSITION_VERSION='HEATMAP_SWEEP_POSITION_CONTEXT_V1_20261107';
const pct=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=100;
const time=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
const pair=x=>x.toFixed(1)+'% LONG / '+(100-x).toFixed(1)+'% SHORT';
const valid=(p,at)=>p&&!p.ambiguous&&Number.isFinite(p.sourceAt)&&Number.isFinite(p.observedAt)&&p.sourceAt<=p.observedAt&&p.observedAt<=at&&at-p.sourceAt<=900000&&p.observedAt-p.sourceAt<=900000&&p.whaleCount>=10&&['whaleLong','smartLong','crowdLong'].every(k=>pct(p[k]));
export function sweepPositionContext(e,{points=[],token=null,ratioRows=[],ratioReadAt=null,at=Date.now()}={}){
 const tokenPoint=token?positionTokenPoint(token,e.symbol,at):null;
 const p=[...points,tokenPoint].filter(p=>valid(p,at)).sort((a,b)=>a.sourceAt-b.sourceAt||a.observedAt-b.observedAt).at(-1);
 const previous=p?points.filter(q=>!q.ambiguous&&q.observedAt<=at&&q.sourceAt<=p.sourceAt-3600000&&p.sourceAt-3600000-q.sourceAt<=900000&&q.sourceAt<=q.observedAt&&q.observedAt-q.sourceAt<=900000&&q.whaleCount>=10&&['whaleLong','smartLong','crowdLong'].every(k=>pct(q[k]))).sort((a,b)=>a.sourceAt-b.sourceAt).at(-1):null;
 const ratio=Number.isFinite(ratioReadAt)&&ratioReadAt<=at&&at-ratioReadAt<=900000?ratioRows.filter(x=>Number.isFinite(+x.timestamp)&&+x.timestamp<=at-300000&&at-(+x.timestamp)<=900000&&Number.isFinite(+x.longShortRatio)&&+x.longShortRatio>0).sort((a,b)=>+a.timestamp-+b.timestamp).at(-1):null;
 const topLong=ratio?100*(+ratio.longShortRatio)/(1+(+ratio.longShortRatio)):null;
 let view='CHƯA ĐỦ DỮ LIỆU';
 if(p){const long=p.whaleLong>50&&p.smartLong>50,short=p.whaleLong<50&&p.smartLong<50;
  view=long?'CÁ VOI + SMART NGHIÊNG LONG':short?'CÁ VOI + SMART NGHIÊNG SHORT':'CÁ VOI VÀ SMART CHƯA ĐỒNG THUẬN';
  if(long||short){view+=' · '+(e.direction==='LOWER'?(long?'thiên hướng hồi sau quét dưới, chờ giá giữ lại vùng':'còn áp lực giảm sau quét dưới'):(short?'theo dõi phản ứng giảm sau quét trên':'còn áp lực tăng sau quét trên'));
   if((long&&p.crowdLong<40)||(short&&p.crowdLong>60))view+='; đám đông >60% ngược chiều';
   if(topLong!==null&&((long&&topLong<50)||(short&&topLong>50)))view+='; tài khoản top Binance trái chiều';
  }
 }
 return {version:SWEEP_POSITION_VERSION,symbol:e.symbol,at,sweepAt:e.at,point:p??null,previous:previous??null,top:ratio?{at:+ratio.timestamp,readAt:ratioReadAt,longPct:topLong,ratio:+ratio.longShortRatio}:null,view,observeOnly:true,affectsOrders:false};
}
export function sweepPositionFields(c){
 if(!c||c.version!==SWEEP_POSITION_VERSION)return [{name:'CÁ VOI / SMART / TOP TRADER',value:'Chưa có dữ liệu mới để phân tích. Không suy hướng từ dữ liệu thiếu.'}];
 const p=c.point,lines=p?['Cá voi: '+pair(p.whaleLong),'Smart traders: '+pair(p.smartLong),'Đám đông: '+pair(p.crowdLong),c.previous?'Δ tỷ trọng LONG ~1h: cá voi '+(p.whaleLong-c.previous.whaleLong).toFixed(1)+' điểm % · Smart '+(p.smartLong-c.previous.smartLong).toFixed(1)+' điểm %':'Δ1h: thiếu mốc đối chiếu hợp lệ.','Nguồn PumpGlass '+time(p.sourceAt)+' VN · '+p.whaleCount+' cá voi.']:['PumpGlass: thiếu dữ liệu mới ≤15 phút; không suy tỷ trọng hoặc hướng.'];
 lines.push(c.top?'Top Binance (tài khoản): '+pair(c.top.longPct)+' · L/S '+c.top.ratio.toFixed(3)+' · '+time(c.top.at)+' VN.':'Top Binance (tài khoản): thiếu dữ liệu mới ≤15 phút.');
 return [{name:'CÁ VOI · SMART · TOP BINANCE',value:lines.join('\n')},{name:'NHẬN XÉT VỊ THẾ · LÚC GỬI',value:c.view+'\nBối cảnh lúc '+time(c.at)+' VN; có thể sau lúc quét/entry. Tỷ trọng nhóm, không chứng minh từng người mở/đóng lệnh. Smart PumpGlass khác top tài khoản Binance. Tham khảo, chưa xác nhận đảo chiều; không là điều kiện vào lệnh.'}];
}
export class SweepPositionAnalysis{
 constructor({getPoints=()=>[],getRatio=()=>null,loadRatio=null,blocked=()=>false,fetchImpl=fetch,now=Date.now}={}){Object.assign(this,{getPoints,getRatio,loadRatio,blocked,fetchImpl,now});this.cache=new Map();this.reads=[];this.retryUntil=0;this.inflight=new Map();}
 async get(e){
  const at=this.now();if(!/^[\p{L}\p{N}]{1,32}USDT$/u.test(e.symbol??''))return null;
  let points=[];try{points=this.getPoints(e.symbol)??[];}catch{}
  const cached=this.cache.get(e.symbol),ratio=this.getRatio(e.symbol);let token=cached&&at-cached.at<=60000?cached.token:null,top=ratio??cached?.ratio??null;
  this.reads=this.reads.filter(t=>at-t<60000);
  if(this.reads.length<6&&at>=this.retryUntil&&!this.inflight.has(e.symbol)){
   this.reads.push(at);const task=(async()=>{const jobs=[];
    if(!token&&!points.some(p=>valid(p,at)))jobs.push((async()=>{try{const r=await this.fetchImpl('https://pumpglass.com/smart-money/api/token?symbol='+encodeURIComponent(e.symbol),{redirect:'error',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(1800)});if([403,418,429].includes(r.status))this.retryUntil=this.now()+900000;if(r.ok)token=await r.json();}catch{}})());
    if(this.loadRatio&&!this.blocked()&&(!top||!Number.isFinite(top.fetchedAt)||at-top.fetchedAt>60000))jobs.push((async()=>{try{top={rows:await this.loadRatio(e.symbol),fetchedAt:this.now()};}catch{}})());
    let deadline;try{await Promise.race([Promise.allSettled(jobs),new Promise(resolve=>{deadline=setTimeout(resolve,2100);})]);}finally{clearTimeout(deadline);}this.cache.set(e.symbol,{at:this.now(),token,ratio:top});while(this.cache.size>128)this.cache.delete(this.cache.keys().next().value);
   })();this.inflight.set(e.symbol,task);try{await task;}finally{this.inflight.delete(e.symbol);}
  }
  return structuredClone(sweepPositionContext(e,{points,token,ratioRows:top?.rows??[],ratioReadAt:top?.fetchedAt,at:this.now()}));
 }
}
