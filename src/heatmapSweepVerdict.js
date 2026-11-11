export const SWEEP_VERDICT_VERSION='HEATMAP_SWEEP_REVERSAL_REVIEW_V1_20261107';
const S=300000,finite=x=>typeof x==='number'&&Number.isFinite(x),f=x=>finite(x)?Number(x.toPrecision(7)).toString():'—';
export function reviewSweep(e,{rows=[],position=null,now=Date.now()}={}){
 const lower=e.direction==='LOWER',reversal=lower?'LONG':'SHORT',trend=lower?'SHORT':'LONG';
 const out={version:SWEEP_VERDICT_VERSION,symbol:e.symbol,eventId:e.id,at:now,state:'WAIT',title:'CHƯA '+reversal+' · CHƯA CÓ XÁC NHẬN '+(lower?'HỒI':'GIẢM'),reversal,trend,reasons:[],conditions:[],price:null,observeOnly:true,affectsOrders:false};
 if(!['LOWER','UPPER'].includes(e.direction)||!finite(e.at)||now<e.at||now-e.at>30000){out.state='MISSING';out.title='CHƯA LONG / SHORT · SỰ KIỆN CŨ HOẶC KHÔNG HỢP LỆ';return out;}
 const cleared=(e.zones??[]).filter(z=>z.cleared&&finite(z.low)&&finite(z.high)&&z.low>0&&z.high>=z.low);
 const remaining=(e.zones??[]).filter(z=>!z.cleared&&finite(z.low)&&finite(z.high)&&z.low>0&&z.high>=z.low);
 const reclaim=cleared.length?(lower?Math.max(...cleared.map(z=>z.high)):Math.min(...cleared.map(z=>z.low))):null;
 out.reclaimLevel=reclaim;out.remainingCount=remaining.length;
 const next=remaining.filter(z=>lower?z.high<e.markPrice:z.low>e.markPrice).sort((a,b)=>lower?b.high-a.high:a.low-b.low)[0];out.nextZone=next??null;
 out.reasons.push('Đã quét '+e.clearedCount+'/'+e.totalCount+' cụm đã chốt; còn '+remaining.length+' cụm trong tập theo dõi.'+(next?' Cụm kế tiếp '+f(next.low)+'–'+f(next.high)+'.':''));
 const bars=rows.filter(Array.isArray).filter(b=>[0,1,2,3,4,6,7].every(k=>Number.isFinite(+b[k]))&&+b[0]%S===0&&+b[6]===+b[0]+S-1&&+b[6]<now&&+b[3]>0&&+b[2]>=Math.max(+b[1],+b[4])&&+b[3]<=Math.min(+b[1],+b[4])).sort((a,b)=>a[0]-b[0]).slice(-13);
 let pressure=false,reclaimed=false;
 if(bars.length===13&&now-(+bars.at(-1)[6]+1)<=420000&&bars.every((b,i)=>!i||+b[0]===+bars[i-1][0]+S)){
  const c=bars.at(-1),ret15=(+c[4]/+bars.at(-4)[4]-1)*100,ret60=(+c[4]/+bars[0][4]-1)*100,span=+c[2]-+c[3],closePct=span>0?100*(+c[4]-+c[3])/span:50;
  pressure=lower?ret15<0&&ret60<0&&closePct<=35:ret15>0&&ret60>0&&closePct>=65;
  reclaimed=reclaim!==null&&+c[6]+1>e.at&&(lower?+c[4]>reclaim&&+c[4]>+c[1]:+c[4]<reclaim&&+c[4]<+c[1]);
  out.price={closedAt:+c[6]+1,return15m:ret15,return1h:ret60,closePositionPct:closePct,closedAfterSweep:+c[6]+1>e.at,reclaimed};
  out.reasons.push('Nến đóng: 15m '+ret15.toFixed(2)+'%; 1h '+ret60.toFixed(2)+'%; vị trí đóng '+closePct.toFixed(0)+'% biên nến.');
 }else out.reasons.push('Thiếu chuỗi13 nến5m đóng liên tục mới; chưa đánh giá áp lực giá.');
 const p=position?.symbol===e.symbol&&finite(position.at)&&position.at<=now&&now-position.at<=30000?position.point:null;
 const fresh=p&&finite(p.sourceAt)&&p.sourceAt<=now&&now-p.sourceAt<=900000&&finite(p.whaleLong)&&finite(p.smartLong);
 const adverse=fresh&&(lower?p.whaleLong<=40&&p.smartLong<=40:p.whaleLong>=60&&p.smartLong>=60);
 if(adverse)out.reasons.push('Cá voi + Smart cùng nghiêng '+trend+' ≥60%: chưa ủng hộ bắt đảo chiều.');
 else if(!fresh)out.reasons.push('Cá voi/Smart thiếu hoặc cũ: không dùng để xác nhận hay bác bỏ hồi.');
 if(reclaimed){out.state=adverse?'CONFLICT':'RECLAIM_OBSERVED';out.title=adverse?'GIÁ LẤY LẠI VÙNG · VỊ THẾ CÒN TRÁI CHIỀU':'ĐÃ CÓ NẾN LẤY LẠI VÙNG · CHỜ GIỮ / RETEST';}
 else if(pressure||adverse){out.state='PRESSURE';out.title='CHƯA '+reversal+' · CÒN ÁP LỰC '+(lower?'GIẢM':'TĂNG');}
 out.conditions.push(reclaim!==null?'Để xét '+reversal+': nến5m sau quét '+(lower?'đóng xanh trên ':'đóng đỏ dưới ')+f(reclaim)+', rồi giữ/retest vùng.':'Chưa xác định được mốc lấy lại vùng.');
 out.conditions.push('Chưa cấp điểm '+trend+' từ kết luận này; cần kiểm tra điểm vào, vùng mục tiêu và mức vô hiệu riêng.');
 return out;
}
export function sweepVerdictFields(v){if(!v)return [];return [{name:'KẾT LUẬN QUAN SÁT',value:v.title+'\n'+v.reasons.join('\n')},{name:'ĐIỀU KIỆN CẦN THEO DÕI',value:v.conditions.join('\n')+'\nKhông kết luận xác suất hồi bằng0. Cụm Model1/3 là ước lượng; quy tắc nhận xét chưa backtest riêng, không đổi gate giao dịch.'}];}
