export const DISCORD_HEATMAP_LINKS_VERSION = 'DISCORD_ALL_ROUTES_MODEL13_LINKS_V1_20261024';
const PAGE = 'https://liquidity.nhathadev.trade/coinglass-heatmap-lab';
const modelUrl = symbol => symbol ? `${PAGE}?symbol=${encodeURIComponent(symbol)}&range=24h` : PAGE;

function texts(payload) {
  return [payload.content, ...(payload.embeds ?? []).flatMap(embed => [
    embed.title, embed.description, embed.url, embed.author?.name, embed.author?.url,
    ...(embed.fields ?? []).flatMap(field => [field.name, field.value]),
  ])].filter(value => typeof value === 'string');
}

function decoded(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function embedCharacters(embeds) {
  return embeds.reduce((sum, embed) => sum + [embed.title, embed.description,
    embed.author?.name, embed.footer?.text,
    ...(embed.fields ?? []).flatMap(field => [field.name, field.value]),
  ].reduce((n, value) => n + String(value ?? '').length, 0), 0);
}

// Only the outbound presentation changes. Never mutate persisted signal proofs.
export function withDiscordHeatmapLinks(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || (payload.embeds !== undefined && !Array.isArray(payload.embeds))) return payload;
  const parts = texts(payload);
  if (!parts.length) return payload;
  const symbols = [...new Set(parts.flatMap(part => [...decoded(part).matchAll(
    /(?<![\p{L}\p{N}_])([\p{L}\p{N}]{1,40}USDT)(?![\p{L}\p{N}_])/giu,
  )].map(match => match[1].toUpperCase())))];
  const linked = new Set();
  let hasGeneralLink = false;
  for (const part of parts) {
    for (const match of part.matchAll(/https?:\/\/[^\s<>\[\]()]+/gu)) {
      try {
        const url = new URL(match[0]);
        if (url.origin !== 'https://liquidity.nhathadev.trade'
            || !['/coinglass-heatmap-lab', '/coinglass-heatmap-lab.html'].includes(url.pathname)) continue;
        const symbol = url.searchParams.get('symbol');
        if (symbol) linked.add(symbol.toUpperCase()); else hasGeneralLink = true;
      } catch { /* Existing message text need not be a URL. */ }
    }
  }
  const missing = symbols.filter(symbol => !linked.has(symbol));
  if (!missing.length && (symbols.length || hasGeneralLink)) return payload;
  const links = missing.length
    ? missing.map(symbol => `[Model 1/3 · ${symbol}](${modelUrl(symbol)})`)
    : [`[Mở Model 1/3](${PAGE})`];
  const result = { ...payload };
  let content = String(payload.content ?? '');
  // Keep Discord's original content and embed limits; never truncate the signal.
  const remaining = [];
  for (const link of links) {
    const next = `${content}${content ? '\n' : ''}${link}`;
    if (next.length <= 2000) content = next; else remaining.push(link);
  }
  if (content !== String(payload.content ?? '')) result.content = content;
  if (remaining.length) {
    const embeds = (payload.embeds ?? []).map(embed => ({ ...embed, fields: [...(embed.fields ?? [])] }));
    let total = embedCharacters(embeds);
    for (const link of remaining) {
      const name = 'MODEL 1 / 3';
      if (total + name.length + link.length > 6000) break;
      let embed = embeds.find(item => item.fields.length < 25);
      if (!embed && embeds.length < 10) { embed = { fields: [] }; embeds.push(embed); }
      if (!embed) break;
      embed.fields.push({ name, value: link });
      total += name.length + link.length;
    }
    if (JSON.stringify(embeds) !== JSON.stringify(payload.embeds ?? [])) result.embeds = embeds;
  }
  return result;
}

export function wrapDiscordHeatmapLinks(fetchImpl) {
  return (input, init) => {
    let next = init;
    try {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      const method = String(init?.method ?? input?.method ?? 'GET').toUpperCase();
      if (method === 'POST' && url.protocol === 'https:'
          && ['discord.com', 'discordapp.com'].includes(url.hostname)
          && /^\/api\/(?:v\d+\/)?webhooks\/\d+\/[^/]+\/?$/.test(url.pathname)
          && typeof init?.body === 'string') {
        const original = JSON.parse(init.body);
        const enriched = withDiscordHeatmapLinks(original);
        if (enriched !== original) next = { ...init, body: JSON.stringify(enriched) };
      }
    } catch { /* Enrichment must not block or retry delivery. */ }
    return fetchImpl(input, next);
  };
}
