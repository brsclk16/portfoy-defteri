#!/usr/bin/env python3
"""Ücretsiz içgörü verisi (GitHub Actions'ta çalışır) — Bigdata.com'a bağımlı dosyalar için yedek/birincil kaynak.
--probe: kaynakların ham yanıtlarından örnek basar (şema incelemesi için)."""
import http.cookiejar, json, os, sys, time, urllib.parse, urllib.request

FINNHUB = os.environ.get('FINNHUB_KEY', '').strip()
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
NASDAQ_H = {'User-Agent': UA, 'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://www.nasdaq.com', 'Referer': 'https://www.nasdaq.com/'}
CJ = http.cookiejar.CookieJar()
OP = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CJ))


def get(url, headers=None, timeout=20):
    h = {'User-Agent': UA, 'Accept': 'application/json, text/plain, */*'}
    h.update(headers or {})
    with OP.open(urllib.request.Request(url, headers=h), timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')


_CRUMB = [None]


def yahoo_crumb():
    if _CRUMB[0] is None:
        try:
            get('https://fc.yahoo.com', timeout=15)
        except Exception:
            pass  # 404 döner ama çerezi ayarlar
        _CRUMB[0] = get('https://query1.finance.yahoo.com/v1/test/getcrumb', timeout=15).strip()
    return _CRUMB[0]


def yahoo_qs(sym, modules):
    c = urllib.parse.quote(yahoo_crumb())
    u = f'https://query2.finance.yahoo.com/v10/finance/quoteSummary/{urllib.parse.quote(sym)}?modules={",".join(modules)}&crumb={c}'
    return json.loads(get(u))['quoteSummary']['result'][0]


def probe():
    def show(name, fn):
        try:
            s = fn()
            if not isinstance(s, str):
                s = json.dumps(s, ensure_ascii=False)
            print(f'\n### {name} ({len(s)})\n{s[:2500]}')
        except Exception as e:
            print(f'\n### {name} HATA {type(e).__name__}: {str(e)[:300]}')
    for p in ['analyst/AMD/targetprice', 'analyst/AMD/earnings-forecast', 'company/AMD/earnings-surprise',
              'analyst/AMD/ratings', 'analyst/AMD/earnings-date', 'quote/AMD/dividends?assetclass=stocks',
              'quote/SMH/dividends?assetclass=etf', 'company/AMD/institutional-holdings?limit=15&type=TOTAL&sortColumn=marketValue',
              'company/AMD/insider-trades?limit=10&type=ALL']:
        show('nasdaq ' + p, lambda p=p: get('https://api.nasdaq.com/api/' + p, NASDAQ_H))
    show('yahoo crumb', yahoo_crumb)
    show('yahoo AMD', lambda: yahoo_qs('AMD', ['financialData', 'recommendationTrend', 'upgradeDowngradeHistory', 'earningsTrend',
                                              'earningsHistory', 'calendarEvents', 'summaryDetail', 'defaultKeyStatistics']))
    show('yahoo SMH topHoldings', lambda: yahoo_qs('SMH', ['topHoldings', 'summaryDetail']))
    if FINNHUB:
        for p in ['calendar/earnings?symbol=AMD&from=2025-01-01&to=2026-12-31', 'stock/earnings?symbol=AMD',
                  'stock/recommendation?symbol=AMD', 'stock/price-target?symbol=AMD', 'stock/upgrade-downgrade?symbol=AMD',
                  'stock/peers?symbol=AMD', 'stock/insider-transactions?symbol=AMD']:
            show('finnhub ' + p.split('?')[0], lambda p=p: get(f'https://finnhub.io/api/v1/{p}&token={FINNHUB}'))
    else:
        print('FINNHUB_KEY yok')


if __name__ == '__main__':
    if '--probe' in sys.argv:
        probe()
