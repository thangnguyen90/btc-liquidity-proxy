import { fetchAnalysis } from './marketAnalysis.js';
import { computeHeatmapData } from './liquidityProxy.js';

const symbolUrl = (symbol) => {
  const base = process.env.LIQUIDITY_BASE_URL;
  return base ? `${base}/?symbol=${symbol}` : undefined;
};

const cooldowns = new Map();        // for full order-placed alerts
const signalCooldowns = new Map();  // for lightweight signal-detected alerts
const firstSeenPrices = new Map();
const LIVE_MOMENTUM_WINDOW_MS = 5 * 60 * 1000;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function updateLiveMomentum(symbol, price) {
  const entry = firstSeenPrices.get(symbol);
  const now = Date.now();

  if (!entry || now - entry.at > LIVE_MOMENTUM_WINDOW_MS) {
    firstSeenPrices.set(symbol, { price, at: now });
    return 0;
  }

  return ((price - entry.price) / entry.price) * 100;
}

function computeQuickScore(row) {
  const change24h = row.change24hPct ?? 0;
  const fundingPct = (row.fundingRate ?? 0) * 100;
  const liveMomentum = updateLiveMomentum(row.symbol, row.markPrice);
  return (
    clamp(change24h / 12, -1, 1) * 0.45
    + clamp(liveMomentum / 1.2, -1, 1) * 0.4
    + clamp(-fundingPct / 0.05, -0.4, 0.4) * 0.15
  );
}

function isCoolingDown(symbol, cooldownMs) {
  const last = cooldowns.get(symbol);
  return last ? Date.now() - last < cooldownMs : false;
}

export function isDiscordCoolingDown(symbol, cooldownMs = 3600000) {
  return isCoolingDown(symbol, cooldownMs);
}

export async function tryNotifySignal(symbol, quickScore, analysis, { webhookUrl, cooldownMs = 3600000 }) {
  if (!webhookUrl) return;
  if (isCoolingDown(symbol, cooldownMs)) return;
  const payload = buildEmbed(symbol, quickScore, analysis);
  await sendWebhook(webhookUrl, payload);
  cooldowns.set(symbol, Date.now());
  console.log(`[Discord] Signal alert: ${symbol} score=${quickScore.toFixed(3)}`);
}

// Lightweight alert: signal detected (no fetchAnalysis needed)
export async function sendSignalDetected(symbol, score, webhookUrl, cooldownMs = 1800000) {
  if (!webhookUrl) return;
  const last = signalCooldowns.get(symbol);
  if (last && Date.now() - last < cooldownMs) return;
  const isLong = score >= 0;
  const color = isLong ? 0x36d399 : 0xfb7185;
  const dir = isLong ? '🟢 LONG' : '🔴 SHORT';
  await sendWebhook(webhookUrl, {
    username: 'Liquidity Proxy',
    embeds: [{
      title: `⚡ ${dir} signal: ${symbol}`,
      url: symbolUrl(symbol),
      color,
      description: `Score **${score >= 0 ? '+' : ''}${score.toFixed(3)}** — chờ xác nhận vào lệnh`,
      footer: { text: new Date().toLocaleString('vi-VN', { hour12: false }) },
    }],
  });
  signalCooldowns.set(symbol, Date.now());
  console.log(`[Discord] Signal detected: ${symbol} score=${score.toFixed(3)}`);
}

// Alert when an order attempt was blocked (max positions, cooldown, etc.)
export async function sendOrderBlocked(symbol, score, direction, reason, webhookUrl) {
  if (!webhookUrl) return;
  const isLong = direction === 'long';
  const dir = isLong ? '🟢 LONG' : '🔴 SHORT';
  await sendWebhook(webhookUrl, {
    username: 'Liquidity Proxy',
    embeds: [{
      title: `🚫 BLOCKED: ${dir} ${symbol}`,
      url: symbolUrl(symbol),
      color: 0x9daaa5,
      description: `Score **${score >= 0 ? '+' : ''}${score.toFixed(3)}** — ${reason}`,
      footer: { text: new Date().toLocaleString('vi-VN', { hour12: false }) },
    }],
  });
  console.log(`[Discord] Order blocked: ${symbol} ${direction} — ${reason}`);
}

