/**
 * sharedMarkTicker.js
 *
 * Single bookTicker WebSocket connection shared by ALL paper trade systems.
 * Instead of 6 separate createMarkPriceTicker() instances, every system
 * registers its callback and symbols here.  Prices are dispatched to all
 * registered handlers whose symbol set matches the incoming symbol.
 *
 * Usage:
 *   import { sharedMarkTicker } from './sharedMarkTicker.js';
 *   sharedMarkTicker.register('capPaper', ({ symbol, markPrice }) => { ... });
 *   sharedMarkTicker.setSymbols('capPaper', ['BTCUSDT', 'ETHUSDT']);
 *   // when symbols change:
 *   sharedMarkTicker.setSymbols('capPaper', newSymbols);
 */

import { createMarkPriceTicker } from './markPriceTicker.js';

const _handlers = new Map(); // id → { symbols: Set<string>, onPrice: fn }
const _latestPrices = new Map(); // symbol -> { markPrice, at }
let _ticker = null;

function _ensureTicker() {
  if (_ticker) return;
  _ticker = createMarkPriceTicker({
    onPrice: ({ symbol, markPrice }) => {
      _latestPrices.set(symbol, { markPrice, at: Date.now() });
      for (const h of _handlers.values()) {
        if (h.symbols.has(symbol)) {
          try { h.onPrice({ symbol, markPrice }); } catch {}
        }
      }
    },
  });
}

function _rebuildSymbols() {
  if (!_ticker) return;
  const all = new Set();
  for (const h of _handlers.values()) h.symbols.forEach((s) => all.add(s));
  _ticker.setSymbols([...all]);
}

export const sharedMarkTicker = {
  /**
   * Register an onPrice handler for a given id.
   * Must be called before setSymbols.
   */
  register(id, onPrice) {
    _ensureTicker();
    if (_handlers.has(id)) {
      _handlers.get(id).onPrice = onPrice;
    } else {
      _handlers.set(id, { symbols: new Set(), onPrice });
    }
  },

  /**
   * Update the symbol subscription for a given id.
   * Triggers a diff-subscribe/unsubscribe on the shared WS.
   */
  setSymbols(id, symbols) {
    const h = _handlers.get(id);
    if (!h) return;
    h.symbols = new Set(symbols);
    _rebuildSymbols();
  },

  /**
   * Remove a handler and its symbols from the shared subscription.
   */
  unregister(id) {
    _handlers.delete(id);
    _rebuildSymbols();
  },

  getPrice(symbol) {
    return _latestPrices.get(String(symbol ?? '').toUpperCase())?.markPrice ?? null;
  },
};
