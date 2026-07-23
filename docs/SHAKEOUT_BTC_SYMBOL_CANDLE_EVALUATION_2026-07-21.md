# Đánh giá Shakeout theo cặp nến BTC và nến symbol — 2026-07-21

## Phạm vi

- Nguồn: `data/shakeout-paper-trades.json`.
- Chỉ dùng cohort live từ `2026-07-20T07:17:25.461Z`; không dùng paper cũ được backfill mẫu nến.
- Khoảng entry thực tế: `2026-07-20T07:22:07.931Z` đến `2026-07-21T15:40:13.420Z`.
- Chỉ lấy lệnh `CLOSED`, loại variant `CHASE`, khử trùng theo `signalId + variant`.
- Tổng cộng 81 biến thể tín hiệu đóng: WR 56,8%, AvgROE +2,24%, ROE15 -0,25%, PnL +19,935.
- `ROE15` chặn mỗi kết quả trong khoảng -15% đến +15%, dùng để hạn chế một lệnh lời rất lớn làm sai kết luận.

## Cặp nến có từ 3 mẫu

| Side | Nến BTC 5m | Nến symbol 5m | N | W/L | WR | AvgROE | ROE15 | PnL | Nhận định hiện tại |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| LONG | BULLISH_CANDLE | BULLISH_CANDLE | 3 | 3/0 | 100,0% | +21,73% | +13,33% | +6,520 | Tốt nhất hiện tại, nhưng mới 3 mẫu |
| LONG | BEARISH_CANDLE | DOJI | 3 | 3/0 | 100,0% | +17,81% | +10,00% | +1,884 | Tốt; DOJI symbol có vẻ hấp thụ nhịp giảm BTC |
| LONG | BEARISH_CANDLE | BULLISH_CANDLE | 3 | 2/1 | 66,7% | -1,67% | -1,67% | +0,850 | WR khá nhưng expectancy ROE âm; chưa gọi GOOD |
| SHORT | BULLISH_CANDLE | BEARISH_CANDLE | 4 | 2/2 | 50,0% | -2,50% | -2,50% | +0,350 | Không có lợi thế rõ ràng |
| LONG | BULLISH_CANDLE | BEARISH_CANDLE | 3 | 1/2 | 33,3% | -2,99% | -5,00% | -0,897 | RISK: nến symbol ngược chiều lệnh LONG |
| SHORT | BULLISH_CANDLE | BULLISH_CANDLE | 3 | 1/2 | 33,3% | -8,33% | -8,33% | -2,500 | RISK rõ: cả BTC và symbol đều bullish nhưng đánh SHORT |
| LONG | BEARISH_MARUBOZU | BULLISH_MARUBOZU | 4 | 1/3 | 25,0% | -8,75% | -8,75% | -2,150 | RISK cao; BTC marubozu giảm đang thắng lực hồi symbol |

## Ảnh hưởng của setup bên trong cặp nến

- `LONG + BULLISH_CANDLE/BULLISH_CANDLE`: 1 CLEAN_RECLAIM và 2 WEAK_RECLAIM, cả ba đều thắng. Đây là cặp sáng nhất nhưng chưa đủ 5 mẫu.
- `LONG + BEARISH_CANDLE/DOJI`: 1 FALSE_RECLAIM và 2 WEAK_RECLAIM, cả ba đều thắng. Có thể xem là tín hiệu hấp thụ/đứng giá, chưa đủ mẫu để đưa vào rule cứng.
- `LONG + BEARISH_MARUBOZU/BULLISH_MARUBOZU`: CLEAN_RECLAIM thắng 1/1, nhưng FALSE_RECLAIM thua 0/2 và WEAK_RECLAIM thua 0/1. Vì vậy không được gộp cặp nến này thành GOOD; setup quyết định kết quả.
- `SHORT + BULLISH_CANDLE/BULLISH_CANDLE`: cả ba đều là WEAK_REJECT và tổng thể âm mạnh. Đây là nhóm RISK nhất quán nhất hiện có.

## Kết luận

1. Chưa có cặp nào đạt 5 mẫu; 40/56 cặp chỉ có 1 mẫu và 9/56 cặp có 2 mẫu. Chưa đủ cơ sở áp rule chặn/vào lệnh cứng chỉ bằng cặp nến.
2. Có thể gắn nhãn theo dõi thử nghiệm:
   - `CANDLE_PAIR_GOOD_WATCH`: LONG với BTC BULLISH_CANDLE + symbol BULLISH_CANDLE.
   - `CANDLE_PAIR_GOOD_WATCH`: LONG với BTC BEARISH_CANDLE + symbol DOJI.
   - `CANDLE_PAIR_RISK`: SHORT với BTC BULLISH_CANDLE + symbol BULLISH_CANDLE.
   - `CANDLE_PAIR_RISK`: LONG với BTC BEARISH_MARUBOZU + symbol BULLISH_MARUBOZU, trừ khi setup là CLEAN_RECLAIM và có thêm mẫu xác nhận.
3. Nên tiếp tục ghi log, không can thiệp logic Shakeout ở thời điểm này. Chỉ nâng GOOD/RISK thành rule khi `N >= 8`, xuất hiện ở ít nhất 3 ngày và ROE15/PnL cùng dấu.

## File dữ liệu chi tiết

`reports/shakeout-btc-symbol-candle-2026-07-21.csv` chứa từng `setup + side + nến BTC 5m + nến symbol 5m`, kèm N, W/L, WR, AvgROE, ROE15, median, PF, PnL, AvgPnL và TP/SL.
