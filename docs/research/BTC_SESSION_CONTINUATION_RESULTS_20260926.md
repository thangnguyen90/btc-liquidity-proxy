# Backtest BTC, khung giờ và mẫu bơm → hồi → tiếp diễn

Ngày lập: 26/09/2026 · Giờ Việt Nam (UTC+7). Version `BTC_SESSION_CONTINUATION_RESEARCH_V1_20260926`.

## Kết luận chính

- Có bằng chứng mô tả rằng **20h–02h biến động mạnh hơn**, lặp lại trong 14 ngày cuối. Không đồng nghĩa giá sẽ tăng hay LONG có lợi nhuận.
- Chưa có bằng chứng vững rằng **06h–08h luôn có đợt bơm/xả mạnh hơn** giờ khác. Hiệu ứng này không nổi bật trong mẫu 55 ngày.
- Quy tắc LONG bơm → retest → tiếp diễn được thử **chưa chứng minh lợi thế bền vững sau phí**. Bộ lọc BTC làm kết quả toàn kỳ đẹp hơn nhưng thất bại trong mẫu cuối. Không nên bật thêm lệnh tự động từ kết quả này.
- Không xác định được đỉnh/đáy tương lai một cách chắc chắn. Backtest này thử các mốc đã biết trước entry, không dùng swing tương lai để làm đẹp kết quả.

## Phạm vi và chất lượng dữ liệu

