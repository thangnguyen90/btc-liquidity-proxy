# Logic hiện tại: Decision Paper, Recommended Paper và EMA Paper

> Cập nhật: 2026-07-28 (Asia/Bangkok, UTC+7)
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

## 2026-08-09 - Binance profit-lock +5% ROE -> SL +1% ROE

- Version: `BINANCE_PROFIT_LOCK_V1_20260809`. Cấu hình runtime mặc định
  `BINANCE_PROFIT_LOCK_TRIGGER_ROE=5` và `BINANCE_PROFIT_LOCK_FIRST_LOCK_ROE=1`.
- Dữ liệu dùng trước entry và điều kiện phân loại tín hiệu không đổi. Rule chỉ chạy sau khi Binance đã có position,
  dùng `entryPrice`, `markPrice`, `positionAmt`, margin và leverage hiện tại để tính ROE; không dùng outcome hay nến
  tương lai để quyết định entry.
- Điều kiện bảo vệ: position Binance LONG/SHORT còn mở, không nằm trong danh sách loại trừ TSL,
  `AUTO_SL_ENABLED` không phải `false` và ROE đạt ít nhất `5%`. Từ `5%` đến dưới `15%` khóa `+1%` ROE; thang cũ
  tiếp tục ở `15 -> 5`, `20 -> 10`, `25 -> 15`... Giá SL được đổi từ ROE về khoảng cách giá theo leverage,
  đối xứng cho LONG và SHORT.
- Cách ghi nhận/thống kê: không tạo cohort, nhãn thống kê hoặc checkbox whitelist mới. Runtime ghi version, mức ROE
  khóa và giá SL vào `sl-tracking`; lifecycle live-card nhận event `PROFIT_LOCK_SL_MOVED` để Orders/socket cập nhật.
  API trạng thái trailing-stop công khai version cùng hai ngưỡng cấu hình.
- Ảnh hưởng Binance: có đổi SL thật sau entry, kể cả position live-card đang giữ signal protection. Bot đặt SL mới
  thành công trước rồi mới hủy SL cũ; khi SL hiện tại đã tốt hơn thì chỉ ghi nhận, không hạ mức bảo vệ. Snapshot
  `signalStopLossPrice` gốc vẫn được giữ để đối soát, còn `signalSl` hiện hành được nâng lên profit-lock để tiến trình
  recovery không khôi phục nhầm SL lỗ ban đầu. Không đổi gate, entry, size/margin, leverage hoặc TP.
- Tương thích JSON cũ: chỉ bổ sung field optional (`lifecycleId`, `profitLockVersion`, `profitLockRoe`,
  `profitLockStopLossPrice`, `profitLockUpdatedAt`), không rewrite record cũ. Record không có lifecycle vẫn được bảo
  vệ trực tiếp trên Binance. Algo JSON mới nhận diện `STOP/STOP_MARKET` cả khi trigger đã sang vùng lời; JSON cũ chỉ
  có type `CONDITIONAL` vẫn dùng kiểm tra phía lỗ làm fallback.
