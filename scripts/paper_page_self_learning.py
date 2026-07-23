#!/usr/bin/env python3
"""Generic causal paper self-learning sidecar.

Read-only and analysis-only. Each invocation learns exactly one paper page and
never writes its store or affects entry, size, SL, TP, real orders, or gates.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

MODEL = "PAPER_PAGE_WALK_FORWARD_V2"


def norm(value: Any, fallback: str = "-") -> str:
    text = str(value if value is not None else "").strip().upper()
    return re.sub(r"[\s-]+", "_", text) or fallback


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        result = float(value)
        return result if math.isfinite(result) else fallback
    except (TypeError, ValueError):
        return fallback


def stamp(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc).astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def pattern(value: Any) -> str:
    return norm(value.get("name") if isinstance(value, dict) else value, "NO_DATA")


def timeframe(row: dict[str, Any]) -> str:
    direct = row.get("decisionTimeframe") or row.get("signalTimeframe") or row.get("timeframe") or row.get("interval") or row.get("tf")
    if direct:
        return norm(direct)
    found = re.search(r"(?:^|-)(\d+[mh])(?:-|$)", str(row.get("source") or ""), re.I)
    return norm(found.group(1) if found else "15m")


def setup(row: dict[str, Any]) -> str:
    direct = row.get("decisionStage") or row.get("stage") or row.get("signalType") or row.get("type") or row.get("subtype")
    if direct:
        return norm(direct)
    source = str(row.get("source") or "").lower()
    for name in ("pre_breakout", "pre_breakdown", "breakout", "breakdown", "runner", "squeeze_short", "squeeze", "early_pump", "early_dump"):
        if name in source:
            return norm(name)
    return norm(source.split("|")[0], "OTHER")


def btc_phase(row: dict[str, Any]) -> str:
    health = row.get("btcHealth") if isinstance(row.get("btcHealth"), dict) else {}
    direct = row.get("btcPhase") or row.get("recommendationBtcPhase") or row.get("btcRegimeAtEntry") or row.get("btcRegime") or health.get("regime")
    if direct:
        return norm(direct, "BTC_NO_DATA")
    direction = norm(row.get("btcTrendDir") or health.get("btcTrendDir"), "FLAT")
    score = number(row.get("btcTrendScore") or health.get("btcTrendScore"), 0) or 0
    strength = "STRONG" if score >= 65 else "MID" if score >= 45 else "WEAK"
    return f"BTC_{direction}_{strength}"


def score_bucket(row: dict[str, Any]) -> str:
    score = number(row.get("score") or row.get("signalScore") or row.get("predictionScore"))
    if score is None:
        return "SCORE_NO_DATA"
    return "S90_PLUS" if score >= 90 else "S80_89" if score >= 80 else "S70_79" if score >= 70 else "S60_69" if score >= 60 else "S_LT60"


def features(row: dict[str, Any]) -> dict[str, str]:
    return {
        "setup": setup(row),
        "side": norm(row.get("side") or row.get("action"), "SIDE_UNKNOWN"),
        "timeframe": timeframe(row),
        "variant": norm(row.get("variant") or row.get("entryMode"), "DEFAULT"),
        "btc": btc_phase(row),
        "candle": pattern(row.get("candlePatternAtEntry") or row.get("candlePattern5m") or row.get("candlePattern15m")),
        "btcCandle": pattern(row.get("btcCandlePatternAtEntry") or row.get("btcCandlePattern5m")),
        "score": score_bucket(row),
    }


def candidates(row: dict[str, Any], page: str) -> list[tuple[str, str, int]]:
    f = features(row)
    return [
        ("EXACT", "|".join([f["setup"], f["side"], f["timeframe"], f["variant"], f["btc"], f["candle"], f["btcCandle"], f["score"]]), 6),
        ("SETUP_CANDLE_BTC", "|".join([f["setup"], f["side"], f["variant"], f["btc"], f["candle"]]), 5),
        ("SETUP_BTC", "|".join([f["setup"], f["side"], f["variant"], f["btc"]]), 4),
        ("SETUP_VARIANT", "|".join([f["setup"], f["side"], f["variant"]]), 3),
        ("SETUP_SIDE", "|".join([f["setup"], f["side"]]), 2),
        ("PAGE_SIDE", "|".join([page, f["side"]]), 1),
        ("PAGE_GLOBAL", page, 0),
    ]


def outcome(row: dict[str, Any]) -> dict[str, float] | None:
    if norm(row.get("status")) != "CLOSED" or norm(row.get("outcome")) == "INVALID":
        return None
    pnl = number(row.get("netPnl"), number(row.get("pnl")))
    roe = number(row.get("netRoe"), number(row.get("roe")))
    if pnl is None or roe is None:
        return None
    return {"pnl": pnl, "roe": roe, "win": 1.0 if pnl > 0 else 0.0}


def empty() -> dict[str, float]:
    return {"closed": 0, "wins": 0, "pnl": 0.0, "roe": 0.0, "grossWin": 0.0, "grossLoss": 0.0}


def add(agg: dict[str, float], result: dict[str, float]) -> None:
    agg["closed"] += 1
    agg["wins"] += result["win"]
    agg["pnl"] += result["pnl"]
    agg["roe"] += result["roe"]
    if result["pnl"] > 0:
        agg["grossWin"] += result["pnl"]
    elif result["pnl"] < 0:
        agg["grossLoss"] += abs(result["pnl"])


def metrics(agg: dict[str, float]) -> dict[str, float]:
    n = int(agg["closed"])
    wins = int(agg["wins"])
    adjusted = (wins + 4) / (n + 8) * 100 if n else 50.0
    pf = agg["grossWin"] / agg["grossLoss"] if agg["grossLoss"] else 9.99 if agg["grossWin"] else 0.0
    return {
        "closed": n,
        "winRate": round(wins / n * 100 if n else 0.0, 2),
        "adjustedWinRate": round(adjusted, 2),
        "avgRoe": round(agg["roe"] / n if n else 0.0, 3),
        "netPnl": round(agg["pnl"], 4),
        "profitFactor": round(min(pf, 9.99), 3),
    }


def identity(flag: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    return {
        **flag,
        "symbol": row.get("symbol"),
        "entryPrice": number(row.get("entryPrice") or row.get("entry") or row.get("fillPrice")),
        "openedAt": row.get("openedAt") or row.get("createdAt"),
        "model": MODEL,
        "analysisOnly": True,
    }


def evaluate(row: dict[str, Any], groups: dict[tuple[str, str], dict[str, float]], page: str, minimum: int) -> dict[str, Any]:
    available = [(specificity, level, key, groups[(level, key)]) for level, key, specificity in candidates(row, page) if groups[(level, key)]["closed"] >= minimum]
    if not available:
        best = max((int(groups[(level, key)]["closed"]) for level, key, _ in candidates(row, page)), default=0)
        return identity({"flag": "PYTHON_NO_OOS", "label": "PY NO OOS", "tone": "muted", "reason": f"Cohort trước entry n={best}/{minimum}", "learned": False}, row)
    _, level, key, agg = max(available, key=lambda item: (item[0], item[3]["closed"]))
    stat = metrics(agg)
    # EMA has a very large, fast-changing sample. The old generic GOOD gate
    # admitted small/broad cohorts whose realized OOS AvgROE was still negative.
    # Only promote stable, sufficiently specific EMA cohorts; everything else
    # remains WATCH/RISK and cannot look better merely because it has 8 samples.
    ema_good = (
        page == "ema-squeeze"
        and level in {"EXACT", "PAGE_SIDE"}
        and stat["closed"] >= 50
        and stat["adjustedWinRate"] >= 62
        and stat["avgRoe"] >= 3
        and stat["profitFactor"] >= 1.3
    )
    generic_good = (
        page != "ema-squeeze"
        and stat["adjustedWinRate"] >= 58
        and stat["avgRoe"] >= 1
        and stat["profitFactor"] >= 1.15
    )
    if ema_good or generic_good:
        flag, label, tone = "PYTHON_GOOD", "PY GOOD", "good"
    elif stat["adjustedWinRate"] <= 45 or stat["avgRoe"] <= -2 or stat["profitFactor"] < 0.8:
        flag, label, tone = "PYTHON_RISK", "PY RISK", "risk"
    else:
        flag, label, tone = "PYTHON_WATCH", "PY WATCH", "watch"
    reason = f"{level} n={stat['closed']}; AdjWR {stat['adjustedWinRate']:.1f}%; AvgROE {stat['avgRoe']:+.1f}%; PF {stat['profitFactor']:.2f}"
    return identity({"flag": flag, "label": label, "tone": tone, "reason": reason, "learned": True, "groupLevel": level}, row)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--paper-file", required=True)
    parser.add_argument("--page", required=True)
    parser.add_argument("--source-prefix", default="")
    parser.add_argument("--lookback-days", type=int, default=30)
    parser.add_argument("--min-samples", type=int, default=8)
    parser.add_argument("--max-flags", type=int, default=5000)
    args = parser.parse_args()
    paper_path = Path(args.paper_file)
    raw = json.loads(paper_path.read_text(encoding="utf-8")) if paper_path.exists() else {"trades": []}
    rows = raw if isinstance(raw, list) else raw.get("trades", [])
    if args.source_prefix:
        rows = [row for row in rows if str(row.get("source") or "").lower().startswith(args.source_prefix.lower())]
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, args.lookback_days))
    eligible = [row for row in rows if isinstance(row, dict) and (stamp(row.get("closedAt") or row.get("openedAt") or row.get("createdAt")) or cutoff) >= cutoff]
    groups: dict[tuple[str, str], dict[str, float]] = defaultdict(empty)
    flags: dict[str, dict[str, Any]] = {}
    events: list[tuple[datetime, int, str, dict[str, Any]]] = []
    for row in eligible:
        row_id = str(row.get("id") or "")
        opened = stamp(row.get("openedAt") or row.get("createdAt") or row.get("closedAt"))
        closed = stamp(row.get("closedAt"))
        if row_id and opened:
            events.append((opened, 0, "OPEN", row))
        if row_id and closed and outcome(row):
            events.append((closed, 1, "CLOSE", row))
    events.sort(key=lambda event: (event[0], event[1], str(event[3].get("id"))))
    learned_signals: set[str] = set()
    for _, _, kind, row in events:
        row_id = str(row.get("id"))
        if kind == "OPEN":
            flags[row_id] = evaluate(row, groups, args.page, max(3, args.min_samples))
            continue
        result = outcome(row)
        signal_key = f"{row.get('signalId') or row.get('sourceTradeId') or row_id}|{norm(row.get('variant'), 'DEFAULT')}"
        if result is None or signal_key in learned_signals:
            continue
        learned_signals.add(signal_key)
        for level, key, _ in candidates(row, args.page):
            add(groups[(level, key)], result)
    for row in eligible:
        row_id = str(row.get("id") or "")
        if row_id and row_id not in flags:
            flags[row_id] = evaluate(row, groups, args.page, max(3, args.min_samples))
    counts = defaultdict(int)
    for flag in flags.values():
        counts[flag["label"]] += 1
    all_flag_count = len(flags)
    if args.max_flags > 0 and len(flags) > args.max_flags:
        newest = sorted(
            flags.items(),
            key=lambda item: stamp(item[1].get("openedAt")) or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )[:args.max_flags]
        flags = dict(newest)
    output = {
        "schemaVersion": 1,
        "model": MODEL,
        "page": args.page,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "guardrail": {"canAffectTrading": False, "writesPaperStore": False},
        "training": {"lookbackDays": args.lookback_days, "minSamples": max(3, args.min_samples), "eligibleRows": len(eligible), "learnedOutcomes": len(learned_signals), "groups": len(groups), "scoredRows": all_flag_count, "returnedFlags": len(flags)},
        "summary": dict(counts),
        "tradeFlags": flags,
    }
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
