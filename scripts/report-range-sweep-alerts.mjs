import fs from 'node:fs/promises';
const dir='data/research/range-sweep-alert-backtest-20261031';
const r=JSON.parse(await fs.readFile(dir+'/results.json','utf8'));
const p=(v,d=3)=>Number.isFinite(v)?v.toFixed(d):'—';
const vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'});
const lines=[
'# Kiểm tra các cảnh báo RangeSweep đã gửi Discord',
'',
`Version: ${r.version}. Mẫu chốt lúc ${vn(r.cutoff)} (UTC+7).`,
'',
`Có ${r.scope.events} cảnh báo trên ${r.scope.symbols} coin, từ ${vn(r.scope.firstSignal)} đến ${vn(r.scope.lastSignal)}. Chỉ lấy LONG/SHORT có delivery SENT và sent > 0, khử trùng ID. Bao gồm bản chụp lịch sử đã lưu. Bộ nhớ bot chỉ giữ 500 sự kiện nên đây không phải toàn bộ lịch sử trọn đời.`,
'',
'## Đánh giá',
'',
'Chưa đủ cơ sở đánh giá tốt cho cả hai phía. LONG có kết quả tốt hơn ở khoảng 15 phút và mô hình TP/SL ngắn, nhưng lợi thế chưa ổn định qua hai nửa thời gian. SHORT phá nền và SHORT tiếp diễn có kết quả yếu trong mẫu này. SHORT từ chối vùng có kết quả tốt hơn ở 30 phút, nhưng chỉ có 7 trường hợp nên chưa đủ để xác nhận một rule giao dịch.',
'',
`LONG giữ 15 phút: TB net ${p(r.groups.LONG.horizons[15].avgNetPct)}%, nhưng nửa đầu ${p(r.chronological.LONG.firstHalf.horizons[15].avgNetPct)}% chuyển thành ${p(r.chronological.LONG.secondHalf.horizons[15].avgNetPct)}% ở nửa sau. Khoảng tin cậy LONG chứa 0. Đây chưa phải bằng chứng lợi thế bền vững.`,
'',
'Mô hình TP 1 ATR/SL 1 ATR có kết quả LONG tốt hơn giữ cố định 30 phút. Đây là giả thuyết quản lý thoát lệnh cần kiểm tra trên dữ liệu mới; không chọn hồi cứu 15 phút hoặc 1 ATR rồi coi là tối ưu đã được xác nhận. Thống kê hiện tại chưa chứng minh màu xanh/đỏ tương đương vào lệnh tốt. Không tự đổi bot theo kết quả nghiên cứu.',
'',
'## Phương pháp',
'',
'- Giá vào: giá mở cửa nến giao dịch 1 phút đầu tiên sau thời điểm Discord gửi thành công. Không dùng high/low của phút đang chạy trước khi nhận tin.',
'- Giữ lần lượt 5, 15, 30, 60 phút; loại riêng mẫu chưa đủ thời gian hoặc thiếu nến. ATR lấy từ snapshot trước tín hiệu, không tính lại từ tương lai.',
'- Trừ chi phí cố định 0,12% notional/vòng: giả định phí taker 0,05% và trượt giá 0,01% mỗi chiều; chưa xác minh biểu phí tài khoản. Có thêm kịch bản chi phí 0,20%. Tính funding thực tế qua lịch sử công khai theo phía LONG/SHORT.',
'- Thử riêng TP 1 ATR / SL 1 ATR và TP 2 ATR / SL 1 ATR, đóng sau tối đa 30 phút. Đây là giả định nghiên cứu vì cảnh báo không có SL/TP giao dịch. Nếu một nến chạm cả hai, tính SL trước; gap khớp giá mở nến.',
'- Mỗi cảnh báo là một phép thử độc lập cùng notional, có thể chồng lấn. Không suy tổng % thành lợi nhuận một tài khoản. ROE 3× chỉ là quy đổi từ lợi nhuận notional.',
'',
'## Kết quả theo thời gian giữ',
'',
'| Phía | Giữ | Mẫu đủ | Thắng sau chi phí | TB net/notional | Trung vị net | PF | TB net với phí 0,20% |',
'|---|---:|---:|---:|---:|---:|---:|---:|'];
for(const side of ['ALL','LONG','SHORT'])for(const h of [5,15,30,60]){const s=r.groups[side].horizons[h];lines.push(`| ${side} | ${h}m | ${s.n} | ${p(s.winPct,1)}% | ${p(s.avgNetPct)}% | ${p(s.medianNetPct)}% | ${p(s.profitFactor,2)} | ${p(s.avgStressNetPct)}% |`);}
lines.push('','PF = tổng các kết quả dương / trị tuyệt đối tổng các kết quả âm, sau chi phí và funding. Mẫu thắng là kết quả net > 0.','',
'## Phân loại tín hiệu — giữ 15 phút','','| Phía / loại | Mẫu | Thắng net | TB net | Trung vị net | PF | Chạm vùng đích trước 15 phút* |','|---|---:|---:|---:|---:|---:|---:|');
for(const [name,g]of Object.entries(r.phases)){const s=g.horizons[15];lines.push(`| ${name} | ${s.n} | ${p(s.winPct,1)}% | ${p(s.avgNetPct)}% | ${p(s.medianNetPct)}% | ${p(s.profitFactor,2)} | ${s.targetHitCount??'—'}/${s.targetEligible??'—'} |`);}
lines.push('','*Chỉ áp dụng DIRECTION_CONFIRMED khi vùng đích còn ở phía trước giá vào. Chạm vùng là kết quả quan sát, chưa trừ SL và không đồng nghĩa có lãi sau chi phí. CONTINUATION/REJECTION đã diễn ra ở vùng nên không dùng tỷ lệ này.','',
'## Thử TP/SL theo ATR, timeout 30 phút','','| Phía | TP/SL | Mẫu | Thắng net | TB net | PF | TP | SL | Timeout | Nến chạm cả hai |','|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
for(const side of ['LONG','SHORT'])for(const [name,s]of Object.entries(r.groups[side].brackets)){const o=s.outcomes;lines.push(`| ${side} | ${name} | ${s.n} | ${p(s.winPct,1)}% | ${p(s.avgNetPct)}% | ${p(s.profitFactor,2)} | ${(o.TP??0)+(o.TP_GAP??0)} | ${(o.SL??0)+(o.SL_GAP??0)} | ${o.TIMEOUT??0} | ${s.ambiguous} |`);}
lines.push('','## Độ ổn định','','| Phía | Nửa đầu: mẫu / TB net 15m | Nửa sau: mẫu / TB net 15m | Khoảng 95% TB net 15m | Block giờ |','|---|---:|---:|---:|---:|');
for(const side of ['LONG','SHORT']){const c=r.chronological[side],u=r.uncertainty[side];lines.push(`| ${side} | ${c.firstHalf.horizons[15].n} / ${p(c.firstHalf.horizons[15].avgNetPct)}% | ${c.secondHalf.horizons[15].n} / ${p(c.secondHalf.horizons[15].avgNetPct)}% | ${u.ci95?.map(x=>p(x)+'%').join(' đến ')??'thiếu block'} | ${u.blocks} |`);}
lines.push('','Khoảng tin cậy dùng 3.000 lần bootstrap theo block thời gian 1 giờ để giữ các tín hiệu đồng thời trong cùng nhịp thị trường. Vẫn chỉ là một khoảng quan sát ngắn, không phải kiểm định nhiều chế độ thị trường. Không chọn bộ lọc tốt nhất từ các kết quả này rồi gọi là xác nhận ngoài mẫu.','',
'## Minh bạch dữ liệu','','```json',JSON.stringify({scope:r.scope,errors:r.errors,exclusions:Object.fromEntries(Object.entries(r.groups).map(([k,v])=>[k,Object.fromEntries(Object.entries(v.horizons).map(([h,s])=>[h,s.exclusions]))]))},null,2),'```','',
'Nguồn dữ liệu: [Binance Futures Market Data](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data), các endpoint GET /fapi/v1/klines và /fapi/v1/fundingRate. Dữ liệu thô được lưu trong raw/; chi tiết từng tín hiệu trong trades.csv và results.json.','',
'Không đổi runtime, Binance, đòn bẩy 3×, entry/size/SL/TP/WHITELIST; không gửi tin Discord trong quá trình nghiên cứu.');
await fs.writeFile(dir+'/BAO_CAO_BACKTEST.md',lines.join('\n')+'\n');
console.log('Wrote '+dir+'/BAO_CAO_BACKTEST.md');
