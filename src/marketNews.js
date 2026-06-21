import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_FEEDS = [
  'https://www.coindesk.com/arc/outboundfeeds/rss/',
  'https://cointelegraph.com/rss',
  'https://decrypt.co/feed',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://news.google.com/rss/search?q=(Iran%20OR%20Israel%20OR%20Hormuz%20OR%20sanctions%20OR%20oil%20OR%20Fed%20OR%20CPI)%20(crypto%20OR%20bitcoin%20OR%20markets)&hl=en-US&gl=US&ceid=US:en',
];

const HIGH_IMPACT = [
  [/\bspot bitcoin etf\b|\bbitcoin etf\b|\betf\b/i, 28, 'ETF flow/approval', 'etf'],
  [/\bblackrock\b/i, 22, 'institutional', 'blackrock'],
  [/\bfidelity\b/i, 16, 'institutional', 'fidelity'],
  [/\bsec\b|\bcftc\b/i, 22, 'regulation', 'sec/cftc'],
  [/\blawsuit\b|\binvestigation\b|\bprobe\b|\bcrackdown\b/i, 16, 'regulation', 'regulatory action'],
  [/\bapproval\b|\bapproved\b|\brejected\b|\breject\b/i, 14, 'approval', 'approval/reject'],
  [/\bfed\b|\bfomc\b|\binterest rate decision\b|\brate decision\b/i, 30, 'macro', 'fed/fomc'],
  [/\brate cut\b|\brate hike\b|\binterest rates?\b/i, 24, 'macro', 'rates'],
  [/\binflation\b|\bcpi\b|\bpce\b|\bjobs report\b|\bnonfarm\b|\bunemployment\b|\btreasury yields?\b|\bdxy\b/i, 24, 'macro', 'macro data'],
  [/\btariff\b/i, 16, 'macro', 'tariff'],
  [/\biran\b|\bisrael\b|\bmiddle east\b|\bred sea\b|\bhouthi\b/i, 26, 'geopolitics', 'geo'],
  [/\bmissile\b|\bairstrike\b|\bceasefire\b|\bnuclear\b|\bsanctions?\b|\bwar\b|\battack\b/i, 20, 'geopolitics', 'geo event'],
  [/\bstrait of hormuz\b|\bhormuz\b/i, 34, 'energy shock', 'hormuz'],
  [/\bcrude\b|\boil\b|\bbrent\b|\bwti\b|\bopec\b/i, 18, 'energy shock', 'oil'],
  [/\bhack\b|\bexploit\b/i, 12, 'security', 'hack/exploit'],
  [/\boutage\b/i, 14, 'exchange risk', 'outage'],
  [/\bbinance\b|\bcoinbase\b|\bkraken\b/i, 16, 'exchange', 'major exchange'],
  [/\btether\b|\busdt\b|\busdc\b|\bstablecoin\b/i, 16, 'stablecoin', 'stablecoin'],
  [/\bliquidations?\b|\bleverage\b|\bopen interest\b|\bfunding rates?\b/i, 16, 'derivatives', 'derivatives'],
  [/\bwhale\b|\bwallet\b|\bunlock\b|\bairdrop\b/i, 8, 'flow', 'flow/supply'],
];

const ASSET_PATTERNS = [
  ['BTC', /\b(bitcoin|btc)\b/i],
  ['ETH', /\b(ethereum|ether|eth)\b/i],
  ['SOL', /\b(solana|sol)\b/i],
  ['BNB', /\b(bnb|binance coin)\b/i],
  ['XRP', /\b(xrp|ripple)\b/i],
  ['DOGE', /\b(dogecoin|doge)\b/i],
  ['USDT', /\b(tether|usdt)\b/i],
  ['USDC', /\b(usdc|circle)\b/i],
  ['OIL', /\b(oil|crude|brent|wti|opec|hormuz)\b/i],
  ['GOLD', /\b(gold|xau)\b/i],
  ['DXY', /\b(dollar|dxy|treasury yields?)\b/i],
];

const POSITIVE_WORDS = [
  'approval', 'approved', 'inflow', 'inflows', 'rate cut', 'rally', 'surge',
  'record high', 'accumulate', 'buy', 'partnership', 'launch', 'ceasefire',
  'de-escalation', 'peace', 'deal',
];

const NEGATIVE_WORDS = [
  'outflow', 'outflows', 'hack', 'exploit', 'lawsuit', 'ban', 'crackdown',
  'selloff', 'dump', 'liquidation', 'rate hike', 'delay', 'reject', 'rejected',
  'probe', 'investigation', 'war', 'missile', 'airstrike', 'strike', 'sanction',
  'nuclear', 'escalation', 'attack', 'oil spike', 'supply shock',
];

