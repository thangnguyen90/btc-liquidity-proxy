// Offline-only experiment: no server, credentials, notifications, network or orders.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {matureCohort,summarize,blockBootstrap,mean,quantile,H} from './research-pump-turn-near-20261028.mjs';

export const VERSION='PUMP_TURN_NEAR_CONTEXT_RESEARCH_V1_20261028';
export const RULE=Object.freeze({deepDropPct:10,buyPct:50,sellBuyPct:45,sellVolumeX:1,maxTickAgeMs:30000});
export const LABELS=Object.freeze({SELL_PRESSURE:'NGHIÊNG BÁN',BUY_PRESSURE:'CÒN LỰC MUA',DEEP_DROP:'ĐÃ GIẢM SÂU',MIXED:'HỖN HỢP',UNKNOWN:'THIẾU DỮ LIỆU'});
const MINUTE=60000,STEP=5*MINUTE;
const finite=x=>typeof x==='number'&&Number.isFinite(x);

// Explicit allowlist. Research outcomes, later candles and derived future fields
// cannot become classifier inputs even when callers pass an enriched event.
export function preEventInput(e){
 return Object.fromEntries(['version','side','state','observedAt','asOf','expiresAt','liveAt','livePrice','peak','peakAt','pump6h','preBuyPct','preVolumeX','gain60','zoneLow','zoneHigh'].map(k=>[k,e?.[k]]));
}
export function classifyNearShort(event){
 const e=preEventInput(event),reasons=[];
 const unknown=reason=>({version:VERSION,label:'UNKNOWN',flow:'UNKNOWN',deepDrop:null,reasons:[reason],observeOnly:true,affectsOrders:false});
 const numbers=['observedAt','asOf','expiresAt','liveAt','livePrice','peak','peakAt','pump6h','preBuyPct','preVolumeX','gain60','zoneLow','zoneHigh'];
 if(numbers.some(k=>!finite(e[k])))return unknown('missing_or_non_numeric_pre_event_data');
 if(e.version!=='PUMP_TURN_ZONE_WATCH_V1_20261018'||e.side!=='SHORT'||!['NEAR','IN_ZONE'].includes(e.state))return unknown('unsupported_source_or_state');
 if(e.asOf>=e.observedAt||e.asOf%STEP!==STEP-1||e.observedAt>=e.expiresAt||e.expiresAt!==e.asOf+STEP+1)return unknown('unclosed_or_expired_plan');
 if(e.observedAt-e.liveAt>RULE.maxTickAgeMs||e.liveAt>e.observedAt+1000)return unknown('stale_or_future_tick');
 if(e.livePrice<=0||e.peak<=0||e.peakAt>e.asOf||e.peakAt%STEP!==0||e.peakAt<e.asOf+1-72*STEP||e.pump6h<15||e.preBuyPct<0||e.preBuyPct>100||e.preVolumeX<0||e.zoneLow<=0||e.zoneHigh<e.zoneLow)return unknown('invalid_context');
 if(e.livePrice<e.zoneLow||e.livePrice>e.peak||e.livePrice<e.peak*.8)return unknown('invalid_live_zone_or_peak');
 if(e.state==='IN_ZONE'&&(e.livePrice<e.zoneLow||e.livePrice>e.zoneHigh))return unknown('inconsistent_zone_state');
 if(e.state==='NEAR'&&e.livePrice<=e.zoneHigh)return unknown('inconsistent_zone_state');
 const deepDrop=e.livePrice<=e.peak*(1-RULE.deepDropPct/100);
 let flow='MIXED';
 if(e.preBuyPct>=RULE.buyPct&&e.gain60>0){flow='BUY_PRESSURE';reasons.push('pre_15m_taker_buy_ge_50_and_closed_1h_return_positive');}
 else if(e.preBuyPct<=RULE.sellBuyPct&&e.preVolumeX>=RULE.sellVolumeX&&e.gain60<0){flow='SELL_PRESSURE';reasons.push('pre_15m_taker_buy_le_45_volume_ge_baseline_and_closed_1h_return_negative');}
 else reasons.push('no_agreement_between_taker_flow_volume_and_1h_return');
 if(deepDrop)reasons.unshift('live_price_at_least_10pct_below_frozen_peak');
 return {version:VERSION,label:deepDrop?'DEEP_DROP':flow,flow,deepDrop,reasons,observeOnly:true,affectsOrders:false,
  asOf:e.asOf,observedAt:e.observedAt,dropFromPeakPct:(1-e.livePrice/e.peak)*100,preBuyPct:e.preBuyPct,preVolumeX:e.preVolumeX,gain60:e.gain60};
}

