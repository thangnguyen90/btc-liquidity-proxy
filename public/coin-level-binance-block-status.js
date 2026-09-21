export const COIN_LEVEL_BINANCE_BLOCK_STATUS_VERSION = 'COIN_LEVEL_BINANCE_BLOCK_STATUS_V1_20260920';

function safeReason(value) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 240);
}

export function buildCoinLevelBinanceBlockStatus(snapshot, now = Date.now()) {
  const complete = [snapshot?.gate, snapshot?.analyzeGate].every((gate) => gate
    && gate.blockedUntil != null && gate.authBlockedUntil != null
    && Number.isFinite(Number(gate.blockedUntil))
    && Number.isFinite(Number(gate.authBlockedUntil))
    && typeof gate.congested === 'boolean');
  const gates = [
    ['REST chung', snapshot?.gate],
    ['REST phân tích', snapshot?.analyzeGate],
  ].filter(([, gate]) => gate && typeof gate === 'object');
  if (!gates.length) return { version: COIN_LEVEL_BINANCE_BLOCK_STATUS_VERSION, state: 'UNKNOWN', blocks: [], queues: [] };

  const blocks = [];
  const queues = [];
  for (const [scope, gate] of gates) {
    const authBlocks = Array.isArray(gate.authBlocks) ? gate.authBlocks : [];
    const activeAuth = authBlocks.filter((block) => Number(block?.blockedUntil) > now);
    for (const block of activeAuth) {
      blocks.push({
        scope,
        type: 'AUTH',
        reason: safeReason(block.reason || gate.authBlockReason || 'Binance từ chối API key, IP hoặc quyền truy cập (-2015).'),
        source: safeReason(block.source),
        until: Number(block.blockedUntil),
        nextProbeAt: Number(block.nextProbeAt) > now ? Number(block.nextProbeAt) : null,
      });
    }
    if (!activeAuth.length && Number(gate.authBlockedUntil) > now) {
      blocks.push({ scope, type: 'AUTH', reason: safeReason(gate.authBlockReason || 'Binance từ chối API key, IP hoặc quyền truy cập (-2015).'), source: '', until: Number(gate.authBlockedUntil), nextProbeAt: null });
    }
    if (Number(gate.blockedUntil) > now) {
      const reason = safeReason(gate.blockReason || 'Binance REST rate limit');
      blocks.push({
        scope,
        type: /\b418\b/.test(reason) ? 'HTTP_418' : /\b429\b/.test(reason) ? 'HTTP_429' : 'REST_BLOCK',
        reason,
        source: '',
        until: Number(gate.blockedUntil),
        nextProbeAt: null,
      });
    }
    if (gate.congested === true && !(Number(gate.blockedUntil) > now)) {
      queues.push({ scope, queued: Number(gate.queue) || 0, highWatermark: Number(gate.highWatermark) || null });
    }
  }
  blocks.sort((a, b) => a.until - b.until);
  return {
    version: COIN_LEVEL_BINANCE_BLOCK_STATUS_VERSION,
    state: blocks.length ? 'BLOCKED' : queues.length ? 'CONGESTED' : complete ? 'CLEAR' : 'UNKNOWN',
    blocks,
    queues,
    checkedAt: Number(snapshot?.scannedAt) || now,
  };
}
