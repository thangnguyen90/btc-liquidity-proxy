# Phân tích Liquid — 2026-07-20

Phạm vi: 7 ngày Bangkok từ 2026-07-14 đến hết 2026-07-20. Chỉ lấy paper đã đóng trong `data/liquid-paper-trades.json`.

Lệnh chạy lại:

```bash
npm run analyze:liquid -- --days 7 --to 2026-07-20
```

## 1. Độ phủ dữ liệu

- Store có 1.207 paper, 1.202 lệnh đã đóng.
- Trong cửa sổ yêu cầu có 373 lệnh đóng trên 5 ngày hoạt động, từ 2026-07-14 đến 2026-07-18.
- Toàn bộ 373 lệnh trong cửa sổ đều thuộc thế hệ `LIQUID_KILL_ZONE`; không trộn với `LIQUID_SCAN` cũ.
- Không có tín hiệu trong 2026-07-19 và 2026-07-20, vì vậy đây chưa phải 7 ngày hoạt động đầy đủ.

## 2. Kết quả tổng

| Closed | WR | AvgROE thực | ROE cắt ±20 | Median | PF | PnL | TP / SL | Ngày dương |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 373 | 58.4% | +0.35% | -0.30% | +10.00% | 1.04 | +13.098 | 218 / 155 | 4/5 |

Liquid đang dương nhẹ nhưng biên an toàn thấp. Khi cắt cả winner và loser về ±20%, AvgROE chuyển thành -0.30%, cho thấy lợi nhuận phụ thuộc một phần vào các TP lớn hơn 20%.

Theo outcome:

| Outcome | Lệnh | AvgROE | Median | PnL |
|---|---:|---:|---:|---:|
| TP | 218 | +14.82% | +12.50% | +323.098 |
| SL | 155 | -20.00% | -20.00% | -310.000 |

Hard SL 20% đang hoạt động đúng. Với TP trung bình 14.82%, hệ thống cần WR khoảng 57.4% để hòa vốn trước phí; WR thực 58.4% chỉ cao hơn ngưỡng này khoảng một điểm phần trăm.

## 3. LONG và SHORT

| Side | Closed | WR | AvgROE | ROE ±20 | PF | PnL | Ngày dương |
|---|---:|---:|---:|---:|---:|---:|---:|
| SHORT | 211 | 59.7% | +1.63% | +0.75% | 1.20 | +34.438 | 4/5 |
| LONG | 162 | 56.8% | -1.32% | -1.65% | 0.85 | -21.341 | 2/5 |

Kết luận rõ nhất là giữ SHORT để kiểm định tiếp, còn LONG hiện chưa đạt tiêu chuẩn GOOD.

## 4. Score

| Nhóm score | Closed | WR | AvgROE | PF | Ngày dương |
|---|---:|---:|---:|---:|---:|
| 90+ | 26 | 73.1% | +6.06% | 2.12 | 5/5 |
| 88–89 | 68 | 64.7% | +2.81% | 1.40 | 5/5 |
| 80–84 | 176 | 58.0% | -0.19% | 0.98 | 1/5 |
| 85–87 | 103 | 51.5% | -1.78% | 0.82 | 0/5 |

Tách side:

- SHORT score 90+: 10 lệnh, AvgROE +10.75%, PF 3.69, dương 5/5 ngày; mẫu nhỏ nhưng ổn định nhất.
- SHORT score 88–89: 32 lệnh, AvgROE +3.11%, PF 1.41.
- SHORT score 80–84: 104 lệnh, AvgROE +1.85%, PF 1.24 nhưng chỉ dương 2/5 ngày.
- LONG score 88–89: 36 lệnh, AvgROE +2.54%, PF 1.38; là nhóm LONG đáng theo dõi nhất.
- LONG score 80–87 đều âm khoảng -3.1% đến -3.4%.

Score 85–87 kém hơn cả 80–84, nên score chưa hoàn toàn đơn điệu. Không nội suy rằng score tăng một điểm luôn tốt hơn.

## 5. BTC phase và correlation

Theo correlation:

| Nhóm | Closed | AvgROE | PF | Ngày dương |
|---|---:|---:|---:|---:|
| THEO | 108 | +2.15% | 1.34 | 5/5 |
| THEO_YEU | 70 | +1.41% | 1.18 | 3/5 |
| DOC_LAP | 195 | -1.03% | 0.89 | 2/5 |

Tách side:

- SHORT + THEO: 59 lệnh, AvgROE +3.59%, PF 1.59.
- SHORT + THEO_YEU: 40 lệnh, AvgROE +3.66%, PF 1.52.
- SHORT + DOC_LAP: gần hòa, AvgROE -0.13%, PF 0.99.
- LONG + THEO: chỉ +0.42%, PF 1.06.
- LONG + THEO_YEU hoặc DOC_LAP đều âm.

