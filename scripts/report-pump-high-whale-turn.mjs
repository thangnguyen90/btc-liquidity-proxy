import fs from 'node:fs/promises';
import {normalizeChart,priceFeatures,positioningAt,H} from './research-pump-high-whale-turn.mjs';
const dir='data/research/pump-high-whale-turn-20261103',read=async p=>JSON.parse(await fs.readFile(p,'utf8')),d=await read(dir+'/results.json'),m=d.manifest;
const labels={PUMP_HIGH:'Giá bơm cao · đối chứng',PLUS_CROWD:'SHORT≥60%, giảm≥5đ%/1h · rule đầu',PLUS_WHALE_DROP:'Rule đầu + cá voi LONG giảm≥10đ%/4h',PLUS_WHALE_FLIP:'Rule đầu + cá voi LONG≥60% → ≤40%',DROP_CONFIRM:'Rule đầu + giảm LONG≥10đ% + mất hỗ trợ',FLIP_CONFIRM:'Rule đầu + đổi thiên hướng + mất hỗ trợ',DROP_REFRESH_UNFILTERED:'Rule đầu + giảm LONG≥10đ% · không loại refresh',CROWD_DOWN:'SHORT≥60%, giảm ròng bất kỳ/1h',CROWD_STEADY_DOWN:'SHORT≥60%, giảm liên tiếp qua3 khoảng20phút',CROWD_DOWN_WHALE_STILL_LONG:'SHORT giảm ròng + cá voi LONG≥60% và không giảm',CROWD_DOWN_WHALE_WEAK:'SHORT giảm ròng + tỷ trọng LONG cá voi giảm/4h',CROWD_DOWN_WHALE_DROP5:'SHORT giảm ròng + LONG cá voi giảm≥5đ%/4h',CROWD_DOWN_WHALE_DROP10:'SHORT giảm ròng + LONG cá voi giảm≥10đ%/4h',WHALE_DROP10:'LONG cá voi giảm≥10đ%/4h, bỏ điều kiện SHORT',WEAK_CONFIRM:'SHORT giảm ròng + LONG cá voi giảm≥5đ% + mất hỗ trợ'};
const f=x=>Number.isFinite(x)?x.toFixed(2):'—',pct=x=>Number.isFinite(x)?x.toFixed(1)+'%':'—',signed=x=>Number.isFinite(x)?(x>=0?'+':'')+x.toFixed(2)+'%':'—',vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false}),group=v=>d.groups.find(g=>g.variant===v);
const audit={source:'PumpGlass public chart; shares only, guest quantities are normalized',coverage:d.coverage.length,pumpHighBars:0,commonEligibleBars:0,short60Bars:0,short60DecreasingBars:0,maxShortDrop1hPp:0,whaleTrueFlipBars:0,sourceNormalizedRows:0,sourceRows:0,missingFundingSymbols:[],modelLower2xPrimaryMatches:0};
for(const c of d.coverage){audit.sourceRows+=c.whaleRows??0;audit.sourceNormalizedRows+=c.normalizedTo1000??0;if(c.status!=='OK')continue;const symbol=c.symbol,chart=normalizeChart(await read(dir+'/raw/'+encodeURIComponent(symbol)+'-chart.json')),raw=await read(m.priceSource+'/raw/'+encodeURIComponent(symbol)+'-price.json'),fund=await read(m.historySource+'/raw/'+encodeURIComponent(symbol)+'-funding.json');if(!Array.isArray(fund)||!fund.length)audit.missingFundingSymbols.push(symbol);
 for(const p of priceFeatures(raw)){if(!p?.pumpHigh||p.at<m.start||p.at>=m.end-8*H-300000||(p.at>=m.split-24*H&&p.at<m.split))continue;audit.pumpHighBars++;const x=positioningAt(chart,p.at,15);if(x.status!=='OK'||x.listRefresh)continue;audit.commonEligibleBars++;if(x.whaleFlip)audit.whaleTrueFlipBars++;if(x.crowdShort>=60){audit.short60Bars++;if(x.crowdDelta1hPp<0)audit.short60DecreasingBars++;audit.maxShortDrop1hPp=Math.max(audit.maxShortDrop1hPp,-x.crowdDelta1hPp);}}
}
audit.modelLower2xPrimaryMatches=d.records.filter(r=>r.lagMinutes===15&&r.variant==='CROWD_DOWN_WHALE_WEAK_MODEL_LOWER2X').length;
await fs.writeFile(dir+'/data-audit.json',JSON.stringify(audit,null,2));
const lines=['# Backtest coin bơm cao · SHORT giảm · nhóm cá voi đổi hướng','',
'Kết luận: chưa xác nhận được mẫu đầy đủ “cá voi từ LONG chuyển sang SHORT”. Rule ban đầu không có tín hiệu. Nhánh nới lỏng chỉ cần tỷ trọng LONG cá voi giảm có kết quả SHORT ngắn hạn tốt trong mẫu nhỏ; kết quả không chứng minh giá đã tạo đỉnh.','',
'## Phạm vi và cách kiểm tra','',
'- Version: '+d.version+'. Chỉ nghiên cứu offline; không gửi Discord, không thay đổi Web Push, Binance, entry, size, SL/TP hoặc whitelist.',
'- Dữ liệu giá đóng Binance5m: '+vn(m.start)+' – '+vn(m.end)+' VN. Quét522cặp;183cặp từng đạt bộ lọc giá và đã tải đủ lịch sử cá voi/đám đông.',
'- Giá bơm cao: close tăng≥15% so với đáy24h và nằm trong20% phía trên biên cao–thấp24h. Đây là vị trí trong nhịp giá, không phải định giá tài sản.',
'- Nguồn positioning: PumpGlass chart. SHORT đám đông =1−tỷ trọng LONG đám đông; không trộn với tỷ lệ position/account top trader của Binance.',
'- Mọi nguồn positioning chậm15phút trước quyết định; đối chiếu chậm30phút. Whale snapshot quá30phút tính từ cutoff, crowd quá10phút bị loại. Mỗi snapshot có≥10cá voi. Chỉ dùng timestamp trước quyết định.',
'- So sánh LONG cá voi với4giờ trước; SHORT đám đông với1giờ trước. Loại khoảng so sánh đi qua refresh được nguồn đánh dấu và khung dự phòng06:00–07:30UTC hằng ngày. Refresh danh sách không được coi là trader đảo lệnh.',
'- TRAIN từ đầu kỳ tới '+vn(m.split-24*H)+'. Loại24giờ kế tiếp; TEST từ '+vn(m.split)+' tới cuối kỳ. Chỉ giữ tín hiệu còn đủ8giờ tương lai. Hai phần đều thuộc dữ liệu từng được dùng ở nghiên cứu trước; đây không phải tập kiểm định mới chưa xem.',
'- Mỗi nhánh tự phát hiện và cách nhau≥8giờ/cùng coin, kể cả nếu lệnh trước đóng sớm. Các nhánh có thời điểm chọn khác nhau; bảng không phải so sánh cùng một tập lệnh cố định.',
'- Vào OPEN5m sau quyết định thêm một nến5m. Margin giả định1đơn vị, leverage3×, TP+10%ROE, SL−20%ROE trước chi phí; tối đa8giờ. Giá đi±3,33% để TP và±6,67% để SL. Không DCA.',
'- Chi phí khứ hồi0,14%notional, stress0,30%; cộng funding lịch sử. Nếu một nến chạm cảTP/SL, tính SL trước. Gap quaSL chịu giáOPEN; không giả định khớp tốt hơn thị trường.',
'- Tỷ lệ giá giảm4h là CLOSE tại4h so với OPEN entry; độc lập với việc lệnh đã TP/SL trước đó. ROE ròng là lợi nhuận trên margin giả định của từng lệnh, không phải lợi nhuận danh mục.','',
'## Kết quả từng nhánh','',
'Những dòng giảm ròng/giảm nhẹ được thêm để phân tích thành phần sau khi rule giảm≥5điểm%/1h không có tín hiệu. Đây là phân tích thăm dò, không chọn ngưỡng tốt nhất để bật bot.','',
'| Nhánh | TRAIN số / ROE SHORT TB | TEST số / coin | Giá giảm sau4h | SHORT thắng | ROE SHORT ròng TB | ROE LONG cùng điểm TB |',
'|---|---:|---:|---:|---:|---:|---:|'];
for(const g of d.groups.filter(g=>labels[g.variant]))lines.push('| '+labels[g.variant]+' | '+g.train.n+' / '+signed(g.train.meanRoe)+' | '+g.test.n+' / '+g.test.coins+' | '+pct(g.test.direction['4h'].downPct)+' | '+pct(g.test.winPct)+' | '+signed(g.test.meanRoe)+' | '+signed(g.testLong.meanRoe)+' |');
lines.push('','## Độ ổn định của nhánh giảm LONG nhẹ','');
const g=group('CROWD_DOWN_WHALE_WEAK');
lines.push('- Tổng sau purge: '+g.all.n+'tín hiệu; TRAIN '+g.train.n+'/'+g.train.coins+'coin, TEST '+g.test.n+'/'+g.test.coins+'coin. TEST '+g.test.win+'lãi/'+g.test.loss+'lỗ; '+g.test.tp+'TP, '+g.test.sl+'SL; phần còn lại hết8giờ.',
'- TEST SHORT '+signed(g.test.meanRoe)+'; stress '+signed(g.test.stressMeanRoe)+'; lùi nguồn30phút '+signed(g.lag30Test.meanRoe)+' trên'+g.lag30Test.n+'mẫu.',
'- Bỏ AIN/ESPORTS: '+g.testWithoutAinEsports.n+'mẫu, '+signed(g.testWithoutAinEsports.meanRoe)+'. Bỏ coin đóng góp tốt nhất '+g.bestCoin+': '+signed(g.testWithoutBestCoin.meanRoe)+'.',
'- Bootstrap theo8coin,2.000lần: CI95% của ROE SHORT TB ['+g.testCi?.map(f).join('; ')+']%. CI này không hiệu chỉnh việc thử nhiều nhánh, không sửa được sai lệch nguồn hoặc mẫu nhỏ.',
'- Giá4h trung bình '+signed(g.test.direction['4h'].priceMeanPct)+', trung vị '+signed(g.test.direction['4h'].priceMedianPct)+'. Có61,5%giảm sau4giờ; vì vậy TP SHORT ngắn hạn không đồng nghĩa một xu hướng giảm bền.',
'- Mức giảm của hai tỷ trọng có thể rất nhỏ, có mẫu chỉ0,01điểm% ở SHORT đám đông hoặc0,1điểm% LONG cá voi. Chưa chứng minh đó là thay đổi vị thế đáng kể.','',
'## Hai ví dụ về đường đi giá','');
const ain=d.records.find(r=>r.variant==='CROWD_DOWN_WHALE_WEAK'&&r.lagMinutes===15&&r.symbol==='AINUSDT'&&r.trades.SHORT.returns['4h']>20),es=d.records.find(r=>r.variant==='WHALE_DROP10'&&r.lagMinutes===15&&r.symbol==='ESPORTSUSDT');
for(const [r,note]of [[ain,'AIN chốt được nhịp điều chỉnh ngắn rồi bơm tiếp; mẫu này không xác nhận đỉnh.'],[es,'ESPORTS thuộc nhánh chỉ giảm LONG cá voi, SHORT đám đông chưa đạt60%. Giá đi ngược đủSL trước khi giảm; đo đúng hướng ở4h vẫn có thể thua lệnh.']])if(r)lines.push('- '+r.symbol+' · '+vn(r.entryAt)+' VN: SHORT '+signed(r.trades.SHORT.netRoe)+', giá1h '+signed(r.trades.SHORT.returns['1h'])+',4h '+signed(r.trades.SHORT.returns['4h'])+',8h '+signed(r.trades.SHORT.returns['8h'])+'. '+note);
lines.push('','## Ghép Model1/3','',
'- Dựng lại hai model từ dữ liệu trước quyết định10phút, đủ36giờ nến5m, MARK đầy đủ và OI≥95%. Thiếu dữ liệu được giữ trạng thái thiếu; không thay bằng Model1 hoặc giả định không có thanh khoản.',
'- Bộ lọc SHORT đã định: còn cụm đồng thuận phía dưới chưa bị nến sau đó quét, trong−5%; điểm dưới≥2×điểm trên. Chỉ lọc, giữ cùng TP/SL để so sánh.',
'- Nhánh giảm LONG nhẹ có '+JSON.stringify(g.modelCoverage)+' trên'+g.all.n+'mẫu chính. '+audit.modelLower2xPrimaryMatches+'mẫu chính đạt thêm điều kiện cụm dưới2×; chưa có mẫu để đánh giá hiệu quả kết hợp. Mẫu đủ dữ liệu model và kết quả đẹp không chứng minh điều kiện model cải thiện chiến lược.','',
'## Giới hạn dữ liệu và kết luận','',
'- Rule đầy đủ ban đầu có0mẫu. Số lần đổi từ LONG≥60% sang LONG≤40%/4h tại các nến bơm cao đủ nguồn, sau lọc refresh: '+audit.whaleTrueFlipBars+'. Không thể báo winrate cho một nhóm không có mẫu.',
'- Trong nhóm SHORT≥60% và giá bơm cao, mức giảm ròng SHORT lớn nhất1h là '+f(audit.maxShortDrop1hPp)+'điểm%, dưới mốc5điểm% ban đầu.',
'- '+audit.sourceNormalizedRows+'/'+audit.sourceRows+'dòng cá voi công khai có tổng cột size bằng1000. Chỉ dùng phần chia LONG/SHORT; không coi là số hợp đồng hoặc bằng chứng mở mới SHORT. API khách khóa giá vốn và luồng mở/đóng thực. Không vượt khóa nguồn.',
'- Dữ liệu dùng nhóm cá voi do nhà cung cấp phân loại, có thể tái chọn/sửa lịch sử. Loại refresh và dùng độ trễ chỉ giảm một phần sai lệch; không tạo được bằng chứng cá voi cá nhân đảo lệnh.',
'- Chuỗi SHORT là đám đông theo PumpGlass, không phải kiểm định độc lập Binance global account ratio. Không kiểm chứng PnL/giá vốn lịch sử cá voi.',
'- Mẫu nhỏ,7ngày, nhiều nhánh thăm dò và thị trường đang hoạt động tại thời điểm lấy universe; chưa kiểm chứng coin đã hủy niêm yết hay một tháng thị trường khác.',
'- Kết quả hiện phù hợp để theo dõi nhánh “bơm cao + SHORT đông giảm ròng + cá voi giảm LONG”. Chưa đủ để coi là tín hiệu xác nhận đảo chiều hoặc bật SHORT tự động. Nhánh SHORT giảm liên tiếp qua3khoảng20phút còn âm trên TEST.',
'', '## Kiểm tra và tệp kết quả','',
'- '+d.validation.independentTradeReplays+'lượt LONG/SHORT được phát lại bằng hàm mô phỏng độc lập; không sai khác. Test bổ sung kiểm tra không dùng nến/scan tương lai, nguồn cũ, refresh danh sách, funding SHORT, phí, nến chạm cảTP/SL và mất nến.',
'- signals.csv: từng tín hiệu, giờsetup/entry UTC, các tỷ trọng, ROE LONG/SHORT và giá1h/4h/8h. results.json: dữ liệu kiểm tra đầy đủ. summary.json/data-audit.json: tổng hợp và coverage.',
'- Rule và phương pháp nguồn: https://pumpglass.com/about ; mã chart công khai https://pumpglass.com/smart-money/static/chart.js?v=1793670657 . Chỉ dùng tỷ trọng công khai, không dùng thanh giả lập trong panel bị khóa.','');
const cleanLine=line=>line.includes('https://')||line.startsWith('- Version:')?line:line.replaceAll('đ%','điểm %').replace(/([\p{L}])(\d)/gu,'$1 $2').replace(/(\d)([\p{L}])/gu,'$1 $2').replace(/%(?=\p{L})/gu,'% ').replace(/([≥≤])/g,' $1 ').replace(/;(?=\S)/g,'; ').replace(/(\d) h\b/g,'$1 giờ').replace(/(\d) m\b/g,'$1 phút');
const text=lines.map(cleanLine).join(String.fromCharCode(10));await fs.writeFile(dir+'/BAO_CAO.md',text);
const dest='/mnt/d/SƯ PHẠM/BACKTEST_BOM_CAO_CA_VOI_20261103';await fs.mkdir(dest,{recursive:true});for(const file of ['BAO_CAO.md','signals.csv','summary.json','data-audit.json','manifest.json','sensitivity-plan.json'])await fs.copyFile(dir+'/'+file,dest+'/'+file);
console.log(JSON.stringify({report:dest+'/BAO_CAO.md',audit,validation:d.validation}));
