# Phân tích Edge Short — 2026-07-20

Phạm vi yêu cầu: 7 ngày Bangkok từ 2026-07-14 đến hết 2026-07-20. Chỉ lấy paper `SHORT` đã đóng trong `data/edge-paper-trades.json`.

Lệnh chạy lại:

```bash
npm run analyze:edge-short -- --days 7 --to 2026-07-20
```

## 1. Giới hạn dữ liệu

Log chỉ có lệnh Edge Short đã đóng trong 2 ngày Bangkok 2026-07-19 và 2026-07-20. Vì vậy kết quả dưới đây là phân tích trong cửa sổ 7 ngày nhưng chỉ có **2 ngày hoạt động**, chưa đủ để phong nhóm A hoặc kết luận độ bền theo tuần.

## 2. Kết quả tổng

| Closed | WR | AvgROE | ROE cắt ±30 | Median | PF | PnL | TP / SL / timeout | Ngày dương |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 73 | 67.1% | -2.78% | -3.27% | +2.12% | 0.72 | -18.322 | 27 / 24 / 22 | 0/2 |

Theo ngày:

| Ngày Bangkok | Closed | WR | AvgROE | PF | PnL |
|---|---:|---:|---:|---:|---:|
| 2026-07-19 | 17 | 58.8% | -4.01% | 0.68 | -4.114 |
| 2026-07-20 | 56 | 69.6% | -2.41% | 0.74 | -14.208 |

Kết luận: Edge Short tổng thể **chưa tốt**. WR và median dương nhưng PF dưới 1, PnL âm và không có ngày dương.

## 3. Nguyên nhân chính: payoff lệch vì SL 30%

| Outcome | Lệnh | AvgROE | Median | PnL |
|---|---:|---:|---:|---:|
| TP | 27 | +13.88% | +12.89% | +33.239 |
| TIMEOUT | 22 | +6.47% | +1.77% | +12.339 |
| SL | 24 | -30.00% | -30.00% | -63.900 |

Toàn bộ 24 lệnh SL đều chạm đúng hard cap `-30% ROE`. Một SL vì thế xóa khoảng 2 TP trung bình hoặc nhiều lệnh timeout. Đây là lý do WR 67.1% vẫn âm.

Nếu chỉ tính phản thực đơn giản bằng cách cắt các loss `-30%` thành `-15%` và giữ nguyên mọi winner, AvgROE mẫu sẽ chuyển từ khoảng `-2.78%` thành khoảng `+2.15%`. Đây **không phải backtest đường giá** và không chứng minh SL 15% sẽ cho kết quả đó, vì một số lệnh có thể chạm -15% rồi mới hồi. Cần replay candle/price path trước khi đổi runtime.

## 4. Phân loại nguồn và signal type

| Nhóm | Closed | WR | AvgROE | PF | PnL | Nhận định |
|---|---:|---:|---:|---:|---:|---|
| PUMP_SHORT | 54 | 72.2% | +0.34% | 1.04 | +3.797 | Nguồn duy nhất không âm; giữ để kiểm định |
| CAP | 11 | 72.7% | -4.04% | 0.51 | -4.449 | WATCH/test nhỏ |
| PPKS | 3 | 33.3% | -19.42% | 0.03 | -5.827 | BLOCK tạm thời, mẫu nhỏ nhưng tail rất xấu |
| SPIKE_REVERSAL | 5 | 20.0% | -23.69% | 0.01 | -11.844 | BLOCK tạm thời |

Theo loại tín hiệu:

| Type | Closed | WR | AvgROE | PF | PnL |
|---|---:|---:|---:|---:|---:|
| DUMP | 28 | 71.4% | +2.26% | 1.26 | +7.999 |
| EARLY_DUMP | 26 | 73.1% | -1.74% | 0.79 | -4.202 |
| BC_UTAD | 11 | 72.7% | -4.04% | 0.51 | -4.449 |
| POST_PUMP_KILL_SHORT | 3 | 33.3% | -19.42% | 0.03 | -5.827 |
| SPIKE_REVERSAL | 5 | 20.0% | -23.69% | 0.01 | -11.844 |

`DUMP` là nhóm lõi tốt nhất. `EARLY_DUMP` có WR cao và median khá nhưng vẫn bị tail SL làm âm. Không nên gộp tất cả Edge Short thành một whitelist.

## 5. BTC phase và tương quan

Các tổ hợp có bằng chứng tốt nhất:

| Context | Closed | WR | AvgROE | PF | Ngày dương |
|---|---:|---:|---:|---:|---:|
| DUMP + BTC_UP_MID | 11 | 72.7% | +7.82% | 1.96 | 2/2 |
| EARLY_DUMP + BTC_UP_MID | 15 | 86.7% | +3.78% | 1.94 | 2/2 |
| DUMP + THEO_YEU | 6 | 100% | +15.27% | 99.00 | 2/2 |
| DUMP + THEO | 6 | 83.3% | +1.35% | 1.16 | 1/1 |

