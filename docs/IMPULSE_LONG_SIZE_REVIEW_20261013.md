# LONG BUY_IMPULSE: mở rộng đánh giá size 1 / 5 USDT

Thời điểm audit: **19:38:47 13/10/2026 (Việt Nam)**. Chỉ rule có proof `IMPULSE_TIME_OR_BTC_MARGIN5_ELSE1_V1_20261001`, direction LONG, source `post-move-impulse`, label `POST_DUMP_NO_SELL_BUY_IMPULSE_LONG`. Range fill có proof: 10:45:27 1/10/2026 đến 19:38:45 13/10/2026. Đây là phân tích mô tả fill thật được audit ghi, **không backtest/counterfactual**, không thay đổi Binance hoặc rule.

## 1. Chất lượng và định nghĩa mẫu

- 523 fill có sizing proof; 506 CLOSED có net PnL; 17 chưa có kết quả đóng đủ điều kiện, không gán PnL giả.
- Phát hiện 42 fill lệch giữa notional/leverage và margin audit (>5% hoặc thiếu), 80 fill thuộc close lifecycle có DCA/nguồn khác/size khác. Các nhóm có giao nhau; lọc tổng 85 fill, còn 421 fill / 420 close lifecycles có thể so sánh audit.
- Chỉ coi lifecycle so sánh khi TOÀN BỘ opening records cùng source/proof/size, không DCA, margin proof khớp margin audit và mỗi record notional/leverage khớp margin trong5%. Đây là kiểm tra nhất quán audit, **không phải đối soát độc lập với Binance historical order/trade**.
- PnL ròng = gross - commission + funding. Audit phân bổ PnL đóng vị thế theo opening filled-notional. Không đếm mỗi fill/DCA thành vị thế độc lập: dùng closeGroupId; thiếu ID fallback đúng opening identity.
- Ngày thống kê = ngày fill đầu vào theo UTC+7, không phải ngày đóng. CLOSED đủ điều kiện tính đến thời điểm audit; cohort có thể còn open, selection/censoring khác nhau.
- Phiên bản sizing là một nhưng detector/protection/exit khác có thể thay đổi theo thời gian. Không coi đây là thí nghiệm kiểm soát; size1 và5 không vào cùng coin/cùng thời điểm.

Source SHA256: `042a3270ea3888a3eac113127d2bdb1a6a674100bea1fd8bf1921552488d103b`. Script chỉ đọc: `scripts/research-impulse-sizing-long-20261013.mjs`; chạy lại sau khi state thay đổi có thể ra số mới.

## 2. Tất cả fill có nhãn size — chưa loại trộn/lệch

| Nhóm | Fill / vị thế đóng | Thắng / thua | Net USDT | PF |
|---|---:|---:|---:|---:|
| 5 | 325 / 314 | 172 / 142 | -32,18 | 0,62 |
| 1 | 181 / 156 | 91 / 65 | 7,66 | 1,18 |

Không gọi các khoản −9/−10 USDT trong nhóm nominal1/5 là thua từ một lệnh đúng1/5USDT trước khi tách DCA/notional.
Lifecycle trộn size có thể xuất hiện ở cả hai nhóm nominal; không cộng số vị thế của bảng này thành tổng vị thế tài khoản. Các nhóm sau lọc nhất quán size là rời nhau.

## 3. Sau lọc nhất quán audit

| Nhóm | Fill / vị thế đóng | Thắng / thua | Net USDT | PF |
|---|---:|---:|---:|---:|
| 5 | 294 / 293 | 159 / 134 | -20,91 | 0,60 |
| 1 | 127 / 127 | 69 / 58 | 0,35 | 1,10 |

- Size5 win rate **54,27%**, nhưng thắng bình quân **0,20 USDT**, thua bình quân **-0,39 USDT**. Với payoff thực tế này, cần khoảng **66,44%** thắng để hòa vốn (giữ nguyên payoff quan sát, không phải xác suất dự báo).
- Size1 win rate 54,33%, PF 1,10, chỉ +0,35USDT toàn kỳ: chưa có cơ sở gọi là lợi thế mạnh.
- Size5 gross −13,51, commission 6,96, funding -0,44 -> net -20,91. **Không chỉ do phí:** gross đã âm.
- 84,74% phần âm size5 toàn kỳ nằm trong cohort13/10. Trước13/10: 256 vị thế, net -3,19USDT. Không phải ngày nào cũng âm nặng.

## 4. Theo lý do cấp size

| Nhóm | Fill / vị thế đóng | Thắng / thua | Net USDT | PF |
|---|---:|---:|---:|---:|
| BTC_ALIGNED | 160 / 160 | 91 / 69 | -6,19 | 0,73 |
| GOOD_HOUR_AND_BTC_ALIGNED | 79 / 78 | 39 / 39 | -8,22 | 0,52 |
| GOOD_HOUR | 55 / 55 | 29 / 26 | -6,50 | 0,45 |
| BASE_SIZE | 127 / 127 | 69 / 58 | 0,35 | 1,10 |

Rule hiện tại: size5 khi GIỜ TỐT **HOẶC** BTC trend label cùng hướng còn mới <=120s; còn lại size1. LONG giờ tốt03–06 và12–15VN. Không đòi BTC15m đang tăng hay breadth altcoin mạnh. Cả ba nhánh tăng size đều âm trong mẫu lọc; ngay cả giờ tốt + BTCaligned cũng không tự chứng minh lợi thế.

## 5. Theo ngày entry (mẫu lọc)

