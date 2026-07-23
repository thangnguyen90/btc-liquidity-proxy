import assert from 'node:assert/strict';
import { getBrLikeEvalRule } from '../src/brLikeEvalRule.js';

function decide(side, interval, dir, score, corr, hour) {
  return getBrLikeEvalRule({ side, interval, btcTrendDir: dir, btcTrendScore: score, btcCorr: corr, hour });
}

assert.equal(decide('LONG', '15m', 'down', 30, 0.2, 10).tier, 'B');
assert.equal(decide('LONG', '5m', 'up', 55, 0.2, 18).tier, 'BLOCK');
assert.equal(decide('SHORT', '5m', 'up', 55, 0.6, 14).tier, 'B');
assert.equal(decide('SHORT', '5m', 'up', 55, 0.6, 19).tier, 'BLOCK');
assert.equal(decide('SHORT', '5m', 'up', 55, 0.2, 14).tier, 'BLOCK');
assert.equal(decide('SHORT', '15m', 'down', 70, 0.4, 17).tier, 'A');
assert.equal(decide('SHORT', '15m', 'down', 70, 0.4, 19).tier, 'B');
assert.equal(decide('SHORT', '15m', 'up', 30, 0.6, 14).tier, 'BLOCK');
assert.equal(decide('SHORT', '15m', 'down', 55, 0.6, 14).tier, 'B');
assert.equal(decide('SHORT', '15m', 'down', 55, 0.6, 19).tier, 'BLOCK');
assert.equal(decide('SHORT', '1h', 'down', 70, 0.4, 17).tier, 'BLOCK');
assert.equal(decide('SHORT', '15m', null, null, null, 17).tier, 'BLOCK');

console.log('BR-like eval rule matrix: OK');