// Full alert when order is actually placed
export async function sendOrderPlaced(symbol, score, analysis, webhookUrl) {
  if (!webhookUrl) return;
  const payload = buildEmbed(symbol, score, analysis);
  payload.embeds[0].title = `✅ ORDER: ${payload.embeds[0].title}`;
  await sendWebhook(webhookUrl, payload);
  cooldowns.set(symbol, Date.now()); // block signal scanner from re-sending within cooldown
  console.log(`[Discord] Order placed: ${symbol} score=${score.toFixed(3)}`);
}

function digits(value) {
  const abs = Math.abs(Number(value));
  if (!isFinite(abs) || abs === 0) return 4;
  if (abs >= 1000) return 2;
  if (abs >= 100) return 3;
  if (abs >= 10) return 4;
  if (abs >= 1) return 5;
  if (abs >= 0.1) return 6;
  if (abs >= 0.01) return 7;
  return 8;
}

function fp(value, d) {
  if (value == null || isNaN(value)) return '-';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: d ?? digits(value) });
}

function compact(value) {
  if (value == null) return '-';
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
}

function signed(value, d = 3) {
  const s = (value > 0 ? '+' : '') + Number(value).toFixed(d);
  return s;
}

function buildEmbed(symbol, quickScore, data) {
  const coin = symbol.replace(/USDT$/, '');
  const d = digits(data.price.mark);
  const setup = data.tradeSetup;
  const isLong = setup.direction === 'long';
  const isShort = setup.direction === 'short';
  const color = isLong ? 0x36d399 : isShort ? 0xfb7185 : 0x9daaa5;
  const dirLabel = isLong ? '🟢 LONG' : isShort ? '🔴 SHORT' : '⚪ WAIT';
  const trendIcon = data.market.trendAligned ? '↑↑' : '↕⚠';

  // ── Market ──────────────────────────────────────────────
  const marketLines = [
    `Price: **${fp(data.price.mark, d)}** (Index: ${fp(data.price.index, d)})`,
    `Momentum 24h: **${signed(data.market.momentumPct, 2)}%** ${trendIcon} 48h: ${signed(data.market.momentumPct48h, 2)}%`,
    `Funding: **${data.market.fundingRatePct}%** | OI: ${compact(data.market.openInterest)}`,
    `Taker Buy: ${(data.market.takerBuyRatio * 100).toFixed(1)}%`,
  ];

  if (data.market.longShortRatio) {
    const lr = data.market.longShortRatio;
    marketLines.push(`Long/Short ratio: ${Number(lr.longShortRatio).toFixed(3)} (${(lr.longAccount * 100).toFixed(1)}% long)`);
  }

  // ── Trade Setup ─────────────────────────────────────────
  const setupLines = [];
  if (setup.direction !== 'wait') {
    if (setup.entry) {
      setupLines.push(`Entry: **${fp(setup.entry.low, d)} – ${fp(setup.entry.high, d)}**`);
    }
    if (setup.triggerPrice) setupLines.push(`Trigger: ${fp(setup.triggerPrice, d)}`);
    if (setup.stopLoss) setupLines.push(`Stop: ${fp(setup.stopLoss, d)}`);
    if (setup.targets?.length) {
      setupLines.push(`Targets: ${setup.targets.map((t) => fp(t, d)).join(' → ')}`);
    }
    if (setup.expectedMovePct) setupLines.push(`Expected move: ${signed(setup.expectedMovePct, 2)}%`);
  } else if (setup.breakoutLevels) {
    setupLines.push(`Long nếu > ${fp(setup.breakoutLevels.longAbove, d)}`);
    setupLines.push(`Short nếu < ${fp(setup.breakoutLevels.shortBelow, d)}`);
  }
  if (setup.reason?.length) {
    setupLines.push('');
    setup.reason.forEach((r) => setupLines.push(`> ${r}`));
  }

  // ── Liquidity zones ─────────────────────────────────────
  const above = data.liquidationProxy.strongestAbove.slice(0, 3);
  const below = data.liquidationProxy.strongestBelow.slice(0, 3);
  const zoneLines = [];
  if (above.length) {
    zoneLines.push(`**Above:** ${above.map((z) => `${fp(z.price, d)} (${signed(z.distancePct, 2)}%)`).join(', ')}`);
  }
  if (below.length) {
    zoneLines.push(`**Below:** ${below.map((z) => `${fp(z.price, d)} (${signed(z.distancePct, 2)}%)`).join(', ')}`);
  }

  // ── Trade Context ────────────────────────────────────────
  const ctx = [];
  ctx.push(`Signal: **${data.signal.label}** (score ${data.signal.score})`);

  if (Math.abs(data.liquidationProxy.bias) < 0.05) {
    ctx.push(`Liquidity hai phía khá cân bằng, chưa có nam châm rõ.`);
  } else if (data.liquidationProxy.bias > 0) {
    ctx.push(`Liquidity phía trên dày hơn → ${coin} có thể bị hút lên quét short.`);
  } else {
    ctx.push(`Liquidity phía dưới dày hơn → ${coin} có rủi ro bị kéo xuống sweep long.`);
  }

  if (data.market.takerBuyRatio > 0.53) {
    ctx.push('Lệnh mua chủ động đang nhỉnh rõ.');
  } else if (data.market.takerBuyRatio < 0.47) {
    ctx.push('Lệnh bán chủ động đang nhỉnh rõ.');
  } else {
    ctx.push('Taker buy/sell gần cân bằng.');
  }

  if (above.length) {
    ctx.push(`Kịch bản phá lên: nếu ${coin} vượt ${fp(above[0]?.price, d)}, target tiếp theo ${above.slice(1).map((z) => fp(z.price, d)).join(' → ') || '-'}.`);
  }
  if (below.length) {
    ctx.push(`Kịch bản rơi: nếu mất vùng giá hiện tại, vùng hút ${below.map((z) => fp(z.price, d)).join(' → ')}.`);
  }
  if (data.market.longShortRatio?.longShortRatio > 1.8) {
    ctx.push('⚠️ Cảnh báo crowding: long account đang đông, dễ xuất hiện long squeeze nếu giá yếu.');
  }
  if (!data.market.trendAligned) {
    ctx.push(`⚠️ 24h và 48h momentum mâu thuẫn chiều — rủi ro cao, cẩn thận khi vào lệnh.`);
  }

  // ── Assemble embed ───────────────────────────────────────
  const fields = [
    { name: '📊 Market', value: marketLines.join('\n'), inline: false },
  ];

  if (setupLines.length) {
    fields.push({ name: '🎯 Trade Setup', value: setupLines.join('\n'), inline: false });
  }

  if (zoneLines.length) {
    fields.push({ name: '🔮 Liquidity Zones', value: zoneLines.join('\n'), inline: false });
  }

  fields.push({ name: '📖 Trade Context', value: ctx.join('\n'), inline: false });

  return {
    username: 'Liquidity Proxy',
    avatar_url: 'https://www.binance.com/favicon.ico',
    embeds: [{
      title: `${dirLabel} ${symbol}  ·  Quick score ${signed(quickScore, 3)}`,
      url: symbolUrl(symbol),
      color,
      fields,
      footer: {
        text: `Confidence: ${setup.confidence.toUpperCase()} · ATR ${data.market.atrPct}% · ${new Date().toLocaleString('vi-VN', { hour12: false })}`,
      },
    }],
  };
}

