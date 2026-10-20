# BTC hồi nhưng ALT yếu — cảnh báo quan sát

### 2026-10-14 — Sửa nhầm cùng dấu1h thành cùng xu hướng: tách nền và phản ứng

- **Triển khai/đối chiếu cuối:**14/10/2026 lúc20:05:40VN (startedAt1791983140240), webPID1338917/online; watchdog3955615 không restart. Public2schema mới/healthok, BTC nềnSIDEWAYS; xác nhận trực tiếp QUSDT groupUP/“BTC đi ngang · coin có nền tăng riêng” và 龙虾USDT groupDOWN/“BTC đi ngang · coin có nền giảm riêng”. Snapshot120coin:UP3/DOWN47/SIDEWAYS16/MIXED16/missing38; reaction live15/120đủnguồn,105unknown do warmup/timestamp (không giảquan hệ). Phản ứngQ đã đổi theo nhịp/timestamp mới; không pin trạng thái đứnggiá cũ vào mọi thời điểm. MainJS/CSS asset phase-v2; matrix1h và countertrend15m/1h đóng mặc định trong mục bổ sung. ControlsSHA256 trước/sau `BBB728763C7C88FE1EDB35FFA1E4D70DBA65F679636000D70E7D77790742BE5F` không đổi;4subscriptions/quiet00–06VN giữ nguyên. Cácunit/14keys/4%policy/browser2pages desktopmobile/warmupquota/Push/quiet/toast/Binancepolicy/impulsesize regressions PASS, browser artifacts `/tmp/weak-alt-browser-xqtWrs/`. Không gửi order/Push/Discord thử.
- **Warmup1m:** ưu tiên BTC làm dependency và universe120 đang xem trong lane warmup đã có; giữ nguyên max6 job/10s,2 priority +4 fair, retry30s, gate congestion/rate-limit và full525symbols. Không thêm REST trực tiếp từ GET hoặc lane/WS mới; dữ liệu chưa seed vẫn unknown, không dùng1h thay thế.
- **Version/lỗi cũ:** `BTC_ALT_SEPARATE_TREND_REACTION_V1_20261014` + `BTC_ALT_SWING_REACTION_V1_20261014`, whitelist V36. Matrix V1 chỉ so dấu/biên độ return1h, lại đợi nến15m đóng; không đủ để gọi coin “bám BTC”, đặc biệt BTC sideway + coin pump/dump riêng hoặc BTC vừa đảo chiều. UI rút matrix V1 khỏi bảng chính, giữ ở details đóng mặc định với nhãn so sánh mức thay đổi cũ/không phải trend. Header market V2 ghi rõ diễn biến15m/1h; market8state/Push không thay logic.
- **Dữ liệu trước entry/nền:** chỉ quan sát, không tạo entry. Mỗi coin/BTC tự phân nền từ97–100 nến15m đóng liên tục, fresh≤16phút, chỉ so hai nền khi cùng timestamp. Ret1h/3h/6h/24h, EMA20/50 SMA-seed + độ dốc4 nến, ATR14 true range chia giá%, efficiency6h=|netclose|/sum|deltaclose| trong24 khoảng. UP/DOWN bắt buộc price/EMA20/EMA50 và cả2EMA slope cùng hướng, kèm một trong2 nhánh: (A) return6h cùng hướng≥max0,5%;2×ATR, return3h≥max0,2%;ATR và efficiency≥0,35; HOẶC (B) return24h cùng hướng≥max1%;2×ATR, return3h không đảo ngược quá0,5×ATR. Kiểm chứng cả Q tăng24h28,406%/6h2,218% và coinảnh2 giảm24h13,323%/6h12,861% không bị gán SW chỉ vì volatility/6h nhiễu. Nhánh24h tránh gán Q pump24h28,406%/3h7,538% thành SW chỉ vì6h choppy/eff0,07. Nếu chưa UP/DOWN, chỉ SIDEWAYS khi |return24h|<max1%;2×ATR và (eff<0,35 hoặc |return6h|<max0,5%;1,5×ATR), còn lại MIXED. Ngưỡng thử nghiệm chưa backtest lợi thế; nền nội ngày + context24h, không giả chứng minh nhiều ngày. BTC sideway + coinUP/DOWN ghi riêng, không gán bám BTC từ cùng dấu1h.
- **Phản ứng nhịp mới:** đọc cache1m sẵn có,16 nến liên tục đóng, fresh≤90s, không REST/WS mới. Chọn mốc đỉnh/đáy CLOSE BTC trong15phút trước endpoint (không dùng highBTC rồi lấy closecoin sai thời điểm); nhịp DOWN khi từ đỉnh giảm≥0,15%, UP khi từ đáy tăng≥0,15%. Nếu cả2, mốc cực trị gần nhất là pha hiện hành. Không nhịp đủ ngưỡng thì cùng mốc5phút để ghi neutral. Coin bắt buộc đúng timestamp của mốc BTC và latestclosed1m; thiếu/gap → DATA_MISSING, không mượn return1h. Coin |delta|<0,1% → FLAT; ngoài ra cùng/trái dấu nhịp, STRONG khi |coin|≥max0,15%;|BTC|, còn lại WEAK. Nhãn “cùng nhịp” chỉ mô tả đoạn này, không gán xu hướng/bám BTC.
- **Live preview/causality:** nếu BTC có giá forming1m đúng nến tiếp theo, tick≤10s và không tương lai, dùng LIVE_PREVIEW; coin phải cùng formingbar và tick lệchBTC≤5s, nếu không unknown. Không có BTC live hợp lệ dùng CLOSED_1M, ghi rõ mode/mốc/thời gian. Preview có thể đổi khi nến đóng, chỉ view-only, không proof tự attach hoặc triggerorder/notification. Tính read-only khi GET/POST enabled trả snapshot, không chờ15m/health20s để cập nhật nhịp1m. Nền15m vẫn ghi riêng, không dùng live làm nến đóng.
- **List/stats/WHITELIST:**5 nhóm nền UP/DOWN/SIDEWAYS/MIXED/DATA_MISSING chứa đủ universe hiện theo dõi tối đa120; mỗi row có profile và phản ứng riêng. Counts chỉ là số coin, không PnL/AvgROE/winrate.14 key UI/runtime exact: `weak-alt-structure:<UP|DOWN|SIDEWAYS|MIXED|DATA_MISSING>`, `weak-alt-reaction:<FLAT|AGAINST_STRONG|AGAINST_WEAK|WITH_WEAK|WITH_STRONG|NEUTRAL_UP|NEUTRAL_DOWN|NEUTRAL_FLAT|DATA_MISSING>`. Mặc địnhOFF, chỉ real causal CLOSED AvgROE>4% hiện checkbox; hiện null/ẩn. Matcher optional btcAltStructureAtEntry/btcAltReactionAtEntry đúng version/sourceAT_ENTRY/ready/symbol/time≤entry/age≤60s; DATA_MISSING không cấp cohort. Không tạo/backfill proof. Keys/JSON matrixV1, marketV1/V2, countertrendV1 giữ lịch sử gốc; thiếu2 field mới hiển thị chưa có dữ liệu, không fallback nhãn1h. Không persist preview vào lịch sử15m/Push.
- **Ảnh hưởng/kiểm chứng:** không đổi Binance/entry/gate/size/cap/SL/TP/protection/lệnh cũ; không đổi marketPush/quiet/Discord. Unit BTC1h xanh nhưng6hsideway, coinUP riêng/coinDOWN riêng, Q giữ giá trong BTCdump, pha UP đối xứng, common-anchor/future/live freshness/skew/gap và14 exact keys/defaultOFF. Browser desktop/mobile2page:5 nhóm nền/9 nhãn phản ứng, Q giữ giá tách nềnUP, hoạt động dù market aggregate warmup, legacy không fallback, matrix cũ đóng, 4/4,01/defaultOFF/XSS/nooverflow. Không order hoặc notification thử.


