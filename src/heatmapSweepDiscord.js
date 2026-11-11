import {reviewSweep,sweepVerdictFields} from './heatmapSweepVerdict.js';
import {sweepPositionFields} from './heatmapSweepPositionAnalysis.js';
import {evaluateSweepPumpPhase,sweepPumpPhaseFields,validSweepPumpPhase,SWEEP_PUMP_PHASE_VERSION} from './heatmapSweepPumpPhase.js';
import {assessSweepContinuation,continuationKey,continuationReviewJob,firstPushReviewClose,firstPushWhaleAt,isSweepContinuationEvent,
 sweepContinuationDiscord,FIRST_PUSH_LONG_REVIEW_VERSION,LOWER_SHORT_REVIEW_VERSION,FIRST_PUSH_REVIEW_GRACE,FIRST_PUSH_RECOVERY_GRACE} from './heatmapFirstPushLongReview.js';
import {HEATMAP_SWEEP_VERSION} from './heatmapSweepWatch.js';
import {heatmapSweepMargin} from './heatmapSweepBinance.js';
import {isSecondUpperSweep,SECOND_SWEEP_TITLE} from '../public/heatmap-second-sweep-model.js';
import {LONG_QUALITY_TITLES,validLongQuality} from '../public/heatmap-long-quality-model.js';
import {UPPER_MOMENTUM_TITLES,validUpperMomentum} from '../public/heatmap-upper-momentum-model.js';
import {LOWER_MOMENTUM_TITLES,validLowerMomentum} from '../public/heatmap-lower-momentum-model.js';
export const HEATMAP_SWEEP_DISCORD_VERSION='HEATMAP_SWEEP_REBOUND_WATCH_V16_20261109';
export const UPPER_REBOUND_WATCH_VERSION='HEATMAP_UPPER_REBOUND_WATCH_DISCORD_V1_20261109';
export const HEATMAP_SWEEP_DISCORD_ROUTING_VERSION='HEATMAP_FULL_SWEEP_DEDICATED_DISCORD_V1_20261023';
const f=n=>Number.isFinite(n)?Number(n.toPrecision(10)).toString():'—';
// Uses the same frozen Model 1/3 band selection as the continuation review.
export function buildUpperReboundWatch(e,phase){
 if(e?.kind!=='UPPER_CLUSTER_SWEPT'||e.direction!=='UPPER'||!(e.clearedCount>=1&&e.clearedCount<e.totalCount)
  ||phase?.state!=='REBOUND_BELOW_PEAK'||!validSweepPumpPhase(e,phase)
  ||!(Number.isFinite(e.previousTickAt)&&e.armedAt<=e.previousTickAt&&e.previousTickAt<e.at&&e.at-e.previousTickAt<=10000)
  ||!(Number.isFinite(e.previousMarkPrice)&&e.previousMarkPrice>0))return null;
 const {edge,remaining}=assessSweepContinuation(e);
 const target=remaining?.[0];
 if(!target||edge===null||!(e.previousMarkPrice<edge&&edge<=e.markPrice))return null;
 return {version:UPPER_REBOUND_WATCH_VERSION,eventId:e.id,symbol:e.symbol,asOf:e.at,
  mark:e.markPrice,clearedEdge:edge,remainingCount:remaining.length,target,observeOnly:true,affectsOrders:false};
}
function upperReboundField(e){
 const r=e.upperReboundWatch;
 if(r?.version!==UPPER_REBOUND_WATCH_VERSION||r.eventId!==e.id||r.symbol!==e.symbol||r.asOf!==e.at
  ||e.kind!=='UPPER_CLUSTER_SWEPT'||e.direction!=='UPPER'||r.observeOnly!==true||r.affectsOrders!==false)return null;
 const z=r.target;
 return {name:'BÁO SỚM · CỤM MODEL 1/3 PHÍA TRÊN',value:[
  `MARK ${f(r.mark)} đã vượt mép ${f(r.clearedEdge)}. Còn ${r.remainingCount} cụm chưa chạm phía trên trong tập đã chốt.`,
  `Chạm cụm kế tiếp khi MARK ≥ ${f(z.low)} · +${z.nearPct.toFixed(2)}%.`,
  `Vượt hết cụm kế tiếp khi MARK ≥ ${f(z.high)} · +${z.farPct.toFixed(2)}%.`,
  z.strength===null?'':'Điểm đồng thuận Model 1/3 của cụm kế tiếp '+z.strength.toFixed(1)+'.',
  'Khoảng cách tính từ MARK lúc báo. Theo dõi tiếp diễn trong nhịp bơm hồi. Cụm là ước lượng và có thể chưa được quét.',
 ].filter(Boolean).join('\n')};
}

