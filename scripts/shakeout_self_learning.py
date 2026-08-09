#!/usr/bin/env python3
"""Read-only self-learning sidecar for Shakeout signals and paper trades.

The script learns empirical cohorts from CLOSED paper trades and emits analysis
flags.  It never writes the paper store and is not imported by trading logic.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


UTC = timezone.utc
BANGKOK = timezone(timedelta(hours=7))


def text(value: Any, fallback: str = "UNKNOWN") -> str:
    raw = str(value if value is not None else "").strip().upper()
    return raw or fallback


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        result = float(value)
        return result if math.isfinite(result) else fallback
    except (TypeError, ValueError):
        return fallback


def parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(UTC)
    except ValueError:
        return None


def hour_bucket(record: dict[str, Any]) -> str:
    stamp = parse_time(record.get("createdAt") or record.get("openedAt") or record.get("scannedAt"))
    hour = (stamp or datetime.now(UTC)).astimezone(BANGKOK).hour
    start = hour // 4 * 4
    return f"HOUR_{start:02d}_{start + 3:02d}_BKK"


def pattern_name(value: Any) -> str:
    if isinstance(value, dict):
        return text(value.get("name"), "UNKNOWN")
    return text(value, "UNKNOWN")


def btc_trend_bucket(record: dict[str, Any]) -> str:
    phase = text(record.get("btcPhase"), "")
    if phase:
        return phase
    direction = text(record.get("btcTrendDir"), "FLAT")
    score = number(record.get("btcTrendScore"), 0) or 0
    strength = "STRONG" if score >= 65 else "MID" if score >= 45 else "WEAK"
    return f"BTC_{direction}_{strength}"


def numeric_bucket(value: Any, thresholds: list[tuple[float, str]], fallback: str) -> str:
    parsed = number(value)
    if parsed is None:
        return fallback
    for threshold, label in thresholds:
        if parsed >= threshold:
            return label
    return thresholds[-1][1] if thresholds else fallback


def observation_features(record: dict[str, Any]) -> dict[str, str]:
    snapshot = record.get("shakeoutObservationSnapshot")
    snapshot = snapshot if isinstance(snapshot, dict) else {}
    factors = record.get("shakeoutSignalFactors")
    if not isinstance(factors, dict):
        factors = record.get("factors")
    if not isinstance(factors, dict):
        factors = snapshot.get("factors")
    factors = factors if isinstance(factors, dict) else {}
    buckets = record.get("shakeoutObservationBuckets")
    buckets = buckets if isinstance(buckets, dict) else {}
    raw_count = sum(
        1 for key in (
            "move5mPct", "move15mPct", "drop5mPct", "retrace5mPct",
            "vol5mX", "vol15mX", "emaZoneDistPct", "reclaimPct",
            "pullbackAge5m", "wickRejectPct", "rsi5m", "rsi15m",
        )
        if number(factors.get(key)) is not None
    )
    coverage = text(record.get("shakeoutObservationCoverage"), "")
    if not coverage:
        context_count = sum([
            1 if number(record.get("btcCorr") or snapshot.get("btcCorr")) is not None else 0,
            1 if pattern_name(record.get("candlePatternAtEntry") or record.get("candlePattern5m")) != "UNKNOWN" else 0,
            1 if pattern_name(record.get("btcCandlePatternAtEntry") or record.get("btcCandlePattern5m")) != "UNKNOWN" else 0,
            1 if text(record.get("btcPhase") or snapshot.get("btcPhase"), "") else 0,
        ])
        coverage = "FULL" if raw_count >= 10 and context_count >= 3 else "PARTIAL" if raw_count >= 5 else "LEGACY"
    score = record.get("score") if record.get("score") is not None else snapshot.get("score")
    quote_volume = (
        record.get("shakeoutSignalQuoteVolume")
        if record.get("shakeoutSignalQuoteVolume") is not None
        else snapshot.get("quoteVolume")
    )
    entry_distance = (
        record.get("entryDistancePct")
        if record.get("entryDistancePct") is not None
        else snapshot.get("entryDistancePct")
    )
    rr = (
        record.get("shakeoutObservationRr")
        if record.get("shakeoutObservationRr") is not None
        else snapshot.get("rr")
    )
    return {
        "coverage": coverage,
        "setup": text(
            record.get("shakeoutClass")
            or record.get("subtype")
            or record.get("signalType")
            or snapshot.get("setup"),
            "SETUP_NO_DATA",
        ),
        "stage": text(record.get("stage") or snapshot.get("stage"), "STAGE_NO_DATA"),
        "entryMode": text(
            record.get("shakeoutEntryMode") or record.get("entryMode") or snapshot.get("entryMode"),
            "ENTRY_MODE_NO_DATA",
        ),
        "score": buckets.get("score") or numeric_bucket(
            score,
            [(85, "SCORE_85_PLUS"), (75, "SCORE_75_84"), (65, "SCORE_65_74"), (55, "SCORE_55_64"), (-math.inf, "SCORE_LT_55")],
            "SCORE_NO_DATA",
        ),
        "move5m": buckets.get("move5m") or numeric_bucket(
            factors.get("move5mPct"),
            [(30, "MOVE_30_PLUS"), (20, "MOVE_20_30"), (12, "MOVE_12_20"), (-math.inf, "MOVE_LT_12")],
            "MOVE_NO_DATA",
        ),
        "volume5m": buckets.get("volume5m") or numeric_bucket(
            factors.get("vol5mX"),
            [(5, "VOL_5X_PLUS"), (3, "VOL_3_5X"), (1.7, "VOL_1_7_3X"), (-math.inf, "VOL_LT_1_7X")],
            "VOL_NO_DATA",
        ),
        "reclaim": buckets.get("reclaim") or numeric_bucket(
            factors.get("reclaimPct"),
            [(7, "RECLAIM_7_PLUS"), (4.5, "RECLAIM_4_5_7"), (2.5, "RECLAIM_2_5_4_5"), (-math.inf, "RECLAIM_LT_2_5")],
            "RECLAIM_NO_DATA",
        ),
        "wick": buckets.get("wick") or numeric_bucket(
            factors.get("wickRejectPct"),
            [(55, "WICK_55_PLUS"), (35, "WICK_35_55"), (-math.inf, "WICK_LT_35")],
            "WICK_NO_DATA",
        ),
        "pullbackAge": buckets.get("pullbackAge") or numeric_bucket(
            -(number(factors.get("pullbackAge5m")) or 0),
            [(-3, "AGE_0_3"), (-6, "AGE_4_6"), (-10, "AGE_7_10"), (-math.inf, "AGE_11_PLUS")],
            "AGE_NO_DATA",
        ) if number(factors.get("pullbackAge5m")) is not None else "AGE_NO_DATA",
        "entryDistance": buckets.get("entryDistance") or numeric_bucket(
            -(abs(number(entry_distance) or 0)),
            [(-1, "ENTRY_DIST_0_1"), (-3, "ENTRY_DIST_1_3"), (-5, "ENTRY_DIST_3_5"), (-math.inf, "ENTRY_DIST_5_PLUS")],
            "ENTRY_DIST_NO_DATA",
        ) if number(entry_distance) is not None else "ENTRY_DIST_NO_DATA",
        "rr": buckets.get("rr") or numeric_bucket(
            rr,
            [(2, "RR_2_PLUS"), (1, "RR_1_2"), (0.5, "RR_0_5_1"), (-math.inf, "RR_LT_0_5")],
            "RR_NO_DATA",
        ),
        "liquidity": buckets.get("liquidity") or numeric_bucket(
            quote_volume,
            [(100_000_000, "LIQ_100M_PLUS"), (20_000_000, "LIQ_20_100M"), (5_000_000, "LIQ_5_20M"), (-math.inf, "LIQ_LT_5M")],
            "LIQ_NO_DATA",
        ),
    }


def record_features(record: dict[str, Any]) -> dict[str, str]:
    relation_obj = record.get("btcRelation") if isinstance(record.get("btcRelation"), dict) else {}
    factors = record.get("factors") if isinstance(record.get("factors"), dict) else {}
    observation = observation_features(record)
    side = text(record.get("side") or record.get("action"), "SIDE_UNKNOWN")
    timeframe = text(record.get("signalTimeframe") or record.get("interval") or factors.get("timeframe"), "TF_UNKNOWN")
    relation = text(record.get("btcRelationLabel"), "")
    if not relation:
        corr = number(record.get("btcCorr") or relation_obj.get("corr"))
        relation = "BTC_CORR_RAC" if corr is not None and abs(corr) < 0.3 else "BTC_CORR_THEO" if corr is not None else "REL_NO_DATA"
    return {
        "side": side,
        "timeframe": timeframe,
        "variant": text(record.get("variant"), "VARIANT_UNKNOWN"),
        "highJumpRisk": "HIGH_JUMP" if record.get("highJumpRisk") else "JUMP_OK",
        "pattern5m": pattern_name(record.get("candlePattern5m")),
        "pattern15m": pattern_name(record.get("candlePattern15m")),
        "btcPattern5m": pattern_name(record.get("btcCandlePattern5m")),
        "btcTrend": btc_trend_bucket(record),
        "relation": relation,
        "session": hour_bucket(record),
        **observation,
    }


def group_candidates(features: dict[str, str]) -> list[tuple[str, str, int]]:
    f = features
    observation_groups = [] if f["coverage"] != "FULL" else [
        ("OBS_STRUCTURE", "|".join([f["setup"], f["side"], f["stage"], f["score"], f["move5m"], f["volume5m"], f["reclaim"]]), 9),
        ("OBS_EXECUTION", "|".join([f["setup"], f["side"], f["variant"], f["entryMode"], f["entryDistance"], f["rr"], f["btcTrend"], f["relation"]]), 8),
        ("OBS_FLOW_CANDLE", "|".join([f["side"], f["volume5m"], f["reclaim"], f["wick"], f["pullbackAge"], f["pattern5m"], f["btcPattern5m"], f["btcTrend"], f["liquidity"]]), 7),
    ]
    return observation_groups + [
        ("CANDLE_BTC_PAIR", "|".join([f["pattern5m"], f["pattern15m"], f["side"], f["timeframe"], f["variant"], f["btcTrend"], f["btcPattern5m"], f["relation"], f["highJumpRisk"]]), 6),
        ("CANDLE_BTC", "|".join([f["pattern5m"], f["side"], f["variant"], f["btcTrend"], f["btcPattern5m"]]), 5),
        ("CANDLE_TREND", "|".join([f["pattern5m"], f["side"], f["variant"], f["btcTrend"]]), 4),
        ("CANDLE_SESSION", "|".join([f["pattern5m"], f["side"], f["variant"], f["session"]]), 3),
        ("CANDLE_VARIANT", "|".join([f["pattern5m"], f["side"], f["variant"]]), 2),
        ("CANDLE_SIDE_VARIANT", "|".join([f["side"], f["variant"]]), 1),
    ]


def has_candle_data(record: dict[str, Any]) -> bool:
    features = record_features(record)
    return features["pattern5m"] not in {"UNKNOWN", "NO_DATA"}


def legacy_features(record: dict[str, Any]) -> dict[str, str]:
    """Features available in old logs, independent from old quality labels/scores."""
    base = record_features(record)
    return {
        "side": base["side"],
        "timeframe": base["timeframe"],
        "signalType": text(record.get("signalType") or record.get("type") or record.get("subtype"), "TYPE_UNKNOWN"),
        "variant": text(record.get("variant"), "VARIANT_UNKNOWN"),
        "trapRisk": text(record.get("trapRisk"), "TRAP_UNKNOWN"),
        "bottomRebound": "BOTTOM_REBOUND" if record.get("bottomRebound") else "NORMAL_SETUP",
        "btcTrend": base["btcTrend"],
        "relation": base["relation"],
        "session": base["session"],
    }


def legacy_group_candidates(features: dict[str, str]) -> list[tuple[str, str, int]]:
    f = features
    return [
        ("LEGACY_EXACT", "|".join([f["signalType"], f["side"], f["timeframe"], f["variant"], f["trapRisk"], f["btcTrend"], f["relation"]]), 6),
        ("LEGACY_SETUP_BTC", "|".join([f["signalType"], f["side"], f["variant"], f["btcTrend"], f["relation"]]), 5),
        ("LEGACY_SETUP_TRAP", "|".join([f["signalType"], f["side"], f["variant"], f["trapRisk"], f["bottomRebound"]]), 4),
        ("LEGACY_SETUP_SESSION", "|".join([f["signalType"], f["side"], f["variant"], f["session"]]), 3),
        ("LEGACY_SETUP", "|".join([f["signalType"], f["side"], f["variant"]]), 2),
        ("LEGACY_SIDE", "|".join([f["signalType"], f["side"]]), 1),
    ]


def training_row(record: dict[str, Any]) -> dict[str, float] | None:
    if text(record.get("status"), "") != "CLOSED" or text(record.get("outcome"), "") == "INVALID":
        return None
    pnl = number(record.get("netPnl"))
    if pnl is None:
        pnl = number(record.get("pnl"))
    roe = number(record.get("netRoe"))
    if roe is None:
        roe = number(record.get("roe"))
    if pnl is None or roe is None:
        return None
    outcome = text(record.get("outcome"), "")
    close_reason = text(record.get("closeReason"), "")
    sl_loss = pnl < 0 and (outcome == "SL" or "SL" in outcome or "SL" in close_reason)
    return {"pnl": pnl, "roe": roe, "win": 1.0 if pnl > 0 else 0.0, "slLoss": 1.0 if sl_loss else 0.0}


def empty_agg() -> dict[str, float]:
    return {
        "closed": 0,
        "wins": 0,
        "slLosses": 0,
        "pnl": 0.0,
        "roe": 0.0,
        "grossWin": 0.0,
        "grossLoss": 0.0,
    }


def add_agg(agg: dict[str, float], row: dict[str, float]) -> None:
    agg["closed"] += 1
    agg["wins"] += row["win"]
    agg["slLosses"] += row.get("slLoss", 0.0)
    agg["pnl"] += row["pnl"]
    agg["roe"] += row["roe"]
    if row["pnl"] > 0:
        agg["grossWin"] += row["pnl"]
    elif row["pnl"] < 0:
        agg["grossLoss"] += abs(row["pnl"])


def learned_metrics(agg: dict[str, float], prior_wr: float, prior_weight: float = 8.0) -> dict[str, float]:
    closed = int(agg["closed"])
    wins = int(agg["wins"])
    wr = wins / closed * 100 if closed else 0.0
    adjusted_wr = (wins + prior_wr / 100 * prior_weight) / (closed + prior_weight) * 100 if closed else prior_wr
    avg_roe = agg["roe"] / closed if closed else 0.0
    avg_pnl = agg["pnl"] / closed if closed else 0.0
    if agg["grossLoss"] > 0:
        profit_factor = agg["grossWin"] / agg["grossLoss"]
    elif agg["grossWin"] > 0:
        profit_factor = 9.99
    else:
        profit_factor = 0.0
    return {
        "closed": closed,
        "wins": wins,
        "losses": closed - wins,
        "winRate": round(wr, 2),
        "adjustedWinRate": round(adjusted_wr, 2),
        "avgNetRoe": round(avg_roe, 3),
        "avgNetPnl": round(avg_pnl, 4),
        "netPnl": round(agg["pnl"], 4),
        "profitFactor": round(min(profit_factor, 9.99), 3),
        "slLosses": int(agg.get("slLosses", 0)),
        "slLossRate": round((agg.get("slLosses", 0) / closed * 100) if closed else 0.0, 2),
    }


def wilson_lower_bound(wins: int, total: int, z: float = 1.96) -> float:
    """95% Wilson lower bound for a binomial win rate, returned as percent."""
    if total <= 0:
        return 0.0
    p = wins / total
    denominator = 1 + z * z / total
    centre = p + z * z / (2 * total)
    margin = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)
    return max(0.0, (centre - margin) / denominator * 100)


def legacy_verified_flag(
    total_metrics: dict[str, float],
    oos_metrics: dict[str, float],
    min_total: int,
    min_oos: int,
) -> dict[str, Any]:
    """Strict OLD label based only on causal walk-forward (out-of-sample) outcomes."""
    total = int(total_metrics.get("closed", 0))
    oos = int(oos_metrics.get("closed", 0))
    wins = int(oos_metrics.get("wins", 0))
    wilson = wilson_lower_bound(wins, oos)
    adjusted_wr = float(oos_metrics.get("adjustedWinRate", 0))
    avg_roe = float(oos_metrics.get("avgNetRoe", 0))
    pf = float(oos_metrics.get("profitFactor", 0))
    sl_rate = float(oos_metrics.get("slLossRate", 0))
    confidence = round(min(100.0, (
        min(1.0, oos / max(1, min_oos * 2)) * 30
        + min(1.0, wilson / 60) * 25
        + min(1.0, pf / 1.8) * 20
        + min(1.0, max(0.0, avg_roe) / 5) * 15
        + max(0.0, 1 - sl_rate / 50) * 10
    )), 1)

    enough = total >= min_total and oos >= min_oos
    verified = (
        enough
        and adjusted_wr >= 65
        and wilson >= 52
        and avg_roe >= 1.5
        and pf >= 1.30
        and sl_rate <= 25
    )
    risk = enough and (wilson < 35 or avg_roe <= -2 or pf < 0.8 or sl_rate >= 45)
    if verified:
        flag, label, tone = "PYTHON_VERIFIED_GOOD", "OLD VERIFIED GOOD", "good"
    elif risk:
        flag, label, tone = "PYTHON_RISK", "OLD RISK", "risk"
    elif total < min_total or oos < min_oos:
        flag, label, tone = "PYTHON_NO_DATA", "OLD NO OOS", "muted"
    else:
        flag, label, tone = "PYTHON_WATCH", "OLD WATCH", "watch"

    reason = (
        f"OOS n={oos}/{total}; AdjWR {adjusted_wr:.1f}%; Wilson {wilson:.1f}%; "
        f"AvgROE {avg_roe:+.1f}%; PF {pf:.2f}; SL loss {sl_rate:.1f}%; Conf {confidence:.0f}/100"
    )
    return {
        "flag": flag,
        "label": label,
        "tone": tone,
        "reason": reason,
        "confidence": confidence,
        "wilsonLower": round(wilson, 2),
        "verified": verified,
    }


def prediction_flag(metrics: dict[str, float], min_samples: int, specificity: int) -> dict[str, Any]:
    closed = int(metrics["closed"])
    adjusted_wr = metrics["adjustedWinRate"]
    avg_roe = metrics["avgNetRoe"]
    pf = metrics["profitFactor"]
    if closed < min_samples:
        flag = "PYTHON_NO_DATA"
        label = "PY NO DATA"
        tone = "muted"
    elif adjusted_wr >= 58 and avg_roe >= 1 and pf >= 1.15:
        flag = "PYTHON_GOOD"
        label = "PY GOOD"
        tone = "good"
    elif adjusted_wr <= 45 or avg_roe <= -2 or pf < 0.8:
        flag = "PYTHON_RISK"
        label = "PY RISK"
        tone = "risk"
    else:
        flag = "PYTHON_WATCH"
        label = "PY WATCH"
        tone = "watch"
    reason = f"n={closed}; AdjWR {adjusted_wr:.1f}%; AvgROE {avg_roe:+.1f}%; PF {pf:.2f}"
    return {
        "flag": flag,
        "label": label,
        "tone": tone,
        "reason": reason,
    }


def candle_context_prior(record: dict[str, Any]) -> dict[str, Any]:
    f = record_features(record)
    pattern = f["pattern5m"]
    btc_pattern = f["btcPattern5m"]
    side = f["side"]
    btc_trend = f["btcTrend"]
    variant = f["variant"]
    high_jump = f["highJumpRisk"] == "HIGH_JUMP"
    bullish = pattern.startswith("BULLISH") or pattern == "HAMMER"
    bearish = pattern.startswith("BEARISH") or pattern == "SHOOTING_STAR"
    btc_up = "UP" in btc_trend
    btc_down = "DOWN" in btc_trend
    btc_bullish = btc_pattern.startswith("BULLISH") or btc_pattern == "HAMMER"
    btc_bearish = btc_pattern.startswith("BEARISH") or btc_pattern == "SHOOTING_STAR"
    if pattern == "UNKNOWN":
        flag, label, tone, reason, prior_type = "PYTHON_NO_DATA", "PY NO DATA", "muted", "Lệnh cũ chưa lưu mẫu nến OHLC", "NO_DATA"
    elif variant == "CHASE":
        flag, label, tone, reason, prior_type = "PYTHON_RISK", "PY CHASE PRIOR", "risk", "CHASE chưa có cohort walk-forward đủ mẫu; không được suy luận GOOD từ nến thuận chiều", "CHASE"
    elif high_jump:
        flag, label, tone, reason, prior_type = "PYTHON_RISK", "PY HIGH-JUMP PRIOR", "risk", "HIGH JUMP RISK và chưa có cohort walk-forward đủ mẫu", "HIGH_JUMP"
    elif pattern == "DOJI":
        flag, label, tone, reason, prior_type = "PYTHON_WATCH", "PY PRIOR WATCH", "watch", "DOJI: prior chưa đủ mẫu, chờ cohort walk-forward", "WATCH"
    elif (side == "LONG" and bearish) or (side == "SHORT" and bullish):
        flag, label, tone, reason, prior_type = "PYTHON_RISK", "PY CANDLE CONFLICT", "risk", f"{pattern} ngược chiều {side}; prior chưa đủ mẫu", "CANDLE_CONFLICT"
    elif (side == "LONG" and btc_down and btc_bearish) or (side == "SHORT" and btc_up and btc_bullish):
        flag, label, tone, reason, prior_type = "PYTHON_RISK", "PY BTC CONFLICT", "risk", f"BTC {btc_trend}/{btc_pattern} ngược {side}; prior chưa đủ mẫu", "BTC_CONFLICT"
    elif (side == "LONG" and bullish and not btc_down) or (side == "SHORT" and bearish and not btc_up):
        flag, label, tone, reason, prior_type = "PYTHON_WATCH", "PY PRIOR WATCH", "watch", f"{pattern} thuận {side}, nhưng chưa có cohort walk-forward đủ mẫu để gọi GOOD", "WATCH"
    else:
        flag, label, tone, reason, prior_type = "PYTHON_WATCH", "PY PRIOR WATCH", "watch", f"{pattern}; BTC {btc_trend}/{btc_pattern}, prior chưa đủ mẫu", "WATCH"
    return {
        "flag": flag,
        "label": label,
        "tone": tone,
        "reason": reason,
        "priorType": prior_type,
        "groupLevel": "CANDLE_BTC_PRIOR",
        "group": "|".join([pattern, side, variant, btc_trend, btc_pattern]),
        "learned": False,
        "model": "CANDLE_WALK_FORWARD_V3_CONTEXT",
    }


def load_store(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    rows = raw if isinstance(raw, list) else raw.get("trades", [])
    return [row for row in rows if isinstance(row, dict)]


def train(trades: list[dict[str, Any]], lookback_days: int) -> tuple[dict[tuple[str, str], dict[str, float]], list[dict[str, Any]]]:
    cutoff = datetime.now(UTC) - timedelta(days=max(1, lookback_days))
    eligible: list[dict[str, Any]] = []
    groups: dict[tuple[str, str], dict[str, float]] = defaultdict(empty_agg)
    for trade in trades:
        row = training_row(trade)
        stamp = parse_time(trade.get("closedAt") or trade.get("createdAt"))
        if row is None or (stamp and stamp < cutoff):
            continue
        features = record_features(trade)
        # Candle model stays isolated: it only learns rows that actually captured
        # OHLC patterns at entry.
        if not has_candle_data(trade):
            continue
        eligible.append(trade)
        add_agg(groups[("GLOBAL", "KNOWN_CANDLES")], row)
        for level, key, _ in group_candidates(features):
            add_agg(groups[(level, key)], row)
    return groups, eligible


def train_candle_walk_forward(
    trades: list[dict[str, Any]],
    lookback_days: int,
    min_samples: int,
) -> tuple[
    dict[tuple[str, str], dict[str, float]],
    list[dict[str, Any]],
    dict[str, dict[str, Any]],
]:
    """Score every historical candle trade using outcomes known before its entry."""
    cutoff = datetime.now(UTC) - timedelta(days=max(1, lookback_days))
    eligible: list[dict[str, Any]] = []
    for trade in trades:
        stamp = parse_time(trade.get("closedAt") or trade.get("createdAt"))
        if training_row(trade) is None or (stamp and stamp < cutoff) or not has_candle_data(trade):
            continue
        eligible.append(trade)

    groups: dict[tuple[str, str], dict[str, float]] = defaultdict(empty_agg)
    historical_flags: dict[str, dict[str, Any]] = {}
    trade_by_id = {str(row.get("id")): row for row in eligible if row.get("id")}
    events: list[tuple[datetime, int, str, str]] = []
    for trade_id, trade in trade_by_id.items():
        opened = parse_time(trade.get("openedAt") or trade.get("createdAt") or trade.get("closedAt"))
        closed = parse_time(trade.get("closedAt") or trade.get("createdAt"))
        if opened:
            # OPEN is deliberately processed before CLOSE at an identical
            # timestamp, so a trade can never learn from its own outcome.
            events.append((opened, 0, "OPEN", trade_id))
        if closed:
            events.append((closed, 1, "CLOSE", trade_id))
    events.sort(key=lambda event: (event[0], event[1], event[3]))

    learned_execution_keys: set[tuple[str, str]] = set()
    for _, _, event_type, trade_id in events:
        trade = trade_by_id[trade_id]
        if event_type == "OPEN":
            global_agg = groups.get(("GLOBAL", "KNOWN_CANDLES"), empty_agg())
            global_metrics = learned_metrics(global_agg, 50.0, prior_weight=0)
            prior_wr = global_metrics["winRate"] if global_metrics["closed"] else 50.0
            historical_flags[trade_id] = score_record(trade, groups, prior_wr, min_samples)
            historical_flags[trade_id]["scoredCausally"] = True
            continue

        row = training_row(trade)
        if row is None:
            continue
        execution_key = (
            str(trade.get("signalId") or trade_id),
            text(trade.get("variant"), "VARIANT_UNKNOWN"),
        )
        if execution_key in learned_execution_keys:
            continue
        learned_execution_keys.add(execution_key)
        add_agg(groups[("GLOBAL", "KNOWN_CANDLES")], row)
        for level, key, _ in group_candidates(record_features(trade)):
            add_agg(groups[(level, key)], row)

    return groups, eligible, historical_flags


def train_legacy(trades: list[dict[str, Any]], lookback_days: int) -> tuple[dict[tuple[str, str], dict[str, float]], list[dict[str, Any]]]:
    """Learn only old no-candle rows using neutral raw context fields."""
    cutoff = datetime.now(UTC) - timedelta(days=max(1, lookback_days))
    eligible: list[dict[str, Any]] = []
    groups: dict[tuple[str, str], dict[str, float]] = defaultdict(empty_agg)
    for trade in trades:
        row = training_row(trade)
        stamp = parse_time(trade.get("closedAt") or trade.get("createdAt"))
        if row is None or (stamp and stamp < cutoff) or has_candle_data(trade):
            continue
        eligible.append(trade)
        add_agg(groups[("GLOBAL", "LEGACY_NO_CANDLE")], row)
        for level, key, _ in legacy_group_candidates(legacy_features(trade)):
            add_agg(groups[(level, key)], row)
    return groups, eligible


def score_legacy_verified_record(
    record: dict[str, Any],
    total_groups: dict[tuple[str, str], dict[str, float]],
    oos_groups: dict[tuple[str, str], dict[str, float]],
    prior_wr: float,
    min_total: int,
    min_oos: int,
) -> dict[str, Any]:
    candidates = legacy_group_candidates(legacy_features(record))
    available: list[tuple[int, int, int, str, str, dict[str, float], dict[str, float]]] = []
    for level, key, specificity in candidates:
        total_agg = total_groups.get((level, key))
        if not total_agg or not total_agg["closed"]:
            continue
        oos_agg = oos_groups.get((level, key), empty_agg())
        qualified = int(total_agg["closed"] >= min_total and oos_agg["closed"] >= min_oos)
        available.append((qualified, specificity, int(total_agg["closed"]), level, key, total_agg, oos_agg))
    if not available:
        return {
            "flag": "PYTHON_NO_DATA",
            "label": "OLD NO OOS",
            "tone": "muted",
            "reason": "Chưa có cohort walk-forward trong dữ liệu cũ",
            "groupLevel": "LEGACY_NONE",
            "group": "-",
            "learned": False,
            "verified": False,
            "model": "LEGACY_WALK_FORWARD_V2",
        }
    available.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
    _, _, _, level, key, total_agg, oos_agg = available[0]
    total_metrics = learned_metrics(total_agg, prior_wr)
    oos_metrics = learned_metrics(oos_agg, prior_wr)
    result = legacy_verified_flag(total_metrics, oos_metrics, min_total, min_oos)
    result.update({
        "groupLevel": level,
        "group": key,
        "metrics": oos_metrics,
        "totalMetrics": total_metrics,
        "oosMetrics": oos_metrics,
        "learned": total_agg["closed"] >= min_total and oos_agg["closed"] >= min_oos,
        "model": "LEGACY_WALK_FORWARD_V2",
    })
    return result


def train_legacy_walk_forward(
    trades: list[dict[str, Any]],
    lookback_days: int,
    seed_samples: int,
    min_total: int,
    min_oos: int,
) -> tuple[
    dict[tuple[str, str], dict[str, float]],
    dict[tuple[str, str], dict[str, float]],
    list[dict[str, Any]],
    dict[str, dict[str, Any]],
]:
    """Create causal OOS cohort results; every outcome is predicted from earlier closes only."""
    cutoff = datetime.now(UTC) - timedelta(days=max(1, lookback_days))
    eligible: list[dict[str, Any]] = []
    for trade in trades:
        stamp = parse_time(trade.get("closedAt") or trade.get("createdAt"))
        if training_row(trade) is None or (stamp and stamp < cutoff) or has_candle_data(trade):
            continue
        eligible.append(trade)
    total_groups: dict[tuple[str, str], dict[str, float]] = defaultdict(empty_agg)
    oos_groups: dict[tuple[str, str], dict[str, float]] = defaultdict(empty_agg)
    historical_flags: dict[str, dict[str, Any]] = {}
    oos_eligible_keys: dict[str, set[tuple[str, str]]] = {}
    trade_by_id = {str(row.get("id")): row for row in eligible if row.get("id")}
    events: list[tuple[datetime, int, str, str]] = []
    for trade_id, trade in trade_by_id.items():
        opened = parse_time(trade.get("openedAt") or trade.get("createdAt") or trade.get("closedAt"))
        closed = parse_time(trade.get("closedAt") or trade.get("createdAt"))
        if opened:
            events.append((opened, 1, "OPEN", trade_id))
        if closed:
            # A close at the same timestamp is learned before a different trade
            # opens, while the same trade still had its earlier OPEN event.
            events.append((closed, 0, "CLOSE", trade_id))
    events.sort(key=lambda event: (event[0], event[1], event[3]))

    for _, _, event_type, trade_id in events:
        trade = trade_by_id[trade_id]
        candidates = legacy_group_candidates(legacy_features(trade))
        if event_type == "OPEN":
            historical_flags[trade_id] = score_legacy_verified_record(
                trade, total_groups, oos_groups, 50.0, min_total, min_oos
            )
            eligible_keys = {
                (level, key)
                for level, key, _ in candidates
                if total_groups[(level, key)]["closed"] >= seed_samples
            }
            if total_groups[("GLOBAL", "LEGACY_NO_CANDLE")]["closed"] >= seed_samples:
                eligible_keys.add(("GLOBAL", "LEGACY_NO_CANDLE"))
            oos_eligible_keys[trade_id] = eligible_keys
            continue

        row = training_row(trade)
        if row is None:
            continue
        for level, key, _ in candidates:
            if (level, key) in oos_eligible_keys.get(trade_id, set()):
                add_agg(oos_groups[(level, key)], row)
            add_agg(total_groups[(level, key)], row)
        if ("GLOBAL", "LEGACY_NO_CANDLE") in oos_eligible_keys.get(trade_id, set()):
            add_agg(oos_groups[("GLOBAL", "LEGACY_NO_CANDLE")], row)
        add_agg(total_groups[("GLOBAL", "LEGACY_NO_CANDLE")], row)
    return total_groups, oos_groups, eligible, historical_flags


def score_record(record: dict[str, Any], groups: dict[tuple[str, str], dict[str, float]], prior_wr: float, min_samples: int) -> dict[str, Any]:
    features = record_features(record)
    candidates = group_candidates(features)
    available: list[tuple[int, int, str, str, dict[str, float]]] = []
    for level, key, specificity in candidates:
        agg = groups.get((level, key))
        if agg and agg["closed"]:
            available.append((int(agg["closed"] >= min_samples), specificity, level, key, agg))
    if not available:
        return candle_context_prior(record)
    available.sort(key=lambda item: (item[0], item[1], item[4]["closed"]), reverse=True)
    _, specificity, level, key, agg = available[0]
    if agg["closed"] < min_samples:
        prior = candle_context_prior(record)
        prior["reason"] += f"; cohort mới n={int(agg['closed'])}/{min_samples}"
        prior["candidateGroup"] = key
        return prior
    metrics = learned_metrics(agg, prior_wr)
    result = prediction_flag(metrics, min_samples, specificity)
    if result["flag"] == "PYTHON_GOOD" and features["variant"] == "CHASE":
        result.update({
            "flag": "PYTHON_WATCH",
            "label": "PY CHASE WATCH",
            "tone": "watch",
            "reason": f"{result['reason']}; CHASE không được nâng GOOD sau kết quả thực tế âm",
        })
    if result["flag"] == "PYTHON_GOOD" and features["highJumpRisk"] == "HIGH_JUMP":
        result.update({
            "flag": "PYTHON_WATCH",
            "label": "PY HIGH-JUMP WATCH",
            "tone": "watch",
            "reason": f"{result['reason']}; HIGH JUMP RISK không được nâng GOOD",
        })
    result.update({
        "groupLevel": level,
        "group": key,
        "metrics": metrics,
        "learned": True,
        "model": "CANDLE_WALK_FORWARD_V3_CONTEXT",
    })
    return result


def score_legacy_record(record: dict[str, Any], groups: dict[tuple[str, str], dict[str, float]], prior_wr: float, min_samples: int) -> dict[str, Any]:
    candidates = legacy_group_candidates(legacy_features(record))
    available: list[tuple[int, int, str, str, dict[str, float]]] = []
    for level, key, specificity in candidates:
        agg = groups.get((level, key))
        if agg and agg["closed"]:
            available.append((int(agg["closed"] >= min_samples), specificity, level, key, agg))
    if not available:
        return {
            "flag": "PYTHON_NO_DATA",
            "label": "OLD NO DATA",
            "tone": "muted",
            "reason": "Không có cohort dữ liệu cũ phù hợp",
            "groupLevel": "LEGACY_NONE",
            "group": "-",
            "learned": False,
            "model": "LEGACY_NO_CANDLE",
        }
    available.sort(key=lambda item: (item[0], item[1], item[4]["closed"]), reverse=True)
    _, specificity, level, key, agg = available[0]
    metrics = learned_metrics(agg, prior_wr)
    result = prediction_flag(metrics, min_samples, specificity)
    result["label"] = result["label"].replace("PY ", "OLD ")
    result.update({
        "groupLevel": level,
        "group": key,
        "metrics": metrics,
        "learned": agg["closed"] >= min_samples,
        "model": "LEGACY_NO_CANDLE",
    })
    if agg["closed"] < min_samples:
        result.update({
            "flag": "PYTHON_NO_DATA",
            "label": "OLD NO DATA",
            "tone": "muted",
            "reason": f"cohort dữ liệu cũ n={int(agg['closed'])}/{min_samples}",
        })
    return result


def summarize_groups(groups: dict[tuple[str, str], dict[str, float]], prior_wr: float, min_samples: int, legacy: bool = False) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    learned: list[dict[str, Any]] = []
    for (level, key), agg in groups.items():
        if level == "GLOBAL" or agg["closed"] < min_samples:
            continue
        metrics = learned_metrics(agg, prior_wr)
        flag = prediction_flag(metrics, min_samples, 3)
        if legacy:
            flag["label"] = flag["label"].replace("PY ", "OLD ")
        learned.append({"level": level, "group": key, **flag, **metrics})
    good = sorted(
        (g for g in learned if g["flag"] == "PYTHON_GOOD"),
        key=lambda g: (g["adjustedWinRate"], g["avgNetRoe"], g["closed"]),
        reverse=True,
    )[:12]
    risk = sorted(
        (g for g in learned if g["flag"] == "PYTHON_RISK"),
        key=lambda g: (g["adjustedWinRate"], g["avgNetRoe"], -g["closed"]),
    )[:12]
    return good, risk, len(learned)


def summarize_legacy_verified_groups(
    total_groups: dict[tuple[str, str], dict[str, float]],
    oos_groups: dict[tuple[str, str], dict[str, float]],
    prior_wr: float,
    min_total: int,
    min_oos: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    learned: list[dict[str, Any]] = []
    for (level, key), total_agg in total_groups.items():
        if level == "GLOBAL":
            continue
        total_metrics = learned_metrics(total_agg, prior_wr)
        oos_metrics = learned_metrics(oos_groups.get((level, key), empty_agg()), prior_wr)
        flag = legacy_verified_flag(total_metrics, oos_metrics, min_total, min_oos)
        if int(oos_metrics["closed"]) < min_oos:
            continue
        learned.append({
            "level": level,
            "group": key,
            **flag,
            **oos_metrics,
            "totalClosed": total_metrics["closed"],
            "oosClosed": oos_metrics["closed"],
        })
    good = sorted(
        (g for g in learned if g["flag"] == "PYTHON_VERIFIED_GOOD"),
        key=lambda g: (g["confidence"], g["wilsonLower"], g["oosClosed"]),
        reverse=True,
    )[:12]
    risk = sorted(
        (g for g in learned if g["flag"] == "PYTHON_RISK"),
        key=lambda g: (g["wilsonLower"], g["avgNetRoe"], -g["oosClosed"]),
    )[:12]
    return good, risk, len(learned)


def main() -> None:
    parser = argparse.ArgumentParser(description="Read-only Shakeout paper self-learning analysis")
    parser.add_argument("--paper-file", required=True)
    parser.add_argument("--signals-json", default="[]")
    parser.add_argument("--lookback-days", type=int, default=30)
    parser.add_argument("--min-samples", type=int, default=8)
    parser.add_argument("--legacy-min-total", type=int, default=30)
    parser.add_argument("--legacy-min-oos", type=int, default=12)
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    trades = load_store(Path(args.paper_file))
    signals_raw = json.loads(args.signals_json or "[]")
    signals = [row for row in signals_raw if isinstance(row, dict)] if isinstance(signals_raw, list) else []
    candle_groups, candle_training_rows, candle_historical_flags = train_candle_walk_forward(
        trades, args.lookback_days, args.min_samples
    )
    candle_global_agg = candle_groups.get(("GLOBAL", "KNOWN_CANDLES"), empty_agg())
    candle_global = learned_metrics(candle_global_agg, 50.0, prior_weight=0)
    candle_prior_wr = candle_global["winRate"] if candle_global["closed"] else 50.0
    legacy_groups, legacy_oos_groups, legacy_training_rows, legacy_trade_flags = train_legacy_walk_forward(
        trades,
        args.lookback_days,
        args.min_samples,
        max(args.min_samples, args.legacy_min_total),
        max(3, args.legacy_min_oos),
    )
    legacy_global_agg = legacy_groups.get(("GLOBAL", "LEGACY_NO_CANDLE"), empty_agg())
    legacy_global = learned_metrics(legacy_global_agg, 50.0, prior_weight=0)
    legacy_prior_wr = legacy_global["winRate"] if legacy_global["closed"] else 50.0
    legacy_oos_global = learned_metrics(
        legacy_oos_groups.get(("GLOBAL", "LEGACY_NO_CANDLE"), empty_agg()),
        legacy_prior_wr,
        prior_weight=0,
    )

    candle_trade_flags: dict[str, dict[str, Any]] = {}
    for row in trades:
        row_id = str(row.get("id") or "")
        if not row_id:
            continue
        if row_id in candle_historical_flags:
            candle_trade_flags[row_id] = candle_historical_flags[row_id]
        elif training_row(row) is None:
            # OPEN/PENDING rows are live predictions and may use every outcome
            # that has already closed. They still cannot affect trading logic.
            candle_trade_flags[row_id] = score_record(row, candle_groups, candle_prior_wr, args.min_samples)
        else:
            candle_trade_flags[row_id] = {
                "flag": "PYTHON_NO_DATA",
                "label": "PY NO OOS",
                "tone": "muted",
                "reason": "Ngoài cửa sổ candle walk-forward hoặc không có snapshot nến",
                "groupLevel": "CANDLE_NONE",
                "group": "-",
                "learned": False,
                "scoredCausally": False,
                "model": "CANDLE_WALK_FORWARD_V3_CONTEXT",
            }
    # Rows outside the active legacy lookback remain explicitly unscored instead
    # of receiving a label learned from their own or future outcomes.
    for row in trades:
        row_id = str(row.get("id") or "")
        if row_id and row_id not in legacy_trade_flags:
            legacy_trade_flags[row_id] = {
                "flag": "PYTHON_NO_DATA",
                "label": "OLD NO OOS",
                "tone": "muted",
                "reason": "Ngoài cửa sổ walk-forward hoặc đã có model mẫu nến riêng",
                "groupLevel": "LEGACY_NONE",
                "group": "-",
                "learned": False,
                "verified": False,
                "model": "LEGACY_WALK_FORWARD_V2",
            }
    candle_signal_flags = []
    legacy_signal_flags = []
    for signal in signals:
        identity = {
            "symbol": signal.get("symbol"),
            "side": signal.get("side") or signal.get("action"),
            "stage": signal.get("stage"),
            "signalType": signal.get("signalType") or signal.get("type"),
        }
        candle_signal_flags.append({**identity, **score_record(signal, candle_groups, candle_prior_wr, args.min_samples)})
        legacy_signal_flags.append({
            **identity,
            **score_legacy_verified_record(
                signal,
                legacy_groups,
                legacy_oos_groups,
                legacy_oos_global["winRate"] if legacy_oos_global["closed"] else legacy_prior_wr,
                max(args.min_samples, args.legacy_min_total),
                max(3, args.legacy_min_oos),
            ),
        })

    candle_good, candle_risk, candle_learned_count = summarize_groups(
        candle_groups, candle_prior_wr, args.min_samples
    )
    legacy_good, legacy_risk, legacy_learned_count = summarize_legacy_verified_groups(
        legacy_groups,
        legacy_oos_groups,
        legacy_oos_global["winRate"] if legacy_oos_global["closed"] else legacy_prior_wr,
        max(args.min_samples, args.legacy_min_total),
        max(3, args.legacy_min_oos),
    )

    output = {
        "schemaVersion": 6,
        "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "mode": "ANALYSIS_ONLY",
        "guardrail": {
            "canAffectTrading": False,
            "writesPaperStore": False,
            "message": "Python flag chỉ để phân tích; không tham gia entry, gate, margin, SL hoặc TP.",
        },
        "training": {
            "lookbackDays": args.lookback_days,
            "minSamples": args.min_samples,
            "legacyMinTotal": max(args.min_samples, args.legacy_min_total),
            "legacyMinOos": max(3, args.legacy_min_oos),
            "totalPaperRows": len(trades),
            "closedSamples": len(candle_training_rows) + len(legacy_training_rows),
            "global": candle_global,
            "learnedGroups": candle_learned_count + legacy_learned_count,
            "candle": {
                "closedSamples": len(candle_training_rows),
                "global": candle_global,
                "learnedGroups": candle_learned_count,
                "method": "CAUSAL_WALK_FORWARD",
                "model": "CANDLE_WALK_FORWARD_V3_CONTEXT",
            },
            "legacy": {
                "closedSamples": len(legacy_training_rows),
                "global": legacy_global,
                "oosGlobal": legacy_oos_global,
                "learnedGroups": legacy_learned_count,
                "method": "CAUSAL_WALK_FORWARD",
            },
        },
        "summary": {
            "signalGood": sum(1 for x in candle_signal_flags if x["flag"] == "PYTHON_GOOD"),
            "signalWatch": sum(1 for x in candle_signal_flags if x["flag"] == "PYTHON_WATCH"),
            "signalRisk": sum(1 for x in candle_signal_flags if x["flag"] == "PYTHON_RISK"),
            "signalNoData": sum(1 for x in candle_signal_flags if x["flag"] == "PYTHON_NO_DATA"),
            "signalLearnedGood": sum(1 for x in candle_signal_flags if x["flag"] == "PYTHON_GOOD" and x.get("learned")),
            "signalPriorWatch": sum(1 for x in candle_signal_flags if x.get("label") == "PY PRIOR WATCH"),
            "signalPriorRisk": sum(1 for x in candle_signal_flags if x.get("priorType") in {"CHASE", "HIGH_JUMP", "CANDLE_CONFLICT", "BTC_CONFLICT"}),
            "signalChasePrior": sum(1 for x in candle_signal_flags if x.get("priorType") == "CHASE"),
            "signalHighJumpPrior": sum(1 for x in candle_signal_flags if x.get("priorType") == "HIGH_JUMP"),
            "signalCandleConflict": sum(1 for x in candle_signal_flags if x.get("priorType") == "CANDLE_CONFLICT"),
            "signalBtcConflict": sum(1 for x in candle_signal_flags if x.get("priorType") == "BTC_CONFLICT"),
            "legacyGood": sum(1 for x in legacy_signal_flags if x["flag"] == "PYTHON_VERIFIED_GOOD"),
            "legacyWatch": sum(1 for x in legacy_signal_flags if x["flag"] == "PYTHON_WATCH"),
            "legacyRisk": sum(1 for x in legacy_signal_flags if x["flag"] == "PYTHON_RISK"),
            "legacyNoData": sum(1 for x in legacy_signal_flags if x["flag"] == "PYTHON_NO_DATA"),
        },
        "signalFlags": candle_signal_flags,
        "tradeFlags": candle_trade_flags,
        "legacySignalFlags": legacy_signal_flags,
        "legacyTradeFlags": legacy_trade_flags,
        "topGoodGroups": candle_good,
        "topRiskGroups": candle_risk,
        "legacyTopGoodGroups": legacy_good,
        "legacyTopRiskGroups": legacy_risk,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2 if args.pretty else None))


if __name__ == "__main__":
    main()
