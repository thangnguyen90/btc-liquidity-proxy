# Binance auto entry controls

### 2026-09-26 — Bỏ qua TP/SL tự gỡ tại +15% hoặc −25% ROE · V4

- Runtime version `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V4_AUTO_RESUME_ROE15_OR_NEG25_20260926`. Dữ liệu causal là ROE live hữu hạn của vị thế Binance đang mở, tính từ average entry, MARK và leverage. Exact symbol đang nằm trong `protectionExclusions` được xóa/persist khi `ROE >= +15%` hoặc `ROE <= -25%`; `+14,999%` và `-24,999%` vẫn giữ ngoại lệ. LONG/SHORT dùng cùng hai biên.
- Đây là thay đổi vòng đời của ngoại lệ, không phải signal/tier/gate entry. Sau khi gỡ, TP/SL scanner, SL trail/profit-lock và Fast Wave được phép quản lý lại theo policy đang có. Nó không tự MARKET-close, không đổi entry/margin/size/leverage và không tự đặt một mức TP/SL riêng; ở nhánh âm, protection được bù ở lượt scanner hợp lệ kế tiếp. Save lỗi giữ exclusion fail-safe. Close/reversal vẫn reset như trước.
- Không đổi thống kê W/L/PF/AvgROE, Discord hoặc route entry; không thêm label/card nên không thêm WHITELIST. Policy checkbox hiện hữu vẫn default OFF và chỉ hiện khi CLOSED AvgROE `>4%`.
- JSON cũ tương thích nguyên mảng `protectionExclusions`; chỉ nâng `protectionExclusionVersion`, không migrate/rewrite trade JSON. Test bao phủ hai biên, NaN/excluded=false, xóa atomically qua restart, thứ tự callback trước protection handler và nội dung UI; không gọi Binance thật.

### 2026-09-26 — Bỏ qua TP/SL tự gỡ tại +15% ROE · V3

- Runtime version `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V3_AUTO_RESUME_ROE15_20260926`. Exact symbol trong `protectionExclusions` tự được xóa/persist khi ROE live của vị thế đang mở >=15%, cho cả LONG/SHORT. Threshold dùng so sánh inclusive; thiếu/NaN hoặc dưới15 không gỡ.
- Sau khi gỡ, profit-lock chạy tiếp trong cùng tick và các protection scanner trở lại bình thường; thao tác auto-resume không tự đặt MARKET, không đổi entry/size/leverage hay tự định nghĩa TP/SL. Mức lock và các exception của policy profit-lock cũ giữ nguyên. Save lỗi thì giữ khóa fail-safe.
- Close/reversal vẫn reset, giảm vị thế/DCA không reset trước15%. UI và confirm giải thích +15% ROE; không có card/WHITELIST/stat mới. JSON cũ tương thích nguyên mảng; không migrate lịch sử. Server đã reload và API runtime trả V3; nếu Binance rate gate đang block thì chờ position monitor có ROE trở lại, không fail-open.

### 2026-09-26 — TP âm sau 3h về entry · V2 (chờ restart)

- Policy `BINANCE_NEGATIVE_TP_TO_ENTRY_AFTER_3H_V2_20260926` dùng fill timestamp/orderId và position hiện tại sau entry, không thay dữ liệu/gate phát tín hiệu. Tuổi >=3h và ROE<0 cho cả LONG/SHORT; không ảnh hưởng entry/size/SL, không thêm quyền mở lệnh hoặc WHITELIST/card thống kê.
- Cap TSL và protection exclusion giữ nguyên. Missing/adopted fill metadata không kích hoạt, không lấy first-seen thay fill. DCA tracking hiện tại ghi lại fill mới và bắt đầu lại tuổi. Alias AFTER_8H config/import được giữ; AFTER_3H config ưu tiên; không migration JSON hoặc đổi thống kê lịch sử.
- TP mới là LIMIT close ở entry theo tick (one-way reduceOnly, hedge positionSide). Age branch giữ SL/opening LIMIT/chiều đối diện, chỉ dọn TP cũ sau khi replacement thành công. PnL ròng vẫn có thể âm vì phí/funding. Không chờ FastWave khi đủ tuổi; rate gate/cooldown/exchange failure vẫn có thể trì hoãn thao tác.
- Test policy + executor mock, không thao tác tài khoản thật. Chưa restart bot; bản đang chạy không tự nhận source này.

### 2026-09-26 — BTC Session Watch V1 là OBSERVE ONLY

- Trang `/btc-session-watch.html` không có submit MARKET/LIMIT, không executor, không ảnh hưởng lệnh/size/SL/TP đang chạy. Tín hiệu UI dùng vùng retest Coin Level nến đóng + xu hướng BTC health1h/4h hiện có (có thể gồm nến đang chạy) + socket, không là bản live của nghiên cứu55 ngày.
- Reserved whitelist keys exact `btc-session:{LONG|SHORT}:{NIGHT|MORNING|OTHER}`; `sessionCardKey` dùng cho UI và runtime matcher, whitelist V18. Default OFF; JSON trade cũ không có `btcSessionObservation` exact version V1/side/window sẽ không match. Không thêm default keys hoặc rewrite state cũ.
- Nối UI checkbox theo `installLiveCardWhitelistUi`; chỉ hiện với closed AvgROE >4%, không suy từ source entryScore hoặc return nghiên cứu. Chưa có sổ closed riêng cho nhóm này, do đó hiện ẩn checkbox, không nhận quyền Binance. Stats count/rank là quan sát chứ không hiệu quả giao dịch. Test `test-btc-session-watch.mjs` kiểm boundary4%, closed0, key parity, metadata cũ, no order endpoint.

### 2026-09-26 — SAGAUSDT 15m closed rejection SHORT 6 USDT

- Thêm checkbox exact `extreme-short-squeeze-saga-15m /
  FOLLOW_REJECTION_CLOSED / SHORT`, matcher bắt buộc SAGAUSDT và nến 15m đã đóng.
  Mặc định catalog 6 USDT margin ×5, TP +15% ROE; SL executor -30% ROE từ full fill.
  Máy hiện tại master ON và route ON từ `2026-09-26T05:07:50.471Z`.
- Chỉ nến follow thứ 1–3 trả lại >=50% cú spike, không tạo higher high, event <=90
  giây và sau `enabledAt` mới được xét. Mark drift <=0,5%, không position/entry order,
  cooldown 4 giờ; không DCA/replay. Nến live, timeframe/symbol khác và two-side sweep
  không dùng route này.
- Route/state là additive và không thay setting ba route Extreme Squeeze cũ. Không có
  performance card/WHITELIST mới; thống kê dựa trên fill thật và policy CLOSED
  AvgROE >4% mặc định OFF không đổi.

### 2026-09-25 — Dành quota REST cho vị thế và TP/SL

- `BINANCE_INCOME_QUERY_COORDINATOR_V1_BUDGETED_SERIAL_CACHE_20260925` chuyển phần
  thống kê `/fapi/v1/income` sang priority thấp, single-flight, tuần tự, tối đa bốn
  request/job, gap 3 giây, cache/cooldown 15 phút và reserve 600 weight. Khi thiếu
  quota, stats stale/fail-closed; không tranh request với order/protection.
- Đây không phải route/checkbox hoặc WHITELIST. Không đổi master, matcher, enabledAt,
  entry, size, leverage, SL/TP hay vị thế/lệnh cũ. JSON rate-gate chỉ thêm field
  `incomeQuery` optional; các client cũ tương thích.

### 2026-09-25 — Route 1h/4h chỉ vào case thuộc bốn stage ưu tiên

- Versions LONG/SHORT 1h và LONG 4h nâng lên `PRIORITY_TOUCH V2`; thêm exact route
  `post-pump-volume-fade-4h / SHORT_IDEAL_ENTRY_TOUCH / SHORT` version
  `POST_MOVE_IDEAL_SHORT_4H_PRIORITY_TOUCH_MARKET_10USDT_V1_20260925`. Policy V36,
  catalog V11 (27 route) và controls V22.
- Checkbox runtime khớp exact matcher. LONG chỉ cho `LONG_FRESH_REVERSAL` hoặc
  `LONG_FIRST_STRONG_CANDLE`; SHORT chỉ cho `SHORT_NEAR_TOP` hoặc
  `SHORT_FIRST_STRONG_CANDLE`. Route mới seed OFF và được bật explicit; lưu input
  không tự bật route. Các route cũ giữ nguyên enabledAt và giá trị đã lưu.
- 1h/4h vẫn cần crossing vào vùng, mark live còn trong vùng, touch <=60 giây, drift
  <=0,5%, không position/entry-order cùng coin. LONG 1h $5; SHORT 1h/LONG 4h/SHORT
  4h $10, đều 5x; LONG TP10/SL20, SHORT TP6/SL30 ROE. Không DCA/replay.
- Không thêm performance card hay checkbox WHITELIST; policy chỉ hiện WHITELIST khi
  CLOSED AvgROE >4% và mặc định OFF giữ nguyên. JSON/state additive; thiếu stage key
  fail-closed, không migrate/backfill.

### 2026-09-25 — Bốn giai đoạn ưu tiên 15m vào MARKET 2 USDT, trần 15 vị thế

- Version `POST_MOVE_PRIORITY_STAGE_15M_MARKET_2USDT_MAX15_V1_20260925`. Hai
  checkbox exact mới là `LONG_PRIORITY_STAGE_15M/LONG` trên stream hậu xả 15m và
  `SHORT_PRIORITY_STAGE_15M/SHORT` trên stream hậu bơm 15m. Catalog seed OFF; máy
  hiện tại bật theo yêu cầu. Chỉ stage key LONG fresh/first recovery hoặc SHORT near
  top/first sell được matcher runtime chấp nhận; extended/watch/weak không có quyền.
- Bật/restart baseline candidate đang có; chỉ tín hiệu mới, <=60 giây, sau enabledAt,
  drift mark <=0,5%, không position/entry order cùng coin mới MARKET. Dedupe một lần
  mỗi anchor; tài khoản >=15 vị thế mở bị chặn và payload bắt buộc
  `maxOpenPositions=15`.
- Mặc định margin 2 USDT ×5; LONG TP +10% ROE/SL -20%, SHORT TP +6%/SL -30%, full
  fill mới neo protection. Margin/leverage/TP có input exact route như nhóm other;
  việc lưu không tự bật route. Không DCA hoặc sửa position/order cũ.
- Đây là route thực thi có checkbox mặc định OFF, không phải performance card nên
  không thêm WHITELIST mới; policy CLOSED AvgROE >4% giữ nguyên. Controls/state/audit
  JSON additive, dữ liệu cũ thiếu `moveStage` fail-closed, không backfill/replay.

### 2026-09-25 — Giai đoạn nhịp giá hậu xả/hậu bơm và exact route

