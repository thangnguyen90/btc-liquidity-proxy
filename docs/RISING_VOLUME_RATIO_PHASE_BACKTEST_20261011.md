# Backtest Volume1m liền mạch + ratio đi ngang rồi đổi dốc — 11/10/2026

Version nghiên cứu: `RISING_VOLUME_TOP_ACCOUNT_FLAT_BREAK_RESEARCH_V1_20261011_OBSERVE_ONLY`.
Source gate thử nghiệm: `RISING_VOLUME_TOP_ACCOUNT_FLAT_BREAK_V1_20261011`; executor V2 `RISING_VOLUME_1M_SUSTAINED_RATIO_LONG2_SHORT1_5X_TP10_SL30_V2_20261011`.
Backtest không phải lệnh CLOSED thật, không cấp quyền WHITELIST. Code mới đã thêm theo preset người dùng chọn, **chưa restart/deploy hoặc bật lại SHORT live trong lượt này**.

## Kết luận

370 tín hiệu gốc SUSTAINED1m, 269 LONG/101 SHORT, 217 coin, chốt dữ liệu 14:19:09 VN 11/10/2026. Ngưỡng chính flat30m/biên5%/đổi10%/window30m chỉ khớp **6 LONG, 0 SHORT** ở chế độ ratio timestamp; trì hoãn công bố 5 phút còn **5 LONG, 0 SHORT**. Chỉ 3 LONG đủ 6h, 2 TP/1 SL, AvgROE ròng **−4.491%**, paper net margin2 **−0.2694 USDT**. Chưa đủ mẫu để nói có lợi thế; không chọn ngưỡng “tối ưu” từ 27 cấu hình đã nhìn kết quả.

Chế độ không delay: 1h, 5/6 LONG đủ tuổi, TP2/SL1/TIMEOUT2, AvgROE −5.102%; delay5m: 4/5 đủ tuổi, TP1/SL1/TIMEOUT2, −8.751%. Một kết quả dương hoặc 2/3 TP không đồng nghĩa chiến lược lời khi SL gấp 3 TP. Cả 27 grid không có SHORT khớp, nên **không có backtest cohort SHORT** để kết luận thắng/thua hay chọn ngưỡng SHORT.

## Định nghĩa causal trước entry

- Dùng Binance Futures `topLongShortAccountRatio`, period5m: **tỷ lệ LONG/SHORT theo tài khoản top trader**, không ratio vị thế, global accounts, đường OI hoặc notional OI.
- Baseline 7 điểm liên tục cách5m, trải30m ngay trước pha đổi dốc. Median làm nền; (max−min)/median ≤5%. Duyệt pha1→6 điểm (5→30m), lấy baseline gần nhất hợp lệ, không chọn theo giá/PnL sau tín hiệu.
- LONG cần Volume1m SUSTAINED LONG và ratio mới giảm ≥10% so median nền, xuống dưới min nền. SHORT cần Volume1m SUSTAINED SHORT và ratio tăng ≥10%, trên max nền. Không yêu cầu ratio >/<1, từng điểm đơn điệu, RSI/EMA/taker/OI hoặc BTC.
- Chỉ dùng ratio timestamp ≤ signal.closedAt. Điểm cuối phải cách closedAt <5m, đoạn baseline/transition liên tục; thiếu, cũ hoặc lỗi → không pass. Có sensitivity timestamp+5m ≤ closedAt vì timestamp không chứng minh lúc API công bố trong quá khứ. Runtime dùng response thực sự fetch trước entry, không coi mẫu historical replay là proof AT_ENTRY.
- Snapshot Volume phải có original AT_DETECTION/V1/patternV2/30 closed1m, re-evaluate detector và SUSTAINED không DCA, không backfill từ symbol hay mutable live badge.

## Replay và giới hạn

Giả lập entry ở **open nến contract1m đầy đủ đầu tiên sau observedAt**, không actual MARKET fill; có thể trễ tới60s. LONG margin2/SHORT margin1, leverage5, TP+10ROE = ±2% contract; SL−30ROE = ∓6% mark. SL exit proxy từ trigger mark × contract-close/mark-close trong phút trigger, có thể lệch −30ROE; tick/slippage không quan sát được. Tính taker fee0.05% mỗi chiều, chưa funding hoặc slippage bổ sung. TIMEOUT thoát close cuối1h/6h chỉ là mô hình nghiên cứu, không thêm time-stop runtime. Nếu cả TP/SL cùng phút thì exclude không đoán thứ tự; lần này0tie/0gap/0sourceerrors, không forced recovery.

