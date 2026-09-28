#!/usr/bin/env python3
"""Fiyat pompası: Twelve Data get_quote sonuçlarını data/prices.json ve data/history.json'a işler.
Kullanım: python3 merge_quotes.py quotes.json [--usdtry 41.5]
quotes.json biçimi: {"SMH": {"open":600.1,"high":609.6,"low":598.2,"volume":4656600,"close":606.5,"change":6.0,"percent_change":1.0,"datetime":"2026-09-25",
                     "fifty_two_week_high":671.8,"fifty_two_week_low":307.1}, ...,
                     "SPY": {...}, "USDTRY": {"close":48.97,"datetime":"2026-09-28"}, "XAUUSD": {...}}
(Twelve Data'nın noktalı virgüllü CSV satırındaki alan adlarıyla aynı.)"""
import json, sys, os, datetime
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
def num(v):
    try: return float(v)
    except (TypeError, ValueError): return None
args = sys.argv[1:]
qs = json.load(open(args[0]))
usdtry = float(args[args.index('--usdtry') + 1]) if '--usdtry' in args else None
P = json.load(open(os.path.join(D, 'prices.json')))
OP = os.path.join(D, 'ohlc.json')
O = json.load(open(OP)) if os.path.exists(OP) else {}
def put_ohlc(t, q, day, px):
    o, h, l = num(q.get('open')), num(q.get('high')), num(q.get('low'))
    if not (o and h and l): return
    row = [day, round(o, 2), round(h, 2), round(l, 2), round(px, 2), int(num(q.get('volume')) or 0)]
    a = O.setdefault(t, [])
    if a and a[-1][0] == day: a[-1] = row
    elif not a or day > a[-1][0]: a.append(row)
    O[t] = a[-400:]
H = json.load(open(os.path.join(D, 'history.json')))
BENCH = {'SPY', 'USDTRY', 'XAUUSD'}  # sadece geçmişe yazılır (reel getiri ve risk için)
n = 0; days = set()
for t, q in qs.items():
    px = num(q.get('close'))
    if not px or px <= 0: continue
    day = str(q.get('datetime', ''))[:10]
    if t in BENCH and t not in P['quotes']:
        h = H.setdefault(t, [])
        v = round(px, 4 if t == 'USDTRY' else 2)
        if h and h[-1][0] == day: h[-1][1] = v
        elif not h or day > h[-1][0]: h.append([day, v])
        H[t] = h[-420:]; n += 1
        if t == 'SPY': put_ohlc(t, q, day, px)
        continue
    cur = P['quotes'].get(t, {})
    cur.update({'price': round(px, 4), 'chg': num(q.get('change')), 'pct': num(q.get('percent_change')), 'day': day})
    hi, lo = num(q.get('fifty_two_week_high')), num(q.get('fifty_two_week_low'))
    if hi: cur['hi52'] = hi
    if lo: cur['lo52'] = lo
    P['quotes'][t] = cur; n += 1; days.add(day)
    put_ohlc(t, q, day, px)
    h = H.setdefault(t, [])
    if h and h[-1][0] == day: h[-1][1] = round(px, 2)
    elif not h or day > h[-1][0]: h.append([day, round(px, 2)])
    H[t] = h[-400:]
if not n: sys.exit('hiç geçerli fiyat yok, dosyalar değişmedi')
if days: P['asOf'] = max(days)
P['source'] = 'Twelve Data'
P['updatedAt'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
if usdtry: P['usdtry'] = usdtry
json.dump(P, open(os.path.join(D, 'prices.json'), 'w'), separators=(',', ':'))
json.dump(H, open(os.path.join(D, 'history.json'), 'w'), separators=(',', ':'))
json.dump(O, open(OP, 'w'), separators=(',', ':'))
print(f'{n} fiyat işlendi, asOf={P["asOf"]}')
