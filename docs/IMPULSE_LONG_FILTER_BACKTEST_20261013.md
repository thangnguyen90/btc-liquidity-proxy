# Kiểm chứng bộ lọc LONG BUY_IMPULSE — 13/10/2026

Version: `IMPULSE_LONG_FILTER_REPLAY_V1_20261013`. **Kết luận: chưa tìm được bộ lọc đứng vững qua cả giai đoạn kiểm tra và ngày thị trường yếu13/10. Không thêm gate/đổi size hoặc TP/SL.**

## Phạm vi và kết quả gốc

- Tập audit cố định lúc **2026-10-13 19:40:32 VN**. Source SHA256 `17e61f41b9fdd9f9789c31355fd91a0e3b52e2b0c7234022730d4c00f2544097`.
- Chính là LONG `POST_DUMP_NO_SELL_BUY_IMPULSE_LONG`, source `post-move-impulse`, sizing `IMPULSE_TIME_OR_BTC_MARGIN5_ELSE1_V1_20261001`. Không trộn Volume1m liền mạch, EMA hoặc nguồn khác.
- 419 vị thế CLOSED một opening: **292 margin5 /127 margin1**. Không DCA, không lifecycle trộn source/size, proof margin khớp margin audit, filled-notional/leverage khớp margin trong5%. Loại thêm1 lifecycle nhiều opening (net−0,11274348USDT) so với420 lifecycle ở báo cáo mô tả trước.
- Theo count lifecycle ở bước replay: 50 trộn/lệch, 1 nhiều opening, 17 chưa CLOSED đủPnL; missing/future proof 0. Không diễn giải các count này là số fill hoặc cộng với count85fill loại trong báo cáo trước.
- Size5: **159 thắng /133 thua, net−20,79603138USDT, PF0,6007**. Winrate54,45% nhưng avgwin+0,1968 /avgloss−0,3916USDT. Size1:69/58, net+0,34943319USDT. Hai size là cohort khác coin/thời điểm, không phải thí nghiệm đổi size ngẫu nhiên.

## Cách backtest và giới hạn

Đây là **historical filter replay trên các lệnh thực đã vào và đã đóng**, giữ nguyên realized exit/PnL audit gồm phí/funding. Nó trả lời “bộ lọc giữ/bỏ lệnh nào trong mẫu này”, không phải chạy lại tất cả tín hiệu chưa vào, không mô phỏng TP/SL cố định, thứ tự chạm trong nến, trượt giá, vốn, cap hoặc tương tác vị thế sau khi bỏ lệnh. Không quy trách nhiệm mọi `POSITION_CLOSED_ON_BINANCE` cho một bot đóng sớm.

- TRAIN: entry01–08/10VN, chỉ dùng outcome đã CLOSED trước00:00VN09/10. Purged boundary: size5 0, size1 0.
- Validation: entry09–12/10; stress: entry13/10 đếnasOf, **chưa hết ngày**. Các outcome test chỉ dùng để đánh giá, không chọn ngưỡng. CLOSED-only và khác thời gian giữ/exit gây selection/censoring bias.
- Danh sách20 bộ lọc đơn/ghép định trước trong script. Chọn bằng TRAIN AvgROE, tối thiểu20 vị thế TRAIN, không nhìn PnL test. Chọn cùng coverage cho mọi rule. Đã đọc audit toàn kỳ ở lượt trước: **không gọi đây là blind/prospective out-of-sample**, vẫn có multiple-testing/hindsight risk.
- BTC15m/1h, score, lý do cấp size lấy từ `entryReason` frozen; observedAt và btcAt phải trướcfill, không dùng BTC health hiện tại.
- Tải **419/419** bộ250 nến5m lịch sử qua public GET; không lỗi/thiếu/gap. Chỉ closeTime≤signal observedAt≤fill; ≥200bar warmup, không gap5m, latest age≤5m. Metadata/feature hash từng chuỗi lưu trong fixture. [Binance public kline documentation](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Kline-Candlestick-Data).
- EMA13/20/99 SMA-seeded từ250bar; EMA20 dốc lên so3bar trước. **RSI14 simple** tổnggain/loss14 biến động, không tự nhận bằng RSI Wilder trên appBinance. ATR14 làmean true range14; volume quoteUSDT nến cuối /median20 nến trước (không chứa nến đang xét); taker mua từquote. Đây là features tái dựng tại signalclose, không exact frozen EMA/RSI runtime.
- AvgROE =mean netPnL/planned margin×100 từngvịthế; không coi sumROE hoặc tổngentrymargin là equity return tài khoản.

## 1. Size5: toàn bộ bộ lọc

Mỗi ô: **số vị thế · thắng/thua · netUSDT**. Bảng này không phải xác suất dự báo.

