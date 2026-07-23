# Phân tích BR-like / BR-like Short — 2026-07-20

Phạm vi: 7 ngày Bangkok, từ `14/07/2026 00:00` đến hết `20/07/2026`.

Nguồn: lệnh `CLOSED` trong `data/pump-paper-trades.json`; phân loại theo `source`/`note`. Kết quả ưu tiên `AvgROE`, profit factor (PF), tail loss và số ngày dương. PnL USD chỉ dùng tham khảo vì lịch sử có nhiều mức margin.

Lệnh chạy lại:

```bash
node --max-old-space-size=2048 scripts/analyze-br-like-performance.js --days 7 --to 2026-07-20
```

## 1. Kết luận nhanh

- Cả hai nhánh chưa đủ tốt để cho vào đại trà chỉ dựa vào tên stage hoặc score.
- `BR-like LONG`: 1.060 lệnh đóng, WR `46,9%`, AvgROE `-1,46%`, PF `0,64`, âm cả `7/7` ngày. Nhánh này nên mặc định `BLOCK/TEST`, không có nhóm A đủ độ ổn định.
- `BR-like Short`: 969 lệnh đóng, WR `49,1%`, AvgROE `-0,98%`, PF `0,73`, chỉ dương `1/7` ngày. Khung `15m` gần hòa vốn và ổn định hơn rõ rệt so với `5m`.
- Nhãn nến cũ không thể dùng làm điều kiện GOOD độc lập. `REAL_OK_CANDLE` vẫn âm ở cả LONG và SHORT.
- Giờ Bangkok và combo BTC/correlation phải được xét cùng nhau. Không được suy ra một giờ GOOD cho mọi BTC phase.

## 2. BR-like LONG

### Tổng quan

| Nhóm | Closed | WR | AvgROE | PF | PnL | Ngày dương |
|---|---:|---:|---:|---:|---:|---:|
| Toàn bộ | 1.060 | 46,9% | -1,46% | 0,64 | -133,826 | 0/7 |
| 15m | 321 | 47,7% | -1,10% | 0,70 | -30,236 | 1/7 |
| 5m | 739 | 46,5% | -1,62% | 0,62 | -103,591 | 0/7 |

Không BTC phase nào có AvgROE dương khi xét toàn bộ phase. `BTC_UP_WEAK` ít xấu nhất (`-0,71%`); `BTC_DOWN_STRONG` xấu nhất (`-2,39%`).

### Combo có tín hiệu tích cực nhưng chỉ nên WATCH/TEST

| Combo | N | WR | AvgROE | PF | Ngày dương |
|---|---:|---:|---:|---:|---:|
| 5m · BTC_DOWN_MID · THEO_YEU | 8 | 87,5% | +4,41% | chưa có lệnh âm | 3/3 |
| 15m · BTC_DOWN_WEAK · DOC_LAP | 13 | 69,2% | +1,86% | 1,95 | 2/3 |
| 15m · BTC_DOWN_WEAK · THEO | 20 | 70,0% | +1,54% | 1,76 | 2/4 |
| 15m · BTC_UP_MID · DOC_LAP | 52 | 57,7% | +0,54% | 1,20 | 4/6 |

Những nhóm đầu có mẫu nhỏ hoặc chưa dương đều theo ngày. Vì vậy chưa xếp A/$10; phù hợp nhất là `WATCH` hoặc paper `$1` để xác nhận tiếp.

### Nhóm xấu rõ

- `5m · BTC_UP_MID · THEO`: 21 lệnh, AvgROE `-5,47%`, PF `0,21`, dương `0/2` ngày.
- `15m · BTC_UP_WEAK · THEO`: 13 lệnh, AvgROE `-5,01%`, PF `0,19`, dương `0/4` ngày.
- `15m · BTC_UP_STRONG · THEO`: 8 lệnh, AvgROE `-4,48%`, PF `0,13`.
- `15m · BTC_UP_MID · THEO`: 35 lệnh, AvgROE `-3,34%`, PF `0,42`.
- Các giờ xấu nhất: `03h`, `01h`, `05h`, `09h`, `07h`, `14h`, `10h` Bangkok.

Giờ tốt độc lập chưa đủ tin cậy. Ví dụ `02h` có AvgROE `+1,15%` nhưng chỉ dương 1/3 ngày; không nên biến thành rule A nếu chưa giao với combo BTC.

## 3. BR-like Short

### Tổng quan

| Nhóm | Closed | WR | AvgROE | PF | PnL | Ngày dương |
|---|---:|---:|---:|---:|---:|---:|
| Toàn bộ | 969 | 49,1% | -0,98% | 0,73 | -65,858 | 1/7 |
| 15m | 357 | 51,0% | -0,16% | 0,94 | +1,864 | 5/7 |
| 5m | 612 | 48,0% | -1,45% | 0,64 | -67,722 | 1/7 |

`15m` là nhánh đáng tiếp tục đánh giá. `5m` chỉ nên mở khi khớp đúng combo/giờ; mở đại trà gây phần lớn mức lỗ.

### Combo tốt đáng giữ để xác nhận

