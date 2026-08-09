import { createAggTradeTicker } from './aggTradeTicker.js';

const handlers = new Map();
const latestPrices = new Map();
let ticker = null;

function ensureTicker() {
  if (ticker) return;
  ticker = createAggTradeTicker({
    logLabel: 'SharedPaperLastTick',
    onPrice: ({ symbol, markPrice, eventTime }) => {
      latestPrices.set(symbol, { markPrice, at: eventTime });
      for (const handler of handlers.values()) {
        if (!handler.symbols.has(symbol)) continue;
        try { handler.onPrice({ symbol, markPrice, eventTime }); } catch {}
      }
    },
  });
}

function rebuildSymbols() {
  if (!ticker) return;
  const symbols = new Set();
  for (const handler of handlers.values()) {
    for (const symbol of handler.symbols) symbols.add(symbol);
  }
  ticker.setSymbols([...symbols]);
}

export const sharedLastTicker = {
  createClient(id, onPrice) {
    ensureTicker();
    const current = handlers.get(id);
    if (current) current.onPrice = onPrice;
    else handlers.set(id, { symbols: new Set(), onPrice });
    rebuildSymbols();
    return {
      setSymbols(nextSymbols) {
        const handler = handlers.get(id);
        if (!handler) return;
        handler.symbols = new Set(
          nextSymbols.map((symbol) => String(symbol ?? '').toUpperCase()).filter(Boolean),
        );
        rebuildSymbols();
      },
      close() {
        handlers.delete(id);
        rebuildSymbols();
      },
    };
  },

  register(id, onPrice) {
    ensureTicker();
    const current = handlers.get(id);
    if (current) current.onPrice = onPrice;
    else handlers.set(id, { symbols: new Set(), onPrice });
  },

  setSymbols(id, nextSymbols) {
    const handler = handlers.get(id);
    if (!handler) return;
    handler.symbols = new Set(
      nextSymbols.map((symbol) => String(symbol ?? '').toUpperCase()).filter(Boolean),
    );
    rebuildSymbols();
  },

  unregister(id) {
    handlers.delete(id);
    rebuildSymbols();
  },

  getPrice(symbol) {
    return latestPrices.get(String(symbol ?? '').toUpperCase())?.markPrice ?? null;
  },

  getPriceInfo(symbol) {
    const row = latestPrices.get(String(symbol ?? '').toUpperCase());
    return row ? { ...row } : null;
  },
};