const GEO_RISK_RE = /\b(iran|israel|middle east|hormuz|red sea|houthi|hezbollah)\b/i;
const GEO_ESCALATION_RE = /\b(missile|airstrike|strike|attack|war|nuclear|sanctions?|escalation|clashes|conflict|tensions?|threat|retaliation|oil shock|supply shock)\b/i;
const GEO_DEESCALATION_RE = /\b(ceasefire|de-escalation|peace|truce|talks|deal|broker|diplomacy|diplomatic)\b/i;
const GEO_CONFLICT_STILL_RE = /\b(despite|but|however|continue|continues|continued|uncertain|fails?|failed|rejects?|rejected|breakdown|no deal|without deal)\b/i;
const RISK_OFF_RE = /\b(risk-off|selloff|plunge|falls?|falling|drops?|slumps?|oil spike|yields? rise|dollar strengthens|safe haven)\b/i;
const RISK_ON_RE = /\b(rally|surge|rebounds?|inflows?|risk-on|rate cut|dollar weakens|yields? fall)\b/i;

function textBetween(input, tag) {
  const m = input.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? cleanXmlText(m[1]) : '';
}

function cleanXmlText(input = '') {
  return String(input)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceNameFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.includes('bbci.co.uk')) return 'BBC';
    if (host.includes('news.google.com')) return 'Google News';
    return host.split('.')[0].replace(/^\w/, (c) => c.toUpperCase());
  } catch {
    return 'News';
  }
}

function parseItems(xml, feedUrl) {
  const source = sourceNameFromUrl(feedUrl);
  const rssItems = [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const atomItems = [...String(xml).matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  const blocks = rssItems.length ? rssItems : atomItems;

  return blocks.map((block) => {
    const title = textBetween(block, 'title');
    const description = textBetween(block, 'description') || textBetween(block, 'summary') || textBetween(block, 'content');
    const link = textBetween(block, 'link') || ((block.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] ?? '');
    const publishedRaw = textBetween(block, 'pubDate') || textBetween(block, 'published') || textBetween(block, 'updated');
    const publishedAt = Number.isFinite(Date.parse(publishedRaw))
      ? new Date(Date.parse(publishedRaw)).toISOString()
      : null;
    return { title, description, link, source, publishedAt };
  }).filter((item) => item.title && item.link);
}

function classifyBias(text, categories, assets) {
  let posHits = POSITIVE_WORDS.filter((w) => text.includes(w)).length;
  let negHits = NEGATIVE_WORDS.filter((w) => text.includes(w)).length;

  const geoRisk = GEO_RISK_RE.test(text);
  const escalation = GEO_ESCALATION_RE.test(text);
  const deescalation = GEO_DEESCALATION_RE.test(text);
  const conflictStill = GEO_CONFLICT_STILL_RE.test(text);
  const riskOff = RISK_OFF_RE.test(text);
  const riskOn = RISK_ON_RE.test(text);
  const oilShock = categories.has('energy shock') || assets.includes('OIL');

  if (geoRisk && (escalation || oilShock || riskOff || conflictStill)) negHits += 3;
  if (geoRisk && oilShock) negHits += 2;
  if (geoRisk && deescalation && !escalation && !conflictStill && !riskOff) posHits += 2;
  if (deescalation && conflictStill) negHits += 2;
  if (riskOff) negHits += 2;
  if (riskOn) posHits += 1;

  if (/\boutflows?\b|\betf selloff\b|\bredemption\b/i.test(text)) negHits += 2;
  if (/\binflows?\b|\betf approval\b|\bspot bitcoin etf approval\b/i.test(text)) posHits += 2;
  if (/\brate hike\b|\bhigher for longer\b|\bhawkish\b/i.test(text)) negHits += 2;
  if (/\brate cut\b|\bdovish\b/i.test(text)) posHits += 2;

  const bias = negHits > posHits ? 'BEARISH' : posHits > negHits ? 'BULLISH' : 'NEUTRAL';
  const biasReason = [
    geoRisk && 'geo-risk',
    escalation && 'escalation',
    deescalation && !conflictStill && 'de-escalation',
    conflictStill && 'conflict-still-active',
    oilShock && 'oil/energy shock',
    riskOff && 'risk-off',
    riskOn && 'risk-on',
  ].filter(Boolean);

  return { bias, posHits, negHits, biasReason };
}

function classifyImpact(item, now = Date.now()) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const reasons = [];
  const categories = new Set();
  let score = 12;

  for (const [pattern, points, category, reason] of HIGH_IMPACT) {
    if (pattern.test(text)) {
      score += points;
      categories.add(category);
      if (reasons.length < 5) reasons.push(reason);
    }
  }

  const hasGeoShock = categories.has('geopolitics');
  const hasEnergyShock = categories.has('energy shock');
  if (hasGeoShock && hasEnergyShock) {
    score += 18;
    if (!reasons.includes('geo+energy')) reasons.push('geo+energy');
  }
  if (/(iran|israel|middle east|hormuz)/i.test(text) && /(bitcoin|btc|crypto|markets?|stocks?|futures?|oil|gold|dollar)/i.test(text)) {
    score += 16;
    categories.add('market shock');
    if (!reasons.includes('market shock')) reasons.push('market shock');
  }

  const assets = ASSET_PATTERNS.filter(([, re]) => re.test(text)).map(([asset]) => asset);
  if (assets.includes('BTC')) score += 10;
  if (assets.includes('ETH')) score += 8;
  if (assets.includes('OIL') && hasGeoShock) score += 12;
  if (assets.includes('GOLD') && hasGeoShock) score += 6;
  if (assets.includes('DXY')) score += 5;
  if (assets.length > 1) score += 6;

  const isMacroWide = categories.has('macro')
    || categories.has('ETF flow/approval')
    || categories.has('derivatives')
    || categories.has('market shock')
    || (categories.has('geopolitics') && categories.has('energy shock'));
  const isMajorAsset = assets.includes('BTC') || assets.includes('ETH') || assets.includes('OIL') || assets.includes('DXY') || assets.includes('GOLD');
  const isSystemicCrypto = (categories.has('exchange') && /\bbinance\b|\bcoinbase\b/i.test(text))
    || (categories.has('stablecoin') && /\btether\b|\busdt\b|\busdc\b|\breserve\b|\bdepeg\b|\bredemption\b/i.test(text))
    || (categories.has('security') && /\bbinance\b|\bcoinbase\b|\btether\b|\busdt\b|\busdc\b|\bethereum\b|\bbitcoin\b/i.test(text));
  const marketScope = isMacroWide || isMajorAsset || isSystemicCrypto ? 'MARKET_WIDE' : 'LOCAL_CRYPTO';

  const publishedMs = item.publishedAt ? Date.parse(item.publishedAt) : 0;
  const ageHours = publishedMs > 0 ? Math.max(0, (now - publishedMs) / 3_600_000) : 999;
  if (ageHours <= 6) score += 14;
  else if (ageHours <= 24) score += 8;
  else if (ageHours <= 72) score += 3;

  const { bias, posHits, negHits, biasReason } = classifyBias(text, categories, assets);
  if (posHits + negHits >= 2) score += 5;
  for (const r of biasReason) {
    if (reasons.length < 7 && !reasons.includes(r)) reasons.push(r);
  }

  let cappedScore = score;
  if (marketScope === 'LOCAL_CRYPTO') {
    cappedScore = Math.min(cappedScore, categories.has('security') ? 44 : 52);
    if (!reasons.includes('local scope')) reasons.push('local scope');
  } else if (categories.has('security') && !isSystemicCrypto) {
    cappedScore = Math.min(cappedScore, 58);
  }

  const impactScore = Math.max(0, Math.min(100, Math.round(cappedScore)));
  const impact = impactScore >= 80 ? 'CRITICAL'
    : impactScore >= 65 ? 'HIGH'
      : impactScore >= 45 ? 'MEDIUM'
        : 'LOW';

  return {
    ...item,
    id: makeNewsId(item),
    impactScore,
    impact,
    bias,
    assets,
    categories: [...categories],
    reasons,
    biasReason,
    marketScope,
    ageHours: Number.isFinite(ageHours) ? +ageHours.toFixed(1) : null,
  };
}

function makeNewsId(item) {
  const raw = `${item.source}|${item.link || item.title}`.toLowerCase();
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = Math.imul(31, h) + raw.charCodeAt(i) | 0;
  return Math.abs(h).toString(36);
}

export function marketNewsConfig(env = process.env) {
  return {
    feeds: String(env.MARKET_NEWS_FEEDS || DEFAULT_FEEDS.join(','))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    limit: Math.max(20, Number(env.MARKET_NEWS_LIMIT ?? 120)),
    refreshMs: Math.max(60 * 60_000, Number(env.MARKET_NEWS_REFRESH_MS ?? 24 * 60 * 60_000)),
    timeoutMs: Math.max(2000, Number(env.MARKET_NEWS_FETCH_TIMEOUT_MS ?? 12_000)),
  };
}

export async function loadMarketNews(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return { items: [], updatedAt: null, sources: [], error: null };
  }
}

