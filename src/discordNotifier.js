import { fetchAnalysis } from './marketAnalysis.js';

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
      color,
      description: `Score **${score >= 0 ? '+' : ''}${score.toFixed(3)}** — chờ xác nhận vào lệnh`,
      footer: { text: new Date().toLocaleString('vi-VN', { hour12: false }) },
    }],
  });
  signalCooldowns.set(symbol, Date.now());
  console.log(`[Discord] Signal detected: ${symbol} score=${score.toFixed(3)}`);
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
