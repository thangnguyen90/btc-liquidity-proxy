# Codex Trading Logic Map

> **Đọc trước:** [CURRENT_DECISION_AND_EMA_RULES.md](CURRENT_DECISION_AND_EMA_RULES.md) là bản tóm tắt logic Decision/Recommended/EMA đang chạy, cập nhật ngày 2026-07-20. File hiện tại giữ lịch sử và bối cảnh chi tiết; nếu nội dung cũ mâu thuẫn, ưu tiên bản current và kiểm tra code.

Last updated: 2026-08-17

Use this file as the first read before changing or evaluating trading logic. It summarizes the current intent, naming, pages, paper stores, and rule decisions from prior work so Codex does not need to rediscover everything from `src/server.js` and old chat history.

## Operating Principles

### 2026-08-16 - Bật Binance $2 cho PRIMARY panic reclaim và POST-PUMP squeeze READY

- Versions: detector/registry `LIQUID_HEATMAP_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_V20_20260816`, paper `LIQUID_FLOW_V2_PAPER_V29_PRIMARY_POST_PUMP_BINANCE_2USDT_20260816`, route `LIQUID_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_V1_2USDT_20260816`, auto policy `LIVE_CARD_AND_LIQ_FLOW_READY_V14_PRIMARY_POST_PUMP_2USDT_20260816`; whitelist không đổi `LIVE_CARD_WHITELIST_V14_SWEEP_WATCH_CONFIRM_20260816` vì dùng hai exact card hiện hữu.
- Causal data/classification giữ nguyên. `PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY` là top tăng rank 1-20, change 24h `>=8%`, pullback `3-20%` về EMA99 5m, có flush context rồi rebound `>=0,3%`, reclaim EMA99 `0,1-3%`, lower-reclaim và taker hồi `>=-25%`, với dữ liệu change/volume/taker/EMA và HTF đã có trước entry. `POST_PUMP_SHORT_SQUEEZE_LONG_READY` dùng top 150 quote-volume, closed-5m history: pump `>=30%`, drawdown `25-75%`, base 12 nến range `<=6%`/volume fade/lows hold, rồi closed breakout `0,2%` trên base-high + EMA25, volume `>=1,8x`, taker `>=+5%`, close-position `>=65%`. Không dùng future candle, outcome hoặc paper stats làm entry gate.
- Exact route: chỉ hai label trên được thêm vào Liquid V2 auto-real allowlist/profile. Event paper `OPEN` gửi MARKET, margin `$2`, leverage cố định `5x`, notional `$10`; enable/size tách qua env `LIQ_FLOW_V2_PRIMARY_PANIC_BINANCE_*` và `LIQ_FLOW_V2_POST_PUMP_READY_BINANCE_*`. Vẫn chặn khi order disabled/dry-run, existing position, max-position, duplicate claim, preflight/quantity/API fail. `PRIMARY...FLUSH_ACTIVE`, `POST_PUMP...WATCH`, `POST_PUMP_SHORT_SQUEEZE_PRIME` và label lân cận vẫn không cấp Binance.
- Entry/size/SL/TP: hai cohort vẫn paper immediate tại mark READY. Post-pump giữ TP `+10% ROE`, primary giữ opposite-zone với floor `+10% ROE`/cap hiện hữu; cả hai SL `-20% ROE`, max hold 4h. Lệnh thật preserve signal protection và re-anchor cùng khoảng cách theo average fill. Không đổi công thức TP/SL, paper `$10 x5`, trade/vị thế đã mở hoặc cohort khác; chỉ size Binance mới là `$2 x5`.
- Stats/WHITELIST lúc bật: primary 19 CLOSED, 16W/3L, WR `84,2%`, PF `2,51`, Net `+9,2400`, AvgROE `+4,9%`; post-pump READY 7 CLOSED, 6W/1L, WR `85,7%`, PF `3,85`, Net `+4,2618`, AvgROE `+6,1%`. Stats vẫn chỉ tính CLOSED exact label và không gate entry. Existing keys `heatmap-v2:PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY`/`heatmap-v2:POST_PUMP_SHORT_SQUEEZE_LONG_READY` giữ checkbox default off, chỉ hiện khi AvgROE `>4%`; auto profile không tự bật checkbox.
- JSON cũ: setting và audit `binanceEntryCohort`/`binanceEntryPolicyVersion` mới đều optional; runtime normalize thiếu setting về enabled + `$2 x5` mà không migrate/rewrite store. Không replay submit trade OPEN lịch sử; only new OPEN events are claimed. Feature/snapshot cũ, W/L/WR/PF/AvgROE/Net PnL và lịch sử TP/SL được giữ nguyên.

### 2026-08-16 - Sweep quality gates cho UP/DOWN SWEEP

- Container versions: detector `LIQUID_HEATMAP_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_V20_20260816`, paper `LIQUID_FLOW_V2_PAPER_V29_PRIMARY_POST_PUMP_BINANCE_2USDT_20260816`; sweep entry guard vẫn `LIQUID_FLOW_V2_SWEEP_ENTRY_GUARD_V1_20260816`, whitelist `LIVE_CARD_WHITELIST_V14_SWEEP_WATCH_CONFIRM_20260816`.
- Causal pre-entry data chỉ gồm heatmap zone, ba closed-5m OHLC/quote-volume/taker-buy, EMA13/25 trên closed data, change24h, closed-5m return 1h, OI delta và force-order liquidation hiện tại. Không dùng paper outcome/PnL, datepicker stats hay live candle. Snapshot mới `sweepConfirmation5m` là optional.
- UP flow: sweep/reject đầu tiên → `UP_SWEEP_SHORT_WATCH`; READY ở nến kế tiếp chỉ khi bearish retest-fail, high không vượt sweep quá 0,2%, close dưới sweep-close và EMA13, closed-taker `<=0`, OI `<=-0,25%`, force-order socket `OPEN`, short liquidation bằng 0 và context up-move còn hiệu lực. Liquidation active/socket chưa mở luôn WAIT; confidence không còn cộng vì change càng cực đoan.
- DOWN flow: generic sweep/reclaim → `DOWN_SWEEP_LONG_WATCH`. READY chỉ cho pullback ngày `0..+10%`, return 1h `<=-3%`, rồi nến kế tiếp bullish/higher-low, closed-taker `>=+2%`, close cao hơn sweep và trên EMA13/25. Ngày âm phải dùng HTF/panic/kill-long-exhaustion riêng, không generic catch-bottom.
- Paper entry chỉ ở mark scan sau confirmation; exact hai READY bị giới hạn một trade/symbol/ngày Asia/Bangkok và cooldown 4h từ SL qua cả nửa đêm. Giữ `$10 x 5`, TP `+10% ROE`, SL `-20% ROE`, max hold 4h/phí cũ; không đổi Binance size/leverage/SL/TP và bốn nhãn đều auto-real `eligible=false`.
- Stats/WHITELIST: exact READY giữ cohort lịch sử; WATCH có card riêng, key `heatmap-v2:UP_SWEEP_SHORT_WATCH`/`heatmap-v2:DOWN_SWEEP_LONG_WATCH` khớp matcher, default off và không đủ checkbox vì không có CLOSED AvgROE `>4%`. WATCH là OBSERVE ONLY, không được mô tả như gate/order.
- JSON cũ không migrate/rewrite. `sweepConfirmation5m`, `sweepEntryPolicyVersion`, `sweepEntryDayBangkok` optional; trade cũ tiếp tục lifecycle/stats theo plan cũ và không được tái phân loại hậu nghiệm.

### 2026-08-16 - Liquid Flow V2 paper stats theo nhãn + datepicker

- Version `LIQUID_FLOW_V2_PAPER_LABEL_DATE_STATS_V1_20260816`; backend tổng hợp trên toàn bộ paper store thay vì 300 trade của board snapshot.
- Không thay classification hoặc dữ liệu pre-entry. Date cohort lấy `entryAt`, fallback `pendingSince`, theo ngày `Asia/Bangkok`; group exact `labelKey`, fallback `label`/`UNLABELED`. Close-time và outcome không làm đổi cohort entry.
- Date từ/đến inclusive; bộ lọc nhãn áp dụng đồng nhất lên summary, open/pending và closed/cancelled. W/L, WR, PF, Net PnL, AvgROE chỉ dùng `CLOSED`; `CANCELLED` chỉ audit/đếm riêng. Closed/cancelled phân trang backend 10 dòng; UI thêm breakdown theo nhãn.
- Đây là stats/UI only: không đổi Binance, entry, size, leverage, SL/TP. Không thêm signal label/card/matcher nên không cần checkbox WHITELIST mới; default-off và điều kiện closed AvgROE `>4%` của card hiện hữu giữ nguyên.
- JSON cũ không bị rewrite: fallback label và timestamp hỗ trợ record legacy; snapshot/API cũ không đổi, endpoint mới là additive.

### 2026-08-16 - Position Binance đủ 8h còn âm thì TP về entry

- Version `BINANCE_NEGATIVE_TP_TO_ENTRY_AFTER_8H_V1_20260816`; giữ rule deep-loss V3 ở `<=-20% ROE` và rule 12h +1% cho trường hợp không bị rule âm ưu tiên.
- Snapshot causal chỉ gồm active position average entry/amount/side, Mark hoặc uPnL/margin để tính ROE hiện tại, `openedAt` từ fill tracking (fallback runtime first-seen), `Cap TSL`, rồi open TP orders + tick/lot metadata lúc write. Không dùng candle, outcome hoặc PnL tương lai.
- Match khi tuổi position `>=8h` và ROE realtime `<0`; ROE `>=0` không tác động, `Cap TSL` vẫn opt-out. Bỏ fallback cũ âm liên tục 4h và không còn đọc `NEG_TP_TIMEOUT_MS`; deep-loss `<=-20%` vẫn có thể chạy sớm hơn. Env mới: `BINANCE_NEGATIVE_TP_AFTER_8H_ENABLED` và `BINANCE_NEGATIVE_TP_AFTER_8H_MS`.
- Binance chỉ thay TP: hủy TP close-side xa entry, giữ SL, rồi đặt full remaining quantity bằng `LIMIT GTC` tại average entry (`reduceOnly`/đúng positionSide). Không MARKET-close khi đang âm, không đổi entry/side/size/margin/leverage; dedupe symbol+entry và cooldown 2 phút. Rule 12h không ghi đè target entry khi condition 8h đang match.
- Không thêm signal/card/cohort/WHITELIST và không đổi stats. Không thêm field JSON bắt buộc hay rewrite history; field 12h cũ giữ nguyên, record thiếu openedAt dùng first-seen fail-safe sau restart.

### 2026-08-16 - Liquid Flow V2 PUMP FLUSH RECLAIM LONG READY danh Binance $1.5

- Pump detector vẫn là `PUMP_FLUSH_RECLAIM_5M_V1_20260816`; auto/container hiện là `LIVE_CARD_AND_LIQ_FLOW_READY_V14_PRIMARY_POST_PUMP_2USDT_20260816`, `LIQUID_HEATMAP_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_V20_20260816`, `LIQUID_FLOW_V2_PAPER_V29_PRIMARY_POST_PUMP_BINANCE_2USDT_20260816`, whitelist `LIVE_CARD_WHITELIST_V14_SWEEP_WATCH_CONFIRM_20260816`, không đổi rule pump-flush.
- Du lieu truoc entry/causal: top 150 USDT perpetual theo quote-volume, day change khong am va closed 5m OHLC/volume/taker-buy. Baseline gom median volume 20 nen truoc, ATR14, EMA13/25 va RSI14; scan spike 8 nen gan nhat, reclaim trong toi da 6 nen. Nen live, outcome va PnL tuong lai khong duoc dung. `FLUSH_BASE_HOLD` chi la detector state noi bo, khong phai card/gate that.
- Classification: exact label `PUMP_FLUSH_RECLAIM_LONG_READY` can pump-range `>=8%`, `>=2.5 ATR`, spike volume `>=3x`; wick-flush cung nen hoac follow-through retrace `55-105%`, base khong bi dong/thung qua tolerance. Nen reclaim da dong phai bullish, tren EMA13/25 va muc 25% pump-range, higher/equal-low, rebound `>=1.8%`, volume `>=1.5x`, taker `>=+5%`, close-position `>=65%`, RSI14 `45-78`.
- Paper/Binance/size/SL/TP: READY moi tao paper immediate theo closed reclaim. Cohort auto-real `PUMP_FLUSH_RECLAIM` mac dinh enabled, MARKET margin `$1.5 x 5` (notional `$7.5`), co env enable/size rieng va khong bi base-cohort switch chan. Position/max-position/dry-run/preflight guards giu nguyen. Paper giu `$10 x 5`, SL `-20% ROE`, TP floor `+10% ROE` voi opposite-zone/cap hien huu, timeout 4h; Binance neo cung khoang cach TP/SL theo fill that. Khong sua size/protection cua cohort khac hay lenh cu.
- Stats/WHITELIST: card exact `heatmap-v2:PUMP_FLUSH_RECLAIM_LONG_READY`, active dem primary + secondary; W/L/AvgROE chi dung CLOSED exact label. Checkbox default off, chi hien khi closed AvgROE `>4%`, UI key khop runtime matcher va da co test. Quyen auto-real V2 la profile rieng user da bat, khong dong nghia tu bat checkbox thong ke/live-card.
- JSON cu: feature/snapshot/ready-time/settings `pumpFlush*` la optional; khong migrate/rewrite cache/trade cu va record thieu field se khong match. Runtime normalizer cap default enabled + margin `$1.5` cho persisted settings cu, nhung khong sua TP/SL cua history/open trade.

### 2026-08-16 - User-data listenKey reconnect + missed full-fill recovery

- Versions: `POSITION_USER_DATA_STREAM_V2_LISTEN_KEY_RECOVERY_20260816`, fill trigger `POSITION_PROTECTION_SOCKET_FILL_V4_LISTEN_KEY_RECONNECT_20260816`, watermark giữ `POSITION_PROTECTION_FILL_WATERMARK_V1_20260812`.
- Dữ liệu causal: event `listenKeyExpired`/ORDER_TRADE_UPDATE/TRADE_LITE và keepalive hiện tại; sau reconnect chỉ dùng active Position Risk, User Trades/Order FILLED mới hơn durable watermark, loại reduce-only/close-position và khác hướng vị thế. Không dùng signal outcome, PnL tương lai hay nến để replay.
- Lifecycle: expired hoặc keepalive invalid/`-1125` invalidate generation, dừng keepalive cũ, terminate socket và tạo listenKey mới ngay; close/error reconnect sau 5 giây. Generation + single timer chống duplicate. Mỗi reconnect sau lần connect đầu chạy recovery single-flight; startup recovery và reconnect recovery dùng cùng lock/watermark.
- Stats: status có ready/connect/reconnect/expired/keepalive-failure/reason/time; recovery log checked/candidate/recovered/failed. Không thêm label/card/cohort/WHITELIST và không đổi paper stats.
- Binance impact: không đổi gate/entry/size/leverage/target SL/TP. Có thể gửi protection đã dự kiến cho fill bị mất trong outage sau reconnect; không phải missing-SL scanner toàn tài khoản. Lỗi Binance chặn TP+SL `GTE_GTC closePosition` thứ hai vẫn là issue riêng ngoài patch này.
- JSON cũ: không đổi paper/lifecycle schema, tiếp tục đọc watermark V1 và handled order ids; field status socket chỉ ở RAM, không migrate/rewrite history.

### 2026-08-16 - Bật Binance test exact Liquid Kill Zone SHORT yếu/up-mid/day-flat/reset

- Versions: profile `LIQUID_KZ_SHORT_YEU_UPMID_FLAT_RESET_TEST_V1_20260816`, entry `LIVE_CARD_SHORT_ENTRY_GUARD_V2_LIQUID_KZ_LIMIT_RETEST_20260816`, whitelist `LIVE_CARD_WHITELIST_V12_LIQUID_KZ_YEU_UPMID_TEST_20260816`, lifecycle `LIVE_CARD_BINANCE_LIFECYCLE_V3_LIMIT_RETEST_20260816`, expiry `LIVE_CARD_LIMIT_RETEST_EXPIRY_V1_20260816`.
- Classification/pre-entry data: chỉ exact key `cycle-stable:LIQUID_KILL_ZONE | SHORT | 15m | BTC_CORR_YEU | BTC_UP_MID | THEO_YEU | GATE_TEST_LIQUID_SHORT_BTC_COUNTER || CYCLE DAY_FLAT | RSI4_RESET`, được tạo từ snapshot causal tại paper entry. Entry dùng paper price và Binance last price sau preflight cùng position/open-order/dedupe hiện tại; không dùng `cycle-today`, outcome hay dữ liệu tương lai. Mẫu tham khảo lúc bật là 29 CLOSED, 27W/2L, AvgROE `+8.67%`, PF `25.57`, nhưng thống kê hậu nghiệm này không gate từng entry.
- Binance/entry: exact key đã bật trong cả candidate whitelist và real-enabled. SHORT adverse slippage `<=0.05%` vào MARKET; nếu giá Binance thấp hơn paper quá ngưỡng thì đặt `SELL LIMIT GTC` đúng paper price, timeout 60 giây, không MARKET fallback. Zero-fill được cancel và ghi `ENTRY_EXPIRED`; partial-fill được cancel phần dư và đóng phần đã fill. Guard hiện hữu về position, open order, dedupe, giờ chạy và dry-run không đổi.
- Size/SL/TP: margin thật cố định `$1`, leverage theo live-card config (default `10x`), notional bằng margin nhân leverage. TP riêng `+5% gross ROE`, neo theo full fill (`SHORT TP = fillEntry * (1 - 0.05/leverage)`); SL giữ target paper hiện hữu và fill-anchor, không đổi rule SL. Không tác động key khác.
- Stats/UI/whitelist: không thêm label/card/key hoặc checkbox. Paper stats tiếp tục chỉ dùng CLOSED theo exact key; real stats dùng lifecycle matched-key và Binance Income. `ENTRY_EXPIRED` không là closed loss; partial abort có audit riêng. Card `TODAY · OBSERVE ONLY` vẫn chỉ thống kê, không phải tên của rule thật; quyền Binance thuộc exact `cycle-stable` key đã tồn tại, đạt policy hiện checkbox AvgROE `>4%` và được user bật rõ ràng.
- JSON cũ: field order type/limit/expiry/test profile/TP ROE đều optional; lifecycle và whitelist loader tiếp tục đọc version cũ. Không migrate/rewrite execution cũ hay thay protection vị thế đang mở; state enable V12 giữ toàn bộ key cũ.

### 2026-08-16 - EMA FAN LONG thường chỉ entry sau retest-confirm

- Versions: `LIQUID_HEATMAP_FLOW_V2_EMA_FAN_RETEST_CONFIRM_V17_20260816`, `LIQUID_FLOW_V2_PAPER_V26_EMA_FAN_RETEST_CONFIRM_20260816`, `EMA_FAN_LONG_RETEST_CONFIRM_V1_20260816`, auto policy `LIVE_CARD_AND_LIQ_FLOW_READY_V12_EMA_FAN_RETEST_CONFIRM_20260816`, manual policy `LIQUID_FLOW_V2_MANUAL_BINANCE_UI_V7_EMA_FAN_RETEST_CONFIRM_20260816`.
- Dữ liệu causal trước entry: READY dùng rank/universe và nến 5m đóng như detector cũ. PENDING dùng mark tick để arm khi chạm `EMA13_signal +1%`; confirmation chỉ dùng nến 5m đóng sau touch, OHLC, EMA13/25/99 và gap hiện tại/trước, taker delta của chính nến đóng, bullish/higher-low, cùng mark hiện tại tại scan xác nhận. Pending symbol được giữ trong candidate/kline scan tới khi kết thúc dù rơi khỏi top hiện tại. Không dùng nến live, future outcome hoặc thống kê hậu nghiệm để quyết định entry.
- Phân loại giữ nguyên exact label `EMA_FAN_LONG_READY` top 1-50; IMPULSE top 100 với volume/body/distance mạnh vẫn immediate và không đi qua rule mới. Nhánh thường chỉ OPEN khi nến sau touch bullish, close trên EMA13, higher-low, taker `>0`, fan còn ordered và ít nhất một gap widening. Mất order, close dưới EMA25 hoặc cả hai gap co thì `ENTRY_CONFIRMATION_INVALIDATED`; chưa đủ xác nhận thì chờ tới timeout 15 phút.
- Paper/Binance: READY thường tạo PENDING trigger chứ không fill; touch chỉ chuyển sang chờ nến đóng. Khi confirm, paper entry tại mark và re-anchor TP/SL, sau đó mới phát auto Binance MARKET `$1 x 5` với fill-anchored protection. Manual Binance cũng không được bypass khi trade còn PENDING. Paper giữ `$10 x 5`, TP `+10% ROE`, SL `-25% ROE`, max hold 12h; size/leverage/ROE target không đổi, nhưng timing/entry price và giá TP/SL có đổi. IMPULSE giữ Binance `$5 x 5` immediate.
- Stats/whitelist: không thêm label, card hoặc checkbox; thống kê CLOSED theo `heatmap-v2:EMA_FAN_LONG_READY` giữ nguyên W/L/WR/PF/AvgROE/Net PnL. PENDING/CANCELLED không thành closed loss; whitelist key hiện hữu vẫn default off và chỉ hiện khi closed AvgROE `>4%`. Lịch sử routing cũ không backfill và được audit bằng version/metadata.
- JSON cũ: toàn bộ confirmation/gap/closed-taker field mới là optional. Không rewrite OPEN/CLOSED/history cũ. Pending EMA FAN LONG cũ thiếu metadata được coi là confirmation-required ở lần touch sau; label pending khác không đổi.

### 2026-08-15 - Liquid Flow V2 kill-LONG exhaustion reclaim + Discord màu

- Versions `LIQUID_HEATMAP_FLOW_V2_KILL_LONG_EXHAUSTION_V16_20260815`, `LIQUID_FLOW_V2_PAPER_V25_KILL_LONG_EXHAUSTION_20260815`, `LIQUID_FLOW_V2_KILL_LONG_EXHAUSTION_DISCORD_V1_20260815`, `LIVE_CARD_WHITELIST_V11_KILL_LONG_EXHAUSTION_20260815`.
- Nhãn `KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY` dùng causal closed-5m OHLC/EMA13/25/volume/taker, OI delta 1m hiện tại + phút trước + 5m và Binance force SELL ở các cửa sổ trượt 0-5/5-10/10-15 phút; không dùng Liquid Map V1. READY chỉ khi cascade đã rũ OI, force SELL hiện tại giảm còn `<=0.7x` 5m trước, OI 5m `<=-0.5%` nhưng 1m đã ổn định, taker `>=+2%`, nến tăng đóng cao trong range, reclaim cả EMA13/25 và có higher-low. Nếu cascade/force/OI còn mở rộng thì không gắn READY.
- Cohort paper-only `$10 x 5`, entry immediate sau nến đóng, TP `+10% ROE`, SL `-20% ROE`, timeout 4h và target cố định không đọc vùng V1. `affectsBinance=false`, profile auto-real `eligible=false`, không có key trong allowlist Binance.
- Stats/card dùng exact key `heatmap-v2:KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY`, mặc định whitelist off, checkbox chỉ hiện sau closed AvgROE `>4%`. Discord webhook riêng chỉ nhận transition READY, embed xanh cho xác nhận và cam cho invalidation, dedupe 24h.
- Field OI/force-window/decay và paper snapshot mới đều optional; JSON cũ thiếu field không match, không migrate/rewrite và giữ nguyên lifecycle cũ.

### 2026-08-15 - Liquid Flow V2 post-pump absorption LONG labels

- Runtime hiện tại dùng `LIQUID_HEATMAP_FLOW_V2_KILL_LONG_EXHAUSTION_V16_20260815`, `LIQUID_FLOW_V2_PAPER_V25_KILL_LONG_EXHAUSTION_20260815`, `LIVE_CARD_WHITELIST_V11_KILL_LONG_EXHAUSTION_20260815`; logic post-pump của V15/V24/V10 bên dưới giữ nguyên, chỉ dùng chung registry/version mới.
- Universe causal là top 150 USDT perpetual theo quote-volume, dùng 340 nến 5m đóng trước entry. Sau pump `>=30%` và drawdown `25-75%`, detector yêu cầu 12 nến base range `<=6%`, base-return `|x|<=3.5%`, đáy nửa sau giữ và median volume fade `<=0.65` so với peak crash. WATCH chỉ quan sát. READY cần close vượt base-high `0.2%`, trên EMA25, volume `>=1.8x`, taker delta `>=+5%`, nến tăng đóng ở `>=65%` range; PRIME thêm aggregate taker delta base `<=-1%`. OI/liquidation không gate.
- Stats đếm primary + secondary trên `/liquid-flow-v2`. Mỗi nhãn có key whitelist đúng `heatmap-v2:<LABEL_KEY>`, mặc định off và checkbox chỉ hiện khi closed paper AvgROE `>4%`. WATCH không tạo paper; READY/PRIME paper `$10 x 5`, entry immediate sau nến đóng, TP `+10% ROE`, SL `-20% ROE`, timeout 4h. Đây là trạng thái lịch sử lúc tạo nhãn; từ selective route V1 ngày 2026-08-16 ở đầu file, exact READY thường có Binance `$2 x5`, còn PRIME vẫn `eligible=false`.
- Backtest 14 ngày dùng next-5m-open, fee `0.4% ROE`, SL-first nếu cùng nến: price-only 25 lệnh, WR `76.0%`, AvgROE `+3.875%`, PF `2.13`; PRIME 6/6, AvgROE `+9.6%` nhưng mẫu nhỏ. Giữ paper-only để tích lũy out-of-sample.
- JSON cũ tương thích vì `postPumpUniverse`, feature/snapshot mới đều optional; không migrate/rewrite và thiếu field thì không match nhãn mới.

### 2026-08-15 - Binance negative TP-to-entry loại trừ Cap TSL

- Version `BINANCE_NEGATIVE_TP_TO_ENTRY_V3_CAP_TSL_EXCLUDED_ROE20_20260815`. Protection sau entry chỉ dùng average entry, mark/uPnL, margin, leverage và trạng thái checkbox Cap TSL hiện hữu của active position; không dùng future candle hoặc paper outcome.
- Bot, Liquid Flow V2 và lệnh tay pass tại Binance ROE `<= -20%`, nhưng symbol đang check `Cap TSL` trên Orders được fail-closed khỏi toàn bộ đường dời TP: socket, scanner dự phòng, deep guard và fallback âm theo thời gian. Bỏ check sẽ áp lại rule ở tick/scan sau; symbol + entry dedupe và cooldown 2 phút giữ idempotency.
- Khi pass và Cap TSL tắt, TP close-side xa entry bị hủy rồi thay bằng `LIMIT GTC reduceOnly` tại average entry; SL, entry, margin/size và leverage không đổi. Khi Cap TSL bật, rule này giữ nguyên TP/SL hiện tại và không write/cancel Binance. Profit-lock dương của Cap TSL vẫn giữ rule riêng `10% -> +1%` tối đa.
- Không thêm signal/label/card/stat cohort hay checkbox whitelist. Tái sử dụng key/API/localStorage Cap TSL hiện hữu; server tách checkbox Orders khỏi legacy signal-exclude và lưu optional `data/orders-cap-tsl.json` theo `ORDERS_CAP_TSL_STATE_V1_DURABLE_20260815`, nên restart không làm mất rule. File cũ thiếu được xem là rỗng và Orders vẫn đồng bộ localStorage lên; không migrate/rewrite trade JSON.

### 2026-08-12 - Startup TP-only recovery cho position Binance dang mo

- Version `BINANCE_STARTUP_TP_ONLY_RECOVERY_V1_20260812`; fail-safe chay dung mot lan sau startup, khong mo lai scanner dinh ky. Du lieu sau entry gom active position va regular/algo orders Binance; target uu tien snapshot causal truoc entry trong tracking/plan/lifecycle, exact Liquid Flow V2 paper hoac pump plan. Position tay khong co lifecycle dung average entry/leverage Binance de tinh TP `+30% ROE`; bot da nhan dien mat target dung fallback LONG `+10%`, SHORT `+6%`. Khong dung outcome/nen tuong lai.
- Matcher coi bat ky close-side `TAKE_PROFIT(_MARKET)` dung `positionSide` la TP hop le, ke ca `closePosition=true`, quantity 0; neu co thi giu nguyen. Neu thieu, re-read fresh fail-closed roi moi dat `TAKE_PROFIT_MARKET closePosition`. Liquid Flow V2 khong tim lai duoc target goc thi skip, khong gan fallback.
- Co tac dong TP Binance that cho position cu bi miss fill socket, nhung **khong dat/sua/huy/quet bu SL**, khong cancel order/TP cu, khong doi entry, size/margin, leverage hay thong ke. Summary startup chi la telemetry, khong them nhan/card/whitelist.
- JSON cu khong migration/rewrite; feature chi doc field optional va giu manual fallback khi position khong co metadata. Runtime dat `AUTO_TP_SCAN_ENABLED=false`; `BINANCE_STARTUP_TP_RECOVERY_ENABLED=true`, delay mac dinh 20 giay.

### 2026-08-12 - Manual Orders/Binance socket default TP 30% ROE V2

- Version `MANUAL_SOCKET_TP_ROE30_V2_20260812`. `/orders` source `orders-manual` van tinh TP tu request va neo sau fill; full fill vao truc tiep tu Binance app, khi khong khop plan/lifecycle bot hay manual Liquid Flow V2, duoc gan `binance-manual-socket` va tinh theo gia vao trung binh position sau fill + leverage that. Day la rule protection sau entry, khong dung candle/nhan/outcome de phan loai; DCA dung average entry sau DCA thay vi gia cua leg moi.
- TP de trong/dat tu Binance app: LONG `averageEntry * (1 + 0.30/leverage)`, SHORT `averageEntry * (1 - 0.30/leverage)`. One-shot socket plan cung mang SL mac dinh `-25% ROE` neu Auto SL bat; idempotency check doc moi TP va SL rieng, chi dat ve con thieu. Khong mo lai missing-TP/SL scanner dinh ky.
- Khong them nhan/card/whitelist hay doi thong ke. Co tac dong TP/SL Binance sau full fill cua lenh tay moi; khong doi entry, margin, size, leverage, bot/Liquid Flow V2 plan. `signalSource`/policy metadata moi la optional, JSON cu khong migrate/rewrite; position cu chi sua mot lan co muc tieu sau khi audit.

### 2026-08-11 - Tong PnL History Binance realtime

- Version `LIVE_CARD_HISTORY_TOTAL_PNL_V2_20260811`; tinh tren unique lifecycle da fill cua dung date-range/filter Orders.
- `Tong hien tai = NET dong Binance da doi soat + gross uPnL lenh mo theo mark socket`; record dong chua co income hoac lenh mo chua co socket duoc dem thieu, khong ep thanh 0. Du lieu truoc entry gom fill/qty/margin/leverage lifecycle, sau entry chi mark socket va NET income dung cho thong ke ket qua.
- Chi doi UI/thong ke, khong them nhan/whitelist va khong anh huong Binance, entry, size, leverage, SL/TP. JSON cu giu nguyen, khong migrate/rewrite.

### 2026-08-11 - Orders manual default TP 30% ROE

- Version `ORDERS_MANUAL_TP_ROE30_V1_20260811`; chi phan loai source `orders-manual` tu form Orders, dua tren side, leverage va gia truoc entry, sau do neo lai vao gia full fill nhan tu Binance user-data socket.
- TP de trong duoc tinh LONG `fill * (1 + 0.30/leverage)`, SHORT `fill * (1 - 0.30/leverage)`; TP price nhap tay luon override default.
- Khong them nhan hay thong ke moi. Co tac dong TP Binance cho lenh tay moi, khong doi entry/size/margin/leverage/SL, khong doi bot/Liquid Flow V2 va van chong duplicate protection. Tu 2026-08-12, startup recovery V1 co the bo sung TP con thieu mot lan cho position cu nhung khong dat SL.
- JSON cu tuong thich vi metadata policy/fill-anchor la optional; khong migrate hay ghi lai history.

