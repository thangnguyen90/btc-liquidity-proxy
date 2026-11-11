// Read-only Binance public market research. No server, notifier or account imports.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bar, candidates, evaluate, dedupe } from './research-two-sided-month.mjs';

export const VERSION = 'PARABOLIC_CRASH_FORTNIGHT_RESEARCH_V1_20261024';
const H = 3_600_000;
export function classify(e) {
  if (['MINUTE_GAP', 'FUTURE_GAP'].includes(e.status)) return { broad: false, irys: false, extreme: false, invalid: true };
  const broad = e.status === 'MATCH';
  const irys = (e.gain24 >= 100 || e.gain72 >= 200) && e.drop24 >= 50;
  const extreme = (e.gain24 >= 200 || e.gain72 >= 400) && e.drop24 >= 70;
  return { broad, irys, extreme, invalid: false };
}
const vn = t => t == null ? '—' : new Date(t).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
const fmt = n => Number.isFinite(n) ? n.toFixed(2) : '—';

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = path.join(root, 'data/research/parabolic-crash-fortnight-20261024');
  await fs.mkdir(path.join(dir, 'raw'), { recursive: true });
  const read = async p => { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
  const save = (p, v) => fs.writeFile(p, JSON.stringify(v));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let weight = 0, requests = 0, last = 0;
  async function get(endpoint, params = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(Math.max(0, 450 - (Date.now() - last)));
      if (weight >= 1000) {
        const ms = 61000 - Date.now() % 60000;
        console.log(JSON.stringify({ stage: 'rate-pause', ms, weight }));
        await sleep(ms); weight = 0;
      }
      last = Date.now();
      const u = new URL(endpoint, 'https://fapi.binance.com');
      u.search = new URLSearchParams(params);
      let r;
      try { r = await fetch(u, { signal: AbortSignal.timeout(20000) }); }
      catch (e) { if (attempt === 2) throw e; await sleep(1500); continue; }
      requests++; weight = Number(r.headers.get('x-mbx-used-weight-1m') ?? weight);
      if ([418, 429].includes(r.status)) throw Error(`RATE_LIMIT_${r.status}`);
      if (!r.ok) {
        if (r.status >= 500 && attempt < 2) { await sleep(2000); continue; }
        throw Error(`HTTP_${r.status}`);
      }
      return r.json();
    }
  }
  let meta = await read(path.join(dir, 'meta.json'));
  if (!meta) {
    const time = await get('/fapi/v1/time');
    const info = await get('/fapi/v1/exchangeInfo');
    const end = Math.floor(time.serverTime / H) * H, start = end - 14 * 24 * H;
    const symbols = info.symbols.filter(s => s.quoteAsset === 'USDT'
      && ['PERPETUAL', 'PERPETUAL_DELIVERING'].includes(s.contractType)
      && s.onboardDate < end && (s.status === 'TRADING' || s.deliveryDate >= start))
      .map(s => ({ symbol: s.symbol, onboardDate: s.onboardDate, deliveryDate: s.deliveryDate, status: s.status }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
    meta = { version: VERSION, start, end, fetchedAt: time.serverTime, symbols,
      rules: { broad: 'pump >=30%/24h OR >=60%/72h; then drop >=20%/24h OR >=30%/72h',
        irys: 'pump >=100%/24h OR >=200%/72h; then drop >=50%/24h',
        extreme: 'pump >=200%/24h OR >=400%/72h; then drop >=70%/24h' },
      universeBias: 'exchangeInfo snapshot: historical symbols absent from current exchangeInfo are not covered',
      retrospectiveOnly: true, tradeBacktest: false };
    await save(path.join(dir, 'meta.json'), meta);
  }
  if (meta.version !== VERSION) throw Error('META_VERSION_MISMATCH');
  async function bars(symbol, interval, from, to) {
    const file = path.join(dir, 'raw', `${encodeURIComponent(symbol)}-${interval}-${from}-${to}.json`);
    let raw = await read(file);
    if (!raw) {
      raw = await get('/fapi/v1/klines', { symbol, interval, startTime: String(from), endTime: String(to - 1), limit: '499' });
      if (!Array.isArray(raw)) throw Error('INVALID_KLINES');
      await save(file, raw);
    }
    const step = interval === '1h' ? H : 60000;
    if ((to - from) / step > 499) throw Error('PAGINATION_REQUIRED');
    return raw.map(bar).filter(b => b.t >= from && b.end < to);
  }
  const coverage = [], errors = [], screened = [], events = [], history = new Map();
  console.log(JSON.stringify({ stage: 'start', start: vn(meta.start), end: vn(meta.end), symbols: meta.symbols.length, rules: meta.rules }));
  for (const [i, s] of meta.symbols.entries()) {
    try {
      const rows = await bars(s.symbol, '1h', meta.start - 72 * H, meta.end);
      history.set(s.symbol, rows);
      const gaps = rows.slice(1).filter((b, j) => b.t !== rows[j].t + H).length;
      const eligibleHours = rows.filter((b, j) => b.t >= meta.start && j >= 72
        && rows.slice(j - 72, j).every((p, k) => p.t === b.t - (72 - k) * H)).length;
      coverage.push({ ...s, bars: rows.length, first: rows[0]?.t ?? null, last: rows.at(-1)?.end ?? null,
        gaps, eligibleHours, shortPrehistory: rows.length < 73,
        missingStart: rows[0]?.t > Math.max(meta.start - 72 * H, Math.ceil(s.onboardDate / H) * H),
        missingEnd: s.status === 'TRADING' && rows.at(-1)?.end !== meta.end - 1 });
      screened.push(...candidates(rows, meta.start, meta.end).map(e => ({ ...e, symbol: s.symbol,
        peakNeighbourhoodComplete: e.peakHour + 7 * H <= meta.end })));
    } catch (e) {
      if (e.message.startsWith('RATE_LIMIT')) throw e;
      errors.push({ symbol: s.symbol, stage: 'hour', error: e.message });
    }
    if ((i + 1) % 20 === 0 || i + 1 === meta.symbols.length)
      console.log(JSON.stringify({ stage: 'hour', done: i + 1, total: meta.symbols.length, candidates: screened.length, errors: errors.length, requests, weight }));
  }
  await save(path.join(dir, 'screen.json'), { meta, coverage, errors, candidates: screened });
  for (const [i, c] of screened.entries()) {
    try {
      const minutes = await bars(c.symbol, '1m', c.peakHour, c.peakHour + H);
      const e = evaluate(c, history.get(c.symbol), minutes, meta.end);
      events.push({ ...e, classifications: classify(e) });
    } catch (e) {
      if (e.message.startsWith('RATE_LIMIT')) throw e;
      errors.push({ symbol: c.symbol, stage: 'minute', peakHour: c.peakHour, error: e.message });
    }
    if ((i + 1) % 20 === 0 || i + 1 === screened.length) {
      await save(path.join(dir, 'events.json'), events);
      console.log(JSON.stringify({ stage: 'minute', done: i + 1, total: screened.length, requests, weight }));
    }
  }
  // Select peak representatives BEFORE classifying outcomes, not just winning matches.
  const representatives = dedupe(events.filter(e => !e.classifications.invalid));
  const broad = representatives.filter(e => e.classifications.broad);
  const irys = representatives.filter(e => e.classifications.irys);
  const extreme = representatives.filter(e => e.classifications.extreme);
  const counts = xs => ({ coins: new Set(xs.map(e => e.symbol)).size, episodes: xs.length,
    coinsList: [...new Set(xs.map(e => e.symbol))].sort(),
    peaksUnder6h: xs.filter(e => !e.peakNeighbourhoodComplete).length,
    complete24h: xs.filter(e => meta.end >= e.peakHour + 24 * H).length });
  const summary = { requested: meta.symbols.length, scanned: coverage.length,
    withEligibleHistory: coverage.filter(s => s.eligibleHours > 0).length,
    gapSymbols: coverage.filter(s => s.gaps).length,
    missingStart: coverage.filter(s => s.missingStart).length,
    missingEnd: coverage.filter(s => s.missingEnd).length,
    errors: errors.length, candidates: screened.length, evaluated: events.length,
    invalid: events.filter(e => e.classifications.invalid).length,
    representatives: representatives.length, broad: counts(broad), irys: counts(irys), extreme: counts(extreme),
    pendingBroad: representatives.filter(e => e.status === 'PENDING_72H').length,
    pendingIrys24h: representatives.filter(e => (e.gain24 >= 100 || e.gain72 >= 200)
      && !e.classifications.irys && meta.end < e.peakHour + 24 * H).length,
    irysSymbol: representatives.filter(e => e.symbol === 'IRYSUSDT') };
  // Supplemental MARK audit does not change the predeclared trade-price cohort.
  const markAudit = [];
  for (const e of irys) {
    const file = path.join(dir, 'raw', `${encodeURIComponent(e.symbol)}-MARK-1m-${e.peakHour}.json`);
    try {
      let raw = await read(file);
      if (!raw) {
        raw = await get('/fapi/v1/markPriceKlines', { symbol: e.symbol, interval: '1m', startTime: String(e.peakHour), endTime: String(e.peakHour + H - 1), limit: '99' });
        if (!Array.isArray(raw)) throw Error('INVALID_MARK_KLINES');
        await save(file, raw);
      }
      if (raw.length !== 60 || raw.some((b, i) => +b[0] !== e.peakHour + i * 60000)) throw Error('MARK_GAP');
      const at = raw.find(b => +b[0] === e.peakAt);
      markAudit.push({ symbol: e.symbol, peakAt: e.peakAt, tradeHigh: e.peak,
        markHighSameMinute: +at[2], markLowSameMinute: +at[3], markHighSameHour: Math.max(...raw.map(b => +b[2])), bars: raw.length });
    } catch (err) {
      if (err.message.startsWith('RATE_LIMIT')) throw err;
      markAudit.push({ symbol: e.symbol, error: err.message });
    }
  }
  await save(path.join(dir, 'mark-audit.json'), markAudit);
  const result = { ...meta, generatedAt: Date.now(), coverage, errors, summary, representatives, events, markAudit };
  await save(path.join(dir, 'results.json'), result);
  const table = xs => '| Coin | Phút đỉnh (VN) | Tăng từ nền 24h | Tăng từ nền 72h | Sụt 24h | Sụt 72h | Vol giờ đỉnh/nền | Đủ 24h sau đỉnh |\n'
    + '|---|---|---:|---:|---:|---:|---:|---|\n'
    + xs.map(e => `| ${e.symbol} | ${vn(e.peakAt)} | +${fmt(e.gain24)}% | +${fmt(e.gain72)}% | −${fmt(e.drop24)}% | −${fmt(e.drop72)}% | ${fmt(e.peakHourVolumeX)}× | ${meta.end >= e.peakHour + 24 * H ? 'Có' : 'Chưa'} |`).join('\n');
  const report = `# Bơm dựng đứng rồi xả sâu — 14 ngày\n\nVersion: \`${VERSION}\`. OFFLINE RESEARCH / OBSERVE ONLY.\n\nCửa sổ đỉnh: **${vn(meta.start)} → ${vn(meta.end)} VN** (14×24 giờ, cutoff khóa theo giờ Binance). Chỉ nến đã đóng.\n\n## Kết quả\n\n- Đọc ${summary.scanned}/${summary.requested} hợp đồng; ${summary.withEligibleHistory} có ít nhất một giờ đủ 72 giờ tiền sử liên tục. ${summary.errors} lỗi; ${summary.gapSymbols} coin có gap; thiếu đầu ${summary.missingStart}, thiếu cuối ${summary.missingEnd}.\n- **Giống IRYS:** ${summary.irys.coins} coin / ${summary.irys.episodes} nhịp. Pump ≥100%/24h hoặc ≥200%/72h, sau đó sụt ≥50% trong 24h.\n- **Cực đoan hơn:** ${summary.extreme.coins} coin / ${summary.extreme.episodes} nhịp. Pump ≥200%/24h hoặc ≥400%/72h, sụt ≥70%/24h. Đây là tập con nhóm IRYS, không cộng hai nhóm.\n- **Nhóm rộng:** ${summary.broad.coins} coin / ${summary.broad.episodes} nhịp. Pump ≥30%/24h hoặc ≥60%/72h, sụt ≥20%/24h hoặc ≥30%/72h. IRYS là tập con nhóm rộng.\n- ${summary.pendingBroad} đỉnh đại diện chưa đạt nhóm rộng và chưa đủ 72h theo dõi; ${summary.pendingIrys24h} đỉnh có pump đủ mức IRYS nhưng chưa xả 50% và chưa đủ24h, chưa kết luận âm. Nhóm IRYS có ${summary.irys.complete24h}/${summary.irys.episodes} nhịp đủ24h, ${summary.irys.peaksUnder6h} đỉnh dưới6h có thể bị thay thế bởi higher high tiếp theo.\n\n## Phương pháp và giới hạn\n\n1. Universe lấy từ exchangeInfo hiện tại: USDT perpetual TRADING và các hợp đồng khác vẫn còn metadata có deliveryDate trong/sau cửa sổ; coin bị gỡ khỏi exchangeInfo vẫn thiếu (survivorship bias). Không lọc theo top tăng/volume hiện tại. Cần72 giờ nến liên tục trước mỗi đỉnh; 72h đầu listing không được bao phủ.\n2. Mốc nền là CLOSE thấp nhất trong 24h hoặc72h TRƯỚC giờ đỉnh; pump = HIGH giờ đỉnh/nền−1. Không phải ticker24h. Dùng nến1h quét toàn bộ, rồi60 nến1m trong giờ đỉnh xác định phút đạt HIGH. Đỉnh là cực đại±6giờ có sẵn, dùng tương lai nên KHÔNG là tín hiệu realtime.\n3. Loại LOW cùng phút đỉnh vì không biết high/low xảy ra trước; chỉ xét phút sau, rồi các nến1h sau giờ đỉnh. Cửa sổ24h/72h tính từ ĐẦU giờ đỉnh, ngắn hơn thời gian từ phút đỉnh tối đa59phút. Đáy1h có độ phân giải1h. Kiểm gap và censoring. Tất cả dữ liệu sau cutoff bị loại.\n4. Gộp cùng coin trong72h: xét tất cả đỉnh có dữ liệu hợp lệ theo giá đỉnh cao xuống thấp, giữ đỉnh không nằm cách đỉnh đã giữ dưới72h. Chọn đại diện trước khi xét kết quả, giữ cả NO_MATCH/PENDING, không chọn riêng mẫu đã sập. Một coin có thể nhiều nhịp; coin count là unique symbol. Đây là quy ước đếm vùng đỉnh, không phải các mẫu độc lập.\n5. Ngưỡng được khóa trước khi chạy, chưa tối ưu theo kết quả. Đếm mẫu hình lịch sử bằng tương lai, không phải backtest điểm vào/WR/PnL hay kết quả của bộ cảnh báo sớm. Không có OI/funding/ratio/độ sâu/thanh lý lịch sử trong mô hình này; không khẳng định squeeze hoặc thao túng. Chưa có precision/recall/lead time của dự báo.\n6. Dữ liệu nghiên cứu lưu riêng; không thay Binance/entry/size/SL/TP/gate/Push/Discord, không restart. Không thêm card/WHITELIST/matcher; JSON runtime và lệnh cũ không đọc/sửa/migrate.\n\n## Danh sách giống IRYS\n\n${table(irys)}\n\n## Nhóm cực đoan\n\n${table(extreme)}\n\n## Nhóm rộng (bao gồm nhóm IRYS)\n\n${table(broad)}\n\n## Tái lập\n\nChạy \`node scripts/research-parabolic-crash-fortnight.mjs\`. Cửa sổ/universe/raw/ứng viên/gap/lỗi/kết quả được khóa tại \`data/research/parabolic-crash-fortnight-20261024/\`. Dùng public REST, không API key. [Binance Kline API](https://developers.binance.com/en/docs/derivatives/usds-margined-futures/market-data/rest-api/Kline-Candlestick-Data).\n\nLỗi: ${JSON.stringify(errors)}\n`;
  await fs.mkdir(path.join(root, 'reports'), { recursive: true });
  const markReport = '\n## Đối chiếu thêm với MARK\n\nCohort/độ sụt phía trên dùng giá giao dịch Futures (LAST/OHLC), không phải MARK. Đối chiếu MARK chỉ bổ sung sau kiểm đếm, không đổi ngưỡng/chọn lại mẫu. HIGH của hai chuỗi trong cùng phút không bảo đảm cùng thời điểm từng tick; không dùng để tính basis tức thời hoặc suy ra số tiền thanh lý.\n\n'
    + '| Coin | Phút đỉnh (VN) | HIGH giao dịch | MARK HIGH cùng phút |\n|---|---|---:|---:|\n'
    + markAudit.map(e => `| ${e.symbol} | ${vn(e.peakAt)} | ${e.tradeHigh ?? '—'} | ${e.markHighSameMinute ?? e.error} |`).join('\n')
    + '\n\nNến MARK được lưu raw riêng và kiểm đủ60phút liên tục trong giờ đỉnh. Các mức giảm theo LAST không tự đại diện mức giảm MARK hoặc cơ chế kích hoạt thanh lý/SL của một lệnh cụ thể.\n';
  await fs.writeFile(path.join(root, 'reports/parabolic-crash-fortnight-20261024.md'), report + markReport);
  console.log(JSON.stringify({ stage: 'complete', summary, top: irys.slice(0,20), report: 'reports/parabolic-crash-fortnight-20261024.md' }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