### 2026-10-14 — Danh sách đầy đủ cùng/ngược BTC, mạnh/yếu hai chiều

- **Triển khai/kiểm tra live:**14/10/2026 lúc19:40:27 VN, PM2webPID1246044/online, watchdog3955615 không restart. Public matrix V1 ready=true, snapshot58/120 coin đủ dữ liệu, listed58=countsum58: ngược mạnh11/ngược yếu6/cùng mạnh34/cùng yếu7, các nhóm còn lại0; market NORMAL không làm mất list. Đây là counts tại lúc kiểm tra, không phải PnL/xác suất. Public HTML/JS có asset `20261014-matrix-v1`, healthok. ControlsSHA256 trước/sau `4432E1D9408E3C8E99B4816D9BCBA0DAEB45B315ACE6802895868E3A74FCD932` không đổi,4subscription/quiet00–06VN giữ nguyên. Regression matrix80/market/countertrend/whitelist/Push/quiet/toast/Binancepolicy/size PASS; browser2page desktop/mobile đủ40 dòng/8màu/4%boundary/nooverflow, artifacts `/tmp/weak-alt-browser-yeZCEE/`. Không đặt order/gửi Push/Discord thử.
- **Version/phạm vi:** `BTC_ALT_COIN_MATRIX_V1_20261014`, whitelist V35, bổ sung `coinRelations` độc lập; giữ market V2 và countertrend V1. Chỉ OBSERVE ONLY; không coi biên độ mạnh là xác suất, tín hiệu LONG/SHORT hoặc xác nhận thanh lý.
- **Dữ liệu trước entry/phân nhóm:** cùng cache top120 ALT, ≥97 nến15m đóng liên tục, đồng bộ BTC, fresh16 phút, ≥30 coin hợp lệ. Không tạo entry. Chọn cùng cửa sổ cho mọi coin:1h nếu |BTC1h|≥0,1%; nếu không thì15m nếu |BTC15m|≥0,1%; nếu cả hai trung tính dùng1h. Nếu hai khung trái chiều, ghi rõ cửa sổ; không sửa state market. Xét raw trước rounding. BTC có hướng khi |return|≥0,1%; coin đi ngang khi |return|<0,05%. Ngoài đi ngang, cùng dấu BTC = WITH, trái dấu = AGAINST; biên độ STRONG khi |coin|≥max(0,15%; |BTC|), còn lại WEAK. Đối xứng BTC tăng/giảm: coin giảm mạnh cùng BTC vẫn là coin giảm, không phải sức khỏe tăng giá. BTC trung tính: coin≥0,05% là NEUTRAL_UP, ≤−0,05% NEUTRAL_DOWN, còn lại NEUTRAL_FLAT.
- **List/stats/hiển thị:** đủ8 nhóm WITH_STRONG/WITH_WEAK/AGAINST_STRONG/AGAINST_WEAK/FLAT/NEUTRAL_UP/NEUTRAL_DOWN/NEUTRAL_FLAT, mỗi coin hợp lệ đúng1 nhóm; counts cộng bằng total/coverage. Giữ cả nhóm0, không cắt30 coin ở list live (tối đa120 coin trong universe đang theo dõi, không tuyên bố toàn bộ sàn). Mỗi dòng ghi return coin/BTC cùng cửa sổ, tỷ lệ biên độ tuyệt đối, chênh lệch điểm%, 1h/3h, giá/EMA20/50 và link coin.8 màu riêng, số coin là counts không phải PnL/winrate/AvgROE. Bảng đầy đủ mở sẵn trên cả AI Local và Volume; bảng4 tier bằng chứng ép SHORT cũ giữ riêng phía dưới. Snapshot history giữ tối đa30 dòng và truncated flag; counts vẫn tổng đầy đủ, không dùng history thiếu dòng làm list live.
- **WHITELIST/JSON:**8 key exact `weak-alt-relation:<group>` khớp UI/runtime, mặc địnhOFF, chỉ hiện checkbox khi real causal CLOSED AvgROE>4%; hiện không có cohort nên null/ẩn. Matcher optional `altBtcRelationAtEntry` đúng version/sourceAT_ENTRY/ready/symbol/evaluatedAt≤entry/age≤60s; không tự attach proof/backfill, VIEW_ONLY/live không cấp lịch sử entry. JSON cũ thiếu coinRelations không suy ra nhóm/0counts; báo chưa có runtime mới. V1/V2 market/countertrend/history/trade cũ giữ nguyên.
- **Binance/Push/test:** không sửa gate/entry/size/SL/TP/cap/route/master/protection/lệnh cũ, không thêm auto entry hoặc Push/Discord theo nhóm.8 market Push/quiet/dedupe giữ nguyên. Unit kiểm UP/DOWN/NEUTRAL và biên raw, đủ80 coin đúng1 nhóm không cắt30, future/thiếu coverage/legacy/matcher/defaultOFF; browser cả2 page desktop/mobile đủ40 dòng/8 màu, checkbox4/4,01, không overflow/XSS/API mutation. Chi tiết `docs/WEAK_ALT_REBOUND.md`.


