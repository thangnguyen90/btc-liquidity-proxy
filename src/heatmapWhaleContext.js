import {heatmapConsensusZones} from './heatmapEntryScenarios.js';
import {classifyPumpglassLong} from './pumpglassLongDiscordWatch.js';
export const HEATMAP_WHALE_CONTEXT_VERSION='HEATMAP_WHALE_CONTEXT_V1_20261102';
const pct=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100?v:null;
const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const positive=v=>finite(v)>0?v:null;
export function normalizeWhaleContext(raw,symbol,now){
 if(raw?.symbol!==symbol||!['whales','smart'].includes(raw.basis)||!Array.isArray(raw.now)||!Number.isFinite(raw.scanned_at)||raw.scanned_at*1000>now)throw Error('INVALID_SOURCE');
 const ratios={};for(const[key,label]of Object.entries({whales:'Whales',smart:'Smart traders',crowd:'Crowd'})){
  const matches=raw.now.filter(x=>x?.k===label);const x=matches.length===1?matches[0]:null;
  ratios[key]={longPct:pct(x?.v),shortPct:pct(x?.v)!==null?100-x.v:null,long7dAgoPct:pct(x?.was)};
 }
 if(ratios.crowd.longPct===null||ratios[raw.basis].longPct===null)throw Error('MISSING_RATIOS');
 const side=x=>({count:Number.isInteger(x?.count)&&x.count>=0?x.count:null,sizeUsd:finite(x?.size_usd)!==null&&x.size_usd>=0?x.size_usd:null,avgEntry:positive(x?.avg_entry),pnlUsd:finite(x?.pnl_usd),inProfitPct:pct(x?.in_profit_pct)});
 return {symbol,basis:raw.basis,whaleCount:Number.isInteger(raw.whale_count)&&raw.whale_count>=0?raw.whale_count:null,source:'PUMPGLASS',sourceAt:raw.scanned_at*1000,readAt:now,price:positive(raw.price),change24hPct:finite(raw.change_24h),ratios,long:side(raw.long),short:side(raw.short)};
}
export function assessWhaleHeatmap({token,bundle,symbol,range,expectedEnd,now=Date.now()}={}){
 const out={status:'WAIT',title:'CHƯA ĐỦ BỐI CẢNH',reasons:[],whaleBias:null,group:null,liquidity:null,observeOnly:true,affectsOrders:false};
 if(!token||token.symbol!==symbol||now<token.sourceAt||now-token.sourceAt>900000){out.reasons.push('Dữ liệu cá voi thiếu hoặc cũ quá 15 phút.');return out;}
 const w=token.ratios.whales.longPct,c=token.ratios.crowd.longPct;
 if(token.basis!=='whales'||!(token.whaleCount>=10)||w===null){out.reasons.push('Nguồn đang dùng nhóm smart hoặc có ít hơn 10 cá voi; chưa phân loại hướng cá voi.');return out;}
 out.whaleBias=w>=60?'LONG':w<=40?'SHORT':'BALANCED';out.group=classifyPumpglassLong(w,c);
 if(!expectedEnd){out.title='ĐANG CHỜ HAI MODEL';out.reasons.push('Cá voi đã có dữ liệu; chờ hai model của chart đang chọn tải xong.');return out;}
 const a=bundle?.models?.find(m=>m.model===1&&m.status==='OK')?.data,b=bundle?.models?.find(m=>m.model===3&&m.status==='OK')?.data;
 if(!a||!b||[a,b].some(d=>d.source!=='BINANCE_LOCAL'||d.symbol!==symbol||d.range!==range||d.end!==expectedEnd)||a.step!==b.step||!(a.step>0)||now<a.end||now-a.end>a.step+120000){out.reasons.push('Hai model chưa trùng coin/khung/mốc nến hoặc đã cũ.');return out;}
 if([a,b].some(d=>!(d.inputs?.markCoveragePct>=100))||!(b.inputs?.oiCoveragePct>=95)){out.reasons.push('Chưa đủ MARK đầy đủ và OI ≥95% để đánh giá ghép theo chuẩn nghiên cứu.');return out;}
 const candles=a.candles,latest=candles?.at(-1),prior=candles?.at(-2);if(!latest||!prior||latest.time+a.step!==a.end||prior.time+a.step!==latest.time){out.reasons.push('Thiếu chuỗi nến đóng đồng bộ.');return out;}
 const merged=heatmapConsensusZones(a,b,a.end-a.step-1,a.step,latest.close);if(merged.status!=='OK'){out.reasons.push('Chưa đủ ba profile đồng thuận mới của Model 1/3.');return out;}
 const price=latest.close,score=(lo,hi)=>merged.zones.reduce((sum,z)=>sum+Math.max(0,Math.log(Math.min(hi,z.high)/Math.max(lo,z.low))/.0025)*z.overlapStrength,0);
 const upperScore=score(price,price*1.05),lowerScore=score(price*.95,price);
 const nearestAbove=merged.zones.filter(z=>z.low>Math.max(price,latest.high)).sort((x,y)=>x.low-y.low)[0]??null,nearestBelow=merged.zones.filter(z=>z.high<Math.min(price,latest.low)).sort((x,y)=>y.high-x.high)[0]??null;
 out.liquidity={asOf:a.end-a.step,chartEnd:a.end,step:a.step,referencePrice:price,upperScore,lowerScore,upperDominant:upperScore>0&&upperScore>=2*lowerScore,nearestAbove,nearestBelow,aboveDistancePct:nearestAbove?(nearestAbove.low/price-1)*100:null,belowDistancePct:nearestBelow?(1-nearestBelow.high/price)*100:null};
 const preference=bundle.scenarios?.symbol===symbol&&bundle.scenarios?.range===range?bundle.scenarios.preference:'WAIT';
 if(out.whaleBias==='BALANCED'){out.title='CÁ VOI CHƯA NGHIÊNG RÕ HƯỚNG';out.reasons.push('Tỷ trọng LONG cá voi nằm giữa 40% và 60%.');}
 else if(['LONG','SHORT'].includes(preference)&&preference!==out.whaleBias){out.status='CONFLICT';out.title='CÁ VOI VÀ GIÁ ĐANG XUNG ĐỘT';out.reasons.push(`Cá voi nghiêng ${out.whaleBias}, kịch bản giá của hai model đang nghiêng ${preference}.`);}
 else if(preference===out.whaleBias){out.status='ALIGNED';out.title=`CÙNG HƯỚNG QUAN SÁT ${out.whaleBias}`;out.reasons.push(`Tỷ trọng cá voi và kịch bản giá hiện có cùng hướng ${out.whaleBias}; đây chưa phải xác suất thắng hoặc lệnh vào.`);}
 else {out.title=`CÁ VOI NGHIÊNG ${out.whaleBias} · CHỜ GIÁ XÁC NHẬN`;out.reasons.push('Kịch bản giá chưa đủ điều kiện cùng hướng; tỷ trọng cá voi không tự tạo điểm vào.');}
 out.reasons.push(upperScore===0&&lowerScore===0?'Chưa có cụm đồng thuận đủ mạnh trong ±5%; không đồng nghĩa thị trường không có thanh khoản.':`Điểm cụm ước lượng trong ±5%: trên ${upperScore.toFixed(0)}, dưới ${lowerScore.toFixed(0)}. Cụm trên mạnh chưa chứng minh giá sẽ tăng.`);
 if(out.whaleBias==='SHORT')out.reasons.push('Nhóm đi theo SHORT cá voi chưa có kết quả tốt trong backtest vừa thực hiện.');
 if(a.step!==300000)out.reasons.push('Chart này không dùng nến 5m; khác khung của backtest kết hợp vừa chạy.');
 out.reasons.push('Giá vốn/PnL là snapshot hiện tại của nguồn; chưa kiểm chứng hiệu quả lịch sử.');
 return out;
}
export class HeatmapWhaleContext{
 constructor({getBundle=()=>null,fetchImpl=fetch,now=Date.now}={}){Object.assign(this,{getBundle,fetchImpl,now});this.cache=new Map();this.pending=new Map();this.nextAt=0;this.retryUntil=0;}
 async get({symbol,range='24h',expectedEnd=0}){
  if(!/^[\p{L}\p{N}]{1,32}USDT$/u.test(symbol??'')||!['12h','24h','3d','7d','30d'].includes(range)||!Number.isFinite(expectedEnd)||expectedEnd<0||expectedEnd>this.now())throw Error('INVALID_QUERY');
  let cached=this.cache.get(symbol),error=null;
  if(!cached||this.now()-cached.readAt>=60000){
   if(this.pending.has(symbol))await this.pending.get(symbol);
   else if(this.now()<this.retryUntil||this.pending.size>=2||this.now()<this.nextAt)error='Đang giới hạn tải nguồn, thử lại sau.';
   else{
    this.nextAt=this.now()+1000;
    const job=(async()=>{try{
     const r=await this.fetchImpl('https://pumpglass.com/smart-money/api/token?symbol='+encodeURIComponent(symbol),{redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});
     if(!r.ok){if([403,418,429].includes(r.status))this.retryUntil=this.now()+15*60000;throw Error('UPSTREAM');}
     const token=normalizeWhaleContext(await r.json(),symbol,this.now());this.cache.set(symbol,token);while(this.cache.size>200)this.cache.delete(this.cache.keys().next().value);
    }catch{error='Không tải được dữ liệu cá voi mới.';}finally{this.pending.delete(symbol);}})();
    this.pending.set(symbol,job);await job;
   }
  }
  cached=this.cache.get(symbol);const stale=!cached||this.now()-cached.sourceAt>900000||this.now()<cached.sourceAt||this.now()-cached.readAt>=120000;
  const assessment=assessWhaleHeatmap({token:!stale?cached:null,bundle:this.getBundle({symbol,range}),symbol,range,expectedEnd,now:this.now()});
  return {version:HEATMAP_WHALE_CONTEXT_VERSION,symbol,range,observeOnly:true,affectsOrders:false,status:cached?(stale?'STALE':'OK'):'UNAVAILABLE',error,token:cached??null,assessment,generatedAt:this.now()};
 }
}
