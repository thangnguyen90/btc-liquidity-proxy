"""Post-run audit: native 1h archives vs aggregation; prefix invariance on actual bars."""
import importlib.util
import json
from pathlib import Path


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    a = module('analysis', 'research-btc-session-analysis.py')
    d = module('data', 'research-btc-session-data.py')
    root = a.ROOT
    hours = json.loads((root / 'hourly.json').read_text())
    assert len(hours) == 55 * 24
    assert {h['altN'] for h in hours} == {60}
    btc = json.loads((root / 'bars/BTCUSDT.json').read_text())
    checks = []
    for symbol in ['BTCUSDT', 'ETHUSDT']:
        rows = json.loads((root / f'bars/{symbol}.json').read_text())
        native = d.archive(symbol, '1h', '2026-08')
        rebuilt = {r[0]: r for r in a.aggregate(rows, 12)}
        assert len(native) == 31 * 24
        for r in native:
            x = rebuilt[r[0]]
            assert all(abs(v-w) <= max(abs(v)*1e-9, 1e-8) for v, w in zip(r[1:], x[1:])), (symbol, r[0], r, x)
        checks.append({'test': 'native1hMatchesAggregated5m', 'symbol': symbol, 'bars': len(native)})
    cutoff = a.stamp('2026-09-08')
    for symbol in ['ARBUSDT', 'UNIUSDT', 'PUMPUSDT']:
        rows = json.loads((root / f'bars/{symbol}.json').read_text())
        short = [r for r in rows if r[0] < cutoff]
        _, fulltrades = a.events_and_trades(symbol, rows, a.btc_features(btc))
        _, prefixtrades = a.events_and_trades(symbol, short, a.btc_features([r for r in btc if r[0] < cutoff]))
        before = lambda tt: [{k: t[k] for k in ('signalTime', 'entryTime', 'exitTime', 'entry', 'stop', 'target', 'netPct')} for t in tt if t['signalTime'] <= cutoff - 72*a.STEP]
        assert before(fulltrades), ('Prefix test must have actual trades', symbol)
        assert before(fulltrades) == before(prefixtrades), symbol
        checks.append({'test': 'futureAppendDoesNotChangePastEntries', 'symbol': symbol, 'trades': len(before(fulltrades))})
    report = {'passed': True, 'marketHours': len(hours), 'coinsPerHour': 60, 'checks': checks}
    (root / 'audit.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
