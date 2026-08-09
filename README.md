# BTC Liquidity Proxy

Shakeout có bộ Python self-learning chỉ để gắn cờ phân tích, không can thiệp logic
giao dịch: [docs/SHAKEOUT_SELF_LEARNING.md](docs/SHAKEOUT_SELF_LEARNING.md).

Free liquidation heatmap proxy using Binance Futures public data.

It does not reproduce CoinGlass paid heatmap data. Instead, it estimates likely liquidation/liquidity zones from recent futures candles, common leverage levels, order book depth, open interest, funding, and long/short ratios.

Current trading rules: [`docs/CURRENT_DECISION_AND_EMA_RULES.md`](docs/CURRENT_DECISION_AND_EMA_RULES.md). Historical decisions and broader context: [`docs/CODEX_TRADING_LOGIC.md`](docs/CODEX_TRADING_LOGIC.md).

## Run

```bash
npm start
```

## Web UI

```bash
npm run web
```

Open:

```text
http://127.0.0.1:19082
```

### Chạy bền bằng PM2

Production nên chạy đúng một instance qua ecosystem để PM2 tự khởi động lại khi
Node crash hoặc vượt giới hạn RAM:

```bash
npm run pm2:start
pm2 save
pm2 list
```

Các lệnh vận hành:

```bash
npm run pm2:reload
npm run pm2:logs
npm run pm2:stop
```

Cấu hình nằm tại `ecosystem.config.cjs`: Node 22, fork mode một instance, heap
16 GB, restart khi RSS vượt 18 GB, `min_uptime` 30 giây và exponential backoff
5 giây để tránh crash-loop. Tiến trình `btc-liquidity-watchdog` gọi `/healthz`
mỗi 15 giây và restart web sau 2 lần timeout liên tiếp; nhờ vậy trường hợp PID
vẫn còn nhưng event loop đã treo sau OOM cũng được phục hồi. Log được PM2 ghi
vào `~/.pm2/logs/` và module `pm2-logrotate` quản lý rotate.

Để PM2 tự khôi phục cả sau khi WSL/systemd khởi động lại, chạy một lần lệnh sau
(cần mật khẩu sudo), sau đó chạy lại `pm2 save`:

```bash
sudo env PATH=/home/thangnguyen/.nvm/versions/node/v22.16.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u thangnguyen --hp /home/thangnguyen
pm2 save
```

## Intraday Combo Forecast (Python)

Trang dự đoán combo trong ngày đọc động toàn bộ file `data/*-paper-trades.json`, loại các log clone/experiment khỏi mô hình mặc định, rồi xếp hạng theo WR Bayesian, Avg ROE, PnL, độ mới của mẫu và xu hướng BTC hiện tại.

```text
http://127.0.0.1:19082/intraday-combos
```

Chạy riêng bộ phân tích Python (không cần package ngoài):

```bash
npm run intraday-combos
python3 scripts/intraday_combo_predictor.py --days 14 --min-closed 5 --limit 20 --pretty
```

API dùng bởi trang web:

```text
GET /api/intraday-combos?days=30&minClosed=3&limit=30
```

## Trend Decision Paper

Paper manager gom tín hiệu mới từ toàn bộ scanner cache và tự động đánh giá mỗi 15 phút. Mặc định trend `1h` quyết định hướng entry, còn trend `4h` là macro veto nếu đang mạnh ngược chiều. Có thể đổi primary trend sang `4h` và đổi nhịp tự động từ 5–60 phút trên giao diện. Chỉ combo hạng A đạt prediction gate, signal score và trend gate mới được tạo paper; các tín hiệu còn lại vẫn được lưu dưới dạng `WATCH` hoặc `REJECT` để audit.

```text
http://127.0.0.1:19082/decision-paper
```

Paper store được tạo tự động tại `data/intraday-decision-paper.json`. Mặc định tối đa 5 vị thế mở, 3 entry mỗi chu kỳ, margin paper 10 USDT, leverage 10x, TP `+15% ROE`, SL `-15% ROE`; lệnh còn được đóng bởi timeout hoặc BTC trend mạnh đảo chiều. Giá paper được quản lý theo tick từ shared Binance WebSocket và phát realtime ra trang qua SSE. Log paper độc lập, tương thích bộ phân tích combo, nằm tại `data/intraday-decision-paper-trades.json`.

API:

```text
GET  /api/intraday-decision-paper
GET  /api/intraday-decision-paper/stream
POST /api/intraday-decision-paper/run
POST /api/intraday-decision-paper/settings
```

The web UI defaults to `BTCUSDT`, loads all Binance USD-M perpetual symbols into the symbol input, and renders both raw metrics plus Vietnamese explanations for strong liquidity zones above and below price.