async function sendWebhook(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord ${res.status}: ${text.slice(0, 120)}`);
  }
}

export function startDiscordScanner({ client, webhookUrl, threshold = 0.7, intervalMs = 30000, cooldownMs = 3600000, getSnapshot }) {
  if (!webhookUrl) {
    console.log('Discord notifier disabled (no DISCORD_WEBHOOK_URL).');
    return;
  }

  console.log(`Discord notifier enabled. threshold=±${threshold} interval=${intervalMs / 1000}s cooldown=${cooldownMs / 60000}min`);

  const run = async () => {
    try {
      const snapshot = await getSnapshot();
      const minVolume = Number(process.env.AUTO_TRADE_MIN_VOLUME_USDT ?? 5_000_000);
      const maxChangePct = Number(process.env.AUTO_TRADE_MAX_CHANGE_PCT ?? 30);
      const blacklist = new Set(
        (process.env.AUTO_TRADE_BLACKLIST ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
      );
      const candidates = snapshot
        .filter((row) => !blacklist.has(row.symbol) && row.quoteVolume >= minVolume && Math.abs(row.change24hPct) <= maxChangePct)
        .map((row) => ({ row, score: computeQuickScore(row) }))
        .filter(({ score }) => Math.abs(score) >= threshold)
        .filter(({ row }) => !isCoolingDown(row.symbol, cooldownMs))
        .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
        .slice(0, 3);

      for (const { row, score } of candidates) {
        try {
          const analysis = await fetchAnalysis({ client, symbol: row.symbol, interval: '15m', limit: 192 });
          const payload = buildEmbed(row.symbol, score, analysis);
          await sendWebhook(webhookUrl, payload);
          cooldowns.set(row.symbol, Date.now());
          console.log(`[Discord] Sent alert: ${row.symbol} score=${score.toFixed(3)}`);
        } catch (err) {
          console.error(`[Discord] Failed ${row.symbol}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Discord] Scan error:', err.message);
    }
  };

  setTimeout(run, 5000);
  setInterval(run, intervalMs);
}

