"""Causal, independent research. No runtime imports, trading APIs or credentials."""
import bisect
from collections import defaultdict, Counter
from datetime import datetime, timezone, timedelta
import json
import math
from pathlib import Path
import random
import statistics as st

ROOT = Path(__file__).resolve().parents[1] / 'data/research/btc-session-20260926'
VN = timezone(timedelta(hours=7))
STEP = 300000
VERSION = 'BTC_SESSION_CONTINUATION_RESEARCH_V1_20260926'


def stamp(s):
    return int(datetime.fromisoformat(s).replace(tzinfo=VN).timestamp() * 1000)


START, SPLIT, END = map(stamp, ['2026-08-02', '2026-09-12', '2026-09-26'])


def local(t):
    return datetime.fromtimestamp(t / 1000, VN)


def session(t):
    h = local(t).hour
    return '06-08' if 6 <= h < 8 else '20-02' if h >= 20 or h < 2 else 'other'


def phase(t):
    return 'holdout' if t >= SPLIT else 'development'


def mean(v):
    return st.fmean(v) if v else None


def quantile(v, q):
    if not v:
        return None
    v = sorted(v)
    f = (len(v) - 1) * q
    lo = int(f)
    return v[lo] + (v[min(lo + 1, len(v)-1)] - v[lo]) * (f - lo)


