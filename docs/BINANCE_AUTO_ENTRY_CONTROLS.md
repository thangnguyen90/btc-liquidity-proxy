# Binance auto entry controls

### 2026-10-20 — Bốn dòng SHORT5 đã yêu cầu giảm về1

Config version `FOUR_ACTIVE_SHORT_MARGIN5_TO1_V1_20261020` chỉ sửa margin của đúng bốn matcher: EMA99 rebound-near-reject SHORT15m; Horizon4h8h12h LOWER SHORT; LiqScan high-score BELOW SHORT; post-pump-no-buy5m impulseSHORT. Không đổi EMA99 5m/default catalog hoặc route khác; giữ ON/OFF/enabledAt/master/leverage/TP/cap. Ba route editable dùng saved1 và vẫn chỉnh được sau. Impulse sizingV3/entryV9 mới SHORT cố định1, LONG vẫn2/1 theo OR giờ/BTC; controlsV44/policyV59 chặn proofV2/SHORT5 từ nativeentry mới. UI/Discord currentSHORT1, lịch sử giữ size đã lưu. Không reset activation/replay/DCA, không sửa lệnh cũ; HeatmapSHORT3 và PumpTurnSHORT2 giữ.

Dữ liệu trước entry, selector/phân loại/freshness/cooldown của cả bốn executor không đổi; cảnh báo sớm OBSERVE ONLY vẫn không có quyền. TP/SL/cap/rounding/minimum giữ từngroute (CURRENT mục20-10), notional yêu cầu margin1×leverage5=5. Không thêm cardPnL/WHITELIST, không thay thống kê fill/AvgROE cũ; policyWHITELIST defaultOFF/closedAvgROE>4% giữ. Config operation thuần/idempotent/stricttarget, không migration ép lại mỗi lần đọc; JSONextra/oldattemptIDs/proofV1V2hiển thị/oldfills giữ. Test actualbuilder/runner/controlstale5/configrestart/TP-SL/otherstrategy invariants, mockonly. Không order hoặc notification thử.


### 2026-10-20 — Heatmap quét hết tập cụm (hai route mới)

ControlsV43/policyV58/entry `HEATMAP_FULL_SWEEP_SHORT3_LONG1_5X_TP10_SL30_CAP20_V1_20261020`; source `heatmap-full-sweep`, stream `live-mark-frozen-clusters`. UI/runtime key chính xác `[source,stream,"ALL_TRACKED_UPPER_SWEPT","SHORT"]` hoặc `[source,stream,"ALL_TRACKED_LOWER_SWEPT","LONG"]`. SeedOFF, bật riêng theo xác nhận người dùng và ghi enabledAt mới; không bật master hay route khác nếu đang OFF. Không phải card WHITELIST/PnL mới, không bỏ policy closedAvgROE>4%/defaultOFF của WHITELIST hiện có.

Dữ liệu trước entry và phân loại: detectorV3 frozen 3closedprofiles/2model local24h5m đủMARK/OI/≥35%, cụm chưa chạm ở đúng phía trong±5% mặc định, TTL15phút, MARK mới liên tục≤10s; chỉ full-set mới cấp native server authority, partial OBSERVE ONLY. Cohort phải arm sau enable/start; age≤30s/drift≤0,5%/active cohort/master/runtime/route/protection/noDCA/no-existingposition-or-pending checked trước MARKET. SHORT3/LONG1margin×5, TP+10/SL−30ROE fill anchored, cap20 riêng dùng chung hai hướng không ảnh hưởng cap PumpTurn hay toàn tài khoản. Cấm ceil size, LONG5notional có thể bị reject sau floor; không bypass exchange minimum.

Audit/JSON: detectorV1/V2 giữ history không replay, entryledgerV1 mới độc lập, optional audit snapshot/version/ID; exacthms_ fill protection recovery, không scan vị thế cũ. Durable reservation/dedupe/unknown retained, definite rejection−2019/−4164/proven pre-MARKET released, cùngID khôngretry. UI chỉ status/orderId/reason/quota (không winrate/PnL cohort); Discord độc lập delivery, Push/quiet-hours/exclusions/cutoff giữ. Tests defaultOFF/exact matcher/authority/size/protection/quota shared20/unknown/race/oldJSON/no replay và production MARKET+TP/SL mock hai hướng. Xem đầy đủ tại CURRENT mục20-10.


### 2026-10-19 — Pump Turn: margin rejection không giữ quota

`PUMP_TURN_NEAR_KNOWN_EXCHANGE_REJECTION_V2_MARGIN_20261019` chỉ bổ sung knownreject−2019number/string hoặc exactlegacytext `Margin is insufficient.` khi thiếu/nullcode. Notionalreject−4164 V1 giữ. NewattemptEXCHANGE_REJECTED, legacyERROR_OR_UNKNOWN được diễn giải effectiveStatus khiquota/samecoin/UI mà không thay record. UNKNOWN/SUBMITTING/timeout/partialtext/contradictorycode vẫnreserved; không resetmọi lỗi. IDcũ khôngretry, cácUNRESOLVED cũgiữlịch sử, chỉ eventfreshkhácID mới xét dưới guard hiện tại.

Inputtrướcentry/selector/gate không đổi:72closed5m+freshsocket≤30s/proof/MARKdrift/control/runtime/protection/noexistingposition-or-pending/noDCA/owncap20. Margin2×5/TP10SL30/activation/cutoff1791364588465/oldpositionSLTPgiữnguyên; không tựnạp tiền/nângsize/bypassmargin. Source/matcher/defaultOFFseed và routeON đãlưu khôngđổi. JSONV1/V2/oldproof/dedupe khôngmigrate, fieldoptional tương thích; stats chỉoperational, khôngcardWHITELIST/PnL/AvgROE mới, policycũ defaultOFF/closedAvgROE>4%giữ. Testsnew/legacy−2019/code/string/exacttext/unknown/dedupe/restart/nodca/quota/protection, mockonly; khôngorder/Push/Discord thử.

### 2026-10-18 — Pump Turn 5m repair độc lập (không đổi quyền giao dịch)

`PUMP_TURN_5M_REPAIR_V2_BOUNDED_PRIORITY6_20261018` chỉ sửa nguồn dữ liệu: timer10s/max6repair/max1inflight, ≤2prioritySHORT/faircursor≥4slot, retry60s, force90bars nếu closedtail thiếu/gap/invalid/stale, verify lại readiness. Không chờ coreEMA tiers; giữ sharedRESTban/congestion/dropOnCongestion và socket5m idempotent. Riêng repair priority6/source `PumpTurn.repair:5m` để không bị bulk8/OI7 lấn; account/order/protection0–1 vàreads≤5 vẫn trước, callerKlineCache khác mặc định8, globalbudget/concurrency khôngđổi. Trước entry vẫn ≥73closed5m liên tục/hợp lệ/latest≤375s, frozenproof72 +freshsocket≤30s/gatePumpTurnV1; không nới selector/zone/cooldown hoặc dùng REST để tự submit.

MARKET ruleV2/source/matcher/controlsV42 không đổi: defaultOFF seed mới, giữ trạng thái/activation hiện có, margin2×5/TP10/SL30/owncap20/noDCA/runtime/protection/cutoff1791364588465. Không sửa vị thế/TP-SLcũ, không phát lại lịch sử/attemptIDs. JSONhistory/ledger/version giữ nguyên, snapshotwarmup/reason optional chỉ operational khôngPnL/cardWHITELIST mới; policycũ closedAvgROE>4%/defaultOFF giữ nguyên. UI báocoveragepartial/scanstale, không gán thiếu dữ liệu thành không có tín hiệu. Unit/realsizingcache mocks/browser/protection/no replay tests; khôngordertest/notificationtest.

`KLINE_CACHE_LATE_FINAL_NO_DOWNGRADE_V1_20261018`: sharedcache nhận finalWS đến muộn vào đúngopenTime đã có, giữ final trước partial/RESTrace. Không bịa nến/chèn lịch sử thiếu, không sửa rulequyềngiao dịch, chỉ làm dữ liệu của reader chính xác hơn; stats optionalversion, otherseeddefaultpriority8 giữ nguyên. Không sweep vịthếcũ/TP-SL.

### 2026-10-18 — Quantity/price integer và reject notional

`BINANCE_FIXED_FORMAT_KEEP_INTEGER_ZEROS_V1_20261018` sửa serialization payload mới: ERA10USDT/0,07119/step1 →140, không14; tickpriceinteger cũng giữ trailingzero. Không đổi floor/minQty/minnotional/no-ceil, selector/gate hoặc margin2×5/TP10/SL30/capriêng20/route/master. Không sửa/đóng lệnh cũ hoặc thêm scanner. Dữ liệu vẫn metadata exchange+MARK và proof trướcentry cũ.

`PUMP_TURN_NEAR_KNOWN_NOTIONAL_REJECTION_V1_20261018`: nhận diện−4164 hoặc chính xác đầy đủ thông điệp từ chối notional; attempt mớiEXCHANGE_REJECTED/errorCode, legacyERROR_OR_UNKNOWN chỉ được diễn giải khi checkquota/noduplicate và UIeffectiveStatus, không đổi record/cùngID khôngretry. Unknown/timeout/thông điệp mơ hồ vẫnreserved. Chỉ signalmới khácID mới có thể xét lại và vẫn chặn khi có position/pendingentry. JSONoldV1/V2/proof/activation/cutoff giữ nguyên, optionalfields tươngthích; trạng thái operational không phải PnL/cardWHITELIST mới (policycũ defaultOFF/CLOSEDAvgROE>4% giữ nguyên). Tests actualserverhelper+reject/noreplay/unknown/regression dùngmock, không gửiorder hoặcPush thử.

Hiện hành18/10: Heatmap sweep có chế độ toàn thị trườngV2 (vẫn chỉDiscord); route `pump-turn-near-short` dùng MARKET V2 own-cap20, margin2USDT×5/TP10/SL30, controlsV42/policyV57. Chỉ đếm vị thế của rule này và reservation đang gửi/chưa rõ kết quả, không dùng max chung30. Các mục V1/maxchung phía dưới là lịch sử.

### 2026-10-18 — GẦN VÙNG SHORT V2: quota riêng 20

Version `PUMP_TURN_NEAR_SHORT_2USDT_5X_TP10_SL30_OWN_CAP20_V2_20261018`; key UI/runtime giữ `["pump-turn-near-short","live-5m-near-zone","PUMP_TURN_NEAR_SHORT","SHORT"]`, defaultOFF cho seed mới, không đổi ON/enable timestamp đang lưu. Payload phải cap20/scope đúngsource, không thể gán GLOBAL hoặc lấy quota rule khác. 72closed5m/freshsocket và proof replay, NEAR/IN_ZONE/new-only/age/price/no-DCA/protection/master/runtime của V1 giữ nguyên. Size2×5/notional10, TP10/SL30 full-fill không đổi.

Đếm coin SHORT của source bằng actual live positions + audit fill và durable attempts; hợp nhất coin, không tính LONG/lệnh tay/source khác. SUBMITTING/unknown giữ slot, accepted mới120s chờ vị thế xuất hiện, sau đó cần vị thế đang mở; CLOSED clientid giải phóng, không xóa unknown theo tuổi. Current CHECKING chưa gửi không tính, current SUBMITTING được exclude tại preflight/final MARKET. 19own+60others cho lệnh thứ20; 20own/pending chặn bằng `MAX_PUMP_TURN_NEAR_20`. Panel quota là operational snapshot, không card thống kê hoặc WHITELIST/AvgROE mới. Các card WHITELIST cũ vẫn defaultOFF/closedAvgROE>4%.

V1 ledger giữ tất cả attempt/id/dedupe/trạng thái; memory rootV2 và save lần sau, không replay ICNT/COLLECT cũ. V1 order proof không còn được authorize entry, chỉ exact-clientid/orderid protection recovery cho fill cũ. Không quét/sửa vị thế cũ/cutoff1791364588465. Không đổi các route/cap/master khác, Heatmap chỉ Discord. Unit production-function mocks kiểm tra cap/reservation/closed/restart/legacy/no-replay/TP-SL, browserdesktop-mobile; không test order/notification thật.

### 2026-10-18 — Quét hết cụm upper là cảnh báo, không SHORT gate

`HEATMAP_UPPER_SWEEP_WATCH_V1_20261018` chỉ gửi Discord riêng cho coin người dùng bật trên Heatmap (mặc địnhOFF/max10). Hai model tự tính Binance24h/5m, ba profile có trướcarm/MARK+OI đủ, ≥35% mỗi profile; cụm chưa chạm trong phạm vi+5%(chỉnh0,5–10). MARK sauarm vượt mépcao mới quét hết; một tin cụm đầu và một tin hết tập chốt/15phút, vùng giữ15phút/gap>10s hủy/restart không replay. Tin có phạm vi/count/mốc, không khẳng định hết thanh lý thực/toàn sàn hoặc giá sắp đảo chiều.

Không có thống kê CLOSED/AvgROE/cardstat/cohort/matcher/WHITELIST mới; không suy ra quyền Binance từ nhãn quét. Không gọi executor/account/order, không thay entry/size/SL/TP/master/cap/route/controls/protection/cutoff/lệnh cũ. State riêng versioned/500events14ngày, JSON trade/chart/manual alerts cũ không migrate. Dedicated webhook secret server/fetch ngoài generic Push bridge; Push/quiet hours hiện có không đổi. Unit/VMAPI/browser desktop-mobile/cooldown/dedupe/restart/errors/zero order tests dùng mock. Quy tắc WHITELIST thật defaultOFF/CLOSED AvgROE>4% giữ nguyên.

### 2026-10-18 — Push mốc giá Heatmap không phải giao dịch

`HEATMAP_PRICE_PUSH_UI_V1_20261018` dùng `MANUAL_PRICE_PUSH_ALERT_V2_HEATMAP_CONTEXT_20261018` chung với Thanh khoản ngược. Chỉ người dùng submit mốc>0 cho coin FuturesUSDT mới tạo cảnh báo; chọn nhanh mức từ kịch bản chỉ điền form, không POST/entry. Kích hoạt theo MARK chạm/cắt lên hoặc xuống, one-shot/shared cap50, không dựa PnL/nhãn đủ điều kiện heatmap. Không thống kê CLOSED/AvgROE/matcher/cohort/WHITELIST mới và không cấp quyền Binance.

Không sửa Binance entry/size/SL/TP/master/route/cap/protection/cutoff/lệnh cũ. Chỉ thêm UI/snapshot GET/context link trong state giá chung; sourcePage/range optional cho alert mới, JSON V1/alert cũ giữ mốc/status/link Coin Level. Push dùng subscriptions/dedupe/quiet hours chung (không gửi bù), không Discord. Unit/browser/quiet regression dùng mock, không gửi order hay Push thật để test. Quy tắc WHITELIST giao dịch thật/defaultOFF/CLOSED AvgROE>4% giữ nguyên.

### 2026-10-18 — Kịch bản ghép heatmap không cấp quyền vào lệnh

`HEATMAP_CONFLUENCE_SCENARIOS_V1_20261018` / UI/API V3 / pool profiles V2 chỉ hiển thị khi tìm coin trên Heatmap Lab. Ba profile hai model kết thúc TRƯỚC nến xét (logbin0,25%, intensity≥35% từng profile, OI fresh), nến đóng OHLCV/taker và cấu trúc high12/low3/pump72 tạo bốn trường hợp LONG tiếp diễn, SHORT sau bơm, LONG reclaim, SHORT reject. Cùng dữ liệu Binance public hiện có, không account/order API mới. Volume≥100k/1,3×, taker55%, R:R tham chiếu≥1,5 sau chi phí0,14% là điều kiện QUAN SÁT chưa backtest, không phải gate giao dịch hoặc xác suất thắng.

Các khối này không có thống kê CLOSED/AvgROE, không phải cohort/matcher, không tạo checkbox WHITELIST và không tự bật quyền giao dịch. Không thay Binance entry/size/SL/TP/cap/master/route/protection/cutoff, không quét/chỉnh lệnh cũ, không Push/Discord. JSON trade/controls giữ nguyên; API thêm `profiles/scenarios`, import JSON chart cũ vẫn vẽ nhưng không phân tích nguồn chưa xác minh. Unit/API/browser kiểm missing/freshness/causal prior/4nhánh/R:R/search/error/zero writes PASS. Quy tắc WHITELIST giao dịch thật hiện hành vẫn yêu cầu key runtime/UI exact, mặc định OFF và CLOSED AvgROE>4%; các kịch bản này không được dùng để bỏ qua quy tắc đó.

### 2026-10-18 — Heatmap Lab tự tính từ dữ liệu Binance

`BINANCE_LOCAL_HEATMAP_LAB_V2_20261018` / `BINANCE_LOCAL_HEATMAP_V1_VOLUME_OI_20261018` thay renderer CoinglassAPI cũ tại cùng URL. M1poolvolume/M3poolΔOI là ước lượng với leverage/maintenance/side split giảđịnh; chỉsố0–100 riêng từngmodel, khôngsốtiềnthanh lý. ChỉGETnến/MARK/OIpublic quaRESTgate, khôngAPIkeyCoinglass hoặc lệnhaccount. Khôngtạo tínhiệu/tier/cardAvgROE/matcher/checkboxWHITELIST. KhôngảnhhưởngBinanceorder/entry/size/SL/TP/controls/cutoff/lệnhcũ hoặcJSONtrade; importJSONchartcũ vẫnđọcsourceIMPORT. Đoạn tài liệu15/10 bên dưới là lịch sử bảnV1, đãđược bảnV2 này thay thế choHeatmapLab; cácpageCoinglasskhác giữnguyên.

### 2026-10-18 — Điểm bơm / xả chỉ theo dõi vùng và Discord

`PUMP_TURN_ZONE_WATCH_V1_20261018`, `/pump-turn-watch` sử dụng cache5m và giá socket mới để cảnh báo gần vùng LONG/SHORT. Near mặc định0,75%, dải vùng0,5%, mốc giữcho nến5mkế; gầnvùng chưa có xácnhận nến. Đây khôngphải matcher/WHITELIST/cohortstatcard hoặc gateBinance. Khôngcheckbox “lệnhthật”, khôngđặt/hủy/đónglệnh, khôngđổi margin/size/SL/TP/quota/master/cutoff. Nến đạt hiểnthị/ghi lịch sửquan sát, không gọiexecutor. Các con sốbacktest chỉđoạnvăn, khôngAvgROEclosedthật đủcấpquyền. JSONvàsettingsDiscord độc lập; đổingưỡnggầnvùng khôngđổiđiềukiệnentry đangchạy. Discordfallbackkênhchung đãcấuhình và bypassgenericPushbridge đểkhôngphátPushkhôngđược yêu cầu. Tests kiểmAPIread-only/parity/freshness/reserve/chốngtrùng/restartvàbrowser, khôngtestbằnglệnhthật.

### 2026-10-17 — Cảnh báo delist độc lập với lịch sử vùng

`BINANCE_CONTRACT_RISK_V2_INDEPENDENT_DISCORD_20261017` / DiscordV1_20261017 chỉ cảnh báo lịch Binance, không gateentry/WHITELIST/cardthốngkê. Giữ nguồnexchangeInfo/notices, cửa sổ7ngày/refresh5m/stale15m/stage; GET `/api/binance-contract-risks` readcache riêng, panelUI tảiđộc lập, không gửi lệnh/Push/Discord khi đọc. Discord dùng `CONTRACT_RISK_DISCORD_WEBHOOK_URL` hoặc kênhchung `DISCORD_WEBHOOK_URL`, thông báo giờVN/source/deeplink đúngcoin, không lộwebhook.

Perchannel reserve/dedupe event+stage trướcsend; Pushcũ không chặnDiscord đầu cho lịchđangcó, không replayPush hoặc lịchqua>2m, không retryUNKNOWN/PENDINGsaurestart. Push/Discord độc lập, không tạo genericPushtrùng qua Discordbridge. Không thay Binance/entry/size/SL/TP/master/route/cap/DCA/exclusion hoặc cách tínhPnL/AvgROE. JSONrisk thêmdiscordSent/delivery; trade/zone/watermarkJSON cũ giữ nguyên, không migration. Unit/API/browsermock PASS (mainAPI treo vẫnhiệnrisk); không gọiBinanceorder hoặc gửiDiscordtest.

### 2026-10-16 — Tự phục hồi kênh nhận fill bị treo

Stream `POSITION_USER_DATA_STREAM_V3_HEARTBEAT_RESTART_20261016`, health `USER_DATA_HEALTH_V1_PONG_REST_DRIFT_20261016`. PING30s/PONG15s/check5s, connecttimeout20s; RESTposition60s sẵn có phát hiện thay đổi không có ACCOUNT_UPDATE tương ứng sau15s. Reconnect sau5s và replay exact FILLED mới; tài khoản không giao dịch không bị coi là treo, rotate23h phòng giới hạn tuổi socket.

Nếu≥3 lỗi kéo dài≥5phút hoặc recovery treo≥5phút, watchdog ngoàiBE nhận restartRequired quahealth và restartweb sau2checks lỗi (15s/check), giữ grace/cooldown và khôngupdateenv. Policy trước entry, signal/gate/size/SL/TPtargets, exclusions/DCA, thống kê/WHITELIST không thay đổi. Recovery overlap10m và dedupeorderID, vẫn bắt buộc fixednew-order boundary07/10/2026 16:16:28.465VN và exactOrder/PositionRisk; không scanner SL trên lệnh cũ. JSONtrade/tracking/watermark giữ schema, health thêmfield; testmock không gửi lệnh thật.

### 2026-10-15 — Trang thử vẽ CoinGlass Model 1 / Model 3

- **Triển khai/đối chiếu live:** 15/10/2026 lúc 19:56:59 VN, PM2 web PID1632708 online; watchdog3955615 không restart. Public HTML có cả2 model, health OK; API status đúng version/OBSERVE ONLY/affectsOrders=false/apiConfigured=false, cả2 model trả NOT_CONFIGURED, không giả dữ liệu thật. Controls SHA256 trước/sau `EA6DFE2F8863A3047B58A8542058CF599556C1A7595137B88911795912DB7E80` giữ nguyên; 4 subscriptions và quiet00–06VN không đổi. Unit/browser desktop-mobile/navigation55/toast55/sharedPush/quietHours/autoBinancePolicy và syntax server PASS; browser artifacts `/tmp/heatmap-lab-P5JO08`. Không đặt lệnh, refresh collector hoặc gửi Push/Discord thử.

- **Version/phạm vi:** `COINGLASS_HEATMAP_RENDER_LAB_V1_20261015`; trang `/coinglass-heatmap-lab` / .html, navigationV13. Chỉ renderer **OBSERVE ONLY**, không model dự báo/gate hoặc tín hiệu mới, không card thống kê giao dịch/WHITELIST mới. Menu cả55 trang có link Lab, vẫn giữ Binance Controls.
- **Dữ liệu trước entry/nguồn:** không tạo entry; không gọi manager/refresh/login/lifecycle/runner Coinglass Model3 đang chạy. APIread-only riêng dùng2 endpoint chính thức `/api/futures/liquidation/heatmap/model1` và `model3`, exchangeBinance cùng symbol/range, key chỉ backend `COINGLASS_API_KEY` hoặc `CG_API_KEY`, không gửi key vào HTML/client/log/error. Backend hiện chưa có key; không giả đã tải ma trận thật. Status chỉ boolean; nút tải gọiGET thủ công, không autopoll/trả lời quota bằng DEMO. Docs: https://docs.coinglass.com/reference/liquidation-heatmap và https://docs.coinglass.com/reference/liquidation-heatmap-model3.
- **Phân loại/JSON/provenance:** COINGLASS_API chỉ khi endpoint model đúng trả ma trận hợp lệ; IMPORT là file đọc client-only, không upload, model/nguồn do người dùng khai báo chưa xác minh; DEMO chỉ khi bấm nút hoặc ?demo=1, badge và watermark trên cả2chart. DEMO dùng CÙNG candles/cells cho2model, không dựng khác biệt giả thuật toán. Một model lỗi không mượn dữ liệu model còn lại, không auto-fallback DEMO hay giữ snapshot cũ như live. Đổi coin/range xóa2dataset và hủy request cũ; mixedsources hoặc khung thời gian không chồng đủ có cảnh báo.
- **Schema/renderer:** nhận official `y_axis / price_candlesticks / liquidation_leverage_data` và rawweb `y / prices / liq`; chỉ zones tổng hợp bị từ chối, không kéo firstX–lastX thành heatmap giả. Validate model/symbol/range, axis dương/khôngtrùng, OHLC/timeordered/timestampfuture, cells x/yinteger/bounds/intensity≥0/khôngtrùng; sorty kèm remapindex đúng; không resample/liên kết khoảng thiếu. Emptyliq hợp lệ chỉvẽnến và ghi rõ. Bounds10klevels/20kcandles/1Mcells, JSONmax32MB; invalid khôngvẽ. Canvas2D màuviridis/log hoặc tuyến tính, ngưỡng tương đối renderer riêng (không nhận là công thức CoinGlass), heatcells+nến/trụcgiáphải/crosshair/tooltip/zoom/pan/reset/axislock, responsive2cộtdesktop/1cộtmobile. Intensity không gán USD/PnL/xác suất.
- **Quota/thống kê/ảnh hưởng:** API timeout12s/model, inflightdedupe, cache120s/tối đa4key, max6externalrequest/phút, không tăng REST Binance/sharedcollector. Không số winrate/PnL/AvgROE từ cường độ/DEMO. Không đổi Binance/entry/size/SL/TP/cap/master/route/protection hoặc lệnh cũ; không Push/Discord. Dữ liệu collector/history/trade JSON cũ không sửa/migrate; zones-only JSON không đủ vẽ nhưng vẫn giữcho logic cũ.
- **Tests:** unit official/raw/import/modelmismatch/yremap/cellbounds/empty/DEMOequal/keyisolation/cache/inflight/quota bằng mock. Browser desktop/mobile thựcvẽ2canvas, pixelheatmap+nến, watermark/hover/zoom/threshold/JSONimport/partialAPI/no-fallback/modelguard/mixedsource/nooverflow/zeroAPIwrites. Navigation55/55, không provider/account/order/notification trong tests. Tài liệu chi tiết `docs/COINGLASS_HEATMAP_LAB.md`.


### 2026-10-15 — Thêm Binance Auto Controls vào mọi menu

- **Public đã xác nhận:**54/54 trang trả HTTP200 và có đúng1 link Binance Auto Controls trong menu chính;0 lỗi/0 trùng. Không chạy JavaScript đặt lệnh, chỉ GET HTML.
- **Version/phạm vi:** navigation `LOCAL_AI_NAVIGATION_ALL_MENUS_V12_BINANCE_AUTO_20261015`; chỉ liên kết đến `/binance-auto-controls`, không thêm nhãn tín hiệu/card thống kê hoặc WHITELIST.
- **Menu:** bổ sung32 menu còn thiếu; đủ54/54 trang HTML, mỗi menu chính đúng1 link. Giữ mục đã có/active và CTA trong nội dung; CTA không được tính thay menu, không chèn vào menu phân trang. Nhận cả alias.html/query/hash, inject lặp không trùng.
- **Dữ liệu/thống kê/Binance/JSON:** không dùng dữ liệu trước entry, không đổi phân loại/thống kê/gate/entry/size/SL/TP/route/quyền/controls/lệnh cũ. Không sửa JSON hoặc schema dữ liệu. HTML cũ được bổ sung link nhưng giữ nội dung còn lại.
- **Triển khai/kiểm tra:** sửa HTML tĩnh để menu có ngay, không cần restart backend/cache/runner; helper điều hướng chung V12 được dùng từ lần khởi động bình thường kế tiếp. Test54/54 nguồn và rendered menu, bodyCTA/active/alias/legacy/pagination/idempotence PASS. Không đặt lệnh hoặc gửi Push/Discord thử.


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


### 2026-10-14 — BTC/ALT V2: thêm trung tính/mạnh, đồng thuận và giữ giá
- **Triển khai:**14/10/2026 lúc13:46:10VN, PM2webPID1097632/online; watchdogPID3955615khôngrestart. PublicAPI trảV2/enabledtrue/errornull, lúckiểmtrađầuwarmup3/120/WAIT_DATA (khôngfakeNORMAL), publicmodel/JSv2/SWtypeV2 vàhealthoktrue xácnhận. PushtransportV13,4subscriptions/quiet00–06VNkhôngđổi. ControlsSHA256trước/sau235BBF1ECD1FC8A0A37392A9E56A158DAB9538D65684067DC9423281B13E95FFgiữnguyên. Test8state/8Pushicons+browserdesktop/mobilecả2page vàregressionswhitelist/sharedPush/quiet/toastPASS; screenshots /tmp/weak-alt-browser-RYy01x/. Khônggửiorder/notificationthử.
- **Version:** `BTC_ALT_MARKET_STATE_V2_20261013`, Push `BTC_ALT_MARKET_STATE`, transportV13/toastV10/whitelistV33. Giữ endpoint/file/keyprefix weak-alt-rebound vàhai nhãnV1; thêm6case mới, chỉ OBSERVE ONLY/chưa backtest lợi thế hoặc xác suất, không gate Binance.
- **Dữ liệu trước entry:** giữ100nến15m cache/ít nhất97nến đóng liên tục, đồngbộBTC, freshness16phút, ≥30ALT top120thanhkhoản. Không thêmREST/AI. ReturnBTC15m/1h raw: NEUTRAL khi cảhai abs<0,1%; UP khiít nhấtmột>=0,1% khôngkhungnào<=-0,1%; DOWNđốixứng; trái chiều vượtngưỡng=DIVERGENT, không gán6case mới. Hai cảnhbáohồi yếuV1 vẫn ưu tiên khi mộtkhungBTC>=0,1%+breadth yếu, kể cảkhungkiaâm; tránhxóa rủirocũ.
- **Phân loại:** ALTstrong ≥65%trênEMA20 &≥60%coinreturn1h≥0,15% &≥50%giữđáycao, kèm (≥25%đồngthuậntăng1/3/6h hoặc≥50%VOLxanh/đỏ≥1). ALTweak ≥65%dướiEMA20 &(≥60%giảm1h≤-0,15% hoặcgiảm3h<-0,1%). NEUTRAL+strong/weak->hai nhãntrungtính. UP+breadthV1yếu->WEAK/FRAGILEcũ; nếukhông thìstrong->UP_ALT_STRONG; ≥50%coinreturn<0,5×BTCreturn cùngcửasổ->UP_ALT_LAGGING; cònlạiNORMAL/phânhóa. DOWN: coinfaster khi return<=1,5×BTCreturnâm, ≥60%faster &≥60%coinâm->DOWN_ALT_WEAK; coinresilient khi return>=0,5×BTCreturnâm, ≥60%resilient &(≥50%higherlow hoặctrênEMA20)->DOWN_ALT_RESILIENT. Cửasổdownưu tiên1h khiBTC1h<=-0,1%, cònlại15m. Phânloại raw trước rounding, missingkhôngPASS. EMA/higherlow/VOLproxy/beta2chiều giữ địnhnghĩaV1.
- **Màu/Push:** trungtính+mạnhcyan, trungtính+yếuvàng, BTCtăng+ALTmạnhxanhlá, BTCtăng+ALTkhôngtheocam, WEAKtím, FRAGILEhồng, BTCgiảm+ALTgiữgiáxanhdương, BTCgiảm+ALTgiảmmạnhđỏ; NORMALxám/WAITslate. Card/legend/history/emoji/iconriêng đồngbộ. OSquyếtđịnhnativebackground. Mỗichuyểnstate mới báo1lần; cooldown30phút riêngmỗistate, cùngstatekhôngspam, FRAGILE→WEAKghiDOWNGRADEkhôngPush. NORMAL/WAITkhôngPush; quiet/disabled/stale/UNKNOWNkhôngqueue/retry/sángreplay. Chỉclose sau startedAt vàfresh<=120s; persistintent trướcsend, exacteventlinkAI Local.
- **Stats/JSON/WHITELIST:** khôngWinRate/PnL/AvgROEgiả; closedStats0/null. Támkey exactUI/runtime `weak-alt-rebound:<state>` (6new+2old), defaultOFF/khôngseed, chỉrealcausal CLOSED AvgROE>4% mớihiệncheckbox. MatcheroptionalweakAltReboundAtEntryV2/sourceAT_ENTRY/ready/time<=entry/age<=60s; V1chỉmatch2nhãncũ, khôngmượnproofV1cho6new. StatefileV1đọcvàmigrateenvelopeV2, giữenabled/lastclose/dedupe/historyversion/label/fields/PnLkhôngđổi; V1NORMALkhôngrelabel. Corruptgiữfile+dừngPush. Research/JSONtradecũthiếuproofkhôngbackfill.
- **Binance/test:** khôngđổi entry/size/SL/TP/cap/route/master/protection/lệnhcũ, khôngđặtorder/gửitestnotificationproduction. Tests8state/missing/boundary/DIVERGENT/V1priority, allstatePush/SWicons/TTL/quiet/oldmigration/causality, exactmatcher/defaultOFF/4% vàbrowser2page desktop/mobile8màuriêng/XSS/nooverflow PASS. Chi tiết `docs/WEAK_ALT_REBOUND.md`.