- Always backtest/stat before applying a new market-blocking rule when possible.
- Keep paper/test records even when Binance market is blocked, so later stats can compare blocked vs allowed behavior.
- Do not delete old paper trades unless the user explicitly asks to clean noisy historical trades.
- Prefer labels over silent blocking: if a gate changes size, blocks market, or cuts a trade, record a clear label/reason.
- For real/Binance decisions, after fees matter. A combo with AvgROE near 0 is effectively bad even if WR is high.
- Socket market price is preferred for paper mark/entry/PNL. Stale snapshot fallback should be visible and avoided where possible.
- Combo stats should exclude `NO_DATA` buckets when they do not help decision-making.

## Main Data Stores

- EMA/Pump shared paper store: `data/pump-paper-trades.json`
- Shakeout paper store: `data/shakeout-paper-trades.json`
- BR-like limit-only paper store: `data/br-like-limit-paper-trades.json`
- Top Reversal paper store: `data/top-reversal-paper-trades.json`
- Post Pump Kill Short paper store: `data/ppks-paper-trades.json`
- Capitulation paper store: `data/cap-paper-trades.json`

## Pages

- `/ema-squeeze`: EMA Squeeze paper table and combo summaries.
- `/ema-combo-stats`: dedicated EMA combo stats page, with filters and sorted quality cards.
- `/br-like-limit`: separate paper page for BR-like limit-only evaluation.
- `/pump`: Pump Signals and Pump paper, now with day filter, BTC context columns, combo stats, and socket mark pricing.
- `/post-pump-kill-short`: Kill Spike / post pump kill short paper page.
- `/cap`: Capitulation Signal Board and cap paper trades.
- `/shakeout-reclaim`: Shakeout Reclaim board and paper trades.
- Top Reversal table is part of the Top Reversal page/section.

## EMA Squeeze Paper

### General

- Source prefix: `emasq-*`.
- Main stages: `BR-like`, `BR-like Short`, `Runner`, `Breakout`, `Breakdown`, `Pre Breakout`, `Pre Breakdown`, `Squeeze`, `Squeeze Short`.
- Mark price uses dedicated EMA Squeeze socket.
- Combo stats are generated by `emaComboStatsOf()`.
- Combo stats exclude `NO_DATA` when `EMA_COMBO_STATS_EXCLUDE_NO_DATA` is not false.
- Combo quality:
  - Strong/good requires positive PnL and positive AvgROE.
  - High WR alone is not enough because fees can make near-zero AvgROE unprofitable.

### BTC / Market Regime

BTC context fields used in combo and gates:

- `btcCorr`
- `btcTrendDir`
- `btcTrendScore`
- relation buckets: `THUAN_BTC`, `NGUOC_BTC`, `DOC_LAP`, `THEO_YEU`
- trend buckets: `BTC_UP_WEAK/MID/STRONG`, `BTC_DOWN_WEAK/MID/STRONG`
- market regime labels such as `WEAK_UP_SHORT_OK`, `SIDEWAY_UP_ALIGNED`, `CHOP_SIZE_3`

Important intent:

- `WEAK_UP_SHORT_OK` means BTC is only weak up, not strong enough to ban shorts. Allow short normally or reduce leverage when configured.
- Strong/sideway-up can be bad for short unless the coin is clearly exhausted or going against BTC.
- Strong/sideway-down can be bad for long unless the coin is clearly bouncing independently.
- CHOP should reduce size rather than fully block both sides.

## BR-like Market

### General

- BR-like market paper lives in `data/pump-paper-trades.json` with `emasq-*br_like*` source.
- Entry for market should use fresh market/socket price, not stale setup mark.
- BTC cluster hard blocks were later removed for BR-like market; keep BTC labels for evaluation but avoid over-blocking market from BTC alone.
- `REAL_BAD`, `REAL_OK`, `REAL_TEST`, `REAL_BLOCK` are candle/quality labels, not absolute truth.
- Score alone is unreliable; combo/candle/market stage matters more.

### Short Environment

Previously evaluated:

- `SHORT_ENV_BAD_STRICT`
  - rolling 2h closed short >= 20, and one of:
    - short PnL <= -10
    - breadth reversal loss cut count >= 8
    - WR < 45
- `SHORT_RECOVERY_60M`
  - rolling 60m closed short >= 8 and (`BR-like Short PnL > 0` or WR >= 70)
  - If strict bad but recovery true, market can be allowed.

Result: this rule sometimes blocked but did not always improve. Keep labels visible; do not blindly trust it.

### Reversal / Opposite Signal

- BR-like long/short can be cut by opposite direction signal or breadth reversal.
- Cut reason must be explicit, e.g. `BR_LIKE_OPPOSITE_SIGNAL_CUT`, `BREADTH_REVERSAL_LOSS_CUT`.
- For BREADTH_REVERSAL loss cut, threshold was changed from `-3%` to `-6%` ROE.
- User disliked too-early BE/TP movement from breadthBE_TP; that logic was temporarily disabled.

### TP / SL

- BR-like short TP in strong/normal context was debated around 35%, then lowered in some regimes.
- Sideway/super-sideway can cap TP near 5% for runner/br-like.
- If BR-like is negative beyond around `-5%` ROE, TP can be moved back to entry, including runner clone logic.

### Combo Display

- BR-like combo cards must include market regime labels such as `REGIME_WEAK_UP_SHORT_OK`; do not reduce everything to `GATE_PASS`.
- Combo stats should show GOOD, BAD, and NEUTRAL, not only best rows.
- Combo cards on all combo screens should show the current/historical paper size badge, e.g. `TEST $1` or `TEST $10`, at the top-right.

## BR-like Limit Paper

- Separate page/store for limit-only tests: `/br-like-limit`.
- Do not reuse the old market paper page for limit evaluation.
- For limit paper, old BR-like logic is cloned where useful, but market and limit should stay conceptually separate.
- Opposite-signal close logic was explicitly not applied at one point, then breadth reversal and BTC turn logic were discussed/applied carefully.
- When `BTC_TOP_REJECT_CLUSTER_BAD` for long or `BTC_BOTTOM_BOUNCE_CLUSTER_BAD` for short fires:
  - Do not necessarily pause by time.
  - Prefer waiting for BTC candle confirmation.
  - Profit cut should only cut positive trades, threshold later set around `pnl > 0.5`.
- User questioned early profit cuts because fees can eat tiny profits. Avoid cutting too early unless backtest supports it.

## Runner

### General

- Runner is independent from BR-like but many BR-like risk rules were cloned into runner-specific branches.
- Runner should be market-only; pending was turned off for runner.
- Runner should use its own labels and not share BR-like state blindly.

### BTC / Combo Rules

- Runner combo stats are important for deciding size.
- Bad Runner combos from 3-day analysis were set to test `$1`:
  - `LONG 5m + BTC_CORR_RAC + BTC_UP_MID + DOC_LAP`
  - `LONG 5m + BTC_CORR_RAC + BTC_UP_STRONG + DOC_LAP`
  - `LONG 5m + BTC_CORR_THEO + BTC_UP_STRONG + THUAN_BTC`
  - `LONG 15m + BTC_CORR_YEU + BTC_UP_MID + THEO_YEU`
  - `LONG 5m + BTC_CORR_THEO + BTC_DOWN_WEAK + NGUOC_BTC`
  - `SHORT 5m + BTC_CORR_THEO + BTC_DOWN_STRONG + THUAN_BTC`
  - `SHORT 5m + BTC_CORR_RAC + BTC_UP_MID + DOC_LAP + SIDEWAY_UP_COUNTER_TEST_ONLY`
  - `SHORT 5m + BTC_CORR_RAC + BTC_UP_STRONG + DOC_LAP + SIDEWAY_UP_COUNTER_TEST_ONLY`
  - `SHORT 15m + BTC_CORR_THEO + BTC_DOWN_MID + THUAN_BTC`
  - `SHORT 5m + BTC_CORR_RAC + BTC_DOWN_MID + DOC_LAP`
  - `SHORT 5m + BTC_CORR_RAC + BTC_UP_MID + DOC_LAP + SIDEWAY_UP_COUNTER_TEST_ONLY`
  - `SHORT 5m + BTC_CORR_RAC + BTC_UP_WEAK + DOC_LAP`
  - `SHORT 15m + BTC_CORR_RAC + BTC_UP_WEAK + DOC_LAP`
  - `SHORT 15m + BTC_CORR_THEO + BTC_UP_WEAK + NGUOC_BTC`
  - `LONG 15m + BTC_CORR_RAC + BTC_UP_STRONG + DOC_LAP + UP_ALIGNED`
- Config:
  - `EMA_SQUEEZE_PAPER_RUNNER_BAD_COMBO_TEST_GATE=true`
  - `EMA_SQUEEZE_PAPER_RUNNER_BAD_COMBO_TEST_MARGIN_USDT=1`
- Positive Runner combo allowed to scale cautiously:
  - `LONG 15m + BTC_CORR_RAC + BTC_UP_STRONG + DOC_LAP` uses `TEST $3` via `EMA_SQUEEZE_PAPER_RUNNER_POSITIVE_COMBO_MARGIN_USDT=3`, except the explicitly bad `UP_ALIGNED` combo above.

### US Session

- User observed many runner/squeeze/pre-breakdown losses around late Vietnam evening / US session.
- Bad session gate exists for Runner/Squeeze Short style logic:
  - bad window roughly 23h-03h Vietnam / corresponding UTC depending code.
  - bad combos in that window can test `$1`.
- This is a size downgrade, not a data deletion.

### SL / TP

- Runner gets cloned BR-like reversal/turn risk rules.
- If runner goes negative around `-5%` ROE, TP can move back to entry.
- Sideway/super-sideway can cap TP to `5%`.
- SL trailing for Shakeout is separate; Runner EMA Squeeze follows EMA Squeeze paper logic.

## Breakout / Breakdown / Pre Breakout / Pre Breakdown

### Breakout

- User asked to apply all BR-like rules to Breakout, but in a separate branch, not shared BR-like code.
- Breakout gate `GATE BLOCK BREAKOUT SIDEWAY UP ALIGNED` looked bad and was set to test `$1`.
- Env:
  - `EMA_SQUEEZE_PAPER_BREAKOUT_SIDEWAY_UP_BLOCK_TEST_MARGIN_USDT=1`
- Additional bad Breakout/Pump combos set to `TEST $1`: Breakout LONG 5m/15m BTC_CORR_RAC + BTC_UP_MID + DOC_LAP with `OK/BLOCK BREAKOUT_SIDEWAY_UP_ALIGNED` or `PREMIUM`.
- Breakout long SL losses often came from entering when BTC/correlation and candle context were bad, even if raw signal looked high score.

### Breakdown / Pre Breakdown

- Pre Breakdown was re-enabled.
- Pre Breakdown paper test is `$10`.
- Specific bad/uncertain combo was set to `$1`:
  - `Pre Breakdown SHORT 15m BTC_CORR_THEO BTC_DOWN_MID THUAN_BTC EMA_PRE_BREAKDOWN_SIDEWAY_DOWN_ALIGNED`
  - env `EMA_SQUEEZE_PAPER_PRE_BREAKDOWN_SIDEWAY_DOWN_MID_TEST_MARGIN_USDT=1`
- Pre Breakdown TP was considered too high; TP cap/risk TP cap exists.

### Pre Breakout

- `PRE_BREAKOUT` no longer uses score min/max or runner-score requirement as a block. Keep non-score gates such as BTC/chart/liquidity/order guards.

## Squeeze / Squeeze Short

- Squeeze Short should clone BR-like rules where useful.
- Squeeze Long was added as opposite case of Squeeze Short with full logic.
- Squeeze paper set to `$10`.
- Squeeze SL set to 15% for all.
- On super-sideway days, Squeeze long/short TP can be reduced to 5%.

## Pump Signals

### Paper / Socket

- `/pump` uses dedicated socket mark logic similar to EMA Squeeze.
- Pump paper supports day filter and PnL summary per selected day.
- Pump paper stores BTC context and combo fields:
  - `pumpCombo`
  - `pumpSignalType`
  - `pumpSignalGrade`
  - `pumpSignalMarketOk`
  - `pumpSignalFactors`
  - `pumpSignalTimeframe`
  - `btcHealth`, `btcTrendDir`, `btcTrendScore`, `btcCorr`

### Combo Stats

- Pump combo stats must respect the selected day filter.
- Pump combo stats should show a mixed view:
  - good samples
  - bad samples
  - neutral samples
- Do not show only top winners; that hid the fact that Pump overall had many losing trades.
- Exclude `NO_DATA` combo cards because they are not actionable.
- After day filter change or in-place mark update, frontend must re-render combo stats.
- Bad Pump combo cards can be downgraded to `TEST $1` with `PUMP_BAD_COMBO_TEST_GATE`; current downgraded examples include Breakout LONG BTC_CORR_RAC/BTC_UP_MID/DOC_LAP + `BREAKOUT_SIDEWAY_UP_ALIGNED`, Runner LONG 5m RAC/UP_MID/DOC_LAP + `WEAK_UP_COUNTER_TEST_ONLY`, Runner LONG 5m YEU/UP_MID/THEO_YEU + `GATE_-`, Runner LONG 5m THEO/UP_STRONG/THUAN_BTC, Runner LONG 15m BTC_CORR_YEU/BTC_UP_MID/THEO_YEU, Runner LONG 5m RAC/UP_STRONG/DOC_LAP + `SIDEWAY_UP_ALIGNED`, Runner LONG 15m RAC/UP_STRONG/DOC_LAP + `UP_ALIGNED`, Runner SHORT 5m RAC/UP_MID/DOC_LAP + `SIDEWAY_UP_COUNTER_TEST_ONLY`, Runner SHORT 5m RAC/UP_WEAK/DOC_LAP, Runner SHORT 5m RAC/UP_STRONG/DOC_LAP + `SIDEWAY_UP_COUNTER_TEST_ONLY`, Runner SHORT 15m RAC/UP_WEAK/DOC_LAP, Runner SHORT 15m THEO/UP_MID/NGUOC_BTC + `GATE_-`, and Runner SHORT 15m THEO/UP_WEAK/NGUOC_BTC.
- Positive native Pump combo allowed to scale cautiously:
  - `EMA_PULLBACK LONG A SCORE_80_89 VOL_5X_PLUS CHASE_OK MARKET_OK` uses `TEST $5` via `PUMP_EMA_PULLBACK_A_GOOD_MARGIN_USDT=5`.

## Capitulation Signal Board

- `/cap` paper uses its own store, but sizing/combo classification should follow the latest Pump paper rules through `pumpSignalComboOf()` and `pumpSignalPaperMarginUsdt()`.
- New cap paper trades store Pump-compatible fields for later stats:
  - `pumpCombo`
  - `pumpSignalType`
  - `pumpSignalGrade`
  - `pumpSignalMarketOk`
  - `pumpSignalFactors`
  - `pumpSignalTimeframe`
  - `btcHealth`, `btcTrendDir`, `btcTrendScore`, `btcCorr`
- `/cap` paper UI must show the same evaluation context used by Pump:
  - day filter
  - filtered open/closed count and total PnL split into realized/live
  - BTC? and BTC Trend columns
  - Score and Combo columns
  - combo cards above the table, sorted with good/large-sample combos first
- `/api/cap-signals` must attach Pump-style BTC context to every signal before SSE/API output:
  - `btcHealth`
  - `btcTrendDir`
  - `btcTrendScore`
  - `btcCorr`
  - `capGateLabel`
  - `interval` / `pumpSignalTimeframe` equivalent
- Cap gate label should be specific like EMA Squeeze combo gates, not just `BLOCKS_LONG/SHORT`.
- Cap gate is derived from signal type + side + BTC market regime + BTC correlation + protection flags:
  - type: `SC_SPRING`, `BC_UTAD`, `LIQ_FLUSH`, `LIQ_TOP`, `FAILED_BOUNCE`, `FAILED_TOP`
  - regime from `getEmaSqueezeMarketRegime()`: `UP`, `DOWN`, `SIDEWAY_UP`, `SIDEWAY_DOWN`, `WEAK_UP`, `WEAK_DOWN`, `CHOP`
  - posture: `ALIGNED`, `COUNTER_TEST`, `COUNTER_BLOCK_TEST`, `CHOP_TEST`, `NEUTRAL_TEST`
  - protection: `PROTECT_LONG`, `PROTECT_SHORT`, `PROTECT_LONG_SHORT`, `NO_PROTECT`
- Example cap gate labels:
  - `OK_CAP_BC_UTAD_SIDEWAY_UP_COUNTER_TEST_PROTECT_LONG`
  - `OK_CAP_SC_SPRING_SIDEWAY_UP_ALIGNED_PROTECT_SHORT`
  - `BLOCK_CAP_SC_SPRING_SIDEWAY_DOWN_COUNTER_BLOCK_TEST_PROTECT_SHORT`
- Store `capGateReason` for hover/debug stats.
- Cap signal cards should display BTC?, BTC Trend, and Gate badges before the note, and `+ Paper` must send that context into the paper log.
- Cap paper combo keys include a final `GATE_*` segment.
- Cap combo cards also exclude `NO_DATA` groups because they are not useful for decision stats.
- Cap paper mark/PNL uses a dedicated socket-only last-price ticker (`aggTrade`), not stale REST/shared mark fallback.
- If no live socket price is available for an active cap paper trade, active PnL/ROE should stay empty instead of pretending the entry/old mark is fresh.

## Shakeout Reclaim

### Weak reclaim BTC-aware sizing (2026-07-18)

- Do not block every `BTC_UP_MID` weak reclaim. For `WEAK_RECLAIM LONG` with `score < 75`, size by BTC strength instead:
  - Bad/test `$1` when `BTC_UP_MID` is weak/flat (`btcRegimeAtEntry=FLAT/WEAK`), or `btcTrendScore <= 55`, or `btcPct6hAtEntry <= 0.10`, or gate contains `WEAK_UP`.
  - Good/full `$10` when `BTC_UP_MID` is strong (`btcRegimeAtEntry=STRONG`), or `btcTrendScore >= 60`, or `btcPct6hAtEntry >= 0.25`.
- The old exact cohort `WEAK_RECLAIM + LONG + BTC_DOWN_WEAK + GATE_OK_SHAKEOUT_WEAK_DOWN_INDEPENDENT` is no longer hard-blocked; it is sized down to `$1` for measurement.
- The rule does not affect `CLEAN_RECLAIM`, SHORT signals, or CHASE sizing (`CHASE` keeps its own `$2`/bad-group `$1` test rules).
- Historical trades are not rewritten.
- Config:
  - `SHAKEOUT_RECLAIM_PAPER_WEAK_RECLAIM_LONG_BTC_SIZE_RULE=true`
  - `SHAKEOUT_RECLAIM_PAPER_WEAK_RECLAIM_LONG_BAD_MARGIN_USDT=1`
  - `SHAKEOUT_RECLAIM_PAPER_WEAK_RECLAIM_LONG_GOOD_MARGIN_USDT=10`

### General

- Board should scan max symbols for this page only.
- Signal types include:
  - `WEAK_RECLAIM`
  - `FALSE_RECLAIM`
  - `BOTTOM_REBOUND`
  - `WEAK_REJECT`
- Color/label quality must be visible both on signal board and paper.
- Good-quality Shakeout can use `$10`; bad/uncertain can use `$1`.
- Do not block all weak confirms by point:
  - Clean confirm long:
    - score `60-69`: pending only
    - score `>=70`: market OK
    - score `<60`: small market test
  - Short clean confirm:
    - prefer pending first until more data.

### False Reclaim / Hot Pump

- Several bad cases came from `FALSE_RECLAIM`, `trap MEDIUM/HIGH`, pump extended, reclaim weak.
- Rule intent:
  - FALSE_RECLAIM should not market when pump is too hot or reclaim is weak.
  - Convert to pending/test small.
- Env already includes:
  - `SHAKEOUT_RECLAIM_PAPER_FALSE_RECLAIM_NO_MARKET=true`
  - hot weak thresholds around pump >= 30 and weak reclaim <= 2.

### SL / TP

- User wanted Shakeout SL max 20% ROE.
- Important fix:
  - `SHAKEOUT_RECLAIM_PAPER_MAX_SL_ROE=20`
  - BTC dynamic Shakeout must not set `sl=OFF`.
  - Hard SL must be enforced before BTC dynamic fail-fast.
- TP max for Shakeout capped around `55%`.
- Before creating any Shakeout paper variant (`MARKET`, `PENDING`, or `CHASE`), compute projected ROE from that variant's actual entry -> TP using the final leverage. If projected ROE is below `SHAKEOUT_RECLAIM_PAPER_MIN_PROJECTED_ROE` (default `20`, fallback to `SHAKEOUT_RECLAIM_PAPER_MARKET_MIN_TP_ROE`), skip the paper trade entirely. This prevents `CHASE CANDLE TEST` or pending rows from appearing when the displayed `PNL DU KIEN` is only a few percent.
- Shakeout trailing should mimic real Binance trailing:
  - if profit reaches 15% ROE, move SL to +5%
  - 20% -> +10%
  - continue similarly.

### Estimated Binance Fees

- Shakeout paper now estimates Binance futures fee and exposes net PnL/ROE.
- Default fee is taker `0.04%` per side (`0.0004`), estimated round-trip as `(entry notional + exit/mark notional) * feeRate`.
- Override order:
  - `SHAKEOUT_RECLAIM_PAPER_FEE_RATE`
  - `BINANCE_FUTURES_TAKER_FEE_RATE`
  - `BINANCE_FEE_RATE`
- API/UI keep gross PnL for debugging, but stats, win rate, daily PnL, combo stats, sorting, and live mark PnL should use `netPnl/netRoe`.
- User clarified this is moving SL, not moving TP.

### BTC Dynamic / Pending

- BTC_DYNAMIC_SCOUT should apply the same rule as normal Shakeout.
- Dynamic locked old trades had bug where they could close at `-30%/-46%` due to fail-fast before SL; fixed by enforcing hard SL first.

### BTC Context

- Log BTC state for later stats:
  - bottom/bounce/reversal risk
  - BTC trend/regime
  - BTC relation/corr
- But BTC is not always decisive because many alts are pump/dump coins.

### Chase Candle / Lenh Duoi Gia

- Purpose: test cases where the original pending entry was missed, then a fully closed 5m candle confirms continuation in the trade direction.
- This is a paper-only test path for Shakeout, not a normal market entry quality upgrade.
- Server gate:
  - `SHAKEOUT_RECLAIM_PAPER_CHASE_CANDLE_TEST=false` disables it.
  - Legacy/non-SHORT default margin: `SHAKEOUT_RECLAIM_PAPER_CHASE_CANDLE_MARGIN_USDT=2`.
  - CHASE SHORT uses the dedicated A/B sizing rule documented below.
  - Default move window:
    - `SHAKEOUT_RECLAIM_PAPER_CHASE_CANDLE_MIN_MOVE_PCT=0.8`
    - `SHAKEOUT_RECLAIM_PAPER_CHASE_CANDLE_MAX_MOVE_PCT=6`
  - Minimum closed-candle body share: `SHAKEOUT_RECLAIM_PAPER_CHASE_CANDLE_MIN_BODY_SHARE=0.30`.
  - Temporary relaxed mode (2026-07-15): `SHAKEOUT_RECLAIM_PAPER_CHASE_CANDLE_REQUIRE_CONFIRMATION=false` disables the closed 5m direction/body/previous-close checks while retaining the pending-only, move-window, TP-room and SL-validity gates. Set it to `true` to restore strict candle confirmation.
- Creation condition:
  - Existing pending variant for the same setup exists.
  - No open market variant exists.
  - Use only the latest fully closed 5m candle; never confirm from the still-running candle.
  - LONG requires a bullish candle; SHORT requires a bearish candle.
  - Candle body must be at least 30% of its full high-low range.
  - LONG close must be above the previous 5m close; SHORT close must be below it.
  - Score is logged for analysis only and is not a CHASE entry gate.
  - No wick/sweep/support-resistance requirement is applied; the strict version removed too many trades in backtest.
- Stored markers:
  - `variant=CHASE`
  - `tag=chase-candle-test`
  - `shakeoutQuality=CHASE`
  - structured `chaseConfirmation` stores the closed candle OHLC, previous close, body share, direction checks and close time
  - note contains `CHASE_CANDLE_TEST`
  - note also contains the 5m body share, close, previous close, and `pending missed; closed 5m candle confirmed direction`
- UI:
  - Signal/paper label shows the stored CHASE SHORT tier and actual row margin.
  - Row/card color should be yellow/amber to separate from GOOD `$10` and LOW QUALITY `$1`.
  - Variant badge text is dynamic, for example `CHASE · A · $10` or `CHASE · B/TEST · $5`.
- Stats:
  - `/shakeout-reclaim` has a dedicated CHASE block with separate SHORT A/B summaries.
  - It respects the current day/type/side filters.
  - It shows summary for all chase, chase LONG, chase SHORT.
  - It also groups chase trades by:
    - signal type
    - side
    - timeframe
    - score bucket
    - BTC gate/phase
- Backtest reference (2026-07-14 UTC, closed CHASE only):
  - baseline: 31 closed, 17W/14L, net PnL `-0.828`
  - closed-5m confirmation retained 17: 11W/6L, WR 64.7%, net PnL `+0.487`, AvgROE `+1.43%`
  - rejected 14 trades had net PnL `-1.315`
- When user asks "thong ke rieng lenh duoi gia", read this section first, then inspect only `public/shakeout-reclaim.js` and `data/shakeout-paper-trades.json` if needed.

### CHASE SHORT A / B sizing (2026-07-26)

- Applies only to newly created Shakeout paper rows with `variant=CHASE` and `side=SHORT`.
- `CHASE SHORT A`:
  - signal score `>=65`, or
  - `BTC_DOWN_MID` with score `55-59`.
  - margin `$10` by default (`SHAKEOUT_RECLAIM_PAPER_CHASE_SHORT_A_MARGIN_USDT`).
- Every remaining CHASE SHORT row is `CHASE SHORT B/TEST` with margin `$5` by default (`SHAKEOUT_RECLAIM_PAPER_CHASE_SHORT_B_MARGIN_USDT`).
- This explicit two-tier sizing supersedes the older CHASE weak-group, BTC-up, side-candle and CHOP margin caps for CHASE SHORT only. It does not change entry eligibility, SL/TP, leverage, CHASE LONG, or historical trade sizes.
- New trades persist the tier version, tier, label, reason, rule code and selected margin. Historical rows are classified for statistics from their pre-entry `score` and `btcPhase` without rewriting the store.
- The CHASE stats block shows `CHASE SHORT A · TARGET $10` and `CHASE SHORT B/TEST · TARGET $5` over the complete filtered dataset; paper pagination does not truncate these totals.

## Top Reversal

### Early Scout

- Early Scout is a probe, not a DCA trade.
- No DCA by default for `EARLY_SCOUT`.
- Fail-fast rule:
  - source starts `top-reversal-early-` or `qualityTier=EARLY_CONFIRMED`
  - if `OPEN` and `roe <= -15%`: close `EARLY_FAIL_FAST_ROE`
  - if open >= 15 minutes and `peakRoe < +5%`: close `EARLY_FAIL_FAST_TIME`
  - if trade reaches +15% ROE, existing trailing/lock continues.
- Badges:
  - `FAIL FAST`
  - `NO DCA`
  - `EARLY NO BREAKDOWN`
- If those red badges exist, user later wanted test `$1`; without them, test `$10`.
- Default SL for all Top Reversal was set to 20%.

## Post Pump Kill Short / Kill Spike Reversal Board

- Page path/context: `/post-pump-kill-short`.
- Paper socket mark should work like EMA Squeeze, not stale cache.
- Uses margin similar to EMA Squeeze.
- Default SL set to 20%.
- Apply SL trail logic similar to BR-like where requested.
- Supports filter by day and daily total calculation.
- Pending/limit paper fills:
  - `entryPrice` starts as predicted setup entry.
  - when socket mark touches setup entry, fill uses the socket `markPrice` at that moment.
  - original predicted entry is retained as `setupEntry`; note includes `socketFill=...; setupEntry=...`.
  - quantity is recalculated from actual socket fill price.

## Edge Short Board

- Page path/context: `/edge-short`.
- Edge paper aggregates signals from pump, cap, killshort, ignition, PPKS, spike reversal, and EMA squeeze sources.
- Paper table now follows the pump/cap reporting model:
  - day filter on `createdAt`.
  - daily summary PnL includes realized + live unrealized.
  - combo cards use `pumpComboStatsOf(...)` and hide `NO_DATA` combos.
  - table shows BTC correlation, BTC trend, gate/reason, and combo key.
  - trade rows are server-side paginated via `/api/edge-paper-trades?day=...&page=...&pageSize=...`; summary/combo stats remain calculated over the selected day, not only the visible page.
- Auto-created Edge paper trades persist:
  - `pumpCombo`
  - `btcHealth`
  - `btcCorr`
  - `capGateLabel/capGateReason` when available.
- Pending/limit Edge paper fills:
  - `entryPrice` starts as predicted setup entry.
  - when socket mark touches setup entry, fill uses the socket `markPrice`.
  - original setup value is retained as `setupEntry`; note includes `socketFill=...; setupEntry=...`.
  - quantity is recalculated from actual socket fill price.

## Fees

- Current paper often does not include exact exchange fees.
- For rough taker round-trip estimate, use notional * 0.0008 unless user provides exact fee source.
- A combo with AvgROE near 0 or +0.1 is effectively bad after fees.
- User asked whether Binance token/API can calculate exact fees; be careful not to expose or store tokens in files.

## Common Debug Checklist

When user asks "why no signals / no fills":

1. Check whether scanner found signals.
2. Check stage/gate label on signal card.
3. Check whether market blocked but paper/test still recorded.
4. Check socket mark freshness.
5. Check day filter and whether stats respect the filter.
6. Check PM2 log for REST/Discord/rate-limit issues.
7. Check if a new gate is silently blocking and missing label.

When user asks "why PnL/entry wrong":

1. Verify entry source: socket market vs setup mark vs stale snapshot.
2. Check `marketEntrySource` and `marketEntrySourceAgeMs`.
3. For market orders, entry should be actual/fresh market price.
4. For pending limit, fill should happen when mark crosses entry.
5. For closed trades, old historical bugs stay in data unless cleaned.

When user asks "why combo does not show":

1. Check if combo key excludes a label.
2. Check if `NO_DATA` filter hides it.
3. Check if day filter is applied to combo stats.
4. Check if frontend re-renders combo after in-place update.
5. Check if top-N sorting hides BAD/NEUTRAL rows.

## Useful Verification Commands

Syntax:

```bash
node --check src/server.js
node --check public/pump.js
```

Restart:

```bash
pm2 restart btc-liquidity-proxy --update-env
```

Log:

```bash
pm2 logs btc-liquidity-proxy --lines 80 --nostream
```

API spot checks:

```bash
curl 'http://127.0.0.1:19082/api/pump-paper-trades?page=1&limit=20&day=2026-07-09'
curl 'http://127.0.0.1:19082/api/ema-combo-stats?type=BR-like%20Short&day=2026-07-09&tf=all&combo=all&sort=quality'
```

## Maintenance Note For Future Codex

Before major edits:

