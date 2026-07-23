#!/usr/bin/env python3
"""Causal, analysis-only model for Signal Picks and Recommended Paper.

The model is deliberately sidecar-only: it reads independent paper outcomes and
returns flags. It never writes the paper file and never participates in entry,
position sizing, SL or TP decisions.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

MODEL = "RECOMMENDED_SIGNAL_WALK_FORWARD_V1"
PAPER_MODE = "INDEPENDENT_SOCKET_V2"


def text(value: Any, fallback: str = "-") -> str:
    raw = str(value if value is not None else "").strip().upper()
    return raw.replace(" ", "_") or fallback


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else fallback
    except (TypeError, ValueError):
        return fallback


def dt(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        raw = str(value).replace("Z", "+00:00")
        parsed = datetime.fromisoformat(raw)
        return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc).astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def candle_name(row: dict[str, Any]) -> str:
    candle = row.get("candlePatternAtEntry")
    if isinstance(candle, dict):
        return text(candle.get("name"), "NO_DATA")
    return text(candle, "NO_DATA")


def combo_parts(row: dict[str, Any]) -> list[str]:
    return [text(part) for part in str(row.get("recommendationCombo") or row.get("combo") or "").split("|")]


def features(row: dict[str, Any]) -> dict[str, str]:
    parts = combo_parts(row)
    page = text(row.get("sourcePage") or row.get("page"), "UNKNOWN")
    stage = text(row.get("signalType") or (parts[0] if parts else None), "UNKNOWN")
    side = text(row.get("side") or (parts[1] if len(parts) > 1 else None), "UNKNOWN")
    timeframe = text(row.get("timeframe") or (parts[2] if len(parts) > 2 else None), "-")
    btc_phase = text(row.get("recommendationBtcPhase") or row.get("btcPhase") or (parts[4] if len(parts) > 4 else None), "BTC_NO_DATA")
    relation = text(row.get("relation") or (parts[5] if len(parts) > 5 else None), "NO_RELATION")
    score_bucket = text(row.get("scoreBucket"), "NO_SCORE")
    combo = "|".join(parts) if parts else "NO_COMBO"
    return {
        "page": page, "stage": stage, "side": side, "timeframe": timeframe,
        "btcPhase": btc_phase, "relation": relation, "scoreBucket": score_bucket,
        "combo": combo, "candle": candle_name(row),
    }


def group_candidates(row: dict[str, Any], include_candle: bool) -> list[tuple[str, str]]:
    f = features(row)
    result: list[tuple[str, str]] = []
    if include_candle and f["candle"] not in {"NO_DATA", "UNKNOWN", "-"}:
        result.append(("COMBO_CANDLE", f'{f["page"]}|{f["combo"]}|{f["candle"]}'))
    result.extend([
        ("EXACT_COMBO", f'{f["page"]}|{f["combo"]}'),
        ("CONTEXT", "|".join(f[k] for k in ("page", "stage", "side", "timeframe", "btcPhase", "relation", "scoreBucket"))),
        ("SETUP_BTC", "|".join(f[k] for k in ("page", "stage", "side", "timeframe", "btcPhase"))),
        ("SETUP", "|".join(f[k] for k in ("page", "stage", "side", "timeframe"))),
        ("PAGE_SIDE", "|".join(f[k] for k in ("page", "side"))),
    ])
    return result


def empty_stats() -> dict[str, float]:
    return {"n": 0, "wins": 0, "losses": 0, "breakeven": 0, "roe": 0.0, "pnl": 0.0, "grossWin": 0.0, "grossLoss": 0.0, "sl": 0}


def add_outcome(stats: dict[str, float], row: dict[str, Any]) -> None:
    roe = number(row.get("roe", row.get("roePct")), 0.0) or 0.0
    pnl = number(row.get("pnl", row.get("netPnl")), 0.0) or 0.0
    stats["n"] += 1
    stats["roe"] += roe
    stats["pnl"] += pnl
    if roe > 0.05:
        stats["wins"] += 1
        stats["grossWin"] += max(pnl, 0.0)
    elif roe < -0.05:
        stats["losses"] += 1
        stats["grossLoss"] += abs(min(pnl, 0.0))
    else:
        stats["breakeven"] += 1
    close_text = " ".join(str(row.get(k) or "") for k in ("outcome", "closeReason", "recommendedCloseReason")).upper()
    if "SL" in close_text:
        stats["sl"] += 1


def metrics(stats: dict[str, float]) -> dict[str, Any]:
    n = int(stats["n"])
    decisive = stats["wins"] + stats["losses"]
    raw_wr = (stats["wins"] / decisive * 100.0) if decisive else None
    # Beta(2,2) shrinkage prevents tiny perfect samples from being called GOOD.
    adjusted_wr = ((stats["wins"] + 2) / (decisive + 4) * 100.0) if decisive else 50.0
    avg_roe = stats["roe"] / n if n else 0.0
    pf = (stats["grossWin"] / stats["grossLoss"]) if stats["grossLoss"] > 0 else (99.0 if stats["grossWin"] > 0 else 0.0)
    sl_rate = stats["sl"] / n * 100.0 if n else 0.0
    return {
        "samples": n, "wins": int(stats["wins"]), "losses": int(stats["losses"]),
        "breakeven": int(stats["breakeven"]), "wr": raw_wr,
        "adjustedWr": adjusted_wr, "avgRoe": avg_roe, "pnl": stats["pnl"],
        "profitFactor": pf, "slRate": sl_rate,
    }


def flag_from(groups: dict[tuple[str, str], dict[str, float]], row: dict[str, Any], min_samples: int, include_candle: bool) -> dict[str, Any]:
    chosen = None
    for level, key in group_candidates(row, include_candle):
        current = groups.get((level, key))
        if current and current["n"] >= min_samples:
            chosen = (level, key, current)
            break
    if not chosen:
        available = max((int(groups.get(candidate, {}).get("n", 0)) for candidate in group_candidates(row, include_candle)), default=0)
        return {
            "label": "PY PRIOR WATCH", "tier": "PRIOR", "confidence": 0,
            "samples": available, "groupLevel": None,
            "reason": f"Chưa đủ {min_samples} mẫu độc lập đã đóng; không gắn GOOD từ prior.",
        }
    level, key, stats = chosen
    m = metrics(stats)
    if m["adjustedWr"] >= 60 and m["avgRoe"] >= 1 and m["profitFactor"] >= 1.2 and m["slRate"] <= 45:
        label, tier = "PY GOOD", "GOOD"
    elif m["adjustedWr"] <= 45 or m["avgRoe"] <= -2 or m["profitFactor"] < 0.8 or m["slRate"] >= 55:
        label, tier = "PY RISK", "RISK"
    else:
        label, tier = "PY WATCH", "WATCH"
    confidence = min(100, round(35 + min(m["samples"], 40) / 40 * 45 + min(abs(m["adjustedWr"] - 50), 25) / 25 * 20))
    broad_fallback = level == "PAGE_SIDE"
    if broad_fallback:
        # Page + side is useful context, but far too broad to become an action
        # label. This guardrail prevents a repeat of optimistic legacy PY GOOD.
        label, tier = "PY WATCH", "WATCH"
        confidence = min(confidence, 55)
    prefix = "Fallback rộng, chỉ tham khảo; " if broad_fallback else ""
    return {
        "label": label, "tier": tier, "confidence": confidence,
        "groupLevel": level, "groupKey": key, **m,
        "reason": f'{prefix}{level}: n={m["samples"]}, AdjWR={m["adjustedWr"]:.1f}%, AvgROE={m["avgRoe"]:+.1f}%, PF={m["profitFactor"]:.2f}, SL={m["slRate"]:.1f}%.',
    }


def learn(args: argparse.Namespace) -> dict[str, Any]:
    store = json.loads(Path(args.paper_file).read_text(encoding="utf-8"))
    raw_trades = store.get("trades", []) if isinstance(store, dict) else store
    valid_from = dt(args.valid_from)
    cutoff = datetime.now(timezone.utc) - timedelta(days=args.lookback_days)
    start = max(filter(None, [valid_from, cutoff]), default=cutoff)
    seen: set[str] = set()
    trades: list[dict[str, Any]] = []
    excluded = defaultdict(int)
    for row in raw_trades:
        if row.get("paperMode") != PAPER_MODE:
            excluded["paperMode"] += 1; continue
        unique = str(row.get("sourceTradeId") or row.get("id") or "")
        if not unique or unique in seen:
            excluded["duplicate"] += 1; continue
        seen.add(unique)
        opened = dt(row.get("openedAt") or row.get("createdAt"))
        if not opened or opened < start:
            excluded["beforeValidWindow"] += 1; continue
        trades.append(row)

    groups: dict[tuple[str, str], dict[str, float]] = defaultdict(empty_stats)
    trade_flags: dict[str, dict[str, Any]] = {}
    events = []
    for row in trades:
        opened = dt(row.get("openedAt") or row.get("createdAt"))
        closed = dt(row.get("closedAt")) if text(row.get("status")) == "CLOSED" else None
        if opened:
            events.append((opened, 0, "OPEN", row))
        if closed:
            events.append((closed, 1, "CLOSE", row))
    # OPEN precedes CLOSE at equal timestamps, ensuring no same-event leakage.
    events.sort(key=lambda event: (event[0], event[1], str(event[3].get("id"))))
    for _, _, kind, row in events:
        if kind == "OPEN":
            trade_flags[str(row.get("id"))] = flag_from(groups, row, args.min_samples, True)
        else:
            for candidate in group_candidates(row, True):
                add_outcome(groups[candidate], row)

    signal_rows = json.loads(args.signals_json or "[]")
    signal_flags = []
    for row in signal_rows:
        signal_flags.append({
            "id": row.get("id"),
            "key": f'{text(row.get("page"), "UNKNOWN")}|{text(row.get("btcPhase"), "BTC_NO_DATA")}|{row.get("combo") or ""}',
            **flag_from(groups, row, args.min_samples, False),
        })

    closed_rows = [row for row in trades if text(row.get("status")) == "CLOSED" and dt(row.get("closedAt"))]
    global_stats = empty_stats()
    for row in closed_rows:
        add_outcome(global_stats, row)
    learned_groups = sum(1 for stats in groups.values() if stats["n"] >= args.min_samples)
    return {
        "schemaVersion": 1, "model": MODEL, "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "ANALYSIS_ONLY",
        "guardrail": "Không can thiệp whitelist, entry, margin, SL hoặc TP.",
        "training": {
            "paperMode": PAPER_MODE, "method": "CAUSAL_WALK_FORWARD_BAYES_SHRINKAGE",
            "lookbackDays": args.lookback_days, "validFrom": start.isoformat(),
            "minSamples": args.min_samples, "closedSamples": len(closed_rows),
            "uniqueSamples": len(trades), "learnedGroups": learned_groups,
            "excluded": dict(excluded), "global": metrics(global_stats),
        },
        "signalFlags": signal_flags, "tradeFlags": trade_flags,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--paper-file", required=True)
    parser.add_argument("--signals-json", default="[]")
    parser.add_argument("--lookback-days", type=int, default=30)
    parser.add_argument("--min-samples", type=int, default=8)
    parser.add_argument("--valid-from", default="")
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()
    output = learn(args)
    print(json.dumps(output, ensure_ascii=False, indent=2 if args.pretty else None))


if __name__ == "__main__":
    main()
