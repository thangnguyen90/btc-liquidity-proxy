# Logic hiện tại: Decision Paper, Recommended Paper và EMA Paper

> Cập nhật: 2026-07-23 (Asia/Bangkok, UTC+7)
>
> Đây là tài liệu đọc nhanh về **logic đang chạy hiện tại**. Khi tài liệu cũ mâu thuẫn với file này, kiểm tra lại code tại `src/intradayDecisionPaper.js`, `src/recommendedSignals.js` và `src/server.js`; code vẫn là nguồn chuẩn cuối cùng.

## 1. Quy ước chung

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

### Liquid Combo Stage 3 (observe-only, 2026-07-23)

Stage 3 gắn nhãn `GOOD+ / GOOD / WATCH / RISK` sau Stage 2 bằng snapshot tại entry. Nhãn chỉ dùng để quan sát, sort, filter và thống kê; tuyệt đối không đổi entry, margin, leverage, SL hoặc TP.

Combo key lưu các thành phần: `side | target kind | distance bucket | BTC correlation | BTC phase | one-sided | feasibility | RR | nến coin | nến BTC`.

- `GOOD+`: Stage 2 đạt, SHORT corr theo, khoảng cách `1-2%`, one-sided `50-89%`, feasibility `<50`, RR `<0.5`.
- `GOOD`: Stage 2 đạt và thuộc `SHORT corr theo + 1-2%`, `SHORT + BTC_DOWN_WEAK`, hoặc cấu trúc one-sided/feasibility/RR tốt.
- `WATCH`: ngoài cohort, hoặc Stage 2 đạt nhưng one-sided `>=90%`, feasibility `>=50`, RR `>=0.5`; `LONG + BTC_DOWN_MID + dist <1%` cũng chỉ giữ WATCH vì hiệu quả mẫu mới suy giảm.
- `RISK`: khoảng cách `2-5%`, target `FAR_ZONE`, Stage 2 RISK, hoặc Stage 2 đạt nhưng nến coin là `BEARISH_MARUBOZU`.
- Mẫu nến chỉ được dùng làm modifier hạ hạng trong cohort đã kiểm chứng; mẫu nến riêng lẻ không được tự nâng GOOD.
- Lệnh mới lưu `liquidStage3Tier/Code/Label/Reason/ComboKey/Version`; lệnh cũ được suy ra để hiển thị mà không sửa kết quả lịch sử.

Rule version: `LIQUID_COMBO_STAGE_3_V1_20260723`.

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