// ── Volume Dump Scanner ───────────────────────────────────────────────────────

const volDumpCooldowns = new Map();
const volDumpActive = new Map(); // symbol → { timestamp, dumpCandlePct, move4cPct, highVolCount }
const VOL_DUMP_TTL_MS = 60 * 60 * 1000; // 1h hiển thị sau khi alert

export function getVolDumpFlags() {
  const now = Date.now();
  for (const [sym, info] of volDumpActive) {
    if (now - info.timestamp > VOL_DUMP_TTL_MS) volDumpActive.delete(sym);
  }
  return Object.fromEntries(volDumpActive);
}

const HIGH_VOL_TTL_MS = 5 * 60_000; // 5 min (scanner runs every 60s)
const highVolMap = new Map(); // symbol → { price, change24h, maxRatio, lastRatio, highVolCount, dumpCandlePct, move4cPct, isVolDump, scannedAt }

export function getHighVolData() {
  const now = Date.now();
  for (const [sym, info] of highVolMap) {
    if (now - info.scannedAt > HIGH_VOL_TTL_MS) highVolMap.delete(sym);
  }
  return Object.fromEntries(highVolMap);
}

function buildVolDumpEmbed(symbol, markPrice, stats) {
  const { dumpCandlePct, move4cPct, highVolCount, avgVol, lastVol, maxVol } = stats;
  const d = digits(markPrice);
  const volMultLast = avgVol > 0 ? (lastVol / avgVol).toFixed(1) : '?';
  const volMultMax = avgVol > 0 ? (maxVol / avgVol).toFixed(1) : '?';

  return {
    username: 'Liquidity Proxy',
    embeds: [{
      title: `💥 VOL DUMP: ${symbol} — Short entry?`,
      url: symbolUrl(symbol),
      color: 0xfb7185,
      description: [
        `**Volume cao liên tiếp rồi sập mạnh** — cân nhắc vào short`,
        '',
        `Mark: **${fp(markPrice, d)}**`,
        `Nến cuối sập: **${dumpCandlePct.toFixed(2)}%**  |  4 nến gần nhất: **${move4cPct.toFixed(2)}%**`,
        `Volume cao: **${highVolCount}/5** nến vừa rồi (cao nhất **${volMultMax}x** avg, nến cuối **${volMultLast}x** avg)`,
        `Vol trung bình: ${compact(avgVol)} USDT  →  Nến cuối: ${compact(lastVol)} USDT`,
      ].join('\n'),
      footer: { text: new Date().toLocaleString('vi-VN', { hour12: false }) },
    }],
  };
}

