"""Read-only trade/BTC attribution; writes reports only, never calls Binance."""
import bisect
import collections
import datetime as dt
import hashlib
import json
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = 'ALL_BOT_SIZE_ENTRY_TIME_BTC_AUDIT_V2_20261001'
FORECAST_VERSION = 'BTC_HOURLY_ENTRY_FORECAST_V3_ALL_SIZES_CLEAR_BEST_HOURS_20261001'
VN = dt.timezone(dt.timedelta(hours=7))
MAX_AGE = 600


def timestamp(value):
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()


def number(value):
    if value is None or value == '':
        return None
    return float(value)


def normalize_btc_trend(value):
    trend = str(value or '').strip().upper()
    return trend if trend in ('UP', 'DOWN', 'FLAT') else 'UNKNOWN'


def margin_label(value):
    margin = number(value)
    if margin is None:
        return 'UNKNOWN'
    return f'{margin:g} USDT'


def stats(rows):
    closed = [r for r in rows if r['position_status'] == 'CLOSED' and number(r['net_realized_pnl_usdt']) is not None]
    pnl = [float(r['net_realized_pnl_usdt']) for r in closed]
    wins, losses = [v for v in pnl if v > 0], [v for v in pnl if v < 0]
    return dict(entries=len(rows), closed=len(closed), open=sum(r['position_status'] != 'CLOSED' for r in rows),
                wins=len(wins), win_rate=round(100 * len(wins) / len(closed), 2) if closed else None,
                net=round(sum(pnl), 6), avg=round(sum(pnl) / len(pnl), 6) if pnl else None,
                pf=round(sum(wins) / -sum(losses), 3) if losses else None,
                closed_cycles=len(set(r['close_group_id'] for r in closed)))


def groups(rows, fields):
    buckets = collections.defaultdict(list)
    for row in rows:
        buckets[tuple(str(row.get(k, 'UNKNOWN')) for k in fields)].append(row)
    return [dict(zip(fields, key), **stats(values)) for key, values in sorted(buckets.items())]


def clamp(value, low, high):
    return max(low, min(high, value))


def forecast_stats(rows):
    """Descriptive quality score, deliberately not a win probability."""
    closed = [r for r in rows if r['position_status'] == 'CLOSED'
              and number(r['net_realized_pnl_usdt']) is not None]
    pnl = [float(r['net_realized_pnl_usdt']) for r in closed]
    roe = [number(r.get('realized_roe_pct')) for r in closed]
    roe = [value for value in roe if value is not None]
    wins = [value for value in pnl if value > 0]
    losses = [value for value in pnl if value < 0]
    smoothed_win = (len(wins) + 2) / (len(closed) + 4) if closed else .5
    profit_factor = (sum(wins) / -sum(losses)) if losses else (4 if wins else None)
    avg_roe = sum(roe) / len(roe) if roe else None
    roe_wins = [value for value in roe if value > 0]
    roe_losses = [value for value in roe if value < 0]
    roe_profit_factor = (sum(roe_wins) / -sum(roe_losses)) if roe_losses else (4 if roe_wins else None)
    score = None
    if len(closed) >= 3:
        # Mixed margin sizes must not let one large order dominate quality. Net/PF
        # in USDT remain descriptive, while quality uses equal-weight entry ROE.
        pf_term = clamp(__import__('math').log2(max(.25, min(4, roe_profit_factor or .25))), -2, 2)
        score = clamp(50 + (smoothed_win - .5) * 25
                      + clamp(avg_roe or 0, -5, 5) * 2 + pf_term * 7, 0, 100)
    return dict(
        entries=len(rows), closed=len(closed), wins=len(wins), losses=len(losses),
        winRate=round(100 * len(wins) / len(closed), 2) if closed else None,
        netPnl=round(sum(pnl), 6),
        avgNetPnl=round(sum(pnl) / len(pnl), 6) if pnl else None,
        avgRoe=round(avg_roe, 4) if avg_roe is not None else None,
        profitFactor=round(profit_factor, 3) if profit_factor is not None else None,
        roeProfitFactor=round(roe_profit_factor, 3) if roe_profit_factor is not None else None,
        qualityScore=round(score, 1) if score is not None else None,
        closedCycles=len(set(r['close_group_id'] for r in closed if r['close_group_id'])),
    )


