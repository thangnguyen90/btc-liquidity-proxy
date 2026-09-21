// Shared ONLY by aggregate OBSERVE ONLY Discord alerts, never by order execution.
export const BREADTH_ALERT_STABILITY_VERSION = 'BREADTH_ALERT_STABILITY_V2_20260913';
export const BREADTH_FLIP_MS = 180_000;
const RECENT_MS = 30 * 60_000;

export function isCriticalBreadth(event) {
  return ['PUMP', 'DUMP'].includes(event?.direction) && event.severity === 'DANGER'
    && event.score >= 95 && event.strongSharePct >= 20 && event.dominancePct >= 80
    && event.directionalTakerRatio >= 0.60 && event.volumeSharePct >= 10;
}

export class BreadthAlertStability {
  constructor({ confirmMs = 60_000, minSamples = 2 } = {}) {
    Object.assign(this, { confirmMs, minSamples });
    this.streak = null;
    this.lastEvaluatedAt = 0;
    this.lastConfirmed = null;
  }

  observe(candidate, evaluatedAt, now) {
    if (!Number.isFinite(evaluatedAt) || evaluatedAt > now || now - evaluatedAt > 45_000) {
      this.streak = null;
      return null;
    }
    // Re-reading the same snapshot is not another confirmation.
    if (evaluatedAt <= this.lastEvaluatedAt) return null;
    this.lastEvaluatedAt = evaluatedAt;
    if (!candidate) { this.streak = null; return null; }
    const critical = isCriticalBreadth(candidate);
    const old = this.streak;
    if (!old || old.direction !== candidate.direction || evaluatedAt - old.at > 60_000) {
      this.streak = {
        direction: candidate.direction, severity: candidate.severity,
        since: evaluatedAt, severitySince: evaluatedAt, criticalSince: critical ? evaluatedAt : null,
        at: evaluatedAt, count: 1,
      };
    } else {
      this.streak = {
        ...old, severity: candidate.severity, at: evaluatedAt, count: old.count + 1,
        severitySince: old.severity === candidate.severity ? old.severitySince : evaluatedAt,
        criticalSince: critical ? (old.criticalSince ?? evaluatedAt) : null,
      };
    }
    const streak = this.streak;
    const directionMs = evaluatedAt - streak.since;
    const severityMs = evaluatedAt - streak.severitySince;
    const criticalMs = streak.criticalSince == null ? 0 : evaluatedAt - streak.criticalSince;
    const flip = this.lastConfirmed && this.lastConfirmed.direction !== candidate.direction
      && evaluatedAt - this.lastConfirmed.at < RECENT_MS;
    const criticalConfirmed = critical && criticalMs >= 30_000;
    if (streak.count < Math.max(2, this.minSamples)
      || (!criticalConfirmed && (severityMs < this.confirmMs || (flip && directionMs < BREADTH_FLIP_MS)))) return null;
    this.lastConfirmed = { direction: candidate.direction, at: evaluatedAt };
    return {
      ...candidate, observedAt: evaluatedAt, generatedAt: new Date(evaluatedAt).toISOString(),
      dedupeKey: `${candidate.direction}|${candidate.severity}`,
      persistence: { version: BREADTH_ALERT_STABILITY_VERSION, samples: streak.count,
        directionMs, severityMs, criticalMs, criticalConfirmed, confirmMs: this.confirmMs },
    };
  }
}

export function lastBreadthAlert(state, now) {
  // V1 JSON has only alerts timestamps; retain its cooldown/last direction on rollout.
  return Object.entries(state?.alerts ?? {}).map(([key, at]) => {
    const [direction, severity] = key.split('|');
    return { direction, severity, sentAt: Number(at) };
  }).filter((row) => ['PUMP', 'DUMP', 'FROM_BELOW', 'FROM_ABOVE'].includes(row.direction)
    && ['WATCH', 'DANGER'].includes(row.severity) && row.sentAt > 0 && row.sentAt <= now)
    .sort((a, b) => b.sentAt - a.sentAt || (a.severity === 'DANGER' ? -1 : 1))[0] ?? null;
}

