export const COIN_LEVEL_MARKET_REGIME_GUARD_VERSION =
  'COIN_LEVEL_MARKET_REGIME_GUARD_V1_20260922';

export const COIN_LEVEL_MARKET_REGIME_DEFAULTS = Object.freeze({
  riskOnConfirmMs: 15 * 60_000,
  dumpQuietMs: 30 * 60_000,
  maxSnapshotAgeMs: 60_000,
  minimumTakerBuyRiskOn: 0.52,
  maximumTakerBuyRiskOff: 0.48,
  minimumUpDownRatio: 1.5,
  minimumSamples: 60,
  minimumCoveragePct: 20,
});

const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

function contextDirection(metrics, key) {
  return String(metrics?.context?.[key]?.direction ?? 'UNKNOWN').toUpperCase();
}

function compactMetrics(metrics) {
  return {
    processed: finite(metrics?.processed, 0),
    coveragePct: finite(metrics?.coveragePct, 0),
    upCount: finite(metrics?.upCount, 0),
    downCount: finite(metrics?.downCount, 0),
    strongUpCount: finite(metrics?.strongUpCount, 0),
    strongDownCount: finite(metrics?.strongDownCount, 0),
    takerBuyRatio: finite(metrics?.takerBuyRatio),
    context15m: contextDirection(metrics, '15m'),
    context30m: contextDirection(metrics, '30m'),
  };
}

export class CoinLevelMarketRegimeGuard {
  constructor({ now = () => Date.now(), config = {} } = {}) {
    this.now = now;
    this.config = { ...COIN_LEVEL_MARKET_REGIME_DEFAULTS, ...config };
    this.startedAt = this.now();
    this.goodSince = null;
    this.lastDumpAt = null;
    this.latest = null;
  }

