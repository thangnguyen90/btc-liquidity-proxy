# Web Push cho tín hiệu Discord được phép

## 2026-10-18 — Tín hiệu trực tiếp GẦN VÙNG SHORT

Đã bật route native19:45:22VN ngày18/10, webPID2660007/publicAPI200/4thiết bị; các routePush cũ và quiet00–06VN giữ nguyên. Chỉ tín hiệu mới sauenable, không gửi lại ICNT18:16. Mở lại/tải lại app một lần để lấy SW mới. Không gửi notification thử để xác minh.

Hiện hành: managerV2 `DISCORD_PUSH_MANAGER_V2_NATIVE_SIGNAL_ROUTES_20261018`, WebPushV14, sitewide loaderV11. Route `signal-pump-turn-near-short-v1`/type `PUMP_TURN_NEAR_SHORT` xuất hiện trong `/push-signal-manager`; mặc địnhOFF cho cài đặt mới, người dùng đã yêu cầu bật riêng. Không bật cả webhook hoặc LONG. Nhóm Discord cũ vẫn cần POST2xx; route native này nhận eventSHORT NEAR/IN_ZONE đã lưu từ detector, không phụ thuộc Discord hoặc kết quả Binance.

Event mới sauPushenabledAt/processstart, age/TTL≤30s, sharedquiet mặc định00–06VN (chỉnh được), khônggửi bù. DurablePENDING trướcsend/dedupeevent/unknownnoretry/nohistoricalreplay. Nhấnnotification mở `/pump-turn-watch?signal=<eventId>#signals`, worker hết hạn thì bỏ; tải lại trang/app một lần để nạp worker allowlist mới. Giữ4subscription hiện có, không tự cấp permission trên thiết bị chưa đăng ký.

Không thay dữ liệu trước entry/điều kiện phân loại detector72closed5m/freshsocket, Binance MARKET2USDT×5/TP10/SL30/capriêng20 hoặc lệnh cũ. Telemetry chỉ event/device counts, không thống kê PnL/AvgROE/cardWHITELIST mới; trading whitelist cũ defaultOFF/closedAvgROE>4% không đổi. ManagerV1 JSON booleans/telemetry giữ nguyên, thêmoptionalnativeenabledAt/reservationmap, missingnative→OFF; subscriptions/quiet/history/dedupe cũ không reset. Tests `test-pump-turn-near-push.mjs`/browser cùng bridge/quiet/SW/entry regressions chỉmock.

## Lịch sử V1 — nhóm Discord

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
