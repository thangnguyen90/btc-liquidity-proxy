import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LOCAL_AI_MAIN_KILL_GAP_WATCH_VERSION,
  assessLocalAiMainKillGap,
  buildLocalAiMainKillGapWatchSnapshot,
  resolveMainKillGapCandidateSource,
} from '../src/localAiMainKillGapWatch.js';

const candidate = { symbol:'TESTUSDT', side:'LONG', verdict:'PRIORITY', strength:82, path:'CONTINUATION', horizon:'1h' };
const analysis = {
  symbol:'TESTUSDT', generatedAt:'2026-10-02T10:00:00.000Z', freshness:{stale:false},
  market:{markPrice:100},
  trend:{frames:[{interval:'15m',atrPct:1}]},
  liqScan:{
    current:{dominantSide:'ABOVE',killZoneCluster:{mainKillZone:{low:104,high:105,score:12_500_000}}},
    sweepRejectShort:null,sweepRejectLong:null,
  },
  orderBookProfile:{source:'BINANCE_FUTURES_DEPTH',coverage:{ask:{farthestDistancePct:8},bid:{farthestDistancePct:7}},
    near:{askZones:[{low:100.4,high:100.8,orderBookNotional:100_000}],bidZones:[]},
    wide:{askZones:[{low:106,high:107,orderBookNotional:900_000}],bidZones:[]}},
};

const confirmed = assessLocalAiMainKillGap({ candidate, analysis });
assert.equal(confirmed.status, 'GAP_WIDE_VACUUM_CONFIRMED');
assert.equal(confirmed.gapPct, 4);
assert.equal(confirmed.gapAtr, 4);
assert.equal(confirmed.depth.coverageEnough, true);
assert.equal(confirmed.depth.intermediateSharePct, 10);
assert.equal(confirmed.vacuumConfirmed, true);
assert.equal(confirmed.mainKillZone.scoreUsdProxy, 12_500_000);

const blocked = assessLocalAiMainKillGap({ candidate, analysis:{...analysis,orderBookProfile:{...analysis.orderBookProfile,
  near:{askZones:[{low:100.4,high:103.9,orderBookNotional:800_000}],bidZones:[]},
  wide:{askZones:[{low:106,high:107,orderBookNotional:200_000}],bidZones:[]}}} });
assert.equal(blocked.status, 'GAP_WIDE_WITH_INTERMEDIATE_DEPTH');
assert.equal(blocked.depth.intermediateSharePct, 80);

const uncovered = assessLocalAiMainKillGap({ candidate, analysis:{...analysis,orderBookProfile:{...analysis.orderBookProfile,
  coverage:{ask:{farthestDistancePct:2.5},bid:{farthestDistancePct:7}}}} });
assert.equal(uncovered.status, 'GAP_WIDE_DEPTH_UNCONFIRMED');
assert.equal(uncovered.depth.coverageEnough, false);

const noAtr = assessLocalAiMainKillGap({ candidate, analysis:{...analysis,trend:{frames:[]}} });
assert.equal(noAtr.status, 'GAP_PCT_ONLY_UNCONFIRMED_ATR');

const consumed = assessLocalAiMainKillGap({ candidate, analysis:{...analysis,market:{markPrice:106}} });
assert.equal(consumed.status, 'MAIN_KILL_CONSUMED');
assert.equal(consumed.lifecycle.active, false);

const snapshot = buildLocalAiMainKillGapWatchSnapshot({
  evaluation:{evaluatedAt:Date.now(),model:'qwen3:8b',marketRegime:'SW_UP',marketBias:'LONG_BIAS',candidates:[candidate]},
  analyses:[analysis],
});
assert.equal(snapshot.version, LOCAL_AI_MAIN_KILL_GAP_WATCH_VERSION);
assert.equal(snapshot.counts.candidates, 1);
assert.equal(snapshot.counts.vacuumConfirmed, 1);
assert.equal(snapshot.observeOnly, true);
assert.equal(snapshot.binanceEligible, false);
const pendingSource = resolveMainKillGapCandidateSource({ input:{ candidates:[{symbol:'WAITUSDT',side:'SHORT'}] } });
assert.equal(pendingSource.candidateSource, 'AI_DETERMINISTIC_SHORTLIST_PENDING_MODEL');
assert.equal(pendingSource.candidates[0].verdict, 'UNRATED');
assert.equal(assessLocalAiMainKillGap({ candidate:pendingSource.candidates[0], analysis:{} }).strength, null,
  'pending model strength must stay missing instead of becoming zero');
const evaluatedSource = resolveMainKillGapCandidateSource({ evaluation:{ candidates:[candidate] } });
assert.equal(evaluatedSource.candidateSource, 'AI_EVALUATION');

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(serverSource, /\/api\/local-ai-main-kill-gap-watch/);
assert.match(serverSource, /pathname === '\/main-kill-gap-watch'/);
const pageSource = await readFile(new URL('../public/main-kill-gap-watch.html', import.meta.url), 'utf8');
assert.match(pageSource, /Khoảng trống tới MAIN KILL/);
assert.match(pageSource, /OBSERVE ONLY/);
const jsSource = await readFile(new URL('../public/main-kill-gap-watch.js', import.meta.url), 'utf8');
assert.match(jsSource, /GAP RỘNG \+ VACUUM/);
assert.match(jsSource, /\/api\/local-ai-main-kill-gap-watch/);

console.log('local AI main-kill gap watch tests: OK');
