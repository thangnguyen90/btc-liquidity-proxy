# Phân tích Pump native — 2026-07-20

Phạm vi: 7 ngày Bangkok từ 2026-07-14 đến hết 2026-07-20. Chỉ lấy paper có `source` dạng `pump-*`; loại toàn bộ `emasq-*` và clone EMA để không trộn hai chiến lược.

Lệnh chạy lại:

```bash
npm run analyze:pump -- --days 7 --to 2026-07-20
```

## 1. Kết quả tổng

| Nhóm | Closed | WR | AvgROE | ROE cắt ±30 | Median | PF | PnL | Ngày dương |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Tất cả | 5,472 | 44.3% | -2.19% | -1.39% | -2.40% | 0.64 | -753.551 | 0/7 |
| LONG | 3,660 | 44.2% | -2.18% | -1.37% | -3.04% | 0.65 | -557.646 | 1/7 |
| SHORT | 1,812 | 44.6% | -2.20% | -1.44% | -2.12% | 0.62 | -195.905 | 0/7 |

Kết luận: hiện chưa có cơ sở xếp toàn bộ Pump hoặc riêng một side vào nhóm A. Cả LONG và SHORT đều âm, và tổng thể không có ngày dương nào.

## 2. Vấn đề lớn nhất: SL cấu trúc không có hard cap ROE

Trong `createPumpPaperTrade`, hard SL theo ROE chỉ được tính bởi `emaSqueezePaperStopLossFromRoe`. Hàm này trả về `null` khi source không bắt đầu bằng `emasq-`. Vì vậy Pump native tiếp tục dùng `payload.sl` do detector gửi lên.

Hệ quả quan sát trong log:

- BLUAIUSDT SHORT/DUMP đóng `-265.2% ROE`.
- BANKUSDT SHORT/DUMP đóng `-184.8% ROE`.
- USUSDT SHORT/DUMP đóng `-163.9% ROE`.
- AKEUSDT LONG/EMA_PULLBACK đóng `-156.6% ROE`.
- Các giá đóng khớp đúng SL đã lưu, nên đây không phải chỉ là socket nhảy quá SL; chính SL lưu ban đầu ở quá xa entry.

Theo outcome, 3,964 lệnh SL có AvgROE `-6.50%`, PF `0.23`, PnL `-1,512.869`. TP và TIMEOUT đang bù lại một phần nhưng không đủ. Do đó phải sửa quản trị rủi ro trước khi dùng PnL thô để phong A/B.

## 3. Signal type

| Type | Closed | AvgROE | ROE cắt ±30 | PF | Nhận định |
|---|---:|---:|---:|---:|---|
| EARLY_DUMP | 573 | -0.58% | gần nhất 0 | 0.76 | Ít xấu nhất nhưng chưa đủ GOOD |
| PUMP_BREAKOUT | 405 | -0.78% | âm | 0.75 | Có vài combo dùng được |
| EARLY_PUMP | 174 | -1.08% | âm | 0.71 | WATCH, chưa phong tốt |
| EMA_PULLBACK | 2,537 | -2.00% | âm | 0.67 | Chỉ giữ combo con tốt |
| MA60_VOLUME_CLUSTER | 238 | -2.60% | +0.12% | 0.72 | Median +1.09%, nhưng tail -118.8% phá kết quả |
| DUMP | 1,113 | -2.87% | -1.63% | 0.62 | Median +1.00%, nhưng tail -265.2% |
| CLIMAX_TOP | 120 | -4.21% | âm | 0.09 | Block rõ ràng |
| MA60_VOLUME_CLUSTER_5M | 303 | -5.94% | -1.93% | 0.51 | Tail -147.9%, mặc định block/test nhỏ |

Score cao chỉ giúp “ít xấu hơn”: score 90+ vẫn AvgROE `-1.86%`, PF `0.67`. Không được dùng score một mình để xác nhận GOOD.

## 4. Combo LONG đáng giữ để kiểm định

Các nhóm dưới đây là ứng viên B/WATCH, chưa phải rule A vì dữ liệu ngày dương và tail chưa đủ an toàn:

- `EMA_PULLBACK 15m | score 80-89 | volume 2-5x | chase OK`: 173 lệnh, AvgROE +1.75%, PF 1.36, dương 6/7 ngày. Đây là mẫu rộng và ổn định nhất.
- `EMA_PULLBACK 15m | score 90+ | volume 5x+ | chase OK`: 33 lệnh, AvgROE +2.74%, PF 1.49, dương 6/7 ngày.
- `PUMP_BREAKOUT 15m | score 90+ | volume 2-5x | chase OK`: 25 lệnh, AvgROE +1.79%, PF 1.73.
- `PUMP_BREAKOUT 15m | score 80-89 | volume 2-5x | chase OK`: 22 lệnh, AvgROE +0.93%, PF 1.39.

Context có lợi nổi bật gồm EMA_PULLBACK/PUMP_BREAKOUT khi BTC `UP_WEAK` hoặc `UP_MID` và tương quan phù hợp. Tuy nhiên nhiều context chỉ có 10–40 mẫu, nên dùng để cộng/trừ risk thay vì phong GOOD độc lập.