1. Read this file.
2. Read only the specific code function/page mentioned by the user.
3. Prefer backtest/stat scripts over broad refactors.
4. Update this file after changing a rule, threshold, page behavior, or important interpretation.

# Shakeout CHASE profit trail

- Applies only to Shakeout paper trades with `variant=CHASE`.
- Starts trailing at peak ROE `+20%` and locks `+5%` ROE.
- Each additional `+5%` peak ROE raises the lock by `+5%`: `25 -> 10`, `30 -> 15`, etc.
- Regular Shakeout paper trades keep their existing trailing thresholds.
- Config: `SHAKEOUT_RECLAIM_CHASE_TRAIL_START_ROE`, `SHAKEOUT_RECLAIM_CHASE_TRAIL_FIRST_LOCK_ROE`, `SHAKEOUT_RECLAIM_CHASE_TRAIL_STEP_ROE`.

## CHASE CHOP shadow cohort (2026-07-22)

- Only new Shakeout paper rows with `variant=CHASE` and `btcMarketRegimeAtEntry=CHOP` are capped at `$1` margin.
- When that cohort reaches `peakRoe >= 7%`, SL moves to the exact fee-adjusted break-even price (entry plus estimated entry/exit taker fees). Existing CHASE trail remains unchanged outside this cohort.
- Every new Shakeout entry snapshots `btcTrendDir4hAtEntry`, `btcTrendScore4hAtEntry`, `btcPct24hAtEntry`, and BTC 5m flip-rate fields. PENDING rows receive the snapshot only when actually filled.
- BTC 5m flip-rate is `direction changes / valid transitions` over the latest 12 fully closed candles; flat-candle transitions are excluded. The window, sample count, flip count, and transition count are stored with the rate.
- These 4h/flip fields are observation-only and do not gate entry.

# Shakeout high-jump risk warning

- Evaluated before creating each new Shakeout `MARKET`, `PENDING`, or `CHASE` paper trade.
- Uses the baseline range of the previous closed 5m candles, excluding the two newest event candles so the signal spike does not distort the baseline.
- Default sample: 12 closed 5m candles, minimum 8 valid candles.
- Marks the symbol `HIGH JUMP RISK` when either:
  - median 5m range multiplied by planned leverage is at least `12% ROE`, or
  - 75th-percentile 5m range multiplied by planned leverage is at least `20% ROE`.
- For `HIGH JUMP RISK` sizing, the risk metric/reason is calculated with the same fixed `5x` leverage used by the paper trade, so UI/source/log do not show misleading `@10x` after the trade has been downsized.
- The warning does not block the signal or paper trade. Existing margin, score, gate, entry, and SL rules continue normally.
- Signal cards and matching paper rows use a yellow background/border and show `HIGH JUMP RISK`; hover/detail includes baseline median, p75, leverage, and projected ROE.
- `HIGH JUMP RISK` is not blocked. Every new Shakeout paper variant (MARKET, PENDING after fill, and CHASE) overrides the normal quality sizing with `$10` margin and fixed `5x` leverage after all other sizing rules. Config: `SHAKEOUT_RECLAIM_PAPER_HIGH_JUMP_RISK_MARGIN_USDT` (default `10`) and `SHAKEOUT_RECLAIM_PAPER_HIGH_JUMP_RISK_LEVERAGE` (default `5`). Existing trades/history are not rewritten.
- Runtime log uses `HIGH_JUMP_RISK` with `trade remains enabled`.
- Existing historical trades are not backfilled; only signals/trades created after this change carry the warning fields.
- Config: `SHAKEOUT_RECLAIM_PAPER_HIGH_JUMP_RISK_FILTER`, `SHAKEOUT_RECLAIM_PAPER_HIGH_JUMP_SAMPLE_5M`, `SHAKEOUT_RECLAIM_PAPER_HIGH_JUMP_EXCLUDE_RECENT_5M`, `SHAKEOUT_RECLAIM_PAPER_HIGH_JUMP_MIN_SAMPLES`, `SHAKEOUT_RECLAIM_PAPER_HIGH_JUMP_MAX_MEDIAN_ROE`, `SHAKEOUT_RECLAIM_PAPER_HIGH_JUMP_MAX_P75_ROE`.

# Shakeout pending near market

- Before creating Shakeout paper trades, compare the planned pending entry with the live market entry used by the same signal.
- Skip the `PENDING` variant when the absolute distance is at most `1%` by default. The existing `MARKET` variant remains unchanged; a pending-only setup creates no trade when its planned entry is already this close to market.
- The final guard runs after all variant branches, so it also covers BTC dynamic, clean-confirm, risk-gated, and other pending-only paths.
- Runtime log: `[ShakeoutPaper] skip SYMBOL SIDE PENDING: distance=...`.
- Config: `SHAKEOUT_RECLAIM_PAPER_NEAR_ENTRY_MAX_PCT` (default `1`; set `0` to disable except exact-price duplicates).

# Daily multi-page combo report

- Windows Task Scheduler runs `scripts/daily-signal-report.bat` every day at `07:00` Asia/Bangkok time.
- The report ends at the previous completed UTC day and covers `EMA`, `Pump`, `Liquid`, and `Edge` only.
- One run aggregates five rolling windows: `1`, `3`, `5`, `7`, and `30` days.
- Discord uses one colored embed per window: `1d` green, `3d` blue, `5d` yellow, `7d` orange, and `30d` purple. A window with no qualifying combo is red.
- A combo is eligible for the Discord best list when `closed >= 8`, `WR >= 80%`, and `AvgROE >= 3%` by default.
- Combo keys containing `NO_DATA` are excluded because they cannot be evaluated by BTC phase.
- Thresholds are configurable with `DAILY_BEST_COMBO_MIN_CLOSED`, `DAILY_BEST_COMBO_MIN_WR`, `DAILY_BEST_COMBO_MIN_AVG_ROE`, and `DAILY_BEST_COMBO_LIMIT`.
- The Discord webhook is stored only in ignored `.env` as `DAILY_BEST_COMBO_WEBHOOK_URL`; never commit it.
- CSV output is written under `D:\\btc-liquidity-reports\\YYYY-MM-DD`, including `discord-best-combos.csv` with `window_days` and `from_date_utc`.
- Safe verification without sending Discord: `npm run daily-signal-report -- --page ema,pump,liquid,edge --date YYYY-MM-DD --dry-run`.

# Daily recommended signals and cloned paper

- The completed daily report writes the qualifying EMA/Pump/Liquid/Edge combos to `data/recommended-signals.json` and a dated copy under the report directory.
- A recommendation becomes active on the next UTC day, so it uses only closed history through the previous UTC day and cannot look ahead.
- Default eligibility is the same as Discord: `closed >= 8`, `WR >= 80%`, and `AvgROE >= 3%` in one or more rolling windows (`1/3/5/7/30d`).
- Discord vẫn chỉ gửi top `DAILY_BEST_COMBO_LIMIT`, nhưng whitelist Recommended giữ toàn bộ combo đạt điều kiện; không cắt top 15.
- Recommendation đánh giá riêng từng bucket margin (`TEST $1`, `TEST $10`, ...) rồi chọn bucket tốt nhất cho đúng `page + BTC phase + combo`; không trộn size làm loãng thống kê và không dùng chung combo giữa các page.
- WR của report/whitelist dùng `win / (win + loss)`, bỏ `BE` khỏi mẫu số giống Combo Stats. `BE` vẫn nằm trong `closed` và AvgROE.
- Combo EMA được dựng cùng schema với card Pump/EMA (`stage + side + timeframe + BTC corr + BTC phase + relation + gate`) để khóa whitelist khớp chính xác với combo đang hiển thị.
- `/recommended-signals` shows the whitelist for a selected UTC day and the separate Recommended Paper table.
- Recommended Paper clones a source trade only when `page + BTC phase + combo` exactly matches that day's whitelist. The original EMA/Pump/Liquid/Edge trade is never changed.
- Clone IDs preserve `sourcePage` and `sourceTradeId`; repeated syncs update the clone instead of creating duplicates.
- Clone storage: `data/recommended-paper-trades.json`. This is an analysis mirror of the source paper result, not an extra Binance order or an independent close engine.
- APIs: `/api/recommended-signals?day=YYYY-MM-DD` and `/api/recommended-paper-trades?day=YYYY-MM-DD&page=1&pageSize=300`.

## Recommended Paper live prices

- Card đề xuất có ba lớp số liệu: `MẪU GỐC` từ báo cáo nguồn;
  `CẬP NHẬT` bằng mẫu gốc cộng toàn bộ Recommended Paper clone cùng combo
  trong window đang xem; `PAPER TỔNG` là số clone thực tế dùng để đối chiếu.
- Badge `STRONG/GOOD/BAD` và quyết định `FULL $N` / `SAMPLE TEST $1`
  dùng `MẪU HIỆU LỰC` = mẫu nguồn + paper clone cùng combo.
  Vì vậy nếu clone mới thắng/thua làm combo đổi chất lượng, lần sync tiếp theo sẽ
  hạ/nâng size theo số đã cập nhật, không giữ mãi nhãn tốt từ mẫu gốc 30D.
- Chấp nhận cộng `PAPER TỔNG` vào mẫu gốc cho màn Recommended để phản ánh đúng
  hiệu quả clone đang chạy; ví dụ mẫu gốc 10 + paper 51 sẽ được đánh giá là
  61 mẫu hiệu lực, không còn giữ WR 100% từ 10 mẫu cũ.

- Recommended Paper owns a dedicated Binance last-price ticker, matching the EMA Squeeze paper architecture instead of relying on the shared ticker.
- The ticker loads every `OPEN`, `PENDING`, and `ENTRY_READY` symbol at backend startup and refreshes the active symbol set every 30 seconds.
- Live mark priority is: dedicated Recommended ticker, source-page ticker, shared ticker, then market snapshot fallback.
- Only active rows receive a live `markPrice`; closed rows retain their recorded exit result.

## Recommended Paper phase gate trial

- This sizing layer applies only to Recommended Paper clones. It never changes source paper trades or Binance orders.
- The exact evaluation key is `page + signal type + side + timeframe + score bucket + BTC phase`.
- Full source size requires the exact-phase recommendation sample to have `closed >= 8`, `WR >= 80%`, `AvgROE >= 3%`, and positive PnL.
- Risky phase overrides always use `$1`: Liquid LONG in `BTC_DOWN_MID/STRONG`; Pump LONG in `BTC_DOWN_WEAK/MID`; Pump SHORT in `BTC_DOWN_MID`.
- A rolling 15-minute cluster allows at most three full-size clones for the same `page + side + BTC phase`; later clones use `$1` until the window clears.
- UI labels explain the decision: `PHASE TEST $1`, `SAMPLE TEST $1`, `CLUSTER TEST $1`, or `FULL $N`.
- When a clone is downsized, quantity, PnL, realized/unrealized PnL, and fee fields are scaled by the same margin ratio. ROE remains unchanged.
- Recommended Paper normalizes every cloned trade SL to `16% ROE` from `entry + side + leverage`, regardless of the source page's original SL. The clone stores `recommendedDefaultSlRoe=16` and `recommendedSlSource=RECOMMENDED_DEFAULT_16_ROE`; source trades and Binance orders are not changed.
- Recommended Paper live SL is enforced by `/api/recommended-paper-trades`: when an `OPEN` clone's live socket mark hits the normalized 16% SL, the clone is closed and persisted as `RECOMMENDED_SL_16` at the SL price. Future source sync preserves that closed state, so the clone is not reopened by the original source trade.

# Recommended Signals / Paper Clone

- Paper đề xuất là bản clone độc lập của các trade nguồn `ema`, `pump`, `liquid`, `edge`.
- Clone chỉ đồng bộ cấu trúc/trạng thái từ JSON nguồn tối đa mỗi 30 giây để tránh tải lại file lớn liên tục.
- Khi API trả trade `OPEN/PENDING`, toàn bộ symbol active được đăng ký bằng consumer `recommendedPaper` trên `sharedMarkTicker`; `markPrice` ưu tiên socket cache của page nguồn rồi fallback sang shared socket trực tiếp.
- Với trade `OPEN`, PnL và ROE live được tính lại từ `entryPrice`, `quantity`, `marginUsdt`; dữ liệu live không ghi ngược vào trade nguồn.
- UI `/recommended-signals` refresh 5 giây/lần.

### Recommended Paper: live mark, sort và loại đóng lệnh

- Trang `/recommended-signals` lấy mark trực tiếp từ socket/cache live của từng nguồn và shared book ticker; UI refresh mỗi 5 giây.
- Có thể bấm mọi tiêu đề cột để sort toàn bộ dữ liệu của ngày đã chọn. Backend sort trước khi phân trang, không chỉ sort 300 dòng đang hiển thị.
- Cột `LOẠI ĐÓNG` phân biệt:
  - `SL DỜI / TRAIL`: outcome là SL nhưng có bằng chứng dời SL (`slTrailLockRoe`, trailing/breakeven note, SL đã qua entry hoặc PnL dương).
  - `SL GỐC`: hit SL ban đầu, không có dấu vết trailing/dời SL.
  - `TP THỰC`: outcome nguồn là TP thực.
  - `VỀ ENTRY`, `HẾT HẠN`, `ĐÓNG THEO RULE`: các cách đóng khác, không tính nhầm thành TP/SL gốc.
- Cột `JUMP RISK` giữ badge `HIGH JUMP RISK` từ trade nguồn; với lệnh đề xuất đang `OPEN/PENDING`, backend còn tự đánh giá baseline biên độ nến 5m theo leverage hiện tại. Tooltip hiện nguyên nhân/median/p75 và có thể bấm tiêu đề để đưa toàn bộ coin nguy hiểm lên đầu.
- Đồng bộ clone chuẩn hóa `score` từ field nguồn hoặc tên `source`; phần tổng quan hiện `AVG SCORE`, table hiện cả score số và bucket, và sort score được thực hiện toàn dataset trước pagination.
- Table clone có cột `TÍN HIỆU ĐỀ XUẤT` dạng `#2 EDGE · KILL_SHORT LONG · 15M`, lấy đúng rank của recommendation trong ngày; hover hiện toàn bộ recommendation nếu một trade khớp nhiều nhóm và tiêu đề hỗ trợ sort theo rank.
- Recommended Paper hiển thị `JUMP RISK` thành ba trạng thái rõ ràng (`HIGH JUMP RISK`, `JUMP OK`, `NO DATA`) và có cột `BTC TREND` lấy snapshot lúc nguồn tạo lệnh: hướng, điểm trend và `%/6h`; không dùng trend live hiện tại để đánh giá entry lịch sử.
- Phía trên bảng Recommended Paper có thống kê theo `recommendationCombo` cho toàn bộ ngày đang chọn, không phụ thuộc trang phân trang. Mỗi nhóm tách open/pending/closed, W/L/BE, WR, PnL, AvgROE và số lệnh full-size so với `TEST $1`; thứ tự là GOOD, NEUTRAL, BAD rồi đến số mẫu và AvgROE.
- Mỗi card combo có badge `THẮNG x/y`: `x` là số lệnh đã đóng có PnL dương, `y` là toàn bộ tín hiệu của combo trong ngày, gồm cả lệnh đang mở và đang chờ.
- Bảng Recommended Paper phân trang cố định `50` record/trang; thống kê combo phía trên vẫn tính toàn bộ ngày đã chọn.
- Màn `/recommended-signals` có cửa sổ thống kê combo riêng: `Trong ngày`, `3 ngày`, `5 ngày`, `7 ngày`, và `Tổng thể`. Bảng lệnh bên dưới vẫn chỉ hiển thị đúng ngày UTC đang chọn; cửa sổ chỉ đổi mẫu thống kê combo và mẫu recommendation tương ứng. `Tổng thể` dùng toàn bộ clone lịch sử đến ngày đang chọn, còn tiêu chuẩn whitelist nguồn dùng sample report `30D`.
- Khóa thống kê combo là `sourcePage + BTC phase + recommendationCombo`; không gộp combo trùng tên giữa Pump, EMA, Liquid hoặc Edge.
- Whitelist hiện tại chỉ quyết định nguồn nào được tạo clone mới. Một clone đã tạo luôn được đồng bộ trạng thái/PnL từ source bằng `sourcePage + sourceTradeId`, kể cả khi combo sau đó không còn pass. Vì vậy mọi lệnh thắng/thua cũ vẫn cộng vào combo để số liệu tương lai không bị survivorship bias.
- Card combo lịch sử hiển thị `ĐANG PASS` khi combo còn thuộc whitelist của cửa sổ đang chọn, hoặc `ĐÃ RỚT PASS` khi không còn đạt điều kiện nhưng vẫn giữ toàn bộ kết quả đã phát sinh.
`r`n
## 2026-07-18 - Shakeout Chase Bad Groups

- `CHASE CANDLE TEST` van duoc tao de do lenh duoi nen, nhung cac combo chase xau tu backtest 4 ngay duoc ha xuong `margin=$1`.
- Nhom xau duoc ghi bang note `CHASE_BAD_GROUP_TEST_1=<reason>` va UI hien `CHASE WEAK GROUP $1`.
- Danh sach nhom xau hien tai:
  - `CLEAN_REJECT SHORT 5m score 60-64 + GATE_OK_SHAKEOUT_SIDEWAY_DOWN_INDEPENDENT`
  - `FALSE_RECLAIM LONG 5m score 60-64 + GATE_OK_SHAKEOUT_SIDEWAY_DOWN_INDEPENDENT`
  - `WEAK_REJECT SHORT 5m score 55-59 + GATE_OK_SHAKEOUT_SIDEWAY_DOWN_INDEPENDENT`
  - `FALSE_RECLAIM LONG 5m score 60-64 + GATE_OK_SHAKEOUT_SIDEWAY_UP_INDEPENDENT`
  - `WEAK_RECLAIM LONG 5m score 55-59 + GATE_OK_SHAKEOUT_WEAK_UP_INDEPENDENT`
  - `WEAK_RECLAIM LONG 5m score 55-59 + GATE_OK_SHAKEOUT_CHOP_TEST`
  - `WEAK_REJECT SHORT 5m score 55-59 + GATE_OK_SHAKEOUT_WEAK_UP_INDEPENDENT`
- Neu dong thoi co `HIGH_JUMP_RISK`, margin `$1` giu nguyen; leverage van dung nhanh high-jump `5x`.
- ENV: `SHAKEOUT_RECLAIM_PAPER_CHASE_BAD_GROUP_TEST=false` de tat rule, `SHAKEOUT_RECLAIM_PAPER_CHASE_BAD_GROUP_MARGIN_USDT=1` de doi size.

## 2026-07-18 - Shakeout BTC Detail Column

- Bang Shakeout Paper co them cot `BTC detail` nam sau `PNL DU KIEN`.
- Cot nay tach cac pha tho nhu `BTC_UP_MID` / `BTC_DOWN_MID` thanh nhan de doc hon: `UP_MID_STRONG`, `UP_MID_WEAK`, `DOWN_MID_STRONG`, `DOWN_MID_WEAK`, kem `score` va `%/6h` neu trade co snapshot.
- Neu trade cu chua co du lieu BTC snapshot thi hien `BTC_NO_DATA`; khong suy dien nguoc tu gia live.
- Day chi la cot hien thi/phan tich va sort, khong doi logic vao lenh, size, SL/TP hay rule block.

## 2026-07-19 - Shakeout BTC Up Short Bad Groups

- Bon nhom Shakeout SHORT xau theo backtest duoc giu lai de thong ke nhung ep size ve `$1`, khong block mat lenh.
- Note runtime: `BTC_UP_SHORT_BAD_GROUP_TEST_1=<reason>; margin=$1`.
- UI label: `BTC UP SHORT WEAK $1`.
- ENV:
  - `SHAKEOUT_RECLAIM_PAPER_BTC_UP_SHORT_BAD_SIZE_TEST=false` de tat rule.
  - `SHAKEOUT_RECLAIM_PAPER_BTC_UP_SHORT_BAD_MARGIN_USDT=1` de doi size test.

- Nhom dang ep `$1`:
  - `FALSE_RECLAIM | SHORT | SCORE_60_69 | MEDIUM | BTC_UP_WEAK`
  - `FALSE_RECLAIM | SHORT | SCORE_60_69 | LOW | BTC_UP_MID`
  - `WEAK_REJECT | SHORT | SCORE_70_79 | MEDIUM | BTC_UP_MID`
  - `WEAK_REJECT | SHORT | SCORE_70_79 | MEDIUM | BTC_UP_WEAK`

## 2026-07-22 - Shakeout Side x BTC Candle V1

- Shakeout Paper co them cot doc lap `Side x BTC`, khong dung ket qua Python va khong thay the combo/quality gate cu.
- Rule moi duoc dong dau tai luc vao lenh bang `ruleVersion=SHAKEOUT_SIDE_BTC_CANDLE_V1`, `regimeAtEntry`, `btcCandleAtEntry` va `symbolCandleAtEntry`.
- Lenh cu van duoc cot UI suy ra `GOOD/RISK/WATCH` tu snapshot san co de danh gia; chi phan execution/size la khong hoi to va khong sua paper log cu.
- `SW_DOWN + LONG + BTC bearish`: `RISK`, cap tat ca bien the paper toi da `$1`.
- `SW_DOWN + SHORT + BTC bearish`: `GOOD`, giu size cua rule Shakeout hien tai.
- `SW_UP + SHORT + BTC bullish`: `RISK`, cap tat ca bien the paper toi da `$1`.
- `SW_UP + LONG + BTC bullish`: `GOOD`, giu size cua rule Shakeout hien tai.
- Cac truong hop con lai: `WATCH`, giu rule combo va size hien tai.
- Rule ap cho ca auto paper va lenh tao qua API; khong block tin hieu de tiep tuc thu thap du lieu.

## 2026-07-22 - Side x BTC display column for all paper tables

- Cac table paper con lai duoc them cot hien thi `Side x BTC` ngay sau cot `Nen BTC` qua `public/paper-candle-columns.js`.
- Cot suy ra `GOOD`, `RISK` hoac `WATCH` tu side, BTC regime snapshot va nen BTC da co trong paper response.
- Neu API page khong ghep duoc object snapshot theo symbol, cot fallback doc truc tiep `Side`, `Nen BTC` va `BTC phase/trend` tren chinh dong; thieu xac nhan thi hien `WATCH`, khong hien `No data`.
- Day chi la cot hien thi: khong ghi de paper log, khong doi entry, size, gate, SL/TP hoac trang thai lenh.
- Shakeout giu cot native va stored V1; script dung chung nhan dien cot san co de khong chen trung.

## 2026-07-19 - Combo Gate Normalization

- Combo stats va Recommended Signals tinh them `gate` vao combo key cho cac nguon `pump`, `ema`, `cap`, `edge`, `liquid` va fallback combo.
- Neu combo goc da co gate-like token (`GATE_*`, `OK_*`, `BLOCK_*`) thi giu nguyen, khong append them.
- Neu gate rong, `-`, `GATE`, `GATE_-` hoac `UNKNOWN` thi normalize thanh `GATE_UNKNOWN`.
- Muc dich: khong de cac lenh bi hien `GATE -` tron im voi combo khac; co the thong ke rieng nhom thieu gate va nhom co gate cu the.
- Code lien quan:
  - `src/recommendedSignals.js`
  - `scripts/combo-stats-by-day.js`
  - `public/ema-combo-stats.js`
# Liquid Scan shadow V2 (2026-07-22)

- Paper Liquid Scan mới mặc định bị cap ở `$1`; không sửa size hoặc kết quả của lệnh lịch sử/đang mở.
- Hai cohort backtest được TEST `$5`: `SHORT + btcCorr >= 0.5`, và nhãn mạnh riêng `SHORT + btcCorr >= 0.5 + abs(sweepDistance) < 1%`. Cohort thứ hai là tập con để tiếp tục so sánh, không cộng size hai lần.
- Dedupe `symbol + side` trong 4 giờ tính cả lệnh đã đóng, tránh tái vào liên tục sau TP/SL.
- Nhãn `GOOD / WATCH / RISK` chỉ để quan sát, không block tín hiệu và không tự nâng size.
- `RISK`: thiếu BTC correlation, correlation `< 0.5`, `BTC_UP_STRONG`, LONG score `80-89`, hoặc SHORT score `60-69`.
- `GOOD · TEST $5`: SHORT có BTC correlation `>= 0.5`; nếu sweep `<1%` hiển thị `GOOD+ · TEST $5`. Các trường hợp còn lại giữ `$1` và nhãn `WATCH/RISK`.
- Lệnh V2 mới dùng SL lũy tiến theo peak ROE: `10→+1`, `15→+5`, `20→+10`, `25→+15`, sau đó tăng theo bước 5 điểm ROE. SL chỉ được dời theo hướng có lợi và không hạ ngược.
- PnL Liquid hiển thị và thống kê theo net: gross trừ phí Binance dự tính hai chiều; mặc định `0.04%` mỗi chiều.
- Rule version lưu trên lệnh mới: `LIQUID_SHADOW_V2_20260722`.

## 2026-08-01 - Short Edge SE BEST L3B Profile

- Rule version: `edge-short-best-profile-observe-v1`.
- Chỉ phân loại các lệnh đã có `SE BEST`; nhãn dùng snapshot có trước entry và không
  đọc PnL/outcome của chính lệnh.
- `SE BEST SHORT FIT`: SHORT, Tier A, BTC DOWN, setup `EARLY_DUMP` hoặc `BC_UTAD`.
- `SE BEST PHASE RISK`: `SHORT_FADE`, `SHORT_PEAK`, `BTC_CRASH_RECLAIM`, hoặc
  `MARKET_DISPERSION` với SHORT score dưới 30.
- Các nhóm đối chứng còn lại: `SE BEST SHORT OTHER`, `SE BEST TIER B TEST`,
  `SE BEST LONG / UP`.
- API thống kê mỗi nhóm theo closed/active, W/L/BE, WR, PnL đóng, PnL active theo
  mark socket, AvgROE, PF và số ngày dương.
- UI `/edge-short` hiển thị card L3B và badge con ngay trong cột `L3 Best`.
- Lịch sử cũ được derive khi đọc; không bulk rewrite JSON. Lệnh mới lưu thêm snapshot
  dưới các field `edgeShortBestProfile*`.
- Toàn bộ lớp này là `OBSERVE ONLY`: không gate/chặn Binance, không đổi entry, size,
  SL hoặc TP.

## 2026-08-01 - Short Edge L3C Risk Day × Point Phase

- Rule version: `edge-short-best-risk-day-point-observe-v1`.
- Chỉ phân rã các lệnh đã mang `SE BEST PHASE RISK`; không thay đổi nhãn L3B hiện có.
- Dữ liệu trước entry gồm BTC rolling 24h (`btcHealth.pct24h`), LONG/SHORT score và
  LONG/SHORT wave/slope trong `marketDirectionAtSignal.scoreDynamics`.
- `RISK DAY BEAR CONTINUE`: BTC 24h `<= -1%`, LONG không ở `BTC_RALLY_REJECT` và SHORT
  không ở `SHORT_FADE/SHORT_PEAK`.
- `RISK NEUTRAL REVERSAL`: BTC 24h nằm giữa `-1%` và `+1%`, LONG ở
  `BTC_RALLY_REJECT`, SHORT ở `SHORT_FADE/SHORT_PEAK/BTC_CRASH_RECLAIM`.
- `RISK MIXED WATCH`: phần PHASE RISK còn lại.
- `/edge-short` hiển thị ba card thống kê toàn khoảng ngày và badge con trong cột `L3 Best`.
  PnL đóng và PnL active được tách riêng; active lấy mark socket khi API trả dữ liệu.
- Lệnh mới chỉ append field `edgeShortBestRisk*`; lệnh cũ derive khi đọc, không rewrite JSON.
- `OBSERVE ONLY`: không gate/chặn Binance, không thay đổi entry, size/margin, SL hoặc TP.

## 2026-08-01 - Backtest candidate L2B Short Edge theo BTC Wave

- Research version `edge-short-wave-2b-backtest-v0-20260801`; chưa chạy runtime và chưa lưu
  thêm field vào JSON.
- Backtest 7 ngày `2026-07-26..2026-08-01` theo Asia/Bangkok, lần xác nhận cuối dùng 2,877 lệnh đóng;
  ngày cuối còn đang chạy. Dữ liệu BTC core trước entry phủ 99.8%.
- Phase dùng direction + EMA1h + regime + pct6h + RSI1h + OBV tại entry, rồi ghép riêng với
  side tín hiệu. LONG/SHORT score dynamics chưa dùng làm điều kiện chính vì chỉ phủ 39.5% tuần.
- Mapping relation đã sửa đúng `SHORT ↔ DOWN`, `LONG ↔ UP`; cùng hướng là ALIGNED, ngược hướng
  là COUNTER.
- SHORT tổng: 1,001 lệnh, WR 80.3%, PnL +$273.128, PF 1.50, dương 7/7 ngày.
- `SHORT | WAVE TRANSITION`: 308 lệnh, WR 84.4%, PnL +$151.272, AvgROE +5.03%, PF 2.07,
  dương 7/7 ngày.
- `SHORT | WAVE DRIVE ALIGNED`: 234 lệnh, WR 79.5%, PnL +$29.465, PF 1.28.
- `SHORT | WAVE COUNTER ACTIVE`: 150 lệnh, WR 79.3%, PnL +$36.062, PF 1.39.
- `SHORT | WAVE COUNTER EXHAUSTED`: 211 lệnh, WR 75.8%, PnL +$36.331, PF 1.24.
- LONG tổng: 1,876 lệnh, WR 63.9%, PnL -$329.533, PF 0.75, âm 6/7 ngày. Riêng
  LONG counter-exhausted gần hòa vốn; các nhóm LONG lớn còn lại âm.
- Điểm tách hữu ích nhất khỏi L2 cũ: `TIER BLOCK | SHORT | WAVE TRANSITION` vẫn có
  239 lệnh, WR 84.5%, PnL +$118.446, PF 2.07 và dương 7/7 ngày.
- Kết luận: candidate L2B phải tách `SIDE × BTC WAVE`, không gộp LONG/SHORT.

## 2026-08-01 - Runtime L2B Short Edge SIDE × BTC Wave

- Version `edge-short-wave-2b-observe-v1`.
- Lệnh mới lưu snapshot tùy chọn `edgeShortWave2b*`; lịch sử derive khi đọc, không rewrite JSON.
- Phân direction + EMA1h + regime thành TRANSITION hoặc confirmed; confirmed tiếp tục tách
  CONTINUATION/EXHAUSTED bằng pct6h, RSI1h và OBV trước entry.
- Có nhãn riêng cho SHORT/LONG × TRANSITION/ALIGNED/COUNTER × ACTIVE/EXHAUSTED và NO DATA.
- `/edge-short` có card thống kê toàn range độc lập phân trang và badge con trong L2 Tier;
  active PnL cập nhật theo mark socket.
- `OBSERVE ONLY`: không gate/chặn Binance, không đổi direction, entry, size/margin, SL/TP.

## 2026-08-01 - Backtest candidate L2C Tier A/B × BTC Wave

- Research version `edge-short-wave-2c-ab-backtest-v0-20260801`; chưa chạy runtime.
- Lấy 439 lệnh đóng Tier A/B trong range 7 ngày Asia/Bangkok, loại BLOCK/NO DATA.
- A+B tổng: WR 74.7%, PnL +$74.040, AvgROE +2.03%, PF 1.34, dương 6/7 ngày.
- A+B SHORT: 255 lệnh, WR 82.7%, PnL +$85.744, AvgROE +3.59%, PF 1.82, dương 5/6 ngày có mẫu.
- A+B LONG: 184 lệnh, WR 63.6%, PnL -$11.704, PF 0.90.
- SHORT transition: 60 lệnh, WR 85.0%, PnL +$35.446, PF 2.46, dương 4/4 ngày có mẫu.
- SHORT drive-aligned: 141 lệnh, WR 82.3%, PnL +$31.851, PF 1.63, dương 5/6.
- SHORT aligned-exhausted: 54 lệnh, WR 81.5%, PnL +$18.447, PF 1.61 nhưng mới phủ 2 ngày.
- LONG drive-aligned và aligned-exhausted đều âm; LONG transition PnL dương nhẹ nhưng AvgROE âm
  và chỉ dương 1/4 ngày nên không ổn định.
