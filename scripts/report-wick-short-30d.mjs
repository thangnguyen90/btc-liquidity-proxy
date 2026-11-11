import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='data/research/wick-short-30d-20261031',r=JSON.parse(await fs.readFile(dir+'/results.json','utf8'));
const f=v=>Number.isFinite(v)?v.toFixed(2):'—',vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'}),avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const names={priceOnly:'Chỉ mẫu nến + giữ nền',globalShort60:'SHORT toàn thị trường ≥60%',topAccountShort60:'SHORT tài khoản top ≥60%',topPositionShort60:'SHORT vị thế top ≥60%',globalShortRising:'Tỷ trọng SHORT toàn thị trường tăng',topPositionShortRising:'Tỷ trọng SHORT vị thế top tăng',globalShort60TopPositionLong:'SHORT thị trường ≥60% + vị thế top nghiêng LONG'};
const lines=['# Nến bất thường giữ nền và SHORT đông — 30 ngày','',`Khoảng ${vn(r.manifest.start)} → ${vn(r.manifest.end)} UTC+7. Version ${r.manifest.version}.`,
 '',`Universe cố định ${r.manifest.universe.length} USDT-M perpetual đang giao dịch, đã xử lý ${r.cohorts.length}, lỗi ${r.errors.length}. Có ${r.events.length} mẫu trên ${r.splits.priceOnly.coins} coin. Không gồm COIN-M/USDC hoặc coin đã hủy niêm yết.`,
 '', '**Đây là phần kiểm tra mẫu nến + tỷ lệ SHORT. Chưa kiểm tra điều kiện Model 1/3 phía dưới ít trên cả tháng: cache heatmap chỉ khoảng 36 giờ. Không thể dùng heatmap hiện tại để điền ngược lịch sử.**',
 '', '## Định nghĩa chốt trước khi chạy', '',
 '- Nến đóng 15m. Một nến bất thường có range ≥2 ATR14 trước nến, râu dài nhất ≥50% range và quote-volume ≥3 lần trung vị 20 nến trước.',
 '- Có ít nhất 2 nến bất thường trong 24 nến gần nhất (6 giờ), nến cuối cũng bất thường. Nền 12 nến trước có width ≤8 ATR, efficiency ≤0,35; giá đóng nến trigger nằm trong high/low nền. Đây là định nghĩa thăm dò, không phải toàn bộ hình dạng có thể gọi là giống ảnh.',
 '- Mẫu giá giãn cách 6h/coin trước khi xét ratio; không chọn lại theo kết quả tương lai. Nền/ATR/volume đều dùng nến đã đóng.',
 '- Ratio dùng khung 1h, điểm timestamp trước tín hiệu ít nhất 1h, không cũ quá thêm 1h; đo tỷ trọng SHORT = 100/(1+L/S). “SHORT cao” chốt ≥60%. Đo tăng tương đối so với điểm 1h trước khi có đủ cả hai điểm. Khung 1h giảm độ chi tiết so với nến 15m; không có receipt timestamp gốc, độ trễ là giả định.',
 '- Global đo tài khoản toàn thị trường; Account đo số tài khoản nhóm top; Position đo tỷ trọng vị thế nhóm top. Không trộn ba loại. Nhóm top là 20% có margin balance cao nhất, không phải top hiệu suất.',
 '', '## Đúng được hiểu thế nào', '',
 'Vào LONG ở open nến 15m kế tiếp. Thành công cấu trúc: chạm +5% trước −5% trong 24h. Nếu cùng nến chạm cả hai, tính thất bại để thận trọng; nếu chưa chạm mốc nào, tính không thành công và công bố riêng. Đây không phải xác nhận thanh lý SHORT thực.',
 'Đánh giá giao dịch riêng: leverage 3×, SL −20% ROE trước phí (giá −6,6667%), không TP, thoát sau 1h/4h/24h nếu chưa SL. Stop theo low CONTRACT_PRICE; gap qua stop lấy open bất lợi hơn. Tổng chi phí giả định 0,12% notional = 0,36% margin, chưa funding/depth/tick. Chỉ tính mẫu đủ toàn bộ horizon, thống kê mỗi lệnh độc lập, không phải lợi nhuận tài khoản.',
 '', '| Điều kiện bổ sung | Mẫu / coin | Đủ 24h | +5% trước −5% | Win giao dịch 24h | TB ROE 24h | PF 24h |', '|---|---:|---:|---:|---:|---:|---:|'];