### 2026-10-14 — Coin giữ giá / tăng ngược BTC, tách bằng chứng ép SHORT

- **Triển khai/kiểm tra live 14/10/2026:** PM2 `btc-liquidity-web` nạp lúc16:15:33 VN, PID1166280/online; watchdog3955615 không restart. Public API ready=true/error=null, market `BTC_DOWN_ALT_WEAK`, coverage74/120, feature `BTC_DOWN_ALT_COUNTERTREND_V1_20261014`. Snapshot kiểm tra: BTC1h−0,53%, 1 coin COUNTERTREND_UP (WALUSDT +2,75% cùng1h),8 HOLDING,0 SUSPECTED/OBSERVED; đây là số snapshot, không phải winrate hoặc kết quả thanh lý tương lai. Source/UI mới và healthok xác nhận. ControlsSHA256 trước/sau `49AD3C752AFBF2BC255CBB95B234799AB90E5444E3BCAA47FAA529BBD09C62D6` không đổi;4 subscription/quiet00–06VN giữ nguyên. Countertrend/market/browser2page desktopmobile/whitelist/sharedPush/quiet/toast/Binancepolicy/impulsesizing regressions PASS; screenshots `/tmp/weak-alt-browser-Q20Ysa/`. Không gửi order/Push/Discord thử.
- **Version/phạm vi:** `BTC_DOWN_ALT_COUNTERTREND_V1_20261014`, bổ sung độc lập vào market `BTC_ALT_MARKET_STATE_V2_20261013`; whitelist V34. Chỉ **OBSERVE ONLY**, ngưỡng thử nghiệm chưa backtest lợi thế. Danh sách mở sẵn trên AI Local và Volume tăng dần, vẫn hiện khi market là `BTC_DOWN_ALT_WEAK`; không suy xác suất vào lệnh.
- **Dữ liệu trước entry:** không tạo entry/proof giao dịch. Dùng cùng cache top120 ALT, tối thiểu97 nến15m liên tục, đồng bộ BTC và fresh16 phút, market đủ≥30 coin. Chỉ nến đã đóng. BTC giảm≤−0,1%: ưu tiên cửa sổ1h nếu BTC1h đạt, còn lại15m; kể cả hai khung BTC trái chiều, bảng ghi đúng cửa sổ. Return/EMA20/50/đáy cao xét raw trước rounding. Volume1h = mean quotevolume4 nến / mean20 nến ngay trước đó; taker mua là tổng takerBuyQuote / quote của4 nến; thiếu/không hợp lệ = unknown, không fake0.
- **Phân loại riêng từng coin:** HOLDING khi return cùng cửa sổ≥−0,05%, hoặc ≥0,5×BTC return âm kèm trênEMA20 hoặc đáy cao. COUNTERTREND_UP cần return cùng cửa sổ≥0,15%, 1h≥0,3%, 3h>0,1%, close>EMA20>EMA50, EMA20 cao hơn3 nến trước, minlow3 nến > minlow3 nến liền trước. SQUEEZE_SUSPECTED cần trend + volume≥1,3× + taker mua≥55% + (close vượt high20 nến trước HOẶC OI hợp đồng15m giảm≥0,3%). SHORT_LIQ_OBSERVED cần trend + ít nhất1 sự kiện BUY thanh lý SHORT có USD>0 trong chính nến15m; không bắt buộc giả định flow thay thế bằng chứng thật. Ưu tiên OBSERVED > SUSPECTED > UP > HOLDING, sau đó sức mạnh tương đối coin−BTC (điểm phần trăm) giảm dần.
- **OI/thanh lý:** chỉ đọc bộ nhớ collector đang có, không thêm REST/account/API lệnh. OI dùng số hợp đồng, ≥8 mẫu trong nến15m, biên đầu/cuối≤120s, gap≤120s và thời gian tăng nghiêm ngặt; thiếu thì unknown. ForceOrder theo đúng symbol, BUY đóng SHORT, timestamp nằm trong nến đã đóng; socketOPEN từ trước đầu nến, heartbeat≤4 phút và không ở tương lai. Không đủ phủ nguồn thì unknown (không ghi0); đủ phủ nhưng không thấy sự kiện mới ghi0. Số USD/sự kiện chỉ là mẫu Binance đã quan sát, không phải tổng đa sàn hay bằng chứng giá chắc tiếp tục tăng; OI giảm không tự chứng minh kill SHORT.
- **Stats/WHITELIST/JSON:** counts là số coin mỗi tier trong snapshot, không phải trade/winrate/PnL/AvgROE; live tối đa120 coin, snapshot event cũ chỉ giữ30 và flag truncated. Bốn key exact UI/runtime `weak-alt-coin:HOLDING`, `weak-alt-coin:COUNTERTREND_UP`, `weak-alt-coin:SQUEEZE_SUSPECTED`, `weak-alt-coin:SHORT_LIQ_OBSERVED`, mặc định OFF, chỉ hiện checkbox khi real causal CLOSED AvgROE>4%. Matcher chỉ optional `altCountertrendAtEntry` đúng version/sourceAT_ENTRY/ready/symbol/time≤entry/age≤60s; không tự attach/backfill proof hoặc lấy live/view-only làm lịch sử entry. JSON cũ thiếu countertrend/taker/OI/proof hiển thị chưa có dữ liệu, không tự gán PASS/tier; V1/V2 market/history cũ giữ nguyên.
- **Binance/Push:** không thêm route, không vào/đóng lệnh, không sửa gate/entry/size/cap/SL/TP/protection/lệnh cũ. Không thêm Push/Discord theo coin trong lượt này; 8 trạng thái market và Push/cooldown/quiet hiện tại giữ nguyên. Không seed enabledKeys hay sửa controls production.
- **Kiểm chứng:** unit tái hiện market đỏ nhưng LEADER vẫn xuất hiện, đủ4 tier, thiếu taker/OI/force/gap/future bị loại đúng; exact matcher/defaultOFF/time/symbol. Browser cả2 page desktop/mobile:4 màu, danh sách độc lập market đỏ, vì sao phân loại, XSS, legacy/empty/no-overflow và checkbox4/4,01. Tests không đặt order/gửi notification thật. Xem `docs/WEAK_ALT_REBOUND.md`.


