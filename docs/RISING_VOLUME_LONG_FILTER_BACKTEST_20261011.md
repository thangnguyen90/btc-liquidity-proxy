# Backtest trước khi thêm gate LONG Volume 1m — 11/10/2026

Version nghiên cứu: `RISING_VOLUME_LONG_FILTER_REPLAY_V1_20261011_OBSERVE_ONLY`. **Chưa áp dụng bộ lọc vào Binance.** Không đổi detector, route, entry, margin, TP/SL hoặc lệnh cũ.

## Kết luận

Bộ lọc `taker-buy >=50%` + `0% <= khoảng cách trên EMA99 1m <1.5%` có thể giảm ca SL sâu, nhưng **chưa đủ ổn định để thêm gate thật**. Trong replay 6 giờ, AvgROE tăng từ +1.72% lên +2.31%, nhưng tỷ lệ net-positive giảm 62.7% → 59.8%, số mẫu giảm 177 → 92 và tổng paper net giảm +9.15 → +6.38 USDT. Bộ lọc bỏ 6/7 SL nhưng cũng bỏ 50 ca TP; nhóm bị bỏ vẫn có paper net dương +2.77 USDT.

Kết quả phụ thuộc thời gian giữ: replay 1 giờ, rule gốc gần hòa vốn (−0.065% AvgROE), bộ lọc −0.328%. Ngày 10/10 bộ lọc tốt, nhưng mẫu 11/10 âm và kém rule gốc. Không nâng taker-buy lên60% chỉ vì nghĩ lực mua càng cao càng tốt; biến thể60% có hiệu quả tổng thể thấp hơn.

## Dữ liệu, mốc chốt và giới hạn mẫu

- Chốt entry/outcome nghiên cứu lúc **11:56:55 VN 11/10/2026**, tức `2026-10-11T04:56:55.026Z`. Các entry nằm từ17:14 ngày08/10 tới11:56 ngày11/10. Không lấy các entry mới sau mốc này.
- 189 original LONG thực khớp, đúng source `rising-volume-sustained-1m`, entry version `RISING_VOLUME_1M_SUSTAINED_MARKET_3USDT_5X_TP10_SL30_V1_20261008`, snapshot `AT_DETECTION` và `isRisingVolumeEntrySignal` hợp lệ; không lấy DCA hoặc SHORT.
- Replay dùng cả entry còn OPEN và entry có vị thế trộn/DCA: mỗi entry giả định là một vị thế độc lập, không mô phỏng DCA hoặc dùng PnL phân bổ của cả vị thế. Chỉ phần **actual CLOSED** bên dưới loại toàn bộ mixed closegroup để giảm nhiễu exit.
- Chỉ189 entry đã qua guard và khớp thật, không phải toàn bộ tín hiệu thị trường. Max-slot, vị thế sẵn có, margin/risk và thiếu cache trước warm-up khiến mẫu được chọn lệch; lịch sử detector cap3000 không đủ để tái dựng mọi tín hiệu bị bỏ. Tổng paper net không phải lợi nhuận của portfolio nếu triển khai gate: slot được giải phóng sẽ tạo tập lệnh khác.
- Ngưỡng50/60% và1.5% được chọn sau khi đã nhìn thống kê actual mẫu này ở lượt trước. Đây là backtest thăm dò, **không phải out-of-sample**. Chia theo ngày chỉ kiểm tra độ ổn định, không biến ngày11 thành holdout mù. Nhiều coin/signal cùng thời điểm có tương quan.

## Dữ liệu dùng trước entry và các candidate

