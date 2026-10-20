# Volume 1m liền mạch — đánh giá LONG riêng ngày 09/10/2026

Chốt audit 11:29 VN, đối chiếu nến public Binance lúc 11:30 VN. Đây là mẫu thực thi khoảng 17:14 ngày 08/10 đến 09:34 ngày 09/10, chưa phải backtest nhiều ngày hoặc toàn bộ tín hiệu detector.

## Trạng thái đã áp dụng

`RISING_VOLUME_1M_SHORT_ROUTE_OFF_20261009`: **auto SHORT đã OFF lúc 11:28:49 VN**. LONG/master/các route khác giữ nguyên, xác nhận qua GET `/api/rising-volume`. Chỉ đổi switch bằng `AutoEntryControls.update`; không sửa detector hay quy tắc entry LONG. SHORT tiếp tục được quan sát, không tạo MARKET mới; không đóng lệnh đang mở và không sửa TP/SL/protection cũ. Cấu hình LONG vẫn 3 USDT margin ×5, TP+10% ROE/SL−30% ROE/max50. Không restart/replay.

Version entry `RISING_VOLUME_1M_SUSTAINED_MARKET_3USDT_5X_TP10_SL30_V1_20261008`; detector `RISING_VOLUME_V1_CLOSED_BASE_VOLUME_OBSERVE_20261008`, pattern `RISING_VOLUME_PATTERN_V2_1M_SUSTAINED_FLOW_20261008`.

## Dữ liệu và phương pháp

- Read-only audit `data/binance-filled-signal-audit/state.json`, runner ledger, snapshot gốc; public `/fapi/v1/klines` 1m cho BTC và các coin mẫu. Không gọi signed order/cancel/close API để nghiên cứu.
- Chỉ original LONG đúng source/version, không `isDca`, snapshot AT_DETECTION và `isRisingVolumeEntrySignal` hợp lệ. 34 fills gốc, 31 closeGroupId độc lập đã CLOSED và 3 OPEN. OPEN PEOPLE/PTB/VTHO không đưa vào performance CLOSED.
- ROE net = netRealizedPnlUsdt / marginUsdt ×100; net đã phản ánh phí/funding theo audit. 5 closegroups GUN/W/GRVT/STX/ZKP có entry khác/DCA: audit phân bổ kết quả cả vị thế theo notional, không phải PnL độc lập leg gốc. Vì vậy báo cáo cả mẫu đầy đủ và bỏ hoàn toàn mixed closegroups.
- Việc loại mixed đồng thời loại cả lệnh lỗ lớn GUN; không được suy rằng cấm DCA sẽ tự đạt performance của mẫu sạch. Mẫu được vào thật còn lệch bởi max-slot, vị thế sẵn có và guard; lịch sử detector bị cap3000 nên không đại diện toàn bộ tín hiệu qua đêm.
- Đường giá: neo avgFillPrice thật, bỏ phút fill vì OHLC không biết diễn biến trước/sau tick fill, xét 5/15/30/60 nến 1m đầy đủ tiếp theo. Không giả tiếp tục giữ lệnh là giao dịch đã khớp, chưa tính phí/funding/slippage. BTC15m dùng 16 close 1m đã đóng không muộn hơn signal.closedAt; chỉ dùng trước entry khi chia nhóm thăm dò.

## Kết quả LONG đã đóng

| Mẫu | Closed | Net-positive | Net PnL | AvgROE net | PF net |
|---|---:|---:|---:|---:|---:|
| Tất cả entry gốc |31|17 / 31 = 54.8%|+1.3705 USDT|+1.4737%|1.7933|
| Không có mixed/DCA trong closegroup |26|14 / 26 = 53.8%|+1.7038 USDT|+2.1843%|4.6781|

Mẫu không mixed: mean win +5.1596% ROE, mean loss −1.2867%. Có 10/12 loss chỉ từ −1% đến 0% ROE; JCT −8.8629% và SKL −2.6644% là hai loss lớn hơn. Gross PnL +2.0741 USDT, net +1.7038 USDT: chênh +0.3703 USDT là phí/funding ròng. Lãi nhỏ dễ mất sau chi phí. Bỏ ba winner lớn nhất, tổng net còn +0.8593 USDT — chỉ kiểm tra độ nhạy, không sửa mẫu chính.

26 close sạch gồm 7 `TAKE_PROFIT_FILLED` net +1.3701, 6 `BOT_OR_MANUAL_CLOSE_FILLED` net +0.1782, 13 `POSITION_CLOSED_ON_BINANCE` net +0.1555 USDT. **CloseReason TP không đảm bảo lãi**, và bot/manual/generic không chứng minh đã giữ nguyên fixed TP/SL tới khi chạm. Không quy toàn bộ closes cho bot hoặc cho người dùng khi chưa có bằng chứng riêng.

## Chất lượng đi tiếp sau entry

| Horizon | LONG có giá cuối cao hơn entry | Return giá trung bình | Median |
|---|---:|---:|---:|
|5m|23 / 34|+0.0385%|+0.1266%|
|15m|18 / 34|−0.0152%|+0.0641%|
|30m|20 / 34|+0.3501%|+0.2283%|
|60m|22 / 34|+0.1777%|+0.1249%|