## Bản đang triển khai 14/10/2026: BTC_ALT_MARKET_STATE_V2_20261013

Đã nạp13:46:10VN14/10/2026, PID1097632, watchdog3955615giữnguyên. PublicV2/enabledtrue/errornull/healthok; khởiđộngđangwarmup3/120nênWAIT_DATAđúngpolicy. Publicv2model/JS/SWmớiđãcómặt. 4subscription/quiet00–06VNkhôngđổi, controlsSHA235BBF1ECD1FC8A0A37392A9E56A158DAB9538D65684067DC9423281B13E95FFkhôngđổi. Tests8state/8Pushicons/browserdesktopmobile2pagePASS, khôngproductiontestnotification/order.

V2 mở rộng thành8trạng thái. Các đoạnV1 phía dưới là mô tả lịch sử, không dùng thay đổi V2 này.

| Trạng thái | Màu |
|---|---|
| BTC trung tính · ALT mạnh | Cyan |
| BTC trung tính · ALT yếu | Vàng |
| BTC tăng · ALT đồng thuận mạnh | Xanh lá |
| BTC tăng · ALT không theo | Cam |
| BTC hồi nhưng ALT yếu (V1) | Tím |
| ALT hồi yếu · nhạy khi BTC giảm (V1) | Hồng |
| BTC giảm · ALT giữ giá tốt | Xanh dương |
| BTC giảm · ALT giảm mạnh hơn | Đỏ |

