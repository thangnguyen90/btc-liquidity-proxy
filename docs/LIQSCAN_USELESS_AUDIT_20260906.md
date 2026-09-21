# LiqScan USELESS — kiểm tra cảnh báo 08:11:23 ngày 06/09/2026 (UTC+7)

## Kết quả chính

Snapshot gốc: 08:11:23.324, mark 0.26779847, ABOVE, điểm 54, trên 2,714,257,579.37 và dưới 803,560,449.37 (proxy). Vùng gần 0.269137–0.270209; target 0.27128; vùng xa bắt đầu 0.281188. Các mức giữ nguyên từ trước diễn biến được kiểm tra.

| Mốc | Kết quả sau cảnh báo |
|---|---|
| Mép gần 0.269137 | Giao dịch 0.26914 lúc 08:11:56.055, sau 32.731 giây |
| Mép trên vùng gần 0.270209 | Chạm trong phút 08:36; độ chính xác thời điểm 1 phút |
| Target 0.27128 | Không chạm trong cửa sổ 4 giờ |
| Vùng xa từ 0.281188 | Không chạm trong cửa sổ 4 giờ |
| Đỉnh sau phát | 0.27098, khoảng +1.188% so mark lúc báo |
| Đáy trong cửa sổ | 0.24005, khoảng -10.362% |

Trước cú chạm đầu tiên 08:11:56, giá thấp nhất của các giao dịch sau alert là 0.26772, thấp hơn mark khoảng 0.0293%. Trước phút chạm mép trên 08:36, giá đã xuống 0.26509 (khoảng -1.011%). Vì vậy cảnh báo đúng về cú quét gần ngay sau phát; không đồng nghĩa target xa đạt hoặc LONG giữ lâu có lợi.

Benchmark đối xứng: target +1.3% có mức ngược cùng khoảng cách 0.26431694. Giá chạm mức ngược trong phút 08:48 trước khi đạt target; đây là mốc so sánh, không phải SL thật hay vùng thanh khoản dưới được phát hiện. Không gọi kết quả này là PnL lệnh Binance.

## Kiểm tra thêm các snapshot còn lưu

188 snapshot gần nhất được đóng băng; 22 đủ tuổi 4 giờ và có target. Mỗi coin chỉ còn snapshot gần nhất, không phải tập đầy đủ mọi alert. Trên 22 mẫu, dùng target đã lưu và rào ngược đối xứng:

| Thời gian | Target chạm trước | Ngược chạm trước | Chưa chạm cả hai | Có chạm target bất kỳ lúc nào |
|---|---:|---:|---:|---:|
| 15 phút | 5 | 7 | 10 | 5 |
| 30 phút | 6 | 8 | 8 | 6 |
| 60 phút | 6 | 11 | 5 | 8 |
| 4 giờ | 6 | 14 | 2 | 11 |

Trong 4 giờ: ABOVE 13 mẫu: 3 target trước, 9 ngược trước, 1 chưa chạm. BELOW 9 mẫu: 3 target trước, 5 ngược trước, 1 chưa chạm. Mẫu nhỏ và bị selection bias do lưu latest-only; không suy ra tỷ lệ thắng hệ thống hoặc hiệu chỉnh xác suất từ các con số này. Dữ liệu hiện có chưa chứng minh lợi thế cho việc cứ theo tổng liquidity trội để vào lệnh.

## Phương pháp và giới hạn

- Nguồn public Binance Futures `/fapi/v1/klines` 1m và `/fapi/v1/aggTrades`; không gọi API đặt/hủy lệnh.
- Tập 22 mẫu bỏ phút đầu chứa alert và phần nến cuối chưa đủ thời hạn, kiểm tra liên tục 239 nến cho 4h. Đây là cửa sổ quan sát xấp xỉ, có thể bỏ sót hit rất sớm; không dùng để chứng minh first-hit toàn bộ mẫu với độ chính xác từng giây. Riêng USELESS đã kiểm tra đủ 629 aggTrades từ alert đến cuối phút đầu.
- Nến thể hiện giá giao dịch; mốc gốc là mark, hai loại giá có thể lệch. Trong một nến cùng chạm hai rào thì đánh AMBIGUOUS, không đoán thứ tự (tập này không gặp).
- Không dùng heatmap hiện tại để dựng lại tín hiệu cũ, không tối ưu rule theo kết quả. Chưa tính phí/slippage/funding/leverage, chưa backtest executor/entry/SL/TP thật.
- Artifact: `data/audits/liqscan-20260906/frozen-alerts.json`, `outcomes.json`, `useless-candles.json`, `useless-partial-minute.json`. Script `scripts/audit-liqscan-outcomes.mjs` và `scripts/audit-useless-alert-minute.mjs`.

## Đánh giá

Case USELESS xác nhận giá đã quét vùng gần trong khoảng 33 giây; nhận xét của người dùng đúng ở phạm vi đó. Target 1.3% và vùng xa không đạt trong 4 giờ. Nên phân biệt “chạm vùng gần”, “đạt target” và “đi đúng hướng trước khi đi ngược”; không gộp thành một nhãn thắng.

Để kiểm chứng chiến lược cần lưu mọi alert với timestamp/zone gốc và đánh giá đầy đủ cả hai hướng theo cửa sổ cố định, có dữ liệu sau phát từng giây hoặc quy tắc xử lý nến mơ hồ. Lượt này chỉ audit, không thay bot.
