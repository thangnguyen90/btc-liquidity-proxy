# Logic hiện tại: Decision Paper, Recommended Paper và EMA Paper

### 2026-10-04 — DISCORD_PUSH_MANAGER_V1_POST_SUCCESS_ROUTE_ALLOWLIST

- **Version/phạm vi:** runtime `DISCORD_PUSH_MANAGER_V1_POST_SUCCESS_ROUTE_ALLOWLIST_20261004`, Web Push `OPPOSITE_LIQUIDITY_WEB_PUSH_V2_DISCORD_ROUTE_ALLOWLIST_20261004`, sitewide/PWA `OPPOSITE_LIQUIDITY_SITEWIDE_TOAST_V5_MANAGED_DISCORD_PUSH_20261004`, Service Worker v3 và UI `DISCORD_PUSH_MANAGER_UI_V1_20261004`. Trang mới `/push-signal-manager` liệt kê các webhook Discord thực tế đã cấu hình, gom các env key trùng endpoint và cho bật/tắt Web Push theo route. Link `Quản lý Push` được nối vào toàn bộ menu bằng navigation V7.
- **Dữ liệu dùng trước notification:** bridge chỉ đọc URL webhook và JSON payload mà notifier hiện hữu vừa POST; chỉ sau khi Discord trả HTTP `2xx` mới đối chiếu allowlist và dựng Push từ `username/content/embed title/description/tối đa hai field`. Không gọi thêm Binance, Ollama, CoinGlass, order book, nến hoặc outcome tương lai; không sửa dữ liệu causal trước entry của notifier gốc.
- **Điều kiện phân loại/thống kê:** matcher runtime là exact Discord webhook route đã canonical hóa. Route mới mặc định **OFF**; nhóm chứa `LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_WEBHOOK_URL` mặc định ON để giữ hành vi V1. Key dùng chung webhook được gom một checkbox và UI cảnh báo phạm vi chung. Chỉ route ON + Discord 2xx + payload JSON hợp lệ mới Push. Dedupe payload theo route/hash/cửa sổ 15 phút, còn subscription/event retention giữ 7 ngày. `observedCount/pushedCount/deliveredCount/lastObservedAt/lastPushedAt` chỉ là telemetry delivery, không phải WinRate, PF, AvgROE hay xác suất.
- **Ảnh hưởng Binance/entry/size/SL/TP:** không ảnh hưởng detector, Discord, Binance, route giao dịch, entry, size, leverage, TP, SL, DCA, protection hoặc vị thế. Checkbox mới chỉ cho phép/chặn kênh Web Push sau Discord; tắt Push không tắt Discord và bật Push không cấp quyền vào lệnh.
- **Tương thích JSON/WHITELIST:** state mới `data/discord-push-manager.json` lưu settings/telemetry mode 0600 và được git-ignore; subscription/VAPID JSON cũ đọc nguyên. Thiếu `routeSettings` dùng default an toàn ở trên; API/page/service worker là additive, client cũ tiếp tục nhận riêng opposite-liquidity payload. Không thêm nhãn/tier/card thống kê **giao dịch** hoặc matcher entry, nên không tạo checkbox `WHITELIST`; exact Auto Controls, mặc định route giao dịch OFF và policy chỉ hiện matcher khi CLOSED `AvgROE >4%` không đổi.

### 2026-10-04 — OPPOSITE_LIQUIDITY_WEB_PUSH_V1_SERVER_VAPID

- **Version/phạm vi:** server `OPPOSITE_LIQUIDITY_WEB_PUSH_V1_SERVER_VAPID_20261004`, sitewide client `OPPOSITE_LIQUIDITY_SITEWIDE_TOAST_V4_TRUE_WEB_PUSH_PWA_20261004`, manager UI `OPPOSITE_LIQUIDITY_MANAGER_UI_V3_TRUE_WEB_PUSH_20261004`, Service Worker v2 và PWA manifest v1. Nút trên `/opposite-liquidity-manager` tạo Push subscription thật; server gửi notification qua Web Push nên không cần giữ tab dashboard mở. Android bật trực tiếp; iPhone/iPad cần iOS/iPadOS 16.4+ và mở trang từ icon đã thêm vào Màn hình chính.
- **Dữ liệu dùng trước notification:** chỉ dùng immutable event `LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH` vừa được detector chọn: symbol, LONG/SHORT, khung 5m/15m, vùng MAIN KILL, opposite-depth ratio, thời điểm và kết quả callback Binance đã biết tại lúc phát. Không gọi thêm Ollama/CoinGlass, không dùng nến/outcome tương lai và không thay dữ liệu trước entry.
- **Điều kiện phân loại/thống kê:** không đổi detector V6: ABOVE+BID dưới lớn hơn vẫn LONG đỏ; BELOW+ASK trên lớn hơn vẫn SHORT xanh. Web Push chỉ là delivery channel mới. State riêng ghi số subscription, eventId đã gửi 7 ngày, lần delivery gần nhất và `attempted/sent/removed/failed`; đây là telemetry vận hành, không phải WinRate, PF, AvgROE hay xác suất. EventId chống gửi trùng; endpoint trả 404/410 bị tự xóa.
- **Ảnh hưởng Binance/entry/size/SL/TP:** không ảnh hưởng Binance, route, entry, size `4 USDT ×5`, leverage, TP, SL, DCA, protection hoặc Discord. Push được gọi sau callback Binance và chỉ thông báo kết quả đã có; không có quyền đặt/hủy/sửa lệnh.
- **Tương thích JSON/WHITELIST:** state/VAPID được tách thành hai JSON runtime mới mode 0600; VAPID có thể lấy từ env hoặc tự sinh một lần, private key không gửi ra browser. JSON scanner/browserNotifications cũ giữ nguyên; browser đã đăng ký notification cục bộ tiếp tục có fallback khi còn tab mở, browser hỗ trợ PushManager dùng server push để tránh báo native trùng. API/manifest chỉ additive. Không thêm signal label/card/matcher nên không có checkbox `WHITELIST` mới; exact Auto Controls và policy CLOSED `AvgROE >4%` không đổi.

### 2026-10-04 — LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V6_TOUCH_TOGGLE_TOOLTIP

- **Version/phạm vi:** `LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V6_TOUCH_TOGGLE_TOOLTIP_20261004`, UI JS v41/CSS v13. Trên thiết bị cảm ứng, chạm một điểm giá trên chart order book sẽ ghim cùng tooltip giá, vùng MAIN/FAR KILL, USD proxy và tỷ trọng thanh khoản như hover desktop; chạm lần nữa trên chart đó sẽ đóng. Khi chuyển sang chart khác, tooltip ghim cũ được đóng trước. Hover chuột desktop giữ hành vi cũ.
- **Dữ liệu dùng trước hiển thị:** chỉ dùng tọa độ chạm hiện tại, thang giá SVG và snapshot order book/MAIN-FAR KILL đã có trong card. Không gọi thêm Binance, Ollama, CoinGlass hoặc dùng outcome/nến tương lai.
- **Điều kiện phân loại/thống kê:** không thêm nhãn, tier, gate, score, xác suất hoặc phép thống kê; đây chỉ là trạng thái UI `data-tooltip-pinned` trên chart. Tooltip vẫn hiển thị lifecycle và giá trị proxy theo rule V5 hiện hữu.
- **Ảnh hưởng Binance/entry/size/SL/TP:** không ảnh hưởng Binance, entry, size, leverage, SL, TP, DCA, protection, Discord hoặc push notification; chart vẫn `OBSERVE ONLY`.
- **Tương thích JSON/WHITELIST:** không đổi API/JSON/state và không migration; browser cũ không có PointerEvent vẫn dùng click kết hợp media coarse-pointer. Không thêm label/card/matcher runtime nên không có checkbox `WHITELIST` mới; default OFF và policy chỉ hiện matcher khi CLOSED `AvgROE >4%` giữ nguyên.

### 2026-10-03 — LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_V6/V3 — đỏ LONG, xanh SHORT

- **Version/phạm vi:** detector/Discord `LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_V6_UPPER_LONG_LOWER_SHORT_20261003`; executor `LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_BINANCE_V3_UPPER_LONG_LOWER_SHORT_MARKET_4USDT_20261003`; toast/push `OPPOSITE_LIQUIDITY_SITEWIDE_TOAST_V3_UPPER_LONG_RED_LOWER_SHORT_GREEN_20261003`; manager UI `OPPOSITE_LIQUIDITY_MANAGER_UI_V2_UPPER_LONG_LOWER_SHORT_20261003`. Mục này thay mapping phản chiều V2/V4/V5 trước đó cho **event mới**.
- **Dữ liệu dùng trước entry:** giữ nguyên MAIN KILL từ Binance LiqScan lúc arm; nến Binance Futures 5m/15m đã đóng liên tục sau alert; Coin Level/Binance Futures visible depth NEAR `0–3%` + WIDE `3–20%`, coverage, MARK/positions/open orders kiểm tra ngay trước submit. Không dùng CoinGlass, Ollama, PnL/outcome hoặc nến tương lai.
- **Điều kiện phân loại:** `ABOVE + total BID below > total ASK above` nay tạo **LONG màu đỏ**; `BELOW + total ASK above > total BID below` tạo **SHORT màu xanh**. Nến vẫn phải đóng vượt toàn vùng và close mới nhất còn ngoài vùng; analysis stale, total thiếu/không dương hoặc phía ngược không lớn hơn đều fail-closed. Priority/batch/dedupe/cooldown 5m/15m giữ nguyên.
- **Thống kê/audit:** `detected/analyzed/qualified/selected/deferred/sent`, recent Discord, browser notification và attempt Binance vẫn là telemetry vận hành, không phải WinRate, PF, AvgROE hoặc xác suất. Lịch sử V2 có side cũ được giữ nguyên để phản ánh lệnh đã phát/thử thực tế; không rewrite thành side mới.
- **Ảnh hưởng Binance/entry/size/SL/TP:** có đổi **hướng entry cho event mới**: vùng trên đỏ gọi route LONG/BUY, vùng dưới xanh gọi route SHORT/SELL. Size vẫn MARKET `4 USDT margin ×5`, max50, TP `+10% ROE`; LONG SL `-20% ROE`, SHORT theo policy TP-only. Không tự đóng, đảo chiều, sửa TP/SL hoặc replay các vị thế/lệnh đã có trước deploy.
- **Tương thích JSON/WHITELIST:** eventId/routeKey tiếp tục dựa trên symbol+ABOVE/BELOW+khung nên state cũ đọc được; `sent/lastByRoute/recent/attempts` không migration và không replay. Track cũ được suy hướng từ `direction` khi hiển thị/xét event mới, không tin field `side` legacy. Không thêm label/card/matcher mới nên không có checkbox `WHITELIST` mới; exact LONG/SHORT Auto Controls giữ trạng thái hiện hành, default catalog OFF và policy chỉ hiện matcher khi CLOSED `AvgROE >4%` không đổi.

### 2026-10-03 — BINANCE_SIGNAL_ORDER_MANAGER_V1

- **Version/phạm vi:** `BINANCE_SIGNAL_ORDER_MANAGER_V1_AUDIT_LIFECYCLE_LIVE_PNL_20261003`; thêm trang read-only `/binance-signal-orders` và API phân trang `/api/binance-signal-orders`. Navigation nâng `LOCAL_AI_NAVIGATION_ALL_MENUS_V5_BINANCE_SIGNAL_ORDERS_20261003`, kiểm thử phủ 48/48 menu. Trang tra cứu tối đa 10.000 fill Binance thật đã được common audit ghi nhận, tìm theo symbol Unicode, hướng, status, outcome, signal type/label/source, reason, combo, order/client ID và khoảng ngày Việt Nam.
- **Dữ liệu dùng trước entry:** tên loại tín hiệu, nhãn, source/stream/page, reason/combo, matcher, entry/TP/SL, margin/leverage và DCA đều lấy nguyên context causal đã đăng ký trước khi order được xác nhận `FILLED`; trang không lấy outcome tương lai để đổi nhãn. Vị thế đang mở ghép snapshot Position Monitor/REST hiện tại theo exact `symbol+direction`; không gọi Ollama/CoinGlass và không suy diễn một lệnh không có audit.
- **Điều kiện phân loại:** `ACTIVE` khi record audit chưa đóng và Binance còn position cùng symbol+hướng; `CLOSED` chỉ khi audit lifecycle đã ghi đóng; `OPEN_UNCONFIRMED` khi audit còn OPEN nhưng snapshot Binance không còn position tương ứng. Đây là trạng thái đối soát, không phải tier/gate hay tín hiệu vào mới. Search/filter/sort chỉ thay tập hiển thị.
- **Thống kê/PnL:** CLOSED dùng `net = gross realized − commission + funding` và ROE đã lưu; nhiều fill/DCA cùng `close_group_id` chỉ tính một lifecycle khi tính W/L/WinRate, còn net tổng cộng đúng phần PnL đã phân bổ theo notional. ACTIVE dùng unrealized PnL của position tổng do Binance cung cấp rồi phân bổ cho các fill audit đang mở theo filled notional; UI ghi rõ đây là phân bổ tương đối, không phải PnL độc lập chính xác của từng fill. `OPEN_UNCONFIRMED` không được gán PnL hoặc outcome. Summary luôn tính trên bộ lọc hiện tại.
- **Ảnh hưởng Binance/entry/size/SL/TP:** `observeOnly=true`, `binanceMutation=false`; endpoint chỉ đọc state audit và snapshot vị thế dùng chung, không submit/cancel/close order, không đổi entry, size, margin, leverage, SL, TP, DCA, protection hoặc Auto Controls.
- **Tương thích JSON/WHITELIST:** không sửa schema `binance-filled-signal-audit/state.json`; record V1/V2 thiếu close/live field vẫn được chuẩn hóa khi dựng response, field thiếu giữ `null`/`OPEN_UNCONFIRMED`. API/page là additive, client cũ không ảnh hưởng. Các ô summary là telemetry quản lý lệnh, không tạo signal label/card hiệu quả hoặc runtime matcher, nên không có checkbox `WHITELIST` mới; default OFF và policy chỉ hiện matcher giao dịch khi CLOSED `AvgROE >4%` giữ nguyên.

### 2026-10-03 — LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_V4

- **Version/phạm vi:** `LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_V4_BATCHED_ALL_BREAKOUTS_PRIORITY_20261003`. Sửa V3 từng cắt `breakouts.slice(0, 5)` trước khi đọc order book, khiến các case đứng sau có thể chờ lâu nếu 5 case đầu không đạt depth. Runtime vẫn chỉ arm alert LiqScan mới sau khi service chạy, giữ 5m/15m độc lập và không replay alert cũ.
- **Dữ liệu dùng trước cảnh báo/entry:** MAIN KILL lấy từ alert Binance LiqScan causal tại lúc arm; breakout dùng nến Futures đã đóng liên tục sau `alertAt`, mới tối đa 6 phút với 5m hoặc 16 phút với 15m. V4 đọc Coin Level/Binance visible depth cho **mọi symbol đang breakout**, chia batch tối đa 5 symbol song song; hai khung cùng coin dùng chung một snapshot. Depth cộng NEAR `0–3%` + WIDE `3–20%` cùng coverage thực nhận. Không dùng CoinGlass, Ollama, PnL/outcome hoặc nến tương lai.
- **Điều kiện phân loại:** rule không đổi: `ABOVE + total BID below > total ASK above → SHORT`; `BELOW + total ASK above > total BID below → LONG`; hai total dương và analysis không stale. Toàn bộ event đạt được xếp ưu tiên giảm dần theo `oppositeRatio`, rồi coverage nhỏ hơn của hai phía, opposite notional và cuối cùng breach sớm hơn. Mỗi vòng chỉ chọn tối đa 5 delivery/entry; phần đạt còn lại giữ track để xét tiếp sau 30 giây, không bị cắt khỏi bước phân tích. Dedupe/cooldown 4 giờ tách 5m/15m; track hết hạn 6 giờ.
- **Thống kê/state:** state vẫn lưu track, `completedIntervals`, sent/cooldown và 50 event gần nhất. Snapshot thêm `analysisBatchSize`, `maxDeliveriesPerScan`; kết quả vòng thêm `analyzedSymbols`, `analyzedBreakouts`, `selected`, `deferredQualified`. Đây là telemetry vận hành, không phải WinRate, PF, AvgROE hoặc xác suất thắng.
- **Ảnh hưởng Binance/entry/size/SL/TP:** chỉ thay thứ tự/lịch xử lý event mới trước executor V2: case depth tốt được xét trước, overflow được hoãn chứ không xóa. Exact route/direction không đổi; khi ON vẫn MARKET 4 USDT margin ×5, TP +10% ROE, LONG SL -20% ROE, SHORT TP-only, max50. Không sửa lệnh/vị thế hiện hữu.
- **Tương thích JSON/WHITELIST:** không đổi eventId/routeKey hoặc schema state; JSON V1–V3 đọc nguyên, field telemetry mới chỉ additive và không migration. Env batch-size mới mặc định 5; client cũ bỏ qua. Không thêm signal label/card/matcher, nên không có checkbox WHITELIST mới; exact Auto Controls vẫn mặc định OFF và cohort CLOSED AvgROE `>4%` giữ nguyên.

### 2026-10-03 — BINANCE_SYMBOL_PROTECTION_EXCLUSION_V8_DIRECTION_FLIP_FAIL_CLOSED

- **Version/phạm vi:** controls `AUTO_ENTRY_CONTROLS_V35_DIRECTION_FLIP_FAIL_CLOSED_20261003`; runtime `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V8_DIRECTION_FLIP_FAIL_CLOSED_20261003`. Sửa đúng case MAGMAUSDT: FULL BYPASS đã `POSITION_BOUND` từ 13:09:35 giờ Việt Nam nhưng Coin Level đổi hướng SHORT→LONG lúc 14:10:17 gọi thẳng helper `NegTp`, hủy một Algo TP rồi tạo LIMIT reduce-only tại average entry.
- **Dữ liệu dùng trước quản lý:** chỉ exact symbol của direction-flip và trạng thái exclusion đã persist trong `auto-entry-controls.json`; kiểm tra chạy trước đọc open orders/positions và trước mọi cancel/place/close. Không dùng outcome, PnL tương lai, score AI hoặc dữ liệu sau entry để quyết định bypass.
- **Điều kiện phân loại:** khi symbol thuộc `AUTO_RESUME_ROE_BOUNDARY` hoặc `FULL_POSITION_BYPASS`, toàn bộ nhánh `COIN_LEVEL_OBSERVE_FLIP` bị bỏ qua fail-closed: không hủy entry chờ, không MARKET close vị thế lời và không dời TP vị thế âm về entry. Helper TP-at-entry cũng tự kiểm tra `NEGATIVE_TP_MOVE` trước cooldown, REST, hủy TP cũ hoặc đặt LIMIT, nên caller trực tiếp/`force=true` không thể lọt hàng rào. Khi exclusion không active, direction-flip giữ nguyên hành vi V1.
- **Thống kê/audit:** log `ProtectionExclusion ... skip COIN_LEVEL_OBSERVE_FLIP/NEGATIVE_TP_MOVE` chỉ là audit vận hành theo stage; không phải WinRate, PF, AvgROE, xác suất hoặc cohort signal. Không thêm nhãn/card/tier/gate mới.
- **Ảnh hưởng Binance/entry/size/SL/TP:** có ảnh hưởng quản lý Binance đúng phạm vi: coin đang exclusion không còn bị direction-flip cancel order, close vị thế hoặc thay TP bằng LIMIT tại entry. Không tự hủy LIMIT-at-entry đã lọt trước khi bản sửa chạy; TP/SL/lệnh tay đang có được giữ nguyên. Entry route, margin, leverage và các coin không exclusion không đổi.
- **Tương thích JSON/WHITELIST:** schema JSON và lifecycle `armedAt/activeSeenAt` không đổi; chỉ version string được nâng, JSON V7/cũ đọc tương thích và được chuẩn hóa ở lần save kế tiếp. Không có label/card/matcher giao dịch mới nên không thêm checkbox `WHITELIST`; mặc định OFF và policy chỉ hiện matcher khi CLOSED `AvgROE >4%` giữ nguyên.

### 2026-10-03 — BTC_EXTREME_MOVE_DISCORD_V2_CLOSED_15M_1H_4H

- **Version/phạm vi:** `BTC_EXTREME_MOVE_DISCORD_V2_CLOSED_15M_1H_4H_20261003`. Cùng webhook của AI Signal Review nhận thêm cảnh báo đối xứng `BTC SẬP RẤT SÂU` và `BTC TĂNG RẤT NÓNG`. Scanner dùng chu kỳ BTC context 30 giây hiện hữu nhưng dedupe theo mốc nến đã đóng, baseline trạng thái khi khởi động và không gửi hồi phục/neutral.
- **Dữ liệu dùng trước cảnh báo:** chỉ dùng `btcRelativeReturn15mPct`, `btcRelativeReturn1hPct`, `btcRelativeReturn4hPct` và `btcRelativeReturnClosedAt` dựng từ các nến BTCUSDT Futures 5m đã đóng; card bổ sung giá mark, trend/RSI/funding hiện có để giải thích. Không dùng altcoin outcome, không gọi Ollama, CoinGlass hoặc signed Binance REST.
- **Điều kiện phân loại:** DOWN khi return 15m <= -0,75% với 1h không dương, 1h <= -1,50% với 15m không dương, hoặc 4h <= -3,00% với 1h không hồi quá +0,25%. UP đối xứng. Cường độ level1 tại ngưỡng, level2 từ 1,5 lần, level3 từ 2 lần ngưỡng. Cùng hướng/cùng level cooldown 60 phút; đổi hướng, trạng thái đã về neutral rồi cực đoan lại, hoặc severity tăng được gửi ngay. Ngưỡng/cooldown cấu hình bằng env.
- **Thống kê/state:** `data/btc-extreme-move-discord.json` chỉ lưu direction, level, closedAt, lastEventId và lastNotifiedAt để chống gửi lặp; đây không phải WinRate, xác suất hoặc cohort giao dịch. API Signal Review thêm `discord.btcExtreme` với trạng thái cấu hình/ngưỡng.
- **Binance/entry/size/SL/TP/WHITELIST:** OBSERVE ONLY, không block/mở/đóng Binance, không đổi entry, size, leverage, SL, TP, DCA hay protection. Đây là cảnh báo bối cảnh BTC, không phải signal/card entry hoặc runtime matcher nên không cấp WHITELIST; policy default OFF và closed `AvgROE >4%` giữ nguyên.
- **JSON cũ:** state/file mới additive, không sửa trade/order/control JSON. Thiếu/seeding/stale return fail-closed và không gửi. Client cũ bỏ qua `discord.btcExtreme`.

### 2026-10-03 — AI_SIGNAL_REVIEW_DISCORD_V2_DUAL_1H_4H_ENTRY_IMPROVEMENT

- **Version/phạm vi:** `AI_SIGNAL_REVIEW_DISCORD_V2_DUAL_1H_4H_ENTRY_IMPROVEMENT_20261003`. Sau mỗi báo cáo hoàn tất của `/ai-signal-review`, hậu kiểm độc lập kỳ 1h và 4h rồi post vào webhook riêng khi đồng thời xác nhận hướng đúng và vùng entry gốc tốt hơn. Job tự cập nhật mặc định mỗi 30 phút, tối thiểu 15 phút; report `partial=true` tuyệt đối không gửi. Mỗi horizon baseline mẫu cũ riêng để không flood lịch sử.
- **Dữ liệu dùng trước entry và dữ liệu hậu kiểm:** phần trước entry chỉ lấy immutable sent snapshot: symbol, LONG/SHORT, verdict/score, vùng entry gốc, BTC/regime/breadth/model đúng lúc thông báo. Phần outcome lấy nến Binance Futures 15m sau thời điểm phát; không gọi Ollama mới, không dùng order book hiện tại và không thay snapshot gốc. Chỉ xét `SENT_SNAPSHOT` và mẫu độc lập cùng coin/hướng cách ít nhất 4h.
- **Điều kiện phân loại:** cùng rule cho kỳ 1h và 4h, chi phí hai chiều 0,12%. `HẬU KIỂM PASS` chỉ là event thông báo khi (1) vào ngay có lợi nhuận ròng >0, (2) midpoint vùng gốc được chạm trong chính cửa sổ 1h/4h, (3) vào vùng có lợi nhuận ròng >0, (4) kết quả vùng tốt hơn vào ngay ít nhất 0,10 điểm phần trăm, và (5) còn ít nhất một nến sau nến chạm để đo MFE/MAE. LONG/SHORT dùng công thức tuyến tính hiện hành. Đây không phải xác suất hoặc tín hiệu entry mới.
- **Thống kê/gửi:** state `data/local-ai-signal-review-discord.json` dedupe bằng `eventId|1H` hoặc `eventId|4H`, lưu `BASELINED`/`SENT`; vì vậy cùng tín hiệu có thể báo 1h sớm rồi báo lại 4h nếu vẫn đạt nhưng không lặp trong cùng horizon. Chỉ report hoàn tất mới xét và tối đa 10 thông báo mỗi vòng. Discord ghi rõ horizon, market net, zone net, mức cải thiện, wait, MFE/MAE và bối cảnh BTC lúc phát; LONG xanh, SHORT đỏ. Lỗi webhook không đánh dấu sent để vòng sau thử lại.
- **Binance/entry/size/SL/TP/WHITELIST:** `OBSERVE ONLY`, `binanceEligible=false`; không tạo/cancel lệnh, không đổi route, gate, size, leverage, entry, SL, TP, DCA hoặc protection. `HẬU KIỂM PASS` là kết quả nhìn sau 4h, không phải signal/card trước entry hay runtime matcher nên không cấp checkbox WHITELIST; policy checkbox thật vẫn mặc định OFF và chỉ hiện khi cohort lệnh CLOSED có `AvgROE >4%`.
- **JSON cũ:** không sửa trade/order JSON. API `/api/ai-signal-review` chỉ thêm object `discord`; client cũ bỏ qua. Report/event legacy thiếu snapshot, vùng hoặc nến đầy đủ fail-closed và không gửi. State V1 keyed bằng eventId được coi là dedupe 4h; V2 thêm `baselineHorizons` và key hậu tố horizon, baseline riêng 1h khi migrate nên không gửi lại lịch sử.

### 2026-10-03 — LOCAL_AI_NAVIGATION_ALL_MENUS_V4_SIGNAL_REVIEW

- **Version/phạm vi:** `LOCAL_AI_NAVIGATION_ALL_MENUS_V4_SIGNAL_REVIEW_20261003`. Chuẩn hóa cụm điều hướng của `decision-paper`, `intraday-combos` và `recommended-signals` thành `<nav>` để bộ chèn chung thêm `Đánh giá tín hiệu`, `AI Local` và `Main Kill Gap`; kiểm thử bắt buộc đủ toàn bộ 47/47 trang HTML và đúng một link mỗi loại.
- **Dữ liệu/phân loại/thống kê:** chỉ thay cấu trúc menu; không đọc dữ liệu trước entry, không tạo nhãn/tier/gate/card hoặc thống kê mới. Trang đánh giá tín hiệu vẫn dùng snapshot Discord và nến lịch sử theo version riêng.
- **Binance/entry/size/SL/TP:** không ảnh hưởng Binance, entry, size, SL, TP, Discord hoặc WHITELIST. Không có matcher runtime mới nên không thêm checkbox.
- **JSON cũ:** không đổi JSON/API; HTML cũ vẫn được server chèn idempotent và không tạo link trùng.

### 2026-10-03 — AI_SIGNAL_REVIEW_V1_CAUSAL_ENTRY_COMPARISON

- **Kết quả tạm:** publish mỗi10 coin với `partial=true` và mẫu đã xử lý/tổng dự kiến; chỉ thống kê mẫu đã xử lý, UI không khuyến nghị kết luận từ xếp hạng tạm. Khi hoàn tất `partial=false`; JSON report cũ thiếu cờ đọc như hoàn tất. Không ảnh hưởng Binance/entry/size/SL/TP.
- **Version/phạm vi:** `AI_SIGNAL_REVIEW_V1_CAUSAL_ENTRY_COMPARISON_20261003`, trang `/ai-signal-review`, API `/api/ai-signal-review`, menu chung V3. Đây là bảng nghiên cứu lịch sử các thông báo AI đã gửi Discord, không phải danh sách entry mới. GET đọc báo cáo, nút cập nhật POST cùng origin chạy job nền có tiến độ, chống chạy đồng thời và cache nến; không gọi model.
- **Dữ liệu trước entry:** ghép các event `sent=true` có `sentAt` trong state cũ với journal bất biến, dedupe bằng eventId; lưu kho `data/ai-signal-review/events.json` để tránh mất mẫu khi state Discord prune. Score/entry/BTC/breadth/model chỉ lấy từ journal lúc gửi. Không dùng `state.sample` cũ vì từng bị overwrite, không lấy snapshot hiện tại lấp dữ liệu cũ. Journal V2 khóa sample sau khi gửi, thêm frames/targetPlan và timestamp xác nhận HTTP thành công. V1 vẫn đọc được. Dữ liệu tương lai chỉ dùng làm outcome, không tham gia giả định chọn entry.
- **Điều kiện và cách tính:** dùng nến Binance Futures 15m, giá mở nến kế tiếp sau sentAt làm baseline. So sánh chờ midpoint vùng đã lưu và hồi 0,5% so với baseline (LONG thấp hơn, SHORT cao hơn), chờ tối đa 4h hoặc kỳ đánh giá ngắn hơn. Entry chờ chỉ giả định chạm khi low≤giá≤high, không suy ra khớp nếu giá gap qua. Thoát chung tại đóng nến +1h/+4h/+24h tính từ baseline. SHORT dùng `(entry-exit)/entry`, LONG dùng `(exit-entry)/entry`. Không dùng công thức `entry/exit-1` cho PnL SHORT USDT.
- **Thống kê:** tỷ lệ lời và TB/trung vị sau chi phí giả định hai chiều 0,12% (UI chỉnh được), không đòn bẩy/funding/TP/SL/DCA; MFE/MAE theo phần trăm giá và bỏ nến chạm của entry chờ do chưa biết thứ tự intrabar. So sánh chênh entry trên cùng tập đã chạm, đồng thời báo tỷ lệ chạm và TB mỗi cơ hội (không chạm =0) để tránh loại hết kèo bỏ lỡ. Mẫu chưa đủ kỳ, thiếu nến, thiếu vùng được tách khỏi mẫu đã mô phỏng; cần đủ mọi nến trong kỳ. Mặc định loại lặp cùng coin/hướng trong 4h; cohort không độc lập hoàn toàn giữa coin. Báo cáo 30 ngày, tối đa 20.000 event; nhóm <20 mẫu ghi mẫu nhỏ.
- **BTC/thị trường:** BTC tái dựng chỉ dùng nến đã đóng trước sentAt; 1h >0,1% UP, <-0,1% DOWN, còn lại FLAT, thiếu nến UNKNOWN. Return 15m/1h/4h được báo rõ là tái dựng; không giả thành trend EMA/bias model lịch sử. Regime, breadth và trend BTC gốc chỉ hiện khi journal đã ghi. Bảng gom theo coin+hướng, giờ VN+hướng+BTC, score, regime hoặc breadth.
- **Binance/entry/size/SL/TP:** OBSERVE ONLY, `binanceEligible=false`; không thay bất kỳ route/gate/size/lệnh/protection nào, Discord vẫn không chặn 65. Không có classifier tín hiệu hay card/matcher giao dịch mới. Các bảng nghiên cứu không phát key cho WHITELIST; không dùng % giá mô phỏng làm closed AvgROE. Policy WHITELIST hiện có OFF mặc định và chỉ hiện khi closed AvgROE >4% giữ nguyên; chi tiết tại `docs/AI_SIGNAL_REVIEW.md` và `docs/BINANCE_AUTO_ENTRY_CONTROLS.md`.
- **JSON cũ:** chỉ thêm directory cache/report/events mới, không sửa trade JSON. Mẫu legacy thiếu dữ liệu giữ UNKNOWN/NO_ZONE; journal được ưu tiên theo bản ghi đầu tiên của event, không backfill bằng giá/điểm hiện tại. Lỗi tải nến được hiển thị và cache hiện có tiếp tục dùng nếu đầy đủ.

### 2026-10-03 — LOCAL_AI_TREND_DISCORD_V7_NO_STRENGTH_GATE_HISTORY

- **Version/phạm vi:** `LOCAL_AI_TREND_DISCORD_V7_NO_STRENGTH_GATE_HISTORY_20261003` thay thế V6. Luồng candidate Discord không còn chặn theo `strength >65`; mọi candidate có verdict `PRIORITY` hoặc `WATCH` đều có thể gửi, sau đó vẫn áp dụng tối đa 3 candidate/vòng, event dedupe và cooldown route 30 phút. Tiêu chí hiển thị `Độ rõ ≥65/100` trong qualification 6/6 không bị xóa; nó chỉ không còn là gate Discord.
- **Dữ liệu dùng trước thông báo/entry:** vẫn dùng evaluation causal hiện tại: symbol, LONG/SHORT, verdict, strength, path/horizon, giá live, vùng engine, invalidation, qualification, BTC, breadth và cờ Ollama/Fallback. Không đọc outcome/PnL, không dùng nến tương lai và không gọi thêm model để gửi.
- **Phân loại/thống kê lịch sử:** mỗi candidate gửi thành công được append một dòng vào `data/local-ai-trend-discord-history.ndjson`, schema `LOCAL_AI_TREND_DISCORD_HISTORY_V1_STRENGTH_BANDS_20261003`. Nhóm điểm là `00_49`, `50_64`, `65_74`, `75_84`, `85_100`, `UNKNOWN`; sample lưu timestamp, giá/vùng, bối cảnh BTC/breadth, model/fallback và input score để backtest 1h/4h/24h sau này. Đây là cohort thu thập mẫu, chưa phải WinRate hay xác suất thắng.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. Thay đổi chỉ gỡ gate webhook và ghi audit history; không thay evaluator verdict, qualification, route PRIORITY Binance, entry, size, leverage, SL, TP hay protection. Dự báo/cảnh báo BTC giữ nguyên.
- **Tương thích JSON/WHITELIST:** state JSON cũ không cần migration; `records` mới chỉ bổ sung `strength`, `strengthBand`, `sample`, `historyPersisted`, còn snapshot trả `candidateStrengthRule: "OFF"`. Journal NDJSON là file additive và chỉ bắt đầu có đủ điểm từ version này; record cũ thiếu score không bị bịa lại. Không thêm label/card/matcher UI mới nên không thêm checkbox WHITELIST; policy matcher mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%` giữ nguyên.

### 2026-10-03 — LOCAL_AI_TREND_DISCORD_V6_CANDIDATE_STRENGTH_GT65

- **Trạng thái:** đã được V7 bên trên thay thế; ngưỡng `>65` không còn chặn Discord.
- **Version/phạm vi:** `LOCAL_AI_TREND_DISCORD_V6_CANDIDATE_STRENGTH_GT65_20261003`. Candidate trong bảng Top 10 AI chỉ được đưa vào luồng Discord khi verdict là `PRIORITY` hoặc `WATCH` **và** `strength > 65`. Giá trị đúng `65` hoặc thấp hơn không gửi. Ngưỡng cấu hình bằng `LOCAL_AI_TREND_DISCORD_MIN_CANDIDATE_STRENGTH`, mặc định `65`; tối đa 3 candidate mỗi vòng và cooldown route 30 phút giữ nguyên.
- **Dữ liệu dùng trước thông báo/entry:** dùng evaluation AI Local hiện hành gồm symbol, hướng LONG/SHORT, verdict, strength, đường đi, horizon, vùng engine và bối cảnh BTC/breadth causal có sẵn. Không đọc PnL/outcome, không dùng nến tương lai và không gọi thêm model chỉ để quyết định gửi.
- **Điều kiện phân loại/thống kê:** filter Discord chạy trước bước giới hạn `maxPerEvaluation`; chỉ đếm `candidates/sent` sau khi qua `PRIORITY|WATCH + strength>65`. Dedupe event, cooldown, màu LONG xanh/SHORT đỏ và thông báo dự báo/chuyển trạng thái BTC giữ nguyên. `strength` là độ rõ xếp hạng, không phải xác suất thắng, WinRate, PF hoặc AvgROE.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. Đây chỉ là gate gửi candidate vào webhook AI Local; không thay evaluator verdict/qualification, route PRIORITY, entry, size, leverage, SL, TP hoặc protection. Thông báo BTC vẫn độc lập với ngưỡng candidate.
- **Tương thích JSON/WHITELIST:** state Discord cũ tiếp tục đọc được; version được nâng và snapshot chỉ thêm `candidateStrengthRule: ">65"`. Không migration/rewrite trade JSON. Không thêm label/card/matcher giao dịch mới nên không thêm checkbox WHITELIST; policy mặc định OFF và chỉ hiện matcher khi cohort CLOSED `AvgROE >4%` giữ nguyên.

### 2026-10-02 — MAIN_KILL_PRICE_FORECAST_V1_CONDITIONAL

- **Version:** `MAIN_KILL_PRICE_FORECAST_V1_CONDITIONAL_20261002`; page/API `LOCAL_AI_MAIN_KILL_GAP_WATCH_V2_PRICE_SCENARIO_20261002`, assets v2-price-forecast. Thêm cột văn bản dự báo giá có điều kiện cho mỗi coin, không thêm tier hay card đếm.
- **Dữ liệu trước entry:** Coin Level snapshot tối đa 5 phút, nến 5m/15m đã đóng mới tối đa một chu kỳ + 1 phút, vùng hỗ trợ/kháng cự, top depth Binance, MAIN/lifecycle hiện có. BTC lấy regime/bias evaluation tối đa 20 phút; thiếu/cũ được ghi rõ. Không gọi thêm Ollama, không bịa giá, không dùng outcome hoặc nến tương lai. Horizon 15m–1h là thời gian theo dõi, không phải ETA chạm giá được hiệu chuẩn.
- **Điều kiện:** chỉ nêu hướng khi nến 5m và 15m cùng UP/DOWN. 1h/BTC ngược hướng được giải thích. Vùng kiểm tra đầu là vùng cấu trúc/depth/MAIN hợp lệ gần MARK nhất theo hướng nến. MAIN phải còn active, nằm hoàn toàn đúng phía MARK và cùng hướng nến; MAIN xa hơn vùng đầu chỉ là mục tiêu tiếp sau nến 15m đóng vượt toàn vùng rồi retest 5m giữ. MAIN ngược hướng không đảo dự báo. Snapshot/nến cũ hoặc thiếu, hai khung xung đột: chưa cấp vùng mục tiêu. Vô hiệu tham khảo là nến 15m đóng vượt mép xa của vùng cấu trúc đối diện gần nhất, thiếu vùng thì để null.
- **Thống kê:** không thay counts/sort/gap/vacuum, không tính xác suất, WinRate hay AvgROE; chỉ thêm giải thích per-row và khoảng cách tới vùng đầu. Đây là kịch bản deterministic chưa backtest/hiệu chuẩn, không giả là kết quả model mới.
- **Binance/entry/size/SL/TP:** OBSERVE ONLY, `binanceEligible=false`; không nối route, không gửi Discord hoặc thay lệnh/protection. Mốc vô hiệu không đặt SL thật.
- **JSON/WHITELIST:** field `rows[].priceForecast` additive; JSON/client cũ thiếu field hiển thị yêu cầu làm mới, không migration. Không thêm nhãn phân loại hay card thống kê/matcher giao dịch, chỉ cột nội dung phân tích, nên không thêm checkbox giao dịch; policy matcher hiện hữu mặc định OFF và closed AvgROE >4% giữ nguyên.

### 2026-10-02 — LOCAL_AI_ORDER_BOOK_SIDE_TOTALS_V1_20261002

- **Version:** Coin Level `COIN_LEVEL_ANALYSIS_V11_ORDER_BOOK_SIDE_TOTALS_20261002`; profile `BINANCE_ORDER_BOOK_RANGE_PROFILE_V2_SIDE_TOTALS_20261002`; chatbot `LOCAL_AI_TREND_CHAT_V16_ORDER_BOOK_SIDE_TOTALS_20261002`; UI `LOCAL_AI_ORDER_BOOK_SIDE_TOTALS_UI_V1_20261002` (JS v39/CSS v12).
- **Dữ liệu dùng trước entry:** snapshot Binance Futures depth đang dùng cho Coin Level, tách BID dưới MARK và ASK trên MARK. Tổng gồm mọi level hợp lệ trong hai dải không chồng nhau `NEAR 0–3%` và `WIDE >3–20%` mà response Binance thực sự phủ tới; không cộng CoinGlass/LiqScan, không suy diễn phần ngoài coverage, không dùng PnL/outcome hoặc nến tương lai.
- **Điều kiện phân loại/hiển thị:** `TỔNG BÊN DƯỚI · BID` là tổng `price × quantity` của BID; `TỔNG BÊN TRÊN · ASK` là phép cộng tương ứng của ASK. Hai dòng hiện cả USDT và tỷ trọng trên tổng BID+ASK trong phạm vi; nếu profile JSON cũ thiếu totals, UI chỉ fallback cộng các zone đang hiển thị và không bịa phần depth bị thiếu. Đây là snapshot order book có thể bị rút, không phải xác suất hoặc dự báo hướng.
- **Thống kê:** chỉ là tổng quote-notional và số level theo side tại thời điểm snapshot; không phải liquidation USD, WinRate, PF, AvgROE hay thống kê hiệu quả. Bucket nổi bật NEAR/WIDE bên dưới vẫn giữ nguyên.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. Không đổi signal/tier/gate/verdict, không submit/cancel order, không đổi entry, size, leverage, SL, TP, protection hoặc Discord; chatbot/page tiếp tục `OBSERVE ONLY`.
- **Tương thích JSON/WHITELIST:** thêm additive `orderBookProfile.totals` và `near/wide.totals`; client cũ bỏ qua, cache cũ vẫn render bằng fallback zone. Không migration/rewrite JSON cũ. Đây là dòng chi tiết trong kết quả hỏi coin, không phải signal/card thống kê hiệu quả hoặc runtime matcher nên không thêm checkbox WHITELIST; default OFF và policy CLOSED `AvgROE >4%` giữ nguyên.

### 2026-10-02 — BINANCE_SYMBOL_PROTECTION_EXCLUSION_V7_NEXT_POSITION_LATCH

- **Version:** controls `AUTO_ENTRY_CONTROLS_V34_FULL_BYPASS_NEXT_POSITION_LATCH_20261002`; runtime `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V7_NEXT_POSITION_LATCH_20261002`. Sửa case `龙虾USDT`: FULL BYPASS bật lúc 19:39:56 sau khi vòng trước đã đóng, REST cleaner tự gỡ lúc 19:40:02, nên vòng mới fill lúc 19:40:12 lại được tạo TP/SL lúc 19:40:15.
- **Dữ liệu dùng trước entry/quản lý:** exact symbol, thời điểm người dùng bật, quan sát vị thế active từ Position Monitor/full-fill hoặc REST position mới, rồi xác nhận close/reversal của Binance. Không dùng signal score, nến, PnL lịch sử hay outcome tương lai. Entry route/size không tham gia phép gắn lifecycle.
- **Điều kiện phân loại:** FULL BYPASS mới bắt đầu ở `ĐÃ GÀI CHỜ VỊ THẾ`. Nếu đã có vị thế lúc bấm hoặc có full-fill/REST active sau `armedAt`, state chuyển `POSITION_BOUND / ĐÃ GẮN VỊ THẾ`. Close snapshot trước khi từng thấy active sau lúc bật không được tự gỡ; chỉ close/reversal sau `activeSeenAt` mới gỡ. Mode tạm theo ROE giữ nguyên. Đây là control protection thật, không phải nhãn signal/tier.
- **Thống kê/audit:** state thêm `protectionFullBypassLifecycles[symbol]={armedAt,activeSeenAt}` và event `POSITION_BOUND`; chỉ là audit vòng đời, không phải WinRate, PF, AvgROE hay xác suất. UI phân biệt trạng thái chờ vị thế và đã gắn vị thế.
- **Ảnh hưởng Binance/entry/size/SL/TP:** không chặn entry hay market close tay, không đổi size/leverage. Khi active, toàn bộ tạo/bù/dời TP/SL, profit-lock và Fast Wave bị chặn; thêm low-level fence từ chối mọi conditional reducing order nếu một nhánh cấp cao thiếu guard. TP/SL đã có không bị hủy chỉ vì bật mode. Sau đúng vòng vị thế đã gắn đóng/đảo chiều, protection vòng sau dùng lại bình thường.
- **Tương thích JSON/WHITELIST:** lifecycle object là field additive; JSON V6 thiếu field được dựng `armedAt` từ event `ENABLED`, `activeSeenAt=null` rồi bind khi thấy vị thế thật. Client cũ bỏ qua field; không rewrite audit/trade cũ. Không thêm card/matcher signal nên không thêm checkbox WHITELIST; default OFF và policy CLOSED `AvgROE >4%` giữ nguyên.

### 2026-10-02 — LOCAL_AI_MAIN_KILL_GAP_WATCH_V1_ATR_DEPTH_VACUUM

- **Version:** `LOCAL_AI_MAIN_KILL_GAP_WATCH_V1_ATR_DEPTH_VACUUM_20261002`; trang `/main-kill-gap-watch` lấy tối đa 10 candidate trong evaluation AI hiện tại rồi ghép Coin Level/LiqScan và Binance Futures depth của đúng symbol. Menu toàn hệ thống thêm `Main Kill Gap` qua navigation V2.
- **Dữ liệu dùng trước entry:** AI chỉ cung cấp symbol/side/verdict/strength/path/horizon đang có; phép gap dùng MARK, MAIN KILL 15m proxy, ATR15 từ nến đóng và top bucket order book NEAR/WIDE Binance đã nằm trong Coin Level. Sau restart, nếu evaluation RAM chưa có, trang dùng đúng top-10 deterministic shortlist đầu vào AI và gắn `UNRATED/PENDING_MODEL`, không giả là model đã chấm. Không gọi Ollama mới, không dùng CoinGlass, PnL, outcome hoặc nến tương lai. USD MAIN là proxy từ quote-volume/pressure/age/leverage weight; USD depth là notional lệnh chờ nhìn thấy và có thể bị rút.
- **Điều kiện phân loại:** `GAP RỘNG` cần đồng thời khoảng cách từ MARK tới mép gần MAIN `>=1,2%` và `>=2 ATR15`. `VACUUM XÁC NHẬN` cần thêm depth đúng phía phủ đến mép MAIN và top depth nằm giữa chiếm `<=25%` tổng top depth nhìn thấy bên đó. Thiếu ATR hoặc coverage luôn fail-closed thành `CHƯA XÁC NHẬN`; MAIN đã chạm/quét/tiêu thụ không được gọi là mục tiêu active.
- **Thống kê:** card chỉ đếm top-10 AI hiện tại, số gap rộng, vacuum xác nhận và thiếu coverage. Đây là thống kê snapshot vận hành, không phải WinRate, AvgROE, profit factor hay xác suất quét/thắng.
- **Ảnh hưởng Binance/entry/size/SL/TP:** không ảnh hưởng. Endpoint/page có `observeOnly=true`, `binanceEligible=false`; không submit/cancel, không đổi entry, size, leverage, SL/TP, protection hoặc Discord. JSON/API cũ không đổi; endpoint mới độc lập, analysis thiếu field trả trạng thái thiếu an toàn. Đây không phải runtime signal/card giao dịch nên không có matcher/checkbox WHITELIST giả; default OFF và policy chỉ hiện matcher có CLOSED AvgROE `>4%` giữ nguyên.

### 2026-10-02 — LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V5_HOVER_LIQUIDATION_USD

- **Version:** `LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V5_HOVER_LIQUIDATION_USD_20261002`, UI JS v38/CSS v11. Khi hover MAIN/FAR KILL, tooltip hiện thêm `Thanh lý proxy ước tính tại vùng: ≈ ... USD`; số lớn rút gọn K/M/B. Vùng đã tiêu thụ đổi nhãn thành `Giá trị proxy tại snapshot đã quét`, không mô tả như USD sẽ còn bị thanh lý.
- **Dữ liệu dùng trước entry:** chỉ dùng `mainKillZone.score`/`farKillZone.score` có sẵn trong Binance 15m LiqScan snapshot. Score được dựng causal từ quote-volume nến, buy/sell pressure, age weight và leverage weight; đây là **USD proxy ước tính**, không phải danh sách vị thế hay liquidation order xác thực của Binance. Hover không fetch thêm API, không gọi Ollama và không dùng outcome/nến tương lai.
- **Điều kiện phân loại:** chỉ hiện giá trị vùng khi con trỏ nằm trong MAIN/FAR hoặc trên chỉ báo FAR. `active=false` luôn mang trạng thái đã quét; score thiếu/âm hiện thiếu dữ liệu, còn `0` là giá trị hợp lệ. Tỷ trọng TRÊN/DƯỚI và lifecycle V4 giữ nguyên.
- **Thống kê:** chỉ định dạng lại score proxy hiện hữu sang USD K/M/B; không tạo probability, cohort, WinRate, AvgROE hay thống kê hiệu quả mới.
- **Ảnh hưởng Binance/entry/size/SL/TP:** không ảnh hưởng Binance, entry, size, leverage, SL/TP, protection hoặc Discord; toàn bộ chart vẫn `OBSERVE ONLY`. JSON/API cũ không đổi, response thiếu score vẫn render. Không có card/matcher giao dịch mới nên không thêm WHITELIST; default OFF và policy chỉ hiện khi CLOSED AvgROE `>4%` giữ nguyên.

### 2026-10-02 — BINANCE_AUTO_CONTROLS_SESSION_RECOVERY_V1 + ORDERS_PASSWORD_AUTH_V1

- **Version:** `BINANCE_AUTO_CONTROLS_SESSION_RECOVERY_V1_20261002` và `ORDERS_PASSWORD_AUTH_V1_PUBLIC_CONTROLS_20261002`. Auto Controls thử lại đúng một lần khi API write trả `401`: bỏ token hết hạn, thử phiên `.env` local, rồi fallback sang `orders_creds` đã lưu. Nếu domain public không có credential trình duyệt, nút Mở quyền nhận `ORDERS_PASSWORD`, server xác minh Binance bằng key/secret trong `.env` rồi mới cấp session.
- **Dữ liệu dùng trước entry/quản lý:** chỉ token trình duyệt và credential Orders do chính người dùng đã lưu trước đó. Symbol hai input vẫn theo normalizer V6 (`US` và `USUSDT` đều thành `USUSDT`). Không dùng nến, score, PnL tương lai hoặc outcome để cấp quyền/lưu mode.
- **Điều kiện phân loại:** không thêm phân loại tín hiệu. Input protection chỉ được xóa sau response `2xx`; lỗi xác thực/lưu giữ nguyên nội dung và hiện `KHÔNG LƯU`. Write bị từ chối trước update mới được retry một lần, nên không nhân đôi mutation. Password so sánh timing-safe, khóa 10 phút sau 5 lần sai; same-origin so theo host và `x-forwarded-proto` để HTTPS proxy hợp lệ nhưng origin khác vẫn bị chặn.
- **Thống kê:** không đổi thống kê fill/WinRate/AvgROE/PnL; test trình duyệt mock xác nhận cả hai input lưu sau stale token và chuẩn hóa đúng symbol.
- **Ảnh hưởng Binance/entry/size/SL/TP:** không đổi entry, size, leverage, SL/TP hoặc lifecycle protection. Đây chỉ là khôi phục quyền ghi controls; mọi rule/gate hiện hữu vẫn giữ nguyên.
- **Tương thích JSON/WHITELIST:** chỉ thêm endpoint auth, không đổi JSON controls hay file controls; không migrate/rewrite dữ liệu. Password không lưu trong browser/JSON. Không thêm label/card/matcher/WHITELIST; default OFF và policy CLOSED AvgROE >4% giữ nguyên.

### 2026-10-02 — BINANCE_SYMBOL_PROTECTION_EXCLUSION_V6_LIFECYCLE_AUDIT

- **Version:** controls `AUTO_ENTRY_CONTROLS_V33_PROTECTION_BYPASS_LIFECYCLE_AUDIT_20261002`; runtime `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V6_LIFECYCLE_AUDIT_20261002`. Màn hình Auto Controls hiển thị sáu sự kiện protection gần nhất để phân biệt lưu thất bại với rule đã lưu rồi tự gỡ.
- **Dữ liệu dùng trước entry/quản lý:** exact symbol đã chuẩn hóa, mode `AUTO_RESUME_ROE_BOUNDARY` hoặc `FULL_POSITION_BYPASS`, thao tác người dùng, ROE boundary và xác nhận vị thế đóng/đảo chiều từ Binance hiện hữu. Mã ngắn như `US` tiếp tục chuẩn hóa thành `USUSDT`. Không dùng signal score, outcome tương lai hoặc dữ liệu sau entry để chọn mode.
- **Điều kiện phân loại:** add/remove thủ công ghi `ENABLED/CLEARED`; tự gỡ theo ROE hoặc close/reversal ghi `AUTO_CLEARED` cùng reason chính xác. FULL BYPASS vẫn chỉ tự gỡ khi Binance xác nhận đóng/đảo chiều; không tự gỡ theo ROE. Lịch sử chỉ giải thích vòng đời, không phải signal, tier hay gate.
- **Thống kê:** lưu tối đa 20 event, UI hiện 6 event mới nhất; đây là audit vận hành, không phải số lệnh, WinRate, AvgROE hoặc xác suất.
- **Ảnh hưởng Binance/entry/size/SL/TP:** không đổi quyền entry, size, leverage hoặc rule protection V5. Khi mode active vẫn bỏ qua tạo/bù/đổi TP/SL, trailing, profit-lock và Fast Wave; khi tự gỡ vì vị thế kết thúc thì vòng sau dùng protection bình thường.
- **Tương thích JSON/WHITELIST:** `protectionExclusionEvents=[]` là field additive; JSON cũ thiếu field đọc thành mảng rỗng, event lỗi bị bỏ qua và giữ tối đa 20. Không migration/rewrite lịch sử lệnh. Không thêm matcher/card thống kê nên không có checkbox WHITELIST mới; default OFF và CLOSED AvgROE >4% giữ nguyên.

### 2026-10-02 — LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V4_HOVER_LIQUIDITY

- Version `LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V4_HOVER_LIQUIDITY_20261002`, JS v37/CSS v10. Tooltip hiện giá, MAIN/FAR tại vùng hover, điểm proxy có sẵn và tỷ trọng thanh khoản phía TRÊN/DƯỚI của toàn snapshot. Tỷ trọng không phải xác suất giá sẽ quét vùng cụ thể, không suy phía đối diện bằng 100 trừ tỷ trọng.
- Dữ liệu trước entry/hiển thị: chỉ snapshot chart đã nhận gồm `proxyDirection`, `proxyDominantPct`, `mainKillZone`, `farKillZone`, score và lifecycle; không fetch/model mới khi hover, không outcome/tương lai. Vùng FAR ngoài scale được xem qua đường chỉ báo FAR.
- Phân loại hiển thị: chỉ nhận MAIN/FAR khi giá hover nằm trong biên; hover chỉ báo FAR chọn riêng FAR. `active=false` ghi đã tiêu thụ và ẩn tỷ trọng khỏi tooltip mục tiêu; thiếu active ghi chưa rõ trạng thái. Thiếu số giữ thiếu, không ép null thành 0. Chưa có xác suất hiệu chuẩn nên ghi rõ điều đó, không tạo phần trăm dự đoán mới.
- Thống kê: không thêm cohort, WinRate, AvgROE hay xác suất; tái trình bày score/tỷ trọng hiện hữu. Đây là tooltip OBSERVE ONLY, không card/nhãn thống kê hoặc gate giao dịch.
- Binance/entry/size/SL/TP/Discord: không ảnh hưởng. JSON/API/state cũ không đổi; snapshot thiếu field vẫn hiện thông báo thiếu dữ liệu. Không thêm matcher/WHITELIST; default OFF và CLOSED AvgROE >4% giữ nguyên.

### 2026-10-02 — LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V2_NO_OVERLAP

- Version: `LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V2_NO_OVERLAP_20261002`, đi cùng
  chatbot `LOCAL_AI_TREND_CHAT_V14_ORDER_BOOK_KILL_ZONE_CHART_20261002`. Khi câu
  hỏi trả đúng một coin ở chế độ Ollama + Binance order book, UI vẽ SVG gồm BID
  trái, ASK phải, MARK hiện tại và hai dải chú thích rõ `MAIN KILL`/`FAR KILL`.
- Dữ liệu dùng trước entry là snapshot Coin Level tại lúc hỏi, public Binance
  Futures depth tối đa 1000 level đã chia NEAR 0–3%/WIDE 3–20%, MARK và LiqScan
  15m hiện hành. Chart không đọc PnL, nến tương lai hay CoinGlass; thanh BID/ASK
  là depth thật tại snapshot, còn MAIN/FAR là proxy LiqScan và được ghi nguồn rõ.
- Điều kiện phân loại: chỉ vẽ khi `coins.length === 1` và có order book. MAIN là
  cụm chính/gần hơn, FAR là cụm xa; mỗi vùng giữ lifecycle riêng
  active/touching/swept/rejected để vùng đã tiêu thụ bị làm mờ. Đây là nhãn giải
  thích **OBSERVE ONLY**, không phải xác suất, order thật hoặc gate giao dịch.
- Layout V2 không đổi phân loại: bỏ chữ đè trực tiếp trên các thanh depth, dùng
  tooltip + legend; scale chính chỉ chứa depth/MAIN/MARK để vùng FAR rất rộng
  không ép dẹt cụm giá gần. FAR được chỉ báo riêng ngoài khung và có card range/
  khoảng cách bên dưới. Các pill NEAR/WIDE và sweep đổi thành dòng/card tách biệt.
- Thống kê chỉ hiển thị notional USDT/level của depth và score/khoảng cách proxy
  có sẵn; không tạo WinRate, AvgROE, PnL hoặc ranking mới. Danh sách nhiều coin
  tiếp tục dùng card gọn và không vẽ chart để tránh hiểu sai/chiếm màn hình.
- Binance/entry/size/SL/TP: không ảnh hưởng. Không signed REST, Discord, arm setup,
  MARKET/LIMIT, margin, leverage hay protection. Không thêm label/card thống kê
  runtime nên không có key/checkbox WHITELIST mới; default OFF và policy chỉ hiện
  checkbox khi CLOSED AvgROE `>4%` giữ nguyên.
- JSON tương thích additive: `liqScan.current` thêm `farKillZone` và giữ score/
  distance bounds; `liquidityScenario` thêm `markPrice`, `mainKillZone`,
  `farKillZone`. Client/JSON cũ thiếu các field này vẫn hiển thị phần cũ và ẩn
  chart/band tương ứng; không migrate hoặc rewrite dữ liệu lịch sử.

### 2026-10-01 — LOCAL_AI_TREND_INFERENCE_PROFILE_V3_INDEXED_RATINGS · giảm fallback timeout

- Version: `LOCAL_AI_TREND_INFERENCE_PROFILE_V3_INDEXED_RATINGS_20261001`. Giữ
  `qwen3:8b` và đủ Top 10 nhưng giảm profile CPU từ context 6144/output 1800 về
  context 4096/output 384, batch128. Model trả đúng 10 rating compact theo index,
  mỗi rating chỉ có verdict/strength/path; timeout vẫn 180 giây và lỗi model vẫn
  đi deterministic fallback.
- Dữ liệu dùng trước entry không đổi: candidate causal từ nến đóng/Coin Level,
  very-strong/early watch, vùng engine và invalidation, trend/volume score, BTC
  1h/4h và breadth tại snapshot. Không đọc PnL hoặc nến tương lai; không bớt Top
  10 và không thêm order book vào auto evaluator.
- Điều kiện phân loại không đổi: index được server ghép lại đúng `symbol|side`,
  verdict vẫn `PRIORITY/WATCH/WAIT/AVOID` cùng 6 check hiện hành. Lý do/rủi ro,
  horizon và vùng giá được engine causal dựng/ghép, model không được lặp hay bịa
  chúng; deterministic fallback vẫn có nhãn riêng, `modelApplied=false`.
- Thống kê/ranking không đổi: strength và 6 check không phải xác suất, WinRate
  hay PnL. UI nay tô trạng thái lỗi khi lần inference gần nhất timeout/thất bại,
  không còn báo xanh chỉ vì `/api/tags` vẫn thấy Ollama online.
- Binance/entry/size/SL/TP: không đổi. Model PRIORITY hợp lệ vẫn dùng route vùng
  engine 3 USDT ×5 hiện hữu khi controls ON; fallback tiếp tục fail-closed và
  không arm Binance. Không thay Discord, leverage, protection hoặc vị thế cũ.
- JSON tương thích additive: evaluation `usage` và health snapshot thêm
  `inferenceProfile {version,numCtx,numPredict,numBatch,timeoutMs}`; JSON cũ thiếu
  field vẫn đọc được, không migrate/rewrite. Không thêm label/card/key WHITELIST;
  key hiện hữu vẫn mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%`.

### 2026-10-01 — LOCAL_AI_HOURLY_BTC_GUIDANCE_V1 · banner hướng + danh sách hai phía

- Version: `LOCAL_AI_HOURLY_BTC_GUIDANCE_V1_20261001`. Trang AI thêm banner màu
  ngay đầu nội dung: xanh khi thống kê giờ/BTC nghiêng LONG, đỏ khi nghiêng SHORT,
  vàng khi NEUTRAL; banner ghi rõ giờ VN, BTC 1h/4h và quality lịch sử.
- Dữ liệu dùng trước entry chỉ là snapshot
  `BTC_HOURLY_ENTRY_FORECAST_V3_ALL_SIZES_CLEAR_BEST_HOURS_20261001` hiện tại và
  Top 10 `LOCAL_AI_TREND_EVALUATOR_V3_TOP10_OVERALL_20261001`. Không đọc nến/PnL
  sau thời điểm snapshot. Phân loại hướng giữ nguyên minimum score 53, edge 4 và
  các tầng mẫu profile BTC >=4, hour×BTC >=6, hour >=12.
- Hai list LONG/SHORT chỉ nhận candidate đúng side có verdict `PRIORITY` hoặc
  `WATCH`, xếp PRIORITY trước rồi strength giảm dần; `WAIT/AVOID` bị loại. Mỗi
  dòng công bố vùng engine và độ rõ; nếu hướng theo giờ là LONG/SHORT nhưng không
  có candidate cùng hướng thì hiển thị rỗng, không bịa coin thay thế.
- Thống kê không đổi: mọi size bot margin dương đã đóng, loại DCA/lệnh tay; quality
  dùng win frequency, AvgROE và ROE-PF, còn net USDT chỉ mô tả. Banner là
  **OBSERVE ONLY**, không phải xác suất, signal pass hay gate.
- Binance/entry/size/SL/TP: không đổi. Không gửi Discord, không arm route, không
  tạo MARKET/LIMIT và không đổi lệnh đang mở. Banner tái sử dụng exact key runtime
  `btc-hourly-forecast:{LONG|SHORT|NEUTRAL}`; checkbox mặc định OFF và chỉ được
  hiện nếu cohort CLOSED có AvgROE `>4%` theo policy chung.
- JSON tương thích additive: snapshot thêm `current.whitelistKey` và
  `current.whitelistObservation` version
  `BTC_HOURLY_ENTRY_FORECAST_V1_DAILY_CAUSAL_20261001`; cache/trade cũ không bị
  migrate hoặc rewrite. Thiếu hai field thì UI dựng key hiển thị nhưng vẫn không
  cấp quyền; matcher runtime chỉ nhận observation đúng version.

### 2026-10-01 — BTC_HOURLY_ENTRY_FORECAST_V3_ALL_SIZES_CLEAR_BEST_HOURS · mọi size bot

- Version: `BTC_HOURLY_ENTRY_FORECAST_V3_ALL_SIZES_CLEAR_BEST_HOURS_20261001`, nguồn
  `ALL_BOT_SIZE_ENTRY_TIME_BTC_AUDIT_V2_20261001`. V2 thay bộ lọc riêng margin
  5 USDT bằng mọi entry bot có margin dương; vẫn loại `is_dca=true` và nguồn
  `binance-manual-socket`. Tên script legacy `analyze-margin5-entry-btc.py` được
  giữ để scheduler không đứt, nhưng nội dung/output hiện là all-size.
- Dữ liệu trước entry: fill audit thật, giờ Asia/Bangkok và market-direction
  snapshot as-of có cả `loggedAt/evaluatedAt <= filled_at`, tuổi BTC tối đa 600s.
  Tính chất BTC gồm trend 1h `UP/DOWN/FLAT`, dấu momentum 15m và band return 1h
  `>=+0,3%`, `<=-0,3%`, hoặc small move. Thiếu/cũ giữ UNKNOWN, không nội suy.
- Phân loại ưu tiên mẫu chính xác `giờ + hướng lệnh + BTC trend + momentum15m +
  move1h` khi có >=4 close; thiếu thì lùi về `giờ + BTC trend` >=6, sau đó riêng
  `giờ + hướng` >=12. Điểm tổng hợp ưu tiên profile cụ thể, minimum score 53 và
  edge LONG/SHORT 4; không đủ mẫu/edge là NEUTRAL và không ép hướng.
- Thống kê gồm mọi size theo bucket margin, giờ, hướng, BTC trend/profile, signal,
  phiên và ngày. `qualityScore` dùng win frequency đã smooth + AvgROE + profit
  factor tính trên ROE để mỗi entry có trọng số tương đương, tránh lệnh 10 USDT
  lấn lệnh 1 USDT; net/PF theo USDT vẫn hiển thị mô tả. Hiện cache thật có 2.014
  entry đóng, 1.965 ghép BTC hợp lệ; đây không phải
  portfolio return/xác suất.
- Card hiện ghi trực tiếp hai dòng `Giờ tốt LONG theo BTC` và `Giờ tốt SHORT theo
  BTC`; mỗi chip có giờ VN, hướng lệnh, trend BTC `UP/DOWN/FLAT`, qualityScore và
  số close. Danh sách chỉ lấy tổ hợp `giờ + BTC trend + hướng` đủ >=6 close, xếp
  theo qualityScore và không gán profile BTC hiện tại cho giờ lịch sử khác.
- Ảnh hưởng Binance/entry/size/SL/TP: **không**. Card và API vẫn OBSERVE ONLY,
  không thêm gate/route, không thay margin, leverage, lệnh đang mở hoặc Discord.
- JSON V3 giữ các field V1/V2 (`hourly`, `hourlyByBtcTrend`, coverage/thresholds) và
  thêm `hourlyByBtcProfile`, `hourlyByMargin`, `coverage.marginSizes`,
  `roeProfitFactor`, cùng snapshot dẫn xuất `btcTrendSchedule`/`bestByBtcTrend`.
  Runtime vẫn đọc cache V1/V2 và tự fallback về hour/trend khi
  thiếu field mới; không rewrite audit/trade JSON cũ. Không thêm runtime signal
  key/card mới nên không phát sinh checkbox WHITELIST; default OFF và policy chỉ
  hiện khi CLOSED AvgROE `>4%` giữ nguyên. Test bao phủ profile ưu tiên, fallback
  theo tầng, cache V1/V2, all-size source, best-hour list và UI coverage.

### 2026-10-01 — LOCAL_AI_TOP10_OVERALL_V1 · không chia quota LONG/SHORT

- Version: `LOCAL_AI_TREND_EVALUATOR_V3_TOP10_OVERALL_20261001` và fallback
  `LOCAL_AI_DETERMINISTIC_FALLBACK_V2_TOP10_NO_BINANCE_20261001`. Trang
  `/local-ai-trend-evaluation` hiển thị tối đa 10 candidate mạnh nhất toàn pool,
  không còn cố định một LONG + một SHORT hoặc dự trữ 5 vị trí cho mỗi hướng.
- Dữ liệu trước entry giữ nguyên và chỉ dùng causal/closed data: Coin Level closed
  retest, very-strong pool còn active, early LONG/SHORT, vùng entry/invalidation,
  entry/trend/volume score, BTC 1h/4h và breadth. Sau dedupe `symbol|side`, engine
  xếp hạng source + trend + entry + volume + khoảng cách vùng rồi lấy Top 10 tổng
  thể; vì vậy hợp lệ khi cả 10 dòng cùng LONG hoặc cùng SHORT.
- Model nhận đúng Top 10 này, phải đánh giá mỗi cặp `symbol|side` một lần và trả
  mảng `candidates` xếp strength giảm dần. Verdict/qualification vẫn dùng
  `PRIORITY/WATCH/WAIT/AVOID`, 6 check hiện hành và strength không phải xác suất.
  Fallback cũng xếp tối đa 10 toàn pool nhưng vẫn ghi rõ engine fallback.
- Thống kê trên UI là số candidate được xếp hạng theo snapshot hiện tại, không phải
  số lệnh, WinRate, PnL hay xác suất thắng. Tiêu đề UI đổi thành Top 10 toàn engine
  để không còn hiểu nhầm đây là bảng so sánh một LONG với một SHORT.
- Ảnh hưởng Binance/Discord: không thêm gate, route, label, size, leverage, SL hoặc
  TP mới. Tuy nhiên model path có thể tạo nhiều candidate `PRIORITY/WATCH` hơn;
  Discord hiện hữu sẽ xét từng dòng và route PRIORITY engine-zone hiện hữu có thể
  arm từng PRIORITY khi Auto Controls đang ON. Size route vẫn 3 USDT ×5, chạm vùng,
  TTL và protection cũ; deterministic fallback vẫn fail-closed với Binance.
- JSON mới dùng `candidates[]`; normalizer vẫn đọc `longCandidate`/`shortCandidate`
  của response/snapshot cũ nên tương thích ngược, không migrate hoặc rewrite file.
  Không thêm key/card thống kê mới nên không phát sinh checkbox WHITELIST; policy
  mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%` giữ nguyên. Test bao phủ pool
  lệch hướng 10/0, schema mảng đúng số dòng, sort strength và fallback Top 10.

### 2026-10-01 — BTC_HOURLY_ENTRY_FORECAST_V1_DAILY_CAUSAL · đã được V3 all-size thay thế

- Version: `BTC_HOURLY_ENTRY_FORECAST_V1_DAILY_CAUSAL_20261001`; cache ổn định
  `data/btc-hourly-entry-forecast.json` được xây lúc khởi động chậm và mỗi 6 giờ
  (cấu hình được, tối thiểu 1 giờ), rồi hiển thị đầu `/local-ai-trend-evaluation`.
- Dữ liệu trước thời điểm đánh giá: fill Binance thật có `margin_usdt=5`, do bot,
  `is_dca=false`, loại `binance-manual-socket`; chỉ hàng CLOSED có net PnL được
  chấm. Giờ dùng UTC+7. BTC được as-of join từ log engine khi cả `loggedAt` và
  `evaluatedAt` không sau entry, tuổi snapshot tối đa 600 giây; thiếu/cũ không bịa.
- Phân loại mỗi giờ/hướng dùng số lệnh đóng, win frequency đã smooth, net/avg net,
  AvgROE và profit factor thành `qualityScore` 0–100 **không phải xác suất**. Mẫu
  giờ/hướng cần >=12 lệnh đóng; nhánh điều kiện BTC UP/DOWN/FLAT cần >=6 và được
  blend 65% với BTC + 35% nền giờ. Chỉ chọn LONG/SHORT khi score >=53 và hơn phía
  kia >=4 điểm; còn lại NEUTRAL. UI luôn công bố cỡ mẫu, net, PF, BTC 1h/4h và
  bốn giờ đủ mẫu gần nhất.
- Thống kê là attribution theo từng entry, không phải portfolio return hay vòng
  vị thế độc lập; vị thế nhiều entry có thể khiến mẫu phụ thuộc nhau. Cache hiện
  lưu coverage/hash nguồn và lịch 24 giờ để audit, không được dùng dữ liệu tương lai.
- Ảnh hưởng Binance/entry/size/SL/TP: **không**. Card là OBSERVE ONLY, không sửa
  `LocalAiPassMidpointBinanceRunner`, không arm route, không đổi size, leverage,
  SL/TP hoặc lệnh đang mở; Discord hiện hữu cũng không đổi.
- JSON là file additive độc lập; snapshot/trade cũ không bị migrate/rewrite và API
  cũ chỉ nhận thêm `hourlyEntryForecast`. Exact key dự phòng thống kê
  `btc-hourly-forecast:{LONG|SHORT|NEUTRAL}` khớp UI/runtime, mặc định OFF. Hiện
  không gắn observation vào trade nên không có cohort/checkbox; về sau checkbox
  chỉ được hiện khi CLOSED AvgROE `>4%`, không tự cấp quyền Binance.
- Test bao phủ sample floor, BTC blend, LONG/SHORT/NEUTRAL, 24 giờ, UI card,
  exact matcher/default OFF và dữ liệu mock; không gửi lệnh hay Discord thật.

### 2026-10-01 — LOCAL_AI_DETERMINISTIC_FALLBACK_V1_NO_BINANCE · không mất altcoin khi Ollama lỗi

- Version: `LOCAL_AI_TREND_EVALUATOR_V2_DETERMINISTIC_CAUSAL_FALLBACK_20261001`,
  `LOCAL_AI_DETERMINISTIC_FALLBACK_V1_NO_BINANCE_20261001` và Discord
  `LOCAL_AI_TREND_DISCORD_V5_DETERMINISTIC_FALLBACK_LABEL_20261001`. Scheduler
  vẫn thử `qwen3:8b`; lỗi load/HTTP/timeout/JSON hoặc health chưa sẵn sàng không còn
  làm dừng toàn bộ vòng altcoin mà chuyển sang deterministic causal fallback.
- Dữ liệu trước tín hiệu giữ nguyên và không dùng tương lai/PnL: Coin Level closed
  retest, pool very-strong còn active, early LONG/SHORT, giá/vùng/invalidation,
  entry/trend/volume score, khung nến đã đóng, BTC 1h/4h và breadth. Input được
  dedupe và lấy Top 10 tổng thể, không chia quota LONG/SHORT.
- Phân loại fallback: context BTC thành `UP_STRONG/SW_UP/DOWN_STRONG/SW_DOWN/RANGE`,
  bias có xét breadth; xếp tối đa 10 candidate toàn pool theo strength. Strength là
  điểm xếp hạng từ entry score, độ lớn trend score, volume, khoảng cách vùng và
  nguồn causal, không phải xác suất. `PRIORITY` cần strength >=65, nguồn structural
  (closed retest hoặc entry score >=72), path RETEST/CONTINUATION và không xung đột
  mạnh BTC/breadth; strength >=52 là `WATCH`, còn lại `WAIT`.
- Discord fallback ghi rõ `ENGINE FALLBACK`, LONG xanh/SHORT đỏ, lý do Ollama và
  OBSERVE ONLY. Thống kê vẫn là snapshot candidate/verdict/độ rõ/qualification;
  không phải WinRate, PnL hay AvgROE. BTC notifier riêng tiếp tục như trước.
- Ảnh hưởng Binance: **không**. Evaluation fallback đặt `modelApplied=false`,
  `deterministicFallback=true`, `priorityZoneExecutionEligible=false`; runner xóa/
  không arm setup engine-zone từ fallback dù verdict là PRIORITY. Không đổi size,
  leverage, entry, SL hoặc TP của route model hợp lệ và không sửa lệnh đang mở.
- JSON tương thích ngược theo field additive `deterministicFallback`, `fallback`,
  `modelApplied`, `lastInferenceFailure`; consumer cũ bỏ qua được. Evaluation model
  cũ thiếu các field này vẫn đi theo hành vi cũ. Không thêm runtime signal key,
  tier/card thống kê hay checkbox WHITELIST; default OFF và policy chỉ hiện khi
  CLOSED AvgROE `>4%` giữ nguyên.
- Test bao phủ model HTTP 500/buffer failure, offline health, không bịa symbol,
  nhãn Discord fallback, UI không ghi MARKET 3 USDT cho fallback và runner Binance
  có 0 active setup; toàn bộ request Discord/Binance đều mock.

### 2026-10-01 — ORDER_BOOK_NEAR3_WIDE20_V1 · Binance depth thật hai lớp cho AI Local

- Version đang chạy: `COIN_LEVEL_ANALYSIS_V10_ORDER_BOOK_NEAR3_WIDE20_20261001`,
  `BINANCE_ORDER_BOOK_RANGE_PROFILE_V1_NEAR3_WIDE20_20261001` và
  `LOCAL_AI_TREND_CHAT_V13_ORDER_BOOK_NEAR3_WIDE20_20261001`; UI dùng asset
  `v24-near-wide-orderbook`/CSS `v6-near-wide-orderbook`.
- Dữ liệu dùng trước khi AI trả lời là nến **đã đóng** 5m/15m/1h/4h, BTC/breadth,
  volume và vùng engine hiện hữu, cộng public Binance Futures
  `GET /fapi/v1/depth?limit=1000` của đúng coin. Không dùng CoinGlass order book.
  LiqScan 15m vẫn là proxy từ nến và được ghi riêng, không giả làm sổ lệnh thật.
- Phân lớp order book: `NEAR` từ 0–3%, bucket 0,25%, giữ 4 cụm notional lớn nhất
  mỗi phía BID/ASK để hỗ trợ bối cảnh entry; `WIDE` trên 3% đến 20%, bucket 1%,
  giữ 6 cụm lớn nhất mỗi phía để quan sát vùng hút/cản xa. Nến/trend vẫn là nguồn
  chính; WIDE hoặc LiqScan không được tự đảo kết luận xu hướng nến.
- Coverage ghi số level và khoảng cách xa nhất Binance thật sự trả về cho BID/ASK.
  Nếu 1000 level chưa phủ đến 20% thì chỉ hiển thị phần có thật, WIDE có thể thiếu
  hoặc rỗng và tuyệt đối không nội suy thanh khoản ngoài coverage.
- Thống kê trên card chỉ gồm notional, khoảng cách %, số level trong cụm và độ phủ;
  không phải WinRate, PnL, AvgROE hay xác suất. Đây hoàn toàn **OBSERVE ONLY**:
  chỉ đọc public depth, không gọi signed REST, không thêm gate/route, không đổi
  Binance entry/size/leverage/SL/TP và không thay đổi Discord.
- JSON tương thích ngược theo kiểu additive qua `orderBookProfile`. Snapshot cũ
  thiếu field này vẫn dùng các zone BID/ASK cũ như lớp gần và trả WIDE rỗng; không
  migrate/rewrite file cũ, client cũ có thể bỏ qua field mới. Không thêm signal,
  tier hay card hiệu suất mới nên không phát sinh checkbox WHITELIST; policy mặc
  định OFF và chỉ hiện khi CLOSED AvgROE `>4%` giữ nguyên.
- Test: `scripts/test-coin-level-analysis.mjs` kiểm band/coverage/depth 1000;
  `scripts/test-local-ai-trend-chat.mjs` kiểm compact JSON, legacy fallback,
  prompt ưu tiên nến và UI hiển thị NEAR/WIDE/coverage bằng dữ liệu mock.

### 2026-10-01 — TOXIC_TWO_SIDE_MARKET_V1_20261001 · danh sách coin quét hai đầu

- Trang `/toxic-two-side-market` và API `/api/toxic-two-side-market` xếp hạng toàn
  bộ Futures USDT theo dấu hiệu biến động hai đầu kiểu `龙虾USDT`. Dữ liệu dùng là
  Binance ticker/mark/funding/quote volume 24h dùng chung, market cap CoinGecko đã
  cache và nến **đã đóng** 5m/15m/1h/4h hiện có trong cache. Coin biến động cực
  đoan thiếu mapping cap được fallback CoinGecko trực tiếp, tối đa 12 coin/lượt,
  concurrency 2 và cache 6 giờ; không gọi CoinGlass, order book riêng từng coin,
  Binance kline REST riêng cho page hoặc dùng PnL tương lai để phân loại.
- Score 0–100 gồm: biến động 24h/ATR tối đa 30 điểm; Futures turnover so với market
  cap tối đa 20; xung đột 5m/15m với 1h/4h tối đa 15; funding lệch hướng giá 24h
  tối đa 15; fake-break hai phía trong 36 nến 5m tối đa 20. Tier `EXTREME >=75`,
  `HIGH >=60`, `WATCH >=45`, còn lại `NORMAL`. Đây là điểm rủi ro cấu trúc, không
  phải kết luận scam, xác suất giá hay khuyến nghị LONG/SHORT.
- Thống kê page là snapshot cắt ngang hiện tại: số coin mỗi tier, range, turnover,
  số quét hai phía và coverage nến. Cache 60 giây. Không phải số lệnh, WinRate,
  PnL hoặc AvgROE; thiếu nến/cap được ghi rõ và chỉ tính các thành phần có dữ liệu.
- Hoàn toàn **OBSERVE ONLY**: không blacklist/gate tín hiệu, không mở hoặc đóng
  Binance, không đổi entry/size/leverage/SL/TP và không gửi Discord. Các key card
  `toxic-two-side:{EXTREME|HIGH|WATCH|NORMAL}` khớp UI/runtime, mặc định OFF;
  checkbox WHITELIST chỉ hiện khi CLOSED AvgROE `>4%`. Hiện chưa có cohort closed
  nên các card thống kê không hiển thị checkbox và không cấp quyền giao dịch.
- Matcher yêu cầu `toxicTwoSideObservation.version` đúng V1 và tier hợp lệ. JSON
  cũ thiếu metadata hoặc sai version không match, không được migrate/rewrite.
  Các field ticker `lastPrice/high24h/low24h/range24hPct` được thêm dạng additive;
  client cũ bỏ qua bình thường. Test bao phủ score/tier, sort/filter, exact matcher,
  default OFF, biên AvgROE 4%, menu idempotent và không gọi Binance thật.

### 2026-10-01 — IMPULSE_TIME_OR_BTC_MARGIN5_ELSE1_V1_20261001 · size thật 5/1 USDT

- Phạm vi đúng hai route hiện hữu `post-move-impulse`: LONG
  `POST_DUMP_NO_SELL_BUY_IMPULSE_LONG` ở BUY_IMPULSE; SHORT
  `POST_PUMP_NO_BUY_SELL_IMPULSE_SHORT` ở NO_BUY_CONFIRMATION. Runner V7,
  exclusive policy V48 và controls V31. Không áp size này cho signal khác.
- Trước entry lấy giờ xét lệnh UTC+7 và market-direction BTC cache có evaluatedAt
  <= now, tuổi <=120s. BTC UP cùng LONG, DOWN cùng SHORT; thiếu/cũ/FLAT không cùng
  hướng. Đây là nhãn xu hướng engine, không đồng nghĩa ret1h/ret15m cùng dấu;
  hai biến động vẫn được ghi rõ trong Discord/audit để đánh giá tiếp.
- Giờ tốt: LONG [03,06), [12,15); SHORT [00,09), [18,21), giờ Việt Nam.
  Giờ tốt HOẶC BTC cùng hướng => margin 5 USDT; còn lại 1 USDT. Giờ tốt vẫn
  được 5 khi BTC ngược/thiếu, đúng phép OR. Không suy diễn thành xác suất thắng.
- Có ảnh hưởng size/notional entry MỚI thật: 5/1 USDT ×5. TP +10% và SL plan
  LONG -20% / SHORT -30% ROE cùng lớp protection hiện hành giữ nguyên. Master/route,
  tuổi90s, MARK drift0,5%, max50, no-position/no-order, anti-replay, dedupe giữ nguyên.
  Không sửa vị thế/SL/TP cũ và không bật route OFF. Margin cố định của hai route
  bị thay bởi policy; UI giải thích 5/1 và từ chối chỉnh margin cố định.
- Min-notional dùng policy ceil hiện hữu: chỉ khi requested notional đã >=minimum,
  cho làm tròn tối đa1%; không đủ thì skip/error, không nâng margin1 lên5.
- Discord LONG sớm và SHORT xác nhận (cả kênh xác nhận riêng) dùng decision của
  chính plan, gồm margin, giờ VN, giờ tốt, BTC trend/15m/1h/freshness, lý do OR và
  trạng thái xét. Submitted không được mô tả là FILLED. Attempt lưu decision trước
  submit, signalReason giữ version/hour/BTC/reason cho fill audit.
- Thống kê vẫn dùng fill/close audit, net đã ghi phí/funding; không đổi số liệu
  lịch sử/AvgROE và không thêm card/nhãn tín hiệu hoặc WHITELIST mới. Hai key route
  UI/runtime giữ nguyên, route chưa có mặc định OFF; policy WHITELIST closed AvgROE
  >4% không đổi. Báo cáo giờ trước đó là mẫu ngắn, chưa phải backtest rule size mới.
- JSON attempts cũ giữ nguyên ID/status để không replay; thiếu decision không
  gán size5 giả trong Discord. Controls giữ enabled/enabledAt; metadata quyết định
  là trường mới tùy chọn, không migrate fills/protection. Tests kiểm tra biên giờ,
  OR, thiếu/cũ/future BTC, size spoof, controls/auth, Discord parity, min-notional,
  replay JSON cũ và toàn bộ gate entry cũ bằng mock, không đặt lệnh test thật.

### 2026-10-01 — MARGIN5_ENTRY_TIME_BTC_AUDIT_V1_20261001 · phân tích offline

- Script `scripts/analyze-margin5-entry-btc.py` thống kê fill thật có margin_usdt=5,
  is_dca=false, loại source lệnh tay. Đây là báo cáo offline, không phải gate runtime.
- Dữ liệu trước entry: ghép log market-direction với cả loggedAt và evaluatedAt
  không lớn hơn filled_at; tuổi evaluatedAt tối đa 600 giây, thêm đối chiếu 300 giây.
  Thiếu/cũ đánh dấu UNKNOWN. Giữ nguyên BTC trend/ret15m/ret1h/ret6h/RSI đã ghi;
  không dùng trạng thái BTC hiện tại, không suy diễn thành snapshot 4h hay tick tại fill.
- Phân loại mô tả: giờ Việt Nam UTC+7 (giờ lẻ và nhóm 3h), hướng lệnh, loại signal,
  BTC trend, ret1h <=-0,3%, >=+0,3%, hoặc nằm giữa. Nhóm biến động nhẹ không chứng
  minh sideways. Ngưỡng chỉ phục vụ báo cáo, chưa backtest gate hay đưa vào Binance.
- Thống kê net PnL audit gồm phí/funding ghi nhận, chỉ CLOSED có PnL; OPEN đếm riêng.
  Đơn vị chính là entry fill, các vòng nhiều entry phân bổ theo notional như audit;
  báo thêm số close_group và cohort vòng chỉ một entry. Không phải portfolio return.
- Không đổi Binance/entry/size/leverage/SL/TP, không tạo card/nhãn UI hay checkbox
  WHITELIST; không bật quyền giao dịch. JSON/CSV cũ chỉ đọc, không migrate; metadata
  thiếu không tự gán BTC. Báo cáo có version, hash input, timestamp, từng entry và
  bảng nhóm trong `reports/margin5-entry-time-btc-20261001/`.

### 2026-09-27 — DUMP_CAP_RESISTANCE_DISCORD_V1_20260927 · gửi SHORT khi MARK pass

- Runner server-side quét cả 5 khung từ snapshot `DUMP_CAP_REJECTION_V1_20260927`
  và chỉ nhận plan `DUMP_CAP_RESISTANCE_V1_20260927` có retest + nến xác nhận đã
  đóng. Trước alert dùng OHLCV/ATR/vùng/cản causal, snapshot ≤90 giây và MARK
  Binance Futures ≤15 giây; không cần mở trang `/dump-cap-rejection`.
- Chỉ gửi đỏ `KHÁNG CỰ SHORT ĐÃ PASS` khi plan chưa hết hiệu lực, MARK chưa từng
  chạm stop, đang trong `entryLow..entryHigh`, cách mép kháng cự ≤1 ATR và R:R
  SHORT ròng tại MARK ≥1,5 sau chi phí giả định 0,12%. MARK xuyên stop được latch
  `INVALIDATED`, không gửi nếu giá quay xuống sau đó.
- Dedupe `symbol + timeframe + confirmedAt`, cùng confirmation từ nhiều nến xả chỉ
  chọn plan R:R cao hơn. Startup không replay confirmation cũ; ghi `SENDING` trước
  POST, interrupted/network/5xx không blind-retry; 429 tôn trọng `retry_after` và
  kiểm lại MARK/freshness ngay trước gửi. Dùng webhook observe-only cùng đích đã
  yêu cầu nhưng lưu qua key `.env` riêng; không lộ URL trong API/UI.
- Counts `WATCHING/READY/SENT/EXPIRED/INVALIDATED/delivery error` chỉ là vận hành,
  không phải số lệnh/PnL/WinRate/AvgROE. Không thêm card ngoài 60 key của page;
  WHITELIST vẫn OFF và chỉ hiện khi CLOSED AvgROE >4%.
- Không gọi Binance executor, không đổi entry thật, size/leverage/SL/TP/order/position.
  State notifier riêng versioned, giữ tối đa 7 ngày; JSON trade cũ không migrate.
  Test dùng mock Discord, không gửi tin thử vào webhook thật.

### 2026-09-27 — DUMP_CAP_REJECTION_V1_20260927 + DUMP_CAP_RESISTANCE_V1_20260927

- Trang riêng `/dump-cap-rejection`, API `/api/dump-cap-rejection?interval=15m`,
  5 tab `5m/15m/1h/4h/1d`. Đây là case đối xứng SHORT của pump-base: chỉ nến
  đóng, OBSERVE ONLY; không tự vào Binance và ngưỡng V1 chưa backtest lợi nhuận.
- Dữ liệu trước phân loại: tối đa 128 OHLCV đóng/liên tục; baseline 20 nến trước,
  ATR từ 19 true-range trước nến xả. Nến xả cần close≤open, range≥2,5 ATR,
  open−low≥1,8 ATR, volume≥2×median20. Nến SAU xả phải có high≥open−0,15 ATR;
  quét trên đỉnh khi high>open+0,15 ATR. Wick trong nến xả không thay retest.
- Stage: `AT_CAP`; `REJECTING` khi sau retest đóng giảm và rơi ≥0,5 ATR từ đỉnh;
  `VOLUME_REJECTION` khi 3 close giảm + volume tăng, volume cuối≥1,2×baseline và
  close lại dưới open nến xả; `INVALIDATED` khi đóng trên high retest+0,15 ATR
  hoặc 2 close tăng. Một case=symbol/frame/dumpOpenTime, tối đa96 nến sau xả.
- Kháng cự causal gồm open nến xả, pivot high 2/2 đã xác nhận hoặc low nền 3 nến
  đã bị đóng phá trước retest. Nến retest chạm vùng ±0,15 ATR, đóng dưới vùng,
  râu trên≥25%, volume≤80% max volume nến giảm 6 nến trước; nến kế đỏ phá low
  retest với volume tăng. Stop=max(high retest,mép trên)+0,1 ATR; target là hỗ trợ
  causal gần nhất; R:R SHORT trừ0,12% phải≥1,5 tại nến xác nhận và MARK.
- `READY` chỉ khi plan≤3 nến, snapshot≤90s, MARK≤15s, MARK ở vùng entry
  `entry−0,35 ATR .. entry+0,25 ATR`, dưới mốc retest/kháng cự, cách kháng cự≤1ATR
  và R:R live≥1,5. Giá xa=>WAIT_RETEST, thiếu room=>NO_ROOM, cũ=>STALE, vượt
  stop=>BROKEN. Entry cố định ở close xác nhận, không chạy theo MARK.
- Thống kê page là case/unique coin/coverage và trạng thái 50 dòng đang xem, không
  phải hiệu quả lệnh. 20 key `dump-cap:{frame}:{stage}` + 40 key
  `dump-resistance:{frame}:{status}` khớp UI/runtime, OFF mặc định, checkbox chỉ
  hiện CLOSED AvgROE>4%. Matcher bắt buộc SHORT + observation đúng version;
  không producer Binance từ key. JSON cũ thiếu metadata không match, không migrate.

### 2026-09-27 — PUMP_BASE_SUPPORT_DISCORD_V1_20260927 · gửi khi entry live thật sự pass

- Notifier server-side quét cả `5m/15m/1h/4h/1d`, không phụ thuộc tab trình duyệt.
  Nó chỉ nhận plan `PUMP_BASE_SUPPORT_V1_20260927` đã có retest + nến xác nhận
  đóng; dữ liệu dùng trước alert gồm OHLCV/ATR/vùng/cản causal của plan, snapshot
  không quá 90 giây và Binance Futures MARK không quá 15 giây.
- Phân loại gửi duy nhất là `HỖ TRỢ LONG ĐÃ PASS`: plan chưa hết hạn, chưa từng
  bị MARK chạm stop, MARK hiện nằm trong `entryLow..entryHigh`, cách mép hỗ trợ
  không quá 1 ATR, R:R ròng tại MARK vẫn ≥1,5 sau chi phí giả định 0,12%.
  Giá xuyên stop trong lúc theo dõi được latch `INVALIDATED`, không gửi nếu hồi lại.
- Dedupe theo `symbol + timeframe + confirmedAt`; cùng xác nhận từ nhiều case bơm
  chỉ chọn plan R:R cao hơn và gửi một lần. Startup lấy baseline tại thời điểm chạy,
  không replay confirmation cũ. Ghi `SENDING` trước POST; restart giữa POST chuyển
  `DELIVERY_UNKNOWN` và không blind-retry; HTTP 429 tôn trọng `retry_after` rồi
  kiểm tra MARK/freshness lại ngay trước lần gửi.
- Thống kê notifier chỉ là số `WATCHING/READY/SENT/EXPIRED/INVALIDATED` và lỗi
  delivery trong state 7 ngày, không phải số lệnh, WinRate, PnL hoặc AvgROE.
  Không thêm label/card/WHITELIST mới; 40 key `pump-support:*` hiện hữu vẫn exact,
  OFF mặc định và chỉ hiện checkbox khi CLOSED AvgROE >4%.
- **Chỉ Discord OBSERVE ONLY**: không gọi Binance executor, không đổi entry thật,
  margin/size/leverage/SL/TP hoặc vị thế đang mở. Webhook nằm trong `.env`, response
  API chỉ thêm `supportDiscord={version,configured,evaluatedAt,counts}` và không lộ
  URL. JSON trade/snapshot cũ không migrate; state notifier riêng sai version sẽ
  fail closed. Test mock, không gửi tin thử vào webhook thật.

### 2026-09-27 — PUMP_BASE_SUPPORT_V1_20260927 · hỗ trợ LONG trên trang pump-base

- Additive `record.support` trên cả 5 khung. Chỉ **OBSERVE ONLY**; notifier Discord
  V1 ở mục trên có thể báo riêng khi live pass, nhưng không vào Binance và không
  đổi entry thật/size/SL/TP. Entry hiển thị là giá đóng
  nến xác nhận tham khảo, cố định; MARK chỉ kiểm tra còn hợp lệ, không kéo entry.
- Dữ liệu trước entry: nến đóng/liên tục từ detector hiện có, ATR trước nến bơm.
  Vùng ±0,15 ATR quanh open nến bơm, pivot low sau trả chân (2 nến mỗi bên đã
  đóng), hoặc đỉnh nền 3 nến range≤1,5 ATR đã được đóng vượt. Vùng phải hình
  thành và có nến lấy lại phía trên TRƯỚC nến retest; không dùng pivot tương lai.
- Xác nhận: retest chạm vùng, đóng trên mép trên, râu dưới≥25% range; volume
  ≤80% volume lớn nhất của nến tăng trong 6 nến trước sau trả chân. Nến liền sau
  đóng tăng vượt high retest và volume tăng. Xét 3 nến xác nhận gần nhất, chọn
  xác nhận mới nhất; trường hợp cùng thời điểm ưu tiên plan hợp lệ rồi vùng cao.
- Vô hiệu tham khảo = min(low retest,mép dưới vùng)−0,1 ATR. Kháng cự = mức
  gần nhất phía trên entry trong đỉnh bơm và các pivot high 2/2 đã xác nhận trước
  entry; không bỏ cản gần để nâng R:R. R:R=(target−entry−0,12% entry)/
  (entry−stop+0,12% entry), tối thiểu1,5 cả tại entry gốc và MARK. Chi phí giả định,
  không tính funding/slippage thực và chưa backtest chứng minh lợi nhuận.
- Xanh `READY` chỉ khi snapshot≤90s, MARK≤15s, plan chưa quá3 nến sau xác nhận,
  MARK trên high retest/mép hỗ trợ, nằm trong entry−0,25 ATR đến entry+0,35 ATR,
  cách mép hỗ trợ≤1 ATR và dưới giá tối đa còn R:R≥1,5. Thiếu giá => WAIT_LIVE;
  xa => WAIT_RETEST; thiếu R:R => NO_ROOM; cũ => STALE; chưa xác nhận =>
  WAIT_CONFIRM/NO_SUPPORT. Không đạt thì cột entry live là dấu gạch.
- `BROKEN`: nến từ xác nhận chạm stop hoặc quote mới chạm stop. Trình duyệt
  ghi nhớ quote phá mốc cho cùng case+confirmedAt trong phiên; không hồi xanh
  chỉ vì quote bật lại. UI memory này không persist qua reload; nến đóng sẽ đối
  chiếu lại server. Riêng notifier Discord V1 có MARK stream server cho candidate
  đã phát hiện, latch INVALIDATED và persist ở lượt scan kế; nó không suy diễn tick
  cũ xảy ra trước khi candidate được server đăng ký.
- Thống kê hỗ trợ chỉ đếm các dòng đang xem (tối đa50), KHÔNG số lệnh/winrate.
  40 key WHITELIST `pump-support:{frame}:{status}` khớp UI/runtime; OFF mặc định,
  checkbox chỉ hiện CLOSED AvgROE>4%, hiện null vì chưa có trades nhóm này.
  Matcher cần LONG + `pumpSupportObservation.version` đúng V1. Không producer
  Binance từ matcher. JSON cũ thiếu support => NO_SUPPORT, thiếu observation hoặc
  sai version => không match key; không migrate store cũ. Test cả5frame/live/RR.


### 2026-09-27 — PUMP_BASE_RECOVERY_V1_20260927 · trang bơm / trả chân / hồi volume

- Trang `/pump-base-recovery` (menu V2), GET `/api/pump-base-recovery?interval=15m`;
  5 tab độc lập `5m,15m,1h,4h,1d`. **OBSERVE ONLY**, không route entry/Discord mới,
  không tác động Binance, size, lệnh đang mở, SL hoặc TP.
- Dữ liệu trước quyết định quan sát: OHLCV đã đóng cùng timeframe, tối đa 128 nến,
  thời gian UTC chuẩn Binance, không nhìn nến tương lai. Baseline là 20 nến TRƯỚC
  nến bơm; ATR là trung bình 19 true-range giữa các nến baseline. Thiếu <24 nến,
  đứt chuỗi liên tục hoặc dữ liệu cũ >1 timeframe +90 giây được loại riêng.
- Nến bơm: close >= open, range >=2,5 ATR, high-open >=1,8 ATR, volume >=2×
  median20. Nhận râu trên dài, không bắt buộc thân dài. Chân = open, đỉnh = high.
  Nến SAU bơm phải chạm low <= open+0,15 ATR; wick ngay trong nến bơm không
  thay thế lần trả chân. Quét dưới chân khi đáy sau trả <open−0,15 ATR.
- Theo dõi tối đa 96 nến sau bơm: `AT_BASE` sau trả chân; `RECOVERING` khi có
  nến sau trả đóng tăng và hồi >=0,5 ATR từ đáy; `VOLUME_RECOVERY` khi cả 3 nến
  đóng SAU trả chân liên tiếp tăng close + volume, volume cuối >=1,2× nền trước
  bơm và close lấy lại chân. `WEAKENED` nếu close mất low nến trả chân−0,15 ATR
  hoặc 2 close liên tiếp giảm. Trạng thái được tính lại mỗi snapshot, không phải
  lệnh giao dịch hay chứng minh coin sẽ bơm tiếp. Ngưỡng V1 chưa qua backtest.
- Thống kê: một case = symbol + timeframe + openTime nến bơm. Có thể nhiều case
  cùng coin; hiển thị tổng case và unique coin riêng, số mỗi stage, coverage, lý do
  thiếu/cũ/đứt nến/không có mẫu. Không gọi số case là số lệnh, không tạo WinRate,
  PnL hoặc AvgROE giả. Phân trang 50 dòng, tìm coin, lọc stage/quét chân, sort cột.
- Cache-only ở handler scan; kết quả TTL30s, singleflight mỗi timeframe, yield
  mỗi 8 coin. Có fallback gộp nến nhỏ hơn (5m→15m,15m→1h,1h→4h,4h→1d) chỉ
  khi đủ nến liên tục và bucket đóng. Cache thiếu/cũ được bổ sung nền tối đa 1
  request/15s chung mọi viewer, một lượt 160 nến, không thêm kline subscription;
  chỉ khi có viewer trong 90s, cooldown mỗi coin/khung 10 phút, dừng lúc rate
  gate block/congestion. Không fan-out REST trong HTTP. Khung 1d UTC đóng 07h VN.
- MARK socket chỉ theo tối đa 50 coin đang hiển thị; dừng khi tab ẩn; quote >15s
  không ghi live. MARK dưới chân/đáy hiển thị cảnh báo riêng, không thay stage
  của nến đóng. Nguồn dữ liệu cũ phải thể hiện timestamp, không báo đang đạt live.
- WHITELIST: key chính xác `pump-base:{5m|15m|1h|4h|1d}:{stage}`, UI và runtime
  dùng model chung. OFF mặc định, checkbox chỉ hiện CLOSED AvgROE >4%. Chưa
  có lệnh đóng của nhóm, avgRoe=null nên không hiện checkbox. Matcher chỉ nhận
  LONG có `pumpBaseObservation.version` đúng V1, interval/stage hợp lệ. Không
  có producer/route lệnh tự động từ matcher này; whitelist không cấp quyền trade.
- JSON cũ: không sửa/migrate store hiện có; thiếu observation/version hoặc SHORT
  không nhận key mới. Snapshot riêng không persist, dựng lại từ cache sau restart.


### 2026-09-27 — POST_MOVE_IMPULSE_ENTRY_V1_20260927 · điểm vào sau impulse

- Thay chế độ webhook `POST_MOVE_IMPULSE_CANDLE_DISCORD_WEBHOOK_URL` từ chuyển tiếp
  impulse vàng/cam sang `ENTRY_PASS_ONLY`. Feed cảnh báo sớm cũ và feed confirmation
  vẫn giữ nguyên. Panel mới nằm trong BTC Session, API `/api/post-move-impulse-entry`.
- Dữ liệu trước entry: chỉ cache nến 5m đã đóng (đã lọc theo thời gian), watch causal
  `BUY_IMPULSE` LONG / `SELL_IMPULSE` SHORT. Lưu impulse gốc, vùng retest/base,
  mốc vô hiệu, ATR14 từ 14 true ranges trước impulse và pivot cấu trúc đã xác nhận
  (hai nến mỗi bên, tất cả trước impulse). Không đọc outcome/PnL để chọn điểm vào,
  không tạo REST scanner hoặc dùng nến tương lai.
- Giữ setup tối đa 60 phút dù detector gốc không còn trả watch. Loại khi wick nến
  đóng chạm mốc vô hiệu gốc; thiếu nến liên tục thì chờ, không suy đoán qua khoảng trống.
- `RETEST`: nến sau impulse chạm vùng retest, đóng giữ ngoài base và cùng hướng;
  một nến đóng sau đó vượt đỉnh nến bật (LONG) / đáy nến từ chối (SHORT).
  Vô hiệu tham khảo đặt ngoài cực trị của hai nến, đệm 0,1 ATR.
- `BASE_BREAK`: 2–4 nến sau impulse giữ ngoài base, nền rộng ≤1,2 ATR, hồi ngược
  ≤60% thân impulse; nến tiếp theo đóng phá nền cùng hướng. Vô hiệu ngoài cực trị
  nền và nến phá, đệm 0,1 ATR. Nếu cùng đạt, ưu tiên RETEST; một impulse chỉ gửi
  một điểm vào. Đây là ngưỡng thử nghiệm, chưa chứng minh tối ưu/lợi nhuận.
- Entry tham khảo là close nến xác nhận. Mục tiêu là cản gần nhất từ pivot trước
  impulse hoặc cực trị impulse còn ở phía trước; không bỏ qua cản gần để tạo R:R.
  Cần R:R ròng ≥1,5 với chi phí giả định 0,12% giá: `(reward-fee)/(risk+fee)`.
  Thiếu cản hoặc R:R thấp thì tiếp tục chờ mẫu sau.
- Trước Discord: điểm pass ≤90 giây, MARK socket ≤15 giây, live còn ngoài mốc
  tiếp diễn và chưa phá vô hiệu, chưa chạy quá 0,35 ATR so với entry, R:R live ≥1,5.
  Tin xanh LONG/đỏ SHORT ghi entry, giá live, vô hiệu/mục tiêu tham khảo và BTC.
  BTC lấy 13 nến 5m đóng: UP khi 15m >0,05% và 1h >0,1%; DOWN đối xứng;
  còn lại MIXED, thiếu/cũ thì UNKNOWN. BTC chỉ là metadata đánh giá, không chặn gửi.
- State mới `post-move-impulse-entry.json` lưu pending/delivery độc lập; nhận impulse
  mới sau startup. Pending đã lưu được tiếp tục qua restart nhưng pass trước startup
  bị loại; không migrate/replay state feed cũ. JSON mới sai version/cấu trúc fail closed.
  Dedupe theo symbol+side+impulseAt, POST đang gửi/timeout không rõ kết quả không tự
  gửi lại; HTTP 429 chờ retry_after và kiểm lại freshness/live. Lưu tối đa 2.000
  record/7 ngày; UI chỉ 100 setup cuối trong 24 giờ, dòng SENT là lịch sử.
- Thống kê hiện là số WAITING/READY/SENT/EXPIRED/INVALIDATED/delivery error, không
  phải win rate hoặc PnL. CLOSED cohort chưa có: closedCount=0, AvgROE=null.
  Exact WHITELIST `btc-session:ENTRY:{LONG|SHORT}:{RETEST|BASE_BREAK}` dùng cùng
  key UI/runtime; mặc định OFF, checkbox ẩn cho tới CLOSED AvgROE >4%. Metadata
  `impulseEntryObservation={version,side,method}` phải đúng version/hướng để match;
  JSON trade cũ thiếu metadata vẫn đọc được và không match các key mới.
- Binance/entry thật/size/SL/TP: **không thay đổi**. Tính entry, stop, target mới chỉ
  để thông báo; không gọi executor, không ghi route ON/OFF. WHITELIST không tự cấp
  quyền đặt lệnh. Các route LONG sớm/SHORT confirmation cũ tiếp tục như cấu hình trước.

### 2026-09-26 — BTC Session bỏ market-regime gate cho LONG/Discord V2

- Versions `BTC_SESSION_CONTEXT_V2_IGNORE_LONG_MARKET_REGIME_20260926` và `BTC_SESSION_CONTEXT_READY_DISCORD_V2_IGNORE_LONG_MARKET_REGIME_20260926`. Dữ liệu causal trước cảnh báo vẫn là candidate Coin Level hiện tại, nến 15m phá vùng + retest 5m đã đóng, MARK socket ≤10 giây, snapshot/nến/BTC còn mới, xu hướng BTC 1h và khung giờ Việt Nam. Market Regime vẫn được lấy/hiển thị và ghi vào Discord để tham khảo nhưng `allowLongEntry=false`, state `RECOVERY_TEST/RISK_OFF` hoặc regime thiếu/cũ không còn loại LONG khỏi trang này.
- Phân loại đạt vẫn bắt buộc exact `TRONG VÙNG · CÙNG BTC`: LONG phải cùng BTC 1h UP; SHORT phải cùng BTC 1h DOWN; đúng session, có retest, giá live trong vùng, không stale, không phá mốc và không dual. Chỉ bỏ nhánh `BỐI CẢNH CHƯA CHO LONG`; mọi fail-closed khác giữ nguyên. Discord gửi một lần khi setup chuyển sang rank 3/màu xanh hoặc đỏ, dedupe cũ giữ nguyên.
- Thống kê W/L/PF/AvgROE không đổi; đây là OBSERVE ONLY, không tạo signal route/tier/card mới và không thêm WHITELIST. Exact key `btc-session:{SIDE}:{WINDOW}` tiếp tục default OFF và checkbox chỉ hiện khi CLOSED AvgROE `>4%`.
- Ảnh hưởng Binance/entry/size/leverage/SL/TP: **không có**. Coin Level runner và các route Binance LONG thật vẫn giữ market-regime gate hiện hữu; thay đổi chỉ tác động màu/trạng thái BTC Session và webhook riêng. JSON server/trade cũ không migrate/rewrite; giữ `BTC_SESSION_OBSERVE_V1_20260926` làm version tương thích stats/trade, thêm rule version V2 và nâng notifier state additive, giữ records/dedupe cũ qua restart.

### 2026-09-26 — Protection exclusion tự gỡ cả khi lỗ sâu −25% · V4

- Version `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V4_AUTO_RESUME_ROE15_OR_NEG25_20260926`. Dữ liệu dùng là ROE live hữu hạn của vị thế Binance đang mở từ average entry, MARK và leverage; không dùng signal score, realized PnL hoặc giá lịch sử sau close.
- Phân loại: exact symbol phải đang trong `Bỏ qua TP / SL tự động`; tự gỡ inclusive tại `ROE >= +15%` hoặc `ROE <= -25%` cho cả LONG/SHORT. `+14,999%` và `-24,999%` chưa gỡ. Thiếu/NaN, symbol không nằm trong danh sách hoặc lỗi lưu đều giữ nguyên fail-safe. Close/reversal vẫn tự reset; giảm vị thế/DCA không tự reset nếu chưa chạm một trong hai biên.
- Ảnh hưởng Binance: chỉ xóa/persist exclusion để management TP/SL, SL trail/profit-lock và Fast Wave chạy lại; không mở/DCA/MARKET-close, không đổi entry, margin/size, leverage hay tự áp một TP/SL mới. Biên âm không đồng nghĩa cắt lỗ ngay; scanner protection sẽ bù/quản lý theo rule hiện hành khi đủ điều kiện và Binance khả dụng.
- Thống kê không đổi, không tạo cohort/tier/card/AvgROE và không thêm WHITELIST; checkbox cũ vẫn default OFF, chỉ hiện khi CLOSED AvgROE `>4%`. UI ghi rõ `+15% / −25% / khi đóng`; Discord không đổi. JSON cũ giữ nguyên mảng `protectionExclusions`, chỉ nâng version additive, không migrate/rewrite trade JSON. Test mock bao phủ biên hai phía, persistence restart và thứ tự callback; không gửi lệnh thật. PM2 đã reload, health HTTP 200 và API live trả version V4; `RAREUSDT` đang nằm trong danh sách tại thời điểm kiểm tra nên sẽ được đánh giá trên từng tick ROE tiếp theo.

### 2026-09-26 — Discord cho trạng thái tô màu BTC Session V1

- Version `BTC_SESSION_CONTEXT_READY_DISCORD_V1_20260926`. Dữ liệu dùng trước thông
  báo giống hệt model đang tô màu trên `/btc-session-watch`: candidate Coin Level
  hiện tại, vùng breakout/retest từ nến đã đóng, MARK socket tối đa 10 giây, BTC
  health tối đa 120 giây, market-regime, khung giờ Việt Nam hiện tại và retest 5m
  đã đóng. Không tạo phép tính điểm hoặc nguồn giá Discord riêng.
- Điều kiện phân loại fail-closed là đúng `rank=3`, trạng thái `TRONG VÙNG · CÙNG
  BTC`, LONG class xanh hoặc SHORT class đỏ, không retained/stale/broken/dual, đồng
  thời vẫn `observeOnly=true`, `executionEligible=false` và `binanceEligible=false`.
  Mỗi `symbol + side + window + confirmationAt + retestAt` chỉ gửi một lần; lần chạy
  đầu ghi baseline để không phát lại các dòng đang đạt cũ. HTTP bị từ chối có backoff;
  lỗi mạng không rõ kết quả không gửi mù lần hai.
- Thống kê chỉ là số candidate/sent/error vận hành trong log, không tạo W/L, win rate,
  PF, AvgROE, score, tier, signal label hay card mới. Vì tái sử dụng đúng nhóm hiện có,
  WHITELIST giữ exact key `btc-session:{SIDE}:{WINDOW}`, mặc định OFF và checkbox chỉ
  hiện khi có lệnh CLOSED đúng version với AvgROE `>4%`; không thêm matcher runtime.
- Ảnh hưởng Binance/entry/size/leverage/SL/TP: **không có**. Discord chỉ báo row vừa
  chuyển sang màu xanh/đỏ; không submit/hủy/sửa order, không mở/đóng position và không
  thay master lock hay route. Webhook chỉ lưu trong `.env`, không ghi source/docs.
- Tương thích JSON: state mới độc lập tại `data/btc-session-watch-discord.json`, lưu
  atomically và giới hạn 7 ngày/500 setup. Không migrate/rewrite JSON tín hiệu, lệnh
  hoặc thống kê cũ; file thiếu/hỏng tạo baseline mới. API cũ chỉ nhận thêm cờ additive
  `btcSessionDiscordConfigured`, client không biết field này vẫn hoạt động.

### 2026-09-26 — Vị thế đủ 3 giờ đang dương thì đóng MARKET phần còn lại V1

- Version `BINANCE_POSITIVE_PNL_MARKET_CLOSE_AFTER_3H_V1_20260926`. Đây là quản lý
  **sau fill**, không thay dữ liệu hay điều kiện trước entry. Tuổi vị thế chỉ lấy từ
  `sl-tracking.openedAt` của fill có `entryOrderId`, entry và side còn khớp vị thế
  Binance; nhận cả schema `BUY/SELL` và `LONG/SHORT`. Không dùng thời điểm phát tín
  hiệu, thời điểm restart hoặc `positionFirstSeenAt`; adopted/thiếu metadata fail-closed.
- Điều kiện: position LONG/SHORT vẫn còn mở, đủ `POSITION_TIMEOUT_H=3`, không nằm
  trong `Bỏ qua TP/SL tự động`, không thuộc Cap TSL và gross unrealized PnL Binance
  phải **lớn hơn 0 USDT**. PnL bằng 0 hoặc âm không MARKET-close; nhánh tuổi 3 giờ
  đang âm vẫn độc lập đặt TP về average entry theo V3. Việc còn position đồng nghĩa
  TP gốc chưa đóng hết; nếu đã khớp một phần thì chỉ quantity còn lại được xử lý.
- Ảnh hưởng Binance: `POSITION_TIMEOUT_ENABLED=true` đặt MARKET close-only toàn bộ
  quantity còn lại, `reduceOnly=true` ở one-way hoặc đúng `positionSide` ở hedge.
  Quantity luôn theo LOT_SIZE và fail-closed nếu thiếu metadata. Bot không hủy TP/SL
  trước lệnh MARKET; chỉ cleanup order mồ côi sau khi Binance xác nhận position đã
  đóng. Có dedupe theo lifecycle và mở retry nếu API đặt lệnh lỗi. Gross PnL >0
  không bảo đảm realized PnL ròng vẫn dương sau phí, funding và slippage.
- Thống kê/nhãn/tier không đổi; chỉ thêm log version, tuổi, gross PnL USDT và ROE.
  Không thêm card nên không tạo WHITELIST; policy CLOSED AvgROE `>4%`, default OFF
  của các route entry giữ nguyên. Endpoint `/api/position-timeout` giữ `minRoe` cũ
  để JSON/UI cũ đọc được nhưng trả thêm `minPnlUsdt=0` và `policyVersion`; runtime
  không còn dùng `minRoe` làm gate. Không migrate/rewrite JSON cũ.
- Tests gồm policy biên trước/đúng 3h, PnL âm/0/dương, LONG/SHORT, Cap TSL và executor
  mock one-way/hedge, quantity nguyên 10, dedupe, retry lỗi, protection exclusion;
  test không gọi Binance thật. PM2 đã reload lúc 16:33 VN, PID `1249289`; endpoint
  runtime xác nhận enabled/3h/PnL>0/version V1, rate gate không bị block. Không có
  MARKET timeout nào được submit ngay sau reload vì chưa ghi nhận vị thế hội đủ toàn
  bộ điều kiện tại thời điểm kiểm tra.

### 2026-09-26 — TP entry sau 3 giờ nhận đúng lệnh tay BUY/SELL V3

- Version `BINANCE_NEGATIVE_TP_TO_ENTRY_AFTER_3H_V3_MANUAL_SIDE_NORMALIZED_20260926`.
  Dữ liệu dùng vẫn là fill thật trong `sl-tracking`: `openedAt`, `entryOrderId`, average
  entry hiện tại, amount/side và ROE live. Sửa matcher hướng để `BUY` tương đương LONG,
  `SELL` tương đương SHORT, đồng thời vẫn nhận schema cũ `LONG/SHORT`. Giá trị lạ hoặc
  hướng tracking ngược vị thế tiếp tục fail-closed.
- Điều kiện phân loại không đổi: vị thế còn mở, đúng fill/entry, không adopted, không
  Cap TSL, tuổi từ fill `>=3h` và ROE `<0`. ZENUSDT là case phát hiện lỗi: fill lúc
  11:24:01 VN đã 4,94 giờ nhưng `signalSide=BUY` trước đây bị so trực tiếp với `LONG`,
  làm `openedAt` thành null và bị phân loại nhầm `missing_opened_at`.
- Thống kê không đổi; không tạo label/tier/card/AvgROE mới. Không thêm WHITELIST vì đây
  là protection sau fill, không phải route entry. Policy checkbox mặc định OFF và chỉ
  hiện cho card có CLOSED AvgROE `>4%` giữ nguyên.
- Ảnh hưởng Binance: khi hội đủ điều kiện, bot đặt LIMIT reduce-only/đúng hedge side tại
  average entry rồi mới hủy TP xa; giữ SL, size, leverage và position. Không mở/DCA/
  MARKET-close. Nếu Binance 429/418 hoặc đặt replacement lỗi, TP cũ không bị hủy và
  scanner retry sau cooldown. Không đổi ngưỡng ba giờ hoặc giá entry.
- Tương thích JSON: không migrate/rewrite `sl-tracking.json`; cả `BUY/SELL` hiện hữu và
  `LONG/SHORT` cũ đều đọc được. Field thiếu/sai entry/order id vẫn bỏ qua. Tests thêm
  biên BUY-LONG, SELL-SHORT, hướng ngược và giá trị lạ. PM2 đã reload lúc 16:22 VN;
  ZENUSDT được đánh giá ROE `-10,41%`, tuổi `5,0h`, Binance chấp nhận LIMIT close tại
  entry `7,65`, rồi TP xa cũ mới bị hủy. Log runtime xác nhận V3 đang chạy live.

### 2026-09-26 — BTC Session giữ coin/hướng đáng chú ý trong ngày V3

- Version `BTC_SESSION_DAILY_WATCHLIST_V3_20260926`; dữ liệu trước entry vẫn là
  snapshot Coin Level hiện tại, vùng breakout/retest từ nến đã đóng, MARK socket và
  bối cảnh BTC/market-regime hiện hữu. Mỗi cặp `symbol + LONG/SHORT` từng xuất hiện
  được lưu tối đa 100 dòng trong `localStorage` của đúng trình duyệt và tự tạo danh
  sách mới khi sang ngày Việt Nam; làm mới trang không làm mất hướng đã ghi nhận.
- Phân loại UI: dòng còn trong snapshot được đánh giá bằng rule V1/V2 như trước; dòng
  đã rời snapshot mang `retainedOnly`, nhãn `ĐÃ LƯU {SIDE} · CHỜ NGUỒN TRỞ LẠI` và
  nền vàng. LONG/SHORT được giữ độc lập nên một hướng cũ không làm hướng live thành
  `HAI CHIỀU`. Dòng đã lưu luôn rank 0, không nhận màu xanh/đỏ đạt, không dùng vùng
  cũ làm entry live và không thể được nâng hạng chỉ vì MARK đi vào vùng cũ. Bộ lọc
  `Đáng chú ý hôm nay` là mặc định; `Chỉ snapshot hiện tại` cho xem nguồn tức thời.
- Thống kê chỉ hiển thị số dòng snapshot và số hướng đã lưu; không tính W/L, WR, PF,
  AvgROE hay PnL. Không tạo signal label/performance card mới. Reserved WHITELIST
  exact `btc-session:{SIDE}:{WINDOW}` tiếp tục mặc định OFF, checkbox chỉ hiện khi
  đúng nhóm có lệnh CLOSED AvgROE `>4%`; dòng retained không cấp quyền execution.
- Ảnh hưởng Binance/entry/size/leverage/SL/TP: **không có**. Trang vẫn OBSERVE ONLY,
  không submit/hủy/đóng/sửa order/position, không thay route/master lock và không
  thay giá entry nguồn. Socket chỉ tiếp tục lấy MARK cho các symbol đã lưu.
- Tương thích JSON: không sửa/migrate/rewrite file JSON server. Store trình duyệt có
  version riêng, dữ liệu sai/cũ/khác ngày tự bỏ fail-closed; payload API cũ thiếu
  history vẫn hoạt động. Trình duyệt/máy khác có watchlist riêng và lịch sử chỉ bắt
  đầu tích lũy từ lúc bản V3 được mở.

### 2026-09-26 — Protection exclusion tự gỡ tại +15% ROE (đã reload live)

- Version `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V3_AUTO_RESUME_ROE15_20260926`; ngưỡng cố định `ROE >= 15%` cho cả LONG và SHORT. Dữ liệu dùng là ROE live của vị thế Binance đang mở do `positionMonitor` phát từ entry, mark price và leverage; không dùng điểm tín hiệu, PnL USDT đã chốt hoặc dữ liệu sau khi vị thế đóng.
- Điều kiện phân loại: symbol phải đang nằm trong danh sách `Bỏ qua TP / SL tự động`, ROE phải hữu hạn và đạt đúng/từ +15%. 14,999% chưa gỡ; +15,000% được gỡ. Khi đạt, state `protectionExclusions` được xóa và lưu atomically trước lời gọi profit-lock cùng tick; TP/SL, SL trail và Fast Wave quay lại theo rule gốc. Nếu lưu lỗi, ngoại lệ được giữ fail-safe. Close/reversal vẫn tự reset như V2; giảm vị thế/DCA không tự reset nếu chưa đạt +15%.
- Ảnh hưởng Binance: thao tác này chỉ gỡ khóa quản lý, không tự MARKET-close, không đổi entry/size/leverage và bản thân nó không đặt mức TP/SL mới. Ngay sau khi gỡ, handler profit-lock đang chạy có thể đặt/dời SL theo policy hiện có để giảm nguy cơ lời thành lỗ; các scanner protection cũng có thể bù TP/SL thiếu. Không thay rule profit-lock, mức lock hay route entry.
- Thống kê: không tạo cohort/card/score/AvgROE mới và không thêm WHITELIST checkbox. UI Auto Controls hiển thị rõ `tự gỡ tại +15% ROE / khi đóng`; không đổi Discord. JSON cũ tương thích: cùng mảng `protectionExclusions`, version response nâng V3, không migration trade JSON; thao tác xóa dùng save hiện hữu nên tồn tại qua restart.
- Tests: biên 14,999/15, string/NaN, excluded=false; xác nhận xóa thật khỏi controls, tồn tại sau reload, thứ tự auto-resume trước profit-lock và nội dung UI. PM2 web đã reload, `/healthz` trả process mới và `/api/auto-entry-controls` xác nhận V3. Tại lúc deploy Binance rate gate đang 429 tạm thời; rule đánh giá lại khi position monitor reconnect/nhận ROE, không xóa mù exclusion trong lúc thiếu position.

### 2026-09-26 — BTC Session context color V2

- Version hiển thị `BTC_SESSION_CONTEXT_COLOR_V2_20260926`; không đổi `BTC_SESSION_OBSERVE_V1_20260926` hay matcher chiến lược/WHITELIST. Dữ liệu dùng trước trạng thái giữ nguyên: snapshot Coin Level, vùng retest, giá MARK socket, hướng BTC cache, market regime LONG, session và freshness.
- Chỉ dòng `rank=3` / `TRONG VÙNG · CÙNG BTC` được phân loại màu: LONG nền xanh + viền xanh, SHORT nền đỏ + viền đỏ. Dòng chờ, ngược hướng BTC, dual, dữ liệu cũ, giá phá mốc hoặc chưa live giữ màu trung tính; dual vẫn dùng màu tím hiện có. Màu là trạng thái giao diện, không phải tier/gate giao dịch mới.
- Không đổi cách thống kê, entry score, số ứng viên, giá entry, Binance entry/size/SL/TP, Discord hay executor. Không thêm card thống kê nên không thêm checkbox WHITELIST; reserved key và default OFF giữ nguyên.
- Tương thích JSON cũ: `contextClass` được tính tại client từ row hiện tại, không lưu/migrate/rewrite JSON. Trang cũ thiếu field không tồn tại vì model cùng bundle tạo field; test bao phủ LONG đạt, SHORT đạt và ngược BTC không tô màu.

### 2026-09-26 — TP về entry khi đủ 3 giờ và vẫn âm V2 (lịch sử; V3 đã thay thế)

- Version lịch sử `BINANCE_NEGATIVE_TP_TO_ENTRY_AFTER_3H_V2_20260926` thay mặc định tuổi 8h thành 3h; V3 phía trên đã sửa matcher lệnh tay BUY/SELL và đang chạy live.
- Dữ liệu trước entry/tín hiệu không đổi; đây là quản lý SAU fill, dùng `slTracking.openedAt`, `entryOrderId`, average entry hiện tại, amount/side và ROE từ position monitor/cache. Không dùng giờ phát tín hiệu hoặc `positionFirstSeenAt`. Timestamp adoption hoặc JSON thiếu fill/order id, entry/side không khớp thì bỏ qua, không tự suy tuổi. Tracking hiện có ghi lại fill mới khi tăng vị thế, nên DCA có thể bắt đầu lại thời gian chờ từ fill mới nhất; không coi đó là 3h từ tín hiệu ban đầu.
- LONG/SHORT còn mở, tuổi >=10.800.000ms và ROE <0 mới đưa TP về average entry; ROE=0/dương không đổi. Không cần âm liên tục 3h. Giữ Cap TSL/protection exclusion; nhánh tuổi đủ hạn không đợi FastWave hoặc cache phân loại nến. Rule lỗ sâu -20% và các rule bảo vệ khác vẫn độc lập.
- Ảnh hưởng Binance: LIMIT đóng reduce-only (one-way) hoặc đúng positionSide (hedge) tại entry đã làm tròn tick. Không mở lệnh mới, không đổi size/leverage/SL. Chỉ nhánh tuổi lọc close TP đúng chiều, không hủy opening LIMIT, SL hoặc order chiều hedge khác; đặt TP thay thế thành công trước khi dọn TP cũ. Cooldown/dedup và vòng mark/scanner cũ được tái sử dụng; API lỗi thì retry theo cooldown, không bảo đảm đúng giây thứ 10.800. TP entry chưa bù phí/funding.
- Config mới `BINANCE_NEGATIVE_TP_AFTER_3H_ENABLED/MS`; alias `AFTER_8H_ENABLED/MS` vẫn là fallback nếu chưa có key mới, giữ explicit config cũ. Mặc định 3h; không có override tuổi trong `.env` khi kiểm tra. Exports tên EightHour giữ tương thích import, version/reason mới thể hiện chính sách tuổi. Không migration hoặc rewrite JSON cũ; bản ghi thiếu dữ liệu fail-closed.
- Thống kê: không thêm nhãn/card/closed stats hoặc WHITELIST, không đổi PnL lịch sử; chỉ log trigger version/age/ROE của thao tác thật. Test policy biên 3h, thiếu fill, âm/0/dương, legacy config; executor mock LONG/SHORT, hedge, SL/entry orders, lỗi API, dedup và số lượng nguyên 10. V2 được giữ làm lịch sử; trạng thái triển khai hiện hành xem mục V3 phía trên.

### 2026-09-26 — BTC Session Watch V1 · trang quan sát giá vào theo giờ VN

- Version `BTC_SESSION_OBSERVE_V1_20260926`; `/btc-session-watch.html` chạy ngay từ static server, alias `/btc-session-watch` có sau lần reload server bình thường. Menu V2 liên kết file HTML để không cần restart bot khi triển khai giao diện.
- Dữ liệu trước entry tham khảo: `candidates` hiện tại của `/api/coin-level-entry-watch`, vùng retest/mốc phá/targetPlan từ nến đã đóng của nguồn. Đây KHÔNG phải implementation chiến lược backtest 55 ngày. MARK coin/BTC qua socket; `/api/btc-health` cache xu hướng EMA8/21 1h và 4h (nguồn có thể gồm nến đang chạy), không mô tả là xác nhận BTC nến đóng hay bộ EMA13/25 nghiên cứu.
- Phân loại quan sát: BTC UP ưu tiên xem LONG, DOWN ưu tiên xem SHORT; chỉ nhãn `TRONG VÙNG · CÙNG BTC` khi giá live trong vùng, retest đã có, đúng khung đã chọn, dữ liệu mới, không hai chiều/phá mốc, LONG có marketRegime cho phép. Snapshot >90s, nến 5m >12 phút, BTC >120s hoặc tick >10s chuyển CHỜ/cũ; future timestamp >5s không hợp lệ. Đây là nhãn UI, không gate Binance.
- Khung VN NIGHT 20–02, MORNING 06–08, OTHER còn lại. Ngoài khung đã chọn giữ list lập kế hoạch nhưng không ghi đạt. Entry không chạy theo tick; chỉ thay khi nguồn vùng retest đổi. Từ V3, coin biến mất khỏi API rời tập live nhưng còn ở watchlist ngày với nhãn retained rank 0; không sao chép lịch sử thành tín hiệu live. Sort trạng thái/điểm/khoảng cách/tên; API nguồn tối đa 30 ứng viên được ghi rõ.
- Thống kê: không tạo closed paper trade, không tính win rate/AvgROE từ điểm/biến động; số 39%/9% là mức tăng tương đối của biến động nghiên cứu, không lợi nhuận. WHITELIST exact `btc-session:{LONG|SHORT}:{NIGHT|MORNING|OTHER}` dùng cùng hàm UI/runtime `sessionCardKey`; default OFF, chỉ UI checkbox khi closed AvgROE >4%. Hiện chưa có closed stats riêng nên checkbox ẩn. Runtime chỉ thêm key khi metadata `btcSessionObservation.version` exact V1 và side khớp; JSON cũ thiếu field không match.
- Không thêm executor, không bật Binance, không đổi entry/size/SL/TP/gate của bot cũ, không reset JSON hoặc restart bot. Frontend poll 30s, có timeout/in-flight guard, dừng tải/socket khi ẩn; chỉ dùng API nguồn đã có, không fan-out REST mỗi coin.

### 2026-09-26 — Nghiên cứu giờ BTC / pump-pullback độc lập, KHÔNG chạy giao dịch

- Version `BTC_SESSION_CONTINUATION_RESEARCH_V1_20260926`; đặc tả cố định trước khi tính kết quả tại `docs/research/BTC_SESSION_CONTINUATION_PREREG_20260926.md`.
- Dữ liệu trước entry: nến Binance Vision UM 5m/15m đã đóng, ATR/volume nền chỉ lấy các nến trước, breakout level đã biết và cực trị quan sát được tới thời điểm tín hiệu. Mô phỏng khớp nến 5m kế tiếp; không dùng swing tương lai để đặt entry/SL/TP.
- Phân loại nghiên cứu: impulse 15m → retest vùng phá cũ → nến 5m tiếp diễn; baseline và bộ lọc xu hướng/impulse BTC, LONG/SHORT đối xứng. Đây không phải rule đang bật của bot.
- Thống kê: 55 ngày VN (02/08–25/09/2026), BTC + top 60 crypto theo thanh khoản tháng 7; loại TradFi/gold, không lọc theo trạng thái niêm yết hiện tại. Tách 14 ngày cuối, embargo 6h, tính phí/trượt giá giả định, bootstrap theo ngày. Return theo notional trước funding, không phải ROE hay PnL tài khoản Binance.
- Không đổi Binance/entry/size/gate/SL/TP, không restart bot, không thêm card/nhãn runtime hoặc checkbox WHITELIST. Script research chỉ đọc dữ liệu công khai; không import executor.
- Tương thích JSON: file riêng dưới `data/research/btc-session-20260926/`; không sửa schema/state JSON cũ. Kết quả không được tự động dùng để bật whitelist.
- Kết quả đã chạy: `docs/research/BTC_SESSION_CONTINUATION_RESULTS_20260926.md`. 1.320 giờ, 3.536 impulse, 227 entry mô phỏng; đêm 20–02 biến động cao hơn nhưng hai chiều. LONG BTC trend+impulse toàn kỳ 31 entry TB +0,398% notional sau chi phí giả định, 14 ngày cuối 8 entry TB -0,152%; chưa đủ bằng chứng lợi thế, không bật giao dịch thật.

### 2026-09-26 — SAGAUSDT 15m closed follow-rejection SHORT MARKET 6 USDT

- Versions: detector `EXTREME_SQUEEZE_SAGA_15M_CLOSED_FOLLOW_SHORT_V6_20260926`,
  executor `EXTREME_SHORT_SQUEEZE_SAGA_15M_CLOSED_FOLLOW_6USDT_V5_20260926`,
  policy `LIVE_CARD_SAGA_15M_CLOSED_FOLLOW_V37_20260926`, other-route catalog V12
  và Auto Controls V23. Exact route là `extreme-short-squeeze /
  extreme-short-squeeze-saga-15m / FOLLOW_REJECTION_CLOSED / SHORT`; matcher còn
  bắt buộc `symbol=SAGAUSDT` và `signalInterval=15m`.
- Dữ liệu causal trước entry chỉ gồm nến 15m đã đóng trong cache: nến spike phải đạt
  pump open→high và so với close trước `>=8%`, độ cao `>=4× ATR14`, volume `>=3×`
  trung bình 20 nến, quote volume `>=100.000 USDT`, vượt đỉnh 20 nến `>=1%`; trong
  1–3 nến sau không tạo higher high và nến follow đã đóng trả lại `>=50%` đoạn
  open→high của spike. Stage exact phải là `FOLLOW_REJECTION_CLOSED`; nến live,
  two-side sweep, symbol khác hoặc timeframe khác đều fail-closed.
- Route chỉ nhận event sau `enabledAt`, nến đóng mới tối đa 90 giây, mark Binance
  lệch giá đánh giá tối đa 0,5%; không replay/backfill, không DCA, không submit nếu
  SAGA đã có vị thế hoặc entry order, và giữ cooldown executor 4 giờ/symbol. Entry là
  SHORT MARKET 6 USDT margin ×5 (notional 30 USDT). TP +15% ROE và SL -30% ROE
  được neo lại theo full fill; không sửa vị thế/lệnh cũ. Máy hiện tại có master ON và
  exact route ON từ `2026-09-26T05:07:50.471Z`; tín hiệu cũ hơn mốc này không replay.
- Thống kê chỉ lấy attempt/order/fill Binance thật theo exact route. Không thêm nhãn
  detector hay performance card mới: `FOLLOW_REJECTION_CLOSED` đã tồn tại; do đó
  không thêm WHITELIST mới và policy chỉ hiện checkbox khi CLOSED AvgROE >4%, mặc
  định OFF, giữ nguyên.
- JSON cũ tương thích theo kiểu additive: route/state cũ được giữ nguyên, catalog chỉ
  thêm một key. Event cũ thiếu exact symbol/interval/stage hoặc đã quá tuổi bị chặn;
  không migrate, rewrite hay phát lại cảnh báo/lệnh lịch sử.

### 2026-09-25 — Chặn thống kê Income gây 429/418, ưu tiên quota cho protection

- Version `BINANCE_INCOME_QUERY_COORDINATOR_V1_BUDGETED_SERIAL_CACHE_20260925`.
  Mọi consumer đối soát PnL bằng `/fapi/v1/income` dùng một coordinator chung theo
  fingerprint tài khoản: single-flight, đệ quy tuần tự thay vì hai nhánh song song,
  tối đa 4 request/job, cách nhau ít nhất 3 giây, cache phủ range 15 phút và cooldown
  15 phút nếu job lỗi/không đủ ngân sách. Chỉ chạy khi REST gate không block/auth
  block/congested và còn tối thiểu 600 weight dự phòng.
- Dữ liệu dùng chỉ là lịch sử Binance Income sau khi vị thế đã đóng để thống kê PnL;
  không phải dữ liệu trước entry, không tham gia phân loại tín hiệu hoặc gate giao
  dịch. Nếu range quá dày, thống kê trả cảnh báo/stale từ cache thay vì trả PnL một
  phần hoặc tiếp tục gọi Binance. TTL thống kê Binance và daily timing tăng lên 15 phút.
- Không đổi quyền Binance, entry, size, leverage, SL hoặc TP. Request Income có
  priority thấp; position/open-order/order/protection vẫn đi trước. Không thêm nhãn,
  card hay WHITELIST; policy CLOSED AvgROE >4% mặc định OFF giữ nguyên.
- JSON cũ vẫn tương thích. `/api/binance-rate-gate` chỉ thêm object optional
  `incomeQuery` để quan sát inflight/cache/cooldown; consumer cũ bỏ qua được. Không
  migrate/rewrite state giao dịch và không replay tín hiệu/lệnh.

### 2026-09-25 — 1h/4h chỉ vào bốn loại ưu tiên như bộ lọc 15m

- Versions đang chạy: `POST_MOVE_IDEAL_LONG_1H_PRIORITY_TOUCH_MARKET_5USDT_V2_20260925`,
  `POST_MOVE_IDEAL_SHORT_1H_PRIORITY_TOUCH_MARKET_10USDT_V2_20260925`,
  `POST_MOVE_IDEAL_LONG_4H_PRIORITY_TOUCH_MARKET_10USDT_V2_20260925` và route mới
  `POST_MOVE_IDEAL_SHORT_4H_PRIORITY_TOUCH_MARKET_10USDT_V1_20260925`; policy
  `LIVE_CARD_POST_MOVE_PRIORITY_MTF_V36_20260925`, catalog V11 và controls V22.
- Dữ liệu causal trước entry vẫn là snapshot nến đóng 1h/4h gộp từ cache 15m, vùng
  `idealEntry`, trạng thái/score và giá live để xác định crossing vào vùng. LONG chỉ
  giữ `LONG_FRESH_REVERSAL` hoặc `LONG_FIRST_STRONG_CANDLE`; SHORT chỉ giữ
  `SHORT_NEAR_TOP` hoặc `SHORT_FIRST_STRONG_CANDLE`. Stage watch/extended/weak hoặc
  JSON cũ thiếu `moveStage.key` bị loại trước khi tạo touch/order.
- Bật/restart chỉ baseline; candidate phải đi từ ngoài vào vùng sau `enabledAt`, touch
  <=60 giây, mark Binance còn trong vùng và lệch <=0,5%, không position/entry-order
  cùng coin. LONG 1h giữ 5 USDT; SHORT 1h, LONG 4h và SHORT 4h dùng 10 USDT, đều 5x.
  LONG TP +10%/SL -20% ROE; SHORT TP +6%/SL -30% ROE. SHORT 4h có checkbox exact
  mới seed OFF, được bật tường minh trên máy hiện tại; các route cũ giữ setting/ON cũ.
- Stats chỉ lấy attempt/order id và fill audit Binance thật theo exact route, không tính
  case bị lọc thành lệnh và không thêm performance card/WHITELIST. Policy WHITELIST
  CLOSED AvgROE >4% mặc định OFF giữ nguyên. State SHORT 4h là file additive mới;
  state/JSON cũ vẫn đọc, không migrate/backfill/replay, còn thiếu stage thì fail-closed.

### 2026-09-25 — POST_MOVE_PRIORITY_STAGE_15M_MARKET_2USDT_MAX15_V1_20260925

- Banner hai trang MTF nói rõ chỉ bốn stage ưu tiên mới được route 15m/1h/4h xét
  Binance; các case còn lại vẫn chỉ quan sát.

- Dữ liệu trước entry là snapshot 15m causal
  `POST_DUMP_VOLUME_RECOVERY_MTF_PRIORITY_LABELS_V5_20260925` hoặc
  `POST_PUMP_VOLUME_FADE_MTF_PRIORITY_LABELS_V3_20260925` của hai scanner hậu
  xả/hậu bơm. LONG
  chỉ nhận `LONG_FRESH_REVERSAL` (`VỪA SẬP · ĐANG RÚT CHÂN`, dump <=2 nến, chưa
  có lift đóng và giá live đang rút chân) hoặc `LONG_FIRST_STRONG_CANDLE` (`NẾN HỒI
  ĐẦU TIÊN`, lift age=0 và move >=1% hoặc volume >=1,5x). SHORT chỉ nhận
  `SHORT_NEAR_TOP` (`SÁT ĐỈNH`, pump <=2 nến và fade <=35%/còn trong vùng reject)
  hoặc `SHORT_FIRST_STRONG_CANDLE` (`NẾN GIẢM ĐẦU TIÊN`, sell age=0 và move >=1%
  hoặc volume >=1,5x). Các stage extended/watch/weak không có quyền entry.
- Hai exact route `post-move-ideal-entry / post-dump-volume-recovery-15m /
  LONG_PRIORITY_STAGE_15M / LONG` và `post-move-ideal-entry /
  post-pump-volume-fade-15m / SHORT_PRIORITY_STAGE_15M / SHORT` có checkbox Auto
  Controls riêng, catalog mặc định OFF; máy hiện tại bật theo yêu cầu trực tiếp. Lần
  đầu bật/restart chỉ baseline mọi candidate đang có; chỉ candidate mới vào allowlist
  sau đó mới MARKET. Dedupe theo `side|15m|symbol|anchorAt`, một nhịp chỉ attempt một
  lần; không replay/backfill và không DCA.
- Trước submit phải có master/order/route ON, event <=60 giây và sau `enabledAt`, mark
  Binance lệch giá detector <=0,5%, không position hay entry order cùng symbol. Nếu
  tài khoản đã có >=15 vị thế đang mở thì chặn; plan cũng mang
  `maxOpenPositions=15` để `placeOrder` kiểm lại. Mặc định mỗi lệnh MARKET dùng margin
  2 USDT, leverage 5x (notional 10 USDT). LONG TP +10% ROE, SL -20% ROE; SHORT TP
  +6% ROE, SL -30% ROE; protection neo lại theo full fill.
- Thống kê chỉ dùng fill/audit Binance thật theo exact route, không tạo paper W/L,
  card/tier/AvgROE mới. Hai route có checkbox thực thi mặc định OFF; đây không phải
  WHITELIST performance và không thay policy chỉ hiện WHITELIST khi CLOSED AvgROE
  >4%. Route 1h/4h dùng bộ lọc stage riêng được mô tả ở mục phía trên.
- State mới `post-move-priority-{long,short}-15m-binance.json` và hai route settings
  là additive. Snapshot chỉ dùng key `moveStage` optional đã có; JSON cũ thiếu stage
  fail-closed, không migrate, rewrite hay phát lại. Có ảnh hưởng Binance/entry/size/
  leverage/TP/SL đúng như trên.

### 2026-09-25 — POST_MOVE_STAGE_UI_DISCORD_V1_20260925

- Versions đang chạy: `POST_DUMP_VOLUME_RECOVERY_MTF_PRIORITY_LABELS_V5_20260925`,
  `POST_PUMP_VOLUME_FADE_MTF_PRIORITY_LABELS_V3_20260925` và
  `POST_MOVE_IDEAL_ENTRY_TOUCH_DISCORD_ACTUAL_TYPE_V6_20260925`. Discord không liệt kê
  cả bốn nhãn trong từng tin; nếu stage hiện tại thuộc nhóm ưu tiên thì field `LOẠI ĐẸP`
  chỉ ghi đúng loại thực tế của chính tín hiệu đó. Nội dung vẫn nói rõ Discord chỉ thông
  báo, còn Binance do route riêng và Auto Controls quyết định.
  Chữ `ĐẸP` trong title/vùng giá chỉ xuất hiện khi stage thuộc đúng bốn nhãn ưu tiên;
  stage còn lại dùng `LONG/SHORT ĐÃ CHẠM` và `VÙNG ENTRY`.
  Dữ liệu phân loại trước
  entry lấy từ snapshot causal hiện hữu: nến 15m đã đóng hoặc bucket 1h/4h gộp đủ,
  tuổi nến dòng tiền `lift/sell`, % giá và volume ratio của nến đó, phần trăm hồi/xả
  khỏi biên nến gốc và trạng thái vùng `idealEntry`. Nến live chỉ được dùng để gọi
  nhịp chưa xác nhận là mới bật; không biến nến đang chạy thành xác nhận nến đóng.
- LONG được chia: `VỪA SẬP · ĐANG RÚT CHÂN` khi chưa có lift đóng, dump <=2 nến và
  giá live đang tăng; `NẾN HỒI ĐẦU TIÊN` khi lift vừa đóng có |move| >=1% hoặc
  volume >=1,5x; `ĐÃ CHẠY XA · CHỜ HỒI` khi `WAIT_PULLBACK`, hồi >=65% hoặc lift
  đã qua >=1 nến; còn lại là `ĐANG HỒI · CHỜ XÁC NHẬN`, và setup yếu là `YẾU LẠI`.
  SHORT đối xứng: `SÁT ĐỈNH` khi fade <=35% hoặc còn ở vùng
  `IN_ZONE/WAIT_REJECT`; `NẾN GIẢM ĐẦU TIÊN` khi sell vừa đóng có |move| >=1%
  hoặc volume >=1,5x; `ĐÃ TUỘT XA · CHỜ HỒI` khi `WAIT_BOUNCE`, fade >=60% hoặc
  sell đã qua >=1 nến; còn lại `ĐANG GIẢM · CHỜ XÁC NHẬN`, setup yếu là
  `BẬT LẠI · SHORT YẾU`.
- Hai bảng có cột `Giai đoạn` màu riêng và sort được. Discord LONG/SHORT đẹp khi
  chạm vùng gửi thêm cùng nhãn và hướng xử lý; alert đã gửi không replay. Không thêm
  W/L, WR, PnL, PF hay AvgROE; đây là field/badge giải thích vị trí nhịp giá, không
  phải card/tier/label route nên không tạo matcher/checkbox `WHITELIST`. Policy chỉ
  hiện whitelist khi CLOSED AvgROE >4% và mặc định OFF giữ nguyên.
- Classifier/nhãn tự nó không cấp quyền Binance ngoài các exact route; executor
  15m/1h/4h hiện chỉ đọc bốn `moveStage.key` ưu tiên và fail-closed với key khác.
  JSON snapshot/state chỉ thêm
  object optional `moveStage {key,label,tone,rank,entryHint}` và Discord state nâng
  version theo kiểu additive; consumer/JSON cũ thiếu field vẫn fallback `CHƯA PHÂN
  LOẠI`, không migrate, backfill hay replay.

### 2026-09-25 — POST_MOVE_IDEAL_LONG_4H_PRIORITY_TOUCH_MARKET_10USDT_V2_20260925

- Dữ liệu trước entry lấy từ snapshot cache-only
  `POST_DUMP_VOLUME_RECOVERY_MTF_IDEAL_ENTRY_OBSERVE_V3_20260924`, exact candidate
  LONG khung 4h thuộc `LONG_FRESH_REVERSAL/LONG_FIRST_STRONG_CANDLE`, với status
  `BUILDING/CONFIRMED`, không `WEAKENED`, có vùng
  `idealEntry.zoneLow..zoneHigh`. Bucket 4h chỉ gộp các nến 15m đã đóng đủ. Runner
  phải quan sát setup ở ngoài vùng rồi giá đi vào/cắt vùng; lượt đầu bật/restart và
  candidate lần đầu thấy sẵn trong vùng chỉ baseline, không hồi tố NEARUSDT hay setup
  cũ, không dùng outcome/nến tương lai.
- Trước MARKET, server đọc Position Risk, open orders và mark Binance mới; mark phải
  còn trong vùng, lệch touch <=0,5%, event <=60 giây và sau `enabledAt`. Master,
  order execution và exact route `post-move-ideal-entry /
  post-dump-volume-recovery-4h / LONG_IDEAL_ENTRY_TOUCH / LONG` phải ON; position
  hoặc entry order cùng symbol và giới hạn 30 vị thế đều block.
- Entry thật là LONG MARKET, margin mặc định **10 USDT**, leverage 5x (notional 50
  USDT), TP +10% ROE theo policy LONG hiện hữu, SL −20% ROE neo full fill. Không DCA;
  intent atomic, client id deterministic, mỗi setup attempt một lần và lỗi/timeout mơ
  hồ không retry.
- Route có checkbox Auto Controls exact-key, seed mặc định OFF và máy hiện tại bật do
  yêu cầu trực tiếp. Thống kê chỉ attempt/status/order id và fill audit thật; không tạo
  card/tier/AvgROE/WHITELIST giả. Thay đổi có ảnh hưởng Binance/entry/size/leverage/
  TP/SL như trên, không đổi classifier, điểm hoặc Discord.
- State `post-move-ideal-long-4h-binance.json`, route và audit fields đều additive;
  JSON/API snapshot cũ giữ nguyên, không migrate/backfill/replay và consumer cũ tương
  thích.

### 2026-09-25 — POST_MOVE_IDEAL_LONG_1H_PRIORITY_TOUCH_MARKET_5USDT_V2_20260925

- Dữ liệu trước entry dùng snapshot cache-only
  `POST_DUMP_VOLUME_RECOVERY_MTF_IDEAL_ENTRY_OBSERVE_V3_20260924`: chỉ candidate
  LONG exact 1h thuộc `LONG_FRESH_REVERSAL/LONG_FIRST_STRONG_CANDLE`, status
  `BUILDING/CONFIRMED`, không `WEAKENED`, có vùng
  `idealEntry.zoneLow..zoneHigh`. Candidate 1h được gộp từ nến 15m đã đóng; touch
  chỉ được tạo sau khi runner đã thấy setup ở ngoài vùng rồi giá đi vào/cắt vùng.
  Lượt đầu sau bật/restart và candidate lần đầu thấy sẵn trong vùng chỉ dựng baseline,
  không hồi tố, không dùng outcome hay nến tương lai.
- Trước MARKET, server đọc Position Risk, open orders và mark Binance mới. Mark phải
  còn trong vùng, lệch giá touch không quá 0,5%, event không quá 60 giây và sau
  `enabledAt`; không có position/entry order cùng symbol; master, order execution và
  exact route `post-move-ideal-entry / post-dump-volume-recovery-1h /
  LONG_IDEAL_ENTRY_TOUCH / LONG` phải ON. 15m và 4h có exact route riêng.
- Entry thật là LONG MARKET, mặc định margin **5 USDT**, leverage 5x (notional 25
  USDT), TP +10% ROE theo policy bot LONG hiện hữu và SL −20% ROE neo theo full fill.
  Không DCA; intent được ghi atomic trước submit, client id deterministic và mỗi setup
  chỉ attempt một lần; lỗi/timeout mơ hồ không retry để tránh lệnh trùng.
- Route được nối checkbox Auto Controls với key trùng matcher runtime và seed mặc
  định OFF; máy hiện tại bật do yêu cầu trực tiếp. Margin/leverage/TP có thể sửa ở
  controls nhưng executor phải khớp lại giá trị đã lưu. Thống kê chỉ gồm attempt,
  status/order id và fill audit thật; không tạo card/tier/AvgROE/WHITELIST giả.
- Thay đổi có ảnh hưởng Binance/entry/size/leverage/TP/SL như trên nhưng không đổi
  classifier, điểm hoặc Discord. State mới `post-move-ideal-long-1h-binance.json`,
  route và field audit đều additive; JSON/API snapshot cũ không đổi, không migrate,
  backfill/replay và consumer cũ tiếp tục tương thích.

### 2026-09-25 — POST_MOVE_IDEAL_SHORT_1H_PRIORITY_TOUCH_MARKET_10USDT_V2_20260925

- Dữ liệu trước entry dùng snapshot cache-only `POST_PUMP_VOLUME_FADE_MTF_...`:
  chỉ candidate SHORT exact 1h thuộc `SHORT_NEAR_TOP/SHORT_FIRST_STRONG_CANDLE`,
  status `BUILDING/CONFIRMED`, không
  `WEAKENED`, có `idealEntry.zoneLow..zoneHigh`. Sau baseline mỗi lần bật/restart,
  event mới sinh khi giá đi vào/cắt qua vùng; không replay setup đang nằm sẵn trong
  vùng lúc khởi động và không dùng outcome/nến tương lai. Runner chỉ khởi động khi
  cache 15m có ít nhất số symbol ready tối thiểu của hệ thống; không chờ warm-up EMA
  5m/1h không liên quan, nhưng candidate 1h vẫn phải gộp đủ nến 15m đã đóng. Candidate
  lần đầu xuất hiện khi cache warm-up mà đã ở trong vùng chỉ được baseline; phải thấy
  nó ở ngoài vùng rồi cắt vào sau đó mới có quyền entry.
- Trước MARKET, server đọc lại Position Risk, open orders và mark price Binance. Mark
  phải vẫn nằm trong vùng đẹp, lệch giá touch không quá 0,5%, event không quá 60 giây,
  xảy ra sau `enabledAt`, không có vị thế hoặc entry order cùng symbol, khóa tổng và
  exact route `post-move-ideal-entry / post-pump-volume-fade-1h /
  SHORT_IDEAL_ENTRY_TOUCH / SHORT` đều ON. 15m và 4h SHORT có exact route riêng;
  LONG cũng có exact route 1h và 4h.
- Entry thật là SHORT MARKET, mặc định margin **10 USDT**, leverage 5x (notional 50
  USDT), TP +6% ROE theo policy bot SHORT hiện hữu và SL −30% ROE neo theo full fill.
  Source này được miễn policy
  SHORT TP-only để SL thật không bị bỏ. Không DCA; position/order đang có sẽ block.
  Intent ghi atomic trước submit, client id deterministic và mỗi setup chỉ attempt một
  lần; lỗi/timeout mơ hồ không retry tự động để tránh lệnh trùng.
- Route được nối checkbox quản lý lệnh thật, seed mặc định OFF; máy hiện tại bật vì
  yêu cầu trực tiếp của người dùng. Margin/leverage/TP có thể sửa qua controls nhưng
  mỗi submit phải khớp lại giá trị đã lưu; mặc định TP +6% và SL cố định −30% ROE. Audit fill ghi source,
  label, timeframe, zone/score/status; không tạo card performance hoặc thống kê giả.
- Có ảnh hưởng Binance/entry/size/leverage/TP/SL như trên; không đổi classifier gốc,
  điểm, Discord LONG/SHORT hay rule đóng vị thế hai chiều. State mới
  `post-move-ideal-short-1h-binance.json` và route/env đều additive; JSON/API snapshot
  cũ không đổi, không migrate/backfill/replay và consumer cũ vẫn tương thích.

### 2026-09-24 — POST_MOVE_DUAL_DIRECTION_POSITIVE_PNL_CLOSE_V1_20260924

- Dữ liệu phân loại trước hành động là hai snapshot cache-only cùng lượt của
  `POST_DUMP_VOLUME_RECOVERY_MTF_IDEAL_ENTRY_OBSERVE_V3_20260924` và
  `POST_PUMP_VOLUME_FADE_MTF_IDEAL_SHORT_OBSERVE_V1_20260924`. Coin chỉ thuộc nhóm
  hai chiều khi exact `symbol + timeframe` 15m/1h/4h còn active ở cả LONG và SHORT;
  row `WEAKENED` ở một phía bị loại. Không dùng outcome hay nến tương lai để tạo giao.
- Khi env `POST_MOVE_DUAL_DIRECTION_PROFIT_CLOSE_ENABLED=true`, scanner 15 giây mới
  đọc Binance Position Risk. Chỉ vị thế đang mở của symbol thuộc giao hai chiều và
  unrealized PnL **> 0 USDT** mới là candidate đóng. Ngay trước submit, executor đọc
  mark price mới nhất và tính lại `(mark-entry) * positionAmt`; nếu bằng 0, âm, thiếu
  entry/mark hoặc giá đã đổi làm hết lãi thì fail closed và giữ vị thế.
- Hành động thật là MARKET close toàn bộ lượng vị thế đã đọc: one-way dùng
  `reduceOnly=true`, hedge mode dùng đúng `positionSide`. Khóa inflight theo
  symbol/position-side/hướng và cooldown 120 giây sau submit chống đóng lặp. Rule
  không mở/reverse/DCA, không đổi entry/size/leverage, không dời SL/TP và không đụng
  vị thế hòa vốn/đang âm; cleanup TP/SL cũ vẫn do luồng xác nhận position close có sẵn.
- Thống kê chỉ gồm `dualSymbols/closed/error` và audit log vận hành, không tạo paper
  fill, W/L, WR, PF, AvgROE hay PnL cohort. Đây là protection theo trạng thái live,
  không phải label/card hiệu suất nên không thêm checkbox `WHITELIST`; policy CLOSED
  AvgROE `>4%` và các route entry hiện hữu không đổi.
- Env mặc định trong example là OFF và phải bật rõ trên từng máy. Module/helper/env
  là additive; không đổi schema snapshot/API/JSON hoặc state cũ, không migrate,
  backfill hay replay. Consumer cũ không biết rule này vẫn đọc JSON như trước.

### 2026-09-24 — POST_MOVE_TABLE_SORT_V1_20260924

- Mọi header của bảng LONG hậu xả và SHORT hậu bơm đều là nút sort hai chiều. Lần
  đầu Coin dùng A→Z; trạng thái, điểm, MARK socket/cache, midpoint entry, % hồi/giảm,
  % từ close, độ mạnh nến, quote volume, thời gian dòng tiền, xác nhận, vô hiệu và
  thời gian nến gốc dùng cao→thấp. Bấm lại cùng cột đảo chiều; đổi tab vẫn giữ cột sort.
- Sort chỉ dùng dữ liệu đã có trong browser. Riêng cột giá ưu tiên MARK socket mới nhất,
  fallback `currentPrice` snapshot; giá trị thiếu luôn nằm cuối và giá trị bằng nhau giữ
  thứ tự ổn định. Không đổi candidate, score, trạng thái, zone hay số liệu tổng hợp API.
- Đây là UI only, không tạo label/card/stats/WL/WR/PF/AvgROE/PnL và không thêm
  WHITELIST. Không ảnh hưởng Discord/Binance/entry/size/margin/leverage/SL/TP/order/
  position. API/JSON cũ không đổi; module sort additive, không migrate/backfill/replay.

### 2026-09-24 — POST_MOVE_LIVE_PRICE_SOCKET_V1_20260924

- Hai page `/post-dump-volume-recovery` và `/post-pump-volume-fade` mở một Binance
  Futures WebSocket dùng subscribe động `${symbol}@markPrice@1s` cho đúng tập coin
  đang có trong ba tab 15m/1h/4h. Feed ưu tiên `fstream.binancefuture.com`, tự chuyển
  endpoint, reconnect backoff 1–15 giây và cập nhật danh sách subscribe sau mỗi lần
  snapshot HTTP 15 giây đổi candidate.
- Mỗi row hiển thị tách `MARK socket`, `giá cache` của snapshot và `%` lệch socket so
  cache. Khoảng cách tới midpoint entry được tính lại từ giá socket; khi MARK nằm trong
  `idealEntry.zoneLow..zoneHigh`, ô giá và row có highlight xanh. Đây chỉ là phân loại
  hiển thị live; status/score/CONFIRMED/BUILDING/WEAKENED, nến gốc và ideal-entry zone
  vẫn do snapshot causal nến đóng quyết định.
- Không tạo thống kê giao dịch mới: không paper fill, W/L, WR, PF, AvgROE hay PnL.
  Đây không phải label/card/matcher nên không thêm WHITELIST; default OFF và policy
  chỉ hiện route thật khi CLOSED AvgROE `>4%` không đổi.
- Không ảnh hưởng Binance/entry/size/margin/leverage/SL/TP/order/position và không đổi
  notifier Discord phía server; browser socket chỉ giúp so sánh. API/JSON cũ giữ nguyên,
  không thêm field, migrate, rewrite, backfill hay replay; khi socket mất, row tiếp tục
  hiển thị giá cache nên consumer/UI cũ vẫn tương thích.

### 2026-09-24 — POST_MOVE_IDEAL_ENTRY_TOUCH_DISCORD_V1_20260924

- Bộ notifier nền dùng đúng snapshot cache-only của hai scanner
  `POST_DUMP_VOLUME_RECOVERY_MTF_IDEAL_ENTRY_OBSERVE_V3_20260924` và
  `POST_PUMP_VOLUME_FADE_MTF_IDEAL_SHORT_OBSERVE_V1_20260924`: tối đa 500 nến 15m,
  nến đóng gộp UTC thành 1h/4h và giá live hiện có trong cache. Không gọi REST bổ
  sung, không dùng fill, PnL, outcome hay nến tương lai trước cảnh báo.
- Candidate được theo dõi theo exact `side|interval|symbol|dumpAt/pumpAt`. Chỉ row
  active khác `WEAKENED`, có vùng `idealEntry.zoneLow..zoneHigh` hợp lệ mới đủ điều
  kiện. “Chạm” là giá live nằm trong vùng hoặc đoạn giá giữa hai lượt quét 15 giây
  cắt qua vùng; candidate mới xuất hiện ngay trong vùng sau baseline cũng được tính.
  Lượt đầu sau mỗi lần server khởi động chỉ dựng baseline và không phát lại setup cũ.
- Mỗi setup chỉ gửi một lần và state được lưu atomic ở
  `data/post-move-ideal-entry-discord.json`. Intent được ghi trước HTTP; Discord 429/5xx
  mới được hẹn retry, còn timeout/network mơ hồ không retry mù để tránh trùng. Tối đa
  5 alert/lượt; hai hướng cùng `symbol+interval` vẫn gửi riêng và có cảnh báo hai chiều.
- Thống kê chỉ là số candidate/sent/queued/error vận hành trong log; không sinh paper
  fill, W/L, WR, PF, AvgROE hay PnL và không backfill lịch sử. Đây là Discord
  **OBSERVE ONLY**, không phải label/card/gate giao dịch nên không thêm checkbox
  WHITELIST; policy mặc định OFF và CLOSED AvgROE `>4%` của route thật không đổi.
- Không ảnh hưởng Binance/entry/size/margin/leverage/SL/TP/order/position; payload ghi
  rõ không tự đặt lệnh. Env/state/module là additive; JSON snapshot/API hiện hữu giữ
  nguyên, state cũ thiếu field được merge default, file thiếu được tạo mới và consumer
  cũ có thể bỏ qua hoàn toàn.

### 2026-09-24 — POST_MOVE_DUAL_DIRECTION_UI_V1_20260924

- Hai page LONG sau xả và SHORT sau bơm đối chiếu snapshot hiện tại theo exact key
  `interval|symbol`. Row chỉ nhận badge tím `↕ HAI CHIỀU` khi cùng coin **và cùng
  khung 15m/1h/4h** đang có candidate active ở cả hai scanner; trùng symbol khác
  khung không tính. Candidate `WEAKENED/SHORT YẾU` ở một trong hai phía bị loại khỏi
  giao, nên màu không được hiểu là hai tín hiệu pass khi một chiều đã yếu.
- Dữ liệu phân loại chỉ là hai snapshot cache-only cùng thời điểm refresh 15 giây;
  không dùng fill, PnL, outcome hay nến tương lai. Tab và header vùng hiển thị thêm
  số row hai chiều; row dùng nền tím và badge, nhưng không đổi score, trạng thái,
  vùng entry, mốc xác nhận/vô hiệu hoặc thống kê case gốc của từng scanner.
- Đây là **UI OBSERVE ONLY**, không phải label route, gate hay authorization: không
  gửi Discord, gọi Binance, mở/đóng/DCA lệnh hoặc đổi entry/size/leverage/SL/TP.
  Không thêm performance card/matcher/checkbox `WHITELIST`; policy default OFF và
  chỉ hiện khi CLOSED AvgROE `>4%` của route hiện hữu không đổi.
- Không đổi schema JSON/API/state: giao hai chiều được tính ở browser từ field cũ
  `timeframes[].items[]`; nếu API phía đối diện lỗi thì fail-open cho page chính nhưng
  không tô màu hai chiều. Không migrate/backfill/replay và client cũ tiếp tục bỏ qua.

### 2026-09-24 — POST_PUMP_VOLUME_FADE_MTF_IDEAL_SHORT_OBSERVE_V1_20260924

- Thêm page `/post-pump-volume-fade` và API riêng cho case SHORT đối xứng có kiểm
  soát: một nến bơm mạnh + volume đột biến, sau đó giá rút khỏi đỉnh và xuất hiện
  nến bán tăng volume. Input causal chỉ lấy tối đa 500 nến 15m trong `KlineCache`;
  1h/4h được gộp OHLCV theo UTC, bucket đã đóng phải đủ 4/16 nến thành phần. Nến live
  chỉ cập nhật giá/volume projected, không xác nhận và scanner không gọi REST mới.
- Ngưỡng 15m: body tăng `>=3,5%` hoặc high/open `>=6%`, quote volume `>=1,8×`
  median 20 nến và `>=100k USDT`; 1h: `5%/8%`, `1,7×`, median20, `>=250k`;
  4h: `8%/12%`, `1,6×`, median10, `>=500k`. Giá phải rút ít nhất 15% biên
  open→high cho 15m/1h hoặc 12% cho 4h. `SHORT XÁC NHẬN` cần rút 35%/35%/30%,
  đứng dưới close nến bơm, trend ba nến không bật quá 1,5%, và có nến đỏ đã đóng
  vừa giảm giá vừa tăng quote volume `>=5%` so nến trước, `>=1,1×` nền, mới tối đa
  12/8/4 nến. `ĐANG GIẢM` chưa đủ xác nhận; `SHORT YẾU` là đã giảm nhưng bật lại
  `>=3%` khỏi đáy hậu bơm với trend gần nhất dương.
- Score 0–100 dùng độ lớn bơm, volume bơm, phần biên đã giảm, chất lượng/độ mới nến
  bán; ngưỡng 45 cho 15m/1h và 42 cho 4h. `ĐIỂM SHORT ĐẸP` là vùng retest causal:
  khi có nến bán dùng vùng từ support 50% biên pump/nửa thân nến bán tới high nến
  bán nhưng không vượt high pump; khi chưa có nến bán dùng vùng 38,2–50% open→high.
  UI hiện midpoint, range, khoảng cách live và `ĐANG TRONG VÙNG/CHỜ HỒI LÊN/CHỜ
  REJECT`; `SHORT YẾU` bắt buộc `KHÔNG VÀO`. Đỉnh nến bơm là mốc vô hiệu tham khảo.
- Stats tách ba khung gồm tổng case, symbol unique, confirmed/building/weakened và lý
  do loại; không tính fill, W/L, WR, PF, AvgROE, PnL hoặc paper. Đây là **OBSERVE
  ONLY**, không phải gate/rule thật: không Discord, Binance, entry, size/leverage,
  SL, TP, order hay position. Không thêm card/matcher performance hoặc checkbox
  `WHITELIST`; default OFF và CLOSED AvgROE `>4%` hiện hữu không đổi.
- API/page/module additive; top-level giữ snapshot 15m, còn `summary/timeframes[]/
  idealEntry` là field mới. Không sửa JSON/state cũ, không migrate/backfill/replay;
  cache thiếu fail closed và được đếm riêng từng tab.

### 2026-09-24 — POST_DUMP_VOLUME_RECOVERY_MTF_IDEAL_ENTRY_OBSERVE_V3_20260924

- Màn `/post-dump-volume-recovery` được chia thành ba vùng 15m, 1h và 4h. Dữ liệu
  causal vẫn chỉ đọc tối đa 500 nến 15m từ `KlineCache`; server gộp OHLC, base/quote
  volume và taker quote theo biên UTC thành 1h/4h. Bucket đã qua thời gian đóng nhưng
  thiếu bất kỳ nến 15m thành phần nào bị loại; bucket đang chạy chỉ dùng giá/volume
  projected để hiển thị, không được nâng trạng thái xác nhận. Không gọi thêm Binance
  REST, không dùng outcome, fill hay nến tương lai.
- Phân loại theo từng khung: 15m yêu cầu body giảm `>=3,5%` hoặc low/open `>=6%`,
  volume `>=1,8×` median 20 nến và `>=100k USDT`; 1h là `5%/8%`, `1,7×`, median
  20 nến và `>=250k`; 4h là `8%/12%`, `1,6×`, median 10 nến và `>=500k`. Mức hồi
  tối thiểu của 15m/1h là 15%, 4h là 12% biên low→open. `ĐÃ XÁC NHẬN` cần hồi
  35% ở 15m/1h hoặc 30% ở 4h, giá trên close cú xả, xu hướng ba nến không yếu quá
  1,5%, cùng một nến đã đóng vừa tăng giá vừa tăng volume `>=5%` so với nến trước và
  `>=1,1×` nền. Độ mới tối đa lần lượt 12/8/4 nến. `ĐANG HỒI` và `YẾU LẠI` giữ nghĩa
  V1, với yếu lại là rút `>=3%` khỏi đỉnh hậu xả và trend gần nhất âm.
- Score 0–100 vẫn cộng độ sâu, volume xả, phần biên hồi, chất lượng/độ mới nến dòng
  tiền; ngưỡng hiển thị 15m/1h là 45 và 4h là 42. Thống kê có tổng case ba khung,
  số symbol không trùng, cùng `scanned/matched/confirmed/building/weakened` và lý do
  loại riêng từng khung. Một symbol đạt hai khung được tính hai case nhưng chỉ một
  symbol unique. Không tính paper/fill, W/L, WR, PF, AvgROE hoặc PnL.
- Cột `ĐIỂM VÀO ĐẸP` là vùng retest tham khảo, được tính hoàn toàn từ dữ liệu causal
  trước thời điểm hiển thị. Khi đã có nến dòng tiền, vùng lấy từ mức cao hơn giữa
  close nến xả, 50% biên low→open và low nến dòng tiền, tới midpoint thân nến dòng
  tiền; khi chưa có nến dòng tiền, vùng dùng 38,2–50% biên low→open và không thấp hơn
  close nến xả. UI hiện midpoint, biên, khoảng cách so với live và trạng thái
  `ĐANG TRONG VÙNG/CHỜ HỒI/CHỜ RECLAIM`. Case `YẾU LẠI` bắt buộc hiện `KHÔNG VÀO`.
- Đây là **OBSERVE ONLY**, không phải gate/rule giao dịch: không Discord, không gọi
  Binance và không ảnh hưởng entry, margin/size/leverage, SL, TP, order hay position.
  Không thêm label/card performance hoặc matcher nên không tạo checkbox `WHITELIST`;
  policy mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%` hiện hữu không đổi.
- JSON cũ tương thích: top-level `items/stats/config/interval` tiếp tục là snapshot 15m
  như V1; `summary`, `timeframes[]` và `idealEntry` là field additive. Vùng entry chỉ
  tham khảo, không ảnh hưởng Binance/entry thật/size/SL/TP. Không ghi state, migrate,
  backfill hay replay. Cache thiếu fail closed và được đếm theo từng vùng.

### 2026-09-23 — LIMIT_PAPER_FILL_MARKET_V1_TOP3_LONG_SHALLOW_1USDT_20260923

- Các version đi cùng lượt: `LIMIT_PAPER_LAB_V2_SELECTED_SHALLOW_FILL_BINANCE_20260923`,
  `AUTO_ENTRY_CONTROLS_V17_LIMIT_PAPER_FILL_MARKET_20260923`,
  `LIVE_CARD_LIQ_FLOW_LIMIT_PAPER_FILL_V31_20260923` và
  `OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V6_LIMIT_PAPER_FILL_20260923`.
  Dữ liệu causal trước entry gồm tín hiệu EMA99 **nến 15m đã đóng** đã được ghi vào
  Limit Paper Lab, mức `SHALLOW` tính tại lúc tín hiệu, tick giá đến sau đó làm
  candidate chuyển đúng một lần `PENDING → OPEN`, mark mới không lệch paper fill quá
  1%, Market Regime `RISK_ON` được kiểm tra trước và ngay trước submit, cùng position/
  open-order Binance hiện tại. Tín hiệu phát lần đầu chỉ tạo paper LIMIT, tuyệt đối
  không đặt Binance.
- Classifier live chỉ nhận đúng ba nhãn LONG 15m hiện hữu
  `NEAR_EMA_LONG_WATCH`, `NEAR_RECLAIM_LONG_WATCH`, `TOUCH_EMA_LONG_WATCH`, nguồn
  gốc `ema99-observe-only / ema99-retest`, và chỉ candidate `SHALLOW`. Fill phải mới
  tối đa 90 giây và cả record/fill phải sinh sau `enabledAt`; candidate cân bằng,
  sâu, reference, SHORT, khung khác và mọi source khác vẫn paper/observe. Route MARKET
  cũ `TOUCH_EMA_LONG_WATCH LONG 15m` bị tắt để không vào ngay khi phát.
- Khi pass toàn bộ gate, executor dùng source riêng
  `limit-paper-fill / ema99-retest-shallow`, đặt **MARKET 1 USDT ×5**, TP `+10%`
  ROE và SL `−20%` ROE neo theo full fill; cho phép ceil min-notional. Có durable
  dedupe, cooldown theo coin 4 giờ, chặn khi đã có position/open entry và không DCA.
  Không hủy/sửa lệnh hoặc vị thế có sẵn. Nếu đang `RISK_OFF/RECOVERY_TEST/WAIT_DATA`
  thì paper vẫn khớp nhưng Binance ghi trạng thái blocked và không retry/replay.
- Thống kê trên page vẫn tính độc lập cho mọi độ sâu theo fill/closed paper, không
  trộn phí Binance. Candidate có field additive `binanceExecution` để audit lần xét
  live. Không thêm label/card thống kê hay matcher WHITELIST mới: dùng lại ba label
  hiện hữu, policy WHITELIST mặc định OFF và điều kiện CLOSED AvgROE `>4%` giữ nguyên.
  JSON cũ thiếu `binanceExecution` vẫn đọc được; lịch sử trước `enabledAt` không
  migrate/backfill/replay. Symbol Unicode được giữ nguyên, còn bare `USDT` bị loại.

### 2026-09-23 — AUTO_ENTRY_CONTROLS_V16_DISABLE_NEGATIVE_14D_ROUTES_20260923

- Tắt quyền Binance cho sáu exact route đang ON nhưng có Net PnL âm trong cửa sổ
  rolling 14 ngày, thống kê theo một `close_group_id` cho mỗi vòng vị thế và Net PnL
  sau commission/funding: `FOLLOW_REJECTION_LIVE / extreme-short-squeeze / SHORT`,
  `EXTREME_PUMP_CLOSED / extreme-short-squeeze / SHORT`,
  `CLOSED_BELOW_EMA_LONG_WAIT / ema99-retest / LONG / 15m`,
  `CLOSED_ABOVE_EMA_WATCH / ema99-retest / SHORT / 15m`,
  `NEAR_EMA_WATCH / ema99-retest / SHORT / 5m` và
  `RETEST_LONG_READY / closed-mtf-retest / LONG`.
- Dữ liệu trước entry và classifier/tier/nhãn của từng scanner không đổi. Thay đổi chỉ
  là gate exact route `enabled=false`; master vẫn ON. Các route cùng tên khác stream
  hoặc khung có expectancy dương vẫn giữ nguyên, đặc biệt `NEAR_EMA_WATCH SHORT 15m`
  và `RETEST_LONG_READY htf-deep-base-15m LONG`.
- Việc tắt áp dụng cho entry Binance tự động mới: không đổi margin, leverage, size,
  cách tính entry, SL hoặc TP; không hủy/sửa LIMIT, order, protection hay position đã
  tồn tại. Discord/OBSERVE ONLY và lịch sử tín hiệu vẫn chạy theo rule cũ.
- Không thêm label/card/matcher/WHITELIST; policy whitelist mặc định OFF và chỉ hiện
  khi CLOSED AvgROE `>4%` giữ nguyên. JSON cũ vẫn tương thích vì chỉ đổi boolean của
  exact key và nâng chuỗi version; giữ `enabledAt`, không migrate/backfill/replay.

### 2026-09-23 — COIN_LEVEL_OBSERVE_MANUAL_MARKET_V2_USER_LEVERAGE_20260923

- Mỗi row LONG/SHORT sớm có thêm input `ĐÒN BẨY (x)` cạnh `SỐ TIỀN (USDT)`.
  Giá trị mặc định lấy leverage route hiện hữu (fallback 5x); người dùng được nhập
  số nguyên `1–125x`. Trước entry vẫn kiểm tra watch active/fresh, live invalidation,
  Orders auth, master ON, Market Regime cho LONG và duplicate position/order.
- Phân loại tín hiệu, điểm/tier, lịch sử và thống kê signal/closed AvgROE không đổi.
  Không thêm label/card/matcher hay checkbox WHITELIST; policy default OFF và chỉ
  hiện khi CLOSED AvgROE `>4%` giữ nguyên.
- Có ảnh hưởng Binance cho **lệnh MARKET thủ công mới được bấm**: leverage gửi từ
  input được server validate lại, `notional = margin USDT × leverage`, rồi truyền vào
  `placeOrder`; entry MARKET và rule SL/TP/protection hiện hữu không đổi. Không sửa
  position/order đang mở. Client cũ không gửi `leverage` vẫn dùng leverage route như
  V1; API additive, không migrate/rewrite/backfill/replay JSON hay lệnh lịch sử.

### 2026-09-23 — COIN_LEVEL_OBSERVE_MANUAL_USDT_UI_V3_20260923

- Điều khiển thủ công trong từng dòng LONG/SHORT sớm đổi nhãn input từ `MARGIN`
  thành `SỐ TIỀN (USDT)`, giữ mặc định `1` và miền hợp lệ `0,01–100 USDT`; ô rộng
  và tương phản hơn để không bị hiểu là thiếu input. Nút bị khóa nay hiện trực tiếp
  `HẾT HIỆU LỰC`, `BINANCE OFF` hoặc `RISK-OFF` thay cho nút LONG/SHORT mờ khó hiểu.
- Dữ liệu trước entry và phân loại không đổi: watch phải active/fresh, token Orders
  chỉ xác thực người bấm, khóa tổng phải ON; riêng LONG vẫn cần Market Regime
  `RISK_ON`. Đăng nhập không vượt qua gate thị trường. Thống kê signal/AvgROE và
  policy WHITELIST không đổi; không thêm label/card/matcher hoặc checkbox mới.
- Đây là sửa hiển thị, không đổi endpoint, margin thực, leverage, notional, entry,
  SL/TP, duplicate guard hay lệnh Binance. JSON/API cũ hoàn toàn tương thích, không
  migrate/rewrite/backfill/replay; query version của module chỉ giúp trình duyệt nạp
  giao diện mới thay vì giữ cache cũ.

### 2026-09-23 — COIN_LEVEL_OBSERVE_USDT_VOLUME_COLUMN_V1_20260923

- Bảng `LONG sớm · quan sát` và `SHORT sớm · quan sát` thêm `KL 5m (USDT)` cạnh `Volume ×`, lấy đúng `quoteVolume` của nến 5m **đã đóng** dùng để chấm điểm watch; không phải margin lệnh, notional Binance hay thanh khoản LiqScan. Cột mới định dạng rút gọn K/M và sort theo giá trị USDT gốc; `Volume ×` vẫn là tỉ lệ với median 20 nến trước.
- Dữ liệu trước entry vẫn là các nến 5m/15m/1h đóng và fresh hiện hữu; không đổi điều kiện phân loại LONG/SHORT, điểm, tier, gate, số coin hay thống kê AvgROE. Chỉ bổ sung trường hiển thị `quoteVolumeUsdt` vào watch/history mới; không có nhãn/card/matcher/checkbox WHITELIST mới.
- Không ảnh hưởng Binance/entry/margin/size/leverage/SL/TP/Discord. JSON lịch sử cũ thiếu trường vẫn đọc được, cột hiện `—` và sort xếp cuối; không ước tính từ `volumeRatio`, không backfill/migrate/replay lịch sử.

### 2026-09-23 — POSITION_PROTECTION_SOCKET_FILL_V5_POSITION_VISIBILITY_RETRY_20260923

- Dữ liệu trước entry, nhãn/tier/gate tín hiệu và size không đổi. Sau `ORDER_TRADE_UPDATE` full fill hoặc `TRADE_LITE` đã REST-xác minh `FILLED`, position monitor đồng bộ lại REST theo các nhịp 0/200/500/1000/2000 ms cho tới khi thấy vị thế cùng hướng **trong một REST snapshot mới sau fill**; cache chỉ từ `ACCOUNT_UPDATE` chưa đủ vì không mang leverage thực. Nếu vẫn chưa thấy hoặc callback TP/SL lỗi, giữ fill chưa được watermark/dedupe và retry nền tăng dần 0,5–10 giây, tối đa 90 giây từ lần lỗi đầu. Không coi fill đã bảo vệ chỉ vì một lần REST chưa có position; không phát lệnh từ partial fill hoặc close/reduce-only.
- Khi Binance chưa có SL/TP mà plan yêu cầu, xóa `appliedAt` để lần retry đặt lại leg còn thiếu và hạ cờ `slPlaced` nếu SL thật vắng mặt. LONG fallback không có plan nhưng AUTO_SL bật cũng phải thấy SL thật mới xác nhận full fill. Vẫn kiểm tra lệnh đang mở trước khi đặt để tránh trùng; các route TP-only/chặn protection giữ nguyên. Hết 90 giây ghi lỗi cần vận hành kiểm tra, không MARKET-close hoặc tự hủy lệnh.
- Thống kê signal/AvgROE/WHITELIST không đổi; log `SOCKET_FULL_FILL_RETRY` và `...EXHAUSTED` là audit mới. Có ảnh hưởng Binance sau fill vì giảm khoảng trống thiếu SL/TP; không đổi entry, size, giá target SL/TP hay lệnh đang mở. JSON watermark/tracking cũ đọc nguyên trạng, không migrate/replay lịch sử; chỉ fill mới sau khi process nạp code được retry.

### 2026-09-23 — MANUAL_5X_10X_BREAK_EVEN_SL_V2_20260923

- Không dùng thêm dữ liệu trước entry và không đổi phân loại signal. Sau entry, matcher manual hiện tại + leverage thực từ Binance + entry, mark và ROE live: 5x chỉ dời SL tối thiểu về entry khi ROE `>6%`; 10x chỉ bắt đầu dời khi ROE `>12%` (đúng 12% chưa đạt). Với manual 10x trong khoảng `>12%` đến `<15%`, target mới là entry `0% ROE`, thay vì generic lock `+1%` từ ROE 10%; từ ROE `>=15%` các nấc profit-lock mạnh hơn tiếp tục. Không nới SL đã tốt hơn, giữ TP; các leverage khác và bot không nhận floor mới.
- Thống kê tín hiệu/tier/closed AvgROE và WHITELIST không đổi; audit qua log `SlTrail` và `profitLock*`. Có tác động SL Binance thật của vị thế manual đang mở khi đạt ngưỡng; không đổi entry, margin/size, leverage, TP hoặc Discord. JSON cũ tương thích không thêm field bắt buộc/migrate/backfill. SL tại entry không bảo đảm hòa vốn ròng sau phí, funding/trượt giá.

### 2026-09-23 — MANUAL_5X_BREAK_EVEN_SL_V1_20260923

- Đây là protection **sau khi đã có vị thế Binance**, không dùng thêm dữ liệu trước
  entry và không đổi bộ lọc/điểm tín hiệu. Đầu vào live là nguồn vị thế thủ công
  (Orders/Coin Level hoặc Binance app theo matcher manual hiện tại), đòn bẩy thực
  tế trong position = `5x`, entry thực, mark, ROE do position monitor tính từ PnL
  chưa chốt/margin (fallback ROE từ biến động mark × leverage), vị thế đang mở và
  SL đang mở. Chỉ khi ROE **>6%** (6,00% chưa đạt), target SL tối thiểu là entry
  thực; áp cho LONG và SHORT. Đây là giá stop, không đảm bảo PnL ròng bằng 0 sau
  phí, funding hoặc trượt giá.
- Target break-even 0% ROE được gộp bằng `max` với profit-lock cũ: mức SL tốt hơn
  không bị kéo lùi; từ ngưỡng cũ ≥10% và các nấc cao hơn vẫn có thể khóa thêm
  lợi nhuận. Nếu candle fast-wave chưa sẵn, riêng floor manual 5x vẫn chạy. Mark
  đã vượt ngược qua stop thì không đặt STOP gây immediate-trigger; retry theo
  cooldown hiện tại. Tìm SL theo symbol, hướng đóng và `positionSide`; thay SL
  trên Binance bằng STOP_MARKET close-position MARK_PRICE, giữ TP. Nếu replace
  lỗi thì xác minh và thử khôi phục SL cũ như profit-lock V20.
- Phân loại chỉ dựa trên matcher `isManualBinanceManagedPosition` đang chạy; không
  mở rộng sang bot tự động/liquid-v2 tự động hay vị thế không phải 5x. Thống kê
  không đổi: không có signal/tier/card hoặc win-rate mới; audit dùng log
  `SlTrail` và các field `profitLock*`/giá SL hiện hữu theo lifecycle. Có ảnh
  hưởng Binance và SL thật; không đổi entry, size/margin/leverage, TP, Discord
  hoặc WHITELIST. JSON cũ vẫn đọc được vì không có field bắt buộc/migration;
  vị thế manual 5x đang mở cũng được xét ở tick ROE tiếp theo nếu còn đủ điều kiện.

### 2026-09-23 — COIN_LEVEL_OBSERVE_SORT_UI_V1_20260923

- Hai bảng `LONG sớm · quan sát` và `SHORT sớm · quan sát` cho bấm từng tiêu đề
  cột để sắp xếp tăng/giảm; mũi tên và `aria-sort` thể hiện chiều hiện tại.
  Lần bấm đầu xếp số/thời gian giảm dần, tên/mẫu/khoảng cách tăng dần; mặc định
  giữ thứ tự server. Lựa chọn riêng của mỗi bảng được giữ qua refresh 30 giây và
  khi bật/tắt lịch sử hôm nay. Click chỉ chuyển chỗ row DOM, không xóa input Margin
  đang gõ; refresh API tiếp theo render theo cùng thứ tự.
- Dữ liệu trước entry không đổi: cùng watch từ nến 5m/15m/1h đã đóng, giá live,
  điểm, volume/taker, vùng và `observedAt` sẵn có. Sắp xếp chỉ ở browser, không
  đổi điều kiện phân loại LONG/SHORT, tier, điểm hay gate. Thống kê số coin và lý do
  loại vẫn tính trên dữ liệu gốc, không theo thứ tự hiển thị.
- Không ảnh hưởng Binance, entry, margin/size/leverage, SL/TP, Discord, WHITELIST
  hay route; không thêm nhãn/card/matcher runtime. JSON/API cũ giữ nguyên, không
  migrate/rewrite/backfill/replay; trường thiếu xếp cuối cột.

### 2026-09-22 — COIN_LEVEL_OBSERVE_RECENT_BIDIRECTIONAL_UI_V1_20260922

- Hai bảng observe tô nền gradient xanh LONG -> vàng -> đỏ SHORT cho coin có ít nhất
  một event LONG và một event SHORT trong 30 phút gần nhất, đồng thời hai event mới
  nhất cách nhau không quá 30 phút. Dữ liệu chỉ lấy `observedAt` của history/live watch
  5m/15m/1h đã có tại snapshot hiện tại; row có tooltip giờ LONG và SHORT, health line
  hiện số coin hai chiều. Record quá cửa sổ tự hết màu.
- Đây là đánh dấu UI về thay đổi hướng nhanh, không phải signal label/tier/gate, không
  xác nhận thắng/thua và không thay classifier/score/thống kê hiệu suất. Không ảnh
  hưởng Binance, entry, margin/size/leverage, LIMIT/MARKET, SL/TP hoặc protection flip
  V1; input submit trên row giữ nguyên.
- Không thêm card/checkbox WHITELIST vì không có matcher runtime mới; seed OFF và
  closed `AvgROE >4%` không đổi. JSON/API giữ nguyên vì browser suy ra từ history đã
  có; không migrate/rewrite/backfill/replay dữ liệu cũ.

### 2026-09-22 — COIN_LEVEL_OBSERVE_MANUAL_MARKET_UI_V2_COIN_INLINE_20260922

- Cụm input `Margin` và nút submit MARKET thủ công được chuyển từ cột cuối vào ngay
  sau link tên coin trong ô đầu của mỗi row LONG/SHORT sớm. Header gộp thành
  `Coin · lệnh Binance`, bỏ cột action riêng để giảm chiều ngang; status quyền/gate và
  kết quả submit vẫn nằm dưới đúng cụm điều khiển của coin đó.
- Dữ liệu kiểm tra trước entry, phân loại watch active/history, margin 0,01–100,
  leverage, confirm, Orders session, khóa tổng, Market Regime LONG, duplicate
  position/order và endpoint V1 giữ nguyên. Đây chỉ là thay đổi bố cục, không đổi
  Binance/entry/size/leverage/SL/TP, không đổi thống kê/audit/Discord/detector.
- Không có label/tier/card/WHITELIST mới. JSON/API cũ hoàn toàn tương thích; không
  migrate/rewrite/backfill/replay và browser chỉ render control vào cell đầu.

### 2026-09-22 — COIN_LEVEL_OBSERVE_DIRECTION_FLIP_PROTECTION_V1_20260922

- Bộ bảo vệ theo dõi **chuyển hướng live giữa hai bảng observe** trên cùng symbol:
  `LONG sớm -> SHORT sớm` hoặc `SHORT sớm -> LONG sớm`. Dữ liệu causal dùng trước
  hành động gồm watch 5m/15m/1h đang active của hai snapshot liên tiếp, hướng trước
  được giữ tối đa 30 phút qua khoảng trống ngắn, Position Risk Binance, open order và
  `unRealizedProfit` hiện tại. Snapshot đầu chỉ seed state; hai hướng đồng thời là mơ
  hồ và không kích hoạt. Không dùng outcome/nến tương lai để phân loại flip.
- Khi flip đã xác nhận, bot hủy entry order thường còn chờ theo **hướng cũ** nhưng
  không đụng reduce-only/close-position/STOP/TAKE_PROFIT. Nếu vị thế thật cùng hướng
  cũ có PnL USDT `> 0`, bot đóng toàn bộ vị thế bằng reduce-only MARKET; nếu PnL
  `<= 0` (gồm đúng 0 để fail-safe), bot hủy TP cũ xa entry và đặt LIMIT reduce-only
  tại giá entry. SL hiện hữu được giữ nguyên. Rule chạy hai chiều, retry khi lỗi đọc
  account/API, không mở vị thế theo hướng mới và không DCA.
- Đây là protection lifecycle, không phụ thuộc khóa entry tổng và có ảnh hưởng trực
  tiếp đến position/order/TP: size entry, margin, leverage và SL không đổi; nhánh lãi
  đóng toàn bộ size hiện tại, nhánh không lãi chỉ thay TP về hòa vốn. Close tiếp tục
  đi qua fill/close audit và cleanup TP/SL hiện hữu; không tạo label/tier/card signal,
  không cộng một tín hiệu mới vào thống kê detector hoặc Entry Score.
- Không thêm checkbox WHITELIST vì đây không phải route entry/label mới; matcher,
  mặc định OFF và policy closed `AvgROE >4%` của các route giữ nguyên. API/JSON watch,
  history, fill audit và Orders không đổi schema; state runtime chỉ nằm trong bộ nhớ,
  không migrate/rewrite/backfill/replay dữ liệu cũ.

### 2026-09-22 — COIN_LEVEL_OBSERVE_MANUAL_MARKET_V1_20260922

- Mỗi row `LONG sớm · quan sát` và `SHORT sớm · quan sát` có input margin USDT
  `0,01–100` và nút xác nhận gửi lệnh thật Binance `MARKET`. Dữ liệu được kiểm tra
  ngay trước entry gồm session Orders hợp lệ, snapshot Coin Level <=60 giây, đúng
  `symbol + side + observedAt` còn nằm trong live watch 5m/15m/1h, overlay giá live
  chưa `INVALIDATED`, khóa tổng ON, không có position/entry order cùng coin; LONG còn
  phải có Market Regime `RISK_ON`. Dòng lịch sử hoặc hết hiệu lực chỉ hiển thị nút khóa.
- Phân loại lệnh vẫn dùng source/label manual hiện hữu `orders-manual/ORDERS_MANUAL`,
  không biến subtype observe thành route tự động. Margin do người dùng nhập; leverage
  lấy từ cấu hình Coin Level cùng hướng, fallback 5x; notional = margin x leverage.
  LONG dùng invalidation của watch làm SL cấu trúc và manual TP hiện hữu +30% ROE;
  SHORT tiếp tục policy manual hiện hữu TP EMA99 tối đa +30% ROE và SL -30% ROE sau
  full-fill. Coin nằm trong danh sách bỏ qua protection vẫn giữ policy bỏ qua hiện tại.
- Thống kê fill/audit ghi như lệnh tay, không cộng vào route Coin Level tự động và
  không dùng outcome tương lai để cho phép entry. Đây là hành động click thủ công có
  hộp xác nhận, detector/Discord không tự submit. Không thêm signal label/card hay
  checkbox WHITELIST; matcher manual, seed OFF và policy closed `AvgROE >4%` giữ
  nguyên. GET snapshot/JSON lịch sử không đổi; chỉ thêm POST/response mới, không
  migrate/rewrite/backfill/replay dữ liệu cũ.

### 2026-09-22 — COIN_LEVEL_EARLY_SHORT_PATTERN_COLORS_UI_V1_20260922

- Bảng `SHORT sớm · quan sát` giữ nguyên mẫu causal chính `XẢ SAU BƠM`/`BREAKDOWN`
  và thêm một cột mẫu chi tiết có màu, suy ra trong browser từ đúng record V2 hiện có.
  Theo thứ tự ưu tiên, mỗi row chỉ nhận một loại: `SÁT MỐC PHÁ ĐÁY` khi setup breakdown
  cách đáy kích hoạt không quá 0,35% theo hai phía; `DÒNG TIỀN BÁN MẠNH` khi volume
  >=2x hoặc taker bán >=60%; `ĐỒNG THUẬN MTF GIẢM` khi 15m và 1h cùng `DOWN`;
  `ĐỈNH THẤP DẦN` khi lower-high 5m có mặt; còn lại là `ÁP LỰC GIẢM`.
- Dữ liệu trước entry, classifier/score/ngưỡng 65, lịch sử, Discord và cách thống kê
  không đổi; đây là bucket hiển thị, không phải xác suất, tier, gate hay nhãn runtime.
  Không ảnh hưởng Binance/entry/size/leverage/SL/TP/LIMIT/MARKET/order/position.
  Không tạo card/checkbox WHITELIST: exact matcher, mặc định OFF và policy chỉ hiện khi
  closed `AvgROE >4%` giữ nguyên. JSON/API cũ tương thích vì không thêm hoặc đổi field;
  browser dùng fallback điểm rejection cho history quá cũ thiếu `softMisses`.

### 2026-09-22 — COIN_LEVEL_EARLY_LONG_PATTERN_COLORS_UI_V1_20260922

- Bảng `LONG sớm · quan sát` thêm cột UI `Mẫu` và legend màu. Browser phân một record
  đã đạt V3 vào đúng một bucket hiển thị theo ưu tiên: vàng `SÁT MỐC PHÁ` khi còn cách
  mốc ≤0,35% hoặc vừa vượt nhẹ; cyan `DÒNG TIỀN MẠNH` khi volume ≥2× hoặc taker mua
  ≥60%; tím `ĐỒNG THUẬN MTF` khi 15m và 1h cùng UP; xanh lá `ĐÁY NÂNG` khi component
  higher-lows đủ 10/10; xanh dương `ÁP LỰC TĂNG` cho record đạt điểm còn lại. Badge và
  viền trái cùng màu; title giải thích tiêu chí khi rê chuột.
- Đây là bucket **trình bày được suy ra phía browser từ field hiện hữu**, không phải
  signal label/subtype mới và không được lưu vào event. Dữ liệu causal, classifier V3,
  score 65, diagnostics, lịch sử, Discord và Market Regime không đổi.
- Không ảnh hưởng Binance/entry/size/leverage/SL/TP/LIMIT/MARKET/order/position hoặc
  thống kê. Không tạo card/exact label runtime nên không thêm checkbox WHITELIST;
  matcher, seed OFF và closed `AvgROE >4%` giữ nguyên. JSON/API cũ tương thích; thiếu
  field pattern sẽ rơi về `ÁP LỰC TĂNG`, không migrate/rewrite/backfill.

### 2026-09-22 — COIN_LEVEL_OBSERVE_ACTIVE_ONLY_UI_V1_20260922

- Hai bảng `LONG sớm · quan sát` và `SHORT sớm · quan sát` mặc định chỉ render record
  history có `liveNow !== false`, tức ID nến đóng vẫn còn đạt và chưa bị giá live xuyên
  mức vô hiệu. Record đã rời điều kiện hoặc `INVALIDATED` không còn chen vào danh sách
  chính. Mỗi bảng có checkbox `Hiện lịch sử hôm nay`; bật checkbox mới render toàn bộ
  history bền vững của ngày Việt Nam cùng nhãn lịch sử/vô hiệu hiện hữu.
- Dữ liệu trước entry, classifier V3 LONG/V2 SHORT, score/ngưỡng 65, Market Regime,
  diagnostics và cách lưu/dedupe lịch sử không đổi. Đây chỉ là bộ lọc trình bày phía
  browser, không xóa state/JSON và không thay Discord.
- Không ảnh hưởng Binance, route, entry/size/leverage/SL/TP, LIMIT/MARKET, order,
  position hay thống kê fill/PnL. Không thêm signal label/card thống kê nên không thêm
  checkbox WHITELIST; matcher, seed OFF và closed `AvgROE >4%` giữ nguyên. JSON/API
  hoàn toàn tương thích; UI mới fallback về mảng live khi server cũ thiếu history.

### 2026-09-22 — COIN_LEVEL_MARKET_REGIME_GUARD_V1_20260922

- Coin Level có panel Market Regime ở đầu `/coin-level-analysis`, dùng lại đúng lượt
  MarketBreadthShock socket 5m top tối đa 400 USDT coin. Dữ liệu causal trước entry là
  breadth tăng/giảm hiện tại, context 15m/30m, taker-buy quote-weighted, coverage và
  raw `PUMP/DUMP_WATCH/DANGER`; snapshot phải fresh tối đa 60 giây, socket fresh,
  processed ≥60 và coverage ≥20%. Scheduler breadth nay luôn chạy cho gate kể cả khi
  webhook Discord chưa cấu hình; phần Discord vẫn chỉ gửi khi có webhook.
- Phân loại ba trạng thái chính: `RISK_OFF` khi có `DUMP_WATCH/DANGER`, hoặc context
  15m và 30m cùng `DOWN`, hoặc taker-buy <48%; `RECOVERY_TEST` khi không còn hard-risk
  nhưng chưa đủ xác nhận; `RISK_ON` chỉ khi 15m/30m cùng `UP`, số coin tăng ≥1,5 lần
  số coin giảm, taker-buy ≥52%, bộ điều kiện tốt giữ liên tục ≥15 phút và không xuất
  hiện DUMP_WATCH/DANGER trong 30 phút. Khi khởi động lại, quiet window bắt đầu lại an
  toàn; dữ liệu thiếu/cũ là `WAIT_DATA`, fail-closed LONG. Panel hiện state, 15m/30m,
  tăng/giảm, ratio, taker-buy, thời gian ổn định/yên DUMP và nguyên nhân.
- Đây là **gate Binance thật chỉ cho Coin Level LONG mới**. Executor
  `COIN_LEVEL_ENTRY_WATCH_LIMIT_3USDT_V4_MARKET_REGIME_20260922` kiểm tra state trước
  khi gọi context signed và kiểm tra lại ngay trước submit; chỉ `RISK_ON` mới được xét
  tiếp LIMIT pre-retest hoặc MARKET post-retest. `RISK_OFF`, `RECOVERY_TEST` và
  `WAIT_DATA` trả `market-regime-blocked`; tín hiệu/bảng/Discord vẫn hiện để quan sát.
  SHORT Coin Level không đổi. Gate không hủy LIMIT đang mở, không đóng/sửa position,
  không sửa size/margin/leverage/entry/TP/SL/cooldown hoặc các route khác.
- Cách thống kê signal/Entry Score/tier/T1–T3/fill/PnL giữ nguyên; regime không phải
  xác suất thắng và không backfill hiệu suất. Đây là panel trạng thái/gate của exact
  route Coin Level hiện hữu, không tạo signal label/card thống kê mới nên không thêm
  checkbox WHITELIST; key `RETEST_LONG_READY/RETEST_SHORT_READY`, seed OFF và policy
  closed `AvgROE >4%` giữ nguyên.
- JSON API thêm object `marketRegime`; attempt LONG mới có thêm version/state/time để
  audit và `signalReason` ghi `marketRegime=RISK_ON`. Field đều additive; attempt,
  control, candidate và history cũ không migrate/rewrite/backfill/replay. Consumer cũ
  bỏ qua object mới; runner không được inject guard vẫn giữ tương thích test/consumer,
  nhưng runtime server chính luôn inject guard fail-closed.

### 2026-09-22 — COIN_LEVEL_OBSERVE_LIVE_STATUS_V1_20260922

- Bảng `LONG sớm · quan sát` và `SHORT sớm · quan sát` vẫn phân loại tín hiệu chỉ từ
  nến Binance **5m/15m/1h đã đóng, liên tục và fresh** theo đúng V3 LONG/V2 SHORT.
  Sau khi event đã được ghi lịch sử, API nối thêm giá đang chạy ưu tiên mark socket 1s,
  rồi agg-trade socket, cuối cùng close nến 5m đang chạy từ kline socket nếu tick còn
  mới tối đa 15 giây. Giá live không được đưa ngược vào score hoặc tạo tín hiệu mới.
- Mỗi history row có thêm trạng thái trình bày: `ACTIVE` khi ID nến đóng còn nằm trong
  lượt quét và chưa xuyên mức vô hiệu; `INVALIDATED` ngay khi LONG có giá live
  `<= invalidationPrice` hoặc SHORT có giá live `>= invalidationPrice`; `HISTORY` khi
  không còn trong lượt quét nến đóng. UI hiện cả close lúc phát, giá live, % thay đổi,
  đổi nhãn thành `Nến đóng còn đạt` hoặc `GIÁ LIVE ĐÃ VÔ HIỆU` và làm mờ hàng đã vô
  hiệu. Thiếu giá socket giữ trạng thái nến đóng cũ và ghi rõ đang chờ socket.
- Thống kê detector, score 0–100, ngưỡng 65, counter lý do loại và lịch sử theo ngày VN
  không đổi. Đây chỉ là overlay freshness/trạng thái của watch **OBSERVE ONLY**, không
  sửa Discord đã gửi, không tạo xác suất, W/L, WR, PF, AvgROE hoặc PnL.
- Không ảnh hưởng Binance/entry/size/margin/leverage/SL/TP, LIMIT/MARKET, order,
  position hay candidate xác nhận. Không thêm signal label/card thống kê nên không có
  checkbox WHITELIST mới; matcher route, seed OFF và policy closed `AvgROE >4%` giữ
  nguyên. JSON tương thích additive qua `liveStatusVersion`, `closedCandleActive`,
  `liveState`, `liveInvalidated`, `livePrice`, `livePriceAt`, `livePriceSource` và
  `liveMovePct`; consumer cũ vẫn đọc `liveNow`, state/history cũ không migrate,
  rewrite, backfill hoặc replay.

### 2026-09-22 — COIN_LEVEL_EARLY_SHORT_WATCH_V2_SCORE_3TF_20260922

- V2 thay V1 cho bảng `SHORT sớm · quan sát`. Dữ liệu bắt buộc trước entry chỉ là cache Binance **5m/15m/1h đã đóng, liên tục và fresh**; detector chạy trước nhánh cần 4h nên cache 4h chưa sẵn không còn giấu SHORT sớm. Có hai mẫu causal: `POST_PUMP_FADE` cho coin đã tăng ít nhất khoảng 5–8% rồi mất lực gần đỉnh, và `BREAKDOWN_PRESSURE` cho 15m/1h nghiêng giảm khi close 5m áp sát đáy 12 nến 15m trước, không bắt buộc đã bơm 8%. Candidate SHORT xác nhận bên dưới vẫn cần 5m/15m/1h/4h, Trend Score `<=-12`, 15m/1h `DOWN` và nến 15m đóng phá đáy 12 nến.
- Phân loại dùng `earlyScore` 0–100, ngưỡng **>=65**: bối cảnh xả/bearish 25 điểm, khoảng cách vùng kích hoạt 20, EMA/momentum 5m 20, lower-high/râu trên/phá hỗ trợ 10, quote-volume/volume-ratio/taker bán 20 và chống đuổi ATR 5. Điều kiện phụ thiếu chỉ mất điểm; hard reject khi dữ liệu/giá lỗi hoặc stale, không có một trong hai bối cảnh, quá xa vùng, EMA/momentum <8, rejection <4, flow <10 hoặc taker bán đã biết <45%, nến quá giãn (>2,6 ATR hoặc cách dưới EMA13 >2 ATR), hay tổng <65. Thiếu taker vẫn có thể qua nếu volume/ratio đủ điểm; taker đã biết nghiêng mua mạnh thì không.
- API thêm `earlyShortDiagnostics` với coverage 3 khung và các lý do loại non-exclusive. Watch V2 được lưu bền vững theo ngày Việt Nam tại `data/coin-level-early-short-history.json`, dedupe `symbol + observedAt`, tối đa 500 event/ngày; API thêm `earlyShortHistory/totalEarlyShortHistory`, UI phân biệt `Đang đạt` và `Lịch sử hôm nay`, hiện mẫu, điểm và counter loại. Đây là diagnostics/lịch sử cảnh báo, không phải WR/PnL/AvgROE hoặc xác suất thắng.
- Đây vẫn là **observe-only**: `watchOnly=true`, `binanceEligible=false`, chỉ có thể đi Discord observe riêng; không đổi Binance/entry/size/leverage/SL/TP, LIMIT/MARKET, candidate/fill/thống kê hiệu suất. Hai reason `EARLY_SHORT_SCORE_POST_PUMP_FADE` và `EARLY_SHORT_SCORE_BREAKDOWN_PRESSURE` chỉ là subtype cảnh báo, không phải exact route/card giao dịch; không thêm checkbox WHITELIST, matcher `RETEST_LONG_READY/RETEST_SHORT_READY`, seed OFF và policy closed `AvgROE >4%` giữ nguyên. JSON mới additive; consumer cũ bỏ qua, UI mới fallback live khi thiếu history/diagnostics, state V1 không migrate/replay và history chỉ nhận đúng policy V2.

### 2026-09-22 — COIN_LEVEL_EARLY_LONG_WATCH_V3_SCORE_3TF_20260922

- V3 thay V1 cho bảng `LONG sớm · quan sát` (V2 chỉ là snapshot thử nghiệm trong cùng lượt triển khai và không còn được nạp vào history). Dữ liệu bắt buộc trước entry chỉ còn cache Binance **5m/15m/1h đã đóng, liên tục và fresh**; scanner LONG sớm không chờ 4h, không gọi REST bổ sung và tự tính trạng thái 15m/1h bằng đúng cấu trúc close so EMA13/25/99, EMA13 so EMA25 và close so close trước. Scanner candidate LONG/SHORT xác nhận bên dưới vẫn giữ yêu cầu 5m/15m/1h/4h và analyzer cũ; `covered` cũ vẫn là coverage 4 khung, còn `earlyLongDiagnostics.covered3tf` là coverage riêng cho LONG sớm.
- Phân loại chuyển từ toàn bộ hard gate sang điểm `earlyScore` 0–100, ngưỡng **≥65**: trend 15m/1h 25 điểm, khoảng cách mốc phá 20, EMA/momentum nến 5m 20, ba đáy gần 10, quote-volume/volume-ratio/taker mua 20 và chống đuổi ATR 5. Vùng ưu tiên vẫn −0,8% tới +0,35% quanh đỉnh 12 nến 15m; vùng ngoài có điểm giảm từ −1,25% tới +0,6%. Điều kiện phụ thiếu chỉ mất điểm; ví dụ thiếu một trường taker hoặc volume chưa đạt 1,3x không còn tự loại nếu tổng và các nhóm tối thiểu vẫn đạt. Hard reject chỉ còn dữ liệu/giá không hợp lệ, nến 5m không fresh, 15m hoặc 1h `DOWN`, trend alignment <17/25, quá xa mốc, EMA/momentum <8, flow <10/20 hoặc taker mua đã biết <45%, quá giãn (>2,6 ATR range hoặc >2 ATR khỏi EMA13), hay tổng <65. Missing taker vẫn có thể qua bằng quote-volume/ratio; taker đã biết nghiêng bán mạnh thì không.
- API thêm `earlyLongDiagnostics` với số evaluated, coverage 3 khung, số detected/ẩn bởi confirmed LONG và `excludedByReason`; một coin có thể góp vào nhiều lý do nên counter được đánh dấu non-exclusive. Đây là chẩn đoán lượt quét, không phải WR/AvgROE hay kết quả giao dịch. UI hiển thị toàn bộ lý do loại trên dòng trạng thái và cột điểm LONG sớm.
- Watch đạt được lưu bền vững theo ngày Việt Nam tại `data/coin-level-early-long-history.json`, dedupe `symbol + observedAt`, tối đa 500 event/ngày. API thêm `earlyLongHistory/totalEarlyLongHistory`; UI dùng lịch sử hôm nay nên event không biến mất khi điều kiện nến kế tiếp đổi hoặc khi browser refresh, đồng thời đánh dấu `Đang đạt`/`Lịch sử hôm nay`. Sang ngày VN mới tự reset danh sách hiển thị; history chỉ giữ event có đúng policy-version V3 để snapshot thử nghiệm/ngưỡng cũ không lẫn vào danh sách hiện hành. JSON cũ thiếu history/diagnostics vẫn fallback về live watches và ngưỡng 65, state lỗi/thiếu khởi tạo rỗng, không migrate candidate/attempt/order cũ.
- Đây vẫn là **observe-only** và dùng label hiện hữu, chỉ có thể đi Discord observe riêng. Không đổi Binance/entry/size/leverage/SL/TP, LIMIT/MARKET, route candidate, fill hoặc thống kê hiệu suất; `watchOnly=true`, `binanceEligible=false` và executor chỉ nhận `snapshot.candidates`. Không thêm exact signal label/card thống kê hay checkbox WHITELIST; matcher `RETEST_LONG_READY/RETEST_SHORT_READY`, seed OFF và policy closed `AvgROE >4%` giữ nguyên. Version `COIN_LEVEL_EARLY_LONG_WATCH_V3_SCORE_3TF_20260922`, history `COIN_LEVEL_EARLY_LONG_HISTORY_V2_POLICY_20260922`.

### 2026-09-22 — COIN_LEVEL_OBSERVE_WATCH_DISCORD_V1_20260922

- Hai mảng observe-only hiện hữu `earlyLongWatches` và `earlyShortWatches` được gửi vào webhook riêng bằng `COIN_LEVEL_OBSERVE_WATCH_DISCORD_WEBHOOK_URL`. Chỉ dùng nến Binance đã đóng/fresh từ cache scanner; LONG sớm là áp lực mua 5m sát mốc phá 15m theo `COIN_LEVEL_EARLY_LONG_WATCH_V3_SCORE_3TF_20260922`, SHORT sớm là điểm xả sau bơm hoặc áp lực breakdown theo `COIN_LEVEL_EARLY_SHORT_WATCH_V2_SCORE_3TF_20260922`. Tin LONG dùng màu xanh, SHORT màu đỏ, có điểm sớm, subtype/cấu trúc, volume/taker, vùng chờ, vô hiệu và điều kiện nến tiếp theo.
- Router chỉ chấp nhận record có `watchOnly=true` và `binanceEligible=false`; dedupe theo `symbol + side + reason + observedAt` của nến đóng. Chỉ watch mới sau lúc tiến trình khởi động và còn không quá 12 phút mới được gửi, nên JSON/state cũ hoặc tín hiệu trước restart không replay; lỗi `429` có backoff. API chỉ thêm boolean `observeDiscordConfigured`, consumer cũ bỏ qua; state Discord mới lưu độc lập tại `data/coin-level-observe-watch-discord.json`, không migrate/rewrite candidate, attempt hoặc state Discord điểm-vào cũ.
- Đây là **Discord observe-only**, không đổi classifier, score/tier, cách thống kê, candidate xác nhận, entry/size/leverage/SL/TP, LIMIT/MARKET, position hay order Binance. Executor vẫn chỉ lặp `snapshot.candidates`, không nhận hai mảng watch. Không thêm exact signal label/card thống kê hoặc checkbox WHITELIST; matcher runtime `RETEST_LONG_READY/RETEST_SHORT_READY`, seed OFF và policy chỉ hiện khi closed `AvgROE >4%` giữ nguyên. Version `COIN_LEVEL_OBSERVE_WATCH_DISCORD_V1_20260922`.

### 2026-09-22 — LIQUID_FLOW_V2_STARTUP_PRIORITY_V1_20260922

- Runtime ưu tiên nạp `liquid-flow-v2-paper.json` và hoàn tất Liquid Flow V2 trước CoinGlass scheduler/legacy paper. Các store paper cũ được trì hoãn mặc định 90 giây rồi parse tuần tự, cách nhau 1,5 giây; endpoint Short Wave cũng đọc `liquid → pump → edge` tuần tự. Reconciliation quét toàn file nguồn của Recommended chuyển thành maintenance opt-in `RECOMMENDED_SOURCE_FILE_SYNC_ENABLED=true`; đường live chuẩn vẫn là durable source-open event. PM2 dùng heap 12 GiB và chỉ restart theo memory ở 14 GiB trên máy 31 GiB để tránh crash-loop do nhiều `JSON.parse` lớn chồng nhau. Pump WAL archive hỗ trợ filesystem khác nhau bằng `rename`, fallback `copy → unlink` (`CROSS_DEVICE_FILE_MOVE_V1_20260922`); nguồn chỉ xóa sau khi copy thành công.
- Dữ liệu trước entry, điều kiện phân loại signal/tier/gate và cách thống kê trong từng store không đổi; chỉ thời điểm nạp snapshot lịch sử thay đổi. Không thay đổi Binance/entry/size/leverage/SL/TP, không hủy/sửa order hay position và không biến paper/observe-only thành route thật. Không thêm label/card/checkbox WHITELIST; matcher, seed OFF và policy closed `AvgROE >4%` giữ nguyên. JSON hiện hữu được đọc nguyên trạng, không migrate/rewrite/compact trong thay đổi này; store cũ tương thích và dữ liệu lịch sử chỉ nạp muộn hơn. Version `LIQUID_FLOW_V2_STARTUP_PRIORITY_V1_20260922`.

### 2026-09-21 — COIN_LEVEL_ENTRY_WATCH_DISCORD_V7_CANDLE_STATUS_20260921

- Discord Coin Level thêm mục `TRẠNG THÁI NẾN` vào cả embed vàng `ENTRY DỰ KIẾN` và embed chi tiết. Dữ liệu dùng trước entry không đổi: candidate từ nến Binance 5m/15m/1h/4h đã đóng; `retestAt` có giá trị thì hiển thị “15m đã xác nhận · retest 5m đã đạt · đủ trạng thái nến để xét MARKET theo route”, còn thiếu `retestAt` thì hiển thị “15m đã xác nhận · chưa có retest 5m · có thể xét LIMIT tại entry dự kiến”. Nội dung chỉ mô tả trạng thái nến hiện có, không xác nhận Binance đã đặt hoặc khớp lệnh.
- Không đổi điều kiện phân loại LONG/SHORT, Entry Score/tier/target, cách thống kê, route matcher, Binance/entry/size/leverage/SL/TP hoặc lệnh đang chờ. Không thêm signal label/card hay checkbox WHITELIST; policy seed OFF và chỉ hiện khi closed `AvgROE >4%` giữ nguyên. Version `COIN_LEVEL_ENTRY_WATCH_DISCORD_V7_CANDLE_STATUS_20260921`; schema candidate/state JSON cũ không đổi, thiếu `retestAt` tự dùng trạng thái chờ retest, và tin đã gửi/dedupe không được phát lại.

### 2026-09-21 — COIN_LEVEL_EARLY_LONG_WATCH_V1_20260921 (lịch sử; V3 đã thay thế)

- Thêm mảng API `earlyLongWatches` và bảng “LONG sớm · quan sát” trên `/coin-level-analysis`, tách khỏi `candidates` xác nhận. Dữ liệu trước entry chỉ dùng cache Binance 5m/15m/1h/4h đã đóng, liên tục/fresh như scanner hiện tại; không REST bổ sung, không nến đang chạy, CoinGlass hay dữ liệu tương lai. Một watch cần nến 5m đóng mới ≤6 phút: 15m `UP`, 1h `UP/MIXED`; giá nằm từ 0,8% dưới đến 0,35% trên đỉnh 12 nến 15m đã đóng; close5m xanh tăng trên close trước, EMA13/EMA25 và EMA13 đang dốc lên; ba đáy gần nâng/không hạ quá 0,1%; quote volume ≥50k USDT và ≥1,3× median20, taker mua ≥55%. Chặn đuổi nếu range5m >1,8× ATR14 hoặc khoảng cách close–EMA13 >1,25× ATR14.
- Vùng tham khảo sau phá là mốc đỉnh 15m tới +0,15%; vô hiệu tham khảo dưới đáy ba nến 5m gần nhất −0,25%. Phải chờ 5m đóng vượt mốc rồi retest giữ vùng; watch không phải xác nhận breakout. Đây là **observe-only**: có thể gửi Discord quan sát riêng theo `COIN_LEVEL_OBSERVE_WATCH_DISCORD_V1_20260922` nhưng không vào Binance, không đổi entry/size/leverage/SL/TP, classifier LONG xác nhận (Trend Score ≥12 + 15m/1h UP + 15m đóng phá 12 nến), LIMIT/MARKET, fill hoặc thống kê. Coin đã thành confirmed LONG bị ẩn khỏi watch để tránh trùng.
- Version `COIN_LEVEL_EARLY_LONG_WATCH_V1_20260921`. Không thêm exact signal label/card thống kê hay checkbox WHITELIST; matcher thực `RETEST_LONG_READY/RETEST_SHORT_READY`, seed OFF và policy closed AvgROE >4% giữ nguyên. JSON API chỉ thêm `earlyLongWatches/totalEarlyLongWatches`; consumer/JSON candidate, attempt, control và Discord cũ không migrate/rewrite/replay. UI mới gặp API cũ sẽ báo server chưa nạp logic, không giả là lượt quét có 0 tín hiệu.

### 2026-09-21 — COIN_LEVEL_ENTRY_WATCH_TIER_SORT_UI_V1_20260921

- Bảng “Coin đạt bộ lọc điểm vào” chỉ đổi **thứ tự hiển thị** theo Entry Score tier: `VERY_STRONG/RẤT MẠNH` (≥80) → `GOOD/MẠNH` (≥70) → `WATCH/THEO DÕI` (≥60) → `WEAK/YẾU`; trong cùng tier, điểm cao hơn đứng trước, rồi mới tới retest, thời gian xác nhận và symbol. Nhãn UI `GOOD` đổi từ “ĐỦ TỐT” thành “MẠNH” để khớp thứ tự người dùng yêu cầu. Dữ liệu tính điểm vẫn chỉ lấy nến đóng/fresh 5m/15m/1h/4h đã có trước entry; công thức và ngưỡng tier không đổi.
- Đây là sort/nhãn trình bày phía browser, không đổi mảng API `candidates`, thứ tự executor/Discord, classifier LONG/SHORT, route, entry/size/leverage/SL/TP, fill hoặc thống kê. Không thêm signal label/card/checkbox WHITELIST; matcher `RETEST_LONG_READY/RETEST_SHORT_READY`, seed OFF và policy closed AvgROE >4% giữ nguyên. JSON cũ không migrate/rewrite; UI vẫn dùng `entryTier` hiện hữu và fallback nhãn cũ khi key lạ.

### 2026-09-21 — COIN_LEVEL_EARLY_SHORT_WATCH_V1_20260921 (lịch sử; V2 đã thay thế)

- Thêm mảng API `earlyShortWatches` và bảng “SHORT sớm · quan sát” trên `/coin-level-analysis`, tách hoàn toàn khỏi `candidates` đã xác nhận. Dữ liệu trước entry chỉ là cache Binance 5m/15m/1h/4h đã đóng, ≥100 nến liên tục/fresh như scanner cũ; không REST bổ sung, không nến đang chạy, CoinGlass hay dữ liệu sau tín hiệu. Một watch chỉ xuất hiện trên **nến 5m đóng mới ≤6 phút** sau đợt tăng từ đáy tham chiếu 15m tới đỉnh gần ≥8%; close đã rời đỉnh 0,5–6%, nến đỏ đóng cắt xuống EMA13 sau khi close trước còn trên EMA13, lower high 5m hoặc râu trên ≥25% sát đỉnh, volume quote5m ≥50k USDT và ≥1,3× median20 nến trước, taker bán ≥52%. Thiếu taker/volume thì không phát. Dự kiến chỉ xem vùng hồi EMA13 ±0,15% và vô hiệu trên đỉnh gần +0,25%; phải đợi hồi/reject 5m, không SHORT đuổi close.
- Đây là **watch observe-only**, không phải nhãn route/card thống kê hay xác nhận đảo chiều. Có thể gửi Discord quan sát riêng theo `COIN_LEVEL_OBSERVE_WATCH_DISCORD_V1_20260922` nhưng không gửi Binance, không vào lệnh/size/SL/TP; list confirmed LONG/SHORT, `RETEST_SHORT_READY` matcher và gate SHORT score ≤−12 + 15m/1h DOWN + 15m phá 12 nến vẫn y nguyên. Nếu cùng coin đã là confirmed SHORT thì ẩn watch để tránh trùng; UI tối đa30 watch, tổng số là số đủ điều kiện trước giới hạn. Không đổi thống kê fill/AvgROE/WR; chưa gán xác suất hoặc hiệu suất cho watch. Vì không thêm exact label/card thống kê, không thêm checkbox WHITELIST; key UI cho route thực vẫn khớp matcher `RETEST_LONG_READY/RETEST_SHORT_READY`, seed OFF và chỉ hiện khi closed AvgROE >4% giữ nguyên.
- Version `COIN_LEVEL_EARLY_SHORT_WATCH_V1_20260921`. JSON API chỉ thêm `earlyShortWatches/totalEarlyShortWatches`, consumer cũ bỏ qua; JSON candidate/attempt/controls/Discord cũ không migrate, rewrite hoặc replay. UI mới gặp API cũ thiếu field sẽ ghi rõ server chưa nạp logic, không coi là kết quả quét rỗng. Không tự động nâng watch thành Binance route trước khi đánh giá lịch sử lead-time, adverse move và kết quả theo regime.

### 2026-09-21 — COIN_LEVEL_PENDING_LIMIT_INVALIDATION_V1_20260921

- Version đánh giá/hủy `COIN_LEVEL_PENDING_LIMIT_INVALIDATION_V1_20260921`, executor `COIN_LEVEL_ENTRY_WATCH_LIMIT_3USDT_V3_INVALIDATION_20260921`. Sau khi đặt LIMIT `clel_`, cleaner 35 giây đánh giá **đúng symbol, hướng, thời điểm close15m phá vùng và mốc phá** đã lưu lúc submit, độc lập danh sách UI chỉ có tối đa 30 dòng. Dữ liệu dùng để quyết định là cache Binance 5m/15m/1h/4h đủ ≥100 nến đã đóng, liên tục và còn mới; phải có nến 5m đóng **sau lúc submit**. Thiếu cache, lỗi phân tích, thiếu metadata hoặc chưa có nến mới là `UNKNOWN` và giữ lệnh.
- Phân loại `INVALID` khi Trend Score mất ngưỡng ±12, 15m/1h không còn đồng hướng, breakout15m gốc hết hạn/bị thay, hoặc một close5m sau breakout đi qua phía sai của mốc. Hai lượt cleaner liên tiếp cùng lý do trên cùng nến 5m đã đóng mới hủy phần LIMIT còn chờ; một lượt `VALID/UNKNOWN` xóa chuỗi. Rớt khỏi top30 hoặc không mở trang **không** phải lý do hủy. Binance được truy vấn lại trạng thái order thật trước khi hủy sớm; chỉ order `NEW/PARTIALLY_FILLED` mới xét. Hạn 45 phút, hủy sau restart và các gate đặt lệnh hiện hữu vẫn giữ nguyên.
- Tác động Binance: chỉ hủy phần chưa khớp của LIMIT Coin Level `clel_`; không hủy MARKET, LIMIT route khác, DCA hay TP/SL. Nếu đã partial, kiểm `executedQty` từ phản hồi Binance và position mới, giữ plan và thử áp TP/SL cho phần đã khớp; nếu không có plan thì **không hủy sớm** và log lỗi để kiểm tra. Không đổi entry dự kiến, margin 3 USDT, leverage route, TP +10% ROE mặc định, SL −30% ROE, cooldown hay quyền route. Lệnh hủy không được tính như fill/PnL; thống kê ngày chỉ tính fill thực theo matcher `RETEST_LONG_READY/RETEST_SHORT_READY`.
- Không thêm nhãn/card/checkbox WHITELIST; key UI và matcher runtime vẫn là `RETEST_LONG_READY/RETEST_SHORT_READY`, seed OFF và policy chỉ hiện khi closed AvgROE >4% không đổi. JSON attempt chỉ thêm `direction/orderType/confirmationAt/referenceLevel` cho LIMIT mới và trạng thái hủy; attempt cũ thiếu metadata không bị migrate/rewrite, giữ cách hết hạn 45 phút để tương thích. Candidate/API/UI JSON cũ không đổi.

### 2026-09-21 — COIN_LEVEL_ENTRY_WATCH_ROW_HIGHLIGHT_V1_20260921

- UI `/coin-level-analysis` tô toàn hàng xanh cho LONG và đỏ cho SHORT **chỉ khi candidate đã có `retestAt` từ nến 5m đóng**; hàng mới qua nến 15m nhưng chưa retest giữ nền thường. Dữ liệu trước entry, phân loại Trend Score ±12, breakout15m, retest5m và entry dự kiến vẫn là candidate V3 từ nến Binance 5m/15m/1h/4h đã đóng; không dùng nến tương lai hoặc trạng thái lệnh để tô màu. Chú giải nói rõ màu hàng không xác nhận Binance đã đặt/khớp lệnh.
- Đây là nhấn mạnh giao diện, không thêm tín hiệu/nhãn/card thống kê. Cách thống kê score/target/fill, Binance/entry/size/SL/TP, route matcher và checkbox WHITELIST không đổi; key UI vẫn khớp `RETEST_LONG_READY/RETEST_SHORT_READY`, seed OFF và chỉ hiện closed AvgROE >4% theo policy cũ. JSON API/state cũ không migrate/rewrite; thiếu `retestAt` thì hàng trung tính, tương thích dữ liệu cũ.

### 2026-09-20 — COIN_LEVEL_ENTRY_WATCH_DISCORD_V6_ENTRY_HIGHLIGHT_20260920

- Chỉ đổi trình bày tín hiệu Coin Level trên Discord và bảng: thêm embed vàng đứng đầu với heading `ENTRY DỰ KIẾN` viết hoa và giá in đậm; field gốc cũng ghi giá in đậm/viết hoa, cột bảng có nhãn uppercase và giá vàng đậm. Dữ liệu trước entry vẫn là `entryPrice/entryZone` của candidate V3 từ nến Binance 5m/15m/1h/4h đã đóng; không tính lại hoặc dự báo giá. Điều kiện phân loại LONG/SHORT ±12, breakout15m, retest5m và mọi gate Binance không đổi.
- Không đổi cách thống kê fill/score/tier/target, Binance/entry/size/SL/TP, route matcher hoặc checkbox WHITELIST; key UI vẫn khớp `RETEST_LONG_READY/RETEST_SHORT_READY`, mặc định OFF khi seed mới và policy chỉ hiện closed AvgROE >4%. JSON API/state cũ tương thích vì không đổi schema, thiếu entry vẫn hiển thị `—`; Discord đã gửi/dedupe cũ không phát lại, chỉ tin mới dùng V6. Màu vàng là viền embed (Discord không hỗ trợ tô màu riêng số trong field), không phải trạng thái khớp lệnh.

### 2026-09-20 — COIN_LEVEL_ENTRY_WATCH_LIMIT_3USDT_V2_20260920

- Dữ liệu trước entry: candidate Coin Level V3 từ nến Binance 5m/15m/1h/4h đã đóng, liên tục và còn mới. Điều kiện gốc: Trend Score ≥+12 LONG hoặc ≤−12 SHORT, 15m/1h đồng hướng, close15m phá biên 12 nến trước. Entry dự kiến là trung điểm vùng quanh mốc phá ±0,15%. Entry Score/T1–T3 chỉ mô tả, không phải gate.
- LIMIT chỉ xét candidate chưa retest5m, confirmation sau khi route ON và sau khi executor khởi động, tuổi ≤90 giây. Close5m và Binance mark đều phải vượt entry đúng hướng 0,15–5%. LONG BUY LIMIT dưới mark; SHORT SELL LIMIT trên mark, kiểm lại giá tick/mark từ REST ngay trước submit. Master/route phải ON, không có vị thế/lệnh entry cùng coin, cooldown4h và max30 vị thế. LIMIT GTC cố định 3 USDT margin × leverage route (mặc định 5x), TP theo ROE route (mặc định +10%), SL −30% ROE, neo theo fill đầy đủ; lệnh chờ hủy sau 45 phút. Partial fill dùng protection-on-full-fill chung, không được coi là đã bảo vệ trước full fill. Nếu retest5m đóng đã đạt thì nhánh MARKET theo margin route (mặc định 1 USDT) vẫn chạy như cũ, mark lệch entry ≤0,5%. Dedupe/cooldown chung ngăn LIMIT và MARKET cùng một episode; không DCA/replay.
- Bổ sung xử lý partial LIMIT: cleaner chạy mỗi 35 giây, khi phát hiện `clel_` đã khớp một phần sẽ hủy phần chờ còn lại và thử đặt TP/SL cho vị thế đã khớp bằng fill/entry hiện tại. Nếu không còn plan trong bộ nhớ hoặc đặt bảo vệ thất bại, ghi lỗi cần kiểm tra ngay; không mô tả vị thế partial là đã được bảo vệ cho tới khi Binance xác nhận TP/SL.
- LIMIT `clel_` còn chờ từ process trước bị cleaner hủy ngay sau restart, vì plan protection-on-fill nằm trong bộ nhớ cũ; không giữ GTC mồ côi tới 45 phút. Không hủy MARKET hoặc LIMIT route khác.
- Versions: executor `COIN_LEVEL_ENTRY_WATCH_LIMIT_3USDT_V2_20260920`, policy `LIVE_CARD_LIQ_FLOW_COIN_LEVEL_LIMIT_V30_20260920`, Discord `COIN_LEVEL_ENTRY_WATCH_DISCORD_V5_LIMIT_20260920`. Thống kê ngày chỉ tính fill Binance thật theo route/label cũ; lệnh LIMIT chờ không phải entry đã khớp. Không thêm label/card/WHITELIST mới: key UI khớp matcher runtime `RETEST_LONG_READY/RETEST_SHORT_READY`, mặc định OFF khi seed và policy checkbox WHITELIST chỉ hiện closed AvgROE >4% giữ nguyên; hai route máy này đã được bật riêng. JSON candidate/control/audit cũ không migrate/rewrite; thiếu version/entry/timestamp/mark thì fail-closed. State attempts cũ giữ nguyên, LIMIT dùng clientOrderId `clel_` riêng. API chỉ đổi `binanceExecution.mode` và thêm `limitMarginUsdt/limitMaxAgeMinutes`, consumer cũ có thể bỏ qua. Tin Discord không phải xác nhận Binance đã nhận lệnh.

### 2026-09-20 — COIN_LEVEL_ENTRY_SCORE_V1_CAUSAL_TARGETS_20260920

- Candidate/API đang dùng `COIN_LEVEL_ENTRY_WATCH_V3_ENTRY_SCORE_TARGETS_20260920`; Discord dùng `COIN_LEVEL_ENTRY_WATCH_DISCORD_V4_SCORE_TARGETS_20260920`. Sau khi classifier gốc tạo candidate, mỗi dòng có thêm **Entry Score 0–100** gồm đúng năm phần: độ lớn `abs(Trend Score)` tối đa `25`, chất lượng close breakout15m tối đa `20`, retest5m đã đóng tối đa `25`, quote-volume/taker của nến breakout tối đa `15`, khoảng trống thuận hướng tới cấu trúc kế tiếp tối đa `15`. Tier hiển thị: `>=80 RẤT MẠNH`, `>=70 ĐỦ TỐT`, `>=60 THEO DÕI`, còn lại `YẾU`. Đây là điểm chất lượng mô tả, **không phải xác suất thắng, gate mới hoặc quyền lệnh**.
- Toàn bộ input điểm/target là causal trước entry: nến Binance đã đóng/liên tục/còn mới 5m/15m/1h/4h; Trend Score hiện hữu; nến breakout15m cùng tối đa20 nến volume trước nó; nến retest5m đầu tiên nếu có; swing/range 15m/1h/4h đã hoàn tất không muộn hơn `retestAt` (hoặc `confirmationAt` khi đang chờ); ATR14 cùng cutoff đó. Không dùng mark/nến/outcome/PnL/MFE sau entry, không CoinGlass/order book/OI/L/S và không gán xác suất khi chưa có backtest đủ mẫu. Thiếu taker dùng điểm trung tính; thiếu target cấu trúc fallback khoảng TP tham chiếu để không biến missing thành lợi thế giả.
- `targetPlan` gom target cấu trúc thuận hướng, TP tham chiếu `+10% ROE @5x`, `ATR15×1` và biên ATR kịch bản4h/8h; gộp mốc cách nhau `<=0,12%`, xếp theo khoảng cách thuận hướng và hiện tối đa `T1/T2/T3`. Mỗi mốc ghi giá, `% giá`, gross ROE 5x và basis. Đây là vùng kịch bản, chưa hiệu chỉnh xác suất; giá có thể dừng trước hoặc vượt vùng. Bảng trên `/coin-level-analysis` và Discord cùng hiện score breakdown/targets.
- Classifier/gate Binance **không đổi**: Trend Score LONG `>=+12` hoặc SHORT `<=-12`, 15m+1h đồng hướng, close15m phá biên12 nến, retest5m đã đóng; executor vẫn kiểm tra tuổi90s, drift0,5%, controls/no-position/dedupe và MARKET `1 USDT ×5`, TP `+10% ROE`, SL `-30% ROE`. Entry Score/tier/targets không tham gia `coinLevelEntryWatchRoute`, không đổi entry/size/leverage/DCA/SL/TP hoặc vị thế/lệnh cũ.
- Thống kê mới chỉ là breakdown tại candidate và target scenario; không tạo W/L, WR, PF, AvgROE, cohort paper hay performance card. Không thêm exact signal label/runtime matcher, tiếp tục dùng `RETEST_LONG_READY/RETEST_SHORT_READY`; vì vậy không tạo checkbox `WHITELIST` mới và policy card closed `AvgROE >4%`, mặc định OFF giữ nguyên. JSON chỉ thêm field tùy chọn `entryScoreVersion/entryScore/entryTier/entryTierLabel/entryScoreComponents/entryScoreMetrics/targetPlan`; consumer/state Discord/attempt cũ bỏ qua field mới, không migrate/rewrite/backfill và payload cũ thiếu field hiện `—`.

### 2026-09-20 — COIN_LEVEL_ENTRY_WATCH_RETEST_MARKET_V1_1USDT_20260920

- Executor Binance dùng đúng candidate `COIN_LEVEL_ENTRY_WATCH_V3_ENTRY_SCORE_TARGETS_20260920`, nhưng vẫn chỉ coi là **READY thật** khi có `retestAt`: tối thiểu 100 nến đã đóng/liên tục/còn mới cho 5m/15m/1h/4h; Trend Score LONG `>=+12` hoặc SHORT `<=-12`; 15m và 1h đồng hướng; close15m phá biên 12 nến trước trong tối đa 45 phút; mọi close5m sau phá vùng vẫn đúng phía; trong 30 phút có nến 5m chạm mốc với tolerance `0,15%` rồi đóng đúng phía. Entry Score/targets V3 không tham gia gate. Dòng `15m đạt · chờ retest 5m` chỉ hiển thị/Discord, không được submit.
- Versions đang chạy: executor `COIN_LEVEL_ENTRY_WATCH_RETEST_MARKET_V1_1USDT_20260920`, catalog `OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V5_COIN_LEVEL_RETEST_20260920`, controls `AUTO_ENTRY_CONTROLS_V15_COIN_LEVEL_RETEST_MARKET_20260920`, exclusive policy `LIVE_CARD_LIQ_FLOW_COIN_LEVEL_RETEST_V29_20260920`, Discord `COIN_LEVEL_ENTRY_WATCH_DISCORD_V4_SCORE_TARGETS_20260920`, SHORT-SL exemption `BINANCE_BOT_SHORT_TP_ONLY_COIN_LEVEL_EXEMPT_V6_20260920`. Route source/stream là `coin-level-entry-watch/closed-mtf-retest`; tái dùng exact label có sẵn `RETEST_LONG_READY` và `RETEST_SHORT_READY`, nên không tạo tên label/performance card mới.
- Entry thật là MARKET theo đúng hướng candidate, mặc định `1 USDT margin ×5 = 5 USDT notional`; có thể ceil quantity trong trần +1% để tránh `-4164`. TP mặc định `+10% ROE` và SL cố định `-30% ROE`, đều được neo lại theo full-fill thật; SHORT route được miễn policy TP-only nên vẫn giữ SL. Trước submit phải có master + đúng route ON, retest xảy ra sau `enabledAt` và mới `<=90 giây`, mark lệch midpoint entry dự kiến `<=0,5%`, không có position/open entry order cùng symbol, cooldown 4 giờ và private authorization. Không DCA, không replay tín hiệu cũ; durable client ID/attempt ghi `SUBMITTING` trước REST để không retry mù khi kết quả không chắc chắn.
- Thống kê/audit dùng fill thật qua source/stream/label/side trong Binance daily stats; không tạo paper cohort hoặc card AvgROE riêng. Vì không thêm performance card hay label name mới, không thêm checkbox `WHITELIST`; quyền nằm ở hai route Orders, mặc định catalog OFF và chỉ được bật tường minh. JSON candidate thêm optional `version/observeOnly/binanceEligible/executionEligible`; API thêm `binanceExecution`; file attempt mới additive/ignored. Consumer/JSON cũ bỏ qua field mới an toàn, nhưng candidate cũ thiếu version/retest hoặc state lỗi fail-closed, không migrate/backfill/rewrite order, position, fill hay protection cũ.

### 2026-09-20 — COIN_LEVEL_ENTRY_WATCH_V2_RETEST_ENTRY_ZONE_20260920 · entry dự kiến trên bảng và Discord

- Candidate và điều kiện vào bảng **không đổi** so với V1: chỉ dữ liệu nến đã đóng/liên tục/còn mới 5m/15m/1h/4h, score LONG `>=+12` hoặc SHORT `<=-12`, 15m/1h đồng hướng, close15m phá biên12 nến trước trong45 phút và không close5m hậu xác nhận đóng ngược mốc. Sau khi đã qua toàn bộ rule đó, snapshot thêm entry tham khảo causal neo đúng `referenceLevel`: LONG zone `[level, level×1,0015]`, SHORT zone `[level×0,9985, level]`; `entryPrice` là trung điểm đã làm tròn8 chữ số và `entryBasis=RETEST_LEVEL_0_15_PCT`. Không lấy mark/close hiện tại làm giá đuổi, không dùng nến tương lai/outcome/PnL.
- Bảng thêm cột “Entry dự kiến”, hiện giá giữa và cả low–high. Discord V2 trước đây dùng đúng ba field `entryPrice/entryZone/entryBasis`; notifier hiện là V3 và ghi rõ executor retest chạy độc lập. Dedupe/startup cutoff/backoff/cấu hình webhook và điều kiện chỉ coin đã vào bảng mới gửi giữ nguyên.
- Bản thân `entryPrice/entryZone` vẫn là giá tham khảo, không phải LIMIT order. Từ executor V1 ở mục trên, chỉ candidate có retest5m đã đóng mới dùng midpoint làm drift guard cho MARKET; candidate chưa retest vẫn **OBSERVE ONLY**. Không paper/performance card hay WHITELIST mới.
- API JSON chỉ thêm field candidate, tương thích consumer V1 có thể bỏ qua; state delivery cũ không migrate/rewrite và event cũ đã dedupe không được gửi lại chỉ vì thêm giá. Thiếu field ở response cũ thì UI hiện `—`, không tự suy giá. Tests `test-coin-level-entry-watch.mjs`, `test-coin-level-entry-watch-discord.mjs` và regression Coin Level.

### 2026-09-20 — COIN_LEVEL_ENTRY_WATCH_DISCORD_V1_20260920 · chỉ gửi coin đã vào bảng bộ lọc

- Scheduler nền mỗi 30 giây dùng **đúng** `getCoinLevelEntryWatchSnapshot().candidates` của bảng “QUÉT NẾN ĐÃ ĐÓNG · CHỈ THAM KHẢO / Coin đạt bộ lọc điểm vào”; trang không cần mở. Dữ liệu causal trước thông báo và phân loại không thêm rule riêng: tối thiểu 100 nến đã đóng/liên tục/còn mới của 5m/15m/1h/4h trong cache; Trend Score LONG `>=+12` hoặc SHORT `<=-12`; 15m/1h đồng hướng; close15m phá biên 12 nến trước trong tối đa45 phút; mọi close5m sau đó và close mới nhất vẫn đúng phía. Coin chỉ mới đủ điểm nhưng chưa xuất hiện trong `candidates` **không gửi**. Discord ghi rõ đã/chưa có retest5m, mốc phá vùng, close15m/5m và OBSERVE ONLY; retest đến sau không tạo tin thứ hai cho cùng nến.
- Version notifier `COIN_LEVEL_ENTRY_WATCH_DISCORD_V1_20260920`; webhook chỉ đọc từ `COIN_LEVEL_ENTRY_WATCH_DISCORD_WEBHOOK_URL` trong `.env`, không trả secret ra API/UI/tài liệu. Chỉ nhận confirmation đóng sau `startedAt`, tuổi `<=45 phút`, nên restart không replay tín hiệu cũ. Dedupe bền vững exact `symbol + side + confirmationAt`; ghi intent `unknown` trước HTTP POST để crash/timeout không gửi lại mù, Discord từ chối có backoff tối thiểu60 giây/tối đa1 giờ khi tín hiệu còn mới. Không gửi mention.
- Thống kê/state chỉ giữ tối đa300 delivery record trong7 ngày (`sent/unknown/rejected`) để dedupe; không W/L, WR, PF, AvgROE, PnL hay paper. Discord không tự cấp quyền và không xác nhận đã khớp; executor V1 độc lập chỉ xử lý candidate retest READY qua controls/private policy. Không tạo performance card hoặc WHITELIST mới.
- JSON state mới `data/coin-level-entry-watch-discord.json` là additive và git-ignored; không migrate/rewrite snapshot hoặc JSON cũ, consumer cũ bỏ qua `discordConfigured` additive. Thiếu webhook/cache/candidate mới thì im lặng fail-closed. Test `node scripts/test-coin-level-entry-watch-discord.mjs` cùng regression Coin Level.

### 2026-09-20 — COIN_LEVEL_BINANCE_BLOCK_STATUS_V1_20260920 · lý do Binance REST chặn trên Coin Level

- UI `/coin-level-analysis` đọc `GET /api/binance-rate-gate` mỗi 10 giây, gồm snapshot `gate` REST chung và `analyzeGate` REST phân tích; đây là dữ liệu vận hành hiện thời trước khi người dùng tự quyết định entry, không dùng nến tương lai, outcome hay PnL. Chỉ phân loại `BLOCKED` khi `blockedUntil`/`authBlockedUntil` hoặc `authBlocks[].blockedUntil` còn hiệu lực; hiện nguyên nhân 418/429/-2015 do gate ghi nhận, nguồn lỗi auth, giờ VN dự kiến hết chặn và probe nếu có. Queue đạt ngưỡng là `CONGESTED` riêng, **không** gọi là Binance chặn; thiếu API là `UNKNOWN`, không mặc định clear/blocked. Hết hạn block thì hiển thị không ghi nhận block đang hoạt động. Nếu riêng request phân tích coin trả lỗi hoặc snapshot `STALE_LAST_GOOD`/`LIVE_PARTIAL`, banner hiện lý do của coin đó ở dòng riêng, không tự suy ra block toàn cục.
- Đây là banner trạng thái, không tạo signal label, tier giao dịch, card thống kê hiệu suất hay matcher runtime; thống kê chỉ là trạng thái gate tại lúc đọc, không W/L, WR, PF, AvgROE, PnL. Không thêm checkbox WHITELIST giả; policy card giao dịch closed AvgROE `>4%`, default OFF giữ nguyên. Không đổi Binance request gate, retry, unblock, Discord, entry/size/leverage/DCA/SL/TP/order/position; UI **OBSERVE ONLY** và không gọi reset endpoint.
- JSON API hiện hữu không đổi; helper frontend version `COIN_LEVEL_BINANCE_BLOCK_STATUS_V1_20260920` đọc field tùy chọn, thiếu field fail-closed/`UNKNOWN`, không migrate/rewrite snapshot/JSON cũ. Test `node scripts/test-coin-level-binance-block-status.mjs` và regression `test:coin-level-analysis`.

### 2026-09-20 — COIN_LEVEL_ENTRY_WATCH_V1_20260920 · danh sách ứng viên trên đầu Coin Level

- `GET /api/coin-level-entry-watch` và bảng trên đầu `/coin-level-analysis` là bộ lọc độc lập coin đang tìm. Dữ liệu causal chỉ gồm tối thiểu 100 nến Binance đã đóng, liên tục, còn mới ở 5m/15m/1h/4h từ cache WebSocket có sẵn; không REST theo từng coin, không CoinGlass/nến chưa đóng, outcome hay fill. Scan nền/UI dùng cache20 giây, poll30 giây, hiện tối đa30 ứng viên và không giả định đã quét đủ khi cache thiếu. V1 ban đầu là OBSERVE ONLY; quyền hiện tại được giới hạn bởi executor retest V1 ở mục đầu.
- Phân loại hai chiều: dùng `recommendation.trendScore` hiện có từ `buildCoinLevelAnalysis`, LONG `>=+12` hoặc SHORT `<=-12`, đồng thời trạng thái 15m và 1h cùng hướng. Trong ba nến 15m gần nhất phải có **close** vượt đỉnh/thủng đáy của 12 nến 15m trước (tối đa 45 phút); close 5m mới nhất vẫn ở đúng phía mốc và không nến 5m nào sau breakout đóng ngược qua mốc. “Chờ retest 5m” không có quyền lệnh; “retest 5m đạt” chỉ trở thành READY khi còn qua controls/freshness/drift/no-position/dedupe của executor V1.
- Thống kê bảng chỉ đếm universe, covered, candidate và thời điểm scan; không W/L, WR, PF, AvgROE, PnL, paper hay cohort hiệu suất. Không thêm performance card/WHITELIST; ảnh hưởng Binance hiện được mô tả duy nhất ở executor retest V1 phía trên.
- API JSON additive, không sửa/migrate/rewrite snapshot hay JSON cũ; client cũ bỏ qua route mới. Cache không đủ, stale, gap hoặc giá phá vùng đã mất hiệu lực thì fail-closed/ẩn ứng viên. Test `node scripts/test-coin-level-entry-watch.mjs` và `npm run test:coin-level-analysis`.

### 2026-09-20 — COIN_LEVEL_ENTRY_DISPLAY_V2_20260920 · phân biệt xu hướng và ngưỡng xác nhận

- Version UI `COIN_LEVEL_ENTRY_DISPLAY_V2_20260920` thay cách trình bày hai ô “giá dự kiến” V1 trên `/coin-level-analysis`; **không sửa** `buildRecommendation`, entryZone, stance, bias hay rule tín hiệu. Dữ liệu trước khi hiển thị vẫn là JSON phân tích hiện có: `recommendation.bias/stance/context/longPlan/shortPlan`, vùng giá từ nến Binance 5m/15m/1h/4h đã được server phân tích và `freshness`; không thêm dữ liệu tương lai, mark socket chỉ cập nhật giá MARK như cũ.
- Phân loại chỉ ở giao diện: bias BULLISH/BEARISH/NEUTRAL là **xu hướng tổng hợp**, không phải quyền vào lệnh. Stance `BEARISH_BREAKDOWN_15M_CONFIRMED`/`BULLISH_BREAKOUT_15M_CONFIRMED` làm nổi bật SHORT/LONG tương ứng nhưng vẫn ghi **chờ retest 5m** và ẩn mốc lớn của kịch bản đối chiều. Khi hai plan cùng neo hỗ trợ và 15m chưa xác nhận, hiện `support.high` là **ngưỡng 15m đóng trên** cho LONG, `support.low` là **ngưỡng 15m đóng dưới** cho SHORT, không lặp trung điểm. Ở giữa vùng: chưa chọn hướng. Với hai vùng khác nhau, mốc lớn là trung điểm vùng theo dõi và được ghi đúng bản chất, không gọi giá vào lệnh. Dữ liệu cũ hoặc vùng không hợp lệ hiển thị `—`.
- Thống kê: không tạo nhãn tín hiệu, tier, snapshot hay card hiệu suất mới; không tính W/L/PnL/AvgROE và không nối checkbox `WHITELIST`. Policy card chỉ hiện closed `AvgROE >4%`, mặc định OFF giữ nguyên. **OBSERVE ONLY**: không đổi Binance, Discord, entry, size, leverage, DCA, SL hoặc TP; không phát lệnh từ trang này.
- Tương thích JSON cũ: đọc lại các field `recommendation`/`freshness` V1 đang có, không migrate/rewrite state; thiếu field fail-closed. `buildCoinLevelEntryPreview` V1 vẫn giữ output cũ cho consumer, V2 chỉ dựng display phía client. Test `node scripts/test-coin-level-analysis.mjs` kiểm tra vùng trùng, hai mép xác nhận, ẩn đối chiều, stale và nội dung UI.

### 2026-09-20 — COIN_LEVEL_ENTRY_PREVIEW_V1_20260920 · mốc giá LONG/SHORT nổi bật

- `/coin-level-analysis` hiển thị hai ô xanh LONG/đỏ SHORT dưới đánh giá hiện tại. Giá lớn là **trung điểm của `recommendation.longPlan.entryZone` hoặc `shortPlan.entryZone` hiện có**; kèm nguyên vùng thấp–cao, không thêm công thức dự báo/giá khớp mới. Input chỉ là JSON phân tích đã có trước khi người dùng xem trang: vùng từ nến Binance 5m/15m/1h/4h, mark, ATR, cấu trúc hỗ trợ/kháng cự và order book tham khảo theo `COIN_LEVEL_ANALYSIS_V9_UNICODE_SYMBOL_INPUT_20260902`. Không dùng dữ liệu tương lai, không dùng giá socket live để đổi điểm giữa trong khi nến chưa được phân tích lại.
- Mọi mốc hợp lệ mang nhãn **CHỜ XÁC NHẬN 15M + RETEST 5M**, không gọi READY/entry signal. Nếu `freshness.stale` hoặc `binance=STALE_LAST_GOOD`, vùng thiếu, không hữu hạn, giá ≤0 hoặc high<low thì mốc lớn là `—`, ghi trạng thái chờ dữ liệu/vùng. Xanh/đỏ chỉ phân biệt kịch bản, không biểu thị tỷ lệ thắng. Không tạo tier thống kê, W/L/PnL/AvgROE hay card WHITELIST.
- Nếu LONG/SHORT cùng dùng một entryZone (ví dụ CYS khi sát hỗ trợ), hai mốc có thể trùng nhau. UI giải thích đây là hai nhánh loại trừ: giữ vùng→LONG, phá vùng rồi retest thất bại→SHORT; không phải hai lệnh đồng thời. Không dịch một mốc chỉ để tạo hai số khác nhau.
- Version preview riêng `COIN_LEVEL_ENTRY_PREVIEW_V1_20260920` chạy phía UI và tương thích JSON cũ chứa `recommendation.longPlan/shortPlan.entryZone`; thiếu field tự fail-closed, không migrate/rewrite JSON state. **OBSERVE ONLY**: không đổi Binance/entry/size/leverage/SL/TP, executor, tín hiệu Discord, switch hoặc policy WHITELIST closed AvgROE>4%/OFF. `npm run test:coin-level-analysis` kiểm tra giá, nhãn, stale/invalid và HTML/CSS.

### 2026-09-20 — LIQSCAN_SWEEP_SIDE_PROXY_GT100M_V1_20260920

- Giữ nguyên phát hiện quét MAIN KILL/vùng tham khảo, score lúc gác vùng, volume tier, webhook routing, cooldown và executor. Chỉ thêm gate **gửi Discord của hai luồng sweep**: UPPER xét `liquidityAbove`, LOWER xét `liquidityBelow` tại thời điểm phát hiện quét, phải **>100_000_000**. Không xét riêng `zone.liquidity`, không cộng hai phía, không lấy max hai phía, không đổi thành score >100. Ví dụ trên1,16B/dưới281,89M đều qua gate phía tương ứng nhưng vẫn cần mọi điều kiện quét cũ. Đúng100M/thiếu/NaN/Infinity bị chặn.
- Input trước alert: snapshot Binance15m hiện tại từ scanner, phía đã quét và tổng proxy cùng phía. Thêm `liquidityAtSweep={above,below,evaluatedAt,unit}` trong event để không nhầm tổng frozen lúc gác vùng với tổng lúc quét. Không thay số `liquidityAbove/liquidityBelow/sideLiquidity/zone` cũ vì chúng vẫn mô tả thời điểm gác vùng và được consumer khác sử dụng. Event JSON cũ không có `liquidityAtSweep` fallback tổng cùng phía đã lưu; object mới thiếu field fail-closed, không dùng phía đối diện thay thế.
- Đơn vị đã kiểm tra code `liquidityProxy.buildLiquidationMap`: `quoteVolume` (client lấy kline index7) × tỷ lệ taker × ageWeight × sqrt(leverage), cộng theo nhiều giả định leverage. Vì vậy đây là **WEIGHTED_QUOTE_VOLUME_PROXY**, không phải số coin và không phải USD/USDT thanh lý thực tế hoặc notional đo trực tiếp. Discord sweep đổi hậu tố các số mô hình từ `USDT` sang `proxy`; coin-level ghi chú rõ. M/B chỉ triệu/tỷ đơn vị proxy; giữ nguyên trị số/công thức, không quy đổi lại theo giá. Tiền margin/TP/SL thực vẫn giữ đơn vị cũ.
- Gate Discord đặt **sau** executor hiện có. Không thay Binance/entry/size/leverage/DCA/SL/TP hoặc WHITELIST; MAIN KILL vẫn có thể giao dịch theo rule cũ dù Discord bị lọc, REFERENCE_PROXY vẫn OBSERVE ONLY. Không sửa các notifier khác (high-score khi phân tích, horizon, squeeze-ratio…). Không gửi cảnh báo test/historical vào webhook.
- Event bị lọc trả `sent:0,reason:side_proxy_not_over_100m,filtered:true`, acknowledge tracker vào cooldown để không giữ pending/replay mãi; không ghi là đã gửi vào dedupe Discord. Event qua gate nhưng HTTP lỗi/backoff vẫn pending theo logic cũ. Stats `swept` vẫn tính phát hiện, `sent` chỉ số gửi thật; không tạo card/thống kê PnL/AvgROE/nhãn WHITELIST mới. Version filter riêng trong footer, giữ version event/JSON/trading matcher và file state cũ, không migrate/rewrite lịch sử.
- Tests: `npm run test:liqscan-high-score`, `npm run test:coin-level-analysis`; bao gồm hai phía/hai loại vùng, strict100M, số hiện tại khác số lúc gác vùng, JSON cũ, vùng nhỏ/tổng lớn và vùng lớn/tổng nhỏ, retry/ack, không đổi Binance.

### 2026-09-20 — SQUEEZE_RATIO_WATCH_V1_20260920 · Discord + danh sách coin-level

- Cảnh báo nguy cơ squeeze SHORT, **OBSERVE ONLY**, kế thừa ngưỡng nghiên cứu `RESEARCH_SQUEEZE_RATIO_V1_20260920`, không khẳng định thanh lý hoặc lợi nhuận. Nến 15m đóng xanh, close vượt high 20 nến trước, quote-volume ≥2× median 20 nến trước, close ở 25% trên biên nến. Ghép đúng 4 nến 15m liên tục thành 1h đã đóng; close 1h > EMA13 > EMA25 và EMA25 tăng so với 4 giờ trước; ít nhất 29 giờ liên tục. Không dùng nến live/future, gap hoặc trigger cũ hơn 15 phút.
- Dữ liệu trước alert (không có entry): global account L/S 15m <1 và giảm ≥10% so với 1 giờ trước. Cả hai mốc phải có timestamp +15 phút ≤ thời điểm nến tín hiệu, không stale quá 15 phút +2 giây. `RATIO` cam; thêm OI số lượng (`sumOpenInterest`, không dùng USD) tăng ≥3%/1h thì `RATIO_OI` tím. Thiếu OI vẫn có thể báo ratio nhưng không coi OI bằng 0; thiếu ratio không báo. Không thêm gate funding/top-position/retest; không nới ratio để ép ONE/G khớp.
- Chạy nền mỗi 60 giây, toàn bộ USDT perpetual TRADING từ exchange-info; độc lập search/trang đang mở. Dùng cache chung WebSocket15m (tối đa 500 nến), ≥120 nến để xét; bổ sung tối đa 8 coin/lượt, batch2 cách1,5s. Seed EMA bằng SMA lịch sử cache, nên warmup hữu hạn có thể khác rất nhỏ so với lịch sử dài của backtest. Chỉ lấy ratio/OI cho tối đa 12 ứng viên giá/lượt; dùng rate gate chung priority8/dropOnCongestion, tạm dừng khi Binance nghẽn/block; không cam kết đủ coverage khi thiếu dữ liệu. API cung cấp universe/ready/candidates/errors/lastScanAt.
- Chỉ nhận nến đóng sau lúc process khởi động, không replay backtest hoặc nến cũ sau restart. Dedupe 6h/coin/tier; RATIO_OI gộp luôn mức RATIO để tránh hai tin cùng nến, cho phép nâng cấp RATIO→RATIO_OI. Lưu intent trước POST; timeout/crash trạng thái `unknown`, không gửi lại mù quáng; HTTP từ chối được retry có backoff khi tín hiệu còn mới. Không khai báo thành công trước Discord HTTP OK.
- Webhook riêng trong `.env` (`SQUEEZE_RATIO_DISCORD_WEBHOOK_URL`), không lộ API/frontend. `GET /api/squeeze-ratio-watch` chỉ đọc; list trên `/coin-level-analysis` poll30s, hiển thị giá xác nhận nến, giờ VN, volume, ratio/OI và trạng thái gửi; tối đa200 cảnh báo/7ngày. Đây là event feed, không thống kê trade/W-L/PnL/AvgROE, không phải card WHITELIST. Không nối executor hoặc bật checkbox trade; policy card giao dịch chỉ hiện closed AvgROE >4%, mặc định OFF vẫn nguyên vẹn.
- Không ảnh hưởng Binance, entry/size/leverage/DCA/SL/TP, paper hoặc vị thế đang có. JSON mới riêng `data/squeeze-ratio-watch.json`, additive, không migrate/rewrite JSON cũ. Kiểm tra: `npm run test:squeeze-ratio-watch`, `npm run test:coin-level-analysis`.

### 2026-09-19 — Xả dài sau bơm + EMA99 15m dốc thẳng + spike bị bán

- Version `WEEK_LONG_POST_PUMP_EMA99_SLOPE_REJECT_V1_20260919`; exact label `WEEK_LONG_POST_PUMP_EMA99_SLOPE_REJECT_15M`. Scanner Top400 Futures USDT theo biến động tuyệt đối rồi quote-volume, tối thiểu `1M USDT/24h`, chạy mỗi 60 giây. WebSocket giữ live `15m` và `1h`; lịch sử 15m thiếu được warm dần tối đa 8 symbol/lượt, còn lịch sử 1h chỉ warm cho tối đa 6 symbol đã qua prefilter 15m ngay trong lượt để không tốn REST cho coin không có trigger, không tạo REST burst. Webhook chuyên dụng đọc từ `WEEK_LONG_POST_PUMP_EMA99_SLOPE_DISCORD_WEBHOOK_URL`; secret chỉ ở `.env`, `.env.example` để trống.
- Dữ liệu causal trước alert chỉ gồm nến Binance **đã đóng, liên tục và còn mới**: `168` nến 1h gần nhất và cache tối thiểu `135`/tối đa `500` nến 15m; detector vẫn fail-closed nếu quanh trigger chưa có đủ EMA99 + trọn 40 điểm EMA đã hình thành, và luôn loại nến live cuối. Context 1h yêu cầu đỉnh bơm cách `72–168h`, biên từ đáy trước đỉnh `>=35%`, giá xác nhận đã thấp hơn đỉnh `>=20%`; 72h gần nhất phải giảm hồi quy log ít nhất `8%`, `R² >=0,60` và cả 2/2 chặng median tiếp tục thấp dần ít nhất `1%`. Không dùng mark tương lai, CoinGlass, funding, outcome hoặc PnL để phân loại; mark live chỉ hiển thị giá lúc phát.
- Định nghĩa “EMA99 gần như một đường dốc”: hồi quy log của 40 điểm EMA99 15m đã hình thành (10 giờ gần nhất; bối cảnh nhiều ngày do 1h chịu trách nhiệm) quy đổi phải giảm `>=1,5%/24h`, `R² >=0,92`, ít nhất `85%` bước EMA99 giảm và `80%` của 32 close cuối nằm dưới EMA99. Trigger cần spike 15m `open→high >=4%`, range `>=4%`, quote-volume `>=3x median20`, high nằm trong `-1,5%..+4%` so với EMA99 và close lại dưới EMA99 với râu trên `>=25%` hoặc trả nhịp `>=2%`. Trong tối đa 3 nến đóng tiếp theo phải có nến đỏ volume `>=1,5x`, trả từ spike-high `>=5%`, close không cao hơn spike-open quá `0,5%` và stack `close < EMA13 < EMA25 < EMA99`. Alert cũ hơn 120 phút, cache gap/stale hoặc nến live đều fail-closed.
- Discord màu đỏ sẫm ghi điểm, thời gian đỉnh/spike/xác nhận theo giờ Việt Nam, pump/drawdown, regression 1h, dốc/R² EMA99, volume spike, mức trả lại và mốc vô hiệu tham khảo trên spike/EMA99. Đây là **OBSERVE ONLY / SHORT WATCH**, không phải entry: không nối `autoEntryControls`, không Binance order, size, leverage, DCA, TP, SL và không sửa vị thế/lệnh hiện có.
- Thống kê chỉ operational `requested/warmed/processed/detected/sent/failed`; không tạo paper trade, W/L, PnL, AvgROE, card hoặc checkbox `WHITELIST`. Vì không có card hiệu suất nên policy card mới mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%` không được kích hoạt ở lượt này. JSON chỉ thêm state dedupe riêng `data/week-long-post-pump-ema99-slope-discord.json`; event bổ sung độc lập, không migrate/backfill/replay/rewrite JSON, fill, signal hay order cũ; consumer cũ có thể bỏ qua label mới.

### 2026-09-19 — Coin Level hiển thị giá MARK live qua socket

- Version `COIN_LEVEL_ANALYSIS_MARK_SOCKET_V1_20260919`. Trang `/coin-level-analysis` mở WebSocket nội bộ `/ws/coin-level-analysis?symbol=...`; server tái sử dụng `sharedMarkTicker` Binance Futures `!markPrice@arr@1s`, lọc đúng symbol đang xem và dọn subscription ngay khi tab đóng/đổi coin. UI hiển thị badge `SOCKET LIVE`, giá MARK và thời điểm tick; mất socket tự reconnect backoff 1–15 giây và vẫn còn HTTP polling 20 giây làm dự phòng.
- Dữ liệu causal dùng trước mọi đánh giá/entry **không đổi**: cấu trúc, EMA, support/resistance, LiqScan score và xác nhận 5m/15m vẫn do snapshot phân tích hiện hữu quyết định, với quy tắc closed-candle của từng detector. Tick socket chỉ cập nhật giá MARK hiển thị, mark trong thẻ LiqScan và khoảng cách hiện tại tới `sweepTarget`; không dùng tick/râu live để nâng `WAITING` thành `CONFIRMED_15M`, tạo label, phân loại tier hoặc phát signal.
- Thống kê chỉ là connection/client count nội bộ và test lọc symbol/cleanup; không tạo W/L, PnL, PF, AvgROE, snapshot hiệu suất hay cohort. Không có label/card thống kê mới nên không nối `WHITELIST`; policy checkbox mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%` giữ nguyên.
- Ảnh hưởng Binance/entry/size/SL/TP: **không có**. Socket này là market-data read-only cho UI, không gọi executor, không đổi route/master, không đặt/hủy/sửa order, position, TP hoặc SL. Các rule Binance vẫn dùng dữ liệu/freshness/gate riêng ở server.
- Tương thích JSON: không đổi schema/state JSON và không migrate/backfill/rewrite lịch sử. WebSocket payload mới additive gồm `type/version/symbol/markPrice/eventAt/receivedAt/source`; client cũ tiếp tục polling bình thường. CoinGlass và full analysis vẫn đồng bộ qua endpoint HTTP cũ mỗi20 giây, nên socket mất không làm trang mất dữ liệu.

### 2026-09-18 — Tách Discord quét thanh khoản lớn và bắt vùng proxy tham khảo

- Versions đang chạy: detector `LIQSCAN_REFERENCE_SWEEP_DISCORD_V1_LARGE_VOLUME_20260918` và router `LIQSCAN_SWEEP_VOLUME_WEBHOOK_ROUTING_V1_20260918`; detector MAIN KILL hiện hữu vẫn là `LIQSCAN_MAIN_KILL_SWEEP_DISCORD_V2_VOLUME_EMPHASIS_20260918`. Webhook mới chỉ nằm trong `.env` qua `LIQ_SCAN_LARGE_VOLUME_DISCORD_WEBHOOK_URL`, không ghi secret vào source/docs.
- Dữ liệu causal trước alert là Top400 snapshot/tick Binance còn mới, nến 15m live liên tục, và `sweepTarget` do LiqScan tính ở một lượt **trước khi** bị xuyên: side, price, `sweepTarget.score`, mark, high/low live và tổng liquidity proxy trên/dưới. Lần nhìn thấy đầu chỉ gác mức và đóng băng cực trị hiện tại; chỉ một high/low mới vượt mức đã gác mới phát, nên không replay râu cũ sau restart. Case vùng tham khảo không phụ thuộc ngưỡng imbalance 65; ảnh mẫu score 61 vẫn có thể được gác nếu chính vùng đủ lớn.
- Phân loại `VÙNG PROXY THAM KHẢO` chỉ bật khi `sweepTarget.score >=2.000.000 USDT`, tương ứng tier `LỚN` trở lên; dùng volume proxy **của đúng vùng**, không lấy tổng 587,77M/142,68M làm volume vùng. Cả sự kiện MAIN KILL hiện hữu lẫn vùng proxy có tier `LỚN/RẤT LỚN/SIÊU LỚN` (`>=2M`) được gửi **chỉ** vào webhook mới. MAIN KILL `THƯỜNG/RÕ` dưới 2M tiếp tục gửi webhook cũ; không gửi trùng cả hai webhook. Tin nhắn ghi đậm volume vùng, tỷ trọng cùng phía và tổng liquidity phía trên/dưới.
- Thống kê runtime vẫn là operational `selected/processed/active/swept/sent/failed`; một symbol có event được tính swept, không tạo W/L, PF, PnL, AvgROE hoặc paper cohort. Đây không phải label/card hiệu suất nên không nối checkbox `WHITELIST`; policy checkbox mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%` giữ nguyên.
- Ảnh hưởng Binance: `REFERENCE_PROXY` luôn **OBSERVE ONLY**, `binanceEligible=false`, không đổi entry/side/size/margin/leverage/DCA/TP/SL và không sửa order/position. MAIN KILL tier `SIÊU LỚN >=50M` vẫn chạy executor đảo chiều 1 USDT ×5 hiện hữu trước khi gửi sang webhook lớn; việc tách webhook không mở rộng quyền giao dịch cho tier khác.
- JSON tương thích additive: router dùng state mới `data/liq-scan-large-volume-sweep-discord.json`; state webhook MAIN KILL cũ vẫn giữ cho nhóm dưới 2M. Tracker vùng tham khảo memory-only và dựng baseline mới sau restart; event thêm optional `zoneType=REFERENCE_PROXY`, version/execution flags nên consumer cũ có thể bỏ qua. Không migrate/backfill/rewrite/replay Discord state, fill, control, order hoặc protection cũ.

### 2026-09-18 — MAIN KILL đỏ SIÊU LỚN đảo chiều vào Binance 1 USDT

- Versions đang chạy: detector/Discord `LIQSCAN_MAIN_KILL_SWEEP_DISCORD_V2_VOLUME_EMPHASIS_20260918`, executor `LIQSCAN_MAIN_KILL_SWEEP_EXTREME_REVERSAL_MARKET_V1_20260918`, catalog `OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V4_MAIN_KILL_SWEEP_20260918`, controls `AUTO_ENTRY_CONTROLS_V14_MAIN_KILL_EXTREME_REVERSAL_20260918`, policy `LIVE_CARD_LIQ_FLOW_MAIN_KILL_EXTREME_V28_20260918` và SHORT-SL exemption `BINANCE_BOT_SHORT_TP_ONLY_MAIN_KILL_EXEMPT_V5_20260918`.
- Dữ liệu causal trước entry chỉ gồm vùng MAIN KILL đã được gác trước khi bị quét, `mainKillZone.score` proxy, side, mark/đỉnh/đáy live 15m, `armedAt/detectedAt`, score và snapshot/tick Binance hiện tại. Scanner cache-only Top400 phải thấy vùng còn nguyên ở lần quan sát trước rồi thấy một cực trị mới xuyên **hết** mép vùng; lần đầu sau restart chỉ dựng baseline nên không replay NEAR hay râu cũ.
- Phân loại giao dịch chỉ dành cho Discord đỏ `volumeTier=EXTREME`, rank 5 và `zone.liquidity >=50.000.000 USDT`; key/tier và số tuyệt đối đều phải khớp để fail-closed. Quét MAIN KILL trên (kill short) ánh xạ exact route `LIQSCAN_MAIN_KILL_UPPER_SWEEP_SHORT/SHORT`; quét MAIN KILL dưới (kill long) ánh xạ `LIQSCAN_MAIN_KILL_LOWER_SWEEP_LONG/LONG`. Các tier THƯỜNG/RÕ/LỚN/RẤT LỚN vẫn Discord OBSERVE ONLY, không gọi Binance.
- Khi master + exact route ON, event sinh sau `enabledAt`, tuổi `<=90 giây`, fresh mark lệch giá lúc quét `<=0,5%`, không position/open entry-order cùng symbol và ngoài cooldown 4 giờ mới được MARKET. Mặc định mỗi route `1 USDT margin ×5` (notional 5 USDT), TP `+10% ROE`, SL `−30% ROE`, neo average full-fill; input margin/leverage/TP sửa được trên `/binance-auto-controls`, SL cố định. Quantity được phép ceil vừa đủ min-notional Binance nhưng chỉ trong trần +1% để tránh `-4164` do step-size. Có durable `SUBMITTING`/client ID; không DCA, replay, auto-retry trạng thái mơ hồ hoặc sửa order/position cũ.
- Discord luôn ghi rõ kết quả thật `SUBMITTED/OFF/BỎ QUA/ERROR`; quét xong vùng vẫn không được mô tả là chắc chắn đảo chiều. SHORT được miễn policy TP-only để SL −30% thực sự tồn tại. Daily fill/close/PnL dùng exact source `liqscan-main-kill-sweep`, stream `background-top400`, label/side trên; đây là executor/audit route, không tạo card hiệu suất Liquid Flow nên không thêm WHITELIST. Nếu sau này tạo card, checkbox phải mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%`.
- JSON tương thích additive: hai route mới được seed OFF nếu file cũ chưa có, giữ nguyên mọi route/settings cũ; thao tác triển khai bật riêng hai exact route với `enabledAt` mới để chặn replay. Attempts/cooldown ở file mới `data/liq-scan-main-kill-sweep-binance.json`; event execution fields và `binanceExecution` là optional nên consumer cũ có thể bỏ qua. Không migrate/backfill/rewrite fill, signal, Discord state, order hay protection cũ.

### 2026-09-18 — LiqScan Top 400 chỉ gửi khi vừa quét hết MAIN KILL

- Version scanner `LIQSCAN_MAIN_KILL_SWEEP_BACKGROUND_TOP400_V2_20260918`, event Discord `LIQSCAN_MAIN_KILL_SWEEP_DISCORD_V2_VOLUME_EMPHASIS_20260918`. Scheduler vẫn chạy mặc định mỗi 30 giây, xếp tối đa 400 perpetual USDT theo quote-volume; score inclusive `>=65` nay **chỉ gác vùng**, không còn tự gửi mọi coin đạt ngưỡng. Warm-up missing-only giữ 60 nến 15m, batch3/cách2 giây, retry phần thiếu sau5 phút; lượt scan bình thường không gọi REST từng coin.
- Dữ liệu causal trước alert: snapshot/tick Binance tuổi `<=90 giây`, mark, OHLCV nến 15m live và ít nhất 60 nến liên tục, `computeHeatmapData` + `buildLiqScanSnapshot`. Khi mark còn dưới MAIN KILL phía trên hoặc trên MAIN KILL phía dưới, tracker đóng băng đúng `low/high`, điểm lệch và mark làm baseline; lần quan sát đầu chỉ gác vùng và lưu đỉnh/đáy live hiện có, nên không replay râu đã xảy ra trước startup.
- Điều kiện phân loại: UPPER chỉ phát khi một đỉnh mới quan sát **xuyên hết mép high** của vùng đã gác; LOWER chỉ phát khi một đáy mới xuyên hết mép low. Đi vào giữa vùng chưa phát. Vùng gác hết hạn sau30 phút; sau gửi cooldown15 phút và state Discord dedupe theo symbol+hướng+đúng biên vùng. Score có thể đổi sau lúc gác nhưng event vẫn dựa vào vùng causal đã đóng băng. Payload phân biệt `quét thanh khoản short/long` và nói rõ quét xong không phải xác nhận đảo chiều.
- Tier hiển thị dùng `mainKillZone.score` đã có tại lúc gác như **thanh khoản ước tính proxy Binance 15m**, không gọi là volume thanh lý thực tế: `THƯỜNG <500K`, `RÕ >=500K`, `LỚN >=2M`, `RẤT LỚN >=10M`, `SIÊU LỚN >=50M USDT`. Tier càng cao thì title có thêm cảnh báo, thanh cường độ dài hơn và màu embed sáng hơn; payload luôn ghi cả số tuyệt đối và `%` so với tổng thanh khoản cùng phía. Mọi tier đều được gửi Discord, nhưng chỉ `SIÊU LỚN >=50M` là gate executor đảo chiều mô tả ở mục mới phía trên.
- Thống kê runtime gồm selected/processed/active(score>=65)/swept/sent/failed/missing/stale/invalid; không tạo paper, fill, W/L, WR, PF, AvgROE hay PnL. Đây là Discord operational event, không phải label/card hiệu suất, nên không thêm checkbox/matcher `WHITELIST`; policy mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%` của route cũ không đổi.
- Ảnh hưởng Binance/entry/size/SL/TP: tier dưới 50M vẫn không có; tier đỏ `SIÊU LỚN` gọi executor đảo chiều exact theo mục phía trên. Route explicit high-score trên trang coin và rule Binance strict `>80` hiện hữu không đổi.
- Tương thích JSON: dedupe mới dùng file additive `data/liq-scan-main-kill-sweep-background-discord.json`; file `liq-scan-high-score-background-discord.json` cũ được giữ nhưng không còn điều khiển scanner V2. Tracker gác vùng là memory-only; sau restart bắt buộc lấy baseline mới, không migrate/backfill/rewrite/replay state cũ. Field V2 `zone.liquidity`, `sideLiquidity`, `zoneSharePct`, `volumeTier`, `backgroundCandle` và stats `swept` đều additive; consumer cũ có thể bỏ qua, không migrate/backfill/rewrite lịch sử.

### 2026-09-18 — LiqScan Discord từ 65, Binance giữ strict trên 80

- Version `LIQ_SCAN_SCORE65_DISCORD_BINANCE80_V3_20260918`. Dữ liệu causal không đổi: snapshot `/coin-level-analysis` còn mới `<=90 giây`, symbol, mark Binance, `imbalanceScore` (fallback `sweepProbabilityPct`), `dominantSide`, liquidity proxy trên/dưới và `evaluatedAt`; không dùng outcome/PnL/dữ liệu sau entry. `ABOVE` vẫn ánh xạ LONG theo lực hút phía trên, `BELOW` vẫn ánh xạ SHORT theo lực hút phía dưới; điểm lệch không phải xác suất thắng.
- Discord chuyên dụng nay active khi **`score >=65/100`** (bao gồm đúng 65), reset episode khi `<65`, gửi lần đầu đạt ngưỡng hoặc khi đổi dominant side. Nếu cùng hướng tăng tiếp từ tầng 65–80 sang **strict `>80`**, gửi đúng một alert nâng tầng để hiện trạng thái Binance; tăng điểm tiếp không spam. Payload ghi rõ tầng Discord và tầng Binance riêng.
- Binance **không hạ ngưỡng**: exact routes `LIQSCAN_HIGH_SCORE_ABOVE_LONG/LONG` và `LIQSCAN_HIGH_SCORE_BELOW_SHORT/SHORT` vẫn đòi `score >80`, cùng freshness, enabledAt, drift `<=0,5%`, no-position/no-entry-order, cooldown, margin/leverage/TP lưu trên controls và SL hiện hữu. Tín hiệu 65–80 không gọi executor, không thay entry/side/size/leverage/TP/SL, không sửa order/position cũ.
- Thống kê fill/close/PnL chỉ tiếp tục cho entry Binance strict `>80`; tầng Discord 65 không tạo card/cohort/Limit Paper/AvgROE hoặc WHITELIST mới. Policy checkbox card hiện hữu vẫn mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%`.
- JSON state cùng file được mở rộng additive bằng `discordNotified`/`binanceNotified`. State V2 thiếu field được suy ra từ `active` và score để không replay alert `>80` cũ; symbol V2 đang inactive có snapshot mới `>=65` được phép mở episode mới. Không migrate/backfill/rewrite fill/order/control lịch sử.

### 2026-09-18 — FIRST_PUMP_FLUSH_RECLAIM_LONG Discord màu cyan

- Version `EXTREME_SQUEEZE_FIRST_PUMP_FLUSH_LONG_V5_20260918`; exact kind/label `FIRST_PUMP_FLUSH_RECLAIM_LONG` / `FIRST_PUMP_FLUSH_RECLAIM_LONG_CLOSED`. Tín hiệu dùng chung webhook `EXTREME_SHORT_SQUEEZE_DISCORD_WEBHOOK_URL` với cảnh báo nến bơm hiện hữu nhưng embed **xanh cyan `0x06b6d4`**, khác vàng của bơm đang rủi ro và đỏ của reject/SHORT. Secret vẫn chỉ ở `.env`.
- Dữ liệu causal trước alert chỉ là chuỗi Binance Futures **5m đã đóng và liên tục** trong cache: 20 nến nền, ATR14, OHLC, quote-volume, taker-buy quote-volume nếu có, EMA13/EMA25, một nến impulse và nến hấp thụ cuối còn mới `<=90 giây`. Không dùng high/low xuất hiện sau nến xác nhận, CoinGlass, kết quả lệnh hay điểm đáy nhìn lại. Scanner dùng universe/cache hiện hữu, không thêm REST warm-up.
- Phân loại LONG: nền 20 nến có biên `<=3,5%`; impulse open→high `>=5%`, `>=8 ATR14`, quote-volume `>=100.000 USDT` và `>=10x median20`, phá prior high `>=1%`, đóng trên prior high và ở ít nhất 35% biên nến. Trong 1–2 nến kế tiếp, nhịp xả phải trả lại `40–80%`, low không thủng impulse-open quá `0,2%`, close ở ít nhất 65% biên, râu dưới `>=20%` trừ khi close-position `>=75%`, volume `>=3x median20`, close lấy lại max(midpoint/EMA13/EMA25), và taker-buy `>=50%` nếu có trừ khi strong-close `>=75%`. Alert trả vùng LONG sớm causal từ reclaim đến close, mốc an toàn hơn là 5m đóng trên high impulse, measured target và pivot vô hiệu; đây là vùng nghiên cứu, không phải cam kết entry/TP/SL.
- Thống kê runtime chỉ dùng processed/detected/sent/failed và Discord dedupe hiện hữu; event mới bị loại khỏi Limit Paper. Không tạo card/tier/cohort/AvgROE/PnL hay WHITELIST, vì vậy không có checkbox mới; policy card hiện hữu vẫn mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%`.
- **OBSERVE ONLY**: `binanceEligible=false`, không qua executor, không tác động entry/side/size/margin/leverage/DCA/TP/SL hay position hiện tại. JSON/state Discord tương thích additive qua kind/dedupe-key mới; file cũ vẫn đọc được, không migrate/backfill/replay alert BABY hoặc nến cũ. Event/version cũ đang chờ bị fail-closed bởi validator mới.

### 2026-09-17 — Bỏ quản lý TP/SL theo symbol trong đúng một vòng vị thế

- Versions đang chạy: controls `AUTO_ENTRY_CONTROLS_V13_POSITION_SCOPED_PROTECTION_EXCLUSIONS_20260917` và runtime `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V2_AUTO_RESET_ON_CLOSE_20260917`. Trang `/binance-auto-controls` nhận `AIN`, `AINUSDT` hoặc `AIN/USDT` rồi chuẩn hóa thành exact perpetual symbol `AINUSDT`. **Bỏ qua coin này** giữ ngoại lệ qua restart trong vòng vị thế hiện tại/kế tiếp; **Dùng lại tự động** gỡ ngay, còn runtime tự gỡ sau khi Binance xác nhận vòng vị thế kết thúc.
- Dữ liệu dùng trước entry và điều kiện phân loại tín hiệu **không đổi**. Danh sách chỉ đọc exact symbol người dùng nhập; reset chỉ dùng sự kiện close/reversal từ user data hoặc đối soát REST, sau đó xác minh lại Position Risk. Close giả/out-of-order hoặc giảm vị thế/DCA còn amount khác 0 không reset. One-way reversal được coi là vòng cũ đã đóng và vòng ngược mới bắt đầu. Không dùng nến, CoinGlass, outcome, PnL hay dữ liệu tương lai; đây không phải nhãn/tier/gate entry, nên MARKET/LIMIT entry vẫn qua master/route/rule cũ.
- Khi symbol đang bị bỏ qua, mọi đường protection tự động fail-safe trước write: full-fill/socket plan, `setTpSl`, TP/SL đính kèm entry, startup/missing TP, missing SL, pending Liq TP, Pump TP/SL, TP âm về entry, TP 12h, profit-lock/dời SL, break-even và **Fast Wave**. Existing TP/SL trên Binance không bị hủy/replace. Sau close đã xác minh, runtime xóa exclusion cùng protection plan/pending Liq TP của vòng cũ; lần entry sau trở lại TP/SL, dời SL và Fast Wave bình thường. Entry, side, size, margin và leverage không đổi.
- Thống kê fill/close, daily entry và realized PnL tiếp tục ghi theo route/lifecycle cũ; exclusion/reset không tạo W/L, WR, PF, AvgROE hay cohort mới. Không có label/card mới nên không nối checkbox WHITELIST; matcher runtime, mặc định OFF và policy chỉ hiện khi CLOSED `AvgROE >4%` giữ nguyên.
- JSON tương thích additive: `data/auto-entry-controls.json` vẫn dùng `protectionExclusions: string[]` và `protectionExclusionVersion`; V1/file cũ đọc nguyên danh sách, file thiếu field hiểu là `[]`, route/master/margin/leverage/TP/enabledAt cũ giữ nguyên. Reset close là một lần ghi state idempotent, normalize/dedupe/sort rồi bỏ đúng symbol; không migrate/rewrite/backfill fill, order, trade, snapshot hoặc protection lịch sử.

### 2026-09-16 — Pump/flush/reclaim V3: chỉ xả sâu gần nền, không đuổi sát đỉnh

- Version `PUMP_FLUSH_RECLAIM_BIDIRECTIONAL_DISCORD_V3_DEEP_BASE_GATES_20260916`; webhook chuyên dùng đọc từ `PUMP_FLUSH_RECLAIM_DISCORD_WEBHOOK_URL`, secret chỉ lưu trong `.env`. Scanner tái dùng cache WebSocket Binance cho tối đa 400 perpetual USDT theo quote-volume, không tự warm-up REST và không dùng CoinGlass để phân loại.
- Dữ liệu causal chỉ gồm chuỗi nến **15m đã đóng, liên tục** để nhận cụm impulse/reversal và chuỗi **5m đã đóng, liên tục** để xác nhận EMA/volume/taker. Nến live, cache thiếu/gap, 15m cũ quá 25 phút hoặc 5m xác nhận cũ quá 10 phút đều fail-closed; mark snapshot chỉ là giá lúc phát hiển thị trên Discord, không tham gia gate.
- Phân loại LONG `PUMP_FLUSH_RECLAIM_15M_LONG_READY`: 2–4 nến bơm, tối thiểu 2 nến xanh, biên `>=8%`, volume cực đại `>=1,5x` median. Mức mở nhịp không được cao hơn đáy context 96 nến 15m quá `60%`; trong tối đa 6 nến phải xả lại **`65–95%`** nhịp bơm, volume nến đảo `>=1,5x`, close thoát đáy nến `>=55%` và có râu dưới `>=25%` hoặc close thoát `>=70%`. Sau đó 5m phải giữ pivot, tăng `>=2%`, đóng trên EMA13/EMA25/midpoint, volume `>=1,2x`, taker-buy `>=52%` nếu có, cách reclaim `<=2%`, còn thấp hơn đỉnh bơm `>=2%` và chưa hồi quá `80%` biên xả.
- Nhánh SHORT `DUMP_SQUEEZE_REJECT_15M_SHORT_READY` đối xứng: mức mở nhịp không thấp hơn đỉnh context quá `60%`; bật lại `65–95%`, nến phân phối phải đóng thoát đỉnh đủ `55%` và có râu trên `>=25%` hoặc close thoát `>=70%`; 5m giữ pivot đỉnh, giảm `>=2%`, dưới EMA/midpoint, volume `>=1,2x`, taker-buy `<=48%` nếu có, cách reject `<=2%`, còn cao hơn đáy sập `>=2%` và chưa quay lại quá `80%` biên bật. Hai nhánh dedupe theo symbol+label trong 6 giờ.
- BRUSDT trong ảnh bị loại bỏ theo V3 vì retrace chỉ `49,6%`, nến đảo close thoát cực trị chỉ `20,2%`, giá lúc phát cách reclaim `3,17%` và chỉ còn cách đỉnh khoảng `0,67%`; ngoài ra gate context chặn nhịp đã tăng quá `60%` từ đáy nền. Volume rất lớn không còn đủ để tự nó xác nhận hấp thụ nếu close yếu.
- Discord giữ timeline `Asia/Ho_Chi_Minh`: LONG gồm khung bơm, nến 15m chứa đỉnh, khung xả/giảm và 5m xác nhận; SHORT hiển thị đối xứng. Payload V3 thêm độ mở rộng từ context low/high, khoảng cách tới đỉnh/đáy impulse và phần trăm đã hồi lại; chỉ nói khung nến chứa high/low, không suy diễn tick-time nội nến.
- Đây là hai nhãn cảnh báo **OBSERVE ONLY**: không nối `autoEntryControls`, không Binance entry, size, leverage, DCA, TP hay SL, và không sửa position/order hiện có. Thống kê hiện chỉ là operational log `processed/detected/sent/failed`; không tính W/L, PnL, AvgROE, không tạo card thống kê hay checkbox WHITELIST. Nhãn LONG có suffix `15M` để không lẫn với card Liquid Flow `PUMP_FLUSH_RECLAIM_LONG_READY` đang tồn tại.
- JSON tương thích additive: event thêm optional `preImpulseExtensionPct`, `contextExtremePrice`, `distanceFromImpulseExtremePct`, `recoveryTowardExtremePct`; state dedupe vẫn là `data/pump-flush-reclaim-discord.json`. Dedupe key không đổi nên reload V3 không replay alert V1/V2; không migrate/rewrite/backfill state, fill, signal hoặc controls cũ.

### 2026-09-16 — LIQSCAN_HIGH_SCORE_MARKET_EDITABLE_ENTRY_V1_20260916

- Versions đang chạy: Discord/signal `LIQ_SCAN_HIGH_SCORE_DISCORD_BINANCE_V2_20260916`, executor `LIQ_SCAN_HIGH_SCORE_MARKET_EDITABLE_ENTRY_V1_20260916`, settings catalog `OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V3_LIQSCAN_HIGH_SCORE_20260916`, controls `AUTO_ENTRY_CONTROLS_V11_LIQSCAN_HIGH_SCORE_20260916`, policy `LIVE_CARD_LIQ_FLOW_LIQSCAN_HIGH_SCORE_V27_20260916` và SHORT-SL exemption `BINANCE_BOT_SHORT_TP_ONLY_LIQSCAN_EXEMPT_V4_20260916`.
- Dữ liệu causal trước entry chỉ là snapshot `/coin-level-analysis` còn mới tối đa 90 giây: symbol, mark Binance, `imbalanceScore`, `dominantSide`, liquidity proxy trên/dưới và `evaluatedAt`; không dùng outcome, PnL hoặc dữ liệu sau entry. Ngưỡng là **strict `score >80`**; đúng 80 chỉ reset episode. `ABOVE` phân loại exact route `LIQSCAN_HIGH_SCORE_ABOVE_LONG/LONG`, `BELOW` phân loại `LIQSCAN_HIGH_SCORE_BELOW_SHORT/SHORT`. Điểm lệch không được mô tả là xác suất thắng và không cần biến phần recommendation/retest trên trang thành đồng thuận.
- Discord dùng biến riêng `LIQ_SCAN_HIGH_SCORE_DISCORD_WEBHOOK_URL` (secret chỉ ở `.env`). Một symbol chỉ phát khi lần đầu vượt 80 sau trạng thái `<=80`, hoặc khi đổi `dominantSide` trong lúc còn trên 80. State Discord cũ được đọc tiếp; episode đã active trước reload không replay. Payload ghi giá lúc phát, hướng LiqScan và trạng thái Binance thật/OFF/error thay vì dòng OBSERVE ONLY tuyệt đối.
- Ảnh hưởng Binance chỉ cho event mới sau `enabledAt`, master và exact route ON: MARKET mặc định `5 USDT margin ×5` (notional 25 USDT), TP `+15% ROE`; LONG dùng SL `−20% ROE`, SHORT dùng SL `−30% ROE`, tất cả neo average full-fill. Mark phải lệch giá phát tối đa 0,5%; không position hoặc entry-order cùng symbol; cooldown symbol 4 giờ, deterministic client ID và durable attempt chặn DCA/replay/double-submit. Discord lỗi sau submit không tạo order thứ hai; lệnh/vị thế/TP/SL đang có không bị sửa.
- Thống kê daily controls và fill/close audit dùng exact `source=liqscan-high-score`, `stream=coin-level-analysis`, label và side nói trên; PnL là realized net theo cơ chế audit hiện hữu, không giả lập win rate. Đây là hai route executor/audit, không tạo card hiệu suất Liquid Flow mới nên không thêm WHITELIST; nếu sau này tạo card thì checkbox phải mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%`.
- JSON tương thích cộng thêm hai route vào `auto-entry-controls.json` mà không đổi key cũ; catalog seed OFF nhưng theo yêu cầu ngày 2026-09-16 cả LONG và SHORT đã được bật rõ ràng sau khi kiểm tra master, mỗi route có input margin/leverage/TP riêng. `data/liq-scan-high-score-binance.json` mới giữ attempts/cooldown; state Discord cũ giữ schema symbols và được nâng version khi ghi. JSON thiếu field mới fail-closed, không migrate/rewrite/backfill fills, signal, order hoặc protection cũ.

### 2026-09-15 — SHORT vào tay mới dùng SL −30% ROE

- Version đang chạy: `MANUAL_SHORT_NEW_FILL_SL30_V1_20260915`; reconciliation khi có SELL bổ sung trước lúc xác nhận SL đầu tiên dùng `MANUAL_SHORT_SL30_PENDING_DCA_FIX_V1_20260915`. Rule thay thế SL −50% cho **lệnh SHORT thủ công mới**, không đổi detector/nhãn/tier/card/WHITELIST và không biến luồng OBSERVE ONLY thành entry.
- Dữ liệu causal trước protection gồm cutoff cố định `MANUAL_SHORT_SL30_ACTIVATED_AT=2026-09-15T03:55:29.563Z`, full-fill Binance đã xác minh, thời gian tạo order, side/type/reduceOnly/closePosition, quantity, average fill, position side, entry position và leverage. Chỉ phân loại manual khi exact source thuộc `manual`, `orders-manual`, `binance-manual-socket`, `liquid-flow-v2-manual`, `pump-manual-order`; loại client/order có dấu nguồn bot và fail-closed nếu lifecycle không chứng minh được.
- SL tính từ average full-fill của order mở mới: khoảng cách giá `0,30 / leverage`; SHORT dùng `SL = entry × (1 + 0,30/leverage)`. Ví dụ 5x là +6% giá, 10x là +3% giá, tương ứng khoảng −30% ROE trước phí/slippage. TP, size và leverage của lệnh giữ nguyên. Nếu SELL bổ sung khớp trong lúc SL đầu tiên còn pending, chỉ giữ anchor fill đầu sau khi lịch sử trade chứng minh toàn SELL, không realized PnL/đóng/đảo chiều; không rebase SL theo DCA.
- Ảnh hưởng Binance chỉ cho order SHORT thủ công vừa được **tạo và full-fill sau cutoff mới**. Order/vị thế đang mở, order tạo trước cutoff, DCA của vị thế cũ, LONG, bot entry và TP/SL hiện hữu không bị sửa, hủy hoặc backfill. Trước đặt và sau đặt đều xác minh position/open protection; có SL người dùng rồi thì giữ nguyên, sàn không xác nhận thì để pending/retry thay vì báo thành công.
- Thống kê/audit tiếp tục ghi fill/close thật theo source/order/lifecycle hiện hữu; thay đổi này không tạo cohort hoặc công thức PnL mới. Test mock kiểm tra 1x–125x, đúng −30% ROE, cutoff, loại order cũ/bot/DCA sai, giữ SL đang có, race position và đường `setTpSl`; không gửi order thật.
- JSON cũ vẫn đọc được vì field durable `manualShortSl50` được giữ làm tên legacy. Chỉ policy mang version SL30 mới được recover/apply; policy SL50 cũ không match và không thể sửa vị thế hiện tại. Không migrate/rewrite fills, CSV hoặc state cũ.

### 2026-09-14 — RETEST_SHORT_READY chỉ sau nhịp hồi lớn rồi giảm lại

- Versions đang chạy: detector `HTF_DEEP_DUMP_BASE_RECLAIM_LONG_SHORT_V4_SHORT_LARGE_REBOUND_20260914`, universe `HTF_DEEP_BASE_LONG_SHORT_UNIVERSE_V4_SHORT_LARGE_REBOUND_20260914`, Liquid Flow `LIQUID_HEATMAP_FLOW_V2_HTF_SHORT_LARGE_REBOUND_V30_20260914`, Discord `HTF_DEEP_DUMP_BASE_15M_LONG_SHORT_BINANCE_V4_SHORT_LARGE_REBOUND_20260914` và executor `HTF_DEEP_BASE_RETEST_LONG_SHORT_MARKET_5USDT_5X_V3_SHORT_LARGE_REBOUND_20260914`. Mục này thay thế riêng điều kiện SHORT READY của V3; nhánh LONG không đổi.
- Dữ liệu causal trước entry chỉ dùng closed 1h/4h để nhận cú bơm + đỉnh nền, closed 15m để nhận breakdown/retest và tối đa ba closed 5m sau EARLY cho xác nhận nhanh. Không dùng nến đang chạy, giá sau entry, kết quả PnL, CoinGlass hoặc dữ liệu tương lai. Chuỗi SHORT bắt buộc theo đúng thứ tự thời gian: đáy cục bộ -> ít nhất một nến hồi xanh -> đỉnh hồi chạm lại vùng neckline/EMA13 -> nến xác nhận giảm lại.
- `RETEST_SHORT_READY` chỉ được phát khi **sau nến EARLY breakdown**, trong tối đa 12 nến 15m có nhịp hồi từ low lên peak `>=1,5%` **và** `>=1,25 ATR15m`, peak tới vùng retest với tolerance `0,5%`; từ peak tới close xác nhận phải giảm lại `>=1%` **và** `>=0,75 ATR15m`. Sau đó vẫn phải đạt các gate cũ: không phá đỉnh nền, chạm vùng, không xuyên vô hiệu, nến đóng đỏ dưới neckline/EMA13. Nhịp hồi trước EARLY không được tính; thiếu bất kỳ số đo hồi/fade nào thì Discord READY và Binance đều fail-closed, chỉ còn `EARLY_SHORT_WATCH` quan sát.
- Đối chiếu causal bốn fill thật gần nhất của exact label: BSB, MTL đã đóng thắng; TNSR đã đóng lỗ; ZRX còn mở, nên chưa đủ mẫu để tuyên bố win rate. Replay dữ liệu public Binance tại đúng close tín hiệu với rule mới: BSB còn READY (hồi `4,12%`, `3,23 ATR`; fade `1,70%`, `1,39 ATR`), MTL/ZRX/TNSR chỉ còn EARLY WATCH. Đây là kiểm tra cấu trúc trên mẫu nhỏ, không phải backtest tối ưu hay đảm bảo lợi nhuận.
- Ảnh hưởng Binance chỉ cho tín hiệu SHORT mới sau reload và khi master + exact route `htf-deep-base-ready / htf-deep-base-15m / RETEST_SHORT_READY / SHORT` đang ON. Size vẫn `5 USDT margin x5`, TP `+15% ROE`, SL `-30% ROE`, tuổi `<=90 giây`, drift `<=0,5%`, no-position/no-open-entry-order, cooldown/dedupe giữ nguyên. Không DCA, không sửa ZRX/position/TP/SL đang mở và không replay tín hiệu cũ. Route LONG và trạng thái công tắc không bị đổi.
- Thống kê/audit tiếp tục dùng exact source/stream/label/side và PnL fill/close thật; reason mới ghi thêm rebound/fade để hậu kiểm. Không tạo nhãn/card mới nên không thêm checkbox WHITELIST; policy card hiện hữu vẫn mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%`.
- JSON tương thích cộng thêm optional `shortReboundLow/At`, `shortReboundHigh/At`, `shortReboundBars`, `shortReboundPct`, `shortReboundAtrMultiple`, `shortFadePct`, `shortFadeAtrMultiple`. State/snapshot cũ vẫn đọc được nhưng SHORT READY thiếu các field đo lường không được cấp quyền Discord READY/Binance; không migrate, rewrite, backfill fills/CSV hay order cũ.

### 2026-09-13 — HTF deep base xác nhận sớm 5m cho nguồn 1h và 4h

- Versions đang chạy: detector `HTF_DEEP_DUMP_BASE_RECLAIM_LONG_SHORT_V3_FAST_5M_1H_4H_20260913`, universe `HTF_DEEP_BASE_LONG_SHORT_UNIVERSE_V3_FAST_5M_20260913`, Liquid Flow `LIQUID_HEATMAP_FLOW_V2_HTF_DEEP_BASE_FAST_5M_V29_20260913`, Discord `HTF_DEEP_DUMP_BASE_15M_LONG_SHORT_BINANCE_V3_FAST_5M_20260913` và executor `HTF_DEEP_BASE_RETEST_LONG_SHORT_MARKET_5USDT_5X_V2_FAST_5M_20260913`. Cả cú sập tạo đáy LONG và cú bơm tạo đỉnh SHORT đều chạy riêng trên nguồn cấu trúc `1h` và `4h`; Discord ghi rõ nguồn nào đã khớp.
- Dữ liệu causal trước entry vẫn bắt buộc chuỗi nến Binance đã đóng/liên tục: 1h hoặc 4h tạo shock + nền, nến 15m đóng reclaim/breakdown đường cổ và EMA13 tạo EARLY; nhánh mới chỉ nhìn tối đa ba nến 5m **đã đóng sau EARLY**. Nến 5m đang chạy, cache khuyết, gap, dữ liệu tương lai/stale, CoinGlass và kết quả lệnh không được dùng. Cache 5m là optional, chỉ tái sử dụng cache WebSocket/Market Breadth chung và không tạo lượt warm-up REST riêng; thiếu nó không làm chết nhánh READY 15m cũ.
- Phân loại sớm: trong ba nến 5m sau EARLY, nến 5m mới nhất phải chạm vùng giữa neckline/EMA13 với tolerance `0,3%`, không xuyên vùng quá `0,25 ATR15m`, không phá lại đáy nền (LONG) hoặc đỉnh nền (SHORT), rồi đóng xanh giữ trên vùng cho LONG hoặc đóng đỏ bị từ chối dưới vùng cho SHORT. Khi đạt, vẫn phát exact label hiện hữu `RETEST_LONG_READY` hoặc `RETEST_SHORT_READY`, thêm `confirmationInterval=5m`; nếu không đạt thì chỉ giữ EARLY OBSERVE ONLY và chờ retest 15m cũ trong tối đa tám nến.
- Thống kê/audit tiếp tục gộp theo exact source/stream/label/side hiện hữu; `signalCombo` thêm khung nguồn `1h|4h` và confirmation `5m|15m` để có thể tách hậu kiểm mà không tạo card/cohort mới. Không có nhãn/card mới nên không thêm checkbox WHITELIST; các checkbox hiệu suất hiện hữu vẫn mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%`.
- Ảnh hưởng Binance chỉ với READY mới và chỉ khi master + đúng công tắc `RETEST_LONG_READY/LONG` hoặc `RETEST_SHORT_READY/SHORT` hiện hữu đang ON. Nhánh 5m dùng cùng MARKET `5 USDT margin ×5`, TP `+15% ROE`, SL `−30% ROE`, giới hạn tuổi executor `<=90 giây`, drift `<=0,5%`, cooldown/no-position/no-open-entry-order và dedupe episode như nhánh 15m. EARLY 15m vẫn không đặt lệnh; không bật/tắt công tắc, không DCA và không sửa position/TP/SL đang có.
- Tương thích JSON cộng thêm optional `confirmationInterval`, `fastConfirmation`, `retestBars5mAfterEarly` và `bars.m5`; JSON/state cũ thiếu các field này được hiểu là xác nhận 15m. Dedupe key label/episode giữ nguyên nên READY 15m đến sau FAST READY không tạo lệnh thứ hai. Không migrate, rewrite, backfill hoặc replay fills/orders/Discord cũ. Tests dùng fixture 1h+4h, LONG+SHORT, forming-candle rejection, optional-cache fallback và mock Binance/Discord; không gửi lệnh/webhook thật.

### 2026-09-13 — Coin Horizon chuyển hướng: hai route Binance LONG/SHORT thật

- Versions: `COIN_HORIZON_SWEEP_TRANSITION_LONG_SHORT_MARKET_V1_20260913`, controls
  `AUTO_ENTRY_CONTROLS_V8_HORIZON_LONG_SHORT_20260913`, policy
  `LIVE_CARD_LIQ_FLOW_COINGLASS_PUMP_DUMP_PPKS_EXTREME_HTF_HYBRID_HORIZON_V24_20260913`,
  Discord `COIN_HORIZON_SWEEP_TRANSITION_DISCORD_V2_BINANCE_STATUS_20260913` và
  SHORT-SL policy `BINANCE_BOT_SHORT_TP_ONLY_HTF_HORIZON_EXEMPT_V3_20260913`.
- Hai matcher/runtime key độc lập dùng nhãn horizon hiện hữu, không tạo nhãn phân loại
  mới: `coin-horizon-sweep-transition / coin-horizon-4h8h12h / UPPER / LONG` và
  `... / LOWER / SHORT`. Cả hai checkbox Binance trong nhóm "Các luồng khác" mặc định
  **OFF**. UPPER chuyển từ NEUTRAL/LOWER => LONG MARKET; LOWER chuyển từ
  NEUTRAL/UPPER => SHORT MARKET. Cả ba scenario 4h/8h/12h phải đồng hướng chính xác.
- Dữ liệu causal trước entry: snapshot coin-level `generatedAt` <=90 giây và sau
  `enabledAt`; nến đóng 1h/4h phải fresh theo horizon V1; CoinGlass range
  24h/12h/48h phải <=20 phút. Lần đầu sau bật hoặc sau gap >20 phút chỉ ghi baseline;
  timestamp cũ/lặp không replay. Phạm vi chỉ gồm coin đang được pipeline Bản đồ giá
  phân tích, không tự tạo scanner 400 coin mới.
- Entry cố định **5 USDT ký quỹ ×5 = 25 USDT notional**. Trước submit phải còn master
  ON, đúng route ON cùng `enabledAt`, runtime orderEnabled và không dry-run; mark lệch
  anchor tối đa0,5%, không có position/non-reduce open order cùng coin, cooldown cùng
  symbol4giờ. State hỏng fail-closed; ghi `SUBMITTING` atomic trước API để không gửi
  trùng khi timeout/restart. Không DCA và không replay alert cũ.
- TP do máy chọn từ snapshot causal: LONG dùng `bandLow` gần nhất phía trên, SHORT dùng
  `bandHigh` gần nhất phía dưới; chỉ lifecycle FRESH/APPROACHING/UNTRACKED,
  attraction>0 và range24h/12h/48h. Không dùng cận ATR làm TP. Chỉ vào nếu TP đúng phía
  và **R:R >=1** so với SL. Thiếu vùng hoặc R:R<1 => bỏ lệnh.
- SL **−25% ROE** cho cả LONG/SHORT, tương đương khoảng5% giá ở 5x. Khoảng cách TP/SL
  được neo lại từ giá full-fill thực tế; TP CONTRACT_PRICE, SL MARK_PRICE. SHORT của
  source này được miễn suppression TP-only để giữ đúng SL25. Route không sửa vị thế,
  TP hoặc SL đang mở; chỉ áp dụng entry mới sau khi người dùng bật.
- Discord vẫn gửi transition hai chiều và ghi rõ kết quả executor (đã gửi hoặc lý do
  không gửi), không còn dòng OBSERVE ONLY tuyệt đối. Discord alert không tự cấp quyền:
  route OFF/master OFF vẫn không gửi Binance. Không gửi webhook/order thật trong test.
- Thống kê dùng audit fill/close Binance hiện hữu trên controls: entry thật trong ngày,
  vị thế còn mở/đóng và net realized PnL theo đúng runtime key; không đếm DCA. Không
  thêm card/cohort/nhãn thống kê mới nên không thêm checkbox WHITELIST hiệu suất;
  policy chỉ hiện WHITELIST khi CLOSED AvgROE>4% của các card hiện hữu không đổi.
- JSON tương thích cộng thêm hai route mặc định OFF và state durable mới
  `data/coin-horizon-sweep-binance.json`; controls/master/route cũ giữ nguyên. Field
  legacy `horizonSweepDraft` nếu còn trong JSON được bỏ qua, không cấp quyền và không
  cần migration. Không backfill/rewrite fills hoặc CSV cũ. Unit/headless UI tests dùng
  fixture/mocks kiểm tra symmetry, authorization không giả mạo, TP/SL, OFF mặc định,
  route độc lập, no-replay/restart/dedupe và corrupt-state fail-closed.

### 2026-09-13 — Market Shock / EMA99 breadth V2: giảm nhiễu và tách nghĩa cảnh báo

- Versions đang chạy: `MARKET_BREADTH_SHOCK_5M_V2_20260913`,
  `EMA99_MARKET_BREADTH_15M_V2_20260913`, helper `BREADTH_ALERT_STABILITY_V2_20260913`.
  Mục này thay thế rule persistence/màu của hai aggregate breadth V1 bên dưới.
  Kiểm tra log: 16:16 là 23/400 coin từ dưới tiến gần EMA99 (71,9% chỉ trong nhóm
  gần EMA), không phải dự báo thị trường tăng. 16:25 có 255/400 coin giảm >=0,30%,
  38 coin giảm mạnh, taker-buy 36,1%; cảnh báo xả là phép đo khác và có cơ sở.
- Dữ liệu causal trước **alert**, không có entry: giữ top tối đa 400 USDT theo quote
  volume. Shock dùng OHLC/flow/volume 5m cache, mỗi coin phải có WS tick <=45s;
  thiếu tick/giá mới thì bỏ coin. EMA99 dùng >=100 nến 15m đóng liên tục + **last
  price live 5m cùng nguồn Shock**, không dùng mark REST snapshot cũ. Chỉ tính coverage
  EMA khi chuỗi nến và giá đều hợp lệ. Không gọi thêm REST/Binance order API.
- Giữ điều kiện score/breadth/near-ATR/tiến gần của V1, nhưng không phát ngay chỉ vì
  score >=90 hay EMA DANGER. Cùng hướng và severity phải liên tục >=60s (Shock),
  >=90s (EMA), ít nhất 2 snapshot khác timestamp. Gap quét >60s, mất candidate,
  snapshot quá 45s hoặc tương lai reset xác nhận; đọc lại cùng timestamp không tính.
  Đổi sang hướng đối diện trong 30 phút cần cùng hướng mới >=180s. Notifier kiểm
  tra lại với lần gửi đã lưu để restart không bỏ qua chống đảo hướng.
- Ngoại lệ cảnh báo khẩn **chỉ Shock**, không phải entry: DANGER score >=95,
  strong-share >=20%, dominance >=80%, directional-taker >=60%, volume-share >=10%
  cùng duy trì >=30s mới bỏ qua thời gian chờ thường/đổi hướng. Không có bypass tức thì.
- Bối cảnh 15m/30m tính từ close cuối hiện có tới close gần nhất **không sau** mốc
  now-15m/30m; sai số mốc tối đa 5m, chuỗi phải liên tục. Mỗi khung cần >=60 coin
  (hoặc minSamples cấu hình) và >=60% mẫu Shock; thiếu thì UNKNOWN, không suy diễn.
  UP/DOWN khi >=60% mẫu có return >=+0,10%/<=-0,10% và median cùng ngưỡng, còn lại
  MIXED. Nhịp ngắn ngược cả hai khung được ghi "hồi lên trong nhịp giảm" hoặc "giảm
  ngắn trong nhịp tăng"; hai khung khác nhau ghi chưa đồng thuận. Đây là mô tả quá
  khứ tới hiện tại, **không xác nhận đảo chiều**, không phải backtest hay xác suất thắng.
- Discord EMA đổi tiêu đề thành HỘI TỤ MẠNH/THEO DÕI HỘI TỤ: vàng khi tiếp cận từ dưới
  (kháng cự), xanh lam khi từ trên (hỗ trợ); không dùng DANGER đỏ trên UI. Exact keys
  FROM_BELOW/FROM_ABOVE + WATCH/DANGER nội bộ giữ nguyên. Nêu rõ số coin/mẫu tổng và
  dominance trong nhóm gần EMA; kèm bối cảnh 15–30m, thời gian duy trì và lần đổi nhịp.
  Shock giữ màu nguy hiểm bơm/xả, thêm bối cảnh thay vì diễn giải thành hướng trade.
- Dedupe cùng hướng/severity 30 phút (theo cấu hình hiện hữu); không gửi WATCH hạ cấp
  ngay sau DANGER cùng hướng trong cooldown. Khi hướng thực sự đổi và đã xác nhận,
  được gửi dù key hướng đó từng xuất hiện gần đây. Failed/429 không ghi nhận đã gửi,
  giữ backoff. Lưu tối đa 100 aggregate alert đã gửi thành công để audit.
- Thống kê: chỉ count/coverage/median/score/persistence tại alert; **không tạo label
  giao dịch, card thống kê, cohort paper, W/L/PnL/AvgROE mới**. Không thêm WHITELIST;
  matcher runtime, default OFF và policy chỉ hiện khi CLOSED AvgROE >4% giữ nguyên.
  Binance/entry/size/margin/leverage/SL/TP/order/position **không thay đổi**; toàn bộ
  hai luồng vẫn OBSERVE ONLY. Không sửa Limit Paper Lab hoặc EMA99 entry riêng lẻ.
- Tương thích JSON cũ: giữ file/hook và key `alerts[direction|severity]`; V1 chỉ có
  timestamps vẫn khôi phục được hướng/lần gửi/cooldown. Thêm optional `context`,
  `persistence`, `priceSource`, `lastAlert`, `recentAlerts` (tối đa100); không backfill
  event lịch sử. Notifier V2 không replay payload V1 chưa xác nhận. Không rewrite
  controls/trades/fills/CSV. Tests mock-only: market-breadth-shock,
  ema99-market-breadth-15m và breadth-alert-stability.

### 2026-09-12 — HTF_DEEP_BASE_RETEST_LONG_SHORT_MARKET_5USDT_5X_V1_20260912

- Versions đang chạy: detector `HTF_DEEP_DUMP_BASE_RECLAIM_LONG_SHORT_V2_20260912`, universe `HTF_DEEP_BASE_LONG_SHORT_UNIVERSE_V2_400_SYMBOLS_20260912`, Liquid Flow `LIQUID_HEATMAP_FLOW_V2_HTF_DEEP_BASE_LONG_SHORT_V28_20260912`, Discord `HTF_DEEP_DUMP_BASE_15M_LONG_SHORT_BINANCE_V2_20260912`, executor `HTF_DEEP_BASE_RETEST_LONG_SHORT_MARKET_5USDT_5X_V1_20260912`, policy `LIVE_CARD_LIQ_FLOW_COINGLASS_PUMP_DUMP_PPKS_EXTREME_HTF_BASE_V22_20260912`. Detector cũ chỉ LONG đã được mở rộng đối xứng; `EARLY_WATCH` và `EARLY_SHORT_WATCH` vẫn OBSERVE ONLY.
- Dữ liệu causal trước entry chỉ gồm chuỗi nến Binance **đã đóng và liên tục**: 1h/4h để tìm cú sập hoặc cú bơm phá biên, ATR14, true range, quote-volume, râu nến và nền sideway; 15m để tính EMA13, volume breakout/breakdown và retest sau đó. Không dùng nến đang chạy, giá tương lai, CoinGlass hay kết quả lệnh để phân loại.
- Phân loại LONG giữ nguyên: cú sập tối thiểu `max(5%, 2,5 ATR)`, phá đáy 24 nến `>=3%`, đạt ít nhất 2/3 xác nhận range `>=3 ATR`, volume `>=3x`, râu dưới `>=40%`; nền 1h/4h phải yên rồi 15m reclaim đường cổ+EMA13. Chỉ nến 15m bullish retest giữ lại vùng mới thành exact `RETEST_LONG_READY/LONG`. Case ngược SHORT dùng cùng ngưỡng theo hướng đối xứng: cú bơm phá đỉnh, râu trên, đỉnh sideway, 15m breakdown đường cổ+EMA13; chỉ nến 15m bearish retest bị từ chối dưới vùng mới thành exact `RETEST_SHORT_READY/SHORT`.
- Hai exact route controls là `htf-deep-base-ready / htf-deep-base-15m / RETEST_LONG_READY / LONG` và `... / RETEST_SHORT_READY / SHORT`. Checkbox được seed **mặc định OFF** đúng fail-closed; thao tác bật theo yêu cầu chỉ có hiệu lực từ `enabledAt`, không replay tín hiệu cũ. Đây là control Binance riêng, không được gọi là WHITELIST hiệu suất. Không thêm card thống kê; policy checkbox WHITELIST cho card hiện hữu vẫn mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%`.
- Ảnh hưởng Binance chỉ với READY mới đóng sau lúc bật và tuổi `<=90 giây`: MARKET `5 USDT margin ×5` (notional mục tiêu `25 USDT`), TP `+15% ROE` và SL `−30% ROE` neo lại theo average full-fill. Source mới được miễn TP-only qua `BINANCE_BOT_SHORT_TP_ONLY_HTF_EXEMPT_V2_20260912`, nên nhánh SHORT thực sự giữ SL này. Mark phải lệch giá tín hiệu `<=0,5%`; có vị thế hoặc entry order cùng symbol, cooldown 4 giờ, route/master/runtime OFF, size/policy sai hay trạng thái executor không chắc chắn đều không gửi thêm lệnh. Không DCA và không sửa vị thế/TP/SL đang mở.
- Thống kê dùng pipeline audit lệnh thật hiện hữu: submission/fill/close và CSV giữ exact source/stream/label/side để trang controls tính số entry, số đóng và realized PnL theo ngày. Chưa có mẫu đóng cho label SHORT mới nên không tuyên bố win rate/PF/AvgROE; test chỉ dùng mock, không gửi lệnh hay Discord thật.
- Discord cùng webhook HTF hiện hữu: READY LONG màu xanh, READY SHORT màu đỏ, WATCH màu vàng; nội dung ghi đúng kết quả executor (FILLED/OFF/BLOCKED...) thay vì gắn cứng OBSERVE ONLY. Tương thích JSON cũ theo kiểu additive: event thêm optional `eventHigh/baseHigh/pumpPct/upperWickShare/executionEligible/binanceEligible/shortReady`; snapshot cũ vẫn đọc/hiển thị được nhưng version/eligibility cũ không có quyền entry. State executor là file mới, không migrate/backfill/replay hay rewrite dữ liệu/order cũ.


### 2026-09-12 — LIQ_SCAN_HIGH_SCORE_OVER_80_DISCORD_V1_20260912

- Version `LIQ_SCAN_HIGH_SCORE_OVER_80_DISCORD_V1_20260912`. Pipeline `/coin-level-analysis` bổ sung cảnh báo Discord khi snapshot LiqScan hợp lệ có **điểm lệch >80/100**; đúng `80` không phát. Tin gửi chung webhook `COIN_HORIZON_SWEEP_TRANSITION_DISCORD_WEBHOOK_URL` theo yêu cầu, nhưng dùng state riêng `data/liq-scan-high-score-discord.json`; không ghi webhook secret vào source/tài liệu.
- Dữ liệu causal dùng trước cảnh báo: symbol/mark, `imbalanceScore` (fallback `sweepProbabilityPct`), `liquidityAbove`, `liquidityBelow`, bias, dominant side và `evaluatedAt` của snapshot Binance 15m proxy còn mới tối đa 90 giây; phần đối chiếu chỉ đọc CoinGlass mới và vùng/confirmation đã có trong cùng analysis. Snapshot stale, giá không hợp lệ, hướng khác ABOVE/BELOW hoặc điểm ngoài 0–100 fail-closed.
- Phân loại: `ABOVE` hiển thị ưu tiên quét trên/khả năng hút giá lên quét SHORT và màu xanh; `BELOW` hiển thị ưu tiên quét dưới/khả năng hút giá xuống quét LONG và màu đỏ. Payload ghi rõ điểm lệch không phải xác suất, lượng thanh khoản hai phía, hướng proxy/CoinGlass, vùng gần và lý do còn thiếu xác nhận. Đây là **OBSERVE ONLY**, không biến `>80` thành `MARKET_READY` hay xác suất thắng.
- Chống lặp theo episode: lần quan sát hợp lệ đầu tiên trên 80 gửi ngay; còn giữ trên 80 cùng dominant side thì không spam. Điểm phải hạ về `<=80` rồi vượt lại mới gửi episode mới; đổi ABOVE↔BELOW khi vẫn trên 80 cũng gửi. State atomic giữ qua restart; dữ liệu stale không được dùng để reset, Discord lỗi/429 không commit trạng thái để còn retry.
- Thống kê/WHITELIST không đổi: không tạo signal label, tier/card/paper trade, W/L, PF, AvgROE, Net PnL hay matcher checkbox. Policy WHITELIST hiện hữu tiếp tục mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%`.
- Ảnh hưởng Binance/entry/size/SL/TP: không có; notifier không gọi credential/executor, không mở/đóng/DCA, không đổi margin/leverage/entry/TP/SL và không chạm position/order hiện tại. Luồng LiqScan hai mức 40/70 và Coin Horizon transition vẫn hoạt động độc lập như cũ.
- Tương thích JSON cũ: state file mới additive, không migrate/rewrite/backfill/replay snapshot, Discord state, signal, trade hoặc order cũ. API/page giữ nguyên schema; JSON cũ không có state high-score sẽ tạo baseline theo lần phân tích mới và chỉ ghi các field telemetry. Test mock xác nhận ngưỡng strict, first alert, không spam, reset, đổi hướng, restart dedupe; không gửi Discord/lệnh thật trong test.

### 2026-09-12 — EMA99_MTF_CONTEXT_OBSERVE_V2_1H_4H_20260912

- Version `EMA99_MTF_CONTEXT_OBSERVE_V2_1H_4H_20260912`. Mọi cảnh báo EMA99 **5m** hiện hữu, cả LONG Pullback và SHORT Post-Pump Retest, được nối thêm một embed phân tích EMA13/25/99 của `1h` và `4h` rồi gửi vào chính webhook Discord 5m `POST_PUMP_EMA99_DISCORD_WEBHOOK_URL`. Kênh 15m vẫn được route riêng như cũ và chỉ hiển thị phần 5m/15m; không tạo loại tín hiệu, stage, tier, card hay webhook mới.
- Dữ liệu chỉ dùng trước/tại mốc cảnh báo: tối đa 240 nến cache, chỉ nhận nến có `closeTime <= candleCloseAt/confirmedAt`; 5m/15m cần 165 nến đóng liên tục, 1h/4h cần 105 nến đóng liên tục. Nếu đúng coin vừa có event 5m còn thiếu hoặc stale, runtime chỉ nạp 120 nến 1h/4h cho coin đó sau khi Binance runner hiện hữu đã xử lý, không warmup REST cả Top 400 và không để bước hiển thị HTF trì hoãn quyết định entry.
- Phân tích HTF: mỗi khung ghi giá đóng so với EMA99, thứ tự EMA13/25/99, giao cắt EMA13/25, và độ dốc EMA99 qua 3 nến đã đóng. Khung là `BULLISH` khi giá trên EMA99 và EMA99 dốc lên, `BEARISH` khi giá dưới EMA99 và EMA99 dốc xuống, còn lại `MIXED`; phần tổng hợp ghi 1h+4h đồng thuận tăng/giảm, nghiêng một phần, xung đột hoặc thiếu dữ liệu, đồng thời nói rõ đồng/ngược hướng với side của cảnh báo. Đây chỉ là bối cảnh quan sát, không phải xác suất thắng hay gate.
- Thống kê/WHITELIST không đổi: giữ nguyên exact source/stream/label/side/timeframe, dedupe, fill/close CSV, W/L, PF, AvgROE và Net PnL. Không có nhãn/card mới nên không thêm matcher; policy WHITELIST mặc định OFF và chỉ hiện khi CLOSED `AvgROE > 4%` tiếp tục giữ nguyên.
- Ảnh hưởng Binance/entry/size/SL/TP: không đổi detector hoặc điều kiện phát; không bật/tắt route, không đổi MARKET, margin, leverage, cooldown, no-DCA, TP EMA99 `+15% ROE`, SL LONG `−20% ROE` hay SL SHORT `−30% ROE`; không chạm vị thế/order đang mở. Context 1h/4h được gắn sau kết quả runner để lỗi/thiếu HTF chỉ làm Discord ghi thiếu dữ liệu chứ không chặn lệnh.
- Tương thích JSON cũ: `emaContext` vẫn là field runtime cộng thêm; event/state cũ thiếu context vẫn render tin gốc và không bị migrate, rewrite, backfill hay replay. Context V1 cũ không được dùng để giả lập 1h/4h bằng giá hiện tại. Test dùng mock xác nhận không nhìn nến tương lai, 5m Discord có đủ bốn khung, 15m giữ hai khung, LONG/SHORT cùng có HTF, cache chỉ seed coin phát cảnh báo và không gửi Discord/lệnh Binance thật.

### 2026-09-11 — EXTREME_PEAK_ZONE_5M_SHORT_2USDT_5X_V1_20260911

- Version detector `EXTREME_SHORT_SQUEEZE_PEAK_ZONE_5M_SHORT_V4_20260911`, executor `EXTREME_PEAK_ZONE_5M_SHORT_2USDT_5X_V3_20260911`, policy `LIVE_CARD_LIQ_FLOW_COINGLASS_PUMP_DUMP_PPKS_EXTREME_PEAK5M_V21_20260911`. Nhãn route mới là `PEAK_ZONE_SHORT_WATCH/SHORT`; event Discord nội bộ là `PEAK_ZONE_SHORT_WATCH_LIVE` màu cam.
- Dữ liệu trước entry: nến Binance 5m đang chạy cùng 20 nến trước, ATR14, volume MA20, quote volume, rolling high/low/OHLC và websocket tick riêng symbol. Nến trước hết phải đạt spike gốc: high/open và high/close trước `>=8%`, thân open→high `>=4× ATR14`, volume `>=3× MA20`, quote volume `>=100.000 USDT`, vượt đỉnh 20 nến `>=1%`. Sau đó giá phải trả lại `15–25%` đoạn open→high, còn cách rolling high `<=2%`, râu trên `>=20%`, rolling high không tăng ít nhất `15 giây`, tick `<=30 giây`; higher high reset bộ đếm ổn định.
- Phân loại này là SHORT sớm gần đỉnh, khác `FOLLOW_TWO_SIDE_SWEEP`: không chờ xuyên đáy cũ. Chỉ 5m có `binanceEligible`; 15m vẫn OBSERVE ONLY. Trước submit còn kiểm tra event/generate `<=90 giây`, nến vẫn đang chạy, mark lệch giá đánh giá `<=0,5%`, enabledAt, không có position/entry order cùng symbol, cooldown 4 giờ và durable dedupe. Không khẳng định bắt đúng đỉnh tuyệt đối.
- Ảnh hưởng Binance cho entry mới: SHORT MARKET `$2 margin ×5` (notional `$10`), TP `+15% ROE` và SL `−30% ROE` neo average full-fill; không DCA và không sửa vị thế/order hiện tại. Route được seed mặc định OFF theo schema, sau đó bật riêng theo yêu cầu người dùng; cảnh báo/cây nến bắt đầu trước `enabledAt` không được replay thành lệnh.
- Thống kê fill/close đi qua audit CSV hiện hữu với exact source `extreme-short-squeeze`, label `PEAK_ZONE_SHORT_WATCH`, timeframe và reason causal; chưa có mẫu CLOSED nên không tuyên bố WR/PF/AvgROE. Không thêm card thống kê mới, vì vậy không thêm matcher WHITELIST; nếu sau này tạo card thì checkbox phải mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%`.
- Tương thích JSON cũ: thêm route controls/state dedupe theo key mới, không migrate/rewrite/backfill record cũ. Detector state rolling-high chỉ nằm trong RAM và khởi động lại sẽ chờ lại tối thiểu 15 giây; JSON thiếu route vẫn được seed OFF. Payload cũ không có capability/label exact bị policy chặn.

### 2026-09-11 — EMA99_TWO_SHORT_ROUTES_10X_V1_20260911

- Version runtime: `EMA99_ROUTE_LEVERAGE_OVERRIDES_V4_20260911`, builder `EMA99_ALL11_ROUTE_LEVERAGE_V2_20260911`. Chỉ hai exact route SHORT đổi sang `10x`: `NEAR_EMA_WATCH` ở `5m` (loại SKR vừa khớp) và `CLOSED_ABOVE_EMA_WATCH` ở `15m` (loại SYN vừa khớp). Cùng label ở timeframe còn lại vẫn `5x`; mọi route EMA99 khác không đổi.
- Dữ liệu trước entry và phân loại giữ nguyên: source `ema99-observe-only`, stream `ema99-retest`, exact label, side SHORT, timeframe trên event, nến đóng, `enabledAt`, tuổi `<=90s`, mark drift `<=0,5%`, vị thế/lệnh chờ và cooldown. Không dùng kết quả sau entry để cấp 10x; thay đổi leverage không làm tín hiệu dễ phát hơn.
- Thống kê vẫn gắn đúng source/label/timeframe và gộp theo fill/close hiện hữu; W/L, PF, AvgROE và Net PnL không đổi cách tính. Không thêm label/card/tier/WHITELIST; policy checkbox thống kê mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%` giữ nguyên.
- Ảnh hưởng Binance chỉ cho entry mới: margin đã lưu của hai route vẫn `$5`, leverage `10x`, notional `$50`. TP giữ `+15% ROE`, nên SHORT TP neo full-fill ở `fill × 0,985`; SL SHORT giữ `−30% ROE`, ở `fill × 1,03`. Runtime guard kiểm tra cả margin, leverage và notional trước submit. Không đổi/cancel vị thế, leverage, TP hoặc SL của SKR/SYN đang mở.
- Tương thích JSON cũ: không đổi route key/schema và không cần migrate; leverage tiếp tục là trường dẫn xuất từ exact label+timeframe, nên JSON cũ thiếu leverage vẫn đọc được. Không backfill/replay tín hiệu cũ; UI lấy leverage từ API thay vì ghi cứng `5x`.

### 2026-09-11 — EXTREME_PUMP_AND_LIVE_FOLLOW_5M_SHORT_1USDT_5X_V2_20260911

- Detector nâng thành `EXTREME_SHORT_SQUEEZE_CLOSED_AND_LIVE_FOLLOW_5M_SHORT_V3_20260911`. Hai nhánh 5m có quyền Binance: `EXTREME_PUMP_CLOSED` với nến spike đã đóng; và `FOLLOW_REJECTION_LIVE` khi trong 1–3 nến sau spike, nến đang chạy chưa tạo đỉnh cao hơn và giá đã trả lại `>=50%` đoạn open→high. Rule gốc của spike vẫn là pump open→high và high/close trước `>=8%`, thân tăng `>=4× ATR14`, volume `>=3× MA20`, quote volume `>=100.000 USDT`, vượt đỉnh 20 nến `>=1%`. 15m, `EXTREME_PUMP_LIVE`, `UPPER_REJECTION`, `TWO_SIDE_SWEEP`, `FOLLOW_REJECTION_CLOSED` và `FOLLOW_TWO_SIDE_SWEEP` vẫn OBSERVE ONLY.
- Dữ liệu trước entry gồm 20 nến baseline và ATR14 đều loại nến spike, quote volume của nến spike, giá đánh giá, retrace, `enabledAt`, tuổi event và mark Binance ngay trước gửi. Nhánh closed cần close sau enabledAt và tuổi `<=90s`; nhánh live chỉ xét nến follow có openTime sau enabledAt, websocket tick riêng symbol `<=30s`, đúng biên thời gian nến đang chạy và event tuổi `<=90s`. Cả hai yêu cầu mark lệch giá đánh giá `<=0,5%`; không dùng kết quả sau entry và không replay cảnh báo/cây live đã bắt đầu trước lúc bật.
- Ảnh hưởng Binance: hai route thật `EXTREME_PUMP_CLOSED/SHORT` và `FOLLOW_REJECTION_LIVE/SHORT` xuất hiện tách riêng trong `/binance-auto-controls`, seed mặc định OFF; route closed đã ON từ `2026-09-11T08:16:03.471Z`, route live đã ON từ `2026-09-11T08:32:50.728Z`, cùng master ON. Entry mới là SHORT MARKET `$1 margin ×5` (notional `$5`), không DCA khi đã có vị thế hoặc entry order, cooldown chung 4 giờ/symbol và dedupe ghi trước submit. TP `+15% ROE` và SL `−30% ROE` được neo lại theo average full-fill; không sửa position/order cũ.
- Thống kê fill/close dùng pipeline audit CSV hiện hữu với `signalSource=extreme-short-squeeze`, nhãn exact `EXTREME_PUMP_CLOSED` hoặc `FOLLOW_REJECTION_LIVE`, combo timeframe+stage; W/L/PF/AvgROE chưa có mẫu và không được dùng để khẳng định lợi thế. `FOLLOW_REJECTION_LIVE` là stage đã tồn tại trong Discord, không thêm card thống kê mới nên không thêm WHITELIST; policy checkbox thống kê mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%` giữ nguyên.
- Tương thích JSON cũ: thêm route controls và dùng chung state dedupe riêng `data/extreme-short-squeeze-binance.json`; state Discord cũ không migrate/backfill. JSON cũ thiếu `binanceEligible` fail-closed cho entry. Auto-policy V20 dùng capability không enumerable, payload giả chỉ sao chép field không thể mở lệnh.

### 2026-09-11 — EMA99_SELECTED_GOOD_ROUTES_MARGIN_5_V1_20260911

- Runtime tiếp tục dùng `AUTO_ENTRY_CONTROLS_V3_EMA99_PUMP_LEG_20260910`; chỉ tăng `marginUsdt` lên `$5` cho năm route EMA99 đang bật và đã được chọn từ audit hiệu suất: 5m LONG `TOUCH_EMA_LONG_WATCH`, 5m SHORT `NEAR_EMA_WATCH`, 15m LONG `RECLAIM_LONG_WATCH`, 15m SHORT `CLOSED_ABOVE_EMA_WATCH` và 15m SHORT `REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH`. Không bật thêm route; các route khác giữ nguyên enabled và size.
- Dữ liệu dùng trước entry và phân loại không đổi: detector vẫn dùng nến/cache EMA99, source/stream/label/side/interval, freshness, enabledAt và các gate hiện hữu. Việc chọn route dựa trên snapshot audit Binance thật đã gộp theo `close_group_id`, loại lệnh tay, position mở và cohort DCA khi so chất lượng; không dùng dữ liệu tương lai để phân loại một entry mới.
- Thống kê, nhãn và tier không đổi. Đây là thay đổi size cho entry Binance mới: ký quỹ `$5`, leverage giữ `5x` nên notional dự kiến `$25`; MARKET, TP `+15% ROE`, SL LONG `−20%`/SHORT `−30%`, cooldown và no-DCA guard giữ nguyên. Không sửa position, TP/SL hay order đang mở.
- Tương thích JSON cũ: chỉ cập nhật trường `marginUsdt` sẵn có trong `data/auto-entry-controls.json`; không đổi schema/key/migration, không backfill hoặc replay tín hiệu cũ. Không thêm label/card/matcher WHITELIST; policy mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%` giữ nguyên.

### 2026-09-11 — EMA99_5M_WINRATE70_SNAPSHOT_SELECTION_20260911

- Runtime settings tiếp tục dùng `AUTO_ENTRY_CONTROLS_V3_EMA99_PUMP_LEG_20260910`; đây là lựa chọn snapshot tại audit `2026-09-11T03:30:30.625Z`, chưa phải scheduler tự động thay đổi công tắc. Trên 5m, chỉ route executable có win rate nghiêm ngặt `>70%` trong cohort TP `+15% ROE`, position đã đóng và không DCA được bật: SHORT `NEAR_EMA_WATCH` (`2/2`) và LONG `TOUCH_EMA_LONG_WATCH` (`4/5`). Mọi route 5m catalog còn lại tắt; `FIRST_PUMP_NEAR_REJECT_SHORT_WATCH` vẫn OBSERVE ONLY/OFF.
- Dữ liệu trước entry và phân loại detector không đổi. Thống kê gộp fill theo `close_group_id`, loại lệnh tay, position đang mở và position có DCA; nhãn cũ `NEAR_REJECT_SHORT_WATCH` được gộp vào route kế nhiệm `REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH` vì code migration xác định cùng nhánh bơm hồi, cho `2/3=66,7%` nên OFF. Route không có mẫu đóng cũng OFF; ngưỡng đúng `70%` không đạt vì điều kiện là lớn hơn, không phải lớn hơn hoặc bằng.
- Ảnh hưởng Binance: master vẫn ON; boolean route 5m mới áp dụng cho entry mới sau `updatedAt=2026-09-11T03:57:27.070Z`. Không đóng/sửa lệnh hiện tại, không đổi margin (`NEAR_EMA_WATCH` $2,6; `TOUCH_EMA_LONG_WATCH` $2), leverage `5x`, TP `+15% ROE`, SL LONG `−20%`/SHORT `−30%`, cooldown hoặc no-DCA guard. Các route 15m giữ nguyên cấu hình lượt trước.
- Tương thích JSON cũ: chỉ cập nhật `enabled`/`enabledAt` trong `data/auto-entry-controls.json`; không đổi schema, key hay migration. Route legacy `ema99-near-reject-short/default` không thuộc catalog và đang OFF được giữ nguyên. Không backfill/replay. Không thêm label/card/matcher WHITELIST; policy mặc định OFF và điều kiện CLOSED AvgROE `>4%` giữ nguyên.

### 2026-09-11 — EMA99_AUTO_CONTROL_PERFORMANCE_SELECTION_20260911

- Runtime settings dùng schema/version hiện hữu `AUTO_ENTRY_CONTROLS_V3_EMA99_PUMP_LEG_20260910`; không thêm detector hay nhãn mới. Căn cứ audit Binance thật đã gộp fill theo `close_group_id`, loại lệnh tay và đối chiếu thêm cohort TP `+15% ROE` không DCA: bật 15m `CLOSED_ABOVE_EMA_WATCH/SHORT`, `RECLAIM_LONG_WATCH/LONG`, `REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH/SHORT`; tắt 15m `NEAR_EMA_LONG_WATCH/LONG`, `NEAR_RECLAIM_LONG_WATCH/LONG` và 5m `CLOSED_BELOW_EMA_LONG_WAIT/LONG`, `CLOSED_ABOVE_EMA_WATCH/SHORT`. Các route khác giữ nguyên.
- Dữ liệu trước entry và phân loại không đổi: runtime vẫn dùng exact source + stream + signal label + side + `event.interval`, nến đóng/cache EMA99, freshness, enabledAt và mọi gate Binance hiện hữu. Thống kê quyết định dựa trên 190 vị thế EMA99 đã đóng tại thời điểm đánh giá; 18 vị thế còn mở không tính thắng/thua. DCA được giữ trong PnL tiền thật nhưng bị loại khỏi cohort đánh giá chất lượng tín hiệu.
- Ảnh hưởng Binance: đây là gate entry thật và chỉ áp dụng tín hiệu mới sau `updatedAt=2026-09-11T03:55:01.032Z`; route tắt bị chặn trước MARKET. Không đóng/sửa vị thế hay order hiện tại, không đổi margin từng route, leverage `5x`, TP EMA99 `+15% ROE`, SL LONG `−20%`/SHORT `−30%`, cooldown, no-DCA guard hoặc master switch.
- Tương thích JSON cũ: chỉ cập nhật boolean `enabled`/`enabledAt` trong `data/auto-entry-controls.json`, không đổi schema, key route 5 phần hoặc migration. UI và runtime tiếp tục đọc cùng key; không backfill/replay tín hiệu cũ. Không có card/nhãn/matcher WHITELIST mới; policy mặc định OFF và điều kiện CLOSED AvgROE `>4%` giữ nguyên.

### 2026-09-11 — EMA99_DISCORD_TIMEFRAME_SPLIT_V1_20260911

- Version runtime `EMA99_DISCORD_TIMEFRAME_SPLIT_V1_20260911`. Toàn bộ event EMA99 hiện hữu có `interval=15m` được gửi sang webhook Discord 15m riêng; `interval=5m` tiếp tục dùng webhook EMA99 cũ. Matcher dùng chính timeframe trên event sau detector, không suy đoán từ tên nhãn; timeframe thiếu hoặc khác 5m/15m bị fail-closed và không gửi nhầm kênh.
- Dữ liệu trước entry và điều kiện phân loại giữ nguyên: cùng cache nến đã đóng 5m/15m, EMA13/25/99, stage, side, freshness và các trường context hiện hữu. Không đổi detector, nhãn, tier, điểm, điều kiện phát hiện, thống kê W/L/PF/AvgROE/Net PnL hoặc audit fill/close CSV; đây chỉ là định tuyến Discord theo timeframe.
- Ảnh hưởng Binance/entry/size/SL/TP: không đổi. Binance runner vẫn xử lý event trước bước thông báo và vẫn dùng exact route 5m/15m trong Auto Controls; không bật thêm route, không đổi MARKET/size/leverage, TP EMA99 `+15% ROE`, SL LONG `−20%`/SHORT `−30%`, và không đụng vị thế/lệnh đang mở.
- Tương thích JSON cũ: state 5m tiếp tục ở `data/post-pump-ema99-discord.json`; 15m dùng state dedupe mới `data/post-pump-ema99-15m-discord.json`. Không migrate/rewrite/backfill/replay JSON cũ. Vì state 15m mới tách riêng, chỉ event 15m hợp lệ xuất hiện sau khi reload mới được ghi vào đó. Không thêm nhãn/card/matcher WHITELIST; policy mặc định OFF và điều kiện hiển thị CLOSED AvgROE `>4%` giữ nguyên.

### 2026-09-10 — EMA99_PARTIAL_CACHE_SCAN_V1_READY_PAIRS_20260910

- Version runtime `EMA99_PARTIAL_CACHE_SCAN_V1_READY_PAIRS_20260910`. Sau restart, scanner Post Pump EMA99 SHORT và EMA99 Pullback LONG không còn chờ cổng warm-up toàn cục đủ `400/400`; mỗi phút lấy Top 400 snapshot hiện có và quét ngay các cặp symbol/khung đã có tối thiểu `165` nến cache ở 5m hoặc 15m. Khi chưa có cặp nào đủ dữ liệu, scanner ghi rõ coverage `ready5m/ready15m/readyPairs` và chờ lượt sau; không gọi REST riêng để lấp cache.
- Dữ liệu dùng trước entry/phân loại không đổi: mỗi detector vẫn chỉ đọc tối đa 240 nến cache, tự loại chuỗi thiếu/khuyết, nến sai thời lượng và dữ liệu cũ; event vẫn phải vượt đúng rule EMA99, nến đóng/freshness/tuổi tín hiệu và các Binance gate hiện hữu. Partial warm-up chỉ thay điều kiện scheduler được phép chạy, không biến cache thiếu thành tín hiệu và không replay nến đã quá tuổi.
- Phân loại, nhãn, tier và thống kê không đổi. Log mỗi scanner thêm object `coverage` để phân biệt “không có mẫu” với “cache chưa phủ đủ”; không đổi W/L, PF, AvgROE, Net PnL, snapshot/paper/fill-close CSV. Không thêm card hoặc matcher mới nên không tạo checkbox WHITELIST; policy mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%` giữ nguyên.
- Ảnh hưởng Binance/entry/size/SL/TP: route EMA99 đã bật có thể nhận event sớm hơn sau restart nhưng chỉ từ cặp có đủ 165 nến và qua toàn bộ exact stage/side/timeframe, enabledAt, freshness, mark drift, no-DCA/open-order/protection gate hiện hữu. Không đổi margin, leverage, entry type, TP `+15% ROE`, SL LONG `−20%`/SHORT `−30%`, không sửa hoặc backfill position/order đang mở.
- Tương thích JSON cũ: không đổi schema signal, state Discord, controls, audit hoặc trade JSON; `coverage` chỉ xuất hiện trong log runtime. Không migrate/rewrite/backfill/replay dữ liệu cũ. Test xác nhận chỉ một khung đủ nến đã cho phép quét partial, zero-pair vẫn chờ và scheduler không còn phụ thuộc `klineWarmupReady()` toàn cục.

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


### 2026-09-08 — EMA99_REJECT_REBOUND_PREVIEW_V1_20260908

- Discord REJECTED_SHORT_WATCH thêm embed cam giá SHORT chờ hồi nổi bật: EMA99 snapshot ±0.5%, mốc giữa EMA99. Chỉ hiện khi closed SHORT, giá hiện tại của snapshot dưới toàn vùng và cận trên dưới invalidation; dữ liệu thiếu/sai bỏ card. Không dùng giá cố định 哈基米. Công thức là ước lượng hiển thị chưa backtest tối ưu.
- Điều kiện tham khảo: hồi vào vùng + reject mới, không hồi bỏ qua; ghi rõ snapshot không phải giá realtime. Invalidation là mốc nến cũ không phải SL Binance; SL entry SHORT mới vẫn -30% ROE từ fullfill.
- Không sửa phân loại/gate/entry/size/TP/SL, không tắt MARKET hay đặt LIMIT, không gửi lại lịch sử. Đây không phải card thống kê hoặc nhãn giao dịch mới nên không thêm WHITELIST; W/L/AvgROE/CSV nguyên trạng. JSON event cũ không migrate, helper chỉ đọc trường có sẵn, thiếu trường không render. Tests bounds/type/stage và embedcolor, regression detector/Discord mock; không test order/send thật.


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


### 2026-09-08 — EMA99_CONTROL_NOTES_V1_20260908

- Thêm ghi chú tiếng Việt dưới 11 stage EMA99 trên binance-auto-controls, tương ứng tên Discord. CLOSED_ABOVE_EMA_WATCH là nến đóng trên EMA trong detector SHORT, chưa reject; không tự diễn giải là LONG. CLOSED_BELOW_EMA_LONG_WAIT đối xứng chỉ theo dõi, không tự suy ra SHORT.
- Chỉ nội dung UI: dữ liệu trước entry, phân loại detector, gate, entry, size, leverage, SL/TP và thống kê W/L/AvgROE không đổi. Ghi rõ 3 stage có route riêng vẫn cần bật và qua gate; 8 observe không được mô tả thành rule giao dịch thật. Không thêm nhãn/card thống kê hoặc WHITELIST.
- JSON cũ không thay đổi/migrate; ghi chú ánh xạ static exact stage + stream EMA99. Không chỉnh TP20% vì yêu cầu ROE/giá và phạm vi chưa được xác nhận. Không restart dịch vụ giao dịch cho thay đổi UI này.


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


### 2026-09-08 — EMA99_NEAR_REJECT_MARKET_5USDT_5X_V1_20260908

- Người dùng chỉ định riêng SHORT cam đã reject `NEAR_REJECT_SHORT_WATCH` vào MARKET margin5 USDT, leverage5x (notional25 USDT, không ceil vượt minNotional). Nối detector SHORT V3 vào runner mới cùng scanner5m/15m, không chờ phá đáy thêm theo yêu cầu market loại này. NEAR_EMA_WATCH, chạm/reject đỏ và toàn bộ LONG không thuộc route. Các route auto khác tiếp tục OFF; master ON để route này hoạt động. Control key exact source `ema99-near-reject-short`, stream `ema99-retest`, label `NEAR_REJECT_SHORT_WATCH`, side SHORT; default register OFF, chỉ bật riêng theo yêu cầu này.
- Input trước entry: đúng detector version/stage/side/nearMiss, nến đã đóng sau enabledAt, generatedAt và close mới<=90s; TP/referenceEntry/invalidation dương đúng phía. Fresh mark lệch entry <=0.5%, TP<mark<SL. Lấy vị thế/openOrders thật để bỏ coin đã có vị thế bất kỳ phía hoặc entry chờ, không DCA. Không phát lại tin TAC9:30 hoặc nến đóng trước lúc kích hoạt. Bật lại route cập nhật enabledAt; route state cũ thiếu mốc này không được tự vào. Detector không đổi; entry loại WATCH này là quyền riêng người dùng, không đồng nghĩa xác nhận phá đáy/xác suất thắng.
- TP là takeProfit detector (đáy12 nến trước còn dưới giá), SL=invalidation (high nến reject +.25ATR14). Ngoại lệ source exact để không bị rule bot-short TP-only bỏ SL hoặc TP ROE6 ghi đè; bảo vệ qua full-fill pipeline hiện hữu, preserveSignalProtection. Validate rounded TP/SL/price/age ở placeOrder trước entry. Vị thế này vẫn chịu các rule quản lý vị thế cũ sau fill. Source mới không đổi chính sách bảo vệ của các nguồn khác.
- Dedupe pending trước submit bền qua restart, clientOrderId hash signal cố định; cooldown symbol4h xuyên5m/15m, lỗi/timeout không retry tự động cùng event để tránh nhân đôi. Quyền auto policy Symbol mới chỉ exact source/label/SELL/MARKET/notional25/lev5; JSON/text không cấp quyền. Master/per-route control vẫn kiểm tra đầu và sát client. Discord ghi route5x5 + outcome, không tự nhận đã khớp; audit fill/close/CSV hiện hữu nhận source/label/reason/timeframe từ placeOrder. Không thêm card/nhãn thống kê mới hay whitelist: thống kê cũ không đổi cách W/L/PF/AvgROE; đây là route explicit độc lập tương tự PPKS, không gắn giả gate AvgROE hoặc tạo checkbox WHITELIST hiệu lực khi chỉ observe.
- JSON additive: file attempts riêng, event Discord optional binanceExecution; JSON detector cũ vẫn observe khi không có execution outcome. State controls thêm enabledAt optional, thiếu=>entry fail closed; lịch sử không migrate/backfill. Docs Binance updated. Tests mock exactstage/side/size/leverage, aged/pre-activation/chase/missinglevels, TP/SL preservation, controls/existingposition/order, concurrent/restart/crossTFdedupe và regression policies; không đặt lệnh hoặc gửi tín hiệu giả để test.

### 2026-09-07 — AUTO_ENTRY_CONTROLS_V1_20260907

- Theo yêu cầu người dùng, tạm OFF tất cả nguồn tự mở lệnh Binance. Thêm `/binance-auto-controls` và `/api/auto-entry-controls`: khóa tổng + OFF/ON từng key exact `[source,stream,label,side]`. Catalog từ JSON submission/fill audit lịch sử (không sửa audit) và yêu cầu runtime mới; loại mới OFF, không tự bật theo setting cũ. Ưu tiên label/type trong protectionMeta theo audit, tách primary1–40/secondary41–80 và LONG/SHORT. UNKNOWN/UNCLASSIFIED luôn khóa. Không thêm đường đặt lệnh cho EMA99 observe-only.
- Dữ liệu trước entry: metadata của payload hiện tại, token Orders được server xác thực, trạng thái JSON control mới nhất. Gate tại đầu placeOrder và wrapper client placeFuturesOrder/placeAlgoOrder trước gửi request, gồm MARKET/LIMIT/IOC fallback và đường legacy trực tiếp. Authenticated manual Orders đi qua khóa mới; signal tự động phải master ON và exact route ON, đồng thời vẫn qua quyền/rule/whitelist cũ. CoinGlass Qualified kiểm tra khóa trước close-reverse do tín hiệu mới. Không thay classifier, size, leverage, entry price, SL/TP; chỉ thêm quyền từ chối mở mới. Pause không đổi runtimeSettings.orderEnabled/dryRun vì các biến đó có thể ảnh hưởng quản lý bảo vệ.
- TP/SL/close giảm vị thế đi qua: reduceOnly hoặc closePosition true; hedge SELL LONG/BUY SHORT. Bot quản lý vị thế cũ không tắt. Các LIMIT/algo entry đã gửi sàn và request đang gửi không được tự hủy; có thể khớp sau OFF. Tác vụ/trader bên ngoài dịch vụ không thuộc khóa này. Discord và quét tiếp tục. Không phát lệnh thật để test.
- POST thay đổi cần token Orders + kiểm tra Origin; emergency pauseAll từ loopback được phép khi chưa đăng nhập. GET chỉ đọc metadata; page không đọc/hiện API secret. Bật tổng không tự bật các route OFF; pauseAll tắt tổng và mọi route. Persist atomic JSON riêng, missing/corrupt fail-closed OFF, khôi phục restart không tự ON. Event/audit/trade JSON cũ không migrate/backfill/rewrite; bootstrap catalog không suy diễn performance hoặc cấp quyền.
- Đây là control panel, không card/nhãn thống kê mới: W/L/PF/AvgROE/PnL không đổi. WHITELIST cũ và policy chỉ hiện checkbox thống kê khi closed AvgROE>4% vẫn nguyên; switch quản lý không thay thế hay bypass whitelist. Xem `docs/BINANCE_AUTO_ENTRY_CONTROLS.md`. Tests mock exact stream/side/label, OFF toàn bộ, ON có chọn, unknown/corrupt/restart, TP/SL hedge/one-way, manual, fallback và old-policy denial; regression auto policy/EMA observers. Trạng thái bàn giao tổng OFF, mọi route OFF.

### 2026-09-07 — EMA99_LONG_DISCORD_BLUE_GREEN_V1_20260907

- Chỉ đổi trình bày Discord LONG: WATCH/WAIT/near/reclaim dùng xanh dương #3B82F6 + 🔵; xác nhận bật dùng xanh lá #10B981 + 🟢. Tất cả tiêu đề bắt đầu LONG để phân biệt cả khi không nhìn được màu. SHORT giữ nguyên vàng/cam/đỏ. Style version riêng trong footer, không đổi version detector hoặc key dedupe; không sửa/gửi lại tin cũ.
- Dữ liệu trước entry và điều kiện phân loại giữ EMA99_PULLBACK_LONG_OBSERVE_V1; không thêm tier/gate/card/nhãn thống kê/WHITELIST. OBSERVE ONLY, không đổi Binance/entry/size/SL/TP/paper hay W/L/PF/AvgROE/PnL. JSON event/state cũ tương thích nguyên, không migration/backfill. Test tất cả 5 stage WATCH/WAIT xanh dương, xác nhận xanh lá, prefix LONG và không trùng palette SHORT.

### 2026-09-07 — EMA99_PULLBACK_LONG_OBSERVE_V1_20260907

- Nhánh LONG riêng `src/ema99PullbackLong.js`, không đảo hoặc sửa detector SHORT. Input causal trước entry (không có entry thật): cache 240 nến 5m/15m, tối thiểu 165, kiểm tra OHLC/thời gian/liên tục; EMA99 seeded SMA99. Bối cảnh/ATR14/volume MA20 dùng nến đóng trước nến kiểm tra; EMA tại nến kiểm tra dùng close hiện có, nến đang chạy chỉ WATCH. Không dùng CoinGlass hay dữ liệu tương lai.
- EMA99 tăng >=0.3% qua 12 bước và >=80% bước tăng, >=6/8 close trên EMA, open ứng viên trên EMA trước đó. Chọn đáy thấp nhất 12–96 nến trước; đỉnh close gần nhất cao nhất trong tối đa 13 nến trước (tie lấy mới nhất), tối đa 12 nến điều chỉnh và không lấy đỉnh ở biên đã giảm từ close trước cao hơn. Đoạn sau đáy tới đỉnh >=12 nến: mean 6 close cuối tăng >=0.5% so 6 close đầu; tăng đáy->đỉnh >=8%, giá trước nến kiểm tra còn trên đáy >=5%. Nhịp giảm nhiều nến được tách riêng, không xóa bối cảnh tăng trước đó.
- Nến giảm về EMA: open-low>=max(1%open,0.8ATR), volume>=1.5MA20. Đáy trên EMA không quá clamp(0.75ATR/EMA%,0.3%,1.5%); xuyên dưới không quá max(3%,1.5ATR/EMA%). Hụt >0.15% là NEAR_EMA_LONG_WATCH; nến đóng trên EMA và râu dưới>=25% thành NEAR_RECLAIM_LONG_WATCH (ghi rõ chưa chạm). Chạm/tolerance0.15%: TOUCH_EMA_LONG_WATCH, RECLAIM_LONG_WATCH nếu rút râu đóng trên, CLOSED_BELOW_EMA_LONG_WAIT nếu đóng dưới/bằng EMA. Chỉ hai nến mới nhất, tuổi close<=1 timeframe+90s được gửi WATCH.
- Sau nến rút râu đã đóng: trong tối đa 3 nến kế tiếp đã đóng, nến xanh đóng vượt high nến kiểm tra HOẶC retest low trong EMA hiện tại±0.25ATR và đóng xanh cao hơn close nến kiểm tra => BOUNCE_CONFIRMED_LONG_WATCH. Dừng nếu bất kỳ nến đóng trung gian close<=EMA hoặc low<thấp nến kiểm tra-0.25ATR. Chỉ xác nhận đầu tiên; xác nhận phải thuộc hai nến gần nhất và mới<=1 timeframe+90s, không làm mới xác nhận cũ. Near bật trước EMA vẫn ghi chưa chạm, không gọi reclaim trực tiếp. Đây là xác nhận mô hình, không MARKET hoặc lợi thế đã backtest.
- Discord chung env/webhook EMA99 hiện hữu; quét top400 volume cache-only cùng scheduler60s, warmup/inflight guard. Shared notifier queue/backoff, key LONG riêng `EMA99_LONG|symbol|interval|candle|stage`, giữ nguyên key SHORT/state cũ. Nâng stage được gửi; restart không lặp. Tin vàng WATCH/xanh xác nhận có side/timeframe/stage, lý do, % hồi/điều chỉnh, volume/râu/gap, mức vô hiệu và kháng cự12 nến trước còn trên giá; giá xác nhận chỉ tham khảo, không target nếu kháng cự đã vượt. Event timestamp quá90s bị bỏ khi ra queue. Không phát lại lịch sử hoặc gửi test giả vào live.
- JSON additive nhánh/version LONG, state schema tương thích cũ, không migration/backfill; không thay meaning event SHORT. OBSERVE ONLY: không executor, paper, Binance entry/size/SL/TP hoặc gate thật. Không tạo card/nhãn thống kê giao dịch/WHITELIST và không thay W/L/PF/AvgROE/PnL. Tests mock5m/15m gồm near/touch/reclaim/đóng dưới, live/future/gap/stale/volume, EMA giảm, điều chỉnh nhiều nến/quá cũ, break/retest/invalidation, hết hạn xác nhận và restart dedupe; regression SHORT/notifier cùng chạy.

### 2026-09-07 — POST_PUMP_EMA99_RETEST_OBSERVE_V3_PRE_REBOUND_FADE_20260907

- Sửa fade cho Discord Post Pump EMA99 5m/15m: tách đoạn giảm sau peak khỏi nhịp hồi, gồm trường hợp tạo nền sau giảm. Dữ liệu trước entry (luồng không có entry thật): chỉ các nến đã đóng trước nến ứng viên; peak vẫn trong 8–96 bars, base 48 bars trước peak. Chọn close thấp nhất trong 13 nến trước ứng viên (tie lấy mới nhất), tối đa 12 nến hồi; bỏ nếu close ngay trước đáy thấp hơn đáy được chọn (đáy thật ngoài cửa sổ). Không dùng pivot tương lai.
- Đoạn fade từ nến sau peak đến đáy đã chọn, ít nhất 12 nến: trung bình 6 close cuối phải thấp hơn 6 close đầu >=0.5%. Không còn bắt 6vs6 ngay trước spike phải giảm, nên hồi nhiều nến hoặc đi ngang tạo nền không tự xóa bối cảnh giảm. Pump>=8%, drop hiện tại>=5%, EMA99 giảm>=0.3%/12 bước và >=80% bước giảm, >=6/8 close dưới EMA, open dưới EMA, volume>=1.5x, spike>=max(1%,0.8ATR), near/touch/freshness giữ V2. Các ngưỡng là rule quan sát, chưa chứng minh lợi thế giao dịch.
- Stage/watch và dedupe symbol+interval+candle+stage không đổi. Discord ghi riêng fade trước hồi, số nến/% hồi và 6vs6 hiện tại. JSON giữ fadePct nhưng nghĩa V3 là đoạn sau peak/trước hồi; thêm recentFadePct/reboundBars/reboundPct/fadeStartAt/fadeEndAt. Version phân biệt nghĩa V2; renderer thiếu field cũ dùng placeholder. Dedupe state cũ đọc nguyên, không migrate/backfill hoặc phát lại tín hiệu lịch sử.
- OBSERVE ONLY: không đổi Binance, entry, size, SL, TP, executor hay paper; không thêm loại/card thống kê/WHITELIST. Không ghi hoặc đổi W/L/PF/AvgROE/PnL. Test mock 5m/15m hồi nhiều nến, nền sau giảm, không fade, hồi quá cũ, future/gap/stale, near/touch/reject và dedupe restart. Replay nến đóng MARSCOIN 15m 06:45 và 07:15 ngày 7/9 VN đạt bộ lọc mới; 07:00 vẫn không đạt spike. Replay chỉ kiểm tra phân loại, không phải backtest PnL, không gửi Discord lịch sử.

### 2026-09-06 — POST_PUMP_EMA99_RETEST_OBSERVE_V2_NEAR_MISS_20260906

- Thêm near-miss5m/15m cho cùng webhook luồng PostPumpEMA99. Input trước entry và tất cả filter pump/fade/EMA99 dốc/volume/spike/freshness/cache V1 giữ nguyên; chỉ mở rộng khoảng high chưa chạm EMA. Ngưỡng khoảng hụt = clamp(0.75×ATR14 trước spike/EMA99×100,0.3%,1.5%). Hụt>0.15% nhưng<=ngưỡng gọi near; tolerance chạm0.15%/giới hạn vượt trước đó giữ nguyên.
- NEAR_EMA_WATCH cho nến tiến gần chưa reject xác nhận (gồm live); NEAR_REJECT_SHORT_WATCH cho near nến đã đóng dướiEMA và râu trên>=25%. Tin màu cam ghi rõ chưa chạm, khoảng hụt%/ATR và ngưỡng; không gọi là reject trực tiếp ở EMA99. Nến chạm/vượt/đóng trên tiếp tục các stageV1. Đây là ngưỡng thử chưa backtest edge.
- Dedupe symbol+interval+candle+stage giữ nguyên; near->touch->reject được gửi cập nhật, restart không lặp stage đã gửi. JSON event thêm nearMiss/nearLimitPct/gapToEmaPct/gapToEmaAtr, stageV1 tương thích, state cũ vẫn đọc, không migrate/backfill/replay.
- OBSERVE ONLY, không stat card/WHITELIST mới, không đổi W/L/PF/AvgROE/PnL/entry/size/SL/TP/Binance/executor. Mức giá tham khảo của near-reject dùng công thứcV1 nhưng không tự vào lệnh. Tests near/live/closed/ngoài ngưỡng/volume và nâng stage5m/15m.

### 2026-09-06 — POST_PUMP_EMA99_RETEST_OBSERVE_V1_20260906

- Luồng Discord riêng POST_PUMP_EMA99_DISCORD_WEBHOOK_URL, cache-only 240 nến mỗi khung5m/15m, xét độc lập, top400 theo quoteVolume shared snapshot. Mỗi60s, in-flight guard/throttle55s, sau warmup; dùng getIfCached, không nạp nến REST/cào CoinGlass, không cần mở page. Thiếu165 nến/invalid/gap/stale bỏ qua.
- Input trước entry: EMA99 SMA seed99 và alpha0.02; slope12 bước trước nến spike giảm>=0.3%, >=80% bước giảm; đỉnh trong8–96 nến trước so low48 nến trước đỉnh phải pump>=8%, giá trước spike đã giảm>=5% từ đỉnh. Hai nhóm6 close cuối phải giảm>=0.5%, >=6/8close dưới EMA99, open spike dưới EMA99 trước đó. Không dùng %24h làm đại diện cấu trúc.
- Spike high-open >=max(1%open,0.8ATR14 trước spike), volume tích lũy>=1.5×trung bình20 nến trước. High chạm EMA99 hiện tại trong tolerance0.15%, vượt không quámax(3%,1.5ATR/EMA). Chỉ xét nến cuối và nến ngay trước, closeTime không cũ quá1interval+90s; live không được coi đã reject.
- TOUCH_WATCH (nến live/chạm), CLOSED_ABOVE_EMA_WATCH (nến đóng trênEMA), REJECTED_SHORT_WATCH (đóng dướiEMA+râu trên>=25%). Tin vàng/đỏ ghi symbol/timeframe/VN, pump/drop/slope/vol/spike/wick, giá/EMA; rejected thêm giá tham khảo, vô hiệu high+0.25ATR và TP low12nến trước nếu đúng phía. Đây chưa là MARKET_READY: chờ phá đáy reject/retest thất bại, hủy SHORT nếu giữ trênEMA. Các mức chỉ tham khảo, không thực thi.
- Dedupe persist theo symbol+interval+openTime+stage (nâng watch->reject có thể gửi), không gửi lại cùng candle/stage qua restart. State mới data/post-pump-ema99-discord.json, HTTP thành công mới persist/timeout/backoff qua notifier, JSON cũ không migrate/replay. Version generic state lấy event.version.
- Không nối paper/executor/stat board: OBSERVE ONLY, không card thống kê/WHITELIST mới, không thay W/L/PF/AvgROE/PnL hoặc Binance entry/size/SL/TP/luồng PPKS cũ. Rule mới chưa backtest edge. Tests5m/15m,live vs closed,notouch/lowvol/nopump/gap/stale/accepted và dedupe/restart.

### 2026-09-06 — LIQ_SCAN_TWO_TIER_OBSERVE_V1_20260906

- Hai mức thông báo LiqScan theo coin được phân tích/search/auto-refresh trên trang; cùng webhook COIN_HORIZON_DISCORD_WEBHOOK_URL, không thêm quét universe. WATCH >=40 điểm; MARKET_READY >=70 và toàn bộ xác nhận. Đây là ngưỡng thử chưa backtest hiệu quả; MARKET_READY chỉ là thông báo OBSERVE ONLY, không nối executor/gate/entry/size/SL/TP Binance.
- Input trước entry: current proxy mới<=90s, mark, direction assessment CoinGlass mới và trend/confirmation15m, nến5m/15m đóng trong context hiện hữu, ATR5m, plan hiện tại. MARKET cần directionAssessment đồng hướng/có target,15m đóng qua mép plan rồi5m sau mới retest trong±0.25ATR và đóng đúng hướng, taker quote theo chiều>=55%, giá đúng phía mép và cách close5m<=0.5ATR, TP gần/invalid đúng phía R:R>=1.2. OI chưa là điều kiện. Thiếu/đối nghịch vẫn WATCH nếu>=40; stale/<40 không gửi, không dùng lastAlert cũ.
- Vàng WATCH, xanh LONG/đỏ SHORT MARKET_READY; gửi điểm, current above/below, levels tham khảo, checklist, giờVN/link. Dedupe riêng symbol+tier+side nên nâng WATCH->MARKET_READY gửi ngay; cùng tier/side4h, đổi chiều tối thiểu15m mỗi side. State data/liqscan-tier-discord.json độc lập, thành công HTTP mới ghi atomic; queue/timeout/backoff dùng chung cơ chế horizon notifier, không chặn page.
- Không nhãn/card thống kê/WHITELIST mới, không đổi W/L/PF/AvgROE/PnL. JSON optional liqScan.alertTier; hỗ trợ legacy sweepProbabilityPct, thiếu context không lên READY; không migration/backfill/replay lệnh. Tests ngưỡng39/40/69/70, hai chiều, conflict/stale/thiếu flow/RR/thứ tự retest và nâng tier không bị dedupe.

### 2026-09-06 — COIN_HORIZON_DIRECTION_DISCORD_V1_20260906

- Gửi webhook `COIN_HORIZON_DISCORD_WEBHOOK_URL` từ pipeline phân tích coin-level-analysis (search/auto-refresh/refresh CoinGlass qua pipeline hiện có), không thêm bộ quét nền universe hoặc request thị trường. Input trước entry là mark/ATR/state/closeTime nến1h/4h và CoinGlass fresh của horizon model V1 hiện hữu; tính lại khi xử lý queue để chặn dữ liệu cũ.
- LONG khi direction UPPER, SHORT khi LOWER, chỉ horizon available && !stale. MIXED/CONFLICT/WAIT_DATA không gửi. Thiếu CoinGlass vẫn gửi nếu mô hình hiện hữu có direction, ghi thiếu dữ liệu và đồng thuận thấp. Không nâng thành xác nhận vào lệnh. Gom3khung4h/8h/12h trong1embed màu xanh/đỏ: giá mốc, giờ VN, biên, hỗ trợ/kháng cự, vùng quét, điều kiện phá biên, ghi chú và linkBinance/CoinGlass.
- Dedupe bền theo symbol: cùng chiều4h; đổi chiều có thể gửi ngay nhưng mỗi symbol+side tối thiểu15phút. Không reset dedupe khi MIXED; chuyển lại cùng chiều trong4h không spam. State chỉ cập nhật sau HTTP thành công, persist atomic, queue serialize; lỗi/429 backoff>=60s, timeout10s, không chặn API page.
- OBSERVE ONLY, không thêm label/card thống kê WHITELIST; không đổi W/L/PF/AvgROE/PnL hoặc Binance entry/size/SL/TP/gate/executor. JSON runtime horizon cũ vẫn tính theo module hiện hữu, thiếu/cũ không gửi; state mới data/coin-horizon-discord.json, không migrate/backfill/replay trade. Secret chỉ .env, .env.example trống. Tests LONG/SHORT/MIXED/CONFLICT/stale/payload/concurrency/restart dedupe/429 bằng mock.

### 2026-09-06 — COIN_HORIZON_SCENARIOS_OBSERVE_V1_20260906

- Khối phân tích 4h/8h/12h phía trước trên coin-level-analysis, dưới LiqScan SHORT. Input causal trước entry: mark hiện tại, ATR14/state/closeTime nến1h/4h đã đóng, cluster support/resistance nguồn1h/4h và edge zone CoinGlass mới đã có. Không fetch thêm, không dùng outcome.
- Biên đối xứng price ± max(ATR1h×sqrt(H), ATR4h×sqrt(H/4)), H=4/8/12; cận dưới floor1%mark và cảnh báo clipping. Đây là công thức kịch bản chưa backtest coverage, không phải xác suất, không đảm bảo giá ở trong biên. Chọn hỗ trợ/kháng cự1h/4h gần nhất nằm toàn bộ trong biên; CoinGlass24h->12h->48h mới<=20m chỉ FRESH/APPROACHING/UNTRACKED effective>0 đúng phía mark, không dùng vùng đã quét/reject làm target mới.
- Hướng UPPER/LOWER khi cả state1h/4h đồng thuận, MIXED nếu không; CONFLICT nếu CoinGlass weighted/combined đối nghịch; WAIT_DATA nếu dữ liệu trang>90s hoặc nến1h>65phút/4h>245phút hay thiếu timestamp. Mức đồng thuận tối đa PARTIAL. Ghi mốc phát, thời hạn từng ô và kịch bản nến1h phá biên + retest15m để đánh giá lại.
- OBSERVE ONLY, không card thống kê/nhãn runtime mới nên không WHITELIST; không thay W/L/PF/AvgROE/PnL, Binance entry/size/SL/TP/Discord hay gate. JSON additive horizonAnalysis + trend.frames.closeTime; JSON cũ thiếu trả fallback/stale, không migration/backfill. Test biên lồng nhau, stale/missing, conflict, reject exclusion và clipping.

### 2026-09-06 — LIQ_SCAN_SWEEP_REJECT_SHORT_OBSERVE_V1_20260906

- Khối thông tin dưới LiqScan trên coin-level-analysis, chỉ OBSERVE ONLY, không phải card thống kê/nhãn giao dịch runtime nên không thêm WHITELIST. Không đổi W/L, PF, AvgROE, PnL hoặc gate/Binance entry/size/SL/TP/Discord. Giá entry/TP/vô hiệu trên khối chỉ tham khảo.
- Dữ liệu trước entry: latest alert cùng symbol ABOVE/isAlert, mainKillZone phía trên mark lúc phát; vùng cố định theo snapshot gốc, hết hạn6h. Dùng 96 nến5m/32 nến15m đóng sẵn trên trang, ATR5m/mark/current supports; không thêm request. Nến phải mở sau hoặc đúng lúc alert và đóng trước now, liên tục, mới; bỏ nến chứa alert để không nhìn trước. Có thể bỏ lỡ quét rất sớm trong nến đó. Chỉ theo latest alert còn lưu, không theo nhiều event đồng thời.
- Trạng thái WAIT_ALERT/WAIT_SWEEP -> SWEPT_WAIT_REJECT -> REJECTED_WAIT_CONFIRMATION: high chạm band, 5m đỏ đóng dưới mép thấp, nến sau đỏ phá low reject hoặc retest mép thấp thất bại. 15m đóng trên mép cao + nến5m sau giữ low trên mép và gần <=0.25ATR hủy CANCELLED_ACCEPTED. Vượt peak đến xác nhận +0.25ATR hủy INVALIDATED. Thiếu/cũ/gap trả MISSING_DATA, alert>6h EXPIRED.
- SHORT_SETUP_CONFIRMED chỉ là đủ điều kiện QUAN SÁT: confirmation<=15phút, mark dưới mép vùng, cách close xác nhận<=0.5ATR, 15m gần nhất dưới vùng, taker SELL quote>=55%, TP gần R:R>=1.2. TP là mức cao nhất dưới mark trong mark gốc và support.high hiện tại; vô hiệu peak+0.25ATR. Thiếu điều kiện WATCH_NO_CHASE, không phát lệnh. Chưa backtest hiệu quả rule mới; OI không làm gate.
- JSON additive `liqScanCandleContext` và `liqScan.sweepRejectShort`; context/alert cũ thiếu thì MISSING_DATA/WAIT_ALERT, client thiếu field có fallback. Không rewrite/backfill lịch sử trade. Test causal/missing/stale/accepted/invalidated/flow/RR/no-chase đã thêm.

### 2026-09-06 — LIQSCAN_OUTCOME_AUDIT_V1_20260906 (offline)

- Input trước entry: frozen latest-alert snapshots (188 records), giữ mark/side/zone/target/time nguyên bản; outcome public Binance 1m, riêng USELESS bổ sung aggTrades phút đầu. 22 mẫu đủ 4 giờ, selection bias latest-only.
- Thống kê offline TARGET_FIRST/OPPOSITE_FIRST/AMBIGUOUS/NEITHER theo rào đối xứng với target đã lưu, báo riêng target-ever và MFE/MAE. Đây không phải W/L hoặc PnL giao dịch thật, không phải thống kê whitelist. Không thêm nhãn/card runtime, không thay gate/entry/size/SL/TP/Binance hay Discord.
- JSON runtime cũ không đổi; artifact audit tách riêng, không migrate/backfill lịch sử lệnh. Chi tiết và giới hạn tại `docs/LIQSCAN_USELESS_AUDIT_20260906.md`; không dùng kết quả audit làm rule mới.

### 2026-09-06 — LiqScan: dữ liệu hiện tại và vùng quét có điều kiện

- Version `LIQ_SCAN_DIRECTION_CONTEXT_V1_20260906`; input causal trước entry chỉ dùng current proxy 15m, mark/trend/confirmation 15m/plan của trang và CoinGlass edge zones/lifecycle/scrapedAt đã có. Current phải mới <=90 giây; từng frame <=20 phút. Vùng ưu tiên lấy 24h, thiếu thì 12h, rồi 48h, ghi rõ fallback; chọn mép gần nhất từng phía còn FRESH/APPROACHING/UNTRACKED và effective attraction >0, toàn band nằm đúng phía mark. SWEPT/REJECTED/ACCEPTED không làm mục tiêu chưa quét.
- So hướng proxy với weighted trial CoinGlass (fallback combined cho JSON cũ): ngược là CONFLICT; thiếu freshness là MISSING_DATA; chỉ DIRECTIONAL_WATCH khi proxy pass, cùng hướng CoinGlass, trend đồng thuận, 15m xác nhận và có target hợp lệ; còn lại WAIT_CONFIRMATION. Đây là hướng theo dõi, đồng thuận tối đa PARTIAL vì chưa xác nhận retest 5m/taker/OI. Không tuyên bố xác suất hay tự động biết vùng nào chắc chắn bị chạm trước.
- UI dùng current làm chính; lastAlert thu gọn lịch sử theo giờ Việt Nam. Đổi chữ xác suất sang điểm lệch /100, thêm `imbalanceScore` là alias công thức hiện hữu; `sweepProbabilityPct` giữ để tương thích JSON cũ. `liqScan.directionAssessment` additive, thiếu field render fallback; không migrate/backfill lịch sử.
- Không thêm nhãn/card thống kê hoặc WHITELIST, không thay W/L/PF/AvgROE/PnL. OBSERVE ONLY ở trang; không thay scanner Discord, gate runtime, Binance entry/side/size/SL/TP hay order đang mở. Các mức xác nhận/vô hiệu dùng plan hiện có, không gửi lệnh.

### 2026-09-06 — Thử ưu tiên CoinGlass 24h trên trang phân tích

- Version `COIN_LEVEL_24H_WEIGHT_TRIAL_V1_20260906`: input trước entry là edge zones, điểm attraction/rejection, lifecycle và scrapedAt của từng khung 24h/48h/12h đã có; không cào thêm. Chỉ dùng khung có timestamp hợp lệ, không ở tương lai và tuổi <=20 phút, dedupe theo range.
- Phân loại thử dùng 24h ×1.4, 48h ×1.1, 12h ×0.75; độ lệch <15% là BALANCED, ngược lại UPPER_FIRST/LOWER_FIRST; giữ override REJECTED chiếm >=50% lực thô một phía khi có target ngược. Không có khung hợp lệ là NO_DATA. Khung 24h thiếu/cũ được ghi rõ. So sánh equal-weight dùng đúng cùng tập dữ liệu mới.
- Đây là panel thông tin OBSERVE ONLY, chưa backtest độ chính xác; không phải card thống kê/nhãn giao dịch, không thêm WHITELIST, không tính W/L, PF, AvgROE hay PnL. Combined/recommendation và Discord/executor hiện hữu giữ nguyên; Binance entry/size/SL/TP không bị ảnh hưởng.
- JSON additive `coinglass.timeframeTrial`; JSON cũ thiếu field vẫn render phần cũ, không migration/backfill lịch sử. UI đưa 24h lên trước rồi 48h/12h.
- Làm rõ LiqScan V1: scanner dùng KlineCache tối đa 500 nến 15m; current trên trang dùng 240 nến đã fetch cho phân tích. Cùng công thức nhưng cửa sổ khác nên giá trị có thể khác; snapshot lastAlert là thời điểm phát hiện, không phải xác nhận Discord đã giao thành công.

> Cập nhật: 2026-09-05 (Asia/Bangkok, UTC+7)
>
> Đây là tài liệu đọc nhanh về **logic đang chạy hiện tại**. Khi tài liệu cũ mâu thuẫn với file này, kiểm tra lại code tại `src/intradayDecisionPaper.js`, `src/recommendedSignals.js` và `src/server.js`; code vẫn là nguồn chuẩn cuối cùng.

### Zone Lifecycle V17: secondary top 41–80 chỉ SHORT exact breakdown (2026-09-05)

- Version Binance `COINGLASS_ZONE_LIFECYCLE_BINANCE_V17_SECONDARY_SHORT_BREAKDOWN_ONLY_20260905`, secondary stream
  `COINGLASS_WEB_SECONDARY_STREAM_V10_SHORT_BREAKDOWN_ONLY_20260905`. Dữ liệu dùng trước entry không đổi: CoinGlass Model 3 active-edge,
  nến đã đóng, lifecycle/next target, mark/slippage và snapshot Binance position/open-entry-order; `streamId` được truyền vào executor để phân biệt
  primary `1–40` với secondary `41–80` trước khi quyết định gửi lệnh.
- Phân loại lifecycle vẫn `FRESH → APPROACHING → SWEPT → REJECTED/ACCEPTED`. Riêng secondary, mọi `side=SHORT` phải có exact
  `signalLabel=BREAKDOWN_ACCEPTED_SHORT_READY`; vì vậy generic `ABOVE + REJECTED + SHORT`, strong-wave REJECTED hoặc SHORT thiếu/sai label bị
  `BLOCKED_SECONDARY_SHORT_REQUIRES_BREAKDOWN_ACCEPTED_SHORT_READY` và không gửi Discord secondary. `BELOW + ACCEPTED + SHORT` đúng exact label
  vẫn pass; policy SHORT của primary và toàn bộ LONG không đổi.
- Thống kê vẫn gom exact cohort hiện hữu `COINGLASS_ZONE_LIFECYCLE_SHORT`; event bị chặn không có fill nên không phát sinh W/L, WR, PF, AvgROE
  hoặc Net PnL. Không thêm nhãn/card nên không thêm checkbox `WHITELIST`; policy checkbox mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%`
  giữ nguyên.
- Ảnh hưởng Binance chỉ cho entry tương lai của secondary: exact breakdown giữ MARKET `$10 x5`, TP đóng 100% tại `+6% ROE`, TP-only/no-SL;
  mọi secondary SHORT khác không vào lệnh. Không hủy/sửa position, DCA, entry order, size, SL hoặc TP đã tồn tại; primary giữ policy hiện tại.
- Tương thích JSON cũ: `streamId`, `secondaryShortRuleTextRequired` và `secondaryShortRuleTextMatched` là optional/additive; audit/lifecycle cũ thiếu
  field vẫn đọc được. Giữ event id `ZLC1`, không migrate, rewrite, backfill hoặc replay event/order/outcome cũ.

### Zone Lifecycle V16: chặn hai LONG từ 00:00–05:59 giờ Việt Nam (2026-09-03)

- Version lifecycle/Discord/Binance `COINGLASS_ZONE_LIFECYCLE_V16_LONG_00_06_VN_TIME_GATE_20260903`, secondary stream
  `COINGLASS_WEB_SECONDARY_STREAM_V9_LONG_00_06_VN_TIME_GATE_20260903`. Causal input/phân loại trước entry giữ nguyên V15:
  Model 3 active-edge, nến đóng/lifecycle/target, mark/slippage, position/open-entry-order; thời gian executor được quy đổi bằng
  `Asia/Ho_Chi_Minh` trước khi gửi lệnh.
- Chỉ hai exact LONG `BREAKOUT_ACCEPTED_LONG_READY` và `UNCONFIRMED_BOUNCE_LONG` bị chặn trong các giờ `00,01,02,03,04,05`, tức
  **00:00–05:59** giờ Việt Nam; từ **06:00** được phép lại nếu mọi gate khác pass. Discord vẫn gửi event để theo dõi và ghi
  `BLOCKED_LONG_RULE_TIME_WINDOW_00_06_VN` cùng chú thích khung giờ.
- `SUPPORT_RECLAIM_LONG_READY`, SHORT REJECTED và `BREAKDOWN_ACCEPTED_SHORT_READY` không bị time gate này. Size/entry/TP/SL ngoài khung giờ
  không đổi: BREAKOUT LONG $10, UNCONFIRMED LONG $5, ACCEPTED SHORT $10; secondary fixed TP +6% ROE, primary adaptive, lifecycle TP-only/no-SL.
  Không sửa lệnh/vị thế đang mở.
- Stats/cohort/Income, W/L, WR, PF, AvgROE và Net PnL không đổi; time-block không tạo filled trade. Không thêm label/card/WHITELIST.
  JSON cũ tương thích vì `timeRestrictedLongRule`, `entryVietnamHour`, `entryTimeZone` là optional/additive; giữ `ZLC1`, không backfill/replay.

### Zone Lifecycle V15: Discord và exact gate cho `BREAKDOWN_ACCEPTED_SHORT_READY` (2026-09-03)

- Version lifecycle/Discord/Binance `COINGLASS_ZONE_LIFECYCLE_V15_BREAKDOWN_ACCEPTED_SHORT_READY_20260903`, secondary stream
  `COINGLASS_WEB_SECONDARY_STREAM_V8_BREAKDOWN_ACCEPTED_SHORT_READY_20260903`. Causal input giữ nguyên: mover Futures, Model 3 active-edge
  ở mép phải, nến đã đóng, lifecycle/next target, mark/slippage và snapshot position/open-entry-order trước entry.
- Phân loại mới chỉ đặt tên cho case đối xứng đã chạy: `BELOW + SWEPT + ACCEPTED + SHORT` trở thành exact
  `BREAKDOWN_ACCEPTED_SHORT_READY`. Discord title và field `PHÂN LOẠI SHORT` đều ghi nhãn này; primary gửi theo lifecycle hiện hữu,
  secondary 41–80 gửi vì đây là terminal event `shouldEnter=true`. Event cũ không replay nên chỉ tín hiệu mới sau reload có message V15.
- Binance fail-closed: ACCEPTED SHORT `$10 x5` chỉ được gửi khi exact signalLabel trên khớp; thiếu/sai text trả
  `BLOCKED_SIGNAL_RULE_TEXT_MISMATCH`. TP/SL không đổi: secondary fixed TP +6% ROE, primary adaptive, lifecycle TP-only/no-SL.
- Thống kê vẫn vào card/cohort `COINGLASS_ZONE_LIFECYCLE_SHORT`, đồng thời `statsSignalLabel` lưu exact label để tra chi tiết; không đổi
  filled/closed, Binance Income, W/L, WR, PF, AvgROE hay Net PnL. Không tạo card thống kê mới nên không tạo checkbox `WHITELIST` mới;
  checkbox/cohort hiện hữu giữ nguyên policy.
- JSON tương thích: `signalLabel` và `shortRuleTextMatched` là optional/additive; reader vẫn dùng được audit cũ thiếu label. Event id `ZLC1`
  không đổi, không migrate/backfill và không replay.

### Zone Lifecycle V14: exact rule-text gate trước khi gửi lệnh LONG (2026-09-03)

- Version lifecycle/Discord/Binance `COINGLASS_ZONE_LIFECYCLE_V14_EXACT_LONG_RULE_TEXT_GATE_20260903`, secondary stream
  `COINGLASS_WEB_SECONDARY_STREAM_V7_EXACT_LONG_RULE_TEXT_GATE_20260903`. Causal input trước entry không đổi: Model 3 active-edge,
  nến đóng/lifecycle, next active target, mark/slippage và position/open-entry-order snapshot.
- Trước khi gửi lệnh Binance, `ABOVE + ACCEPTED + LONG` phải có exact `signalLabel=BREAKOUT_ACCEPTED_LONG_READY`; tier bounce
  `BELOW + REJECTED + LONG` phải có exact `UNCONFIRMED_BOUNCE_LONG` (hoặc exact `SUPPORT_RECLAIM_LONG_READY` cho tier support-reclaim đã có).
  Sai/thiếu text fail-closed bằng `BLOCKED_SIGNAL_RULE_TEXT_MISMATCH`; chỉ state `ACCEPTED/REJECTED` không đủ để mượn tier `$10/$5`.
  Case đối xứng `BELOW + ACCEPTED + SHORT` đã được yêu cầu trước vẫn dùng xác nhận cấu trúc riêng và MARKET $10, không gắn giả label LONG.
- Size/TP/SL giữ nguyên V13/V12: breakout ACCEPTED $10, unconfirmed bounce $5; secondary 41–80 fixed TP +6% ROE, primary adaptive;
  Zone Lifecycle TP-only/no-SL. Chỉ tín hiệu mới sau reload; không sửa position/order/TP đang mở.
- Stats giữ cohort/Income mapping hiện hữu, không đổi W/L, WR, PF, AvgROE/Net PnL; không thêm label/card hay checkbox `WHITELIST`.
  JSON cũ tương thích: `longRuleTextMatched` là optional/additive, event id `ZLC1` giữ nguyên, không backfill/replay.

### Zone Lifecycle V13: `UNCONFIRMED_BOUNCE_LONG + REJECTED` MARKET $5 (2026-09-03)

- Version `COINGLASS_ZONE_LIFECYCLE_V13_UNCONFIRMED_BOUNCE_LONG_5USDT_20260903`, Discord V13 và Binance V13; stream phụ
  `COINGLASS_WEB_SECONDARY_STREAM_V6_UNCONFIRMED_BOUNCE_LONG_5USDT_20260903`. Dữ liệu causal trước entry không đổi: mover Futures,
  CoinGlass Model 3 active-edge còn ở mép phải, nến đã đóng, lifecycle/next active-edge target, mark/slippage và snapshot position/open-entry-order.
- Phân loại giữ nguyên: nhãn hiện có `UNCONFIRMED_BOUNCE_LONG` chỉ là `BELOW + SWEPT + REJECTED + LONG` nhưng nến reclaim thiếu ít nhất
  một xác nhận bullish-close/lower-wick/close-location của `SUPPORT_RECLAIM_LONG_READY`. Khi terminal event vẫn có next active edge hợp lệ và qua
  executor gate, cả stream 1–40 và 41–80 được MARKET margin **$5 x5**. `SUPPORT_RECLAIM_LONG_READY` giữ tier riêng; ACCEPTED LONG/SHORT vẫn $10.
- Stream 41–80 tiếp tục TP đóng 100% tại +6% ROE từ fill thật; stream 1–40 giữ TP adaptive theo zone. Chính sách Zone Lifecycle TP-only/no-SL
  không đổi. Chỉ entry phát sinh sau reload bị ảnh hưởng; không sửa position, order hoặc TP đang mở.
- Thống kê vẫn dùng cohort `COINGLASS_ZONE_LIFECYCLE_LONG`, filled/closed và PnL từ Binance order/Income; không thay W/L, WR, PF, AvgROE hay Net PnL.
  Đây là nhãn/card đã tồn tại nên không thêm checkbox `WHITELIST`; matcher/stat key không đổi.
- JSON cũ tương thích: `unconfirmedBounceLong` và config margin mới là optional/additive, state/event cũ vẫn đọc được; event id `ZLC1` giữ nguyên,
  không migrate/backfill và không replay tín hiệu REJECTED cũ.

### Zone Lifecycle V12: ACCEPTED $10; nhóm hạng 41–80 $2.5 và TP +6% ROE (2026-09-03)

- Version đang chạy: `COINGLASS_ZONE_LIFECYCLE_V12_ACCEPTED10_SECONDARY_FIXED6ROE_20260903`, Discord
  `COINGLASS_ZONE_LIFECYCLE_DISCORD_V12_ACCEPTED10_SECONDARY_FIXED6ROE_20260903`, Binance
  `COINGLASS_ZONE_LIFECYCLE_BINANCE_V12_ACCEPTED10_SECONDARY_FIXED6ROE_20260903` và stream phụ
  `COINGLASS_WEB_SECONDARY_STREAM_V5_FIXED6ROE_ACCEPTED10_20260903`. Dữ liệu causal trước entry không đổi: mover Binance Futures,
  CoinGlass Model 3 active-edge còn ở mép phải heatmap, nến đã đóng dùng xác nhận `REJECTED/ACCEPTED`, vùng mục tiêu kế tiếp,
  mark price/slippage và snapshot position/open-entry-order trước khi gửi MARKET. Không dùng dữ liệu xuất hiện sau entry để phân loại.
- Phân loại/gate giữ nguyên lifecycle `FRESH → APPROACHING → SWEPT → REJECTED/ACCEPTED`; chỉ terminal có vùng active-edge kế tiếp hợp lệ
  và qua các kiểm tra executor mới được vào. `ABOVE + ACCEPTED` là LONG với nhãn sẵn có `BREAKOUT_ACCEPTED_LONG_READY`;
  `BELOW + ACCEPTED` là SHORT đối xứng. Cả hai stream hạng 1–40 và 41–80 dùng MARKET **$10** cho hai case ACCEPTED này.
  Không tạo nhãn/card SHORT mới: runtime và thống kê tiếp tục nhận diện bằng `state=ACCEPTED + zoneSide=BELOW + side=SHORT`, nên không phát sinh
  checkbox `WHITELIST` mới.
- Riêng stream phụ hạng **41–80**, mọi entry Zone Lifecycle terminal khác dùng margin **$2.5**. Mọi entry terminal của stream phụ,
  kể cả ACCEPTED $10, đặt một TP đóng 100% tại **+6% ROE** tính lại từ giá fill thật; với leverage 5x, khoảng giá tương ứng là 1.2%
  theo hướng có lợi. Đây vẫn là TP-only, không đặt SL. Stream chính hạng 1–40 giữ TP adaptive hiện có; nhánh riêng
  `[ZONE REVERSAL LONG]` vẫn $1 và không nằm trong thay đổi này. Rule chỉ áp cho event/entry phát sinh sau reload, không sửa position, order hay TP đang mở.
- Thống kê không đổi: LONG/SHORT vẫn vào cohort `COINGLASS_ZONE_LIFECYCLE_LONG` / `COINGLASS_ZONE_LIFECYCLE_SHORT`, filled/closed và
  PnL lấy theo Binance order/Income như trước; margin $10 hay $2.5 và TP fixed chỉ là metadata của record entry mới. Không đổi W/L, WR, PF,
  AvgROE hoặc cách tính Net PnL lịch sử.
- Tương thích JSON cũ: các field `acceptedBreakout`, `takeProfitRoePct`, `takeProfitMode=FIXED_FULL_6ROE` và config ACCEPTED/fixed-ROE đều
  additive/optional. State/processed-event JSON cũ vẫn đọc được; `ZLC1` event id giữ nguyên, không migrate/backfill và không replay terminal event cũ.

### Hot paper store chống nghẽn RAM và treo HTTP (2026-09-03)

- Version `PAPER_HOT_STORE_V1_ACTIVE_PLUS_RECENT_CLOSED_20260903`. Dữ liệu causal trước entry và mọi detector/gate/label/tier giữ nguyên; thay đổi chỉ
  nằm ở cách lưu/nạp lịch sử paper. `liquid`, `edge` và `pump` hot store giữ toàn bộ record không mang status `CLOSED`, sau đó giữ các record
  `CLOSED` mới nhất đến quota mặc định 1.000 dòng. CLOSED cũ được ghi nguyên record vào `data/archive/*-paper-trades.ndjson` trước khi bị loại khỏi
  hot JSON/RAM; nếu số active vượt quota thì không xóa active.
- Phân loại tín hiệu không đổi. Archive/compact được serialize, hot JSON ghi qua file tạm rồi atomic rename; script vận hành
  `npm run compact:hot-paper` kiểm tra số dòng file mới trước rename. PM2 heap giảm từ 16 GB xuống 4 GB, memory restart từ 18 GB xuống 4 GB;
  watchdog startup grace là 2 phút và restart grace 5 phút thay vì 1 giờ để server không nằm treo lâu khi healthcheck thất bại.
- Cách thống kê: realtime, open/PENDING và cửa sổ CLOSED gần đây dùng hot store như trước. Trang/API `all` hiện tổng hợp trên cửa sổ hot, không tự
  đọc toàn bộ NDJSON archive vào tiến trình web; lịch sử đầy đủ vẫn còn nguyên trong archive để chạy báo cáo offline/backfill. Không thêm hoặc đổi
  signal card, nhãn, cohort, W/L, WR, PF, AvgROE, Net PnL hay checkbox `WHITELIST`.
- Ảnh hưởng Binance/entry/size/SL/TP: không có; compact không gọi executor và không thay đổi position/order thật. Tương thích JSON: field
  `hotStore` là additive/optional; file cũ không có field vẫn đọc được, record archive giữ nguyên schema trade cũ, không rewrite outcome/PnL.
- Edge journal chạy `EDGE_PAPER_ENTRY_JOURNAL_RECOVERY_V3_RECENT_PREPARED_ONLY_20260903`: chỉ journal event `PREPARED` còn thiếu trong hot JSON và
  có tuổi tối đa 30 phút mới được phục hồi sau crash; `COMMITTED`, `CLOSED`, `DELETED` và PREPARED cũ không được dựng lại. Khi phục hồi thành công,
  runtime ghi ngay `COMMITTED`;
  khi đóng live-card paper thì ghi terminal `CLOSED`. Maintenance compactor đối chiếu id edge archive để loại bản OPEN giả đã từng bị recovery V1 dựng lại.
  `EDGE_PAPER_ENTRY_JOURNAL_COMPACTION_V1_TERMINAL_ARCHIVE_20260903` lưu nguyên journal trên 64 MiB vào archive rồi chỉ giữ recent PREPARED đang
  cần recovery. Đây là sửa storage/recovery, không đổi causal input/phân loại/thống kê kết quả hay Binance/entry/size/SL/TP; journal V1 cũ vẫn đọc được.

### Coin Level Discord: REJECTED/APPROACHING một phía và setup hai phía (2026-09-02)

- Version `COIN_LEVEL_LIFECYCLE_DISCORD_V5_ONE_SIDED_REJECT_APPROACH_20260902`. Dữ liệu causal trước cảnh báo giữ nguyên Coin Level V9:
  Binance public mark/bias và trạng thái xác nhận từ nến 15m đã đóng, cộng CoinGlass Model 3 active edge 48h/12h/24h đã gắn lifecycle;
  CoinGlass stale hoặc Binance `STALE_LAST_GOOD` vẫn fail-closed.
- Phân loại: chỉ cần một active zone có `REJECTED` hoặc `APPROACHING` là đủ gửi cảnh báo một phía. `ABOVE REJECTED` là `SHORT WATCH`,
  `BELOW REJECTED` là `LONG WATCH`, `ABOVE APPROACHING` là `LONG WATCH`, `BELOW APPROACHING` là `SHORT WATCH`. Embed ghi rõ đây chỉ là
  cảnh báo khoảng cách/phản ứng một phía, chưa phải entry hay xác nhận hướng. Khi có đủ `REJECTED + FRESH|APPROACHING` phía đối diện, V4-style
  setup hai phía vẫn được ưu tiên và hai zone đã ghép không phát thêm message một phía; second-rejection READY hai chiều V3 giữ nguyên.
- Dedupe 4 giờ đổi sang `symbol + eventType` thay vì exact band để dịch chuyển nhẹ biên heatmap không làm FIL hoặc coin khác phát lặp. Thống kê
  không đổi: toàn bộ event vẫn `OBSERVE ONLY`, không tạo signal label/card/tier, paper, W/L, WR, PF, AvgROE, Net PnL hoặc checkbox `WHITELIST`.
- Ảnh hưởng Binance/entry/size/SL/TP: không có; không gọi credential/executor, không mở/đóng/DCA, không đặt/sửa entry, margin, leverage, SL, TP,
  position hoặc order. Tương thích JSON: state dedupe V1–V4 vẫn đọc được và hết hạn tự nhiên; V5 thêm các event type `*_ONE_SIDED`, field
  `oneSided/zoneSide/lifecycle/zone` theo hướng additive và nâng version khi ghi tiếp, không migrate/rewrite/backfill snapshot, trade hay outcome cũ.

### Post Pump Kill Short confirmed: Binance thật margin $1 (2026-09-02)

- Versions `PPKS_BINANCE_CONFIRMED_SHORT_V2_1USDT_20260902` và policy trung tâm
  `LIVE_CARD_LIQ_FLOW_COINGLASS_PUMP_DUMP_PPKS_V18_20260902`; rule này supersede hard-off
  `PPKS_BINANCE_HARD_OFF_V1_20260803` **chỉ cho exact PPKS SHORT xác nhận**. Dữ liệu causal trước entry vẫn là nến Binance 15m OHLC/volume
  đã đóng, ATR14, EMA13/25/99, RSI6/14, pump trước đó, nhịp distribution, kill-short spike/sweep, volume ratio và mức rút râu/đóng cửa;
  snapshot mark/24h chỉ dùng để hiển thị/enrich, không dùng outcome hoặc PnL tương lai.
- Phân loại được phép phải đồng thời `type=post_pump_kill_short`, `stage=confirmed_short`, `action=SHORT`, score `>=60` và có đủ
  entry/SL cấu trúc/TP. `watch_spike`, mọi nhánh LONG/`post_dump_kill_long`, score dưới gate hoặc plan thiếu giá tiếp tục không vào Binance.
  Dedupe theo `symbol+stage+type` 4 giờ; existing position hoặc non-reduce-only entry order cùng symbol, max-position, Orders disabled/dry-run,
  credential/API/precision đều fail-closed như trước.
- Thống kê giữ nguyên PPKS paper và Edge paper hiện hữu, không thêm/reclassify label, card, tier, cohort, W/L, WR, PF, AvgROE hoặc Net PnL;
  vì không có card mới nên không tạo checkbox `WHITELIST`. Lệnh thật mới chỉ được audit qua order/fill lifecycle chung và Discord real-order.
- Ảnh hưởng Binance cho tín hiệu phát **sau reload**: MARKET SHORT, margin runtime/default `$1`; leverage dùng cấu hình mặc định `10x` nhưng hạ
  về `5x` khi khoảng SL cấu trúc quá rộng, nên notional là `$5` hoặc `$10`. `allowMinNotionalCeil` có thể làm quantity/margin thực nhỉnh hơn `$1`
  tối thiểu để hợp lệ với sàn. Theo policy SHORT bot đang chạy, SL hiển thị trên Discord chỉ dùng xác nhận cấu trúc/chọn leverage và **không đặt
  STOP lỗ**; TP detector được chuẩn hóa theo policy non-Liquid-Flow thành TP-only `+6% ROE`, neo lại theo average fill. Không hồi tố SKR/HEMI đã
  phát trước deploy và không thay vị thế/lệnh đang mở.
- Tương thích JSON: không đổi schema, không migrate/rewrite/backfill snapshot/paper/trade/tracking cũ. Authorization PPKS là Symbol nội bộ
  non-enumerable, không thể giả bằng payload JSON; cấu hình `.env.example` vẫn opt-in mặc định tắt, runtime máy này đã bật với min score `60`.

### Fast-wave recovery V1: âm sâu giữ TP, hồi +10% mới khóa SL +1% (2026-09-02)

- Versions `BINANCE_NEGATIVE_TP_TO_ENTRY_V5_FAST_WAVE_RECOVERY_20260902`,
  `BINANCE_FAST_WAVE_RECOVERY_V1_ARM_NEG20_LOCK1_AT10_20260902` và profit-lock
  `BINANCE_PROFIT_LOCK_V20_FAST_WAVE_RECOVERY_LOCK_20260902`. Dữ liệu causal sau entry gồm active Binance position (side, average entry,
  leverage, mark/uPnL), nến 5m/15m hiện có trong cache và nguồn position manual/Liquid Flow V2/SHORT TP-only; không dùng change 24h hoặc outcome
  tương lai.
- Nếu bot vừa restart mà cache nến 5m/15m chưa có, policy trả `CANDLE_DATA_PENDING`: cả TP rewrite lẫn profit-lock tạm hoãn và giữ nguyên order
  hiện tại đến lần monitor sau khi warm-up, tránh cửa sổ startup phân loại nhầm fast-wave thành coin thường.
- Phân loại: khi position đạt `ROE <= -20%` và classifier V19 xác nhận `FAST_WAVE` bằng râu/đảo chiều mạnh, state của exact lifecycle chuyển
  `ARMED`. Trong state này mọi đường deep-loss realtime, scanner, AutoTP, TP guard và rule âm sau 8 giờ đều **không hủy TP hiện tại và không đặt
  LIMIT close tại entry**. State được giữ dù nến fast-wave sau đó ra khỏi lookback. Khi ROE phục hồi tới `>=+10%`, profit-lock đặt/replace
  STOP_MARKET tại `+1% ROE` rồi ghi `LOCKED`; không MARKET-close tại entry. Coin không FAST_WAVE giữ nguyên TP-to-entry ở `<=-20%`.
- Thống kê/label/tier: đây là protection state sau entry, không thêm signal/card/cohort W/L, WR, PF, AvgROE, Net PnL hoặc checkbox WHITELIST.
  Audit runtime ghi `ARMED`, `TP_REWRITE_BLOCKED`, `WAIT_RECOVERY`, `LOCKED` theo symbol/lifecycle.
- Ảnh hưởng Binance thật: có thay hành vi TP/SL cho các lệnh **về sau** và lifecycle còn mở sau reload. Entry, side, margin, size, leverage và TP
  người dùng đang đặt được giữ nguyên khi recovery được arm; SL chỉ dời lên `+1%` sau khi đã hồi `+10%`. Không hồi tố lệnh đã đóng và không tự
  phục hồi TP đã bị V4 hủy trước deploy. TP `+30% ROE` của LONG mở tay vẫn là fallback `MANUAL_SOCKET_TP_ROE30`; V20 chỉ ngăn deep-loss xóa TP đó
  trong fast-wave.
- Tương thích JSON: các field `fastWaveRecovery*` trong `sl-tracking.json` đều optional additive và chỉ được tin khi exact version + lifecycle key
  khớp; JSON cũ thiếu field tiếp tục đi theo policy bình thường. Reset/position close xóa state, không migrate/rewrite/backfill trade/order cũ.

### Binance profit-lock V19: FAST_WAVE chỉ khi có râu hoặc đảo chiều mạnh (2026-09-02)

- Version `BINANCE_PROFIT_LOCK_V19_WICK_REVERSAL_FAST_WAVE_20260902`. Dữ liệu trước entry, signal label và quyền vào lệnh không đổi; đây là
  protection sau entry. Mỗi lần quản lý SL, runtime dùng side, average entry, leverage, Mark/ROE Binance cùng tối đa ba nến 5m và hai nến 15m
  đang có trong KlineCache. Không dùng `% thay đổi 24h`, outcome tương lai hoặc PnL paper để phân loại.
- Phân loại hai tầng: range nến vẫn phải đạt `>=4%` trên 5m hoặc `>=6%` trên 15m, sau đó chỉ bật `FAST_WAVE` nếu râu lớn nhất chiếm
  `>=30%` toàn range, hoặc thân nến đi **ngược hướng vị thế** chiếm `>=55%` range. Vì vậy nến xanh thân lớn đóng gần đỉnh của LONG và nến đỏ
  thân lớn đóng gần đáy của SHORT là `DIRECTIONAL_BODY_ONLY`, quay về profit-lock thường; nến rút râu hoặc thân đảo chiều mạnh mới được defer
  tới ladder fast-wave `ROE 30% -> lock +5%`, gap 25. `ZKPUSDT,4USDT` chỉ còn là danh sách audit, không bypass hình dạng nến.
- Thống kê/WHITELIST: không thêm nhãn, card, tier, cohort hay checkbox; W/L, WR, PF, AvgROE và NET PnL không đổi. Đây không phải signal mới và
  không reclassify lịch sử. Test fixture bao phủ thân thuận hướng, râu lớn, thân đảo chiều, explicit-symbol và range bình thường.
- Ảnh hưởng Binance: không đổi entry, side, margin, size, leverage, TP hoặc SL lỗ ban đầu. V19 chỉ quyết định dùng ladder SL thường hay trì hoãn
  fast-wave ở lần monitor kế tiếp; không sửa lệnh đã đóng và không MARKET-close. Armed state chỉ được kế thừa khi cùng exact V19 + cùng classifier,
  nên state V18 quá rộng không tiếp tục trì hoãn vị thế đang mở sau reload; STOP tốt hơn đã tồn tại trên Binance không bị nới lỏng.
- JSON cũ tương thích: không thêm field bắt buộc và không migrate/rewrite/backfill `sl-tracking`, execution, trade, snapshot hay outcome. Các field
  `profitLock*` cũ vẫn đọc được để audit; lần arm/move mới ghi version V19. Threshold mới có env optional
  `BINANCE_FAST_WAVE_CANDLE_WICK_MIN_RATIO=0.30` và `BINANCE_FAST_WAVE_CANDLE_REVERSAL_BODY_MIN_RATIO=0.55`.

### V2 Binance Stats V4: nối CoinGlass Zone Lifecycle top 1–80 (2026-09-02)

- Version `LIQUID_FLOW_V2_BINANCE_STATS_V4_ZONE_LIFECYCLE_20260902`, UI
  `LIQUID_FLOW_V2_BINANCE_STATS_UI_V8_ZONE_LIFECYCLE_20260902`. Đây là sửa nguồn **reporting sau fill**: ngoài Liquid Flow V2 paper có
  Binance fill và CoinGlass Qualified, API `/api/liquid-flow-v2-binance-stats` đọc thêm `processedEvents`/reversal watch đã `SUBMITTED` từ
  hai lifecycle store primary top `1–40` và secondary top `41–80`, rồi xác minh exact `symbol + orderId` là `FILLED` bằng Binance order hoặc
  tracking record cùng source `coinglass-zone-lifecycle`. Không bổ sung dữ liệu hay điều kiện nào trước entry.
- Phân loại thống kê dùng hai reporting key `COINGLASS_ZONE_LIFECYCLE_LONG` và `COINGLASS_ZONE_LIFECYCLE_SHORT`; `REJECTED`, `ACCEPTED`,
  `SUPPORT_RECLAIM_LONG_READY`, `UNCONFIRMED_BOUNCE_LONG` và reversal vẫn giữ audit gốc, chỉ được gom theo side trên bảng. Filter ngày dùng
  thời điểm fill theo Asia/Bangkok; lệnh mở lấy Binance Position realtime, lệnh đóng chỉ tính W/L, WR, PF, AvgROE và Net PnL khi đối soát được
  Binance Income theo cửa sổ lifecycle. Event `OBSERVE_*`, `BLOCKED_*`, `SUBMITTED` chưa xác nhận fill và lệnh tay không được tính.
- Không ảnh hưởng Binance/entry/size/leverage/SL/TP, không đặt/hủy/sửa/đóng lệnh và không backfill kết quả giả. Hai key trên chỉ là alias
  reporting của loại tín hiệu đã chạy, không phải card/gate runtime mới; cột điều khiển hiển thị `KHÔNG CÓ AUTO ROUTE`, nên không tạo checkbox
  `WHITELIST` giả hoặc thay đổi whitelist hiện hành.
- JSON cũ tương thích: audit thiếu `signalLabel`, `marginUsdt`, `leverage` hoặc fill metadata vẫn đọc bằng fallback state/stream config và exact
  Binance order/tracking; không migrate/rewrite `zone-lifecycle.json`. Reversal cũ dùng optional `longOrderId/longSubmittedAt`; record không đủ
  exact order/fill bị bỏ khỏi stats thay vì đoán là lệnh thật.

### CoinGlass secondary V4: Discord chỉ gửi Lifecycle đã pass (2026-09-01)

- Version `COINGLASS_WEB_SECONDARY_STREAM_V4_PASS_ONLY_DISCORD_20260901`. Chỉ luồng secondary global rank `41–80` đổi chính sách Discord;
  primary `1–40`, webhook primary và thông báo đăng nhập/auth-required không đổi. Dữ liệu causal/classifier trước entry vẫn là Model 3 edge zones,
  lifecycle state, scan/persistence, latest OHLC và next-edge target của cùng lượt scan; không dùng future candle, PnL hay outcome.
- `pass` được định nghĩa đúng theo runtime `event.shouldEnter === true`: transition terminal `REJECTED` hoặc `ACCEPTED` và `entryPlan.complete=true`
  với target đúng hướng cách `1–15%`. `APPROACHING`, `SWEPT` và terminal thiếu target tiếp tục được advance/store để giữ state nhưng bị
  `SUPPRESSED_SECONDARY_NON_ENTRY_TRANSITION`, không post webhook. Event pass vẫn gửi dù Binance sau đó bị block bởi position/order/global switch,
  vì đây là kết quả signal gate chứ không phải xác nhận order fill.
- Không đổi Binance/entry/side/size/leverage/SL/TP: support reclaim `$3`, secondary base/large `$1`, reversal `$1` và TP-only hiện hữu giữ nguyên.
  Không thêm label/card thống kê nên không có checkbox `WHITELIST`; W/L, WR, PF, Net PnL, AvgROE và history không đổi. JSON cũ tương thích:
  audit mới có optional `notificationDecision`, record cũ thiếu field vẫn đọc nguyên và không migrate/rewrite.

### CoinGlass Zone Lifecycle V11: `SUPPORT_RECLAIM_LONG_READY`, Binance $3 (2026-09-01)

- Versions `COINGLASS_ZONE_LIFECYCLE_V11_SUPPORT_RECLAIM_LONG_3USDT_20260901`, Discord
  `COINGLASS_ZONE_LIFECYCLE_DISCORD_V11_SUPPORT_RECLAIM_LONG_20260901` và executor
  `COINGLASS_ZONE_LIFECYCLE_BINANCE_V11_SUPPORT_RECLAIM_LONG_3USDT_20260901`. Dữ liệu causal trước entry chỉ gồm Model 3 edge zone hiện tại,
  phía gốc của zone, lifecycle/scan persistence, OHLC mới nhất và vùng target mép phải kế tiếp; không dùng future candle, PnL hay outcome.
- Phân loại `SUPPORT_RECLAIM_LONG_READY` chỉ phát sinh khi LONG là `BELOW → SWEPT → REJECTED`, close đã lấy lại trên band với buffer hiện hữu,
  nến tăng, râu dưới ít nhất `20%` toàn range và close nằm từ `65%` range trở lên. `ABOVE → ACCEPTED` được ghi riêng
  `BREAKOUT_ACCEPTED_LONG_READY`; BELOW rejected thiếu bộ nến được ghi `UNCONFIRMED_BOUNCE_LONG`. Đây là xác nhận support-reclaim cấu trúc,
  không tuyên bố đảo xu hướng dài hạn và chưa dùng EMA/taker/OI.
- Discord Lifecycle của cả primary/secondary thêm exact classifier, checklist zone/râu/close-location và cảnh báo phân biệt support bounce với
  breakout/bounce chưa xác nhận. Chỉ `SUPPORT_RECLAIM_LONG_READY` nâng margin Binance lên `$3 x5`; base/strong-SHORT/large-target primary vẫn `$2`,
  secondary base/large-target vẫn `$1`. Entry vẫn MARKET terminal, target `1–15%`, TP adaptive/re-anchor theo fill và lifecycle TP-only không SL.
  Không resize, cancel, sửa TP/SL hay đóng position/order đã tồn tại; chỉ event mới sau reload bị ảnh hưởng.
- Thống kê lịch sử không backfill/reclassify; lifecycle audit mới lưu optional `signalLabel`, `marginRule`, `marginUsdt`. Đây là sub-classifier Discord/
  execution, không tạo card/label paper thống kê mới, nên không có checkbox `WHITELIST`; W/L, WR, PF, Net PnL và AvgROE hiện hữu không đổi.
  JSON cũ tương thích: track/event/audit thiếu `signalLabel` và `supportReclaim` tiếp tục đọc bằng fallback, không migrate/rewrite lịch sử.

### CoinGlass secondary stream V2: Lifecycle hạng 41–80, Binance $1 (2026-08-30)

- Version `COINGLASS_WEB_SECONDARY_STREAM_V2_RANK_41_80_LIFECYCLE_1USDT_20260830`, thay V1 observe-only. Luồng chính hạng `1–40`, lịch 3 phút,
  webhook/executor và state hiện hữu không đổi. Luồng phụ giữ manager, scheduler, persistent browser profile, snapshot/progress/auth/notification/
  execution/lifecycle files và trang `/coinglass-web-secondary` riêng trong `data/coinglass-web-secondary`; không đọc/ghi dedupe của primary.
- Dữ liệu causal trước entry giống collector chính: Binance Futures USDT perpetual, top mover tăng/giảm 24h kiểu app, volume/trade count, OI,
  top-book/spread; structured CoinGlass Model 3 48h, edge zones/strength/persistence/latest OHLC và context 12h/24h khi đã có. Slice diễn ra sau
  khi dựng mover universe với `rankOffset=40`, `limit=40` (global rank `41–80`); không dùng future candle, PnL hoặc outcome.
- `CoinGlass Qualified` của secondary vẫn **OBSERVE ONLY**: không gọi qualified Discord/executor. Nhánh riêng Lifecycle advance
  `FRESH → APPROACHING → SWEPT → REJECTED/ACCEPTED`; Discord riêng nhận transition, còn Binance chỉ được xét ở terminal REJECTED/ACCEPTED có
  next edge target đúng hướng cách `1–15%`, qua slippage/no-position/no-entry-order/global Orders/dry-run/credential/max-position gates.
- Entry lifecycle mới là MARKET margin `$1`, leverage `5x`; cả rule large-target cũng cố định `$1` để không kế thừa `$6` của primary. TP adaptive
  V7 giữ nguyên và re-anchor theo fill; lifecycle vẫn TP-only, không đặt SL. Chỉ entry phát sinh sau reload bị ảnh hưởng; không resize, cancel,
  sửa TP/SL hoặc MARKET-close position/pending order đã tồn tại. Scheduler phụ vẫn 6 phút, lệch `270s`, budget `150s`, concurrency `4`, nice `10`.
- Stream phụ không tạo paper hoặc signal stats, nên W/L, WR, PF, Net PnL và AvgROE không đổi; trang chỉ đếm row/qualified tham khảo và lifecycle
  tracks. Không thêm signal label/card/reporting key nên không phát sinh checkbox `WHITELIST`.
- JSON cũ tương thích: snapshot/state V1 secondary được đọc tại cùng data dir, các field `streamId`, `streamVersion`, `globalRank`, `streamRank`
  và lifecycle audit đều optional; không migrate/rewrite primary hoặc history cũ. Thiếu login profile phụ thì scan fail-closed `auth_required`,
  gửi cảnh báo cooldown qua webhook lifecycle riêng, không có event terminal và không vào Binance.

### Liquid Flow V2 SHORT EMA99 confirmation gate V1 (2026-08-30)

- Versions `LIQUID_HEATMAP_FLOW_V2_SHORT_EMA99_CONFIRMATION_GATE_V25_20260830`,
  `LIQUID_FLOW_V2_SHORT_EMA99_ENTRY_GATE_V1_20260830`,
  `LIQUID_FLOW_V2_PAPER_V32_SHORT_EMA99_CONFIRMATION_GATE_20260830` và
  `LIVE_CARD_WHITELIST_V17_SHORT_EMA99_WATCH_20260830`. Dữ liệu causal dùng trước entry gồm EMA99 từ nến **đã đóng** của 5m/15m,
  close của nến đã đóng, khung retest 5m/15m nếu classifier đã chọn, bằng chứng rút râu/reject riêng của từng mẫu và taker flow đã đóng
  (`takerDelta` hoặc `breakdownTakerDelta`). Không dùng future candle, PnL hay outcome sau entry.
- Gate chỉ áp cho bốn nhãn thua khi SHORT sát EMA99: `DOWN_BASE_SWEEP_SHORT_READY`, `PRE_DOWN_BASE_SHORT`,
  `HTF_BEAR_15M_EMA99_PUMP_REJECT` và `PUMP_DISTRIBUTION_SHORT_READY`. `UP_SWEEP_SHORT_READY`, `EMA_FAN_SHORT_READY` và toàn bộ
  `CoinGlass Zone Lifecycle` được miễn; lifecycle vẫn chạy classifier/entry riêng.
- Phân loại mới: close cách EMA99 từ `-1%` đến `-0,5%` chỉ giữ READY khi đồng thời có reject/râu trên hợp lệ và taker sell flow `<=0`.
  Khoảng `>-0,5%` (gồm vùng tranh chấp `|distance|<=0,5%` và mọi close còn trên EMA99), thiếu EMA causal, thiếu reject hoặc taker flow mua
  đều chuyển sang `SHORT_EMA99_CONFIRMATION_WATCH`; close đã dưới EMA99 quá `1%` cũng chuyển WATCH để không đuổi SHORT. Audit giữ
  `sourceLabelKey`, timeframe, EMA99, distance, reject/sell-flow và reason; label WATCH là `OBSERVE_ONLY`, không phải gate giao dịch thật độc lập.
- Căn cứ thống kê paper V2 7 ngày trước thay đổi: SHORT gần EMA99 `|distance|<=0,5%` có `127` lệnh, WR `52,8%`, PF `0,70`, AvgROE
  `-2,01%`; vùng xác nhận dưới EMA99 `0,5-1%` có `82` lệnh, WR `68,3%`, PF `2,05`, AvgROE `+2,98%`; dưới quá `1%` có PF `0,88`.
  Mở rộng 14 ngày cho PF `0,77` so với `1,35`; loại episode trùng coin trong 4 giờ cho PF `0,70` so với `1,60`. Thống kê lịch sử không bị
  viết lại; giao diện tiếp tục nhóm theo exact label của trade đã tạo.
- Có ảnh hưởng tới **entry mới**: ba nhãn `DOWN_BASE/PRE_DOWN_BASE/HTF_BEAR` chỉ có thể tạo paper và đi tiếp tới Binance khi gate READY;
  `PUMP_DISTRIBUTION` hiện vẫn paper-only nhưng chịu cùng gate. Không đổi margin/size, leverage, kiểu entry, SL hoặc TP của tín hiệu hợp lệ;
  không cancel/sửa pending order, paper trade hay position Binance đã tồn tại trước reload.
- Nhãn/card WATCH mới nối exact key `heatmap-v2:SHORT_EMA99_CONFIRMATION_WATCH`; checkbox WHITELIST mặc định tắt và chỉ được hiện khi mẫu
  CLOSED của chính key có `AvgROE >4%`. JSON cũ tương thích: `ema99ShortEntryGate` và `sourceLabelKey` là optional, record cũ không migrate/
  rewrite; runtime thiếu dữ liệu EMA causal sẽ fail-closed thành WATCH thay vì vào lệnh.

### CoinGlass Zone Lifecycle V7: SHORT chốt từng phần, sóng tăng mạnh chốt sớm (2026-08-30)

- Versions `COINGLASS_ZONE_LIFECYCLE_V7_SHORT_ADAPTIVE_PARTIAL_TP_20260830`, Discord
  `COINGLASS_ZONE_LIFECYCLE_DISCORD_V7_SHORT_ADAPTIVE_PARTIAL_TP_20260830`, executor
  `COINGLASS_ZONE_LIFECYCLE_BINANCE_V7_SHORT_ADAPTIVE_PARTIAL_TP_20260830` và protection
  `COINGLASS_ZONE_LIFECYCLE_PARTIAL_TP_V2_BOTH_SIDES_STRONG_SHORT_20260830`. Dữ liệu causal trước entry giữ Model 3 48h hiện tại: vùng mép phải,
  band/strength/persistence, latest OHLC, transition terminal và vùng TP kế tiếp; bổ sung `change24hPct` của Binance trong đúng snapshot lượt quét.
  Không dùng future candle, PnL hay outcome sau entry.
- Classifier/gate lifecycle không đổi: `FRESH → APPROACHING → SWEPT → REJECTED/ACCEPTED`, target gốc vẫn phải cách `1-15%`. SHORT có target
  gốc `<=3%` đóng 100% tại zone; target `>3%` dùng TP1 `-2%` đóng `70%`, TP2 đóng `30%` tại vùng gốc nhưng không xa hơn `-5%`. Nếu SHORT xảy ra
  khi coin còn `change24hPct >= +10%`, phân loại `STRONG_UP_WAVE`: target xa hơn `1%` dùng TP1 `-1%` đóng `80%`, TP2 `20%` không xa hơn `-3%`.
  LONG tiếp tục V6 `+2%/70%` và tối đa `+5%/30%`.
- Binance thật: các leg được re-anchor theo average fill, chia quantity theo `LOT_SIZE` và đặt reduce-only/đúng `positionSide`; quantity không đủ
  hai step thì đóng 100% ở TP1. Không đổi entry, side, margin `$5`/rule `$6` của LONG hoặc leverage `5x`; protection lúc entry vẫn TP-only,
  ngoại lệ BE runner chỉ phát sinh sau TP1 như bullet kế tiếp.
  Rule V7 chỉ được tạo trong protection plan của entry mới sau reload; không resize, không cancel/replace TP và không MARKET-close position đã mở.
  Negative TP-to-entry V4 hiện hữu giữ nguyên, không thuộc thay đổi V7.
- Protection runner version `COINGLASS_ZONE_LIFECYCLE_STRONG_SHORT_BE_V1_FUTURE_ENTRY_RUNNER_ONLY_20260830`: chỉ entry V7 có mode
  `SHORT_PARTIAL_80_20_STRONG_WAVE` và metadata `STRONG_UP_WAVE`. Sau khi xác nhận TP1 không còn open và position quantity chỉ còn runner TP2,
  nếu ROE Binance `>=+5%` thì đặt `STOP_MARKET BUY reduceOnly` cho đúng remaining quantity tại average entry. `ZKPUSDT`, `4USDT` hoặc coin có
  `|change24hPct|>=25%` bị loại; nếu Mark đã quay lên entry trước placement thì giữ runner, không emergency MARKET-close. Position cũ thiếu exact
  V7 metadata không match nên không bị tác động.
- Không thêm signal label/tier/stats card/reporting key, nên không phát sinh checkbox `WHITELIST`; W/L, WR, PF, Net PnL và AvgROE không đổi.
  JSON cũ tương thích: các field mới `change24hPct`, `shortWaveClass`, mode/legs SHORT và audit break-even runner đều optional; record V6/SINGLE_FULL vẫn đọc nguyên,
  không migrate/rewrite history. Entry mới sau reload nhận V7; mọi vị thế mở trước reload tiếp tục chạy protection/order hiện hữu.

### Binance profit-lock V14: FAST_WAVE không còn bị khóa lời/cắt MARKET quá sớm (2026-08-29)

- Version `BINANCE_PROFIT_LOCK_V14_FAST_WAVE_DEFERRED_LOCK_20260829`. Dữ liệu causal sau entry gồm active Position Risk/socket của Binance,
  exact symbol/side, average entry, leverage, ROE/Mark hiện tại, source/lifecycle trước entry, same-side DCA fill gần nhất và Binance public
  `change24hPct` từ snapshot không quá 3 phút. Không dùng nến tương lai, outcome, paper PnL hay thống kê hậu nghiệm.
- Phân loại `FAST_WAVE` chỉ áp cho **LONG tay hoặc Liquid Flow V2** khi symbol thuộc `BINANCE_FAST_WAVE_SYMBOLS` (mặc định
  `ZKPUSDT,4USDT`), có `|change24hPct| >=10%`, hoặc vừa có same-side DCA trong 15 phút. SHORT, CoinGlass lifecycle TP-only và source bot khác
  giữ policy hiện hữu. FAST_WAVE dưới `+30% ROE` giữ SL gốc; `30..39,99 -> lock +5`, `40..49,99 -> +15`, `50..59,99 -> +25`, tức giữ
  khoảng thở 25 điểm ROE thay vì ladder manual `10 -> +1` cũ.
- Khi Mark đã xuyên target trước lúc replace hoặc Binance trả immediate-trigger, FAST_WAVE không gửi reduce-only MARKET emergency; bot giữ/rollback
  SL gốc và retry sau. Ngoài FAST_WAVE, quy trình V13 cancel đúng STOP cũ, place STOP mới, verify và rollback/fail-safe MARKET không đổi.
- Thống kê/WHITELIST không đổi: không thêm nhãn/card/reporting key/checkbox; W/L, WR, PF, Net PnL, AvgROE và policy whitelist default-off,
  chỉ hiện khi CLOSED AvgROE `>4%`, giữ nguyên. Đây là protection sau entry, không phải signal gate.
- Ảnh hưởng Binance thật: chỉ thay thời điểm và mức dời SL/profit-lock của FAST_WAVE; không đổi entry, side, margin, size, leverage, TP hoặc SL lỗ
  gốc. Same-side DCA vẫn giữ protection của position gốc. JSON cũ tương thích: chỉ thêm optional `profitLockFastWave` và
  `profitLockFastWaveReason`; record V13 không migrate/rewrite/replay và armed state cũ không được kế thừa vào fast-wave lifecycle V14.

### CoinGlass Zone Lifecycle V6: LONG chốt 70/30, TP2 tối đa +5% (2026-08-28)

- Versions `COINGLASS_ZONE_LIFECYCLE_V6_LONG_PARTIAL_TP_DYNAMIC_SIZE_20260828`, Discord
  `COINGLASS_ZONE_LIFECYCLE_DISCORD_V6_LONG_PARTIAL_TP_20260828`, executor
  `COINGLASS_ZONE_LIFECYCLE_BINANCE_V6_LONG_PARTIAL_TP_DYNAMIC_SIZE_20260828`, partial protection
  `COINGLASS_ZONE_LIFECYCLE_LONG_PARTIAL_TP_70_30_V1_20260828` và suppression
  `COINGLASS_ZONE_LIFECYCLE_TP_ONLY_NO_SL_V1_20260828`. Đây là pipeline riêng, không thay classifier, qualified route hoặc executor
  CoinGlass V14 hiện hữu.
- Dữ liệu causal trước entry là structured Model 3 48h của lượt scan hiện tại: exact instrument, last candle OHLC/close, `lastHeatmapX`, zone
  `lastX`, band low/high, strength và persistence bars. Chỉ zone còn cách mép phải tối đa 2 heatmap bars, tồn tại ít nhất 3 bars, strength `>=20`
  và cách giá tối đa 15% được theo dõi. Cùng band phải match qua tối thiểu 2 lượt scan; 12h/24h overlap chỉ bổ sung confidence/Discord khi dữ liệu
  đã có, không gate vì collector không luôn đủ budget. Không dùng outcome/PnL tương lai.
- Phân loại bền theo symbol + phía gốc của band: `FRESH` là lượt đầu; `APPROACHING` khi đã đủ 2 scan và còn cách `<=4%`; `SWEPT` khi high/low
  của candle chạm band; `REJECTED` khi sau sweep close quay ra ngoài band ít nhất `0.1%`; `ACCEPTED` khi close xuyên qua mép xa ít nhất `0.1%`.
  Phía gốc được giữ khi giá xuyên band để ABOVE có thể trở thành ACCEPTED thay vì bị đổi nhầm thành BELOW. Zone cũ không chạm mép phải bị loại,
  track biến mất hết hạn sau 18 phút.
- Discord webhook riêng nhận transition `APPROACHING`, `SWEPT`, `REJECTED`, `ACCEPTED`, có màu, band, scan/bars, OHLC, khung trùng, entry/TP/SL,
  kết quả Binance và link CoinGlass/Binance. Hai state đầu chỉ cảnh báo chờ. Entry chỉ sinh ở terminal: ABOVE rejected → SHORT, BELOW rejected → LONG,
  ABOVE accepted → LONG, BELOW accepted → SHORT; bắt buộc có zone mép phải kế tiếp đúng hướng làm TP, cách entry `1-15%`.
- TP mới chỉ áp cho lifecycle LONG: vùng CoinGlass gốc cách entry `<=3%` vẫn đóng 100% tại mép gần của zone kế tiếp; nếu `>3%`, TP1 ở
  `+2%` giá đóng `70%`, TP2 đóng `30%` tại giá thấp hơn giữa vùng CoinGlass gốc và `+5%`. Hai quantity được chia theo `LOT_SIZE` của symbol và
  hai `TAKE_PROFIT_MARKET` đều được re-anchor theo average fill thật. Nếu quantity không đủ tối thiểu hai step, toàn vị thế dùng TP1 `+2%`.
  Lifecycle SHORT giữ một TP 100% tại zone gốc; toàn bộ lifecycle vẫn TP-only, không đặt SL.
- Binance thật được user bật explicit qua `COINGLASS_ZONE_LIFECYCLE_BINANCE_ENABLED=true`: mặc định MARKET margin `$5`; chỉ
  `LONG + ABOVE → ACCEPTED + có 12h hoặc 24h trùng vùng + khoảng tới zone gốc >5%` mới dùng `$6`. Leverage giữ `5x`, tương ứng notional khoảng
  `$25/$30`; đúng `5%`, LONG dạng REJECTED hoặc thiếu đồng thuận 12h/24h vẫn `$5`. Không đảo/đóng vị thế;
  block nếu symbol đã có position hoặc entry order, global Orders/dry-run/credential/max-position vẫn áp dụng, Mark phải còn đúng phía band và lệch signal
  không quá `1.5%`. Cả LONG và SHORT của đúng source `coinglass-zone-lifecycle` đều TP-only: entry plan, MARKET order, socket full-fill,
  `setTpSl`, missing-SL guard và profit-lock không tạo/tái tạo/dời SL. Các source LONG khác giữ policy SL/TP hiện hữu; STOP đã tồn tại trước deploy
  không tự bị hủy.
- Không tạo paper, signal label, tier, stats card hay reporting key, do đó không thêm checkbox `WHITELIST`; W/L, WR, PF, Net PnL và AvgROE hiện hữu
  không đổi. JSON cũ tương thích: snapshot chỉ thêm optional `latestCandle`, `lastHeatmapX`, `edgeZones`; state/dedupe nằm riêng ở
  `data/coinglass-web-top20/zone-lifecycle.json`; không migrate/rewrite history. V6 chỉ thêm optional `zoneTakeProfitPrice`,
  `zoneTargetDistancePct`, `takeProfitMode`, `takeProfitLegs`, `marginRule` và `signalTakeProfitLegs`; reader cũ vẫn dùng được field TP cuối.
  Rule chỉ áp entry mới sau reload, không resize, tách TP hay cancel TP/STOP của vị thế đang mở; deploy đầu vẫn phải quan sát đủ 2 scan trước transition.

### Khôi phục TP về entry khi ROE âm sâu, độc lập Cap TSL (2026-08-24)

- Version `BINANCE_NEGATIVE_TP_TO_ENTRY_V4_CAP_TSL_INDEPENDENT_ROE20_20260824`, thay V3. Đây là protection **sau entry**: dữ liệu dùng là
  active Binance position, average `entryPrice`, Mark/uPnL, initial margin hoặc leverage để tính ROE realtime; lúc thực thi mới đọc regular/algo
  close orders và tick/lot metadata. Không dùng candle, signal outcome, paper PnL hay dữ liệu tương lai.
- Mọi vị thế bot, Liquid Flow V2 và lệnh tay đều match khi ROE `<=-20%`, kể cả symbol đang check `Cap TSL`. Cap TSL tiếp tục chỉ giới hạn
  profit-lock/trailing SL dương; nó không còn vô hiệu hóa emergency TP-to-entry. Socket có thể kích hoạt theo tick, scanner dự phòng chạy mỗi
  `NEG_TP_SCAN_INTERVAL_MS` (hiện 90 giây), deep guard của TP recovery cũng dùng cùng policy; dedupe theo symbol + entry và cooldown hai phút.
- Worker TP âm sâu và cleaner LIMIT 12 giờ được start ngay khi server listen, không chờ kline warm-up. Vì vậy tải nến chậm hoặc treo không còn
  làm mất vòng bảo vệ vị thế. Scanner/cleaner có start guard và single-flight để reload hoặc vòng chậm không tạo job chồng nhau.
- Khi match, chỉ hủy TP close-side cũ nằm xa entry rồi đặt `LIMIT GTC` cho toàn bộ quantity còn lại tại average entry (`reduceOnly` ở one-way
  hoặc đúng `positionSide` ở hedge). Không mở/đóng MARKET, không đổi entry/side/size/margin/leverage và không đặt/sửa/hủy SL. TP gần entry có
  sẵn được giữ. Rule 8h còn âm vẫn có Cap TSL opt-out riêng, nhưng deep-loss `<=-20%` luôn có ưu tiên; rule TP +1% sau 12h không ghi đè khi âm sâu.
- Không đổi signal/label/tier/gate hay W/L, WR, PF, Net PnL, AvgROE; không thêm card/reporting key/checkbox `WHITELIST`. JSON cũ tương thích
  nguyên trạng: không migrate/rewrite history, tiếp tục đọc `data/orders-cap-tsl.json` cho profit-lock, còn dedupe TP-to-entry chỉ ở runtime và
  được đối chiếu lại với order Binance sau restart.

### LIMIT trùng vị thế được giữ như DCA; LIMIT độc lập vẫn hết hạn 12 giờ (2026-08-28)

- Versions `BINANCE_DCA_ATTACHED_LIMIT_RETENTION_V1_20260828`,
  `ENTRY_LIMIT_TWELVE_HOUR_EXPIRY_V2_DCA_ATTACHED_EXEMPT_20260828` và
  `LIVE_CARD_LIMIT_RETEST_EXPIRY_V2_DCA_ATTACHED_EXEMPT_20260828`. Dữ liệu causal dùng trước quyết định chỉ là open order Binance hiện tại
  (`symbol`, `type`, `side`, `positionSide`, `reduceOnly`, `closePosition`, create time, executed quantity) và active Position Risk hiện tại
  (`positionAmt`, `positionSide`); không dùng candle, label outcome, paper PnL hay dữ liệu tương lai.
- `LIMIT/LIMIT_MAKER` không phải close order được phân loại `DCA_ATTACHED` khi cùng symbol và cùng hướng mở thêm với position đang hoạt động:
  LONG + BUY hoặc SHORT + SELL, có kiểm tra `positionSide` ở hedge mode. Hedge LIMIT đóng LONG/SHORT không bị nhận nhầm là entry/DCA.
- Khi position gốc còn mở, DCA_ATTACHED được miễn cleaner 12 giờ, BTC-bias auto-cancel và live-card retest expiry; partial fill vẫn giữ phần LIMIT
  còn lại. Khi socket báo position về 0, bot chờ xác nhận fresh Position Risk rồi hủy đúng LIMIT DCA cùng hướng; scanner 35 giây là fallback nếu
  socket lỡ sự kiện. Position còn quantity sau partial TP/SL chưa bị coi là đóng nên DCA vẫn được giữ. LIMIT entry độc lập vẫn hết hạn ở `>=12h`
  theo `ENTRY_LIMIT_12H_CANCEL_ENABLED`/`ENTRY_LIMIT_MAX_AGE_MS` như cũ; TP/SL/reduce-only/close-position không thuộc expiry.
- Có ảnh hưởng Binance thật bằng cách giữ hoặc hủy pending LIMIT, nhưng không đặt thêm entry, không đổi price, side, size/margin/leverage và không
  sửa TP/SL của position đang mở. Không đổi classifier/label/tier/gate hay W/L, WR, PF, Net PnL, AvgROE; không thêm card/reporting key/WHITELIST.
  JSON cũ tương thích: live-card lifecycle chỉ thêm optional `dcaAttachedLimit`, `dcaAttachedLimitVersion`, `entryRetestExpiryState/version`; không
  migrate/rewrite history. Record cũ được nhận diện lại từ order + Position Risk; LIMIT độc lập thiếu field vẫn dùng expiry 12 giờ.

### SHORT vào tay: TP EMA99 gần nhất 5m/15m, tối đa +30% ROE, không SL (2026-08-24)

- Version `BINANCE_MANUAL_SHORT_EMA99_TP_ONLY_V1_20260824`. Dữ liệu dùng trước protection là symbol/side, entry thực hoặc giá execution dự kiến,
  leverage và tối thiểu 99 nến **đã đóng** của 5m + 15m. Ưu tiên cache; thiếu cache mới đọc public Binance kline. Không dùng PnL/outcome tương lai.
- Phân loại chỉ áp dụng SHORT từ `orders-manual`, `binance-manual-socket` hoặc source explicit chứa `manual`. Trong các EMA99 nằm dưới entry
  (phía có lãi của SHORT), chọn EMA99 có khoảng giá gần entry nhất. TP đặt đúng EMA đó nếu ROE mục tiêu `<=30%`; nếu EMA gần nhất xa hơn 30% ROE,
  cả hai EMA đều ở trên entry hoặc dữ liệu EMA không đủ thì fallback TP `+30% ROE`. LONG manual giữ rule cũ.
- Manual SHORT là TP-only: requested/signal/fill-anchor SL bị bỏ; fill anchor TP tắt để không làm trượt TP khỏi EMA99. Socket recovery, missing-SL guard,
  profit-lock và `setTpSl` tự động không dựng lại SL. Không tự cancel STOP đã tồn tại trước deploy. TP mới vẫn được tạo sau full fill và chống duplicate.
- Không đổi signal label/tier/gate/entry/size/margin/leverage hoặc cách tính W/L, WR, PF, Net PnL, AvgROE. Không thêm card/reporting key nên không
  thêm WHITELIST; policy default-off và CLOSED AvgROE `>4%` giữ nguyên. JSON cũ tương thích: field manual protection lưu lại TP/SL resolved theo schema
  cũ, telemetry EMA99 chỉ additive trong response/plan; không migrate/rewrite lịch sử.

### Tạm thời SHORT do bot chạy TP-only, không tạo SL (2026-08-24)

- Version `BINANCE_BOT_SHORT_TP_ONLY_V1_20260824`, mặc định bật; có thể rollback bằng
  `BINANCE_BOT_SHORT_TP_ONLY_ENABLED=false`. Dữ liệu dùng trước entry không đổi: policy chỉ đọc side `SHORT/SELL` và source runtime đã xác định
  là bot; không thêm indicator, candle, outcome hay PnL vào classifier/gate.
- Chỉ SHORT từ known bot source (kể cả legacy auto source `signal`) bị bỏ requested SL, signal SL và fill-anchor SL. TP vẫn được tạo như policy từng nhóm. Socket full-fill,
  lifecycle retry, `setTpSl`, missing-SL guard và profit-lock đều không tự dựng lại SL cho đúng vị thế bot SHORT đó. LONG giữ logic cũ; manual SHORT
  tuân theo policy EMA99 TP-only ở mục trên. Source rỗng/không xác định được coi là manual để fail-safe.
- Không hủy STOP đã có trước khi deploy và không cấm người dùng gọi màn/API đặt SL tay (`set-tp-sl`). Thay đổi chỉ tác động protection tự động cho
  entry/vị thế bot SHORT; không đổi điều kiện signal, whitelist, entry type/price, size/margin, leverage, TP, dedupe, W/L, WR, PF, Net PnL hay AvgROE.
- Không thêm nhãn/card/reporting key nên không có checkbox WHITELIST mới; policy default-off và điều kiện chỉ hiện khi CLOSED AvgROE `>4%` giữ
  nguyên. JSON cũ tương thích: các field telemetry `stopLossSuppressed`/`stopLossSuppressionVersion` chỉ additive in-memory/response; tracking cũ
  không migrate/rewrite và SL hiện hữu không bị cancel.

### Daily Timing Edge theo ngày + giờ trên V2 Binance Stats (2026-08-23)

- Versions `LIQUID_FLOW_V2_DAILY_TIMING_EDGE_V1_20260823` và
  `LIQUID_FLOW_V2_BINANCE_STATS_UI_V7_DAILY_TIMING_EDGE_20260823`; endpoint Orders-auth mới là
  `/api/liquid-flow-v2-binance-daily-timing`. Đây là reporting hậu nghiệm **OBSERVE ONLY**, không phải dữ liệu causal trước entry và không được
  nối vào classifier/gate. Input là rolling 7 ngày Asia/Bangkok theo **giờ Binance entry**, chỉ row `CLOSED + pnlKnown + BINANCE_INCOME`;
  CoinGlass Qualified vẫn ở bảng stats thường nhưng bị loại khỏi điểm timing để lệnh ngoại lệ không làm lệch khuyến nghị core Liquid Flow V2.
- Mỗi side có thống kê riêng cho ngày Bangkok hiện tại và từng giờ 00..23: số lệnh đóng có PnL, W/L, WR, gross profit/loss, PF, Net PnL và
  AvgROE. Giờ `GOOD` cần ít nhất 5 mẫu, Net `>0`, PF `>=1.2`, WR `>=60%`, AvgROE `>0`; ngày `GOOD` dùng cùng threshold với tối thiểu 3 mẫu.
  Một giờ/ngày đủ mẫu bị `AVOID` khi Net `<0` và đồng thời PF `<0.95` hoặc AvgROE `<0` hoặc WR `<50%`; còn lại là neutral/insufficient.
- Các giờ GOOD/AVOID liền nhau được gộp thành khung, xếp bằng WR/PF/AvgROE/sample score và lấy tối đa ba khung mỗi side. Trạng thái mỗi side
  là `STRONG` khi ngày + giờ đều GOOD, `AVOID` nếu một yếu tố AVOID, `SELECTIVE` nếu chỉ một yếu tố GOOD, còn lại WAIT; banner kết hợp hai side
  thành LONG/SHORT favored, both selective, avoid both hoặc wait confirmation. Trang tải banner sau bảng chính, refresh 5 phút khi visible và
  refresh ngay khi quay lại foreground; lỗi giữ last-good nhưng đánh dấu STALE.
- Endpoint timing không gọi verify order CoinGlass/position vì các nguồn đó không tham gia quyết định. Kết quả cache 5 phút; lần đầu sau process
  restart mới đọc Income đủ 7 ngày, các lần cập nhật tiếp theo giữ phần lịch sử và chỉ refresh Income từ đầu ngày Bangkok hiện tại, giảm burst
  Binance REST mà không đổi tập PnL dùng để tính.
- Cách thống kê bảng/date/label/symbol hiện hữu không đổi; banner không sửa W/L, WR, PF, Net PnL, AvgROE hoặc row realtime đang xem. Đây là một
  dashboard insight tổng hợp, không tạo signal label/reporting key/runtime matcher nên không có checkbox WHITELIST mới; whitelist per-label vẫn
  default-off và chỉ hiện khi CLOSED AvgROE `>4%`.
- Ảnh hưởng Binance/entry/side/size/margin/leverage/SL/TP/protection/dedupe: **không**. Không block/enable/order theo timing và không sửa vị thế
  đang mở. JSON cũ tương thích nguyên trạng: insight tính in-memory từ response stats, không thêm file/state, không migrate/rewrite/replay execution,
  paper, settings hoặc position; client cũ có thể bỏ qua endpoint/banner mới.

### Binance per-label control đồng bộ giữa Liquid Flow V2 và V2 Binance Stats (2026-08-23)

- Versions UI `LIQUID_FLOW_V2_PAPER_BINANCE_CONTROL_UI_V1_SHARED_SYNC_20260823` và
  `LIQUID_FLOW_V2_BINANCE_STATS_UI_V7_DAILY_TIMING_EDGE_20260823`; backend/store giữ
  `LIQUID_FLOW_V2_BINANCE_SIGNAL_SETTINGS_VERSION` hiện hữu. Dữ liệu causal/classifier trước entry không đổi; table `Thống kê theo nhãn`
  chỉ ghép paper label stats đang lọc với setting per-label trả từ `/api/liquid-flow-v2-binance-signal-settings` sau Orders auth.
- Mỗi row có cùng checkbox `BẬT/TẮT`, input margin `0.01..10000 USDT`, leverage/default source/global Orders/dry-run note và nút `LƯU`
  như màn `/liquid-flow-v2-binance-stats`. Chỉ exact label có auto route được server hỗ trợ mới có control; nhãn khác ghi `KHÔNG CÓ AUTO ROUTE`.
  Draft chưa lưu được giữ qua các lượt render SSE/paper để không mất số đang nhập.
- Hai trang đọc/ghi **cùng** persistent settings store. Sau POST thành công, tab cùng origin nhận thay đổi ngay qua `BroadcastChannel` và storage
  event; cả hai trang còn GET lại mỗi 10 giây khi visible và khi trở lại foreground, nên phiên/browser khác hội tụ tối đa khoảng 10 giây.
  Fingerprint chỉ render lại khi payload settings thực sự đổi.
- Phân loại/thống kê không đổi: control không đổi paper row, W/L, WR, PF, Net PnL, AvgROE, datepicker hoặc label filter. Không thêm label/card/
  reporting key nên không thêm checkbox WHITELIST; checkbox whitelist thống kê hiện hữu vẫn độc lập, default-off và chỉ hiện khi CLOSED AvgROE `>4%`.
- Ảnh hưởng Binance: lưu `enabled` và `marginUsdt` có hiệu lực cho **entry tương lai** của exact supported label ở cả hai màn; global Orders,
  dry-run, authorization và runtime matcher vẫn là gate cuối. Không đổi side, entry type/policy, leverage, SL, TP, protection, dedupe hoặc vị thế/lệnh
  đã mở. Default hiện hữu không bị rewrite cho đến khi người dùng bấm `LƯU`.
- JSON cũ tương thích nguyên trạng qua `data/liquid-flow-v2-binance-signal-settings.json`; không migrate/rewrite/replay execution, paper, signal hoặc
  position. Client chỉ thêm state sync/draft trong memory/localStorage và không lưu credential/API key vào channel.

### Discord khi Market Direction đổi sóng đã xác nhận (2026-08-23)

- Version notifier `LIQUID_MARKET_DIRECTION_DISCORD_V1_COMMITTED_CHANGE_20260823`; classifier nguồn giữ
  `LIQUID_MARKET_DIRECTION_HEALTH_V3_20260729`. Dữ liệu causal trước entry và dữ liệu gửi Discord là cùng snapshot hiện hữu: tối đa 120 alt
  thanh khoản, nến đóng 15m, breadth 1h/3h/6h, EMA20/50, volume confirmation, BTC đa khung, scores/confidence/reasons; không dùng outcome/PnL.
- Server chỉ gửi một embed khi `label` **đã commit** khác `lastLabel` đã lưu. `rawLabel/pendingLabel` chưa đủ hysteresis hai nến 5m không gửi;
  `NO_DATA` không tạo cảnh báo đổi sóng. Lần bật đầu chỉ lưu baseline hiện tại, không giả một transition startup; state persistent chống gửi lặp
  sau restart. HTTP lỗi/timeout không advance state nên chu kỳ 20 giây sau được retry.
- Embed đổi màu theo nhãn có sẵn, ghi `OLD → NEW`, LONG/SHORT score, confidence, breadth 1h/3h/6h, BTC 15m/1h/6h, sample và reasons.
  Webhook riêng đọc từ `LIQUID_MARKET_DIRECTION_DISCORD_WEBHOOK_URL`; secret chỉ nằm trong `.env` git-ignore, `.env.example` để trống.
- Phân loại/thống kê không đổi: không thêm label/card/reporting key, không tham gia W/L, WR, PF, Net PnL hoặc AvgROE nên không thêm checkbox
  WHITELIST; policy default-off và CLOSED AvgROE `>4%` giữ nguyên. Notifier ghi `OBSERVE ONLY` và không ảnh hưởng Binance/entry/side/size/
  margin/leverage/SL/TP/protection/dedupe.
- JSON cũ tương thích: chỉ thêm file runtime optional `data/liquid-market-direction-discord-state.json` gồm version, lastLabel/sample/evaluatedAt và
  thời điểm gửi; không migrate/rewrite/replay execution, paper, signal, settings hoặc position. File thiếu/cũ được seed baseline an toàn.

### Cảnh báo sóng realtime trên V2 Binance Signal Stats (2026-08-23)

- Version component bias `LIQUID_FLOW_V2_BINANCE_STATS_UI_V5_REALTIME_MARKET_BIAS_20260823`; version toàn trang hiện hành là
  `LIQUID_FLOW_V2_BINANCE_STATS_UI_V7_DAILY_TIMING_EDGE_20260823`; classifier nguồn giữ
  `LIQUID_MARKET_DIRECTION_HEALTH_V3_20260729`, backend stats giữ `LIQUID_FLOW_V2_BINANCE_STATS_V3_REALTIME_20260822`.
  Dữ liệu causal trước entry chỉ là Market Direction snapshot hiện tại: tối đa 120 alt thanh khoản, nến đã đóng 15m, breadth 1h/3h/6h,
  EMA20/EMA50, volume confirmation và BTC 5m/15m/1h. Không dùng PnL/outcome tương lai để đổi cảnh báo.
- Trang `/liquid-flow-v2-binance-stats` gọi `/api/liquid-market-direction-health` ngay khi mở, sau đó mỗi 20 giây khi tab visible và refresh
  ngay khi tab quay lại foreground. Banner đổi nổi bật theo các nhãn có sẵn: LONG xanh, SHORT đỏ, CHOP/TRANSITION vàng, DISPERSION tím,
  SHOCK cam, NO_DATA xám; hiển thị LONG/SHORT score, confidence, breadth 1h, reasons và thời điểm snapshot.
- Điều kiện phân loại LONG/SHORT/CHOP/DISPERSION/TRANSITION/SHOCK/NO_DATA và hysteresis không đổi. Khi `rawLabel/pendingLabel` khác nhãn
  đã commit, banner đổi ngay sang `ĐANG ĐỔI SÓNG`, đồng thời ghi nhãn đã xác nhận và tiến độ `pendingCount/hysteresisSamples`; khi commit
  tiếp theo đến, banner tự chuyển sang trạng thái mới. Lỗi fetch giữ snapshot gần nhất nhưng đánh dấu `STALE`, không giả nhãn mới.
- Phân loại/thống kê V2 Binance không đổi: banner không tham gia W/L, WR, PF, Net PnL hoặc AvgROE; datepicker, label filter, symbol search,
  group và detail rows giữ nguyên. Không thêm reporting label/card/key, chỉ hiển thị các nhãn Market Direction đã tồn tại nên không thêm
  checkbox WHITELIST; policy default-off và CLOSED AvgROE `>4%` giữ nguyên.
- Ảnh hưởng Binance/entry/side/size/SL/TP: **không**. Banner ghi rõ `OBSERVE ONLY`, không gate/block/order, không đổi margin/leverage,
  protection hoặc dedupe. JSON cũ tương thích nguyên trạng vì không thêm/migrate/rewrite/replay execution, paper, signal, setting hay position;
  đây chỉ là HTML/CSS/JS đọc API hiện hữu.

### V2 Binance Stats tìm altcoin trong bảng chi tiết (2026-08-23)

- Version component search `LIQUID_FLOW_V2_BINANCE_STATS_UI_V4_SYMBOL_SEARCH_20260823`; version toàn trang hiện hành là
  `LIQUID_FLOW_V2_BINANCE_STATS_UI_V5_REALTIME_MARKET_BIAS_20260823`; backend/report schema tiếp tục là
  `LIQUID_FLOW_V2_BINANCE_STATS_V3_REALTIME_20260822`. Dữ liệu causal trước entry và điều kiện phân loại Liquid Flow V2/CoinGlass giữ nguyên;
  search chỉ đọc các row Binance fill đã được API stats trả về theo datepicker và label đang chọn.
- Ô `TÌM ALTCOIN` nằm riêng trên bảng `Chi tiết nguyên nhân thắng/thua`, nhận cả base symbol như `POL` hoặc full symbol `POLUSDT`,
  normalize uppercase/bỏ ký tự phân cách rồi lọc contains ở client. Mỗi lần nhập reset pagination về trang 1; PnL/ROE socket vẫn cập nhật row gốc
  và bảng kết quả tìm được render lại realtime.
- Phân loại/thống kê không đổi: summary và bảng `Theo loại tín hiệu` vẫn tính trên toàn bộ tập date/label từ server; search chỉ thu hẹp row chi tiết
  và page info hiển thị `số khớp/tổng`, không thay W/L, WR, PF, Net PnL hoặc AvgROE.
- Không ảnh hưởng Binance/entry/side/size/SL/TP, không gọi thêm REST Binance và không cấp quyền đặt lệnh. Không thêm label/card/key nên không thêm
  checkbox WHITELIST; policy default-off và chỉ hiện khi CLOSED AvgROE `>4%` giữ nguyên.
- JSON cũ tương thích nguyên trạng: không thêm field, không migrate/rewrite/replay execution, paper, signal, settings hoặc position; thay đổi chỉ ở HTML/CSS/JS UI.

### CoinGlass qualified bổ sung vùng thanh lý 12h và 24h riêng (2026-08-23)

- Versions: collector `COINGLASS_WEB_QUALIFIED_BINANCE_V14_QUALIFIED_12H24H_20260823`, schema phụ
  `COINGLASS_WEB_QUALIFIED_TIMEFRAMES_V1_12H_24H_20260823`, Discord
  `COINGLASS_WEB_DISCORD_BINANCE_V9_QUALIFIED_12H24H_20260823`. Dữ liệu phân loại trước entry vẫn là Binance snapshot cùng exact
  CoinGlass Model 3 **48h** structured state; không dùng future outcome, ảnh/crop hoặc dữ liệu 12h/24h để quyết định qualified.
- Chỉ row fresh `OK` đã pass toàn bộ qualified 48h hiện hành mới được mở lại đúng symbol, chuyển control CoinGlass sang `12 hour` rồi
  `24 hour` và đọc hai React state độc lập. Mỗi khung tự tổng hợp `prices/y/liq`, local peak và `bandLow/bandHigh`; không nội suy/cắt 48h.
  Vòng 40 coin 48h luôn hoàn tất trước, sau đó bốn page hiện hữu lấy khung phụ trong phần còn lại của hard budget 150 giây.
- Discord qualified xanh/đỏ thêm đúng hai field `THANH LÝ 12H · RIÊNG` và `THANH LÝ 24H · RIÊNG`; mỗi field có vùng trên/dưới,
  distance, strength và giá tham chiếu của chính khung. Nếu hết budget/chuyển range lỗi thì field báo thiếu, không dùng last-good 12h/24h
  và không chặn cảnh báo/lệnh qualified. Message đánh giá tím mỗi scan tiếp tục dùng 48h, không đổi.
- Phân loại/thống kê: qualified/action/Entry/TP/proposal SL/R:R và reporting groups CoinGlass LONG/SHORT giữ nguyên; 12h/24h không tham gia
  W/L, WR, PF, Net PnL hoặc AvgROE. Snapshot source chỉ thêm số requested/complete/failed và danh sách lỗi khung phụ để audit.
- Ảnh hưởng Binance/entry/size/SL/TP: **không đổi**. MARKET margin mặc định/per-label, leverage, Mark gate, TP proposal 48h, SL `-20% ROE`,
  profitable-opposite reversal, dedupe và protection giữ nguyên; 12h/24h chỉ là context Discord sau phân loại.
- Không thêm label/card/key nên không thêm checkbox WHITELIST; policy default-off và chỉ hiện khi CLOSED AvgROE `>4%` giữ nguyên.
  JSON cũ tương thích vì `qualifiedTimeframes`, `qualifiedTimeframeError` và telemetry đều optional; không migrate/rewrite/replay execution,
  paper, signal, settings hoặc position. Snapshot V13 altcoin fail-closed tới lượt V14 fresh.

### CoinGlass Discord đánh giá hai vùng trên/dưới sau mỗi lượt quét (2026-08-23)

- Versions hiện hành: collector/snapshot `COINGLASS_WEB_QUALIFIED_BINANCE_V14_QUALIFIED_12H24H_20260823`, notifier qualified
  `COINGLASS_WEB_DISCORD_BINANCE_V9_QUALIFIED_12H24H_20260823`, notifier tham khảo
  `COINGLASS_WEB_TWO_SIDED_ZONE_EVAL_V1_20260823`. Dữ liệu dùng trước đánh giá vẫn chỉ là Binance mover/liquidity snapshot hiện tại
  và exact CoinGlass Model 3 48h structured `prices/y/liq`; không đọc ảnh/crop, không dùng future candle hoặc outcome.
- Mỗi local peak mới có `bandLow/bandHigh`: mở rộng tối đa năm price-bin mỗi phía khi intensity còn ít nhất `28%` peak, cho phép
  nối một bin yếu và range hiển thị được clamp đúng phía giá tham chiếu; snapshot cũ thiếu range dùng peak lân cận trong `2,5%` giá tham chiếu. Mỗi phía chọn anchor theo
  `strength × exp(-|distance|/8) × persistence boost`, rồi gộp các peak gần anchor thành vùng trên và vùng dưới.
- Sau **mỗi lượt crawl hoàn tất**, webhook riêng `COINGLASS_WEB_ZONE_EVALUATION_WEBHOOK_URL` nhận đúng một embed tím. Candidate chỉ cần
  fresh `status=OK`, không stale và có đủ cả hai vùng trong `±20%`; không bắt buộc pass qualified, directional, R:R hoặc Binance-liquidity
  gate. Chọn altcoin mover có two-sided score cao nhất, chỉ fallback BTC khi không có alt; nếu auth/no-data thì vẫn gửi embed cam để kiểm tra
  đăng nhập. Message ghi giá, range trên (short liquidation), range dưới (long liquidation), khoảng cách/lực/persistence cùng link CoinGlass/Binance.
- Cảnh báo qualified xanh/đỏ hiện hữu cũng hiển thị cả hai vùng nhưng **không đổi** classifier, entry, TP, proposal, SL `-20% ROE`,
  margin Binance mặc định `$2 x5`, profitable-opposite reversal, dedupe hoặc per-label control. Message tím là `EVALUATION ONLY`, không gọi
  paper/order/protection và không cấp quyền Binance; lỗi webhook riêng được cô lập, không chặn qualified notifier hoặc executor.
- Thống kê chỉ thêm telemetry in-memory `lastZoneEvaluationAt/lastZoneEvaluationSymbol`; evaluation không tham gia W/L, WR, PF, Net PnL,
  AvgROE hoặc cohort V2 Binance. Không thêm label/card/key nên không thêm checkbox WHITELIST; policy hiện hữu vẫn mặc định tắt và chỉ hiện
  khi CLOSED paper AvgROE `>4%`.
- JSON cũ tương thích: `bandLow/bandHigh` và telemetry là optional, không migrate/rewrite/replay paper, signal, execution hoặc position.
  Snapshot trước V14 altcoin fail-closed khỏi view tới lượt V14 fresh; webhook secret chỉ nằm trong `.env` git-ignore, `.env.example` để trống.

### Hot paper store cache: bỏ parse file lớn lặp lại (2026-08-22)

- Versions `EDGE_PAPER_STORE_CACHE_V1_20260822`, `BR_LIKE_LIMIT_STORE_CACHE_V1_20260822`, `SHAKEOUT_PAPER_STORE_CACHE_V1_20260822`. Dữ liệu causal trước entry và điều kiện phân loại Edge/BR-like/Shakeout không đổi. Trước sửa, `processEdgePaperCachedMarks()` chạy mỗi giây nhưng `readEdgePaperStore()` lại đọc + parse toàn bộ `data/edge-paper-trades.json` khoảng `240 MB`; CPU profile còn thấy BR-like khoảng `11 MB` và Shakeout khoảng `48 MB` bị parse lặp trong hot path.
- Mỗi store giờ load một lần bằng shared promise/cache; ticker, stats và mutation dùng cùng object. Chỉ mutation thật mới đi qua write lock + atomic JSON write; cache được cập nhật cùng store đã mutate. Entry journal/recovery, exact id upsert, pending fill, TP/SL và timeout giữ nguyên.
- SSE helper bỏ qua ngay trước `JSON.stringify` khi không có client, tránh serialize snapshot lớn vô ích trong background. Khi có client, payload và realtime semantics giữ nguyên.
- Các phép kiểm tra BR-like và EMA breakout cluster/breadth/positive-cut dùng active EMA index đã có thay vì quét toàn bộ hot pump rows; predicate exact OPEN/source/side của từng nhóm không đổi.
- Thống kê/WHITELIST không đổi: cùng toàn bộ trade rows và công thức W/L, WR, PF, PnL, ROE; không thêm label/card/key/checkbox, policy default-off và CLOSED AvgROE `>4%` giữ nguyên. Cache không phải gate hoặc rule giao dịch.
- Binance/entry/size/SL/TP không bị ảnh hưởng; các cache paper không cấp thêm lệnh thật và không thay giá/size/protection. JSON cũ giữ nguyên schema và không migrate/rewrite; cache chỉ là trạng thái process, restart đọc lại file hiện hữu.

### Pump paper WAL streaming + hot-store checkpoint (2026-08-22)

- Version storage/runtime `PUMP_PAPER_WAL_COMPACT_STREAM_V3_20260822`. Dữ liệu causal trước entry và dữ liệu phân loại tín hiệu không đổi: thay đổi này đọc journal `data/pump-paper-trades.wal.ndjson` theo từng dòng thay vì nạp toàn bộ file vào một UTF-8 string, đồng thời bỏ top-level field `null`/`undefined` khi ghi snapshot/WAL/archive. Incident trước sửa: snapshot khoảng `458 MB`, WAL khoảng `1,4 GB`, `readFile(..., 'utf8')` báo `Invalid string length`, Node heap lên gần `9 GB` và event-loop p95 vượt `2 giây`; mẫu trade mới có 325 field nhưng phần lớn là null.
- Điều kiện phân loại, label/tier/gate, paper entry/fill/TP/SL/timeout đều giữ nguyên. Khi khởi động, UPSERT/DELETE vẫn replay theo exact id và vẫn bảo toàn duplicate id legacy; dòng WAL cuối bị cắt được skip như rule cũ. Sau replay thành công, runtime atomically checkpoint snapshot và xoay WAL đã nhập; hot store giữ toàn bộ active cùng các CLOSED mới nhất trong quota `PUMP_PAPER_MAX_ACTIVE_ROWS` (mặc định `1.000`), overflow được append theo batch vào `data/archive/pump-paper-trades.ndjson`.
- Thống kê/WHITELIST: màn realtime chỉ thống kê hot store; archive vẫn giữ lịch sử cũ để audit/offline nhưng không được tự động nạp lại vào live stats, tránh trả lại áp lực heap. Không thêm label/card/key/checkbox; whitelist vẫn default off và chỉ hiện khi CLOSED paper AvgROE `>4%`.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. Storage checkpoint không cấp quyền lệnh thật, không thay entry, side, size, leverage, TP, SL, dedupe, profit-lock hay vị thế đang mở. Các OPEN/PENDING mới nhất nằm đầu mảng nên được giữ trong hot store trước khi archive overflow.
- JSON cũ tương thích: snapshot object `{"trades": [...]}` và WAL NDJSON V1 giữ nguyên schema; field có giá trị giữ nguyên, chỉ field optional nullish được phép vắng mặt như client cũ đã hỗ trợ. Overflow snapshot vào archive trade NDJSON; toàn bộ WAL gốc còn được atomic-rename thành file `data/archive/pump-paper-trades-wal-*.ndjson` trước khi tạo WAL rỗng. Checkpoint dùng temp + rename và xoay WAL cuối nên crash có thể replay lại UPSERT nhưng không làm mất mutation đã ghi nhận.

### CoinGlass 40 coin / 3 phút: giảm tải render, giữ nguyên structured signal (2026-08-22)

- Version collector/runtime `COINGLASS_WEB_QUALIFIED_BINANCE_V12_LOW_RENDER_20260822`; proposal V2, executor V4, Discord V7 và per-label settings V1 giữ nguyên. Dữ liệu causal trước entry vẫn là top Binance app-style tăng/giảm đã qua volume/trades/OI/spread/depth, sau đó exact CoinGlass Model 3 48h response và React structured liquidation cells/zones của đúng symbol; không đọc màu/crop ảnh để phân loại.
- Điều kiện phân loại `qualified`, hướng LONG/SHORT, Entry/TP/proposal SL/R:R và mọi fresh/auth/liquidity/Mark/reversal/protection gate không đổi. Collector mặc định headless, giữ viewport tương thích `1280x900`, tắt GPU/SwiftShader, chặn image/media/font không cần thiết, không chụp canvas, ẩn canvas sau khi structured state đã được trích xuất, giới hạn disk/media cache `50/10 MB` và cache đúng React fiber locator theo từng page để không quét lại toàn DOM; listener response được đánh dấu handled ngay khi tạo để timeout của một symbol chỉ thành failure row, không làm child collector thoát. Login thủ công vẫn mở browser headed riêng. Concurrency giữ `4`, mục tiêu `40`, interval `180s`, budget `150s` để không giảm universe chỉ vì tối ưu CPU.
- Thống kê/WHITELIST: reporting groups CoinGlass LONG/SHORT, W/L, WR, PF, Net PnL, AvgROE và cách đối soát Binance fill/Position/Income không đổi. Không thêm label/card/key/checkbox; whitelist vẫn default off và chỉ hiện theo CLOSED paper AvgROE `>4%`. Các field source `browserMode`, `captureImages`, `viewport` chỉ phục vụ telemetry hiệu năng, không gate giao dịch.
- Ảnh hưởng Binance/entry/size/SL/TP: không đổi quyền vào lệnh, strict Mark `> proposed entry`, MARKET, margin từng label (mặc định `$2 x5`), SL `-20% ROE`, TP proposal, profitable-opposite reversal, dedupe hay profit-lock. Tối ưu chỉ giảm render Chromium; structured rows phải tiếp tục pass exact symbol/response code trước khi được dùng.
- JSON cũ tương thích: snapshot V11 được đọc fail-closed khỏi mover universe cho tới lần V12 fresh đầu tiên; không migrate/rewrite/replay execution, lifecycle, settings, whitelist hoặc vị thế. `imageUrl` trở thành optional vì UI/Discord quyết định bằng structured zones/proposal; ảnh PNG cũ được giữ trên đĩa nhưng không dùng làm dữ liệu tín hiệu.

### Chi tiết thắng/thua V2 Binance cập nhật realtime (2026-08-22)

- Version `LIQUID_FLOW_V2_BINANCE_STATS_V3_REALTIME_20260822`. Dữ liệu causal và điều kiện phân loại trước entry của Liquid Flow V2/CoinGlass không đổi; trang stats chỉ đọc những execution đã được Binance xác nhận fill theo policy V2 và không dùng dữ liệu realtime này để phát sinh tín hiệu.
- Cách thống kê: lần tải đầy đủ vẫn xác nhận order/fill, OPEN theo exact symbol+side Binance Position, CLOSED theo Binance Income trong lifecycle window và cộng commission/funding. Sau snapshot, bảng detail nhận `position`, `snapshot`, `position-closed` và `live-card-lifecycle` từ `/api/positions/stream`: OPEN cập nhật mark/uPnL/ROE theo socket, hiện `ĐANG LÃI`, `ĐANG LỖ`, `HÒA VỐN` hoặc chờ PnL; fill/close/lifecycle kích hoạt full reconciliation. Khi socket ngắt mới fallback GET mỗi 30 giây. W/L chỉ tính CLOSED có PnL thật; uPnL OPEN chỉ vào Unrealized/Net/AvgROE, không biến thành win/loss.
- Phân loại/reporting key, nhóm thống kê và WHITELIST không đổi; không thêm nhãn/card/key/checkbox mới. Policy whitelist vẫn mặc định tắt và chỉ hiện với CLOSED paper AvgROE `>4%`. Realtime status không phải gate giao dịch.
- Ảnh hưởng Binance/entry/size/SL/TP: không gửi/hủy/sửa lệnh, không thay entry, side, margin, leverage, size, SL, TP, profit-lock hay dedupe. Backend ưu tiên snapshot position monitor socket để lệnh vừa fill/đóng không bị trễ bởi session REST cache; signed REST/Income vẫn là nguồn đối soát đóng.
- JSON cũ tương thích nguyên trạng: không migrate/rewrite/replay paper, execution, lifecycle, whitelist hoặc settings. `generatedAt`, `realtimePolicy` và trạng thái UI `liveUpdatedAt` là field additive/ephemeral; client cũ có thể bỏ qua.

### Mỗi dòng V2 Binance Signal Stats có checkbox và margin Binance riêng (2026-08-21)

- Versions: settings `LIQUID_FLOW_V2_BINANCE_SIGNAL_SETTINGS_V1_20260821`, CoinGlass executor `COINGLASS_WEB_BINANCE_MARKET_V4_RUNTIME_CONTROL_20260821`, Discord `COINGLASS_WEB_DISCORD_BINANCE_V7_RUNTIME_CONTROL_20260821`; detector/classifier/paper/stats versions hiện hữu không đổi. Cột `BINANCE THẬT / MARGIN USD` nằm ngay trên từng dòng `Theo loại tín hiệu`, không còn control CoinGlass chung.
- Dữ liệu causal/phân loại trước entry không đổi. Mỗi exact `labelKey` có override enabled/margin riêng được đọc sau khi signal đã được phân loại nhưng trước claim/place order; checkbox off chỉ chặn lệnh mới của đúng label. Hai key CoinGlass LONG/SHORT cũng độc lập và vẫn phải qua fresh qualified plan, strict Mark `> entry`, valid protection và profitable-opposite reversal.
- Thống kê/WHITELIST: W/L, WR, PF, Net PnL, AvgROE, datepicker và cách đối soát fill/Position/Income không đổi. Đây là control của các auto route đã hỗ trợ, không tạo label/card/matcher mới và không thay checkbox `WHITELIST`; row không có auto route hiển thị `KHÔNG CÓ AUTO ROUTE` thay vì cấp quyền giao dịch mới.
- Ảnh hưởng Binance/entry/size/SL/TP: từng checkbox bật/tắt và từng margin `0.01..10000` chỉ áp dụng cho lệnh mới của label tương ứng; mặc định UI lấy đúng enabled/margin từ profile hiện đang chạy. Global Orders/dry-run vẫn là gate cao hơn. Leverage, entry mode, TP, SL, fill-anchor, profit-lock, dedupe và vị thế/protection đang mở không đổi.
- JSON cũ: override lưu additive tại `data/liquid-flow-v2-binance-signal-settings.json`, map theo exact `labelKey`. Thiếu/lỗi file hoặc thiếu key thì dùng default profile hiện hữu, không migrate/rewrite/replay execution, paper, snapshot, whitelist hoặc vị thế. Record cũ không bị đổi size; chỉ audit/order mới ghi margin override.

### CoinGlass Qualified giảm Binance size xuống `$2 x5` (2026-08-20)

- Version hiện tại: executor `COINGLASS_WEB_BINANCE_MARKET_V4_RUNTIME_CONTROL_20260821`, Discord `COINGLASS_WEB_DISCORD_BINANCE_V7_RUNTIME_CONTROL_20260821`; collector/runtime `COINGLASS_WEB_QUALIFIED_BINANCE_V12_LOW_RENDER_20260822` và proposal vẫn V2. Dữ liệu causal trước entry, điều kiện `qualified=true`, hướng LONG/SHORT, Mark Binance `> proposedEntry`, profitable-opposite reversal và toàn bộ fail-closed guard không đổi.
- Phân loại/thống kê: vẫn dùng exact reporting groups `COINGLASS_QUALIFIED_LONG`/`COINGLASS_QUALIFIED_SHORT`; W/L, WR, PF, Net PnL và AvgROE tiếp tục lấy fill/position/Income Binance thật. Không thêm label/card/gate hay checkbox `WHITELIST`; đây chỉ là đổi size của route thật hiện hữu.
- Ảnh hưởng Binance/entry/size/SL/TP: chỉ lệnh CoinGlass Qualified mới sau deploy đổi margin mặc định từ `$5` thành `$2`, leverage giữ `5x`, notional mục tiêu từ `$25` xuống `$10`. Entry vẫn MARKET, TP theo proposal, SL cố định `-20% ROE`, fill-anchor và profit-lock giữ nguyên; không resize hoặc sửa protection của vị thế đang mở.
- JSON cũ tương thích: không migrate/rewrite/replay audit hoặc position cũ. Audit cũ giữ `marginUsdt=5`; audit mới ghi `marginUsdt=2`, nhờ đó thống kê ROE dùng đúng margin theo từng lệnh. Env `COINGLASS_WEB_BINANCE_MARGIN_USDT` vẫn là override có chủ đích; khi không đặt, runtime dùng `$2`.

### V2 Binance Signal Stats nhận CoinGlass Qualified fills (2026-08-20)

- Version: `LIQUID_FLOW_V2_BINANCE_STATS_V2_COINGLASS_20260820`. Trang `/liquid-flow-v2-binance-stats` giữ datepicker Bangkok và thêm hai reporting group `COINGLASS_QUALIFIED_LONG`/`COINGLASS_QUALIFIED_SHORT`; đây là key tổng hợp báo cáo, không phải label classifier/card/gate giao dịch mới.
- Dữ liệu causal/điều kiện đưa vào stats: đọc durable `data/coinglass-web-top20/binance-executions.json`, chỉ lấy audit exact `decision=SUBMITTED` có `orderId`, rồi signed-query Binance order và chỉ nhận `status=FILLED` với `executedQty>0`; tracking source `coinglass-web-qualified` đúng `entryOrderId` là fallback khi order query tạm lỗi. Audit blocked/wait/error hoặc submit chưa xác nhận fill không được tính.
- Cách thống kê: OPEN phải còn exact symbol+side position Binance và lấy uPnL từ Position Risk; khi không còn position thì CLOSED, PnL chỉ biết khi đối soát Binance Income exact symbol/lifecycle window có `REALIZED_PNL`, cộng commission/funding. Không lấy proposal/paper PnL thay thế. W/L, WR, PF, Net PnL và AvgROE dùng chung công thức màn V2 hiện hữu; filter ngày/nhóm áp dụng cho cả Liquid Flow V2 và CoinGlass.
- WHITELIST: không tạo checkbox/key whitelist vì đây chỉ nối một route Binance explicit đã tồn tại vào màn đối soát, không thêm signal/card hay quyền vào lệnh. Policy whitelist hiện hữu vẫn default off, matcher cũ không đổi và checkbox card chỉ hiện khi CLOSED paper AvgROE `>4%`; reporting key CoinGlass không được dùng để cấp quyền Binance.
- Ảnh hưởng Binance/entry/size/SL/TP: bản thân trang stats không gửi, đóng, sửa hay replay order; route CoinGlass hiện dùng `$2 x5` theo rule mới ở trên, còn reversal, TP proposal, SL `-20% ROE` và profit-lock không đổi. Trang chỉ signed-read order/position/income. JSON cũ tương thích: các field audit mới `marginUsdt`/`binanceEntryPrice`/`filledAt` optional; audit cũ vẫn được xác nhận qua `orderId`, không migrate/rewrite.

### Binance profit-lock: thay SL GTE theo quy trình cancel/place/rollback (2026-08-20)

- Version đang chạy: `BINANCE_PROFIT_LOCK_V13_GTE_REPLACE_ROLLBACK_20260820`; ngưỡng phân loại giữ nguyên: position manual hoặc Liquid Flow V2 đạt ROE `10..14,99%` khóa `+1%`, sau đó `15→+5`, `20→+10`, `25→+15`; Orders `Cap TSL` giữ trần khóa `+1%`. Nhánh ngoài hai nhóm này giữ resolver/env hiện hữu.
- Dữ liệu causal trước khi dời SL không đổi: position Binance đang mở, exact side/amount, average entry, leverage, mark/uPnL hiện tại, lifecycle/source trước entry và open regular/algo protection orders. Không dùng nến tương lai, outcome, paper result hoặc PnL đã đóng để quyết định.
- Nguyên nhân/sửa lỗi: Binance từ chối việc đặt thêm STOP `GTE_GTC closePosition` cùng hướng khi SL cũ còn tồn tại (`An open stop ... is existing`), nên V12 lặp lại trigger nhưng không dời được SL. V13 chỉ hủy đúng close-side STOP cũ, đặt STOP mới tại lock target, và nếu placement không được Binance xác nhận thì dựng lại SL cũ ngay; response lỗi/timeout được re-read open algo orders để tránh rollback nhầm khi SL mới thực tế đã lên sàn. TP và order loại khác không bị hủy.
- Thống kê/WHITELIST: không thêm label/card/cohort hay checkbox; W/L, WR, PF, Net PnL và AvgROE không đổi, whitelist vẫn mặc định tắt và chỉ hiện theo CLOSED AvgROE `>4%`. Đây là lifecycle protection sau entry, không phải gate phân loại tín hiệu.
- Ảnh hưởng Binance/entry/size/SL/TP: có thay cách replace SL thật khi đủ profit-lock; không đổi trigger/lock ladder, entry, side, margin, size, leverage hoặc TP. Vị thế chưa đạt ngưỡng giữ SL cũ. JSON cũ tương thích nguyên trạng; version/audit profit-lock và giá SL là field optional, không migrate/rewrite lịch sử.

### CoinGlass Qualified Setups: MARKET `$2 x5` và đảo vị thế ngược chiều đang lời (2026-08-20)

- Versions đang chạy: collector/runtime `COINGLASS_WEB_QUALIFIED_BINANCE_V12_LOW_RENDER_20260822`, entry/reversal `COINGLASS_WEB_BINANCE_MARKET_V4_RUNTIME_CONTROL_20260821`, per-label settings `LIQUID_FLOW_V2_BINANCE_SIGNAL_SETTINGS_V1_20260821`, Discord `COINGLASS_WEB_DISCORD_BINANCE_V7_RUNTIME_CONTROL_20260821`, auto policy `LIVE_CARD_LIQ_FLOW_COINGLASS_V16_20260820`; proposal giữ `COINGLASS_WEB_ZONE_PROPOSAL_V2_20260817`. LONG/SHORT có control riêng; mode `QUALIFIED_BINANCE_AUTO` vẫn chỉ áp dụng cho row `qualified=true`.
- Dữ liệu causal trước entry: qualification vẫn chỉ dùng fresh CoinGlass Model 3 48h structured cells/zones và Binance public volume, trades, OI/spread/mover snapshot như V10. Ngay trước order, backend đọc Binance Mark hiện tại, Position Risk signed (amount, side, `unRealizedProfit`), open regular orders, position mode và symbol filters. Không dùng outcome, paper PnL, nến tương lai hoặc kết quả sau entry để quyết định.
- Điều kiện phân loại/entry: exact action phải là `WAIT_LONG_CONFIRMATION` hoặc `WAIT_SHORT_CONFIRMATION`, status `OK`, không stale, đủ Binance/CoinGlass liquidity và proposal plan Entry/TP/SL đúng phía với R:R `>=1`. Proposal SL vẫn bắt buộc để xác nhận plan CoinGlass đầy đủ nhưng không còn là SL order. Lệnh chỉ được phép khi Mark Binance **lớn hơn nghiêm ngặt** giá `proposal.tradePlan.entry.price`, chưa vượt TP và chưa vượt biên SL cố định `-20% ROE`; bằng hoặc thấp hơn entry thì chờ. Existing same-side position hoặc non-reduce-only entry order cùng symbol đều chặn.
- Đảo chiều: chỉ xét vị thế **cùng symbol, ngược hướng setup**. Mọi opposite leg phải có signed Binance `unRealizedProfit > 0`; bằng 0, âm hoặc thiếu PnL đều fail-closed và không đóng/không vào mới. Khi dương, bot gửi reduce-only/positionSide MARKET đóng đúng leg, đợi Position Risk xác nhận hết hướng đối nghịch, cleanup TP/SL tự động cũ, kiểm tra lại Mark `> entry` và plan còn hợp lệ rồi mới submit entry mới. Nếu xác nhận đóng hoặc recheck lỗi thì không mở lệnh mới.
- Binance/size/SL/TP: entry mới là MARKET, margin mặc định `$2`, leverage `5x` (notional `$10`), max-position mặc định 30 và vẫn chịu Orders enabled/dry-run, credential, precision/min-notional, leverage/API guards. TP tiếp tục lấy từ proposal. SL mặc định cố định `-20% ROE` qua `COINGLASS_WEB_BINANCE_STOP_LOSS_ROE_PCT=20`; ở `5x` tương đương khoảng cách giá `4%` (LONG thấp hơn fill 4%, SHORT cao hơn fill 4%). Khoảng cách TP và SL mới đều được neo lại theo average fill để không lệch do MARKET slippage; vị thế đã mở không bị hồi tố. Dedupe bền mặc định 4h theo exact `symbol+side`, tránh mỗi vòng quét 3 phút vào lại cùng setup và giữ key ổn định qua lần bump version.
- Thống kê/WHITELIST: không thêm label/card thống kê hoặc paper cohort; không có W/L, WR, PF, Net PnL hay AvgROE mới và các thống kê này không gate entry. Do không thêm stats card/key nên không tạo checkbox WHITELIST; các key hiện hữu vẫn mặc định tắt và chỉ hiện khi CLOSED AvgROE `>4%`. Quyền Binance ở đây là route explicit của qualified CoinGlass theo yêu cầu, không tự bật live-card whitelist.
- Tương thích JSON cũ: `data/coinglass-web-top20/binance-executions.json`, `snapshot.binanceExecutions`, `qualification.binanceEligible` và audit order/reversal là optional additive; các field audit mới `proposalStopLoss`, `stopLoss`, `stopLossRoePct`, `leverage` có thể thiếu ở record cũ. Không migrate/rewrite paper/signal/whitelist JSON. Snapshot V10 legacy không được dùng mở lệnh: altcoin chỉ quay lại sau fresh snapshot exact V11. Execution store giữ submitted dedupe/recent; record cũ thiếu field tiếp tục đọc fail-closed và không replay.

### Liquid Flow V2: phục hồi nến live cho FADING WAVE (2026-08-19)

- Versions đang chạy: managed stream `KLINE_CACHE_MANAGED_LIVE_GROUP_V1_20260819`, container `LIQUID_HEATMAP_FLOW_V2_FADING_WAVE_LIVE_RECOVERY_V24_20260819`; detector giữ `LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_V1_20260818`, paper giữ `LIQUID_FLOW_V2_PAPER_V31_FADING_WAVE_LIVE_PUMP_BINANCE_20260818`, Binance route giữ `LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_BINANCE_V1_1USDT_20260818`. Incident trước bản vá có global 5m socket/tick báo fresh nhưng toàn bộ row Liquid V2 vẫn có `fadingWaveLivePump5m.stage=NO_LIVE_CANDLE`, vì health tổng có thể được nuôi bởi stream của symbol khác.
- Dữ liệu causal trước entry: top-liquidity/post-pump universe tiếp tục dùng đúng Binance kline 5m `x=false` đang chạy gồm OHLC, quote-volume, taker-buy và close-time tương lai của chính symbol. Runtime mở một managed combined-stream riêng cho universe này, cập nhật cache và telemetry per-symbol; REST seed lịch sử không tạo socket generic trùng. Không tổng hợp nến live giả, không dùng future outcome/PnL và symbol chưa nhận live candle vẫn fail-closed `NO_LIVE_CANDLE`.
- Điều kiện phân loại không đổi: exact `FADING_WAVE_LIVE_PUMP_SHORT_READY` vẫn phải qua toàn bộ downtrend, prior-peak/drawdown, live pump, volume/taker, EMA99 sweep, giveback và upper-wick của V1. Bản vá chỉ làm dữ liệu live thật tới được detector; không nới threshold, không biến `NO_LIVE_CANDLE` thành READY và không ảnh hưởng classifier closed-candle khác. API/UI thêm coverage `live/total`, missing-symbol sample và managed-group status để không còn dựa vào global 5m health gây báo xanh giả.
- Thống kê/WHITELIST không đổi: chỉ paper `CLOSED` đúng exact label mới tính W/L, WR, PF, Net PnL và AvgROE. Không thêm nhãn/card/key mới; key hiện hữu `heatmap-v2:FADING_WAVE_LIVE_PUMP_SHORT_READY` vẫn mặc định tắt, matcher UI/runtime giữ nguyên và checkbox chỉ hiện khi CLOSED AvgROE `>4%`.
- Ảnh hưởng Binance/entry/size/SL/TP: route thật vẫn MARKET SHORT margin mặc định `$1 x5`, TP `+10% ROE`, SL `-20% ROE`, max hold 4h và neo protection theo average fill; paper vẫn `$10 x5`. Bản vá có thể làm transition mới xuất hiện trở lại khi thị trường thực sự match, nhưng không đổi entry formula/size/SL/TP, không sửa vị thế đang mở và vẫn giữ existing-position/max-position/dedupe/preflight/API fail-closed.
- Tương thích JSON cũ: chỉ thêm field API optional `fadingWaveLiveVersion`, `fadingWaveLiveGroup`, `fadingWaveLiveCoverage`; không migrate/rewrite paper, whitelist, snapshot hay execution JSON. Client cũ có thể bỏ qua; record cũ thiếu field vẫn đọc/thống kê như trước và không bị replay.

### Liquid Flow V2: sóng tàn/downtrend dựng nến live pump → SHORT (2026-08-18)

- Versions đang chạy: detector `LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_V1_20260818`, container/registry `LIQUID_HEATMAP_FLOW_V2_FADING_WAVE_LIVE_RECOVERY_V24_20260819`, paper `LIQUID_FLOW_V2_PAPER_V31_FADING_WAVE_LIVE_PUMP_BINANCE_20260818`, Binance route `LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_BINANCE_V1_1USDT_20260818`, Discord `LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_DISCORD_V1_20260818`, auto policy `LIVE_CARD_LIQ_FLOW_COINGLASS_V16_20260820`, whitelist `LIVE_CARD_WHITELIST_V16_FADING_WAVE_LIVE_PUMP_20260818`. Exact label `FADING_WAVE_LIVE_PUMP_SHORT_READY` là READY giao dịch thật, **không phải OBSERVE ONLY**.
- Dữ liệu causal trước entry: top 150 Binance USDT perpetual theo quote-volume hiện tại, quote-volume tối thiểu `$2M`, `change24hPct <= +5%`, ít nhất 110 nến 5m đã đóng và đúng nến 5m đang live. Detector chỉ đọc OHLC, quote-volume, taker-buy quote-volume, EMA13/25/99 và ATR14 có trước tick phát hiện; không dùng nến tương lai, outcome, paper PnL hay thống kê hậu nghiệm. Scanner full kiểm tra universe mỗi 15 giây; symbol đã hiện trong Liquid V2 còn được đánh giá lại theo kline tick với debounce dưới 1 giây.
- Điều kiện phân loại sóng tàn: EMA13 `<` EMA25 `<` EMA99, EMA99 giảm ít nhất `0,15%` trong 12 nến, close gần nhất dưới EMA99, return 12 nến `<=-1,5%`, ít nhất 8/12 nến dưới EMA99; đỉnh cao nhất 48 nến phải đã cách tối thiểu 6 nến và live-open còn thấp hơn đỉnh đó ít nhất `3%`. Nhờ vậy nhãn không bắt pump đầu tiên từ nền phẳng hoặc coin còn uptrend.
- Điều kiện nến bơm live: high/open `>=4%`, mark/open `>=2%`, range/ATR `>=2,5x`, quote-volume live `>=1,8x` median 20 nến và taker delta `>=+8%`; high phải quét trên EMA99 ít nhất `0,5%`, mark vẫn trên EMA99. Để không SHORT lúc giá còn dựng thẳng, detector chỉ READY sau khi nến live đã trả lại `0,6-6%` từ high và upper-wick share `>=8%`. Dedupe dùng open-time của nến live; first observation/restart chỉ nhận nến không quá 6 phút.
- Entry/size/SL/TP: transition mới tạo paper SHORT `IMMEDIATE_MARK`, margin `$10`, leverage `5x`, TP `+10% ROE`, SL `-20% ROE`, max hold 4h. Đồng thời auto profile `FADING_WAVE_LIVE_PUMP_SHORT` gửi Binance **MARKET SHORT**, margin cấu hình mặc định `$1`, leverage cố định `5x`; quantity có thể làm tròn lên min-notional của sàn nên margin thực tế có thể nhỉnh hơn `$1`. Sau fill, TP/SL được neo lại theo average fill với cùng khoảng cách signal; các gate Orders enabled/dry-run, existing position, max-position, dedupe claim, symbol/quantity/preflight và Binance API vẫn fail-closed. Không thay đổi entry, size, SL/TP của cohort khác hoặc vị thế đang mở.
- Discord/thống kê/WHITELIST: transition READY gửi embed đỏ ngay trong nến, có entry mark, các metric downtrend/pump/rút đỉnh, plan `$1 x5`, TP/SL và link Binance/Coinglass. Stats dùng paper trade `CLOSED` đúng exact label để tính W/L, WR, PF, Net PnL và AvgROE; không dùng stats làm gate Binance. Exact key UI/runtime là `heatmap-v2:FADING_WAVE_LIVE_PUMP_SHORT_READY`, mặc định tắt và không được ghi vào persisted whitelist/real-enabled; checkbox chỉ hiện khi CLOSED AvgROE `>4%`.
- Tương thích JSON cũ: `fadingWaveLivePump5m`, live-open/detected timestamps, paper snapshot, ba setting route và audit `binanceEntryCohort`/`binanceEntryPolicyVersion` đều optional additive. Loader normalize store cũ thiếu setting về enabled, `$1`, `5x` nhưng không migrate/rewrite file, không backfill nhãn và không replay trade lịch sử; record cũ thiếu field chỉ không match detector mới.

### Liquid Flow V2: post-pump flagpole + rút râu + force BUY kill SHORT (2026-08-18)

- Versions đang chạy: detector `LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_V1_20260818`, container/registry `LIQUID_HEATMAP_FLOW_V2_FLAGPOLE_SHORT_KILL_V22_20260818`, paper `LIQUID_FLOW_V2_PAPER_V30_FLAGPOLE_SHORT_KILL_PAPER_20260818`, Discord `LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_DISCORD_V1_20260818`, whitelist `LIVE_CARD_WHITELIST_V15_FLAGPOLE_SHORT_KILL_20260818`. Exact label là `POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY`; đây là READY có paper thật nhưng **paper-only**, không phải OBSERVE ONLY và không cấp Binance.
- Dữ liệu causal trước entry: universe top 150 USDT perpetual theo Binance quote-volume hiện tại, quote-volume tối thiểu `$2M`, `change24hPct >= +5%`, tối đa 220 nến 5m đã đóng, và force-order BUY của Binance trong cửa sổ hiện tại. Detector chỉ đọc OHLC, quote-volume, taker-buy quote-volume, ATR14 và thời gian đóng nến; không đọc nến live, outcome, paper PnL hay dữ liệu tương lai. Force-order socket phải `OPEN`; OI chỉ cộng/giảm confidence qua evidence `oi-not-expanding`, không phải điều kiện bắt buộc.
- Điều kiện phân loại: trước cột cờ phải đã có một nhịp pump `>=8%`, đỉnh đó cách flagpole ít nhất 4 nến và giá đã pullback `>=2,5%`, nên pump đầu tiên từ nền phẳng không match. Flagpole bullish phải break local-high 18 nến ít nhất `0,2%`, body `>=1,5%`, range `>=2,5%`, range/ATR `>=2,2x`, volume `>=2,5x` median 20 nến, taker delta `>=+8%` và close-position `>=72%`. Nến 5m kế tiếp đã đóng phải có lower-wick share `>=20%`, low không thủng flagpole-open quá `1,5%`, close giữ ít nhất 55% body cột cờ, nằm không thấp hơn `99,5%` flagpole-close, close-position `>=60%`, volume `>=1x` và taker không âm. READY còn cần recent short liquidation tối thiểu `max($10K, quoteVolume*0,01%)` và burst `>=1,5x`.
- Entry/size/SL/TP: transition READY mới tạo paper LONG `IMMEDIATE_MARK` theo `FLAGPOLE_SHORT_KILL_5M_CLOSED_RECLAIM_MARK`, margin `$10`, leverage cố định `5x`, TP `+10% ROE`, SL `-20% ROE`, max hold 4h. `liquidFlowV2AutoBinanceProfile` trả `eligible=false`, cohort `FLAGPOLE_SHORT_KILL_PAPER`; exact label không có trong `LIQUID_FLOW_V2_AUTO_REAL_LABELS`, vì vậy không gửi Binance và không ảnh hưởng entry/size/SL/TP của vị thế thật hoặc trade đang mở. Discord chỉ gửi transition READY mới, dedupe theo symbol + label + signal-candle, có link Binance/Coinglass và nêu rõ paper-only.
- Thống kê/WHITELIST: card/stats dùng exact key UI/runtime `heatmap-v2:POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY`. Active đếm primary lẫn secondary classification; W/L, WR, PF, Net PnL và AvgROE chỉ dùng paper trade `CLOSED` đúng label. Key mặc định tắt, không được thêm vào persisted enabled keys; checkbox chỉ hiện khi closed AvgROE `>4%`. Việc đủ điều kiện checkbox không tự bật Binance và hiện tại auto profile vẫn luôn false.
- Tương thích JSON cũ: các field `flagpoleShortKill5m`, `flagpoleShortKillReadyAt`, short-liquidation prior/older/decay/peak và paper snapshot tương ứng đều optional additive. Không migrate/rewrite cache, paper hay trade lịch sử; record cũ thiếu field không match nhãn mới, còn loader/stat lifecycle cũ tiếp tục hoạt động. Dedupe first-observation chỉ nhận signal candle mới không quá 15 phút để restart không replay tín hiệu cũ.

### Liquid Flow V2: kline freshness fail-closed và tự REST-reseed (2026-08-18)

- Versions đang chạy: detector `LIQUID_HEATMAP_FLOW_V2_KLINE_FRESHNESS_V21_20260818`, freshness gate `LIQUID_FLOW_V2_KLINE_FRESHNESS_GATE_V1_20260818`. Sự cố được nhận diện khi 49/49 row còn đủ số nến nhưng close-time 5m đã cũ khoảng 8-9 giờ; websocket pong trước đây làm connection trông khỏe dù không có market-data message.
- Dữ liệu causal trước entry: kiểm tra close-time của nến đã đóng cho từng symbol ở 5m/15m/1h/4h, với tuổi tối đa mặc định lần lượt 12/25/75/270 phút. Kline websocket chuyển từ endpoint cũ `wss://fstream.binancefuture.com/stream` (mở được socket nhưng không phát kline) sang endpoint market-data đang hoạt động `wss://fstream.binance.com/market/stream`; có thể override bằng `BINANCE_FSTREAM_MARKET_WS_BASE`. Pong chỉ chứng minh kết nối transport còn trả lời, không còn cập nhật `lastTickAt`. Cache đủ số lượng nhưng quá tuổi vẫn bị coi là thiếu và được REST seed/merge lại trước khi phân loại.
- Điều kiện phân loại/gate: chỉ chạy classifier bình thường khi cả bốn interval còn fresh. Thiếu hoặc stale ở bất kỳ interval nào thì row bị ép về exact label hiện hữu `WAIT`, phase `WAIT`, `dataStale=true`, không phát READY mới. Đây là fail-closed gate thật trước paper/Discord/Binance, không phải nhãn OBSERVE ONLY. Khi dữ liệu phục hồi, READY có signal candle thiếu timestamp hoặc cũ quá 15 phút bị chặn để không replay lệnh của quãng outage.
- Recovery/telemetry: auto REST-reseed mặc định bật và target đúng symbol/interval stale; cache merge theo `openTime`, không xóa nến hợp lệ. API/UI bổ sung `staleDataCount`, `dataFreshnessVersion`, `klineTelemetry` và `row.dataFreshness`; header báo `KLINE STALE · FAIL CLOSED` hoặc REST fallback khi websocket im nhưng cache đã được seed fresh.
- Thống kê/WHITELIST: stale row không tạo paper nên không thêm W/L, WR, PF, Net PnL hoặc AvgROE; công thức thống kê CLOSED exact-label giữ nguyên. Không thêm nhãn/card/key mới nên không thêm checkbox WHITELIST; các key hiện hữu vẫn mặc định tắt và chỉ hiện khi CLOSED AvgROE `>4%`.
- Ảnh hưởng giao dịch: chặn entry paper mới, Discord READY và Binance auto-entry trong lúc kline stale; không đóng/sửa vị thế đang mở. Size, leverage, công thức entry, SL và TP của mọi cohort giữ nguyên. Sau recovery chỉ signal candle mới trong 15 phút mới được phép tiếp tục transition.
- Tương thích JSON cũ: không migrate/rewrite snapshot, feature, paper hoặc trade JSON. Các field freshness/telemetry là optional additive; client cũ có thể bỏ qua. Record cũ thiếu candle timestamp được xử lý fail-closed chỉ ở recovery transition, không bị sửa lịch sử hoặc đổi cách thống kê.

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

- Version tuổi vị thế: `BINANCE_NEGATIVE_TP_TO_ENTRY_AFTER_8H_V1_20260816`; rule âm sâu hiện tại là `BINANCE_NEGATIVE_TP_TO_ENTRY_V4_CAP_TSL_INDEPENDENT_ROE20_20260824`. Rule position 12 giờ không âm `BINANCE_TP_TO_ROE1_AFTER_12H_V1_20260812` đã bị tắt bởi `BINANCE_TP_AFTER_12H_DISABLED_V2_20260905`.
- Dữ liệu causal sau entry: chỉ dùng active Binance position hiện tại gồm average `entryPrice`, `positionAmt`/side, Mark Price hoặc unrealized PnL để tính ROE hiện tại, `openedAt` đã lưu từ fill trong `sl-tracking` (fallback thận trọng là lần runtime đầu tiên nhìn thấy position), và trạng thái `Cap TSL`. Khi thực thi mới đọc regular/algo open orders và symbol tick/lot metadata. Không dùng candle, signal outcome, paper PnL hay dữ liệu tương lai.
- Điều kiện phân loại: position phải còn mở đủ `8h` (`28800000ms`) và **ROE hiện tại < 0%**. Đủ 8h nhưng ROE bằng 0 hoặc dương thì không đổi TP. Symbol đang check `Cap TSL` vẫn được loại riêng khỏi nhánh **theo tuổi 8h**, nhưng rule cứu lỗ sâu ROE `<=-20%` V4 không bị Cap TSL chặn và có thể đưa TP về entry trước 8h. Fallback cũ dựa trên thời gian âm liên tục 4h đã bỏ, `NEG_TP_TIMEOUT_MS` không còn được dùng. Có thể tắt rule tuổi bằng `BINANCE_NEGATIVE_TP_AFTER_8H_ENABLED=false` hoặc đổi tuổi qua `BINANCE_NEGATIVE_TP_AFTER_8H_MS`.
- Thực thi Binance/TP/SL: tái sử dụng pipeline negative-TP idempotent. Nếu chưa có close order gần entry, chỉ hủy TP close-side cũ nằm xa entry rồi đặt `LIMIT GTC` cho toàn bộ quantity còn lại tại average entry, `reduceOnly=true` ở one-way hoặc đúng `positionSide` ở hedge mode. LIMIT có thể khớp tại entry hoặc tốt hơn khi giá hồi; không MARKET-close lúc đang âm. SL/profit-lock được giữ nguyên, không đổi entry, side, margin, size hoặc leverage. Rule TP +1% sau 12h đã tắt nên không còn worker đó tranh target.
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

### TP về hòa vốn khi Binance ROE âm 20% (cập nhật 2026-08-24)

- Version: `BINANCE_NEGATIVE_TP_TO_ENTRY_V4_CAP_TSL_INDEPENDENT_ROE20_20260824`, thay thế V3 loại trừ Cap TSL.
- Dữ liệu dùng và tính causal: đây là protection sau entry, chỉ dùng active position Binance với average `entryPrice`, `markPrice`/unrealized PnL, margin và leverage lấy từ user-data socket hoặc shared REST snapshot hiện tại. Không dùng nến tương lai, paper outcome hay PnL đóng để quyết định.
- Điều kiện phân loại: vị thế đang mở, gồm bot, Liquid Flow V2 và lệnh vào tay, pass khi Binance ROE `<= -20%` (bao gồm đúng `-20%`) **dù symbol đang check `Cap TSL` trên Orders**. Cap TSL chỉ còn quản lý trần profit-lock/trailing SL dương. Socket kích hoạt theo tick; scanner 90 giây và deep guard là các đường dự phòng. Worker chạy ngay khi server listen, không chờ kline warm-up. Dedupe theo symbol + entry và cooldown API 2 phút tránh đặt lặp.
- Cách thống kê: đây không phải signal/label/tier/card mới; không tạo WR/PF/PnL cohort và không thêm checkbox `WHITELIST`. Log runtime ghi version, symbol và giá entry để audit execution.
- Ảnh hưởng giao dịch: mọi symbol match đều có thể hủy riêng TP close-side cũ nằm xa entry rồi đặt một lệnh `LIMIT GTC reduceOnly` tại average entry. Không mở lệnh, không đổi entry, size/margin/leverage, không hủy/đặt/sửa SL. Nếu đã có TP/close order gần entry thì giữ và skip. Profit-lock dương/Cap TSL vẫn chạy theo rule riêng; emergency âm sâu có ưu tiên hơn rule tuổi 8h và TP +1% sau 12 giờ khi đang âm.
- Tương thích JSON cũ: không đổi schema giao dịch và không migrate/rewrite trade JSON. Tiếp tục dùng đúng key/API/localStorage `Cap TSL` hiện hữu cho profit-lock; không thêm checkbox/field mới. State optional trong `data/orders-cap-tsl.json` vẫn load nguyên trạng nhưng không còn là opt-out của deep-loss. Map dedupe chỉ ở runtime; restart vẫn đọc order Binance hiện hữu để nhận ra TP tại entry.

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
## 2026-08-12 - Binance position 12h: dời TP còn lại về +1% ROE (đã tắt 2026-09-05)

> Lịch sử: policy dưới đây đã bị supersede bởi `BINANCE_TP_AFTER_12H_DISABLED_V2_20260905`; runtime hiện tại không chạy rule này.

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

## 2026-08-17 - CoinGlass Model 3 scheduler tối đa 3 phút, 40 movers và Discord observe-only

- Version collector/universe: `COINGLASS_WEB_HARD_3M_BUDGET_V10_20260817`; proposal:
  `COINGLASS_WEB_ZONE_PROPOSAL_V2_20260817`; notifier: `COINGLASS_WEB_DISCORD_LINKS_V3_20260817`. Mode cố định `OBSERVE_ONLY`.
  Scheduler server chạy mặc định mỗi `180000ms`; overlap bị chặn bởi `running/loginRunning`. Collector dùng bốn page trong cùng
  persistent browser context (`COINGLASS_WEB_BROWSER_CONCURRENCY=4`) cho cohort tối đa 40 coin. Hard crawl budget là `150000ms`, chừa khoảng
  30 giây trong chu kỳ cho publish/Discord; React state lỗi chỉ chờ `12s`. Mỗi page chỉ xử lý
  tuần tự một symbol nên không trộn response/canvas. Nút refresh thủ công vẫn giữ nhưng không bắt buộc.
- Dữ liệu dùng trước phân loại: Binance Futures public `exchangeInfo`, ticker 24h, bulk best bid/ask và OI hiện tại; CoinGlass exact
  Model 3 48h `instrumentId/prices/y/liq/range/updateTime`. BTC là `REFERENCE`; tối đa 39 alt được lấy từ exact selector Liquid Flow V2,
  xen kẽ `UP change24h DESC` và `DOWN change24h ASC`, volume chỉ tie-break. Toàn bộ cohort tối đa 40 coin được crawl và hiển thị,
  kể cả coin không đủ điều kiện Discord.
- Điều kiện `qualified`: phải là altcoin có fresh status `OK`; Binance volume 24h `>= $50M`, trades `>=20K`, OI notional `>= $5M`,
  spread `<=15bps`; CoinGlass có `>=100` cells, `>=2` peak trong `±20%`, ít nhất một peak bền `>=3` bars; proposal phải là
  `WAIT_LONG_CONFIRMATION` hoặc `WAIT_SHORT_CONFIRMATION`. V7 còn yêu cầu observed trade plan đầy đủ: entry tham chiếu là giá snapshot,
  TP1 là cụm thanh lý mục tiêu chính, TP2 là cụm kế tiếp xa hơn nếu có, SL/invalidation là cụm mạnh phía đối diện; TP và SL phải đúng phía
  LONG/SHORT và reward:risk phải `>=1`. BTC, stale/fetch-failed, liquidity yếu, cluster yếu, plan thiếu/R:R thấp và `WAIT_BALANCED/NO_DATA`
  vẫn hiện card cùng reason nhưng `qualified=false` và không gửi Discord. Top-book chỉ audit, không phải hard gate.
- Khi hết budget, worker không nhận symbol mới; symbol chưa thử được ghi `SCAN_BUDGET_EXHAUSTED`, dùng last-good nếu có hoặc card lỗi nếu chưa có.
  Row stale/budget-exhausted không bao giờ `qualified`, nhờ đó thời gian được chặn mà không biến dữ liệu cũ thành tín hiệu mới.
- Proposal chấm `strength × exp(-|distance|/8) × persistence boost`, cộng ba vùng mạnh nhất mỗi phía. Một phía cần mạnh `>=1.25x`
  và target cách giá `<=15%`; LONG vẫn phải đợi reclaim/retest, SHORT phải đợi sweep-reject/breakdown-retest. Đây không phải entry signal/gate thật.
- Discord chỉ gửi row `qualified` có plan hoàn chỉnh, dedupe V2 theo `symbol + action`, cooldown mặc định 30 phút, retry một lần khi 429 và throttle giữa message.
  Embed LONG màu xanh, SHORT màu đỏ; hiển thị Entry sau xác nhận, TP1/TP2, SL, R:R, điều kiện kích hoạt/vô hiệu, cells, lực hai phía,
  volume/OI/spread và mover rank. V3 thêm link HTTPS theo exact symbol tới `binance.com/en/futures/{SYMBOL}` và CoinGlass
  `LiquidationHeatMapModel3?coin={BASE}&type=pair`; title cũng mở Binance. Symbol/base phải qua allowlist chữ-số trước khi dựng URL.
  Các mức và link này là observed setup, không phải order instruction tự động.
  Webhook ưu tiên `COINGLASS_WEB_DISCORD_WEBHOOK_URL`, sau đó fallback webhook liquid/default đang cấu hình; API chỉ công khai boolean configured.
  Nếu auth file chưa có quyền altcoin hoặc crawler nhận login/permission error, scheduler gửi `AUTH_REQUIRED` kèm link đăng nhập, cooldown 60 phút.
- Cách thống kê/UI: snapshot/card lưu mover side/rank, qualification reasons, target/risk zone, strength/persistence, volume/OI/top-book/spread;
  KPI hiển thị scanned/target, qualified Discord, top tăng/giảm và canh long/short. Ảnh canvas chỉ audit nội bộ, không render/OCR.
  Các số này không tham gia paper W/L, WR, PF, AvgROE, NET hoặc whitelist stats.
- Ảnh hưởng Binance/entry/size/SL/TP: **không**. Isolation contract giữ
  `affectsLiquidFlowV2/signals/paper/Binance/entry/size/SlTp=false`; scheduler/notifier không gọi order client, paper manager hay protection.
- Whitelist: không thêm label/card giao dịch nên không thêm checkbox/matcher. Policy hiện hữu vẫn mặc định tắt và chỉ hiện khi paper CLOSED
  AvgROE `>4%`; Discord CoinGlass không cấp quyền Binance.
- Tương thích JSON cũ: field scheduler/notifications/qualification/mover/liquidity/proposal/tradePlan/browserConcurrency/scanBudgetMs đều optional. Snapshot trước exact V10 chỉ giữ BTC
  fail-closed; alt cũ không được gọi là mover. `notifications.json` mới lưu dedupe/cooldown và recent events trong store git-ignore.
  Không migrate/rewrite paper, signal, settings hoặc outcome cũ; lỗi collector/notifier không chặn server/trading.

## 2026-08-30 - CoinGlass strong-wave SHORT scalp rồi chờ LONG reclaim (top 1-40 và 41-80)

- Version đang chạy: lifecycle `COINGLASS_ZONE_LIFECYCLE_V8_STRONG_SHORT_5ROE_REVERSAL_WATCH_20260830`, Binance
  `COINGLASS_ZONE_LIFECYCLE_BINANCE_V8_STRONG_SHORT_5ROE_REVERSAL_WATCH_20260830` và reversal
  `COINGLASS_STRONG_WAVE_REVERSAL_V1_SHORT_5ROE_THEN_5M_RECLAIM_20260830`. Cùng rule được nối vào manager primary hạng `1-40`
  và manager secondary hạng `41-80` version `COINGLASS_WEB_SECONDARY_STREAM_V3_RANK_41_80_STRONG_REVERSAL_1USDT_20260830`;
  state/dedupe của hai luồng vẫn nằm trong hai `dataDir` độc lập.
- Dữ liệu causal trước SHORT giữ nguyên: snapshot CoinGlass Model 3 ở mép phải, vùng có persistence/strength, nến hiện tại, trạng thái
  `FRESH -> APPROACHING -> SWEPT -> REJECTED/ACCEPTED`, target edge zone kế tiếp, khung trùng 12h/24h và `change24hPct` Binance.
  Case riêng chỉ là vùng `ABOVE` chuyển `REJECTED`, hướng `SHORT`, `change24hPct >=10%` (`STRONG_UP_WAVE`) và plan target hợp lệ.
- Entry/size/TP SHORT: MARKET theo policy Zone Lifecycle hiện hữu; primary giữ margin cấu hình hiện tại (mặc định `$5`), secondary giữ `$1`, cùng `5x`.
  Riêng strong-wave SHORT mới chốt **100% tại +5% ROE**, tương đương khoảng `-1%` giá ở `5x`; không còn TP1 80% + runner 20%.
  SL vẫn không đặt theo policy TP-only. Chỉ áp entry tạo sau V8; vị thế, order và TP của V7 đang tồn tại không bị hủy hoặc sửa.
- Sau khi Binance xác nhận SHORT đã hết position và không còn order cùng symbol, bot ghi `shortClosedAt` rồi mới chuyển sang `WAIT_RECLAIM` tối đa 6 giờ;
  nó không đảo LONG ngay lúc TP. Mỗi nến đã đóng 5m sau mốc đó được kiểm tra causal: low quét EMA13 (tolerance 0,15%), close xanh reclaim trên
  EMA13 và EMA25, râu dưới >=25% range và >=0,5 body, close nằm 35% phía trên nến, taker-buy quote >=52%; cấu trúc 5m phải
  `EMA13 > EMA25 > EMA99`, còn 15m phải trên EMA99 và EMA13 không thấp hơn EMA25 quá 0,5%. Mark lúc submit phải còn trên vùng reclaim và lệch
  close xác nhận không quá 0,75%.
- Entry/size/SL/TP LONG reversal: chỉ khi đủ toàn bộ xác nhận trên và symbol không có position/order; MARKET margin `$1 x5` ở cả hai luồng.
  TP dùng mép dưới vùng ABOVE vừa reject, cap tối đa `+3%` giá và chỉ vào khi còn ít nhất `+1%` giá; không đặt SL riêng cho nhánh Zone Lifecycle LONG này.
  Discord cùng webhook của từng stream chỉ gửi khi LONG thực sự submit, kèm EMA/taker-buy/entry/TP; các trạng thái chờ không spam message.
- Thống kê/whitelist: không thêm signal label/card mới. SHORT và reversal LONG tiếp tục mang source `coinglass-zone-lifecycle`, nên audit nằm trong
  CoinGlass Zone Lifecycle; không nối checkbox `WHITELIST` mới và không thay policy card hiện hữu mặc định OFF/chỉ hiện khi CLOSED AvgROE `>4%`.
- Tương thích JSON cũ: `strongWaveReversalWatches`, `takeProfitRoePct`, evidence EMA/taker và các timestamp/status watch đều optional.
  State cũ thiếu watch đọc thành `{}`; processed event cũ giữ dedupe, không replay/backfill reversal. Break-even runner V7 vẫn nhận metadata V7 để
  quản lý vị thế cũ; V8 không có runner nên không chạy rule dời SL đó. Không migrate/rewrite paper, execution hoặc position JSON lịch sử.

## 2026-08-30 - Giảm size strong-wave SHORT primary xuống $3

- Version: lifecycle `COINGLASS_ZONE_LIFECYCLE_V9_STRONG_SHORT_3USDT_5ROE_REVERSAL_20260830`, Binance
  `COINGLASS_ZONE_LIFECYCLE_BINANCE_V9_STRONG_SHORT_3USDT_5ROE_REVERSAL_20260830`. Dữ liệu trước entry và phân loại không đổi:
  CoinGlass `ABOVE -> REJECTED`, plan target hợp lệ và `change24hPct >=10%` mới là `STRONG_UP_WAVE SHORT`.
- Ảnh hưởng Binance/entry/size/SL/TP: entry MARKET và gate giữ nguyên; riêng lệnh mới thuộc subtype này ở primary top `1-40` dùng margin `$3 x5`
  thay `$5 x5`. Secondary top `41-80` vốn là luồng test `$1` nên giữ `$1 x5`, không bị tăng lên `$3`. TP SHORT vẫn đóng 100% ở `+5% ROE`,
  SL none; LONG reversal vẫn `$1 x5`, target 1-3% giá và SL none. Không sửa position, order hoặc protection đã mở trước V9.
- Cách thống kê/whitelist: không thêm nhãn/card/cohort; source vẫn `coinglass-zone-lifecycle`, matcher và checkbox WHITELIST không đổi.
  Policy mặc định OFF/chỉ hiện khi CLOSED AvgROE `>4%` của card hiện hữu giữ nguyên.
- Tương thích JSON cũ: chỉ thêm config optional `strongShortMarginUsdt`; state/event cũ thiếu field dùng default theo stream. Không migrate/rewrite
  execution, paper hay snapshot cũ và không replay event đã processed.

## 2026-08-30 - Profit-lock fast-wave chỉ còn explicit symbol hoặc DCA gần đây

- Version: `BINANCE_PROFIT_LOCK_V15_FAST_WAVE_EXPLICIT_DCA_ONLY_20260830`. Dữ liệu causal sau entry vẫn là Binance Position Risk/socket
  (`side`, entry, mark, leverage, ROE), metadata nguồn manual/Liquid Flow V2, danh sách explicit symbol và timestamp DCA cùng chiều gần nhất.
  Snapshot `change24hPct` vẫn có thể đọc để audit nhưng mặc định không còn quyền phân loại fast-wave.
- Phân loại: LONG manual/Liquid Flow V2 chỉ vào fast-wave khi symbol thuộc `BINANCE_FAST_WAVE_SYMBOLS` (mặc định `ZKPUSDT,4USDT`) hoặc vừa DCA
  cùng chiều trong 15 phút. Điều kiện cũ `abs(change24hPct) >=10%` bị tắt mặc định; chỉ có thể bật lại rõ ràng bằng
  `BINANCE_FAST_WAVE_CHANGE_24H_ENABLED=true`. Vì vậy CYS không còn bị hoãn chỉ do biến động 24h.
- Ảnh hưởng Binance/SL: CYS và coin thường đang mở dùng lại rule manual/Liquid Flow V2 `ROE >=10% -> lock +1% ROE`; bot thay protection stop
  theo luồng idempotent hiện hữu. ZKP/4 hoặc recent-DCA vẫn chờ ROE 30% rồi lock +5% ROE. Entry, side, margin, leverage và TP không đổi;
  không MARKET-close khi replace SL lỗi. Rule có hiệu lực cho position đang mở sau reload, không chỉnh outcome lịch sử.
- Thống kê/whitelist: không thêm nhãn/card/tier/cohort hoặc checkbox; matcher và policy WHITELIST mặc định OFF/chỉ hiện khi CLOSED AvgROE `>4%`
  không đổi. Profit-lock không cấp quyền mở lệnh mới.
- Tương thích JSON cũ: không đổi schema bắt buộc và không migrate/rewrite `sl-tracking.json`. Field V14 đã lưu vẫn đọc được; lần dời SL kế tiếp ghi
  version V15. Env flag mới optional, thiếu flag mặc định false.

## 2026-08-30 - Profit-lock V16 đối chiếu chiều source khi symbol đảo vị thế

- Version: `BINANCE_PROFIT_LOCK_V16_SOURCE_SIDE_ALIGNED_20260830` và matcher
  `COINGLASS_ZONE_LIFECYCLE_POSITION_MATCH_V2_SIDE_ALIGNED_20260830`. Dữ liệu trước entry không đổi; sau fill matcher chỉ dùng metadata đã có
  (`signalSource`, `signalSide`, order/lifecycle), Binance position amount/side, entry, mark, leverage và ROE realtime.
- Phân loại: policy `CoinGlass Zone Lifecycle TP-only/no-SL` chỉ được giữ khi chiều plan đang track khớp chiều position hiện tại. Ví dụ plan cũ
  `SELL/SHORT` không còn được chặn profit-lock của một position `LONG` mới trên cùng symbol. Tracking mới ghi thêm `signalSide`; source manual hiện tại
  tiếp tục nhận rule manual/cap hiện hữu. AUCTION là case tái hiện: Zone Lifecycle SHORT đóng, sau đó LONG thủ công mở cùng symbol.
- Thống kê: không thêm nhãn/card/cohort và không đổi W/L, WR, PF, AvgROE hay NET PnL. Không thêm checkbox WHITELIST; policy card hiện hữu vẫn mặc định
  OFF và chỉ hiện khi CLOSED AvgROE `>4%`.
- Ảnh hưởng Binance/entry/size/SL/TP: không đổi quyền entry, side, margin, size, leverage hoặc TP. Chỉ lệnh mới/position còn mở được phân loại đúng để
  rule `ROE >=10% -> SL +1% ROE` có thể chạy; CoinGlass position đúng lifecycle vẫn giữ no-SL/TP-only như trước. Không sửa hồi tố vị thế AUCTION đã đóng.
- Tương thích JSON cũ: `signalSide` optional. JSON cũ thiếu field tiếp tục dùng fallback source legacy; không migrate/rewrite/backfill trade, execution,
  snapshot hoặc outcome cũ. Version profit-lock mới chỉ được ghi khi một SL thực sự được arm/move.

## 2026-08-30 - SHORT TP-only dời SL về entry tại ROE 10%, DCA không trì hoãn

- Version đang chạy: `BINANCE_PROFIT_LOCK_V17_SHORT_TP_ONLY_BREAK_EVEN_20260830`. Dữ liệu trước entry, nhãn và quyền mở lệnh không đổi. Sau entry,
  monitor chỉ dùng dữ liệu Binance realtime/signed đã có: position side, `positionAmt`, mark, leverage, entry bình quân hiện tại và ROE, cộng metadata
  source/side đang track để phân biệt SHORT TP-only với CoinGlass Zone Lifecycle.
- Phân loại: SHORT bot hoặc SHORT thủ công thuộc policy không đặt SL ban đầu sẽ arm STOP hòa vốn khi `ROE >=10%`; target lần đầu là `0% ROE`, tức
  đúng entry bình quân Binance. Ladder sau đó giữ cơ chế hiện hữu: `ROE >=15% -> lock +5%`, `>=20% -> lock +10%` và tăng mỗi 5 điểm ROE.
  DCA cùng chiều không còn tự biến position thành fast-wave và không trì hoãn break-even; lần monitor kế tiếp lấy entry bình quân mới. Chỉ hai symbol
  explicit `ZKPUSDT,4USDT` tiếp tục dùng ngoại lệ fast-wave `ROE 30% -> lock +5%`, gap 25. CoinGlass Zone Lifecycle đúng source/side vẫn đi qua policy
  lifecycle riêng và không bị V17 đổi SL.
- Thống kê/whitelist: không thêm nhãn, card, tier, cohort hoặc checkbox. W/L, WR, PF, AvgROE và NET PnL không đổi; policy WHITELIST hiện hữu vẫn mặc
  định OFF và chỉ hiện khi CLOSED AvgROE `>4%`.
- Ảnh hưởng Binance/entry/size/SL/TP: không đổi entry, side, margin, size, leverage hoặc TP; SHORT vẫn không có SL ban đầu. V17 chỉ tạo/replace STOP
  sau khi position còn mở đạt ngưỡng, dùng close-position algo và entry bình quân hiện tại. Áp cho lệnh mở về sau và position đang mở ở tick đủ điều kiện;
  không sửa hoặc hồi tố lệnh SKR/ZKC đã đóng và không MARKET-close chỉ vì cài rule.
- Tương thích JSON cũ: không thêm schema bắt buộc. `profitLock*` cũ vẫn đọc được và được ghi version V17 khi arm/move; timestamp DCA fast-wave trước đây
  chỉ là state trong RAM nên không cần migrate. Không rewrite/backfill trade, execution, snapshot, outcome hoặc `sl-tracking.json` lịch sử.

## 2026-08-31 - Profit-lock V18 dùng biến động nến và cấm late MARKET-cut

- Version đang chạy: `BINANCE_PROFIT_LOCK_V18_CANDLE_VOLATILITY_NO_LATE_MARKET_CUT_20260831`; mark monitor
  `POSITION_MONITOR_PER_SYMBOL_MARK_STREAM_V5_PRICE_ROE_20260831`. Audit sáng 31/8 xác nhận SKR có nến 5m range `13,90%`, ZKC có nến 5m
  `4,31%` và 15m `6,89%`. Log cũ cho thấy SKR đã bị `SlTrailEmergency` MARKET-close nhiều lần khi target STOP đã bị xuyên; có lượt wick làm
  observed ROE nhảy `38-90%` rồi giá đảo lại trước khi stop được đặt.
- Dữ liệu causal trước entry không đổi. Sau entry, phân loại fast-wave chỉ đọc OHLC nến hiện tại/gần nhất đã có trong KlineCache: tối đa ba nến 5m
  và hai nến 15m, cộng entry bình quân, mark, leverage và side Binance realtime. ROE protection được tính trực tiếp từ
  `(mark-entry)/entry * leverage * direction`, không dùng margin/upnl socket có thể lệch trong lúc fill/DCA nhanh.
- Phân loại: fast-wave khi max range nến 5m `>=4%` hoặc 15m `>=6%`; `ZKPUSDT,4USDT` vẫn là explicit fallback. `% thay đổi 24h` bị loại hoàn toàn
  khỏi quyết định fast-wave, kể cả flag legacy được bật. Fast-wave tiếp tục chờ `ROE >=30% -> lock +5%`, gap 25; coin hết cửa sổ nến mạnh quay về
  rule SHORT TP-only `10% -> entry`. Threshold env optional: `BINANCE_FAST_WAVE_CANDLE_5M_RANGE_PCT` và
  `BINANCE_FAST_WAVE_CANDLE_15M_RANGE_PCT`.
- Ảnh hưởng Binance/entry/size/SL/TP: không đổi quyền entry, side, margin, size, leverage hoặc TP; không thêm SL ban đầu. Nếu target profit-lock đã bị
  xuyên trước khi STOP đặt/replace hoặc Binance trả immediate-trigger, bot chỉ defer/retry và giữ nguyên position; tuyệt đối không còn gửi MARKET
  reduce-only để cắt muộn. Rule áp từ V18 cho lệnh đang mở và lệnh mới ở tick kế tiếp; không sửa/hủy hồi tố order hoặc outcome ZKC/SKR đã đóng.
- Thống kê/whitelist: không thêm nhãn/card/tier/cohort, không đổi W/L, WR, PF, AvgROE hay NET PnL và không thêm checkbox. WHITELIST hiện hữu vẫn
  mặc định OFF, chỉ hiện khi CLOSED AvgROE `>4%`.
- Tương thích JSON cũ: không có field bắt buộc mới. `profitLock*` V17/V15 vẫn đọc được; lần arm/move tiếp theo ghi V18. Candle metrics chỉ tồn tại
  trong policy realtime/log, không migrate/rewrite/backfill `sl-tracking`, trade, execution, signal, snapshot hoặc outcome lịch sử.

## 2026-08-31 - EMA99 V2 pump-dump absorption LONG, Binance test $1

- Version đang chạy: `EMA99_KILL_RECLAIM_V2_PUMP_DUMP_ABSORPTION_20260831`; subtype metadata
  `setupVariant=PUMP_DUMP_ABSORPTION`. Nhãn/type công khai vẫn là `ema99_kill_reclaim_long` / `EMA99 Kill Reclaim`, nên đây là một cách giải thích
  chặt hơn cho nhãn có sẵn, không phải nhãn thống kê mới.
- Dữ liệu causal trước entry: chỉ OHLCV nến **đã đóng** trên 5m, EMA99, ATR14, RSI6 và volume nền/median; ngay trước submit còn đối chiếu mark Binance,
  BTC health, liquidity conflict, position và entry order hiện có. Nến 5m đang chạy và mọi dữ liệu sau trigger đều bị loại khỏi detector.
- Phân loại chuỗi: (1) spike phá đỉnh gần nhất, tăng tối thiểu `2,5%` hoặc range `>=1,8 ATR`, volume `>=3x`; (2) trong 1-2 nến kế tiếp
  flush từ đỉnh xuống `>=5%`, có nến đỏ, close quay về chân spike và volume `>=1,5x`; (3) có 2-6 nến hấp thụ, không tạo đáy sâu thêm quá
  `0,5%`, median volume `<=60%` volume flush và đáy ổn định; (4) chỉ thành `PUMP_DUMP_RECLAIM_LONG_READY` khi nến đóng xanh vượt high nến trước,
  đóng trên EMA99 nhưng cách không quá `2%`, volume trigger `>=1,5x`, RSI6 `>=38` và đang tăng, đồng thời chưa đuổi giá. Trước bước (4) chỉ là
  `PUMP_DUMP_FLUSH_WATCH` hoặc `PUMP_DUMP_ABSORPTION_WATCH`, không có entry/SL/TP và không được vào Binance.
- Audit QUSDT 5m ngày 31/8 tái hiện đúng mẫu ảnh: spike `3,24% / 8,94x`, flush `9,02% / 7,33x`, bốn nến hấp thụ với median volume
  `26,8%` volume flush; trigger đóng tại `0,024519`, score `73/B`, SL `0,0235444`, TP `0,025137`. Test đối chứng xác nhận nến live không làm thay
  kết quả, còn phân phối tiếp/tạo đáy mới không được phát LONG.
- Thống kê/WHITELIST: kết quả tiếp tục gom vào cohort `ema99_kill_reclaim_long`; field variant/stage chỉ để audit và UI có thêm trạng thái WATCH màu vàng.
  Không thêm card/nhãn thống kê nên không tạo checkbox mới. Checkbox WHITELIST của cohort hiện hữu vẫn mặc định OFF và chỉ được hiện khi CLOSED
  `AvgROE >4%`; runtime matcher không đổi.
- Ảnh hưởng Binance/entry/size/SL/TP: chỉ READY mới MARKET LONG với margin `$1 x10` (notional `$10`) khi switch subtype bật. Trigger phải còn mới
  trong 7 phút, live mark vẫn trên EMA99/SL, chase nằm trong `[-1%; +0,8%]`, TP còn cách mark trên `0,2%`, BTC/liquidity gate pass, không có position
  hoặc entry order cùng coin, dedupe 4 giờ và tối đa một order mỗi scan. SL đặt dưới đáy flush `0,2 ATR`; TP về open spike, tối thiểu `+0,6%` và
  cap `+3,5%`. Logic generic EMA99 cũ vẫn bị `LIVE_CARD_ONLY` chặn; ngoại lệ chỉ áp cho đúng subtype này. Không sửa position/order đã mở và không
  replay QUSDT lịch sử.
- Entry policy version `LIVE_CARD_LIQ_FLOW_COINGLASS_PUMP_DUMP_V17_20260831` cấp authorization nội bộ riêng cho đúng subtype READY này để đi qua
  lớp `LIVE_CARD_ONLY`; authorization không enumerable/không nhận từ HTTP payload và không cấp quyền cho generic EMA99 hay WATCH.
- Tương thích JSON cũ: `setupVariant`, `detectorVersion`, stage WATCH và các factor mới đều optional; client cũ có thể bỏ qua. Không migrate,
  rewrite hay backfill signal/trade/snapshot/outcome cũ. `.env.example` giữ switch false để cài mới fail-safe; runtime hiện tại bật true theo yêu cầu.

## 2026-08-31 - Liquid Flow V2 compact realtime payload

- Version: `LIQUID_FLOW_V2_PAPER_LIVE_SNAPSHOT_V1_ACTIVE_ONLY_20260831`. Dữ liệu causal, detector, nhãn, tier và gate trước entry không đổi;
  đây chỉ là thay đổi payload trình bày. `/api/liquid-flow-v2` ưu tiên trả cache hiện có ngay và refresh hết hạn chạy nền; SSE/API chỉ kèm paper
  `OPEN`/`PENDING_ENTRY`, còn summary tổng vẫn giữ nguyên. Lịch sử CLOSED/CANCELLED tiếp tục lấy đủ qua
  `/api/liquid-flow-v2-paper-stats` theo datepicker/label/page.
- Phân loại và thống kê: mọi row/features/classification và cách tính W/L, WR, PF, AvgROE, Net PnL vẫn dùng toàn bộ state ở server. Chỉ bỏ 300 record
  lịch sử dư thừa khỏi wire realtime; client bỏ render lại khi `generatedAt + paper.updatedAt + snapshotVersion` trùng nhau. Không thêm nhãn/card/tier
  hoặc checkbox; policy WHITELIST mặc định OFF/chỉ hiện khi CLOSED AvgROE `>4%` không đổi.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. Không đổi quyền đặt lệnh, entry, margin, leverage, side, SL, TP, paper lifecycle hay position đang mở.
  Active paper trade vẫn giữ đầy đủ field để nút LIMIT/MARKET và trạng thái TP/SL hoạt động.
- Tương thích JSON cũ: top-level và `paper.trades` vẫn là cùng kiểu; realtime chỉ thu gọn danh sách này về active và thêm optional
  `clientSnapshotVersion`, `liveSnapshotVersion`, `historyOmitted`. Client cần lịch sử dùng endpoint phân trang đã có. Không migrate/rewrite/backfill
  file paper, signal, execution, snapshot hoặc outcome cũ.
- Hạ tầng khởi động dùng `EDGE_PAPER_ENTRY_JOURNAL_STREAM_READER_V1_20260831`: journal Edge Paper được đọc tuần tự từng dòng thay vì nạp/split toàn
  bộ file trong RAM. Điều này giữ nguyên latest-record recovery và JSON NDJSON cũ, nhưng tránh khóa event loop/nhân bản file journal lớn; không đổi
  dữ liệu dùng trước entry, phân loại, thống kê, WHITELIST, Binance, entry, size, SL hoặc TP.
- Khi process vừa khởi động và chưa có cache scan, `/api/liquid-flow-v2` trả ngay snapshot `initializing=true` gồm paper active/summary và mảng row/stat
  rỗng; refresh đầy đủ chạy nền rồi cập nhật qua SSE. Client cũ bỏ qua field optional này; cache/snapshot đầy đủ sau warm-up giữ nguyên schema và rule.
- Realtime UI dùng `LIQUID_FLOW_V2_SSE_COALESCE_V1_5S_20260831`: fast-scan từng symbol vẫn phân loại, tạo paper, gọi Binance và Discord ngay như cũ,
  nhưng snapshot hiển thị được coalesce và chỉ gửi bản mới nhất tối đa mỗi 5 giây. Field `clientBroadcastVersion` optional; không đổi thống kê hay order.

## 2026-09-01 - Cảnh báo đỉnh pump cũ, xả dần rồi repump quét SHORT

- Versions: detector `LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_V1_20260901`, container/registry
  `LIQUID_HEATMAP_FLOW_V2_AGED_PUMP_FADE_REPUMP_V26_20260901`, Discord
  `LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_DISCORD_V1_20260901`. Exact label là
  `AGED_PUMP_FADE_REPUMP_SHORT_ALERT`, phase `READY`, nhưng **OBSERVE ONLY**, không phải gate/lệnh SHORT thật.
- Dữ liệu causal trước cảnh báo: chỉ nến futures Binance 5m đã đóng trong tối đa 340 bar; detector tìm đỉnh cũ trong 216 bar, cách nến tín hiệu ít
  nhất 8 bar, pump cũ `>=10%`, drawdown `>=10%`, fade return `<=-2%`, ít nhất một bước lower-high và EMA13 `<` EMA25 `<` EMA99 với slope EMA25
  12 bar `<=-0,35%`. Nến repump phải high/open `>=4,5%`, close/open `>=1,5%`, range `>=2,2 ATR`, volume `>=2,5x` median 20, taker delta
  `>=+5%`, quét đỉnh 12 bar `>=0,5%`, quét EMA25; sau đó giveback `1-8%`, upper wick share `>=20%`, close còn dưới đỉnh cũ và không vượt EMA99
  quá 1%. Detector giữ tín hiệu trong hai nến đóng gần nhất để scan sau không bỏ lỡ; không dùng nến live và không yêu cầu force-order socket.
- Phân loại/thống kê: nhãn mới là secondary label độc lập để không chiếm primary/executable signal. Card stats exact-label vẫn tính active và nếu có
  record CLOSED lịch sử thì AvgROE theo exact label; key UI/runtime là `heatmap-v2:AGED_PUMP_FADE_REPUMP_SHORT_ALERT`, mặc định OFF, không nằm trong
  persisted WHITELIST/real-enabled, và checkbox chỉ hiện khi CLOSED `AvgROE >4%`. Hiện detector không tạo paper nên mặc định không có sample CLOSED.
- Discord: transition mới trong tối đa 10 phút gửi embed màu cam tới webhook riêng, dedupe theo `symbol|label|signalCandleClosedAt`, kèm đỉnh cũ,
  pha fade, EMA, repump/ATR, volume/taker, giveback/râu trên và link Binance/CoinGlass. Dòng hành động ghi rõ chỉ đánh giá, không vào lệnh.
- Ảnh hưởng Binance/entry/size/SL/TP: **không có**. `observationOnly=true`; `affectsOrders/Binance/Entry/Size/SlTp=false`; không nối paper side,
  auto-Binance profile hay protection. Không đặt entry, margin, leverage, SL, TP; không sửa order/position/trade đang mở. Case PROMUSDT thật được fixture
  audit với pump cũ `+27,45%`, cách đỉnh 157 nến, drawdown `28,25%`, repump `9,95%`, volume `7,67x`, taker `+22,36%`, giveback `2,92%`.
- Tương thích JSON cũ: `agedPumpFadeRepump5m`, secondary classification, `agedPumpFadeRepumpReadyAt` và các metric đều optional additive. Snapshot/client
  cũ có thể bỏ qua; không migrate, rewrite, backfill hay replay cache, paper, order và outcome cũ. Restart chỉ seed first-observation nếu nến signal mới
  không quá 10 phút.

## 2026-09-01 - CoinGlass Zone Lifecycle primary giảm toàn bộ size về $2

- Versions: lifecycle `COINGLASS_ZONE_LIFECYCLE_V10_FIXED_2USDT_20260901`, Discord
  `COINGLASS_ZONE_LIFECYCLE_DISCORD_V10_FIXED_2USDT_20260901`, executor
  `COINGLASS_ZONE_LIFECYCLE_BINANCE_V10_FIXED_2USDT_20260901`. Đây là thay đổi size cho entry mới của stream primary; secondary rank 41–80 và
  strong-wave reversal vẫn giữ `$1`.
- Dữ liệu dùng trước entry và phân loại không đổi: CoinGlass Model 3 edge zone còn ở mép phải, lifecycle
  `FRESH → APPROACHING → SWEPT → REJECTED/ACCEPTED`, next target hợp lệ, 12h/24h agreement, change24h/strong-wave class, giá mark/slippage,
  position/order và các gate Orders/dry-run/credential hiện hữu. Không dùng outcome/PnL tương lai để đổi size.
- Binance/entry/size/SL/TP: base `$5→$2`, SHORT strong-wave `$3→$2`, LONG target xa có HTF `$6→$2`; leverage vẫn `5x`, nên requested notional
  là khoảng `$10` trước min-notional/step-size rounding. MARKET entry, direction, TP adaptive/partial, TP-only/no initial SL, runner BE, slippage,
  dedupe và max-position không đổi. Chỉ áp event/entry mới sau reload; không resize, close, cancel/replace TP hoặc thêm SL cho position/order đang mở.
- Thống kê/WHITELIST: không thêm label/card/key. Audit mới ghi `marginUsdt=2`; thống kê Binance tiếp tục dùng margin snapshot từng lệnh. Checkbox,
  exact matcher, CLOSED AvgROE `>4%` và trạng thái whitelist hiện hữu không đổi.
- Tương thích JSON cũ: `marginUsdt` là field sẵn có; event/audit cũ giữ `$3/$5/$6` để PnL/ROE lịch sử đúng. Config primary base/strong/large đều có
  default `$2`; loader state V9 vẫn đọc được và được ghi version V10 ở lần đánh giá sau, không migrate/rewrite/backfill lịch sử.

## 2026-09-01 - Hybrid Liquidity Hunter: CoinGlass hai phía + Binance xác nhận

- Versions: detector `COINGLASS_HYBRID_LIQUIDITY_HUNTER_V1_TWO_SIDED_BINANCE_CONFIRM_20260901`, Discord
  `COINGLASS_HYBRID_LIQUIDITY_DISCORD_V1_OBSERVE_ONLY_20260901`. Đây là luồng cảnh báo riêng chạy trên cả stream CoinGlass hạng `1–40` và
  `41–80`; **OBSERVE ONLY**, không phải CoinGlass Qualified hay Zone Lifecycle gate.
- Dữ liệu causal trước cảnh báo: heatmap Model 3 snapshot vừa quét, chỉ các edge zone còn ở mép phải (`edgeGap <=2`), persistence `>=3`, strength
  `>=20`, cách giá tối đa `25%`; sau prefilter mới lấy tối đa 8 candidate/stream từ Binance futures gồm 140 nến 5m + 140 nến 15m đã đóng,
  EMA13/25/99, ATR/range, quote volume, taker-buy quote volume, bid/ask depth snapshot, OI công khai và force-order 5 phút từ socket. Nến 5m quá 12 phút hoặc 15m quá
  35 phút bị `BINANCE_KLINE_STALE`; không dùng dữ liệu sau thời điểm cảnh báo.
- Phân loại CoinGlass: phải có ít nhất 2 cụm phía trên và 2 cụm phía dưới, tỷ lệ tổng attraction score phía mạnh/yếu `<=3`. Binance chỉ phát READY
  khi: (a) impulse tăng thân `>=2%`, range `>=1,8 ATR`, volume `>=1,8x`, giữ `>=60%` thân và pullback giữ `>=35%`, cấu trúc EMA 5m/15m bullish,
  taker-buy `>=52%`, book không ask-dominant (bid share `>=45%` nếu có), OI không xấu đi để thành `HYBRID_UPPER_FIRST_SHORT_SQUEEZE_READY`; hoặc (b) điều kiện đối xứng bearish/taker-buy `<=48%`, book không bid-dominant (bid share `<=55%`) để
  thành `HYBRID_LOWER_FIRST_LONG_FLUSH_READY`; hoặc (c) EMA25 bị cắt ít nhất 3 lần, ít nhất 3 râu lớn và cả kill LONG/SHORT xuất hiện để thành
  `HYBRID_TWO_SIDED_WHIPSAW_RISK_READY`. Không đủ xác nhận chỉ là `TWO_SIDED_LIQUIDITY_WATCH` và không gửi Discord.
- Discord: chỉ READY mới gửi webhook riêng, embed màu xanh/đỏ/cam hiển thị đồng thời cụm trên/dưới, score, impulse/retention, taker, OI, kill
  LONG/SHORT, target tham khảo và link CoinGlass/Binance. Dedupe theo stream/symbol/label/target trong 4 giờ. State primary/secondary tách riêng;
  webhook lỗi không đánh dấu đã gửi để lượt sau retry.
- Thống kê/WHITELIST: không tạo paper, không tạo card thống kê, không thêm label vào `V2 Binance Signal Stats`, vì vậy không có checkbox mới. Policy
  WHITELIST hiện hữu vẫn mặc định OFF và chỉ hiển thị khi exact cohort có CLOSED AvgROE `>4%`; detector này không tham gia matcher runtime.
- Ảnh hưởng Binance/entry/size/SL/TP: **không có**. Không gọi order executor, không mở/đóng/DCA position, không đặt entry/size/leverage/SL/TP và
  không sửa lệnh đang mở. `.env.example` mặc định tắt; instance hiện tại bật theo yêu cầu chỉ để gửi cảnh báo.
- Tương thích JSON cũ: thêm file state độc lập `hybrid-liquidity-hunter.json` trong từng data dir và các field notification/config đều optional.
  Snapshot/API/client cũ có thể bỏ qua; không migrate, rewrite, backfill hoặc replay paper, signal, trade, order, lifecycle và outcome cũ.

## 2026-09-01 - Coin Level Analysis V1: trang hỗ trợ/kháng cự theo mã coin

- Version: `COIN_LEVEL_ANALYSIS_V1`; route read-only `/coin-level-analysis` và API mới `/api/coin-level-analysis?symbol=...`. Đây là công cụ
  phân tích theo yêu cầu người dùng, **OBSERVE ONLY**, không phải detector, nhãn, tier, gate hay tín hiệu giao dịch thật.
- Dữ liệu dùng tại thời điểm bấm phân tích: Binance Futures public mark/index/funding, ticker và range/volume 24h, open interest, depth tối đa 500 mức,
  cùng 240 nến 5m/15m/1h/4h. Indicator chỉ dùng nến đã đóng cho EMA13/25/99, ATR14, trend và swing; nến đang chạy chỉ hiển thị riêng gồm OHLC,
  thân/râu và taker-buy share. Kết quả cache theo symbol 12 giây, UI tự làm mới 20 giây khi tab đang hiện.
- Phân loại vùng: swing high/low, range high/low và EMA đa khung được chấm theo trọng số khung; bid/ask depth được bin 0,5% và chỉ mang trọng số phụ.
  Các mức gần nhau được gom bằng tolerance `max(0,4% giá; 0,28 ATR5m)`, trả tối đa bốn vùng dưới/trên với `LOW/MEDIUM/HIGH`, score, nguồn và khoảng
  cách. Bias `BULLISH/BEARISH/NEUTRAL` dùng tổng trend score đa khung. Đề xuất chỉ là kịch bản có điều kiện: sát hỗ trợ phải chờ giữ vùng hoặc nến 5m
  đóng phá + retest; sát kháng cự phải chờ reject hoặc breakout + retest. Không coi râu nến là xác nhận và luôn cảnh báo order book có thể bị rút.
- Thống kê/WHITELIST: không tạo paper, signal, card, cohort, W/L, WR, PF, AvgROE hoặc Net PnL; không thêm checkbox. Matcher/WHITELIST hiện hữu vẫn
  mặc định OFF và chỉ hiện cho cohort CLOSED AvgROE `>4%`, hoàn toàn không đọc output trang này.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. API trả rõ `binanceEnabled=false` và tất cả cờ ảnh hưởng entry/size/SL/TP là false; không dùng
  credential, không gọi order/protection, không mở/đóng/DCA position và không sửa lệnh đang mở. Invalidation/target trên UI chỉ là mốc tham khảo.
- Tương thích JSON cũ: endpoint/schema mới độc lập và additive, không thay đổi snapshot hoặc file JSON hiện hữu. Không migrate, rewrite, backfill hay
  replay signal/trade/order/outcome cũ; client cũ không gọi route mới nên không bị ảnh hưởng.

## 2026-09-01 - Coin Level Analysis V2 xác nhận 15m, retest 5m

- Version: `COIN_LEVEL_ANALYSIS_V2_15M_CONFIRM`. Dữ liệu dùng trước đề xuất vẫn là public Binance mark/ticker/funding/OI/depth và 240 nến
  5m/15m/1h/4h; EMA13/25/99, ATR14, swing, range và trend chỉ dùng nến đã đóng. Vùng hỗ trợ/kháng cự, score và cách thống kê/hiển thị nguồn không đổi.
- Phân loại xác nhận: close 5m vượt biên chỉ là `EARLY_5M_ONLY`, không còn được gọi breakout/breakdown xác nhận. Chỉ khi nến 15m đã đóng trên
  kháng cự hoặc dưới hỗ trợ mới thành `CONFIRMED_15M`; sau đó 5m chỉ dùng kiểm tra retest giữ vùng/thất bại. UI hiện chip `15M ĐÃ XÁC NHẬN`,
  `CHỈ MỚI 5M · CHỜ 15M` hoặc `15M ĐANG CHỜ`. Invalidation tham khảo dùng buffer lớn hơn giữa `0,35 ATR5m` và `0,18 ATR15m` để tránh nhiễu 5m.
- Thống kê/WHITELIST: không tạo signal, paper, card, cohort hoặc thống kê W/L/WR/PF/AvgROE/Net PnL; không thêm checkbox. Đây vẫn là
  **OBSERVE ONLY**, không phải gate giao dịch thật; policy WHITELIST mặc định OFF/CLOSED AvgROE `>4%` không đổi.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. Không dùng credential, không gọi order/protection, không mở/đóng/DCA position và không sửa entry,
  margin, leverage, size, SL hoặc TP đang có. Trigger/invalidation/target chỉ là nội dung phân tích trên trang.
- Tương thích JSON cũ: object `recommendation.confirmation` là field additive optional; client cũ bỏ qua được. Endpoint giữ đường dẫn cũ, không
  migrate/rewrite/backfill snapshot, signal, trade, order hoặc outcome lịch sử.

## 2026-09-01 - Coin Level Analysis V3 kết hợp CoinGlass active liquidation edge

- Versions: `COIN_LEVEL_ANALYSIS_V3_COINGLASS_CONFLUENCE` và `COIN_LEVEL_COINGLASS_V1_ACTIVE_EDGE_20260901`. API/page giữ route cũ nhưng đọc thêm
  snapshot CoinGlass primary rank 1–40 và secondary rank 41–80, chọn row cùng symbol có heatmap mới nhất; lifecycle đọc đúng stream của row đó.
- Dữ liệu dùng tại thời điểm phân tích: toàn bộ Binance causal V2 giữ nguyên; CoinGlass chỉ dùng Model 3 `edgeZones` có `lastHeatmapX-lastX <=2`,
  cách mark Binance tối đa 35%, từ khung gốc 48h và thêm 12h/24h nếu collector đã cào cho qualified row. Mỗi vùng trả band low/high, distance,
  strength, persistence, intensity, attraction score và lifecycle `FRESH/APPROACHING/SWEPT/REJECTED/ACCEPTED` khi track khớp vùng. Dữ liệu quá
  20 phút bị đánh `stale` và không được coi là confluence xác nhận; coin ngoài active Top 80/auth lỗi trả unavailable, không dựng vùng từ history cũ.
- Phân loại/kết hợp: cộng attraction của tối đa ba active zone gần nhất mỗi phía trên các frame; độ lệch `<15%` là `BALANCED`, còn lại
  `UPPER_FIRST` hoặc `LOWER_FIRST`. So với Binance trend tạo `ALIGNED_LONG`, `ALIGNED_SHORT`, `CONFLICT_UPPER_PULL`, `CONFLICT_LOWER_PULL` hoặc
  neutral. Kết quả chỉ thêm cảnh báo/rủi ro short-squeeze hoặc quét LONG; rule xác nhận chính vẫn nến 15m đóng, 5m retest, không dùng CoinGlass
  một mình để phát lệnh.
- Thống kê/WHITELIST: khối CoinGlass trên trang là panel phân tích, không phải signal/stat card; không tạo label, tier, paper, W/L, WR, PF, AvgROE,
  Net PnL hoặc checkbox. Matcher và policy WHITELIST mặc định OFF/chỉ hiện khi CLOSED AvgROE `>4%` không đổi.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. Toàn bộ luồng vẫn **OBSERVE ONLY**; không dùng credential, không gọi order/protection, không đổi
  entry, side, margin, size, leverage, SL, TP, không mở/đóng/DCA và không sửa position/order đang có.
- Tương thích JSON cũ: top-level `coinglass` và `recommendation.coinglassConfluence` là optional additive; client cũ bỏ qua được. Không thay schema
  hoặc file snapshot/lifecycle nguồn, không migrate/rewrite/backfill/replay signal, paper, trade, order và outcome cũ.

## 2026-09-01 - Coin Level Analysis V4 cào CoinGlass theo nút Phân tích

- Versions: `COIN_LEVEL_ANALYSIS_V4_COINGLASS_ON_DEMAND`, `COIN_LEVEL_COINGLASS_V2_ON_DEMAND_12H24H_20260901` và collector cache
  `COIN_LEVEL_COINGLASS_ON_DEMAND_V1_20260901`. Chỉ submit form/nút **Phân tích** mới gọi POST
  `/api/coin-level-analysis/coinglass-refresh`; lần load URL đầu tiên và auto-refresh 20 giây chỉ đọc Binance/cache, tuyệt đối không khởi động browser.
- Dữ liệu dùng trước phân tích: job dùng đúng profile CoinGlass primary đã đăng nhập và chỉ mở symbol Binance USDT perpetual người dùng nhập, lần lượt
  lấy Model 3 `48h`, `12h`, `24h`. Job được dedupe theo symbol, cache đủ ba khung trong 10 phút, xếp hàng sau collector Top 40 nếu profile đang bận;
  scheduler Top 40 bị chặn trong thời gian on-demand giữ profile. UI poll read-only mỗi 3 giây tối đa 4 phút. Cache nằm riêng tại
  `data/coinglass-web-top20/on-demand/<SYMBOL>.json`, không ghi đè snapshot rank 1–40/41–80.
- Phân loại/thống kê: cách nhận active edge zone (`edgeGap <=2`, cách mark `<=35%`), attraction, lifecycle, `UPPER_FIRST/LOWER_FIRST/BALANCED`
  và đối chiếu Binance 15m-close/5m-retest giữ nguyên V3. Đây không phải detector/signal/tier/card; không tạo paper, W/L, WR, PF, AvgROE, Net PnL
  hoặc checkbox WHITELIST. Policy checkbox hiện hữu mặc định OFF/chỉ hiện khi CLOSED AvgROE `>4%` không đổi.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. Job và endpoint khai báo **OBSERVE ONLY**, không gửi Discord, không gọi executor, không mở/đóng/DCA,
  không đặt hoặc sửa entry, margin, size, leverage, SL, TP và không tác động position/order đang mở.
- Tương thích JSON cũ: `coinglass.refresh` và on-demand cache là optional additive; reader ưu tiên row on-demand đủ ba khung còn mới nhưng vẫn fallback snapshot
  primary/secondary. Không migrate/rewrite/backfill/replay signal, paper, trade, order, lifecycle hoặc outcome cũ.

## 2026-09-01 - Coin Level Analysis V5 đưa lifecycle vào lực hút CoinGlass

- Versions: `COIN_LEVEL_ANALYSIS_V5_LIFECYCLE_WEIGHTED` và `COIN_LEVEL_COINGLASS_V3_REJECTED_REVERSE_PRESSURE_20260901`. Dữ liệu dùng trước
  đánh giá giữ nguyên V4: public Binance, active Model 3 edge zone 48h/12h/24h còn sát mép phải và lifecycle đúng symbol/side; không tải thêm dữ liệu
  và không thay quy trình on-demand/cache.
- Phân loại: attraction raw theo strength/persistence/distance vẫn được giữ để audit, nhưng điểm hiệu dụng nhân lifecycle: `FRESH=1`,
  `APPROACHING=1`, `ACCEPTED=0,7`, `SWEPT=0,25`, `REJECTED=0`, `UNTRACKED=1`. `REJECTED` chuyển `70%` attraction raw thành pressure về phía
  đối diện. Nếu ít nhất 50% raw score một phía là REJECTED và phía đối diện còn FRESH/APPROACHING/UNTRACKED target, gắn
  `UPPER_REJECTED_TO_LOWER` hoặc `LOWER_REJECTED_TO_UPPER`, cấm headline tiếp tục gọi vùng rejected là lực hút cùng phía. Nearest target hiệu dụng
  loại REJECTED; raw nearest vẫn trả riêng để audit. Xác nhận hành động vẫn bắt buộc close 15m và retest 5m.
- Thống kê/WHITELIST: đây chỉ là diễn giải panel, không tạo label/tier/signal/paper/card, không W/L, WR, PF, AvgROE, Net PnL và không thêm checkbox.
  Policy WHITELIST hiện hữu mặc định OFF/chỉ hiện khi CLOSED AvgROE `>4%` không đổi.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. Trang vẫn **OBSERVE ONLY**, không gửi Discord, không gọi order/protection, không mở/đóng/DCA và
  không thay entry, margin, size, leverage, SL, TP hoặc lệnh đang mở.
- Tương thích JSON cũ: giữ `attractionScore`, `upperScore/lowerScore`, thêm optional `lifecycleMultiplier`, `effectiveAttractionScore`,
  `rejectionPressureScore`, breakdown frame, `lifecycleSignal`, `rawNearestAbove/rawNearestBelow`. Client cũ bỏ qua được; không migrate/rewrite/
  backfill/replay snapshot, signal, paper, trade, order, lifecycle hoặc outcome cũ.

## 2026-09-01 - Discord Coin Level REJECTED + APPROACHING

- Version: `COIN_LEVEL_LIFECYCLE_DISCORD_V1_REJECT_APPROACH_20260901`; webhook riêng qua
  `COIN_LEVEL_LIFECYCLE_DISCORD_WEBHOOK_URL`. Dữ liệu dùng trước thông báo là output causal của Coin Level V5: public Binance mark/bias/xác nhận
  15m và active CoinGlass frame 48h/12h/24h đã gắn lifecycle; data CoinGlass stale không được gửi.
- Điều kiện phân loại: trong cùng một timeframe, `ABOVE REJECTED + BELOW APPROACHING` tạo event đánh giá
  `UPPER_REJECTED_LOWER_APPROACHING`/`SHORT WATCH`; chiều đối xứng tạo `LOWER_REJECTED_UPPER_APPROACHING`/`LONG WATCH`. FRESH, SWEPT,
  ACCEPTED hoặc UNTRACKED không thay thế điều kiện APPROACHING. Embed có mark, Binance/CoinGlass bias, band reject/approach, khung khớp, trạng thái
  xác nhận 15m và link CoinGlass/Binance. Dedupe 4 giờ theo symbol + event + cặp band; webhook 429 retry một lần.
- Thống kê/WHITELIST: event chỉ là cảnh báo Discord, **không phải signal/tier/card giao dịch**, không ghi paper và không tham gia W/L, WR, PF,
  AvgROE, Net PnL hoặc matcher runtime; vì vậy không tạo checkbox. Policy WHITELIST hiện hữu mặc định OFF/chỉ hiện khi CLOSED AvgROE `>4%` không đổi.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. Message ghi rõ **OBSERVE ONLY**, không gọi executor, không mở/đóng/DCA và không đặt/sửa entry,
  margin, size, leverage, SL, TP hoặc position/order đang mở.
- Tương thích JSON cũ: state mới độc lập `data/coin-level-lifecycle-discord.json` chứa dedupe/recent và hoàn toàn optional; không thay snapshot/API,
  không migrate/rewrite/backfill/replay signal, paper, trade, order, lifecycle hoặc outcome cũ.

## 2026-09-01 - Coin Level Analysis V6 chống timeout và giữ snapshot gần nhất

- Version: `COIN_LEVEL_ANALYSIS_V6_RESILIENT_SNAPSHOT_20260901`, freshness schema
  `COIN_LEVEL_DATA_FRESHNESS_V1_20260901` và disk cache `COIN_LEVEL_ANALYSIS_CACHE_V1_20260901`. Dữ liệu trước đánh giá không đổi: public Binance
  mark/ticker/funding/OI/depth và nến đóng 5m/15m/1h/4h, sau đó mới ghép active CoinGlass 48h/12h/24h/lifecycle. Các request Binance được
  `allSettled`; thiếu OI/depth hoặc một nguồn market phụ chỉ thành `LIVE_PARTIAL`, còn thiếu cả mark source hoặc một khung nến bắt buộc mới fail.
- Phân loại tín hiệu/vùng/EMA/attraction/lifecycle và thống kê không đổi. Cache live tăng từ 12 lên 30 giây; poll job CoinGlass mỗi 3 giây chỉ đọc
  cache/snapshot CoinGlass và ghép lại base Binance, không tải lại tám endpoint Binance. Kết quả live tốt được lưu riêng theo symbol tại
  `data/coin-level-analysis-cache`; khi Binance timeout/abort, API trả last-good với `freshness.binance=STALE_LAST_GOOD`, giữ `generatedAt` gốc và
  cảnh báo rõ thay vì trả 502/trắng trang. Snapshot Binance quá 90 giây trong poll CoinGlass cũng bị đánh stale.
- Discord REJECTED+APPROACHING fail-closed khi Binance đang `STALE_LAST_GOOD`; không gửi cảnh báo mới từ giá/nến cũ. Trang và panel vẫn
  **OBSERVE ONLY**, không tạo label/tier/card/paper, W/L, WR, PF, AvgROE, Net PnL hoặc checkbox WHITELIST.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. Không gọi credential/executor/order/protection, không mở/đóng/DCA và không sửa entry, margin, size,
  leverage, SL, TP hay lệnh/vị thế đang mở.
- Tương thích JSON cũ: top-level `freshness` và file last-good là optional additive; client cũ bỏ qua được. Cache cũ không có `baseAnalysis` vẫn có
  thể dùng làm fallback hiển thị nhưng không dựng lại CoinGlass; không migrate/rewrite/backfill/replay snapshot nguồn, signal, paper, trade, order,
  lifecycle hoặc outcome lịch sử.

## 2026-09-01 - Coin Level second rejection SHORT alert

- Versions: `COIN_LEVEL_ANALYSIS_V7_SECOND_REJECTION_SHORT_20260901`, detector
  `COIN_LEVEL_SECOND_REJECTION_SHORT_V1_15M_COINGLASS_20260901` và Discord
  `COIN_LEVEL_LIFECYCLE_DISCORD_V2_SECOND_REJECTION_SHORT_20260901`. Dữ liệu dùng trước cảnh báo gồm hai cụm rejection lấy duy nhất từ nến Binance
  15m đã đóng trong 24 bars gần nhất, EMA13/ATR15m, quote volume/taker-buy của nến reject lần hai, cùng active CoinGlass edge zones 48h/12h/24h đã
  qua lifecycle weighting. Nến đang chạy, CoinGlass stale và Binance `STALE_LAST_GOOD` không được phát cảnh báo.
- Phân loại: hai đỉnh cách nhau ít nhất 3 bars, high gần nhau trong tolerance động `0,6–1,8%` theo ATR, giữa hai đỉnh phải pullback tối thiểu
  `0,6 ATR`. Cả hai nến có râu trên/range rejection; nến reject lần hai hoặc tối đa hai nến 15m đóng kế tiếp phải đóng đỏ dưới close trước và EMA13,
  taker-buy `<=50,5%` nếu có, volume ratio `>=0,8x` nếu có. Chỉ thành `SHORT READY` khi CoinGlass là `ALIGNED_SHORT + LOWER_FIRST`, còn active target dưới cách ít nhất `1%`, risk đến
  invalidation không quá `10%` và R:R `>=0,65`; thiếu một điều kiện chỉ là WATCH trên trang và không gửi Discord.
- Discord dùng webhook Coin Level hiện có, dedupe theo symbol + open time nến reject lần hai + target trong 4 giờ. Message có entry tại mark lúc đánh
  giá, TP1/TP2 theo band trên của cụm thanh lý dưới, invalidation trên đỉnh đôi cộng `0,25 ATR15m`, râu/taker của reject lần hai và link ngoài.
- Thống kê/WHITELIST: đây là event đánh giá **OBSERVE ONLY**, không phải label/card runtime, không ghi paper hoặc cohort W/L, WR, PF, AvgROE, Net PnL;
  do đó không tạo checkbox WHITELIST. Policy checkbox hiện hữu mặc định OFF/chỉ hiện khi CLOSED AvgROE `>4%` không đổi.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. Không gọi executor/credential, không tự mở SHORT, không đặt/sửa entry, margin, size, leverage, SL, TP,
  position hoặc order; các mức trong message chỉ là tham khảo cho quyết định thủ công.
- Tương thích JSON cũ: `recommendation.secondRejectionShort` và `coinglass.combined.secondRejectionShort` là field optional additive; state Discord V1
  vẫn đọc được và được nâng version khi ghi lần sau. Không migrate/rewrite/backfill/replay snapshot, signal, paper, trade, order hoặc outcome cũ.

## 2026-09-01 - Coin Level second rejection hai chiều LONG/SHORT

- Versions: `COIN_LEVEL_ANALYSIS_V8_TWO_SIDED_SECOND_REJECTION_20260901`, detector
  `COIN_LEVEL_SECOND_REJECTION_V2_TWO_SIDED_15M_COINGLASS_20260901` và Discord
  `COIN_LEVEL_LIFECYCLE_DISCORD_V3_TWO_SIDED_SECOND_REJECTION_20260901`. Dữ liệu dùng trước cảnh báo LONG là nến Binance 15m đã đóng trong cửa sổ
  24 bars, EMA13/ATR15m, quote volume/taker-buy và active CoinGlass edge zones 48h/12h/24h đã qua lifecycle weighting; không dùng nến đang chạy,
  outcome tương lai, CoinGlass stale hoặc Binance `STALE_LAST_GOOD`.
- Phân loại LONG đối xứng: hai đáy cách nhau `3–24` bars, low gần nhau trong tolerance động `0,6–1,8%`, giữa hai đáy phải bật ít nhất `0,6 ATR`;
  cả hai có râu dưới/range rejection. Nến reject lần hai hoặc tối đa hai nến 15m đóng tiếp theo phải xanh, đóng trên close trước và EMA13,
  taker-buy `>=49,5%` nếu có, volume ratio `>=0,8x` nếu có. Chỉ thành `LONG READY` khi CoinGlass `ALIGNED_LONG + UPPER_FIRST`, còn active target
  trên cách ít nhất `1%`, risk tới invalidation không quá `10%` và R:R `>=0,65`; thiếu điều kiện chỉ hiện WATCH và không gửi Discord.
- Discord dùng webhook Coin Level hiện có, màu xanh và dedupe 4 giờ theo symbol + open time reject đáy lần hai + target trên. Message có entry tại
  mark, TP1/TP2 theo band dưới của cụm phía trên, invalidation dưới hai đáy `0,25 ATR15m`, râu dưới/taker-buy và link CoinGlass/Binance.
- Thống kê/WHITELIST: đây là event đánh giá **OBSERVE ONLY**, không phải label/card runtime, không ghi paper hay cohort W/L, WR, PF, AvgROE, Net PnL;
  do đó không tạo checkbox. Policy WHITELIST hiện hữu mặc định OFF/chỉ hiện khi CLOSED AvgROE `>4%` không đổi.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. Không gọi executor/credential, không tự mở LONG/SHORT, không đặt/sửa entry, margin, size, leverage,
  SL, TP, position hay order; các mức hiển thị/Discord chỉ để tham khảo thủ công.
- Tương thích JSON cũ: thêm optional `recommendation.secondRejectionLong` và `coinglass.combined.secondRejectionLong`; field SHORT cũ giữ nguyên.
  State Discord V1/V2 vẫn đọc được và chỉ nâng version khi ghi; không migrate/rewrite/backfill/replay snapshot, signal, paper, trade, order hoặc outcome.

## 2026-09-05 - Tắt rule tự chốt vị thế Binance sau 12 giờ

- Version: `BINANCE_TP_AFTER_12H_DISABLED_V2_20260905`. Runtime chỉ cho phép rule cũ khi `BINANCE_TP_AFTER_12H_ENABLED=true`; cấu hình đang chạy
  và mặc định mẫu đều là `false`, nên thiếu biến môi trường cũng fail-closed và không tự bật lại sau restart.
- Dữ liệu/điều kiện cũ gồm tuổi vị thế Binance, average entry, side, leverage và Mark/ROE không còn được dùng để tự thay TP hoặc gửi reduce-only
  marketable LIMIT sau 12 giờ. Không có nhãn/tier/gate tín hiệu mới và không thay đổi cách tính W/L, WR, PF, AvgROE hay Net PnL.
- Ảnh hưởng Binance: từ lần reload này, vị thế đang mở quá 12 giờ không bị rule này hủy TP hiện hữu, đặt TP `+1% ROE` hoặc đóng ngay khi đã lời.
  Không sửa hồi tố vị thế/order hiện tại và không thể khôi phục MARSCOIN đã đóng. Rule TP về entry khi vị thế âm đủ 8 giờ, deep-loss/profit-lock,
  cùng cleaner hủy entry LIMIT độc lập quá 12 giờ vẫn giữ nguyên.
- Tương thích JSON cũ: các field `twelveHourTakeProfit*` và audit version cũ vẫn đọc được; không migrate/rewrite/backfill history. Khi rule tắt không ghi
  thêm record TP 12 giờ. Không thêm card/checkbox WHITELIST vì đây là policy quản lý vị thế, không phải nhãn thống kê.

## 2026-09-05 - Audit FILLED/CLOSED chung cho mọi luồng Binance thật

- Version: `BINANCE_SIGNAL_LIFECYCLE_AUDIT_V2_ALL_REAL_FILLS_AND_CLOSE_PNL_20260905`. Trước khi gửi entry, executor ghi context causal đã có tại
  thời điểm quyết định gồm source/stream/page, signal type/label/reason/combo, matcher, side, entry/TP/SL, trạng thái suppress SL, margin và leverage;
  không dùng outcome tương lai để sửa nhãn entry. Entry chỉ được ghi/gửi khi user-data/recovery xác nhận order `FILLED`, đang mở/tăng đúng chiều vị
  thế và không phải `reduceOnly`/`closePosition`/TP/SL.
- Phân loại/audit: mọi executor Binance thật đi qua common `placeOrder` được gắn metadata đầy đủ; các đường trực tiếp Pump manual/test, Paper manual/
  AutoProbe, Pump Auto legacy và AutoLiq cũng đăng ký context theo order/clientOrderId. Client-order prefix chỉ là fallback khi mất metadata. DCA được
  đánh dấu `is_dca`; lệnh đóng không bị phát nhầm sang webhook entry. Khi Position Risk xác nhận position về 0, hoặc position đảo chiều đã đóng side
  cũ, audit ghép các entry chưa đóng theo symbol+direction, giữ nguyên tên loại tín hiệu gốc và lấy Binance user trades sau entry để tính kết quả.
- Thống kê: `data/binance-filled-signal-audit/binance-filled-signals.csv` được tạo sẵn với header. Khi đóng vị thế, chính các dòng entry liên quan được
  chuyển `OPEN → CLOSED` và bổ sung close order/type/reason, exit average, gross realized PnL, commission, funding, net realized PnL, realized ROE và
  `WIN/LOSS/BREAKEVEN`. Nếu có nhiều fill/DCA, PnL/fee/qty được phân bổ theo filled notional để tổng CSV không đếm trùng; Discord đóng hiển thị một
  lifecycle và liệt kê các nhãn nguồn; `close_group_id` cho phép thống kê W/L theo position thay vì đếm mỗi DCA fill. CSV có thể tải local tại
  `/api/binance-filled-signal-audit.csv`. State dedupe giữ tối đa 10.000 fills;
  Discord entry/close retry một lần khi HTTP 429.
- Ảnh hưởng Binance/entry/size/SL/TP: không thay đổi điều kiện pass, signal/tier/gate, hướng, order type, entry, margin, size, leverage, SL, TP, DCA,
  close hoặc lệnh/vị thế đang mở. Đây là telemetry sau xác nhận Binance; chỉ thêm ghi CSV và hai Discord webhook riêng. Không thêm label/card hoặc
  checkbox WHITELIST; policy mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%` của các card hiện hữu không đổi.
- Tương thích JSON cũ: state mới `data/binance-filled-signal-audit/state.json` là optional và độc lập. Record V1 thiếu field close vẫn đọc được;
  header CSV cũ được dựng lại từ state sang schema V2, field close thiếu mặc định rỗng/OPEN. Không migrate/rewrite/backfill paper trade, signal,
  protection, order hoặc outcome lịch sử; fill đã xảy ra trước khi audit tồn tại không được tự gán sai loại.

## 2026-09-02 - Coin Level hỗ trợ mã hợp đồng Binance Unicode

- Versions: `COIN_LEVEL_ANALYSIS_V9_UNICODE_SYMBOL_INPUT_20260902` và
  `COIN_LEVEL_COINGLASS_ON_DEMAND_V2_UNICODE_SYMBOL_20260902`. Dữ liệu trước phân tích không đổi: hợp đồng USDT perpetual `TRADING` lấy từ
  Binance exchange info, public mark/ticker/OI/depth và nến 5m/15m/1h/4h; CoinGlass 48h/12h/24h chỉ cào khi người dùng bấm **Phân tích**.
- Phân loại input: normalize Unicode `NFKC`, bỏ tiền tố `#/$`, dấu phân cách và khoảng trắng, giữ chữ/số Unicode rồi thêm/kiểm tra hậu tố `USDT`;
  sau đó vẫn bắt buộc exact-match một contract Binance đang giao dịch. Vì vậy các mã `龙虾USDT`, `币安人生USDT`, `我踏马来了USDT`, `牛来USDT`
  được tìm theo yêu cầu, còn path/punctuation hoặc symbol không tồn tại vẫn bị chặn. Universe scheduler CoinGlass top 1–80 cố ý giữ matcher ASCII cũ,
  nên thay đổi này không đưa coin Unicode vào luồng auto scan/entry.
- Thống kê/WHITELIST: không thêm signal, label, tier, card, paper hoặc cohort W/L, WR, PF, AvgROE, Net PnL; không tạo checkbox mới. Kết quả tìm kiếm
  theo coin vẫn **OBSERVE ONLY** và không tham gia matcher runtime.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. Không gọi executor/credential, không mở/đóng/DCA, không đổi margin, size, leverage, SL, TP hoặc
  order/position; chỉ mở rộng validation và cache filename an toàn cho luồng phân tích theo yêu cầu.
- Tương thích JSON cũ: schema phân tích giữ nguyên, chỉ đổi version output/on-demand; cache ASCII cũ vẫn đọc được. Cache Unicode dùng filename Unicode
  đã qua whitelist chữ/số, không migrate/rewrite/backfill/replay snapshot, signal, paper, trade, order hay outcome cũ.
### Deep-loss `ROE <= -20%` ưu tiên TP entry hơn FastWaveRecovery (2026-09-05)

- Versions `BINANCE_NEGATIVE_TP_TO_ENTRY_V6_ROE20_OVERRIDES_FAST_WAVE_20260905` và `BINANCE_TP_ONLY_GUARD_V3_BREAK_EVEN_LIMIT_AWARE_20260905`. Dữ liệu dùng trước quyết định chỉ gồm vị thế Binance đang mở: symbol, side/amount, average entry, leverage, Mark hoặc unrealized PnL và margin để tính ROE realtime; nến 5m/15m chỉ còn phục vụ FastWaveRecovery ngoài nhánh deep-loss, không dùng outcome tương lai.
- Điều kiện phân loại: khi ROE `<= NEG_TP_ROE` (mặc định `-20%`), deep-loss thắng tuyệt đối. Trạng thái FastWaveRecovery `ARMED/LOCKED`, nến `CANDLE_DATA_PENDING`, râu hoặc body reversal đều không được trì hoãn TP entry. Trên `-20%`, FastWaveRecovery và rule tuổi 8 giờ vẫn giữ điều kiện hiện hành.
- Thống kê/WHITELIST: đây là protection sau entry, không thêm/đổi signal, label, tier, card, snapshot hay cohort; W/L, WR, PF, AvgROE và Net PnL không đổi. Không thêm checkbox vì không có nhãn thống kê mới; policy whitelist hiện hành vẫn mặc định tắt và chỉ hiện khi CLOSED AvgROE `>4%`.
- Ảnh hưởng Binance: không đổi entry, side, margin, size, leverage hay SL. Với mọi vị thế hiện tại và tương lai chạm `<=-20% ROE`, bot hủy close-side TP xa entry nếu cần rồi đặt full remaining quantity close LIMIT GTC tại average entry; không MARKET-close khi đang âm. TP-only startup guard nhận diện full-size reduce-only LIMIT gần entry là protection hợp lệ và không dựng thêm TP signal; scanner deep-loss dọn TP xa còn sót ngay cả khi LIMIT entry đã tồn tại. Rule có hiệu lực sau reload và có thể sửa TP hiện hữu, gồm lifecycle FastWaveRecovery cũ.
- Tương thích JSON cũ: giữ nguyên schema/tracking. Các field `fastWaveRecovery*` V1 và state `ARMED/LOCKED` cũ vẫn đọc được nhưng bị bỏ qua trong nhánh deep-loss; không migrate/rewrite/backfill signal, paper, trade hoặc outcome cũ. Open order Binance và symbol+entry dedupe tiếp tục làm nguồn idempotency sau restart.
## 2026-09-05 - Coin Level hiển thị nổi bật LiqScan gần nhất

- Version: `LIQ_SCAN_SNAPSHOT_V1_COIN_LEVEL_HIGHLIGHT_20260905`, store `LIQ_SCAN_LATEST_ALERTS_STORE_V1_20260905`. Dữ liệu dùng trước mọi đánh giá là public Binance mark, biến động 24h và tối đa 500 nến 15m đã có trong KlineCache; `computeHeatmapData` tạo liquidity above/below, bias, sweep target, main/far kill zone. CoinGlass Model 3 vẫn là panel riêng, không bị trộn thành dữ liệu LiqScan.
- Phân loại: dùng đúng runtime Discord LiqScan: cảnh báo khi `abs(bias) >= LIQ_SCAN_BIAS_THRESHOLD` (mặc định `0,4`) hoặc một phía dưới `12%` tổng thanh khoản; xác suất = `60%` độ lớn bias + `40%` độ áp đảo của phía trội, cap `99%`. Trang `/coin-level-analysis` hiển thị nổi bật thời gian, above/below, bias, xác suất, mark, phía trội, sweep target và main/far kill zone; đồng thời hiển thị đánh giá hiện tại để biết cảnh báo cũ còn đủ ngưỡng hay không. Latest alert giữ 24 giờ, quá 2 giờ gắn `CẢNH BÁO CŨ` và không được mô tả như realtime.
- Thống kê/WHITELIST: đây là telemetry/panel thông tin, không tạo signal label/tier, paper trade, cohort, W/L, WR, PF, AvgROE hoặc Net PnL. Không thêm checkbox WHITELIST vì không có card thống kê hay matcher giao dịch mới; policy whitelist hiện hữu vẫn mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%`.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. Snapshot và card đều `OBSERVE ONLY`, không gọi executor, không mở/đóng/DCA, không đổi side, entry, margin, size, leverage, SL hoặc TP. Signed REST bị chặn cũng không ngăn public LiqScan/card cập nhật.
- Tương thích JSON cũ: API chỉ thêm object optional `liqScan.current`/`liqScan.lastAlert`; frontend có fallback `CHƯA CÓ DỮ LIỆU`. Store mới tại `data/liq-scan-latest-alerts.json` không migrate/rewrite/backfill signal, snapshot CoinGlass, paper, order, position hoặc outcome cũ.

## 2026-09-12 - Deep dump 1h/4h, tạo đáy và xác nhận LONG bằng nến 15m

- Versions: detector `HTF_DEEP_DUMP_BASE_RECLAIM_V1_20260912`, Discord
  `HTF_DEEP_DUMP_BASE_15M_DISCORD_V1_20260912`, Liquid Flow schema
  `LIQUID_HEATMAP_FLOW_V2_HTF_DEEP_DUMP_BASE_V27_20260912`. Dữ liệu causal chỉ gồm nến
  Binance 1h/4h và 15m đã đóng trước thời điểm phát; nến đang chạy, chuỗi có gap, snapshot
  stale và outcome tương lai đều bị loại.
- Cú sập hợp lệ phải giảm ít nhất `max(5%, 2,5 x ATR14%)`, phá đáy 24 nến trước tối
  thiểu `3%`, đồng thời đạt ít nhất 2/3 xác nhận: true range `>=3 ATR14`, quote volume
  `>=3x` median 48 nến trước, hoặc râu dưới chiếm `>=40%` range. Tier `EXTREME` cần ít
  nhất hai điều kiện mạnh: shock `>=12%`, range `>=8 ATR`, volume `>=10x`, phá đáy
  `>=10%`.
- Nền 1h dùng `4–48` nến và biên nền tối đa `45%` nhịp sập; nền 4h dùng `2–12` nến
  và tối đa `80%`; volume median của nền không quá `70%` volume spike. `EARLY_WATCH`
  xuất hiện khi nến 15m đóng trên neckline và EMA13 với volume `>=1,5x` median 20 nến.
  `RETEST_LONG_READY` chỉ xuất hiện ở một nến 15m đóng xanh sau đó, tối đa 8 nến,
  chạm rồi giữ vùng neckline/EMA13 và không tạo đáy mới.
- Discord dùng riêng biến `HTF_DEEP_DUMP_BASE_15M_DISCORD_WEBHOOK_URL`: WATCH màu vàng,
  READY màu xanh. Chỉ event còn mới tối đa `16,5` phút được phát; dedupe bền qua restart
  theo symbol + bucket cú sập 4h + stage, nên cùng episode được phép gửi một WATCH và
  một READY nhưng không gửi lặp mỗi vòng scan. Không replay/backfill cảnh báo cũ.
- Thống kê/WHITELIST: đây là event Discord độc lập **OBSERVE ONLY**, không tạo label/card
  runtime, paper trade hoặc cohort W/L, WR, PF, AvgROE, Net PnL; do đó không tạo checkbox
  mới. Policy checkbox hiện hữu vẫn mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%`.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. Detector không gọi credential/executor,
  không mở LONG, không DCA/đóng lệnh và không đặt/sửa entry, margin, size, leverage, SL,
  TP, position hay order. Chữ READY chỉ là xác nhận cấu trúc để theo dõi thủ công.
- Tương thích JSON cũ: chỉ thêm object optional `features.htfDeepDumpBaseReclaim`; client
  cũ bỏ qua được. State Discord mới tại `data/htf-deep-dump-base-15m-discord.json` độc
  lập và ignored; không migrate/rewrite snapshot, signal, paper, trade, order hay outcome cũ.

### 2026-09-12 - Mở rộng Deep Dump Base từ nhóm Liquid Flow sang 400 coin

- Version `HTF_DEEP_DUMP_BASE_UNIVERSE_V1_400_SYMBOLS_20260912`. Universe lấy tối đa
  400 USDT perpetual đang giao dịch từ shared Binance snapshot, ưu tiên quote volume và
  loại symbol trùng. Đây là scanner riêng; không bắt 400 coin phải chạy OI/heatmap hoặc
  các classifier Liquid Flow khác.
- Dữ liệu causal và phân loại `EARLY_WATCH`/`RETEST_LONG_READY` giữ nguyên detector V1.
  Scanner chỉ xử lý coin đủ cache fresh: tối thiểu 30 nến 15m, 100 nến 1h, 65 nến 4h;
  cache thiếu được bổ sung dần theo batch thấp, dừng khi REST congestion/rate gate chặn,
  đồng thời subscribe WebSocket cho cả ba khung. API trạng thái
  `/api/htf-deep-dump-base-universe` công khai requested/processed/coverage, không lộ webhook.
- Thống kê/WHITELIST và Binance không đổi: luồng vẫn **OBSERVE ONLY**, không card/paper/
  W/L/WR/PF/AvgROE/Net PnL, không checkbox mới, không entry/size/leverage/SL/TP/order.
  Policy whitelist hiện hữu mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%`.
- JSON cũ tương thích: endpoint trạng thái và module universe là additive; field feature
  cũ giữ nguyên. Không migrate/rewrite/backfill/replay signal, paper, trade, position,
  order hoặc outcome cũ; Discord tiếp tục dùng state/dedupe V1 hiện có.

## 2026-09-12 - Discord khi kịch bản 4h/8h/12h chuyển sang quét lên hoặc quét xuống

- Version `COIN_HORIZON_SWEEP_TRANSITION_DISCORD_V1_20260912`. Dữ liệu causal dùng đúng
  snapshot Coin Level trước thời điểm cảnh báo: mark, ATR14/nến 1h và 4h đã đóng, vùng
  hỗ trợ/kháng cự 1h/4h, cùng CoinGlass 24h/12h/48h còn mới tối đa 20 phút. Snapshot
  Binance stale, CoinGlass xung đột hoặc nến 1h/4h không đồng hướng không phát.
- Phân loại state: cả 1h và 4h `UP` và không bị CoinGlass phản hướng thành `UPPER/QUÉT
  LÊN`; cả hai `DOWN` thành `LOWER/QUÉT XUỐNG`; `MIXED`, `CONFLICT` và dữ liệu chưa đủ
  ghi `NEUTRAL/CHƯA ĐỒNG THUẬN`. Lần quan sát đầu chỉ lưu baseline. Discord chỉ gửi khi
  state đã lưu đổi từ một state khác sang UPPER hoặc LOWER; NEUTRAL không gửi nhưng được
  ghi để lần chuyển tiếp theo được nhận diện. Queue nối tiếp và state atomic chống gửi
  trùng khi poll đồng thời hoặc restart; lỗi/429 không ghi nhận transition để còn retry.
- Message màu xanh cho QUÉT LÊN, đỏ cho QUÉT XUỐNG; gồm trạng thái trước/sau, giá mốc,
  cận trên/dưới, vùng quét, hỗ trợ/kháng cự và mức đồng thuận của từng horizon 4h/8h/12h.
  Webhook riêng dùng `COIN_HORIZON_SWEEP_TRANSITION_DISCORD_WEBHOOK_URL`, không fallback
  sang kênh khác và chỉ chạy cho coin đang được Coin Level Analysis cập nhật.
- Thống kê/WHITELIST: đây là telemetry **OBSERVE ONLY**, không thêm label/card runtime,
  paper trade, W/L, WR, PF, AvgROE, Net PnL hoặc checkbox. Policy whitelist hiện hữu vẫn
  mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%`.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. Không gọi credential/executor, không mở/
  đóng/DCA và không đặt/sửa entry, margin, size, leverage, SL, TP, position hoặc order.
- Tương thích JSON cũ: state mới `data/coin-horizon-sweep-transition-discord.json` độc
  lập; API Coin Level/horizon cũ giữ schema. Không migrate/rewrite/backfill/replay
  snapshot, signal, paper, trade, order hoặc outcome cũ.
## 2026-09-12 - TP EMA99 theo route và PnL Binance thật trong ngày trên Auto Controls

- Versions: `AUTO_ENTRY_CONTROLS_V5_TP_AND_DAILY_REAL_PNL_20260912`,
  `EMA99_ROUTE_TP_ROE_CONTROLS_V5_20260912`, `EMA99_ROUTE_FILL_TP_ROE_V2_20260912`,
  `EMA99_ROUTE_TP_LONGSL20_SHORTSL30_V2_20260912` và
  `AUTO_ENTRY_DAILY_REALIZED_STATS_V1_20260912`. Dữ liệu trước entry không đổi: event
  EMA99 causal đã đóng, enabledAt/tuổi tối đa 90 giây, mark drift, TP/SL hợp lệ, trạng
  thái position/order và cấu hình exact source/stream/label/side/khung 5m hoặc 15m.
- Mỗi route EMA99 executable có `takeProfitRoePct` riêng, mặc định `15`, cho phép lưu
  `1–100%` tối đa hai số lẻ. Runtime đọc lại TP cùng margin/leverage trước submit; TP
  đổi giữa lúc chuẩn bị lệnh làm request cũ fail closed và vòng scan sau mới dùng cấu
  hình mới. TP giá = full-fill average nhân/chia khoảng cách `TP_ROE / leverage`, nên
  vẫn neo từ giá khớp thực tế. SL không đổi: LONG `-20% ROE`, SHORT `-30% ROE`.
- Trang `/binance-auto-controls` thêm cột TP theo đúng route và thống kê ngày
  `Asia/Bangkok`. `Tín hiệu đã vào` chỉ đếm entry order `FILLED` thật khớp route và loại
  DCA; `entry còn mở` là entry hôm nay chưa CLOSED. `PnL thực tế đã chốt` cộng
  `netRealizedPnlUsdt` đã phân bổ từ audit cho các position đóng trong ngày, gồm
  commission/funding đã ghi nhận, không gồm unrealized PnL; số position đóng dedupe
  bằng `closeGroupId`. Vì PnL theo ngày đóng, số đóng có thể lớn hơn số entry hôm nay.
- Phân loại tín hiệu, label/tier/gate, Discord, whitelist, W/L/PF/AvgROE card hiện hữu
  không đổi; không thêm nhãn/card mới và không tạo checkbox WHITELIST. Route ngoài
  EMA99 chỉ hiển thị thống kê và chữ `Theo rule gốc`, chưa cho sửa TP để tránh giả vờ
  override khi executor của luồng đó chưa dùng controls.
- Ảnh hưởng Binance chỉ áp cho lệnh EMA99 mới sau khi lưu: không bật route OFF, không
  đổi entry/side/margin/leverage/SL, không sửa/hủy TP hoặc position đang mở và không
  replay tín hiệu cũ. JSON cũ thiếu `takeProfitRoePct` đọc như `15`; field mới additive,
  invalid thành route fail closed. Audit V2/CSV cũ được đọc tại chỗ, không rewrite,
  migrate hay backfill; record cũ suy khung EMA99 từ `signalCombo`/reason khi có.

## 2026-09-13 - Cảnh báo bơm/xả đồng loạt để né vị thế ngược chiều

- Version `MARKET_BREADTH_SHOCK_5M_V1_20260913`. Dữ liệu causal trước cảnh báo chỉ lấy
  từ shared Binance market snapshot và KlineCache WebSocket 5m của tối đa 400 hợp đồng
  USDT có quote volume 24h tối thiểu 1 triệu USDT. Scanner subscribe live cache-only,
  không seed/call REST riêng. Mỗi coin dùng biến động nến 5m hiện tại; tại biên nến có
  thể giữ nhịp cùng chiều từ nến trước thành cửa sổ 5–10 phút. Quote volume/taker-buy
  chỉ lấy tới thời điểm đánh giá, không dùng outcome hoặc nến tương lai.
- Phân loại chỉ chạy khi socket 5m mới tối đa 45 giây, ít nhất 60 mẫu và coverage tối
  thiểu 20%. Biên breadth là `±0,30%`, biên mạnh `±0,75%`; volume xác nhận khi projected
  5m volume `>=1,5x` trung bình tối đa 20 nến trước. Điểm `0–100` ghép tỷ lệ coin cùng
  chiều, tỷ lệ coin mạnh, dominance hai phía, volume-confirm, taker flow, median move,
  xác nhận BTC/ETH/SOL và gia tốc so với mẫu cũ ít nhất 45 giây.
- `PUMP_WATCH`/`DUMP_WATCH` cần điểm `>=58`, đủ ít nhất 12% mẫu cùng chiều, ít nhất
  `max(6; 3,5% mẫu)` coin mạnh và dominance `>=62%`. `PUMP_DANGER`/`DUMP_DANGER` cần
  điểm `>=78`, strong breadth `>=9%`, dominance `>=70%` và thêm taker cùng chiều
  `>=54%`, volume-confirm `>=6%` hoặc ít nhất 2/3 BTC/ETH/SOL xác nhận. Mặc định cần
  hai mẫu liên tiếp 15 giây; điểm `>=90` được cảnh báo ngay, và WATCH đã ổn định được
  nâng lên DANGER ngay khi đủ điều kiện.
- Discord `MARKET_BREADTH_SHOCK_DISCORD_WEBHOOK_URL` dùng tiêu đề/icon và màu nguy hiểm:
  pump DANGER đỏ sáng, dump DANGER đỏ đậm, WATCH cam/vàng. Message nêu rõ né mở SHORT
  khi pump đồng loạt, né mở LONG khi dump đồng loạt, không đuổi phía đang chạy; kèm
  score, breadth, taker, volume, gia tốc, BTC/ETH/SOL, top mover và coverage. Dedupe
  bền qua restart theo direction + severity trong 30 phút; WATCH vẫn được phép nâng
  DANGER. State ghi atomic tại `data/market-breadth-shock-discord.json`.
- Cùng embed liệt kê tối đa 25 coin mạnh cùng sóng, lấy từ tối đa 30 ứng viên đã sắp
  theo biên độ tuyệt đối đạt ngưỡng `±0,75%`; coin có projected volume `>=1,5x` được
  đánh dấu lửa. Nếu có phân hóa, liệt kê thêm tối đa 10 coin mạnh ngược sóng. Danh sách
  chỉ là telemetry của snapshot hiện tại, không tạo thêm signal/entry label.
- Thống kê/WHITELIST: bốn tên trên là **trạng thái cảnh báo Discord**, không phải signal
  entry, label/card thống kê, paper cohort hoặc matcher runtime. Không tạo W/L, WR, PF,
  AvgROE, Net PnL và không nối checkbox WHITELIST; policy whitelist hiện hành vẫn mặc
  định OFF và chỉ hiện khi CLOSED AvgROE `>4%`.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. Toàn bộ luồng là **OBSERVE ONLY**; không
  gọi credential/executor, không tự chặn/đóng/DCA, không mở LONG/SHORT và không đổi
  entry, margin, size, leverage, SL, TP, order hoặc position. Chữ kill short/long chỉ
  mô tả hình thái giá đồng loạt, chưa khẳng định toàn bộ volume là forced liquidation.
- Tương thích JSON cũ: không sửa schema API/snapshot/paper/trade/order. File state mới
  độc lập và optional; thiếu file/webhook hoặc dữ liệu không đủ thì fail closed, không
  alert. Không migrate/rewrite/backfill/replay JSON hoặc cảnh báo cũ.

## 2026-09-13 - Scan coin tăng bậc thang nhiều giờ giống LSK

- Version `MEGA_PUMP_STAIRCASE_1H_V2_SIGNAL_PRICE_20260913`. Dữ liệu causal trước cảnh báo chỉ gồm
  tối đa 72 nến Binance 1h đã có trong KlineCache, trong đó detector dùng nến vừa đóng
  và 24 nến trước nó. Universe là tối đa 400 USDT perpetual có quote volume 24h ít
  nhất 1 triệu USDT, ưu tiên volume; scanner chỉ subscribe WebSocket 1h, không seed hay
  gọi REST riêng. Nến đang chạy, nến đóng quá 75 phút, chuỗi thiếu giờ và gap open so
  với close trước trên 8% đều fail closed để tránh nhầm listing/đổi đơn vị với pump thật.
- Phân loại: `MEGA_PUMP_EARLY` cần tăng 3h `>=20%` hoặc 6h `>=35%`, tăng 24h `>=25%`,
  volume nến cuối `>=2x` median 24 nến, breakout close `>=2%`, ít nhất 2/3 nến xanh và
  `close > EMA13 > EMA25`. `MEGA_PUMP_ACCELERATING` nâng biên lên 3h `>=50%` hoặc 6h
  `>=80%`, breakout `>=5%`. `PARABOLIC_DANGER` cần 3h `>=100%`, 6h `>=150%` hoặc
  high/open nến cuối `>=80%`, đồng thời volume `>=2,5x` và breakout close/high `>=10%`.
  `PARABOLIC_EXHAUSTION` thêm râu trên `>=35%` range và trả lại `>=30%` nhịp open→high.
  Điểm 0–100 chỉ xếp hạng hình thái từ return, volume, breakout, chuỗi xanh/higher-high
  và EMA; không phải xác suất coin chắc chắn tăng 1.000% hay xác nhận thanh lý thật.
- Discord dùng lại `MARKET_BREADTH_SHOCK_DISCORD_WEBHOOK_URL`: EARLY vàng, ACCELERATING
  cam, DANGER đỏ và EXHAUSTION tím. Field đầu embed là **GIÁ LÚC PHÁT TÍN HIỆU**,
  lấy `markPrice`, sau đó `lastPrice`/`price`, từ cùng Binance market snapshot public được
  scheduler đọc tại `observedAt`; badge và viền embed cùng màu stage. Close nến 1h xác
  nhận vẫn hiển thị riêng kèm % lệch. Nếu snapshot không có giá hợp lệ thì fallback
  về close nến 1h và ghi rõ nguồn, không bịa giá. Message còn kèm return 3h/6h/24h,
  breakout, volume, EMA, độ liên tục và mức rút đỉnh. Cooldown mặc định 6 giờ theo
  symbol + stage, nên
  cùng cấp không spam nhưng episode được phép nâng cấp cảnh báo. State atomic ở
  `data/mega-pump-staircase-discord.json`; mỗi vòng gửi tối đa 10 cảnh báo điểm cao nhất.
- Thống kê/WHITELIST: bốn tên trên chỉ là **trạng thái cảnh báo Discord**, không phải
  signal entry, label/card thống kê, paper cohort hoặc matcher runtime. Không phát sinh
  W/L, WR, PF, AvgROE, Net PnL hay checkbox WHITELIST; policy whitelist hiện hữu vẫn
  mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%`.
- Ảnh hưởng Binance/entry/size/SL/TP: không có. Luồng **OBSERVE ONLY**, không gọi
  credential/executor, không mở/đóng/DCA/chặn lệnh và không sửa side, entry, margin,
  size, leverage, SL, TP, order hay position. Cảnh báo chỉ nhắc né đuổi LONG hoặc bắt
  đỉnh SHORT mù; quyết định entry vẫn cần rule xác nhận riêng.
- Tương thích JSON cũ: payload event chỉ thêm `signalPrice`, `signalPriceSource` và
  `signalPriceVsClosePct`; consumer cũ có thể bỏ qua, event tạo trực tiếp fallback về close 1h.
  Module/scheduler và file state mới hoàn toàn additive; không đổi
  schema API/snapshot/paper/trade/order, không migrate/rewrite/backfill/replay dữ liệu
  hoặc alert cũ. Thiếu webhook/cache hợp lệ thì im lặng fail closed.

## 2026-09-13 - Chỉnh đòn bẩy theo từng route EMA99 trên Auto Controls

- Versions `AUTO_ENTRY_CONTROLS_V6_EDITABLE_LEVERAGE_20260913`,
  `EMA99_ROUTE_EDITABLE_LEVERAGE_CONTROLS_V6_20260913`,
  `EMA99_EDITABLE_ROUTE_LEVERAGE_V2_20260913` và protection
  `EMA99_ROUTE_TP_LONGSL20_SHORTSL30_EDITABLE_LEVERAGE_V3_20260913`. Dữ liệu dùng trước
  entry không đổi: exact source/stream/label/side/khung 5m hoặc 15m, event EMA99 causal
  đã đóng, enabledAt, tuổi tối đa 90 giây, mark drift, position/order hiện hữu cùng
  margin, leverage và TP đã lưu của chính route.
- Phân loại detector, label, tier và gate kỹ thuật không đổi. Trang
  `/binance-auto-controls` thêm cột leverage cho mỗi route EMA99 executable; nhận số
  nguyên `1–125x`, lưu riêng theo loại + khung. Default JSON cũ giữ 5x, ngoại trừ hai
  default lịch sử `NEAR_EMA_WATCH/SHORT/5m` và
  `CLOSED_ABOVE_EMA_WATCH/SHORT/15m` là 10x. Save leverage không bật route đang OFF,
  không thay enabledAt và dùng optimistic concurrency để chặn edit stale.
- Trước submit và tại main client guard, runtime đọc lại leverage; cấu hình đã đổi làm
  plan cũ fail closed và vòng scan mới phải dựng lại. Notional lệnh mới bằng
  `marginUsdt × leverage`. TP vẫn theo TP ROE từng route; khoảng giá TP là
  `TP_ROE / leverage`. SL vẫn SHORT `−30% ROE` và LONG `−20% ROE`, với khoảng giá tương
  ứng `30%/leverage` hoặc `20%/leverage`; cả TP/SL được neo lại từ average full-fill.
- Thống kê/WHITELIST: không thêm signal/card/cohort hay matcher mới; entry count và PnL
  Binance thực tế theo ngày tiếp tục gắn exact route hiện hữu. Không đổi W/L, WR, PF,
  AvgROE, Net PnL hoặc policy WHITELIST mặc định OFF/chỉ hiện khi CLOSED AvgROE `>4%`.
- Ảnh hưởng Binance chỉ áp cho **entry EMA99 mới sau khi lưu**: có thể đổi notional và
  khoảng giá TP/SL nhưng không đổi các tỷ lệ ROE đã cấu hình. Không sửa/hủy/rebase vị
  thế, entry, TP hoặc SL đang mở; không DCA, không replay tín hiệu cũ. Route ngoài EMA99
  hiển thị leverage cố định/rule gốc và chưa được cấp override giả.
- Tương thích JSON cũ: `leverage` là field additive; route cũ thiếu field được đọc bằng
  default lịch sử, còn null/sai range thì route fail closed. Không migrate/rewrite/
  backfill trade, fill, CSV, position hay outcome cũ; lần lưu controls tiếp theo mới
  persist schema/version mới. Field phản chiếu `ema99SettingsEditable` chỉ cho UI mở
  input ở exact EMA99 catalog, tránh route lịch sử có metadata `executable` cũ giả vờ
  sửa được margin/leverage/TP.

## 2026-09-13 - EMA99 15m Breadth cảnh báo nhiều coin cùng tiến sát EMA

- Version `EMA99_MARKET_BREADTH_15M_V1_20260913`. Dữ liệu causal tại mỗi snapshot gồm
  tối đa 400 Binance USDT perpetual xếp theo quote volume 24h, tối thiểu 1 triệu USDT,
  mark/last price public hiện tại và tối đa 130 nến 15m trong KlineCache. Scanner dùng
  ít nhất 100 nến đã đóng để tính EMA99/ATR14, rồi chiếu EMA99 của nến live bằng giá
  snapshot; không gọi REST riêng, không dùng dữ liệu sau thời điểm phát.
- Mỗi coin chỉ được tính khi cùng phía EMA99 giữa close 15m trước và giá hiện tại,
  khoảng cách đang **thu hẹp ít nhất 0,05 điểm %**, và còn trong vùng gần động
  `clamp(0,75 × ATR14 / EMA99, 0,30%, 1,50%)`. Tách `FROM_BELOW` (từ dưới tiến lên)
  và `FROM_ABOVE` (từ trên lùi xuống). Chuỗi nến thiếu 15m, close stale trên 16,5 phút,
  snapshot giá lỗi hoặc socket 15m stale trên 90 giây đều fail closed.
- Chỉ cảnh báo khi có ít nhất 60 mẫu, coverage `>=20%`, hướng chính có `>=8` coin và
  chiếm `>=65%` nhóm gần EMA. `WATCH` cần hai snapshot liên tiếp; `DANGER` phát ngay khi
  hướng chính có `>=15` coin hoặc `>=10%` số mẫu hợp lệ. Discord dùng chung
  `MARKET_BREADTH_SHOCK_DISCORD_WEBHOOK_URL`, username `Market Shock Guard`, WATCH màu
  vàng/cyan theo phía và DANGER đỏ cam; liệt kê giá, EMA99, khoảng cách và mức tiến gần.
  Cooldown 30 phút theo hướng + severity và cho phép nâng WATCH lên DANGER.
- Thống kê/WHITELIST: đây là trạng thái cảnh báo breadth tổng hợp, không phải signal
  entry/card/paper cohort/matcher giao dịch; không tính W/L, WR, PF, AvgROE hay Net PnL.
  Vì không phải loại lệnh thật nên không tạo checkbox WHITELIST; policy default OFF và
  điều kiện chỉ hiện khi CLOSED AvgROE `>4%` của các matcher giao dịch hiện hữu không đổi.
- Ảnh hưởng Binance/entry/size/SL/TP: **không có**. Luồng OBSERVE ONLY không đặt/chặn/
  đóng/DCA lệnh, không sửa margin, leverage, entry, SL, TP, order hoặc position. Từ dưới
  không đồng nghĩa SHORT; từ trên không đồng nghĩa LONG—vẫn cần nến đóng reject/reclaim.
- Tương thích JSON cũ: module và state atomic
  `data/ema99-market-breadth-15m-discord.json` hoàn toàn additive; không sửa schema API,
  snapshot, CSV, trade hoặc order cũ, không migrate/backfill/replay cảnh báo lịch sử.
  Thiếu webhook/cache hợp lệ thì im lặng fail closed.

## 2026-09-13 - Hybrid Liquidity Hunter vào Binance $1 × 5, TP +10% ROE

- Versions: detector `COINGLASS_HYBRID_LIQUIDITY_HUNTER_V2_DIRECTIONAL_BINANCE_READY_20260913`,
  Discord `COINGLASS_HYBRID_LIQUIDITY_DISCORD_V2_BINANCE_EXECUTION_20260913`, executor
  `COINGLASS_HYBRID_LIQUIDITY_MARKET_1USDT_5X_TP10_V1_20260913` và policy
  `LIVE_CARD_LIQ_FLOW_COINGLASS_PUMP_DUMP_PPKS_EXTREME_HTF_HYBRID_V23_20260913`.
  Dữ liệu causal trước entry gồm active edge zone CoinGlass đã capture ở hai phía,
  nến Binance 5m/15m đã đóng, EMA13/25/99, impulse/body retention/pullback, taker-buy,
  order-book bid ratio, OI/liquidation context, giá tham chiếu và mark mới. Không dùng
  nến tương lai hay kết quả lời/lỗ sau entry.
- Phân loại giữ đúng hai nhãn directional hiện hữu. `HYBRID_UPPER_FIRST_SHORT_SQUEEZE_READY`
  cần impulse UP giữ thân/giữ pullback, EMA 5m+15m bullish, taker/book/OI xác nhận và
  vào `LONG/BUY`; `HYBRID_LOWER_FIRST_LONG_FLUSH_READY` dùng điều kiện đối xứng DOWN và
  vào `SHORT/SELL`. `HYBRID_TWO_SIDED_WHIPSAW_RISK_READY` vẫn `OBSERVE ONLY`, không có
  route Binance. Chỉ hai nhãn directional mới có `binanceEligible/executionEligible=true`.
- Entry thật là MARKET `1 USDT margin × 5x = 5 USDT notional`; TP cố định `+10% ROE`,
  tương đương biên giá `2%`, neo lại từ average full-fill rồi mới đặt protection. Yêu
  cầu này không chỉ định SL nên executor không tạo SL riêng. Tín hiệu phải đóng sau
  `enabledAt`, mới tối đa 7 phút, generatedAt không ở tương lai và mark lệch giá tín
  hiệu tối đa 0,5%. Có position hoặc entry order cùng symbol thì bỏ; cooldown symbol
  4 giờ chống DCA/trùng hai stream, claim state trước submit và lỗi/timeout không replay.
- Trang `/binance-auto-controls` seed bốn exact route: LONG/SHORT riêng cho stream
  `primary` và `secondary`; key UI khớp matcher runtime, mặc định OFF khi mới tạo. Theo
  yêu cầu hiện tại cả bốn route được bật riêng; master hiện hữu vẫn phải ON. Discord
  hiển thị direction, margin, leverage, TP và trạng thái executor; Discord dedupe không
  được quyền chặn runner Binance, còn thiếu webhook chỉ làm mất thông báo chứ không
  vô hiệu hóa exact route đã bật.
- Thống kê dùng pipeline fill/close/CSV Binance hiện hữu theo exact source
  `coinglass-hybrid-liquidity`, stream, label và side: entry count loại DCA; PnL ngày là
  `netRealizedPnlUsdt` position đã đóng. Không đổi công thức W/L, WR, PF, AvgROE hoặc
  card/cohort paper. Không thêm nhãn/card thống kê mới nên không tạo checkbox WHITELIST;
  policy whitelist hiện hữu vẫn mặc định OFF và chỉ hiện với CLOSED AvgROE `>4%`.
- Ảnh hưởng Binance chỉ cho tín hiệu Hybrid directional mới sau lúc bật: có thể mở
  LONG/SHORT, thay margin/notional/leverage và đặt TP như trên; không sửa/hủy/rebase
  position, entry, TP/SL hiện có, không backfill và không vào lại cảnh báo cũ. Policy
  chỉ cấp quyền cho exact internal authorization + source/stream/label/side/MARKET/
  `$1×5`/TP10; sửa payload khác đi sẽ fail closed.
- Tương thích JSON cũ: các field `observeOnly`, `binanceEligible`, `executionEligible`,
  `side`, `confirmedAt`, `candleCloseAt` và `binanceExecution` là additive; consumer cũ
  có thể bỏ qua. State executor mới `data/coinglass-hybrid-liquidity-binance.json` và
  bốn route controls là additive; file cũ không migrate/rewrite/backfill. Event detector
  V1 thiếu exact version/eligibility/confirmedAt bị executor từ chối, nên không replay
  tín hiệu đã phát trước rollout.

## 2026-09-13 - Limit Paper Lab nghiên cứu entry cho tín hiệu không vào MARKET

- Version `LIMIT_PAPER_LAB_V1_CAUSAL_MULTI_DEPTH_20260913`. Dữ liệu causal trước paper
  entry chỉ gồm snapshot của tín hiệu mới (source/stream/label/symbol/side/timeframe,
  giá lúc phát, ATR hoặc proxy ATR, EMA/cấu trúc nếu có), kết quả runner Binance và các
  last-price tick đến **sau** thời điểm phát. Không dùng giá tương lai, Discord lịch sử
  hay outcome Binance để backfill một lần chạm LIMIT chưa quan sát được.
- Chỉ ghi khi runner không trả `submitted/NEW/FILLED/PARTIALLY_FILLED`; `deduped` cũng
  bị loại vì thường là đúng event đã submit ở vòng quét trước. Phạm vi V1 nối vào toàn
  bộ event EMA99 5m/15m, HTF Deep Dump/Pump Base 15m, Extreme Short Squeeze,
  CoinGlass Zone Lifecycle có `shouldEnter=true` và Hybrid Liquidity Hunter của cả
  stream primary/secondary. Hybrid whipsaw OBSERVE ONLY cũng được ghi; directional
  Hybrid/Zone Lifecycle chỉ ghi khi executor thật không submit.
- Mỗi signal tạo ba candidate không phải nhãn giao dịch: `SHALLOW=0,35 ATR`,
  `BALANCED=0,70 ATR`, `DEEP=1,00 ATR`, có clamp theo biến động; thêm `REFERENCE` khi
  EMA99/EMA13/cấu trúc nằm đúng phía chờ hồi (LONG dưới giá phát, SHORT trên giá phát).
  LIMIT LONG chỉ fill khi last price `<= limit`; SHORT chỉ fill khi `>= limit`. Thời
  gian chờ lần lượt 45 phút/3 giờ/12 giờ/36 giờ cho 5m/15m/1h/4h.
- Cách thống kê độc lập theo exact `source + stream + label + side + timeframe +
  candidate`: signal, pending, missed, fill-rate, open/closed, W/L/flat, win-rate,
  AvgROE, NetROE và `expected ROE / signal` (bao gồm hình phạt gián tiếp do LIMIT không
  fill). Chuẩn so sánh cố định paper `5x`, TP `+10% ROE`, SL `-20% ROE`, time-exit theo
  timeframe. Chỉ tô đề xuất `QUALIFIED` khi có ít nhất 20 signal, 12 paper close và
  fill-rate 25%; trước đó luôn ghi rõ `COLLECTING`, không gọi là entry đã chứng minh.
- Trang read-only `/limit-paper-lab`, API `/api/limit-paper-lab` và link từ
  `/binance-auto-controls` hiển thị candidate tốt tạm thời/đủ mẫu, live paper, audit
  từng giá LIMIT và lý do Binance bỏ qua. Đây không phải signal/card/cohort whitelist
  mới; vì vậy không thêm checkbox WHITELIST. Matcher runtime, mặc định OFF và policy
  chỉ hiện khi CLOSED AvgROE `>4%` của các route hiện hữu không đổi.
- Ảnh hưởng Binance/entry/size/SL/TP thật: **không có**. Lab không bật/tắt route, không
  gửi order, không reserve symbol, không DCA, không sửa margin/leverage/entry/TP/SL hay
  position đang mở. TP/SL 10/20 và 5x chỉ là chuẩn đánh giá paper, không được truyền vào
  `placeOrder` hoặc controls.
- Tương thích JSON cũ: state mới `data/limit-paper-lab.json` và API/page mới hoàn toàn
  additive; không sửa/migrate/rewrite/backfill các file trade, fill, controls, CSV,
  order hoặc snapshot cũ. File thiếu được tạo rỗng, field mới được consumer cũ bỏ qua;
  chỉ tín hiệu phát sau rollout mới có dữ liệu có thể kiểm chứng.

## 2026-09-14 - Input entry đầy đủ cho 11 route ngoài EMA99

- Versions: `OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V1_20260914`,
  `AUTO_ENTRY_CONTROLS_V9_OTHER_ROUTE_SETTINGS_20260914`, policy
  `LIVE_CARD_LIQ_FLOW_OTHER_EDITABLE_SETTINGS_V25_20260914`; executor Extreme
  `EXTREME_SHORT_SQUEEZE_EDITABLE_ENTRY_SETTINGS_V4_20260914`, HTF Deep Base
  `HTF_DEEP_BASE_RETEST_EDITABLE_ENTRY_SETTINGS_V4_20260914`, Hybrid
  `COINGLASS_HYBRID_LIQUIDITY_EDITABLE_ENTRY_SETTINGS_V2_20260914` và Coin Horizon
  `COIN_HORIZON_SWEEP_EDITABLE_MARGIN_LEVERAGE_V2_20260914`.
- Dữ liệu trước entry và điều kiện phân loại **không đổi**: Extreme vẫn dùng spike/retrace
  5m; HTF vẫn dùng cú sập/bơm 1h/4h và xác nhận 5m/15m; Hybrid vẫn dùng CoinGlass hai
  phía cùng impulse Binance 5m; Horizon vẫn cần chuyển trạng thái và đồng thuận
  4h/8h/12h. Không dùng outcome, PnL hoặc nến sau entry để chọn cấu hình.
- UI/API mở input riêng theo exact `source + stream + label + side` cho 11 route thật:
  margin 1–100 USDT tối đa hai số lẻ, leverage nguyên 1–125x, và TP 1–100% ROE với
  chín route TP cố định. Hai route Horizon chỉ sửa margin/leverage; TP tiếp tục lấy mép
  vùng thanh khoản active gần nhất, R:R `>=1`, SL `-25% ROE`, nên không hiện input TP
  giả. Extreme/HTF vẫn giữ SL `-30% ROE`; Hybrid vẫn không tạo SL riêng.
- Ảnh hưởng Binance chỉ với **entry mới** của route đang ON và master ON. Builder đọc
  lại setting mới nhất sau khi lấy mark/position/open-order, dựng lại notional
  `margin × leverage`, khoảng cách TP/SL theo ROE/leverage rồi `assertEntry` exact trước
  submit. Save không bật route OFF, không đổi `enabledAt`, không DCA/replay, không sửa
  position, TP/SL hay order đang có. Policy authorization vẫn là Symbol nội bộ và chỉ
  nhận exact route + MARKET + size tự nhất quán; controls chặn plan stale khác setting.
- Thống kê không đổi: audit fill/close tiếp tục nhóm theo exact route; entry bỏ DCA và
  PnL ngày dùng `netRealizedPnlUsdt` của vị thế đóng. Không reclassify/backfill W/L,
  WR, PF, AvgROE hoặc PnL lịch sử. Không thêm nhãn/card thống kê nên không thêm checkbox
  WHITELIST; policy card chỉ hiện khi CLOSED AvgROE `>4%` và mặc định OFF giữ nguyên.
- Tương thích JSON cũ là additive: route thiếu `marginUsdt`, `leverage` hoặc
  `takeProfitRoePct` nhận đúng default executor lịch sử; `enabled/enabledAt` được bảo
  toàn. Giá trị sai làm route fail closed nhưng có thể sửa lại qua input. Không migrate,
  rewrite, replay hay thay snapshot trade/audit cũ; field version/settings mới có thể bị
  consumer cũ bỏ qua.

## 2026-09-14 - TĂNG MẠNH 15m vào LONG MARKET 10 USDT

- Versions: signal `BIG_CANDLE_PUMP_15M_CLOSED_SIGNAL_V1_20260914`, executor
  `BIG_CANDLE_PUMP_15M_MARKET_EDITABLE_ENTRY_V1_20260914`, catalog
  `OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V2_BIG_CANDLE_20260914`, controls
  `AUTO_ENTRY_CONTROLS_V10_BIG_CANDLE_PUMP_20260914` và policy
  `LIVE_CARD_LIQ_FLOW_BIG_CANDLE_PUMP_V26_20260914`.
- Dữ liệu causal trước entry chỉ gồm danh sách market snapshot hiện tại, nến Binance
  15m **đã đóng**, thân nến `(close/open-1)`, quote volume nến so baseline 23 nến cũ,
  giá mark tại lúc scanner đánh giá và mark đọc lại ngay trước submit. Không dùng nến
  live tiếp theo, outcome/PnL hoặc dữ liệu sau entry để phân loại.
- Exact classification là `BIG_CANDLE_PUMP_LONG`: symbol thuộc universe hiện hữu của
  Volume Dump Scanner, thân nến 15m đã đóng tăng ít nhất `+8%`. Volume ratio tiếp tục
  được ghi để quan sát nhưng không phải gate mới vì alert `TĂNG MẠNH` cũ cũng không yêu
  cầu volume. Nhánh âm `XẢ MẠNH` không map sang route này và không được authorization.
- Entry thật chỉ áp dụng cho tín hiệu mới sau `enabledAt`: `LONG/BUY MARKET`, mặc định
  `10 USDT margin × 5x = 50 USDT notional`; TP `+15% ROE`, SL `-20% ROE`, đều neo lại
  từ average full-fill. Nến đóng phải mới tối đa 90 giây, snapshot đánh giá mới tối đa
  60 giây và mark lệch giá phát tối đa 0,5%. Có position hoặc entry order cùng symbol
  thì bỏ; state claim trước submit và cooldown symbol 4 giờ ngăn DCA/replay.
- `/binance-auto-controls` có exact key `big-candle-pump-15m + volume-dump-scanner +
  BIG_CANDLE_PUMP_LONG + LONG`, input margin/leverage/TP và daily fill/PnL giống các
  route ngoài EMA99. Route mới mặc định fail-closed khi seed; trên instance hiện tại
  được bật riêng theo yêu cầu, còn master controls vẫn phải ON. Save chỉ ảnh hưởng
  lệnh mới, không sửa position/order/TP/SL hiện có.
- Thống kê dùng fill/close audit chung theo exact source/stream/label/side: entry không
  tính DCA, PnL ngày là `netRealizedPnlUsdt` của position đóng. Không đổi W/L, WR, PF,
  AvgROE hoặc backfill lịch sử. Đây là route của alert đã có, không tạo card thống kê
  hay matcher performance mới; vì vậy không tạo checkbox WHITELIST giả. Policy
  performance hiện hữu vẫn default OFF và chỉ hiện khi CLOSED AvgROE `>4%`.
- Tương thích JSON cũ: thêm route controls và state độc lập
  `data/big-candle-pump-15m-binance.json`; file thiếu được tạo rỗng. Event cũ thiếu
  exact version/closedAt/eligibility bị từ chối, không replay POWER hay alert lịch sử.
  Field Discord `Binance` là additive; consumer cũ có thể bỏ qua.

## 2026-09-17 - Hậu bơm/hậu sập MTF: EMA99 5m cắt EMA13/EMA25 hai chiều

- Version `POST_PUMP_DUMP_EMA99_CROSS_MTF_V2_LONG_SHORT_20260917`; exact label Discord
  SHORT `POST_PUMP_EMA99_BEARISH_CROSS_5M_CONFIRMED_MTF` và LONG
  `POST_DUMP_EMA99_BULLISH_CROSS_5M_CONFIRMED_MTF`. Scanner quét tối đa 400 hợp đồng
  USDT đủ quote volume, ưu tiên coin có độ lớn biến động 24h cao ở cả hai hướng để nạp cache dần; 5m/15m dùng cache
  WebSocket và chỉ nạp REST có giới hạn khi không bị block/congestion, 1h chỉ nạp cho
  candidate đã qua 5m+15m. Mọi nến dùng để phân loại đều đã đóng và liên tục.
- Dữ liệu causal trước cảnh báo gồm tối đa 120 nến 1h, 220 nến 15m và 260 nến 5m,
  OHLCV/quote volume, EMA13/25/99, đỉnh/đáy cực trị và mốc trước cực trị, tuổi cực trị,
  mức pump/dump và drawdown/recovery, dốc EMA, số close quanh EMA25 cùng lower-high/
  higher-low theo các đoạn hậu đỉnh/đáy. Giá mark
  snapshot chỉ hiển thị giá lúc phát; không thay thế close nến đã đóng trong classifier.
  Không dùng nến tương lai, Discord cũ, fill, PnL hoặc outcome để quyết định cảnh báo.
- Nhánh SHORT phải qua đủ ba tầng: 1h tăng từ đáy trước đỉnh ít nhất `40%`, đỉnh đã cách
  `4–96h`, đã rút `8–70%`, có ít nhất hai lower-high và close dưới EMA13; 15m có
  `close < EMA13 < EMA25`, dốc EMA13/25 bốn nến âm và ít nhất hai lower-high sau đỉnh;
  nến 5m mới nhất vừa làm EMA99 đổi từ chưa ở trên cả hai sang `EMA99 > EMA13` và
  `EMA99 > EMA25`, đồng thời `close < EMA13 < EMA25 < EMA99`, dốc nhanh sáu nến âm
  và ít nhất 4/6 close dưới EMA25. Chỉ đúng transition mới gửi, cooldown 6 giờ/symbol.
- Nhánh LONG đối xứng nhưng không đảo dấu một cách mù quáng: 1h phải giảm từ đỉnh trước
  đáy ít nhất `40%`, đáy cách `4–96h`, đã hồi `8–120%`, có ít nhất hai higher-low và
  close trên EMA13; 15m phải có `close > EMA13 > EMA25`, dốc EMA13/25 bốn nến dương
  và ít nhất hai higher-low hậu đáy; 5m vừa chuyển sang `EMA99 < EMA13` và
  `EMA99 < EMA25`, đồng thời `close > EMA13 > EMA25 > EMA99`, dốc nhanh sáu nến dương
  và ít nhất 4/6 close trên EMA25.
- “Vùng vào SHORT dự kiến” là dữ liệu hướng dẫn trong Discord, không phải order:
  biên dưới lấy mốc gần nhất phía trên close tín hiệu giữa EMA25 5m và EMA13 15m;
  biên trên lấy mốc hợp lệ gần nhất không thấp hơn biên dưới giữa EMA99 5m và EMA25
  15m; gửi cả midpoint và % giá phải hồi. Chỉ xem xét khi giá hồi vào vùng rồi nến 5m
  đóng reject lại dưới EMA25/EMA99; không đuổi SHORT ở giá đang rơi. Không đủ hai biên
  hợp lệ thì fail closed và không phát alert.
- “Vùng vào LONG dự kiến” dùng EMA25 5m + EMA13 15m làm các mốc phía dưới close và
  EMA99 5m + EMA25 15m để dựng biên sâu hơn; gửi low/high, midpoint và % pullback.
  Chỉ xem xét khi giá điều chỉnh vào vùng rồi nến 5m đóng reclaim lại trên EMA25/EMA99;
  không đuổi LONG khi giá đang tăng. Không đủ vùng hợp lệ cũng fail closed.
- Thống kê của vòng quét chỉ là requested/processed/candidate/1h-ready/detected/sent/
  failed và top score vận hành; không sinh paper fill, W/L, WR, PF, AvgROE hay PnL.
  Đây không phải card/cohort thống kê nên không thêm checkbox WHITELIST; matcher runtime,
  mặc định OFF và policy chỉ hiện khi CLOSED AvgROE `>4%` của các route hiện hữu không đổi.
- Ảnh hưởng Binance/entry/size/SL/TP thật: **không có**. Event luôn có
  `observeOnly=true`, `binanceEligible=false`, `executionEnabled=false`; không gọi
  executor, không tạo/chặn/đóng/DCA lệnh, không sửa margin, leverage, entry, SL, TP,
  order hay position. “Entry dự kiến” chỉ là vùng retest/pullback tham khảo trong Discord.
- Tương thích JSON cũ: module, biến môi trường và state atomic
  `data/post-pump-ema99-bearish-cross-discord.json` đều additive; không sửa schema API,
  snapshot, controls, CSV, trade, fill hoặc order cũ, không migrate/backfill/replay.
  Thiếu webhook, cache, continuity hoặc vùng entry hợp lệ thì im lặng fail closed.

## 2026-09-26 - Giảm tải runtime và snapshot, không đổi quyết định giao dịch

- Versions vận hành: `CAP_PAPER_ACTIVE_INDEX_BATCH_V1_20260926`,
  `LIQUID_FLOW_V2_PAPER_SNAPSHOT_BOUNDED_CACHE_V2_20260926`,
  `AUTO_ENTRY_DAILY_STATS_CACHE_V1_20260926` và
  `HIDDEN_TAB_POLL_PAUSE_V1_20260926`; thêm index hot-path
  `RECOMMENDED_PAPER_SOCKET_ACTIVE_INDEX_V1_20260926` và
  `SHAKEOUT_PAPER_ACTIVE_INDEX_V1_20260926`, cùng
  `COIN_HORIZON_ANALYSIS_REUSE_V1_20260926`.
- Dữ liệu trước entry và điều kiện phân loại **không đổi**. Bản này không thêm/bớt
  nến, EMA, volume, taker, order book, market breadth hoặc điều kiện xác nhận nào;
  không đổi label, tier, side, score, gate, cooldown hay freshness.
- Cap Paper giữ index chỉ cho `PENDING/OPEN`, nên vòng mark 1 giây không còn tìm lại
  từng id trong toàn bộ lịch sử. Nhiều fill/TP/SL cùng một nhịp được áp dụng vào cùng
  store và ghi atomic một lần. Cách xác định touch, TP, SL, PnL, ROE và outcome giữ
  nguyên. Thống kê response vẫn quét đủ lịch sử; UI mặc định nhận toàn bộ lệnh active
  cộng 500 lệnh CLOSED gần nhất. `?history=full` giữ đường đọc đầy đủ khi cần audit.
- Liquid Flow V2 snapshot vẫn tính `total/open/pending/cancelled/closed`, W/L, WR,
  NetPnL, AvgROE, PF và open PnL trên toàn bộ store. Chỉ mảng hiển thị được giới hạn
  ở toàn bộ active cộng 300 record không active gần nhất, tránh clone/sort gần 10.000
  object mỗi lần publish. Aggregate đóng được cache theo revision; open PnL vẫn cập
  nhật theo mark live. Endpoint thống kê theo ngày/label vẫn đọc lịch sử đầy đủ.
- Daily stats của Auto Controls được cache theo revision audit, revision controls và
  ngày Bangkok; fill hoặc setting đổi sẽ tự làm mới. Các tab nền dừng REST polling và
  refresh ngay khi tab hiện lại. Đây là tối ưu đọc/hiển thị, không đổi công thức stats.
- Recommended Paper và Shakeout Paper chỉ tra các lệnh active đúng symbol thay vì map/
  filter toàn bộ lịch sử ở mỗi giá socket. Recommended vẫn chỉ đóng ở TP/SL cũ;
  Shakeout vẫn giữ nguyên cancel pending, fill, recovery, partial TP, trail và TP/SL.
- Coin Horizon dựng một snapshot cho cùng analysis rồi dùng lại ở response, Discord và
  transition executor; không đổi horizon, direction, vùng, dedupe hay authorization.
- Ảnh hưởng Binance/entry/size/SL/TP: **không có**. Không tạo, hủy, đóng hay sửa order;
  không đổi margin, leverage, entry, TP, SL, route ON/OFF hoặc master lock. Index
  Liquid Flow dùng cho nhận diện protection chỉ thu hẹp tập tìm kiếm theo symbol nhưng
  giữ nguyên exact matcher và trạng thái `FILLED/MANUAL_LIMIT_SUBMITTED`.
- Tương thích JSON: file store cũ được đọc nguyên trạng, không migrate, compact, xóa
  hay rewrite lịch sử. Response chỉ thêm `snapshotPerformanceVersion`, `version`,
  `historyOmitted`, `returnedTrades`, `recentClosedLimit` và `cacheVersion`; consumer
  cũ có thể bỏ qua. Khi cần đủ Cap history dùng `history=full`. Không có label/card
  thống kê mới, nên không thêm WHITELIST; default OFF và policy CLOSED AvgROE `>4%`
  giữ nguyên.

### 2026-09-26 — SQUEEZE_RATIO_LIVE_VIEW_V3_20260926 · live/history tách hai chiều

- Dữ liệu và điều kiện trước cảnh báo giữ nguyên V2: chỉ dùng nến 15m/1h đã đóng,
  volume so với median 20 nến, EMA13/25 1h, global account L/S và OI as-of. SHORT bị
  squeeze vẫn là phá đỉnh + xu hướng 1h tăng + L/S `<1` giảm ít nhất `10%/1h`; LONG
  bị squeeze vẫn là phá đáy + xu hướng 1h giảm + L/S `>1` tăng ít nhất `10%/1h`.
  `RATIO_OI` vẫn chỉ là tier khi OI tăng ít nhất `3%/1h`; không đổi classifier, ngưỡng,
  cooldown Discord hoặc dữ liệu causal.
- Snapshot thêm `liveWindowMs=900000`, `liveEvents`, `historyEvents`, `isLive`,
  `isLegacy`, `ageMs`, `expiresAt` và số live theo từng chiều. Một event có chiều rõ
  ràng chỉ là LIVE trong 15 phút kể từ close xác nhận; quá cửa sổ chuyển sang lịch sử.
  Event V1 thiếu `squeezeSide` luôn là `LEGACY`, được đọc tương thích thành SHORT để
  consumer cũ không vỡ nhưng không bao giờ được coi là live.
- UI `/coin-level-analysis` mặc định chỉ hiện LIVE, tách bảng `SQUEEZE SHORT · SHORT
  BỊ ÉP` và `SQUEEZE LONG · LONG BỊ ÉP`, có công tắc ẩn/hiện từng chiều và checkbox
  lịch sử 7 ngày. Badge LIVE hiển thị số phút còn hiệu lực; lịch sử/legacy có badge
  riêng. Poll 30 giây và feed lịch sử tối đa 200 event/7 ngày giữ nguyên.
- Thống kê chỉ là số event live SHORT/LONG cùng health scanner; không tạo trade outcome,
  W/L, WR, PF, AvgROE hoặc PnL. Đây là feed OBSERVE ONLY, không phải card performance,
  nên không thêm WHITELIST; policy checkbox mặc định OFF và chỉ hiện khi closed AvgROE
  `>4%` của các route giao dịch vẫn giữ nguyên.
- Ảnh hưởng Binance/entry/size/leverage/SL/TP: **không có**. Không tạo, hủy, đóng hay
  sửa order/position và không đổi route/master lock. Thay đổi chỉ phân loại trạng thái
  hiển thị live/history.
- Tương thích JSON: không migrate, xóa hoặc rewrite bản ghi cũ. `events` vẫn được trả
  nguyên để consumer cũ hoạt động; các field/mảng mới chỉ additive. File state tiếp tục
  lưu tối đa 200 event trong 7 ngày và ghi atomic như trước.

### 2026-09-26 — V2_RUNTIME_HOT_STORE_ONLY_V1_20260926 · ngừng đọc lịch sử source cũ

- Runtime chỉ giữ lệnh chưa kết thúc (`OPEN`, `PENDING`, `READY` và trạng thái active
  tương đương) cùng một cửa sổ nhỏ bản ghi terminal gần nhất. `CLOSED`, `CANCELLED`,
  `EXPIRED`, `REJECTED` vượt giới hạn được chuyển tuần tự sang NDJSON trong
  `data/archive/` và không còn được nạp vào vòng quét nóng. Giới hạn mặc định:
  Recommended 500, Shakeout 500, Cap 1.000 và Liquid Flow V2 300 dòng tổng; active
  luôn được bảo toàn dù vượt giới hạn.
- Sidecar học lịch sử Shakeout cũ mặc định tắt; Recommended learning và paper-page
  learning tiếp tục mặc định tắt. Đây là thay đổi nguồn dữ liệu runtime/snapshot để
  giảm heap, JSON rewrite và CPU; archive chỉ dùng khi audit ngoại tuyến.
- Dữ liệu trước entry, điều kiện phân loại, score/tier/label, freshness, cooldown,
  market-regime gate và whitelist **không đổi**. Không thêm card/label mới; policy
  WHITELIST mặc định OFF và chỉ hiện khi closed AvgROE `>4%` giữ nguyên.
- Thống kê live chỉ tính trên hot store V2 (mọi active + terminal gần nhất), không còn
  tuyên bố là full-history. Lịch sử cũ vẫn còn trong NDJSON nhưng không được đọc trong
  request/snapshot/scanner. Vì vậy total/W-L/WR/PF/AvgROE trên các page liên quan là
  cửa sổ vận hành hiện tại, không phải toàn bộ lịch sử trước khi compact.
- Ảnh hưởng Binance/entry/size/leverage/SL/TP: **không đổi**. Mọi lệnh active được giữ
  và tiếp tục mark/protection; không hủy, đóng, đặt lại hay sửa order/position. Không
  thay đổi margin, leverage, entry, SL, TP, route ON/OFF hoặc master lock.
- Tương thích JSON: schema trade cũ không đổi; metadata `hotStore` là additive. Record
  terminal cũ được append vào `cap-paper-trades.ndjson`, `shakeout-paper-trades.ndjson`,
  `recommended-paper-trades.ndjson` hoặc archive Liquid hiện hữu trước khi hot JSON
  được ghi atomic. Consumer cần full history phải đọc archive ngoại tuyến.

### 2026-09-26 — STRATEGY_SCAN_CANDLE_CLOSE_BURST_DEBOUNCE_V1_20260926 · gộp burst đóng nến 15m

- Dữ liệu dùng trước entry và điều kiện phân loại không đổi: scanner vẫn chỉ đọc đúng
  cache/nến đã đóng, EMA, volume, taker, OI, L/S và market context của từng route như
  trước. Thay đổi chỉ nằm ở scheduler: hàng trăm event `candleClose` 15m theo từng
  symbol trong cùng một nhịp được gộp thành một lượt gọi nhóm scanner sau 1,2 giây;
  cooldown burst mặc định 30 giây. Fallback hai phút và các scanner riêng vẫn giữ nguyên.
- Label/tier/score/gate/freshness/cooldown tín hiệu không đổi. Log chờ warm-up được
  throttle 30 giây theo trạng thái thay vì ghi lặp hàng trăm dòng cùng giây. Không thêm
  label/card thống kê nên không có checkbox WHITELIST mới; policy mặc định OFF và chỉ
  hiện khi CLOSED AvgROE `>4%` giữ nguyên.
- Thống kê và snapshot không đổi công thức; bản này chỉ loại lượt tính trùng do cùng
  một ranh giới nến. Không bỏ coin, không bỏ khung và không dùng dữ liệu tương lai.
- Ảnh hưởng Binance/entry/size/leverage/SL/TP: **không đổi**. Một burst hợp lệ vẫn chạy
  đầy đủ các route đúng một lần; không tạo/hủy/đóng/sửa order hoặc position, không đổi
  margin, leverage, entry, SL, TP, master lock hay route ON/OFF.
- Tương thích JSON cũ: không đổi schema/state/snapshot/trade/fill. Hai biến env scheduler
  mới có default nội bộ, nên cấu hình cũ tiếp tục chạy; không migrate/replay/backfill.

### 2026-09-26 — COIN_LEVEL_ENTRY_WATCH_LIVE_PAYLOAD_V1_20260926 · mặc định chỉ tải tín hiệu đang đạt

- Endpoint Coin Level mặc định chỉ trả `earlyLongWatches`, `earlyShortWatches`, ứng viên
  entry đang đạt, diagnostics và một danh sách rất nhỏ tín hiệu hai chiều trong 30 phút;
  không còn gửi 500 LONG + 500 SHORT lịch sử mỗi 30 giây. Khi người dùng bật “Hiện
  lịch sử hôm nay”, UI mới gọi `?history=1` và nhận lịch sử đầy đủ.
- Dữ liệu trước entry, classifier, label/tier/score/gate, live-price invalidation và
  cách thống kê không đổi. Tổng số lịch sử vẫn được trả bằng counter; đánh dấu hai
  chiều vẫn dựa trên cùng cửa sổ 30 phút. Không thêm card/label hoặc WHITELIST mới.
- Ảnh hưởng Binance/entry/size/leverage/SL/TP: **không có**. Snapshot nội bộ đầy đủ
  vẫn cấp cho Discord, direction-flip protection và executor; chỉ payload HTTP gửi
  cho trình duyệt được rút gọn. Không đổi order/position, route hoặc master lock.
- Tương thích JSON: query `history=1` giữ nguyên hai mảng lịch sử cũ; response mặc định
  thêm `historyIncluded`, `recentObserveHistory`, `responseVersion`. Consumer cũ cần
  history phải opt-in; trade/state/file cũ không migrate, replay hoặc rewrite.

### 2026-09-26 — POST_PUMP_NO_BUY_WATCH_V1_CLOSED_5M_24H_20260926 · xả mạnh sau bơm

- Dữ liệu causal trước cảnh báo chỉ gồm nến đã đóng: tối đa 24 giờ nến 15m để ghi
  nhận nhịp bơm gần nhất và tối đa 36 nến 5m trước cây xả để dựng vùng phân phối.
  Nhịp trước được coi là bơm khi tăng `>=8%`, hoặc tăng `>=4%` với volume nến bơm
  `>=2.5x` median20. Không dùng giá live, outcome, nến tương lai hay dữ liệu Binance.
- Stage `SELL_IMPULSE` có nội dung hiển thị `XẢ MẠNH SAU BƠM · CẢNH BÁO SỚM` khi
  nến 5m đỏ vừa đóng dưới đáy vùng và EMA13/25, biên độ `>=1.2%` hoặc `>=1.5 ATR14`,
  volume `>=1.8x median20`, taker-sell `>=58%` và close nằm trong 25% dưới của nến.
  Stage `NO_BUY_CONFIRMATION` chỉ có sau 2–3 nến 5m đã đóng nếu nhịp hồi `<=35%`
  thân xả, volume trung bình `<=60%` cây xả, taker-buy `<=45%`, chưa lấy lại đáy
  vùng/EMA13 và high sau không nâng lên.
- Anti-chase fail closed với Binance: khi RSI14 `<25`, giá cách EMA13 hơn `2 ATR14`
  hoặc đã thấp hơn đáy vùng quá `5%`, watch chuyển thành stage
  `LATE_NO_CHASE`/`ĐÃ XẢ QUÁ XA · KHÔNG SHORT ĐUỔI` thay vì giả vờ là điểm vào.
  Discord vẫn gửi cảnh báo quan sát màu xám để giải thích vì sao không được đuổi giá.
  Webhook dùng lại cấu hình mới nhất
  `BTC_SESSION_WATCH_DISCORD_WEBHOOK_URL`; chỉ event sinh sau lúc process khởi động,
  còn mới tối đa 12 phút và dedupe theo symbol/stage/cây xả/thời điểm mới được gửi.
- Thống kê chỉ gồm số coin được đánh giá/chấp nhận và counter lý do loại trong
  `postPumpNoBuyDiagnostics`; chưa có closed trade nên không tính W/L, WR, PF,
  AvgROE hay PnL. Hai chuỗi tiếng Việt là stage metadata tạm thời của alert, không
  phải label/card performance mới, nên không đăng ký checkbox WHITELIST; policy
  mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%` của các route thật giữ nguyên.
- Ảnh hưởng Binance/entry/size/leverage/SL/TP: **không có**. Watch luôn có
  `watchOnly=true`, `binanceEligible=false` ở cả ba stage; không tạo/hủy/đóng/sửa order/position,
  không đổi margin, leverage, entry, SL, TP, master lock hay route ON/OFF.
- Tương thích JSON cũ: snapshot chỉ thêm `postPumpNoBuyWatches`,
  `totalPostPumpNoBuyWatches`, `postPumpNoBuyDiagnostics` và cờ cấu hình Discord.
  Consumer cũ có thể bỏ qua; state Discord nằm file riêng, ghi atomic, không migrate,
  rewrite, replay hoặc backfill các JSON trade/signal cũ.
- Discord của cả ba stage luôn có prefix tiêu đề và field phân loại cố định
  `XẢ MẠNH SAU BƠM`; phần sau mới ghi `CẢNH BÁO SỚM`, `KHÔNG CÓ LỰC MUA` hoặc
  `ĐÃ XẢ QUÁ XA`. Đây chỉ là thay đổi text nhận diện, không đổi classifier/ngưỡng.

### 2026-09-26 — POST_DUMP_NO_SELL_WATCH_V1_CLOSED_5M_24H_20260926 · LONG đối xứng sau xả

- Dữ liệu causal trước cảnh báo chỉ dùng nến đã đóng: nến 15m tối đa 24 giờ để nhớ
  nhịp xả gần nhất, cùng tối đa 36 nến 5m sau đáy để dựng vùng tích lũy. Nhịp trước
  là xả khi giảm `>=8%`, hoặc giảm `>=4%` với volume `>=2.5x median20`. Không dùng
  price live, outcome, future candle hoặc dữ liệu tài khoản Binance.
- Stage `BUY_IMPULSE` hiển thị `HỒI MẠNH SAU XẢ · CẢNH BÁO SỚM` khi nến 5m xanh
  vừa đóng trên đỉnh vùng và EMA13/25, tăng `>=1.2%` hoặc range `>=1.5 ATR14`, volume
  `>=1.8x median20`, taker-buy `>=58%`, close nằm trong 25% trên của nến. Stage
  `NO_SELL_CONFIRMATION` chỉ có sau 2–3 nến 5m đã đóng nếu điều chỉnh `<=35%` thân
  hồi, volume trung bình `<=60%` cây hồi, taker-sell `<=45%`, không mất đỉnh vùng/
  EMA13 và low sau không thấp xuống.
- Anti-chase: RSI14 `>75`, giá cao hơn EMA13 quá `2 ATR14` hoặc cao hơn đỉnh vùng
  quá `5%` chuyển thành `LATE_NO_CHASE`/`ĐÃ BƠM QUÁ XA · KHÔNG LONG ĐUỔI` màu xám;
  Discord vẫn giải thích đã nhận ra mẫu nhưng không coi đó là entry. Mọi tiêu đề và
  field phân loại đều có prefix cố định `HỒI MẠNH SAU XẢ`.
- Discord dùng `BTC_SESSION_WATCH_DISCORD_WEBHOOK_URL`, chỉ gửi event sinh sau lúc
  process khởi động, còn mới tối đa 12 phút và dedupe theo symbol/stage/cây hồi/thời
  điểm. Không replay lịch sử cũ sau restart; state tách riêng và ghi atomic.
- Thống kê chỉ gồm số evaluated/accepted và counter nguyên nhân loại trong
  `postDumpNoSellDiagnostics`, không có W/L, WR, PF, AvgROE hoặc PnL. Các chuỗi trên
  là stage metadata tạm thời, không phải label/card performance, nên không thêm
  WHITELIST; policy default OFF và chỉ hiện khi CLOSED AvgROE `>4%` giữ nguyên.
- Ảnh hưởng Binance/entry/size/leverage/SL/TP: **không có**. Cả ba stage luôn
  `watchOnly=true`, `binanceEligible=false`; không tạo/hủy/đóng/sửa order/position,
  không đổi margin, leverage, entry, SL, TP, route hay master lock.
- Tương thích JSON cũ: snapshot chỉ thêm `postDumpNoSellWatches`,
  `totalPostDumpNoSellWatches`, `postDumpNoSellDiagnostics` và cờ cấu hình Discord.
  Consumer cũ có thể bỏ qua; không migrate/rewrite/replay/backfill JSON cũ.

### 2026-09-27 — POST_MOVE_IMPULSE_5M_MARKET_3USDT_V1_20260927 · hai thẻ cảnh báo sớm vào MARKET

- Dữ liệu causal trước entry giữ nguyên detector nến đã đóng: LONG chỉ lấy đúng
  `POST_DUMP_NO_SELL_WATCH_V1_CLOSED_5M_24H_20260926 / BUY_IMPULSE` (thẻ vàng
  `HỒI MẠNH SAU XẢ · CẢNH BÁO SỚM`); SHORT chỉ lấy đúng
  `POST_PUMP_NO_BUY_WATCH_V1_CLOSED_5M_24H_20260926 / SELL_IMPULSE` (thẻ cam
  `XẢ MẠNH SAU BƠM · CẢNH BÁO SỚM`). Hai stage xác nhận sau đó chỉ cập nhật Discord,
  không vào lần hai; `LATE_NO_CHASE` luôn bị loại.
- Trước submit còn phải thỏa: event sinh sau cả thời điểm bật route và startup hiện
  tại, tuổi không quá 90 giây, MARK lệch giá thẻ không quá 0,5%, không có vị thế hoặc
  entry order cùng symbol, chưa vượt 30 vị thế, khóa tổng + exact route + runtime
  order đều ON. Attempt được ghi atomic trước submit và dedupe theo symbol/side/cây
  impulse/label; kết quả mơ hồ không retry tự động.
- Hai exact route là `post-move-impulse / post-dump-no-sell-5m /
  POST_DUMP_NO_SELL_BUY_IMPULSE_LONG / LONG` và `post-move-impulse /
  post-pump-no-buy-5m / POST_PUMP_NO_BUY_SELL_IMPULSE_SHORT / SHORT`. Catalog seed
  mặc định OFF; key UI khớp matcher runtime và máy hiện tại chỉ bật theo yêu cầu trực
  tiếp của operator. Margin mặc định `3 USDT`, leverage `5x` (notional `15 USDT`),
  MARKET, TP `+10% ROE`; SL LONG `-20% ROE`, SL SHORT `-30% ROE`, neo theo fill.
  Controls chạy version `AUTO_ENTRY_CONTROLS_V24_POST_MOVE_IMPULSE_20260927`.
- Thống kê dùng fill audit theo exact route như các route Auto Controls khác: entry
  không tính DCA, closed outcome/PnL theo vị thế thật. Không tạo performance card/label
  mới, vì vậy không thêm WHITELIST giả; policy card WHITELIST vẫn mặc định OFF và chỉ
  hiện khi CLOSED AvgROE `>4%`. Hai nhãn route Auto Controls mặc định OFF ở catalog.
- Ảnh hưởng Binance: chỉ hai stage cảnh báo sớm mới có thể mở lệnh mới với thông số
  trên. Không sửa/hủy vị thế hoặc order đã có, không replay tín hiệu cũ, không vào lại
  ở stage xác nhận và không nâng minimum notional nếu sàn từ chối size.
- Tương thích JSON: detector chỉ thêm cờ additive `executionCandidate`; state executor
  mới ở `data/post-move-impulse-binance.json`. JSON watch cũ thiếu cờ sẽ fail closed;
  controls/trade/fill cũ không migrate, rewrite, backfill hoặc replay.

### 2026-09-27 — POST_MOVE_IMPULSE_5M_MARKET_8USDT_V2_20260927 · tăng size hai thẻ màu

- Dữ liệu trước entry và phân loại **không đổi** so với V1: chỉ nến 15m/5m đã đóng,
  LONG đúng `BUY_IMPULSE` màu vàng và SHORT đúng `SELL_IMPULSE` màu cam. Stage xác
  nhận không vào lần hai; `LATE_NO_CHASE` không vào. Freshness 90 giây, MARK drift
  0,5%, no-position/no-entry-order, max 30 vị thế và dedupe vẫn giữ nguyên.
- Binance thay đổi cho **lệnh mới** của đúng hai exact route: margin tăng từ `3` lên
  `8 USDT`, leverage giữ `5x`, nên notional tăng từ `15` lên `40 USDT`. MARKET,
  TP `+10% ROE`, SL LONG `-20%`, SL SHORT `-30%` và protection neo full fill không
  đổi. Không sửa/hủy/re-size vị thế hoặc order đang mở và không replay tín hiệu cũ.
- Thống kê vẫn dùng exact Binance fill audit, entry bỏ DCA và closed net PnL theo vị
  thế. Không thêm label/card performance hay WHITELIST; checkbox card vẫn mặc định OFF
  và chỉ hiện khi CLOSED AvgROE `>4%`. Exact route Auto Controls vẫn là hai key V1,
  đang ON theo yêu cầu operator; chỉ giá trị margin được đổi sang 8.
- Versions: executor `POST_MOVE_IMPULSE_5M_MARKET_8USDT_V2_20260927`, policy
  `LIVE_CARD_POST_MOVE_IMPULSE_5M_MARKET8_V39_20260927`, catalog
  `OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V14_POST_MOVE_IMPULSE_8USDT_20260927`,
  controls `AUTO_ENTRY_CONTROLS_V25_POST_MOVE_IMPULSE_8USDT_20260927`.
- Tương thích JSON: route key và schema giữ nguyên; controls cũ được cập nhật đúng hai
  margin từ 3 sang 8, `enabled/enabledAt` giữ nguyên. State attempts, watch, fills và
  trades không migrate, rewrite, backfill hoặc replay; record cũ vẫn đọc được.

### 2026-09-27 — LIQSCAN_MAIN_KILL_SWEEP_SHORT_REJECTION_FILTER_V2_20260927 · lọc SHORT sau quét

- Versions đang chạy: detector/Discord
  `LIQSCAN_MAIN_KILL_SWEEP_DISCORD_V3_SHORT_REJECTION_FILTER_20260927`, executor
  `LIQSCAN_MAIN_KILL_SWEEP_SHORT_REJECTION_FILTER_V2_20260927` và policy
  `LIVE_CARD_POST_MOVE_IMPULSE_MAX50_V41_20260927`. Exact route vẫn là
  `liqscan-main-kill-sweep / background-top400 /
  LIQSCAN_MAIN_KILL_UPPER_SWEEP_SHORT / SHORT`; route LOWER/LONG giữ exact key cũ.
- Dữ liệu dùng trước entry hoàn toàn causal: vùng MAIN KILL và score được đóng băng
  lúc gác; high/low/close của nến 15m đang quan sát, MARK tại lần phát, mép trên/dưới
  vùng và lịch sử event EXTREME của chính executor. Độ xuyên SHORT là
  `(đỉnh quét / mép trên vùng - 1) × 100`; không dùng outcome, PnL hay nến tương lai.
- Phân loại/gate thật: UPPER/SHORT chỉ còn đủ quyền Binance khi tier `EXTREME`, vùng
  `>=50M`, giá đã rút xuống **dưới đáy vùng quét** (MARK live hoặc close 15m hợp lệ),
  độ xuyên `<=0,10%`, và symbol không có event LOWER/LONG trong 3 ngày trước đó.
  Chưa rút xuống, xuyên sâu hơn 0,10% hoặc vừa có cả hai hướng trong 3 ngày đều ghi
  rõ `OBSERVE ONLY`; policy kiểm lại cùng các field fail-closed trước submit. LOWER/
  LONG không thêm độ xuyên/rejection nhưng cũng bị khóa nếu có hai hướng trong 3 ngày.
- Size và protection không tăng: lệnh mới hợp lệ vẫn MARKET `1 USDT margin ×5`
  (`5 USDT` notional), TP `+10% ROE`, SL `-30% ROE`, neo full fill. Freshness 90 giây,
  drift 0,5%, cooldown 4 giờ, no-position/no-entry-order, max30 và master/route/rate
  gate giữ nguyên. Không sửa, hủy hay re-size order/vị thế đang mở; route ON/OFF và
  `enabledAt` không bị thay đổi trong lần cập nhật này.
- Thống kê: state lưu `filterDecisions` tối đa 30 ngày/5.000 quyết định để forward-test
  riêng các cohort `eligible`, `zone-not-rejected`, `deep-sweep`, `bidirectional-3d`;
  `directionHistory` chỉ giữ cửa sổ 3 ngày. Đây là decision cohort, chưa tự suy diễn
  W/L hoặc hiệu quả. Closed outcome/PnL thật vẫn lấy fill audit exact route. Không thêm
  card/label performance mới nên không tạo WHITELIST giả; policy checkbox mặc định OFF
  và chỉ hiện khi CLOSED `AvgROE >4%` giữ nguyên.
- Tương thích JSON cũ: event thêm `sweepDepthPct` và object `rejection`; state thêm
  `directionHistory`/`filterDecisions`. File state cũ được suy lịch sử hướng từ các
  attempt BUY/SELL còn đọc được; consumer cũ có thể bỏ qua field mới. Event cũ thiếu
  version/filter field sẽ fail closed, không replay/backfill; trade/fill/control cũ
  không bị rewrite.

### 2026-09-27 — POST_MOVE_IMPULSE_5M_MARKET_8USDT_MAX50_V3_20260927 · tăng trần vị thế

- Version executor `POST_MOVE_IMPULSE_5M_MARKET_8USDT_MAX50_V3_20260927`, policy
  `LIVE_CARD_POST_MOVE_IMPULSE_MAX50_V41_20260927`. Chỉ áp dụng hai exact route
  `POST_DUMP_NO_SELL_BUY_IMPULSE_LONG/LONG` và
  `POST_PUMP_NO_BUY_SELL_IMPULSE_SHORT/SHORT` của source `post-move-impulse`.
- Dữ liệu trước entry và phân loại không đổi: nến 15m/5m đã đóng, chỉ stage
  `BUY_IMPULSE` vàng hoặc `SELL_IMPULSE` cam; signal sau startup/`enabledAt`, tuổi
  `<=90s`, MARK drift `<=0,5%`, không position/entry order cùng symbol và dedupe exact.
- Binance thay đổi duy nhất: `maxOpenPositions` của hai route tăng từ `30` lên `50`.
  Size vẫn `8 USDT margin ×5 = 40 USDT notional`, MARKET, TP `+10% ROE`, SL LONG
  `-20%`, SL SHORT `-30%`, protection neo full fill. Không mở bù tín hiệu đã bị chặn,
  không replay AWE/DYDX cũ, không sửa/hủy vị thế hoặc order hiện hữu và không đổi
  giới hạn của các route khác.
- Thống kê/fill audit exact route giữ nguyên; không thêm label/card performance hoặc
  WHITELIST. Checkbox card vẫn mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%`.
- Tương thích JSON: state attempts cũ được giữ nguyên khi version nâng V3; plan mới
  chỉ thay field `maxOpenPositions=50`. Controls, trade, fill và watch JSON không
  migrate/rewrite/backfill; payload cũ có max30 bị policy V41 fail closed.

### 2026-09-27 — POST_MOVE_CONFIRMATION_5M_MARKET_8USDT_MAX50_V4_20260927 · chờ xác nhận mới MARKET

- Versions đang chạy: watch LONG
  `POST_DUMP_NO_SELL_WATCH_V2_CONFIRMATION_ENTRY_20260927`, watch SHORT
  `POST_PUMP_NO_BUY_WATCH_V2_CONFIRMATION_ENTRY_20260927`, executor
  `POST_MOVE_CONFIRMATION_5M_MARKET_8USDT_MAX50_V4_20260927`, Discord V4, policy
  `LIVE_CARD_POST_MOVE_CONFIRMATION_MAX50_V42_20260927` và controls
  `AUTO_ENTRY_CONTROLS_V26_POST_MOVE_CONFIRMATION_8USDT_20260927`.
- Dữ liệu dùng trước entry vẫn hoàn toàn causal và chỉ dùng nến đã đóng: bối cảnh
  pump/dump 15m trong 24 giờ, vùng nền và impulse 5m, sau đó **2–3 nến 5m đã đóng**.
  SHORT xác nhận khi hồi `<=35%` thân xả, volume trung bình `<=0,60x` cây xả,
  taker-buy `<=45%`, không lấy lại đáy vùng/EMA13 và tạo lower-high. LONG đối xứng:
  pullback `<=35%` thân hồi, volume `<=0,60x`, taker-sell `<=45%`, giữ đỉnh
  vùng/EMA13 và tạo higher-low.
- Phân loại/gate thật: `SELL_IMPULSE` cam và `BUY_IMPULSE` vàng là **OBSERVE ONLY**,
  vẫn gửi Discord nhưng `executionCandidate=false`. Chỉ `NO_BUY_CONFIRMATION` đỏ
  mới xét MARKET SHORT và `NO_SELL_CONFIRMATION` xanh mới xét MARKET LONG với
  `executionCandidate=true`. `LATE_NO_CHASE`, xác nhận thất bại hoặc version cũ đều
  fail closed. Cả impulse gốc và confirmation phải mới hơn startup/`enabledAt`;
  confirmation `<=90s`, MARK drift `<=0,5%`, no-position/no-entry-order và exact
  dedupe vẫn bắt buộc.
- Ảnh hưởng Binance chỉ là **dời thời điểm vào lệnh mới** từ cảnh báo sớm sang xác
  nhận. Exact route/key và trạng thái ON/OFF được giữ nguyên; cấu hình hiện hữu vẫn
  MARKET `8 USDT margin ×5 = 40 USDT notional`, TP `+10% ROE`, SL LONG `-20%`,
  SL SHORT `-30%`, protection neo full fill và `maxOpenPositions=50`. Không sửa/hủy
  order hay vị thế đang mở, không đặt lại cảnh báo cũ và không thay logic SL/TP.
- Thống kê tiếp tục dùng exact fill audit của hai route cũ; closed outcome/net PnL
  theo vị thế thật và không tính DCA. Vì key route không đổi, lịch sử entry sớm V3
  và entry sau xác nhận V4 cùng nằm trong thống kê route, còn version/reason phân biệt
  từng cohort khi audit. Không tạo label/card performance mới, nên không thêm
  WHITELIST; checkbox hiện hữu vẫn mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%`.
- Tương thích JSON: route key, controls settings, attempt/fill/trade cũ vẫn đọc được.
  Watch V2 đổi nghĩa additive của `executionCandidate`; executor yêu cầu đúng version
  V2 nên watch/cache V1 fail closed, không migrate/backfill/replay. Consumer cũ có thể
  bỏ qua field; state attempts cũ được giữ và tiếp tục chặn trùng theo impulse gốc.

### 2026-09-27 — POST_MOVE_SHORT_CONFIRMATION_LONG_IMPULSE_5M_MARKET_8USDT_MAX50_V5_20260927 · chỉ SHORT chờ xác nhận

- Đây là rule hiện hành thay V4 theo xác nhận của operator. Versions: LONG watch
  `POST_DUMP_NO_SELL_WATCH_V3_LONG_IMPULSE_ENTRY_20260927`, SHORT watch giữ
  `POST_PUMP_NO_BUY_WATCH_V2_CONFIRMATION_ENTRY_20260927`, executor V5, LONG
  Discord V5, SHORT Discord V4, policy
  `LIVE_CARD_SHORT_CONFIRMATION_LONG_IMPULSE_MAX50_V43_20260927` và controls V27.
- Dữ liệu trước entry/phân loại không đổi: chỉ pump/dump 15m, base/EMA/impulse 5m
  và nến 5m đã đóng, hoàn toàn causal. LONG dùng cây `BUY_IMPULSE` đạt range/volume/
  taker-buy/break base như V3. SHORT cảnh báo `SELL_IMPULSE` chỉ quan sát; phải chờ
  2–3 nến xác nhận rebound `<=35%`, volume `<=0,60x`, taker-buy `<=45%`, không
  reclaim base/EMA13 và lower-high mới thành `NO_BUY_CONFIRMATION`.
- Gate Binance hiện hành: LONG `BUY_IMPULSE` màu vàng vẫn xét MARKET ngay như trước;
  `NO_SELL_CONFIRMATION` màu xanh chỉ gửi Discord, không vào lần hai. SHORT
  `SELL_IMPULSE` màu cam chỉ gửi Discord; `NO_BUY_CONFIRMATION` màu đỏ mới xét
  MARKET. `LATE_NO_CHASE` cả hai hướng không entry. Cả hai Discord vẫn phát stage
  sớm và stage xác nhận với màu khác nhau.
- Size/protection không đổi: exact route giữ nguyên ON/OFF và `enabledAt`; MARKET
  `8 USDT margin ×5`, TP `+10% ROE`, SL LONG `-20%`, SL SHORT `-30%`, full-fill
  protection, max50, freshness 90 giây, drift 0,5%, no-position/no-entry-order và
  exact dedupe. Không sửa/hủy vị thế hay order đang mở, không đổi SL/TP hiện hữu.
- Thống kê vẫn là exact fill audit của route cũ; V3/V4/V5 phân cohort bằng entry
  reason/version. Không thêm label/card mới nên không thêm WHITELIST; checkbox route
  giữ nguyên, policy card vẫn mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%`.
- Tương thích JSON: route/settings/attempts/fill/trade cũ vẫn đọc được. LONG watch
  V3 và SHORT watch V2 được executor kiểm exact version; cache watch khác version
  fail closed, không migrate/backfill/replay. Field `executionCandidate` vẫn additive.

### 2026-09-27 — POST_MOVE_SHORT_CONFIRMATION_LONG_IMPULSE_5M_MARKET_5USDT_MAX50_V6_20260927 · giảm size còn 5 USDT

- Versions: executor V6 `MARKET_5USDT`, catalog
  `OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V15_POST_MOVE_IMPULSE_5USDT_20260927`,
  policy `LIVE_CARD_POST_MOVE_5USDT_MAX50_V44_20260927`, controls V28, LONG
  Discord V6 và SHORT Discord V5.
- Dữ liệu trước entry và điều kiện phân loại **không đổi so với V5**: LONG vẫn xét
  `BUY_IMPULSE` vàng ngay; confirmation xanh chỉ Discord. SHORT `SELL_IMPULSE` cam
  chỉ Discord và phải chờ `NO_BUY_CONFIRMATION` đỏ sau 2–3 nến 5m đóng. Không dùng
  outcome/PnL/nến tương lai; `LATE_NO_CHASE` không entry.
- Binance chỉ đổi size của **lệnh mới** trên hai exact route từ `8` xuống
  `5 USDT margin`; leverage giữ `5x`, nên notional từ `40` xuống `25 USDT`.
  MARKET, TP `+10% ROE`, SL LONG `-20%`, SL SHORT `-30%`, max50, freshness, drift,
  no-position/no-order, dedupe và full-fill protection giữ nguyên. Không resize,
  đóng, sửa TP/SL hay hủy order/vị thế đang mở.
- Thống kê vẫn dùng exact fill audit route cũ; size/version trong entry reason cho
  phép tách cohort 8 USDT và 5 USDT. Không thêm label/card/WHITELIST; checkbox route
  giữ trạng thái hiện hữu và policy card vẫn mặc định OFF, chỉ hiện khi CLOSED
  AvgROE `>4%`.
- Tương thích JSON: migration V15 chỉ đổi `marginUsdt=8` thành `5` cho đúng hai route,
  giữ `enabled`, `enabledAt`, leverage và TP. Giá trị khác 8 không bị ghi đè. JSON
  watch/attempt/fill/trade cũ vẫn đọc được; payload 8 USDT cũ fail closed theo policy
  V44 và không replay/backfill.

### 2026-09-27 — BTC_IMPULSE_REGIME_OBSERVE_V1_20260927 · card đánh giá `_IMPULSE` theo BTC

- Đầu `/btc-session-watch.html` có card live phân `SW_UP`, `SW_DOWN`, `NEUTRAL`,
  `SHOCK` hoặc `STALE`. Dữ liệu dùng trước đánh giá chỉ lấy từ `/api/btc-health`:
  `updatedAt`, hướng/điểm 1h và 4h, `emaTrend1h`, `bullPoints`, `bearPoints`,
  `macroShock`, `btcSpike`/`btcSpikeAlert`; không đọc PnL, outcome hoặc nến tương lai.
- `SW_UP` cần 1h UP điểm `>=55`, EMA1h `above`, 4h không DOWN mạnh (DOWN chỉ được
  xem là chưa chặn khi score4h `<55`), bull `>=2`, bear `<=1`; `SW_DOWN` đối xứng.
  Shock/spike ưu tiên `SHOCK`; health cũ quá 120 giây là `STALE`; còn lại `NEUTRAL`.
  Card xanh ưu tiên đánh giá LONG, đỏ ưu tiên SHORT, vàng/chờ yêu cầu confirmation.
- Đây là **OBSERVE ONLY**, không phải gate giao dịch thật. Không đổi runner hiện hành:
  LONG `BUY_IMPULSE` vẫn có thể xét MARKET; SHORT vẫn chỉ xét sau
  `NO_BUY_CONFIRMATION`. Không đổi entry, size `5 USDT`, leverage, TP, SL, max50,
  route ON/OFF, Discord hoặc position/order đang mở.
- Thống kê card chưa có closed cohort riêng. Exact WHITELIST keys
  `btc-session:IMPULSE:{SW_UP|SW_DOWN|NEUTRAL|SHOCK|STALE}` đã nối UI/runtime,
  mặc định OFF và ẩn vì chưa có CLOSED AvgROE `>4%`; card không tự cấp quyền Binance.
- Tương thích JSON: không migration. Snapshot tùy chọn
  `btcImpulseRegimeObservation={version,regime}` chỉ được runtime matcher nhận khi
  version khớp; trade/health JSON cũ thiếu field vẫn đọc bình thường và không có key.

### 2026-09-27 — POST_MOVE_IMPULSE_CONFIRMATION_DISCORD_V1_DEDICATED_20260927 · kênh xác nhận riêng

- Thêm webhook riêng `POST_MOVE_IMPULSE_CONFIRMATION_DISCORD_WEBHOOK_URL`. Dữ liệu
  dùng trước thông báo vẫn là watch causal hiện hành từ nến 15m/5m đã đóng; không
  đọc PnL, outcome hoặc nến tương lai và không phát lại lịch sử lúc khởi động.
- Chỉ hai phân loại được chuyển tiếp: LONG đúng `NO_SELL_CONFIRMATION` và SHORT đúng
  `NO_BUY_CONFIRMATION`, đồng thời bắt buộc `watchOnly=true` và
  `binanceEligible=false`. `BUY_IMPULSE`, `SELL_IMPULSE`, `LATE_NO_CHASE`, side sai
  hoặc payload không an toàn đều bị loại khỏi kênh riêng.
- Thống kê/dedupe dùng hai state độc lập
  `post-move-impulse-confirmation-{long|short}-discord.json`, nên một confirmation
  có thể vẫn xuất hiện ở feed cũ và thêm một lần ở feed riêng nhưng không lặp trong
  chính feed riêng. Không thêm nhãn/card thống kê mới, vì vậy không thêm WHITELIST.
- Ảnh hưởng Binance: không. LONG vẫn vào sớm tại `BUY_IMPULSE`; confirmation LONG
  chỉ thông báo. SHORT vẫn chỉ xét MARKET tại `NO_BUY_CONFIRMATION` theo route hiện
  hành. Size 5 USDT ×5, entry, TP, SL, max50, route ON/OFF và vị thế/order hiện hữu
  không đổi.
- Tương thích JSON: notifier state mới độc lập, thiếu file sẽ khởi tạo `events=[]`;
  state/watch cũ không migration và không replay. Biến môi trường trống thì fail
  closed, không gửi kênh riêng.

### 2026-09-27 — POST_MOVE_IMPULSE_CANDLE_DISCORD_V1_DEDICATED_20260927 · kênh cảnh báo sớm vàng/cam riêng

- Thêm webhook riêng `POST_MOVE_IMPULSE_CANDLE_DISCORD_WEBHOOK_URL`. Dữ liệu trước
  thông báo giữ nguyên watch causal hiện hành: nhịp pump/dump 15m, vùng base/EMA và
  cây impulse 5m đã đóng; không dùng PnL, outcome hoặc nến tương lai.
- Kênh mới chỉ nhận hai phân loại đã có: LONG đúng `BUY_IMPULSE` (embed vàng
  `HỒI MẠNH SAU XẢ · CẢNH BÁO SỚM`) và SHORT đúng `SELL_IMPULSE` (embed cam
  `XẢ MẠNH SAU BƠM · CẢNH BÁO SỚM`). Cả hai còn phải có `watchOnly=true` và
  `binanceEligible=false`. `NO_SELL_CONFIRMATION`, `NO_BUY_CONFIRMATION`,
  `LATE_NO_CHASE`, side sai hoặc payload không an toàn không được chuyển tiếp.
- Thống kê/dedupe dùng state độc lập
  `post-move-impulse-candle-{long|short}-discord.json`. Notifier chỉ nhận event mới
  sinh sau lúc process khởi động, giới hạn tuổi 12 phút và không backfill/replay.
  Feed cũ vẫn hoạt động nên cùng một impulse có thể xuất hiện ở feed cũ và feed
  riêng, nhưng không lặp trong chính feed riêng.
- Ảnh hưởng Binance/entry/size/SL/TP: **không**. Đây chỉ là chuyển tiếp Discord;
  LONG `BUY_IMPULSE` và SHORT confirmation vẫn theo executor/route hiện hành,
  margin 5 USDT ×5, TP/SL/max50, route ON/OFF và vị thế/order đang mở không đổi.
- Tương thích JSON: state mới là additive, thiếu file sẽ khởi tạo `events=[]`; watch,
  attempt, fill và trade JSON cũ không migration. Webhook thiếu/sai thì fail closed.
  Không thêm nhãn/card mới nên không thêm WHITELIST; checkbox/rule CLOSED AvgROE
  `>4%` hiện hành không đổi.
### 2026-09-28 — COIN_SUPPLY_PROFILE_V1_20260928 · hồ sơ cung trên Coin Level

- `/coin-level-analysis` hiển thị thêm market cap ước tính, cung lưu hành, tổng cung,
  cung tối đa, tỷ lệ lưu hành/max và volume/market-cap 24h. Dữ liệu supply/volume
  lấy từ CoinGecko `coins/markets`, cache 6 giờ; market cap hiển thị được ước tính
  bằng MARK Binance hiện tại × cung lưu hành. Nguồn lỗi/timeout/429 được cache âm
  15 phút và fail-open cho giao diện, không làm Coin Level ngừng tải.
- Phân loại chỉ dùng dữ liệu có trước thời điểm hiển thị: `<=20M` token lưu hành là
  `VERY_LOW_UNIT_SUPPLY`, và khi market cap `>=500M USD` là
  `LARGE_CAP_VERY_LOW_UNIT_SUPPLY`; `>20M..100M` là `LOW_UNIT_SUPPLY`,
  `>100M..500M` là trung bình, lớn hơn là rộng. Màu đỏ/cam làm nổi bật hai nhóm
  đầu. Đây là cảnh báo số lượng đơn vị token thấp, **không** khẳng định order book
  mỏng; phải đối chiếu volume và depth Binance.
- Thống kê trên card là snapshot hiện tại, không backtest và không dùng PnL/outcome:
  turnover CoinGecko = volume 24h / market cap nguồn; API còn trả
  `binanceTurnoverPct` để chẩn đoán nhưng UI không biến nó thành xác suất quét.
- Ảnh hưởng Binance/entry/size/SL/TP: **không**. Snapshot gắn rõ `observeOnly=true`
  và toàn bộ execution flags false; không sửa route, order hay vị thế đang mở.
- Tương thích JSON: field top-level `supplyProfile` là additive; snapshot/cache cũ
  thiếu field vẫn đọc được và UI hiện trạng thái chưa có dữ liệu. Không migration.
  Đây không phải label/card giao dịch nên không thêm WHITELIST; policy checkbox mặc
  định OFF và điều kiện CLOSED AvgROE `>4%` không thay đổi.
### 2026-09-28 — COIN_SUPPLY_MARKET_V2_ID_DIRECTORY_20260928 · trang thống kê cung thấp toàn Binance Futures

- Thêm `/low-supply-market` và API `/api/low-supply-market`. Universe lấy danh sách
  hợp đồng Binance USDT perpetual đang `TRADING`, sau đó giao cắt symbol với
  CoinGecko `coins/markets`. Scanner lấy Top 250 trước để không bỏ sót nhóm cap lớn,
  rồi dùng directory `coins/list` và batch tối đa 220 coin id tuần tự; snapshot
  persist ở `data/coin-supply-market.json`, cache 6 giờ và retry
  sau 15 phút nếu có batch lỗi. API luôn công bố coverage/thiếu/batch lỗi.
- Bộ lọc mặc định đúng yêu cầu: market cap `>=4.000.000.000 USD` và circulating
  supply `<15.000.000 token`; mặc định sắp cung lưu hành tăng dần. UI còn cho sort
  `circulating/max` tăng dần, cap/turnover/biến động 24h và đổi ngưỡng lọc. Nếu
  trùng symbol CoinGecko, chọn asset có market cap lớn nhất và không suy dữ liệu
  cho symbol không match.
- Dữ liệu dùng chỉ là snapshot hiện tại trước mọi entry: cap, price, circulating,
  total/max supply, volume và change24h từ CoinGecko; không dùng PnL/outcome/nến
  tương lai. Số match là thống kê mô tả trong phần universe đã phủ, không phải
  WinRate hay xác suất quét. Mỗi hàng nối Coin Level để kiểm tra MARK/depth Binance.
- Ảnh hưởng Binance/entry/size/SL/TP/Discord: **không**. API trả
  `observeOnly=true` và toàn bộ execution flags false; không thêm route hay order.
- Tương thích JSON: đây là cache/state file mới, additive, không migrate trade/cache
  cũ; file thiếu/sai version được dựng lại. Đây không phải label/card giao dịch nên
  không có runtime matcher hoặc WHITELIST mới; policy checkbox OFF và chỉ hiện khi
  CLOSED AvgROE `>4%` vẫn nguyên vẹn.

### 2026-09-28 — LOW_SUPPLY_MARKET_UI_V2_COLUMN_SORT_20260928 · sort trực tiếp trên table

- `/low-supply-market` cho phép bấm mọi tiêu đề dữ liệu để sort hai chiều; cột đang
  dùng hiện `↑/↓`, còn cột chưa chọn hiện `↕`. Các cột gồm coin, phân loại, cap,
  circulating/total/max supply, circulating/max, volume, turnover, change24h và
  thời gian nguồn. Sort mặc định vẫn circulating tăng dần; ô thiếu luôn nằm cuối.
- Dữ liệu trước hiển thị, điều kiện phân loại và cách thống kê không đổi so với
  `COIN_SUPPLY_MARKET_V2_ID_DIRECTORY_20260928`; thao tác chỉ sắp lại snapshot đã
  lọc trên trình duyệt, không bổ sung hoặc loại coin khỏi provider coverage.
- Ảnh hưởng Binance/entry/size/SL/TP/Discord: **không**; vẫn `OBSERVE ONLY` và không
  tạo route/gate/order. JSON/cache/API cũ tương thích hoàn toàn vì không đổi schema.
  Đây không phải trading label/card nên không thêm WHITELIST; policy mặc định OFF
  và CLOSED AvgROE `>4%` giữ nguyên.

### 2026-09-28 — LOW_SUPPLY_MARKET_MENU_V1_ALL_PAGES_20260928 · đồng bộ menu

- Thêm liên kết `/low-supply-market` với nhãn `Cung thấp` hoặc `Thị trường cung thấp`
  vào toàn bộ page/menu hiện có liên kết Liquid Flow V2, bao gồm các màn V2, scanner,
  thống kê, paper và quản lý Binance. Test quét toàn bộ `public/*.html` để ngăn menu
  mới bị thiếu khi một trang còn tham chiếu Liquid Flow V2.
- Không đổi dữ liệu trước entry, phân loại, cách thống kê hoặc snapshot; đây chỉ là
  điều hướng tới thống kê supply hiện có. Không ảnh hưởng Binance/entry/size/SL/TP/
  Discord và không đổi schema JSON/cache. Không tạo trading label/card/WHITELIST;
  policy mặc định OFF cùng CLOSED AvgROE `>4%` giữ nguyên.

### 2026-09-28 — VERY_STRONG_ENTRY_WATCH_UI_V1_BTC_CONTEXT_20260928 · danh sách RẤT MẠNH chờ BTC

- Thêm `/very-strong-entry-watch`, chỉ gom candidate Coin Level còn hiệu lực có
  `entryTier=VERY_STRONG` (Entry Score `>=80`). Scanner trả thêm additive field
  `veryStrongCandidates` trước giới hạn top30; setup vẫn phải là nến đã đóng, 15m/
  1h đồng hướng, chưa mất mốc và confirmation không quá 45 phút.
- Bối cảnh SHORT đẹp trên UI yêu cầu BTC health mới <=120 giây, trend 1h + 4h cùng
  DOWN, EMA1h dưới và Market Regime `allowShortEntry=true`; LONG dùng điều kiện UP
  đối xứng. Trạng thái tách cửa sổ LIMIT/MARKET mới <=90 giây, chờ retest mới và
  retest đã cũ. Đây là đánh giá timing, không phải xác suất thắng.
- Ảnh hưởng Binance/entry/size/SL/TP/Discord: **không**. Trang là `OBSERVE ONLY`,
  không submit/cancel order, không thay route/size/protection hoặc vị thế đang mở.
  Executor cũ vẫn quyết định độc lập bằng khóa tổng, route, freshness và order state.
- Tương thích JSON: hai field `veryStrongCandidates` và `totalVeryStrongCandidates`
  chỉ bổ sung; UI fallback về `candidates` nếu đọc snapshot cũ. Không có signal label/
  runtime matcher mới nên không tạo WHITELIST; exact label `VERY_STRONG` hiện hữu và
  policy checkbox CLOSED AvgROE `>4%` không bị đổi.
# VERY_STRONG_TREND_POOL_V1_BTC_WAVE_OBSERVE_20260928

- **Version:** `VERY_STRONG_TREND_POOL_V1_BTC_WAVE_OBSERVE_20260928`; UI `VERY_STRONG_ENTRY_WATCH_UI_V2_TREND_POOL_BTC_WAVE_20260928`.
- **Dữ liệu dùng trước entry:** chỉ nến đã đóng 5m/15m/1h/4h, Trend Score/Entry Score và volume breakout của tín hiệu Coin Level gốc, volume 5m/15m hiện tại, EMA13/25 1h/4h, BTC health 1h/4h và Market Regime. Giá socket chỉ dùng hiển thị khoảng cách tới vùng; không tự biến nến đang chạy thành xác nhận.
- **Điều kiện vào pool:** giữ tối đa 24 giờ một coin/hướng nếu nguồn là `VERY_STRONG`, hoặc `|Trend Score| >= 24` cùng `breakoutVolumeRatio >= 1`. Cách thứ hai giúp giữ đúng các trường hợp như ORCA/EIGEN có xu hướng cực mạnh và volume tốt nhưng Entry Score tại thời điểm đầu chưa đạt 80.
- **Điều kiện còn xu hướng:** LONG cần 4h `UP`, 1h không `DOWN`, close không thủng EMA25 1h quá 0.5% và volume 15m trung bình ba nến gần nhất tối thiểu 0.55x median20; SHORT đối xứng. Mất cấu trúc/volume thì bản ghi không còn xuất hiện trong danh sách active.
- **Điểm vào theo sóng BTC:** LONG chỉ chuyển `READY_BTC_WAVE` khi BTC nghiêng/tăng đúng hướng và Market Regime cho LONG, giá nằm trong vùng động gần nhất (breakout gốc, EMA13/25 1h, EMA13 4h hoặc biên 15m), nến 5m tăng, taker-buy >=50% và volume 5m >=0.65x median20. SHORT dùng điều kiện đối xứng. BTC đi ngược chỉ hiện `WAIT_BTC_TURN`; không dùng entry cũ buổi sáng.
- **Thống kê:** page đếm pool còn active, số coin BTC đã thuận hướng, số đang chờ BTC và số đủ toàn bộ điều kiện `READY_BTC_WAVE`; sort theo ưu tiên bối cảnh, độ mạnh nguồn, thời gian và khoảng cách vùng.
- **Ảnh hưởng Binance:** `OBSERVE ONLY`; không gửi Discord, không submit/cancel Binance, không đổi entry/size/SL/TP. Executor Coin Level hiện hữu tiếp tục độc lập.
- **Tương thích JSON cũ:** API thêm `veryStrongTrendSources` và `veryStrongTrendPool`; client cũ bỏ qua field mới. UI mới fallback về `veryStrongCandidates` 45 phút nếu server cũ chưa có pool.
- **Warm-up:** bản ghi thiếu cache 1h/4h hiện `ĐANG NẠP NẾN`, không được coi là active/entry. Server chỉ làm ấm tối đa hai symbol mỗi lượt, dừng khi Binance REST đang congested/rate-limited và retry mỗi symbol sau tối thiểu 10 phút để không làm web chậm.
- **WHITELIST:** không thêm nhãn runtime/card giao dịch mới. `READY_BTC_WAVE` chỉ là trạng thái UI observe-only, không có matcher Binance nên không tạo checkbox WHITELIST.

# BTC_RELATIVE_STRENGTH_WATCH_V1_OPPOSITE_CONTEXT_OBSERVE_20260928

- **Version:** `BTC_RELATIVE_STRENGTH_WATCH_V1_OPPOSITE_CONTEXT_OBSERVE_20260928`; page `/btc-relative-strength-watch`.
- **Dữ liệu dùng trước entry:** tái sử dụng record còn active của `VERY_STRONG_TREND_POOL_V1`, chỉ gồm nến đã đóng 5m/15m/1h/4h, Trend Score hiện tại, volume breakout gốc, volume 5m/15m, taker 5m, vùng retest động và BTC health mới. MARK socket chỉ cập nhật giá/khoảng cách vùng; không dùng outcome, PnL hoặc nến tương lai.
- **Phân loại tab LONG:** `Coin mạnh khi BTC giảm` yêu cầu record LONG còn active, 1h + 4h cùng `UP`, `currentTrendScore >=14`; bối cảnh divergence chỉ active khi BTC là `DOWN_STRONG` hoặc `DOWN_LEAN`. Tab SHORT đối xứng: record SHORT, 1h + 4h `DOWN`, score `<=-14`, BTC `UP_STRONG` hoặc `UP_LEAN`.
- **Giá vào tham khảo:** khoảng cách thuận hướng từ MARK tới tâm vùng retest động không quá `1,2%` được coi là chưa chạy xa. Trên `1,2%` là `SÓNG ĐÃ CHẠY · KHÔNG ĐUỔI`; đi ngược vùng quá `1,2%` phải chờ reclaim/từ chối. Trạng thái cao nhất còn cần `coinTrigger=true`, tức nến 5m cùng hướng, taker phù hợp và volume 5m theo rule pool hiện hữu. Đây không phải lệnh MARKET.
- **Điểm/thống kê:** `relativeScore` là điểm xếp hạng mô tả 0–100 từ độ lớn current Trend Score (tối đa 50), volume nguồn (20), volume 15m (15), độ gần vùng (10) và xác nhận 5m (5). Page đếm candidate mỗi tab, bối cảnh BTC active, số chưa chạy quá 1,2% và số đủ điều kiện quan sát. Không diễn giải là WinRate.
- **Ảnh hưởng Binance/entry/size/SL/TP/Discord:** **không**. `allowLongEntry/allowShortEntry` được hiển thị trong BTC context nhưng cố ý không làm gate cho phép so sánh sức mạnh tương đối; page luôn `observeOnly=true`, `binanceEligible=false`, không submit/cancel order và không sửa protection/vị thế.
- **Tương thích JSON cũ:** không đổi schema server hay state; client đọc additive `veryStrongTrendPool.records` hiện hữu. Snapshot cũ thiếu pool trả danh sách rỗng, không crash và không migration.
- **WHITELIST:** hai tab và các dòng trạng thái là phép chiếu UI observe-only, không tạo signal label/runtime matcher/card giao dịch mới; do đó không có checkbox mới. Policy WHITELIST mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%` giữ nguyên.

# BTC_RELATIVE_STRENGTH_DISCORD_V1_NEAR_READY_20260928

- **Version:** `BTC_RELATIVE_STRENGTH_DISCORD_V1_NEAR_READY_20260928`; webhook riêng qua `BTC_RELATIVE_STRENGTH_DISCORD_WEBHOOK_URL`, quét cùng nhịp snapshot Coin Level 30 giây.
- **Dữ liệu dùng trước cảnh báo:** đúng snapshot causal của `BTC_RELATIVE_STRENGTH_WATCH_V1`: pool còn hiệu lực, nến đã đóng 5m/15m/1h/4h, Trend Score, volume/taker, vùng retest động và BTC health; MARK live chỉ dùng để đo khoảng cách vùng. Không dùng PnL, outcome hoặc nến tương lai.
- **Điều kiện phân loại/gửi:** chỉ gửi khi bối cảnh ngược BTC của tab đang active, setup chưa hết hạn, MARK/vùng entry hợp lệ và trạng thái là `WAIT_5M_CONFIRM` (`GẦN VÙNG · CHỜ 5M`) hoặc `RELATIVE_ENTRY_READY` (`ĐỦ ĐIỀU KIỆN QUAN SÁT`). Payload làm nổi bật vùng bằng khối xanh LONG/đỏ SHORT, kèm giá live, độ lệch, điểm tương đối, 1h/4h coin, BTC và phần xác nhận 5m còn thiếu/đã đạt.
- **Thống kê/dedupe:** event id là `symbol|side|confirmationAt|stage`; mỗi setup tối đa hai thông báo có ý nghĩa: một lần khi gần vùng và một lần khi nâng cấp sang đủ điều kiện. State giữ tối đa 7 ngày/2.000 record; mặc định tối đa 5 tin mỗi scan và tôn trọng Discord rate limit. Đây là thống kê delivery, không phải WinRate.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. Feed là `OBSERVE ONLY`, không submit/cancel Binance, không đổi entry, size, leverage, SL/TP hoặc protection/vị thế hiện hữu.
- **Tương thích JSON:** API chỉ thêm boolean `btcRelativeStrengthDiscordConfigured`; consumer cũ bỏ qua an toàn. Delivery dùng file mới `data/btc-relative-strength-discord.json`; thiếu file tự tạo, không migrate/chạm state giao dịch cũ.
- **WHITELIST:** dùng lại hai trạng thái UI observe-only, không thêm runtime matcher/card trading nên không có checkbox mới. Policy mặc định OFF và điều kiện CLOSED `AvgROE >4%` không đổi.

# BTC_RELATIVE_STRENGTH_READY_MARKET_2USDT_MAX50_V1_20260928

- **Versions đang chạy:** model/UI `BTC_RELATIVE_STRENGTH_WATCH_V2_READY_BINANCE_2USDT_20260928`; executor `BTC_RELATIVE_STRENGTH_READY_MARKET_2USDT_MAX50_V1_20260928`; policy `LIVE_CARD_BTC_RELATIVE_2USDT_MAX50_V45_20260928`; controls V29; route settings V16; Discord `BTC_RELATIVE_STRENGTH_DISCORD_V2_READY_BINANCE_STATUS_20260928`.
- **Dữ liệu dùng trước entry:** pool xu hướng còn hiệu lực, chỉ nến đã đóng 5m/15m/1h/4h; Trend Score hiện tại, volume nguồn, volume 5m/15m, taker-buy của nến 5m đóng, vùng retest động và BTC health mới. Field mới `lastClosed5mAt` giữ riêng thời điểm nến xác nhận, không bị MARK socket ghi đè. MARK live chỉ kiểm tra giá trước submit; không dùng PnL/outcome hoặc nến tương lai.
- **Điều kiện phân loại/pass:** LONG cần record active, 1h+4h `UP`, Trend Score `>=14`, BTC `DOWN_STRONG/DOWN_LEAN`, giá cách tâm vùng động tuyệt đối `<=1,2%`, và `coinTrigger=true` từ nến 5m đóng (nến tăng, taker-buy `>=50%`, volume 5m `>=0,65x`). SHORT đối xứng với 1h+4h `DOWN`, score `<=-14`, BTC `UP_STRONG/UP_LEAN`, nến giảm/taker-buy `<=50%`. Chỉ exact key `RELATIVE_ENTRY_READY` có quyền executor; `WAIT_5M_CONFIRM`/“gần vùng” vẫn Discord-only.
- **Freshness/no replay:** nến xác nhận 5m phải mới `<=90 giây`, phải đóng sau cả thời điểm process khởi động và `enabledAt` của route; snapshot đánh giá mới `<=60 giây`; MARK không lệch giá snapshot quá `0,5%` và tại submit vẫn còn cách tâm vùng `<=1,2%`. Tín hiệu có trước lúc bật bị baseline/fail-closed, không replay. Dedupe theo `symbol|side|confirmationAt|lastClosed5mAt`, cooldown symbol 4 giờ, chặn khi đã có position hoặc entry order và không DCA.
- **Binance/size/TP/SL:** hai route Auto Controls exact `btc-relative-strength-watch / opposite-btc-5m / RELATIVE_ENTRY_READY / LONG|SHORT`, được bật theo yêu cầu hiện tại. MARKET dùng `2 USDT margin ×5` (`10 USDT notional`), TP `+10% ROE`, SL LONG `−20% ROE`, SL SHORT `−30% ROE`, protection neo lại theo full-fill, tối đa 50 vị thế. Khóa tổng và route hướng được kiểm tra lại ngay trước submit; policy private-symbol authorization ngăn payload giả mạo.
- **Thống kê:** state `data/btc-relative-strength-binance.json` giữ attempt/status và symbol cooldown 7 ngày; Auto Controls/Filled Signal Audit tiếp tục thống kê entry/closed PnL theo exact route. Đây chưa phải backtest/WinRate và không suy hiệu quả từ số thông báo Discord.
- **Tương thích JSON:** API chỉ thêm object `btcRelativeStrengthBinanceExecution`; client cũ bỏ qua. Pool cũ thiếu `lastClosed5mAt` vẫn hiển thị nhưng executor fail-closed, không đặt lệnh; snapshot mới tự bổ sung field. State executor là file mới, không migrate/chạm order/trade state cũ. Discord state V1 được giữ record/dedupe khi nâng V2, không replay toàn bộ.
- **WHITELIST:** không tạo nhãn/card thống kê mới; executor dùng lại exact state key `RELATIVE_ENTRY_READY` và được quản lý bằng hai checkbox route trong `/binance-auto-controls`. Vì không có cohort/card CLOSED riêng để chứng minh `AvgROE >4%`, không tạo checkbox Liquid Card WHITELIST giả; policy WHITELIST hiện hữu vẫn mặc định OFF và matcher cũ không đổi.

# BTC_RELATIVE_STRENGTH_READY_MARKET_2USDT_TP_ONLY_MAX50_V2_20260928

- **Versions:** executor `BTC_RELATIVE_STRENGTH_READY_MARKET_2USDT_TP_ONLY_MAX50_V2_20260928`; policy `LIVE_CARD_BTC_RELATIVE_TP_ONLY_2USDT_MAX50_V46_20260928`; model/UI `BTC_RELATIVE_STRENGTH_WATCH_V3_READY_BINANCE_2USDT_TP_ONLY_20260928`; Discord `BTC_RELATIVE_STRENGTH_DISCORD_V3_READY_BINANCE_TP_ONLY_20260928`.
- **Dữ liệu trước entry và phân loại:** giữ nguyên V1: exact `RELATIVE_ENTRY_READY`, pool active, nến đóng 5m/15m/1h/4h, Trend Score ±14, volume/taker 5m, vùng động, BTC context ngược hướng, freshness <=90 giây, mark drift <=0,5%, khoảng cách vùng <=1,2%, no replay/no DCA/cooldown 4 giờ/max50. Không dùng PnL, outcome hoặc dữ liệu tương lai.
- **Thống kê:** route key/label và cách ghi attempt/fill/closed PnL giữ nguyên để chuỗi thống kê không bị tách. Version plan đổi để audit nhận biết cohort TP-only; không diễn giải delivery/attempt thành WinRate.
- **Binance/entry/size/SL/TP:** MARKET `2 USDT margin ×5`, TP `+10% ROE` neo theo full-fill và toàn bộ gate cũ giữ nguyên. Cả LONG lẫn SHORT ép `stopLossPrice`, `stopLossRoePct`, `stopLossDistanceFraction`, `protectionSignalStopLossPrice` về `null`; private policy fail-closed nếu payload cố gắn bất kỳ SL gốc nào. Thay đổi chỉ áp dụng entry mới, không hủy SL/order hay sửa position đã mở. Profit-lock chung sau khi vị thế đã có lãi vẫn được phép đặt SL bảo vệ lợi nhuận.
- **Tương thích JSON/WHITELIST:** không đổi schema state/API và không migration; record cũ vẫn đọc. Không tạo nhãn/card/runtime matcher mới nên không thêm checkbox WHITELIST; policy mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%` giữ nguyên.

# AUTO_BTC_LONG_ENTRY_GUARD_V1_RELATIVE_STRENGTH_EXCEPTION_20260928

- **Version:** `AUTO_BTC_LONG_ENTRY_GUARD_V1_RELATIVE_STRENGTH_EXCEPTION_20260928`; có cổng sớm trong `placeOrder` sau private authorization và một lớp defense-in-depth bọc signed Binance client để phủ cả executor legacy đi trực tiếp, đều chạy trước entry submit.
- **Dữ liệu dùng trước entry:** snapshot causal hiện tại của `COIN_LEVEL_MARKET_REGIME_GUARD_V1_20260922`, tổng hợp breadth 15m/30m đã đóng, taker-buy, Market Breadth Shock `DUMP_WATCH/DANGER`, độ mới socket/snapshot và quiet/confirmation window. Không dùng PnL, outcome hoặc nến tương lai.
- **Điều kiện phân loại/gate:** lệnh `BUY` tự động chỉ qua khi `marketRegime.allowLongEntry === true`. Vì vậy `RISK_OFF`, `RECOVERY_TEST`, `WAIT_DATA` hoặc dữ liệu cũ/thiếu đều fail-closed. `SELL`, reduce-only TP/SL/close, lệnh tay đã xác thực và dry-run không bị chặn. Ngoại lệ duy nhất là LONG đã được private policy xác thực bằng reason exact `BTC_RELATIVE_STRENGTH_READY_MARKET_2USDT_MAX50`; cổng sớm truyền quyền miễn qua một marker `Symbol` không enumerable cho lớp signed-client, nên chỉ chép `source/stream/label` công khai không thể giả ngoại lệ.
- **Thống kê:** không tạo cohort/WinRate mới; lỗi bị chặn mang code `AUTO_LONG_BLOCKED_BTC_MARKET_REGIME`, kèm state/reason hiện tại trong log executor hiện hữu. Thống kê route/attempt cũ giữ nguyên.
- **Ảnh hưởng Binance/entry/size/SL/TP:** chặn **entry LONG tự động mới** của mọi nguồn khác trong giai đoạn BTC/market chưa cho LONG. Không hủy pending order đã tồn tại, không đóng/sửa position, không đổi size/leverage/TP/SL/protection và không ảnh hưởng SHORT. Route `btc-relative-strength-watch` tiếp tục MARKET 2 USDT theo rule riêng vì mục tiêu chính là coin mạnh ngược BTC.
- **Tương thích JSON:** không đổi JSON/API/state và không migration; guard chỉ đọc snapshot runtime hiện hữu. Không thêm label/card thống kê nên không tạo checkbox WHITELIST mới; policy mặc định OFF và điều kiện CLOSED `AvgROE >4%` giữ nguyên.

# BTC_RELATIVE_STRENGTH_SHORT_ON_BTC_DOWNTREND_PULLBACK_V4_20260928

- **Versions:** BTC pullback detector `BTC_RELATIVE_BTC_PULLBACK_5M_CLOSED_V1_20260928`; model/UI `BTC_RELATIVE_STRENGTH_WATCH_V4_SHORT_ON_BTC_DOWNTREND_PULLBACK_20260928`; executor `BTC_RELATIVE_STRENGTH_READY_BTC_PULLBACK_SHORT_TP_ONLY_V3_20260928`; Discord `BTC_RELATIVE_STRENGTH_DISCORD_V4_BTC_PULLBACK_SHORT_20260928`. Private Binance policy vẫn là V46 vì exact source/stream/label/side và payload protection không đổi.
- **Dữ liệu dùng trước entry:** chỉ nến BTC 5m đã đóng và còn mới tối đa 120 giây, ba nến BTC 5m đứng trước, volume/taker BTC 5m, BTC health 1h/4h; phía coin dùng đúng nến 5m đóng cùng timestamp, move 5m, volume 5m/15m, taker-buy, structure 1h/4h, Trend Score, vùng động và MARK recheck. Không đọc outcome, PnL hoặc nến tương lai.
- **Phân loại bối cảnh BTC:** nhánh SHORT cũ khi BTC `UP_STRONG/UP_LEAN` giữ nguyên. Nhánh mới chỉ mở khi BTC vẫn `DOWN_STRONG/DOWN_LEAN` và nến BTC 5m vừa đóng tăng từ `+0,08%` đến `+0,75%`, sau ba nến trước đó giảm tổng ít nhất `0,12%`, thân nến chiếm ít nhất 25% range và taker-buy BTC tối thiểu 50%. Nến BTC và coin phải là cùng cây đóng, lệch timestamp không quá 5 giây.
- **Phân loại coin/gate:** coin SHORT vẫn phải active, 1h+4h `DOWN`, Trend Score `<=-14`, còn cách tâm vùng động `<=1,2%` và không vượt vùng theo hướng đuổi. Riêng nhánh pullback yêu cầu coin 5m giảm ít nhất `0,15%`, yếu hơn mức hồi BTC ít nhất `0,25` điểm %, volume 5m `>=1,0x`, volume 15m `>=0,75x`, taker-buy coin `<=45%` và `coinTrigger=true`. Không đủ một điều kiện thì vẫn ở `WAIT_BTC_OPPOSITE`, không gửi Binance.
- **Thống kê/Discord:** vẫn dùng exact state key `RELATIVE_ENTRY_READY`, relative score và event id cũ để không chia sai cohort. UI/Discord chỉ thêm `contextMode=BTC_DOWNTREND_PULLBACK_SHORT` cùng move BTC 5m, move coin 5m và chênh lệch tương đối; đây là thuộc tính bối cảnh, không phải WinRate mới.
- **Ảnh hưởng Binance/entry/size/SL/TP:** nhánh mới có quyền xét cùng route SHORT hiện hữu `btc-relative-strength-watch / opposite-btc-5m / RELATIVE_ENTRY_READY`. Vẫn MARKET `2 USDT margin ×5`, TP `+10% ROE`, không SL gốc, max 50, freshness entry 90 giây, recheck MARK, no replay, cooldown symbol 4 giờ, chặn position/order trùng và không DCA. Không sửa position/order đã mở; LONG và nhánh SHORT khi BTC tăng không đổi.
- **Tương thích JSON:** `btcPullback5m` trong BTC health và `last5mMovePct` trong trend-pool record là field additive; consumer/state cũ bỏ qua an toàn. Record cũ thiếu move/timestamp vẫn hiển thị theo nhánh cũ nhưng nhánh pullback fail-closed. Không migration hoặc replay state Discord/Binance.
- **WHITELIST:** không thêm signal label/card thống kê; vẫn exact `RELATIVE_ENTRY_READY` và hai checkbox Auto Controls hiện hữu. Vì không có card CLOSED mới chứng minh `AvgROE >4%`, không thêm checkbox WHITELIST; policy mặc định OFF hiện hữu giữ nguyên.


# BTC_RELATIVE_STRENGTH_CAUSAL_ALPHA_IN_ZONE_ONE_SETUP_V5_20260929

- **Versions:** model/UI `BTC_RELATIVE_STRENGTH_WATCH_V5_CAUSAL_ALPHA_ONE_ZONE_20260929`; executor `BTC_RELATIVE_STRENGTH_READY_CAUSAL_ALPHA_ONE_SETUP_V4_20260929`; Discord `BTC_RELATIVE_STRENGTH_DISCORD_V5_CAUSAL_ALPHA_ENTRY_ZONE_20260929`. Private Binance policy/payload authorization giữ exact source/stream/label hiện hữu vì size và protection không đổi.
- **Dữ liệu dùng trước entry:** chỉ nến 5m đã đóng. Coin tính return close-to-close 3 nến/15m và 12 nến/1h từ cùng cache với Trend Score, khung 1h+4h, volume/taker, vùng động và MARK. BTC health xuất return 15m/1h từ BTC 5m đã đóng cùng timestamp; lệch thời gian coin/BTC quá 5 giây thì LONG fail-closed. Không dùng outcome, PnL, nến tương lai hoặc giá sau entry.
- **Điều kiện phân loại:** LONG chỉ có `contextActive` khi BTC đúng `DOWN_STRONG`, coin giữ 1h+4h UP/Trend Score >=14, alpha `coinReturn-BtcReturn >=0,25` điểm %/15m và `>=0,50` điểm %/1h. `DOWN_LEAN`, thiếu return hoặc alpha thiếu đều chỉ quan sát. SHORT UP-context/pullback giữ ngưỡng V4. READY hai hướng bắt buộc MARK nằm trong `entryZone.low..high` và `coinTrigger=true`; khoảng cách tâm vùng <=1,2% nhưng ở ngoài biên chỉ là `WAIT_5M_CONFIRM`/Discord.
- **Điểm và thống kê:** `relativeScore` đổi thành điểm xếp hạng causal gồm trend, volume gốc/hiện tại, đúng vùng, xác nhận và alpha/underperformance; UI/Discord ghi rõ không phải xác suất thắng. Audit trước V5 có khoảng 130 fill, 112 closed, 18 open; closed WR khoảng 63% nhưng TP-only gây right-censoring nên không dùng làm xác nhận hiệu quả V5. V5 bắt đầu cohort mới bằng version/reason và `contextMode`; delivery/attempt không phải WinRate.
- **Binance/entry/size/SL/TP:** exact `RELATIVE_ENTRY_READY` vẫn MARKET `2 USDT margin x5`, TP `+10% ROE`, không SL gốc, max50, freshness 90 giây, mark drift 0,5%, chặn position/order trùng và không DCA. Mỗi `symbol|side|sourceConfirmation` chỉ được đi tới submit đúng một lần; setup được đánh dấu consumed trước submit để lỗi không rõ kết quả cũng không tạo lệnh lặp. Không sửa/hủy position, TP/SL hoặc order đang mở.
- **Tương thích JSON:** trend-pool/BTC health chỉ thêm `recentMovePct15m`, `recentMovePct1h`, `btcRelativeReturnClosedAt`, `btcRelativeReturn15mPct`, `btcRelativeReturn1hPct`; consumer cũ bỏ qua. Executor thêm map `setups`; khi đọc state cũ tự suy ra setup đã tiêu thụ từ attempt SUBMITTING/SUBMITTED/FILLED/SUCCESS/NEW/ERROR_OR_UNKNOWN hoặc attempt có `orderId`. Dữ liệu cũ thiếu return vẫn hiển thị nhưng không thể thành LONG READY.
- **WHITELIST:** không thêm signal key/card mới; tiếp tục exact `RELATIVE_ENTRY_READY` và hai checkbox Auto Controls hiện hữu. Không tạo checkbox Liquid Card mới; policy mặc định OFF và chỉ hiện với cohort CLOSED có `AvgROE >4%` giữ nguyên.

# AUTO_BTC_LONG_GLOBAL_GUARD_REMOVED_V2_ROUTE_LOCAL_20260929

- **Version:** `AUTO_BTC_LONG_GLOBAL_GUARD_REMOVED_V2_ROUTE_LOCAL_20260929`; vô hiệu hóa đúng phần `AUTO_BTC_LONG_ENTRY_GUARD_V1_RELATIVE_STRENGTH_EXCEPTION_20260928` được thêm từ yêu cầu chat trước đó. Không gỡ hay nới các gate BTC/Market Regime vốn nằm trong từng detector/executor riêng.
- **Dữ liệu dùng trước entry:** lớp `placeOrder` và signed Binance client không còn đọc snapshot `marketRegime.allowLongEntry` để chặn mọi lệnh BUY tự động. Mỗi chiến lược vẫn tự dùng nến đóng, BTC context, Market Regime, volume/taker, freshness và vùng entry của chính route nếu code route đó yêu cầu; không dùng PnL, outcome hoặc dữ liệu tương lai.
- **Điều kiện phân loại/gate:** không còn lỗi toàn cục `AUTO_LONG_BLOCKED_BTC_MARKET_REGIME`, không còn ngoại lệ đặc biệt cho `RELATIVE_ENTRY_READY`. LONG phải qua khóa tổng, checkbox exact route, private policy và toàn bộ gate cục bộ của chiến lược. `RELATIVE_ENTRY_READY` vẫn giữ V5: LONG cần BTC `DOWN_STRONG`, alpha 15m/1h, MARK trong vùng và nến 5m xác nhận.
- **Thống kê:** không tạo cohort, nhãn hoặc WinRate mới. Attempt/fill/closed PnL tiếp tục gắn theo source/stream/signal của từng route; việc gỡ guard chỉ loại bỏ một lý do block chung, không được diễn giải là cải thiện hiệu quả.
- **Ảnh hưởng Binance/entry/size/SL/TP:** các LONG khác không còn bị chặn sạch chỉ vì snapshot toàn cục đang `RISK_OFF`, `RECOVERY_TEST`, `WAIT_DATA` hoặc `allowLongEntry=false`. Không bật route đang OFF, không bỏ freshness/dedupe/max-position và không đổi entry, size, leverage, TP/SL/protection của bất kỳ chiến lược nào; position/order hiện hữu không bị sửa.
- **Tương thích JSON/WHITELIST:** không đổi schema API/state và không cần migration. Không thêm label/card/matcher mới, nên không thêm checkbox WHITELIST; checkbox hiện hữu vẫn mặc định OFF và policy chỉ hiện cohort CLOSED có `AvgROE >4%` giữ nguyên.

# LOCAL_AI_TREND_EVALUATOR_V1_QWEN3_8B_OBSERVE_ONLY_20260929

- **Version:** `LOCAL_AI_TREND_EVALUATOR_V1_QWEN3_8B_OBSERVE_ONLY_20260929`; page `/local-ai-trend-evaluation`, model local `qwen3:8b`, Ollama `0.34.4`. Đánh giá chỉ chạy khi mở trang/chưa có cache hoặc người dùng bấm làm mới; cache mặc định 5 phút, không quét liên tục theo tick.
- **Dữ liệu dùng trước đánh giá:** snapshot Coin Level causal hiện tại gồm candidate retest đã đóng, pool VERY_STRONG còn hiệu lực, early LONG/SHORT, structure 5m/15m/1h/4h, Trend/Entry Score, volume ratio, taker-buy, move 5m/15m/1h, vùng entry/target định lượng; BTC health và breadth/Market Regime hiện tại. Input loại bỏ PnL, closed outcome và dữ liệu sau entry. Tối đa 10 coin/hướng tốt nhất được chọn bằng ranking deterministic trước model; output chọn đúng một case tốt nhất mỗi hướng hiện có, mỗi case tối đa hai lý do/hai rủi ro ngắn để inference CPU không sinh JSON quá dài. Nếu BTC health còn `seeding` hoặc chưa có cả trend 1h/4h, evaluator fail-closed với `LOCAL_AI_BTC_CONTEXT_NOT_READY` và không gọi model; người dùng chạy lại sau warm-up.
- **Điều kiện phân loại:** shortlist top 10 được chia quota cân bằng 5 LONG + 5 SHORT khi engine có đủ hai phía; nếu một phía ít hơn quota thì slot dư mới trả cho phía còn lại. Structured schema được dựng từ input: khi có cả hai hướng thì `longCandidate` và `shortCandidate` đều là field bắt buộc, side bị khóa và symbol dùng enum đúng shortlist; model không thể bỏ một hướng hoặc bịa symbol. Model chỉ được trả market regime `SW_UP/SW_DOWN/UP_STRONG/DOWN_STRONG/RANGE/UNCLEAR`, bias `LONG_BIAS/SHORT_BIAS/NEUTRAL` và nhận định `PRIORITY/WATCH/WAIT/AVOID`. Server chỉ ghép lại vùng entry, invalidation, target từ engine; AI không được sinh giá. `strength 0–100` là độ rõ/xếp hạng ngôn ngữ, **không phải xác suất thắng**.
- **Kết luận quan sát V1:** `LOCAL_AI_OBSERVE_QUALIFICATION_V1_SIX_CRITERIA_20260929` chỉ trả `passed=true` khi cùng lúc đủ 6 điều kiện: verdict `PRIORITY`, strength `>=65`, path `RETEST/CONTINUATION`, MARK nằm trong vùng entry engine, không xung đột mạnh với bias/regime/breadth và MARK chưa chạm mốc vô hiệu theo phía LONG/SHORT. UI tô xanh dòng đủ 6/6; dòng còn lại ghi số điều kiện đạt và danh sách thiếu. Đây là boolean trình bày, không phải signal key, xác suất hay gate giao dịch.
- **Thống kê:** page hiển thị số candidate model chọn, số dòng đủ 6/6, thời gian/model/token usage và cache; chưa có nhãn giao dịch, cohort fill/closed, WinRate, calibration hoặc backtest walk-forward. Những số này không được dùng làm bằng chứng hiệu quả. XGBoost/LightGBM probability layer chưa triển khai ở V1.
- **Ảnh hưởng Binance/entry/size/SL/TP/Discord:** **không**. Toàn endpoint/page là `OBSERVE ONLY`, `binanceEligible=false`; không đăng ký Auto Controls route, không gửi Discord, không submit/cancel order, không sửa entry, size, leverage, SL/TP/protection hoặc position/order hiện hữu.
- **Tương thích JSON:** chỉ thêm endpoint `/api/local-ai-trend-evaluation` và file UI mới; schema/API/state cũ không đổi, không migration. Kết quả cache chỉ ở RAM và mất an toàn khi restart. Ollama chạy local; WSL dùng Windows localhost bridge qua `curl.exe`, không mở API model ra LAN.
- **WHITELIST:** `qualification.passed` có `runtimeSignalKey=null`, `observeOnly=true`, `binanceEligible=false`; nó không phải signal label/card runtime nên không có matcher/checkbox mới. Nếu sau này muốn AI có quyền entry, phải tạo cohort CLOSED riêng, chứng minh `AvgROE >4%`, thêm checkbox mặc định OFF khớp exact matcher và test/tài liệu trong cùng lượt; trước thời điểm đó mọi chữ PRIORITY/WATCH/ĐẠT ĐỦ ĐIỀU KIỆN chỉ là diễn giải UI.

# LOCAL_AI_TREND_DISCORD_V2_PRIORITY_WATCH_BTC_RECOVERY_20260929

- **Version:** `LOCAL_AI_TREND_DISCORD_V2_PRIORITY_WATCH_BTC_RECOVERY_20260929`; destination lấy từ secret `LOCAL_AI_TREND_DISCORD_WEBHOOK_URL`. Scheduler đánh giá AI mặc định mỗi 10 phút sau warm-up 120 giây; BTC health được đọc mỗi 30 giây. Inference vẫn dùng cache evaluator 5 phút và không chạy chồng khi model đang bận.
- **Dữ liệu dùng trước cảnh báo:** tin candidate chỉ dùng output causal của `LOCAL_AI_TREND_EVALUATOR_V1`: shortlist/ranking deterministic, nến đã đóng, vùng entry/invalidation/target từ engine, MARK hiện tại, BTC health và breadth có tại thời điểm đánh giá; không đọc PnL, closed outcome hoặc nến tương lai. Cảnh báo đổi hướng BTC chỉ dùng return BTC 15m và 1h tính từ cùng chuỗi nến 5m đã đóng cùng `btcRelativeReturnClosedAt`; không dùng nến đang chạy.
- **Điều kiện phân loại/gửi candidate:** chỉ gửi hai verdict hiện hữu của model: `PRIORITY` hiển thị xanh và `WATCH` hiển thị vàng; `WAIT/AVOID` không gửi. Payload ghi rõ kết quả qualification 6 tiêu chí, điểm là độ rõ chứ không phải xác suất, và luôn mang `OBSERVE ONLY`. Event id `symbol|side|verdict|sourceClosedAt`, cooldown route mặc định 30 phút, tối đa 3 candidate/evaluation; state delivery giữ 7 ngày để restart không replay.
- **Điều kiện đổi hướng/hồi phục BTC:** tạo baseline im lặng lần đầu. `UP` khi return đã đóng 15m `>= +0,25%` và 1h không âm quá `−0,05%`, hoặc 1h `>= +0,55%` và 15m không âm; `DOWN` đối xứng. Transition sang `UP`/`DOWN` gửi xanh/đỏ và giữ cooldown strong 15 phút. Recovery dùng hysteresis 60%: sau `DOWN`, cả 15m phải lớn hơn `−0,15%` và 1h lớn hơn `−0,33%`; sau `UP`, cả hai phải thấp hơn `+0,15%`/`+0,33%`. Khi đạt mới gửi xanh dương `DỪNG TĂNG MẠNH` hoặc `DỪNG GIẢM MẠNH`; vùng trung gian vẫn giữ strong state để tránh nhấp nháy và không làm mất cảnh báo hồi phục sau đó. Recovery không bị cooldown strong nuốt mất nhưng vẫn dedupe theo nguồn mạnh trước đó + candle đóng. `NEUTRAL→NEUTRAL`, state lặp và cùng event không gửi. Đây là cảnh báo bối cảnh, không xác nhận đảo chiều và không phải điểm entry.
- **Thống kê:** file `data/local-ai-trend-discord.json` chỉ ghi delivery/dedupe/cooldown và BTC state; số lần gửi không phải WinRate, profit factor hay bằng chứng hiệu quả. API `/api/local-ai-trend-evaluation` thêm object `discord` và `lastDelivery` khi POST để audit cấu hình/kết quả gửi.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. Notifier không đăng ký Auto Controls, không submit/cancel lệnh, không đổi entry, size, leverage, TP/SL/protection hoặc position/order hiện hữu; cả candidate và BTC shift đều `binanceEligible=false`.
- **Tương thích JSON:** các field `discord` là additive, consumer cũ bỏ qua an toàn. State file mới tự tạo, không migrate/chạm cache AI, trade/order hoặc state notifier khác; thiếu webhook thì fail-safe và evaluation vẫn chạy.
- **WHITELIST:** chỉ tái sử dụng verdict trình bày `PRIORITY/WATCH`, không tạo runtime signal key/card hay matcher giao dịch (`runtimeSignalKey=null`), nên không có checkbox mới. Policy checkbox mặc định OFF và chỉ hiện khi cohort CLOSED có `AvgROE >4%` giữ nguyên; nếu cấp quyền Binance sau này phải thêm exact matcher/checkbox/test/tài liệu trong lượt riêng.

# LOCAL_AI_TREND_DISCORD_V3_ALT_BTC_SHIFT_RECOVERY_FORECAST_20260930

- **Versions:** Discord `LOCAL_AI_TREND_DISCORD_V3_ALT_BTC_SHIFT_RECOVERY_FORECAST_20260930`; service recovery `LOCAL_AI_OLLAMA_WATCHDOG_V1_WINDOWS_SERVE_RECOVERY_20260930`. Watchdog kiểm tra Ollama mỗi 60 giây, khi endpoint/model mất sẽ chạy lại Windows `ollama.exe serve` ẩn, chờ model sẵn sàng tối đa 12 giây và giới hạn một lần thử mỗi 60 giây. Manual POST cũng tự thử khôi phục trước khi trả `MODEL_NOT_READY`.
- **Dữ liệu dùng trước dự báo:** chỉ dùng output causal của evaluator từ snapshot tại thời điểm chạy: BTC return 15m/1h từ nến 5m đã đóng, trend 1h/4h, RSI, funding, breadth/shock, market regime/bias, summary và `btcAssessment`. Không dùng PnL, closed trade outcome, nến tương lai hoặc giá do model tự sinh; vùng/giá candidate altcoin vẫn lấy từ engine deterministic như V1.
- **Điều kiện phân loại dự báo BTC:** `marketRegime` của AI được giữ nguyên thành `UP_STRONG`, `SW_UP`, `DOWN_STRONG`, `SW_DOWN`, `RANGE`; `UNCLEAR` chỉ được suy thành `SW_UP/SW_DOWN` khi bias tương ứng, còn lại `UNCLEAR`. Card hiển thị lần lượt xanh lá/xanh ngọc/đỏ/cam/xanh dương/xám. `marketScore 0–100` chỉ là **độ rõ ngôn ngữ, không phải xác suất thắng**; payload ghi rõ dự báo chỉ có hiệu lực đến vòng đánh giá sau và không phải target/entry.
- **Gửi/dedupe/thống kê:** dự báo gửi lần đầu, khi hướng phân loại đổi, hoặc refresh tối đa một lần mỗi 60 phút nếu hướng không đổi. Event id `forecastDirection|inputGeneratedAt`; state additive `btcForecast` lưu direction/source/lastNotified/event. Candidate altcoin `PRIORITY/WATCH`, cảnh báo BTC strong/recovery và dedupe cũ giữ nguyên. Delivery count/state không phải WinRate, calibration hoặc bằng chứng hiệu quả.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. Watchdog chỉ phục hồi model local; forecast Discord là `OBSERVE ONLY`, `binanceEligible=false`, không đăng ký Auto Controls, không submit/cancel order và không sửa entry, size, leverage, TP/SL/protection hoặc vị thế/lệnh đang mở.
- **Tương thích JSON cũ:** state V2 thiếu `btcForecast` tự nhận object mặc định, không replay lịch sử và không migration trade/order. API snapshot chỉ thêm `btcForecast`, `watchdogVersion`, `lastServiceStartAttemptAt`; consumer cũ bỏ qua an toàn. Nếu executable không tồn tại/watchdog lỗi thì scanner BTC deterministic vẫn chạy và evaluator fail-safe, không làm treo web.
- **WHITELIST:** card `AI DỰ BÁO XU HƯỚNG BTC` chỉ là context OBSERVE ONLY, có `runtimeSignalKey=null`, không phải nhãn/card trading hoặc matcher runtime nên không nối checkbox giả. Policy WHITELIST vẫn mặc định OFF và chỉ hiện cho cohort CLOSED có `AvgROE >4%`; muốn cấp quyền entry sau này phải tạo exact matcher/cohort/test/tài liệu riêng.

# LOCAL_AI_TREND_CHAT_V1_CAUSAL_ALTCOIN_QA_OBSERVE_ONLY_20260930

- **Version:** `LOCAL_AI_TREND_CHAT_V1_CAUSAL_ALTCOIN_QA_OBSERVE_ONLY_20260930`; thêm chatbot vào `/local-ai-trend-evaluation` và API `GET/POST /api/local-ai-trend-chat`, dùng chung Ollama `qwen3:8b` cùng watchdog hiện hữu. Mỗi câu hỏi là một inference theo yêu cầu, không quét model theo tick và không gửi Discord.
- **Dữ liệu dùng trước câu trả lời:** snapshot Coin Level causal hiện tại, tối đa 40 candidate sau dedupe/ranking deterministic từ closed retest, pool VERY_STRONG còn hiệu lực và early LONG/SHORT. Context gồm nến/structure đã đóng 5m/15m/1h/4h, Trend/Entry Score, volume ratio, taker-buy, move 5m/15m/1h, MARK/vùng entry/invalidation/target do engine cung cấp, BTC health, breadth và evaluation gần nhất; câu hỏi theo symbol chỉ gửi đúng symbol/side tìm thấy, câu hỏi tổng quát gửi tối đa top 12. Chỉ giữ tối đa sáu tin chat trước; không gửi PnL, closed outcome, nến tương lai hoặc dữ liệu sau entry.
- **Điều kiện phân loại/trả lời:** Structured Output trả `marketContext`, phần trả lời, tối đa năm coin với `LONG/SHORT/NEUTRAL`, trend `UP/DOWN/MIXED/RANGE/UNCLEAR`, độ rõ 0–100, bối cảnh entry và rủi ro. Độ rõ chỉ là cách diễn đạt/xếp hạng, **không phải xác suất thắng**. Server lọc mọi symbol model tự sinh khỏi danh sách; symbol `...USDT` không có trong snapshot được đánh dấu thiếu dữ liệu. Giá/vùng chỉ được nhắc lại từ JSON engine, model không được tự tạo TP/SL hoặc giá mới.
- **Thống kê:** response chỉ trả thời gian inference và token count của Ollama để quan sát tải; không tạo cohort, delivery count, WinRate, AvgROE hoặc paper trade. Lịch sử chat chỉ nằm trong RAM trình duyệt của tab hiện tại, không lưu vào state giao dịch.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. Chatbot luôn `observeOnly=true`, `binanceEligible=false`, không đăng ký Auto Controls, không submit/cancel order và không sửa entry, size, leverage, TP/SL/protection hoặc vị thế/lệnh hiện hữu.
- **Tương thích JSON cũ:** endpoint mới hoàn toàn additive, không thay schema evaluator/Coin Level hoặc state JSON; consumer cũ không gọi endpoint nên không bị ảnh hưởng. Chat không tạo file state/migration; khi BTC health chưa đủ 1h/4h hoặc Ollama chưa sẵn sàng thì fail-closed và báo rõ.
- **WHITELIST:** đây là giao diện hội thoại, `runtimeSignalKey=null`, không thêm signal label/card thống kê hay matcher giao dịch nên không tạo checkbox mới. Policy checkbox hiện hữu vẫn mặc định OFF và chỉ hiện khi cohort CLOSED có `AvgROE >4%`.

# LOCAL_AI_TREND_CHAT_V2_HYBRID_DIRECT_SYMBOL_FEATURE_VECTOR_20260930

- **Version:** `LOCAL_AI_TREND_CHAT_V2_HYBRID_DIRECT_SYMBOL_FEATURE_VECTOR_20260930`; thay V1 vì V1 chỉ thấy candidate shortlist nên hỏi coin ngoài candidates trả thiếu dữ liệu và vẫn tốn một lượt Qwen. V2 nhận diện tối đa ba symbol futures đang giao dịch từ câu hỏi, kể cả dạng base như `QNT`, rồi tải trực tiếp Coin Level theo symbol.
- **Dữ liệu dùng trước câu trả lời:** nhánh exact-symbol dùng snapshot Coin Level của coin được hỏi: trend/score và close time nến đóng 5m/15m/1h/4h, market MARK/24h, recommendation/confirmation 15m, vùng support/resistance, long/short plan, invalidation/target engine, LiqScan/CoinGlass agreement và BTC health làm context. Không dùng PnL, outcome hoặc nến tương lai. Nhánh câu hỏi chung vẫn dùng pool tối đa 40 candidate causal V1 nhưng lọc top 12 bằng vector đặc trưng định lượng gồm intent LONG/SHORT, độ mạnh trend, volume ratio và khoảng cách vùng entry; đây **không phải text embedding/vector database**.
- **Điều kiện phân loại:** exact-symbol trả nhanh bằng engine deterministic, không gọi Ollama: trend `UP/DOWN/MIXED/UNCLEAR` từ bias và đồng thuận khung; hướng quan sát lấy stance breakdown/breakout trước, sau đó mới fallback bias; entry hiển thị nguyên plan engine. Vì vậy coin có xu hướng lớn UP nhưng vừa xác nhận breakdown 15m có thể hiện `trend=UP`, `side=SHORT` kèm giải thích xung đột, không bị ép một chiều. Câu hỏi chung sau feature-vector retrieval mới gọi `qwen3:8b` Structured Output như V1.
- **Thống kê:** exact-symbol trả `model=COIN_LEVEL_DIRECT_ENGINE`, token/latency model bằng 0; câu hỏi chung tiếp tục thống kê token/latency Ollama. Không tạo WinRate, AvgROE, cohort hoặc paper trade; feature score chỉ để retrieval, không hiển thị như xác suất.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. Cả hai nhánh luôn `observeOnly=true`, `binanceEligible=false`, không submit/cancel Binance và không sửa entry, size, leverage, TP/SL/protection hoặc vị thế/lệnh hiện hữu.
- **Tương thích JSON cũ:** response chỉ thêm `directLookup`, `retrieval.mode/directCoins`; field V1 giữ nguyên nên UI/client cũ bỏ qua an toàn. Không tạo state/migration. Nếu mã hợp lệ nhưng Coin Level không tải được, API báo lỗi rõ thay vì rơi về shortlist và trả sai “không có candidate”.
- **WHITELIST:** exact lookup và feature-vector retrieval chỉ phục vụ hội thoại, `runtimeSignalKey=null`, không thêm signal/card/matcher giao dịch nên không tạo checkbox. Policy mặc định OFF và điều kiện chỉ hiện khi CLOSED `AvgROE >4%` giữ nguyên.

## Chat V2 — màu vùng hỗ trợ/kháng cự

- **Version giữ nguyên:** `LOCAL_AI_TREND_CHAT_V2_HYBRID_DIRECT_SYMBOL_FEATURE_VECTOR_20260930`; response exact-symbol bổ sung `supports[]` và `resistances[]`, tối đa hai vùng mỗi loại lấy nguyên từ `analysis.zones` Coin Level. Dữ liệu causal, điều kiện trend/side, feature-vector retrieval và cách thống kê token/latency không đổi.
- **Trình bày:** hỗ trợ là badge xanh, kháng cự là badge đỏ, hiển thị `low–high` và confidence. Đây là nhãn UI cho loại vùng giá, không phải signal tier, gate hay xác nhận entry; không tính thêm score, WinRate hoặc AvgROE.
- **Binance/JSON/WHITELIST:** không ảnh hưởng Binance, entry, size, SL/TP/protection. Hai array là field additive; client cũ bỏ qua. Không có runtime signal key/card thống kê/matcher mới nên không nối checkbox WHITELIST; default OFF và policy CLOSED `AvgROE >4%` giữ nguyên.

# LOCAL_AI_TREND_CHAT_V3_ORDERBOOK_LIQUIDITY_SCENARIO_OBSERVE_ONLY_20260930

- **Version:** `LOCAL_AI_TREND_CHAT_V3_ORDERBOOK_LIQUIDITY_SCENARIO_OBSERVE_ONLY_20260930`; giữ hybrid exact-symbol/feature-vector V2 và bổ sung order book cùng kịch bản vùng quét cho câu trả lời coin cụ thể.
- **Dữ liệu dùng trước phân loại:** snapshot Coin Level cùng thời điểm gồm vùng support/resistance có nguồn `ORDERBOOK BID/ASK` và `orderBookNotional`; Binance LiqScan `dominantSide/dominantPct/sweepTarget/mainKillZone`; CoinGlass `liquidityBias/dominancePct/nearestAbove/nearestBelow`; direction assessment, agreement, reasons và vùng target. Chỉ dùng dữ liệu hiện tại/đã tổng hợp trước câu hỏi; không dùng PnL, outcome hoặc tương lai.
- **Điều kiện phân loại kịch bản:** ưu tiên `directionAssessment.target` khi engine đã chọn target. Nếu chưa có, Binance proxy và CoinGlass cùng `UPPER` hoặc cùng `LOWER` thì confidence `HIGH`; chỉ một nguồn có hướng thì `MEDIUM`; hai nguồn ngược nhau bắt buộc `CONFLICT/LOW`, không ép dự đoán. Luôn hiển thị vùng trên và dưới nếu có để người dùng tự đối chiếu. Đây là lực hút thanh khoản tham khảo, không phải xác suất hay cam kết giá sẽ quét.
- **Thống kê:** hiển thị notional bid/ask, dominant percent, CoinGlass dominance và confidence của agreement; không tạo WinRate, AvgROE, cohort hay paper trade. Order-book có thể bị rút nên warning/risk hiện hữu giữ nguyên.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. `liquidityScenario` và `orderBook` chỉ là output `OBSERVE ONLY`, `binanceEligible=false`; không đặt/hủy lệnh và không đổi entry, size, leverage, SL/TP/protection hoặc vị thế hiện hữu.
- **Tương thích JSON cũ:** thêm object `orderBook` và `liquidityScenario` trong từng coin; field cũ giữ nguyên, client cũ bỏ qua, không migration/state. Nếu nguồn thiếu thì UI ẩn phần tương ứng và kịch bản trả `UNCLEAR`.
- **WHITELIST:** các badge BID/ASK/VÙNG TRÊN/VÙNG DƯỚI chỉ là UI dữ liệu, `runtimeSignalKey=null`, không phải signal/card thống kê hay matcher giao dịch nên không nối checkbox. Policy mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%` không đổi.

# LOCAL_AI_TREND_DISCORD_V4_SIDE_COLOR_LONG_GREEN_SHORT_RED_20260930

- **Version:** `LOCAL_AI_TREND_DISCORD_V4_SIDE_COLOR_LONG_GREEN_SHORT_RED_20260930`; chỉ đổi presentation của candidate Discord AI Local: LONG dùng icon/embed xanh `0x16c784`, SHORT dùng icon/embed đỏ `0xf43f5e`. Verdict `PRIORITY/WATCH` vẫn nằm trong title/field/footer nhưng không còn quyết định màu khi side hợp lệ.
- **Dữ liệu và phân loại:** dữ liệu causal trước cảnh báo, điều kiện gửi `PRIORITY/WATCH`, qualification, dedupe, cooldown và thống kê delivery giữ nguyên V3. Side lấy từ candidate đã được schema khóa `LONG/SHORT`; không suy lại hướng từ màu hoặc verdict.
- **Thống kê/Binance:** không tạo cohort hay thay cách đếm, không ảnh hưởng Binance, entry, size, leverage, SL/TP/protection hoặc order/position. Màu chỉ giúp đọc Discord, không phải gate/tier mới.
- **Tương thích JSON/WHITELIST:** không đổi payload fields/state schema ngoài chuỗi version/footer; state cũ đọc bình thường, không replay. Không thêm signal/card/matcher hoặc checkbox WHITELIST; policy default OFF/CLOSED `AvgROE >4%` giữ nguyên.

# LOCAL_AI_TREND_CHAT_V4_TREND_LIQUIDITY_CONFLICT_AWARE_20260930

- **Version:** `LOCAL_AI_TREND_CHAT_V4_TREND_LIQUIDITY_CONFLICT_AWARE_20260930`; sửa lỗi V3 có thể chỉ nhận CoinGlass trong direct lookup và trình bày `UPPER` như dự báo tăng dù xu hướng nến giảm. Server nay chạy `attachLatestLiqScanAlert` giống API Coin Level trước khi compact chatbot, đồng thời compact hỗ trợ cả snapshot LiqScan raw và dạng nested `current`.
- **Dữ liệu dùng trước phân loại:** giữ dữ liệu causal V3, nhưng bắt buộc lấy đủ `trendDirection` từ nến đóng 5m/15m/1h/4h, Binance proxy direction/dominant percent và CoinGlass direction/dominance. Không dùng PnL/outcome/tương lai.
- **Điều kiện kết luận tổng hợp:** proxy và CoinGlass ngược nhau => `LIQUIDITY_CONFLICT/LOW`, không chọn vùng quét trước dù một nguồn có dominance cao. Thanh khoản cùng hướng trend => `TREND_LIQUIDITY_ALIGNED`; thanh khoản ngược trend => `COUNTER_TREND_LIQUIDITY_PULL`, diễn giải là khả năng hồi/quét ngược xu hướng chứ không xác nhận đảo chiều. UI luôn ghi riêng `XU HƯỚNG UP/DOWN` và trạng thái thanh khoản.
- **Thống kê:** giữ notional/dominance/agreement V3, không tạo WinRate/AvgROE/cohort. Audit ZAMA tại thời điểm sửa: trend 5m/15m/1h/4h DOWN, Binance BELOW 97,44%, CoinGlass UPPER 100%, nên kết luận đúng là `XU HƯỚNG DOWN · THANH KHOẢN XUNG ĐỘT`, không phải nghiêng tăng.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**; toàn bộ `OBSERVE ONLY`, không sửa order/position hoặc protection. JSON thêm `trendDirection`, `combinedState`, `combinedHeadline`; additive, client cũ bỏ qua, không migration.
- **WHITELIST:** trạng thái xung đột/đồng hướng/ngược trend chỉ là UI context, `runtimeSignalKey=null`, không phải signal/card thống kê/matcher nên không thêm checkbox. Default OFF và CLOSED `AvgROE >4%` giữ nguyên.
# Local AI chatbot V5 — bounded busy lock (2026-09-30)

- Version: `LOCAL_AI_TREND_CHAT_V5_BOUNDED_BUSY_LOCK_20260930`.
- Dữ liệu trước câu trả lời: giữ nguyên BTC health, snapshot candidate và Coin Level trực tiếp; không thêm dữ liệu sau entry/PnL.
- Phân loại/thống kê: không đổi nhãn, tier, gate hay thống kê tín hiệu. Câu hỏi tổng hợp qua Ollama chỉ giữ một lượt chạy và giới hạn mặc định 120 giây; timeout không chạy lại lần hai qua Windows curl. Câu hỏi nêu rõ coin vẫn dùng Coin Level deterministic và được trả lời ngay cả khi lượt tổng hợp đang chạy.
- Binance: `OBSERVE ONLY`; không ảnh hưởng entry, size, SL hoặc TP. Không có runtime signal/card mới nên không thêm `WHITELIST`.
- JSON cũ: các field cũ được giữ nguyên; snapshot chatbot chỉ bổ sung `startedAt`, `elapsedMs`, `timeoutMs`, và lỗi busy có thêm `retryAfterMs`.
# Local AI chatbot V6 — fast aggregate retrieval (2026-09-30)

- Version: `LOCAL_AI_TREND_CHAT_V6_FAST_AGGREGATE_RETRIEVAL_20260930`.
- Dữ liệu trước câu trả lời: BTC health, candidate causal/closed-candle, feature-vector, volume và vùng entry có sẵn trong engine; không dùng PnL hay dữ liệu sau entry.
- Phân loại/thống kê: các câu hỏi tổng hợp phổ biến (`coin nào`, mạnh/yếu hơn BTC, so sánh LONG/SHORT, gần entry) lấy tối đa 5 altcoin đã xếp hạng và trả bằng `QUANT_FEATURE_VECTOR_ENGINE`, không chờ Qwen. `BTCUSDT` chỉ là bối cảnh, không được xếp như altcoin khi câu hỏi chứa chữ BTC. Câu mở khác vẫn dùng Qwen nhưng context 4096, output tối đa 400 token và timeout 60 giây. Không đổi tier/gate/thống kê tín hiệu giao dịch.
- Binance: `OBSERVE ONLY`; không ảnh hưởng entry, size, SL hoặc TP. Không tạo signal/card/matcher mới nên không thêm `WHITELIST`.
- JSON cũ: giữ nguyên các field; câu trả lời nhanh chỉ bổ sung `fastAggregate: true`, vẫn tương thích renderer cũ.

## UI delivery hotfix V6.1 — stable page handler (2026-09-30)

- **Version giao diện:** asset `/local-ai-trend-evaluation.js?v=20260930-v14`; giữ nguyên backend `LOCAL_AI_TREND_CHAT_V6_FAST_AGGREGATE_RETRIEVAL_20260930`. File UI không có import/export nên chuyển từ `type=module` sang script thường để handler inline và listener chạy cùng context khi đi qua Cloudflare/browser restore.
- **Dữ liệu/điều kiện/thống kê:** không đổi input causal, retrieval, phân loại, độ rõ, latency hay số lượng coin. Form và bốn nút gợi ý có thêm đường gọi `window.askLocalTrendChat` ở cấp trang. Gỡ `pointerdown.preventDefault()` cũ; chuột dùng `mousedown` không hủy mặc định, bàn phím dùng native `click/submit/Enter`. Nếu browser không phát sự kiện nút, textarea tự gửi sau 1,2 giây không nhập thêm; Enter vẫn gửi ngay. Busy guard và việc hủy timer trong `askChat` loại gửi trùng.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**; đây chỉ là sửa luồng sự kiện UI cho chatbot `OBSERVE ONLY`, không tạo/cancel lệnh và không đổi bất kỳ protection nào.
- **Tương thích JSON/WHITELIST:** không đổi response hoặc state JSON. Không thêm label/card/matcher runtime nên không có checkbox WHITELIST mới; policy mặc định OFF và chỉ hiện cho CLOSED `AvgROE >4%` giữ nguyên.

# LOCAL_AI_TREND_CHAT_V7_CURL_SAFE_FALLBACK_20260930

- **Version:** `LOCAL_AI_TREND_CHAT_V7_CURL_SAFE_FALLBACK_20260930`; UI asset `v15`. Sửa trường hợp câu hỏi thứ hai rơi vào Windows Ollama bridge và chờ đủ 60 giây với `curl (28)` dù câu trước đã hoàn tất.
- **Dữ liệu dùng trước câu trả lời:** giữ nguyên snapshot causal V6 gồm Coin Level, nến đóng, trend, volume, vùng entry engine, BTC health/breadth và evaluation gần nhất. Không dùng PnL, outcome, future candle hoặc dữ liệu sau entry.
- **Điều kiện phân loại/fallback:** direct-symbol vẫn dùng `COIN_LEVEL_DIRECT_ENGINE`; câu hỏi danh sách phổ biến vẫn dùng `QUANT_FEATURE_VECTOR_ENGINE`. Câu hỏi mở dùng ngay `QUANT_FEATURE_VECTOR_FALLBACK` khi evaluator nền đang chạy hoặc transport là `windows-curl`; nếu lượt Qwen local-http lỗi/timeout thì cũng fallback thay vì trả lỗi curl. `fallbackReason` chỉ audit nguyên nhân kỹ thuật, không phải tier/gate giao dịch.
- **Thống kê:** giữ tối đa 5 coin và feature ranking hiện tại; `usage.totalDurationMs=0` ở fallback. Không tạo cohort, WinRate, AvgROE hay xác suất thắng. UI tách rõ “đánh giá nền đang chạy” khỏi trạng thái câu hỏi chatbot.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. Toàn bộ vẫn `OBSERVE ONLY`, `binanceEligible=false`; không submit/cancel order và không đổi entry, size, leverage, SL/TP/protection hoặc vị thế hiện hữu.
- **Tương thích JSON/WHITELIST:** response chỉ thêm nullable `fallbackReason` và model label fallback; field cũ giữ nguyên, client cũ bỏ qua an toàn, không migration/state. Không thêm signal/card/matcher runtime nên không có checkbox WHITELIST mới; policy mặc định OFF và CLOSED `AvgROE >4%` giữ nguyên.

# LOCAL_AI_TREND_CHAT_V8_BINANCE_ORDERBOOK_ONLY_20260930

- **Version:** `LOCAL_AI_TREND_CHAT_V8_BINANCE_ORDERBOOK_ONLY_20260930`; UI asset `v16`. Order book/kịch bản quét trong chatbot chỉ dùng Binance Futures Depth và Binance LiqScan, không dùng CoinGlass để chọn hướng, confidence hoặc vùng hiển thị.
- **Dữ liệu dùng trước phân loại:** BID/ASK zone và notional lấy từ Coin Level có nguồn `ORDERBOOK BID/ASK` Binance Futures; dominant side/percent, main kill zone, sweep target và direction assessment lấy từ Binance LiqScan. Nến đóng 5m/15m/1h/4h vẫn quyết định trend chính. Không dùng PnL, outcome, future candle hoặc dữ liệu sau entry.
- **Điều kiện phân loại:** ưu tiên Binance direction target; nếu thiếu thì dùng dominant side LiqScan. Dominant percent `>=70%` cho confidence HIGH, còn có hướng thì MEDIUM, thiếu hướng LOW. Binance liquidity cùng trend => `TREND_LIQUIDITY_ALIGNED`; ngược trend => `COUNTER_TREND_LIQUIDITY_PULL`; không đủ => `UNCONFIRMED`. Không còn tạo `LIQUIDITY_CONFLICT` từ CoinGlass.
- **Thống kê:** hiển thị tối đa hai BID/two ASK zone, notional, Binance dominant percent và confidence; không tạo WinRate, AvgROE, cohort hay xác suất thắng. Order book là snapshot có thể bị rút, chỉ là dữ liệu phụ.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. Dù đọc API Binance, chatbot vẫn `OBSERVE ONLY`, `binanceEligible=false`, không submit/cancel order và không đổi entry, size, leverage, SL/TP/protection hoặc vị thế hiện hữu.
- **Tương thích JSON/WHITELIST:** thêm `orderBook.source`, `liquidityScenario.source`, `coinglassUsed=false`; giữ các field CoinGlass cũ ở giá trị `null` để client cũ không vỡ. Không migration/state. Không thêm signal/card/matcher runtime nên không có checkbox WHITELIST mới; default OFF và CLOSED `AvgROE >4%` giữ nguyên.

# LOCAL_AI_TREND_CHAT_V9_OLLAMA_BINANCE_ORDERBOOK_20260930

- **Version:** `LOCAL_AI_TREND_CHAT_V9_OLLAMA_BINANCE_ORDERBOOK_20260930`; UI cache `v17`. Khôi phục model local `qwen3:8b` làm lớp xử lý chính cho cả câu hỏi exact-symbol và câu hỏi tổng hợp. `windows-curl` chỉ là transport hợp lệ tới Ollama, không còn là lý do tự động bỏ model; engine định lượng chỉ trả fallback khi Ollama lỗi hoặc hết timeout hữu hạn.
- **Dữ liệu dùng trước câu trả lời/entry:** exact-symbol chỉ gửi đúng Coin Level của mã được hỏi gồm nến đã đóng 5m/15m/1h/4h, volume/market snapshot, plan/vùng engine, hỗ trợ/kháng cự và Binance Futures Depth/LiqScan raw hiện tại; không đính kèm top-12 candidate hoặc aggregate evaluation không liên quan. Từ khóa hội thoại như `ORDER/BOOK/MARKET/LONG/SHORT` không được tự nhận là symbol nếu người dùng không ghi đủ hậu tố `USDT`. Các object CoinGlass và `directionAssessment` kết hợp nguồn đã bị loại khỏi context model; model chỉ thấy `zones` cùng `liqScan.current`. Câu hỏi tổng hợp vẫn dùng feature-vector shortlist causal, BTC health/breadth và evaluation hiện tại. Không dùng PnL, outcome, nến tương lai hoặc dữ liệu sau entry.
- **Điều kiện phân loại:** model trả structured JSON với hướng LONG/SHORT/NEUTRAL, trend UP/DOWN/MIXED/RANGE/UNCLEAR, độ rõ và lý do. Exact-symbol dùng context 2048; một coin chỉ trả object `side/trend/clarity/reason` tối đa 64 output token, nhiều coin mới dùng `assessments`. Model không trả giá/entry/BTC context/rủi ro; server luôn ghép lại câu trả lời và các phần đó cùng support/resistance/order-book zones deterministic. Nến đóng là lớp xu hướng chính; Binance order book chỉ là lớp phụ. Kịch bản liquidity deterministic chỉ lấy `dominantSide`, `dominantPct`, `mainKillZone/sweepTarget` từ Binance LiqScan raw: cùng trend là `TREND_LIQUIDITY_ALIGNED`, ngược trend là `COUNTER_TREND_LIQUIDITY_PULL`, thiếu dữ liệu là `UNCONFIRMED`. Server tiếp tục lọc symbol ngoài context để model không tự bịa coin.
- **Thống kê:** response model thật có token count và latency; `modelApplied=true` cho exact-symbol khi thành công. Khi timeout/unavailable, exact-symbol trả `COIN_LEVEL_DIRECT_FALLBACK`, câu tổng hợp trả `QUANT_FEATURE_VECTOR_FALLBACK`, kèm `fallbackReason`; các số này là audit kỹ thuật, không phải WinRate, AvgROE hay xác suất thắng.
- **Ảnh hưởng Binance/entry/size/SL/TP/Discord:** **không**. Toàn chatbot vẫn `OBSERVE ONLY`, `binanceEligible=false`; không submit/cancel order, không đổi entry, size, leverage, SL/TP/protection, không chạm vị thế hiện hữu và không gửi Discord.
- **Tương thích JSON cũ:** các field `directLookup`, `modelApplied`, `fallbackReason`, `orderBook` và `liquidityScenario` là additive. Field CoinGlass cũ trong response liquidity vẫn giữ `null` để client cũ không vỡ; không state/migration. Không thêm signal/label/card thống kê hoặc runtime matcher, nên không có checkbox WHITELIST mới; policy mặc định OFF và chỉ hiện khi cohort CLOSED `AvgROE >4%` giữ nguyên.

# LOCAL_AI_BTC_TOP_CARD_V1_20260930

- **Version/phạm vi:** UI `LOCAL_AI_BTC_TOP_CARD_V1_20260930`, CSS v4 và JS v22. Thêm thẻ “AI đánh giá BTC” ngay dưới thanh trạng thái Ollama, phía trên chatbot và bảng candidate.
- **Dữ liệu dùng trước hiển thị/entry:** ưu tiên evaluation Qwen gần nhất gồm `btcAssessment`, BTC trend 1h/4h, market regime/bias/score, model, `inputGeneratedAt` và `evaluatedAt`. Sau restart khi cache evaluation RAM chưa có, chỉ hiển thị `btcDirection`/`btcForecast` cùng thời điểm từ state Discord AI đã lưu, đồng thời ghi rõ chưa có lời giải thích mới; không tự bịa assessment. Card tự cập nhật khi evaluation mới hoàn tất.
- **Điều kiện phân loại:** màu xanh cho forecast chứa UP, đỏ cho DOWN, xanh dương cho RANGE, xám cho UNCLEAR. Đây là trình bày của market regime do evaluator đã phân loại, không thêm rule, signal, tier hoặc gate. `marketScore` hiển thị là độ rõ, không phải xác suất.
- **Thống kê:** chỉ trình bày snapshot hiện tại/gần nhất, model và thời gian; không tạo cohort, WinRate, PF, AvgROE hay outcome tracking.
- **Binance/entry/size/SL/TP/Discord:** không ảnh hưởng. Card `OBSERVE ONLY`, không submit/cancel order, không đổi entry, size, leverage, SL/TP/protection và không phát Discord mới.
- **JSON cũ/WHITELIST:** không đổi API/JSON/state; chỉ đọc `evaluation` và `discord` đã có. Đây không phải card thống kê tín hiệu và không có runtime matcher nên không thêm checkbox WHITELIST; default OFF/CLOSED AvgROE >4% giữ nguyên.
- **Kiểm thử:** xác nhận đủ DOM card, asset cache version, render ưu tiên `evaluation.btcAssessment`, fallback `discord.btcForecast` và gọi render trong mỗi vòng health.

# LOCAL_AI_TREND_CHAT_V11_DUAL_DIRECT_OR_ORDERBOOK_20260930

- **Version/phạm vi:** chatbot V11, UI `v21-dual-chat-mode`. Người dùng chọn trước mỗi câu hỏi: `DIRECT_ENGINE` (nhanh, hành vi exact-symbol V2) hoặc `OLLAMA_BINANCE_ORDERBOOK` (model + order book Binance). UI mặc định `DIRECT_ENGINE`; API cũ không gửi mode mặc định giữ hành vi V10 có Ollama/order book để tương thích.
- **Dữ liệu trước câu trả lời/entry:** với coin cụ thể, `DIRECT_ENGINE` chỉ đọc Coin Level causal gồm trend/bias/score, nến 5m/15m/1h/4h, MARK/24h, headline và long/short plan/vùng engine. Không đưa zones/order-book notional hoặc LiqScan vào response, không gọi Ollama. `OLLAMA_BINANCE_ORDERBOOK` tiếp tục gửi exact Coin Level, Binance Futures Depth/LiqScan qua Qwen như V10. Câu hỏi tổng hợp và BTC vẫn cần model vì không có kết luận exact-symbol V2 để trả trực tiếp.
- **Điều kiện phân loại:** mode chỉ chọn nguồn phân tích hội thoại, không phải signal/tier/gate. Direct lấy trend/side/entry nguyên rule Coin Level hiện hữu; mode order-book dùng structured output Qwen rồi ghép vùng/liquidity deterministic. Chọn mode tại thời điểm bấm gửi và khóa selector đến khi hoàn tất, nên hai nguồn không trộn trong một response.
- **Thống kê:** response thêm `analysisMode`; direct trả `model=COIN_LEVEL_DIRECT_ENGINE_V2`, token model 0 và latency xử lý. Order-book trả model/token/latency/fallback như V10. Đây là audit kỹ thuật, không phải WinRate, AvgROE hay xác suất thắng.
- **Binance/entry/size/SL/TP/Discord:** không ảnh hưởng. Cả hai mode là `OBSERVE ONLY`, `binanceEligible=false`; không submit/cancel order, không đổi entry, size, leverage, SL/TP/protection, Discord hay evaluator nền.
- **JSON cũ/WHITELIST:** `analysisMode` additive. Client cũ bỏ qua field; request thiếu/sai mode giữ `OLLAMA_BINANCE_ORDERBOOK`. Direct giữ schema answer/coins nhưng support/resistance rỗng và orderBook/liquidityScenario null có chủ ý. Không migration/state, không nhãn/card/matcher giao dịch mới nên không thêm WHITELIST; default OFF/CLOSED AvgROE >4% giữ nguyên.
- **Kiểm thử:** chatbot test xác nhận mode direct không gọi evaluator/Ollama, không trả order book/LiqScan; mode cũ vẫn gọi model và giữ Binance-only order book. Các suite BTC intent, evaluator, Discord và PRIORITY-zone Binance vẫn PASS.

# LOCAL_AI_TREND_CHAT_V10_BTC_INTENT_GROUNDED_FALLBACK_20260930

- **Version/phạm vi:** chatbot V10, UI `v20-btc-chat-intent`. Sửa hỏi BTC trả shortlist altcoin; không sửa evaluator tự động hoặc route PRIORITY.
- **Dữ liệu trước câu trả lời/entry:** câu riêng về BTC chỉ gửi câu hỏi và BTC health qua Ollama; không gửi candidate altcoin, lịch sử trả lời altcoin, breadth gate hay aggregate evaluation cũ. Breadth chỉ hiển thị bối cảnh riêng, không dùng điều kiện RECOVERY/taker-buy altcoin để đảo hướng BTC. Câu so sánh coin với BTC vẫn dùng nhánh coin; exact-symbol giữ Coin Level và order book Binance, không thêm CoinGlass. Return thiếu giữ `null`, không biến thành 0. Snapshot BTC quá 5 phút/thiếu timestamp ghi rõ chưa xác minh độ mới.
- **Phân loại:** `BTC_TREND` là intent hội thoại, không phải signal/gate. Schema outlook chỉ mô tả hướng 1h/4h HIỆN TẠI (cùng tăng UP, cùng giảm DOWN, cùng flat RANGE, trái chiều MIXED/UNCLEAR, dữ liệu cũ UNCLEAR); reason giải thích bằng dữ liệu, condition dành riêng kịch bản tương lai. Server ghép hướng 1h/4h, giá và biến động từ snapshot. Kết quả sai schema, mâu thuẫn hướng snapshot hoặc chứa altcoin ngoài chủ đề bị loại, trả `BTC_CONTEXT_FALLBACK` đúng BTC. Vẫn gọi Ollama trước; fallback phân biệt timeout/invalid JSON/off-topic/inconsistent BTC/unavailable và ghi rõ không phải đánh giá model.
- **Thống kê/UI:** `modelApplied`, `elapsedMs`, `fallbackReason` là audit kỹ thuật, không phải WinRate/AvgROE. UI đo thời gian chờ thực (không còn 0 giây giả), phân biệt bubble Ollama và engine; polling không ghi đè nguồn trả lời. Chỉ gửi khi Enter/bấm nút, không tự gửi câu đang gõ; trình duyệt dừng chờ sau 90 giây.
- **Chất lượng nguồn BTC:** chat route kiểm tra cache tối thiểu 28 nến 1h và 28 nến 4h (đúng yêu cầu phép tính trend hiện hữu) trước khi phân tích BTC. Cache WS chưa seed không được diễn giải `flat/score=0` thành đi ngang; trả lỗi thiếu dữ liệu rõ ràng. `btcContextReady` chỉ là readiness chatbot; không sửa BTC health hay gate Binance. RSI/return/funding thiếu giữ null. BTC health có thể bao gồm nến đang chạy, không gắn nhãn toàn bộ là nến đóng.
- **Binance/entry/size/SL/TP/Discord:** không ảnh hưởng. Chatbot vẫn `OBSERVE ONLY`, `binanceEligible=false`; không thay đổi lệnh hay quyền giao dịch.
- **JSON cũ/WHITELIST:** giữ answer/coins/marketContext/usage, thêm intent/elapsedMs/modelApplied; BTC trả `coins=[]`. Không migration state; không thêm nhãn/card thống kê giao dịch hoặc matcher nên không thêm WHITELIST. Mặc định OFF và policy CLOSED AvgROE >4% giữ nguyên.
- **Kiểm thử:** `test-local-ai-trend-chat.mjs`, `test-local-ai-btc-chat.mjs`: phân biệt BTC/so sánh coin, không rò shortlist/history vào prompt BTC, thành công/timeout/JSON hỏng/off-topic, tuần tự sau lỗi, dữ liệu thiếu/cũ.

# LOCAL_AI_PRIORITY_ENGINE_ZONE_ENTRY_V2_MARKET_1USDT_20261003

- **Version:** executor `LOCAL_AI_PRIORITY_ENGINE_ZONE_ENTRY_V2_MARKET_1USDT_20261003`; policy `LOCAL_AI_PRIORITY_ZONE_1USDT_V51_20261003`; Auto Controls `AUTO_ENTRY_CONTROLS_V36_LOCAL_AI_PRIORITY_ZONE_1USDT_20261003`; catalog `OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V19_LOCAL_AI_PRIORITY_ZONE_1USDT_20261003`. Discord giữ nguyên ở `LOCAL_AI_TREND_DISCORD_V4_SIDE_COLOR_LONG_GREEN_SHORT_RED_20260930`.
- **Dữ liệu dùng trước entry:** candidate được Qwen đánh giá từ nến đóng/BTC/breadth và `entryZone.low/high`, `invalidationPrice`, `closedAt` của engine định lượng. Sau đó chỉ dùng Binance Futures MARK socket live; ngay trước submit lấy lại MARK, position và open orders. Không dùng PnL, outcome hoặc nến tương lai để chọn entry.
- **Điều kiện phân loại và entry:** chỉ candidate `verdict=PRIORITY`, symbol USDT, side LONG/SHORT, vùng engine và mốc vô hiệu hợp lệ được gài tối đa 15 phút. Điểm qualification 3/6–6/6 chỉ là giải thích, **không phải gate**. WATCH/WAIT/AVOID không được gài. Khi MARK đi vào/chạm/cắt vùng `[low, high]` với tolerance mép 0,02%, exact route phải ON, signal sinh sau `enabledAt` và process start, chưa có position hoặc non-reduce open order cùng symbol. MARK kiểm tra lại phải vẫn nằm trong vùng; mỗi setup chỉ submit một lần.
- **Binance/size/SL/TP:** MARKET `1 USDT margin ×5` (notional 5), cả LONG và SHORT, `maxOpenPositions=50`. TP `+10% ROE`; ưu tiên SL tại `invalidationPrice` của engine khi mốc nằm đúng phía entry và không xa hơn `50% ROE`. Nếu card PRIORITY thiếu mốc hoặc ghi `0`, dùng fallback `-20% ROE` để card không bị loại im lặng. Protection theo fill anchor. Chỉ lệnh mới dùng size 1 USDT; không replay setup cũ và không sửa order/position hiện hữu.
- **Thống kê:** state riêng chỉ lưu setup active, attempt, consumed, submit status/orderId và thời điểm; đây là audit vận hành, không phải WinRate, PF, AvgROE hay bằng chứng lợi nhuận. Không tạo card/cohort thống kê mới.
- **JSON cũ/WHITELIST:** evaluator thêm `priorityZoneExecutionEligible` top-level; qualification vẫn `OBSERVE ONLY`, client cũ bỏ qua field mới. State riêng `data/local-ai-priority-engine-zone-binance.json`; thiếu file tự tạo. Catalog V19 migrate đúng hai exact route `LOCAL_AI_PRIORITY_ENGINE_ZONE_TOUCH` có margin cũ `3` sang `1`, giữ nguyên `enabled`, `enabledAt`, leverage/TP và không đụng route khác; JSON/client cũ vẫn đọc tương thích. Vì không thêm nhãn/card thống kê hay matcher live-card, không thêm checkbox WHITELIST; quyền chạy do exact Auto Controls route, không lách policy CLOSED `AvgROE >4%`.

# LOCAL_AI_TREND_CHAT_V12_LIQUIDITY_ZONE_LIFECYCLE_20260930

- **Version:** `LOCAL_AI_TREND_CHAT_V12_LIQUIDITY_ZONE_LIFECYCLE_20260930`; UI asset `v23-zone-lifecycle`, CSS `v5-zone-lifecycle`. Sửa V11 từng gắn mọi `dominantSide=ABOVE/BELOW` thành `VÙNG TRÊN/DƯỚI` active dù MARK đã đi qua hoặc cảnh báo gốc đã ghi nhận sweep/reject.
- **Dữ liệu dùng trước phân loại:** Coin Level snapshot tại lúc hỏi gồm MARK hiện tại, `liqScan.current.dominantSide/dominantPct/sweepTarget/mainKillZone` và lifecycle causal đã có `liqScan.sweepRejectShort.state/zone/sweepAt/rejectAt/confirmationAt`. Server còn tái dựng `sweepRejectShortAtSnapshot` với mốc `generatedAt` để snapshot đọc muộn/sau restart không làm mất bằng chứng sweep đã tồn tại tại chính thời điểm snapshot; cờ stale do thời điểm đọc được bỏ riêng trong phép tái dựng, nhưng độ mới nến 5m/15m vẫn được kiểm tra so với `generatedAt`, và field này không nhìn quá `generatedAt`. Không dùng PnL, outcome giao dịch hoặc nến tương lai; Ollama không được tự quyết lifecycle.
- **Điều kiện phân loại:** chuẩn hóa biên `[low, high]`. Vùng UPPER còn active khi MARK dưới `low`, LOWER còn active khi MARK trên `high`; MARK nằm trong vùng là `TOUCHING`; MARK vượt hết `high` của UPPER hoặc xuống dưới `low` của LOWER là `SWEPT`. Với UPPER, nếu zone hiện tại giao với zone của `sweepRejectShort` và đã có `sweepAt`, trạng thái là `SWEPT`, `REJECTED_AFTER_SWEEP` hoặc `ACCEPTED_AFTER_SWEEP` tùy dữ liệu xác nhận. Vùng đã tiêu thụ có `active=false`, `likelyDirection=UNCLEAR`, `primaryTarget=null`, `combinedState=LIQUIDITY_ZONE_CONSUMED`. Một cụm mới không giao vùng cũ vẫn được phép trở lại `ACTIVE_APPROACHING`.
- **Thống kê/nhãn:** UI hiển thị rõ `VÙNG ... ĐANG HOẠT ĐỘNG`, `ĐANG CHẠM VÙNG ...`, `VÙNG ... ĐÃ QUÉT`, `ĐÃ QUÉT + REJECT` hoặc `GIÁ ĐÃ GIỮ QUA`; màu xám cho vùng đã tiêu thụ. Đây là trạng thái snapshot/lifecycle quan sát, không phải WinRate, xác suất, PF, AvgROE hay thống kê hiệu quả.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. Thay đổi chỉ thuộc chatbot `OBSERVE ONLY`; không sửa evaluator verdict, Discord, route PRIORITY, lệnh, vị thế, entry, size, leverage, SL, TP hoặc protection.
- **Tương thích JSON cũ:** response chỉ thêm `liqScan.sweepRejectShortAtSnapshot`, `liquidityScenario.zoneLifecycle`, các field `lifecycleState/lifecycleLabel/active` trên zone và state `LIQUIDITY_ZONE_CONSUMED`; client cũ bỏ qua. Snapshot thiếu lifecycle vẫn phân loại bằng MARK so với biên; không migration/backfill/state mới.
- **WHITELIST:** lifecycle/badge này không phải signal/card thống kê hoặc runtime matcher, nên không thêm checkbox. Policy mặc định OFF và chỉ hiện matcher giao dịch khi cohort CLOSED `AvgROE >4%` giữ nguyên.

# LOCAL_AI_OLLAMA_PROCESS_GUARD_V1_ORPHAN_ONLY_20261001

- **Version/phạm vi:** `LOCAL_AI_OLLAMA_PROCESS_GUARD_V1_ORPHAN_ONLY_20261001`. Watchdog Ollama 60 giây chạy bộ dọn tiến trình Windows trước bước health/restart; mặc định bật, grace 5 phút và tối đa 16 PID mỗi lượt.
- **Dữ liệu dùng trước phân loại/dọn:** inventory `Win32_Process` tại chính thời điểm watchdog gồm PID, parent PID, tên executable và thời điểm tạo. Không đọc nến, giá, PnL, outcome, candidate, Discord hay dữ liệu Binance.
- **Điều kiện phân loại:** chỉ xem đúng tên `llama-server.exe`; parent PID phải không còn trong inventory và tuổi tiến trình phải `>= LOCAL_AI_OLLAMA_ORPHAN_MIN_AGE_MS`. Ngay trước `Stop-Process`, PowerShell đọc lại đúng PID, xác nhận tên vẫn là `llama-server.exe` và parent vẫn không tồn tại. Backend còn parent sống, gồm child của `ollama.exe serve`, luôn được giữ; timeout request đơn lẻ không tự suy thành orphan.
- **Thống kê/audit:** snapshot API thêm `ollamaProcessGuard` với version, enabled, minAge, running và kết quả gần nhất gồm PID candidate/killed/skipped. Log chỉ ghi PID thực sự đã dọn; đây là audit vận hành, không phải WinRate, PF, AvgROE hoặc chất lượng tín hiệu.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. Guard chỉ quản lý tiến trình local AI mồ côi, không đổi evaluator verdict, signal/tier/gate, Discord, lệnh/vị thế Binance, entry, size, leverage, SL, TP hoặc protection.
- **Tương thích JSON/WHITELIST:** `ollamaProcessGuard` là object additive trong GET local-AI; client cũ bỏ qua an toàn, không migration/state. Không thêm nhãn/card thống kê hay runtime matcher nên không thêm checkbox WHITELIST; mặc định OFF của route giao dịch và policy CLOSED `AvgROE >4%` giữ nguyên.

# LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_V1_TWO_SIDED_20261001

- **Version/phạm vi:** Discord `LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_V1_TWO_SIDED_20261001`; lifecycle LONG `LIQ_SCAN_SWEEP_REJECT_LONG_OBSERVE_V1_20261001`. Dùng webhook riêng `LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_WEBHOOK_URL`, nếu trống thì dùng `LOCAL_AI_TREND_DISCORD_WEBHOOK_URL`. Scanner chạy mỗi 30 giây, track tối đa 6 giờ, cooldown cùng symbol/hướng 4 giờ và tối đa 5 thông báo/lượt.
- **Dữ liệu dùng trước thông báo/entry:** chỉ cảnh báo Binance LiqScan `isAlert=true` tại thời điểm phát sinh gồm symbol, `dominantSide/dominantPct`, MARK và `killZoneCluster.mainKillZone`, sau đó dùng nến Binance 5m đã đóng từ KlineCache và MARK socket để hiển thị. Nhánh Coin Level/chatbot thêm lifecycle LONG đối xứng từ nến Binance 5m/15m đã đóng, ATR và vùng hỗ trợ/kháng cự đang có. Không dùng CoinGlass, PnL, outcome hoặc nến tương lai; không cần Ollama để quyết định sự kiện.
- **Điều kiện phân loại:** `ABOVE` chỉ arm khi vùng nằm trên MARK lúc alert; giá chạm/giao vùng rồi có nến 5m đỏ đóng dưới mép thấp tạo `SHORT WATCH`. `BELOW` chỉ arm khi vùng nằm dưới MARK; giá chạm/giao vùng rồi có nến 5m xanh đóng trên mép cao tạo `LONG WATCH`. Nến sau alert phải liên tục, đã đóng và mới không quá 6 phút. UI lifecycle coi cả hai case là `REJECTED_AFTER_SWEEP`, vùng cũ `active=false`, confidence lifecycle `LOW`; đây là **OBSERVE ONLY**, không phải gate hay rule vào lệnh thật.
- **Thống kê/audit:** state riêng lưu track hiện hành, event đã gửi, cooldown và tối đa 50 event gần nhất; chỉ đếm detected/sent/tracked vận hành, không tạo WinRate, PF, AvgROE hoặc xác suất thắng. SHORT dùng màu đỏ, LONG màu xanh; dedupe theo coin+hướng+alert+nến reject và cooldown route.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. Không submit/cancel order, không gài entry, không đổi size/leverage, SL, TP, protection hoặc vị thế hiện hữu. Discord ghi rõ chờ cấu trúc/entry riêng và không đuổi giá.
- **Tương thích JSON:** Coin Level/chat context thêm nullable `sweepRejectLong` và `sweepRejectLongAtSnapshot`; GET local-AI thêm snapshot `liquiditySweepRejectDiscord`. Client cũ bỏ qua an toàn; state mới độc lập `data/local-ai-liquidity-sweep-reject-discord.json`, thiếu file tự tạo, không migration/rewrite JSON cũ.
- **WHITELIST:** đây là notification lifecycle observe-only, không tạo card thống kê UI hoặc runtime matcher Binance, nên không thêm checkbox WHITELIST và không được dùng để lách policy. Route giao dịch vẫn mặc định OFF; policy chỉ hiện card CLOSED `AvgROE >4%` giữ nguyên.

# LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_V2_EXPLICIT_OPT_IN_20261002

- **Version/phạm vi:** `LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_V2_EXPLICIT_OPT_IN_20261002`. Tắt riêng toàn bộ Discord `LIQSCAN QUÉT TRÊN/DƯỚI + REJECT` cho `SHORT WATCH` và `LONG WATCH`. Runtime mặc định OFF qua `LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_ENABLED=false`; chỉ có thể gửi khi flag được đặt đúng `true` **và** `LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_WEBHOOK_URL` là webhook Discord riêng hợp lệ. Đã bỏ fallback sang `LOCAL_AI_TREND_DISCORD_WEBHOOK_URL`.
- **Dữ liệu dùng trước entry/phân loại:** khi OFF, notifier không arm alert, không đọc nến để tạo delivery event và xóa các track chờ từ state ở lượt scan kế tiếp. Logic LiqScan/lifecycle dùng Binance alert, nến 5m đã đóng và MARK vẫn tồn tại trên Coin Level/chatbot để quan sát; điều kiện `ABOVE -> SHORT WATCH`, `BELOW -> LONG WATCH` của V1 không đổi nhưng không còn phát Discord. Không dùng PnL, outcome, CoinGlass hoặc nến tương lai.
- **Thống kê/audit:** snapshot notifier thêm `enabled=false`, đồng thời `configured=false`, `tracked=0`, `detected=0`, `sent=0`; các số này chỉ là audit vận hành, không phải WinRate, PF, AvgROE hoặc xác suất. Lịch sử `recent/sent` cũ được giữ để audit, chỉ track chưa gửi bị dọn.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. Không đổi signal/tier/gate, không submit/cancel order, không đổi entry, size, leverage, SL, TP, protection hoặc vị thế. Các thông báo AI/BTC/PRIORITY và webhook khác không bị tắt.
- **Tương thích JSON:** state V1 được đọc như cũ; version được nâng additive, `tracks` cũ bị xóa khi notifier OFF, còn `sent/lastByRoute/recent` vẫn tương thích. API chỉ thêm boolean `enabled`; client cũ bỏ qua an toàn, không migration trade JSON.
- **WHITELIST:** không thêm label/card/matcher giao dịch nên không có checkbox WHITELIST mới. Policy route mặc định OFF và chỉ hiện matcher khi cohort CLOSED `AvgROE >4%` giữ nguyên.

# BINANCE_SYMBOL_PROTECTION_EXCLUSION_V5_FULL_POSITION_BYPASS_20261002

- **Version:** controls `AUTO_ENTRY_CONTROLS_V32_FULL_POSITION_PROTECTION_BYPASS_20261002`; runtime `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V5_FULL_POSITION_BYPASS_20261002`.
- **Dữ liệu dùng trước quản lý protection:** exact Binance symbol và trạng thái cấu hình trong Auto Controls. Loại tạm nằm ở `protectionExclusions`; loại mới `FULL_POSITION_BYPASS` nằm ở `protectionFullBypasses`. Việc tự dọn khi đóng/đảo chiều chỉ dựa trên xác nhận vị thế Binance; nhánh tạm còn đọc ROE live từ average entry, MARK và leverage. Không dùng signal score, PnL lịch sử hoặc outcome tương lai.
- **Điều kiện phân loại:** mỗi symbol chỉ có một mode. `AUTO_RESUME_ROE_BOUNDARY` chặn protection đến khi ROE `>= +15%`, `<= -25%`, gỡ tay hoặc vị thế đóng/đảo chiều. `FULL_POSITION_BYPASS` không tự gỡ theo ROE ở bất kỳ mức nào; chỉ gỡ tay hoặc khi vị thế đóng/đảo chiều. Nếu JSON vô tình chứa symbol ở cả hai mảng, FULL thắng và bản lưu loại duplicate khỏi mảng tạm.
- **Thống kê:** hai bộ đếm UI chỉ là số symbol đang cấu hình theo từng mode, không phải số lệnh, WinRate, PF, AvgROE hoặc xác suất thắng.
- **Ảnh hưởng Binance/entry/size/SL/TP:** entry tự động vẫn có thể mở theo route/gate hiện hữu; size/leverage không đổi. Trong thời gian exclusion, runtime bỏ qua tạo/bù/đổi TP hoặc SL, dời TP/SL, missing-protection recovery, profit-lock và Fast Wave; TP/SL đã có hoặc đặt thủ công trên Binance được giữ nguyên, không bị hủy. FULL có rủi ro vị thế không còn protection tự động cho tới khi người dùng gỡ hoặc vị thế kết thúc.
- **Tương thích JSON:** mảng cũ `protectionExclusions` giữ nguyên ý nghĩa và được đọc không migration. `protectionFullBypasses` là field additive, thiếu thì mặc định `[]`; corrupt read giữ cả hai set trong RAM và fail-closed. Không rewrite trade/audit JSON.
- **WHITELIST:** đây là control vận hành theo symbol, không thêm signal/label/tier/card thống kê hay matcher runtime; không có checkbox WHITELIST mới. Policy mặc định OFF và chỉ hiện matcher giao dịch khi cohort CLOSED `AvgROE >4%` giữ nguyên.

# LOCAL_AI_TREND_CHAT_V15_SHORT_SYMBOL_QUERY_20261002

- **Version:** chatbot `LOCAL_AI_TREND_CHAT_V15_SHORT_SYMBOL_QUERY_20261002`; UI asset `v35-short-symbol-search`.
- **Dữ liệu dùng trước trả lời/entry:** frontend gửi mọi chuỗi không rỗng. Backend chỉ chấp nhận câu 1–2 ký tự khi chuỗi đó đã resolve thành exact symbol Binance hiện có và Coin Level đã tải được; ví dụ `ct` có thể map `CTUSDT`. Câu ngắn không phải symbol vẫn trả lỗi validation rõ. Sau khi resolve, hai mode Direct/Ollama dùng cùng dữ liệu causal hiện hữu như V14; không bổ sung PnL/outcome hay nến tương lai.
- **Điều kiện phân loại:** đây chỉ là sửa validation truy vấn, không phải signal/tier/gate. Input rỗng hiển thị hướng dẫn tại chỗ; không còn silent return cho mã coin 1–2 ký tự. Symbol vẫn phải có trong universe Binance và không được tự bịa.
- **Thống kê:** không thêm cohort, WinRate, PF, AvgROE hoặc xác suất; latency/model/fallback giữ nguyên audit kỹ thuật của chatbot.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. Chatbot vẫn `OBSERVE ONLY`, `binanceEligible=false`; không submit/cancel order, không đổi entry, size, leverage, SL, TP, protection hoặc Discord.
- **Tương thích JSON/WHITELIST:** response schema không đổi; client cũ tiếp tục dùng API cũ. Không thêm label/card/matcher runtime nên không có checkbox WHITELIST mới; default OFF và policy CLOSED `AvgROE >4%` giữ nguyên.

# LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V3_HOVER_PRICE_20261002

- **Version/phạm vi:** `LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V3_HOVER_PRICE_20261002`; UI JS `v36-chart-hover-price`, CSS `v9-chart-hover-price`. Chart order book trong kết quả hỏi một coin nay có crosshair ngang và tooltip giá tại vị trí con trỏ.
- **Dữ liệu dùng trước hiển thị/entry:** chỉ dùng `minPrice`, `maxPrice` và tọa độ trục dọc đã có trong chính SVG chart đang hiển thị; không gọi thêm Binance, CoinGlass, Ollama hoặc API khác và không dùng dữ liệu sau entry.
- **Điều kiện phân loại:** đây chỉ là phép ánh xạ tuyến tính vị trí hover trong phần plot sang mức giá, có clamp tại biên trên/dưới. Không tạo signal, label, tier, gate hoặc kết luận LONG/SHORT mới.
- **Thống kê:** không thêm cohort, WinRate, PF, AvgROE, probability hoặc snapshot thống kê; tooltip chỉ trình bày một mức giá tham chiếu tức thời.
- **Ảnh hưởng Binance/entry/size/SL/TP/Discord/AI:** **không**. Không submit/cancel order, không đổi entry, size, leverage, SL, TP, protection, Discord hoặc nội dung đánh giá model.
- **Tương thích JSON/WHITELIST:** không đổi API/JSON/state và không migration. Không thêm card/matcher runtime nên không có checkbox `WHITELIST` mới; default OFF và policy chỉ hiện khi CLOSED `AvgROE >4%` giữ nguyên.
# LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_BINANCE_V2 — ĐẢO HƯỚNG MARKET 4 USDT (2026-10-03)

- **Version:** executor `LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_BINANCE_V2_REVERSED_SIDE_MARKET_4USDT_20261003`, policy `LIQUIDITY_BREAKOUT_DEPTH_REVERSED_SIDE_V50_20261003`, catalog `OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V18_LIQUIDITY_BREAKOUT_DEPTH_4USDT_20261003`; detector/Discord hiện dùng `LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_V4_BATCHED_ALL_BREAKOUTS_PRIORITY_20261003`.
- **Dữ liệu trước entry:** chỉ event mới từ nến Binance 5m/15m đã đóng vượt toàn bộ MAIN KILL, Binance Futures visible depth hiện tại có tổng phía ngược lớn hơn, rồi ngay trước submit đọc lại MARK, positions và open orders. Không dùng PnL/outcome/nến tương lai. Event quá 2 phút, sinh trước process start hoặc trước `enabledAt` bị chặn.
- **Điều kiện phân loại:** `ABOVE + BID dưới lớn hơn ASK trên` ánh xạ **SHORT**; `BELOW + ASK trên lớn hơn BID dưới` ánh xạ **LONG**. Exact source/stream/label/stage/timeframe phải khớp; không có position hoặc non-reduce open order cùng symbol; mỗi `eventId` chỉ thử một lần. Discord vẫn phát khi route OFF/bị guard chặn và ghi rõ trạng thái Binance.
- **Binance/entry/size/SL/TP:** đây là route giao dịch thật khi exact Auto Controls đang ON: MARKET `4 USDT margin ×5` = notional 20 USDT, max50; TP `+10% ROE`. LONG có SL `-20% ROE`; SHORT tuân thủ policy bot SHORT hiện hành nên TP-only, không SL gốc. Protection neo theo fill; FULL BYPASS theo coin vẫn có quyền bỏ qua cả TP/SL. Không DCA, không replay lịch sử, không sửa vị thế/lệnh cũ. Hai route LONG/SHORT seed **mặc định OFF**; lượt triển khai này bật chúng theo yêu cầu người dùng.
- **Thống kê:** state riêng chỉ lưu attempt/eventId, status/orderId, size, TP/SL và thời điểm để audit/dedupe; không phải WinRate, AvgROE hay xác suất thắng. Lệnh fill đi vào filled-signal audit chung và trang quản lý lệnh theo signal.
- **JSON cũ/WHITELIST:** state Discord V1/V2 giữ nguyên; event đã gửi/attempt cũ không replay và giữ hướng lịch sử cũ, chỉ event mới V3/V2 dùng mapping đảo. `binanceExecution` additive; snapshot ghi `observeOnly=false`, `binanceEligible=true`, `binanceRequiresExplicitRoute=true`; client cũ bỏ qua được. Exact route keys/checkbox không đổi, seed mặc định OFF và máy hiện tại giữ ON. Không tạo WHITELIST thống kê khi chưa có cohort CLOSED `AvgROE >4%`.

# OPPOSITE_LIQUIDITY_MANAGER_V1_READ_ONLY_20261003

- **Version/phạm vi:** `OPPOSITE_LIQUIDITY_MANAGER_V1_READ_ONLY_20261003`, navigation `LOCAL_AI_NAVIGATION_ALL_MENUS_V6_OPPOSITE_LIQUIDITY_MANAGER_20261003`. Thêm trang `/opposite-liquidity-manager` và API GET cùng tên để quản lý riêng nhóm `LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH`; mọi menu dashboard đều có mục `Thanh khoản ngược`.
- **Dữ liệu dùng trước entry:** trang chỉ đọc state causal đã tồn tại của scanner: vùng LiqScan đã arm, hướng ABOVE/BELOW, MARK lúc arm, dominant/imbalance, tiến độ nến đóng 5m/15m; cùng event Discord gần đây và attempt executor Binance. Không bổ sung nguồn dữ liệu, PnL/outcome hay nến tương lai vào rule entry. `lastScan` là telemetry RAM của vòng quét gần nhất, mất sau restart cho tới vòng mới.
- **Điều kiện phân loại:** không đổi rule giao dịch: ABOVE + BID dưới lớn hơn tạo SHORT; BELOW + ASK trên lớn hơn tạo LONG. Bộ lọc coin/hướng/khung trên trang chỉ lọc hiển thị, không phải gate. Trang hiển thị exact route ON/OFF nhưng không có API ghi và không thể bật/tắt route.
- **Thống kê/audit:** đếm operational `trackedSymbols`, track trên/dưới, số còn chờ 5m/15m, detected/analyzed/qualified/selected/deferred/sent của vòng gần nhất và số attempt submitted/error còn lưu. Đây không phải WinRate, PF, AvgROE hoặc xác suất thắng. Danh sách chi tiết gồm vùng, expiry 6 giờ, recent delivery, order ID và lỗi executor.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không thay đổi**. Màn hình/API read-only, không submit/cancel order và không đổi route, entry, size `4 USDT ×5`, TP `+10% ROE`, LONG SL `-20% ROE`, SHORT TP-only hoặc protection theo coin. Runtime giao dịch V2/V4 tiếp tục là nguồn duy nhất quyết định.
- **Tương thích JSON:** không migration và không rewrite schema state. API mới chỉ đọc `tracks/recent/attempts`; state cũ thiếu field mới vẫn load bằng default hiện hữu. `lastScan` chỉ additive trong snapshot, client cũ bỏ qua an toàn.
- **WHITELIST:** không thêm signal label, tier, card hiệu suất hay matcher runtime; vì vậy không tạo checkbox WHITELIST mới. Exact Auto Controls hiện hữu vẫn là quyền chạy, seed mặc định OFF và policy card chỉ hiện khi cohort CLOSED `AvgROE >4%` giữ nguyên.

# OPPOSITE_LIQUIDITY_SITEWIDE_TOAST_V1_QUALIFIED_EVENT_20261003

- **Version/phạm vi:** browser UI `OPPOSITE_LIQUIDITY_SITEWIDE_TOAST_V1_QUALIFIED_EVENT_20261003`; notifier snapshot nâng additive lên `LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_V5_SITEWIDE_BROWSER_TOAST_20261003`. CSS/JS toast được server gắn vào toàn bộ trang HTML, nhưng client chỉ poll danh sách `scanner.browserNotifications` của đúng nhóm thanh khoản ngược chiều.
- **Dữ liệu dùng trước entry:** toast dùng chính event causal đã qualified của V4: symbol, ABOVE/BELOW, LONG/SHORT phản chiều, khung nến đóng 5m/15m, MAIN KILL, tỷ lệ visible depth và kết quả callback Binance. Không đọc thêm PnL/outcome/nến tương lai và không đưa dữ liệu toast ngược lại detector hoặc executor.
- **Điều kiện phân loại/thông báo:** chỉ event đã vượt vùng và có tổng depth phía ngược lớn hơn, sau bước priority selection, mới được ghi `browserNotifications`. Toast độc lập với kết quả HTTP Discord: Discord lỗi vẫn có toast; eventId chống hiện lại bằng localStorage, tối đa bốn toast chi tiết/lượt, tự đóng sau 15 giây. Lần đầu chỉ hiện event mới không quá 2 phút để không spam lịch sử. Không toast BTC, AI PRIORITY, sweep-reject hoặc signal khác.
- **Thống kê:** state giữ tối đa 100 browser notification trong 7 ngày để delivery UI và API; đây là log vận hành, không phải WinRate, PF, AvgROE hay xác suất. Trình duyệt nhớ tối đa 200 eventId đã thấy; việc xóa localStorage chỉ ảnh hưởng dedupe giao diện.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không thay đổi**. Toast không submit/cancel order, không bật route và không đổi mapping, entry, size `4 USDT ×5`, leverage, TP/SL/protection hoặc position. Discord vẫn được gửi như cũ; toast là kênh hiển thị bổ sung.
- **Tương thích JSON:** `browserNotifications=[]` là field state/API additive; JSON cũ thiếu field được mặc định rỗng, không migration và không replay event cũ. `recent` tiếp tục chỉ chứa Discord đã gửi thành công để không đổi nghĩa client cũ.
- **WHITELIST:** toast chỉ trình bày signal hiện hữu, không thêm label/tier/card thống kê/matcher Binance; không có checkbox WHITELIST mới. Exact route Auto Controls và policy CLOSED `AvgROE >4%` giữ nguyên.

# OPPOSITE_LIQUIDITY_SITEWIDE_TOAST_V2_NATIVE_PUSH_20261003

- **Version/phạm vi:** `OPPOSITE_LIQUIDITY_SITEWIDE_TOAST_V2_NATIVE_PUSH_20261003`. Bổ sung native browser/Windows notification bằng service worker `/opposite-liquidity-push-sw.js`; nút xin quyền chỉ đặt trên `/opposite-liquidity-manager`. Sau khi người dùng bấm và cấp quyền, client toàn site tiếp tục poll event khi tab ở nền và service worker hiển thị notification. Cơ chế này cần còn ít nhất một tab dashboard đang mở; chưa phải server Web Push khi đã đóng toàn bộ trình duyệt.
- **Dữ liệu dùng trước entry:** push dùng đúng `browserNotifications` causal của V5 gồm exact `eventId`, symbol, LONG/SHORT, interval, vùng, depth ratio và trạng thái callback Binance. `data.signalType` bị khóa thành `LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH`; không subscribe hoặc hiển thị BTC, PRIORITY, sweep-reject và signal khác.
- **Điều kiện phân loại/thông báo:** không tạo phân loại mới. Chỉ event unseen theo cùng localStorage dedupe với toast mới gọi `showNotification`; tag native chứa signal type + eventId để hệ điều hành không nhân đôi. Quyền `default/denied` không tự prompt; chỉ thao tác click người dùng mới gọi `Notification.requestPermission`. Bấm notification focus/mở trang quản lý.
- **Thống kê:** không thêm cohort hay metric hiệu suất. Permission state chỉ là UI vận hành; service worker không lưu market data, subscription hoặc kết quả giao dịch.
- **Ảnh hưởng Binance/entry/size/SL/TP:** **không**. Push là output presentation sau qualification, không submit/cancel order, không bật route và không đổi entry, size, leverage, TP/SL/protection hoặc position. Discord và toast in-page giữ nguyên.
- **Tương thích JSON:** không đổi API/state JSON so với V1; dùng lại `browserNotifications`. Client cũ không tải asset V2 thì chỉ thiếu native notification. Service worker chỉ xử lý click có exact signal type, không migration/replay.
- **WHITELIST:** không thêm signal label, tier, card thống kê hoặc matcher Binance; không có checkbox WHITELIST mới. Exact Auto Controls và policy CLOSED `AvgROE >4%` giữ nguyên.

# LOCAL_AI_TREND_CHAT_V17_FAST_ORDER_BOOK_NO_OLLAMA_20261004

- **Version/phạm vi:** chatbot `LOCAL_AI_TREND_CHAT_V17_FAST_ORDER_BOOK_NO_OLLAMA_20261004`; UI asset `v42-fast-orderbook-no-ollama`. Thêm mode `DIRECT_ENGINE_BINANCE_ORDERBOOK` mang nhãn `Nhanh · có Binance order book · không Ollama`, nằm giữa mode Direct không order book và mode Ollama + order book hiện hữu.
- **Dữ liệu dùng trước trả lời/entry:** coin cụ thể vẫn tải Coin Level causal gồm nến đã đóng, trend/volume/vùng engine, Binance Futures depth 1.000 level, tổng BID/ASK NEAR/WIDE và Binance LiqScan MAIN/FAR KILL. Chart, support/resistance, tổng thanh khoản và lifecycle vùng được dựng deterministic từ snapshot này; không gửi prompt và không kiểm tra/khởi động Ollama trong mode mới. Câu BTC/tổng hợp ở hai mode Direct cũng dùng snapshot BTC/feature-vector sẵn có và không gọi model.
- **Điều kiện phân loại:** đây là lựa chọn cách diễn giải `OBSERVE ONLY`, không phải signal/tier/gate giao dịch. `DIRECT_ENGINE` bỏ cả order book; `DIRECT_ENGINE_BINANCE_ORDERBOOK` giữ order book/LiqScan nhưng bỏ model; `OLLAMA_BINANCE_ORDERBOOK` giữ luồng model cũ. Kết luận LONG/SHORT, MAIN/FAR KILL và vùng consumed không có rule mới.
- **Thống kê/audit:** response ghi exact `analysisMode`, `modelApplied=false`, model kỹ thuật `COIN_LEVEL_DIRECT_ORDER_BOOK_ENGINE_V1`, elapsed/usage bằng luồng deterministic. Không tạo cohort, WinRate, PF, AvgROE hoặc xác suất thắng; số USD/order-book chỉ là snapshot visible depth/LiqScan proxy.
- **Ảnh hưởng Binance/entry/size/SL/TP/Discord:** **không**. Chatbot tiếp tục `binanceEligible=false`, không submit/cancel order, không bật route, không đổi entry, size, leverage, SL, TP, DCA, protection, Discord hoặc vị thế.
- **Tương thích JSON:** thêm enum mode và metadata response additive; client cũ không gửi mode vẫn normalize về `OLLAMA_BINANCE_ORDERBOOK` như trước. Schema coin/orderBook/liquidityScenario giữ nguyên, không migration/rewrite state hoặc trade JSON.
- **WHITELIST:** không thêm label/card thống kê hoặc matcher runtime, nên không tạo checkbox WHITELIST mới. Exact route mặc định OFF và policy chỉ hiện khi cohort CLOSED `AvgROE >4%` giữ nguyên.