Các context LONG cần tránh:

- MA60 Volume Cluster 5m, score 80-89, `BTC_UP_WEAK + DOC_LAP`: AvgROE -22.08%.
- MA60 Volume Cluster 15m, score 75-79, `BTC_DOWN_MID + DOC_LAP`: -16.76%.
- EMA_PULLBACK khi BTC `DOWN_STRONG`, đặc biệt score thấp/trung bình: khoảng -5% đến -6%.

Chỉ 06h Bangkok dương ở cấp hour cho LONG: 81 lệnh, AvgROE +0.85%, PF 1.22, nhưng tail -84.3% và chỉ 3/5 ngày dương. Không đủ để dùng giờ này một mình làm A.

## 5. Combo SHORT đáng giữ để kiểm định

- `DUMP 15m | score 90+ | volume 2-5x | chase OK`: 17 lệnh, AvgROE +0.60%, PF 1.11, dương 5/7 ngày.
- `EARLY_DUMP 15m | score 75-79 | volume 2-5x | chase OK`: 19 lệnh, AvgROE +0.33%, PF 1.14, dương 5/7 ngày.
- Context `DUMP 15m | score 80-89 | BTC_UP_STRONG + DOC_LAP`: 13 lệnh, AvgROE +5.56%, PF 2.46; mẫu còn nhỏ.
- Context `DUMP 15m | score 75-79 | BTC_DOWN_STRONG + DOC_LAP`: 22 lệnh, AvgROE +3.09%, PF 1.70; mới xuất hiện 2 ngày.

Giờ SHORT có aggregate dương: 21h (+1.50%, PF 1.35), 13h (+0.75%), 18h (+0.52%), 14h (+0.49%). Tuy nhiên 21h vẫn có tail -129%, nên giờ chỉ là feature xác nhận, không phải điều kiện đủ.

Các nhóm SHORT cần tránh:

- Toàn bộ `CLIMAX_TOP`.
- DUMP score 80-89 với `BTC_UP_WEAK + THEO_YEU`: AvgROE -10.61%, median -6.37%.
- DUMP score 80-89 với `BTC_DOWN_STRONG + THEO_YEU`: AvgROE -8.14%, median -11.58%.
- DUMP score 90+ với `BTC_DOWN_MID + DOC_LAP` có median dương nhưng tail -265.2%; không được gọi GOOD trước khi có hard SL.

## 6. Rule runtime đã áp dụng

Version: `PUMP_EVAL_V1_2026_07_20`.

- Chỉ áp cho Pump native có source dạng `pump-<score>`; không tác động `emasq-*`, `pump-short-*` hoặc paper lịch sử.
- Chưa có tier A. Bốn nhóm có bằng chứng tốt được vào tier B/$1; tín hiệu còn lại BLOCK.
- LONG B: EMA_PULLBACK 15m score 80-89, volume 2-5x, chase < 0.3.
- LONG B: EMA_PULLBACK 15m score 90+, volume 5x+, chase < 0.3.
- LONG B: PUMP_BREAKOUT 15m score 80+, volume 2-5x, chase < 0.3.
- SHORT B: DUMP 15m score 90+, volume 2-5x, chase < 0.3.
- SHORT B: EARLY_DUMP 15m score 75-79, volume 2-5x, chase < 0.3.
- Hard BLOCK `CLIMAX_TOP`, MA60 Volume Cluster, timeframe khác 15m, market far, thiếu dữ liệu score/volume/chase và chase >= 0.3.
- Hard BLOCK EMA_PULLBACK LONG khi BTC DOWN_STRONG và hai context DUMP SHORT xấu đã nêu ở trên.
- Giờ SHORT 13h/14h/18h/21h được ghi thành feature xác nhận, nhưng không nâng lên A.
- SL Pump native được cap tối đa 15% ROE. Nếu structure SL của detector chặt hơn thì giữ mức chặt hơn.
- Paper mới ghi `pumpEvalVersion/tier/label/reason/context`, BTC phase, correlation, giờ, structure SL và hard-SL metadata.
- Rule cũng được đưa vào candidate Pump của Decision Paper; tín hiệu Pump ngoài whitelist không thể ENTER tại đó.

Chỉ nâng A sau khi dữ liệu hậu hiệu chỉnh đạt PF > 1, AvgROE dương, tail nằm trong hard cap và dương trên nhiều ngày.

## 7. Lưu ý phương pháp

- `AvgROE` là số thực tế trong log; `ROE cắt ±30` chỉ dùng để nhận biết một nhóm thua do tail hay do chất lượng tín hiệu cốt lõi.
- Không dùng ROE đã cắt để tính PnL thật hoặc che lỗ.
- Các mẫu nhỏ dưới khoảng 30 lệnh chỉ là gợi ý, không phải bằng chứng đủ để tăng size.
- Mọi đánh giá sau này phải lọc theo `pumpEvalVersion` để không trộn lệnh trước và sau hiệu chỉnh.