All-symbol WebSocket signal board:

```text
http://127.0.0.1:19082/signals
```

The signal board uses Binance Futures WebSocket streams in the browser for all-symbol mark price, funding, and ticker updates. It avoids continuous REST polling and links each symbol back to the detailed dashboard.

## Binance Order Button

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Set:

```text
BINANCE_API_KEY=your_key
BINANCE_API_SECRET=your_secret
BINANCE_FUTURES_BASE_URL=https://fapi.binance.com
BINANCE_ORDER_ENABLED=false
```

The order button is protected in two ways:

- `Dry run` is checked by default in the UI.
- Real orders are blocked unless `BINANCE_ORDER_ENABLED=true`.

For testnet, use:

```text
BINANCE_FUTURES_BASE_URL=https://testnet.binancefuture.com
BINANCE_ORDER_ENABLED=true
```

## Auto Trader

The backend can auto-place setup orders when the all-market scanner score reaches the threshold. It is disabled and dry-run by default.

```text
AUTO_TRADE_ENABLED=false
AUTO_TRADE_DRY_RUN=true
AUTO_TRADE_THRESHOLD=0.7
AUTO_TRADE_MARGIN_USDT=2
AUTO_TRADE_LEVERAGE=10
AUTO_TRADE_INTERVAL_MS=15000
AUTO_TRADE_COOLDOWN_MS=900000
AUTO_TRADE_MAX_ORDERS_PER_SCAN=1
```

With the default margin/leverage, order notional is:

```text
2 USDT margin * 10x = 20 USDT notional
```

To allow real orders, all of these must be true:

```text
AUTO_TRADE_ENABLED=true
AUTO_TRADE_DRY_RUN=false
BINANCE_ORDER_ENABLED=true
```

Status endpoint:

```text
http://127.0.0.1:19082/api/auto-trade/status
```

## Paper Combo Stats

Use this command to audit paper trade combo performance by UTC day without loading the web UI. It reads local JSON files in `data/`, groups trades by page, margin bucket, and combo, then prints total PnL, WR, AvgROE, TP/SL, and the worst combos.

```bash
npm run combo-stats -- --page pump --date 2026-07-12 --limit 30
```

Supported pages:

```text
pump, ema, cap, edge, liquid, ppks, shakeout, top, all
```

Examples:

```bash
npm run combo-stats -- --page pump --date 2026-07-12
npm run combo-stats -- --page ema --date 2026-07-12 --limit 50
npm run combo-stats -- --page all --date 2026-07-12 --limit 15
```

EMA Squeeze uses the shared paper store but can be filtered directly by signal alias:

```bash
npm run combo-stats -- --page ema --date 2026-07-11 --limit 300
npm run combo-stats -- --page runner --date 2026-07-11 --limit 300
npm run combo-stats -- --page br-like --date 2026-07-11 --limit 300
npm run combo-stats -- --page br-like-short --date 2026-07-11 --limit 300
npm run combo-stats -- --page squeeze --date 2026-07-11 --limit 300
npm run combo-stats -- --page squeeze-short --date 2026-07-11 --limit 300
npm run combo-stats -- --page breakout --date 2026-07-11 --limit 300
npm run combo-stats -- --page breakdown --date 2026-07-11 --limit 300
npm run combo-stats -- --page pre-breakout --date 2026-07-11 --limit 300
npm run combo-stats -- --page pre-breakdown --date 2026-07-11 --limit 300
```

Equivalent explicit form:

```bash
npm run combo-stats -- --page ema --type runner --date 2026-07-11 --limit 300
```

The output includes:

- page total: rows, open/pending, closed, TP/SL, WR, AvgROE, realized/live PnL
- margin buckets: `TEST $10`, `TEST $1`, `Other`
- worst combos by margin bucket, so a bad `$10` group is not mixed with `$1` or old-size trades

## Paper Signal Eval

Use this command when you want to answer: "which signal types are good or bad by BTC phase and score bucket?" It groups trades by BTC phase, signal type, side, and score bucket, then prints BTC phase summary, best groups, worst groups, and largest samples.

```bash
npm run signal-eval -- --page pump --from 2026-07-11 --to 2026-07-12 --min-closed 5 --limit 20
```

Useful examples:

```bash
npm run signal-eval -- --page pump --days 2 --min-closed 5 --limit 10
npm run signal-eval -- --page ema --days 2 --min-closed 10 --limit 20
npm run signal-eval -- --page runner --from 2026-07-11 --to 2026-07-12 --min-closed 5
npm run signal-eval -- --page br-like-short --date 2026-07-11 --limit 30
npm run signal-eval -- --page cap --days 3 --group full --min-closed 2
npm run signal-eval -- --page all --date 2026-07-12 --limit 10
```

