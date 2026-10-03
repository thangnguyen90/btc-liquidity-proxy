# Đánh giá tín hiệu Discord AI và điểm vào

Version: `AI_SIGNAL_REVIEW_V1_CAUSAL_ENTRY_COMPARISON_20261003`.

Discord hậu kiểm: `AI_SIGNAL_REVIEW_DISCORD_V2_DUAL_1H_4H_ENTRY_IMPROVEMENT_20261003`.

Cảnh báo BTC cực đoan cùng webhook: `BTC_EXTREME_MOVE_DISCORD_V2_CLOSED_15M_1H_4H_20261003`.

Trang `/ai-signal-review` tổng hợp thông báo candidate AI đã gửi thành công, không bao gồm thông báo BTC riêng. Nguồn state chỉ giữ event/timestamp; journal có điểm, vùng giá, BTC/breadth/model tại lúc gửi. Mỗi event dùng bản journal đầu tiên, không dùng snapshot mới để thay lịch sử. Kho `data/ai-signal-review/events.json` giữ các event đã thu gom kể cả khi notifier prune. Journal cũ V1 vẫn đọc được; V2 giữ sample bất biến và có targetPlan/frames.

## So sánh entry

- Baseline: mở nến 15m kế tiếp sau sentAt.
- Giữa vùng: chờ midpoint trong vùng gốc; không có snapshot = NO_ZONE.
- Hồi0,5%: giá thấp hơn baseline0,5% cho LONG, cao hơn0,5% cho SHORT.
- Chờ tối đa4h, kỳ1h chỉ chờ1h. Nến phải thực sự bao phủ giá; gap qua mức chờ không được coi là khớp. Chạm là giả định OHLC, không chứng minh fill.
- Ba cách thoát tại cùng đóng nến1h/4h/24h từ baseline. Đây là đo hiệu quả thời điểm; không giả lập protection hiện hữu.
- PnL USDT theo giá entry: LONG `(exit-entry)/entry`, SHORT `(entry-exit)/entry`; chi phí hai chiều0,12% chỉnh ở UI. Không leverage/funding/DCA.
- MFE/MAE bỏ nến chạm với entry chờ vì không xác định thứ tự OHLC; nếu không còn nến sau chạm, excursion = null.
- Paired delta chỉ trên tập chạm; tỷ lệ chạm và TB mỗi cơ hội (không chạm =0) hiện bên cạnh. NO_ZONE/MISSING_CANDLES/PENDING không vào denominator thực nghiệm.

## BTC và nhóm nghiên cứu

Chỉ dùng nến BTC đóng trước sentAt. BTC 1h>0,1% là UP, <-0,1% DOWN, còn lại FLAT; return4h đi kèm. Đây là động lượng tái dựng, không thay trend1h/4h gốc. Regime/breadth gốc thiếu thì UNKNOWN. Giờ VN UTC+7. Nhóm có dưới20 mẫu hiển thị mẫu nhỏ; score hiện là điểm gốc chưa calibration.

Mặc định giữ thông báo đầu mỗi coin/hướng trong4h để giảm lặp; không loại hết tương quan. Cohort chỉ gồm thông báo đã gửi, chịu ảnh hưởng top3/cooldown/version trước đây, không đại diện toàn engine. Không chọn lại ngưỡng tối ưu trên cùng mẫu rồi gọi đó là xác suất thật.

## Vận hành

GET `/api/ai-signal-review` đọc báo cáo cache. POST cùng origin tạo job nền (một job, cooldown60s); poll tiến độ. Nến qua shared Binance rate gate priority9, drop khi nghẽn; dùng cache trên disk, báo lỗi/gap và không coi lỗi là thua. Báo cáo giới hạn30 ngày/20.000 event. Không tự chạy liên tục hoặc gửi Discord bổ sung.

Mỗi10 coin xuất kết quả tạm với `partial=true`, `plannedSignals` và số coin đã xử lý. Chỉ tính mẫu đã xử lý; không biến coin đang chờ tải thành mẫu thua/thiếu nến. UI cảnh báo chưa dùng xếp hạng tạm để kết luận. Hoàn tất ghi `partial=false`; report JSON cũ thiếu cờ được hiểu là báo cáo hoàn tất.

Khi cấu hình `LOCAL_AI_SIGNAL_REVIEW_DISCORD_WEBHOOK_URL`, server tự refresh mặc định mỗi30 phút (`LOCAL_AI_SIGNAL_REVIEW_REFRESH_MS`, sàn15 phút). Chỉ report hoàn tất mới được xét. Lần đầu notifier lưu baseline mọi mẫu cũ đang pass và không gửi; sau đó event mới chỉ gửi một lần theo eventId, tối đa `LOCAL_AI_SIGNAL_REVIEW_DISCORD_MAX_PER_RUN` mỗi vòng. API trả thêm trạng thái `discord.configured/baselineComplete` và UI hiển thị ON/OFF.

Rule Discord chạy song song 1h và4h với cost0,12%, không phụ thuộc dropdown trên trình duyệt: immutable sent snapshot, mẫu độc lập4h, market net dương, midpoint vùng gốc đã chạm trong đúng horizon và net dương, zone cải thiện ít nhất0,10 điểm phần trăm so với market, có ít nhất một nến sau nến chạm để đo excursion. Dedupe theo `eventId|horizon`, nên có thể báo sớm 1h rồi xác nhận 4h nếu vẫn pass. Thông báo là hậu kiểm nhìn sau, không phải entry mới; lỗi webhook không ghi sent để còn retry. State V1 được hiểu là baseline/dedupe 4h và V2 baseline riêng 1h, không flood lịch sử khi nâng cấp.

Cùng webhook nhận BTC extreme live từ nến Futures đã đóng: giảm `-0,75%/15m`, `-1,50%/1h` hoặc `-3,00%/4h` với khung ngắn không đi ngược mạnh là `BTC SẬP RẤT SÂU`; tăng đối xứng là `BTC TĂNG RẤT NÓNG`. Cùng hướng/level cooldown60 phút, nhưng tăng severity, đổi hướng hoặc đã neutral rồi cực đoan lại được gửi ngay. Startup baseline trạng thái hiện tại, không phát lại cảnh báo cũ và không gửi thông báo recovery. Cấu hình: `BTC_EXTREME_DISCORD_MIN_15M_PCT`, `BTC_EXTREME_DISCORD_MIN_1H_PCT`, `BTC_EXTREME_DISCORD_MIN_4H_PCT`, `BTC_EXTREME_DISCORD_COOLDOWN_MS`.

## Binance / WHITELIST

OBSERVE ONLY, không Binance route/entry/size/SL/TP. Bảng nghiên cứu và event hậu kiểm không thêm signal tier/label/card thống kê trước entry và không có runtime matcher. Không nối checkbox WHITELIST giả vào dữ liệu outcome mô phỏng thiếu closed trades. Policy matcher thật mặc định OFF và chỉ hiện khi CLOSED AvgROE>4% giữ nguyên. Kiểm thử yêu cầu API/notifier binanceEligible=false, tính đúng SHORT/paired/missing/expiry/no-lookahead, baseline/dedupe và không ghi đè sent snapshot.