- Kết luận: candidate L2C chỉ đáng giữ cho `A/B SHORT × BTC Wave`; chưa thêm nhãn/API/UI,
  không rewrite JSON và không ảnh hưởng Binance/entry/size/SL/TP.

## 2026-08-01 - Runtime L2C Short Edge Tier A/B × BTC Wave

- Version `edge-short-wave-2c-ab-observe-v1`.
- Chỉ Tier A/B eligible; BLOCK/NO DATA không tham gia thống kê L2C.
- Nhãn từng paper giữ Tier A hay B và cohort SIDE × BTC Wave; card chính gộp A+B, khối chi tiết
  tách A/B.
- Toàn range được thống kê độc lập phân trang; active PnL dùng mark socket.
- Lệnh mới append field tùy chọn `edgeShortWave2c*`; lịch sử derive khi đọc, không rewrite JSON.
- `OBSERVE ONLY`: không gate/chặn Binance, không đổi direction, entry, size/margin, SL/TP.

## 2026-08-01 - Pump Source/Wave Observation Layers

- Version `pump-source-wave-observe-v1`.
- Tách cứng `PUMP_NATIVE` và `EMA`; không trộn PnL hai nguồn và không lấy nhãn/tier Short Edge
  làm kết luận cho Pump.
- Dữ liệu trước entry: source/setup/side/timeframe, BTC correlation, BTC direction/score, EMA1h,
  regime, pct6h, RSI1h, OBV và tier snapshot riêng của từng nguồn.
- L1 chốt theo đầu ngày Asia/Bangkok từ prior closed; L2 là tier riêng nguồn; L2B là side × BTC wave;
  L2C chỉ ghép Tier A/B × BTC wave; L3 `PUMP BEST` là prior-day walk-forward theo nguồn/setup/side.
- Tất cả card dùng NET PnL sau phí round-trip ước tính; active PnL lấy mark socket. Thống kê chạy trên
  toàn date range, không phụ thuộc page paper đang hiển thị.
- Lịch sử được dựng nhãn một lần rồi cache theo ngày Asia/Bangkok; ghi/đóng lệnh mới không kích hoạt
  quét lại toàn bộ kho, trong khi active mark/PnL vẫn được làm mới theo socket.
- `/pump` có năm khối card mới và cột badge `Pump OBS`; các nhãn mới không thay thế các thống kê
  Pump/EMA đang có.
- Lệnh mới append field tùy chọn `pumpObs*`; lịch sử cũ derive khi đọc, không bulk rewrite và không
  thay đổi schema bắt buộc/top-level JSON.
- `OBSERVE ONLY`: không cấp quyền Binance, không gate/chặn, không thay đổi direction, entry,
  size/margin, leverage, SL hoặc TP.

## 2026-08-01 - Market Direction Health non-blocking refresh

- Version runtime `LIQUID_MARKET_HEALTH_RUNTIME_V3_20260801`; không thay version/công thức chấm LONG/SHORT hiện tại.
- Nguyên nhân point biến mất: refresh Market Health chờ chung market snapshot REST bị treo; endpoint quá 30 giây và
  frontend chỉ còn trạng thái `ĐANG CHẤM THỊ TRƯỜNG`/`Sample --`.
- Sửa runtime dùng universe snapshot trong memory trước, timeout REST cold-start 4 giây, dùng BTC Health cache trước và
  timeout 2.5 giây; đồng thời dedupe refresh bằng `inflight` và giữ score cũ trong lúc refresh nền.
- Dữ liệu trước entry, điều kiện phân loại, hysteresis và thống kê snapshot không đổi; API chỉ thêm object chẩn đoán
  tùy chọn `runtime`.
- Không sửa file JSON, không bulk rewrite và tương thích reader cũ vì field response mới có thể bị bỏ qua.
- `OBSERVE ONLY`: không ảnh hưởng Binance, entry/direction, size/margin, leverage, SL hoặc TP.

## 2026-08-01 - Recommended Entry Support source-quality split

- Version `recommended-support-entry-shadow-v2-source-split`.
- Giữ nguyên L9 GOOD/BAD; chỉ tách nhóm xanh thành bốn nhãn quan sát:
  `EDGE CONFIRMED`, `EDGE WEAK`, `LIQUID CONFIRMED`, `LIQUID WEAK`.
- Điều kiện chỉ dùng snapshot trước entry: source/side, Market Direction flip và Source L1 đã
  chốt. `SOURCE GOOD → CONFIRMED`; `SOURCE WATCH/RISK/NO DATA → WEAK`.
- `/recommended-signals` có bốn card thống kê toàn date range và badge trong Paper table;
  PnL active tiếp tục lấy mark hiện tại, còn phân loại không dùng PnL/outcome.
- Không rewrite JSON; field `recommendedSupportEntrySourceQuality*` là tùy chọn/derive khi đọc,
  tương thích dữ liệu cũ.
- `OBSERVE ONLY`: không gate/chặn Binance, không đổi entry, direction, size/margin, SL hoặc TP.

## 2026-08-01 - Recommended card tone theo AvgROE

- UI version `recommended-stats-avgroe-tone-v1-20260801`.
- Toàn bộ card Recommended Paper: AvgROE `> 3.5%` mới xanh; AvgROE `< -1%` đỏ;
  phần còn lại hoặc thiếu mẫu là WATCH/vàng.
- Chỉ đổi màu card/badge hiển thị theo thống kê trong range; không sửa tier snapshot, không
  rewrite JSON và không ảnh hưởng Binance, entry, size/margin, SL hoặc TP.

## 2026-08-02 - Runtime Feed Recovery và EMA warmup missing-only

- Version `RUNTIME_FEED_RECOVERY_V1_20260802`.
- Chẩn đoán trước sửa: universe EMA 179 thường đạt `5m 179/179`, `15m 179/179`, `1h 178/179`, trong khi
  cấu hình tuyệt đối 250 bị cap thành target 179; service gọi lại tiered warmup khoảng 90-96 giây/lần.
- Runtime mới dùng target tỷ lệ 95% (`179 -> 171`) để một symbol thiếu không giữ toàn service trong retry 100%.
  Dữ liệu thiếu vẫn retry riêng theo symbol/timeframe, backoff 90 giây tới 15 phút; khi target đã đạt chỉ gap-fill
  nền mỗi 15 phút và không chạy lại Market Health/tier warmup.
- Public last-price ticker nhận tick mới theo thứ tự với lag tối đa 10 giây thay vì loại mọi tick trên 2 giây;
  watchdog theo giá đã chấp nhận và reconnect sau 15 giây không có accepted tick, kể cả raw message còn tới.
- Hợp nhất bảy ticker paper riêng của Recommended/Cap/EMA/Pump/PPKS/Shakeout/Top Reversal vào một
  `sharedLastTicker`; payload thị trường chỉ parse một lần, còn handler/symbol active vẫn tách theo từng nguồn.
- Coalesce backlog `!ticker@arr`: trong lúc event loop bận chỉ frame mới nhất đang chờ được parse/dispatch,
  không xử lý tuần tự các frame giá cũ khiến socket càng lúc càng tụt lại.
- Watchdog PM2 kiểm tra `pm_uptime` của target và áp startup/restart grace 60 phút sau mọi lần web khởi động,
  kể cả restart thủ công. Điều này ngăn health timeout trong cold warmup tạo vòng restart -> mất cache -> warmup lại.
- Dữ liệu trước entry, điều kiện phân loại, nhãn/tier/combo và cách thống kê lịch sử không thay đổi. Active PnL
  vẫn dùng socket mark nhưng cập nhật ổn định hơn; closed PnL không được tính lại.
- Không sửa hoặc rewrite JSON; không thêm schema bắt buộc. Đây là runtime infrastructure, không phải gate/rule
  Binance và không tác động direction, entry, size/margin, leverage, SL hoặc TP.

## 2026-08-02 - EMA Squeeze và Short Edge SC Spring LONG Corr Rebound

- Version `SOURCE_LONG_CORR_REBOUND_V1_20260802`.
- Backtest 14 ngày trước triển khai xác định chỉ hai setup con đáng theo dõi: EMA `SQUEEZE`
  đạt 8 closed, 7W/1L, `+$0.235`, AvgNetROE `+2.94%`, PF `4.74`; Short Edge `SC_SPRING`
  đạt 5 closed, 5W/0L, `+$3.747`, AvgNetROE `+7.49%`. `PRE_BREAKOUT`, `PUMP_BREAKOUT`
  và `KILL_SHORT` không được đưa vào nhãn.
- Nhãn chỉ đọc snapshot trước entry: LONG, corr `>= 0.5`, BTC `DOWN` score `< 45`, BTC 24h
  nằm trong `(-0.2%, +0.2%)` và RSI4h `< 50`, cộng đúng source/setup của từng page.
- Lệnh mới đúng setup lưu field tùy chọn `sourceLongCorrRebound*`; lịch sử cũ derive lúc đọc,
  không rewrite JSON và không thay đổi schema top-level.
- `/pump` và `/edge-short` có card toàn date range, PnL đóng và PnL active NET tách riêng;
  active dùng mark socket. Badge nằm trong Paper table và ghi `PROVISIONAL`.
- Màu card chỉ là trình bày theo AvgROE: `> 3.5%` xanh, `< -1%` đỏ, còn lại WATCH/vàng.
- `OBSERVE ONLY`: không Binance, không gate/chặn, không đổi entry/direction, size/margin,
  leverage, SL hoặc TP.

## 2026-08-02 - Liquid LONG Corr Rebound paper test $10

- Version `LIQUID_LONG_CORR_REBOUND_V2_20260802`, thay thế V1 observe-only ở runtime.
- Điều kiện phân loại không đổi và chỉ dùng snapshot trước entry: Stage 3 `WATCH` cùng tổ hợp
  `LIQUID_KILL_ZONE · LONG · 15m · BTC_CORR_THEO · BTC_DOWN_WEAK · NGUOC_BTC ·
  GATE_TEST_LIQUID_LONG_BTC_COUNTER · DAY_FLAT · RSI4_RESET`.
- Lệnh auto mới khớp nhãn được paper test `$10`; nhãn trong Paper table hiển thị thêm
  `TEST $10` khi size thực sự đã áp. Lệnh cũ chỉ derive nhãn và giữ nguyên size lịch sử.
- Card thống kê tiếp tục dùng toàn date range và PnL active theo socket, không phụ thuộc trang Paper.
- Không ảnh hưởng Binance, không gate/chặn/tạo entry, không đổi direction, leverage, SL hoặc TP;
  thay đổi duy nhất là paper margin của lệnh auto mới khớp nhãn.
- JSON tương thích ngược bằng các field tùy chọn `liquidLongCorrRebound*`; không rewrite dữ liệu cũ,
  không đổi top-level và reader cũ có thể bỏ qua field mới.

## 2026-08-02 - Liquid LONG Corr Rebound observe-only

- Version `LIQUID_LONG_CORR_REBOUND_V1_20260802`.
- Backtest trước khi triển khai: seed 25–26/07 đạt 12 closed, 10W/2L, PnL `+$0.739`,
  AvgROE `+4.56%`, PF `2.43`; test 7 ngày 27/07–02/08 đạt 68 closed, 67W/1L,
  PnL `+$5.234`, AvgROE `+7.64%`, 20/20 episode 15 phút dương nhưng chỉ có tín hiệu
  trên 2/7 ngày.
- Nhãn `LONG CORR REBOUND` chỉ được gắn khi Stage 3 hiện tại là `WATCH` và snapshot trước
  entry khớp `LIQUID_KILL_ZONE · LONG · 15m · BTC_CORR_THEO · BTC_DOWN_WEAK ·
  NGUOC_BTC · GATE_TEST_LIQUID_LONG_BTC_COUNTER · DAY_FLAT · RSI4_RESET`.
- Nhãn không đọc kết quả của chính lệnh. Card thống kê theo range hiển thị closed/active,
  W/L, WR, PnL đóng, PnL active theo socket, AvgROE và PF; badge nằm cạnh Stage 3 trên
  paper table.
- Không thay Stage 3 tier và không đưa nhãn này vào điều kiện Stage 4/4B. Lệnh `RISK`
  luôn giữ `RISK` dù cùng market context.
- JSON cũ không bị rewrite. Lệnh mới append field tùy chọn `liquidLongCorrRebound*`;
  lịch sử cũ derive từ snapshot khi đọc, giữ nguyên top-level và tương thích reader cũ.
- `OBSERVE ONLY`: không Binance, không gate/chặn, không đổi entry, direction, size/margin,
  leverage, SL hoặc TP.

## 2026-08-02 - Stage 3C: nội suy 2 LONG + 4 SHORT từ combo ổn định

- Thêm version `LIQUID_STABLE_MECHANISM_V1_20260802` cho sáu nhãn
  `LONG SOFT-CORR REBOUND`, `LONG DECOUPLED RESET`, `SHORT CORR FADE CORE`,
  `SHORT FAILED BOUNCE`, `SHORT BEAR DRIVE` và `SHORT DECOUPLED HOT FADE`.
- Rule chỉ đọc dữ liệu có trước entry: combo Liquid Kill Zone 15m, side, corr bucket,
  BTC direction/score bucket, quan hệ với BTC, gate, day move từ BTC pct24h và RSI4h bucket.
  Không dùng PnL/outcome của lệnh để gắn nhãn.
- Hai cơ chế gộp nhiều cohort được giữ rõ điều kiện: `LONG DECOUPLED RESET` nhận
  `DAY_FLAT/DAY_NEG + RSI4_RESET`; `SHORT FAILED BOUNCE` nhận corr theo hoặc corr yếu nhưng
  bắt buộc `BTC_DOWN_WEAK + DAY_POS + RSI4_RESET + gate aligned`.
- Card Stage 3C thống kê toàn range trước pagination và PnL active realtime theo socket;
  nhãn xuất hiện cạnh Stage 3 trên cả Paper open/closed.
- `SHORT BEAR DRIVE` giữ tier `TEST`, `SHORT DECOUPLED HOT FADE` giữ `WATCH`; các nhãn còn
  lại là phân loại `GOOD` để quan sát, không phải gate hoặc quyền đánh thật.
- Không ảnh hưởng Binance/entry/direction/size/margin/leverage/SL/TP và không thay Stage 3B.
  JSON cũ không bị rewrite; lệnh mới append field tùy chọn `liquidStableMechanism*`, còn
  lịch sử derive từ snapshot với `DERIVED_ENTRY_SNAPSHOT` để giữ tương thích reader cũ.

## 2026-08-02 - Chỉ hiện Binance card khi AvgROE > 4%

- Thêm policy UI dùng chung `BINANCE_CARD_AVG_ROE_VISIBILITY_V1_20260802`: card phải có
  AvgROE đóng lớn hơn tuyệt đối `4.0%`; `4.0%`, thấp hơn hoặc no-data đều ẩn checkbox Binance.
- Liquid Scan truyền AvgROE vào metadata của mọi card và xóa toggle khỏi DOM khi không đủ
  ngưỡng. Short Edge và Recommended Signals nạp cùng guard nhưng không tự được thêm luồng
  order/whitelist mới vì hiện chưa có checkbox Binance theo card trên hai trang này.
- Whitelist Liquid nâng lên `LIQUID_LIVE_CARD_WHITELIST_V2_20260802`, bổ sung key
  `stable-mechanism:` để các card Stage 3C đủ ngưỡng có thể opt-in đúng cohort.
- Rule chỉ quyết định hiển thị, không tự sửa danh sách key đang bật. Không đổi snapshot,
  paper JSON, entry, size, leverage, SL/TP hoặc order master/dry-run hiện tại.

## 2026-08-02 - Filter Paper theo Stage 3C Stable Mechanism

- Thêm UI version `LIQUID_STABLE_MECHANISM_FILTER_V1_20260802` với sáu lựa chọn Stage 3C
  và `Tất cả`; dữ liệu đối chiếu là `liquidStableMechanismMatched/code` được gán từ snapshot
  trước entry theo `LIQUID_STABLE_MECHANISM_V1_20260802`.
- Filter chỉ thu hẹp các hàng Paper open/closed trong date range hiện tại. Các card Stage 3C
  vẫn thống kê toàn range trước pagination; PnL active vẫn chạy theo mark socket như trước.
- Badge Stage 3C vốn đã có trong ô Stage 3 được giữ cho cả open/closed, không tạo nhãn lặp.
- `OBSERVE ONLY`: không ảnh hưởng Binance/entry/direction/size/margin/leverage/SL/TP và không
  sửa JSON. Lịch sử cũ tiếp tục derive field tùy chọn lúc đọc, không bulk rewrite.

## 2026-08-02 - Stage 3B LONG Corr Rebound Binance opt-in

- Nâng whitelist lên `LIQUID_LIVE_CARD_WHITELIST_V3_20260802` và thêm key
  `long-corr-rebound:GOOD` cho card Stage 3B.
- Card chỉ hiện checkbox khi AvgROE đóng `> 4.0%`; mặc định không được chọn. Khi người dùng bật,
  chỉ tín hiệu Liquid Scan auto mới có snapshot trước entry khớp Stage 3B mới được xét tiếp.
- Điều kiện phân loại Stage 3B và paper test `$10` không đổi. Luồng Binance vẫn bắt buộc qua master
  order, dry-run, thời gian cấm, TP/SL, Market Health freshness, dedupe và kiểm tra position/order.
- Không tự bật, không hồi tố, không rewrite JSON, không thay entry/direction/paper size/SL/TP.
  Prefix mới chỉ mở quyền opt-in rõ ràng; các key whitelist cũ vẫn tương thích.

## 2026-08-02 - Whitelist Binance thống nhất Liquid / EMA / Short Edge / Recommended

- Nâng version lên `LIVE_CARD_WHITELIST_V4_20260802`; mở namespace `ema:`, `edge:` và
  `recommended:` bên cạnh toàn bộ key Liquid Scan hiện hữu. UI dùng controller chung để
  đồng bộ nhiều card cùng key và lưu qua whitelist atomic hiện tại.
- Điều kiện hiển thị giữ strict `closed AvgROE > 4.0%`; đúng 4%, no-data hoặc thấp hơn đều
  không render checkbox. Checkbox mặc định OFF và thao tác bật/tắt yêu cầu token Orders.
- Key của lệnh mới chỉ nội suy từ snapshot trước entry: combo/tier/label/cycle của nguồn,
  không dùng PnL/outcome tương lai của chính lệnh. Thống kê card, date range, pagination và
  mark socket active PnL không bị thay đổi.
- Khi đã opt-in, lệnh auto mới khớp OR ít nhất một key mới được xét Binance. Master order,
  dry-run, giờ cấm, TP/SL, Market Health freshness, dedupe, position/open-order và max position
  vẫn là khóa bắt buộc; không có card nào được tự bật.
- Có ảnh hưởng Binance thật theo cấu hình margin/leverage whitelist khi toàn bộ điều kiện đạt;
  không đổi thuật toán sinh entry, side, paper size hoặc giá SL/TP. Recommended clone mới,
  EMA và Short Edge ghi audit `liveCard*` tùy chọn trước khi persist.
- Không bulk rewrite hoặc chuyển schema JSON. Whitelist vẫn dùng `enabledKeys`, giới hạn 2.000;
  JSON cũ thiếu field audit được hiểu là chưa xét và mọi reader cũ vẫn có thể bỏ qua field mới.

## 2026-08-02 - Whitelist hai bước: ứng viên tại card, lệnh thật tại Orders

- Nâng version `LIVE_CARD_WHITELIST_V5_20260802`. Checkbox đủ closed `AvgROE > 4%` trên bốn trang
  tín hiệu nay chỉ ghi whitelist ứng viên `data/liquid-live-card-whitelist.json`; label UI đổi thành
  `WHITELIST` để không bị hiểu là đã bật Binance.
- Thêm khu vực `Card Whitelist · Quyền lệnh thật` trên Orders. Checkbox `LỆNH THẬT` lưu riêng, atomic
  vào `data/live-card-real-enabled.json`, được bảo vệ bằng Orders token. File mặc định rỗng và không
  kế thừa các key V4, nên triển khai không tự mở lệnh thật.
- Phân loại key vẫn dùng snapshot trước entry của Liquid/EMA/Short Edge/Recommended; thống kê và PnL
  realtime không đổi. Chỉ tập key thực mới được luồng đặt lệnh đọc; gỡ ứng viên sẽ prune quyền thật.
- Binance chỉ có thể bị ảnh hưởng sau xác nhận bước hai và vẫn qua Order Enabled, Dry Run, giờ cấm,
  TP/SL, Market Health freshness, dedupe, position/open order và max positions. Không đổi entry, side,
  paper size, margin/leverage rule, SL hoặc TP; không hồi tố.
- Không rewrite paper JSON hay phá schema cũ. V4 `enabledKeys` được giữ làm ứng viên, file real-enabled
  là cấu hình additive. Frontend/API chuyển sang parse phản hồi an toàn để lỗi HTML proxy không còn
  hiện dưới dạng `Unexpected token '<'`.

## 2026-08-02 - Live card MARKET lifecycle theo entry và bot close

- Version chạy: `LIVE_CARD_BINANCE_LIFECYCLE_V1_20260802`.
- Snapshot trước entry: key whitelist hai bước, paper/source id, source page và source gốc, symbol/side,
  margin/leverage cấu hình, TP/SL tín hiệu. Phân loại nguồn lưu riêng `liquid`, `ema`, `pump`, `short-edge`,
  `recommended`; Recommended còn giữ `originSourceType` để biết clone đến từ nguồn nào.
- Entry thật chỉ phát khi paper vào `OPEN`: paper `PENDING` chờ socket chạm entry rồi mới Binance MARKET;
  source đã OPEN gửi MARKET tại event mở. Không dùng LIMIT cho live-card lifecycle.
- Socket `ORDER_TRADE_UPDATE` đối chiếu cả `orderId/clientOrderId`; partial fill chỉ log, full fill mới gọi đặt
  TP/SL; fallback REST chỉ chạy khi xác nhận đủ vị thế nếu socket bỏ lỡ fill. Khi bot đóng paper, lifecycle gửi MARKET reduce-only/đúng hedge side với tối đa lượng bot đã fill,
  không đóng phần tăng thêm không thuộc bot.
- Thống kê: state atomic `data/live-card-binance-state.json`, event log append-only
  `data/live-card-binance-events.ndjson`, card thống kê trên Orders và API token-protected. Các event gồm
  requested/submitted/partial/full/protection/bot-close/position-closed/error để phân tích hiệu quả theo nguồn.
- Ảnh hưởng Binance/entry/size/SL/TP: có ảnh hưởng thật chỉ cho card đã bật `LỆNH THẬT`; entry đổi sang MARKET
  tại đúng paper fill, TP/SL giữ nguyên giá nhưng đặt sau full fill, bot close dùng MARKET. Không đổi side,
  paper size, rule nhãn/tier/stat, margin/leverage cấu hình, master/dry-run/dedupe/giờ cấm/max position.
- JSON cũ: không bulk rewrite hay đổi schema paper. Field lifecycle mới đều optional; lịch sử thiếu field vẫn
  đọc bình thường và không được auto-close. State/event lifecycle là file mới độc lập, nên lỗi lifecycle không
  phá cấu trúc JSON tín hiệu hiện có.
- Bổ sung toggle hiển thị rõ trên card `LIQUID COMBO × CYCLE · ỔN ĐỊNH QUA NGÀY` khi closed AvgROE
  `> 4%`; key dùng snapshot combo/cycle trước entry. Toggle chỉ ghi whitelist ứng viên, không tự mở
  Binance và không thay thống kê, entry, size, SL/TP hoặc paper JSON.

## 2026-08-02 - Giảm tải Pump persistence và retry Binance

- Version `PUMP_PAPER_WAL_V1_20260802`: giữ nguyên snapshot JSON và toàn bộ lịch sử thống kê, nhưng mutation
  realtime được append vào `pump-paper-trades.wal.ndjson`; startup replay theo `trade.id`. Không còn ghi lại
  snapshot Pump hàng trăm MB mỗi khi fill/đóng/trailing thay đổi.
- Version `BINANCE_AUTH_CIRCUIT_V1_20260802`: signed REST bị tạm ngắt 5 phút sau lỗi `-2015`; public REST/socket
  không bị chặn. Mục tiêu là tránh queue retry làm Orders API timeout.
- Không thay dữ liệu dùng trước entry hoặc cách phân loại nhãn/tier; thống kê vẫn chạy trên snapshot + WAL đầy đủ.
  Không thay Binance whitelist, entry, side, size, margin/leverage, SL/TP hay bot-close. JSON cũ không rewrite;
  WAL là lớp additive và dòng cuối không hoàn chỉnh được bỏ qua an toàn.

## 2026-08-02 - Discord cho fill lệnh thật

- Version `REAL_ORDER_FILL_DISCORD_V1_20260802`: cấu hình webhook riêng bằng `ORDER_FILL_WEBHOOK_URL`.
- Chỉ gửi một lần khi user-data socket xác nhận `ORDER_TRADE_UPDATE/TRADE` đã `FILLED`, mở hoặc tăng vị thế
  thật và không phải reduce-only close. Partial fill không gửi; lỗi Discord không ảnh hưởng order hay TP/SL.
- Không đổi tín hiệu, nhãn/tier, thống kê, entry/side/size/margin/leverage/SL/TP, whitelist hoặc JSON.

## 2026-08-02 - Binance background ưu tiên credential `.env`

- Version `BINANCE_BACKGROUND_CREDENTIAL_PRIORITY_V1_20260802`.
- Orders request có token tiếp tục dùng credential của phiên đăng nhập. Socket, auto-order, position monitor và
  TP/SL background không token luôn ưu tiên credential cố định trong `.env`; session chỉ là fallback khi `.env` thiếu.
- Ngăn localStorage/phiên Orders cũ gây `-2015` cho toàn bộ background sau khi tự đăng nhập lại.
- Không thay tín hiệu, nhãn/tier, thống kê, whitelist, side, entry, size/margin, leverage, SL/TP hoặc JSON.

## 2026-08-03 - Khóa Binance PPKS và tự hồi phục REST queue

- Version `PPKS_BINANCE_HARD_OFF_V1_20260803`: `post-pump-kill-short` chỉ còn scan/paper/Discord tín hiệu/
  thống kê; Binance hard OFF bất kể env legacy. Không thay setup, score, side, paper entry, size, SL/TP.
- Version `BINANCE_REST_RECOVERY_V2_20260803`: GET giống nhau được coalesce, request queued quá 45 giây bị
  loại, task active treo quá 30 giây tự nhả slot; read request drop nhanh khi congested còn mutation lệnh
  thật vẫn ưu tiên cao. Signed timestamp tạo lúc dequeue thay vì lúc enqueue.
- Bổ sung single-flight cho balance, daily PnL, symbols, open orders; BTC monitor và position REST sync không
  overlap. `activeTop` cho biết source/endpoint/age của task active để chẩn đoán queue.
- Binance REST alert chỉ dùng `BINANCE_REST_ALERT_WEBHOOK_URL`; nếu URL này trùng webhook PPKS thì alert bị
  bỏ qua, không rơi vào kênh chiến lược PPKS.
- Không đổi nhãn/tier/gate/stat của các trang khác, không dùng dữ liệu sau entry, không rewrite hay đổi schema
  JSON cũ. Ảnh hưởng Binance chỉ là loại bỏ hoàn toàn PPKS và tăng an toàn/khả năng hồi phục REST chung.

## 2026-08-03 - Khóa toàn bộ auto entry ngoài card checked tại Orders

- Version `LIVE_CARD_ONLY_V1_20260803`: matcher dùng whitelist ứng viên + danh sách `LỆNH THẬT` trước entry rồi
  cấp authorization nội bộ cho đúng request auto. Field/source giả không thể đi vòng khóa trung tâm.
- AutoTrader, Pump Auto, AutoLiq/AutoProbe, EMA real cũ, Shakeout real, dump-risk và Avg-down đều bị tắt; paper,
  snapshot, nhãn/tier và thống kê vẫn chạy. Manual Orders cùng TP/SL/protection/bot-close cho vị thế đã mở được giữ.
- Không đổi entry MARKET/size/leverage/SL/TP của live-card, không rewrite JSON và không thêm field bắt buộc; env cũ
  thiếu `LIVE_CARD_WHITELIST_ONLY_AUTO_BINANCE` mặc định vẫn an toàn ở chế độ chỉ card checked.

## 2026-08-03 - Báo Discord khi live-card Binance thất bại

- Version `LIVE_CARD_BINANCE_FAIL_DISCORD_V1_20260803`: chỉ card đã bật hai bước và khớp tín hiệu auto mới được
  báo lỗi; card quan sát/không khớp không gửi.
- Gửi vào `LIVE_CARD_ORDER_WEBHOOK_URL`, fallback `ORDER_FILL_WEBHOOK_URL`, khi preflight signed REST lỗi, submit
  MARKET lỗi hoặc kết quả không `submitted`. Embed có nguồn/card/symbol/side/lỗi và trạng thái REST gate, không có
  credential; chống trùng 30 phút.
- Lỗi Discord không chặn hoặc retry order. Không đổi tín hiệu, thống kê, entry/side/size/margin/leverage/SL/TP,
  whitelist, bot-close hay JSON cũ; audit lỗi mới chỉ giữ lại matched keys/version trong các field optional sẵn có.

## 2026-08-03 - Signal TP/SL bất biến cho live-card

- Version `LIVE_CARD_SIGNAL_PROTECTION_V1_20260803`.
- Snapshot trước entry: source/page, card checked, symbol/side và TP/SL nguyên bản của tín hiệu. Phân loại áp dụng
  khi source là `live-card-whitelist-*`; không dùng dữ liệu tương lai và không tạo nhãn/tier/stat mới.
- Full fill đặt TP đúng giá signal bằng `CONTRACT_PRICE`, SL đúng giá signal bằng `MARK_PRICE`. AutoTP chỉ khôi phục
  TP signal; không fallback TP cố định. Hai đường trailing SL chung và negative-TP guard không quản lý vị thế này;
  nhánh phục hồi max-stop cũng dùng lại `signalSl` thay vì SL ROE. `REST_SYNC` sau restart dựng protection plan từ
  `sl-tracking` rồi khôi phục đúng cặp giá signal, không gọi fallback guard mặc định.
- Có ảnh hưởng Binance exit thật cho đúng vị thế live-card; không đổi entry MARKET, side, size/margin, leverage,
  gate, dedupe, bot-close hay thống kê paper. Lệnh manual/nguồn khác giữ nguyên cơ chế cũ.
- JSON tương thích ngược: field policy/working-type đều optional, không bulk rewrite. Record cũ có
  `signalSource=live-card-whitelist-*` vẫn tự nhận diện; record cũ khác nguồn giữ default `MARK_PRICE`.

## 2026-08-03 - Cô lập và tự hồi phục lỗi Binance `-2015`

- Version `BINANCE_AUTH_CIRCUIT_SCOPED_RECOVERY_V2_20260803`: circuit được tách theo loại auth; signed REST dùng
  fingerprint cặp API key+secret, listen-key socket dùng fingerprint API key riêng. Credential/session lỗi chỉ loại
  queue của chính nó, không khóa credential `.env`, session khác hoặc vô tình được listen-key success xóa lỗi.