Horizon chỉ tính khi toàn bộ1h/6h đã qua cutoff, kể cả có TP sớm. 1h có335/370 đủ tuổi; 6h209/370. Không dùng OPEN/non-mature làm thua hay thắng. Base LONG: 1h242, Avg−0.688%; 6h181, TP93/SL9/TIMEOUT79, Avg+1.237%, net+4.4778 ở margin2. Base SHORT: 1h93, Avg−0.602%; 6h28, TP7/SL5/TIMEOUT16, Avg−8.044%, net−2.2523 ở margin1. Không coi base khác cohort/backtest actual fills sáng nay là cùng phép đo.

History bị prune max3000/allframes, chỉ giữ khoảng6h tín hiệu gần nhất; bổ sung original audit fills các ngày trước bị selection bias bởi route/account/cap đang có. 370 này không phải mọi alert3ngày, không backtest toàn thị trường. Các signal cùngcoin/sóng có thể tương quan; replay từng signal độc lập, không mô phỏng cap50/existing-position/minNotional. SHORT1×5=5notional và LONG2×5=10 có thể không đạt minimum contract, replay không chứng minh có thể fill thật. Không tự ceil size.

## Sáu mẫu LONG khớp preset (timestamp mode)

| Coin | Thời điểm quan sát | Biên nền | Đổi ratio | 6h | ROE ròng % |
| --- | --- | --- | --- | --- | --- |
| JCTUSDT | 2026-10-09 02:42:01 VN | 1.238% | -37.608% / 15m | TP | 9.495 |
| SKLUSDT | 2026-10-09 18:51:01 VN | 3.342% | -18.281% / 15m | SL | -32.462 |
| GALAUSDT | 2026-10-10 12:09:09 VN | 1.683% | -22.424% / 30m | TP | 9.495 |
| USUSDT | 2026-10-11 09:10:03 VN | 3.963% | -11.770% / 20m | Chưa đủ 6h | — |
| LUMIAUSDT | 2026-10-11 11:12:51 VN | 2.268% | -27.882% / 5m | Chưa đủ 6h | — |
| FLOWUSDT | 2026-10-11 13:24:02 VN | 2.356% | -16.036% / 15m | Chưa đủ 6h | — |

Chế độ delay5m loại LUMIA ở tín hiệu đó; JCT/SKL/GALA vẫn là ba case6h. US/FLOW chưa đủ6h ở cutoff. Không “thử thắng xong” đưa lại vào cohort.

## Ngưỡng lân cận — LONG, 6h

N = tổng pass / số đủ6h. Flat cố định30m. Không chọn winner từ bảng nhỏ này; không có validation ngoài mẫu.

| Biên nền | Đổi tối thiểu | Pha tối đa | N lag0 | AvgROE lag0 % | N lag5m | AvgROE lag5m % |
| --- | --- | --- | --- | --- | --- | --- |
| 3% | 5% | 15m | 6/3 | 2.256 | 3/2 | -11.483 |
| 3% | 5% | 30m | 11/8 | 1.536 | 5/4 | -0.994 |
| 3% | 5% | 45m | 14/9 | 2.420 | 9/6 | -0.058 |
| 3% | 10% | 15m | 3/1 | 9.495 | 3/2 | -11.483 |
| 3% | 10% | 30m | 5/3 | -4.491 | 4/3 | -4.491 |
| 3% | 10% | 45m | 6/3 | -4.491 | 6/4 | -0.994 |
| 3% | 15% | 15m | 3/1 | 9.495 | 1/1 | 9.495 |
| 3% | 15% | 30m | 5/3 | -4.491 | 2/2 | 9.495 |
| 3% | 15% | 45m | 5/3 | -4.491 | 2/2 | 9.495 |
| 5% | 5% | 15m | 10/7 | 0.399 | 5/3 | -4.491 |
| 5% | 5% | 30m | 13/9 | 2.420 | 8/6 | -0.058 |
| 5% | 5% | 45m | 15/9 | 2.420 | 11/6 | -0.058 |
| 5% | 10% | 15m | 4/2 | -11.483 | 4/2 | -11.483 |
| 5% | 10% | 30m | 6/3 | -4.491 | 5/3 | -4.491 |
| 5% | 10% | 45m | 7/3 | -4.491 | 8/4 | -0.994 |
| 5% | 15% | 15m | 4/2 | -11.483 | 1/1 | 9.495 |
| 5% | 15% | 30m | 5/3 | -4.491 | 2/2 | 9.495 |
| 5% | 15% | 45m | 5/3 | -4.491 | 2/2 | 9.495 |
| 8% | 5% | 15m | 13/7 | 0.399 | 7/3 | -4.491 |
| 8% | 5% | 30m | 15/9 | 2.420 | 10/6 | -0.058 |
| 8% | 5% | 45m | 17/9 | 2.420 | 13/7 | 1.306 |
| 8% | 10% | 15m | 5/2 | -11.483 | 4/2 | -11.483 |
| 8% | 10% | 30m | 7/3 | -4.491 | 6/3 | -4.491 |
| 8% | 10% | 45m | 9/3 | -4.491 | 9/4 | -0.994 |
| 8% | 15% | 15m | 4/2 | -11.483 | 1/1 | 9.495 |
| 8% | 15% | 30m | 5/3 | -4.491 | 2/2 | 9.495 |
| 8% | 15% | 45m | 6/3 | -4.491 | 3/2 | 9.495 |

