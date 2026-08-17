# Logic hiện tại: Decision Paper, Recommended Paper và EMA Paper

> Cập nhật: 2026-08-17 (Asia/Bangkok, UTC+7)
>
> Đây là tài liệu đọc nhanh về **logic đang chạy hiện tại**. Khi tài liệu cũ mâu thuẫn với file này, kiểm tra lại code tại `src/intradayDecisionPaper.js`, `src/recommendedSignals.js` và `src/server.js`; code vẫn là nguồn chuẩn cuối cùng.

### Liquid Flow V2: bật Binance $2 cho PRIMARY panic reclaim và POST-PUMP squeeze READY (2026-08-16)

- Versions đang chạy: detector/registry `LIQUID_HEATMAP_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_V20_20260816`, paper `LIQUID_FLOW_V2_PAPER_V29_PRIMARY_POST_PUMP_BINANCE_2USDT_20260816`, selective route `LIQUID_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_V1_2USDT_20260816`, auto-order policy `LIVE_CARD_AND_LIQ_FLOW_READY_V14_PRIMARY_POST_PUMP_2USDT_20260816`; whitelist giữ `LIVE_CARD_WHITELIST_V14_SWEEP_WATCH_CONFIRM_20260816` vì không thêm nhãn/card/key mới.
- Dữ liệu causal trước entry và điều kiện phân loại không đổi. `PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY` vẫn chỉ dùng top tăng rank 1-20, change/quote-volume hiện tại, EMA99 và OHLC/volume/taker của 5m, pullback/rebound/lower-reclaim và trend 1h/4h đã có trước entry: bối cảnh flush 24h `>=8%`, pullback `3-20%` về EMA99, rồi rebound `>=0,3%`, mark reclaim EMA99 `0,1-3%`, lower-reclaim và taker phục hồi `>=-25%`. `POST_PUMP_SHORT_SQUEEZE_LONG_READY` vẫn dùng top 150 theo quote-volume và tối đa 340 nến 5m đã đóng: pump `>=30%`, drawdown `25-75%`, base 12 nến range `<=6%`, volume fade, đáy giữ; READY cần close vượt base-high `0,2%`, trên EMA25, volume `>=1,8x`, taker `>=+5%` và close-position `>=65%`. Không dùng outcome/PnL tương lai để vào lệnh.
- Routing Binance chỉ mở cho đúng hai exact label trên. Khi transition READY tạo paper `OPEN`, bot gửi MARKET với margin `$2`, leverage khóa `5x`, notional yêu cầu `$10`; có thể tắt/đổi size riêng qua `LIQ_FLOW_V2_PRIMARY_PANIC_BINANCE_ENABLED`, `LIQ_FLOW_V2_PRIMARY_PANIC_BINANCE_MARGIN_USDT`, `LIQ_FLOW_V2_POST_PUMP_READY_BINANCE_ENABLED`, `LIQ_FLOW_V2_POST_PUMP_READY_BINANCE_MARGIN_USDT`. Vẫn fail-closed khi Orders tắt/dry-run, đã có position cùng symbol, vượt max-position, claim trùng, preflight/quantity hoặc Binance API lỗi. `PRIMARY_EMA99_PANIC_FLUSH_ACTIVE`, `POST_PUMP_BASE_ABSORPTION_WATCH`, `POST_PUMP_SHORT_SQUEEZE_PRIME`, extended panic và các nhãn lân cận không được bật.
- Entry/TP/SL: cả hai dùng `IMMEDIATE_MARK` sau điều kiện READY; không hồi tố trade OPEN cũ. Post-pump giữ TP cố định `+10% ROE`, SL `-20% ROE`, max hold 4h. Primary giữ plan hiện hữu: TP theo opposite-zone với floor `+10% ROE` và cap reward hiện tại, SL `-20% ROE`, max hold 4h. Khi MARKET fill, khoảng cách TP/SL từ signal plan được neo lại theo average fill; thay đổi chỉ thêm routing và margin thật, không đổi công thức protection hoặc vị thế đang mở.
- Thống kê/WHITELIST: tại thời điểm bật, paper CLOSED hiển thị `PRIMARY...READY` 19 lệnh, 16W/3L, WR `84,2%`, PF `2,51`, Net PnL `+9,2400 USDT`, AvgROE `+4,9%`; `POST_PUMP...READY` 7 lệnh, 6W/1L, WR `85,7%`, PF `3,85`, Net PnL `+4,2618 USDT`, AvgROE `+6,1%`. Đây là số audit hậu nghiệm, không phải gate cho từng entry. Hai card/key exact `heatmap-v2:PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY` và `heatmap-v2:POST_PUMP_SHORT_SQUEEZE_LONG_READY` đã tồn tại, matcher UI/runtime giữ nguyên, checkbox mặc định tắt và chỉ hiện khi CLOSED AvgROE `>4%`; auto route Liquid V2 theo profile riêng không tự tick whitelist.
- Tương thích JSON cũ: sáu setting `primaryPanicBinance*`/`postPumpReadyBinance*` cùng audit `binanceEntryCohort`/`binanceEntryPolicyVersion` là optional; persisted JSON thiếu setting được normalize bằng runtime default enabled, `$2`, `5x` nhưng không migrate/rewrite file lịch sử. Trade OPEN/CLOSED cũ không bị submit lại hoặc sửa TP/SL; chỉ event OPEN mới sau transition được claim. Feature/snapshot và exact label cũ tiếp tục đọc nguyên trạng, cách tính W/L/WR/PF/AvgROE/Net PnL vẫn chỉ dựa trên CLOSED exact label.

### Liquid Flow V2 sweep quality gates: WATCH → nến 5m xác nhận → READY (2026-08-16)

- Container versions đang chạy: detector `LIQUID_HEATMAP_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_V20_20260816`, paper `LIQUID_FLOW_V2_PAPER_V29_PRIMARY_POST_PUMP_BINANCE_2USDT_20260816`; sweep entry guard vẫn là `LIQUID_FLOW_V2_SWEEP_ENTRY_GUARD_V1_20260816`, whitelist `LIVE_CARD_WHITELIST_V14_SWEEP_WATCH_CONFIRM_20260816`. Hai nhãn WAIT là `UP_SWEEP_SHORT_WATCH` và `DOWN_SWEEP_LONG_WATCH`; exact key UI/runtime lần lượt là `heatmap-v2:UP_SWEEP_SHORT_WATCH` và `heatmap-v2:DOWN_SWEEP_LONG_WATCH`.
- Dữ liệu causal trước entry: chỉ dùng heatmap zone hiện tại, ba nến 5m đã đóng gần nhất (OHLC, quote-volume, taker-buy quote-volume), SMA13/25 của nến đóng, change 24h hiện tại, return 1h từ closed 5m, OI delta hiện tại và Binance force-order SHORT/LONG liquidation window hiện tại. Không dùng outcome, closed-paper PnL, thống kê datepicker hoặc nến live để quyết định. Feature optional `sweepConfirmation5m` ghi sweep time, confirmation close/time, EMA13/25 và taker delta của đúng nến xác nhận.
- Phân loại UP: nến quét/reject vùng trên chỉ tạo `UP_SWEEP_SHORT_WATCH`. `UP_SWEEP_SHORT_READY` chỉ phát ở nến 5m kế tiếp khi nến này bearish, không tạo high vượt sweep quá 0,2%, đóng thấp hơn nến sweep và dưới EMA13, taker delta nến đóng `<=0`, OI delta `<=-0,25%`, force-order socket đang `OPEN`, `shortLiquidationUsd==0`, đồng thời context vẫn là up-move (`24h >=10%` hoặc `1h >=3%`). Liquidation còn xuất hiện hoặc socket không mở luôn giữ WATCH, không được dùng làm confirmation. Confidence bỏ thưởng theo độ cực đoan của change 24h/1h.
- Phân loại DOWN: quét/reclaim vùng dưới generic chỉ tạo `DOWN_SWEEP_LONG_WATCH`. `DOWN_SWEEP_LONG_READY` chỉ dành cho pullback khi ngày còn tăng `0..10%` và 1h `<=-3%`; nến 5m kế tiếp phải bullish, low không thủng sweep quá 0,2%, close cao hơn nến sweep, taker delta nến đóng `>=+2%` và close trên cả EMA13/25. Coin ngày đang âm không được generic READY; phải đi qua nhãn HTF/panic/exhaustion riêng. WATCH là `OBSERVE ONLY`, không tạo paper/order.
- Entry/paper/statistics: READY vẫn entry paper immediate tại mark của scan sau nến confirmation, margin `$10 x 5`, TP floor `+10% ROE`, SL `-20% ROE`, max hold 4h và phí hiện hữu; không đổi công thức size/SL/TP. Với exact hai READY, chỉ nhận lệnh đầu tiên của mỗi symbol trong mỗi ngày Asia/Bangkok và khóa 4h tính từ `exitAt` sau SL, kể cả qua nửa đêm. W/L, WR, PF, Net PnL và AvgROE tiếp tục chỉ tính CLOSED theo exact label; lịch sử V1-V27 không backfill sang WATCH hay rule mới.
- Binance/WHITELIST: cả hai READY và hai WATCH tiếp tục `eligible=false` trong auto Binance profile, nên không mở lệnh thật; thay đổi chỉ ảnh hưởng paper entry frequency. Hai card WATCH đã nối generic stats/WHITELIST matcher với exact key, mặc định tắt; vì WATCH không có CLOSED paper nên `whitelistEligible=false`, checkbox chỉ có thể hiện theo policy chung CLOSED AvgROE `>4%`. Checkbox không nâng WATCH thành gate/order.
- Tương thích JSON cũ: `sweepConfirmation5m`, `sweepEntryPolicyVersion` và `sweepEntryDayBangkok` đều optional; loader không migrate/rewrite history. Trade cũ thiếu field vẫn được thống kê/đóng theo plan cũ. Dedupe ngày đọc `entryAt`, fallback `pendingSince`; cooldown sau SL đọc `exitAt`, fallback thời điểm bắt đầu để fail-safe.

### Thống kê Liquid Flow V2 paper theo nhãn và datepicker (2026-08-16)

- Version: `LIQUID_FLOW_V2_PAPER_LABEL_DATE_STATS_V1_20260816`. Bộ lọc mới trên `/liquid-flow-v2` đọc toàn bộ `data/liquid-flow-v2-paper.json` ở backend, không bị giới hạn bởi snapshot 300 record gần nhất.
- Dữ liệu trước entry/phân loại: thay đổi không tạo hoặc sửa tín hiệu. Cohort ngày dùng `entryAt`, fallback `pendingSince`, với biên ngày `Asia/Bangkok`; nhãn nhóm theo exact `labelKey`, fallback `label`, cuối cùng `UNLABELED`. Trade đóng ngày sau vẫn thuộc ngày đã vào paper, không dùng outcome/close-time để đổi cohort.
- Cách thống kê: từ/đến đều inclusive theo ngày Bangkok; lọc một nhãn hoặc tất cả. `OPEN` và `PENDING_ENTRY` hiển thị riêng; W/L, WR, PF, Net PnL và AvgROE chỉ tính `CLOSED` bằng công thức paper hiện hữu. `CANCELLED` có trong danh sách đóng/hủy nhưng không là loss/PnL. Danh sách phân trang backend 10 record/trang; bảng theo nhãn có open/pending, closed, W/L, WR, PF, Net PnL và AvgROE.
- Ảnh hưởng giao dịch: chỉ là API/UI thống kê; không ảnh hưởng Binance, gate, entry, size, leverage, SL hoặc TP. Không thêm nhãn/card tín hiệu hay runtime matcher nên không thêm checkbox `WHITELIST`; policy hiện hữu mặc định tắt và chỉ hiện khi CLOSED AvgROE `>4%` không đổi.
- Tương thích JSON cũ: không migrate/rewrite paper. Record thiếu `labelKey` dùng `label`; thiếu `entryAt` dùng `pendingSince`; thiếu cả hai nhãn gom `UNLABELED`. Snapshot API cũ giữ nguyên, endpoint thống kê mới chỉ bổ sung.

## 1. Quy ước chung

### Binance position mở 8 giờ còn âm: TP về entry (2026-08-16)

- Version đang chạy: `BINANCE_NEGATIVE_TP_TO_ENTRY_AFTER_8H_V1_20260816`; rule âm sâu hiện hữu vẫn là `BINANCE_NEGATIVE_TP_TO_ENTRY_V3_CAP_TSL_EXCLUDED_ROE20_20260815`, còn rule position 12 giờ không âm vẫn giữ `BINANCE_TP_TO_ROE1_AFTER_12H_V1_20260812`.
- Dữ liệu causal sau entry: chỉ dùng active Binance position hiện tại gồm average `entryPrice`, `positionAmt`/side, Mark Price hoặc unrealized PnL để tính ROE hiện tại, `openedAt` đã lưu từ fill trong `sl-tracking` (fallback thận trọng là lần runtime đầu tiên nhìn thấy position), và trạng thái `Cap TSL`. Khi thực thi mới đọc regular/algo open orders và symbol tick/lot metadata. Không dùng candle, signal outcome, paper PnL hay dữ liệu tương lai.
- Điều kiện phân loại: position phải còn mở đủ `8h` (`28800000ms`) và **ROE hiện tại < 0%**. Đủ 8h nhưng ROE bằng 0 hoặc dương thì không đổi TP. Symbol đang check `Cap TSL` tiếp tục được loại trừ. Rule cứu lỗ sâu ROE `<=-20%` vẫn có thể đưa TP về entry trước 8h; fallback cũ dựa trên thời gian âm liên tục 4h đã bỏ, `NEG_TP_TIMEOUT_MS` không còn được dùng. Có thể tắt rule mới bằng `BINANCE_NEGATIVE_TP_AFTER_8H_ENABLED=false` hoặc đổi tuổi qua `BINANCE_NEGATIVE_TP_AFTER_8H_MS`.
- Thực thi Binance/TP/SL: tái sử dụng pipeline negative-TP idempotent. Nếu chưa có close order gần entry, chỉ hủy TP close-side cũ nằm xa entry rồi đặt `LIMIT GTC` cho toàn bộ quantity còn lại tại average entry, `reduceOnly=true` ở one-way hoặc đúng `positionSide` ở hedge mode. LIMIT có thể khớp tại entry hoặc tốt hơn khi giá hồi; không MARKET-close lúc đang âm. SL/profit-lock được giữ nguyên, không đổi entry, side, margin, size hoặc leverage. Rule 8h có ưu tiên trước rule TP +1% sau 12h nên hai worker không kéo TP ngược nhau.
- Thống kê/nhãn/WHITELIST: đây là protection lifecycle sau entry, không thêm signal/label/tier/card/cohort, không thay W/L, WR, PF, AvgROE hay Net PnL và không thêm checkbox whitelist. Log ghi version, tuổi position, ROE và target entry; dedupe theo symbol + entry và cooldown API 2 phút giữ idempotency.
- Tương thích JSON cũ: không thêm field bắt buộc, không migrate/rewrite trade, tracking hoặc lifecycle JSON. Các field `twelveHourTakeProfit*` cũ vẫn được đọc/giữ cho rule 12h; map dedupe của rule 8h chỉ ở runtime và open order Binance được kiểm tra lại sau restart. Record thiếu `openedAt` dùng fallback first-seen nên không giả định position cũ đã đủ 8h ngay sau restart.

### Liquid Flow V2 PUMP FLUSH RECLAIM LONG READY + Binance $1.5 (2026-08-16)

- Version pump-flush giữ `PUMP_FLUSH_RECLAIM_5M_V1_20260816`; auto policy/container hiện là `LIVE_CARD_AND_LIQ_FLOW_READY_V14_PRIMARY_POST_PUMP_2USDT_20260816`, `LIQUID_HEATMAP_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_V20_20260816`, `LIQUID_FLOW_V2_PAPER_V29_PRIMARY_POST_PUMP_BINANCE_2USDT_20260816`, whitelist `LIVE_CARD_WHITELIST_V14_SWEEP_WATCH_CONFIRM_20260816`, không đổi rule pump-flush bên dưới.
- Du lieu causal truoc entry: universe top 150 Binance USDT perpetual theo quote-volume hien tai, `change24hPct >= 0`, va toi da 220 nen 5m **da dong**. Detector dung OHLC, median quote-volume 20 nen truoc pump, ATR 14 nen truoc pump, EMA13/25, RSI14, quote-volume va taker-buy quote-volume cua nen reclaim. Chi tim spike trong 8 nen gan nhat va reclaim toi da 6 nen sau spike; khong doc nen dang mo, outcome, paper PnL hay du lieu tuong lai. Stage `FLUSH_BASE_HOLD` la state noi bo de theo doi, khong phai nhan giao dich va khong tao lenh.
- Dieu kien phan loai exact `PUMP_FLUSH_RECLAIM_LONG_READY`: bien pump tu launch-base den high `>=8%`, range `>=2.5 ATR`, volume spike `>=3x`; cung nen co upper-wick `>=35%`/close-position `<=65%` hoac cac nen sau retrace `55-105%` bien pump; low/close giu launch-base trong tolerance `max(0.25 ATR, 0.1%)`. Chi READY khi mot nen 5m sau do da dong bullish tren `max(EMA13, EMA25, launch-base + 25% bien pump)`, low khong thap hon flush-low qua `0.2%`, hoi tu low `>=1.8%`, volume `>=1.5x`, taker delta `>=+5%`, close o `>=65%` range va RSI14 trong `45-78`.
- Entry/Binance/size: transition READY tao paper `IMMEDIATE_MARK` theo `PUMP_FLUSH_RECLAIM_5M_CLOSED_MARK`; exact label nam trong allowlist auto-real va profile `PUMP_FLUSH_RECLAIM` duoc bat mac dinh, co the tat bang `LIQ_FLOW_V2_PUMP_FLUSH_BINANCE_ENABLED=false`. Binance dat MARKET sau paper OPEN, margin co dinh `$1.5`, leverage khoa `5x`, notional yeu cau `$7.5`; setting size la `LIQ_FLOW_V2_PUMP_FLUSH_BINANCE_MARGIN_USDT` mac dinh `1.5`. Van fail-closed neu Orders tat/dry-run, da co position cung symbol, vuot max-position, preflight/quantity hoac API Binance loi. Khong vao o nen pump, pha flush/base-hold hay reclaim chua dong.
- SL/TP: khong tao cong thuc protection moi. Paper cohort giu V2 default margin `$10 x 5`, SL `-20% ROE`, TP toi thieu `+10% ROE` va co the lay opposite-zone trong cap reward hien huu, max hold 4 gio. Lenh that gui khoang cach TP/SL tu plan va neo lai theo average fill bang fill-anchored protection; thay doi nay chi them routing/size cho cohort moi, khong sua TP/SL cua lenh cu hoac cohort khac.
- Thong ke/UI/WHITELIST: card dung exact key UI/runtime `heatmap-v2:PUMP_FLUSH_RECLAIM_LONG_READY`; stats dem ca primary va secondary classification, con ket qua chi tong hop trade `CLOSED` cua dung label. Checkbox moi mac dinh tat va chi hien khi closed `AvgROE > 4%`; key da duoc noi vao normalizer/matcher va test. Checkbox nay la whitelist thong ke/live-card chung; auto-real truc tiep cua Liquid V2 duoc user bat rieng qua profile tren, nen khong tu dong bat checkbox va cung khong phu thuoc checkbox.
- Tuong thich JSON cu: `pumpFlushReclaim5m`, `pumpFlushReadyAt`, snapshot detector va ba setting `pumpFlushBinance*` deu optional. Loader giu nguyen trade/cache/history cu, khong migrate hay rewrite; record cu thieu feature khong match nhan moi. Persisted settings cu duoc normalize bang default va runtime env hien tai de bao dam cohort moi co size `$1.5 x 5`; TP/SL/open position cu khong bi thay doi.

### Binance user-data socket tự reconnect và replay full-fill bị lỡ (2026-08-16)

- Version đang chạy: user-data stream `POSITION_USER_DATA_STREAM_V2_LISTEN_KEY_RECOVERY_20260816`; fill trigger `POSITION_PROTECTION_SOCKET_FILL_V4_LISTEN_KEY_RECONNECT_20260816`; durable watermark tiếp tục dùng `POSITION_PROTECTION_FILL_WATERMARK_V1_20260812`. Thay đổi xuất phát từ sự cố thực tế: Binance phát `listenKeyExpired` lúc 14:40 nhưng socket cũ không đóng/reconnect, nên fill ONG lúc 17:15 không đi qua protection callback.
- Dữ liệu dùng và tính causal: chỉ đọc event user-data Binance hiện tại (`listenKeyExpired`, `ORDER_TRADE_UPDATE`, `TRADE_LITE`), kết quả keepalive hiện tại, Position Risk, User Trades/Order REST sau reconnect và watermark full-fill đã xử lý. Recovery chỉ xét order FILLED mới hơn watermark, không reduce-only/close-position, cùng hướng với vị thế đang mở; không dùng candle, outcome, paper PnL hoặc dữ liệu tương lai để quyết định.
- Điều kiện phân loại/lifecycle: `listenKeyExpired` hoặc keepalive trả listen-key invalid/`-1125` thì invalidate socket generation cũ, dừng timer cũ, terminate socket và tạo listenKey mới ngay; close/error socket dùng reconnect 5 giây. Generation guard và một reconnect timer duy nhất chặn socket cũ/close callback tạo kết nối đè hoặc trùng. Sau một kết nối đã từng hoạt động được nối lại, server chạy missed-fill recovery dùng chung single-flight và durable watermark; startup one-shot và reconnect recovery không chạy chồng nhau.
- Cách thống kê/audit: status position monitor bổ sung `userDataReady`, connect/reconnect count, listen-key-expired count, keepalive-failure count, reconnect reason/time và stream version. Recovery log reason cùng `checkedSymbols/candidates/recovered/failed` và chỉ advance watermark sau khi toàn bộ active symbol được scan không lỗi. Đây không phải signal/tier/card nên không có WR/PF/AvgROE, không thêm checkbox `WHITELIST`.
- Ảnh hưởng Binance/entry/size/SL/TP: không mở entry mới, không đổi giá/size/leverage hay target TP/SL. Khi reconnect, recovery có thể đặt lại đúng protection TP/SL đã được rule trước entry xác định cho một full-fill bị socket bỏ lỡ; manual fill không có plan vẫn dùng fallback hiện hữu. Không quét/sửa tất cả vị thế cũ chỉ vì thiếu SL. Lỗi Binance từ chối protection thứ hai `GTE_GTC closePosition` là vấn đề riêng, chưa được thay đổi trong patch socket này.
- Tương thích JSON cũ: không đổi schema paper/lifecycle. File watermark V1 và `handledOrderIds` cũ được đọc nguyên trạng, không migrate/rewrite history; stats reconnect chỉ ở RAM và optional qua status. Record cũ thiếu metadata socket vẫn hợp lệ.

### Liquid Kill Zone SHORT yếu/up-mid/day-flat/reset: Binance test thật $1, TP +5% ROE (2026-08-16)

- Version đang chạy: test profile `LIQUID_KZ_SHORT_YEU_UPMID_FLAT_RESET_TEST_V1_20260816`; SHORT entry policy `LIVE_CARD_SHORT_ENTRY_GUARD_V2_LIQUID_KZ_LIMIT_RETEST_20260816`; whitelist `LIVE_CARD_WHITELIST_V12_LIQUID_KZ_YEU_UPMID_TEST_20260816`; lifecycle `LIVE_CARD_BINANCE_LIFECYCLE_V3_LIMIT_RETEST_20260816`; expiry worker `LIVE_CARD_LIMIT_RETEST_EXPIRY_V1_20260816`.
- Phạm vi phân loại là exact causal key đã tồn tại: `cycle-stable:LIQUID_KILL_ZONE | SHORT | 15m | BTC_CORR_YEU | BTC_UP_MID | THEO_YEU | GATE_TEST_LIQUID_SHORT_BTC_COUNTER || CYCLE DAY_FLAT | RSI4_RESET`. Chỉ trade có snapshot tại lúc paper entry khớp đủ source/side/timeframe/BTC correlation/BTC position/direction/gate/cycle/RSI mới nhận profile; không dùng tên card `cycle-today` hoặc kết quả cuối ngày để phân loại. Không thêm label, card hay matcher mới.
- Dữ liệu dùng trước entry: exact key từ snapshot paper lúc signal, paper/signal entry price, Binance last price hiện tại sau preflight, side, leverage cấu hình live-card, cùng trạng thái position/open order/dedupe hiện tại. Adverse slippage SHORT tính `(paperEntry - currentPrice) / paperEntry * 100`; không đọc outcome, PnL tương lai hoặc thống kê sau entry. Cohort được user bật sau thống kê tham khảo 29 paper CLOSED, 27W/2L, AvgROE `+8.67%`, PF `25.57`; các số này không được tính lại để gate từng lệnh mới.
- Xác nhận entry: nếu adverse slippage `<=0.05%`, gửi MARKET. Nếu giá đã tốt hơn paper hoặc xấu hơn paper quá `0.05%`, nhánh tốt hơn vẫn MARKET còn nhánh xấu hơn chuyển thành `SELL LIMIT GTC` đúng paper entry, chờ tối đa 60 giây và tuyệt đối không fallback sang MARKET. Hết hạn không fill thì hủy và ghi `ENTRY_EXPIRED`; partial fill thì hủy phần còn lại rồi đóng phần đã fill để không giữ vị thế thiếu protection. Các guard position/open-order/dedupe/giờ chạy/dry-run hiện hữu vẫn giữ nguyên.
- Ảnh hưởng Binance/size/SL/TP: exact key đã được bật đồng thời trong candidate `WHITELIST` và real-enabled theo yêu cầu test, vì vậy có thể mở lệnh Binance thật. Margin cố định `$1`; leverage dùng cấu hình live-card đang chạy (mặc định hiện tại `10x`), nên notional là `margin x leverage`. TP riêng của profile là `+5% gross ROE`, công thức SHORT `fillEntry * (1 - 0.05 / leverage)` và được neo lại theo fill thật; tại `10x` tương đương giá giảm `0.5%`. SL tiếp tục lấy từ paper signal và dùng cơ chế fill-anchor hiện hữu; rule không thay SL. Không ảnh hưởng nhóm/key khác.
- Thống kê/hiển thị: paper CLOSED vẫn được gom theo exact key như trước; real lifecycle lưu matched key, entry type, limit/expiry, margin/leverage và TP profile để đối soát. `ENTRY_EXPIRED` không bị tính thành một closed loss; partial abort được ghi lifecycle riêng. Card tổng hợp `TODAY · OBSERVE ONLY` vẫn chỉ là card thống kê và không được đổi tên thành gate Binance; quyền thật nằm ở exact `cycle-stable` key. Vì đây là key/card đã tồn tại, không tạo checkbox mới; policy chỉ-hiện-checkbox khi closed AvgROE `>4%` đã được thỏa và trạng thái được bật tường minh theo yêu cầu user.
- Tương thích JSON cũ: các field `shortEntryOrderType`, `shortEntryLimitPrice`, `shortEntryRetestExpiresAt`, `testProfileVersion`, `testTakeProfitRoePct` và expiry-state đều optional. Loader vẫn đọc state V2/V11 cũ; execution cũ không được migrate/rewrite, vị thế đang mở không bị sửa, và record thiếu field mới giữ routing cũ. Hai file enable được nâng version V12 nhưng giữ nguyên toàn bộ key cũ.

### Liquid Flow V2 EMA FAN LONG retest-confirm entry (2026-08-16)

- Version đang chạy: detector `LIQUID_HEATMAP_FLOW_V2_EMA_FAN_RETEST_CONFIRM_V17_20260816`; paper `LIQUID_FLOW_V2_PAPER_V26_EMA_FAN_RETEST_CONFIRM_20260816`; entry confirmation `EMA_FAN_LONG_RETEST_CONFIRM_V1_20260816`; auto-Binance policy `LIVE_CARD_AND_LIQ_FLOW_READY_V12_EMA_FAN_RETEST_CONFIRM_20260816`; manual-order policy `LIQUID_FLOW_V2_MANUAL_BINANCE_UI_V7_EMA_FAN_RETEST_CONFIRM_20260816`.
- Dữ liệu dùng trước entry và tính causal: bước READY vẫn chỉ dùng universe/rank hiện tại và nến 5m đã đóng của detector EMA fan. Sau READY, paper dùng tick mark hiện tại để nhận biết giá chạm mức retest `EMA13 tại signal +1%`; sau khi chạm chỉ đọc nến 5m đã đóng có `closeTime` lớn hơn thời điểm touch, gồm OHLC, EMA13/25/99, hai gap EMA so với nến trước, taker-buy quote-volume/quote-volume của chính nến đó, cờ bullish và higher-low. Giá paper xác nhận dùng mark hiện tại tại scan xác nhận. Symbol pending được giữ trong candidate/kline scan tới khi confirm/cancel/timeout kể cả khi rơi khỏi top hiện tại. Không đọc outcome, nến chưa đóng hoặc dữ liệu tương lai.
- Điều kiện phân loại không đổi: `EMA_FAN_LONG_READY` thường vẫn là top gainer rank 1-50, ngày tăng, có compression/breakout 5m hợp lệ, EMA13 > EMA25 > EMA99 và fan mở rộng theo detector; `EMA_FAN_LONG_IMPULSE_RUNNER` vẫn là nhánh riêng volume `>=5x`, body `>=1%`, distance EMA13 `<=3%` và vào ngay. V17 chỉ bổ sung telemetry `gap1325PrevPct`, `gap2599PrevPct`, hai cờ widening và closed-candle taker delta để xác nhận entry của nhánh thường; không thêm hoặc đổi label/tier.
- Rule entry nhánh thường: transition READY tạo paper `PENDING_ENTRY`, planned trigger bằng `EMA13_signal * 1.01` và hết hạn 15 phút tính từ signal. Tick chạm trigger chỉ chuyển `WAIT_RETEST_TOUCH -> WAIT_CLOSED_CONFIRMATION`, chưa fill paper và chưa cấp Binance. Nến 5m đóng sau touch chỉ xác nhận khi bullish, close `>= EMA13`, `higherLowConfirmed=true`, taker delta của nến `>0`, EMA13 > EMA25 > EMA99 và ít nhất một trong hai gap EMA vẫn widening. Mất thứ tự fan, nến đóng dưới EMA25, hoặc cả hai gap cùng co thì cancel với `ENTRY_CONFIRMATION_INVALIDATED`; thiếu một điều kiện xác nhận nhưng chưa invalid thì tiếp tục chờ trong phần thời gian còn lại, quá 15 phút cancel `ENTRY_TIMEOUT`.
- Sau xác nhận: paper chuyển `OPEN` tại mark hiện tại với `entryMode=RETEST_CONFIRMATION_MARKET`, đồng thời neo lại TP/SL theo entry xác nhận. Auto Binance được **giữ bật** và chỉ nhận event paper `OPEN`, dùng profile `EMA_FAN_RETEST_CONFIRM`, MARKET margin `$1` ở `5x`, sau full fill neo protection như pipeline hiện hữu. Nút Binance thủ công bị khóa cho riêng `EMA_FAN_LONG_READY` còn PENDING để không bypass xác nhận. Paper vẫn margin `$10`, `5x`, TP `+10% ROE`, SL `-25% ROE`, max hold 12 giờ; thay đổi ảnh hưởng thời điểm/giá entry và do re-anchor nên ảnh hưởng giá TP/SL, không đổi size/leverage/ROE target. Nhánh IMPULSE không đổi: paper/Binance immediate, Binance `$5 x 5`.
- Cách thống kê và whitelist: không thêm card hoặc key mới; tiếp tục gom theo exact key `heatmap-v2:EMA_FAN_LONG_READY`, W/L, WR, PF, AvgROE và Net PnL chỉ lấy paper CLOSED theo pipeline hiện hữu. PENDING/CANCELLED không được ép thành lệnh thua closed. Checkbox `WHITELIST` hiện hữu giữ nguyên key, mặc định tắt và policy chỉ hiện khi closed `AvgROE >4%`; thay đổi này không tự bật checkbox. Lịch sử trước V26 không backfill nên card có thể chứa kết quả của cả routing cũ và mới, phân biệt bằng `trade.version`/confirmation metadata khi audit.
- Tương thích JSON cũ: `plannedEntryPrice`, `entryConfirmationRequired`, `entryConfirmationVersion/State/Reason`, `retestTouchedAt/Price`, confirmation candle/snapshot và các gap/taker field đều optional. OPEN/CLOSED/CANCELLED cũ không bị migrate, rewrite hay đổi TP/SL. Một record V18-V25 còn `PENDING_ENTRY` với label `EMA_FAN_LONG_READY` nhưng thiếu field mới được fail-safe coi là cần confirmation: lần touch kế tiếp chỉ arm chờ nến đóng, không tự OPEN/Binance. Các label pending khác giữ logic fill cũ.

### Liquid Flow V2 kill-LONG exhaustion reclaim (2026-08-15)

- Version detector: `LIQUID_HEATMAP_FLOW_V2_KILL_LONG_EXHAUSTION_V16_20260815`; paper: `LIQUID_FLOW_V2_PAPER_V25_KILL_LONG_EXHAUSTION_20260815`; Discord: `LIQUID_FLOW_V2_KILL_LONG_EXHAUSTION_DISCORD_V1_20260815`; whitelist: `LIVE_CARD_WHITELIST_V11_KILL_LONG_EXHAUSTION_20260815`.
- Dữ liệu dùng trước entry và tính causal: chỉ dùng các nến 5m đã đóng cùng mark hiện tại, OHLC, EMA13/25, quote-volume và taker-buy quote-volume; Open Interest được lấy mẫu liên tục để tính delta khoảng 1 phút hiện tại, 1 phút trước và 5 phút; Binance force-order SELL (đóng LONG) được gom theo ba cửa sổ trượt `0-5m`, `5-10m`, `10-15m`. Nhãn này **không dùng vùng Liquid Map V1** và không đọc outcome/nến tương lai.
- Điều kiện phân loại `KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY`: phải đồng thời có cascade context (pullback từ đỉnh gần nhất `>=4%` hoặc return 1h `<=-3%`), volume `>=1.5x`; force SELL ở cửa sổ 5m trước lớn hơn 0 và cửa sổ hiện tại giảm còn `<=0.70x`; OI 5m `<=-0.5%` rồi ổn định (delta 1m hiện tại cải thiện ít nhất `0.1` điểm so với phút trước sau một phút `<=-0.15%`, hoặc delta 5m `<=-0.5%` và delta 1m hiện tại `>=-0.1%`); taker delta `>=+2%`; nến 5m tăng đóng ở `>=65%` range, hồi từ low `>=0.6%`, close trên cả EMA13/25 và xác nhận higher-low (low không thấp hơn quá `0.2%`, close cao hơn nến trước). Thiếu bất kỳ điều kiện nào vẫn giữ nhãn squeeze/wait hiện hữu, không bắt đáy chỉ vì giá giảm sâu.
- Cách thống kê: card riêng trên `/liquid-flow-v2`, key runtime/UI chính xác `heatmap-v2:KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY`. Transition READY mới tạo paper `IMMEDIATE_MARK` tại scan sau nến đóng, margin `$10`, leverage `5x`, TP cố định `+10% ROE`, SL `-20% ROE`, timeout `4h`; target không phụ thuộc vùng V1. Checkbox whitelist mặc định tắt và chỉ xuất hiện khi cohort paper đã CLOSED có `AvgROE > 4%`.
- Ảnh hưởng giao dịch: có ảnh hưởng entry/size/SL/TP **paper** như trên nhưng `affectsBinance=false`; `liquidFlowV2AutoBinanceProfile()` trả `eligible=false` với cohort `KILL_LONG_EXHAUSTION_PAPER`, nhãn không nằm trong `LIQUID_FLOW_V2_AUTO_REAL_LABELS`, vì vậy không mở/sửa/hủy lệnh Binance thật. Discord chỉ gửi một lần ở transition READY vào webhook riêng, embed xanh cho xác nhận và embed cam cho điều kiện vô hiệu; dedupe mặc định 24 giờ.
- Tương thích JSON cũ: các field `openInterestPriorDeltaPct`, `openInterestDelta5mPct`, `openInterestStabilizing`, force-liquidation window/decay/peak và snapshot paper đều optional. Cache/trade JSON cũ thiếu field được xem là không match nhãn mới; không migrate, không rewrite và không thay đổi TP/SL của paper đang mở hay history cũ.

### Liquid Flow V2 post-pump base absorption / short-squeeze LONG (rule gốc 2026-08-15, routing cập nhật 2026-08-16)

- Runtime hiện tại dùng detector `LIQUID_HEATMAP_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_V20_20260816`, paper `LIQUID_FLOW_V2_PAPER_V29_PRIMARY_POST_PUMP_BINANCE_2USDT_20260816`, route `LIQUID_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_V1_2USDT_20260816`, whitelist `LIVE_CARD_WHITELIST_V14_SWEEP_WATCH_CONFIRM_20260816`. Điều kiện ba nhãn post-pump gốc không đổi; version mới chỉ tách routing Binance của exact READY thường.
- Dữ liệu trước entry và tính causal: quét top 150 Binance USDT perpetual theo quote-volume hiện tại, tối thiểu mặc định `$2M`; chỉ dùng tối đa 340 nến 5m đã đóng. Context tìm pump lịch sử `>=30%`, drawdown từ đỉnh `25-75%`, 12 nến base ngay trước signal và nến breakout đã đóng. Dùng OHLC, quote-volume, taker-buy quote-volume và EMA25 tính từ các nến đã đóng; OI/liquidation chỉ là telemetry, không bắt buộc và không dùng outcome tương lai.
- Điều kiện phân loại: `POST_PUMP_BASE_ABSORPTION_WATCH` khi base range `<=6%`, tuyệt đối base-return `<=3.5%`, đáy nửa sau không thấp hơn đáy nửa đầu quá `1.5%`, median volume base / peak volume crash `<=0.65`; nhãn này `OBSERVE ONLY`. `POST_PUMP_SHORT_SQUEEZE_LONG_READY` yêu cầu thêm close vượt base-high `0.2%`, close trên EMA25, breakout volume `>=1.8x`, taker delta `>=+5%`, thân tăng và close-position `>=0.65`. `POST_PUMP_SHORT_SQUEEZE_PRIME` là READY cộng aggregate taker delta trong 12 nến base `<=-1%` để tách nhóm sell-flow được hấp thụ.
- Cách thống kê: ba nhãn là card riêng trên `/liquid-flow-v2`; primary và `secondaryLabels` đều được đếm active/transition. READY/PRIME tạo cohort paper riêng, entry `IMMEDIATE_MARK` ở scan sau nến đóng, margin `$10`, leverage `5x`, TP `+10% ROE` (giá `+2%`), SL `-20% ROE` (giá `-4%`), timeout `4h`, phí theo paper V2. Card có key chính xác `heatmap-v2:<LABEL_KEY>`, mặc định whitelist tắt và checkbox chỉ hiện sau khi paper CLOSED `AvgROE > 4%`; WATCH không thể đủ điều kiện nếu không có paper closed.
- Ảnh hưởng giao dịch hiện tại: WATCH không tạo paper/order. Exact `POST_PUMP_SHORT_SQUEEZE_LONG_READY` có `affectsBinance=true`, profile auto-real enabled mặc định và MARKET `$2 x 5`; `POST_PUMP_SHORT_SQUEEZE_PRIME` vẫn `affectsBinance=false`/`eligible=false` và chỉ chạy paper. Checkbox whitelist chỉ lưu lựa chọn card/live-card chung, không thay thế selective auto profile này.
- Tương thích JSON cũ: `postPumpUniverse`, `postPumpShortSqueeze5m` và snapshot paper là field optional. Record/cache/paper JSON cũ thiếu field được xem là không match, không migrate/rewrite và không đổi kết quả nhãn cũ. Paper cũ vẫn được load bằng normalizer leverage/risk hiện hữu.
- Cơ sở đánh giá lịch sử: backtest 14 ngày, top 150 thanh khoản, entry open nến kế tiếp, 5x, TP giá `+2%`, SL giá `-4%`, timeout 4h, fee `0.4% ROE`, cùng nến tính SL trước TP. Price-only READY có 25 lệnh, WR `76.0%`, AvgROE `+3.875%`, PF `2.13`; PRIME sell-absorption có 6/6 thắng, AvgROE `+9.6%` nhưng mẫu nhỏ. Routing mới chỉ bật exact READY thường theo thống kê paper mới ở đầu tài liệu; PRIME vẫn paper-only.

### TP về hòa vốn khi Binance ROE âm 20% (2026-08-15)

- Version: `BINANCE_NEGATIVE_TP_TO_ENTRY_V3_CAP_TSL_EXCLUDED_ROE20_20260815`.
- Dữ liệu dùng và tính causal: đây là protection sau entry, chỉ dùng active position Binance với average `entryPrice`, `markPrice`/unrealized PnL, margin và leverage lấy từ user-data socket hoặc shared REST snapshot hiện tại. Không dùng nến tương lai, paper outcome hay PnL đóng để quyết định.
- Điều kiện phân loại: vị thế đang mở, gồm bot, Liquid Flow V2 và lệnh vào tay, pass khi Binance ROE `<= -20%` (bao gồm đúng `-20%`), **trừ symbol đang check `Cap TSL` trên Orders**. Cap TSL chặn đồng nhất socket, scanner dự phòng, deep guard và rule tuổi position 8 giờ; bỏ check thì position lại dùng rule âm ở tick/scan kế tiếp. Socket kích hoạt ngay theo tick; scanner cấu hình hiện tại 90 giây là đường dự phòng. Dedupe theo symbol + entry và cooldown API 2 phút tránh đặt lặp.
- Cách thống kê: đây không phải signal/label/tier/card mới; không tạo WR/PF/PnL cohort và không thêm checkbox `WHITELIST`. Log runtime ghi version, symbol và giá entry để audit execution.
- Ảnh hưởng giao dịch: với symbol không Cap TSL, có hủy riêng TP close-side cũ nằm xa entry rồi đặt một lệnh `LIMIT GTC reduceOnly` tại average entry. Với symbol Cap TSL, TP hiện hữu được giữ nguyên và rule này không write/cancel Binance. Không mở lệnh, không đổi entry, size/margin/leverage, không hủy/đặt/sửa SL. Nếu đã có TP/close order gần entry thì giữ và skip. Profit-lock dương vẫn chạy theo rule riêng; emergency âm sâu và rule tuổi 8h có ưu tiên hơn TP 12 giờ khi đang âm.
- Tương thích JSON cũ: không đổi schema giao dịch và không migrate/rewrite trade JSON. Tiếp tục dùng đúng key/API/localStorage `Cap TSL` hiện hữu; không thêm checkbox/field mới. Trạng thái checkbox server được tách khỏi legacy signal-exclude và lưu bền vững optional trong `data/orders-cap-tsl.json` version `ORDERS_CAP_TSL_STATE_V1_DURABLE_20260815`; file chưa tồn tại được xem là danh sách rỗng, sau đó browser Orders đẩy localStorage cũ lên qua API như trước. Map dedupe chỉ ở runtime; restart vẫn đọc order Binance hiện hữu để nhận ra TP tại entry.

### Startup recovery chi bo sung TP con thieu (2026-08-12)

- Version: `BINANCE_STARTUP_TP_ONLY_RECOVERY_V1_20260812`.
- Du lieu dung va tinh causal: day la fail-safe sau entry, chay dung mot lan sau khi service khoi dong. Moi position Binance dang mo duoc doi chieu voi toan bo regular/algo order hien tai. Gia TP uu tien snapshot da co truoc entry trong `sl-tracking`/protection plan/lifecycle, sau do la exact Liquid Flow V2 paper cung symbol/side/entry hoac pump plan. Position tay khong co bot lifecycle dung average entry va leverage Binance de tinh `+30% ROE`; bot da nhan dien nhung mat target dung fallback LONG `+10%`/SHORT `+6%` ROE. Khong dung PnL outcome hay nen tuong lai de chon target.
- Dieu kien: neu Binance da co bat ky close-side `TAKE_PROFIT`/`TAKE_PROFIT_MARKET` dung `positionSide` thi giu nguyen, khong so gia/quantity va khong dat duplicate. Chi khi TP thieu, target causal tim duoc va lan doc Binance fresh ngay truoc write van xac nhan thieu thi moi dat mot `TAKE_PROFIT_MARKET closePosition`. Liquid Flow V2 mat ca snapshot target thi fail-closed, khong tu che target ROE.
- Cach thong ke: khong them nhan, tier, cohort, card hay checkbox whitelist; log mot summary `active/existing/placed/noTarget/failed` theo moi startup, khong tinh WR/PF/PnL.
- Anh huong giao dich: co the dat TP Binance that cho position dang mo bi thieu TP. Recovery nay **khong dat, sua, huy hay quet bu SL**, khong cancel TP/order da co, khong doi entry, margin/size hoac leverage va khong chay dinh ky. Protection full-fill socket cho lenh moi van la pipeline rieng.
- Tuong thich JSON cu: chi doc field optional da co va khong migrate/rewrite JSON. Position cu thieu lifecycle van duoc xem la manual; V2 cu thieu target bi bo qua an toan. `AUTO_TP_SCAN_ENABLED=false`; feature moi dieu khien boi `BINANCE_STARTUP_TP_RECOVERY_ENABLED` va delay mot lan.

### Tong PnL realtime cho History lenh that Binance (2026-08-11)

- Version: `LIVE_CARD_HISTORY_TOTAL_PNL_V2_20260811`.
- Du lieu dung: cohort lifecycle da fill trong dung khoang ngay/filter Orders; lenh dong lay `closedPnlNet` Binance da doi soat, lenh mo lay fill price/qty/margin/leverage da snapshot truoc entry va mark socket Binance hien tai.
- Dieu kien phan loai: `POSITION_CLOSED + closedPnlKnown` vao `NET dong`; lifecycle con mo va co socket dung symbol/side vao `uPnL mo`. Tong hien tai bang `NET dong + uPnL mo`; record thieu income hoac socket duoc dem `thieu`, khong tu gan 0 vao tong.
- Cach thong ke: unique lifecycle trong bang, khong cong theo nhan whitelist nen khong bi trung khi mot lenh khop nhieu nhan. uPnL mo la gross theo mark, chua tru fee/funding; NET dong da gom realized, commission va funding.
- Anh huong giao dich: chi thay doi thong ke/UI realtime tren `/orders`; khong anh huong Binance, gate, entry, size/margin, leverage, SL hay TP. Khong them nhan/card/checkbox whitelist.
- Tuong thich JSON cu: khong them field va khong rewrite store; record cu thieu `closedPnlKnown`, fill/qty hoac socket chi hien trong bo dem `thieu`.

### TP mac dinh cho lenh vao tay tren Orders va Binance app (2026-08-12)

- Version: `MANUAL_SOCKET_TP_ROE30_V2_20260812`.
- Du lieu dung: request `/api/order` van dung `side`, leverage va gia MARKET/LIMIT da co truoc entry. Voi lenh mo truc tiep tren Binance app, he thong khong co snapshot tin hieu truoc entry; chi khi user-data socket xac nhan full fill moi dung `side`, leverage va **gia vao trung binh cua position sau fill** do REST sync kem socket tra ve. Gia trung binh sau fill duoc uu tien hon gia fill rieng le de DCA khong tinh TP tren mot leg sai. Khong dung candle, nhan, outcome hay gia tuong lai de phan loai.
- Dieu kien phan loai: request source `orders-manual` hoac full-fill socket khong khop protection plan/lifecycle bot va khong khop manual Liquid Flow V2 duoc xem la lenh tay `binance-manual-socket`. Neu Orders da nhap TP thi giu gia nguoi dung; neu trong TP hoac vao truc tiep tren Binance thi dat TP `+30% ROE`, tuong duong bien dong gia `30% / leverage`; LONG tren entry, SHORT duoi entry. Lifecycle/plan bot va Liquid Flow V2 co TP rieng van duoc uu tien, khong roi vao fallback tay.
- Cach thong ke: khong them nhan/card/cohort/checkbox whitelist; lifecycle va Orders history tiep tuc thong ke theo lenh Binance hien huu.
- Anh huong giao dich: co dat TP Binance cho lenh tay moi tu Orders va Binance app. TP/SL duoc gom vao mot protection plan one-shot sau full-fill socket; guard doc moi regular/algo orders va chi dat tung ve con thieu, nen position da co SL van duoc them TP ma khong tao SL thu hai. SL mac dinh van `-25% ROE` khi `AUTO_SL_ENABLED` bat; khong doi entry, margin, leverage hay size. Khong bat lai scanner quet thieu dinh ky. Bot/Liquid Flow V2 giu plan rieng.
- Tuong thich JSON cu: `signalSource=binance-manual-socket` va metadata TP/SL chi la field optional trong `sl-tracking`; record cu khong can migrate/rewrite. Scanner dinh ky van tat; startup recovery V1 ben tren chi bo sung TP con thieu mot lan va khong dat SL.

### EMA PRE stage candle labels V2 - observe only (2026-07-22)

- Version: `EMA_PRE_CANDLE_OBSERVE_V2_20260722`.
- Ap dung rieng cho `PRE_BREAKOUT LONG` va `PRE_BREAKDOWN SHORT`; khong goi rule Shakeout.
- Label `GOOD`, `WATCH`, `RISK`, `GOOD-TEST`, `WATCH+` chi de hien thi, ghi log va backtest. Label khong block ENTER, khong doi margin `$10/$1`, SL hoac TP.
- Size va dieu kien vao lenh tiep tuc theo gate ky thuat/combo PRE hien huu; khong doc gia tri tu candle label.
- Nhan nen duoc tinh theo thu tu `stage + timeframe`, sau do moi xet cap nen ALT/BTC tai luc vao lenh.
- `PRE_BREAKOUT 5m`: nen `GOOD`; ALT bullish + BTC bullish ha thanh `RISK`; ALT bullish + BTC bearish thanh `WATCH` (BTC Shooting Star la `GOOD-TEST`); ALT bearish + BTC bullish la `GOOD-TEST`.
- `PRE_BREAKOUT 15m`: nen `RISK`; ALT bearish + BTC neutral la `WATCH+`; ALT bearish + BTC bearish la `WATCH`.
- `PRE_BREAKDOWN 15m`: nen `WATCH`; ALT bearish + BTC bullish ha thanh `RISK`.
- `PRE_BREAKDOWN 5m`: `RISK`.
- Thieu mot trong hai mau nen: `WATCH`, khong tu suy dien theo BTC regime.
- Paper moi luu `sideCandle*` va `emaPreStageEval*` (version, pattern/bias hai nen, reason code, `observationOnly`) de backtest theo rule version; `emaPreStageEvalMarginUsdt` luon `null` o V2.
- Script backtest: `scripts/analyze-ema-squeeze-context.mjs`; test matrix: `npm run test:ema-pre-stage-rule`.

### Pump candle flag V1 (display only, 2026-07-22)

- Cot `Pump candle flag` chi hien thi danh gia tu `pump type + timeframe + ALT candle + BTC candle`.
- Version: `PUMP_CANDLE_FLAG_V1_20260722`.
- Flag khong duoc noi vao `pumpEval`, khong doi ENTER, margin, SL, TP hoac ket qua lenh.
- `EMA_PULLBACK` mac dinh WATCH; cap ALT `BEARISH_CANDLE` + BTC `BEARISH_MARUBOZU` la `GOOD-TEST`; cac cap am trong backtest 2 ngay hien `RISK`.
- `PUMP_BREAKOUT` mac dinh RISK; ALT bearish + BTC bullish chi nang len WATCH.
- `DUMP` la `WATCH-TAIL`; `EARLY_DUMP` la RISK; thieu nen la `WATCH - NO DATA`.
- Lich su duoc tinh flag luc render tu snapshot da luu, khong sua hoi to file paper.

### EMA Breakout/Breakdown candle flag V1 (display only, 2026-07-22)

- Cot `EMA candle flag` tren `/ema-squeeze` tinh rieng cho source native `BREAKOUT LONG` va `BREAKDOWN SHORT`.
- Version: `EMA_BREAK_CANDLE_FLAG_V1_20260722`; flag chi hien thi tu `stage + timeframe + BTC regime + ALT candle + BTC candle`.
- `BREAKOUT 5m` mac dinh `GOOD`; ALT bullish + BTC bearish la `RISK`; ALT bearish la `WATCH+`.
- `BREAKOUT 15m` mac dinh `WATCH`; ALT bearish + BTC bullish la `WATCH+`; ALT bullish + BTC bearish la `RISK`.
- `BREAKDOWN 5m` mac dinh `RISK`. `BREAKDOWN 15m` la `RISK` khi BTC `SW_UP`, ngoai SW_UP tam de `WATCH`; mau duong nho chi hien `GOOD-TEST`.
- Flag khong duoc noi vao `emaBreakEval`, khong doi ENTER, margin, SL, TP hoac ket qua lenh. Lich su duoc tinh lai khi render, khong sua hoi to paper log.
- Cot tren `/ema-squeeze` co sort hai chieu va filter `GOOD`, `GOOD-TEST`, `WATCH+`, `WATCH`, `RISK`, `NO DATA`; filter chi thay doi danh sach/thong ke dang hien thi, khong doi du lieu paper.

### EMA Stage Candle V1 (observe only, 2026-07-23)

- Version: `EMA_STAGE_CANDLE_OBSERVE_V1_20260723`.
- Day la lop quan sat moi, tach khoi cot `Legacy candle`; router chon rule rieng cho `Pre Breakout`, `Pre Breakdown`, `Breakout`, `Breakdown`, `Squeeze Long`, `Squeeze Short`, `Runner`, `BR-like Long` va `BR-like Short`.
- Thu tu context thong ke: `stage -> side -> timeframe -> ALT candle -> BTC candle`; khong dung mot bang nen chung cho moi stage.
- Nhan `GOOD`, `GOOD-TEST`, `WATCH+`, `WATCH`, `RISK`, `NO DATA` khong doi ENTER, margin, SL, TP hoac ket qua lenh. Cac nhan ban dau la bucket de thu thap mau, chua phai ket luan co loi the.
- Paper EMA moi luu `emaStageCandle*` tai entry. Lich su cu chi derive tu snapshot nen da luu trong row, co `emaStageCandleDerived=true`; khong doc nen live va khong ghi de file history.
- API va UI co filter `Stage candle`, sort theo nhan, thong ke net sau phi cho nhom nhan, `stage x nhan` va context chi tiet `stage x ALT candle x BTC candle`.
- PnL/WR/AvgROE trong thong ke lop nay chi tinh lenh CLOSED; OPEN/PENDING chi hien so luong.
- Rule: `src/emaStageCandleRule.js`; test matrix: `npm run test:ema-stage-candle-rule`.

### BTC phase

- `BTC_UP_WEAK`: BTC đi lên, trend score `< 45`.
- `BTC_UP_MID`: BTC đi lên, trend score `45-64`.
- `BTC_UP_STRONG`: BTC đi lên, trend score `>= 65`.
- `BTC_DOWN_WEAK`, `BTC_DOWN_MID`, `BTC_DOWN_STRONG`: tương tự cho chiều xuống.

### Tương quan coin với BTC

- `BTC_CORR_RAC` / `rac`: correlation `< 0.3`, coin khá độc lập BTC.
- `BTC_CORR_YEU` / `yeu`: correlation từ `0.3` đến `< 0.5`.
- `BTC_CORR_THEO` / `theo`: correlation `>= 0.5`, coin bám BTC rõ.

### Size đánh giá

- Nhóm `A`: full paper, mặc định `$10`.
- Nhóm `B`: paper test, mặc định `$1`.
- `WATCH`: vẫn giữ để đo nếu stage cho phép, thường `$1`.
- `BLOCK`: không tạo paper mới.
- Không sửa lại size hoặc kết quả của lệnh lịch sử khi rule thay đổi.

### Giờ sử dụng trong rule

- Mọi rule theo giờ bên dưới dùng giờ `Asia/Bangkok` (UTC+7).
- Không dùng giờ UTC cho các bảng giờ Runner/Pre-stage/Squeeze Long.

## 2. Trend Decision Paper (`/decision-paper`)

### Chu kỳ và nguồn quyết định

- Chế độ chính là `signal-live`: poll version cache mỗi `2 giây`; scanner vừa ghi batch mới thì queue/debounce `350ms` và đánh giá ngay.
- Chu kỳ `15 phút` chỉ còn là fallback nếu event/cache trigger bị lỡ.
- Trend chính mặc định là `1h`; có thể đổi sang `4h` trên giao diện.
- Nếu dùng trend `1h`, trend `4h` vẫn là macro veto: tín hiệu ngược trend 4h mạnh bị loại, trừ coin độc lập BTC.
- Mỗi chu kỳ gom toàn bộ tín hiệu scanner đang có, loại bản trùng rồi ghép với catalog combo lịch sử.
- Catalog mặc định dùng lookback `30 ngày`, tối thiểu `8 lệnh đóng`.
- `intraday-decision-paper-trades.json` là log đánh giá phát sinh, bị loại khỏi catalog mặc định để tránh hệ thống tự học lại chính các clone của nó; chỉ đọc khi chạy predictor với `--include-derived`.

### Điều kiện ENTER

Một tín hiệu chỉ `ENTER` khi đồng thời:

1. Có combo lịch sử khớp và combo đạt hạng `A`.
2. Prediction score `>= 78`.
3. Signal score `>= 60`.
4. Không ngược trend chính mạnh hoặc trend 4h mạnh; coin `DOC_LAP/BTC_CORR_RAC` có thể được miễn veto.
5. Chưa có paper cùng `symbol + side` đang mở.
6. Chưa ENTER lại đúng `source + symbol + side + signal type` trong `240 phút`.
7. Có Binance Last Price từ socket mới trong tối đa `5 giây`.
8. Batch signal mới không quá `90 giây` (`INTRADAY_DECISION_MAX_SIGNAL_AGE_SECONDS`).
9. Market chưa chase quá `0.15%` theo hướng lệnh so với entry gốc (`INTRADAY_DECISION_MAX_ADVERSE_ENTRY_DRIFT_PCT`). LONG chặn khi market cao hơn entry quá mức; SHORT chặn khi market thấp hơn entry quá mức.
10. `BREAKOUT/BREAKDOWN` chưa quá `2` nến kể từ nến sự kiện (`INTRADAY_DECISION_MAX_BREAKOUT_AGE_BARS`).
11. Fingerprint `source + symbol + side + stage + timeframe + event candle` chưa được xử lý; cùng một breakout không được ENTER lại khi scanner quét lại.

Từ 2026-07-20, matcher không còn dùng phép so khớp chuỗi một phần. `PRE_BREAKOUT` không thể khớp nhầm `BREAKOUT`, `PRE_BREAKDOWN` không thể khớp nhầm `BREAKDOWN`, và Pump Breakout không thể mượn mẫu EMA Breakout. Khóa catalog phải trùng stage, side, timeframe, BTC correlation bucket, BTC phase và relation; gate live được kiểm tra riêng vì tên gate lịch sử có thể thay đổi.

Với tín hiệu EMA, Decision Paper còn chạy lại gate EMA hiện tại trước khi ENTER. `BLOCK` thành REJECT; tier A dùng `$10`, tier B/WATCH dùng margin do gate trả về, thường `$1`.

### BTC regime gate V1

Từ 2026-07-22, mỗi candidate được chụp thêm trend BTC và nến BTC 5m ngay lúc quyết định. Kết quả được lưu ở `btcRegimeGate`, `btcRegimeAtEntry`, `btcCandleAtDecision` và hiển thị thành cột `BTC regime gate`:

- `SW_DOWN + LONG`: ngược regime, margin bị cap ở `$1`; nến BTC bearish là `RISK`, nến bullish đảo chiều là `WATCH` và cần signal `>= 80`.
- `SW_DOWN + SHORT`: nến BTC bearish là `GOOD` và giữ size rule gốc; nến bullish đảo chiều là `WATCH`, cap `$1`.
- `SW_UP + SHORT`: áp đối xứng với nhánh `SW_DOWN + LONG`.
- `SW_UP + LONG`: nến BTC bullish là `GOOD`; nến bearish đảo chiều là `WATCH`, cap `$1`.
- Nến trung tính hoặc `NO_DATA` không tự nâng hạng. Lệnh ngược regime vẫn chỉ test `$1`.
- Gate này không sửa size hoặc kết quả của lệnh lịch sử; chỉ áp cho lệnh Decision Paper mở mới.

Không đủ entry gate nhưng combo còn đáng theo dõi thì ghi `WATCH`; trường hợp xấu/không có mẫu đủ tin cậy ghi `REJECT`. Cả ba loại đều được lưu vào decision log để audit.

### Entry, size và số lượng lệnh

- Entry phải là **giá market mới từ Binance Last Price socket**, không lấy setup price làm giá khớp.
- Lưu riêng `signalEntry`, `entryPrice`, độ lệch entry và tuổi tick socket để kiểm tra sau.
- Log mới lưu thêm `signalObservedAt`, `signalAgeMs`, `breakoutAge`, `adverseChasePct` và `signalFingerprint` để audit vì sao ENTER/WATCH.
- Margin mặc định `$10`, leverage `10x`.
- `maxOpenPositions = null` và `maxEntriesPerRun = null`: không có trần tổng 30 slot.
- Giới hạn rủi ro theo cụm: tối đa `5` entry cho cùng combo trong một chu kỳ và tối đa `10` lệnh đang mở cho cùng combo.
- Khi một symbol đã có paper mở, không mở thêm cả cùng chiều lẫn ngược chiều.
- Pre Breakout và Squeeze Long đang tạm dừng riêng trên Decision Paper sau mẫu thực chiến âm; EMA source paper vẫn theo rule riêng của nó.

### SL và quản lý lợi nhuận

- SL gốc cố định `-15% ROE`, tính lại từ market entry thực tế, side và leverage.
- Không dùng TP cứng cho Decision Paper; `tp = null`, chế độ là `PROGRESSIVE_ROE_TRAIL`.
- Dời SL lũy tiến:

| Peak ROE | SL khóa |
|---:|---:|
| dưới `+7%` | giữ SL gốc `-15%` |
| `+7%` đến dưới `+15%` | entry / `0%` |
| `+15%` | `+5%` |
| `+20%` | `+10%` |
| `+25%` | `+15%` |
| `+30%` | `+20%` |

- Sau đó cứ peak tăng thêm `5%`, SL khóa tăng thêm `5%`.
- Mốc `+7%` chỉ khóa hòa vốn tại entry; không khóa `+2%`.
- Paper có thể đóng bởi SL gốc, trailing SL, timeout hoặc BTC trend mạnh đảo chiều theo manager.

### Realtime và giao diện

- Backend quản lý mark/PnL bằng socket Binance; trang nhận trạng thái realtime qua SSE.
- Header hiển thị nguồn lần chạy gần nhất: `SIGNAL LIVE`, `THỦ CÔNG` hoặc `DỰ PHÒNG`, cùng số tín hiệu mới/tổng cache.
- Card có màu và icon riêng cho `OPEN`, thắng, thua và lệnh đã đóng.
- Lịch sử lệnh đóng nằm trong table riêng phía dưới.
- Table đóng có filter thắng/thua/hòa và paging `10/25/50/100` dòng.
- Bảng `Đánh giá combo sau hiệu chỉnh` chỉ dùng paper có `openedAt >= 2026-07-20T05:40:00Z`
  (`12:40` giờ Bangkok), đồng thời bắt buộc có `decisionStage` và combo chuẩn. Dữ liệu
  trước mốc hoặc thiếu stage vẫn nằm trong log gốc nhưng không tham gia WR, AvgROE,
  PF, PnL hoặc nhãn GOOD/WATCH/RISK của bảng combo.
- Combo được tách theo `decisionStage + side + timeframe + combo context`; vì vậy
  `BREAKOUT`, `PRE_BREAKOUT`, `BREAKDOWN`, `PRE_BREAKDOWN`, `SQUEEZE` và `RUNNER`
  không bị gộp chung.
- Store chính: `data/intraday-decision-paper.json`.
- Log đánh giá riêng: `data/intraday-decision-paper-trades.json`.

## 3. Recommended Signals và Recommended Paper (`/recommended-signals`)

### Chọn mẫu

- Báo cáo ngày chỉ dùng dữ liệu đã đóng tới hết ngày UTC trước đó, tránh look-ahead.
- Các cửa sổ: `1/3/5/7/30 ngày`.
- Điều kiện whitelist mặc định: `closed >= 8`, `WR >= 80%`, `AvgROE >= 3%`, PnL dương.
- Khóa khớp phải đúng `page + BTC phase + combo`; không trộn EMA/Pump/Liquid/Edge.
- Combo có `NO_DATA` không được dùng làm mẫu quyết định.
- Paper clone phát sinh sau baseline được cộng vào mẫu đánh giá cập nhật; không cộng clone dữ liệu huấn luyện cũ để tránh clone sai/survivorship bias.

### Clone paper

- Recommended Paper là paper độc lập để đánh giá, không tạo thêm Binance order và không sửa source paper.
- Entry/mark/đóng lệnh dùng socket riêng theo kiến trúc EMA paper.
- Mỗi clone chuẩn hóa SL về `-16% ROE`, không kế thừa SL nguồn.
- Nếu source không có TP hợp lệ, clone dùng TP mặc định `+15% ROE`; nếu source có TP thì giữ TP nguồn.
- Socket engine tự đóng clone khi chạm SL/TP và giữ trạng thái đóng qua các lần đồng bộ sau.
- Clone giữ `sourcePage + sourceTradeId`; đồng bộ lại không tạo bản trùng.
- Clone đã tạo tiếp tục được theo dõi kể cả combo sau đó rớt whitelist.
- Có bảng lệnh, thống kê combo, sort toàn dataset và paging cố định `50` dòng.
- Lệnh đóng hiển thị rõ `TP THỰC`, `SL GỐC`, `SL DỜI/TRAIL`, `VỀ ENTRY`, `HẾT HẠN` hoặc `ĐÓNG THEO RULE`.

### Đánh giá paper clone hai lớp (shadow)

- Version hiện tại: `recommended-clone-shadow-v1`.
- Chỉ gắn nhãn, sort và thống kê; **không chặn entry và không đổi size**.
- Lớp 1 `SOURCE` chụp chất lượng recommendation ngay lúc clone:
  - `STRONG` → `GOOD`.
  - `GOOD` hoặc thiếu nhãn → `WATCH`.
  - `NEUTRAL/BAD` → `RISK`.
- Lớp 2 `CLONE` đánh giá chất lượng lần khớp market:
  - `GOOD`: source-open event V3, không trùng exposure và độ lệch entry so với nguồn `<= 0.08%`.
  - `WATCH`: độ lệch `> 0.08%` tới `0.30%`, hoặc thiếu một trường audit không nghiêm trọng.
  - `RISK`: không phải event V3, có lệnh cùng symbol/side còn mở trong cụm 15 phút, adverse chase `> 0.08%`, lệch giá tuyệt đối `> 0.30%`, event quá `10s` hoặc market tick quá `5s`.
- Kết luận hai lớp:
  - Chỉ `SOURCE GOOD × CLONE GOOD` mới là `GOOD`.
  - Có một lớp `RISK` thì kết luận `RISK`.
  - Các trường hợp còn lại là `WATCH`.
- Log mới lưu snapshot `recommendedSourceLayer`, `recommendedCloneLayer`,
  `recommendedTwoLayerTier`, reason, version và số exposure trùng tại thời điểm
  clone. Lệnh cũ được suy ra khi đọc từ các trường audit sẵn có, không viết ngược
  hoặc sửa kết quả lịch sử.
- Giao diện có thống kê riêng L1, L2, ma trận `SOURCE × CLONE` và ba cột tương ứng
  trong bảng Recommended Paper.

## 4. EMA Paper: nguyên tắc chung

### Phí Binance ước tính và Gross/Net

- EMA Paper dùng phí Binance Futures taker mặc định `0.04%` mỗi chiều (`0.0004`).
- Phí round trip ước tính: `(entry notional + exit/mark notional) * feeRate`.
- Thứ tự override: `EMA_SQUEEZE_PAPER_FEE_RATE`, `BINANCE_FUTURES_TAKER_FEE_RATE`, `BINANCE_FEE_RATE`.
- `Gross PnL` là PnL theo biến động giá; `Net PnL = Gross PnL - estimated fee`.
- Lệnh OPEN dùng mark live làm giá thoát giả định; lệnh CLOSED dùng exit price đã lưu.
- Tổng filter, nhóm size, combo, WR, AvgROE, sort PnL/ROE và table paper dùng Net để đánh giá; Gross và Fee vẫn được hiển thị để đối soát.
- Combo chỉ có lệnh OPEN vẫn phải hiển thị, không chờ có lệnh CLOSED mới xuất hiện.

- Các stage dùng prefix `emasq-*` và lưu chung tại `data/pump-paper-trades.json`.
- Mark/PnL sử dụng dedicated EMA socket. Entry market ưu tiên socket mới; REST chỉ là fallback có nhãn nguồn và tuổi giá.
- Combo luôn gồm stage, side, timeframe, BTC correlation, BTC phase, relation và gate.
- Score cao một mình không đủ để đánh giá tốt; ưu tiên AvgROE, PnL, profit factor, sample và BTC context.
- Với gate mới, metadata như tier, margin, hour, BTC phase và reason phải được ghi vào trade note/log.

### SL theo stage

| Stage | SL gốc mặc định |
|---|---:|
| Pre Breakout / Pre Breakdown chính xác, không phải runner | `-15% ROE` |
| Squeeze / Squeeze Short | `-15% ROE` |
| BR-like | `-20% ROE` |
| Runner, Breakout, Breakdown và EMA stage còn lại | `-30% ROE` |

EMA paper còn có profit trail riêng. Nhóm fast-giveback hiện có thể khóa `+1%` khi đạt `+5%` và khóa `+5%` khi đạt `+10%`; đây là logic EMA paper, không phải Decision Paper.

## 5. Squeeze Long

Gate: `EMA_SQUEEZE_PAPER_SQUEEZE_LONG_EVAL_GATE=true`.

### Nhóm A — `$10`

- `LONG 5m`.
- BTC là `DOWN_WEAK` hoặc `DOWN_STRONG`.
- Correlation yếu: `0.3 <= corr < 0.5`.

### Nhóm B — `$1`

- `LONG 15m`.
- BTC là `DOWN_WEAK`.
- Coin độc lập: `corr < 0.3`.

### WATCH/test `$1`

- Mọi combo Squeeze Long còn lại.
- Các giờ xấu `07, 08, 09, 14, 21, 23` luôn hạ về WATCH/test `$1`, kể cả ban đầu thuộc A/B.

## 6. Breakout và Breakdown

Gate: `EMA_SQUEEZE_PAPER_BREAK_STAGE_EVAL_GATE=true`.

### Breakout LONG

- Nhóm A `$10`: `5m + corr < 0.3 + BTC_UP_WEAK hoặc BTC_DOWN_WEAK`.
- Nhóm B `$1`: `15m + corr < 0.3 + BTC_DOWN_MID`.
- Combo còn lại: WATCH/test `$1`.
- Breakout market còn phải qua quality, EMA position, RR, BTC risk và chase gate hiện có.

### Breakdown SHORT

Nhóm A `$10` nếu thuộc một trong các trường hợp:

- `5m + corr 0.3-<0.5 + BTC_DOWN_MID`.
- `5m + corr <0.3 + BTC_UP_STRONG`.
- `5m + corr 0.3-<0.5 + BTC_DOWN_WEAK`.
- `15m + corr >=0.5 + BTC_DOWN_MID`.
- `5m + corr <0.3 + BTC_DOWN_STRONG`.

Combo Breakdown còn lại là WATCH/test `$1`.

## 7. Pre Breakout và Pre Breakdown

Gate: `EMA_SQUEEZE_PAPER_PRE_STAGE_EVAL_GATE=true`.

### Pre Breakout LONG

Nhóm A `$10`:

- `15m | rac | BTC_UP_STRONG`.
- `15m | yeu | BTC_UP_MID`.
- `5m | rac | BTC_UP_WEAK`.
- `5m | rac | BTC_DOWN_MID`.

Nhóm B `$1`:

- `5m | theo | BTC_UP_STRONG`.
- `5m | yeu | BTC_DOWN_MID`.
- `15m | yeu | BTC_UP_STRONG`.

Giờ block: `00, 03, 05, 11, 22`. Combo không nằm trong A/B cũng block.

### Pre Breakdown SHORT

Nhóm A `$10`:

- `5m | rac | BTC_DOWN_MID`.
- `15m | yeu | BTC_DOWN_MID`.
- `5m | theo | BTC_DOWN_MID`.
- `15m | rac | BTC_DOWN_STRONG`.
- `15m | rac | BTC_DOWN_MID`.

Nhóm B `$1`:

- `15m | yeu | BTC_UP_MID`.
- `15m | yeu | BTC_UP_WEAK`.
- `15m | yeu | BTC_DOWN_WEAK`.
- `5m | yeu | BTC_DOWN_MID`.
- `5m | yeu | BTC_UP_WEAK`.
- `5m | yeu | BTC_DOWN_WEAK`.
- `5m | yeu | BTC_DOWN_STRONG`.

Giờ block: `00, 04, 05, 06, 11, 17, 18`. Combo không nằm trong A/B cũng block.

### Entry và SL của Pre-stage

- Pre-stage đủ điều kiện được vào ngay bằng market/socket price mới, không chờ setup entry.
- SL gốc cứng `-15% ROE` cho lệnh Pre-stage chính xác.
- Runner phát sinh từ tín hiệu pre-stage không bị nhận nhầm SL 15%; Runner dùng rule/SL của Runner.

## 8. EMA Runner

Gate trung tâm: `EMA_SQUEEZE_PAPER_RUNNER_EVAL_GATE=true`.

Khi gate này bật, các gate Runner cũ như session test, bad-combo test, positive-combo size và BTC cluster không được quyền ghi đè quyết định mới. Runner đủ điều kiện vào market-only bằng giá socket mới.

### Combo SHORT tốt được phép dùng

- `15m | yeu | BTC_DOWN_STRONG`.
- `15m | theo | BTC_DOWN_WEAK`.
- `15m | yeu | BTC_DOWN_MID`.
- `15m | yeu | BTC_UP_MID`.
- `15m | theo | BTC_DOWN_MID`.
- `5m | theo | BTC_DOWN_MID`.
- `5m | rac | BTC_DOWN_MID`.

### Combo LONG tốt được phép dùng

- `15m | rac | BTC_UP_STRONG`.
- `5m | theo | BTC_UP_STRONG`.
- `5m | rac | BTC_DOWN_MID`.

### Nhóm A — `$10`

- SHORT lúc `08h`: BTC phải `DOWN_MID` hoặc `DOWN_STRONG`; khung `15m` là A.
- LONG lúc `06h`: khung `15m` là A, miễn không rơi vào tương quan cao ngược BTC.

### Nhóm B — `$1`

- SHORT lúc `08h`, khung `5m`, nhưng phải thuộc combo SHORT tốt.
- SHORT lúc `00h, 13h, 14h, 23h`, phải thuộc combo SHORT tốt.
- LONG lúc `06h`, khung `5m`, phải thuộc combo LONG tốt.
- LONG lúc `05h hoặc 20h`, phải thuộc combo LONG tốt.

### Block

- Runner ngoài các giờ/nhóm trên.
- Correlation `theo` nhưng side ngược hướng BTC:
  - LONG khi BTC DOWN.
  - SHORT khi BTC UP.
- SHORT `BTC_UP_WEAK + corr theo`.
- Thiếu BTC phase/correlation đủ để khớp rule.

Dashboard combo hiển thị kế hoạch theo **giờ hiện tại**: `FULL $10`, `TEST $1` hoặc `BLOCK`.

## 9. Squeeze Short

- Squeeze Short dùng nhánh BR-like rules riêng và margin mặc định `$10`.
- SL gốc `-15% ROE`.
- Có partial TP: chốt `50%` tại `+5% ROE`.
- Phần còn lại đưa SL về entry; target runner thường `+10%`, hoặc `+15%` cho 15m/BTC đang đi xuống theo cấu hình.
- Không dùng bảng giờ Runner để quyết định Squeeze Short; đây là hai stage riêng.

## 9A. BR-like Market V2

Gate trung tâm: `EMA_SQUEEZE_PAPER_BR_LIKE_EVAL_GATE=true`.

Version log: `BR_LIKE_EVAL_V2_2026_07_20`. Rule chỉ áp BR-like market; không áp lên Squeeze clone và không thay đổi `/br-like-limit`.

### BR-like LONG

- Không có tier A.
- Tier B `$1`: `5m|yeu|down_mid`, `15m|rac|down_weak`, `15m|theo|down_weak`, `15m|rac|up_mid`.
- Combo khác hoặc thiếu BTC phase/correlation: BLOCK.

### BR-like SHORT

- Giờ tốt Bangkok: `03, 08, 14, 17, 21`.
- 5m chỉ vào B `$1` khi combo là `up_mid + theo/yeu` và đồng thời đúng giờ tốt.
- Combo 15m tốt: `down_strong + yeu`, `down_strong + rac`, `up_mid + rac`.
- 15m combo tốt + giờ tốt: A `$10`.
- 15m chỉ khớp combo tốt hoặc chỉ khớp giờ tốt: B `$1`.
- Hard BLOCK: `5m|rac|up_mid`, `5m|rac|down_mid`, `5m|yeu|down_strong`, `15m|theo|up_weak`.
- 5m/15m còn lại và khung khác: BLOCK.

Mỗi lệnh mới ghi `brEvalTier/Label/Reason/Version/Margin/Hour/CorrBucket/BtcPhase`; nhãn nến cũ chỉ là feature, không nâng tier.

## 10. Checklist khi sửa rule sau này

1. Thống kê riêng theo stage, side, timeframe, BTC phase, corr bucket và giờ Bangkok.
2. Không chọn combo chỉ vì WR cao; kiểm tra AvgROE, PnL, PF, tail loss và số ngày dương.
3. Xác định rõ kết quả cần là `A/$10`, `B/$1`, `WATCH` hay `BLOCK`.
4. Ghi label, reason, tier, margin và hour vào paper log.
5. Không sửa hồi tố lệnh lịch sử hoặc tự đóng lệnh đang mở nếu người dùng không yêu cầu.
6. Kiểm tra market entry thật sự đến từ socket và tick chưa stale.
7. Chạy `node --check`, test rule matrix, restart PM2 và xác nhận socket kết nối.
8. Cập nhật file này cùng lúc với code để tài liệu không lệch logic.

### Thanh cuộn ngang trên paper table

- Các paper table rộng dùng helper chung `public/paper-top-scroll.js`.
- Container gắn `data-paper-scroll`; helper tự tạo thanh cuộn ngay phía trên
  bảng và đồng bộ hai chiều với thanh cuộn thật phía dưới.
- Thanh trên tự ẩn khi bảng không tràn ngang và tự cập nhật khi socket làm thay
  đổi chiều rộng nội dung; helper không quét lại toàn bộ DOM theo từng row update.
- EMA Squeeze và Shakeout tiếp tục dùng thanh cuộn trên chuyên biệt sẵn có để
  không tạo hai thanh trùng nhau.

## 11. Vị trí code chính

- Decision Paper manager: `src/intradayDecisionPaper.js`.
- Decision Paper UI: `public/decision-paper.js`, `public/decision-paper.html`.
- EMA evaluation gates, sizing, entry và paper manager: `src/server.js`.
- Recommended Signals/Paper: `src/recommendedSignals.js`.
- Cấu hình mẫu: `.env.example`.
- Tài liệu lịch sử chi tiết: `docs/CODEX_TRADING_LOGIC.md`.

### Signal Picks event-driven entry (V3)

- Paper mới không còn được tạo bằng cách quét lại file nguồn khi trang/API được mở. `syncDay()` chỉ còn đồng bộ metadata và lịch sử; `RECOMMENDED_LEGACY_SYNC_CREATE=false` mặc định cấm tạo clone mới từ cache.
- Ngay sau khi EMA/Pump/Liquid/Edge paper chuyển sang `OPEN`, server gọi trực tiếp `processRecommendedSourceOpenEvent()` theo kiểu fire-and-forget; lỗi Recommended không làm hỏng logic paper nguồn.
- Pending trade chỉ phát event khi socket thực sự fill. Event mang giá market/fill và timestamp của chính lần mở đó.
- Entry Recommended được tính lại từ giá event, không sao chép entry cũ. Log V3 lưu `sourceEntryPrice`, `entryPrice`, `entryVsSourcePct`, `adverseChasePct`, `sourceEventAt`, `sourceEventLatencyMs`, `marketEntryAt` và `marketEntrySource`.
- Gate mặc định: source event tối đa `10s`, tick market tối đa `5s`, adverse chase tối đa `0.15%`, Breakout/Breakdown tối đa `2` nến.
- Dedup theo `sourcePage + sourceTradeId`; một lần OPEN nguồn chỉ tạo tối đa một Recommended paper.
- Python flag đang có trong cache được chụp vào `recommendedLearningFlag` để audit, chưa thay đổi quyết định entry của source paper.

## 12. Báo cáo BR-like gần nhất

- Phân tích BR-like LONG/SHORT 7 ngày Bangkok: `docs/BR_LIKE_ANALYSIS_2026-07-20.md`.
- Script chạy lại: `scripts/analyze-br-like-performance.js`.
- Rule từ báo cáo đã được áp bằng version `BR_LIKE_EVAL_V2_2026_07_20`.

## 13. Báo cáo Pump native gần nhất

- Phân tích Pump LONG/SHORT native 7 ngày Bangkok: `docs/PUMP_ANALYSIS_2026-07-20.md`.
- Script chạy lại: `scripts/analyze-pump-performance.js` hoặc `npm run analyze:pump -- --days 7 --to 2026-07-20`.
- Báo cáo loại toàn bộ source `emasq-*` để không trộn clone EMA vào mẫu Pump.
- Rule đã áp với version `PUMP_EVAL_V1_2026_07_20`: chỉ các combo được whitelist vào B/$1, chưa có A; các nhóm còn lại BLOCK.
- Pump native mới có hard cap SL 15% ROE, nhưng vẫn giữ structure SL nếu mức đó chặt hơn.
- Metadata `pumpEval*` và hard-SL được lưu trên từng paper mới; Decision Paper cũng dùng cùng gate cho candidate nguồn Pump.

## 14. Liquid Scan Stage 2 (observe-only, 2026-07-22)

`Liquid Stage 2` là lớp phân loại để thống kê trên `/liquid-scan`, không thay đổi entry, margin hay logic quản lý lệnh hiện tại.

- `A+`: `SHORT + btcCorr >= 0.50`, target là `LOCAL_SWEEP`, khoảng cách sweep `< 2%`.
- `A`: cùng cohort SHORT/correlation, khoảng cách `< 2%`, nhưng target không phải local sweep.
- `WATCH`: ngoài cohort trên hoặc target thuộc `MAIN_ZONE`.
- `RISK`: thuộc cohort trên nhưng khoảng cách sweep `>= 2%`.
- Lệnh cũ được suy ra nhãn từ snapshot/entry plan đã lưu để thống kê; không ghi đè kết quả hay size lịch sử.
- Khối thống kê riêng hiển thị tổng lệnh, mở/đóng, WR, W/L, AvgROE và Net PnL cho từng nhãn; filter ngày của Liquid Paper áp dụng đồng thời cho thống kê này.

Code chính: `src/liquidScanEvalRule.js`, `src/server.js`, `public/liquid-scan.js`, `public/liquid-scan.html`.

### Liquid Combo Stage 3 V3 LONG observe-only (2026-07-24)

Stage 3 gắn nhãn `GOOD+ / GOOD / WATCH / RISK` sau Stage 2 bằng snapshot tại entry. Stage 3 không đổi entry, leverage, SL hoặc TP. Riêng `GOOD+` được dùng làm size gate paper `$10`; các nhãn còn lại giữ size từ rule trước.

Combo key lưu các thành phần: `side | target kind | distance bucket | BTC correlation | BTC phase | one-sided | feasibility | RR | nến coin | nến BTC`.

- `GOOD+`: Stage 2 đạt, SHORT corr theo, khoảng cách `1-2%`, one-sided `50-89%`, feasibility `<50`, RR `<0.5`; lệnh mới dùng cap `$10` qua `LIQUID_SCAN_STAGE3_GOOD_PLUS_MARGIN_USDT=10`.
- `GOOD`: Stage 2 đạt và thuộc `SHORT corr theo + 1-2%`, `SHORT + BTC_DOWN_WEAK`, hoặc cấu trúc one-sided/feasibility/RR tốt.
- `WATCH`: ngoài cohort, hoặc Stage 2 đạt nhưng one-sided `>=90%`, feasibility `>=50`, RR `>=0.5`; `LONG + BTC_DOWN_MID + dist <1%` cũng chỉ giữ WATCH vì hiệu quả mẫu mới suy giảm.
- `RISK`: khoảng cách `2-5%`, target `FAR_ZONE`, Stage 2 RISK, hoặc Stage 2 đạt nhưng nến coin là `BEARISH_MARUBOZU`.
- Mẫu nến chỉ được dùng làm modifier hạ hạng trong cohort đã kiểm chứng; mẫu nến riêng lẻ không được tự nâng GOOD.
- Nhánh LONG được đánh giá độc lập với Stage 2 SHORT-only. Ba cohort LONG `GOOD` observe-only:
  - `EXHAUSTION + BTC_DOWN_MID + dist <1% + corr độc lập + one-sided 50-89% + feasibility <50 + RR >=1`.
  - `LOCAL_SWEEP + BTC_DOWN_WEAK + dist 1-2% + corr độc lập + one-sided >=50% + feasibility 50-69 + RR >=1`.
  - `LOCAL_SWEEP + BTC_DOWN_MID + dist <1% + corr độc lập + one-sided >=90% + feasibility <50 + RR >=1`.
- `LONG MAIN_ZONE` và một số `LONG LOCAL + BTC_DOWN_MID` có hiệu quả dương nhưng biên lịch sử còn mỏng nên chỉ nhận `WATCH+`.
- Mẫu chronological tương thích 2026-07-23..24 của ba cohort LONG GOOD: 38 lệnh đóng, 36 thắng (WR net 94,7%), PnL net đóng +3,075 sau phí dự tính. Nhãn LONG không được cấp `GOOD+`, không nâng size và không thay đổi entry/SL/TP.
- Chỉ dữ liệu phát sinh từ `2026-07-23T00:00:00Z` trở đi được xét cohort LONG V3. Lệnh cũ hơn nhận `WATCH · LONG PRE-V3 DATA` để snapshot BTC/target trước khi hiệu chỉnh schema không làm sai card LONG GOOD.
- Thống kê Stage 3 trên giao diện được tách riêng LONG/SHORT. Snapshot V2 cũ được suy lại V3 ở response để đánh giá nhưng không ghi đè log, size hoặc kết quả lịch sử; phiên bản gốc vẫn được trả ở `liquidStage3RecordedTier/Version`.
- Lệnh mới lưu `liquidStage3Tier/Code/Label/Reason/ComboKey/Version`, `liquidStage3TargetMarginUsdt`, `liquidStage3MarginCapUsdt` và `liquidStage3SizeApplied`; lệnh cũ được suy ra để hiển thị mà không sửa size hoặc kết quả lịch sử.

Rule version: `LIQUID_COMBO_STAGE_3_V3_LONG_OBSERVE_20260724`.

### Liquid Stage 4B · BTC Wave State (observe-only)

Lớp phụ này tách trạng thái sóng BTC tại đúng snapshot entry cho các lệnh Liquid
Stage 3 `GOOD/GOOD+`. Nhãn gồm `CONTINUATION`, `EXHAUSTED`, `TRANSITION` và
`NO_DATA`; không thay đổi Stage 3/Stage 4 hiện tại và không gate, chặn, đổi entry,
margin, leverage, SL hoặc TP.

- `CONTINUATION`: direction, EMA1h và regime đã xác nhận; động lượng/flow chưa có
  dấu hiệu cuối sóng theo snapshot.
- `EXHAUSTED`: cycle vẫn được xác nhận nhưng `pct6h`, RSI1h, trend score hoặc OBV
  cho thấy động lượng chững, quá mua/quá bán hay phân kỳ dòng tiền.
- `TRANSITION`: direction, EMA1h và market regime chưa đồng thuận.
- `NO_DATA`: thiếu một trong các chiều bắt buộc; không tự suy đoán nhãn.
- Lệnh mới lưu riêng direction, score, regime, EMA1h, pct6h/pct24h, RSI1h, OBV,
  momentum, flow, nến BTC và danh sách field thiếu. Lệnh lịch sử chỉ derive từ
  snapshot đã lưu, không ghi ngược paper store.

Rule version: `LIQUID_BTC_WAVE_STATE_V1_20260727`.

### Liquid LONG Reversal labels (observe-only)

Bốn nhãn LONG độc lập được suy từ snapshot trước entry và có thể cùng xuất hiện:

- `LONG CORE · CAPITULATION`: nến coin thuộc nhóm bán
  (`BEARISH_*` hoặc `SHOOTING_STAR`) và target là `EXHAUSTION`.
- `LONG TEST · CONTROLLED SELL`: BTC `pct6h` trong `[-0.50%, -0.15%)` và
  trend score trong `[35, 50)`.
- `LONG EDGE · DECOUPLED REBOUND`: BTC dưới EMA1h nhưng correlation coin/BTC
  nhỏ hơn `-0.30`.
- `LONG EDGE · BTC ABSORPTION`: nến BTC là `DOJI`, `HAMMER` hoặc `*_PIN_BAR`
  và `abs(pct6h) <= 0.15%`.
- SHORT hiển thị `LONG · N/A`; LONG không khớp hiển thị `LONG · NO EDGE`.
- Lệnh lịch sử được derive từ snapshot đã lưu; lệnh mới lưu cả bốn cờ matched,
  chiều đầu vào và version. Nhãn không gate, chặn, đổi size, SL hoặc TP.
- Giao diện thống kê từng cơ chế độc lập theo lịch sử, 5 ngày gần nhất và số
  ngày có PnL dương; một lệnh khớp nhiều cơ chế được tính riêng trong từng cohort.

Rule version: `LIQUID_LONG_REVERSAL_V2_4_MECHANISMS_20260727`.

### Liquid LONG Market State (observe-only)

Lớp đánh giá hướng LONG độc lập được chụp tại thời điểm entry và chia thành sáu
trạng thái. Lớp này dùng direction, EMA1h, market regime, pct6h/pct24h, RSI1h,
OBV và nến BTC đã lưu; không dùng kết quả PnL tương lai để gắn nhãn.

- `LONG TAILWIND`: BTC tăng, EMA1h/regime/OBV đồng thuận và động lượng chưa quá nóng.
- `LONG RECLAIM`: cấu trúc giảm còn lưu dấu nhưng pct6h, OBV và nến BTC cùng xác nhận đảo chiều.
- `LONG LATE`: cấu trúc tăng còn hiệu lực nhưng RSI cao, pct6h chậm hoặc OBV không còn xác nhận.
- `LONG HEADWIND`: cấu trúc giảm được xác nhận và chưa có reclaim, bất lợi cho LONG.
- `LONG TRANSITION`: các chiều direction, EMA1h và regime chưa đủ đồng thuận.
- `LONG NO DATA`: thiếu một hay nhiều chiều bắt buộc; không tự suy đoán nhãn.

Thống kê trên giao diện gom toàn bộ lịch sử và cửa sổ 5 ngày gần nhất, đồng thời
hiển thị nhãn trong cả bảng paper đang mở và đã đóng. Lệnh lịch sử chỉ được derive
từ snapshot entry đã lưu; lệnh mới lưu nhãn và toàn bộ chiều đầu vào. Nhãn không
gate/chặn lệnh và không thay đổi entry, margin, leverage, SL hay TP.

Rule version: `LIQUID_LONG_MARKET_STATE_V1_20260727`.

### Liquid LONG Session Health (causal observe-only)

Lớp này đánh giá sức khỏe chung của toàn bộ lệnh LONG trong từng ngày, độc lập
với nhãn setup. Tại thời điểm entry, nó chỉ đọc các lệnh LONG đã `CLOSED` trước
entry trong cùng ngày; không dùng kết quả hiện tại hoặc tương lai. Trạng thái
được reset khi sang ngày mới.

- `WARMUP`: chưa đủ 20 lệnh LONG đóng trước entry.
- `HEALTHY`: đủ mẫu, `PF >= 1.10` và `AvgROE > 0`.
- `BREAKDOWN`: đủ mẫu và `PF <= 0.80` hoặc `AvgROE <= -2%`.
- `WATCH`: đủ mẫu nhưng chưa đạt HEALTHY/BREAKDOWN.
- `NO_DATA`: thiếu timestamp entry để dựng lịch sử causal.

Giao diện thống kê PnL, WR, PF, AvgROE, active PnL, cửa sổ 5 ngày và độ ổn định
theo ngày cho từng trạng thái. Nhãn chỉ quan sát, không gate/chặn và không thay
đổi entry, margin, leverage, SL hay TP.

Rule version: `LIQUID_LONG_SESSION_HEALTH_V1_20260728`.

### Liquid Stage 4 · Cycle Edge (causal observe-only)

Stage 4 không thay thế nhãn cấu trúc Stage 3. Lớp này chỉ đánh giá xem edge
`GOOD/GOOD+` của từng cohort đang hoạt động, suy giảm hay phục hồi trong chu kỳ
hiện tại. Không chặn lệnh và không đổi entry, margin, leverage, SL, TP hoặc
trailing.

- Cohort theo thứ tự ưu tiên:
  `side + Stage 3 tier/code + target kind + BTC cycle + structure`,
  sau đó fallback dần về branch và `side + Stage 3 tier` khi exact còn thưa.
- BTC cycle gồm `BTC_DOWN_CONFIRMED`, `BTC_UP_CONFIRMED` và
  `BTC_TRANSITION_CHOP`; `LONG LOCAL WEAK` tách thêm bucket one-sided.
- PnL được chuẩn hóa thành Net ROE và chặn mỗi lệnh trong `[-25%, +25%]`.
- Các tín hiệu cùng cohort trong 15 phút được gộp thành một episode để một đợt
  quét nhiều coin không làm phồng độ tin cậy.
- Chỉ outcome đã đóng trước entry hiện tại được dùng. Cần tối thiểu 8 lệnh đóng,
  4 episode và 2 ngày độc lập trước khi rời trạng thái `NEW`.
- `ACTIVE`: edge tổng và walk-forward gần nhất cùng dương.
- `FADED`: edge cũ từng tốt nhưng 8 episode gần nhất hoặc pulse 4 episode có
  PF/Avg Net ROE suy giảm, hoặc cohort đủ mẫu đã âm.
- `RECOVERY`: cohort đang suy giảm nhưng 3 episode mới nhất phục hồi, hoặc cửa
  sổ gần nhất dương trong khi nền dài hơn chưa đủ ổn định.
- `NEW`: chưa đủ bằng chứng causal.

Lệnh mới lưu snapshot `liquidStage4Tier/Code/Label/Reason/CohortKey`,
cycle family, metric history/recent, basis và version. Lệnh lịch sử được backfill
theo đúng timeline `closedAt < entryAt`; không đọc outcome tương lai và không ghi
ngược paper store. Giao diện hiển thị badge, filter và thống kê LONG/SHORT riêng;
thống kê dùng toàn bộ dataset của ngày đang chọn, không phụ thuộc số dòng render.

Rule version: `LIQUID_CYCLE_EDGE_V1_20260726`.

### Liquid Runner 30 Candidate (pre-entry, observe-only)

Nhãn `RUNNER 30 · CANDIDATE` được quyết định tại snapshot trước entry, không
đọc PnL, ROE thực tế, peak ROE, outcome hoặc trạng thái sau đó. Gate hiện tại:

- `SHORT`.
- Target được xác định là `LOCAL_SWEEP`.
- ROE tại TP theo kế hoạch `((entry - TP) / entry) × leverage × 100 >= 30%`.

Chưa gắn nhãn cho LONG vì chưa tìm thấy gate ổn định qua các đoạn thời gian.
Nhãn chỉ phục vụ quan sát và thống kê cohort; không lọc, block, đổi entry, size,
leverage, SL, TP hoặc trailing. PnL/Net ROE sau khi lệnh đóng chỉ được dùng để
đánh giá nhãn, trong đó hit là `Net ROE >= 30%`, không được dùng làm input để
gắn nhãn.

Lệnh mới lưu snapshot `liquidRunner30Matched/Label/Reason/PlannedTpRoe/TargetKind/Version`.
Lệnh lịch sử được suy nhãn từ snapshot entry khi đọc API và không bị ghi lại.

Rule version: `LIQUID_RUNNER_30_V1_20260724`.

### Liquid Runner Direction Edge (pre-entry, observe-only)

Lớp mới đánh giá riêng LONG/SHORT cho các setup có `LOCAL_SWEEP` và TP kế hoạch
`>= 30% ROE`. Lớp này không thay thế nhãn Runner 30 cũ và không tác động gate,
entry, margin, leverage, SL, TP hoặc trailing.

- Reachability: `REACH_30_45`, `REACH_45_60`; TP kế hoạch `>=60%` được đánh dấu
  `STRETCHED`.
- Hướng BTC dùng correlation có dấu:
  `sideSign × btcDirectionSign × btcCorr`, sau đó chia
  `ALIGNED_STRONG / ALIGNED_WEAK / INDEPENDENT / COUNTER_WEAK / COUNTER_STRONG`.
  Các nhóm này là cohort thống kê, không mặc định aligned luôn tốt.
- Nến coin tại entry được chia `CANDLE_ALIGNED / CANDLE_COUNTER / CANDLE_NEUTRAL`.
- Cohort causal gồm hướng lệnh, reach bucket, chu kỳ BTC, quan hệ correlation có dấu
  và nến coin. Khi thiếu mẫu, evaluator fallback dần về cohort rộng hơn nhưng vẫn
  giữ LONG/SHORT riêng.
- Tín hiệu cùng cohort trong 15 phút được gộp thành episode. Chỉ outcome có
  `closedAt < entryAt` mới được đọc; tối thiểu 12 lệnh đóng, 4 episode và 2 ngày.
- `PRIME`: hit-rate `>=12%`, PF `>=1.05`, Avg Net ROE dương và cửa sổ gần nhất
  vẫn xác nhận.
- `FADED`: hit-rate gần nhất `<8%`, PF `<0.90` hoặc Avg Net ROE âm.
- `RECOVERY`: 3 episode mới nhất phục hồi sau giai đoạn suy giảm.
- `WATCH`: đủ mẫu nhưng bằng chứng chưa rõ; `NEW`: chưa đủ mẫu.
- `STRETCHED`: TP dự kiến `>=60% ROE`, chỉ cảnh báo độ xa của mục tiêu.

Thống kê hiển thị riêng theo `LONG/SHORT × Runner Direction tier`, gồm tổng đóng,
PnL đóng, PnL active, hit `Net ROE >=30%`, WR, PF, AvgROE và snapshot/backfill.
Thống kê dùng toàn bộ dataset của ngày đang chọn, không phụ thuộc số dòng bảng render.

Rule version: `LIQUID_RUNNER_DIRECTION_V1_20260726`.

### Liquid Paper realtime: active socket delta

- Lịch sử closed và các khối thống kê chỉ được tải/tính khi mở trang hoặc đổi
  bộ lọc ngày.
- SSE không gọi lại full `getLiquidPaperTrades()` theo tick. Snapshot kết nối
  chỉ gồm lệnh active và closed mới gần đây; các tick sau chỉ gửi mark theo
  symbol cùng trade lifecycle vừa thay đổi.
- Client merge mark vào lệnh active và tính lại Gross/Net PnL, ROE cùng phí từ
  snapshot entry; không render lại bảng/stat closed theo từng tick.
- Broadcast có khóa in-flight và coalesce tick. Khi socket HTTP gặp
  backpressure, server bỏ snapshot trung gian và gửi trạng thái mới nhất sau
  `drain`, không chất payload lịch sử trong RAM.
- Fill pending, TP, SL và progressive trailing vẫn được xử lý server-side trực
  tiếp từ shared Binance last-price socket; thay đổi này chỉ tách đường hiển thị
  realtime khỏi đường thống kê lịch sử.

## 15. Shakeout Stage 2 V2 hai lớp (observe-only, 2026-07-23)

Version: `SHAKEOUT_STAGE_2_V2_TWO_LAYER`. Nhãn chỉ phục vụ quan sát, filter và thống kê; không BLOCK entry, không sửa SL/TP và không đổi kết quả lịch sử.

### Lớp 1: môi trường Side × BTC

`shakeoutSideCandleTier` (`GOOD / WATCH / RISK`) là kết luận môi trường chính. Stage 2 không được bỏ qua hoặc suy ngược lớp này từ kết quả lệnh. Dữ liệu cũ không có snapshot lớp 1 hiển thị `NO L1 DATA`, không được tự gắn `RISK`.

### Lớp 2: setup + variant + chất lượng fill

Lớp 2 chỉ được nâng/hạ từ lớp 1 bằng ba nhóm dữ liệu tại entry/fill:

- `setup`: `WEAK_REJECT`, `FALSE_RECLAIM`, `CLEAN_REJECT`, `WEAK_RECLAIM`...
- `variant`: `MARKET`, `PENDING`, `CHASE`.
- `fillQuality`: `PENDING_FAST` (`<=15m`), `PENDING_NORMAL` (`<=45m`), `PENDING_LATE` (`>45m`), `PENDING_WAIT`, `MARKET`, `CHASE`.

Rule thử nghiệm hiện tại:

- L1 `RISK` giữ `RISK`.
- L1 `GOOD` + `FALSE_RECLAIM/CLEAN_REJECT` hạ thành `RISK`.
- L1 `GOOD` + PENDING đã fill trong `<=45m` nâng thành `WATCH+`; trường hợp còn lại giữ `WATCH`.
- L1 `WATCH` + PENDING đã fill hoặc `WEAK_RECLAIM` hạ thành `RISK`; PENDING chưa fill vẫn giữ `WATCH`.
- Chưa cấp nhãn `GOOD` ở lớp 2 vì mẫu hậu hiệu chỉnh còn ngắn.

### Cờ audit

Các cờ sau vẫn được chụp vào log nhưng tuyệt đối không tham gia bỏ phiếu nhãn:

- `DUPLICATE_ACTIVE`
- `BTC_CANDLE_CONFLICT`
- `STALE_FILL`
- `DRIFT_RISK`

Một hay nhiều cờ audit không thể tự biến lệnh thành `RISK`. Giao diện hiển thị chúng ở dòng `AUDIT` tách khỏi nhãn hai lớp.

Paper mới lưu `shakeoutStage2Layer1Tier`, `shakeoutStage2Setup`, `shakeoutStage2Variant`, `shakeoutStage2FillQuality`, `shakeoutStage2Modifier`, `shakeoutStage2Code` và `shakeoutStage2AuditOnlyFlags=true`. Dữ liệu đã có snapshot L1 được render lại theo V2 nhưng không ghi đè store; cờ không được thu thập lúc entry sẽ không bị bịa lại bằng hindsight.

Khối thống kê Stage 2 gồm ba tầng: tổng hợp theo nhãn L2; chi tiết từng tổ hợp `L1 × setup × variant × fillQuality`; và bảng riêng cho từng cờ audit. Mỗi dòng có tổng lệnh, open/pending, closed, W/L, WR, Net PnL và Avg ROE. Lệnh thiếu snapshot L1 không tham gia các bảng này.

PENDING vẫn bị hard-cap shadow `$1` qua `SHAKEOUT_RECLAIM_PENDING_SHADOW_MARGIN_CAP_USDT=1`; đây là rule size riêng, không phải kết quả của nhãn Stage 2.

Code chính: `src/shakeoutStage2Rule.js`, `src/server.js`, `public/shakeout-reclaim.js`, `public/shakeout-reclaim.html`.

### Shakeout Context Observation V1

Version `SHAKEOUT_CONTEXT_OBS_V1_20260726` là lớp thu thập dữ liệu trước/đúng
lúc entry, tương tự cách Liquid Scan giữ `entryPlan` và combo context. Lớp này
không cấp `GOOD/RISK`, không tham gia gate và không thay đổi margin, leverage,
entry, SL, TP, trailing hoặc lệnh Binance.

Snapshot mới lưu ba lớp:

- L1 cấu trúc tín hiệu: setup, side, stage, score, timeframe, move 5m/15m,
  volume 5m/15m, độ reclaim/reject, wick, RSI, khoảng cách EMA và tuổi pullback.
- L2 execution: MARKET/PENDING/CHASE, entry mode, khoảng cách entry, risk,
  reward, RR và projected TP ROE.
- L3 market context: BTC phase/regime, correlation/beta, thanh khoản 24h,
  nến coin/BTC và các bucket volume/reclaim/wick.

`FULL / PARTIAL / LEGACY` chỉ mô tả độ phủ dữ liệu. PENDING giữ snapshot signal
và khi fill sẽ chụp thêm context entry mà không dùng outcome tương lai. UI thống
kê coverage, từng lớp và ma trận ba lớp; ma trận chỉ hiện cohort `FULL`.

Python `CANDLE_WALK_FORWARD_V3_CONTEXT` ưu tiên cohort context khi đủ `FULL`,
nhưng vẫn chấm causal: một paper chỉ nhìn các outcome đã đóng trước entry của
nó. Python là sidecar read-only và không ghi paper store.

Code chính: `src/shakeoutObservation.js`, `scripts/shakeout_self_learning.py`,
`src/server.js`, `public/shakeout-reclaim.js`.

## 16. Pump Combo Stage 2 (observe-only, 2026-07-23)

Pump Stage 2 là lớp đánh giá hậu kiểm riêng trên `/pump`. Nó không thay thế
`PUMP_EVAL_V1_2026_07_20` và tuyệt đối không thay đổi entry, margin, leverage,
SL hoặc TP. Mẫu post-rule mới chưa có cohort ổn định đủ để cấp `GOOD`, nên chỉ
có ba nhãn `WATCH+`, `WATCH`, `RISK`.

- `WATCH+ · CANDLE EDGE`: EMA Pullback LONG + nến coin `BEARISH_CANDLE` + nến
  BTC `BEARISH_MARUBOZU`. Mẫu hiện tại dương 3/3 ngày nhưng còn ngắn, chưa được
  nâng thành GOOD.
- `RISK · CANDLE CONFLICT`: EMA Pullback LONG + coin
  `BEARISH_ENGULFING` + BTC `BEARISH_CANDLE`.
- `RISK · CANDLE DIVERGENCE`: EMA Pullback LONG + coin `BEARISH_CANDLE` trong
  khi BTC là `BULLISH_CANDLE` hoặc `BULLISH_MARUBOZU`.
- `RISK · PULLBACK DECAY`: EMA Pullback LONG, score 80-89, volume 2-5x,
  chase < 0.3.
- `RISK · BTC DOWN WEAK`: EMA Pullback LONG, BTC_DOWN_WEAK và correlation
  thuộc THEO/THEO_YEU.
- `RISK · EARLY DUMP`: Early Dump SHORT, score 75-79, volume 2-5x,
  chase < 0.3.
- `WATCH · DUMP DRIFT`: Dump SHORT score 90+, volume 2-5x; cohort cũ dương
  nhưng mẫu mới chuyển âm.
- `WATCH · BREAKOUT TEST`: Pump Breakout LONG score 80-89, volume 2-5x; gần
  hòa nhưng số mẫu còn thấp.
- Tất cả trường hợp còn lại: `WATCH · NO STABLE EDGE`.

Lệnh Pump native mới lưu snapshot `pumpStage2Tier/Code/Label/Reason/ContextKey/Version`.
Lệnh cũ chỉ được suy ra khi đọc API và được đánh dấu `pumpStage2Derived`; không
ghi đè kết quả lịch sử. UI có filter, sort và thống kê riêng cho Stage 2.

Rule version: `PUMP_COMBO_STAGE_2_V1_20260723`.

### Pump Lift L2 (observe-only)

`Pump Lift L2` không phải bộ lọc entry thứ ba. Nó so hiệu quả của một cohort
Stage 2 với chính combo cha Stage 1 (`pumpEvalLabel + side + timeframe + size`)
trên 5 ngày UTC đã đóng trước ngày tín hiệu:

- `BOOST`: tối thiểu 30 lệnh/3 ngày, Net PnL dương, PF >= 1.15, Avg Net ROE
  cao hơn combo cha ít nhất 0.5% và dương tối thiểu 60% số ngày.
- `DEGRADE`: tối thiểu 30 lệnh/3 ngày, Net PnL âm, PF < 0.85, Avg Net ROE
  thấp hơn combo cha ít nhất 0.5% và âm tối thiểu 60% số ngày.
- `NEUTRAL`: đang gom mẫu hoặc hiệu quả không ổn định.

Nhãn `BOOTSTRAP` còn dùng dữ liệu Stage 2 suy ra từ lịch sử và chỉ có giá trị
quan sát. Khi cohort có tối thiểu 30 lệnh đã chụp Stage 2 tại entry, nhãn chuyển
sang cơ sở `OOS`. Chỉ `OOS` mới được đánh dấu đủ bằng chứng, nhưng phiên bản
hiện tại vẫn không thay đổi entry, margin, leverage, SL hay TP.

Paper Pump mới lưu snapshot `pumpLiftTier/Label/Code/Basis/Reason/Version`,
cohort key và các metric tại entry. UI có cột, sort, filter và khối thống kê
riêng cho `BOOST / NEUTRAL / DEGRADE`.

Rule version: `PUMP_LIFT_OBSERVE_V1_20260723`.

### Pump Combo Selector (observe-only)

`Combo Selector` thay cách nhìn “combo con phải thắng combo cha” bằng đánh giá
edge tuyệt đối sau phí. Lớp này phủ toàn bộ Pump Paper, gồm cả EMA clone và Pump
native, nhưng tách riêng từng source family để không trộn hai phân phối khác nhau.

- Khóa chính: source family + size + combo đầy đủ.
- Fallback khi mẫu thưa: stage/type + side + timeframe + BTC phase, sau đó mới
  về source family + side + timeframe.
- Chỉ dùng lệnh đã đóng trước ngày tín hiệu trong các cửa sổ 1/3/7 ngày UTC.
- ROE được trừ phí dự tính và chặn mỗi mẫu trong `[-20%, +20%]` để một runner
  cực đoan không tự tạo nhãn tốt.
- Mẫu nến chỉ cộng/trừ tối đa `0.15%` vào expected edge; không thể tự tạo `CORE`.
- `CORE`: tối thiểu 12 mẫu exact, ít nhất hai cửa sổ dương, PF >= 1.10, biên bảo
  thủ vẫn dương, SL rate < 50% và không xung đột 1d/7d.
- `PROBE`: edge dương nhưng mẫu nhỏ hoặc độ ổn định chưa đủ để lên `CORE`.
- `WATCH`: bằng chứng lẫn lộn/chưa đủ.
- `AVOID`: tối thiểu 8 mẫu exact, edge âm, PF < 0.90 và được xác nhận bởi hai
  cửa sổ âm hoặc SL rate >= 50%.

Lệnh mới lưu snapshot tại entry với basis `SNAPSHOT`; lệnh cũ chỉ nhận nhãn
`BACKFILL` lúc đọc để quan sát, không sửa log gốc. UI có filter, sort, thống kê
và cột riêng. Phiên bản này tuyệt đối không thay đổi entry, size, leverage, SL
hoặc TP.

Từ V2, `CORE` và `AVOID` còn bắt buộc cohort exact phải trải trên tối thiểu
3 ngày độc lập, trong đó ít nhất 2 ngày cùng chiều với kết luận. Không được xem
ba cửa sổ lồng nhau 1d/3d/7d là ba xác nhận nếu toàn bộ mẫu chỉ đến từ một ngày.
Thống kê UI của Selector dùng Net PnL/Net ROE sau phí và hiển thị thêm Net/trade,
Gross cùng phí dự tính để không so sai hai nhóm có số lệnh rất khác nhau.

Rule version: `PUMP_COMBO_SELECTOR_OBSERVE_V2_20260723`.

### Short Edge L3 · SE BEST (observe-only)

`SE BEST` chỉ xét các lệnh Short Edge đã mang Tier `A` hoặc `B`. Nhãn được khóa
theo ngày UTC và chỉ dùng các lệnh cùng cohort `Tier × setup` đã đóng trước đầu
ngày tín hiệu:

- tối thiểu 10 lệnh đã đóng;
- Net/Paper PnL dương;
- Profit Factor tối thiểu `1.20`;
- AvgROE tối thiểu `+1%`;
- tối thiểu 50% số ngày có PnL dương.

Lệnh không vượt đủ các điều kiện giữ trạng thái `SE BEST WATCH`. UI chỉ hiện
badge `SE BEST` cho nhóm được chọn và thống kê riêng `SE BEST` so với phần A/B
còn lại. Nhãn không được mở/chặn lệnh và không thay đổi size, entry, SL hoặc TP.

Rule version: `edge-short-best-candidate-daily-v1`.

### Short Edge L3B · SE BEST profile (observe-only)

Các lệnh đã mang `SE BEST` được tách tiếp bằng đúng snapshot có trước entry; không dùng
PnL/outcome của chính lệnh:

- `SE BEST SHORT FIT`: SHORT, Tier A, BTC DOWN và setup `EARLY_DUMP` hoặc `BC_UTAD`;
- `SE BEST PHASE RISK`: `SHORT_FADE`, `SHORT_PEAK`, `BTC_CRASH_RECLAIM`, hoặc
  `MARKET_DISPERSION` khi SHORT score dưới 30;
- `SE BEST TIER B TEST`: tín hiệu Tier B chưa thuộc phase risk;
- `SE BEST LONG / UP`: nhánh LONG, `KILL_SHORT` hoặc BTC UP chưa thuộc hai nhóm trên;
- `SE BEST SHORT OTHER`: SHORT còn lại.

Nhãn được lưu cho lệnh mới và derive khi đọc lịch sử cũ; không rewrite cấu trúc JSON hiện
có. Toàn bộ nhãn chỉ dùng để thống kê, không gate/chặn lệnh và không thay đổi size,
entry, SL hoặc TP.

Rule version: `edge-short-best-profile-observe-v1`.

### Short Edge L4 · SE LIVE (observe-only)

`SE LIVE` chỉ đánh giá các lệnh đã mang nhãn `SE BEST`. Mỗi lệnh được snapshot
ngay trước entry bằng tối đa 12 lệnh Tier A/B cùng `setup × side × BTC phase`
đã đóng trước thời điểm đó. Nếu cohort chính có dưới 8 mẫu, rule fallback về
`setup × side`; không đọc kết quả của chính lệnh đang được đánh giá.

- `SE LIVE HOT`: PF tối thiểu `1.50` và AvgROE tối thiểu `+4%`;
- `SE LIVE OK`: PF tối thiểu `1.20` và AvgROE tối thiểu `+1%`;
- `SE LIVE COOL`: PF dưới `0.90` hoặc AvgROE âm;
- `SE LIVE WATCH`: đã đủ mẫu nhưng nằm giữa các ngưỡng trên;
- `SE LIVE NEW`: chưa đủ 8 lệnh đóng.

Nhãn chỉ dùng để quan sát và thống kê toàn bộ dữ liệu của ngày đang chọn,
không phụ thuộc phân trang paper. Nhãn không mở/chặn lệnh và không thay đổi
size, entry, SL hoặc TP.

Rule version: `edge-short-live-health-v1`.

## 17. Market Direction Health realtime (observe-only)

`Market Direction Health` là lớp chấm **trạng thái chung của thị trường** độc lập với
PnL của từng loại tín hiệu. Mục đích là lưu lại bối cảnh thị trường tại đúng thời điểm
tín hiệu xuất hiện để phân tích hậu nghiệm; lớp này không chọn LONG/SHORT cho engine và
không tham gia quyết định vào lệnh.

Rule version: `LIQUID_MARKET_DIRECTION_HEALTH_V1_20260728`.

### 17.1. Nguồn dữ liệu và nhịp realtime

- Universe lấy tối đa 120 symbol thanh khoản đang active, loại BTC và stable pair.
- Chỉ đọc cache nến **đã đóng**: alt dùng nến 15m; BTC dùng 5m, 15m và 1h cùng
  BTC health hiện có.
- Cần tối thiểu 30 symbol đủ dữ liệu. Thiếu mẫu thì trả `NO_DATA`, không suy đoán.
- Server tính lại mỗi 20 giây; UI poll mỗi 20 giây và hiển thị trạng thái socket.
- Thống kê paper lịch sử không nằm trong đường realtime này; lịch sử chỉ được đọc ở
  các màn hình/thống kê tương ứng.

Các feature breadth của alt:

- return 1h, 3h, 6h;
- tỷ lệ symbol trên/dưới EMA20 và EMA50;
- tỷ lệ move có volume xác nhận;
- tỷ lệ đồng hướng qua cả 1h/3h/6h;
- hai tail mạnh của return 1h, độ lớn trung vị 1h và tương quan trung bình với BTC.

Ngưỡng dùng để đếm breadth:

- tăng/giảm 1h: `>= +0.15%` / `<= -0.15%`;
- tăng/giảm 3h: `>= +0.35%` / `<= -0.35%`;
- tăng/giảm 6h: `>= +0.65%` / `<= -0.65%`;
- volume-confirmed: move 1h đúng hướng và recent volume ratio `>= 1.05`;
- aligned 1h/3h/6h: cả ba return cùng hướng qua `0.05% / 0.10% / 0.20%`;
- strong tail 1h: `>= +0.80%` hoặc `<= -0.80%`.

### 17.2. Điểm LONG và SHORT

Hai điểm được chấm **độc lập**, vì vậy không bắt buộc tổng LONG + SHORT bằng 100:

```text
LONG/SHORT score =
  25% directional breadth
  20% EMA20/EMA50 structure
  25% BTC direction evidence
  15% volume confirmation
  15% cross-horizon alignment
```

Trong đó:

- directional breadth = `45% breadth 1h + 35% breadth 3h + 20% breadth 6h`;
- EMA structure = `60% EMA20 + 40% EMA50`;
- BTC direction evidence = `20% BTC 15m + 30% BTC 1h + 25% BTC 6h + 25% cấu trúc trend`;
- cấu trúc BTC dùng direction/score, vị trí so với EMA1h và RSI hiện có;
- confidence phản ánh độ phủ mẫu, độ tách giữa hai điểm và mức đồng thuận đa khung;
  riêng dispersion còn xét độ rộng hai tail.

### 17.3. Nhãn trạng thái chung

- `LONG_FAVORED`: LONG score `>= 55`, chênh LONG-SHORT `>= 8` và aligned-up
  `>= 25%`.
- `SHORT_FAVORED`: SHORT score `>= 55`, chênh LONG-SHORT `<= -8` và aligned-down
  `>= 25%`.
- `MARKET_DISPERSION`: breadth tăng 1h và giảm 1h đều `>= 25%`, median abs return 1h
  `>= 0.35%`, đồng thời avg BTC correlation `< 0.55` hoặc cả hai strong tail đều
  `>= 12%`.
- `MARKET_SHOCK`: macro shock đang active, hoặc `|BTC 15m| >= 1.4%` và
  `|BTC 1h| >= 2.2%`.
- `MARKET_CHOP`: điểm cao nhất `< 45` và neutral breadth 1h `>= 40%` hoặc median abs
  return 1h `< 0.35%`.
- `MARKET_TRANSITION`: có dữ liệu nhưng chưa thỏa một trạng thái rõ hơn.
- `NO_DATA`: chưa đủ snapshot/mẫu tối thiểu.

Thứ tự ưu tiên runtime là: thiếu mẫu → `NO_DATA`; khi đủ mẫu thì `MARKET_SHOCK` →
`MARKET_DISPERSION` → `LONG_FAVORED` → `SHORT_FAVORED` → `MARKET_CHOP` →
`MARKET_TRANSITION`. UI hiển thị cả nhãn đã commit (`label`) và nhãn tức thời
(`rawLabel`) để không nhầm một chuyển động ngắn với thay đổi chế độ đã xác nhận.

### 17.4. Hysteresis và snapshot trước tín hiệu

- Nhãn đã commit chỉ đổi sau **hai sample nến 5m đã đóng khác nhau** cùng cho ra nhãn mới.
- Nhiều lần tính lại trong cùng một sample 5m không được tăng bộ đếm xác nhận.
- `MARKET_SHOCK` và `NO_DATA` đổi ngay; lần chuyển từ `NO_DATA` sang nhãn hợp lệ cũng
  commit ngay để tránh bỏ mất bối cảnh đầu tiên sau khi cache sẵn sàng.
- Snapshot gắn vào trade là bản sao tại thời điểm tín hiệu, không được tính lại theo
  kết quả lệnh về sau.

Schema snapshot bổ sung:

```json
{
  "version": "LIQUID_MARKET_DIRECTION_HEALTH_V1_20260728",
  "evaluatedAt": "ISO-8601",
  "sampleKey": "closed-5m-sample",
  "label": "LONG_FAVORED | SHORT_FAVORED | MARKET_* | NO_DATA",
  "rawLabel": "nhãn tức thời",
  "pendingLabel": "nhãn đang chờ xác nhận hoặc null",
  "pendingCount": 0,
  "scores": { "long": 0, "short": 0, "confidence": 0 },
  "breadth": {},
  "btc": {},
  "sampleSize": 0,
  "universeSize": 0,
  "reasons": [],
  "observationOnly": true,
  "affectsOrders": false
}
```

### 17.5. Nơi lưu theo từng nguồn

- **Liquid Scan:** không sửa schema `data/liquid-paper-trades.json`. Snapshot của tín hiệu
  mới được append vào sidecar `data/liquid-market-direction-signal-log.ndjson`, một record
  cho mỗi `tradeId`.
- **Pump và EMA:** trade mới trong `data/pump-paper-trades.json` lưu thêm field
  `marketDirectionAtSignal`. EMA vẫn được phân biệt bằng source `emasq-*`.
- **Short Edge:** trade mới trong `data/edge-paper-trades.json` lưu thêm field
  `marketDirectionAtSignal`.
- **Recommended Signals clone:** trade mới trong `data/recommended-paper-trades.json` lưu
  thêm field `marketDirectionAtSignal` tại thời điểm clone/open.
- Record cũ không được backfill và không bị viết lại.

Việc bổ sung snapshot không đổi cấu trúc top-level hay writer atomic hiện tại của các file
JSON. Các object lồng nhau được clone trước khi lưu để không mutate snapshot dùng chung.
Nếu append sidecar của Liquid lỗi, hệ thống chỉ ghi warning; signal/paper flow vẫn tiếp tục.

### 17.6. Guardrail bắt buộc

Toàn bộ lớp này là `observe-only`:

- không gate hoặc block lệnh;
- không đổi hướng LONG/SHORT;
- không đổi entry, size, margin, leverage, SL hoặc TP;
- không gửi order;
- chỉ dùng cho UI, log và phân tích/backtest hậu nghiệm.

Code chính: `src/liquidMarketDirectionHealth.js`. API realtime:
`/api/liquid-market-direction-health`. Test logic:
`scripts/test-liquid-market-direction-health.mjs`.

## 2026-08-01 - Short Edge L3C · PHASE RISK × BTC day × LONG/SHORT wave

Rule version: `edge-short-best-risk-day-point-observe-v1`.

Các lệnh thuộc `SE BEST PHASE RISK` được phân rã thêm bằng dữ liệu đã có trước entry:

- xu hướng BTC ngày dùng `btcHealth.pct24h` rolling 24 giờ tại entry, không dùng giá đóng cuối ngày;
- `DAY_BEAR` khi BTC rolling 24h `<= -1%`, `DAY_BULL` khi `>= +1%`, còn lại là
  `DAY_NEUTRAL`;
- điểm và pha LONG/SHORT dùng `marketDirectionAtSignal.scores` cùng
  `marketDirectionAtSignal.scoreDynamics` tại entry.

Ba nhãn thống kê:

- `RISK DAY BEAR CONTINUE`: `DAY_BEAR`, LONG wave khác `BTC_RALLY_REJECT`, SHORT wave
  không phải `SHORT_FADE` hoặc `SHORT_PEAK`;
- `RISK NEUTRAL REVERSAL`: `DAY_NEUTRAL`, LONG wave là `BTC_RALLY_REJECT`, SHORT wave
  thuộc `SHORT_FADE`, `SHORT_PEAK` hoặc `BTC_CRASH_RECLAIM`;
- `RISK MIXED WATCH`: các trường hợp PHASE RISK còn lại hoặc thiếu xác nhận đồng thuận.

API thống kê toàn bộ khoảng ngày đang chọn, độc lập với phân trang paper: closed/active,
W/L/BE, WR, PnL đóng, PnL active theo mark socket, AvgROE, PF và số ngày dương theo
`Asia/Bangkok`. Lệnh mới lưu thêm các field `edgeShortBestRisk*`; lịch sử cũ được derive
khi đọc từ snapshot entry hiện có, không bulk rewrite và không thay đổi cấu trúc bắt buộc
của JSON cũ.

Toàn bộ L3C là `OBSERVE ONLY`: không cấp quyền Binance, không gate/chặn lệnh và không đổi
entry, size, margin, SL hoặc TP.

## 2026-08-01 - Research backtest Short Edge L2B theo sóng BTC (chưa chạy runtime)

Research version: `edge-short-wave-2b-backtest-v0-20260801`.

- Phạm vi: 7 ngày `2026-07-26` đến `2026-08-01` theo `Asia/Bangkok`; ngày `2026-08-01`
  là ngày chưa kết thúc tại lúc chạy. Lần xác nhận cuối có 2,877 lệnh đã đóng và 67 lệnh active; chỉ lệnh đã đóng
  được dùng để đánh giá hậu nghiệm.
- Dữ liệu phân loại đều là snapshot có trước entry: `btcHealth.btcTrendDir`, `btcTrendScore`,
  `pct6h`, `rsi1h`, `emaTrend1h`, `marketRegime/regime`, `obvTrend` và side của tín hiệu.
- Định nghĩa phase nghiên cứu tái sử dụng ngưỡng BTC Wave State hiện có: structure EMA/regime xác
  nhận thì tách `CONTINUATION/EXHAUSTED`, còn structure chưa đồng thuận là `TRANSITION`.
  Sau đó ghép side và quan hệ đúng `SHORT ↔ DOWN`, `LONG ↔ UP` thành `WAVE ALIGNED ACTIVE`,
  `WAVE ALIGNED EXHAUSTED`, `WAVE COUNTER ACTIVE`, `WAVE COUNTER EXHAUSTED`,
  `WAVE TRANSITION` hoặc `WAVE NO DATA`.
- Coverage BTC core đạt `2,871/2,877 = 99.8%`; LONG/SHORT score dynamics chi tiết chỉ phủ
  `39.5%`, vì vậy không được dùng làm điều kiện chính của backtest tuần này.

Kết quả chính:

- Baseline SHORT: 1,001 lệnh, WR `80.3%`, PnL `+$273.128`, AvgROE `+2.80%`, PF `1.50`,
  dương `7/7` ngày.
- `SHORT | WAVE TRANSITION`: 308 lệnh, WR `84.4%`, PnL `+$151.272`, AvgROE `+5.03%`,
  PF `2.07`, dương `7/7` ngày.
- `SHORT | WAVE DRIVE ALIGNED`: 234 lệnh, WR `79.5%`, PnL `+$29.465`, AvgROE `+1.11%`,
  PF `1.28`, dương `5/6` ngày có mẫu.
- `SHORT | WAVE COUNTER ACTIVE`: 150 lệnh, WR `79.3%`, PnL `+$36.062`, AvgROE `+2.40%`,
  PF `1.39`, dương `4/5` ngày có mẫu.
- `SHORT | WAVE COUNTER EXHAUSTED`: 211 lệnh, WR `75.8%`, PnL `+$36.331`, AvgROE
  `+1.72%`, PF `1.24`, dương `3/5` ngày có mẫu.
- Baseline LONG: 1,876 lệnh, WR `63.9%`, PnL `-$329.533`, AvgROE `-2.16%`, PF `0.75`,
  âm `6/7` ngày. `LONG | WAVE COUNTER EXHAUSTED` gần hòa vốn (`+$2.119`, PF `1.01`);
  các phase LONG lớn còn lại đều âm, xấu nhất theo độ ổn định là `LONG | WAVE TRANSITION`
  với PnL `-$104.620`, AvgROE `-4.88%`, PF `0.70`, âm `6/7` ngày.
- Nhóm L2 cũ bị gom sai rõ nhất: `TIER BLOCK | SHORT | WAVE TRANSITION` có 239 lệnh,
  WR `84.5%`, PnL `+$118.446`, AvgROE `+5.02%`, PF `2.07`, dương `7/7` ngày.

Kết luận research: L2B nếu triển khai phải là nhãn `SIDE × BTC WAVE PHASE`, không dùng nhãn
wave chung cho cả LONG và SHORT. Chưa có nhãn runtime, chưa ghi snapshot mới, chưa thêm card UI
và chưa thay đổi JSON. Script đọc-only: `scripts/backtest-edge-short-wave-2b.mjs`.

Research này hoàn toàn không ảnh hưởng Binance, entry, direction, size/margin, leverage, SL hoặc TP.

## 2026-08-01 - Short Edge L2B runtime SIDE × BTC Wave Phase

Rule version: `edge-short-wave-2b-observe-v1`.

- Dữ liệu dùng trước entry: `btcHealth.btcTrendDir`, `btcTrendScore`, `pct6h`, `rsi1h`,
  `emaTrend1h`, `marketRegime/regime`, `obvTrend` và side tín hiệu.
- BTC structure chỉ được coi là confirmed khi direction, EMA1h và regime đồng thuận. Nếu chưa
  đồng thuận thì phase là `TRANSITION`; nếu confirmed thì dùng momentum/RSI/OBV để tách
  `CONTINUATION` và `EXHAUSTED` theo cùng ngưỡng của backtest.
- Quan hệ side được ánh xạ đúng: SHORT cùng hướng với BTC DOWN, LONG cùng hướng với BTC UP;
  chiều ngược lại là `COUNTER`.
- Nhãn runtime gồm 10 nhãn `SHORT/LONG × TRANSITION/ALIGNED ACTIVE/ALIGNED EXHAUSTED/
  COUNTER ACTIVE/COUNTER EXHAUSTED` và `2B BTC WAVE · NO DATA` khi thiếu snapshot.
- Tone thống kê theo backtest: SHORT transition/counter-active/aligned-active là GOOD;
  SHORT exhausted và LONG counter-exhausted là WATCH; các nhóm LONG transition/active/aligned
  còn lại là RISK. Tone chỉ để đọc thống kê, không phải gate.
- API thống kê toàn bộ khoảng ngày đang chọn, độc lập phân trang: closed/active, W/L/BE, WR,
  PnL đóng, PnL active theo socket, AvgROE, PF và số ngày dương theo Asia/Bangkok.
- UI `/edge-short` hiển thị card `Lớp 2B` sau Lớp 2 và badge con trong ô `L2 Tier SE`.
- Lệnh mới append các field tùy chọn `edgeShortWave2b*`. Lịch sử cũ derive khi đọc từ snapshot
  đã có; không bulk rewrite, không thay đổi top-level hoặc field bắt buộc của JSON cũ.

Toàn bộ L2B là `OBSERVE ONLY`: không cấp quyền Binance, không gate/chặn, không đổi side,
entry, size/margin, leverage, SL hoặc TP.

## 2026-08-01 - Research Short Edge L2C Tier A/B × BTC Wave (chưa chạy runtime)

Research version: `edge-short-wave-2c-ab-backtest-v0-20260801`.

- Phạm vi và timezone giữ nguyên backtest L2B: `2026-07-26..2026-08-01`, Asia/Bangkok;
  ngày cuối chưa kết thúc. Chỉ lấy lệnh đóng đã mang stored Tier `A` hoặc `B`, loại toàn bộ
  `BLOCK` và `NO DATA`: 439/2,879 lệnh đóng, tương đương 15.2%.
- Nhãn BTC Wave dùng đúng snapshot/threshold L2B trước entry; kết quả được thống kê riêng Tier A,
  Tier B và gộp A+B. Không dùng PnL/outcome của chính lệnh để phân loại.
- A+B tổng: 439 lệnh, WR `74.7%`, PnL `+$74.040`, AvgROE `+2.03%`, PF `1.34`,
  dương `6/7` ngày.
- A+B SHORT: 255 lệnh, WR `82.7%`, PnL `+$85.744`, AvgROE `+3.59%`, PF `1.82`,
  dương `5/6` ngày có mẫu.
- A+B LONG: 184 lệnh, WR `63.6%`, PnL `-$11.704`, AvgROE `-0.14%`, PF `0.90`;
  không đạt chất lượng của nhánh SHORT.
- A+B SHORT × TRANSITION: 60 lệnh, WR `85.0%`, PnL `+$35.446`, AvgROE `+6.26%`,
  PF `2.46`, dương `4/4` ngày có mẫu.
- A+B SHORT × DRIVE ALIGNED: 141 lệnh, WR `82.3%`, PnL `+$31.851`, AvgROE `+2.15%`,
  PF `1.63`, dương `5/6` ngày có mẫu.
- A+B SHORT × ALIGNED EXHAUSTED: 54 lệnh, WR `81.5%`, PnL `+$18.447`, AvgROE `+4.39%`,
  PF `1.61`, nhưng chỉ có mẫu trong 2 ngày nên chưa đủ gọi ổn định tuần.
- A+B LONG × DRIVE ALIGNED: 28 lệnh, PnL `-$12.040`, AvgROE `-5.59%`, PF `0.52`.
- A+B LONG × ALIGNED EXHAUSTED: 118 lệnh, PnL `-$5.796`, PF `0.91`.
- A+B LONG × TRANSITION có PnL `+$6.132` nhưng AvgROE `-1.27%`, chỉ dương `1/4` ngày
  có mẫu; PnL dương do outlier/size và không được coi là cohort tốt ổn định.

Kết luận research: L2C có giá trị nếu dùng để tách `A/B SHORT × BTC Wave`; không nên gọi toàn bộ
A/B là tốt và không nên trộn LONG với SHORT. Hiện chưa có nhãn/snapshot/API/card L2C runtime;
script chỉ đọc `scripts/backtest-edge-short-wave-2b.mjs`, không rewrite JSON và không tác động
Binance, gate, entry, direction, size/margin, leverage, SL hoặc TP.

## 2026-08-01 - Short Edge L2C runtime Tier A/B × BTC Wave

Rule version: `edge-short-wave-2c-ab-observe-v1`.

- L2C chỉ eligible khi snapshot L2 có `edgeShortTier` là `A` hoặc `B`; mọi lệnh `BLOCK` và
  `NO DATA` giữ `2C TIER A/B · N/A`, không được cộng vào thống kê L2C.
- Dữ liệu trước entry tái sử dụng snapshot L2B `SIDE × BTC Wave`; không đọc PnL/outcome của
  chính lệnh để gắn nhãn. Badge từng lệnh giữ rõ Tier, ví dụ `2C A · SHORT · BTC TRANSITION`.
- Card chính gộp A+B theo cohort BTC Wave để đánh giá tổng; phần chi tiết tách riêng A và B.
- Tone từ backtest chỉ dùng hiển thị: SHORT transition là GOOD; SHORT aligned-active chỉ GOOD
  ở A và WATCH ở B; SHORT aligned-exhausted GOOD ở A/WATCH ở B; LONG transition và
  counter-exhausted là WATCH; các nhánh LONG drive/aligned còn lại là RISK. Counter SHORT
  chưa đủ mẫu A/B nên giữ WATCH.
- API thống kê toàn bộ range độc lập phân trang: closed/active, W/L/BE, WR, PnL đóng,
  PnL active theo mark socket, AvgROE, PF và ngày dương Asia/Bangkok.
- `/edge-short` hiển thị card `Lớp 2C`, khối chi tiết A/B có thể mở/đóng và badge con trong
  ô `L2 Tier SE`.
- Lệnh mới append các field tùy chọn `edgeShortWave2c*`; lịch sử cũ derive khi đọc từ Tier/L2B
  snapshot đã có. Không bulk rewrite và không thay đổi schema top-level/field bắt buộc của JSON.

Toàn bộ L2C là `OBSERVE ONLY`: không cấp quyền Binance, không gate/chặn, không đổi side,
entry, size/margin, leverage, SL hoặc TP.

## 2026-08-01 - Pump Source/Wave Observation Layers

Rule version: `pump-source-wave-observe-v1`.

Mục tiêu là thống kê Pump theo kiến trúc tương tự Short Edge nhưng không sao chép kết luận hoặc tier
của Short Edge. Hai nguồn được tách độc lập ngay từ đầu:

- `PUMP_NATIVE`: tier ưu tiên `pumpCanonicalCandidateTier` nếu candidate đã là A/B/BLOCK; khi
  canonical vẫn COLLECT/WATCH thì fallback sang nhãn native `pumpEvalTier`; thiếu cả hai giữ WATCH.
- `EMA`: tier lấy từ snapshot `emaComboLayersSnapshot.layer3`/`emaLayer3Tier`, ánh xạ
  `GOOD+ → A`, `GOOD → B`, `WATCH → WATCH`, `RISK → BLOCK`.

Dữ liệu chỉ dùng trước entry gồm source, setup, side, timeframe, `btcCorr`, `btcHealth.btcTrendDir`,
`btcTrendScore`, `pct6h`, `rsi1h`, `emaTrend1h`, `marketRegime/regime`, `obvTrend` và snapshot tier
nguồn nêu trên. Không dùng PnL/outcome của chính lệnh để gắn nhãn tại entry.

Các lớp đang chạy:

- L1: `SOURCE × SETUP × SIDE × TIMEFRAME × BTC RELATION`, chốt một lần theo đầu ngày
  `Asia/Bangkok` từ các lệnh đã đóng trước ngày; nhãn `PRIME/GOOD/WATCH/RISK/NO DATA` có hysteresis.
- L2: tier riêng theo nguồn như ánh xạ trên; đây là nhãn quan sát, không phải gate.
- L2B: `SOURCE × SIDE × BTC WAVE`, với wave `TRANSITION`, `ALIGNED/COUNTER × ACTIVE/EXHAUSTED`
  hoặc `NO DATA`.
- L2C: chỉ Tier A/B, ghép `SOURCE × TIER × SIDE × BTC WAVE`; WATCH/BLOCK không được tính vào L2C.
- L3: `PUMP BEST` prior-day theo `SOURCE × TIER A/B × SETUP × SIDE`; yêu cầu tối thiểu 10 lệnh
  đã đóng, net PnL dương, AvgNetROE `>= 1%`, PF `>= 1.2`, tỷ lệ ngày dương `>= 50%`.

Thống kê API chạy trên toàn bộ date range, độc lập phân trang paper. PnL dùng chuẩn NET bằng gross
trừ phí round-trip ước tính; PnL active lấy mark socket hiện tại rồi trừ phí ước tính. UI `/pump`
hiển thị card cho cả năm lớp và một cột badge `Pump OBS` trong paper table.

Snapshot suy ra cho lịch sử được cache riêng theo ngày Asia/Bangkok và chỉ dựng lại khi service load
lần đầu trong ngày hoặc sang ngày mới. Ghi/đóng lệnh trong ngày không làm quét lại toàn bộ lịch sử;
lệnh mới dùng trực tiếp `pumpObs*` đã lưu, còn mark/PnL active vẫn tính lại theo socket mỗi request.

Tương thích JSON cũ:

- không bulk rewrite và không thay đổi top-level `pump-paper-trades.json`;
- lịch sử cũ derive khi đọc từ snapshot đã có;
- lệnh mới chỉ append các field tùy chọn `pumpObs*`; parser cũ có thể bỏ qua toàn bộ field này;
- field `pumpObsDerived` phân biệt snapshot lưu tại entry với nhãn suy ra từ lịch sử.

Toàn bộ lớp này là `OBSERVE ONLY`: không cấp quyền Binance, không đặt/chặn lệnh, không đổi hướng,
entry, size/margin, leverage, SL hoặc TP.

## Market Direction Health - non-blocking runtime refresh (2026-08-01)

Version runtime: `LIQUID_MARKET_HEALTH_RUNTIME_V3_20260801`; version chấm điểm/nhãn hiện hành được giữ nguyên.

- Dữ liệu dùng trước entry không đổi: universe symbol thanh khoản, nến 15m đã đóng của alt, nến BTC 5m/15m/1h,
  BTC Health và macro shock đã có trong cache tại thời điểm đánh giá.
- Runtime ưu tiên `_snapshotCache`/`snapshotCache.data` trong bộ nhớ để lấy universe; chỉ fallback REST khi cold start
  và timeout sau tối đa 4 giây. BTC Health ưu tiên cache nến socket và timeout fallback sau 2.5 giây.
- Chống refresh chồng nhau bằng một promise `inflight`; khi đã có score hợp lệ, API tiếp tục trả snapshot gần nhất trong
  lúc refresh nền thay vì xóa point hoặc treo giao diện.
- Điều kiện phân loại, công thức LONG/SHORT score, confidence, breadth, BTC context, hysteresis 2 mẫu và thống kê theo
  snapshot entry đều không đổi.
- Response API chỉ bổ sung object tùy chọn `runtime` để chẩn đoán nguồn snapshot; không ghi/bulk rewrite JSON cũ.
- `OBSERVE ONLY`: không ảnh hưởng Binance, gate/entry, direction, size/margin, leverage, SL hoặc TP.

## 2026-08-01 - Recommended L9 Entry Support tách EDGE/LIQUID theo Source L1

Rule version: `recommended-support-entry-shadow-v2-source-split`.

- Lớp `TÍN HIỆU ĐẸP · ENTRY SUPPORT` hiện tại được giữ nguyên; lớp con mới chỉ áp dụng cho
  hai cohort SHORT đã được L9 gọi là GOOD: `EDGE SHORT ALIGNED` và
  `LIQUID SHORT OLD SIDE`.
- Dữ liệu dùng trước entry gồm source/side, snapshot Market Direction tại tín hiệu, trạng thái
  flip đã xác nhận và `recommendedSourceLayer` đã chốt tại thời điểm clone. Không đọc PnL,
  outcome hoặc trạng thái đóng của chính lệnh để gắn nhãn.
- Nếu Source L1 là `GOOD`, nhãn con là `EDGE CONFIRMED` hoặc `LIQUID CONFIRMED`; Source L1
  là `WATCH`, `RISK` hoặc thiếu dữ liệu thì nhãn con là `EDGE WEAK` hoặc `LIQUID WEAK`.
- API thống kê bốn card cố định, kể cả card chưa có mẫu: tổng/đang mở/chờ/đã đóng, W/L/BE,
  WR, PnL đóng, PnL active, AvgROE, PF và độ ổn định theo ngày trong toàn date range; thống kê
  độc lập với phân trang Paper.
- Paper table `/recommended-signals` hiển thị thêm badge nhãn con trong cột Entry Support;
  nhãn tổng GOOD/BAD và cohort cũ vẫn được giữ để đối chiếu.
- Tương thích JSON cũ: không bulk rewrite, không thay đổi top-level hoặc field bắt buộc.
  Các field `recommendedSupportEntrySourceQuality*` là field runtime/tùy chọn và được derive
  lại từ snapshot đã có khi đọc; reader cũ có thể bỏ qua.

Toàn bộ lớp con là `OBSERVE ONLY`: không cấp quyền Binance, không gate/chặn, không thay đổi
entry/direction, size/margin, leverage, SL hoặc TP.

## 2026-08-01 - Recommended thống nhất màu card theo AvgROE

UI version: `recommended-stats-avgroe-tone-v1-20260801`.

- Áp dụng cho toàn bộ card thống kê trong khu vực Recommended Paper: rule size, combo đã mở
  và mọi lớp đánh giá dùng chung renderer card.
- Màu xanh chỉ khi AvgROE đã đóng `> 3.5%`; màu đỏ khi AvgROE `< -1%`; khoảng
  `[-1%, 3.5%]` và nhóm chưa có AvgROE hiển thị WATCH/vàng.
- Điều kiện màu chỉ đọc AvgROE tổng hợp từ các lệnh trong date range hiện tại. Nó không thay
  đổi tier/nhãn snapshot đã chốt trước entry và không dùng để phân loại lại dữ liệu JSON.
- Không thêm hoặc sửa field JSON; dữ liệu cũ và reader cũ giữ nguyên hoàn toàn.

Đây chỉ là quy ước trình bày thống kê `OBSERVE ONLY`: không tác động Binance, gate/entry,
direction, size/margin, leverage, SL hoặc TP.

## 2026-08-02 - Runtime Feed Recovery và EMA warmup missing-only

Runtime version: `RUNTIME_FEED_RECOVERY_V1_20260802`.

- Dữ liệu dùng trước entry và công thức đánh giá hiện hành không thay đổi. Phần sửa chỉ đọc trạng thái Kline cache
  theo symbol/timeframe và public Binance `!ticker@arr`; không đưa dữ liệu mới vào điều kiện nhãn, tier hoặc combo.
- Readiness EMA không còn bắt buộc 100% universe. Target runtime là giá trị nhỏ nhất giữa cấu hình tuyệt đối
  `EMA_SQUEEZE_WARMUP_RETRY_MIN_READY` và `ceil(totalSymbols * EMA_SQUEEZE_WARMUP_RETRY_READY_RATIO)`;
  ratio đang chạy là `0.95`, nên universe 179 có target 171.
- Symbol chưa đủ tối thiểu 40 nến vẫn không được coi là ready. Sau khi target chung đạt, phần thiếu được seed riêng
  theo từng timeframe ở chế độ nền mỗi 15 phút; khi target chưa đạt, retry missing-only dùng backoff từ 90 giây
  tới tối đa 15 phút. Retry EMA không gọi lại Market Health 120 symbol hoặc toàn bộ tier warmup.
- Tick giá chỉ được nhận khi giá hợp lệ, `eventTime` không lùi so với tick cuối của cùng symbol và độ trễ không quá
  10 giây. Watchdog theo `lastAcceptedAt`, reconnect khi 15 giây không có giá hợp lệ dù raw WebSocket vẫn gửi message;
  raw socket im 30 giây cũng reconnect như trước.
- Bảy paper consumer trước đây mở ticker riêng (`Recommended`, `Cap`, `EMA`, `Pump`, `PPKS`, `Shakeout`,
  `Top Reversal`) nay dùng chung `sharedLastTicker`. Mỗi payload `!ticker@arr` chỉ parse một lần rồi dispatch theo
  symbol; callback và tập symbol active của từng consumer được giữ độc lập.
- Khi event loop bận và nhiều frame `!ticker@arr` xếp hàng, runtime coalesce và chỉ parse frame mới nhất đang chờ;
  frame trung gian cũ bị bỏ trước khi dispatch. Giá được nhận vẫn phải qua kiểm tra thứ tự/độ trễ nêu trên.
- PM2 watchdog đọc `pm_uptime` của chính `btc-liquidity-web` khi health timeout. Cold-start/restart bên ngoài được
  miễn restart trong 60 phút, khớp thời gian khởi tạo cache lớn; grace không còn chỉ tính từ lúc watchdog tự khởi động.
  Hết grace, cơ chế hai health failure liên tiếp mới được phép restart web như cũ.
- Thống kê nhóm/combo, nhãn snapshot và PnL đã đóng không được tính lại. PnL active tiếp tục lấy mark socket;
  vì mark bớt đứng nên số open/closed paper và PnL active có thể phản ánh điểm chạm sớm/chính xác hơn.
- Tương thích JSON cũ: không thêm field bắt buộc, không đổi top-level, không bulk rewrite và không ghi sửa bất kỳ
  paper JSON lịch sử nào. Runtime state chỉ nằm trong RAM.
- Đây là sửa hạ tầng dữ liệu, không phải gate hay rule giao dịch: không cấp quyền/đặt lệnh Binance, không thay đổi
  direction, entry, size/margin, leverage, SL hoặc TP.

## 2026-08-02 - Source LONG Corr Rebound cho EMA Squeeze và Short Edge SC Spring

Rule version: `SOURCE_LONG_CORR_REBOUND_V1_20260802`.

- Hai cohort được tách riêng, không gộp nguồn: `EMA_SQUEEZE_LONG_CORR_REBOUND` chỉ thuộc Paper EMA
  trên `/pump`; `EDGE_SC_SPRING_LONG_CORR_REBOUND` chỉ thuộc Paper `/edge-short`.
- Dữ liệu dùng trước entry gồm source/setup/side, `btcCorr`, `btcHealth.btcTrendDir`,
  `btcHealth.btcTrendScore`, `btcHealth.pct24h` và `btcHealth.rsi4h`. Không đọc PnL, outcome,
  exit, peak hay dữ liệu sau entry để gắn nhãn.
- Điều kiện chung: side `LONG`, correlation `>= 0.5`, BTC direction `DOWN`, BTC trend score `< 45`,
  `-0.2% < pct24h < +0.2%` (`DAY_FLAT`) và RSI 4h `< 50` (`RSI4_RESET`). Điều kiện setup riêng:
  EMA phải là `SQUEEZE` và Short Edge phải là `SC_SPRING`.
- Backtest Asia/Bangkok 20/07–02/08 trước khi chạy runtime: EMA SQUEEZE có 8 closed, 7W/1L,
  net PnL `+$0.235`, AvgNetROE `+2.94%`, PF `4.74`; Short Edge SC_SPRING có 5 closed,
  5W/0L, net PnL `+$3.747`, AvgNetROE `+7.49%`. Mẫu mới phủ 2–3 ngày nên tier cố định là
  `PROVISIONAL`, không được mô tả hoặc sử dụng như tier/gate giao dịch đã xác nhận.
- API thống kê trên toàn date range, độc lập phân trang: total/closed/active/pending, W/L/BE, WR,
  net PnL đóng, net PnL active theo mark socket, AvgNetROE, PF và ngày dương Asia/Bangkok.
  Màu card theo quy ước chung: AvgROE `> 3.5%` xanh, `< -1%` đỏ, còn lại WATCH.
- `/pump` hiển thị card EMA SQUEEZE và badge trong cột `Pump OBS`; `/edge-short` hiển thị card
  SC_SPRING và badge trong cột `L4 Live`. Badge luôn ghi rõ tính chất provisional/observe-only.
- Tương thích JSON cũ: không bulk rewrite và không đổi top-level/field bắt buộc. Lệnh mới đúng setup
  mục tiêu chỉ append các field tùy chọn `sourceLongCorrRebound*`; lịch sử cũ derive khi API đọc từ
  snapshot entry và mang basis `DERIVED_ENTRY_SNAPSHOT`. Reader cũ có thể bỏ qua toàn bộ field mới.

Toàn bộ rule là `OBSERVE ONLY`: không cấp quyền Binance, không gate/chặn entry, không đổi direction,
size/margin, leverage, SL hoặc TP.

## 2026-08-02 - Liquid Stage 3B LONG Corr Rebound paper test $10

Rule version đang chạy: `LIQUID_LONG_CORR_REBOUND_V2_20260802`.

- Dữ liệu phân loại vẫn chỉ lấy trước entry: `LIQUID_KILL_ZONE`, `LONG`, `15m`,
  `BTC_CORR_THEO`, `BTC_DOWN_WEAK`, `NGUOC_BTC`,
  `GATE_TEST_LIQUID_LONG_BTC_COUNTER`, `DAY_FLAT`, `RSI4_RESET` và Stage 3 `WATCH`.
  Không đọc PnL, outcome, exit, peak hoặc dữ liệu tương lai của chính lệnh.
- Nhãn `LONG CORR REBOUND` được hiển thị cạnh Stage 3 trong cả bảng Paper open và closed.
  Lệnh auto mới khớp nhãn dùng paper margin `$10`; badge của đúng lệnh đã áp size hiển thị
  `LONG CORR REBOUND · TEST $10`. Lệnh lịch sử chỉ derive nhãn và giữ nguyên margin cũ.
- Thống kê vẫn chạy trên toàn date range, không phụ thuộc phân trang; tách số lệnh đóng/active,
  PnL đóng, PnL active theo mark socket, W/L, WR, AvgROE và PF.
- Rule chỉ tác động `paper margin` của lệnh auto mới. Không nâng/ghi đè Stage 3, không tạo thêm
  tín hiệu, không gate/chặn entry, không đổi direction, leverage, SL hoặc TP và tuyệt đối không
  cấp quyền/đặt lệnh Binance. Biến cấu hình tùy chọn:
  `LIQUID_SCAN_LONG_CORR_REBOUND_TEST_MARGIN_USDT`, mặc định `$10`.
- Tương thích JSON cũ: không bulk rewrite và không đổi top-level. Lệnh mới append các field tùy chọn
  `liquidLongCorrReboundPaperTestEligible`, `liquidLongCorrReboundPaperTestMarginUsdt`,
  `liquidLongCorrReboundPaperSizeApplied`, `liquidLongCorrReboundAppliedMarginUsdt` và các field
  `liquidLongCorrRebound*` sẵn có. Reader cũ có thể bỏ qua; lịch sử V1 được derive khi đọc và
  không bị ghi lại hoặc đổi margin.

Mục V1 bên dưới là lịch sử của giai đoạn chỉ quan sát và đã được V2 thay thế ở runtime.

## 2026-08-02 - Liquid Stage 3B LONG Corr Rebound

Rule version: `LIQUID_LONG_CORR_REBOUND_V1_20260802`.

- Đây là nhãn phụ `LONG CORR REBOUND` nằm cạnh Stage 3 hiện tại. Nhãn chỉ phân rã các lệnh
  Stage 3 `WATCH`; tuyệt đối không nâng hoặc ghi đè `RISK`, `GOOD`, `GOOD+` và không làm cho
  lệnh đủ điều kiện Stage 4/4B.
- Dữ liệu dùng trước entry gồm: signal `LIQUID_KILL_ZONE`, side, timeframe, `btcCorr`, BTC
  direction/score, `liquidGateLabel`, `btcHealth.pct24h`, `btcHealth.rsi4h` và Stage 3 đã chốt.
  Không đọc PnL, outcome, exit, peak hay dữ liệu sau entry để gắn nhãn.
- Điều kiện đầy đủ: `LONG · 15m · BTC_CORR_THEO · BTC_DOWN_WEAK · NGUOC_BTC ·
  GATE_TEST_LIQUID_LONG_BTC_COUNTER · DAY_FLAT · RSI4_RESET` và Stage 3 phải là `WATCH`.
  `DAY_FLAT` dùng `-0.2% < BTC pct24h < +0.2%`; `RSI4_RESET` dùng RSI 4h `< 50`.
- Backtest theo Asia/Bangkok: seed 25–26/07 có 12 lệnh đóng, 10W/2L, PnL `+$0.739`,
  AvgROE `+4.56%`, PF `2.43`. Test 27/07–02/08 có 68 lệnh đóng, 67W/1L,
  PnL `+$5.234`, AvgROE `+7.64%`; 20/20 episode 15 phút dương. Mẫu test chỉ xuất hiện
  trên 2/7 ngày nên nhãn vẫn là observe-only, chưa được dùng làm tier/gate.
- Thống kê `/liquid-scan` chạy theo date range đang chọn, tách PnL đóng và PnL active;
  active PnL tiếp tục dùng mark socket. Badge `LONG CORR REBOUND` được hiển thị cạnh badge
  Stage 3 trong cả bảng open và closed.
- Tương thích JSON cũ: không bulk rewrite và không đổi top-level/field bắt buộc của
  `liquid-paper-trades.json`. Lệnh mới chỉ append các field tùy chọn
  `liquidLongCorrRebound*`; lệnh cũ được derive khi API đọc từ snapshot entry sẵn có và
  mang basis `DERIVED_ENTRY_SNAPSHOT`. Reader cũ có thể bỏ qua toàn bộ field mới.

Toàn bộ Stage 3B này là `OBSERVE ONLY`: không cấp quyền Binance, không gate/chặn entry,
không đổi direction, size/margin, leverage, SL hoặc TP.

## 2026-08-02 - Liquid Stage 3C LONG/SHORT Stable Mechanisms

Rule version: `LIQUID_STABLE_MECHANISM_V1_20260802`.

- Stage 3C phân rã sáu cơ chế từ các `LIQUID_KILL_ZONE · 15m` đã ổn định qua ngày:
  - `LONG_SOFT_CORR_REBOUND`: LONG, `BTC_CORR_YEU`, `BTC_DOWN_WEAK`, `THEO_YEU`,
    `GATE_TEST_LIQUID_LONG_BTC_COUNTER`, `DAY_FLAT`, `RSI4_RESET`.
  - `LONG_DECOUPLED_RESET`: LONG, `BTC_CORR_RAC`, `BTC_UP_WEAK`, `DOC_LAP`,
    `GATE_OK_LIQUID_LONG_BTC_ALIGNED`, `RSI4_RESET`, nhận `DAY_FLAT` (CORE) hoặc
    `DAY_NEG` (TEST).
  - `SHORT_CORR_FADE_CORE`: SHORT, `BTC_CORR_THEO`, `BTC_UP_WEAK`, `NGUOC_BTC`,
    `GATE_TEST_LIQUID_SHORT_BTC_COUNTER`, `DAY_FLAT`, `RSI4_RESET`.
  - `SHORT_FAILED_BOUNCE`: SHORT, `BTC_DOWN_WEAK`, gate BTC aligned, `DAY_POS`,
    `RSI4_RESET`; nhận `BTC_CORR_THEO + THUAN_BTC` hoặc `BTC_CORR_YEU + THEO_YEU`.
  - `SHORT_BEAR_DRIVE`: SHORT, `BTC_CORR_THEO`, `BTC_DOWN_WEAK/MID`, `THUAN_BTC`,
    gate BTC aligned, `DAY_NEG`, `RSI4_BALANCED`. Nhãn ở tier `TEST` vì lịch sử còn
    tập trung ít ngày dù số lệnh lớn.
  - `SHORT_DECOUPLED_HOT_FADE`: SHORT, `BTC_CORR_RAC`, `BTC_UP_MID`, `DOC_LAP`,
    gate BTC counter, `DAY_POS`, `RSI4_HOT`; tier `WATCH`.
- Dữ liệu phân loại chỉ lấy từ snapshot trước entry: signal type/timeframe, side/heavy side,
  `btcCorr`, BTC direction/score, gate, `btcHealth.pct24h` và `btcHealth.rsi4h`. Không đọc
  PnL, outcome, exit, peak hoặc dữ liệu tương lai của chính lệnh.
- Thống kê Stage 3C dùng toàn bộ date range trước khi phân trang Paper; mỗi card hiển thị
  closed/open/pending, W/L, WR, PnL đóng, PnL active theo mark socket, AvgROE, PF và số
  snapshot/backfill. Badge được gắn cạnh Stage 3 trong bảng Paper open và closed.
- Đối chiếu lịch sử tại lúc phát hành: `LONG_SOFT_CORR_REBOUND` 78 closed/4 ngày;
  `LONG_DECOUPLED_RESET` 55 closed/4 ngày; `SHORT_CORR_FADE_CORE` 41 closed/3 ngày;
  `SHORT_FAILED_BOUNCE` 70 closed/5 ngày; `SHORT_BEAR_DRIVE` 263 closed/3 ngày;
  `SHORT_DECOUPLED_HOT_FADE` 108 closed/4 ngày.
- Toàn bộ Stage 3C là `OBSERVE ONLY`: không gate/chặn/tạo entry, không cấp quyền Binance,
  không đổi direction, paper/Binance margin, size, leverage, SL hoặc TP. Nhãn này không
  nâng/hạ Stage 3 hay Stage 3B hiện có.
- Tương thích JSON cũ: không bulk rewrite, không đổi top-level hoặc field bắt buộc. Lệnh mới
  chỉ append các field phẳng tùy chọn `liquidStableMechanism*`; lệnh lịch sử được derive lúc
  API đọc với basis `DERIVED_ENTRY_SNAPSHOT`. Reader cũ có thể bỏ qua toàn bộ field mới.

## 2026-08-02 - Ngưỡng hiển thị nút Binance theo AvgROE

UI version: `BINANCE_CARD_AVG_ROE_VISIBILITY_V1_20260802`.
Whitelist version: `LIQUID_LIVE_CARD_WHITELIST_V2_20260802`.

- Nút/checkbox Binance trên card thống kê chỉ được render khi AvgROE đóng của chính card
  thỏa `AvgROE > 4.0%`. Bằng đúng `4.0%`, thấp hơn hoặc thiếu AvgROE đều không hiển thị.
- Điều kiện dùng số AvgROE đã được thống kê cho date range/card hiện tại; PnL active realtime
  không được dùng để thay thế AvgROE đóng.
- Áp trực tiếp cho toàn bộ card whitelist hiện có trên Liquid Scan. Short Edge và Recommended
  Signals cùng nạp guard dùng chung; hiện hai trang này chưa có checkbox whitelist/luồng đặt
  Binance theo card, nên guard không tự tạo quyền đánh thật mới.
- Bổ sung prefix `stable-mechanism:` để checkbox Stage 3C khớp đúng whitelist khi người dùng
  chủ động bật. Phân loại Stage 3C tự thân vẫn `OBSERVE ONLY`; chỉ thao tác opt-in trên checkbox
  đủ ngưỡng mới có thể cấp quyền cho tín hiệu Liquid Scan auto mới.
- Đây là rule hiển thị, không tự bật, tự tắt hoặc xóa `enabledKeys` đã lưu. Không thay entry,
  direction, paper size, leverage, SL hoặc TP. Whitelist tổng, dry-run và khóa order hiện hữu
  vẫn được kiểm tra như trước khi một lệnh thật có thể được gửi.
- Tương thích JSON cũ: không sửa paper JSON và không đổi cấu trúc whitelist. File whitelist
  vẫn giữ `enabledKeys`; prefix mới là tùy chọn và key cũ tiếp tục đọc bình thường.

## 2026-08-02 - Bộ lọc Paper cho Liquid Stage 3C

UI version: `LIQUID_STABLE_MECHANISM_FILTER_V1_20260802`.

- Bộ lọc `Lọc Stable Mechanism` có `Tất cả` và sáu giá trị
  `LONG_SOFT_CORR_REBOUND`, `LONG_DECOUPLED_RESET`, `SHORT_CORR_FADE_CORE`,
  `SHORT_FAILED_BOUNCE`, `SHORT_BEAR_DRIVE`, `SHORT_DECOUPLED_HOT_FADE`.
- Khi chọn một giá trị, chỉ bảng Paper open/closed bên dưới được lọc theo field
  `liquidStableMechanismCode` đã chốt từ snapshot trước entry. Lệnh không có
  `liquidStableMechanismMatched === true` không được đưa vào kết quả của bộ lọc cụ thể.
  Chọn `Tất cả` giữ nguyên toàn bộ Paper Liquid Scan.
- Các card thống kê Stage 3C vẫn tổng hợp trên toàn date range trước phân trang để người dùng
  giữ được bối cảnh chung; bộ lọc không làm thay đổi số liệu gốc hoặc ghi lại trade. Badge Stage 3C
  tiếp tục nằm cạnh nhãn Stage 3 trong cả bảng open và closed, không tạo cột hoặc nhãn trùng.
- Đây chỉ là bộ lọc hiển thị và nhãn `OBSERVE ONLY`: không gate/chặn/tạo entry, không cấp quyền
  Binance, không đổi direction, size/margin, leverage, SL hoặc TP.
- Tương thích JSON cũ: không thêm field bắt buộc, không bulk rewrite và không đổi top-level.
  Lệnh cũ vẫn derive các field `liquidStableMechanism*` lúc API đọc; reader cũ có thể bỏ qua.

## 2026-08-02 - Binance whitelist opt-in cho Liquid Stage 3B

UI version: `LIQUID_LONG_CORR_REBOUND_BINANCE_OPTIN_V1_20260802`.
Whitelist version: `LIQUID_LIVE_CARD_WHITELIST_V3_20260802`.

- Card `LONG CORR REBOUND · PAPER TEST $10` có key riêng `long-corr-rebound:GOOD` và chỉ hiện
  checkbox Binance khi AvgROE đóng của card lớn hơn tuyệt đối `4.0%`, theo policy UI dùng chung.
- Checkbox mặc định tắt. Chỉ tín hiệu Liquid Scan auto mới, phát sinh sau lúc người dùng chủ động
  bật key và khớp `liquidLongCorrReboundMatched === true`, mới được chuyển tiếp vào luồng kiểm tra
  Binance whitelist hiện hữu.
- Điều kiện Stage 3B không đổi và chỉ dùng snapshot trước entry:
  `LIQUID_KILL_ZONE · LONG · 15m · BTC_CORR_THEO · BTC_DOWN_WEAK · NGUOC_BTC ·
  GATE_TEST_LIQUID_LONG_BTC_COUNTER · DAY_FLAT · RSI4_RESET`, với Stage 3 `WATCH`.
- Opt-in không bỏ qua các khóa tổng: `BINANCE_ORDER_ENABLED`, dry-run, giờ cấm, TP/SL hợp lệ,
  Market Health còn mới, dedupe, vị thế/order đang tồn tại và giới hạn số vị thế vẫn được kiểm tra.
  Margin/leverage lệnh thật tiếp tục theo cấu hình whitelist chung; paper test vẫn giữ `$10`.
- Không tự bật key, không hồi tố lệnh cũ, không nâng Stage 3 và không đổi entry, direction,
  paper size, SL hoặc TP. Đây là quyền do người dùng chủ động cấp qua checkbox, không phải gate tự động.
- Tương thích JSON cũ: chỉ mở rộng tập prefix whitelist; file vẫn giữ cấu trúc `enabledKeys`.
  Không rewrite paper JSON, không thêm field bắt buộc và reader cũ tiếp tục bỏ qua key mới.

## 2026-08-02 - Binance card whitelist dùng chung cho 4 trang

Version: `LIVE_CARD_WHITELIST_V4_20260802`.

- Phạm vi UI gồm `liquid-scan`, `ema-squeeze`, `edge-short` và `recommended-signals`.
  Liquid Scan giữ các key cũ; ba trang còn lại dùng namespace ổn định `ema:`, `edge:` và
  `recommended:`. Mỗi card thống kê có key riêng theo đúng lớp/nhãn/combo đang hiển thị.
- Checkbox chỉ xuất hiện khi AvgROE **đã đóng** của chính card thỏa `AvgROE > 4.0%`.
  Bằng `4.0%`, thấp hơn, no-data hoặc card không có thống kê closed AvgROE đều không hiện.
  PnL active realtime không được dùng thay cho AvgROE đóng.
- Dữ liệu phân loại trước entry gồm snapshot nhãn/tier/combo đã có của từng nguồn:
  Liquid Stage/Combo/Cycle; EMA stage/combo/support; Short Edge label/tier/wave/best/live;
  Recommended source/clone/2L/market-fit/day/backtest/point/dispersion/support. PnL hoặc
  outcome của lệnh mới không được dùng để quyết định lệnh đó khớp key nào.
- Cách thống kê không đổi: card vẫn tổng hợp theo date range hiện hành trước pagination và
  PnL active vẫn theo mark socket. AvgROE lịch sử chỉ quyết định **hiện quyền opt-in**; checkbox
  mặc định OFF và chỉ được ghi sau xác nhận kèm `orders_token`.
- Khi người dùng chủ động bật, chỉ tín hiệu auto **mới** của đúng nguồn và khớp ít nhất một
  key đã chọn mới được chuyển tới luồng Binance thật. Luồng vẫn bắt buộc master order ON,
  dry-run OFF, ngoài giờ cấm, TP/SL hợp lệ, Market Direction Health còn mới, dedupe,
  không có position/open order cùng symbol và không vượt giới hạn vị thế.
- Ảnh hưởng giao dịch: có thể tạo lệnh Binance MARKET thật theo `LIVE_CARD_REAL_MARGIN_USDT`
  và `LIVE_CARD_REAL_LEVERAGE` (fallback cấu hình Liquid hiện tại) khi đủ toàn bộ khóa trên.
  Không sửa cách sinh tín hiệu, paper entry/direction/size, và không thay giá trị SL/TP của
  tín hiệu; lệnh thật dùng chính TP/SL đã có. Checkbox không hồi tố lệnh cũ.
- Tương thích JSON cũ: whitelist vẫn là file atomic có mảng `enabledKeys`, tăng giới hạn đọc
  lên 2.000 key và không rewrite paper store. EMA/Short Edge/Recommended mới chỉ append các
  field audit tùy chọn `liveCard*` cho lệnh mới; field thiếu ở JSON cũ được hiểu là chưa xét/
  chưa bật. Reader cũ có thể bỏ qua field và prefix mới.

## 2026-08-02 - Tách whitelist ứng viên và quyền LỆNH THẬT tại Orders

Version: `LIVE_CARD_WHITELIST_V5_20260802`.

- Checkbox trên `liquid-scan`, `ema-squeeze`, `edge-short` và `recommended-signals` chỉ lưu card
  ứng viên vào `data/liquid-live-card-whitelist.json`. Đây là **whitelist quan sát**, không phải gate
  giao dịch và không tự cấp quyền Binance. Điều kiện hiện checkbox vẫn là closed `AvgROE > 4.0%`.
- Trang Orders đọc toàn bộ whitelist ứng viên và hiển thị danh sách theo nguồn/nhóm/key. Mỗi dòng có
  checkbox thứ hai `LỆNH THẬT`; lựa chọn này được lưu độc lập, atomic tại
  `data/live-card-real-enabled.json`. File mới khởi tạo `enabledKeys: []` và không migrate tự động
  bất kỳ key V4 nào, vì vậy sau nâng cấp mặc định không card nào được đánh thật.
- Dữ liệu dùng trước entry và điều kiện phân loại key không đổi: chỉ snapshot label/tier/combo/cycle
  của từng nguồn tại entry; không dùng PnL/outcome tương lai của chính lệnh. Thống kê card/date range,
  pagination, closed PnL/AvgROE và active PnL theo socket giữ nguyên.
- Luồng auto Binance từ nay chỉ so khớp `live-card-real-enabled.json`. Muốn đi tới lệnh thật phải đồng
  thời: card còn nằm trong whitelist ứng viên, checkbox `LỆNH THẬT` tại Orders đang bật, Order Enabled
  ON, Dry Run OFF, ngoài giờ cấm, TP/SL hợp lệ, Market Health còn mới, dedupe/position/open-order/max
  position đều đạt. Xóa card khỏi whitelist ứng viên sẽ tự gỡ quyền thật cùng key.
- Ảnh hưởng Binance/entry/size/SL/TP: thay đổi này thu hẹp quyền Binance bằng xác nhận hai bước; không
  đổi thuật toán sinh tín hiệu, side, paper entry/size, margin/leverage cấu hình, hay giá SL/TP. Không
  hồi tố lệnh cũ. API whitelist ứng viên luôn trả JSON và UI báo rõ nếu proxy trả HTML thay vì JSON.
- Tương thích JSON cũ: không sửa hoặc bulk rewrite bất kỳ paper JSON nào. Hai file cấu hình giữ schema
  đơn giản `version/updatedAt/enabledKeys`; file V4 không bị hỏng và chỉ tiếp tục làm danh sách ứng viên.
  File quyền thật mới là additive, mặc định rỗng; các field audit `liveCard*` cũ vẫn đọc như trước.
- Các card `LIQUID COMBO × CYCLE · ỔN ĐỊNH QUA NGÀY` render trực tiếp checkbox `WHITELIST` khi
  closed AvgROE của chính combo `> 4.0%`, dùng key snapshot `cycle-stable:<combo-cycle-key>` đã có.
  Checkbox này vẫn chỉ là bước ứng viên; phải bật `LỆNH THẬT` lần hai tại Orders mới ảnh hưởng Binance.

## 2026-08-02 - Binance lifecycle đồng bộ theo paper entry/fill/close

Version: `LIVE_CARD_BINANCE_LIFECYCLE_V1_20260802`.

- Phạm vi là tín hiệu auto mới đã qua whitelist hai bước V5 của `liquid-scan`, `ema-squeeze`,
  `edge-short` và `recommended-signals`. Dữ liệu dùng trước entry gồm card key đã snapshot, `paperTradeId`,
  source page/source gốc, symbol, side, margin/leverage cấu hình và TP/SL của chính tín hiệu. Không dùng
  PnL/outcome tương lai để quyết định entry.
- Điểm kích hoạt Binance được đồng bộ với paper: tín hiệu `PENDING` không còn đặt lệnh thật lúc mới tạo;
  chỉ khi paper thực sự chuyển sang `OPEN`/đã khớp entry mới gửi Binance `MARKET`. Tín hiệu vốn tạo trực tiếp
  ở trạng thái `OPEN` vẫn gửi `MARKET` ngay tại source-open event. Luồng card này không dùng `LIMIT` hay
  `LIMIT_IOC`.
- Mỗi lệnh có `lifecycleId`, `entryOrderId` và `entryClientOrderId`. Listener user-data chỉ nhận đúng fill
  mở vị thế của order này; chỉ khi `ORDER_TRADE_UPDATE` báo `FILLED` mới đặt `TAKE_PROFIT_MARKET` và
  `STOP_MARKET`. Partial fill chỉ được ghi log và tiếp tục chờ full fill. TP/SL có client-id gắn lifecycle.
  Nếu socket bỏ lỡ update, recovery REST chỉ đặt bảo vệ sau khi xác nhận vị thế MARKET đủ quantity.
- Khi paper/bot đóng tín hiệu vì TP, SL, trailing SL, timeout hoặc rule close khác, hệ thống claim lifecycle
  một lần rồi gửi lệnh `MARKET` ngược chiều với `reduceOnly` (one-way) hoặc đúng `positionSide` (hedge).
  Khối lượng đóng là `min(position hiện tại, khối lượng bot đã fill)`, nên không tự đóng phần vị thế cùng
  symbol do người dùng tăng thêm. Nếu Binance đã đóng bởi TP/SL trước đó thì ghi `POSITION_ALREADY_CLOSED`
  và không gửi lệnh dư.
- Thống kê/audit tách theo `sourceType` và `originSourceType` (`liquid`, `ema`, `pump`, `short-edge`,
  `recommended`). State atomic nằm ở `data/live-card-binance-state.json`; chuỗi sự kiện append-only nằm ở
  `data/live-card-binance-events.ndjson`. Orders hiển thị số lifecycle/submitted/filled/protected/bot-close/error
  theo nguồn; API chi tiết `/api/live-card-binance-lifecycle` bắt buộc Orders token.
- Ảnh hưởng giao dịch thật: **có** đối với card đã được người dùng bật `LỆNH THẬT`: entry Binance luôn MARKET,
  TP/SL được dời sang sau full fill socket, và bot close được đồng bộ bằng MARKET reduce-only. Không đổi thuật
  toán chọn signal/card, side, paper size, giá TP/SL, whitelist, giờ cấm, dedupe, max-position hoặc master
  Order Enabled/Dry Run.
- Tương thích JSON cũ: không đổi top-level hay rewrite các file paper lịch sử. Trade mới chỉ append field tùy
  chọn `liveCardLifecycleId/liveCardExecutionVersion/liveCardSourceType/liveCardSignalSource/
  liveCardEntryOrderType` (Liquid có alias `liquidLiveCard*`). Reader cũ có thể bỏ qua; trade cũ thiếu lifecycle
  sẽ không bị auto-close để tránh cắt nhầm vị thế. Hai file lifecycle mới độc lập với paper JSON.

## 2026-08-02 - Pump Paper WAL và Binance auth circuit breaker

Version: `PUMP_PAPER_WAL_V1_20260802` và `BINANCE_AUTH_CIRCUIT_V1_20260802`.

- Dữ liệu trước entry, điều kiện sinh tín hiệu, nhãn, tier, gate, direction, size, margin, leverage, entry,
  SL và TP giữ nguyên. Thay đổi này chỉ tối ưu persistence/runtime sau khi một Pump/EMA paper trade được tạo,
  fill, cập nhật quản trị hoặc đóng.
- `data/pump-paper-trades.json` tiếp tục là snapshot lịch sử gốc và vẫn được nạp đầy đủ một lần khi khởi động.
  Mỗi mutation realtime sau đó append một event `UPSERT` hoặc `DELETE` vào
  `data/pump-paper-trades.wal.ndjson`; khi restart, WAL được replay theo `trade.id` lên snapshot trước khi xây
  active index và thống kê. Dòng WAL cuối bị dở do crash được bỏ qua, các dòng hợp lệ trước đó vẫn dùng được.
- Cách thống kê không đổi: API/page vẫn nhìn cùng mảng trade đầy đủ sau replay, gồm closed history và active,
  nên date range, pagination, PnL đóng, AvgROE và active PnL theo socket không bị chuyển sang thống kê theo page.
  Hot path không còn rewrite toàn bộ snapshot hàng trăm MB cho từng fill/TP/SL/timeout.
- Signed Binance REST có circuit breaker riêng. Khi Binance trả `-2015` (API key/IP/quyền không hợp lệ), các
  signed request đang chờ được trả lỗi nhanh và signed REST tạm ngừng mặc định 5 phút
  (`BINANCE_AUTH_FAILURE_BLOCK_MS`). Public market REST/socket vẫn tiếp tục hoạt động; hết thời gian sẽ thử lại
  một request để tự hồi phục khi credential/IP đã được sửa.
- Ảnh hưởng Binance/entry/size/SL/TP: không thay đổi quyết định hoặc tham số giao dịch. Circuit breaker chỉ
  ngăn retry signed REST vô ích khi Binance đã từ chối xác thực; không tự bật/tắt whitelist, không tạo lệnh mới,
  không sửa TP/SL và không đóng vị thế.
- Tương thích JSON cũ: không sửa schema hoặc bulk rewrite `pump-paper-trades.json`. WAL là file additive độc lập;
  trade cũ thiếu mọi metadata WAL vẫn đọc như trước. Event chỉ chứa bản trade hiện hành hoặc `id` cần xóa và
  không thay cấu trúc JSON nguồn.

## 2026-08-02 - Discord thông báo fill lệnh thật

Version: `REAL_ORDER_FILL_DISCORD_V1_20260802`.

- Webhook riêng được cấu hình qua `ORDER_FILL_WEBHOOK_URL`; URL bí mật chỉ nằm trong runtime `.env`, không ghi
  vào Markdown hoặc JSON dữ liệu.
- Không dùng dữ liệu tương lai để phân loại tín hiệu. Điều kiện gửi là Binance user-data socket nhận
  `ORDER_TRADE_UPDATE` có execution type `TRADE`, filled quantity dương và `reduceOnly=false`, tức lệnh đã thực
  sự mở hoặc tăng vị thế. Chỉ gửi khi order đạt `FILLED`; partial fill vẫn được lifecycle xử lý nhưng không gửi
  Discord, reduce-only close không gửi. Mỗi order được chống gửi trùng trong 24 giờ; nếu webhook lỗi thì bỏ khóa
  chống trùng để update hợp lệ tiếp theo có thể thử lại.
- Nội dung gồm symbol, BUY/SELL tương ứng LONG/SHORT, cumulative filled quantity, average fill, position side,
  nguồn tín hiệu, margin/leverage nếu có, order ID và thời gian fill.
  Lỗi webhook chỉ được log, không làm fail order, TP/SL hoặc position monitor.
- Cách thống kê tín hiệu/paper không đổi và không tạo cohort/nhãn mới. Không ảnh hưởng Binance entry, direction,
  size, margin/leverage, SL, TP, bot-close, whitelist hay master/dry-run.
- Tương thích JSON cũ: không đọc/ghi hoặc thêm field JSON; đây chỉ là side effect thông báo sau fill thật.

## 2026-08-02 - Cố định credential cho Binance background

Version: `BINANCE_BACKGROUND_CREDENTIAL_PRIORITY_V1_20260802`.

- Nguyên nhân `-2015` tái diễn: trang Orders có thể tự đăng nhập bằng credential cũ đã lưu ở trình duyệt;
  `getApiCredentials(null)` trước đây ưu tiên session đầu tiên nên socket, auto-order, position monitor và TP/SL nền
  bị session UI ghi đè dù credential `.env` vẫn hợp lệ.
- Runtime mới: request Orders có token vẫn dùng đúng credential của token; mọi tác vụ background không có token
  ưu tiên `BINANCE_API_KEY/BINANCE_API_SECRET` trong `.env`, chỉ fallback session nếu server không cấu hình `.env`.
- Dữ liệu tín hiệu trước entry, điều kiện nhãn/tier/gate và cách thống kê không đổi. Thay đổi chỉ chọn nguồn
  credential cho Binance background; không đổi side, margin/size, leverage, entry type, SL, TP, dedupe hoặc whitelist.
- Không thêm/sửa schema JSON, không rewrite lịch sử và tương thích toàn bộ JSON cũ. Credential không được ghi vào
  JSON, Markdown hoặc log.

## 2026-08-03 - PPKS paper-only và chống kẹt Binance REST queue

Version: `BINANCE_REST_RECOVERY_V2_20260803` và `PPKS_BINANCE_HARD_OFF_V1_20260803`.

- `/post-pump-kill-short` được khóa cứng thành paper/observe-only ở code. Scanner, SSE, Discord tín hiệu,
  paper auto-fire và thống kê PPKS vẫn chạy; handler Binance không được gọi và cũng tự return ngay cả khi
  biến môi trường legacy vô tình được bật. Cảnh báo hệ thống Binance chỉ gửi khi cấu hình webhook riêng
  `BINANCE_REST_ALERT_WEBHOOK_URL`, không fallback sang webhook chiến lược PPKS; nếu hai biến đang trỏ cùng
  một URL thì cảnh báo REST cũng bị bỏ qua để bảo vệ kênh PPKS.
- Dữ liệu dùng trước entry, điều kiện nhận diện confirmed/watch, score/grade, combo, side, entry paper, SL/TP
  và cách thống kê PPKS không đổi. PPKS không còn bất kỳ ảnh hưởng Binance/entry thật/size/margin/leverage/SL/TP
  nào; các trang live-card khác vẫn giữ nguyên whitelist hai bước và lifecycle đang chạy.
- Binance REST gate coalesce request GET trùng khi đang queued/active, loại request xếp hàng quá 45 giây và
  cưỡng bức nhả active slot nếu một task treo quá 30 giây. Snapshot chẩn đoán bổ sung `activeTop` để thấy source,
  endpoint và tuổi của request đang chạy. GET mới bị từ chối nhanh khi queue đã congested; POST/DELETE đặt, hủy,
  đóng lệnh vẫn giữ ưu tiên cao và không bị chính sách drop của read request.
- Timestamp/signature signed REST được tạo khi request thực sự rời queue, tránh chữ ký hết `recvWindow` do chờ.
  Timeout HTTP bắt đầu ở thời điểm fetch chạy; listen-key/keepalive/account UID cũng có timeout. Balance,
  daily PnL, symbols và open-orders có single-flight cache; BTC contra-trend monitor, position REST sync không
  chạy chồng nhau. Các thay đổi này chỉ điều phối REST, không sửa rule tín hiệu hoặc giá giao dịch.
- Cách thống kê tín hiệu/paper giữ nguyên. Rate gate chỉ thống kê queue/active/request-weight runtime; không dùng
  PnL tương lai để phân loại hoặc gate lệnh.
- Tương thích JSON cũ: không đổi, không rewrite và không thêm field vào bất kỳ paper/snapshot JSON nào. Toàn bộ
  thay đổi nằm ở runtime queue/cache và hard lock PPKS; file JSON cũ tiếp tục đọc như trước.

## 2026-08-03 - Auto Binance chỉ dành cho card được bật LỆNH THẬT trong Orders

Version: `LIVE_CARD_ONLY_V1_20260803`.

- Dữ liệu trước entry giữ nguyên theo từng nguồn. Quyền auto Binance được xác định bằng hai snapshot cấu hình
  trước entry: card phải còn trong whitelist ứng viên và cùng key đó phải còn được bật `LỆNH THẬT` tại Orders.
  Sau khi matcher xác nhận, backend cấp một authorization nội bộ không tuần tự hóa; tự khai báo `source` hay field
  JSON giống live-card không thể giả quyền này.
- Đây là policy thực thi, không phải nhãn/tier/gate chất lượng mới. Không đổi cách tính tín hiệu, PnL, WR, PF,
  AvgROE, snapshot entry hoặc thống kê. Paper và OBSERVE ONLY vẫn chạy đầy đủ như trước.
- Khi `LIVE_CARD_WHITELIST_ONLY_AUTO_BINANCE=true` (mặc định), các entry auto cũ độc lập bị tắt ở cả runtime
  handler và khóa trung tâm: AutoTrader, Pump Auto, AutoLiq/AutoProbe, EMA Squeeze real, EMA99 Kill Reclaim real,
  Shakeout real, Post-pump Dump Risk, Post-dump Bounce Risk, Post-pump Kill Short và Avg-down. Endpoint Pump Auto
  test cũng không được dùng để đi vòng policy.
- Ảnh hưởng Binance: chỉ auto entry từ card checked được phép đi tiếp tới MARKET lifecycle. Lệnh thủ công có
  session Orders hợp lệ vẫn được phép. TP/SL khi fill, trailing/protection, bot-close theo lifecycle, đóng vị thế
  thủ công và các thao tác bảo vệ vị thế đã mở không bị tắt. Các khóa tổng `BINANCE_ORDER_ENABLED`, dry-run, giờ
  cấm, dedupe, max positions và TP/SL hợp lệ vẫn áp dụng sau policy này.
- Tương thích JSON cũ: không rewrite, không thay schema paper/snapshot/whitelist và không thêm field bắt buộc.
  Authorization dùng Symbol chỉ tồn tại trong bộ nhớ của request hiện tại, không thể lọt vào JSON. Biến env mới
  có default an toàn nên cấu hình cũ thiếu biến vẫn tự chạy chế độ chỉ-card-checked.

## 2026-08-03 - Discord cảnh báo lỗi lệnh thật từ live-card whitelist

Version: `LIVE_CARD_BINANCE_FAIL_DISCORD_V1_20260803`.

- Dữ liệu dùng trước entry và điều kiện xác định ứng viên giữ nguyên: chỉ tín hiệu auto mới đã khớp ít nhất một
  key vừa thuộc whitelist ứng viên vừa được bật `LỆNH THẬT` tại Orders mới có thể phát cảnh báo lỗi. `NO_CARD_MATCH`,
  card observe-only và paper lịch sử không gửi để tránh spam.
- Cảnh báo được phát ở ba pha thất bại: signed REST preflight vị thế/open-order, submit MARKET tới Binance, hoặc
  `placeOrder` trả kết quả không phải `submitted`. Nội dung chỉ gồm page/pha, paper trade id, symbol/side, nguồn
  tín hiệu, real-card đã khớp, lỗi và snapshot REST gate; tuyệt đối không chứa API key/secret.
- Webhook ưu tiên `LIVE_CARD_ORDER_WEBHOOK_URL`; nếu để trống dùng đúng `ORDER_FILL_WEBHOOK_URL` đã cấu hình cho
  fill lệnh thật. Chống lặp theo trade/pha/lỗi trong 30 phút; lỗi Discord chỉ ghi log và không làm thay đổi kết quả
  Binance. Khi lỗi xảy ra trước lifecycle, audit paper tương lai giữ lại `liveCardMatchedKeys` và whitelist version
  thay vì mất thành mảng rỗng.
- Cách phân loại nhãn/tier/gate và toàn bộ thống kê PnL/WR/AvgROE không đổi. Thay đổi không retry tín hiệu, không
  tự đặt thêm lệnh, không đổi side, entry MARKET, margin/size, leverage, SL, TP, bot-close, dedupe, giờ cấm hoặc
  max positions.
- Tương thích JSON cũ: không bulk rewrite và không thêm field bắt buộc. Các field audit live-card vốn đã optional;
  trade cũ thiếu chúng vẫn đọc bình thường. Không ghi webhook hoặc credential vào JSON.

## 2026-08-03 - Giữ nguyên TP/SL tín hiệu cho lệnh thật từ card whitelist

Version: `LIVE_CARD_SIGNAL_PROTECTION_V1_20260803`.

- Dữ liệu dùng trước entry chỉ gồm card đã bật `LỆNH THẬT`, source/page, symbol/side và giá `TP/SL` đã có trong
  snapshot của chính tín hiệu trước entry. Không dùng PnL, mark price hoặc kết quả sau entry để thay đổi phân loại.
- Điều kiện áp dụng: lifecycle có source `live-card-whitelist-*` hoặc field optional
  `preserveSignalProtection=true`. Entry vẫn là MARKET như version lifecycle hiện tại. Sau full fill, TP giữ đúng
  giá tín hiệu và dùng `CONTRACT_PRICE` để bắt cú chạm nhanh của giá khớp; SL giữ đúng giá tín hiệu và dùng
  `MARK_PRICE` để hạn chế wick đơn lẻ kích hoạt stop.
- Hai cơ chế trailing SL chung (scanner REST/tick và safety/position monitor) bỏ qua riêng vị thế đang có live-card
  signal protection. Missing-TP scanner chỉ khôi phục TP tín hiệu với đúng `CONTRACT_PRICE`, không thay bằng TP ROE
  cố định và không dùng negative-TP guard để dời TP về entry. Nếu phải xóa order vì Binance báo quá nhiều stop,
  SL được khôi phục từ `signalSl`; không tính lại theo ROE cố định. Sau PM2 restart, `REST_SYNC` dựng lại protection
  plan từ `sl-tracking` và đặt lại đúng cặp TP/SL signal, không đi qua fallback guard chung.
- Cách thống kê nhãn/tier/WR/PnL/PF/AvgROE không đổi. Đây là rule bảo vệ exit Binance, không phải nhãn chất lượng,
  gate tín hiệu hay bộ lọc mới.
- Ảnh hưởng Binance: có, nhưng chỉ ở TP/SL của vị thế thật khởi tạo từ card whitelist. Không đổi side, entry,
  margin/size, leverage, dedupe, max positions hoặc bot-close. Các lệnh manual và nguồn không thuộc live-card tiếp tục
  dùng trailing/TP guard cũ.
- Tương thích JSON cũ: chỉ thêm các field optional `signalProtectionVersion`, `preserveSignalProtection`,
  `takeProfitWorkingType`, `stopLossWorkingType` vào lifecycle/sl-tracking mới. JSON cũ không bị rewrite; record cũ
  thiếu field vẫn được nhận diện an toàn bằng prefix `signalSource=live-card-whitelist-*`, còn nguồn khác giữ default
  `MARK_PRICE` và hành vi cũ.

## 2026-08-03 - Circuit Binance `-2015` tách theo credential và tự probe hồi phục

Version: `BINANCE_AUTH_CIRCUIT_SCOPED_RECOVERY_V2_20260803`.

- Dữ liệu runtime dùng trước Binance entry chỉ gồm fingerprint SHA-256 rút gọn của cặp API key+secret đang thực
  hiện signed REST, source/method/path của request và kết quả Binance. Listen-key dùng scope riêng chỉ theo API key.
  Không log API key/secret, không dùng PnL hoặc dữ liệu
  tương lai và không thay điều kiện chọn card/tín hiệu.
- Khi Binance trả `-2015`, circuit chỉ khóa đúng fingerprint credential + loại auth (`signed` hoặc `listen`) gây lỗi. Session Orders cũ/sai không còn
  làm signed REST bằng credential `.env` hợp lệ bị khóa chung. Queue chỉ loại request signed cùng fingerprint;
  public REST và credential khác tiếp tục chạy.
- Trong thời gian block 5 phút, mỗi fingerprint được phép một recovery probe sau mỗi 15 giây
  (`BINANCE_AUTH_RECOVERY_PROBE_MS`). Probe thành công đóng circuit ngay; probe còn `-2015` dời lần probe tiếp theo
  và log rõ fingerprint/source/endpoint gây lỗi. Snapshot gate giữ nguyên hai field tổng hợp
  `authBlockedUntil/authBlockReason` để tương thích và bổ sung danh sách chẩn đoán `authBlocks`. Alert Discord lỗi
  live-card cũng hiện scope/source/method/path và thời gian tới recovery probe, không chứa credential thô.
- Cách tính nhãn/tier/gate, PnL/WR/PF/AvgROE và mọi thống kê paper không đổi. Đây là điều phối xác thực Binance,
  không phải nhãn hoặc rule chọn lệnh.
- Ảnh hưởng Binance: giảm thời gian signed REST bị khóa sau IP/VPN chập chờn và cô lập session lỗi. Không tự replay
  tín hiệu đã fail để tránh entry muộn; chỉ request/tín hiệu mới sau khi probe hồi phục được xử lý. Không đổi side,
  entry MARKET, margin/size, leverage, dedupe, max positions, TP, SL hay bot-close.
- Tương thích JSON cũ: không đọc/ghi lại paper, snapshot, whitelist hay lifecycle JSON; không thêm field bắt buộc.
  `authBlocks` chỉ tồn tại trong snapshot chẩn đoán runtime và các field tổng hợp cũ vẫn được giữ nguyên.

## 2026-08-03 - Xác thực credential trước khi tạo session Orders

Version: `ORDERS_AUTH_PREFLIGHT_V1_20260803`.

- Trước khi cấp token `/api/auth`, backend dùng chính API key/secret người dùng nhập để gọi read-only Futures
  balance. Chỉ credential được Binance chấp nhận mới được lưu trong session memory; `-2015` trả HTTP 401 với mã
  `BINANCE_AUTH_REJECTED` và không tạo token.
- Preflight login chạy qua REST gate riêng, không dùng gate của auto-order/position protection. Fingerprint bị
  Binance từ chối được cache mặc định 1 giờ (`ORDERS_AUTH_REJECT_COOLDOWN_MS`), nên tab cũ có retry cũng nhận 401
  ngay mà không gọi lại Binance hoặc làm `authBlocks` của gate giao dịch thật chuyển đỏ.
- Frontend Orders không còn giữ vòng auto-login với credential cũ: khi auto re-auth thất bại, token và
  `orders_creds` cũ được xóa khỏi localStorage, giao diện yêu cầu nhập lại. Credential thô không được ghi vào log,
  Markdown hoặc JSON server.
- Dữ liệu tín hiệu trước entry, nhãn/tier/gate và PnL/WR/PF/AvgROE không đổi; đây chỉ là kiểm tra quyền truy cập
  Orders. Không đặt lệnh trong preflight và không thay side, MARKET entry, size/margin, leverage, TP/SL, bot-close,
  whitelist hay dedupe.
- Tương thích JSON cũ: không đọc/ghi hoặc rewrite paper/snapshot/whitelist/lifecycle JSON. Token/session chỉ ở memory;
  localStorage cũ bị xóa phía trình duyệt khi Binance từ chối để ngăn polling lỗi lặp lại.

## 2026-08-03 - Margin lệnh thật live-card tăng lên 3 USDT

Version: `LIVE_CARD_REAL_MARGIN_3_USDT_V1_20260803`.

- Dữ liệu dùng trước entry, điều kiện phân loại và whitelist không đổi: chỉ tín hiệu khớp card đã bật `LỆNH THẬT`
  mới được đi tiếp. Thay đổi chỉ đọc cấu hình cố định `LIVE_CARD_REAL_MARGIN_USDT=3` sau khi tín hiệu đã đủ điều kiện.
- Cách tính và thống kê nhãn/tier/PnL/WR/PF/AvgROE của paper không đổi; không dùng kết quả sau entry để chọn size.
- Ảnh hưởng Binance: có, chỉ với lệnh live-card mới. Margin tăng từ 1 lên 3 USDT; leverage mặc định vẫn 10x nên
  notional mục tiêu khoảng 30 USDT trước bước làm tròn quantity của từng symbol. Không đổi side, MARKET entry,
  TP/SL tín hiệu, bot-close, dedupe, max positions hoặc các card whitelist đang bật. Vị thế đã mở không đổi size.
- Tương thích JSON cũ: không rewrite paper/snapshot/whitelist/lifecycle JSON và không thêm field bắt buộc. Lifecycle
  mới tiếp tục ghi field `marginUsdt` sẵn có với giá trị 3; record cũ giữ nguyên giá trị lịch sử.

## 2026-08-04 - Short Edge LONG SPRING xác nhận kép

Versions: `edge-short-long-spring-observe-v1-20260804` và
`edge-short-long-spring-whitelist-v1-20260804`.

- Dữ liệu dùng trước entry: `side`, setup Short Edge, `entryPrice/tp/sl`, hướng nến alt và nến BTC đã đóng tại
  entry, cùng `LONG/SHORT market score` trong `marketDirectionAtSignal`. Không dùng PnL, ROE, outcome hoặc dữ liệu
  phát sinh sau entry để gắn nhãn.
- `LONG SPRING CONFIRMED`: `LONG + SC_SPRING`, nến alt `BULLISH`, nến BTC `BULLISH` và
  `SHORT score - LONG score >= 15`. `LONG SPRING PRIME` là tập con của CONFIRMED, thêm
  `abs(tp-entry) / abs(entry-sl) < 0.7`. Badge Paper ưu tiên PRIME nếu cùng thỏa hai lớp.
- Thống kê trên Short Edge tách hai card bao hàm: CONFIRMED chứa toàn bộ tín hiệu xác nhận, PRIME chỉ chứa tập con
  RR chặt hơn. Mỗi card hiện tổng/active/pending/closed, W/L, WR, PF, PnL đóng, PnL active, tổng PnL, AvgROE và số
  ngày dương theo `Asia/Bangkok`. PnL active tiếp tục lấy mark socket qua luồng enrich hiện hữu.
- Bản thân nhãn vẫn là `OBSERVE ONLY`: không gate/chặn tín hiệu và không đổi entry, size/margin, leverage, SL, TP
  hoặc paper test. Card có thêm live-card key `edge:long-spring:CONFIRMED|PRIME`; checkbox WHITELIST chỉ hiện khi
  AvgROE đóng `> 4%` theo guard chung. Check tại Short Edge mới chỉ lưu ứng viên, chưa cấp quyền Binance.
- Ảnh hưởng Binance chỉ có thể phát sinh cho tín hiệu mới sau khi chính key đó còn được bật bước hai `LỆNH THẬT`
  tại Orders và tiếp tục vượt qua master Order Enabled, dry-run, giờ cấm, health freshness, dedupe, max positions và
  lifecycle MARKET/TP/SL hiện hữu. Không tự bật checkbox, không hồi tố và không thay rule bảo vệ lệnh.
- Tương thích JSON cũ: lệnh mới chỉ append các field optional prefix `edgeShortLongSpring*`. Lịch sử thiếu field
  được suy diễn trong bộ nhớ khi đọc để thống kê/badge, có `edgeShortLongSpringDerived=true`; không bulk rewrite và
  không thay cấu trúc top-level `{ trades: [] }` của `edge-paper-trades.json`. Lựa chọn whitelist nằm trong file
  whitelist độc lập; không ghi ngược vào paper JSON.

## 2026-08-04 - Short Edge combo whitelist khớp trực tiếp tại entry

Version: `LIVE_CARD_COMBO_ENTRY_MATCH_V1_20260804`.

- Dữ liệu dùng trước entry chỉ là `pumpCombo`/combo fallback đã có trong snapshot của chính tín hiệu Short Edge
  mới. Key `edge:combo:*` được tạo trực tiếp khi paper trade vừa `OPEN`; không đọc PnL, ROE, outcome hoặc số lệnh
  đã đóng của combo để quyết định khớp whitelist.
- Điều kiện phân loại combo và nội dung key không đổi. Thay đổi chỉ sửa matcher: trước đây key đi vòng qua
  `pumpComboStatsOf([trade])`, trong khi thống kê này loại bucket có `closed=0`, nên tín hiệu mới luôn thành
  `NO_CARD_MATCH`. Thống kê card trên UI vẫn tiếp tục yêu cầu lịch sử đóng như cũ và không bị nới điều kiện màu,
  AvgROE hay nút WHITELIST.
- Ảnh hưởng Binance: có đối với tín hiệu Short Edge tương lai khớp chính xác combo đã bật cả WHITELIST và
  `LỆNH THẬT`; chúng nay có thể đi tiếp tới các gate runtime hiện hữu. Không replay 94 tín hiệu cũ đã bị
  `NO_CARD_MATCH`, không tự bật card và không đổi side, MARKET entry, margin/size, leverage, TP, SL, bot-close,
  health freshness, giờ cấm, dedupe, existing position/order hoặc max positions.
- Cách thống kê PnL/WR/PF/AvgROE và mọi nhãn/tier/gate tín hiệu không đổi; đây là sửa lỗi authorization matcher,
  không biến card OBSERVE ONLY thành rule giao dịch nếu card chưa được cấp quyền thật tại Orders.
- Tương thích JSON cũ: không rewrite file paper, whitelist, real-enabled hoặc lifecycle. Audit lệnh mới thêm field
  optional `liveCardComboEntryMatchVersion`; record cũ thiếu field vẫn đọc bình thường và được hiểu là matcher cũ.
  Cấu trúc JSON và toàn bộ key whitelist đã lưu được giữ nguyên.

## 2026-08-04 - Thống kê Binance lifecycle theo đúng whitelist và PnL đóng thật

Versions: `LIVE_CARD_BINANCE_LIFECYCLE_V2_20260804` và
`LIVE_CARD_WHITELIST_PNL_STATS_V1_20260804`.

- Dữ liệu dùng trước entry và điều kiện phân loại tín hiệu không đổi. Cohort thống kê lấy chính mảng
  `matchedKeys` đã được matcher whitelist đóng băng trước lúc gửi MARKET entry; không suy ngược card từ source,
  nhãn hiện tại hoặc kết quả sau entry. Lifecycle khớp nhiều key được tính vào từng cohort card và UI cảnh báo
  không cộng chéo các hàng.
- Với lifecycle `POSITION_CLOSED`, backend đối soát Binance Futures income trong cửa sổ từ submitted/attempted
  đến lúc position đóng theo đúng symbol. PnL đóng NET = `REALIZED_PNL + COMMISSION + FUNDING_FEE`; chỉ đánh dấu
  đã biết khi có record `REALIZED_PNL`. Dòng chưa lấy được income hiển thị thiếu dữ liệu, tuyệt đối không dùng PnL
  paper làm fallback. UI thống kê mỗi key: tổng, submitted, filled, đã đóng, TP/SL, bot-close, lỗi và PnL đóng.
- Đây là thống kê hậu kiểm trên trang Orders. Không đổi whitelist được bật, không gate/chặn/mở lệnh, không đổi
  side, MARKET entry, margin/size, leverage, dedupe, max positions, SL, TP hoặc bot-close. Đọc income là signed
  read-only, có cache 60 giây và tôn trọng REST congestion gate.
- Tương thích JSON cũ: giữ nguyên top-level lifecycle `{ executions: [] }`; chỉ append các field optional
  `closedPnl*` vào record đã đối soát. Record cũ thiếu field vẫn đọc và hiển thị `chưa đối soát`; file paper,
  snapshot, whitelist và real-enabled không bị rewrite hoặc đổi schema.

## 2026-08-04 - Discord Binance fill ghi exact whitelist và combo

Version: `BINANCE_FILL_WHITELIST_CONTEXT_V1_20260804`.

- Dữ liệu dùng trước entry giữ nguyên. Lifecycle mới lưu thêm `signalCombo` từ combo snapshot sẵn có của chính
  tín hiệu (`recommendationCombo/liquidCombo/pumpCombo/...`) và tiếp tục giữ `matchedKeys` exact đã authorize.
- Discord fill không còn gọi raw source ID như `emasq-5m-*` là “Signal Source” dễ nhầm với whitelist. Thông báo
  mới tách rõ `Execution Page`, `Raw Signal ID`, `Matched Whitelist (exact)`, `Combo / Signal at Entry` và
  `Lifecycle`, bên cạnh qty/fill/margin/leverage/order/time.
- Đây chỉ là audit sau khi Binance báo full fill. Không thêm/xóa card whitelist, không đổi matcher hoặc gate, và
  không tác động side, MARKET entry, margin/size, leverage, TP, SL, bot-close, dedupe hay thống kê PnL.
- Tương thích JSON cũ: `signalCombo` là field lifecycle optional; record cũ thiếu field vẫn hiển thị `signalLabel`
  hoặc `-`. Không rewrite paper/snapshot/whitelist và không thay top-level lifecycle JSON.

## 2026-08-04 - Orders Open Positions dùng Binance socket PnL

Version: `ORDERS_POSITION_PNL_STREAM_V1_20260804`.

- Dữ liệu realtime không liên quan phân loại tín hiệu trước entry. Backend ghép Binance user-data socket
  (`ACCOUNT_UPDATE`: position amount/entry/position side) với `markPrice@1s`; REST position risk chỉ làm snapshot
  khởi tạo, bổ sung liquidation price và fallback khi socket chưa sẵn sàng.
- Trang Orders nhận full-precision `positionAmt`, `entryPrice`, `markPrice` và `unRealizedProfit` qua event stream
  có xác thực. PnL chưa thực hiện được tính theo cùng công thức Futures `(markPrice-entryPrice)*positionAmt`; ROE
  hiển thị dùng position initial margin, không dùng số giá đã format trong table. Khi fill/DCA thay size/entry hoặc
  position đóng, user-data socket cập nhật cohort dòng ngay, không chờ vòng REST 30-60 giây.
- Đây chỉ là nguồn dữ liệu hiển thị Open Positions. `managementRoe` cũ vẫn được giữ riêng cho avg-down/trailing/
  timeout nên thay đổi không tạo/cắt lệnh, không đổi whitelist/gate/dedupe, MARKET entry, side, margin/size,
  leverage, TP, SL hoặc bot-close. PnL đóng/lifecycle/stat paper không đổi.
- Tương thích JSON cũ: không đọc/ghi lại paper, snapshot, whitelist, lifecycle hay orders JSON; stream chỉ truyền
  payload runtime additive. Trình duyệt vẫn dùng `/api/positions` REST làm fallback nếu socket/proxy gián đoạn.
## 2026-08-04 - Live Card whitelist max open positions 30

- Version: `LIVE_CARD_MAX_OPEN_POSITIONS_V2_20260804`.
- Dữ liệu trước entry: số vị thế Futures đang mở lấy từ Binance signed REST ở bước preflight của lệnh whitelist.
- Điều kiện: chỉ tín hiệu đã khớp card whitelist và đã bật `LỆNH THẬT`; chặn entry mới khi số vị thế mở đã đạt `30`.
- Thống kê: API trạng thái whitelist trả `maxOpenPositions = 30`; không đổi cách tính PnL/ROE hoặc thống kê theo nguồn/card.
- Binance: có ảnh hưởng gate số lượng vị thế thật, tăng trần từ `10` lên `30`; không đổi entry type, margin `$3`, leverage, dedupe, size, TP hoặc SL.
- JSON cũ: không sửa hay migrate JSON; cấu hình chỉ đọc từ environment và fallback runtime.

## 2026-08-05 - Edge paper journal-first và transaction chống mất lệnh

Version: `EDGE_PAPER_ENTRY_JOURNAL_V1_2026_08_05`.

- Dữ liệu dùng trước entry giữ nguyên toàn bộ snapshot Short Edge hiện hữu: symbol, side, setup/combo, entry,
  TP/SL, nhãn/tier/market point và exact whitelist keys. Journal không bổ sung dữ liệu hậu nghiệm vào phân loại.
- Với tín hiệu Edge `OPEN` được đánh dấu auto-eligible, bot fsync một record `PREPARED` nhỏ vào file NDJSON riêng
  trước khi gọi Binance MARKET. Khi Binance trả kết quả, paper được upsert theo đúng `paperTradeId` trong hàng đợi
  transaction và journal ghi `COMMITTED`. PENDING chạm giá socket dùng cùng trình tự.
- Mọi mutation create/fill/close/delete của Edge nay hợp nhất theo ID trên store mới nhất; không còn ghi nguyên một
  snapshot JSON cũ đè lên tín hiệu vừa được luồng khác lưu. Startup đọc journal để phục hồi row bị thiếu/chưa
  commit nhưng tuyệt đối không tự phát lại Binance entry. Delete ghi tombstone để row không bị hồi sinh.
- Cách thống kê nhãn/tier/WR/PF/PnL/AvgROE không đổi. Việc sửa chỉ giữ đủ paper row để số liệu và lifecycle Binance
  đối chiếu đúng 1:1 hơn; journal không tham gia xếp loại card.
- Ảnh hưởng Binance: không đổi whitelist, gate, side, MARKET entry, margin/size, leverage, dedupe, max positions,
  TP, SL hoặc bot-close. Chỉ bảo đảm có durable paper intent trước API call và chống đặt lại sau restart.
- Tương thích JSON cũ: `edge-paper-trades.json` tiếp tục giữ top-level `{ trades: [] }`, không thêm field bắt buộc
  và không bulk migrate. Journal nằm riêng tại `data/edge-paper-entry-journal.ndjson`; reader bỏ qua dòng cuối lỗi
  hoặc version lạ, nên JSON lịch sử cũ và consumer cũ không bị phá vỡ.

## 2026-08-08 - Nhãn Liquid LONG BTC Expansion Candidate

Version: `LIQUID_LONG_BTC_EXPANSION_V1_20260808`.

- Dữ liệu dùng trước entry: `side`, `liquidEvalBtcPhase`, `liquidStage3Tier`, `liquidStage2TargetKind`, mẫu nến BTC đã
  đóng trong `btcCandlePatternAtEntry`, và snapshot Market Point gồm `liquidMarketPointPhaseTier` cùng
  `liquidMarketPointPhaseTradeRelation`. Không đọc PnL, ROE, outcome, exit hoặc dữ liệu phát sinh sau entry.
- Điều kiện nhãn `LIQ LONG · BTC EXPANSION CANDIDATE`: `LONG + BTC_UP_STRONG + Stage 3 RISK + target khác MAIN_ZONE`.
  Ba cờ phụ chỉ giải thích context: `BTC_CANDLE_CONFIRMED` khi BTC candle là `BULLISH_MARUBOZU`; `POINT_ALIGNED` khi
  Market Point là `LONG_DOMINANT + ALIGNED`; `FAR_RUNNER` khi target là `FAR_ZONE`. Chúng không phải tier mới.
- Thống kê Liquid Scan theo date range, tách card umbrella và ba tập con có thể chồng lặp; hiển thị closed/open/pending,
  net PnL đóng, PnL active, WR, AvgROE và PF. Backtest 26/07–08/08 có 231 lệnh umbrella trên 10 ngày, AvgROE
  `+3.92%`, PF `1.46`; kết quả chỉ dùng quan sát.
- Mặc định không ảnh hưởng Binance/entry/size/SL/TP. Card có live-card key và checkbox whitelist từ V6, nhưng checkbox
  mặc định tắt và chỉ hiện khi closed AvgROE của card `> 4%`. Chỉ khi người dùng bật cả whitelist ứng viên lẫn
  `LỆNH THẬT` tại Orders thì key khớp mới có thể cấp entry Binance; bản thân nhãn vẫn `OBSERVE ONLY`.
- Tương thích JSON cũ: lệnh mới append field optional `liquidLongBtcExpansion*`. Lệnh cũ được derive khi đọc bằng
  snapshot sẵn có với basis `DERIVED_ENTRY_SNAPSHOT`; API không rewrite/bulk migrate JSON. Thiếu field bắt buộc thì
  trả `UNRATED` cùng `missingFields`; consumer cũ có thể bỏ qua toàn bộ field mới.

## 2026-08-08 - Lớp con Liquid LONG Expansion Selected / Prime Test

Version đang chạy: `LIQUID_LONG_BTC_EXPANSION_V2_20260808`.

- Dữ liệu dùng trước entry: giữ nguyên các input của Expansion Candidate V1 và bổ sung `signalPoint` đã được chụp tại
  signal/entry cùng `entryPlan.killZoneCluster.oneSidedPct`. Không đọc PnL, ROE, outcome, exit, giá sau entry hay bất kỳ
  dữ liệu hậu nghiệm nào để phân loại.
- Điều kiện phân loại dạng lồng nhau:
  - `LIQ LONG · EXPANSION SELECTED`: đã thuộc `BTC EXPANSION CANDIDATE` và `70 <= signalPoint < 90`.
  - `LIQ LONG · EXPANSION PRIME TEST`: đã thuộc `EXPANSION SELECTED` và `70 <= signalPoint < 80`.
  - `ONE-SIDED 90+ CONFIRMED`: badge giải thích khi `oneSidedPct >= 90`; không phải gate và không bắt buộc cho hai lớp trên.
  - `signalPoint >= 90` không thuộc SELECTED/PRIME vì backtest hiện tại cho thấy cohort này đã stretched và PF dưới 1.
- Cách thống kê: card riêng cho Candidate, Selected, Prime Test và One-sided 90+, cùng công thức hiện hành gồm
  closed/open/pending, net PnL đóng, PnL active, WR, AvgROE, PF và snapshot/backfill theo date range. Backtest Bangkok
  26/07–08/08 tại lúc triển khai: Candidate `236` lệnh, WR `58.9%`, PF `1.46`; Selected `72` lệnh, WR `68.1%`,
  PF `1.95`; Prime Test `19` lệnh, WR `73.7%`, PF `3.21`. Sau gom episode 15 phút: Selected `53` episode,
  WR `67.9%`, PF `2.30`; Prime Test `18` episode, WR `72.2%`, PF `3.56`. Prime vẫn mang hậu tố `TEST` vì mẫu nhỏ và chưa có
  cửa sổ out-of-sample độc lập trước 26/07.
- Mặc định không ảnh hưởng Binance/entry/size/SL/TP. Các lớp và badge vẫn `OBSERVE ONLY`, nhưng mỗi card có live-card
  key V6 và checkbox whitelist khi closed AvgROE `> 4%`; checkbox mặc định tắt. Binance chỉ được xét khi cùng key còn
  bật `LỆNH THẬT` tại Orders và toàn bộ preflight hiện hành đều đạt.
- Tương thích JSON cũ: V2 chỉ append các field optional `liquidLongBtcExpansionSignalPoint`,
  `liquidLongBtcExpansionOneSidedPct`, `*Selected`, `*PrimeTest`, `*LayerTier` và label/code tương ứng. Record V1 hoặc
  record chưa có version được derive lại khi đọc từ snapshot sẵn có với basis `DERIVED_ENTRY_SNAPSHOT`; không rewrite hay
  bulk migrate file. Thiếu `signalPoint` vẫn có thể giữ Candidate nhưng không được suy thành Selected/Prime; consumer cũ
  tiếp tục bỏ qua field mới.

## 2026-08-08 - Nhãn Liquid Combo BTC-Breadth tách riêng LONG / SHORT

Versions đang chạy: `LIQUID_COMBO_BTC_BREADTH_V1_20260808` và
`LIQUID_COMBO_CYCLE_STATS_V4_20260808`.

- Dữ liệu dùng trước entry: exact `liquidCombo + cycle`, chỉ các lệnh cùng key đã `CLOSED` với `closedAt < entryAt`;
  `candlePatternAtEntry.name`, `sweepDistancePct`; và `marketDirectionAtSignal` gồm BTC return 1h/6h cùng breadth
  tăng/giảm 1h, 3h, 6h. Snapshot Market Direction chỉ hợp lệ khi `sampleKey <= entryAt`. Lệnh mới lưu snapshot ngay
  lúc tạo trade và signal log tái sử dụng đúng snapshot này, không refresh sau entry để phân loại.
- Điều kiện chung: combo-cycle phải là `STABLE_GOOD` theo lịch sử causal, nến coin `DOJI`,
  `abs(sweepDistancePct) < 1`, BTC 1h cùng chiều side và breadth cùng chiều dẫn breadth ngược ở ít nhất 2/3 khung
  1h/3h/6h.
  - SHORT: BTC 1h `<= 0`, breadth DOWN dẫn UP ít nhất 2/3; nhãn
    `LIQ COMBO SHORT · BTC-BREADTH PRIME TEST`.
  - LONG: BTC 1h `>= 0`, breadth UP dẫn DOWN ít nhất 2/3; nhãn
    `LIQ COMBO LONG · BTC-BREADTH WATCH`. LONG giữ `WATCH LOW SAMPLE`, không được gọi PRIME vì mẫu hiện có dồn vào
    một ngày và chưa có holdout độc lập.
- `LIQUID_COMBO_CYCLE_STATS_V4_20260808` sửa bucket ngày của combo-cycle sang
  `LIQUID_PAPER_DAY_TIME_ZONE = Asia/Bangkok`; episode vẫn là 15 phút. Tiêu chí `STABLE_GOOD` không đổi: tối thiểu
  12 closed, 6 episode, 3 ngày, 3 ngày dương, positive-day rate >=60%, AvgROE >=0.5, PF >=1.2, PnL >0 và recent
  5 ngày phải dương/PF >=1/positive-day rate >=50%.
- Cách thống kê: card LONG và SHORT tách riêng; mỗi card hiển thị closed/open/pending, net PnL đóng, PnL active,
  WR, AvgROE, PF cùng số snapshot/backfill. Backtest parity đúng evaluator runtime trên 26/07–08/08:
  SHORT `15` lệnh, WR `93.3%`, PF `3.31`, AvgROE `+3.20%`, `10` episode và `6/7` ngày dương; holdout từ
  03/08 có `9` lệnh, WR `88.9%`, PF `1.33`. LONG `9` lệnh, WR `100%` nhưng chỉ thuộc một ngày, do đó chỉ WATCH.
- Mặc định không ảnh hưởng Binance/entry/size/SL/TP. Hai nhãn vẫn `OBSERVE ONLY`, nhưng sinh live-card key riêng theo
  side/tier và có checkbox whitelist khi closed AvgROE `> 4%`; checkbox mặc định tắt. Chỉ tổ hợp whitelist ứng viên +
  `LỆNH THẬT` Orders + preflight hợp lệ mới có thể cấp entry Binance.
- Tương thích JSON cũ: lệnh mới append `marketDirectionAtSignal` và các field optional
  `liquidComboBtcBreadth*`. Lệnh cũ được derive nhân quả khi đọc bằng `tradeId` trong
  `liquid-market-direction-signal-log.ndjson`, basis bắt đầu bằng `DERIVED_`; API không rewrite/bulk migrate paper
  JSON. Record thiếu log/snapshot causal hoặc field bắt buộc trả `UNRATED`; consumer cũ có thể bỏ qua field mới.
## 2026-08-08 - Combo BTC Breadth UI V1.1: luon hien thong ke LONG/SHORT

- Version hien thi: `LIQUID_COMBO_BTC_BREADTH_UI_V1_1_20260808`; version nhan van la
  `LIQUID_COMBO_BTC_BREADTH_V1_20260808`.
- Du lieu truoc entry va dieu kien phan loai khong doi: combo-cycle `STABLE_GOOD` causal, `DOJI`,
  `|sweepDistancePct| < 1`, BTC 1h cung chieu va breadth cung chieu dan toi thieu 2/3 khung 1h/3h/6h.
- Cach thong ke: Stage 3E luon hien rieng hai card LONG va SHORT trong moi khoang ngay. Neu mot side khong co
  snapshot/backfill causal hop le thi card hien `NO DATA` va `0 lenh`, thay vi an ca khu vuc.
- Day chi la sua cach hien thi thong ke `OBSERVE ONLY`; khong anh huong Binance, gate, entry, size, SL hoac TP.
- JSON cu tuong thich nhu cu: tiep tuc backfill causal khi co du signal log; khong ghi them du lieu gia de lam card hien.

## 2026-08-08 - Live-card whitelist V6 cho Stage 3D va Stage 3E

- Version: `LIVE_CARD_WHITELIST_V6_20260808`.
- Du lieu truoc entry va dieu kien phan loai nhan khong doi. Matcher chi doc cac field optional da duoc evaluator tao
  truoc entry: `liquidLongBtcExpansion*` va `liquidComboBtcBreadthMatched/Side/Tier`.
- Moi card Stage 3D co key `long-btc-expansion:<CODE>`; Stage 3E co key
  `combo-btc-breadth:<SIDE>:<TIER>`. Checkbox mac dinh tat va chi hien khi closed AvgROE cua card `> 4%`.
- Cach thong ke closed/open/pending, WR, PF, AvgROE, PnL va snapshot/backfill khong doi. Card `NO DATA` khong hien
  checkbox vi khong dat policy AvgROE.
- Nhan van `OBSERVE ONLY`. Whitelist chi luu ung vien; Binance/entry chi co the bi anh huong neu nguoi dung bat them
  dung key `LENH THAT` tai Orders va cac khoa Order Enabled, token, risk, dedupe, max-position deu dat. Khong doi
  size, leverage, SL hoac TP cua nhan.
- JSON paper cu khong rewrite. File whitelist cu van doc duoc; hai prefix moi la additive, key cu giu nguyen va
  config duoc ghi theo V6 o lan cap nhat tiep theo.
## 2026-08-08 - History lệnh thật bot + thống kê whitelist V2

- Version thống kê: `LIVE_CARD_WHITELIST_PNL_STATS_V2_20260808`; lifecycle record vẫn dùng
  `LIVE_CARD_BINANCE_LIFECYCLE_V2_20260804`.
- Dữ liệu trước entry không đổi: `matchedKeys`, source, symbol, side, margin/leverage, entry/TP/SL và order ID được
  snapshot trong lifecycle lúc bot submit/fill. History chỉ nhận execution có `entryFilledAt`, không tính request chưa fill.
- Điều kiện phân loại: mỗi execution được cộng vào từng exact whitelist key đã lưu trong `matchedKeys`; key rỗng đi vào
  bucket `unmatched:<source>:<origin>`. Không dùng whitelist hiện tại để viết lại nhãn lịch sử.
- Cách thống kê: tổng quan unique lifecycle gồm filled/active/closed, W/L, WR, PF, gross profit/loss, NET và PnL
  known/missing. Theo từng key bổ sung W/L, WR, PF, Avg NET; NET lấy Binance income đã reconcile gồm
  `REALIZED_PNL + COMMISSION + FUNDING_FEE`. Một lifecycle nhiều key được trình bày ở từng key nên không cộng chéo.
- Orders hiển thị thêm history tối đa 500 lifecycle đã fill: giờ Asia/Bangkok, source, symbol/side, exact matched label,
  status, fill price, margin/leverage, TP/SL, NET PnL và Binance order ID.
- Không ảnh hưởng Binance/entry/size/SL/TP: thay đổi chỉ đọc và trình bày audit sau entry; không đổi whitelist, real-enabled,
  gate, dedupe, max-position, order submission, protection hay bot-close.
- Tương thích JSON cũ: không rewrite `live-card-binance-state.json` hoặc NDJSON event; field thống kê mới được derive khi
  đọc. Lifecycle cũ thiếu PnL vẫn hiện history và được đếm `closedPnlMissing`; consumer cũ có thể bỏ qua response field mới.

## 2026-08-08 - Discord cảnh báo Binance auth/IP bị chặn

- Version: `BINANCE_AUTH_DISCORD_ALERT_V1_20260808`.
- Dữ liệu dùng trước entry: trạng thái runtime của signed REST circuit do Binance rate gate ghi ngay khi Binance trả
  `-2015`; gồm credential scope đã băm/ẩn danh, source, HTTP method/path, `openedAt`, `blockedUntil`, lần probe kế tiếp
  và message Binance. Không đọc outcome, PnL hoặc dữ liệu sau entry để quyết định tín hiệu.
- Điều kiện phân loại: mỗi auth circuit đang active tạo cảnh báo `[BINANCE AUTH BLOCKED] IP / API key / permission` đúng
  một lần theo `scope + openedAt`. Recovery probe thất bại chỉ kéo dài circuit, không spam lại; một circuit mới sau khi
  circuit cũ đóng sẽ có `openedAt` mới và được cảnh báo lại. Rate-limit `418/429` và queue congested giữ rule cũ.
- Cách thống kê/hiển thị: đây là operational alert, không phải nhãn giao dịch hay card thống kê. Discord hiển thị source,
  request, lỗi `-2015`, thời gian signed REST bị pause và ETA probe. Auth alert ưu tiên
  `LIVE_CARD_ORDER_WEBHOOK_URL`, fallback `ORDER_FILL_WEBHOOK_URL` (kênh tín hiệu/lệnh thật đã cấu hình), rồi mới tới
  `BINANCE_REST_ALERT_WEBHOOK_URL`.
- Ảnh hưởng Binance/entry/size/SL/TP: không đổi signal, whitelist, gate decision, entry, size, leverage, SL hoặc TP.
  Khi Binance đã chặn thì bot vốn không gửi signed REST được; thay đổi này chỉ phát cảnh báo để người vận hành biết.
- Tương thích JSON cũ: không đổi hoặc rewrite JSON/NDJSON. Snapshot in-memory của rate gate chỉ append `openedAt` trong
  từng `authBlocks[]`; consumer cũ bỏ qua field mới bình thường.

## 2026-08-08 - So sánh nhãn Binance thật với paper gốc

- Version: `LIVE_CARD_WHITELIST_PNL_STATS_V3_20260808`; lifecycle vẫn
  `LIVE_CARD_BINANCE_LIFECYCLE_V2_20260804`.
- Dữ liệu dùng trước entry: lifecycle đã snapshot `paperTradeId`, `originSourceType`, symbol, side và exact
  `matchedKeys` trước khi gửi Binance. Reader nối `paperTradeId` vào store gốc `liquid-paper-trades.json` hoặc
  `edge-paper-trades.json`, sau đó bắt buộc symbol và side phải trùng. Không dùng outcome/PnL để chọn record và không
  ghép gần đúng bằng symbol/thời gian.
- Điều kiện phân loại/cohort: chỉ lifecycle có `entryFilledAt` tham gia so sánh. Mapping trả `MAPPED`, `MISSING_ID`,
  `NOT_FOUND` hoặc `IDENTITY_MISMATCH`; chỉ `MAPPED` mới được tính paper. Mỗi exact whitelist key dùng cùng cohort bot
  đã fill; một lifecycle khớp nhiều key vẫn xuất hiện ở từng key và không được cộng chéo thành tổng unique.
- Cách thống kê: mỗi card so sánh Binance thật NET với paper gốc cùng cohort: filled/closed, W/L, WR, PF, AvgROE và
  PnL. Binance AvgROE = `closedPnlNet / marginUsdt * 100`; paper dùng `pnl`, `roe`, status/outcome đã lưu trong paper
  gốc. UI hiển thị delta WR/AvgROE, mapped/cohort, missing và thêm trạng thái paper trên từng history row. Tại thời
  điểm triển khai có `204` lifecycle đã fill, exact-map được `164`, còn `40` paper ID không còn trong store hiện tại.
- Không tạo nhãn mới. Card so sánh tái sử dụng đúng key whitelist hiện hữu và luôn có checkbox `LỆNH THẬT` nếu key còn
  trong whitelist ứng viên; mặc định/quyền hiện tại không bị thay đổi. Key historical không còn là ứng viên chỉ hiện
  `HISTORICAL`, không tự cấp quyền.
- Ảnh hưởng Binance/entry/size/SL/TP: chỉ read-only/audit sau fill; không đổi signal, nhãn, whitelist, gate, entry,
  size, leverage, SL, TP hoặc bot-close.
- Tương thích JSON cũ: không rewrite paper JSON hay lifecycle JSON/NDJSON. API chỉ append object derive
  `paperOriginal` cùng các field stats `paper*`/`avgClosedRoe`; record bị dọn khỏi paper store vẫn hiển thị history với
  `NOT_FOUND`, consumer cũ có thể bỏ qua field mới.

## 2026-08-09 - Live-card Binance entry fast path

- Version: `LIVE_CARD_ENTRY_FAST_PATH_V1_20260809`; lifecycle container vẫn
  `LIVE_CARD_BINANCE_LIFECYCLE_V2_20260804` và stats vẫn `LIVE_CARD_WHITELIST_PNL_STATS_V3_20260808`.
- Dữ liệu dùng trước entry không đổi: exact `matchedKeys`, whitelist ứng viên + `LỆNH THẬT`, Order Enabled/Dry Run,
  giờ cấm, TP/SL hợp lệ, Market Direction freshness, dedupe symbol/side, positions/open orders và max-position. Không
  dùng outcome/PnL hoặc dữ liệu tương lai.
- Điều kiện phân loại nhãn/tier không đổi. Fast path chỉ chạy sau khi trade đã khớp exact live-card key và các khóa
  local đã đạt. Signed REST preflight được ưu tiên `priority=1` (mutation order vẫn `priority=0`), không drop khi queue
  congested và dùng namespace dedupe riêng để các signal cùng batch chia sẻ positions nhưng không chờ promise nền.
- Tối ưu REST: `openOrders` đổi từ toàn account (weight 40) sang đúng symbol (weight 1), vì rule chỉ kiểm tra order
  không-reduceOnly cùng symbol; snapshot positions vừa đọc được tái sử dụng cho max-position thay vì gọi lần hai;
  `setLeverage` được bỏ qua khi row positionRisk của symbol đã báo đúng leverage. Premium index/position-mode live-card
  cũng đi priority 1; write set-leverage/order giữ priority 0. Successful path thông thường giảm weight khoảng 53 xuống
  8 khi leverage đã đúng, không tăng concurrency chung.
- Cách thống kê/telemetry: lifecycle mới append `entryFastPathVersion`, `preflightStartedAt`, `preflightCompletedAt`,
  `orderRequestStartedAt`, `preflightPositionsReused`, `preflightOpenOrdersScope` và `leverageSetSkipped`. Các timestamp
  cho phép tách signal/preflight/order/fill; `attemptedAt` từ version này là lúc bắt đầu preflight, không còn là sau
  preflight.
- Ảnh hưởng Binance/entry/size/SL/TP: có ảnh hưởng thời điểm submit Binance theo hướng giảm chờ, nhưng không thay đổi
  quyết định cho phép/block, MARKET order type, notional, margin, leverage mục tiêu, quantity rounding, TP, SL,
  protection working type hoặc bot-close. Reuse positions là đúng snapshot preflight vừa hoàn thành; max-position vẫn
  dùng cùng dữ liệu mà request lặp trước đây đọc lại.
- Tương thích JSON cũ: chỉ append field optional; lifecycle cũ thiếu `entryFastPathVersion` tiếp tục đọc/đối soát như
  trước. Không rewrite state/event NDJSON hoặc paper JSON. `BinanceClient` option priority/dedupe mới đều optional nên
  mọi caller cũ giữ hành vi mặc định.

## 2026-08-09 - Short Edge BC_UTAD reversal mirror

- Version nhãn: `edge-short-utad-observe-v1-20260809`; whitelist metadata
  `edge-short-utad-whitelist-v1-20260809`; live-card registry `LIVE_CARD_WHITELIST_V7_20260809`.
- Dữ liệu dùng trước entry: `side`, setup tại tín hiệu, hướng nến coin đã đóng, hướng nến BTC đã đóng,
  `marketDirectionAtSignal.scores.long/short`, `entryPrice`, `tp` và `sl`. Point gap được chụp là
  `LONG score - SHORT score`; RR được tính từ chính plan entry/TP/SL. Không dùng outcome, PnL, ROE hoặc dữ liệu sau
  entry để phân loại.
- Điều kiện phân loại:
  - `SHORT UTAD CONFIRMED` = `SHORT + BC_UTAD + ALT BEARISH + BTC BEARISH + LONG-SHORT gap >= 0`.
  - `SHORT UTAD PRIME TEST` là tập con của Confirmed, thêm `LONG-SHORT gap >= 5` và `RR < 0.7`.
  - `PRIME TEST` cố ý giữ chữ TEST vì cohort Binance thật còn nhỏ; đây là nhãn `OBSERVE ONLY`, không phải gate hoặc
    rule giao dịch thật.
- Backtest paper 14 ngày 27/07-09/08/2026, nhóm closed: Confirmed `34` lệnh, `29W/5L`, WR `85.3%`, PnL
  `+$9.708`, AvgROE `+2.86%`, PF `1.65`, `7/11` ngày dương; episode 15 phút `31`, PF `1.69`. Prime Test `20` lệnh,
  `19W/1L`, WR `95.0%`, PnL `+$10.775`, AvgROE `+5.39%`, PF `4.59`, `8/9` ngày dương. Split tuần đầu/tuần sau:
  Confirmed `21`/PF `1.39` và `13`/PF `2.03`; Prime Test `13`/WR `92.3%`/PF `2.10` và `7`/`7W-0L`.
- Cohort Binance exact-map tại lúc triển khai: Confirmed `4` filled, `3` closed-known, `3W/0L`, NET `+$0.3035`,
  AvgROE `+3.37%`; Prime Test `3` filled, `2` closed-known, `2W/0L`, NET `+$0.2642`, AvgROE `+4.40%`. Số mẫu này
  chỉ dùng đối chiếu, chưa đủ để nâng thành rule thật.
- Cách thống kê: hai card inclusive/subset tính total/active/pending/closed, W/L, WR, PF, PnL đóng/active, AvgROE và
  số ngày dương theo `Asia/Bangkok`. Trade row có badge snapshot tương ứng. Live-card key là
  `edge:short-utad:CONFIRMED` và `edge:short-utad:PRIME_TEST`; checkbox mặc định tắt, chỉ hiện khi closed AvgROE
  `> 4%`, và vẫn cần bật riêng `LỆNH THẬT` tại Orders mới có thể được matcher Binance xét.
- Ảnh hưởng Binance/entry/size/SL/TP: bản thân hai nhãn không chặn, không tự cấp lệnh, không đổi entry, margin/size,
  leverage, SL hoặc TP. Chúng chỉ trở thành một exact whitelist candidate theo cơ chế hai bước đã có nếu người dùng
  chủ động bật; mọi preflight/dedupe/risk protection hiện hữu vẫn giữ nguyên.
- Tương thích JSON cũ: trade mới append field optional `edgeShortUtad*` ngay trước entry. JSON cũ không rewrite;
  reader derive cùng công thức từ snapshot causal sẵn có và đánh dấu `edgeShortUtadDerived=true`. Thiếu setup, nến,
  score hoặc RR thì không được gán Prime Test; consumer cũ có thể bỏ qua toàn bộ field mới.

## 2026-08-09 - Live-card protection neo theo fill, SHORT time-stop và thống kê tách side

- Version đang chạy: `LIVE_CARD_SIGNAL_PROTECTION_V2_20260809`,
  `LIVE_CARD_FILL_ANCHORED_PROTECTION_V1_20260809`, `LIVE_CARD_SHORT_TIME_STOP_V1_20260809` và
  `LIVE_CARD_WHITELIST_PNL_STATS_V4_20260809_SIDE_SPLIT`.
- Dữ liệu dùng trước entry: exact whitelist key đã snapshot, side, signal/paper entry, TP và SL của chính signal.
  Khoảng cách TP/SL theo phần trăm được chốt từ bộ giá này trước entry; không dùng outcome, PnL, ROE, đỉnh/đáy hoặc
  nến phát sinh sau entry để phân loại hay đổi mục tiêu.
- Điều kiện protection neo fill: side phải hợp lệ và TP/SL phải nằm đúng hướng so với signal entry. Sau khi Binance
  báo full fill, cùng khoảng cách phần trăm được đặt lại quanh `avgPrice` thực tế, đối xứng cho LONG/SHORT. Đây không
  phải TP 5%/10% toàn cục và không gom mọi nhóm vào cùng một target.
- SHORT time-stop chỉ chọn execution live-card side SHORT còn ở `ENTRY_FILLED`, `PROTECTED`, `PROTECTION_FAILED`
  hoặc `BOT_CLOSE_FAILED` quá thời gian giữ. Mặc định `24h`, bật bằng `LIVE_CARD_SHORT_TIME_STOP_ENABLED=true`, cấu
  hình qua `LIVE_CARD_SHORT_MAX_HOLD_MS`, quét theo `LIVE_CARD_SHORT_TIME_STOP_INTERVAL_MS`; LONG không bị chọn.
  Lệnh đóng dùng đường MARKET reduce-only/position-side và quantity lifecycle hiện hữu; lỗi đóng được thử lại ở lượt
  quét sau.
- Cách thống kê: mỗi exact whitelist card vẫn giữ tổng chung, đồng thời derive hai panel `SHORT` và `LONG` cho cả
  Binance thật và paper same-cohort, gồm filled/closed, W/L, WR, PF, AvgROE và NET/PnL. Key và checkbox `LỆNH THẬT`
  không đổi; không tạo whitelist permission mới theo side.
- Ảnh hưởng Binance/entry/size/SL/TP: không thêm nhãn hay gate, không đổi điều kiện cấp lệnh, MARKET entry, margin,
  size hoặc leverage. Có đổi giá TP/SL live sau fill sang fill-anchor và có thể đóng SHORT live-card sau thời hạn;
  không áp TP10 toàn cục. Thống kê side chỉ quan sát và không chặn/châm lệnh.
- Tương thích JSON cũ: record thiếu metadata fill-anchor tiếp tục dùng nguyên TP/SL tuyệt đối kiểu V1, không rewrite.
  Record mới chỉ append field optional về signal price, distance, fill và event `PROTECTION_REBASED_TO_FILL`.
  Time-stop tái sử dụng field bot-close hiện có và ghi version trong reason; `sideStats` được derive lúc đọc nên store
  và exact whitelist key cũ vẫn dùng được.

## 2026-08-09 - Giữ nguyên LIMIT entry, tắt auto-cancel mặc định

- Version: `LIMIT_ORDER_RETENTION_V1_20260809`; master switch `AUTO_CANCEL_ENTRY_LIMIT_ORDERS=false` mặc định.
- Dữ liệu trước entry và điều kiện phân loại: rule này không đọc snapshot, nhãn, outcome hay dữ liệu tương lai để cấp
  lệnh. Order Binance có `type/origType = LIMIT` hoặc `LIMIT_MAKER` được phân loại là regular LIMIT cần giữ lại.
- Khi master switch tắt, bot không còn tự hủy LIMIT vì quá `STALE_ORDER_TIMEOUT_MS` hoặc vì BTC đổi bias. Khi vị thế
  cùng symbol đóng, cleanup tự động chỉ hủy regular order không phải LIMIT và conditional/algo TP/SL; mọi regular LIMIT
  vẫn giữ tới khi fill, Binance tự hết hiệu lực hoặc người dùng bấm Cancel/Cancel all.
- Cách thống kê: không tạo nhãn/card/checkbox hay cohort mới. Runtime chỉ log số TP/SL đã cleanup và số LIMIT được giữ,
  kèm version. Thống kê whitelist Binance/Paper hiện hữu không đổi.
- Ảnh hưởng Binance/entry/size/SL/TP: có ảnh hưởng trực tiếp tới vòng đời pending LIMIT vì ngừng auto-cancel mặc định;
  không đổi điều kiện entry, giá limit, margin/size, leverage, TP hoặc SL. Manual cancel và endpoint Cancel all vẫn còn;
  TP/SL conditional vẫn được dọn khi vị thế đóng để tránh protection treo.
- Tương thích JSON cũ: không thêm hoặc rewrite field JSON. Cấu hình cũ có `STALE_ORDER_TIMEOUT_MS` một mình không còn
  bật auto-cancel; muốn khôi phục hành vi cũ phải đặt rõ `AUTO_CANCEL_ENTRY_LIMIT_ORDERS=true`.

## 2026-08-09 - History Binance live-card chạy socket và gồm lệnh mở

- Version: `LIVE_CARD_HISTORY_STREAM_V1_20260809` trên UI và
  `ORDERS_POSITION_PNL_STREAM_V2_20260809_LIVE_CARD` trên SSE Orders.
- Dữ liệu trước entry/điều kiện phân loại không đổi. History lấy lifecycle có `entryFilledAt`; hàng đang mở là record
  chưa ở `POSITION_CLOSED`, `ENTRY_FAILED` hoặc `ENTRY_NOT_SUBMITTED`. Snapshot whitelist, side, fill, filled quantity,
  margin và leverage đều là dữ liệu lifecycle đã lưu; mark socket là dữ liệu sau entry chỉ dùng hiển thị live.
- Cách thống kê/hiển thị: hàng mở tính uPnL ước tính từ `fill × quantity × mark` theo LONG/SHORT và ROE trên margin,
  cập nhật qua Binance position SSE; chưa trừ commission/funding và không cộng vào NET đóng. Hàng đóng tiếp tục dùng
  NET Binance đã đối soát. Header báo riêng số mở/đóng; cột nhãn rộng `220px`, mỗi exact key ellipsis một dòng nhưng
  vẫn giữ full key trong tooltip.
- SSE được giữ kết nối cả khi snapshot hiện không có position. Event fill, protection, bot-close và position-close
  debounce tải lại lifecycle; tick mark chỉ patch cell Mark/uPnL/ROE, không reload toàn bảng mỗi giây.
- Ảnh hưởng Binance/entry/size/SL/TP: hoàn toàn `OBSERVE ONLY`; không tạo nhãn, gate hay checkbox mới, không gửi/hủy/
  đóng lệnh và không đổi entry, margin/size, leverage, SL hoặc TP.
- Tương thích JSON cũ: không append hay rewrite JSON. Record cũ đủ `entryFilledAt/fillPrice/filledQty` được hiển thị;
  thiếu quantity hoặc fill vẫn hiện history nhưng cell live chờ dữ liệu thay vì suy đoán sai.

## 2026-08-09 - Binance profit-lock ngoài Liquid Flow V2; tắt TSL cũ

- Version: `BINANCE_PROFIT_LOCK_NON_V2_ONLY_V2_20260809`; scanner cũ bị tắt bằng
  `LEGACY_TSL_DISABLED_V1_20260809`. Cấu hình runtime mặc định
  `BINANCE_PROFIT_LOCK_TRIGGER_ROE=5` và `BINANCE_PROFIT_LOCK_FIRST_LOCK_ROE=1`.
- Dữ liệu dùng trước entry và điều kiện phân loại tín hiệu không đổi. Rule chỉ chạy sau khi Binance đã có position,
  dùng `entryPrice`, `markPrice`, `positionAmt`, margin và leverage hiện tại để tính ROE; không dùng outcome hay nến
  tương lai để quyết định entry.
- Điều kiện bảo vệ: position Binance LONG/SHORT còn mở, không nằm trong danh sách loại trừ TSL và không bắt nguồn từ
  `/liquid-flow-v2`,
  `AUTO_SL_ENABLED` không phải `false` và ROE đạt ít nhất `5%`. Từ `5%` đến dưới `15%` khóa `+1%` ROE; thang cũ
  tiếp tục ở `15 -> 5`, `20 -> 10`, `25 -> 15`... Giá SL được đổi từ ROE về khoảng cách giá theo leverage,
  đối xứng cho LONG và SHORT. V2 được nhận diện từ `signalSource`/protection plan; record cũ thiếu source được đối chiếu thêm
  symbol, side, entry và thời điểm fill trong store V2 để không dời nhầm SL.
- `trailingStop.js` cũ không còn được khởi tạo: không còn tick-path 10→3, không còn hai manager tranh nhau cancel/place SL.
  Chỉ `handleSlTrailByProfit` được quyền quản lý thang trên và luôn đặt SL mới thành công trước khi hủy SL cũ.
- Cách ghi nhận/thống kê: không tạo cohort, nhãn thống kê hoặc checkbox whitelist mới. Runtime ghi version, mức ROE
  khóa và giá SL vào `sl-tracking`; lifecycle live-card nhận event `PROFIT_LOCK_SL_MOVED` để Orders/socket cập nhật.
  API trạng thái trailing-stop công khai version cùng hai ngưỡng cấu hình.
- Ảnh hưởng Binance: có đổi SL thật sau entry cho position ngoài Liquid Flow V2, kể cả live-card đang giữ signal protection.
  Position V2 giữ nguyên SL/TP plan riêng. Bot đặt SL mới
  thành công trước rồi mới hủy SL cũ; khi SL hiện tại đã tốt hơn thì chỉ ghi nhận, không hạ mức bảo vệ. Snapshot
  `signalStopLossPrice` gốc vẫn được giữ để đối soát, còn `signalSl` hiện hành được nâng lên profit-lock để tiến trình
  recovery không khôi phục nhầm SL lỗ ban đầu. Không đổi gate, entry, size/margin, leverage hoặc TP.
- Tương thích JSON cũ: không rewrite. Field profit-lock optional tiếp tục đọc như V1; V2 store/record cũ thiếu source dùng matcher
  fill nói trên. API Orders báo TSL cũ OFF và chỉ hiển thị telemetry ProfitLock mới.
- Tương thích JSON cũ: chỉ bổ sung field optional (`lifecycleId`, `profitLockVersion`, `profitLockRoe`,
  `profitLockStopLossPrice`, `profitLockUpdatedAt`), không rewrite record cũ. Record không có lifecycle vẫn được bảo
  vệ trực tiếp trên Binance. Algo JSON mới nhận diện `STOP/STOP_MARKET` cả khi trigger đã sang vùng lời; JSON cũ chỉ
  có type `CONDITIONAL` vẫn dùng kiểm tra phía lỗ làm fallback.

## 2026-08-09 - Liquid Heatmap Flow V2 cho kill LONG/SHORT + base-sweep continuation

- Version đang chạy: `LIQUID_HEATMAP_FLOW_V2_BASE_SWEEP_V2_20260809`. Đây là lớp song song với Liquid Heatmap V1;
  không sửa `computeHeatmapData`, `sweepTarget`, `killZoneCluster`, `entryPlan`, Liquid paper hay các tier V1.
- Dữ liệu dùng trước thời điểm gắn nhãn: top tăng/top giảm 24h Binance Futures có quote volume tối thiểu; nến 5m
  đã đóng; vùng thanh lý tổng hợp V1; taker-buy quote volume của nến; Open Interest REST với delta khoảng một phút;
  và `!forceOrder@arr` websocket. Force order `BUY` được tính là SHORT bị thanh lý, `SELL` là LONG bị thanh lý.
  Không dùng PnL, outcome, giá tương lai hoặc dữ liệu sau tín hiệu để phân loại.
- Điều kiện phân loại:
  - `UP SQUEEZE ACTIVE`: biến động tăng mạnh (`24h >= 10%` hoặc `1h >= 3%`) và còn xung lực volume/taker/OI;
    đây là nhãn chờ, không phải lệnh SHORT.
  - `UP SWEEP · SHORT READY`: tập con của pha tăng, bắt buộc đã chạm cụm trên V1, nến đóng reject cụm trên,
    có ít nhất ba xác nhận trong zone/candle/taker/OI/liquidation, bắt buộc có xác nhận phái sinh từ OI giảm hoặc
    liquidation burst, đồng thời taker chuyển bán hoặc OI giảm.
  - `DOWN SQUEEZE ACTIVE`: biến động giảm mạnh (`24h <= -8%` hoặc `1h <= -3%`) và còn xung lực volume/taker/OI;
    đây là nhãn chờ, không phải lệnh LONG.
  - `DOWN SWEEP · LONG READY`: đối xứng phía dưới, bắt buộc chạm cụm dưới V1, nến đóng reclaim, có ít nhất ba
    xác nhận, bắt buộc có OI giảm hoặc liquidation burst, đồng thời taker chuyển mua hoặc OI giảm.
  - `UP BASE SWEEP · LONG READY`: continuation cho top tăng, dùng tối đa 24 nến 5m đã đóng (2 giờ) để tìm một nến quét
    dưới support cục bộ tối thiểu `0.2%`, đóng reclaim với lower wick, sau đó có ít nhất hai nến giữ support và nến
    hiện tại đóng breakout cao hơn đỉnh vùng giữ tối thiểu `0.2%`. Base không rộng quá `14%`, giá phải trên EMA13/25,
    `24h >= 8%`, `1h >= 0`, volume `>= 1.6x` theo bộ chung hoặc riêng nến breakout so với các nến giữ base,
    taker delta `>= +2%` và nến breakout không được có upper rejection.
    OI giảm/long liquidation là evidence tăng confidence, không phải điều kiện bắt buộc và thiếu chúng không đặt nhãn
    continuation vào `WARMING UP`; vì vậy tên nhãn chỉ nói
    `BASE SWEEP`, không khẳng định đã có liquidation thật khi force-order không ghi nhận event.
  - `DOWN BASE SWEEP · SHORT READY`: đối xứng cho top giảm; quét trên resistance cục bộ, đóng reject, giữ dưới vùng,
    breakdown, giá dưới EMA13/25, `24h <= -8%`, `1h <= 0`, volume `>= 1.6x`, taker delta `<= -2%` và không có lower reclaim.
  Thiếu nến/OI/socket được công khai bằng `WARMING UP`/`missing`; hệ thống không tự nâng dữ liệu thiếu thành READY.
- Cách thống kê/hiển thị: trang `/liquid-flow-v2` cập nhật SSE mỗi 15 giây, xếp READY trước ACTIVE rồi theo confidence.
  Sáu card nhãn đếm số symbol active, confidence cao nhất và số lần chuyển nhãn từ lúc tiến trình server khởi động.
  Đây chưa phải backtest PnL/WR/PF và số transition không được mô tả như hiệu suất giao dịch. Mỗi card có checkbox whitelist
  riêng với key `heatmap-v2:<LABEL>`; mặc định tắt và chỉ lưu danh sách thống kê. Causal fixture BMTUSDT ngày 2026-08-09
  nhận `UP BASE SWEEP · LONG READY` tại nến 13:34 Bangkok, close `0.01703`, breakout-volume `5.3x`, taker `+6.9%`,
  confidence `92%`, trước ảnh giá khoảng `0.01952`; đây chỉ là kiểm thử một mẫu, không phải WR/PF backtest.
- Ảnh hưởng Binance/entry/size/SL/TP: bản thân sáu nhãn hoàn toàn `OBSERVE ONLY`. Các key V2 chỉ được registry chấp nhận
  để lưu checkbox và không được thêm vào `liquidLiveCardKeysOfTrade` hay matcher Binance. Nhãn READY có thể được Auto Paper
  V2 riêng tiêu thụ; bật checkbox whitelist vẫn không thể mở lệnh thật, không gate/chặn, không đổi entry, margin/size,
  leverage, SL hoặc TP Binance.
- Tương thích JSON cũ: không rewrite hay migrate bất kỳ JSON/NDJSON hiện hữu nào. Snapshot V2 chỉ ở cache/runtime API;
  thống kê transition chỉ trong bộ nhớ và reset khi server restart. Consumer V1 không thấy field mới và giữ nguyên hành vi.

## 2026-08-09 - Auto Paper cho Liquid Heatmap Flow V2 READY

- Version hiện hành: `LIQUID_FLOW_V2_PAPER_V3_BASE_RETEST_20260809`. Store riêng là `data/liquid-flow-v2-paper.json`; không ghi vào
  `liquid-paper-trades.json`, Edge paper hay bất kỳ store V1 nào.
- Dữ liệu dùng trước entry: đúng snapshot V2 causal tại lần đầu symbol chuyển nhãn sang READY, gồm side/label/confidence,
  nến 5m đã đóng, cấu trúc base tối đa 12 nến, wick high/low, vùng V1 trên/dưới, taker delta, OI delta,
  force-liquidation và evidence. Hai nhãn đảo chiều dùng `features.markPrice` tại lần scan phát hiện READY
  (`LIVE_MARK_AT_READY_SCAN`). Hai nhãn BASE SWEEP không fill đuổi: từ snapshot trước entry tính LIMIT retest tại
  `breakoutLevel +0.6%` cho LONG hoặc `breakoutLevel -0.6%` cho SHORT; tick sau tín hiệu chỉ xác nhận giá thật đã chạm
  LIMIT, không được dùng để thay đổi nhãn hay chọn lại plan theo outcome.
- Điều kiện tạo lệnh: Auto Paper đang bật và nhãn vừa transition thành một trong bốn READY:
  `UP SWEEP · SHORT READY`, `DOWN SWEEP · LONG READY`, `UP BASE SWEEP · LONG READY` hoặc
  `DOWN BASE SWEEP · SHORT READY`; `SQUEEZE ACTIVE`, `WAIT` và `WARMING UP` không tạo lệnh. Không tạo nếu cùng signal key đã có,
  symbol còn paper OPEN/PENDING hoặc cùng symbol/side chưa hết cooldown 30 phút. BASE SWEEP tạo `PENDING_ENTRY` tối đa
  30 phút; LONG chỉ fill khi mark giảm về LIMIT, SHORT chỉ fill khi mark tăng về LIMIT. Nếu giá xuyên SL cấu trúc trước
  fill thì hủy `ENTRY_INVALIDATED`; hết hạn thì hủy `ENTRY_TIMEOUT`. Restart có thể xem READY hiện hành là transition mới,
  nhưng exact signal key và cooldown vẫn chống trùng.
- Plan đảo chiều giữ `$10 / 10x`, risk underlying `0.4%..2.5%`. Plan BASE SWEEP giữ margin `$10` nhưng giảm leverage
  xuống `5x`; SL xét cực trị nến sweep/base và risk underlying được nới tối đa `25% ROE / 5x = 5%` để chịu retest của
  coin biến động mạnh. TP hướng vùng V1 đối diện, floor `0.6%`, cap `4%`, fallback `1.5R`. Lệnh OPEN tự đóng TP/SL
  bằng last-price socket hoặc `TIMEOUT` sau 4 giờ. PnL NET trừ round-trip fee `0.08%` trên notional thực theo leverage.
- Cách thống kê: trang `/liquid-flow-v2` hiển thị OPEN/PENDING/CLOSED, W/L, WR, NET PnL, AvgROE, PF nội bộ API,
  LIMIT/entry/TP/SL, mark, leverage, tuổi lệnh và outcome. PENDING/CANCELLED không tính vào W/L, WR, NET hoặc AvgROE.
  Card symbol ghi `CHỜ RETEST`, `PAPER OPEN` hoặc kết quả đã đóng để biết chính xác lúc nào rule thật sự fill.
  Toggle `AUTO PAPER` chỉ bật/tắt paper V2 và được lưu trong store.
- Ảnh hưởng Binance/entry/size/SL/TP: chỉ tác động entry/size/SL/TP của mô phỏng paper V2. Không thêm key vào matcher
  Binance, không gửi/hủy/đóng lệnh thật, không đổi V1, live-card whitelist, margin, leverage, SL hoặc TP Binance.
- Tương thích JSON cũ: tiếp tục đọc schema `{ settings, trades }` V1/V2 và giữ nguyên trade lịch sử cùng version cũ;
  trade mới mang V3 với status optional `PENDING_ENTRY/CANCELLED`, `pendingSince`, `entryExpiresAt`, `entryFilledAt`,
  `entryMode`, `entryTimeoutMs`, `retestBufferPct` và leverage theo trade. Không rewrite trade cũ; field thiếu nhận default.

## 2026-08-09 - Màu kết quả và phân trang lịch sử Liquid Flow V2

- Version giao diện: `LIQUID_FLOW_V2_PAPER_HISTORY_UI_V1_20260809`.
- Dữ liệu dùng trước entry và điều kiện phân loại tín hiệu không đổi. Giao diện chỉ đọc các trade paper đã có sau lifecycle;
  LONG dùng màu xanh, SHORT dùng màu đỏ; TP/PnL dương dùng badge xanh, SL/PnL âm dùng badge đỏ, CANCELLED dùng màu vàng.
- Cách thống kê/hiển thị: danh sách `CLOSED/CANCELLED` được sắp theo thời điểm đóng/hủy mới nhất và phân trang phía client,
  10 dòng mỗi trang. Socket tiếp tục cập nhật dữ liệu; trang hiện tại được giữ nếu còn hợp lệ và tự co về trang cuối nếu tổng số trang giảm.
- Ảnh hưởng Binance/entry/size/SL/TP: không ảnh hưởng. Đây chỉ là thay đổi UI, không tạo nhãn, không gate/chặn,
  không mở/hủy lệnh paper hay Binance và không đổi entry, margin, leverage, size, SL hoặc TP.
- Tương thích JSON cũ: không thêm, sửa hay rewrite field JSON. Mọi trade cũ có `status/side/outcome/netPnl` thiếu một phần vẫn hiển thị
  bằng màu trung tính và tham gia phân trang như trước.

## 2026-08-09 - Link Binance và Coinglass trên dòng Liquid Flow V2 paper

- Version giao diện: `LIQUID_FLOW_V2_PAPER_EXTERNAL_LINKS_V1_20260809`.
- Dữ liệu dùng trước entry, điều kiện phân loại nhãn và thống kê không đổi. Mỗi dòng OPEN/PENDING/CLOSED/CANCELLED chỉ lấy `symbol`
  đã lưu để dựng link Binance Futures theo symbol đầy đủ và link Coinglass Liquidation Heatmap theo base coin bỏ hậu tố `USDT`.
- Cách hiển thị: hai nút `BINANCE` và `COINGLASS` mở tab mới với `noopener noreferrer`; không được tính như nhãn/card hay metric mới.
- Ảnh hưởng Binance/entry/size/SL/TP: không ảnh hưởng; đây là link điều hướng do người dùng bấm, không gọi API đặt lệnh,
  không gate/chặn và không đổi entry, margin, leverage, size, SL hoặc TP của paper/Binance.
- Tương thích JSON cũ: không thêm hoặc rewrite field. Trade cũ chỉ cần có `symbol`; symbol trống thì không hiện link.

## 2026-08-09 - Liquid Flow V2 Paper V4: toàn bộ 5x, hard SL -20% ROE

- Version đang chạy: `LIQUID_FLOW_V2_PAPER_V4_ALL_5X_HARD_SL20_20260809`. Rule chỉ áp dụng cho Auto Paper trên
  `/liquid-flow-v2`; sáu nhãn thống kê/checkbox whitelist V2 không đổi và vẫn là `OBSERVE ONLY`.
- Dữ liệu dùng trước entry và điều kiện phân loại không đổi: bốn nhãn READY vẫn được tạo từ snapshot causal gồm nến 5m đã đóng,
  vùng V1, cấu trúc base, volume/taker, OI và force-liquidation. Hai nhãn đảo chiều vẫn vào mark live lúc transition READY;
  hai nhãn BASE SWEEP vẫn khóa LIMIT retest `breakoutLevel +/- 0.6%` tối đa 30 phút.
- Plan mới cho mọi trade được tạo sau khi deploy dùng margin mặc định `$10`, leverage `5x` và hard SL tại `-20% gross ROE`,
  tương đương khoảng cách giá `4%`. Đây là đóng lỗ cứng, không phải đặt lệnh entry để chờ hồi sau khi đã âm 20%. TP vẫn hướng
  vùng V1 đối diện, floor `0.6%`, cap `4%`, fallback `1.5R`; cooldown 30 phút và timeout giữ lệnh 4 giờ không đổi.
- Thống kê/replay cohort hiện có 40 lệnh đã đóng cho cấu hình giả lập đồng nhất 5x + hard SL 20 cho kết quả 33 TP, 6 SL,
  1 TIMEOUT, WR `82.5%`, NET `+$1.8906`, AvgROE `+0.47%`, PF `1.15`. Đây là mẫu một phiên nhỏ để chọn cấu hình paper,
  không phải cam kết hiệu suất hay gate Binance; cần tích lũy cohort V4 riêng sau deploy.
- Ảnh hưởng Binance/entry/size/SL/TP: không ảnh hưởng Binance thật. Entry mode và margin paper không đổi; notional paper mới
  giảm theo 5x, SL paper đổi thành hard `-20% gross ROE`, còn giá TP giữ rule cũ nên ROE TP xấp xỉ giảm một nửa so với 10x.
- Tương thích JSON cũ: tiếp tục đọc các field V1-V3 như `baseSweepLeverage` và `baseSweepMaxRiskRoe`. Trade OPEN/PENDING/CLOSED
  cũ giữ nguyên version, leverage, entry, SL và TP đã lưu; không rewrite lịch sử. Cấu hình runtime V4 ghi đè riêng policy leverage
  và `hardStopRoe` để JSON settings 10x cũ không làm rule quay lại sau restart; `hardStopRoe` là field optional mới.

## 2026-08-09 - Liquid Flow V2 Paper V5: sàn TP +10% gross ROE

- Version đang chạy: `LIQUID_FLOW_V2_PAPER_V5_5X_SL20_TP10_20260809`. Dữ liệu causal trước entry và điều kiện bốn nhãn READY
  không đổi; reversal vẫn dùng mark live, BASE SWEEP vẫn chờ LIMIT retest đã khóa từ snapshot trước entry.
- Điều kiện TP cho trade mới: ở leverage `5x`, sàn TP là `+10% gross ROE`, tương đương giá đi đúng hướng `2%`.
  Nếu vùng heatmap V1 đối diện xa hơn thì lấy vùng đó; khoảng TP underlying vẫn cap `4%` (`+20% gross ROE`). Sau round-trip fee
  `0.08%` notional, TP sàn hiển thị xấp xỉ `+9.6% net ROE`. Hard SL giữ `-20% gross ROE` (`4%` giá).
- Cách thống kê không đổi: chỉ CLOSED vào W/L, WR, NET, AvgROE và PF; PENDING/CANCELLED không tham gia. Store hiện không lưu
  đường đi tick/MFE của các trade đã đóng nên không tuyên bố WR/PF backtest cho TP 10 từ outcome TP cũ; V5 phải tích lũy cohort mới.
- Ảnh hưởng Binance/entry/size/SL/TP: chỉ đổi giá TP của Auto Paper V2 mới; không đổi nhãn, whitelist, entry, margin, leverage,
  hard SL hoặc Binance thật. Trade OPEN/PENDING và lịch sử V1-V4 giữ nguyên TP đã snapshot, không bị sửa giữa lifecycle.
- Tương thích JSON cũ: bổ sung setting/field optional `minTakeProfitRoe`; JSON cũ thiếu field nhận default `10`. Runtime policy V5
  ghi đè settings TP cũ sau restart nhưng không rewrite trade cũ; các field legacy vẫn được đọc và consumer cũ có thể bỏ qua field mới.

## 2026-08-09 - Liquid Flow V2 V6: BASE paper fill gửi Binance thử $2 × 5x

- Version: `LIQUID_FLOW_V2_PAPER_V6_BASE_BINANCE_2USD_5X_20260809`; policy Binance là
  `LIVE_CARD_AND_LIQ_FLOW_BASE_V2_20260809`. Chỉ hai key canonical `UP_BASE_SWEEP_LONG_READY` và
  `DOWN_BASE_SWEEP_SHORT_READY` được phép gửi lệnh; tên gọi “UP BASE SHORT” được ánh xạ theo nhãn SHORT thực tế là
  `DOWN BASE SWEEP · SHORT READY`. Hai nhãn reversal và ACTIVE/WAIT/WARMING không được cấp Binance.
- Dữ liệu trước entry và phân loại không đổi: snapshot causal vẫn dùng nến 5m đóng, base/retest, EMA, volume/taker, OI và force-order.
  Trigger thật chỉ xảy ra sau khi paper BASE đã OPEN: hoặc OPEN ngay tại READY nếu mark đã nằm trong biên retest, hoặc đúng tick
  chuyển `PENDING_ENTRY -> OPEN` khi mark chạm LIMIT đã khóa. Snapshot đầu tiên sau restart chỉ làm baseline, không được tính là
  transition; không scan ngược các trade đã OPEN trước lúc deploy và không bắn lệnh vì restart.
- Cách thực thi: đặt MARKET với margin `$2`, leverage `5x`, notional `$10`. Trước lệnh kiểm tra global Binance Orders đang bật,
  không dry-run, có credentials và không có position cùng symbol. Trade được claim/persist `SUBMITTING` trước API để chống gửi trùng;
  `FILLED/BLOCKED/ERROR` được lưu và hiển thị. TP/SL dùng khoảng cách plan paper (`+10%/-20% gross ROE`) neo lại từ fill Binance;
  max position mặc định 30. Thành công, vị thế trùng hoặc lỗi Binance/IP đều gửi Discord qua webhook hiện hành.
- Cách thống kê: WR/PF/NET trên trang vẫn chỉ là paper và không trộn PnL Binance. Metadata Binance là telemetry lifecycle, không tạo
  card/nhãn thống kê mới. Checkbox whitelist của sáu nhãn vẫn mặc định tắt, chỉ lưu thống kê và không điều khiển quyền đặt lệnh;
  quyền BASE real là rule riêng theo hai key cố định.
- Ảnh hưởng Binance/entry/size/SL/TP: có ảnh hưởng Binance thật đúng phạm vi hai BASE fill mới: MARKET `$2 × 5x`, TP/SL bảo vệ
  được đặt theo fill. Không đổi entry/size/SL/TP paper, không cấp hai reversal và không đổi các chiến lược Binance khác.
- Tương thích JSON cũ: thêm optional `baseBinanceEnabled`, `baseBinanceMarginUsdt`, `baseBinanceLeverage` và các field lifecycle
  `binanceEntryState`, timestamps/order id/entry/error/protection. Record V1-V5 thiếu field vẫn đọc bình thường; OPEN/CLOSED cũ
  không bị gửi hồi tố, còn PENDING cũ chỉ đủ điều kiện khi có tick fill mới sau deploy. Không rewrite plan/lịch sử cũ. Claim lỗi
  không tự retry để tránh order trùng khi trạng thái Binance không chắc chắn.

## 2026-08-09 - Binance TP/SL idempotent protection V1

- Version: `BINANCE_PROTECTION_IDEMPOTENCY_V1_20260809`. Dữ liệu dùng trước entry, nhãn, tier, gate và điều kiện phân loại
  tín hiệu không đổi. Sau fill, mỗi symbol chỉ được chạy một lượt kiểm tra fallback TP và một lượt fallback SL tại cùng thời điểm.
- Trước khi gửi protection, bot đọc mới cả regular open orders và conditional algo orders. Nếu đã có TP hoặc SL đóng vị thế
  đúng `symbol + close side + positionSide`, order hiện hữu được xem là authoritative và bot bỏ qua, không hủy/replace vì khác
  target hoặc quantity. Quy tắc áp dụng cả fallback SlGuard/AutoTP và `SignalProtection -> setTpSl`; nếu chỉ thiếu một vế thì chỉ
  đặt vế còn thiếu. Việc kiểm tra lại được thực hiện sát lệnh gửi để chặn race từ partial/duplicate fill event.
- Cách thống kê không đổi; không thêm nhãn/card/checkbox whitelist. Log ghi `existing TP/SL ... skipped` để đối soát số lần bỏ qua.
- Ảnh hưởng Binance/entry/size/SL/TP: không đổi entry, size, leverage hoặc công thức TP/SL. Có ảnh hưởng lifecycle Binance theo
  hướng ngăn tạo TP/SL thứ hai; TP/SL đã tồn tại được giữ nguyên thay vì AutoTP refresh sang giá/quantity mới.
- Tương thích JSON cũ: không đổi schema, không rewrite `sl-tracking.json` hay lifecycle cũ. Matcher hỗ trợ cả order regular và algo,
  các field `type/origType/orderType`; record JSON cũ không cần migration.

## 2026-08-09 - TP SHORT ngoài Liquid Flow V2 cố định +6% ROE

- Version: `NON_LIQUID_FLOW_V2_SHORT_TP_ROE6_BOT_ONLY_V2_20260809`. Dữ liệu trước entry, nhãn, tier, gate và whitelist không đổi.
  Rule nhận diện theo `side=SELL/SHORT` và source canonical; chỉ source bot xác định và không chứa `liquid-flow-v2` dùng TP gross
  ROE cố định `+6%`. Source thiếu/không rõ hoặc thuộc lệnh tay (`signal`, `manual`, `orders-manual`, `set-tp-sl`,
  `binance-position-fallback`, `REST_SYNC`) bị loại khỏi cohort 6%.
- Giá TP được tính `entry * (1 - 0.06 / leverage)`: khoảng `-0.6%` giá ở 10x và `-1.2%` giá ở 5x. Khi đã fill,
  SignalProtection dùng entry thực tế của Binance; order tạo trực tiếp dùng mark/LIMIT entry, Pump LIMIT dùng average fill và AutoLiq
  SHORT dùng cùng mức 6%. LONG và `liquid-flow-v2*` giữ nguyên TP riêng. Với position ngoài V2, rule âm sâu/negative-timeout
  vẫn được ưu tiên dời TP về entry; target 6% chỉ cố định khi position chưa chạm điều kiện cứu lỗ này.
- Cách thống kê không đổi; không thêm nhãn/card/checkbox. Đây là rule execution Binance, không thay đổi cách gom cohort paper.
- Ảnh hưởng Binance/entry/size/SL/TP: chỉ đổi TP của SHORT do bot mở có source xác định hoặc SHORT bot đang thiếu TP ngoài Liquid
  Flow V2; không đổi entry, margin/size, leverage hay SL. Lệnh tay giữ TP người dùng nhập; nếu thiếu TP thì quay về fallback chung,
  không bị ép 6%. Khi ROE đạt ngưỡng âm sâu (`NEG_TP_ROE`, mặc định `-30%`) hoặc negative-timeout, TP ngoài V2 có thể được thay
  bằng LIMIT close tại entry. Liquid Flow V2 luôn bị loại khỏi thao tác này. Ngoài trường hợp cứu lỗ, policy idempotent giữ TP hiện hữu.
- Tương thích JSON cũ: không đổi schema và không rewrite lịch sử. Source thiếu được coi là unknown/manual an toàn; record cũ vẫn đọc
  bình thường. Route `/api/order` mới gắn `orders-manual`; version chỉ vào telemetry mới, consumer cũ bỏ qua field.

## 2026-08-09 - Nút đặt Binance thật trên từng dòng Liquid Flow V2 paper

- Version: `LIQUID_FLOW_V2_MANUAL_BINANCE_UI_V3_AUTH_RECOVERY_20260809`. Dữ liệu trước entry và điều kiện phân loại sáu nhãn V2 không đổi.
  Mỗi dòng paper `OPEN/PENDING_ENTRY` có input Entry, Margin, Leverage, nút `LIMIT THẬT` và `MARKET THẬT`; Margin mặc định `$2`,
  Leverage mặc định `5x`, giữ draft qua các lần socket render. Thao tác yêu cầu xác nhận và phiên đăng nhập `/orders`.
  Server lấy symbol/side/TP/SL từ record paper theo `tradeId`, không nhận các field này từ trình duyệt.
- Trước xác nhận, UI tự tạo lại token qua `/api/auth` nếu cùng origin còn `orders_creds`. Nếu token có sẵn nhưng server vừa restart
  làm mất session in-memory, request `401` được phép re-auth và retry đúng một lần; request unauthorized chưa đọc/gửi order nên không
  tạo duplicate. Nếu credentials không tồn tại trên origin hiện tại, UI nêu rõ hostname cần mở `/orders`; `localhost` và `127.0.0.1`
  là hai localStorage origin khác nhau.
- LIMIT dùng đúng giá input và giữ loại LIMIT; MARKET bỏ qua input Entry để khớp market. Server kiểm tra Margin `> 0` và
  `<= 10,000 USDT`, Leverage là số nguyên `1..125`, rồi tính notional bằng `margin × leverage`. TP/SL theo plan V2 được neo lại
  theo fill Binance. Trước gửi, server chặn symbol đã có position hoặc LIMIT entry và chống hai
  request đồng thời cho cùng trade. Manual order source là `liquid-flow-v2-manual`, nên SHORT không bị policy TP 6% ngoài V2.
- Cách thống kê paper không đổi; lệnh thật không trộn vào W/L, WR, NET hay AvgROE. Dòng chỉ hiện trạng thái/order id của request.
  Không thêm nhãn/card/checkbox whitelist; whitelist V2 tiếp tục chỉ thống kê.
- Ảnh hưởng Binance/entry/size/SL/TP: auth recovery chỉ khôi phục quyền của phiên đã lưu và không tự đặt lệnh; Binance thật vẫn chỉ
  được đặt khi người dùng bấm và xác nhận. LIMIT dùng entry input, MARKET dùng
  fill market; size/notional và leverage lấy từ hai input (mặc định `$2 × 5x`); TP/SL lấy khoảng cách causal của paper.
  Không thay đổi auto-entry hiện có hoặc trade paper.
- Tương thích JSON cũ: auth recovery và draft UI không đổi schema. Lệnh gửi mới tiếp tục lưu các field optional `binanceMarginUsdt`,
  `binanceLeverage`, `binanceNotionalUsdt`, `binanceEntryMode`, `binanceManualPolicyVersion` và snapshot protection vào trade đã
  bấm lệnh. Record cũ thiếu field vẫn đọc bình thường. Snapshot persisted cho phép khôi phục TP/SL nếu LIMIT fill sau restart.

## 2026-08-10 - TP LONG bot ngoài Liquid Flow V2 cố định +10% ROE; lệnh tay thuộc nhóm V2

- Version: `NON_LIQUID_FLOW_V2_LONG_TP_ROE10_BOT_ONLY_V1_20260810`; SHORT tiếp tục dùng
  `NON_LIQUID_FLOW_V2_SHORT_TP_ROE6_BOT_ONLY_V2_20260809`. Dữ liệu causal trước entry, nhãn, tier, gate, whitelist và điều kiện
  phân loại tín hiệu không đổi. Policy execution chỉ đọc `side`, source canonical, entry/fill Binance và leverage sau khi một chiến lược
  đã được phép đặt lệnh; nó không biến nhãn thống kê thành gate.
- Phân loại: LONG/BUY có source bot xác định và source không chứa `liquid-flow-v2` dùng TP gross ROE cố định `+10%` theo công thức
  `entry * (1 + 0.10 / leverage)`. SHORT/SELL bot ngoài V2 vẫn dùng `entry * (1 - 0.06 / leverage)`. Source `manual`,
  `orders-manual`, `set-tp-sl`, `signal`, REST/fallback hoặc position không có source bot được xem là user-managed giống Liquid Flow V2
  chỉ trong policy TP: không dựng TP fallback và không chạy negative-TP ghi đè target do người dùng chọn. Phân loại này không tắt scanner SL khóa lời.
- Entry/fill: order mới tính plan từ mark/LIMIT entry và SignalProtection neo lại cùng khoảng ROE từ average fill thực tế. Pump sau fill,
  AutoLiq và Missing-TP dùng cùng resolver; Pump LONG không có target gốc vẫn nhận TP 10%. TP đã tồn tại vẫn authoritative theo
  `BINANCE_PROTECTION_IDEMPOTENCY_V1_20260809`, vì vậy deploy không hủy/replace TP hiện hữu chỉ để đổi về 10%.
- Cách thống kê không đổi; không thêm nhãn/card/checkbox whitelist và không trộn PnL Binance vào paper. Telemetry mới chỉ ghi version
  policy vào lifecycle/order response khi resolver thực sự áp dụng.
- Ảnh hưởng Binance/entry/size/SL/TP: có đổi TP cho LONG bot ngoài V2 được mở mới hoặc đang thiếu TP; tại 10x target cách entry `+1%`
  giá, tại 5x cách `+2%` giá. Không đổi quyền entry, margin/size hay leverage. Lệnh tay, lệnh `/orders` và position không truy được source bot
  giữ TP riêng nhưng vẫn thuộc scanner SL khóa lời ngoài V2: từ `+5% ROE` khóa tối thiểu `+1% ROE`, nên vị thế đã trên `+10%` cũng phải chạy.
  Chỉ position có source/trade khớp `liquid-flow-v2*` mới được miễn profit-lock. Rule cứu lỗ dời TP về entry vẫn giữ cho position bot xác định ngoài V2.
- Tương thích JSON cũ: không đổi schema và không rewrite lịch sử/order đang mở. Field version là optional; source cũ thiếu hoặc không rõ
  được phân loại an toàn thành user-managed/V2, consumer cũ bỏ qua telemetry mới. Trade V2/paper cũ giữ nguyên TP snapshot.

### Hotfix 2026-08-10 - Tách phân loại TP khỏi SL profit-lock

- Version SL: `BINANCE_PROFIT_LOCK_NON_V2_ONLY_V3_MANUAL_INCLUDED_20260810`; ngưỡng runtime giữ `BINANCE_PROFIT_LOCK_TRIGGER_ROE=5`
  và lock đầu `+1% ROE`.
- Lỗi: helper user-managed của policy TP đã được gọi trong `isLiquidFlowV2ManagedPosition`, làm lệnh tay/unknown bị hiểu thành V2 ở cả SL scanner
  và bị bỏ qua profit-lock dù ROE đã trên 10%. Hotfix chỉ dùng user-managed cho TP fallback/negative-TP; SL scanner trở lại chỉ miễn đúng source
  hoặc lifecycle khớp Liquid Flow V2.
- Không đổi snapshot trước entry, nhãn, tier, gate, whitelist, thống kê, entry, size, leverage hoặc công thức TP 10%/6%. Có ảnh hưởng Binance SL:
  vị thế tay/unknown ngoài V2 đang có ROE đủ ngưỡng sẽ được đặt/dời SL khóa lời; order SL hiện hữu tốt hơn target được giữ nguyên.
- Không đổi JSON/schema và không rewrite lịch sử. Source thiếu vẫn an toàn khỏi TP cưỡng bức nhưng không còn vô tình tắt profit-lock.
## 2026-08-10 - Liquid Flow V2 V5: PRE wick 5m + HTF trend/EMA99 15m

- Version tín hiệu: `LIQUID_HEATMAP_FLOW_V2_HTF_15M_EMA99_V5_20260810`; version paper:
  `LIQUID_FLOW_V2_PAPER_V12_HTF_15M_EVAL_20260810`; policy entry:
  `LIVE_CARD_AND_LIQ_FLOW_READY_V6_BASE_LONG2_20260810`. PRE giữ `$5 × 5x`; BASE LONG đã được trả lại `$2 × 5x`.
- Dữ liệu causal trước entry: 180-220 nến 5m đã đóng để tính EMA99, SMA13/SMA25, dốc EMA99, high/low 12 nến,
  change 24h/1h, volumeX và taker delta; cộng OHLC của nến 5m đang hình thành lấy từ Binance kline websocket và giá close/mark
  đã quan sát tại đúng tick hiện tại. Không dùng close cuối nến, high/low tương lai hoặc dữ liệu sau entry. Full snapshot/OI chạy mỗi 15 giây
  kể cả không mở trang; mỗi `candleTick/candleClose` 5m cập nhật riêng symbol từ cache, không gọi lại OI REST toàn bảng.
- `PRE_UP_BASE_LONG`: top tăng có 24h `>= +8%`, 1h `>= -3%`; low nến live (fallback nến đóng cuối) cách EMA99 từ
  `-0.5%..+1.2%`, mark đã reclaim lên `+0.1%..+1.2%` trên EMA99 và bật tối thiểu `0.3%` từ low. Đồng thời EMA13 >= EMA25
  (tolerance 0.2%), EMA25 không thấp hơn EMA99 quá 0.5%, dốc EMA99 `>= -0.08%`, pullback high 12 nến `0.25-12%`,
  volumeX `>= 0.8`, taker delta `>= -12%`, chưa BASE LONG READY và không upper rejection.
- `PRE_DOWN_BASE_SHORT` đối xứng: 24h `<= -8%`, 1h `<= +3%`; high nến live cách EMA99 `-1.2%..+0.5%`, mark reject
  xuống `-1.2%..-0.1%` dưới EMA99 và lùi ít nhất `0.3%` từ high; EMA stack/dốc giảm, bounce 12 nến `0.25-12%`, volumeX
  `>= 0.8`, taker delta `<= +12%`, chưa BASE SHORT READY và không lower reclaim. Biên mark ±1.2% là max-chase: râu đã chạm
  nhưng giá chạy xa hơn thì không entry.
- Thứ tự ưu tiên: BASE READY > SWEEP reversal READY > PRE wick > SQUEEZE ACTIVE/WAIT. PRE chuyển READY ngay trong nến live,
  tạo paper `IMMEDIATE_MARK`; chỉ transition mới sau baseline mới được phép thực thi. Snapshot đầu sau restart chỉ dựng baseline,
  không backfill tín hiệu đang tồn tại và signal key/cooldown chặn lặp lại trong cùng nến.
- Thống kê: giữ hai card/key `heatmap-v2:PRE_UP_BASE_LONG` và `heatmap-v2:PRE_DOWN_BASE_SHORT`; chỉ CLOSED paper vào W/L, WR,
  NET, PF và AvgROE. Checkbox WHITELIST đã nối đúng matcher, mặc định tắt và chỉ hiện khi CLOSED AvgROE `> 4%`; whitelist chỉ lưu
  thống kê, độc lập với policy test Binance. Không thêm nhãn/card mới trong V4.
- Ảnh hưởng Binance/entry/size/SL/TP: PRE transition mới gửi MARKET `$5 × 5x` (notional `$25`);
  `UP_BASE_SWEEP_LONG_READY` và `DOWN_BASE_SWEEP_SHORT_READY` đều dùng `$2 × 5x` (notional `$10`), reversal READY không được cấp.
  Bot claim `SUBMITTING`, kiểm tra Orders ON/dry-run OFF/credentials/max
  position và position cùng symbol trước gửi. TP/SL dùng plan paper và neo theo average fill; FILLED/BLOCKED/ERROR, kể cả lỗi IP/credential,
  được persist và gửi Discord. Không đổi entry/size/SL/TP của chiến lược khác và không sửa lệnh PRE/BASE cũ.
- Tương thích JSON cũ: thêm optional `ema99LongTouchDistancePct`, `ema99ShortTouchDistancePct`, `reboundFromApproachLowPct`,
  `rejectFromApproachHighPct`, `approachCandleSource`, `live5mCandle`; `baseLongBinanceMarginUsdt` và các settings/lifecycle Binance
  vẫn optional. JSON/trade V1-V10 thiếu field đọc bình thường, không migration/rewrite lịch sử. Runtime default BASE LONG là 2 và PRE là 5;
  plan/order cũ đã persist không bị resize hoặc gửi lại.

### Hai nhãn HTF 1h/4h × EMA99 15m đối xứng

- Nhãn `HTF_BEAR_15M_EMA99_PUMP_REJECT` (SHORT) và `HTF_BULL_15M_EMA99_DUMP_RECLAIM` (LONG) chỉ dùng dữ liệu
  causal trước entry: tối đa 160 nến đã đóng cho từng khung 15m/1h/4h. EMA13/25/99 là EMA; slope EMA13/25 so với ba nến
  trước, structure đếm lower-high/lower-low hoặc higher-high/higher-low trong năm nến cuối. Không dùng nến HTF/15m đang mở,
  outcome, MFE/MAE hoặc dữ liệu sau entry. Kline websocket chỉ kích scan; classifier lọc bằng `closeTime <= now`.
- HTF BEAR ở một khung yêu cầu ít nhất 105 nến, close dưới EMA13 và EMA25, EMA13 slope `<= -0.02%`, EMA25 không tăng
  quá `+0.05%` hoặc có ít nhất hai lower-low, và có ít nhất hai lower-high. HTF BULL đối xứng: close trên EMA13/25,
  EMA13 slope `>= +0.02%`, EMA25 không giảm quá `-0.05%` hoặc hai higher-high, cùng ít nhất hai higher-low. Một khung đạt
  là tier `B_ONE`; cả 1h và 4h đạt là `A_BOTH` và cộng confidence, không đổi size.
- SHORT READY: trước touch giá nằm dưới EMA99 15m ít nhất `0.5%`; trong hai nến đóng gần nhất high chạm EMA99 trong
  `-0.6%..+1.5%`, pump từ low context tám nến `>=2%`, close cuối trở lại dưới EMA99 `0.2%..10%`, trả lại `>=25%` biên pump,
  volume touch `>=1.3x` nền 20 nến, taker delta hai nến `<=+10%`, và có nến đỏ hoặc upper wick `>=18%` range. LONG READY
  đối xứng bằng prior trên EMA99 `0.5%`, low touch `-1.5%..+0.6%`, dump `>=2%`, close trên EMA99 `0.2%..10%`, recovery
  `>=25%`, volume `>=1.3x`, taker `>=-10%`, nến xanh hoặc lower wick `>=18%` range.
- Phân loại ưu tiên sau BASE/SWEEP READY đã xác nhận nhưng trước PRE 5m. Mỗi transition mới tạo Auto Paper 5x `IMMEDIATE_MARK`,
  hard SL `-20%` và TP tối thiểu `+10% gross ROE`; signal key dùng closeTime nến 15m xác nhận. Hai nhãn có card thống kê riêng
  và checkbox `heatmap-v2:HTF_BEAR_15M_EMA99_PUMP_REJECT` / `heatmap-v2:HTF_BULL_15M_EMA99_DUMP_RECLAIM`, mặc định tắt,
  chỉ hiện khi CLOSED AvgROE `>4%`. Chỉ CLOSED vào W/L, WR, NET, PF, AvgROE; OPEN/PENDING/CANCELLED không tính.
- Ảnh hưởng Binance/entry/size/SL/TP: hai nhãn HTF là `PAPER EVAL ONLY`, không nằm trong `LIQUID_FLOW_V2_AUTO_REAL_LABELS`,
  nên checkbox cũng không cấp Binance. Không đổi PRE `$5 ×5x`, BASE `$2 ×5x`, entry/size/SL/TP lệnh thật hoặc chiến lược khác.
  Chỉ paper mới có entry/SL/TP mô phỏng; baseline/restart không backfill transition.
- Tương thích JSON cũ: các field `trend1h`, `trend4h`, `htfBearCount`, `htfBullCount`, tier và `ema99Retest15m` đều optional;
  snapshot paper V12 lưu chúng khi có. Store/trade V1-V11 thiếu field vẫn đọc bình thường, không rewrite lịch sử. Whitelist version
  `LIVE_CARD_WHITELIST_V8_HTF_15M_EMA99_20260810` vẫn chấp nhận key canonical và mặc định không bật.

## 2026-08-10 - Liquid Flow V2 manual Binance V4: cho phép DCA cùng chiều

- Version: `LIQUID_FLOW_V2_MANUAL_BINANCE_UI_V4_SAME_SIDE_DCA_20260810`.
- Dữ liệu dùng trước entry: Liquid Flow V2 paper trade còn `OPEN/PENDING_ENTRY`, input entry/margin/leverage của người dùng,
  Binance position hiện tại và open LIMIT entry của đúng symbol. Đây là thao tác thủ công, không thêm nhãn/gate phân loại và không dùng
  outcome hoặc dữ liệu sau entry để quyết định tín hiệu.
- Điều kiện: sau `FILLED` hoặc `MANUAL_LIMIT_SUBMITTED`, UI không khóa input/nút; chỉ khóa khi request đang `SUBMITTING/pending` để chống
  double-click. API cho đặt thêm khi không có position hoặc position đang cùng chiều paper trade; position ngược chiều vẫn bị chặn. Một LIMIT
  entry chưa khớp của symbol vẫn chặn entry mới để tránh xếp trùng ngoài ý muốn.
- Hiển thị sau thao tác: MARKET báo `ĐÃ VÀO LỆNH GIÁ <fill/mark>`; LIMIT báo `ĐÃ ĐẶT LIMIT GIÁ <entry>`. State server cũ `FILLED` cũng được
  ánh xạ lại thành câu giá vào và không disable controls.
- Thống kê/whitelist: không thêm card hoặc key mới, không thay cách tính CLOSED/W/L/WR/AvgROE và không đổi policy checkbox.
- Ảnh hưởng Binance/entry/size/SL/TP: có ảnh hưởng entry thật nhưng chỉ sau click + confirm của người dùng; margin/leverage vẫn theo input,
  mặc định `$2 × 5x`. Không tự DCA, không đổi TP/SL; protection plan và guard chống trùng hiện tại vẫn chạy sau fill.
- Tương thích JSON cũ: không đổi schema. Các field `binanceEntry*` tiếp tục lưu kết quả gần nhất; trade cũ có `FILLED` được mở controls ngay
  khi tải UI V4, không rewrite lịch sử.
## 2026-08-10 - Profit-lock lệnh tay không còn bị TSL exclude cũ chặn

- Version: `BINANCE_PROFIT_LOCK_NON_V2_ONLY_V8_INITIAL_MARGIN_ROE_20260810`.
- Dữ liệu dùng trước khi dời SL: position Binance đang mở, side, average entry, leverage, mark price/UPnL và nguồn
  lifecycle đã snapshot; không dùng dữ liệu tương lai. Matcher chỉ miễn profit-lock cho source/trade thật sự thuộc
  `liquid-flow-v2*`.
- Điều kiện phân loại: position ngoài Liquid Flow V2 đạt ROE cấu hình (mặc định `>= 5%`) khóa tối thiểu `+1% ROE`;
  từ `15%` dùng ladder `+5%`, `20% -> +10%`, `25% -> +15%`, `30% -> +20%`. `tslExcludedSymbols` từ các signal
  Post-dump/Post-pump/Spike cũ không còn được phép chặn nhánh profit-lock hoặc safety scan.
- Thống kê: không thêm nhãn/card/checkbox và không đổi paper stats; trạng thái vẫn ghi optional
  `profitLockVersion/profitLockRoe/profitLockStopLossPrice` vào lifecycle/sl-tracking sau khi Binance xác nhận SL.
- Ảnh hưởng Binance/entry/size/SL/TP: có thể dời SL thật của position ngoài V2 khi đủ ngưỡng; giữ cơ chế đặt SL mới
  trước rồi mới hủy SL cũ. Không đổi entry, margin/size, leverage hay TP. Liquid Flow V2 vẫn dùng protection riêng.
- Tương thích JSON cũ: không thêm field bắt buộc và không rewrite record cũ; field profit-lock vẫn optional, source
  null/unknown/manual được coi là ngoài V2 như policy hiện hành.

### Hotfix socket mark-price realtime

- Version: `POSITION_MONITOR_MARK_STREAM_DIRECT_AND_COMBINED_V2_20260810`.
- Position monitor nhận cả payload mark-price trực tiếp từ `/ws` và payload bọc `stream/data` từ combined stream; chỉ
  event `markPriceUpdate` có symbol và mark dương mới được dùng. ROE vẫn tính từ entry, amount, leverage/margin đã có
  trước tick; không dùng candle/outcome tương lai.
- Không đổi phân loại nhãn, gate, thống kê hoặc whitelist. Thay đổi làm callback profit-lock chạy realtime thay vì phải
  chờ safety scan sau warm-up. Có thể dời SL Binance theo policy V4 ở trên; không đổi entry/size/leverage/TP.
- Không đổi JSON hay rewrite lịch sử; đây chỉ là sửa parser runtime và telemetry status socket.
- Safety scanner signed-REST nay khởi động ngay cùng position monitor, trước warm-up kline/strategy. Nó chạy ngay lần đầu
  và retry sau 10 giây khi cache position khởi động chưa kịp nạp, rồi theo interval cấu hình (`90s` hiện tại), nên vẫn
  khóa lời khi market websocket chỉ ACK nhưng không phát tick.
- Riêng safety scan bảo vệ position được phép bypass `shouldDeferAlgoRest()` trong warm-up để lấy position/mark/UPnL
  Binance thật; các scanner chiến lược khác vẫn bị defer như cũ. Cache, API cooldown và interval 90 giây giữ nguyên.
- Mẫu số ROE ưu tiên `positionInitialMargin/initialMargin`; chỉ fallback `isolatedMargin`, rồi mới tính
  `abs(qty) * entry / leverage`. Điều này khớp ROE position Binance và tránh isolated wallet tăng làm hạ sai bậc khóa.
- Kiểm chứng live CYS lifecycle cũ: `62 @ 1.2042`, SL `1.144 -> 1.2162` được Binance xác nhận. Nếu người dùng DCA làm
  quantity/average entry đổi, lifecycle mới được đánh giá lại theo entry và ROE mới; không mang target ROE cũ sang sai basis.
## 2026-08-10 - Discord cho HTF BEAR/BULL EMA99 15m

- Version: `LIQUID_FLOW_V2_HTF_DISCORD_V1_20260810`.
- Dữ liệu dùng trước alert: snapshot causal đã có của hai nhãn gồm nến 15m đã đóng/EMA99/touch/reject hoặc reclaim,
  trend 1h/4h đã đóng, volume/taker, mark, 24h/1h và confidence; không dùng PnL/outcome tương lai.
- Điều kiện gửi: chỉ transition mới sau baseline vào `HTF_BEAR_15M_EMA99_PUMP_REJECT` hoặc
  `HTF_BULL_15M_EMA99_DUMP_RECLAIM`; dedupe theo `symbol + label + closeTime nến 15m`, retention mặc định 24 giờ.
  Cả full refresh và fast scan đều đi chung matcher. Webhook ưu tiên `LIQ_FLOW_V2_HTF_WEBHOOK_URL`, fallback
  `LIQ_SCAN_WEBHOOK_URL` rồi `DISCORD_WEBHOOK_URL`; lỗi HTTP/network được phép retry ở transition sau.
- Thống kê/whitelist: không đổi cohort CLOSED, AvgROE hoặc key checkbox hiện hữu
  `heatmap-v2:HTF_BEAR_15M_EMA99_PUMP_REJECT` / `heatmap-v2:HTF_BULL_15M_EMA99_DUMP_RECLAIM`; mặc định tắt và chỉ
  hiện theo policy AvgROE closed `>4%` như trước.
- Ảnh hưởng Binance/entry/size/SL/TP: không ảnh hưởng. Alert ghi rõ `PAPER EVAL ONLY`, không cấp gate/order và không
  thêm hai HTF key vào auto-real allow-list. Không đổi JSON hay rewrite trade cũ; dedupe là runtime-only.

## 2026-08-10 - Pump mạnh → sideway phân phối → breakdown/retest SHORT

- Version classifier: `LIQUID_HEATMAP_FLOW_V2_PUMP_DISTRIBUTION_V6_20260810`; paper:
  `LIQUID_FLOW_V2_PAPER_V13_PUMP_DISTRIBUTION_EVAL_20260810`. Thêm hai nhãn tách pha
  `PUMP_DISTRIBUTION_WATCH` và `PUMP_DISTRIBUTION_SHORT_READY`.
- Dữ liệu causal trước entry: tối đa 32 nến 15m đã đóng (`closeTime <= now`) trong cửa sổ 48 nến, change 24h tại scan,
  OHLC, quote volume và taker-buy quote volume. Peak chỉ được tìm tại vị trí còn tối thiểu sáu nến sau nó; hai nến cuối
  dành riêng cho breakdown và retest nên không lọt dữ liệu xác nhận tương lai vào vùng base.
- Điều kiện WATCH: local pump từ low context đến peak `>=10%`, change 24h `>=18%`; sau peak có 4-12 nến base, range
  `<=14%`, giá đã drawdown `2-28%` từ peak, ít nhất hai lower-high và hai upper-wick `>=25%` range; volume base/peak
  `<=0.95`, taker delta base `<=+12%`, peak cách hiện tại 6-16 nến và giá vẫn ở trong vùng. Đây là `OBSERVE ONLY`, chưa
  phải điểm SHORT và không tạo paper.
- Điều kiện SHORT READY: phải có toàn bộ structure trên, nến áp chót đóng dưới support tối thiểu `0.3%`, low xuyên
  support, volume breakdown `>=1.15x` base và taker delta `<=-2%`; nến đóng cuối phải retest tới trong `0.7%` dưới
  support, vẫn đóng dưới ít nhất `0.2%`, đồng thời là nến đỏ hoặc có upper-wick `>=25%` range. Chỉ transition READY mới
  tạo paper SHORT 5x `IMMEDIATE_MARK`, hard SL `-20% ROE`, TP floor `+10% gross ROE`; signal key dùng closeTime nến
  15m retest để chống duplicate/restart backfill.
- Thống kê/whitelist: mỗi nhãn có card riêng và key canonical `heatmap-v2:PUMP_DISTRIBUTION_WATCH` /
  `heatmap-v2:PUMP_DISTRIBUTION_SHORT_READY`. Checkbox mặc định tắt, matcher runtime dùng đúng key; chỉ CLOSED paper
  được tính W/L, WR, NET, PF, AvgROE và checkbox chỉ hiện khi closed AvgROE `>4%`. WATCH không có paper nên không thể
  tự đủ điều kiện whitelist nếu không có dữ liệu CLOSED hợp lệ.
- Ảnh hưởng Binance/entry/size/SL/TP: cả hai nhãn không nằm trong auto-real allow-list. WATCH không entry; READY chỉ
  entry/SL/TP giả lập paper, không gửi Binance dù checkbox được bật. Không đổi size/leverage/TP/SL của PRE, BASE, HTF,
  lệnh tay hoặc chiến lược khác.
- Tương thích JSON cũ: thêm optional snapshot `pumpDistribution15m` và các field structure/flow bên trong; paper V13 lưu
  snapshot này khi có. Store/trade V1-V12 thiếu field vẫn đọc bình thường, không migration, không rewrite và không backfill
  lịch sử. Nhãn cũ và whitelist key cũ giữ nguyên.

## 2026-08-10 - Chỉ đặt protection sau Binance socket FULL FILL

- Version: `POSITION_PROTECTION_SOCKET_FULL_FILL_ONLY_V1_20260810`. Dữ liệu trước khi đặt protection chỉ là Binance
  user-data `ORDER_TRADE_UPDATE` có execution type `TRADE`, order status `FILLED`, last filled quantity dương và không
  `reduceOnly`; dùng cumulative fill/average fill/orderId/clientOrderId từ chính event này. `PARTIALLY_FILLED`, REST position
  sync, kết quả REST trả về từ lệnh MARKET và position được phát hiện sau restart không được xem là trigger SL/TP.
- Điều kiện/runtime: REST sync 60 giây chỉ cập nhật position cache và ROE, không gọi `onOrderFill`. Tắt invocation của
  `startMissingTpScanner()` và `startSlTrailSafetyScanner()` bất kể env cũ; xóa REST market-fill recovery. TP/SL đính kèm
  lệnh tay/auto đều chuyển thành protection plan chờ socket; LIMIT chưa fill không tạo TP/SL. Khi full fill tới, orderId hoặc
  clientOrderId phải khớp plan; duplicate full-fill bị chặn bởi `appliedAt` và fresh-open-order guard. Retry ngắn của cùng
  callback socket vẫn được phép khi Binance từ chối tạm thời, không phải position rescan.
- Fallback: lệnh full-fill từ socket không có signal plan được chạy one-shot fallback SL và TP sau fill. Không còn vòng lặp
  định kỳ đi tìm SL/TP thiếu. Nếu user-data socket bị mất event, hệ thống không tự phục hồi protection bằng REST; người dùng
  phải kiểm tra/đặt tay trên Orders/Binance.
- Thống kê/nhãn/whitelist: không thêm hoặc đổi nhãn, tier, card, snapshot thống kê hay checkbox. CLOSED paper/AvgROE và
  matcher whitelist giữ nguyên; thay đổi này là lifecycle execution, không biến label OBSERVE ONLY thành gate.
- Ảnh hưởng Binance/entry/size/SL/TP: không đổi điều kiện entry, margin, size hoặc leverage. Có thay đổi thời điểm SL/TP thật:
  chỉ sau socket full fill; partial/unfilled không có protection. Profit-lock và TP về entry khi âm sâu vẫn được xử lý từ
  Binance mark-price socket theo rule hiện hành, nhưng REST safety scanner không còn chạy. Không tự bù protection đã bị
  người dùng xóa sau đó.
- Tương thích JSON cũ: không thêm field bắt buộc, không rewrite `sl-tracking`, lifecycle, paper hoặc order history. Plan cũ
  trong memory tiếp tục dùng orderId/clientOrderId; record JSON thiếu version vẫn đọc bình thường. Env example đặt
  `AUTO_TP_SCAN_ENABLED=false` và `SL_TRAIL_SAFETY_SCAN_ENABLED=false`; code không gọi scanner ngay cả khi env triển khai cũ
  còn `true`.

## 2026-08-10 - Hotfix protection khi Binance chỉ phát TRADE_LITE

- Version: `POSITION_PROTECTION_SOCKET_FILL_V2_TRADE_LITE_VERIFIED_20260810`, thay thế trigger V1. Dữ liệu dùng trước khi đặt
  protection vẫn bắt đầu từ Binance user-data socket: nhận trực tiếp `ORDER_TRADE_UPDATE` full fill hoặc `TRADE_LITE` có
  symbol/orderId/lastQty. Vì `TRADE_LITE` không mang final order status, runtime chỉ query đúng orderId vừa nhận qua socket và chỉ
  chấp nhận khi REST trả `status=FILLED`, `executedQty>0`, không `reduceOnly/closePosition`.
- Điều kiện runtime: query xác minh là bounded retry `0/150/350/750/1250ms` gắn với đúng một event/orderId, không phải scanner
  position hay scanner tìm SL/TP thiếu. Sau xác minh, REST position cache phải còn position cùng hướng với fill; fill đóng position
  hoặc ngược hướng bị bỏ qua. `ORDER_TRADE_UPDATE` và `TRADE_LITE_VERIFIED` dùng chung dedupe orderId 24 giờ và in-flight lock,
  nên cùng một fill không thể đặt protection hai lần.
- Cách thống kê: không thêm/đổi nhãn, tier, snapshot, card, cohort CLOSED, AvgROE hoặc checkbox WHITELIST. Telemetry runtime thêm
  `lastTradeLiteAt` và `lastTradeLiteVerifiedAt`; matcher whitelist và paper stats giữ nguyên.
- Ảnh hưởng Binance/entry/size/SL/TP: không đổi entry, margin, size, leverage hay giá TP/SL. Có ảnh hưởng thời điểm đặt TP/SL thật:
  fill được Binance phát bằng `TRADE_LITE` nay được xác minh rồi đi vào cùng protection plan/fallback one-shot như full fill chuẩn.
  Missing-TP và SL safety scanner vẫn tắt; không quét lại hoặc tự dựng protection đã bị xóa về sau.
- Tương thích JSON cũ: không thêm field bắt buộc, không migration/rewrite lifecycle, paper, sl-tracking hay order history. Source mới
  `TRADE_LITE_VERIFIED` chỉ tồn tại trong event runtime/Discord; record cũ và plan cũ theo orderId/clientOrderId vẫn đọc bình thường.
- Hotfix precision đi kèm: `BINANCE_SCIENTIFIC_STEP_PRECISION_V1_20260810`. Tick/step rất nhỏ như `1e-8` nay được chuyển đúng
  thành 8 chữ số thập phân thay vì 0; trước đây `priceFromTick()` có thể tạo chuỗi rỗng cho SATS/HMSTR/IOST, khiến signed request
  loại bỏ `triggerPrice` và Binance từ chối TP/SL. Rule mới chỉ sửa chuẩn hóa precision theo exchange filter đã biết trước entry;
  không đổi target TP/SL, label/stats/whitelist hay JSON. Nó có thể sửa cả rounding quantity/entry cho symbol có step dạng khoa học,
  nhưng không thay margin, leverage hoặc policy chọn lệnh.

## 2026-08-11 - Profit-lock riêng cho lệnh Binance vào tay

- Version: `BINANCE_PROFIT_LOCK_V9_MANUAL_ROE10_LOCK1_20260811`. Dữ liệu causal dùng trước khi dời SL gồm position Binance đang
  mở, average entry, side, leverage, mark price/UPnL realtime và metadata entry đã ghi tại thời điểm fill; không dùng candle hay
  outcome tương lai.
- Phân loại MANUAL ưu tiên trước matcher Liquid Flow V2: source chứa `manual` (`liquid-flow-v2-manual`, `orders-manual`, v.v.)
  hoặc position không có source/lifecycle/plan bot được coi là lệnh người dùng vào trực tiếp. Manual trade từ trang V2 còn được
  nối bằng `binanceEntryMode=MANUAL_*`, symbol/side, entry lệch tối đa 5% và fill time lệch tối đa 5 phút. Position bot V2 tự động
  (`base/pre/ready/...`) vẫn bị loại khỏi profit-lock này.
- Rule: lệnh manual đạt ROE realtime `>=10%` đặt/nâng SL tại `+1% ROE`; `15% -> +5%`, rồi mỗi thêm 5 điểm ROE nâng thêm 5 điểm
  (`20 -> 10`, `25 -> 15`, ...). Giá SL tính theo entry và leverage: LONG `entry*(1+lock/100/leverage)`, SHORT đối xứng. Chỉ nâng,
  không hạ SL; đặt SL mới thành công rồi mới hủy SL cũ và chống duplicate/cooldown như trước.
- Thống kê/nhãn/whitelist: không thêm nhãn, card, snapshot, cohort hay checkbox. Thay đổi chỉ ghi telemetry optional
  `profitLockVersion/profitLockRoe/profitLockStopLossPrice`; paper stats và matcher whitelist không đổi.
- Ảnh hưởng Binance/entry/size/SL/TP: có dời SL Binance thật của lệnh tay khi đủ ngưỡng; không đổi entry, margin, size, leverage hay
  TP. Không bật lại REST safety/missing-SL scanner: rule chạy từ mark-price socket của position đang mở. JSON cũ tương thích vì
  không có field bắt buộc/migration/rewrite; record thiếu source được xem là manual/unknown chỉ khi không gắn lifecycle/plan bot.

## 2026-08-11 - Liquid LONG Spring / SHORT Upthrust Reversal

- Versions: `LIQUID_SPRING_REVERSAL_V1_CLOSED_SWEEP_RECLAIM_20260811`,
  `LIQUID_SPRING_REVERSAL_WHITELIST_V1_20260811` và whitelist runtime
  `LIVE_CARD_WHITELIST_V9_LIQ_SPRING_REVERSAL_20260811`.
- Dữ liệu dùng trước entry: tối đa sáu nến 5m/15m đã đóng trước `createdAt/openedAt`, OHLCV nến xác nhận, hướng candle
  coin/BTC đã snapshot tại entry và `LONG/SHORT score` trong `marketDirectionAtSignal`. Nến có close time sau signal bị loại;
  PnL/ROE/outcome không tham gia phân loại.
- `LIQ LONG SPRING REVERSAL`: LONG quét dưới local-low sáu nến ít nhất `0.15%`, nến bullish đóng reclaim trên local-low ít
  nhất `0.05%`, candle coin và BTC đều BULLISH, đồng thời `SHORT score - LONG score >= 15`. Nhãn đối xứng
  `LIQ SHORT UPTHRUST REVERSAL`: SHORT quét trên local-high `>=0.15%`, nến bearish đóng reject dưới local-high `>=0.05%`,
  coin/BTC đều BEARISH và `LONG score - SHORT score >= 15`.
- Cách thống kê: hai card luôn hiện riêng LONG/SHORT, tính total/open/pending/closed, W/L, WR, PF, PnL đóng/active, AvgROE,
  ngày dương và tách snapshot/backfill causal. Mỗi card có key matcher đúng
  `spring-reversal:LONG_SPRING|SHORT_UPTHRUST`, mặc định tắt; checkbox `WHITELIST` chỉ hiện khi closed `AvgROE > 4%`.
- Ảnh hưởng Binance/entry/size/SL/TP: nhãn là `OBSERVE ONLY`, không tự tạo paper, không gate/chặn, không đổi entry, size,
  leverage, SL hoặc TP và không tự cấp Binance. Nếu sau này người dùng chủ động bật cả candidate whitelist và quyền `LỆNH THẬT`
  tại Orders, cùng key mới có thể được matcher runtime nhận như các card khác.
- Tương thích JSON cũ: trade mới append field optional `liquidSpringReversal*` và `liquidSpringStructureAtEntry`. Trade cũ chỉ
  backfill khi kline cache còn chứa đúng nến trước entry; thiếu dữ liệu trả `NO DATA`, không gán nhãn gần đúng, không rewrite JSON.

## 2026-08-11 - Liquid Flow V2 và lệnh tay cùng khóa SL từ ROE 10%

- Version: `BINANCE_PROFIT_LOCK_V10_LIQUID_V2_AND_MANUAL_ROE10_LOCK1_20260811`, thay thế V9. Dữ liệu causal dùng trước
  mỗi lần nâng SL là position Binance đang mở, average entry, side, leverage, mark/UPnL realtime và metadata source/plan/
  lifecycle đã snapshot lúc fill; không dùng nến hoặc outcome tương lai.
- Phân loại: mọi position khớp `isLiquidFlowV2ManagedPosition()` (auto PRE/BASE/READY và các source V2 tương thích) hoặc
  `isManualBinanceManagedPosition()` (gồm lệnh bấm tay trên trang V2, Orders và position không có lifecycle bot) dùng chung
  thang `ROE 10% -> khóa +1%`, `15% -> +5%`, `20% -> +10%`, sau đó tăng thêm 5 điểm khóa cho mỗi 5 điểm ROE. Position
  ngoài hai nhóm tiếp tục policy profit-lock ngoài V2 hiện hành; chỉ nâng protection, không hạ SL tốt hơn.
- Cách thống kê không đổi: không thêm nhãn, snapshot thống kê, card, cohort, WR/PF/PnL hay checkbox `WHITELIST`; matcher
  whitelist và điều kiện closed `AvgROE > 4%` giữ nguyên. Telemetry profit-lock vẫn là field optional.
- Ảnh hưởng Binance: có thay đổi SL thật cho cả lệnh auto và lệnh tay Liquid Flow V2 khi mark-price socket báo đủ ngưỡng;
  đặt SL mới thành công trước khi hủy SL cũ. Không đổi quyền entry, margin/size, leverage, TP hay SL gốc lúc mới fill. Missing-SL
  và REST safety scanner vẫn tắt, nên rule này không quét dựng lại protection đã bị xóa và không chạy nếu thiếu mark socket.
- Tương thích JSON cũ: không thêm field bắt buộc, không migration/rewrite paper, lifecycle hoặc `sl-tracking`. Record cũ thiếu
  version vẫn được phân loại qua source/plan/lifecycle hoặc nối paper V2 hiện có; consumer cũ bỏ qua telemetry mới an toàn.

## 2026-08-11 - Post-pump unwind V7: giữ nhãn phân phối lâu hơn và không bị nhãn chính che

- Versions: classifier `LIQUID_HEATMAP_FLOW_V2_POST_PUMP_UNWIND_V7_20260811`, paper
  `LIQUID_FLOW_V2_PAPER_V14_SECONDARY_DISTRIBUTION_20260811`. V7 giữ nguyên hai key canonical
  `PUMP_DISTRIBUTION_WATCH` và `PUMP_DISTRIBUTION_SHORT_READY`; đây vẫn là nhãn đánh giá hậu pump, không phải gate
  lệnh thật.
- Dữ liệu causal trước entry: tối đa 192 nến 15m đã đóng (48 giờ) và 168 nến 1h đã đóng (7 ngày), OHLC,
  quote volume, taker-buy quote volume và change 24h tại scan. Cửa sổ ứng viên mặc định tăng từ 14 lên 20 top tăng/
  giảm, tối đa 48 symbol; cache 15m seed 220 nến. Không dùng nến tương lai, PnL, MFE/MAE hoặc outcome sau entry.
- Phân loại WATCH: khi đủ dữ liệu 1h, pump dùng mức lớn hơn giữa pump local 15m và pump cycle 72h/7d, yêu cầu
  `>=30%`; fallback tương thích khi thiếu 1h giữ điều kiện local `>=10%` và change ngày `>=18%`. Peak được giữ từ
  6 đến 96 nến 15m; drawdown từ peak `5-70%`; base có ít nhất hai lower-high và hai upper-wick, volume fade
  `<=1.05`, taker delta base `<=+15%`. Range base tối đa thích ứng `clamp(pump*0.35, 14%, 28%)`, nên coin pump
  80-300% không bị loại chỉ vì sideway rộng hơn 14%. `EARLY_UNWIND`, `MID_UNWIND`, `LATE_UNWIND` được tính từ
  khoảng peak về cycle origin; late unwind chỉ quan sát, không đuổi SHORT.
- Phân loại SHORT READY: tìm breakdown trong năm nến đóng gần nhất, close thấp hơn support tối thiểu 0.3%, low xuyên
  support, volume `>=1.1x` base và taker bán không dương. Xác nhận được giữ trong tối đa bốn nến sau breakdown khi
  có failed retest, hoặc có ít nhất hai close giữ dưới support. READY bị chặn ở `LATE_UNWIND` để tránh entry sau khi
  phần lớn biên xả đã đi hết.
- Nhãn phân phối chạy như `secondaryLabels` độc lập với chuỗi ưu tiên BASE/SWEEP/HTF/SQUEEZE. Một symbol có thể giữ
  nhãn chính hiện tại và đồng thời hiện card phụ WATCH/SHORT READY; stats, bộ lọc SHORT/READY và transition đều đọc
  cả hai lớp. WATCH không tạo paper. SHORT READY mới tạo paper SHORT 5x `IMMEDIATE_MARK`, signal key neo `readyAt`
  của nến xác nhận; paper distribution được thống kê riêng dù symbol đang có paper nhãn khác.
- Thống kê/whitelist: tiếp tục dùng đúng matcher UI/runtime `heatmap-v2:PUMP_DISTRIBUTION_WATCH` và
  `heatmap-v2:PUMP_DISTRIBUTION_SHORT_READY`, mặc định tắt. Mỗi nhãn có card riêng; chỉ trade paper `CLOSED` cùng
  label được tính W/L, WR, NET, PF, AvgROE và checkbox `WHITELIST` chỉ hiện khi closed AvgROE `>4%`. Không trộn PnL
  Binance hoặc paper của nhãn chính vào cohort phân phối.
- Ảnh hưởng Binance/entry/size/SL/TP: không thay đổi Binance thật, không thêm hai key vào auto-real allow-list và
  không đổi margin, leverage, entry, SL/TP của PRE/BASE/HTF/lệnh tay. Chỉ `PUMP_DISTRIBUTION_SHORT_READY` ảnh hưởng
  entry/SL/TP giả lập của paper V2 theo policy paper đang chạy; WATCH hoàn toàn observe-only.
- Tương thích JSON cũ: `secondaryLabels`, `pump72hPct`, `cycleOriginPrice`, `unwindProgressPct`, `unwindTier`, `stage`,
  `breakdownAt`, `readyAt` và `continuationConfirmed` đều optional. Consumer cũ vẫn đọc `classification.labelKey`
  chính; store/trade V1-V13 thiếu field vẫn load bình thường, không migration, rewrite hoặc gán nhãn backfill gần đúng.

## 2026-08-11 - Binance Futures Mark Price chuyển sang route `/market`

- Version: `POSITION_MONITOR_MARKET_ROUTE_AND_STALE_WATCHDOG_V3_20260811`, thay thế
  `POSITION_MONITOR_MARK_STREAM_DIRECT_AND_COMBINED_V2_20260810`. Binance đã tách Futures WebSocket thành route
  `/public`, `/market` và `/private`; `@markPrice@1s` thuộc `/market`. Runtime nay kết nối
  `wss://fstream.binance.com/market/ws` thay vì endpoint cũ không route `.../ws`, vốn vẫn ACK subscribe nhưng không
  còn phát Mark Price.
- Dữ liệu dùng trước mỗi quyết định dời SL vẫn là position Binance đang mở, average entry, side, leverage và Mark Price
  realtime của đúng symbol. Không dùng candle tương lai, PnL paper hoặc outcome sau khi đóng; dữ liệu trước entry và
  điều kiện phân loại manual/Liquid Flow V2 không thay đổi.
- Điều kiện phân loại và rule giữ nguyên: manual hoặc Liquid Flow V2 dùng ladder `ROE 10% -> khóa +1%`,
  `15% -> +5%`, `20% -> +10%`, sau đó tăng theo bước 5 điểm; các nhóm khác giữ policy hiện hành. Watchdog 5 giây
  kiểm tra stream đang có subscription; nếu 15 giây không nhận một tick hợp lệ thì đóng socket và reconnect, tránh trạng
  thái kết nối/ACK thành công nhưng ROE không chạy.
- Cách thống kê: không thêm nhãn, tier, snapshot, card, cohort hay checkbox `WHITELIST`; thống kê paper/WR/PF/AvgROE
  giữ nguyên. Status monitor chỉ bổ sung telemetry runtime `markStreamUrl`, `lastMarkStaleAt` và `markReconnectCount`.
- Ảnh hưởng Binance/entry/size/SL/TP: không đổi quyền entry, margin/size, leverage, TP, SL ban đầu hoặc ngưỡng profit-lock.
  Có ảnh hưởng SL thật theo đúng rule đã có vì callback ROE hoạt động lại; watchdog chỉ reconnect feed, không tự tạo lại
  SL/TP bị người dùng xóa. Missing-protection và REST SL safety scanner vẫn tắt.
- Tương thích JSON cũ: không thêm field JSON bắt buộc, không migration/rewrite paper, lifecycle, order history hoặc
  `sl-tracking`. Telemetry mới chỉ ở response status trong memory; consumer và record cũ tiếp tục đọc bình thường.

## 2026-08-11 - Orders Exclude chỉ giữ khóa an toàn +1% ROE

- Version: `BINANCE_PROFIT_LOCK_V11_ORDERS_EXCLUDE_CAP_ROE1_20260811`, thay thế V10. Dữ liệu dùng trước mỗi lần xét
  gồm checkbox `tsl_excluded` đã đồng bộ từ Orders vào runtime, symbol của position thật, average entry, side, leverage
  và Mark Price/ROE realtime; không dùng dữ liệu tương lai hoặc outcome sau khi đóng.
- Điều kiện phân loại: nếu symbol đang được check `Cap TSL`/Exclude trên Orders thì dưới 10% ROE không dời; từ 10% ROE
  trở lên target luôn cố định `+1% ROE`. Các bậc `15% -> +5%`, `20% -> +10%` và cao hơn bị vô hiệu riêng cho symbol
  được check. Khi bỏ check, manual/Liquid Flow V2 trở lại ladder đầy đủ V10; position khác trở lại policy nhóm hiện hành.
  Nếu SL đã được nâng cao trước lúc check thì runtime không hạ SL xuống +1%.
- Cách thống kê: không thêm nhãn, tier, snapshot, card, cohort hoặc checkbox `WHITELIST`; WR/PF/PnL/AvgROE và matcher
  whitelist không thay đổi. Checkbox Orders cũ giữ nguyên key/API để tương thích, chỉ đổi mô tả hiển thị thành `Cap TSL`.
- Ảnh hưởng Binance/entry/size/SL/TP: có giới hạn mức dời SL thật theo symbol được check; vẫn giữ lớp bảo vệ +1% khi
  ROE đạt 10%. Không đổi entry, margin/size, leverage, TP, SL ban đầu; không tự dựng lại protection bị xóa và không bật
  REST safety/missing-protection scanner.
- Tương thích JSON cũ: không đổi schema hay rewrite JSON. Danh sách exclude tiếp tục đồng bộ bằng API/localStorage hiện
  có; record paper, lifecycle, history và `sl-tracking` cũ không cần migration.

## 2026-08-11 - HTF EMA99 retest nhận cả nến 5m và 15m

- Versions: classifier `LIQUID_HEATMAP_FLOW_V2_MTF_EMA99_RETEST_V8_20260811`; paper
  `LIQUID_FLOW_V2_PAPER_V15_MTF_EMA99_RETEST_20260811`; Discord
  `LIQUID_FLOW_V2_HTF_DISCORD_MTF_V2_20260811`. Dữ liệu dùng trước entry chỉ gồm nến đã đóng 5m/15m,
  EMA99 tính từ tối thiểu 105 close, hai nến retest gần nhất, context 10 nến, volume/taker quote trước tín hiệu và trend
  1h/4h đã đóng; không dùng nến tương lai hoặc outcome sau entry.
- Điều kiện phân loại giữ HTF cùng hướng: ít nhất một trong 1h/4h bearish cho SHORT hoặc bullish cho LONG. Một snapshot
  5m **hoặc** 15m phải xác nhận prior close ở đúng phía EMA99, pump/dump `>=2%`, close reject/reclaim cách EMA99
  `0.2-10%`, giveback/recovery `>=0.25`, volume `>=1.3x`, taker guard và thân/râu xác nhận. Band 15m cũ giữ `1.5%`;
  riêng 5m cho phép râu sweep xuyên EMA99 tối đa `15%` để nhận case small-cap như VELVET rồi hồi mạnh. Nếu cả hai khớp,
  classifier dùng snapshot có `candleClosedAt` mới hơn và ghi `ema99RetestTimeframe`.
- Cách thống kê giữ nguyên hai key lịch sử `HTF_BEAR_15M_EMA99_PUMP_REJECT` và
  `HTF_BULL_15M_EMA99_DUMP_RECLAIM`; title hiển thị đổi thành `5M/15M`. Checkbox `WHITELIST` hiện hữu tiếp tục dùng key
  `heatmap-v2:<labelKey>`, mặc định tắt và chỉ hiện khi cohort CLOSED có `AvgROE > 4%`; không tạo card/key mới hay trộn
  OPEN/PENDING vào AvgROE.
- Ảnh hưởng Binance/entry/size/SL/TP: hai nhãn vẫn `PAPER EVAL ONLY`, chỉ mở rộng tập paper để đánh giá; không cấp
  Binance thật, không đổi entry thật, margin/size, leverage, SL hoặc TP. Paper dedupe theo candle của timeframe thực sự
  đã khớp thay vì luôn lấy candle 15m.
- Tương thích JSON cũ: giữ nguyên label key và field `ema99Retest15m`; thêm optional `ema99Retest5m`,
  `ema99RetestTimeframe` và `ema99RetestCandleClosedAt`. JSON/trade cũ thiếu các field mới vẫn load; paper 15m cũ vẫn
  dedupe theo `ema99Retest15m.candleClosedAt`, không migration, rewrite hoặc backfill nhãn.

## 2026-08-11 - Calendar thống kê Orders theo ngày Bangkok

- Version: `LIVE_CARD_WHITELIST_PNL_STATS_V5_20260811_BANGKOK_CALENDAR`. Đây là bộ lọc báo cáo sau giao dịch;
  không thêm hoặc đọc dữ liệu trước entry để ra quyết định. Ngày cohort lấy từ `entryFilledAt`, fallback
  `entrySubmittedAt` rồi `attemptedAt`, quy đổi theo `Asia/Bangkok`; không dùng thời điểm đóng để tránh chuyển một lệnh
  sang cohort khác sau khi giữ qua ngày.
- Điều kiện phân loại tín hiệu/nhãn, tier, gate và whitelist matcher giữ nguyên. UI Orders có `Từ ngày`, `Đến ngày`,
  `Hôm nay`, `Tất cả`, `Search`; mặc định là ngày Bangkok hiện tại. API không truyền range vẫn trả toàn lịch sử để giữ
  tương thích consumer cũ; range đảo ngược được chuẩn hóa tự động.
- Cách thống kê: server lọc lifecycle theo ngày entry trước, sau đó mới tính lại overview, từng key whitelist,
  LONG/SHORT split, WR, PF, AvgROE, NET Binance và paper exact `paperTradeId` của đúng cohort. History dùng cùng range;
  response thêm `availableDays`, `dateRange`, `unfilteredTotal`, còn `total` là số lifecycle trong range.
- Ảnh hưởng Binance/entry/size/SL/TP: không ảnh hưởng đặt lệnh thật, checkbox quyền lệnh thật, entry, margin/size,
  leverage, SL, TP, profit-lock hay socket position; calendar chỉ lọc báo cáo và không rewrite lifecycle.
- Tương thích JSON cũ: không đổi store lifecycle/paper và không migration/backfill. Các field response calendar là optional;
  client/API cũ không gửi `fromDay/toDay` tiếp tục nhận hành vi all-history như trước.
## 2026-08-11 - SHORT_FIT Binance chỉ vào BC_UTAD với entry guard 0,10%

- Version: `LIVE_CARD_SHORT_FIT_BC_UTAD_IOC_V1_20260811`. Dữ liệu dùng trước entry gồm snapshot paper đã đóng băng
  `edgeShortBestProfileKey=SHORT_FIT`, setup tại entry, side, signal entry và Binance Futures last price đọc song song với
  preflight ngay trước khi gửi MARKET. Rule không dùng outcome, PnL tương lai, nến tương lai hoặc thống kê sau entry.
- Điều kiện phân loại/quyền entry: key whitelist runtime giữ nguyên `edge:best-profile:SHORT_FIT`, nhưng riêng quyền do key này
  cấp chỉ còn trade `SHORT` có setup `BC_UTAD`. Với SHORT, độ trượt bất lợi được tính
  `max(0, (signalEntry - currentLast) / signalEntry * 100)`; chỉ `<=0,10%` mới gửi MARKET ngay. Vượt ngưỡng, thiếu last price,
  sai side/setup hoặc thiếu signal entry thì loại quyền của SHORT_FIT và **không chờ retest**. Nếu cùng trade còn khớp một
  card lệnh thật độc lập khác thì card đó vẫn được xét theo policy riêng.
- Cách thống kê: không tạo nhãn/card/cohort mới. Checkbox `WHITELIST` hiện có của `SHORT_FIT` tiếp tục dùng đúng key UI/runtime,
  mặc định tắt và vẫn chỉ hiện khi closed `AvgROE > 4%`. Backtest cửa sổ 14 ngày: paper `SHORT_FIT + BC_UTAD` có 61 lệnh,
  WR 91,8%, AvgROE +10,74%, PF 5,37; cohort Binance exact có entry bất lợi `<=0,10%` đạt 11 lệnh, NET +0,9404 USDT,
  Net AvgROE +2,85%, PF 4,79. Nới tới 0,25% chuyển thành NET -0,9839 nên runtime không dùng retest.
- Trạng thái triển khai hiện tại: theo yêu cầu người dùng, `edge:best-profile:SHORT_FIT` đã được bật trong cả whitelist thống kê
  và danh sách `LỆNH THẬT`; cấu hình mới/cài mới vẫn không tự bật key này nếu chưa có thao tác cấp quyền.
- Ảnh hưởng Binance/entry/size/SL/TP: có thu hẹp entry Binance thật của riêng `SHORT_FIT`; lệnh đạt chuẩn dùng MARKET,
  margin cố định `LIVE_CARD_SHORT_FIT_MARGIN_USDT=3`, leverage hiện hành giữ nguyên. Không đổi TP, SL, fill-anchor,
  profit-lock, max position hay dedupe; các card ngoài SHORT_FIT không đổi margin/entry.
- Tương thích JSON cũ: whitelist key và matcher card giữ nguyên, không rewrite/migrate paper/lifecycle cũ. Lifecycle/trade mới
  chỉ thêm field audit optional `liveCardShortFitEntry*` / `shortFitEntry*`; record cũ thiếu field vẫn đọc bình thường.

## 2026-08-12 - Guard entry SHORT theo từng cohort Binance thật

- Version: `LIVE_CARD_SHORT_ENTRY_GUARD_V1_20260812`, mở rộng policy riêng `SHORT_FIT` thành guard dùng chung cho mọi
  lệnh SHORT tự động đi qua live-card whitelist. Dữ liệu dùng trước entry chỉ gồm side/setup/combo và các key whitelist đã
  snapshot trên paper trước entry, signal entry, cùng Binance Futures last price lấy song song với positions/open-orders
  preflight ngay trước MARKET. Không đọc outcome, PnL sau entry, candle tương lai hoặc thống kê được tạo sau entry.
- Điều kiện phân loại và entry: độ trượt bất lợi của SHORT là
  `max(0, (signalEntry - currentLast) / signalEntry * 100)`. `SHORT_FIT + BC_UTAD` giữ ngưỡng `0,10%`;
  `EARLY_DUMP + BTC_DOWN_MID` dùng `0,60%`; `EARLY_DUMP + BTC_DOWN_WEAK` dùng `1,00%`;
  `DUMP + BTC_UP_WEAK` dùng `1,00%`; mọi SHORT còn lại có hard cap `1,00%`. Qua ngưỡng thì đặt MARKET ngay; vượt
  ngưỡng, thiếu signal/last price thì bỏ entry, không chờ retest. Nếu một trade vừa là `SHORT_FIT + BC_UTAD` vừa khớp card
  khác, ngưỡng chặt `0,10%` có ưu tiên trên toàn trade.
- `edge:best-risk-phase:DAY_BEAR_CONTINUE` chuyển về `OBSERVE ONLY`: key bị loại khỏi danh sách cấp lệnh thật hiện tại và
  runtime luôn bỏ quyền do riêng key này cấp. Nếu trade đồng thời khớp một card real độc lập khác thì card còn lại vẫn được
  xét bằng guard tương ứng. `SHORT_FIT` sai setup cũng chỉ mất quyền của key `SHORT_FIT`; card hợp lệ khác vẫn được xét.
- Cách thống kê/backtest: không thêm nhãn, card, tier, cohort hay checkbox mới; checkbox hiện hữu vẫn dùng đúng matcher,
  mặc định tắt và chỉ hiện khi CLOSED AvgROE `>4%`. Backtest paper 14 ngày của union key hiện tại có 229 lệnh, WR `91,7%`,
  AvgROE `+6,98%`, PF `3,80`, dương 12/13 ngày. Đối soát Binance exact từ 03-11/08, quy đổi margin $3: cấu hình cũ 154
  lệnh `-$16,600`; union key hiện tại 57 lệnh `+$3,484`; guard theo cohort và DAY_BEAR `<=0,20%` cho kết quả nghiên cứu
  53 lệnh, WR `84,9%`, AvgROE `+2,95%`, PF `4,45`, `+$4,689`. Runtime chọn phương án an toàn hơn là DAY_BEAR hoàn toàn
  observe-only thay vì cấp test `0,20%` do Binance mới có ba mẫu.
- Ảnh hưởng Binance/entry/size/SL/TP: có chặn entry Binance thật khi SHORT đã chạy quá xa signal; không thay đổi quyền
  LONG. SHORT_FIT hợp lệ vẫn dùng margin cố định `$3`; nhóm khác giữ margin/leverage hiện hành. Không đổi cách tính TP, SL,
  fill-anchor, profit-lock, dedupe, max-position hay lệnh tay/Liquid Flow V2 manual. Ticker mới chạy song song preflight để
  không cộng thêm một lượt REST tuần tự.
- Tương thích JSON cũ: không migration/rewrite paper hoặc lifecycle cũ. Lifecycle/trade mới chỉ thêm audit optional
  `shortEntryPolicyVersion`, `shortEntryRule`, `shortEntryDecision`, `shortEntryReason`, `shortEntrySignalPrice`,
  `shortEntryCurrentPrice`, `shortEntryAdverseSlippagePct`, `shortEntryMaxAdverseSlippagePct` và bản `liveCardShortEntry*`
  trên paper. Field `shortFitEntry*` cũ vẫn được ghi cho cohort SHORT_FIT; consumer/record cũ thiếu field mới vẫn hoạt động.
## 2026-08-12 - Liquid Flow V2 extended rank 21-60 EMA99 panic reclaim

- Version: `LIQUID_HEATMAP_FLOW_V2_EXTENDED_PANIC_RECLAIM_V9_20260812`, paper
  `LIQUID_FLOW_V2_PAPER_V16_EXTENDED_PANIC_RECLAIM_20260812`, Discord
  `LIQUID_FLOW_V2_EXTENDED_DISCORD_V1_20260812`. Du lieu causal truoc entry chi gom snapshot ticker 24h,
  quote volume, rank top tang, nen 5m/live mark, EMA13/25/99 tu nen da dong, volume/taker ba nen va trend 1h/4h da dong.
- Universe hai tang: lop chinh top 1-20 moi phia giu nguyen. Lop mo rong chi lay top tang rank 21-60 co quote volume
  `>=3M` va 24h `>=3%`, seed 5m truoc; chi toi da 20 symbol qua prefilter (180 bars, pullback `2-18%`, volume `>=0.8x`,
  gia/rau cach EMA99 toi da `2.5%`) moi seed 15m/1h/4h va vao classifier day du.
- Nhan `EXTENDED_EMA99_PANIC_RECLAIM_LONG` phan loai READY khi rank 21-60, 24h `>=3%`, 1h `>=-4%`, panic pullback
  `3-15%`, rau 5m trong band EMA99 `[-2%, +1.2%]`, mark reclaim `[+0.1%, +2%]`, rebound `>=0.3%`, EMA stack/slope
  con hop le, volume `>=1.2x`, taker delta `>=-25%`, co it nhat mot trend 1h/4h BULL va khong bi BASE/upper-rejection chiem nhan.
- Thong ke: tao paper LONG tai live mark cua scan READY, margin/leverage/TP/SL paper dung settings V2 hien hanh. Card moi co
  key UI/runtime exact `heatmap-v2:EXTENDED_EMA99_PANIC_RECLAIM_LONG`, mac dinh tat; checkbox chi hien khi CLOSED AvgROE `>4%`
  va AvgROE chi tinh CLOSED. Discord gui mot lan theo `symbol + label + candleClosedAt` den webhook rieng cau hinh.
- Anh huong Binance/entry/size/SL/TP: nhan la `OBSERVE + PAPER ONLY`, `liquidFlowV2AutoBinanceProfile` tra `eligible=false`;
  khong cap lenh that, khong gate/chan, khong doi entry/size/leverage/SL/TP hay profit-lock Binance. Universe chinh va cac rule
  PRE/BASE/HTF hien co khong doi.
- Tuong thich JSON cu: chi them optional `moverSide`, `moverRank`, `universeTier` tren feature/response va them label/card;
  record cu thieu field duoc xem la `PRIMARY_1_20`. Khong rewrite, migrate hay backfill store paper cu.
## 2026-08-12 - Binance position 12h: dời TP còn lại về +1% ROE

- Version: `BINANCE_TP_TO_ROE1_AFTER_12H_V1_20260812`. Dữ liệu dùng tại thời điểm quyết định chỉ gồm position Binance đang mở,
  entry trung bình, leverage, side/positionSide, Mark Price/ROE realtime từ socket và `openedAt` đã lưu ngay lúc fill; record cũ thiếu
  `openedAt` fallback sang thời điểm bot lần đầu thấy position sau khi khởi động. Không dùng outcome hay nến tương lai.
- Điều kiện: mặc định bật; position còn mở đủ `12h` (`43200000ms`) thì TP còn lại được đổi sang mức giá tương ứng gross ROE `+1%`:
  LONG `entry * (1 + 0.01/leverage)`, SHORT `entry * (1 - 0.01/leverage)`, làm tròn tick theo phía không thấp hơn mục tiêu lợi nhuận.
  Nếu ROE realtime đã `>=1%`, bot gửi reduce-only LIMIT marketable tại giá +1% (khớp tại mục tiêu hoặc tốt hơn) vì conditional TP đã
  nằm phía sau Mark sẽ bị Binance coi là immediately-triggering. Nếu chưa đạt, bot thay TP bằng `TAKE_PROFIT_MARKET` ở +1%; SL hiện hữu
  không bị hủy/thay.
- Ưu tiên an toàn: rule âm sâu và rule position đủ 8h còn âm đưa TP về entry giữ ưu tiên trước target +1%, tránh hai
  rule tranh nhau. Rule chạy event-driven trên position socket, có cooldown/in-flight guard và kiểm tra target hiện hữu để idempotent;
  đây không phải scanner dựng lại TP/SL bị thiếu.
- Thống kê/nhãn/whitelist: không thêm nhãn, card, tier, cohort hay checkbox; chỉ ghi audit optional vào tracking/lifecycle
  (`twelveHourTakeProfit*`, event `TWELVE_HOUR_TP_MOVED`). Không thay đổi cách tính WR/PF/AvgROE/NET hiện tại.
- Ảnh hưởng Binance/entry/size/SL/TP: có đổi TP hoặc đóng phần position còn lại sau 12h; dùng toàn bộ quantity hiện tại, không đổi entry,
  margin, leverage, size ban đầu hay SL/profit-lock. Mục tiêu là gross ROE nên phí/slippage thực tế có thể làm NET thấp hơn 1%.
- Tương thích JSON cũ: chỉ thêm field audit optional; không migration/rewrite/backfill. Tracking cũ có `openedAt` tiếp tục dùng trực tiếp,
  record thiếu field mới vẫn hoạt động; có thể tắt bằng `BINANCE_TP_AFTER_12H_ENABLED=false`.
## 2026-08-12 — Liquid Flow V2 primary panic flush/reclaim V10

- Version classifier: `LIQUID_HEATMAP_FLOW_V2_PRIMARY_PANIC_RECLAIM_V10_20260812`; paper:
  `LIQUID_FLOW_V2_PAPER_V17_PRIMARY_PANIC_RECLAIM_20260812`; Discord:
  `LIQUID_FLOW_V2_PANIC_DISCORD_V2_PRIMARY_RECLAIM_20260812`.
- Dữ liệu causal dùng trước entry: universe/rank top mover và change/quote-volume 24h; nến 5m hiện tại + nến đã đóng để tính
  EMA99, khoảng cách low/close tới EMA99, pullback từ đỉnh gần nhất, rebound khỏi low, lower reclaim, volume ratio và taker
  delta; trend EMA 1h/4h đã đóng. Không dùng kết quả tương lai hay nối trade sau entry để phân loại.
- `PRIMARY_EMA99_PANIC_FLUSH_ACTIVE` là pha WAIT cho top tăng rank 1-20: 24h `>=8%`, pullback `3-20%`, low 5m cách
  EMA99 trong `[-3%, +1.5%]` (hoặc mark đã đi vào chính vùng này khi live candle chưa đồng bộ), mark cách EMA99 trong
  `[-3%, +3%]`, volume `>=1.2x`, ít nhất một khung 1h/4h còn bullish. Cú flush được khởi tạo khi taker delta `<=-25%`,
  hoặc pullback đã `>=8%` cùng volume `>=1.5x`; pha ACTIVE được giữ theo điều kiện cấu trúc cho tới khi đủ reclaim.
  Dòng bán mạnh ở đây là bằng chứng cú flush, không phải điều kiện LONG.
- `PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY` chỉ được gắn sau khi cùng bối cảnh trên có rebound khỏi low `>=0.3%`,
  mark reclaim trên EMA99 `0.1-3%`, nến có lower reclaim và taker delta hiện tại hồi lên `>=-25%`. Đây là READY cho
  paper tức thời tại mark; Discord chỉ gửi khi chuyển mới sang READY, không gửi ở pha ACTIVE.
- Thống kê/whitelist: hai card dùng key exact `heatmap-v2:PRIMARY_EMA99_PANIC_FLUSH_ACTIVE` và
  `heatmap-v2:PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY`; mặc định tắt, matcher UI/runtime trùng key. Checkbox chỉ hiện
  khi CLOSED paper cùng nhãn có `AvgROE > 4%`; ACTIVE không tạo paper nên mặc định vẫn khóa.
- Ảnh hưởng giao dịch hiện tại: `PRIMARY_EMA99_PANIC_FLUSH_ACTIVE` vẫn `OBSERVE ONLY`; exact
  `PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY` tạo paper, gửi Discord và được selective auto profile cấp Binance MARKET
  `$2 x 5` theo V1 ở đầu tài liệu. Rule detect/entry/SL/TP không đổi. JSON cũ tương thích; paper JSON cũ được nạp bằng
  policy runtime mới nhưng trade OPEN lịch sử không được replay submit và không cần migrate.
## 2026-08-12 - Profit-lock Binance V12 theo lifecycle, retry nhanh và fail-safe

- Version: `BINANCE_PROFIT_LOCK_V12_LIFECYCLE_FAST_FAILSAFE_20260812`. Dữ liệu dùng trước quyết định chỉ gồm vị thế
  Binance đang mở từ user-data/Mark Price socket, side, entry trung bình, leverage, `openedAt`, trạng thái `Exclude` của Orders,
  tracking TP/SL hiện tại và open order Binance tại thời điểm xử lý. Không dùng outcome, nến tương lai hay paper sau entry.
- Phân loại/rule giữ nguyên: lệnh tay và Liquid Flow V2 đạt gross ROE `>=10%` thì khóa `+1%`; nếu không `Exclude`, ladder
  tiếp tục `15% -> +5%`, `20% -> +10%`, rồi mỗi `+5%` ROE nâng khóa thêm `+5%`. Symbol đã `Exclude` chỉ giữ cap `+1%`.
  Dedup nay dùng khóa `symbol + side + entry + openedAt`, reset ngay khi socket báo full fill hoặc position close, nên vị thế
  mới/DCA không kế thừa trạng thái đã khóa của lifecycle cũ cùng symbol.
- Khi threshold vừa đạt, bot ghi `profitLockArmed*` trước lúc gọi Binance. Nếu Binance trả `-2021 / Order would immediately
  trigger`, bot đọc lại Position Risk + Mark Price ưu tiên cao: nếu Mark chưa xuyên target thì thử lại sau `5s`; nếu Mark đã
  xuyên target thì gửi MARKET reduce-only đóng đúng side/quantity còn mở. Đây là fail-safe vì Binance không cho đặt STOP ở
  phía đã bị giá vượt qua; chờ tiếp có thể biến lệnh từng lời thành SL sâu.
- Thống kê/nhãn/whitelist: không thêm nhãn, card, tier, cohort hay checkbox; WR/PF/AvgROE/NET không đổi. Log mới gồm
  `ProfitLock ARMED`, lifecycle discard/reset và `SlTrailEmergency` để audit từng vòng lệnh.
- Ảnh hưởng Binance/entry/size/SL/TP: có sửa quản lý SL/exit Binance thật. Không đổi entry, margin, leverage, size ban đầu hay TP.
  Fail-safe chỉ đóng reduce-only khi target đã được arm và giá Binance mới nhất xác nhận đã xuyên target. Scanner dựng lại SL
  bị thiếu vẫn tắt; đường chạy chính vẫn là socket event-driven.
- Tương thích JSON cũ: chỉ thêm optional `profitLockLifecycleKey`, `profitLockArmedRoe`, `profitLockArmedAt`,
  `profitLockArmedLifecycleKey`, `profitLockArmedObservedRoe`, `profitLockArmedMarkPrice`. Record cũ thiếu field vẫn chạy;
  lifecycle key được tính runtime, không migrate/rewrite/backfill store cũ.
- Nguồn Mark socket nâng lên `POSITION_MONITOR_PER_SYMBOL_MARK_STREAM_V4_20260812`: mở combined stream URL chứa chính xác
  các symbol vị thế đang mở và rebuild khi tập vị thế đổi, thay cho `/market/ws` rồi gửi dynamic `SUBSCRIBE`. Watchdog stale
  `15s` vẫn giữ. Đây là dữ liệu sau entry phục vụ ROE/protection; không đổi nhãn/thống kê/entry/size/TP hay JSON.

## 2026-08-12 - Protection V3 chịu được WSL restart và khóa ghi tracking

- Versions: `POSITION_PROTECTION_SOCKET_FILL_V3_DURABLE_WATERMARK_20260812`,
  `POSITION_PROTECTION_FILL_WATERMARK_V1_20260812`; supervisor dùng unit
  `ops/systemd/btc-liquidity-pm2.service`. Dữ liệu dùng tại fill/recovery chỉ gồm full-fill Binance đã `FILLED`, order detail
  chính chủ, vị thế Binance còn mở cùng chiều, average entry/leverage hiện tại và open TP/SL đúng `symbol + closeSide +
  positionSide`. Đây là dữ liệu sau entry phục vụ protection; không dùng candle tương lai, outcome hoặc thống kê paper.
- Điều kiện: socket full-fill chỉ được ghi watermark sau khi callback đặt protection xong và re-read Binance xác nhận đủ những
  chân TP/SL mà plan yêu cầu. Khi process khởi động lại, một lần duy nhất đọc user trades mới hơn watermark, verify order
  `FILLED`, `reduceOnly=false`, cùng chiều vị thế rồi replay đúng fill gần nhất cho mỗi symbol. Replay dựng plan manual từ average
  entry hiện tại: TP gross `+30% ROE`, SL `-25% ROE`; không bật scanner quét thiếu SL/TP định kỳ và không khôi phục SL đã bị
  người dùng chủ động xóa ở lifecycle cũ.
- Watermark là một mốc chung cho tài khoản nên chỉ được tiến qua các trade close/reduce-only sau khi **toàn bộ** symbol đang mở
  đã quét thành công; bất kỳ symbol nào lỗi REST/protection thì giữ nguyên mốc để lần restart sau còn retry. Callback socket bắt
  lỗi tại biên WebSocket, không đánh dấu delivered khi verify thiếu chân và không làm rơi user-data listener. Order ID recovered
  cũng chỉ persist theo batch sau khi toàn bộ vòng quét thành công, tránh trạng thái nửa batch đã ghi nhưng symbol sau bị lỗi.
  Dedupe RAM chỉ commit sau khi atomic write watermark thành công; lỗi ghi đĩa được ném ngược để socket/restart còn retry.
- `sl-tracking.json` nay serialize mọi lần ghi qua một promise lock và snapshot immutable trước write, loại race nhiều callback
  cùng dùng file `.tmp` dẫn tới `ENOENT rename`. Tracking lifecycle mới luôn thay record cùng symbol nếu `entry/orderId` đổi,
  lưu thêm `entryOrderId`, `entryClientOrderId` và protection version để không kế thừa `slPlaced` của vòng lệnh cũ.
- Cách thống kê/nhãn/whitelist: không thêm nhãn, card, tier, cohort hoặc checkbox; WR/PF/AvgROE/NET và matcher whitelist không
  đổi. Watermark chỉ là state vận hành, không tham gia chọn tín hiệu hay thống kê.
- Ảnh hưởng Binance/entry/size/SL/TP: không đổi entry, size, margin hoặc leverage. Có thể đặt bù đúng một lần TP/SL cho full-fill
  xảy ra khi WSL/process không chạy; idempotent re-read giữ order hiện hữu và không cancel/replace. Systemd user service tự
  `pm2 resurrect` sau WSL boot và restart PM2 daemon khi lỗi, tránh khoảng trống không có socket.
- Tương thích JSON cũ: `sl-tracking.json` cũ thiếu các field mới vẫn đọc; watermark thiếu được khởi tạo tại thời điểm deploy để
  không backfill vị thế lịch sử. File watermark mới độc lập, không migrate/rewrite paper/lifecycle cũ.

## 2026-08-12 - Supervisor V2 cấp system và phân biệt position cũ/mới

- Version vận hành: `BINANCE_PROTECTION_SYSTEM_SUPERVISOR_V2_20260812`; dữ liệu trước quyết định recovery gồm system boot,
  durable full-fill watermark, exact Binance order/trade, vị thế còn mở và open protection order. Không dùng candle tương lai,
  outcome hoặc thống kê paper.
- Phân loại: full-fill mới hơn watermark và còn cùng chiều là lifecycle mới, được đặt/verify TP+SL theo plan; vị thế đã tồn tại
  trước watermark/khởi động là lifecycle cũ, startup **chỉ bù TP khi thiếu và tuyệt đối không dựng SL**. Không có periodic
  missing-SL scanner; SL cũ người dùng đã xóa vẫn giữ nguyên.
- PM2 chuyển từ user service phụ thuộc login bus sang system service có `User=thangnguyen`, `PM2_HOME` cố định và
  `WantedBy=multi-user.target`, vì WSL boot không bảo đảm `systemctl --user` tồn tại. Service tự `pm2 resurrect` từ dump sau mọi
  lần distro khởi động và systemd restart PM2 daemon khi tiến trình supervisor lỗi.
- Thống kê/nhãn/whitelist: không thêm label, card, tier, cohort hay checkbox; WR/PF/AvgROE/NET không đổi. Có ảnh hưởng vận hành
  Binance protection sau fill và startup TP-only; không đổi signal, entry, size, margin, leverage hoặc policy giá TP/SL.
- JSON cũ tương thích: không migrate/rewrite paper/lifecycle. Watermark/state tracking giữ schema V1 và optional fields cũ;
  vị thế legacy không bị backfill SL.
## 2026-08-12 - TP-only Guard V2 cho toàn bộ vị thế cũ

- Version: `BINANCE_TP_ONLY_GUARD_V2_20260812`. Dữ liệu dùng trước mỗi quyết định chỉ gồm vị thế Binance đang mở,
  regular/algo open orders hiện tại, symbol filters, tracking/signal TP đã lưu và source/lifecycle còn khớp symbol + side + entry.
  Không dùng future candle, outcome hay thống kê paper.
- Phân loại: mọi vị thế đang mở thiếu TP được kiểm tra lại sau startup và định kỳ mỗi `60s`. Guard re-read riêng symbol ngay trước
  khi ghi; nếu đã có bất kỳ TP close-side đúng positionSide thì giữ nguyên. Khi thật sự thiếu, guard chỉ dựng lại TP causal đã lưu;
  lệnh manual fallback dùng `+30% ROE`. Liquid Flow V2 thiếu target gốc vẫn fail closed, không tự bịa target.
- Thống kê/nhãn/whitelist: không thêm nhãn/card/tier/cohort/checkbox và không đổi WR/PF/AvgROE/NET hay matcher whitelist.
- Ảnh hưởng Binance/entry/size/SL/TP: chỉ có thể thêm một TP thiếu bằng `TAKE_PROFIT_MARKET closePosition=true`; không cancel,
  replace hoặc đổi TP đang có, không bao giờ đặt/xóa/sửa SL. Không đổi entry, size, margin, leverage hay signal gate.
- Tương thích JSON cũ: không thêm field bắt buộc và không migrate/rewrite store. Tracking cũ thiếu target tiếp tục dùng fallback đúng
  source; Liquid Flow V2 không đủ snapshot vẫn bỏ qua an toàn.

## 2026-08-12 - Protection close-position V1 không mất SL sau DCA

- Version: `BINANCE_CLOSE_POSITION_PROTECTION_V1_20260812`. Dữ liệu dùng trước placement chỉ gồm exact full-fill socket/replay,
  position Binance còn mở, side/positionSide, entry/leverage, plan TP/SL causal và open protection orders re-read ngay trước ghi;
  không dùng outcome, future candle hay thống kê paper.
- Phân loại: lifecycle mới do full-fill sẽ đặt `TAKE_PROFIT_MARKET`/`STOP_MARKET` với `closePosition=true`, bỏ payload
  `quantity + reduceOnly`. Binance vì thế tự bao phủ toàn bộ size hiện tại kể cả khi DCA đổi quantity. Profit-lock khi tạo SL
  thay thế và one-shot fill fallback cũng dùng cùng payload; vẫn place-new-first rồi mới cancel SL cũ.
- Vị thế cũ không được backfill SL: `BINANCE_TP_ONLY_GUARD_V2_20260812` vẫn chỉ giữ TP thiếu và không đặt/xóa/sửa SL.
  `ALGO_UPDATE` được log đầy đủ payload để audit nếu Binance/client khác hủy order.
- Thống kê/nhãn/whitelist: không thêm label/card/tier/cohort/checkbox; matcher và WR/PF/AvgROE/NET không đổi.
- Ảnh hưởng Binance/entry/size/SL/TP: có đổi hình thức order protection của **fill mới** sang close-toàn-position;
  không đổi giá TP/SL, entry, margin, leverage hay size entry. DCA không còn làm protection stale do quantity cũ.
- Tương thích JSON cũ: không thêm field bắt buộc, không migrate/rewrite store; regular/algo order cũ vẫn được matcher đọc như cũ.

## 2026-08-12 - Xác nhận position close trước khi cleanup TP/SL

- Version: `BINANCE_POSITION_CLOSE_CONFIRM_V1_20260812`. Dữ liệu quyết định cleanup chỉ gồm event `ACCOUNT_UPDATE pa=0` hoặc snapshot
  omission, sau đó là Position Risk Binance ưu tiên cao được đọc lại; không dùng paper, outcome hay future candle.
- Chỉ khi Position Risk xác nhận symbol thật sự không còn position bot mới xóa tracking và hủy TP/SL. Event close cũ/out-of-order hoặc
  snapshot cache thiếu tạm thời trong lúc mở lại/DCA bị bỏ qua, position monitor được seed lại từ record Binance đang active.
- Mọi hàm cleanup protection tự kiểm tra position còn mở và fail closed; lệnh close tay của trang Orders không còn cleanup ngay theo ACK,
  mà chờ chính socket-close đã được xác nhận. Điều này loại race từng hủy TP/SL mới 3-4 giây sau full-fill.
- Không thêm nhãn/card/stat/whitelist, không đổi entry/size/margin/leverage/giá TP-SL. Chỉ ảnh hưởng thời điểm được phép hủy protection;
  TP-only guard lệnh cũ và policy không backfill SL giữ nguyên. Không đổi schema JSON và không cần migration.
## 2026-08-13 - Liquid Flow V2 HTF vào Binance MARKET margin 5 USDT

- Version paper: `LIQUID_FLOW_V2_PAPER_V18_HTF_BINANCE_5USDT_20260813`; entry policy:
  `LIVE_CARD_AND_LIQ_FLOW_READY_V7_HTF5_20260813`. Dữ liệu trước entry giữ nguyên classifier causal hiện hữu:
  nến đã đóng 5m/15m, EMA99 cùng khung, volume/taker flow, trend 1h/4h và liquidation context; không dùng nến tương lai hay outcome.
- Điều kiện phân loại không đổi: chỉ `HTF_BEAR_15M_EMA99_PUMP_REJECT` (SHORT) hoặc
  `HTF_BULL_15M_EMA99_DUMP_RECLAIM` (LONG) ở phase `READY`, khi Paper Manager vừa tạo trade `OPEN`, mới được claim một lần.
  Nhãn ACTIVE/WARMUP và các nhãn HTF khác không cấp lệnh thật.
- Thống kê tiếp tục dùng đúng hai label key/cùng trade paper hiện hữu; card và checkbox `WHITELIST` cũ giữ nguyên policy mặc định tắt,
  chỉ hiện khi closed AvgROE > 4%. Bật Binance trực tiếp theo policy HTF này không đổi cách tính WR/PF/AvgROE/NET.
- Ảnh hưởng Binance/entry/size/SL/TP: bật MARKET cho hai nhãn trên với margin mặc định `$5`, leverage mặc định `5x`
  (notional yêu cầu `$25`). Có thể tắt/đổi bằng `LIQ_FLOW_V2_HTF_BINANCE_ENABLED`,
  `LIQ_FLOW_V2_HTF_BINANCE_MARGIN_USDT`, `LIQ_FLOW_V2_HTF_BINANCE_LEVERAGE`. Trước entry vẫn chặn nếu đã có position cùng symbol,
  dùng claim/clientOrderId chống trùng và `LIQ_FLOW_V2_BINANCE_MAX_POSITIONS`; TP/SL giữ target paper và được neo theo exact fill hiện hành.
- Tương thích JSON cũ: chỉ thêm settings có default runtime, không thêm field bắt buộc, không migrate/rewrite trade cũ. Event paper cũ đã OPEN
  không được replay tự động khi restart; chỉ transition READY mới sau triển khai mới có thể phát lệnh.

## 2026-08-13 - PRE EMA99 siết entry theo backtest

- Version classifier: `LIQUID_HEATMAP_FLOW_V2_PRE_ENTRY_CAP_V11_20260813`; paper:
  `LIQUID_FLOW_V2_PAPER_V19_PRE_ENTRY_CAP_20260813`; entry policy:
  `LIVE_CARD_AND_LIQ_FLOW_READY_V8_PRE_ENTRY_CAP_20260813`.
- Dữ liệu causal trước entry không đổi: 180-220 nến 5m đã đóng để tính EMA13/25/99, dốc EMA99, high/low 12 nến,
  volumeX và taker delta; OHLC nến 5m live và mark tại đúng tick hiện tại; change 24h/1h và mover side/rank hiện hành.
  Không dùng nến tương lai, outcome hay dữ liệu sau entry.
- Điều kiện mới: `PRE_UP_BASE_LONG` vẫn cần râu 5m chạm EMA99, EMA stack/dốc/pullback/volume/taker guard cũ,
  nhưng mark chỉ được nằm `+0.1%..+0.5%` trên EMA99 và phải bật ít nhất `0.6%` từ low tiếp cận.
  `PRE_DOWN_BASE_SHORT` giữ reject/EMA stack/dốc/bounce/volume/taker guard cũ nhưng mark chỉ được nằm
  `-0.5%..-0.1%` dưới EMA99. Biên touch của râu vẫn giữ LONG `-0.5%..+1.2%`, SHORT `-1.2%..+0.5%`.
- Cơ sở thống kê: 62 paper CLOSED từ 2026-08-10 12:10 đến 2026-08-13 12:02 Bangkok được đối chiếu Binance Futures 1m.
  Cohort cũ LONG 20 lệnh có WR 40%, AvgROE -6.92%, PF 0.29; SHORT 42 lệnh có WR 57.1%, AvgROE -1.54%, PF 0.72.
  Lọc causal `|mark-EMA99| <= 0.5%` cho SHORT còn 12 mẫu, WR 66.7%, AvgROE +1.92%, PF 1.71; LONG cùng cap còn 6 mẫu,
  AvgROE -0.09%, nên thêm rebound tối thiểu 0.6% và tiếp tục thu thập. Đây là walk-forward filter cho tín hiệu mới, không ghi lại outcome cũ.
- Thống kê/whitelist giữ đúng hai card/key `heatmap-v2:PRE_UP_BASE_LONG` và `heatmap-v2:PRE_DOWN_BASE_SHORT`.
  Checkbox `WHITELIST` cũ vẫn mặc định tắt, matcher runtime không đổi và chỉ hiện khi closed AvgROE `> 4%`; không thêm card hay key mới.
- Ảnh hưởng Binance/entry/size/SL/TP: có giảm số transition PRE được phép tạo paper và gửi MARKET Binance thật.
  Tín hiệu vượt cap không READY nên không entry. Tín hiệu pass vẫn MARKET `$5 × 5x`; không đổi entry mode, margin, leverage,
  công thức TP/SL, fill-anchor hay cơ chế chống duplicate.
- Tương thích JSON cũ: không thêm field bắt buộc và không migrate/rewrite lịch sử. Trade V1-V18 vẫn đọc/thống kê theo label key cũ;
  trade mới mang paper V19 và classifier version mới trong snapshot để audit. Baseline/restart/cooldown hiện hành tiếp tục chặn replay.

## 2026-08-13 - Khóa toàn bộ Binance Liquid Flow V2 ở 5x

- Version policy: `LIVE_CARD_AND_LIQ_FLOW_READY_V9_LFV2_FIXED_5X_20260813`; paper:
  `LIQUID_FLOW_V2_PAPER_V20_FIXED_5X_20260813`; manual UI/API:
  `LIQUID_FLOW_V2_MANUAL_BINANCE_UI_V5_FIXED_5X_20260813`. Hằng số server duy nhất là
  `LIQUID_FLOW_V2_BINANCE_LEVERAGE = 5`.
- Dữ liệu trước entry và điều kiện phân loại không đổi: classifier vẫn dùng snapshot causal của từng label trước entry; không thêm gate,
  không dùng outcome/future candle. Các label/card/tier, cách tính paper W/L, WR, PF, NET và AvgROE giữ nguyên.
- Phạm vi: mọi order Binance tự động từ Liquid Flow V2 (BASE, PRE EMA99, HTF EMA99) và mọi MARKET/LIMIT thủ công từ
  `/liquid-flow-v2` đều bị server ép `5x`. Giá trị leverage do client gửi, settings JSON cũ hoặc các env
  `LIQ_FLOW_V2_*_LEVERAGE` không thể nâng/hạ leverage của lệnh V2 mới. UI vẫn hiển thị ô LEV nhưng khóa read-only ở 5.
- Ảnh hưởng Binance/entry/size/SL/TP: có thay đổi leverage và notional của lệnh mới thành `margin × 5`; margin theo từng cohort và margin
  người dùng nhập trên UI không đổi. MARKET/LIMIT, signal entry, TP/SL theo plan, fill-anchor, DCA cùng chiều, duplicate guard và max-position
  giữ nguyên. Không chạy scan đổi hồi tố position đang mở; nếu người dùng gửi DCA V2 mới thì symbol được set 5x trước order mới.
- Thống kê/whitelist: không thêm label/card/key. Checkbox `WHITELIST` hiện hữu vẫn mặc định tắt, matcher cũ và policy chỉ hiện khi closed
  AvgROE `> 4%`; leverage lock không cấp thêm quyền Binance.
- Tương thích JSON cũ: field leverage cũ vẫn đọc được nhưng runtime settings V2 được normalize về 5. Trade lịch sử giữ nguyên leverage,
  PnL/outcome và không bị tính lại hoặc rewrite; trade mới mang paper V20/manual V5 để audit.

## 2026-08-13 - EMA FAN LONG READY cho Liquid Flow V2

- Version classifier: `LIQUID_HEATMAP_FLOW_V2_EMA_FAN_V12_20260813`; paper:
  `LIQUID_FLOW_V2_PAPER_V21_EMA_FAN_20260813`; entry policy:
  `LIVE_CARD_AND_LIQ_FLOW_READY_V10_EMA_FAN_20260813`.
- Dữ liệu dùng trước entry: chỉ top tăng Binance Futures hạng 1-50 có quote volume 24h tối thiểu `$2M` theo snapshot hiện tại và tối đa 220 nến 5m đã đóng.
  EMA13/25/99, RSI14, OHLC, quote volume, high 12 nến và volume nền 20 nến đều được tính tại hoặc trước nến tín hiệu;
  không đọc nến 5m đang chạy, OI/liquidation tương lai, outcome hay giá sau entry. Hạng 21-50 chỉ được giữ trong deep scan khi pha
  WATCH đang hoạt động, còn hạng 1-20 tiếp tục nằm trong universe chính.
- Phân loại `EMA_FAN_LONG_READY`: trong 12 nến trước breakout, median độ rộng ba EMA không quá `1%` và ít nhất `8/12` nến có
  độ rộng không quá `1.5%`; tại nến WATCH độ rộng không quá `0.8%`, close vượt cả band EMA và high 12 nến, thân tăng ít nhất
  `0.4%`, volume ít nhất `2.5x`, EMA13/25 cùng dốc lên, RSI14 `50..78`, close cách EMA13 không quá `3%`. Trong tối đa 4 nến đã
  đóng tiếp theo phải có `EMA13 > EMA25 > EMA99`, hai gap EMA cùng nới rộng, RSI14 không quá `85` và close cách EMA13 không quá
  `4%`. Nhãn được gắn dạng secondary label để không che hoặc đổi nhãn Liquid V2 chính.
- Thống kê ban đầu: replay cohort top 50 tăng của ngày 2026-08-13 với entry open nến 5m kế tiếp, 5x, TP `+10% ROE`, SL
  `-25% ROE`, timeout 12h cho kết quả 24 READY: 19 TP, 0 SL, 1 TIME và 4 còn OPEN. Đây là cohort chọn theo top tăng sau khi ngày
  đã diễn ra nên có survivor/winner bias; chỉ dùng để đặt cấu hình paper walk-forward, không coi là xác suất live đã xác nhận.
- Card/whitelist: thêm đúng key `heatmap-v2:EMA_FAN_LONG_READY`; matcher runtime/UI dùng cùng key, mặc định tắt. Checkbox chỉ hiện
  khi paper CLOSED của riêng nhãn có `AvgROE > 4%`; OPEN/PENDING không tham gia AvgROE. Card hiển thị active/transition, số paper
  closed và AvgROE riêng, không trộn với nhãn primary đang che phía trước.
- Ảnh hưởng Binance/entry/size/SL/TP: transition READY mới tạo paper margin `$10`, leverage `5x`, MARKET theo mark lúc scan,
  TP cố định `+10% ROE`, SL `-25% ROE`, tối đa 12h. Cùng transition được claim một lần để đặt Binance MARKET margin `$1`, `5x`
  (notional yêu cầu `$5`), chặn position cùng symbol, dùng clientOrderId/dedupe/max-position và neo TP/SL theo exact fill. Có thể tắt
  bằng `LIQ_FLOW_V2_EMA_FAN_BINANCE_ENABLED=false`; margin paper/real và TP/SL/timeout có env riêng. Tín hiệu đã tồn tại trước restart
  không bị replay; first observation chỉ được phát nếu nến READY đóng sau session start và còn mới trong 15 phút.
- Tương thích JSON cũ: chỉ thêm label, snapshot `emaFanLong5m` và settings optional có default runtime. Store/trade cũ không migrate,
  không rewrite và không tính lại outcome. Signal key gồm symbol + exact label + closeTime nến READY nên restart/reconnect vẫn idempotent.

## 2026-08-13 - EMA FAN SHORT READY paper-only cho Liquid Flow V2

- Version classifier: `LIQUID_HEATMAP_FLOW_V2_EMA_FAN_SHORT_PAPER_V13_20260813`; paper:
  `LIQUID_FLOW_V2_PAPER_V22_EMA_FAN_SHORT_20260813`. Entry policy Binance vẫn giữ
  `LIVE_CARD_AND_LIQ_FLOW_READY_V10_EMA_FAN_20260813` vì nhãn SHORT mới không được cấp quyền đặt lệnh thật.
- Dữ liệu dùng trước entry: snapshot Binance Futures hiện tại được xếp theo quote volume 24h, chỉ lấy top 150 có quote volume tối thiểu `$2M`, rồi mới
  lọc `change24hPct <= -5%`. Detector chỉ đọc tối đa 220 nến 5m đã đóng để tính EMA13/25/99, RSI14, OHLC, low 12 nến và volume nền 20 nến;
  không dùng nến 5m đang chạy, future candle, outcome hay dữ liệu sau entry.
- Điều kiện phân loại `EMA_FAN_SHORT_READY`: 12 nến trước breakdown có median độ rộng ba EMA `<=1%` và ít nhất `8/12` nến có độ rộng
  `<=1.5%`; tại nến WATCH độ rộng `<=0.8%`, close dưới toàn band EMA và low 12 nến, thân giảm `>=0.4%`, volume `>=2.5x`, EMA13/25
  đều dốc xuống so với 3 nến trước, RSI14 `22..50`, khoảng cách dưới EMA13 `<=2.5%`. Trong tối đa 4 nến đóng phải có
  `EMA13 < EMA25 < EMA99`, cả hai gap cùng nới rộng, RSI14 `>=15` và giá cách EMA13 `<=4%`. Nhãn là secondary label để không che primary label.
- Thống kê tham chiếu causal trong ngày 2026-08-13, entry open nến 5m kế tiếp, 5x, TP `+10% ROE`, SL `-25% ROE`, timeout 12h:
  toàn bộ reverse-fan top 150 có 60 tín hiệu với settled WR 66%, AvgROE `+0.25%`, PF `1.05`; cohort `change24h <= -5%` còn 11 tín hiệu,
  8 TP, 1 SL, 2 OPEN, settled WR `88.9%`, AvgROE `+6.11%`, PF `3.20`. Vì mẫu còn nhỏ và universe theo snapshot trong ngày, rule chỉ chạy paper walk-forward.
- Card/whitelist: thêm exact key `heatmap-v2:EMA_FAN_SHORT_READY`; UI và runtime matcher dùng cùng key, mặc định tắt. Checkbox chỉ hiện khi riêng nhãn
  có paper CLOSED `AvgROE > 4%`; OPEN/PENDING không tham gia AvgROE. Bật checkbox chỉ lưu whitelist thống kê, không thay đổi quyền Binance.
- Ảnh hưởng Binance/entry/size/SL/TP: transition READY mới tạo paper MARKET theo mark lúc scan với margin `$10`, leverage `5x`, TP `+10% ROE`,
  SL `-25% ROE`, timeout 12h. Không thêm nhãn này vào `LIQUID_FLOW_V2_AUTO_REAL_LABELS`; auto profile trả `eligible=false`, claim Binance bị từ chối,
  nên không ảnh hưởng entry/size/SL/TP Binance thật. First observation chỉ seed khi nến READY đóng sau session start và còn mới tối đa 15 phút.
- Tương thích JSON cũ: chỉ thêm label và snapshot optional `emaFanShort5m`; không thêm field bắt buộc, không migrate/rewrite store/trade cũ và không tính lại
  outcome lịch sử. Signal key vẫn là symbol + exact label + closeTime nến READY, nên restart/reconnect không tạo trùng.

## 2026-08-13 - Discord riêng cho EMA FAN LONG/SHORT

- Version: `LIQUID_FLOW_V2_EMA_FAN_DISCORD_V1_20260813`. Dữ liệu trước entry, điều kiện phân loại và version classifier/paper giữ nguyên;
  notifier chỉ đọc transition READY vừa được classifier tạo cùng snapshot causal `emaFanLong5m` hoặc `emaFanShort5m`.
- Phạm vi: gửi riêng hai exact label `EMA_FAN_LONG_READY` và `EMA_FAN_SHORT_READY` qua `LIQ_FLOW_V2_EMA_FAN_WEBHOOK_URL`.
  Payload gồm symbol/side, rank universe, 24h/1h, mark, EMA13/25/99, gap, compression, volume, RSI, khoảng cách EMA13 và paper plan.
- Dedupe dùng `symbol + exact label + ready candle closeTime`, giữ trong bộ nhớ mặc định 24h; chỉ gửi khi `readyLabelKeys` xác nhận transition mới.
  Nhãn EMA FAN là secondary label vẫn được gửi đúng, không phụ thuộc primary label và không replay tín hiệu cũ khi restart.
- Thống kê/whitelist không đổi: hai card giữ key `heatmap-v2:EMA_FAN_LONG_READY` và `heatmap-v2:EMA_FAN_SHORT_READY`, checkbox mặc định tắt và
  chỉ hiện khi CLOSED AvgROE riêng nhãn `>4%`. Discord không phải gate và không cấp whitelist/order.
- Ảnh hưởng Binance/entry/size/SL/TP: không đổi. LONG giữ policy Binance hiện hành; SHORT vẫn paper-only và auto profile `eligible=false`.
  Webhook chỉ thông báo, không tạo paper bổ sung, không đặt/hủy/sửa entry, size, TP hoặc SL.
- Tương thích JSON cũ: không đổi schema/store, không migrate/rewrite trade; cấu hình webhook chỉ nằm trong env local, `.env.example` để trống secret.

## 2026-08-14 - Tách EMA FAN LONG theo MARKET và paper LIMIT-fill

- Version đang chạy: classifier `LIQUID_HEATMAP_FLOW_V2_EMA_FAN_ENTRY_ROUTING_V14_20260814`, paper
  `LIQUID_FLOW_V2_PAPER_V23_EMA_FAN_ENTRY_ROUTING_20260814`, Binance policy
  `LIVE_CARD_AND_LIQ_FLOW_READY_V11_EMA_FAN_ROUTING_20260814`, Discord
  `LIQUID_FLOW_V2_EMA_FAN_DISCORD_V2_ENTRY_ROUTING_20260814`.
- Dữ liệu trước entry: chỉ dùng snapshot mover/liquidity rank, change/quote-volume hiện tại và tối đa 220 nến 5m đã đóng để tính
  EMA13/25/99, compression 12 nến, body, volume nền, RSI và khoảng cách EMA13. Không dùng nến tương lai, outcome hay giá sau entry.
- Phân loại giữ toàn bộ điều kiện EMA FAN WATCH/READY hiện hành. Nhãn mới `EMA_FAN_LONG_IMPULSE_RUNNER` cần thêm:
  gainer rank `1..100`, volume `>=5x`, thân nến `>=1%` và close READY cách EMA13 `<=3%`.
  `EMA_FAN_LONG_READY` thường chỉ còn rank `1..50` và không thuộc impulse. Deep scan được mở đến rank 100 cho EMA FAN;
  tier panic cũ vẫn chỉ rank `21..60`, còn rank `61..100` dùng tier riêng `EMA_FAN_LONG_EXTENDED_61_100`.
- Thống kê/whitelist: thêm exact key `heatmap-v2:EMA_FAN_LONG_IMPULSE_RUNNER`; UI và runtime matcher dùng cùng key,
  mặc định tắt. Checkbox chỉ hiện khi riêng nhãn có paper CLOSED `AvgROE > 4%`; OPEN/PENDING không được tính vào AvgROE.
  Nhãn thường giữ key `heatmap-v2:EMA_FAN_LONG_READY` và thống kê cohort riêng, không gộp với impulse.
- Ảnh hưởng Binance/entry/size: impulse tạo paper MARKET `$10 × 5x` và đặt Binance MARKET margin `$5 × 5x` ngay ở transition READY.
  Nhãn thường tạo paper `PENDING_ENTRY` tại `EMA13 tín hiệu × 1.01`, hết hạn sau 15 phút; trước khi paper fill tuyệt đối không claim/order Binance.
  Khi mark chạm limit, paper chuyển OPEN rồi mới đặt Binance MARKET margin `$1 × 5x`. Hết hạn/invalidated thì không có lệnh thật.
  Cả hai luồng vẫn qua existing-position guard, one-shot claim, clientOrderId/dedupe và max-position policy.
- SL/TP không đổi trong lượt này: paper và protection Binance tiếp tục TP `+10% ROE`, SL `-25% ROE`, max hold 12h,
  neo protection theo exact Binance fill. `EMA_FAN_SHORT_READY` vẫn paper MARKET `$10 × 5x`, `eligible=false`, không đặt Binance.
- Tương thích JSON cũ: các settings limit/timeout/impulse-margin và snapshot đều optional, có runtime default. Store/trade cũ không migrate,
  rewrite hoặc tính lại outcome; trade `EMA_FAN_LONG_READY` cũ giữ entry lịch sử. Signal key vẫn là symbol + exact label + closeTime READY,
  nên nhãn mới tách dedupe rõ ràng và restart/reconnect không replay tín hiệu cũ.

## 2026-08-14 - DCA giữ nguyên protection của vị thế gốc

- Version: `BINANCE_DCA_KEEP_EXISTING_TP_SL_V1_20260814`; manual Liquid Flow V2
  `LIQUID_FLOW_V2_MANUAL_BINANCE_UI_V6_DCA_KEEP_PROTECTION_20260814`.
- Dữ liệu dùng trước/sau fill chỉ gồm snapshot position Binance ngay trước submit và event full-fill từ user-data socket:
  symbol, side/positionSide, `positionAmt`, `filledQty` và `cumulativeFilledQty`. Không dùng candle tương lai, outcome hay dữ liệu sau exit.
- Phân loại DCA cùng chiều ở preflight khi symbol đã có position đúng hướng order. Lớp socket xác nhận lại là DCA khi hướng fill trùng
  hướng position sau fill và `abs(positionAmount) > cumulativeFilledQty` (có tolerance cho precision). Position mới có amount bằng qty order
  không bị phân loại DCA; position ngược chiều trên nút Liquid Flow V2 vẫn bị chặn như cũ.
- Ảnh hưởng TP/SL: DCA vẫn submit entry MARKET/LIMIT, margin/leverage/quantity không đổi, nhưng không tạo hoặc ghi đè protection plan,
  không đặt TP/SL mới, không chạy fallback TP/SL và không reset profit-lock. TP/SL đang tồn tại của toàn vị thế được giữ nguyên.
  Nếu người dùng đã chủ động xóa protection trước DCA thì rule không tự dựng lại. Position mới hoàn toàn vẫn đặt TP/SL lần đầu theo plan hiện hành.
- Thống kê/whitelist: không thêm hoặc đổi signal, label, tier, card, matcher hay key. Checkbox hiện hữu vẫn mặc định tắt và chỉ hiện khi
  paper CLOSED AvgROE riêng nhãn `>4%`; DCA protection policy không cấp quyền Binance mới.
- Tương thích JSON cũ: không cần migration/rewrite. Chỉ ghi thêm các field audit optional
  `binanceDcaProtectionSuppressed` và `binanceDcaProtectionPolicyVersion` cho order/trade mới; record cũ không có field vẫn đọc bình thường.

## 2026-08-14 - Thống kê Binance thật riêng cho Liquid Flow V2

- Version: `LIQUID_FLOW_V2_BINANCE_STATS_V1_20260814`. Màn riêng `/liquid-flow-v2-binance-stats` có bộ lọc `fromDay/toDay` theo
  `Asia/Bangkok`, lọc exact `labelKey`, KPI FILLED/OPEN/CLOSED/W-L/WR/PF/AvgROE/realized/unrealized/NET, bảng theo nhãn và bảng chi tiết có phân trang.
- `/liquid-flow-v2` chỉ giữ link điều hướng sang trang thống kê và không import JS, không gọi API Binance Income của màn này; socket/render scanner
  vì vậy không còn bị chờ đối soát lịch sử.
- Dữ liệu dùng và ánh xạ: cohort chỉ gồm trade `source=liquid-flow-v2` đã có `binanceEntryFilledAt` cùng trạng thái/order status `FILLED`.
  Entry được nối bằng exact paper trade id + Binance order id đã lưu; PnL lệnh đóng chỉ lấy `REALIZED_PNL + COMMISSION + FUNDING_FEE`
  của Binance trong cửa sổ exact symbol/lifecycle từ fill đến close. Lệnh mở lấy unrealized PnL từ position Binance đúng symbol/side.
  Paper PnL/outcome chỉ hiển thị đối chiếu nguyên nhân và tuyệt đối không được cộng thay khi Binance PnL thiếu.
- Phân loại nguyên nhân: exact signal type là `labelKey`; outcome snapshot được chuẩn hóa thành `TAKE_PROFIT`, `STOP_LOSS`, `TIME_EXIT`,
  `OTHER_CLOSE` hoặc `OPEN`. Bảng còn hiển thị chênh lệch bất lợi giữa signal entry và Binance fill để tìm lỗi thắng/thua do entry.
- Cách thống kê: WR/PF/realized chỉ dùng lệnh CLOSED có Binance Income đã đối soát; AvgROE dùng các dòng có PnL thật và margin Binance;
  NET bằng realized đã biết cộng unrealized vị thế đang mở. Số `pnlMissing` luôn hiện riêng để tránh biến missing thành hòa vốn.
- Ảnh hưởng giao dịch: màn/API chỉ đọc và thống kê, không thay đổi classifier, gate, entry, size, leverage, SL, TP hoặc quyền Binance.
  Không thêm label/card/whitelist mới; các checkbox hiện hữu vẫn mặc định tắt và chỉ hiện khi paper CLOSED AvgROE riêng nhãn `>4%`.
- Tương thích JSON cũ: không migrate/rewrite store. Các trade cũ có đủ `binanceEntryFilledAt` vẫn được đọc; record thiếu fill hoặc PnL Income
  được giữ ngoài cohort/đánh dấu missing, không ghép gần đúng và không thay bằng paper result.

## 2026-08-17 - CoinGlass Model 3: BTC + coin có liquidity và đề xuất vùng giá

- Version collector/universe: `COINGLASS_WEB_BINANCE_MOVERS_LIQUIDITY_V4_20260817`; version đề xuất:
  `COINGLASS_WEB_ZONE_PROPOSAL_V1_20260817`; mode cố định `OBSERVE_ONLY`. Collector chỉ chạy thủ công tại
  `/coinglass-web-top20`, trong child process Playwright riêng và không truyền snapshot vào Liquid Flow V2/scanner.
- Dữ liệu dùng trước snapshot/phân loại: từ Binance Futures public lấy `exchangeInfo`, ticker 24h, bulk best bid/ask và open interest hiện tại.
  BTC luôn được giữ làm `REFERENCE`. Altcoin lấy đúng universe movers của Liquid Flow V2/Binance app style: nhánh `UP` xếp
  `priceChangePercent` 24h giảm dần, nhánh `DOWN` xếp phần trăm âm sâu dần, volume chỉ tie-break; hai nhánh được xen kẽ theo `moverRank`.
  Sau đó altcoin phải đồng thời có quote volume 24h `>= $50M`, ít nhất `20,000` trade/24h, OI notional `>= $5M` và spread
  `<=15 bps`; rồi mới đọc CoinGlass Model 3 48h gồm exact
  `instrumentId`, `prices`, `y`, `liq`, range/updateTime. Đây là snapshot quan sát tại thời điểm crawl, không phải dữ liệu cấp quyền entry.
- Phân loại liquidity hai tầng: tầng Binance tính điểm log volume/OI/top-book/trade để audit nhưng không được sắp lại mover rank. Best bid/ask
  notional chỉ hiển thị audit, không còn là hard gate vì một price tick không đại diện độ sâu toàn book; tầng CoinGlass chỉ giữ altcoin có
  ít nhất `100` liquidation cells, tối thiểu hai local peak trong `±20%` giá và ít nhất một peak tồn tại `>=3` bars. BTC được giữ để làm
  thị trường tham chiếu kể cả lúc CoinGlass thiếu cell. Vì vậy coin volume lớn nhưng order book/OI hoặc cụm thanh lý rỗng (ví dụ case LINK được
  báo) bị đưa vào `exclusions`, không chiếm slot top 20. Peak được tách tối đa sáu vùng mỗi phía thay vì để một phía chiếm toàn bộ danh sách.
- Phân loại đề xuất: mỗi vùng được chấm `strength × exp(-|distance|/8) × persistence boost`, cộng ba vùng mạnh nhất trên/dưới.
  Nếu một phía mạnh hơn ít nhất `1.25x` và vùng hút đầu tiên cách giá không quá `15%`, UI hiển thị `ƯU TIÊN CANH LONG` hoặc
  `ƯU TIÊN CANH SHORT`; còn lại là `CHỜ XÁC NHẬN — HAI PHÍA CÂN BẰNG`; thiếu structured zones là `CHƯA ĐỦ VÙNG THANH LÝ`.
  Đây không phải signal/gate giao dịch: LONG vẫn yêu cầu reclaim/giữ support hoặc breakout-retest; SHORT yêu cầu sweep-reject hoặc
  breakdown-retest; tuyệt đối không market-chase chỉ vì có vùng hút.
- Cách thống kê: trang đếm structured zones, số Binance top tăng/top giảm và trạng thái observe-only long/short/wait; mỗi card ghi exact
  `moverSide/moverRank` cùng giá tham chiếu,
  target/risk zone, distance, relative strength, persistence, volume/OI/top-book/spread. Ảnh canvas vẫn có thể lưu làm audit nội bộ nhưng không còn
  render/crop trên trang và không được OCR/suy diễn. Các số này không tham gia paper W/L, WR, PF, AvgROE, NET hoặc whitelist stats.
- Phiên đăng nhập: crawler và luồng login dùng chung persistent profile riêng trong `data/coinglass-web-top20/browser-profile`. Nút
  `Đăng nhập cho collector` mở cửa sổ visible để người dùng tự đăng nhập một lần và kiểm tra quyền bằng exact ETH Model 3 response; không đọc,
  sao chép hoặc dùng profile/cookie Chrome cá nhân. Vì vậy login ở Chrome thường không đồng nghĩa collector đã login.
- Ảnh hưởng Binance/entry/size/SL/TP: **không**. Isolation contract tiếp tục đặt
  `affectsLiquidFlowV2/signals/paper/Binance/entry/size/SlTp=false`; API login/refresh không gọi order client, paper manager hay protection.
- Whitelist: không thêm nhãn/card thống kê giao dịch nên không thêm checkbox/matcher. Policy hiện hữu vẫn mặc định tắt và chỉ hiện khi paper
  CLOSED AvgROE `>4%`; đề xuất CoinGlass không thể mở khóa whitelist hoặc Binance.
- Tương thích JSON cũ: `auth`, `moverSide/moverRank`, `binanceLiquidity`, `heatmapLiquidity`, `proposal` và `exclusions` đều optional. Snapshot V1/V2 thiếu mover fields
  vẫn parse được nhưng fail-closed cho altcoin: API chỉ giữ BTC, lọc mọi alt version cũ khỏi view và báo bằng `viewLiquidityExcluded`; chỉ snapshot exact V4
  mới được công nhận `UP/DOWN + moverRank`. Row BTC cũ được dựng proposal lúc đọc.
  Không migrate/rewrite paper/signal/settings hoặc backfill outcome. Store/profile tiếp tục git-ignore;
  file snapshot/auth thiếu hoặc lỗi không làm gián đoạn server hay luồng trading.