- Trong block, mỗi credential thử hồi phục tối đa một lần mỗi 15 giây; request signed thành công đóng circuit sớm.
  Log, runtime snapshot và alert Discord live-card ghi fingerprint rút gọn + source/method/path/probe ETA, tuyệt
  đối không ghi key/secret.
- Không đổi dữ liệu trước entry, nhãn/tier/gate/stat, side, MARKET entry, size/margin, leverage, TP/SL, bot-close,
  whitelist hay dedupe. Tín hiệu đã fail không tự replay trễ; thay đổi chỉ giúp các request mới hồi phục sớm.
- Không rewrite hoặc thay schema JSON cũ. `authBlocks` là field additive của snapshot gate runtime; hai field tổng
  hợp auth circuit cũ vẫn giữ để frontend/monitor cũ tiếp tục hoạt động.

## 2026-08-03 - Orders login có Binance preflight

- Version `ORDERS_AUTH_PREFLIGHT_V1_20260803`: `/api/auth` gọi Futures balance read-only trước khi cấp session token;
  credential bị `-2015` không còn được nhận là đăng nhập thành công.
- Login preflight dùng gate tách biệt khỏi auto-order/position protection và cache fingerprint bị từ chối 1 giờ;
  tab cũ retry không thể mở circuit của credential `.env` hoặc tạo thêm signed REST spam.
- Auto re-auth thất bại xóa token + credential cũ trong localStorage và hiện lại form đăng nhập, ngăn tab Orders
  polling vô hạn bằng key/secret cũ.
- Không đặt lệnh, không đổi tín hiệu/nhãn/tier/stat, entry/side/size/leverage/TP/SL/bot-close/whitelist và không
  thay hoặc rewrite JSON cũ.

## 2026-08-03 - Live-card dùng margin 3 USDT

- Version `LIVE_CARD_REAL_MARGIN_3_USDT_V1_20260803`.
- Sau khi tín hiệu khớp card đã bật `LỆNH THẬT`, lệnh mới dùng `LIVE_CARD_REAL_MARGIN_USDT=3`; leverage giữ 10x,
  tương ứng notional mục tiêu khoảng 30 USDT trước khi làm tròn quantity theo symbol.
- Không đổi dữ liệu trước entry, phân loại/nhãn/tier/gate, thống kê paper, side, MARKET entry, TP/SL tín hiệu,
  whitelist, dedupe, max positions hoặc bot-close. Vị thế đang mở không bị resize.
- Không rewrite JSON và không thêm field bắt buộc; lifecycle mới dùng field `marginUsdt` hiện hữu, record cũ giữ
  nguyên dữ liệu lịch sử.

## 2026-08-04 - Nhãn LONG SPRING cho Short Edge

- Versions `edge-short-long-spring-observe-v1-20260804` và
  `edge-short-long-spring-whitelist-v1-20260804`; nhãn dùng duy nhất snapshot trước entry: setup/side,
  entry-TP-SL, nến alt/BTC đã đóng và market point LONG/SHORT.
- `LONG SPRING CONFIRMED` = `LONG + SC_SPRING + ALT BULLISH + BTC BULLISH + SHORT-LONG gap >= 15`.
  `LONG SPRING PRIME` là tập con có thêm RR `abs(tp-entry)/abs(entry-sl) < 0.7`.
- Short Edge hiển thị hai card thống kê bao hàm và badge trên Paper; thống kê gồm lệnh/WR/PF/PnL đóng/PnL active/
  tổng PnL/AvgROE/ngày dương theo Bangkok. PRIME vẫn nằm trong số liệu CONFIRMED để giữ đúng hai cohort backtest.
- Nhãn vẫn `OBSERVE ONLY`; card có checkbox WHITELIST khi AvgROE đóng `> 4%`. Đây chỉ là bước ứng viên. Chỉ khi
  bật thêm `LỆNH THẬT` tại Orders, tín hiệu mới khớp key `edge:long-spring:CONFIRMED|PRIME` mới được đi vào lifecycle
  Binance hiện hữu; toàn bộ master/dry-run/health/dedupe/max-position/TP-SL vẫn áp dụng và không có hồi tố.
- Không đổi entry/size/margin/leverage/SL/TP/gate. Lệnh mới ghi field optional `edgeShortLongSpring*`; JSON cũ được
  derive khi đọc, không rewrite hoặc phá schema. Whitelist được lưu riêng, không chèn vào paper JSON.

## 2026-08-04 - Sửa combo Short Edge không khớp whitelist khi entry còn OPEN

- Version `LIVE_CARD_COMBO_ENTRY_MATCH_V1_20260804`. Matcher tạo `edge:combo:*` trực tiếp từ combo snapshot trước
  entry; không còn dùng bucket thống kê yêu cầu `closed > 0` để tạo authorization key cho lệnh mới.
- Đây là sửa lỗi khớp key, không đổi cách sinh combo, nhãn/tier/gate hoặc thống kê. Card UI vẫn dùng toàn bộ lịch
  sử đóng để tính PnL/WR/PF/AvgROE và vẫn chỉ hiện WHITELIST khi qua ngưỡng chung.
- Chỉ tín hiệu Short Edge mới sau triển khai mới được hưởng sửa lỗi. Tín hiệu cũ `NO_CARD_MATCH` không replay;
  checkbox không tự bật. Binance vẫn yêu cầu đồng thời whitelist ứng viên + `LỆNH THẬT` Orders và mọi khóa
  master/dry-run/giờ cấm/health/dedupe/position/open-order/max-position/TP-SL.
- Có thể ảnh hưởng Binance entry thật vì combo được chọn nay khớp đúng tại thời điểm OPEN, nhưng không đổi side,
  MARKET entry, margin/size, leverage, TP/SL tín hiệu hoặc bot-close. JSON cũ không rewrite; chỉ audit mới có field
  optional `liveCardComboEntryMatchVersion`, reader cũ có thể bỏ qua an toàn.

## 2026-08-04 - Orders thống kê lifecycle theo whitelist + Binance closed PnL

- Versions `LIVE_CARD_BINANCE_LIFECYCLE_V2_20260804` và
  `LIVE_CARD_WHITELIST_PNL_STATS_V1_20260804`.
- Cohort dùng đúng `matchedKeys` snapshot trước entry; không dùng source gộp hoặc PnL tương lai để phân loại.
  Một lệnh khớp nhiều card được ghi ở từng card, vì vậy các hàng không phải tổng loại trừ lẫn nhau.
- PnL đóng lấy từ Binance income theo symbol và cửa sổ lifecycle:
  `REALIZED_PNL + COMMISSION + FUNDING_FEE`. Chỉ khi có income `REALIZED_PNL` mới coi PnL đã đối soát; thiếu dữ
  liệu hiển thị rõ, không lấy PnL paper thay thế. Signed read-only income được cache 60 giây và nhường REST gate
  khi đang congestion.
- Thay đổi chỉ là hậu kiểm/stat trên Orders, không tác động Binance entry/side/size/margin/leverage/SL/TP,
  bot-close, gate, whitelist hay dedupe. JSON cũ tương thích ngược bằng các field lifecycle optional
  `closedPnl*`; không rewrite paper/snapshot/whitelist.

## 2026-08-04 - Discord fill hiển thị whitelist/combo thật

- Version `BINANCE_FILL_WHITELIST_CONTEXT_V1_20260804`.
- Mỗi Discord full-fill mới hiển thị riêng exact `matchedKeys`, combo snapshot trước entry, execution page,
  lifecycle ID và raw detector ID. Chuỗi như `emasq-5m-*` được ghi đúng là raw signal ID, không còn bị trình bày
  như tên card whitelist.
- Lifecycle mới append `signalCombo` optional; reader cũ vẫn dùng được và không có bulk rewrite JSON.
- Chỉ đổi audit/khả năng kiểm tra lệnh; không đổi phân loại, whitelist matcher, Binance entry/side/size/margin/
  leverage/TP/SL/bot-close, gate, dedupe hoặc thống kê.

## 2026-08-04 - Open Positions realtime theo Binance socket

- Version `ORDERS_POSITION_PNL_STREAM_V1_20260804`: Orders lấy position amount/entry từ Binance user-data socket,
  ghép mark price mỗi giây và stream full-precision mark/unrealized PnL/ROE xuống table; REST chỉ là snapshot và
  fallback. DCA/fill/close không còn phải chờ cache REST 30-60 giây mới phản ánh lên màn hình.
- Công thức hiển thị PnL Futures là `(mark-entry)*signed positionAmt`; ROE display dùng position initial margin.
  Giá đã format chỉ dùng để render, không được đưa ngược vào phép tính.
- `managementRoe` của runtime được giữ riêng, nên không đổi avg-down/trailing/timeout hoặc bất kỳ quyết định
  Binance nào. Không đổi tín hiệu/nhãn/tier/gate/stat, whitelist, entry/side/size/leverage/TP/SL/bot-close và
  không rewrite hay mở rộng schema JSON cũ.
## 2026-08-04 - Tăng trần vị thế whitelist lên 30

- Version `LIVE_CARD_MAX_OPEN_POSITIONS_V2_20260804` nâng `LIVE_CARD_REAL_MAX_POSITIONS` từ fallback `10` lên `30`.
- Chỉ áp dụng cho entry Binance mới đã qua hai bước card whitelist + bật `LỆNH THẬT`; dữ liệu kiểm tra là danh sách vị thế mở Binance tại preflight.
- Không mở lại các nguồn auto ngoài whitelist và không đổi margin, leverage, entry MARKET, dedupe, TP/SL hay cách thống kê PnL.
- Không thay đổi cấu trúc hoặc nội dung JSON lịch sử.

## 2026-08-05 - Edge paper journal-first, Binance không vượt mất lịch sử bot

- Version `EDGE_PAPER_ENTRY_JOURNAL_V1_2026_08_05` sửa race đọc-sửa-ghi khi nhiều Edge signal OPEN/fill đồng
  thời. Bot fsync `PREPARED` theo `paperTradeId` trước Binance, sau phản hồi mới upsert row trên store mới nhất và
  fsync `COMMITTED`; create/fill/close/delete cùng đi qua transaction queue.
- Khi restart, journal chỉ khôi phục paper row bị thiếu hoặc patch OPEN chưa commit; không replay lệnh Binance.
  Tombstone `DELETED` ngăn phục hồi row người dùng đã xóa. Backfill candle Edge cũng merge field theo ID thay vì
  ghi đè full snapshot cũ.
- Không đổi dữ liệu/snapshot trước entry, điều kiện nhãn/tier/card, cách thống kê, whitelist/gate, MARKET entry,
  side, margin/size, leverage, dedupe, max positions, TP, SL hoặc bot-close. Thay đổi có ảnh hưởng đường thực thi
  Binance ở mức durability/order sequencing, không mở thêm tín hiệu và không cấp quyền Binance mới.
- `edge-paper-trades.json` giữ nguyên schema `{ trades: [] }`; journal NDJSON là file phụ additive, chịu được dòng
  cuối dở dang và version lạ. Lịch sử JSON cũ không bị rewrite hay yêu cầu migration.

## 2026-08-08 - Liquid LONG BTC Expansion Candidate

- Version `LIQUID_LONG_BTC_EXPANSION_V1_20260808`. Snapshot trước entry dùng side, BTC phase, Stage 3, target kind,
  nến BTC đã đóng và Market Point; không dùng PnL/ROE/outcome tương lai.
- Nhãn = `LONG + BTC_UP_STRONG + Stage 3 RISK + target != MAIN_ZONE`. Ba badge `BTC CANDLE CONFIRMED`,
  `POINT ALIGNED`, `FAR RUNNER` là tập con giải thích context, không phải tier/gate riêng.
- UI thống kê closed/open/pending, net PnL, WR, AvgROE, PF và snapshot/backfill theo date range.
- Nhãn vẫn `OBSERVE ONLY`; từ whitelist V6 card có key/checkbox ứng viên khi closed AvgROE `> 4%`. Mặc định tắt và
  chỉ có thể ảnh hưởng entry Binance sau khi cùng key được bật thêm `LỆNH THẬT` tại Orders.
- Lệnh mới lưu field optional `liquidLongBtcExpansion*`; JSON cũ được derive khi đọc, không rewrite, thiếu dữ liệu
  thì `UNRATED`.

## 2026-08-08 - Liquid LONG Expansion Selected / Prime Test

- Nâng version lên `LIQUID_LONG_BTC_EXPANSION_V2_20260808`. Snapshot trước entry bổ sung `signalPoint` và
  `entryPlan.killZoneCluster.oneSidedPct`; không dùng PnL/ROE/outcome/exit tương lai.
- `EXPANSION SELECTED` = Candidate + `70 <= signalPoint < 90`; `EXPANSION PRIME TEST` = Candidate +
  `70 <= signalPoint < 80`. `ONE-SIDED 90+` chỉ là badge xác nhận, không phải gate.
- Backtest 26/07–08/08 tại lúc triển khai: Selected `72` lệnh, WR `68.1%`, PF `1.95`; Prime Test `19` lệnh,
  WR `73.7%`, PF `3.21`. Episode 15 phút lần lượt là `53`/WR `67.9%`/PF `2.30` và
  `18`/WR `72.2%`/PF `3.56`. Prime giữ trạng thái TEST vì
  cỡ mẫu nhỏ và chưa có cohort ở cửa sổ 14 ngày liền trước để kiểm tra out-of-sample.
- UI thêm card riêng và badge cao nhất trên dòng trade. Tất cả vẫn `OBSERVE ONLY`; whitelist V6 bổ sung key/checkbox
  ứng viên khi closed AvgROE `> 4%`, mặc định tắt. Chỉ cơ chế hai bước với `LỆNH THẬT` Orders mới có thể cấp Binance.
- JSON V1/cũ không bị rewrite: reader derive V2 từ snapshot sẵn có và chỉ thêm field optional trong response; thiếu
  `signalPoint` thì vẫn có thể là Candidate nhưng không được gán Selected/Prime.

## 2026-08-08 - Liquid Combo BTC-Breadth LONG/SHORT

- Versions `LIQUID_COMBO_BTC_BREADTH_V1_20260808` và `LIQUID_COMBO_CYCLE_STATS_V4_20260808`.
- Nhãn chỉ dùng dữ liệu causal trước entry: exact combo-cycle có tối thiểu 12 closed/6 episode/3 ngày và đạt
  `STABLE_GOOD`; coin candle `DOJI`; `|sweepDistancePct| < 1%`; Market Direction snapshot có
  `sampleKey <= entryAt`; BTC return 1h cùng chiều side; breadth cùng chiều dẫn ít nhất 2/3 khung 1h/3h/6h.
- Tách side rõ ràng: SHORT đồng thuận nhận `LIQ COMBO SHORT · BTC-BREADTH PRIME TEST`; LONG đồng thuận nhận
  `LIQ COMBO LONG · BTC-BREADTH WATCH / LOW SAMPLE`. PRIME TEST và WATCH đều chỉ là nhãn quan sát, không phải gate.
- Combo-cycle V4 nhóm ngày theo `Asia/Bangkok` thay cho UTC; điều kiện stable/recent và episode 15 phút giữ nguyên.
- Parity runtime 26/07–08/08: SHORT `15` lệnh, WR `93.3%`, PF `3.31`, AvgROE `+3.20%`, `6/7` ngày dương;
  holdout từ 03/08 là `9` lệnh, WR `88.9%`, PF `1.33`. LONG `9` lệnh, WR `100%` nhưng toàn bộ nằm trong một ngày,
  nên chưa được nâng khỏi WATCH.
- UI thêm Stage 3E với hai card LONG/SHORT và badge trên trade row; thống kê closed/open/pending, net PnL, WR,
  AvgROE, PF, snapshot/backfill. Whitelist V6 bổ sung key riêng theo side/tier và checkbox khi closed AvgROE `> 4%`;
  mặc định tắt, Binance chỉ được xét sau khi cùng key bật thêm `LỆNH THẬT` tại Orders.
- Lệnh mới lưu `marketDirectionAtSignal` cùng field optional `liquidComboBtcBreadth*`. JSON cũ không rewrite;
  reader backfill từ signal log theo `tradeId`, chỉ nhận sample causal và trả `UNRATED` khi thiếu dữ liệu.
## 2026-08-08 - Hien co dinh Stage 3E theo tung side

- UI version `LIQUID_COMBO_BTC_BREADTH_UI_V1_1_20260808` giu hai card
  `LIQ COMBO LONG · BTC-BREADTH WATCH` va `LIQ COMBO SHORT · BTC-BREADTH PRIME TEST` luon hien.
- Khoang ngay khong co mau se hien `NO DATA / 0 lenh`; cach lay du lieu truoc entry, dieu kien phan loai va cach
  tinh WR/PF/AvgROE khong doi. Khong tao trade ao va khong anh huong Binance/entry/size/SL/TP.
- JSON cu van duoc doc va backfill causal theo co che V1; nhan van la `OBSERVE ONLY`, khong phai gate giao dich.

## 2026-08-08 - Whitelist V6 cho cac nhan thong ke moi

- `LIVE_CARD_WHITELIST_V6_20260808` noi checkbox cho toan bo card Stage 3D BTC Expansion va Stage 3E Combo BTC Breadth.
- UI key va runtime matcher dung chung `long-btc-expansion:<CODE>` va
  `combo-btc-breadth:<SIDE>:<TIER>`; checkbox mac dinh tat, chi hien khi closed AvgROE `> 4%`.
- Khong doi snapshot truoc entry, dieu kien nhan hay cong thuc thong ke. JSON paper cu khong rewrite; prefix moi additive
  va whitelist key cu giu nguyen.
- Nhan van `OBSERVE ONLY`; chi khi bat them dung key `LENH THAT` tai Orders va moi preflight dat thi Binance moi co
  the mo entry. Khong doi size/leverage/SL/TP.
## 2026-08-08 - Orders: history lệnh thật và hiệu quả từng whitelist key

- Nâng stats lên `LIVE_CARD_WHITELIST_PNL_STATS_V2_20260808`; lifecycle schema vẫn V2.
- API trả thêm overview unique lệnh bot đã fill và mỗi whitelist key có W/L, WR, PF, Avg NET cùng NET Binance sau
  realized PnL, commission và funding. Exact `matchedKeys` được chụp trước entry, không relabel bằng config hiện tại.
- Orders thêm bảng history tối đa 500 lệnh đã fill với giờ Bangkok, symbol/side, nhãn whitelist, trạng thái, entry,
  margin/leverage, TP/SL, NET PnL và order ID. Một lệnh khớp nhiều key không được cộng chéo giữa các hàng thống kê.
- Chỉ là audit/read-only: không đổi signal, whitelist, `LỆNH THẬT`, Binance entry, size, leverage, SL, TP hay bot-close.
  JSON/NDJSON cũ không rewrite; thiếu closed income được giữ ở nhóm PnL missing.

## 2026-08-08 - Báo Discord khi Binance chặn API key/IP

- Thêm `BINANCE_AUTH_DISCORD_ALERT_V1_20260808`: monitor đọc signed REST auth circuit và phát
  `[BINANCE AUTH BLOCKED]` một lần theo `scope + openedAt` khi Binance trả `-2015`.
- Cảnh báo dùng kênh lệnh thật/tín hiệu đã có: `LIVE_CARD_ORDER_WEBHOOK_URL` -> `ORDER_FILL_WEBHOOK_URL` ->
  `BINANCE_REST_ALERT_WEBHOOK_URL`; kèm source, endpoint, lỗi Binance và ETA probe. Probe lỗi tiếp không gây spam.
- Không thay đổi dữ liệu/điều kiện nhãn trước entry, cách thống kê, whitelist, gate giao dịch, Binance entry, size,
  leverage, SL hoặc TP. Chỉ append `openedAt` vào snapshot in-memory; không rewrite JSON cũ.

## 2026-08-08 - Orders V3: đối chiếu lệnh thật với paper gốc theo nhãn

- Nâng `LIVE_CARD_WHITELIST_PNL_STATS_V3_20260808`. Mỗi lifecycle Binance đã fill được exact-map bằng
  `paperTradeId + originSourceType`, rồi kiểm tra symbol/side với paper gốc Liquid hoặc Short Edge.
- Mỗi key whitelist có card Binance/Paper cùng cohort: W/L, WR, PF, AvgROE, PnL, số mapped/missing và delta; history
  thêm status/outcome/PnL/ROE paper. Không ghép gần đúng record thiếu ID; snapshot hiện tại map `164/204`, thiếu `40`.
- Không tạo label mới. Card dùng key hiện hữu và có checkbox `LỆNH THẬT` khi key còn là ứng viên; historical key không
  tự có quyền. Đây là audit read-only, không đổi entry, size, leverage, SL/TP, bot-close hay JSON cũ; API chỉ append
  field derive `paperOriginal` và stats so sánh.

## 2026-08-09 - Giảm độ trễ live-card entry

- Thêm `LIVE_CARD_ENTRY_FAST_PATH_V1_20260809`. Nhãn/tier và toàn bộ điều kiện pre-entry giữ nguyên; thay đổi chỉ tối
  ưu đường Binance sau khi exact whitelist + `LỆNH THẬT` đã đạt.
- Preflight positions/open-orders dùng priority 1 và namespace dedupe riêng; open-orders chỉ query symbol (weight 1
  thay cho toàn account weight 40). `placeOrder` tái sử dụng positions cho max-position, và skip `setLeverage` khi
  leverage hiện tại đã đúng. Các mutation Binance vẫn priority 0, concurrency/rate limit chung không đổi.
- Path phổ biến giảm request weight khoảng `53 -> 8`. Lifecycle mới ghi timestamp preflight/order cùng cờ positions
  reused/leverage skipped để đo latency thực tế.
- Có ảnh hưởng thời điểm submit theo hướng nhanh hơn nhưng không đổi entry permission, MARKET type, margin/notional,
  leverage mục tiêu, quantity rounding, TP, SL hay bot-close. JSON cũ không rewrite; field mới optional.

## 2026-08-09 - Bóc bộ SHORT UTAD theo cấu trúc LONG SPRING

- Thêm `edge-short-utad-observe-v1-20260809`, dùng đúng snapshot trước entry: side, setup `BC_UTAD`, nến ALT/BTC,
  Market Direction point và RR từ entry/TP/SL; không nhìn outcome/PnL/ROE tương lai.
- `SHORT UTAD CONFIRMED` yêu cầu SHORT, ALT + BTC cùng BEARISH và `LONG-SHORT gap >= 0`.
  `SHORT UTAD PRIME TEST` là tập con thêm gap `>= 5` và RR `< 0.7`.
- Backtest paper 14 ngày: Confirmed `34` closed, WR `85.3%`, PF `1.65`, AvgROE `+2.86%`, `7/11` ngày dương;
  Prime Test `20` closed, WR `95.0%`, PF `4.59`, AvgROE `+5.39%`, `8/9` ngày dương. Holdout tuần sau Prime có
  `7W/0L`, nhưng cohort Binance exact-map mới chỉ `3` filled/`2` closed-known, nên nhãn vẫn `OBSERVE ONLY`.
- UI thêm hai card/badge và whitelist V7 với key `edge:short-utad:CONFIRMED` / `edge:short-utad:PRIME_TEST`.
  Checkbox mặc định tắt, chỉ hiện khi closed AvgROE `> 4%`; muốn vào Binance vẫn phải bật thêm đúng key
  `LỆNH THẬT` tại Orders.
- Thống kê inclusive/subset gồm active/pending/closed, W/L, WR, PF, PnL, AvgROE và ngày dương Bangkok. Nhãn không
  tự ảnh hưởng Binance, entry, size, leverage, SL hoặc TP; không được mô tả như gate giao dịch thật.
- Trade mới lưu optional `edgeShortUtad*`; JSON cũ được derive khi đọc, không rewrite. Thiếu dữ liệu causal thì không
  gán Prime Test và consumer cũ tiếp tục bỏ qua field mới.

## 2026-08-09 - Fill-anchor V2, SHORT time-stop và live-card stats tách LONG/SHORT

- Version: `LIVE_CARD_SIGNAL_PROTECTION_V2_20260809`, `LIVE_CARD_FILL_ANCHORED_PROTECTION_V1_20260809`,
  `LIVE_CARD_SHORT_TIME_STOP_V1_20260809`, `LIVE_CARD_WHITELIST_PNL_STATS_V4_20260809_SIDE_SPLIT`.
- Trước entry chỉ snapshot exact whitelist key, side, signal/paper entry, TP và SL; derive khoảng cách TP/SL từ bộ giá
  causal này, không dùng PnL/outcome hay dữ liệu tương lai. Khi full fill, bot neo lại cùng khoảng cách phần trăm quanh
  Binance `avgPrice` cho LONG/SHORT; không đặt TP 5%/10% chung.
- SHORT live-card ở trạng thái còn mở được fail-safe đóng MARKET sau `24h` mặc định; thời gian và nhịp quét cấu hình
  bằng env, LONG bị loại, `BOT_CLOSE_FAILED` được phép retry. Đây là rule thoát live thật, không phải nhãn quan sát.
- Mỗi exact whitelist card derive thống kê Binance và paper same-cohort riêng `SHORT`/`LONG`, nhưng vẫn dùng đúng một
  key và một checkbox `LỆNH THẬT`; không tạo nhãn hay whitelist permission mới.
- Ảnh hưởng: không đổi gate, entry, margin/size, leverage hay quyền vào Binance; có đổi TP/SL live theo actual fill và
  có time-stop cho SHORT. UI side split chỉ thống kê, không tác động lệnh.
- JSON cũ không rewrite: thiếu fill-anchor metadata thì giữ nguyên TP/SL tuyệt đối; field/event mới đều optional,
  time-stop dùng lifecycle bot-close sẵn có, còn `sideStats` được derive lúc đọc nên consumer/store cũ vẫn tương thích.

## 2026-08-09 - Tắt tự động xóa regular LIMIT

- Version `LIMIT_ORDER_RETENTION_V1_20260809`; `AUTO_CANCEL_ENTRY_LIMIT_ORDERS=false` là mặc định.
- Không dùng snapshot/nhãn/PnL để phân loại: `LIMIT` và `LIMIT_MAKER` được giữ, không còn bị timeout 30 phút, đổi bias
  BTC hoặc cleanup sau khi vị thế cùng symbol đóng tự động xóa.
- Cleanup sau close vẫn hủy order không phải LIMIT và conditional/algo TP/SL. Cancel từng lệnh và Cancel all do người
  dùng chủ động vẫn hoạt động; đặt master switch `true` mới khôi phục auto-cancel theo BTC/timeout.
- Không tạo thống kê hay checkbox mới; log runtime ghi số protection cleanup và LIMIT retained. Không đổi entry price,
  gate, size, margin, leverage, SL hoặc TP; chỉ đổi vòng đời pending LIMIT trên Binance.
- Không thay đổi JSON/store cũ. `STALE_ORDER_TIMEOUT_MS` chỉ có hiệu lực khi master switch được bật rõ ràng.

## 2026-08-09 - Live-card Binance history realtime

- Version `LIVE_CARD_HISTORY_STREAM_V1_20260809` / `ORDERS_POSITION_PNL_STREAM_V2_20260809_LIVE_CARD`.
- Bảng gồm mọi lifecycle đã fill, tách số đang mở/đã đóng. Lệnh mở dùng fill, quantity, side, margin/leverage lifecycle
  cùng mark Binance socket để hiển thị uPnL/ROE; lệnh đóng vẫn dùng NET đã đối soát, không trộn uPnL vào closed stats.
- SSE giữ kết nối cả khi không có position và phát event lifecycle khi fill/protection/bot-close/close để refresh cấu
  trúc; mark tick chỉ cập nhật cell live. Cột nhãn whitelist thu còn `220px`, ellipsis nhưng tooltip giữ full exact key.
- Không đổi nhãn, gate, whitelist checkbox, entry, size, leverage, SL/TP hay lệnh Binance; đây chỉ là hiển thị
  `OBSERVE ONLY`. Không đổi/rewrite JSON cũ; record thiếu fill/quantity không bị tính uPnL giả.

## 2026-08-09 - ProfitLock ngoài Liquid Flow V2; tắt trailing-stop cũ

- Version `BINANCE_PROFIT_LOCK_NON_V2_ONLY_V2_20260809`: sau khi position Binance ngoài Liquid Flow V2 đạt `+5% ROE`,
  bot dời SL sang mức tương ứng
  `+1% ROE` cho cả LONG và SHORT. Từ `+15%` trở lên tiếp tục thang `15 -> 5`, `20 -> 10`, `25 -> 15`...
- Không đổi dữ liệu/nhãn phân loại trước entry. Rule sau entry dùng entry, mark, quantity, margin và leverage Binance;
  không tạo thống kê, cohort hay checkbox whitelist mới. `sl-tracking`, lifecycle event và API status chỉ ghi telemetry
  của mức khóa lời.
- `LEGACY_TSL_DISABLED_V1_20260809` ngừng khởi tạo `trailingStop.js`, bỏ tick-path 10→3 từng tranh chấp với ProfitLock và
  từng cancel SL trước khi đặt order thay thế. Chỉ còn một manager, đặt SL mới trước khi hủy SL cũ.
- Có tác động SL thật trên Binance ngoài V2, gồm cả live-card signal protection; Liquid Flow V2 giữ SL/TP plan riêng. Không hạ
  một SL đang tốt hơn. Không đổi gate, entry, size/margin, leverage hay TP.
- Tương thích JSON cũ bằng field optional, không rewrite. Record V2 thiếu source được đối chiếu symbol/side/entry/fill-time;
  record ngoài V2 thiếu lifecycle vẫn được dời SL; nhận diện
  `STOP/STOP_MARKET` mới hỗ trợ SL đã qua vùng lời, còn type `CONDITIONAL` cũ giữ fallback phía lỗ.

## 2026-08-09 - Thêm Heatmap Flow V2 và trang Kill Long / Kill Short

- Thêm `LIQUID_HEATMAP_FLOW_V2_20260809`, chạy độc lập với V1 và chỉ dùng dữ liệu có sẵn trước lúc gắn nhãn:
  top mover/quote volume, nến 5m đã đóng, cụm V1, taker flow, OI delta và Binance force-liquidation websocket.
- Bốn nhãn mới tách side: `UP SQUEEZE ACTIVE`, `UP SWEEP · SHORT READY`, `DOWN SQUEEZE ACTIVE`,
  `DOWN SWEEP · LONG READY`. Hai nhãn ACTIVE yêu cầu tiếp tục chờ; hai nhãn READY bắt buộc sweep zone + nến đóng
  reject/reclaim + xác nhận flow; READY luôn cần thêm OI giảm hoặc liquidation burst. Thiếu OI/socket/nến được hiện
  là warmup, không được suy diễn thành tín hiệu.
- Trang `/liquid-flow-v2` chạy SSE 15 giây, ưu tiên coin top tăng/giảm kiểu BLUAI và hiển thị 24h/1h, volume X,
  taker delta, OI delta, kill SHORT/LONG thực từ force-order, vùng trên/dưới và từng bằng chứng xác nhận.
- Thống kê hiện tại là active count, max confidence và transition trong phiên server; chưa phải WR/PF/PnL backtest.
  Mỗi nhãn có checkbox mặc định tắt với key `heatmap-v2:<LABEL>`. Key chỉ lưu whitelist thống kê, chưa nằm trong trade
  matcher nên bật checkbox không cấp Binance.
- Toàn bộ V2 là `OBSERVE ONLY`, không phải gate/rule giao dịch thật; không đổi V1, paper, Binance entry, size/margin,
  leverage, SL hay TP. Không rewrite JSON cũ; cache và transition V2 là runtime-only, reset khi restart.

## 2026-08-09 - Auto Paper khi V2 chuyển sang READY