Group modes:

```text
signal = BTC phase | signal type | side | score bucket
full   = BTC phase | signal type | side | timeframe | score bucket | BTC relation | margin bucket
phase  = BTC phase only
```

By default the command hides `NO_DATA` groups. Add `--include-no-data` when you need to audit missing BTC/context logs.

## Daily Signal CSV Report

Every day at 07:00 Vietnam time, Windows Task Scheduler runs:

```bat
scripts\daily-signal-report.bat
```

The batch calls WSL and runs:

```bash
npm run daily-signal-report
```

Default report date is the UTC day that just ended. For example, the 07:00 Vietnam run on `2026-07-13` writes the `2026-07-12` UTC report.

Output folder:

```text
D:\btc-liquidity-reports\daily-signal\YYYY-MM-DD\
```

WSL path tương ứng:

```text
/mnt/d/btc-liquidity-reports/daily-signal/YYYY-MM-DD/
```

CSV files:

- `page-summary.csv`: total PnL/WR/AvgROE by page.
- `btc-phase-summary.csv`: total by page and BTC phase.
- `signal-by-btc-phase.csv`: signal type + side + score bucket by BTC phase.
- `combo-by-btc-phase.csv`: combo + margin bucket by BTC phase, with `verdict` and `size_hint`.
- `best-combos-by-day.csv`: top combo theo ngày, bỏ nhóm `NO_DATA`, chỉ lấy combo đã đóng ít nhất 5 lệnh và sắp xếp nhóm tốt lên trước.

Additional Discord best-combo notification:

```text
DAILY_BEST_COMBO_WEBHOOK_URL=your_discord_webhook
DAILY_BEST_COMBO_MIN_WR=80
DAILY_BEST_COMBO_MIN_CLOSED=8
DAILY_BEST_COMBO_MIN_AVG_ROE=3
DAILY_BEST_COMBO_LIMIT=15
```

When `DAILY_BEST_COMBO_WEBHOOK_URL` is present in `.env`, the 07:00 job reads EMA, Pump, Liquid and Edge once, writes `discord-best-combos.csv`, and sends the best combos for rolling `1/3/5/7/30` day UTC windows. Each window ends on the UTC day that just closed. A combo must match `WR >= 80%`, `closed >= 8`, and `AvgROE >= 3%`. To disable only the Discord send:

```text
DAILY_BEST_COMBO_DISCORD_DISABLED=true
```

Run manually:

```bash
npm run daily-signal-report -- --date 2026-07-12
npm run daily-signal-report -- --date 2026-07-12 --page pump
npm run daily-signal-report -- --date 2026-07-12 --out reports/daily-signal-test/2026-07-12
npm run daily-signal-report -- --date 2026-07-12 --page ema,pump,liquid,edge --dry-run
```

Reinstall the 07:00 Windows scheduled task:

```bat
scripts\install-daily-signal-report-task.bat
```

## Restart BE/FE

This project serves both backend API and frontend pages from the same Node server. Restarting `npm run web` restarts both BE and FE.

Stop the current server:

```bash
pkill -f "node src/server.js"
```

Start it again:

```bash
cd /Users/thang/Documents/RESOURCE/btc-liquidity-proxy
npm run web
```

One-line restart:

```bash
cd /Users/thang/Documents/RESOURCE/btc-liquidity-proxy && (pkill -f "node src/server.js" || true) && npm run web
```

After restart, open:

```text
http://127.0.0.1:19082
http://127.0.0.1:19082/signals
```

Useful options:

```bash
node src/index.js BTC
node src/index.js ETH
node src/index.js SOL
node src/index.js ETHUSDT --interval 15m --limit 192 --range-pct 0.04
node src/index.js --symbol BNB
```

Continuous watch mode:

```bash
node src/index.js ETH --watch --refresh-ms 15000 --slow-refresh-ms 60000 --depth-limit 100
```

Watch mode keeps Binance request usage low by refreshing price/depth more often and refreshing candles, open interest, and long/short ratio more slowly. If Binance returns `429` or `418`, it respects `Retry-After` and backs off before trying again.

## Output

The CLI prints:

- current BTC mark price
- estimated liquidation clusters above and below price
- order book bid/ask liquidity near price
- momentum, open interest, funding, long/short ratio
- a simple bias: `bullish_squeeze`, `bearish_sweep`, `uptrend`, `downtrend`, or `neutral`

## Notes

This is a trading research helper, not financial advice. Treat the signal as context and combine it with your existing risk management.