export function startVolumeDumpScanner({
  client,
  webhookUrl,
  getSnapshot,
  intervalMs = 60_000,
  cooldownMs = 2 * 3_600_000,
  minVolumeUsdt = 5_000_000,
  maxCoins = 150,
  volMult = 1.8,
  sustainedCandles = 3,
  dumpPct = 1.5,
  move4cPct = 2.5,
}) {
  console.log(`[VolDump] Started. volMult=${volMult}x sustained=${sustainedCandles} dumpPct=${dumpPct}% interval=${intervalMs / 1000}s${webhookUrl ? '' : ' (no webhook — tracking only)'}`);

  const run = async () => {
    try {
      const snapshot = await getSnapshot();
      const now = Date.now();

      const candidates = snapshot
        .filter((r) => r.quoteVolume >= minVolumeUsdt)
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, maxCoins);

      for (const row of candidates) {
        try {
          const klines = await client.getKlines(row.symbol, '15m', 42);
          if (klines.length < 22) continue;

          const closed = klines.slice(0, -1);
          const baseline = closed.slice(-36, -13); // candles 14-36 from end → clean baseline
          const recent12 = closed.slice(-12);     // last 12 candles = 3h lookback
          const recent5 = closed.slice(-5);       // last 5 for "hot now" count
          const lastClosed = closed[closed.length - 1];

          const avgVol = baseline.length > 0
            ? baseline.reduce((s, k) => s + Number(k.quoteVolume), 0) / baseline.length
            : 0;
          if (avgVol <= 0) continue;

          // maxRatio uses 3h window to catch recent spikes
          const maxVol12 = Math.max(...recent12.map((k) => Number(k.quoteVolume)));
          const maxRatio = maxVol12 / avgVol;
          // highVolCount uses recent 5 for "currently sustained" detection
          const recent5Vols = recent5.map((k) => Number(k.quoteVolume));
          const maxVol5 = Math.max(...recent5Vols);
          const highVolCount = recent5.filter((k) => Number(k.quoteVolume) >= avgVol * volMult).length;
          const lastVol = Number(lastClosed.quoteVolume);
          const lastRatio = lastVol / avgVol;

          // Compute price stats (needed for both highVol tracking and dump detection)
          const lastOpen = Number(lastClosed.open);
          const lastClose = Number(lastClosed.close);
          const dumpCandlePct = (lastClose - lastOpen) / lastOpen * 100;
          const startPrice = Number(closed[closed.length - 5].close);
          const move4cPctVal = (lastClose - startPrice) / startPrice * 100;

          // Track all elevated-volume coins (lower threshold, for high-vol page)
          if (maxRatio >= 1.5) {
            // find which candle had peak vol and how long ago (in candles)
            const peakIdx = recent12.reduce((best, k, i) => Number(k.quoteVolume) > Number(recent12[best].quoteVolume) ? i : best, 0);
            const peakCandlesAgo = recent12.length - 1 - peakIdx; // 0 = last closed, 11 = 3h ago
            highVolMap.set(row.symbol, {
              price: row.markPrice,
              change24h: row.change24hPct ?? 0,
              maxRatio: Math.round(maxRatio * 10) / 10,
              lastRatio: Math.round(lastRatio * 10) / 10,
              highVolCount,
              peakCandlesAgo,
              dumpCandlePct: Math.round(dumpCandlePct * 100) / 100,
              move4cPct: Math.round(move4cPctVal * 100) / 100,
              isVolDump: false,
              scannedAt: Date.now(),
            });
          } else {
            highVolMap.delete(row.symbol);
          }

          // Discord dump alert: check cooldown + conditions
          const lastAlerted = volDumpCooldowns.get(row.symbol) ?? 0;
          if (now - lastAlerted < cooldownMs) continue;
          if (highVolCount < sustainedCandles) continue;
          const isDumpCandle = dumpCandlePct <= -dumpPct;
          const isSteadyDrop = move4cPctVal <= -move4cPct;
          if (!isDumpCandle && !isSteadyDrop) continue;

          // Mark as dump in highVolMap
          const hvEntry = highVolMap.get(row.symbol);
          if (hvEntry) hvEntry.isVolDump = true;

          volDumpCooldowns.set(row.symbol, Date.now());
          volDumpActive.set(row.symbol, { timestamp: Date.now(), dumpCandlePct, move4cPct: move4cPctVal, highVolCount });

          if (webhookUrl) {
            const embed = buildVolDumpEmbed(row.symbol, row.markPrice, {
              dumpCandlePct,
              move4cPct: move4cPctVal,
              highVolCount,
              avgVol,
              lastVol,
              maxVol: maxVol5,
            });
            await sendWebhook(webhookUrl, embed);
          }
          console.log(`[VolDump] Alert: ${row.symbol} dump=${dumpCandlePct.toFixed(2)}% 4c=${move4cPctVal.toFixed(2)}% hvol=${highVolCount}/5`);

          await new Promise((r) => setTimeout(r, 300));
        } catch {
          // skip individual coin failures
        }
      }
    } catch (err) {
      console.error('[VolDump] Scan error:', err.message);
    }
  };

  setTimeout(run, 30_000);
  setInterval(run, intervalMs);
}

