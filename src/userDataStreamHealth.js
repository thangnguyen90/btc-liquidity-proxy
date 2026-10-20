// Transport health only. Never infers an entry or changes a protection policy.
export const USER_DATA_HEALTH_VERSION = 'USER_DATA_HEALTH_V1_PONG_REST_DRIFT_20261016';
export const USER_DATA_HEALTH_DEFAULTS = Object.freeze({
  pingEveryMs: 30_000, pongTimeoutMs: 15_000, connectTimeoutMs: 20_000,
  rotateAfterMs: 23 * 60 * 60_000, driftGraceMs: 15_000,
  stableAfterMs: 120_000, restartAfterMs: 300_000, restartFaults: 3,
});

const signature = row => {
  const amount = Number(row?.positionAmt ?? row?.pa ?? 0);
  if (!Number.isFinite(amount)) return null;
  if (amount === 0) return '0';
  const entry = Number(row?.entryPrice ?? row?.ep);
  if (!Number.isFinite(entry)) return null;
  return [amount, entry.toPrecision(10), row?.positionSide ?? row?.ps ?? 'BOTH'].join(':');
};
const positionKey = row => (row?.symbol ?? row?.s) + ':' + (row?.positionSide ?? row?.ps ?? 'BOTH');

export function createUserDataStreamHealth({ now = Date.now, settings = {} } = {}) {
  const cfg = { ...USER_DATA_HEALTH_DEFAULTS, ...settings };
  let enabled = false, connected = false, connectingAt = null, connectedAt = null;
  let pingAt = null, pongAt = null, pending = null, sequence = 0;
  let incidentAt = null, faults = 0, lastReason = null, recoveryAt = null;
  let restSeeded = false, rest = new Map();
  const account = new Map(), mismatches = new Map();

  function fault(reason) {
    if (!enabled) return;
    incidentAt ??= now(); faults += 1; lastReason = reason;
  }
  return {
    connecting() { enabled = true; connectingAt = now(); },
    opened() {
      connected = true; connectingAt = null; connectedAt = now();
      pingAt = null; pongAt = null; pending = null;
      restSeeded = false; rest.clear(); account.clear(); mismatches.clear();
    },
    disconnected(reason, { failure = true } = {}) {
      if (failure) fault(reason);
      connected = false; connectingAt = null; pending = null;
    },
    recoveryStarted() { recoveryAt ??= now(); },
    recoveryFinished() { recoveryAt = null; },
    observeAccount(rows) {
      for (const row of rows) {
        const symbol = row?.s ?? row?.symbol, sig = signature(row);
        if (!symbol || sig === null) continue;
        const key = positionKey(row);
        account.set(key, sig);
        if (mismatches.get(key)?.expected === sig) mismatches.delete(key);
      }
    },
    observeRest(rows) {
      if (!connected) return;
      const next = new Map();
      for (const row of rows) {
        const sig = signature(row);
        if (row?.symbol && sig !== null && sig !== '0') next.set(positionKey(row), sig);
      }
      if (restSeeded) for (const symbol of new Set([...rest.keys(), ...next.keys()])) {
        const sig = next.get(symbol) ?? '0';
        if (mismatches.has(symbol) || (rest.get(symbol) ?? '0') !== sig) {
          if ((account.get(symbol) ?? '0') === sig) mismatches.delete(symbol);
          else mismatches.set(symbol, { expected: sig, since: mismatches.get(symbol)?.since ?? now() });
        }
      }
      rest = next; restSeeded = true;
    },
    pong(payload) {
      if (!connected || !pending || String(payload) !== pending.payload) return false;
      pongAt = now(); pending = null;
      if (now() - connectedAt >= cfg.stableAfterMs && recoveryAt === null && mismatches.size === 0) {
        incidentAt = null; faults = 0; lastReason = null;
      }
      return true;
    },
    check() {
      if (!enabled) return null;
      if (connectingAt !== null && now() - connectingAt >= cfg.connectTimeoutMs)
        return { type: 'RECONNECT', reason: 'connect-timeout' };
      if (!connected) return null;
      if (pending && now() - pending.at >= cfg.pongTimeoutMs)
        return { type: 'RECONNECT', reason: 'pong-timeout' };
      if ([...mismatches.values()].some(x => now() - x.since >= cfg.driftGraceMs))
        return { type: 'RECONNECT', reason: 'rest-position-without-account-event' };
      if (now() - connectedAt >= cfg.rotateAfterMs)
        return { type: 'RECONNECT', reason: 'scheduled-23h-rotation', failure: false };
      if (!pending && (pingAt === null || now() - pingAt >= cfg.pingEveryMs)) {
        pingAt = now(); pending = { at: pingAt, payload: 'ud-health-' + (++sequence) };
        return { type: 'PING', payload: pending.payload };
      }
      return null;
    },
    snapshot() {
      const stalledRecovery = recoveryAt !== null && now() - recoveryAt >= cfg.restartAfterMs;
      const exhausted = incidentAt !== null && now() - incidentAt >= cfg.restartAfterMs && faults >= cfg.restartFaults;
      return {
        version: USER_DATA_HEALTH_VERSION, enabled, connected,
        restartRequired: enabled && (stalledRecovery || exhausted),
        reason: stalledRecovery ? 'fill-recovery-timeout' : lastReason,
        faultCount: faults, incidentSince: incidentAt, connectedAt,
        lastPingAt: pingAt, lastPongAt: pongAt, recoveryStartedAt: recoveryAt,
        pendingRestMismatches: mismatches.size,
      };
    },
  };
}
