#!/usr/bin/env python3
"""Causal self-learning sidecar for EMA Squeeze signals and paper trades.

Read-only by design. The output is for analysis/UI only and must never be used
by the detector, paper creator, real order flow, position size, SL or TP logic.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

MODEL = "EMA_SQUEEZE_WALK_FORWARD_V1"
SOURCE_PREFIX = "emasq-"


def norm(value: Any, fallback: str = "-") -> str:
    raw = str(value if value is not None else "").strip().upper()
    return re.sub(r"[\s-]+", "_", raw) or fallback


def num(value: Any, fallback: float | None = None) -> float | None:
    try:
        value = float(value)
        return value if math.isfinite(value) else fallback
    except (TypeError, ValueError):
        return fallback


def parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc).astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def timeframe(row: dict[str, Any]) -> str:
    direct = row.get("interval") or row.get("timeframe") or row.get("signalTimeframe")
    if direct:
        return str(direct).strip().lower()
    match = re.match(r"^emasq-(\d+[mh])-", str(row.get("source") or ""), re.I)
    return match.group(1).lower() if match else "15m"


def stage(row: dict[str, Any]) -> str:
    source = str(row.get("source") or "").lower()
    note = str(row.get("note") or "").lower()
    side = norm(row.get("side") or row.get("action"), "LONG")
    br_score = num(row.get("brLikeScore"), 0) or 0
    if "br_like_short" in source or "brlikeshort=y" in note or (not source and br_score >= 80 and side == "SHORT"):
        return "BR_LIKE_SHORT"
    if "br_like" in source or "brlike=y" in note or (not source and br_score >= 80):
        return "BR_LIKE"
    if row.get("runnerCandidate") or "runner" in source or "runner=y" in note:
        return "RUNNER"
    direct = norm(row.get("stage"), "")
    if direct:
        return direct
    for value in ("pre_breakout", "pre_breakdown", "breakout", "breakdown", "squeeze_short", "squeeze"):
        if value in source:
            return value.upper()
    return "OTHER"


def score_of(row: dict[str, Any]) -> float | None:
    direct = num(row.get("score"))
    if direct is not None:
        return direct
    source = str(row.get("source") or "")
    found = re.findall(r"-(\d{2,3})(?:-|$)", source)
    return num(found[-1]) if found else None


def score_bucket(row: dict[str, Any]) -> str:
    score = score_of(row)
    if score is None:
        return "NO_SCORE"
    if score >= 90:
        return "S90_PLUS"
    if score >= 80:
        return "S80_89"
    if score >= 70:
        return "S70_79"
    if score >= 60:
        return "S60_69"
    return "S_LT60"


def corr_of(row: dict[str, Any]) -> float | None:
    return num(row.get("btcCorr") or (row.get("btcChartRelation") or {}).get("corr"))


def corr_bucket(row: dict[str, Any]) -> str:
    corr = corr_of(row)
    if corr is None:
        return "CORR_NO_DATA"
    absolute = abs(corr)
    if absolute < 0.3:
        return "CORR_RAC"
    if absolute < 0.5:
        return "CORR_YEU"
    return "CORR_THEO"


def btc_regime(row: dict[str, Any]) -> str:
    health = row.get("btcHealth") if isinstance(row.get("btcHealth"), dict) else {}
    direct = row.get("btcRegime") or row.get("btcRegimeAtEntry") or health.get("regime")
    if direct:
        return norm(direct, "BTC_NO_DATA")
    direction = norm(row.get("btcTrendDir") or health.get("btcTrendDir"), "FLAT")
    score = num(row.get("btcTrendScore") or health.get("btcTrendScore"))
    strength = "WEAK" if score is not None and score < 45 else "MID" if score is not None and score < 65 else "STRONG"
    return f"{direction}_{strength}"


def btc_phase(row: dict[str, Any]) -> str:
    for key in ("brEvalBtcPhase", "runnerEvalBtcPhase", "emaBreakEvalBtcPhase", "pumpEvalBtcPhase"):
        if row.get(key):
            return norm(row[key], "BTC_NO_DATA")
    regime = btc_regime(row)
    if regime.startswith("BTC_"):
        return regime
    return f"BTC_{regime}"


def candle(row: dict[str, Any]) -> str:
    value = row.get("candlePatternAtEntry")
    if isinstance(value, dict):
        return norm(value.get("name"), "NO_DATA")
    return norm(value, "NO_DATA")


def session(row: dict[str, Any]) -> str:
    opened = parse_dt(row.get("openedAt") or row.get("createdAt"))
    hour = ((opened.hour + 7) % 24) if opened else 0
    start = (hour // 6) * 6
    return f"H{start:02d}_{start + 5:02d}_BKK"


def feature(row: dict[str, Any]) -> dict[str, str]:
    return {
        "stage": stage(row),
        "side": norm(row.get("side") or row.get("action"), "UNKNOWN"),
        "tf": timeframe(row).upper(),
        "btc": btc_phase(row),
        "corr": corr_bucket(row),
        "score": score_bucket(row),
        "candle": candle(row),
        "session": session(row),
    }


def candidates(row: dict[str, Any], include_candle: bool = True) -> list[tuple[str, str]]:
    f = feature(row)
    rows: list[tuple[str, str]] = []
    if include_candle and f["candle"] not in {"NO_DATA", "UNKNOWN", "-"}:
        rows.append(("CANDLE_CONTEXT", "|".join(f[k] for k in ("stage", "side", "tf", "btc", "corr", "score", "candle"))))
    rows.extend([
        ("FULL_CONTEXT", "|".join(f[k] for k in ("stage", "side", "tf", "btc", "corr", "score"))),
        ("BTC_CONTEXT", "|".join(f[k] for k in ("stage", "side", "tf", "btc", "corr"))),
        ("SCORE_SESSION", "|".join(f[k] for k in ("stage", "side", "tf", "score", "session"))),
        ("SCORE_CONTEXT", "|".join(f[k] for k in ("stage", "side", "tf", "score"))),
        ("SETUP", "|".join(f[k] for k in ("stage", "side", "tf"))),
        ("STAGE_SIDE", "|".join(f[k] for k in ("stage", "side"))),
    ])
    return rows


def empty_stats() -> dict[str, Any]:
    return {"n": 0, "wins": 0, "losses": 0, "be": 0, "roe": 0.0, "pnl": 0.0, "grossWinRoe": 0.0, "grossLossRoe": 0.0, "sl": 0, "tail": 0}


def add(stats: dict[str, Any], row: dict[str, Any]) -> None:
    roe = num(row.get("roe", row.get("roePct")), 0.0) or 0.0
    pnl = num(row.get("pnl", row.get("netPnl")), 0.0) or 0.0
    stats["n"] += 1
    stats["roe"] += roe
    stats["pnl"] += pnl
    if roe > 0.05:
        stats["wins"] += 1
        stats["grossWinRoe"] += roe
    elif roe < -0.05:
        stats["losses"] += 1
        stats["grossLossRoe"] += abs(roe)
    else:
        stats["be"] += 1
    close_text = " ".join(str(row.get(key) or "") for key in ("outcome", "closeReason")).upper()
    # A moved/trailing SL can close in profit. Count only losing SL exits as
    # risk; otherwise profitable SL_MOVED rows would make good groups look bad.
    if "SL" in close_text and roe < -0.05:
        stats["sl"] += 1
    if roe <= -10:
        stats["tail"] += 1


def summarize(stats: dict[str, Any]) -> dict[str, Any]:
    n = int(stats["n"])
    decisive = stats["wins"] + stats["losses"]
    wr = stats["wins"] / decisive * 100 if decisive else None
    adjusted = (stats["wins"] + 3) / (decisive + 6) * 100 if decisive else 50.0
    pf = stats["grossWinRoe"] / stats["grossLossRoe"] if stats["grossLossRoe"] else (99.0 if stats["grossWinRoe"] else 0.0)
    return {
        "samples": n, "wins": stats["wins"], "losses": stats["losses"], "breakeven": stats["be"],
        "wr": wr, "adjustedWr": adjusted, "avgRoe": stats["roe"] / n if n else 0.0,
        "pnl": stats["pnl"], "profitFactorRoe": pf,
        "slRate": stats["sl"] / n * 100 if n else 0.0,
        "tailLossRate": stats["tail"] / n * 100 if n else 0.0,
    }


def classify(groups: dict[tuple[str, str], dict[str, Any]], row: dict[str, Any], minimum: int, include_candle: bool = True) -> dict[str, Any]:
    chosen = None
    options = candidates(row, include_candle)
    for level, key in options:
        stats = groups.get((level, key))
        if stats and stats["n"] >= minimum:
            chosen = (level, key, stats)
            break
    if chosen is None:
        available = max((int(groups.get(option, {}).get("n", 0)) for option in options), default=0)
        return {"label": "PY PRIOR WATCH", "tier": "PRIOR", "confidence": 0, "samples": available, "groupLevel": None, "reason": f"Chưa đủ {minimum} mẫu paper duy nhất đã đóng; prior không được gắn GOOD."}
    level, key, stats = chosen
    m = summarize(stats)
    good = m["adjustedWr"] >= 58 and m["avgRoe"] >= 0.8 and m["profitFactorRoe"] >= 1.15 and m["slRate"] <= 45 and m["tailLossRate"] <= 30
    risk = m["adjustedWr"] <= 43 or m["avgRoe"] <= -1.5 or m["profitFactorRoe"] < 0.8 or m["slRate"] >= 55 or m["tailLossRate"] >= 40
    label, tier = ("PY GOOD", "GOOD") if good else ("PY RISK", "RISK") if risk else ("PY WATCH", "WATCH")
    confidence = min(100, round(35 + min(m["samples"], 60) / 60 * 45 + min(abs(m["adjustedWr"] - 50), 25) / 25 * 20))
    broad = level == "STAGE_SIDE"
    if broad:
        label, tier, confidence = "PY WATCH", "WATCH", min(confidence, 55)
    prefix = "Fallback stage+side rộng, chỉ tham khảo; " if broad else ""
    return {
        "label": label, "tier": tier, "confidence": confidence, "groupLevel": level, "groupKey": key, **m,
        "reason": f'{prefix}{level}: n={m["samples"]}, AdjWR={m["adjustedWr"]:.1f}%, AvgROE={m["avgRoe"]:+.1f}%, PF_ROE={m["profitFactorRoe"]:.2f}, SL={m["slRate"]:.1f}%, Tail={m["tailLossRate"]:.1f}%.',
    }


def signal_key(row: dict[str, Any]) -> str:
    f = feature(row)
    return "|".join((norm(row.get("symbol"), "UNKNOWN"), f["stage"], f["side"], f["tf"]))


def dedup_key(row: dict[str, Any]) -> str:
    opened = parse_dt(row.get("openedAt") or row.get("createdAt"))
    tf = timeframe(row)
    minutes = 5 if tf == "5m" else 15 if tf == "15m" else 60
    bucket = int(opened.timestamp() // (minutes * 60)) if opened else 0
    f = feature(row)
    return "|".join((norm(row.get("symbol"), "UNKNOWN"), f["stage"], f["side"], f["tf"], str(bucket)))


def learn(args: argparse.Namespace) -> dict[str, Any]:
    store = json.loads(Path(args.paper_file).read_text(encoding="utf-8"))
    all_rows = store.get("trades", []) if isinstance(store, dict) else store
    valid_from = parse_dt(args.valid_from)
    rolling = datetime.now(timezone.utc) - timedelta(days=max(1, args.lookback_days))
    start = max(filter(None, (valid_from, rolling)), default=rolling)
    cohort = []
    excluded = Counter()
    for row in all_rows:
        if not str(row.get("source") or "").startswith(SOURCE_PREFIX):
            excluded["nonEma"] += 1
            continue
        opened = parse_dt(row.get("openedAt") or row.get("createdAt"))
        if not opened or opened < start:
            excluded["beforeValidWindow"] += 1
            continue
        cohort.append(row)

    key_counts = Counter(dedup_key(row) for row in cohort if row.get("openedAt"))
    training_ids = {
        str(row.get("id")) for row in cohort
        if row.get("openedAt") and key_counts[dedup_key(row)] == 1 and norm(row.get("status")) == "CLOSED" and parse_dt(row.get("closedAt"))
    }
    excluded["duplicateSignalRows"] = sum(count for count in key_counts.values() if count > 1)

    groups: dict[tuple[str, str], dict[str, Any]] = defaultdict(empty_stats)
    trade_flags: dict[str, dict[str, Any]] = {}
    events = []
    for row in cohort:
        opened = parse_dt(row.get("openedAt") or row.get("createdAt"))
        closed = parse_dt(row.get("closedAt")) if str(row.get("id")) in training_ids else None
        if opened:
            events.append((opened, 0, "OPEN", row))
        if closed:
            events.append((closed, 1, "CLOSE", row))
    events.sort(key=lambda item: (item[0], item[1], str(item[3].get("id"))))
    for _, _, event, row in events:
        if event == "OPEN":
            trade_flags[str(row.get("id"))] = classify(groups, row, args.min_samples, True)
        else:
            for option in candidates(row, True):
                add(groups[option], row)

    signals = json.loads(args.signals_json or "[]")
    signal_flags = [
        {"key": signal_key(row), "symbol": row.get("symbol"), "stage": stage(row), **classify(groups, row, args.min_samples, False)}
        for row in signals
    ]
    global_stats = empty_stats()
    training_rows = [row for row in cohort if str(row.get("id")) in training_ids]
    for row in training_rows:
        add(global_stats, row)
    return {
        "schemaVersion": 1, "model": MODEL, "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "ANALYSIS_ONLY", "guardrail": "Không can thiệp detector, entry, margin, SL, TP hoặc lệnh thật.",
        "training": {
            "method": "CAUSAL_WALK_FORWARD_BETA_SHRINKAGE", "lookbackDays": args.lookback_days,
            "validFrom": start.isoformat(), "minSamples": args.min_samples,
            "rawCohort": len(cohort), "closedSamples": len(training_rows), "uniqueSignalRows": len(key_counts),
            "learnedGroups": sum(1 for value in groups.values() if value["n"] >= args.min_samples),
            "excluded": dict(excluded), "global": summarize(global_stats),
        },
        "signalFlags": signal_flags, "tradeFlags": trade_flags,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--paper-file", required=True)
    parser.add_argument("--signals-json", default="[]")
    parser.add_argument("--lookback-days", type=int, default=30)
    parser.add_argument("--min-samples", type=int, default=10)
    parser.add_argument("--valid-from", default="")
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()
    print(json.dumps(learn(args), ensure_ascii=False, indent=2 if args.pretty else None))


if __name__ == "__main__":
    main()