  observe(metrics, shockCandidate = null) {
    const now = this.now();
    const evaluatedAt = finite(metrics?.evaluatedAt);
    const values = compactMetrics(metrics);
    const dataReady = Boolean(
      evaluatedAt != null
      && evaluatedAt <= now
      && now - evaluatedAt <= this.config.maxSnapshotAgeMs
      && metrics?.socketFresh === true
      && values.processed >= this.config.minimumSamples
      && values.coveragePct >= this.config.minimumCoveragePct,
    );
    const shockLabel = ['PUMP', 'DUMP'].includes(shockCandidate?.direction)
      && ['WATCH', 'DANGER'].includes(shockCandidate?.severity)
      ? `${shockCandidate.direction}_${shockCandidate.severity}`
      : null;
    const dumpShock = shockCandidate?.direction === 'DUMP'
      && ['WATCH', 'DANGER'].includes(shockCandidate?.severity);
    if (dataReady && dumpShock) this.lastDumpAt = evaluatedAt;

    const reasons = [];
    let state = 'WAIT_DATA';
    if (!dataReady) {
      this.goodSince = null;
      reasons.push('Dữ liệu breadth/socket chưa đủ hoặc đã cũ; fail-closed LONG mới.');
    } else {
      const bothDown = values.context15m === 'DOWN' && values.context30m === 'DOWN';
      const weakTaker = values.takerBuyRatio != null
        && values.takerBuyRatio < this.config.maximumTakerBuyRiskOff;
      if (dumpShock) reasons.push(`MarketBreadthShock đang ${shockLabel}.`);
      if (bothDown) reasons.push('Breadth 15m và 30m cùng DOWN.');
      if (weakTaker) reasons.push(
        `Taker-buy ${(values.takerBuyRatio * 100).toFixed(1)}% < ${(this.config.maximumTakerBuyRiskOff * 100).toFixed(0)}%.`,
      );

      if (dumpShock || bothDown || weakTaker) {
        state = 'RISK_OFF';
        this.goodSince = null;
      } else {
        const contextUp = values.context15m === 'UP' && values.context30m === 'UP';
        const breadthRatio = values.upCount / Math.max(1, values.downCount);
        const breadthUp = breadthRatio >= this.config.minimumUpDownRatio;
        const takerUp = values.takerBuyRatio != null
          && values.takerBuyRatio >= this.config.minimumTakerBuyRiskOn;
        const quietAnchorAt = this.lastDumpAt ?? this.startedAt;
        const dumpQuiet = evaluatedAt - quietAnchorAt >= this.config.dumpQuietMs;
        const positiveSample = contextUp && breadthUp && takerUp;
        if (positiveSample) this.goodSince ??= evaluatedAt;
        else this.goodSince = null;
        const stableMs = this.goodSince == null ? 0 : evaluatedAt - this.goodSince;

        if (positiveSample && dumpQuiet && stableMs >= this.config.riskOnConfirmMs) {
          state = 'RISK_ON';
          reasons.push('15m/30m UP, breadth tăng dẫn ≥1,5×, taker-buy ≥52% và đã yên DUMP đủ thời gian.');
        } else {
          state = 'RECOVERY_TEST';
          if (!contextUp) reasons.push('Chưa đồng thời có 15m và 30m UP.');
          if (!breadthUp) reasons.push(`Coin tăng/chia giảm mới ${breadthRatio.toFixed(2)}×, cần ≥${this.config.minimumUpDownRatio.toFixed(1)}×.`);
          if (!takerUp) reasons.push(`Taker-buy cần ≥${(this.config.minimumTakerBuyRiskOn * 100).toFixed(0)}%.`);
          if (!dumpQuiet) reasons.push('Chưa yên DUMP_WATCH/DANGER đủ 30 phút.');
          if (positiveSample && stableMs < this.config.riskOnConfirmMs) reasons.push(`Điều kiện tốt mới giữ ${Math.floor(stableMs / 60_000)}/15 phút.`);
        }
      }
    }

    const stableMs = this.goodSince == null || evaluatedAt == null ? 0 : Math.max(0, evaluatedAt - this.goodSince);
    this.latest = {
      version: COIN_LEVEL_MARKET_REGIME_GUARD_VERSION,
      state,
      allowLongEntry: state === 'RISK_ON',
      allowShortEntry: true,
      evaluatedAt,
      dataReady,
      shockLabel,
      reasons,
      metrics: values,
      riskOnGoodSince: this.goodSince,
      riskOnStableMs: stableMs,
      riskOnRemainingMs: Math.max(0, this.config.riskOnConfirmMs - stableMs),
      lastDumpAt: this.lastDumpAt,
      dumpQuietRemainingMs: evaluatedAt == null
        ? this.config.dumpQuietMs
        : Math.max(0, this.config.dumpQuietMs - (evaluatedAt - (this.lastDumpAt ?? this.startedAt))),
      policy: {
        riskOnConfirmMs: this.config.riskOnConfirmMs,
        dumpQuietMs: this.config.dumpQuietMs,
        maximumTakerBuyRiskOff: this.config.maximumTakerBuyRiskOff,
        minimumTakerBuyRiskOn: this.config.minimumTakerBuyRiskOn,
        minimumUpDownRatio: this.config.minimumUpDownRatio,
      },
    };
    return this.snapshot(now);
  }

  snapshot(at = this.now()) {
    if (!this.latest || !Number.isFinite(this.latest.evaluatedAt)
      || at - this.latest.evaluatedAt > this.config.maxSnapshotAgeMs) {
      return {
        version: COIN_LEVEL_MARKET_REGIME_GUARD_VERSION,
        state: 'WAIT_DATA',
        allowLongEntry: false,
        allowShortEntry: true,
        evaluatedAt: this.latest?.evaluatedAt ?? null,
        dataReady: false,
        shockLabel: this.latest?.shockLabel ?? null,
        reasons: ['Dữ liệu MarketBreadthShock chưa có hoặc đã quá 60 giây; fail-closed LONG mới.'],
        metrics: this.latest?.metrics ?? compactMetrics(null),
        riskOnGoodSince: null,
        riskOnStableMs: 0,
        riskOnRemainingMs: this.config.riskOnConfirmMs,
        lastDumpAt: this.lastDumpAt,
        dumpQuietRemainingMs: 0,
        policy: {
          riskOnConfirmMs: this.config.riskOnConfirmMs,
          dumpQuietMs: this.config.dumpQuietMs,
          maximumTakerBuyRiskOff: this.config.maximumTakerBuyRiskOff,
          minimumTakerBuyRiskOn: this.config.minimumTakerBuyRiskOn,
          minimumUpDownRatio: this.config.minimumUpDownRatio,
        },
      };
    }
    return { ...this.latest, reasons: [...this.latest.reasons], metrics: { ...this.latest.metrics } };
  }
}
