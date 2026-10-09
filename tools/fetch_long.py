#!/usr/bin/env python3
"""Portföy Defteri — uzun fiyat geçmişi (strateji doğrulama için).
Yahoo Finance grafik API'si (anahtarsız), temettü ve bölünmeye göre düzeltilmiş günlük kapanışlar, 2010'dan bugüne.
Evren: portföy + izleme listesi + geniş varlık sınıfı ETF'leri (karşılaştırma ve savunma varlıkları).
Çıktı: data/long_px.json {updatedAt, src, dates[], px{T:[kapanış|null]}} — tarihler SPY takvimine hizalı."""
import datetime as dt, json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'}
EXTRA = ['SPY', 'QQQ', 'IWM', 'EFA', 'EEM', 'TLT', 'IEF', 'SHY', 'GLD', 'DBC', 'XLE', 'XLK', 'XLV', 'XLU', 'XLP', 'XLF', 'XLI', 'SMH', 'SOXX', 'XBI', 'IAU', 'SLV', 'COPX']


def rd(n, d=None):
    try:
        return json.load(open(os.path.join(DATA, n), encoding='utf-8'))
    except Exception:
        return d


def chart(sym):
    s = urllib.parse.quote(sym)
    p1 = int(dt.datetime(2010, 1, 1).timestamp())
    p2 = int(time.time()) + 86400
    last = None
    for host in ('query1', 'query2'):
        for _ in range(2):
            try:
                req = urllib.request.Request(f'https://{host}.finance.yahoo.com/v8/finance/chart/{s}?period1={p1}&period2={p2}&interval=1d&events=div%2Csplit&includeAdjustedClose=true', headers=UA)
                j = json.loads(urllib.request.urlopen(req, timeout=30).read())
                r = j['chart']['result'][0]
                ts = r['timestamp']
                adj = r['indicators'].get('adjclose', [{}])[0].get('adjclose') or r['indicators']['quote'][0]['close']
                off = r.get('meta', {}).get('gmtoffset') or 0
                out = {}
                for t, c in zip(ts, adj):
                    if c:
                        out[dt.datetime.utcfromtimestamp(t + off).date().isoformat()] = round(c, 4)
                return out
            except Exception as e:
                last = e
                time.sleep(2)
    raise last


def main():
    I = (rd('portfolio.json', {}) or {}).get('instruments', {})
    W = [(w.get('t') if isinstance(w, dict) else w) for w in (rd('watchlist.json', {}) or {}).get('tickers', [])]
    syms = []
    for t in list(I) + W + EXTRA:
        t = {'NOVO.B': 'NVO'}.get(t, t)
        if t and ':' not in t and t not in syms:
            syms.append(t)
    got, errs = {}, {}
    for s in syms:
        try:
            got[s] = chart(s)
        except Exception as e:
            errs[s] = str(e)[:100]
        time.sleep(0.6)
    if 'SPY' not in got:
        raise SystemExit('SPY alınamadı: ' + json.dumps(errs))
    dates = sorted(got['SPY'])
    px = {s: [got[s].get(d) for d in dates] for s in got}
    json.dump({'updatedAt': dt.datetime.utcnow().isoformat() + 'Z', 'src': 'Yahoo Finance (düzeltilmiş kapanış)', 'dates': dates, 'px': px},
              open(os.path.join(DATA, 'long_px.json'), 'w'), separators=(',', ':'))
    json.dump({'ok': True, 'at': dt.datetime.utcnow().isoformat() + 'Z', 'info': {'symbols': len(got), 'days': len(dates), 'from': dates[0], 'errs': errs}},
              open(os.path.join(DATA, '_diag/long.json'), 'w'), ensure_ascii=False)
    print('OK', len(got), 'sembol', len(dates), 'gün', dates[0], errs)


if __name__ == '__main__':
    main()
