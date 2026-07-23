# Signal Picks Python Learning

`RECOMMENDED_SIGNAL_WALK_FORWARD_V1` là model Python độc lập dùng để đánh giá
Signal Picks và Recommended Paper. Model không tham gia chọn whitelist, không
vào lệnh, không đổi margin và không can thiệp SL/TP.

## Dữ liệu được học

- Chỉ đọc `data/recommended-paper-trades.json`.
- Chỉ nhận `paperMode=INDEPENDENT_SOCKET_V2`.
- Chống đếm trùng bằng `sourceTradeId` (fallback là `id`).
- Mặc định chỉ dùng lệnh mở sau
  `INTRADAY_DECISION_COMBO_STATS_VALID_FROM`; có thể đặt cutoff riêng bằng
  `RECOMMENDED_SELF_LEARNING_VALID_FROM`.
- Giới hạn cửa sổ bằng `RECOMMENDED_SELF_LEARNING_LOOKBACK_DAYS`.

## Phương pháp

Lịch sử được phát lại theo thời gian. Mỗi lệnh được chấm tại thời điểm OPEN chỉ
bằng các outcome đã CLOSE trước đó; sau đó outcome của lệnh mới được thêm vào
model. Đây là walk-forward nhân quả, tránh dùng chính kết quả của lệnh để chấm
lệnh đó.

Model tìm nhóm đủ mẫu theo thứ tự: combo + nến, exact combo, context, setup +
BTC, setup, rồi page + side. WR được co Bayes bằng prior `Beta(2,2)` để mẫu nhỏ
100% WR không bị gắn GOOD quá sớm.

Fallback rộng `page + side` chỉ cung cấp `PY WATCH` và confidence tối đa 55%; nó
không bao giờ được phép tạo `PY GOOD` hoặc `PY RISK`.

- `PY GOOD`: AdjWR >= 60%, AvgROE >= 1%, PF >= 1.2 và tỷ lệ SL <= 45%.
- `PY RISK`: AdjWR <= 45%, AvgROE <= -2%, PF < 0.8 hoặc tỷ lệ SL >= 55%.
- `PY WATCH`: nhóm đủ mẫu nhưng chưa nghiêng rõ.
- `PY PRIOR WATCH`: chưa đủ số mẫu; prior tuyệt đối không được gắn GOOD.
- `PY NO DATA`: lệnh ngoài cửa sổ học hoặc chưa có flag.

## Runtime và kiểm tra

- API đọc: `GET /api/recommended-signal-learning?day=YYYY-MM-DD`.
- Làm mới cache: `POST /api/recommended-signal-learning?day=YYYY-MM-DD`.
- Chạy CLI: `npm run recommended-learn`.
- Test leakage/guardrail: `npm run test:recommended-learn`.

Giao diện `/recommended-signals` hiển thị flag riêng trên từng card và cột
`PY MODEL` trong bảng paper. Cờ này chỉ để phân tích về sau.