def build_hourly_forecast(rows, metadata):
    eligible = [row for row in rows if row['position_status'] == 'CLOSED'
                and number(row['net_realized_pnl_usdt']) is not None]
    hourly = []
    for hour in range(24):
        hour_key = f'{hour:02}'
        sides = {}
        for direction in ('LONG', 'SHORT'):
            sides[direction] = forecast_stats([
                row for row in eligible
                if row['entry_hour_vn'] == hour_key and row['direction'] == direction
            ])
        hourly.append(dict(hourVn=hour, sides=sides))

    hourly_btc = []
    for hour in range(24):
        hour_key = f'{hour:02}'
        for btc_trend in ('UP', 'DOWN', 'FLAT'):
            sides = {}
            for direction in ('LONG', 'SHORT'):
                sides[direction] = forecast_stats([
                    row for row in eligible
                    if row['entry_hour_vn'] == hour_key
                    and row['direction'] == direction
                    and row['btc_context_valid']
                    and row['btc_trend'] == btc_trend
                ])
            hourly_btc.append(dict(hourVn=hour, btcTrend=btc_trend, sides=sides))

    hourly_btc_profile = []
    profiles = sorted(set(
        (row['btc_trend'], row['btc_momentum_15m_key'], row['btc_move_1h_key'])
        for row in eligible if row['btc_context_valid']
    ))
    for hour in range(24):
        hour_key = f'{hour:02}'
        for btc_trend, momentum15m, move1h in profiles:
            sides = {}
            for direction in ('LONG', 'SHORT'):
                sides[direction] = forecast_stats([
                    row for row in eligible
                    if row['entry_hour_vn'] == hour_key
                    and row['direction'] == direction
                    and row['btc_context_valid']
                    and row['btc_trend'] == btc_trend
                    and row['btc_momentum_15m_key'] == momentum15m
                    and row['btc_move_1h_key'] == move1h
                ])
            hourly_btc_profile.append(dict(
                hourVn=hour, btcTrend=btc_trend,
                btcMomentum15m=momentum15m, btcMove1h=move1h, sides=sides,
            ))

    hourly_margin = []
    margins = sorted(set(row['margin_bucket'] for row in eligible),
                     key=lambda value: number(value.split()[0]) or 0)
    for hour in range(24):
        hour_key = f'{hour:02}'
        for margin in margins:
            hourly_margin.append(dict(
                hourVn=hour,
                marginUsdt=number(margin.split()[0]),
                marginLabel=margin,
                sides={direction: forecast_stats([
                    row for row in eligible
                    if row['entry_hour_vn'] == hour_key
                    and row['direction'] == direction
                    and row['margin_bucket'] == margin
                ]) for direction in ('LONG', 'SHORT')},
            ))

    matched = sum(1 for row in eligible if row['btc_context_valid'])
    return dict(
        version=FORECAST_VERSION,
        generatedAt=dt.datetime.now(VN).isoformat(),
        timezone='Asia/Bangkok',
        observationOnly=True,
        affectsBinance=False,
        affectsEntry=False,
        affectsSize=False,
        affectsSl=False,
        affectsTp=False,
        sourceVersion=VERSION,
        coverage=dict(
            firstEntryVn=min((row['entry_vn'] for row in eligible), default=None),
            lastEntryVn=max((row['entry_vn'] for row in eligible), default=None),
            closedEntries=len(eligible),
            btcMatchedEntries=matched,
            btcMatchRate=round(100 * matched / len(eligible), 2) if eligible else None,
            marginSizes=[dict(
                marginUsdt=number(margin.split()[0]),
                label=margin,
                entries=len([row for row in eligible if row['margin_bucket'] == margin]),
            ) for margin in margins],
        ),
        thresholds=dict(baseMinClosed=12, btcConditionedMinClosed=6, btcProfileMinClosed=4,
                        minimumScore=53, minimumEdge=4),
        hourly=hourly,
        hourlyByBtcTrend=hourly_btc,
        hourlyByBtcProfile=hourly_btc_profile,
        hourlyByMargin=hourly_margin,
        methodology=(
            'All positive-margin filled Binance bot entries; DCA and manual-source entries excluded; '
            'only CLOSED rows with recorded net PnL are scored. Entry hour uses Asia/Bangkok. '
            'BTC is an as-of recorded engine snapshot where both loggedAt/evaluatedAt precede entry '
            'and evaluated age is <=600 seconds. qualityScore blends smoothed win frequency, average '
            'realized ROE and ROE profit factor so larger margin does not dominate; USDT net/PF remain '
            'descriptive. Exact hour + BTC trend + 15m momentum + 1h move samples require >=4 closes; '
            'BTC-trend samples require >=6 and unconditioned hour/side samples require >=12. '
            'The result is OBSERVE ONLY and never changes Binance entry, size, SL or TP.'
        ),
        legacyJson='Additive standalone cache; no existing snapshot or trade JSON is rewritten.',
        source=dict(
            auditSha256=metadata['audit_sha256'],
            marketSnapshotCount=metadata['snapshot_count'],
            maxBtcAgeSeconds=metadata['max_btc_age_seconds'],
        ),
    )


