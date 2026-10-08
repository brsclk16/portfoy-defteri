#!/usr/bin/env python3
"""Fiyat pompası (GitHub Actions; Claude görevinin yerine): Yahoo Finance grafik API'sinden (anahtarsız) portföy ve izleme listesi
fiyatlarını alır, tools/merge_quotes.py ile data/prices.json, history.json ve ohlc.json'a işler; günde bir kez (ya da --markets ile)
FRED (anahtarsız CSV: DGS3MO, DGS2, DGS10, VIXCLS) ve Yahoo UUP ile data/markets.json'u günceller.
Kullanım: python3 tools/fetch_prices.py [--markets] [--dry]"""
import csv, datetime as dt, io, json, os, subprocess, sys, tempfile, time, urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_ext as fx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BROWSER = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
           'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9'}
ALIAS = {'NOVO.B': 'NVO'}
DRY = '--dry' in sys.argv


def ysym(t):
    if t.endswith(':BIST'):
        return t.split(':')[0] + '.IS'
    return ALIAS.get(t, t).replace('.', '-')


def chart(sym, rng='1mo'):
    s = urllib.parse.quote(sym)
    last = None
    for host in ('query1', 'query2'):
        try:
            j = json.loads(fx.get(f'https://{host}.finance.yahoo.com/v8/finance/chart/{s}?range={rng}&interval=1d&includePrePost=false',
                                  headers=BROWSER, tries=2, timeout=15))
            r = ((j.get('chart') or {}).get('result') or [None])[0]
            if r:
                return r
        except Exception as e:
            last = e
    raise RuntimeError(f'{sym}: {last}')


def quote(sym):
    r = chart(sym)
    meta = r.get('meta') or {}
    off = meta.get('gmtoffset') or 0
    q = ((r.get('indicators') or {}).get('quote') or [{}])[0]
    rows = {}
    for i, t in enumerate(r.get('timestamp') or []):
        c = (q.get('close') or [None])[i]
        if c is None:
            continue
        d = dt.datetime.utcfromtimestamp(t + off).date().isoformat()
        rows[d] = {'open': q['open'][i], 'high': q['high'][i], 'low': q['low'][i], 'close': c, 'volume': (q.get('volume') or [0])[i] or 0}
    days = sorted(rows)
    if len(days) < 2:
        raise RuntimeError(f'{sym}: yetersiz veri')
    d, prev = days[-1], rows[days[-2]]['close']
    cur = dict(rows[d])
    live, lt = meta.get('regularMarketPrice'), meta.get('regularMarketTime')
    if live and lt and dt.datetime.utcfromtimestamp(lt + off).date().isoformat() == d:
        cur['close'] = live
    cur.update({'datetime': d, 'change': cur['close'] - prev, 'percent_change': (cur['close'] / prev - 1) * 100})
    if meta.get('fiftyTwoWeekHigh'):
        cur['fifty_two_week_high'] = meta['fiftyTwoWeekHigh']
    if meta.get('fiftyTwoWeekLow'):
        cur['fifty_two_week_low'] = meta['fiftyTwoWeekLow']
    return cur


def prices(diag):
    P = fx.rd('prices.json', {}) or {}
    syms = list((P.get('quotes') or {}).keys())
    out, errs = {}, {}
    for t in syms:
        try:
            out[t] = quote(ysym(t))
        except Exception as e:
            errs[t] = str(e)[:120]
        time.sleep(0.25)
    for key, cands in (('SPY', ['SPY']), ('USDTRY', ['TRY=X']), ('XAUUSD', ['XAUUSD=X', 'GC=F'])):
        for c in cands:
            try:
                out[key] = quote(c)
                out[key]['src'] = c
                break
            except Exception as e:
                errs[f'{key}<{c}>'] = str(e)[:120]
    diag.update({'ok': len(out), 'errs': errs})
    if not out:
        raise RuntimeError('hiç fiyat alınamadı')
    if DRY:
        diag['sample'] = {k: out[k] for k in list(out)[:3]}
        return
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
        json.dump(out, f)
    cmd = [sys.executable, os.path.join(ROOT, 'tools', 'merge_quotes.py'), f.name, '--source', 'Yahoo Finance']
    if 'USDTRY' in out:
        cmd += ['--usdtry', str(round(out['USDTRY']['close'], 4))]
    r = subprocess.run(cmd, capture_output=True, text=True)
    diag['merge'] = (r.stdout + r.stderr)[-300:]
    if r.returncode:
        raise RuntimeError(diag['merge'])


def markets(diag):
    tr = {}
    for sid, k in (('DGS3MO', 'month3'), ('DGS2', 'year2'), ('DGS10', 'year10')):
        txt = fx.get(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd={(dt.date.today() - dt.timedelta(days=40)).isoformat()}')
        for d, v in list(csv.reader(io.StringIO(txt)))[1:]:
            if v not in ('.', ''):
                tr.setdefault(d, {'date': d})[k] = float(v)
    vix = []
    txt = fx.get(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS&cosd={(dt.date.today() - dt.timedelta(days=40)).isoformat()}')
    for d, v in list(csv.reader(io.StringIO(txt)))[1:]:
        if v not in ('.', ''):
            vix.append({'date': d, 'close': float(v)})
    u = quote('UUP')
    diag['markets'] = {'tr': len(tr), 'vix': len(vix), 'uup': u['close']}
    if DRY:
        return
    tmp = tempfile.mkdtemp()
    json.dump(list(tr.values()), open(os.path.join(tmp, 'tr.json'), 'w'))
    json.dump(vix, open(os.path.join(tmp, 'vix.json'), 'w'))
    json.dump({'close': u['close'], 'datetime': u['datetime']}, open(os.path.join(tmp, 'uup.json'), 'w'))
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'build_markets.py'), '--tr', os.path.join(tmp, 'tr.json'),
                        '--vix', os.path.join(tmp, 'vix.json'), '--uup', os.path.join(tmp, 'uup.json')], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError((r.stdout + r.stderr)[-300:])


if __name__ == '__main__':
    diag = {'at': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
    rc = 0
    try:
        prices(diag)
    except Exception as e:
        diag['fatal'] = str(e)[:300]
        rc = 1
    if '--markets' in sys.argv:
        try:
            markets(diag)
        except Exception as e:
            diag['markets_err'] = str(e)[:300]
    print(json.dumps(diag, ensure_ascii=False, indent=1, default=str)[:3000])
    if not DRY:
        fx.wr('_diag/prices.json', diag)
    sys.exit(rc)