export function heatmapSweepDiscordPayload(e){
 const all=['ALL_TRACKED_UPPER_SWEPT','ALL_TRACKED_LOWER_SWEPT'].includes(e.kind),upper=e.direction!=='LOWER',where=upper?'TRÊN':'DƯỚI',side=upper?'SHORT':'LONG';
 const second=isSecondUpperSweep(e),s=e.secondSweep;
 const momentum=validUpperMomentum(e)?e.upperMomentum:null;
 const lowerMomentum=validLowerMomentum(e)?e.lowerMomentum:null;
 const isLong=all&&!upper,q=validLongQuality(e)?e.longQuality:null,grade=q?.grade??'UNKNOWN',qualityTitle=isLong?' · '+LONG_QUALITY_TITLES[grade]:'';
 const qualityFields=isLong?[{name:'ĐÁNH GIÁ LONG · TRƯỚC ENTRY',value:q?[
  `${grade==='GOOD'?'🟢':grade==='BAD'?'🟠':'⚪'} ${LONG_QUALITY_TITLES[grade]} · ${q.proposedMarginUsdt?`size theo phân loại ${q.proposedMarginUsdt} USDT margin ×5`:'thiếu dữ liệu, chưa gán size'}`,
  ...q.checks.map(c=>`${c.pass===true?'✓':c.pass===false?'✗':'?'} ${c.label}: ${Number.isFinite(c.value)?c.value.toFixed(3):'thiếu'}`),
  `Ratio ACCOUNT ${f(q.features.ratioLevel)} · BTC15m ${f(q.features.btcReturn15m)}% / 1h ${f(q.features.btcReturn1h)}% (tham khảo, không gate)`,
  q.missing.length?'Thiếu: '+q.missing.join(', '):'Nến5m đã đóng; ratio/OI lùi một nhịp5m. Bốn điều kiện đều đạt=TỐT; đủ dữ liệu và trượt≥1=XẤU.',
  'Phân loại thử nghiệm, không bảo đảm thắng. Nhánh5/1 cần bật riêng và WHITELIST; BINANCE bên dưới ghi kết quả thực tế.'
 ].join('\n'):'⚪ CHƯA ĐÁNH GIÁ: mẫu cũ hoặc thiếu snapshot đánh giá trước entry; không suy TỐT/XẤU và không tự gán size5/1.'}]:[];
 if(all&&upper)qualityFields.unshift({name:'ĐÁNH GIÁ ĐỘNG LƯỢNG TRƯỚC QUÉT · PHÍA TRÊN',value:momentum?[
  `${momentum.state==='CONTINUATION'?'🟠':'⚪'} ${UPPER_MOMENTUM_TITLES[momentum.state]}`,
  ...momentum.checks.map(c=>`${c.pass===true?'✓':c.pass===false?'✗':'?'} ${c.label}: ${Number.isFinite(c.value)?c.value.toFixed(2):'thiếu'}`),
  `Ratio ACCOUNT ${f(momentum.features.ratioLevel)} · Δ1h ${f(momentum.features.ratioChange1h)}% · OI lượng Δ1h ${f(momentum.features.oiChange1h)}%`,
  `BTC15m ${f(momentum.features.btcReturn15m)}% / 1h ${f(momentum.features.btcReturn1h)}% (ratio/OI/BTC chỉ tham khảo; — là thiếu cache).`,
  'Ngưỡng thử nghiệm, chưa backtest xác nhận. Không đủ dấu hiệu bơm KHÔNG có nghĩa đảo chiều. CÒN ĐÀ BƠM: chặn SHORT mới (cả lần2), vẫn báo Discord. Không sửa vị thế cũ/SL/TP.'
 ].join('\n'):'Mẫu cũ hoặc chưa có snapshot trước entry; không suy ra đà bơm/đảo chiều.'});
 if(all&&!upper)qualityFields.unshift({name:'ĐÁNH GIÁ ĐỘNG LƯỢNG TRƯỚC QUÉT · PHÍA DƯỚI',value:lowerMomentum?[
  `${lowerMomentum.state==='CONTINUATION'?'🔴':'⚪'} ${LOWER_MOMENTUM_TITLES[lowerMomentum.state]}`,
  ...lowerMomentum.checks.map(c=>`${c.pass===true?'✓':c.pass===false?'✗':'?'} ${c.label}: ${Number.isFinite(c.value)?c.value.toFixed(2):'thiếu'}`),
  `Ratio ACCOUNT ${f(lowerMomentum.features.ratioLevel)} · Δ1h ${f(lowerMomentum.features.ratioChange1h)}% · OI lượng Δ1h ${f(lowerMomentum.features.oiChange1h)}%`,
  `BTC15m ${f(lowerMomentum.features.btcReturn15m)}% / 1h ${f(lowerMomentum.features.btcReturn1h)}% (tham khảo; — là thiếu cache).`,
  'CÒN ĐÀ XẢ: chặn LONG mới, cả nhóm tốt5/xấu1. Ngưỡng thử nghiệm chưa backtest; chưa đủ dấu hiệu xả KHÔNG phải xác nhận hồi. Không đổi vị thế cũ/SL/TP.'
 ].join('\n'):'Mẫu cũ/chưa có snapshot đà xả trước entry; không tự phân loại lại.'});
 const lowerWarning=lowerMomentum?.state==='CONTINUATION';
 const payload={username:'Heatmap · Quét cụm hai phía',allowed_mentions:{parse:[]},embeds:[{
  title:`${second?'🟣':momentum?.state==='CONTINUATION'?'🟠':all?(upper?'🔴':grade==='BAD'?'🟠':grade==='UNKNOWN'?'⚪':'🟢'):'🟠'} ${e.symbol} · ${second?SECOND_SWEEP_TITLE:all?'QUÉT HẾT CÁC CỤM ĐÃ CHỐT · PHÍA '+where:'QUÉT HẾT CỤM PHÍA '+where}${qualityTitle}${momentum?.state==='CONTINUATION'?' · CÒN ĐÀ BƠM':''}`,color:second?0xb688ff:momentum?.state==='CONTINUATION'?0xffb553:isLong&&grade==='BAD'?0xffb553:isLong&&grade==='UNKNOWN'?0x91a6bc:all?(upper?0xff627e:0x29d5a0):0xffb553,
  description:`MARK đã vượt mép ${upper?'trên':'dưới'} cụm ước lượng có trước nhịp giá. Không đợi nến đảo chiều. KHÔNG có nghĩa đã thanh lý hết toàn sàn hay bảo đảm giá đảo chiều.`,
  fields:[...sweepPumpPhaseFields(e),...qualityFields,...(second?[{name:'LẦN QUÉT / ĐỈNH TRƯỚC (MARK)',value:`Lần đầu lúc ${new Date(s.firstAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} VN · đỉnh trước ${f(s.previousPeak)} · đã điều chỉnh ${s.retracementPct.toFixed(2)}% · giá hiện cách đỉnh ${s.distanceBelowPeakPct.toFixed(2)}% phía dưới.\nBơm ${s.pumpPct.toFixed(2)}% từ MARK lúc chốt cụm đầu; hồi ${s.reboundPct.toFixed(2)}% từ đáy điều chỉnh. Nhịp thứ 2 được quan sát liên tục, không phải đếm lại thông báo. Nhánh SHORT 10 USDT cần bật riêng + WHITELIST/closed AvgROE >4%; kết quả thực tế xem BINANCE bên dưới.`}]:[]),{name:'PHẠM VI / TIẾN ĐỘ',value:`${e.clearedCount}/${e.totalCount} cụm đã chốt trong ${upper?'+':'−'}${f(e.maxDistancePct)}% từ MARK lúc arm ${f(e.referencePrice)}. ${all?'Chỉ hết tập cụm này; vẫn có thể có vùng khác xa hơn hoặc mới sinh.':'Còn cụm chưa quét trong tập đang theo dõi.'}`},
   {name:'MARK / CỤM ĐÃ QUÉT',value:`MARK ${f(e.markPrice)}\n`+e.zones.filter(z=>z.cleared).map(z=>`${f(z.low)} – ${f(z.high)}`).join('\n')},
   {name:'VÙNG CÓ TRƯỚC GIÁ (VN)',value:`Nến chốt ${new Date(e.zonesAsOf).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}\nBắt đầu theo dõi ${new Date(e.armedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`},
   {name:'NGUỒN',value:'Hai model tự tính từ Binance 24h/nến5m, cùng giả định leverage. Cụm ≥35% mỗi profile/3nến, MARK/OI đủ nguồn. Không phải thanh lý thực được xác nhận.'},
   {name:'BINANCE',value:all&&e.binance?`${side} MARKET ${Number.isFinite(e.binance.marginUsdt)?e.binance.marginUsdt:Number.isFinite(e.binance.requestedMarginUsdt)?e.binance.requestedMarginUsdt:heatmapSweepMargin(side)} USDT margin ×5 · TP +10% / SL −30% ROE · max riêng 20 chung hai hướng.\nKết quả: ${e.binance.status}${e.binance.orderId?' · orderId '+e.binance.orderId:''}. Đây là size xét vào, không chứng minh đã khớp; không sửa vị thế cũ.`:'Chỉ quan sát; chưa có kết quả entry từ thông báo này. Quét một cụm không cấp lệnh; lịch sử cũ không replay.'},
   {name:'MỞ ĐÚNG LẦN QUÉT',value:`[Heatmap và vùng đã chốt](https://liquidity.nhathadev.trade/coinglass-heatmap-lab?symbol=${encodeURIComponent(e.symbol)}&range=${encodeURIComponent(e.viewRange)}&sweep=${encodeURIComponent(e.id)}#heatmap-sweep)`}],
  footer:{text:HEATMAP_SWEEP_VERSION+' | '+HEATMAP_SWEEP_DISCORD_VERSION+' · Không phải thanh lý thực được xác nhận'},timestamp:new Date(e.at).toISOString()
 }]};
 if(lowerWarning){payload.embeds[0].title=`🔴 ${e.symbol} · QUÉT HẾT CÁC CỤM ĐÃ CHỐT · PHÍA DƯỚI · CÒN ĐÀ XẢ`;payload.embeds[0].color=0xff627e;}
 if(['LOWER_MOMENTUM_CONTINUATION_BLOCKED','UPPER_MOMENTUM_CONTINUATION_BLOCKED'].includes(e.binance?.status)){
  payload.embeds[0].fields.find(f=>f.name==='BINANCE').value=`KHÔNG GỬI LỆNH MỚI · ${e.binance.status}\n${lowerWarning?'CÒN ĐÀ XẢ: chặn LONG, kể cả nhóm tốt5/xấu1.':'CÒN ĐÀ BƠM: chặn SHORT, kể cả quét lần2.'} Discord vẫn báo. Không đóng/sửa vị thế cũ hoặc SL/TP.`;
 }
 const embed=payload.embeds[0];
 if(validSweepPumpPhase(e,e.pumpPhase)&&e.pumpPhase.state!=='UNKNOWN')embed.title+=' · '+(e.pumpPhase.state==='FIRST_PUSH'?'BƠM ĐẦU (24H)':'BƠM HỒI');
 const rebound=upperReboundField(e);
 if(rebound){
  embed.title='🔵'+embed.title.slice(embed.title.indexOf(' '))+' · HƯỚNG TỚI CỤM TRÊN';
  embed.color=0x3ea6ff;
 }
 const continuation=sweepContinuationDiscord(e);
 if(continuation){
  embed.title=continuation.icon+embed.title.slice(embed.title.indexOf(' '))+' · '+continuation.title;
  embed.color=continuation.color;
  embed.fields.find(f=>f.name==='PHẠM VI / TIẾN ĐỘ').name+=' · LÚC QUÉT';
 }
 const primaryFields=rebound?[rebound]:(continuation?.fields??[]);
 embed.fields.unshift(...primaryFields);
 let used=(embed.title?.length??0)+(embed.description?.length??0)+(embed.footer?.text?.length??0)+embed.fields.reduce((n,f)=>n+f.name.length+f.value.length,0);
 const appended=[];for(const field of [...sweepVerdictFields(e.sweepVerdict),...sweepPositionFields(e.positionAnalysis)]){const room=Math.min(1024,5900-used-field.name.length);if(room<80||embed.fields.length>=25)break;const value=field.value.length>room?field.value.slice(0,room-1)+"…":field.value;appended.push({...field,value});used+=field.name.length+value.length;}
 embed.fields.splice(primaryFields.length,0,...appended);return payload;
}
function webhookTarget(value){
 if(!value?.trim())return null;let u;try{u=new URL(value.trim());}catch{throw Error('INVALID_HEATMAP_SWEEP_DISCORD');}
 if(u.protocol!=='https:'||!['discord.com','discordapp.com'].includes(u.hostname)||u.username||u.password||u.port||u.search||u.hash||!/^\/api\/webhooks\/\d+\/[^/]+$/.test(u.pathname))throw Error('INVALID_HEATMAP_SWEEP_DISCORD');
 return u.href;
}
export function createHeatmapSweepDiscordSender({webhookUrl,fullSweepWebhookUrl,fetchImpl=fetch,getAnalysis=null,getReview=null,getCachedAnalysis=null,getPumpPhase=null,loadSweepContinuation=null,now=Date.now}={}){
 const partial=webhookTarget(webhookUrl),dedicated=webhookTarget(fullSweepWebhookUrl),full=dedicated??partial;
 if(!partial&&!full)return null;
 const sender=async e=>{const target=['ALL_TRACKED_UPPER_SWEPT','ALL_TRACKED_LOWER_SWEPT'].includes(e.kind)?full:partial;
  if(!target)return {sent:0,failed:1,error:'DISCORD_ROUTE_NOT_CONFIGURED'};
  let pumpPhase=null;if(getPumpPhase){try{pumpPhase=structuredClone(getPumpPhase(structuredClone(e)));}catch{pumpPhase=evaluateSweepPumpPhase({event:e});}}
  const upperReboundWatch=buildUpperReboundWatch(e,pumpPhase);
  let positionAnalysis=null;try{positionAnalysis=getCachedAnalysis?.(e)??null;}catch{}if(getAnalysis){let timer;try{positionAnalysis=(await Promise.race([Promise.resolve().then(()=>getAnalysis(structuredClone(e))),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),2800);})]))??positionAnalysis;}catch{}finally{clearTimeout(timer);}}
  let sweepVerdict;try{sweepVerdict=getReview?getReview(e,positionAnalysis):reviewSweep(e,{position:positionAnalysis});}catch{sweepVerdict=reviewSweep(e);}
  const key=loadSweepContinuation&&isSweepContinuationEvent(e,pumpPhase)?continuationKey(e):null;
  const review=key?{[key]:assessSweepContinuation(e)}:{};
  const requestUrl=key?target+'?wait=true':target;
  try{
   const r=await fetchImpl(requestUrl,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},
    body:JSON.stringify(heatmapSweepDiscordPayload({...e,positionAnalysis,sweepVerdict,pumpPhase,upperReboundWatch,...review})),signal:AbortSignal.timeout(8000)});
   const delivery={sent:r.ok?1:0,failed:r.ok?0:1,httpStatus:r.status,positionAnalysis,sweepVerdict,pumpPhase};
   if(upperReboundWatch)delivery.upperReboundWatch=upperReboundWatch;
   if(key){
    Object.assign(delivery,review);
    if(r.ok){
     const postedAt=now();
     let receipt;try{receipt=await r.json();}catch{}
     if(typeof receipt?.id==='string'&&/^\d{17,22}$/.test(receipt.id)){
      delivery[key+'Message']={id:receipt.id,webhookId:new URL(target).pathname.split('/')[3],postedAt,closeAt:firstPushReviewClose(e,postedAt)};
     }else delivery[key+'Update']='NO_MESSAGE_RECEIPT';
    }
   }
   return delivery;
  }catch{return {sent:0,failed:1,error:'DISCORD_FAILED_OR_UNKNOWN'};}};
 if(loadSweepContinuation&&partial){
  const webhookId=new URL(partial).pathname.split('/')[3];
  sender.reviewContinuation=async e=>{
   const key=continuationKey(e),d=e.delivery,p=d?.pumpPhase,at=now();
   if(!key)return null;
   const job=continuationReviewJob(e),m=job?.message;
   const recovery=job?.mode==='recovery',pending=job?.mode==='pending',contextRepair=job?.mode==='context';
   const updateKey=key+'Update',statusKey=key+(contextRepair?'ContextRepair':recovery?'Recovery':'Update');
   const finish=status=>({[statusKey]:status});
   if(!job||!isSweepContinuationEvent(e,p)||m.webhookId!==webhookId||typeof m.id!=='string'||!/^\d{17,22}$/.test(m.id)
    ||!Number.isFinite(m.postedAt)||m.postedAt<e.at||m.postedAt>e.at+45000||m.closeAt!==firstPushReviewClose(e,m.postedAt))
    return finish('INVALID_RECEIPT');
   if(at<m.closeAt+12000)return null;
   const deadline=m.closeAt+(pending?FIRST_PUSH_REVIEW_GRACE:FIRST_PUSH_RECOVERY_GRACE);
   if(at>deadline)return finish('EXPIRED');
   let data;try{data=await loadSweepContinuation(e,m.closeAt,contextRepair);}catch{}
   const whale=contextRepair?firstPushWhaleAt(e,data?.position,m.closeAt):null;
   if(contextRepair&&!whale)return finish('NO_HISTORICAL_CONTEXT');
   const review=contextRepair?{...job.review,whale}:assessSweepContinuation(e,{...data,closeAt:m.closeAt});
   if(recovery&&!review.whale&&job.review.closeAt===m.closeAt)review.whale=job.review.whale;
   if(recovery&&review.state==='MISSING')return null;
   // Retry the data read without editing Discord until price and MARK are ready.
   if(!recovery&&review.state==='MISSING'&&now()<deadline-15000)return null;
   if(now()>deadline)return finish('EXPIRED');
   const {embeds,allowed_mentions}=heatmapSweepDiscordPayload({...e,pumpPhase:p,positionAnalysis:d.positionAnalysis,
    sweepVerdict:d.sweepVerdict,[key]:review});
   let status;try{
    const r=await fetchImpl(partial+'/messages/'+m.id,{method:'PATCH',redirect:'error',headers:{'content-type':'application/json'},
     body:JSON.stringify({embeds,allowed_mentions}),signal:AbortSignal.timeout(8000)});
    status=r.ok?'UPDATED':'HTTP_'+r.status;
   }catch{status='FAILED_OR_UNKNOWN';}
   if(status!=='UPDATED'&&(recovery||contextRepair))return finish(status);
   return {[key]:review,[updateKey]:status,[key+'UpdatedAt']:now(),...finish(status)};
  };
 }
 Object.defineProperty(sender,'routing',{value:Object.freeze({version:HEATMAP_SWEEP_DISCORD_ROUTING_VERSION,fullSweepConfigured:!!full,fullSweepDedicated:!!dedicated,partialConfigured:!!partial})});
 Object.defineProperty(sender,'firstPushLongVersion',{value:sender.reviewContinuation?FIRST_PUSH_LONG_REVIEW_VERSION:null});
 Object.defineProperty(sender,'lowerShortVersion',{value:sender.reviewContinuation?LOWER_SHORT_REVIEW_VERSION:null});
 Object.defineProperty(sender,'upperReboundWatchVersion',{value:partial&&getPumpPhase?UPPER_REBOUND_WATCH_VERSION:null});
 Object.defineProperty(sender,'pumpPhaseVersion',{value:getPumpPhase?SWEEP_PUMP_PHASE_VERSION:null});
 return sender;
}