def main():
    audit_file = ROOT / 'data/binance-filled-signal-audit/binance-filled-signals.csv'
    raw = audit_file.read_bytes()
    all_rows = list(csv.DictReader(raw.decode('utf-8-sig').splitlines()))
    rows = [r for r in all_rows if (number(r['margin_usdt']) or 0) > 0 and r['is_dca'] == 'false'
            and r['signal_source'] != 'binance-manual-socket']
    close_counts = collections.Counter(r['close_group_id'] for r in all_rows if r['close_group_id'])
    entry_times = [timestamp(r['filled_at']) for r in rows]
    first, last = min(entry_times), max(entry_times)
    snapshots = {}
    malformed = 0
    with (ROOT / 'data/liquid-market-direction-signal-log.ndjson').open() as f:
        for line in f:
            try:
                obj = json.loads(line)
                logged = timestamp(obj['loggedAt'])
                market = obj.get('marketDirection') or {}
                evaluated = number(market.get('evaluatedAt'))
                if evaluated is None:
                    continue
                evaluated /= 1000
                available = max(logged, evaluated)
                if not first - MAX_AGE <= available <= last:
                    continue
                btc = market.get('btc') or {}
                if not btc:
                    continue
                snapshots[available] = dict(logged_at=obj['loggedAt'], evaluated_at=evaluated,
                    available_at=available, btc=btc, market_label=market.get('label'),
                    market_version=market.get('version'))
            except (ValueError, KeyError, TypeError):
                malformed += 1
    times = sorted(snapshots)
    for r, at in zip(rows, entry_times):
        local = dt.datetime.fromtimestamp(at, VN)
        r['entry_vn'] = local.isoformat(timespec='milliseconds')
        r['entry_day_vn'] = local.strftime('%Y-%m-%d')
        r['entry_hour_vn'] = f'{local.hour:02}'
        begin = local.hour // 3 * 3
        r['session_vn'] = f'{begin:02}:00–{begin+3:02}:00'
        r['cycle_entry_count'] = close_counts[r['close_group_id']] if r['close_group_id'] else None
        r['single_entry_closed_cycle'] = r['cycle_entry_count'] == 1
        r['margin_bucket'] = margin_label(r['margin_usdt'])
        idx = bisect.bisect_right(times, at) - 1
        snap = snapshots[times[idx]] if idx >= 0 else None
        age = at - snap['evaluated_at'] if snap else None
        r['btc_age_seconds'] = round(age, 3) if age is not None else None
        r['btc_available_at'] = snap['available_at'] if snap else None
        valid = age is not None and 0 <= age <= MAX_AGE
        r['btc_context_valid'] = valid
        r['btc_snapshot'] = snap if valid else None
        btc = snap['btc'] if valid else {}
        r['btc_trend'] = normalize_btc_trend(btc.get('trend'))
        r['market_label'] = snap['market_label'] if valid else 'UNKNOWN'
        ret = number(btc.get('ret1h'))
        r['btc_1h_move'] = 'UNKNOWN' if ret is None else 'UP >=0.3%' if ret >= .3 else 'DOWN <=-0.3%' if ret <= -.3 else 'SMALL_MOVE (-0.3,+0.3)%'
        r['btc_move_1h_key'] = 'UNKNOWN' if ret is None else 'UP_GE_0_3' if ret >= .3 else 'DOWN_LE_NEG_0_3' if ret <= -.3 else 'SMALL_MOVE'
        momentum = number(btc.get('ret15m'))
        r['btc_15m_move'] = 'UNKNOWN' if momentum is None else 'RISING' if momentum > 0 else 'FALLING' if momentum < 0 else 'FLAT'
        r['btc_momentum_15m_key'] = r['btc_15m_move']
        r['btc_trend_momentum'] = r['btc_trend'] + ' / 15m ' + r['btc_15m_move']
        if valid:
            assert snap['available_at'] <= at and snap['evaluated_at'] <= at
    recent = [r for r in rows if r['entry_day_vn'] >= '2026-09-27']
    impulse = [r for r in recent if r['signal_source'] == 'post-move-impulse']
    cohorts = dict(all_bot_sizes=rows, since_sep27=recent, impulse=impulse,
                   single_entry_closed=[r for r in rows if r['single_entry_closed_cycle']])
    summary = {}
    for name, values in cohorts.items():
        summary[name] = dict(overall=stats(values), matched=stats([r for r in values if r['btc_context_valid']]),
            missing=stats([r for r in values if not r['btc_context_valid']]),
            by_hour=groups(values, ['entry_hour_vn', 'direction']),
            by_hour_btc=groups(values, ['entry_hour_vn', 'btc_trend', 'direction']),
            by_hour_btc_profile=groups(values, ['entry_hour_vn', 'btc_trend', 'btc_momentum_15m_key', 'btc_move_1h_key', 'direction']),
            by_margin=groups(values, ['margin_bucket', 'direction']),
            by_hour_margin=groups(values, ['entry_hour_vn', 'margin_bucket', 'direction']),
            by_session=groups(values, ['session_vn', 'direction']),
            by_btc=groups(values, ['btc_trend', 'direction']),
            by_btc_move=groups(values, ['btc_1h_move', 'direction']),
            by_btc_momentum=groups(values, ['btc_trend_momentum', 'direction']),
            by_day=groups(values, ['entry_day_vn', 'direction']),
            by_session_btc=groups(values, ['session_vn', 'btc_trend', 'direction']),
            by_session_btc_move=groups(values, ['session_vn', 'btc_1h_move', 'direction']),
            by_signal_btc=groups(values, ['signal_type', 'btc_trend', 'direction']),
            by_day_btc=groups(values, ['entry_day_vn', 'btc_trend', 'direction']),
            by_day_session=groups(values, ['entry_day_vn', 'session_vn', 'direction']),
            btc_max_age_300s=groups([r for r in values if r['btc_context_valid'] and r['btc_age_seconds'] <= 300], ['btc_1h_move', 'direction']))
    metadata = dict(version=VERSION, generated_at=dt.datetime.now(VN).isoformat(),
        audit_sha256=hashlib.sha256(raw).hexdigest(), first_entry_vn=rows[0]['entry_vn'],
        last_entry_vn=rows[-1]['entry_vn'], snapshot_count=len(snapshots), malformed_log_lines=malformed,
        max_btc_age_seconds=MAX_AGE,
        methodology='Actual filled bot entry orders; all positive margin sizes; is_dca=false; exclude manual source. '
        'Net from audit includes recorded commissions and funding. Multiple entries in one position '
        'receive notional-weighted allocation. Not a portfolio return or independent cycle win rate. '
        'BTC as-of join requires both loggedAt and evaluatedAt <= filled_at; evaluated age <=600s. '
        'Recorded engine snapshot, not reconstructed closed-only candles or proof the entry bot used this context. '
        'Missing/stale BTC remains UNKNOWN. 1h +/-0.3% bands are descriptive, not live gates. '
        'OPEN PnL excluded. No API calls, no runtime/trade changes; legacy input unchanged.')
    out = ROOT / f'reports/all-size-entry-time-btc-{dt.datetime.now(VN).strftime("%Y%m%d")}'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'entries.json').write_text(json.dumps(dict(metadata=metadata, entries=rows), ensure_ascii=False, indent=2))
    (out / 'summary.json').write_text(json.dumps(dict(metadata=metadata, summary=summary), ensure_ascii=False, indent=2))
    forecast = build_hourly_forecast(rows, metadata)
    forecast_file = ROOT / 'data/btc-hourly-entry-forecast.json'
    forecast_tmp = forecast_file.with_suffix('.json.tmp')
    forecast_tmp.write_text(json.dumps(forecast, ensure_ascii=False, indent=2), encoding='utf-8')
    forecast_tmp.replace(forecast_file)
    lines = ['# Entry mọi size bot × giờ Việt Nam × tính chất BTC tại entry', '',
             f'Version: `{VERSION}` · cập nhật {metadata["generated_at"]}', '', metadata['methodology'], '',
             'BTC trend giữ nguyên nhãn engine đã lưu; SMALL_MOVE chỉ mô tả mức thay đổi giá 1h, không đồng nghĩa SIDEWAYS.', '',
             'PnL theo lượt entry, chưa gồm PnL thả nổi. Mẫu giờ/BTC có thể tập trung vào một ngày hoặc một phiên bản rule.', '']
    for name, report in summary.items():
        lines += [f'## {name}', '', f'Tổng: {report["overall"]}', '',
                  f'Ghép BTC hợp lệ: {report["matched"]}; thiếu/cũ: {report["missing"]}', '']
        for section in ['by_session', 'by_btc', 'by_btc_move', 'by_btc_momentum', 'by_margin', 'by_day', 'by_hour', 'by_hour_btc', 'by_hour_btc_profile', 'by_hour_margin', 'by_session_btc', 'by_session_btc_move', 'by_signal_btc', 'by_day_btc', 'by_day_session', 'btc_max_age_300s']:
            records = report[section]
            fields = [k for k in records[0] if k not in stats([])] if records else []
            columns = fields + ['entries', 'closed', 'open', 'win_rate', 'net', 'pf']
            lines += [f'### {section}', '', '| ' + ' | '.join(columns) + ' |', '| ' + ' | '.join(['---'] * len(columns)) + ' |']
            lines += ['| ' + ' | '.join('—' if r.get(k) is None else str(r[k]) for k in columns) + ' |' for r in records]
            lines.append('')
    lines += ['## Từng entry và BTC trước entry', '', '| Giờ VN | Coin | Hướng | Size | Tín hiệu | BTC trend | BTC 15m% | BTC 1h% | Tuổi BTC giây | Trạng thái | Net USDT |', '|---|---|---|---|---|---|---|---|---|---|---|']
    for r in rows:
        btc = (r['btc_snapshot'] or {}).get('btc', {})
        lines.append('| ' + ' | '.join(str(v) for v in [r['entry_vn'], r['symbol'], r['direction'], r['margin_bucket'], r['signal_type'], r['btc_trend'], btc.get('ret15m','—'), btc.get('ret1h','—'), r['btc_age_seconds'], r['position_status'], r['net_realized_pnl_usdt'] or '—']) + ' |')
    (out / 'report.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps(dict(metadata=metadata, cohorts={k:{s:v[s] for s in ['overall','matched','missing']} for k,v in summary.items()},
        impulse={k:summary['impulse'][k] for k in ['by_session','by_btc','by_btc_move','by_btc_momentum']}), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