NEUTRAL BTC khi cảreturn15m/1h thuộc(-0,1%;+0,1%). UP khi mộtkhung>=0,1% vàkhôngkhungnào<=-0,1%; DOWNđốixứng. Hai khungtráidấuvượtngưỡng làDIVERGENT, không ép vào6case mới. Giữưu tiênWEAK/FRAGILEV1 khi mộtkhunghồi>=0,1%+breadthV1yếu dùkhungkiagiảm. NORMAL hiểnthịphânhóa/khôngđủđồngthuận, không suyraALTmạnh; WAIT_DATAthiếu/cũ/gapkhônggiảNORMAL.

ALTmạnh:≥65%trênEMA20,≥60%tăng1h≥0,15%,≥50%giữđáycao; kèm≥25%tăngđồngthuận1/3/6h hoặc≥50%volume xanh/đỏ≥1. ALTyếu:≥65%dướiEMA20 và≥60%giảm1h≤-0,15% hoặc3h<-0,1%. BTCUP khôngđạtWEAK/FRAGILE/ALTmạnh nhưng≥50%coinreturn<50%BTCreturn cùngcửasổ->ALTkhôngtheo.

BTCDOWN dùng1h nếuBTC1h<=-0,1%, cònlại15m. Giữgiá=coinreturn>=50%BTCreturnâm; ≥60%giữgiá và(≥50%higherlow hoặc≥50%trênEMA20) mớiđạtmứcmarket. Giảmmạnhhơn=coinreturn<=150%BTCreturnâm; ≥60%coinđạt và≥60%coinâm cùngcửasổ. Các ngưỡngthửnghiệm, chưa backtest lợi thế, không điểmvào/khuyếnnghịLONG/SHORT.