export function breadthDeliveryDecision(state, event, now, cooldownMs) {
  const p = event.persistence;
  const ema = event.direction.startsWith('FROM_');
  const minimumMs = ema ? 90_000 : 60_000;
  const critical = !ema && isCriticalBreadth(event) && p?.criticalMs >= 30_000;
  if (p?.version !== BREADTH_ALERT_STABILITY_VERSION || !Number.isInteger(p.samples) || p.samples < 2
    || !Number.isFinite(p.directionMs) || !Number.isFinite(p.severityMs)
    || p.directionMs < p.severityMs || p.severityMs < 0
    || (!critical && p.severityMs < minimumMs)) return { reason: 'unconfirmed' };
  const previous = lastBreadthAlert(state, now);
  const recent = previous && now - previous.sentAt < Math.max(RECENT_MS, cooldownMs);
  const flip = recent && previous.direction !== event.direction;
  if (flip && p.directionMs < BREADTH_FLIP_MS && !critical) return { reason: 'opposite_pending' };
  const dangerAt = Number(state?.alerts?.[`${event.direction}|DANGER`] ?? 0);
  if (!flip && event.severity === 'WATCH' && dangerAt > 0 && now - dangerAt < cooldownMs) {
    return { reason: 'downgrade_suppressed' };
  }
  const priorAt = Number(state?.alerts?.[`${event.direction}|${event.severity}`] ?? 0);
  if (!flip && priorAt > 0 && now - priorAt < cooldownMs) return { reason: 'deduped' };
  return { reason: null, previous: recent ? previous : null };
}

export function recordBreadthDelivery(state, event, now) {
  const summary = {
    direction: event.direction, severity: event.severity, score: event.score, sentAt: now,
    observedAt: event.observedAt, processed: event.processed,
    sideCount: event.sideCount ?? event.dominantCount, context: event.context ?? null,
    persistence: event.persistence,
  };
  state.lastAlert = summary;
  state.recentAlerts = [...(Array.isArray(state.recentAlerts) ? state.recentAlerts : []), summary].slice(-100);
}

const signed = (v) => Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '--';
const directionName = (d) => ({ UP: 'TĂNG', DOWN: 'GIẢM', MIXED: 'ĐAN XEN', UNKNOWN: 'THIẾU DỮ LIỆU' }[d] ?? 'THIẾU DỮ LIỆU');
export function breadthContextText(context) {
  return [15, 30].map((minutes) => {
    const row = context?.[`${minutes}m`];
    return `${minutes}m: **${directionName(row?.direction)}** · median ${signed(row?.medianMovePct)}`
      + (row ? ` · tăng ${row.upCount}/${row.processed}, giảm ${row.downCount}/${row.processed}` : '');
  }).join('\n');
}

export function breadthPhase(event) {
  const a = event.context?.['15m']?.direction;
  const b = event.context?.['30m']?.direction;
  if (!a || !b || a === 'UNKNOWN' || b === 'UNKNOWN') return 'CHƯA ĐỦ BỐI CẢNH 15–30m';
  if (a !== b || a === 'MIXED') return 'NHỊP NGẮN · 15–30m CHƯA ĐỒNG THUẬN';
  const same = event.direction === 'PUMP' ? a === 'UP' : a === 'DOWN';
  return same ? 'CÙNG CHIỀU NHỊP 15–30m'
    : event.direction === 'PUMP' ? 'HỒI LÊN TRONG NHỊP GIẢM 15–30m' : 'GIẢM NGẮN TRONG NHỊP TĂNG 15–30m';
}

export function breadthConfirmationText(event) {
  const p = event.persistence;
  const previous = event.previousAlert;
  const changed = previous && previous.direction !== event.direction;
  return `Cùng phía duy trì ${p ? Math.round(p.directionMs / 1000) : '--'} giây`
    + (p?.criticalConfirmed ? ' · cảnh báo khẩn đã xác nhận ≥30 giây' : '')
    + (changed ? `\nĐổi nhịp so với ${previous.direction}/${previous.severity} lúc ${new Date(previous.sentAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.` : '')
    + '\nĐây là trạng thái đang quan sát, không xác nhận đảo chiều xu hướng.';
}

// A live socket for one coin does not make every cached coin fresh.
export function freshBreadthSymbol(klineCache, symbol, interval, now, maxAgeMs) {
  const age = klineCache?.liveCoverage?.([symbol], interval, now)?.newestTickAgeMs;
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
}
