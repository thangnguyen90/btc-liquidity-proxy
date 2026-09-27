"""Read-only public archive collector; never calls Binance trading APIs."""
import concurrent.futures as cf
import csv
import hashlib
import http.client
import io
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1] / 'data/research/btc-session-20260926'
BASE = 'https://data.binance.vision/'
POOL = 6
TOP = 60


def save(name, value):
    p = ROOT / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf8')


def get(url):
    url = urllib.parse.quote(url, safe=':/?&=%')
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=25) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (418, 429):
                raise RuntimeError('Archive rate gate: stop collection, do not retry') from e
            if attempt == 2:
                raise
        except (OSError, TimeoutError, http.client.HTTPException):
            if attempt == 2:
                raise
        time.sleep(2 ** attempt)


def archive(symbol, interval, period):
    cadence = 'monthly' if len(period) == 7 else 'daily'
    key = f'data/futures/um/{cadence}/klines/{symbol}/{interval}/{symbol}-{interval}-{period}.zip'
    p = ROOT / 'archives' / f'{symbol}-{interval}-{period}.zip'
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.with_suffix('.missing').exists():
        return None
    if p.exists() and p.with_suffix('.sha256').exists():
        raw = p.read_bytes()
        expected = p.with_suffix('.sha256').read_text().strip()
    else:
        raw = get(BASE + key)
        if raw is None:
            p.with_suffix('.missing').write_text('HTTP 404; checked 2026-09-26')
            return None
        check = get(BASE + key + '.CHECKSUM')
        if not check:
            raise ValueError('Missing checksum: ' + key)
        expected = check.decode().split()[0]
        if hashlib.sha256(raw).hexdigest() != expected:
            raise ValueError('Checksum mismatch: ' + key)
        p.write_bytes(raw)
        p.with_suffix('.sha256').write_text(expected)
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError('Cached checksum mismatch: ' + key)
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        rows = list(csv.reader(io.StringIO(z.read(z.namelist()[0]).decode())))
    # [open time, open, high, low, close, quote volume, taker buy quote volume]
    return [[int(r[0]), *map(float, r[1:5]), float(r[7]), float(r[10])]
            for r in rows if r and r[0].isdigit()]


def symbols():
    ns = {'s': 'http://s3.amazonaws.com/doc/2006-03-01/'}
    names, marker = [], ''
    while True:
        params = {'delimiter': '/', 'prefix': 'data/futures/um/monthly/klines/'}
        if marker:
            params['marker'] = marker
        url = 'https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?' + urllib.parse.urlencode(params)
        root = ET.fromstring(get(url))
        prefixes = [p.text for p in root.findall('s:CommonPrefixes/s:Prefix', ns)]
        names += [p.rstrip('/').split('/')[-1] for p in prefixes]
        if root.findtext('s:IsTruncated', 'false', ns) != 'true':
            break
        marker = root.findtext('s:NextMarker', '', ns) or prefixes[-1]
    return sorted(n for n in set(names) if n.endswith('USDT') and '_' not in n
                  and n not in ('BTCUSDT', 'USDCUSDT', 'TUSDUSDT', 'USDPUSDT', 'FDUSDUSDT'))


def rank_one(symbol):
    rows = archive(symbol, '1d', '2026-07')
    if not rows or len(rows) < 20:
        return None
    return {'symbol': symbol, 'days': len(rows), 'meanDailyQuote': sum(r[5] for r in rows) / len(rows)}


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    universe_path = ROOT / 'universe.json'
    if universe_path.exists():
        ranks = json.loads(universe_path.read_text())
    else:
        names = symbols()
        print(f'Ranking {len(names)} symbols using July 2026 only', flush=True)
        ranks = []
        with cf.ThreadPoolExecutor(POOL) as pool:
            for i, r in enumerate(pool.map(rank_one, names), 1):
                if r:
                    ranks.append(r)
                if i % 75 == 0:
                    print(f'Ranking {i}/{len(names)}', flush=True)
        ranks.sort(key=lambda r: -r['meanDailyQuote'])
        save('universe.json', ranks)
    # Metadata only, never use today's listing status or volume for selection.
    # Keep historical symbols absent today (avoid delisting survivorship bias).
    meta_path = ROOT / 'contract-classification.json'
    if meta_path.exists():
        metadata = json.loads(meta_path.read_text())
    else:
        info = json.loads(get('https://fapi.binance.com/fapi/v1/exchangeInfo'))
        metadata = {s['symbol']: {'type': s.get('underlyingType'), 'subtypes': s.get('underlyingSubType', [])} for s in info['symbols']}
        save('contract-classification.json', metadata)
    excluded = {s for s, v in metadata.items() if v['type'] in ('EQUITY', 'COMMODITY', 'INDEX', 'FOREX') or 'TradFi' in v['subtypes']}
    # Gold-backed token is not used to estimate crypto / BTC seasonal behaviour.
    excluded.update(['PAXGUSDT', 'XAUTUSDT'])
    eligible = [r for r in ranks if r['symbol'] not in excluded and r['meanDailyQuote'] > 0]
    names = ['BTCUSDT'] + [r['symbol'] for r in eligible[:TOP]]
    save('selected-universe.json', {'selected': eligible[:TOP], 'excludedNonCrypto': sorted(excluded), 'unknownMetadataSelected': [s for s in names if s not in metadata]})
    periods = ['2026-08'] + [f'2026-09-{d:02}' for d in range(1, 26)]
    jobs = [(s, p) for s in names for p in periods]
    collected = {s: [] for s in names}
    missing = []
    print(f'Downloading {len(jobs)} archives; {len(names)} symbols; checksum verified', flush=True)
    with cf.ThreadPoolExecutor(POOL) as pool:
        futures = {pool.submit(archive, s, '5m', p): (s, p) for s, p in jobs}
        for i, f in enumerate(cf.as_completed(futures), 1):
            s, p = futures[f]
            rows = f.result()
            if rows is None:
                missing.append([s, p])
            else:
                collected[s].extend(rows)
            if i % 100 == 0:
                print(f'Archives {i}/{len(jobs)}, missing={len(missing)}', flush=True)
    quality = []
    for s, rows in collected.items():
        dedup = {r[0]: r for r in rows}
        if len(dedup) != len(rows):
            raise ValueError('Duplicate timestamps: ' + s)
        rows = sorted(rows, key=lambda r: r[0])
        invalid = [r[0] for r in rows if r[0] % 300000 or not (0 < r[3] <= min(r[1], r[4]) <= max(r[1], r[4]) <= r[2]) or r[5] < 0 or r[6] < 0 or r[6] > r[5] * 1.001]
        if invalid:
            raise ValueError(f'Bad OHLCV {s}: {invalid[:3]}')
        gaps = sum(rows[i][0] != rows[i-1][0] + 300000 for i in range(1, len(rows)))
        quality.append({'symbol': s, 'bars': len(rows), 'gaps': gaps, 'first': rows[0][0] if rows else None, 'last': rows[-1][0] if rows else None})
        save('bars/' + s + '.json', rows)
    save('quality.json', {'symbols': names, 'selection': 'Top 60 crypto alt USDT UM by July 2026 daily mean quote volume; >=20 July days; exclude TradFi and gold tokens, not current listing status', 'missingArchives': missing, 'filesRequested': len(jobs), 'sha256Verified': True, 'quality': quality})
    print(json.dumps({'done': True, 'symbols': len(names), 'bars': sum(q['bars'] for q in quality), 'missing': missing}), flush=True)


if __name__ == '__main__':
    main()
