import fs from 'node:fs/promises';
const dir='data/research/failed-top-14d-20261031',r=JSON.parse(await fs.readFile(dir+'/results.json','utf8'));
const vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'}),f=v=>Number.isFinite(v)?v.toFixed(3):'—';
const qualified=r.events.filter(e=>e.qualifies),day=t=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
const days={},coins={};for(const e of qualified){days[day(e.at)]=(days[day(e.at)]??0)+1;coins[e.symbol]=(coins[e.symbol]??0)+1;}
const lines=['# Đếm mẫu gần đỉnh thất bại và ratio giảm — 14 ngày','',`Version ${r.version}. Khoảng ${vn(r.manifest.start)} → ${vn(r.manifest.end)} UTC+7.`,
'',`Quét ${r.manifest.universe.length} hợp đồng Binance USDT-M perpetual đang giao dịch. Có ${r.counts.priceCandidates} mẫu giá, ${r.counts.ratioDown} mẫu có ratio giảm trước đó, trên ${r.counts.coins} coin. ${r.counts.missingRatio} mẫu giá không đủ ratio.`,
'','## Định nghĩa cố định để đếm','',
'- Khung nến đóng 15 phút. Đỉnh tham chiếu là high lớn nhất của 10 nến nằm trước hai nến retest, trong cửa sổ 3 giờ. Đỉnh này cao hơn đáy 24 giờ trước ít nhất 8%.',
'- Hai nến ngay trước trigger không vượt đỉnh tham chiếu; ít nhất một nến có high cách đỉnh không quá 2%.',
'- Trigger là nến đỏ đóng dưới low thấp nhất của 4 nến trước ít nhất 0,1 ATR14. Toàn bộ tham số lấy từ trước/khi nến trigger đóng.',
'- Ratio vị thế top trader khung15m, chỉ dùng điểm timestamp trước trigger ít nhất15m. Trong3 điểm gần nhất, ít nhất1 điểm thấp hơn baseline45m trước điểm cuối. Cho phép ratio hồi lại lúc thủng hỗ trợ như caseAIN; không đòi ratio tiếp tục giảm ngay lúc rơi.',
'- Mẫu giá giãn cách ít nhất4h/coin trước khi xét ratio, không chọn lại mẫu theo kết quả tương lai. Đây là quy tắc nghiên cứu mới để lượng hóa lời mô tả, không phải số tin bot đã thực gửi trong14ngày.',
'','## Diễn biến sau tín hiệu','',
'Giá vào tham chiếu là open nến15m ngay sau trigger. Tính SHORT độc lập từng mẫu. Giả định chi phí0,12% notional/vòng; chưa tính funding hoặc thanh khoản khớp thực. Không phải một danh mục có vốn được mô phỏng.','',
'| Giữ | Mẫu đủ thời gian | Win sau chi phí | TB net/notional | Chạm dưới entry 1 ATR |','|---|---:|---:|---:|---:|'];
for(const [h,s]of Object.entries(r.stats))lines.push(`| ${h}phút | ${s.n} | ${f(s.winPct)}% | ${f(s.meanNetPct)}% | ${s.hitLower1Atr} |`);
lines.push('','## Số mẫu theo ngày VN','','| Ngày | Mẫu |','|---|---:|');for(const [d,n]of Object.entries(days))lines.push(`| ${d} | ${n} |`);
lines.push('','## Coin có nhiều mẫu','','| Coin | Mẫu |','|---|---:|');for(const [c,n]of Object.entries(coins).sort((a,b)=>b[1]-a[1]).slice(0,25))lines.push(`| ${c} | ${n} |`);
lines.push('','## Đối chiếu AINUSDT','','```json',JSON.stringify(r.events.filter(e=>e.symbol==='AINUSDT').map(e=>({atVN:vn(e.at),qualifies:e.qualifies,ratio:e.ratio,roof:e.roof,support:e.support,entry:e.entry,outcomes:e.outcomes})),null,2),'```','',
'## Phạm vi và giới hạn','',
'Đây là backtest mẫu cấu trúc giá + Position ratio. Chưa xác nhận các vùng vàng Model1/3 lịch sử và chưa chứng minh thanh lý cưỡng bức. Không được gọi tất cả kết quả là số lần quét đúng cụm vàng. Raw heatmap đang có chỉ giữ một cửa sổ gần đây; không lấy heatmap hiện tại để điền ngược14ngày.',
'',
'Danh sách lấy các hợp đồng USDT perpetual đang giao dịch tại ngày quét, có thiên lệch sống sót; không bao gồm COIN-M, USDC hoặc coin đã hủy niêm yết. Coin niêm yết mới có lịch sử ngắn hơn14ngày. Ratio không có receipt timestamp lịch sử; lag15m là giả định giảm rủi ro dùng dữ liệu chưa công bố. Khung15m có thể bỏ lỡ mẫu rất ngắn. Đây là nghiên cứu thăm dò sau ví dụAIN, chưa có kiểm định ngoài mẫu. Không đổi bot/Discord/Binance.',
'',`Lỗi dữ liệu: ${r.errors.length}. Coin không đủ toàn bộ1440nến gồm24h warmup: ${r.cohorts.filter(c=>c.bars<1440).length}.`,
'','Nguồn: [Binance Futures Market Data](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data), GET exchangeInfo, klines15m, topLongShortPositionRatio15m.','');
await fs.writeFile(dir+'/BAO_CAO_14_NGAY.md',lines.join('\n'));
const columns=['symbol','atVN','ratioQualified','nearTopRatioDropPct','ratioLatest15mChangePct','roof','support','entry','net15m','net60m','hitLower1Atr60m'];const rows=[columns.join(',')];for(const e of r.events)rows.push([e.symbol,vn(e.at),e.qualifies,e.ratio?.nearTopDropPct,e.ratio?.changePct,e.roof,e.support,e.entry,e.outcomes[15]?.netPct,e.outcomes[60]?.netPct,e.outcomes[60]?.hitLower1Atr].map(v=>JSON.stringify(v??'')).join(','));await fs.writeFile(dir+'/TIN_HIEU_14_NGAY.csv',rows.join('\n')+'\n');
console.log(JSON.stringify({report:dir+'/BAO_CAO_14_NGAY.md',counts:r.counts,stats:r.stats,ain:r.events.filter(e=>e.symbol==='AINUSDT').length,errors:r.errors}));