Dữliệucausal/coverage/VOLproxy/beta giữV1, tấtcảshare trêncùngmẫucó97nếnđồngbộ, rawmetrics xét trước rounding. Card/history/icon/emoji mỗi trạngthái màu riêng; nativebackground OSquyếtđịnh. Coins phùhợpkịchbảnxếptrước, không xếphạngxácsuấtvàolệnh.

PushV2typeBTC_ALT_MARKET_STATE; backend/SW kiểm8state/expiry<=120s, iconfixedallowlist. Pushkhiđổistate, cùngstatekhônggửilại, cooldown30phút riêngmỗistate (không chặn chuyển sangstatekhác), FRAGILE→WEAKchỉghiDOWNGRADEkhôngsend. Quietgiữcấuhìnhcũ/khôngreplay; khônggửilịch sử trướcstartedAt. Giữexacteventdeep-link vàdurableintent/UNKNOWNkhôngretry.

V1statefile/history đọcđược, giữenable/dedupe/historyversion/nhãn/fields, chỉenvelope mớiV2khi save. V1proofmatchchỉ2oldkeys, V2proofmatch8keys. Keys exactweak-alt-rebound:<state>, defaultOFF, chỉrealCLOSEDcausalAvgROE>4% mớihiệncheckbox; hiện0/null nênẩn. KhôngattachproofhoặcthayđổitradeJSONcũ, khôngtạostatcardPnLgiả/khôngcấpBinance. Size/entry/SL/TP/cap/route/protection/lệnhđangmở giữnguyên. Unit/browser8màu/8matcher/8Pushicon, boundary/legacy/future/quiet/restart/XSS/nooverflow PASS. Không testorder/Pushthật.

Version: `BTC_WEAK_ALT_REBOUND_V1_20261013`. Ngưỡng ban đầu **chưa được backtest/hiệu chuẩn xác suất**. Cảnh báo không chứng minh nhà cái xả, không xác nhận thanh lý và không bảo đảm dự báo trước mọi lần sập.