| Combo | N | WR | AvgROE | PF | Ngày dương |
|---|---:|---:|---:|---:|---:|
| 5m · BTC_UP_MID · THEO | 18 | 66,7% | +3,11% | 8,00 | 2/2 |
| 15m · BTC_DOWN_STRONG · THEO_YEU | 11 | 72,7% | +2,96% | 2,82 | 2/2 |
| 15m · BTC_DOWN_STRONG · DOC_LAP | 8 | 75,0% | +2,75% | 3,73 | 2/2 |
| 5m · BTC_UP_MID · THEO_YEU | 23 | 60,9% | +1,57% | 1,73 | 4/4 |
| 15m · BTC_UP_MID · DOC_LAP | 72 | 55,6% | +0,35% | 1,13 | 4/6 |

Trong các nhóm này, `5m · BTC_UP_MID · THEO_YEU` có độ ổn định ngày tốt nhất. Các nhóm còn lại vẫn cần thêm ngày vì số phiên quan sát nhỏ.

### Giờ Bangkok

- Tích cực nhất khi xét riêng giờ: `03h`, `21h`, `17h`, `14h`, `08h`.
- `17h`: 53 lệnh, AvgROE `+1,19%`, PF `1,77`, dương 6/7 ngày.
- `14h`: 52 lệnh, AvgROE `+1,18%`, PF `1,54`, dương 5/6 ngày.
- Xấu rõ: `22h`, `19h`, `20h`, `05h`, `06h`, `02h`, `18h`.

Không dùng giờ riêng lẻ làm rule. Ví dụ `18h` tổng thể xấu, nhưng một vài giao điểm BTC nhỏ vẫn dương; ngược lại `14h` tổng thể tốt nhưng `5m · BTC_UP_WEAK · DOC_LAP` tại 14h lại âm mạnh.

### Nhóm cần BLOCK

- `5m · BTC_UP_MID · DOC_LAP`: 194 lệnh, AvgROE `-2,52%`, PF `0,49`, dương `0/6` ngày, PnL `-46,866`.
- `5m · BTC_DOWN_MID · DOC_LAP`: 106 lệnh, AvgROE `-2,07%`, PF `0,54`, dương `0/4` ngày.
- `5m · BTC_DOWN_STRONG · THEO_YEU`: 10 lệnh, AvgROE `-5,65%`, PF `0,30`.
- `15m · BTC_UP_WEAK · THEO`: 9 lệnh, AvgROE `-4,67%`, PF `0,19`.

Hai nhóm `5m + DOC_LAP + BTC_UP/DOWN_MID` là nguồn lỗ lớn nhất và có mẫu đủ lớn để xem là BAD thực tế.

## 4. Đánh giá nhãn nến cũ

| Stage | Nhãn | N | AvgROE | PF | Ngày dương |
|---|---|---:|---:|---:|---:|
| LONG | REAL_OK_CANDLE | 655 | -1,52% | 0,62 | 1/7 |
| LONG | REAL_MID_CANDLE | 68 | +0,68% | 1,27 | 5/7 |
| LONG | REAL_BAD_CANDLE | 330 | -1,69% | 0,61 | 0/7 |
| SHORT | REAL_OK_CANDLE | 625 | -0,55% | 0,84 | 2/7 |
| SHORT | REAL_MID_CANDLE | 70 | -2,89% | 0,46 | 1/7 |
| SHORT | REAL_BAD_CANDLE | 260 | -1,53% | 0,61 | 0/7 |

Kết luận: `REAL_OK_CANDLE` chỉ có thể là feature phụ, không được nâng lệnh lên GOOD. Với LONG, nhãn `REAL_MID_CANDLE` lại tốt hơn `REAL_OK`, cho thấy định nghĩa OLD GOOD đang lệch với kết quả thật.

## 5. Rule runtime đã áp

- Version: `BR_LIKE_EVAL_V2_2026_07_20`.
- Chỉ áp cho BR-like market; `/br-like-limit` vẫn là bài test limit độc lập.
- BR-like LONG không có A. Chỉ bốn combo WATCH dương được vào tier B `$1`; phần còn lại BLOCK.
- BR-like Short 5m chỉ vào tier B `$1` khi đồng thời thuộc `BTC_UP_MID + THEO/THEO_YEU` và giờ Bangkok thuộc `03, 08, 14, 17, 21`.
- BR-like Short 15m thuộc combo tốt và giờ tốt vào tier A `$10`; chỉ khớp combo hoặc chỉ khớp giờ vào tier B `$1`; ngoài ra BLOCK.
- Hard BLOCK: `5m + DOC_LAP + BTC_UP_MID/DOWN_MID`, `5m + THEO_YEU + BTC_DOWN_STRONG`, `15m + THEO + BTC_UP_WEAK`.
- Không dùng score 90+ hay `REAL_OK_CANDLE` để tự nâng tier.
- Paper mới lưu riêng `brEvalTier`, `brEvalLabel`, `brEvalReason`, `brEvalVersion`, `brEvalMarginUsdt`, `brEvalHour`, correlation bucket và BTC phase.
- Không hồi tố thay đổi size/kết quả của lệnh đã đóng.

Rule không thay đổi exit/TP/SL của lệnh cũ đang mở và không hồi tố lịch sử.