- `POST_MOVE_STAGE_UI_DISCORD_V1_20260925` chỉ thêm field/badge `moveStage` vào hai
  snapshot, bảng LONG/SHORT và Discord chạm vùng. Các giá trị mới sập/sát đỉnh, nến
  mạnh đầu tiên, đã chạy xa, đang theo dõi hoặc yếu không phải matcher/gate Binance.
- Chỉ các exact route 15m/1h/4h được phép đọc bốn key ưu tiên; nhãn ở consumer khác
  không tự cấp quyền. Không thêm checkbox WHITELIST; policy CLOSED AvgROE >4%
  và mặc định OFF giữ nguyên. Entry, margin, leverage, TP/SL theo từng route phía trên.
  Field JSON optional additive, dữ liệu
  cũ thiếu field vẫn đọc được và không replay alert/lệnh.

### 2026-09-22 — Ưu tiên runtime Liquid Flow V2, không đổi quyền lệnh

- `LIQUID_FLOW_V2_STARTUP_PRIORITY_V1_20260922` nạp Liquid Flow V2 trước và dời việc parse các paper store lịch sử sang hàng tuần tự sau 90 giây; PM2 có heap 12 GiB/restart 14 GiB. Pump WAL có fallback archive qua filesystem khác nhưng chỉ tác động paper state. Việc này không đổi master/route, enabledAt, signal gate, entry/size/leverage/SL/TP, position/order hiện tại hoặc matcher Binance. Recommended source-file reconciliation mặc định OFF chỉ là recovery lịch sử; source-open live không đổi. Không thêm label/card/WHITELIST, không migrate JSON và không phát lại signal cũ.

### 2026-09-21 — Trạng thái nến Discord Coin Level không đổi quyền Binance

- `COIN_LEVEL_ENTRY_WATCH_DISCORD_V7_CANDLE_STATUS_20260921` chỉ hiện trạng thái nến từ `retestAt` trong Discord: chưa retest thì nhắc có thể xét LIMIT tại entry; đã retest thì nhắc đủ trạng thái nến để xét MARKET theo route. Đây không phải gate/quyền lệnh và không xác nhận đã đặt/khớp; mọi master/route, enabledAt, tuổi/drift, no-position/no-order, entry/size/leverage/SL/TP và pending LIMIT giữ nguyên. Không thêm label/card/WHITELIST, không đổi thống kê hoặc JSON cũ và không replay tin đã gửi.

### 2026-09-21 — LONG sớm Coin Level không phải route Binance

- `COIN_LEVEL_EARLY_LONG_WATCH_V1_20260921` chỉ thêm watch UI/API từ nến đóng/fresh trước entry: sát đỉnh 12 nến 15m (−0,8%/+0,35%), 15m UP + 1h UP/MIXED, EMA13/25 + đáy nâng, volume/taker mua đủ và guard không đuổi theo ATR. Vùng phá/retest và vô hiệu chỉ tham khảo; không Discord/lệnh, không đổi confirmed gate, size/leverage/SL/TP/fill stats. Không thêm label/card route/WHITELIST; matcher `RETEST_LONG_READY/RETEST_SHORT_READY`, seed OFF, policy closed AvgROE >4% và JSON cũ giữ nguyên.

### 2026-09-21 — SHORT sớm Coin Level không phải route Binance

- `COIN_LEVEL_EARLY_SHORT_WATCH_V1_20260921` chỉ thêm watch UI/API dùng nến đã đóng/fresh 5m/15m/1h/4h: pump ≥8%, rời đỉnh 0,5–6%, mất EMA13 5m + lower-high/râu trên, volume ≥50k USDT và ≥1,3× median20, taker bán ≥52%. Vùng hồi EMA13 ±0,15% và vô hiệu trên đỉnh +0,25% chỉ tham khảo; không gửi Discord hoặc lệnh. Không đổi classifier confirmed SHORT, entry/size/SL/TP, fill stats, route matcher `RETEST_SHORT_READY`, checkbox WHITELIST seed OFF và chỉ hiện khi closed AvgROE >4%. Không thêm label/card stats/route. API chỉ thêm mảng/count, JSON cũ không migrate/rewrite và không replay.

### 2026-09-21 — Hủy LIMIT Coin Level khi breakout gốc vô hiệu

- `COIN_LEVEL_PENDING_LIMIT_INVALIDATION_V1_20260921` + executor `COIN_LEVEL_ENTRY_WATCH_LIMIT_3USDT_V3_INVALIDATION_20260921`: cleaner 35 giây xét **chỉ** pending `clel_` có metadata exact breakout trong attempt JSON mới. Dữ liệu trước entry/classifier gốc không đổi: nến 5m/15m/1h/4h đã đóng, Trend Score ±12, 15m/1h đồng hướng, close15m phá 12 nến. Sau submit phải có nến 5m mới và đủ bốn cache fresh/liên tục; hai lượt `INVALID` cùng nến/lý do mới hủy. Mất dữ liệu, lỗi analyzer hoặc rớt khỏi top30 không hủy; vẫn có TTL 45 phút và startup expiry cũ.
- Chỉ hủy phần LIMIT chưa khớp sau khi xác nhận trạng thái Binance `NEW/PARTIALLY_FILLED`. Partial fill giữ vị thế, refresh position và thử áp TP/SL theo plan; thiếu plan thì hoãn **hủy sớm** và báo lỗi. Không sửa TP/SL đang có, không đụng DCA, MARKET hoặc route khác; entry 3 USDT margin, leverage/TP route và SL −30% ROE giữ nguyên. Daily stats chỉ tính fill thật, không tính cancel. Exact matcher và key UI `RETEST_LONG_READY/SHORT_READY` không đổi, checkbox seed OFF và WHITELIST closed AvgROE >4% giữ nguyên; không thêm card/label. Attempt cũ thiếu metadata chỉ dùng expiry cũ, không migrate/rewrite; candidate/API JSON cũ không đổi.

### 2026-09-20 — Coin Level LIMIT 3 USDT tại entry dự kiến

- `COIN_LEVEL_ENTRY_WATCH_LIMIT_3USDT_V2_20260920`: cùng hai checkbox route/label cũ (key UI khớp matcher runtime `RETEST_LONG_READY/LONG`, `RETEST_SHORT_READY/SHORT`; seed OFF). Không tạo card thống kê/WHITELIST mới; policy WHITELIST chỉ hiện khi closed AvgROE >4%, mặc định OFF giữ nguyên. Input causal trước entry là candidate Coin Level V3 từ nến đóng/fresh 5m/15m/1h/4h, Trend Score ±12, 15m/1h đồng hướng và phá biên 12 nến. Candidate chưa retest + close5m/mark qua giá dự kiến 0,15–5% + signal ≤90 giây, sau thời điểm bật route và sau khởi động thì xét GTC LIMIT 3 USDT margin tại entry; LONG BUY dưới mark, SHORT SELL trên mark. Binance REST kiểm lại tick/mark trước submit; không position/open-entry cùng coin, cooldown4h/max30 vị thế. Lệnh chờ hủy sau45 phút, kể cả nếu expiry chung tắt. Có retest5m đóng thì nhánh MARKET margin route (mặc định1 USDT) giữ nguyên; cả hai dùng dedupe chung.
- LIMIT dùng leverage và TP ROE route, SL −30% ROE, bảo vệ chỉ sau full fill; partial fill không được mô tả là đã có TP/SL. Stats chỉ tính fill thật, không tính LIMIT chờ. Discord/bảng không xác nhận Binance đã nhận lệnh. Entry Score/T1–T3 chỉ đánh giá, không là gate. Policy `LIVE_CARD_LIQ_FLOW_COIN_LEVEL_LIMIT_V30_20260920`, Discord V5. JSON control/snapshot/audit cũ không migrate/rewrite; thiếu entry/timestamp/version/mark fail-closed, state attempts cũ vẫn đọc, LIMIT mới dùng `clel_`.
- Với partial fill, cleaner 35 giây hủy remainder `clel_` và thử đặt TP/SL cho vị thế đã khớp; nếu không còn plan trong bộ nhớ hoặc bảo vệ lỗi, log cảnh báo cần kiểm tra thủ công. Không khẳng định protected cho tới khi Binance xác nhận.
- Nếu process restart, cleaner hủy LIMIT `clel_` từ process trước để lệnh chờ không khớp sau khi plan TP/SL in-memory đã mất; LIMIT route khác không bị đổi TTL.

### 2026-09-20 — Coin Level retest 5m vào MARKET 1 USDT ×5

- Hai row ở “Các luồng khác” dùng source/stream `coin-level-entry-watch/closed-mtf-retest`, exact label có sẵn `RETEST_LONG_READY/LONG` và `RETEST_SHORT_READY/SHORT`. Catalog seed OFF; theo yêu cầu hiện tại cả hai row đã được bật tường minh, master đang ON, margin `1 USDT`, leverage `5x`, TP `+10% ROE`; SL cố định `-30% ROE` và SHORT không bị policy TP-only loại SL.
- Dòng bảng mới chỉ qua breakout/breakdown 15m vẫn chờ. Executor chỉ nhận retest5m đã đóng, phát sinh sau `enabledAt`, mới `<=90s`, mark cách midpoint entry dự kiến không quá `0,5%`, không position/open-entry cùng symbol và ngoài cooldown4h. MARKET có full-fill TP/SL re-anchor, min-notional ceil trần +1%, durable dedupe; không replay, DCA hoặc sửa vị thế cũ.
- Daily stats lấy fill thật theo route; không có paper/performance card mới và không thêm checkbox WHITELIST. Candidate/API/state chỉ thêm field/file additive; JSON cũ thiếu version/retest fail-closed.

### 2026-09-20 — Coin-level giá LONG/SHORT dự kiến là UI-only (lớp preview từng coin)

- `COIN_LEVEL_ENTRY_PREVIEW_V1_20260920` chỉ hiển thị trung điểm và biên vùng của `recommendation.longPlan/shortPlan.entryZone`; không phải giá đặt lệnh, không gọi executor. Nguồn là phân tích nến và vùng sẵn có trước hiển thị; điều kiện vẫn chờ 15m đóng/retest 5m, stale bị ẩn. Không đổi size, entry, SL, TP hoặc dữ liệu JSON cũ; không có W/L/PnL/AvgROE/card WHITELIST nên policy checkbox chỉ hiện closed AvgROE>4%, OFF mặc định giữ nguyên.

### 2026-09-20 — Bộ lọc Discord sweep tổng proxy >100M không phải gate Binance

