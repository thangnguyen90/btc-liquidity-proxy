# Web Push cho tín hiệu Discord được phép

Versions: `OPPOSITE_LIQUIDITY_WEB_PUSH_V2_DISCORD_ROUTE_ALLOWLIST_20261004` và `DISCORD_PUSH_MANAGER_V1_POST_SUCCESS_ROUTE_ALLOWLIST_20261004`.

Web Push nhận các route Discord được bật tại `/push-signal-manager`. Route thanh khoản ngược chiều mặc định bật để giữ tương thích; mọi route mới khác mặc định tắt. Web Push không đặt lệnh và không thay Discord, Binance, entry, size, TP hoặc SL.

## Android

1. Mở `https://liquidity.nhathadev.trade/push-signal-manager` bằng Chrome.
2. Bấm **Bật Push như app** và chọn **Cho phép**.
3. Có thể đóng trang. Tín hiệu mới sẽ được server gửi tới notification của Android.

## iPhone / iPad

Yêu cầu iOS/iPadOS 16.4 trở lên.

1. Mở `https://liquidity.nhathadev.trade/push-signal-manager` bằng Safari.
2. Chọn **Chia sẻ → Thêm vào Màn hình chính**.
3. Đóng Safari, mở **AI Push** từ icon vừa tạo.
4. Bấm **Bật Push như app** và chọn **Cho phép**.

Không thể cấp true Web Push từ tab Safari thường trên iPhone; nút sẽ hướng dẫn cài Home Screen trước.

## Vận hành

- Server tự sinh và giữ một cặp VAPID tại `data/opposite-liquidity-web-push-vapid.json` với mode `0600` nếu env chưa cấp key.
- Có thể cấp cặp key quản lý riêng bằng `OPPOSITE_LIQUIDITY_WEB_PUSH_VAPID_PUBLIC_KEY` và `OPPOSITE_LIQUIDITY_WEB_PUSH_VAPID_PRIVATE_KEY`. Phải cấp đủ cả hai; private key không được gửi cho browser.
- Subscription được lưu trong `data/opposite-liquidity-web-push-subscriptions.json`, giới hạn mặc định 50 thiết bị.
- Allowlist và telemetry route được lưu trong `data/discord-push-manager.json` mode `0600`. API không trả webhook URL/token; chỉ trả key, nhãn và endpoint hash rút gọn.
- Chỉ POST Discord trả HTTP 2xx mới được bridge sang Push. Key trùng webhook được gom một route vì tầng vận chuyển không thể phân biệt chính xác chỉ bằng URL.
- Delivery chống lặp theo `eventId` trong 7 ngày. Subscription trả HTTP 404/410 được tự dọn.
- Bấm nút lần nữa khi đang ON sẽ hủy subscription trên server và trên thiết bị.