- Thêm `LIQUID_FLOW_V2_PAPER_V1_20260809` với store riêng `data/liquid-flow-v2-paper.json`.
- `ACTIVE/WAIT/WARMING UP` luôn hiện `CHƯA VÀO`. Auto Paper chỉ tạo đúng lần transition đầu sang
  `UP SWEEP · SHORT READY` hoặc `DOWN SWEEP · LONG READY`, entry tại close nến 5m xác nhận và chống trùng bằng
  signal key, một OPEN/symbol cùng cooldown 30 phút.
- Mặc định `$10 / 10x`; SL ngoài wick/vùng sweep với risk underlying `0.4%..2.5%`, TP hướng vùng V1 đối diện
  `0.6%..4%` hoặc fallback 1.5R, timeout 4 giờ, PnL NET trừ 0.08% notional round-trip fee.
- Trang V2 thêm hướng dẫn ba bước, toggle Auto Paper, trạng thái vào trên từng signal và thống kê OPEN/CLOSED, W/L,
  WR, NET PnL, AvgROE cùng lịch sử entry/TP/SL/mark/outcome.
- Đây chỉ là mô phỏng: có thay đổi entry/SL/TP của paper V2 nhưng không nối live-card/Binance, không sửa V1, không đổi
  size/leverage/SL/TP lệnh thật. JSON cũ không rewrite; file versioned mới tự khởi tạo khi chưa tồn tại.

## 2026-08-09 - Base Sweep Continuation LONG/SHORT và paper fill theo mark live

- Nâng classifier lên `LIQUID_HEATMAP_FLOW_V2_BASE_SWEEP_V2_20260809`, thêm hai nhãn đối xứng
  `UP BASE SWEEP · LONG READY` và `DOWN BASE SWEEP · SHORT READY`. Hai nhãn dùng hoàn toàn dữ liệu trước entry:
  tối đa 24 nến 5m đã đóng (2 giờ), support/resistance cục bộ, wick/reclaim/reject, số nến giữ base, breakout/breakdown,
  EMA13/25, 24h/1h, volume X, taker delta và evidence OI/force-liquidation nếu có; không dùng PnL/outcome tương lai.
- LONG continuation yêu cầu top tăng `24h >= 8%`, `1h >= 0`, quét đáy local ít nhất `0.2%`, đóng reclaim,
  ít nhất hai nến giữ support, base rộng không quá `14%`, đóng breakout ít nhất `0.2%`, giá trên EMA13/25,
  volume `>= 1.6x` theo baseline chung hoặc riêng nến breakout so với các nến giữ base, taker `>= +2%` và không có
  upper rejection. SHORT dùng điều kiện đối xứng và không có lower reclaim.
  OI giảm/liquidation chỉ tăng evidence/confidence, không được mô tả là liquidation thật khi socket không có event.
- Sáu card thống kê dùng key `heatmap-v2:<LABEL>`, giữ checkbox whitelist mặc định tắt, đếm active/max confidence/
  transition trong phiên. Đây không phải WR/PF backtest và nhãn vẫn `OBSERVE ONLY`; không gate/chặn/cấp Binance,
  không đổi entry, size, leverage, SL hoặc TP lệnh thật.
- Replay causal BMTUSDT 5m của mẫu người dùng cung cấp phát LONG READY tại nến đóng 13:34 Bangkok, close `0.01703`,
  breakout-volume `5.3x`, taker `+6.9%`, confidence `92%`, trước ảnh 13:47; fixture này được khóa trong test để chống
  regression nhưng không được suy rộng thành hiệu suất hay tỷ lệ thắng.
- Nâng Auto Paper lên `LIQUID_FLOW_V2_PAPER_V2_20260809`: cả bốn nhãn READY được phép tạo mô phỏng ở lần transition.
  Entry đổi từ close nến cũ sang mark live tại lần scan phát hiện READY (`LIVE_MARK_AT_READY_SCAN`); SL continuation
  xét thêm cực trị nến quét base, còn TP/risk/cooldown/timeout/fee giữ quy tắc V1. Thay đổi này chỉ tác động paper V2.
- Store JSON V1 vẫn được đọc nguyên trạng; trade lịch sử không rewrite. Trade mới bổ sung field optional về entry basis,
  mark live, close tín hiệu và snapshot base. Consumer cũ bỏ qua field mới nên tiếp tục tương thích.

## 2026-08-09 - BASE SWEEP paper 5x và chờ retest thay vì đuổi breakout

- Nâng Auto Paper lên `LIQUID_FLOW_V2_PAPER_V3_BASE_RETEST_20260809`. Dữ liệu phân loại trước entry không đổi:
  nhãn BASE SWEEP vẫn chỉ dùng nến 5m đã đóng, breakout level, base, EMA, volume/taker và telemetry causal. Tại lúc READY,
  plan cố định LIMIT retest `breakoutLevel +0.6%` cho LONG hoặc `-0.6%` cho SHORT; tick sau đó chỉ fill/hủy plan đã khóa,
  không nhìn outcome để đổi nhãn hay dời entry có lợi.
- Riêng `UP BASE SWEEP · LONG READY` và `DOWN BASE SWEEP · SHORT READY` dùng margin `$10`, leverage `5x` thay vì `10x`.
  Risk budget vẫn tối đa khoảng `25% ROE`, nên khoảng SL underlying được phép rộng tới `5%` và xét cực trị sweep/base.
  Hai nhãn đảo chiều cũ tiếp tục `$10 / 10x` và risk underlying tối đa `2.5%`; size/SL/TP Binance thật không đổi.
- BASE plan bắt đầu ở `PENDING_ENTRY`, chờ retest tối đa 30 phút. Giá xuyên SL trước fill tạo `ENTRY_INVALIDATED`, hết hạn
  tạo `ENTRY_TIMEOUT`; cả hai không tính W/L. Khi mark chạm LIMIT mới chuyển OPEN và bắt đầu timeout giữ lệnh 4 giờ.
- Replay SKYAI causal: tín hiệu tại mark `0.13037`, breakout level `0.12552`; V2 cũ đuổi mark và SL `0.12711075` trước
  khi giá tăng tiếp. V3 chờ LIMIT `0.12627312`, giá thực chạm `0.12621`, dùng SL `0.11995946` và sau đó đạt TP;
  đây là kiểm thử một lifecycle cụ thể, không phải WR/PF backtest.
- UI/socket thống kê riêng OPEN/PENDING/CLOSED, hiện `CHỜ RETEST`, leverage và LIMIT. PENDING/CANCELLED không vào PnL/WR.
  Nhãn/checkbox vẫn `OBSERVE ONLY`; Auto Paper chỉ mô phỏng, không gate, không gửi/hủy Binance, không đổi margin/size,
  leverage, entry, SL hoặc TP thật.
- JSON V1/V2 được đọc nguyên trạng, không rewrite. Field/status V3 đều optional; trade cũ thiếu chúng vẫn thống kê như trước.

## 2026-08-09 - Phân trang và tô màu lịch sử Liquid Flow V2

- Thêm UI version `LIQUID_FLOW_V2_PAPER_HISTORY_UI_V1_20260809` cho bảng `Đã đóng / hủy gần nhất`.
- Dữ liệu causal trước entry, nhãn và rule thống kê PnL không đổi. UI phân biệt LONG xanh, SHORT đỏ, TP/PnL dương xanh,
  SL/PnL âm đỏ và CANCELLED vàng; lịch sử được sắp mới nhất trước rồi chia 10 dòng/trang.
- Socket giữ nguyên và chỉ render lại trang hiện tại; không thay đổi paper/Binance, entry, size, leverage, SL hay TP.
- Không đổi schema hoặc rewrite JSON cũ; field thiếu được hiển thị trung tính.

## 2026-08-09 - Link nhanh Binance/Coinglass cho Liquid Flow V2 paper

- UI version `LIQUID_FLOW_V2_PAPER_EXTERNAL_LINKS_V1_20260809` thêm hai link tab mới trên từng dòng paper.
- Chỉ dùng `symbol` đã lưu để mở Binance Futures và Coinglass Liquidation Heatmap; không đổi dữ liệu causal trước entry,
  điều kiện nhãn, cách tính thống kê hoặc tạo card mới.
- Không ảnh hưởng Binance API, paper entry, size, leverage, SL/TP; không đổi schema hay rewrite JSON cũ.

## 2026-08-09 - Áp 5x và hard SL 20% cho toàn bộ Liquid Flow V2 Auto Paper

- Nâng version lên `LIQUID_FLOW_V2_PAPER_V4_ALL_5X_HARD_SL20_20260809`; chỉ trade paper mới sau deploy dùng `$10 / 5x`
  và SL cố định `-20% gross ROE` (`4%` biến động giá). Không dùng cơ chế “âm 20% rồi dời SL về entry”, vì tại thời điểm đó
  stop ở entry đã nằm qua mark và sẽ khớp ngay; replay cơ chế hồi về entry cũng không cải thiện cohort hiện có.
- Snapshot và phân loại trước entry giữ nguyên: nến 5m đóng, V1 zones, base sweep, EMA/volume/taker/OI/force-order; bốn nhãn READY,
  mark-live cho reversal và retest-limit cho BASE SWEEP không đổi. TP `0.6%..4%`, cooldown, timeout và fee vẫn theo V3.
- Replay 40 closed trade với policy mới: WR `82.5%`, NET `+$1.8906`, AvgROE `+0.47%`, PF `1.15` (33 TP/6 SL/1 timeout).
  Đây là backtest/replay mẫu nhỏ và chỉ dùng làm baseline thống kê V4, không biến nhãn V2 thành gate hay rule Binance thật.
- Không ảnh hưởng Binance entry/size/leverage/SL/TP. Với paper mới, entry không đổi, notional giảm do 5x và SL đổi; trade cũ giữ
  nguyên plan đã snapshot để thống kê causal. JSON V1-V3 vẫn đọc được, field cũ được giữ, field `hardStopRoe` là optional;
  runtime policy 5x/20 ghi đè settings cũ nhưng không rewrite record lịch sử.

## 2026-08-09 - Nâng sàn TP Liquid Flow V2 paper lên 10% gross ROE

- Nâng version lên `LIQUID_FLOW_V2_PAPER_V5_5X_SL20_TP10_20260809`. Nhãn và snapshot causal trước entry không đổi.
- Trade mới 5x dùng TP tối thiểu `+10% gross ROE` (`2%` giá), vẫn lấy V1 opposite zone nếu xa hơn và cap tại `4%` giá;
  hard SL giữ `-20% gross ROE`. Badge NET tại TP sàn khoảng `+9.6%` sau fee, thay cho mức khoảng `+2.6%` của floor giá 0.6% cũ.
- Không suy diễn lại outcome lịch sử vì store không có tick path/MFE đủ để biết trade TP cũ có chạm target mới hay không. Thống kê V5
  bắt đầu từ trade mới; CLOSED mới vào WR/PF/PnL, PENDING/CANCELLED không vào cohort.
- Chỉ ảnh hưởng TP Auto Paper V2 mới; không đổi Binance, entry, margin/size, leverage, SL, nhãn hay whitelist. JSON cũ tiếp tục đọc;
  `minTakeProfitRoe` là optional default `10`, runtime settings được migrate nhưng trade V1-V4 giữ nguyên TP/version đã lưu.

## 2026-08-09 - BASE Sweep paper fill thử lệnh Binance $2 × 5x

- Nâng paper lên `LIQUID_FLOW_V2_PAPER_V6_BASE_BINANCE_2USD_5X_20260809` và policy thành
  `LIVE_CARD_AND_LIQ_FLOW_BASE_V2_20260809`. Chỉ `UP_BASE_SWEEP_LONG_READY` và `DOWN_BASE_SWEEP_SHORT_READY` được authorize;
  reversal/ACTIVE/WAIT không được đi qua policy.
- Phân loại causal trước entry không đổi. Khi BASE paper OPEN ngay hoặc fill retest LIMIT, bot claim trade đúng một lần rồi kiểm tra
  Orders ON, dry-run OFF, credentials, giới hạn position và không có position cùng symbol trước khi gửi MARKET notional `$10`
  (`$2` margin, `5x`). Snapshot đầu sau restart chỉ dựng baseline; không replay READY hiện hữu hoặc lệnh đã OPEN trước deploy.
- TP/SL Binance được neo theo fill thật với khoảng cách V5: TP tối thiểu `+10% gross ROE`, SL `-20% gross ROE`; Discord nhận cả
  FILLED và BLOCKED/ERROR. Metadata lifecycle được lưu trong trade nhưng không trộn vào paper WR/PF/PnL.
- Đây là rule Binance thật cho đúng hai BASE key, không còn mô tả toàn bộ trang là “không cấp Binance”. Nhãn/checkbox whitelist vẫn
  chỉ thống kê, mặc định tắt và độc lập với quyền BASE. Không đổi paper entry/size/SL/TP hoặc chiến lược khác.
- JSON cũ tương thích bằng field optional; OPEN/CLOSED cũ không gửi hồi tố, PENDING cũ chỉ được xét khi có fill mới sau deploy.
  State `SUBMITTING/FILLED/BLOCKED/ERROR` ngăn gửi trùng; lỗi không tự retry khi không chắc order đã tới Binance.

## 2026-08-09 - Chống đặt trùng TP/SL Binance

- Thêm version `BINANCE_PROTECTION_IDEMPOTENCY_V1_20260809`. Không đổi dữ liệu causal trước entry, nhãn, tier, whitelist,
  gate hoặc thống kê. Fallback TP và SL được serialize theo symbol để duplicate/partial fill không chạy hai request song song.
- Ngay trước `placeAlgoOrder`, bot fetch lại regular + algo open orders. Có protection đúng symbol, chiều đóng và hedge position side
  thì giữ order hiện hữu, không đặt thêm và không refresh theo giá/quantity vừa tính. Cả fallback và SignalProtection chỉ bổ sung
  đúng vế TP hoặc SL còn thiếu; không hủy rồi dựng lại cả cặp.
- Thay đổi chỉ ngăn duplicate Binance protection; không đổi entry, margin/size, leverage hay cách tính target khi thật sự thiếu TP/SL.
  Không thêm nhãn/card nên không phát sinh checkbox whitelist.
- Không đổi JSON và không rewrite lịch sử. Matcher chấp nhận schema order Binance cũ/mới qua `type`, `origType` hoặc `orderType`.

## 2026-08-09 - Cố định TP +6% ROE cho SHORT bot ngoài Liquid Flow V2

- Nâng thành `NON_LIQUID_FLOW_V2_SHORT_TP_ROE6_BOT_ONLY_V2_20260809`: SHORT/SELL chỉ dùng TP
  `entry * (1 - 0.06 / leverage)` khi có source bot xác định và không chứa `liquid-flow-v2`. Nguồn V2, toàn bộ LONG,
  source thiếu/unknown/manual, nhãn/tier/gate/whitelist và thống kê paper không đổi.
- Rule chạy nhất quán ở order mới, SignalProtection sau fill, AutoTP fallback, Pump LIMIT sau fill và AutoLiq SHORT. Ưu tiên entry
  fill Binance khi có; ở 10x target cách giá `0.6%`, ở 5x cách `1.2%`. Với position ngoài V2, NegTp/TP-entry guard vẫn ưu tiên
  dời TP về entry khi ROE âm sâu hoặc hết negative-timeout; Liquid Flow V2 giữ nguyên plan riêng.
- Chỉ ảnh hưởng TP Binance mới hoặc TP còn thiếu của bot; không đổi entry, size/margin, leverage hay SL. Lệnh tay từ `/orders`,
  source `manual/set-tp-sl`, position fallback hoặc REST sync không còn bị ép 6%. TP đã mở giữ nguyên theo idempotent protection,
  ngoại trừ rule cứu lỗ ngoài V2 được phép thay target bằng entry như trước.
- Không đổi JSON hay rewrite trade cũ. `/api/order` gắn source `orders-manual`; telemetry optional, consumer cũ bỏ qua an toàn.

## 2026-08-09 - Liquid Flow V2 manual Binance LIMIT/MARKET

- Nâng lên `LIQUID_FLOW_V2_MANUAL_BINANCE_UI_V3_AUTH_RECOVERY_20260809`: cuối mỗi dòng paper OPEN/PENDING có Entry + Margin + Leverage +
  `LIMIT THẬT` + `MARKET THẬT`. Margin mặc định `$2`, leverage mặc định `5x`; draft giữ qua socket render. API yêu cầu token
  `/orders`, xác nhận phía UI và derive symbol/side/protection từ `tradeId` phía server.
- UI tự re-auth bằng `orders_creds` cùng origin khi thiếu token, hoặc khi token cũ nhận `401` sau server restart; chỉ retry một lần.
  Không có credentials thì báo đúng hostname phải dùng cho `/orders`, vì `localhost` và `127.0.0.1` không chung localStorage.
- Lệnh dùng Margin/Leverage nhập tay; server kiểm tra margin `> 0` và `<= 10,000`, leverage nguyên `1..125`, rồi tính notional
  `margin × leverage`. LIMIT giữ đúng giá người dùng nhập, MARKET lấy fill thực. TP/SL giữ plan Liquid Flow V2 và rebase theo fill;
  source canonical `liquid-flow-v2-manual` loại SHORT này khỏi rule TP 6% ngoài V2.
- Auth recovery không tự gửi order và không đổi thống kê; lệnh thật vẫn cần thao tác xác nhận. Chặn gửi nếu symbol đã có
  position/LIMIT entry và khóa request theo trade. Paper stats/nhãn/whitelist không đổi; chỉ Binance
  entry/size/leverage/TP/SL bị tác động sau cú bấm xác nhận.
- JSON cũ tương thích; auth/draft UI không đổi schema. Metadata size/leverage/manual/protection đều optional và chỉ ghi cho trade đã bấm.
  Dùng metadata để recover protection
  cho LIMIT fill sau restart, không rewrite trade lịch sử khác.

## 2026-08-10 - LONG bot ngoài Liquid Flow V2 dùng TP +10% ROE

- Thêm `NON_LIQUID_FLOW_V2_LONG_TP_ROE10_BOT_ONLY_V1_20260810`; giữ SHORT ngoài V2 ở `+6% ROE`. LONG bot tính TP bằng
  `entry * (1 + 0.10 / leverage)`, ưu tiên average fill khi đã khớp. Resolver chạy nhất quán cho order mới, SignalProtection,
  Pump sau fill, AutoLiq và Missing-TP.
- Snapshot/nhãn/tier/gate/whitelist trước entry và thống kê paper không đổi. Đây là policy TP Binance sau khi entry đã được authorize,
  không cấp thêm lệnh và không thêm card/checkbox.
- Lệnh tay (`manual`, `/orders`, `set-tp-sl`) và REST/fallback/unknown chỉ được xem là user-managed/V2 trong policy TP:
  không tự dựng TP fallback hoặc chạy negative-TP. Chúng vẫn thuộc SL profit-lock ngoài V2; chỉ source/trade thật sự khớp `liquid-flow-v2*`
  mới được miễn dời SL. Position bot có source xác định ngoài V2 vẫn giữ rule cứu lỗ dời TP về entry khi âm sâu.
- Có ảnh hưởng TP Binance LONG bot mới/thiếu TP: 10x cách giá `+1%`, 5x cách `+2%`; không đổi entry, size, leverage hoặc SL.
  TP hiện hữu được giữ theo idempotency, không bị replace hồi tố. Không đổi JSON; version telemetry optional và record cũ không bị rewrite.

### Hotfix 2026-08-10 - Khôi phục SL +1% cho lệnh ngoài V2

- Nâng version thành `BINANCE_PROFIT_LOCK_NON_V2_ONLY_V3_MANUAL_INCLUDED_20260810`.
- Tách matcher TP user-managed khỏi matcher SL V2. Trước hotfix, lệnh tay/unknown bị matcher chung coi là V2 nên `handleSlTrailByProfit`
  return sớm và không khóa lời. Sau hotfix, SL scanner chỉ bỏ qua đúng Liquid Flow V2; lệnh tay/unknown ngoài V2 chạy profit-lock bình thường.
- Runtime giữ trigger `+5% ROE -> SL +1% ROE`; vì vậy trường hợp đã vượt `+10%` cũng khóa `+1%`. Từ `+15%` trở lên tiếp tục ladder hiện hành.
- Không đổi TP 10% LONG/6% SHORT, entry, size, leverage, nhãn, thống kê hoặc JSON. Có tác động Binance SL khi vị thế ngoài V2 đủ ngưỡng;
  SL hiện hữu tốt hơn target được giữ, SL kém hơn được thay theo cơ chế place-new-before-cancel-old.
## 2026-08-10 - PRE UP/DOWN BASE tại EMA99 5m

- Version: `LIQUID_HEATMAP_FLOW_V2_PRE_EMA99_V3_20260810` + `LIQUID_FLOW_V2_PAPER_V7_PRE_EMA99_20260810`.
- Dữ liệu causal trước entry gồm 180-220 nến 5m đã đóng cho EMA99/dốc EMA99, SMA13/25, mark live, khoảng cách tới EMA99, high/low 12 nến,
  24h/1h, volumeX và taker delta. PRE LONG chỉ xét top tăng pullback sát EMA99 với stack/dốc tăng còn giữ và không bị sell flow mạnh;
  PRE SHORT dùng điều kiện đối xứng cho top giảm hồi sát EMA99. BASE/SWEEP READY đã xác nhận luôn có ưu tiên cao hơn PRE.
- Thống kê tách hai key `heatmap-v2:PRE_UP_BASE_LONG` và `heatmap-v2:PRE_DOWN_BASE_SHORT`; chỉ CLOSED paper vào AvgROE. Checkbox
  WHITELIST mặc định tắt, chỉ hiện khi AvgROE closed `> 4%`, và chỉ lưu whitelist thống kê.
- Ảnh hưởng thực thi: PRE tạo paper 5x `IMMEDIATE_MARK`; không thêm PRE vào allow-list Binance, không thay đổi entry/size/SL/TP của lệnh thật.
  Hai BASE READY cũ vẫn là hai key duy nhất có đường `$2 x 5x` tự động. Đây là nhãn quan sát/paper, không phải gate Binance.
- JSON cũ tương thích bằng field optional; không migration/rewrite trade, không hồi tố PRE và baseline đầu tiên sau restart không tạo paper.

### 2026-08-10 - PRE EMA99 thử Binance $1 × 5x

- Nâng paper thành `LIQUID_FLOW_V2_PAPER_V8_PRE_BINANCE_1USD_5X_20260810` và policy thành
  `LIVE_CARD_AND_LIQ_FLOW_READY_V3_PRE1_20260810`. Dữ liệu causal và điều kiện phân loại PRE V3 không đổi.
- Chỉ hai key `PRE_UP_BASE_LONG` / `PRE_DOWN_BASE_SHORT` mới chuyển READY và tạo paper OPEN sau deploy được phép gửi MARKET Binance
  margin `$1`, leverage `5x`, notional `$5`; BASE READY giữ `$2 × 5x`, reversal READY không được cấp. Snapshot đầu sau restart chỉ dựng
  baseline, không gửi hồi tố PRE/trade đang mở cũ.
- Trước API, trade được claim `SUBMITTING` để chống trùng, kiểm tra Orders/dry-run/credentials/max position và position cùng symbol.
  Protection TP/SL giữ khoảng cách plan paper rồi neo lại từ fill thật. FILLED/BLOCKED/ERROR, kể cả IP/credential/min-notional, được persist
  và gửi Discord. Với min-notional `$5`, quantity được phép ceil lên lot nhỏ nhất chỉ khi notional thực không vượt yêu cầu quá 1%; lifecycle lưu
  requested `$1` và actual notional/margin. Checkbox whitelist PRE vẫn mặc định tắt/chỉ hiện khi CLOSED AvgROE >4% và độc lập với quyền test thật.
- Cách thống kê paper không đổi: chỉ CLOSED vào W/L, WR, NET, PF và AvgROE; PnL Binance không trộn vào paper.
- Ảnh hưởng Binance: có entry/size/leverage/TP/SL thật cho đúng PRE mới; không đổi entry/size/SL/TP của chiến lược khác. JSON cũ tương thích
  bằng optional `preBinanceMarginUsdt`, `preBinanceLeverage` và lifecycle fields; không rewrite lịch sử.

### 2026-08-10 - PRE wick/reclaim live, nâng Binance lên $5 × 5x

- Nâng tín hiệu thành `LIQUID_HEATMAP_FLOW_V2_PRE_WICK_V4_20260810`, paper thành
  `LIQUID_FLOW_V2_PAPER_V9_PRE_WICK_BINANCE_5USD_5X_20260810` và entry policy thành
  `LIVE_CARD_AND_LIQ_FLOW_READY_V4_PRE5_WICK_20260810`; mục `$1 × 5x` ngay trên được thay thế từ deploy này.
- Dữ liệu trước entry giữ 180-220 nến 5m đóng cho EMA/structure/volume/taker và thêm OHLC nến 5m live từ websocket tại tick đã
  quan sát. PRE LONG yêu cầu low chạm EMA99 trong `-0.5..+1.2%`, mark reclaim `+0.1..+1.2%`, bật khỏi low `>=0.3%` cùng stack,
  slope, pullback, volume và taker guard V3. PRE SHORT đối xứng bằng high `-1.2..+0.5%`, mark `-1.2..-0.1%`, reject `>=0.3%`.
  Max-chase ±1.2% loại trường hợp đúng hướng nhưng đã giật xa; không dùng dữ liệu tương lai.
- Board full refresh luôn chạy 15 giây dù không có SSE client. Tick 5m chỉ rebuild symbol đã thuộc universe bằng kline/OI/liquidation
  cache, nên có thể phát transition trong nến mà không tạo REST storm. Baseline/restart không phát order; signal key, claim SUBMITTING,
  cooldown và kiểm tra position ngăn duplicate.
- Stats/whitelist không đổi key: hai PRE đã có checkbox mặc định tắt, chỉ hiện khi CLOSED AvgROE >4%; PnL Binance không trộn paper.
  PRE transition mới tạo paper immediate rồi gửi Binance MARKET `$5 × 5x` (notional `$25`); BASE giữ `$2 × 5x`. TP/SL rebase theo fill,
  lỗi Binance/IP persist + Discord. Không ảnh hưởng chiến lược khác.
- JSON tương thích bằng các field wick/live optional (`ema99LongTouchDistancePct`, `ema99ShortTouchDistancePct`,
  `reboundFromApproachLowPct`, `rejectFromApproachHighPct`, `approachCandleSource`, `live5mCandle`) và setting margin optional;
  không rewrite/backfill trade cũ.

### 2026-08-10 - Nâng BASE LONG Binance từ $2 lên $5 × 5x

- Version paper `LIQUID_FLOW_V2_PAPER_V10_BASE_LONG_5USD_5X_20260810`; entry policy
  `LIVE_CARD_AND_LIQ_FLOW_READY_V5_BASE_LONG5_20260810`. Dữ liệu causal, classifier V4 và thứ tự nhãn không đổi:
  `UP_BASE_SWEEP_LONG_READY` vẫn cần sweep đáy base, hold, breakout, EMA/volume/taker trước entry; không dùng outcome.
- Chỉ size của BASE LONG transition/fill mới đổi thành MARKET `$5 margin × 5x` (notional `$25`). PRE giữ `$5 × 5x`,
  BASE SHORT giữ `$2 × 5x`; reversal READY không được cấp. Entry/retest, TP/SL fill-anchor, claim SUBMITTING, kiểm tra position,
  chống duplicate và Discord lỗi Binance/IP giữ nguyên.
- Thống kê paper, hai card/key PRE/BASE và checkbox WHITELIST không đổi; không thêm nhãn/card. CLOSED paper vẫn là nguồn duy nhất
  của W/L, WR, NET, PF và AvgROE; PnL Binance không trộn vào paper.
- JSON cũ tương thích bằng setting optional `baseLongBinanceMarginUsdt`. Runtime dùng default 5 cho order mới nhưng không rewrite,
  resize, backfill hoặc gửi lại trade/order đã persist; chiến lược Binance ngoài Liquid Flow V2 không bị ảnh hưởng.

### 2026-08-10 - Trả BASE LONG Binance về $2 × 5x

- Version paper `LIQUID_FLOW_V2_PAPER_V11_BASE_LONG_2USD_5X_20260810`; entry policy
  `LIVE_CARD_AND_LIQ_FLOW_READY_V6_BASE_LONG2_20260810`. Đây là thay đổi size thay thế cấu hình BASE LONG `$5` ở mục trên;
  dữ liệu causal, điều kiện nhãn, entry/retest và thứ tự ưu tiên không đổi.
- `UP_BASE_SWEEP_LONG_READY` mới dùng `$2 margin × 5x` (notional `$10`), bằng BASE SHORT. PRE LONG/SHORT vẫn `$5 × 5x`;
  reversal READY không được cấp. TP/SL fill-anchor, kiểm tra position, chống duplicate và Discord lỗi giữ nguyên.
- Không thêm nhãn/card/checkbox và không đổi cách thống kê CLOSED paper. Không resize position, sửa protection hoặc gửi lại order cũ;
  `baseLongBinanceMarginUsdt` tiếp tục là field optional nên JSON cũ tương thích, chiến lược khác không bị ảnh hưởng.

### 2026-08-10 - Thêm HTF trend × EMA99 15m SHORT/LONG đối xứng vào Liquid Flow V2

- Version classifier `LIQUID_HEATMAP_FLOW_V2_HTF_15M_EMA99_V5_20260810`, paper
  `LIQUID_FLOW_V2_PAPER_V12_HTF_15M_EVAL_20260810`, whitelist `LIVE_CARD_WHITELIST_V8_HTF_15M_EMA99_20260810`.
  Thêm `HTF_BEAR_15M_EMA99_PUMP_REJECT` (SHORT) và `HTF_BULL_15M_EMA99_DUMP_RECLAIM` (LONG).
- Dữ liệu causal gồm 105-160 nến đã đóng 1h/4h cho EMA13/25/99, slope ba nến và structure năm nến; 105-160 nến đóng 15m
  cho EMA99, pump/dump context tám nến, touch/reject/reclaim hai nến, volume nền 20 nến và taker delta. Không dùng nến mở hoặc outcome.
- HTF cần ít nhất một khung có close đúng phía EMA13/25, EMA13 slope đúng hướng và tối thiểu hai bước structure; một khung là
  `B_ONE`, cả hai là `A_BOTH`. SHORT cần pump `>=2%`, high chạm EMA99 `-0.6..+1.5%`, close dưới EMA `>=0.2%`, giveback
  `>=25%`, volume `>=1.3x`, taker `<=+10%` và red/upper-wick confirm. LONG dùng điều kiện đối xứng với low touch
  `-1.5..+0.6%`, close trên EMA, recovery, taker `>=-10%` và green/lower-wick confirm.
- Hai nhãn tạo Auto Paper immediate 5x tại transition sau nến 15m đóng; signal key dùng closeTime 15m. Stats tách cohort CLOSED
  và checkbox WHITELIST canonical mặc định tắt/chỉ hiện khi AvgROE `>4%`. Không thêm hai key vào auto-real allow-list, vì vậy
  không ảnh hưởng Binance entry/size/SL/TP; PRE và BASE giữ cấu hình hiện hành.
- JSON cũ tương thích bằng các feature/snapshot optional, không migration/rewrite/backfill trade. Scanner subscribe/cache 15m/1h/4h
  cho universe V2; 5m tick vẫn phục vụ PRE, còn 15m/1h/4h chỉ tái phân loại khi nến đóng.

### 2026-08-10 - Manual Liquid Flow V2 cho DCA cùng chiều sau khi đã fill

- Bump `LIQUID_FLOW_V2_MANUAL_BINANCE_UI_V4_SAME_SIDE_DCA_20260810`: bỏ khóa vĩnh viễn của input/nút khi paper trade đã có state
  `FILLED/MANUAL_LIMIT_SUBMITTED`; chỉ giữ khóa trong lúc request đang gửi.
