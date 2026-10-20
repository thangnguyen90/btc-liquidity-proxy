# Đánh giá Volume tăng dần — 09/10/2026

**Cập nhật sau báo cáo:** theo yêu cầu tiếp theo, auto SHORT riêng Volume 1m liền mạch đã OFF lúc 11:28:49 VN 09/10; LONG giữ ON, không đóng vị thế cũ. Phần dưới là đánh giá/trạng thái tại lần chốt 11:16, không phải trạng thái controls hiện tại. Xem `RISING_VOLUME_LONG_REVIEW_20261009.md` cho đánh giá LONG riêng.

Chốt dữ liệu audit lúc khoảng 11:16 Việt Nam; đối chiếu nến Binance public lúc11:15. Đây là báo cáo đọc-only, không thay rule hoặc cấu hình giao dịch.

## Phạm vi và cách đếm

- Rule runtime: `RISING_VOLUME_V1_CLOSED_BASE_VOLUME_OBSERVE_20261008`, continuity `RISING_VOLUME_PATTERN_V2_1M_SUSTAINED_FLOW_20261008`, entry `RISING_VOLUME_1M_SUSTAINED_MARKET_3USDT_5X_TP10_SL30_V1_20261008`.
- Nguồn: `data/binance-filled-signal-audit/state.json`, `data/rising-volume-binance.json`, `data/rising-volume-history.json`, GET `/api/rising-volume`, code detector/runner/closed stats; public Binance `/fapi/v1/klines` 1m (55symbols gồmBTC). Không gọi API đặt/hủy/đóng lệnh hoặc đổi controls; không lấy private keys/subscriptions/webhooks.
- Entry gốc từ17:14 08Oct đến09:34 09Oct VN: 62fill có đúngsource/version/causal snapshot, khôngDCA và `isRisingVolumeEntrySignal` hợp lệ: LONG34, SHORT28. Lệnh thật chỉ1mSUSTAINED; BURSTY/OTHER/5m/15m không có lệnh CLOSED trong route này, không suy winrate cho chúng.
- Closed: gộp theo closeGroupId (tránh đếm fills nhiều lần), ROE=netPnl/margin×100, net đã gồm phí/funding theoaudit. Có31LONG và17SHORT CLOSED; 3LONG/11SHORT OPEN không đưa vào thống kêclosed. Chỉ xét gốc riêng vẫn có5LONG/4SHORT closegroup kèm DCA khác: audit phân bổ PnL toànvịthế theo filledNotional, nên kết quả đó không phải PnL độc lập của leg gốc. Vì vậy có bảng phụ loại tất cả mixedclosegroups.
- Ledger còn10fill DCA source cùngnhóm nhưng khôngsnapshot; cộng cả chúng sẽ ra SHORT +8.806USDT và LONG −11.824USDT, làm hiểu sai tín hiệu gốc. Không dùng các con số đó làm performance rule.
- Lịch sử detector hiện chỉ giữ3000event, khoảng02:38–11:15 09OctVN. Không đủ toàn bộalert ngày08; đánh giá đườnggiá dưới đây là mẫu đã được vào thật, không backtest unbiased tất cảsignals. Ledger527attempt: chỉ62SUBMITTED; MAX_OPEN_POSITIONS365 (LONG158/SHORT207), EXISTING_POSITION47; còn guards/error/unknown khác. Có selectionbias theo slot/tình trạng tài khoản.

## Kết quả audit CLOSED

| Mẫu tín hiệu gốc | LONG | SHORT |
|---|---:|---:|
| Closed groups |31|17|
| Net-positive |17 (54.8%)|7 (41.2%)|
| Net PnL được phân bổ |+1.3705 USDT|−0.9575 USDT|
| AvgROE net |+1.4737%|−1.8775%|
| Profit factor net |1.7933|0.4773|
| Avg winner ROE |+6.0750%|+4.1634%|
| Avg loser ROE |−4.1136%|−6.1061%|

Nếu bỏ hẳn mọi closegroup có DCA/entry khác: LONG26closed,14net-positive(53.8%), net+1.7038USDT, AvgROE+2.1843%; SHORT13closed,4net-positive(30.8%), net−1.5146USDT, AvgROE−3.8836%. SHORT yếu không chỉ do nhiễu DCA. LONG tốt hơn tương đối, nhưng chưa đủ chứng minh lợi thế bền vững hoặc đạt policyrealCLOSED AvgROE>4%.

SHORT LDO entry02:10 09OctVN -> SL10:47, −30.1549%ROE; NEAR entry06:44 -> SL10:36, −27.3844%ROE. Hai lệnh net−1.7262USDT, lớn hơn lãi cộng các SHORTclosed còn lại (+0.7687USDT). Không tự loại hai loss vì chúng là outcome thật củarule.

SHORTcloseReasons: 2STOP_LOSS_FILLED,1TAKE_PROFIT_FILLED,2BOT_OR_MANUAL_CLOSE_FILLED,12POSITION_CLOSED_ON_BINANCE. Một số closes có ios_* client IDs và một số LIMIT exit vềentry; không quy tất cả outcome là do TP10/SL30 hoặc do bot. ZEN/TLM/ZRO/UNI/XRP/YFI được đóng sớm sau1.5–8.4phút, trước plannedTP; quytrìnhthoát hiện tại không phải thí nghiệm cố định chỉTP/SL.