| Bộ lọc giữ lệnh | TRAIN01–08 | Validation09–12 | Stress13/10 | Net toàn kỳ |
|---|---:|---:|---:|---:|
| Không lọc | 120 · 80/40 · 0.89 | 135 · 67/68 · -3.97 | 37 · 12/25 · -17.72 | -20.80 |
| Giờ tốt VÀ BTC aligned | 23 · 16/7 · -0.74 | 33 · 13/20 · 0.58 | 21 · 10/11 · -7.94 | -8.10 |
| BTC15m >0 | 67 · 43/24 · -0.95 | 76 · 36/40 · -2.35 | 20 · 5/15 · -11.49 | -14.79 |
| BTC15m ≥0,15% | 28 · 19/9 · 1.68 | 13 · 9/4 · 0.36 | 7 · 2/5 · -3.70 | -1.67 |
| BTC1h >0 | 79 · 53/26 · 0.63 | 71 · 35/36 · -7.03 | 25 · 8/17 · -10.43 | -16.82 |
| BTC15m và1h >0 | 45 · 29/16 · -1.92 | 47 · 23/24 · -3.94 | 14 · 4/10 · -6.74 | -12.60 |
| Score ≥40 | 94 · 66/28 · 5.68 | 106 · 54/52 · -1.92 | 28 · 7/21 · -14.47 | -10.71 |
| Score ≥50 | 33 · 23/10 · 1.97 | 35 · 17/18 · -0.97 | 10 · 1/9 · -6.87 | -5.88 |
| BTC15m >0 + score≥40 | 53 · 35/18 · 1.92 | 62 · 31/31 · -0.23 | 18 · 4/14 · -10.89 | -9.20 |
| BTC15m ≥0,15% + score≥40 | 22 · 15/7 · 3.01 | 10 · 8/2 · 1.22 | 5 · 1/4 · -3.10 | 1.13 |
| RSI14 simple45–65 | 58 · 36/22 · -3.72 | 72 · 36/36 · -5.14 | 19 · 5/14 · -9.21 | -18.06 |
| RSI14 simple50–70 | 92 · 59/33 · -2.16 | 103 · 51/52 · -5.32 | 31 · 10/21 · -13.72 | -21.20 |
| VOL quote≥3× median20 | 56 · 40/16 · 5.39 | 62 · 31/31 · -1.52 | 18 · 2/16 · -11.12 | -7.26 |
| VOL quote≥5× median20 | 21 · 12/9 · 1.00 | 23 · 8/15 · -1.37 | 10 · 1/9 · -5.81 | -6.18 |
| Taker mua≥65% | 92 · 63/29 · 1.61 | 107 · 51/56 · -3.49 | 30 · 10/20 · -14.32 | -16.21 |
| EMA20 dốc lên (3bar) | 109 · 73/36 · 1.15 | 128 · 65/63 · -2.99 | 36 · 11/25 · -18.17 | -20.01 |
| Close >EMA99 | 92 · 63/29 · 0.44 | 111 · 54/57 · -1.52 | 29 · 11/18 · -11.87 | -12.96 |
| CáchEMA13≤2ATR +RSI≤75 | 117 · 78/39 · 1.32 | 131 · 65/66 · -4.04 | 36 · 11/25 · -17.72 | -20.44 |
| BTC15m>0 +EMA20 dốc lên | 61 · 38/23 · -1.75 | 71 · 34/37 · -1.41 | 20 · 5/15 · -11.49 | -14.65 |
| BTC15m>0 +VOL≥3× | 30 · 19/11 · 1.61 | 36 · 16/20 · -2.29 | 14 · 2/12 · -9.97 | -10.65 |
| BTC15m>0 +taker≥65% | 50 · 33/17 · -0.65 | 64 · 30/34 · -0.09 | 18 · 4/14 · -10.89 | -11.62 |

**Ứng viên được TRAIN chọn: BTC15m≥0,15% +score≥40.**

- TRAIN22 lệnh:15 thắng/7 thua, +3,01USDT; validation10 lệnh:8/2, +1,22USDT; stress13/10:5 lệnh,1/4, −3,10USDT. Toàn kỳ37 lệnh,24/13,+1,13USDT,PF1,26,AvgROE0,61%.
- Toàn kỳ bỏ255 lệnh gồm135 thắng/120 thua, netnhóm bỏ−21,93USDT. Giữ15,09% lệnh thắng gốc; bỏ90,23% lệnh thua nhưng cũng bỏ84,91% lệnh thắng. Giảm tổngâm doít entry không đồng nghĩa có edge bền.
- Tất cả20bộlọc có entry trong ngày13 và **đều âm ở ngày13**. Riêngvol≥5×: ngày13 1thắng/9thua/net−5,81; score≥50:1/9/net−6,87. Không có cơ sở “volume càng cao/score càng cao càng tốt”.

## 2. Thắng/thua khác nhau ở đâu?