### 2026-10-13 — Cảnh báo tím BTC hồi nhưng ALT yếu
- **Public sau lần nạp cuối:** APIready=true/stateNORMAL/enabled=true/errornull,36/120coin đủ97nến đồng bộ và beta2chiều; healthoktrue, controlsSHAkhôngđổi. Mẫu tiếp tục warmup; không dùng snapshot55/79 của lượttrước làm dữ liệu mới.
- **Lần nạp cuối:**21:08:01VN13/10/2026 PID856516, bổ sung regression bắt đầuFRAGILE rồi hạWEAK không gửiPush; watchdog3955615 giữ nguyên. Health/API V1 hoạt động; cache warmup lại sau restart, không phát lại snapshot cũ. Kiểm tra ready>=55 vàNORMAL bên trên thuộc lượt21:04, không giả là dữ liệu đã thu ngay sau lượt21:08.
- **Triển khai xác nhận:** PM2 `btc-liquidity-web` restart21:04:49 VN13/10/2026, PID849549/online; watchdog3955615 không restart. Public API V1/readytrue/errornull sau warmup, trạng tháiNORMAL khiBTC15m/1h đang âm (không phát cảnh báo giả); coverage đã>=55/120 và đang tiếp tục warmcache. Cả2page public cócard/JS/CSS mới, SWallowlist mới, PushtransportV12. 4thiết bị/quiet00–06VN giữ nguyên; controls SHA256 trước/sau2F004D5632424E5B08365E6BC6D08A9D37158E2023DCF068317A6EA0DCE06403 không đổi. Browserfixtures desktop/mobile PASS, screenshots `/tmp/weak-alt-browser-W6ahlf/`; không gửi testorder/notification.
- **Version/phạm vi:** `BTC_WEAK_ALT_REBOUND_V1_20261013`; Push type `BTC_WEAK_ALT_REBOUND`, transportV12/toastV9, whitelistV32. Card trên AI Local và Volume tăng dần, màu tím; WEAK_REBOUND /FRAGILE_REBOUND là **OBSERVE ONLY**, không gate giao dịch hoặc xác suất sập/được backtest có edge.
- **Dữ liệu trước entry/phân loại:** chỉ100nến15m cached, tối thiểu97nến đóng liên tục, cùng timestampBTC, latest<=16phút, giá/OHLC/quotevolume hữu hạn; tối thiểu30ALT trong top120thanh khoản (shared health universe), không gọi toàn thị trường. BTC15m hoặc1h>=+0,1%; >=65%ALT dướiEMA20 và (>=60%giảm3h<-0,1% hoặc<=15%đồng thuận tăng1h/3h/6h theo0,05/0,1/0,2%) ->WEAK. Giữ đáy cao hơn đo minlow3bar so3bar trước, chỉ thông tin thêm.
- **Lớp hồi kém/nhạy giảm:** coin chỉ đạt hồi yếu khi return cùng cửa sổBTC<50%BTCreturn (ưu tiên1h khiBTC1h>=0,1%, còn lại15m) VÀ mean quotevolume nến xanh/đỏ trong12bar<=0,8, mỗi nhóm>=2bar. Conditional capture beta=sum(BTCreturn*coinreturn)/sum(BTCreturn²), riêng96khoảng15m cóBTC>=+0,05% hoặc<=-0,05%; mỗi chiều>=8mẫu, không dùng correlation hoặcOIUSD. Coin nhạy giảm khi betaDown>=1,5 và >=betaUp+0,5. FRAGILE khi WEAK +>=50%coin hồi yếu +>=20%coin vừa hồi yếu vừa nhạy giảm +>=30coin cóbeta2chiều. Mẫu thiếu hiệnunknown, không fakebeta0.
- **Push/lịch sử/thống kê:** detector piggyback health20s, không thêmREST/AI. Push server-side bật mặc định cho loại mới theo yêu cầu, tuân thủ thiết bị đã đăng ký và quiet hiện tại (default00–06VN). Mỗi episode báo1lần/tier, upgrade1lần; cooldown30phút choepisode mới, WAIT_DATA không reset episode. Chỉ bar đóng sau startedAt và fresh<=120s được báo, không replay lịch sử/restart. Intent/dedupe lưu trước send; timeout/POSTING qua restartUNKNOWN khôngretry; quiet/disabled/stale khôngqueue sáng. Native title🟣/icon tím, không ép nền OS. Click mở exacthistory trênAI Local. History14ngày/max200/API20, không WinRate/PnL/AvgROE từ sốalert; closedStats0/null.
- **WHITELIST/Binance/JSON:** keys exact UI/runtime `weak-alt-rebound:WEAK_REBOUND`, `weak-alt-rebound:FRAGILE_REBOUND`; defaultOFF, chỉ hiện causal realCLOSED AvgROE>4%, hiện0/null nênẩn. Matcher chỉ optional `weakAltReboundAtEntry` V1/sourceAT_ENTRY/ready/evaluatedAt<=entry/age<=60s, không tự attach hoặc backfill live vào entry cũ. Không bật Binance, không sửa entry/cap/size/SL/TP/protection/lệnh cũ hay role/route. JSON thiếuproof không match; state mới file riêng, corrupt/khácversion giữfile+dừngPush, existingnotifications/quiet/VAPID giữ nguyên.
- **Test/tài liệu:** `scripts/test-weak-alt-rebound.mjs` +browser cả2page/desktop/mobile; future/gap/stale/coverage/beta-minsamples, missingvolume, layers, restart/intentdedupe/escalation/cooldown/quiet, SWallowlist/expiry/icon/same-origindeep-link, matcher/defaultOFF/4%boundary/XSS/nooverflow và regressions PASS. Không gửi testorder/Push/Discord production. Chi tiết `docs/WEAK_ALT_REBOUND.md`.

### 2026-10-13 — LONG BUY_IMPULSE 2/1 USDT, SHORT giữ5/1
- **Đã nạp runtime:** backend `btc-liquidity-web` restart lần cuối20:37:06 VN13/10/2026, PID765690/online; watchdogPID3955615 không restart. Publichealthz ok=true, JS controls public có LONG2/SHORT5. Productioncontrols SHA256 trước/sau `2F004D5632424E5B08365E6BC6D08A9D37158E2023DCF068317A6EA0DCE06403` không đổi; không đặt lệnh hoặc gửi thông báo thử. Test Discord fallback chưa có proof cũng hiển thị LONG1hoặc2; legacyproof vẫn giữ nguyên5.

- Sizing `IMPULSE_TIME_OR_BTC_LONG2_SHORT5_ELSE1_V2_20261013`, runnerV8: exact LONG `post-move-impulse / post-dump-no-sell-5m / POST_DUMP_NO_SELL_BUY_IMPULSE_LONG` giảm nhánh5 xuống2USDT margin×5x; base1×5 vẫn giữ. SHORT, nguồn khác, cap50 và permissions/master/route enabledAt không đổi.
- Pre-entry: nguyên BUY_IMPULSE5m đóng, giờ tốt03–06/12–15VN HOẶC BTCUPfresh<=120s, signal90s/drift0,5%/position/order/dedupe. Không thêm gate/nhãn từbacktest. TP+10/SL−20%ROE LONG; SHORTTP10/SL30 giữ nguyên. Chỉ lệnh mới, không sửa size/protection hay quét lệnh cũ, min-notional không đủ thìskip/không upsizing.
- Controls/auth đòi proofV2/margin2hoặc1 đúng nhánh, rejectoldLONG5/V1submit; UI vàDiscord hiện đúngside. Saved route margin5 cũ không quyết định executed margin vì IMPULSE dùng dynamic proof; không sửa JSONcontrols hay bậtroute để thay size.
- JSONhistoryV1 giữmargin5/1/PnL/attemptdedupe, Discord có thể hiểnthịV1 nguyên gốc nhưng không dùng authorize; researchpinV1 tái lập fixtures. Không tạo statcard/cohort/WHITELIST hoặc nâng quyền. Tests sizing/OR/freshness, margin/auth/controls, SLTPinvariant, current/legacyDiscord, runner mocks/dedupe vàoffline research PASS; không testorder/notification.

### 2026-10-13 — UNWINDING / forceOrder đáng chú ý trong warmup

- ForecastV2_UNWINDING/contextV4_OBSERVED_WARMUP/whitelistV31: UNWINDING suy luận BTC15m đúng hướng>=0,3%, OI15m<=-0,3%, VOL>=1,3x và taker ngược>=55%, không cần ratio crowd/OIbuild, không phải dự báo trước hoặc xác nhận liquidation thật. Absolute forceOrder>=1triệu USD/5m trên healthy stream vẫn ghi ngay khi chưa có nền35m, chưa được gán SPIKE/CASCADE; so với spike cũ>=5triệu/3x/share70 giữ nguyên. Chỉ spike nền đầy đủ với burstAt<=30m mới confirm trễ; observed event không extend burstAt. Giữ history/peak60m, không thống kê lợi nhuận từ observation.
- Keys `btc-liquidation-forecast:LONG:UNWINDING`, `btc-liquidation-forecast:SHORT:UNWINDING`, `btc-liquidation-context:LONG_OBSERVED_LARGE`, `btc-liquidation-context:SHORT_OBSERVED_LARGE`, `btc-liquidation-context:BOTH_OBSERVED_LARGE`. UI checkbox nối matcher exact trong cùng lượt, defaultOFF/không seed enabledKeys, chỉ real causal CLOSED AvgROE>4%; hiện0/null nên ẩn. Cold ready=false không match. Chỉ đúng frozen AT_ENTRY/version/age<=60s; sourceVIEW_ONLY/live/history không cấp cohort. Test hook4/4,01/defaultOFF/no APIwrites.
- File V1/V2/V3/V4/history giữ version/state gốc; forecastproofV1 vẫn WATCH/EARLY, không UNWINDING; contextprooftrướcV4 không OBSERVED_LARGE. Không restore live risk/totals/inputs qua restart hoặc replay. Không thêm auto route/order/close/repair/Push/Discord, không đổi settings/max/margin/leverage/SL/TP hay lệnh cũ. Test actual10:44, symmetric/negative, cold/history/restart, không promote cold thànhcascade và UI desktop/mobile đã chạy.

### 2026-10-13 — BTC liquidation forecast: chỉ cảnh báo sớm, không auto entry

- Version forecast `BTC_LIQUIDATION_EARLY_RISK_V1_20261013` / contextV3 / whitelistV30. Dữ liệu đóng BTC5m/quote volume/taker/global-account/top-position/OI; WATCH tích tụ vị thế hoặc giá đi ngược, EARLY thêm volume>=1,3x/taker ngược>=55%/OI chưa giảm quá0,3%; không cần forceOrder. Ngưỡng thử nghiệm, chưa backtest/xác suất; forecast30m không là rule vào/đóng lệnh. Volume thanh lý5m>=5triệu/1m>=1triệu, volume giao dịch BTC>=1,3x tô đỏ chỉ là UI, không gate.
- Keys UI/matcher exact: `btc-liquidation-forecast:LONG:WATCH`, `btc-liquidation-forecast:LONG:EARLY`, `btc-liquidation-forecast:SHORT:WATCH`, `btc-liquidation-forecast:SHORT:EARLY`. Checkbox chung nối cùng lượt, defaultOFF/không seed enabledKeys, chỉ hiện real causal CLOSED AvgROE>4%. Hiện chưa có cohort (null) nên ẩn; không lấy lượng thanh lý/điểm/tier làm AvgROE. Matcher optional `btcLiquidationForecastAtEntry` versionV1/sourceAT_ENTRY/ready/time<=entry/age<=60s, không vay context V1/V2, không backfill VIEW_ONLY/live vào entry.
- Không thêm Binance route/order/close/repair, không đổi enabled controls, size/leverage/cap/SL/TP hoặc protection lệnh cũ. Không thêm Push/Discord transport. JSON V1/V2/V3 giữ lịch sử/episode gốc, forecast thiếu -> WAIT_DATA/empty history, không restore live inputs/risk hoặc replay dự báo; cacheforecast chỉ bộ snapshot đầy đủ <=90s, quá tuổi ngừng phân loại. Test thresholds/closed data/legacy/cache, matcher/defaultOFF và UI hook 4/4,01/zeroAPIwrites/desktop-mobile đều được chạy.

### 2026-10-12 — Bối cảnh thanh lý V2: SPIKE / RECENT chỉ quan sát

- Version `BTC_LIQUIDATION_CONTEXT_V2_SPIKE_MEMORY_20261012`. Spike >=5 triệu USD/5m, >=3x nền, share>=70% trên forceOrder USDT-M nguồn đủ35 phút; không chờ REST BTC/OI. Confirm price/OI/taker/breadth chỉ dùng spike thực quan sát trong RAM <=30 phút, trace giữ60 phút. Không điều khiển Binance/entry/size/SL/TP hoặc quét sửa lệnh cũ; không thêm route/thay enabled controls, không thêm transport Push/Discord. Lịch sử peak/transition không là thống kê hiệu quả hoặc backtest.
- Nhãn mới nối checkbox WHITELIST chung: `btc-liquidation-context:LONG_SPIKE`, `btc-liquidation-context:SHORT_SPIKE`, `btc-liquidation-context:RECENT_LONG_LIQUIDATION`, `btc-liquidation-context:RECENT_SHORT_LIQUIDATION`. Exact key UI = matcher runtime, không seed enabledKeys; default OFF, chỉ hiện real causal CLOSED AvgROE >4%. Card hiện 0/null nên ẩn checkbox, không giả AvgROE từ quan sát. Frozen AT_ENTRY/version/ready và evaluatedAt trước entry <=60s mới match; spike thiếu REST ready=false không match. Không cấp lệnh thật chỉ từ key/nhãn.
- JSON V1 vẫn giữ state/proof gốc, chỉ các key cũ được match; không gán SPIKE/RECENT V2 cho proof V1. Thiếu proof không backfill. File history V1/V2 đọc được, giữ version gốc; restart lastEpisode chỉ historicalOnly, không restore live risk/coverage hoặc xác nhận trễ từ file. Test matcher/defaultOFF/4%boundary/legacy/future/partial, browser mọi state mới, no order/APIwrites và no checkbox khi thiếu causal stats đều PASS.

### 2026-10-12 — Cơ hội LONG / SHORT: MARKET READY, max riêng 15

- **Runtime UI xác nhận:** browser desktop và mobile trên public thấy LONGON/SHORTON/max riêng15, không overflow, không lỗi JS và zero API writes; screenshot `/tmp/structure-runtime-browser-Nw0hMJ/`. Margin1 USDT ×5x ghi cả tiêu đề và đoạn rule để đọc rõ trên mobile. Không kiểm thử bằng lệnh thật.

- **Transport/UI và freshness:** recheck setup vẫn READY cùng closedAt và cache chưa có nến đóng mới ngay trước submit; callback entry không chặn scan/Push/Discord. Gzip riêng GET API chart (payload trước nén khoảng1,5MB) theo Accept-Encoding, không đổi schema/dữ liệu; UI cho phép30s và báo trạng thái MARKET chưa rõ nếu đọc lỗi. Không thêm gate/nhãn/thống kê/whitelist từ thay đổi transport.

- **Version:** `STRUCTURE_READY_1USDT_5X_TP10_SL30_OWN_CAP15_V1_20261012`; source `structure-setup-ready`, stream `closed-1m-structure`, label `STRUCTURE_SETUP_READY`; controls V40, authorization V55. Người dùng xác nhận margin1 USDT ×5x, TP+10% ROE / SL−30% ROE cho LONG và SHORT, tổng max15 riêng. Đã triển khai và bật đúng hai route theo yêu cầu người dùng; route seed mặc định OFF cho cài đặt mới.

- **Kiểm tra/deploy:** test structure (pure + production MARKET/setTpSl dùng exchange giả), short setup monitor/browser desktop-mobile, controls/auth, SHORT TP policy, cap MAIN, volume/early wick, new-orders-only/watermark/full bypass và quiet Push đều PASS. Public GET xác nhận source/version đúng, masterON, LONGON, SHORTON, cap15, errornull; không gửi testOrder/Push/Discord. Backend cuối restart13:27:50 VN12/10/2026 PID101327, watchdog3955615 không đổi; enabledAt hai route13:24:41 VN, freshness tiếp tục chặn mọi closedAt trước lần restart cuối. 91 route cũ, master/exclusions/full bypass không đổi; quiet00–06VN và3 subscription giữ nguyên.
- **Trước entry / phân loại:** giữ detector cấu trúc V2. Đóng băng81–90 nến1m khi tạo setup, toàn bộ nến liên tiếp đến kích hoạt (tối đa15); re-run detector và từng transition trước cấp quyền. Chỉ chuyển mới READY có mục tiêu cấu trúc thật, R:R≥1,5, closedAt sau backend start và route enabledAt, tuổi≤70s; không WATCH/WAIT/CHASE/history/restart replay. Fresh mark lệch≤0,5%, R:R tại mark vẫn≥1,5 và không chạy quá0,5ATR theo hướng vào. EMA/RSI/điểm là xếp hạng, không gate độc lập; không thêm ratio/OI.
- **Binance:** MARKET notional5 USDT, không tự ceil lên minimum; fixed margin1/leverage5/TP10/SL30 được validator + Symbol capability server-only + controls kiểm tra trước transport. Recheck account, position/open entry, master/runtime, exclusions/full bypass, giá/tuổi và cap; không DCA/đảo chiều. Dedupe setupID, intent/proof/plan lưu atomic trước submit; serialize cùng volume/early wick chống trùng coin. Unknown không retry; pre-submit rejection được ghi rõ.
- **Max riêng15:** LONG+SHORT cộng chung, chỉ vị thế live có fill/attempt của đúng source/version, kèm slot accepted mới chờ account cập nhật và lệnh gửi chưa rõ kết quả. Lệnh thuộc source khác không tính, không đọc max chung. Dùng audit CLOSED để giải phóng slot; ledger accepted/unresolved giữ quá14 ngày để không mất ownership qua restart. Kiểm tra lại cap ngay trước MARKET.
- **TP/SL:** 5x tương ứng TP±2% và SL∓6% giá, neo lại theo actual fill với pipeline hiện có. SHORT source này được miễn TP-only suppression; cần đủ STOP_MARKET/TAKE_PROFIT_MARKET, tick giá hợp lệ, hậu kiểm đủ cả hai chân. Durable recovery chỉ match exact opening clientID prefix `ssr_` + orderID + side + frozen plan; không quét/sửa protection vị thế cũ.
- **Push / thống kê / WHITELIST:** Push và Discord giữ rule cũ; tắt kênh hoặc quiet00–06 không tắt MARKET. Lịch sử xử lý là execution status/orderID/reason, không WinRate/PnL/AvgROE và không card thống kê mới; không cấp WHITELIST từ score/quan sát. R:R cấu trúc trên chart không phải R:R của TP10/SL30 cố định. Mẫu detector vẫn OBSERVE ONLY; route thực mới tách riêng, không gán quyền cho mọi mẫu.
- **JSON cũ:** originRows/transitionRows mới tùy chọn, thiếu proof không được entry; lịch sử V1/V2 vẫn đọc và restart đổi active cũ thành DATA_GAP như trước. API không xuất causal rows dài; ledger/audit thêm structureSetupAtEntry/SignalId/EntryVersion; record cũ không đoán lại attribution. Route seed defaultOFF, settings/exclusions/subscriptions của các route khác được giữ nguyên.

### 2026-10-12 — Giờ yên lặng Web Push, mặc định 00:00–06:00 Việt Nam

- **Deploy xác nhận:** backend nạp V11 lúc11:04:56 VN12/10/2026, PM2 btc-liquidity-web PID4171708; watchdog3955615 không restart. Public config/manager và UI đều xác nhận enabled=true00:00–06:00Asia/Ho_Chi_Minh,3thiết bị hiện có; thời điểm kiểm tra ngoài giờ yên lặng. Controls JSON trước/sau giống nhau (SHA256E8D4C9E9FF929A7C5CF1F3741B7F332892034D90BBDD4CD7E1B5C76C03951EC3), VAPID hash/subscriptionIDs không đổi, runner errornull/listPASS3 giữ nguyên. Browser đọc runtime thực trên mobile cả hai trang qua, zero writes/errors. Native notification fallback khi không có subscription cũng kiểm tra config quietHoursActive và fail-closed nếu thiếu/lỗi config; toast trong trang không bị tắt. Không gửi testPush/Discord/order hoặc sửa lệnh cũ.
- **Version/phạm vi:** `WEB_PUSH_QUIET_HOURS_V1_VN_20261012`, transport `OPPOSITE_LIQUIDITY_WEB_PUSH_V11_QUIET_HOURS_20261012`. Đây là policy vận chuyển thông báo, không gate/nhãn giao dịch. Mặc định enabled=true, start00:00/end06:00 theo yêu cầu người dùng (12h đêm, không phải12h trưa), timezone cố định `Asia/Ho_Chi_Minh` UTC+7. Áp dụng chung mọi subscription và mọi family Push: Discord-route, volume, thanh khoản, giá tay, wick/flush, cấu trúc LONG/SHORT, cảnh báo contract; không phụ thuộc tab còn mở.
- **Dữ liệu / phân loại trước entry:** không thêm dữ liệu vào detector/ratio/entry. Chỉ kiểm tra đồng hồ server quy về giờ Việt Nam ngay trước mỗi transport. Khoảng giờ nửa mở [start,end): đúng00:00 ngừng, đúng06:00 cho phép lại; start>end là qua đêm; start=end bị từ chối để tránh nhầm tắt24h. Chấp nhận HH:mm hợp lệ và boolean enabled; timezone khác bị từ chối. Có thể sửa giờ hoặc bỏ checkbox. UI dùng chung trên `/rising-volume-watch#push-quiet-hours` và `/push-signal-manager#push-quiet-hours`.
- **API/persistence:** config GET thêm quietHours/quietHoursActive/quietHoursVersion, không lộ endpoint/key riêng. POST `/api/opposite-liquidity-web-push/quiet-hours` có same-origin write guard, validate, serialized queue và atomic save trong file subscription hiện có. Save lỗi rollback rule trong RAM; UI không báo đã lưu nếu server lỗi/timeout. Đọc/làm mới không POST và không đổi route/registration; form đang sửa không bị poll30s ghi đè. Lịch lưu vẫn hiệu lực sau restart và resubscribe không reset.
- **Delivery / thống kê:** trong giờ yên lặng không gọi web-push.sendNotification, trả sent0/attempted0/failed0/skippedQUIET_HOURS; vẫn giữ signal/history và record consumed eventID trước khi kết thúc. Không xếp hàng hoặc gửi dồn sáng hôm sau; event trùng sau end/restart vẫn dedupe. Bỏ qua không tăng pushedCount/lastPushedAt Discord bridge; observedCount Discord2xx vẫn tăng, deliveredCount chỉ tăng theo thiết bị thực nhận. Các notifier ghi statusQUIET_HOURS thay vì FAILED/NO_SUBSCRIBERS; nhãn UI ghi giờ yên lặng. Không tạo cohort/WinRate/AvgROE/card trade matcher mới => không thêm WHITELIST, policy real CLOSED AvgROE>4%/defaultOFF/exact keys cũ giữ nguyên.
- **Biên giờ / TTL:** batch nhiều thiết bị kiểm tra lại giờ trước mỗi send; gửi trước giờ yên lặng rút TTL xuống tối đa số giây còn tới start (có thể0 khi<1s), tránh giữ payload offline qua đêm. Không thu hồi được thông báo đã nhận trước đó hoặc điều khiển DND của hệ điều hành. Không thay service-worker/VAPID/permission/subscription.
- **Binance/entry/size/SL/TP:** không đổi detector/entry, route execution, ratio gate, margin/leverage, TP/SL, bảo vệ/vị thế hoặc lệnh cũ. Discord và toast trong trang vẫn hoạt động; Push và Discord độc lập, quiet không chặn callback entry. Đọc/chỉnh giờ không submit lệnh, không gửi tín hiệu thử.
- **JSON cũ:** state không có quietHours hoặc field hỏng nhận mặc định00–06enabled theo yêu cầu mới; giữ nguyên subscriptions/keys/VAPID, sentEvents, zoneNotifications và các route đang bật. State có lịch hợp lệ giữ lựa chọn enabled/start/end (không reset sau restart). Dedupe ledger vẫn tên sentEvents nhưng bao gồm cả event đã bỏ qua; không relabel proof/snapshot/PnL cũ hoặc phát lại lịch sử. Client cũ bỏ qua fields mới; UI mới gặp runtime thiếu config không giả định đã áp lịch hoặc cho save.
- **Kiểm tra:** unit mốc00/06, lịch qua đêm/ban ngày/OFF, validate, defaults/legacy/restart/resubscribe, atomic-save rollback, mọifamily zero transport, TTL/batch qua midnight, suppressed-history/dedupe/no replay, Discord độc lập/telemetry; browser fixture desktop/mobile trên cả hai trang, save/disable/samehour/failed-save/reload/nooverflow, zero real writes/orders. WebPush/Discord bridge/page/short-setup regressions được kiểm tra. Native fallback quiet/missing-config fail-closed và đọc UI runtime mặc định00–06đã kiểm tra, không POST production.

### 2026-10-12 — Danh sách Volume 1m đã PASS ratio và PnL thực

- **Deploy xác nhận:** PM2 `btc-liquidity-web` nạp bản mới lúc07:41:32 VN12/10/2026, PID4095106; watchdog3955615 không restart. Public page/API200, passedSignals V1 có3 bản ghi LONG: BAT CLOSED net+0,14363876USDT/ROE+7,181938%, CKB và FLOW BLOCKED EXISTING_POSITION/nullPnL. RunnerV2/executionON/LONGON/SHORTOFF/errornull giữ nguyên. Controls JSON trước/sau giống nhau, SHA25634559FDDC9738608AE4AC4E9562A01FB6F037DD56118DFD64E4E92F74C20EE8A. Test browser cả fixture và đọc runtime thực trên mobile qua, zero writes/errors; không gửi testorder/Discord/Push hoặc sửa protection lệnh cũ.
- **Version/phạm vi:** `RISING_VOLUME_PASSED_LEDGER_REAL_PNL_V1_20261012`, projection chỉ đọc tại `GET /api/rising-volume` (`passedSignals`) và panel riêng trên `/rising-volume-watch#passed-signals`. Không phải rule giao dịch mới. Toàn bộ ledger runner 14 ngày, không bị giới hạn nhật ký quản lý 100 lần; trả tối đa 2.000 dòng, phân trang UI 10 dòng, lọc coin/LONG/SHORT/trạng thái Binance, link exact-ID `?passed=...`. Các bộ lọc live/history/cohort cũ không tác động list PASS.
- **Dữ liệu trước entry / phân loại:** chỉ nhận interval1m với exact signalID, closedAt/observedAt hợp lệ và proof `AT_ENTRY` account5m đã lưu tại lần xử lý gốc. Rebuild đúng gate hiện tại từ rows<=closedAt: nền30m biên<=5%, đổi đúng hướng>=10% trong<=30m. Không dùng VIEW_ONLY, ratio hôm nay hoặc backfill để cấp PASS lịch sử. Runner chỉ ghi attempt sau khi đã kiểm tra volume1m liền mạch; bị chặn sớm có thể không giữ full volume snapshot, nên chỉ ghi evidence eligibility tại runner, không tạo volume chart giả. Dòng có fill phải kiểm tra lại snapshot volume gốc và proof ratio gốc của audit. Chart ratio từng dòng dùng proof đã lưu.
- **Kết quả / PnL:** PASS không đồng nghĩa vào lệnh. Hiện riêng BLOCKED, AWAITING_AUDIT, UNKNOWN, OPEN, PARTIALLY_CLOSED, CLOSED và lý do attempt. Audit phải khớp source Volume, version V2 LONG2/SHORT1, symbol/hướng/signalID và orderID hoặc clientOrderID chính xác, FILLED, không DCA, filledAt sau proof; không ghép theo tên coin hoặc vay PnL của vị thế tay. Dedup record audit tích lũy theo opening orderID. Chỉ khi mọi record khớp CLOSED, thời gian hợp lệ và netPnL/margin đủ mới hiện PnL ròng (gồm phí/funding do audit phân bổ) và ROE=netPnL/tổng margin audit×100; thiếu/open/blocked/unknown là null/—, không 0 giả hoặc uPnL. Lệnh 3USDT V1 cũ không được gán ratio mới.
- **Thống kê / WHITELIST:** đây là danh sách từng sự kiện và PnL từng lệnh, không cohort/card thống kê/nhãn trade matcher mới, không tổng WinRate hoặc AvgROE mới => không thêm checkbox WHITELIST. Chỉ đếm số bản ghi PASS được lưu, không đếm thành số lệnh thắng/thua. Cohort/closedStats/key matcher/checkbox cũ giữ nguyên, mặc định OFF và chỉ hiện với real CLOSED AvgROE>4% như trước.
- **Binance/entry/size/SL/TP:** không đổi detector, gate, runner, routes, guards, margin LONG2/SHORT1, leverage5x, TP+10%/SL−30%ROE hoặc lệnh/vị thế cũ. Không thêm account/order IO, submit, repair/retry hay gửi Discord/Push do xem list; chỉ đọc ledger và audit đã có.
- **JSON cũ:** không sửa/migrate file history, attempts, fills hoặc proof. Thiếu proof bị loại khỏi list PASS, thiếu audit hoặc net/margin/closeTime hiện chưa đủ PnL; frontend không có passedSignals/version đúng báo runtime chưa cung cấp chứ không tự suy PASS. Audit V1 vẫn thuộc thống kê legacy cũ, không đưa vào list V2 bằng ratio hiện tại.
- **Kiểm tra:** unit PASS frozen LONG/SHORT, attribution exactID/order/source/version/side, không vay manual/legacy/DCA, dedup, WIN/LOSS/BREAKEVEN, OPEN/SUBMITTED/BLOCKED/UNKNOWN/null, immutable/14ngày/future/JSON thiếu. Browser desktop/mobile lọc PASS độc lập, PnL/ROE và hướng, deep-link mở đúng proof, không overflow, existing cohort/AvgROE>4% exact whitelist/defaultOFF không đổi; mock API zero writes. Gate/runner/diagnostics cũ được kiểm tra lại; đọc runtime thực xác nhận BAT PnL/ratio chart và mobile layout.

### 2026-10-12 — Chart ratio top trader kiểu Binance cho Volume
- **Deploy xác nhận:** backend nạp V2 lúc07:30:52 VN12/10/2026, PM2 btc-liquidity-web PID4044181, watchdog không restart. Public page/API200 và ratioDiagnosticsVersionV2, runner vẫn V2 LONG2/SHORT1, LONGON/SHORTOFF/executionON, runnerErrornull. Controls JSON trước/sau giống nhau (SHA256 F4EAF0F53FB92FB4E852228258F33F10C3F051FD12D5D70B4FCE18789CD31F13). Test gate/runner/diagnostics và browser desktop/mobile qua, zero state/order writes; chartmobile có cuộn riêng, khi mở ưu tiên điểm cuối, không kéo rộng toàn trang. Không gửi testorder/Discord/Push hoặc sửa lệnh cũ trong lượt.
- **Version:** `RISING_VOLUME_RATIO_EXPLANATION_V2_BINANCE_CHART_20261012`, chỉ giải thích/view trên `/rising-volume-watch`; gate thật `RISING_VOLUME_TOP_ACCOUNT_FLAT_BREAK_V1_20261011` và runner V2 LONG2/SHORT1 giữ nguyên.
- **Dữ liệu trước entry:** ưu tiên proof ratio tài khoản top trader5m đã lưu đúng signalID/coin/hướng/asOf tại lần xử lý gốc. Không thay proof hoặc gọi account/order IO. Live chưa có proof dùng public-cache20điểm, tối đa2 request đồng thời/4lượt10s, TTL30s như trước; ghi VIEW_ONLY, không là chứng cứ pre-entry. Chỉ vẽ timestamp<=asOf.
- **Hiển thị/phân loại:** cột xanh Long%=ratio/(1+ratio)×100 và đỏ Short%=1/(1+ratio)×100, suy từ ratio đã làm tròn nên có thể lệch nhẹ % trên Binance; không gọi đây là tỷ lệ vị thế/OI. Đường đen ratio dùng trục phải riêng; % dùng trục trái0–100. Vùng vàng là đúng nền30m rule chọn, median gạch vàng; ngưỡng gạch xanh median×0,9 LONG hoặc×1,1 SHORT. PASS cần biên nền<=5%, đổi đúng hướng>=10% trong<=30m và ra ngoài nền; FAIL dùng cửa sổ tham chiếu, không đổi gate. Rê chuột/focus/click/tap xem thời gian/ratio/%Long/%Short/mức đổi, chạm lại/Enter tắt; popup không làm dịch bố cục. Dữ liệu gap tách đường, không nối giả; thiếu base không vẽ median/threshold giả.
- **Thiếu/cũ dữ liệu:** retained valid rows được vẽ cả UNAVAILABLE (history thiếu điểm/gap/stale/expired cache), nhưng pass=null, giữ lý do thiếu/cũ và không tự cấp PASS/FAIL. Duplicate/sai số/future/nhiều hơn20điểm không vẽ. Không backfill history thiếu proof bằng dữ liệu hôm nay. Mẫu không có rows vẫn báo thiếu, không tạo chart giả.
- **Thống kê/WHITELIST:** đây là chart từng mẫu quan sát, không nhãn/card CLOSED/WinRate/AvgROE mới, không thêm checkbox. Cohort/closedStats/matcher whitelist hiện tại và policy real CLOSED AvgROE>4%/defaultOFF giữ nguyên.
- **Binance/entry/size/SL/TP:** không đổi vào lệnh, size, TP/SL, route/guards hoặc vị thế cũ. Đọc hoặc tương tác chart không submit/write; chart PASS không khẳng định MARKET đã xảy ra. Không gửi thêm Discord/Push vì thao tác chart.
- **JSON cũ:** renderer nhận diagnosticV1 vàV2; không rewrite history/attempt/proof hoặc ledger. V1 có rows vẽ chart mới, thiếu base vẽ cột/đường không nền; thiếu dữ liệu không gán nhãn. VERSIONV2 chỉ projection API ephemeral. Cache expired giữ rows/fetchedAt để giải thích nhưng stateUNAVAILABLE/passnull thay vì coi dữ liệu cũ là hợp lệ.
- **Kiểm tra:** parity unchanged gate LONG/SHORT, %cột/blackcurve/base/±10%, future/duplicate/gap/partial/expiredcache, immutable proof/history/cohort/whitelist; browser desktop/mobile hover/tap/keyboard/popup/lọc/redraw/deep-link/XSS/no overflow, chỉ mock API và zero writes.

### 2026-10-11 — LONG tại hỗ trợ + Discord cho cấu trúc giá LONG/SHORT