- 02/08–25/09/2026: **55 ngày đầy đủ, 1.320 giờ**. 12/09–25/09 là tập kiểm tra thời gian 14 ngày; loại 6 giờ tín hiệu trước ranh giới để tránh kết quả giao nhau.
- BTC + 60 crypto USDT Futures, chọn bằng quote volume tháng 7/2026, không chọn coin dựa vào mức tăng trong kỳ. Loại hợp đồng TradFi/cổ phiếu/hàng hóa và token vàng. Không lọc theo trạng thái còn niêm yết hôm nay.
- 983,808 nến 5m đã tải gồm warm-up/đoạn đo kết quả; 1,586 ZIP chính kiểm SHA256, 0 archive thiếu; tổng 0 khoảng gián đoạn nội bộ. Mỗi giờ trong phân tích có đủ 60 altcoin.
- Nguồn: [Binance Public Data — Futures kline và checksum](https://github.com/binance/binance-public-data). Chỉ dùng API exchangeInfo để phân loại loại tài sản; không dùng API giao dịch/tài khoản.
- Đây là backtest quy tắc nghiên cứu mới, **không phải thống kê lệnh thật hay kiểm chứng toàn bộ logic bot hiện tại**.

## 1. So sánh khung giờ

Các số dưới là trung bình trên **mỗi giờ**, không so tổng số sự kiện của khung 2 giờ với khung 6 giờ. “Biến động” = trị tuyệt đối lợi suất open→close 1h, không phải toàn bộ biên high–low. Tỷ lệ pump/dump = tỷ lệ coin có return giờ ≥+2% hoặc ≤−2%, rồi bình quân các giờ.

| Mẫu | Khung VN | Số giờ | BTC biến động TB | Alt biến động TB | Coin tăng ≥2%/giờ | Coin giảm ≥2%/giờ |
|---|---|---:|---:|---:|---:|---:|
| 55 ngày | 06-08 | 110 | 0.216% | 0.748% | 4.42% | 2.53% |
| 55 ngày | 20-02 | 330 | 0.303% | 0.870% | 5.06% | 4.37% |
| 55 ngày | other | 880 | 0.218% | 0.796% | 4.28% | 3.80% |
| 14 ngày cuối | 06-08 | 28 | 0.231% | 0.712% | 4.76% | 1.37% |
| 14 ngày cuối | 20-02 | 84 | 0.318% | 0.933% | 5.42% | 5.36% |
| 14 ngày cuối | other | 224 | 0.211% | 0.806% | 4.41% | 3.53% |

Toàn kỳ, khung đêm: mức biến động BTC cao hơn 38.9%, alt cao hơn 9.4% so với nhóm giờ còn lại. Đây là chênh lệch tương đối của biến động, không phải lợi nhuận giao dịch.

Khoảng tin cậy 95% cho chênh lệch biến động đêm − giờ khác, bootstrap cặp theo ngày (đơn vị điểm phần trăm):

| Mẫu | BTC | Alt |
|---|---:|---:|
| all | 0.031 đến 0.140 | 0.028 đến 0.121 |
| holdout | 0.018 đến 0.209 | 0.050 đến 0.215 |

Buổi đêm có cả hai chiều. Trong 14 ngày cuối: 5,42% coin tăng ≥2%/giờ và 5,36% coin giảm ≥2%/giờ. Vì vậy câu “đêm thường bơm cao” cần sửa thành “đêm dễ có biến động lớn hai chiều”.

### Kiểm tra độ bền mô tả

| Tập | BTC đêm / giờ khác | Alt đêm / giờ khác |
|---|---:|---:|
| development | 1.35× | 1.07× |
| holdout | 1.51× | 1.16× |
| weekday | 1.43× | 1.13× |
| weekend | 1.21× | 0.99× |
| Bỏ ngày BTC biến động TB lớn nhất (2026-08-21) | 1.48× | 1.09× |

Đây là kiểm tra mô tả bổ sung sau lần chạy đầu, không phải chọn lại tham số strategy. Bootstrap theo ngày chưa mô hình hóa toàn bộ phụ thuộc kéo dài nhiều ngày; không khẳng định tính mùa vụ lâu dài.

## 2. BTC biến động mạnh có kéo theo alt không?

Ngưỡng giờ BTC lớn = top 10% |return 1h| ở giai đoạn đầu: **0.517%**. Đo đồng thời cùng giờ, không dùng để dự đoán giờ đó từ trước.

| Mẫu | Alt biến động khi BTC mạnh | Khi BTC bình thường |
|---|---:|---:|
| all | 1.311% (135 giờ) | 0.753% (1185 giờ) |
| holdout | 1.361% (36 giờ) | 0.766% (300 giờ) |

Mối liên hệ đồng thời rõ, nhưng không chứng minh BTC vừa bơm thì alt chắc chắn còn tăng sau thời điểm vào. Phần dưới kiểm tra entry sau nến đóng để tránh nhầm quan sát đồng thời thành khả năng dự báo.

## 3. Backtest vào lệnh sau bơm / hồi giữ nền

Protocol đã cố định trước khi tính kết quả. LONG: impulse 15m body ≥1%, range ≥1,8 ATR, volume ≥1,8 lần, đóng phá đỉnh 12 nến; chờ retest mốc phá với volume co lại, rồi nến 5m tiếp diễn. SL dưới cực trị đã quan sát có buffer, TP cực trị thuận chiều đã biết, RR ≥1,5; vào open 5m kế tiếp. SHORT đối xứng là **sập → hồi lên → giảm tiếp**, không phải short bắt đỉnh sau pump.

Giữ tối đa 6h; fee 0,05% mỗi chiều, slippage bất lợi 0,03% mỗi chiều (~0,16% roundtrip), chưa funding. Stress tăng tổng chi phí lên khoảng 0,30%. Return tính trên giá trị vị thế (notional), không phải ROE margin. Một nến chạm cả TP/SL tính SL trước; gap qua SL khớp giá xấu hơn. Không mô phỏng danh mục dùng chung vốn/đòn bẩy nên không suy diễn tổng return thành tăng trưởng tài khoản.

| Mẫu | Hướng / bộ lọc | N | Thắng | TB/lệnh sau phí | PF | TB stress |
|---|---|---:|---:|---:|---:|---:|
| all | LONG baseline | 144 | 35.4% | -0.009% | 0.99 | -0.149% |
| all | LONG btcTrend | 67 | 40.3% | 0.225% | 1.26 | 0.085% |
| all | LONG btcTrendImpulse | 31 | 45.2% | 0.398% | 1.51 | 0.258% |
| all | SHORT baseline | 83 | 37.3% | 0.028% | 1.04 | -0.112% |
| all | SHORT btcTrend | 14 | 35.7% | -0.123% | 0.83 | -0.263% |
| all | SHORT btcTrendImpulse | 7 | 57.1% | 0.369% | 1.76 | 0.229% |
| holdout | LONG baseline | 39 | 35.9% | 0.020% | 1.02 | -0.120% |
| holdout | LONG btcTrend | 19 | 31.6% | -0.109% | 0.88 | -0.249% |
| holdout | LONG btcTrendImpulse | 8 | 37.5% | -0.152% | 0.82 | -0.292% |
| holdout | SHORT baseline | 24 | 37.5% | -0.165% | 0.80 | -0.305% |
| holdout | SHORT btcTrend | 5 | 20.0% | -0.535% | 0.35 | -0.675% |
| holdout | SHORT btcTrendImpulse | 2 | 50.0% | 0.110% | 1.18 | -0.030% |

`btcTrend`: giá BTC/EMA13/EMA25 và return 1h cùng hướng. `btcTrendImpulse`: thêm BTC phá mốc 6 nến 5m với volume ≥1,2 lần trong 15 phút vừa qua. Đây là lọc cùng các entry baseline đã khử trùng; không phải mỗi variant tự tái tìm những entry bị baseline bỏ vì đang có lệnh.

Điểm cần chú ý:

- LONG có cả BTC trend + impulse: toàn kỳ 31 lệnh, TB +0,398%, nhưng 14 ngày cuối chỉ 8 lệnh, TB −0,152%, PF 0,82. Kết quả dương toàn kỳ chưa lặp lại.
- Khoảng tin cậy 95% TB LONG trend+impulse toàn kỳ: −0,425% đến +1,070%; tập cuối −1,553% đến +1,068%. Cả hai đều chứa 0 và mẫu cuối rất ít.
- LONG baseline median toàn kỳ âm −0,932%/lệnh; tỷ lệ thắng chỉ 35,4%. Một số lệnh thắng lớn bù nhiều lệnh thua, không phải setup có xác suất thắng cao.
- Riêng LONG buổi đêm: 31 lệnh toàn kỳ TB +0,417%; 13 lệnh giai đoạn cuối TB −0,448%. Không nên dùng “đúng giờ” làm lý do tự LONG.
- SHORT continuation cũng chưa có lợi thế rõ; không ngoại suy kết quả sang bot SHORT sau pump vì đó là một logic khác.

### Sáu lệnh gần nhất trong mô phỏng (không chọn theo thắng/thua)

| Giờ vào VN | Coin | Hướng | Entry mô phỏng | SL | TP | Kết quả | Return sau phí |
|---|---|---|---:|---:|---:|---|---:|
| 23/09 23:40 | AKEUSDT | LONG | 0.046884061 | 0.044603607 | 0.052279 | SL | -4.990% |
| 24/09 19:40 | UNIUSDT | SHORT | 8.967309 | 9.0795893 | 8.775 | SL | -1.383% |
| 24/09 20:25 | BCHUSDT | SHORT | 334.96948 | 339.29375 | 324.01 | SL | -1.422% |
| 25/09 03:30 | LABUSDT | LONG | 0.060548159 | 0.059139464 | 0.06328 | SL | -2.455% |
| 25/09 10:35 | BEATUSDT | LONG | 0.09392817 | 0.092455357 | 0.0975 | TP | 3.670% |
| 25/09 23:05 | SUIUSDT | LONG | 1.1092327 | 1.0861929 | 1.1612 | TP | 4.551% |

## 4. Cách dùng kết quả mà không hiểu nhầm

1. Khung 20h–02h phù hợp tăng ưu tiên **quan sát hai chiều**, không tự động tăng size hoặc bật LONG.
2. Dùng vùng kháng cự cũ sau breakout làm vùng hỗ trợ tham khảo khi retest. Nếu giá xuyên thủng vùng, phải coi setup hết hiệu lực, không mặc định đó là đáy.
3. BTC/độ rộng thị trường nên là dữ liệu bối cảnh; bộ lọc BTC cụ thể đã thử chưa đủ ổn để nâng thành điều kiện giao dịch thật.
4. Nếu phát triển tiếp, giữ nguyên bản thử và chạy forward paper trên dữ liệu tương lai; không sửa ngưỡng để làm đẹp cùng 55 ngày này. Cần nhiều hơn vài lệnh ngoài mẫu và kiểm tra phí/funding/độ trễ thực tế trước khi xét tiền thật.

## Hạn chế và khả năng tái lập

- Chỉ 55 ngày và top60 theo tháng7; coin mới niêm yết, coin nhỏ và chế độ thị trường khác có thể khác hẳn. Không thể kết luận chung cho “mùa này” kéo dài nhiều tháng.
- Người dùng hình thành giả thuyết sau khi quan sát gần đây, nên 14 ngày cuối là kiểm tra tách theo thời gian, **không phải dữ liệu hoàn toàn chưa từng được con người nhìn thấy**. Cần forward test để xác nhận thật.
- OHLCV 5m không cho thứ tự tick, spread, khả năng khớp hoặc latency. Slippage/fee là giả định; chưa funding. Không áp dụng đòn bẩy để quảng cáo lợi nhuận.
- Giờ đêm nhóm 20–02 theo giờ đồng hồ, cluster bootstrap theo ngày lịch VN. Bảng 24 giờ bên dưới là khám phá, không đã hiệu chỉnh multiple-testing để chọn một “giờ thần kỳ”.
- Không thay runtime, route, whitelist, entry/size/SL/TP hay JSON cũ. Các nhãn trong báo cáo chỉ phục vụ nghiên cứu.

Chạy lại từ root repository:

```sh
python3 scripts/research-btc-session-data.py
python3 scripts/test-research-btc-session.py
nice -n 10 python3 scripts/research-btc-session-analysis.py
python3 scripts/research-btc-session-report.py
```

Kiểm chứng: 8 unit test cho khung giờ, nến thiếu, tính phí, gap SL, TP/SL cùng nến, dữ liệu tương lai; audit đối chiếu 744 nến 1h nguyên bản mỗi BTC/ETH với tổng hợp từ 5m, và kiểm tra thêm dữ liệu tương lai không sửa entry cũ của ARB/UNI/PUMP. Chạy `python3 scripts/audit-research-btc-session.py`; kết quả lưu `audit.json`.

Dữ liệu/máy đọc: `data/research/btc-session-20260926/{summary,hourly,trades,events,quality,selected-universe}.json`. ZIP và SHA256 lưu cùng thư mục con `archives`; không cần token/secret. Chi tiết ngưỡng: [protocol](BTC_SESSION_CONTINUATION_PREREG_20260926.md).

## Phụ lục: 24 giờ VN (khám phá, không phải khuyến nghị chọn giờ)

| Giờ bắt đầu | BTC biến động TB 55d | Alt biến động TB 55d | BTC biến động TB 14d cuối | Alt biến động TB 14d cuối |
|---|---:|---:|---:|---:|
| 00:00 | 0.206% | 0.786% | 0.269% | 0.847% |
| 01:00 | 0.197% | 0.762% | 0.265% | 0.894% |
| 02:00 | 0.172% | 0.706% | 0.233% | 0.765% |
| 03:00 | 0.171% | 0.691% | 0.168% | 0.664% |
| 04:00 | 0.215% | 0.749% | 0.228% | 0.714% |
| 05:00 | 0.187% | 0.771% | 0.209% | 0.840% |
| 06:00 | 0.190% | 0.662% | 0.179% | 0.646% |
| 07:00 | 0.241% | 0.835% | 0.283% | 0.779% |
| 08:00 | 0.250% | 0.832% | 0.235% | 0.824% |
| 09:00 | 0.278% | 0.887% | 0.283% | 0.928% |
| 10:00 | 0.160% | 0.809% | 0.173% | 0.909% |
| 11:00 | 0.164% | 0.783% | 0.141% | 0.794% |
| 12:00 | 0.197% | 0.819% | 0.143% | 0.704% |
| 13:00 | 0.175% | 0.779% | 0.144% | 0.739% |
| 14:00 | 0.182% | 0.779% | 0.186% | 0.807% |
| 15:00 | 0.415% | 0.877% | 0.507% | 0.979% |
| 16:00 | 0.263% | 0.854% | 0.230% | 0.860% |
| 17:00 | 0.155% | 0.799% | 0.166% | 0.743% |
| 18:00 | 0.207% | 0.769% | 0.188% | 0.813% |
| 19:00 | 0.300% | 0.827% | 0.141% | 0.809% |
| 20:00 | 0.335% | 0.845% | 0.478% | 0.848% |
| 21:00 | 0.467% | 1.003% | 0.471% | 1.097% |
| 22:00 | 0.400% | 0.925% | 0.298% | 0.932% |
| 23:00 | 0.212% | 0.902% | 0.130% | 0.978% |

Universe: ETHUSDT, SOLUSDT, ZECUSDT, HYPEUSDT, BANKUSDT, XRPUSDT, LABUSDT, DOGEUSDT, AKEUSDT, DEXEUSDT, BNBUSDT, EVAAUSDT, 1000PEPEUSDT, ADAUSDT, WLDUSDT, NEARUSDT, SUIUSDT, ESPORTSUSDT, TLMUSDT, VANRYUSDT, AAVEUSDT, ONDOUSDT, UNIUSDT, LINKUSDT, ENAUSDT, BCHUSDT, RIFUSDT, PUMPUSDT, COTIUSDT, REUSDT, AVAXUSDT, TAOUSDT, XLMUSDT, 1000SHIBUSDT, KAITOUSDT, LITUSDT, VELVETUSDT, ALLOUSDT, ONUSDT, EULUSDT, SYNUSDT, BEATUSDT, LTCUSDT, TAIKOUSDT, SLXUSDT, TUSDT, FILUSDT, DOTUSDT, USUSDT, TACUSDT, TRUMPUSDT, 1000XECUSDT, BUSDT, EDGEUSDT, OUSDT, ERAUSDT, ARBUSDT, 1000BONKUSDT, TRXUSDT, NFPUSDT
