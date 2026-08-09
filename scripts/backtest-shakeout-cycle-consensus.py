#!/usr/bin/env python3
"""Walk-forward backtest for a broad Shakeout cycle-consensus label.

This script is read-only. It does not import or change runtime order rules.
Every target day is scored only with trades closed before that UTC day starts.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import median
from typing import Any, Callable


UTC = timezone.utc
EPISODE_MINUTES = 15
HORIZONS = (3, 7, 14)
DATA_START = "2026-07-14"
CALIBRATION_DAYS = tuple(f"2026-07-{day:02d}" for day in range(17, 24))
VALIDATION_DAYS = ("2026-07-24", "2026-07-25", "2026-07-26")
FULL_EVALUATION_DAYS = tuple(
    f"2026-07-{day:02d}" for day in range(14, 27)
)


def text(value: Any, fallback: str = "UNKNOWN") -> str:
    result = str(value if value is not None else "").strip().upper()
    return result or fallback


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


def pattern_name(value: Any) -> str:
    if isinstance(value, dict):
        return text(value.get("name"))
    return text(value)


def pnl_of(row: dict[str, Any]) -> float | None:
    return number(row.get("netPnl"), number(row.get("pnl")))


def roe_of(row: dict[str, Any]) -> float | None:
    return number(row.get("netRoe"), number(row.get("roe")))


def setup_of(row: dict[str, Any]) -> str:
    return text(
        row.get("shakeoutClass")
        or row.get("subtype")
        or row.get("signalType"),
        "SETUP_NO_DATA",
    )


def btc_phase_of(row: dict[str, Any]) -> str:
    return text(
        row.get("btcPhase")
        or row.get("btcMarketRegimeAtEntry")
        or row.get("btcMarketRegimeAtSignal")
        or row.get("btcTrendDirAtEntry")
        or row.get("btcTrendDir"),
        "BTC_NO_DATA",
    )


def btc_relation_of(row: dict[str, Any]) -> str:
    stored = text(row.get("btcRelationLabel"), "")
    if stored:
        return stored
    buckets = row.get("shakeoutObservationBuckets")
    if isinstance(buckets, dict) and buckets.get("btcCorr"):
        return text(buckets.get("btcCorr"))
    corr = number(row.get("btcCorr"))
    if corr is None:
        return "REL_NO_DATA"
    if abs(corr) < 0.3:
        return "BTC_CORR_RAC"
    if abs(corr) < 0.5:
        return "BTC_CORR_YEU"
    return "BTC_CORR_THEO"


def btc_alignment(row: dict[str, Any]) -> str:
    side = text(row.get("side"), "SIDE_NO_DATA")
    relation = btc_relation_of(row)
    if "RAC" in relation or "INDEPENDENT" in relation or "DOC_LAP" in relation:
        return "BTC_INDEPENDENT"
    phase = btc_phase_of(row)
    has_up = "UP" in phase and "DOWN" not in phase
    has_down = "DOWN" in phase
    if (side == "LONG" and has_up) or (side == "SHORT" and has_down):
        return "BTC_ALIGNED"
    if (side == "LONG" and has_down) or (side == "SHORT" and has_up):
        return "BTC_COUNTER"
    return "BTC_NEUTRAL"


def fill_quality(row: dict[str, Any]) -> str:
    stored = text(row.get("shakeoutStage2FillQuality"), "")
    if stored and stored != "NO_FILL_DATA":
        return stored
    variant = text(row.get("variant"), "NO_VARIANT")
    if variant != "PENDING":
        return variant
    opened = parse_time(row.get("openedAt"))
    created = parse_time(row.get("createdAt") or row.get("signalAt"))
    if not opened or not created:
        return "PENDING_WAIT"
    delay = max(0, (opened - created).total_seconds() / 60)
    if delay <= 15:
        return "PENDING_FAST"
    if delay <= 45:
        return "PENDING_NORMAL"
    return "PENDING_LATE"


def candle_relation(row: dict[str, Any]) -> str:
    side = text(row.get("side"), "SIDE_NO_DATA")
    pattern = pattern_name(
        row.get("candlePatternAtEntry")
        or row.get("candlePattern5m")
        or row.get("symbolCandleAtEntry")
    )
    bullish = pattern.startswith("BULLISH") or pattern == "HAMMER"
    bearish = pattern.startswith("BEARISH") or pattern == "SHOOTING_STAR"
    if (side == "LONG" and bullish) or (side == "SHORT" and bearish):
        return "CANDLE_ALIGNED"
    if (side == "LONG" and bearish) or (side == "SHORT" and bullish):
        return "CANDLE_COUNTER"
    return "CANDLE_NEUTRAL"


def observation_flow(row: dict[str, Any]) -> str:
    buckets = row.get("shakeoutObservationBuckets")
    if not isinstance(buckets, dict):
        return "FLOW_NO_DATA"
    return "|".join([
        text(buckets.get("volume5m"), "VOL_NO_DATA"),
        text(buckets.get("reclaim"), "RECLAIM_NO_DATA"),
        text(buckets.get("rr"), "RR_NO_DATA"),
    ])


@dataclass
class Trade:
    raw: dict[str, Any]
    trade_id: str
    execution_id: str
    opened: datetime
    closed: datetime
    day: str
    side: str
    variant: str
    setup: str
    btc_align: str
    fill: str
    candle: str
    high_jump: str
    flow: str
    pnl: float
    roe: float
    capped_roe: float
    episode_bucket: int


def build_trade(row: dict[str, Any]) -> Trade | None:
    if text(row.get("status"), "") != "CLOSED":
        return None
    if text(row.get("outcome"), "") == "INVALID":
        return None
    opened = parse_time(row.get("openedAt") or row.get("createdAt"))
    closed = parse_time(row.get("closedAt"))
    pnl = pnl_of(row)
    roe = roe_of(row)
    if not opened or not closed or pnl is None or roe is None:
        return None
    day = opened.date().isoformat()
    if day < DATA_START:
        return None
    trade_id = str(row.get("id") or f"{opened.isoformat()}:{row.get('symbol')}")
    variant = text(row.get("variant"), "NO_VARIANT")
    signal_id = str(row.get("signalId") or row.get("parentSignalId") or trade_id)
    return Trade(
        raw=row,
        trade_id=trade_id,
        execution_id=f"{signal_id}|{variant}",
        opened=opened,
        closed=closed,
        day=day,
        side=text(row.get("side"), "SIDE_NO_DATA"),
        variant=variant,
        setup=setup_of(row),
        btc_align=btc_alignment(row),
        fill=fill_quality(row),
        candle=candle_relation(row),
        high_jump="HIGH_JUMP" if row.get("highJumpRisk") else "JUMP_OK",
        flow=observation_flow(row),
        pnl=pnl,
        roe=roe,
        capped_roe=max(-20.0, min(30.0, roe)),
        episode_bucket=int(opened.timestamp() // (EPISODE_MINUTES * 60)),
    )


def load_trades(path: Path) -> tuple[list[Trade], int]:
    store = json.loads(path.read_text(encoding="utf-8"))
    raw_rows = store if isinstance(store, list) else store.get("trades", [])
    built = [trade for row in raw_rows if (trade := build_trade(row)) is not None]
    built.sort(key=lambda trade: (trade.opened, trade.trade_id))
    deduped: list[Trade] = []
    seen: set[str] = set()
    for trade in built:
        if trade.execution_id in seen:
            continue
        seen.add(trade.execution_id)
        deduped.append(trade)
    return deduped, len(built)


def episode_rows(rows: list[Trade]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, int], list[Trade]] = defaultdict(list)
    for row in rows:
        groups[(row.day, row.episode_bucket)].append(row)
    episodes = []
    for (day, bucket), grouped in groups.items():
        episodes.append({
            "day": day,
            "bucket": bucket,
            "closed": len(grouped),
            "roe": sum(row.capped_roe for row in grouped) / len(grouped),
            "pnl": sum(row.pnl for row in grouped),
        })
    return sorted(episodes, key=lambda item: (item["day"], item["bucket"]))


def stats_of(rows: list[Trade]) -> dict[str, Any]:
    episodes = episode_rows(rows)
    wins = sum(1 for row in rows if row.pnl > 0)
    gross_win = sum(max(0.0, episode["roe"]) for episode in episodes)
    gross_loss = sum(max(0.0, -episode["roe"]) for episode in episodes)
    day_unit: dict[str, float] = defaultdict(float)
    day_pnl: dict[str, float] = defaultdict(float)
    for episode in episodes:
        day_unit[episode["day"]] += episode["roe"] / 100
        day_pnl[episode["day"]] += episode["pnl"]
    positive_unit_days = sum(value > 0 for value in day_unit.values())
    positive_pnl_days = sum(value > 0 for value in day_pnl.values())
    return {
        "closed": len(rows),
        "episodes": len(episodes),
        "wins": wins,
        "losses": len(rows) - wins,
        "winRate": round(wins / len(rows) * 100, 1) if rows else None,
        "actualPnl": round(sum(row.pnl for row in rows), 4),
        "unitPnl": round(sum(episode["roe"] / 100 for episode in episodes), 4),
        "avgEpisodeRoe": round(
            sum(episode["roe"] for episode in episodes) / len(episodes),
            2,
        ) if episodes else None,
        "profitFactor": round(
            min(9.99, gross_win / gross_loss) if gross_loss else 9.99 if gross_win else 0,
            2,
        ),
        "days": len(day_unit),
        "positiveUnitDays": positive_unit_days,
        "positiveActualPnlDays": positive_pnl_days,
        "positiveDayRate": round(
            positive_unit_days / len(day_unit) * 100,
            1,
        ) if day_unit else None,
        "daily": [
            {
                "day": day,
                "closed": sum(row.day == day for row in rows),
                "unitPnl": round(day_unit[day], 4),
                "actualPnl": round(day_pnl[day], 4),
            }
            for day in sorted(day_unit)
        ],
    }


def group_keys(target: Trade) -> list[tuple[int, tuple[str, ...]]]:
    return [
        (5, (
            target.side,
            target.variant,
            target.setup,
            target.btc_align,
            target.fill,
            target.candle,
            target.high_jump,
        )),
        (4, (
            target.side,
            target.variant,
            target.setup,
            target.btc_align,
            target.fill,
        )),
        (3, (
            target.side,
            target.variant,
            target.setup,
            target.btc_align,
        )),
        (2, (
            target.side,
            target.variant,
            target.btc_align,
        )),
        (1, (
            target.side,
            target.variant,
        )),
    ]


def key_for(row: Trade, specificity: int) -> tuple[str, ...]:
    if specificity == 5:
        return (
            row.side, row.variant, row.setup, row.btc_align,
            row.fill, row.candle, row.high_jump,
        )
    if specificity == 4:
        return row.side, row.variant, row.setup, row.btc_align, row.fill
    if specificity == 3:
        return row.side, row.variant, row.setup, row.btc_align
    if specificity == 2:
        return row.side, row.variant, row.btc_align
    return row.side, row.variant


def estimate_horizon(
    target: Trade,
    history: list[Trade],
    horizon_days: int,
) -> dict[str, Any] | None:
    cutoff = target.opened.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(
        days=horizon_days,
    )
    eligible = [
        row for row in history
        if row.opened >= cutoff and row.closed < target.opened.replace(
            hour=0, minute=0, second=0, microsecond=0,
        )
    ]
    if len(eligible) < 12:
        return None
    global_rows = [row for row in eligible if row.side == target.side]
    global_episodes = episode_rows(global_rows)
    prior_mean = (
        sum(row["roe"] for row in global_episodes) / len(global_episodes)
        if global_episodes else 0.0
    )
    estimates = []
    for specificity, target_key in group_keys(target):
        matched = [
            row for row in eligible
            if key_for(row, specificity) == target_key
        ]
        episodes = episode_rows(matched)
        days = len({episode["day"] for episode in episodes})
        min_episodes = {5: 4, 4: 5, 3: 6, 2: 8, 1: 10}[specificity]
        if len(episodes) < min_episodes or days < 2:
            continue
        raw_mean = sum(episode["roe"] for episode in episodes) / len(episodes)
        shrink = 5.0
        shrunk_mean = (
            raw_mean * len(episodes) + prior_mean * shrink
        ) / (len(episodes) + shrink)
        gross_win = sum(max(0.0, episode["roe"]) for episode in episodes)
        gross_loss = sum(max(0.0, -episode["roe"]) for episode in episodes)
        pf = min(9.99, gross_win / gross_loss) if gross_loss else 9.99 if gross_win else 0
        day_values: dict[str, float] = defaultdict(float)
        for episode in episodes:
            day_values[episode["day"]] += episode["roe"]
        positive_days = sum(value > 0 for value in day_values.values())
        reliability = min(1.0, len(episodes) / 12) * min(1.0, days / 3)
        weight = specificity * reliability
        estimates.append({
            "specificity": specificity,
            "episodes": len(episodes),
            "days": days,
            "positiveDays": positive_days,
            "positiveDayRate": positive_days / days if days else 0,
            "mean": shrunk_mean,
            "pf": pf,
            "weight": weight,
        })
    if not estimates:
        return None
    weight_sum = sum(item["weight"] for item in estimates)
    mean = sum(item["mean"] * item["weight"] for item in estimates) / weight_sum
    pf = sum(item["pf"] * item["weight"] for item in estimates) / weight_sum
    day_rate = sum(
        item["positiveDayRate"] * item["weight"] for item in estimates
    ) / weight_sum
    return {
        "horizon": horizon_days,
        "mean": mean,
        "pf": pf,
        "positiveDayRate": day_rate,
        "episodes": max(item["episodes"] for item in estimates),
        "days": max(item["days"] for item in estimates),
        "specificity": max(item["specificity"] for item in estimates),
    }


def score_targets(trades: list[Trade]) -> list[dict[str, Any]]:
    scored = []
    for target in trades:
        if target.day not in set(CALIBRATION_DAYS + VALIDATION_DAYS):
            continue
        history = [row for row in trades if row.closed < target.opened]
        horizons = [
            estimate for horizon in HORIZONS
            if (estimate := estimate_horizon(target, history, horizon)) is not None
        ]
        if not horizons:
            continue
        means = [item["mean"] for item in horizons]
        weights = {3: 0.5, 7: 0.3, 14: 0.2}
        available_weight = sum(weights[item["horizon"]] for item in horizons)
        score = sum(
            item["mean"] * weights[item["horizon"]] for item in horizons
        ) / available_weight
        scored.append({
            "trade": target,
            "horizons": horizons,
            "score": score,
            "median": median(means),
            "positive": sum(value > 0 for value in means),
            "strongNegative": sum(value < -2 for value in means),
        })
    return scored


def selector_config(
    name: str,
    min_score: float,
    min_positive: int,
    require_short_medium: bool = False,
    forbid_strong_negative: bool = True,
) -> tuple[str, Callable[[dict[str, Any]], bool]]:
    def select(item: dict[str, Any]) -> bool:
        by_horizon = {
            row["horizon"]: row for row in item["horizons"]
        }
        if len(by_horizon) < 2:
            return False
        if item["score"] < min_score or item["positive"] < min_positive:
            return False
        if forbid_strong_negative and item["strongNegative"] > 0:
            return False
        if require_short_medium:
            if 3 not in by_horizon or 7 not in by_horizon:
                return False
            if by_horizon[3]["mean"] <= 0 or by_horizon[7]["mean"] <= 0:
                return False
        return True
    return name, select


CONFIGS = [
    selector_config("CONSENSUS_2_SCORE_0", 0.0, 2),
    selector_config("CONSENSUS_2_SCORE_1", 1.0, 2),
    selector_config("CONSENSUS_2_SCORE_2", 2.0, 2),
    selector_config("CONSENSUS_2_SCORE_3", 3.0, 2),
    selector_config("SHORT_MEDIUM_SCORE_0", 0.0, 2, require_short_medium=True),
    selector_config("SHORT_MEDIUM_SCORE_1", 1.0, 2, require_short_medium=True),
    selector_config(
        "CONSENSUS_3_SCORE_0",
        0.0,
        3,
        forbid_strong_negative=False,
    ),
]


def filter_stats(
    scored: list[dict[str, Any]],
    days: tuple[str, ...],
    select: Callable[[dict[str, Any]], bool],
) -> dict[str, Any]:
    candidates = [item for item in scored if item["trade"].day in days]
    selected = [item["trade"] for item in candidates if select(item)]
    stats = stats_of(selected)
    stats["eligible"] = len(candidates)
    stats["coveragePct"] = round(
        len(selected) / len(candidates) * 100,
        1,
    ) if candidates else 0
    return stats


def baseline_filters(trades: list[Trade], days: tuple[str, ...]) -> dict[str, Any]:
    scoped = [trade for trade in trades if trade.day in days]
    selectors: dict[str, Callable[[Trade], bool]] = {
        "ALL": lambda row: True,
        "NATIVE_GOOD": lambda row: text(row.raw.get("shakeoutQuality")) == "GOOD",
        "SIDE_CANDLE_GOOD": lambda row: text(
            row.raw.get("shakeoutSideCandleTier"),
        ) == "GOOD",
        "STAGE2_WATCH_PLUS": lambda row: text(
            row.raw.get("shakeoutStage2Tier"),
        ) == "WATCH_PLUS",
        "MARKET_ONLY": lambda row: row.variant == "MARKET",
        "MARKET_NATIVE_GOOD": lambda row: (
            row.variant == "MARKET"
            and text(row.raw.get("shakeoutQuality")) == "GOOD"
        ),
        "MARKET_NO_HIGH_JUMP": lambda row: (
            row.variant == "MARKET"
            and row.high_jump == "JUMP_OK"
        ),
        "MARKET_LONG": lambda row: row.variant == "MARKET" and row.side == "LONG",
        "MARKET_SHORT": lambda row: row.variant == "MARKET" and row.side == "SHORT",
        "MARKET_BTC_INDEPENDENT": lambda row: (
            row.variant == "MARKET"
            and row.btc_align == "BTC_INDEPENDENT"
        ),
        "MARKET_BTC_INDEPENDENT_LONG": lambda row: (
            row.variant == "MARKET"
            and row.btc_align == "BTC_INDEPENDENT"
            and row.side == "LONG"
        ),
        "MARKET_BTC_INDEPENDENT_SHORT": lambda row: (
            row.variant == "MARKET"
            and row.btc_align == "BTC_INDEPENDENT"
            and row.side == "SHORT"
        ),
        "PENDING_ONLY": lambda row: row.variant == "PENDING",
        "NO_HIGH_JUMP": lambda row: row.high_jump == "JUMP_OK",
        "BTC_ALIGNED": lambda row: row.btc_align == "BTC_ALIGNED",
    }
    result = {}
    for name, selector in selectors.items():
        stats = stats_of([row for row in scoped if selector(row)])
        stats["eligible"] = len(scoped)
        stats["coveragePct"] = round(
            stats["closed"] / len(scoped) * 100,
            1,
        ) if scoped else 0
        result[name] = stats

    def first_per_episode(selector: Callable[[Trade], bool]) -> list[Trade]:
        selected = []
        seen: set[tuple[str, int]] = set()
        for row in scoped:
            key = (row.day, row.episode_bucket)
            if key in seen or not selector(row):
                continue
            seen.add(key)
            selected.append(row)
        return selected

    episode_selectors: dict[str, Callable[[Trade], bool]] = {
        "EPISODE_FIRST": lambda row: True,
        "MARKET_EPISODE_FIRST": selectors["MARKET_ONLY"],
        "MARKET_INDEPENDENT_EPISODE_FIRST": selectors["MARKET_BTC_INDEPENDENT"],
        "MARKET_LONG_EPISODE_FIRST": selectors["MARKET_LONG"],
    }
    for name, selector in episode_selectors.items():
        stats = stats_of(first_per_episode(selector))
        stats["eligible"] = len(scoped)
        stats["coveragePct"] = round(
            stats["closed"] / len(scoped) * 100,
            1,
        ) if scoped else 0
        result[name] = stats
    return result


def objective(stats: dict[str, Any]) -> float:
    if stats["closed"] < 25 or stats["days"] < 4:
        return -999
    coverage = stats.get("coveragePct", 0)
    if coverage < 8 or coverage > 65:
        return -999
    return (
        float(stats.get("avgEpisodeRoe") or 0)
        + min(3.0, float(stats.get("profitFactor") or 0)) * 1.5
        + (float(stats.get("positiveDayRate") or 0) - 50) / 5
        + min(20, coverage) / 20
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--paper-file",
        default="data/shakeout-paper-trades.json",
    )
    parser.add_argument("--pretty", action="store_true")
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Print only the calibration-selected baseline and holdout evidence.",
    )
    args = parser.parse_args()

    trades, pre_dedupe = load_trades(Path(args.paper_file))
    scored = score_targets(trades)
    calibration = {
        name: filter_stats(scored, CALIBRATION_DAYS, selector)
        for name, selector in CONFIGS
    }
    selected_name = max(calibration, key=lambda name: objective(calibration[name]))
    selected_fn = dict(CONFIGS)[selected_name]
    validation = {
        name: filter_stats(scored, VALIDATION_DAYS, selector)
        for name, selector in CONFIGS
    }
    baseline_calibration = baseline_filters(trades, CALIBRATION_DAYS)
    baseline_validation = baseline_filters(trades, VALIDATION_DAYS)
    baseline_candidates = {
        name: stats for name, stats in baseline_calibration.items()
        if name != "ALL"
    }
    selected_baseline = max(
        baseline_candidates,
        key=lambda name: objective(baseline_candidates[name]),
    )
    directional_names = (
        "MARKET_BTC_INDEPENDENT_LONG",
        "MARKET_BTC_INDEPENDENT_SHORT",
    )
    recommended_observation = max(
        directional_names,
        key=lambda name: objective(baseline_calibration[name]),
    )
    result = {
        "version": "SHAKEOUT_CYCLE_CONSENSUS_BACKTEST_V1_20260727",
        "mode": "READ_ONLY_BACKTEST",
        "guardrail": {
            "canAffectTrading": False,
            "writesPaperStore": False,
        },
        "method": {
            "entryLabelFrozenByUtcDay": True,
            "outcomeAvailableOnlyAfterClose": True,
            "dedupe": "signalId + variant",
            "episodeMinutes": EPISODE_MINUTES,
            "outcome": "episode-average netRoe capped [-20,+30]",
            "horizonsDays": HORIZONS,
            "features": [
                "side",
                "variant",
                "setup",
                "BTC alignment/independence",
                "fill quality",
                "coin candle relation",
                "high-jump",
            ],
        },
        "dataset": {
            "dataStart": DATA_START,
            "closedBeforeDedupe": pre_dedupe,
            "closedAfterDedupe": len(trades),
            "scored": len(scored),
            "calibrationDays": CALIBRATION_DAYS,
            "validationDays": VALIDATION_DAYS,
        },
        "baseline": {
            "calibration": baseline_calibration,
            "selectedOnCalibration": selected_baseline,
            "recommendedDirectionalObservation": recommended_observation,
            "validation": baseline_validation,
            "selectedValidation": baseline_validation[selected_baseline],
            "recommendedDirectionalValidation": baseline_validation[
                recommended_observation
            ],
            "fullPeriod": baseline_filters(trades, FULL_EVALUATION_DAYS),
        },
        "calibration": calibration,
        "selectedOnCalibration": selected_name,
        "validation": validation,
        "selectedValidation": validation[selected_name],
        "selectedDailyValidation": filter_stats(
            scored,
            VALIDATION_DAYS,
            selected_fn,
        )["daily"],
    }
    if args.summary:
        focus_names = (
            "ALL",
            "NATIVE_GOOD",
            "MARKET_ONLY",
            "MARKET_NATIVE_GOOD",
            "MARKET_NO_HIGH_JUMP",
            "MARKET_LONG",
            "MARKET_SHORT",
            "MARKET_BTC_INDEPENDENT",
            "MARKET_BTC_INDEPENDENT_LONG",
            "MARKET_BTC_INDEPENDENT_SHORT",
            "EPISODE_FIRST",
            "MARKET_EPISODE_FIRST",
            "MARKET_INDEPENDENT_EPISODE_FIRST",
            "MARKET_LONG_EPISODE_FIRST",
            "PENDING_ONLY",
        )
        compact = {
            "version": result["version"],
            "dataset": result["dataset"],
            "baselineSelectedOnCalibration": selected_baseline,
            "recommendedDirectionalObservation": recommended_observation,
            "baselineCalibration": {
                name: baseline_calibration[name]
                for name in focus_names
            },
            "baselineValidation": {
                name: baseline_validation[name]
                for name in focus_names
            },
            "baselineFullPeriod": {
                name: result["baseline"]["fullPeriod"][name]
                for name in focus_names
            },
            "consensusSelectedOnCalibration": selected_name,
            "consensusCalibration": calibration[selected_name],
            "consensusValidation": validation[selected_name],
        }
        print(json.dumps(compact, indent=2, ensure_ascii=False))
        return
    print(json.dumps(result, indent=2 if args.pretty else None, ensure_ascii=False))


if __name__ == "__main__":
    main()
