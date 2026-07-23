# Thống kê Shakeout + mẫu nến tại entry — 2026-07-21

## Phạm vi và cách tính

- Nguồn: `data/shakeout-paper-trades.json`.
- Chỉ lấy lệnh `CLOSED` có `candlePatternAtEntry` được tạo sau khi pipeline mẫu nến chạy live.
- Mốc live được nhận diện từ lần backfill đầu tiên: `2026-07-20T07:17:25.461Z` (14:17:25 Bangkok). Các paper có entry trước mốc này bị loại, dù sau đó được backfill mẫu nến.
- `MARKET` và `PENDING` được giữ riêng; bản ghi trùng đúng signal và variant chỉ tính một lần.
- Variant `CHASE` bị loại khỏi thống kê mặc định. Chỉ thêm lại khi chủ động chạy với `--include-chase`.
- Báo cáo chỉ trình bày số liệu: N, WR, AvgROE, ROE15, median, PF, tổng PnL, AvgPnL mỗi lệnh và số ngày dương.
- Các bảng candle context ghép `setup + side + nến coin 5m + nến coin 15m + nến BTC 5m + BTC phase + tương quan + variant`.
- Ngày/giờ trong báo cáo dùng Asia/Bangkok (UTC+7).

## Lưu ý phạm vi

Phiên bản báo cáo ban đầu đã vô tình tính 396 dòng vì hệ thống backfill `candlePatternAtEntry` vào paper cũ từ 15/07. Đây không phải 396 quan sát live và không được dùng để kết luận rule.

Báo cáo hiện tại chỉ dùng cohort phát sinh sau mốc bật tính năng.

Không sử dụng bảng 396 lệnh cũ để áp rule. Hãy chạy script để lấy số liệu live mới nhất theo cách khớp:

`npm run analyze:shakeout-candle`

## Không đánh giá hoặc áp rule

Không gắn GOOD/RISK/BAD, không xếp combo và không thay đổi logic Shakeout từ báo cáo này.

## Chạy lại thống kê

```bash
npm run analyze:shakeout-candle
npm run analyze:shakeout-candle -- --days 7 --to 2026-07-21
npm run analyze:shakeout-candle -- --min-sample 5
npm run analyze:shakeout-candle -- --include-backfill
npm run analyze:shakeout-candle -- --include-chase
```

`--include-backfill` chỉ dùng để nghiên cứu lịch sử và tuyệt đối không dùng để chốt rule live.