| Ngày VN | Size5: vị thế · netUSDT | Size1: vị thế · netUSDT |
|---|---:|---:|
| 2026-10-01 | 37 · -0,17 | 10 · -0,28 |
| 2026-10-02 | 30 · -1,25 | — |
| 2026-10-03 | 9 · 0,79 | 27 · 0,45 |
| 2026-10-04 | 1 · 0,13 | 2 · 0,10 |
| 2026-10-05 | 12 · 0,29 | — |
| 2026-10-06 | 26 · -0,16 | 8 · 0,05 |
| 2026-10-07 | — | 4 · -0,08 |
| 2026-10-08 | 5 · 1,27 | 12 · -0,65 |
| 2026-10-09 | 40 · -2,17 | 15 · 0,86 |
| 2026-10-10 | 34 · 0,54 | — |
| 2026-10-11 | 28 · 1,18 | — |
| 2026-10-12 | 34 · -3,63 | 13 · -1,32 |
| 2026-10-13 | 37 · -17,72 | 36 · 1,23 |

Dấu — = không có CLOSED đủ điều kiện cho ô đó, không giả lãi/lỗ0. Ngày13 size5 12 thắng/25 thua, net -17,72; size1 cohort khác nên không kết luận đổi mọi lệnh5 thành1 sẽ có cùng kết quả.

## 6. BTC tại bước xét entry

| Nhóm | Fill / vị thế đóng | Thắng / thua | Net USDT | PF |
|---|---:|---:|---:|---:|
| BTC15_NONPOSITIVE | 129 / 129 | 75 / 54 | -6,00 | 0,72 |
| BTC15_UP_GE_0_15 | 49 / 49 | 30 / 19 | -1,72 | 0,80 |
| BTC15_SMALL_UP | 116 / 116 | 54 / 62 | -13,18 | 0,40 |

- 129/294 fill size5 có BTC15m<=0, dù có thể mang nhãn BTC_UP hoặc đủ giờ.
- BTC15m tăng nhẹ0–0,15% là bin âm nhất: -13,18USDT.
- Bin BTC15m>=0,15% vẫn âm. **Không lấy một ngưỡng BTC xanh làm fix đã chứng minh.**
- Các mức0/0,15% là phân nhóm khám phá, không tối ưu/backtest độc lập. Không có frozen breadth/volume/EMA/RSI coin đầy đủ trong audit này để kết luận “alt yếu tại mỗi entry” hoặc chọn gate hiệu quả.

## 7. Kết quả đóng của size5

| Nhóm | Fill / vị thế đóng | Thắng / thua | Net USDT | PF |
|---|---:|---:|---:|---:|
| BOT_OR_MANUAL_CLOSE_FILLED | 21 / 21 | 9 / 12 | 0,40 | 1,99 |
| STOP_LOSS_FILLED | 49 / 49 | 0 / 49 | -50,19 | 0,00 |
| POSITION_CLOSED_ON_BINANCE | 192 / 191 | 118 / 73 | 14,19 | 9,83 |
| TAKE_PROFIT_FILLED | 32 / 32 | 32 / 0 | 14,70 | — |

49 STOP_LOSS khoảng −50,19USDT; 32 TAKE_PROFIT khoảng +14,70USDT. 191 lifecycle POSITION_CLOSED_ON_BINANCE +14,19USDT nhưng không có lý do chi tiết đủ để gán hết cho một module đóng sớm. Nhãn này có thể gồm đóng tay, đóng bot/protection khác; **không suy ra một bot cụ thể cắt lãi**.

Payoff bị nhiều lãi nhỏ và các SL đầy đủ chi phối; cần đối chiếu exact closing order/clientID/exit path trước khi sửa TP/SL/profit-lock.

## 8. Ví dụ audit DCA, không phải một lệnh đúng size5

AINUSDT12/10: opening bot `pm5l_` qty568, notional24,95792USDT, margin5, isDca=false. Fill sau có isDca=true, notional203,82156USDT nhưng kế thừa margin5 và nhãn signal. DCA đó được phân bổ PnL−9,4118USDT; cả hai cùng closeGroupId. Không được diễn giải “một lệnh size5 thua9,41”.

Các ví dụ lệch khác:
- NIGHTUSDT: planned1, notional254,32 / leverage5; implied margin50,86; auditnet-10,53USDT.
- ALCHUSDT: planned1, notional200,23 / leverage5; implied margin40,05; auditnet-9,51USDT.
- AINUSDT: planned5, notional203,82 / leverage5; implied margin40,76; auditnet-9,41USDT.
- DIAUSDT: planned5, notional190,55 / leverage5; implied margin38,11; auditnet-8,89USDT.

Implied margin chỉ là phép chia từ dữ liệu audit, không khẳng định broker đã tự nâng size hoặc nguồn DCA do ai thực hiện.

## 9. Kết luận và bước cần kiểm chứng

1. Size5 làm tăng exposure của cohort hiện chưa chứng minh edge; vấn đề chính là payoff và lựa chọn giờ/BTC label, không bản thân con số5.
2. Thua nặng tập trung13/10; cần phân tầng market regime/breadth trước entry, không dùng snapshot19:22 gán ngược cho các lệnh quá khứ.
3. Cần đối soát DCA/actual executed qty/margin trước khi dùng bảng nominal để điều chỉnh size.
4. Tiếp theo nên backtest/cross-validation riêng: bỏ tăng size vì giờ đơn thuần; BTC strength+breadth+coin relative strength; giữ nguyên mẫu entry để tách ảnh hưởng sizing/entry/exit. Đây là hướng nghiên cứu, **chưa áp gate**.
5. Không thêm card/nhãn runtime/cohort/WHITELIST; không đổi rule `IMPULSE_TIME_OR_BTC_MARGIN5_ELSE1_V1_20261001`, size/entry/SL/TP/protection/lệnh cũ; không restart/commit/push hoặc gửi test lệnh/thông báo.
