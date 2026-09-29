#!/usr/bin/env python3
"""Geçmiş bilanço tarihlerinden fiyat tepkilerini hesaplayıp data/earnhist.json'a yazar.
Kullanım: python3 tools/build_earnhist.py events.json [ts_dir]
 events.json: [{"t":"NVDA","name":"NVIDIA","dt":"2026-08-26T21:00:00Z","q":"Q2 2027"}, ...]  (Bigdata.com corporate_calendar
   earnings-call satırları; "Post Call" satırlarını koyma). İleri tarihli satırlar "next" olarak saklanır.
 ts_dir: Twelve Data get_time_series çıktıları <ts_dir>/ts_<T>.txt (history/ohlc'de olmayan şirketler için). Birden fazla
   çıktı art arda eklenebilir (her birinin başlık satırıyla). Varsayılan /tmp.
Tepki günü: çağrı UTC 20:00 ve sonrası (ABD kapanış sonrası) → ertesi işlem günü; öncesi → aynı gün. Hareket: tepki günü kapanışı ÷ önceki kapanış − 1.
Mevcut earnhist.json ile birleştirir (aynı şirket-tarih tekrar yazılmaz); şirket başına son 12 bilanço tutulur."""
import json, sys, os, datetime as dt
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); D = os.path.join(ROOT, 'data')
evs = json.load(open(sys.argv[1])); tsd = sys.argv[2] if len(sys.argv) > 2 else '/tmp'
H = json.load(open(os.path.join(D, 'history.json'))); O = json.load(open(os.path.join(D, 'ohlc.json')))
ALIAS = {'NOVO.B': 'NVO'}
def series(t):
    s = {}
    for r in O.get(t, []): s[r[0]] = r[4]
    for d, v in H.get(t, []): s.setdefault(d, v)
    f = os.path.join(tsd, f'ts_{ALIAS.get(t, t)}.txt')
    if os.path.exists(f):
        raw = open(f).read().strip()
        if raw.startswith('{'): raw = json.loads(raw).get('result', '')
        ci = di = None
        for l in raw.replace('\\n', '\n').splitlines():
            v = [x.strip() for x in l.strip().strip('"{}').split(';')]
            if 'datetime' in v and 'close' in v: ci, di = v.index('close'), v.index('datetime'); continue
            if ci is None or len(v) <= max(ci, di): continue
            try: s.setdefault(v[di][:10], float(v[ci]))
            except ValueError: pass
    return sorted(s.items())
P = os.path.join(D, 'earnhist.json')
E = json.load(open(P)) if os.path.exists(P) else {'data': {}}
now = dt.datetime.now(dt.timezone.utc)
for t in sorted({e['t'] for e in evs}):
    S = series(t); dates = [d for d, _ in S]; px = dict(S)
    cur = E['data'].get(t, {'hist': []}); have = {h['d'] for h in cur['hist']}
    for e in [x for x in evs if x['t'] == t]:
        if e.get('name'): cur['name'] = e['name']
        when = dt.datetime.fromisoformat(e['dt'].replace('Z', '+00:00'))
        d = when.date().isoformat()
        if when > now:
            if not cur.get('next') or d < cur['next']['d'] or cur['next']['d'] < now.date().isoformat(): cur['next'] = {'d': d, 'dt': e['dt'], 'q': e.get('q')}
            continue
        if d in have or not dates: continue
        amc = when.hour >= 20
        after = [x for x in dates if (x > d if amc else x >= d)]
        if not after: continue
        rd = after[0]; i = dates.index(rd)
        if i == 0: continue
        prev = dates[i - 1]; mv = (px[rd] / px[prev] - 1) * 100
        k5 = min(len(dates) - 1, i + 4); mv5 = (px[dates[k5]] / px[prev] - 1) * 100 if k5 > i else None
        cur['hist'].append({'d': d, 'q': e.get('q'), 'when': 'amc' if amc else 'bmo', 'rd': rd, 'prev': prev, 'move': round(mv, 2), 'move5': None if mv5 is None else round(mv5, 2)})
        have.add(d)
    if cur.get('next') and cur['next']['d'] < now.date().isoformat(): cur.pop('next')
    cur['hist'] = sorted(cur['hist'], key=lambda h: h['d'], reverse=True)[:12]
    E['data'][t] = cur
E['updatedAt'] = now.strftime('%Y-%m-%dT%H:%M:%SZ'); E['source'] = 'Bigdata.com (bilanço tarihleri) · Twelve Data (fiyat)'
json.dump(E, open(P, 'w'), ensure_ascii=False, separators=(',', ':'))
for t, v in sorted(E['data'].items()):
    m = [abs(h['move']) for h in v['hist'][:8]]
    print(t, len(v['hist']), 'ort.|hareket|', round(sum(m) / len(m), 1) if m else None, 'sıradaki', (v.get('next') or {}).get('d'))
