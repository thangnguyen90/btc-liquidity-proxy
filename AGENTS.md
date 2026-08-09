# Repository working rule

- Sau mỗi lần thay đổi logic tín hiệu, nhãn, tier, thống kê, snapshot, gate, size,
  entry, SL hoặc TP, phải cập nhật Markdown trong cùng lượt làm việc.
- Ghi rule đang chạy vào `docs/CURRENT_DECISION_AND_EMA_RULES.md` và thêm mục tóm tắt
  theo ngày vào `docs/CODEX_TRADING_LOGIC.md`.
- Mỗi mục phải nêu rõ: version, dữ liệu dùng trước entry, điều kiện phân loại, cách
  thống kê, có hay không ảnh hưởng Binance/entry/size/SL/TP, và cách tương thích JSON cũ.
- Không mô tả một nhãn là gate hoặc rule giao dịch thật nếu code chỉ `OBSERVE ONLY`.
- Mỗi khi thêm nhãn/card thống kê mới, phải nối checkbox `WHITELIST` trong cùng lượt:
  key UI phải khớp matcher runtime, mặc định tắt, tuân thủ policy chỉ hiện khi closed
  `AvgROE > 4%`, và phải cập nhật test cùng tài liệu whitelist/Binance.