- **Deploy/kiểm tra thực tế:** backend V2 nạp lúc19:39:21 VN11/10/2026, PM2 btc-liquidity-web PID3896844, không restart watchdog. Public page/API/model200, cache model no-store, error=null, Discord configured/enabled=true. Webhook được GET kiểm tra200 và POST một tin kiểm tra kết nối ghi rõ không phải tín hiệu giao dịch204; không gửi tín hiệu giả và không order test. Push enabled=true; pushEarly=true là lựa chọn có sẵn, được giữ nguyên (mặc định khi chưa có settings vẫnfalse), do đó báo sớm cũng gửi Discord khi có sự kiện mới. Universe525, cache đang warmup sau restart (12 coin đủ81nến ở lần kiểm tra đầu), không khẳng định525 đã đủ dữ liệu. JSON Binance controls trước/sau giống nhau, SHA256 6CF64D1EB906C990EED6AD02BF9A7647D32E115E0716436862B8771A3F73FD15. Detector/browser/push service/service-worker/nav54/toast54 test qua; thêm kiểm tra diskfail không gửi và POSTING hai kênh không replay sau restart.

- **Version/phạm vi:** `STRUCTURE_SETUP_WATCH_V2_LONG_SHORT_DISCORD_20261011`; giữ route/API `/short-setup-watch`. `OBSERVE ONLY`, không gate giao dịch thật. Hai mẫu SHORT V1 giữ điều kiện cũ; thêm LONG `FAILED_LOW`, `BREAK_HOLD`, `SUPPORT_WATCH`. LONG đỏ / SHORT xanh, lọc hướng và mẫu, trạng thái/mục tiêu đúng hướng. Giữ push family `BINANCE_SHORT_SETUP_WATCH` để tương thích service-worker/subscription hiện có, payload side phân biệt LONG/SHORT.
- **Dữ liệu trước tín hiệu:** ít nhất81 nến Binance1m đã đóng liên tục, cuối <=75s; cache90 hiện có, không vòng REST mới. Swing2 nến mỗi phía đã xác nhận trước mẫu, cluster60 nến và mức vùng/vô hiệu/mục tiêu cố định. SHORT vẫn cần sóng bơm40 nến (đỉnh sau đáy, tăng >=max(2%;3ATR20/giá), volume >=1,3x nền20 trước sóng, close nửa trên). LONG chấp nhận cùng sóng bơm hoặc sóng giảm đối xứng (đỉnh trước đáy, giảm >=max(2%;3ATR20/giá), volume như trên, close nửa dưới); hồi sau giảm có rủi ro ngược xu hướng. Không AI/CoinGlass/OI/ratio/thanh lý để cấp nhãn.
- **Phân loại LONG:** FAILED_LOW quét dưới support, nến xanh đóng trên mép trên, râu dưới>=35%/râu trên<40%, volume>=1,3x nền20 trước mẫu, mua chủ động>=55%; chờ nến sau xanh đóng vượt high nến lấy lại vùng. Vô hiệu low nến quét−0,2ATR. BREAK_HOLD nến xanh đóng trên resistance ít nhất0,1ATR, râu trên<40%, volume/mua như trên; chờ low chạm mép trên vùng, rồi nến xanh đóng trên vùng và high nến trước, mua>=55%. Vô hiệu zone.low−0,3ATR. Chạm vô hiệu intrabar hủy trước kích hoạt. Chờ15m, sau READY10m; tăng>0,5ATR khỏi trigger hoặc high chạm resistance mục tiêu =>CHASE. Gần hỗ trợ mà chưa có mẫu chỉ WATCH, không gửi tin.
- **Xếp hạng/thống kê:** R:R LONG=(resistance gần nhất−giá tham khảo)/(giá tham khảo−vô hiệu); SHORT dùng support gần nhất. Thiếu mục tiêu=>null, không chế vùng thanh lý/target%. READY + R:R>=1,5 ưu tiên đầu, rồi trạng thái/điểm/thời gian; mẫu cũ/CHASE/hủy cuối. Điểm LONG FAILED_LOW25/BREAK_HOLD35, >=2swing10, mua>=60%10, VOL>=2x10, trên EMA9 trước mẫu5, RSI trước mẫu tăng từ<=355, R:R>=1,515, kích hoạt10, cap100; SHORT giữ điểm cũ. Điểm là heuristic chưa backtest lợi thế, không xác suất. Không card thống kê CLOSED/WinRate/PnL/AvgROE mới => không checkbox WHITELIST mới; policy card thống kê hiện có real CLOSED AvgROE>4%, exact matcher/defaultOFF không đổi.
- **Push/Discord:** Discord READY + R:R>=1,5 mặc địnhON khi cấu hình `SHORT_SETUP_DISCORD_WEBHOOK_URL` server-only; webhook không lộ API/HTML/docs/logs. Push và Discord bật/tắt độc lập. Checkbox báo sớm mặc địnhOFF, nếu bật gửi thêm WAIT_BREAK của FAILED_HIGH/FAILED_LOW và ghi rõ CHƯA KÍCH HOẠT; WAIT_RETEST/WATCH/CHASE/hủy không tự gửi. Giữ lựa chọn Push cũ khi nâng cấp. Tin có hướng, mẫu, vùng/giá/trigger/vô hiệu/target/R:R/volume, link exact-ID và cảnh báo không MARKET. Ghi cả hai intent POSTING xuống file trước IO, gửi kênh độc lập, timeoutDiscord8s; kênh lỗi không chặn kênh kia. Chỉ sự kiện mới sau start, <=75s, Push expires/TTL120s; chống trùng, không replay khi bật lại/restart, không retry kết quả chưa rõ.
- **Binance/entry/size/SL/TP:** không executor/order/account IO; không đổi route Volume/EARLY, margin/leverage/entry/SL/TP/protection hoặc lệnh cũ. Trigger/target/vô hiệu chỉ tham khảo, không đặt TP/SL thật. Không yêu cầu thêm WHITELIST cho danh sách quan sát.
- **JSON cũ:** nhận root/recordV1 hoặcV2 trong `data/short-setup-watch.json`, giữ version/nội dung bản ghiV1, không relabel/backfill/gửi Discord lịch sử. Root ghiV2, thêm discordEnabled mặc địnhtrue nếuV1 thiếu; POSTclientcũ không có field này giữ giá trị đang chạy. Timeline mới có delivery và discordDelivery; mẫu cũ thiếu discordDelivery hiện chưa ghi nhận, không coi là SENT. POSTING của cả hai kênh khi restart=>UNKNOWN_AFTER_RESTART; activecũ=>DATA_GAP. File/schema lạ giữ nguyên và dừng cảnh báo;14ngày/tối đa2000 mẫu nhưV1.
- **Kiểm tra:** fixture LONG quét đáy/break-hold, SHORT không đổi, nến tương lai/gap/chase/vô hiệu/retest sai lực mua; persistence-before-send, dedupe, legacy migration không replay, PushOFF vẫnDiscord, lỗiDiscord vẫnPush; sender mock204/429/timeout/URLsanitization/no mentions. Browser desktop/mobile390 kiểm tra nhãn LONG/SHORT, mục tiêu, lọc hướng/mẫu, checkboxDiscord, deep-link mẫu cũ/XSS/no overflow/no Binance writes; test push/service-worker/nav/toast.

### 2026-10-11 — Trang cơ hội SHORT từ cấu trúc giá, xếp ưu tiên và Web Push

- **Deploy đã xác nhận:** backend nạp bản cuối lúc 18:46:30 VN 11/10/2026, PID3842219; public page/API HTTP200, health OK, detector error=null. Universe525 coin; minute warmup tiếp tục nạp sau restart, số ready được báo riêng. Push READY mặc định ON / push sớm OFF. So sánh toàn bộ JSON controls trước/sau deployment giống nhau (91 route); không có thao tác order/SL/TP thủ công trong lượt. Global toast/PWA dùng `OPPOSITE_LIQUIDITY_SITEWIDE_TOAST_V8_SHORT_SETUP_PUSH_20261011` và cùng URL module để client trang mới không chạy hai lần; giữ registrations và VAPID. WATCH cũng có snapshot biểu đồ vùng giá. Điểm RSI dùng tổng tăng/giảm 14 nhịp trước mẫu (không cam kết trùng RSI Wilder trên sàn); điểm RSI từ nền >=65 là +5, R:R>=1,5 là +15. Test detector/browser/push service/service-worker/navigation/toast đều qua.

- **Version/phạm vi:** `SHORT_SETUP_WATCH_V1_PRICE_STRUCTURE_20261011`, trang `/short-setup-watch`, API `/api/short-setup-watch`, push type `BINANCE_SHORT_SETUP_WATCH`. Chỉ quan sát/cảnh báo; không executor Binance hoặc quyền vào lệnh mới. Menu dùng `LOCAL_AI_NAVIGATION_ALL_MENUS_V11_SHORT_SETUP_20261011`; push service V10 giữ subscriptions/VAPID/sentEvents cũ.
- **Dữ liệu trước tín hiệu:** cache Binance toàn bộ universe Volume Futures, 90 nến 1m, ít nhất 81 nến đã đóng liên tục và nến cuối <=75 giây. Tái dùng minute warmup/socket hiện có; không thêm vòng REST cho 525 coin. Swing cần 2 nến đóng mỗi phía, chỉ nhận swing đã xác nhận trước tín hiệu; gom vùng trong 60 nến trước theo tolerance min(0,6% giá; max(0,12% giá; 0,4 ATR20)). Giữ cố định zone, mức vô hiệu và hỗ trợ mục tiêu của setup; chart chỉ nối nến đã đóng. Không dùng CoinGlass, AI, BTC/OI/ratio hay orderbook để cấp nhãn; không gọi vùng cấu trúc là thanh lý thật.
- **Điều kiện:** 40 nến trước tín hiệu có đỉnh sau đáy, tăng >=max(2%; 3 ATR20/giá), volume trung bình >=1,3x nền20 trước sóng, close trước tín hiệu giữ nửa trên sóng. FAILED_HIGH: high vượt mép trên resistance, nến đỏ đóng dưới mép dưới, râu trên >=35% / râu dưới <40%, volume >=1,3x nền20 và bán chủ động >=55%; chờ nến sau đỏ đóng dưới đáy nến từ chối. Vô hiệu high nến từ chối +0,2 ATR. BREAK_RETEST: nến đỏ đóng dưới support ít nhất 0,1 ATR, volume/bán/râu dưới như trên; chờ high chạm zone.low rồi nến đỏ đóng dưới zone.low và đáy nến trước, bán >=55%. Vô hiệu zone.high +0,3 ATR. Chạm vô hiệu intrabar ưu tiên hủy trước khi xét kích hoạt do không biết thứ tự OHLC. Chờ 15 phút; sau kích hoạt theo dõi 10 phút. Giá giảm >0,5 ATR khỏi trigger hoặc chạm target => CHASE; mất/gap/cũ nến hoặc restart => DATA_GAP, không nối quyết định qua đoạn thiếu.
- **Xếp hạng/thống kê:** READY có R:R >=1,5 trước; sau đó READY thiếu R:R, WAIT_BREAK, WAIT_RETEST, WATCH, các trạng thái đã đi xa/hủy cuối; trong nhóm theo điểm rồi thời gian. Điểm thử nghiệm /100: FAILED_HIGH25/BREAK_RETEST35, >=2 swing10, bán>=60%10, volume>=2x10, dưới EMA9 trước mẫu5, RSI trước mẫu giảm từ>=655, R:R>=1,515, đã kích hoạt10 (capped100). R:R từ giá close/trigger tham khảo đến support xác nhận gần nhất và mức vô hiệu; target thiếu thì null, không chế mục tiêu %. Không tính phí/trượt giá/funding, không là xác suất thắng. Live/chart/timeline là danh sách quan sát, không nhãn/card thống kê CLOSED/WinRate/PnL/AvgROE mới; không thêm WHITELIST. Existing checkbox/matcher/default OFF/real CLOSED AvgROE>4% giữ nguyên.
- **Push:** mặc định loại tin READY + R:R>=1,5 ON, cảnh báo sớm WAIT_BREAK OFF; có hai checkbox lưu server-side. Tái dùng đăng ký thiết bị/PWA; nạp trang không tự xin permission. Ghi intent POSTING xuống file trước send, ID theo setup/state/nến; chỉ sự kiện mới sau backend start và <=75 giây, expiresAt/TTL <=120 giây. Không replay khi bật lại/restart, không retry kết quả chưa rõ. Bấm thông báo mở exact setup ID, vẫn tra được lịch sử/selected khi không còn live. Cấu hình kiểu tin áp dụng mọi thiết bị đã đăng ký, không bật Discord. WAIT_RETEST/WATCH/CHASE/hủy không gửi mặc định.
- **Binance/entry/size/SL/TP:** module không gọi account/order IO, không đặt hoặc đóng lệnh, không sửa entry/margin/leverage/SL/TP hay protection của lệnh hiện có. Trigger/target/invalidation trên trang là mức tham khảo của mẫu quan sát, không ghi thành lệnh SL/TP thật. Các route Volume/EARLY và switch Binance giữ nguyên.
- **JSON cũ:** file mới `data/short-setup-watch.json` chứa version/settings/history/timeline, giữ 14 ngày/tối đa2000 mẫu; không đọc/migrate/relabel ledger cũ. File hỏng/version không hợp lệ dừng push và giữ file, không reset phá lịch sử. Setup đang theo dõi khi restart giữ lịch sử và chuyển DATA_GAP. API mới có live/history100/selected exact-ID; không backfill mẫu cũ bằng ratio/giá mới.
- **Kiểm tra:** fixtures causal cho cả hai detector, nến tương lai/đang mở, thiếu/gap/cũ, cây rút râu hồi, vô hiệu/đuổi/hết hạn, xếp hạng, durable intent/dedupe/restart/settings; Web Push mock kiểm tra allowlist/TTL/dedupe/expiry và service-worker click exact-ID. Browser desktop/iPhone390 kiểm tra graph/lọc/xếp đầu/deep link/XSS/settings/lỗi API/no overflow/no Binance writes; menu toàn bộ trang.

### 2026-10-11 15:39:40 VN — Restart backend, xác nhận rule đã được nạp

- Deployment: restart riêng PM2 `btc-liquidity-web`, PID mới `3780205`; không update env, không restart watchdog. Health và API public đã xác nhận runtime mới. Mục này cập nhật trạng thái triển khai cho các mục “chưa deploy/source pending” bên dưới.
- Version đã nạp: `RISING_VOLUME_1M_SUSTAINED_RATIO_LONG2_SHORT1_5X_TP10_SL30_V2_20261011`, `COIN_PUMP_WICK_EARLY_RATIO_LONG_3USDT_5X_TP10_SL30_V1_20261011`, `RISING_VOLUME_RATIO_EXPLANATION_V1_20261011`.
- Dữ liệu trước entry/phân loại: dùng ratio top trader theo tài khoản 5m cùng coin, causal theo signal closedAt; nền 30 phút biên <=5%, rồi giảm >=10% cho LONG hoặc tăng >=10% cho SHORT trong tối đa 30 phút, kèm gate/guards đã mô tả ở các mục nguồn. VIEW_ONLY chỉ giải thích lúc xem, không thay proof AT_ENTRY. Public API đã trả ratio cùng lý do FAIL thực tế, không còn thiếu field giải thích.
- Binance: Volume LONG giữ ON, margin mới 2 USDT x5 và phải pass ratio; SHORT margin 1 USDT x5 vẫn OFF. Route EARLY LONG 3 USDT x5 được seed OFF, không tự bật. TP +10% ROE / SL -30% ROE giữ theo rule. Đối chiếu đủ 90 route cũ: không đổi enabled/enabledAt; chỉ hai route Volume được normalize margin/title. Master và cấu hình loại trừ/bypass bảo vệ giữ nguyên.
- Thống kê/JSON cũ: không thêm nhãn/card/WHITELIST; không backfill ratio hoặc replay tín hiệu cũ. Lịch sử/proof cũ giữ chính sách tương thích đã ghi; không quy VIEW_ONLY thành thống kê entry/CLOSED. Không thực hiện lệnh thử, đóng vị thế hay sửa SL/TP thủ công trong lượt restart; không yêu cầu quét bổ sung bảo vệ lệnh cũ.

### 2026-10-11 — Ratio explanation trên Volume không cấp quyền vào lệnh

`RISING_VOLUME_RATIO_EXPLANATION_V1_20261011` chỉ read-only UI/API, chưa deploy/restart/đổi controls live. Ratio top trader **accounts5m** cùng coin ưu tiên proof `AT_ENTRY` exact-ID của lần xử lý đầu đợt, không phải OI/position ratio. Rebuild kết quả nguyên gate flat30 phút/7 điểm/biên<=5% median rồi giảm>=10% cho LONG hoặc tăng>=10% cho SHORT trong<=30 phút. FAIL có nền tham chiếu/lý do; thiếu/cũ/gap/API error/pending/invalid không được giả PASS. Live chưa có proof chỉ hiển thị public **VIEW_ONLY** với timestamp<=closedAt và nhãn nạp lúc xem, không đủ làm proof pre-entry. History không lưu ratio gốc không backfill từ hiện tại. JSON detector/ledger/audit/entry proofs giữ; response chỉ thêm optional diagnostic, old API thiếu field render cảnh báo tương thích.

`RATIO PASS` không có nghĩa đã MARKET. Khung5m/15m/non-sustained vẫn OBSERVE ONLY; còn cần exact route/master/execution/activation/start/age/drift/position/protection guards. Không đổi gate/executor hiện có, margin2/1 Volume, margin3 EARLY, leverage5, TP10/SL30/cap hoặc lệnh cũ; đọc trang không account IO/submit. Chỉ warm public cache RAM cho coin trên trang, TTL30s/max2 concurrent/max4reads10s/cache256/priority8/dropOnCongestion; không nạp history, ghi file, retry entry hoặc mở route.

Đồ thị/tỷ trọng tài khoản/biên/đổi% là giải thích, không nhãn/card thống kê mới; không cấp PnL/CLOSED/AvgROE/WHITELIST. Existing UI/runtime key vẫn default OFF, chỉ real CLOSED AvgROE>4% mới hiện; không dùng ratio để vượt policy. Tests mock gate parity/causal/frozen vs view-only/legacy/cache/limits và desktop/mobile 5m PASS không vào MARKET/graph/XSS/whitelist strict4%/0 writes; không Binance mutation hoặc Discord POST thật.

### 2026-10-11 — Route EARLY wick + ratio giảm, LONG3 (source pending deploy)

Version `COIN_PUMP_WICK_EARLY_RATIO_LONG_3USDT_5X_TP10_SL30_V1_20261011`, controls `AUTO_ENTRY_CONTROLS_V39_EARLY_WICK_RATIO_LONG3_20261011`, policy `EARLY_WICK_RATIO_LONG3_AND_VOLUME_RATIO_V54_20261011`. Exact route key:

```json
["coin-pump-wick-early-ratio","closed-1m-early-wick","COIN_PUMP_WICK_EARLY_1M","LONG"]
```

Route mới seed **OFF**, title “Rút râu sớm + ratio giảm mạnh · LONG”; cố định margin3, leverage5, TP+10 / SL-30 ROE, max50, không cho sửa riêng TP/SL/size hoặc nâng size đạt minnotional. **Chưa deploy/restart/đổi config live trong lượt này**. Master, execution, exact route và detector phải ON mới có quyền; WHITELIST không bật route này. Không tự bật SHORT đã OFF hay các route cũ.

Dữ liệu pre-entry là detector EARLY V1 closed1m của chính coin (baseline20/wave30–60 + cây râu, raw `WICK_DETECTED`, không xác nhận hồi) và top trader **account ratio 5m cùng symbol**: 7 điểm phủ30 phút flat biên <=5% median, rồi giảm >=10% trong <=30 phút và dưới đáy nền. Rows <= signalclose, latest ratio <5 phút; proof `AT_ENTRY` revalidate <=20s sau fetch, không dùng tương lai. Không bắt buộc Volume1m sustained, BTC giảm, OI tăng, reclaim hay nến xác nhận. Râu đơn lẻ không cấp LONG. Miss/stale/API fail vẫn cảnh báo, không account IO/MARKET; Discord/Push không đợi account và không xác nhận đã fill.

New eligible MARKET LONG **3 USDT margin x5 / 15 USDT notional**, actual fill neo TP +2% giá và SL -6% giá. TP CONTRACT_PRICE, SL MARK_PRICE; cả hai open protection legs phải được xác nhận. Guards activation/start/70s/drift0.5%/cap50/no existing position or entry/protection-excluded/FULL BYPASS/native authorization giữ. Shared reservation75s giữa Volume và EARLY ngăn duplicate khi account REST lag; Volume LONG2/SHORT1 và confirmed recovery cũ không đổi gate/size. Không quét hoặc sửa entry/size/SL/TP các lệnh cũ.

Ledger riêng `data/coin-pump-wick-early-binance.json` V1 reserve exact-ID trước IO, prefix `cwer_`; corrupt/unknown không xóa/retry mù, history CFX/ERA không replay. Audit optional `coinPumpWickEarlyAtEntry` + ratioProof + ID/version, không migration/backfill proof hậu nghiệm cho JSON cũ. Chỉ exact verified opening order thuộc ledger mới được khôi phục protection-only, không MARKET replay. UI old API thiếu `binance` báo chưa xác minh executor/deploy; schema history/delivery, webhook, push keys cũ giữ.

Card/key có sẵn `coin-pump-wick-early:EARLY_WICK` nối real CLOSED của đúng source/version/causal proof, default OFF/chỉ AvgROE >4% hiện checkbox; OPEN/DCA/legacy thiếu proof loại. Gộp closeGroupId (fallback order/client), net/margin trong nhóm rồi trung bình ROE nhóm; counts quan sát không là PnL. Không thêm label/card mới và không dùng whitelist để vượt gate LONG3. Tests builder/native policy/controls/actual mocked placement + both TP/SL/locks/audit/realclosed/4%boundary/legacy/UI desktop-mobile đều giả lập; chưa có backtest PnL riêng của EARLY+ratio, fixture ERA không chứng minh lợi thế.

### 2026-10-11 — Gate Volume1m + ratio accounts; LONG2/SHORT1 (source pending deploy)

Version gate `RISING_VOLUME_TOP_ACCOUNT_FLAT_BREAK_V1_20261011`, executorV2 `RISING_VOLUME_1M_SUSTAINED_RATIO_LONG2_SHORT1_5X_TP10_SL30_V2_20261011`, controlsV38/policyV53. **Chưa restart/deploy hoặc thay switches live lượt này**; process cũ không tự đọc module mới. Định nghĩa top trader **accounts5m**, flat7điểm/30m/biên≤5%median ngay trước break≤30m; VolumeLONG cần ratio giảm≥10% so nền, VolumeSHORT cần ratio tăng≥10%. Rows trước signalclose/fresh<5m/continuous, proofboundAT_ENTRY/fetchedbeforeentry≤20s; revalidate purebuilder/policy nativecapability. Miss/missing/stale/API error không account IO/MARKET, vẫn Discord. Không dùng vị thế/global/OI/EMA/BTC để thay gate này.

NEW eligible MARKET marginLONG2/SHORT1×5, TP+10/SL−30ROE fillanchor contractTP/markSL. Exact source/stream/labels và keyUI matcher cũ giữ; guards/master/execution/route/enabledAt/start/70s/drift0.5%/cap50/bypass/existingpositionorder/minnotional/dedupe/unknown giữ. Không nâng size lên minimum, không tự bật lại SHORT đang OFF; không hồi những ratio đổi muộn sau đầu đợt hoặc replay lịch sử. Không sửa size/entry/TP/SL và không quét các lệnh cũ.

Ledger entry schemaV1 giữ attempts cũ. Old plan3USDT/V1 chỉ khôi phục protection-only cho exact verified openingorder, không authorized new MARKET. Optional ratioProofV2 đóng băng trong audit, không backfill ratio từ symbol vàoV1. RealCLOSED detector stats giữV1/V2 (không riêng ratio); thiếuV2proof không cấp stats. Không thêm label/card/WHITELIST, defaultOFF/chỉ realCLOSED AvgROE>4% giữ, paper không cấp quyền.

Backtest `RISING_VOLUME_TOP_ACCOUNT_FLAT_BREAK_RESEARCH_V1_20261011_OBSERVE_ONLY`: 370originals/269LONG/101SHORT/217coin, cutoff14:19:09VN; preset chỉ6LONG/0SHORT, lag5m5LONG; 3 đủ6h TP2SL1/AvgnetROE−4.491%, chưa chứng minh lợi thế; không lấy winner từ27grid. Nextfull1mopen sauobserved/fee0.05%2legs/TPcontractSLmark/TIMEOUTpaper, không thực thi/time-stop; history3000 + olderfillselection/censoring. Xem `docs/RISING_VOLUME_RATIO_PHASE_BACKTEST_20261011.md`/artifactresearch riêng không runtime đọc. Unit/mock gate/nativepolicy/controls/legacyprotection/stats/Discord/detector/WHITELIST PASS; desktop/mobile UI0writes/0errors, syntaxserverPASS. Không realPOST/exchange mutation hoặc đổi config.



### 2026-10-10 — Nạp/bù closed1m độc lập không mở route Binance mới

`RISING_VOLUME_1M_WARMUP_V2_INDEPENDENT_20261010`: publiccache lane1m90bars/>=81closed/fresh75s/continuous, không đợi core5m15m; max6/10s/retry30s/fair4+priority2 từ causal24h, sharedban/congestion/priority8/dropOnCongestion giữ. Không sửa detector/classification/gate/side/entry criteria/size/leverage/SL/TP/max/FULLBYPASS hoặc lệnhcũ, không signed/order, không bật exact route hay WHITELIST. Cache mới có thể làm tín hiệu mới đủ dữ liệu cho executor đãON; không tự thêm quyền. Telemetry không CLOSED/PnL/AvgROE; không label/card/matcher mới, defaultOFF và realCLOSEDAvgROE>4% giữ. JSON lịch sử/controls/entry proofs không migration, optionalminuteWarmup và GET-onlydiagnostic tương thích cũ; before-start/oldevent không replay, EMA SqueezeDiscordOFF giữ. Tests mock/publiccache only, không POST hay order thật.

### 2026-10-10 — Discord EMA Squeeze OFF không phải Binance OFF

`EMA_SQUEEZE_DISCORD_MUTE_V1_20261010` chỉ tắt sender Discord EMA Squeeze LONG/SHORT bằng env false; scanner, dữ liệu causal/classification, paper/real CLOSED stats, exact route Binance/entry/size/leverage/SL/TP/protection và lệnh cũ giữ nguyên. Cảnh báo wick EARLY/CONFIRMED, Discord/Push khác giữ. Không thêm card/matcher/WHITELIST; default OFF/CLOSED AvgROE >4% không đổi. JSON cũ không sửa/migration, thiếu env key giữ ON legacy; không replay tín hiệu mute. Test mock sender giữ cả hai scan tiếp tục paper/Binance, không POST/submit thật.

### 2026-10-10 — EARLY wick ≠ CONFIRMED recovery; chỉ thông báo, không có route MARKET mới

`COIN_PUMP_WICK_EARLY_V1_20261010` / Discord deliveryV1 / whitelistV29 / WebPushV9. EARLY quan sát causal coinclosed1m: baseline20/wave30–60 đếnđỉnh trước xả (gain>=3%+ATR/volume>=1.5×), cho pullback20%; deep high-low>=2%+ATR/volume tăng/sweep support/râu>=40%/hồi đáy>=0.5%. Không cần reclaim, vị tríđóng60%, BTC/taker hoặc nến sau. `WICK_DETECTED` cam MỚI chỉ ghi râu hiện hữu, KHÔNG xác nhận hồi, KHÔNG gọi LONG/SHORT entry. V2 cũ IMMEDIATE/MULTI_BAR classification/pump10m không đổi; Discord cả2loại có nhãn tách, channel intents độc lập/durable age75s/TTL120/no replay/unknownno blindretry, webhook chỉ .env. JSON EARLY file/API riêng, V2 giữschema thêm optional channel metadata, không nâng nhãn legacy.

Exact checkbox/matcher `coin-pump-wick-early:EARLY_WICK`, defaultOFF, realCLOSED AvgROE>4% mới hiện; chưa có PnL vẫn ẩn. Optional entry proof `coinPumpWickEarlyAtEntry` V1/sourceAT_ENTRY/statusWICK_DETECTED/patternEARLY_WICK/detectedAt causal <=entry, tuổi120s; không tạo/backfill entry snapshot hoặc auto bật whitelist. Đếm EARLY14d/max10000 riêng, không WinRate/AvgROE. Không thay Binance/entry/size/max/SL/TP/protection/FULL BYPASS, không chạm lệnh cũ; VolumeSHORTOFF giữ. Shared seed1m90 córate/congestion/priority8 guards/max6, không thay account/protection budgets. ERA15:55 fixture dùng regressionkhôngphátlại; unit causality/exactkeys/defaultOFF/channel isolation/legacy và UI mobile-desktop cùng Binance regression đều dùng mock submit/delivery.

### 2026-10-09 — Coin pump wick recovery V2: chỉ cảnh báo, không tự entry

`COIN_PUMP_WICK_RECOVERY_V2_20261009` thay detector BTC-down của card recovery bằng own-coin pump/deep-flush/reclaim closed1m, baseline20/wave10 causal, support3 trước xả; IMMEDIATE cho nến đỏ rút râu hoặc MULTI_BAR hồi1–3 nến. Không BTC/ratio/OI prerequisite, không dùng dữ liệu sau entry hoặc cap rebound1.5% làm gate. Push type mới `COIN_PUMP_WICK_RECOVERY_1M`, Web Push V8/TTL120s/durable/no replay; long-flush delivery V2 chống immediate push trùng. Card chỉ đếm lịch sử quan sát V2, legacy BTC tách riêng, không là PnL/đảm bảo entry tốt.

WHITELIST V28 nối đúng UI/runtime `coin-pump-wick-recovery:IMMEDIATE` và `coin-pump-wick-recovery:MULTI_BAR`; default OFF, chỉ hiện khi realCLOSED AvgROE>4%, chưa có PnL thì ẩn. Runtime cần optional `coinPumpWickRecoveryAtEntry` V2/context COIN_PUMP/source AT_ENTRY/status CONFIRMED trước entry <=120s; không có producer entry mới và không backfill. Legacy BTC keys/snapshots không được nâng thành quyền nhánh mới. Không tự bật whitelist, auto route hay MARKET; không đổi Binance/entry/size/SL/TP/cap/FULL BYPASS/lệnh cũ, giữ Volume SHORT OFF. JSON file/API cũ nhận V1/V2, giữ enabled/history eventversion, tách legacy counts, không replay, POSTING cũ unknown/pending interrupted, corrupt không ghi đè. Tests exact key/defaultOFF/causal/legacy/closed-policy cùng detector/push/SW/UI desktop-mobile và long-flush regression, mọi submit/push thử đều mock.

### 2026-10-09 — Volume 1m liền mạch: auto SHORT OFF, LONG giữ nguyên

Vận hành `RISING_VOLUME_1M_SHORT_ROUTE_OFF_20261009`, executor V1/controls V37 không đổi. Lúc 11:28:49 VN đã tắt exact key `["rising-volume-sustained-1m","closed-1m-sustained","RISING_VOLUME_1M_SUSTAINED_SHORT","SHORT"]`; LONG/master và mọi route khác không đổi. Controls lưu disk và đọc lại trước submit, reload vẫn OFF; không hard-code cấm SHORT vĩnh viễn. Có thể bật lại riêng route bằng UI. Tín hiệu SHORT detector/Discord/push vẫn được thu như cũ, không đồng nghĩa Binance đã vào lệnh.

Dữ liệu causal closed1m/AT_DETECTION/SUSTAINED V2 và guards tuổi/drift/account/cap giữ nguyên; không thêm gate BTC hoặc nhóm điểm từ review. LONG mới vẫn 3 USDT margin ×5, TP+10%/SL−30% ROE, max50. Không đóng các SHORT đang mở, không sửa/hủy TP/SL/protection hoặc lệnh cũ/các source khác. JSON switch/enabledAt/schema/attempts/fills giữ tương thích, không backfill/replay. Review offline gộp closed groups, loại OPEN/legacy thiếu proof và phân tích thêm mẫu không DCA: 26 LONG closed/14net-positive/net+1.7038USDT/AvgROE+2.1843%, không phải thống kê runtime mới. Không thêm nhãn/card/WHITELIST; policy checkbox defaultOFF và realCLOSED AvgROE>4% giữ nguyên. Regression trong `test-rising-volume-binance.mjs` kiểm tra tắt đúng SHORT, reload, LONG vẫn submit mock, protection recovery; auto-controls suite mock cũng chạy.

### 2026-10-09 — Coin pump/long-flush alert: không có lệnh tự động

`COIN_PUMP_LONG_FLUSH_V1_20261009` / whitelistV27 / WebPushV7 chỉ thêm cảnh báoAI Local vàpush. Dùng closed1m prior20baseline+10pump/risingvolume rồi singlekill, phânloạiDUMP_CLOSE/FLUSH_RECLAIM theo ruleCURRENT; evidenceforceOrdersample optional, counts14ngày/max5000khôngPnL. Không thêmrunner/tradinggate, không tự đóngLONG/vàoSHORT, không đổi Binance/entry/size/leverage/SL/TP/cap/bypass/lệnhcũ. Togglepush riêngtype mặcđịnhON theo yêu cầu không bậtWHITELIST/LỆNHTHẬT.

UI/matcherexact `coin-pump-long-flush:DUMP_CLOSE|FLUSH_RECLAIM`, defaultOFF. Checkboxchung chỉrealcausalCLOSED AvgROE>4%, hiệnobservation0/nullẩn. Chỉoptional `coinPumpLongFlushAtEntry` đúngversion/sourceAT_ENTRY/CONFIRMED/confirmedAt<=entry age<=120s; legacythiếufield khôngmatch, khôngbackfillcache/hậu nghiệm. JSONfile riêng, sai/corruptgiữ/dừngpush, startupkhôngreplay; tradecũgiữ. Sharedparserrejectnulltaker không giả lực bán100%; không sửaBTC-wickthreshold. Testscausedata/null/gap/falsepositive/two-shapes/persist/mockpush/SW/whitelistOFF/4%boundary/UI/deeplink/noBinancewrites.

