#!/usr/bin/env python3
"""Rank intraday signal combos from the project's paper-trade logs.

The script intentionally uses only Python's standard library.  It can be run
directly (BTC context is optional) or called by the Node web server.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable


UTC = timezone.utc
DERIVED_LOGS = {
    "recommended-paper-trades.json",
    "br-like-limit-paper-trades.json",
    "intraday-decision-paper-trades.json",
}


def number(value: Any, default: float | None = None) -> float | None:
    try:
        result = float(value)
        return result if math.isfinite(result) else default
    except (TypeError, ValueError):
        return default


def first_value(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return value
    return None


def parse_time(value: Any) -> datetime | None:
    if isinstance(value, (int, float)):
        stamp = float(value)
        if stamp > 10_000_000_000:
            stamp /= 1000
        try:
            return datetime.fromtimestamp(stamp, UTC)
        except (ValueError, OSError):
            return None
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(UTC)
    except ValueError:
        return None


def salvage_trade_objects(text: str) -> list[dict[str, Any]]:
    """Recover intact objects from a damaged top-level `trades` array."""
    marker = text.find('"trades"')
    start = text.find("[", marker if marker >= 0 else 0)
    if start < 0:
        return []
    decoder = json.JSONDecoder()
    pos = start + 1
    recovered: list[dict[str, Any]] = []
    length = len(text)
    while pos < length:
        while pos < length and text[pos] in " \t\r\n,":
            pos += 1
        if pos >= length or text[pos] == "]":
            break
        try:
            item, end = decoder.raw_decode(text, pos)
            if isinstance(item, dict):
                recovered.append(item)
            pos = end
        except json.JSONDecodeError:
            next_object = text.find("\n    {", pos + 1)
            if next_object < 0:
                break
            pos = text.find("{", next_object)
    return recovered


def rows_from_json(path: Path) -> tuple[list[dict[str, Any]], str | None]:
    payload = None
    last_error: Exception | None = None
    text = ""
    # The scanner updates large JSON stores while this script is reading them.
    # Retry a short-lived partial write instead of silently treating it as zero rows.
    for attempt in range(6):
        try:
            text = path.read_text(encoding="utf-8")
            payload = json.loads(text)
            last_error = None
            break
        except (OSError, json.JSONDecodeError) as error:
            last_error = error
            if attempt < 5:
                time.sleep(0.15 * (attempt + 1))
    if last_error is not None:
        recovered = salvage_trade_objects(text)
        if recovered:
            return recovered, f"RECOVERED {len(recovered)} rows after {type(last_error).__name__}"
        return [], f"FAILED {type(last_error).__name__}: {last_error}"
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        rows = next((payload[key] for key in ("trades", "rows", "items") if isinstance(payload.get(key), list)), [])
    else:
        rows = []
    return [row for row in rows if isinstance(row, dict)], None


def source_name(path: Path) -> str:
    if path.name == "paper-trades.json":
        return "paper"
    return path.name.removesuffix("-paper-trades.json").removesuffix(".json")


def normalize_part(value: Any, fallback: str = "-") -> str:
    text = re.sub(r"\s+", "_", str(value if value not in (None, "") else fallback).strip())
    text = text.replace("|", "_").upper()[:96]
    return text or fallback


def is_ema_trade(row: dict[str, Any]) -> bool:
    source = str(row.get("source") or "")
    return source.startswith("emasq-") or "ema-squeeze" in source or bool(row.get("emaStageGateLabel"))


def side_of(row: dict[str, Any]) -> str:
    side = str(first_value(row, "side", "direction", "signalSide") or "").upper()
    if side in {"BUY", "LONG"}:
        return "LONG"
    if side in {"SELL", "SHORT"}:
        return "SHORT"
    return "UNKNOWN"


def timeframe_of(row: dict[str, Any]) -> str:
    direct = first_value(row, "timeframe", "tf", "pumpSignalTimeframe", "interval")
    if direct:
        return str(direct)
    match = re.search(r"(?:^|-)(\d+[mhd])(?:-|$)", str(row.get("source") or ""), re.I)
    return match.group(1) if match else "-"


def signal_type_of(row: dict[str, Any], source: str) -> str:
    direct = first_value(row, "signalType", "pumpSignalType", "setupType", "stage", "type")
    if direct:
        return str(direct).replace("_", " ").strip()
    raw_source = str(row.get("source") or "")
    ema_stages = (
        ("br_like_short", "BR-like Short"), ("br_like", "BR-like"),
        ("pre_breakout", "Pre Breakout"), ("pre_breakdown", "Pre Breakdown"),
        ("breakout", "Breakout"), ("breakdown", "Breakdown"),
        ("squeeze_short", "Squeeze Short"), ("squeeze", "Squeeze"),
        ("runner", "Runner"),
    )
    for token, label in ema_stages:
        if token in raw_source:
            return label
    return source.replace("-", " ").title()


def score_bucket(row: dict[str, Any]) -> str:
    source_score = re.search(r"-(\d{2,5})(?:-|$)", str(row.get("source") or ""))
    score = number(first_value(row, "score", "signalScore", "qualityScore") or (source_score.group(1) if source_score else None))
    if score is None:
        return "NO SCORE"
    if score > 1000:
        score /= 100
    elif score > 100:
        score /= 10
    floor = 90 if score >= 90 else 80 if score >= 80 else 70 if score >= 70 else 60 if score >= 60 else 0
    return f"{floor}+" if floor else "<60"


def btc_direction_of(row: dict[str, Any]) -> str:
    health = row.get("btcHealth") if isinstance(row.get("btcHealth"), dict) else {}
    raw = first_value(health, "btcTrendDir", "trendDir") or first_value(row, "btcTrendDir", "trendDir")
    text = str(raw or "").upper()
    if text in {"UP", "BULL", "BULLISH"}:
        return "UP"
    if text in {"DOWN", "BEAR", "BEARISH"}:
        return "DOWN"
    pct = number(first_value(health, "pct6h") or row.get("btcPct6h"))
    if pct is not None:
        return "UP" if pct > 0.15 else "DOWN" if pct < -0.15 else "FLAT"
    return "NO_DATA"


def btc_phase_of(row: dict[str, Any]) -> str:
    health = row.get("btcHealth") if isinstance(row.get("btcHealth"), dict) else {}
    direction = btc_direction_of(row)
    if direction == "NO_DATA":
        return "BTC_NO_DATA"
    score = number(first_value(health, "btcTrendScore") or row.get("btcTrendScore"))
    strength = "NO_SCORE" if score is None else "WEAK" if score < 45 else "MID" if score < 65 else "STRONG"
    return f"BTC_{direction}_{strength}"


def ema_combo_of(row: dict[str, Any]) -> str:
    stage = signal_type_of(row, "ema")
    side = side_of(row)
    timeframe = timeframe_of(row)
    corr = number(row.get("btcCorr"))
    corr_bucket = "BTC_CORR_NO_DATA" if corr is None else "BTC_CORR_RAC" if corr < 0.3 else "BTC_CORR_YEU" if corr < 0.5 else "BTC_CORR_THEO"
    phase = btc_phase_of(row)
    direction_match = re.match(r"^BTC_(UP|DOWN|FLAT)_", phase)
    direction = direction_match.group(1) if direction_match else ""
    expected = "UP" if side == "LONG" else "DOWN" if side == "SHORT" else ""
    if corr is not None and corr < 0.3:
        relation = "DOC_LAP"
    elif corr is not None and corr < 0.5:
        relation = "THEO_YEU"
    elif direction and expected:
        relation = "THUAN_BTC" if direction == expected else "NGUOC_BTC"
    else:
        relation = "REL_NO_DATA"
    gate = next((row.get(key) for key in (
        "emaStageGateLabel", "breakoutMarketRegimeLabel", "breakoutChaseLabel",
        "breakoutBtcTurnClusterLabel", "runnerPreWeakLabel", "runnerSessionTestLabel",
        "brMarketRegimeLabel",
    ) if row.get(key)), None)
    if not gate:
        note_match = re.search(r"(?:emaStageGate|breakoutMarketRegime|breakoutChase|runnerPreGate|marketRegime)=([^|]+)", str(row.get("note") or ""), re.I)
        gate = note_match.group(1).strip() if note_match else "-"
    return " | ".join((stage, side, timeframe, corr_bucket, phase, relation, f"GATE_{normalize_part(gate)}"))


def combo_of(row: dict[str, Any], source: str) -> str:
    direct = first_value(row, "combo", "pumpCombo", "signalCombo", "recommendationCombo")
    if direct:
        return re.sub(r"\s+", " ", str(direct).strip())[:420]
    if source in {"pump", "ema"} and is_ema_trade(row):
        return ema_combo_of(row)
    return " | ".join((signal_type_of(row, source), side_of(row), timeframe_of(row), score_bucket(row)))


def margin_bucket_of(row: dict[str, Any]) -> str:
    margin = number(first_value(row, "marginUsdt", "marginUsd", "margin", "orderUsdt"))
    if margin is None or margin <= 0:
        return "OTHER"
    if 9.5 <= margin <= 10.5:
        return "TEST $10"
    if margin <= 1.01:
        return "TEST $1"
    return f"TEST ${margin:g}"


def close_result(row: dict[str, Any]) -> tuple[bool, int, float, float]:
    status = str(row.get("status") or "").upper()
    outcome = str(row.get("outcome") or status).upper()
    pnl = number(first_value(row, "pnl", "realizedPnl", "netPnl"), 0.0) or 0.0
    roe = number(first_value(row, "roe", "roePct", "returnPct"), 0.0) or 0.0
    is_open = status in {"OPEN", "PENDING", "WAITING", "ACTIVE", "NEW"}
    closed = not is_open and (status in {"CLOSED", "TP", "SL", "WIN", "LOSS", "BE", "BREAKEVEN"} or outcome in {"TP", "SL", "WIN", "LOSS", "BE", "BREAKEVEN"} or pnl != 0 or roe != 0)
    if not closed:
        return False, 0, pnl, roe
    # A trailing stop is often stored as outcome=SL even after it has locked a
    # positive PnL. Match the dashboards: realized economics wins over the label.
    if pnl > 1e-12 or (abs(pnl) <= 1e-12 and roe > 1e-12):
        result = 1
    elif pnl < -1e-12 or (abs(pnl) <= 1e-12 and roe < -1e-12):
        result = -1
    elif outcome in {"TP", "WIN", "TAKE_PROFIT"}:
        result = 1
    elif outcome in {"SL", "LOSS", "STOP_LOSS"}:
        result = -1
    else:
        result = 0
    return True, result, pnl, roe


def current_btc(raw: dict[str, Any]) -> dict[str, Any]:
    direction = str(raw.get("btcTrendDir") or "flat").upper()
    direction = direction if direction in {"UP", "DOWN"} else "FLAT"
    score = number(raw.get("btcTrendScore"), 0.0) or 0.0
    strength = "STRONG" if score >= 65 else "MID" if score >= 45 else "WEAK"
    pct6h = number(raw.get("pct6h"))
    shock = bool((raw.get("macroShock") or {}).get("active")) if isinstance(raw.get("macroShock"), dict) else False
    phase = f"BTC_{direction}_{strength}"
    return {
        "phase": phase, "direction": direction, "strength": strength,
        "trendScore": round(score, 1), "pct6h": pct6h,
        "price": number(raw.get("price")), "rsi1h": number(raw.get("rsi1h")),
        "emaTrend1h": raw.get("emaTrend1h"), "bias": raw.get("bias", "neutral"),
        "bullBias": raw.get("bullBias", "neutral"), "macroShock": shock,
        "seeding": bool(raw.get("seeding")), "updatedAt": raw.get("updatedAt"),
    }


def mean(values: Iterable[float]) -> float:
    items = list(values)
    return sum(items) / len(items) if items else 0.0


def median(values: Iterable[float]) -> float:
    items = sorted(values)
    if not items:
        return 0.0
    middle = len(items) // 2
    return items[middle] if len(items) % 2 else (items[middle - 1] + items[middle]) / 2


def rank_groups(records: list[dict[str, Any]], btc: dict[str, Any], min_closed: int, limit: int, now: datetime) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        groups[(record["source"], record["combo"], record["side"], record["marginBucket"])].append(record)

    ranked: list[dict[str, Any]] = []
    for (source, combo, side, margin_bucket), items in groups.items():
        closed = [item for item in items if item["closed"]]
        if len(closed) < min_closed:
            continue
        wins = sum(item["result"] == 1 for item in closed)
        losses = sum(item["result"] == -1 for item in closed)
        breakeven = len(closed) - wins - losses
        decisive = wins + losses
        wr = wins / decisive * 100 if decisive else 0.0
        avg_roe = mean(item["roe"] for item in closed)
        pnl = sum(item["pnl"] for item in closed)
        positive_roes = [item["roe"] for item in closed if item["roe"] > 1e-12]
        negative_roes = [abs(item["roe"]) for item in closed if item["roe"] < -1e-12]
        median_roe = median(item["roe"] for item in closed)
        median_win_roe = median(positive_roes)
        gross_profit = sum(item["pnl"] for item in closed if item["pnl"] > 0)
        gross_loss = abs(sum(item["pnl"] for item in closed if item["pnl"] < 0))
        profit_factor = gross_profit / gross_loss if gross_loss > 1e-12 else None
        worst_loss_roe = max(negative_roes, default=0.0)
        tail_loss_ratio = worst_loss_roe / median_win_roe if median_win_roe > 1e-12 else None
        recent = [item for item in closed if item["at"] and item["at"] >= now - timedelta(days=7)]
        recent_wins = sum(item["result"] == 1 for item in recent)
        recent_losses = sum(item["result"] == -1 for item in recent)
        recent_wr = (recent_wins / (recent_wins + recent_losses) * 100) if recent_wins + recent_losses else None
        same_phase = [item for item in closed if item["btcDirection"] == btc["direction"]]
        phase_wins = sum(item["result"] == 1 for item in same_phase)
        phase_losses = sum(item["result"] == -1 for item in same_phase)
        phase_wr = (phase_wins / (phase_wins + phase_losses) * 100) if phase_wins + phase_losses else None

        # Bayesian WR prevents a tiny perfect sample from dominating; the rest rewards
        # positive expectancy, fresh evidence and a sample that matches today's BTC.
        bayes_wr = (wins + 2) / (decisive + 4) * 100
        sample_conf = min(1.0, math.log1p(len(closed)) / math.log(31))
        roe_score = max(-1.0, min(1.0, avg_roe / 8.0))
        pnl_score = max(-1.0, min(1.0, pnl / max(1.0, len(closed)) / 0.12))
        freshness = min(1.0, len(recent) / 5.0)
        score = bayes_wr * 0.55 + (roe_score + 1) * 10 + (pnl_score + 1) * 5 + sample_conf * 10 + freshness * 5

        expected = "UP" if side == "LONG" else "DOWN" if side == "SHORT" else "FLAT"
        aligned = btc["direction"] == expected and expected != "FLAT"
        counter = btc["direction"] not in {"FLAT", expected} and expected != "FLAT"
        trend_bonus = 0.0
        if aligned:
            trend_bonus = 10 if btc["strength"] == "STRONG" else 6 if btc["strength"] == "MID" else 3
        elif counter:
            trend_bonus = -15 if btc["strength"] == "STRONG" else -9 if btc["strength"] == "MID" else -4
        if phase_wr is not None and len(same_phase) >= 3:
            trend_bonus += max(-8, min(8, (phase_wr - 50) * 0.2))
        if btc["macroShock"]:
            trend_bonus -= 10
        score = max(0.0, min(100.0, score + trend_bonus))

        # Robustness penalties: high WR with tiny wins can hide a single loss
        # that erases dozens of winners. Do not let that profile qualify as A.
        if 0 <= avg_roe < 3:
            score -= (3 - avg_roe) / 3 * 8
        if median_roe < 1:
            score -= min(4, 1 - median_roe if median_roe >= 0 else 4)
        if tail_loss_ratio is not None and tail_loss_ratio > 10:
            score -= min(12, (tail_loss_ratio - 10) * 0.6)
        score = max(0.0, min(100.0, score))

        robust_a = (
            score >= 78 and decisive >= 8 and bayes_wr >= 60
            and avg_roe >= 3 and median_roe >= 0.75
            and (profit_factor is None or profit_factor >= 1.5)
            and (tail_loss_ratio is None or tail_loss_ratio <= 10)
            and not (counter and btc["strength"] == "STRONG")
        )
        if robust_a:
            grade, action, size = "A", "ƯU TIÊN", "0.75R" if len(closed) < 12 else "1.0R"
        elif score >= 62 and bayes_wr >= 53 and avg_roe > 0 and (profit_factor is None or profit_factor >= 1):
            grade, action = "B", "CÓ THỂ ĐÁNH"
            size = "0.25R" if tail_loss_ratio is not None and tail_loss_ratio > 10 else "0.5R"
        else:
            grade, action, size = "C", "CHỈ THEO DÕI", "0.25R"
        if btc["macroShock"]:
            action, size = "TẠM DỪNG - BTC SHOCK", "0R"

        pf_label = "∞" if profit_factor is None and gross_profit > 0 else f"{profit_factor:.2f}" if profit_factor is not None else "-"
        tail_label = f"{tail_loss_ratio:.1f}x" if tail_loss_ratio is not None else "-"
        reasons = [
            f"WR hiệu chỉnh {bayes_wr:.1f}% trên {len(closed)} lệnh đóng",
            f"Avg ROE {avg_roe:+.2f}% · PnL {pnl:+.3f}",
            f"Median ROE {median_roe:+.2f}% · PF {pf_label} · Tail {tail_label}",
        ]
        reasons.append("thuận xu hướng BTC hiện tại" if aligned else "ngược xu hướng BTC hiện tại" if counter else "BTC đang đi ngang")
        if phase_wr is not None:
            reasons.append(f"WR lịch sử cùng hướng BTC {phase_wr:.1f}% ({len(same_phase)} mẫu)")
        risks = []
        if len(closed) < 8: risks.append("mẫu còn nhỏ")
        if recent_wr is not None and recent_wr + 12 < wr: risks.append("7 ngày gần đây yếu hơn lịch sử")
        if avg_roe < 3: risks.append("Avg ROE dưới 3%")
        if tail_loss_ratio is not None and tail_loss_ratio > 10: risks.append(f"tail-loss {tail_loss_ratio:.1f}x median win")
        if counter: risks.append("combo ngược hướng BTC")
        if btc["macroShock"]: risks.append("BTC macro shock đang hoạt động")

        ranked.append({
            "source": source, "combo": combo, "signalType": items[0]["signalType"], "marginBucket": margin_bucket,
            "side": side, "timeframe": items[0]["timeframe"], "scoreBucket": items[0]["scoreBucket"],
            "total": len(items), "closed": len(closed), "wins": wins, "losses": losses, "breakeven": breakeven,
            "wr": round(wr, 2), "adjustedWr": round(bayes_wr, 2), "avgRoe": round(avg_roe, 3), "pnl": round(pnl, 4),
            "medianRoe": round(median_roe, 3), "medianWinRoe": round(median_win_roe, 3),
            "profitFactor": round(profit_factor, 3) if profit_factor is not None else None,
            "worstLossRoe": round(worst_loss_roe, 3), "tailLossRatio": round(tail_loss_ratio, 2) if tail_loss_ratio is not None else None,
            "recentClosed": len(recent), "recentWr": round(recent_wr, 2) if recent_wr is not None else None,
            "sameBtcPhaseClosed": len(same_phase), "sameBtcPhaseWr": round(phase_wr, 2) if phase_wr is not None else None,
            "btcAligned": aligned, "predictionScore": round(score, 1), "grade": grade,
            "action": action, "suggestedSize": size, "reasons": reasons, "risks": risks,
        })
    ranked.sort(key=lambda row: (row["predictionScore"], row["closed"], row["avgRoe"]), reverse=True)
    for index, row in enumerate(ranked[:limit], 1):
        row["rank"] = index
    return ranked[:limit]


def analyze(data_dir: Path, btc_raw: dict[str, Any], days: int, min_closed: int, limit: int, include_derived: bool) -> dict[str, Any]:
    now = datetime.now(UTC)
    cutoff = now - timedelta(days=days)
    files = sorted(set(data_dir.glob("*-paper-trades.json")) | ({data_dir / "paper-trades.json"} if (data_dir / "paper-trades.json").exists() else set()))
    if not include_derived:
        files = [path for path in files if path.name not in DERIVED_LOGS]
    records: list[dict[str, Any]] = []
    coverage = []
    invalid_time = 0
    read_errors: list[str] = []
    recovered_sources: list[str] = []
    for path in files:
        rows, read_error = rows_from_json(path)
        source = source_name(path)
        if read_error:
            target = recovered_sources if read_error.startswith("RECOVERED") else read_errors
            target.append(f"{path.name}: {read_error}")
        used = 0
        closed_count = 0
        for row in rows:
            at = parse_time(first_value(row, "createdAt", "openedAt", "time", "timestamp", "closedAt", "updatedAt"))
            if at is None:
                invalid_time += 1
                continue
            if at < cutoff or at > now + timedelta(minutes=5):
                continue
            closed, result, pnl, roe = close_result(row)
            record = {
                "source": source, "combo": combo_of(row, source), "side": side_of(row),
                "signalType": signal_type_of(row, source), "timeframe": timeframe_of(row),
                "scoreBucket": score_bucket(row), "btcDirection": btc_direction_of(row),
                "marginBucket": margin_bucket_of(row), "at": at, "closed": closed, "result": result, "pnl": pnl, "roe": roe,
            }
            records.append(record)
            used += 1
            closed_count += int(closed)
        coverage.append({"source": source, "file": path.name, "rows": len(rows), "inWindow": used, "closed": closed_count, "readError": read_error})

    btc = current_btc(btc_raw)
    recommendations = rank_groups(records, btc, min_closed, limit, now)
    qualified = sum(row["grade"] in {"A", "B"} for row in recommendations)
    warnings = []
    if recovered_sources:
        warnings.append("Đã khôi phục tạm các object còn nguyên từ nguồn JSON lỗi: " + ", ".join(item.split(":", 1)[0] for item in recovered_sources))
    if read_errors:
        warnings.append(f"Không đọc được {len(read_errors)} nguồn đang được ghi; kết quả hiện tại chưa đầy đủ: " + ", ".join(item.split(":", 1)[0] for item in read_errors))
    if btc["seeding"]: warnings.append("BTC health đang seed dữ liệu; xếp hạng tạm dùng trạng thái FLAT.")
    if invalid_time: warnings.append(f"Bỏ qua {invalid_time} dòng không có timestamp hợp lệ.")
    if not records: warnings.append("Không có trade-log hợp lệ trong cửa sổ đã chọn.")
    warnings.append("Đây là xếp hạng thống kê từ paper-log, không phải cam kết lợi nhuận hay lệnh tự động.")
    return {
        "generatedAt": now.isoformat(), "lookbackDays": days, "minClosed": min_closed,
        "window": {"from": cutoff.isoformat(), "to": now.isoformat()}, "btc": btc,
        "summary": {"sources": len(files), "trades": len(records), "closed": sum(item["closed"] for item in records), "ranked": len(recommendations), "qualified": qualified},
        "recommendations": recommendations, "coverage": coverage, "warnings": warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Rank intraday combos from paper-trade logs")
    parser.add_argument("--data-dir", default=str(Path(__file__).resolve().parents[1] / "data"))
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--min-closed", type=int, default=3)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--btc-json", default="{}")
    parser.add_argument("--include-derived", action="store_true")
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()
    try:
        btc_raw = json.loads(args.btc_json)
        if not isinstance(btc_raw, dict):
            btc_raw = {}
    except json.JSONDecodeError:
        btc_raw = {}
    payload = analyze(Path(args.data_dir), btc_raw, max(1, min(args.days, 365)), max(1, min(args.min_closed, 100)), max(1, min(args.limit, 100)), args.include_derived)
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2 if args.pretty else None)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
