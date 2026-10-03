import assert from 'node:assert/strict';
import {
  LOCAL_AI_OLLAMA_PROCESS_GUARD_VERSION,
  LocalAiOllamaProcessGuard,
  selectOrphanedLlamaServers,
} from '../src/localAiOllamaProcessGuard.js';

const now = Date.parse('2026-10-01T08:00:00.000Z');
const inventory = [
  { processId: 100, parentProcessId: 4, name: 'ollama.exe', createdAtMs: now - 60 * 60_000 },
  { processId: 101, parentProcessId: 100, name: 'llama-server.exe', createdAtMs: now - 30 * 60_000 },
  { processId: 201, parentProcessId: 9991, name: 'llama-server.exe', createdAtMs: now - 20 * 60_000 },
  { processId: 202, parentProcessId: 9992, name: 'llama-server.exe', createdAtMs: now - 2 * 60_000 },
  { processId: 203, parentProcessId: 9993, name: 'other-model.exe', createdAtMs: now - 20 * 60_000 },
];

const selected = selectOrphanedLlamaServers(inventory, { now, minAgeMs: 5 * 60_000 });
assert.deepEqual(selected.map(process => process.processId), [201]);
assert.equal(selected.some(process => process.processId === 101), false, 'live Ollama child must be retained');
assert.equal(selected.some(process => process.processId === 202), false, 'young orphan must survive grace period');

const killed = [];
const guard = new LocalAiOllamaProcessGuard({
  enabled: true,
  minAgeMs: 5 * 60_000,
  inventoryProvider: async () => inventory,
  orphanTerminator: async processId => {
    killed.push(processId);
    return { processId, killed: true, reason: 'ORPHAN_PARENT_MISSING' };
  },
  now: () => now,
});
const cleanup = await guard.cleanup();
assert.equal(cleanup.version, LOCAL_AI_OLLAMA_PROCESS_GUARD_VERSION);
assert.deepEqual(cleanup.candidates, [201]);
assert.deepEqual(cleanup.killed, [201]);
assert.deepEqual(killed, [201]);
assert.equal(guard.snapshot().lastResult.checkedAt, now);

const dryRunKills = [];
const dryRunGuard = new LocalAiOllamaProcessGuard({
  enabled: true,
  minAgeMs: 5 * 60_000,
  inventoryProvider: async () => inventory,
  orphanTerminator: async processId => { dryRunKills.push(processId); },
  now: () => now,
});
const dryRun = await dryRunGuard.cleanup({ dryRun: true });
assert.deepEqual(dryRun.candidates, [201]);
assert.deepEqual(dryRun.killed, []);
assert.deepEqual(dryRunKills, []);

const disabled = new LocalAiOllamaProcessGuard({ enabled: false });
assert.deepEqual(await disabled.cleanup(), {
  enabled: false, dryRun: false, inspected: 0, candidates: [], killed: [],
});

console.log('local AI Ollama process guard tests: OK');