- Giữ nguyên detector closed1m + SUSTAINED V2. Không sửa định nghĩa volume liền mạch.
- Taker-buy là tổng quote volume mua chủ động / tổng quote volume của **5 nến đóng gần nhất**, lấy từ snapshot gốc; không dùng volume sau entry và không dùng buy/sell của order book.
- EMA99 tính từ500 nến1m đóng liên tục, kết thúc không muộn hơn `signal.closedAt`; SMA seed99 rồi alpha `2/(99+1)`. Khoảng cách = `(close tín hiệu / EMA99 -1)*100`, không dùng giá hiện tại hoặc EMA sau fill. 159 bộ indicator đầy đủ được tái sử dụng từ nghiên cứu causal trước, 30 entry còn lại được dựng thêm bằng public klines; không thiếu dữ liệu indicator.
- RSI14 Wilder/RMA được lưu để đối chiếu, **không dùng làm gate**. Không dùng EMA alignment, RSI thấp hoặc BTC thuận chiều làm điều kiện trong thử nghiệm này.
- Candidate chính: buy>=50%, đồng thời giá đóng nằm trên/bằng EMA99 nhưng không cao hơn1.5%. Lower-bound0% là một điều kiện riêng, không đồng nghĩa đơn thuần “đừng đu xa”; kiểm tra bỏ lower-bound được ghi ở mục độ nhạy.
- Bộ so sánh cố định: rule gốc, buy50, buy60, EMA0–1.5, buy50+EMA0–1.5, buy60+EMA0–1.5. Không quét hàng trăm ngưỡng để chọn tổ hợp thắng nhất.

## Cách replay TP/SL và thống kê

- Neo entry tại `avgFillPrice` đã khớp thật. Mỗi entry giả định3USDT margin ×5, notional15USDT, dù rounding quantity có thể khiến notional thật khác15.
- TP +10% ROE tương ứng entry×1.02, kích hoạt bằng **CONTRACT_PRICE**. SL −30% ROE tương ứng entry×0.94, kích hoạt bằng **MARK_PRICE**. Đây là cặp mặc định của `preserveSignalProtection` trong code, không dùng MARK cho cả hai.
- Dùng contract klines1m và mark-price klines1m riêng; kiểm tra số nến, timestamp, liên tục và OHLC hợp lệ. Xét60 hoặc360 nến đầy đủ **sau phút fill**.
- OHLC không biết đường đi trước/sau tick fill. BATUSDT19:03 ngày10/10 và APRUSDT19:01 ngày10/10 có thể đã chạm barrier trong phút fill: giữ record nhưng loại khỏi bảng chính, không đoán thắng/thua. Không có nến đầy đủ đồng thời chạm cả hai barrier trong tập chính; nếu có phải ghi ambiguous, không tự chọn TP.
- Tất cả entry không có đủ horizon bị loại khỏi bảng horizon đó, kể cả đã chạm TP sớm. 6h:179 entry đủ tuổi, loại2 phút fill ambiguous →177. 1h:188 đủ tuổi, loại2 →186. UNI11:56 chưa có phút fill đóng ở mốc chốt nên giữ trạng thái `ENTRY_MINUTE_NOT_CLOSED`, không xem là lỗi nguồn hoặc lệnh thua.
- Chạm TP trước thì exit tại TP; chạm SL trước thì contract exit dùng SL×(contract-close/mark-close của phút trigger) làm proxy basis. **Không có tick fill thật**, có thể trượt giá khác giả định. Dùng exit đúng trigger SL làm độ nhạy: AvgROE base +1.737% thay vì+1.722%; candidate chính không đổi vì SL còn lại có basis0.
- Không chạm cả hai thì giả định đóng ở contract close cuối1h/6h (`TIMEOUT`). **Đây chỉ là horizon nghiên cứu, không thêm timeout vào bot.** Lệnh TIMEOUT không được gọi là TP; net-positive không đồng nghĩa chạm TP.
- Commission giả định0.05% taker mỗi chiều trên notional thực của chiều đó; mô hình chính chưa tính funding, ban đầu slippage0. NetROE =500×[exit/entry−1−fee_entry−fee_exit×exit/entry]; paper net=3×NetROE/100. Phí tài khoản thật có thể khác.
- Actual CLOSED: cộng net/margin trong closeGroupId, net có phí/funding audit, sau đó lấy mean ROE của group; không dùng tên closeReason TP để gán win.
- 189/189 replay record, không HTTP/rate-limit/data-gap còn tồn tại;7 assertion kiểm tra TP/SL đúng nguồn, fee, censoring, double-barrier và phút fill. Khi thiếu nến ở mốc chốt không cố lấy nến tương lai.