### 2026-10-09 — Wick recovery 1m: push không phải lệnh Binance

WebPush allowlistV6 thêm chính xác type này; TTL120s, SWbỏ expired. Nhánh BTCcontextCONTINUED_SELL dùng BTC30m<=−0.5%,5m<=−0.3%/2ATR, takerbuy<=35%,volume>=1.2×nền; không phải gate Binance/entry mới. Snapshotmode optional, giữ tương thích history/trade cũ.

`BTC_WICK_RECOVERY_V1_20261009` / `LIVE_CARD_WHITELIST_V26_BTC_WICK_RECOVERY_20261009`: IMMEDIATE/MULTI_BAR dùng closed1m BTCcrash + altfixedlow20m/reclaim/taker, ngưỡng/phânloại/countersquan sát ghi đầy đủ trong CURRENT_DECISION_AND_EMA_RULES. Không runner/orderroute, không sửa Binance/entry/size/leverage/SL/TP/cap/bypass/lệnhcũ. Push `BTC_ALT_WICK_RECOVERY_1M` background qua subscribersPWA, không phụ thuộcDiscord/checkboxtrading. Togglepush khôngbật WHITELIST/LỆNHTHẬT.

UI/runtimekey `btc-wick-recovery:IMMEDIATE|MULTI_BAR` mặcđịnhOFF. Chỉ frozen `btcWickRecoveryAtEntry` sourceAT_ENTRY/đúngversion/CONFIRMED/confirmedAt<=entry age<=120s mới match; legacythiếufield khôngmatch/khônggắn từlive/hậu nghiệm. Hookcheckboxchungđãnối, chỉhiện khi realcausalCLOSED AvgROE>4%; observation0/null khôngđạt. Không có producerlệnhthật cho rule này. JSONfile riêng14ngày/max10kepisode, corruptgiữ/dừngpush, startup khôngreplay; tradeJSONcũ giữ nguyên. Tests causal/gap/stale/persist/no-replay/mockpush/SW/defaultOFF/4%boundary/browser/deeplink/khôngBinancewrites.

### 2026-10-09 — BTC liquidation context: thông báo quan sát, whitelist mặc địnhOFF

`BTC_LIQUIDATION_CONTEXT_V1_20261009` và `LIVE_CARD_WHITELIST_V25_BTC_LIQUIDATION_CONTEXT_20261009` chỉ bổ sung thông báo trên AI Local. Dữ liệu nếnBTC5mclosed/ratio/OI/forceOrder được chụp lúc đánh giá; điều kiện CROWDED/CASCADE/POST/WAIT_DATA và ngưỡng thử nghiệm ghi đầy đủ trong CURRENT_DECISION_AND_EMA_RULES. Không dùng tổng liquidation đa sàn1B làm trigger, không dùng ratio tài khoản như tỷ lệ tiền.

UI/matcher dùng chung `btc-liquidation-context:<STATE>` (NEUTRAL,LONG_CROWDED,SHORT_CROWDED,LONG_CASCADE,SHORT_CASCADE,POST_LONG_LIQUIDATION,POST_SHORT_LIQUIDATION). DefaultOFF, không thêm enabledKeys. Chỉ nhận frozen `btcLiquidationContextAtEntry` sourceAT_ENTRY đúngversion/ready, thời điểm<=entryvàage<=60s; JSONtradecũthiếu field -> khôngmatch, không suy từcache. Hookcheckboxchungđãnối; chỉhiệnrealcausalCLOSED AvgROE>4%; hiện không có cohortclosed (0/null) nênkhônghiệncheckbox. Lịch sử chuyển trạng thái khôngphảiPnL vàkhôngcấp quyền MARKET. Không thêm entry route, không đổi quyền auto,margin/leverage/TP/SL/cap/FULLBYPASS/lệnhcũ. Snapshot mới lưu riêng; file corrupt giữ nguyên, restart warm lại và không replaynotification/order. Test cả matcher/UI/defaultOFF/4%boundary/causalproof.

### 2026-10-08 — Discord volume1m liền mạch không phải permission entry

Đã nạp **18:04:11 UTC+7 08/10/2026**;18:04:44 APIpublic200/configuredtrue/notifierV1errornull/UIv5, GETwebhook200 đúngID/noPOSTtest. Hashcontrols/fingerprinthistory/cutoff1791364588465 giữ; Binance3×5/TP10SL30/hai routes/master/executionON khôngđổi.13unit/regression+browserdesktopmobile qua; noactualorder/noUIwrite, pending0/sent0 tại kiểm tra/chỉmẫu mới.

Version `RISING_VOLUME_1M_SUSTAINED_DISCORD_V1_20261008`/UIv5. Chỉ firstsnapshot mới baseV1/patternV2AT_DETECTION/SUSTAINED/frozen30closed1m, LONG/SHORT, recompute28base+20median/10recent, close saunotifierstart/age<=70s; khôngtypeflip/history5m15m/BURSTY/OTHER/UNKNOWN/legacy/AI hoặcpricepostentry. Đây là alert **passdetector+nềnvolume**, khôngpassrisk/execution hoặc xác suấtthắng. Dù routeOFF/existingposition/cap/protectionfail vẫnalert vớilýdoactualattempt; “ĐÃ GỬI MARKET” khôngfill/khôngđảm bảođủTP-SL. Entry vẫn source/stream/label/cap/auth/3×5/TP10SL30 neo fill/executionguards như trước, cutoff1791364588465/lệnhcũkhôngđổi. Discord khôngawait entryloop.

Webhook localenvonly/examplesecretblank, noURLAPI/log/source/docs. Outbox riêngV1absentempty/corruptfailclosed/14days/exactIDpersisttrướcPOST; chỉ429knownreject đượcretry_after/TTL180s/flush5s, timeout5xx/crashunknownnoretry/other4xxrejected, oldpendingrestartnoreplay; khôngmax5gate/giữsnapshotIDs/trades/audit/controls/entryledgercũ. Operationaldeliverycounts khôngclosedPnL/statcard/tier/cohort/keyWHITELISTmới;6base+3flowtypedmatcher/defaultOFF/checkboxchỉactualclosedAvgROE>4%giữ. Pushmanager catalogđúnglabel/targetVolumepage/defaultOFF, khôngautoenablePush/routepermission. Tests notifiermockbothsides/entryblocked/age/legacy/exactdedupe/rateTTL/uncertainnoresend/corrupt/8coins/secret-safe/defaultOFFPush+browserstatus/hồiquytradingguard/protection/bridge; QA noDiscordPOST/noactualorder, verifywebhookchỉGET.

### 2026-10-08 — Hai route Volume 1m SUSTAINED, fixed3USDT/5x/TP10/SL30

Đã reloadruntime **16:10:40 UTC+7 08/10/2026**;16:11:06 publicUIv4/API200, hai routeON/masterON/executionON đúngversion,size3×5,TP10SL30.88route cũ và nonroute settings khôngđổi theohash; cutoff1791364588465/fingerprint5history đầu giữ.1mcache warm-up0/525 tại kiểm tra,noattempt mới/nohistoryreplay.13unit/regression và browserdesktop/mobile qua, noorder thật đểtest.

Version `RISING_VOLUME_1M_SUSTAINED_MARKET_3USDT_5X_TP10_SL30_V1_20261008`; policy `RISING_VOLUME_SUSTAINED_1M_3USDT_V52_20261008`, controls `AUTO_ENTRY_CONTROLS_V37_RISING_VOLUME_1M_FIXED_3USDT_20261008`, source exception `BINANCE_BOT_SHORT_TP_ONLY_RISING_VOLUME_TP10_SL30_EXEMPT_V8_20261008`. Source `rising-volume-sustained-1m`, stream `closed-1m-sustained`, labels `RISING_VOLUME_1M_SUSTAINED_LONG/SHORT`; exact route keys dùng source/stream/label/side canonical như các route khác. Seed **defaultOFF**, bật hai route một lần theo userrequest, giữ master/execution và mọi route cũ. UI readonlyfixedmargin3/leverage5/TP10/SL30, không cho sửa generic margin/lev/TP của nguồn khác lọt vào. Native capability Symbol + rebuilt fixed plan bắt buộc; clone JSON/giả source/label không bypass, kể cả LEGACY mode.

**Trước entry / phân loại:** frozenfirstepisode1m baseV1+patternV2/sourceAT_DETECTION/SUSTAINED/ID exact; tính lạibase28bar và30closed1m20median+10recent/floor/drop/maxshare hiện hữu. Chỉ initialSUSTAINED1m mới sauenabledAt &runnerstart/age<=70s/MARK lệch<=0.5%. 5m/15m và nhãn khác vẫn OBSERVE ONLY; typeflip/history/API GET khôngentry. Base/classifier tự nó khôngpermission; wrapper này là gate thực, chưa chứng minh winrate nhãn. ExecutionONdryrunOFF/master/route phảiON; tài khoản signedfresh, khôngcoinposition bất kỳside/pendingentry/DCA/flip/protectionoff/FULLBYPASS, capchung50, finalsendrecheck. Minnotional không tăngsize âm thầm.

**Ảnh hưởng Binance:** MARKET3USDTmargin×5=15notional, LONGBUY/SHORTSELL. TP+10%ROE/SL−30%ROE =2%/6% giá neoactualfill, tickrounded/trướcfee-funding; nguồn mới miễn genericSHORT TP6 và SHORTSLsuppression, không thay policy botkhác. Đặt bảo vệ sau fullfillopeningorder đãverify; xácnhậnbothTP&SLopen, missingleg giữpending; TP CONTRACT_PRICE/SL MARK_PRICE preserve hiện hữu. Atomicreserve+fullplan trướcsubmit/deterministicclientID chốngtrùng, noautoretryMARKET kể cảtimeout/unknown, unresolved chặncoin qua restart; restore **protection-only** bằngexactsymbol/side/clientID/orderID từ signedopeningorder mới. Không lấy plan chỉtheocoin/mớiđểbùtradescũ. Cutoff07/10 `1791364588465` cốđịnh, khôngquét/bù/dời oldorders/LIMITprecutoff/DCAold.

