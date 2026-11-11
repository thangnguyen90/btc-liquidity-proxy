import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {simulateShortStop,summarizeStop} from './research-failed-top-stop.mjs';
const root='data/research/failed-top-14d-20261031',dir=root+'/leverage3-sl20';
await fs.mkdir(dir,{recursive:true});
const source=JSON.parse(await fs.readFile(root+'/results.json','utf8'));
const qualified=source.events.filter(e=>e.qualifies),cache=new Map(),trades=[];
for(const e of qualified){
 if(!cache.has(e.symbol))cache.set(e.symbol,JSON.parse(await fs.readFile(root+'/raw/'+encodeURIComponent(e.symbol)+'-price.json','utf8')).map(x=>({t:+x[0],end:+x[6],o:+x[1],h:+x[2],l:+x[3],c:+x[4]})));
 const bars=cache.get(e.symbol);
 for(const horizon of [15,30,60,240]){
  const r=simulateShortStop(bars,{entry:e.entry,at:e.at,horizon,cutoff:source.manifest.end});
  if(!r){assert.ok(!Number.isFinite(e.outcomes[horizon]?.netPct));continue;}
  assert.ok(Math.abs(r.baselineRoe-e.outcomes[horizon].netPct*3)<1e-9);
  assert.ok(r.reason!=='SL'||r.netRoe<=-20.36+1e-8);
  trades.push({symbol:e.symbol,at:e.at,horizon,...r});
 }
}
const stats=Object.fromEntries([15,30,60,240].map(h=>[h,summarizeStop(trades.filter(r=>r.horizon===h))]));
for(const h of [15,30,60,240])assert.equal(stats[h].n,source.stats[h].n);
const result={version:'FAILED_TOP_SHORT_3X_SL20_RESEARCH_V1_20261031',sourceVersion:source.version,
 start:source.manifest.start,end:source.manifest.end,signalCount:qualified.length,coins:cache.size,
 assumptions:{side:'SHORT',leverage:3,slRoeBeforeCosts:20,adversePricePct:20/3,stopTrigger:'CONTRACT_PRICE 15m high',exit:'First SL, otherwise horizon close; no TP',costPctNotional:.12,stressCostPctNotional:.20,funding:'EXCLUDED',gapFill:'max(stop price, bar open)',cohort:'Full mature horizon required for both stopped and baseline samples',portfolio:'Independent trades, fixed initial margin; not a compounding portfolio; no overlap or capital allocation simulation',intrabar:'First stop bar known; exact trigger time and tick execution unknown',heatmap:'No historical Model1/3 reconstruction; same price/ratio proxy sample'},stats,trades};
await fs.writeFile(dir+'/results.json',JSON.stringify(result,null,2));
const f=v=>v.toFixed(3),vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'});
const lines=['# Backtest SHORT 3×, SL 20% ROE','',`Version: ${result.version}. Cửa sổ ${vn(result.start)} → ${vn(result.end)} UTC+7.`,
 '',`Giữ nguyên ${qualified.length} mẫu giá/ratio trên ${cache.size} coin từ nghiên cứu trước, thuộc 522 hợp đồng USDT-M perpetual đang giao dịch. Đây không phải thống kê lệnh đã khớp hay toàn bộ tin Discord.`,
 '', 'SL 20% được hiểu là lỗ 20% trên ký quỹ ban đầu, trước phí: SHORT dừng tại entry × (1 + 20%/3) = entry × 1,0666667. Vào tại open nến sau trigger; không đặt TP; chạm SL thì thoát, còn lại thoát theo thời gian. Dùng high giá giao dịch của nến 15 phút, không phải mark price.',
 '', 'Chi phí giả định tổng phí và trượt giá 0,12% notional/vòng = 0,36% ký quỹ ở 3×. SL thông thường cho net −20,36%; gap qua SL khớp tại open bất lợi hơn. Stress chi phí 0,20% notional/vòng. Chưa tính funding. Không giả định SL bảo đảm mức lỗ tối đa khi khớp thật.',
 '', '| Thoát tối đa | Mẫu | Win | TB ROE không SL | TB ROE có SL | Trung vị ROE | Profit factor | Chạm SL | TB ROE stress |',
 '|---|---:|---:|---:|---:|---:|---:|---:|---:|'];
