# Pump theo combo, nến BTC và nến altcoin

Ngày phân tích: 2026-07-22 (Asia/Bangkok, UTC+7)

## Phạm vi dữ liệu

- Nguồn: `data/pump-paper-trades.json`.
- Chỉ lấy paper Pump gốc đã đóng, nhận diện bằng `source = pump-<score>`.
- Khoảng ngày yêu cầu: 7 ngày, đến hết 2026-07-22 theo giờ Bangkok.
- Hai pipeline nến chỉ cùng có dữ liệu thật từ `2026-07-21 17:39:43` Bangkok. Vì vậy kết luận chỉ dùng cohort sau thời điểm này, không trộn dữ liệu cũ được backfill hoặc `NO_DATA`.
- Có 67 lệnh đóng trong cohort; 62 lệnh đủ cả nến BTC và nến altcoin.
- 5 lệnh thiếu nến BTC, 1 lệnh thiếu nến altcoin.
- 62 lệnh bị chia thành 44 nhóm setup đơn giản và 53 nhóm combo đầy đủ. Chỉ 3 nhóm có `N >= 3`, chỉ 1 nhóm có `N >= 5`.

Phí dự tính dùng taker fee 0,04% mỗi chiều. `NetROE15` là ROE sau phí và giới hạn mỗi lệnh trong khoảng -15% đến +15% để tránh một vài outlier kéo lệch kết quả.

## Tổng thể

| N | WR | Avg gross ROE | Avg net ROE | NetROE15 | Gross PnL | Phí | Net PnL | PF | TP/SL | Ngày dương |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 62 | 50,0% | +0,96% | +0,16% | -0,30% | +0,687 | -0,569 | +0,119 | 1,04 | 14/39 | 2/2 |

Gross còn dương nhưng phần lớn lợi nhuận bị phí lấy mất. Sau khi chặn outlier ở 15%, kỳ vọng trung bình chuyển thành âm. Hiện chưa có bằng chứng để dùng nến làm điều kiện ENTER cứng cho toàn bộ Pump.

## Các cặp có mẫu lặp

| Pump setup | Nến BTC | Nến altcoin | N | WR | Avg net ROE | NetROE15 | Net PnL | PF | Nhận định tạm thời |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| EMA_PULLBACK LONG 15m | BEARISH_MARUBOZU | BEARISH_CANDLE | 9 | 55,6% | +4,82% | +1,51% | +0,434 | 1,83 | WATCH tốt; chưa đủ ngày để nâng thành GOOD/rule cứng |
| EMA_PULLBACK LONG 15m | BULLISH_CANDLE | BEARISH_CANDLE | 3 | 33,3% | -0,17% | -0,17% | -0,005 | 0,97 | Không có edge sau phí |
| PUMP_BREAKOUT LONG 15m | HAMMER | BULLISH_CANDLE | 3 | 0,0% | -4,22% | -4,22% | -0,126 | 0,00 | RISK thử nghiệm; mẫu quá nhỏ để BLOCK |

Cặp EMA Pullback thắng khi cả BTC và altcoin đang có nến giảm là kết quả có vẻ ngược trực giác. Khả năng hợp lý là tín hiệu Pullback được kích hoạt gần điểm cạn nhịp giảm rồi hồi, nhưng mới chỉ 9 lệnh trong 2 ngày nên cũng có thể là hiệu ứng phiên hoặc cụm coin. Cần kiểm tra thêm giờ vào lệnh, symbol và nhiều ngày độc lập trước khi áp dụng.

## Tiêu chuẩn đánh giá tiếp

- Không kết luận từ nhóm `N < 3` và không dùng `NO_DATA`.
- Chỉ cân nhắc GOOD khi `N >= 10`, xuất hiện ít nhất 3 ngày, Net PnL dương và cả Avg net ROE lẫn NetROE15 cùng dương.
- Chỉ cân nhắc RISK/BLOCK khi đạt cùng ngưỡng mẫu; nhóm `PUMP_BREAKOUT + BTC HAMMER + ALT BULLISH_CANDLE` hiện chỉ nên theo dõi.
- Chạy lại bằng `npm run analyze:pump-candle -- --days 7 --to YYYY-MM-DD --csv reports/<ten-file>.csv`.

Chi tiết tất cả nhóm nằm trong `reports/pump-btc-alt-candle-2026-07-22.csv`.