- `LIQSCAN_SWEEP_SIDE_PROXY_GT100M_V1_20260920`: gửi Discord MAIN KILL/reference chỉ khi tổng proxy của phía bị quét hiện tại >100M; không phải số coin, USD thanh lý thật hoặc khối lượng riêng vùng. Detector và executor giữ nguyên, bộ lọc được gọi sau xử lý Binance nên có thể không có tin sweep Discord dù route cũ đã xử lý lệnh.
- Không đổi entry/size/leverage/DCA/SL/TP, matcher, công tắc hay policy WHITELIST. Reference vẫn OBSERVE ONLY; MAIN KILL không bị đổi thành OBSERVE ONLY. Không card/stat PnL mới. JSON bổ sung `liquidityAtSweep` cho input lúc quét; JSON cũ fallback tổng cùng phía có sẵn, không sửa lịch sử. `sent` chỉ đếm POST thành công, event filter được acknowledge nhưng không giả là đã gửi.

### 2026-09-20 — SQUEEZE_RATIO_WATCH_V1_20260920 không phải route Binance

- `RATIO` (cam) / `RATIO_OI` (tím) là cấp cảnh báo của feed `/api/squeeze-ratio-watch`, không phải signal matcher giao dịch. Dữ liệu trước alert: closed15m breakout + volume, xu hướng closed1h, global account L/S giảm, OI số lượng tăng cho tier tím; xem CURRENT_DECISION_AND_EMA_RULES để biết ngưỡng/as-of.
- List ở coin-level-analysis chỉ lịch sử cảnh báo và trạng thái gửi, không có W/L/PnL/AvgROE/card thống kê mới; không cấp WHITELIST, không tự bật Binance, không ảnh hưởng entry/size/SL/TP. Không sửa policy WHITELIST closed AvgROE>4%, checkbox mặc định OFF của các card thực thi hiện có. State JSON riêng additive, không migrate JSON cũ.

### 2026-09-18 — MAIN KILL đỏ SIÊU LỚN: SHORT trên / LONG dưới

- Hai công tắc exact mới ở nhóm “Các luồng khác”: `LIQSCAN_MAIN_KILL_UPPER_SWEEP_SHORT/SHORT` và `LIQSCAN_MAIN_KILL_LOWER_SWEEP_LONG/LONG`, source `liqscan-main-kill-sweep`, stream `background-top400`. Mỗi row có input margin, leverage, TP riêng; mặc định MARKET `1 USDT margin ×5`, TP `+10% ROE`, SL cố định `−30% ROE` từ average full-fill. Quantity được ceil vừa đủ min-notional trong trần +1% để tránh `-4164` do lot step.
- Chỉ event Discord đỏ `SIÊU LỚN` có cả `volumeTier=EXTREME/rank5` và proxy MAIN KILL `>=50M USDT` mới có quyền gọi executor. Quét phía trên/killed-short → SHORT; quét phía dưới/killed-long → LONG. Các tier nhỏ vẫn gửi Discord nhưng OBSERVE ONLY.
- Trước submit phải có master+route ON, detectedAt sau enabledAt và tuổi `<=90s`, mark drift `<=0,5%`, không vị thế/open entry order cùng coin và ngoài cooldown 4h. Durable attempt chặn replay/double-submit; restart không replay tín hiệu cũ, không DCA, không sửa lệnh đang có. SHORT giữ SL nhờ exemption V5.
- Daily stats dùng Binance fill/close thật theo exact route. Không tạo performance card/WHITELIST mới; JSON controls cũ chỉ được bổ sung hai row, mặc định seed OFF, settings cũ giữ nguyên. Attempts nằm ở file mới và không backfill lịch sử.

### 2026-09-18 — Scanner nền LiqScan Top 400 chỉ gửi Discord

- `LIQ_SCAN_SCORE65_BACKGROUND_TOP400_V1_20260918` tự quét cache15m Top400 mỗi30s nên không cần mở/search coin. Score `>=65` gửi Discord theo ABOVE/BELOW và state dedupe riêng. Sau restart chỉ warm-up 60 nến cho symbol còn thiếu theo batch rate-limited; scan định kỳ không REST từng coin.
- Scanner nền **không gọi executor Binance**, kể cả score `>80`. Hai route Binance hiện hữu vẫn giữ strict `>80` và chỉ nhận lifecycle explicit `/coin-level-analysis`; controls/margin/leverage/TP/SL không đổi.
- Không thêm controls row/card/WHITELIST, không sửa order/position/protection. State background là JSON mới additive, không replay/backfill dữ liệu cũ.

### 2026-09-18 — LiqScan Discord >=65; Binance vẫn >80

- Discord LiqScan phát từ `score >=65` và có một alert nâng tầng khi cùng episode lần đầu vượt strict `>80`. Đây không phải thay đổi authorization giao dịch.
- Hai exact route Binance `LIQSCAN_HIGH_SCORE_ABOVE_LONG/LONG` và `LIQSCAN_HIGH_SCORE_BELOW_SHORT/SHORT` vẫn yêu cầu strict `score >80`; score 65–80 không gọi executor. Margin/leverage/TP input, SL theo hướng, enabledAt/freshness/drift/cooldown/dedupe và trạng thái ON/OFF giữ nguyên.
- Không thêm controls row/card/WHITELIST, không sửa position/order/protection cũ. JSON Discord thêm tier flags và đọc state V2 theo kiểu additive, không replay/backfill.

### 2026-09-16 — Pump/flush/reclaim Discord hai chiều