## Replay 6 giờ — chỉ177 mẫu đủ dữ liệu, không phải PnL đã thực hiện

| Bộ lọc | N | TP / SL / TIMEOUT | Net-positive | AvgROE net | Paper net |
|---|---:|---:|---:|---:|---:|
| Rule gốc |177|94 / 7 / 76|62.7%|+1.72%|+9.15 USDT|
| Buy>=50% |153|83 / 6 / 64|62.7%|+1.86%|+8.56 USDT|
| Buy>=60% |86|41 / 2 / 43|57.0%|+1.43%|+3.69 USDT|
| EMA99 distance0–<1.5% |108|49 / 2 / 57|59.3%|+1.90%|+6.17 USDT|
| Buy>=50% + EMA0–<1.5% |92|44 / 1 / 47|59.8%|+2.31%|+6.38 USDT|
| Buy>=60% + EMA0–<1.5% |62|28 / 1 / 33|56.5%|+1.93%|+3.59 USDT|

Base177 gồm129 coin khác nhau, candidate92 gồm85 coin. PF net6h: base1.475, candidate1.880. Bỏ ba winner lớn nhất: paper net còn+8.29 / +5.53 USDT; kiểm tra độ nhạy này không thay mẫu chính. Có76 /47 TIMEOUT, nên không lấy94/(94+7) hay44/(44+1) làm “winrate chiến lược” rồi bỏ các lệnh chưa chạm barrier.

## Độ ổn định theo ngày entry

| Ngày VN | Rule gốc N / AvgROE6h | Buy50+EMA N / AvgROE6h |
|---|---:|---:|
|08/10|3 / −22.83%|1 / −30.49%|
|09/10|75 / +3.29%|36 / +2.70%|
|10/10|83 / +2.14%|46 / +4.27%|
|11/10|16 / −3.23%|9 / −5.62%|

Chỉ sau warm-up1m độc lập18:44:38 VN10/10: base26mẫu đủ6h AvgROE−2.91%, candidate13mẫu−3.67%. Đây là nhóm nhỏ/khác bối cảnh thị trường; không quy warm-up gây lỗ. Nó cho thấy cải thiện tổng mẫu không ổn định trên phần gần nhất.

Replay1h: base186mẫu AvgROE−0.065%, candidate101mẫu−0.328%; TP/SL/TIMEOUT tương ứng41/2/143 và11/0/90. Vì vậy chưa chứng minh candidate giúp vào xong chạy tốt ngay.

## Actual CLOSED để đối chiếu, không thay thế replay

159 closegroup LONG không mixed/DCA, đã CLOSED trước mốc chốt:

| Bộ lọc | Closed | Net-positive | AvgROE net thật | Net PnL thật |
|---|---:|---:|---:|---:|
| Gốc |159|56.6%|+2.365%|+11.282 USDT|
| Buy>=50% |138|58.7%|+2.740%|+11.342 USDT|
| Buy>=60% |76|57.9%|+2.742%|+6.251 USDT|
| Buy>=50% + EMA0–<1.5% |82|58.5%|+2.672%|+6.573 USDT|
| Buy>=60% + EMA0–<1.5% |55|56.4%|+2.767%|+4.566 USDT|

Trong actual mẫu sạch,69 loss gồm50 case gross không âm nhưng net âm sau chi phí,19 gross âm. Exit có TP/bot/manual/generic và nhiều lệnh đóng sớm; không gọi bảng actual này là backtest giữ fixedTP10/SL30. OPEN không tính actual CLOSED, nhưng đã được đưa vào replay nếu có đủ horizon.

