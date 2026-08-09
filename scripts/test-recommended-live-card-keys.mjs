import assert from 'node:assert/strict';
import { recommendedLiveCardKeysOfTrade } from '../src/recommendedSignals.js';

const trade = {
  id: 'recommended-live-card-test',
  status: 'OPEN',
  paperMode: 'recommended-clone-shadow-v1',
  sourcePage: 'liquid',
  symbol: 'BTCUSDT',
  side: 'SHORT',
  score: 80,
  marginUsdt: 10,
  leverage: 10,
  entryPrice: 100,
  fillPrice: 100,
  tp: 99,
  sl: 101,
  createdAt: '2026-08-02T00:00:00.000Z',
  openedAt: '2026-08-02T00:00:00.000Z',
  recommendationStrength: 'STRONG',
  recommendationCombo: 'LIQUID | SHORT | 15m',
  recommendationBtcPhase: 'BTC_DOWN',
  recommendedSourceLayerAtEntry: 'GOOD',
  recommendedCloneLayerAtEntry: 'GOOD',
};

const keys = recommendedLiveCardKeysOfTrade(trade);
assert(Array.isArray(keys));
assert(keys.every((key) => key.startsWith('recommended:')));
assert(keys.length > 0);

console.log(`recommended live card key tests passed (${keys.length} keys)`);