Xu hướng có phần tích cực nhưng biên tăng trung bình nhỏ; không có bằng chứng cứ volume liền mạch là giá chạy ngay mạnh. 60 nến sau entry: 6 mẫu chạm +2% giá trước −6%, 1 chạm −6% trước, 27 không chạm cả hai; không có nến ambiguous. Đây là barrier diagnostic từ contract OHLC, **không phải winrate fixed TP10/SL30**: bỏ phút fill, không biết mark trigger/tick/slippage, chưa xem hết vòng đời và có nhiều lệnh đã đóng sớm.

### Hai case không nên gộp thành “entry LONG sai”

- **SKL**: giá đã tăng +3.5422% trong snapshot5m, volume7.0623×, taker buy55.74%. Entry0.005061, đóng sau13giây ở0.005039, net−2.6644%ROE. Giá sau60m −1.5807%, thuận lợi tối đa trong60nến chỉ+0.5137%; đây là ví dụ momentum không tiếp diễn đủ. Chưa đủ để chọn một ngưỡng anti-chase.
- **JCT**: giá snapshot5m +2.6738%, volume4.0764×. Entry0.001926, audit TP tham chiếu0.001951, nhưng exit thật0.001894, đóng sau5.71phút net−8.8629%ROE dù CloseReason=`TAKE_PROFIT_FILLED`. Giá cuối60m +6.0748%; trước đó có dip khoảng−3.8941% trong các nến được xét. Không dùng nhãn TP như win, không kết luận detector sai chỉ vì net loss. Exit thực tế khác mức TP lưu, cần audit exit riêng trước khi chỉnh entry/TP/SL; báo cáo này không sửa cơ chế thoát.

## Nhóm thăm dò từ dữ liệu có trước entry — chưa áp dụng gate

| Nhóm giá tăng trong snapshot5m | Số LONG tất cả | Closed không mixed | AvgROE closed không mixed | Return giá60m tất cả |
|---|---:|---:|---:|---:|
|<0.5%|11|7|−0.0300%|−0.0536%|
|0.5% đến <1.5%|20|16|+4.2619%|+0.0772%|
|≥1.5%|3|3|−3.7293%|+1.6962%|

Nhóm giữa có net tốt hơn trong mẫu, nhưng nhóm tăng mạnh gồm JCT (giá đi đúng sau khi đã thoát lỗ), SKL và WLD. Vì vậy threshold nhìn từ net dễ lọc cả tín hiệu đúng do exit kém. Cỡ mẫu3 quá nhỏ; không biến nhóm 0.5–1.5% thành rule hoặc cấp WHITELIST vì AvgROE hậu nghiệm >4%.

BTC15m trước signal ≥0: 24LONG, return60m +0.2383%; BTC15m<0: 10LONG, +0.0323%. Riêng closed không mixed AvgROE hai nhóm gần giống nhau (+2.1858% / +2.1810%). **Không có LONG nào lúc BTC15m≤−0.2%**, nên chưa đánh giá được route trong BTC xả mạnh; không coi mẫu này là stress-test qua crash.

Taker buy≥60%: 17mẫu, return60m +0.1587%; <60%:17mẫu,+0.1968%. Volume≥3×:4mẫu,+1.4416% giá60m nhưng AvgROE closed−0.8997%; volume<3×:30mẫu,+0.0092% giá60m. Volume cao/buy ratio cao không đồng nghĩa entry tốt hơn; divergence net/đường giá một lần nữa cho thấy exit và thời điểm giữ lệnh cần tách riêng. Các nhóm chọn sau khi nhìn dữ liệu, chưa có validation ngoài mẫu và nhiều tín hiệu cùng cụm thời gian không độc lập.

## Kết luận và ảnh hưởng

LONG hiện tốt hơn SHORT tương đối, **chưa đủ chứng minh lợi thế bền vững**: sample một ngày, chỉ31closed/26khôngmixed, aggregate AvgROE chưa đạt4%, baOPEN chưa ngã ngũ, nhiều exit không phải thử nghiệm fixedTP/SL. Giữ nguyên size/rule theo yêu cầu; chưa tăng margin hoặc thêm gate. Hướng nghiên cứu tiếp là thu thêm mẫu forward, tách entry-quality khỏi actual exit và mixed-DCA, đặc biệt đối chiếu exit JCT và bối cảnh BTC giảm thật.

Không thêm nhãn/card/cohort runtime hay matcher WHITELIST. DefaultOFF và policy realCLOSED AvgROE>4% giữ nguyên. JSON controls hiện hữu chỉ đổi `enabled` của exactSHORT và `updatedAt`; `enabledAt`/switch khác giữ nguyên, legacytrade thiếu proof không backfill, state/snapshot/attempts không migration/replay. Regression kiểm tra SHORT-only OFF sau reload, LONG vẫn submit mock, protection recovery; không đặt lệnh thật để test.