- `PUMP_FLUSH_RECLAIM_15M_LONG_READY/LONG` và `DUMP_SQUEEZE_REJECT_15M_SHORT_READY/SHORT` thuộc scanner Discord `PUMP_FLUSH_RECLAIM_BIDIRECTIONAL_DISCORD_V3_DEEP_BASE_GATES_20260916`, dùng closed 15m + closed 5m. V3 siết retrace/context/close-quality và chặn giá đã hồi sát extreme, nhưng vẫn **OBSERVE ONLY**.
- Không có row/công tắc `binance-auto-controls`, không MARKET/LIMIT, margin, leverage, DCA, TP hoặc SL; không ảnh hưởng lệnh/position hiện tại. Operational log không phải performance card nên không tạo WHITELIST; nếu sau này nâng thành card phải mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%`.
- State dedupe Discord là file additive độc lập; controls/fills cũ không migrate, rewrite hoặc replay.

### 2026-09-16 — LiqScan high-score >80

- Hai công tắc exact mới trong nhóm “Các luồng khác”: `LIQSCAN_HIGH_SCORE_ABOVE_LONG/LONG` và `LIQSCAN_HIGH_SCORE_BELOW_SHORT/SHORT`, source `liqscan-high-score`, stream `coin-level-analysis`. Mỗi route có input margin, leverage và TP riêng; mặc định catalog `5 USDT margin ×5`, TP `+15% ROE`. SL cố định theo hướng: LONG `−20%`, SHORT `−30%`.
- Chỉ event strict `score >80` mới, snapshot `<=90s`, sinh sau enabledAt, mark drift `<=0,5%`, không position/open-entry-order và ngoài cooldown 4h mới được MARKET. Một episode chỉ submit một lần; Discord/restart không replay. OFF vẫn gửi Discord chuyên dụng và ghi trạng thái OFF, không đặt lệnh.
- Daily stats đếm fill Binance thật theo exact route; JSON cũ giữ nguyên, catalog seed hai row mới OFF và thao tác triển khai đã bật rõ cả hai row theo yêu cầu này (master đang ON). Không tạo WHITELIST/card hiệu suất mới và không sửa order/protection đang mở.

### 2026-09-15 — MANUAL_SHORT_NEW_FILL_SL30_V1_20260915

- SHORT vào tay mới dùng SL −30% ROE từ average full-fill: `SL = entry × (1 + 0,30/leverage)`. Cutoff mới là `2026-09-15T03:55:29.563Z`; chỉ order được tạo và full-fill sau mốc mới đủ điều kiện. TP/size/leverage giữ nguyên.
- Không sửa vị thế/TP/SL hiện tại, order cũ, DCA vị thế cũ, LONG hoặc bot entry. Field JSON `manualShortSl50` được giữ để tương thích, nhưng chỉ version SL30 mới được apply/recover; version SL50 cũ bị fail-closed. Test dùng mock Binance, không gửi lệnh thật.

### 2026-09-14 — Gate hồi lớn cho RETEST_SHORT_READY

- Công tắc vẫn là exact route `htf-deep-base-ready / htf-deep-base-15m / RETEST_SHORT_READY / SHORT`; không thêm/đổi route và không tự thay trạng thái ON/OFF. Từ V4, route chỉ nhận READY có đủ bằng chứng causal **sau EARLY**: hồi `>=1,5%` + `>=1,25 ATR15m` về neckline/EMA13 rồi giảm lại `>=1%` + `>=0,75 ATR15m`. Rebound trước EARLY, event cũ hoặc event thiếu metric bị chặn fail-closed.
- Chỉ áp dụng entry mới sau reload; `5 USDT margin x5`, TP `+15% ROE`, SL `-30% ROE`, tuổi/drift/cooldown/dedupe/no-position/no-order giữ nguyên. Không sửa lệnh ZRX hay bất kỳ position/protection hiện tại; LONG không đổi.
- Không có label/card mới nên không thêm WHITELIST. Audit dùng exact label cũ và reason thêm rebound/fade; JSON thêm field optional, không backfill/replay/rewrite dữ liệu cũ.

### 2026-09-13 — HTF deep-base FAST RETEST 5m từ nguồn 1h/4h

- Không thêm công tắc mới: FAST READY 5m dùng đúng hai route `RETEST_LONG_READY/LONG` và `RETEST_SHORT_READY/SHORT` bên dưới. Discord/audit ghi riêng nguồn cấu trúc 1h hoặc 4h và `confirmation=5m`; FAST và READY 15m dùng chung episode dedupe để không nhân đôi lệnh.
- EARLY vẫn OBSERVE ONLY. Khi route hiện hữu ON, closed-5m fast retest hợp lệ có cùng cấu hình MARKET `5 USDT margin ×5`, TP `+15% ROE`, SL `−30% ROE`; không đổi trạng thái công tắc hay position/order cũ. Thiếu cache 5m thì chờ nhánh closed-15m cũ.

### 2026-09-12 — HTF deep-base RETEST READY LONG/SHORT

- Hai checkbox exact `RETEST_LONG_READY/LONG` và `RETEST_SHORT_READY/SHORT` thuộc source `htf-deep-base-ready`, stream `htf-deep-base-15m`; seed mặc định OFF, có `enabledAt` riêng và cùng chịu khóa tổng. Chúng không thay thế WHITELIST thống kê CLOSED `AvgROE >4%`.
- Khi ON, chỉ READY từ nến 15m vừa đóng `<=90s`, phát sinh sau `enabledAt`, mark drift `<=0,5%`, không position/entry-order cùng symbol và không nằm trong cooldown 4 giờ mới có quyền MARKET `5 USDT margin ×5`. TP `+15%` và SL `−30% ROE` neo average full-fill; source này được miễn TP-only qua `BINANCE_BOT_SHORT_TP_ONLY_HTF_EXEMPT_V2_20260912`, không DCA/replay/sửa lệnh cũ.
- UI ghi rõ cấu hình cố định và mô tả case LONG sập sâu→đáy→retest cùng case SHORT bơm sâu→đỉnh→retest. Audit fill/close/CSV tách bằng exact label để tính entry/PnL ngày; chưa có lịch sử đủ để kết luận hiệu suất.

### 2026-09-11 — PEAK_ZONE_SHORT_WATCH 5m

- Route mới `extreme-short-squeeze / PEAK_ZONE_SHORT_WATCH / SHORT` chỉ nhận event 5m LIVE đã trả lại 15–25% nhịp spike, cách rolling high tối đa 2%, râu trên tối thiểu 20% và không có high mới trong ít nhất 15 giây. Higher high reset thời gian; 15m không có quyền Binance.
- SHORT MARKET `$2 margin ×5` (notional `$10`), TP `+15% ROE`, SL `−30% ROE` theo average full-fill; mark drift tối đa 0,5%, tick tối đa 30 giây, no-position/no-order và cooldown 4 giờ. Chỉ event bắt đầu sau enabledAt; không replay CATI hoặc sửa lệnh cũ.
- Controls seed mặc định OFF và được bật riêng sau yêu cầu này. Audit CSV ghi exact label để đo về sau; chưa có mẫu đóng, không có card thống kê/WHITELIST mới. JSON cũ không cần migrate.

### 2026-09-11 — Hai route EMA99 SHORT dùng 10x

- 5m `NEAR_EMA_WATCH/SHORT` và 15m `CLOSED_ABOVE_EMA_WATCH/SHORT` dùng `$5 margin ×10` (notional `$50`) cho entry mới. Cùng label ở timeframe khác và route khác vẫn 5x.
- TP giữ `+15% ROE` từ average full-fill (`SHORT ×0,985`); SL giữ `−30% ROE` (`SHORT ×1,03`). Controls/API/runtime guard cùng dẫn xuất leverage theo exact label+timeframe; UI không còn ghi cứng 5x.
- Không đổi detector, stats hay checkbox hiện hữu; không thêm WHITELIST. JSON cũ không cần migrate, và vị thế/TP/SL đang mở không bị sửa.

### 2026-09-11 — EXTREME_PUMP/FOLLOW_REJECTION 5m SHORT test

- Hai route `EXTREME_PUMP_CLOSED/SHORT` và `FOLLOW_REJECTION_LIVE/SHORT` được seed riêng vào nhóm tín hiệu khác trên `/binance-auto-controls`. Mỗi route mặc định OFF, có checkbox/enabledAt riêng; hiện lần lượt ON từ `2026-09-11T08:16:03.471Z` và `2026-09-11T08:32:50.728Z`. Size cố định `$1 margin ×5`, không dùng input size EMA99.
- Closed route cần nến 5m spike đóng sau enabledAt và tuổi `<=90s`. Live-follow route chỉ xét nến mở sau enabledAt, trong 1–3 nến sau spike đang trả lại `>=50%`, chưa higher high, event tuổi `<=90s`, tick `<=30s` và nến vẫn chạy. Cả hai cần mark cách giá đánh giá `<=0,5%`. 15m, spike LIVE, follow closed, rút râu/quét hai đầu vẫn quan sát.
- Entry có TP `+15% ROE`, SL `−30% ROE` theo full-fill, chặn position/order cùng symbol và cooldown chung 4h; không backfill hay sửa lệnh hiện tại. Cả hai dùng stage đã tồn tại, không tạo card thống kê/WHITELIST mới; fill/close CSV tách theo label, JSON cũ thiếu eligibility fail-closed.

### 2026-09-10 — EMA99_TIMEFRAME_CONTROLS_V2_20260910

- Đã reload btc-liquidity-web, healthz HTTP 200; API runtime xác nhận 11 route 5m + 11 route 15m, đối chiếu cấu hình trước/sau không lệch enabled/size/enabledAt hoặc khóa tổng. Browser test tick/Lưu/reload/search pass trên API mock, không đổi setting thật; bản sao cấu hình trước chuyển đổi lưu tại data/auto-entry-controls.before-timeframes-20260910.json.
- Binance auto controls tách 11 loại EMA99 thành 22 route độc lập: source + stream + label + side + interval (5m hoặc 15m). UI chia hai nhóm, checkbox/ô ký quỹ/Lưu và matcher runtime dùng cùng key. Payload thiếu hoặc sai interval bị khóa, không fallback sang công tắc chung.
- Dữ liệu trước entry: interval lấy trực tiếp từ event nến đã đóng, stage/side/source hiện hữu, tuổi tín hiệu và enabledAt, giá tham chiếu/mark, vị thế/lệnh chờ và ký quỹ của đúng khung. Bốn builder và shared runner truyền signalInterval tới common order guard; không đổi thuật toán phân loại, không dùng outcome tương lai.
- Binance: bật/tắt và size 1–100 USDT ×5 được lưu riêng theo từng khung, chỉ áp dụng entry mới. Giữ TP +15% ROE, SL LONG −20% / SHORT −30%; không sửa/cancel TP/SL hoặc vị thế đã mở. Khóa tổng, gate gốc, xác thực Orders, giới hạn tuổi 90s, không cộng vị thế, cooldown theo symbol và dedupe cũ vẫn giữ; không chia cooldown để mở hai lệnh cùng coin.
- JSON cũ: route key 4 phần của EMA99 được chuyển sang hai key 5 phần, giữ nguyên enabled, enabledAt và margin của route cũ (trước đây vốn áp cho cả hai khung); không ghi đè route con đã tồn tại. Seed lưu chuyển đổi qua restart. Route chưa từng có mặc định OFF, input thiếu timeframe không tạo route chung mới; request từ UI cũ dùng key cũ bị từ chối. Route ngoài EMA99 giữ key và hành vi cũ.
- Thống kê/WHITELIST: không thêm nhãn tín hiệu/card/cohort thống kê; signalLabel/signalCombo và W/L, PF, AvgROE giữ nguyên. Không thêm whitelist matcher; policy whitelist hiện hữu mặc định OFF và chỉ hiển thị CLOSED AvgROE >4% không đổi. Đây là gate Binance thật, không phải nhãn OBSERVE ONLY mới.
- Kiểm thử: migration/restart, 22 route OFF mặc định, đổi 5m không ảnh hưởng 15m, runtime lấy đúng size, thiếu timeframe bị khóa, pause-all, cooldown chung; test runner chỉ mock exchange, không phát lệnh thử thật.

### 2026-09-10 — MANUAL_SHORT_SL50_PENDING_DCA_FIX_V2_20260909

- Sửa race khi lệnh SHORT tay mới đủ cutoff đã có policy SL50 nhưng SELL bổ sung khớp trước khi SL đầu tiên được gửi. Input là policy opening fill đã xác minh và lịch sử Binance trades từ lúc tạo order, không dùng tín hiệu/giá tương lai.
- Chỉ cho hoàn tất SL đầu tiên nếu lịch sử gồm đủ original fill, toàn SELL, không realized PnL/đóng/đảo chiều, tổng lượng và average khớp live position. Giữ mốc SL original fill, không rebase theo DCA/mark. Nếu không chứng minh được thì giữ pending/retry, không báo đã đặt; duplicate DCA không được xóa pending manual SL50 plan.
- Binance: vẫn cutoff cố định, không mở entry/thay size/leverage/TP; giữ SL đã có và không backfill vị thế cũ. Đọc lại open orders sau đặt SL trước khi đánh dấu applied/slPlaced; không coi TP nằm phía trên giá là SL. Chưa thực hiện sửa SL thủ công cho ZEC qua API trong lượt này.
- JSON tương thích: manualShortSl50 V1 vẫn đọc được; metadata reconciliation/version/qty/average chỉ thêm optional. Record cũ không có policy không được cấp quyền mới. Không thêm nhãn/card/thống kê/WHITELIST; các policy closed AvgROE >4% hiện hữu giữ nguyên.
- Test mock bao gồm DCA giữa hai lần đọc vị thế, lịch sử thiếu/đóng/không khớp, SL người dùng có sẵn và sàn chưa xác nhận open SL.

### 2026-09-09 — MANUAL_SHORT_NEW_FILL_SL50_V1_20260909

- Đã kích hoạt cutoff cố định 2026-09-09T13:56:14.111Z (20:56:14 ngày09/09 giờ VN); reload dịch vụ thành công, /healthz HTTP200. Các bài test SL50, TP policy, EMA99 fill và position monitor pass; chỉ mock exchange.

- Theo yêu cầu, SHORT vào tay mới dùng SL mặc định -50% ROE từ average full-fill của order đã xác minh trên Binance, khoảng giá=.50/leverage; SL=entry×(1+.50/leverage). Ví dụ5x +10% giá;10x +5%. TP hiện hữu giữ nguyên; không thay size, đòn bẩy, detector hay Binance bot EMA99.
- Mốc MANUAL_SHORT_SL50_ACTIVATED_AT lưu cố định trong .env, thiếu/sai => rule tắt; không lấy thời gian restart làm cutoff. Trước đặt SL phải xác minh getOrder: SELL, FILLED, MARKET/LIMIT, không reduceOnly/closePosition, thời gian tạo order và full-fill >=cutoff. Chỉ khi lượng SHORT hiện tại đúng lượng order đã khớp và entry vị thế đúng average fill, vị thế BOTH/SHORT đúng hướng. DCA, đảo vị thế/giảm vị thế, order cũ tạo trước cutoff dù khớp sau đó, event replay trước cutoff đều bỏ qua. Chỉ mở mới sau mốc, không backfill các vị thế hiện tại.
- Input/phân loại: exact nguồn manual, orders-manual, binance-manual-socket, liquid-flow-v2-manual, pump-manual-order; đối chiếu audit submission và client ID để loại nguồn bot bị mất plan lúc restart, không áp lifecycle auto. Nếu chưa chứng minh được order mới hoặc sàn trả lỗi thì không tự đoán; đường full-fill/retry hiện hữu xử lý lại. Nến/EMA không quyết định SL50 này.
- Runtime gắn manualShortSl50 vào plan và slTracking của lifecycle mới; fill-anchor giữ TP distance null và SL distance=.50/leverage. setTpSl chỉ bỏ chặn manual TP-only cho payload mang policy mới hợp lệ và khớp symbol/side/entry/qty hiện tại. Re-read vị thế ngay trước đặt SL để tránh race DCA/đóng lệnh. STOP_MARKET BUY closePosition, làm tròn tick theo pipeline hiện hữu; giữ SL đang có, không hủy/thay SL người dùng. Chính sách quản lý TP/profit-lock khác không đổi.
- JSON cũ thiếu manualShortSl50 giữ hành vi cũ; không migrate, không quét đặt SL các vị thế cũ. Không đổi signalLabel/type hoặc thêm card/nhãn thống kê, không có WHITELIST mới; W/L/PF/AvgROE và policy closed AvgROE>4% giữ nguyên. Fill/close audit và CSV hiện hữu nhận SL/reason mới qua pipeline cũ.
- Test mock build policy ở1x/5x/10x/20x/125x, cutoff cũ/thiếu/sai, DCA, LONG/bot/close/reversal, SL và TP theo fill; thực thi chính hàm setTpSl trong môi trường exchange mock để kiểm tra legacy suppression được vượt đúng policy, lệnh cũ không đặt SL, existing SL không bị thay và race vị thế không phát order. Không gửi lệnh thật để thử.



### 2026-09-09 — EXTREME_SHORT_SQUEEZE_ALERT_V1_20260909

- Triển khai: webhook đọc trả HTTP200; đã gửi đúng một tin BULLA gắn nhãn [TEST LỊCH SỬ], Discord trả HTTP204. Tin kiểm thử dùng nến đóng lịch sử, không ghi nhận là cảnh báo realtime, không đi qua entry Binance. Reload dịch vụ và /healthz trả HTTP200.

- Luồng Discord quan sát riêng phát hiện nến tăng cực lớn trên 5m và 15m, cấu hình qua EXTREME_SHORT_SQUEEZE_DISCORD_WEBHOOK_URL trong .env (không ghi secret vào tài liệu/source). Scheduler 15 giây đọc toàn bộ symbol trong shared snapshot nhưng chỉ xử lý khung đã có >=22 nến cache liên tục; không seed thêm REST, không yêu cầu EMA99 hoặc tăng/giảm 24h. Live cần tick websocket riêng symbol/khung <=30s; closed cần tuổi <=90s. Dữ liệu không có hoặc khuyết không phát; phạm vi thực tế phụ thuộc cache hiện hữu.
- Dữ liệu trước spike: ATR14 lấy mean true-range của 14 nến đã đóng trước nến spike; volume MA20, đỉnh/đáy 20 nến đều loại nến spike. Gate cảnh báo ban đầu: high/open và high/close-trước đều >=8%; (high-open)/ATR14 >=4; volume/MA20 >=3; high vượt đỉnh20 >=1%; quoteVolume nến >=100.000 USDT (nếu thiếu dùng cận dưới volume×low và ghi rõ ước tính). Các ngưỡng là rule kỹ thuật chưa backtest tối ưu.
- Nhãn quan sát EXTREME_PUMP màu cam; UPPER_REJECTION màu đỏ khi râu trên >=40% range và giá trả lại >=50% đoạn open→high; TWO_SIDE_SWEEP màu tím khi low xuyên đáy20 và thấp hơn open >=3%, ưu tiên hơn reject. Theo dõi tối đa3 nến sau spike: FOLLOW_REJECTION/FOLLOW_TWO_SIDE_SWEEP; bỏ theo dõi đỉnh cũ nếu xuất hiện high mới cao hơn. Cùng nến có cả hai đầu không suy diễn thứ tự high/low từ OHLC. “Kill short” mô tả hình thái, chưa xác nhận số tiền liquidation.
- Mỗi trạng thái tách LIVE/CLOSED, snapshot chứa mốc spike và mốc đánh giá, open/high/low/price, wick, retrace, ATR/volume và baseline. Dedupe bền theo symbol/khung/nến spike/stage tại data/extreme-short-squeeze-discord.json; cập nhật reject/quét dưới được gửi riêng, không nhắc lại xác nhận cũ trên nến sau. Notifier serialize, kiểm tra lại freshness khi chờ hàng, backoff khi 429/network; vẫn có giới hạn gửi trùng nếu Discord nhận thành công nhưng tiến trình chết trước lưu state.
- Chỉ OBSERVE ONLY: không nối Binance runner, không đặt entry/size/SL/TP, không thay EMA99 hay luồng khác. Không tạo nhãn/card thống kê/PnL, không tạo route WHITELIST cho nhãn quan sát này; W/L/PF/AvgROE, audit fill/close CSV và policy closed AvgROE>4% hiện hữu giữ nguyên. JSON mới riêng; không migrate/backfill dữ liệu cũ hoặc gửi lại lịch sử như tín hiệu mới.
- Kiểm thử mock: 5m/15m, baseline không nhiễm spike, reject/quét hai đầu/follow, Unicode, dữ liệu lỗi, live thiếu tick/cũ, hết hạn, state qua restart, 429 và dedupe. Replay nến BULLA lịch sử trong ảnh: 5m UPPER_REJECTION_CLOSED, open→high +31,42%, volume24,62×; 15m TWO_SIDE_SWEEP_CLOSED, volume35,58×. Replay chỉ dùng nến đã đóng tại cutoff, không suy diễn thời điểm cảnh báo intrabar hay backtest lợi nhuận.



### 2026-09-09 — EMA99_MTF_CONTEXT_OBSERVE_V1_20260909

- Bổ sung `emaContext` vào event LONG EMA99 trước callback execution/Discord: EMA13/25/99, thứ tự, độ lệch %, EMA13 vừa cắt EMA25 và số nến EMA13/25 cùng dưới EMA99 trên cả 5m và 15m. Dùng tối đa 240 nến cache mỗi khung, SMA seed rồi EMA alpha=2/(period+1), tối thiểu 165 nến liên tục; chỉ lấy closeTime <= mốc nến tín hiệu/confirmedAt và < now. Tín hiệu đang chạy dùng nến đã đóng trước đó. Khung thiếu, khuyết hoặc chậm >= 1 duration được ghi không khả dụng; không gọi REST thêm trong scanner.
- Phân loại bối cảnh hiển thị, ưu tiên: thiếu khung => UNAVAILABLE/xám; EMA13 vừa cắt xuống EMA25 ở 5m hoặc 15m, hoặc EMA25 5m cách EMA99 <=0,10%, hoặc hai EMA nhanh mới cùng xuống dưới EMA99 1 nến => TRANSITION/tím. Nếu không thuộc trên, 5m EMA13 < EMA25 < EMA99 và hai EMA nhanh cùng dưới EMA99 >=2 nến, 15m EMA13/25 vẫn trên EMA99 => PULLBACK_ESTABLISHED/xanh ngọc. Còn lại MIXED/xanh dương. Đây là ngưỡng mô tả ban đầu, chưa tối ưu bằng backtest; không đồng nghĩa điều chỉnh đã kết thúc hoặc xếp hạng thắng.
- Discord thêm embed bối cảnh riêng có màu, số EMA từng khung, thời gian nến, thứ tự chính xác và ghi chú gần nhau. Embed tín hiệu LONG chính giữ xanh dương/xanh lá. Không đổi signalLabel, stage, version detector, dedupe hay phát lại tin cũ. Tái dựng lịch sử tại nến tín hiệu ORDER 07:15 và AVA 02:00 ngày 9/9 (VN) lần lượt cho PULLBACK_ESTABLISHED và TRANSITION; chỉ kiểm chứng phân loại, không phải backtest lợi nhuận.
- Binance/entry/size/SL/TP: không đổi. Bối cảnh chỉ OBSERVE ONLY, không là gate hay quyền MARKET, không đổi checkbox hoặc route settings. TP EMA99 mới +15% ROE, SL LONG -20%/SHORT -30% giữ nguyên. Không thêm nhãn/card thống kê nên không tạo WHITELIST mới; matcher runtime, policy WHITELIST closed AvgROE >4%, W/L/PF/AvgROE và fill/close CSV giữ nguyên.
- JSON cũ: trường emaContext additive chỉ trên event runtime; event cũ thiếu context vẫn render tin gốc, không migrate/backfill state/audit CSV, không tự tạo context từ giá hiện tại cho tin cũ. Tests kiểm tra giao cắt, màu, thiếu/cache cũ, không nhìn nến tương lai, event đang chạy, legacy payload và scanner truyền context; hồi quy các builder Binance. Không gửi tin/lệnh thật để test.



### 2026-09-08 — EMA99_ALL_FILL_TP_15ROE_V1_20260908

- Theo yêu cầu người dùng, mọi lệnh EMA99 MỚI thuộc đủ 11 stage, cả LONG và SHORT, cùng hai route EMA99 cũ `ema99-kill-reclaim` và `ema99-kill-reclaim-pump-dump-absorption`, đặt TP +15% ROE từ average full-fill thực tế. Với leverage 5x: LONG TP=fill×1.03, SHORT TP=fill×0.97. SL giữ rule mới nhất: LONG −20% ROE/fill×0.96; SHORT −30% ROE/fill×1.06. Không sửa TP/SL của vị thế đã mở trước rollout.
- Dữ liệu trước entry và điều kiện phân loại không đổi: detector EMA995m/15m, exact version/stage/side, nến đóng, enabledAt/freshness≤90s, mark drift≤0.5%, target/invalidation cấu trúc phải dương và đúng phía, no-DCA/open-order guard. Target cấu trúc tiếp tục là gate/context Discord nhưng không còn là TP bảo vệ cuối của entry thật EMA99.
- Tác động Binance: sáu exact source EMA99 được bọc bằng `EMA99_ENTRY_PROTECTION_VERSION`: `ema99-near-reject-short`, `ema99-reclaim-long`, `ema99-bounce-long`, `ema99-observe-only`, `ema99-kill-reclaim`, `ema99-kill-reclaim-pump-dump-absorption`; helper còn kiểm tra đúng hướng BUY/SELL để không nhận nhầm source. Plan ghi fillAnchorEnabled, takeProfitDistanceFraction=.15/leverage, protectionSignalEntry/TP; full-fill pipeline tính lại TP từ average fill và làm tròn tick. SL distance metadata được giữ đồng thời. TP và SL đều neo cùng fill; không dùng mark/signal close làm anchor cuối. Size/margin/5x/routes và các nguồn không EMA99 không đổi.
- Discord/trang controls hiển thị TP+15% và tách mốc cấu trúc khỏi giá bảo vệ thật. Đây không phải thay detector, nhãn, tier, snapshot, gate hoặc card thống kê. Audit fill/close/CSV tiếp tục lưu source/label/reason và PnL thật; cách tính W/L/PF/AvgROE, whitelist closed AvgROE>4% không đổi, không thêm checkbox/label whitelist mới.
- Tương thích JSON cũ: vị thế/plan thiếu EMA99_FILL_TP15_LONGSL20_SHORTSL30 version không migrate/backfill; chỉ order tạo sau reload có takeProfitDistanceFraction mới. Existing protection và manual/non-EMA giữ nguyên. Tests mock 7 exact source-direction (gồm hai route cũ), giá fill khác signal, TP±3% price=+15% ROE, SL20/30 không đổi, TP/SL metadata, detector/Discord/controls/auth regressions; không gửi lệnh thật.


### 2026-09-08 — EMA99_LONG_FILL_SL_20ROE_V1_20260908

- Theo xác nhận người dùng, tất cả lệnh LONG EMA99 MỚI trong catalog11 dùng SL −20% ROE từ average full-fill Binance. Với leverage5x: SL=fill×0.96 (giá đi ngược4%). SHORT EMA99 giữ −30% ROE/fill×1.06. Không sửa/nới SL các vị thế đã mở trước rollout; KOMA/AERO/AIA/SYRUP và lệnh cũ giữ protection hiện hữu.
- Dữ liệu và phân loại trước entry không đổi: detector EMA99 5m/15m, exact stage/side/version, nến đóng, enabledAt/tuổi90s, mark drift≤0.5%, structural invalidation phải hợp lệ, TP đúng phía, no-DCA/pending guard. Structural low−.25ATR tiếp tục làm gate hợp lệ trước entry nhưng không còn là giá SL cuối của LONG.
- Tác động Binance: helper chỉ exact BUY sources ema99-reclaim-long, ema99-bounce-long, ema99-observe-only. Plan mới ghi fillAnchorEnabled=true, stopLossDistanceFraction=.20/leverage, takeProfitDistanceFraction=null, protection entry/SL metadata và version. Full-fill pipeline dùng average fill thật để đặt SL; TP detector giữ nguyên, không rebase. Size, leverage, route controls và quản lý sau fill không đổi.
- Thống kê/audit/CSV hiện hữu nhận reason có rule SL; cách tính W/L/PF/AvgROE và whitelist không đổi. Không thêm label/card/tier/snapshot/gate mới. Discord và trang controls ghi rõ LONG−20%/SHORT−30%, không mô tả WATCH thành xác suất thắng.
- Tương thích JSON cũ: vị thế/plan thiếu EMA99_LONG_FILL_SL_20ROE version không được migrate hay backfill; chỉ entry tạo sau reload có anchor mới. LONG/manual/non-EMA không bị helper chạm. Tests mock cả3 source LONG, average fill→SL−20% ROE, TP bất biến, SHORT−30% và legacy/manual unaffected; regression reclaim/bounce/all11/controls/auth, không gửi lệnh thật.


### 2026-09-08 — EMA99_SHORT_FILL_SL_30ROE_V1_20260908

- Người dùng xác nhận chỉ lệnh mới: 5 stage SHORT EMA99 trong catalog11 dùng SL -30% ROE tính từ average full-fill thực tế. Ở5x: SL=fill×1.06, không theo high nến+.25ATR nữa. Margin5USDT lỗ lý thuyết1.5USDT trước phí/slippage. Không áp LONG, nguồn khác hoặc vị thế cũ (CHILLGUY hiện hữu giữ nguyên).
- Input trước entry/phân loại/gate không đổi: detector/nến/EMA, activatedAt,90s,mark drift,noDCA,TP hợp lệ. Builder entry mới gắn fillAnchorEnabled=true, stopLossDistanceFraction=.30/leverage và version; TP distance=null để KHÔNG rebasingTP. SL trước fill chỉ giá dự kiến, fullfill pipeline rebase SL theo giá khớp thật và làm tròn tick.
- Giữ TP, size, leverage, checkbox; không nới hay dời SL các lệnh đang mở, không backfill/adopt rule mới. Quản lý bảo vệ sau fill hiện hữu không thay đổi. Audit/CSV lưu qua pipeline cũ, reason ghi ruleSL; W/L/PF/AvgROE không đổi, không thêm nhãn/card/WHITELIST.
- JSON cũ thiếu anchor/version không bị đổi; chỉ plan entry mới có metadata explicit, cơ chế resolve anchor cũ tái sử dụng. Tests mô phỏng fill trượt từ.014 về.013956 => SL.01479336, TP.013302 giữ nguyên, LONG/manual/legacy unaffected; regression watch/near; không live order test.


### 2026-09-08 — EMA99_ALL11_OPTIN_V1_20260908

- Theo yêu cầu mở quyền tick và edit/Lưu margin cho đủ11 stage EMA99. Không bật tự động8 loại mới; giữ3 route đangON và size cũ. Nhóm SHORT luôn SELL, LONG luôn BUY, gồm CLOSED_ABOVE_EMA_WATCH vẫn SHORT và CLOSED_BELOW_EMA_LONG_WAIT vẫn LONG; WATCH không phải xác nhận đảo chiều.
- 8 stage trước observe được nối runner MARKET opt-in riêng, exact catalog source/stream/label/side + Symbol auth nội bộ. Giữ source kỹ thuật cũ ema99-observe-only để tương thích keyJSON; tên source không còn mô tả quyền, quyền do checkbox+executor quyết định. Route defaultOFF, chỉ người dùng tick ON có enabledAt mới.
- Dữ liệu trước entry: detector5m/15m version hiện tại, price close, EMA/ATR và nhãn không thay phân loại. Chỉ nến closed, close sau activation, tuổi close/generated<=90s, mark drift<=0.5%, TP/SL dương đúng phía, không vị thế hoặc entrypending cùngcoin. Không vào theo nến đang chạy dù Discord đã báo WATCH. Các điều kiện3 route cũ không đổi, bounce dùng confirmedAt.
- SHORT mới TPđáy12 nến trước, SLhigh+.25ATR; thêm executionTakeProfit additive khi chưa reject, không sửa takeProfit quan sát cũ. LONG mới TPđỉnh12 nến trước còn trên giá, SLlow-.25ATR. Không đủ mức thì bỏentry. Margin1–100 USDT lưu riêng, default5, leverage5, khôngceil; preserve fullfill TP/SL, ngoại lệ source tránh TP ROE chung/short SL suppression. Không áp capTP20% chưa được làm rõ.
- Shared attempts8 route chống replay/cooldownsymbol4h, scanner await tuần tự, timeout claim trước submit; giữ noDCA. API Orders auth như cũ, không bỏ đăng nhập. Thống kê fill/closeCSV pipeline cũ, không đổi W/L/PF/AvgROE; không thêm nhãn/cardthốngkê/WHITELIST. Checkbox catalog exact runtime, không gán giả AvgROE gate.
- JSON cũ observe metadata executablefalse/marginnull => editabledefault5 nhưng épOFF/xóaenabledAt, không tự kíchhoạt; 3route cũ giữ nguyên. executionTakeProfit optional, thiếuTP failclosed; khôngbackfill tin cũ. UI/Discord ghi rõ opt-in có gate, không hứa khớp. Tests mock all11save/tick,8builder đúnghướng/TP/SL/closed/age/auth, migrationOFF và regression3route; không testlệnhthật.


### 2026-09-08 — EMA99_CATALOG_MARGIN_V1_20260908

- Trang binance-auto-controls seed đủ 11 stage từ hai scanner EMA99 Discord SHORT/LONG 5m/15m, có tên Việt. Ba stage đã có executor (near-reject SHORT, reclaim LONG, bounce-confirmed LONG) giữ công tắc cũ; 8 stage observe-only luôn khóa bật ở UI và API. Các dòng EMA99/luồng khác trong lịch sử giữ nguyên, không tự cấp executor mới.
- Input trước entry và phân loại detector không đổi: nến/EMA/ATR/confirmation, tuổi90s, activation, mark drift0.5%, no-DCA, dedupe, TP/SL giữ nguyên. Thêm marginUsdt từng route thật: mặc định JSON cũ 5 USDT, chỉnh 1–100 USDT tối đa2 số lẻ qua nút Lưu, giữ5x, notional=margin×5. Save không bật route OFF, không đổi enabledAt, chỉ áp dụng entry mới; không tác động TP/SL hoặc vị thế đã mở.
- Runtime đọc margin từ controls trước tạo lệnh và kiểm tra lại sát entry; auth nội bộ kiểm tra size hợp lệ và 5x, client guard so với config hiện tại, đổi size giữa chừng chặn lệnh cũ. Endpoint save yêu cầu Orders token + kiểm tra origin như cũ, optimistic expectedMargin tránh ghi đè edit cũ. Refresh UI không mất draft hay focus đang nhập. Size UI là cấu hình entry, không phải vị thế thực tế đang mở; dòng chưa nối size hiện dấu gạch.
- Không đổi thống kê W/L/PF/AvgROE hoặc thêm card/nhãn thống kê/WHITELIST. Đây là catalog các nhãn detector đã tồn tại và controls Binance, không gán gate AvgROE cho observe. Checkbox exact source/stream/label/side khớp matcher, seed defaultOFF; 8 observe không thể giao dịch.
- JSON additive title/executable/leverage/marginUsdt, metadata lấy từ catalog tin cậy; margin thiếu default5, sai=>failclosed route. Giữ audit fill/close/CSV hiện hữu với notional mới, Discord outcome hiển thị margin được dùng thay text5 cố định. Không migrate/backfill lịch sử. Tests catalog11/3, observe lock, range/type/stale-save/restart/default, runtime margin36.25notional từ7.25margin, auth/client stale-size, regression3 executors; chỉ mock, không đổi size live để test.


### 2026-09-08 — EMA99_BOUNCE_CONFIRMED_LONG_MARKET_5USDT_5X_V1_20260908

- Người dùng bật riêng `BOUNCE_CONFIRMED_LONG_WATCH` (XÁC NHẬN BẬT · LONG WATCH) vào BUY MARKET margin 5 USDT × 5x = notional 25 USDT. Route exact `ema99-bounce-long / ema99-retest / BOUNCE_CONFIRMED_LONG_WATCH / LONG` mặc định OFF khi đăng ký, bật riêng theo yêu cầu. Hai route EMA99 đã bật giữ nguyên; không tự bật loại khác hoặc vào lại tin VELODROME cũ.
- Dữ liệu trước entry: detector LONG V1 không đổi, EMA99 dốc lên và pullback/reclaim với râu dưới>=25%, rồi 1–3 nến đã đóng sau reclaim xác nhận bằng CLOSE_ABOVE_RECLAIM_HIGH hoặc EMA_RETEST_HELD. Cho cả reclaim chạm và near-reclaim khi detector thực sự phát confirmed stage. Exact version/side/stage/5m hoặc 15m; confirmedAt phải sau reclaim và cách nguyên 1–3 duration. Tuổi 90s và enabledAt tính từ confirmedAt, KHÔNG từ candleCloseAt cũ. Giá tham chiếu referenceEntry là close nến xác nhận, phải trên EMA99; mark lệch<=0.5%, SL<mark/entry<TP.
- Entry/size/SL/TP thật: MARKET25notional5x, không ceil size. TP là đỉnh12 nến trước reclaim còn trên giá xác nhận; SL=low nến reclaim-.25ATR14. Thiếu/đảo mức bỏ entry; bảo toàn TP detector khỏi TP ROE chung bằng source exact, rounded TP/SL/age/mark recheck trong placeOrder. Bảo vệ full-fill và quản lý vị thế sau fill dùng pipeline cũ, không sửa rule quản lý khác.
- Không DCA: có vị thế bất kỳ phía (kể cả LONG reclaim trước) hoặc entry chờ trên symbol thì bỏ. State attempts riêng, claim trước submit, deterministic client ID theo setup, symbol cooldown4h cross-timeframe, timeout/unknown không retry signal; controls master/per-route và auth Symbol riêng BUY/MARKET/25/5/exact source-label. Không nới hạn90s để xử lý restart và không replay tin cũ.
- Discord giữ màu xanh lá confirmed, nhánh có execution ghi đúng LONG MARKET + outcome và mốc xác nhận, không tự nhận đã fill. Thống kê dùng fill/close audit+CSV hiện hữu với source/label/reason/confirmation/timeframe; W/L/PF/AvgROE không đổi, không thêm card/nhãn thống kê/WHITELIST mới. Checkbox Binance có key exact khớp runtime, defaultOFF; đây là explicit execution route, không gán giả gate closed AvgROE>4% cho route này.
- JSON additive: event detector cũ giữ nguyên, optional binanceExecution, controls enabledAt thiếu failclosed; attempts mới riêng hỏng failclosed. Không migrate/backfill lịch sử. Tests mock xác nhận hai cách/5m15m/tuổi từ confirmedAt/activation/exact stage/size/auth/TP/SL, vị thế/pending, concurrent/restart/timeout dedupe và regression 2 route cũ; không test lệnh thật.


### 2026-09-08 — EMA99_RECLAIM_LONG_MARKET_5USDT_5X_V1_20260908

- Theo yêu cầu người dùng, thêm route thật riêng `ema99-reclaim-long / ema99-retest / RECLAIM_LONG_WATCH / LONG` (RÚT RÂU / LẤY LẠI EMA99): BUY MARKET margin 5 USDT × 5x, notional 25 USDT, không ceil size. Giữ route SHORT near-reject đã bật; không bật thêm các LONG gần chạm, near-reclaim, bounce-confirmed hay các luồng khác. Default đăng ký OFF, chỉ bật riêng theo yêu cầu. Đây là quyền entry sớm sau nến reclaim, không đợi nến sau phá đỉnh và không gọi WATCH là xác nhận thắng.
- Input trước entry: detector LONG V1 5m/15m EMA99 tăng đều, nhịp tăng và pullback theo nến; exact stage/side/version, closed, nearMiss=false, close>EMA99, râu dưới>=25%. Nến đóng sau enabledAt, tuổi close/generated<=90s; mark mới lệch close<=0.5%, SL<entry/mark<TP. Không replay cảnh báo cũ. Có vị thế bất kỳ phía hoặc entry chờ cùng symbol thì bỏ, không DCA.
- TP đỉnh 12 nến trước còn trên giá; SL đáy nến reclaim trừ .25 ATR14. Thiếu mức hợp lệ thì không vào. Ngoại lệ TP theo source exact tránh TP ROE chung ghi đè lúc entry; validate rounded TP/SL/age/mark trước đặt. Dùng full-fill protection hiện hữu, không đổi quản lý vị thế sau fill hoặc TP/SL của các nguồn khác.
- Runner dùng chung cơ chế kiểm soát nhưng state riêng: claim bền trước submit, clientOrderId cố định, cooldown symbol 4h xuyên timeframe, kết quả timeout/không rõ không retry cùng signal; master/route phải ON, quyền nội bộ Symbol riêng chỉ BUY MARKET 25 notional/5x/exact label/source. JSON/text không tự cấp quyền.
- Thống kê fill/close/CSV dùng pipeline cũ, mang source/label/reason/timeframe; không đổi W/L/PF/AvgROE, không thêm card hoặc nhãn thống kê/WHITELIST mới. Checkbox quản lý Binance khớp exact matcher trên; đây là route giao dịch được chỉ định riêng, không giả danh gate closed AvgROE>4% của whitelist thống kê.
- Tương thích JSON: detector và dữ liệu lịch sử không đổi/migrate/backfill; optional binanceExecution chỉ đổi Discord nhánh này, các nhánh khác vẫn observe. Controls thiếu enabledAt fail closed; attempts JSON mới riêng, hỏng fail closed. Tests mock long/short regression, sai stage/size/side, freshness, protection, controls, position/pending, dedupe/restart/timeout; không live-order test.


## Cập nhật 2026-09-08 — EMA99_NEAR_REJECT_MARKET_5USDT_5X_V1_20260908

Người dùng bật riêng route `ema99-near-reject-short / ema99-retest / NEAR_REJECT_SHORT_WATCH / SHORT`: MARKET margin5 USDT×5x, TP/SL detector. Master ON chỉ để route này được chạy; các route còn lại OFF. Không LONG hoặc NEAR_EMA_WATCH. Rule cũ bên dưới là lịch sử thời điểm OFF toàn bộ, được thay thế duy nhất cho route này. Mỗi bật riêng OFF->ON có enabledAt, tín hiệu đóng trước mốc không được replay. Không card thống kê/WHITELIST mới; route explicit thực sự giao dịch, audit fill/close hiện hữu. Tests `test-ema99-near-reject-binance.mjs`, chi tiết trong CURRENT_DECISION_AND_EMA_RULES.

Version: AUTO_ENTRY_CONTROLS_V1_20260907. Page: `/binance-auto-controls`.

## TP theo route và thống kê ngày (V5, 2026-09-12)

- Route EMA99 executable 5m/15m có ô `TP lệnh mới · % ROE`, lưu độc lập 1–100% và mặc
  định 15%. Save không bật route, không sửa lệnh đang mở; runtime recheck TP trước submit.
- Dashboard ngày dùng audit fill/close thật. Entry count bỏ DCA; PnL là net realized
  của position đóng trong ngày `Asia/Bangkok`, không cộng unrealized. Dòng route hiển
  thị số entry, entry hôm nay còn mở, số position đóng và PnL thực tế.
- Các luồng ngoài EMA99 chưa có fill-anchor override chung nên TP tiếp tục theo executor
  gốc và được ghi rõ read-only; controls không tuyên bố thay đổi TP cho các luồng này.

## Đòn bẩy theo route EMA99 (V6, 2026-09-13)

- Route EMA99 executable 5m/15m có cột `Đòn bẩy lệnh mới`, nhận số nguyên 1–125x và lưu
  riêng theo exact loại + khung. Save không bật route OFF và không sửa vị thế hiện tại.
- Lệnh mới dùng `notional = margin × leverage`; TP và SL vẫn giữ tỷ lệ ROE của route,
  nên khoảng cách theo giá tự đổi thành `ROE / leverage` rồi được neo từ average full-fill.
- Runtime đọc lại margin/leverage/TP trước submit; edit đồng thời hoặc plan cũ bị chặn
  để vòng scan sau dựng lại. Các luồng ngoài EMA99 vẫn dùng leverage executor gốc.

## Hybrid Liquidity Hunter (2026-09-13)

- Bốn route cố định `primary/secondary × LONG/SHORT` xuất hiện trong nhóm ngoài EMA99.
  UPPER_FIRST vào LONG; LOWER_FIRST vào SHORT; WHIPSAW không có checkbox entry.
- Mỗi lệnh mới dùng `1 USDT margin × 5x`, MARKET và TP `+10% ROE` neo từ full-fill.
  Luồng này không đặt SL riêng. Route mới mặc định OFF khi seed; chỉ route được tick ON
  và khóa tổng ON mới có quyền đi tiếp qua detector/freshness/no-DCA gate.

## Cách dùng

- Hiện OFF tổng và tất cả loại. Discord/TP/SL/vị thế đang có giữ nguyên.
- Đăng nhập `/orders`, tìm đúng label, stream và hướng, chọn ON các loại muốn cho phép rồi bật tổng. Mỗi lần bật có xác nhận. Bật không thay size/SL/TP và không bảo đảm lệnh sẽ vào: rule execution cũ vẫn phải pass.
- TẮT TẤT CẢ lưu master OFF + từng route OFF. Tắt riêng tổng bảo toàn lựa chọn route. Không hủy lệnh chờ hoặc đóng vị thế. LIMIT/algo entry đã nằm ở sàn vẫn có thể khớp.
- Label/stream lấy từ audit submissions/fills + payload runtime. Loại chưa từng xuất hiện trong hai nguồn có thể chưa thấy; khi runtime yêu cầu sẽ tự có ở OFF. Route không phân loại được luôn khóa; các watcher EMA99 chỉ Discord không trở thành auto-order.

## Gate và whitelist

Exact key là JSON tuple source, stream (streamId hoặc executionPage), label (signalLabel/type ưu tiên protectionMeta), side LONG/SHORT. Cùng matcher cho catalog, UI key và runtime; không wildcard, không gộp hai nhóm CoinGlass. Các control không là whitelist thống kê: không tạo label/stat card mới, không sửa policy chỉ hiện WHITELIST thống kê khi closed AvgROE >4%, không cấp authorization auto policy cũ. Đây là gate bổ sung từ chối entry, không mở rộng execution.

Input trước entry chỉ metadata request và settings; không thay classification, PnL/W/L/PF/AvgROE. Manual có token Orders hợp lệ, reduceOnly, closePosition và hedge closing side không bị khóa mới. Main client wrapper chặn entry không có metadata cả khi đi đường legacy; placeOrder kiểm tra đầu và trước gửi/IOC fallback. Không quản lý giao dịch chạy độc lập ngoài service. Không thu hồi request đã gửi Binance.

## State và kiểm thử

`data/auto-entry-controls.json` atomic rename, default master/routes OFF; mất/corrupt => OFF, route mới OFF. JSON cũ không sửa/migrate/backfill; audit lịch sử chỉ dùng tạo catalog, không tính lợi nhuận hay tự cấp quyền. Restart không tự bật. Đổi setting cần xác thực Orders; local emergency stop vẫn dùng khi Binance auth lỗi. Test `scripts/test-auto-entry-controls.mjs` chỉ mock lệnh, kiểm tra isolation/TP/SL/manual/fail-closed/old-policy; không dùng giao dịch thật để kiểm thử.
# 2026-09-13 — Coin Horizon Sweep LONG/SHORT (controls V8)

Hai dòng mới nằm trong bảng **Các luồng khác**, dùng đúng matcher runtime và mặc định
OFF: `UPPER / LONG` cho chuyển sang quét lên và `LOWER / SHORT` cho chuyển sang quét
xuống. Checkbox route là công tắc Binance thật nhưng vẫn phụ thuộc khóa tổng. Bật một
chiều không bật chiều còn lại và không bật master ngầm.

Profile cố định cho entry mới: 5USDT ký quỹ ×5 =25USDT; SL−25%ROE. TP động lấy mép
gần vùng thanh khoản active đúng phía, không lấy cận ATR, và chỉ vào khi R:R>=1.
TP/SL neo lại từ full-fill. Cần snapshot causal <=90s, đủ4h/8h/12h đồng hướng, mark
drift<=0,5%, không có vị thế/open order, cooldown symbol4h. Lần đầu sau bật/restart
chỉ ghi baseline nên không replay LSK hoặc alert cũ.

Discord ghi trạng thái executor; route/master OFF vẫn chỉ cảnh báo. Entry/close thật
được audit theo exact key vào thống kê ngày trên trang; không đếm DCA. Không thêm
stat card hoặc performance WHITELIST nên rule CLOSED AvgROE>4% cũ không đổi.

JSON additive hai route OFF và file state durable riêng. Legacy `horizonSweepDraft`
nếu còn trong controls được bỏ qua; settings cũ không bị bật/tắt/migrate. Tests
`test-coin-horizon-sweep-binance.mjs` và `test-coin-horizon-sweep-binance-ui.mjs`
dùng mocks/fixture, không gửi lệnh hoặc Discord thật.

## Input cho 11 route ngoài EMA99 (V9, 2026-09-14)

- Catalog `OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V1_20260914` nối đúng 11 exact
  route thuộc Extreme Short Squeeze (3), HTF Deep Base (2), Hybrid Liquidity
  primary/secondary (4) và Coin Horizon UPPER/LOWER (2). Không dùng wildcard và không
  cấp input cho route chỉ quan sát hoặc executor chưa được nối.
- Mỗi dòng có input margin 1–100 USDT và leverage nguyên 1–125x. Chín route TP cố định
  có thêm input TP 1–100% ROE. Horizon vẫn hiển thị TP động theo vùng thanh khoản gần
  nhất, R:R `>=1`, SL `-25% ROE`; không có input TP vì runtime không dùng TP cố định.
- Save độc lập, không bật route OFF, không đổi `enabledAt` và chỉ áp dụng lệnh mới.
  Executor đọc lại setting sau account context, dựng lại plan rồi controls kiểm tra
  margin/leverage/notional/TP exact; plan stale bị chặn. Extreme/HTF giữ SL `-30% ROE`,
  Hybrid không SL riêng. Không sửa lệnh/position/TP/SL hiện tại.
- Dữ liệu causal/classifier, cooldown, freshness, drift, no-position/no-open-order và
  dedupe của từng luồng không đổi. Audit/stats ngày vẫn exact route, entry bỏ DCA và
  PnL net theo position đóng. Không thêm label/card/WHITELIST; CLOSED AvgROE `>4%` và
  default OFF của whitelist giữ nguyên.
- JSON cũ thiếu setting lấy default lịch sử và giữ nguyên `enabled/enabledAt`; field
  `otherEntrySettingsVersion`, `marginUsdt`, `leverage`, `takeProfitRoePct` là additive.
  Giá trị hỏng fail closed nhưng có thể sửa trên UI; không migrate/backfill/replay.
  Tests: `test-other-entry-settings.mjs`, regression policy/bốn builder và UI Horizon/
  Hybrid; tất cả dùng mock/fixture, không gửi lệnh Binance thật.

### SHORT đẹp 1h hậu bơm chạm vùng (2026-09-25)

- Exact route: `post-move-ideal-entry / post-pump-volume-fade-1h /
  SHORT_IDEAL_ENTRY_TOUCH / SHORT`.
- Route seed mặc định OFF. Khi ON, chỉ touch mới sau baseline và `enabledAt` mới được
  xét; candidate lần đầu thấy sẵn trong vùng cũng chỉ baseline. Chỉ `SÁT ĐỈNH` hoặc
  `NẾN GIẢM ĐẦU TIÊN` được vào; stage khác, `WEAKENED` và setup đã nằm trong vùng
  lúc bật không đặt lệnh. SHORT 15m/4h và LONG có exact route riêng.
- Default: margin 10 USDT, leverage 5x, MARKET SHORT, TP +6% ROE, SL −30% ROE.
  Mark mới phải còn trong vùng đẹp; có position hoặc entry order cùng symbol sẽ block.
- State dedupe: `data/post-move-ideal-short-1h-binance.json`. Không replay/retry mù.

### LONG đẹp 1h hậu xả chạm vùng (2026-09-25)

- Exact route: `post-move-ideal-entry / post-dump-volume-recovery-1h /
  LONG_IDEAL_ENTRY_TOUCH / LONG`.
- Checkbox có key đúng matcher runtime và seed mặc định OFF; máy hiện tại bật theo
  yêu cầu. Chỉ touch mới sau baseline/`enabledAt`; candidate lần đầu thấy sẵn trong
  vùng không được replay. Chỉ hai stage LONG ưu tiên được vào; stage khác,
  `WEAKENED` và setup cũ không đặt lệnh. 15m/4h có exact route riêng.
- Default: margin 5 USDT, leverage 5x, MARKET LONG, TP +10% ROE, SL −20% ROE.
  Mark mới phải còn trong vùng; position hoặc entry order cùng symbol sẽ block.
- State dedupe: `data/post-move-ideal-long-1h-binance.json`. Không retry mù; JSON
  state/route additive và tương thích controls cũ.

### LONG đẹp 4h hậu xả chạm vùng (2026-09-25)

- Exact route: `post-move-ideal-entry / post-dump-volume-recovery-4h /
  LONG_IDEAL_ENTRY_TOUCH / LONG`.
- Checkbox exact-key seed mặc định OFF; máy hiện tại ON. Chỉ crossing mới sau
  baseline/`enabledAt`; NEARUSDT hoặc candidate đang sẵn trong vùng lúc bật không
  được hồi tố. Chỉ hai stage LONG ưu tiên được vào; stage khác, `WEAKENED` và setup
  cũ không đặt lệnh.
- Default: margin 10 USDT, leverage 5x, MARKET LONG, TP +10% ROE, SL −20% ROE.
  Mark phải còn trong vùng; position/entry order cùng symbol hoặc đủ 30 vị thế block.
- State dedupe: `data/post-move-ideal-long-4h-binance.json`. Không retry mù; route,
  state và audit fields additive, tương thích JSON controls cũ.

### SHORT đẹp 4h hậu bơm chạm vùng (2026-09-25)

- Exact route: `post-move-ideal-entry / post-pump-volume-fade-4h /
  SHORT_IDEAL_ENTRY_TOUCH / SHORT`; chỉ `SÁT ĐỈNH` hoặc `NẾN GIẢM ĐẦU TIÊN`.
- Checkbox seed OFF và máy hiện tại bật theo yêu cầu. Chỉ crossing mới sau baseline/
  `enabledAt`; stage khác, `WEAKENED` hoặc candidate đã sẵn trong vùng không đặt lệnh.
- Default margin 10 USDT ×5, MARKET SHORT, TP +6%/SL −30% ROE; mark phải còn trong
  vùng và position/entry order cùng symbol hoặc đủ 30 vị thế sẽ block.
- State `data/post-move-ideal-short-4h-binance.json` additive; không retry mù,
  migrate, backfill hay replay.

### Tối ưu tải trang và daily stats (2026-09-26)

- `AUTO_ENTRY_DAILY_STATS_CACHE_V1_20260926` cache kết quả thống kê ngày theo đúng
  revision fill audit, controls và ngày Bangkok. Fill/close hoặc setting mới làm cache
  đổi ngay; công thức entries/open/closed/W/L/PnL không đổi.
- Trang Auto Controls không polling khi tab bị ẩn và refresh ngay khi hiện lại. Đây là
  tối ưu đọc UI; không thay route ON/OFF, master, margin, leverage, TP, SL hoặc quyền
  submit Binance. Response chỉ thêm `cacheVersion`, tương thích consumer cũ.

### Hai thẻ cảnh báo sớm hậu bơm/xả MARKET 3 USDT (2026-09-27)

- Exact LONG: `post-move-impulse / post-dump-no-sell-5m /
  POST_DUMP_NO_SELL_BUY_IMPULSE_LONG / LONG`.
- Exact SHORT: `post-move-impulse / post-pump-no-buy-5m /
  POST_PUMP_NO_BUY_SELL_IMPULSE_SHORT / SHORT`.
- Catalog mặc định OFF; khi operator bật, chỉ `BUY_IMPULSE` vàng hoặc `SELL_IMPULSE`
  cam mới được xét. Margin `3 USDT`, leverage `5x`, TP `+10% ROE`, SL LONG `-20%`,
  SL SHORT `-30%`; stage xác nhận/anti-chase không vào lại.
- Signal phải mới sau startup + enabledAt, `<=90s`, drift `<=0,5%`, không position/
  entry order cùng symbol và tối đa 30 vị thế. JSON cũ thiếu exact flag fail closed.

### Tăng hai route cảnh báo sớm lên MARKET 8 USDT (2026-09-27)

- Hai exact key LONG/SHORT phía trên giữ nguyên và vẫn ON; margin đổi từ 3 thành
  `8 USDT`, leverage giữ `5x` (notional `40 USDT`), TP `+10% ROE`, SL LONG `-20%`,
  SL SHORT `-30%`.
- Chỉ áp dụng lệnh mới. Không đổi classifier/freshness/drift/dedupe/max30, không sửa
  position/order hiện hữu và không replay signal cũ. Controls giữ nguyên `enabledAt`.

### Lọc MAIN KILL UPPER SHORT sau quét (2026-09-27)

- Exact route `LIQSCAN_MAIN_KILL_UPPER_SWEEP_SHORT/SHORT` vẫn dùng input hiện có và
  giữ `1 USDT margin ×5`, TP `+10%`, SL `-30% ROE`; không tăng vốn và không đổi route
  ON/OFF. Trước MARKET, executor V2 bắt buộc giá rút xuống dưới đáy vùng MAIN KILL,
  wick vượt mép trên không quá `0,10%` và không có tín hiệu hướng đối diện cùng symbol
  trong 3 ngày. LOWER/LONG chỉ nhận thêm khóa hai chiều 3 ngày.
- Các case chưa return, sweep quá sâu hoặc hai chiều hiện Discord `OBSERVE ONLY` và
  được ghi decision cohort để forward-test; chúng không được policy V40 cấp quyền.
  Không thêm checkbox WHITELIST/card thống kê mới. JSON cũ thiếu field lọc fail closed;
  state direction được nâng mềm từ attempts cũ, không replay hay sửa lệnh hiện hữu.

### Tăng max position cho hai route impulse lên 50 (2026-09-27)

- Chỉ hai exact route LONG/SHORT `post-move-impulse` dùng `maxOpenPositions=50`
  thay cho 30. Size vẫn `8 USDT ×5`, TP `+10%`, SL LONG `-20%`, SL SHORT `-30%`;
  freshness, drift, dedupe và no-DCA không đổi.
- Không đổi max của route khác, không replay tín hiệu đã stale/bị chặn và không sửa
  lệnh/vị thế hiện hữu. Policy V41 bắt buộc đúng max50; payload max30 cũ fail closed.