def aggregate(rows, count):
    groups = defaultdict(list)
    width = STEP * count
    for r in rows:
        groups[r[0] // width * width].append(r)
    out = []
    for t, g in sorted(groups.items()):
        if len(g) != count or any(r[0] != t + i * STEP for i, r in enumerate(g)):
            continue
        out.append([t, g[0][1], max(r[2] for r in g), min(r[3] for r in g),
                    g[-1][4], sum(r[5] for r in g), sum(r[6] for r in g)])
    return out


def ema(values, length):
    out, previous = [], values[0]
    alpha = 2 / (length + 1)
    for v in values:
        previous += alpha * (v - previous)
        out.append(previous)
    return out


def btc_features(rows):
    closes = [r[4] for r in rows]
    e13, e25 = ema(closes, 13), ema(closes, 25)
    impulses = {1: [], -1: []}
    out = {}
    for i, r in enumerate(rows):
        for side in (1, -1):
            prev = rows[max(0, i-6):i]
            impulses[side].append(bool(i >= 25 and
                (r[4] > max(p[2] for p in prev) if side == 1 else r[4] < min(p[3] for p in prev))
                and r[5] >= 1.2 * mean([p[5] for p in rows[i-20:i]])))
        if i < 30 or r[0] - rows[i-30][0] != 30 * STEP:
            continue
        ret = r[4] / rows[i-12][4] - 1
        out[r[0] + STEP] = {
            'trendLong': r[4] > e25[i] and e13[i] > e25[i] and ret > 0,
            'trendShort': r[4] < e25[i] and e13[i] < e25[i] and ret < 0,
            'impulseLong': any(impulses[1][i-2:i+1]),
            'impulseShort': any(impulses[-1][i-2:i+1]),
            'return1hPct': ret * 100,
        }
    return out


def execute(rows, index, side, stop, target, maxbars=72):
    if index + maxbars > len(rows):
        return None
    future = rows[index:index+maxbars]
    if any(r[0] != future[0][0] + j * STEP for j, r in enumerate(future)):
        return None
    raw_entry = future[0][1]
    entry = raw_entry * (1 + side * .0003)
    risk = side * (entry - stop)
    reward = side * (target - entry)
    if risk <= 0 or not .003 <= risk / entry <= .05 or reward / risk < 1.5:
        return None
    exitraw, reason, used = future[-1][4], 'TIME', len(future)
    for j, r in enumerate(future):
        stophit = r[3] <= stop if side == 1 else r[2] >= stop
        tphit = r[2] >= target if side == 1 else r[3] <= target
        if stophit:
            exitraw = min(stop, r[1]) if side == 1 else max(stop, r[1])
            reason, used = ('SL_BOTH' if tphit else 'SL'), j + 1
            break
        if tphit:
            exitraw, reason, used = target, 'TP', j + 1
            break
    exitfill = exitraw * (1 - side * .0003)
    gross = side * (exitfill / entry - 1) * 100
    fees = .05 * (1 + exitfill / entry)
    return {'entryTime': future[0][0], 'exitTime': future[used-1][0] + STEP,
            'entry': entry, 'exit': exitfill, 'stop': stop, 'target': target,
            'plannedRR': reward / risk, 'reason': reason, 'holdMinutes': used * 5,
            'netPct': gross - fees, 'stressNetPct': gross - fees - .14,
            'feesPct': fees}


def events_and_trades(symbol, rows, btc):
    f15 = aggregate(rows, 3)
    end_index = {r[0] + STEP: i for i, r in enumerate(rows)}
    trs = [r[2] - r[3] if i == 0 else max(r[2] - r[3], abs(r[2] - f15[i-1][4]), abs(r[3] - f15[i-1][4])) for i, r in enumerate(f15)]
    candidates, events = [], []
    for k in range(20, len(f15)):
        p = f15[k]
        closed = p[0] + 3 * STEP
        if not START <= closed < END or p[0] - f15[k-20][0] != 20 * 3 * STEP:
            continue
        side = 1 if p[4] > p[1] else -1
        a = mean(trs[k-14:k])
        span = p[2] - p[3]
        b = max(r[2] for r in f15[k-12:k]) if side == 1 else min(r[3] for r in f15[k-12:k])
        if a <= 0 or abs(p[4] / p[1] - 1) < .01 or span < 1.8 * a:
            continue
        if p[5] < 1.8 * mean([r[5] for r in f15[k-20:k]]):
            continue
        if (p[2] - p[4] if side == 1 else p[4] - p[3]) > .25 * span or side * (p[4] - b) <= 0:
            continue
        ix = end_index.get(closed)
        if ix is None:
            continue
        event = {'symbol': symbol, 'side': 'LONG' if side == 1 else 'SHORT', 'time': closed,
                 'day': str(local(closed).date()), 'phase': phase(closed), 'session': session(closed),
                 'breakout': b, 'atr15': a, 'bodyPct': (p[4] / p[1] - 1) * 100,
                 'retested': False, 'triggered': False, 'invalidated': False}
        # Complete window is necessary to classify event non-retest fairly.
        if ix + 144 >= len(rows) or rows[ix+144][0] - rows[ix][0] != 144 * STEP:
            event['incomplete12h'] = True
        peak = p[2] if side == 1 else p[3]
        extreme, touched = None, False
        for j in range(ix + 1, min(ix + 145, len(rows))):
            r = rows[j]
            if r[0] != rows[ix][0] + (j-ix) * STEP:
                break
            if side * (r[4] - b) < -a:
                event['invalidated'] = True
                break
            peak = max(peak, r[2]) if side == 1 else min(peak, r[3])
            edge = r[3] if side == 1 else r[2]
            extreme = edge if extreme is None else (min(extreme, edge) if side == 1 else max(extreme, edge))
            overlaps = r[3] <= b + .5 * a and r[2] >= b - .5 * a
            contraction = mean([x[5] for x in rows[j-2:j+1]]) <= .8 * p[5] / 3
            if overlaps and side * (r[4] - b) >= -.25 * a and contraction:
                touched = True
                event['retested'] = True
            if not touched or j < 20 or r[5] <= 0:
                continue
            prevlevel = max(x[2] for x in rows[j-3:j]) if side == 1 else min(x[3] for x in rows[j-3:j])
            taker = r[6] / r[5] if side == 1 else 1 - r[6] / r[5]
            if not (side * (r[4] - prevlevel) > 0 and side * (r[4] - r[1]) > 0
                    and r[5] >= 1.2 * mean([x[5] for x in rows[j-20:j]]) and taker >= .5
                    and abs(r[4] - b) <= a):
                continue
            signal = r[0] + STEP
            if not START <= signal < END:
                break
            stop = extreme - side * .25 * a
            outcome = execute(rows, j+1, side, stop, peak)
            if not outcome:
                continue
            # Uniform six-hour embargo, independent of whether this trade wins fast.
            if SPLIT - 72 * STEP <= signal < SPLIT:
                continue
            bf = btc.get(signal)
            if not bf:
                continue
            direction = 'Long' if side == 1 else 'Short'
            candidates.append({**event, **outcome, 'signalTime': signal,
                'day': str(local(signal).date()), 'phase': phase(signal), 'session': session(signal),
                'btcTrend': bf['trend' + direction], 'btcImpulse': bf['impulse' + direction],
                'btc1hPct': bf['return1hPct']})
            event['triggered'] = True
            break
        events.append(event)
    # Independent episode candidates are de-duplicated by actual entry chronology.
    trades, busy = [], -1
    for t in sorted(candidates, key=lambda t: (t['entryTime'], t['time'])):
        if t['entryTime'] < busy:
            continue
        trades.append(t)
        busy = t['exitTime']
    return events, trades


def bootstrap_clusters(items, key='netPct', repeats=1200):
    clusters = defaultdict(list)
    for x in items:
        clusters[x['day']].append(x[key])
    groups = list(clusters.values())
    if len(groups) < 2:
        return None
    rng, means = random.Random(20260926), []
    # Sample days; retain within-day correlation, weight trade mean by sampled N.
    totals = [(sum(g), len(g)) for g in groups]
    for _ in range(repeats):
        sampled = rng.choices(totals, k=len(totals))
        means.append(sum(x[0] for x in sampled) / sum(x[1] for x in sampled))
    return [quantile(means, .025), quantile(means, .975)]


def summary(trades):
    if not trades:
        return {'n': 0}
    vals = [t['netPct'] for t in trades]
    gain, loss = sum(x for x in vals if x > 0), -sum(x for x in vals if x < 0)
    days = Counter(t['day'] for t in trades)
    return {'n': len(vals), 'days': len(days), 'winPct': 100 * sum(x > 0 for x in vals) / len(vals),
            'meanNetPct': mean(vals), 'medianNetPct': st.median(vals),
            'profitFactor': gain / loss if loss else None, 'sumTradeNetPct': sum(vals),
            'meanStressPct': mean([t['stressNetPct'] for t in trades]),
            'ci95DayCluster': bootstrap_clusters(trades), 'exitReasons': dict(Counter(t['reason'] for t in trades)),
            'maxDaySharePct': max(days.values()) / len(vals) * 100,
            'meanHoldMinutes': mean([t['holdMinutes'] for t in trades])}


def hourly_summary(rows):
    if not rows:
        return {'hours': 0}
    keys = ['btcAbsPct', 'btcRangePct', 'altAbsPct', 'altPumpRate', 'altDumpRate', 'altMeanPct']
    return {'hours': len(rows), **{k: mean([r[k] for r in rows]) for k in keys},
            'btcUpPct': mean([100 * (r['btcPct'] > 0) for r in rows]),
            'medianAltAbsPct': st.median([r['altAbsPct'] for r in rows])}


def paired_session_ci(rows, name, metric):
    daily = defaultdict(lambda: defaultdict(list))
    for r in rows:
        daily[r['day']][r['session']].append(r[metric])
    diffs = [mean(g[name]) - mean(g['other']) for g in daily.values() if g[name] and g['other']]
    if len(diffs) < 2:
        return None
    rng = random.Random(7707)
    sampled = [mean(rng.choices(diffs, k=len(diffs))) for _ in range(1500)]
    return {'nDays': len(diffs), 'difference': mean(diffs), 'ci95': [quantile(sampled, .025), quantile(sampled, .975)]}


def main():
    quality = json.loads((ROOT / 'quality.json').read_text())
    btc_rows = json.loads((ROOT / 'bars/BTCUSDT.json').read_text())
    btc = btc_features(btc_rows)
    hourly = {}
    for r in aggregate(btc_rows, 12):
        if START <= r[0] < END:
            hourly[r[0]] = {'time': r[0], 'day': str(local(r[0]).date()), 'hourVN': local(r[0]).hour,
                'weekend': local(r[0]).weekday() >= 5, 'phase': phase(r[0]), 'session': session(r[0]),
                'btcPct': (r[4] / r[1] - 1) * 100, 'btcAbsPct': abs(r[4] / r[1] - 1) * 100,
                'btcRangePct': (r[2] - r[3]) / r[1] * 100, 'alts': []}
    events, trades = [], []
    for i, s in enumerate(quality['symbols'][1:], 1):
        rows = json.loads((ROOT / ('bars/' + s + '.json')).read_text())
        for r in aggregate(rows, 12):
            if r[0] in hourly:
                hourly[r[0]]['alts'].append((r[4] / r[1] - 1) * 100)
        ev, tr = events_and_trades(s, rows, btc)
        events.extend(ev)
        trades.extend(tr)
        if i % 10 == 0:
            print(f'Analysed {i}/60 symbols; impulses={len(events)}, trades={len(trades)}', flush=True)
    hours = []
    for r in hourly.values():
        vals = r.pop('alts')
        if not vals:
            continue
        r.update(altN=len(vals), altAbsPct=mean([abs(v) for v in vals]), altMeanPct=mean(vals),
                 altPumpRate=100 * sum(v >= 2 for v in vals) / len(vals),
                 altDumpRate=100 * sum(v <= -2 for v in vals) / len(vals))
        hours.append(r)
    result = {'version': VERSION, 'timeVN': ['2026-08-02', '2026-09-25'],
              'holdoutVN': ['2026-09-12', '2026-09-25'], 'quality': quality,
              'sessions': {}, 'byHour': {}, 'strategies': {}, 'impulses': {}}
    for p in ['all', 'development', 'holdout', 'weekday', 'weekend']:
        hh = [r for r in hours if p == 'all' or r['phase'] == p or (p == 'weekend' and r['weekend']) or (p == 'weekday' and not r['weekend'])]
        result['sessions'][p] = {s: hourly_summary([r for r in hh if r['session'] == s]) for s in ['06-08', '20-02', 'other']}
        result['sessions'][p]['pairedVsOther'] = {s: {m: paired_session_ci(hh, s, m) for m in ['btcAbsPct', 'altAbsPct', 'altPumpRate']} for s in ['06-08', '20-02']}
        result['byHour'][p] = {str(h): hourly_summary([r for r in hh if r['hourVN'] == h]) for h in range(24)}
    for p in ['all', 'development', 'holdout']:
        tt = [t for t in trades if p == 'all' or t['phase'] == p]
        result['strategies'][p] = {}
        for side in ['LONG', 'SHORT']:
            sided = [t for t in tt if t['side'] == side]
            result['strategies'][p][side] = {
                'baseline': summary(sided),
                'btcTrend': summary([t for t in sided if t['btcTrend']]),
                'btcTrendImpulse': summary([t for t in sided if t['btcTrend'] and t['btcImpulse']]),
                'bySessionBaseline': {s: summary([t for t in sided if t['session'] == s]) for s in ['06-08', '20-02', 'other']},
            }
            ee = [e for e in events if e['side'] == side and (p == 'all' or e['phase'] == p) and not e.get('incomplete12h')]
            result['impulses'][p + side] = {'nComplete': len(ee), 'retested': sum(e['retested'] for e in ee), 'triggered': sum(e['triggered'] for e in ee), 'invalidated': sum(e['invalidated'] for e in ee)}
    # Descriptive BTC sensitivity, same-hour only (NOT a predictive test).
    threshold = quantile([r['btcAbsPct'] for r in hours if r['phase'] == 'development'], .9)
    result['btcLargeHourThresholdPct'] = threshold
    result['btcLargeHourAssociation'] = {p: {k: hourly_summary([r for r in hours if (p == 'all' or r['phase'] == p) and (r['btcAbsPct'] >= threshold if k == 'large' else r['btcAbsPct'] < threshold)]) for k in ['large', 'normal']} for p in ['all', 'holdout']}
    for t in trades:
        assert t['entryTime'] == t['signalTime'] and t['signalTime'] > t['time']
        assert t['entryTime'] < t['exitTime'] <= t['entryTime'] + 72 * STEP
    for name, value in [('summary', result), ('hourly', hours), ('events', events), ('trades', sorted(trades, key=lambda x: x['entryTime']))]:
        (ROOT / (name + '.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'done': True, 'hours': len(hours), 'events': len(events), 'trades': len(trades), 'strategies': result['strategies']}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
