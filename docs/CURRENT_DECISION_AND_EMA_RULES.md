# Logic hiện tại: Decision Paper, Recommended Paper và EMA Paper

> Cập nhật: 2026-07-20 (Asia/Bangkok, UTC+7)
>
> Đây là tài liệu đọc nhanh về **logic đang chạy hiện tại**. Khi tài liệu cũ mâu thuẫn với file này, kiểm tra lại code tại `src/intradayDecisionPaper.js`, `src/recommendedSignals.js` và `src/server.js`; code vẫn là nguồn chuẩn cuối cùng.

## 1. Quy ước chung

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

- Mặc định tự đánh giá mỗi `15 phút`.
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

Từ 2026-07-20, matcher không còn dùng phép so khớp chuỗi một phần. `PRE_BREAKOUT` không thể khớp nhầm `BREAKOUT`, `PRE_BREAKDOWN` không thể khớp nhầm `BREAKDOWN`, và Pump Breakout không thể mượn mẫu EMA Breakout. Khóa catalog phải trùng stage, side, timeframe, BTC correlation bucket, BTC phase và relation; gate live được kiểm tra riêng vì tên gate lịch sử có thể thay đổi.

Với tín hiệu EMA, Decision Paper còn chạy lại gate EMA hiện tại trước khi ENTER. `BLOCK` thành REJECT; tier A dùng `$10`, tier B/WATCH dùng margin do gate trả về, thường `$1`.

Không đủ entry gate nhưng combo còn đáng theo dõi thì ghi `WATCH`; trường hợp xấu/không có mẫu đủ tin cậy ghi `REJECT`. Cả ba loại đều được lưu vào decision log để audit.

### Entry, size và số lượng lệnh

- Entry phải là **giá market mới từ Binance Last Price socket**, không lấy setup price làm giá khớp.
- Lưu riêng `signalEntry`, `entryPrice`, độ lệch entry và tuổi tick socket để kiểm tra sau.
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
| dưới `+15%` | giữ SL gốc `-15%` |
| `+15%` | `+5%` |
| `+20%` | `+10%` |
| `+25%` | `+15%` |
| `+30%` | `+20%` |

- Sau đó cứ peak tăng thêm `5%`, SL khóa tăng thêm `5%`.
- Rule cũ `+7% -> khóa +2%` đã bỏ.
- Paper có thể đóng bởi SL gốc, trailing SL, timeout hoặc BTC trend mạnh đảo chiều theo manager.

### Realtime và giao diện

- Backend quản lý mark/PnL bằng socket Binance; trang nhận trạng thái realtime qua SSE.
- Card có màu và icon riêng cho `OPEN`, thắng, thua và lệnh đã đóng.
- Lịch sử lệnh đóng nằm trong table riêng phía dưới.
- Table đóng có filter thắng/thua/hòa và paging `10/25/50/100` dòng.
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
