#!/usr/bin/env python3
"""Yeni bir sembolün 1 yıllık günlük kapanışlarını data/history.json'a ekler.
Kullanım: python3 add_history.py TICKER ts.txt
ts.txt: Twelve Data get_time_series çıktısı (noktalı virgüllü metin; 'datetime;open;high;low;close...' başlıklı)
ya da {"result": "..."} biçimindeki JSON."""
import json, sys, os
t, f = sys.argv[1].upper(), sys.argv[2]
raw = open(f).read().strip()
if raw.startswith('{'): raw = json.loads(raw).get('result', '')
lines = [l for l in raw.splitlines() if l.strip()]
hdr = lines[0].split(';'); ci = hdr.index('close'); di = hdr.index('datetime')
rows = sorted((l.split(';')[di][:10], round(float(l.split(';')[ci]), 2)) for l in lines[1:])
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
H = json.load(open(os.path.join(D, 'history.json')))
old = dict(H.get(t, [])); old.update(dict(rows))
H[t] = [[d, v] for d, v in sorted(old.items())][-400:]
json.dump(H, open(os.path.join(D, 'history.json'), 'w'), separators=(',', ':'))
if all(k in hdr for k in ('open', 'high', 'low')):
    OP = os.path.join(D, 'ohlc.json'); O = json.load(open(OP)) if os.path.exists(OP) else {}
    ix = {k: hdr.index(k) for k in ('open', 'high', 'low', 'close')}; vi = hdr.index('volume') if 'volume' in hdr else None
    rows2 = {}
    for l in lines[1:]:
        v = l.split(';'); d = v[di][:10]
        rows2[d] = [d] + [round(float(v[ix[k]]), 2) for k in ('open', 'high', 'low', 'close')] + [int(float(v[vi] or 0)) if vi is not None else 0]
    old2 = {r[0]: r for r in O.get(t, [])}; old2.update(rows2)
    O[t] = [old2[d] for d in sorted(old2)][-400:]
    json.dump(O, open(OP, 'w'), separators=(',', ':'))
print(f'{t}: {len(H[t])} gün')
