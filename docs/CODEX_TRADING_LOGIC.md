# Codex Trading Logic Map

### 2026-10-03 — Không cắt mất breakout thứ 6+ của nhóm thanh khoản ngược chiều

- Nâng detector/Discord lên `LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_V4_BATCHED_ALL_BREAKOUTS_PRIORITY_20261003`. V3 từng sort theo breach rồi `slice(0, maxPerScan=5)` trước khi lấy Coin Level; năm breakout không đạt opposite depth có thể chiếm đầu danh sách và làm case tốt phía sau không được đọc order book.
- V4 phát hiện toàn bộ breakout 5m/15m còn hiệu lực, gom unique symbol và phân tích tất cả theo batch mặc định 5 request song song. Hai khung cùng coin dùng chung snapshot. Event đạt được xếp theo opposite-depth ratio, minimum BID/ASK coverage, opposite notional rồi breach time; tối đa 5 event được gửi/executor mỗi vòng, số đạt dư giữ track để vòng 30 giây kế tiếp xét tiếp. Telemetry thêm số analyzed/selected/deferred; đây không phải xác suất.
- Dữ liệu causal và rule hướng không đổi: MAIN KILL alert, nến Binance đã đóng, visible depth NEAR+WIDE; ABOVE+BID dưới lớn vào SHORT, BELOW+ASK trên lớn vào LONG. Executor vẫn MARKET 4 USDT ×5, TP +10%, LONG SL -20%, SHORT TP-only, max50; chỉ thay lịch/ưu tiên event mới, không sửa lệnh hiện hữu. State/eventId tương thích V1–V3, không migration. Không thêm label/card/matcher WHITELIST; exact routes giữ trạng thái hiện tại và policy CLOSED AvgROE `>4%` không đổi.

### 2026-10-03 — AI PRIORITY engine-zone giảm size còn 1 USDT

- Nâng executor lên `LOCAL_AI_PRIORITY_ENGINE_ZONE_ENTRY_V2_MARKET_1USDT_20261003`, policy `LOCAL_AI_PRIORITY_ZONE_1USDT_V51_20261003`, controls V36 và catalog V19. Dữ liệu trước entry/điều kiện không đổi: chỉ candidate Ollama `PRIORITY`, vùng/invalidation causal của engine và Binance MARK live; qualification 3/6–6/6 chỉ giải thích, không phải gate.
- Chỉ thay size lệnh mới của exact route `LOCAL_AI_PRIORITY_ENGINE_ZONE_TOUCH` LONG/SHORT từ `3 USDT margin ×5 = 15 USDT notional` xuống `1 USDT margin ×5 = 5 USDT notional`. MARKET, max50, TP +10% ROE, structural SL/fallback -20% ROE, protection, Discord và logic touch vùng giữ nguyên; lệnh/vị thế hiện có không bị sửa.
- Migration chỉ nhận đúng source/stream/label/side và margin cũ bằng 3, giữ nguyên switch cùng `enabledAt`; route khác không đổi. State/API/UI chỉ cập nhật version/size, JSON cũ tương thích. Đây không phải nhãn/card thống kê mới nên không thêm WHITELIST; exact Auto Controls route giữ trạng thái hiện hành, route mới vẫn mặc định OFF và policy CLOSED AvgROE `>4%` không đổi.

### 2026-10-03 — Trang quản lý lệnh Binance theo tín hiệu

- Thêm `BINANCE_SIGNAL_ORDER_MANAGER_V1_AUDIT_LIFECYCLE_LIVE_PNL_20261003`, trang `/binance-signal-orders` và API read-only có search/filter/sort/phân trang. Navigation V5 phủ 48/48 menu. Dữ liệu loại tín hiệu, source/label/reason/combo, entry/TP/SL, margin/leverage, DCA và order ID lấy nguyên từ common filled audit lúc entry; hỗ trợ symbol Unicode và link Coin Level/Binance.
- CLOSED dùng net Binance đã đối soát `gross − commission + funding`; DCA cùng `close_group_id` chỉ tính một lifecycle cho W/L. ACTIVE ghép exact symbol+hướng với Position Monitor/REST rồi phân bổ unrealized PnL tổng theo filled notional của các fill audit đang mở. Audit còn OPEN nhưng không thấy position được ghi `OPEN_UNCONFIRMED`, không tự gán thắng/thua/PnL. Đây là thống kê vận hành trên bộ lọc, không phải xác suất hay backtest.
- API không ghi Binance: không đặt/hủy/đóng lệnh, không đổi entry/size/leverage/SL/TP/DCA/protection. State audit V1/V2 được đọc nguyên, response additive và field thiếu giữ null; không migration/backfill. Các summary chỉ là telemetry quản lý, không tạo signal label/card/matcher WHITELIST; default OFF/CLOSED AvgROE `>4%` không đổi.

### 2026-10-03 — Discord vượt MAIN KILL 5m/15m · entry phản chiều

- Nâng lên `LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_V3_REVERSED_ENTRY_SIDE_20261003`. Alert LiqScan mới arm MAIN KILL tối đa 6 giờ; không replay lịch sử. Giữ 5m/15m đã đóng quét độc lập trên cùng vùng.
- Với từng khung, UPPER pass khi nến Futures đóng trên toàn vùng, close mới nhất vẫn trên vùng và tổng BID bên dưới trong Binance depth NEAR 0–3% + WIDE 3–20% lớn hơn tổng ASK bên trên. LOWER đối xứng khi đóng dưới vùng và tổng ASK bên trên lớn hơn BID bên dưới. Nến mới nhất quá 6m/16m, chuỗi nến đứt, analysis stale, thiếu total hoặc total không dương đều fail-closed. Dedupe/cooldown coin+hướng 4 giờ tách theo timeframe; 5m không chặn 15m. Một snapshot Coin Level được dùng chung khi hai khung cùng pass trong một vòng.
- Discord ghi rõ khung, vùng, close/MARK, hai tổng USDT, tỷ lệ và coverage. UPPER + BID dưới lớn hơn phát SHORT màu đỏ; LOWER + ASK trên lớn hơn phát LONG màu xanh. Đây là rule phản chiều theo yêu cầu, không phải xác suất. State delivery không tính WinRate/PF/AvgROE.
- Executor V2 dùng exact Auto Controls: MARKET 4 USDT margin ×5, TP +10%; LONG SL -20%, SHORT TP-only. Event cũ đã gửi/attempt không replay; chỉ event mới sau reload dùng hướng đảo. JSON additive; route keys giữ nguyên và máy hiện tại vẫn ON. Không có card thống kê/WHITELIST mới khi chưa có CLOSED AvgROE `>4%`.

### 2026-10-03 — FULL BYPASS chặn fail-closed Coin Level direction-flip

- Nâng controls lên `AUTO_ENTRY_CONTROLS_V35_DIRECTION_FLIP_FAIL_CLOSED_20261003` và runtime lên `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V8_DIRECTION_FLIP_FAIL_CLOSED_20261003`. Log MAGMAUSDT xác nhận FULL BYPASS đã gắn vị thế lúc 13:09:35, nhưng lúc 14:10:17 direction-flip SHORT→LONG gọi trực tiếp `handleNegativeTimeoutTp(force=true)`, hủy Algo TP cũ và đặt LIMIT reduce-only tại entry; đây là nhánh lọt hàng rào, không phải người dùng bật sai.
- Runtime nay kiểm tra exact symbol/exclusion ngay đầu mỗi pending direction-flip, trước cancel entry, Position Risk, MARKET close hay TP-at-entry. Helper TP-at-entry có guard thứ hai trước cooldown/API read/cancel/place, nên mọi caller trực tiếp cũng fail-closed. Coin không exclusion vẫn chạy rule V1 như cũ.
- Thay đổi thật trên Binance chỉ ngăn mutation mới cho coin đang bypass; không tự xóa lệnh entry-LIMIT đã tạo trước bản sửa, không đổi entry route, margin, leverage, TP/SL thủ công hoặc coin khác. Log skip là audit vận hành, không phải signal/tier/gate hay thống kê hiệu quả.
- JSON/state giữ nguyên schema và đọc tương thích V7; chỉ version string nâng. Không thêm label/card/matcher nên không có checkbox WHITELIST mới; mặc định OFF và policy CLOSED `AvgROE >4%` giữ nguyên.

### 2026-10-03 — Cảnh báo BTC sập sâu hoặc tăng nóng vào Discord hậu kiểm

- `BTC_EXTREME_MOVE_DISCORD_V2_CLOSED_15M_1H_4H_20261003` dùng cùng webhook AI Signal Review. Nến BTC Futures đã đóng đạt giảm `-0,75%/15m`, `-1,50%/1h` hoặc `-3,00%/4h` gửi cảnh báo đỏ; tăng đối xứng gửi xanh. Khung ngắn còn lại không được đi ngược mạnh.
- Dedupe theo closedAt, cooldown cùng hướng/level 60 phút; severity tăng, đổi hướng hoặc đã neutral rồi cực đoan lại được gửi ngay. Baseline lúc restart tránh bắn trạng thái cũ; không gửi recovery.
- Chỉ là BTC context `OBSERVE ONLY`; không gọi model/signed REST, không thay Binance/entry/size/SL/TP/DCA/protection và không có runtime matcher/WHITELIST. State/API chỉ additive, JSON cũ tương thích.

### 2026-10-03 — Discord hậu kiểm song song 1h và 4h

- `AI_SIGNAL_REVIEW_DISCORD_V2_DUAL_1H_4H_ENTRY_IMPROVEMENT_20261003`: báo cáo hoàn tất của `/ai-signal-review` chạy nền 30 phút/lần và xét hai horizon 1h/4h; kết quả tạm không gửi, mỗi horizon baseline pass cũ để tránh flood.
- Cùng rule phí+trượt0,12%: immutable sent snapshot, mẫu độc lập coin/hướng4h, vào ngay net dương, midpoint gốc chạm trong horizon và net dương, vùng cải thiện ít nhất0,10 điểm phần trăm, có follow-through sau nến chạm. Dedupe `eventId|1H`/`eventId|4H`, nên 1h báo sớm và 4h có thể xác nhận thêm. Discord hiển thị horizon, return, improvement, wait, MFE/MAE và BTC/regime/breadth gốc; LONG xanh/SHORT đỏ.
- Đây là outcome nhìn sau, `OBSERVE ONLY`, không phải entry mới hay xác suất. Không ảnh hưởng Binance/route/size/leverage/SL/TP/DCA/protection và không tạo runtime matcher/WHITELIST. API chỉ thêm `discord`, state dedupe mới additive; JSON cũ thiếu dữ liệu fail-closed.

### 2026-10-03 — Đưa Đánh giá tín hiệu vào toàn bộ menu

- `LOCAL_AI_NAVIGATION_ALL_MENUS_V4_SIGNAL_REVIEW_20261003`: ba trang legacy `decision-paper`, `intraday-combos`, `recommended-signals` nay có semantic nav, để injector chung phủ đủ 47/47 trang HTML và giữ đúng một link `/ai-signal-review` trên mỗi menu.
- Chỉ thay điều hướng. Không thay dữ liệu trước entry, phân loại, thống kê, Binance/entry/size/SL/TP, Discord hay WHITELIST; JSON/API cũ không đổi.

### 2026-10-03 — Trang đánh giá thời điểm và entry từ tín hiệu AI đã gửi

- Xuất báo cáo tạm mỗi10 coin để xem ngay khi backfill; nêu rõ số đã xử lý/tổng và chưa kết luận từ xếp hạng tạm. Cờ `partial` additive, report cũ không có cờ vẫn đọc được. Phân tích trên snapshot trước entry và nến outcome; không thay giao dịch.
- `AI_SIGNAL_REVIEW_V1_CAUSAL_ENTRY_COMPARISON_20261003`: `/ai-signal-review` có menu chung, filter coin/hướng/điểm/giờ/BTC/regime/breadth/model; gom state sent cũ và journal thành kho event lưu lâu dài. Báo cáo 30 ngày/20.000 mẫu, nến 15m tải qua shared Binance rate gate và cache, cập nhật nền khi bấm nút.
- Entry giả định dùng dữ liệu biết trước: baseline mở nến kế tiếp, midpoint đã lưu, hồi 0,5% từ baseline; chờ tối đa4h. Đánh giá với cùng giá thoát +1h/4h/24h; chi phí giả định0,12%, LONG `(exit-entry)/entry`, SHORT `(entry-exit)/entry`, chưa leverage/funding/TP/SL. Không tối ưu bằng đáy/đỉnh nhìn sau. So sánh paired, chạm/bỏ lỡ, TB mỗi cơ hội, MFE/MAE (loại nến chạm) và tách thiếu/chưa đủ kỳ; default dedupe coin+hướng4h, nhóm<20 mẫu ghi rõ.
- BTC động lượng tái dựng từ nến đóng trước giờ phát (1h ±0,1%) được phân biệt với BTC trend/regime/breadth gốc; missing không suy đoán. Journal V2 giữ bất biến snapshot của event đã gửi, thêm frames/targetPlan; V1/JSON cũ tương thích, state.sample cũ không dùng làm chứng cứ điểm gốc.
- Không ảnh hưởng Binance entry/size/SL/TP/Discord threshold. Không thêm label/card/runtime matcher giao dịch; bảng nghiên cứu OBSERVE ONLY không cấp WHITELIST và không chuyển lợi nhuận mô phỏng thành closed AvgROE. Policy default OFF, closed AvgROE>4% giữ nguyên; tài liệu chi tiết `docs/AI_SIGNAL_REVIEW.md`.

### 2026-10-03 — Tạm gỡ ngưỡng 65 Discord, thu thập cohort theo điểm

- Nâng notifier lên `LOCAL_AI_TREND_DISCORD_V7_NO_STRENGTH_GATE_HISTORY_20261003`: Discord trở lại nhận tất cả `PRIORITY/WATCH`, không loại `strength <=65`. Giới hạn top 3/vòng, dedupe, cooldown 30 phút, màu LONG xanh/SHORT đỏ và các thông báo BTC không đổi. Qualification 6/6 vẫn hiển tiêu chí 65 như thông tin chất lượng, không còn chặn webhook.
- Mỗi candidate post Discord thành công được ghi append-only vào `data/local-ai-trend-discord-history.ndjson` với nhóm `00_49/50_64/65_74/75_84/85_100/UNKNOWN`, giá live, vùng engine, timestamp, LONG/SHORT, verdict, BTC/breadth và Ollama/Fallback. Dữ liệu này dùng cho backtest causal sau; chưa được gọi là xác suất, WinRate hay edge.
- Không thay Binance route, entry, size, leverage, SL/TP/protection. JSON state cũ đọc nguyên, field sample mới và journal là additive; lịch sử cũ thiếu strength không được suy diễn. Không có card/matcher UI mới nên không thêm WHITELIST; default OFF/CLOSED `AvgROE >4%` giữ nguyên.

### 2026-10-03 — Discord candidate AI chỉ gửi khi độ rõ >65

- **Trạng thái:** logic này đã được V7 bên trên thay thế; giữ lại chỉ để audit thay đổi.
- Nâng notifier lên `LOCAL_AI_TREND_DISCORD_V6_CANDIDATE_STRENGTH_GT65_20261003`. Mỗi evaluation chỉ chọn candidate có verdict `PRIORITY/WATCH` và strength lớn hơn 65; đúng 65 bị loại. Sau filter mới lấy tối đa 3 dòng, giữ dedupe theo symbol+hướng+verdict+nến nguồn và cooldown 30 phút.
- Input vẫn là evaluation causal hiện tại với vùng engine và BTC/breadth; không dùng outcome hoặc chạy thêm inference. `strength` chỉ là điểm độ rõ, không phải xác suất. Dự báo BTC và cảnh báo BTC tăng/giảm/dừng mạnh không đi qua filter này.
- Đây chỉ là điều kiện gửi webhook; không thay signal/tier/gate Binance, entry, size, leverage, SL, TP hoặc protection. State JSON cũ tương thích, snapshot thêm rule audit. Không thêm label/card/matcher mới nên không thêm WHITELIST; default OFF và CLOSED AvgROE `>4%` giữ nguyên.

### 2026-10-02 — Dự báo vùng giá trên Main Kill Gap

- `MAIN_KILL_PRICE_FORECAST_V1_CONDITIONAL_20261002`, page/API V2: thêm cột hướng, vùng kiểm tra đầu, MAIN tiếp theo nếu đủ điều kiện, trigger và mốc vô hiệu. Dùng snapshot <=5 phút, nến đóng 5m/15m cùng hướng còn mới, cấu trúc và depth Binance; 1h/BTC giải thích xung đột, BTC evaluation >20 phút không được xem là hiện tại. Không inference mới hay dữ liệu tương lai.
- Vùng đầu chọn gần nhất đúng hướng nến, MAIN chỉ được dùng khi active và còn ở phía trước; MAIN ngược hướng/consumed không được dùng làm mục tiêu. Nến xung đột/thiếu/cũ không cấp dự báo giá. Theo dõi 15m–1h, không cam kết ETA hay xác suất. Mốc vô hiệu từ mép cấu trúc đối diện là tham khảo.
- Không thay thống kê/counts/sort hay gate, không ảnh hưởng Binance/entry/size/SL/TP/Discord. Chỉ thêm JSON `priceForecast`, thiếu field render an toàn, không migration. Cột giải thích không phải card thống kê/nhãn matcher nên không có WHITELIST mới; default OFF và closed AvgROE >4% hiện hữu giữ nguyên.

### 2026-10-02 — Cộng tổng thanh khoản order book phía trên và phía dưới

- Nâng Coin Level/profile/chatbot lên `COIN_LEVEL_ANALYSIS_V11_ORDER_BOOK_SIDE_TOTALS_20261002`, `BINANCE_ORDER_BOOK_RANGE_PROFILE_V2_SIDE_TOTALS_20261002` và `LOCAL_AI_TREND_CHAT_V16_ORDER_BOOK_SIDE_TOTALS_20261002`. Kết quả hỏi một coin có thêm hai dòng màu: tổng BID bên dưới MARK và tổng ASK bên trên MARK, kèm USDT và tỷ trọng hai phía.
- Phép tổng dùng toàn bộ level Binance Futures depth hợp lệ trong NEAR `0–3%` cộng WIDE `>3–20%` thực sự được response phủ tới, không chỉ top bucket được vẽ. Hai band không chồng nhau nên không cộng trùng. Cache/JSON cũ thiếu totals vẫn hiển thị bằng tổng các zone nhìn thấy và giữ caveat coverage.
- Đây là snapshot quote-notional order book có thể bị rút, không phải liquidation proxy, xác suất, WinRate hay kết luận LONG/SHORT. Không đổi signal/tier/gate, Ollama verdict, Discord hoặc Binance entry/size/leverage/SL/TP/protection. JSON chỉ thêm field, không migration; không phải card/matcher hiệu quả nên không thêm WHITELIST, default OFF/CLOSED AvgROE `>4%` giữ nguyên.

### 2026-10-02 — FULL BYPASS được gài đúng vòng vị thế kế tiếp

- Nâng Auto Controls lên V34/runtime V7. Điều tra `龙虾USDT` xác nhận lần bật 19:39:56 rơi đúng sau vòng vị thế cũ đã đóng, nên REST reconcile V6 tự gỡ 6 giây sau; vị thế mới lúc 19:40:12 vì vậy nhận TP/SL tự động. Đây là lỗi gắn lifecycle, không phải scanner cố tình bỏ qua danh sách.
- FULL BYPASS nay lưu `armedAt/activeSeenAt`: chưa thấy vị thế active sau lúc bật thì giữ `ĐÃ GÀI CHỜ VỊ THẾ`, không cho close snapshot cũ tự gỡ. Khi vị thế đang mở hoặc full-fill mới được thấy, state chuyển `ĐÃ GẮN VỊ THẾ`; chỉ close/reversal của chính vòng đó mới tự gỡ. JSON cũ thiếu metadata được đọc tương thích và bind ở quan sát vị thế thật đầu tiên.
- Thêm hàng rào tại Binance client: conditional reducing order (STOP/TAKE_PROFIT/TRAILING hoặc Algo) bị từ chối khi symbol đang exclusion, nên nhánh protection quên high-level guard cũng không thể tạo/dời SL/TP. Market close tay vẫn được phép; entry, size và leverage không đổi; TP/SL đã có không bị hủy khi bật.
- State/event chỉ là audit vận hành, không tạo signal/tier/gate hay thống kê hiệu quả. Không thêm matcher/card/WHITELIST; default OFF và policy CLOSED `AvgROE >4%` giữ nguyên. Test bao phủ stale close trước vị thế, bind sau full-fill/REST, clear sau close và low-level protection fence.

### 2026-10-02 — Trang AI xác nhận khoảng trống MARK → MAIN KILL

- Thêm `/main-kill-gap-watch`, version `LOCAL_AI_MAIN_KILL_GAP_WATCH_V1_ATR_DEPTH_VACUUM_20261002`, vào menu toàn hệ thống. Trang lấy top 10 evaluation AI hiện tại và ghép dữ liệu Coin Level/LiqScan/order book Binance đang xử lý, không chạy thêm inference. Nếu cache model chưa có sau restart, dùng đúng shortlist deterministic đầu vào AI với nhãn `UNRATED/PENDING_MODEL`, không hiện 0 giả và không giả kết quả model.
- Khoảng rộng chỉ đạt khi mép MAIN còn active, cách MARK ít nhất `1,2%` và `2 ATR15`. Vacuum chỉ xác nhận nếu Binance depth đã phủ tới MAIN và top depth trung gian chiếm tối đa `25%` tổng top depth đúng phía; thiếu ATR/coverage không suy đoán. MAIN consumed giữ trạng thái consumed.
- Card đếm chỉ là snapshot vận hành, không phải probability/WinRate. Toàn trang OBSERVE ONLY, không thay signal/gate/tier giao dịch, Discord, Binance entry/size/leverage/SL/TP/protection hoặc JSON cũ. Không tạo runtime matcher/card hiệu quả nên không thêm WHITELIST; default OFF/CLOSED AvgROE `>4%` giữ nguyên.

### 2026-10-02 — Hover chart AI hiện USD thanh lý proxy theo vùng

- Nâng chart lên `LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V5_HOVER_LIQUIDATION_USD_20261002` (UI v38/CSS v11). Hover MAIN/FAR hiển thị giá, lifecycle, giá trị thanh lý proxy rút gọn K/M/B USD và tỷ trọng phía TRÊN/DƯỚI; vùng consumed ghi rõ giá trị snapshot đã quét.
- Dữ liệu dùng trước entry là score vùng Binance LiqScan 15m đã có, được mô hình hóa từ quote-volume, pressure, tuổi nến và leverage weight. Đây là ước tính proxy, không phải số vị thế thanh lý thật; tooltip luôn có cảnh báo. Thiếu score giữ thiếu, score `0` không bị đổi thành null.
- Không thay phân loại signal/gate/tier hoặc thống kê hiệu quả; không gọi thêm Binance/Ollama khi hover. Không đổi JSON/state, Discord, Binance entry/size/leverage/SL/TP/protection. Không thêm card/matcher/WHITELIST; default OFF/CLOSED AvgROE `>4%` không đổi.

### 2026-10-02 — Khôi phục phiên lưu cho hai input protection

- Sửa Auto Controls để token Orders hết hạn sau restart không làm thao tác im lặng thất bại: request `401` được xác thực lại bằng `.env` local hoặc `orders_creds` đã lưu, sau đó retry write đúng một lần. Trên domain public, nhánh `.env` bị từ chối như cũ và mới fallback an toàn sang phiên người dùng đã lưu.
- Nếu browser public không còn credential, nút Mở quyền dùng `ORDERS_PASSWORD`; password không được lưu, server chỉ cấp session sau khi signed REST Binance từ `.env` xác minh thành công. Có giới hạn 5 lần sai/khóa 10 phút và kiểm tra same-origin hiểu đúng HTTPS reverse proxy.
- Hai form tạm bỏ qua và FULL BYPASS không còn xóa `US/USUSDT` trước khi server xác nhận. Thành công mới xóa; thất bại giữ input và hiện `KHÔNG LƯU`. Normalizer/runtime vẫn lưu `USUSDT`, không thay lifecycle mode.
- Không đổi dữ liệu trước entry, phân loại, thống kê, Binance entry/size/leverage/SL/TP/Discord hoặc JSON cũ. Không thêm card/matcher/WHITELIST; default OFF và CLOSED AvgROE >4% giữ nguyên. Có browser test mock stale-token, password unlock và cả hai input.

### 2026-10-02 — Hiện lịch sử lưu/tự gỡ protection theo coin

- Log xác nhận `US` đã được chuẩn hóa thành `USUSDT`, FULL BYPASS hoạt động từ 13:16 và tự gỡ lúc 13:18 khi Binance xác nhận `POSITION_CLOSED`; vì danh sách active chỉ hiện rule còn hiệu lực nên trước đây trông giống chưa lưu.
- Nâng controls lên V33/runtime V6. Mỗi thao tác bật/gỡ và mỗi lần tự gỡ do ROE, đóng hoặc đảo chiều được lưu tối đa 20 event; trang hiển thị 6 event gần nhất gồm symbol, mode, trạng thái, lý do và thời gian. Dữ liệu chỉ dùng exact symbol, mode và lifecycle Binance hiện hữu; không dùng outcome tương lai.
- Đây là audit vận hành, không đổi phân loại tín hiệu, thống kê hiệu quả, entry, size, leverage, TP/SL/protection đang chạy hoặc Discord. JSON thêm `protectionExclusionEvents` tùy chọn; file cũ mặc định rỗng. Không thêm card/matcher/WHITELIST; policy OFF/CLOSED AvgROE >4% giữ nguyên.

### 2026-10-02 — Hover vùng quét và tỷ trọng thanh khoản

- Version `LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V4_HOVER_LIQUIDITY_20261002` (UI v37/CSS v10): tooltip giá kèm MAIN/FAR KILL, score proxy và tỷ trọng phía thanh khoản từ snapshot đã có trước trả lời/entry; không tải thêm API/model và không dùng outcome.
- Phân loại theo biên vùng và lifecycle: vùng đã tiêu thụ không trình bày là mục tiêu active; FAR ngoài scale xem qua chỉ báo riêng. Null không biến thành 0, thiếu lifecycle ghi chưa rõ. Tỷ trọng toàn snapshot không phải xác suất vùng sẽ bị quét; tooltip ghi chưa có dữ liệu hiệu chuẩn.
- Không thống kê hiệu quả mới, không thay đổi JSON/state, Binance entry/size/SL/TP hoặc Discord. Tooltip OBSERVE ONLY, không card/matcher/WHITELIST mới; policy OFF/CLOSED AvgROE >4% không đổi. Kiểm thử gồm MAIN, FAR, ngoài vùng, consumed, thiếu tỷ trọng và giá trị 0 hợp lệ.

### 2026-10-02 — LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V2_NO_OVERLAP

- Khi chatbot order-book trả đúng một coin, UI vẽ chart SVG từ Binance Futures
  depth snapshot: BID/ASK, NEAR/WIDE, MARK và overlay LiqScan 15m `MAIN KILL`/
  `FAR KILL`. MAIN/FAR có range, khoảng cách, score proxy và trạng thái lifecycle;
  vùng consumed/swept/rejected bị làm mờ. Depth là order book thật tại snapshot,
  còn kill zone chỉ là proxy, không được trình bày như lệnh treo xác thực.
- V2 chỉ sửa trình bày: thanh depth không còn chữ chồng; MAIN/MARK nằm trên scale
  giá gần, FAR có đường chỉ báo ngoài scale và card riêng để vùng xa không nén
  toàn bộ chart. Pill order book/sweep dùng lưới hai cột, mỗi giá ở dòng riêng.
- Dữ liệu hoàn toàn causal tại lúc hỏi, không CoinGlass/PnL/nến tương lai. Đây là
  OBSERVE ONLY; không đổi Discord/Binance/entry/size/leverage/SL/TP, không tạo
  thống kê/ranking và không thêm signal/card/key WHITELIST. Default OFF cùng điều
  kiện checkbox CLOSED AvgROE>4% không đổi.
- JSON V14 chỉ thêm `farKillZone`, score/distance bounds và scenario mark/main/far;
  response cũ thiếu field vẫn chạy, UI ẩn phần không có dữ liệu, không migrate.

### 2026-10-01 — LOCAL_AI_TREND_INFERENCE_PROFILE_V3_INDEXED_RATINGS

- Giữ `qwen3:8b` và Top 10 causal nhưng dùng context4096, output384, batch128.
  Model chỉ sinh 10 rating theo index gồm verdict/strength/path; server ghép lại
  symbol/side, horizon, lý do/rủi ro và vùng deterministic. Input trước entry, 6
  check và tập verdict không đổi; fallback vẫn được ghi rõ và không giả Ollama.
- Ranking/strength không phải xác suất hoặc trade stats. UI phân biệt model online
  với inference thành công: nếu lần gọi gần nhất timeout/lỗi thì status hiện lỗi,
  thay vì chấm xanh theo riêng `/api/tags`.
- Không đổi Discord/Binance/entry/size/leverage/SL/TP. PRIORITY model hợp lệ vẫn
  theo route zone 3USDT×5 hiện hữu; fallback luôn fail-closed. JSON chỉ thêm
  `usage.inferenceProfile`/snapshot `inferenceProfile`, legacy vẫn đọc và không
  rewrite. Không có card/key WHITELIST mới; default OFF và CLOSED AvgROE>4% giữ
  nguyên.

### 2026-10-01 — LOCAL_AI_HOURLY_BTC_GUIDANCE_V1

- Thêm banner màu trên trang AI, kết hợp direction của forecast giờ VN/BTC hiện
  tại với Top 10 AI. Xanh=nghiêng LONG, đỏ=nghiêng SHORT, vàng=NEUTRAL; lý do ghi
  BTC 1h/4h, giờ và quality lịch sử.
- List hai phía chỉ gồm `PRIORITY/WATCH`, xếp verdict rồi strength; `WAIT/AVOID`
  không được gọi là điểm vào. Đây là danh sách snapshot quan sát, không phải số
  lệnh, WinRate hay dự báo bảo đảm.
- OBSERVE ONLY: không đổi Discord/Binance/entry/size/leverage/SL/TP. Banner dùng
  exact key `btc-hourly-forecast:{LONG|SHORT|NEUTRAL}` hiện hữu; default OFF và
  chỉ hiện checkbox khi CLOSED AvgROE>4%. Snapshot thêm key/observation additive,
  cache/trade JSON cũ vẫn đọc được và không rewrite.

### 2026-10-01 — BTC_HOURLY_ENTRY_FORECAST_V3_ALL_SIZES_CLEAR_BEST_HOURS

- Mở thống kê từ riêng margin5 sang mọi entry bot margin dương, vẫn loại DCA và
  `binance-manual-socket`. Join BTC causal trước fill tối đa600s; phân nhóm giờ VN,
  LONG/SHORT, margin, BTC trend1h, dấu momentum15m và band return1h ±0,3%.
- Chấm ưu tiên exact `giờ + BTC trend + momentum15m + move1h` mẫu>=4, lùi về
  `giờ + BTC trend` mẫu>=6 rồi riêng giờ mẫu>=12. Quality dùng AvgROE và ROE-PF
  để size lớn không chi phối; net/PF USDT chỉ mô tả. Cache rebuild có 2.014 close,
  1.965 BTC-match; UI công bố breakdown size
  và profile BTC hiện tại.
- UI trong chính card hiện hữu liệt kê riêng top giờ LONG và SHORT; mỗi dòng ghi
  rõ giờ VN, hướng, BTC UP/DOWN/FLAT, điểm và cỡ mẫu. Chỉ tổ hợp hour×BTC-trend
  đủ >=6 close mới được liệt kê; không thêm nhãn giao dịch hoặc card mới.
- Hoàn toàn OBSERVE ONLY: không gate/entry/size/leverage/SL/TP/Discord. JSON V3
  thêm profile/margin/best-hour rows nhưng giữ field V1/V2; runtime vẫn đọc cả
  V1/V2 và fallback.
  Không thêm signal/card key WHITELIST; default OFF, CLOSED AvgROE>4% giữ nguyên.
  Tests bao phủ exact profile, fallback tầng, all-size filter, UI và legacy cache.

### 2026-10-01 — LOCAL_AI_TOP10_OVERALL_V1

- Nâng evaluator thành `LOCAL_AI_TREND_EVALUATOR_V3_TOP10_OVERALL_20261001`:
  dedupe `symbol|side`, xếp source/trend/entry/volume/khoảng cách và lấy thẳng Top
  10 toàn pool. Không reserve 5 LONG/5 SHORT; kết quả 10/0 theo một hướng là hợp lệ.
- Qwen nhận đủ pool, trả `candidates[]` đúng số dòng và sort strength giảm dần;
  fallback V2 cũng trả tối đa 10 toàn cục. UI ghi rõ Top 10 toàn engine. Đây là
  ranking snapshot, không phải xác suất, WinRate, PnL hoặc thống kê lệnh.
- Không thêm gate/route/label/size/SL/TP. Model path có thể tạo nhiều PRIORITY/
  WATCH hơn nên Discord và route PRIORITY engine-zone hiện hữu sẽ xét nhiều dòng
  hơn khi controls ON; route vẫn 3 USDT×5, touch/TTL/protection cũ. Fallback vẫn
  không cấp quyền Binance. Legacy `longCandidate`/`shortCandidate` vẫn normalize;
  không migrate JSON. Không thêm card/key WHITELIST, default OFF và CLOSED
  AvgROE>4% giữ nguyên. Tests kiểm 10/0, schema array, sort và fallback Top 10.

### 2026-10-01 — BTC_HOURLY_ENTRY_FORECAST_V1_DAILY_CAUSAL · superseded by V3

- Thêm card đầu trang AI và API snapshot dựa trên fill bot 5USDT đã đóng: bỏ DCA/
  lệnh tay, giờ UTC+7, ghép BTC snapshot causal trước entry tuổi<=600s. Cache daily
  độc lập được refresh mặc định 6 giờ, gồm coverage/hash nguồn, 24 giờ và nhóm
  giờ × BTC UP/DOWN/FLAT × LONG/SHORT; thiếu BTC giữ UNKNOWN.
- qualityScore trộn win frequency smooth + AvgROE + profit factor, chỉ là điểm mô
  tả. Mẫu giờ/hướng>=12, mẫu điều kiện BTC>=6; nếu đủ cả hai dùng 35% nền giờ +
  65% điều kiện BTC. LONG/SHORT cần score>=53 và edge>=4, còn lại NEUTRAL. UI
  hiển thị sample/net/PF, BTC1h/4h, lịch24h và giờ đáng chú ý kế tiếp.
- Hoàn toàn OBSERVE ONLY: không gate/route, không đổi entry/size/leverage/SL/TP,
  Discord hay vị thế cũ. API/file additive, JSON cũ không migrate. Các exact key
  `btc-hourly-forecast:*` mặc định OFF; chưa gắn trade nên không cohort/checkbox,
  policy chỉ hiện khi CLOSED AvgROE>4% giữ nguyên. Tests dùng mock và kiểm matcher.

### 2026-10-01 — LOCAL_AI_DETERMINISTIC_FALLBACK_V1_NO_BINANCE

- Khắc phục pipeline altcoin dừng khi Windows Ollama `qwen3:8b` không cấp phát được
  CPU buffer/page file. Scheduler vẫn thử model nhưng mọi lỗi inference/model-not-
  ready chuyển sang causal fallback từ closed retest, very-strong active, early
  watches, entry/trend/volume score, khung đóng, BTC 1h/4h và breadth hiện tại.
- Fallback phân loại context BTC/breadth, tính strength không phải xác suất và xếp
  tối đa 10 candidate toàn pool. PRIORITY cần strength>=65 + nguồn structural + path
  RETEST/CONTINUATION + không conflict; WATCH>=52. Discord gắn rõ ENGINE FALLBACK,
  không giả là kết quả Ollama. Snapshot/verdict không phải trade stats.
- Fallback luôn OBSERVE ONLY và fail-closed với Binance: modelApplied false,
  priorityZoneExecutionEligible false, runner không arm setup dù candidate PRIORITY.
  Route model hợp lệ, size3×5, entry/SL/TP cũ không đổi; không sửa vị thế hiện hữu.
- JSON chỉ thêm metadata fallback/failure, legacy thiếu field vẫn chạy model path.
  Không thêm signal key/card/tier/WHITELIST; default OFF và closed AvgROE>4% giữ
  nguyên. Tests mock lỗi buffer/offline/Discord/Binance và xác nhận active setup=0.

### 2026-10-01 — ORDER_BOOK_NEAR3_WIDE20_V1

- Coin Level V10 và Local AI Chat V13 lấy public Binance Futures depth 1000 level
  của coin được hỏi; nến đóng 5m/15m/1h/4h, BTC/breadth, volume và vùng engine
  vẫn là dữ liệu causal chính. Không dùng CoinGlass order book; LiqScan 15m chỉ là
  proxy từ nến và luôn được gắn nhãn riêng.
- `NEAR` 0–3% gom bucket 0,25%, top4 BID/ASK theo notional cho entry context;
  `WIDE` >3–20% gom bucket 1%, top6 BID/ASK cho vùng thanh khoản xa. Payload/UI
  công bố coverage BID/ASK thực tế; depth 1000 chưa chạm20% thì không nội suy và
  WIDE được phép thiếu/rỗng. Candles/trend là chính, WIDE/LiqScan chỉ phụ trợ.
- Đây là snapshot OBSERVE ONLY: notional/distance/level count/coverage không phải
  trade stats hay xác suất, không tác động Binance/gate/entry/size/leverage/SL/TP
  hoặc Discord. `orderBookProfile` là field additive; JSON cũ fallback zone cũ
  thành NEAR và WIDE rỗng, không rewrite. Không thêm label/tier/card/WHITELIST;
  default OFF và policy CLOSED AvgROE >4% giữ nguyên. Tests dùng mock, không gửi
  lệnh hoặc Discord thật.

### 2026-10-01 — TOXIC_TWO_SIDE_MARKET_V1_20261001

- Thêm page `/toxic-two-side-market` quét Futures USDT và xếp score rủi ro hai đầu
  từ Binance shared market, funding, quote volume/cap CoinGecko cache cùng nến đóng
  5m/15m/1h/4h đã có trong cache. Mã cực đoan thiếu cap dùng fallback CoinGecko
  giới hạn 12, concurrency2, cache6h; không gọi kline Binance cho riêng page và
  không dùng order book/CoinGlass/PnL tương lai.
- Score gồm biến động/ATR30, turnover20, xung đột trend15, funding-price divergence15
  và fake-break hai phía20; tier EXTREME75, HIGH60, WATCH45, NORMAL. Counts/range/
  turnover/sweeps là snapshot quan sát, không phải hiệu quả giao dịch hay xác suất.
- OBSERVE ONLY: không ảnh hưởng Binance, gate, entry, size, leverage, SL/TP hoặc
  Discord. Bốn key `toxic-two-side:*` exact UI/runtime mặc định OFF, chỉ hiện
  checkbox khi CLOSED AvgROE >4%; hiện chưa có cohort. JSON cũ thiếu observation V1
  không match và không migrate; market fields mới additive. Tests kiểm score,
  filter/sort, menu, whitelist/default OFF và boundary 4% bằng dữ liệu mock.

### 2026-10-01 — IMPULSE_TIME_OR_BTC_MARGIN5_ELSE1_V1_20261001

- Theo yêu cầu: hai route IMPULSE chọn margin5 nếu giờ tốt HOẶC BTC cùng hướng,
  ngoài ra margin1. LONG 03–06/12–15h, SHORT 00–09/18–21h VN (đầu bao gồm, cuối
  không bao gồm); BTC UP/LONG, DOWN/SHORT từ snapshot trước entry tuổi<=120s.
  BTC thiếu/cũ không tăng size ngoài giờ tốt. ret15m/ret1h là giải thích, không thêm gate.
- Runner V7/policy V48/controls V31 cùng kiểm tra decision size, giữ master/route
  và stage LONG BUY_IMPULSE / SHORT NO_BUY_CONFIRMATION. Size/notional entry mới
  thay đổi, leverage5/TP10/SL plan20-30ROE và quản lý protection cũ không đổi.
  Ceil min-notional tối đa1% nếu đủ requested minimum; không đủ thì không vào.
- Discord ghi size/lý do/giờ/BTC và trạng thái xét từ cùng plan; gửi xác nhận riêng
  vẫn dùng notifier này. Fill audit lưu reason; không thêm card/thống kê/WHITELIST,
  không đổi policy closed AvgROE>4%, không bật route OFF hay sửa lệnh đang mở.
- JSON cũ giữ attempts/dedupe/controls enabledAt, thiếu sizing không bịa kết quả;
  thống kê vẫn net CLOSED audit, OPEN riêng. Kiểm thử boundary/OR/freshness,
  authorization/controls/legacy/dedupe/Discord/min-notional bằng mock.

### 2026-10-01 — MARGIN5_ENTRY_TIME_BTC_AUDIT_V1_20261001

- Thêm báo cáo offline entry 5 USDT × giờ Việt Nam × BTC trước fill. Lọc fill thật,
  loại DCA/lệnh tay; ghép snapshot có loggedAt/evaluatedAt <= entry và tuổi <=600s,
  đối chiếu thêm <=300s. Thiếu dữ liệu giữ UNKNOWN, không dùng snapshot tương lai.
- Nhóm theo giờ/ngày/signal/hướng, BTC trend, momentum15m và ret1h ±0,3%; các nhóm
  chỉ là phân loại thống kê, không phải tín hiệu/gate mới. Net theo CLOSED sau phí
  và funding trong audit, OPEN riêng; vòng nhiều entry có phân bổ PnL theo notional,
  thêm cohort single-entry để kiểm tra ảnh hưởng trộn vị thế.
- Không tác động Binance/entry/size/SL/TP, không thêm UI/WHITELIST, không gửi Discord.
  Đọc JSON/CSV cũ không migrate; báo cáo riêng versioned có hash, thời điểm chụp,
  từng entry, nguồn BTC và tuổi snapshot. Assertions kiểm tra ghép không look-ahead.

### 2026-09-27 — DUMP_CAP_REJECTION / RESISTANCE / DISCORD V1

- Thêm page `/dump-cap-rejection` đối xứng SHORT trên 5m/15m/1h/4h/1d. Nến xả
  đóng cần range2,5ATR, open−low1,8ATR, vol2×median20; nến sau hồi open±0,15ATR.
  Stage AT_CAP/REJECTING/VOLUME_REJECTION/INVALIDATED dùng tối đa96 nến và chỉ
  dữ liệu đóng causal. 3 close giảm + volume tăng, vol cuối1,2× xác nhận stage.
- Entry SHORT tham khảo cần vùng open/pivot-high2/2/broken-base causal, retest râu
  trên≥25% với volume co≤80%, nến kế đỏ phá low + volume tăng. Stop cấu trúc+0,1ATR,
  hỗ trợ gần nhất làm target, R:R ròng≥1,5. Live pass cần snapshot≤90s, MARK≤15s,
  plan≤3 nến, gần kháng cự≤1ATR và entry−0,35/+0,25ATR; không đuổi giá đã rơi xa.
- Discord server-side gửi đỏ một lần khi MARK thật sự pass, không replay trước
  startup; latch stop, dedupe, delivery-state/429 giống feed LONG. Cùng webhook
  đích theo yêu cầu nhưng env key riêng. Không gửi test, không lộ secret.
- 60 key WHITELIST exact UI/runtime, OFF mặc định, chỉ CLOSED AvgROE>4%; hiện
  không có closed stats. Page/delivery counts không phải WinRate/PnL. OBSERVE ONLY,
  không đổi Binance/entry thật/size/leverage/SL/TP. JSON cũ thiếu version/metadata
  fail closed, không migrate. Tests bao phủ 5 frame, causal target, RR, live stop,
  key parity/default OFF, Discord baseline/dedupe/invalidation bằng mock.

### 2026-09-27 — PUMP_BASE_SUPPORT_DISCORD_V1_20260927

- Thêm runner server-side cho đúng plan hỗ trợ pump-base đã xác nhận ở 5 khung.
  Trước khi gửi bắt buộc snapshot≤90s, MARK≤15s, chưa hết hiệu lực/chưa phá stop,
  MARK trong vùng entry, cách hỗ trợ≤1ATR và R:R live ròng≥1,5. MARK từng xuyên
  stop được latch invalid; không gửi chỉ vì giá hồi lại.
- Discord xanh `HỖ TRỢ LONG ĐÃ PASS` ghi loại vùng, entry nến đóng, MARK, vùng
  hợp lệ, stop/cản/R:R và thời gian VN. Dedupe symbol+frame+confirmedAt; không
  replay tín hiệu trước startup, không retry mù POST không rõ kết quả, 429 kiểm lại
  live trước retry. Webhook chỉ ở `.env`; API không lộ secret.
- Delivery counts không phải performance stats. Không thêm nhãn/card/WHITELIST;
  40 key support cũ vẫn OFF và cần CLOSED AvgROE>4%. Không ảnh hưởng Binance,
  entry thật, size, leverage, SL/TP. State JSON riêng versioned; dữ liệu/trade cũ
  không migrate và vẫn đọc như trước. Test dùng mock Discord, không gửi tin thử.

### 2026-09-27 — PUMP_BASE_SUPPORT_V1_20260927

- Thêm hỗ trợ LONG/entry tham khảo trên pump-base 5m/15m/1h/4h/1d. Dữ liệu
  trước entry là nến đóng, ATR trước bơm, vùng open/pivot low2/2/đỉnh nền3 nến
  đã phá. Retest rút chân+volume≤80% nến tăng gần nhất mạnh nhất trong6 nến;
  nến kế vượt high retest với volume tăng mới xác nhận. Cản gần nhất causal,
  stop cấu trúc−0,1 ATR, R:R≥1,5 trừ chi phí giả định0,12%; chưa backtest.
- Xanh/entry cần MARK≤15s, snapshot≤90s, plan≤3 nến, gần hỗ trợ≤1ATR và
  entry−0,25/+0,35ATR. Giá xa/mất mốc/cũ/mất socket không giữ xanh. Đếm hỗ trợ
  trên50 dòng đang xem, không outcome/stats giao dịch. WHITELIST40key exact,
  OFF mặc định, CLOSED AvgROE>4% mới hiện; hiện chưa có closedstats.
- OBSERVE ONLY: không đổi Binance/entry thật/size/SL/TP; notifier V1 ở mục trên
  chỉ gửi Discord khi MARK live thật sự pass, không biến cảnh báo thành lệnh.
  JSON additive support; JSON cũ thiếu field/version fail closed, không migrate.
  UI latch quote mất mốc trong phiên browser; notifier Discord V1 có latch MARK
  server riêng cho candidate đã biết và persist ở lượt scan kế.


### 2026-09-27 — PUMP_BASE_RECOVERY_V1_20260927

- Thêm trang + menu V2 `/pump-base-recovery`: 5m/15m/1h/4h/1d, nến bơm lớn
  (range2,5 ATR, mở–đỉnh1,8 ATR, vol2× median20, đóng>=mở), nến sau trả open
  ±0,15 ATR hoặc quét dưới rồi hồi. Baseline20 trước bơm, chỉ nến đã đóng,
  tối đa128 nến/96 nến sau bơm. Xác nhận quan sát bằng 3 close+volume tăng sau
  retest, vol cuối1,2× và lấy lại open; có AT_BASE/RECOVERING/WEAKENED riêng.
- Thống kê case theo symbol/frame/pumpTime, unique coin riêng; không outcome
  hoặc tỷ lệ thắng. Cache coverage/thiếu/cũ/gap hiển thị; scan TTL30s singleflight
  cooperative, gộp bucket đầy đủ. Bổ sung cache nền 1request/15s, chỉ viewer active,
  tôn trọng rate gate; socket50 coin/page không đổi nhãn nến đóng.
- **Không ảnh hưởng Binance/entry/size/SL/TP và không gửi Discord.** Nhãn quan sát
  không phải gate thật. Ngưỡng chưa backtest. WHITELIST20 key UI/runtime khớp,
  mặc địnhOFF, chỉ CLOSED AvgROE>4% mới hiện checkbox (hiện chưa có stats).
- JSON cũ không migrate, thiếu `pumpBaseObservation`/version không match key;
  test causal5frame, gộp/gap/stale, stages, cache TTL và rate-limited warmup.


### 2026-09-27 — POST_MOVE_IMPULSE_ENTRY_V1_20260927

- Webhook candle riêng đổi sang chỉ gửi điểm vào sau impulse: RETEST tiếp diễn hoặc
  BASE_BREAK 2–4 nến; theo dõi BUY_IMPULSE/SELL_IMPULSE gốc tối đa 60 phút, kể cả
  khi watch gốc rời snapshot. Nến 5m đóng xác nhận, mốc vô hiệu cấu trúc +0,1 ATR,
  mục tiêu cản gần nhất và R:R ròng ≥1,5 (chi phí giả định 0,12%) là điều kiện báo.
- Input trước entry: cache nến đóng, vùng gốc, ATR/pivot trước impulse; không nhìn
  tương lai/PnL. MARK ≤15 giây, pass ≤90 giây, drift thuận chiều ≤0,35 ATR, còn giữ
  mốc và R:R live đạt. BTC 15m/1h từ nến 5m đóng chỉ là metadata, không là gate.
- Panel BTC Session và API riêng hiển thị trạng thái/delivery, chưa tính kết quả
  trading. Ngưỡng V1 thử nghiệm, chưa backtest so sánh với MARKET/confirmation.
- WHITELIST exact keys `btc-session:ENTRY:{LONG|SHORT}:{RETEST|BASE_BREAK}` nối
  UI/runtime, OFF, chỉ hiện khi CLOSED AvgROE >4%; hiện avgRoe=null nên ẩn.
  Test bao gồm key parity/default OFF, nến chưa đóng/future/gap, 2 hướng/2 mẫu,
  RR/cản gần, socket stale/chase, pending qua restart, dedupe, Discord 429/timeout.
- Không đổi Binance/entry thật/size/SL/TP hay feed confirmation/cảnh báo cũ. Entry,
  stop và target mới chỉ tham khảo trên Discord. State riêng versioned, JSON cũ
  không migrate; pending tiếp tục sau restart, pass cũ không replay; trade thiếu
  `impulseEntryObservation` không match key mới. POST không rõ kết quả không retry.

### 2026-09-26 — BTC Session vẫn gửi LONG khi `allowLongEntry=false`

- `BTC_SESSION_CONTEXT_V2_IGNORE_LONG_MARKET_REGIME_20260926` xóa riêng nhánh chặn LONG theo `marketRegime.allowLongEntry`. Candidate/nến đóng/retest, MARK fresh, BTC 1h cùng hướng, session, vùng entry, stale/broken/dual vẫn được kiểm tra như cũ; market regime tiếp tục hiển thị và đi kèm Discord dưới dạng context tham khảo.
- `BTC_SESSION_CONTEXT_READY_DISCORD_V2_IGNORE_LONG_MARKET_REGIME_20260926` gửi transition rank 3/màu xanh-đỏ như trước. Dedupe theo setup, baseline/retry và webhook không đổi. Đây chỉ là OBSERVE ONLY; Coin Level/Binance LONG thật vẫn giữ RISK_ON gate, không đổi entry/size/leverage/TP/SL/order/position.
- Không đổi stats, label route, tier/card hoặc WHITELIST; reserved key theo side/session vẫn default OFF và cần CLOSED AvgROE `>4%`. `BTC_SESSION_OBSERVE_V1_20260926` được giữ cho JSON/stats/trade compatibility; rule/notifier version V2 additive, state cũ được đọc và giữ record dedupe, không migrate/rewrite trade JSON.

### 2026-09-26 — Protection exclusion thoát tại +15% hoặc −25% ROE

- `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V4_AUTO_RESUME_ROE15_OR_NEG25_20260926` đọc ROE live hữu hạn của position Binance từ average entry/MARK/leverage. Với exact symbol đang bị bỏ qua protection, `ROE >= +15%` hoặc `ROE <= -25%` sẽ xóa và persist exclusion; hai biên inclusive, LONG/SHORT giống nhau, dữ liệu thiếu giữ khóa.
- Đây là lifecycle management sau fill, không phải nhãn/tier/gate entry. Việc gỡ chỉ cho TP/SL scanner, SL trail/profit-lock và Fast Wave tiếp tục theo rule hiện hữu; không tự đóng MARKET, không đổi entry/size/leverage và không định nghĩa TP/SL mới. Save lỗi fail-safe; close/reversal reset cũ giữ nguyên.
- Không đổi stats, Discord, W/L/PF/AvgROE hoặc WHITELIST; không thêm card/checkbox mới. JSON cũ không migrate: `protectionExclusions` giữ schema, version response nâng additive. Test mock xác nhận `−24,999%` giữ, `−25%` gỡ và persist qua restart, cùng nhánh +15% cũ; không gọi sàn. Runtime đã reload, health 200 và API trả đúng V4.

### 2026-09-26 — BTC Session gửi Discord khi đạt đúng màu V1

- `BTC_SESSION_CONTEXT_READY_DISCORD_V1_20260926` chạy server-side bằng chính
  `buildSessionRows`: Coin Level current candidate + vùng nến đóng/retest 5m + MARK
  socket fresh + BTC health + market-regime + session Việt Nam. Chỉ exact `rank=3 /
  TRONG VÙNG · CÙNG BTC` mới gửi; LONG embed xanh, SHORT embed đỏ. Retained, stale,
  broken, dual, thiếu socket, ngược BTC hoặc ngoài session đều fail-closed.
- Dedupe theo `symbol/side/window/confirmationAt/retestAt`, persist atomically 7 ngày;
  startup baseline không replay dòng đạt cũ, HTTP reject retry có backoff và network
  outcome mơ hồ không blind-retry. Discord ghi rõ OBSERVE ONLY, giá/vùng/điểm nguồn,
  BTC/regime và thời gian xác nhận; webhook chỉ nằm trong `.env`.
- Không đổi signal score/tier/label/card hoặc thống kê lệnh; chỉ log delivery vận hành.
  Không thêm WHITELIST: tiếp tục exact key `btc-session:{SIDE}:{WINDOW}`, default OFF,
  chỉ hiện khi CLOSED AvgROE `>4%`. Không ảnh hưởng Binance entry, margin/size,
  leverage, SL, TP, order/position hay route/master lock.
- JSON tương thích additive: state Discord mới độc lập, không migrate/rewrite payload
  cũ; snapshot chỉ thêm `btcSessionDiscordConfigured`. Test mock chứng minh baseline,
  transition, setup mới, dedupe qua restart, màu LONG/SHORT và các nhánh loại.

### 2026-09-26 — Đủ 3 giờ và unrealized PnL dương → MARKET close V1

- `BINANCE_POSITIVE_PNL_MARKET_CLOSE_AFTER_3H_V1_20260926` thay runtime timeout cũ
  theo ROE >1% bằng rule đúng yêu cầu: position còn mở đủ 3 giờ từ **fill đã xác
  thực** và gross unrealized PnL `>0 USDT` thì MARKET-close quantity còn lại. Dùng
  `sl-tracking` có order id, entry/side match; không dùng signal time/first-seen hay
  adopted position. BUY/SELL và LONG/SHORT đều tương thích.
- PnL <=0 không bị executor này đóng; nhánh âm sau 3 giờ tiếp tục dời TP về average
  entry. Protection exclusion và Cap TSL được giữ. MARKET dùng reduce-only one-way
  hoặc đúng hedge side, LOT_SIZE fail-closed; TP/SL không bị hủy trước khi close được
  Binance chấp nhận. Dedupe giữ đến close reconciliation, lỗi write thì cho retry.
- Đây là protection sau fill, không đổi entry/route/size/leverage hoặc dữ liệu signal;
  không thêm card, tier, stats, Discord hay WHITELIST. Gross PnL có thể thành realized
  net âm nhẹ do phí/funding/slippage. API cũ giữ `minRoe` additive-compatible và thêm
  `minPnlUsdt=0`/version; JSON tracking không migration, record thiếu metadata bỏ qua.
- Config máy hiện tại bật `POSITION_TIMEOUT_ENABLED=true`, `POSITION_TIMEOUT_H=3`;
  `POSITION_TIMEOUT_MIN_ROE` chỉ còn tương thích cấu hình/API. Tests policy + executor
  mock kiểm tra ranh giới, hai hướng, hedge, exclusion, dedupe và retry, không gọi sàn.
  PM2 reload 16:33 VN PID `1249289`; API xác nhận V1 đang bật, Binance gate không
  block và chưa có MARKET timeout được submit ngay sau reload.

### 2026-09-26 — Normalize BUY/SELL cho TP về entry sau 3 giờ

- `BINANCE_NEGATIVE_TP_TO_ENTRY_AFTER_3H_V3_MANUAL_SIDE_NORMALIZED_20260926` sửa
  lỗi lệnh tay ghi `signalSide=BUY/SELL` nhưng age guard chỉ nhận `LONG/SHORT`.
  Matcher mới chuẩn hóa BUY→LONG, SELL→SHORT; schema LONG/SHORT vẫn giữ nguyên và
  hướng lạ/ngược vị thế fail-closed. Input causal vẫn là fill thật, order id, entry,
  amount, tuổi từ fill và ROE live; ngưỡng vẫn `>=3h` + ROE `<0`, loại adopted/Cap TSL.
- Khi đạt, executor giữ nguyên cơ chế an toàn: đặt LIMIT close tại average entry thành
  công trước rồi mới dọn TP xa, không đụng SL/opening order/opposite hedge, không đổi
  size/leverage và không MARKET-close. REST 429/418 làm lần đó lỗi/retry, không hủy TP
  cũ. Không thay entry route hoặc tín hiệu trước fill.
- Không đổi thống kê/Discord/card/WHITELIST; không tạo AvgROE giả. JSON tracking cũ
  không migrate/rewrite và đọc được cả hai kiểu side. Test bao phủ BUY/SELL và mismatch.
  PM2 đã reload 16:22 VN; ZENUSDT live đạt ROE `-10,41%`, tuổi `5,0h`, đặt LIMIT close
  tại entry `7,65` thành công trước khi dọn TP xa, xác nhận V3 hoạt động thực tế.

### 2026-09-26 — BTC Session watchlist ngày giữ nguyên coin/hướng V3

- `BTC_SESSION_DAILY_WATCHLIST_V3_20260926` lưu tối đa 100 cặp `symbol + side` đã
  xuất hiện từ snapshot Coin Level trong ngày Việt Nam vào localStorage trình duyệt.
  Snapshot mới cập nhật bản ghi nhưng không xóa coin vừa rời top; LONG và SHORT cùng
  symbol được giữ riêng. Có bộ lọc mặc định `Đáng chú ý hôm nay` và tùy chọn chỉ xem
  snapshot hiện tại; MARK socket vẫn cập nhật cho symbol retained.
- Dòng retained là trạng thái lịch sử UI, nền vàng, rank 0 và luôn ghi `CHỜ NGUỒN TRỞ
  LẠI`; hướng retained không tham gia phát hiện dual và không thể nhận màu xanh/đỏ
  đạt dù giá live chạm vùng cũ. Vùng lưu chỉ để đối chiếu, không phải entry live.
- Input causal/rule rank live, score, market-regime, session, freshness và target nguồn
  không đổi. Stats chỉ đếm current/retained, không suy W/L/AvgROE/PnL. Không thêm
  card/label giao dịch: WHITELIST `btc-session:{SIDE}:{WINDOW}` vẫn default OFF, chỉ
  hiện khi CLOSED AvgROE `>4%`; retained không bao giờ execution-eligible.
- Không ảnh hưởng Binance, entry, margin, size, leverage, SL, TP, order/position,
  Discord hoặc route. Không đổi JSON server; local store version/day sai tự reset,
  payload cũ tương thích và fail-closed. Watchlist không đồng bộ giữa trình duyệt.

### 2026-09-26 — Auto-resume protection exclusion tại ROE +15%

- `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V3_AUTO_RESUME_ROE15_20260926`: vị thế LONG/SHORT đang bị `Bỏ qua TP / SL tự động` được gỡ khỏi danh sách khi ROE live >=15%. 14,999% giữ nguyên; dữ liệu là entry/mark/leverage của vị thế Binance đang mở, không phải signal score hay realized PnL.
- Gỡ và persist trước `handleSlTrailByProfit` trong cùng callback mark-price, vì vậy rule profit-lock/TP/SL/Fast Wave hiện hữu được phép chạy lại ngay; không đóng MARKET và không thay entry/size/leverage hoặc ngưỡng lock gốc. Lỗi lưu giữ exclusion fail-safe. Close/reversal reset cũ vẫn chạy.
- Không thêm nhãn/card/stat cohort/WHITELIST/Discord. JSON cũ dùng nguyên `protectionExclusions`; chỉ xóa symbol bằng writer hiện có, response version lên V3. UI ghi rõ +15% ROE. Server đã reload live; API xác nhận V3. Binance 429 tại thời điểm reload làm REST/user-data reconnect tạm trì hoãn, không làm rule tự xóa khi chưa có ROE.

### 2026-09-26 — BTC Session tô màu bối cảnh LONG/SHORT đạt

- `BTC_SESSION_CONTEXT_COLOR_V2_20260926`: row chỉ nhận `context-long-ready` (xanh) hoặc `context-short-ready` (đỏ) khi model hiện hành trả `rank=3`, tức giá live trong vùng + cùng hướng BTC + các điều kiện quan sát đã đạt. Chờ/ngược hướng/dual/stale/broken không nhận màu đạt.
- Đây là presentation của `BTC_SESSION_OBSERVE_V1_20260926`, OBSERVE ONLY; không đổi input trước entry, điều kiện/matcher, thống kê, Binance entry/size/SL/TP, Discord hoặc WHITELIST. Không có migration JSON; class được tính live phía client. Test model/DOM/CSS xác nhận hai chiều và fail-closed.

### 2026-09-26 — Negative TP age 3h V2 (lịch sử; V3 đã thay thế)

- `BINANCE_NEGATIVE_TP_TO_ENTRY_AFTER_3H_V2_20260926`: mặc định >=3h từ fill có entryOrderId và position còn ROE<0 → TP average entry cho LONG/SHORT. Không dùng tín hiệu trước entry để tính giờ, không đòi âm liên tục. Thiếu fill/adoption hoặc mismatch entry/side bỏ qua; DCA theo timestamp fill mới trong tracking hiện hành.
- Binance protection thật sau reload, không OBSERVE ONLY: giữ SL/size/entry và exclusions; age guard không bị FastWave trì hoãn. One-way reduce-only/hedge đúng chiều, không đụng SL/opening orders; nhánh tuổi đặt replacement trước khi hủy TP cũ. Không đổi thống kê closed, không thêm card/tier/WHITELIST, không tính điểm/probability mới.
- JSON cũ không migration; thiếu fill metadata thì không kích hoạt nhánh tuổi. Config mới AFTER_3H ưu tiên, AFTER_8H fallback, default3h; legacy tên hàm/export còn dùng để giữ tương thích. TPentry không bao gồm phí/funding. Sửa lỗi format quantity nguyên đuôi0 trong executor dùng chung (10 không thành1).
- Tests: `test-binance-twelve-hour-take-profit.mjs`, `test-negative-take-profit-policy.mjs`, `test-three-hour-negative-tp-runtime.mjs`, syntax server. V2 được giữ làm lịch sử; bản live và kết quả reload hiện hành xem mục V3 phía trên.

### 2026-09-26 — BTC Session Watch quan sát theo giờ và BTC live

- `BTC_SESSION_OBSERVE_V1_20260926`, whitelist V18: trang mới + menu V2, MARK socket và snapshot mỗi30s; vùng entry giữ nguyên mốc retest của Coin Level. Không đồng nhất với strategy nghiên cứu 55 ngày. Nguồn BTC health EMA8/21 1h/4h có thể gồm nến live; nguồn coin là breakout/retest nến đóng.
- Nhãn UI theo giá trong/ngoài vùng, BTC cùng/ngược hướng, marketRegime LONG, freshness và session VN 20–02/06–08/khác. Không gate giao dịch thật. Giá đi xa không kéo entry đuổi theo; thiếu/cũ BTC/tick/snapshot, phá mốc hoặc hai chiều không báo đạt. V1 chỉ có tối đa 30 dòng API; V3 phía trên bổ sung watchlist ngày nhưng giữ dòng lịch sử rank 0, không biến thành tín hiệu live.
- Không tạo thống kê lệnh đóng, không diễn giải điểm là xác suất. WHITELIST group exact `btc-session:SIDE:WINDOW` có key builder chung UI/runtime, default OFF, checkbox ẩn khi chưa có closed AvgROE >4; test ranh giới4%, missing/zero closed, JSON cũ, side/version mismatch. Không tự gán metadata vào lệnh cũ, không bật route/size/entry/SL/TP Binance.
- Không migration JSON; tương thích payload cũ thiếu trường theo hướng fail-closed. Test `scripts/test-btc-session-watch.mjs`; UI đã tách source version/observeOnly, no order submit. Không restart process; URL `.html` hoạt động trên server hiện tại, friendly alias sau restart bình thường.

### 2026-09-26 — Backtest độc lập mùa/giờ BTC và continuation

- `BTC_SESSION_CONTINUATION_RESEARCH_V1_20260926`: nghiên cứu, không triển khai tín hiệu thật. Scripts `research-btc-session-data.py`, `research-btc-session-analysis.py`, test `test-research-btc-session.py`; protocol tại `docs/research/BTC_SESSION_CONTINUATION_PREREG_20260926.md`.
- Input causal trước entry gồm nến đóng 5m/15m, ATR/volume trước impulse, mốc phá 12 nến, retest đã quan sát, EMA13/25 và impulse BTC đã đóng; LONG pump-retest/SHORT dump-rebound là nhãn nghiên cứu, không phải tier/gate runtime.
- So sánh giờ VN chuẩn hóa theo giờ, không so tổng sự kiện của khung dài/ngắn. Universe top 60 crypto theo July quote volume + BTC, 55 ngày; holdout thời gian 14 ngày, embargo 6h; phí/trượt giá giả định ~0,16% roundtrip và stress ~0,30%, chưa funding; bootstrap cụm ngày, N và khoảng bất định được báo cáo.
- Không ảnh hưởng Binance/entry/size/SL/TP hiện tại; không gọi API đặt/hủy/sửa lệnh, không thay whitelist hay route. JSON nghiên cứu lưu tách biệt, không migration JSON cũ, không thêm card cần matcher WHITELIST.
- Kết quả V1 lưu tại `docs/research/BTC_SESSION_CONTINUATION_RESULTS_20260926.md`: 55 ngày/1.320 giờ, 3.536 impulse, 227 entry. Đêm biến động mạnh hơn nhưng không đồng nghĩa ưu tiên LONG; LONG trend+impulse 31 entry toàn kỳ +0,398% TB nhưng 8 entry cuối -0,152%, chưa đạt cơ sở áp dụng tiền thật. Không tune ngưỡng theo kết quả này.

### 2026-09-26 — SAGA 15m trả lại nhịp bơm đã đóng → SHORT 6 USDT

- Detector V6 chỉ cấp `binanceEligible` cho exact case `SAGAUSDT + 15m +
  FOLLOW_REJECTION_CLOSED`; mọi coin khác, nến follow live 15m và sweep hai đầu vẫn
  observe-only. Input trước entry là 20 nến nền, ATR14, volume/quote volume, đỉnh nền,
  nến spike và tối đa ba nến follow đã đóng; nhịp follow phải trả lại ít nhất 50% cú
  bơm và không có high mới cao hơn spike.
- Executor V5, policy V37, catalog V12 và controls V23 tạo route exact stream
  `extreme-short-squeeze-saga-15m`. Event phải mới <=90 giây, sau `enabledAt`, mark
  drift <=0,5%, không position/order SAGA và qua cooldown 4 giờ. Entry SHORT MARKET
  6 USDT margin ×5; TP +15%/SL -30% ROE neo theo full fill. Không DCA, replay hoặc
  sửa lệnh/vị thế đã có. Máy hiện tại bật exact route lúc
  `2026-09-26T05:07:50.471Z`; các signal trước mốc này không được phát lại.
- Stats dùng fill audit Binance thật của route; không suy số case Discord thành lệnh.
  `FOLLOW_REJECTION_CLOSED` là label hiện hữu, không tạo card/WHITELIST mới; rule
  CLOSED AvgROE >4% mặc định OFF giữ nguyên. Route JSON additive, dữ liệu cũ không
  migrate và mọi record thiếu exact matcher fail-closed.

### 2026-09-25 — Income/PnL REST fail-closed để không làm mất SL/TP

- Version `BINANCE_INCOME_QUERY_COORDINATOR_V1_BUDGETED_SERIAL_CACHE_20260925`.
  Nguồn gây burst cũ là `/fapi/v1/income` weight 30: page đủ 1.000 dòng từng tách
  hai nhánh song song, một refresh có thể tạo 63 request. Luồng mới dùng coordinator
  process-wide theo tài khoản, single-flight và chỉ tách tuần tự; hard budget 4
  request/job, gap 3 giây, REST reserve 600, cache/cooldown 15 phút.
- Input chỉ là Income của vị thế đã đóng phục vụ reconciliation/statistics, hoàn toàn
  sau entry. Thiếu quota hoặc range quá dày thì stats giữ cache/stale và ghi warning;
  không trả tập Income chưa đủ như số liệu hoàn chỉnh. Cách đếm W/L/PnL hiện hữu
  không đổi khi có dữ liệu đầy đủ.
- Không đổi detector/classifier, Binance gate của tín hiệu, entry, margin, leverage,
  SL/TP hay lệnh/vị thế đang có. Không thêm performance card/WHITELIST; rule CLOSED
  AvgROE >4% mặc định OFF giữ nguyên.
- Response rate-gate thêm `incomeQuery` optional; JSON/state cũ vẫn đọc được, không
  migrate hoặc backfill/replay. Env mới có default an toàn và không bắt buộc.

### 2026-09-25 — Đồng bộ bộ lọc loại đạt cho route 1h/4h

- Versions: `POST_MOVE_IDEAL_LONG_1H_PRIORITY_TOUCH_MARKET_5USDT_V2_20260925`,
  `POST_MOVE_IDEAL_SHORT_1H_PRIORITY_TOUCH_MARKET_10USDT_V2_20260925`,
  `POST_MOVE_IDEAL_LONG_4H_PRIORITY_TOUCH_MARKET_10USDT_V2_20260925`, SHORT 4h mới
  `POST_MOVE_IDEAL_SHORT_4H_PRIORITY_TOUCH_MARKET_10USDT_V1_20260925`; policy
  `LIVE_CARD_POST_MOVE_PRIORITY_MTF_V36_20260925`. LONG chỉ nhận fresh reversal/
  first strong candle; SHORT chỉ nhận near top/first strong candle. Stage khác hoặc
  thiếu key không còn thành candidate Binance.
- Input trước entry là nến đóng 1h/4h, `moveStage`, vùng entry và crossing live; chỉ
  touch outside→zone mới sau baseline/`enabledAt`, <=60 giây, mark còn trong vùng,
  drift <=0,5%, không position/order cùng coin. Size giữ nguyên: LONG 1h $5; SHORT
  1h và hai route 4h $10, leverage 5x. LONG TP10/SL20; SHORT TP6/SL30 ROE.
- SHORT 4h có exact checkbox mới seed OFF rồi bật tường minh; state additive và không
  replay lịch sử. Stats chỉ attempt/fill thật; không tạo performance card/WHITELIST,
  policy CLOSED AvgROE >4% mặc định OFF giữ nguyên. JSON cũ thiếu stage fail-closed.

### 2026-09-25 — MARKET 15m chỉ cho bốn giai đoạn ưu tiên

- UI hai trang MTF đã phân biệt rõ phần thống kê `OBSERVE ONLY` với hai route
  Binance ưu tiên 15m; không biến các case 1h/4h hoặc nhãn khác thành gate vào lệnh.

- Version `POST_MOVE_PRIORITY_STAGE_15M_MARKET_2USDT_MAX15_V1_20260925`. LONG chỉ
  nhận `VỪA SẬP · ĐANG RÚT CHÂN` (dump <=2 nến, live rút chân, chưa có lift đóng)
  hoặc `NẾN HỒI ĐẦU TIÊN` (lift đóng age=0, move >=1% hoặc volume >=1,5x). SHORT
  chỉ nhận `SÁT ĐỈNH` (pump <=2 nến, fade <=35%/vùng reject) hoặc `NẾN GIẢM ĐẦU
  TIÊN` (sell đóng age=0, move >=1% hoặc volume >=1,5x). Stage khác fail-closed.
- Snapshot classifier chạy version `POST_DUMP_VOLUME_RECOVERY_MTF_PRIORITY_LABELS_V5_20260925`
  và `POST_PUMP_VOLUME_FADE_MTF_PRIORITY_LABELS_V3_20260925`; Discord dùng
  `POST_MOVE_IDEAL_ENTRY_TOUCH_DISCORD_ACTUAL_TYPE_V6_20260925`; mỗi embed chỉ ghi loại
  thực tế của tín hiệu hiện tại, không chèn danh sách bốn loại, đồng thời tách rõ vai trò
  thông báo Discord khỏi route Binance.
  Chỉ bốn stage ưu tiên được dùng chữ `ĐẸP`; các stage khác bỏ chữ này khỏi title và
  đổi nhãn vùng giá thành `VÙNG ENTRY`.
- Hai exact route 15m mặc định OFF trong catalog và hiện được bật explicit. Khi bật/
  restart chỉ baseline, candidate ưu tiên mới xuất hiện sau đó mới MARKET; event tối
  đa 60 giây, mark drift <=0,5%, không position/order cùng coin, dedupe một
  `side|symbol|anchorAt`. Từ 15 vị thế mở trở lên chặn trước submit và `placeOrder`
  kiểm lại `maxOpenPositions=15`.
- Mặc định 2 USDT margin ×5: LONG TP +10%/SL -20% ROE, SHORT TP +6%/SL -30% ROE,
  protection neo full fill. Không DCA; route 1h/4h có bộ lọc stage riêng. Stats chỉ fill/audit
  Binance thật; không performance card/WHITELIST mới, policy CLOSED AvgROE >4% giữ
  nguyên. Route/state JSON additive, stage thiếu thì chặn, không migrate/backfill/replay.

### 2026-09-25 — Phân loại giai đoạn nhịp giá LONG/SHORT và đưa vào Discord

- Versions `POST_DUMP_VOLUME_RECOVERY_MTF_PRIORITY_LABELS_V5_20260925`,
  `POST_PUMP_VOLUME_FADE_MTF_PRIORITY_LABELS_V3_20260925`,
  `POST_MOVE_IDEAL_ENTRY_TOUCH_DISCORD_ACTUAL_TYPE_V6_20260925`. Embed chỉ dùng field
  `LOẠI ĐẸP` cho đúng stage ưu tiên hiện tại; stage khác vẫn hiện `GIAI ĐOẠN NHỊP GIÁ`.
  Đây là nội dung hiển thị, không tự biến tín hiệu ngoài route exact thành lệnh Binance.
  Input causal trước entry
  vẫn là nến đóng 15m/1h/4h, tuổi/độ mạnh/volume của lift hoặc sell, % hồi/fade và
  trạng thái vùng entry. Live candle chỉ phân biệt nhịp mới chưa xác nhận.
- LONG hiển thị mới sập-bật lại, nến mạnh đầu tiên, đã chạy xa, đang hồi hoặc yếu;
  SHORT hiển thị sát đỉnh, nến giảm mạnh đầu tiên, đã tuột xa, đang giảm hoặc bật
  lại-yếu. Ngưỡng chính: move đóng >=1% hoặc volume >=1,5x cho nến mạnh; LONG xa
  khi hồi >=65%, SHORT xa khi fade >=60%. Cột `Giai đoạn` có màu và sort; Discord
  touch gửi cùng nhãn/hướng xử lý.
- Không có performance stats/card/WHITELIST mới và không đổi policy CLOSED AvgROE
  >4%. Nhãn vẫn là thông tin giải thích; chỉ exact executor 15m/1h/4h mới dùng bốn
  key ưu tiên làm filter Binance. `moveStage` là field JSON optional additive,
  client cũ bỏ qua được và state cũ không migrate/backfill/replay.

### 2026-09-25 — LONG đẹp 4h chạm vùng vào MARKET 10 USDT

- Version `POST_MOVE_IDEAL_LONG_4H_PRIORITY_TOUCH_MARKET_10USDT_V2_20260925`. Detector chỉ
  nhận `LONG_IDEAL_ENTRY_TOUCH` từ page hậu xả trên exact 4h, thuộc hai stage LONG
  ưu tiên và loại `WEAKENED`; dữ
  liệu causal là nến 15m đã đóng gộp đủ bucket 4h. Lượt đầu bật/restart và candidate
  mới thấy sẵn trong vùng chỉ baseline; cần outside→zone mới. NEARUSDT đang hiển thị
  không bị replay thành lệnh.
- Mark Binance trước submit phải còn trong vùng, lệch <=0,5%, touch <=60 giây; không
  position/entry order cùng coin và chưa đủ 30 vị thế. Exact route Auto Controls seed
  OFF, máy này ON. MARKET LONG margin 10 USDT ×5 (notional 50), TP +10% ROE và SL
  −20% ROE neo full fill; không DCA, intent/client id durable chống lặp.
- Stats chỉ gồm attempt/status/order id và fill audit thật, không tạo performance
  card/tier/WHITELIST giả. Có tác động Binance/entry/size/leverage/TP/SL nhưng không
  đổi classifier/score/Discord. State/route additive, không migrate/backfill/replay;
  JSON snapshot/API cũ tương thích.

### 2026-09-25 — LONG đẹp 1h chạm vùng vào MARKET 5 USDT

- Version `POST_MOVE_IDEAL_LONG_1H_PRIORITY_TOUCH_MARKET_5USDT_V2_20260925`. Detector chỉ
  nhận `LONG_IDEAL_ENTRY_TOUCH` từ page hậu xả trên exact 1h, thuộc hai stage LONG
  ưu tiên, loại `WEAKENED` và
  dùng vùng causal từ nến 15m đã đóng được gộp. Bật/restart chỉ baseline; candidate
  lần đầu xuất hiện sẵn trong vùng không được hồi tố. Chỉ crossing outside→zone mới
  sinh touch; mark Binance phải còn trong vùng, lệch <=0,5% và touch <=60 giây.
- Exact route Auto Controls seed OFF và máy này ON theo yêu cầu. Guard cần master/
  order enabled, route không đổi, không có position/entry order cùng coin. Lệnh là
  MARKET LONG margin 5 USDT ×5 (notional 25), TP +10% ROE theo policy LONG hiện
  hữu, SL −20% ROE neo full fill; không DCA và intent/client id durable chống lặp.
- Stats chỉ là attempt/status/order id và fill audit thật, không sinh performance
  card/tier/WHITELIST giả. Có tác động Binance/entry/size/leverage/TP/SL nhưng không
  đổi classifier/score/Discord. 15m và 4h có exact route riêng. State và route additive, không migrate/backfill/
  replay; JSON snapshot/API cũ tương thích.

### 2026-09-25 — SHORT đẹp 1h chạm vùng vào MARKET 10 USDT

- Version `POST_MOVE_IDEAL_SHORT_1H_PRIORITY_TOUCH_MARKET_10USDT_V2_20260925`. Detector chỉ
  nhận `SHORT_IDEAL_ENTRY_TOUCH` của page hậu bơm trên exact 1h, thuộc hai stage
  SHORT ưu tiên và loại `WEAKENED`;
  baseline khi route mới bật/restart nên không hồi tố setup cũ. Touch là giá cache đi
  vào/cắt vùng; trước submit mark Binance phải vẫn trong vùng và lệch <=0,5% trong
  tối đa 60 giây. Chỉ cần cache 15m đạt min-ready, không phụ thuộc warm-up EMA khác;
  1h vẫn được gộp từ nến 15m đã đóng đủ. Candidate mới được phát hiện sẵn trong vùng
  chỉ baseline; cần quan sát outside→zone thật sau đó. SHORT có exact route riêng
  cho 15m và 4h; LONG có exact route 1h và 4h ở các mục phía trên.
- Exact route trong Auto Controls mặc định OFF, máy này ON theo yêu cầu. Guard cần
  master/order enabled, route không đổi, không position/entry-order cùng coin, rồi
  MARKET SHORT margin 10 USDT × 5x. TP +6% ROE theo policy bot SHORT hiện hữu,
  SL −30% ROE neo full fill; source
  được exempt TP-only, không DCA, intent durable + client id deterministic chống lặp.
- Stats chỉ là attempt/status/order id và fill audit thật; không tạo performance card
  hoặc WHITELIST giả. Có tác động entry/size/leverage/TP/SL Binance, không đổi
  classifier/score/Discord hoặc JSON API. State/route additive, không migrate,
  backfill/replay; JSON cũ tương thích.

### 2026-09-24 — Đóng vị thế đang lãi khi coin active hai chiều

- Version `POST_MOVE_DUAL_DIRECTION_POSITIVE_PNL_CLOSE_V1_20260924`. Mỗi 15 giây,
  server lấy giao exact `interval|symbol` giữa snapshot LONG hậu xả và SHORT hậu bơm;
  chỉ `CONFIRMED/BUILDING`, không nhận `WEAKENED`. Input trước action là cache nến
  đóng dùng bởi hai classifier, Position Risk mới đọc và mark price mới nhất; không
  dùng fill/outcome/nến tương lai để quyết định coin hai chiều.
- Chỉ khi env đã bật, Binance còn vị thế và unrealized PnL >0 USDT, rule mới đóng
  MARKET toàn bộ vị thế. PnL được kiểm tra lần hai theo mark ngay trước submit; hết
  lãi thì hủy action. One-way `reduceOnly`, hedge dùng `positionSide`, có inflight và
  cooldown chống lặp. PnL <=0 được giữ nguyên; không mở/reverse/DCA, không sửa
  entry/size/leverage/SL/TP. Position-close cleanup hiện hữu xử lý protection cũ.
- Chỉ log số giao/đóng/lỗi, không sinh performance stats/card/WHITELIST. Example
  default OFF; máy này bật explicit. Đây là thay đổi Binance protection thật nhưng
  không đổi entry routes hay CLOSED AvgROE policy. Snapshot/API/JSON cũ giữ nguyên,
  không migrate/backfill/replay và client cũ tiếp tục tương thích.

### 2026-09-24 — Sort mọi cột của hai bảng MTF

- Version `POST_MOVE_TABLE_SORT_V1_20260924`. Header 13 cột của LONG/SHORT đều bấm
  được, có mũi tên `↕/▲/▼`; Coin mặc định A→Z, số/giá/thời gian mặc định giảm dần và
  lần bấm kế tiếp đảo chiều. Sort giá lấy MARK socket hiện có rồi fallback giá cache.
- Sort stable, dữ liệu thiếu ở cuối và chỉ tác động thứ tự DOM đang xem; không đổi
  snapshot/classifier/score/zone/stats. Không Discord/Binance/gate/entry/size/SL/TP,
  không WHITELIST hay JSON migration/backfill/replay.

### 2026-09-24 — Giá MARK socket cho hai page hậu xả/hậu bơm

- Version `POST_MOVE_LIVE_PRICE_SOCKET_V1_20260924`. Browser subscribe động mark-price
  1 giây cho union symbol đang hiện ở 15m/1h/4h, tự reconnect/failover; HTTP snapshot
  15 giây tiếp tục cung cấp giá cache và toàn bộ classifier nến đóng.
- Row hiện MARK socket, giá cache, % lệch và khoảng cách live tới midpoint; giá trong
  zone entry làm sáng ô/dòng. Highlight không thay đổi score/status/zone, không xác
  nhận nến và không được dùng làm dữ liệu tương lai để xếp loại.
- UI only: không Discord/Binance/gate/entry/size/leverage/SL/TP, không performance stats
  hoặc WHITELIST. API/JSON không đổi; socket lỗi thì fallback giá cache, không migrate,
  backfill hoặc replay.

### 2026-09-24 — Discord khi giá chạm vùng LONG/SHORT đẹp

- Version `POST_MOVE_IDEAL_ENTRY_TOUCH_DISCORD_V1_20260924`. Scanner nền mỗi 15 giây
  tái dùng cache 15m đang có và hai classifier hậu xả/hậu bơm; 1h/4h chỉ là bucket
  nến 15m đã đóng được gộp UTC. Giá live cache là dữ liệu chạm duy nhất; không thêm
  REST, future candle, fill, PnL hoặc outcome.
- Exact key là `side|interval|symbol|anchorAt`; chỉ candidate active, không
  `WEAKENED`, có zone hợp lệ. Giá vào zone hoặc nhảy cắt qua zone sẽ tạo event; lượt
  đầu khi process start chỉ baseline. Dedupe durable một lần/setup, ghi intent trước
  POST, chỉ retry rejection rõ ràng 429/5xx và giới hạn 5 alert/lượt.
- Discord gửi hướng, coin, timeframe, live price, vùng đẹp, midpoint, score/status,
  mốc xác nhận/vô hiệu và thời gian nến gốc. Nếu cùng coin+khung active cả LONG lẫn
  SHORT, mỗi hướng gửi riêng kèm cảnh báo hai chiều.
- Đây là OBSERVE ONLY: không Binance, không gate, không entry/size/margin/leverage/
  SL/TP, không stats performance và không WHITELIST mới. Env và state JSON mới là
  additive; API/snapshot cũ không đổi, không migrate/backfill/replay.

### 2026-09-24 — Đánh dấu coin active hai chiều LONG/SHORT

- Version `POST_MOVE_DUAL_DIRECTION_UI_V1_20260924`. Client lấy giao hai snapshot
  LONG-after-dump và SHORT-after-pump theo exact `interval|symbol`; chỉ candidate
  khác `WEAKENED` mới tham gia. Cùng coin nhưng khác timeframe không bị đánh dấu.
- Row giao nhau có nền/badge tím `↕ HAI CHIỀU`; mỗi tab hiện số lượng giao nhau.
  Đây chỉ báo thị trường giằng co/biến động hai chiều, không xác nhận LONG hay SHORT,
  không đổi score, entry tham khảo, trạng thái hoặc các stats gốc.
- Không Discord/Binance/gate/entry/size/leverage/SL/TP, không card performance hay
  WHITELIST mới. JSON/API hoàn toàn giữ nguyên; tính tại browser, API đối diện lỗi thì
  bỏ highlight, không migrate/backfill/replay.

### 2026-09-24 — Page SHORT sau một nến bơm mạnh

- Version `POST_PUMP_VOLUME_FADE_MTF_IDEAL_SHORT_OBSERVE_V1_20260924`. Chỉ đọc cache
  15m, gộp nến đầy đủ theo UTC thành 1h/4h; nến live không xác nhận và không gọi thêm
  REST. Đây là chiều SHORT riêng, không đổi classifier của page LONG sau xả.
- Pump 15m/1h/4h lần lượt cần body hoặc high/open `3,5/6%`, `5/8%`, `8/12%` và
  volume `1,8× median20`, `1,7× median20`, `1,6× median10`, kèm sàn quote volume
  100k/250k/500k. Fade tối thiểu 15/15/12%; xác nhận cần 35/35/30%, dưới close pump,
  trend không bật quá 1,5%, cùng nến đỏ closed vừa giảm giá vừa tăng volume, mới tối
  đa 12/8/4 nến. Bật lại `>=3%` khỏi đáy hậu pump + trend dương thành `SHORT YẾU`.
- Score dùng pump, volume, fade và nến bán. Vùng SHORT đẹp dùng retest nửa trên cấu
  trúc/nến bán; chưa có sell candle thì dùng vùng fade 38,2–50%; pump high là vô hiệu.
  `SHORT YẾU` không có entry. Stats đếm case/unique/trạng thái theo ba tab, không phải
  performance cohort và không sinh paper, W/L, WR, PF, AvgROE hay PnL.
- Luôn `OBSERVE ONLY`: không Discord/Binance, không gate và không đổi entry thật,
  margin/size/leverage, SL hay TP. Không có label/card/matcher/WHITELIST mới; policy
  default OFF và CLOSED AvgROE `>4%` hiện hữu giữ nguyên.
- Endpoint/page và `summary/timeframes[]/idealEntry` đều additive; không sửa state/JSON
  cũ, migrate/backfill/replay. Thiếu cache fail closed và hiện trong thống kê loại.

### 2026-09-24 — Ba vùng hồi sau xả + điểm vào đẹp tham khảo

- Version `POST_DUMP_VOLUME_RECOVERY_MTF_IDEAL_ENTRY_OBSERVE_V3_20260924`. API lấy tối đa 500
  nến cache 15m và gộp theo UTC thành 1h/4h; bucket đã đóng phải đủ 4/16 nến thành
  phần. Nến/bucket live chỉ hiển thị, không xác nhận và không phát sinh REST mới.
- Ngưỡng body/low/volume lần lượt: 15m `3,5%/6%/1,8× median20`, 1h
  `5%/8%/1,7× median20`, 4h `8%/12%/1,6× median10`; kèm sàn quote volume
  100k/250k/500k USDT. Hồi tối thiểu 15% cho 15m/1h và 12% cho 4h. Xác nhận cần
  hồi 35%/35%/30%, trên close cú xả, trend ba nến không dưới −1,5% và có nến đóng
  tăng giá + tăng volume `>=5%`, đạt `>=1,1×` nền trong tối đa 12/8/4 nến.
- Score dùng độ sâu, volume, mức hồi, chất lượng và độ mới; ngưỡng 45 cho 15m/1h,
  42 cho 4h. UI chia ba bảng, đếm case từng khung, tổng case và symbol unique; một
  coin ở hai khung là hai case. Stats không phải cohort hiệu suất, không sinh paper,
  W/L, WR, PF, AvgROE hay PnL.
- `ĐIỂM VÀO ĐẸP` không dùng giá live để bịa entry: case có nến dòng tiền dùng vùng
  retest từ support hậu xả tới nửa thân nến dòng tiền; case đang xây dùng vùng hồi
  Fibonacci 38,2–50% của low→open nến xả. Hiện midpoint, range, khoảng cách live và
  trạng thái chờ; `WEAKENED` luôn `KHÔNG VÀO`.
- Vẫn `OBSERVE ONLY`: không Discord/Binance, không gate, không đổi entry/size/leverage/
  SL/TP. Không thêm label/card/matcher/WHITELIST; default OFF và CLOSED AvgROE `>4%`
  của hệ thống hiện hữu giữ nguyên.
- Backward compatible: top-level snapshot 15m giữ nguyên; `summary`, `timeframes[]`
  và `idealEntry` là additive. Vùng giá không tác động entry Binance, size, SL hay TP;
  không sửa JSON/state, migrate/backfill/replay. Cache thiếu fail closed.

### 2026-09-23 — Limit Paper SHALLOW khớp mới vào MARKET Binance

- Versions `LIMIT_PAPER_FILL_MARKET_V1_TOP3_LONG_SHALLOW_1USDT_20260923`,
  `LIMIT_PAPER_LAB_V2_SELECTED_SHALLOW_FILL_BINANCE_20260923`, controls V17,
  policy V31 và other-entry settings V6. Tín hiệu đầu chỉ ghi paper; live executor
  chỉ được gọi khi `SHALLOW` đổi `PENDING → OPEN` trên một tick giá về sau. Dữ liệu
  trước entry gồm snapshot EMA99 closed-15m, paper limit cố định, fill/mark mới,
  `enabledAt`, Market Regime, position và open order hiện tại.
- Chỉ ba exact class LONG 15m `NEAR_EMA_LONG_WATCH`, `NEAR_RECLAIM_LONG_WATCH`,
  `TOUCH_EMA_LONG_WATCH` được map sang route riêng
  `limit-paper-fill / ema99-retest-shallow`; phải RISK_ON, age ≤90 giây, drift ≤1%,
  không có position/order và không trong cooldown 4 giờ. Route TOUCH 15m cũ được OFF
  để loại đường MARKET-at-signal. Không replay các record/fill trước lúc route bật.
- Khi pass: MARKET margin 1 USDT, 5x (notional 5 USDT), TP +10% ROE, SL −20% ROE,
  protection neo full fill và ceil min-notional; không DCA hoặc sửa position/order
  đang tồn tại. Market regime xấu chỉ block lệnh thật, không xóa kết quả paper.
- Stats vẫn là Limit Paper causal theo từng độ sâu; `binanceExecution` chỉ là audit
  additive. Không thêm nhãn/card/WHITELIST mới và không đổi rule CLOSED AvgROE `>4%`.
  JSON cũ tương thích, không migrate/backfill; Unicode symbol được bảo toàn và bare
  `USDT` bị reject fail-closed.

### 2026-09-23 — Tắt sáu exact route Binance có expectancy âm 14 ngày

- Version `AUTO_ENTRY_CONTROLS_V16_DISABLE_NEGATIVE_14D_ROUTES_20260923`. Thống kê
  dùng fill audit thật, gộp DCA/partial fill theo `close_group_id`, Net PnL sau phí và
  funding; chỉ exact route đang ON và âm mới bị tắt.
- OFF: `FOLLOW_REJECTION_LIVE SHORT`, `EXTREME_PUMP_CLOSED SHORT`,
  `CLOSED_BELOW_EMA_LONG_WAIT LONG 15m`, `CLOSED_ABOVE_EMA_WATCH SHORT 15m`,
  `NEAR_EMA_WATCH SHORT 5m`, và `RETEST_LONG_READY LONG` thuộc stream
  `closed-mtf-retest`. Route 15m/HTF trùng label nhưng đang dương không bị ảnh hưởng.
- Đây là thay đổi authorization Binance, không đổi dữ liệu causal, phân loại, thống kê
  runtime, nhãn/tier, size/leverage, entry, SL/TP, Discord hoặc OBSERVE ONLY. Chỉ chặn
  entry tự động mới; position/order/protection đang tồn tại được giữ nguyên.
- Không có card/checkbox WHITELIST mới. JSON giữ nguyên schema và `enabledAt`; consumer
  cũ có thể bỏ qua version mới, không migrate/backfill/replay dữ liệu hoặc tín hiệu cũ.

### 2026-09-23 — Nhập đòn bẩy cho lệnh MARKET thủ công Coin Level

- Version `COIN_LEVEL_OBSERVE_MANUAL_MARKET_V2_USER_LEVERAGE_20260923`. UI thêm
  `ĐÒN BẨY (x)` trên từng row, mặc định theo route/fallback 5x và chỉ nhận số nguyên
  1–125. Server không tin input frontend mà kiểm tra lại leverage, cùng toàn bộ dữ
  liệu trước entry V1: watch/live fresh, auth, master, RISK_ON cho LONG và duplicate.
- Không đổi classifier/tier/điểm/history/stats, không label/card/WHITELIST mới.
  Margin và leverage người dùng xác nhận quyết định notional của lệnh MARKET mới;
  entry type, protection, SL/TP và position/order hiện hữu không đổi.
- Tương thích API cũ: request thiếu leverage tiếp tục lấy route leverage như V1;
  không đổi JSON lưu trữ, không migrate/backfill/replay. Module frontend được đổi
  query version để trình duyệt nạp input mới ngay sau refresh.

### 2026-09-23 — Làm rõ số tiền USDT và nguyên nhân khóa nút observe

- Version `COIN_LEVEL_OBSERVE_MANUAL_USDT_UI_V3_20260923`. Input trong cell coin
  được ghi rõ `SỐ TIỀN (USDT)`, mặc định 1 và nhận 0,01–100; nút disabled đổi chữ
  theo nguyên nhân `HẾT HIỆU LỰC`, `BINANCE OFF` hoặc `RISK-OFF`. Module frontend
  được cache-bust để refresh trang nhận ngay nhãn mới.
- Không đổi dữ liệu causal, classifier/tier/điểm/stats. Orders login chỉ là auth;
  active watch, master ON và Market Regime `RISK_ON` cho LONG vẫn được server
  kiểm tra trước entry. Vì vậy đăng nhập thành công không tự mở nút khi thị trường
  đang RISK_OFF. Không thêm label/card/WHITELIST; default OFF và CLOSED AvgROE
  `>4%` của policy hiện hữu giữ nguyên.
- Không thay Binance execution, margin/notional thật, leverage, entry, size, SL/TP,
  Discord hay duplicate guard. JSON/API cũ giữ nguyên và không migrate/backfill/
  replay; đây chỉ là thay đổi UI giải thích gate hiện hữu.

### 2026-09-23 — Hiện khối lượng USDT của nến watch LONG/SHORT

- Version `COIN_LEVEL_OBSERVE_USDT_VOLUME_COLUMN_V1_20260923`. Đầu vào trước entry không đổi: nến 5m đã đóng/fresh và 15m/1h của detector sớm. `quoteVolume` 5m đang dùng trong flow score được chuyển thêm thành `quoteVolumeUsdt` để hiện cột `KL 5m (USDT)` bên cạnh `Volume ×`; có sort số học theo USDT. Không dùng margin hay notional lệnh để thay thế.
- Không thay phân loại/tier/điểm/gate hay thống kê số tín hiệu/AvgROE, không thêm label/card nên WHITELIST giữ nguyên. Không ảnh hưởng Binance, entry/size/leverage/SL/TP hoặc Discord. JSON/history cũ thiếu field hiển thị `—`, xếp cuối khi sort; không migrate/backfill/replay hoặc tạo số 0 giả.

### 2026-09-23 — Sửa race thiếu SL sau fill và ngưỡng thủ công 10x

- Versions `POSITION_PROTECTION_SOCKET_FILL_V5_POSITION_VISIBILITY_RETRY_20260923` và `MANUAL_5X_10X_BREAK_EVEN_SL_V2_20260923`. Không thay dữ liệu trước entry, classifier/tier/gate hay thống kê tín hiệu/AvgROE. Full fill đã xác minh mà REST chưa thấy vị thế cùng hướng được chờ nhiều nhịp và retry nền tối đa 90 giây; watermark chỉ ghi sau khi callback xác nhận TP/SL theo plan. Nếu thiếu leg kỳ vọng, plan/cờ SL được mở lại cho retry. LONG fallback AUTO_SL bật phải có SL thật; TP-only/exclusion vẫn theo rule cũ. Log retry/exhausted là audit, không phải nhãn/card thống kê hay WHITELIST mới.
- Sau entry, manual 5x giữ floor SL entry chỉ khi ROE `>6%`; manual 10x dùng floor entry chỉ khi ROE `>12%`, chặn generic move ở 10% và cho nấc profit-lock mạnh hơn từ `>=15%`. Phân loại dựa trên manual matcher, leverage Binance thực, entry/mark/ROE live; SL tốt hơn không bị kéo lùi, TP giữ nguyên. Có ảnh hưởng đặt/kiểm tra protection và dời SL Binance cho fill/vị thế đáp ứng; không đổi entry, size, leverage, giá target TP/SL ban đầu hoặc Discord. JSON watermark/tracking cũ tương thích, không migrate/replay lịch sử; process đang chạy cần nạp bản code mới mới áp dụng. Stop tại entry vẫn có thể lỗ ròng sau phí/funding/slippage.

### 2026-09-23 — Dời SL lệnh thủ công 5x về entry sau ROE >6%

- Version `MANUAL_5X_BREAK_EVEN_SL_V1_20260923`. Không đổi input trước entry hay
  điều kiện phát tín hiệu. Sau entry, position monitor dùng phân loại manual đang
  có, leverage thực 5x, entry thực, mark và ROE live; `>6%` mới đặt floor SL ở
  entry cho LONG/SHORT. Existing profit-lock vẫn được quyền siết SL cao hơn;
  không hạ SL đã tốt hơn entry, không xóa TP và không MARKET-close khi mark đã
  cắt qua target. Thay SL vẫn dùng verify/rollback của profit-lock hiện tại.
- Không đổi thống kê tín hiệu/closed AvgROE, không tạo label/card/WHITELIST mới.
  Có tác động Binance/SL thật; không đổi entry, margin/size/leverage, TP hay
  Discord. Audit qua log `SlTrail` và `profitLock*`; JSON cũ tương thích, không
  migrate/rewrite/backfill. Stop tại entry có thể lỗ ròng do phí/funding/slippage.

### 2026-09-23 — Sắp xếp hai bảng quan sát LONG/SHORT

- Version `COIN_LEVEL_OBSERVE_SORT_UI_V1_20260923`: bấm header từng cột để sort
  tăng/giảm, hai bảng giữ lựa chọn riêng qua refresh 30 giây và toggle lịch sử.
  Mặc định vẫn theo thứ tự server; sort tại DOM bảo toàn input Margin đang nhập.
- Input trước entry vẫn là watch nến đóng 5m/15m/1h và giá live hiện có; sort không
  thay phân loại, điểm, tier hay thống kê số lượng/nguyên nhân loại. Không thay
  Binance/entry/size/leverage/SL/TP/Discord/WHITELIST; không có nhãn/card hay
  matcher mới. JSON/API cũ tương thích nguyên trạng; giá trị thiếu xếp cuối,
  không migrate/rewrite/backfill/replay.

### 2026-09-22 — Tô màu coin vừa xuất hiện ở cả LONG và SHORT

- Thêm `COIN_LEVEL_OBSERVE_RECENT_BIDIRECTIONAL_UI_V1_20260922`: browser hợp nhất
  history/live LONG và SHORT theo symbol, chỉ giữ event trong 30 phút và tô nền hai
  màu khi hai phía đều có mặt, cách nhau tối đa 30 phút. Tooltip ghi giờ mỗi phía;
  health line hiện số coin đang được đánh dấu.
- Đây chỉ là UI cảnh báo đổi hướng nhanh dựa trên `observedAt` nến đóng hiện hữu,
  không phải label/tier/gate/stat mới và không dùng outcome tương lai. Không đổi
  Binance/entry/margin/size/leverage/SL/TP/flip protection/Discord; không có
  WHITELIST mới. API/JSON không đổi, không migrate/rewrite/backfill/replay.

### 2026-09-22 — Đưa nút MARKET vào ngay sau tên coin

- Thêm `COIN_LEVEL_OBSERVE_MANUAL_MARKET_UI_V2_COIN_INLINE_20260922`: input Margin
  và nút LONG/SHORT nằm liền sau tên coin trong cell đầu; bỏ cột Binance cuối bảng và
  đổi colspan từ 13 về 12. Trạng thái khóa/pending/thành công/lỗi vẫn gắn với row.
- Chỉ đổi UI. Toàn bộ dữ liệu causal, classifier, xác nhận watch, auth/gate, margin,
  leverage và logic submit V1 giữ nguyên; không ảnh hưởng Binance/entry/size/SL/TP,
  stats/audit/Discord. Không label/card/WHITELIST mới; JSON/API không đổi và không
  migrate/rewrite/backfill/replay.

### 2026-09-22 — Bảo vệ vị thế khi LONG/SHORT observe đổi hướng

- Thêm `COIN_LEVEL_OBSERVE_DIRECTION_FLIP_PROTECTION_V1_20260922`. Tracker chỉ phát
  flip khi cùng coin đổi từ watch active LONG sang SHORT hoặc ngược lại trong cửa sổ
  giữ hướng 30 phút; snapshot đầu seed state, trạng thái đồng thời hai hướng không xử
  lý. Input trước hành động là watch nến đóng 5m/15m/1h, Position Risk, open orders
  và unrealized PnL live; không dùng kết quả tương lai.
- Entry order thường theo hướng cũ bị hủy, protection order không bị coi là entry.
  Vị thế cùng hướng cũ có PnL USDT `>0` được đóng reduce-only MARKET toàn bộ; PnL
  `<=0` được giữ và TP xa được thay bằng LIMIT reduce-only tại entry, còn SL giữ
  nguyên. Không tự mở hướng mới, không DCA, không đổi margin/leverage/size entry;
  lỗi API được retry ở tick sau. Protection vẫn chạy dù khóa entry tổng OFF.
- Close vẫn ghi lifecycle audit/PnL và dùng cleanup position-close hiện hữu; nhánh TP
  entry không tạo fill stat mới. Không có signal label/tier/card/WHITELIST mới; exact
  matcher/seed OFF/closed AvgROE >4% không đổi. API và JSON cũ không đổi, không
  migrate/rewrite/backfill/replay.

### 2026-09-22 — Nút MARKET thủ công trên từng dòng Coin Level observe

- Thêm `COIN_LEVEL_OBSERVE_MANUAL_MARKET_V1_20260922`: input margin `0,01–100 USDT`
  và nút LONG/SHORT thật trên từng row. Server chỉ nhận watch đang active/fresh, chưa
  bị giá live vô hiệu, khóa tổng ON, session Orders hợp lệ và coin chưa có position
  hoặc entry order; LONG còn cần Market Regime RISK-ON. Có confirm rõ MARKET thật;
  history/invalidated bị khóa. Leverage theo route cùng hướng, fallback 5x.
- Lệnh dùng nguồn/label manual sẵn có `orders-manual/ORDERS_MANUAL`; LONG giữ SL tại
  invalidation và TP manual +30% ROE, SHORT giữ TP EMA99 cap +30% ROE cùng SL -30% ROE
  sau actual full-fill. Margin/notional mới chỉ áp lệnh người dùng vừa bấm; không đổi
  detector, điểm 65, Discord, auto route, size/entry/SL/TP của tín hiệu tự động hoặc
  lệnh đang mở. Audit lệnh tay không nhập vào stats route Coin Level auto.
- Không có label/card/WHITELIST mới; exact matcher manual, seed OFF và closed AvgROE
  >4% giữ nguyên. API GET/JSON cũ không đổi; POST mới additive, không migrate,
  rewrite, backfill hay replay.

### 2026-09-22 — Màu mẫu chi tiết SHORT sớm trên Coin Level

- Thêm `COIN_LEVEL_EARLY_SHORT_PATTERN_COLORS_UI_V1_20260922`, vẫn giữ mẫu chính
  `XẢ SAU BƠM/BREAKDOWN`. Browser gán đúng một bucket màu theo ưu tiên: sát đáy kích
  hoạt <=0,35%; flow bán volume >=2x hoặc taker-sell >=60%; 15m+1h cùng DOWN;
  lower-high 5m; cuối cùng fallback áp lực giảm. Input chỉ là field V2 đã có trước
  entry; không dùng outcome hay dữ liệu tương lai để đổi phân loại runtime.
- Đây là phân loại trình bày, không phải label/tier/gate/stat/card mới; detector, điểm
  65, history và Discord không đổi. Không ảnh hưởng Binance/entry/size/leverage/SL/TP,
  không thêm WHITELIST; matcher, seed OFF và closed AvgROE >4% giữ nguyên. JSON/API
  không đổi, không migrate/rewrite/backfill.

### 2026-09-22 — Màu mẫu LONG sớm trên Coin Level

- Thêm `COIN_LEVEL_EARLY_LONG_PATTERN_COLORS_UI_V1_20260922`. Cột `Mẫu` phân màu
  client-side theo dữ liệu V3 đã có: `SÁT MỐC PHÁ` ≤0,35%; `DÒNG TIỀN MẠNH` volume
  ≥2× hoặc taker-buy ≥60%; `ĐỒNG THUẬN MTF` khi 15m+1h UP; `ĐÁY NÂNG` khi higher-low
  10/10; còn lại `ÁP LỰC TĂNG`. Thứ tự ưu tiên bảo đảm mỗi row chỉ có một màu.
- Đây không phải label/tier/gate/stat mới: không đổi classifier/score/lịch sử/Discord,
  Market Regime hoặc Binance/entry/size/leverage/SL/TP/order/position. Không card hay
  WHITELIST mới; JSON/API giữ nguyên và không migrate/backfill.

### 2026-09-22 — Bảng observe mặc định chỉ hiện tín hiệu đang đạt

- Thêm `COIN_LEVEL_OBSERVE_ACTIVE_ONLY_UI_V1_20260922`: LONG/SHORT sớm mặc định lọc
  daily history bằng `liveNow !== false`; lịch sử/rời điều kiện/giá live vô hiệu được
  ẩn để bảng dễ đọc. Checkbox riêng ở mỗi bảng cho phép hiện lại toàn bộ lịch sử hôm
  nay; dữ liệu vẫn được lưu, không xóa hoặc đổi dedupe.
- Không đổi dữ liệu causal, score/tier/gate, diagnostics, Discord hoặc Market Regime.
  Đây chỉ là UI, không ảnh hưởng Binance/entry/size/leverage/SL/TP/order/position hay
  stats/PnL. Không có label/card/WHITELIST mới; JSON cũ tương thích và UI fallback live
  list nếu thiếu history.

### 2026-09-22 — Market regime gate cho Coin Level LONG

- Thêm `COIN_LEVEL_MARKET_REGIME_GUARD_V1_20260922`, lấy dữ liệu trước entry từ cùng
  MarketBreadthShock socket 5m: context 15m/30m, số coin tăng/giảm, taker-buy và
  DUMP/PUMP WATCH/DANGER; yêu cầu fresh ≤60 giây, ≥60 mẫu và coverage ≥20%.
  `RISK_OFF` nếu DUMP_WATCH/DANGER, 15m+30m cùng DOWN hoặc taker-buy <48%.
  `RISK_ON` chỉ sau 15 phút liên tục có 15m+30m UP, tăng/giảm ≥1,5×, taker-buy ≥52%
  và yên DUMP 30 phút. Khoảng giữa là `RECOVERY_TEST`; thiếu/cũ là `WAIT_DATA`.
- Panel mới ở đầu Coin Level hiển thị state, số đo, countdown và lý do. Tín hiệu LONG,
  SHORT, Entry Score/tier/targets và Discord không đổi; RISK-OFF/RECOVERY vẫn lưu/hiện
  watch để kiểm chứng, không xóa lịch sử.
- Executor nâng thành `COIN_LEVEL_ENTRY_WATCH_LIMIT_3USDT_V4_MARKET_REGIME_20260922`:
  Coin Level LONG mới phải `RISK_ON` ở cả trước signed context và ngay trước submit.
  Gate áp cho cả LIMIT $3 pre-retest lẫn MARKET theo route sau retest. SHORT không đổi;
  không hủy order/position hiện hữu, không đổi entry/size/leverage/TP/SL/cooldown hay
  route khác. Signal audit/fill/PnL giữ nguyên, attempt LONG mới chỉ thêm regime metadata.
- Không có signal label/card thống kê/WHITELIST mới; exact matcher Coin Level cũ,
  checkbox seed OFF và closed AvgROE `>4%` giữ nguyên. API `marketRegime` và attempt
  metadata là additive; JSON cũ không migrate/rewrite/backfill/replay, consumer cũ có
  thể bỏ qua. Scheduler breadth chạy độc lập webhook để gate không mất dữ liệu.

### 2026-09-22 — Coin Level observe watch đối chiếu giá live

- Thêm `COIN_LEVEL_OBSERVE_LIVE_STATUS_V1_20260922`. Classifier LONG sớm V3 và SHORT
  sớm V2 vẫn chỉ dùng nến 5m/15m/1h đã đóng/fresh trước event; giá live sau event lấy
  từ mark socket 1s, agg-trade socket hoặc nến 5m đang chạy còn fresh chỉ để đánh dấu
  trạng thái. LONG bị `INVALIDATED` khi live `<=` mức vô hiệu, SHORT khi live `>=` mức
  vô hiệu; nếu ID nến đóng còn active và chưa vô hiệu thì hiện `ACTIVE`, còn lại là
  history. UI hiện close lúc phát cạnh live price/% move, không còn gọi chung mọi row
  là `Đang đạt`.
- Score/ngưỡng 65, subtype, diagnostics và lịch sử theo ngày VN không đổi; overlay này
  không được tính như backtest, W/L/WR/PF/AvgROE/PnL và không sửa Discord đã gửi.
  **OBSERVE ONLY**: không đổi Binance, entry/size/leverage/SL/TP, LIMIT/MARKET, order,
  position hoặc candidate xác nhận. Không có label/card/WHITELIST mới; exact matcher,
  mặc định OFF và closed AvgROE `>4%` giữ nguyên.
- API chỉ thêm field live-status và siết ý nghĩa `liveNow`; JSON/history cũ không
  migrate/rewrite/backfill/replay, consumer cũ bỏ qua field mới. Nếu socket chưa có giá
  thì giữ trạng thái nến đóng và hiển thị chờ socket thay vì kết luận sai.

### 2026-09-22 — COIN_LEVEL_EARLY_SHORT_WATCH_V2_SCORE_3TF_20260922

- SHORT sớm tách khỏi coverage 4h và chạy bằng nến đóng/fresh 5m/15m/1h. Điểm 0–100 gồm bối cảnh 25, sát vùng kích hoạt 20, EMA/momentum 20, rejection/phá hỗ trợ 10, flow bán 20 và anti-chase 5; nhận từ 65. `POST_PUMP_FADE` thay hard gate bơm >=8% bằng điểm bối cảnh 5–8%+, còn `BREAKDOWN_PRESSURE` bắt 15m/1h nghiêng giảm sát đáy 12 nến 15m ngay cả khi không có cú bơm trước. Hard guard giữ dữ liệu fresh, context/vùng hợp lệ, EMA >=8, rejection >=4, flow >=10 và chống taker mua mạnh/quá giãn.
- API bổ sung diagnostics lý do loại non-exclusive và history SHORT sớm theo ngày VN; file riêng dedupe coin+nến, tối đa 500, sống qua refresh/restart. UI hiện subtype, điểm, coverage, counter loại và trạng thái live/lịch sử; Discord đỏ hiện đúng subtype/điểm. Đây không phải performance stats hoặc xác suất.
- Vẫn observe-only và không đổi confirmed SHORT 4 khung, Binance/entry/size/leverage/SL/TP/LIMIT/MARKET/fill. Reason subtype không phải exact route/card; không thêm WHITELIST, matcher/seed OFF/policy closed AvgROE >4% giữ nguyên. JSON additive và fallback live; state V1 không migrate/replay.

### 2026-09-22 — COIN_LEVEL_EARLY_LONG_WATCH_V3_SCORE_3TF_20260922

- LONG sớm tách khỏi coverage 4h: chỉ cần cache nến đóng/fresh 5m/15m/1h và tự tính trend frame tương thích analyzer. Điểm 0–100 gồm trend 25, sát mốc 20, EMA/momentum 20, higher-low 10, flow 20, anti-chase 5; nhận từ 65 điểm. Thiếu từng điều kiện phụ chỉ trừ điểm, còn dữ liệu lỗi/stale, 15m/1h DOWN hoặc alignment <17/25, xa mốc ngoài −1,25%/+0,6%, EMA <8/20, flow <10/20 hoặc taker mua đã biết <45%, quá giãn hoặc tổng dưới 65 vẫn loại. Vùng/điều kiện phá + retest cũ không đổi.
- API bổ sung diagnostics lý do loại non-exclusive và lịch sử LONG sớm trong ngày VN. History ghi file riêng, dedupe coin+nến đóng, tối đa 500, sống qua refresh/restart và reset khi sang ngày; UI hiện điểm, coverage 3 khung, toàn bộ counter loại và trạng thái live/lịch sử. Đây không phải performance stats/xác suất.
- Vẫn observe-only/Discord riêng, không đổi candidate 4 khung, Binance/entry/size/leverage/SL/TP/LIMIT/MARKET/fill. Không có label/card/WHITELIST mới; matcher, seed OFF và policy closed AvgROE >4% giữ nguyên. JSON mới additive, UI cũ bỏ qua; UI mới fallback nếu server/state cũ thiếu field.

### 2026-09-22 — COIN_LEVEL_OBSERVE_WATCH_DISCORD_V1_20260922

- Router Discord riêng gửi `earlyLongWatches` màu xanh và `earlyShortWatches` màu đỏ từ đúng nến Binance đã đóng/fresh mà detector LONG V3 và SHORT V2 đã phân loại; không thêm dữ liệu tương lai. SHORT payload phân biệt `POST_PUMP_FADE` với `BREAKDOWN_PRESSURE` và hiện điểm sớm. Dedupe theo coin/hướng/reason/nến đóng, chỉ gửi watch sinh sau startup còn ≤12 phút, không replay lịch sử sau restart; state riêng tương thích additive và API thêm `observeDiscordConfigured` để UI báo ON/OFF.
- Tin ghi rõ `OBSERVE ONLY` và router từ chối mọi record không có `watchOnly=true` hoặc có `binanceEligible=true`. Không thay đổi score/tier/thống kê, confirmed candidate, Binance/entry/size/leverage/SL/TP/LIMIT/MARKET; executor vẫn chỉ dùng `snapshot.candidates`. Không tạo label/card/WHITELIST mới, matcher và policy closed AvgROE >4% giữ nguyên.

### 2026-09-22 — LIQUID_FLOW_V2_STARTUP_PRIORITY_V1_20260922

- Chống crash-loop heap bằng cách nạp Liquid Flow V2 trước, trì hoãn legacy paper 90 giây và parse từng store tuần tự; Short Wave bỏ `Promise.all` cho ba store lớn. Recommended không còn tự quét/copy lại toàn bộ pump/liquid/edge file lúc startup; recovery nguồn cũ chỉ chạy khi đặt `RECOMMENDED_SOURCE_FILE_SYNC_ENABLED=true`, còn source-open event live giữ nguyên. PM2 đổi từ heap 4 GiB/restart 4 GiB sang heap 12 GiB/restart 14 GiB. Pump WAL archive khác filesystem dùng `CROSS_DEVICE_FILE_MOVE_V1_20260922`: thử rename, gặp `EXDEV` mới copy rồi xóa nguồn sau khi copy thành công.
- Không đổi input causal, classifier/tier/gate, công thức thống kê, signal Discord hay Binance/entry/size/SL/TP. Không thêm route label/card/WHITELIST và không sửa JSON lịch sử; snapshot cũ vẫn đọc được, chỉ các trang paper cũ warm-up muộn hơn. Đây là policy runtime/storage, không phải rule giao dịch.

### 2026-09-21 — COIN_LEVEL_ENTRY_WATCH_DISCORD_V7_CANDLE_STATUS_20260921

- Tin Discord Coin Level mới hiện rõ `TRẠNG THÁI NẾN`: candidate chưa có `retestAt` là “15m đã xác nhận · chưa có retest 5m · có thể xét LIMIT tại entry dự kiến”; candidate có `retestAt` là “15m đã xác nhận · retest 5m đã đạt · đủ trạng thái nến để xét MARKET theo route”. Input vẫn chỉ là candidate đã tính từ nến đóng/fresh 5m/15m/1h/4h trước entry; không thêm dữ liệu sau entry hay đổi classifier.
- Đây là thay đổi nội dung Discord, không đổi Entry Score/tier/target hoặc thống kê, không tác động Binance/entry/size/leverage/SL/TP/lệnh hiện tại. Không thêm label/card/WHITELIST; matcher và policy closed AvgROE >4% giữ nguyên. JSON candidate/state cũ vẫn tương thích, thiếu `retestAt` dùng nhánh chờ retest và event Discord đã dedupe không replay.

### 2026-09-21 — COIN_LEVEL_EARLY_LONG_WATCH_V1_20260921 (lịch sử; V2 đã thay thế)

- Coin Level có watch LONG pre-breakout từ cache nến đóng/fresh 5m/15m/1h/4h: 15m UP, 1h không DOWN, close5m còn trong −0,8%/+0,35% so với đỉnh 12 nến 15m; close xanh trên EMA13/25 với EMA13 tăng và đáy 5m nâng; volume ≥50k + ≥1,3× median20, taker mua ≥55%. Không báo nếu range >1,8 ATR14 hoặc close cách EMA13 >1,25 ATR14. Vùng sau phá +0,15% và vô hiệu dưới đáy gần −0,25% chỉ tham khảo; phải đợi breakout/retest 5m, chưa gán xác suất hay hiệu suất.
- Có thể gửi Discord quan sát riêng theo `COIN_LEVEL_OBSERVE_WATCH_DISCORD_V1_20260922`, nhưng không gửi Binance và không đổi confirmed LONG gate, entry/size/SL/TP, candidate executor, fill/stats. Không thêm label route/card/WHITELIST; exact matcher và policy AvgROE giữ nguyên. API additive `earlyLongWatches/totalEarlyLongWatches`; JSON cũ không đổi và UI báo rõ khi server cũ chưa có field.

### 2026-09-21 — COIN_LEVEL_ENTRY_WATCH_TIER_SORT_UI_V1_20260921

- UI Coin Level sắp các dòng điểm vào theo `RẤT MẠNH ≥80` → `MẠNH ≥70` → `THEO DÕI ≥60` → `YẾU`, cùng tier thì Entry Score giảm dần; `GOOD` chỉ đổi tên hiển thị từ “ĐỦ TỐT” sang “MẠNH”. Dữ liệu trước entry, cách tính score/tier và thống kê không đổi.
- Chỉ tác động browser; API/executor/Discord vẫn giữ thứ tự candidate cũ nên không đổi Binance, entry/size/SL/TP. Không thêm label route/card/WHITELIST; JSON cũ tương thích nhờ dùng `entryTier` sẵn có và fallback label.

### 2026-09-21 — COIN_LEVEL_EARLY_SHORT_WATCH_V1_20260921

- Coin Level có thêm bảng watch SHORT sớm, dùng cùng cache nến Binance 5m/15m/1h/4h đã đóng/fresh trước entry. Phân loại near-peak: pump15m ≥8%, rời đỉnh 0,5–6%, close5m cắt xuống EMA13, nến đỏ và lower-high/râu trên, quote volume ≥50k và ≥1,3× median20, taker bán ≥52%; nến 5m mới ≤6 phút. Entry chỉ là vùng hồi EMA13 ±0,15% chờ nến 5m reject; vô hiệu trên đỉnh gần +0,25%. Đây là giả thuyết quan sát, không xác suất/backtest được chứng minh.
- Có thể gửi Discord quan sát riêng theo `COIN_LEVEL_OBSERVE_WATCH_DISCORD_V1_20260922`, nhưng không gửi Binance và không đổi gate SHORT xác nhận, entry/size/leverage/SL/TP, LIMIT/MARKET đang chờ, fill hay thống kê ngày. Không thêm exact signal label/card WHITELIST: key UI route thực vẫn khớp `RETEST_LONG_READY/RETEST_SHORT_READY`, checkbox seed OFF và policy closed AvgROE >4% giữ nguyên. API thêm `earlyShortWatches/totalEarlyShortWatches` additive; JSON candidate/control/attempt/Discord cũ giữ nguyên, consumer cũ bỏ qua field mới, UI mới gặp API cũ thiếu field báo server chưa nạp logic thay vì giả kết quả rỗng. Cần đo lead-time, MAE/MFE và kết quả thực trước khi cân nhắc mở route.

### 2026-09-21 — COIN_LEVEL_PENDING_LIMIT_INVALIDATION_V1_20260921

- Dữ liệu trước entry không đổi: Coin Level V3 dùng nến Binance 5m/15m/1h/4h đã đóng, Trend Score ±12, breakout15m/retest5m. Sau entry LIMIT chưa khớp, cleaner dùng metadata breakout gốc và **nến 5m đóng sau submit** cùng bốn khung còn mới để phân loại `VALID/INVALID/UNKNOWN`. Chỉ hai lượt `INVALID` liên tiếp cùng nến/lý do (mất score/hướng MTF, breakout gốc hết hạn/thay, close5m xuyên sai mốc) mới cancel phần chờ. Thiếu dữ liệu/lỗi phân tích/rớt top30 là `UNKNOWN` hoặc không liên quan, không hủy. Kiểm trạng thái order Binance thật trước hủy; partial chỉ hủy remainder và xử lý TP/SL vị thế đã khớp, thiếu plan không hủy sớm.
- Version evaluator `COIN_LEVEL_PENDING_LIMIT_INVALIDATION_V1_20260921`, executor `COIN_LEVEL_ENTRY_WATCH_LIMIT_3USDT_V3_INVALIDATION_20260921`. Không đổi size 3 USDT, giá LIMIT, leverage, TP/SL, MARKET retest, gate route, cooldown hoặc 45 phút expiry. Hủy không phải fill/PnL; thống kê vẫn chỉ dùng fill thật. Không có label/card/WHITELIST mới: key UI khớp matcher `RETEST_LONG_READY/RETEST_SHORT_READY`, seed OFF và policy closed AvgROE >4% giữ nguyên. Attempt JSON cũ thiếu metadata chỉ dùng expiry cũ, không migrate/rewrite; field mới additive, candidate/UI JSON không đổi.

### 2026-09-21 — COIN_LEVEL_ENTRY_WATCH_ROW_HIGHLIGHT_V1_20260921

- Bảng Coin Level tô nền hàng LONG xanh/SHORT đỏ chỉ khi candidate có `retestAt` từ nến 5m đã đóng; chưa retest để nền thường. Input causal và classifier gốc vẫn là candidate V3 từ nến Binance 5m/15m/1h/4h đã đóng, Trend Score ±12, breakout15m/retest5m. Màu chỉ là trạng thái hiển thị, không xác nhận đã có lệnh Binance.
- Không thêm label/card/WHITELIST, không đổi thống kê score/target/fill hoặc Binance/entry/size/SL/TP. Key UI khớp matcher `RETEST_LONG_READY/RETEST_SHORT_READY`; seed OFF và policy closed AvgROE >4% không đổi. JSON API/state cũ tương thích: không rewrite/migrate, thiếu `retestAt` thì hàng trung tính.

### 2026-09-20 — COIN_LEVEL_ENTRY_WATCH_DISCORD_V6_ENTRY_HIGHLIGHT_20260920

- Discord tín hiệu Coin Level mới có embed vàng đứng đầu, heading `ENTRY DỰ KIẾN` uppercase và giá/vùng in đậm; field cũ cũng nổi bật, bảng Coin Level có header uppercase và giá vàng đậm. Input trước entry giữ nguyên `entryPrice/entryZone` của candidate V3 từ nến Binance 5m/15m/1h/4h đã đóng. Classifier Trend Score ±12, breakout/retest, LIMIT/MARKET gate và dedupe không đổi.
- Thống kê score/target/fill không đổi; không ảnh hưởng Binance, entry, size, leverage, SL/TP, route/WHITELIST (key UI khớp matcher `RETEST_LONG_READY/RETEST_SHORT_READY`, seed OFF và closed AvgROE >4% policy giữ nguyên). JSON API/state cũ không migrate; thiếu entry hiện `—`, tin đã gửi không replay. Vàng là màu viền embed, không phải dấu lệnh đã khớp.

### 2026-09-20 — COIN_LEVEL_ENTRY_WATCH_LIMIT_3USDT_V2_20260920

- Sau signal Coin Level V3 từ nến Binance 5m/15m/1h/4h đã đóng/liên tục/còn mới, nhánh chưa retest được phân loại LIMIT khi Trend Score ±12, 15m/1h đồng hướng, close15m phá 12 nến, close5m và mark đều đã qua trung điểm entry đúng hướng 0,15–5%. Confirmation phải sau thời điểm ON/khởi động, mới ≤90 giây; kiểm lại giá đã làm tròn theo Binance tick trước submit. Entry Score/target ladder không thêm gate hay đổi thống kê. Có retest5m đóng thì vẫn dùng MARKET cũ.
- Binance: route ON/master ON, không vị thế/lệnh entry cùng symbol, cooldown4h, max30 vị thế; LONG BUY LIMIT thấp hơn mark hoặc SHORT SELL LIMIT cao hơn mark tại entry dự kiến. LIMIT GTC 3 USDT margin × leverage route, TP ROE route, SL −30% ROE; hủy sau45 phút, protection-on-full-fill. MARKET retest theo margin route mặc định1 USDT, cùng dedupe nên không phát đôi/DCA/replay. Version executor `COIN_LEVEL_ENTRY_WATCH_LIMIT_3USDT_V2_20260920`, policy `LIVE_CARD_LIQ_FLOW_COIN_LEVEL_LIMIT_V30_20260920`, Discord V5. Tin Discord/bảng chỉ là cảnh báo, không khẳng định đã submit hoặc fill; partial fill chưa được gọi là đã có TP/SL.
- Stats tiếp tục chỉ đếm fill thật theo matcher route/label cũ `RETEST_LONG_READY/RETEST_SHORT_READY`; không card/label/WHITELIST mới, key UI khớp matcher và checkbox policy closed AvgROE >4% mặc định OFF không đổi. JSON candidate/control/audit cũ tương thích bằng field additive; thiếu required fields fail-closed, không sửa/rewrite state cũ, LIMIT mới có client id `clel_`.
- Cleaner mỗi 35 giây hủy remainder của `clel_` khi partial fill rồi thử áp dụng TP/SL cho vị thế đã khớp; nếu plan không còn trong bộ nhớ hoặc bảo vệ lỗi, ghi lỗi cần kiểm tra thủ công. Chỉ coi là protected sau khi Binance xác nhận.
- LIMIT `clel_` còn mở từ process trước bị hủy sau restart thay vì tiếp tục chờ trong khi plan TP/SL in-memory đã mất. Không tác động LIMIT route khác.

### 2026-09-20 — COIN_LEVEL_ENTRY_SCORE_V1_CAUSAL_TARGETS_20260920

- `COIN_LEVEL_ENTRY_WATCH_V3_ENTRY_SCORE_TARGETS_20260920` bổ sung Entry Score 0–100 và target ladder cho đúng candidate hiện hữu. Điểm = trend25 + breakout15m20 + retest5m25 + quote-volume/taker15 + khoảng trống cấu trúc15; tier `80+ RẤT MẠNH`, `70–79,9 ĐỦ TỐT`, `60–69,9 THEO DÕI`, dưới60 YẾU. Chỉ là chất lượng mô tả, không phải win probability hoặc gate execution.
- Dữ liệu causal cắt tại retest/confirmation: nến closed/fresh/continuous 5m/15m/1h/4h, volume/taker nến tín hiệu, tối đa20 volume trước, swing/range và ATR14 đã hình thành. Không dùng future mark/candle/outcome/PnL/MFE, CoinGlass/order book/OI/L/S. Target pool gồm structure, TP +10% ROE @5x, ATR15×1, biên ATR4h/8h; gộp mốc gần và xếp T1–T3 theo khoảng cách thuận hướng. Không hiển thị xác suất giả khi chưa hiệu chỉnh backtest.
- Bảng Coin Level và Discord `COIN_LEVEL_ENTRY_WATCH_DISCORD_V4_SCORE_TARGETS_20260920` hiện score breakdown, tier, giá/%/gross ROE/basis của T1–T3. Classifier ±12, breakout/retest, executor MARKET $1×5, freshness/drift/controls/dedupe, TP10/SL30 giữ nguyên; score/target không tham gia route hoặc đổi Binance/entry/size/leverage/DCA/SL/TP.
- JSON chỉ thêm optional fields, không migrate/rewrite state cũ. Không exact label/performance card/stat cohort mới; tiếp tục `RETEST_LONG_READY/RETEST_SHORT_READY`, nên không có checkbox WHITELIST mới và rule closed AvgROE>4%/default OFF giữ nguyên. Tests coin-level kiểm tra causal score, target hai hướng, UI, Discord và regression executor.

### 2026-09-20 — COIN_LEVEL_ENTRY_WATCH_RETEST_MARKET_V1_1USDT_20260920

- Candidate causal hiện là `COIN_LEVEL_ENTRY_WATCH_V3_ENTRY_SCORE_TARGETS_20260920` nhưng giữ nguyên rule V2: nến đóng/liên tục/còn mới 5m/15m/1h/4h, score LONG `>=+12` hoặc SHORT `<=-12`, 15m/1h đồng hướng, close15m phá biên 12 nến trước trong 45 phút và không close5m hậu xác nhận đóng ngược mốc. Binance chỉ nhận candidate có retest5m đã đóng trong 30 phút, chạm mốc ±`0,15%` và giữ đúng phía; Entry Score/targets không tham gia gate, hàng còn “chờ retest” không vào.
- Executor/catalog/controls/policy lần lượt là `COIN_LEVEL_ENTRY_WATCH_RETEST_MARKET_V1_1USDT_20260920`, `OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V5_COIN_LEVEL_RETEST_20260920`, `AUTO_ENTRY_CONTROLS_V15_COIN_LEVEL_RETEST_MARKET_20260920`, `LIVE_CARD_LIQ_FLOW_COIN_LEVEL_RETEST_V29_20260920`; SHORT giữ SL nhờ `BINANCE_BOT_SHORT_TP_ONLY_COIN_LEVEL_EXEMPT_V6_20260920`. Hai route dùng source `coin-level-entry-watch`, stream `closed-mtf-retest`, exact label có sẵn `RETEST_LONG_READY/RETEST_SHORT_READY`.
- MARKET mặc định `1 USDT margin ×5`, TP `+10% ROE`, SL `-30% ROE`, full-fill re-anchor, min-notional ceil có trần +1%. Gate gồm master+route ON, signal sau enabledAt, retest mới `<=90s`, mark drift `<=0,5%`, không position/open entry order cùng symbol, cooldown4h, durable dedupe và private policy token; không DCA/replay/retry mù. Dữ liệu API thêm `binanceExecution`, candidate thêm `version/observeOnly/binanceEligible/executionEligible`, state attempt là file mới additive; JSON cũ thiếu field fail-closed và không bị migrate/rewrite.
- Fill thật được audit/daily stats theo route; không tạo paper/performance card hay label name mới, nên không thêm checkbox WHITELIST. Catalog vẫn seed OFF; chỉ quyền bật tường minh trong Orders mới cho phép lệnh. Discord chỉ thông báo candidate và ghi executor retest chạy độc lập, không giả báo đã khớp lệnh.

### 2026-09-20 — COIN_LEVEL_ENTRY_WATCH_V2_RETEST_ENTRY_ZONE_20260920

- Giữ nguyên toàn bộ classifier V1 và chỉ sau khi coin đã vào `candidates` mới dựng entry retest causal từ mốc phá biên: LONG `level..level×1,0015`, SHORT `level×0,9985..level`, midpoint làm `entryPrice`, làm tròn8 chữ số. Không dùng mark hiện tại, outcome hoặc dữ liệu tương lai và không biến coin chỉ đủ Trend Score thành candidate.
- Bảng thêm cột Entry dự kiến gồm midpoint + range. Discord V2 lịch sử dùng chính field API; notifier hiện là V3 và ghi executor retest chạy độc lập. Midpoint/range vẫn không phải LIMIT order; executor V1 chỉ dùng midpoint làm drift guard cho MARKET sau retest5m đã đóng. Candidate còn chờ retest vẫn OBSERVE ONLY.
- Không paper/W-L/AvgROE/PnL, performance card hoặc WHITELIST mới. JSON candidate thêm field additive; consumer/state cũ không migrate/rewrite, field thiếu hiển thị `—`. Có test hai hướng, công thức zone/midpoint, bảng và payload Discord.

### 2026-09-20 — COIN_LEVEL_ENTRY_WATCH_DISCORD_V1_20260920

- Discord nền dùng đúng danh sách `candidates` của `COIN_LEVEL_ENTRY_WATCH_V1_20260920`, không có classifier riêng: chỉ coin đã xuất hiện trong bảng “Coin đạt bộ lọc điểm vào” mới được gửi. Input causal là nến closed/fresh/continuous 5m,15m,1h,4h; score `>=+12` LONG hoặc `<=-12` SHORT, 15m/1h đồng hướng, close15m phá biên12 nến trước trong45 phút và không close5m hậu xác nhận đóng ngược mốc. Payload ghi mốc, close, score, hướng và trạng thái retest; không gửi lại khi retest thay đổi cho cùng confirmation.
- Scheduler30s độc lập tab; chỉ nhận confirmation sau startup và còn mới <=45 phút. Dedupe exact symbol/side/confirmationAt trong state7ngày, intent lưu trước POST; unknown không replay mù, rejection có backoff60s–1h. Webhook chỉ ở `.env`, API/UI chỉ lộ boolean configured. Không mention Discord.
- Discord không tự cấp quyền hoặc khẳng định đã khớp lệnh. Executor retest V1 độc lập có thể xử lý cùng candidate chỉ sau retest5m READY và controls/private policy; delivery state không tham gia gate. Không paper/W-L/AvgROE/PnL, performance card hay WHITELIST mới; JSON additive/ignored, không migrate/backfill/replay. Có test payload, startup cutoff, dedupe, 429 và wiring scheduler.

### 2026-09-20 — COIN_LEVEL_BINANCE_BLOCK_STATUS_V1_20260920

- Trên đầu Coin Level hiện banner tình trạng Binance REST từ endpoint read-only `/api/binance-rate-gate`, poll10s. Input vận hành trước entry là hai snapshot `gate`/`analyzeGate`: `blockedUntil/blockReason`, `authBlockedUntil/authBlockReason/authBlocks`, `queue/highWatermark/congested`, `scannedAt`. Chỉ khi timestamp block còn hiệu lực mới ghi “đang chặn”, nêu 418/429 hoặc -2015, nguồn auth và ETA/probe giờ VN. Queue nghẽn là trạng thái nội bộ khác Binance ban; API thiếu/lỗi ghi chưa rõ, không đoán nguyên nhân. Lỗi `STALE_LAST_GOOD`, `LIVE_PARTIAL` hoặc request coin riêng được hiện ở dòng riêng và không bị gọi là block toàn cục. Snapshot hiện có không đổi.
- Không thay gate thật hoặc mở chặn, không Binance/Discord/entry/size/leverage/DCA/SL/TP/order/position; không thống kê trade/W-L/AvgROE/PnL, signal label hoặc performance card mới. Không WHITELIST mới; default OFF và closed AvgROE>4% của card trade vẫn nguyên. Frontend helper version mới additive, JSON cũ và consumer cũ tương thích; field thiếu fail-closed thành unknown. Có test 418/429/-2015/congestion/expired và regression Coin Level.

### 2026-09-20 — COIN_LEVEL_ENTRY_WATCH_V1_20260920

- Đầu `/coin-level-analysis` có bảng ứng viên LONG/SHORT độc lập coin đang xem, poll30s từ API `/api/coin-level-entry-watch`. Input trước entry chỉ là cache nến Binance đã đóng/liên tục/còn mới ở 5m,15m,1h,4h (>=100 nến/khung); không gọi REST từng coin, không dùng CoinGlass, outcome, fill hay nến tương lai. API cache20s, hiện độ phủ cache so với universe và tối đa30 hàng. V1 ban đầu chỉ quan sát; quyền hiện tại nằm ở executor retest V1 phía trên.
- LONG khi Trend Score hiện có `>=+12`, 15m/1h cùng UP và close15m phá đỉnh12 nến trước; SHORT đối xứng `<=-12`, 15m/1h DOWN, close15m thủng đáy12 nến trước. Break phải nằm trong ba nến15m gần nhất/tối đa45 phút, close5m mới nhất vẫn đúng phía mốc và không nến5m nào sau đó đóng xuyên ngược mốc. “Chờ retest” không vào; “retest5m đạt” chỉ đi tiếp qua freshness/drift/controls/no-position/dedupe của executor V1.
- Stats bảng chỉ là universe/covered/candidates, không paper, W/L/AvgROE/PnL hay card hiệu suất. Không có checkbox WHITELIST mới; ảnh hưởng Binance/entry/size/SL/TP được mô tả ở executor V1. JSON additive, không migrate/rewrite; thiếu/gap/stale thì fail-closed.

### 2026-09-20 — COIN_LEVEL_ENTRY_DISPLAY_V2_20260920

- `/coin-level-analysis` tách **xu hướng tổng hợp** (`recommendation.bias`) khỏi **hướng 15m đã xác nhận** (`stance`); bias nghiêng LONG/SHORT tự nó không phải entry. Khi hai plan cùng vùng hỗ trợ, thay hai trung điểm trùng nhau bằng mép trên làm ngưỡng 15m đóng trên cho LONG và mép dưới làm ngưỡng 15m đóng dưới cho SHORT; vẫn đợi retest 5m. Khi 15m xác nhận một hướng, ẩn mốc lớn đối chiều và ghi rõ chờ retest. Với vùng khác nhau vẫn ghi mốc lớn là trung điểm tham khảo, không gọi dự báo giá vào.
- Dữ liệu trước khi hiển thị chỉ là JSON `recommendation`/`freshness` hiện có từ phân tích Binance đa khung, không dùng nến/giá tương lai và không đổi classifier. Stale/vùng lỗi fail-closed. Không thêm label/tier/card thống kê hay W/L/PnL/AvgROE/WHITELIST; policy closed AvgROE `>4%`, checkbox default OFF không đổi. **OBSERVE ONLY**: không tác động Binance/Discord/entry/size/leverage/DCA/SL/TP. JSON cũ đọc được, không migrate/rewrite; output `buildCoinLevelEntryPreview` V1 giữ cho consumer, V2 chỉ là view layer. Test coin-level gồm WAIT, xác nhận hai chiều, ẩn đối chiều và stale.

### 2026-09-20 — COIN_LEVEL_ENTRY_PREVIEW_V1_20260920

- Trên coin-level-analysis thêm hai card giá LONG xanh/SHORT đỏ. Dữ liệu trước lúc hiển thị là recommendation entryZone đã có từ phân tích Binance đa khung; lấy trung điểm làm giá tham khảo và hiện cả khoảng vùng. Không tạo thuật toán dự báo giá/entry mới; cả hai vẫn chờ xác nhận nến 15m và retest 5m. Stale hoặc vùng thiếu/không hợp lệ hiển thị `—`.
- Khi hai plan cùng neo một vùng (CYS), giá trung điểm có thể bằng nhau; UI ghi rõ LONG khi giữ vùng, SHORT khi phá vùng rồi retest thất bại, không phải hai lệnh đồng thời.
- Chỉ UI **OBSERVE ONLY**, không thay Binance/entry/size/SL/TP/Discord/WHITELIST; không thống kê W/L/PnL/AvgROE hay card hiệu suất mới. Đọc JSON cũ không cần migration, field thiếu fail-closed. Test coin-level gồm preview hai chiều, stale/invalid, HTML/CSS và socket regression.

### 2026-09-20 — LIQSCAN_SWEEP_SIDE_PROXY_GT100M_V1_20260920

- Theo đính chính của người dùng, chỉ lọc Discord sweep bằng **tổng thanh khoản ước tính phía bị quét >100M** trong dòng LiqScan hiện tại; không dùng khối lượng riêng MAIN KILL. Giữ nguyên detector/tier/webhook/executor. Input trước thông báo là snapshot tổng trên/dưới tại lần quét; UPPER→above, LOWER→below, strict >100M. JSON mới thêm `liquidityAtSweep`; JSON cũ fallback tổng cùng phía lúc gác vùng, không migrate hoặc đổi matcher/version event cũ.
- Kiểm tra công thức: quote-volume × taker-share × age-weight × sqrt(leverage), cộng nhiều giả định leverage. Số này không phải số coin hoặc USD thanh lý thực; sửa nhãn Discord thành `proxy`, thêm ghi chú UI, giữ nguyên trị số và công thức. Các field tiền margin Binance vẫn là USDT.
- Gate chỉ thông báo, sau executor: không ảnh hưởng entry/size/SL/TP/DCA/leverage/WHITELIST. MAIN KILL vẫn theo quyền giao dịch cũ, reference vẫn OBSERVE ONLY. Không đụng notifier high-score/horizon/squeeze riêng. Stats swept giữ nguyên, sent không tăng khi filter; acknowledge event lọc tránh lặp pending, lỗi gửi thật vẫn retry. Không thêm performance-card nên không phát sinh checkbox WHITELIST; policy closed AvgROE>4%/OFF mặc định không đổi.
- Đã test boundary100M, missing/non-finite, current-vs-arm totals, cả MAIN KILL/reference và trên/dưới, routing/execution cũ, dedupe/retry và UI/socket hiện có.

### 2026-09-20 — SQUEEZE_RATIO_WATCH_V1_20260920

- Thêm scanner tự động toàn USDT perpetual TRADING, Discord riêng, danh sách event trên `coin-level-analysis` và GET API read-only; không phụ thuộc người dùng search. Phân loại giữ ngưỡng weekly research: closed15m breakout prior20 high + quote-volume ≥2× median20 + close top25%; closed1h close>EMA13>EMA25, EMA25 tăng4h. Account L/S <1 giảm≥10%/1h; cộng OI số lượng tăng≥3%/1h thành tier tím, ratio-only màu cam. Derivatives dùng as-of lag15m, không lookahead; thiếu ratio fail-closed, thiếu OI ghi rõ. Input chỉ dữ liệu trước alert, không có entry.
- Dùng cache500 nến (EMA seed hữu hạn có thể lệch nhẹ backtest dài), warm8/lượt, derivatives12 ứng viên/lượt, scheduler60s và rate gate chung. Theo dõi coverage/errors/time, không thống kê hiệu suất trading. Dedupe6h/coin/tier, strong gộp weak, không replay lịch sử lúc restart; intent bền vững, HTTP failure retry khi fresh, timeout không tự replay. List tối đa200/7ngày, poll30s, giá xác nhận không phải điểm vào.
- **OBSERVE ONLY**: không Binance/entry/size/SL/TP/DCA/leverage/paper; không mở card thống kê hoặc WHITELIST execution. Policy WHITELIST closed AvgROE>4%, default OFF không đổi; tài liệu Binance đã ghi rõ. JSON state riêng additive, không thay đổi JSON lịch sử hoặc route cũ. Webhook chỉ cấu hình `.env`; tests kiểm tra causal/gap/stale, hai tier, dedupe/restart, HTTP429/timeout, scanner/API/UI.

### 2026-09-19 — WEEK_LONG_POST_PUMP_EMA99_SLOPE_REJECT_V1_20260919

- Thêm Discord exact `WEEK_LONG_POST_PUMP_EMA99_SLOPE_REJECT_15M` cho mẫu coin đã bơm lớn 3–7 ngày trước, sau đó xả dai dẳng và cú hồi volume lớn chạm EMA99 15m bị nến đóng kế tiếp bán ngược. Scanner Top400 dùng cache WebSocket 1h/15m, warm missing-only 15m theo batch; history 1h chỉ warm cho candidate qua prefilter 15m, tối đa 6 coin/lượt. Webhook mới chỉ có trong `.env`.
- Input trước alert: 168 closed 1h xác nhận pump `>=35%`, peak-age `72–168h`, drawdown `>=20%`, xu hướng 72h `<=-8%` với `R²>=0,60` và 2 median segment giảm. Cache 15m cần tối thiểu 135 nến đóng, nhưng trigger chỉ hợp lệ khi có đủ EMA99 + trọn 40 điểm EMA99 đã hình thành (10h); dốc quy đổi `<=-1,5%/24h`, `R²>=0,92`, decline-share `>=85%`, 32-close-below-share `>=80%`; spike `>=4%`, volume `>=3x`, chạm gần EMA99 và nến xác nhận trong 1–3 bar trả `>=5%`, volume `>=1,5x`, `close<EMA13<EMA25<EMA99`. Nến live/gap/stale và signal `>120m` bị loại.
- Payload đỏ sẫm nhấn mạnh tuổi đỉnh, pump/drawdown, dốc và R² EMA99, spike/reject volume cùng mốc vô hiệu tham khảo. Version này là **OBSERVE ONLY**: không Binance entry/size/leverage/DCA/TP/SL, không paper, không đổi lệnh/position cũ.
- Stats chỉ `requested/warmed/processed/detected/sent/failed`; không card/cohort/AvgROE/WHITELIST. State dedupe JSON mới là additive; không migrate/backfill/replay/rewrite dữ liệu cũ, runtime/consumer cũ bỏ qua label mới an toàn.

### 2026-09-19 — COIN_LEVEL_ANALYSIS_MARK_SOCKET_V1_20260919

- `/coin-level-analysis` nhận MARK Binance Futures mỗi giây qua WebSocket nội bộ; backend dùng chung `sharedMarkTicker`, chỉ đăng ký coin đang mở, lọc symbol, heartbeat và cleanup khi disconnect. UI cập nhật giá đầu trang, price ladder, MARK LiqScan và khoảng cách live tới vùng proxy; HTTP20s vẫn đồng bộ nến/CoinGlass và dự phòng khi socket rớt.
- Socket không thay đổi dữ liệu causal của detector: EMA/cấu trúc/confirmation vẫn theo snapshot/nến đóng hiện hữu, không dùng tick live để phát signal hoặc đổi tier. Không Binance entry/size/leverage/TP/SL, không stats hiệu suất/card/WHITELIST.
- Payload socket additive, không file JSON/state/migration/backfill. Client cũ không mở socket vẫn dùng endpoint HTTP như trước; reconnect có backoff và không mở một upstream Binance riêng cho mỗi tab.

### 2026-09-18 — LIQSCAN_SWEEP_VOLUME_WEBHOOK_ROUTING_V1_20260918

- Thêm detector `LIQSCAN_REFERENCE_SWEEP_DISCORD_V1_LARGE_VOLUME_20260918`: cache-only Top400 gác causal `sweepTarget` khi mark/high-low 15m còn chưa chạm; lần đầu chỉ tạo baseline, sau đó chỉ phát khi cực trị mới xuyên mức. Dùng `sweepTarget.score` của vùng, không dùng tổng liquidity cùng phía; chỉ nhận vùng `>=2M USDT` và không bắt buộc imbalance score65.
- Router chia độc quyền theo tier: MAIN KILL hoặc REFERENCE_PROXY `LARGE/VERY_LARGE/EXTREME` (`zone.liquidity >=2M`) đi `LIQ_SCAN_LARGE_VOLUME_DISCORD_WEBHOOK_URL`; MAIN KILL dưới2M giữ webhook cũ. Payload nhấn mạnh volume vùng, phần trăm cùng phía và tổng proxy hai phía; không gửi duplicate sang hai webhook.
- `REFERENCE_PROXY` là OBSERVE ONLY, không Binance/entry/size/leverage/TP/SL. Executor MAIN KILL EXTREME >=50M hiện hữu không đổi và vẫn có thể xử lý trước thông báo webhook lớn. Stats chỉ operational, không card/cohort/AvgROE/WHITELIST; policy CLOSED AvgROE>4% mặc định OFF không đổi.
- JSON additive bằng file dedupe mới `data/liq-scan-large-volume-sweep-discord.json` và optional `zoneType/version/execution`; tracker reference là memory-only, restart baseline lại, không migrate/backfill/replay/rewrite dữ liệu cũ.

### 2026-09-18 — LIQSCAN_MAIN_KILL_SWEEP_EXTREME_REVERSAL_MARKET_V1_20260918

- Detector V2 vẫn tự quét cache-only Top400 và chỉ phát khi vùng MAIN KILL đã gác trước đó bị cực trị 15m mới xuyên hết. Executor mới chỉ chấp nhận tier đỏ `EXTREME/rank5` đồng thời proxy vùng `>=50M USDT`; UPPER/killed-short → exact SHORT, LOWER/killed-long → exact LONG. Snapshot/tick, mark, range, `armedAt/detectedAt` đều là dữ liệu causal trước entry; restart dựng baseline mới, không replay râu/NEAR lịch sử.
- Controls/catalog/policy lần lượt là `AUTO_ENTRY_CONTROLS_V14_MAIN_KILL_EXTREME_REVERSAL_20260918`, `OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V4_MAIN_KILL_SWEEP_20260918` và `LIVE_CARD_LIQ_FLOW_MAIN_KILL_EXTREME_V28_20260918`. Hai exact route source `liqscan-main-kill-sweep`, stream `background-top400` có input margin/leverage/TP; mặc định MARKET `1 USDT ×5`, TP `+10% ROE`, SL cố định `−30% ROE`. SHORT exemption V5 giữ SL, full-fill re-anchor protection; quantity có thể ceil vừa đủ min-notional trong trần +1% để tránh Binance `-4164` sau làm tròn step-size.
- Gate runtime: master+route ON, event sau enabledAt và `<=90s`, mark drift `<=0,5%`, no position/open entry order cùng symbol, cooldown 4h, private authorization và valid saved size. Durable attempt/client ID chặn double-submit/retry mơ hồ; không DCA hay sửa lệnh cũ. Discord thể hiện trạng thái Binance thật; tier dưới50M vẫn OBSERVE ONLY.
- Daily stats/audit chỉ dùng fill thật exact source/stream/label/side và realized PnL khi đóng. Không tạo performance card/AvgROE cohort hoặc WHITELIST mới; nếu tạo card sau này phải mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%`. JSON chỉ thêm hai row controls và file attempts mới, đọc file cũ additive, không migrate/backfill/replay/rewrite signal/fill/order/protection cũ.

### 2026-09-18 — LIQSCAN_MAIN_KILL_SWEEP_BACKGROUND_TOP400_V2_20260918

- Thay cảnh báo nền “mọi coin score `>=65`” bằng event `LIQSCAN_MAIN_KILL_SWEEP_DISCORD_V2_VOLUME_EMPHASIS_20260918`: score 65 chỉ gác MAIN KILL; UPPER phải được quan sát từ dưới vùng rồi có high/mark mới xuyên hết mép trên, LOWER đối xứng từ trên vùng qua mép dưới. Vùng/score/mark được đóng băng lúc gác, tối đa30 phút; vào giữa vùng không gửi. First observation chỉ tạo baseline extremum nên restart không replay râu cũ.
- Input causal là Top400 snapshot theo quote-volume, mark/tick tối đa90s và cache15m live liên tục tối thiểu60 nến; heatmap/snapshot dùng chung coin page. Stats thêm `swept`, còn `active` chỉ đếm số đang đạt score65; không tạo PnL/card/cohort/WHITELIST và policy CLOSED AvgROE `>4%` mặc định OFF không đổi.
- Discord màu tím cho quét MAIN KILL phía trên/killed-short và xanh lam cho phía dưới/killed-long, ghi vùng, mark gác, giá xuyên và thời điểm Việt Nam; cảnh báo rõ không suy ra đảo chiều. `mainKillZone.score` được trình bày như proxy 15m theo tier THƯỜNG/RÕ/LỚN/RẤT LỚN/SIÊU LỚN tại các mốc 500K/2M/10M/50M USDT, kèm thanh cường độ và tỷ trọng cùng phía. Tất cả tier vẫn gửi; chỉ SIÊU LỚN là Binance gate. Dedupe bền theo symbol+hướng+range, cooldown runtime15 phút.
- Tier dưới50M không gọi Binance; tier đỏ gọi executor V1 ở mục trên. Route explicit strict `>80` không đổi. Không tạo card/WHITELIST mới. JSON additive ở `data/liq-scan-main-kill-sweep-background-discord.json`; field volume/tier/execution có thể bị consumer cũ bỏ qua, state V1 cũ không migrate/rewrite/backfill, tracker sau restart baseline lại nên không phát lịch sử.

### 2026-09-18 — LIQ_SCAN_SCORE65_BACKGROUND_TOP400_V1_20260918

- Bổ sung scheduler cache-only 30s: Top400 USDT perpetual theo quote-volume, market snapshot/tick tối đa90s, tối thiểu60 nến15m liên tục. Dùng đúng heatmap/snapshot của coin page; thiếu/gap/stale fail-closed và không cần mở/search trang. Startup bù cache thiếu một lần theo batch3/2s, limit60 và retry missing-only5phút; các lượt scan không gọi REST từng symbol.
- Discord giữ `>=65`, reset `<65`, ABOVE/LONG và BELOW/SHORT, dedupe theo episode/tier; active alert giãn450ms. Stats chỉ selected/processed/active/sent/failed/coverage, không card/cohort/PnL/WHITELIST.
- Background dùng state Discord riêng và **không gọi Binance executor** kể cả `>80`; entry/size/leverage/TP/SL và route manual `>80` không đổi. JSON additive/new file, không migrate/backfill/replay lịch sử.

### 2026-09-18 — LIQ_SCAN_SCORE65_DISCORD_BINANCE80_V3_20260918

- Snapshot causal/freshness/hướng LiqScan giữ nguyên. Discord đổi từ strict `>80` sang inclusive `>=65`; reset dưới 65, dedupe theo symbol+dominant-side và chỉ gửi lại khi đổi hướng hoặc lần đầu nâng từ tầng Discord sang strict `>80`.
- Binance routes giữ nguyên strict `>80`, settings, drift/cooldown/no-position/no-order và protection; score 65–80 chỉ Discord, không gọi executor và không đổi entry/size/leverage/TP/SL. Fill/PnL stats vẫn chỉ từ Binance thật; không card/Limit Paper/WHITELIST mới.
- JSON V3 thêm cờ tier notification, đọc V2 thiếu field bằng active/score để tránh replay; không backfill/migrate/rewrite dữ liệu cũ. Payload phân biệt rõ ngưỡng Discord `>=65` và Binance `>80`, điểm lệch không phải xác suất thắng.

### 2026-09-18 — EXTREME_SQUEEZE_FIRST_PUMP_FLUSH_LONG_V5_20260918

- Thêm exact Discord event `FIRST_PUMP_FLUSH_RECLAIM_LONG_CLOSED` màu cyan vào webhook Extreme hiện hữu. Input causal là closed/continuous 5m: nền 20 nến, ATR14, EMA13/25, OHLC, quote-volume và taker-buy nếu cache có; xác nhận cuối phải mới `<=90s`. Không dùng CoinGlass, tương lai hay outcome.
- Classifier yêu cầu nền `<=3,5%`, cú bơm đầu `>=5%`, `>=8 ATR`, volume `>=10x median20` và `>=100k USDT`, breakout `>=1%`; xả trong 1–2 nến trả lại `40–80%`, giữ impulse-open trong tolerance `0,2%`, strong close/râu dưới, volume `>=3x`, reclaim midpoint/EMA13/25 và absorption taker/close. Payload trả vùng vào sớm dự kiến, high cần vượt để xác nhận an toàn hơn, target đo biên và pivot vô hiệu.
- Alert là **OBSERVE ONLY**, `binanceEligible=false`: không entry, size, leverage, DCA, TP, SL hay sửa lệnh. Không ghi Limit Paper, không tạo card/WHITELIST/stats hiệu suất; chỉ giữ processed/detected/sent/failed và Discord dedupe. JSON additive, không migrate/backfill/replay; event cũ thiếu version/kind mới không được phát lại.

### 2026-09-17 — BINANCE_SYMBOL_PROTECTION_EXCLUSION_V2_AUTO_RESET_ON_CLOSE_20260917

- Controls `AUTO_ENTRY_CONTROLS_V13_POSITION_SCOPED_PROTECTION_EXCLUSIONS_20260917` giữ danh sách exact symbol trên `/binance-auto-controls`, nhưng mỗi ngoại lệ nay chỉ sống trong một vòng vị thế: thủ công gỡ ngay hoặc runtime tự gỡ khi Position Risk xác nhận symbol đã flat; one-way reversal cũng kết thúc vòng cũ. Partial close/DCA, event stale và snapshot omission không reset. Input chỉ là lựa chọn thủ công, không đổi detector/classifier, causal data trước entry, authorization, side, margin, leverage hoặc entry.
- Trong vòng bị bỏ qua, entry theo rule cũ vẫn được phép nhưng auto protection dừng trước write: protection-on-fill/direct TP-SL, missing/startup guard, Pump/Liq pending protection, TP âm/12h, dời SL/break-even/profit-lock và Fast Wave. Existing TP/SL không bị cancel/replace. Close đã xác minh xóa exclusion, signal protection plan và pending Liq TP cũ để vòng entry kế tiếp dùng lại quản lý bình thường, không mang state cũ sang.
- Fill/close audit, daily entry và realized PnL không đổi; không có cohort/card/label/stats/WHITELIST mới. JSON tiếp tục dùng additive `protectionExclusions`; V1 và file thiếu version vẫn đọc được, route state giữ nguyên. Auto-reset là update idempotent theo exact symbol, không migrate/backfill/replay order hoặc protection lịch sử.

### 2026-09-16 — PUMP_FLUSH_RECLAIM_BIDIRECTIONAL_DISCORD_V3_DEEP_BASE_GATES_20260916

- Input causal: closed/continuous 15m nhận impulse + reversal, closed/continuous 5m nhận reclaim/reject EMA13/EMA25, volume và taker; stale/gap/live candle fail-closed. Scanner cache-only, top tối đa 400 coin; mark chỉ hiển thị giá lúc phát, không tham gia gate.
- LONG exact `PUMP_FLUSH_RECLAIM_15M_LONG_READY`: pump 2–4 nến `>=8%`, volume `>=1,5x`; flush siết từ `45%` lên **`65–95%`**, reversal volume `>=1,5x`, close recovery `>=55%` và wick `>=25%` hoặc strong close `>=70%`. SHORT exact `DUMP_SQUEEZE_REJECT_15M_SHORT_READY` đối xứng. Cả hai chặn mở nhịp đã cách context low/high 96 nến quá `60%`, siết cách reclaim/reject còn `<=2%`, bắt buộc giá còn cách impulse extreme `>=2%` và mới hồi `<=80%` biên reversal. BR-like shallow 49,6%, weak close 20,2% hoặc alert sát đỉnh không còn READY.
- Discord chuyên dùng lấy secret từ env; LONG xanh, SHORT đỏ, giữ timeline giờ Việt Nam và thêm context-extension/distance-to-extreme/recovery metrics. **OBSERVE ONLY**; không Binance entry/size/leverage/DCA/TP/SL, không đổi controls hay lệnh cũ.
- Stats chỉ ghi processed/detected/sent/failed, không W/L/PnL/AvgROE/card/WHITELIST. JSON event thêm optional gate metrics, state/dedupe key giữ nguyên nên không replay V1/V2; JSON cũ không migrate/rewrite/backfill. Nhãn LONG không trùng card Liquid Flow legacy.

### 2026-09-16 — LiqScan >80 Discord + MARKET 5 USDT

- Versions: `LIQ_SCAN_HIGH_SCORE_DISCORD_BINANCE_V2_20260916`, `LIQ_SCAN_HIGH_SCORE_MARKET_EDITABLE_ENTRY_V1_20260916`, catalog V3, controls V11, policy V27 và bot-short SL exemption V4. Webhook mới nằm ở env `LIQ_SCAN_HIGH_SCORE_DISCORD_WEBHOOK_URL`; không ghi secret vào source/docs.
- Input causal chỉ gồm snapshot LiqScan/Binance còn mới `<=90s` tại lúc phát. Strict `score >80`; `ABOVE -> LIQSCAN_HIGH_SCORE_ABOVE_LONG/LONG`, `BELOW -> LIQSCAN_HIGH_SCORE_BELOW_SHORT/SHORT`. Chỉ lần vượt ngưỡng mới hoặc flip hướng trong episode được phát; đúng 80 reset. Recommendation/retest và PnL không tham gia gate, điểm lệch không phải xác suất.
- Khi master + exact route ON và event mới sau enabledAt, executor thử MARKET `5 USDT margin ×5`, TP `+15% ROE`, SL LONG `−20%` / SHORT `−30%` từ full-fill. Fresh mark drift `<=0,5%`, no-position/no-open-entry-order, 4h cooldown, durable client ID và state SUBMITTING chống double-submit; không DCA/replay/sửa lệnh cũ.
- Audit/stat theo exact source/stream/label/side và realized PnL thật; không tạo card Liquid Flow/WHITELIST mới. Nếu tạo card hiệu suất sau này vẫn mặc định OFF và chỉ hiện khi CLOSED AvgROE>4%. JSON controls/state cũ được đọc cộng dồn; catalog seed hai route mới OFF nhưng cả hai đã được bật explicit theo yêu cầu 2026-09-16, state Binance mới additive, event thiếu field fail-closed và không backfill.

### 2026-09-15 — MANUAL SHORT SL30 cho entry mới

- Versions: `MANUAL_SHORT_NEW_FILL_SL30_V1_20260915` và DCA-race reconciliation `MANUAL_SHORT_SL30_PENDING_DCA_FIX_V1_20260915`; thay thế policy SL50 cho SHORT thủ công mới, không thêm label/card/WHITELIST.
- Input causal trước protection là cutoff cố định `2026-09-15T03:55:29.563Z`, verified Binance full-fill/order create time, source manual exact, side/type/flags, quantity/average fill và live position entry/leverage. Bot client/lifecycle, order cũ, replay, position không khớp hoặc dữ liệu thiếu đều fail-closed.
- Phân loại đủ điều kiện đặt SHORT `STOP_MARKET` tại `entry × (1 + 0,30/leverage)`, tức −30% ROE (5x: +6% giá; 10x: +3% giá). TP/size/leverage không đổi. Race SELL bổ sung chỉ được reconcile bằng lịch sử toàn SELL chưa realized PnL và vẫn neo SL vào full-fill mở đầu.
- Chỉ tác động lệnh thủ công tạo và full-fill sau cutoff; không sửa/hủy/backfill position, TP/SL, order cũ hoặc DCA đang có. Existing SL được giữ; xác minh position trước submit và open SL sau submit. Audit/PnL dùng cơ chế fill/close hiện hữu, không thay cách tính.
- JSON giữ field legacy `manualShortSl50` để đọc state cũ, nhưng matcher chỉ nhận version SL30; policy SL50 cũ bị loại. Tests mock-only bao phủ 1x–125x, cutoff/source/bot/old-order guards, DCA race, existing SL và production `setTpSl` path.

### 2026-09-14 — HTF SHORT large-rebound gate

- Versions: detector `HTF_DEEP_DUMP_BASE_RECLAIM_LONG_SHORT_V4_SHORT_LARGE_REBOUND_20260914`, universe V4, Liquid Flow V30, Discord V4 và executor `HTF_DEEP_BASE_RETEST_LONG_SHORT_MARKET_5USDT_5X_V3_SHORT_LARGE_REBOUND_20260914`. Chỉ sửa `RETEST_SHORT_READY`; LONG giữ nguyên.
- Closed/causal sequence bắt buộc: 1h/4h pump + top base -> 15m breakdown EARLY -> low -> bullish rebound -> peak quay lại neckline/EMA13 -> closed 15m hoặc closed 5m bearish reject. Chỉ tính rebound bắt đầu từ EARLY trở đi; nhịp hồi trước EARLY bị bỏ. Nhịp hồi phải `>=1,5%` và `>=1,25 ATR15m`; đoạn giảm lại phải `>=1%` và `>=0,75 ATR15m`; lookback 12 nến 15m, reach tolerance `0,5%`. Thiếu metric hoặc không đúng thứ tự chỉ WATCH và cả Discord READY/Binance fail-closed.
- Audit bốn fill thật hiện có: 2 closed WIN (BSB, MTL), 1 closed LOSS (TNSR), 1 OPEN (ZRX); mẫu quá nhỏ để kết luận hiệu suất. Replay đúng thời điểm với V4 giữ BSB READY, chuyển MTL/ZRX/TNSR thành EARLY WATCH. Đây là diagnostic cấu trúc, không dùng outcome làm input và không phải backtest tối ưu.
- Binance cho entry SHORT tương lai vẫn theo exact route hiện hữu, `5 USDT x5`, TP `+15% ROE`, SL `-30% ROE`, freshness/drift/cooldown/dedupe/no-position/no-order không đổi. Không đổi master/route setting, không DCA, không sửa position ZRX hay protection đang mở. Discord READY thêm low/peak/rebound/fade; audit reason ghi cùng số đo.
- JSON chỉ thêm optional rebound/fade fields; legacy đọc được nhưng SHORT READY thiếu field không được execute. Không label/card/WHITELIST mới; cách tính audit/PnL và điều kiện WHITELIST CLOSED AvgROE>4% không đổi; không migrate/backfill/replay/rewrite dữ liệu cũ.

### 2026-09-13 — HTF deep base FAST RETEST 5m, nguồn 1h/4h

- Versions: detector `HTF_DEEP_DUMP_BASE_RECLAIM_LONG_SHORT_V3_FAST_5M_1H_4H_20260913`, universe `HTF_DEEP_BASE_LONG_SHORT_UNIVERSE_V3_FAST_5M_20260913`, Liquid Flow `LIQUID_HEATMAP_FLOW_V2_HTF_DEEP_BASE_FAST_5M_V29_20260913`, Discord `HTF_DEEP_DUMP_BASE_15M_LONG_SHORT_BINANCE_V3_FAST_5M_20260913`, executor `HTF_DEEP_BASE_RETEST_LONG_SHORT_MARKET_5USDT_5X_V2_FAST_5M_20260913`.
- Dữ liệu trước entry: shock/nền từ closed 1h hoặc closed 4h, EARLY từ closed 15m reclaim/breakdown neckline+EMA13 trên volume, rồi tối đa ba closed 5m kế tiếp. FAST READY yêu cầu chạm vùng với tolerance0,3%, giữ trong 0,25ATR15m, không vô hiệu nền và đóng đúng hướng. Nến live/gap/stale bị bỏ; 5m chỉ tái dùng cache WebSocket/Market Breadth, không warm-up REST riêng; thiếu 5m chỉ tắt FAST, không tắt READY 15m fallback.
- Giữ exact labels/routes `RETEST_LONG_READY/LONG` và `RETEST_SHORT_READY/SHORT`; FAST thêm confirmationInterval=5m, Discord ghi `1h|4h` và `5M FAST RETEST`. EARLY vẫn OBSERVE ONLY. Audit/PnL giữ exact label và thêm khung vào combo để hậu kiểm; không tạo label/card/WHITELIST mới, policy default OFF + CLOSED AvgROE>4% giữ nguyên.
- Binance chỉ entry mới khi route hiện hữu đã ON: MARKET5USDT×5, TP+15%ROE, SL−30%ROE, tuổi<=90s, drift<=0,5%, cooldown/dedupe/no-position/no-order giữ nguyên. FAST và 15m dùng chung episode key nên không vào hai lần; không đổi setting, DCA hay lệnh/TP/SL đang mở.
- JSON additive với confirmationInterval/fastConfirmation/retestBars5mAfterEarly/bars.m5; thiếu field được hiểu là 15m cũ. Không migrate/backfill/replay/rewrite. Tests fixture cả nguồn1h/4h và hai side, optional 5m fallback, notifier/executor mock-only.

### 2026-09-13 — COIN_HORIZON_SWEEP_TRANSITION_LONG_SHORT_MARKET_V1_20260913

- Thay mục draft bằng hai route Binance thật độc lập, đều mặc định OFF:
  `UPPER/LONG` và `LOWER/SHORT`, source `coin-horizon-sweep-transition`, stream
  `coin-horizon-4h8h12h`. UPPER chỉ từ NEUTRAL/LOWER; LOWER chỉ từ NEUTRAL/UPPER;
  bắt buộc đủ4h/8h/12h cùng hướng. Không tạo semantic label/card mới.
- Input causal: analysis<=90s sau enabledAt, close1h/4h và CoinGlass<=20phút theo
  horizon V1. Bật/restart/gap>20phút chỉ ghi baseline; không replay timestamp cũ.
  Trước submit recheck route+master, runtime, mark drift<=0,5%, position/open order,
  cooldown symbol4h và durable SUBMITTING dedupe.
- Mỗi lệnh mới 5USDT margin×5=25USDT. LONG TP ở bandLow active gần nhất phía trên;
  SHORT TP ở bandHigh active gần nhất phía dưới; range24h/12h/48h,
  FRESH/APPROACHING/UNTRACKED, attraction>0, R:R>=1. Không có target hoặc R:R thấp
  thì bỏ. SL−25%ROE cả hai chiều; TP/SL re-anchor theo full-fill, không sửa lệnh cũ.
- Discord V2 ghi rõ kết quả gửi/không gửi Binance. Audit controls thống kê fill thật,
  đóng/mở và realized PnL theo route, không DCA. Không thêm WHITELIST performance;
  default-OFF và CLOSED AvgROE>4% của card cũ giữ nguyên.
- JSON additive: hai route default OFF và state `coin-horizon-sweep-binance.json`;
  master/routes/fills/CSV cũ không migrate hoặc backfill. Legacy horizonSweepDraft bị
  bỏ qua. Tests mock-only bao phủ LONG/SHORT, UI checkbox độc lập, private policy auth,
  TP/SL, stale/drift/target gate, restart/no-replay/dedupe/corrupt-state.

### 2026-09-13 — Giảm nhiễu Market Shock Guard / EMA99 hội tụ (V2)

- Versions: `MARKET_BREADTH_SHOCK_5M_V2_20260913`,
  `EMA99_MARKET_BREADTH_15M_V2_20260913`, `BREADTH_ALERT_STABILITY_V2_20260913`.
  Trước alert chỉ dùng cache Binance causal: tick từng coin <=45s, OHLC/flow 5m,
  chuỗi 15m đóng liên tục cho EMA99. Đồng bộ EMA sang last-price 5m, không dùng
  mark snapshot REST cũ. Coverage không đếm coin thiếu giá/nến hợp lệ.
- Phân loại cơ bản V1 giữ nguyên; thêm xác nhận cùng hướng/severity 60s Shock/90s EMA,
  >=2 timestamp khác nhau, reset nếu gap >60s/mất điều kiện/stale/future. Đổi hướng
  gần đây cần 180s. Riêng Shock score>=95, strong>=20%, dominance>=80%, taker theo
  hướng>=60%, volume>=10% được phát khẩn sau **30s liên tục**, không phát ngay.
- Thêm mô tả bối cảnh 15/30m từ close không sau mốc lookback (lệch tối đa5m), >=60
  coin hoặc minSamples cấu hình và >=60% coverage trong mẫu; cùng chiều khi >=60%
  mẫu + median vượt ngưỡng +/-0,10%. Ngược nhịp dài ghi hồi/giảm ngắn, khác/thiếu
  khung ghi chưa đồng thuận/UNKNOWN. Các ngưỡng là lọc nhiễu, chưa được backtest.
- EMA hội tụ không phải bơm/xả: vàng tiếp cận kháng cự, xanh lam test hỗ trợ, bỏ chữ
  DANGER trên Discord (giữ enum/key nội bộ). Thêm denominator của nhóm và thị trường,
  thời gian xác nhận/lần đổi hướng. Chặn thông báo WATCH hạ cấp sau DANGER cùng phía;
  dedupe từng hướng/severity giữ cooldown, nhưng cho đổi hướng đã xác nhận đi qua.
- Thống kê chỉ là aggregate count/median/score/coverage + tối đa100 delivery audit;
  không tạo nhãn giao dịch/card/WHITELIST/cohort/PnL/AvgROE. Matcher/default OFF/policy
  CLOSED AvgROE>4% giữ nguyên. **OBSERVE ONLY, không ảnh hưởng Binance/entry/size/
  leverage/SL/TP/position**, không sửa EMA99 entry đơn coin hoặc Limit Paper Lab.
- JSON tương thích additive: đọc alerts timestamps V1 để giữ cooldown/hướng sau
  restart, optional context/persistence/lastAlert/recentAlerts/priceSource cho V2.
  Không replay payload V1, backfill lịch sử hay rewrite controls/trades/CSV. Failed
  Discord không ghi thành công. Test ba bộ breadth dùng mock, không gửi webhook thật.

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

- Thêm detector `EXTREME_SHORT_SQUEEZE_PEAK_ZONE_5M_SHORT_V4_20260911` và exact label `PEAK_ZONE_SHORT_WATCH`: sau khi nến đang chạy đạt spike gốc `>=8%`, `>=4 ATR`, volume `>=3x`, quote volume `>=100k` và breakout `>=1%`, giá phải trả lại `15–25%`, còn cách rolling high `<=2%`, râu trên `>=20%` và high đứng yên `>=15s`. Higher high reset timer; tick quá 30 giây hoặc nến đã đóng không được dùng cho route này.
- Input hoàn toàn causal từ 20 nến trước, ATR14/volume20 và websocket OHLC hiện tại. 5m phát Discord màu cam và có thể đi Binance; 15m chỉ OBSERVE ONLY. Event cũ/cây bắt đầu trước enabledAt, mark lệch `>0,5%`, position/order trùng, cooldown hoặc payload sai `$2×5` đều fail-closed.
- Binance chỉ lệnh mới: SHORT MARKET `$2 margin ×5`, notional `$10`, TP `+15% ROE`, SL `−30% ROE` từ average full-fill. Không tác động vị thế/lệnh hiện tại và không backfill CATI vừa qua. Fill/close audit/CSV tách exact label để thống kê sau; hiện chưa có CLOSED sample nên không có kết luận hiệu suất.
- JSON cũ tương thích: route mới được seed OFF rồi bật theo yêu cầu, key/state mới additive, không migrate/replay. Rolling-high state chỉ ở RAM. Không tạo card thống kê/WHITELIST mới; nếu tạo về sau phải mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%`.

### 2026-09-11 — EMA99_TWO_SHORT_ROUTES_10X_V1_20260911

- Runtime `EMA99_ROUTE_LEVERAGE_OVERRIDES_V4_20260911`: 5m SHORT `NEAR_EMA_WATCH` và 15m SHORT `CLOSED_ABOVE_EMA_WATCH` dùng `10x` cho lệnh mới; exact label giống nhau ở timeframe kia và toàn bộ EMA99 còn lại vẫn `5x`.
- Input/phân loại trước entry không đổi: exact source/stream/label/side/timeframe, nến đóng, freshness/enabledAt, mark, open position/order và cooldown. Fill/close audit tiếp tục thống kê theo loại tín hiệu và timeframe, không đổi W/L/PF/AvgROE/Net PnL; không có nhãn/card/WHITELIST mới.
- Binance: margin hai route giữ `$5`, notional thành `$50`; TP vẫn `+15% ROE` (`SHORT fill ×0,985` ở 10x) và SL vẫn `−30% ROE` (`fill ×1,03`). Chỉ entry sau reload; không sửa SKR/SYN hay lệnh/vị thế hiện tại. Guard fail-closed nếu payload còn 5x hoặc notional không khớp.
- JSON cũ tương thích vì key/schema không đổi và leverage được dẫn xuất runtime; không migrate/backfill/replay. UI hiển thị leverage/notional do API trả về.

### 2026-09-11 — SHORT thử nghiệm spike closed và trả nhịp bơm live 5m

- Executor nâng thành `EXTREME_PUMP_AND_LIVE_FOLLOW_5M_SHORT_1USDT_5X_V2_20260911`, detector `EXTREME_SHORT_SQUEEZE_CLOSED_AND_LIVE_FOLLOW_5M_SHORT_V3_20260911`. Exact nhánh có quyền Binance là `5m + EXTREME_PUMP_CLOSED + closed` và `5m + FOLLOW_REJECTION_LIVE + live` khi 1–3 nến sau spike trả lại `>=50%` nhịp bơm mà chưa tạo higher high. 15m, spike LIVE, follow closed, rút râu và quét hai đầu tiếp tục OBSERVE ONLY.
- Trước entry dùng dữ liệu causal của spike/follow và enabledAt riêng từng route: closed candle phải đóng sau enabledAt; live-follow candle phải bắt đầu sau enabledAt, event `<=90s`, websocket tick `<=30s` và nến chưa đóng. Mark mới phải lệch giá đánh giá tối đa `0,5%`. Cảnh báo/cây live đã bắt đầu trước rollout không được short muộn, không backfill/replay.
- Binance chỉ đi qua route controls exact và capability policy V20; closed route ON từ `2026-09-11T08:16:03.471Z`, live-follow route ON từ `2026-09-11T08:32:50.728Z`, master ON. SHORT MARKET `$1 margin ×5`, notional `$5`, chặn position/order cùng symbol, cooldown chung 4h và durable pre-submit dedupe. TP `+15% ROE`, SL `−30% ROE` neo average full-fill; chỉ lệnh mới, không đụng vị thế/order cũ.
- Audit fill/close và CSV hiện hữu ghi exact source/label/reason/combo để tách thống kê closed-spike với live-follow. Chưa có mẫu đóng trước rollout; cả hai stage đã có trong detector nên không thêm label/card/WHITELIST mới. Policy mặc định OFF, chỉ hiện khi CLOSED AvgROE `>4%` giữ nguyên. JSON controls/state cũ không migrate; thiếu field mới fail-closed cho entry.

### 2026-09-11 — Nâng size năm route EMA99 tốt lên $5

- Ghi nhận `EMA99_SELECTED_GOOD_ROUTES_MARGIN_5_V1_20260911` trên version controls `AUTO_ENTRY_CONTROLS_V3_EMA99_PUMP_LEG_20260910`: 5m LONG `TOUCH_EMA_LONG_WATCH`, 5m SHORT `NEAR_EMA_WATCH`, 15m LONG `RECLAIM_LONG_WATCH`, 15m SHORT `CLOSED_ABOVE_EMA_WATCH` và 15m SHORT `REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH` được đổi margin thành `$5`. Không bật thêm route và không đổi size route khác.
- Input causal, detector, phân loại, nhãn/tier và matcher exact source/stream/label/side/interval giữ nguyên. Nhóm được chọn từ audit fill thật gộp theo `close_group_id`, loại manual/open và loại DCA trong cohort đánh giá chất lượng; cách tính W/L, PF, AvgROE và Net PnL không đổi.
- Chỉ entry Binance mới nhận margin `$5` với leverage `5x` (notional dự kiến `$25`). Không đụng position/order hiện tại; MARKET, TP EMA99 `+15% ROE`, SL LONG `−20%`/SHORT `−30%`, cooldown, no-DCA và master switch giữ nguyên.
- JSON cũ tương thích vì chỉ đổi `marginUsdt` hiện hữu, không đổi schema/key hoặc migrate/backfill/replay. Không thêm label/card/WHITELIST; policy mặc định OFF và CLOSED AvgROE `>4%` giữ nguyên.

### 2026-09-11 — Route EMA99 5m theo WR >70%

- Giữ version `AUTO_ENTRY_CONTROLS_V3_EMA99_PUMP_LEG_20260910`; áp snapshot `EMA99_5M_WINRATE70_SNAPSHOT_SELECTION_20260911` từ các position đóng theo rule TP `+15%`, loại lệnh tay/DCA/open. Chỉ bật 5m SHORT `NEAR_EMA_WATCH` (`2/2`) và 5m LONG `TOUCH_EMA_LONG_WATCH` (`4/5`); các route catalog 5m còn lại OFF. Đây chưa phải auto-scheduler tái tính theo ngày.
- Thống kê gộp theo `close_group_id`; alias cũ `NEAR_REJECT_SHORT_WATCH` được gộp với route hiện hành `REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH`, đạt `2/3=66,7%` nên không qua điều kiện nghiêm ngặt `>70%`. Không có mẫu cũng OFF. Input causal, detector, nhãn/tier và matcher source/stream/label/side/interval không đổi.
- Gate Binance chỉ đổi cho entry mới sau `2026-09-11T03:57:27.070Z`; master và route 15m giữ nguyên. Không chạm lệnh hiện tại, size, leverage `5x`, TP `+15%`, SL LONG `−20%`/SHORT `−30%`. JSON cũ tương thích vì chỉ đổi boolean/enabledAt; route legacy ngoài catalog giữ OFF, không migrate/backfill/replay.
- Không thêm nhãn/card hay WHITELIST; policy mặc định OFF và CLOSED AvgROE `>4%` giữ nguyên.

### 2026-09-11 — Chọn route EMA99 theo hiệu suất Binance thật

- Giữ version `AUTO_ENTRY_CONTROLS_V3_EMA99_PUMP_LEG_20260910`; dựa trên 190 vị thế EMA99 đã đóng, gộp DCA theo vị thế và dùng thêm cohort TP `+15%` không DCA. Bật ba route 15m: `CLOSED_ABOVE_EMA_WATCH/SHORT`, `RECLAIM_LONG_WATCH/LONG`, `REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH/SHORT`. Tắt hai route LONG 15m `NEAR_EMA_LONG_WATCH`, `NEAR_RECLAIM_LONG_WATCH` và hai route 5m `CLOSED_BELOW_EMA_LONG_WAIT/LONG`, `CLOSED_ABOVE_EMA_WATCH/SHORT`; không đổi route khác.
- Input causal, detector, nhãn/tier và cách phân loại giữ nguyên; exact source/stream/label/side/interval vẫn là matcher runtime. Thống kê W/L/PF/PnL không đổi schema; 18 position đang mở bị loại khỏi kết quả đóng, còn DCA chỉ bị loại trong cohort so sánh chất lượng.
- Đây là thay đổi gate Binance cho entry mới sau `2026-09-11T03:55:01.032Z`; không chạm lệnh hiện tại, size, leverage `5x`, TP `+15% ROE`, SL LONG `−20%`/SHORT `−30%` hoặc master switch. JSON controls cũ vẫn tương thích vì chỉ cập nhật boolean route/enabledAt, không migrate/backfill/replay.
- Không thêm nhãn/card hay WHITELIST; policy checkbox mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%` giữ nguyên.

### 2026-09-11 — EMA99 Discord tách kênh 15m

- Thêm `EMA99_DISCORD_TIMEFRAME_SPLIT_V1_20260911`: event EMA99 `15m` gửi webhook riêng, event `5m` giữ webhook cũ; route đọc exact `event.interval`, còn timeframe thiếu/khác bị fail-closed. Dữ liệu causal trước entry, detector, stage/side, nhãn/tier và điều kiện tín hiệu đều không đổi.
- Thống kê W/L, PF, AvgROE, Net PnL, snapshot và fill/close CSV không đổi. Không thêm card/nhãn hay WHITELIST; policy route mặc định OFF và chỉ hiện khi CLOSED AvgROE `>4%` giữ nguyên.
- Binance vẫn chạy trước Discord theo đúng route Auto Controls 5m/15m; không đổi quyền entry, MARKET, size, leverage, TP EMA99 `+15% ROE`, SL LONG `−20%`/SHORT `−30%`, không sửa lệnh hiện tại.
- JSON cũ tương thích: dedupe 5m giữ file cũ, 15m dùng `data/post-pump-ema99-15m-discord.json`; không migrate/backfill/replay. Test mock xác nhận 5m/15m không đi chéo kênh và scheduler chạy khi ít nhất một webhook được cấu hình.

### 2026-09-10 - EMA99 quét partial cache sau restart

- Thêm `EMA99_PARTIAL_CACHE_SCAN_V1_READY_PAIRS_20260910`: scanner EMA99 SHORT/LONG mỗi phút quét các cặp Top 400 đã có `>=165` nến cache 5m hoặc 15m, không còn bị khóa tới khi warm-up toàn cục đủ 400 coin. Zero-pair chỉ ghi coverage và chờ; scanner không tự seed REST.
- Input causal và phân loại giữ nguyên: detector vẫn fail-closed với chuỗi thiếu/khuyết/cũ, chỉ event đúng stage/freshness mới đi tiếp. Log thêm `coverage`; không đổi nhãn/tier/card, paper, W/L/PF/AvgROE/Net PnL hoặc snapshot thống kê.
- Binance chỉ có thể nhận tín hiệu hợp lệ sớm hơn sau restart; không đổi quyền route, size/margin, leverage, MARKET gate, TP `+15% ROE`, SL LONG `−20%`/SHORT `−30%`, và không chạm lệnh hiện tại. Không có nhãn/card mới nên không thêm WHITELIST; policy mặc định OFF và CLOSED AvgROE `>4%` giữ nguyên.
- JSON cũ hoàn toàn tương thích vì không đổi schema hay migrate/backfill/replay; coverage chỉ nằm trong log runtime. Test bảo vệ partial-ready và cấm tái gắn scanner vào global `klineWarmupReady()`.

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

- Theo yêu cầu: riêng NEAR_REJECT_SHORT_WATCH cam5m/15m vào SHORT MARKET5 USDT margin ×5x; các auto route khác OFF, LONG/NEAR_EMA_WATCH vẫn observe. Default route OFF rồi kích hoạt riêng có enabledAt; master ON không bật các route còn lại. Input causal detectorV3 đúng closed/near/version, close sau activation và tuổi<=90s, mark lệch reference<=0.5%, TP<mark<SL và không vị thế/entry chờ trên coin. Không replay TAC/tin lịch sử, không DCA.
- TP/SL theo detector (TPđáy12, SLhigh+.25ATR), ngoại lệ exact source giữ SL/TP khỏi bot-short TP-only/ROE6. Không thay policy nguồn khác; bảo vệ sau full-fill giữ nguyên. Explicit auto auth chỉ SELL/MARKET25notional5leverage/label/source đúng, không dựa vào text. Persist claim trước submit + clientOrderId hash + symbol4h crossTF, ambiguous result không lặp; control recheck trước entry.
- Discord optional execution outcome ghi đúng route/status; fill/close audit+CSV hiện hữu nhận label/reason/source. Không tạo stat/card/WHITELIST mới hoặc đổi W/L/PF/AvgROE; route mới thực sự vào Binance, không mô tả là observe-only. JSON additive attempts + enabledAt (thiếu fail-closed), detector cũ không backfill/migrate, không gửi cũ. Mock tests stage/age/activation/chase/levels/auth/protection/dedupe/position/orders và regression SHORT/controls; không live order test.

### 2026-09-07 — AUTO_ENTRY_CONTROLS_V1_20260907

- Tạm khóa tất cả tự mở Binance theo yêu cầu; trang `/binance-auto-controls` quản lý master + source/stream/label/side exact, default OFF. Catalog bootstrap audit JSON + runtime requests, bảo toàn trade/history; thiếu/corrupt file fail-closed. Không thêm execution cho EMA99 Discord. Input trước entry là metadata payload, token manual xác thực và control persist mới nhất, không outcome/tín hiệu tương lai.
- Gate đầu placeOrder và sát client futures/algo; IOC fallback được kiểm tra lại. Đường auto trực tiếp cũng được kiểm tra; unknown khóa. Bật trang này chỉ là quyền bổ sung, rule/whitelist/AvgROE và công tắc cũ còn nguyên. Authenticated manual và reduceOnly/closePosition/hedge-closing vẫn đi qua. CoinGlass Qualified chặn trước signal reversal. Không thay entry/size/leverage/SL/TP/classification, không tắt quản lý vị thế. Không hủy LIMIT/algo entry cũ hay request đã gửi; các lệnh ấy có thể khớp.
- API POST token+Origin, emergency OFF local không cần auth; GET/page không lộ credentials. Persist atomic JSON mới, route mới OFF, restart giữ trạng thái, không migrate/backfill JSON cũ. Không thêm stat/card/WHITELIST; W/L/PF/AvgROE/PnL và policy checkbox closed AvgROE>4% không đổi. Tests mock per-route/master/default/corrupt/restart, protection/manual/legacy/old policy; không test real order. Chi tiết `docs/BINANCE_AUTO_ENTRY_CONTROLS.md`; bàn giao OFF toàn bộ.

### 2026-09-07 — EMA99_LONG_DISCORD_BLUE_GREEN_V1_20260907

- Phân biệt Discord LONG: 🔵 xanh dương #3B82F6 cho WATCH/WAIT (gồm near/reclaim), 🟢 xanh lá #10B981 khi xác nhận bật; prefix LONG mọi tiêu đề. SHORT không đổi. Style footer version riêng, event version và dedupe giữ nguyên nên không phát lại/sửa tin đã gửi.
- Input trước entry, phân loại và ngưỡng detector LONG V1 không đổi. Chỉ OBSERVE ONLY presentation, không ảnh hưởng Binance/entry/size/SL/TP/paper, W/L/PF/AvgROE/PnL; không thêm card/nhãn thống kê/WHITELIST. JSON/state tương thích cũ không migrate/backfill. Tests palette/prefix mọi stage và regression SHORT/LONG.

### 2026-09-07 — EMA99_PULLBACK_LONG_OBSERVE_V1_20260907

- Thêm detector LONG độc lập và cùng Discord EMA99. Dữ liệu trước entry: chỉ cache nến5m/15m đóng cho bối cảnh, SMA-seeded EMA99/ATR14/MA20; nến đang chạy chỉ WATCH. Đáy12–96 nến trước -> đoạn tăng>=12 nến, mean6 cuối/đầu>=+0.5%, đáy->đỉnh>=8%, trước kiểm tra còn>=5% trên đáy. Đỉnh gần trong13 nến, điều chỉnh tối đa12, kiểm tra biên tránh lấy đỉnh quá cũ. EMA99>=+0.3%/12 bước, >=80% bước tăng,6/8close trênEMA, open trênEMA. Không dùng outcome hoặc CoinGlass.
- Dip>=max1%open/0.8ATR, vol>=1.5MA20; near trên EMA<=clamp0.75ATR%,0.3–1.5%; xuyên dưới<=max3%/1.5ATR%. Stage near/touch LONG WATCH, râu dưới>=25% và đóng trênEMA thành reclaim WATCH; đóng dưới thành WAIT. Sau reclaim, tối đa3nến đóng kế tiếp: xanh vượt high hoặc retestEMA±.25ATR giữ được và close cao hơn nến kiểm tra => BOUNCE_CONFIRMED_LONG_WATCH. Đóng mấtEMA/thủng low-.25ATR hủy chuỗi; chỉ xác nhận đầu tiên mới, không đổi cảnh báo cũ thành hiện tại.
- Scheduler hiện hữu top400/60s/cache-only dùng chung queue/backoff/webhook, log LONG riêng, dedupe `EMA99_LONG|symbol|interval|candle|stage` tránh trùng SHORT và cho nâng stage. Nội dung lý do/giá/vô hiệu/kháng cự/timeframe/giờVN, cảnh báo near chưa chạm và OBSERVE ONLY. JSON LONG/version mới additive, state cũ và key SHORT giữ nguyên, không migrate/backfill/phát lại lịch sử. Không stat/card/WHITELIST giao dịch mới, không đổi W/L/PF/AvgROE/PnL; không Binance/entry/size/SL/TP/executor/paper. Các ngưỡng chưa backtest edge.
- Test mock cả5m/15m gần/chạm/rút râu/live, thiếu volume/quá xa/EMA giảm/nến lỗi/cũ/tương lai, điều chỉnh nhiều nến và đỉnh cũ, break high/retest/invalidation, tuổi xác nhận, gửi nâng stage và restart không lặp; chạy regression SHORT và notifier liên quan. Không gửi tín hiệu giả hoặc đặt lệnh để test.

### 2026-09-07 — POST_PUMP_EMA99_RETEST_OBSERVE_V3_PRE_REBOUND_FADE_20260907

- Sửa bỏ sót nhịp hồi nhiều nến/gần EMA99: dùng lịch sử đóng trước ứng viên; fade đo 6 close đầu so 6 close cuối đoạn sau peak đến đáy gần nhất, >=12 nến và giảm>=0.5%. Đáy chọn lowest close trong 13 nến gần, tối đa 12 nến hồi, tie mới nhất, bỏ đáy ở biên đang tăng từ close trước thấp hơn. Không dùng dữ liệu tương lai. Pump/drop/slope/belowEMA/volume/spike/gap và freshness V2 không đổi. Cho phép nền sau giảm; không nới thành mọi lần gần EMA đều báo.
- Discord cùng webhook, stage/dedupe không đổi; bổ sung mô tả riêng fade trước hồi và %/số nến hồi. JSON V3 fadePct đổi sang đoạn sau peak, recentFadePct giữ số 6vs6 sát spike, thêm reboundBars/reboundPct/fadeStartAt/fadeEndAt; renderer fallback field cũ, dedupe state giữ nguyên, không migration/backfill/phát lại lịch sử.
- OBSERVE ONLY, không ảnh hưởng Binance/entry/size/SL/TP/executor/paper. Không nhãn/card thống kê hoặc WHITELIST mới, không đổi W/L/PF/AvgROE/PnL. Tests mock 5m/15m cả case hồi/nền, không fade, đáy cũ, near/far/volume/stale/gap/future, restart dedupe. Replay MARSCOIN 15m 06:45/07:15 VN đạt, 07:00 thiếu spike vẫn loại; chỉ replay phân loại nến đóng, chưa backtest hiệu quả hay xác suất và không gửi tin lịch sử.

### 2026-09-06 — POST_PUMP_EMA99_RETEST_OBSERVE_V2_NEAR_MISS_20260906

- Mở rộng spike còn hụt EMA99: gap>0.15% và<=clamp(0.75ATR14/EMA99%,0.3,1.5), cả5m/15m. Input trước entry giữ V1 pump/fade/slope/volume/spike và cache/freshness; không thay các gate khác. Near live/watch -> NEAR_EMA_WATCH; closed dưới EMA+râu>=25% -> NEAR_REJECT_SHORT_WATCH. Cam ghi gap%/ATR và nhấn mạnh chưa chạm EMA, không kết luận reject trực tiếp.
- OBSERVE ONLY, không nhãn/stat/WHITELIST giao dịch, không đổi W/L/PF/AvgROE/PnL/Binance entry/size/SL/TP/executor. Cùng webhook và schedulerV1, dedupe cùng candle/stage qua restart nhưng cho phép nâng near->touch->reject. Event JSON thêm field optional, state cũ vẫn đọc không backfill/replay/migrate. Tests5m/15m near/live/reject/quá xa/volume/nângstage, ngưỡng chưa backtest hiệu quả.

### 2026-09-06 — POST_PUMP_EMA99_RETEST_OBSERVE_V1_20260906

- Thêm luồng Discord top400 cache-only5m/15m mỗi60s, warmup+inflight guard. Input causal prior pump>=8%,peak cách8–96bars,drop>=5%,fade6vs6close<=-0.5%,EMA99 dốc<=-0.3%/12steps với>=80%steps giảm,6/8close dướiEMA. EMA/ATR/volume dùng lịch sử trước spike; EMA tại spike cập nhật bằng giá candle hiện có.
- Spike bật>=max1%open/0.8ATR và vol>=1.5x20bars,high chạm EMA99±tolerance0.15% và vượt<=max3%/1.5ATR. TOUCH_WATCH/live, CLOSED_ABOVE_EMA_WATCH/close trênEMA, REJECTED_SHORT_WATCH/close dưới+râu>=25%. Chỉ latest2bars, stale/gap/thiếu bỏ qua. Tin có lý do/mức tham khảo/timeframe/link, chưa MARKET và chưa backtest lợi thế.
- Dedupe riêng symbol/timeframe/candle/stage bền qua restart, state additive+secret.env. Không migrate/backfill/replay JSON/trade cũ. Không nạp nến REST/cào CG thêm, không cần mở page; snapshot chia sẻ hiện hữu. OBSERVE ONLY không stat/WHITELIST mới, W/L/PF/AvgROE/PnL/Binance entry/size/SL/TP/paper/PPKS executor cũ giữ nguyên. Tests các case closed/live/reject/accepted/false positive và dedupe bằng mock.

### 2026-09-06 — LIQ_SCAN_TWO_TIER_OBSERVE_V1_20260906

- Thêm hai mức Discord/page LiqScan: WATCH>=40, MARKET_READY>=70 kèm CoinGlass/trend/nến15m cùng hướng,5m retest sau15m±0.25ATR,taker>=55%,không đuổi0.5ATR và RR>=1.2. Input causal current<=90s, context đóng5m/15m,ATR/plan/CG sẵn có; không dùng alert lịch sử. Ngưỡng thử chưa backtest, không dùng OI.
- MARKET_READY là tên cảnh báo OBSERVE ONLY không tự market Binance; entry/size/SL/TP/gate/executor không đổi. Không tạo stat/WHITELIST card hoặc W/L/PF/AvgROE/PnL. Chạy theo coin phân tích trên page, webhook chung horizon; vàng theo dõi/xanh LONG/đỏ SHORT ready, checklist và levels.
- Dedupe state riêng symbol+tier để nâng cấp gửi ngay, cùng tier+side4h/đổi chiều tối thiểu15m; thành công mới persist. JSON alertTier optional, score alias legacy fallback, thiếu data không READY; không migrate/backfill trade. Tests threshold/two sides/stale/conflict/sequence/flow/RR/tier escalation.

### 2026-09-06 — COIN_HORIZON_DIRECTION_DISCORD_V1_20260906

- Nối webhook riêng cho khối kịch bản4h/8h/12h theo các coin được phân tích trên page. Input causal trước entry giữ horizonV1: mark, ATR/state nến1h/4h đóng và CoinGlass mới. UPPER->LONG, LOWER->SHORT; available/fresh và không MIXED/CONFLICT/WAIT_DATA. Thiếu CG có direction vẫn gửi với ghi chú đồng thuận thấp. Không thêm scan nền.
- Gộp3khung một tin màu xanh/đỏ, giờVN, cận/zone/điều kiện phá biên/link. Dedupe symbol cùng chiều4h, đổi chiều tối thiểu15m mỗi side, persist atomic chỉ sau HTTPok; serial queue + timeout/backoff chống spam và lỗi mạng. State mới độc lập, không rewrite/replay JSON/trade cũ, thiếu dữ liệu không gửi.
- Cảnh báo OBSERVE ONLY không nhãn/card/stat/WHITELIST mới; W/L/PF/AvgROE/PnL/Binance entry/size/SL/TP/gate/executor không đổi. Test mock hai chiều, conflict/stale, concurrency, restart dedupe và429; webhook secret trong.env.

### 2026-09-06 — COIN_HORIZON_SCENARIOS_OBSERVE_V1_20260906

- Thêm vùng phân tích tương lai4h/8h/12h, biên ATR đối xứng quanh mark: max(ATR14_1h√H,ATR14_4h√(H/4)); clamp lower1%mark có cảnh báo. Input trước entry chỉ nến1h/4h đóng, zones cấu trúc, CoinGlass edge mới<=20m; không request thêm. Đối chiếu vùng1h/4h và thanh lý chưa swept/rejected bên trong biên, ưu tiên CG24h rồi12h/48h.
- UPPER/LOWER khi1h/4h đồng thuận, MIXED khi khác, CONFLICT khi CG ngược; stale/missing timestamps -> WAIT_DATA. Đồng thuận tối đa PARTIAL; biên chưa kiểm chứng coverage, không phải xác suất. Hiện mốc thời gian/cận/%/điều kiện phá biên1h và retest15m.
- Chỉ panel thông tin OBSERVE ONLY, không stat card/WHITELIST/label giao dịch; không đổi thống kê W/L/PF/AvgROE/PnL, gate/Binance entry/size/SL/TP/Discord. Optional JSON horizonAnalysis và closeTime tương thích cũ qua fallback, không backfill/migrate history. Tests biên, stale, conflict, missing, reject và clipping.

### 2026-09-06 — LIQ_SCAN_SWEEP_REJECT_SHORT_OBSERVE_V1_20260906

- Thêm khối đánh giá SHORT sau quét phía trên ngay dưới LiqScan. Input trước entry: vùng main của latest alert ABOVE cùng coin (<=6h), mark/ATR/supports và nến5m/15m đóng sau alert; không cào thêm. Vùng gốc bất biến trong snapshot; latest alert mới có thể thay event cũ. Bỏ nến chứa alert, không dùng dữ liệu tương lai.
- Phân loại: chờ quét -> quét -> 5m đỏ reject dưới vùng -> nến sau phá đáy/retest fail. Hủy khi15m giữ trên và5m retest thành công hoặc giá vượt peak+0.25ATR. Quan sát confirmed cần nến xác nhận<=15m, giá dưới vùng/cách confirm<=0.5ATR,15m dưới vùng,taker bán quote>=55%,TP gần R:R>=1.2; TP gần chọn mark gốc/support cao nhất dưới giá. Thiếu/gap/stale không confirmed; rule chưa backtest hiệu quả.
- OBSERVE ONLY; không nhãn/card thống kê WHITELIST mới, không đổi W/L/PF/AvgROE/PnL, Binance entry/size/SL/TP/Discord/executor. JSON thêm optional candle context + sweepRejectShort, tương thích field thiếu, không migrate/backfill trade. Tests covers confirmation, causal exclusion, missing/stale, cancel/invalidated, taker, RR, no-chase.

### 2026-09-06 — LIQSCAN_OUTCOME_AUDIT_V1_20260906

- Audit USELESS 08:11:23 VN từ snapshot gốc + Binance public nến1m/aggTrades: mép gần chạm sau32.731s; target0.27128 không đạt trong4h. 22/188 snapshot đủ4h được so first-touch target/rào ngược đối xứng; giữ AMBIGUOUS nếu cùng nến và NEITHER nếu chưa chạm. Latest-only selection bias; nhóm bỏ phút đầu, riêng USELESS kiểm đủ phút đầu.
- Input causal mark/side/target/zone/time trước entry đã frozen; outcome chỉ dùng đánh giá, không tạo label/gate/size/SL/TP mới. Thống kê offline không phải W/L/PnL thật hay card WHITELIST. Binance/entry/size/SL/TP/Discord runtime không đổi; JSON cũ giữ nguyên, output audit riêng không migrate/backfill lệnh. Báo cáo `LIQSCAN_USELESS_AUDIT_20260906.md`.

### 2026-09-06 — LIQ_SCAN_DIRECTION_CONTEXT_V1_20260906

- Trang ưu tiên current <=90s thay lastAlert; historical thu gọn, giờ VN. Điểm lệch /100 thay chữ xác suất; thêm alias imbalanceScore, vẫn đọc sweepProbabilityPct từ JSON cũ.
- Dữ liệu trước entry: proxy15m, mark, trend, confirmation15m, plan và các edge zone/lifecycle CoinGlass sẵn có. Chọn vùng mới <=20m theo 24h ->12h ->48h; gần nhất theo mép band, đúng phía giá, chưa SWEPT/REJECTED/ACCEPTED. So hướng với CoinGlass weighted trial; conflict không chọn target; DIRECTIONAL_WATCH cần proxy pass/cùng hướng/trend/15m/target hợp lệ, ngoài ra WAIT_CONFIRMATION hoặc MISSING_DATA. Retest5m/taker/OI chưa xác nhận nên đồng thuận tối đa PARTIAL.
- Thông tin OBSERVE ONLY, không thêm nhãn/stat card/WHITELIST hay đổi W/L, PF, AvgROE, PnL. Không đổi Binance entry/size/SL/TP, executor/gate hoặc scanner Discord. JSON optional directionAssessment, fallback cho record cũ, không migrate/backfill lịch sử.

### 2026-09-06 — COIN_LEVEL_24H_WEIGHT_TRIAL_V1_20260906

- Thử ưu tiên 24h ×1.4, 48h ×1.1, 12h ×0.75 trên trang coin-level-analysis, so với trọng số đều trên cùng các frame mới <=20 phút. Input causal trước entry: edge zones/attraction/rejection/lifecycle/scrapedAt hiện có; không thêm request collector. Thiếu 24h/cũ hiện cảnh báo; không data trả NO_DATA.
- Phân loại BALANCED khi lệch <15%, còn lại hướng lực lớn hơn; giữ REJECTED reverse-pressure override >=50% raw side với target phía ngược. Đây là giả thuyết thử chưa chứng minh hiệu quả bằng backtest.
- OBSERVE ONLY, không thay recommendation/Discord/runtime signal và Binance entry/size/SL/TP; không thêm thống kê hay nhãn/card WHITELIST, không đổi W/L, PF, AvgROE, PnL. JSON thêm optional coinglass.timeframeTrial, client thiếu field fallback cũ, không rewrite/backfill history.
- LiqScan V1 clarification: current page dùng 240 nến 15m của request phân tích; scanner dùng cache tối đa 500, nên cùng công thức vẫn có thể khác số. lastAlert ghi detection, không xác nhận webhook delivery.

> **Đọc trước:** [CURRENT_DECISION_AND_EMA_RULES.md](CURRENT_DECISION_AND_EMA_RULES.md) là bản tóm tắt logic Decision/Recommended/EMA đang chạy, cập nhật ngày 2026-07-20. File hiện tại giữ lịch sử và bối cảnh chi tiết; nếu nội dung cũ mâu thuẫn, ưu tiên bản current và kiểm tra code.

Last updated: 2026-09-05

Use this file as the first read before changing or evaluating trading logic. It summarizes the current intent, naming, pages, paper stores, and rule decisions from prior work so Codex does not need to rediscover everything from `src/server.js` and old chat history.

## Operating Principles

### 2026-09-05 - Secondary Zone Lifecycle chỉ SHORT `BREAKDOWN_ACCEPTED_SHORT_READY`

- Version Binance `COINGLASS_ZONE_LIFECYCLE_BINANCE_V17_SECONDARY_SHORT_BREAKDOWN_ONLY_20260905`; secondary stream
  `COINGLASS_WEB_SECONDARY_STREAM_V10_SHORT_BREAKDOWN_ONLY_20260905`. Input causal trước entry giữ nguyên: active-edge Model 3, nến đóng,
  lifecycle + next target, mark/slippage, position và open-entry-order; executor nhận thêm `streamId` để áp gate riêng cho top `41–80`.
- Secondary chỉ coi SHORT là executable/notifiable khi exact `signalLabel=BREAKDOWN_ACCEPTED_SHORT_READY`. Generic upper REJECTED SHORT như FLOCK,
  strong-wave REJECTED hoặc label rỗng đều fail-closed bằng `BLOCKED_SECONDARY_SHORT_REQUIRES_BREAKDOWN_ACCEPTED_SHORT_READY`; primary SHORT
  và mọi LONG giữ nguyên. Classification detector không đổi và event cũ không replay.
- Exact breakdown hợp lệ vẫn MARKET `$10 x5`, fixed TP `+6% ROE` đóng 100%, Zone Lifecycle TP-only/no-SL. Chỉ entry/Discord tương lai bị ảnh hưởng;
  không sửa hoặc đóng vị thế hiện tại, không đổi DCA, pending order, size, SL hay TP đã đặt.
- Stats tiếp tục dùng `COINGLASS_ZONE_LIFECYCLE_SHORT`; blocked event không tạo fill/PnL nên không đổi công thức W/L, WR, PF, AvgROE, Net PnL.
  Không thêm label/card/WHITELIST; checkbox hiện hữu vẫn default OFF và chỉ hiện khi CLOSED AvgROE `>4%`.
- JSON tương thích qua các field optional `streamId`, `secondaryShortRuleTextRequired`, `secondaryShortRuleTextMatched`; không migrate/rewrite/backfill
  lifecycle, audit, order hoặc outcome lịch sử và giữ event id `ZLC1`.

### 2026-09-03 - Chặn hai Zone Lifecycle LONG từ 00:00–05:59 Việt Nam

- Version `COINGLASS_ZONE_LIFECYCLE_V16_LONG_00_06_VN_TIME_GATE_20260903`; secondary
  `COINGLASS_WEB_SECONDARY_STREAM_V9_LONG_00_06_VN_TIME_GATE_20260903`. Causal signal inputs/classification giữ nguyên; thêm giờ executor
  `Asia/Ho_Chi_Minh` trước Binance entry.
- Exact `BREAKOUT_ACCEPTED_LONG_READY` và `UNCONFIRMED_BOUNCE_LONG` không vào lệnh ở giờ 00–05, được phép lại từ 06:00. Discord vẫn gửi
  kèm `BLOCKED_LONG_RULE_TIME_WINDOW_00_06_VN`. Support-reclaim và mọi SHORT không chịu gate này.
- Ngoài time gate không đổi size/entry/TP/SL; không sửa position/order hiện hữu. Stats/cohort/PnL formulas và WHITELIST không đổi.
  Các field giờ là optional/additive, JSON cũ và event id `ZLC1` tương thích, không backfill/replay.

### 2026-09-03 - `BREAKDOWN_ACCEPTED_SHORT_READY` có Discord và exact Binance gate

- Version `COINGLASS_ZONE_LIFECYCLE_V15_BREAKDOWN_ACCEPTED_SHORT_READY_20260903`; secondary stream
  `COINGLASS_WEB_SECONDARY_STREAM_V8_BREAKDOWN_ACCEPTED_SHORT_READY_20260903`. Causal Model 3/candle/lifecycle/target/mark/order inputs không đổi.
- `BELOW + SWEPT + ACCEPTED + SHORT` được gắn exact `BREAKDOWN_ACCEPTED_SHORT_READY`; Discord title + field SHORT hiển thị nhãn này.
  Primary dùng policy Discord lifecycle hiện hữu; secondary chỉ gửi terminal/pass nên case này được gửi. Event đã xử lý không replay.
- MARKET SHORT $10 x5 chỉ đi khi exact label khớp, mismatch fail-closed. Secondary giữ TP +6% ROE, primary adaptive; TP-only/no-SL.
  Stats vẫn gom `COINGLASS_ZONE_LIFECYCLE_SHORT`, lưu label ở chi tiết và không đổi công thức PnL/WL/WR/PF/AvgROE. Không thêm stats card/WHITELIST.
  `signalLabel`/`shortRuleTextMatched` additive optional; JSON cũ và `ZLC1` tương thích, không backfill.

### 2026-09-03 - Exact rule text trước khi gửi Zone Lifecycle LONG sang Binance

- Version `COINGLASS_ZONE_LIFECYCLE_V14_EXACT_LONG_RULE_TEXT_GATE_20260903`; secondary
  `COINGLASS_WEB_SECONDARY_STREAM_V7_EXACT_LONG_RULE_TEXT_GATE_20260903`. Causal market/heatmap/candle/lifecycle/mark/order inputs không đổi.
- ACCEPTED LONG $10 bắt buộc exact `BREAKOUT_ACCEPTED_LONG_READY`; REJECTED bounce LONG $5 bắt buộc exact
  `UNCONFIRMED_BOUNCE_LONG`. Support reclaim giữ exact label riêng. Mismatch bị `BLOCKED_SIGNAL_RULE_TEXT_MISMATCH`; state đơn lẻ không đủ.
  ACCEPTED SHORT đối xứng trước đó vẫn được nhận diện cấu trúc, không gắn label LONG.
- Không đổi size hợp lệ, adaptive/fixed +6% ROE TP hay TP-only/no-SL; chỉ event tương lai, không sửa lệnh/vị thế hiện hữu.
  Stats/cohort/Income và W/L/WR/PF/AvgROE/Net PnL không đổi; không thêm card/WHITELIST. `longRuleTextMatched` optional, JSON/event id cũ tương thích,
  không backfill hoặc replay.

### 2026-09-03 - `UNCONFIRMED_BOUNCE_LONG + REJECTED` vào MARKET $5

- Nâng lifecycle/Discord/Binance lên `COINGLASS_ZONE_LIFECYCLE_V13_UNCONFIRMED_BOUNCE_LONG_5USDT_20260903`, secondary stream lên
  `COINGLASS_WEB_SECONDARY_STREAM_V6_UNCONFIRMED_BOUNCE_LONG_5USDT_20260903`. Causal inputs giữ nguyên: mover Futures, CoinGlass Model 3
  active-edge, nến đóng, terminal lifecycle + next edge target, mark/slippage và position/open-entry-order snapshot trước entry.
- Existing label `UNCONFIRMED_BOUNCE_LONG` vẫn chỉ BELOW SWEPT→REJECTED thiếu một phần bullish wick/close confirmation của support reclaim;
  nếu terminal plan hoàn chỉnh và executor cho phép thì MARKET LONG $5 x5 trên cả 1–40 và 41–80. Accepted hai chiều vẫn $10; các tier khác giữ nguyên.
- Secondary giữ fixed TP +6% ROE đóng 100%; primary giữ adaptive TP; Zone Lifecycle tiếp tục TP-only/no-SL. Chỉ entry tương lai bị ảnh hưởng,
  không sửa position/order/TP hiện có.
- Stats/cohort vẫn `COINGLASS_ZONE_LIFECYCLE_LONG`, PnL theo Binance Income; W/L, WR, PF, AvgROE, Net PnL không đổi. Không thêm card/label hoặc
  checkbox `WHITELIST` vì key đã tồn tại. JSON cũ tương thích qua field optional `unconfirmedBounceLong` và config margin; giữ `ZLC1`, không backfill/replay.

### 2026-09-03 - Zone Lifecycle ACCEPTED $10; secondary 41–80 $2.5 và fixed TP +6% ROE

- Nâng lifecycle/Discord/Binance lên `COINGLASS_ZONE_LIFECYCLE_V12_ACCEPTED10_SECONDARY_FIXED6ROE_20260903` và stream phụ lên
  `COINGLASS_WEB_SECONDARY_STREAM_V5_FIXED6ROE_ACCEPTED10_20260903`. Causal input giữ nguyên: mover Futures, Model 3 active-edge ở mép phải,
  nến đóng xác nhận lifecycle, next edge target, mark/slippage và position/open-entry-order snapshot trước entry.
- Classification vẫn là `FRESH → APPROACHING → SWEPT → REJECTED/ACCEPTED`, chỉ terminal có next active edge hợp lệ mới qua entry gate.
  `ABOVE + ACCEPTED` LONG (`BREAKOUT_ACCEPTED_LONG_READY`) và `BELOW + ACCEPTED` SHORT đối xứng đều MARKET $10 trên cả hai stream.
  Không thêm nhãn/card SHORT và không thêm checkbox `WHITELIST`; matcher runtime dùng tổ hợp state/zoneSide/side hiện có.
- Nhóm hạng 41–80 dùng $2.5 cho các entry lifecycle terminal còn lại và TP đóng 100% ở +6% ROE từ fill thật (5x = 1.2% price),
  vẫn TP-only/no-SL. Primary 1–40 giữ adaptive TP; `[ZONE REVERSAL LONG]` riêng vẫn $1. Chỉ entry tương lai sau reload bị ảnh hưởng,
  không sửa lệnh/vị thế/TP đang tồn tại.
- Stats vẫn gom theo `COINGLASS_ZONE_LIFECYCLE_LONG|SHORT`, filled/closed và PnL theo Binance order/Income; không thay công thức W/L, WR,
  PF, AvgROE hay Net PnL. JSON cũ tương thích vì `acceptedBreakout`, `takeProfitRoePct`, fixed `takeProfitMode` và config mới là optional/additive;
  giữ event id `ZLC1`, không backfill/replay terminal event cũ.

### 2026-09-03 - Bounded hot paper stores và watchdog bộ nhớ

- Thêm `PAPER_HOT_STORE_V1_ACTIVE_PLUS_RECENT_CLOSED_20260903`: `liquid/edge/pump` giữ toàn bộ OPEN/PENDING/unknown status và CLOSED mới nhất
  trong quota 1.000; CLOSED overflow được append nguyên record sang NDJSON archive trước khi hot JSON được atomic replace. Active không bị xóa dù
  vượt quota; archive queue được serialize. Có script `compact:hot-paper` và test partition riêng.
- Causal market/signal inputs, detector classification, labels, tiers và entry gates không đổi. Realtime/open stats tiếp tục từ hot store; thống kê
  `all` trên web chỉ bao phủ hot window để không parse 1,2 GB JSON, còn full history dành cho offline archive report. Không thêm card/WHITELIST và
  không thay W/L, WR, PF, AvgROE/Net PnL của các record còn trong hot window.
- Không ảnh hưởng Binance, entry, size, leverage, SL/TP hoặc lệnh/vị thế thật. JSON cũ tương thích; metadata `hotStore` optional/additive và archive
  dùng nguyên schema record. PM2 giới hạn heap/RSS ở khoảng 4 GB; watchdog có startup grace 120 giây, restart grace 300 giây để tự hồi phục sớm.
- Sửa recovery edge thành `EDGE_PAPER_ENTRY_JOURNAL_RECOVERY_V3_RECENT_PREPARED_ONLY_20260903`: chỉ event PREPARED bị crash trước durable write,
  còn thiếu trong hot store và không quá 30 phút mới được dựng lại, sau đó được đóng dấu COMMITTED. Missing COMMITTED/PREPARED cũ không còn bị
  hiểu là lệnh OPEN vì record đó có thể đã CLOSED và chuyển archive;
  close live-card paper ghi terminal CLOSED. Compactor edge đối chiếu archive id để dọn an toàn các OPEN giả do V1 từng phục hồi. Không đổi detector,
  classification/stats outcome hay Binance/entry/size/SL/TP; reader tiếp tục tương thích các dòng journal V1. Journal trên 64 MiB được giữ nguyên
  trong archive rồi thu gọn về recent PREPARED theo `EDGE_PAPER_ENTRY_JOURNAL_COMPACTION_V1_TERMINAL_ARCHIVE_20260903`.

### 2026-09-02 - Coin Level Discord gửi cả REJECTED/APPROACHING một phía

- Version `COIN_LEVEL_LIFECYCLE_DISCORD_V5_ONE_SIDED_REJECT_APPROACH_20260902`. Causal input không đổi: Binance public mark/bias, trạng thái
  xác nhận từ nến 15m đã đóng và CoinGlass Model 3 active edge 48h/12h/24h có lifecycle; CoinGlass stale hoặc Binance `STALE_LAST_GOOD` không gửi.
- Một active zone `REJECTED` hoặc `APPROACHING` đã đủ phát cảnh báo. Mapping tham khảo: upper rejected → SHORT WATCH, lower rejected → LONG WATCH,
  upper approaching → LONG WATCH, lower approaching → SHORT WATCH. Message bắt buộc ghi `ONE-SIDED`, `OBSERVE ONLY`, chưa phải entry/xác nhận.
  Nếu đủ cặp rejected + target FRESH/APPROACHING đối diện thì giữ message setup hai phía và không nhân đôi hai message standalone. Second-rejection
  LONG/SHORT READY giữ nguyên. Dedupe 4h dùng symbol + event type ổn định, không còn exact band trôi theo heatmap.
- Không thêm label/card/tier/cohort/stat hoặc WHITELIST; không đổi W/L, WR, PF, AvgROE, Net PnL. Không ảnh hưởng Binance, entry, margin/size,
  leverage, SL/TP, position/order. JSON V1–V4 tiếp tục đọc được; V5 chỉ thêm event type/field one-sided tùy chọn, state cũ tự hết TTL, không backfill.

### 2026-09-02 - PPKS confirmed SHORT vào Binance margin $1

- Bật `PPKS_BINANCE_CONFIRMED_SHORT_V2_1USDT_20260902` qua authorization nội bộ mới của
  `LIVE_CARD_LIQ_FLOW_COINGLASS_PUMP_DUMP_PPKS_V18_20260902`, supersede `PPKS_BINANCE_HARD_OFF_V1_20260803` trong phạm vi hẹp. Input causal
  không đổi: nến 15m đã đóng, OHLC/volume, ATR, EMA13/25/99, RSI, pump + distribution trước đó, spike quét đỉnh, volume và wick/close rejection;
  không dùng outcome, PnL hoặc dữ liệu tương lai.
- Exact gate thật là `post_pump_kill_short + confirmed_short + SHORT + score>=60` và plan đủ entry/SL/TP. Watch, LONG đối ứng và tín hiệu thiếu
  plan không được authorization. Existing position/entry order cùng symbol, dedupe 4h, max-position, Orders/dry-run, credential, min-notional,
  precision và API checks vẫn fail-closed.
- MARKET SHORT dùng margin runtime/default `$1`, leverage `10x` hoặc giảm `5x` theo khoảng SL cấu trúc; min-notional ceil tối đa theo guard 1%
  có thể làm margin thật nhỉnh hơn `$1`. Global bot-SHORT protection vẫn thắng: không đặt SL ban đầu; TP thật là `+6% ROE` fill-anchored theo
  non-Liquid-Flow policy. SL/TP phân tích trong Discord vẫn mô tả detector, nhưng SL chỉ tham gia plan/leverage và TP detector không phải trigger
  Binance cuối cùng. Không hồi tố signal/lệnh/vị thế trước reload.
- Không thêm label/card/tier/cohort/stat hoặc checkbox WHITELIST; PPKS/Edge paper statistics tiếp tục cách tính cũ, real order dùng lifecycle audit
  và fill Discord chung. Không đổi JSON/schema/persisted store; authorization là Symbol nội bộ non-enumerable. `.env.example` opt-in mặc định off,
  runtime hiện bật `POST_PUMP_KILL_SHORT_AUTO_ORDER_ENABLED=true`, min score `60`, margin `$1`.

### 2026-09-02 - Fast-wave âm sâu không còn xóa TP; hồi +10% khóa SL +1%

- Nâng deep-loss lên `BINANCE_NEGATIVE_TP_TO_ENTRY_V5_FAST_WAVE_RECOVERY_20260902`, thêm
  `BINANCE_FAST_WAVE_RECOVERY_V1_ARM_NEG20_LOCK1_AT10_20260902` và profit-lock
  `BINANCE_PROFIT_LOCK_V20_FAST_WAVE_RECOVERY_LOCK_20260902`. Audit HEMI/SKR cho thấy V4 đã hủy TP tùy chỉnh rồi đặt full LIMIT tại average
  entry khi ROE chạm `<=-20%`, dù classifier fast-wave đang yêu cầu giữ SL gốc.
- Input causal là position Binance hiện tại (side, average entry, leverage, mark/uPnL), nến cache 5m/15m và source classification manual/Liquid
  Flow V2/SHORT TP-only. Nếu `ROE<=-20%` đồng thời V19 xác nhận râu/đảo chiều fast-wave, exact lifecycle được `ARMED`; từ đó realtime socket,
  scanner, AutoTP, TP guard, rule âm 8h và rule TP 12h không được rewrite TP.
- Nếu cache 5m/15m chưa sẵn sàng ngay sau restart, classifier trả `CANDLE_DATA_PENDING`; negative TP và profit-lock đều fail-closed, giữ order hiện
  tại đến lần monitor kế tiếp thay vì coi thiếu dữ liệu là nến thường.
- State không phụ thuộc việc nến fast-wave còn nằm trong lookback. Đến `ROE>=+10%`, bot đặt/replace STOP_MARKET khóa `+1% ROE`, ghi `LOCKED` và
  không close MARKET/close-at-entry. Coin thường vẫn dùng TP-to-entry `<=-20%`; entry, margin, size, side, leverage và initial protection không đổi.
- Không thêm label/card/stat/WHITELIST; không đổi W/L, WR, PF, AvgROE hay Net PnL. `fastWaveRecovery*` là field optional additive trong tracking,
  fail-closed theo exact version/lifecycle; JSON cũ vẫn đọc được và không migrate/rewrite/backfill. Lệnh/TP đã bị V4 đóng hoặc hủy trước deploy
  không được hồi tố.

### 2026-09-02 - Profit-lock V19 thu hẹp FAST_WAVE theo hình dạng nến

- Version `BINANCE_PROFIT_LOCK_V19_WICK_REVERSAL_FAST_WAVE_20260902`. Đây là policy protection sau entry; causal input gồm exact side,
  average entry, leverage, Mark/ROE Binance và tối đa `3x5m + 2x15m` OHLC trong KlineCache. Không đổi dữ liệu detector trước entry và không dùng
  change 24h, future outcome hoặc paper PnL.
- Range `5m >=4%` hoặc `15m >=6%` nay chỉ là prefilter. FAST_WAVE cần thêm `max wick/range >=0,30`, hoặc thân nến ngược hướng position
  `body/range >=0,55`. Thân xanh thuận LONG/thân đỏ thuận SHORT đóng gần cực trị là `DIRECTIONAL_BODY_ONLY`, dùng rule profit-lock thường;
  râu/đảo chiều mạnh mới dùng `ROE 30 -> lock +5`, step 10, gap 25. Explicit `ZKPUSDT,4USDT` không còn bypass candle-shape.
- Không thêm label/card/tier/cohort/stats/WHITELIST và không đổi W/L, WR, PF, AvgROE hay NET PnL. Không đổi Binance entry, size, leverage, TP,
  initial SL hoặc đóng position; chỉ đổi thời điểm dời SL ở tick quản lý kế tiếp, không hồi tố lệnh đã đóng và không MARKET-close.
- Persisted armed target chỉ kế thừa khi exact V19 và cùng trạng thái fast-wave, loại bỏ trì hoãn cũ từ V18 nhưng không nới STOP đã có trên sàn.
  JSON chỉ dùng field `profitLock*` optional hiện hữu; không migrate/rewrite/backfill history. Env optional mới là wick ratio `0.30` và reversal-body
  ratio `0.55`; test bao phủ directional body, wick, adverse reversal, explicit symbol và normal range.

### 2026-09-02 - V2 Binance Stats hiển thị Zone Lifecycle top 1–80

- Version `LIQUID_FLOW_V2_BINANCE_STATS_V4_ZONE_LIFECYCLE_20260902`; UI
  `LIQUID_FLOW_V2_BINANCE_STATS_UI_V8_ZONE_LIFECYCLE_20260902`. Nguyên nhân lỗi 0 lệnh: endpoint cũ chỉ ghép Liquid Flow V2 và
  `CoinGlass Qualified`, trong khi các fill BLESS/ZRO/COLLECT/APR/SEI/LA ngày 02-09 đến từ `CoinGlass Zone Lifecycle` nên không nằm trong
  tập đầu vào của bộ lọc.
- Nguồn mới là audit `SUBMITTED` trong lifecycle primary top `1–40` + secondary top `41–80`, xác minh exact `symbol/orderId` qua Binance
  `FILLED` hoặc tracking exact order có `signalSource=coinglass-zone-lifecycle`. Group thống kê là
  `COINGLASS_ZONE_LIFECYCLE_LONG|SHORT`; ngày theo fill Asia/Bangkok, OPEN PnL từ Position realtime, CLOSED PnL chỉ từ Binance Income.
  Các event observe/blocked, submitted chưa xác nhận fill và lệnh tay bị loại.
- Đây chỉ là sửa stats sau execution, không thêm dữ liệu/classifier trước entry và không đổi Binance entry, size, leverage, SL hay TP.
  Reporting key không phải signal card/gate runtime mới, nên UI ghi `KHÔNG CÓ AUTO ROUTE` và không tạo `WHITELIST` không có matcher.
  JSON cũ thiếu signal label/margin/fill metadata tiếp tục fallback an toàn; không migrate/rewrite history, record không xác minh được fill
  sẽ không được tính.

### 2026-09-01 - Secondary Lifecycle hạng 41–80 chỉ gửi Discord khi pass

- Version `COINGLASS_WEB_SECONDARY_STREAM_V4_PASS_ONLY_DISCORD_20260901`. Input causal, lifecycle classifier và Binance executor không đổi;
  thay đổi chỉ nằm ở webhook event của secondary. `pass = event.shouldEnter===true`, tức terminal `REJECTED/ACCEPTED` có next-zone plan hoàn chỉnh
  trong khoảng `1–15%`.
- `APPROACHING`, `SWEPT` và terminal thiếu target vẫn lưu track/processed audit nhưng không gửi Discord. Auth-required alert vẫn gửi để người dùng
  biết profile CoinGlass cần đăng nhập. Primary 1–40 tiếp tục gửi toàn bộ transition như trước.
- Không đổi entry, size (`$3` support-reclaim; `$1` secondary profile khác), leverage, TP/SL hoặc lệnh đang tồn tại. Không có stats label/card/
  `WHITELIST` mới; JSON tương thích qua optional `notificationDecision`, không backfill hay rewrite record cũ.

### 2026-09-01 - CoinGlass Lifecycle phân biệt support reclaim LONG, size $3

- Versions `COINGLASS_ZONE_LIFECYCLE_V11_SUPPORT_RECLAIM_LONG_3USDT_20260901`,
  `COINGLASS_ZONE_LIFECYCLE_DISCORD_V11_SUPPORT_RECLAIM_LONG_20260901` và
  `COINGLASS_ZONE_LIFECYCLE_BINANCE_V11_SUPPORT_RECLAIM_LONG_3USDT_20260901`. Input causal là zone mép phải Model 3, lifecycle state,
  persistence/scan, OHLC hiện tại và next-zone target; không dùng future PnL/outcome.
- Exact class `SUPPORT_RECLAIM_LONG_READY` cần `LONG + BELOW + SWEPT + REJECTED`, bullish close, lower-wick/range `>=0,20`,
  close-location/range `>=0,65` và trade plan terminal hoàn chỉnh. `ABOVE→ACCEPTED` là `BREAKOUT_ACCEPTED_LONG_READY`; reclaim thiếu bộ nến là
  `UNCONFIRMED_BOUNCE_LONG`. Discord hiển thị classifier/evidence và nhắc rằng support bounce không đồng nghĩa trend reversal dài hạn.
- Ảnh hưởng entry mới: support-reclaim READY dùng MARKET margin `$3 x5` trên cả primary/secondary; các profile khác giữ cấu hình `$2` primary hoặc
  `$1` secondary. Entry target/partial TP/fill-anchor/TP-only không đổi, không có SL và không đụng position/pending/protection đã tồn tại.
- Không backfill stats và không tạo paper stats card/key mới, nên không có `WHITELIST`; audit optional thêm `signalLabel`, `marginRule`, `marginUsdt`.
  JSON V10/cũ thiếu `supportReclaim` vẫn đọc nguyên, không migrate/rewrite/replay.

### 2026-08-30 - CoinGlass Lifecycle riêng cho hạng 41–80, Discord riêng và Binance $1

- Version `COINGLASS_WEB_SECONDARY_STREAM_V2_RANK_41_80_LIFECYCLE_1USDT_20260830`, thay V1 secondary observe-only. Primary hạng `1–40`/3 phút
  và webhook/executor/state không đổi. Secondary dùng API/page `/coinglass-web-secondary`, data dir, browser profile, snapshot/auth/dedupe/
  lifecycle riêng; offset `40`, limit `40`, scheduler 6 phút, initial delay `270s`, budget `150s`, concurrency `4`, nice `10`.
- Input causal: Binance app-style mover 24h + volume/trades/OI/book/spread và CoinGlass Model 3 48h structured edge zones, strength,
  persistence/latest OHLC, context 12h/24h khi có. Classification lifecycle giữ `FRESH → APPROACHING → SWEPT → REJECTED/ACCEPTED`; chỉ terminal
  có next edge target `1–15%` mới được xét entry. Không dùng future candle/PnL/outcome.
- `CoinGlass Qualified` trên secondary tiếp tục OBSERVE ONLY; chỉ lifecycle transition gửi webhook riêng. Entry terminal mới dùng MARKET margin
  `$1 x5`, kể cả large-target; qua global Orders/dry-run/credential, max slippage, max positions và no-existing-position/order. TP adaptive V7
  giữ nguyên, TP-only không SL. Không sửa/cancel/resize lệnh hoặc position hiện hữu; primary `$5/$6` không đổi.
- Không paper/signal stats, nên W/L/WR/PF/Net/AvgROE không đổi; không thêm label/card/reporting key/WHITELIST. JSON V1 secondary tương thích qua
  optional `streamVersion/globalRank/streamRank` và lifecycle audit, không migrate/rewrite primary/history. Profile phụ chưa login thì fail-closed,
  gửi auth-required theo cooldown vào webhook lifecycle riêng trước khi có lifecycle event hoặc Binance side effect.

### 2026-08-30 - Liquid Flow V2 SHORT chỉ READY sau xác nhận EMA99 0,5-1%

- Versions `LIQUID_HEATMAP_FLOW_V2_SHORT_EMA99_CONFIRMATION_GATE_V25_20260830`,
  `LIQUID_FLOW_V2_SHORT_EMA99_ENTRY_GATE_V1_20260830`,
  `LIQUID_FLOW_V2_PAPER_V32_SHORT_EMA99_CONFIRMATION_GATE_20260830` và
  `LIVE_CARD_WHITELIST_V17_SHORT_EMA99_WATCH_20260830`. Input causal trước entry là EMA99/close nến đã đóng 5m/15m, selected retest
  timeframe nếu có, reject/râu trên theo mẫu và closed taker-flow; không dùng future candle, PnL hoặc outcome.
- Chỉ bốn cohort `DOWN_BASE_SWEEP_SHORT_READY`, `PRE_DOWN_BASE_SHORT`, `HTF_BEAR_15M_EMA99_PUMP_REJECT`,
  `PUMP_DISTRIBUTION_SHORT_READY` bị gate. READY cần close nằm dưới EMA99 `0,5-1%`, có reject và taker sell `<=0`; sát hơn, còn trên EMA,
  thiếu causal evidence hoặc đã thấp hơn quá `1%` đều đổi thành `SHORT_EMA99_CONFIRMATION_WATCH`/OBSERVE_ONLY. `UP_SWEEP`, `EMA_FAN`
  và CoinGlass Lifecycle không đổi.
- Backtest V2 paper 7 ngày: vùng sát EMA99 `127` lệnh/PF `0,70`/AvgROE `-2,01%`; vùng xác nhận `82` lệnh/PF `2,05`/AvgROE
  `+2,98%`; vùng đuổi dưới `>1%` PF `0,88`. Kiểm tra 14 ngày cho PF `0,77` so với `1,35`, dedupe episode 4 giờ cho PF `0,70` so
  với `1,60`. Stats cũ giữ nguyên exact label; lịch sử không reclassify.
- Ảnh hưởng entry/Binance: future paper và Binance của ba nhãn executable chỉ sinh khi gate READY; distribution hiện paper-only. Không đổi
  side, margin/size, leverage, entry method, SL/TP của lệnh hợp lệ và không đụng lệnh/position đang tồn tại. Defense-in-depth nằm cả classifier
  và paper planner để UI WATCH không thể lọt executor.
- JSON tương thích ngược qua optional `ema99ShortEntryGate`/`sourceLabelKey`; thiếu EMA live fail-closed WATCH. Exact whitelist key mới
  `heatmap-v2:SHORT_EMA99_CONFIRMATION_WATCH` mặc định off và chỉ hiện khi CLOSED AvgROE `>4%`; test matcher/runtime/stats được cập nhật cùng lượt.

### 2026-08-30 - CoinGlass Lifecycle SHORT adaptive partial TP, chỉ áp entry mới

- Versions `COINGLASS_ZONE_LIFECYCLE_V7_SHORT_ADAPTIVE_PARTIAL_TP_20260830`,
  `COINGLASS_ZONE_LIFECYCLE_DISCORD_V7_SHORT_ADAPTIVE_PARTIAL_TP_20260830`,
  `COINGLASS_ZONE_LIFECYCLE_BINANCE_V7_SHORT_ADAPTIVE_PARTIAL_TP_20260830`,
  `COINGLASS_ZONE_LIFECYCLE_PARTIAL_TP_V2_BOTH_SIDES_STRONG_SHORT_20260830`. Audit live cho thấy TP SHORT gốc có thể xa `11-19%` giá, khiến
  toàn bộ size phải chờ vùng CoinGlass xa trong khi coin có thể quay lại xu hướng tăng.
- Input causal trước entry gồm Model 3 48h edge zone + transition hiện có và Binance `change24hPct` nằm trong cùng snapshot; không dùng future
  outcome. Gate terminal/target gốc `1-15%` không đổi. SHORT bình thường: target `<=3%` giữ single full, target `>3%` chốt `70% @ -2%` và
  `30% @ min(zone,-5%)`. SHORT trong `STRONG_UP_WAVE` (`change24hPct>=+10%`): nếu target `>1%`, chốt `80% @ -1%`, phần `20%` còn lại tại
  `min(zone,-3%)`. LONG giữ `70% @ +2%`, runner tối đa `+5%`.
- Binance/entry/size/SL/TP: không đổi MARKET entry, margin, leverage hoặc tổng quantity; chỉ chia TP thật của SHORT thành hai reduce-only legs,
  re-anchor theo fill và LOT_SIZE. Lifecycle không có SL tại entry theo suppression hiện hành; ngoại lệ BE chỉ áp runner sau TP1. V7 là future-entry-only: không migrate plan, không resize,
  không cancel/replace TP và không MARKET-close bất kỳ position nào đã mở trước reload; negative TP-to-entry V4 giữ nguyên độc lập.
- Runner protection `COINGLASS_ZONE_LIFECYCLE_STRONG_SHORT_BE_V1_FUTURE_ENTRY_RUNNER_ONLY_20260830` chỉ đọc metadata causal đã lưu lúc entry V7,
  active amount/average entry/Mark/ROE hiện tại, open TP legs và fresh `change24hPct`. Với profile `SHORT_PARTIAL_80_20_STRONG_WAVE`, TP1 phải
  đã fill (TP1 không còn open, amount còn lại không vượt quantity TP2) và ROE `>=+5%` mới đặt STOP BUY reduce-only tại entry cho runner.
  Explicit exclusions mặc định `ZKPUSDT,4USDT`; mọi coin `|change24h|>=25%` cũng bị loại. Placement bị trễ tới khi Mark quay qua entry thì bỏ qua,
  không MARKET-close. Vì cần exact V7 metadata/leg quantity, position mở trước deploy không thể match.
- Stats/WHITELIST không đổi vì không có label/card/reporting key mới. JSON cũ tương thích; V7 thêm optional `change24hPct`, `shortWaveClass`,
  `takeProfitMode`, SHORT `takeProfitLegs` có quantity và audit BE runner, reader cũ vẫn dùng `takeProfitPrice`; không migrate/rewrite history. Rule TP chia/BE chỉ áp entry mới,
  position hiện hữu giữ nguyên order/protection đang có.

### 2026-08-29 - Profit-lock FAST_WAVE cho ZKP/4 và coin biến động nhanh

- Version `BINANCE_PROFIT_LOCK_V14_FAST_WAVE_DEFERRED_LOCK_20260829`. Audit runtime cho thấy `ZKPUSDT` và `4USDT` là LONG tay
  (`ios_...`), không phải bot tự vào lại: position vừa đạt `+10..24% ROE`, ladder manual arm `+1/+5/+10`, sau đó giá giật qua target trong lúc
  replace và V13 kích hoạt STOP/emergency MARKET, tạo cảm giác bị cắt SL liên tục khi người dùng mở/DCA lại.
- Input causal chỉ dùng position/fill/Mark Binance đang có, average entry/leverage/source/lifecycle, same-side DCA gần nhất và public
  `change24hPct` snapshot không quá 3 phút; không dùng future candle/outcome. FAST_WAVE = LONG manual/Liquid V2 và một trong: symbol explicit mặc định `ZKPUSDT,4USDT`,
  `abs(change24hPct)>=10`, hoặc same-side DCA trong 15 phút. Không đổi label/tier/gate trước entry.
- FAST_WAVE giữ SL gốc cho tới `+30% ROE`; ladder `30→+5`, `40→+15`, `50→+25` giữ gap 25 ROE. Nếu target đã bị xuyên trước khi replace hoặc
  placement immediate-trigger, bot rollback/giữ SL gốc và retry, không reduce-only MARKET-close. Policy thường/V13 giữ nguyên.
- Binance/entry/size/SL/TP: có thay dời SL thật sau entry cho đúng cohort FAST_WAVE, nhưng không đổi entry, margin/size, leverage, TP hoặc giá SL
  lỗ ban đầu; DCA vẫn giữ protection gốc. Stats/WHITELIST không thêm key/card/checkbox và công thức W/L/WR/PF/Net/AvgROE không đổi.
- JSON compatibility: optional `profitLockFastWave`/`profitLockFastWaveReason`; loader cũ có thể bỏ qua, record V13 không migrate/rewrite/replay.
  Armed V13 không được dùng làm persisted target cho lifecycle V14 đã phân loại FAST_WAVE.

### 2026-08-28 - LIMIT cùng chiều position là DCA_ATTACHED, giữ tới khi position gốc đóng

- Versions `BINANCE_DCA_ATTACHED_LIMIT_RETENTION_V1_20260828`,
  `ENTRY_LIMIT_TWELVE_HOUR_EXPIRY_V2_DCA_ATTACHED_EXEMPT_20260828` và
  `LIVE_CARD_LIMIT_RETEST_EXPIRY_V2_DCA_ATTACHED_EXEMPT_20260828`. Input causal chỉ gồm regular open order Binance và active Position Risk:
  symbol/type/side/positionSide/reduce-only/close-position/time/executedQty cùng positionAmt/positionSide; không dùng candle hoặc outcome tương lai.
- Entry LIMIT cùng symbol/cùng hướng với position (`LONG+BUY`, `SHORT+SELL`) được phân loại `DCA_ATTACHED`. Khi position còn active, nó được miễn
  timeout 12h, BTC-bias cancel và live-card retest timeout; hedge close LIMIT không bị coi là entry. Socket truyền snapshot position ngay trước close,
  xác nhận flat bằng Position Risk rồi cleanup DCA; scanner 35 giây dùng last-known position làm fallback. Partial close chưa flat không cleanup.
- Thay đổi có ảnh hưởng Binance thật: giữ pending DCA khi parent còn mở và cancel DCA sau khi parent đóng để không tái mở position. Không đổi giá
  LIMIT, entry đã fill, size/margin/leverage hoặc TP/SL đang chạy. Standalone LIMIT vẫn hết hạn 12h như trước.
- Không đổi signal/label/tier/gate/stats, không thêm card hay WHITELIST. Lifecycle JSON chỉ thêm field optional `dcaAttachedLimit`, version và retest
  audit state; JSON/order/trade cũ không migrate hoặc rewrite, record cũ được runtime phân loại lại từ Binance.

### 2026-08-28 - CoinGlass Zone Lifecycle V6 chia TP LONG 70/30 và siết size $6

- Versions `COINGLASS_ZONE_LIFECYCLE_V6_LONG_PARTIAL_TP_DYNAMIC_SIZE_20260828`,
  `COINGLASS_ZONE_LIFECYCLE_DISCORD_V6_LONG_PARTIAL_TP_20260828`,
  `COINGLASS_ZONE_LIFECYCLE_BINANCE_V6_LONG_PARTIAL_TP_DYNAMIC_SIZE_20260828` và
  `COINGLASS_ZONE_LIFECYCLE_LONG_PARTIAL_TP_70_30_V1_20260828`. Dữ liệu causal/classifier giữ nguyên: Model 3 48h, latest candle OHLC,
  active-edge band/strength/persistence, scan match, timeframe overlap hiện có và terminal REJECTED/ACCEPTED; không dùng outcome/PnL tương lai.
- Terminal vẫn cần next active-edge zone cách `1-15%`. LONG có zone gốc `<=3%` đóng 100% tại zone; LONG `>3%` đặt TP1 `+2%` đóng 70% và
  TP2 đóng 30% tại `min(zone gốc, +5%)`. Socket full-fill re-anchor từng leg theo average fill, chia quantity theo `LOT_SIZE`, chống đặt trùng;
  nếu quantity không đủ hai step thì fallback đóng 100% ở TP1. SHORT không đổi, vẫn một TP 100% tại zone gốc. Lifecycle LONG/SHORT tiếp tục
  TP-only và không SL.
- Margin mặc định `$5`; `$6` chỉ khi `LONG + ABOVE → ACCEPTED + agreement 12h/24h + zone gốc >5%`, leverage `5x`. Các trường hợp khác,
  kể cả SHORT xa, BELOW→REJECTED LONG, thiếu agreement hoặc đúng 5%, đều `$5`. Slippage `1.5%`, no-position/no-reversal và global Orders giữ nguyên.
- Thống kê/label/tier/gate không đổi, không thêm card hay WHITELIST; W/L, WR, PF, Net PnL và AvgROE giữ nguyên. JSON cũ tương thích; V6 chỉ thêm
  optional `zoneTakeProfitPrice`, `zoneTargetDistancePct`, `takeProfitMode`, `takeProfitLegs`, `marginRule` và tracking legs, không migrate/rewrite
  history. Chỉ entry mới sau reload nhận rule; vị thế/TP/STOP hiện hữu không bị resize, tách hoặc cancel.

### 2026-08-28 - CoinGlass Zone Lifecycle LONG/SHORT TP-only, không auto SL

- Versions `COINGLASS_ZONE_LIFECYCLE_V3_BINANCE_5USDT_TP_ONLY_20260828`,
  `COINGLASS_ZONE_LIFECYCLE_DISCORD_V3_TP_ONLY_5USDT_20260828`,
  `COINGLASS_ZONE_LIFECYCLE_BINANCE_V3_MARKET_5USDT_TP_ONLY_20260828` và
  `COINGLASS_ZONE_LIFECYCLE_TP_ONLY_NO_SL_V1_20260828`; supersede policy LONG `-20% ROE` của V2. Dữ liệu causal/classification trước entry
  không đổi: structured Model 3 48h + latest OHLC, active edge band, strength/persistence, scan match và terminal REJECTED/ACCEPTED; TP vẫn cần
  next active-edge target `1-15%` đúng hướng.
- Chỉ source `coinglass-zone-lifecycle` bị suppression SL cho cả LONG và SHORT. Entry plan/evaluator trả SL `null`; MARKET `$5 x5`, TP zone và
  slippage/no-position/no-reversal gates giữ nguyên. Socket fill/protection replay, automatic `setTpSl`, missing-SL guard và profit-lock nhận diện
  source persisted rồi không dựng hoặc dời STOP. LONG của CoinGlass Qualified, Liquid Flow V2, manual và các source khác không bị thay đổi.
- Thay đổi áp dụng cho protection tự động từ entry mới sau reload; không tự cancel STOP đã tồn tại trước deploy. Không đổi paper/stats, không thêm
  label/card/reporting key/WHITELIST; W/L, WR, PF, Net PnL và AvgROE giữ nguyên. JSON V1/V2 đọc tương thích; plan/track V3 giữ schema cũ và ghi các
  field SL thành `null`, không migrate/rewrite history.

### 2026-08-28 - CoinGlass Zone Lifecycle nâng Binance margin lên $5

- Versions mới `COINGLASS_ZONE_LIFECYCLE_V2_EDGE_CONFIRMED_BINANCE_5USDT_20260828`,
  `COINGLASS_ZONE_LIFECYCLE_DISCORD_V2_ENTRY_PLAN_5USDT_20260828` và `COINGLASS_ZONE_LIFECYCLE_BINANCE_V2_MARKET_5USDT_20260828`; thay bộ V1
  `$1` của ngày 2026-08-27. Dữ liệu causal trước entry và phân loại không đổi: structured heatmap Model 3 48h, last candle OHLC, zone edge-gap,
  strength/persistence, band match qua scan và lifecycle `FRESH → APPROACHING → SWEPT → REJECTED/ACCEPTED`; 12h/24h vẫn chỉ telemetry khi có.
- Entry terminal, target edge `1-15%`, max slippage `1.5%`, no-reversal/no-existing-position và cách đặt TP/SL tại thời điểm V2 không đổi. Chỉ lệnh
  Binance mới của source `coinglass-zone-lifecycle` đổi sang MARKET margin `$5`, leverage `5x` (notional khoảng `$25`); policy LONG `-20% ROE`
  của V2 này đã được supersede bởi mục TP-only V3 ngay phía trên. Discord entry plan/footer đọc cùng margin runtime `$5`, không còn hard-code `$1`.
- Không thêm label/card/stats/WHITELIST; W/L, WR, PF, Net PnL và AvgROE không đổi. JSON cũ tương thích: state V1 được đọc nguyên và track mới ghi
  version V2 theo schema cũ, không migrate/rewrite history; `.env.example` đổi default margin nhưng giữ Binance lifecycle default-off an toàn.

### 2026-08-27 - CoinGlass edge-zone lifecycle + Discord + Binance test $1

- Versions `COINGLASS_ZONE_LIFECYCLE_V1_EDGE_CONFIRMED_BINANCE_1USDT_20260827`,
  `COINGLASS_ZONE_LIFECYCLE_DISCORD_V1_ENTRY_PLAN_20260827` và `COINGLASS_ZONE_LIFECYCLE_BINANCE_V1_MARKET_1USDT_20260827`. Pipeline mới
  độc lập với V14 qualified; không đổi proposal/qualification/Binance route cũ.
- Input causal: structured 48h exact instrument, last candle OHLC, band/strength/persistence và `lastX` so với `lastHeatmapX`. Chỉ zone edge-gap
  `<=2`, persistence `>=3`, strength `>=20`, distance `<=15%`; phải match band qua 2 scan. 12h/24h overlap chỉ telemetry khi có sẵn.
- States: FRESH; APPROACHING ở `<=4%`; SWEPT khi candle chạm band; REJECTED khi close quay ra ngoài buffer `0.1%`; ACCEPTED khi close xuyên mép xa
  buffer `0.1%`. Discord gửi mọi transition trừ FRESH. Terminal mapping: upper reject SHORT, lower reject LONG, upper accept LONG, lower accept SHORT;
  chỉ executable khi có next active-edge target cách `1-15%`.
- Binance explicit-on: MARKET `$1 x5`, max slippage `1.5%`, không có position/entry order cùng symbol và không reversal; vẫn chịu Orders/dry-run/
  credential/max-position. LONG SL `-20% ROE`; SHORT TP-only không SL theo policy bot hiện tại; TP zone kế tiếp re-anchor theo fill.
- Không thêm label/card/stats/WHITELIST và không đổi W/L/WR/PF/Net/AvgROE. Snapshot thêm field optional, state/dedupe dùng file mới
  `data/coinglass-web-top20/zone-lifecycle.json`; JSON/history cũ không migrate/rewrite, lượt đầu cần 2 scan để arm.

### 2026-08-24 - Khôi phục TP-to-entry ở ROE âm sâu và start worker độc lập warm-up

- Version `BINANCE_NEGATIVE_TP_TO_ENTRY_V4_CAP_TSL_INDEPENDENT_ROE20_20260824`, thay V3. Protection sau entry chỉ dùng active Binance
  average entry, Mark/uPnL, initial margin/leverage và open close-orders hiện tại; không dùng candle, future outcome hay paper PnL.
- Bot, Liquid Flow V2 và manual đều match tại ROE `<=-20%` kể cả đang check `Cap TSL`. Cap TSL vẫn giới hạn profit-lock/trailing SL dương,
  nhưng không còn chặn socket, scanner hoặc deep TP guard. Nhánh 8h còn âm giữ opt-out Cap TSL riêng; deep-loss V4 luôn ưu tiên.
- Scanner negative TP và cleaner LIMIT 12h start ngay khi server listen, trước kline warm-up, có start/single-flight guard. Match sẽ hủy TP close-side
  xa entry và đặt full remaining quantity `LIMIT GTC` tại average entry; không đổi entry/side/size/margin/leverage hoặc SL.
- Không đổi label/tier/gate/stats và không thêm card/WHITELIST. JSON cũ không migrate/rewrite; Cap TSL state tiếp tục dùng cho profit-lock, dedupe
  deep TP chỉ ở RAM và open order Binance được kiểm tra lại sau restart.

### 2026-08-24 - Entry LIMIT hết hạn sau 12 giờ

- Version `ENTRY_LIMIT_TWELVE_HOUR_EXPIRY_V1_20260824`; default-on, max age `43,200,000ms`. Cleaner 35 giây dùng timestamp Binance và chỉ chọn
  LIMIT/LIMIT_MAKER entry không reduce-only/close-position; TP/SL/algo order không bị hủy.
- Cơ chế độc lập với legacy BTC-bias auto-cancel nên không phát sinh hủy sớm theo biến động thị trường. Plan chỉ xóa nếu order identity khớp.
- Không đổi signal/tier/gate/entry/size/leverage/protection sau fill hay stats; không thêm label/card/WHITELIST và không đổi JSON cũ.

### 2026-08-24 - Manual SHORT TP EMA99 5m/15m, cap +30% ROE, không SL

- Version `BINANCE_MANUAL_SHORT_EMA99_TP_ONLY_V1_20260824`. Input causal gồm entry/fill, leverage và closed kline 5m/15m; chọn EMA99 profit-side
  gần entry nhất. TP đúng EMA nếu khoảng cách `<=30% ROE`, ngược lại dùng TP +30% ROE; EMA thiếu hoặc cả hai ở trên entry cũng fallback +30%.
- Áp dụng `orders-manual`, socket fill Binance manual và explicit manual flow. Manual SHORT bỏ SL, tắt fill-anchor cho TP EMA tuyệt đối; socket/restart,
  missing-SL guard, profit-lock và automatic set-tp-sl không tái tạo SL. LONG manual giữ nguyên; STOP cũ không bị cancel.
- Không đổi label/tier/gate/stats/entry/size/margin/leverage. Không thêm card/key/WHITELIST; W/L/WR/PF/Net/AvgROE và JSON cũ giữ tương thích,
  telemetry EMA99 là additive và không migrate/rewrite history.

### 2026-08-24 - Bot SHORT tạm chạy TP-only, không auto SL

- Version `BINANCE_BOT_SHORT_TP_ONLY_V1_20260824`, default-on và rollback bằng `BINANCE_BOT_SHORT_TP_ONLY_ENABLED=false`. Classification chỉ dựa
  side SHORT/SELL + known bot source trước entry (gồm legacy auto source `signal`); manual/unknown source được loại trừ. Không đổi dữ liệu signal,
  tier, gate hoặc thống kê.
- `placeOrder` và protection plan bỏ SL/signal-SL/fill-anchor-SL; socket/lifecycle `setTpSl`, missing-SL guard và profit-lock không tái tạo STOP.
  TP, LONG và explicit manual flow giữ nguyên. SL đã có không bị cancel; người dùng vẫn có thể đặt SL tay qua source `set-tp-sl`.
- Binance entry price/type, size/margin/leverage, TP, dedupe và vị thế LONG không đổi. Không thêm label/card/WHITELIST; stats W/L/WR/PF/Net/
  AvgROE giữ nguyên. Telemetry response additive, JSON tracking cũ load nguyên trạng và không bị migrate/rewrite.

### 2026-08-23 - Daily Timing Edge kết hợp ngày hiện tại và giờ entry

- Versions `LIQUID_FLOW_V2_DAILY_TIMING_EDGE_V1_20260823` và
  `LIQUID_FLOW_V2_BINANCE_STATS_UI_V7_DAILY_TIMING_EDGE_20260823`; endpoint auth mới
  `/api/liquid-flow-v2-binance-daily-timing` lấy rolling 7 ngày Asia/Bangkok. Chỉ `CLOSED + pnlKnown + BINANCE_INCOME`, phân nhóm theo giờ
  entry; CoinGlass Qualified bị loại khỏi điểm quyết định để outlier không chi phối core Liquid Flow V2. Đây là hậu nghiệm OBSERVE ONLY,
  không phải feature causal trước entry.
- Mỗi side tính W/L, WR, PF, Net, AvgROE cho hôm nay và từng giờ. GOOD: giờ `n>=5` hoặc ngày `n>=3`, Net `>0`, PF `>=1.2`, WR `>=60%`,
  AvgROE `>0`; AVOID: đủ mẫu, Net `<0` và có PF `<0.95`/AvgROE `<0`/WR `<50%`. Giờ liền nhau cùng chất lượng được gộp thành khung và xếp
  score; ngày + giờ đồng thuận mới lên `STRONG`, xung đột hạ SELECTIVE/AVOID/WAIT.
- Banner nổi bật ở đầu V2 Binance Stats hiển thị khuyến nghị hợp nhất, bốn ô hôm nay/giờ này cho LONG/SHORT và tối đa ba khung tốt mỗi hướng;
  tải sau stats chính, refresh 5 phút + foreground, giữ last-good dưới trạng thái STALE khi lỗi.
- Route timing bỏ toàn bộ CoinGlass order verify/position REST. Result cache 5 phút; sau lần Income 7 ngày đầu tiên của process, refresh sau chỉ
  thay phần Income từ đầu ngày Bangkok hiện tại và giữ lịch sử đã cache, tránh lặp burst REST mà không đổi thống kê nguồn.
- Không đổi bảng/filter/summary stats hiện hữu; không tạo signal label/reporting key/runtime matcher nên không thêm WHITELIST. Policy checkbox
  per-label default-off và CLOSED AvgROE `>4%` giữ nguyên. Không ảnh hưởng Binance entry/side/size/margin/leverage/SL/TP/protection/dedupe hay
  vị thế mở. Không thêm JSON/state và không migrate/rewrite/replay dữ liệu cũ.

### 2026-08-23 - Binance per-label control ở Liquid Flow V2, đồng bộ hai trang

- Versions `LIQUID_FLOW_V2_PAPER_BINANCE_CONTROL_UI_V1_SHARED_SYNC_20260823` và
  `LIQUID_FLOW_V2_BINANCE_STATS_UI_V7_DAILY_TIMING_EDGE_20260823`; API/store per-label hiện hữu giữ nguyên. Bảng paper `Thống kê theo nhãn`
  thêm BẬT/TẮT + margin USDT + LƯU cho exact supported route, cùng giá trị/default/global Orders/dry-run như trang Binance Stats; draft chưa lưu
  sống qua SSE rerender.
- Hai UI dùng chung persistent store, phát BroadcastChannel/storage sau save và poll 10 giây + foreground refresh; payload settings chỉ re-render
  khi fingerprint đổi. Không truyền credential qua channel.
- Stats/date/label/paper giữ nguyên; không thêm label/card/key/WHITELIST, policy default-off và CLOSED AvgROE `>4%` giữ nguyên. Save có thể đổi
  quyền và margin của entry Binance **tương lai** cho supported label nhưng không đổi side/entry policy/leverage/SL/TP/protection/dedupe hay lệnh
  đã mở. JSON settings cũ load nguyên trạng, không migrate/rewrite lịch sử.

### 2026-08-23 - Discord khi Market Direction stable label đổi

- Version `LIQUID_MARKET_DIRECTION_DISCORD_V1_COMMITTED_CHANGE_20260823`; input/classifier causal giữ
  `LIQUID_MARKET_DIRECTION_HEALTH_V3_20260729`. Chỉ stable `label` đã qua hysteresis hai closed-5m sample mới so với persistent `lastLabel`;
  pending/raw và NO_DATA không gửi. Startup đầu tiên arm baseline, restart đọc state chống duplicate, lỗi webhook giữ label cũ để retry chu kỳ sau.
- Embed màu theo LONG/SHORT/CHOP/DISPERSION/TRANSITION/SHOCK, có old→new, scores/confidence, breadth, BTC, sample và reasons. Secret webhook riêng
  chỉ lưu `.env`; `.env.example` trống. State JSON additive optional, không migrate/rewrite dữ liệu giao dịch.
- Observe-only: không thêm label/card/key/WHITELIST, không đổi stats W/L/WR/PF/Net/AvgROE và không ảnh hưởng Binance entry/side/size/margin/
  leverage/SL/TP/protection/dedupe.

### 2026-08-23 - Banner cảnh báo sóng realtime trên V2 Binance Stats

- Version UI `LIQUID_FLOW_V2_BINANCE_STATS_UI_V5_REALTIME_MARKET_BIAS_20260823`; nguồn là classifier hiện hữu
  `LIQUID_MARKET_DIRECTION_HEALTH_V3_20260729`, không tạo classifier/label mới. Input causal giữ nguyên: 120 alt thanh khoản, closed 15m,
  breadth 1h/3h/6h, EMA20/50, volume và BTC đa khung; không dùng outcome/PnL tương lai.
- Banner poll API hiện hữu ngay khi load và mỗi 20 giây khi tab visible. LONG/SHORT đổi xanh/đỏ; CHOP/TRANSITION vàng, DISPERSION tím,
  SHOCK cam và NO_DATA xám. Hiển thị scores/confidence/breadth/reasons; raw/pending khác stable sẽ hiện `ĐANG ĐỔI SÓNG` cùng tiến độ
  hysteresis, còn fetch lỗi giữ snapshot cũ và đánh `STALE`.
- Chỉ là observe-only reporting: không đổi W/L/WR/PF/Net/AvgROE, date/label/symbol filter hoặc row realtime; không thêm label/card/key/
  WHITELIST checkbox, policy default-off và CLOSED AvgROE `>4%` giữ nguyên. Không ảnh hưởng Binance entry/side/size/margin/leverage/SL/TP,
  protection hay dedupe. JSON/schema giữ nguyên, không migrate/rewrite lịch sử.

### 2026-08-23 - Tìm altcoin realtime trong chi tiết V2 Binance Stats

- Version UI `LIQUID_FLOW_V2_BINANCE_STATS_UI_V4_SYMBOL_SEARCH_20260823`; backend giữ
  `LIQUID_FLOW_V2_BINANCE_STATS_V3_REALTIME_20260822`. Input/gate trước entry không đổi; ô `TÌM ALTCOIN` chỉ lọc client-side các row đã xác nhận
  fill mà API trả về sau datepicker/label. Nhập `POL`, `POLUSDT` hoặc symbol có dấu phân cách đều được normalize uppercase và đối chiếu contains.
- Search reset pagination về trang 1, page info hiện số row khớp trên tổng số row; position socket tiếp tục mutate dataset gốc rồi render tập đang tìm.
  Summary và group giữ toàn bộ date/label set, nên W/L/WR/PF/Net/AvgROE không đổi.
- Không thêm label/card/WHITELIST, không đổi Binance entry/side/size/leverage/SL/TP/protection và không gọi thêm Binance REST. JSON/schema giữ nguyên,
  không migrate/rewrite lịch sử; đây chỉ là thay đổi HTML/CSS/JS của màn reporting.

### 2026-08-23 - CoinGlass qualified có heatmap 12h/24h riêng trong Discord

- Versions `COINGLASS_WEB_QUALIFIED_BINANCE_V14_QUALIFIED_12H24H_20260823`,
  `COINGLASS_WEB_QUALIFIED_TIMEFRAMES_V1_12H_24H_20260823` và `COINGLASS_WEB_DISCORD_BINANCE_V9_QUALIFIED_12H24H_20260823`.
  Classifier/entry tiếp tục chỉ dùng exact 48h causal structured state; 12h/24h được crawl sau khi row fresh đã qualified, không dùng ảnh/crop
  và không hồi tố quyết định.
- Main scan 40 coin chạy trước. Trong budget 150 giây còn lại, bốn page mở lại exact qualified symbol, chọn UI `12 hour` và `24 hour`,
  xác nhận đúng response range/symbol rồi lấy từng React state độc lập. Discord qualified thêm hai field, mỗi field có upper/lower range,
  distance/strength/reference. Thiếu budget/range chỉ báo unavailable; không fallback dữ liệu phụ cũ và không chặn alert/order.
- Stats chỉ thêm telemetry requested/complete/failed, không thay W/L/WR/PF/Net/AvgROE. Không thêm label/card/WHITELIST key; default-off và
  CLOSED AvgROE `>4%` giữ nguyên. Không đổi Binance entry/side/margin/leverage/TP 48h/SL/protection/reversal/dedupe; hai timeframe chỉ là
  context Discord. JSON additive optional, không migrate/rewrite lịch sử; V13 fail-closed tới V14 fresh.

### 2026-08-23 - CoinGlass gửi một đánh giá hai vùng sau mỗi scan

- Versions `COINGLASS_WEB_QUALIFIED_BINANCE_V13_ZONE_EVAL_20260823`,
  `COINGLASS_WEB_DISCORD_BINANCE_V8_TWO_SIDED_ZONES_20260823` và
  `COINGLASS_WEB_TWO_SIDED_ZONE_EVAL_V1_20260823`. Input causal là exact Binance mover/liquidity snapshot cùng CoinGlass Model 3 48h
  structured cells/zones; ảnh/crop và outcome tương lai không được dùng.
- Local peak được mở thành `bandLow/bandHigh` bằng tối đa năm bin liền kề với intensity floor `28%` peak, một weak-bin bridge và clamp đúng phía giá tham chiếu.
  Candidate evaluation chỉ cần fresh `OK`, không stale, có cả upper/lower trong `±20%`; không cần pass qualified/direction/R:R/full liquidity.
  Alt mover có two-sided score cao nhất được chọn, fallback BTC; mỗi scan hoàn tất gửi đúng một embed tím tới webhook riêng, còn auth/no-data
  gửi embed cam. Payload có giá, hai range, distance/strength/persistence và link CoinGlass/Binance.
- Qualified embed xanh/đỏ cũng có hai vùng, nhưng gate/order route giữ nguyên. Evaluation message là observe-only, không tạo paper/Binance,
  không đổi entry/size/leverage/SL/TP, dedupe, reversal hay profit-lock; lỗi notifier riêng không chặn executor.
- Stats chỉ có telemetry in-memory thời điểm/symbol gửi gần nhất; không tính W/L/WR/PF/Net/AvgROE. Không thêm label/card/WHITELIST key;
  default-off và điều kiện CLOSED AvgROE `>4%` giữ nguyên. `bandLow/bandHigh` optional cho JSON cũ; V12 fail-closed tới snapshot V13 fresh,
  không migrate/rewrite lịch sử. Secret chỉ lưu `.env`, `.env.example` để trống.

### 2026-08-22 - Hot paper cache, bỏ read/parse file lớn lặp lại

- Versions `EDGE_PAPER_STORE_CACHE_V1_20260822`, `BR_LIKE_LIMIT_STORE_CACHE_V1_20260822`, `SHAKEOUT_PAPER_STORE_CACHE_V1_20260822`. Causal input/classification trước entry, label/tier/gate và paper lifecycle giữ nguyên. Runtime load các store khoảng `240/11/48 MB` một lần qua shared promise/cache thay vì ticker/hot path đọc + parse lại file.
- Stats dùng đúng cùng rows/công thức cũ; mutation exact id cập nhật đúng cache rồi atomic-write theo lock. Không thêm label/card/WHITELIST, không đổi Binance/entry/size/SL/TP, không biến cache thành gate.
- SSE helper return trước `JSON.stringify` nếu client set rỗng; client đang kết nối vẫn nhận cùng payload/realtime flow như cũ.
- BR-like và EMA breakout cluster/breadth/positive-cut tái sử dụng active EMA index thay vì filter toàn hot pump store; exact OPEN/source/side predicate và cut rules giữ nguyên.
- JSON compatibility nguyên trạng: file `trades[]` không đổi schema, không migrate/rewrite lịch sử. Restart vẫn đọc file; entry journal/recovery giữ nguyên.

### 2026-08-22 - Pump paper WAL streaming + hot-store checkpoint

- Version `PUMP_PAPER_WAL_COMPACT_STREAM_V3_20260822`. Dữ liệu causal trước entry và cách phân loại signal không đổi. Bottleneck được đo trước sửa: `pump-paper-trades.json` khoảng `458 MB`, WAL khoảng `1,4 GB`; nạp WAL nguyên khối gây `Invalid string length`, Node heap gần `9 GB` và event-loop p95 trên `2 giây`; sample trade có 325 top-level field nhưng đa số null. Runtime mới dùng stream/readline, giới hạn map ID mới ngay trong replay, bỏ nullish field khi persist và giữ semantics UPSERT/DELETE/duplicate legacy cũ.
- Sau replay, snapshot được ghi stream qua temp + atomic rename; WAL chỉ xoay sau khi snapshot đã publish. Hot store giữ toàn bộ active cùng CLOSED mới nhất trong quota `PUMP_PAPER_MAX_ACTIVE_ROWS=1.000`; overflow ghi batch vào archive NDJSON trước checkpoint. Dòng WAL cuối corrupt/truncated vẫn skip như trước; archive là audit/offline, không nạp vào live stats.
- Stats/WHITELIST: live W/L, WR, PF, Net PnL, AvgROE chỉ chạy trên hot store để giới hạn heap; không thêm label/card/key/checkbox, default-off và policy CLOSED AvgROE `>4%` giữ nguyên. Binance/entry/size/SL/TP không đổi; không sửa quyền lệnh thật, position, protection hay dedupe.
- JSON compatibility: giữ schema snapshot `trades[]`, WAL NDJSON V1 và value của object trade cũ; chỉ top-level field optional `null`/`undefined` không còn được ghi ra đĩa và reader vốn đã dùng fallback khi thiếu field. Overflow snapshot được archive theo trade, còn WAL nguyên bản được atomic-rename thành `pump-paper-trades-wal-*.ndjson` trước khi tạo journal rỗng. Crash giữa archive/snapshot/WAL-rotate có thể tạo archive duplicate nhưng không mất mutation và replay UPSERT theo id không nhân đôi hot record mới.

### 2026-08-22 - CoinGlass low-render giữ 40 coin / 3 phút

- Collector/runtime lên `COINGLASS_WEB_QUALIFIED_BINANCE_V12_LOW_RENDER_20260822`; proposal/executor/Discord không đổi. Causal input trước entry vẫn là Binance app-style mover + liquidity metrics và exact CoinGlass Model 3 48h structured React cells/zones; ảnh/canvas không tham gia classifier.
- Classification giữ toàn bộ qualified/action/Entry/TP/proposal SL/R:R/fresh/auth/liquidity gates. Runtime chuyển collector sang headless, giữ viewport tương thích `1280x900`, tắt GPU/SwiftShader, bỏ tải image/media/font, mặc định không screenshot, ẩn canvas sau khi lấy structured state, giới hạn disk/media cache `50/10 MB` và cache React fiber locator theo page. Response listener được mark handled ngay để timeout symbol được worker ghi failure thay vì tạo unhandled rejection làm chết collector. Vẫn concurrency 4, 40 coin, budget 150 giây và lịch 180 giây; cửa sổ login riêng vẫn headed.
- Stats/WHITELIST không đổi: CoinGlass LONG/SHORT tiếp tục đối soát fill/Position/Income; W/L/WR/PF/Net/AvgROE và policy whitelist default-off/closed AvgROE `>4%` giữ nguyên. Không thêm label/card/key.
- Không ảnh hưởng Binance entry, margin `$2 x5` mặc định/per-label override, SL `-20% ROE`, TP proposal, reversal, dedupe hoặc profit-lock. JSON cũ không migrate/rewrite/replay; V11 fail-closed đến fresh V12, `imageUrl` optional và PNG cũ không được dùng làm tín hiệu.

### 2026-08-22 - Bảng chi tiết V2 Binance chuyển sang realtime socket

- Version `LIQUID_FLOW_V2_BINANCE_STATS_V3_REALTIME_20260822`. Không đổi causal data/classifier trước entry: chỉ các execution Liquid V2/CoinGlass đã xác nhận Binance fill mới vào report; stats realtime không tham gia gate hoặc tạo signal.
- Thống kê full vẫn dùng exact Position cho OPEN và Binance Income lifecycle window cho CLOSED. UI nối authenticated `/api/positions/stream`: tick position cập nhật mark/uPnL/ROE và diagnosis đang lãi/lỗ/hòa vốn; fill/close/lifecycle event chạy lại reconciliation, fallback 30 giây chỉ bật khi socket mất. W/L/WR/PF chỉ dùng CLOSED PnL known; OPEN chỉ đóng góp Unrealized/Net/AvgROE.
- Không thêm label/card/reporting matcher/WHITELIST checkbox; policy default-off và điều kiện hiển thị CLOSED AvgROE `>4%` giữ nguyên. Không ảnh hưởng Binance entry/side/size/margin/leverage/SL/TP/profit-lock/dedupe và không gửi lệnh từ stats.
- JSON cũ không migrate/rewrite/replay. Response chỉ thêm `generatedAt`/`realtimePolicy`, còn `liveUpdatedAt` tồn tại ở bộ nhớ trình duyệt; reader cũ bỏ qua được.

### 2026-08-21 - Per-label Binance enabled/margin ngay trên từng dòng Stats

- Version `LIQUID_FLOW_V2_BINANCE_SIGNAL_SETTINGS_V1_20260821`; CoinGlass executor V4 và Discord V7 giữ runtime display. Bảng `Theo loại tín hiệu` thêm cột control cho từng exact reporting/signal key, với checkbox, input margin và nút lưu riêng. API GET/POST yêu cầu Binance session.
- Causal data/classification: override được đọc theo exact label sau classifier và trước claim/place; không dùng stats/outcome làm gate. Liquid V2 dùng đúng profile/route hiện hữu; CoinGlass LONG và SHORT map riêng rồi vẫn chạy toàn bộ qualified/Mark/protection/reversal guard. Unsupported stats row không được tự cấp route.
- Stats/WHITELIST: chỉ thêm control UI; W/L/WR/PF/Net/AvgROE/date filter và đối soát Binance không đổi. Không thêm label/card/WHITELIST key; policy whitelist hiện hữu giữ nguyên.
- Binance/entry/size/SL/TP: enabled và margin `0.01..10000` tác động duy nhất lệnh mới của label tương ứng. Default hiển thị lấy từ runtime profile hiện tại; global Orders/dry-run tiếp tục chặn cao hơn. Không đổi leverage, entry, TP, SL, fill-anchor, profit-lock, dedupe hoặc position đang mở.
- JSON compatibility: additive map `data/liquid-flow-v2-binance-signal-settings.json`; missing/bad file hoặc key dùng default profile. Không migrate/rewrite/replay các store cũ. Bản control CoinGlass chung thử trước đó đã được loại bỏ, không có global override còn hiệu lực.

### 2026-08-20 - CoinGlass Qualified giảm size Binance từ `$5` xuống `$2`

- Versions: executor `COINGLASS_WEB_BINANCE_MARKET_V3_2USDT_SL20ROE_20260820`, Discord `COINGLASS_WEB_DISCORD_BINANCE_V6_2USDT_SL20ROE_20260820`; collector `COINGLASS_WEB_QUALIFIED_BINANCE_V11_20260820`, proposal V2 và auto policy V16 giữ nguyên. Dữ liệu causal/điều kiện phân loại trước entry không đổi: exact qualified LONG/SHORT, setup fresh/complete, Mark Binance `> proposedEntry`, protection còn hợp lệ và profitable-opposite reversal.
- Thống kê: tiếp tục gom fill thật vào `COINGLASS_QUALIFIED_LONG`/`COINGLASS_QUALIFIED_SHORT`, OPEN dùng Binance Position và CLOSED dùng Binance Income để tính W/L, WR, PF, Net PnL, AvgROE. Không thêm label/card/WHITELIST; size không được dùng làm gate thống kê.
- Ảnh hưởng Binance/entry/size/SL/TP: lệnh mới dùng MARKET margin mặc định `$2 x5` (notional `$10`) thay cho `$5 x5`; TP proposal, SL `-20% ROE`, fill-anchor, profit-lock, dedupe 4h và mọi fail-closed guard giữ nguyên. Không resize vị thế đang mở hoặc sửa TP/SL đã đặt.
- JSON cũ: không migrate/rewrite/replay. Audit cũ giữ margin lịch sử `$5`, audit mới ghi `$2`; field hiện hữu nên reader cũ vẫn tương thích. `COINGLASS_WEB_BINANCE_MARGIN_USDT` tiếp tục override default khi được cấu hình rõ.

### 2026-08-20 - CoinGlass Qualified xuất hiện trong V2 Binance Signal Stats

- Version `LIQUID_FLOW_V2_BINANCE_STATS_V2_COINGLASS_20260820`; reporting groups `COINGLASS_QUALIFIED_LONG` và `COINGLASS_QUALIFIED_SHORT` được nhập vào cùng datepicker/filter/table hiện hữu. Đây không phải label/card classifier mới và không cấp route giao dịch.
- Causal inclusion: durable CoinGlass submitted audit phải có `orderId`; backend signed-query order và chỉ thống kê Binance `FILLED + executedQty>0`, với exact CoinGlass tracking/orderId làm fallback khi REST tạm lỗi. WAIT/BLOCKED/ERROR/unconfirmed SUBMITTED bị loại. OPEN dùng exact active position uPnL; CLOSED chỉ dùng Binance Income trong lifecycle window, cộng fee/funding, không dùng paper/proposal PnL.
- Stats: W/L/WR/PF/Net PnL/AvgROE và Bangkok from/to filter dùng chung pipeline V2. Reporting key không nối WHITELIST vì không phải tín hiệu/card mới; whitelist runtime/UI hiện hữu vẫn default off, chỉ hiện theo CLOSED paper AvgROE `>4%`, và CoinGlass explicit route không được cấp quyền từ thống kê này.
- Không ảnh hưởng Binance/entry/size/SL/TP: chỉ signed-read khi mở trang; giữ CoinGlass MARKET `$5 x5`, profitable reversal, TP proposal, SL `-20% ROE` và profit-lock. Audit `marginUsdt`/`binanceEntryPrice`/`filledAt` là optional additive; JSON cũ không migrate/rewrite, orderId cũ được verify tại thời điểm xem.

### 2026-08-20 - Sửa Binance profit-lock không replace được SL `GTE_GTC`

- Version `BINANCE_PROFIT_LOCK_V13_GTE_REPLACE_ROLLBACK_20260820`. Dữ liệu trước quyết định vẫn là active Binance position, average entry, leverage, mark/uPnL causal, lifecycle/source và open regular/algo orders; không dùng future candle, outcome hoặc paper stats.
- Phân loại/ladder không đổi: manual và Liquid Flow V2 `ROE 10..14,99 -> lock +1`, `15 -> +5`, `20 -> +10`, `25 -> +15`; Orders `Cap TSL` chỉ khóa tối đa `+1%`; non-V2 giữ env/resolver hiện hành. Log REDUSDT xác nhận V12 đã trigger nhưng Binance trả `An open stop or take profit order with GTE and closePosition in the direction is existing` vì code place-new-before-cancel-old.
- Thực thi V13: nhận diện đúng close-side STOP, hủy SL cũ trước, đặt STOP lock mới, rồi re-read algo orders nếu response lỗi/timeout. Nếu target chưa có, bot restore SL cũ ngay; không đụng TP/entry order. Điều này chỉ sửa SL thật sau entry, không đổi entry, side, margin/size, leverage, TP, signal, label, tier, stats hoặc whitelist.
- Stats/WHITELIST/JSON: không thêm cohort/card/key/checkbox; W/L/WR/PF/Net/AvgROE và policy default-off/closed AvgROE `>4%` không đổi. Audit/version profit-lock tiếp tục optional; JSON cũ không migrate/rewrite và vị thế chưa đạt ngưỡng không bị sửa SL.

### 2026-08-20 - CoinGlass Qualified Setups auto Binance `$5 x5`

- Versions: collector `COINGLASS_WEB_QUALIFIED_BINANCE_V11_20260820`, executor `COINGLASS_WEB_BINANCE_MARKET_V2_5USDT_SL20ROE_20260820`, Discord `COINGLASS_WEB_DISCORD_BINANCE_V5_SL20ROE_20260820`, auto policy `LIVE_CARD_LIQ_FLOW_COINGLASS_V16_20260820`; proposal V2 không đổi. `QUALIFIED_BINANCE_AUTO` chỉ cấp route cho fresh exact qualified LONG/SHORT; card không qualified vẫn observe-only.
- Causal data/classification: qualification giữ Binance public mover/volume/trades/OI/spread + CoinGlass structured 48h cells/zones và complete Entry/TP/SL/R:R plan. Proposal SL chỉ xác nhận plan CoinGlass đầy đủ; protection thật không lấy giá này. Preflight signed bổ sung Mark, exact-symbol positions/uPnL, open entry orders, position mode và filters ngay trước order. Không dùng future candle, outcome hoặc paper stats. Trigger là strict `Mark > proposed entry`; Mark phải chưa vượt proposal TP hoặc biên SL cố định `-20% ROE`, same-side position/entry order chặn.
- Profitable reversal: chỉ close exact-symbol opposite leg khi mọi leg có Binance `unRealizedProfit >0`; zero/negative/missing PnL fail-closed. Close MARKET reduce-only/positionSide, confirm hướng đối nghịch đã hết, cleanup protection cũ rồi re-read Mark và re-evaluate trước entry; close/recheck failure không mở mới.
- Entry/size/protection: MARKET margin `$5 x5` (notional `$25`), max 30 positions mặc định, durable dedupe 4h `symbol+side`; Orders/dry-run/credential/precision/min-notional/API guards giữ nguyên. TP giữ theo proposal; SL mặc định cố định `-20% ROE` (`4%` giá ở `5x`, LONG dưới fill/SHORT trên fill) và có env `COINGLASS_WEB_BINANCE_STOP_LOSS_ROE_PCT=20`. TP cùng SL đều re-anchor theo average fill; không hồi tố vị thế đang mở. Discord/UI hiển thị rõ SL effective, còn R:R ghi là R:R CoinGlass của proposal.
- Stats/WHITELIST: không tạo paper cohort, stats label/card/key hay checkbox; W/L/WR/PF/Net/AvgROE và policy whitelist default-off/closed AvgROE `>4%` hiện hữu không đổi. Đây là explicit CoinGlass route, không dùng stats hoặc live-card whitelist để cấp quyền.
- JSON compatibility: optional `binance-executions.json`, snapshot execution summary, `binanceEligible` và các audit additive `proposalStopLoss`/`stopLoss`/`stopLossRoePct`/`leverage`; record cũ có thể thiếu các field này. Không migrate/rewrite paper/signal/whitelist. V10 alt rows fail-closed khỏi exact V11 đến fresh crawl, submitted dedupe không replay sau restart.

### 2026-08-19 - Phục hồi live 5m cho `FADING_WAVE_LIVE_PUMP_SHORT_READY`

- Versions: managed stream `KLINE_CACHE_MANAGED_LIVE_GROUP_V1_20260819`, container `LIQUID_HEATMAP_FLOW_V2_FADING_WAVE_LIVE_RECOVERY_V24_20260819`; detector V1, paper V31 và Binance route `$1 x5` V1 giữ nguyên. Root cause là generic interval health có tick từ stream khác nên nhìn fresh trong khi Liquid V2 rows đều `NO_LIVE_CANDLE`.
- Causal data/classification: managed combined-stream riêng subscribe đúng top-liquidity/post-pump symbols và ghi actual Binance live-5m `x=false` OHLC/quote-volume/taker-buy vào cache per symbol; REST seed history dùng `subscribe:false` để không tạo subscription trùng. Detector vẫn fail-closed nếu thiếu live candle và giữ nguyên tất cả downtrend/pump/giveback/wick thresholds V1; không synthesize live volume, không dùng outcome/PnL/future data và không ảnh hưởng các label closed-candle.
- Telemetry/UI: API bổ sung optional `fadingWaveLiveVersion`, group status và coverage per-symbol `live/missing/ticked`; header hiển thị `live5m x/y`. Global `klineTelemetry.m5` vẫn dùng cho health chung nhưng không còn được xem là bằng chứng đủ cho FADING WAVE.
- Stats/WHITELIST: không thêm label/card/key; W/L, WR, PF, Net PnL, AvgROE vẫn chỉ từ CLOSED exact label. `heatmap-v2:FADING_WAVE_LIVE_PUMP_SHORT_READY` vẫn default off, matcher không đổi và checkbox chỉ hiện khi closed AvgROE `>4%`.
- Binance/entry/size/SL/TP: repair chỉ khôi phục đường dữ liệu nên signal thật mới có thể chạy lại. MARKET SHORT `$1 x5`, paper `$10 x5`, TP `+10% ROE`, SL `-20% ROE`, timeout 4h/fill anchor và mọi position/max-position/dedupe/preflight guard giữ nguyên; không sửa trade/vị thế cũ hay cohort khác.
- JSON compatibility: telemetry là API additive, không migrate/rewrite snapshot/paper/whitelist/execution JSON, không backfill/replay history; client/record cũ thiếu field tiếp tục hoạt động.

### 2026-08-18 - Liquid Flow V2 sóng tàn dựng nến pump live → SHORT Binance `$1 x5`

- Versions: detector `LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_V1_20260818`, container `LIQUID_HEATMAP_FLOW_V2_FADING_WAVE_LIVE_RECOVERY_V24_20260819`, paper `LIQUID_FLOW_V2_PAPER_V31_FADING_WAVE_LIVE_PUMP_BINANCE_20260818`, route `LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_BINANCE_V1_1USDT_20260818`, Discord `LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_DISCORD_V1_20260818`, auto policy `LIVE_CARD_LIQ_FLOW_COINGLASS_V16_20260820`, whitelist `LIVE_CARD_WHITELIST_V16_FADING_WAVE_LIVE_PUMP_20260818`.
- Causal pre-entry data/classification: top-150 Binance USDT perpetual quote-volume, minimum `$2M`, day change `<=+5%`, 110+ closed 5m candles plus current live 5m OHLC/quote-volume/taker-buy. Downtrend requires EMA13 `<` EMA25 `<` EMA99, EMA99 slope-12 `<=-0,15%`, closed return-12 `<=-1,5%`, 8/12 closes below EMA99, prior 48-bar peak aged `>=6` bars and drawdown to live open `>=3%`. Live pump requires high/open `>=4%`, mark/open `>=2%`, range/ATR `>=2,5x`, volume `>=1,8x`, taker `>=+8%`, EMA99 sweep `>=0,5%`, mark above EMA99, then giveback `0,6-6%` and upper wick `>=8%`. Không đọc future candle/outcome/PnL; full universe scan 15 giây và cached-row tick scan debounce dưới 1 giây.
- Exact classification `FADING_WAVE_LIVE_PUMP_SHORT_READY`, phase READY, executable và `affectsBinance=true`—không phải OBSERVE ONLY. Signal/dedupe timestamp là live candle open-time; restart chỉ seed nếu nến không quá 6 phút. Discord embed đỏ phát transition mới, chứa metric, entry/TP/SL và link Binance/Coinglass.
- Paper/Binance: paper SHORT immediate mark `$10 x5`, TP `+10% ROE`, SL `-20% ROE`, max hold 4h. Auto cohort `FADING_WAVE_LIVE_PUMP_SHORT` MARKET SHORT margin mặc định `$1 x5`; min-notional rounding có thể nhấc quantity/margin thực lên nhẹ. Protection re-anchor từ average fill, trong khi Orders/dry-run/existing-position/max-position/dedupe/preflight/API guards giữ nguyên. Không sửa trade đang mở, cohort khác hay công thức protection chung.
- Stats/WHITELIST: exact key `heatmap-v2:FADING_WAVE_LIVE_PUMP_SHORT_READY`, matcher UI/runtime khớp, default off; checkbox chỉ hiện khi CLOSED exact-label AvgROE `>4%`. W/L, WR, PF, Net PnL, AvgROE chỉ dùng CLOSED paper và không gate Binance.
- JSON compatibility: detector snapshot/timestamps, route settings và Binance audit metadata đều optional additive; runtime default store cũ về enabled/`$1 x5` nhưng không migrate/rewrite hoặc replay lịch sử. Record cũ thiếu field không match nhãn mới.

### 2026-08-18 - Liquid Flow V2 post-pump flagpole rút râu + kill SHORT

- Versions: `LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_V1_20260818`, container `LIQUID_HEATMAP_FLOW_V2_FLAGPOLE_SHORT_KILL_V22_20260818`, paper `LIQUID_FLOW_V2_PAPER_V30_FLAGPOLE_SHORT_KILL_PAPER_20260818`, Discord `LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_DISCORD_V1_20260818`, whitelist `LIVE_CARD_WHITELIST_V15_FLAGPOLE_SHORT_KILL_20260818`.
- Causal pre-entry data: top 150 Binance perpetual theo quote-volume với minimum `$2M`, day change `>=+5%`, closed-5m OHLC/volume/taker-buy/ATR và Binance force-order BUY hiện tại. Phải có prior pump `>=8%`, ít nhất 4 nến sau đỉnh và pullback `>=2,5%`; vì thế flat-base first pump bị loại. Flagpole cần local breakout `0,2%`, body `1,5%`, range `2,5%`, ATR `2,2x`, volume `2,5x`, taker `+8%`, close-position `72%`. Nến kế tiếp phải đóng rút râu dưới `20%`, giữ/reclaim thân và đỉnh cột cờ, volume `1x`, taker không âm. Force BUY kill SHORT cần recent USD `>=max(10K, 0,01% quote-volume)`, burst `>=1,5x`, socket OPEN; OI chỉ là confidence evidence.
- Classification exact `POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY`, phase READY, executable paper nhưng `affectsBinance=false`. Paper LONG immediate mark `$10 x5`, TP `+10% ROE`, SL `-20% ROE`, timeout 4h. Auto profile exact `FLAGPOLE_SHORT_KILL_PAPER` luôn `eligible=false` và label không vào auto-real allowlist; không đổi position thật, cohort khác hay protection hiện hữu. Discord transition mới có màu, entry/TP/SL paper, link Binance/Coinglass và dedupe 24h.
- Stats/WHITELIST exact key `heatmap-v2:POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY`: active gồm primary/secondary, kết quả chỉ CLOSED exact-label. Default off và checkbox chỉ hiện khi closed AvgROE `>4%`; không ghi key vào whitelist/real-enabled và checkbox không thể tự cấp Binance.
- JSON compatibility: feature/ready-time/short-force history/decay/peak/paper snapshot là optional additive; không migrate/rewrite JSON cũ và record thiếu field không match. First observation chỉ fire nếu signal candle không quá 15 phút, tránh replay sau restart.

### 2026-08-18 - Liquid Flow V2 kline freshness fail-closed + REST-reseed

- Versions: detector `LIQUID_HEATMAP_FLOW_V2_KLINE_FRESHNESS_V21_20260818`, gate `LIQUID_FLOW_V2_KLINE_FRESHNESS_GATE_V1_20260818`. Incident audit thấy 49/49 row giữ cache đủ bars nhưng 5m close-time stale khoảng 8-9 giờ; websocket pong cũ đã che việc stream không có market message.
- Causal pre-entry data giờ bắt buộc close-time 5m/15m/1h/4h của từng symbol còn trong ngưỡng 12/25/75/270 phút. Kline websocket đổi từ endpoint cũ mở được nhưng không phát kline sang `wss://fstream.binance.com/market/stream` (override `BINANCE_FSTREAM_MARKET_WS_BASE`). Cache stale dù đủ length vẫn phải REST seed/merge theo `openTime`; pong không còn reset data-health timer.
- Classification fail-closed: bất kỳ interval stale/missing đều trả exact `WAIT`, phase `WAIT`, `dataStale=true` và không phát READY. Recovery không replay READY nếu signal candle thiếu timestamp hoặc cũ quá 15 phút. Đây là gate thật trước paper/Discord/Binance; không phải một OBSERVE ONLY label.
- Auto REST-reseed mặc định bật, target symbol/interval stale. API/UI thêm optional `staleDataCount`, `dataFreshnessVersion`, `klineTelemetry`, `row.dataFreshness` và báo rõ KLINE STALE hay REST fallback.
- Stats/WHITELIST không đổi: stale row không tạo paper/stat CLOSED; không thêm label/card/key nên không thêm checkbox. Các checkbox hiện hữu vẫn default off và chỉ hiện khi CLOSED AvgROE `>4%`.
- Binance/entry/size/SL/TP: chỉ chặn entry mới khi dữ liệu stale; không tác động vị thế đã mở. Entry formula, margin, leverage, SL và TP của mọi label giữ nguyên. JSON cũ không migrate/rewrite; field freshness mới optional additive và lịch sử thiếu field vẫn đọc được.

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

- Version tuổi position `BINANCE_NEGATIVE_TP_TO_ENTRY_AFTER_8H_V1_20260816`; deep-loss hiện dùng V4 ở `<=-20% ROE` và rule 12h +1% dành cho trường hợp không bị rule âm ưu tiên.
- Snapshot causal chỉ gồm active position average entry/amount/side, Mark hoặc uPnL/margin để tính ROE hiện tại, `openedAt` từ fill tracking (fallback runtime first-seen), `Cap TSL`, rồi open TP orders + tick/lot metadata lúc write. Không dùng candle, outcome hoặc PnL tương lai.
- Match khi tuổi position `>=8h` và ROE realtime `<0`; ROE `>=0` không tác động, `Cap TSL` vẫn opt-out riêng cho nhánh tuổi. Bỏ fallback cũ âm liên tục 4h và không còn đọc `NEG_TP_TIMEOUT_MS`; deep-loss V4 `<=-20%` độc lập Cap TSL và có thể chạy sớm hơn. Env: `BINANCE_NEGATIVE_TP_AFTER_8H_ENABLED` và `BINANCE_NEGATIVE_TP_AFTER_8H_MS`.
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

### 2026-08-15 - Binance negative TP-to-entry (V4 cập nhật 2026-08-24)

- Version hiện tại `BINANCE_NEGATIVE_TP_TO_ENTRY_V4_CAP_TSL_INDEPENDENT_ROE20_20260824`; V3 loại trừ Cap TSL đã bị thay thế. Protection sau entry chỉ dùng average entry, mark/uPnL, margin/leverage và open close-orders hiện tại; không dùng future candle hoặc paper outcome.
- Bot, Liquid Flow V2 và lệnh tay pass tại Binance ROE `<= -20%` dù symbol có Cap TSL. Socket, scanner 90 giây và deep guard dùng chung policy; scanner start trước kline warm-up. Symbol + entry dedupe và cooldown 2 phút giữ idempotency.
- Khi pass, TP close-side xa entry bị hủy rồi thay bằng `LIMIT GTC reduceOnly` tại average entry; SL, entry, margin/size và leverage không đổi. Cap TSL tiếp tục chỉ quản lý profit-lock/trailing SL dương `10% -> +1%` tối đa và không còn chặn emergency TP-to-entry.
- Không thêm signal/label/card/stat cohort hay checkbox whitelist. Key/API/localStorage và optional `data/orders-cap-tsl.json` vẫn tương thích cho profit-lock; không migrate/rewrite trade JSON, còn runtime dedupe được phục hồi bằng cách đọc order Binance sau restart.

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

### 2026-08-17 - Chốt hard budget cho 40 CoinGlass movers dưới 3 phút

- Chốt collector `COINGLASS_WEB_HARD_3M_BUDGET_V10_20260817`, proposal `COINGLASS_WEB_ZONE_PROPOSAL_V2_20260817`
  và notifier `COINGLASS_WEB_DISCORD_LINKS_V3_20260817`; mode `OBSERVE_ONLY` giữ nguyên. Scheduler mặc định `180000ms`, scan limit 40,
  không chạy chồng khi lượt trước/login còn active.
- Mỗi lượt dùng snapshot Binance + CoinGlass causal hiện tại, crawl BTC và khoảng 39 top tăng/giảm xen kẽ. Khác V4, toàn bộ cohort được publish
  lên màn hình; row lỗi/stale/không đạt vẫn có card và reason, không bị ẩn. Audit 60 coin cho thấy sáu page mất `4m28s`/năm timeout,
  tám page mất khoảng `4m21s`/bảy timeout, còn mười page làm CoinGlass/UI quá tải. Theo ưu tiên mới của người dùng, V9 rollback về 40 coin
  và bốn page. Một lượt có hai React timeout vẫn mất `3m12s`, nên V10 thêm hard crawl budget `150s`, giảm React wait lỗi từ `30s` còn `12s`
  và chừa khoảng `30s` cho publish/Discord. Symbol chưa nhận khi hết budget được ghi `SCAN_BUDGET_EXHAUSTED`, giữ last-good/card lỗi và bị cấm Discord;
  mỗi page vẫn tuần tự riêng, delay `750ms`, progress ghi cả `currentSymbols/browserConcurrency/scanBudgetMs`
  và vẫn dùng một browser/login. Overlap scheduler tiếp tục fail-safe skip, không khởi chạy collector thứ hai.
- `qualified` chỉ true khi fresh `OK`, pass volume/trades/OI/spread, pass cell/peak/persistence, proposal directional LONG/SHORT và có plan đầy đủ.
  Entry là giá snapshot nhưng bắt buộc chờ reclaim/retest hoặc sweep-reject/breakdown-retest; TP1 lấy target zone, TP2 lấy zone xa hơn nếu có,
  SL lấy opposite invalidation zone. Chỉ gửi khi TP/SL đúng phía và R:R `>=1`. Discord V2 dùng embed xanh LONG/đỏ SHORT, hiển thị đầy đủ
  Entry/TP/SL/R:R/xác nhận/vô hiệu/liquidity. Discord V3 thêm link exact-symbol tới CoinGlass Model 3 và Binance Futures, title mở Binance;
  URL chỉ dựng sau allowlist symbol/base. Dedupe `V3:symbol:action` 30 phút, throttle/retry 429; balance/no-data/plan thiếu không gửi.
- Nếu persistent profile chưa login/không có quyền altcoin hoặc crawl trả login/permission error, gửi cảnh báo Discord `AUTH_REQUIRED`
  kèm link trang login, cooldown 60 phút. Notification state/dedupe lưu optional ở `data/coinglass-web-top20/notifications.json`.
- Không thêm label/tier/gate/card giao dịch/whitelist checkbox; thống kê chỉ scanned/qualified/top up-down/long-short cùng thời lượng/concurrency audit.
  Không ảnh hưởng Binance, entry, size, leverage, SL/TP, paper, scanner hoặc protection. Entry/TP/SL ở Discord chỉ là mức quan sát causal;
  không gọi order/protection API. Field V10/tradePlan/budget đều optional; JSON trước V10 chỉ giữ BTC
  fail-closed, không migrate/rewrite paper/signal/settings/outcome.

### 2026-08-30 - Áp strong-wave scalp/reversal cho cả CoinGlass top 1-40 và 41-80

- Nâng lifecycle/Binance lên V8 và thêm `COINGLASS_STRONG_WAVE_REVERSAL_V1_SHORT_5ROE_THEN_5M_RECLAIM_20260830` cho cả manager primary
  và secondary `COINGLASS_WEB_SECONDARY_STREAM_V3_RANK_41_80_STRONG_REVERSAL_1USDT_20260830`. Input SHORT vẫn causal từ CoinGlass
  edge zone/state + nến + 12h/24h + change24h; chỉ `ABOVE REJECTED SHORT` có
  `change24h >=10%` được phân loại `STRONG_UP_WAVE`.
- SHORT mới chốt toàn bộ ở `+5% ROE` (khoảng `-1%` giá tại `5x`), SL none. Margin SHORT giữ theo stream: primary cấu hình hiện tại,
  secondary `$1`. Vị thế/order/TP đã mở trước V8 được giữ nguyên, không sửa hồi tố.
- Chỉ sau khi SHORT đã flat và hết open order mới arm watch 6h. LONG `$1 x5` cần nến 5m đóng sau mốc flat quét/reclaim EMA13/25,
  râu dưới rõ, taker-buy >=52%, cấu trúc EMA 5m tăng và 15m còn trên EMA99; mark không được trượt quá 0,75% khỏi close xác nhận.
  TP LONG về vùng ABOVE reject gần nhất, tối thiểu `+1%` và cap `+3%` giá; SL none riêng nhánh này.
- State/dedupe hai cohort độc lập; Discord của mỗi stream chỉ báo khi reversal LONG submit. Không thêm label/card/stat cohort/WHITELIST mới;
  source vẫn `coinglass-zone-lifecycle`. JSON mới chỉ thêm field optional, state cũ mặc định watch rỗng và không backfill/replay.

### 2026-08-30 - Strong-wave SHORT primary $5 -> $3

- Nâng lifecycle/Binance lên V9; input causal và phân loại `ABOVE REJECTED + change24h >=10%` không đổi. Lệnh mới primary hạng 1-40 dùng
  margin `$3 x5`; secondary hạng 41-80 giữ test `$1 x5`. TP SHORT vẫn +5% ROE toàn phần, SL none; LONG reversal vẫn `$1`, không đổi TP/SL.
- Không sửa lệnh đang mở, không thêm label/card/stat/WHITELIST. `strongShortMarginUsdt` là field config optional; JSON cũ dùng default theo stream,
  không migrate, rewrite hoặc replay.

### 2026-08-30 - Sửa CYS không dời SL vì bị gắn fast-wave quá rộng

- Nâng profit-lock lên `BINANCE_PROFIT_LOCK_V15_FAST_WAVE_EXPLICIT_DCA_ONLY_20260830`. Bỏ `abs(change24h)>=10%` khỏi phân loại mặc định;
  fast-wave 30% chỉ còn explicit `ZKPUSDT,4USDT` hoặc DCA cùng chiều trong 15 phút. Có thể opt-in lại điều kiện change24h bằng env mới, mặc định false.
- CYS/manual và Liquid Flow V2 bình thường quay lại `ROE >=10% -> lock +1% ROE`. Không đổi entry/size/leverage/TP, không thêm signal/stat/whitelist,
  không migrate JSON; position đang mở nhận rule mới ở lần monitor kế tiếp.

### 2026-08-30 - Sửa AUCTION bị kẹt source CoinGlass sau khi đảo SHORT sang LONG

- Nâng profit-lock lên `BINANCE_PROFIT_LOCK_V16_SOURCE_SIDE_ALIGNED_20260830`, matcher
  `COINGLASS_ZONE_LIFECYCLE_POSITION_MATCH_V2_SIDE_ALIGNED_20260830`. Input trước entry không đổi; sau fill dùng source/side của plan và side/ROE
  Binance realtime để phân loại protection.
- Root cause tái hiện: AUCTION Zone Lifecycle SHORT đóng rồi LONG thủ công mở cùng symbol; source TP-only/no-SL cũ có thể thắng phân loại và làm handler
  return trước nhánh dời SL. Matcher mới yêu cầu plan `BUY/LONG` hoặc `SELL/SHORT` phải cùng chiều position; tracking fill mới lưu `signalSide`.
- Không đổi entry/size/leverage/TP, không thêm label/card/stat/WHITELIST. CoinGlass đúng lifecycle vẫn no-SL; manual/cap bình thường vẫn
  `ROE >=10% -> lock +1% ROE`. `signalSide` optional nên JSON cũ vẫn đọc được và không bị migrate/rewrite/backfill.

### 2026-08-30 - V17 sửa SHORT TP-only và DCA không dời SL

- Nâng profit-lock lên `BINANCE_PROFIT_LOCK_V17_SHORT_TP_ONLY_BREAK_EVEN_20260830`. Input trước entry/phân loại tín hiệu không đổi; sau fill dùng
  Position Risk/socket Binance realtime gồm side, amount, mark, leverage, ROE và entry bình quân hiện tại, cộng source/side tracking.
- SHORT bot/thủ công vẫn không đặt SL ban đầu. Khi `ROE >=10%`, đặt STOP tại entry bình quân (`lock 0% ROE`); ladder tiếp tục `15 -> +5`,
  `20 -> +10`. DCA không còn là fast-wave và không được phép đẩy ngưỡng lên 30%; bot tự dùng weighted entry mới. Ngoại lệ explicit chỉ còn
  `ZKPUSDT,4USDT` với `30 -> +5`. CoinGlass Zone Lifecycle đúng source/side giữ policy riêng, không bị rule này ghi đè.
- Không đổi entry/size/leverage/TP, không sửa lệnh âm hoặc lệnh đã đóng, không thêm label/card/stat/WHITELIST. JSON không có field bắt buộc mới;
  state DCA cũ chỉ ở RAM, profit-lock cũ tương thích và lần arm/move mới ghi V17, không migrate/rewrite/backfill lịch sử.

### 2026-08-31 - V18 nhận diện fast-wave theo nến, bỏ emergency MARKET-close

- Nâng profit-lock lên `BINANCE_PROFIT_LOCK_V18_CANDLE_VOLATILITY_NO_LATE_MARKET_CUT_20260831`, mark monitor lên
  `POSITION_MONITOR_PER_SYMBOL_MARK_STREAM_V5_PRICE_ROE_20260831`. Evidence thực tế: SKR 5m range `13,90%`; ZKC 5m `4,31%`, 15m `6,89%`;
  log SKR cho thấy nhánh late `SlTrailEmergency` đã MARKET-close nhiều lần sau khi wick đảo qua target.
- Input trước entry không đổi. Sau entry dùng tối đa ba nến 5m/hai nến 15m causal trong cache, entry bình quân, mark, leverage và side. Fast-wave khi
  range 5m `>=4%` hoặc 15m `>=6%`; 24h change không còn quyền phân loại, explicit ZKP/4 giữ nguyên. ROE socket được tính lại trực tiếp theo giá để
  tránh margin/upnl lệch khi fill/DCA dồn dập.
- Fast-wave vẫn `30 -> lock +5`, gap 25; coin bình thường vẫn SHORT TP-only `10 -> entry`. Nếu target đã bị xuyên hoặc STOP immediate-trigger,
  bot giữ position và retry, không MARKET-close muộn. Không đổi entry/size/leverage/TP, không thêm SL ban đầu, không sửa lệnh/outcome đã đóng.
- Không thêm label/card/stat/WHITELIST. JSON cũ tương thích, chỉ ghi V18 ở lần arm/move kế tiếp; không migrate/rewrite/backfill dữ liệu lịch sử.

### 2026-08-31 - EMA99 V2 pump-dump absorption, test Binance $1

- Thêm subtype `PUMP_DUMP_ABSORPTION` vào nhãn hiện hữu `ema99_kill_reclaim_long`, version
  `EMA99_KILL_RECLAIM_V2_PUMP_DUMP_ABSORPTION_20260831`. Detector chỉ dùng nến 5m đã đóng: spike phá đỉnh (`>=2,5%` hoặc `1,8 ATR`, vol `>=3x`),
  1-2 nến flush sâu `>=5%` về chân spike (vol `>=1,5x`), 2-6 nến hấp thụ không phá đáy và median vol `<=60%` flush, rồi nến xanh đóng vượt high
  trước/EMA99 với vol `>=1,5x`, RSI6 `>=38` đang tăng và không quá xa EMA99. Các pha chưa reclaim chỉ là WATCH, entry/SL/TP null.
- QUSDT fixture thật ngày 31/8 cho READY score `73/B`, entry `0,024519`, SL `0,0235444`, TP `0,025137`; test loại nến live và case tạo đáy mới.
  Lệnh mới chỉ MARKET LONG margin `$1 x10`, freshness 7 phút, chase `[-1%; +0,8%]`, pass BTC/liquidity/open-position/order/dedupe gate. SL dưới đáy
  flush `0,2 ATR`; TP về open spike, min `+0,6%`, cap `+3,5%`. WATCH không vào Binance; không replay tín hiệu lịch sử hoặc sửa lệnh đang mở.
- Entry policy V17 thêm authorization nội bộ, non-enumerable chỉ cho subtype READY để vượt `LIVE_CARD_ONLY`; generic EMA99, WATCH và payload HTTP
  không thể dùng quyền này.
- Không thêm label/card/cohort/WHITELIST: thống kê và matcher vẫn dùng `ema99_kill_reclaim_long`, policy checkbox mặc định OFF/chỉ hiện khi CLOSED
  AvgROE `>4%` không đổi. Field variant/version/factor mới optional, JSON cũ đọc bình thường, không migrate/rewrite/backfill; env mẫu mặc định false.

### 2026-08-31 - Liquid Flow V2 bỏ lịch sử paper khỏi realtime payload

- Thêm `LIQUID_FLOW_V2_PAPER_LIVE_SNAPSHOT_V1_ACTIVE_ONLY_20260831`: API board/SSE chỉ truyền paper OPEN/PENDING và summary; CLOSED/CANCELLED vẫn
  đầy đủ trong API thống kê phân trang theo ngày/nhãn. Route board trả cache ngay, refresh stale chạy nền; client bỏ render snapshot trùng.
- Không đổi dữ liệu causal, detector, classification, stats server, label/card/WHITELIST, Binance, entry, size, leverage, SL hoặc TP. Field compact mới
  optional; cấu trúc JSON cũ giữ nguyên, không migrate/rewrite/backfill dữ liệu giao dịch.
- Sửa nghẽn startup bằng `EDGE_PAPER_ENTRY_JOURNAL_STREAM_READER_V1_20260831`: đọc journal Edge Paper theo stream từng dòng, giữ nguyên cách chọn
  record mới nhất và recovery hiện hữu nhưng không còn tạo chuỗi/split toàn file hàng trăm MB. Đây chỉ là tối ưu persistence; không tác động tín hiệu,
  thống kê, WHITELIST hay bất kỳ order/entry/size/SL/TP Binance nào và tương thích nguyên trạng NDJSON cũ.
- API board không còn chờ scan đầu tiên: nếu cache chưa sẵn sàng, trả snapshot optional `initializing=true` ngay và chạy refresh nền; SSE thay bằng
  snapshot đầy đủ khi warm-up xong. Không thay đổi dữ liệu causal, quyết định giao dịch hoặc schema cache đầy đủ.
- Coalesce SSE UI bằng `LIQUID_FLOW_V2_SSE_COALESCE_V1_5S_20260831`: xử lý fast-scan/transition/paper/Binance/Discord vẫn tức thời trong backend;
  chỉ gom các lần gửi lại toàn bộ bảng thành snapshot mới nhất mỗi tối đa 5 giây để giảm JSON stringify, băng thông và DOM render. JSON thêm field optional
  `clientBroadcastVersion`; không đổi entry, size, leverage, SL, TP, stats, label/card hay WHITELIST.

### 2026-09-01 - `AGED_PUMP_FADE_REPUMP_SHORT_ALERT` gửi Discord riêng

- Thêm detector `LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_V1_20260901`, registry
  `LIQUID_HEATMAP_FLOW_V2_AGED_PUMP_FADE_REPUMP_V26_20260901` và Discord
  `LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_DISCORD_V1_20260901`. Nhãn exact `AGED_PUMP_FADE_REPUMP_SHORT_ALERT` là secondary READY màu cam nhưng
  `OBSERVE ONLY`, không được mô tả hoặc xử lý như gate giao dịch thật.
- Input causal chỉ gồm nến futures Binance 5m đã đóng: đỉnh/pump cũ đủ tuổi, drawdown/fade/lower-high, EMA13/25/99 bearish và slope EMA25; nến mới
  phải repump cao theo open/ATR, volume/taker lớn, quét local high/EMA25 rồi giveback + upper wick, vẫn dưới đỉnh cũ/EMA99. Scan xét hai nến đóng cuối
  để cảnh báo không bị bỏ lỡ. PROMUSDT lịch sử pass đúng các metric; fixture pump lần đầu và repump không rút đỉnh đều fail.
- Full scan và fast refresh cùng nối detector trong universe top-liquidity/post-pump tối đa rank 150. Transition mới tối đa 10 phút gửi webhook riêng,
  dedupe theo symbol/label/close-time, embed có metric và link Binance/CoinGlass. Không replay PROM lịch sử khi deploy.
- Stats/WHITELIST: thêm card exact label; key UI/runtime `heatmap-v2:AGED_PUMP_FADE_REPUMP_SHORT_ALERT`, mặc định tắt và không tồn tại trong persisted
  whitelist/real-enabled. Checkbox chỉ hiện khi có CLOSED exact-label AvgROE `>4%`; mặc định không có paper CLOSED vì nhãn không tạo paper.
- Binance/entry/size/SL/TP: không ảnh hưởng. Tất cả cờ affect là false; `buildLiquidFlowV2PaperPlan()` trả null và auto-Binance profile `eligible=false`.
  Không đặt entry/size/leverage/SL/TP, không sửa vị thế hoặc lệnh đang mở, không đổi logic của `FADING_WAVE_LIVE_PUMP_SHORT_READY` đang executable.
- JSON cũ tương thích: feature/classification/timestamp/metric mới đều optional additive; client cũ bỏ qua được. Không migrate/rewrite/backfill snapshot,
  paper, order, trade hay outcome lịch sử.

### 2026-09-01 - CoinGlass Zone Lifecycle primary cố định cấu hình size $2

- Bump lifecycle/Discord/executor lên `COINGLASS_ZONE_LIFECYCLE_V10_FIXED_2USDT_20260901`,
  `COINGLASS_ZONE_LIFECYCLE_DISCORD_V10_FIXED_2USDT_20260901` và
  `COINGLASS_ZONE_LIFECYCLE_BINANCE_V10_FIXED_2USDT_20260901`.
- Không đổi dữ liệu causal, state classification, qualified/lifecycle gate, 12h/24h agreement, strong-wave class, current mark/slippage, open
  position/order hoặc cách thống kê. Cả ba profile primary được đồng nhất: base `$2`, strong-wave SHORT `$2`, large-target LONG `$2`; 5x, MARKET,
  TP adaptive/partial, TP-only/no-SL và runner BE giữ nguyên. Secondary rank 41–80/reversal vẫn `$1`.
- Chỉ entry mới dùng margin `$2`; order/position đang mở không bị resize/close/sửa TP/SL. Không thêm card/stat/WHITELIST; audit cũ giữ margin lịch sử,
  audit mới snapshot `$2`. JSON V9 tương thích và không migrate/rewrite/backfill.

### 2026-09-01 - CoinGlass/Binance Hybrid Liquidity Hunter cho hai cụm hai phía

- Thêm detector `COINGLASS_HYBRID_LIQUIDITY_HUNTER_V1_TWO_SIDED_BINANCE_CONFIRM_20260901` và Discord
  `COINGLASS_HYBRID_LIQUIDITY_DISCORD_V1_OBSERVE_ONLY_20260901` cho cả rank 1–40 và 41–80. CoinGlass prefilter yêu cầu `>=2` active edge zone
  mỗi phía, cách `<=25%`, score ratio `<=3`; chỉ tối đa 8 candidate/stream mới tải cache Binance 5m/15m, bid/ask depth hiện có, OI và force-order.
- READY theo dữ liệu causal đã đóng: impulse thân `>=2%`, range `>=1,8 ATR`, vol `>=1,8x`, body retention `>=60%`, post-impulse hold `>=35%`,
  EMA 5m/15m + taker (UP `>=52%`, DOWN `<=48%`) + book không đối nghịch (bid share UP `>=45%`, DOWN `<=55%` nếu có) + OI xác nhận. Nhãn cảnh báo là `HYBRID_UPPER_FIRST_SHORT_SQUEEZE_READY`,
  `HYBRID_LOWER_FIRST_LONG_FLUSH_READY`, hoặc `HYBRID_TWO_SIDED_WHIPSAW_RISK_READY`; WATCH không gửi. Nến cache stale bị chặn.
- Discord riêng gửi cả cụm trên/dưới, score, Binance impulse/EMA/taker/OI/liquidation, target và link; dedupe 4 giờ, state tách theo stream và retry nếu
  webhook lỗi. Đây là **OBSERVE ONLY**: không paper/Binance/entry/size/leverage/SL/TP, không sửa vị thế/order đang mở.
- Không thêm card/stat/WHITELIST; policy checkbox mặc định OFF và CLOSED AvgROE `>4%` không đổi. State/field mới optional additive; JSON cũ đọc được,
  không migrate/rewrite/backfill/replay dữ liệu lịch sử.

### 2026-09-01 - Trang tra cứu hỗ trợ/kháng cự Coin Level Analysis V1

- Thêm `COIN_LEVEL_ANALYSIS_V1` tại `/coin-level-analysis`; người dùng nhập coin/USDT perpetual và nhận tối đa bốn vùng hỗ trợ/kháng cự, bias đa
  khung, nến live và kế hoạch LONG/SHORT có xác nhận. Input tại thời điểm tra cứu gồm public Binance mark/ticker/funding/OI/depth và 240 nến
  5m/15m/1h/4h; EMA/ATR/swing/trend chỉ dùng nến đóng, nến live chỉ để trình bày.
- Vùng được gom từ swing/range/EMA có trọng số theo khung và order-book bin 0,5% trọng số phụ, tolerance `max(0,4% giá; 0,28 ATR5m)`. Đề xuất
  bắt buộc nến 5m đóng + retest/reject; ở sát hỗ trợ không đuổi SHORT, ở sát kháng cự không đuổi LONG. Order book luôn có cảnh báo spoof/rút lệnh.
- Đây là **OBSERVE ONLY**: không tạo label/card/paper/stat/WHITELIST, không ảnh hưởng Binance/entry/size/leverage/SL/TP hoặc position/order đang mở.
  API mới độc lập, không sửa JSON/schema cũ và không migrate/rewrite/backfill lịch sử.

### 2026-09-01 - Coin Level Analysis chuyển xác nhận chính sang nến 15m

- Nâng lên `COIN_LEVEL_ANALYSIS_V2_15M_CONFIRM`: dữ liệu causal, vùng swing/range/EMA, ATR, depth và trend đa khung giữ nguyên; chỉ thay rule diễn giải
  xác nhận. Phá biên bằng close 5m là cảnh báo sớm `EARLY_5M_ONLY`; breakout/breakdown chỉ xác nhận khi nến 15m đã đóng ngoài vùng, rồi dùng 5m
  retest để tìm điểm vào tham khảo. Buffer vô hiệu lấy max của `0,35 ATR5m` và `0,18 ATR15m`.
- UI thêm trạng thái 15m rõ ràng và cả LONG/SHORT plan đều ghi `15m close → 5m retest`. Đây vẫn **OBSERVE ONLY**: không signal/paper/stats/card/
  WHITELIST và không tác động Binance/entry/size/leverage/SL/TP hay lệnh đang mở. `recommendation.confirmation` là field optional additive, JSON cũ
  không migrate/rewrite/backfill.

### 2026-09-01 - Coin Level Analysis ghép active zone CoinGlass

- Nâng trang/API lên `COIN_LEVEL_ANALYSIS_V3_COINGLASS_CONFLUENCE`, parser `COIN_LEVEL_COINGLASS_V1_ACTIVE_EDGE_20260901`. Mỗi symbol đối chiếu
  snapshot primary/secondary; chỉ nhận Model 3 edge zone còn sát mép phải (`edgeGap <=2`), cách mark `<=35%`, từ 48h và 12h/24h khi có. Lifecycle
  đúng stream được gắn vào vùng; data quá 20 phút hoặc coin ngoài Top 80/auth lỗi fail-closed, không dùng history cũ để dựng vùng.
- Attraction tối đa ba vùng gần mỗi phía được cộng theo frame để phân loại `UPPER_FIRST/LOWER_FIRST/BALANCED`, rồi đối chiếu Binance trend thành
  aligned/conflict. Đây chỉ là cảnh báo confluence; xác nhận hướng vẫn bắt buộc 15m close và 5m retest.
- Panel mới không phải label/card thống kê nên không paper/stats/WHITELIST. Luồng vẫn **OBSERVE ONLY**, không ảnh hưởng Binance/entry/size/leverage/
  SL/TP hoặc lệnh đang mở. Field `coinglass`/`recommendation.coinglassConfluence` optional additive, không migrate/rewrite/backfill JSON lịch sử.

### 2026-09-01 - Coin Level Analysis lifecycle-weighted attraction

- Nâng lên `COIN_LEVEL_ANALYSIS_V5_LIFECYCLE_WEIGHTED` + `COIN_LEVEL_COINGLASS_V3_REJECTED_REVERSE_PRESSURE_20260901`. Attraction effective dùng
  multiplier FRESH/APPROACHING/ACCEPTED/SWEPT/REJECTED/UNTRACKED lần lượt `1/1/0,7/0,25/0/1`; REJECTED chuyển `70%` raw score thành pressure
  phía ngược. Khi rejected chiếm `>=50%` raw score một phía và còn target phía kia, phát trạng thái diễn giải `UPPER_REJECTED_TO_LOWER` hoặc
  `LOWER_REJECTED_TO_UPPER`; nearest target hiệu dụng bỏ REJECTED, raw nearest giữ để audit. Close 15m + retest 5m vẫn là xác nhận bắt buộc.
- Đây là panel **OBSERVE ONLY**, không detector/signal/paper/stats/card/WHITELIST/Discord/Binance/entry/size/leverage/SL/TP và không sửa lệnh đang
  mở. Field weighting/lifecycleSignal/rawNearest là optional additive, không migrate/rewrite/backfill JSON cũ.

### 2026-09-01 - Discord cảnh báo Coin Level REJECTED + APPROACHING

- Thêm `COIN_LEVEL_LIFECYCLE_DISCORD_V1_REJECT_APPROACH_20260901`: cùng timeframe, upper REJECTED + lower APPROACHING gửi `SHORT WATCH`; chiều
  ngược lại gửi `LONG WATCH`. Chỉ data CoinGlass fresh; message gồm mark/bias, hai band, confirmation 15m và link, dedupe 4 giờ theo symbol/event/band.
- Đây là **OBSERVE ONLY**, không phải signal/tier/card, không paper/stats/WHITELIST và không tác động Binance/entry/size/leverage/SL/TP/lệnh đang
  mở. State dedupe/recent là file optional mới, không migrate/rewrite/backfill JSON lịch sử.

### 2026-09-01 - Coin Level Analysis cào 48h/12h/24h khi bấm Phân tích

- Nâng lên `COIN_LEVEL_ANALYSIS_V4_COINGLASS_ON_DEMAND` + `COIN_LEVEL_COINGLASS_V2_ON_DEMAND_12H24H_20260901`. Submit form gọi job
  `COIN_LEVEL_COINGLASS_ON_DEMAND_V1_20260901` cho đúng USDT perpetual; page load/refresh 20 giây không cào. Job dùng profile primary, dedupe theo
  symbol, cache 10 phút, chờ Top 40 hoàn tất và khóa scheduler khỏi dùng trùng profile; kết quả 48h/12h/24h lưu cache riêng, UI poll read-only.
- Active-edge/lifecycle/attraction/bias và xác nhận Binance 15m-close + 5m-retest giữ nguyên. Luồng **OBSERVE ONLY**, không Discord, signal, paper,
  stats/card/WHITELIST/Binance/entry/size/leverage/SL/TP và không sửa lệnh đang mở. Field `coinglass.refresh`/cache on-demand additive, fallback JSON
  primary/secondary cũ và không migrate/rewrite/backfill lịch sử.

### 2026-09-01 - Coin Level Analysis V6 chống `fetch aborted`

- Nâng lên `COIN_LEVEL_ANALYSIS_V6_RESILIENT_SNAPSHOT_20260901` + `COIN_LEVEL_DATA_FRESHNESS_V1_20260901`. Input causal vẫn là public Binance
  mark/ticker/funding/OI/depth, nến đóng 5m/15m/1h/4h và CoinGlass active edge/lifecycle 48h/12h/24h; không đổi EMA, vùng, xác nhận 15m, retest 5m,
  bias hay lifecycle score. Request độc lập dùng `allSettled`; nguồn phụ lỗi được ghi `LIVE_PARTIAL`, khung nến bắt buộc lỗi được retry một lần.
- Poll CoinGlass không còn gọi lại tám REST Binance và POST cào không xóa cache phân tích. Cache live là 30 giây; mỗi last-good được lưu atomic theo
  symbol trong `data/coin-level-analysis-cache`. Khi REST timeout/abort, API giữ nguyên `generatedAt`, trả `STALE_LAST_GOOD` cùng nguyên nhân để UI
  không trắng; Discord lifecycle không gửi từ snapshot Binance stale.
- Đây chỉ là độ bền snapshot **OBSERVE ONLY**: không đổi thống kê/label/tier/card/WHITELIST và không ảnh hưởng Binance, entry, margin, size, leverage,
  SL, TP, position hoặc order. Field/cache mới additive, JSON client cũ bỏ qua được; không migrate/rewrite/backfill/replay dữ liệu giao dịch cũ.

### 2026-09-01 - Coin Level cảnh báo reject lần hai để canh SHORT

- Nâng analysis/Discord lên `COIN_LEVEL_ANALYSIS_V7_SECOND_REJECTION_SHORT_20260901`,
  `COIN_LEVEL_SECOND_REJECTION_SHORT_V1_15M_COINGLASS_20260901` và
  `COIN_LEVEL_LIFECYCLE_DISCORD_V2_SECOND_REJECTION_SHORT_20260901`. Input causal là nến Binance 15m đã đóng, EMA13/ATR, volume/taker và active
  CoinGlass 48h/12h/24h; không dùng nến live hoặc dữ liệu stale.
- Detector tìm hai rejection high gần nhau trong 3–24 bars, có pullback giữa hai đỉnh; nến reject lần hai hoặc tối đa hai nến 15m kế tiếp phải đóng
  đỏ dưới EMA13/close trước, taker-buy không quá `50,5%` và volume không hụt dưới `0,8x` khi dữ liệu có. Event chỉ READY khi tổng hợp CoinGlass `ALIGNED_SHORT + LOWER_FIRST`, còn target
  dưới `>=1%`, risk `<=10%`, R:R `>=0,65`; nếu không chỉ hiện WATCH và không gửi.
- Discord dùng webhook Coin Level và dedupe 4 giờ; entry/TP1/TP2/invalidation đều ghi rõ là tham khảo. Luồng **OBSERVE ONLY**, không paper/stats/
  label-card/WHITELIST, không tự vào Binance và không đổi entry/size/leverage/SL/TP/lệnh đang mở. Field mới optional additive, JSON cũ không migrate,
  rewrite, backfill hoặc replay.

### 2026-09-01 - Coin Level thêm reject đáy lần hai để canh LONG

- Nâng analysis/detector/Discord lên `COIN_LEVEL_ANALYSIS_V8_TWO_SIDED_SECOND_REJECTION_20260901`,
  `COIN_LEVEL_SECOND_REJECTION_V2_TWO_SIDED_15M_COINGLASS_20260901` và
  `COIN_LEVEL_LIFECYCLE_DISCORD_V3_TWO_SIDED_SECOND_REJECTION_20260901`. Input causal là nến Binance 15m đã đóng, EMA13/ATR15m,
  quote volume/taker-buy và active CoinGlass 48h/12h/24h còn fresh; không dùng nến live hay outcome tương lai.
- Nhánh LONG tìm hai lower-wick rejection cùng đáy trong `3–24` bars, có nhịp bật giữa hai đáy `>=0,6 ATR`; nến lần hai hoặc tối đa hai nến đóng
  kế tiếp phải xanh trên EMA13/close trước, taker-buy `>=49,5%` và volume `>=0,8x` khi có dữ liệu. READY cần thêm `ALIGNED_LONG + UPPER_FIRST`,
  target trên `>=1%`, risk `<=10%`, R:R `>=0,65`; thiếu điều kiện là WATCH và không Discord.
- Discord dùng webhook Coin Level, embed xanh và dedupe 4 giờ; page hiển thị card LONG riêng bên cạnh logic SHORT. Event vẫn **OBSERVE ONLY**,
  không paper/stats/label-card/WHITELIST và không tự vào Binance hoặc thay entry, margin, size, leverage, SL, TP/lệnh đang mở.
- JSON chỉ thêm `secondRejectionLong` optional ở recommendation/combined; SHORT và state V1/V2 cũ vẫn đọc được, không migrate/rewrite/backfill/replay.

### 2026-09-02 - Trang Coin Level nhận mã coin Unicode của Binance

- Nâng lên `COIN_LEVEL_ANALYSIS_V9_UNICODE_SYMBOL_INPUT_20260902` và
  `COIN_LEVEL_COINGLASS_ON_DEMAND_V2_UNICODE_SYMBOL_20260902`. Form, API và collector on-demand chấp nhận chữ/số Unicode sau normalize `NFKC`,
  bỏ `#/$` đầu dòng và separator, nhưng vẫn exact-match USDT perpetual `TRADING` trong exchange info Binance.
- Các mã như `龙虾USDT` nay tải được Binance 5m/15m/1h/4h và có thể cào CoinGlass 48h/12h/24h khi bấm **Phân tích**. Scheduler top 1–80 giữ
  whitelist ASCII cũ nên không đổi universe auto signal/Binance.
- Đây là thay đổi input **OBSERVE ONLY**: không signal/label/tier/paper/stats/card/WHITELIST, không tác động entry/size/leverage/SL/TP/lệnh đang mở.
  JSON schema cũ tương thích; cache Unicode chỉ là file additive an toàn, không migrate/rewrite/backfill/replay dữ liệu lịch sử.

### 2026-09-05 - Tắt TP/chốt vị thế tự động sau 12 giờ

- Version `BINANCE_TP_AFTER_12H_DISABLED_V2_20260905`; `BINANCE_TP_AFTER_12H_ENABLED=false` trong runtime và file mẫu. Server đổi sang explicit opt-in,
  nên thiếu env cũng không chạy lại rule sau restart.
- Không còn dùng tuổi position + entry/side/leverage/Mark/ROE để hủy TP cũ, đặt TP `+1% ROE` hoặc gửi marketable reduce-only LIMIT đóng vị thế đã
  lời sau 12 giờ. Không đổi signal/label/tier/gate/stats hoặc WHITELIST.
- Tác động Binance chỉ áp cho quyết định tương lai sau reload; không sửa order/position hiện hữu và không hồi phục vị thế đã đóng. Rule âm 8 giờ về
  entry, deep-loss/profit-lock và entry LIMIT độc lập hết hạn 12 giờ vẫn chạy như cũ.
- JSON/audit `twelveHourTakeProfit*` cũ giữ nguyên và optional; không migrate/rewrite/backfill lịch sử, không thêm schema bắt buộc.

### 2026-09-05 - Nhật ký vòng đời mọi lệnh Binance thật: FILLED đến CLOSED/PnL

- Thêm `BINANCE_SIGNAL_LIFECYCLE_AUDIT_V2_ALL_REAL_FILLS_AND_CLOSE_PNL_20260905`. Context trước entry gồm source/type/label/reason/combo,
  matcher, page/stream, side, entry/TP/SL, margin/leverage; chỉ order mở/tăng vị thế đã `FILLED` mới gửi Discord entry và ghi CSV. Reduce-only,
  closePosition, TP/SL và partial fill không đi vào kênh entry.
- Position close chỉ ghi sau Position Risk xác nhận side đã đóng; lấy user trades/income trong đúng lifecycle để tính gross realized PnL trừ
  commission và cộng/trừ funding thành net PnL/ROE/outcome. DCA cùng lifecycle được phân bổ PnL theo notional, giữ tổng thống kê không nhân đôi. Webhook close luôn mang tên loại
  signal entry gốc, reason vào, close order/type/reason và kết quả thực; `close_group_id` là khóa group W/L cho thống kê sau này.
- CSV chung nằm tại `data/binance-filled-signal-audit/binance-filled-signals.csv`, tải local qua `/api/binance-filled-signal-audit.csv`; state JSON
  mới optional, dedupe theo orderId/clientOrderId và tương thích record V1 thiếu close field. Không backfill lệnh cũ và không đổi JSON
  paper/signal/protection hiện hữu.
- Đây chỉ là audit/telemetry: không đổi rule pass, label/tier/gate, thống kê card hiện hữu, Binance entry/size/leverage/SL/TP/close hoặc WHITELIST;
  không có checkbox mới vì không thêm signal/card runtime.
### 2026-09-05 - ROE âm 20% bỏ qua FastWaveRecovery, TP về entry ngay

- Nâng deep-loss lên `BINANCE_NEGATIVE_TP_TO_ENTRY_V6_ROE20_OVERRIDES_FAST_WAVE_20260905`, đồng thời nâng startup guard lên `BINANCE_TP_ONLY_GUARD_V3_BREAK_EVEN_LIMIT_AWARE_20260905`. Input causal là active Binance position, average entry, side/quantity, leverage và Mark/uPnL/margin để tính ROE; không dùng outcome tương lai. Nến 5m/15m không còn quyền trì hoãn nhánh deep-loss.
- Khi `ROE <= NEG_TP_ROE` (mặc định `-20%`), trạng thái FastWaveRecovery `ARMED/LOCKED`, `CANDLE_DATA_PENDING`, râu và body reversal đều bị override. Bot chạy pipeline TP-to-entry idempotent ngay; trên ngưỡng này các rule FastWaveRecovery/âm 8 giờ giữ hành vi cũ.
- Thống kê/WHITELIST không đổi: không có signal/label/tier/card/cohort mới, không đổi W/L, WR, PF, AvgROE hoặc Net PnL và không thêm checkbox. Default-off cùng điều kiện CLOSED AvgROE `>4%` của whitelist hiện hữu được giữ nguyên.
- Binance: không đổi entry, direction, margin/size, leverage hoặc SL; có thể cancel TP close-side xa và đặt full close LIMIT GTC tại average entry cho cả position đang mở lẫn position mới khi chạm `<=-20%`. Startup TP guard coi đúng full-size reduce-only LIMIT gần entry là TP bảo vệ nên không tạo TP signal trùng; deep-loss scanner vẫn dọn các TP xa còn sót. Không MARKET-close lúc âm.
- JSON cũ tương thích: field FastWaveRecovery V1 vẫn optional và được đọc nhưng không chặn deep-loss; không migrate/rewrite/backfill history, paper, signal hoặc trade. Open-order check và symbol+entry dedupe tiếp tục chống đặt trùng.
### 2026-09-05 - LiqScan nổi bật trên Coin Level Analysis

- Thêm `LIQ_SCAN_SNAPSHOT_V1_COIN_LEVEL_HIGHLIGHT_20260905` và store `LIQ_SCAN_LATEST_ALERTS_STORE_V1_20260905`. Input causal là public Binance mark/change24h cùng nến 15m của KlineCache; dùng lại `computeHeatmapData` và đúng công thức scanner Discord để snapshot trên trang không lệch log. CoinGlass 48h/12h/24h/lifecycle tiếp tục hiển thị độc lập.
- Alert khi `|bias| >=0,4` (hoặc env hiện hành) hay một phía còn dưới 12% tổng liquidity; xác suất quét ghép 60% bias và 40% dominance, cap 99%. `/coin-level-analysis` thêm callout màu nổi bật gồm giờ alert, above/below, probability, dominant side, mark, target và main/far kill zone; current evaluation cho biết alert lịch sử còn pass, latest alert lưu 24 giờ và gắn stale sau 2 giờ.
- Đây là telemetry `OBSERVE ONLY`, không phải nhãn/tier/card thống kê và không tạo W/L, WR, PF, AvgROE, Net PnL hay checkbox WHITELIST. Không đổi gate, Binance entry/side/margin/size/leverage/SL/TP, position hoặc order; không có executor mới.
- JSON chỉ thêm `liqScan.current` và `liqScan.lastAlert` optional; client/snapshot cũ thiếu field vẫn render fallback. Store latest-alert là file additive, không migrate/rewrite/backfill/replay signal, paper, trade hay outcome cũ.

### 2026-09-13 - Hybrid Liquidity Hunter directional MARKET $1 × 5, TP10

- Nâng detector lên `COINGLASS_HYBRID_LIQUIDITY_HUNTER_V2_DIRECTIONAL_BINANCE_READY_20260913`,
  Discord lên `COINGLASS_HYBRID_LIQUIDITY_DISCORD_V2_BINANCE_EXECUTION_20260913`, thêm
  executor `COINGLASS_HYBRID_LIQUIDITY_MARKET_1USDT_5X_TP10_V1_20260913` và policy
  V23. Input causal vẫn là CoinGlass active edge zones hai phía cộng nến Binance
  5m/15m đã đóng, EMA, impulse/retention, taker flow, book, OI và liquidation context;
  không dùng outcome tương lai.
- Chỉ `HYBRID_UPPER_FIRST_SHORT_SQUEEZE_READY` → LONG và
  `HYBRID_LOWER_FIRST_LONG_FLUSH_READY` → SHORT được entry. Whipsaw/no-direction vẫn
  OBSERVE ONLY. MARKET dùng margin 1 USDT, 5x, notional 5 USDT và TP +10% ROE từ
  full-fill; không có SL mới vì yêu cầu không chỉ định. Gate cần exact version/label/
  bias/side, nến sau enabledAt, tuổi tối đa 7 phút, mark drift tối đa 0,5%, không có
  position/entry order cùng coin, cooldown 4 giờ và durable claim trước submit.
- Auto Controls có bốn exact route primary/secondary × LONG/SHORT; route mới mặc định
  OFF trong code và đã bật theo yêu cầu hiện tại, master vẫn là khóa tổng. Discord ghi
  status Binance thật; webhook/dedupe Discord tách khỏi quyền executor. Fill/close audit
  và CSV hiện hữu thống kê entry thật/PnL net theo source+stream+label+side, không DCA.
- Không thêm label/card/cohort thống kê nên W/L, WR, PF, AvgROE và WHITELIST không đổi;
  không tạo checkbox WHITELIST mới, điều kiện CLOSED AvgROE `>4%` vẫn giữ. Ảnh hưởng
  Binance chỉ ở lệnh Hybrid mới, không chạm order/position/TP/SL cũ và không replay.
  JSON V2 chỉ thêm field eligibility/side/time xác nhận/execution; state runner và
  controls route mới additive, JSON V1 thiếu exact metadata bị fail closed.

### 2026-09-12 - Cảnh báo LONG sau cú sập sâu 1h/4h và đáy sideway

- Thêm `HTF_DEEP_DUMP_BASE_RECLAIM_V1_20260912`, Discord
  `HTF_DEEP_DUMP_BASE_15M_DISCORD_V1_20260912`, đồng thời nâng schema Liquid Flow lên
  `LIQUID_HEATMAP_FLOW_V2_HTF_DEEP_DUMP_BASE_V27_20260912`. Mọi phép tính chỉ nhìn nến
  1h/4h/15m đã đóng; fail-closed với nến live, gap hoặc dữ liệu stale.
- Shock cần giảm `>=max(5%, 2,5 ATR%)`, phá đáy 24 nến `>=3%` và đạt 2/3 của range
  `>=3 ATR`, quote volume `>=3x` median 48, lower wick `>=40%`. Nền 1h là `4–48` bars
  với range/shock `<=45%`; nền 4h là `2–12` bars với range/shock `<=80%`; volume nền
  không quá `70%` spike. `EXTREME` yêu cầu hai trong shock `12%`, range `8 ATR`, volume
  `10x`, break `10%`.
- `EARLY_WATCH`: nến 15m đã đóng reclaim neckline + EMA13 và volume `>=1,5x` median20.
  `RETEST_LONG_READY`: một nến 15m xanh sau WATCH trong tối đa 8 bars chạm/giữ neckline
  hoặc EMA13 và không phá đáy nền. Hai stage gửi webhook riêng, WATCH vàng/READY xanh,
  chỉ trong `16,5` phút; state atomic dedupe symbol + episode 4h + stage qua restart.
- Đây là **OBSERVE ONLY**: không Binance, không entry/size/margin/leverage/SL/TP/DCA/close.
  Không thêm label/card/paper/stats hay WHITELIST; policy default OFF và chỉ hiện khi
  CLOSED AvgROE `>4%` của các card hiện hữu không đổi.
- JSON chỉ thêm optional `features.htfDeepDumpBaseReclaim`; state Discord là file mới
  độc lập. Không backfill/replay/migrate/rewrite snapshot, signal, paper, trade, order,
  position hoặc outcome cũ.

### 2026-09-12 - Deep Dump Base quét độc lập tối đa 400 coin

- Thêm `HTF_DEEP_DUMP_BASE_UNIVERSE_V1_400_SYMBOLS_20260912`: lấy top 400 USDT
  perpetual theo quote volume từ shared snapshot, dedupe symbol và chạy detector riêng,
  không còn phụ thuộc số row Liquid Flow (thường 40–50 coin).
- Chỉ dùng cache nến đã đóng/fresh với ngưỡng 15m `30` bars, 1h `100`, 4h `65`;
  subscribe WebSocket cả ba khung và warm-up phần thiếu từng batch có rate gate để tránh
  burst/IP ban. Trạng thái coverage đọc tại `/api/htf-deep-dump-base-universe`.
- Điều kiện WATCH/READY, Discord màu/dedupe và schema feature giữ nguyên. Đây vẫn là
  **OBSERVE ONLY**, không label/card/paper/stats/WHITELIST/Binance/entry/size/SL/TP;
  policy default OFF và CLOSED AvgROE `>4%` của whitelist hiện hữu không đổi.
- Endpoint/module mới đều additive; JSON cũ bỏ qua được, không migrate/rewrite/backfill/
  replay dữ liệu giao dịch hay Discord state cũ.

### 2026-09-12 - Coin Horizon chỉ gửi khi state đổi sang QUÉT LÊN/XUỐNG

- Thêm `COIN_HORIZON_SWEEP_TRANSITION_DISCORD_V1_20260912`, dùng snapshot causal của
  `/coin-level-analysis`: mark, ATR/nến đóng 1h+4h, zone cấu trúc và CoinGlass mới. Stale
  hoặc 1h/4h/CoinGlass xung đột không được coi là hướng quét.
- State `UPPER` khi 1h+4h cùng UP, `LOWER` khi cùng DOWN, còn lại `NEUTRAL`. Lần đầu chỉ
  ghi baseline; chỉ transition từ state trước sang UPPER/LOWER mới gửi. NEUTRAL không
  gửi nhưng được lưu, state atomic chống lặp qua concurrent poll/restart và không commit
  transition khi Discord lỗi để cho phép retry.
- Embed xanh cho QUÉT LÊN, đỏ cho QUÉT XUỐNG, kèm ba cặp cận 4h/8h/12h, vùng quét,
  support/resistance và trạng thái trước/sau. Webhook mới độc lập, không fallback.
- Luồng **OBSERVE ONLY**: không card/paper/stats/WHITELIST, không Binance/entry/size/
  leverage/SL/TP/order. State file additive, JSON cũ giữ nguyên và không backfill/replay.
### 2026-09-12 - Auto Controls chỉnh TP EMA99 từng tín hiệu và xem PnL thật hôm nay

- Nâng controls/catalog/protection lên `AUTO_ENTRY_CONTROLS_V5_TP_AND_DAILY_REAL_PNL_20260912`,
  `EMA99_ROUTE_TP_ROE_CONTROLS_V5_20260912` và `EMA99_ROUTE_FILL_TP_ROE_V2_20260912`.
  Mỗi route executable exact 5m/15m có TP ROE riêng (mặc định 15%, hợp lệ 1–100%, hai
  số lẻ); builder và client guard đọc/kiểm tra lại ngay trước entry. TP full-fill mới
  dùng `roe/100/leverage`; SL LONG -20% và SHORT -30% giữ nguyên.
- UI thêm ô TP + Lưu theo route và dashboard `AUTO_ENTRY_DAILY_REALIZED_STATS_V1_20260912`.
  Count entry chỉ lấy Binance fill thật không-DCA khớp controls; PnL là net realized
  của close trong ngày Việt Nam, phân bổ DCA và dedupe close group. Không dùng Discord,
  paper, unrealized PnL hay tín hiệu chưa khớp để làm đẹp số liệu.
- Không đổi detector/classification/label/tier/gate, không thêm stats card runtime hoặc
  WHITELIST. Luồng ngoài EMA99 chưa có override TP chung nên UI chỉ ghi rule gốc.
  Chỉ lệnh EMA99 mới bị ảnh hưởng TP; không đổi size/leverage/SL/entry, vị thế/TP hiện
  hữu hoặc replay. JSON controls cũ thiếu TP mặc định 15%; audit/CSV V2 cũ đọc tương
  thích, không migrate/rewrite/backfill.

### 2026-09-13 - Market Breadth Shock cảnh báo kill short/long đồng loạt

- Thêm `MARKET_BREADTH_SHOCK_5M_V1_20260913`: scanner WebSocket cache-only mỗi 15 giây,
  tối đa top 400 USDT theo quote volume, không thêm REST. Input trước alert gồm nhịp
  5m hoặc cùng chiều 5–10m, breadth `±0,30%`, breadth mạnh `±0,75%`, projected volume
  so MA20, taker-buy, median, BTC/ETH/SOL và gia tốc breadth.
- Fail closed khi socket stale, dưới 60 mẫu hoặc coverage dưới 20%. WATCH từ 58 điểm;
  DANGER từ 78 điểm với strong breadth/dominance và flow hoặc leader xác nhận. Hai mẫu
  liên tiếp chống nhiễu; score `>=90` báo ngay. Discord màu vàng/cam cho WATCH và đỏ
  sáng/đỏ đậm cho PUMP/DUMP DANGER, cooldown 30 phút theo hướng+mức nhưng cho phép nâng
  WATCH lên DANGER.
- Discord liệt kê tối đa 25 coin đạt ngưỡng mạnh cùng hướng, đánh dấu volume `>=1,5x`,
  và tối đa 10 coin mạnh ngược hướng để thấy độ phân hóa; danh sách được cắt đúng giới
  hạn 1024 ký tự/field, không tạo card hoặc matcher entry mới.
- Đây là **OBSERVE ONLY** để né SHORT lúc pump đồng loạt hoặc né LONG lúc dump đồng loạt.
  Không Binance, không entry/size/margin/leverage/SL/TP/order/position, không paper,
  stats hoặc WHITELIST. Các tên PUMP/DUMP WATCH/DANGER chỉ là trạng thái alert, không
  phải matcher giao dịch; policy checkbox default OFF và CLOSED AvgROE `>4%` không đổi.
- State `data/market-breadth-shock-discord.json` là additive/atomic, không đổi JSON cũ,
  không migrate/rewrite/backfill/replay lịch sử. Webhook nằm riêng trong `.env` và file
  mẫu giữ trống.

### 2026-09-13 - Mega Pump Staircase cảnh báo coin tăng nhiều giờ kiểu LSK

- Nâng `MEGA_PUMP_STAIRCASE_1H_V2_SIGNAL_PRICE_20260913`, quét cache-only tối đa top 400 USDT theo
  quote volume. Input causal là nến 1h đã đóng: return 3h/6h/24h, breakout close/high,
  volume so median 24 nến, số nến xanh/higher-high, EMA13/EMA25 và râu/trả lại nến cuối.
  Nến live/stale, chuỗi thiếu giờ hoặc gap biên trên 8% bị loại; không gọi REST riêng.
- Bốn mức Discord là EARLY (vàng), ACCELERATING (cam), PARABOLIC_DANGER (đỏ) và
  PARABOLIC_EXHAUSTION (tím). Dedupe 6 giờ theo symbol + stage nhưng cho phép nâng cấp;
  mỗi vòng tối đa 10 alert điểm cao nhất. Alert dùng chung webhook Market Breadth Shock
  và state atomic riêng, đồng thời ghi rõ điểm là độ giống hình thái chứ không phải xác
  suất tăng 1.000% hoặc bằng chứng forced liquidation.
- Payload nay đưa **giá lúc phát tín hiệu** lên field đầu với badge cùng màu stage.
  Giá lấy từ shared Binance market snapshot tại `observedAt` theo thứ tự mark/last/price;
  close nến 1h dùng xác nhận vẫn tách riêng và có % lệch. Thiếu snapshot hợp lệ thì
  fallback close 1h có nhãn nguồn. Phân loại, score, cooldown và thống kê không đổi.
- Đây là **OBSERVE ONLY**: không Binance, không entry/size/margin/leverage/SL/TP/order/
  position, không card/paper/stats hoặc WHITELIST. Các stage không phải matcher giao
  dịch; policy checkbox default OFF và CLOSED AvgROE `>4%` không đổi.
- Event chỉ thêm ba field optional `signalPrice`, `signalPriceSource`,
  `signalPriceVsClosePct`; JSON cũ/consumer cũ giữ tương thích và direct detector fallback close 1h.
  File/module/state mới additive; không migrate/rewrite/backfill/
  replay signal, snapshot, trade hay cảnh báo lịch sử. Thiếu cache/webhook thì fail closed.

### 2026-09-13 - Auto Controls chỉnh leverage theo route EMA99

- Nâng lên `AUTO_ENTRY_CONTROLS_V6_EDITABLE_LEVERAGE_20260913` và
  `EMA99_ROUTE_EDITABLE_LEVERAGE_CONTROLS_V6_20260913`. Mỗi exact route EMA99 5m/15m
  executable có input leverage nguyên 1–125x và nút `Lưu x`; save độc lập với margin,
  TP và checkbox, không bật route OFF. JSON cũ thiếu leverage giữ default 5x hoặc hai
  default SHORT 10x lịch sử; giá trị hỏng làm route fail closed.
- Detector/label/gate causal không đổi. Runtime đọc lại leverage trước submit và client
  guard chặn plan stale. Lệnh mới dùng notional `margin × leverage`; TP theo ROE đã lưu,
  SL LONG −20%/SHORT −30% ROE và tất cả khoảng giá protection được tính bằng leverage
  mới rồi neo lại từ average full-fill thật.
- Chỉ entry EMA99 mới bị ảnh hưởng; không sửa position/order/TP/SL hiện tại, không replay,
  không DCA. Route ngoài EMA99 tiếp tục read-only theo leverage rule gốc. Không thêm
  card/stats/WHITELIST; daily real fills/PnL và policy CLOSED AvgROE `>4%` giữ nguyên.
- Field controls mới additive, không migrate/rewrite/backfill audit/CSV/trade/outcome cũ.
  UI chỉ mở ba input khi server trả `ema99SettingsEditable=true` cho exact catalog;
  route lịch sử ngoài catalog vẫn read-only.

### 2026-09-13 - Cảnh báo nhiều coin cùng tiến sát EMA99 khung 15m

- Thêm `EMA99_MARKET_BREADTH_15M_V1_20260913`, cache-only tối đa top 400 USDT theo
  quote volume. Input causal là giá market snapshot và ít nhất 100 nến 15m đã đóng;
  EMA99 live được chiếu từ EMA nến đóng, ATR14 tạo vùng gần động 0,30–1,50%. Coin phải
  giữ cùng phía EMA và thu hẹp khoảng cách ít nhất 0,05 điểm %, tránh đếm coin chỉ đứng
  yên cạnh EMA. Dữ liệu thiếu/gap/stale hoặc coverage thấp fail closed.
- Tách `FROM_BELOW` và `FROM_ABOVE`. Hướng chính cần ít nhất 8 coin và dominance 65%;
  WATCH xác nhận hai snapshot, DANGER phát ngay từ 15 coin hoặc 10% mẫu hợp lệ. Alert
  dùng chung webhook/username Market Shock Guard, có màu theo severity/phía, liệt kê
  giá, EMA99, khoảng cách, tiến độ và coverage; dedupe 30 phút theo hướng + severity.
- Đây là OBSERVE ONLY và không phải matcher entry: không Binance, không size/margin/
  leverage/SL/TP/order/position, không paper/stats/WL/WR/PF/AvgROE/Net PnL và không thêm
  checkbox WHITELIST. Policy whitelist default OFF/CLOSED AvgROE `>4%` không đổi.
- Module, biến môi trường và state Discord mới đều additive; JSON/API/CSV/trade/order cũ
  giữ nguyên, không migrate/backfill/replay. Thiếu webhook hoặc cache thì không phát.

### 2026-09-13 - Limit Paper Lab cho route không vào MARKET thật

- Thêm `LIMIT_PAPER_LAB_V1_CAUSAL_MULTI_DEPTH_20260913` và trang read-only
  `/limit-paper-lab`. Input chỉ là snapshot signal EMA99/HTF/Extreme/CoinGlass Zone
  Lifecycle/Hybrid, trạng thái executor không submit và last-price tick về sau; không
  backfill Discord/giá cũ.
- Phân loại giữ nguyên exact source/stream/label/side/timeframe. Lab không tạo label
  giao dịch mới; mỗi signal chỉ có bốn phương án nghiên cứu entry: LIMIT 0,35/0,70/1,00
  ATR và EMA/cấu trúc nếu nằm đúng phía hồi. LONG chờ giá giảm tới limit, SHORT chờ giá
  tăng tới limit; pending hết hạn theo timeframe thì `MISSED`.
- Thống kê từng phương án gồm fill-rate, W/L/flat, WR, AvgROE, NetROE và expected ROE
  trên mỗi signal. So sánh cùng chuẩn paper 5x, TP +10% ROE, SL -20% ROE và time-exit;
  đề xuất chỉ đạt `QUALIFIED` từ 20 signals, 12 closed, fill-rate >=25%, còn lại hiện
  `COLLECTING` để không biến mẫu nhỏ thành rule entry.
- Không thêm signal card/WHITELIST; exact matcher, default OFF và gate CLOSED AvgROE
  `>4%` hiện hữu không đổi. Không ảnh hưởng Binance/entry/size/margin/leverage/SL/TP,
  order/position hay Discord; mọi con số là paper research.
- JSON `data/limit-paper-lab.json`, API và UI là additive, tương thích consumer cũ;
  không migrate/rewrite/backfill/replay trade/fill/controls/CSV/snapshot lịch sử.

### 2026-09-14 - Other-route editable entry settings

- Version catalog/controls/policy:
  `OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V1_20260914` /
  `AUTO_ENTRY_CONTROLS_V9_OTHER_ROUTE_SETTINGS_20260914` /
  `LIVE_CARD_LIQ_FLOW_OTHER_EDITABLE_SETTINGS_V25_20260914`; bốn executor Extreme,
  HTF Deep Base, Hybrid và Coin Horizon được nâng sang bản editable ngày 2026-09-14.
- Không đổi input causal hoặc classifier của tín hiệu. UI chỉ nhận diện 11 exact route
  đã có executor; route khác vẫn read-only. Margin 1–100 USDT, leverage nguyên 1–125x,
  TP cố định 1–100% ROE được lưu riêng. Horizon chỉ cho margin/leverage vì TP vẫn động
  theo vùng thanh khoản active và R:R `>=1`.
- Lệnh mới dựng notional từ setting mới nhất và recheck exact ngay trước submit. SL
  Extreme/HTF `-30% ROE`, Horizon `-25% ROE`, Hybrid không SL riêng; không tác động
  order/position/protection đang mở, không replay và save không đổi ON/OFF/enabledAt.
- Daily stats và fill/close audit tiếp tục tính theo exact route, không đổi W/L/WR/PF/
  AvgROE/PnL. Không thêm label/card/WHITELIST; checkbox hiệu suất vẫn mặc định OFF và
  chỉ hiện với CLOSED AvgROE `>4%`.
- JSON cũ thiếu setting dùng default lịch sử; field mới additive và trạng thái công tắc
  được giữ. Setting hỏng fail closed, không migrate/rewrite/backfill dữ liệu cũ.

### 2026-09-14 - Big Candle `TĂNG MẠNH` 15m LONG MARKET

- Thêm `BIG_CANDLE_PUMP_15M_CLOSED_SIGNAL_V1_20260914` và executor
  `BIG_CANDLE_PUMP_15M_MARKET_EDITABLE_ENTRY_V1_20260914`. Input causal là nến 15m đã
  đóng, body %, volume/baseline cũ, mark lúc phát và mark preflight; không dùng future
  candle hoặc outcome. Exact label `BIG_CANDLE_PUMP_LONG` chỉ nhận body `>=+8%`;
  `XẢ MẠNH` không được map/authorize.
- Route `big-candle-pump-15m / volume-dump-scanner / BIG_CANDLE_PUMP_LONG / LONG` được
  nối controls và mặc định hiện tại là `10 USDT margin ×5`, TP `+15% ROE`, SL `-20%
  ROE` từ full-fill. Nến phải đóng sau lúc bật và mới `<=90s`, snapshot `<=60s`, mark
  drift `<=0,5%`; không position/order cùng symbol, không DCA, cooldown 4 giờ và state
  được ghi trước submit để không retry kết quả mơ hồ.
- Nâng catalog/controls/policy lên
  `OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V2_BIG_CANDLE_20260914`,
  `AUTO_ENTRY_CONTROLS_V10_BIG_CANDLE_PUMP_20260914` và
  `LIVE_CARD_LIQ_FLOW_BIG_CANDLE_PUMP_V26_20260914`. UI có công tắc cùng input
  margin/leverage/TP; daily count/PnL dùng exact fill audit. Discord thêm trạng thái
  executor cho alert tăng; nhánh giảm và thông báo cũ không đổi.
- Chỉ lệnh mới bị ảnh hưởng; không sửa vị thế, order, TP/SL hiện tại và không replay
  POWER/alert cũ. Không thêm card/matcher thống kê performance nên không tạo WHITELIST
  giả; default OFF/CLOSED AvgROE `>4%` của whitelist hiện hữu giữ nguyên. State executor
  và route JSON là additive, event cũ thiếu exact version fail closed.

### 2026-09-17 - Post-pump/post-dump EMA99 cross 5m + 15m + 1h

- Nâng thành `POST_PUMP_DUMP_EMA99_CROSS_MTF_V2_LONG_SHORT_20260917`, gồm SHORT
  `POST_PUMP_EMA99_BEARISH_CROSS_5M_CONFIRMED_MTF` và LONG
  `POST_DUMP_EMA99_BULLISH_CROSS_5M_CONFIRMED_MTF`, quét tối đa 400 USDT coin. Input
  causal chỉ gồm nến đã đóng/liên tục 5m, 15m, 1h; EMA13/25/99; pump/dump từ mốc trước
  cực trị, tuổi cực trị, drawdown/recovery, lower-high/higher-low và giá snapshot lúc phát. Cache 5m/15m được nạp
  dần có rate guard; 1h chỉ nạp khi 5m+15m đã thành candidate.
- Rule 1h yêu cầu pump `>=40%`, đỉnh cách `4–96h`, drawdown `8–70%`, ít nhất hai
  lower-high và close dưới EMA13. Rule 15m yêu cầu `close < EMA13 < EMA25`, dốc EMA13/
  EMA25 âm và hai lower-high. Trigger chính là nến 5m mới nhất vừa chuyển sang
  `EMA99 > EMA13` và `EMA99 > EMA25`, với bearish stack, dốc nhanh âm và 4/6 close
  dưới EMA25. Cảnh báo dedupe/cooldown sáu giờ theo symbol.
- LONG đối xứng yêu cầu 1h dump `>=40%`, đáy cách `4–96h`, hồi `8–120%`, ít nhất hai
  higher-low và close trên EMA13; 15m bullish stack + dốc dương + hai higher-low;
  trigger 5m vừa chuyển sang `EMA99 < EMA13/EMA25`, có bullish stack và 4/6 close
  trên EMA25. Không dùng outcome hoặc nến tương lai để chọn hướng.
- Discord SHORT màu đỏ gửi giá lúc phát, close xác nhận, dữ liệu ba khung và **vùng entry
  SHORT dự kiến**. Vùng được neo causal vào EMA25 5m + EMA13 15m ở biên dưới và EMA99
  5m + EMA25 15m ở biên trên; gửi midpoint và % hồi từ close tín hiệu. Chỉ ghi cách
  dùng là chờ giá hồi vào vùng rồi 5m đóng reject; không coi giá hiện tại là entry và
  không phát nếu không dựng được vùng hợp lệ.
- Discord LONG màu xanh cũng gửi vùng entry dự kiến phía dưới close, midpoint và %
  pullback, yêu cầu nến 5m đóng reclaim trên EMA25/EMA99 sau khi giá điều chỉnh vào
  vùng; không dùng giá phát làm điểm mua đuổi và fail closed nếu vùng không hợp lệ.
- Đây là **OBSERVE ONLY**, không phải gate giao dịch thật: không Binance, không margin/
  leverage/size/entry/SL/TP/order/position và không paper. Stats chỉ đếm độ phủ/scanner,
  không tạo W/L/WR/PF/AvgROE/PnL. Không thêm card/cohort nên không có WHITELIST mới;
  default OFF và điều kiện CLOSED AvgROE `>4%` của hệ thống hiện hữu giữ nguyên.
- JSON/state/env mới additive, không sửa/migrate/rewrite/backfill/replay dữ liệu cũ.
  Consumer cũ có thể bỏ qua event mới; thiếu webhook/cache/nến liên tục thì fail closed.

### 2026-09-26 - Runtime hot-path / snapshot bounded

- Thêm `CAP_PAPER_ACTIVE_INDEX_BATCH_V1_20260926`: index active theo id/symbol thay
  cho vòng tìm kiếm chéo trên toàn bộ Cap history; một tick 1 giây chỉ ghi store tối
  đa một lần dù có nhiều fill/TP/SL. Touch, outcome, PnL và ROE không đổi.
- Thêm `LIQUID_FLOW_V2_PAPER_SNAPSHOT_BOUNDED_CACHE_V2_20260926`: aggregate tiếp tục tính
  trên mọi trade; payload live chỉ giữ mọi active + 300 record gần nhất. Cap API mặc
  định giữ mọi active + 500 CLOSED gần nhất, full aggregate không đổi và có
  `?history=full` cho audit. Aggregate closed được reuse theo revision, còn open PnL
  vẫn tính lại từ mark live.
- Thêm `AUTO_ENTRY_DAILY_STATS_CACHE_V1_20260926` và pause polling khi tab ẩn. Cache
  tự invalid theo fill audit, controls và ngày Bangkok; tab visible refresh ngay.
- `RECOMMENDED_PAPER_SOCKET_ACTIVE_INDEX_V1_20260926` và
  `SHAKEOUT_PAPER_ACTIVE_INDEX_V1_20260926` index lệnh active theo symbol/signal id;
  không đổi rule close recommended hoặc chuỗi cancel/fill/recovery/trail/exit Shakeout.
- `COIN_HORIZON_ANALYSIS_REUSE_V1_20260926` dùng lại cùng horizon snapshot giữa API,
  Discord và transition runner; không đổi phân loại/gate hay lệnh Binance.
- Input causal trước entry, classifier, label/tier/score/gate và cách tính stats không
  thay đổi. Không ảnh hưởng Binance, entry, size, leverage, SL, TP, route/master hoặc
  position/order đang có. Không replay/backfill hay xóa JSON cũ; field response mới
  additive. Không thêm card/label nên WHITELIST mặc định OFF và CLOSED AvgROE `>4%`
  giữ nguyên.

### 2026-09-26 — SQUEEZE_RATIO_LIVE_VIEW_V3_20260926

- Giữ nguyên toàn bộ input causal và rule phân loại squeeze hai chiều trước entry:
  closed 15m/1h, breakout/breakdown 20 nến, volume `>=2x`, EMA13/25 1h, account L/S
  thay đổi `10%/1h` và tier OI `>=3%/1h`. Không thay đổi Discord gate/cooldown.
- API đánh dấu live đúng cửa sổ freshness 15 phút của scanner và tách `liveEvents` /
  `historyEvents`; UI mặc định chỉ hiện live, cho phép bật lịch sử 7 ngày và ẩn/hiện
  riêng bảng SHORT bị squeeze hoặc LONG bị squeeze. Record cũ thiếu side gắn LEGACY,
  không được tính live.
- Thống kê mới chỉ đếm số live theo chiều, không phải kết quả giao dịch và không tính
  W/L/WR/PF/AvgROE/PnL. Đây vẫn là OBSERVE ONLY, không có WHITELIST/card giao dịch mới.
- Không ảnh hưởng Binance, entry, size, leverage, SL, TP, order hay position. JSON/state
  cũ không bị migrate/rewrite; `events` cũ giữ nguyên và field snapshot mới là additive.

### 2026-09-26 — V2_RUNTIME_HOT_STORE_ONLY_V1_20260926

- Ngừng nạp toàn bộ lịch sử source cũ vào runtime: Cap/Shakeout/Recommended/Liquid V2
  chỉ giữ mọi active và số terminal gần nhất lần lượt 1.000/500/500/300 dòng; terminal
  dư được append NDJSON trong `data/archive/`. `CANCELLED`, `EXPIRED`, `REJECTED` nay
  được xem là terminal như `CLOSED`, không giữ nóng vô hạn.
- Tắt mặc định Shakeout historical learning sidecar; các sidecar Recommended và paper
  page vẫn OFF. Snapshot/thống kê UI chuyển sang cửa sổ hot V2, không còn full-history;
  archive vẫn giữ dữ liệu để audit offline.
- Không đổi input causal, classifier, label/tier/score/gate, whitelist hay quyết định
  entry. Không ảnh hưởng Binance, size, leverage, SL, TP hoặc position/order đang mở;
  mọi active được bảo toàn kể cả khi vượt giới hạn hot store.
- JSON trade giữ schema cũ; chỉ thêm metadata `hotStore` và archive NDJSON. Việc
  compact ghi archive trước rồi mới thay hot JSON atomic để không mất lịch sử.

### 2026-09-26 — STRATEGY_SCAN_CANDLE_CLOSE_BURST_DEBOUNCE_V1_20260926

- Gộp burst `candleClose` 15m theo từng symbol thành đúng một lượt gọi nhóm scanner
  sau 1,2 giây, với cooldown 30 giây; tránh hàng trăm lượt schedule/log trùng làm CPU
  tăng và khiến toàn bộ trang web đứng ở ranh giới nến. Log warm-up cũng chỉ lặp tối
  đa mỗi 30 giây khi trạng thái không đổi.
- Input causal, classifier, score/tier/label/gate, freshness, thống kê và snapshot giữ
  nguyên. Vẫn quét đủ universe/cache đã sẵn sàng, không bỏ coin hoặc khung thời gian.
- Không ảnh hưởng Binance, entry, size, leverage, SL, TP, order/position, master lock
  hay route ON/OFF. Không thêm card/label nên WHITELIST mặc định OFF và policy CLOSED
  AvgROE `>4%` không đổi.
- Không đổi JSON/state/API; env debounce/cooldown mới có default nội bộ và tương thích
  cấu hình cũ. Không migrate, replay hoặc backfill dữ liệu.

### 2026-09-26 — COIN_LEVEL_ENTRY_WATCH_LIVE_PAYLOAD_V1_20260926

- Coin Level mặc định chỉ tải watch/entry đang đạt và metadata hai chiều 30 phút;
  500 LONG + 500 SHORT lịch sử chỉ được trả khi bật checkbox qua `?history=1`. Việc
  này giảm payload/poll và số object phải parse/render trên mỗi tab.
- Input causal, classifier, score/tier/label/gate, diagnostics, counter lịch sử và
  logic đánh dấu hai chiều giữ nguyên. Không thêm card/WHITELIST mới.
- Snapshot nội bộ cho Discord, flip protection và Binance executor không bị rút gọn;
  do đó không ảnh hưởng entry, size, leverage, SL, TP, order/position hay route ON/OFF.
- JSON HTTP thêm field additive và có đường opt-in tương thích để lấy lịch sử đầy đủ;
  không sửa/migrate/replay file dữ liệu cũ.

### 2026-09-26 — POST_PUMP_NO_BUY_WATCH_V1_CLOSED_5M_24H_20260926

- Thêm detector causal hai stage cho trường hợp bơm trước rồi xuất hiện cây xả 5m:
  `SELL_IMPULSE` xác nhận nến đỏ đóng thủng vùng/EMA với range, volume, taker-sell và
  vị trí close đủ mạnh; `NO_BUY_CONFIRMATION` yêu cầu 2–3 nến sau hồi yếu, volume thấp,
  taker-buy thấp, không reclaim và không tạo higher-high. Pump memory lấy nến 15m đã
  đóng trong 24 giờ; base/ATR/EMA/RSI lấy nến 5m đã đóng, không nhìn tương lai.
- Ngưỡng đang chạy: pump `>=8%` hoặc `>=4% + volume 2.5x`; cây xả giảm `>=1.2%`
  hoặc range `>=1.5 ATR`, volume `>=1.8x`, taker-sell `>=58%`, close-location `<=25%`.
  Xác nhận sau xả: hồi `<=35%` thân nến, volume `<=0.6x` cây xả và taker-buy `<=45%`.
  RSI14 `<25`, cách EMA13 `>2 ATR` hoặc dưới base `>5%` chuyển sang stage màu xám
  `LATE_NO_CHASE`: vẫn báo để giải thích đã phát hiện nhịp xả, nhưng ghi rõ không phải
  điểm vào và không SHORT đuổi.
- Discord dùng webhook BTC Session mới nhất đã cấu hình, có message riêng cho từng
  stage, chỉ gửi event mới sau startup và dedupe 7 ngày. Alert luôn ghi `OBSERVE ONLY`,
  chờ retest và không tự đặt Binance.
- Stats chỉ là diagnostics/counter scanner, không phải outcome. Không thêm performance
  label/card hay WHITELIST; rule checkbox mặc định OFF và CLOSED AvgROE `>4%` giữ
  nguyên. Không ảnh hưởng Binance, entry, size, leverage, SL, TP, order/position,
  master lock hoặc route ON/OFF.
- JSON snapshot mới additive; file dedupe Discord tách riêng và ghi atomic. Không
  migrate/rewrite/replay/backfill state, trade hoặc signal cũ; consumer cũ bỏ qua field
  mới vẫn hoạt động.
- Chuẩn hóa text Discord: mọi stage đều mang prefix và field `XẢ MẠNH SAU BƠM` để
  phân biệt nhóm; chỉ suffix trạng thái thay đổi. Không đổi logic, stats hoặc Binance.

### 2026-09-26 — POST_DUMP_NO_SELL_WATCH_V1_CLOSED_5M_24H_20260926

- Thêm detector LONG 5m đối xứng: ghi nhớ cú xả bằng nến 15m đã đóng trong 24 giờ,
  dựng vùng tích lũy từ nến 5m sau đáy, rồi nhận cây hồi đóng vượt vùng + EMA13/25.
  Ngưỡng cây hồi: `>=1.2%` hoặc `>=1.5 ATR`, volume `>=1.8x`, taker-buy `>=58%`,
  close-location `>=75%`; dump trước đó `>=8%` hoặc `>=4% + volume 2.5x`.
- Sau 2–3 nến, stage `KHÔNG CÒN LỰC BÁN · CHỜ RETEST LONG` cần pullback `<=35%`
  thân hồi, volume `<=0.6x`, taker-sell `<=45%`, giữ đỉnh vùng/EMA13 và higher-low.
  RSI `>75`, xa EMA13 `>2 ATR` hoặc trên base `>5%` chuyển thành cảnh báo xám
  `KHÔNG LONG ĐUỔI`, không giả làm entry.
- Discord dùng webhook BTC Session mới nhất; mọi stage có prefix/field cố định
  `HỒI MẠNH SAU XẢ`, chỉ nhận event mới sau startup và không replay lịch sử.
- Đây là OBSERVE ONLY: không Binance, entry, size, leverage, SL/TP, order/position,
  route hay master lock. Stats chỉ là diagnostics, không có performance card/WHITELIST;
  default OFF và CLOSED AvgROE `>4%` giữ nguyên.
- Snapshot/state mới additive và tách riêng; JSON/trade cũ không migrate, rewrite,
  replay hoặc backfill, consumer cũ có thể bỏ qua các field mới.

### 2026-09-27 — POST_MOVE_IMPULSE_5M_MARKET_3USDT_V1_20260927

- Nối đúng hai thẻ Discord màu với executor: vàng `HỒI MẠNH SAU XẢ · CẢNH BÁO SỚM`
  (`BUY_IMPULSE`) vào MARKET LONG; cam `XẢ MẠNH SAU BƠM · CẢNH BÁO SỚM`
  (`SELL_IMPULSE`) vào MARKET SHORT. Input trước entry vẫn chỉ là 15m/5m đã đóng của
  detector V1; không dùng nến tương lai hoặc outcome. Stage xác nhận và anti-chase
  không vào thêm.
- Rule preflight: signal mới sau startup + `enabledAt`, tuổi `<=90s`, MARK drift
  `<=0,5%`, không position/entry order cùng symbol, tối đa 30 vị thế, master/route/
  runtime/rate gate đều cho phép. Ghi attempt trước submit, exact-key dedupe và không
  retry mù kết quả không chắc chắn.
- Hai route seed mặc định OFF, exact UI key trùng runtime; operator đã yêu cầu bật hai
  route. Default mỗi lệnh là `3 USDT margin ×5 = 15 USDT notional`, TP `+10% ROE`,
  SL LONG `-20%`, SL SHORT `-30%`, protection neo full fill. Không ceil minimum
  notional và không thay order/vị thế cũ. Controls version là
  `AUTO_ENTRY_CONTROLS_V24_POST_MOVE_IMPULSE_20260927`.
- Stats là exact Binance fill audit của route (không DCA; closed outcome/net PnL theo
  vị thế), không có performance card mới. Do đó không thêm WHITELIST; card policy vẫn
  default OFF và chỉ hiện khi CLOSED AvgROE `>4%`.
- JSON cũ tương thích theo kiểu additive: watch thêm `executionCandidate`, executor
  dùng file state riêng; thiếu flag/version/stage exact thì fail closed. Không migrate,
  rewrite, backfill hoặc replay signal/trade/fill cũ.

### 2026-09-27 — POST_MOVE_IMPULSE_5M_MARKET_8USDT_V2_20260927

- Giữ nguyên input causal và classifier V1: closed 15m/5m, chỉ thẻ vàng
  `BUY_IMPULSE` LONG hoặc thẻ cam `SELL_IMPULSE` SHORT; confirmation không vào lại,
  anti-chase không vào. Freshness/drift/no-position/no-order/dedupe/max30 giữ nguyên.
- Chỉ đổi size lệnh mới của hai exact route từ `3 USDT margin ×5` thành
  `8 USDT margin ×5 = 40 USDT notional`. MARKET, TP `+10% ROE`, SL LONG `-20%`,
  SL SHORT `-30%` không đổi; vị thế/order hiện hữu không bị sửa và signal cũ không
  replay sau reload.
- Stats/fill audit và policy WHITELIST giữ nguyên; không tạo label/card mới. Route key
  không đổi, vẫn ON theo yêu cầu; controls giữ `enabledAt` khi cập nhật margin.
- Versions: executor V2 `MARKET_8USDT`, policy V39, catalog V14 và controls V25.
  JSON/state/watch/trade/fill cũ tương thích; không migrate/backfill/rewrite.

### 2026-09-27 — LIQSCAN_MAIN_KILL_SWEEP_SHORT_REJECTION_FILTER_V2_20260927

- Nâng detector lên `LIQSCAN_MAIN_KILL_SWEEP_DISCORD_V3_SHORT_REJECTION_FILTER_20260927`
  và policy lên `LIVE_CARD_MAIN_KILL_SHORT_FILTER_V40_20260927`. Input trước entry là
  vùng/score đã đóng băng lúc arm, high/low/close 15m, MARK hiện tại và event EXTREME
  đã ghi trước đó; không dùng future candle, outcome hoặc PnL để quyết định.
- UPPER/SHORT phải đồng thời: tier đỏ `EXTREME >=50M`, wick chỉ xuyên quá mép trên
  tối đa `0,10%`, giá đã rút xuống dưới mép dưới vùng, và không có LOWER/LONG cùng
  symbol trong 3 ngày. Thiếu return, sweep sâu hoặc hai chiều đều chỉ Discord
  `OBSERVE ONLY`. LOWER/LONG giữ classifier cũ nhưng dùng chung khóa hai chiều 3 ngày.
  Policy và builder đều kiểm field/version, nên JSON cũ hoặc payload giả fail closed.
- Binance chỉ thay điều kiện được phép entry; size route vẫn `1 USDT ×5`, MARKET,
  TP `+10% ROE`, SL `-30% ROE`. Freshness, drift, cooldown, no-DCA/no-open-entry,
  max30, master/route/rate gate và full-fill protection giữ nguyên; vị thế/order hiện
  hữu không bị đổi, route không bị bật/tắt lại.
- Forward-test ghi additive `filterDecisions` 30 ngày (tối đa 5.000) cùng
  `directionHistory` 3 ngày; fill audit exact route tiếp tục là nguồn closed PnL.
  Không tạo performance card/label mới nên không thêm WHITELIST; CLOSED AvgROE `>4%`
  và mặc định OFF giữ nguyên.
- JSON state cũ được nâng mềm bằng lịch sử BUY/SELL từ `attempts`; event thêm
  `sweepDepthPct`/`rejection`. Không rewrite trade/fill/control, không backfill hoặc
  replay tín hiệu cũ.

### 2026-09-27 — POST_MOVE_IMPULSE_5M_MARKET_8USDT_MAX50_V3_20260927

- Giữ nguyên causal input/classifier của V2: closed 15m/5m, chỉ `BUY_IMPULSE` LONG
  và `SELL_IMPULSE` SHORT; confirmation/late-no-chase không vào. Freshness 90 giây,
  drift 0,5%, exact dedupe và no-position/no-entry-order cùng symbol không đổi.
- Tăng riêng trần tổng vị thế truyền vào `placeOrder` của hai exact route từ 30 lên
  `50`. Margin vẫn `8 USDT`, leverage `5x`, notional `40 USDT`, MARKET, TP `+10%`,
  SL LONG `-20%`, SL SHORT `-30%`. Không tác động route khác hay lệnh/vị thế hiện hữu;
  các tín hiệu AWE/DYDX đã bị chặn trước đó không được replay.
- Stats vẫn là fill audit exact route, không đổi công thức. Không thêm performance
  label/card/WHITELIST; default OFF và CLOSED AvgROE `>4%` giữ nguyên.
- Versions: executor V3 MAX50, global policy
  `LIVE_CARD_POST_MOVE_IMPULSE_MAX50_V41_20260927`. State attempts cũ tương thích và
  được giữ; JSON controls/watch/trade/fill không migrate, rewrite hoặc backfill.

### 2026-09-27 — POST_MOVE_CONFIRMATION_5M_MARKET_8USDT_MAX50_V4_20260927

- Đảo gate hai nhánh post-move theo đúng quy trình chờ xác nhận: `BUY_IMPULSE` LONG
  màu vàng và `SELL_IMPULSE` SHORT màu cam chỉ OBSERVE ONLY nhưng vẫn gửi Discord;
  `NO_SELL_CONFIRMATION` LONG màu xanh và `NO_BUY_CONFIRMATION` SHORT màu đỏ mới là
  `executionCandidate` được xét MARKET. Discord phát cả cảnh báo sớm và xác nhận;
  `LATE_NO_CHASE` vẫn xám và không entry.
- Input trước entry chỉ gồm pump/dump 15m, vùng nền/impulse 5m và 2–3 nến 5m đã đóng.
  Xác nhận LONG cần pullback `<=35%`, volume `<=0,60x`, taker-sell `<=45%`, giữ
  vùng/EMA13 và higher-low; SHORT dùng rebound/taker-buy/no-reclaim/lower-high đối
  xứng. Không dùng outcome, PnL hoặc nến tương lai để phân loại.
- Exact route và Auto Controls settings không đổi. Lệnh mới sau xác nhận vẫn MARKET
  `8 USDT ×5`, TP `+10% ROE`, SL LONG `-20%`, SL SHORT `-30%`, full-fill protection,
  max50, tuổi confirmation 90 giây, drift 0,5%, no-position/no-order, master/route/
  runtime/rate gate và dedupe. Impulse gốc cũng phải sau startup/`enabledAt`, nên
  confirmation của tín hiệu cũ không replay. Không tác động order/vị thế đang mở.
- Thống kê vẫn dùng fill audit exact route; history V3 và V4 cùng route key nhưng
  phân biệt được bằng entry reason/version. Không thêm card/label hoặc WHITELIST;
  policy mặc định OFF và CLOSED AvgROE `>4%` giữ nguyên.
- Versions: watch V2 confirmation-entry, Discord V4, executor V4, policy
  `LIVE_CARD_POST_MOVE_CONFIRMATION_MAX50_V42_20260927`, controls V26. JSON route/
  settings/attempts/fills/trades cũ tương thích; watch V1 fail closed và không được
  migrate, backfill hoặc replay.

### 2026-09-27 — POST_MOVE_SHORT_CONFIRMATION_LONG_IMPULSE_5M_MARKET_8USDT_MAX50_V5_20260927

- Sửa phạm vi V4: chỉ SHORT phải chờ xác nhận. LONG giữ rule cũ: `BUY_IMPULSE`
  vàng có quyền xét MARKET ngay; confirmation xanh vẫn gửi Discord nhưng không tạo
  lệnh lần hai. SHORT `SELL_IMPULSE` cam chỉ Discord; chỉ
  `NO_BUY_CONFIRMATION` đỏ sau 2–3 nến 5m đóng mới có quyền xét MARKET.
- Causal input/classifier giữ nguyên: dump/pump 15m, base/EMA/impulse 5m đã đóng;
  SHORT confirmation cần rebound `<=35%`, volume `<=0,60x`, taker-buy `<=45%`,
  no-reclaim và lower-high. `LATE_NO_CHASE` không entry ở cả hai hướng.
- Exact route, ON/OFF, size và protection giữ nguyên: `8 USDT ×5`, TP `+10%`,
  SL LONG `-20%`, SL SHORT `-30%`, max50, freshness/drift/no-position/no-order và
  dedupe. Không tác động position/order đang mở, không replay tín hiệu cũ.
- Stats vẫn dùng fill audit route cũ và phân cohort bằng version/reason; không thêm
  card/label/WHITELIST. JSON cũ tương thích, watch sai version fail closed.
- Versions: LONG watch V3, SHORT watch V2, executor V5, LONG Discord V5, SHORT
  Discord V4, policy V43 và controls V27.

### 2026-09-27 — POST_MOVE_SHORT_CONFIRMATION_LONG_IMPULSE_5M_MARKET_5USDT_MAX50_V6_20260927

- Giảm margin hai exact route post-move từ `8` xuống `5 USDT`; leverage giữ `5x`,
  notional mới `25 USDT`. Chỉ tác động lệnh mới; TP `+10%`, SL LONG `-20%`, SL
  SHORT `-30%`, max50 và protection không đổi, không sửa vị thế/order hiện hữu.
- Classifier/gate giữ nguyên V5: LONG vào ở `BUY_IMPULSE`; SHORT chỉ vào sau
  `NO_BUY_CONFIRMATION`. Discord vẫn gửi stage sớm và xác nhận với màu riêng.
- Stats exact route không đổi; entry reason/version tách cohort size. Không thêm
  label/card/WHITELIST. Migration catalog V15 đổi đúng giá trị legacy `8→5` cho hai
  route và giữ ON/OFF/`enabledAt`; JSON khác tương thích, payload size cũ fail closed.
- Versions: executor V6, catalog V15, policy V44, controls V28, LONG Discord V6,
  SHORT Discord V5.

### 2026-09-27 — BTC_IMPULSE_REGIME_OBSERVE_V1_20260927

- Thêm card đầu BTC Session để đánh giá `_IMPULSE` theo regime BTC live. Input causal
  gồm freshness health 120 giây, trend/score 1h–4h, EMA1h, bull/bear points và
  macro shock/spike. Phân loại `SW_UP`, `SW_DOWN`, `NEUTRAL`, `SHOCK`, `STALE`;
  SW_UP ưu tiên LONG/chờ xác nhận SHORT, SW_DOWN đối xứng, neutral/shock/stale chờ.
- Card chỉ `OBSERVE ONLY`; không sửa classifier, Discord hoặc quyền MARKET thật.
  LONG vẫn xét ở `BUY_IMPULSE`; SHORT vẫn xét ở `NO_BUY_CONFIRMATION`; size 5 USDT
  ×5, TP/SL/max50 và position/order hiện hữu không đổi.
- Stats chưa có cohort đóng. Nối exact whitelist
  `btc-session:IMPULSE:{SW_UP|SW_DOWN|NEUTRAL|SHOCK|STALE}` vào UI/runtime, mặc định
  OFF và chỉ có thể hiện khi CLOSED AvgROE `>4%`; hiện tại ẩn, không cấp Binance.
- Không migration JSON. Metadata tùy chọn `btcImpulseRegimeObservation` fail closed
  khi version sai; payload cũ thiếu field vẫn tương thích.

### 2026-09-27 — POST_MOVE_IMPULSE_CONFIRMATION_DISCORD_V1_DEDICATED_20260927

- Nối webhook riêng chỉ cho xác nhận `_IMPULSE`: LONG `NO_SELL_CONFIRMATION` và
  SHORT `NO_BUY_CONFIRMATION`. Input/classifier giữ nguyên nến 15m/5m đã đóng;
  cảnh báo sớm, late-no-chase, side sai và payload không `watchOnly` bị loại.
- Feed cũ vẫn nhận các stage như trước; feed mới có state/dedupe LONG/SHORT độc lập,
  chỉ nhận signal mới sau restart và không replay event cũ. Không thêm label/card hay
  WHITELIST; không có thống kê giao dịch mới từ thao tác chuyển tiếp Discord này.
- Không ảnh hưởng Binance: quyền entry LONG/SHORT, margin 5 USDT, leverage 5x,
  TP/SL/max50, route ON/OFF và lệnh/vị thế hiện hữu không đổi. JSON cũ tương thích;
  thiếu state tạo mảng rỗng và thiếu webhook thì fail closed.

### 2026-09-27 — POST_MOVE_IMPULSE_CANDLE_DISCORD_V1_DEDICATED_20260927

- Nối webhook riêng cho đúng hai cảnh báo sớm `_IMPULSE`: LONG `BUY_IMPULSE` màu
  vàng và SHORT `SELL_IMPULSE` màu cam. Input causal vẫn là pump/dump 15m cùng
  base/EMA/cây impulse 5m đã đóng; không dùng outcome, PnL hoặc dữ liệu tương lai.
- Selector bắt buộc `watchOnly=true`, `binanceEligible=false`; loại confirmation,
  `LATE_NO_CHASE`, sai side và payload không an toàn. Feed chỉ nhận event sinh sau
  restart, tuổi tối đa 12 phút; state/dedupe LONG và SHORT tách riêng, không replay.
- Không đổi Binance, entry, size 5 USDT ×5, SL, TP, max50, route ON/OFF hoặc lệnh/
  vị thế hiện hữu. Đây là kênh Discord bổ sung, không phải gate giao dịch mới.
- Thống kê chỉ là delivery state độc lập, chưa tạo cohort trading. Không thêm label/
  card/WHITELIST. JSON cũ tương thích; thiếu state tạo `events=[]`, thiếu webhook
  thì fail closed và không gửi.
### 2026-09-28 — COIN_SUPPLY_PROFILE_V1_20260928

- Thêm card hồ sơ cung vào Coin Level: supply từ CoinGecko được cache 6 giờ, market
  cap live ước tính từ MARK Binance × circulating supply; timeout 3,5 giây và cache
  lỗi 15 phút để upstream không làm chậm/đơ toàn trang.
- Rule hiển thị causal: đỏ khi cung lưu hành `<=20M` token (tách thêm cap lớn
  `>=500M USD`), cam khi `<=100M`, cyan khi `<=500M`, xanh khi rộng hơn. Card có
  tổng cung, max supply, tỷ lệ lưu hành/max và turnover 24h; không dùng dữ liệu sau
  entry, PnL hoặc outcome và không coi số token thấp là bằng chứng thanh khoản mỏng.
- Đây là thống kê `OBSERVE ONLY`, không ảnh hưởng Binance, entry, size, SL, TP,
  Discord, route hay lệnh/vị thế hiện hữu. Không tạo cohort trading mới.
- `supplyProfile` là field JSON bổ sung; consumer/snapshot cũ thiếu field vẫn chạy,
  provider thiếu dữ liệu thì trả `available=false`. Không thêm label/card giao dịch
  hoặc WHITELIST; rule mặc định OFF và CLOSED AvgROE `>4%` giữ nguyên.
### 2026-09-28 — COIN_SUPPLY_MARKET_V2_ID_DIRECTORY_20260928

- Tạo page `/low-supply-market` cho Binance USDT perpetual × CoinGecko. Scanner
  ưu tiên Top250 rồi map directory id và batch tối đa220 id tuần tự, chọn market-cap
  lớn nhất khi symbol trùng, cache/persist 6 giờ;
  partial batch được công bố thay vì giả vờ đủ dữ liệu.
- Default filter `cap>=4B USD && circulating<15M token`, xếp circulating tăng dần;
  người dùng có thể đổi ngưỡng, tìm coin hoặc sort theo float/max, cap, turnover,
  change24h. Thống kê chỉ tính trong provider coverage hiện có.
- Input hoàn toàn hiện tại và causal, không dùng PnL/outcome/future data. Đây là
  `OBSERVE ONLY`; không đổi Binance, entry, size, leverage, SL/TP, Discord hoặc
  vị thế/order đang mở.
- State `coin-supply-market.json` mới độc lập; JSON cũ không migrate và consumer cũ
  không bị ảnh hưởng. Không tạo trading label/card/WHITELIST; default OFF và rule
  CLOSED AvgROE `>4%` giữ nguyên.

### 2026-09-28 — LOW_SUPPLY_MARKET_UI_V2_COLUMN_SORT_20260928

- Thêm sort hai chiều trực tiếp trên toàn bộ tiêu đề dữ liệu của table cung thấp;
  indicator `↑/↓/↕`, mặc định circulating tăng dần và dữ liệu thiếu luôn xuống cuối.
- Input, filter, phân loại, provider coverage và thống kê giữ nguyên V2; đây chỉ là
  phép sắp xếp client-side trên snapshot hiện tại, không dùng outcome/PnL/tương lai.
- Không ảnh hưởng Binance, entry, size, leverage, SL/TP, Discord hoặc position/order.
  API/JSON/cache cũ không đổi schema và không cần migration. Không có label/card
  giao dịch mới nên WHITELIST mặc định OFF và rule CLOSED AvgROE `>4%` không đổi.

### 2026-09-28 — LOW_SUPPLY_MARKET_MENU_V1_ALL_PAGES_20260928

- Đồng bộ link `Cung thấp` vào mọi page/menu đang có Liquid Flow V2; test tự động
  quét toàn bộ HTML để phát hiện trang thiếu link trong các lần sửa sau.
- Chỉ thay đổi navigation. Input, classification, stats, snapshot và JSON không đổi;
  không tác động Binance, entry, size, leverage, SL/TP, Discord hoặc position/order.
  Không có trading label/card mới nên WHITELIST/AvgROE policy giữ nguyên.

### 2026-09-28 — VERY_STRONG_ENTRY_WATCH_UI_V1_BTC_CONTEXT_20260928

- Tạo page quản lý riêng cho Coin Level Entry Score tier hiện hữu `VERY_STRONG`
  (`>=80`) còn hiệu lực tối đa 45 phút; scanner expose đủ list trước top30 bằng field
  additive `veryStrongCandidates`.
- Timing BTC chỉ tô bối cảnh: SHORT cần BTC 1h/4h DOWN + EMA1h dưới + Market Regime
  cho SHORT; LONG dùng UP đối xứng. Cửa sổ LIMIT/MARKET mới 90 giây được phân biệt
  với setup cấu trúc còn hiệu lực và retest đã cũ.
- `OBSERVE ONLY`: không đổi Binance, entry, size, leverage, SL/TP, Discord hoặc
  position/order. JSON cũ tương thích qua fallback `candidates`; không có nhãn giao
  dịch mới, runtime matcher hay WHITELIST mới, rule CLOSED AvgROE `>4%` giữ nguyên.
# 2026-09-28 — VERY_STRONG_TREND_POOL_V1_BTC_WAVE_OBSERVE_20260928

- Nâng trang `/very-strong-entry-watch` từ danh sách setup 45 phút thành pool xu hướng tối đa 24 giờ: giữ coin từng có tier `VERY_STRONG` hoặc `|Trend Score| >=24` kèm volume breakout >=1x.
- Dữ liệu causal trước đánh giá gồm nến đóng 5m/15m/1h/4h, EMA/ATR, volume/taker đã đóng, BTC health 1h+4h và Market Regime. Socket chỉ cập nhật giá live/khoảng cách vùng.
- LONG còn active khi 4h UP, 1h chưa DOWN, giữ EMA25 1h và volume 15m >=0.55x median20; SHORT đối xứng. Entry động lấy mốc gần nhất trong breakout gốc, EMA13/25 1h, EMA13 4h, biên 15m.
- `READY_BTC_WAVE` cần BTC thuận hướng + route hướng được Market Regime cho phép + giá trong vùng động + nến 5m cùng hướng + taker phù hợp + volume 5m >=0.65x. Khi BTC ngược hướng, coin vẫn ở pool nhưng chỉ `WAIT_BTC_TURN`.
- Thống kê/UI: tổng active, BTC thuận, chờ BTC, đủ điểm vào; có filter/sort và hiển thị volume nguồn/hiện tại, vùng/vô hiệu, trạng thái 1h/4h.
- Record thiếu cache được giữ ở trạng thái `DATA_WARMUP`, không phát entry. Warm-up tối đa hai symbol/lượt, có cooldown 10 phút và tự dừng khi REST congestion/rate gate đang chặn.
- Không ảnh hưởng Binance/entry/size/SL/TP/Discord; toàn bộ là `OBSERVE ONLY`. JSON chỉ thêm field, UI có fallback cho snapshot cũ. Không thêm nhãn matcher giao dịch hay checkbox WHITELIST.

# 2026-09-28 — BTC_RELATIVE_STRENGTH_WATCH_V1_OPPOSITE_CONTEXT_OBSERVE_20260928

- Thêm page `/btc-relative-strength-watch` với hai tab đối xứng: LONG `Coin mạnh khi BTC giảm` và SHORT `Coin yếu khi BTC tăng`. Nguồn dùng lại pool xu hướng 24 giờ nên không thêm scanner REST hoặc tải lại toàn bộ market.
- Input causal gồm nến đóng 5m/15m/1h/4h, current Trend Score, volume nguồn/hiện tại, taker 5m, vùng động và BTC health. LONG cần coin 1h+4h UP, score >=14 khi BTC nghiêng/giảm; SHORT cần coin 1h+4h DOWN, score <=-14 khi BTC nghiêng/tăng.
- “Sóng chưa chạy mạnh” được chuẩn hóa bằng khoảng cách thuận hướng tới tâm vùng retest động <=1,2%. Xa hơn thì hiện không đuổi; xuyên ngược vùng thì chờ reclaim/từ chối. Trạng thái đủ điều kiện quan sát cần thêm trigger 5m hiện hữu. Điểm 0–100 chỉ xếp hạng trend/volume/proximity/trigger, không phải WinRate.
- `allowLongEntry/allowShortEntry` không chặn phép quan sát divergence này. Tuy vậy toàn page là `OBSERVE ONLY`: không Discord, không Binance, không đổi entry/size/leverage/SL/TP hoặc vị thế/order đang mở.
- Không đổi JSON/server state; client cũ không bị ảnh hưởng, snapshot thiếu pool hiện rỗng. Không tạo nhãn runtime/card giao dịch hay WHITELIST mới; policy OFF và điều kiện CLOSED AvgROE >4% giữ nguyên.

# 2026-09-28 — BTC_RELATIVE_STRENGTH_DISCORD_V1_NEAR_READY_20260928

- Nối webhook riêng cho `/btc-relative-strength-watch`. Chỉ hai trạng thái được gửi: `GẦN VÙNG · CHỜ 5M` và `ĐỦ ĐIỀU KIỆN QUAN SÁT`; payload tô rõ vùng entry xanh cho LONG, đỏ cho SHORT và hiển thị live/distance, trend 15m/1h/4h, volume/taker, BTC context cùng mốc vô hiệu.
- Input hoàn toàn causal trước entry: pool xu hướng còn hạn, nến đóng, vùng động và BTC health; MARK socket chỉ so khoảng cách. Yêu cầu bối cảnh ngược BTC active, `nearEntry=true`, zone/live hợp lệ và setup chưa hết hạn; không dùng PnL/outcome/future data.
- Dedupe theo coin + side + nguồn setup + stage, nên một setup có thể báo gần vùng một lần rồi báo nâng cấp ready một lần. State delivery giữ 7 ngày, giới hạn mặc định 5 tin/scan và có retry/rate-limit safety; con số delivery không phải thống kê hiệu quả giao dịch.
- `OBSERVE ONLY`: không thay Binance, entry, size, leverage, SL/TP, protection hay order/position đang mở. API chỉ thêm field configured; state JSON mới độc lập, file cũ không migrate. Không có matcher/card giao dịch mới nên không thêm WHITELIST; policy OFF và CLOSED AvgROE `>4%` giữ nguyên.

# 2026-09-28 — BTC_RELATIVE_STRENGTH_READY_MARKET_2USDT_MAX50_V1_20260928

- Nối real executor cho đúng state đã có `RELATIVE_ENTRY_READY` trên `/btc-relative-strength-watch`, cả LONG và SHORT. `GẦN VÙNG · CHỜ 5M` tiếp tục chỉ Discord; Discord READY nay nói rõ Binance chỉ “được xét”, không khẳng định lệnh đã khớp.
- Input causal gồm pool active, nến đóng 5m/15m/1h/4h, Trend Score ±14, volume/taker 5m, vùng động và BTC context ngược hướng. Bổ sung `lastClosed5mAt` để executor xác minh chính xác nến đóng tạo pass; MARK chỉ kiểm tra drift `<=0,5%` và khoảng cách vùng `<=1,2%` ngay trước submit.
- Tín hiệu phải mới <=90 giây và sinh sau process start + route enabledAt; tín hiệu cũ không replay. Có dedupe theo setup+nến pass, cooldown coin 4 giờ, không DCA, chặn position/order đã có và kiểm tra lại switch ngay trước submit.
- Hai route Auto Controls dùng 2 USDT margin ×5, TP +10% ROE, SL LONG −20% / SHORT −30%, full-fill anchored protection và max50. Policy authorization riêng, payload copy/giả mạo không được phép đặt lệnh.
- State executor/attempt là JSON mới; API chỉ thêm execution status, consumer cũ tương thích. Không tạo label/card thống kê mới: dùng exact state hiện hữu `RELATIVE_ENTRY_READY`, route được bật tại Auto Controls; Liquid Card WHITELIST/AvgROE policy cũ không đổi.

# 2026-09-28 — BTC_RELATIVE_STRENGTH_READY_MARKET_2USDT_TP_ONLY_MAX50_V2_20260928

- Chuyển exact route `RELATIVE_ENTRY_READY` LONG/SHORT sang TP-only cho entry mới: MARKET `2 USDT ×5`, TP `+10% ROE` neo full-fill, không tạo SL gốc. Executor ép toàn bộ field SL về `null`; private policy V46 từ chối payload cố gắn `stopLossRoePct`, giá SL hoặc distance SL.
- Input/phân loại/thống kê giữ nguyên V1: nến đóng 5m/15m/1h/4h, trend ±14, volume/taker, vùng động và BTC ngược hướng; freshness 90 giây, drift 0,5%, vùng 1,2%, max50, no replay/DCA và cooldown 4 giờ. Route/label giữ nguyên nên chuỗi stats không bị tách.
- Chỉ thay protection cho entry mới; không hủy/sửa SL, TP, order hay position hiện có. Profit-lock chung sau khi vị thế có lãi vẫn chạy để chống trả ngược lợi nhuận.
- JSON/state/API tương thích, không migration. Không có label/card mới nên không thêm WHITELIST; mặc định OFF và điều kiện CLOSED AvgROE `>4%` giữ nguyên.

# 2026-09-28 — AUTO_BTC_LONG_ENTRY_GUARD_V1_RELATIVE_STRENGTH_EXCEPTION_20260928

- Thêm cổng sớm trong `placeOrder` và defense-in-depth quanh signed Binance client để phủ cả executor legacy đi trực tiếp: mọi entry `BUY` tự động cần snapshot Market Regime mới và `allowLongEntry=true`; `RISK_OFF`, `RECOVERY_TEST`, `WAIT_DATA` hoặc snapshot thiếu/cũ đều chặn trước entry submit với code `AUTO_LONG_BLOCKED_BTC_MARKET_REGIME`.
- Input causal trước entry giữ nguyên từ breadth 15m/30m đã đóng, taker-buy, DUMP shock, socket freshness và quiet/confirmation window; không dùng PnL/outcome/tương lai. Không tạo thống kê hiệu quả mới.
- Ngoại lệ duy nhất là private authorization reason của exact `btc-relative-strength-watch / RELATIVE_ENTRY_READY`, được truyền xuống signed-client bằng marker `Symbol` không enumerable; payload chỉ tự ghi source/label không vượt được gate. SHORT, reduce-only protection/close, lệnh tay và dry-run giữ nguyên.
- Chỉ chặn entry LONG tự động mới; không hủy order cũ, không đổi/đóng position, size, leverage, TP, SL hoặc protection. Không đổi JSON/state/API, không thêm label/card/WHITELIST; policy CLOSED AvgROE `>4%` giữ nguyên.

# 2026-09-28 — BTC_RELATIVE_STRENGTH_SHORT_ON_BTC_DOWNTREND_PULLBACK_V4_20260928

- Mở thêm timing SHORT trên `/btc-relative-strength-watch`: không còn bắt buộc chờ BTC chuyển hẳn sang UP. Khi BTC vẫn `DOWN_STRONG/DOWN_LEAN`, hệ thống nhận nến hồi BTC 5m đã đóng và chỉ chọn coin tiếp tục xả mạnh hơn BTC.
- Detector `BTC_RELATIVE_BTC_PULLBACK_5M_CLOSED_V1_20260928` dùng nến đóng causal: BTC 5m tăng `0,08–0,75%`, ba nến trước giảm ít nhất `0,12%`, thân/range `>=25%`, taker-buy BTC `>=50%`, cửa sổ mới tối đa 120 giây. BTC và coin phải dùng cùng timestamp nến đóng.
- Coin SHORT cần giữ 1h+4h DOWN, Trend Score `<=-14`, coin 5m giảm `>=0,15%`, underperform BTC `>=0,25` điểm %, volume 5m `>=1,0x`, volume 15m `>=0,75x`, taker-buy `<=45%`, gần vùng động `<=1,2%` và trigger 5m hiện hữu. Nhánh BTC UP cũ và LONG không đổi.
- Không tạo signal key/cohort mới: pass vẫn là exact `RELATIVE_ENTRY_READY`; UI/Discord thêm context `BTC_DOWNTREND_PULLBACK_SHORT` và in move BTC/coin/chênh lệch để audit. Thống kê attempt/fill/closed PnL tiếp tục chung route cũ, chưa coi là backtest hay WinRate riêng.
- Binance chỉ mở rộng gate cho route SHORT đang bật: MARKET `2 USDT ×5`, TP `+10% ROE`, không SL gốc, max50, no replay/no DCA/cooldown 4 giờ và recheck MARK/freshness như V2. Không đụng position/order đang mở hoặc protection hiện hữu.
- JSON chỉ thêm `btcPullback5m` và `last5mMovePct`; dữ liệu cũ thiếu field sẽ fail-closed riêng nhánh pullback, không migration/replay. Không có nhãn/card mới nên không thêm WHITELIST; checkbox route hiện hữu và policy CLOSED AvgROE `>4%` giữ nguyên.


# 2026-09-29 — BTC_RELATIVE_STRENGTH_CAUSAL_ALPHA_IN_ZONE_ONE_SETUP_V5

- Áp lại exact `RELATIVE_ENTRY_READY` sau audit khoảng 130 fill: closed-only đang dương nhưng bị lệch TP-only/right-censoring, điểm >=90 không vượt nhóm 80–89 và phần lớn Discord READY cũ nằm ngoài entry zone. Kết quả cũ chỉ là lý do đổi rule, không được gắn thành WinRate của V5.
- Input trước entry hoàn toàn causal: return coin/BTC trên cùng chuỗi nến 5m đã đóng, cửa sổ 3 nến/15m và 12 nến/1h, timestamp lệch tối đa 5 giây; cộng structure 1h+4h, Trend Score, volume/taker, vùng động và MARK recheck. Không dùng PnL/outcome/tương lai.
- LONG giờ chỉ pass với BTC `DOWN_STRONG`, alpha coin−BTC >=0,25 điểm %/15m và >=0,50 điểm %/1h. `DOWN_LEAN` và thiếu alpha chỉ quan sát. SHORT pullback/UP-context giữ rule V4. READY bắt buộc MARK ở trong biên entry thật và nến 5m xác nhận; gần tâm <=1,2% nhưng ngoài biên chỉ gửi stage chờ.
- `relativeScore` chỉ còn là điểm xếp hạng causal, không xác suất. Audit phân cohort bằng executor version + `contextMode`; chưa có CLOSED sample cho V5. Không thêm label/card/WHITELIST mới; exact key và checkbox route giữ nguyên, default OFF/AvgROE >4% giữ nguyên.
- Binance cho entry mới vẫn MARKET 2 USDT margin x5, TP +10% ROE, không SL gốc, max50, freshness/drift/no-position/no-order/no-DCA không đổi. Mỗi source confirmation chỉ được đi tới submit một lần, kể cả submit lỗi không rõ kết quả; position/order/protection đang mở không bị sửa.
- Versions: UI V5, executor V4, Discord V5. JSON additive returns tương thích consumer cũ; state executor thêm `setups` và tự suy ra consumed setup từ attempt legacy thành công/đang submit/lỗi không rõ. Record cũ thiếu alpha fail-closed riêng LONG READY.

# 2026-09-29 — Gỡ đúng global BTC LONG guard thêm từ chat

- Version `AUTO_BTC_LONG_GLOBAL_GUARD_REMOVED_V2_ROUTE_LOCAL_20260929` gỡ hai điểm hook của `AUTO_BTC_LONG_ENTRY_GUARD_V1`: gate chung trong `placeOrder` và wrapper quanh signed Binance client. Module ngoại lệ riêng cho `RELATIVE_ENTRY_READY` cũng được bỏ vì không còn global gate để vượt qua.
- Thay đổi chỉ hoàn tác phần chặn LONG toàn cục được thêm từ yêu cầu chat trước. Các detector/executor vẫn tự đánh giá BTC/Market Regime nếu rule riêng của route yêu cầu; khóa tổng, checkbox exact route, private authorization, freshness, chống trùng, max-position và no-DCA giữ nguyên.
- Dữ liệu causal trước entry trở lại theo từng chiến lược: nến đóng, BTC context, volume/taker, vùng entry và MARK recheck của route. Không dùng PnL/outcome/tương lai. Không tạo logic phân loại hay điểm số mới.
- Không còn code block chung `AUTO_LONG_BLOCKED_BTC_MARKET_REGIME`, nên BTC SW up hoặc snapshot `allowLongEntry=false` không tự động chặn sạch mọi LONG. Rule V5 của `RELATIVE_ENTRY_READY` không đổi và vẫn tự yêu cầu `DOWN_STRONG` + alpha + đúng vùng + xác nhận 5m.
- Không đổi entry, size, leverage, TP/SL/protection hay position/order đang mở; không tự bật route OFF. Không đổi JSON/API/state và không migration. Không thêm label/card/runtime matcher/WHITELIST; default OFF và điều kiện CLOSED `AvgROE >4%` giữ nguyên.

# 2026-09-29 — AI Local Qwen3 8B đánh giá xu hướng OBSERVE ONLY

- Cài Ollama `0.34.4` và model `qwen3:8b`; thêm page `/local-ai-trend-evaluation` cùng API cache/manual refresh. Backend WSL gọi Ollama Windows localhost qua bridge `curl.exe`, không bind model ra LAN và không chạy inference theo từng tick.
- Version `LOCAL_AI_TREND_EVALUATOR_V1_QWEN3_8B_OBSERVE_ONLY_20260929`. Input trước đánh giá chỉ lấy candidate causal đã có: retest nến đóng, VERY_STRONG active, early watch, structure/score/volume/taker/move, vùng/target engine, BTC health và breadth. Không gửi PnL/outcome/future data; lấy top 10 coin/hướng sau dedupe/ranking deterministic và output đúng một case tốt nhất mỗi hướng hiện có với reasons/risks ngắn để giữ thời gian CPU hữu hạn và tránh JSON bị cắt. Khi BTC health còn seed hoặc thiếu trend 1h/4h, request fail-closed trước Ollama bằng `LOCAL_AI_BTC_CONTEXT_NOT_READY`, tránh cache nhận định sinh từ context rỗng.
- Structured Output chỉ cho model phân loại bối cảnh, bias, đường đi, horizon và độ rõ. Shortlist top 10 giữ quota 5 LONG + 5 SHORT khi có đủ dữ liệu hai phía. Schema runtime bắt buộc đồng thời `longCandidate` và `shortCandidate`, khóa side và enum symbol theo shortlist nên model không thể bỏ một hướng hoặc tự bịa coin. Server không đọc bất kỳ giá nào do AI tạo; entry zone, invalidation và target hiển thị luôn lấy từ engine định lượng hiện tại. Điểm AI không phải probability/WinRate.
- Thêm kết luận quan sát `LOCAL_AI_OBSERVE_QUALIFICATION_V1_SIX_CRITERIA_20260929`: đủ 6/6 khi AI `PRIORITY`, strength >=65, path retest/continuation, MARK nằm trong vùng engine, không xung đột mạnh BTC/breadth và chưa chạm invalidation. UI tô xanh dòng pass; dòng fail ghi số đạt và điều kiện thiếu. Kết luận này có `runtimeSignalKey=null`, không phải runtime signal/gate và không cấp quyền Binance.
- Page là `OBSERVE ONLY`, không route Auto Controls, không Discord/Binance, không đổi entry/size/leverage/SL/TP/protection hay vị thế/lệnh đang mở. Cache RAM 5 phút giảm CPU; restart chỉ mất cache và không cần migrate JSON.
- Không thêm runtime signal label/card thống kê/WHITELIST. Các chữ PRIORITY/WATCH/WAIT/AVOID và `ĐẠT ĐỦ ĐIỀU KIỆN` chỉ là UI view; số pass là đếm snapshot, không phải WinRate. Muốn cấp quyền giao dịch sau này bắt buộc có walk-forward/CLOSED cohort, `AvgROE >4%`, exact matcher + checkbox mặc định OFF, tests và cập nhật tài liệu mới.

# 2026-09-29 — AI Local Discord PRIORITY/WATCH và đổi hướng BTC

- Thêm notifier `LOCAL_AI_TREND_DISCORD_V1_PRIORITY_WATCH_BTC_SHIFT_20260929` tới webhook riêng: AI `PRIORITY` màu xanh, `WATCH` màu vàng; `WAIT/AVOID` không gửi. Tin nhắn ghi qualification x/6, vùng engine, MARK, path/horizon, BTC/breadth, lý do/rủi ro và nhãn `OBSERVE ONLY`.
- Dữ liệu trước cảnh báo giữ causal từ evaluator: nến đóng, ranking/candidate hiện hữu, engine zone/invalidation/target, MARK và BTC/breadth tại thời điểm đánh giá; không dùng PnL/outcome/future data. Auto evaluation mặc định 10 phút, start delay 120 giây, dùng cache 5 phút và khóa chống inference chồng.
- BTC được kiểm tra mỗi 30 giây từ return nến đóng 15m/1h: `UP` tại +0,25%/15m hoặc +0,55%/1h có xác nhận dấu; `DOWN` đối xứng. Lần đầu chỉ baseline; chỉ transition thật mới gửi xanh/đỏ, có candle dedupe và cooldown 15 phút. BTC shift là context alert để chạy lại AI, không phải signal entry.
- Dedupe candidate theo `symbol|side|verdict|sourceClosedAt`, cooldown 30 phút, tối đa 3 tin/evaluation; state mới giữ delivery 7 ngày. Thống kê này không phải WinRate. API chỉ thêm object `discord`, JSON cũ tương thích và thiếu webhook không làm hỏng evaluator.
- Hoàn toàn không ảnh hưởng Binance, entry, size, leverage, SL/TP/protection hay order/position hiện hữu. Không tạo runtime signal/card/matcher nên không thêm WHITELIST; `runtimeSignalKey=null`, policy default OFF/CLOSED AvgROE `>4%` giữ nguyên.

# 2026-09-29 — AI Local báo BTC trở lại bình thường

- Nâng notifier lên `LOCAL_AI_TREND_DISCORD_V2_PRIORITY_WATCH_BTC_RECOVERY_20260929`. Ngoài transition mạnh `UP` xanh/`DOWN` đỏ, nay `UP→NEUTRAL` gửi xanh dương `BTC ĐÃ DỪNG TĂNG MẠNH`, còn `DOWN→NEUTRAL` gửi `BTC ĐÃ DỪNG GIẢM MẠNH`.
- Recovery dùng đúng return BTC 15m/1h từ nến 5m đã đóng và hysteresis 60% so với threshold V1: thoát DOWN tại `>-0,15% / 15m` đồng thời `>-0,33% / 1h`; thoát UP đối xứng `<+0,15%` và `<+0,33%`. Vùng trung gian giữ strong state, tránh nhấp nháy quanh biên. Không dùng nến live, PnL, outcome hoặc dữ liệu tương lai; cảnh báo không khẳng định đảo chiều.
- Recovery gửi ngay khi transition xác nhận, không bị cooldown strong 15 phút chặn; vẫn dedupe theo `previousDirection|closedAt`, còn state lặp/`NEUTRAL→NEUTRAL` không gửi. State V1 đọc tương thích và tự bổ sung timestamp recovery/strong mới, không replay/migrate order.
- Không đổi candidate classification/statistics, không ảnh hưởng Binance, entry, size, leverage, SL/TP/protection hoặc vị thế/lệnh hiện hữu. Không thêm runtime signal/card/matcher, nên không có checkbox WHITELIST mới; default OFF và CLOSED AvgROE `>4%` giữ nguyên.

# 2026-09-30 — Khôi phục Ollama và dự báo xu hướng BTC

- Audit runtime xác nhận AI altcoin đã gửi 30 record đến 01:18:58 rồi dừng vì Ollama port `11434` offline; BTC alert vẫn tiếp tục do scanner deterministic độc lập. Khởi động lại `ollama.exe serve` và xác nhận `qwen3:8b` hiện diện.
- Thêm `LOCAL_AI_OLLAMA_WATCHDOG_V1_WINDOWS_SERVE_RECOVERY_20260930`: health mỗi 60 giây, tự chạy lại service ẩn, chờ tối đa 12 giây, cooldown restart 60 giây; POST manual cũng tự cứu. Việc phục hồi service không thay đổi model input/output hoặc logic altcoin.
- Nâng Discord thành `LOCAL_AI_TREND_DISCORD_V3_ALT_BTC_SHIFT_RECOVERY_FORECAST_20260930`. Mỗi evaluation phân loại dự báo BTC thành `UP_STRONG/SW_UP/DOWN_STRONG/SW_DOWN/RANGE/UNCLEAR` từ market regime + bias của model, dùng BTC return nến đóng/trend/RSI/funding và breadth hiện có. Màu forecast tách theo hướng; điểm hiển thị là độ rõ, không phải probability.
- Forecast gửi lần đầu, khi đổi hướng hoặc refresh một lần mỗi 60 phút; state `btcForecast` additive chống trùng. Altcoin PRIORITY/WATCH và BTC strong/recovery giữ nguyên. Dữ liệu trước dự báo không có PnL/outcome/future candles; delivery không phải WinRate.
- Toàn bộ vẫn OBSERVE ONLY: không Binance, không entry/size/leverage/SL/TP/protection và không sửa order/position. JSON V2 tự bổ sung state forecast mặc định; API field mới additive. Forecast không có runtime matcher/card trading nên không thêm checkbox WHITELIST; default OFF và CLOSED AvgROE `>4%` giữ nguyên.

# 2026-09-30 — Chatbot AI hỏi xu hướng altcoin

- Thêm version `LOCAL_AI_TREND_CHAT_V1_CAUSAL_ALTCOIN_QA_OBSERVE_ONLY_20260930` ngay trong page AI Local và endpoint `/api/local-ai-trend-chat`. Chat dùng `qwen3:8b` local, câu hỏi gợi ý hoặc tên coin cụ thể; mỗi lần hỏi mới chạy model, không inference theo từng tick và không gửi Discord.
- Input trước trả lời chỉ gồm snapshot causal hiện tại: tối đa 40 candidate Coin Level từ retest đóng/pool mạnh/early watch, structure nến đóng 5m/15m/1h/4h, trend/entry score, volume/taker/move, vùng engine, BTC health, breadth và evaluation gần nhất. Hỏi coin cụ thể chỉ đưa coin đó vào context; hỏi tổng quát lấy top 12. Không có PnL, outcome, future candle hoặc dữ liệu sau entry.
- Structured Output phân loại LONG/SHORT/NEUTRAL, UP/DOWN/MIXED/RANGE/UNCLEAR và độ rõ 0–100 không phải xác suất. Server chỉ chấp nhận symbol có trong candidate context; coin không có được báo thiếu dữ liệu. Giá, vùng, invalidation và target chỉ lấy nguyên từ engine, không cho model tự bịa.
- Thống kê chỉ có token/latency inference để quan sát tải, không có WinRate/AvgROE/cohort. Hội thoại giữ trong RAM tab, không tạo state JSON hoặc migration; endpoint là additive và client cũ tương thích.
- Hoàn toàn `OBSERVE ONLY`, `binanceEligible=false`: không thay Binance, entry, size, leverage, SL/TP/protection hoặc order/position. Chat có `runtimeSignalKey=null`, không phải card/matcher giao dịch nên không thêm checkbox WHITELIST; default OFF và điều kiện CLOSED `AvgROE >4%` giữ nguyên.

# 2026-09-30 — Chatbot hybrid: hỏi coin bất kỳ và feature-vector retrieval

- Nâng lên `LOCAL_AI_TREND_CHAT_V2_HYBRID_DIRECT_SYMBOL_FEATURE_VECTOR_20260930`. Câu hỏi có mã futures cụ thể như `QNT`/`QNTUSDT` không còn phụ thuộc candidates: server resolve theo danh sách hợp đồng đang giao dịch và tải Coin Level trực tiếp, tối đa ba coin/lượt.
- Nhánh exact-symbol dùng causal Coin Level: nến đóng/trend 5m/15m/1h/4h, MARK/24h, recommendation xác nhận, support/resistance, plan engine/invalidation/target, LiqScan/CoinGlass và BTC context. Nó trả ngay bằng deterministic engine (`COIN_LEVEL_DIRECT_ENGINE`), không chờ Qwen và không tự tạo giá.
- Câu hỏi tổng quát vẫn gọi Qwen nhưng shortlist được lọc trước bằng vector đặc trưng định lượng: intent LONG/SHORT, trend strength, volume và khoảng cách entry. Đây không phải embedding/vector DB; dữ liệu số thị trường được ưu tiên hơn similarity của văn bản. Chỉ top 12 mới vào context model.
- Trend lớn và timing hiện tại được tách: ví dụ khung lớn UP nhưng stance breakdown 15m có thể trả trend UP và side SHORT/LOW_PRIORITY cùng cảnh báo xung đột. Điểm retrieval/clarity không phải xác suất và không tạo WinRate/cohort.
- JSON additive (`directLookup`, retrieval/directCoins), không state/migration. Toàn bộ OBSERVE ONLY, không Binance/entry/size/SL/TP/protection. Không có runtime card/matcher nên không thêm WHITELIST; default OFF/CLOSED AvgROE `>4%` giữ nguyên.

## 2026-09-30 — Tô màu hỗ trợ/kháng cự trong chatbot

- Exact-symbol answer thêm tối đa hai `supports` và hai `resistances` trực tiếp từ Coin Level. UI hiển thị hỗ trợ xanh, kháng cự đỏ, có biên low–high và confidence để phân biệt nhanh.
- Không đổi dữ liệu trước phân loại, trend/side, retrieval hoặc thống kê; các badge chỉ trình bày vùng engine, không phải xác suất hay tín hiệu entry. JSON additive, không migration.
- Không ảnh hưởng Binance/entry/size/SL/TP/protection. Không tạo runtime signal/card thống kê/matcher nên không thêm WHITELIST; default OFF và CLOSED AvgROE `>4%` giữ nguyên.

## 2026-09-30 — Order book và kịch bản vùng quét trong chatbot

- Nâng chatbot lên `LOCAL_AI_TREND_CHAT_V3_ORDERBOOK_LIQUIDITY_SCENARIO_OBSERVE_ONLY_20260930`. Exact-symbol answer có cụm BID/ASK Binance kèm notional, vùng trên/dưới từ LiqScan và CoinGlass, hướng lực hút cùng confidence.
- Input causal lấy từ Coin Level: order-book zones, LiqScan dominant side/kill zone và CoinGlass nearest above/below/agreement. Engine target có sẵn được ưu tiên; hai nguồn đồng hướng mới gắn HIGH, một nguồn MEDIUM, xung đột bắt buộc `CONFLICT/LOW` và không chọn phía.
- UI tô BID xanh lam, ASK hồng, vùng quét trên cam và vùng dưới xanh dương. Đây là kịch bản thanh khoản tham khảo, không phải xác suất hoặc dự báo chắc chắn; order book có thể bị rút.
- JSON thêm `orderBook`/`liquidityScenario`, tương thích cũ và không state/migration. Không ảnh hưởng Binance, entry, size, leverage, SL/TP/protection. Badge chỉ là UI, không runtime matcher/card thống kê, nên không thêm WHITELIST; default OFF/CLOSED AvgROE `>4%` giữ nguyên.

## 2026-09-30 — Discord AI Local tô màu theo LONG/SHORT

- Nâng notifier thành `LOCAL_AI_TREND_DISCORD_V4_SIDE_COLOR_LONG_GREEN_SHORT_RED_20260930`: LONG xanh, SHORT đỏ ở cả icon title và thanh màu embed. `PRIORITY/WATCH` vẫn hiển thị bằng chữ nhưng không còn khiến SHORT thành xanh/vàng.
- Không đổi dữ liệu causal, điều kiện gửi, qualification, dedupe/cooldown hay thống kê delivery. Đây chỉ là presentation, không phải signal/tier/gate mới.
- Không ảnh hưởng Binance/entry/size/SL/TP/protection, không đổi state schema hoặc replay. Không có matcher/card mới nên không thêm WHITELIST; default OFF/CLOSED AvgROE `>4%` giữ nguyên.

## 2026-09-30 — Tách xu hướng nến khỏi lực hút thanh khoản

- Nâng chatbot lên `LOCAL_AI_TREND_CHAT_V4_TREND_LIQUIDITY_CONFLICT_AWARE_20260930`. Direct lookup nay gắn snapshot LiqScan mới nhất giống API Coin Level; sửa trường hợp chatbot chỉ thấy CoinGlass và gọi lực hút phía trên là dự báo tăng.
- Kết luận mới có ba lớp: thanh khoản đồng hướng trend, lực hút ngược trend (chỉ là khả năng hồi/quét), hoặc LiqScan–CoinGlass xung đột. Xung đột luôn LOW và không chọn phía; UI ghi trend nến riêng.
- Case xác nhận ZAMA lúc sửa: bốn khung đều DOWN, LiqScan BELOW 97,44% nhưng CoinGlass UPPER 100%; phải hiện `XU HƯỚNG DOWN · THANH KHOẢN XUNG ĐỘT`, không phải nghiêng lên.
- Không đổi thống kê hiệu quả và không tác động Binance/entry/size/SL/TP/protection. JSON chỉ thêm field, không migration. Không runtime matcher/card/WHITELIST mới; default OFF/CLOSED AvgROE `>4%` giữ nguyên.
# 2026-09-30 — Local AI chatbot V5 bounded busy lock

- Giới hạn một câu hỏi Ollama tổng hợp tối đa 120 giây và không fallback/retry qua Windows curl sau `AbortError`/`TimeoutError`, tránh giữ khóa gần gấp đôi.
- Tra cứu coin trực tiếp vẫn chạy qua Coin Level deterministic khi Ollama tổng hợp đang bận. UI/API hiển thị thời gian đã chạy và trần timeout.
- Không đổi điều kiện tín hiệu, thống kê, Binance/entry/size/SL/TP hay JSON cũ; đây là `OBSERVE ONLY`, không có card/nhãn mới và không phát sinh checkbox `WHITELIST`.
# 2026-09-30 — Local AI chatbot V6 fast aggregate retrieval

- Các câu hỏi danh sách/xếp hạng phổ biến trả trực tiếp từ feature-vector causal, tối đa 5 altcoin, thay vì bắt Qwen3:8b tổng hợp lại; `BTCUSDT` chỉ làm bối cảnh và không lọt vào kết quả altcoin. Câu hỏi coin cụ thể tiếp tục dùng Coin Level trực tiếp.
- Câu mở dùng Qwen giảm còn context 4096, tối đa 400 token và timeout 60 giây. Kết quả nhanh có `fastAggregate=true`, model `QUANT_FEATURE_VECTOR_ENGINE`.
- Chỉ `OBSERVE ONLY`; không thay đổi thống kê, Binance/entry/size/SL/TP, JSON cũ hoặc `WHITELIST`.
- UI hotfix V6: nút `Hỏi AI` và bốn nút gợi ý có thêm `pointerdown` trực tiếp bên cạnh `submit`/`Enter`, khắc phục trường hợp browser nhận focus nhưng không phát sinh click/submit. Không đổi dữ liệu hay kết luận AI.
- UI hotfix V6.1 (`v14`): bổ sung handler cấp trang, script thường, bỏ `pointerdown.preventDefault()`, giữ `mousedown/click/submit/Enter` và thêm tự gửi sau 1,2 giây dừng gõ. Timer bị hủy ngay khi `askChat` bắt đầu và busy guard chống gửi trùng. Giữ nguyên dữ liệu causal, phân loại, thống kê và JSON; hoàn toàn `OBSERVE ONLY`, không ảnh hưởng Binance/entry/size/SL/TP và không tạo WHITELIST mới.

# 2026-09-30 — Local AI chatbot V7 không treo ở câu thứ hai

- Nâng backend thành `LOCAL_AI_TREND_CHAT_V7_CURL_SAFE_FALLBACK_20260930`, UI `v15`. Khi evaluator nền đang chạy hoặc Ollama chỉ truy cập được qua `windows-curl`, câu hỏi mở không chờ timeout 60 giây nữa mà trả ngay bằng `QUANT_FEATURE_VECTOR_FALLBACK`; lỗi/timeout Qwen local-http cũng fallback.
- Dữ liệu causal, điều kiện direct-symbol, feature ranking, giới hạn tối đa 5 coin và cách thống kê giữ nguyên. `fallbackReason` chỉ audit kỹ thuật, không phải signal/tier/gate; UI không còn gọi lượt evaluation nền là “câu hỏi tổng hợp đang xử lý”.
- JSON additive, không state/migration. Toàn bộ `OBSERVE ONLY`, không ảnh hưởng Binance/entry/size/leverage/SL/TP/protection và không tạo matcher/card/checkbox WHITELIST mới; default OFF/CLOSED `AvgROE >4%` giữ nguyên.

# 2026-09-30 — Chatbot chỉ dùng order book Binance Futures

- Nâng lên `LOCAL_AI_TREND_CHAT_V8_BINANCE_ORDERBOOK_ONLY_20260930`, UI `v16`. BID/ASK/notional lấy từ Binance Futures Depth; hướng quét, dominant percent và vùng kill/sweep chỉ lấy từ Binance LiqScan. CoinGlass bị loại khỏi toàn bộ phép chọn hướng/confidence và khỏi phần hiển thị order book.
- Trend nến đóng 5m/15m/1h/4h vẫn là lớp chính. Binance liquidity cùng trend là `TREND_LIQUIDITY_ALIGNED`, ngược trend là `COUNTER_TREND_LIQUIDITY_PULL`; order book không được phép tự đảo xu hướng nến.
- Thống kê chỉ trình bày zone/notional/dominance hiện tại, không phải WinRate/xác suất và có rủi ro lệnh chờ bị rút. JSON giữ field cũ CoinGlass bằng `null`, thêm source Binance; không state/migration.
- Hoàn toàn `OBSERVE ONLY`, không ảnh hưởng Binance entry/size/leverage/SL/TP/protection và không tạo matcher/card/checkbox WHITELIST mới; default OFF/CLOSED `AvgROE >4%` giữ nguyên.

# 2026-09-30 — Khôi phục Ollama, giữ order book chỉ từ Binance

- Nâng chatbot lên `LOCAL_AI_TREND_CHAT_V9_OLLAMA_BINANCE_ORDERBOOK_20260930`, UI `v17`. Gỡ early-return deterministic của exact-symbol và gỡ gate bỏ model chỉ vì transport `windows-curl`: cả câu hỏi coin và tổng hợp đều đưa context causal qua `qwen3:8b` trước; chỉ fallback khi Ollama lỗi/timeout.
- Input exact-symbol trước model chỉ gồm đúng coin được hỏi: nến đóng 5m/15m/1h/4h, volume/market, vùng engine, support/resistance và Binance Futures Depth/LiqScan raw; không còn gửi kèm top-12/aggregate evaluation. Loại hoàn toàn CoinGlass cùng direction assessment trộn nguồn khỏi prompt. Chặn từ khóa `ORDER/BOOK/MARKET/LONG/SHORT` bị nhận nhầm thành symbol khi không có hậu tố `USDT`. Nến là hướng chính; order book Binance là lớp phụ có thể bị rút.
- Structured output exact-symbol dùng context 2048; một coin chỉ trả object side/trend/clarity/reason tối đa 64 token, nhiều coin mới dùng `assessments`. Schema khóa hướng hợp lệ và không cho model trả giá/entry/BTC context/rủi ro; server luôn ghép lại câu trả lời cùng các phần deterministic. Khi thành công trả token/latency và `modelApplied=true`; fallback phân biệt timeout/JSON hỏng/unavailable để audit nhưng không phải signal/tier hoặc thống kê hiệu quả.
- Thay đổi hoàn toàn `OBSERVE ONLY`: không Binance order, entry, size, leverage, SL/TP/protection, Discord hoặc position hiện hữu. JSON chỉ thêm field, không migration/state; không có runtime label/card/matcher nên không thêm checkbox WHITELIST, default OFF/CLOSED `AvgROE >4%` giữ nguyên.

## 2026-09-30 — Thẻ AI BTC trên đầu màn hình

- Thêm `LOCAL_AI_BTC_TOP_CARD_V1_20260930` ngay dưới toolbar, trước chatbot: hướng BTC hiện tại 1h/4h, dự báo regime/bias, độ rõ, model/thời điểm và `btcAssessment` của Qwen.
- Ưu tiên evaluation mới nhất. Sau restart khi cache RAM chưa có, dùng hướng/dự báo đã lưu từ notifier Discord AI và ghi rõ đang thiếu lời giải thích mới; không biến state cũ thành nhận định Qwen mới. Màu xanh/đỏ/xanh dương/xám chỉ biểu diễn UP/DOWN/RANGE/UNCLEAR, không phải signal/gate.
- Card OBSERVE ONLY, không đổi Binance/entry/size/leverage/SL/TP/protection, không gửi Discord, không thêm thống kê hiệu quả hoặc JSON/state. Không phải live-card tín hiệu nên không có matcher/WHITELIST; policy mặc định OFF/CLOSED AvgROE >4% không đổi.
- Test DOM/render/asset cache PASS cùng các suite chatbot, BTC intent, Discord và PRIORITY-zone.
- Xác minh public: HTML/CSS/JS v22 đã có card và renderer; snapshot gần nhất hiện `btcDirection=UP`, `btcForecast=UP_STRONG`. Không POST evaluation hoặc phát Discord trong bước kiểm tra giao diện.

## 2026-09-30 — Chatbot hai chế độ: V2 nhanh hoặc Ollama + order book

- Version `LOCAL_AI_TREND_CHAT_V11_DUAL_DIRECT_OR_ORDERBOOK_20260930`, UI v21. Thêm selector trước ô hỏi: `Nhanh · Coin Level · không order book` mặc định và `Ollama · có Binance order book`.
- Coin cụ thể ở mode nhanh dùng đúng luồng V2: Coin Level causal (nến/trend/plan/vùng engine) trả trực tiếp, không gọi model, không dùng/hiển thị Depth/LiqScan. Mode order-book giữ luồng V10 gọi Qwen với Binance Futures Depth/LiqScan. Câu hỏi tổng hợp/BTC vẫn gọi model. Selector bị khóa trong lúc request để không trộn mode.
- `analysisMode` và model/latency/token là audit, không phải phân loại giao dịch hay hiệu quả. Request cũ thiếu mode vẫn theo Ollama/order-book; UI mới mặc định direct. JSON response cũ giữ nguyên, direct cố ý để zone orderbook rỗng/null; không migration.
- Cả hai OBSERVE ONLY; không ảnh hưởng Binance/entry/size/leverage/SL/TP/protection, Discord, PRIORITY route hay evaluator nền. Không card/matcher/WHITELIST mới; default OFF/CLOSED AvgROE >4% không đổi.
- Test xác nhận direct không chạm Ollama/OB, order-book vẫn dùng model, cùng các suite BTC/evaluator/Discord/Binance PRIORITY đều PASS.
- Xác minh public sau reload: HTML đã có selector/default direct/asset v21; QNT direct trả khoảng 1,97 giây, `COIN_LEVEL_DIRECT_ENGINE_V2`, `modelApplied=false`, không có orderBook. QNT order-book đi đúng nguồn `BINANCE_FUTURES_DEPTH`/`BINANCE_FUTURES_DEPTH_LIQSCAN`; lượt kiểm tra model trả JSON lỗi nên response fallback sau 35,6 giây, vẫn gắn mode/nguồn rõ ràng. Không phát sinh order hoặc Discord khi test.

## 2026-09-30 — Chatbot BTC trả sai shortlist altcoin: V10

- Version `LOCAL_AI_TREND_CHAT_V10_BTC_INTENT_GROUNDED_FALLBACK_20260930`, UI v20. Nguyên nhân: BTC bị loại khỏi exact-symbol; fallback tổng hợp trả top altcoin cho câu hỏi BTC. Log runtime có timeout Ollama 60 giây; không quy lỗi này cho CoinGlass khi chưa có bằng chứng.
- Input trước trả lời chỉ BTC health cho intent BTC; bỏ candidate/history/evaluation và breadth gate altcoin khỏi prompt. Câu so sánh/coin cụ thể giữ nhánh cũ Binance-only. Dữ liệu thiếu không giả 0; thiếu timestamp/quá 5 phút ghi trạng thái cũ. Live test phát hiện model dùng điều kiện RECOVERY altcoin để đảo BTC tăng thành giảm: schema nay khóa outlook theo hướng 1h/4h hiện tại, condition tách riêng kịch bản tương lai. Server ghép số liệu snapshot và loại schema hỏng/altcoin ngoài chủ đề/mâu thuẫn BTC; không ép dự báo tương lai thành hướng hiện tại.
- Audit thời gian chờ/modelApplied/fallbackReason minh bạch, không phải thống kê hiệu quả giao dịch. Fallback đúng BTC, không giả danh Ollama; UI bỏ auto-send 1,2 giây và chặn chờ vô hạn bằng deadline 90 giây. Kiểm thử hồi quy success/error và nhiều câu liên tiếp.
- Kiểm thử live phát hiện cache chưa đủ 28 nến/khung nhưng health mặc định flat/0: thêm readiness riêng cho chat BTC, không coi mặc định warm-up là đi ngang. RSI/return thiếu giữ null; không dùng 0 giả. GET chat thêm btcContextReady (additive); không sửa health hay gate giao dịch. Health có thể gồm nến đang chạy. Lần kiểm tra này có Binance REST 429 nên kết quả live chỉ đáng xác nhận khi cache nến đủ.
- Xác minh cuối lúc khoảng 20:05 VN trên `https://liquidity.nhathadev.trade`: cache đủ, health 1h/4h UP; hai câu BTC liên tiếp trả bằng `qwen3:8b`, `modelApplied=true`, không fallback, không card altcoin, thời gian 15,7 giây và 8,4 giây. Cả năm suite chatbot, BTC-intent, evaluator, Discord và PRIORITY-zone Binance đều PASS. Chỉ POST API chatbot quan sát để kiểm tra; không gọi đặt lệnh/test Discord.
- OBSERVE ONLY; không ảnh hưởng Binance/entry/size/SL/TP, Discord, evaluator nền hoặc PRIORITY route. JSON additive (intent/elapsedMs), BTC coins rỗng; không migration. Không card thống kê/matcher/WHITELIST mới; default OFF/CLOSED AvgROE >4% không đổi.

## 2026-09-30 — AI PRIORITY chạm vùng engine → MARKET 3 USDT

- Thêm `LOCAL_AI_PRIORITY_ENGINE_ZONE_ENTRY_V1_MARKET_3USDT_20260930`. Không sửa Discord V4: card AI LONG xanh/SHORT đỏ, nội dung và dedupe/cooldown giữ nguyên.
- Input trước entry gồm verdict `PRIORITY` do model tạo từ dữ liệu causal, vùng engine/invalidation từ engine định lượng, rồi MARK Binance live. Qualification 3/6–6/6 tiếp tục hiển thị để giải thích nhưng không chặn route; chỉ PRIORITY được gài, WATCH/WAIT/AVOID bị loại.
- Setup tồn tại tối đa 15 phút. MARK chạm/đi vào/cắt `[entryZone.low, entryZone.high]`, exact route ON, sinh sau `enabledAt`/restart, không position/open entry order và MARK kiểm tra lại còn trong vùng thì submit đúng một lần.
- Binance cho lệnh mới: MARKET `3 USDT ×5`, notional 15, cả LONG/SHORT, max50; TP `+10% ROE`. SL ưu tiên invalidation engine đúng phía và tối đa `50% ROE`; card như ảnh có `Vô hiệu tham khảo 0` dùng fallback `-20% ROE`, không bị loại. Không replay và không sửa vị thế/lệnh hiện hữu.
- Audit chỉ đếm active/attempt/consumed/order id, không suy WinRate/PF/AvgROE. JSON/state additive, tương thích client cũ, không migration. Hai route mặc định OFF. Không có card thống kê/matcher live-card mới nên không thêm WHITELIST; policy CLOSED `AvgROE >4%` không đổi.

## 2026-09-30 — Chatbot không tái dùng vùng LiqScan đã quét

- Nâng chatbot lên `LOCAL_AI_TREND_CHAT_V12_LIQUIDITY_ZONE_LIFECYCLE_20260930`, UI `v23`, CSS `v5`. Trước đây chỉ cần LiqScan còn báo `ABOVE/BELOW` là giao diện tiếp tục gọi vùng đó là mục tiêu phía trên/dưới, kể cả khi MARK đã đi qua hoặc vùng gốc đã có sweep/reject.
- Input causal trước khi trả lời nay mang thêm lifecycle `sweepRejectShort` từ Coin Level. Với snapshot được đọc muộn hoặc sau restart, server tái dựng thêm `sweepRejectShortAtSnapshot` đúng mốc `generatedAt`, nên không mất bằng chứng sweep/reject đã có trong nến causal của snapshot chỉ vì freshness live đã hết. Engine deterministic so MARK với toàn bộ biên vùng và đối chiếu vùng hiện tại có giao vùng đã được theo dõi hay không. Trạng thái gồm active, đang chạm, đã quét, đã quét + reject và đã quét + giữ qua; Ollama không tự suy trạng thái này.
- Vùng đã quét có `active=false`, không còn `primaryTarget` và không còn `likelyDirection` active. Một vùng thanh khoản mới không giao vùng cũ vẫn được hiển thị là vùng mới đang hoạt động. UI tô xám vùng đã tiêu thụ để không nhầm với mục tiêu chưa chạm.
- Thay đổi chỉ `OBSERVE ONLY`, không sửa thống kê hiệu quả, Discord, verdict AI, Binance entry/size/leverage/SL/TP/protection hoặc vị thế hiện hữu. JSON additive, thiếu field mới vẫn fallback theo MARK; không migration/state.
- Không thêm signal/card/matcher giao dịch nên không có checkbox WHITELIST mới; mặc định OFF và policy CLOSED `AvgROE >4%` giữ nguyên. Test bao phủ active, touching, passed, reject và cụm mới không trùng vùng cũ.

## 2026-10-01 — Tự dọn `llama-server.exe` mồ côi

- Thêm `LOCAL_AI_OLLAMA_PROCESS_GUARD_V1_ORPHAN_ONLY_20261001` vào watchdog 60 giây. Guard đọc inventory Windows, chỉ chọn đúng `llama-server.exe` có parent PID đã biến mất và đã sống ít nhất 5 phút; trước khi kill kiểm tra lại PID, tên và parent để tránh race/PID reuse. Child còn thuộc Ollama đang sống không bị tác động.
- Thêm cấu hình bật/tắt, grace và giới hạn kill/lượt. API local-AI trả snapshot guard để audit PID candidate/killed/skipped; test xác nhận giữ live child, giữ orphan còn trẻ, chỉ dọn orphan già và dry-run không kill.
- Cơ chế này không dùng dữ liệu thị trường, không đổi phân loại/tín hiệu/thống kê và không ảnh hưởng Discord hoặc Binance entry/size/leverage/SL/TP/protection. JSON additive, không migration/state. Không có nhãn/card/matcher mới nên không thêm WHITELIST; route giao dịch vẫn mặc định OFF và policy CLOSED `AvgROE >4%` giữ nguyên.

## 2026-10-01 — Discord Binance LiqScan quét + reject hai chiều

- Thêm `LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_V1_TWO_SIDED_20261001`: alert `ABOVE` được theo dõi đến khi nến 5m đã đóng quét vùng trên rồi đóng đỏ trở lại dưới vùng để gửi `SHORT WATCH` màu đỏ; alert `BELOW` đối xứng quét vùng dưới rồi đóng xanh trở lại trên vùng để gửi `LONG WATCH` màu xanh.
- Tracker chạy nền mỗi 30 giây từ alert Binance LiqScan mới và KlineCache, nên không cần người dùng hỏi chatbot mới phát hiện. Chỉ nhận vùng nằm đúng phía MARK lúc alert, yêu cầu chuỗi nến sau alert liên tục, nến mới không quá 6 phút, track 6 giờ, cooldown coin+hướng 4 giờ và chống gửi trùng theo alert+nến reject. Webhook riêng có thể cấu hình, mặc định dùng kênh AI Local hiện tại.
- Bổ sung `LIQ_SCAN_SWEEP_REJECT_LONG_OBSERVE_V1_20261001` và đưa `sweepRejectLong/sweepRejectLongAtSnapshot` vào Coin Level/chatbot để vùng dưới đã quét + reclaim cũng được đánh dấu consumed giống vùng trên. Ollama không tự quyết lifecycle.
- Toàn bộ là `OBSERVE ONLY`: không cấp quyền Binance, không sửa entry/size/leverage/SL/TP/protection và không dùng PnL/outcome. State/API chỉ additive, không migration. Không tạo card thống kê hoặc matcher Binance nên không thêm WHITELIST; route giao dịch vẫn OFF và policy CLOSED `AvgROE >4%` không đổi.

## 2026-10-02 — Tắt Discord LiqScan quét + reject

- Nâng notifier lên `LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_V2_EXPLICIT_OPT_IN_20261002` và tắt cả `LONG WATCH` lẫn `SHORT WATCH` theo yêu cầu. Runtime mặc định `LOCAL_AI_LIQUIDITY_SWEEP_REJECT_DISCORD_ENABLED=false`; không còn lấy `LOCAL_AI_TREND_DISCORD_WEBHOOK_URL` làm fallback. Muốn bật lại phải có đồng thời opt-in `true` và webhook LiqScan riêng hợp lệ.
- Khi OFF, alert mới không được arm; scanner dọn track đang chờ để không gửi trễ sau reload. Phân loại/lifecycle trên Coin Level/chatbot vẫn dùng Binance LiqScan, nến 5m đã đóng và MARK như V1, nhưng delivery trả `enabled=false/configured=false/tracked=0/detected=0/sent=0`. Đây là audit vận hành, không phải thống kê hiệu quả.
- Thay đổi chỉ tắt kênh Discord này, không đổi dữ liệu trước entry, signal/tier/gate, các Discord AI/BTC/PRIORITY khác hoặc Binance entry/size/leverage/SL/TP/protection. State V1 vẫn đọc được; chỉ `tracks` chưa gửi bị dọn, `sent/recent` giữ audit, API thêm boolean `enabled` và client cũ bỏ qua. Không thêm label/card/matcher nên không thêm WHITELIST; default OFF và policy CLOSED `AvgROE >4%` giữ nguyên.

## 2026-10-02 — Thêm FULL BYPASS protection theo coin

- Nâng Auto Controls lên `AUTO_ENTRY_CONTROLS_V32_FULL_POSITION_PROTECTION_BYPASS_20261002` và runtime `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V5_FULL_POSITION_BYPASS_20261002`. Trang `/binance-auto-controls` giữ loại tạm tự gỡ tại `+15%/-25% ROE`, đồng thời thêm loại `Tắt toàn bộ đến khi đóng vị thế`.
- Input runtime chỉ là exact symbol, mode đã persist và xác nhận vị thế Binance. `FULL_POSITION_BYPASS` không đọc ROE để tự gỡ; chỉ nút gỡ tay hoặc close/reversal đã xác nhận mới xóa. Chọn mode mới cho cùng coin loại mode cũ atomically; FULL thắng nếu JSON chứa trùng.
- Đây không phải signal/tier/gate entry: coin vẫn có thể được vào lệnh theo route đang ON. Khi exclusion active, mọi nhánh protection chung bỏ qua tạo/bù/đổi TP/SL, dời TP/SL, profit-lock, missing guard và Fast Wave; không hủy TP/SL đã có hoặc lệnh thủ công. Không đổi size/leverage hay mở thêm quyền entry.
- UI đếm số coin từng danh sách; không phải thống kê hiệu quả. JSON cũ giữ `protectionExclusions`; field mới `protectionFullBypasses=[]` là additive và fail-closed qua restart/corrupt read. Không thêm card/matcher/WHITELIST; policy default OFF và CLOSED `AvgROE >4%` không đổi.

## 2026-10-02 — Sửa Hỏi AI không gửi mã coin ngắn

- Nguyên nhân thực tế được tái hiện trên production: ô nhập có `ct`, nhưng frontend V14 dùng `text.length < 3` rồi return im lặng, nên không có request tới `/api/local-ai-trend-chat`; Ollama vẫn online.
- Nâng `LOCAL_AI_TREND_CHAT_V15_SHORT_SYMBOL_QUERY_20261002` và asset UI `v35`. Frontend gửi mọi input không rỗng; backend chỉ nới 1–2 ký tự khi đã resolve được exact Binance symbol và tải được Coin Level. Chuỗi ngắn không phải coin vẫn fail validation rõ, không gọi model để đoán.
- Đây là sửa UX/validation chatbot `OBSERVE ONLY`; không đổi signal, tier, thống kê, Discord hoặc Binance entry/size/leverage/SL/TP/protection. JSON không đổi, không migration và không thêm card/matcher/WHITELIST; default OFF/CLOSED AvgROE `>4%` giữ nguyên.

# 2026-10-02 — Hover chart order book hiển thị giá

- Nâng chart một coin lên `LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V3_HOVER_PRICE_20261002`, UI JS v36/CSS v9. Rê chuột theo chiều dọc của chart sẽ hiện đường crosshair và tooltip mức giá tương ứng; rời chart thì tooltip ẩn.
- Giá hover chỉ nội suy tuyến tính từ min/max và vùng plot đã render, không gọi thêm Binance/CoinGlass/Ollama. Không thêm phân loại, thống kê hiệu quả hoặc dữ liệu hậu nghiệm.
- Đây là thay đổi hiển thị `OBSERVE ONLY`; không ảnh hưởng Discord, Binance entry/size/leverage/SL/TP/protection, JSON/state hoặc vị thế hiện hữu. Không có card/matcher mới nên không thêm `WHITELIST`; default OFF/CLOSED AvgROE `>4%` giữ nguyên.
# 2026-10-03 — Vượt MAIN KILL + opposite depth phản chiều MARKET 4 USDT

- Executor `LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_BINANCE_V2_REVERSED_SIDE_MARKET_4USDT_20261003`: nến Binance 5m/15m đã đóng vượt toàn vùng và depth ngược lớn hơn. ABOVE/BID dưới lớn ánh xạ SHORT; BELOW/ASK trên lớn ánh xạ LONG.
- Trước entry dùng event causal mới, MARK/position/open-order Binance kiểm tra lại; yêu cầu signal sau process start + `enabledAt`, tuổi không quá 2 phút, exact route ON, không có vị thế/lệnh entry cùng coin và chưa dedupe. Không dùng outcome tương lai.
- Lệnh thật là MARKET `4 USDT margin ×5` (20 USDT notional), TP `+10% ROE`, max50 và fill-anchor protection. LONG có SL `-20% ROE`; SHORT giữ policy bot SHORT TP-only, không SL gốc. Discord ghi `ĐÃ GỬI`, protection thực tế hoặc lý do không vào. Không DCA/replay/sửa lệnh cũ.
- Audit lưu attempt/orderId/TP/SL, không phải thống kê hiệu suất. Snapshot ghi `observeOnly=false`, `binanceEligible=true` và yêu cầu exact route. JSON cũ additive. Route seed OFF và được bật explicit trong lượt này. Không thêm card thống kê/live-card matcher; vì chưa có CLOSED AvgROE `>4%`, không tạo WHITELIST thống kê mới; exact Auto Controls là checkbox quyền chạy.

## 2026-10-03 — Màn hình quản lý thanh khoản ngược chiều

- Thêm `OPPOSITE_LIQUIDITY_MANAGER_V1_READ_ONLY_20261003` tại `/opposite-liquidity-manager`, API read-only và mục `Thanh khoản ngược` vào toàn bộ menu qua navigation V6. Trang gom trạng thái scanner, exact route LONG/SHORT, vùng đang arm, tiến độ nến đóng 5m/15m, tín hiệu Discord gần đây và attempt/order ID/lỗi Binance.
- Dữ liệu trước entry không đổi: trang chỉ đọc state Binance LiqScan/MAIN KILL, nến đóng, visible depth và executor audit đã được V4/V2 tạo. Bộ lọc coin/hướng/khung chỉ thay đổi bảng hiển thị. `lastScan` trong RAM ghi detected/analyzed/qualified/selected/deferred/sent của vòng gần nhất để thấy có bỏ sót do batch hay không; sau restart chờ vòng quét mới.
- Các bộ đếm là telemetry vận hành, không phải WinRate, PF, AvgROE hoặc xác suất. Không thêm nguồn hậu nghiệm, PnL/outcome hay điều kiện phân loại mới. Mapping vẫn ABOVE + BID dưới lớn → SHORT; BELOW + ASK trên lớn → LONG.
- Trang/API không có mutation: không bật/tắt route, không đặt/hủy lệnh và không đổi entry, size `4 USDT ×5`, TP `+10% ROE`, LONG SL `-20% ROE`, SHORT TP-only, protection hoặc vị thế. Auto Controls vẫn là nơi duy nhất thay đổi quyền chạy.
- JSON/state cũ không migration; snapshot/API chỉ additive và client cũ bỏ qua được. Không thêm label/card hiệu suất/matcher, nên không có checkbox WHITELIST mới; exact route vẫn seed OFF và policy chỉ hiện khi CLOSED `AvgROE >4%` không đổi.

## 2026-10-03 — Toast toàn website cho riêng thanh khoản ngược chiều

- Thêm `OPPOSITE_LIQUIDITY_SITEWIDE_TOAST_V1_QUALIFIED_EVENT_20261003`, nâng notifier additive lên `LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_V5_SITEWIDE_BROWSER_TOAST_20261003`. Mọi trang HTML nhận client toast, nhưng client chỉ poll `browserNotifications` từ API quản lý thanh khoản ngược; không nghe BTC, AI PRIORITY, sweep-reject hoặc loại tín hiệu khác.
- Event dùng đúng dữ liệu causal V4 đã qualified sau priority selection: nến 5m/15m đóng vượt MAIN KILL và Binance visible depth phía ngược lớn hơn. Toast hiển thị coin, LONG/SHORT, vùng, tỷ lệ depth, trạng thái Binance và Discord. Discord lỗi vẫn ghi event toast để kênh UI không phụ thuộc webhook.
- Dedupe theo eventId trong localStorage, tối đa bốn toast chi tiết mỗi lượt và tự đóng sau 15 giây. Lần đầu chỉ hiện event không quá 2 phút; state giữ tối đa 100 event/7 ngày, trình duyệt nhớ 200 ID. Đây là audit delivery, không phải thống kê hiệu quả/xác suất.
- Không đổi phân loại, Binance entry, route, size `4 USDT ×5`, leverage, TP/SL/protection hoặc position; không tạo API ghi. JSON cũ mặc định `browserNotifications=[]`, `recent` vẫn giữ nghĩa Discord gửi thành công và không migration/replay.
- Không thêm label/card/matcher mới nên không thêm checkbox WHITELIST; exact Auto Controls và policy CLOSED `AvgROE >4%` giữ nguyên.