## Đường giá sau entry (không phải lệnh giả đã khớp)

62entry hợp lệ đều có60nến1m đầy đủ. Neo avgFillPrice thật; xét từ nến trọn vẹn kế tiếp sau phútfill, bỏ nếnfill vì OHLC không biết high/low trước hay saufill. Horizon5/15/30/60phút, giá chuyển theo hướng vịthế (SHORT giá tăng => âm). Không giả PnL thực tế khi lệnh đã đóng sớm, không cộng funding/phí/slippage vào các returns này. Không dùng giá cuối dữ liệu như mark/PnL live.

| Horizon | LONG34: giá thuận hướng trung bình | SHORT28: giá thuận hướng trung bình | SHORT thuận hướng tại cuối horizon |
|---|---:|---:|---:|
|5m|+0.0385%|+0.0567%|16/28|
|15m|−0.0152%|−0.2520%|10/28|
|30m|+0.3501%|−0.2503%|11/28|
|60m|+0.1777%|−0.4001%|12/28|

SHORTh60 median−0.4384%giá; thuận lợi tốiđa trung bình+0.9217%, bấtlợi tốiđa trung bình−1.3140%. Ở5x, fixedh60 grossROE trungbình≈−2.0004%, chưa phí. Trong60nếntrọn vẹn, chạm +2%giá trước −6%giá: SHORT5TP/1SL/22NONE; LONG6TP/1SL/27NONE, khôngambiguousbars. Đây chỉ barrier touch diagnostics, KHÔNG winrateTP/SL thực, không biết ticktrongnếnfill/marktrigger/spread/slippage hoặc diễnbiến sau60m.

CaseLDO: short0.4016, 5m còn thuận+0.0249%giá, 15mngược−1.3695%,60mngược−2.5149%; MFE60chỉ+0.0747%. NEAR: short4.476, MFE60+0.7819% nhưngclose60ngược−0.5362%. Không chỉ vấnđề đóngsớm: nhiềuentry không có follow-through đủ lớn.

## Điểm yếu trong logic và gợi ý kiểm thử (chưa áp dụng)

1. Rule hiện dùng MA5volume tăng ba bước + meanvolume5>=1.5×nền20 + giá5m giảm>=0.25%/>=3nếnđỏ/closecuối giảm => SHORT. Continuity1m yêu cầu nềnvolume được duy trì, không chứng minh xu hướng giảm sẽ tiếpdiễn. Không gateBTC/EMA/structure/retest/vịtrítrongrange; volume cao có thể là hấp thụ bán hoặc đoạncuối xả.
2. `takerBuyPct` được tính và lưu nhưng không dùng gate. VETshort khi buychủđộng66.3%, ENS51.8%, W53.2% vẫn vào. Có lý do kiểmthử sellpressure/structure, không coi bất kỳ ngưỡngtaker nào tự đảm bảo thắng.
3. Nhóm thăm dò dùng dữ liệuBTC15mđóng trướcsignal: BTC<=−0.2% có7SHORT,6/7giá thuận cuối60m, avg+0.6958%; còn21SHORT6/21thuận, avg−0.7654%. Nhóm sell>=60%:21SHORT avg60+0.0140%; còn7avg−1.6422%. Mẫu nhỏ/cụm cùngthờiđiểm (không độc lập), ngưỡng nhìn sau dữliệu, không phải bằngchứng gate mới đã backtest out-of-sample; đây chỉ ứngviên thửnghiệm.
4. PlannedTP+10ROE/SL−30ROE tạo reward/risk1:3. Nếu mọitrade chỉ chạm đúng hai mức này thì cần winrate>75% trướcphí để expectancy dương; nhưng closes thật khác nhau nên không so41.2% như thể mọiwin+10/mọiloss−30. Meanwin SHORTthật+4.16% làm haiSL lớn ăn nhiềuwin nhỏ. Cần đánhgiá entry và exit riêng, không vội giảmTP/SL từ mẫu1ngày.
5. Đềxuất tạm để autoSHORT route này OBSERVEONLY, giữ alerts để thu mẫu; chưa thực hiện. Testforward BTCdown/coinstructurebreak+retest và sellpressure, tránh SHORT ngay sau leggiảm quáxa. LONG cũng chưa đạt AvgROE>4% hoặc lợi thế xác nhận, không tăngsize từ kết quả này.

## Ảnh hưởng / tương thích

Không thay mãlogic, nhãn/tier/snapshot/gate/thốngkêruntime, entry/size/leverage/SL/TP, WHITELIST hoặcJSONcũ; cảLONG/SHORT route hiện vẫnON theoGETcontrols. Không thêmcard/cohortruntime nên không sinh checkboxWHITELIST mới. Các số trong báo cáo là auditoffline có ngày chốt, không backfill tradelegacy và không đưa vào counters trang. Chưa xửlý lệnh đangmở; chưa có kết luận statisticallyrobust do chỉ1ngày/mẫunhỏ/selectionbias/openpositions/mixedDCA/thoátlệnhkhácnhau.
