# Paper Page Python Self-Learning

`scripts/paper_page_self_learning.py` là model walk-forward nhân quả dùng chung cho
các trang paper chưa có model riêng. Mỗi page được huấn luyện độc lập; dữ liệu Pump
không được trộn với Liquid, CAP, Edge, Decision Paper hoặc page khác.

Model dùng các feature có sẵn tại thời điểm entry: setup/stage, side, timeframe,
MARKET/PENDING, BTC phase, mẫu nến coin/BTC và score bucket. Một trade lịch sử chỉ
được chấm bằng những outcome đã đóng trước thời điểm mở trade đó. Clone cùng
`signalId + variant` chỉ đóng góp một outcome huấn luyện.

Nhãn hiển thị ở cột `PY MODEL`:

- `PY GOOD`: cohort trước entry đủ mẫu, AdjWR/AvgROE/PF đều đạt ngưỡng tốt.
- `PY RISK`: cohort đủ mẫu nhưng WR, AvgROE hoặc PF thuộc vùng rủi ro.
- `PY WATCH`: cohort đủ mẫu nhưng chưa đủ rõ để gọi GOOD/RISK.
- `PY NO OOS`: chưa có tối thiểu số outcome ngoài mẫu trước entry.

Các page đã có model riêng (`Shakeout`, `Recommended Signals`) không dùng cột chung.
Model chỉ đọc log và chỉ phục vụ UI/phân tích; không được dùng bởi scanner, entry,
gate, margin, SL/TP, trailing hoặc lệnh Binance.

API: `GET /api/paper-page-self-learning?page=<page>`.

Biến môi trường:

```env
PAPER_PAGE_SELF_LEARNING_LOOKBACK_DAYS=30
PAPER_PAGE_SELF_LEARNING_MIN_SAMPLES=8
PAPER_PAGE_SELF_LEARNING_MAX_FLAGS=5000
PAPER_PAGE_SELF_LEARNING_CACHE_MS=300000
```