- API đọc position Binance trước entry: cho lệnh thủ công mới nếu position trống hoặc cùng chiều, chặn position ngược chiều và vẫn chặn khi
  symbol còn LIMIT entry mở. Không có DCA tự động.
- MARKET chỉ báo `ĐÃ VÀO LỆNH GIÁ ...`; LIMIT báo `ĐÃ ĐẶT LIMIT GIÁ ...`. Margin/leverage do người dùng nhập, mặc định `$2 × 5x`.
- Không thêm nhãn/thống kê/whitelist, không đổi TP/SL hay protection idempotency. JSON cũ tương thích vì chỉ dùng lại các field
  `binanceEntry*` hiện có để hiển thị kết quả gần nhất.
## 2026-08-10 - Hotfix TSL exclude cũ chặn profit-lock lệnh tay

- Version `BINANCE_PROFIT_LOCK_NON_V2_ONLY_V8_INITIAL_MARGIN_ROE_20260810`.
- Nguyên nhân thực tế ở CYSUSDT: position tay có tracking source `null`, entry `1.2042`, leverage `5x`, nhưng symbol từng
  nhận Post-dump Bounce Risk nên nằm trong `tslExcludedSymbols`; callback socket và safety scan đều bỏ qua trước khi
  gọi profit-lock. Đây là lỗi điều phối, không phải lỗi công thức ROE hay Binance.
- Profit-lock nay chỉ tự loại position thật sự khớp Liquid Flow V2. Lệnh manual/unknown ngoài V2 dùng position, entry,
  leverage, mark/UPnL causal hiện tại để khóa `+1% ROE` từ trigger `+5%`, rồi ladder `15 -> 5`, `20 -> 10`,
  `25 -> 15`, `30 -> 20`. TSL exclusions tín hiệu cũ không còn ảnh hưởng nhánh này.
- Không thêm nhãn/thống kê/whitelist, không đổi paper. Có tác động SL Binance thật sau khi đủ ngưỡng; không đổi entry,
  size, leverage hoặc TP. JSON cũ tương thích vì telemetry profit-lock optional và không bulk rewrite.
- Đồng thời thêm `POSITION_MONITOR_MARK_STREAM_DIRECT_AND_COMBINED_V2_20260810`: endpoint `/ws` gửi event
  `markPriceUpdate` trực tiếp nhưng parser cũ chỉ đọc `msg.stream/msg.data`, khiến `onRoeUpdate` không chạy dù socket báo
  connected. Parser mới nhận cả direct và combined schema, bỏ qua ACK/event khác, nên profit-lock dùng mark causal mỗi giây;
  không đổi nhãn/stats/JSON, entry, size, leverage hay TP.
- Do runtime hiện có thể chỉ nhận ACK subscription mà không có mark tick, safety scanner signed-REST được chuyển ra khỏi
  kline warm-up và chạy ngay khi server start, sau đó mỗi `SL_TRAIL_SAFETY_SCAN_INTERVAL_MS` (hiện `90s`). Nhánh này dùng
  position/mark/UPnL Binance hiện tại và cùng matcher V8, không tạo entry hay thay TP.
- Thêm startup retry sau 10 giây vì lượt scan tức thời có thể chạy trước khi position cache hoàn tất REST sync; các lần
  sau giữ interval 90 giây và dedupe/cooldown hiện hành.
- Profit-lock safety scan gọi shared position store với `bypassAlgoRestDefer=true`; nếu không, warm-up kline vẫn trả cache
  rỗng dù scanner đã start. Quyền bypass chỉ áp cho bảo vệ SL position, không áp cho signal/entry scanner.
- ROE socket và safety scan nay ưu tiên `positionInitialMargin/initialMargin`, không ưu tiên isolated wallet balance.
  Trường hợp CYSUSDT cho thấy mẫu số cũ báo `17.4%` khi biến động giá ở 5x tương ứng khoảng `25%`; V8 đưa ladder về
  cùng basis Binance. Chỉ nâng SL nếu target tốt hơn; không hạ protection hiện hữu.
- Xác nhận deploy: lifecycle CYS `62 @ 1.2042` được Binance dời SL từ `1.144` lên `1.2162` lúc 20:12:54. Sau đó
  position tăng thành `83 @ 1.1772`, được nhận là lifecycle/DCA mới; khi mark giảm dưới entry thì không còn đủ trigger
  profit-lock và fallback SL của lifecycle mới được dựng riêng. Không ghép trạng thái khóa lời của size/average entry cũ.
## 2026-08-10 - HTF BEAR/BULL gửi Discord theo transition

- Thêm `LIQUID_FLOW_V2_HTF_DISCORD_V1_20260810` cho hai nhãn
  `HTF_BEAR_15M_EMA99_PUMP_REJECT` (SHORT) và `HTF_BULL_15M_EMA99_DUMP_RECLAIM` (LONG).
- Alert chỉ dùng snapshot trước entry: trend 1h/4h, nến 15m đóng chạm EMA99 và reject/reclaim, pump/dump,
  giveback/recovery, volume, taker, mark và confidence. Chỉ transition sau baseline được gửi; dedupe theo symbol/label/
  closeTime 15m trong runtime, áp dụng đồng nhất full refresh và fast scan.
- Embed ghi side, HTF tier, trend từng khung, close/EMA99, touch distance, volume/taker và `PAPER EVAL ONLY`.
  Webhook riêng optional `LIQ_FLOW_V2_HTF_WEBHOOK_URL`, fallback webhook Liquid Scan/Discord chung.
- Không đổi điều kiện nhãn, paper stats, cohort CLOSED hoặc checkbox whitelist hiện hữu. Không ảnh hưởng Binance entry,
  size, leverage, SL/TP và không thêm HTF vào auto-real labels. Không đổi/rewrite JSON cũ.

### 2026-08-10 - Nhãn Pump Distribution WATCH / SHORT READY

- Nâng classifier lên `LIQUID_HEATMAP_FLOW_V2_PUMP_DISTRIBUTION_V6_20260810` và paper lên
  `LIQUID_FLOW_V2_PAPER_V13_PUMP_DISTRIBUTION_EVAL_20260810`. Dữ liệu trước entry chỉ gồm nến 15m đã đóng, change 24h,
  OHLC, quote volume và taker-buy volume; không dùng nến mở, outcome hoặc MFE/MAE sau entry.
- `PUMP_DISTRIBUTION_WATCH` nhận pump local `>=10%` + ngày `>=18%`, rồi base 4-12 nến co hẹp `<=14%`, lower-high/upper-wick,
  drawdown 2-28%, volume fade và taker không còn mua áp đảo. Nhãn này chỉ báo đang phân phối, `OBSERVE ONLY`, không paper.
- `PUMP_DISTRIBUTION_SHORT_READY` chỉ xuất hiện sau nến breakdown support có volume/sell-flow và nến sau retest support thất
  bại rồi đóng dưới. Transition mới tạo paper SHORT 5x immediate; signal key neo closeTime nến retest. Không được cấp Binance.
- Hai card có checkbox key `heatmap-v2:PUMP_DISTRIBUTION_WATCH` và
  `heatmap-v2:PUMP_DISTRIBUTION_SHORT_READY`, mặc định tắt; chỉ CLOSED paper vào thống kê và chỉ closed AvgROE `>4%` mới
  hiện checkbox. PnL Binance không trộn paper.
- Không đổi entry/size/leverage/SL/TP thật hay auto-real allow-list. JSON cũ tương thích bằng snapshot optional
  `pumpDistribution15m`; record thiếu field vẫn đọc được, không rewrite/backfill lịch sử.

### 2026-08-10 - Protection socket full-fill only

- Version `POSITION_PROTECTION_SOCKET_FULL_FILL_ONLY_V1_20260810`: chỉ Binance user-data `ORDER_TRADE_UPDATE` loại
  `TRADE`, status `FILLED`, quantity fill dương và không reduce-only mới được kích đặt SL/TP. Partial fill chờ event FILLED;
  REST sync chỉ refresh cache/ROE và không phát fill giả.
- Tắt startup missing-TP scanner, SL safety REST scanner và REST recovery cho MARKET fill. Lệnh có TP/SL đính kèm luôn lưu
  plan và chờ socket, vì vậy LIMIT chưa khớp không dựng protection trước. Full fill lặp được chặn bằng plan `appliedAt`,
  order/clientOrder match và fresh existing-order check; retry ngắn sau cùng socket fill vẫn giữ.
- Full fill socket không có plan chạy fallback SL/TP đúng một lần. Mất socket đồng nghĩa không có REST tự bù; protection bị
  xóa tay cũng không được scanner dựng lại. Profit-lock và TP âm sâu vẫn nhận mark-price socket theo policy hiện hành.
- Không đổi nhãn/tier/card/whitelist, paper stats, entry, size hay leverage. Chỉ đổi thời điểm SL/TP Binance thật. JSON cũ
  không rewrite; hai env scanner trong `.env.example` chuyển mặc định `false` để phản ánh policy mới.

### 2026-08-10 - TRADE_LITE verified full fill cho TP/SL

- Nâng trigger lên `POSITION_PROTECTION_SOCKET_FILL_V2_TRADE_LITE_VERIFIED_20260810`. Nguyên nhân SATS không có TP/SL là user-data
  stream có phát fill dạng `TRADE_LITE` nhưng monitor V1 chỉ xử lý `ORDER_TRADE_UPDATE`; SATS vì vậy chỉ được REST sync nhìn thấy và
  không còn trigger protection sau khi scanner thiếu SL/TP đã tắt.
- `TRADE_LITE` mới được xử lý ngay từ socket, sau đó query đúng symbol/orderId với bounded retry để xác nhận `FILLED`. Chỉ order có
  executed quantity, không reduce-only/close-position và còn position cùng chiều mới được chuyển thành source
  `TRADE_LITE_VERIFIED`. Dedupe theo orderId dùng chung với `ORDER_TRADE_UPDATE` ngăn đặt TP/SL trùng.
- Đây không phải polling/scanner: không duyệt positions, không tìm protection thiếu và dừng retry sau tối đa 2.5 giây của chính event.
  Missing-TP scanner, SL safety scanner và MARKET REST recovery vẫn tắt.
- Không đổi nhãn, tier, snapshot, stats CLOSED, whitelist, entry, margin, leverage hoặc công thức TP/SL; chỉ khôi phục trigger đặt
  protection thật cho schema socket Binance thực tế. Không đổi/rewrite JSON; telemetry/source mới là optional runtime data.
- Sửa thêm `BINANCE_SCIENTIFIC_STEP_PRECISION_V1_20260810`: `decimalsFromStep()` cũ nhận Number `1e-8` nhưng không thấy dấu chấm,
  trả precision 0 và làm TP/SL coin giá nhỏ thành chuỗi rỗng. Parser mới hiểu scientific notation (`1e-8 -> 8`, `1.25e-7 -> 9`),
  nên `triggerPrice` được giữ trong signed request. Không đổi giá mục tiêu, stats/whitelist hay JSON; chỉ round đúng PRICE_FILTER/
  LOT_SIZE đã có trước entry.

### 2026-08-11 - Manual Binance ROE 10% khóa SL +1%

- Nâng profit-lock lên `BINANCE_PROFIT_LOCK_V9_MANUAL_ROE10_LOCK1_20260811`. BLUAIUSDT LONG tay fill `0.0305 @5x` lúc
  08:54:38 chỉ được dựng SL gốc `-25% ROE`; không có `SlTrail` trước khi đóng lỗ lúc 09:11:48. Nguyên nhân là manual V2 từng bị
  matcher `isLiquidFlowV2ManagedPosition()` loại cùng bot V2.
- Manual nay được nhận bằng source `*manual*`, record Liquid Flow V2 có `binanceEntryMode=MANUAL_*`, hoặc position không có
  source/lifecycle/plan bot. Manual được xét trước V2 exclusion: ROE `10..14.99 -> lock +1%`, `15 -> +5%`, `20 -> +10%`, tiếp tục
  ladder mỗi 5 điểm. Bot V2 tự động vẫn giữ protection riêng và không đi vào rule này.
- Dùng entry/leverage/mark/initial margin Binance hiện tại; đặt SL mới trước, xác nhận rồi mới hủy SL cũ. Không đổi TP, entry,
  margin, leverage, nhãn/stats/whitelist hay JSON bắt buộc. Missing-SL và safety REST scanner vẫn tắt; callback mark-price socket
  là trigger duy nhất cho profit-lock.

### 2026-08-11 - Hai nhãn Liquid Spring / Upthrust causal

- Thêm `LIQUID_SPRING_REVERSAL_V1_CLOSED_SWEEP_RECLAIM_20260811`: LONG phải quét local-low sáu nến `>=0.15%` rồi nến
  bullish đóng reclaim `>=0.05%`; SHORT đối xứng bằng local-high + bearish reject. Cả hai yêu cầu candle coin/BTC cùng hướng
  và market point đối diện đang hơn ít nhất 15 điểm. Chỉ nến đã đóng trước entry được dùng, không nhìn PnL/outcome.
- Hai card `LIQ LONG SPRING REVERSAL` và `LIQ SHORT UPTHRUST REVERSAL` luôn hiện trên Liquid Scan, thống kê riêng
  total/status/WL/WR/PF/PnL/AvgROE/ngày dương và snapshot/backfill. Badge được gắn trên đúng dòng paper đã match.
- Whitelist nâng lên `LIVE_CARD_WHITELIST_V9_LIQ_SPRING_REVERSAL_20260811`, key
  `spring-reversal:LONG_SPRING` / `spring-reversal:SHORT_UPTHRUST`, mặc định tắt và checkbox chỉ hiện khi closed AvgROE `>4%`.
  Nhãn hiện là `OBSERVE ONLY`; không tự tạo/cấp lệnh, không đổi entry, margin/size, leverage, SL hoặc TP Binance/paper.
- JSON cũ không rewrite: snapshot structure/label là optional; chỉ backfill từ closed-kline cache còn giữ đúng thời điểm entry,
  còn thiếu kline thì trả NO DATA thay vì suy diễn context proxy. Script transfer 14 ngày vẫn là công cụ đánh giá, không phải matcher.

### 2026-08-11 - Mở profit-lock ROE 10% cho toàn bộ Liquid Flow V2

- Nâng version lên `BINANCE_PROFIT_LOCK_V10_LIQUID_V2_AND_MANUAL_ROE10_LOCK1_20260811`. V9 chỉ cho manual đi qua và
  còn loại bot V2; V10 cho cả position auto PRE/BASE/READY và lệnh bấm tay từ Liquid Flow V2 dùng cùng rule. Dữ liệu causal
  gồm position/average entry/side/leverage/mark/UPnL Binance realtime và source/plan/lifecycle đã có từ fill, không dùng outcome.
- Matcher chạy hai nhánh `isManualBinanceManagedPosition()` hoặc `isLiquidFlowV2ManagedPosition()`: ROE `10..14.99` khóa
  `+1%`, `15..19.99` khóa `+5%`, `20..24.99` khóa `+10%`, rồi tiếp tục ladder 5 điểm. Nhánh ngoài V2/manual giữ policy
  hiện hành. SL chỉ được nâng; order thay thế phải đặt thành công trước khi SL cũ bị hủy.
- Không thêm/đổi nhãn, tier, snapshot, card thống kê, cohort hay checkbox whitelist; WR/PF/PnL paper và matcher runtime giữ
  nguyên. Không đổi entry, margin/size, leverage, TP hoặc SL ban đầu; chỉ dời SL Binance thật sau entry khi đủ ngưỡng.
- Mark-price socket vẫn là trigger; missing-protection và REST SL safety scanner vẫn tắt theo policy full-fill-only, nên thay đổi
  không dựng lại SL bị xóa. JSON cũ không rewrite/migrate; telemetry profit-lock optional và source/plan cũ tiếp tục đọc được.

### 2026-08-11 - Sửa hai nhãn hậu pump không phát tín hiệu

- Nâng classifier lên `LIQUID_HEATMAP_FLOW_V2_POST_PUMP_UNWIND_V7_20260811` và paper lên
  `LIQUID_FLOW_V2_PAPER_V14_SECONDARY_DISTRIBUTION_20260811`. Nguyên nhân V6 gần như im lặng là peak chỉ sống
  6-16 nến 15m, range bị khóa `<=14%`, drawdown tối đa 28%, còn breakdown/retest phải nằm đúng hai nến cuối;
  thêm vào đó chuỗi `else-if` cho BASE/SWEEP/HTF/SQUEEZE có thể che nhãn phân phối.
- V7 dùng causal closed data 192 nến 15m + 168 nến 1h, giữ peak 6-96 nến, nhận pump cycle `>=30%`, drawdown
  `5-70%` và range thích ứng 14-28%. Breakdown được tìm trong năm nến gần nhất; xác nhận là failed retest trong
  bốn nến hoặc hai close giữ dưới support. Phân tầng unwind chặn READY ở `LATE_UNWIND` để không SHORT đuổi đáy.
- `PUMP_DISTRIBUTION_WATCH/SHORT_READY` nay có thể nằm trong `secondaryLabels`, nên vẫn hiện và được đếm khi nhãn
  chính của coin là BASE, SWEEP, HTF hoặc SQUEEZE. Candidate mặc định 20 mỗi phía, tối đa 48; filter/card UI và stats
  đọc cả nhãn chính lẫn phụ. WATCH không paper; SHORT READY transition tạo paper 5x immediate và dedupe bằng `readyAt`.
- Whitelist giữ đúng hai key `heatmap-v2:PUMP_DISTRIBUTION_WATCH` /
  `heatmap-v2:PUMP_DISTRIBUTION_SHORT_READY`, mặc định tắt; checkbox chỉ hiện khi cohort CLOSED cùng label có
  AvgROE `>4%`. Không đổi matcher hay key cũ, không trộn paper nhãn khác vào thống kê.
- Hai nhãn vẫn `OBSERVE/PAPER EVAL ONLY`: không cấp Binance thật, không đổi entry/size/leverage/SL/TP thật. Field mới
  của detector và `secondaryLabels` là optional; JSON/trade cũ thiếu field vẫn đọc bình thường, không rewrite/backfill.

### 2026-08-11 - Hotfix Mark Price Futures route `/market`

- Nâng position monitor lên `POSITION_MONITOR_MARKET_ROUTE_AND_STALE_WATCHDOG_V3_20260811`. Endpoint cũ
  `wss://fstream.binance.com/ws` vẫn mở và ACK subscription nhưng sau thay đổi route của Binance không còn push
  `@markPrice`; user-data `/private/ws` vẫn nhận fill nên tạo ra trạng thái có lệnh/SL gốc nhưng không có ROE để dời SL.
- Chuyển Mark Price sang `wss://fstream.binance.com/market/ws`. Khi có position được subscribe mà 15 giây không có
  tick hợp lệ, watchdog kiểm tra mỗi 5 giây sẽ terminate và reconnect; status ghi URL, thời điểm stale gần nhất và số lần
  reconnect. REST safety/missing-protection scanner không được bật lại.
- Dữ liệu causal và matcher không đổi: position thật, entry, side, leverage, Mark Price hiện tại cùng metadata source lúc
  fill; manual/Liquid Flow V2 tiếp tục `10 -> +1`, `15 -> +5`, `20 -> +10`. Không đổi entry, size, leverage, TP, SL gốc,
  nhãn/tier/stats/whitelist; chỉ khôi phục trigger dời SL thật đã có.
- Không có thay đổi schema JSON hay migration. Paper, lifecycle, history và `sl-tracking` cũ giữ nguyên; telemetry watchdog
  chỉ tồn tại trong status runtime.

### 2026-08-11 - Exclude Orders cap profit-lock tại +1% ROE

- Nâng profit-lock lên `BINANCE_PROFIT_LOCK_V11_ORDERS_EXCLUDE_CAP_ROE1_20260811`. Symbol check `Cap TSL`/Exclude
  trên Orders chỉ chạy một mức `ROE >=10% -> SL +1%`; không nâng tiếp ở 15%, 20% hoặc các bậc cao hơn. Bỏ check trả
  symbol về ladder đầy đủ theo nhóm; SL tốt hơn đã tồn tại không bị hạ.
- Rule dùng state checkbox trước lần xét cùng position/entry/side/leverage/Mark Price Binance realtime. Không đổi matcher
  manual/Liquid Flow V2, entry, size, leverage, TP, SL gốc, nhãn/tier/stats/whitelist hoặc cách tính ROE.
- Không bật scanner và không dựng lại SL/TP bị xóa. API/key/localStorage exclude giữ nguyên để JSON và UI cũ tương thích;
  chỉ cập nhật tooltip/header Orders cho đúng ý nghĩa cap ladder.

### 2026-08-11 - Liquid Flow V2 HTF EMA99 đa khung 5m/15m

- Nâng classifier lên `LIQUID_HEATMAP_FLOW_V2_MTF_EMA99_RETEST_V8_20260811`, paper lên
  `LIQUID_FLOW_V2_PAPER_V15_MTF_EMA99_RETEST_20260811`, Discord lên
  `LIQUID_FLOW_V2_HTF_DISCORD_MTF_V2_20260811`. Trước entry chỉ dùng closed candles 5m/15m, EMA99,
  hai nến retest, context/volume/taker và trend 1h/4h causal.
- `HTF_BEAR_15M_EMA99_PUMP_REJECT` / `HTF_BULL_15M_EMA99_DUMP_RECLAIM` nay khớp khi retest hợp lệ đến từ 5m
  **hoặc** 15m. Rule HTF, pump/dump, close reject/reclaim, volume và taker giữ nguyên; 15m giữ band xuyên EMA `1.5%`,
  5m cho phép râu sweep sâu tối đa `15%`. Nếu hai timeframe cùng READY, dùng candle mới hơn và lưu timeframe nguồn.
- Thống kê/whitelist giữ nguyên key để cohort lịch sử liên tục: checkbox mặc định tắt, chỉ hiện khi closed AvgROE `>4%`.
  Không thêm label/card mới. Title đổi sang `5M/15M`; AvgROE không tính OPEN/PENDING.
- Hai nhãn vẫn paper/observe-only, không gate/chặn, không cấp Binance và không đổi entry/size/leverage/SL/TP thật. Paper
  chỉ đổi dedupe/snapshot sang candle 5m hoặc 15m thực sự đã kích hoạt.
- JSON cũ tương thích vì `ema99Retest15m` và label key cũ vẫn giữ. Các field `ema99Retest5m`,
  `ema99RetestTimeframe`, `ema99RetestCandleClosedAt` là optional; không rewrite/migrate/backfill record cũ.

### 2026-08-11 - Orders calendar cho thống kê lệnh thật

- Nâng stats lên `LIVE_CARD_WHITELIST_PNL_STATS_V5_20260811_BANGKOK_CALENDAR`. Calendar lọc theo ngày lifecycle
  bắt đầu tại Bangkok: `entryFilledAt`, fallback submitted/attempted; mặc định hôm nay, hỗ trợ range và all-history.
- Filter chạy server-side trước khi tổng hợp nên overview, stats từng nhãn, side split, WR/PF/AvgROE/NET,
  Binance-vs-paper exact cohort và history đều cùng một khoảng ngày. Ngày đóng không dùng làm cohort key.
- Đây chỉ là report filter: không đổi classification, label/tier, whitelist checkbox/matcher, Binance entry/size/leverage,
  SL/TP hoặc profit-lock. Không tạo label/card/checkbox mới.
- Store JSON không đổi. API bổ sung optional `dateRange`, `availableDays`, `unfilteredTotal`; request cũ không có range
  vẫn trả all-history, không migration/rewrite/backfill.
### 2026-08-11 - Cấp lệnh thật SHORT_FIT chỉ cho BC_UTAD entry-fit

- Thêm policy `LIVE_CARD_SHORT_FIT_BC_UTAD_IOC_V1_20260811` tại pipeline live-card. Snapshot causal trước entry phải là
  SHORT_FIT + SHORT + BC_UTAD; Binance Futures last price ngay sau preflight không được thấp hơn signal entry quá 0,10%.
- Qua guard thì đặt MARKET margin $3 và leverage hiện hành; không có LIMIT/retest. Trượt quá ngưỡng hoặc thiếu dữ liệu thì
  bỏ quyền do card `edge:best-profile:SHORT_FIT` cấp. Card real khác cùng khớp vẫn độc lập, không bị SHORT_FIT chặn hộ.
- Không thêm nhãn/card/checkbox: thống kê và điều kiện hiện `WHITELIST` closed AvgROE >4% giữ nguyên. Căn cứ 14 ngày gồm
  paper BC_UTAD 61 lệnh (WR 91,8%, AvgROE +10,74%, PF 5,37) và exact Binance entry-fit 11 lệnh (NET +0,9404,
  Net AvgROE +2,85%, PF 4,79); band 0,10-0,25% bị loại vì làm cohort Binance chuyển âm.
- Runtime hiện đã bật quyền `LỆNH THẬT` cho key `edge:best-profile:SHORT_FIT` theo yêu cầu; đây là state triển khai hiện tại,
  không thay đổi nguyên tắc mặc định tắt của checkbox trên cấu hình mới.
- Chỉ entry và margin của SHORT_FIT thay đổi; TP/SL/fill-anchor/profit-lock/dedupe/max-position không đổi. Field audit mới
  là optional, JSON cũ không migration hoặc backfill.

### 2026-08-12 - Áp entry guard theo cohort cho toàn bộ SHORT live-card

- Thêm `LIVE_CARD_SHORT_ENTRY_GUARD_V1_20260812`. Snapshot causal trước entry gồm key whitelist, side, setup/combo,
  signal entry và Futures last price lấy song song với positions/open-orders preflight; không dùng outcome hoặc dữ liệu
  tương lai.
- Rule chạy thật: `SHORT_FIT + BC_UTAD <=0,10%`; `EARLY_DUMP + BTC_DOWN_MID <=0,60%`;
  `EARLY_DUMP + BTC_DOWN_WEAK <=1,00%`; `DUMP + BTC_UP_WEAK <=1,00%`; SHORT khác hard cap `1,00%`.
  Độ trượt là phần giá current thấp hơn signal entry đối với SHORT. Pass đặt MARKET ngay; fail bỏ lệnh, không retest.
- `edge:best-risk-phase:DAY_BEAR_CONTINUE` bị rút khỏi real-enabled và chỉ còn observe-only. Nếu trade có card thật độc lập
  khác, card đó vẫn được xét; riêng `SHORT_FIT + BC_UTAD` dùng ngưỡng ưu tiên `0,10%` cho toàn trade.
- Cơ sở backtest: paper 14 ngày của key hiện tại n=229, WR 91,7%, AvgROE +6,98%, PF 3,80; Binance exact hiện có từ
  03-11/08. Khi chuẩn hóa margin $3, union key hiện tại n=57 đạt +$3,484; rule cohort nghiên cứu n=53 đạt WR 84,9%,
  AvgROE +2,95%, PF 4,45 và +$4,689. DAY_BEAR chỉ có ba mẫu Binance nên runtime không dùng nhánh test 0,20%.
- Không thêm nhãn/card/checkbox hoặc thay đổi cohort thống kê. Margin `$3` riêng SHORT_FIT, leverage, TP/SL, fill-anchor,
  profit-lock, dedupe và lệnh tay giữ nguyên. Lifecycle/paper mới ghi audit `shortEntry*`/`liveCardShortEntry*` optional;
  field `shortFitEntry*` cũ tiếp tục được ghi, JSON cũ không migration hay rewrite.
### 2026-08-12 - Nhan EXTENDED EMA99 PANIC RECLAIM LONG cho rank 21-60

- Them classifier `LIQUID_HEATMAP_FLOW_V2_EXTENDED_PANIC_RECLAIM_V9_20260812` va paper
  `LIQUID_FLOW_V2_PAPER_V16_EXTENDED_PANIC_RECLAIM_20260812`. Du lieu truoc entry: ticker/rank/volume 24h, 5m EMA99,
  live wick/reclaim, pullback/rebound, volume/taker ba nen va trend 1h/4h da dong; khong dung outcome hay nen tuong lai.
- Scanner giu top 1-20 cu, them rank tang 21-60 theo hai tang: quote volume `>=3M`, 24h `>=3%`, prefilter 5m truoc va
  cap toi da 20 symbol seed day du MTF. Nhan READY yeu cau panic pullback `3-15%`, cham EMA99 `[-2%,+1.2%]`, reclaim
  `[+0.1%,+2%]`, rebound `>=0.3%`, volume `>=1.2x`, taker `>=-25%`, EMA stack/slope va it nhat mot HTF BULL.
- Tao paper LONG va gui Discord webhook rieng, dedupe theo symbol/label/candle. Card thong ke moi dung key exact
  `heatmap-v2:EXTENDED_EMA99_PANIC_RECLAIM_LONG`; default OFF, chi cho checkbox khi CLOSED AvgROE `>4%`.
- Day la `OBSERVE + PAPER ONLY`: khong cap Binance, khong anh huong entry/size/leverage/SL/TP/profit-lock that va khong
  noi long cac nhan cu. JSON cu khong migration; `moverSide/moverRank/universeTier` la optional, thieu thi fallback primary.
### 2026-08-12 - Time-based TP +1% ROE sau 12 giờ

- Thêm `BINANCE_TP_TO_ROE1_AFTER_12H_V1_20260812`, chạy từ Binance position/mark socket với snapshot causal gồm entry, side,
  leverage, Mark/ROE và thời gian fill đã tracking. Position còn mở đủ 12h được thay TP còn lại về gross ROE +1%; LONG/SHORT
  quy đổi theo leverage và làm tròn tick về phía đảm bảo mục tiêu.
- Khi Mark đã cho ROE >=1%, bot gửi reduce-only LIMIT marketable tại target (khớp +1% hoặc tốt hơn) thay vì gửi conditional TP đã bị
  vượt; khi chưa đạt thì đặt `TAKE_PROFIT_MARKET` +1%. Chỉ hủy các close-side TP cũ đúng positionSide, giữ nguyên SL/profit-lock.
- Negative TP-to-entry hiện hữu có ưu tiên trên vị thế bot thường; manual/Liquid Flow V2 vẫn áp time TP. Rule event-driven, idempotent,
  không bật lại missing-TP REST scanner. Không thêm nhãn/card/checkbox hay đổi thống kê; chỉ thêm audit optional `twelveHourTakeProfit*`.
- Có tác động Binance thật lên TP/close quantity còn lại nhưng không đổi entry/margin/leverage/size/SL. JSON cũ không cần migration;
  thiếu `openedAt` thì tính 12h từ lần đầu runtime thấy vị thế, tránh giả định sai tuổi lệnh sau restart.
## 2026-08-12 — Bổ sung PRIMARY panic flush → reclaim cho Liquid Flow V2

- Nâng classifier lên `LIQUID_HEATMAP_FLOW_V2_PRIMARY_PANIC_RECLAIM_V10_20260812`, paper lên
  `LIQUID_FLOW_V2_PAPER_V17_PRIMARY_PANIC_RECLAIM_20260812`, Discord lên
  `LIQUID_FLOW_V2_PANIC_DISCORD_V2_PRIMARY_RECLAIM_20260812`.
- Thêm pha `PRIMARY_EMA99_PANIC_FLUSH_ACTIVE` cho top tăng 1-20 đang pullback `3-20%` về vùng EMA99 5m, volume
  `>=1.2x`, HTF còn ít nhất một khung bullish. Flush được xác nhận bởi taker bán `<=-25%`, hoặc pullback `>=8%` cùng
  volume `>=1.5x`; mark đang ở vùng EMA99 cũng thay cho wick-touch khi live candle chưa đồng bộ. Pha này chỉ ghi nhận
  cú kill xuống và giữ WAIT tới reclaim; không vào paper/Binance và không gửi Discord.