Đã nạp backend21:04:49VN13/10/2026, PID849549; watchdog3955615 giữ nguyên. Public API V1 ready=true/error=null sau warmup (NORMAL khi BTC15m/1h âm), hai page và SW mới có mặt. 4subscription và quiet00–06VN giữ nguyên; controlsSHA256 trước/sau2F004D5632424E5B08365E6BC6D08A9D37158E2023DCF068317A6EA0DCE06403 không đổi. Tests mock+browser pass; không gửi notification/order thử lên production.

## Nơi xem và màu

Kiểm tra public sau lượt nạp cuối: V1 ready=true/stateNORMAL/enabled=true/errornull,36/120coin và36coin beta-ready; healthoktrue, controlsSHAkhôngđổi. Đây là mẫu mới, không tái sử dụng dữ liệu trước restart.

Lần nạp cuối21:08:01VN13/10/2026, PID856516; regression bổ sung firstFRAGILE→WEAK không gửi thông báo hạtier PASS. Cache warmup lại sau restart; ready>=55/NORMAL ở đoạntrên là xác nhận của lượt21:04, không dùng lại làm số liệu live lượt mới.

- [AI Local](/local-ai-trend-evaluation#weak-alt-rebound) và [Volume tăng dần](/rising-volume-watch#weak-alt-rebound).
- **Tím:** BTC hồi nhưng breadth ALT yếu. **Tím đậm:** thêm tỷ lệ lớn coin hồi kém và phản ứng giảm bất đối xứng với BTC.
- Push title dùng🟣 và icon riêng; nền/âm thanh do trình duyệt/hệ điều hành quyết định, không có tùy chọn tự ép màu nền native notification.
- Khi bấm Push: `/local-ai-trend-evaluation?weakAlt=<eventId>#weak-alt-rebound`, tự mở dòng lịch sử đúng ID. Snapshot lịch sử không thay thế cảnh báo hiện tại.

## Dữ liệu và ba lớp

Chỉ đọc cache nến15m của top coin thanh khoản từ health universe hiện có (mặc định120, không phải tất cả altcoin). Không thêm REST, modelAI hoặc Coinglass. Mỗi coin cần≥97 nến đóng liên tục đồng bộ với BTC; lấy tối đa100. Giá/OHLC/quotevolume phải hợp lệ; timestamp không tương lai/gap/duplicate, latest≤16phút. BTC hoặc<30coin đủ dữ liệu ->WAIT_DATA, không NORMAL giả.

| Lớp | Điều kiện thử nghiệm |
|---|---|
| BTC hồi | Return15m hoặc1h ≥+0,1% bằng nến15m đóng |
| Breadth yếu | ≥65% coin dướiEMA20 và (≥60% giảm3h<-0,1% hoặc≤15% cùng tăng1h/3h/6h theo ngưỡng0,05/0,1/0,2%) |
| Coin hồi kém | Coinreturn <0,5× BTCreturn ở cửa sổ1h khi BTC1h≥0,1%; còn lại15m khi BTC15m≥0,1%. Đồng thời VOLhồi/giảm≤0,8× |
| Nhạy khi BTC giảm | BetaDown≥1,5 và≥BetaUp+0,5; mỗi chiều≥8mẫu BTC tăng/giảm≥0,05% |

WEAK_REBOUND =BTC hồi +breadth yếu. FRAGILE_REBOUND =WEAK +≥50%coin hồi kém +≥20%coin vừa hồi kém vừa nhạy giảm, và≥30coin đủ beta hai chiều. Percent đều lấy mẫu coin có nến hợp lệ làm denominator; thiếu volume/beta không tự coi PASS hoặc beta0. Số mẫu volume/beta riêng luôn hiển thị.

Giữ đáy cao hơn=minlow3bar cuối >minlow3bar trước, hiển thị bổ sung chứ không là gate. EMA20 SMA-seeded trên chuỗi đang có. Volume hồi/giảm là **proxy** mean quotevolume nến xanh /mean quotevolume nến đỏ trong12bar15m (3h), mỗi loại≥2nến; không phải phân tách chính xác tất cả sóng hồi/xả bằng swing detection.

Beta đo theo96khoảng15m đồng bộ (~24h): return phần trămcoin/BTC giữa các close liên tiếp. Tách mẫu BTCreturn≥+0,05% và≤−0,05%. Trong từng nhóm, slope qua gốc `sum(x*y)/sum(x*x)`; không dùng correlation chung, không dùng OIUSD, không ước lượng nguyên nhân/khả năng thanh lý. Mẫu hiện tại dùng để quan sát, không tự gán vào entry quá khứ.

## Push và vận hành

Loại cảnh báo mới bật Push mặc định theo yêu cầu; checkbox “Gửi Push cảnh báo ALT hồi yếu” chỉ bật/tắt loại này cho mọi thiết bị đã đăng ký. Nút “Bật Push như app” quản lý đăng ký thiết bị qua cơ chế có sẵn, không tự xin quyền thay người dùng.

- Tick theo refresh health20s, UI poll10s. Bar15m chưa đóng không dùng; sau restart, bar cũ vẫn có thể hiện trên card nhưng **không được gửi lại**. Chỉ close sau startedAt và age≤120s mới tạo thông báo; vì vậy có thể cần chờ một nến15m mới.
- Một episode gửi một lần ở mỗi tier; upgradeWEAK→FRAGILE được báo một lần, downgrade không spam. NORMAL trên một bar đủ dữ liệu mới kết thúc episode; WAIT_DATA không rearm. Episode mới trong30phút từ lần thửsend gần nhất bị cooldown.
- Persist intent/tier dedupe **trước** transport. POSTING qua restart thành UNKNOWN_AFTER_RESTART, không retry để tránh trùng; timeout UNKNOWN_DELIVERY. Không replay failed/quiet/disabled khi bật lại hoặc đến sáng.
- Tôn trọng quiet-hours đang lưu, mặc định00:00–06:00VN; không sửa schedule/subscriptions/VAPID cũ. WebPush TTL≤120s và không vượt giờquiet; SW từ chối expired/unknown type. SignalType riêng `BTC_WEAK_ALT_REBOUND`, click bị cố định same-origin và exacteventId.
- File `data/weak-alt-rebound.json` mới, history14ngày/max200, API20 gần nhất và optional selected ID. Không gọi số cảnh báo là số lệnh thắng/thua; không tính PnL/WinRate từ mẫu cảnh báo. File corrupt/khácschema/version giữ nguyên và ngừng Push.

## WHITELIST và lệnh thật

Key UI=matcher: `weak-alt-rebound:WEAK_REBOUND`, `weak-alt-rebound:FRAGILE_REBOUND`. Hook checkbox chung được nối, mặc địnhOFF. Chỉ hiện khi **real causal CLOSED AvgROE>4%**; hiện closedStats0/AvgROEnull nên checkbox ẩn, không tạo số thắng/ROE giả.

Matcher chỉ nhận field optional `weakAltReboundAtEntry`, versionV1, sourceAT_ENTRY, readytrue, evaluatedAt trướcentry và tuổi≤60s. Không tự attach/bổ sung dữ liệu mới vào trade JSON cũ. Không có proof ->khôngmatch. Đây là registry quan sát, **không route/gate Binance thật**. Không sửa size, entry, cap, SL/TP/protection hoặc vị thế cũ. LONG BUY_IMPULSE2/1USDT vừa giảm giữ nguyên.

## API, kiểm tra và tái lập

GET `/api/weak-alt-rebound?weakAlt=<id>` đọc snapshot, không chạy detector/submit; POST cùngorigin body `{enabled:boolean}` chỉ lưu lựa chọnPush, không có field vào/đóng lệnh. Đường này no-store, methods khác405; không có senderDiscord mới.

`npm run test:weak-alt-rebound`: unit causality/future invariance/gap/stale/minsample/missingvolume, cả3lớp, captureSlope, tierdedupe/escalation/restart/cooldown/quiet/storage, mocktransport TTL/SW/icon/deep-link; browser cảAI Local vàVolume desktop/mobile, màu, XSS, selectedhistory, 4%/4,01%checkbox/defaultOFF và nooverflow. Regression sharedPush/quiet/whitelist/toast/BTCcontext/forecast/Binance policy chạy riêng. Tests không gửi production notification/order.