export async function saveMarketNews(filePath, payload) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2));
}

export async function fetchMarketNews({ feeds, limit, timeoutMs } = marketNewsConfig()) {
  const now = Date.now();
  const fetchedAt = new Date(now).toISOString();
  const rows = [];
  const sourceStats = [];

  for (const feed of feeds) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(feed, {
        headers: { 'user-agent': 'btc-liquidity-proxy/market-news' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const parsed = parseItems(xml, feed);
      rows.push(...parsed);
      sourceStats.push({ feed, source: sourceNameFromUrl(feed), ok: true, count: parsed.length });
    } catch (err) {
      sourceStats.push({ feed, source: sourceNameFromUrl(feed), ok: false, error: err.message });
    } finally {
      clearTimeout(timer);
    }
  }

  const byId = new Map();
  for (const item of rows.map((row) => classifyImpact(row, now))) {
    const prev = byId.get(item.id);
    if (!prev || item.impactScore > prev.impactScore) byId.set(item.id, item);
  }

  const items = [...byId.values()]
    .sort((a, b) => {
      if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
      return Date.parse(b.publishedAt ?? 0) - Date.parse(a.publishedAt ?? 0);
    })
    .slice(0, limit);

  return {
    items,
    updatedAt: fetchedAt,
    sources: sourceStats,
    error: sourceStats.some((s) => s.ok) ? null : 'No news sources fetched successfully.',
  };
}