## CKB trong hình

Ratio13:00–13:30 median2.1959; tới14:00 là1.8827 (giảm14.26%), đúng dạng flat rồi sổ dốc trong30m. Không lấy tỷ lệ tăng OI phía trên để thay ratio accounts. Ratio vẫn>1 không có nghĩa SHORT accounts chiếm đa số; ratio giảm không chứng minh động cơ “nhà cái”.

Trong frozen history, CKB chỉ có **SUSTAINED SHORT14:07:59**, ratio đang giảm nên SHORT gate không pass. Các LONG trước đó có type OTHER/BURSTY hoặc signal5m, không được đổi thành SUSTAINED1m sau khi nhìn chart. Executor giữ mẫu **đầu đợt**: ratio đổ dốc sau đầu đợt có thể không được vào; lượt này không mở cơ chế đuổi giá/re-entry mỗi phút.

## Source mới / tương thích

Gate thực dùng proof bound symbol/side/signalId/asOf/fetchedAt/period5m + response rows; pure builder/policy rebuild proof, tuổi proof≤20s, nến≤70s và drift≤0.5% như trước. Fetch public qua shared client priority8/dropOnCongestion, không gọi account/order khi gate fail. NEW entry LONG2/SHORT1×5, TP10/SL30 fill-anchor; source/stream/labels route cũ giữ. Master/routes/execution/cap50/full-bypass/minimum/duplicate/unknown gửi giữ guards. Không tự bật SHORT đang OFF.

Discord detector nguyên vẹn, fail ratio vẫn phát; tin mới thêm pass/fail lý do và size theo hướng. Ledger Discord V1 giữ dedupe/outbox, không retro-send. Entry ledger giữ schema V1 để nhận attempts cũ; old plans3USDT được exact protection-only recovery, không qua valid order mới/không MARKET replay. Audit V2 thêm optional frozen ratioProof; audit V1 vẫn stats theo snapshot cũ, không lấy ratio mới gán lệnh cũ. Existing realCLOSED stats gộp các phiên bản theo key detector hiện hữu, không phải stats riêng gate; không thêm label/card/WHITELIST mới. Exact matcher/defaultOFF/chỉ realCLOSED AvgROE>4% giữ; paper không cấp quyền.

Artifact `data/research/rising-volume-ratio-phase-replay-20261011.json` giữ frozen ids/inputs/sourcehashes, outcome/masks/proof fields/gridsummary; **không chứa raw curve mọi217coin và không phải runtime entry proof**. Script `scripts/research-volume-ratio-phase-20261011.mjs` đọc artifact, dùng public API read-only, có thể không chạy lại được khi quá30ngày Binance retention; không ghi order/config. 6 assertions nguồn +230 checks cohort/nesting/causality PASS.

Kiểm chứng source: gate, Binance executor/protection legacy, Discord, AutoEntryControls, AutoBinancePolicy, detector/pattern, WHITELIST unit/regression PASS; syntax server/researchscript PASS. Browser desktop/mobile fixtures PASS, 0 writes/0 errors, không exchange/Discord POST thật. Local GET runtime sau test xác nhận vẫn V1 margin3, execution/master/LONG ON, SHORT OFF; không deploy/đổi switches. Giao diện cảnh báo khi runtime chưa V2 và hiển thị margin runtime thay vì tuyên bố source mới đã áp dụng.
