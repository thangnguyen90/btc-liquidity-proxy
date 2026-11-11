import {heatmapConsensusZones} from './heatmapEntryScenarios.js';
import {sweepPositionFields,SWEEP_POSITION_VERSION} from './heatmapSweepPositionAnalysis.js';
export const PUMP_TURN_COMBINED_VERSION='PUMP_TURN_MODEL13_POSITION_CONTEXT_V1_20261107';
const n=x=>typeof x==='number'&&Number.isFinite(x),f=x=>n(x)?Number(x.toPrecision(7)).toString():'—';
const time=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
export const MODEL13_CONTEXT_MAX_AGE_MS=420000;
export function model13NearbyContext({bundle,symbol,price,at,observedHigh=price,observedLow=price}){
 if(![price,observedHigh,observedLow].every(n)||price<=0||observedLow<=0||observedLow>price||observedHigh<price)return null;
 const a=bundle?.models?.find(m=>m.model===1&&m.status==='OK')?.data,b=bundle?.models?.find(m=>m.model===3&&m.status==='OK')?.data;
 if(!a||!b||![a,b].every(d=>d.symbol===symbol&&d.range==='24h'&&d.source==='BINANCE_LOCAL'&&d.step===300000
  &&d.end===a.end&&d.end<=at&&at-d.end<=MODEL13_CONTEXT_MAX_AGE_MS&&d.inputs?.markCoveragePct>=100
  &&d.profiles?.slice(-3).length===3&&d.profiles.slice(-3).every(p=>p.mark))||!(b.inputs?.oiCoveragePct>=95))return null;
 const c=a.candles?.at(-1),prev=a.candles?.at(-2);
 if(!c||c.time+a.step!==a.end||b.candles?.at(-1)?.time!==c.time)return null;
 const merged=heatmapConsensusZones(a,b,a.end-1,a.step,price);
 if(merged.status!=='OK')return null;
 const score=(lo,hi)=>merged.zones.reduce((s,z)=>s+Math.max(0,Math.log(Math.min(hi,z.high)/Math.max(lo,z.low))/.0025)*z.overlapStrength,0);
 const above=merged.zones.filter(z=>z.low>Math.max(observedHigh,c.high)&&z.low<=price*1.05).sort((x,y)=>x.low-y.low)[0]??null;
 const below=merged.zones.filter(z=>z.high<Math.min(observedLow,c.low)&&z.high>=price*.95).sort((x,y)=>y.high-x.high)[0]??null;
 return {at:a.end,price,upperScore:score(price,price*1.05),lowerScore:score(price*.95,price),above,below,
  aboveDistancePct:above?(above.low/price-1)*100:null,belowDistancePct:below?(1-below.high/price)*100:null,
  priceState:prev&&prev.time+a.step===c.time?(c.close>prev.high?'Đóng trên đỉnh nến trước':c.close<prev.low?'Đóng dưới đáy nến trước':'Chưa đóng ra ngoài biên nến trước'):'Thiếu nến đối chiếu'};
}
export function pumpTurnCombinedContext(e,{bundle=null,position=null,at=Date.now()}={}){
 const out={version:PUMP_TURN_COMBINED_VERSION,symbol:e.symbol,at,observedAt:e.observedAt,originalSide:e.side,position:null,model:null,state:'MISSING',view:'CHƯA ĐỦ DỮ LIỆU GHÉP',observeOnly:true,affectsOrders:false};
 if(position?.version===SWEEP_POSITION_VERSION&&position.symbol===e.symbol&&n(position.at)&&position.at<=at&&at-position.at<=30000)out.position=position;
 if(n(e.liveAt)&&e.liveAt<=at&&at-e.liveAt<=30000)out.model=model13NearbyContext({bundle,symbol:e.symbol,price:e.livePrice,at});
 const p=out.position?.point,m=out.model;
 if(!p||!m)return out;
 const w=p.whaleLong>=60&&p.smartLong>=60?'LONG':p.whaleLong<=40&&p.smartLong<=40?'SHORT':null;
 const target=w==='LONG'?m.above:w==='SHORT'?m.below:null;
 const liquidity=m.upperScore>m.lowerScore?'LONG':m.lowerScore>m.upperScore?'SHORT':null;
 const top=out.position.top,topOpposite=w&&top&&(w==='LONG'?top.longPct<50:top.longPct>50);
 if(w&&target&&liquidity===w&&!topOpposite){out.state='WATCH_'+w;out.view='CÙNG HƯỚNG QUAN SÁT '+w+' · CHƯA XÁC NHẬN ENTRY';}
 else if(w&&((liquidity&&liquidity!==w)||topOpposite)){out.state='CONFLICT';out.view='VỊ THẾ / THANH KHOẢN ĐANG TRÁI CHIỀU';}
 else {out.state='WAIT';out.view=w?'CÁ VOI + SMART NGHIÊNG '+w+' · CHƯA ĐỦ ĐỒNG THUẬN MODEL':'CÁ VOI + SMART CHƯA CÙNG NGHIÊNG ≥60%';}
 out.whaleSide=w;out.liquiditySide=liquidity;out.topOpposite=!!topOpposite;
 return out;
}
export function pumpTurnCombinedFields(c){
 if(!c||c.version!==PUMP_TURN_COMBINED_VERSION)return [{name:'PHÂN TÍCH MODEL1/3 + VỊ THẾ',value:'Chưa lấy được bối cảnh mới. Nhãn GẦN VÙNG chỉ mô tả mốc giá, chưa kết luận hướng vào lệnh.'}];
 const m=c.model,fields=[{name:'ĐỐI CHIẾU LONG / SHORT',value:c.view+'\nMốc gốc: gần vùng '+c.originalSide+'. Đánh giá bổ sung độc lập với hướng mốc. Ngưỡng quan sát thử nghiệm, chưa backtest riêng; không cấp lệnh.'}];
 if(c.position)fields.push(sweepPositionFields(c.position)[0]);else fields.push({name:'CÁ VOI / SMART / TOP BINANCE',value:'Thiếu bối cảnh vị thế mới; không suy tỷ trọng.'});
 if(c.position?.point){const p=c.position.point,prev=c.position.previous;fields.push({name:'DIỄN BIẾN VỊ THẾ',value:(prev?'Δ LONG ~1h: cá voi '+(p.whaleLong-prev.whaleLong).toFixed(1)+' điểm %; Smart '+(p.smartLong-prev.smartLong).toFixed(1)+' điểm %.':'Thiếu mốc1h để xác minh thay đổi.')+'\nĐám đông '+(p.crowdLong>=50?'nghiêng LONG':'nghiêng SHORT')+'. Tỷ trọng thay đổi không chứng minh từng trader mở/đóng lệnh. Smart PumpGlass khác top tài khoản Binance.'});}
 const zone=(z,d)=>z?f(z.low)+'–'+f(z.high)+' · cách '+d.toFixed(2)+'%':'Chưa có cụm đồng thuận chưa chạm trong5%';
 fields.push({name:'MODEL1/3 · CỤM CHUNG QUANH GIÁ',value:m?'Giá tham chiếu '+f(m.price)+'\nPhía trên: '+zone(m.above,m.aboveDistancePct)+'\nPhía dưới: '+zone(m.below,m.belowDistancePct)+'\nĐiểm tương đối ±5%: trên '+m.upperScore.toFixed(0)+' / dưới '+m.lowerScore.toFixed(0)+'\n'+m.priceState+' · nến đóng '+time(m.at)+' VN.\nĐiểm ước lượng, không phải USD thanh lý. Không có cụm chung không nghĩa là không có thanh khoản.':'Hai Model chưa đủ dữ liệu mới/đồng bộ MARK và OI; chưa đánh giá cụm trên/dưới.'});
 fields.push({name:'THỜI ĐIỂM / CÁCH ĐỌC',value:'Bối cảnh lúc gửi '+time(c.at)+' VN; có thể sau lúc phát hiện mốc. Cùng hướng quan sát chỉ là điều kiện sàng lọc, không đảm bảo giá đi tới cụm hoặc đã đảo chiều. Thiếu top Binance vẫn ghi thiếu; không coi thiếu là đồng thuận.'});return fields;
}