Theo trend:

- SHORT + BTC_DOWN_MID: 127 lệnh, AvgROE +2.98%, PF 1.41.
- SHORT + BTC_UP_MID: 47 lệnh, AvgROE +1.36%, PF 1.16.
- LONG + BTC_DOWN_MID: 49 lệnh, AvgROE -5.37%, PF 0.55; đây là vùng cần tránh rõ nhất.
- LONG + BTC_UP_MID vẫn âm nhẹ -0.51%; trend cùng chiều chưa đủ cứu LONG nếu thiếu correlation phù hợp.

## 6. Các feature cấu trúc Liquid

### Khoảng cách sweep

- Sweep 1–2%: 232 lệnh, AvgROE +1.18%, PF 1.16.
- Sweep dưới 1%: 57 lệnh, AvgROE +0.99%, PF 1.18.
- Sweep 2–5%: 83 lệnh, AvgROE -2.16%, PF 0.83.

Khoảng cách sweep từ 2% trở lên là cờ risk hợp lý; 1–2% là vùng có mẫu rộng nhất.

### Planned reward, risk, RR và feasibility

- Planned reward dưới 2% tốt nhất: 221 lệnh, AvgROE +1.54%, PF 1.24.
- RR dưới 0.5 lại tốt, còn RR từ 1 trở lên âm.
- Feasibility dưới 50 tốt hơn rõ so với feasibility 50–69.

Đây là quan hệ ngược kỳ vọng. Nguyên nhân hợp lý là `rewardPct`, `riskPct`, `rr` và `feasibilityScore` được lưu từ `entryPlan`, nhưng lúc tạo paper, `stopLossPrice` được thay bằng hard SL `20% ROE`. Do đó các field kế hoạch không còn mô tả đúng risk/reward thực tế của lệnh.

Không nên áp rule từ RR hoặc feasibility hiện tại. Trước tiên cần tính và lưu lại `effectiveRewardPct`, `effectiveRiskPct`, `effectiveRR` dựa trên market entry, TP thật và hard SL thật.

### One-sided và heavy-side

Toàn bộ 373 lệnh đều có one-sided >= 90% và heavy-side khớp hướng lệnh. Hai field này là điều kiện đầu vào bắt buộc, không còn độ biến thiên nên không thể dùng để xếp hạng trong mẫu hiện tại.

## 7. Combo đáng giữ và cần tránh

Ứng viên tốt nhất, nhưng vẫn chỉ xếp B/WATCH vì mới có 5 ngày hoạt động:

- SHORT, score 90+ nói chung: 10 lệnh, dương 5/5 ngày.
- SHORT + BTC_DOWN_MID + THEO, score 80–84: 25 lệnh, WR 84.0%, AvgROE +8.64%, PF 3.70, dương 2/2 ngày.
- SHORT + BTC_DOWN_MID + THEO_YEU, score 85–87: 7 lệnh, AvgROE +9.43%; mẫu nhỏ.
- LONG score 88–89 chỉ giữ WATCH, ưu tiên BTC_UP_MID + THEO; chưa đủ rộng để thành rule A.

Các vùng cần penalty/block thử nghiệm:

- LONG + BTC_DOWN_MID, đặc biệt DOC_LAP.
- LONG score 80–87 nếu correlation không phải THEO.
- SHORT hoặc LONG `DOC_LAP` score thấp/trung bình; ngoại lệ nhỏ chưa đủ để phá rule tổng.
- Sweep distance >= 2%.

## 8. Giờ và mẫu nến

- 07h và 20h Bangkok âm ở aggregate; 14h và 22h dương.
- Tuy nhiên đa số bucket giờ chỉ xuất hiện trong 1–3 ngày, nên chưa được dùng làm rule độc lập.
- 340/373 lệnh không có candle data. DOJI và bearish candle đang dương nhưng mẫu lần lượt chỉ 7 và 10; chưa đủ kết luận.

## 9. Kết luận

Liquid hiện có edge nhỏ, tập trung ở SHORT, score cao và coin có tương quan BTC. LONG là phần kéo kết quả xuống. Ưu tiên hiện tại không phải đổi SL 20%, mà là:

1. Tiếp tục gom đủ ít nhất 7 ngày hoạt động.
2. Tách LONG/SHORT khi xếp tier.
3. Ghi lại risk/reward hiệu lực sau khi hard SL được áp.
4. Dùng correlation và sweep distance làm risk filter.
5. Chỉ áp rule runtime sau khi nhóm tốt vẫn dương ở dữ liệu hậu kiểm mới.