## Case bị lọc và trade-off

- **BR** 19:08 VN09/10: buy52.26%, cách EMA99+5.00%; candidate chặn anti-chase. Replay chạm SL sau27 phút, net proxy−30.32%ROE; actual net−30.69%.
- **HUMA** 19:17 VN10/10: buy45.08%, EMA+1.46%; bị chặn bởi buy50. Replay SL sau301 phút, net proxy−30.93%; actual−30.97%.
- **GUN** 18:54 VN08/10: buy62.57%, EMA+0.31%, vẫn pass nhưng replay chạm SL sau209 phút. Filter không bảo đảm tránh lỗ; actual GUN mixed/DCA không dùng trong bảng sạch.
- **QUSDT** 04:01 VN11/10: buy63.70%, EMA+1.58%, bị chặn chỉ vì hơn1.5% dù replay TP. **ZKUSDT**22:55 VN10/10, EMA+4.02%, cũng bị chặn nhưng TP. Cả nhóm bị chặn còn50TP/6SL/29TIMEOUT và paper net+2.77USDT.

## Độ nhạy và quyết định trước khi triển khai

- Thêm slippage bất lợi ở exit0.02% /0.05% giá: baseAvgROE6h +1.622%/+1.471%; candidate +2.212%/+2.061%. Chưa stress funding, thanh khoản gap hoặc latency1m/tick; các mức này là giả định, không phải phí/slippage thật.
- Biến thể chỉ giới hạn EMA<1.5% nhưng **không yêu cầu giá trên EMA**: buy50,104mẫu,50TP/2SL/52TIMEOUT,AvgROE+1.929%, paper net+6.02; ngày11 là−6.50%. Đây là sensitivity bổ sung, không phải rule được chọn tối ưu.
- Chưa thêm RSI gate: RSI/EMA alignment không tách thắng-thua ổn định trong nghiên cứu trước; không dùng RSI>70 tự động loại LONG.
- **Chưa thêm gate thật**. Có thể khóa candidate buy50+EMA0–1.5 làm shadow research cho mẫu tương lai rồi đánh giá riêng; việc shadow logging/whitelist/implementation vẫn cần lượt yêu cầu riêng. Không tăng size hoặc chọn nhánh ngày10 đạt4.27% paper làm quyền Binance.

## Ảnh hưởng runtime và tương thích

Không chỉnh source executor/detector, controls, label/tier/card/UI, stats runtime, snapshot, Discord/Push, Binance entry/size/SL/TP hoặc protection/lệnh cũ; không signed API và không restart. Margin3×5/TP10/SL30 hiện hữu giữ nguyên; không tự bật SHORT.

JSON runtime cũ không migration, rewrite, relabel hoặc backfill gate. Chỉ thêm artifact nghiên cứu độc lập `data/research/rising-volume-long-filter-replay-20261011.json`, không được runtime đọc làm quyền giao dịch. Không thêm nhãn/card/matcher WHITELIST, policy defaultOFF và chỉ realCLOSED AvgROE>4% giữ nguyên; paper AvgROE không cấp quyền.

Artifact có189case với indicator causal và trạng thái cả hai horizon. SHA256 artifact:
`2462d0a520fbc9396d49da3440c9c4adca5e124358f378279eeb00139a009a90`.
Input frozen/script scratch ở `/tmp/rising-volume-rule-backtest-JGtS2G/`; script SHA256
`feb64595e53a7a803437ec16913d5ea907573689e9a22611cfefc6fa6ea450ae`.
Không lưu webhook/token/API key.

Nguồn public OHLC và ý nghĩa trường: [Binance Futures Market Data](https://developers.binance.info/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data). Trigger TP/SL xác minh trực tiếp trong `src/risingVolumeBinance.js` và `src/liveCardSignalProtection.js`; Binance cho phép chọn Last/Mark như mô tả tại [TP/SL Futures](https://www.binance.com/en/support/faq/detail/360040016512).