- Chỉ chuyển thành `PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY` khi giá hồi khỏi đáy `>=0.3%`, đóng/reclaim trên EMA99
  `0.1-3%`, có lower-reclaim và taker hiện tại phục hồi lên `>=-25%`. Dữ liệu đều có trước entry; READY tạo paper LONG
  tại mark và gửi Discord một lần theo symbol/label/candle, nhưng vẫn `OBSERVE ONLY`, không cấp lệnh Binance hay đổi
  size/SL/TP thật.
- Hai card thống kê có matcher/checkbox exact `heatmap-v2:PRIMARY_EMA99_PANIC_FLUSH_ACTIVE` và
  `heatmap-v2:PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY`, mặc định OFF. Chỉ CLOSED paper được tính và checkbox chỉ hiện
  nếu AvgROE `>4%`; ACTIVE chưa có paper nên bị khóa. JSON lịch sử cũ vẫn đọc nguyên trạng vì schema chỉ được mở rộng.
### 2026-08-12 - Sửa profit-lock HOLO/lệnh tay không được dời kịp

- Nâng policy lên `BINANCE_PROFIT_LOCK_V12_LIFECYCLE_FAST_FAILSAFE_20260812`. Audit log HOLO cho thấy Binance đã nhiều lần
  từ chối STOP +1% bằng `Order would immediately trigger`; ngoài ra dedupe cũ chỉ theo symbol nên lifecycle mới có thể kế
  thừa trạng thái đã khóa của lifecycle trước.
- Snapshot dùng trước quyết định: position Binance realtime, side, entry, leverage, Mark Price, `openedAt`, open TP/SL và state
  Orders Exclude; không dùng outcome/future candle. Dedupe mới là `symbol|side|entry|openedAt`, reset ở socket full-fill và close.
- Rule phân loại không đổi: manual/Liquid Flow V2 `ROE >=10% -> SL +1%`; non-Exclude tiếp tục ladder `15 -> +5`, `20 -> +10`;
  Exclude cap `+1%`. Threshold được persist thành `profitLockArmed*` trước request để có audit và không bị mất do request lỗi.
- `-2021` nay retry sau 5 giây nếu latest Mark vẫn còn phía an toàn. Nếu latest Mark đã xuyên target, runtime gửi MARKET
  reduce-only đóng phần position còn lại vì STOP target không còn là lệnh hợp lệ trên Binance. Entry/margin/leverage/TP không đổi;
  chỉ SL/exit thật chịu ảnh hưởng. Missing-SL scanner vẫn tắt.
- Không thêm label/card/stat/whitelist và không đổi cách tính báo cáo. JSON cũ tương thích vì toàn bộ field mới là optional,
  không migration/rewrite/backfill.
- Root cause HOLO vòng hai được xác nhận thêm: nến Binance 1m đã vượt ngưỡng ROE +10% trong 13 phút nhưng không có một
  callback SlTrail; mark socket cũ reconnect lặp lại. `POSITION_MONITOR_PER_SYMBOL_MARK_STREAM_V4_20260812` chuyển sang combined
  URL với danh sách symbol ngay lúc connect và rebuild theo position set, vẫn có stale watchdog 15 giây. Không đổi schema JSON.

### 2026-08-12 - Hotfix mất TP/SL khi WSL restart

- Root cause được xác nhận bằng uptime/system journal: cả WSL restart, PM2 daemon biến mất và dump không tự resurrect; fill trong
  khoảng trống chỉ được startup TP-only bù TP nên thiếu SL. Đồng thời log có race `sl-tracking.json.tmp -> sl-tracking.json`
  khiến state lifecycle có thể không lưu.
- Nâng trigger lên `POSITION_PROTECTION_SOCKET_FILL_V3_DURABLE_WATERMARK_20260812`: full-fill socket phải hoàn thành và verify
  protection trước khi ghi `POSITION_PROTECTION_FILL_WATERMARK_V1_20260812`. Startup chỉ replay exact full-fill Binance mới hơn
  watermark, còn mở cùng chiều và không reduce-only; không bật missing-SL/TP scanner định kỳ.
- Watermark dùng chung chỉ tiến sau khi quét thành công mọi symbol đang mở; lỗi ở bất kỳ symbol nào giữ nguyên mốc để retry, và
  exception khi đặt/verify protection được giữ trong biên socket thay vì làm hỏng user-data callback. Exact order ID recovered
  được persist sau toàn batch thành công, không commit một phần giữa vòng quét. Dedupe RAM chỉ ghi sau khi atomic watermark write
  thành công; lỗi persistence giữ fill ở trạng thái có thể retry.
- Replay missed fill dùng average entry/leverage Binance hiện tại, TP manual +30% ROE và SL -25% ROE, giữ nguyên order đã có.
  Trong incident đã bù SL cho `INXUSDT`, `LIGHTUSDT`, `BEATUSDT`, `BICOUSDT`; các position cũ thiếu SL không bị đụng.
- Serialize ghi `sl-tracking`, thay tracking khi entry/orderId lifecycle đổi và bổ sung order-id audit optional. Systemd user unit
  tự resurrect PM2 sau WSL boot/restart. Không đổi signal/label/tier/stats/whitelist, entry/size/margin/leverage; chỉ protection
  sau fill bị ảnh hưởng. JSON cũ không migration; watermark mới khởi tạo ở thời điểm deploy để không backfill lịch sử.

### 2026-08-12 - Chuyển PM2 sang system service, giữ position cũ TP-only

- Root cause lần tái phát: WSL boot mới nhưng không có user login bus, `systemctl --user` không chạy; PM2 dump vì thế không được
  resurrect và web/user-data socket tắt hoàn toàn. Nâng vận hành lên `BINANCE_PROTECTION_SYSTEM_SUPERVISOR_V2_20260812` bằng
  system unit chạy dưới user `thangnguyen`, enable ở `multi-user.target` và dùng PM2_HOME/dump cố định.
- Snapshot recovery chỉ dùng exact Binance trades/orders, watermark và position/open orders hiện tại. Fill mới hơn watermark được
  TP+SL; position legacy có trước boot/watermark chỉ bù TP nếu thiếu, không tự đặt SL và không bật missing-SL scanner định kỳ.
- Không thêm signal/label/tier/stat/whitelist; entry/size/margin/leverage và giá policy không đổi. JSON cũ không migrate; chỉ đổi
  supervisor và cách phân loại lifecycle cũ/mới khi recovery.
### 2026-08-12 - Giữ TP lệnh cũ bằng guard định kỳ, không dựng SL

- Audit sau restart phát hiện `APRUSDT` đã được startup bù TP thành công nhưng TP biến mất về sau trong khi position vẫn mở;
  one-shot startup vì vậy chưa đủ bảo đảm. Nâng thành `BINANCE_TP_ONLY_GUARD_V2_20260812`, chạy lần đầu sau `20s` và lặp `60s`.
- Mỗi vòng chỉ dùng position/open orders Binance và causal TP còn khớp lifecycle. Trước placement luôn re-read riêng symbol;
  existing TP được giữ nguyên. Chỉ thiếu TP thật mới đặt `TAKE_PROFIT_MARKET closePosition=true`; tuyệt đối không đặt, sửa hay bù SL.
- Không đổi signal/label/tier/stat/whitelist, entry/size/margin/leverage. JSON cũ không migrate/rewrite; Liquid Flow V2 thiếu target
  snapshot tiếp tục fail closed thay vì dùng fixed-ROE fallback.

### 2026-08-12 - Sửa triệt để protection bị Binance hủy khi DCA

- Audit `allAlgoOrders` xác nhận AT/BR đã có TP+SL sau full-fill, nhưng SL `quantity + reduceOnly` chuyển `CANCELED`
  sau khi quantity/lifecycle thay đổi; TP `closePosition=true` vẫn còn. Đây là mất order sau placement, không phải socket bỏ lỡ fill.
- Thêm `BINANCE_CLOSE_POSITION_PROTECTION_V1_20260812`: TP/SL của exact fill mới, SL profit-lock thay thế và one-shot fallback đều
  dùng conditional close-position, không gắn quantity/reduceOnly. Giá target, source policy và re-read idempotent không đổi.
- Position legacy vẫn theo yêu cầu TP-only: guard 60 giây chỉ bù TP, tuyệt đối không dựng SL. Không bật periodic missing-SL scanner.
  User-data stream log payload `ALGO_UPDATE` để truy vết exact status/order của các lần hủy sau này.
- Không thêm signal/label/tier/stat/whitelist và không đổi entry/size/margin/leverage. JSON cũ không cần migration/rewrite.

### 2026-08-12 - Khóa race cleanup hủy TP/SL ngay sau fill

- `ALGO_UPDATE` của APR chứng minh TP/SL close-position mới đều vào trạng thái `NEW`, rồi cả hai cùng `CANCELED` sau 3-4 giây.
  TP-only guard dựng lại TP nên trước đây biểu hiện cuối cùng chỉ là “mất SL”.
- Thêm `BINANCE_POSITION_CLOSE_CONFIRM_V1_20260812`: callback `pa=0`, stale-position cleaner và mọi protection cleanup đều phải
  re-read Position Risk Binance. Còn amount khác 0 thì cấm cancel và seed position monitor lại; chỉ flat thật mới cleanup.
- Lệnh close MARKET qua Orders cũng bỏ cleanup theo ACK để tránh request close cũ đua với fill mở lại; socket close xác nhận là chủ sở hữu
  duy nhất của cleanup. Không đổi signal/stat/whitelist, entry/size/giá TP-SL hay JSON; lệnh cũ vẫn TP-only và không được backfill SL.
### 2026-08-13 - Bật Binance MARKET $5 cho LIQ FLOW V2 HTF

- Version paper `LIQUID_FLOW_V2_PAPER_V18_HTF_BINANCE_5USDT_20260813`, entry policy
  `LIVE_CARD_AND_LIQ_FLOW_READY_V7_HTF5_20260813`; pre-entry data/classifier của hai nhãn HTF EMA99 không đổi
  (closed 5m/15m + EMA99/volume/taker, trend 1h/4h, liquidation context causal).
- `HTF_BEAR_15M_EMA99_PUMP_REJECT` phát SHORT và `HTF_BULL_15M_EMA99_DUMP_RECLAIM` phát LONG chỉ ở READY/new OPEN.
  Runtime đặt MARKET margin $5, mặc định 5x; chặn position cùng symbol, claim/clientOrderId chống duplicate và giữ max-position policy.
- TP/SL không đổi công thức: dùng target của trade paper, fill-anchor theo exact Binance fill và lifecycle protection hiện hành.
  Không đổi entry classifier, label/card/stat/whitelist; checkbox cũ vẫn mặc định tắt và chỉ hiện khi closed AvgROE > 4%.
- JSON cũ tương thích nguyên trạng, không migration/replay trade OPEN cũ. Có env riêng để disable/override HTF margin/leverage.

### 2026-08-13 - Siết entry PRE UP/DOWN BASE quanh EMA99

- Nâng classifier lên `LIQUID_HEATMAP_FLOW_V2_PRE_ENTRY_CAP_V11_20260813`, paper lên
  `LIQUID_FLOW_V2_PAPER_V19_PRE_ENTRY_CAP_20260813` và entry policy lên
  `LIVE_CARD_AND_LIQ_FLOW_READY_V8_PRE_ENTRY_CAP_20260813`.
- Backtest 62 paper CLOSED bằng Binance Futures 1m cho thấy chờ limit sau tín hiệu không đủ cải thiện; lọc khoảng cách causal ngay tại tick phát
  hiệu quả hơn. PRE LONG đổi mark reclaim từ `+0.1..+1.2%` thành `+0.1..+0.5%` và tăng rebound từ `>=0.3%` lên `>=0.6%`.
  PRE SHORT đổi mark reject từ `-1.2..-0.1%` thành `-0.5..-0.1%`. Touch râu, EMA stack/dốc, structure, volume và taker guard giữ nguyên.
- Dữ liệu chỉ gồm nến 5m đóng + nến live/mark tại tick, EMA/structure, 24h/1h, volume/taker trước entry; không dùng future candle/outcome.
  SHORT cap 0.5% có 12 mẫu, WR 66.7%, AvgROE +1.92%, PF 1.71; LONG cap 0.5% có 6 mẫu và gần hòa nên thêm rebound 0.6%.
- Giữ nguyên hai label/card và whitelist key hiện hữu; checkbox mặc định tắt, chỉ hiện khi closed AvgROE >4%, không thêm key mới.
  Tín hiệu pass vẫn MARKET `$5 × 5x` và dùng TP/SL/fill-anchor hiện hành; chỉ giảm số entry, không đổi size/leverage/giá target.
- JSON cũ không migrate/rewrite; V1-V18 vẫn thống kê cùng label, V19 ghi version mới để walk-forward/audit và không replay transition cũ.

### 2026-08-13 - Liquid Flow V2 cố định 5x cho mọi lệnh Binance

- Thêm hard lock `LIQUID_FLOW_V2_BINANCE_LEVERAGE = 5`; nâng policy lên
  `LIVE_CARD_AND_LIQ_FLOW_READY_V9_LFV2_FIXED_5X_20260813`, paper V20 và manual UI/API V5.
- Auto BASE/PRE/HTF và nút MARKET/LIMIT trên `/liquid-flow-v2` đều lấy 5x từ server; request client/settings/env leverage khác 5 bị bỏ qua.
  UI hiển thị LEV 5 read-only. Margin vẫn theo cohort hoặc input người dùng, nên notional lệnh mới luôn bằng `margin × 5`.
- Không đổi dữ liệu causal, classifier/label/tier/stat/whitelist, entry mode, TP/SL plan, fill-anchor, DCA/duplicate/max-position policy.
  Không quét đổi position cũ; DCA mới sẽ set symbol 5x trước khi submit.
- JSON/trade cũ không migrate hay rewrite; leverage/outcome lịch sử giữ nguyên, runtime settings legacy được normalize 5 và trade mới ghi version mới.

### 2026-08-13 - Thêm EMA FAN LONG READY, paper $10 và Binance $1

- Nâng classifier/paper/policy lần lượt lên `LIQUID_HEATMAP_FLOW_V2_EMA_FAN_V12_20260813`,
  `LIQUID_FLOW_V2_PAPER_V21_EMA_FAN_20260813` và `LIVE_CARD_AND_LIQ_FLOW_READY_V10_EMA_FAN_20260813`.
- Nhãn `EMA_FAN_LONG_READY` dùng top tăng hạng 1-50 có quote volume 24h tối thiểu `$2M` và nến 5m đã đóng: EMA13/25/99 phải nén trong 12 nến, breakout vượt
  band/high 12 nến bằng thân tăng + volume, sau đó ba EMA xếp bullish và hai gap cùng nới rộng trong tối đa 4 nến. Cap WATCH là
  `3%` trên EMA13, cap READY là `4%`; RSI guard lần lượt `50..78` và `<=85`. Không dùng nến live/future outcome.
- Nhãn là secondary label nên không che primary. Card dùng key `heatmap-v2:EMA_FAN_LONG_READY`, mặc định whitelist tắt và checkbox
  chỉ mở khi CLOSED AvgROE riêng nhãn `>4%`. Replay top50 ngày hiện tại cho 24 READY: 19 TP, 0 SL, 1 TIME, 4 OPEN nhưng có winner bias.
- Transition mới tạo paper `$10 x 5`, TP `+10% ROE`, SL `-25% ROE`, timeout 12h và đồng thời xin Binance MARKET `$1 x 5`.
  Existing-position guard, one-shot claim, clientOrderId, fill-anchor TP/SL và stale-start guard được giữ. JSON cũ không migrate/rewrite;
  các field/settings mới optional và signalKey dùng closeTime nến READY để chống duplicate.

### 2026-08-13 - Thêm EMA FAN SHORT READY ở chế độ paper-only

- Nâng classifier lên `LIQUID_HEATMAP_FLOW_V2_EMA_FAN_SHORT_PAPER_V13_20260813` và paper lên
  `LIQUID_FLOW_V2_PAPER_V22_EMA_FAN_SHORT_20260813`; không đổi entry-policy Binance V10.
- `EMA_FAN_SHORT_READY` quét top 150 Futures theo quote volume 24h (tối thiểu `$2M`) và chỉ xét snapshot đang giảm ít nhất `5%`.
  Nến 5m đóng phải có EMA13/25/99 nén trong 12 nến, breakdown low + toàn band bằng thân giảm `>=0.4%` và volume `>=2.5x`,
  sau đó xếp `EMA13 < EMA25 < EMA99` với hai gap nới rộng trong tối đa 4 nến. WATCH cap dưới EMA13 `2.5%`, READY cap `4%`;
  RSI guard lần lượt `22..50` và `>=15`. Không dùng nến live/future outcome.
- Replay ngày 2026-08-13 của cohort `change24h <= -5%` có 11 tín hiệu: 8 TP, 1 SL, 2 OPEN; settled WR `88.9%`, AvgROE `+6.11%`,
  PF `3.20`. Mẫu nhỏ nên chỉ tạo paper `$10 × 5x`, TP `+10% ROE`, SL `-25% ROE`, timeout 12h.
- Thêm card/checkbox exact key `heatmap-v2:EMA_FAN_SHORT_READY`; mặc định tắt và chỉ hiện khi CLOSED AvgROE riêng nhãn `>4%`.
  Nhãn không nằm trong real-label allowlist, auto profile luôn `eligible=false`; checkbox không cấp quyền Binance và không ảnh hưởng entry/size/SL/TP thật.
- JSON cũ giữ nguyên; `emaFanShort5m` là snapshot optional, không migrate/rewrite outcome cũ và signalKey exact closeTime tiếp tục chống duplicate.

### 2026-08-13 - Gửi EMA FAN READY sang Discord riêng

- Thêm `LIQUID_FLOW_V2_EMA_FAN_DISCORD_V1_20260813` cho cả `EMA_FAN_LONG_READY` và `EMA_FAN_SHORT_READY`; webhook lấy từ
  `LIQ_FLOW_V2_EMA_FAN_WEBHOOK_URL`, không ghi secret vào source hoặc tài liệu.
- Chỉ gửi transition READY mới bằng exact `readyLabelKeys`, kể cả khi EMA FAN nằm trong secondary labels. Dedupe theo symbol + label + closeTime nến READY
  trong 24h; restart vẫn tuân thủ stale-start guard hiện hành nên không replay tín hiệu cũ.
- Payload hiển thị rank, change 24h/1h, mark, ba EMA/gap, compression, volume/RSI, distance EMA13 và paper plan. Không đổi classifier,
  paper/stat/whitelist hay JSON; không ảnh hưởng entry/size/TP/SL Binance. EMA FAN SHORT vẫn PAPER ONLY.

### 2026-08-14 - Route EMA FAN LONG: impulse MARKET $5, thường LIMIT-fill rồi MARKET $1

- Nâng version lên classifier V14, paper V23, auto-Binance V11 và Discord V2. Detector causal chỉ dùng rank/snapshot hiện tại cùng nến 5m đã đóng;
  không dùng future candle hoặc outcome. `EMA_FAN_LONG_IMPULSE_RUNNER` là nhánh mạnh của EMA FAN: rank `<=100`, volume `>=5x`, body `>=1%`,
  READY cách EMA13 `<=3%`; nhánh thường `EMA_FAN_LONG_READY` giữ rank `<=50` và loại impulse ra.
- Impulse tạo paper MARKET `$10 × 5x` và Binance MARKET `$5 × 5x` ngay khi READY. Nhánh thường tạo paper LIMIT ở
  `EMA13 × 1.01` trong 15 phút; chưa fill không có Binance order, paper fill mới đặt Binance MARKET `$1 × 5x` đúng một lần.
  Cancel/timeout không đặt thật. Existing-position, claim/clientOrderId dedupe, max-position và fill-anchor protection giữ nguyên.
- Exit không đổi: TP `+10% ROE`, SL `-25% ROE`, max 12h. EMA FAN SHORT vẫn paper-only. Discord hiển thị đúng entry route của từng nhánh.
- Thêm card/checkbox `heatmap-v2:EMA_FAN_LONG_IMPULSE_RUNNER`, mặc định tắt, UI/runtime exact key và chỉ hiện khi CLOSED AvgROE `>4%`;
  nhãn thường giữ key cũ và thống kê tách riêng. JSON cũ không migrate/rewrite; settings mới optional có default và signalKey exact label + READY closeTime.

### 2026-08-14 - Không dựng lại TP/SL khi fill là DCA cùng chiều

- Thêm `BINANCE_DCA_KEEP_EXISTING_TP_SL_V1_20260814`, nâng manual Liquid Flow V2 lên V6. Preflight dùng position snapshot Binance;
  socket dùng side/positionSide, full-fill cumulative qty và position amount sau fill để nhận biết add-position causal.
- Order DCA vẫn mở thêm đúng margin/size/leverage nhưng không tạo/ghi đè signal-protection plan, không submit TP/SL mới, không chạy fallback
  và không reset profit-lock. Protection hiện hữu của vị thế gốc được giữ; nếu đang thiếu thì DCA cũng không tự bù. Position mới vẫn nhận protection lần đầu.
- Không đổi signal/label/tier/card/stat/whitelist hoặc entry classifier. JSON cũ không migrate; chỉ thêm hai audit field optional cho DCA mới.

### 2026-08-14 - Màn thống kê lệnh Binance thật Liquid Flow V2

- Thêm `LIQUID_FLOW_V2_BINANCE_STATS_V1_20260814` trên màn riêng `/liquid-flow-v2-binance-stats`: datepicker từ/đến theo Bangkok, select exact loại tín hiệu,
  KPI NET/realized/unrealized/WR/PF/AvgROE, breakdown theo nhãn và chi tiết thắng/thua có entry slippage + phân trang.
- Trang scanner `/liquid-flow-v2` chỉ có link mở thống kê, không tải module/API Income; SSE và render tín hiệu không còn chờ lịch sử Binance.
- Cohort causal chỉ nhận trade V2 có Binance fill đã lưu. CLOSED PnL lấy Binance Income theo exact symbol và cửa sổ lifecycle fill→close;
  OPEN PnL lấy position Binance đúng symbol/side. Paper outcome/PnL chỉ để so sánh, không fallback vào thống kê thật; missing được đếm riêng.
- Nguyên nhân đóng hiển thị TAKE_PROFIT/STOP_LOSS/TIME_EXIT/OTHER_CLOSE/OPEN và chênh signal entry so với fill Binance để truy lỗi entry.
  Không đổi dữ liệu trước entry, classifier, gate, entry/size/leverage/SL/TP, không thêm label/card/whitelist. JSON cũ không migrate/rewrite.

### 2026-08-17 - Thử cào CoinGlass Model 3 cho top 20 Binance volume

- Thêm web lab `COINGLASS_WEB_MODEL3_TOP20_V1_20260817` tại `/coinglass-web-top20`, cố định `OBSERVE_ONLY`; child process Playwright chỉ chạy
  thủ công, tách khỏi scheduler/scanner hiện hành. Universe lấy public Binance Futures `exchangeInfo` + ticker 24h, giữ contract USDT perpetual
  đang trading và xếp top 20 theo quote volume trước khi mở CoinGlass Model 3 48h từng coin.
- State causal của trang CoinGlass gồm `prices/y/liq/range/updateTime`; collector tổng hợp intensity theo price bin, chọn peak cách nhau ít nhất ba bin,
  lưu tối đa 12 vùng cùng ảnh canvas và chỉ đếm success/failure/cell trên trang riêng. Không tạo label/tier/gate, không tham gia paper W/L/WR/PF/AvgROE/NET.
  Seed top-20 từ in-app browser cho thấy BTC ở `SCREEN_ONLY`, còn 19 altcoin bị overlay `Log in to unlock full data` nên gắn
  `LOGIN_REQUIRED`; ảnh giữ làm bằng chứng nhưng cell/zone để null/rỗng. Chỉ exact state `instrumentId` được collector giải mã thành công mới
  mang `OK` và có zone summary; không coi heading đổi coin là thành công và không suy diễn zone bằng OCR từ ảnh.
  Lượt web bị anti-bot chặn sẽ giữ exact-symbol image cuối cùng dưới trạng thái `STALE_LAST_GOOD` và công khai lỗi/fresh count, không ghi đè ảnh tốt bằng canvas lỗi.
- Không thêm card/checkbox whitelist. Matcher giao dịch và policy mặc định OFF + chỉ hiện khi CLOSED AvgROE `>4%` giữ nguyên; snapshot này không thể
  cấp quyền order. Contract isolation xác nhận không ảnh hưởng Binance/entry/size/SL/TP, không gọi paper manager/order/protection.
- Store mới `data/coinglass-web-top20/` được git-ignore; JSON cũ không có store sẽ đọc thành danh sách rỗng. Không migrate/rewrite paper/signal/settings,
  và lỗi crawler không chặn server hay bất kỳ luồng trading hiện tại.
  Host mới cài browser bundle bằng `npm run setup:coinglass-web-browser`; browser binaries/runtime local không commit vào Git.

### 2026-08-17 - Đổi CoinGlass lab sang BTC + coin có liquidity và vùng giá đề xuất

- Nâng collector lên `COINGLASS_WEB_MODEL3_LIQUID_MARKETS_V2_20260817`, proposal lên
  `COINGLASS_WEB_ZONE_PROPOSAL_V1_20260817`, vẫn tuyệt đối `OBSERVE_ONLY`. Dữ liệu trước quyết định gồm Binance public
  `exchangeInfo/ticker/bookTicker/openInterest` và exact React state CoinGlass Model 3 48h; không dùng outcome/future candle.
- BTC luôn có mặt. Altcoin qua tầng Binance khi volume `>= $50M`, trades `>=20K`, OI notional `>= $5M`, min best bid/ask notional
  `>= $5K`, spread `<=15 bps`; sau đó qua tầng CoinGlass khi có `>=100` liquidation cells, `>=2` peak trong `±20%` và ít nhất một peak
  bền `>=3` bars. Coin chỉ lớn về volume nhưng không có thanh khoản/cụm thanh lý bị ghi vào exclusions và không chiếm top 20.
- Vùng thanh lý chọn local peak cách ít nhất ba bins, dành tối đa sáu vùng cho mỗi phía. Điểm hút dùng relative strength, khoảng cách và
  persistence; chênh ít nhất `1.25x` cùng target trong `15%` mới gợi ý `CANH LONG/SHORT`, còn lại `CHỜ`. Long phải đợi reclaim/retest,
  short phải đợi sweep-reject/breakdown-retest. Thống kê chỉ đếm structured/long/short/wait, không tính W/L, WR, PF, AvgROE hay NET.
- Bỏ ảnh crop khỏi UI chính; card hiển thị target/risk zone, distance, strength, persistence và Binance volume/OI/top-book/spread.
  Thêm persistent profile riêng và nút mở login visible; người dùng tự đăng nhập, collector verify exact ETH altcoin access. Không chạm profile
  hoặc cookie Chrome cá nhân, nên login trên Chrome thường không được coi là login của collector.
- Không thêm signal/label/tier/gate/card giao dịch hay whitelist checkbox. Mọi policy whitelist cũ giữ mặc định tắt và điều kiện CLOSED
  AvgROE `>4%`. Không ảnh hưởng Binance/entry/size/leverage/SL/TP, paper, scanner hoặc protection.
- JSON V1 tương thích forward: field auth/liquidity/proposal/exclusions mới là optional; row cũ thiếu proposal hiển thị `NO_DATA`.
  API loại row V1 không đạt liquidity khỏi view, báo `viewLiquidityExcluded` và dựng proposal đọc-time cho BTC cũ; không rewrite file.
  Không migrate/rewrite/backfill bất kỳ trade/signal/settings cũ; store/profile browser vẫn nằm trong thư mục git-ignore.

### 2026-08-17 - Sửa universe CoinGlass theo Binance Top tăng / Top giảm

- Nâng collector/universe lên `COINGLASS_WEB_BINANCE_MOVERS_LIQUIDITY_V4_20260817`; proposal giữ
  `COINGLASS_WEB_ZONE_PROPOSAL_V1_20260817` và `OBSERVE_ONLY`. Root cause V2 là lấy top `quoteVolume`, khiến các market lớn như
  SOL/PEPE xuất hiện dù không nằm trong nhóm biến động mà người dùng cần.
- Dữ liệu trước phân loại vẫn chỉ là Binance public snapshot hiện tại. V3 tái sử dụng exact selector Liquid Flow V2:
  `UP` sort `change24hPct DESC`, `DOWN` sort `change24hPct ASC`, volume chỉ tie-break; BTC thêm riêng làm reference và hai phía xen kẽ theo rank.
  Bộ lọc volume `>= $50M`, trades `>=20K`, OI `>= $5M`, spread `<=15 bps` chỉ loại market mỏng,
  tuyệt đối không sắp lại thứ hạng movers. CoinGlass cluster filter sau đó cũng giữ nguyên thứ tự này.
- Audit live V3 cho thấy hard gate min best bid/ask `$5K` loại oan PORTAL/HEMI/GPS dù volume/OI cao, vì best level chỉ là một tick.
  V4 giữ top-book notional để hiển thị/audit nhưng bỏ khỏi điều kiện pass; cluster CoinGlass mới là xác nhận thanh lý cuối.
- Thống kê/card thêm `moverSide/moverRank` và tổng số top tăng/top giảm. Logic vùng, target/risk và yêu cầu xác nhận LONG/SHORT không đổi;
  không tính paper W/L, WR, PF, AvgROE, NET.
- Không thêm signal/label/tier/gate/card giao dịch hoặc whitelist checkbox. Không ảnh hưởng Binance, entry, size, leverage, SL/TP, paper,
  scanner hay protection. Snapshot trước V4 chỉ giữ BTC reference; altcoin fail-closed khỏi view cho đến snapshot exact V4,
  tránh gọi nhầm top-volume legacy là mover. Không migrate hoặc rewrite JSON cũ.

### 2026-08-17 - Tự quét 40 CoinGlass movers mỗi 3 phút và gửi Discord

- Nâng collector lên `COINGLASS_WEB_SCHEDULED_MOVERS_V5_20260817`, thêm notifier `COINGLASS_WEB_DISCORD_V1_20260817`;
  proposal V1 và mode `OBSERVE_ONLY` giữ nguyên. Scheduler mặc định `180000ms`, scan limit 40, không chạy chồng khi lượt trước/login còn active.
- Mỗi lượt dùng snapshot Binance + CoinGlass causal hiện tại, crawl BTC và khoảng 39 top tăng/giảm xen kẽ. Khác V4, toàn bộ cohort được publish
  lên màn hình; row lỗi/stale/không đạt vẫn có card và reason, không bị ẩn. Delay giữa symbol giảm để một vòng 40 coin nằm trong chu kỳ 3 phút.
- `qualified` chỉ true khi fresh `OK`, pass volume/trades/OI/spread, pass cell/peak/persistence và proposal directional LONG/SHORT.
  Discord gửi riêng các row này, dedupe `symbol+action` 30 phút, throttle/retry 429; balance/no-data không gửi.
- Nếu persistent profile chưa login/không có quyền altcoin hoặc crawl trả login/permission error, gửi cảnh báo Discord `AUTH_REQUIRED`
  kèm link trang login, cooldown 60 phút. Notification state/dedupe lưu optional ở `data/coinglass-web-top20/notifications.json`.
- Không thêm label/tier/gate/card giao dịch/whitelist checkbox; thống kê chỉ scanned/qualified/top up-down/long-short. Không ảnh hưởng
  Binance, entry, size, leverage, SL/TP, paper, scanner hoặc protection. JSON trước V5 chỉ giữ BTC fail-closed, không migrate/rewrite.