export function firstRetainedWaveEvents(records){
 const seen=new Set();return [...records].sort((a,b)=>a.observedAt-b.observedAt).filter(e=>{const key=e.symbol+':'+e.peakAt;if(seen.has(key))return false;seen.add(key);return true;});
}
const day=e=>new Date(e.observedAt+7*H).toISOString().slice(0,10);
function deltaBootstrap(all,label,reps=2000){
 const selected=all.filter(e=>e.classification.label===label);
 if(selected.length<30||new Set(selected.map(e=>e.symbol+':'+day(e))).size<10)return {reps:0,validReps:0,lo:null,hi:null,suppressed:'fewer_than_30_events_or_10_coin_days'};
 const groups=new Map();for(const e of all){const key=e.symbol+':'+day(e);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
 const blocks=[...groups.values()],deltas=[];let seed=20261028;
 const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32;};
 for(let i=0;i<reps;i++){let sum=0,n=0,otherSum=0,otherN=0;
  for(let j=0;j<blocks.length;j++)for(const e of blocks[Math.floor(rand()*blocks.length)]){
   if(e.classification.label===label){sum+=e.results.immediate.netRoe5x;n++;}else{otherSum+=e.results.immediate.netRoe5x;otherN++;}
  }
  if(n&&otherN)deltas.push(sum/n-otherSum/otherN);
 }
 return {reps,validReps:deltas.length,lo:quantile(deltas,.025),hi:quantile(deltas,.975)};
}
function extras(xs){
 const s=summarize(xs),r=xs.filter(e=>e.results.immediate.horizons?.[15]?.full);
 const blocks=new Set(xs.map(e=>e.symbol+':'+day(e))).size;
 const ci=xs.length>=30&&blocks>=10?blockBootstrap(xs):{blocks,lo:null,hi:null,suppressed:'fewer_than_30_events_or_10_coin_days'};
 return {...s,clusterCI:ci,rebound15mGe2Pct:r.length?r.filter(e=>e.results.immediate.horizons[15].mae>=2).length/r.length*100:null,
  reboundN:r.length,slPct:s.n?s.sl/s.n*100:null,coinDays:new Set(xs.map(e=>e.symbol+':'+day(e))).size};
}
function stability(xs,splitAt,waveIds){
 const first=xs.filter(e=>e.observedAt<splitAt),last=xs.filter(e=>e.observedAt>=splitAt);
 const bySymbol=[...new Set(xs.map(e=>e.symbol))].map(symbol=>{const rows=xs.filter(e=>e.symbol===symbol);return {symbol,n:rows.length,sumRoe:rows.reduce((s,e)=>s+e.results.immediate.netRoe5x,0)};});
 const top=bySymbol.sort((a,b)=>b.sumRoe-a.sumRoe)[0];
 const all=extras(xs),first70=extras(first),last30=extras(last);
 return {all,first70,last30,firstRetainedPerPeak:extras(xs.filter(e=>waveIds.has(e.id))),
  days:Object.fromEntries([...new Set(xs.map(day))].sort().map(d=>[d,summarize(xs.filter(e=>day(e)===d))])),
  largestCoinPct:xs.length?Math.max(...bySymbol.map(x=>x.n))/xs.length*100:null,
  topRoeContributor:top??null,withoutTopRoeContributor:top?summarize(xs.filter(e=>e.symbol!==top.symbol)):null,
  retrospectiveScreenPass:all.n>=50&&last30.n>=25&&all.avgStressRoe5x>0&&first70.avgNetRoe5x>0&&last30.avgNetRoe5x>0&&all.clusterCI.lo>0};
}

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceDir=path.join(root,'data/research/pump-turn-near-eval-20261028');
const outputDir=path.join(root,'data/research/pump-turn-near-context-20261028');
const f=(x,d=2)=>Number.isFinite(x)?x.toFixed(d):'—';
const vn=t=>new Date(t).toLocaleString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'});
function report(s){
 const lines=['# Phân loại thêm cho GẦN VÙNG SHORT · CHƯA XÁC NHẬN','',
  `Version: \`${VERSION}\`. Nghiên cứu offline; chưa nối vào detector, Discord, UI, WHITELIST hoặc Binance.`,
  '', '## Ý nghĩa của lớp bổ sung','',
  'Giữ nguyên cảnh báo gốc và thêm trạng thái bối cảnh có thể quan sát tại thời điểm phát. Không đổi tên thành “SHORT tốt/đã xác nhận”, không quy điểm thành xác suất thắng. Lớp này không đợi nến tương lai và không tự cấp quyền vào lệnh.',
  '', '| Nhóm | Điều kiện theo thứ tự ưu tiên |','|---|---|',
  '| THIẾU DỮ LIỆU | Snapshot thiếu/sai, sai nguồn, nến chưa đóng, tick quá 30 giây, plan hết hạn hoặc live zone không hợp lệ. |',
  '| ĐÃ GIẢM SÂU | Giá lúc cảnh báo thấp hơn hoặc bằng 90% đỉnh đã lưu. Vẫn lưu flow phụ, không bỏ mất trường hợp vừa giảm sâu vừa nghiêng bán. |',
  '| CÒN LỰC MUA | Chưa giảm sâu; taker buy 15m ≥50% và biến động 1h từ nến 5m đã đóng >0. |',
  '| NGHIÊNG BÁN | Chưa giảm sâu; taker buy 15m ≤45%, volume trung bình 3 nến 5m ≥baseline 20 nến, biến động 1h từ nến đã đóng <0. |',
  '| HỖN HỢP | Dữ liệu hợp lệ nhưng chưa đồng thuận các điều kiện trên. Không đồng nghĩa an toàn hoặc tín hiệu đảo chiều. |',
  '', 'Taker buy là tỷ trọng khối lượng mua chủ động, không phải tỷ lệ tài khoản LONG. gain60 là snapshot gốc từ nến 5m đã đóng; không dùng trường preReturn60m thiếu dữ liệu của nghiên cứu trước. ĐÃ GIẢM SÂU là mô tả vị trí giá, chưa chứng minh cứ giảm sâu là dễ bật ngược. Các ngưỡng là giả thuyết dễ diễn giải, không được coi là đã tối ưu.',
  '', '## Mẫu và phương pháp','',
  `- ${s.totalEvents} event được phân loại từ bản snapshot khóa ${vn(s.cutoff)} giờ VN; ${s.primaryEvents} event đủ 6h15m dùng so sánh. Không gọi mạng, không đọc key/account/live order.`,
  '- Đầu vào được chọn tường minh từ event gốc và phân loại trước khi nối kết quả mô phỏng. Không dùng nến xác nhận về sau, HIGH/LOW tương lai, kết quả TP/SL hoặc PnL để chọn nhãn.',
  '- Dùng nguyên mô phỏng đối chứng: OPEN phút đầy đủ kế tiếp, TP giảm 2% giá / SL tăng 6%, 5×, timeout 6h, chi phí giả định hai chiều 0,14% giá; stress 0,30%. SL-first nếu cùng nến. Không funding, sổ lệnh, MARK/tick, cap/no-DCA/vốn chồng lấn. Đây không phải PnL tài khoản.',
  `- Chia hồi cứu theo mốc ${vn(s.splitAt)}: ${s.baseline.first70.n} event đầu và ${s.baseline.last30.n} event cuối. Mẫu này đã được xem trong báo cáo trước, kể cả các bin giảm từ đỉnh; đây KHÔNG phải holdout/OOS mới hoặc phép kiểm định độc lập.`,
  '- Chỉ một bộ quy tắc V1 được chạy, không quét grid/đổi ngưỡng sau khi nhìn kết quả. Nhiều nhóm vẫn tạo rủi ro chọn ngẫu nhiên nhóm thắng; CI chưa điều chỉnh đa kiểm định. Bootstrap coin-ngày giữ cụm, nhưng không giải quyết hết tương quan giữa coin cùng thị trường.',
  '', '## So sánh trên cùng cohort','',
  '| Nhóm | N | Coin | Thắng ròng | TP / SL / hết giờ | AvgROE net 5× | Stress | Bật ≥2% /15m |',
  '|---|---:|---:|---:|---|---:|---:|---:|',
  ...[['ALL',s.baseline.all],...Object.entries(s.groups).map(([k,v])=>[k,v.all])].map(([k,a])=>`| ${k==='ALL'?'Toàn bộ':LABELS[k]} | ${a.n} | ${a.coins} | ${f(a.winPct)}% | ${a.tp}/${a.sl}/${a.timeout} | ${f(a.avgNetRoe5x)}% | ${f(a.avgStressRoe5x)}% | ${f(a.rebound15mGe2Pct)}% |`),
  '', 'Cột bật ngược dùng đường giá cố định 15m, có thể xảy ra sau TP; không phải tỷ lệ lệnh thua. Không gộp lệnh thật 18–23/10 với cohort cảnh báo 24–28/10.',
  '', `Đặc biệt: NGHIÊNG BÁN chỉ có ${s.groups.SELL_PRESSURE.all.n} mẫu và ${s.groups.SELL_PRESSURE.firstRetainedPerPeak.n} lần đầu còn lưu mỗi peak. Tỷ lệ thắng quan sát được không phải ước lượng đáng tin cho giao dịch mới. Không hiển thị CI khi dưới 30 event hoặc 10 cụm coin-ngày để tránh khoảng bootstrap hẹp giả tạo từ vài kết quả giống nhau.`,
  `CÒN LỰC MUA có ${s.groups.BUY_PRESSURE.all.n} mẫu, AvgROE ${f(s.groups.BUY_PRESSURE.all.avgNetRoe5x)}%, nhưng CI [${f(s.groups.BUY_PRESSURE.all.clusterCI.lo)}%; ${f(s.groups.BUY_PRESSURE.all.clusterCI.hi)}%] còn cắt 0; phần cuối kỳ dưới chi phí stress là ${f(s.groups.BUY_PRESSURE.last30.avgStressRoe5x)}%. Vì vậy không được suy “có lực mua thì chắc chắn không nên SHORT” hoặc tự đổi nhãn này thành “SHORT tốt”.`,
  'Bốn event UNKNOWN trong cohort chính thiếu preBuyPct, preVolumeX=0; giữ UNKNOWN thay vì dùng dữ liệu tải sau đó để lấp proof trước entry. Khi rà soát cũng sửa bin pre60m của báo cáo cũ: null không được tính là UP. Việc sửa bin không thay cohort hoặc bất kỳ entry/outcome/ROE chính nào.',
  '', '## Độ ổn định và hiệu ứng lặp cùng sóng','',
  '| Nhóm | 70% đầu: N / ROE | 30% cuối: N / ROE | CI95% ROE theo coin-ngày | Giữ event đầu mỗi peak: N / ROE |',
  '|---|---:|---:|---|---:|',
  ...[['ALL',s.baseline],...Object.entries(s.groups)].map(([k,g])=>`| ${k==='ALL'?'Toàn bộ':LABELS[k]} | ${g.first70.n} / ${f(g.first70.avgNetRoe5x)}% | ${g.last30.n} / ${f(g.last30.avgNetRoe5x)}% | [${f(g.all.clusterCI.lo)}%; ${f(g.all.clusterCI.hi)}%] | ${g.firstRetainedPerPeak.n} / ${f(g.firstRetainedPerPeak.avgNetRoe5x)}% |`),
  '', 'Event đầu mỗi peak được chọn trên toàn cohort theo symbol + peakAt rồi mới chia nhãn, không chọn event đầu riêng trong nhóm có lợi. History bị cắt nên đây chỉ là lần đầu còn lưu, không phải lần chạm đầu thật của toàn sóng. Peak mới vẫn có thể thuộc cùng một sóng rộng hơn.',
  '', '| Nhóm | Chênh AvgROE so với phần còn lại | CI95% chênh lệch | Bỏ coin đóng góp ROE cao nhất: N / ROE |',
  '|---|---:|---|---:|',
  ...Object.entries(s.groups).map(([k,g])=>`| ${LABELS[k]} | ${f(g.deltaVsRest)} điểm | [${f(g.deltaCI.lo)}; ${f(g.deltaCI.hi)}] | ${g.withoutTopRoeContributor?.n??0} / ${f(g.withoutTopRoeContributor?.avgNetRoe5x)}% |`),
  '', '## Kết luận triển khai','',
  `Nhóm vượt màn sàng lọc hồi cứu (N≥50, cuối kỳ N≥25, stress toàn mẫu dương, cả hai đoạn dương và CI ROE thấp >0): **${s.screenPassLabels.map(k=>LABELS[k]).join(', ')||'không có'}**. Vượt màn này cũng chưa thay cho kiểm chứng trên dữ liệu mới.`,
  'Lớp bổ sung có ích để đọc bối cảnh và thu thống kê riêng. Chưa được gọi nhóm nào là tín hiệu SHORT đã xác nhận hoặc gate đã chứng minh có lợi thế. Không triển khai tự vào/chặn lệnh theo kết quả vài ngày này.',
  '', 'Nếu triển khai quan sát: chốt version + input + nhãn ngay lúc phát và giữ nguyên ở record lệnh. Với JSON cũ thiếu proof, hiển thị UNKNOWN, không phân loại lại bằng dữ liệu mới. Cần thống kê các fill CLOSED thật đúng nguồn, bỏ DCA/mixed group, kiểm tra trên mẫu mới đủ nhiều coin/ngày. Bất kỳ nhãn/card runtime mới nào phải nối checkbox WHITELIST cùng lượt theo AGENTS: key khớp runtime, mặc định OFF, chỉ hiện khi CLOSED AvgROE >4%; backtest này không được dùng thay điều kiện CLOSED.',
  '', '## Tái lập','',
  '```sh','node scripts/test-research-pump-turn-near-classification-20261028.mjs','node scripts/research-pump-turn-near-classification-20261028.mjs','```',
  '', `Input SHA256 cohort.json: \`${s.inputSha256.cohort}\`; results.json: \`${s.inputSha256.results}\`.`,
  'Kết quả chi tiết: reports/pump-turn-near-classification-20261028.csv và data/research/pump-turn-near-context-20261028/summary.json. Không sửa JSON runtime, không restart backend, không gửi order/Discord/Push; chưa thêm nhãn/card/WHITELIST runtime.',
  ''];return lines.join('\n');
}