Trung vị pre-signal features của292vịthế size5:

| Chỉ số | Thắng159 | Thua133 |
|---|---:|---:|
| Score | 43.00 | 43.70 |
| BTC15m % | 0.02 | 0.02 |
| BTC1h % | 0.06 | 0.05 |
| RSI14 simple | 64.97 | 63.64 |
| VOLquote /median20 | 2.94 | 2.91 |
| Taker mua % | 72.47 | 69.79 |
| Close cáchEMA20 % | 0.75 | 0.67 |
| Close cáchEMA13 ATR | 1.57 | 1.54 |
| Coin return1h % | 0.84 | 0.78 |

Các phân bố trung vị rất gần nhau; không kiểm định ý nghĩa thống kê và không suy ra nguyên nhân từ chỉ số này. Khác biệt chắc chắn trong audit hiện tại là **payoff/exit và thời điểm thị trường**, không có một ngưỡng RSI/EMA/volume riêng đã phân tách được thắng/thua. BTCgreen +coin trênEMA vẫn có thể thua.

### Các lệnh giữ lại trong ngày13 nhưng vẫn thua

| Coin · entryVN | NetUSDT | BTC15m% | Score | RSI | VOL× | Close>EMA99 | Exit |
|---|---:|---:|---:|---:|---:|---|---|
| LUMIAUSDT · 03:05:20 | -0.0042 | 0.17 | 48.9 | 59.8 | 2.63 | Không | POSITION_CLOSED_ON_BINANCE |
| 1000FLOKIUSDT · 03:10:26 | -1.0219 | 0.34 | 48.8 | 73.5 | 3.58 | Không | STOP_LOSS_FILLED |
| YBUSDT · 12:15:28 | 0.0076 | 0.32 | 49.8 | 65.7 | 3.42 | Có | POSITION_CLOSED_ON_BINANCE |
| MAVUSDT · 13:35:27 | -1.0414 | 0.17 | 50.9 | 54.1 | 12.88 | Có | STOP_LOSS_FILLED |
| POPCATUSDT · 14:40:28 | -1.0388 | 0.32 | 46.4 | 61.2 | 10.51 | Có | STOP_LOSS_FILLED |

MAV vàPOPCAT cóvolume12,88×/10,51× vàclose>EMA99 nhưng vẫnSL. Điều này không tự chứng minh “nhà cái xả”; chỉ chứng minh volume/EMA tại signalclose không đủ bảo vệentry trong mẫu này.

## 3. Size1 đối chiếu riêng

Bộlọc được TRAIN size1 chọn làRSI45–65, không phải ứng viên size5:

| Nhánh | TRAIN | Validation | Stress13 | Toàn kỳ |
|---|---:|---:|---:|---:|
| Không lọc | 63 · 25/38 · -0.41 | 28 · 15/13 · -0.47 | 36 · 29/7 · 1.23 | 127 · 69/58 · 0.35 |
| RSI14 simple45–65 | 35 · 15/20 · 0.05 | 17 · 10/7 · -0.02 | 19 · 15/4 · 0.72 | 71 · 40/31 · 0.74 |

RSI45–65 cho size1 có tổng+0,74USDT nhưng validation−0,024USDT, TRAIN gần hòa vốn+0,047USDT. Chưa đủ lợi thế để áp gate. Không lấy size1 đanglãi13/10 suy ra “đổi tất cảsize5 thành1 sẽ thắng”.

## 4. Breadth: chưa đủ lịch sử khớp causal

Stream-read 217639 dònglog, 0 dòngmalformed. Chỉ **24/419** exactjoin: `marketDirection.evaluatedAt===entryReason.btcAt`, BTCtrend/15m/1h khớp, log đãghi trướcfill, age≤120s, breadthfields hữu hạn. 395 còn lại không suyra PASS/FAIL. Không join coin gầnthờiđiểm hoặc gánsnapshotlive choentrycũ.

Breadth log SHA256 `8eae25ced168afd8332ec20f017284ee84b3d8b4057e68e883eda8a38645e6d1`. Mẫu khớp quá nhỏ và thiếu không ngẫu nhiên; **chưa kiểm chứng được rule BTCstrength+breadth+relative-strength** trên toàncohort. Các mốc50%/60% nếuđềxuất tiếp phải được xem là giả thuyết nghiên cứu, không ngưỡng đãbacktesttốt.

## 5. Danh sách37 lệnh qua ứng viên TRAIN chọn

Danh sách thắng/thua theo **net** (không dùngchỉgross, không gán openthắng/thua). Quyếtđịnhlọc dựa featurepre-entry, outcome dướiđây chỉ để audit.

