#!/usr/bin/env python3
"""Piyasa şeridi — ücretsiz kaynaklardan data/mstrip.json (GitHub Actions'ta çalışır).

Kaynak sırası (sembol başına; ilk başarılı kaynak kullanılır):
  yahoo    Yahoo Finance grafik API'si (anahtarsız): ETF'ler, WTI (CL=F), bakır (HG=F), BIST 100 (XU100.IS), USD/TRY (TRY=X), BTC
  twelve   Twelve Data (TWELVEDATA_KEY varsa): altın spot XAU/USD için birincil, diğerleri için yedek
  binance  Binance 24 saatlik özet (anahtarsız): BTC yedeği
  tcmb     TCMB günlük kur XML'i (anahtarsız): USD/TRY son yedek (yalnızca seviye)
Kural: hiçbir kaynak değer veremezse önceki dosyadaki değer korunur ve sembol "failed" listesine yazılır.
Kullanım: python3 tools/fetch_mstrip.py [--dry]   (--dry: dosyaya yazmaz, özeti basar)
Çıktı: data/mstrip.json, tanı: data/_diag/mstrip.json. Anahtarlar hiçbir dosyaya yazılmaz."""
import datetime as dt, json, os, sys, time, traceback, urllib.parse
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_ext as fx  # get/rd/wr

TWELVE = os.environ.get('TWELVEDATA_KEY', '').strip()
BROWSER = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
           'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9'}

# anahtar → (Yahoo sembolü, Twelve Data sembolü, kaynak sırası, etiket)
QUOTES = {
    'SPY': ('SPY', 'SPY', 'yahoo twelve', None),
    'QQQ': ('QQQ', 'QQQ', 'yahoo twelve', None),
    'DIA': ('DIA', 'DIA', 'yahoo twelve', None),
    'UUP': ('UUP', 'UUP', 'yahoo twelve', None),
    'XAU': ('GC=F', 'XAU/USD', 'twelve yahoo', None),
    'WTI': ('CL=F', None, 'yahoo', 'vadeli (CL=F)'),
    'XCU': ('HG=F', None, 'yahoo', 'vadeli, USD/lb (HG=F)'),
    'BTC': ('BTC-USD', 'BTC/USD', 'yahoo binance twelve', None),
    'USDTRY': ('TRY=X', 'USD/TRY', 'yahoo twelve tcmb', None),
    'BIST': ('XU100.IS', None, 'yahoo', None),
}
SECTORS = ['XLK', 'XLF', 'XLE', 'XLV', 'XLY', 'XLP', 'XLI', 'XLB', 'XLU', 'XLRE', 'XLC', 'SMH']
SRC_NAME = {'yahoo': 'Yahoo Finance', 'twelve': 'Twelve Data', 'binance': 'Binance', 'tcmb': 'TCMB'}


def r6(x):
    return None if x is None else float(f'{x:.6g}')


def yahoo(sym):
    s = urllib.parse.quote(sym)
    j = None
    for host in ('query1', 'query2'):
        try:
            j = json.loads(fx.get(f'https://{host}.finance.yahoo.com/v8/finance/chart/{s}?range=10d&interval=1d&includePrePost=false',
                                  headers=BROWSER, tries=2, timeout=15))
            break
        except Exception:
            if host == 'query2':
                raise
    r = ((j or {}).get('chart') or {}).get('result') or []
    if not r:
        return None
    r = r[0]
    ts = r.get('timestamp') or []
    q = ((r.get('indicators') or {}).get('quote') or [{}])[0]
    cl = q.get('close') or []
    off = (r.get('meta') or {}).get('gmtoffset') or 0
    rows = [(dt.datetime.utcfromtimestamp(t + off).date().isoformat(), c) for t, c in zip(ts, cl) if c is not None]
    if len(rows) < 2:
        return None
    # Aynı güne düşen çift satırı (gün içi + kapanış) tekilleştir: son değer kalır.
    ded = {}
    for d, c in rows:
        ded[d] = c
    rows = sorted(ded.items())
    (d, px), (_, prev) = rows[-1], rows[-2]
    meta = r.get('meta') or {}
    live = meta.get('regularMarketPrice')
    lt = meta.get('regularMarketTime')
    if live and lt and dt.datetime.utcfromtimestamp(lt + off).date().isoformat() == d:
        px = live
    chg = px - prev
    return {'px': r6(px), 'chg': r6(chg), 'pct': r6(chg / prev * 100), 'd': d}