// ── Liquidation Imbalance Scanner ────────────────────────────────────────────

const liqCooldowns = new Map(); // symbol → last alert timestamp

function buildLiqImbalanceEmbed(symbol, heatmap, markPrice) {
  const above = heatmap.liquidityAbove;
  const below = heatmap.liquidityBelow;
  const bias = heatmap.bias;
  const isAboveHeavy = bias > 0;
  const color = isAboveHeavy ? 0xfbbf24 : 0xfb7185; // amber = above, red = below
  const dirLabel = isAboveHeavy ? '⬆️ TRÊN DÀY HƠN' : '⬇️ DƯỚI DÀY HƠN';
  const action = isAboveHeavy
    ? `Có thể bị hút lên quét short trước khi đảo chiều`
    : `Có thể bị kéo xuống quét long trước khi đảo chiều`;

  const d = digits(markPrice);
  const pct = (v, total) => total > 0 ? ((v / total) * 100).toFixed(1) + '%' : '0%';
  const total = above + below;

  // Sweep probability: bias strength (60%) + volume skew (40%)
  const dominantPct = total > 0 ? (isAboveHeavy ? above : below) / total : 0.5;
  const sweepProb = Math.min(99, Math.round((Math.abs(bias) * 0.6 + (dominantPct - 0.5) * 2 * 0.4) * 100));
  const filled = Math.round(sweepProb / 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const sweepIcon = sweepProb >= 70 ? '🔥' : sweepProb >= 45 ? '⚡' : '🔵';
  const sweepLabel = sweepProb >= 70 ? 'CAO' : sweepProb >= 45 ? 'TRUNG BÌNH' : 'THẤP';

  const lines = [
    `Mark: **${fp(markPrice, d)}**`,
    `↑ Above: **${compact(above)}** (${pct(above, total)}) | ↓ Below: **${compact(below)}** (${pct(below, total)})`,
    `Bias: **${bias >= 0 ? '+' : ''}${bias.toFixed(3)}**`,
  ];

  if (heatmap.sweepTarget) {
    const st = heatmap.sweepTarget;
    const sign = st.distancePct >= 0 ? '+' : '';
    lines.push(`🎯 Sweep target: **${fp(st.price, d)}** (${sign}${st.distancePct.toFixed(2)}%)`);
  }

  const topAbove = (heatmap.heatmapAbove ?? []).slice(0, 3);
  const topBelow = (heatmap.heatmapBelow ?? []).slice(0, 3);
  if (topAbove.length) {
    lines.push(`Zones trên: ${topAbove.map((z) => `${fp(z.price, d)}(+${z.distancePct.toFixed(1)}%)`).join(', ')}`);
  }
  if (topBelow.length) {
    lines.push(`Zones dưới: ${topBelow.map((z) => `${fp(z.price, d)}(${z.distancePct.toFixed(1)}%)`).join(', ')}`);
  }

  return {
    username: 'Liquidity Proxy',
    embeds: [{
      title: `🌊 LIQ IMBALANCE: ${symbol} — ${dirLabel}`,
      url: symbolUrl(symbol),
      color,
      description: [
        `${sweepIcon} **XÁC SUẤT QUÉT: ${sweepProb}%** — ${sweepLabel}`,
        `\`${bar}\` ${sweepProb}%`,
        '',
        action,
        '',
        lines.join('\n'),
      ].join('\n'),
      footer: { text: new Date().toLocaleString('vi-VN', { hour12: false }) },
    }],
  };
}

export function startLiqImbalanceScanner({
  client,
  webhookUrl,
  getSnapshot,
  biasThreshold = 0.4,
  intervalMs = 5 * 60 * 1000,
  cooldownMs = 2 * 60 * 60 * 1000,
  minVolumeUsdt = 5_000_000,
  maxCoins = 60,
  onHighProbAlert = null,
  highProbThreshold = 90,
}) {
  console.log(`[LiqScan] Started. threshold=±${biasThreshold} interval=${intervalMs / 60000}min cooldown=${cooldownMs / 60000}min${onHighProbAlert ? ` autoOrder≥${highProbThreshold}%` : ''}`);

  const run = async () => {
    try {
      const snapshot = await getSnapshot();
      const now = Date.now();
      const candidates = snapshot
        .filter((row) => row.quoteVolume >= minVolumeUsdt)
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, maxCoins)
        .filter((row) => {
          const last = liqCooldowns.get(row.symbol) ?? 0;
          return now - last >= cooldownMs;
        });

      let alertCount = 0;
      for (const row of candidates) {
        try {
          const klines = await client.getKlines(row.symbol, '15m', 500);
          const heatmap = computeHeatmapData({ klines, currentPrice: row.markPrice });
          const total = heatmap.liquidityAbove + heatmap.liquidityBelow;

          const isImbalanced = Math.abs(heatmap.bias) >= biasThreshold;
          const isOneSided = total > 0 && (
            heatmap.liquidityAbove < total * 0.12 ||
            heatmap.liquidityBelow < total * 0.12
          );

          if (isImbalanced || isOneSided) {
            // Compute sweepProb inline for auto-order check
            const dominantPct = total > 0 ? (heatmap.bias > 0 ? heatmap.liquidityAbove : heatmap.liquidityBelow) / total : 0.5;
            const sweepProb = Math.min(99, Math.round((Math.abs(heatmap.bias) * 0.6 + (dominantPct - 0.5) * 2 * 0.4) * 100));

            if (onHighProbAlert && sweepProb >= highProbThreshold && heatmap.sweepTarget) {
              await onHighProbAlert({
                symbol: row.symbol,
                markPrice: row.markPrice,
                direction: heatmap.bias > 0 ? 'short' : 'long',
                sweepTargetPrice: heatmap.sweepTarget.price,
                sweepProb,
              });
            }

            if (webhookUrl) {
              const embed = buildLiqImbalanceEmbed(row.symbol, heatmap, row.markPrice);
              await sendWebhook(webhookUrl, embed);
            }
            liqCooldowns.set(row.symbol, Date.now());
            alertCount++;
            console.log(`[LiqScan] Alert: ${row.symbol} bias=${heatmap.bias.toFixed(3)} above=${compact(heatmap.liquidityAbove)} below=${compact(heatmap.liquidityBelow)} sweepProb=${sweepProb}%`);
          }

          await new Promise((r) => setTimeout(r, 300));
        } catch (err) {
          // skip individual coin failures silently
        }
      }

      if (alertCount > 0) console.log(`[LiqScan] Cycle done — ${alertCount} alerts sent`);
    } catch (err) {
      console.error('[LiqScan] Scan error:', err.message);
    }
  };

  setTimeout(run, 20000); // first run after 20s
  setInterval(run, intervalMs);
}