export async function main(){
 const cohortBytes=await fs.readFile(path.join(sourceDir,'cohort.json')),resultBytes=await fs.readFile(path.join(sourceDir,'results.json'));
 const snapshot=JSON.parse(cohortBytes),oldResults=JSON.parse(resultBytes);
 const resultMap=new Map(oldResults.records.map(e=>[e.id,e.results]));
 const classified=snapshot.events.map(e=>({...e,classification:classifyNearShort(e)}));
 const records=classified.map(e=>({...e,results:resultMap.get(e.id)}));
 const mature=matureCohort(records,snapshot.cutoff).sort((a,b)=>a.observedAt-b.observedAt);
 if(mature.length!==527||mature.some(e=>!e.results?.immediate?.complete||!finite(e.results.immediate.netRoe5x)))throw Error('Frozen cohort changed or outcomes missing; review instead of silently changing sample.');
 const splitAt=oldResults.summary.splitAt,waveIds=new Set(firstRetainedWaveEvents(mature).map(e=>e.id));
 const baseline=stability(mature,splitAt,waveIds),groups={};
 for(const label of Object.keys(LABELS)){
  const xs=mature.filter(e=>e.classification.label===label),rest=mature.filter(e=>e.classification.label!==label);
  groups[label]={...stability(xs,splitAt,waveIds),deltaVsRest:xs.length&&rest.length?mean(xs.map(e=>e.results.immediate.netRoe5x))-mean(rest.map(e=>e.results.immediate.netRoe5x)):null,deltaCI:deltaBootstrap(mature,label)};
 }
 const summary={version:VERSION,rules:RULE,totalEvents:records.length,primaryEvents:mature.length,cutoff:snapshot.cutoff,splitAt,inputSha256:{cohort:createHash('sha256').update(cohortBytes).digest('hex'),results:createHash('sha256').update(resultBytes).digest('hex')},baseline,groups,
  screenPassLabels:Object.keys(groups).filter(k=>groups[k].retrospectiveScreenPass),allEventLabelCounts:Object.fromEntries(Object.keys(LABELS).map(k=>[k,records.filter(e=>e.classification.label===k).length])),
  flowByDepth:Object.fromEntries([true,false].map(deep=>[deep?'deep':'notDeep',Object.fromEntries(['SELL_PRESSURE','BUY_PRESSURE','MIXED'].map(flow=>[flow,summarize(mature.filter(e=>e.classification.deepDrop===deep&&e.classification.flow===flow))]))]))};
 await fs.mkdir(outputDir,{recursive:true});await fs.writeFile(path.join(outputDir,'summary.json'),JSON.stringify(summary,null,2));
 await fs.writeFile(path.join(outputDir,'classifications.json'),JSON.stringify(classified.map(e=>({id:e.id,symbol:e.symbol,input:preEventInput(e),classification:e.classification})),null,2));
 const matureIds=new Set(mature.map(e=>e.id));const csv=['id,symbol,observedAt,primaryMature,period,label,flow,dropFromPeakPct,preBuyPct,preVolumeX,gain60,status,netRoe5x,stressRoe5x'];
 for(const e of records){const c=e.classification,t=e.results.immediate;csv.push([e.id,e.symbol,new Date(e.observedAt).toISOString(),matureIds.has(e.id)?1:0,matureIds.has(e.id)?e.observedAt<splitAt?'first70':'last30':'timeExcluded',c.label,c.flow,c.dropFromPeakPct,e.preBuyPct,e.preVolumeX,e.gain60,t.status,t.netRoe5x,t.stressRoe5x].map(x=>x??'').join(','));}
 await fs.writeFile(path.join(root,'reports/pump-turn-near-classification-20261028.csv'),csv.join('\n')+'\n');
 await fs.writeFile(path.join(root,'reports/pump-turn-near-classification-20261028.md'),report(summary));
 console.log(JSON.stringify({version:VERSION,n:mature.length,baseline:baseline.all,groups:Object.fromEntries(Object.entries(groups).map(([k,g])=>[k,{n:g.all.n,roe:g.all.avgNetRoe5x,win:g.all.winPct,rebound15:g.all.rebound15mGe2Pct,first:g.first70.avgNetRoe5x,last:g.last30.avgNetRoe5x,lastN:g.last30.n,ci:g.all.clusterCI,firstWaveN:g.firstRetainedPerPeak.n,firstWaveRoe:g.firstRetainedPerPeak.avgNetRoe5x,deltaCI:g.deltaCI}])),screenPassLabels:summary.screenPassLabels},null,2));
 return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
