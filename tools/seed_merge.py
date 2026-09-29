#!/usr/bin/env python3
"""Siteden eklenen sembolün tarayıcıda Twelve Data'dan çekilip data/seed/<T>.json olarak yazılan ham fiyat geçmişini
history.json (kapanış, son 400 gün), ohlc.json (son 800 gün), monthly.json (aylık kapanış) ve prices.json'a işler.
Kullanım: python3 tools/seed_merge.py [TICKER ...]   (argüman yoksa data/seed/ altındaki tüm dosyalar)
Seed biçimi: {"t":"NVDA","daily":[{"datetime","open","high","low","close","volume"},...],"monthly":[{"datetime","close"},...],"quote":{Twelve Data quote alanları}}
İşlenen seed dosyasının yolu çıktıda yazılır; silmek görevin işidir (git rm)."""
import json, sys, os, glob, datetime as dt
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); D = os.path.join(ROOT, 'data')
def rd(n, d): p = os.path.join(D, n); return json.load(open(p)) if os.path.exists(p) else d
def wr(n, o): json.dump(o, open(os.path.join(D, n), 'w'), ensure_ascii=False, separators=(',', ':'))
files = [os.path.join(D, 'seed', f'{t.upper().replace(":", "_")}.json') for t in sys.argv[1:]] or sorted(glob.glob(os.path.join(D, 'seed', '*.json')))
H, O, M, P = rd('history.json', {}), rd('ohlc.json', {}), rd('monthly.json', {'series': {}}), rd('prices.json', {'quotes': {}})
f2 = lambda x: round(float(x), 4 if float(x) < 10 else 2)
for f in files:
    if not os.path.exists(f): print('yok:', f); continue
    s = json.load(open(f)); t = s['t'].upper(); daily = [r for r in s.get('daily') or [] if r.get('close') not in (None, '')]
    if daily:
        rows = sorted({r['datetime'][:10]: r for r in daily}.values(), key=lambda r: r['datetime'])
        old = dict(H.get(t, [])); old.update({r['datetime'][:10]: f2(r['close']) for r in rows}); H[t] = [[d, v] for d, v in sorted(old.items())][-400:]
        oo = {r[0]: r for r in O.get(t, [])}
        for r in rows:
            try: oo[r['datetime'][:10]] = [r['datetime'][:10], f2(r['open']), f2(r['high']), f2(r['low']), f2(r['close']), int(float(r.get('volume') or 0))]
            except (TypeError, ValueError, KeyError): pass
        O[t] = [oo[d] for d in sorted(oo)][-800:]
    mon = s.get('monthly') or []
    if mon:
        mm = dict(M['series'].get(t, [])); mm.update({r['datetime'][:7]: f2(r['close']) for r in mon if r.get('close') not in (None, '')})
        M['series'][t] = [[k, v] for k, v in sorted(mm.items())]
    elif daily:  # aylık yoksa günlükten ay sonu kapanışı
        mm = dict(M['series'].get(t, []))
        for d, v in H[t]: mm[d[:7]] = v
        M['series'][t] = [[k, v] for k, v in sorted(mm.items())]
    q = s.get('quote') or {}
    if q.get('close'):
        fw = q.get('fifty_two_week') or {}
        P['quotes'][t] = {'price': float(q['close']), 'chg': float(q.get('change') or 0), 'pct': float(q.get('percent_change') or 0),
                          'day': (q.get('datetime') or '')[:10], 'hi52': float(fw.get('high') or q.get('fifty_two_week_high') or 0) or None,
                          'lo52': float(fw.get('low') or q.get('fifty_two_week_low') or 0) or None}
    elif t in H and t not in P['quotes']:
        d, v = H[t][-1]; P['quotes'][t] = {'price': v, 'day': d}
    print(f'{t}: {len(H.get(t, []))} gün kapanış, {len(O.get(t, []))} gün OHLC, {len(M["series"].get(t, []))} ay · işlendi {os.path.relpath(f, ROOT)}')
M['updatedAt'] = dt.date.today().isoformat()
wr('history.json', H); wr('ohlc.json', O); wr('monthly.json', M); wr('prices.json', P)
