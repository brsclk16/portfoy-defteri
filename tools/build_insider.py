#!/usr/bin/env python3
"""Alpha Vantage INSIDER_TRANSACTIONS ve CONGRESS_TRADES çıktılarından data/insider.json üretir.
Kullanım: python3 build_insider.py <klasör>
<klasör> içinde INSIDER_TRANSACTIONS_<T>.json ve CONGRESS_TRADES_<T>.json dosyaları (AV'nin ham JSON çıktısı).
Var olan data/insider.json'daki diğer semboller korunur."""
import json, sys, os, glob, datetime
src = sys.argv[1]
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
path = os.path.join(D, 'insider.json')
out = json.load(open(path)) if os.path.exists(path) else {'tickers': {}}
today = datetime.date.today()
cut_i = (today - datetime.timedelta(days=90)).isoformat()
cut_c = (today - datetime.timedelta(days=365)).isoformat()
def num(v):
    try: return float(v)
    except (TypeError, ValueError): return 0.0
def load(f):
    d = json.load(open(f))
    return d.get('payload', d) if isinstance(d, dict) else d
for f in glob.glob(os.path.join(src, 'INSIDER_TRANSACTIONS_*.json')):
    t = os.path.basename(f)[len('INSIDER_TRANSACTIONS_'):-5]
    rows = [r for r in load(f).get('data', []) if r.get('transaction_date', '') >= cut_i]
    # opsiyon/hak kullanımı gibi fiyatsız kayıtları ayrı say; piyasa işlemleri fiyatlı olanlar
    mk = [r for r in rows if num(r.get('share_price')) > 0 and any(k in (r.get('security_type') or '').lower() for k in ('common', 'ordinary', 'class a', 'class c'))]
    buys = [r for r in mk if r.get('acquisition_or_disposal') == 'A']
    sells = [r for r in mk if r.get('acquisition_or_disposal') == 'D']
    val = lambda rs: sum(num(r['shares']) * num(r['share_price']) for r in rs)
    people = {}
    for r in mk:
        k = r.get('executive', '')
        p = people.setdefault(k, {'name': k, 'title': r.get('executive_title', ''), 'buy': 0.0, 'sell': 0.0, 'last': ''})
        v = num(r['shares']) * num(r['share_price'])
        p['buy' if r['acquisition_or_disposal'] == 'A' else 'sell'] += v
        p['last'] = max(p['last'], r['transaction_date'])
    e = out['tickers'].setdefault(t, {})
    e['insider'] = {'window': '90g', 'buyCount': len(buys), 'sellCount': len(sells), 'buyValue': round(val(buys)),
                    'sellValue': round(val(sells)), 'people': sorted(people.values(), key=lambda p: -(p['buy'] + p['sell']))[:8],
                    'grants': len(rows) - len(mk)}
for f in glob.glob(os.path.join(src, 'CONGRESS_TRADES_*.json')):
    t = os.path.basename(f)[len('CONGRESS_TRADES_'):-5]
    tr = [r for r in load(f).get('trades', []) if (r.get('transaction_date') or '') >= cut_c and r.get('transaction_type') in ('BUY', 'SELL')]
    tr.sort(key=lambda r: r['transaction_date'], reverse=True)
    e = out['tickers'].setdefault(t, {})
    e['congress'] = {'window': '12a', 'buys': sum(r['transaction_type'] == 'BUY' for r in tr), 'sells': sum(r['transaction_type'] == 'SELL' for r in tr),
                     'trades': [{'d': r['transaction_date'], 'who': r.get('politician_canonical') or r.get('politician'), 'party': r.get('party'),
                                 'chamber': r.get('chamber'), 'type': r['transaction_type'], 'min': num(r.get('amount_min')), 'max': num(r.get('amount_max')),
                                 'owner': r.get('owner_code')} for r in tr[:12]]}
out['updatedAt'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
json.dump(out, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
print({t: (v.get('insider', {}).get('buyCount'), v.get('insider', {}).get('sellCount'), v.get('congress', {}).get('buys'), v.get('congress', {}).get('sells')) for t, v in out['tickers'].items()})