def twelve(sym):
    if not TWELVE or not sym:
        return None
    j = json.loads(fx.get(f'https://api.twelvedata.com/quote?symbol={urllib.parse.quote(sym)}&apikey={TWELVE}', tries=1, timeout=20))
    if j.get('status') == 'error' or j.get('close') is None:
        raise ValueError((j.get('message') or 'boş yanıt')[:80])
    time.sleep(8)  # ücretsiz plan: dakikada 8 istek
    return {'px': float(j['close']), 'chg': float(j['change']), 'pct': float(j['percent_change']), 'd': j['datetime'][:10]}


def binance(_):
    j = json.loads(fx.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', headers=BROWSER, tries=2, timeout=15))
    return {'px': r6(float(j['lastPrice'])), 'chg': r6(float(j['priceChange'])), 'pct': r6(float(j['priceChangePercent'])),
            'd': dt.datetime.utcfromtimestamp(int(j['closeTime']) / 1000).date().isoformat()}


def tcmb(_):
    txt = fx.get('https://www.tcmb.gov.tr/kurlar/today.xml', headers=BROWSER, tries=2, timeout=15)
    root = ET.fromstring(txt)
    for c in root.iter('Currency'):
        if c.get('CurrencyCode') == 'USD':
            v = c.findtext('ForexSelling') or c.findtext('ForexBuying')
            d = root.get('Date')  # AA/GG/YYYY
            iso = dt.datetime.strptime(d, '%m/%d/%Y').date().isoformat() if d else dt.date.today().isoformat()
            return {'px': float(v), 'chg': None, 'pct': None, 'd': iso}
    return None


FN = {'yahoo': lambda k, y, t: yahoo(y), 'twelve': lambda k, y, t: twelve(t), 'binance': lambda k, y, t: binance(k),
      'tcmb': lambda k, y, t: tcmb(k)}


def fetch(key, ysym, tsym, order, diag):
    for src in order.split():
        try:
            v = FN[src](key, ysym, tsym)
            if v and v.get('px'):
                v['src'] = SRC_NAME[src]
                return v
            diag.setdefault(key, []).append(f'{src}: boş')
        except Exception as e:
            diag.setdefault(key, []).append(f'{src}: {type(e).__name__} {str(e)[:90]}')
    return None


def main():
    dry = '--dry' in sys.argv
    t0 = time.time()
    old = fx.rd('mstrip.json', {}) or {}
    quotes, sectors = dict(old.get('quotes') or {}), dict(old.get('sectors') or {})
    failed, errs, used = [], {}, {}
    for k, (y, t, order, label) in QUOTES.items():
        v = fetch(k, y, t, order, errs)
        if v:
            if k == 'XAU' and v['src'] == 'Yahoo Finance':
                label = 'vadeli (GC=F)'
            if label:
                v['src'] = f"{v['src']} · {label}"
            quotes[k] = v
            used[k] = v['src']
        else:
            failed.append(k)
    for k in SECTORS:
        v = fetch(k, k, k, 'yahoo twelve', errs)
        if v:
            sectors[k] = {'px': v['px'], 'pct': v['pct'], 'd': v['d']}
            used[k] = v['src']
        else:
            failed.append(k)
    out = {'updatedAt': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
           'source': 'Yahoo Finance · Twelve Data · Binance · TCMB (ücretsiz kaynaklar)',
           'quotes': quotes, 'sectors': sectors, 'failed': failed}
    diag = {'at': out['updatedAt'], 'sec': round(time.time() - t0, 1), 'ok': len(used), 'failed': failed, 'used': used, 'errs': errs}
    print(json.dumps(diag, ensure_ascii=False, indent=1))
    if dry:
        print(json.dumps(out, ensure_ascii=False)[:3000])
        return
    if len(used) == 0:
        print('hiçbir sembol alınamadı; dosya değiştirilmedi')
        fx.wr('_diag/mstrip.json', diag)
        return
    fx.wr('mstrip.json', out)
    fx.wr('_diag/mstrip.json', diag)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
