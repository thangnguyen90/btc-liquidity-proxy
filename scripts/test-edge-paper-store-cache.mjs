#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(source, /EDGE_PAPER_STORE_CACHE_V1_20260822/);
assert.match(source, /if \(_edgePaperStoreCache\) return _edgePaperStoreCache/);
assert.match(source, /if \(_edgePaperStoreLoadPromise\) return _edgePaperStoreLoadPromise/);
assert.match(source, /_edgePaperStoreCache = store;\s+_edgePaperWriteLock/);
assert.match(source, /setInterval\(\(\) => processEdgePaperCachedMarks/);
assert.match(source, /BR_LIKE_LIMIT_STORE_CACHE_V1_20260822/);
assert.match(source, /if \(_brLikeLimitPaperStoreCache\) return _brLikeLimitPaperStoreCache/);
assert.match(source, /_brLikeLimitPaperStoreCache = store;\s+_brLikeLimitPaperWriteLock/);
assert.match(source, /SHAKEOUT_PAPER_STORE_CACHE_V1_20260822/);
assert.match(source, /if \(_shakeoutPaperStoreCache\) return _shakeoutPaperStoreCache/);
assert.match(source, /_shakeoutPaperStoreCache = store;\s+_shakeoutPaperWriteLock/);
assert.match(source, /function pushSse\(clients, data\) \{\s+if \(!clients \|\| clients\.size === 0\) return;/);
assert.equal(
  (source.match(/getPumpPaperActiveIndex\([^)]*\)\.ema\.filter\(\(t\) =>\s+isEmaSqueezeBreakoutPaperTrade/g) ?? []).length,
  3,
);
console.log('hot paper store cache tests passed');