**Stat / whitelist / JSON:** dùng lại6basekeys `rising-volume:{1m|5m|15m}:{LONG|SHORT}` +3flowkeys `rising-volume:flow-1m:{SUSTAINED|BURSTY|OTHER}` exactUI/runtimeV24/**defaultOFF**, checkbox chỉactualclosedAvgROE>4%. APIclosedstats chỉ source/versionCLOSED Binanceaudit cócausaloriginalproof, khôngOPEN/DCA/observation/legacy; groupcloseGroupId/orderID, sum net/summargin×100 rồi lấy trung bình các group. WHITELIST thống kê không bật route/authorization; hai permission độc lập. Khôngnewstatlabel/card/key, operationalBinancepanel chỉstatus/100attempts. HistoryV1/IDs/snapshots/rawfields/enabledKeys/route/exclusions giữ; auditV2 optional3fields snapshot/ID/entryversion mới/CSVcolumnsunchanged, missingproof khôngbackfill/match/stat. Ledgerfile mới absentempty/invalidpreservedfailclosed/14dayscompleted+unresolvedretained; API bỏfullplan và nêuTP/SL dựkiếnneoactualfill. Không thêm Discord/Push riêng/AI. Tests typedkeys/defaultOFF/strict>4% và sourceproof, mocksactualMARKET/setTpSl/bothdirections/exactrecovery/restart/cap/protectionrace/legacy vàbrowserdesktopmobile/XSS/tap/filters/error/overflow; không đặt/hủy lệnh thật để test.

### 2026-10-08 — WHITELIST V24: sustained/interrupted volume luôn trên nến1m

`RISING_VOLUME_PATTERN_V2_1M_SUSTAINED_FLOW_20261008` (UIv3) **thay thế định nghĩa phân loại V1 bên dưới**. Dữ liệu trước entry tiềm năng:30closed1m liên tục/đúng biên/lastclose<observedAt/tail<=70s,20nền median+10xét, không nến mở/lookahead/khung lớn. Floor=max(1.2×nền,0.5×median10); cột cao>=max(2×nền,median10) rồi cột kế tiếp dướifloor/retained<=25% ->BURSTY. Không có drop này, mean10/nền>=1.5,>=8/10 cột và cộtcuối giữfloor/maxcột<=35% tổng10 ->SUSTAINED; còn lại OTHER, thiếu/cũ/gap/zero nềnUNKNOWN. Không yêu cầu5cột tăng strict. ON-like/ARC-like là ví dụ hình dạng, không testdata thật/khẳng định winrate. **OBSERVE ONLY**, không entry gate; base detector V1/side/28bar/scan/warmup không đổi, thiếu1m không chặn tín hiệu base.

Ba card mới nối shared UI/runtime exact `rising-volume:flow-1m:SUSTAINED`, `rising-volume:flow-1m:BURSTY`, `rising-volume:flow-1m:OTHER`. DefaultOFF, chỉ hiện checkbox khi **closed AvgROE>4%** thật; hiện closed0/AvgROEnull. Card đếm active coin/khung LONG-SHORT +historyđợt theo loại lúc đầu, không closedtrade/PnL/winrate; mộtcoin nhiềukhung đếm riêng. Matcher yêu cầu base causal snapshot trước openedAt +exactV2/sourceAT_DETECTION/type khớp frozen30x1m. Legacyprojection/UNKNOWN/fake khôngmatch. Sáu basekeys giữ; hai keyV1 CONTINUOUS/MIXED vẫn normalize/preserve enabledKeys cũ nhưng không tái dùng cho nghĩa1m mới. Key/checkbox không cấp source/authorization/entryroute; nguồn này chưa có runnerBinance.

JSON historyschemaV1/IDs/trades/controls/protection giữ nguyên, thêm optional volume1mChart30 vàmetadataV2 lúc phát hiện; live typeflip không ghi lại history/tạo đợt. Legacy28x1m/chart5m15m thiếu1m30 ->UNKNOWN, không backfill từ giá/cache hôm nay. Oldcompletefrozen1m30 chỉ readonly FROZEN_CHART_LEGACY, khôngtypedmatch/ghi migrate. Không AI/Discord/Push/Binance mới, không đổi entry/size/margin/leverage/cap/SL/TP/protection; cutoff07/10 `1791364588465` giữ nguyên, không quét bù lệnh cũ. Tests3keys/defaultOFF/sourcecausal/legacy +browser strictclosed0/null/4%hide/4.01%show đúngkey +protection/auto-controls regression dùng mocks, không đặt/hủy lệnh thật. Ngưỡng phân loại là mô tả ban đầu, chưa backtest/cấp quyền giao dịch.

### 2026-10-08 — WHITELIST V23 cho hai nhãn volume cột (chỉ quan sát)

Version `RISING_VOLUME_PATTERN_V1_FIVE_CLOSED_COLUMNS_20261008`; base detector/schemaV1 giữ nguyên. Những tín hiệu đã đạt base rule được chia theo5cột **coin-volume đã đóng** trong chart trước entry tiềm năng:4/4bước tăngstrict→CONTINUOUS, có giảm/ngang→MIXED, thiếu/gap/future→UNKNOWN. LONG/SHORT/MA5/mean5vs20/dữ liệu28bar/freshness không đổi; đây là **OBSERVE ONLY**, không entry gate/xếp hạng thắng. Không AI/Discord/Push/trades mới hoặc Binance order route, không đổi authorization/margin/cap/leverage/entry/SL/TP/protection.

Hai card mới dùng exact UI/runtime `rising-volume:pattern:CONTINUOUS`, `rising-volume:pattern:MIXED`, defaultOFF. Shared checkbox chỉ hiện strict **closed AvgROE>4%**; active/observations không phải closed trades, hiện closedCount0/AvgRoenull nên ẩn. Sáu direction/frame keys cũ giữ nguyên. Matcher mới yêu cầu `risingVolumeSnapshot` baseversion/casualtime/sidevalid trước openedAt cùng `volumePatternVersion` exact, `volumePatternSource=AT_DETECTION` và nhãn khớp lại chart. Missing/legacy/readonly `FROZEN_CHART_LEGACY`/UNKNOWN/metadata không khớp→không typed-key; key không cấp route hoặc quyền trading.

JSON V1 history/trades/controls giữ nguyên, không reset/migrate/enrich trade cũ hoặc auto-enable. API chỉ project pattern từ chart gốc của history cũ với sourcelegacy, không lấy giá hiện tại/ghi backfill; missingchartUNKNOWN. New snapshots lưu optional typefields; live thay loại không viết lại đầu đợt/ID. Stats táchactiveLONG-SHORT và observations theo loại lúc phát hiện, không PnL/winrate/AvgROE giả. Protection cutoff07/10 vẫn giữ, không quét bù lệnh cũ. Tests mock unitexacttypedkeys/defaultOFF/causal legacy excluded + browsernull/4%hide/4.01%show đúng key, no write requests; protection/auto-controls/whitelist regression không MARKET/cancel thật.

### 2026-10-08 — Rising volume whitelist V22, không thêm Binance entry route

`RISING_VOLUME_V1_CLOSED_BASE_VOLUME_OBSERVE_20261008` trên `/rising-volume-watch` là **OBSERVE ONLY**. Dữ liệu lúc nhận diện:28closed liên tục/fresh nến Binance1m/5m/15m, volume coin MA5 tăng3bước, mean5≥1.5×mean20 trước đó không overlap/≥3barvượt nền; LONG thêm price5≥+0.25%/≥3xanh/lastclose tăng, SHORT đối xứng giảm. Taker quote% chỉ hiển thị; không AI, không Discord/Push, không tự vào paper/Binance. Cửa sổ/chỉ số frozen trước mọi entry tiềm năng, không suy lại bằng giá sau entry.

Sáu key UI/runtime exact `rising-volume:1m:LONG`, `rising-volume:1m:SHORT`, `rising-volume:5m:LONG`, `rising-volume:5m:SHORT`, `rising-volume:15m:LONG`, `rising-volume:15m:SHORT`; whitelistV22 normalize/match đúng key, **default OFF**. Shared checkbox nối6card nhưng chỉ hiện closed AvgROE>4% (strict>); card hiện đếm active/observations với closedCount0/closedAvgRoenull nên ẩn checkbox. Không coi observation là closed trade hoặc tự tạo AvgROE/PnL/winrate. Chưa có entry route cho nguồn này; whitelist không cấp Orders authorization/source/margin/leverage/cap/SL/TP.

Matcher optional `trade.risingVolumeSnapshot`: versionexact,observeOnlytrue,intervalsidevalid/sidekhớp,closedAt≤observedAt≤openedAt; missing/legacy/versionlệch→không match. Không thêm field cho trades cũ hoặc gắn vào runner hiện hữu, không auto-enable key, giữ enabledKeys/controls/protection JSON và mốc07/10 hiện có. History file độc lập absent→empty, invalidschema giữ/báo lỗi, atomic/retry/3000mẫu/14ngày, no backfill. Tests risingvolume+whitelist defaultOFF/strictclosedeligibility/causal legacy và protection/auto-controls regression dùng mock; không tạo/hủy lệnh thật để thử.

### 2026-10-07 — TP/SL bản sửa chỉ lệnh đặt mới

Mốc runtime đang lưu: **07/10/2026 16:16:28 UTC+7** (`2026-10-07T09:16:28.465Z`). PM2 đã nạp bản sửa, không dùng lại thời gian restart sau đó làm mốc mới.

`POSITION_PROTECTION_NEW_ORDERS_ONLY_V1_20261007` là **gate protection Binance thật**, không phải nhãn OBSERVE ONLY/entry gate. Mốc lưu `data/position-protection-fill-watermark.json` ở lần release đầu nạp, giữ cố định qua restart. Trước tạo/bù protection: signed order exact symbol/ID/side/positionSide, opening MARKET/LIMIT FILLED, không reduceOnly/closePosition; **order.time và fillTime đều phải > mốc**. Không dùng position updateTime để nhận lệnh cũ. LIMIT tạo trước mốc khớp sau mốc vẫn giữ nguyên. Socket/startup/reconnect cùng gate; REST/proof lỗi lệnh mới retry, không ghi nhận đã bảo vệ giả.

Không quét bù SL/TP cho GTC hoặc vị thế cũ. `TpOnlyGuard` chỉ xử lý tracking mới có proof creation/version/mốc; DCA không cấp SL30 mới cho vị thế cũ hoặc khôi phục pending SL30 trước mốc. Recovery vẫn tìm fill mới sau mốc đã bị bỏ lỡ và tiếp tục được qua restart. **Không hủy TP/SL có sẵn; không tắt các rule quản lý/dời/đóng cũ** hoặc bật FULL BYPASS hàng loạt. Các lệnh trên sàn đã có vẫn có thể khớp; setting FULL BYPASS hiện hữu giữ toàn bộ ý nghĩa cũ.

Precision manual SHORT mới: `MANUAL_SHORT_SL30_CUMQUOTE_PRICE_V1_20261007` dùng signed cumQuote/executedQty, kiểm tra consistency precision avgPrice và strict live entry/qty. SL−30%ROE tính từ entry thực/leverage, fill anchor không bị socket avgPrice làm tròn ghi đè; vẫn chỉ manual/new opening và config activation hiện hữu, không áp bot/DCA/FULL BYPASS. TP, entry, size, cap và signal/tier không đổi. Không sửa CLOSED PnL/AvgROE hoặc thêm cohort/statcard/WHITELIST; policy defaultOFF/chỉ closed AvgROE>4% giữ nguyên, operational skipped counter không là kết quả backtest.

JSON legacy giữ version watermark/IDs/lastHandled monotonic, thêm mốc/version một lần; file/mốc hỏng fail closed không reset. Tracking cũ không nâng cấp/replay; mới thêm proof fields `protectionNewOrdersOnlyVersion`, `protectionNewOrdersOnlySince`, `protectionOrderCreatedAt`. Giữ `manualShortSl50`, thêm optional `fillPriceVersion`, `orderCumQuote`, `orderAvgPrice`; thiếu price proof giữ đọc cũ, không rewrite history/audit/PnL. Tests `test:protection-new-orders-only`, `test:protection-fill-watermark`, `test:manual-short-sl30` + socket/FULL BYPASS/auto-controls/protection/EMA99 regression dùng mock, không tạo/hủy lệnh thật để kiểm thử.

### 2026-10-05 — “Tắt toàn bộ” chặn cả tự đóng MARKET/LIMIT (V9)

Manual close endpoint yêu cầu same-origin và Orders token hợp lệ; token lạ/expired trả401 trước khi dùng credentials/cấp capability. Helper kiểm tra lại token, không cấp miễn chặn từ ENV fallback. Sau restart nếu mất phiên hãy đăng nhập Orders lại; đóng trên ứng dụng Binance không đổi.

Version exclusion `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V9_FULL_BYPASS_AUTO_CLOSE_20261005`, PostMove close `POST_MOVE_DUAL_DIRECTION_POSITIVE_PNL_CLOSE_V2_FULL_BYPASS_20261005`. Sửa RLC: FULL BYPASS nay được xét trước nhánh dual LONG+SHORT cùng timeframe/PnL grosspositive, và guarded client đọc lại controls trước submit để chặn mọi reducing MARKET/LIMIT/conditional (one-way/hedge), kể cả BTC reversal/live-card/reversal/timeout đi trực tiếp. Causal data entry/signal classification không đổi; trước close vẫn snapshot/Position Risk/MARK hiện hữu cộng exact-symbol setting, không nới gate hoặc đổi PnL threshold cho coin thường. Temporary auto-resume giữ MARKET behavior cũ, conditional TP/SL vẫn chặn.

**Đóng MARKET thủ công vẫn được phép** sau Orders credentials check, bằng Symbol capability server-only; JSON `manual`/entryControl/clientID không tạo quyền. **TP/SL đã có trên Binance giữ nguyên và vẫn có thể khớp**; không tự hủy orders hoặc thực thi giao dịch để thử. Request đã gửi/được Binance nhận trước bật không bị thu hồi. FULL BYPASS không auto-resume theo ROE, chỉ gỡ tay/xác nhận vị thế đã đóng/đảo chiều như cũ; armed cho vị thế kế tiếp và bound qua restart giữ nguyên.

Ảnh hưởng Binance: gate đóng/protection thật, không phải OBSERVE ONLY; không đổi entry/size/leverage/cap/giáTP-SL/statPnL và không sửa audit cũ. Blocked không tạo fill/closed sample. Không thêm thống kê label/card/cohort hay WHITELIST matcher; exact key/defaultOFF/chỉ closedAvgROE>4% giữ nguyên. JSON/schema/routes/exclusions/lifecycles/events/submissions giữ tương thích; missingfull→empty, knownbypass giữ khi file hỏng và chặn không tự clear. Tests mock `test:full-bypass-auto-close` + auto-controls/PostMove/direction-flip/timeout/protection: RLC dual15m/PnLpositive vẫn 0autoclose, normalcoin unchanged, manualcredential/fakeflags, hedge/LIMIT/conditional, await setting race/restart/corrupt file.

### 2026-10-05 — Notification UI V4 / frozen direction colour V2 (OBSERVE ONLY)

`LIQUIDITY_ZONE_NOTIFICATIONS_UI_V4_DIRECTION_COLORS_20261005` và history `LIQUIDITY_ZONE_NOTIFICATIONS_V2_FROZEN_DIRECTION_20261005` tô nhãn hướng tới vùng/coin5m15m/BTC5m15m: xanhUP, đỏDOWN, vàngFLAT/INSIDE, xámUNKNOWN; border theo hướng tới vùng, BTC15m cùng/ngược có text riêng. Hai ý độc lập: hướng cần đi tới vùng khác biến động đã xảy ra; không gọi là dự báo/xác suất hoặc xác nhận LONG/SHORT. **OBSERVE ONLY**, không label/card thống kê/WHITELIST matcher mới; defaultOFF/chỉ closedAvgROE>4% route hiện hữu giữ nguyên.

Data chỉ directionNote đã frozen trước entry/lúc lifecycle event: close/close hai nến đóng liên tục từ note V1, không thêm REST/AI/giá hiện tại. Lưu projection version/observedAt/target/coin/BTC trong Push history mới, observedAt≤notificationAt(+1ms socket boundary), closeAt<observedAt; sai/thiếu→UNKNOWN, note tương lai bỏ. JSON stored legacy thiếu note chỉ enrich readonly từ **exact attemptKey/eventId+symbol** có note gốc trước notification, không chọn vùng mới theo coin hoặc suy từ body/title. Không có note→xám, giữ nguyên message/IDs/readmark/delivery/dedupe/subscriptions/legacy records, không resend Push/replay MARKET. Thống kê/PnL và mọi Binance/entry/size/cap/SL/TP/protection/authorization/gate không đổi; chỉ thêm metadata hiển thị, không thêm rule giao dịch. Tests direction-colour/XSS/exact-ID/future/missing/risk/mobileresponsive + notifications/manual/MAIN/manager/Push regression, mock-only không gửi lệnh thật.


### 2026-10-05 — BINANCE_CONTRACT_RISK_V1_WARN_ONLY_20261005

- Version cảnh báo V1 / Push service V5 / manager UI V18. Panel delist/tất toán trên `/liquidity-zone-manager`, type `BINANCE_FUTURES_CONTRACT_RISK`, history loại RISK/deep link exact notification+risk. **OBSERVE ONLY**, không phải gate hay statcard giao dịch; history RISK không có nút entry.
- Dữ liệu: public raw Binance exchangeInfo USDT PERPETUAL/PERPETUAL_DELIVERING, deliveryDate trong ±7ngày hoặc trạng thái hạn chế được nhận diện, bỏ sentinel xa và hợp đồng quá hạn>7ngày. Bổ sung notice chính thức đã kiểm chứng PROMPTUSDT/PUMPBTCUSDT/1000000BOBUSDT ngày05/10/2026: tất toán09UTC/ngừng mở mới08:30UTC. Không giả định mọi coin ngừng mở mới−30phút; API khác notice→nêu xung đột/bỏ giờ hạn chế. Không crawler bao phủ mọi thông báo, không cảnh báo đầy đủ liquidation/ADL. Dữ liệu này không bổ sung yêu cầu trước entry.
- Phân loại announced/≤24h/≤1h/restricted/đến-qua giờ; API5min, kiểm tra mốc60s; lỗi retry60s giữ dữ liệu cũ và báo lỗi/stale, không Push mốc mới khi lỗi hoặc data>15min. Giờ UTC+7; ngừng mở mới không đồng nghĩa khóa đóng vị thế, đến giờ theo lịch không xác nhận vị thế cụ thể đã đóng.
- Push chỉ thiết bị đã đăng ký. Event symbol+deadline+stage reserve trước gửi, restart/timeout không replay; lịch quá hạn>2min chỉ lưu HISTORICAL_EVENT không Push trễ. Giữ alert/delivery aggregate1000/7ngày; không trộn CLOSED PnL/AvgROE. Không thêm trading statlabel/card/matcher WHITELIST; defaultOFF/chỉ closedAvgROE>4% của route hiện hữu giữ nguyên. Không đổi Binance/entry/size/SL/TP/cap/routes/protection; không tạo/hủy/đóng lệnh.
- JSON risk mới `data/binance-contract-risk.json`, absent→empty; JSON Push/notification legacy giữ subscriptions/VAPID/sentEvents/watch/attempts, thêm RISK/riskId độc lập, không reset/resend/migrate replay. Tests `test:binance-contract-risk`, manager/notification/worker/Push/MAIN/manual/nav, mock-only không gửi MARKET thật.


### 2026-10-05 — Zone direction note OBSERVE ONLY / cache-first refresh V5

`ZONE_DIRECTION_NOTE_V1_CLOSED_CACHE_ONLY_20261005` bổ sung ghi chú hướng từ MARK tới vùng và biến động close/close coin+BTC5m15m đã đóng (2bar liên tục, tail≤interval+60s). Same/opposite BTC15m là thông tin tham khảo, không xác nhận hướng tương lai/gate/xác suất. Snapshot note lưu trước submit MAIN hoặc khi lifecycle event; cache-only/no REST/no AI, thiếu/cũ/gap→UNKNOWN, callback lỗi không chặn lệnh. Push/history/managerattempts thêm text; storedbody cũ giữ, JSON thiếu note nói chưa lưu lúc phát, không backfill hướng bằng hiện tại hoặc resend/replay.

Manager `LIQUIDITY_ZONE_MANAGER_V5_CACHE_FIRST_DIRECTION_NOTE_20261005` / data `ZONE_REFRESH_V5_CACHE_FIRST_RETRY_20261005` ưu tiên đủ240nến15m continuous/cache fresh≤930s cùng heatmap/LiqScan; RESTfallback chỉ khi gate rảnh queue<20/token≥4, lỗi bounded retry60..300s, success15min. Guard market/snapshot≤90s/history continuous/freshsocket/manualstop/frozen/noRevival giữ nguyên. Dữ liệu refresh sẵn sàng sớm hơn nhưng **không đổi entry policy/authorization/candidate/plan/source/dedupe/controls/WHITELIST**, không BTC/retest/volume gate. MAIN trading V5 giữmargin2×5/gap≥2.5/cap20/TPfrozen/SL−30%ROE/fillanchor, manual margin/auth/confirm không đổi; không sửa formatterquantity. Thống kê CLOSED/defaultOFF/chỉ closedAvgROE>4% giữ nguyên, không label/cardstat/matcher mới. Legacy refresh thiếu failures→0, bổ sung succeededAt khi thành công; IDs/bounds/history/seen/routes/orders không reset. Tests observation+MAIN/manager/recovery/manual/notification/Push mock-only, không đặt lệnh thật để test.

### 2026-10-05 — Notification UI V3: popup phản hồi cả loading và blocked

Version `LIQUIDITY_ZONE_NOTIFICATIONS_UI_V3_VISIBLE_ORDER_FEEDBACK_20261005` không đổi backend manualV1/MAIN V5. Click nút margin mở popup ngay, Submit/input tắt lúc kiểm tra và nếu thiếu ID/vùng hết hạn/gate fail/HTTP lỗi; lý do hiện ngay popup, không ngoài màn hình. Đóng trước GET xong invalidate response cũ; submit vẫn cần token+confirm. Preentry data/frozenwatch/socket/closedhistory/REST và ACTIVE chưa vượt/gap≥2,5%/guard hiện hữu, thống kê/WHITELIST/defaultOFF/closedAvgROE>4%, size margin×5/TPfrozen/SL−30%ROE/shared20/noDCA/no-replay giữ nguyên. Không có MARKET khi mở popup hoặc bị chặn; không thêm label/card/matcher và không migrate/reset/replay JSON cũ. Tests visibility/loading/blocked/missingID/request race mock + manualbackend, browser verification không gửi lệnh thật.

### 2026-10-05 — Manual entry từ notification UI V2

`LIQUIDITY_ZONE_NOTIFICATIONS_UI_V2_MANUAL_MARGIN_20261005` thêm nút footer trên `/liquidity-zone-notifications`, giữ nguyên manager. Chỉ resolve immutable watchId+symbol của thông báo (legacy exactattempt→watchId), không replace bằng vùng mới. Trước entry dùng snapshot giá/nến/lifecycle mới, chỉ MAIN ACTIVE/chưa consumed/vượt/đủhistory/gap≥2,5%/socket≤15s/closed≤6phút; thông báo FAR/cũ/mất ID/vùng bị xóa không đủ điều kiện. Nhập margin(default2)×5x và tick xác nhận mới gửi POST manualV1 có tokenOrders/sameorigin/executionON/revalidation/drift≤0,5%/TTL15s/protection/no-existing/pending/shared20/no-ceil/no-replay; TP near-edge frozen, SL−30%ROE fullfill. Có ảnh hưởng lệnh thật sau submit, không khi mở lịch sử hoặc đọc thông báo. Không đổi auto route/size/SL/TP, không thêm statlabel/WHITELIST matcher; auditmanual và closedAutoStats/defaultOFF/closedAvgROE>4% không đổi. JSON legacy giữ nguyên, không backfill/replay orders hoặc Push; chỉ fallback exact IDs. Tests notification-order UI mock + manualbackend/notification/nav regression; không dùng lệnh Binance thật để kiểm tra.

### 2026-10-05 — Manual MAIN margin submit / shared cap20

`LIQUIDITY_ZONE_MANUAL_V1_MARGIN_CONFIRM_20261005` + MAIN V5 + UI V16: thao tác thủ công ở `/liquidity-zone-manager`, cần session `/orders`, executionSettingsON, POST same-origin và tick xác nhận MARKET thật. Nhập margin USDT(default2), cố định5x; nút không bật auto route hoặc WHITELIST và không đặt lệnh khi mở. Server dựng payload từ watchId và xác nhận đúng zone/side/MARK; không nhận arbitrarysource/TP/SL từ client. Data trước entry/guard: MAIN enabled ACTIVE/chưa vượt/chưaconsumed, đầy đủ continuous5m và close≤6phút, socket≤15giây+freshRESTMARK, gap≥2,5%, hướng gốc hợp vị trí. Không FAR/chạm/cũ, protection bị tắt, existingposition/entrypending/unknownattempt; confirmationdrift≤0,5%, TTL15s, recheck trước MARKET. Trên→LONG TPzone.low; dưới→SHORT TPzone.high; notionalmargin×5, no minimum auto-ceil; SL−30%ROE full-fill anchored6%, TP frozen không bị manual SHORT EMA99 TP-only/TPROE chung ghi đè. Có ảnh hưởng Binance/entry/size/SL/TP khi người dùng submit, không tự thay auto size2×5.

Source `liquidity-zone-manual`, stream `manual-main-zone`, label thủ công có sẵn `orders-manual`; audit margin/price/TP/SL thật. Cap20 gộp MAIN auto+manual độc lập max50 và các source khác. Shared entry queue/refetch positions+openOrders, immutableledger accountHash+frozencluster reserve trước dispatch với clientId cố định; không replay/doubleclick/restart/timeout, unknown giữslot đến đốisoát. Pre-MARKET reject biết chắc không chiếmslot nhưng không retry cùngcluster. Ledger JSON mới absent→empty, giữ nguyên routes/watch/seen/autoattempts cũ, không replay lịch sử. ClosedStats MAIN auto và WHITELIST matcher/defaultOFF/closedAvgROE>4% không đổi; không thêm tradinglabel/statcard/checkbox mới cho hành động manual. Tests `test:liquidity-zone-manual-order` cùng zone/MAIN/shortTP/navigation/notification regression, mock-only không gửi tiền để test.

### 2026-10-05 — Notification history / exact deep links (không thay rule Binance)

`LIQUIDITY_ZONE_NOTIFICATIONS_V1_EXACT_LINK_20261005`: trang lịch sử thông báo Zone/MAIN MARKET read-only; MAIN Push bổ sung watchId/attemptKey/notificationID vào link để xem đúng kết quả, không gọi MARKET khi mở link. Persist payload công khai/delivery aggregate1000/7ngày trong Push state V4, cũ mặc định[] và merge events/attempts readonly legacy/no-resend, giữ subscriptions/VAPID/sentEvents/dedupe. API không trả endpoints/keys. Target cố định watch/event/attempt, kể cả archived hoặc ngoài last30; expired không đoán setup khác. Read-marker local không có quyền route/entry và không được gọi là gate giao dịch.

Dữ liệu trước entry/gap/ACTIVE/cursor/guards/statistics/WHITELIST runtime matcher, defaultOFF/chỉ closedAvgROE>4% không đổi; không thêm nhãn/card thống kê cần route mới. Max20/2USDT×5/TP vùng/SL−30%ROE và protection giữ nguyên. Tests notification deep-link/paging/privacy/legacy/worker/XSS, Push history restart/no-resend và MAIN/manager regression.
### 2026-10-05 — MAIN V4: verified history + refreshed snapshots + fair scan

`MAIN_KILL_DISTANCE_V4_RECOVERY_FAIR_SCAN_20261005` dùng manager `LIQUIDITY_ZONE_MANAGER_V4_VERIFIED_BACKFILL_REFRESH_20261005`: trước entry phải có toàn bộ chuỗi nến5m đã đóng liên tục từ capture tới lastclosed, MARK≤15s/lastclosed≤6min/MAIN ACTIVE chưa vượt/gap≥2.5% cùng signedpositions/orders/audit/ledger/controls. Legacy historyIncomplete bù từ đầu bằng REST499bars theo batch2/5s/retry≥60s, không skip gap; historical sweep giữ blacklist vùng, không Push trễ. Refresh snapshot≥15min/coin theo vòng2/2s với freshness≤90s; cụm mới tách watchID, giữ bounds/history cũ và không revive cụm đã thấy (exact hoặc same-direction overlap≥80% nhỏ+center≤25% lớn). Manual stop per-role/symbol và Push preference(defaultOFF) giữ qua restart/kết quả REST muộn.

Thay dữ liệu/khả năng tìm entry mới và quay vòng batch3 chống starvation, không nới size/gate: max riêng20 gộp LONGSHORT độc lập max chung,2USDT×5,TP mépMAIN,SL−30%ROE neo fill, unknown không retry, bảo toàn protection lệnh cũ. CLOSED AvgROE thống kê và WHITELIST key matcher cũ không đổi/defaultOFF/chỉ hiện>4%; không có nhãn/card/route mới. JSON manager thêm cursor/refreshState, giữ seen/status/events/ledger/audit/attempts/routes; payload mới MAINV4. Test recovery/manager/main và short-policy bảo đảm migration, đủ dữ liệu mới gỡ chặn, phát hiện sweep vẫn không vào, no replay và controls không tự bật.

### 2026-10-04 — MAIN distance V3: max20 theo source

`MAIN_KILL_DISTANCE_V3_SCOPED_MAX20_20261004` thay gate cap riêng10→20 gộp LONG/SHORT (`maxOpenPositions=20`, scope `main-kill-distance-entry`), không phụ thuộc max chung. Runner và placeOrder cùng constant; vị thế nguồn khác không chiếm slot, đủ20 chờ và không tiêu thụ setup. Dữ liệu trước entry MARK/bounds/lifecycle ACTIVE chưa vượt/lịch sử5m/signed positions+openOrders/audit+ledger/controls, classification gap≥2.5% và thống kê CLOSED không đổi. Size2USDT×5, TP mép MAIN, SL−30%ROE neo fill và các guard giữ nguyên. UI/runtime WHITELIST matcher hiện hữu không đổi, default OFF, chỉ hiện closed AvgROE>4%; opt-in đã lưu được giữ. JSON cũ không reset ledger/routes/audit/attempts, unknown không replay, protection cũ không đổi; validator chỉ nhận entry plan mới V3/cap20. Test19own+54other cho phép,20own chặn, cap10/50 không hợp lệ và regression guards/dedupe/restart/UI.

### 2026-10-04 — MAIN distance V2: max10 theo source

Notional bị Binance từ chối rõ ràng không được đếm thành vị thế/pending: REJECTED, không retry hoặc tự tăng size. ERROR_OR_UNKNOWN cũ với lỗi notional rõ cũng bỏ slot; timeout chưa rõ giữ slot.

`MAIN_KILL_DISTANCE_V2_SCOPED_MAX10_20261004` chỉ thay gate số vị thế: `maxOpenPositions=10`, scope `main-kill-distance-entry`. Hai routeLONG/SHORT chung hạn mức10, tổng vị thế nguồn khác không chặn. Count live amount≠0 kết hợp OPENaudit đúngsource/stream/label/ledger, dedupe symbol-side; pending vàunknown giữslot, closed bỏslot, reservation lệnhcurrent loại khỏicheck. Đủcapchờ khônglưuattempt. Authorization kiểm tra scope+10; source khác giữmaxcũ. Size2×5, TPvùng, SL−30%ROE/master/runtime/IP/protectionguards khôngđổi. JSONV1 giữattempts, chỉ lỗiMax50khôngorderId đượcxétlại vì chưa gửi, lưu previousAttempts; unknownkhôngreplay. UI MAIN/xa→gần mặcđịnh. Không statlabel/card/WHITELIST mới; defaultOFF/closedAvgROE>4%/matcher và thốngkê closed giữ nguyên. Tests `test:main-kill-distance-entry` bao gồm54other+9/10own,scope,closed,pending và knownV1rejection.

### 2026-10-04 — MAIN_KILL_DISTANCE_2_5 · explicit opt-in

Version `MAIN_KILL_DISTANCE_V1_2USDT_5X_ZONE_TP_SL30_20261004`; routes `main-kill-distance-entry / active-main-distance / MAIN_KILL_DISTANCE_2_5 / LONG|SHORT`, default OFF. Key checkbox WHITELIST=JSON `[source,streamId,signalLabel,side]` chính là entryRoute matcher, chỉ hiện CLOSED AvgROE>4%; không tự bật bởi thống kê. Closed stats gộp closeGroupId, ROE=sum netPnL/sum margin, mean nhóm; exclude OPEN, missing, exactly4. Master và runtime độc lập phải ON, signed REST guard giữ nguyên.

MAIN enabled ACTIVE, chưa vượt/captureinactive, đủ lịch sử nến5m và MARK mới; gap mép gần>=2.5%. LONG tới low, SHORT tới high, 2USDT×5; SL−30%ROE cả hai chiều neo fill, TP không rebase/đổi ROE. Source riêng miễn SHORT-TP-only, preserve protection; coin full bypass/excluded không vào. Không nới max50/min-notional, không chồng vị thế/lệnh. Ledger reserve trước submit và giữ qua restart, lỗi unknown không retry. Push kết quả độc lập checkbox Push lifecycle. JSON manager cũ không đổi, thiếu seen/role/candle không đủ điều kiện; không đổi entry/SL/TP của source khác. Tests `test:main-kill-distance-entry`, `test:short-tp-policy`, `test:local-ai-liquidity-breakout-opposite-depth-binance`, `test:liquidity-zone-manager`.

### 2026-10-04 — Zone manager UI V6: hướng quan sát, không gate

`LIQUIDITY_ZONE_MANAGER_UI_V6_DIRECTION_SCENARIOS_20261004` chỉ diễn giải MARK so với vùng cố định và lịch sử đã ghi nhận. Quét lên/xuống là kịch bản có điều kiện, không khuyến nghị LONG/SHORT hoặc xác suất. Không thêm dữ liệu trước entry, không đổi lifecycle, thống kê hiệu suất, Push hay Binance/entry/size/SL/TP. Không nhãn giao dịch/card thống kê/matcher/WHITELIST mới; default OFF và closed AvgROE >4% giữ nguyên. JSON/API không đổi; test missing seen/giá cũ/vùng cũ, không phát sự kiện hoặc thực thi lệnh mới.

### 2026-10-04 — All-coin zone import V3 chỉ quan sát

`LIQUIDITY_ZONE_MANAGER_V3_ALL_COINS_IMPORT_20261004` mở rộng universe quan sát đến mọi USDT perpetual TRADING. Dùng public 15m/MARK/24h tính cùng LiqScan AI; bounds/lifecycle không đổi. Tiến độ import và số coin/vùng là telemetry, không phân loại hay gate giao dịch. Không signed REST, không đổi Binance/entry/size/SL/TP/protection hoặc route. Push mới mặc định OFF, coin cũ giữ cài đặt; state thêm job atomic/resumable, JSON cũ tương thích, không replay. Không thêm nhãn giao dịch/card/cohort/matcher/WHITELIST; default OFF và CLOSED AvgROE >4% giữ nguyên. Test vượt 100 vùng, resume, stop inflight, lỗi từng coin và giữ Push cũ.

### 2026-10-04 — Capture wording V2 không cấp quyền giao dịch

`LIQUIDITY_ZONE_MANAGER_V2_CAPTURE_WORDING_20261004` chỉ thay diễn đạt cho record `CONSUMED_AT_CAPTURE`: đọc MARK/bounds lúc thêm để mô tả ngoài vùng, chưa xác nhận quét trong lịch sử trang. Không đổi phân loại runtime, audit/thống kê, Push, Binance/entry/size/SL/TP/protection; vẫn OBSERVE ONLY. JSON cũ giữ status/flags, chỉ thêm API presentation, không migration/replay. Không nhãn giao dịch/card/cohort/matcher/WHITELIST mới; default OFF/CLOSED AvgROE >4% giữ nguyên. Test compatibility/capture-versus-live đảm bảo không sinh sự kiện hoặc lệnh giả.

### 2026-10-04 — Quản lý vùng thanh khoản chỉ quan sát

`LIQUIDITY_ZONE_MANAGER_V1_SOCKET_CLOSED_HISTORY_20261004` tại `/liquidity-zone-manager` dùng vùng LiqScan snapshot cố định, MARK socket và nến 5m đã đóng sau capture để ghi chạm/vượt/đóng vượt/reject. Không dùng outcome/PnL trước entry. Audit 300 event/7 ngày không phải thống kê hiệu suất; exact Push type `BINANCE_LIQUIDITY_ZONE_LIFECYCLE` chỉ cấp quyền delivery, mặc định OFF từng vùng, không phải label/gate vào lệnh. Không signed REST, submit/cancel order hoặc đổi entry/size/leverage/SL/TP/protection; không bật lại LONG thanh khoản ngược. JSON mới riêng atomic; snapshot/route cũ không migration, cache socket chỉ thêm `isClosed`, record cũ thiếu flag dùng closeTime. Không tạo cohort/card/matcher WHITELIST mới; policy CLOSED AvgROE >4% và default OFF giữ nguyên. Kiểm thử lifecycle, nến chưa đóng, temporal evidence, restart/no replay và exact Push allowlist.

### 2026-10-03 — Trang lệnh theo tín hiệu chỉ đọc

- `/binance-signal-orders` (`BINANCE_SIGNAL_ORDER_MANAGER_V1_AUDIT_LIFECYCLE_LIVE_PNL_20261003`) đọc common filled audit và snapshot position dùng chung để tìm từng fill theo coin/loại tín hiệu/order, xem realized net hoặc unrealized PnL phân bổ. DCA cùng close group chỉ tính một lifecycle cho WinRate.
- `observeOnly=true`, `binanceMutation=false`: trang không có action đặt/hủy/đóng lệnh và không đổi entry/size/leverage/SL/TP/DCA/protection. Summary telemetry không tạo route/key matcher hoặc checkbox WHITELIST; default OFF và CLOSED AvgROE `>4%` giữ nguyên. JSON audit cũ không đổi, field thiếu hiển thị null/unconfirmed.

### 2026-10-03 — BTC extreme Discord chỉ cảnh báo bối cảnh

- `BTC_EXTREME_MOVE_DISCORD_V2_CLOSED_15M_1H_4H_20261003` gửi cùng webhook hậu kiểm khi BTC Futures đã đóng giảm/tăng đối xứng ít nhất0,75%/15m, 1,50%/1h hoặc3,00%/4h; có baseline, cooldown60 phút và escalation dedupe.
- Không phải gate, không gọi signed REST, không thay allowLong/allowShort, Binance entry/size/leverage/SL/TP/DCA/protection. API/state additive; không runtime matcher/checkbox WHITELIST, default OFF/CLOSED `AvgROE >4%` giữ nguyên.

### 2026-10-03 — Discord hậu kiểm AI Signal Review 1h+4h không cấp quyền vào lệnh

- `AI_SIGNAL_REVIEW_DISCORD_V2_DUAL_1H_4H_ENTRY_IMPROVEMENT_20261003` xét riêng outcome1h và4h: hướng net dương và midpoint vùng gốc net dương, cải thiện tối thiểu0,10 điểm phần trăm so với vào ngay; dùng immutable sent snapshot và nến15m lịch sử. Dedupe tách horizon, không gửi trùng cùng kỳ.
- Đây là thông báo nhìn sau, `observeOnly=true`, `binanceEligible=false`; không arm zone, không tạo/cancel order, không đổi size/leverage/SL/TP/DCA/protection. Không dùng nó làm runtime matcher hay checkbox WHITELIST; default OFF/CLOSED `AvgROE >4%` của matcher thật không đổi.
- State notifier mới chỉ dedupe/baseline event cũ; API thêm metadata `discord`, JSON order/trade/control cũ không đổi.

### 2026-10-03 — AI Signal Review chỉ nghiên cứu lịch sử

- `/ai-signal-review` version `AI_SIGNAL_REVIEW_V1_CAUSAL_ENTRY_COMPARISON_20261003` dùng thông báo đã gửi + nến lịch sử, hiển thị bảng so sánh entry giả định theo coin/giờ/điểm/BTC; không thêm route, signal tier, card giao dịch hoặc matcher WHITELIST.
- Lợi nhuận mô phỏng theo phần trăm giá (không đòn bẩy) không được chuyển thành CLOSED AvgROE hoặc tự bật checkbox. Policy WHITELIST thật mặc định OFF, chỉ hiện khi CLOSED AvgROE>4% giữ nguyên. API luôn `observeOnly=true`, `binanceEligible=false`.
- Không ảnh hưởng entry/size/SL/TP/protection; journal V2 chỉ giữ dữ liệu trước entry bất biến để đánh giá. Legacy JSON thiếu snapshot được ghi UNKNOWN/NO_ZONE, không migration trade JSON. Chi tiết tại `docs/AI_SIGNAL_REVIEW.md`.

### 2026-10-02 — Khôi phục quyền ghi sau restart / domain public

- UI version `BINANCE_AUTO_CONTROLS_SESSION_RECOVERY_V1_20261002`: khi token trong `localStorage` hết hạn, write `/api/auto-entry-controls` nhận 401 sẽ thử tạo lại phiên local-env; nếu domain public không được phép, trang dùng `orders_creds` đã lưu từ `/orders`, rồi retry đúng một lần.
- Không nới quyền `/api/auth/env` ra Internet và không đưa key/secret vào controls JSON. Nếu không có credential đã lưu, nút Mở quyền dùng `ORDERS_PASSWORD`; password không lưu ở browser, server xác minh signed REST bằng credential `.env` rồi mới cấp Orders session.
- Endpoint password yêu cầu same-origin host/protocol qua reverse proxy, so sánh secret timing-safe và khóa 10 phút sau 5 lần sai. Kiểm tra origin cũ dùng `http` nội bộ đã được sửa để không chặn nhầm POST từ domain HTTPS cùng host.
- Hai input protection chỉ clear sau response lưu thành công. Lỗi giữ nguyên symbol, hiện `KHÔNG LƯU`, không còn tạo cảm giác đã lưu. `US`/`USUSDT` vẫn normalize thành `USUSDT` bằng runtime V6.
- Không đổi route, gate, size, leverage, SL/TP, Discord, thống kê hoặc JSON schema. Không có label/card/key WHITELIST mới; default OFF và CLOSED AvgROE >4% giữ nguyên.

### 2026-10-02 — LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V2_NO_OVERLAP · không cấp quyền entry

- Chart tìm một coin chỉ đọc public Binance Futures depth snapshot và LiqScan 15m
  để vẽ BID/ASK, MARK, MAIN KILL/FAR KILL. MAIN/FAR là proxy quan sát có lifecycle
  riêng, không phải lệnh order book xác thực, signal pass, xác suất hoặc gate.
- V2 chỉ tách scale MAIN/MARK khỏi FAR, bỏ nhãn đè trên thanh và dàn pill thành
  card dễ đọc; dữ liệu, matcher, lifecycle và quyền giao dịch không thay đổi.
- Không gọi signed REST, không gửi Discord, không arm PRIORITY zone, không tạo
  MARKET/LIMIT và không đổi size/leverage/SL/TP/vị thế. Không có label/card
  thống kê runtime mới nên không nối key/checkbox WHITELIST mới; default OFF và
  CLOSED AvgROE>4% giữ nguyên.
- JSON chỉ cộng thêm main/far/mark/score/distance cho chatbot; payload cũ thiếu
  field vẫn tương thích và UI ẩn band tương ứng, không rewrite dữ liệu lịch sử.

### 2026-10-01 — LOCAL_AI_TREND_INFERENCE_PROFILE_V3_INDEXED_RATINGS · route không đổi

- Auto evaluator vẫn dùng đủ Top 10 causal và `qwen3:8b`, chỉ giảm context/output
  xuống 4096/384, batch128. Model chỉ trả rating verdict/strength/path theo index;
  server ghép symbol/side/horizon/lý do/vùng engine. Phân loại PRIORITY/WATCH/
  WAIT/AVOID, 6 check, ranking và thống kê không đổi.
- Model result hợp lệ vẫn được route PRIORITY zone hiện hữu xét 3 USDT×5 khi Auto
  Controls ON. Timeout/lỗi vẫn chuyển deterministic fallback với
  `priorityZoneExecutionEligible=false`; không đổi entry/size/leverage/SL/TP,
  Discord hay vị thế đang mở.
- JSON thêm metadata profile theo kiểu additive; cache cũ thiếu field vẫn đọc,
  không migrate. Không thêm label/card/key WHITELIST; key hiện hữu mặc định OFF và
  chỉ hiện khi CLOSED AvgROE `>4%`.

### 2026-10-01 — LOCAL_AI_HOURLY_BTC_GUIDANCE_V1 · không cấp quyền Binance

- Banner màu trang AI lấy forecast giờ VN + BTC hiện tại rồi liệt kê riêng
  candidate LONG/SHORT của Top 10 AI; chỉ `PRIORITY/WATCH`, không đưa
  `WAIT/AVOID` vào list. Đây là OBSERVE ONLY, không phải gate/pass và không đổi
  entry, margin, leverage, SL, TP, Discord hoặc vị thế hiện hữu.
- Banner/API nối exact key `btc-hourly-forecast:{LONG|SHORT|NEUTRAL}` bằng cùng
  `btcHourlyEntryForecastTradeKey` mà runtime WHITELIST dùng. Key vẫn mặc định
  OFF; checkbox chỉ hiện khi có cohort CLOSED AvgROE `>4%`. Hiện banner không gắn
  observation vào trade và không tự sinh cohort/quyền entry.
- `current.whitelistKey`/`current.whitelistObservation` là additive; JSON/cache cũ
  thiếu field vẫn hiển thị OBSERVE ONLY, không migrate/rewrite và matcher runtime
  tiếp tục fail-closed nếu version observation sai.

### 2026-10-01 — BTC_HOURLY_ENTRY_FORECAST_V1 · không cấp quyền entry

- Card đầu AI đọc audit fill bot 5USDT đã đóng, bỏ DCA/thủ công và ghép BTC causal
  trước entry<=600s để mô tả thiên hướng LONG/SHORT theo giờ VN. qualityScore,
  win frequency, net/PF/AvgROE và BTC-conditioned sample là thống kê lịch sử,
  không phải xác suất, tín hiệu pass hoặc gate runtime.
- Luôn `observationOnly=true`, `affectsBinance=false`: không arm PRIORITY zone,
  không tạo MARKET/LIMIT, không thay entry/size/leverage/SL/TP hay lệnh hiện hữu.
  Cache/API additive, dữ liệu cũ không rewrite; Discord không đổi.
- Key `btc-hourly-forecast:{LONG|SHORT|NEUTRAL}` khớp matcher nhưng OFF mặc định;
  chưa gắn observation vào trade nên không có cohort và checkbox. Nếu có cohort
  sau này, checkbox vẫn chỉ hiện với CLOSED AvgROE >4% và không tự bật route.

### 2026-10-01 — LOCAL_AI_DETERMINISTIC_FALLBACK_V1 · Discord có tín hiệu, Binance fail-closed

- Khi Ollama lỗi load/HTTP/timeout/JSON hoặc model chưa ready, auto evaluation dùng
  engine causal hiện tại để giữ tín hiệu altcoin và gắn nhãn `ENGINE FALLBACK`.
  Dữ liệu là closed retest/pool/early watch + score/volume/vùng + BTC/breadth trước
  thời điểm đánh giá; không dùng PnL tương lai. PRIORITY/WATCH fallback chỉ quan sát.
- Fallback bắt buộc `modelApplied=false`, `deterministicFallback=true` và
  `priorityZoneExecutionEligible=false`. `LocalAiPassMidpointBinanceRunner` bỏ toàn
  bộ candidate fallback và active setup bằng 0; không thể MARKET 1 USDT dù route/
  master đang ON. Model evaluation hợp lệ giữ route/size/leverage/SL/TP hiện hành.
- Không thêm signal key, route, tier/card hoặc WHITELIST. JSON metadata mới additive;
  evaluation cũ thiếu field vẫn tương thích. Tests mock lỗi model và khẳng định
  fallback không arm/gửi Binance thật.

### 2026-10-01 — ORDER_BOOK_NEAR3_WIDE20_V1 · không cấp quyền entry

- Coin Level/AI Local chỉ đọc public Binance Futures depth 1000 level và chia
  `NEAR 0–3%`/`WIDE >3–20%`; nến đóng/trend vẫn là nguồn chính. Coverage thực tế
  được công bố, không nội suy nếu depth không chạm 20%; không dùng CoinGlass book.
- Hoàn toàn OBSERVE ONLY: không signed REST, không thêm matcher/gate/route, không
  đổi entry/size/leverage/SL/TP, không gửi Discord. Không có card/tier mới nên
  không có checkbox WHITELIST mới; default OFF và CLOSED AvgROE >4% giữ nguyên.
- `orderBookProfile` là additive; JSON cũ fallback zone gần/WIDE rỗng và không
  migrate. Test chỉ dùng mock, không gửi lệnh Binance thật.

### 2026-10-01 — TOXIC_TWO_SIDE_MARKET_V1_20261001 · chỉ quan sát

- Page/API mới chỉ xếp hạng rủi ro biến động hai đầu từ dữ liệu market dùng chung,
  market cap cache (fallback CoinGecko giới hạn cho mã cực đoan thiếu cap) và nến
  đóng đã cache; không gọi Binance kline riêng. Tier/score không phải gate, không
  tạo route MARKET/LIMIT, không block coin, không đổi entry/size/leverage/SL/TP.
- Exact keys `toxic-two-side:{EXTREME|HIGH|WATCH|NORMAL}` được nối UI/runtime để
  tương thích thống kê về sau nhưng mặc định OFF. Checkbox WHITELIST chỉ hiện khi
  cohort có CLOSED AvgROE >4%; hiện không có closed stats nên không hiện và không
  thể cấp quyền Binance. Observation sai/thiếu version V1 fail closed.
- Snapshot counts không phải trade stats. JSON cũ không migrate; field ticker mới
  là additive. Test xác nhận key parity/default OFF/biên AvgROE4%, route page/menu
  và `execution.binanceEnabled=false`; không gửi lệnh hoặc Discord test thật.

### 2026-10-01 — IMPULSE_TIME_OR_BTC_MARGIN5_ELSE1_V1_20261001

- Hai key `post-move-impulse / post-dump-no-sell-5m /
  POST_DUMP_NO_SELL_BUY_IMPULSE_LONG / LONG` và `post-move-impulse /
  post-pump-no-buy-5m / POST_PUMP_NO_BUY_SELL_IMPULSE_SHORT / SHORT` giữ nguyên.
  Chưa đăng ký => OFF; giữ switch/master/enabledAt và không tạo WHITELIST/card mới.
- Size entry mới 5 nếu giờ tốt HOẶC BTC cùng hướng, còn lại1USDT. LONG03–06/12–15h,
  SHORT00–09/18–21h VN; BTC UP/LONG và DOWN/SHORT, evaluatedAt<=now tuổi<=120s.
  Thiếu/cũ chỉ dùng nhánh giờ. Chặn payload thiếu/sai decision, giữ stage entry cũ.
- Input margin cố định cho hai route thay bằng hướng dẫn 5/1; endpoint không nhận
  sửa margin cố định. Leverage5/TP10% và SL plan LONG20/SHORT30% ROE giữ nguyên;
  không sửa protection/vị thế cũ. Min-notional ceil tối đa1%, không nâng1 thành5.
- Discord dùng quyết định thật của plan, giải thích giờ/BTC/reason/status; không
  coi submitted là filled. Audit reason lưu metadata, thống kê CLOSED net không đổi.
  JSON legacy giữ dedupe và không giả size khi thiếu decision. WHITELIST hiện hữu
  vẫn default OFF và chỉ hiện closed AvgROE>4%; không thêm label giao dịch mới.
- Tests: test-post-move-impulse-sizing, test-post-move-impulse-binance,
  test-auto-binance-policy, test-auto-entry-controls, test-other-entry-settings,
  hai test post-dump/post-pump Discord và dedicated confirmation (mock).

### 2026-09-27 — DUMP_CAP_REJECTION + RESISTANCE + DISCORD V1 · SHORT chỉ quan sát

- Page đối xứng SHORT dùng nến xả/hồi đỉnh/từ chối đã đóng và MARK live; entry
  chỉ hiện khi vùng kháng cự causal, nến xác nhận, freshness và R:R ròng≥1,5 cùng
  đạt. Discord gửi một lần sau live pass, không gửi từ stage thô.
- **Không có Binance route/executor**, không MARKET/LIMIT, không đổi size,
  leverage, SL/TP hoặc vị thế/lệnh đang mở. Delivery counts không phải stats lệnh.
- 60 key exact `dump-cap:*` + `dump-resistance:*` được nối UI/runtime, mặc định OFF,
  checkbox chỉ hiện CLOSED AvgROE>4%; matcher chỉ SHORT + observation đúng version.
  JSON cũ thiếu metadata không match và không migrate. Webhook/state notifier tách
  riêng; API chỉ trả configured/counts, không trả secret.

### 2026-09-27 — PUMP_BASE_SUPPORT_DISCORD_V1_20260927 · chỉ cảnh báo

- Server kiểm tra plan support đã xác nhận bằng snapshot≤90s + MARK≤15s + vùng
  entry + stop chưa phá + R:R live≥1,5 rồi mới gửi Discord. Dedupe mỗi
  symbol/timeframe/confirmedAt và không replay setup cũ sau restart.
- Không có route Binance, không MARKET/LIMIT, không đổi size/leverage/SL/TP.
  Không thêm label/card/WHITELIST hoặc stats giao dịch; 40 key support hiện hữu
  vẫn OFF mặc định và chỉ hiện với CLOSED AvgROE>4%. JSON trade cũ không đổi;
  state delivery mới độc lập, versioned và fail-closed.

### 2026-09-27 — PUMP_BASE_SUPPORT_V1_20260927 · chưa cấp lệnh thật

- Hỗ trợ/entry trên pump-base chỉ quan sát từ nến đóng, vùng causal và giá MARK
  còn hợp lệ; retest giữ vùng rồi nến tiếp vượt high, R:R≥1,5 (phí giả định0,12%).
  Không đổi Binance/entry thật/size/SL/TP và không có route đặt lệnh. Discord V1
  ở mục trên chỉ là thông báo sau khi MARK live pass.
- 40key `pump-support:{5m|15m|1h|4h|1d}:{READY|WAIT_RETEST|WAIT_CONFIRM|BROKEN|NO_ROOM|WAIT_LIVE|STALE|NO_SUPPORT}`.
  UI và runtime matcher chung; mặc địnhOFF. Checkbox chỉ hiện CLOSED AvgROE>4%,
  hiện chưa có trades nên ẩn. Số card là số dòng đang xem, không thống kê lệnh.
- Matcher chỉ LONG có pumpSupportObservation.version đúng V1; dữ liệu trước
  entry không lấy PnL. JSON cũ thiếu observation/version không match và không
  migrate. Test40key+defaultOFF+ngưỡng4%+JSON cũ, causal và live invalidation.


### 2026-09-27 — PUMP_BASE_RECOVERY_V1_20260927 · WHITELIST quan sát

- Trang `/pump-base-recovery` dùng OHLCV đã đóng, baseline20 trước nến bơm,
  5 timeframe 5m/15m/1h/4h/1d. Phân loại AT_BASE, RECOVERING, VOLUME_RECOVERY,
  WEAKENED theo quy tắc trong CURRENT_DECISION_AND_EMA_RULES, không theo PnL.
- 20 key `pump-base:{timeframe}:{stage}` khớp UI và `liquidLiveCardKeysOfTrade`;
  chỉ nhận LONG có snapshot `pumpBaseObservation.version` đúng version và
  interval/stage hợp lệ. JSON cũ/thiếu field/version không match, không migrate.
- WHITELIST OFF mặc định. Checkbox chỉ hiện khi closed AvgROE>4%; hiện chưa có
  lệnh đóng cùng nhóm nên không hiện. Số case/coin là thống kê quan sát, không
  phải số lệnh, không thay cho AvgROE và không cấp quyền Binance.
- Không thêm producer/route đặt lệnh, không đổi gate entry/size/SL/TP hiện có,
  không gửi Discord; tests xác minh mọi key, defaultOFF, JSON cũ và ngưỡng4%.


### 2026-09-26 — Bỏ qua TP/SL tự gỡ tại +15% hoặc −25% ROE · V4

- Runtime version `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V4_AUTO_RESUME_ROE15_OR_NEG25_20260926`. Dữ liệu causal là ROE live hữu hạn của vị thế Binance đang mở, tính từ average entry, MARK và leverage. Exact symbol đang nằm trong `protectionExclusions` được xóa/persist khi `ROE >= +15%` hoặc `ROE <= -25%`; `+14,999%` và `-24,999%` vẫn giữ ngoại lệ. LONG/SHORT dùng cùng hai biên.
- Đây là thay đổi vòng đời của ngoại lệ, không phải signal/tier/gate entry. Sau khi gỡ, TP/SL scanner, SL trail/profit-lock và Fast Wave được phép quản lý lại theo policy đang có. Nó không tự MARKET-close, không đổi entry/margin/size/leverage và không tự đặt một mức TP/SL riêng; ở nhánh âm, protection được bù ở lượt scanner hợp lệ kế tiếp. Save lỗi giữ exclusion fail-safe. Close/reversal vẫn reset như trước.
- Không đổi thống kê W/L/PF/AvgROE, Discord hoặc route entry; không thêm label/card nên không thêm WHITELIST. Policy checkbox hiện hữu vẫn default OFF và chỉ hiện khi CLOSED AvgROE `>4%`.
- JSON cũ tương thích nguyên mảng `protectionExclusions`; chỉ nâng `protectionExclusionVersion`, không migrate/rewrite trade JSON. Test bao phủ hai biên, NaN/excluded=false, xóa atomically qua restart, thứ tự callback trước protection handler và nội dung UI; không gọi Binance thật.

### 2026-09-26 — Bỏ qua TP/SL tự gỡ tại +15% ROE · V3

- Runtime version `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V3_AUTO_RESUME_ROE15_20260926`. Exact symbol trong `protectionExclusions` tự được xóa/persist khi ROE live của vị thế đang mở >=15%, cho cả LONG/SHORT. Threshold dùng so sánh inclusive; thiếu/NaN hoặc dưới15 không gỡ.
- Sau khi gỡ, profit-lock chạy tiếp trong cùng tick và các protection scanner trở lại bình thường; thao tác auto-resume không tự đặt MARKET, không đổi entry/size/leverage hay tự định nghĩa TP/SL. Mức lock và các exception của policy profit-lock cũ giữ nguyên. Save lỗi thì giữ khóa fail-safe.
- Close/reversal vẫn reset, giảm vị thế/DCA không reset trước15%. UI và confirm giải thích +15% ROE; không có card/WHITELIST/stat mới. JSON cũ tương thích nguyên mảng; không migrate lịch sử. Server đã reload và API runtime trả V3; nếu Binance rate gate đang block thì chờ position monitor có ROE trở lại, không fail-open.

### 2026-09-26 — TP âm sau 3h về entry · V2 (chờ restart)

- Policy `BINANCE_NEGATIVE_TP_TO_ENTRY_AFTER_3H_V2_20260926` dùng fill timestamp/orderId và position hiện tại sau entry, không thay dữ liệu/gate phát tín hiệu. Tuổi >=3h và ROE<0 cho cả LONG/SHORT; không ảnh hưởng entry/size/SL, không thêm quyền mở lệnh hoặc WHITELIST/card thống kê.
- Cap TSL và protection exclusion giữ nguyên. Missing/adopted fill metadata không kích hoạt, không lấy first-seen thay fill. DCA tracking hiện tại ghi lại fill mới và bắt đầu lại tuổi. Alias AFTER_8H config/import được giữ; AFTER_3H config ưu tiên; không migration JSON hoặc đổi thống kê lịch sử.
- TP mới là LIMIT close ở entry theo tick (one-way reduceOnly, hedge positionSide). Age branch giữ SL/opening LIMIT/chiều đối diện, chỉ dọn TP cũ sau khi replacement thành công. PnL ròng vẫn có thể âm vì phí/funding. Không chờ FastWave khi đủ tuổi; rate gate/cooldown/exchange failure vẫn có thể trì hoãn thao tác.
- Test policy + executor mock, không thao tác tài khoản thật. Chưa restart bot; bản đang chạy không tự nhận source này.

### 2026-09-26 — BTC Session Watch V1 là OBSERVE ONLY

- Trang `/btc-session-watch.html` không có submit MARKET/LIMIT, không executor, không ảnh hưởng lệnh/size/SL/TP đang chạy. Tín hiệu UI dùng vùng retest Coin Level nến đóng + xu hướng BTC health1h/4h hiện có (có thể gồm nến đang chạy) + socket, không là bản live của nghiên cứu55 ngày.
- Reserved whitelist keys exact `btc-session:{LONG|SHORT}:{NIGHT|MORNING|OTHER}`; `sessionCardKey` dùng cho UI và runtime matcher, whitelist V18. Default OFF; JSON trade cũ không có `btcSessionObservation` exact version V1/side/window sẽ không match. Không thêm default keys hoặc rewrite state cũ.
- Nối UI checkbox theo `installLiveCardWhitelistUi`; chỉ hiện với closed AvgROE >4%, không suy từ source entryScore hoặc return nghiên cứu. Chưa có sổ closed riêng cho nhóm này, do đó hiện ẩn checkbox, không nhận quyền Binance. Stats count/rank là quan sát chứ không hiệu quả giao dịch. Test `test-btc-session-watch.mjs` kiểm boundary4%, closed0, key parity, metadata cũ, no order endpoint.

### 2026-09-26 — SAGAUSDT 15m closed rejection SHORT 6 USDT

- Thêm checkbox exact `extreme-short-squeeze-saga-15m /
  FOLLOW_REJECTION_CLOSED / SHORT`, matcher bắt buộc SAGAUSDT và nến 15m đã đóng.
  Mặc định catalog 6 USDT margin ×5, TP +15% ROE; SL executor -30% ROE từ full fill.
  Máy hiện tại master ON và route ON từ `2026-09-26T05:07:50.471Z`.
- Chỉ nến follow thứ 1–3 trả lại >=50% cú spike, không tạo higher high, event <=90
  giây và sau `enabledAt` mới được xét. Mark drift <=0,5%, không position/entry order,
  cooldown 4 giờ; không DCA/replay. Nến live, timeframe/symbol khác và two-side sweep
  không dùng route này.
- Route/state là additive và không thay setting ba route Extreme Squeeze cũ. Không có
  performance card/WHITELIST mới; thống kê dựa trên fill thật và policy CLOSED
  AvgROE >4% mặc định OFF không đổi.

### 2026-09-25 — Dành quota REST cho vị thế và TP/SL

- `BINANCE_INCOME_QUERY_COORDINATOR_V1_BUDGETED_SERIAL_CACHE_20260925` chuyển phần
  thống kê `/fapi/v1/income` sang priority thấp, single-flight, tuần tự, tối đa bốn
  request/job, gap 3 giây, cache/cooldown 15 phút và reserve 600 weight. Khi thiếu
  quota, stats stale/fail-closed; không tranh request với order/protection.
- Đây không phải route/checkbox hoặc WHITELIST. Không đổi master, matcher, enabledAt,
  entry, size, leverage, SL/TP hay vị thế/lệnh cũ. JSON rate-gate chỉ thêm field
  `incomeQuery` optional; các client cũ tương thích.

### 2026-09-25 — Route 1h/4h chỉ vào case thuộc bốn stage ưu tiên

- Versions LONG/SHORT 1h và LONG 4h nâng lên `PRIORITY_TOUCH V2`; thêm exact route
  `post-pump-volume-fade-4h / SHORT_IDEAL_ENTRY_TOUCH / SHORT` version
  `POST_MOVE_IDEAL_SHORT_4H_PRIORITY_TOUCH_MARKET_10USDT_V1_20260925`. Policy V36,
  catalog V11 (27 route) và controls V22.
- Checkbox runtime khớp exact matcher. LONG chỉ cho `LONG_FRESH_REVERSAL` hoặc
  `LONG_FIRST_STRONG_CANDLE`; SHORT chỉ cho `SHORT_NEAR_TOP` hoặc
  `SHORT_FIRST_STRONG_CANDLE`. Route mới seed OFF và được bật explicit; lưu input
  không tự bật route. Các route cũ giữ nguyên enabledAt và giá trị đã lưu.
- 1h/4h vẫn cần crossing vào vùng, mark live còn trong vùng, touch <=60 giây, drift
  <=0,5%, không position/entry-order cùng coin. LONG 1h $5; SHORT 1h/LONG 4h/SHORT
  4h $10, đều 5x; LONG TP10/SL20, SHORT TP6/SL30 ROE. Không DCA/replay.
- Không thêm performance card hay checkbox WHITELIST; policy chỉ hiện WHITELIST khi
  CLOSED AvgROE >4% và mặc định OFF giữ nguyên. JSON/state additive; thiếu stage key
  fail-closed, không migrate/backfill.

### 2026-09-25 — Bốn giai đoạn ưu tiên 15m vào MARKET 2 USDT, trần 15 vị thế

- Version `POST_MOVE_PRIORITY_STAGE_15M_MARKET_2USDT_MAX15_V1_20260925`. Hai
  checkbox exact mới là `LONG_PRIORITY_STAGE_15M/LONG` trên stream hậu xả 15m và
  `SHORT_PRIORITY_STAGE_15M/SHORT` trên stream hậu bơm 15m. Catalog seed OFF; máy
  hiện tại bật theo yêu cầu. Chỉ stage key LONG fresh/first recovery hoặc SHORT near
  top/first sell được matcher runtime chấp nhận; extended/watch/weak không có quyền.
- Bật/restart baseline candidate đang có; chỉ tín hiệu mới, <=60 giây, sau enabledAt,
  drift mark <=0,5%, không position/entry order cùng coin mới MARKET. Dedupe một lần
  mỗi anchor; tài khoản >=15 vị thế mở bị chặn và payload bắt buộc
  `maxOpenPositions=15`.
- Mặc định margin 2 USDT ×5; LONG TP +10% ROE/SL -20%, SHORT TP +6%/SL -30%, full
  fill mới neo protection. Margin/leverage/TP có input exact route như nhóm other;
  việc lưu không tự bật route. Không DCA hoặc sửa position/order cũ.
- Đây là route thực thi có checkbox mặc định OFF, không phải performance card nên
  không thêm WHITELIST mới; policy CLOSED AvgROE >4% giữ nguyên. Controls/state/audit
  JSON additive, dữ liệu cũ thiếu `moveStage` fail-closed, không backfill/replay.

### 2026-09-25 — Giai đoạn nhịp giá hậu xả/hậu bơm và exact route

- `POST_MOVE_STAGE_UI_DISCORD_V1_20260925` chỉ thêm field/badge `moveStage` vào hai
  snapshot, bảng LONG/SHORT và Discord chạm vùng. Các giá trị mới sập/sát đỉnh, nến
  mạnh đầu tiên, đã chạy xa, đang theo dõi hoặc yếu không phải matcher/gate Binance.
- Chỉ các exact route 15m/1h/4h được phép đọc bốn key ưu tiên; nhãn ở consumer khác
  không tự cấp quyền. Không thêm checkbox WHITELIST; policy CLOSED AvgROE >4%
  và mặc định OFF giữ nguyên. Entry, margin, leverage, TP/SL theo từng route phía trên.
  Field JSON optional additive, dữ liệu
  cũ thiếu field vẫn đọc được và không replay alert/lệnh.

### 2026-09-22 — Ưu tiên runtime Liquid Flow V2, không đổi quyền lệnh

- `LIQUID_FLOW_V2_STARTUP_PRIORITY_V1_20260922` nạp Liquid Flow V2 trước và dời việc parse các paper store lịch sử sang hàng tuần tự sau 90 giây; PM2 có heap 12 GiB/restart 14 GiB. Pump WAL có fallback archive qua filesystem khác nhưng chỉ tác động paper state. Việc này không đổi master/route, enabledAt, signal gate, entry/size/leverage/SL/TP, position/order hiện tại hoặc matcher Binance. Recommended source-file reconciliation mặc định OFF chỉ là recovery lịch sử; source-open live không đổi. Không thêm label/card/WHITELIST, không migrate JSON và không phát lại signal cũ.

### 2026-09-21 — Trạng thái nến Discord Coin Level không đổi quyền Binance

- `COIN_LEVEL_ENTRY_WATCH_DISCORD_V7_CANDLE_STATUS_20260921` chỉ hiện trạng thái nến từ `retestAt` trong Discord: chưa retest thì nhắc có thể xét LIMIT tại entry; đã retest thì nhắc đủ trạng thái nến để xét MARKET theo route. Đây không phải gate/quyền lệnh và không xác nhận đã đặt/khớp; mọi master/route, enabledAt, tuổi/drift, no-position/no-order, entry/size/leverage/SL/TP và pending LIMIT giữ nguyên. Không thêm label/card/WHITELIST, không đổi thống kê hoặc JSON cũ và không replay tin đã gửi.

### 2026-09-21 — LONG sớm Coin Level không phải route Binance

- `COIN_LEVEL_EARLY_LONG_WATCH_V1_20260921` chỉ thêm watch UI/API từ nến đóng/fresh trước entry: sát đỉnh 12 nến 15m (−0,8%/+0,35%), 15m UP + 1h UP/MIXED, EMA13/25 + đáy nâng, volume/taker mua đủ và guard không đuổi theo ATR. Vùng phá/retest và vô hiệu chỉ tham khảo; không Discord/lệnh, không đổi confirmed gate, size/leverage/SL/TP/fill stats. Không thêm label/card route/WHITELIST; matcher `RETEST_LONG_READY/RETEST_SHORT_READY`, seed OFF, policy closed AvgROE >4% và JSON cũ giữ nguyên.

### 2026-09-21 — SHORT sớm Coin Level không phải route Binance

- `COIN_LEVEL_EARLY_SHORT_WATCH_V1_20260921` chỉ thêm watch UI/API dùng nến đã đóng/fresh 5m/15m/1h/4h: pump ≥8%, rời đỉnh 0,5–6%, mất EMA13 5m + lower-high/râu trên, volume ≥50k USDT và ≥1,3× median20, taker bán ≥52%. Vùng hồi EMA13 ±0,15% và vô hiệu trên đỉnh +0,25% chỉ tham khảo; không gửi Discord hoặc lệnh. Không đổi classifier confirmed SHORT, entry/size/SL/TP, fill stats, route matcher `RETEST_SHORT_READY`, checkbox WHITELIST seed OFF và chỉ hiện khi closed AvgROE >4%. Không thêm label/card stats/route. API chỉ thêm mảng/count, JSON cũ không migrate/rewrite và không replay.

### 2026-09-21 — Hủy LIMIT Coin Level khi breakout gốc vô hiệu

- `COIN_LEVEL_PENDING_LIMIT_INVALIDATION_V1_20260921` + executor `COIN_LEVEL_ENTRY_WATCH_LIMIT_3USDT_V3_INVALIDATION_20260921`: cleaner 35 giây xét **chỉ** pending `clel_` có metadata exact breakout trong attempt JSON mới. Dữ liệu trước entry/classifier gốc không đổi: nến 5m/15m/1h/4h đã đóng, Trend Score ±12, 15m/1h đồng hướng, close15m phá 12 nến. Sau submit phải có nến 5m mới và đủ bốn cache fresh/liên tục; hai lượt `INVALID` cùng nến/lý do mới hủy. Mất dữ liệu, lỗi analyzer hoặc rớt khỏi top30 không hủy; vẫn có TTL 45 phút và startup expiry cũ.
- Chỉ hủy phần LIMIT chưa khớp sau khi xác nhận trạng thái Binance `NEW/PARTIALLY_FILLED`. Partial fill giữ vị thế, refresh position và thử áp TP/SL theo plan; thiếu plan thì hoãn **hủy sớm** và báo lỗi. Không sửa TP/SL đang có, không đụng DCA, MARKET hoặc route khác; entry 3 USDT margin, leverage/TP route và SL −30% ROE giữ nguyên. Daily stats chỉ tính fill thật, không tính cancel. Exact matcher và key UI `RETEST_LONG_READY/SHORT_READY` không đổi, checkbox seed OFF và WHITELIST closed AvgROE >4% giữ nguyên; không thêm card/label. Attempt cũ thiếu metadata chỉ dùng expiry cũ, không migrate/rewrite; candidate/API JSON cũ không đổi.

### 2026-09-20 — Coin Level LIMIT 3 USDT tại entry dự kiến

- `COIN_LEVEL_ENTRY_WATCH_LIMIT_3USDT_V2_20260920`: cùng hai checkbox route/label cũ (key UI khớp matcher runtime `RETEST_LONG_READY/LONG`, `RETEST_SHORT_READY/SHORT`; seed OFF). Không tạo card thống kê/WHITELIST mới; policy WHITELIST chỉ hiện khi closed AvgROE >4%, mặc định OFF giữ nguyên. Input causal trước entry là candidate Coin Level V3 từ nến đóng/fresh 5m/15m/1h/4h, Trend Score ±12, 15m/1h đồng hướng và phá biên 12 nến. Candidate chưa retest + close5m/mark qua giá dự kiến 0,15–5% + signal ≤90 giây, sau thời điểm bật route và sau khởi động thì xét GTC LIMIT 3 USDT margin tại entry; LONG BUY dưới mark, SHORT SELL trên mark. Binance REST kiểm lại tick/mark trước submit; không position/open-entry cùng coin, cooldown4h/max30 vị thế. Lệnh chờ hủy sau45 phút, kể cả nếu expiry chung tắt. Có retest5m đóng thì nhánh MARKET margin route (mặc định1 USDT) giữ nguyên; cả hai dùng dedupe chung.
- LIMIT dùng leverage và TP ROE route, SL −30% ROE, bảo vệ chỉ sau full fill; partial fill không được mô tả là đã có TP/SL. Stats chỉ tính fill thật, không tính LIMIT chờ. Discord/bảng không xác nhận Binance đã nhận lệnh. Entry Score/T1–T3 chỉ đánh giá, không là gate. Policy `LIVE_CARD_LIQ_FLOW_COIN_LEVEL_LIMIT_V30_20260920`, Discord V5. JSON control/snapshot/audit cũ không migrate/rewrite; thiếu entry/timestamp/version/mark fail-closed, state attempts cũ vẫn đọc, LIMIT mới dùng `clel_`.
- Với partial fill, cleaner 35 giây hủy remainder `clel_` và thử đặt TP/SL cho vị thế đã khớp; nếu không còn plan trong bộ nhớ hoặc bảo vệ lỗi, log cảnh báo cần kiểm tra thủ công. Không khẳng định protected cho tới khi Binance xác nhận.
- Nếu process restart, cleaner hủy LIMIT `clel_` từ process trước để lệnh chờ không khớp sau khi plan TP/SL in-memory đã mất; LIMIT route khác không bị đổi TTL.

### 2026-09-20 — Coin Level retest 5m vào MARKET 1 USDT ×5

- Hai row ở “Các luồng khác” dùng source/stream `coin-level-entry-watch/closed-mtf-retest`, exact label có sẵn `RETEST_LONG_READY/LONG` và `RETEST_SHORT_READY/SHORT`. Catalog seed OFF; theo yêu cầu hiện tại cả hai row đã được bật tường minh, master đang ON, margin `1 USDT`, leverage `5x`, TP `+10% ROE`; SL cố định `-30% ROE` và SHORT không bị policy TP-only loại SL.
- Dòng bảng mới chỉ qua breakout/breakdown 15m vẫn chờ. Executor chỉ nhận retest5m đã đóng, phát sinh sau `enabledAt`, mới `<=90s`, mark cách midpoint entry dự kiến không quá `0,5%`, không position/open-entry cùng symbol và ngoài cooldown4h. MARKET có full-fill TP/SL re-anchor, min-notional ceil trần +1%, durable dedupe; không replay, DCA hoặc sửa vị thế cũ.
- Daily stats lấy fill thật theo route; không có paper/performance card mới và không thêm checkbox WHITELIST. Candidate/API/state chỉ thêm field/file additive; JSON cũ thiếu version/retest fail-closed.

### 2026-09-20 — Coin-level giá LONG/SHORT dự kiến là UI-only (lớp preview từng coin)

- `COIN_LEVEL_ENTRY_PREVIEW_V1_20260920` chỉ hiển thị trung điểm và biên vùng của `recommendation.longPlan/shortPlan.entryZone`; không phải giá đặt lệnh, không gọi executor. Nguồn là phân tích nến và vùng sẵn có trước hiển thị; điều kiện vẫn chờ 15m đóng/retest 5m, stale bị ẩn. Không đổi size, entry, SL, TP hoặc dữ liệu JSON cũ; không có W/L/PnL/AvgROE/card WHITELIST nên policy checkbox chỉ hiện closed AvgROE>4%, OFF mặc định giữ nguyên.

### 2026-09-20 — Bộ lọc Discord sweep tổng proxy >100M không phải gate Binance

- `LIQSCAN_SWEEP_SIDE_PROXY_GT100M_V1_20260920`: gửi Discord MAIN KILL/reference chỉ khi tổng proxy của phía bị quét hiện tại >100M; không phải số coin, USD thanh lý thật hoặc khối lượng riêng vùng. Detector và executor giữ nguyên, bộ lọc được gọi sau xử lý Binance nên có thể không có tin sweep Discord dù route cũ đã xử lý lệnh.
- Không đổi entry/size/leverage/DCA/SL/TP, matcher, công tắc hay policy WHITELIST. Reference vẫn OBSERVE ONLY; MAIN KILL không bị đổi thành OBSERVE ONLY. Không card/stat PnL mới. JSON bổ sung `liquidityAtSweep` cho input lúc quét; JSON cũ fallback tổng cùng phía có sẵn, không sửa lịch sử. `sent` chỉ đếm POST thành công, event filter được acknowledge nhưng không giả là đã gửi.

### 2026-09-20 — SQUEEZE_RATIO_WATCH_V1_20260920 không phải route Binance

- `RATIO` (cam) / `RATIO_OI` (tím) là cấp cảnh báo của feed `/api/squeeze-ratio-watch`, không phải signal matcher giao dịch. Dữ liệu trước alert: closed15m breakout + volume, xu hướng closed1h, global account L/S giảm, OI số lượng tăng cho tier tím; xem CURRENT_DECISION_AND_EMA_RULES để biết ngưỡng/as-of.
- List ở coin-level-analysis chỉ lịch sử cảnh báo và trạng thái gửi, không có W/L/PnL/AvgROE/card thống kê mới; không cấp WHITELIST, không tự bật Binance, không ảnh hưởng entry/size/SL/TP. Không sửa policy WHITELIST closed AvgROE>4%, checkbox mặc định OFF của các card thực thi hiện có. State JSON riêng additive, không migrate JSON cũ.

### 2026-09-18 — MAIN KILL đỏ SIÊU LỚN: SHORT trên / LONG dưới

- Hai công tắc exact mới ở nhóm “Các luồng khác”: `LIQSCAN_MAIN_KILL_UPPER_SWEEP_SHORT/SHORT` và `LIQSCAN_MAIN_KILL_LOWER_SWEEP_LONG/LONG`, source `liqscan-main-kill-sweep`, stream `background-top400`. Mỗi row có input margin, leverage, TP riêng; mặc định MARKET `1 USDT margin ×5`, TP `+10% ROE`, SL cố định `−30% ROE` từ average full-fill. Quantity được ceil vừa đủ min-notional trong trần +1% để tránh `-4164` do lot step.
- Chỉ event Discord đỏ `SIÊU LỚN` có cả `volumeTier=EXTREME/rank5` và proxy MAIN KILL `>=50M USDT` mới có quyền gọi executor. Quét phía trên/killed-short → SHORT; quét phía dưới/killed-long → LONG. Các tier nhỏ vẫn gửi Discord nhưng OBSERVE ONLY.
- Trước submit phải có master+route ON, detectedAt sau enabledAt và tuổi `<=90s`, mark drift `<=0,5%`, không vị thế/open entry order cùng coin và ngoài cooldown 4h. Durable attempt chặn replay/double-submit; restart không replay tín hiệu cũ, không DCA, không sửa lệnh đang có. SHORT giữ SL nhờ exemption V5.
- Daily stats dùng Binance fill/close thật theo exact route. Không tạo performance card/WHITELIST mới; JSON controls cũ chỉ được bổ sung hai row, mặc định seed OFF, settings cũ giữ nguyên. Attempts nằm ở file mới và không backfill lịch sử.

### 2026-09-18 — Scanner nền LiqScan Top 400 chỉ gửi Discord

- `LIQ_SCAN_SCORE65_BACKGROUND_TOP400_V1_20260918` tự quét cache15m Top400 mỗi30s nên không cần mở/search coin. Score `>=65` gửi Discord theo ABOVE/BELOW và state dedupe riêng. Sau restart chỉ warm-up 60 nến cho symbol còn thiếu theo batch rate-limited; scan định kỳ không REST từng coin.
- Scanner nền **không gọi executor Binance**, kể cả score `>80`. Hai route Binance hiện hữu vẫn giữ strict `>80` và chỉ nhận lifecycle explicit `/coin-level-analysis`; controls/margin/leverage/TP/SL không đổi.
- Không thêm controls row/card/WHITELIST, không sửa order/position/protection. State background là JSON mới additive, không replay/backfill dữ liệu cũ.

### 2026-09-18 — LiqScan Discord >=65; Binance vẫn >80

- Discord LiqScan phát từ `score >=65` và có một alert nâng tầng khi cùng episode lần đầu vượt strict `>80`. Đây không phải thay đổi authorization giao dịch.
- Hai exact route Binance `LIQSCAN_HIGH_SCORE_ABOVE_LONG/LONG` và `LIQSCAN_HIGH_SCORE_BELOW_SHORT/SHORT` vẫn yêu cầu strict `score >80`; score 65–80 không gọi executor. Margin/leverage/TP input, SL theo hướng, enabledAt/freshness/drift/cooldown/dedupe và trạng thái ON/OFF giữ nguyên.
- Không thêm controls row/card/WHITELIST, không sửa position/order/protection cũ. JSON Discord thêm tier flags và đọc state V2 theo kiểu additive, không replay/backfill.

### 2026-09-16 — Pump/flush/reclaim Discord hai chiều

- `PUMP_FLUSH_RECLAIM_15M_LONG_READY/LONG` và `DUMP_SQUEEZE_REJECT_15M_SHORT_READY/SHORT` thuộc scanner Discord `PUMP_FLUSH_RECLAIM_BIDIRECTIONAL_DISCORD_V3_DEEP_BASE_GATES_20260916`, dùng closed 15m + closed 5m. V3 siết retrace/context/close-quality và chặn giá đã hồi sát extreme, nhưng vẫn **OBSERVE ONLY**.
- Không có row/công tắc `binance-auto-controls`, không MARKET/LIMIT, margin, leverage, DCA, TP hoặc SL; không ảnh hưởng lệnh/position hiện tại. Operational log không phải performance card nên không tạo WHITELIST; nếu sau này nâng thành card phải mặc định OFF và chỉ hiện khi CLOSED `AvgROE >4%`.
- State dedupe Discord là file additive độc lập; controls/fills cũ không migrate, rewrite hoặc replay.

### 2026-09-16 — LiqScan high-score >80

- Hai công tắc exact mới trong nhóm “Các luồng khác”: `LIQSCAN_HIGH_SCORE_ABOVE_LONG/LONG` và `LIQSCAN_HIGH_SCORE_BELOW_SHORT/SHORT`, source `liqscan-high-score`, stream `coin-level-analysis`. Mỗi route có input margin, leverage và TP riêng; mặc định catalog `5 USDT margin ×5`, TP `+15% ROE`. SL cố định theo hướng: LONG `−20%`, SHORT `−30%`.
- Chỉ event strict `score >80` mới, snapshot `<=90s`, sinh sau enabledAt, mark drift `<=0,5%`, không position/open-entry-order và ngoài cooldown 4h mới được MARKET. Một episode chỉ submit một lần; Discord/restart không replay. OFF vẫn gửi Discord chuyên dụng và ghi trạng thái OFF, không đặt lệnh.
- Daily stats đếm fill Binance thật theo exact route; JSON cũ giữ nguyên, catalog seed hai row mới OFF và thao tác triển khai đã bật rõ cả hai row theo yêu cầu này (master đang ON). Không tạo WHITELIST/card hiệu suất mới và không sửa order/protection đang mở.

### 2026-09-15 — MANUAL_SHORT_NEW_FILL_SL30_V1_20260915

- SHORT vào tay mới dùng SL −30% ROE từ average full-fill: `SL = entry × (1 + 0,30/leverage)`. Cutoff mới là `2026-09-15T03:55:29.563Z`; chỉ order được tạo và full-fill sau mốc mới đủ điều kiện. TP/size/leverage giữ nguyên.
- Không sửa vị thế/TP/SL hiện tại, order cũ, DCA vị thế cũ, LONG hoặc bot entry. Field JSON `manualShortSl50` được giữ để tương thích, nhưng chỉ version SL30 mới được apply/recover; version SL50 cũ bị fail-closed. Test dùng mock Binance, không gửi lệnh thật.

### 2026-09-14 — Gate hồi lớn cho RETEST_SHORT_READY

- Công tắc vẫn là exact route `htf-deep-base-ready / htf-deep-base-15m / RETEST_SHORT_READY / SHORT`; không thêm/đổi route và không tự thay trạng thái ON/OFF. Từ V4, route chỉ nhận READY có đủ bằng chứng causal **sau EARLY**: hồi `>=1,5%` + `>=1,25 ATR15m` về neckline/EMA13 rồi giảm lại `>=1%` + `>=0,75 ATR15m`. Rebound trước EARLY, event cũ hoặc event thiếu metric bị chặn fail-closed.
- Chỉ áp dụng entry mới sau reload; `5 USDT margin x5`, TP `+15% ROE`, SL `-30% ROE`, tuổi/drift/cooldown/dedupe/no-position/no-order giữ nguyên. Không sửa lệnh ZRX hay bất kỳ position/protection hiện tại; LONG không đổi.
- Không có label/card mới nên không thêm WHITELIST. Audit dùng exact label cũ và reason thêm rebound/fade; JSON thêm field optional, không backfill/replay/rewrite dữ liệu cũ.

### 2026-09-13 — HTF deep-base FAST RETEST 5m từ nguồn 1h/4h

- Không thêm công tắc mới: FAST READY 5m dùng đúng hai route `RETEST_LONG_READY/LONG` và `RETEST_SHORT_READY/SHORT` bên dưới. Discord/audit ghi riêng nguồn cấu trúc 1h hoặc 4h và `confirmation=5m`; FAST và READY 15m dùng chung episode dedupe để không nhân đôi lệnh.
- EARLY vẫn OBSERVE ONLY. Khi route hiện hữu ON, closed-5m fast retest hợp lệ có cùng cấu hình MARKET `5 USDT margin ×5`, TP `+15% ROE`, SL `−30% ROE`; không đổi trạng thái công tắc hay position/order cũ. Thiếu cache 5m thì chờ nhánh closed-15m cũ.

### 2026-09-12 — HTF deep-base RETEST READY LONG/SHORT

- Hai checkbox exact `RETEST_LONG_READY/LONG` và `RETEST_SHORT_READY/SHORT` thuộc source `htf-deep-base-ready`, stream `htf-deep-base-15m`; seed mặc định OFF, có `enabledAt` riêng và cùng chịu khóa tổng. Chúng không thay thế WHITELIST thống kê CLOSED `AvgROE >4%`.
- Khi ON, chỉ READY từ nến 15m vừa đóng `<=90s`, phát sinh sau `enabledAt`, mark drift `<=0,5%`, không position/entry-order cùng symbol và không nằm trong cooldown 4 giờ mới có quyền MARKET `5 USDT margin ×5`. TP `+15%` và SL `−30% ROE` neo average full-fill; source này được miễn TP-only qua `BINANCE_BOT_SHORT_TP_ONLY_HTF_EXEMPT_V2_20260912`, không DCA/replay/sửa lệnh cũ.
- UI ghi rõ cấu hình cố định và mô tả case LONG sập sâu→đáy→retest cùng case SHORT bơm sâu→đỉnh→retest. Audit fill/close/CSV tách bằng exact label để tính entry/PnL ngày; chưa có lịch sử đủ để kết luận hiệu suất.

### 2026-09-11 — PEAK_ZONE_SHORT_WATCH 5m

- Route mới `extreme-short-squeeze / PEAK_ZONE_SHORT_WATCH / SHORT` chỉ nhận event 5m LIVE đã trả lại 15–25% nhịp spike, cách rolling high tối đa 2%, râu trên tối thiểu 20% và không có high mới trong ít nhất 15 giây. Higher high reset thời gian; 15m không có quyền Binance.
- SHORT MARKET `$2 margin ×5` (notional `$10`), TP `+15% ROE`, SL `−30% ROE` theo average full-fill; mark drift tối đa 0,5%, tick tối đa 30 giây, no-position/no-order và cooldown 4 giờ. Chỉ event bắt đầu sau enabledAt; không replay CATI hoặc sửa lệnh cũ.
- Controls seed mặc định OFF và được bật riêng sau yêu cầu này. Audit CSV ghi exact label để đo về sau; chưa có mẫu đóng, không có card thống kê/WHITELIST mới. JSON cũ không cần migrate.

### 2026-09-11 — Hai route EMA99 SHORT dùng 10x

- 5m `NEAR_EMA_WATCH/SHORT` và 15m `CLOSED_ABOVE_EMA_WATCH/SHORT` dùng `$5 margin ×10` (notional `$50`) cho entry mới. Cùng label ở timeframe khác và route khác vẫn 5x.
- TP giữ `+15% ROE` từ average full-fill (`SHORT ×0,985`); SL giữ `−30% ROE` (`SHORT ×1,03`). Controls/API/runtime guard cùng dẫn xuất leverage theo exact label+timeframe; UI không còn ghi cứng 5x.
- Không đổi detector, stats hay checkbox hiện hữu; không thêm WHITELIST. JSON cũ không cần migrate, và vị thế/TP/SL đang mở không bị sửa.

### 2026-09-11 — EXTREME_PUMP/FOLLOW_REJECTION 5m SHORT test

- Hai route `EXTREME_PUMP_CLOSED/SHORT` và `FOLLOW_REJECTION_LIVE/SHORT` được seed riêng vào nhóm tín hiệu khác trên `/binance-auto-controls`. Mỗi route mặc định OFF, có checkbox/enabledAt riêng; hiện lần lượt ON từ `2026-09-11T08:16:03.471Z` và `2026-09-11T08:32:50.728Z`. Size cố định `$1 margin ×5`, không dùng input size EMA99.
- Closed route cần nến 5m spike đóng sau enabledAt và tuổi `<=90s`. Live-follow route chỉ xét nến mở sau enabledAt, trong 1–3 nến sau spike đang trả lại `>=50%`, chưa higher high, event tuổi `<=90s`, tick `<=30s` và nến vẫn chạy. Cả hai cần mark cách giá đánh giá `<=0,5%`. 15m, spike LIVE, follow closed, rút râu/quét hai đầu vẫn quan sát.
- Entry có TP `+15% ROE`, SL `−30% ROE` theo full-fill, chặn position/order cùng symbol và cooldown chung 4h; không backfill hay sửa lệnh hiện tại. Cả hai dùng stage đã tồn tại, không tạo card thống kê/WHITELIST mới; fill/close CSV tách theo label, JSON cũ thiếu eligibility fail-closed.

### 2026-09-10 — EMA99_TIMEFRAME_CONTROLS_V2_20260910

- Đã reload btc-liquidity-web, healthz HTTP 200; API runtime xác nhận 11 route 5m + 11 route 15m, đối chiếu cấu hình trước/sau không lệch enabled/size/enabledAt hoặc khóa tổng. Browser test tick/Lưu/reload/search pass trên API mock, không đổi setting thật; bản sao cấu hình trước chuyển đổi lưu tại data/auto-entry-controls.before-timeframes-20260910.json.
- Binance auto controls tách 11 loại EMA99 thành 22 route độc lập: source + stream + label + side + interval (5m hoặc 15m). UI chia hai nhóm, checkbox/ô ký quỹ/Lưu và matcher runtime dùng cùng key. Payload thiếu hoặc sai interval bị khóa, không fallback sang công tắc chung.
- Dữ liệu trước entry: interval lấy trực tiếp từ event nến đã đóng, stage/side/source hiện hữu, tuổi tín hiệu và enabledAt, giá tham chiếu/mark, vị thế/lệnh chờ và ký quỹ của đúng khung. Bốn builder và shared runner truyền signalInterval tới common order guard; không đổi thuật toán phân loại, không dùng outcome tương lai.
- Binance: bật/tắt và size 1–100 USDT ×5 được lưu riêng theo từng khung, chỉ áp dụng entry mới. Giữ TP +15% ROE, SL LONG −20% / SHORT −30%; không sửa/cancel TP/SL hoặc vị thế đã mở. Khóa tổng, gate gốc, xác thực Orders, giới hạn tuổi 90s, không cộng vị thế, cooldown theo symbol và dedupe cũ vẫn giữ; không chia cooldown để mở hai lệnh cùng coin.
- JSON cũ: route key 4 phần của EMA99 được chuyển sang hai key 5 phần, giữ nguyên enabled, enabledAt và margin của route cũ (trước đây vốn áp cho cả hai khung); không ghi đè route con đã tồn tại. Seed lưu chuyển đổi qua restart. Route chưa từng có mặc định OFF, input thiếu timeframe không tạo route chung mới; request từ UI cũ dùng key cũ bị từ chối. Route ngoài EMA99 giữ key và hành vi cũ.
- Thống kê/WHITELIST: không thêm nhãn tín hiệu/card/cohort thống kê; signalLabel/signalCombo và W/L, PF, AvgROE giữ nguyên. Không thêm whitelist matcher; policy whitelist hiện hữu mặc định OFF và chỉ hiển thị CLOSED AvgROE >4% không đổi. Đây là gate Binance thật, không phải nhãn OBSERVE ONLY mới.
- Kiểm thử: migration/restart, 22 route OFF mặc định, đổi 5m không ảnh hưởng 15m, runtime lấy đúng size, thiếu timeframe bị khóa, pause-all, cooldown chung; test runner chỉ mock exchange, không phát lệnh thử thật.

### 2026-09-10 — MANUAL_SHORT_SL50_PENDING_DCA_FIX_V2_20260909

- Sửa race khi lệnh SHORT tay mới đủ cutoff đã có policy SL50 nhưng SELL bổ sung khớp trước khi SL đầu tiên được gửi. Input là policy opening fill đã xác minh và lịch sử Binance trades từ lúc tạo order, không dùng tín hiệu/giá tương lai.
- Chỉ cho hoàn tất SL đầu tiên nếu lịch sử gồm đủ original fill, toàn SELL, không realized PnL/đóng/đảo chiều, tổng lượng và average khớp live position. Giữ mốc SL original fill, không rebase theo DCA/mark. Nếu không chứng minh được thì giữ pending/retry, không báo đã đặt; duplicate DCA không được xóa pending manual SL50 plan.
- Binance: vẫn cutoff cố định, không mở entry/thay size/leverage/TP; giữ SL đã có và không backfill vị thế cũ. Đọc lại open orders sau đặt SL trước khi đánh dấu applied/slPlaced; không coi TP nằm phía trên giá là SL. Chưa thực hiện sửa SL thủ công cho ZEC qua API trong lượt này.
- JSON tương thích: manualShortSl50 V1 vẫn đọc được; metadata reconciliation/version/qty/average chỉ thêm optional. Record cũ không có policy không được cấp quyền mới. Không thêm nhãn/card/thống kê/WHITELIST; các policy closed AvgROE >4% hiện hữu giữ nguyên.
- Test mock bao gồm DCA giữa hai lần đọc vị thế, lịch sử thiếu/đóng/không khớp, SL người dùng có sẵn và sàn chưa xác nhận open SL.

### 2026-09-09 — MANUAL_SHORT_NEW_FILL_SL50_V1_20260909

- Đã kích hoạt cutoff cố định 2026-09-09T13:56:14.111Z (20:56:14 ngày09/09 giờ VN); reload dịch vụ thành công, /healthz HTTP200. Các bài test SL50, TP policy, EMA99 fill và position monitor pass; chỉ mock exchange.

- Theo yêu cầu, SHORT vào tay mới dùng SL mặc định -50% ROE từ average full-fill của order đã xác minh trên Binance, khoảng giá=.50/leverage; SL=entry×(1+.50/leverage). Ví dụ5x +10% giá;10x +5%. TP hiện hữu giữ nguyên; không thay size, đòn bẩy, detector hay Binance bot EMA99.
- Mốc MANUAL_SHORT_SL50_ACTIVATED_AT lưu cố định trong .env, thiếu/sai => rule tắt; không lấy thời gian restart làm cutoff. Trước đặt SL phải xác minh getOrder: SELL, FILLED, MARKET/LIMIT, không reduceOnly/closePosition, thời gian tạo order và full-fill >=cutoff. Chỉ khi lượng SHORT hiện tại đúng lượng order đã khớp và entry vị thế đúng average fill, vị thế BOTH/SHORT đúng hướng. DCA, đảo vị thế/giảm vị thế, order cũ tạo trước cutoff dù khớp sau đó, event replay trước cutoff đều bỏ qua. Chỉ mở mới sau mốc, không backfill các vị thế hiện tại.
- Input/phân loại: exact nguồn manual, orders-manual, binance-manual-socket, liquid-flow-v2-manual, pump-manual-order; đối chiếu audit submission và client ID để loại nguồn bot bị mất plan lúc restart, không áp lifecycle auto. Nếu chưa chứng minh được order mới hoặc sàn trả lỗi thì không tự đoán; đường full-fill/retry hiện hữu xử lý lại. Nến/EMA không quyết định SL50 này.
- Runtime gắn manualShortSl50 vào plan và slTracking của lifecycle mới; fill-anchor giữ TP distance null và SL distance=.50/leverage. setTpSl chỉ bỏ chặn manual TP-only cho payload mang policy mới hợp lệ và khớp symbol/side/entry/qty hiện tại. Re-read vị thế ngay trước đặt SL để tránh race DCA/đóng lệnh. STOP_MARKET BUY closePosition, làm tròn tick theo pipeline hiện hữu; giữ SL đang có, không hủy/thay SL người dùng. Chính sách quản lý TP/profit-lock khác không đổi.
- JSON cũ thiếu manualShortSl50 giữ hành vi cũ; không migrate, không quét đặt SL các vị thế cũ. Không đổi signalLabel/type hoặc thêm card/nhãn thống kê, không có WHITELIST mới; W/L/PF/AvgROE và policy closed AvgROE>4% giữ nguyên. Fill/close audit và CSV hiện hữu nhận SL/reason mới qua pipeline cũ.
- Test mock build policy ở1x/5x/10x/20x/125x, cutoff cũ/thiếu/sai, DCA, LONG/bot/close/reversal, SL và TP theo fill; thực thi chính hàm setTpSl trong môi trường exchange mock để kiểm tra legacy suppression được vượt đúng policy, lệnh cũ không đặt SL, existing SL không bị thay và race vị thế không phát order. Không gửi lệnh thật để thử.



### 2026-09-09 — EXTREME_SHORT_SQUEEZE_ALERT_V1_20260909

- Triển khai: webhook đọc trả HTTP200; đã gửi đúng một tin BULLA gắn nhãn [TEST LỊCH SỬ], Discord trả HTTP204. Tin kiểm thử dùng nến đóng lịch sử, không ghi nhận là cảnh báo realtime, không đi qua entry Binance. Reload dịch vụ và /healthz trả HTTP200.

- Luồng Discord quan sát riêng phát hiện nến tăng cực lớn trên 5m và 15m, cấu hình qua EXTREME_SHORT_SQUEEZE_DISCORD_WEBHOOK_URL trong .env (không ghi secret vào tài liệu/source). Scheduler 15 giây đọc toàn bộ symbol trong shared snapshot nhưng chỉ xử lý khung đã có >=22 nến cache liên tục; không seed thêm REST, không yêu cầu EMA99 hoặc tăng/giảm 24h. Live cần tick websocket riêng symbol/khung <=30s; closed cần tuổi <=90s. Dữ liệu không có hoặc khuyết không phát; phạm vi thực tế phụ thuộc cache hiện hữu.
- Dữ liệu trước spike: ATR14 lấy mean true-range của 14 nến đã đóng trước nến spike; volume MA20, đỉnh/đáy 20 nến đều loại nến spike. Gate cảnh báo ban đầu: high/open và high/close-trước đều >=8%; (high-open)/ATR14 >=4; volume/MA20 >=3; high vượt đỉnh20 >=1%; quoteVolume nến >=100.000 USDT (nếu thiếu dùng cận dưới volume×low và ghi rõ ước tính). Các ngưỡng là rule kỹ thuật chưa backtest tối ưu.
- Nhãn quan sát EXTREME_PUMP màu cam; UPPER_REJECTION màu đỏ khi râu trên >=40% range và giá trả lại >=50% đoạn open→high; TWO_SIDE_SWEEP màu tím khi low xuyên đáy20 và thấp hơn open >=3%, ưu tiên hơn reject. Theo dõi tối đa3 nến sau spike: FOLLOW_REJECTION/FOLLOW_TWO_SIDE_SWEEP; bỏ theo dõi đỉnh cũ nếu xuất hiện high mới cao hơn. Cùng nến có cả hai đầu không suy diễn thứ tự high/low từ OHLC. “Kill short” mô tả hình thái, chưa xác nhận số tiền liquidation.
- Mỗi trạng thái tách LIVE/CLOSED, snapshot chứa mốc spike và mốc đánh giá, open/high/low/price, wick, retrace, ATR/volume và baseline. Dedupe bền theo symbol/khung/nến spike/stage tại data/extreme-short-squeeze-discord.json; cập nhật reject/quét dưới được gửi riêng, không nhắc lại xác nhận cũ trên nến sau. Notifier serialize, kiểm tra lại freshness khi chờ hàng, backoff khi 429/network; vẫn có giới hạn gửi trùng nếu Discord nhận thành công nhưng tiến trình chết trước lưu state.
- Chỉ OBSERVE ONLY: không nối Binance runner, không đặt entry/size/SL/TP, không thay EMA99 hay luồng khác. Không tạo nhãn/card thống kê/PnL, không tạo route WHITELIST cho nhãn quan sát này; W/L/PF/AvgROE, audit fill/close CSV và policy closed AvgROE>4% hiện hữu giữ nguyên. JSON mới riêng; không migrate/backfill dữ liệu cũ hoặc gửi lại lịch sử như tín hiệu mới.
- Kiểm thử mock: 5m/15m, baseline không nhiễm spike, reject/quét hai đầu/follow, Unicode, dữ liệu lỗi, live thiếu tick/cũ, hết hạn, state qua restart, 429 và dedupe. Replay nến BULLA lịch sử trong ảnh: 5m UPPER_REJECTION_CLOSED, open→high +31,42%, volume24,62×; 15m TWO_SIDE_SWEEP_CLOSED, volume35,58×. Replay chỉ dùng nến đã đóng tại cutoff, không suy diễn thời điểm cảnh báo intrabar hay backtest lợi nhuận.



### 2026-09-09 — EMA99_MTF_CONTEXT_OBSERVE_V1_20260909

- Bổ sung `emaContext` vào event LONG EMA99 trước callback execution/Discord: EMA13/25/99, thứ tự, độ lệch %, EMA13 vừa cắt EMA25 và số nến EMA13/25 cùng dưới EMA99 trên cả 5m và 15m. Dùng tối đa 240 nến cache mỗi khung, SMA seed rồi EMA alpha=2/(period+1), tối thiểu 165 nến liên tục; chỉ lấy closeTime <= mốc nến tín hiệu/confirmedAt và < now. Tín hiệu đang chạy dùng nến đã đóng trước đó. Khung thiếu, khuyết hoặc chậm >= 1 duration được ghi không khả dụng; không gọi REST thêm trong scanner.
- Phân loại bối cảnh hiển thị, ưu tiên: thiếu khung => UNAVAILABLE/xám; EMA13 vừa cắt xuống EMA25 ở 5m hoặc 15m, hoặc EMA25 5m cách EMA99 <=0,10%, hoặc hai EMA nhanh mới cùng xuống dưới EMA99 1 nến => TRANSITION/tím. Nếu không thuộc trên, 5m EMA13 < EMA25 < EMA99 và hai EMA nhanh cùng dưới EMA99 >=2 nến, 15m EMA13/25 vẫn trên EMA99 => PULLBACK_ESTABLISHED/xanh ngọc. Còn lại MIXED/xanh dương. Đây là ngưỡng mô tả ban đầu, chưa tối ưu bằng backtest; không đồng nghĩa điều chỉnh đã kết thúc hoặc xếp hạng thắng.
- Discord thêm embed bối cảnh riêng có màu, số EMA từng khung, thời gian nến, thứ tự chính xác và ghi chú gần nhau. Embed tín hiệu LONG chính giữ xanh dương/xanh lá. Không đổi signalLabel, stage, version detector, dedupe hay phát lại tin cũ. Tái dựng lịch sử tại nến tín hiệu ORDER 07:15 và AVA 02:00 ngày 9/9 (VN) lần lượt cho PULLBACK_ESTABLISHED và TRANSITION; chỉ kiểm chứng phân loại, không phải backtest lợi nhuận.
- Binance/entry/size/SL/TP: không đổi. Bối cảnh chỉ OBSERVE ONLY, không là gate hay quyền MARKET, không đổi checkbox hoặc route settings. TP EMA99 mới +15% ROE, SL LONG -20%/SHORT -30% giữ nguyên. Không thêm nhãn/card thống kê nên không tạo WHITELIST mới; matcher runtime, policy WHITELIST closed AvgROE >4%, W/L/PF/AvgROE và fill/close CSV giữ nguyên.
- JSON cũ: trường emaContext additive chỉ trên event runtime; event cũ thiếu context vẫn render tin gốc, không migrate/backfill state/audit CSV, không tự tạo context từ giá hiện tại cho tin cũ. Tests kiểm tra giao cắt, màu, thiếu/cache cũ, không nhìn nến tương lai, event đang chạy, legacy payload và scanner truyền context; hồi quy các builder Binance. Không gửi tin/lệnh thật để test.



### 2026-09-08 — EMA99_ALL_FILL_TP_15ROE_V1_20260908

- Theo yêu cầu người dùng, mọi lệnh EMA99 MỚI thuộc đủ 11 stage, cả LONG và SHORT, cùng hai route EMA99 cũ `ema99-kill-reclaim` và `ema99-kill-reclaim-pump-dump-absorption`, đặt TP +15% ROE từ average full-fill thực tế. Với leverage 5x: LONG TP=fill×1.03, SHORT TP=fill×0.97. SL giữ rule mới nhất: LONG −20% ROE/fill×0.96; SHORT −30% ROE/fill×1.06. Không sửa TP/SL của vị thế đã mở trước rollout.
- Dữ liệu trước entry và điều kiện phân loại không đổi: detector EMA995m/15m, exact version/stage/side, nến đóng, enabledAt/freshness≤90s, mark drift≤0.5%, target/invalidation cấu trúc phải dương và đúng phía, no-DCA/open-order guard. Target cấu trúc tiếp tục là gate/context Discord nhưng không còn là TP bảo vệ cuối của entry thật EMA99.
- Tác động Binance: sáu exact source EMA99 được bọc bằng `EMA99_ENTRY_PROTECTION_VERSION`: `ema99-near-reject-short`, `ema99-reclaim-long`, `ema99-bounce-long`, `ema99-observe-only`, `ema99-kill-reclaim`, `ema99-kill-reclaim-pump-dump-absorption`; helper còn kiểm tra đúng hướng BUY/SELL để không nhận nhầm source. Plan ghi fillAnchorEnabled, takeProfitDistanceFraction=.15/leverage, protectionSignalEntry/TP; full-fill pipeline tính lại TP từ average fill và làm tròn tick. SL distance metadata được giữ đồng thời. TP và SL đều neo cùng fill; không dùng mark/signal close làm anchor cuối. Size/margin/5x/routes và các nguồn không EMA99 không đổi.
- Discord/trang controls hiển thị TP+15% và tách mốc cấu trúc khỏi giá bảo vệ thật. Đây không phải thay detector, nhãn, tier, snapshot, gate hoặc card thống kê. Audit fill/close/CSV tiếp tục lưu source/label/reason và PnL thật; cách tính W/L/PF/AvgROE, whitelist closed AvgROE>4% không đổi, không thêm checkbox/label whitelist mới.
- Tương thích JSON cũ: vị thế/plan thiếu EMA99_FILL_TP15_LONGSL20_SHORTSL30 version không migrate/backfill; chỉ order tạo sau reload có takeProfitDistanceFraction mới. Existing protection và manual/non-EMA giữ nguyên. Tests mock 7 exact source-direction (gồm hai route cũ), giá fill khác signal, TP±3% price=+15% ROE, SL20/30 không đổi, TP/SL metadata, detector/Discord/controls/auth regressions; không gửi lệnh thật.


### 2026-09-08 — EMA99_LONG_FILL_SL_20ROE_V1_20260908

- Theo xác nhận người dùng, tất cả lệnh LONG EMA99 MỚI trong catalog11 dùng SL −20% ROE từ average full-fill Binance. Với leverage5x: SL=fill×0.96 (giá đi ngược4%). SHORT EMA99 giữ −30% ROE/fill×1.06. Không sửa/nới SL các vị thế đã mở trước rollout; KOMA/AERO/AIA/SYRUP và lệnh cũ giữ protection hiện hữu.
- Dữ liệu và phân loại trước entry không đổi: detector EMA99 5m/15m, exact stage/side/version, nến đóng, enabledAt/tuổi90s, mark drift≤0.5%, structural invalidation phải hợp lệ, TP đúng phía, no-DCA/pending guard. Structural low−.25ATR tiếp tục làm gate hợp lệ trước entry nhưng không còn là giá SL cuối của LONG.
- Tác động Binance: helper chỉ exact BUY sources ema99-reclaim-long, ema99-bounce-long, ema99-observe-only. Plan mới ghi fillAnchorEnabled=true, stopLossDistanceFraction=.20/leverage, takeProfitDistanceFraction=null, protection entry/SL metadata và version. Full-fill pipeline dùng average fill thật để đặt SL; TP detector giữ nguyên, không rebase. Size, leverage, route controls và quản lý sau fill không đổi.
- Thống kê/audit/CSV hiện hữu nhận reason có rule SL; cách tính W/L/PF/AvgROE và whitelist không đổi. Không thêm label/card/tier/snapshot/gate mới. Discord và trang controls ghi rõ LONG−20%/SHORT−30%, không mô tả WATCH thành xác suất thắng.
- Tương thích JSON cũ: vị thế/plan thiếu EMA99_LONG_FILL_SL_20ROE version không được migrate hay backfill; chỉ entry tạo sau reload có anchor mới. LONG/manual/non-EMA không bị helper chạm. Tests mock cả3 source LONG, average fill→SL−20% ROE, TP bất biến, SHORT−30% và legacy/manual unaffected; regression reclaim/bounce/all11/controls/auth, không gửi lệnh thật.


### 2026-09-08 — EMA99_SHORT_FILL_SL_30ROE_V1_20260908

- Người dùng xác nhận chỉ lệnh mới: 5 stage SHORT EMA99 trong catalog11 dùng SL -30% ROE tính từ average full-fill thực tế. Ở5x: SL=fill×1.06, không theo high nến+.25ATR nữa. Margin5USDT lỗ lý thuyết1.5USDT trước phí/slippage. Không áp LONG, nguồn khác hoặc vị thế cũ (CHILLGUY hiện hữu giữ nguyên).
- Input trước entry/phân loại/gate không đổi: detector/nến/EMA, activatedAt,90s,mark drift,noDCA,TP hợp lệ. Builder entry mới gắn fillAnchorEnabled=true, stopLossDistanceFraction=.30/leverage và version; TP distance=null để KHÔNG rebasingTP. SL trước fill chỉ giá dự kiến, fullfill pipeline rebase SL theo giá khớp thật và làm tròn tick.
- Giữ TP, size, leverage, checkbox; không nới hay dời SL các lệnh đang mở, không backfill/adopt rule mới. Quản lý bảo vệ sau fill hiện hữu không thay đổi. Audit/CSV lưu qua pipeline cũ, reason ghi ruleSL; W/L/PF/AvgROE không đổi, không thêm nhãn/card/WHITELIST.
- JSON cũ thiếu anchor/version không bị đổi; chỉ plan entry mới có metadata explicit, cơ chế resolve anchor cũ tái sử dụng. Tests mô phỏng fill trượt từ.014 về.013956 => SL.01479336, TP.013302 giữ nguyên, LONG/manual/legacy unaffected; regression watch/near; không live order test.


### 2026-09-08 — EMA99_ALL11_OPTIN_V1_20260908

- Theo yêu cầu mở quyền tick và edit/Lưu margin cho đủ11 stage EMA99. Không bật tự động8 loại mới; giữ3 route đangON và size cũ. Nhóm SHORT luôn SELL, LONG luôn BUY, gồm CLOSED_ABOVE_EMA_WATCH vẫn SHORT và CLOSED_BELOW_EMA_LONG_WAIT vẫn LONG; WATCH không phải xác nhận đảo chiều.
- 8 stage trước observe được nối runner MARKET opt-in riêng, exact catalog source/stream/label/side + Symbol auth nội bộ. Giữ source kỹ thuật cũ ema99-observe-only để tương thích keyJSON; tên source không còn mô tả quyền, quyền do checkbox+executor quyết định. Route defaultOFF, chỉ người dùng tick ON có enabledAt mới.
- Dữ liệu trước entry: detector5m/15m version hiện tại, price close, EMA/ATR và nhãn không thay phân loại. Chỉ nến closed, close sau activation, tuổi close/generated<=90s, mark drift<=0.5%, TP/SL dương đúng phía, không vị thế hoặc entrypending cùngcoin. Không vào theo nến đang chạy dù Discord đã báo WATCH. Các điều kiện3 route cũ không đổi, bounce dùng confirmedAt.
- SHORT mới TPđáy12 nến trước, SLhigh+.25ATR; thêm executionTakeProfit additive khi chưa reject, không sửa takeProfit quan sát cũ. LONG mới TPđỉnh12 nến trước còn trên giá, SLlow-.25ATR. Không đủ mức thì bỏentry. Margin1–100 USDT lưu riêng, default5, leverage5, khôngceil; preserve fullfill TP/SL, ngoại lệ source tránh TP ROE chung/short SL suppression. Không áp capTP20% chưa được làm rõ.
- Shared attempts8 route chống replay/cooldownsymbol4h, scanner await tuần tự, timeout claim trước submit; giữ noDCA. API Orders auth như cũ, không bỏ đăng nhập. Thống kê fill/closeCSV pipeline cũ, không đổi W/L/PF/AvgROE; không thêm nhãn/cardthốngkê/WHITELIST. Checkbox catalog exact runtime, không gán giả AvgROE gate.
- JSON cũ observe metadata executablefalse/marginnull => editabledefault5 nhưng épOFF/xóaenabledAt, không tự kíchhoạt; 3route cũ giữ nguyên. executionTakeProfit optional, thiếuTP failclosed; khôngbackfill tin cũ. UI/Discord ghi rõ opt-in có gate, không hứa khớp. Tests mock all11save/tick,8builder đúnghướng/TP/SL/closed/age/auth, migrationOFF và regression3route; không testlệnhthật.


### 2026-09-08 — EMA99_CATALOG_MARGIN_V1_20260908

- Trang binance-auto-controls seed đủ 11 stage từ hai scanner EMA99 Discord SHORT/LONG 5m/15m, có tên Việt. Ba stage đã có executor (near-reject SHORT, reclaim LONG, bounce-confirmed LONG) giữ công tắc cũ; 8 stage observe-only luôn khóa bật ở UI và API. Các dòng EMA99/luồng khác trong lịch sử giữ nguyên, không tự cấp executor mới.
- Input trước entry và phân loại detector không đổi: nến/EMA/ATR/confirmation, tuổi90s, activation, mark drift0.5%, no-DCA, dedupe, TP/SL giữ nguyên. Thêm marginUsdt từng route thật: mặc định JSON cũ 5 USDT, chỉnh 1–100 USDT tối đa2 số lẻ qua nút Lưu, giữ5x, notional=margin×5. Save không bật route OFF, không đổi enabledAt, chỉ áp dụng entry mới; không tác động TP/SL hoặc vị thế đã mở.
- Runtime đọc margin từ controls trước tạo lệnh và kiểm tra lại sát entry; auth nội bộ kiểm tra size hợp lệ và 5x, client guard so với config hiện tại, đổi size giữa chừng chặn lệnh cũ. Endpoint save yêu cầu Orders token + kiểm tra origin như cũ, optimistic expectedMargin tránh ghi đè edit cũ. Refresh UI không mất draft hay focus đang nhập. Size UI là cấu hình entry, không phải vị thế thực tế đang mở; dòng chưa nối size hiện dấu gạch.
- Không đổi thống kê W/L/PF/AvgROE hoặc thêm card/nhãn thống kê/WHITELIST. Đây là catalog các nhãn detector đã tồn tại và controls Binance, không gán gate AvgROE cho observe. Checkbox exact source/stream/label/side khớp matcher, seed defaultOFF; 8 observe không thể giao dịch.
- JSON additive title/executable/leverage/marginUsdt, metadata lấy từ catalog tin cậy; margin thiếu default5, sai=>failclosed route. Giữ audit fill/close/CSV hiện hữu với notional mới, Discord outcome hiển thị margin được dùng thay text5 cố định. Không migrate/backfill lịch sử. Tests catalog11/3, observe lock, range/type/stale-save/restart/default, runtime margin36.25notional từ7.25margin, auth/client stale-size, regression3 executors; chỉ mock, không đổi size live để test.


### 2026-09-08 — EMA99_BOUNCE_CONFIRMED_LONG_MARKET_5USDT_5X_V1_20260908

- Người dùng bật riêng `BOUNCE_CONFIRMED_LONG_WATCH` (XÁC NHẬN BẬT · LONG WATCH) vào BUY MARKET margin 5 USDT × 5x = notional 25 USDT. Route exact `ema99-bounce-long / ema99-retest / BOUNCE_CONFIRMED_LONG_WATCH / LONG` mặc định OFF khi đăng ký, bật riêng theo yêu cầu. Hai route EMA99 đã bật giữ nguyên; không tự bật loại khác hoặc vào lại tin VELODROME cũ.
- Dữ liệu trước entry: detector LONG V1 không đổi, EMA99 dốc lên và pullback/reclaim với râu dưới>=25%, rồi 1–3 nến đã đóng sau reclaim xác nhận bằng CLOSE_ABOVE_RECLAIM_HIGH hoặc EMA_RETEST_HELD. Cho cả reclaim chạm và near-reclaim khi detector thực sự phát confirmed stage. Exact version/side/stage/5m hoặc 15m; confirmedAt phải sau reclaim và cách nguyên 1–3 duration. Tuổi 90s và enabledAt tính từ confirmedAt, KHÔNG từ candleCloseAt cũ. Giá tham chiếu referenceEntry là close nến xác nhận, phải trên EMA99; mark lệch<=0.5%, SL<mark/entry<TP.
- Entry/size/SL/TP thật: MARKET25notional5x, không ceil size. TP là đỉnh12 nến trước reclaim còn trên giá xác nhận; SL=low nến reclaim-.25ATR14. Thiếu/đảo mức bỏ entry; bảo toàn TP detector khỏi TP ROE chung bằng source exact, rounded TP/SL/age/mark recheck trong placeOrder. Bảo vệ full-fill và quản lý vị thế sau fill dùng pipeline cũ, không sửa rule quản lý khác.
- Không DCA: có vị thế bất kỳ phía (kể cả LONG reclaim trước) hoặc entry chờ trên symbol thì bỏ. State attempts riêng, claim trước submit, deterministic client ID theo setup, symbol cooldown4h cross-timeframe, timeout/unknown không retry signal; controls master/per-route và auth Symbol riêng BUY/MARKET/25/5/exact source-label. Không nới hạn90s để xử lý restart và không replay tin cũ.
- Discord giữ màu xanh lá confirmed, nhánh có execution ghi đúng LONG MARKET + outcome và mốc xác nhận, không tự nhận đã fill. Thống kê dùng fill/close audit+CSV hiện hữu với source/label/reason/confirmation/timeframe; W/L/PF/AvgROE không đổi, không thêm card/nhãn thống kê/WHITELIST mới. Checkbox Binance có key exact khớp runtime, defaultOFF; đây là explicit execution route, không gán giả gate closed AvgROE>4% cho route này.
- JSON additive: event detector cũ giữ nguyên, optional binanceExecution, controls enabledAt thiếu failclosed; attempts mới riêng hỏng failclosed. Không migrate/backfill lịch sử. Tests mock xác nhận hai cách/5m15m/tuổi từ confirmedAt/activation/exact stage/size/auth/TP/SL, vị thế/pending, concurrent/restart/timeout dedupe và regression 2 route cũ; không test lệnh thật.


### 2026-09-08 — EMA99_RECLAIM_LONG_MARKET_5USDT_5X_V1_20260908

- Theo yêu cầu người dùng, thêm route thật riêng `ema99-reclaim-long / ema99-retest / RECLAIM_LONG_WATCH / LONG` (RÚT RÂU / LẤY LẠI EMA99): BUY MARKET margin 5 USDT × 5x, notional 25 USDT, không ceil size. Giữ route SHORT near-reject đã bật; không bật thêm các LONG gần chạm, near-reclaim, bounce-confirmed hay các luồng khác. Default đăng ký OFF, chỉ bật riêng theo yêu cầu. Đây là quyền entry sớm sau nến reclaim, không đợi nến sau phá đỉnh và không gọi WATCH là xác nhận thắng.
- Input trước entry: detector LONG V1 5m/15m EMA99 tăng đều, nhịp tăng và pullback theo nến; exact stage/side/version, closed, nearMiss=false, close>EMA99, râu dưới>=25%. Nến đóng sau enabledAt, tuổi close/generated<=90s; mark mới lệch close<=0.5%, SL<entry/mark<TP. Không replay cảnh báo cũ. Có vị thế bất kỳ phía hoặc entry chờ cùng symbol thì bỏ, không DCA.
- TP đỉnh 12 nến trước còn trên giá; SL đáy nến reclaim trừ .25 ATR14. Thiếu mức hợp lệ thì không vào. Ngoại lệ TP theo source exact tránh TP ROE chung ghi đè lúc entry; validate rounded TP/SL/age/mark trước đặt. Dùng full-fill protection hiện hữu, không đổi quản lý vị thế sau fill hoặc TP/SL của các nguồn khác.
- Runner dùng chung cơ chế kiểm soát nhưng state riêng: claim bền trước submit, clientOrderId cố định, cooldown symbol 4h xuyên timeframe, kết quả timeout/không rõ không retry cùng signal; master/route phải ON, quyền nội bộ Symbol riêng chỉ BUY MARKET 25 notional/5x/exact label/source. JSON/text không tự cấp quyền.
- Thống kê fill/close/CSV dùng pipeline cũ, mang source/label/reason/timeframe; không đổi W/L/PF/AvgROE, không thêm card hoặc nhãn thống kê/WHITELIST mới. Checkbox quản lý Binance khớp exact matcher trên; đây là route giao dịch được chỉ định riêng, không giả danh gate closed AvgROE>4% của whitelist thống kê.
- Tương thích JSON: detector và dữ liệu lịch sử không đổi/migrate/backfill; optional binanceExecution chỉ đổi Discord nhánh này, các nhánh khác vẫn observe. Controls thiếu enabledAt fail closed; attempts JSON mới riêng, hỏng fail closed. Tests mock long/short regression, sai stage/size/side, freshness, protection, controls, position/pending, dedupe/restart/timeout; không live-order test.


## Cập nhật 2026-09-08 — EMA99_NEAR_REJECT_MARKET_5USDT_5X_V1_20260908

Người dùng bật riêng route `ema99-near-reject-short / ema99-retest / NEAR_REJECT_SHORT_WATCH / SHORT`: MARKET margin5 USDT×5x, TP/SL detector. Master ON chỉ để route này được chạy; các route còn lại OFF. Không LONG hoặc NEAR_EMA_WATCH. Rule cũ bên dưới là lịch sử thời điểm OFF toàn bộ, được thay thế duy nhất cho route này. Mỗi bật riêng OFF->ON có enabledAt, tín hiệu đóng trước mốc không được replay. Không card thống kê/WHITELIST mới; route explicit thực sự giao dịch, audit fill/close hiện hữu. Tests `test-ema99-near-reject-binance.mjs`, chi tiết trong CURRENT_DECISION_AND_EMA_RULES.

Version: AUTO_ENTRY_CONTROLS_V1_20260907. Page: `/binance-auto-controls`.

## TP theo route và thống kê ngày (V5, 2026-09-12)

- Route EMA99 executable 5m/15m có ô `TP lệnh mới · % ROE`, lưu độc lập 1–100% và mặc
  định 15%. Save không bật route, không sửa lệnh đang mở; runtime recheck TP trước submit.
- Dashboard ngày dùng audit fill/close thật. Entry count bỏ DCA; PnL là net realized
  của position đóng trong ngày `Asia/Bangkok`, không cộng unrealized. Dòng route hiển
  thị số entry, entry hôm nay còn mở, số position đóng và PnL thực tế.
- Các luồng ngoài EMA99 chưa có fill-anchor override chung nên TP tiếp tục theo executor
  gốc và được ghi rõ read-only; controls không tuyên bố thay đổi TP cho các luồng này.

## Đòn bẩy theo route EMA99 (V6, 2026-09-13)

- Route EMA99 executable 5m/15m có cột `Đòn bẩy lệnh mới`, nhận số nguyên 1–125x và lưu
  riêng theo exact loại + khung. Save không bật route OFF và không sửa vị thế hiện tại.
- Lệnh mới dùng `notional = margin × leverage`; TP và SL vẫn giữ tỷ lệ ROE của route,
  nên khoảng cách theo giá tự đổi thành `ROE / leverage` rồi được neo từ average full-fill.
- Runtime đọc lại margin/leverage/TP trước submit; edit đồng thời hoặc plan cũ bị chặn
  để vòng scan sau dựng lại. Các luồng ngoài EMA99 vẫn dùng leverage executor gốc.

## Hybrid Liquidity Hunter (2026-09-13)

- Bốn route cố định `primary/secondary × LONG/SHORT` xuất hiện trong nhóm ngoài EMA99.
  UPPER_FIRST vào LONG; LOWER_FIRST vào SHORT; WHIPSAW không có checkbox entry.
- Mỗi lệnh mới dùng `1 USDT margin × 5x`, MARKET và TP `+10% ROE` neo từ full-fill.
  Luồng này không đặt SL riêng. Route mới mặc định OFF khi seed; chỉ route được tick ON
  và khóa tổng ON mới có quyền đi tiếp qua detector/freshness/no-DCA gate.

## Cách dùng

- Hiện OFF tổng và tất cả loại. Discord/TP/SL/vị thế đang có giữ nguyên.
- Đăng nhập `/orders`, tìm đúng label, stream và hướng, chọn ON các loại muốn cho phép rồi bật tổng. Mỗi lần bật có xác nhận. Bật không thay size/SL/TP và không bảo đảm lệnh sẽ vào: rule execution cũ vẫn phải pass.
- TẮT TẤT CẢ lưu master OFF + từng route OFF. Tắt riêng tổng bảo toàn lựa chọn route. Không hủy lệnh chờ hoặc đóng vị thế. LIMIT/algo entry đã nằm ở sàn vẫn có thể khớp.
- Label/stream lấy từ audit submissions/fills + payload runtime. Loại chưa từng xuất hiện trong hai nguồn có thể chưa thấy; khi runtime yêu cầu sẽ tự có ở OFF. Route không phân loại được luôn khóa; các watcher EMA99 chỉ Discord không trở thành auto-order.

## Gate và whitelist

Exact key là JSON tuple source, stream (streamId hoặc executionPage), label (signalLabel/type ưu tiên protectionMeta), side LONG/SHORT. Cùng matcher cho catalog, UI key và runtime; không wildcard, không gộp hai nhóm CoinGlass. Các control không là whitelist thống kê: không tạo label/stat card mới, không sửa policy chỉ hiện WHITELIST thống kê khi closed AvgROE >4%, không cấp authorization auto policy cũ. Đây là gate bổ sung từ chối entry, không mở rộng execution.

Input trước entry chỉ metadata request và settings; không thay classification, PnL/W/L/PF/AvgROE. Manual có token Orders hợp lệ, reduceOnly, closePosition và hedge closing side không bị khóa mới. Main client wrapper chặn entry không có metadata cả khi đi đường legacy; placeOrder kiểm tra đầu và trước gửi/IOC fallback. Không quản lý giao dịch chạy độc lập ngoài service. Không thu hồi request đã gửi Binance.

## State và kiểm thử

`data/auto-entry-controls.json` atomic rename, default master/routes OFF; mất/corrupt => OFF, route mới OFF. JSON cũ không sửa/migrate/backfill; audit lịch sử chỉ dùng tạo catalog, không tính lợi nhuận hay tự cấp quyền. Restart không tự bật. Đổi setting cần xác thực Orders; local emergency stop vẫn dùng khi Binance auth lỗi. Test `scripts/test-auto-entry-controls.mjs` chỉ mock lệnh, kiểm tra isolation/TP/SL/manual/fail-closed/old-policy; không dùng giao dịch thật để kiểm thử.
# 2026-09-13 — Coin Horizon Sweep LONG/SHORT (controls V8)

Hai dòng mới nằm trong bảng **Các luồng khác**, dùng đúng matcher runtime và mặc định
OFF: `UPPER / LONG` cho chuyển sang quét lên và `LOWER / SHORT` cho chuyển sang quét
xuống. Checkbox route là công tắc Binance thật nhưng vẫn phụ thuộc khóa tổng. Bật một
chiều không bật chiều còn lại và không bật master ngầm.

Profile cố định cho entry mới: 5USDT ký quỹ ×5 =25USDT; SL−25%ROE. TP động lấy mép
gần vùng thanh khoản active đúng phía, không lấy cận ATR, và chỉ vào khi R:R>=1.
TP/SL neo lại từ full-fill. Cần snapshot causal <=90s, đủ4h/8h/12h đồng hướng, mark
drift<=0,5%, không có vị thế/open order, cooldown symbol4h. Lần đầu sau bật/restart
chỉ ghi baseline nên không replay LSK hoặc alert cũ.

Discord ghi trạng thái executor; route/master OFF vẫn chỉ cảnh báo. Entry/close thật
được audit theo exact key vào thống kê ngày trên trang; không đếm DCA. Không thêm
stat card hoặc performance WHITELIST nên rule CLOSED AvgROE>4% cũ không đổi.

JSON additive hai route OFF và file state durable riêng. Legacy `horizonSweepDraft`
nếu còn trong controls được bỏ qua; settings cũ không bị bật/tắt/migrate. Tests
`test-coin-horizon-sweep-binance.mjs` và `test-coin-horizon-sweep-binance-ui.mjs`
dùng mocks/fixture, không gửi lệnh hoặc Discord thật.

## Input cho 11 route ngoài EMA99 (V9, 2026-09-14)

- Catalog `OTHER_ROUTE_EDITABLE_MARGIN_LEVERAGE_TP_V1_20260914` nối đúng 11 exact
  route thuộc Extreme Short Squeeze (3), HTF Deep Base (2), Hybrid Liquidity
  primary/secondary (4) và Coin Horizon UPPER/LOWER (2). Không dùng wildcard và không
  cấp input cho route chỉ quan sát hoặc executor chưa được nối.
- Mỗi dòng có input margin 1–100 USDT và leverage nguyên 1–125x. Chín route TP cố định
  có thêm input TP 1–100% ROE. Horizon vẫn hiển thị TP động theo vùng thanh khoản gần
  nhất, R:R `>=1`, SL `-25% ROE`; không có input TP vì runtime không dùng TP cố định.
- Save độc lập, không bật route OFF, không đổi `enabledAt` và chỉ áp dụng lệnh mới.
  Executor đọc lại setting sau account context, dựng lại plan rồi controls kiểm tra
  margin/leverage/notional/TP exact; plan stale bị chặn. Extreme/HTF giữ SL `-30% ROE`,
  Hybrid không SL riêng. Không sửa lệnh/position/TP/SL hiện tại.
- Dữ liệu causal/classifier, cooldown, freshness, drift, no-position/no-open-order và
  dedupe của từng luồng không đổi. Audit/stats ngày vẫn exact route, entry bỏ DCA và
  PnL net theo position đóng. Không thêm label/card/WHITELIST; CLOSED AvgROE `>4%` và
  default OFF của whitelist giữ nguyên.
- JSON cũ thiếu setting lấy default lịch sử và giữ nguyên `enabled/enabledAt`; field
  `otherEntrySettingsVersion`, `marginUsdt`, `leverage`, `takeProfitRoePct` là additive.
  Giá trị hỏng fail closed nhưng có thể sửa trên UI; không migrate/backfill/replay.
  Tests: `test-other-entry-settings.mjs`, regression policy/bốn builder và UI Horizon/
  Hybrid; tất cả dùng mock/fixture, không gửi lệnh Binance thật.

### SHORT đẹp 1h hậu bơm chạm vùng (2026-09-25)

- Exact route: `post-move-ideal-entry / post-pump-volume-fade-1h /
  SHORT_IDEAL_ENTRY_TOUCH / SHORT`.
- Route seed mặc định OFF. Khi ON, chỉ touch mới sau baseline và `enabledAt` mới được
  xét; candidate lần đầu thấy sẵn trong vùng cũng chỉ baseline. Chỉ `SÁT ĐỈNH` hoặc
  `NẾN GIẢM ĐẦU TIÊN` được vào; stage khác, `WEAKENED` và setup đã nằm trong vùng
  lúc bật không đặt lệnh. SHORT 15m/4h và LONG có exact route riêng.
- Default: margin 10 USDT, leverage 5x, MARKET SHORT, TP +6% ROE, SL −30% ROE.
  Mark mới phải còn trong vùng đẹp; có position hoặc entry order cùng symbol sẽ block.
- State dedupe: `data/post-move-ideal-short-1h-binance.json`. Không replay/retry mù.

### LONG đẹp 1h hậu xả chạm vùng (2026-09-25)

- Exact route: `post-move-ideal-entry / post-dump-volume-recovery-1h /
  LONG_IDEAL_ENTRY_TOUCH / LONG`.
- Checkbox có key đúng matcher runtime và seed mặc định OFF; máy hiện tại bật theo
  yêu cầu. Chỉ touch mới sau baseline/`enabledAt`; candidate lần đầu thấy sẵn trong
  vùng không được replay. Chỉ hai stage LONG ưu tiên được vào; stage khác,
  `WEAKENED` và setup cũ không đặt lệnh. 15m/4h có exact route riêng.
- Default: margin 5 USDT, leverage 5x, MARKET LONG, TP +10% ROE, SL −20% ROE.
  Mark mới phải còn trong vùng; position hoặc entry order cùng symbol sẽ block.
- State dedupe: `data/post-move-ideal-long-1h-binance.json`. Không retry mù; JSON
  state/route additive và tương thích controls cũ.

### LONG đẹp 4h hậu xả chạm vùng (2026-09-25)

- Exact route: `post-move-ideal-entry / post-dump-volume-recovery-4h /
  LONG_IDEAL_ENTRY_TOUCH / LONG`.
- Checkbox exact-key seed mặc định OFF; máy hiện tại ON. Chỉ crossing mới sau
  baseline/`enabledAt`; NEARUSDT hoặc candidate đang sẵn trong vùng lúc bật không
  được hồi tố. Chỉ hai stage LONG ưu tiên được vào; stage khác, `WEAKENED` và setup
  cũ không đặt lệnh.
- Default: margin 10 USDT, leverage 5x, MARKET LONG, TP +10% ROE, SL −20% ROE.
  Mark phải còn trong vùng; position/entry order cùng symbol hoặc đủ 30 vị thế block.
- State dedupe: `data/post-move-ideal-long-4h-binance.json`. Không retry mù; route,
  state và audit fields additive, tương thích JSON controls cũ.

### SHORT đẹp 4h hậu bơm chạm vùng (2026-09-25)

- Exact route: `post-move-ideal-entry / post-pump-volume-fade-4h /
  SHORT_IDEAL_ENTRY_TOUCH / SHORT`; chỉ `SÁT ĐỈNH` hoặc `NẾN GIẢM ĐẦU TIÊN`.
- Checkbox seed OFF và máy hiện tại bật theo yêu cầu. Chỉ crossing mới sau baseline/
  `enabledAt`; stage khác, `WEAKENED` hoặc candidate đã sẵn trong vùng không đặt lệnh.
- Default margin 10 USDT ×5, MARKET SHORT, TP +6%/SL −30% ROE; mark phải còn trong
  vùng và position/entry order cùng symbol hoặc đủ 30 vị thế sẽ block.
- State `data/post-move-ideal-short-4h-binance.json` additive; không retry mù,
  migrate, backfill hay replay.

### Tối ưu tải trang và daily stats (2026-09-26)

- `AUTO_ENTRY_DAILY_STATS_CACHE_V1_20260926` cache kết quả thống kê ngày theo đúng
  revision fill audit, controls và ngày Bangkok. Fill/close hoặc setting mới làm cache
  đổi ngay; công thức entries/open/closed/W/L/PnL không đổi.
- Trang Auto Controls không polling khi tab bị ẩn và refresh ngay khi hiện lại. Đây là
  tối ưu đọc UI; không thay route ON/OFF, master, margin, leverage, TP, SL hoặc quyền
  submit Binance. Response chỉ thêm `cacheVersion`, tương thích consumer cũ.

### Hai thẻ cảnh báo sớm hậu bơm/xả MARKET 3 USDT (2026-09-27)

- Exact LONG: `post-move-impulse / post-dump-no-sell-5m /
  POST_DUMP_NO_SELL_BUY_IMPULSE_LONG / LONG`.
- Exact SHORT: `post-move-impulse / post-pump-no-buy-5m /
  POST_PUMP_NO_BUY_SELL_IMPULSE_SHORT / SHORT`.
- Catalog mặc định OFF; khi operator bật, chỉ `BUY_IMPULSE` vàng hoặc `SELL_IMPULSE`
  cam mới được xét. Margin `3 USDT`, leverage `5x`, TP `+10% ROE`, SL LONG `-20%`,
  SL SHORT `-30%`; stage xác nhận/anti-chase không vào lại.
- Signal phải mới sau startup + enabledAt, `<=90s`, drift `<=0,5%`, không position/
  entry order cùng symbol và tối đa 30 vị thế. JSON cũ thiếu exact flag fail closed.

### Tăng hai route cảnh báo sớm lên MARKET 8 USDT (2026-09-27)

- Hai exact key LONG/SHORT phía trên giữ nguyên và vẫn ON; margin đổi từ 3 thành
  `8 USDT`, leverage giữ `5x` (notional `40 USDT`), TP `+10% ROE`, SL LONG `-20%`,
  SL SHORT `-30%`.
- Chỉ áp dụng lệnh mới. Không đổi classifier/freshness/drift/dedupe/max30, không sửa
  position/order hiện hữu và không replay signal cũ. Controls giữ nguyên `enabledAt`.

### Lọc MAIN KILL UPPER SHORT sau quét (2026-09-27)

- Exact route `LIQSCAN_MAIN_KILL_UPPER_SWEEP_SHORT/SHORT` vẫn dùng input hiện có và
  giữ `1 USDT margin ×5`, TP `+10%`, SL `-30% ROE`; không tăng vốn và không đổi route
  ON/OFF. Trước MARKET, executor V2 bắt buộc giá rút xuống dưới đáy vùng MAIN KILL,
  wick vượt mép trên không quá `0,10%` và không có tín hiệu hướng đối diện cùng symbol
  trong 3 ngày. LOWER/LONG chỉ nhận thêm khóa hai chiều 3 ngày.
- Các case chưa return, sweep quá sâu hoặc hai chiều hiện Discord `OBSERVE ONLY` và
  được ghi decision cohort để forward-test; chúng không được policy V40 cấp quyền.
  Không thêm checkbox WHITELIST/card thống kê mới. JSON cũ thiếu field lọc fail closed;
  state direction được nâng mềm từ attempts cũ, không replay hay sửa lệnh hiện hữu.

### Tăng max position cho hai route impulse lên 50 (2026-09-27)

- Chỉ hai exact route LONG/SHORT `post-move-impulse` dùng `maxOpenPositions=50`
  thay cho 30. Size vẫn `8 USDT ×5`, TP `+10%`, SL LONG `-20%`, SL SHORT `-30%`;
  freshness, drift, dedupe và no-DCA không đổi.

### Giảm hai route post-move xuống 5 USDT (2026-09-27)

- Exact key LONG/SHORT không đổi. LONG vẫn vào tại `BUY_IMPULSE`; SHORT chỉ vào tại
  `NO_BUY_CONFIRMATION` sau 2–3 nến 5m đóng. Cảnh báo sớm/xác nhận vẫn gửi Discord.
- Margin lệnh mới là `5 USDT`, leverage `5x`, notional `25 USDT`; TP `+10%`, SL
  LONG `-20%`, SL SHORT `-30%`, max50. Migration chỉ đổi legacy `8→5`, giữ route
  ON/OFF và `enabledAt`; không sửa lệnh/vị thế hiện hữu.
- Không đổi max của route khác, không replay tín hiệu đã stale/bị chặn và không sửa
  lệnh/vị thế hiện hữu. Policy V41 bắt buộc đúng max50; payload max30 cũ fail closed.

### BTC `_IMPULSE` regime card (2026-09-27)

- `/btc-session-watch.html` hiển thị card `BTC_IMPULSE_REGIME_OBSERVE_V1_20260927`
  từ BTC health 1h/4h, EMA, bull/bear và shock. Card là đánh giá trực quan, **không**
  được dùng làm Binance gate và không thay đổi route/size/entry/SL/TP.
- Exact keys `btc-session:IMPULSE:{SW_UP|SW_DOWN|NEUTRAL|SHOCK|STALE}` được
  normalize và match bằng cùng runtime key. Chúng mặc định OFF, chỉ hiện checkbox
  khi có closed cohort AvgROE `>4%`; hiện chưa có stats nên UI ẩn và không cấp quyền.
- Metadata `btcImpulseRegimeObservation` là additive/versioned; JSON cũ thiếu field
  không match key nhưng vẫn đọc bình thường.

### Điểm vào sau impulse · POST_MOVE_IMPULSE_ENTRY_V1_20260927 (2026-09-27)

- `POST_MOVE_IMPULSE_CANDLE_DISCORD_WEBHOOK_URL` hiện chỉ báo điểm vào đã pass
  RETEST/BASE_BREAK sau impulse vàng/cam. Dữ liệu trước entry là cache 5m đóng,
  ATR/pivot trước impulse, vùng gốc; không dùng PnL/tương lai. R:R ≥1,5 sau chi phí
  giả định 0,12%, pass ≤90 giây, socket ≤15 giây, drift ≤0,35 ATR và mốc còn giữ.
- Theo dõi 60 phút; BTC chỉ tham khảo. Đây là OBSERVE ONLY: không gọi Binance,
  không đổi entry thật/size/SL/TP hoặc exact route hiện hành. LONG BUY_IMPULSE vẫn
  có thể vào theo route cũ trước khi thông báo điểm vào này xuất hiện.
- Card BTC Session dùng keys `btc-session:ENTRY:{LONG|SHORT}:{RETEST|BASE_BREAK}`;
  key runtime và UI cùng helper, mặc định OFF, checkbox chỉ hiện khi CLOSED
  AvgROE >4%. Chưa có cohort đóng nên avgRoe=null, không hiển thị checkbox.
- Runtime matcher chỉ nhận metadata `impulseEntryObservation` đúng V1 và side;
  JSON cũ thiếu field tương thích và không match. State Discord/tracker mới độc lập,
  giữ pending qua restart, không phát lại pass cũ. Counts là số setup/delivery,
  không phải thống kê lệnh thật hay xác suất thắng.

### Discord xác nhận `_IMPULSE` riêng — hành vi giữ nguyên

- `POST_MOVE_IMPULSE_CONFIRMATION_DISCORD_WEBHOOK_URL` chỉ nhận LONG
  `NO_SELL_CONFIRMATION` và SHORT `NO_BUY_CONFIRMATION`. Đây là chuyển tiếp thông
  báo; cảnh báo sớm và late-no-chase không được gửi vào kênh riêng.
- Không cấp quyền Binance mới và không thay đổi exact route, size, leverage, entry,
  TP, SL hoặc max position. State dedupe riêng chỉ ghi signal mới sau restart, không
  replay lịch sử. Không thêm card/WHITELIST.
# BTC relative strength READY — MARKET 2 USDT (2026-09-28)

- Hai route exact: `btc-relative-strength-watch / opposite-btc-5m / RELATIVE_ENTRY_READY / LONG|SHORT`.
- Chỉ state `RELATIVE_ENTRY_READY` có executor; `WAIT_5M_CONFIRM` không gửi Binance.
- Default profile: `2 USDT margin ×5`, TP `+10% ROE`, **không đặt SL gốc** cho cả LONG/SHORT, `maxOpenPositions=50`. Profit-lock chung khi vị thế đã có lãi vẫn hoạt động.
- Nến pass 5m phải đóng sau `enabledAt` và process start, tuổi tối đa 90 giây; mark drift tối đa 0,5%, còn gần vùng tối đa 1,2%, không replay/DCA, cooldown symbol 4 giờ.
- SHORT giữ bối cảnh BTC UP hiện hữu và có thêm nhánh BTC hồi 5m trong downtrend: BTC 5m đóng tăng 0,08–0,75% sau nhịp giảm, còn coin cùng nến giảm ít nhất 0,15%, yếu hơn BTC ít nhất 0,25 điểm %, volume 5m/15m tối thiểu 1,0x/0,75x và taker-buy coin không quá 45%. Không đủ toàn bộ điều kiện thì route không được submit.
- Size/leverage/TP có thể chỉnh cho lệnh mới trong Auto Controls; policy hiện tại chỉ cấp quyền cấu hình exact 2×5/TP10 theo yêu cầu này, nên thay đổi khác sẽ fail-closed cho tới khi policy được cập nhật tương ứng.

# AI PRIORITY engine-zone route · 1 USDT (cập nhật 2026-10-03)

- Exact keys: `local-ai-trend-evaluation / priority-engine-zone / LOCAL_AI_PRIORITY_ENGINE_ZONE_TOUCH / LONG|SHORT`.
- Mặc định seed OFF; bật từng hướng trong Auto Controls. Chỉ candidate `verdict=PRIORITY` sinh sau `enabledAt` và process start được gài 15 phút. Qualification 3/6–6/6 không phải gate.
- Trigger khi Binance MARK đi vào vùng engine; trước submit kiểm tra MARK còn trong vùng, không có position/open entry order và chưa consumed. Một setup tối đa một MARKET.
- Default lệnh mới `1 USDT margin ×5` (notional `5 USDT`), TP `+10% ROE`, SL theo invalidation engine tối đa `50% ROE`; nếu mốc thiếu/0 thì fallback `-20% ROE`, max50. Policy V51 fail-closed nếu source/stream/label/stage/size/protection sai.
- Route không thêm live-card statistics/WHITELIST checkbox. Audit state additive ở `data/local-ai-priority-engine-zone-binance.json`; migration catalog V19 chỉ đổi exact route cũ `3 → 1 USDT`, giữ nguyên switch và `enabledAt`. Route mới vẫn mặc định OFF.

# Protection theo coin: FULL BYPASS (2026-10-02)

- Version controls `AUTO_ENTRY_CONTROLS_V32_FULL_POSITION_PROTECTION_BYPASS_20261002`; runtime `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V5_FULL_POSITION_BYPASS_20261002`.
- Loại `Bỏ qua tạm` giữ nguyên dữ liệu `protectionExclusions` và tự gỡ khi ROE live `>= +15%`, `<= -25%`, gỡ tay hoặc Binance xác nhận close/reversal. Loại mới `Tắt toàn bộ` dùng `protectionFullBypasses` và tuyệt đối không tự gỡ theo ROE; close/reversal hoặc gỡ tay mới xóa.
- Cả hai mode dùng exact symbol, vẫn cho route entry hoạt động nhưng chặn các nhánh tự động tạo/bù/đổi TP/SL, dời protection, profit-lock, missing guard và Fast Wave. Lệnh protection hiện có/thủ công không bị hủy. Size, leverage và điều kiện entry không đổi.
- Mỗi symbol chỉ có một mode; chuyển mode xóa mode cũ. JSON cũ thiếu field mới mặc định mảng rỗng; client/API cũ bỏ qua field additive. Số coin trên UI là audit cấu hình, không phải hiệu suất. Không thêm signal/card/matcher nên không có WHITELIST mới; default OFF và ngưỡng CLOSED AvgROE `>4%` giữ nguyên.
# Protection lifecycle audit V6 — 2026-10-02

- Controls `AUTO_ENTRY_CONTROLS_V33_PROTECTION_BYPASS_LIFECYCLE_AUDIT_20261002`, runtime `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V6_LIFECYCLE_AUDIT_20261002` giữ nguyên hai mode protection và bổ sung lịch sử trạng thái trên trang quản lý.
- Input trước quản lý gồm exact symbol chuẩn hóa (`US` thành `USUSDT`), mode, thao tác người dùng, ROE boundary và xác nhận close/reversal Binance. `ENABLED`, `CLEARED`, `AUTO_CLEARED` cùng reason được lưu tối đa 20; UI hiện 6 event mới nhất. Đây là audit vận hành, không phải thống kê hiệu quả hoặc gate entry.
- Không đổi Binance entry/size/leverage/TP/SL: FULL vẫn bỏ qua toàn bộ protection tới khi gỡ tay hoặc vị thế đóng/đảo chiều; temporary vẫn tự gỡ tại +15%/−25% ROE hoặc hết vòng vị thế. JSON cũ thiếu `protectionExclusionEvents` đọc thành `[]`; không migration. Không có matcher/WHITELIST mới, policy mặc định OFF và CLOSED AvgROE >4% không đổi.

# FULL BYPASS next-position latch V7 — 2026-10-02

- Controls `AUTO_ENTRY_CONTROLS_V34_FULL_BYPASS_NEXT_POSITION_LATCH_20261002`, runtime `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V7_NEXT_POSITION_LATCH_20261002`. `Tắt toàn bộ` lưu thêm `armedAt` và `activeSeenAt` theo exact symbol.
- Nếu bấm khi chưa có vị thế, mode ở `ĐÃ GÀI CHỜ VỊ THẾ`: REST close/stale snapshot cũ không được xóa. Full-fill, vị thế socket hiện hữu hoặc REST position mới chuyển sang `ĐÃ GẮN VỊ THẾ`; close/reversal sau đó mới tự gỡ. Khi bấm lúc đang có vị thế, API bind ngay từ snapshot Position Monitor/Binance hiện hành.
- Ngoài các guard theo stage, Binance client từ chối fail-closed mọi conditional reducing order cho symbol đang exclusion. Vì vậy tạo/bù/dời STOP, TAKE_PROFIT, TRAILING hoặc Algo đều không thể lọt qua một nhánh thiếu guard; MARKET close tay vẫn được phép.
- JSON cũ thiếu `protectionFullBypassLifecycles` được đọc tương thích, không rewrite trade/audit. Không đổi entry, size, leverage hay existing TP/SL; không thêm signal/card/matcher/WHITELIST, default OFF và CLOSED AvgROE `>4%` giữ nguyên.

# Direction-flip fail-closed V8 — 2026-10-03

- Controls `AUTO_ENTRY_CONTROLS_V35_DIRECTION_FLIP_FAIL_CLOSED_20261003`, runtime `BINANCE_SYMBOL_PROTECTION_EXCLUSION_V8_DIRECTION_FLIP_FAIL_CLOSED_20261003`. Case MAGMAUSDT cho thấy Coin Level direction-flip từng gọi thẳng TP-at-entry, nên LIMIT reduce-only không thuộc conditional-order fence V7 và đã lọt qua FULL BYPASS.
- Khi exact symbol đang ở một trong hai mode exclusion, stage `COIN_LEVEL_OBSERVE_FLIP` dừng trước mọi cancel/read-position/MARKET close/TP move. `handleNegativeTimeoutTp` có thêm stage `NEGATIVE_TP_MOVE` ngay mutation boundary, trước đọc/hủy TP và đặt LIMIT, kể cả caller dùng `force=true`.
- Đây là control protection thật: ngăn mutation Binance mới do direction-flip trên coin bị bypass. Không tự cancel lệnh đã tồn tại trước deploy, không đổi entry/size/leverage hoặc rule coin không bypass. Dữ liệu/audit chỉ dùng exact symbol, mode và lifecycle hiện hành; không dùng outcome tương lai hay tạo thống kê hiệu quả.
- JSON V7/cũ đọc nguyên trạng; không thêm field/migration, chỉ nâng version string. Không thêm signal/tier/card/matcher, vì vậy không có WHITELIST mới; default OFF và điều kiện CLOSED `AvgROE >4%` giữ nguyên.
# Vượt MAIN KILL + opposite depth — MARKET 4 USDT (2026-10-03)

- Exact routes: `local-ai-liquidity-breakout-opposite-depth / closed-main-kill-opposite-depth / LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_LONG|SHORT / LONG|SHORT`.
- Mặc định catalog OFF; bật riêng từng hướng. Khi ON, event mới 5m/15m tối đa 2 phút vào MARKET `4 USDT margin ×5`, TP `+10% ROE`, max50. LONG có SL `-20% ROE`; SHORT áp policy bot SHORT TP-only. Từ V3/V6: **ABOVE + BID dưới lớn → LONG màu đỏ; BELOW + ASK trên lớn → SHORT màu xanh**; payload lệch source/stream/label/stage/hướng/size/protection bị policy hiện hành chặn.
- Detector V4 không còn cắt 5 breakout đầu trước khi đọc depth. Mọi symbol breakout đều được phân tích theo batch 5; event đạt xếp theo opposite ratio, coverage và notional. Giới hạn tối đa 5 delivery/executor mỗi vòng là hàng đợi riêng; event đạt dư giữ lại cho vòng 30 giây tiếp theo thay vì bị bỏ qua.
- Dedupe theo eventId, không vào khi có position hoặc open entry order cùng symbol, không replay event trước process start/`enabledAt`. Discord vẫn được gửi và hiển thị kết quả executor.
- Mapping V2 phản chiều đã bị thay thế cho event mới. Vị thế/lệnh cũ không bị tự đóng, đảo hướng hoặc sửa protection; history/attempt cũ giữ side thật đã thực thi để audit.
- Đây là exact Auto Controls route thật, không phải live-card WHITELIST. Không có card thống kê mới; cohort CLOSED chưa đạt/không có AvgROE `>4%` nên không hiện checkbox WHITELIST thống kê.

## 2026-10-04 — Retest LONG follow-up không cấp quyền giao dịch

V2 `OPPOSITE_LONG_RETEST_OBSERVE_V2_RESULT_LABELS_20261004` chỉ tách diễn đạt: timeout = KHÔNG CÓ ĐIỂM VÀO, close dưới đáy = SETUP BỊ VÔ HIỆU, PASS giữ nguyên. Không thêm nhãn giao dịch/cohort/WHITELIST, không đổi policy closed AvgROE >4%, dữ liệu/rule causal V1 hoặc Binance/entry/size/SL/TP. API thêm presentation theo reason; JSON/delivery cũ giữ nguyên, không replay. Kiểm thử tương thích V1 và màu/nhãn trong `test-opposite-liquidity-retest.mjs`.

`OPPOSITE_LONG_RETEST_OBSERVE_V1_20261004` chỉ đánh giá trạng thái của event đã gửi: dùng zone gốc và nến 5m đã đóng sau phát, chờ retest/xác nhận trong 60 phút rồi next open tham chiếu; thủng đáy/hết hạn là FAIL, thiếu dữ liệu là UNVERIFIED. PASS không phải fill hay kết quả thắng, không tính AvgROE. State JSON mới độc lập, event cũ không migration/replay. `binanceEligible:false`; không gọi executor, không bật route LONG, không đổi size/entry/TP/SL/protection. Lifecycle không phải label giao dịch/card thống kê mới: không thêm WHITELIST giả; checkbox/matcher route và policy mặc định OFF, closed AvgROE >4% không đổi. Test `test-opposite-liquidity-retest.mjs` và manager kiểm tra causal, dedupe/retry, lịch sử không gửi và không có đường submit.
# 2026-10-18 — GẦN VÙNG SHORT: route MARKET riêng

`PUMP_TURN_NEAR_SHORT_2USDT_5X_TP10_SL30_V1_20261018`, controlsV41/policyV56/shortTPexemptionV10. Key UI/runtime: `["pump-turn-near-short","live-5m-near-zone","PUMP_TURN_NEAR_SHORT","SHORT"]`. Mặc định seedOFF; user ủy quyền bật đúngroute, giữ master/93routecũ và protection exclusions. Cố định2USDTmargin×5/notional10, TP+10%ROE/SL−30%ROE từfull-fill, maxchung1–50/fallback50. Không nângsize vì minnotional, không quota riêng15.

Pre-entry freeze72closed5m +ticklasttrade≤30s, pump6h≥15%, zone minLOW3×.999×[.995,1], nearPcttheocấu hìnhwatch(default.75); SHORT NEAR/IN_ZONE chưa chờ đỏ/volconfirm. Proofreplayserver, không dựa badgeclient/Discord. Newobserved/live sauenable+runnerstart, ≤30s/chưaexpire, MARKdrift≤.5%cònnear, controls/runtime/protectionON; no position/pendingentrycùngcoin/noDCA/capchung. RechecktrướcMARKET, sharedcausalreservation75s. Discordoff/lỗi không cấp/tước quyền route; attempt panel cho biết xử lý thực, Discord không chứng minh đã khớp.

TP/SL source này giữ cả2legs thay vì SHORTTP6/khôngSL chung; hỗ trợtypes/rounding/haiorderregular-algo phải xácnhận. Ledger`data/pump-turn-near-short-binance.json` durablereservation trướcsubmit, dedupeeventID, unknown khôngtựretry; exact`ptns_`clientid/orderid phục hồi protectionfill mới, cutoff1791364588465giữnguyên. Không quét/sửa lệnh cũ. Audit thêmoptionalprooffields, JSONcũ không migrate/replay. Không cardstat/WHITELIST/PnLcohort mới; panelattemptlàtrạngtháivận hành, không lợi thế. Các cardstat cũ giữ policy closedAvgROE>4%, defaultOFF. Heatmapsweep vẫn DiscordOBSERVE ONLY, hoàn toàn khôngmatcherroute này. Tests `test-pump-turn-near-short-binance.mjs` + controls/policy/protection regressions, chỉmock.