for(const[k,s]of Object.entries(r.splits)){const x=s.outcomes[24];lines.push(`| ${names[k]} | ${s.events} / ${s.coins} | ${x.n} | ${f(x.successPct)}% | ${f(x.winPct)}% | ${f(x.meanNetRoe)}% | ${f(x.profitFactor)} |`);}
lines.push('', '## Kết quả theo thời gian giữ', '', '| Nhóm | Giữ | Mẫu | Win | TB ROE sau chi phí | SL | Cùng nến ±5% | Chưa chạm ±5% |', '|---|---|---:|---:|---:|---:|---:|---:|');
for(const[k,s]of Object.entries(r.splits))for(const[h,x]of Object.entries(s.outcomes))lines.push(`| ${names[k]} | ${h}h | ${x.n} | ${f(x.winPct)}% | ${f(x.meanNetRoe)}% | ${x.sl} | ${x.ambiguous} | ${x.neither} |`);
const predicates={globalShort60:e=>e.ratios.global?.shortPct>=60,topAccountShort60:e=>e.ratios.account?.shortPct>=60,topPositionShort60:e=>e.ratios.position?.shortPct>=60};
const mid=(r.manifest.start+r.manifest.end)/2;
lines.push('', '## Độ ổn định và nhóm đối chiếu', '', 'Nửa đầu/nửa sau chia theo trung điểm thời gian, đều là phân tích trong mẫu; chưa phải kiểm định ngoài mẫu. Nhóm đối chiếu chỉ dùng mẫu có ratio tương ứng.', '', '| Nhóm | Nửa đầu N / TB ROE 24h | Nửa sau N / TB ROE 24h | Không đạt N / TB ROE 24h |', '|---|---:|---:|---:|');
const stats=es=>`${es.length} / ${f(avg(es.map(e=>e.outcomes[24].netRoe)))}%`;
for(const[k,fn]of Object.entries(predicates)){const type={globalShort60:'global',topAccountShort60:'account',topPositionShort60:'position'}[k],pass=r.events.filter(e=>e.outcomes[24]&&fn(e)),fail=r.events.filter(e=>e.outcomes[24]&&e.ratios[type]&&!fn(e));lines.push(`| ${names[k]} | ${stats(pass.filter(e=>e.at<mid))} | ${stats(pass.filter(e=>e.at>=mid))} | ${stats(fail)} |`);}
lines.push('', '## Số coin và mẫu theo ngày', '', '| Ngày UTC+7 | Mẫu giá | Coin | SHORT thị trường ≥60% |', '|---|---:|---:|---:|');
const day=t=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok'}).format(new Date(t));
for(const d of [...new Set(r.events.map(e=>day(e.at)))].sort()){const es=r.events.filter(e=>day(e.at)===d);lines.push(`| ${d} | ${es.length} | ${new Set(es.map(e=>e.symbol)).size} | ${es.filter(predicates.globalShort60).length} |`);}
lines.push('', '## Đối chiếu AINUSDT', '', '```json',JSON.stringify(r.events.filter(e=>e.symbol==='AINUSDT'),null,2),'```', '', '## Giới hạn dữ liệu', '',
 `Thiếu ratio tại mẫu: ${JSON.stringify(r.ratioMissing)}. Thiếu ratio không được xem là SHORT thấp. Lỗi HTTP hoặc coin lỗi: ${JSON.stringify(r.errors)}. Coin thiếu lịch sử đầy đủ 31 ngày gồm warmup: ${r.cohorts.filter(c=>c.bars<31*96).length}.`,
 'Các ngưỡng được đặt để lượng hóa ví dụ vừa quan sát, có nguy cơ khớp ví dụ và thiên lệch chọn mẫu. Nhiều bộ lọc được báo cáo đầy đủ, không chọn ngưỡng tối ưu theo kết quả. Một số coin tạo nhiều mẫu, nên các mẫu không độc lập. Universe hiện tại có thiên lệch sống sót. Chưa kiểm chứng bộ đầy đủ gồm thanh khoản phía dưới thấp, chưa thể suy nguyên nhân hay chủ ý thao túng.',
 'Không đổi bot, Discord, Binance hoặc WHITELIST.', '', '[Nguồn dữ liệu và định nghĩa Binance](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data).', '');
try { lines.push('\n'+await fs.readFile(dir+'/PHAN_TICH_DO_NHAY.md','utf8')); } catch(e) { if(e.code!=='ENOENT')throw e; }
await fs.writeFile(dir+'/BAO_CAO_30_NGAY.md',lines.join('\n'));
const columns=['symbol','atVN','globalShortPct','topAccountShortPct','topPositionShortPct','volumeX','wickPct','widthAtr','entry','success24h','netRoe1h','netRoe4h','netRoe24h','SL24h'];
await fs.writeFile(dir+'/TIN_HIEU_30_NGAY.csv','\ufeff'+[columns.join(','),...r.events.map(e=>[e.symbol,vn(e.at),e.ratios.global?.shortPct,e.ratios.account?.shortPct,e.ratios.position?.shortPct,e.volX,e.wick*100,e.widthAtr,e.entry,e.outcomes[24]?.success,e.outcomes[1]?.netRoe,e.outcomes[4]?.netRoe,e.outcomes[24]?.netRoe,e.outcomes[24]?.stopped].map(x=>JSON.stringify(x??'')).join(','))].join('\n')+'\n');
assert.equal(r.cohorts.length+r.errors.length,r.manifest.universe.length);
for(const c of r.cohorts){for(let i=1;i<c.events.length;i++)assert.ok(c.events[i].at-c.events[i-1].at>=21600000);}
for(const e of r.events){for(const x of Object.values(e.ratios))if(x){assert.ok(x.at<=e.at-3600000);assert.ok(e.at-3600000-x.at<=3600000);}for(const [h,o]of Object.entries(e.outcomes))if(o)assert.ok(e.at+Number(h)*3600000<=r.manifest.end);}
await fs.writeFile(dir+'/validation.json',JSON.stringify({passed:true,cohorts:r.cohorts.length,errors:r.errors.length,cooldown:true,ratioAsOf:true,maturity:true},null,2));
console.log(JSON.stringify({splits:r.splits,ratioMissing:r.ratioMissing,errors:r.errors}));