for(const [h,s]of Object.entries(stats))lines.push(`| ${h} phút | ${s.n} | ${f(s.winPct)}% | ${f(s.meanNoStopRoe)}% | ${f(s.meanNetRoe)}% | ${f(s.medianNetRoe)}% | ${f(s.profitFactor)} | ${s.stopCount} (${f(s.stopPct)}%) | ${f(s.meanStressRoe)}% |`);
lines.push('', '## Kiểm tra ảnh hưởng của SL', '', '| Thời gian | ROE thấp nhất | ROE cao nhất | SL có lợi hơn giữ đến hết | Chạm SL rồi cuối kỳ có thể lãi | Gap qua SL |', '|---|---:|---:|---:|---:|---:|');
for(const [h,s]of Object.entries(stats))lines.push(`| ${h} phút | ${f(s.minRoe)}% | ${f(s.maxRoe)}% | ${s.stopsImprovedOutcome} | ${s.stoppedButWouldFinishProfitable} | ${s.gapStops} |`);
lines.push('', '## Đánh giá và giới hạn', '',
 'Các mốc giữ lệnh đều có lợi nhuận trung bình âm sau chi phí giả định. Đòn bẩy 3× phóng đại cả lãi/lỗ và chi phí tính trên ký quỹ; SL thay đổi đuôi phân phối nhưng chưa chứng minh mẫu tín hiệu có lợi thế.',
 'Mọi so sánh dùng cùng tập mẫu đã đủ toàn bộ thời gian theo dõi. Tín hiệu sát cuối kỳ bị loại dù có thể đã chạm SL, tránh lệch mẫu về các lệnh thua kết thúc sớm. Thống kê từng lệnh độc lập, không cộng thành lợi nhuận tài khoản hay max drawdown danh mục.',
 'Chỉ có SL và thoát thời gian nên không có tranh chấp TP/SL cùng nến. Nến 15m cho biết đã chạm giá SL nhưng không biết chính xác giây khớp, spread, tick hoặc độ sâu. Funding, mark-price stop, tick size, phí thực của tài khoản và khả năng trượt giá lúc biến động mạnh chưa mô phỏng. Dữ liệu/tham số được giữ nguyên từ nghiên cứu thăm dò; chưa có kiểm định ngoài mẫu hoặc xác nhận vùng Model1/3 lịch sử.',
 'Không thay đổi bot, Binance, Discord, entry, size, SL/TP thực tế hoặc WHITELIST.',
 '', 'Binance hỗ trợ trigger theo MARK_PRICE hoặc CONTRACT_PRICE: [tài liệu connector chính thức](https://github.com/binance/binance-futures-connector-python/blob/main/binance/um_futures/account.py). Nghiên cứu này dùng CONTRACT_PRICE.', '');
await fs.writeFile(dir+'/BAO_CAO_3X_SL20.md',lines.join('\n'));
const columns=['symbol','at','horizon','entry','stopPrice','exit','reason','exitBarAt','gapThroughStop','grossRoe','netRoe','baselineRoe','stressNetRoe'];
await fs.writeFile(dir+'/TRADES_3X_SL20.csv',[columns.join(','),...trades.map(t=>columns.map(c=>JSON.stringify(t[c]??'')).join(','))].join('\n')+'\n');
await fs.writeFile(dir+'/validation.json',JSON.stringify({passed:true,qualified:qualified.length,pairedHorizonCounts:Object.fromEntries(Object.entries(stats).map(([h,s])=>[h,s.n])),baselineReconciliation:'All rows equal previous net notional ×3',slCheck:'Every SL net ROE <= -20.36% before funding'} ,null,2));
console.log(JSON.stringify({dir,stats}));