| Coin | EntryVN | NetUSDT | Thắng/thua |
|---|---|---:|---|
| SPKUSDT | 2026-10-01 12:05:08 | -1.0377 | Thua |
| MELANIAUSDT | 2026-10-01 12:05:09 | 0.1182 | Thắng |
| BTRUSDT | 2026-10-01 17:55:15 | 0.1001 | Thắng |
| INXUSDT | 2026-10-01 20:35:22 | 0.1721 | Thắng |
| DYDXUSDT | 2026-10-01 20:35:28 | 0.4625 | Thắng |
| ARBUSDT | 2026-10-01 20:36:15 | 0.0336 | Thắng |
| ENJUSDT | 2026-10-01 20:36:17 | -0.0764 | Thua |
| AWEUSDT | 2026-10-01 22:50:07 | -0.0187 | Thua |
| ZROUSDT | 2026-10-01 22:50:10 | 0.3000 | Thắng |
| CHILLGUYUSDT | 2026-10-01 23:35:17 | 0.4644 | Thắng |
| CRVUSDT | 2026-10-01 23:35:18 | -0.0175 | Thua |
| DYDXUSDT | 2026-10-01 23:35:19 | 0.4168 | Thắng |
| SKLUSDT | 2026-10-02 00:30:17 | -0.0176 | Thua |
| TAKEUSDT | 2026-10-02 01:40:20 | -0.0250 | Thua |
| FIGHTUSDT | 2026-10-02 03:05:22 | 0.1232 | Thắng |
| CKBUSDT | 2026-10-02 05:05:28 | 0.9911 | Thắng |
| JSTUSDT | 2026-10-02 09:10:31 | -0.0144 | Thua |
| FORMUSDT | 2026-10-02 10:05:05 | 0.2459 | Thắng |
| TOSHIUSDT | 2026-10-02 10:40:28 | 0.1936 | Thắng |
| SKYAIUSDT | 2026-10-02 15:00:10 | 0.3107 | Thắng |
| JASMYUSDT | 2026-10-03 04:05:08 | 0.2414 | Thắng |
| JCTUSDT | 2026-10-03 04:05:10 | 0.0438 | Thắng |
| 1000RATSUSDT | 2026-10-09 12:20:08 | 0.3188 | Thắng |
| 1MBABYDOGEUSDT | 2026-10-09 12:21:07 | 0.0401 | Thắng |
| SAGAUSDT | 2026-10-09 15:05:32 | 0.0751 | Thắng |
| ELSAUSDT | 2026-10-09 15:10:04 | 0.2839 | Thắng |
| ENAUSDT | 2026-10-09 15:55:11 | 0.0176 | Thắng |
| BLUAIUSDT | 2026-10-12 02:05:31 | 0.2364 | Thắng |
| MEGAUSDT | 2026-10-12 09:05:20 | 0.2653 | Thắng |
| DIAUSDT | 2026-10-12 11:30:08 | -0.0187 | Thua |
| GRIFFAINUSDT | 2026-10-12 11:30:10 | -0.0175 | Thua |
| FLUIDUSDT | 2026-10-12 11:45:50 | 0.0206 | Thắng |
| LUMIAUSDT | 2026-10-13 03:05:20 | -0.0042 | Thua |
| 1000FLOKIUSDT | 2026-10-13 03:10:26 | -1.0219 | Thua |
| YBUSDT | 2026-10-13 12:15:28 | 0.0076 | Thắng |
| MAVUSDT | 2026-10-13 13:35:27 | -1.0414 | Thua |
| POPCATUSDT | 2026-10-13 14:40:28 | -1.0388 | Thua |

## Artifact, tái lập và ảnh hưởng

- Script: `scripts/backtest-impulse-long-filters-20261013.mjs`; test: `scripts/test-impulse-long-filter-replay-20261013.mjs`.
- Audit input cố định: `data/research/impulse-long-filter-input-20261013.json`.
- Causal features250bars/hashes/frozenbreadth: `data/research/impulse-long-filter-features-20261013.json`.
- Tấtcảrule metrics gồm cảgiữ/bỏ: `data/research/impulse-long-filter-results-20261013.json`.
- Offline reproduce (không network): `node scripts/backtest-impulse-long-filters-20261013.mjs --input data/research/impulse-long-filter-features-20261013.json`; tests `node scripts/test-impulse-long-filter-replay-20261013.mjs`.
- PASS: futurebar invariance/gap/stale/unknownfield; proof future/legacy; DCA/mix/notional/multi-opening; trainboundary purge/selector khôngnhìn PnLtest; giữ+bỏ reconcile baseline; offlineexactmetrics toànfixture.
- Chỉ nghiên cứu, không thay runtimecards/statistics/labels/tier/gates/WHITELIST/controls, không đổi Binance/entry/size/SL/TP/protection hoặc lệnh cũ. Không restart/commit/push hay gửi order/Discord/Push test. JSONold thiếu proof khôngbackfill; sourceaudit/event/log nguyênvẹn.

