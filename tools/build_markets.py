#!/usr/bin/env python3
"""Makro serilerini data/markets.json'a işler (mevcut verinin üstüne ekler).
Kullanım: python3 build_markets.py [--vix vix.json] [--tr tr1.json tr2.json ...] [--uup uup.txt]
vix.json : FMP indexes index-historical-price-eod-light (^VIX) çıktısı  [{"date","price"}...]
tr*.json : FMP economics treasury-rates çıktısı  [{"date","month3","year2","year10",...}]
uup.txt  : Twelve Data get_time_series (UUP, 1day) çıktısı ya da get_quote JSON ({"close","datetime"})."""
import json, sys, os, datetime
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data'); P = os.path.join(D, 'markets.json')
M = json.load(open(P)) if os.path.exists(P) else {'series': {}}
S = M.setdefault('series', {})
def put(k, rows):
    cur = dict(S.get(k, [])); cur.update({d: v for d, v in rows if v is not None}); S[k] = [[d, cur[d]] for d in sorted(cur)][-800:]
def load(f):
    r = open(f).read().strip()
    try: j = json.loads(r)
    except Exception: return r
    return j
args = sys.argv[1:]; mode = None
for a in args:
    if a.startswith('--'): mode = a[2:]; continue
    j = load(a)
    if mode == 'vix': put('VIX', [(x['date'], x.get('price') or x.get('close')) for x in j])
    elif mode == 'tr':
        put('US3M', [(x['date'], x.get('month3')) for x in j]); put('US2Y', [(x['date'], x.get('year2')) for x in j]); put('US10Y', [(x['date'], x.get('year10')) for x in j])
    elif mode == 'uup':
        if isinstance(j, dict) and 'result' in j: j = j['result']
        if isinstance(j, dict) and 'close' in j: put('UUP', [(str(j['datetime'])[:10], round(float(j['close']), 3))])
        else:
            L = [l for l in j.splitlines() if l.strip()]; h = L[0].split(';'); di, ci = h.index('datetime'), h.index('close')
            put('UUP', [(l.split(';')[di][:10], round(float(l.split(';')[ci]), 3)) for l in L[1:]])
M['updatedAt'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
json.dump(M, open(P, 'w'), separators=(',', ':'))
print({k: (len(v), v[-1]) for k, v in S.items()})