Các vùng rủi ro:

- Toàn bộ `DOC_LAP`: 42 lệnh, AvgROE `-6.17%`, PF `0.52`, PnL `-23.940`, ngày dương `0/2`.
- `BTC_DOWN_MID`: 22 lệnh, AvgROE `-6.54%`, PF `0.40`.
- `BTC_UP_WEAK`: 10 lệnh, AvgROE `-10.53%`, PF `0.30`.
- `EARLY_DUMP + BTC_DOWN_MID`: 7 lệnh, AvgROE `-8.84%`.
- `DUMP + BTC_UP_WEAK`: 6 lệnh, AvgROE `-10.90%`.

Điểm đáng chú ý là SHORT tốt nhất lại xuất hiện khi BTC `UP_MID`, có thể vì đây là setup đảo chiều sau nhịp tăng. Vì dữ liệu chỉ 2 ngày, nên dùng phase/correlation làm bộ điều chỉnh risk, không coi là điều kiện đủ độc lập.

## 6. Score, volume, move và nến

- Score không đơn điệu: `score < 70` đang tốt nhất (+3.93%, PF 1.79), trong khi `70-79` tệ nhất (-11.65%). Điều này cho thấy score giữa các source/type không cùng ý nghĩa; không dùng score tổng hợp một mình.
- `move < 2%`: 16 lệnh, WR 81.3%, AvgROE +3.68%, PF 1.65. Có tiềm năng làm feature chống chase, nhưng mới dương 1/2 ngày.
- Volume 2–5x gần hòa (AvgROE -0.18%, PF 0.98); volume 5x+ vẫn âm nhẹ. Volume không đủ để xác nhận GOOD một mình.
- `BEARISH_PIN_BAR` có 3/3 lệnh thắng, AvgROE +14.60%, nhưng chỉ một ngày và mẫu quá nhỏ.
- `BEARISH_CANDLE` có 47 lệnh gần hòa; nến đơn lẻ không tạo edge rõ.
- `BULLISH_CANDLE` có 7 lệnh, AvgROE -11.17%; phù hợp làm cờ tăng risk cho lệnh SHORT.

## 7. Khung giờ Bangkok

Giờ aggregate tốt: 04h (+2.86%), 05h (+8.24%), 08h (+11.82%), 11h (+23.31%). Tuy nhiên 05h/08h/11h chỉ xuất hiện trong một ngày, nên chưa đủ làm whitelist.

Giờ xấu rõ nhất:

| Giờ | Closed | AvgROE | PF |
|---|---:|---:|---:|
| 19h | 4 | -22.06% | 0.02 |
| 20h | 12 | -13.67% | 0.18 |
| 21h | 12 | -12.38% | 0.24 |

Đặc biệt `DUMP 20h` có 6 lệnh, AvgROE `-16.77%`; `EARLY_DUMP 21h` có 6 lệnh, AvgROE `-10.53%`. Nên dùng 19–21h làm penalty/block thử nghiệm cho tới khi có thêm ngày.

## 8. Đề xuất rule để kiểm định tiếp

Chưa áp runtime trong lần phân tích này. Candidate hợp lý cho rule hậu kiểm:

- Tier B/WATCH: `PUMP_SHORT/DUMP`, ưu tiên `BTC_UP_MID` và correlation `THEO` hoặc `THEO_YEU`.
- Tier B/WATCH: `EARLY_DUMP + BTC_UP_MID`, nhưng vẫn cần hard risk nhỏ hơn vì aggregate EARLY_DUMP đang âm.
- BLOCK/test-off: `SPIKE_REVERSAL`, `POST_PUMP_KILL_SHORT`; CAP/BC_UTAD chỉ test nhỏ.
- Penalty mạnh: `DOC_LAP`, `BTC_UP_WEAK`, `BTC_DOWN_MID`, giờ Bangkok 19–21h và nến bullish đối với SHORT.
- Không nâng tier chỉ vì score cao, volume cao hoặc một mẫu nến đơn lẻ.
- Replay đường giá với SL 15% trước khi thay hard cap 30%; tách log bằng `edgeShortEvalVersion` để không trộn trước/sau hiệu chỉnh.

## 9. Kết luận

Edge Short hiện tại không khả quan ở cấp chiến lược tổng. Phần có edge thật sự đang tập trung ở `PUMP_SHORT/DUMP`, nhất là trong `BTC_UP_MID` với coin còn tương quan BTC. Phần lớn mức âm đến từ 24 SL cố định -30%, cùng các nguồn Spike Reversal/PPKS và nhóm độc lập BTC (`DOC_LAP`). Cần sửa rule theo từng source/type và kiểm soát tail; tăng WR thêm không phải ưu tiên chính.
