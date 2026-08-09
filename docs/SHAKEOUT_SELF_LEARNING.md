# Shakeout Python Self-Learning

## Mục đích

`scripts/shakeout_self_learning.py` là sidecar chỉ đọc. Script phân tích các lệnh
`CLOSED` trong `data/shakeout-paper-trades.json` và trả kết quả qua
`/api/shakeout-self-learning`.

Hệ thống dùng hai mô hình cohort tách biệt:

1. `OLD` học các lệnh cũ chưa có snapshot mẫu nến bằng walk-forward nhân quả.
   Mỗi lệnh lịch sử chỉ được chấm từ các lệnh đã đóng trước nó; outcome hiện tại
   sau đó mới được thêm vào tập ngoài mẫu. Feature gồm signal type, side,
   timeframe, MARKET/PENDING/CHASE, trap risk, bottom-rebound, BTC trend/relation
   và phiên giờ Bangkok. Mô hình không dùng `shakeoutQuality`, score hoặc nhãn
   GOOD/BAD cũ.
2. `CANDLE` chỉ học các lệnh có mẫu nến coin 5m/15m và BTC 5m. Các lệnh mới được
   đánh giá lại trong cột riêng để có thể so sánh với kết quả `OLD`.

Hai cột trên `/shakeout-reclaim`:

- `Python data cu`: `OLD VERIFIED GOOD`, `OLD WATCH`, `OLD RISK`, `OLD NO OOS`.
- `Python mau nen`: `PY GOOD` (đã học), `PY WATCH`, `PY RISK`, `PY PRIOR WATCH`, `PY HIGH-JUMP PRIOR`, `PY CANDLE CONFLICT`, `PY BTC CONFLICT`, `PY CHASE PRIOR`, `PY NO DATA`.

Từ schema 6 / `CANDLE_WALK_FORWARD_V3_CONTEXT`:

- `PY GOOD` chỉ xuất hiện khi cohort đã đủ mẫu thực nghiệm và đạt ngưỡng thống kê.
- Khi chưa đủ mẫu, nhãn prior được tách theo nguyên nhân: `PY PRIOR WATCH`, `PY HIGH-JUMP PRIOR`, `PY CANDLE CONFLICT`, `PY BTC CONFLICT` hoặc `PY CHASE PRIOR`; prior không được gọi GOOD.
- CHASE chưa đủ mẫu và `HIGH JUMP RISK` bị hạ về prior risk. Ngay cả khi cohort dương, CHASE/high-jump cũng không được nâng thẳng lên GOOD.
- Feature cohort mẫu nến có thêm `variant`, `highJumpRisk`; không trộn PENDING/MARKET với CHASE.
- Paper lịch sử được chấm causal walk-forward tại thời điểm mở. Outcome của chính lệnh và outcome đóng sau thời điểm mở không được dùng để chấm lệnh đó.
- Khi cộng mẫu huấn luyện, cùng `signalId + variant` chỉ được tính một lần để tránh clone làm phồng confidence.
- Paper mới lưu thêm snapshot `SHAKEOUT_CONTEXT_OBS_V1_20260726`: cấu trúc
  move/drop/retrace, volume 5m/15m, khoảng cách EMA, reclaim/reject, wick, RSI,
  tuổi pullback, cách entry, khoảng cách entry, RR, projected ROE, BTC
  correlation/phase, thanh khoản và cặp nến coin/BTC.
- Khi snapshot đạt `FULL`, walk-forward ưu tiên các cohort `OBS_STRUCTURE`,
  `OBS_EXECUTION` và `OBS_FLOW_CANDLE`. Mỗi lệnh lịch sử vẫn chỉ được chấm bằng
  outcome đã đóng trước thời điểm entry; snapshot không đọc PnL/outcome hiện tại.
- `FULL / PARTIAL / LEGACY` là độ phủ dữ liệu, không phải GOOD/RISK và không có
  quyền thay đổi lệnh.

`OLD VERIFIED GOOD` yêu cầu tối thiểu 30 mẫu tổng và 12 outcome walk-forward,
đồng thời phải đạt AdjWR >= 65%, cận dưới Wilson >= 52%, AvgROE >= 1.5%,
PF >= 1.30 và tỷ lệ SL thua <= 25%. Nhãn OLD có thêm confidence và không dùng
outcome tương lai để tự chấm lại lệnh quá khứ.

Mô hình dùng thống kê cohort có shrink về win rate toàn cục. Khi cohort mẫu nến
chưa đủ số lệnh đóng, cột `CANDLE` chỉ dùng prior WATCH/RISK dựa trên hướng mẫu
nến, BTC và rủi ro thực thi; khi đủ mẫu, nó tự chuyển sang kết quả thực nghiệm.

## Rào chắn an toàn

Hai đánh giá chỉ dùng để phân tích. Server không đưa flag vào scanner, gate,
`createShakeoutPaperTrades()` hoặc `handleShakeoutReclaimRealOrders()`.

Flag không thể thay đổi:

- quyết định vào hoặc chặn lệnh;
- MARKET/PENDING/CHASE;
- margin hoặc leverage;
- entry, SL, TP hoặc trailing;
- lệnh Binance thật.

Python không ghi hoặc sửa paper store.

## Chạy thủ công

```bash
npm run shakeout-learn
```

Trang web có nút `Học lại ngay`. Backend mặc định tự chạy lại mỗi 15 phút.

## Cấu hình

```env
SHAKEOUT_SELF_LEARNING_ENABLED=true
SHAKEOUT_SELF_LEARNING_LOOKBACK_DAYS=30
SHAKEOUT_SELF_LEARNING_MIN_SAMPLES=8
SHAKEOUT_SELF_LEARNING_LEGACY_MIN_TOTAL=30
SHAKEOUT_SELF_LEARNING_LEGACY_MIN_OOS=12
SHAKEOUT_SELF_LEARNING_INTERVAL_MS=900000
SHAKEOUT_SELF_LEARNING_CACHE_MS=300000
```
