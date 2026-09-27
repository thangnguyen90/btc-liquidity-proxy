"""Render reproducible Markdown research report from calculated JSON, no bot writes."""
import importlib.util
import json
from collections import defaultdict
from pathlib import Path
import statistics as st

spec = importlib.util.spec_from_file_location('research', Path(__file__).with_name('research-btc-session-analysis.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
ROOT = m.ROOT


def fmt(v, digits=3):
    return '—' if v is None else f'{v:.{digits}f}'


def main():
    r = json.loads((ROOT / 'summary.json').read_text())
    hours = json.loads((ROOT / 'hourly.json').read_text())
    trades = json.loads((ROOT / 'trades.json').read_text())
    selected = json.loads((ROOT / 'selected-universe.json').read_text())
    lines = [
        '# Backtest BTC, khung giờ và mẫu bơm → hồi → tiếp diễn', '',
        'Ngày lập: 26/09/2026 · Giờ Việt Nam (UTC+7). Version `BTC_SESSION_CONTINUATION_RESEARCH_V1_20260926`.', '',
        '## Kết luận chính', '',
        '- Có bằng chứng mô tả rằng **20h–02h biến động mạnh hơn**, lặp lại trong 14 ngày cuối. Không đồng nghĩa giá sẽ tăng hay LONG có lợi nhuận.',
        '- Chưa có bằng chứng vững rằng **06h–08h luôn có đợt bơm/xả mạnh hơn** giờ khác. Hiệu ứng này không nổi bật trong mẫu 55 ngày.',
        '- Quy tắc LONG bơm → retest → tiếp diễn được thử **chưa chứng minh lợi thế bền vững sau phí**. Bộ lọc BTC làm kết quả toàn kỳ đẹp hơn nhưng thất bại trong mẫu cuối. Không nên bật thêm lệnh tự động từ kết quả này.',
        '- Không xác định được đỉnh/đáy tương lai một cách chắc chắn. Backtest này thử các mốc đã biết trước entry, không dùng swing tương lai để làm đẹp kết quả.', '',
        '## Phạm vi và chất lượng dữ liệu', '',
        '- 02/08–25/09/2026: **55 ngày đầy đủ, 1.320 giờ**. 12/09–25/09 là tập kiểm tra thời gian 14 ngày; loại 6 giờ tín hiệu trước ranh giới để tránh kết quả giao nhau.',
        '- BTC + 60 crypto USDT Futures, chọn bằng quote volume tháng 7/2026, không chọn coin dựa vào mức tăng trong kỳ. Loại hợp đồng TradFi/cổ phiếu/hàng hóa và token vàng. Không lọc theo trạng thái còn niêm yết hôm nay.',
        f"- {sum(x['bars'] for x in r['quality']['quality']):,} nến 5m đã tải gồm warm-up/đoạn đo kết quả; {r['quality']['filesRequested']:,} ZIP chính kiểm SHA256, {len(r['quality']['missingArchives'])} archive thiếu; tổng {sum(x['gaps'] for x in r['quality']['quality'])} khoảng gián đoạn nội bộ. Mỗi giờ trong phân tích có đủ 60 altcoin.",
        '- Nguồn: [Binance Public Data — Futures kline và checksum](https://github.com/binance/binance-public-data). Chỉ dùng API exchangeInfo để phân loại loại tài sản; không dùng API giao dịch/tài khoản.',
        '- Đây là backtest quy tắc nghiên cứu mới, **không phải thống kê lệnh thật hay kiểm chứng toàn bộ logic bot hiện tại**.', '',
        '## 1. So sánh khung giờ', '',
        'Các số dưới là trung bình trên **mỗi giờ**, không so tổng số sự kiện của khung 2 giờ với khung 6 giờ. “Biến động” = trị tuyệt đối lợi suất open→close 1h, không phải toàn bộ biên high–low. Tỷ lệ pump/dump = tỷ lệ coin có return giờ ≥+2% hoặc ≤−2%, rồi bình quân các giờ.', '',
        '| Mẫu | Khung VN | Số giờ | BTC biến động TB | Alt biến động TB | Coin tăng ≥2%/giờ | Coin giảm ≥2%/giờ |',
        '|---|---|---:|---:|---:|---:|---:|',
    ]
    for period in ['all', 'holdout']:
        for s in ['06-08', '20-02', 'other']:
            v = r['sessions'][period][s]
            lines.append(f"| {'55 ngày' if period == 'all' else '14 ngày cuối'} | {s} | {v['hours']} | {fmt(v['btcAbsPct'])}% | {fmt(v['altAbsPct'])}% | {fmt(v['altPumpRate'],2)}% | {fmt(v['altDumpRate'],2)}% |")
    night, other = r['sessions']['all']['20-02'], r['sessions']['all']['other']
    lines += ['', f"Toàn kỳ, khung đêm: mức biến động BTC cao hơn {fmt((night['btcAbsPct']/other['btcAbsPct']-1)*100,1)}%, alt cao hơn {fmt((night['altAbsPct']/other['altAbsPct']-1)*100,1)}% so với nhóm giờ còn lại. Đây là chênh lệch tương đối của biến động, không phải lợi nhuận giao dịch.", '',
              'Khoảng tin cậy 95% cho chênh lệch biến động đêm − giờ khác, bootstrap cặp theo ngày (đơn vị điểm phần trăm):', '',
              '| Mẫu | BTC | Alt |', '|---|---:|---:|']
    for p in ['all', 'holdout']:
        a = r['sessions'][p]['pairedVsOther']['20-02']
        lines.append(f"| {p} | {fmt(a['btcAbsPct']['ci95'][0])} đến {fmt(a['btcAbsPct']['ci95'][1])} | {fmt(a['altAbsPct']['ci95'][0])} đến {fmt(a['altAbsPct']['ci95'][1])} |")
    lines += ['', 'Buổi đêm có cả hai chiều. Trong 14 ngày cuối: 5,42% coin tăng ≥2%/giờ và 5,36% coin giảm ≥2%/giờ. Vì vậy câu “đêm thường bơm cao” cần sửa thành “đêm dễ có biến động lớn hai chiều”.', '',
              '### Kiểm tra độ bền mô tả', '', '| Tập | BTC đêm / giờ khác | Alt đêm / giờ khác |', '|---|---:|---:|']
    for p in ['development', 'holdout', 'weekday', 'weekend']:
        ss = r['sessions'][p]
        lines.append(f"| {p} | {fmt(ss['20-02']['btcAbsPct']/ss['other']['btcAbsPct'],2)}× | {fmt(ss['20-02']['altAbsPct']/ss['other']['altAbsPct'],2)}× |")
    daily = defaultdict(list)
    for h in hours:
        daily[h['day']].append(h['btcAbsPct'])
    largest = max(daily, key=lambda d: st.fmean(daily[d]))
    reduced = [h for h in hours if h['day'] != largest]
    reduced_s = {s: m.hourly_summary([h for h in reduced if h['session'] == s]) for s in ['20-02', 'other']}
    lines += [f"| Bỏ ngày BTC biến động TB lớn nhất ({largest}) | {fmt(reduced_s['20-02']['btcAbsPct']/reduced_s['other']['btcAbsPct'],2)}× | {fmt(reduced_s['20-02']['altAbsPct']/reduced_s['other']['altAbsPct'],2)}× |", '',
              'Đây là kiểm tra mô tả bổ sung sau lần chạy đầu, không phải chọn lại tham số strategy. Bootstrap theo ngày chưa mô hình hóa toàn bộ phụ thuộc kéo dài nhiều ngày; không khẳng định tính mùa vụ lâu dài.', '',
              '## 2. BTC biến động mạnh có kéo theo alt không?', '',
              f"Ngưỡng giờ BTC lớn = top 10% |return 1h| ở giai đoạn đầu: **{fmt(r['btcLargeHourThresholdPct'])}%**. Đo đồng thời cùng giờ, không dùng để dự đoán giờ đó từ trước.", '',
              '| Mẫu | Alt biến động khi BTC mạnh | Khi BTC bình thường |', '|---|---:|---:|']
    for p in ['all', 'holdout']:
        a = r['btcLargeHourAssociation'][p]
        lines.append(f"| {p} | {fmt(a['large']['altAbsPct'])}% ({a['large']['hours']} giờ) | {fmt(a['normal']['altAbsPct'])}% ({a['normal']['hours']} giờ) |")
    lines += ['', 'Mối liên hệ đồng thời rõ, nhưng không chứng minh BTC vừa bơm thì alt chắc chắn còn tăng sau thời điểm vào. Phần dưới kiểm tra entry sau nến đóng để tránh nhầm quan sát đồng thời thành khả năng dự báo.', '',
              '## 3. Backtest vào lệnh sau bơm / hồi giữ nền', '',
              'Protocol đã cố định trước khi tính kết quả. LONG: impulse 15m body ≥1%, range ≥1,8 ATR, volume ≥1,8 lần, đóng phá đỉnh 12 nến; chờ retest mốc phá với volume co lại, rồi nến 5m tiếp diễn. SL dưới cực trị đã quan sát có buffer, TP cực trị thuận chiều đã biết, RR ≥1,5; vào open 5m kế tiếp. SHORT đối xứng là **sập → hồi lên → giảm tiếp**, không phải short bắt đỉnh sau pump.', '',
              'Giữ tối đa 6h; fee 0,05% mỗi chiều, slippage bất lợi 0,03% mỗi chiều (~0,16% roundtrip), chưa funding. Stress tăng tổng chi phí lên khoảng 0,30%. Return tính trên giá trị vị thế (notional), không phải ROE margin. Một nến chạm cả TP/SL tính SL trước; gap qua SL khớp giá xấu hơn. Không mô phỏng danh mục dùng chung vốn/đòn bẩy nên không suy diễn tổng return thành tăng trưởng tài khoản.', '',
              '| Mẫu | Hướng / bộ lọc | N | Thắng | TB/lệnh sau phí | PF | TB stress |', '|---|---|---:|---:|---:|---:|---:|']
    for p in ['all', 'holdout']:
        for side in ['LONG', 'SHORT']:
            for variant in ['baseline', 'btcTrend', 'btcTrendImpulse']:
                v = r['strategies'][p][side][variant]
                lines.append(f"| {p} | {side} {variant} | {v['n']} | {fmt(v.get('winPct'),1)}% | {fmt(v.get('meanNetPct'))}% | {fmt(v.get('profitFactor'),2)} | {fmt(v.get('meanStressPct'))}% |")
    lines += ['', '`btcTrend`: giá BTC/EMA13/EMA25 và return 1h cùng hướng. `btcTrendImpulse`: thêm BTC phá mốc 6 nến 5m với volume ≥1,2 lần trong 15 phút vừa qua. Đây là lọc cùng các entry baseline đã khử trùng; không phải mỗi variant tự tái tìm những entry bị baseline bỏ vì đang có lệnh.', '',
              'Điểm cần chú ý:', '',
              '- LONG có cả BTC trend + impulse: toàn kỳ 31 lệnh, TB +0,398%, nhưng 14 ngày cuối chỉ 8 lệnh, TB −0,152%, PF 0,82. Kết quả dương toàn kỳ chưa lặp lại.',
              '- Khoảng tin cậy 95% TB LONG trend+impulse toàn kỳ: −0,425% đến +1,070%; tập cuối −1,553% đến +1,068%. Cả hai đều chứa 0 và mẫu cuối rất ít.',
              '- LONG baseline median toàn kỳ âm −0,932%/lệnh; tỷ lệ thắng chỉ 35,4%. Một số lệnh thắng lớn bù nhiều lệnh thua, không phải setup có xác suất thắng cao.',
              '- Riêng LONG buổi đêm: 31 lệnh toàn kỳ TB +0,417%; 13 lệnh giai đoạn cuối TB −0,448%. Không nên dùng “đúng giờ” làm lý do tự LONG.',
              '- SHORT continuation cũng chưa có lợi thế rõ; không ngoại suy kết quả sang bot SHORT sau pump vì đó là một logic khác.', '',
              '### Sáu lệnh gần nhất trong mô phỏng (không chọn theo thắng/thua)', '',
              '| Giờ vào VN | Coin | Hướng | Entry mô phỏng | SL | TP | Kết quả | Return sau phí |', '|---|---|---|---:|---:|---:|---|---:|']
    for t in trades[-6:]:
        lines.append(f"| {m.local(t['entryTime']).strftime('%d/%m %H:%M')} | {t['symbol']} | {t['side']} | {t['entry']:.8g} | {t['stop']:.8g} | {t['target']:.8g} | {t['reason']} | {fmt(t['netPct'])}% |")
    lines += ['', '## 4. Cách dùng kết quả mà không hiểu nhầm', '',
              '1. Khung 20h–02h phù hợp tăng ưu tiên **quan sát hai chiều**, không tự động tăng size hoặc bật LONG.',
              '2. Dùng vùng kháng cự cũ sau breakout làm vùng hỗ trợ tham khảo khi retest. Nếu giá xuyên thủng vùng, phải coi setup hết hiệu lực, không mặc định đó là đáy.',
              '3. BTC/độ rộng thị trường nên là dữ liệu bối cảnh; bộ lọc BTC cụ thể đã thử chưa đủ ổn để nâng thành điều kiện giao dịch thật.',
              '4. Nếu phát triển tiếp, giữ nguyên bản thử và chạy forward paper trên dữ liệu tương lai; không sửa ngưỡng để làm đẹp cùng 55 ngày này. Cần nhiều hơn vài lệnh ngoài mẫu và kiểm tra phí/funding/độ trễ thực tế trước khi xét tiền thật.', '',
              '## Hạn chế và khả năng tái lập', '',
              '- Chỉ 55 ngày và top60 theo tháng7; coin mới niêm yết, coin nhỏ và chế độ thị trường khác có thể khác hẳn. Không thể kết luận chung cho “mùa này” kéo dài nhiều tháng.',
              '- Người dùng hình thành giả thuyết sau khi quan sát gần đây, nên 14 ngày cuối là kiểm tra tách theo thời gian, **không phải dữ liệu hoàn toàn chưa từng được con người nhìn thấy**. Cần forward test để xác nhận thật.',
              '- OHLCV 5m không cho thứ tự tick, spread, khả năng khớp hoặc latency. Slippage/fee là giả định; chưa funding. Không áp dụng đòn bẩy để quảng cáo lợi nhuận.',
              '- Giờ đêm nhóm 20–02 theo giờ đồng hồ, cluster bootstrap theo ngày lịch VN. Bảng 24 giờ bên dưới là khám phá, không đã hiệu chỉnh multiple-testing để chọn một “giờ thần kỳ”.',
              '- Không thay runtime, route, whitelist, entry/size/SL/TP hay JSON cũ. Các nhãn trong báo cáo chỉ phục vụ nghiên cứu.', '',
              'Chạy lại từ root repository:', '', '```sh',
              'python3 scripts/research-btc-session-data.py', 'python3 scripts/test-research-btc-session.py',
              'nice -n 10 python3 scripts/research-btc-session-analysis.py', 'python3 scripts/research-btc-session-report.py', '```', '',
              'Kiểm chứng: 8 unit test cho khung giờ, nến thiếu, tính phí, gap SL, TP/SL cùng nến, dữ liệu tương lai; audit đối chiếu 744 nến 1h nguyên bản mỗi BTC/ETH với tổng hợp từ 5m, và kiểm tra thêm dữ liệu tương lai không sửa entry cũ của ARB/UNI/PUMP. Chạy `python3 scripts/audit-research-btc-session.py`; kết quả lưu `audit.json`.', '',
              'Dữ liệu/máy đọc: `data/research/btc-session-20260926/{summary,hourly,trades,events,quality,selected-universe}.json`. ZIP và SHA256 lưu cùng thư mục con `archives`; không cần token/secret. Chi tiết ngưỡng: [protocol](BTC_SESSION_CONTINUATION_PREREG_20260926.md).', '',
              '## Phụ lục: 24 giờ VN (khám phá, không phải khuyến nghị chọn giờ)', '',
              '| Giờ bắt đầu | BTC biến động TB 55d | Alt biến động TB 55d | BTC biến động TB 14d cuối | Alt biến động TB 14d cuối |', '|---|---:|---:|---:|---:|']
    for h in range(24):
        a, b = r['byHour']['all'][str(h)], r['byHour']['holdout'][str(h)]
        lines.append(f"| {h:02}:00 | {fmt(a['btcAbsPct'])}% | {fmt(a['altAbsPct'])}% | {fmt(b['btcAbsPct'])}% | {fmt(b['altAbsPct'])}% |")
    lines += ['', 'Universe: ' + ', '.join(x['symbol'] for x in selected['selected']), '']
    target = Path(__file__).resolve().parents[1] / 'docs/research/BTC_SESSION_CONTINUATION_RESULTS_20260926.md'
    target.write_text('\n'.join(lines), encoding='utf8')
    print(target)
    print('Excluded most volatile day:', largest, reduced_s)


if __name__ == '__main__':
    main()
